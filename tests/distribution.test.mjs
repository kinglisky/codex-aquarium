import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

async function fixture(t, { shellVersion, archiveVersion }) {
  const directory = await mkdtemp(path.join(tmpdir(), 'aquarium-distribution-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const artifacts = path.join(directory, 'artifacts');
  const scripts = path.join(directory, 'scripts');
  const bin = path.join(directory, 'bin');
  const source = path.join(directory, 'source');
  const manifest = path.join(source, 'codex-aquarium', '.codex-plugin');
  await Promise.all([artifacts, scripts, bin, manifest].map(file => mkdir(file, { recursive: true })));
  await copyFile(new URL('../scripts/publish-distribution.mjs', import.meta.url), path.join(scripts, 'publish-distribution.mjs'));
  await writeFile(path.join(directory, 'package.json'), JSON.stringify({ version: '0.1.2' }));
  await writeFile(path.join(manifest, 'plugin.json'), JSON.stringify({ name: 'codex-aquarium', version: archiveVersion }));
  await writeFile(path.join(artifacts, 'install.sh'), `#!/bin/bash\nVERSION='v${shellVersion}'\n`);
  await writeFile(path.join(artifacts, 'install.mjs'), 'console.log("installer");\n');
  const packed = spawnSync('tar', ['-czf', path.join(artifacts, 'codex-aquarium.tgz'), '-C', source, 'codex-aquarium'], { encoding: 'utf8' });
  assert.equal(packed.status, 0, packed.stderr);
  const sums = await Promise.all(['codex-aquarium.tgz', 'install.mjs', 'install.sh'].map(async file =>
    `${createHash('sha256').update(await readFile(path.join(artifacts, file))).digest('hex')}  ${file}`));
  await writeFile(path.join(artifacts, 'SHA256SUMS'), `${sums.join('\n')}\n`);
  const calls = path.join(directory, 'gh-calls');
  await writeFile(calls, '');
  const gh = path.join(bin, 'gh');
  await writeFile(gh, `#!${process.execPath}\nrequire('node:fs').appendFileSync(${JSON.stringify(calls)}, 'called\\n');\nprocess.exit(23);\n`);
  await chmod(gh, 0o755);
  const run = () => spawnSync(process.execPath, [path.join(scripts, 'publish-distribution.mjs')], {
    env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` },
    encoding: 'utf8', timeout: 10_000,
  });
  return { calls, run };
}

test('发布前拒绝旧版 Shell 入口，不请求 GitHub', async t => {
  const f = await fixture(t, { shellVersion: '0.1.1', archiveVersion: '0.1.2' });
  const result = f.run();
  assert.equal(result.status, 1);
  assert.equal(await readFile(f.calls, 'utf8'), '');
  assert.match(result.stderr, /install\.sh.*版本不一致/);
});

test('发布前拒绝旧版归档 manifest，不请求 GitHub', async t => {
  const f = await fixture(t, { shellVersion: '0.1.2', archiveVersion: '0.1.1' });
  const result = f.run();
  assert.equal(result.status, 1);
  assert.equal(await readFile(f.calls, 'utf8'), '');
  assert.match(result.stderr, /发行包.*版本不一致/);
});
