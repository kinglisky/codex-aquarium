import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { loadMuseumAssets } from '../src/museum-assets.ts';
import { MUSEUM_SPECIES } from '../src/museum-fish.ts';

function model() {
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, .5, .5), new THREE.MeshStandardMaterial({ map: new THREE.Texture() }));
  const disposed = { geometry: 0, material: 0, texture: 0 };
  mesh.geometry.addEventListener('dispose', () => disposed.geometry++);
  mesh.material.addEventListener('dispose', () => disposed.material++);
  mesh.material.map.addEventListener('dispose', () => disposed.texture++);
  group.add(mesh);
  return { group, disposed };
}

test('成功切换后释放旧旅伴，保留当前玩家、旅伴和鱼，避免浏览目录时累积资源', async t => {
  const loaded = new Map();
  t.mock.method(GLTFLoader.prototype, 'loadAsync', async path => {
    const asset = model();
    loaded.set(path, asset);
    return { scene: asset.group };
  });
  const assets = await loadMuseumAssets();
  const initial = loaded.get('/models/acnh/companions/isabelle.glb');
  const player = loaded.get('/models/acnh/character.glb');
  await assets.loadFish('whale-shark');
  const fish = loaded.get('/models/acnh/fish/whale-shark.glb');
  await assets.loadCharacter('companions/cat00');
  assert.equal(initial.disposed.geometry, 0, '新模型就绪前原搭配仍可使用');
  assets.retainCharacters(['character', 'companions/cat00']);
  await Promise.resolve();
  assert.deepEqual(initial.disposed, { geometry: 1, material: 1, texture: 1 });
  assert.equal(player.disposed.geometry, 0);
  assert.equal(fish.disposed.geometry, 0);
  const current = loaded.get('/models/acnh/companions/cat00.glb');
  assert.equal(await assets.loadCharacter('companions/cat00'), current.group);
  assets.dispose();
  for (const asset of loaded.values()) assert.deepEqual(asset.disposed, { geometry: 1, material: 1, texture: 1 });
});

test('旧请求失败不能删除同路径的新请求，关闭展厅后迟到模型也会释放', async t => {
  const requests = [];
  t.mock.method(GLTFLoader.prototype, 'loadAsync', path => {
    if (!path.includes('/delayed.glb')) return Promise.resolve({ scene: model().group });
    return new Promise((resolve, reject) => requests.push({ resolve, reject }));
  });
  const assets = await loadMuseumAssets();
  const old = assets.loadCharacter('companions/delayed');
  const rejected = assert.rejects(old, /下载失败/);
  assets.retainCharacters(['character', 'companions/isabelle']);
  const current = assets.loadCharacter('companions/delayed');
  requests[0].reject(new Error('下载失败'));
  await rejected;
  assert.equal(assets.loadCharacter('companions/delayed'), current);
  assets.dispose();
  const late = model();
  requests[1].resolve({ scene: late.group });
  await assert.rejects(current, /展厅已关闭/);
  assert.deepEqual(late.disposed, { geometry: 1, material: 1, texture: 1 });
});

test('进入展厅只加载人物和布景，八十种鱼按需加载且同种并发请求复用', async t => {
  const paths = [];
  let finish;
  const source = model();
  t.mock.method(GLTFLoader.prototype, 'loadAsync', path => {
    paths.push(path);
    if (!path.includes('/fish/')) return Promise.resolve({ scene: model().group });
    return new Promise(resolve => { finish = resolve; });
  });
  const assets = await loadMuseumAssets();
  assert.ok(paths.length > 0);
  assert.equal(paths.filter(path => path.includes('/fish/')).length, 0);
  assert.deepEqual(Object.keys(assets.fish), []);
  const pending = assets.loadFish('whale-shark');
  assert.equal(assets.loadFish('whale-shark'), pending);
  assert.deepEqual(paths.filter(path => path.includes('/fish/')), ['/models/acnh/fish/whale-shark.glb']);
  finish({ scene: source.group });
  const template = await pending;
  assert.equal(assets.fish['whale-shark'], template);
  assert.equal(await assets.loadFish('whale-shark'), template);
  assert.ok(template.getObjectById(source.group.id), '缓存保存真实模型的归一化模板');
  const size = new THREE.Box3().setFromObject(template).getSize(new THREE.Vector3());
  assert.ok(Math.abs(size.x - MUSEUM_SPECIES['whale-shark'].length) < 1e-6);
  assets.dispose();
  assert.deepEqual(Object.keys(assets.fish), []);
  assert.deepEqual(source.disposed, { geometry: 1, material: 1, texture: 1 });
});

test('鱼下载失败清除请求缓存，后续请求能够重试并缓存成功模板', async t => {
  const requests = [];
  t.mock.method(GLTFLoader.prototype, 'loadAsync', path => {
    if (!path.includes('/fish/')) return Promise.resolve({ scene: model().group });
    return new Promise((resolve, reject) => requests.push({ resolve, reject }));
  });
  const assets = await loadMuseumAssets();
  const first = assets.loadFish('whale-shark');
  const rejected = assert.rejects(first, /网络中断/);
  requests[0].reject(new Error('网络中断'));
  await rejected;
  assert.equal(assets.fish['whale-shark'], undefined);
  const second = assets.loadFish('whale-shark');
  assert.notEqual(second, first);
  assert.equal(requests.length, 2);
  const source = model();
  requests[1].resolve({ scene: source.group });
  const template = await second;
  assert.equal(assets.fish['whale-shark'], template);
  assert.equal(assets.loadFish('whale-shark'), second);
  assets.dispose();
  assert.deepEqual(source.disposed, { geometry: 1, material: 1, texture: 1 });
});

test('关闭展厅后迟到的鱼释放全部资源，不复活鱼缓存且不再发起下载', async t => {
  let finish;
  let downloads = 0;
  t.mock.method(GLTFLoader.prototype, 'loadAsync', path => {
    if (!path.includes('/fish/')) return Promise.resolve({ scene: model().group });
    downloads++;
    return new Promise(resolve => { finish = resolve; });
  });
  const assets = await loadMuseumAssets();
  const pending = assets.loadFish('whale-shark');
  const rejected = assert.rejects(pending, /展厅已关闭/);
  assets.dispose();
  const late = model();
  finish({ scene: late.group });
  await rejected;
  assert.deepEqual(late.disposed, { geometry: 1, material: 1, texture: 1 });
  assert.deepEqual(Object.keys(assets.fish), []);
  await assert.rejects(assets.loadFish('whale-shark'), /展厅已关闭/);
  assert.equal(downloads, 1);
});

test('下载完成与归一化之间关闭展厅，鱼模板也不能写回缓存', async t => {
  const source = model();
  t.mock.method(GLTFLoader.prototype, 'loadAsync', async path => ({ scene: path.includes('/fish/') ? source.group : model().group }));
  const assets = await loadMuseumAssets();
  const pending = assets.loadFish('whale-shark');
  queueMicrotask(() => assets.dispose());
  await assert.rejects(pending, /展厅已关闭/);
  assert.deepEqual(Object.keys(assets.fish), []);
  assert.deepEqual(source.disposed, { geometry: 1, material: 1, texture: 1 });
});

test('鱼尺寸归一化失败释放原模型，后续有效模型仍能重新加载', async t => {
  const invalid = model();
  invalid.group.scale.setScalar(0);
  const valid = model();
  let downloads = 0;
  t.mock.method(GLTFLoader.prototype, 'loadAsync', async path => {
    if (!path.includes('/fish/')) return { scene: model().group };
    return { scene: downloads++ === 0 ? invalid.group : valid.group };
  });
  const assets = await loadMuseumAssets();
  await assert.rejects(assets.loadFish('whale-shark'), /没有有效的尺寸/);
  assert.deepEqual(invalid.disposed, { geometry: 1, material: 1, texture: 1 });
  assert.deepEqual(Object.keys(assets.fish), []);
  const template = await assets.loadFish('whale-shark');
  assert.equal(assets.fish['whale-shark'], template);
  assert.equal(downloads, 2);
  assets.dispose();
  assert.deepEqual(invalid.disposed, { geometry: 1, material: 1, texture: 1 });
  assert.deepEqual(valid.disposed, { geometry: 1, material: 1, texture: 1 });
});
