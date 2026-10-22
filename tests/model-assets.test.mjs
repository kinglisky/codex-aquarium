import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createModelManifest, includeBundledModel } from '../scripts/model-assets.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'aquarium-model-assets-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const models = join(root, 'public/models/acnh/companions');
  await mkdir(models, { recursive: true });
  await writeFile(join(models, 'isabelle.glb'), 'default');
  await writeFile(join(models, 'marshal.glb'), 'optional');
  for (const args of [['init', '--quiet'], ['add', 'public'], [
    '-c', 'user.name=Aquarium Test', '-c', 'user.email=test@example.invalid', 'commit', '--quiet', '-m', 'fixture',
  ]]) {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  }
  return { root, models };
}

test('按提交固定下载来源并记录每个小动物的精确长度与 SHA-256', async t => {
  const { root } = await fixture(t);
  const manifest = await createModelManifest(root);
  const revision = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
  assert.equal(manifest.baseUrl, `https://raw.githubusercontent.com/kinglisky/codex-aquarium/${revision}/public/models/acnh/`);
  assert.deepEqual(manifest.models['companions/marshal.glb'], {
    size: 8, sha256: createHash('sha256').update('optional').digest('hex'),
  });
});

test('拒绝尚未提交的模型，避免安装后使用不可下载或不匹配的文件', async t => {
  const { root, models } = await fixture(t);
  await writeFile(join(models, 'marshal.glb'), 'modified');
  await assert.rejects(createModelManifest(root), /尚未提交/);
  await writeFile(join(models, 'marshal.glb'), 'optional');
  await writeFile(join(models, 'new.glb'), 'untracked');
  await assert.rejects(createModelManifest(root), /尚未提交/);
});

test('轻量包只省略可按需下载的小动物，保留默认角色、选项卡与造景资源', () => {
  assert.equal(includeBundledModel('/tmp/dist/models/acnh/companions/isabelle.glb'), true);
  assert.equal(includeBundledModel('/tmp/dist/models/acnh/companions/marshal.glb'), false);
  assert.equal(includeBundledModel('C:\\dist\\models\\acnh\\companions\\marshal.glb'), false);
  for (const file of ['companions', 'portraits/marshal.webp', 'fish/shark.glb', 'character.glb', 'players/boy.glb', 'scenery/grass.glb']) {
    assert.equal(includeBundledModel(`/tmp/dist/models/acnh/${file}`), true);
  }
});
