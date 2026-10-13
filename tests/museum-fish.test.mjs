import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { MUSEUM_SPECIES, createMuseumFish } from '../src/museum-fish.ts';
import { demoSnapshot } from '../src/demo.ts';
import { speciesForSession } from '../src/sessions.ts';

test('演示会话覆盖全部 10 种海鱼，切换演示阶段仍保持同一会话的鱼种身份', () => {
  const initial = demoSnapshot(0).sessions;
  assert.equal(new Set(initial.map(session => speciesForSession(session.id))).size, Object.keys(MUSEUM_SPECIES).length);
  const identities = new Map(initial.map(session => [session.id, speciesForSession(session.id)]));
  for (const tick of [7, 18, 35]) {
    for (const session of demoSnapshot(tick).sessions) {
      assert.equal(speciesForSession(session.id), identities.get(session.id));
    }
  }
});

test('展厅海鱼的形体、顶点和运动均有效，特殊鱼种保留可辨识轮廓', () => {
  const sizes = new Map();
  for (const species of Object.keys(MUSEUM_SPECIES)) {
    const model = createMuseumFish(species);
    const size = new THREE.Box3().setFromObject(model.group).getSize(new THREE.Vector3());
    assert.ok(size.x > 1.2 && size.x < 2.8, `${species} 长度应适合展厅`);
    assert.ok(size.y > 0 && size.z > 0);
    sizes.set(species, size);
    for (const time of [0, 0.8, 8, 150]) {
      model.animate(time, 1.3);
      model.group.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        for (const key of ['position', 'normal', 'color']) {
          const attribute = object.geometry.getAttribute(key);
          if (!attribute) continue;
          assert.ok(Array.from(attribute.array).every(Number.isFinite), `${species} 的 ${key} 不可包含非有限值`);
        }
      });
    }
    model.dispose();
  }
  assert.ok(sizes.get('betta').z > sizes.get('blacktail').z * 3, '鳐鱼应有宽阔的水平翼展');
  assert.ok(sizes.get('swordtail').y > sizes.get('swordtail').x * 1.5, '翻车鱼应有扁高身形及长背腹鳍');
  assert.ok(sizes.get('golden').z > sizes.get('blacktail').z * 1.7, '双髻鲨头部应明显宽于普通鲨鱼');
  assert.ok(sizes.get('tiger').z > sizes.get('neon').z * 2, '狮子鱼应有放射状的胸鳍');
});

test('鳐鱼双翼随时间起伏，鱼体与尾鳍持续摆动，并完整释放 GPU 资源', () => {
  for (const species of ['betta', 'neon']) {
    const model = createMuseumFish(species);
    const body = model.group.getObjectByName('body');
    const tail = model.group.getObjectByName('tail');
    const wing = model.group.getObjectByName('ray-wing');
    model.animate(0, 1);
    const initialBody = Array.from(body.geometry.getAttribute('position').array);
    const initialTail = tail.rotation.y;
    const initialWing = wing && Array.from(wing.geometry.getAttribute('position').array);
    model.animate(0.7, 1);
    assert.notDeepEqual(Array.from(body.geometry.getAttribute('position').array), initialBody);
    assert.notEqual(tail.rotation.y, initialTail);
    if (wing) assert.notDeepEqual(Array.from(wing.geometry.getAttribute('position').array), initialWing);
    const geometries = new Set();
    const materials = new Set();
    model.group.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
    });
    let disposedGeometry = 0;
    let disposedMaterial = 0;
    geometries.forEach(geometry => geometry.addEventListener('dispose', () => disposedGeometry++));
    materials.forEach(material => material.addEventListener('dispose', () => disposedMaterial++));
    model.dispose();
    assert.equal(model.group.children.length, 0);
    assert.equal(disposedGeometry, geometries.size);
    assert.equal(disposedMaterial, materials.size);
  }
});

test('长时间运行后的速度变化保持动作连续，相同时间暂停并平滑恢复', () => {
  function pose(model) {
    const points = [];
    model.group.traverse(object => {
      if (object instanceof THREE.Mesh) points.push(...object.geometry.getAttribute('position').array);
    });
    points.push(model.group.getObjectByName('tail').rotation.y);
    return points;
  }
  const maximumChange = (previous, current) => current.reduce((maximum, value, index) => Math.max(maximum, Math.abs(value - previous[index])), 0);
  for (const species of ['betta', 'neon']) {
    const fresh = createMuseumFish(species);
    const late = createMuseumFish(species);
    fresh.animate(0, 0.65);
    late.animate(600, 0.65);
    assert.deepEqual(pose(late), pose(fresh), '新鱼不应因展厅已运行很久而从任意相位突然开始');
    const initial = pose(late);
    late.animate(600.016, 0.66);
    const next = pose(late);
    assert.ok(maximumChange(initial, next) < 0.025, '轻微调速时，鳍和尾巴不应跳到另一个相位');
    late.animate(600.016, 3);
    assert.deepEqual(pose(late), next, '时间停止时应保持完整姿态，即使任务状态变化');
    late.animate(600.032, 0.66);
    assert.ok(maximumChange(next, pose(late)) < 0.025, '恢复后从暂停前的姿态继续运动');
    fresh.dispose();
    late.dispose();
  }
});
