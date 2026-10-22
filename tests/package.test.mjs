import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('发行包按 48 MiB 分片，保留默认模型与远程清单，不捆绑全量小动物', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'aquarium-package-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const sources = {
    'package.json': JSON.stringify({ version: '0.1.2' }),
    '.codex-plugin/plugin.json': JSON.stringify({ version: '0.1.2' }),
    '.agents/plugins/marketplace.json': '{}',
    'install.sh': "#!/bin/bash\nVERSION='v0.1.2'\n",
    'dist/index.html': '<html>Aquarium</html>',
    'dist/models/acnh/companions/isabelle.glb': 'default companion',
    'dist/models/acnh/companions/remote-villager.glb': 'optional companion',
    'dist/models/acnh/portraits/remote-villager.webp': 'portrait',
    'public/models/acnh/companions/isabelle.glb': 'default companion',
    'public/models/acnh/companions/remote-villager.glb': 'optional companion',
    'server/cli.mjs': 'console.log("start");',
    'hooks/observe.mjs': 'console.log("observe");',
    'hooks/start.sh': '#!/bin/sh\nexit 0\n',
    'hooks/hooks.json': '{}',
    'skills/aquarium/SKILL.md': '# Aquarium',
    'skills/setup/SKILL.md': '# Setup',
    'scripts/install.mjs': 'console.log("install");',
    'docs/screenshots/museum-gallery.jpg': 'gallery',
    'docs/screenshots/museum-meadow.jpg': 'meadow',
    'docs/screenshots/aquarium-live.png': 'live',
    'docs/screenshots/aquarium-glass.png': 'glass',
    'docs/screenshots/plugin-configuration.png': 'configuration',
    'README.md': '# Aquarium',
    'README.en.md': '# Aquarium',
    'CHANGELOG.md': '# Changelog',
    'LICENSE': 'MIT',
    'artifacts/codex-aquarium.tgz.part-999': 'stale',
  };
  for (const [file, content] of Object.entries(sources)) {
    await mkdir(path.dirname(path.join(directory, file)), { recursive: true });
    await writeFile(path.join(directory, file), content);
  }
  await copyFile(new URL('../scripts/package.mjs', import.meta.url), path.join(directory, 'scripts/package.mjs'));
  await copyFile(new URL('../scripts/model-assets.mjs', import.meta.url), path.join(directory, 'scripts/model-assets.mjs'));
  for (const args of [['init', '--quiet'], ['add', 'public'], [
    '-c', 'user.name=Aquarium Test', '-c', 'user.email=test@example.invalid', 'commit', '--quiet', '-m', 'fixture',
  ]]) {
    const result = spawnSync('git', args, { cwd: directory, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  }
  await writeFile(path.join(directory, 'dist/model.glb'), randomBytes(48 * 1024 * 1024 + 1024));
  const result = spawnSync(process.execPath, [path.join(directory, 'scripts/package.mjs')], {
    encoding: 'utf8', timeout: 30_000,
  });
  assert.equal(result.status, 0, result.stderr);
  const artifacts = path.join(directory, 'artifacts');
  const parts = (await readdir(artifacts)).filter(file => file.includes('.part-')).sort();
  assert.deepEqual(parts, ['codex-aquarium.tgz.part-000', 'codex-aquarium.tgz.part-001']);
  assert.equal((await stat(path.join(artifacts, parts[0]))).size, 48 * 1024 * 1024);
  const archive = await readFile(path.join(artifacts, 'codex-aquarium.tgz'));
  assert.deepEqual(Buffer.concat(await Promise.all(parts.map(file => readFile(path.join(artifacts, file))))), archive);
  const lines = (await readFile(path.join(artifacts, 'SHA256SUMS'), 'utf8')).trim().split('\n');
  assert.equal(lines.length, 5);
  for (const line of lines) {
    const [digest, file] = line.split('  ');
    assert.equal(createHash('sha256').update(await readFile(path.join(artifacts, file))).digest('hex'), digest);
  }
  for (const file of ['hooks/start.sh', 'hooks/observe.mjs', 'skills/setup/SKILL.md', 'docs/screenshots/museum-meadow.jpg', 'dist/index.html', '.codex-plugin/plugin.json', '.agents/plugins/marketplace.json']) {
    assert.equal(await readFile(path.join(artifacts, 'marketplace', file), 'utf8'), sources[file]);
  }
  assert.equal((await stat(path.join(artifacts, 'marketplace/dist/model.glb'))).size, 48 * 1024 * 1024 + 1024);
  const marketplace = path.join(artifacts, 'marketplace');
  assert.equal(await readFile(path.join(marketplace, 'dist/models/acnh/companions/isabelle.glb'), 'utf8'), 'default companion');
  assert.equal(await readFile(path.join(marketplace, 'dist/models/acnh/portraits/remote-villager.webp'), 'utf8'), 'portrait');
  await assert.rejects(stat(path.join(marketplace, 'dist/models/acnh/companions/remote-villager.glb')), { code: 'ENOENT' });
  const manifest = JSON.parse(await readFile(path.join(marketplace, 'server/model-manifest.json'), 'utf8'));
  assert.match(manifest.baseUrl, /^https:\/\/raw\.githubusercontent\.com\/kinglisky\/codex-aquarium\/[a-f0-9]{40}\/public\/models\/acnh\/$/);
  assert.deepEqual(manifest.models['companions/remote-villager.glb'], {
    size: Buffer.byteLength('optional companion'),
    sha256: createHash('sha256').update('optional companion').digest('hex'),
  });
  const contents = spawnSync('tar', ['-tzf', path.join(artifacts, 'codex-aquarium.tgz')], { encoding: 'utf8' });
  assert.equal(contents.status, 0, contents.stderr);
  assert.match(contents.stdout, /server\/model-manifest\.json/);
  assert.doesNotMatch(contents.stdout, /companions\/remote-villager\.glb/);
});
