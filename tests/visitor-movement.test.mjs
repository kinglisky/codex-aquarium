import assert from 'node:assert/strict';
import test from 'node:test';
import { createVisitorMovement, VISITOR_KEYS } from '../src/visitor-movement.ts';
import { VISITOR_LIMIT } from '../src/aquarium-layout.ts';

const NONE = new Set();
const STEP = 1 / 60;
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} ≈ ${expected}`);
function advance(movement, keys = NONE, frames = 120) {
  for (let frame = 0; frame < frames; frame++) movement.update(STEP, keys);
}

test('只接管 A/D 与左右方向键，同向按键使用相同起跑速度', () => {
  const directions = [['KeyA', -1], ['ArrowLeft', -1], ['KeyD', 1], ['ArrowRight', 1]];
  assert.deepEqual([...VISITOR_KEYS].sort(), directions.map(([key]) => key).sort());
  for (const [key, direction] of directions) {
    const movement = createVisitorMovement();
    movement.update(STEP, new Set([key]));
    assert.ok(movement.position.x * direction > 0);
    assert.ok(movement.speed > 0 && movement.speed < 1, '第一帧平滑起跑');
    close(movement.position.y, 2.4);
    close(movement.distance, Math.abs(movement.position.x));
  }
});

test('按住方向键加速到跑速，松开后短距离刹停而不长期滑行', () => {
  const movement = createVisitorMovement();
  let previous = 0;
  for (let frame = 0; frame < 30; frame++) {
    movement.update(STEP, new Set(['KeyD']));
    assert.ok(movement.speed >= previous && movement.speed - previous <= 18 * STEP + 1e-9);
    previous = movement.speed;
  }
  close(movement.speed, 4);
  const releaseX = movement.position.x;
  movement.update(STEP, NONE);
  assert.ok(movement.speed > 0 && movement.speed < 4, '松键时平滑减速');
  advance(movement, NONE, 15);
  close(movement.speed, 0);
  assert.ok(movement.position.x > releaseX && movement.position.x - releaseX < .3, '刹停滑移小于 0.3');
  const resting = movement.position.clone();
  advance(movement);
  assert.deepEqual(movement.position, resting);
});

test('反向输入先刹车再换向，不瞬间反转速度', () => {
  const movement = createVisitorMovement();
  advance(movement, new Set(['KeyD']), 30);
  const before = movement.position.x;
  movement.update(STEP, new Set(['KeyA']));
  assert.ok(movement.position.x > before && movement.speed < 4);
  close(movement.heading, -Math.PI / 2);
  advance(movement, new Set(['KeyA']), 30);
  assert.ok(movement.position.x < before);
  close(movement.heading, Math.PI / 2);
});

test('W/S 与上下方向键无效，重复同向输入不会额外加速', () => {
  const movement = createVisitorMovement();
  advance(movement, new Set(['KeyW', 'KeyS', 'ArrowUp', 'ArrowDown']));
  close(movement.position.x, 0);
  close(movement.position.y, 2.4);
  for (const keys of [['KeyD', 'ArrowRight'], ['KeyD', 'KeyW'], ['ArrowRight', 'ArrowDown']]) {
    const first = createVisitorMovement();
    const second = createVisitorMovement();
    advance(first, new Set(keys), 30);
    advance(second, new Set(['KeyD']), 30);
    close(first.position.x, second.position.x);
    close(first.speed, second.speed);
  }
});

test('点击只使用横向目标，抵达后精确刹停且不反复越过', () => {
  const movement = createVisitorMovement();
  movement.moveTo(1.23, -100);
  advance(movement);
  close(movement.position.x, 1.23);
  close(movement.position.y, 2.4);
  close(movement.speed, 0);
  const position = movement.position.clone();
  advance(movement);
  assert.deepEqual(movement.position, position);
});

test('步进按钮横向跑动一步，垂直方向无效', () => {
  for (const [x, z, expected] of [[1, 0, 1.2], [-1, 1, -1.2], [0, 1, 0], [0, -1, 0]]) {
    const movement = createVisitorMovement();
    movement.walk(x, z);
    advance(movement);
    close(movement.position.x, expected);
    close(movement.position.y, 2.4);
    close(movement.distance, 0);
  }
});

test('键盘接管点击目标，相反按键抵消并取消旧路径', () => {
  for (const keys of [['KeyA'], ['KeyA', 'ArrowRight']]) {
    const movement = createVisitorMovement();
    movement.moveTo(4, 4);
    movement.update(STEP, new Set(keys));
    advance(movement);
    assert.ok(movement.position.x <= 0);
    close(movement.speed, 0);
    close(movement.position.y, 2.4);
  }
});

test('跑动、反向和点击越界都停在两侧安全边界', () => {
  for (const [key, boundary] of [['KeyA', -VISITOR_LIMIT], ['KeyD', VISITOR_LIMIT]]) {
    const movement = createVisitorMovement();
    for (let frame = 0; frame < 300; frame++) {
      movement.update(STEP, new Set([key]));
      assert.ok(Math.abs(movement.position.x) <= VISITOR_LIMIT);
      close(movement.position.y, 2.4);
    }
    close(movement.position.x, boundary);
    close(movement.speed, 0);
    movement.moveTo(-boundary * 100, 100);
    advance(movement, NONE, 480);
    close(movement.position.x, -boundary);
    close(movement.speed, 0);
  }
});

test('停止指令立即取消路径与速度，避免窗口失焦后继续跑动', () => {
  const movement = createVisitorMovement();
  movement.moveTo(4, 4);
  advance(movement, NONE, 10);
  assert.ok(movement.speed > 0);
  movement.stop();
  const position = movement.position.clone();
  advance(movement);
  assert.deepEqual(movement.position, position);
  close(movement.speed, 0);
  close(movement.distance, 0);
});

test('不同刷新率下起跑和刹停路程一致，停止时保留最后朝向', () => {
  const positions = [];
  for (const frequency of [30, 60, 120]) {
    const movement = createVisitorMovement();
    for (let frame = 0; frame < frequency / 2; frame++) movement.update(1 / frequency, new Set(['KeyA']));
    for (let frame = 0; frame < frequency / 2; frame++) movement.update(1 / frequency, NONE);
    positions.push(movement.position.x);
    close(movement.speed, 0);
    close(movement.heading, Math.PI / 2);
  }
  assert.ok(Math.max(...positions) - Math.min(...positions) < .02);
});
