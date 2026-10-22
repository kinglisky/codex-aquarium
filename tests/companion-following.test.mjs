import assert from 'node:assert/strict';
import test from 'node:test';
import { createCompanionFollowing } from '../src/companion-following.ts';
import { createVisitorMovement } from '../src/visitor-movement.ts';
import { DEFAULT_APPEARANCE, parseAppearance, PLAYER_MODELS, COMPANION_MODELS } from '../src/museum-characters.ts';
import { TANK_HALF_WIDTH, VISITOR_LIMIT } from '../src/aquarium-layout.ts';

test('小动物安全跟随实际跑动，转身追赶不重叠、不瞬移或越界', () => {
  const companion = createCompanionFollowing();
  const player = createVisitorMovement();
  for (let frame = 0; frame < 1500; frame++) {
    const direction = frame % 400 < 200 ? 1 : -1;
    const previousPlayer = player.position.x;
    player.update(1 / 60, new Set([direction > 0 ? 'KeyD' : 'KeyA']));
    const previous = companion.position.clone();
    companion.update(player.position.x, Math.sign(player.position.x - previousPlayer), 1 / 60);
    assert.ok(companion.position.distanceTo(previous) <= 5.2 / 60 + 1e-9, '追赶速度受限，不会瞬移');
    assert.ok(Math.hypot(companion.position.x - player.position.x, companion.position.y - 2.4) >= .94, '避开玩家身体');
    assert.ok(Math.abs(companion.position.x) <= TANK_HALF_WIDTH - .2, '小动物始终留在展厅内');
  }
});

test('小动物可跟随玩家到加长展厅的两端，额外侧向站位仍保留安全边距', () => {
  const companion = createCompanionFollowing();
  for (const side of [1, -1]) {
    for (let frame = 0; frame < 600; frame++) companion.update(side * VISITOR_LIMIT, -side, 1 / 60);
    assert.ok(Math.abs(companion.position.x - side * (TANK_HALF_WIDTH - .2)) < .015);
    assert.equal(companion.speed, 0);
  }
});

test('小动物逐渐起跑，能追上跑动玩家并在停下后自然刹停', () => {
  const companion = createCompanionFollowing();
  let previousSpeed = 0;
  for (let frame = 0; frame < 8; frame++) {
    companion.update(4, 1, 1 / 60);
    assert.ok(companion.speed > previousSpeed && companion.speed - previousSpeed <= 24 / 60 + 1e-9);
    previousSpeed = companion.speed;
  }
  assert.ok(companion.speed > 2, '能够进入追赶跑速');
  for (let frame = 0; frame < 600; frame++) companion.update(4, 0, 1 / 60);
  assert.equal(companion.speed, 0);
  assert.equal(companion.distance, 0);
  assert.ok(Math.abs(companion.position.x - 2.85) < .015);
});

test('玩家停下后，小动物追上并回到站姿，不会永久原地踏步', () => {
  const companion = createCompanionFollowing();
  companion.update(4, 1, .016);
  assert.ok(companion.distance > 0);
  for (let frame = 0; frame < 600; frame++) companion.update(4, 0, 1 / 60);
  assert.equal(companion.distance, 0);
  assert.ok(Math.abs(companion.position.x - (4 - 1.15)) < .015);
  const resting = companion.position.clone();
  companion.update(4, 0, .016);
  assert.deepEqual(companion.position, resting);
});

test('再次反向行走会改变追赶方向，途中保持有限坐标', () => {
  const companion = createCompanionFollowing();
  for (const direction of [1, -1, 1]) {
    const playerX = direction * 5;
    for (let frame = 0; frame < 300; frame++) companion.update(playerX, direction, 1 / 60);
    assert.ok(Math.abs(companion.position.x - (playerX - direction * 1.15)) < .015);
    assert.ok(companion.position.toArray().every(Number.isFinite));
  }
});

test('记住有效搭配，损坏或旧版选择回退至实际存在的默认款', () => {
  for (const player of Object.keys(PLAYER_MODELS)) for (const companion of [...Object.keys(COMPANION_MODELS), 'none']) {
    assert.deepEqual(parseAppearance({ player, companion }), { player, companion });
  }
  for (const value of [null, false, 1, 'old', {}, { player: '__proto__', companion: 'constructor' }]) {
    assert.deepEqual(parseAppearance(value), DEFAULT_APPEARANCE);
  }
  assert.deepEqual(parseAppearance({ player: 'deleted-model', companion: 'none' }), { player: DEFAULT_APPEARANCE.player, companion: 'none' });
});
