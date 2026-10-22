import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createFishFade, createFishPresence, FISH_ARRIVAL_DURATION, FISH_DEPARTURE_DURATION } from '../src/fish-presence.ts';

test('鱼平滑出现与游离，完整体型不随可见度缩放', () => {
  const presence = createFishPresence(10);
  assert.equal(presence.opacity, 0);
  presence.advance(10 + FISH_ARRIVAL_DURATION / 2);
  assert.ok(Math.abs(presence.opacity - .5) < 1e-12);
  assert.equal(presence.advance(12), false);
  assert.equal(presence.opacity, 1);
  presence.setActive(false, 12);
  presence.advance(12 + FISH_DEPARTURE_DURATION / 2);
  assert.ok(Math.abs(presence.opacity - .5) < 1e-12);
  assert.equal(presence.advance(12 + FISH_DEPARTURE_DURATION), true);
  assert.equal(presence.opacity, 0);
});

test('任务短暂结束再激活，从当前可见度反转且重复快照不重置过渡', () => {
  const presence = createFishPresence(0);
  presence.advance(2);
  presence.setActive(false, 2);
  presence.advance(2.5);
  const fading = presence.opacity;
  presence.setActive(true, 2.5);
  assert.equal(presence.opacity, fading);
  assert.equal(presence.removeAt, Infinity);
  presence.setActive(true, 2.6);
  presence.advance(2.8);
  assert.ok(presence.opacity > fading);
  presence.advance(5);
  assert.equal(presence.opacity, 1);
  assert.equal(presence.active, true);
});

test('暂停游动或隐藏页面错过帧时，离场按真实时间结束，不遗留僵尸鱼', () => {
  const presence = createFishPresence(0);
  presence.advance(2);
  presence.setActive(false, 2);
  const deadline = presence.removeAt;
  presence.setActive(false, 3);
  assert.equal(presence.removeAt, deadline);
  assert.equal(presence.advance(600), true);
  assert.equal(presence.opacity, 0);
  assert.equal(presence.advance(601), true);
});

test('短暂任务尚未完全出现便结束时，也能按时清理', () => {
  const presence = createFishPresence(10);
  presence.setActive(false, 10.05);
  assert.ok(presence.removeAt < 10.1);
  assert.equal(presence.advance(11), true);
});

test('淡出隔离同种鱼的材质，保留贴图与原始透明鳍，离场仅释放实例材质一次', () => {
  const original = new THREE.MeshStandardMaterial({ map: new THREE.Texture(), opacity: .7, transparent: true, depthWrite: false });
  const geometry = new THREE.BoxGeometry(2, 1, .3);
  const group = new THREE.Group();
  const first = new THREE.Mesh(geometry, original);
  const second = new THREE.Mesh(geometry, [original]);
  group.add(first, second);
  group.scale.set(1.05, 1.05, 1.05);
  const fade = createFishFade(group);
  const instance = first.material;
  assert.notEqual(instance, original);
  assert.equal(instance, second.material[0]);
  assert.equal(instance.map, original.map);
  fade.setOpacity(.4);
  assert.ok(Math.abs(instance.opacity - .28) < 1e-12);
  assert.equal(instance.alphaHash, true);
  assert.equal(instance.transparent, false);
  assert.equal(original.opacity, .7);
  assert.equal(original.alphaHash, false);
  assert.deepEqual(group.scale.toArray(), [1.05, 1.05, 1.05]);
  fade.setOpacity(1);
  assert.equal(instance.opacity, original.opacity);
  assert.equal(instance.transparent, true);
  assert.equal(instance.depthWrite, false);
  fade.setOpacity(0);
  assert.equal(group.visible, false);
  let disposals = 0;
  instance.addEventListener('dispose', () => disposals++);
  fade.dispose();
  fade.dispose();
  fade.setOpacity(1);
  assert.equal(disposals, 1);
  assert.equal(first.material, original);
  assert.equal(second.material[0], original);
  original.map.dispose();
  original.dispose();
  geometry.dispose();
});
