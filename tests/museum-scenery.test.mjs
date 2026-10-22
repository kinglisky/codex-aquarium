import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createMuseum } from '../src/museum.ts';
import { createMuseumScenery, sandHeight, SCENERY_MODELS } from '../src/museum-scenery.ts';
import { DEFAULT_SCENERY_STYLE, parseSceneryStyle, SCENERY_KEY, SCENERY_PRESETS } from '../src/scenery-presets.ts';
import { TANK_HALF_WIDTH, TANK_WIDTH } from '../src/aquarium-layout.ts';

const provenance = await Promise.all(['scenery-provenance', 'scenery-groups-provenance', 'scenery-leafy-provenance'].map(async name =>
  JSON.parse(await readFile(new URL(`../public/models/acnh/${name}.json`, import.meta.url)))));
const loader = new GLTFLoader().register(() => ({
  name: 'node_scenery_geometry_validation',
  loadTexture() { return Promise.resolve(new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1)); },
}));
const templates = new Map();
for (const path of Object.values(SCENERY_MODELS)) {
  const data = await readFile(new URL(`../public/models/acnh/${path}.glb`, import.meta.url));
  const report = provenance.flatMap(record => record.models).find(model => model.file === `${path}.glb`);
  assert.ok(report, `${path} 有原版模型出处`);
  assert.equal(createHash('sha256').update(data).digest('hex'), report.sha256);
  assert.ok(provenance.flatMap(record => record.sources).some(source => source.modelId === report.source));
  const jsonLength = data.readUInt32LE(12);
  const document = JSON.parse(data.subarray(20, 20 + jsonLength));
  assert.ok(document.images.length > 0, `${path} 保留内嵌原版贴图`);
  for (const image of document.images) {
    const view = document.bufferViews[image.bufferView];
    const signature = data.subarray(28 + jsonLength + view.byteOffset, 36 + jsonLength + view.byteOffset);
    assert.equal(signature.toString('hex'), '89504e470d0a1a0a');
  }
  const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  templates.set(path, (await loader.parseAsync(buffer, '')).scene);
}

function materials(mesh) {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

function compileSceneryMaterial(mesh) {
  const shader = { uniforms: {}, vertexShader: '#include <begin_vertex>' };
  materials(mesh)[0].onBeforeCompile(shader, null);
  return shader;
}

test('动森布景与砂床保留原版贴图、有效尺寸和接地坐标', () => {
  assert.equal(templates.size, new Set(Object.values(SCENERY_MODELS)).size);
  for (const [path, template] of templates) {
    const bounds = new THREE.Box3().setFromObject(template);
    const size = bounds.getSize(new THREE.Vector3());
    assert.ok(Math.abs(bounds.min.y) < 1e-6, `${path} 接地`);
    assert.ok(size.toArray().every(value => Number.isFinite(value) && value >= 0), `${path} 尺寸有效`);
    assert.ok(size.toArray().filter(value => value > 0).length >= 2, `${path} 至少保留两个有效轴，砂床可为平面`);
    template.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      assert.ok(object.geometry.getAttribute('uv').count > 0);
      assert.ok(materials(object).every(material => material.map), `${path} 不能变成无贴图白模`);
    });
  }
});

test('风格偏好仅接受内置选项，无效持久化值回到默认完整造景', () => {
  assert.equal(DEFAULT_SCENERY_STYLE, 'garden');
  assert.equal(SCENERY_KEY, 'codex-aquarium:scenery');
  for (const [id, metadata] of Object.entries(SCENERY_PRESETS)) {
    assert.equal(parseSceneryStyle(id), id);
    assert.ok(metadata.name.length > 0 && metadata.description.length > 0);
  }
  for (const invalid of [undefined, null, '', 'unknown', 'toString', '__proto__', 1, {}, ['coral']]) {
    assert.equal(parseSceneryStyle(invalid), DEFAULT_SCENERY_STYLE);
  }
});

test('六种造景全部位于缸体内，保留上层巡游空间，每个实际网格纳入避碰', () => {
  for (const style of Object.keys(SCENERY_PRESETS)) {
    const scenery = createMuseumScenery(templates, style);
    assert.equal(scenery.group.children.length === 0, style === 'bare');
    for (const specimen of scenery.group.children) {
      const bounds = new THREE.Box3().setFromObject(specimen, true);
      const name = `${style}/${specimen.name}`;
      assert.ok(bounds.min.x >= -TANK_HALF_WIDTH && bounds.max.x <= TANK_HALF_WIDTH, `${name} 不越过侧玻璃`);
      assert.ok(bounds.min.z >= -6 && bounds.max.z <= 0, `${name} 不越过前后玻璃`);
      assert.ok(bounds.min.y >= .2 && bounds.max.y > .46 && bounds.max.y < 5.55, `${name} 接地并保留上层空间`);
      if (style === 'carpet') assert.ok(bounds.max.y < 2.6, '低草甸只在后缘有少量稍高细叶');
    }
    const meshes = scenery.group.getObjectsByProperty('isMesh', true);
    assert.deepEqual(new Set(scenery.obstacles), new Set(meshes), '整礁中的每个网格都参与避碰，砂床不在布景障碍中');
    if (style !== 'bare') {
      const width = new THREE.Box3().setFromObject(scenery.group, true);
      assert.ok(width.min.x < -9 && width.max.x > 9, `${style} 造景延续到原18米水箱以外`);
    }
    scenery.animate(100);
    assert.ok(scenery.obstacles.every(mesh => mesh.getWorldPosition(new THREE.Vector3()).toArray().every(Number.isFinite)));
    scenery.dispose();
  }
});

test('30米展厅同步延长玻璃、水面、底床、舷窗和照明，保留深度与高度', t => {
  const museum = createMuseum(new THREE.Group(), null, templates);
  t.after(() => museum.dispose());
  const meshes = museum.group.getObjectsByProperty('isMesh', true);
  const front = meshes.find(mesh => mesh.geometry.type === 'PlaneGeometry' && mesh.position.z === .085);
  const water = meshes.find(mesh => mesh.geometry.type === 'PlaneGeometry' && mesh.position.y === 8.4);
  const sand = museum.group.getObjectByName('Undulating sand bed');
  const bare = museum.group.getObjectByName('Bare glass tank floor');
  assert.equal(TANK_WIDTH, 30);
  assert.equal(front.geometry.parameters.width, TANK_WIDTH + .2);
  assert.equal(front.geometry.parameters.height, 8);
  assert.equal(water.geometry.parameters.width, TANK_WIDTH + .1);
  assert.equal(water.geometry.parameters.height, 6);
  assert.equal(sand.geometry.parameters.width, TANK_WIDTH + .1);
  assert.equal(sand.geometry.parameters.height, 5.95);
  assert.equal(sand.material.map.repeat.x, TANK_WIDTH / 3, '砂粒保持原来的物理尺度');
  assert.equal(bare.geometry.parameters.width, TANK_WIDTH);
  assert.equal(bare.geometry.parameters.depth, 5.98);
  const windows = meshes.filter(mesh => mesh.geometry.type === 'CircleGeometry');
  assert.equal(windows.length, Math.floor(TANK_WIDTH / 2.5));
  assert.ok(windows.some(mesh => mesh.position.x < -12) && windows.some(mesh => mesh.position.x > 12));
  const lights = museum.group.children.filter(object => object instanceof THREE.PointLight);
  assert.ok(lights.some(light => light.position.x < -10) && lights.some(light => light.position.x > 10), '两端都有水箱照明');
});

test('完整造景保留原配比，长草分层过渡，草毯只使用原版绿色细草', () => {
  const garden = createMuseumScenery(templates);
  assert.ok(garden.group.children.length >= 38, '保留原来全部摆位，延长部分补植过渡群落');
  for (const specimen of garden.group.children) {
    assert.equal(specimen.scale.x, specimen.scale.y, '扩展摆位，不横向拉胖原版模型');
    assert.equal(specimen.scale.x, specimen.scale.z);
  }
  for (const kind of ['reefLeft', 'reefRight', 'kelpBank', 'kelpCove', 'eelgrass', 'carpet', 'clam', 'urchin', 'scallop', 'starfish']) {
    assert.ok(garden.group.children.some(specimen => specimen.name.startsWith(`${kind}-`)), `保留原来的 ${kind}`);
  }
  garden.dispose();

  const meadow = createMuseumScenery(templates, 'meadow');
  const meadowBounds = meadow.group.children.map(specimen => ({
    depth: specimen.position.z,
    bounds: new THREE.Box3().setFromObject(specimen, true),
  }));
  const tallest = matching => Math.max(...meadowBounds.filter(matching).map(({ bounds }) => bounds.max.y));
  const rear = tallest(({ depth }) => depth < -3.5);
  const middle = tallest(({ depth }) => depth >= -3.5 && depth <= -1.8);
  const front = tallest(({ depth }) => depth > -1.8);
  assert.ok(rear > 5 && middle > 3 && front > 1.5, '后中前景都有足够体量');
  assert.ok(rear > middle && middle > front, '高度向前逐层降低');
  assert.ok(meadowBounds.some(({ bounds, depth }) => depth > -1 && bounds.max.y < 1.3), '最前景保留同族嫩株');
  meadow.dispose();

  const carpet = createMuseumScenery(templates, 'carpet');
  const patches = carpet.group.children.filter(specimen => specimen.name.startsWith('carpet-'));
  assert.ok(patches.length > 0 && patches.length <= Math.ceil(TANK_WIDTH / 6) * 2, '密植细草合并为少量渲染与低层碰撞区域');
  for (const patch of patches) {
    assert.ok(new THREE.Box3().setFromObject(patch, true).max.y < 1.15, '草毯保持贴底');
    const uv = patch.geometry.getAttribute('uv');
    const position = patch.geometry.getAttribute('position');
    for (let vertex = 0; vertex < position.count; vertex++) {
      assert.ok(uv.getX(vertex) > .69 && uv.getY(vertex) < .3, '只取原图集右上角绿色细草，不含青蓝圆叶');
      const lift = position.getY(vertex) - sandHeight(position.getX(vertex), position.getZ(vertex));
      assert.ok(lift >= -.035001 && lift < .22, '每一片细草沿砂床曲面接地，避免整墩悬浮');
    }
  }
  carpet.dispose();
});

test('完整造景保留原效果，其余风格只使用各自对应的原版素材族群', () => {
  const families = {
    garden: ['mCoralSet', 'mCoralSet2', 'mCoralMamenasu', 'mCoralMamenasu2', 'mIwa00', 'mKazari', 'mAquariumPlant', 'mRiverPlant', 'mUmibudou', 'mShakogai', 'mUni', 'mHotate', 'mHitode'],
    meadow: ['mKazari'],
    coral: ['mCoralSet', 'mCoralSet2', 'mCoralMamenasu', 'mCoralMamenasu2', 'mIwa00'],
    stone: ['mIwa00'],
    carpet: ['mAquariumPlant', 'mRiverPlant'],
    bare: [],
  };
  const originals = [...templates.values()].flatMap(template => template.getObjectsByProperty('isMesh', true)).flatMap(materials);
  for (const [style, names] of Object.entries(families)) {
    const scenery = createMuseumScenery(templates, style);
    const actual = scenery.obstacles.flatMap(materials);
    assert.deepEqual(new Set(actual.map(material => material.name)), new Set(names), `${style} 保持单独的造景语言`);
    for (const material of actual) {
      const source = originals.find(original => original.map === material.map);
      assert.ok(source, '实例继续共享原版纹理');
      assert.deepEqual(material.color, source.color, '不通过材质染色覆盖原版贴图');
      assert.equal(material.alphaTest, source.alphaTest, '保留原始透明遮罩');
    }
    scenery.dispose();
  }
});

test('水流材质独立，释放布景不会销毁模板几何或共享原版纹理', () => {
  let geometryDisposed = 0;
  let textureDisposed = 0;
  let templateMaterialDisposed = 0;
  for (const template of templates.values()) template.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.addEventListener('dispose', () => geometryDisposed++);
    for (const material of materials(object)) {
      material.map.addEventListener('dispose', () => textureDisposed++);
      material.addEventListener('dispose', () => templateMaterialDisposed++);
    }
  });
  const first = createMuseumScenery(templates);
  const second = createMuseumScenery(templates);
  const firstMesh = first.obstacles[0];
  const secondMesh = second.obstacles[0];
  assert.notEqual(materials(firstMesh)[0], materials(secondMesh)[0]);
  assert.equal(firstMesh.geometry, secondMesh.geometry);
  assert.equal(materials(firstMesh)[0].map, materials(secondMesh)[0].map);
  let instanceMaterialDisposed = 0;
  const instanceMaterials = new Set(first.obstacles.flatMap(materials));
  for (const material of instanceMaterials) material.addEventListener('dispose', () => instanceMaterialDisposed++);
  first.dispose();
  first.dispose();
  assert.equal(instanceMaterialDisposed, instanceMaterials.size, '所有独立实例材质仅释放一次');
  assert.equal(geometryDisposed + textureDisposed + templateMaterialDisposed, 0);
  assert.ok(second.group.children.length > 0);
  second.dispose();
});

test('草毯合并几何归实例所有，释放时不影响另一实例或原版模板', () => {
  const first = createMuseumScenery(templates, 'carpet');
  const second = createMuseumScenery(templates, 'carpet');
  const source = templates.get(SCENERY_MODELS.carpet).getObjectsByProperty('isMesh', true)[0];
  const firstBatch = first.group.children.filter(mesh => mesh.name.startsWith('carpet-'));
  const secondBatch = second.group.children.filter(mesh => mesh.name.startsWith('carpet-'));
  let disposed = 0;
  let sourceDisposed = 0;
  let secondDisposed = 0;
  source.geometry.addEventListener('dispose', () => sourceDisposed++);
  for (const mesh of firstBatch) {
    assert.notEqual(mesh.geometry, source.geometry);
    mesh.geometry.addEventListener('dispose', () => disposed++);
    assert.equal(materials(mesh)[0].map, materials(source)[0].map, '保留原版贴图与UV，不生成替代草材质');
  }
  for (const mesh of secondBatch) mesh.geometry.addEventListener('dispose', () => secondDisposed++);
  first.dispose();
  first.dispose();
  assert.equal(disposed, firstBatch.length, '每个合并几何恰好释放一次');
  assert.equal(sourceDisposed, 0);
  assert.equal(secondDisposed, 0);
  second.dispose();
  assert.equal(secondDisposed, secondBatch.length);
});

test('草毯按实际株高计算弯曲权重，根部固定、叶尖可动且仍为十个合批', t => {
  const source = templates.get(SCENERY_MODELS.carpet).getObjectsByProperty('isMesh', true)[0].geometry;
  const attributes = Object.keys(source.attributes);
  const originalPosition = source.getAttribute('position').array.slice();
  const scenery = createMuseumScenery(templates, 'carpet');
  t.after(() => scenery.dispose());
  const batches = scenery.group.children.filter(mesh => mesh.name.startsWith('carpet-'));
  assert.equal(batches.length, 10, '水流动画不能拆开已有合批或增加渲染批次');
  for (const mesh of batches) {
    const lift = mesh.geometry.getAttribute('sceneryLift');
    assert.equal(lift.count, mesh.geometry.getAttribute('position').count);
    let roots = 0;
    let tips = 0;
    for (const value of lift.array) {
      assert.ok(Number.isFinite(value) && value >= 0 && value <= 1);
      if (value === 0) roots++;
      if (value === 1) tips++;
    }
    assert.ok(roots > 0 && tips > 0, '低草本身约0.135米高，也必须归一到根部0、叶尖1');
    const { uniforms } = compileSceneryMaterial(mesh);
    assert.equal(uniforms.sceneryAmplitude.value, .04, '细草使用厘米级世界摆幅');
    assert.deepEqual(uniforms.sceneryWorldToLocal.value, new THREE.Matrix3(), '合批世界坐标无需再缩放');
  }
  scenery.animate(50);
  assert.deepEqual(Object.keys(source.attributes), attributes, '不能向共享模板写入合批动画属性');
  assert.deepEqual(source.getAttribute('position').array, originalPosition, '动画不能修改共享模板顶点');
});

test('长草以实际局部根高归一、统一世界流向，岩石珊瑚和贝类保持静止', t => {
  const scenery = createMuseumScenery(templates);
  t.after(() => scenery.dispose());
  const moving = new Set(['mKazari', 'mAquariumPlant', 'mRiverPlant', 'mUmibudou']);
  const phases = new Set();
  for (const mesh of scenery.obstacles) {
    const { uniforms } = compileSceneryMaterial(mesh);
    if (!moving.has(materials(mesh)[0].name)) {
      assert.equal(uniforms.sceneryTime, undefined, '珊瑚、岩石与底栖动物没有植株弯曲 shader');
      continue;
    }
    const bounds = new THREE.Box3().setFromBufferAttribute(mesh.geometry.getAttribute('position'));
    assert.equal(uniforms.sceneryRoot.value, bounds.min.y);
    assert.equal(uniforms.sceneryHeight.value, bounds.max.y - bounds.min.y);
    assert.ok(uniforms.sceneryAmplitude.value > 0 && uniforms.sceneryAmplitude.value <= .16);
    const direction = new THREE.Vector3(.94, 0, .34);
    const local = direction.clone().applyMatrix3(uniforms.sceneryWorldToLocal.value);
    const world = local.applyMatrix3(new THREE.Matrix3().setFromMatrix4(mesh.matrixWorld));
    assert.ok(world.distanceTo(direction) < 1e-10, '不同株高、朝向的水草仍沿同一世界水流弯曲');
    phases.add(uniforms.sceneryPhase.value);
  }
  assert.ok(phases.size > 10, '每株保留不同叶尖摆动相位');
});

test('水草复用展厅水流时钟，静水和暂停不跳动，切换造景继续原有时间', t => {
  const museum = createMuseum(new THREE.Group(), null, templates);
  t.after(() => museum.dispose());
  const first = museum.obstacles.find(mesh => materials(mesh)[0].name === 'mKazari');
  const shader = compileSceneryMaterial(first);
  const time = shader.uniforms.sceneryTime;
  museum.update(10, .8);
  assert.equal(time.value, 0, '首帧只建立时钟基准');
  museum.update(11, .8);
  assert.equal(shader.uniforms.sceneryTime, time, '每帧更新同一 uniform，不重建材质');
  assert.equal(time.value, .8);
  museum.update(12, 0);
  assert.equal(time.value, .8, '静水停在当前相位');
  museum.update(12, 1);
  assert.equal(time.value, .8, '暂停时不累加水流时间');
  museum.update(13, 1.5);
  assert.equal(time.value, 2.3, '改变水流速度时从原相位继续');
  museum.setScenery('carpet');
  const batch = museum.obstacles.find(mesh => mesh.name.startsWith('carpet-'));
  const next = compileSceneryMaterial(batch);
  museum.update(13, 1);
  assert.equal(next.uniforms.sceneryTime.value, 2.3, '新造景继续展厅时钟，无另一个计时器');
});

test('展厅连续切换六种风格时保留底床与障碍数组，仅释放旧造景实例', t => {
  const shared = new Set();
  for (const template of templates.values()) template.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    shared.add(object.geometry);
    for (const material of materials(object)) {
      shared.add(material);
      shared.add(material.map);
    }
  });
  let sharedDisposed = 0;
  const onSharedDispose = () => sharedDisposed++;
  for (const resource of shared) resource.addEventListener('dispose', onSharedDispose);
  t.after(() => { for (const resource of shared) resource.removeEventListener('dispose', onSharedDispose); });

  const museum = createMuseum(new THREE.Group(), null, templates);
  t.after(() => museum.dispose());
  const obstacles = museum.obstacles;
  const bed = museum.group.getObjectByName('Undulating sand bed');
  const bareFloor = museum.group.getObjectByName('Bare glass tank floor');
  assert.ok(bareFloor instanceof THREE.Mesh);
  assert.equal(bareFloor.material.map, null, '裸缸底面不带沙纹贴图');
  const bedResources = [bed.geometry, bed.material, bed.material.map];
  let bedDisposed = 0;
  for (const resource of bedResources) resource.addEventListener('dispose', () => bedDisposed++);
  const disposalCounts = new Map();
  function trackGarden(style) {
    const garden = museum.group.getObjectByName(`ACNH ${style} garden`);
    assert.ok(garden instanceof THREE.Group, `${style} 是唯一挂载的当前造景`);
    const meshes = garden.getObjectsByProperty('isMesh', true);
    assert.equal(meshes.length === 0, style === 'bare');
    const floor = style === 'bare' ? bareFloor : bed;
    assert.equal(museum.obstacles.length, meshes.length + 1, '障碍仅包含当前造景与当前底床');
    assert.ok([...meshes, floor].every(mesh => museum.obstacles.includes(mesh)));
    assert.equal(bed.visible, style !== 'bare');
    assert.equal(bareFloor.visible, style === 'bare');
    for (const material of new Set(meshes.flatMap(materials))) {
      assert.ok(!shared.has(material), '造景实例拥有独立材质');
      disposalCounts.set(material, 0);
      material.addEventListener('dispose', () => disposalCounts.set(material, disposalCounts.get(material) + 1));
    }
    return { garden, materials: new Set(meshes.flatMap(materials)) };
  }

  let previous = trackGarden(DEFAULT_SCENERY_STYLE);
  for (const style of ['meadow', 'coral', 'stone', 'carpet', 'bare', 'garden']) {
    museum.setScenery(style);
    assert.equal(museum.obstacles, obstacles, '物理层持有的障碍数组引用保持稳定');
    assert.equal(museum.group.getObjectByName('Undulating sand bed'), bed, '切换不重建砂床');
    assert.deepEqual([bed.geometry, bed.material, bed.material.map], bedResources);
    assert.equal(bedDisposed, 0, '切换不释放砂床资源');
    assert.equal(previous.garden.parent, null);
    assert.equal(previous.garden.children.length, 0, '旧造景已移除并清空');
    for (const material of previous.materials) assert.equal(disposalCounts.get(material), 1, '旧实例材质释放一次');
    previous = trackGarden(style);
    assert.equal(museum.group.children.filter(child => /^ACNH .* garden$/.test(child.name)).length, 1);
    assert.equal(sharedDisposed, 0, '切换不销毁共享原版资产');
    museum.update(5, 1);
  }
  museum.dispose();
  for (const count of disposalCounts.values()) assert.equal(count, 1, '所有已创建实例材质最终恰好释放一次');
  assert.equal(bedDisposed, bedResources.length, '关闭展厅时释放砂床自己的几何、材质及纹理');
  assert.equal(sharedDisposed, 0, '原版模板资源仍可用于下一次创建展厅');
});

test('展厅起伏砂床参与避碰，砂纹克隆独立释放且不影响模板', t => {
  const source = templates.get(SCENERY_MODELS.sand).getObjectsByProperty('isMesh', true)[0];
  const sourceMaterial = materials(source)[0];
  const originalRepeat = sourceMaterial.map.repeat.clone();
  let templateDisposed = 0;
  for (const resource of [source.geometry, sourceMaterial, sourceMaterial.map]) {
    resource.addEventListener('dispose', () => templateDisposed++);
  }
  const museum = createMuseum(new THREE.Group(), null, templates);
  t.after(() => museum.dispose());
  const bed = museum.group.getObjectByName('Undulating sand bed');
  assert.ok(bed instanceof THREE.Mesh);
  assert.ok(museum.obstacles.includes(bed), '可见砂床本身参与避碰，不能只依赖平坦缸底');
  museum.group.updateMatrixWorld(true);
  const position = bed.geometry.getAttribute('position');
  const point = new THREE.Vector3();
  for (let index = 0; index < position.count; index++) {
    point.fromBufferAttribute(position, index).applyMatrix4(bed.matrixWorld);
    assert.ok(Math.abs(point.y - sandHeight(point.x, point.z)) < 1e-6, '实际砂床世界坐标与造景接地高度一致');
  }
  const texture = bed.material.map;
  assert.ok(texture instanceof THREE.Texture);
  assert.notEqual(texture, sourceMaterial.map);
  assert.equal(texture.image, sourceMaterial.map.image, '沿用原版砂地图片');
  assert.deepEqual(sourceMaterial.map.repeat, originalRepeat, '平铺设置不修改模板');
  assert.ok(bed.material.vertexColors);
  assert.equal(bed.geometry.getAttribute('color').count, position.count);
  let textureDisposed = 0;
  texture.addEventListener('dispose', () => textureDisposed++);
  museum.dispose();
  assert.equal(textureDisposed, 1, '实例砂纹克隆被释放');
  assert.equal(templateDisposed, 0, '模板几何、材质及原版纹理仍归资源加载器管理');
});
