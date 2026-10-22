import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { OBB } from 'three/addons/math/OBB.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import RAPIER from '@dimforge/rapier3d-compat';
import { createSwimmingWorld, initSwimming } from '../src/swimming.ts';
import { MUSEUM_SPECIES, createMuseumFish, normalizeFish } from '../src/museum-fish.ts';
import { demoSnapshot, DEMO_GROUP_COUNT, DEMO_GROUP_TICKS } from '../src/demo.ts';
import { hashSeed, speciesForExhibit } from '../src/sessions.ts';
import { SCENERY_MODELS } from '../src/museum-scenery.ts';
import { createMuseum } from '../src/museum.ts';
import { SCENERY_PRESETS } from '../src/scenery-presets.ts';
import { TANK_HALF_WIDTH } from '../src/aquarium-layout.ts';
import { ACTIVITY_FISH, scaleForFishRole } from '../src/fish-roles.ts';

await initSwimming();

const bounds = { min: [-TANK_HALF_WIDTH + .25, .55, -6], max: [TANK_HALF_WIDTH - .25, 8.35, 0] };
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

async function loadMuseumTemplates(speciesIds) {
  // Node 验证原版网格与碰撞，贴图显示留给浏览器验证。
  const loader = new GLTFLoader().register(() => ({
    name: 'swimming_geometry_validation',
    loadTexture() { return Promise.resolve(new THREE.Texture()); },
  }));
  const load = async path => {
    const data = await readFile(new URL(`../public/models/acnh/${path}.glb`, import.meta.url));
    return (await loader.parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), '')).scene;
  };
  const fish = new Map();
  for (const id of speciesIds) {
    const species = MUSEUM_SPECIES[id];
    fish.set(id, normalizeFish(await load(`fish/${species.model}`), species.length));
  }
  const scenery = new Map();
  for (const path of Object.values(SCENERY_MODELS)) scenery.set(path, await load(path));
  return { fish, scenery };
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

test('默认出生朝向水箱中央，显式朝向与领鱼朝向仍被保留', t => {
  const simulation = createSimulation(t);
  const records = [];
  const sides = new Set();
  for (let index = 0; index < 16; index++) {
    const fish = addFish(simulation, records, `inward-${index}`, [.4, .2, .2], 123 + index * 7919);
    sides.add(Math.sign(fish.position.x));
    const forward = new THREE.Vector3(1, 0, 0).applyQuaternion(fish.quaternion);
    assert.ok(forward.x * fish.position.x < 0, `${fish.id} 默认应朝中央游动`);
  }
  assert.deepEqual(sides, new Set([-1, 1]), '应覆盖左右两侧默认出生点');
  const quaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4);
  const leader = addFish(simulation, records, 'explicit-heading', [.6, .25, .2], 456, {
    position: new THREE.Vector3(4, 2.5, -3), quaternion,
  });
  assert.ok(leader.quaternion.angleTo(quaternion) < tolerance, '显式出生朝向不能被默认策略覆盖');
  const follower = addFish(simulation, records, 'inherited-heading', [.3, .15, .15], 789, { leader, slot: 0 });
  assert.ok(follower.quaternion.angleTo(leader.quaternion) < tolerance, '随行鱼出生时应保持领鱼朝向');
  assertClear(records);
});

test('加长水箱两翼均可出生巡游，可见包络保持在新玻璃范围内', t => {
  const simulation = createSimulation(t);
  const records = [];
  for (const side of [-1, 1]) {
    const fish = addFish(simulation, records, `wing-${side}`, [2, .6, .5], 123 + side, {
      position: new THREE.Vector3(side * 12.7, 4.5, -3),
    });
    assert.equal(Math.sign(fish.position.x), side);
    assert.ok(Math.abs(fish.position.x) > 12, '新鱼可以进入旧水箱之外的左右两翼');
  }
  for (let frame = 0; frame < 600; frame++) {
    simulation.update(1 / 60);
    assertClear(records);
  }
});

test('稀疏鱼也能在全缸两翼和前后水层出生，并持续安全巡游', t => {
  const simulation = createSimulation(t);
  const records = [];
  const births = [];
  for (let index = 0; index < 24; index++) {
    const id = `sparse-${index}`;
    const fish = addFish(simulation, records, id, [1.8, .6, .5], hashSeed(id));
    births.push(fish.position.clone());
    assertClear(records);
    simulation.removeFish(id);
    records.length = 0;
  }
  assert.ok(births.some(position => position.x < -9), '只有一条鱼时也可出生在左翼');
  assert.ok(births.some(position => position.x > 9), '只有一条鱼时也可出生在右翼');
  assert.ok(births.some(position => position.z < -3.8), '少量鱼不会被限制在前层');
  assert.ok(births.some(position => position.z > -2.2), '全缸出生仍覆盖前层');
  for (let index = 0; index < 3; index++) addFish(simulation, records, `roaming-${index}`, [1.8, .6, .5], hashSeed(`roaming-${index}`));
  const previous = records.map(({ fish }) => fish.position.clone());
  const distance = records.map(() => 0);
  for (let frame = 0; frame < 30 * 60; frame++) {
    simulation.update(1 / 60);
    assertClear(records);
    records.forEach(({ fish }, index) => {
      const step = fish.position.distanceTo(previous[index]);
      assert.ok(step < .15, '自由巡游仍保持连续运动');
      distance[index] += step;
      previous[index].copy(fish.position);
    });
    if (frame % 600 !== 599) continue;
    distance.forEach((travel, index) => assert.ok(travel > .2, `${records[index].id} 每十秒都应持续运动`));
    distance.fill(0);
  }
});

test('单个会话的十条随行鱼在全缸巡游中自然跟群且不穿模', t => {
  const simulation = createSimulation(t);
  const records = [];
  const leader = addFish(simulation, records, 'single-school', [2.2, .7, .6], hashSeed('single-school-2'), {
    position: new THREE.Vector3(8, 4.5, -2),
  });
  for (let slot = 0; slot < 10; slot++) {
    addFish(simulation, records, `school-follower-${slot}`, [.42, .18, .15], hashSeed(`school-follower-${slot}`), { leader, slot });
  }
  const previous = records.map(({ fish }) => fish.position.clone());
  const distance = records.map(() => 0);
  let leftmost = leader.position.x;
  let rightmost = leader.position.x;
  for (let frame = 0; frame < 30 * 60; frame++) {
    simulation.update(1 / 60);
    assertClear(records);
    records.forEach(({ fish }, index) => {
      assert.ok(fish.position.distanceTo(previous[index]) < .15, '自由群游不能直接传送鱼群');
      previous[index].copy(fish.position);
      if (index > 0 && frame >= 20 * 60) distance[index] += fish.position.distanceTo(leader.position);
    });
    leftmost = Math.min(leftmost, leader.position.x);
    rightmost = Math.max(rightmost, leader.position.x);
  }
  assert.ok(rightmost - leftmost > 12, '单会话主鱼也能穿行水箱远端，不局限在固定局部区域');
  const averageDistance = distance.slice(1).reduce((sum, value) => sum + value, 0) / (10 * 60 * 10);
  assert.ok(averageDistance < 6, `随行鱼应跟随所属主鱼巡游，不能散成独立鱼群：${averageDistance}`);
  distance.slice(1).forEach((value, slot) => assert.ok(value / (10 * 60) < 9, `第 ${slot} 条随行鱼不能持续掉队`));
});

test('鱼群数量变化不收拢既有鱼的全缸目标，也不引起瞬移', t => {
  const simulation = createSimulation(t);
  const records = [];
  const seed = hashSeed('single-school-4');
  for (let index = 0; index < 3; index++) {
    addFish(simulation, records, `retained-${index}`, [1.1, .4, .3], seed, {
      position: new THREE.Vector3(-11 + index * 3, 3 + index, -3),
    });
  }
  for (let index = 0; index < 27; index++) {
    addFish(simulation, records, `crowded-${index}`, [1.1, .4, .3], hashSeed(`crowded-${index}`));
  }
  assert.ok(records.some(({ fish }) => fish.position.x < -9), '鱼群使用左翼');
  assert.ok(records.some(({ fish }) => fish.position.x > 9), '鱼群使用右翼');
  simulation.update(1 / 60);
  assertClear(records);
  const retained = records.slice(0, 3);
  const initial = retained.map(({ fish }) => ({ position: fish.position.clone(), goal: fish.goal.clone() }));
  assert.ok(initial.every(({ goal }) => goal.x > 10), '保留鱼应在巡游前往远端的过程中减少数量');
  for (const { id } of records.slice(3)) simulation.removeFish(id);
  simulation.update(1 / 60);
  retained.forEach(({ fish }, index) => {
    assert.ok(fish.position.distanceTo(initial[index].position) < .15, '数量减少不能传送既有鱼');
    assert.deepEqual(fish.goal.toArray(), initial[index].goal.toArray(), '数量变化不能把全缸巡游目标收回中央');
  });
  const distance = retained.map(() => 0);
  const previous = retained.map(({ fish }) => fish.position.clone());
  for (let frame = 0; frame < 10 * 60; frame++) {
    simulation.update(1 / 60);
    assertClear(retained);
    retained.forEach(({ fish }, index) => {
      const step = fish.position.distanceTo(previous[index]);
      assert.ok(step < .15);
      distance[index] += step;
      previous[index].copy(fish.position);
    });
  }
  distance.forEach(value => assert.ok(value > .2, '数量减少后仍持续自由巡游'));
});

test('密草低顶点代理保留局部包围中心、层级缩放与旋转，其他布景仍用真实凸包', t => {
  const geometry = new THREE.BoxGeometry(2, 1.2, .6).translate(.5, .3, -.2);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  mesh.position.set(.3, 1.5, 0);
  mesh.rotation.y = .5;
  mesh.scale.set(1.1, .8, .7);
  mesh.userData.aquariumCollider = 'box';
  const parent = new THREE.Group();
  parent.position.set(-2, 1, -3);
  parent.rotation.y = .6;
  parent.scale.setScalar(1.3);
  parent.add(mesh);
  t.after(() => { geometry.dispose(); mesh.material.dispose(); });
  const simulation = createSimulation(t, [mesh]);
  const colliders = [];
  simulation.world.forEachCollider(collider => colliders.push(collider));
  const proxy = colliders[6];
  assert.equal(proxy.shape.type, RAPIER.ShapeType.Cuboid);
  const position = geometry.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
  const scale = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  mesh.matrixWorld.decompose(new THREE.Vector3(), rotation, scale);
  const half = geometry.boundingBox.getSize(new THREE.Vector3()).multiply(scale).multiplyScalar(.5);
  assert.ok(new THREE.Vector3().copy(proxy.translation()).distanceTo(position) < tolerance);
  assert.ok(new THREE.Quaternion().copy(proxy.rotation()).angleTo(rotation) < tolerance);
  assert.ok(new THREE.Vector3().copy(proxy.shape.halfExtents).distanceTo(half) < tolerance);
  const sample = new RAPIER.Ball(.01);
  assert.equal(proxy.intersectsShape(sample, position, new THREE.Quaternion()), true);
  const outside = new THREE.Vector3(half.x * .9, 0, half.z * 1.5).applyQuaternion(rotation).add(position);
  assert.equal(proxy.intersectsShape(sample, outside, new THREE.Quaternion()), false, '代理随草株旋转，不能扩大为世界坐标轴包围盒');
  const attribute = geometry.getAttribute('position');
  for (let index = 0; index < attribute.count; index++) {
    const point = new THREE.Vector3().fromBufferAttribute(attribute, index).applyMatrix4(mesh.matrixWorld)
      .sub(position).applyQuaternion(rotation.clone().invert());
    assert.ok(Math.abs(point.x) <= half.x + tolerance && Math.abs(point.y) <= half.y + tolerance && Math.abs(point.z) <= half.z + tolerance,
      '简化包络必须包含所有实际草叶顶点');
  }
  delete mesh.userData.aquariumCollider;
  simulation.setObstacles([mesh]);
  assert.equal(proxy.isValid(), false);
  const precise = [];
  simulation.world.forEachCollider(collider => {
    if (!colliders.slice(0, 6).some(wall => wall.handle === collider.handle)) precise.push(collider);
  });
  assert.equal(precise.length, 1);
  assert.equal(precise[0].shape.type, RAPIER.ShapeType.ConvexPolyhedron, '未标记的原版模型仍使用精确凸包');
});

test('替换布景释放旧障碍占用，六面玻璃碰撞体始终保留', t => {
  const rock = reef([2, 2, 2], [0, 4.5, -3], .2);
  t.after(() => { rock.mesh.geometry.dispose(); rock.mesh.material.dispose(); });
  const simulation = createSimulation(t, [rock.mesh]);
  const colliders = [];
  simulation.world.forEachCollider(collider => colliders.push(collider));
  const walls = colliders.slice(0, 6);
  const oldObstacle = colliders[6];
  assert.equal(colliders.length, 7);
  simulation.setObstacles([]);
  assert.equal(oldObstacle.isValid(), false, '旧布景碰撞体应释放');
  assert.ok(walls.every(collider => collider.isValid()), '六面玻璃不能被切换删除');
  assert.equal(simulation.world.colliders.len(), 6);
  const records = [];
  const position = new THREE.Vector3(0, 4.5, -3);
  const fish = addFish(simulation, records, 'old-obstacle-space', [1, .4, .3], 123, { position });
  assert.deepEqual(fish.position.toArray(), position.toArray(), '移除旧布景后鱼能进入原占用空间');
  assertClear(records);
});

test('切换造景仅安全重排受影响鱼，保留对象、姿态引用与随行关系', t => {
  const rock = reef([2.5, 2, 1.8], [-4, 4.5, -3], .3);
  t.after(() => { rock.mesh.geometry.dispose(); rock.mesh.material.dispose(); });
  const simulation = createSimulation(t);
  const records = [];
  const affected = addFish(simulation, records, 'affected', [1.4, .6, .4], 123, { position: new THREE.Vector3(-4, 4.5, -3) });
  const leader = addFish(simulation, records, 'unaffected', [1.2, .5, .4], 456, { position: new THREE.Vector3(4, 4.5, -3) });
  const follower = addFish(simulation, records, 'follower', [.5, .2, .2], 789, { leader, slot: 2 });
  const references = records.map(({ fish }) => ({ fish, position: fish.position, quaternion: fish.quaternion, body: fish.body, initial: fish.position.clone(), rotation: fish.quaternion.clone() }));
  const velocity = { x: .4, y: .1, z: -.2 };
  leader.body.setLinvel(velocity, true);
  const initialVelocity = leader.body.linvel();
  simulation.setObstacles([rock.mesh]);
  references.forEach(({ fish, position, quaternion, body, initial, rotation }) => {
    assert.equal(simulation.addFish(fish.id, fish.size, 0), fish, '同一会话保留原 fish 实例');
    assert.equal(fish.position, position);
    assert.equal(fish.quaternion, quaternion);
    assert.equal(fish.body, body, '无需销毁再创建鱼刚体');
    assert.ok(fish.quaternion.angleTo(rotation) < tolerance, '有空间时重排保持原朝向');
    if (fish !== affected) assert.deepEqual(fish.position.toArray(), initial.toArray(), '未受影响的鱼不能重置位置');
  });
  assert.ok(affected.position.distanceTo(references[0].initial) > .1);
  assert.equal(follower.leader, leader);
  assert.equal(follower.slot, 2);
  assert.deepEqual(leader.body.linvel(), initialVelocity, '未受影响鱼的速度保持不变');
  assert.equal(simulation.world.bodies.len(), records.length);
  assertClear(records, [rock.volume]);
  for (let frame = 0; frame < 240; frame++) {
    simulation.update(1 / 60);
    assertClear(records, [rock.volume]);
  }
});

test('多次切换造景不会积累碰撞体，也不会销毁任何鱼实例', t => {
  const rocks = [reef([2, 1, 1], [-4, 1.2, -4], .2), reef([1, 2, 1], [4, 1.8, -4], -.3)];
  t.after(() => rocks.forEach(({ mesh }) => { mesh.geometry.dispose(); mesh.material.dispose(); }));
  const simulation = createSimulation(t);
  const records = [];
  const fish = addFish(simulation, records, 'persistent', [1.2, .5, .4], 123, { position: new THREE.Vector3(0, 5, -3) });
  const initial = fish.position.clone();
  for (let index = 0; index < 24; index++) {
    const active = rocks.slice(0, index % 3);
    simulation.setObstacles(active.map(item => item.mesh));
    assert.equal(simulation.world.colliders.len(), 6 + records.length + active.length);
    assert.equal(simulation.world.bodies.len(), records.length);
    assert.equal(simulation.addFish(fish.id, fish.size, 0), fish);
    assert.deepEqual(fish.position.toArray(), initial.toArray());
    assertClear(records, active.map(item => item.volume));
  }
});

test('新造景空间不足时回退旧布局与所有鱼状态，随后仍可正常切换', t => {
  const old = reef([1, 1, 1], [0, 1.2, -4.5], .2);
  const blocked = reef([bounds.max[0] - bounds.min[0], 5.75, 6], [0, 3.425, -3], 0);
  t.after(() => [old, blocked].forEach(({ mesh }) => { mesh.geometry.dispose(); mesh.material.dispose(); }));
  const simulation = createSimulation(t, [old.mesh]);
  const records = [];
  const small = addFish(simulation, records, 'small', [.4, .3, .2], 123, { position: new THREE.Vector3(-4, 3, -3) });
  const large = addFish(simulation, records, 'large', [3, 2.6, 1.2], 456, { position: new THREE.Vector3(3, 4, -3) });
  const previous = records.map(({ fish }) => ({ position: fish.position.clone(), quaternion: fish.quaternion.clone(), heading: fish.heading.clone(), goal: fish.goal.clone(), waypoint: fish.waypoint }));
  small.body.setLinvel({ x: .4, y: .1, z: -.2 }, true);
  const velocity = small.body.linvel();
  assert.throws(() => simulation.setObstacles([blocked.mesh]), { message: '当前鱼群暂时无法安全切换造景' });
  records.forEach(({ fish }, index) => {
    assert.deepEqual(fish.position.toArray(), previous[index].position.toArray());
    assert.deepEqual(fish.quaternion.toArray(), previous[index].quaternion.toArray());
    assert.deepEqual(fish.heading.toArray(), previous[index].heading.toArray());
    assert.deepEqual(fish.goal.toArray(), previous[index].goal.toArray());
    assert.equal(fish.waypoint, previous[index].waypoint);
  });
  assert.deepEqual(small.body.linvel(), velocity);
  assert.equal(simulation.world.colliders.len(), 6 + records.length + 1, '失败不能泄漏新碰撞体或删除旧碰撞体');
  assertClear(records, [old.volume]);
  simulation.removeFish(large.id);
  simulation.setObstacles([blocked.mesh]);
  assert.ok(small.position.y > 6.3, '同一布局能在空间足够时安全容纳小鱼');
  assertClear([records[0]], [blocked.volume]);
});

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

test('离场随行鱼朝后景游离，仍避开鱼体和礁石，移除后释放刚体', t => {
  const rock = reef([1.1, 1.3, 1], [3.5, 3.5, -3.5], .3);
  t.after(() => { rock.mesh.geometry.dispose(); rock.mesh.material.dispose(); });
  const simulation = createSimulation(t, [rock.mesh]);
  const records = [];
  const leader = addFish(simulation, records, 'departure-leader', [1.8, .6, .5], 491, { position: new THREE.Vector3(-4, 4.3, -2) });
  const follower = addFish(simulation, records, 'departure-follower', [.65, .35, .3], 617, {
    leader, slot: 0, position: new THREE.Vector3(.5, 4.3, -2), quaternion: new THREE.Quaternion(),
  });
  follower.destination = new THREE.Vector3(6, 4.3, -4.9);
  const initial = follower.position.clone();
  const direction = follower.destination.clone().sub(initial).normalize();
  for (let frame = 0; frame < 240; frame++) {
    simulation.update(1 / 60);
    assertClear(records, [rock.volume]);
  }
  assert.ok(follower.position.clone().sub(initial).dot(direction) > .5, '离场后应离开领鱼，向后景移动');
  const bodies = simulation.world.bodies.len();
  simulation.removeFish(follower.id);
  assert.equal(simulation.world.bodies.len(), bodies - 1);
  simulation.removeFish(follower.id);
  simulation.update(1 / 60);
  assert.equal(simulation.world.bodies.len(), bodies - 1);
});

test('领鱼贴近缸壁时，随行鱼不能跳过墙体生成在缸外', t => {
  const simulation = createSimulation(t);
  const records = [];
  const leader = addFish(simulation, records, 'leader-near-wall', [3.5, 1, 1], 123, {
    position: new THREE.Vector3(bounds.max[0] - 2, 4, -3),
    quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI),
  });
  assert.ok(leader.position.x > 12, '领鱼实际从新水箱右侧玻璃前出生');
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

test('八组真实鱼和随行鱼在动森珊瑚水草间巡游，全部找到空间且保持避碰', async t => {
  const { fish: templates, scenery: sceneryTemplates } = await loadMuseumTemplates(Object.keys(MUSEUM_SPECIES));
  const dimensions = (species, factor) => {
    const model = createMuseumFish(species, templates.get(species));
    const size = model.size.clone().multiplyScalar(factor).toArray();
    model.dispose();
    return size;
  };
  const activityLevels = { thinking: .65, working: 1, waiting: .2 };
  const exhibited = new Set();
  for (let group = 0; group < DEMO_GROUP_COUNT; group++) await t.test(`第 ${group + 1} 组`, t => {
    const scenery = createMuseum(new THREE.Group(), null, sceneryTemplates);
    t.after(() => scenery.dispose());
    const simulation = createSimulation(t, scenery.obstacles);
    const records = [];
    const sessions = demoSnapshot(group * DEMO_GROUP_TICKS).sessions;
    for (const session of sessions) {
      const species = speciesForExhibit(session.id);
      exhibited.add(species);
      const leader = addFish(simulation, records, session.id,
        dimensions(species, 1.1), hashSeed(session.id));
      leader.activity = activityLevels[session.status];
      for (const [slot, activity] of session.activities.entries()) {
        const id = `${session.id}:${activity.id}`;
        const species = ACTIVITY_FISH[activity.category];
        addFish(simulation, records, id, dimensions(species, scaleForFishRole(species, activity.kind)),
          hashSeed(id), { leader, slot });
      }
    }
    assert.equal(records.length, sessions.length + sessions.reduce((count, session) => count + session.activities.length, 0), '每组全部会话鱼与随行鱼应找到空位');
    assertClear(records);
    const staticColliders = [];
    simulation.world.forEachCollider(collider => { if (!collider.parent()) staticColliders.push(collider); });
    const visibleShapes = records.map(({ size }) => new RAPIER.Cuboid(size.x * .5, size.y * .5, size.z * .5));
    const previous = records.map(({ fish }) => fish.position.clone());
    const distances = records.map(() => 0);
    for (let frame = 0; frame < 20 * 60; frame++) {
      simulation.update(1 / 60);
      assertClear(records);
      if (frame % 6 === 0) records.forEach(({ fish }, index) => {
        for (const collider of staticColliders) {
          const contact = collider.contactShape(visibleShapes[index], fish.position, fish.quaternion, 0);
          assert.ok(!contact || contact.distance >= -tolerance, `${fish.id} 的可见鱼体不能进入真实珊瑚、水草、礁石或玻璃`);
        }
      });
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
  assert.deepEqual(exhibited, new Set(Object.keys(MUSEUM_SPECIES)), '物理巡游验证实际覆盖全部 80 种鱼');
});

test('真实大中小鱼与随行鱼巡游中连续切换六种造景，裸缸回完整造景仍安全', async t => {
  const species = ['whale-shark', 'tuna', 'koi', 'red-snapper', 'sea-bass'];
  const followers = ['agent', 'read', 'write'];
  const { fish: templates, scenery: sceneryTemplates } = await loadMuseumTemplates([...new Set([...species, ...followers.map(category => ACTIVITY_FISH[category])])]);
  const museum = createMuseum(new THREE.Group(), null, sceneryTemplates, 'garden');
  t.after(() => museum.dispose());
  const simulation = createSimulation(t, museum.obstacles);
  const records = [];
  const dimensions = (id, role) => {
    const model = createMuseumFish(id, templates.get(id));
    const factor = scaleForFishRole(id, role) * (role === 'session' ? 1.1 : 1);
    const size = model.size.clone().multiplyScalar(factor).toArray();
    model.dispose();
    return size;
  };
  for (const id of species) {
    const length = MUSEUM_SPECIES[id].length * scaleForFishRole(id, 'session');
    assert.ok(length >= 1.7 - tolerance && length <= 3.4 + tolerance, '真实主鱼长度保持在 1.7–3.4 范围');
    addFish(simulation, records, `style-${id}`, dimensions(id, 'session'), hashSeed(`style-${id}`));
  }
  const leader = records[0].fish;
  for (const [slot, category] of followers.entries()) {
    const id = ACTIVITY_FISH[category];
    const role = category === 'agent' ? 'agent' : 'tool';
    assert.ok(Math.abs(MUSEUM_SPECIES[id].length * scaleForFishRole(id, role) - (role === 'agent' ? .6 : .42)) < tolerance);
    addFish(simulation, records, `style-follower-${slot}`, dimensions(id, role), hashSeed(`style-follower-${slot}`), { leader, slot });
  }
  const identities = records.map(({ fish }) => ({ fish, body: fish.body, position: fish.position, quaternion: fish.quaternion, leader: fish.leader, slot: fish.slot }));
  const visibleShapes = records.map(({ size }) => new RAPIER.Cuboid(size.x * .5, size.y * .5, size.z * .5));
  const obstacleReference = museum.obstacles;
  let elapsed = 0;
  for (const [index, style] of [...Object.keys(SCENERY_PRESETS), 'garden'].entries()) await t.test(`${index + 1}：${style}`, () => {
    museum.setScenery(style);
    simulation.setObstacles(museum.obstacles);
    assert.equal(museum.obstacles, obstacleReference, '展厅保留同一个障碍列表引用');
    identities.forEach(({ fish, body, position, quaternion, leader, slot }) => {
      assert.equal(simulation.addFish(fish.id, fish.size, 0), fish);
      assert.equal(fish.body, body);
      assert.equal(fish.position, position);
      assert.equal(fish.quaternion, quaternion);
      assert.equal(fish.leader, leader);
      assert.equal(fish.slot, slot);
    });
    const colliders = [];
    simulation.world.forEachCollider(collider => { if (!collider.parent()) colliders.push(collider); });
    const assertSceneClear = () => {
      assertClear(records);
      records.forEach(({ fish }, fishIndex) => {
        for (const collider of colliders) {
          const contact = collider.contactShape(visibleShapes[fishIndex], fish.position, fish.quaternion, 0);
          assert.ok(!contact || contact.distance >= -tolerance, `${style}/${fish.id} 不能穿入实际布景或玻璃碰撞体`);
        }
      });
    };
    assertSceneClear();
    const previous = records.map(({ fish }) => fish.position.clone());
    const distances = records.map(() => 0);
    for (let frame = 0; frame < 3 * 60; frame++) {
      elapsed += 1 / 60;
      museum.update(elapsed, 1);
      simulation.update(1 / 60);
      assertSceneClear();
      records.forEach(({ fish }, fishIndex) => {
        distances[fishIndex] += fish.position.distanceTo(previous[fishIndex]);
        previous[fishIndex].copy(fish.position);
      });
    }
    distances.forEach((distance, fishIndex) => {
      assert.ok(distance > .06, `${style}/${records[fishIndex].id} 切换后应持续巡游 3 秒，实际移动 ${distance.toFixed(3)}`);
    });
  });
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
