import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { MUSEUM_SPECIES, createMuseumFish, normalizeFish } from '../src/museum-fish.ts';
import { createMuseumVisitor } from '../src/museum-visitor.ts';
import { PLAYER_MODELS, COMPANION_MODELS } from '../src/museum-characters.ts';
import { attachVisitorHeadAccessories } from '../src/visitor-head-attachments.ts';
import { demoSnapshot, demoGroup, DEMO_GROUP_TICKS, DEMO_GROUP_COUNT } from '../src/demo.ts';
import { speciesForExhibit } from '../src/sessions.ts';

// Node 验证原版网格、蒙皮和骨骼；真实纹理与透明效果在浏览器中验证。
const loader = new GLTFLoader().register(() => ({
  name: 'node_geometry_validation',
  loadTexture() { return Promise.resolve(new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1)); },
}));
async function loadModel(path) {
  const data = await readFile(new URL(`../public/models/acnh/${path}.glb`, import.meta.url));
  const json = JSON.parse(data.subarray(20, 20 + data.readUInt32LE(12)).toString());
  assert.ok(json.images?.length > 0, `${path} 应包含原版贴图`);
  for (const image of json.images ?? []) {
    assert.equal(image.mimeType, 'image/png');
    assert.equal(typeof image.bufferView, 'number', '贴图应嵌入 GLB，离线也可展示');
    assert.ok(json.bufferViews[image.bufferView]?.byteLength > 0, '嵌入贴图应包含图片数据');
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
function maximumPoseAngle(a, b) {
  let maximum = 0;
  for (let index = 0; index < a.length; index += 4) {
    maximum = Math.max(maximum, new THREE.Quaternion().fromArray(a, index).angleTo(new THREE.Quaternion().fromArray(b, index)));
  }
  return maximum;
}

test('演示分八组轮换全部八十种原版鱼，跨轮次保持会话与鱼种身份', () => {
  assert.equal(DEMO_GROUP_COUNT, 8);
  assert.equal(DEMO_GROUP_TICKS, 12);
  const identities = new Map();
  for (let group = 0; group < DEMO_GROUP_COUNT; group++) {
    const tick = group * DEMO_GROUP_TICKS;
    assert.equal(demoGroup(tick), group);
    assert.equal(demoGroup(tick + DEMO_GROUP_TICKS - 1), group);
    const initial = demoSnapshot(tick).sessions;
    assert.equal(initial.length, 10, '每组只展示十条主鱼，避免首屏拥挤或全量下载');
    assert.deepEqual(demoSnapshot(tick + 7).sessions.map(session => session.id), initial.map(session => session.id));
    for (const session of initial) {
      assert.equal(identities.has(session.id), false, '不同组使用独立会话身份');
      identities.set(session.id, speciesForExhibit(session.id));
    }
    const nextCycle = demoSnapshot(tick + DEMO_GROUP_COUNT * DEMO_GROUP_TICKS).sessions;
    assert.deepEqual(nextCycle.map(session => session.id), initial.map(session => session.id));
    for (const session of nextCycle) assert.equal(speciesForExhibit(session.id), identities.get(session.id));
  }
  assert.equal(identities.size, 80);
  assert.deepEqual(new Set(identities.values()), new Set(templates.keys()));
});

test('八十种原版 GLB 包含蒙皮和贴图，归一尺寸适合展厅，游动保持有限顶点', () => {
  assert.equal(templates.size, 80);
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
  const template = templates.get('horse-mackerel');
  const first = createMuseumFish('horse-mackerel', template);
  const second = createMuseumFish('horse-mackerel', template);
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
  const jaws = { 'great-white-shark': ['jaw', 'upjaw'], 'whale-shark': ['jaw'], anchovy: ['jaw'], koi: ['jaw'] };
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
  const examples = [
    ['horse-mackerel', MUSEUM_SPECIES['horse-mackerel'].spine[0], MUSEUM_SPECIES['horse-mackerel'].spine.at(-1)],
    ['ocean-sunfish', MUSEUM_SPECIES['ocean-sunfish'].spine[0], 'up_Fin'],
  ];
  for (const [id, stable, propulsive] of examples) {
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
  const models = [0, 1.2, -1.2].map(() => createMuseumFish('horse-mackerel', templates.get('horse-mackerel')));
  for (let frame = 0; frame < 120; frame++) {
    models.forEach((model, index) => model.animate(frame / 60, 1, [0, 1.2, -1.2][index]));
  }
  const tail = models.map(model => model.group.getObjectByName(MUSEUM_SPECIES['horse-mackerel'].spine.at(-1)).quaternion.clone());
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
      // 先稳定转向，再用非整周期的步长覆盖数个摆尾周期，保留全顶点精确检查。
      for (let frame = 0; frame < 20; frame++) model.animate(frame * .05, speed, turnRate);
      for (let frame = 0; frame <= 60; frame++) {
        model.animate(1 + frame * .073, speed, turnRate);
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

test('玩家和小动物模型包含嵌入贴图、正确脚底与尺寸，行走后回到站姿', async t => {
  for (const [role, models] of [['玩家', PLAYER_MODELS], ['小动物', COMPANION_MODELS]]) {
    for (const [id, definition] of Object.entries(models)) await t.test(`${role}：${id}`, async () => {
      const template = await loadModel(definition.model);
      const visitor = createMuseumVisitor(template);
      const bounds = new THREE.Box3().setFromObject(visitor.group, true);
      const size = bounds.getSize(new THREE.Vector3());
      assert.ok(Math.abs(bounds.min.y) < .03, '脚底贴合展厅地面');
      const [minimumHeight, maximumHeight] = role === '玩家' ? [1.8, 2.3] : [1.15, 1.8];
      assert.ok(size.y > minimumHeight && size.y < maximumHeight, '模型高度适合展厅');
      assert.ok(size.x > .2 && size.x < 2.5 && size.z > .2 && size.z < 2.5, '模型宽度和厚度有效');
      const meshes = visitor.group.getObjectsByProperty('isMesh', true);
      assert.ok(meshes.some(mesh => mesh.isSkinnedMesh), '保留原版蒙皮');
      if (definition.category === 'villager') assertLoweredSkinArms(visitor.group);
      const joints = visitor.group.getObjectsByProperty('isBone', true);
      const legs = joints.filter(bone => /^Leg_1_[LR](?:_\d+)?$/.test(bone.name));
      assert.ok(legs.length >= 2, '模型左右腿均应参与步行动画');
      const rest = pose(visitor);
      const legRest = legs.map(bone => bone.quaternion.clone());
      visitor.animate(0, 1, .1, true, 4);
      assert.ok(maximumPoseAngle(rest, pose(visitor)) > .1, '行走有可见的骨骼摆动');
      legs.forEach((bone, index) => assert.ok(bone.quaternion.angleTo(legRest[index]) > .1, `${bone.name} 应随步伐摆动`));
      for (const step of [-1, .5, 0]) {
        visitor.animate(1, step, .1, true, 4);
        visitor.group.updateMatrixWorld(true);
        for (const mesh of meshes) {
          const vertex = new THREE.Vector3();
          for (let index = 0; index < mesh.geometry.getAttribute('position').count; index++) {
            mesh.getVertexPosition(index, vertex).applyMatrix4(mesh.matrixWorld);
            assert.ok(vertex.toArray().every(Number.isFinite), '行走时蒙皮和刚性部件顶点保持有限世界坐标');
          }
        }
      }
      for (let index = 0; index < 100; index++) visitor.animate(index * .1, 0, .1);
      legs.forEach((bone, index) => assert.ok(bone.quaternion.angleTo(legRest[index]) < .0001, '停止后双腿恢复站姿'));
      visitor.dispose();
      assert.equal(visitor.group.children.length, 0);
    });
  }
});

function worldVertices(mesh) {
  const result = [];
  const vertex = new THREE.Vector3();
  for (let index = 0; index < mesh.geometry.getAttribute('position').count; index++) {
    mesh.getVertexPosition(index, vertex).applyMatrix4(mesh.matrixWorld);
    result.push(vertex.clone());
  }
  return result;
}

function assertLoweredSkinArms(group) {
  const meshes = group.getObjectsByProperty('isSkinnedMesh', true);
  for (const side of ['L', 'R']) {
    const shoulder = group.getObjectByName(`Arm_1_${side}`).getWorldPosition(new THREE.Vector3());
    const pattern = new RegExp(`^(Arm_[12]|Wrist|Hand)_${side}(?:_Sub)?$`);
    const vertex = new THREE.Vector3();
    let count = 0;
    let height = 0;
    for (const mesh of meshes) {
      const weights = mesh.geometry.getAttribute('skinWeight');
      const indices = mesh.geometry.getAttribute('skinIndex');
      for (let index = 0; index < weights.count; index++) {
        let armWeight = 0;
        for (let slot = 0; slot < 4; slot++) {
          if (pattern.test(mesh.skeleton.bones[indices.getComponent(index, slot)].name)) armWeight += weights.getComponent(index, slot);
        }
        if (armWeight < .8) continue;
        mesh.getVertexPosition(index, vertex).applyMatrix4(mesh.matrixWorld);
        height += vertex.y;
        count++;
      }
    }
    assert.ok(count > 0, `${side} 侧手臂保留实际蒙皮权重`);
    assert.ok(height / count < shoulder.y - .02, `${side} 侧实际手臂顶点自然下垂，不能只移动骨骼而遗漏蒙皮`);
  }
}

test('原有特殊 NPC 的初始双臂自然下垂，调整只作用于独立克隆', async t => {
  for (const id of ['isabelle', 'tomNook', 'timmy']) await t.test(id, async () => {
    const template = await loadModel(COMPANION_MODELS[id].model);
    const original = pose({ group: template });
    const visitor = createMuseumVisitor(template);
    visitor.group.updateMatrixWorld(true);
    for (const side of ['L', 'R']) {
      const shoulder = visitor.group.getObjectByName(`Arm_1_${side}`);
      const wrist = visitor.group.getObjectByName(`Wrist_${side}`);
      assert.ok(shoulder instanceof THREE.Bone && wrist instanceof THREE.Bone);
      const direction = wrist.getWorldPosition(new THREE.Vector3()).sub(shoulder.getWorldPosition(new THREE.Vector3())).normalize();
      assert.ok(direction.y < -.7, `${id} 的 ${side} 侧手臂自然向下`);
    }
    assertLoweredSkinArms(visitor.group);
    assert.deepEqual(pose({ group: template }), original, '调整站姿不能改变共享原始模型');
    visitor.dispose();
  });
});

test('幽幽分身保留无蒙皮的原始结构，刚性部件、呼吸和随行姿态均有效', async () => {
  const template = await loadModel('companions/npc-gstB');
  const visitor = createMuseumVisitor(template);
  const other = createMuseumVisitor(template);
  const group = visitor.group;
  group.updateMatrixWorld(true);
  const head = group.getObjectByName('Head');
  const meshes = group.getObjectsByProperty('isMesh', true);
  assert.ok(head instanceof THREE.Object3D && !(head instanceof THREE.Bone), '原版分身通过普通 Head 变换层挂载');
  assert.equal(group.getObjectsByProperty('isBone', true).length, 0, '保留原版刚性结构，不虚构双腿或蒙皮骨骼');
  assert.equal(group.getObjectsByProperty('isSkinnedMesh', true).length, 0);
  assert.ok(meshes.length > 0);
  assert.deepEqual(new Set(head.getObjectsByProperty('isMesh', true)), new Set(meshes), '所有身体与面部部件均跟随原 Head 层级');
  const bounds = new THREE.Box3().setFromObject(group, true);
  const size = bounds.getSize(new THREE.Vector3());
  assert.ok(Math.abs(bounds.min.y) < .03 && size.y > 1.15 && size.y < 1.8, '原始身体归一化到地面与展厅尺寸');
  assert.ok(size.x > .2 && size.x < 2.5 && size.z > .2 && size.z < 2.5);
  let breathing = false;
  let leaning = false;
  let previousLean = 0;
  for (let frame = 0; frame < 900; frame++) {
    const walking = frame >= 360 && frame < 540;
    visitor.animate(frame / 60, walking ? Math.sin(frame * .13) : 0, 1 / 60, walking, walking ? 4 : 0);
    if (Math.abs(group.scale.y - 1) > .001) breathing = true;
    if (Math.abs(group.rotation.x) > .03) leaning = true;
    assert.ok(Math.abs(group.rotation.x - previousLean) < .006, '无骨骼身体的走停姿态也逐帧平滑');
    previousLean = group.rotation.x;
    if (frame % 60) continue;
    group.updateMatrixWorld(true);
    for (const mesh of meshes) for (const vertex of worldVertices(mesh)) {
      assert.ok(vertex.toArray().every(Number.isFinite), '所有刚性部件在呼吸与随行时保持有限世界顶点');
    }
  }
  assert.ok(breathing && leaning, '刚性身体也有可见呼吸与随行前倾');
  assert.ok(Math.abs(group.rotation.x) < .0001, '停止后回到静止姿态');
  assert.deepEqual(other.group.scale.toArray(), [1, 1, 1], '呼吸只作用于自身克隆');
  assert.deepEqual(other.group.quaternion.toArray(), [0, 0, 0, 1], '随行动作不污染另一角色');
  for (let frame = 0; frame < 120; frame++) {
    other.animate(frame / 60, 1, 1 / 60, true, 1);
    visitor.animate(frame / 60, 1, 1 / 60, true, 4);
  }
  assert.ok(Math.abs(group.rotation.x) > Math.abs(other.group.rotation.x) * 2, '刚性角色也根据实际速度进入跑姿');
  for (let frame = 0; frame < 180; frame++) visitor.animate(frame / 60, 0, 1 / 60);
  assert.ok(Math.abs(group.rotation.x) < .0001, '跑动结束后恢复直立');
  visitor.dispose();
  other.dispose();
  assert.equal(group.children.length, 0);
});

test('玩家头发与帽子绑定到主头骨，初始蒙皮不变，转头时完整同步且不会重复旋转', async t => {
  for (const [id, definition] of Object.entries(PLAYER_MODELS)) await t.test(id, async () => {
    const model = clone(await loadModel(definition.model));
    model.updateMatrixWorld(true);
    const meshes = model.getObjectsByProperty('isMesh', true);
    const before = new Map(meshes.map(mesh => [mesh, worldVertices(mesh)]));
    const head = attachVisitorHeadAccessories(model);
    assert.ok(head instanceof THREE.Bone);
    assert.equal(attachVisitorHeadAccessories(model), head, '重复调用不重复挂载');
    for (const mesh of meshes) worldVertices(mesh).forEach((vertex, index) => {
      assert.ok(vertex.distanceTo(before.get(mesh)[index]) < 1e-5, '挂载不改变任何初始蒙皮顶点');
    });
    const headRest = head.matrixWorld.clone();
    const accessories = meshes.filter(mesh => /hair|cap|hat/i.test(mesh.name));
    assert.ok(accessories.length > 0, '实际玩家模型包含头发或帽子');
    head.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), .18));
    model.updateMatrixWorld(true);
    const transform = head.matrixWorld.clone().multiply(headRest.invert());
    let moved = false;
    for (const mesh of accessories) worldVertices(mesh).forEach((vertex, index) => {
      const expected = before.get(mesh)[index].clone().applyMatrix4(transform);
      assert.ok(vertex.distanceTo(expected) < 1e-5, '附属部件与身体头部共享相同变换');
      if (vertex.distanceTo(before.get(mesh)[index]) > .001) moved = true;
    });
    assert.ok(moved, '转头会真实移动头发和帽子');
  });
});

test('玩家和小动物站立时呼吸、看鱼与手臂自然变化，双脚稳定且克隆互不影响', async t => {
  for (const definition of [...Object.values(PLAYER_MODELS), ...Object.values(COMPANION_MODELS)]) await t.test(definition.name, async () => {
    const template = await loadModel(definition.model);
    const visitor = createMuseumVisitor(template);
    const other = createMuseumVisitor(template);
    const otherRest = pose(other);
    const templateRest = pose({ group: template });
    const bones = visitor.group.getObjectsByProperty('isBone', true);
    const resting = new Map(bones.map(bone => [bone, bone.quaternion.clone()]));
    const changes = new Map(bones.map(bone => [bone, 0]));
    let breathing = false;
    for (let frame = 0; frame < 900; frame++) {
      visitor.animate(frame / 60, 0, 1 / 60);
      if (Math.abs(visitor.group.scale.y - 1) > .001) breathing = true;
      for (const bone of bones) changes.set(bone, Math.max(changes.get(bone), bone.quaternion.angleTo(resting.get(bone))));
    }
    assert.ok(breathing, '站立时保持轻微呼吸');
    for (const pattern of [/^Head$/, /^Spine_2(?:_\d+)?$/, /^Arm_1_[LR](?:_\d+)?$/, /^Wrist_[LR](?:_\d+)?$/]) {
      const joints = bones.filter(bone => pattern.test(bone.name));
      assert.ok(joints.length > 0 && joints.some(bone => changes.get(bone) > .005), `${pattern} 应有可见的小动作`);
    }
    bones.filter(bone => /^Leg_1_[LR](?:_\d+)?$/.test(bone.name)).forEach(bone => {
      assert.ok(changes.get(bone) < 1e-6, '站立时双腿不踏步');
    });
    assert.deepEqual(pose(other), otherRest, '独立角色不被其他角色的动作污染');
    assert.deepEqual(pose({ group: template }), templateRest, '共享模板保持静止原姿态');
    visitor.dispose();
    other.dispose();
  });
});

test('驻足前五秒即可看见转头、侧身和抬手看鱼，双脚保持原位', async t => {
  const models = [...Object.values(PLAYER_MODELS), ...['isabelle', 'raymond', 'audie'].map(id => COMPANION_MODELS[id])];
  for (const definition of models) await t.test(definition.name, async () => {
    const visitor = createMuseumVisitor(await loadModel(definition.model));
    visitor.group.updateMatrixWorld(true);
    const head = visitor.group.getObjectByName('Head');
    const spine = visitor.group.getObjectByName('Spine_2');
    const wrists = ['L', 'R'].map(side => visitor.group.getObjectByName(`Wrist_${side}`));
    const feet = ['L', 'R'].map(side => visitor.group.getObjectByName(`Leg_1_${side}`));
    const headRest = head.quaternion.clone();
    const spineRest = spine.quaternion.clone();
    const wristRest = wrists.map(bone => bone.getWorldPosition(new THREE.Vector3()));
    const feetRest = feet.map(bone => bone.getWorldPosition(new THREE.Vector3()));
    let headMotion = 0;
    let bodyMotion = 0;
    let handMotion = 0;
    for (let frame = 0; frame < 300; frame++) {
      visitor.animate(frame / 60, 0, 1 / 60);
      visitor.group.updateMatrixWorld(true);
      headMotion = Math.max(headMotion, head.quaternion.angleTo(headRest));
      bodyMotion = Math.max(bodyMotion, spine.quaternion.angleTo(spineRest));
      wrists.forEach((bone, index) => {
        handMotion = Math.max(handMotion, bone.getWorldPosition(new THREE.Vector3()).distanceTo(wristRest[index]));
      });
      feet.forEach((bone, index) => {
        assert.ok(bone.getWorldPosition(new THREE.Vector3()).distanceTo(feetRest[index]) < .015, '呼吸时脚底保持稳定，不滑步');
      });
    }
    assert.ok(headMotion > .1, '自然抬头转头，在正常观察时间内可以辨认');
    assert.ok(bodyMotion > .025, '上身轻微改变重心');
    assert.ok(handMotion > .06, '手臂的微动作实际移动手部，而非只修改不可见骨骼');
    visitor.dispose();
  });
});

test('角色站立和行走切换平滑，周期性抬手不会发生姿态跳变', async t => {
  for (const definition of [...Object.values(PLAYER_MODELS), ...Object.values(COMPANION_MODELS)]) await t.test(definition.name, async () => {
    const visitor = createMuseumVisitor(await loadModel(definition.model));
    let previous = pose(visitor);
    for (let frame = 0; frame < 1800; frame++) {
      const walking = frame >= 360 && frame < 540;
      const step = walking ? Math.sin((frame - 360) * .13) : 0;
      visitor.animate(frame / 60, step, 1 / 60, walking, walking ? 4 : 0);
      const current = pose(visitor);
      assert.ok(maximumPoseAngle(previous, current) < .12, '逐帧姿态保持平滑，包括走停与动作周期边界');
      assert.ok(visitor.group.scale.toArray().every(Number.isFinite));
      previous = current;
    }
    visitor.dispose();
  });
});

test('村民眼镜处于头部附近，杰克与莫妮卡转头时附件完整跟随', async t => {
  const names = {
    raymond: ['AccessoryGlass1__mGlass', 'AccessoryGlass1__mGlassAlpha'],
    audie: ['GlassAlpha__mGlassCap'],
  };
  for (const [id, meshes] of Object.entries(names)) await t.test(id, async () => {
    const model = await loadModel(COMPANION_MODELS[id].model);
    model.updateMatrixWorld(true);
    const height = new THREE.Box3().setFromObject(model, true).getSize(new THREE.Vector3()).y;
    const head = model.getObjectByName('Head');
    assert.ok(head instanceof THREE.Bone);
    const accessories = meshes.map(name => {
      const mesh = model.getObjectByName(name);
      assert.ok(mesh instanceof THREE.Mesh, `保留原版眼镜部件 ${name}`);
      assert.ok(new THREE.Box3().setFromObject(mesh, true).min.y > height * .5, `${name} 应在头部附近，不能落在脚边`);
      return mesh;
    });
    const before = new Map(accessories.map(mesh => [mesh, worldVertices(mesh)]));
    const headRest = head.matrixWorld.clone();
    head.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), .16));
    model.updateMatrixWorld(true);
    const transform = head.matrixWorld.clone().multiply(headRest.invert());
    let moved = false;
    for (const mesh of accessories) worldVertices(mesh).forEach((vertex, index) => {
      const expected = before.get(mesh)[index].clone().applyMatrix4(transform);
      assert.ok(vertex.distanceTo(expected) < 1e-5, `${mesh.name} 应随主头骨同步变换`);
      if (vertex.distanceTo(before.get(mesh)[index]) > .001) moved = true;
    });
    assert.ok(moved, '转头会真实移动眼镜附件');
  });
});

test('角色随实际速度进入跑姿，屈膝、摆臂与前倾不会替代停下后的自然站姿', async t => {
  for (const definition of [...Object.values(PLAYER_MODELS), ...Object.values(COMPANION_MODELS)]) await t.test(definition.name, async () => {
    const template = await loadModel(definition.model);
    const slow = createMuseumVisitor(template);
    const fast = createMuseumVisitor(template);
    const knee = fast.group.getObjectByName('Leg_2_R');
    const arm = fast.group.getObjectByName('Arm_2_R');
    assert.ok(knee instanceof THREE.Bone && arm instanceof THREE.Bone);
    const kneeRest = knee.quaternion.clone();
    const armRest = arm.quaternion.clone();
    for (let frame = 0; frame < 120; frame++) {
      slow.animate(frame / 60, 1, 1 / 60, true, 1);
      fast.animate(frame / 60, 1, 1 / 60, true, 4);
    }
    assert.ok(Math.abs(fast.group.rotation.x) > Math.abs(slow.group.rotation.x) * 2, '跑动时身体自然向前倾');
    assert.ok(knee.quaternion.angleTo(kneeRest) > .15, '抬起后腿时有屈膝动作');
    assert.ok(arm.quaternion.angleTo(armRest) > .15, '跑步时前臂弯曲');
    for (let frame = 0; frame < 180; frame++) fast.animate(2 + frame / 60, 0, 1 / 60);
    assert.ok(Math.abs(fast.group.rotation.x) < .0001, '停下后不保持跑步前倾');
    assert.ok(knee.quaternion.angleTo(kneeRest) < .0001, '双腿回到站姿');
    slow.dispose();
    fast.dispose();
  });
});
