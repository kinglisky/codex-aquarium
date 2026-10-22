import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('发行包按 48 MiB 分片，保留完整市场目录、Shell hooks 与文档截图', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'aquarium-package-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const sources = {
    'package.json': JSON.stringify({ version: '0.1.2' }),
    '.codex-plugin/plugin.json': JSON.stringify({ version: '0.1.2' }),
    '.agents/plugins/marketplace.json': '{}',
    'install.sh': "#!/bin/bash\nVERSION='v0.1.2'\n",
    'dist/index.html': '<html>Aquarium</html>',
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
});
