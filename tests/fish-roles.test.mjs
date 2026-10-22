import assert from 'node:assert/strict';
import test from 'node:test';
import { ACTIVITY_FISH, scaleForFishRole } from '../src/fish-roles.ts';
import { MUSEUM_SPECIES } from '../src/museum-fish.ts';
import { LEADER_FISH_TYPES, speciesForSession } from '../src/sessions.ts';

test('真实会话只选择中大型鱼，不会以蝌蚪、甲壳类或微型鱼担任主鱼', () => {
  assert.ok(LEADER_FISH_TYPES.length > 20, '保留丰富的主鱼种类');
  for (const species of LEADER_FISH_TYPES) {
    assert.ok(MUSEUM_SPECIES[species].length >= 1.35, `${species} 是中大型鱼`);
    assert.ok(!['crab', 'turtle', 'frog', 'squid', 'seahorse'].includes(MUSEUM_SPECIES[species].profile));
  }
  for (let index = 0; index < 1600; index++) {
    assert.ok(LEADER_FISH_TYPES.includes(speciesForSession(`session-${index}`)));
  }
});

test('工具与子 Agent 使用不同的小型游鱼，主鱼实际长度始终明显大于随行鱼', () => {
  assert.deepEqual(Object.keys(ACTIVITY_FISH).sort(), ['agent', 'read', 'terminal', 'tool', 'web', 'write']);
  assert.equal(new Set(Object.values(ACTIVITY_FISH)).size, 6);
  for (const species of Object.values(ACTIVITY_FISH)) {
    const fish = MUSEUM_SPECIES[species];
    assert.ok(fish.length <= .85 && fish.profile === 'standard', `${species} 本身就是小型游鱼`);
    assert.ok(!LEADER_FISH_TYPES.includes(species));
    const agentLength = fish.length * scaleForFishRole(species, 'agent');
    const toolLength = fish.length * scaleForFishRole(species, 'tool');
    assert.ok(Math.abs(agentLength - .6) < 1e-9);
    assert.ok(Math.abs(toolLength - .42) < 1e-9);
    for (const leader of LEADER_FISH_TYPES) {
      const length = MUSEUM_SPECIES[leader].length * scaleForFishRole(leader, 'session');
      assert.ok(length >= 1.7 - 1e-9 && length <= 3.4 + 1e-9, `${leader} 保持中大型体型`);
      assert.ok(length >= agentLength * 2.8 && agentLength > toolLength);
    }
  }
});
