import assert from 'node:assert/strict';
import test from 'node:test';
import catalog from '../src/fish-catalog.json' with { type: 'json' };
import { COMPANION_CATALOG, PLAYER_MODELS } from '../src/museum-characters.ts';
import { SCENERY_PRESETS } from '../src/scenery-presets.ts';
import { fishName, fishDescription, companionName, companionSpeciesName, playerName, sceneryCopy } from '../src/catalog-i18n.ts';

const chinese = /\p{Script=Han}/u;

test('全部八十种鱼都有中英文名称与英文描述，中文文案保持原样', () => {
  assert.equal(Object.keys(catalog).length, 80);
  for (const [id, fish] of Object.entries(catalog)) {
    assert.equal(fishName(id, 'zh-CN'), fish.name);
    assert.equal(fishDescription(id, 'zh-CN'), fish.description);
    assert.equal(fishName(id, 'en'), fish.englishName);
    const description = fishDescription(id, 'en');
    assert.ok(description.length > 10, `${id} 应有英文描述`);
    assert.equal(chinese.test(fishName(id, 'en') + description), false, id);
  }
});

test('所有小动物使用原有英文姓名，全部物种筛选项均已翻译', () => {
  assert.equal(COMPANION_CATALOG.length, 482);
  for (const companion of COMPANION_CATALOG) {
    assert.equal(companionName(companion.id, 'zh-CN'), companion.name);
    assert.equal(companionName(companion.id, 'en'), companion.englishName);
    assert.equal(chinese.test(companionName(companion.id, 'en')), false, companion.id);
  }
  const species = new Set(COMPANION_CATALOG.map(companion => companion.species));
  assert.equal(species.size, 36);
  for (const value of species) {
    assert.equal(companionSpeciesName(value, 'zh-CN'), value);
    assert.equal(chinese.test(companionSpeciesName(value, 'en')), false, value);
    assert.ok(companionSpeciesName(value, 'en').length > 0);
  }
  assert.equal(companionName('none', 'zh-CN'), '独自逛馆');
  assert.equal(companionName('none', 'en'), 'Visit solo');
});

test('两个玩家形象保留原有 ID，名称支持中英文', () => {
  assert.equal(Object.keys(PLAYER_MODELS).length, 2);
  assert.equal(playerName('islander', 'zh-CN'), '小女孩');
  assert.equal(playerName('islander', 'en'), 'Girl');
  assert.equal(playerName('boy', 'zh-CN'), '小男孩');
  assert.equal(playerName('boy', 'en'), 'Boy');
});

test('六种造景保留中文文案，英文名称和介绍均完整', () => {
  assert.equal(Object.keys(SCENERY_PRESETS).length, 6);
  for (const [style, preset] of Object.entries(SCENERY_PRESETS)) {
    assert.deepEqual(sceneryCopy(style, 'zh-CN'), preset);
    const english = sceneryCopy(style, 'en');
    assert.ok(english.name.length > 0);
    assert.ok(english.description.length > 10);
    assert.equal(chinese.test(english.name + english.description), false, style);
  }
});
