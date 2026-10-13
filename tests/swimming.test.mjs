import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { OBB } from 'three/addons/math/OBB.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createSwimmingWorld, initSwimming } from '../src/swimming.ts';
import { MUSEUM_SPECIES, createMuseumFish, normalizeFish } from '../src/museum-fish.ts';
import { demoSnapshot } from '../src/demo.ts';
import { hashSeed, speciesForSession } from '../src/sessions.ts';

await initSwimming();

const bounds = { min: [-9, .55, -6], max: [9, 8.35, 0] };
const tolerance = 1e-4;
const sizes = [
  [3.6, 1.1, 1.0], [2.8, .85, .8], [1.7, 2.1, .6], [2.2, .65, .7],
  [1.5, .65, .45], [1.3, .6, .45], [1.8, .8, .5], [1.4, .8, .55],
  [2.5, .45, .5], [1.1, .5, .35],
];
const matrix = new THREE.Matrix4();
const scale = new THREE.Vector3(1, 1, 1);
const corner = new THREE.Vector3();

function fishVolume(fish, size) {
  const obb = new OBB(new THREE.Vector3(), size.clone().multiplyScalar(.5).addScalar(-tolerance));
  matrix.compose(fish.position, fish.quaternion, scale);
  return obb.applyMatrix4(matrix);
}

function assertClear(records, obstacles = []) {
  const volumes = records.map(({ fish, size }) => fishVolume(fish, size));
  for (const [index, volume] of volumes.entries()) {
    const { id, fish } = records[index];
    assert.ok(fish.position.toArray().every(Number.isFinite), `${id} 位置必须有效`);
    assert.ok(fish.quaternion.toArray().every(Number.isFinite), `${id} 朝向必须有效`);
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
      corner.set(x * volume.halfSize.x, y * volume.halfSize.y, z * volume.halfSize.z)
        .applyMatrix3(volume.rotation).add(volume.center);
      corner.toArray().forEach((value, axis) => {
        assert.ok(value >= bounds.min[axis] - tolerance && value <= bounds.max[axis] + tolerance,
          `${id} 的可见包络越过缸壁：${corner.toArray()}`);
      });
    }
    for (let other = index + 1; other < volumes.length; other++) {
      assert.equal(volume.intersectsOBB(volumes[other]), false, `${id} 与 ${records[other].id} 穿模`);
    }
    for (const obstacle of obstacles) {
      assert.equal(volume.intersectsOBB(obstacle), false, `${id} 穿入礁石`);
    }
  }
}

function addFish(simulation, records, id, dimensions, seed, options) {
  const size = new THREE.Vector3(...dimensions);
  const fish = simulation.addFish(id, size, seed, options);
  assert.ok(fish, `${id} 应能在缸中找到初始空位`);
  records.push({ id, fish, size });
  return fish;
}

function createSimulation(t, obstacles = []) {
  const simulation = createSwimmingWorld(obstacles);
  t.after(() => simulation.dispose());
  return simulation;
}

function hasSolverContact(simulation, first, second) {
  let touching = false;
  simulation.world.contactPair(first, second, manifold => {
    if (manifold.numSolverContacts() > 0) touching = true;
  });
  return touching;
}

function reef(size, position, angle) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshBasicMaterial());
  mesh.position.set(...position);
  mesh.rotation.y = angle;
  mesh.updateMatrixWorld(true);
  mesh.geometry.computeBoundingBox();
  const volume = new OBB().fromBox3(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
  return { mesh, volume };
}

test('新增鱼与随行鱼在出现前找到空位，同一位置请求不会生成重叠鱼', t => {
  const simulation = createSimulation(t);
  const records = [];
  const position = new THREE.Vector3(0, 4.5, -3);
  const leader = addFish(simulation, records, 'leader', [2.6, .9, .75], 100, { position });
  for (let index = 0; index < 8; index++) {
    addFish(simulation, records, `follower-${index}`, [.6, .3, .25], 200 + index,
      { leader, slot: index, position: position.clone() });
  }
  assertClear(records);
});

test('领鱼贴近缸壁时，随行鱼不能跳过墙体生成在缸外', t => {
  const simulation = createSimulation(t);
  const records = [];
  const leader = addFish(simulation, records, 'leader-near-wall', [3.5, 1, 1], 123, {
    position: new THREE.Vector3(7.1, 4, -3),
    quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI),
  });
  addFish(simulation, records, 'follower-near-wall', [1.36, .6, .6], 456, { leader, slot: 0 });
  assertClear(records);
  for (let frame = 0; frame < 300; frame++) {
    simulation.update(1 / 60);
    assertClear(records);
  }
});

test('十种尺寸与随行鱼连续巡游两分钟，可见鱼体不穿鱼、玻璃或旋转礁石', t => {
  const reefs = [reef([2.2, 1.5, 1.5], [0, 1.45, -3.1], .35), reef([1.4, 1.1, 1.2], [-5, 1.25, -4.3], -.4)];
  t.after(() => reefs.forEach(({ mesh }) => { mesh.geometry.dispose(); mesh.material.dispose(); }));
  const simulation = createSimulation(t, reefs.map(item => item.mesh));
  const records = [];
  for (const [index, size] of sizes.entries()) addFish(simulation, records, `fish-${index}`, size, 6721 + index * 3391);
  for (let index = 0; index < 4; index++) {
    addFish(simulation, records, `agent-${index}`, [.65, .3, .28], 8000 + index,
      { leader: records[index % 2].fish, slot: index });
  }
  assertClear(records, reefs.map(item => item.volume));
  const positions = records.map(({ fish }) => fish.position.clone());
  const rotations = records.map(({ fish }) => fish.quaternion.clone());
  const distances = records.map(() => 0);
  const windowDistances = records.map(() => 0);
  for (let frame = 0; frame < 120 * 60; frame++) {
    records.forEach(({ fish }, index) => { fish.activity = ((Math.floor(frame / 600) + index) % 4) / 3; });
    simulation.update(1 / 60);
    assertClear(records, reefs.map(item => item.volume));
    records.forEach(({ fish, id }, index) => {
      const distance = fish.position.distanceTo(positions[index]);
      assert.ok(distance < .15, `${id} 不应瞬移`);
      assert.ok(fish.quaternion.clone().normalize().angleTo(rotations[index].clone().normalize()) < .16, `${id} 不应突然翻转`);
      assert.ok(Number.isFinite(fish.speed) && Number.isFinite(fish.turnRate), `${id} 的运动参数必须有效`);
      distances[index] += distance;
      windowDistances[index] += distance;
      positions[index].copy(fish.position);
      rotations[index].copy(fish.quaternion);
    });
    if ((frame + 1) % 600 === 0) {
      windowDistances.forEach((distance, index) => {
        assert.ok(distance > .2, `${records[index].id} 在第 ${(frame + 1) / 60} 秒前的十秒内应持续游动，实际移动 ${distance.toFixed(3)}`);
        windowDistances[index] = 0;
      });
    }
  }
  distances.forEach((distance, index) => assert.ok(distance > 2, `${records[index].id} 应能持续游动而非卡住`));
});

test('真实十种模型与五条随行鱼密集巡游八十秒，每十秒持续移动且不穿模', async t => {
  // Node 只读取真实网格包络，纹理显示由浏览器验证。
  const loader = new GLTFLoader().register(() => ({
    name: 'swimming_geometry_validation',
    loadTexture() { return Promise.resolve(new THREE.Texture()); },
  }));
  const templates = new Map();
  for (const [id, species] of Object.entries(MUSEUM_SPECIES)) {
    const data = await readFile(new URL(`../public/models/acnh/fish/${species.model}.glb`, import.meta.url));
    const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    const { scene } = await loader.parseAsync(buffer, '');
    templates.set(id, normalizeFish(scene, species.length));
  }
  const dimensions = (species, factor) => {
    const model = createMuseumFish(species, templates.get(species));
    const size = model.size.clone().multiplyScalar(factor).toArray();
    model.dispose();
    return size;
  };
  const reefs = [
    [-6.9, .75, -4.7, 1.7, .65, 1.05], [-5.4, .64, -4.95, .85, .5, .7],
    [-2.9, .9, -4.1, 1.65, .9, 1.25], [-1.55, .8, -4.8, 1.35, .9, .8],
    [-3.7, .68, -3.25, .95, .55, .7], [.3, .64, -5.1, 1.1, .45, .75],
    [5.7, .76, -4.45, 1.6, .75, 1.15], [7.1, .68, -4.9, 1, .55, .85],
  ].map((layout, index) => {
    const geometry = new THREE.IcosahedronGeometry(1, 2);
    const vertices = geometry.getAttribute('position');
    const point = new THREE.Vector3();
    for (let vertex = 0; vertex < vertices.count; vertex++) {
      point.fromBufferAttribute(vertices, vertex);
      const distortion = .88 + Math.sin(point.x * 4.1 + index) * Math.cos(point.z * 5.3 + point.y) * .13;
      vertices.setXYZ(vertex, point.x * distortion, point.y * distortion, point.z * distortion);
    }
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    mesh.position.set(...layout.slice(0, 3));
    mesh.scale.set(...layout.slice(3));
    mesh.rotation.set(.06 * index, index * 1.2, Math.sin(index) * .16);
    return mesh;
  });
  t.after(() => reefs.forEach(mesh => { mesh.geometry.dispose(); mesh.material.dispose(); }));
  const simulation = createSimulation(t, reefs);
  const records = [];
  const categorySpecies = { read: 'neon', write: 'swordtail', terminal: 'golden', web: 'rainbow', agent: 'betta', tool: 'guppy' };
  const activityLevels = { thinking: .65, working: 1, waiting: .2 };
  for (const session of demoSnapshot(0).sessions) {
    const leader = addFish(simulation, records, session.id,
      dimensions(speciesForSession(session.id), 1.15), hashSeed(session.id));
    leader.activity = activityLevels[session.status];
    for (const [slot, activity] of session.activities.entries()) {
      const id = `${session.id}:${activity.id}`;
      addFish(simulation, records, id, dimensions(categorySpecies[activity.category], activity.kind === 'agent' ? .45 : .3),
        hashSeed(id), { leader, slot });
    }
  }
  assert.equal(records.length, 15, '十条会话鱼与五条随行鱼应全部找到空位');
  assertClear(records);
  const previous = records.map(({ fish }) => fish.position.clone());
  const distances = records.map(() => 0);
  for (let frame = 0; frame < 80 * 60; frame++) {
    simulation.update(1 / 60);
    assertClear(records);
    records.forEach(({ fish }, index) => {
      distances[index] += fish.position.distanceTo(previous[index]);
      previous[index].copy(fish.position);
    });
    if ((frame + 1) % 600 !== 0) continue;
    distances.forEach((distance, index) => {
      assert.ok(distance > .2, `${records[index].id} 在第 ${(frame + 1) / 60} 秒前十秒内卡住，实际移动 ${distance.toFixed(3)}`);
      distances[index] = 0;
    });
  }
});

test('会话和工具动态增删会清理物理对象，重新加入仍正常巡游', t => {
  const simulation = createSimulation(t);
  const records = [];
  const baseline = simulation.world.bodies.len();
  const leader = addFish(simulation, records, 'session', [2, .7, .6], 123);
  const follower = addFish(simulation, records, 'tool', [.65, .3, .25], 456, { leader, slot: 0 });
  assert.equal(simulation.world.bodies.len(), baseline + 2);
  simulation.update(1 / 60);
  simulation.removeFish('tool');
  assert.equal(follower.body.isValid(), false);
  assert.equal(simulation.world.bodies.len(), baseline + 1);
  simulation.removeFish('tool');
  simulation.removeFish('session');
  assert.equal(leader.body.isValid(), false);
  assert.equal(simulation.world.bodies.len(), baseline);
  const restored = [];
  addFish(simulation, restored, 'session', [2, .7, .6], 123);
  for (let frame = 0; frame < 300; frame++) simulation.update(1 / 60);
  assertClear(restored);
});

test('暂停不改变任何鱼的姿态，恢复后从当前位置继续', t => {
  const simulation = createSimulation(t);
  const records = [];
  const fish = addFish(simulation, records, 'session', [2, .7, .6], 789);
  for (let frame = 0; frame < 180; frame++) simulation.update(1 / 60);
  const position = fish.position.clone();
  const quaternion = fish.quaternion.clone();
  for (let frame = 0; frame < 600; frame++) simulation.update(0);
  assert.deepEqual(fish.position.toArray(), position.toArray());
  assert.deepEqual(fish.quaternion.toArray(), quaternion.toArray());
  simulation.update(1 / 60);
  assert.ok(fish.position.distanceTo(position) < .15, '恢复时不追赶暂停期间的轨迹');
  assertClear(records);
});

test('相同种子在 30 FPS 与 60 FPS 下产生一致运动，固定物理步不受渲染帧率影响', t => {
  const first = createSimulation(t);
  const second = createSimulation(t);
  const setup = simulation => {
    const records = [];
    for (const [index, size] of sizes.slice(0, 4).entries()) addFish(simulation, records, `fish-${index}`, size, 1729 + index);
    return records;
  };
  const firstFish = setup(first);
  const secondFish = setup(second);
  for (let frame = 0; frame < 30 * 30; frame++) first.update(1 / 30);
  for (let frame = 0; frame < 30 * 60; frame++) second.update(1 / 60);
  firstFish.forEach(({ fish, id }, index) => {
    assert.ok(fish.position.distanceTo(secondFish[index].fish.position) < 1e-4, `${id} 不应因刷新率变化漂移`);
    assert.ok(fish.quaternion.clone().normalize().angleTo(secondFish[index].fish.quaternion.clone().normalize()) < 1e-4, `${id} 转向不应依赖刷新率`);
  });
});

test('快速迎面接近与转弯仍由连续碰撞保护，不穿过另一条鱼或缸壁', t => {
  const simulation = createSimulation(t);
  const records = [];
  const first = addFish(simulation, records, 'fast-left', [1.8, .6, .6], 9001,
    { position: new THREE.Vector3(-2.5, 4.5, -3), quaternion: new THREE.Quaternion() });
  const second = addFish(simulation, records, 'fast-right', [1.8, .6, .6], 9002,
    { position: new THREE.Vector3(2.5, 4.5, -3), quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI) });
  first.body.setLinvel({ x: 18, y: 0, z: 0 }, true);
  second.body.setLinvel({ x: -18, y: 0, z: 0 }, true);
  for (let frame = 0; frame < 180; frame++) {
    simulation.update(1 / 60);
    assertClear(records);
  }
});

test('空间充足时相向巡游主动绕行，不依靠鱼体碰撞改变方向', t => {
  const simulation = createSimulation(t);
  const records = [];
  const first = addFish(simulation, records, 'oncoming-left', [2.8, .9, .9], 5, {
    position: new THREE.Vector3(-5, 4.5, -3), quaternion: new THREE.Quaternion(),
  });
  const second = addFish(simulation, records, 'oncoming-right', [2.8, .9, .9], 787, {
    position: new THREE.Vector3(5, 4.5, -3),
    quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI),
  });
  first.body.setLinvel({ x: 1, y: 0, z: 0 }, true);
  second.body.setLinvel({ x: -1, y: 0, z: 0 }, true);
  const previous = records.map(({ fish }) => fish.position.clone());
  const distances = records.map(() => 0);
  const recentDistances = records.map(() => 0);
  let contactFrames = 0;
  for (let frame = 0; frame < 8 * 120; frame++) {
    simulation.update(1 / 120);
    if (hasSolverContact(simulation, first.collider, second.collider)) contactFrames++;
    assertClear(records);
    records.forEach(({ fish }, index) => {
      const distance = fish.position.distanceTo(previous[index]);
      distances[index] += distance;
      if (frame >= 6 * 120) recentDistances[index] += distance;
      previous[index].copy(fish.position);
    });
  }
  assert.equal(contactFrames, 0, '相向接近应提前避开，不让求解器持续推开鱼体');
  distances.forEach(distance => assert.ok(distance > 2, '双方应持续巡游'));
  recentDistances.forEach(distance => assert.ok(distance > .5, '避让后不能停在原地相互等待'));
});

test('随行目标接近前玻璃时主动减速绕行，不持续挤压玻璃', t => {
  const simulation = createSimulation(t);
  const records = [];
  const leader = addFish(simulation, records, 'leader-near-glass', [1, .4, .3], 5, {
    position: new THREE.Vector3(0, 4.5, -1.3),
    quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2),
  });
  const follower = addFish(simulation, records, 'following-near-glass', [1.4, .6, .5], 788, {
    leader, slot: 0, position: new THREE.Vector3(.53, 4.5, -3.5),
    quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2),
  });
  follower.body.setLinvel({ x: 0, y: 0, z: 1 }, true);
  const previous = follower.position.clone();
  let distance = 0;
  let minimumSpeed = 1;
  let contactFrames = 0;
  for (let frame = 0; frame < 6 * 120; frame++) {
    simulation.update(1 / 120);
    simulation.world.contactPairsWith(follower.collider, other => {
      if (other.parent()) return;
      if (hasSolverContact(simulation, follower.collider, other)) contactFrames++;
    });
    assertClear(records);
    distance += follower.position.distanceTo(previous);
    minimumSpeed = Math.min(minimumSpeed, follower.speed);
    previous.copy(follower.position);
  }
  assert.equal(contactFrames, 0, '追随目标不能优先于前玻璃的安全距离');
  assert.ok(minimumSpeed < .8, '面向玻璃接近时应提前减速');
  assert.ok(distance > 1, '绕行后继续游动，不能用永久停车代替避障');
});
