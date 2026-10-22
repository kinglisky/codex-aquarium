import assert from 'node:assert/strict';
import test from 'node:test';
import { access } from 'node:fs/promises';
import { COMPANION_CATALOG, COMPANION_MODELS, DEFAULT_APPEARANCE, filterCompanions, isCompanionId, parseAppearance } from '../src/museum-characters.ts';

test('目录 ID 唯一，模型与预览路径遵循静态资源合同', () => {
  assert.equal(new Set(COMPANION_CATALOG.map(model => model.id)).size, COMPANION_CATALOG.length);
  for (const model of COMPANION_CATALOG) {
    for (const key of ['id', 'name', 'englishName', 'species', 'model', 'portrait']) assert.ok(model[key].trim(), `${model.id} 缺少 ${key}`);
    assert.ok(['villager', 'special'].includes(model.category));
    assert.ok(model.model.startsWith('companions/') && !model.model.endsWith('.glb'));
    assert.ok(model.portrait.startsWith('portraits/') && !model.portrait.endsWith('.png'));
    assert.equal(COMPANION_MODELS[model.id], model);
  }
});

test('完整目录覆盖 417 位居民、35 个物种与 65 个命名特殊角色，模型和卡片均可用', async () => {
  const villagers = COMPANION_CATALOG.filter(model => model.category === 'villager');
  const special = COMPANION_CATALOG.filter(model => model.category === 'special');
  assert.equal(villagers.length, 417);
  assert.equal(new Set(villagers.map(model => model.species)).size, 35);
  assert.equal(special.length, 65);
  assert.deepEqual(filterCompanions('', '特殊角色'), special);
  await Promise.all(COMPANION_CATALOG.flatMap(model => [
    access(new URL(`../public/models/acnh/${model.model}.glb`, import.meta.url)),
    access(new URL(`../public/models/acnh/${model.portrait}.png`, import.meta.url)),
  ]));
});

test('中文名、英文名和 ID 均可搜索，英文忽略大小写和首尾空格', () => {
  for (const query of ['小润', 'Marshal', '  MARSHAL  ']) assert.ok(filterCompanions(query, '').some(model => model.id === 'marshal'));
  assert.ok(filterCompanions('Tom Nook', '').some(model => model.id === 'tomNook'));
  assert.ok(filterCompanions('tomNook', '').some(model => model.id === 'tomNook'));
  assert.deepEqual(filterCompanions('  ', ''), COMPANION_CATALOG);
});

test('物种与名称共同筛选，不存在的搜索或物种返回空结果', () => {
  const species = COMPANION_MODELS.marshal.species;
  const matching = filterCompanions('', species);
  assert.ok(matching.length > 0);
  assert.ok(matching.every(model => model.species === species));
  assert.ok(filterCompanions('Marshal', species).some(model => model.id === 'marshal'));
  assert.deepEqual(filterCompanions('Raymond', species), []);
  assert.deepEqual(filterCompanions('不存在的小动物 924587', ''), []);
  assert.deepEqual(filterCompanions('', '不存在的物种 924587'), []);
});

test('扩充目录后保留旧版十位旅伴选择，并拒绝原型属性', () => {
  for (const companion of ['isabelle', 'tomNook', 'timmy', 'marshal', 'raymond', 'audie', 'stitches', 'tia', 'zucker', 'apollo', 'none']) {
    assert.equal(isCompanionId(companion), true);
    assert.deepEqual(parseAppearance({ player: 'boy', companion }), { player: 'boy', companion });
  }
  for (const companion of ['__proto__', 'constructor', 'toString', 'unknown-neighbor']) {
    assert.equal(isCompanionId(companion), false);
    assert.equal(parseAppearance({ companion }).companion, DEFAULT_APPEARANCE.companion);
  }
});
