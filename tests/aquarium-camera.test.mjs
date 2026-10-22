import test from "node:test";
import assert from "node:assert/strict";
import { PerspectiveCamera, Plane, Raycaster, Spherical, Vector2, Vector3 } from "three";
import { cameraAnchorForViewer, cameraMaxDistance } from "../src/aquarium-camera.ts";
import { GALLERY_FLOOR, TANK_WIDTH } from "../src/aquarium-layout.ts";

test("近景随玩家平移，宽画幅拉远后限制镜头至水箱中央", () => {
  const camera = new PerspectiveCamera(35, 16 / 9, .1, 120);
  camera.position.set(0, 4.4, 15.5);
  assert.equal(cameraAnchorForViewer(4, camera), 4);
  const edge = cameraAnchorForViewer(14, camera);
  assert.ok(edge > 4 && edge < 10);
  assert.equal(cameraAnchorForViewer(-14, camera), -edge);
  camera.aspect = 2.4;
  camera.position.z = cameraMaxDistance(camera) - 2;
  assert.equal(cameraAnchorForViewer(14, camera), 0);
});

test("窄屏保留局部跟随，镜头计算不改变玩家或摄像机位姿", () => {
  const camera = new PerspectiveCamera(35, .6, .1, 120);
  camera.position.set(3, 4.4, 18);
  const before = camera.position.clone();
  assert.equal(cameraAnchorForViewer(7, camera), 7);
  assert.ok(cameraAnchorForViewer(14, camera) < 14);
  assert.deepEqual(camera.position, before);
});

test("拉远可观察两侧墙壁与过道，窄屏不再无限后退", () => {
  for (const aspect of [5, 3.6, 2.4, 16 / 9, 1, .6, .5, .4, .2]) {
    const camera = new PerspectiveCamera(35, aspect, .1, 120);
    const distance = cameraMaxDistance(camera);
    const width = 2 * Math.tan(camera.fov * Math.PI / 360) * distance * aspect;
    assert.ok(distance <= 28.5, `${aspect} 比例下限制后退距离`);
    assert.ok(width <= GALLERY_FLOOR.width - 2 + 1e-10, `${aspect} 比例下保留地板宽度余量`);
    if (aspect >= 16 / 9) assert.ok(width > TANK_WIDTH, `${aspect} 比例下能看见两侧过道`);
  }
});

test("最远视角在旋转、俯仰及近景模式下均不露出 Z 轴地板前缘", () => {
  const plane = new Plane(new Vector3(0, 1, 0), -GALLERY_FLOOR.y);
  const frontEdge = GALLERY_FLOOR.z + GALLERY_FLOOR.depth / 2;
  const raycaster = new Raycaster();
  const hit = new Vector3();
  for (const aspect of [.2, .4, .6, 1, 16 / 9, 2.4, 3.6, 5]) {
    const camera = new PerspectiveCamera(35, aspect, .1, 120);
    const distance = cameraMaxDistance(camera);
    for (const height of [3.25, 3.5]) {
      const target = new Vector3(0, height, -2);
      for (let pitch = 0; pitch <= 16; pitch++) {
        for (let yaw = 0; yaw <= 32; yaw++) {
          camera.position.setFromSpherical(new Spherical(distance,
            Math.PI * (.44 + .08 * pitch / 16), -.25 + .5 * yaw / 32)).add(target);
          camera.lookAt(target);
          camera.updateMatrixWorld();
          for (const x of [-1, 1]) {
            raycaster.setFromCamera(new Vector2(x, -1), camera);
            assert.ok(raycaster.ray.intersectPlane(plane, hit), "画面底角应落在地板上");
            assert.ok(hit.z < frontEdge - .5, `${aspect} 比例下应保留至少半米地板余量`);
          }
        }
      }
    }
  }
});

test("窄屏拉到最远仍可左右跟随，不为全缸视野无限后退", () => {
  const camera = new PerspectiveCamera(35, .4, .1, 120);
  camera.position.z = cameraMaxDistance(camera) - 2;
  assert.equal(cameraAnchorForViewer(7, camera), 7);
});
