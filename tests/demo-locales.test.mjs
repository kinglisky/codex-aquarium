import assert from 'node:assert/strict';
import test from 'node:test';
import { demoSnapshot, DEMO_GROUP_COUNT, DEMO_GROUP_TICKS } from '../src/demo.ts';

function withoutLabels(snapshot) {
  return {
    ...snapshot,
    sessions: snapshot.sessions.map(({ label, ...session }) => ({
      ...session,
      activities: session.activities.map(({ label, ...activity }) => activity),
    })),
  };
}

test('演示默认保持中文，切换语言不改变八十种鱼及活动的身份或状态', t => {
  t.mock.method(Date, 'now', () => 1_760_000_000_000);
  const identities = new Set();
  for (let group = 0; group < DEMO_GROUP_COUNT; group++) {
    const tick = group * DEMO_GROUP_TICKS;
    const chinese = demoSnapshot(tick, 'zh-CN');
    const english = demoSnapshot(tick, 'en');
    assert.deepEqual(demoSnapshot(tick), chinese);
    assert.deepEqual(withoutLabels(english), withoutLabels(chinese));
    for (const [index, session] of english.sessions.entries()) {
      identities.add(session.id);
      assert.match(session.label, /^Viewing [A-Z]/);
      assert.doesNotMatch(session.label, /\p{Script=Han}/u);
      assert.match(chinese.sessions[index].label, /^观赏 /);
      assert.notEqual(session.label, chinese.sessions[index].label);
    }
  }
  assert.equal(identities.size, 80);
  assert.equal(demoSnapshot(0, 'en').sessions[0].label, 'Viewing Whale shark');
});

test('六类演示活动均有英文说明，并保留原有类别与轮换顺序', t => {
  t.mock.method(Date, 'now', () => 1_760_000_000_000);
  const labels = new Set();
  const categories = new Set();
  for (let phase = 0; phase < 6; phase++) {
    const chinese = demoSnapshot(phase * 3, 'zh-CN');
    const english = demoSnapshot(phase * 3, 'en');
    assert.deepEqual(withoutLabels(english), withoutLabels(chinese));
    for (const activity of english.sessions[0].activities) {
      assert.doesNotMatch(activity.label, /\p{Script=Han}/u);
      assert.ok(activity.label.length > 0);
      labels.add(activity.label);
      categories.add(activity.category);
    }
  }
  assert.equal(labels.size, 6);
  assert.deepEqual(categories, new Set(['agent', 'read', 'write', 'terminal', 'web', 'tool']));
});
