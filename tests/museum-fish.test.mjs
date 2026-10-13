import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MUSEUM_SPECIES, createMuseumFish, normalizeFish } from '../src/museum-fish.ts';
import { createMuseumVisitor } from '../src/museum-visitor.ts';
import { demoSnapshot } from '../src/demo.ts';
import { speciesForSession } from '../src/sessions.ts';

// Node 验证原版网格、蒙皮和骨骼；真实纹理与透明效果在浏览器中验证。
const loader = new GLTFLoader().register(() => ({
  name: 'node_geometry_validation',
  loadTexture() { return Promise.resolve(new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1)); },
}));
async function loadModel(path) {
  const data = await readFile(new URL(`../public/models/acnh/${path}.glb`, import.meta.url));
  const json = JSON.parse(data.subarray(20, 20 + data.readUInt32LE(12)).toString());
  for (const image of json.images ?? []) {
    assert.equal(image.mimeType, 'image/png');
    assert.equal(typeof image.bufferView, 'number', '贴图应嵌入 GLB，离线也可展示');
  }
  const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  return (await loader.parseAsync(buffer, '')).scene;
}
const templates = new Map();
for (const [id, species] of Object.entries(MUSEUM_SPECIES)) {
  templates.set(id, normalizeFish(await loadModel(`fish/${species.model}`), species.length));
}
function pose(model) {
  const result = [];
  model.group.traverse(object => { if (object instanceof THREE.Bone) result.push(...object.quaternion.toArray()); });
  return result;
}
const maximumChange = (a, b) => Math.max(...a.map((value, index) => Math.abs(value - b[index])));
function maximumPoseAngle(a, b) {
  let maximum = 0;
  for (let index = 0; index < a.length; index += 4) {
    maximum = Math.max(maximum, new THREE.Quaternion().fromArray(a, index).angleTo(new THREE.Quaternion().fromArray(b, index)));
  }
  return maximum;
}

test('演示覆盖十种原版鱼，会话切换阶段仍保持同一鱼种', () => {
  const initial = demoSnapshot(0).sessions;
  assert.equal(new Set(initial.map(session => speciesForSession(session.id))).size, templates.size);
  const identities = new Map(initial.map(session => [session.id, speciesForSession(session.id)]));
  for (const tick of [7, 18, 35]) for (const session of demoSnapshot(tick).sessions) {
    assert.equal(speciesForSession(session.id), identities.get(session.id));
  }
});

test('十种原版 GLB 包含蒙皮和贴图，归一尺寸适合展厅，游动保持有限顶点', () => {
  for (const [id, template] of templates) {
    const model = createMuseumFish(id, template);
    const size = new THREE.Box3().setFromObject(model.group).getSize(new THREE.Vector3());
    assert.ok(Math.abs(size.x - MUSEUM_SPECIES[id].length) < .001, `${id} 保持约定长度`);
    assert.ok(size.y > 0 && size.z > 0);
    assert.ok(model.group.getObjectsByProperty('isSkinnedMesh', true).length > 0);
    for (const time of [0, .8, 8, 150]) {
      model.animate(time, 1.3);
      model.group.updateMatrixWorld(true);
      model.group.traverse(object => {
        if (!(object instanceof THREE.SkinnedMesh)) return;
        const vertex = new THREE.Vector3();
        const positions = object.geometry.getAttribute('position');
        for (let index = 0; index < positions.count; index++) {
          object.getVertexPosition(index, vertex);
          assert.ok(vertex.toArray().every(Number.isFinite), `${id} 的蒙皮顶点必须有效`);
        }
      });
    }
    model.dispose();
  }
});

test('鱼群独立驱动骨骼，释放单鱼不会销毁共享贴图或影响其他鱼', () => {
  const template = templates.get('zebra');
  const first = createMuseumFish('zebra', template);
  const second = createMuseumFish('zebra', template);
  const before = pose(second);
  first.animate(0, 1);
  first.animate(.7, 1);
  assert.notDeepEqual(pose(first), before);
  assert.deepEqual(pose(second), before);
  const meshA = first.group.getObjectsByProperty('isSkinnedMesh', true)[0];
  const meshB = second.group.getObjectsByProperty('isSkinnedMesh', true)[0];
  assert.equal(meshA.geometry, meshB.geometry);
  assert.equal(meshA.material, meshB.material);
  assert.notEqual(meshA.skeleton, meshB.skeleton);
  let sharedDisposed = false;
  meshA.geometry.addEventListener('dispose', () => { sharedDisposed = true; });
  meshA.material.addEventListener('dispose', () => { sharedDisposed = true; });
  first.dispose();
  assert.equal(sharedDisposed, false);
  assert.equal(first.group.children.length, 0);
  second.animate(0, 1);
  second.animate(.7, 1);
  assert.notDeepEqual(pose(second), before);
  second.dispose();
});

test('长时间运行后调速连续，暂停保持完整姿态，恢复继续原相位', () => {
  for (const [id, template] of templates) {
    const fresh = createMuseumFish(id, template);
    const late = createMuseumFish(id, template);
    fresh.animate(0, .65);
    late.animate(600, .65);
    assert.deepEqual(pose(late), pose(fresh));
    const initial = pose(late);
    late.animate(600.016, .66);
    const next = pose(late);
    assert.ok(maximumPoseAngle(initial, next) < .06, `${id} 在一帧内平滑衔接`);
    late.animate(600.016, 3);
    assert.deepEqual(pose(late), next);
    late.animate(600.032, .66);
    assert.ok(maximumPoseAngle(next, pose(late)) < .06);
    fresh.dispose();
    late.dispose();
  }
});

test('推进只驱动对应骨骼，不让鲨鱼和凤尾鱼的下颌跟随尾巴扭动', () => {
  const jaws = { blacktail: ['jaw', 'upjaw'], betta: ['jaw'], guppy: ['joint4'], golden: ['joint6'] };
  for (const [id, names] of Object.entries(jaws)) {
    const model = createMuseumFish(id, templates.get(id));
    const bones = names.map(name => model.group.getObjectByName(name));
    const rest = bones.map(bone => bone.quaternion.clone());
    for (let frame = 0; frame < 180; frame++) model.animate(frame / 60, 1.2, .6);
    bones.forEach((bone, index) => assert.ok(bone.quaternion.angleTo(rest[index]) < 1e-6, `${id} 的 ${bone.name} 保持原姿态`));
    model.dispose();
  }
});

test('竹荚鱼从头部到尾部逐渐柔化，翻车鱼依靠上下鳍推进', () => {
  for (const [id, stable, propulsive] of [['zebra', 'joint2', 'joint5'], ['swordtail', 'a', 'up_Fin']]) {
    const model = createMuseumFish(id, templates.get(id));
    const head = model.group.getObjectByName(stable);
    const tail = model.group.getObjectByName(propulsive);
    const headRest = head.quaternion.clone();
    const tailRest = tail.quaternion.clone();
    let headAngle = 0;
    let tailAngle = 0;
    for (let frame = 0; frame < 180; frame++) {
      model.animate(frame / 60, 1);
      headAngle = Math.max(headAngle, head.quaternion.angleTo(headRest));
      tailAngle = Math.max(tailAngle, tail.quaternion.angleTo(tailRest));
    }
    assert.ok(headAngle < .03, `${id} 保持头部稳定`);
    assert.ok(tailAngle > .15, `${id} 的推进部位应有可见的柔和摆动`);
    model.dispose();
  }
});

test('转弯时后半身随方向弯曲，暂停固定姿态，直行后平滑回正', () => {
  const models = [0, 1.2, -1.2].map(() => createMuseumFish('zebra', templates.get('zebra')));
  for (let frame = 0; frame < 120; frame++) {
    models.forEach((model, index) => model.animate(frame / 60, 1, [0, 1.2, -1.2][index]));
  }
  const tail = models.map(model => model.group.getObjectByName('joint5').quaternion.clone());
  assert.ok(tail[1].angleTo(tail[2]) > .2, '相反方向的转弯应形成不同的尾部弯曲');
  const stopped = pose(models[1]);
  models[1].animate(119 / 60, 3, -1.8);
  assert.deepEqual(pose(models[1]), stopped);
  for (let frame = 120; frame < 240; frame++) models.forEach(model => model.animate(frame / 60, 1, 0));
  assert.ok(maximumPoseAngle(pose(models[0]), pose(models[1])) < .0001, '恢复直行后应平滑消除转向偏置');
  models.forEach(model => model.dispose());
});

test('碰撞包络以原点为中心，覆盖不同泳速和左右转弯时的精确蒙皮顶点', () => {
  const bounds = new THREE.Box3();
  for (const [id, template] of templates) {
    for (const speed of [.3, 1, 2, 3]) for (const turnRate of [-1.8, 1.8]) {
      const model = createMuseumFish(id, template);
      const half = model.size.clone().multiplyScalar(.5);
      assert.ok(half.toArray().every(value => Number.isFinite(value) && value > 0));
      for (let frame = 0; frame <= 300; frame++) {
        model.animate(frame * .04, speed, turnRate);
        model.group.updateMatrixWorld(true);
        bounds.setFromObject(model.group, true);
        for (const axis of ['x', 'y', 'z']) {
          assert.ok(bounds.min[axis] >= -half[axis] && bounds.max[axis] <= half[axis], `${id} 的 ${axis} 轴在速度 ${speed}、转向 ${turnRate} 时不能超出原点居中的包络`);
        }
      }
      model.dispose();
    }
  }
});

test('玩家模型保留原版蒙皮，步行动画驱动身体和服装骨骼，停止后回到站姿', async () => {
  const template = await loadModel('character');
  const visitor = createMuseumVisitor(template);
  const size = new THREE.Box3().setFromObject(visitor.group).getSize(new THREE.Vector3());
  assert.ok(size.y > 1.8 && size.y < 2.1);
  const joints = visitor.group.getObjectsByProperty('isBone', true);
  assert.ok(joints.filter(bone => /^Leg_1_L(?:_\d+)?$/.test(bone.name)).length >= 2, '服装和身体都应参与步行动画');
  const initial = pose(visitor);
  visitor.walk(1, .1);
  assert.notDeepEqual(pose(visitor), initial);
  for (let index = 0; index < 100; index++) visitor.walk(0, .1);
  assert.ok(maximumChange(pose(visitor), initial) < .0001);
  visitor.dispose();
  assert.equal(visitor.group.children.length, 0);
});
