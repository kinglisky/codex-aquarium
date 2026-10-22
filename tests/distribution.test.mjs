import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

async function fixture(t, { shellVersion = '0.1.2', archiveVersion = '0.1.2' } = {}) {
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
  const archive = await readFile(path.join(artifacts, 'codex-aquarium.tgz'));
  const midpoint = Math.ceil(archive.length / 2);
  const parts = ['codex-aquarium.tgz.part-000', 'codex-aquarium.tgz.part-001'];
  await writeFile(path.join(artifacts, parts[0]), archive.subarray(0, midpoint));
  await writeFile(path.join(artifacts, parts[1]), archive.subarray(midpoint));
  async function checksum(files = ['codex-aquarium.tgz', ...parts, 'install.mjs', 'install.sh']) {
    const sums = await Promise.all(files.map(async file =>
      `${createHash('sha256').update(await readFile(path.join(artifacts, file))).digest('hex')}  ${file}`));
    await writeFile(path.join(artifacts, 'SHA256SUMS'), `${sums.join('\n')}\n`);
  }
  await checksum();
  const calls = path.join(directory, 'gh-calls');
  await writeFile(calls, '');
  const gh = path.join(bin, 'gh');
  await writeFile(gh, `#!${process.execPath}
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const args = process.argv.slice(2);
const method = args[args.indexOf('--method') + 1];
const endpoint = args[3];
const payload = args.includes('--input') ? JSON.parse(fs.readFileSync(0, 'utf8')) : null;
fs.appendFileSync(${JSON.stringify(calls)}, JSON.stringify({ method, endpoint, payload }) + '\\n');
const respond = value => { console.log(JSON.stringify(value)); process.exit(0); };
if (endpoint.includes('matching-refs')) respond(process.env.PUBLISHED_FILE ? [{ ref: 'refs/heads/distribution', object: { sha: 'previous' } }] : []);
if (method === 'GET' && endpoint.endsWith('/previous')) respond({ tree: { sha: 'base' } });
if (method === 'GET' && endpoint.includes('git/trees/')) respond({ tree: [{ path: process.env.PUBLISHED_FILE, sha: 'different' }] });
if (endpoint.endsWith('git/blobs')) {
  const content = Buffer.from(payload.content, 'base64');
  respond({ sha: createHash('sha1').update('blob ' + content.length + '\\0').update(content).digest('hex') });
}
if (endpoint.endsWith('git/trees')) respond({ sha: 'tree' });
if (endpoint.endsWith('git/commits')) respond({ sha: 'commit' });
if (endpoint.endsWith('git/refs')) respond({ object: { sha: 'commit' } });
process.exit(23);
`);
  await chmod(gh, 0o755);
  const run = (extraEnv = {}) => spawnSync(process.execPath, [path.join(scripts, 'publish-distribution.mjs')], {
    env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, ...extraEnv },
    encoding: 'utf8', timeout: 10_000,
  });
  return { artifacts, calls, parts, checksum, run };
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

test('raw 发布分片与校验清单，完整归档仅保留在本地', async t => {
  const f = await fixture(t);
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  const calls = (await readFile(f.calls, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  const tree = calls.find(call => call.method === 'POST' && call.endpoint.endsWith('git/trees'));
  assert.deepEqual(tree.payload.tree.map(entry => entry.path), [
    'install.mjs', 'install.sh', ...f.parts, 'SHA256SUMS',
  ].map(file => `v0.1.2/${file}`));
  const blobContents = calls.filter(call => call.endpoint.endsWith('git/blobs')).map(call => Buffer.from(call.payload.content, 'base64'));
  assert.equal(blobContents.at(-1).toString(), await readFile(path.join(f.artifacts, 'SHA256SUMS'), 'utf8'));
});

test('分片损坏时在发布之前退出', async t => {
  const f = await fixture(t);
  await writeFile(path.join(f.artifacts, f.parts[0]), 'tampered');
  const result = f.run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /part-000.*校验失败/);
  assert.equal(await readFile(f.calls, 'utf8'), '');
});

test('独立校验通过但分片组合与归档不符时拒绝发布', async t => {
  const f = await fixture(t);
  await writeFile(path.join(f.artifacts, f.parts[0]), 'different archive');
  await f.checksum();
  const result = f.run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /分片与发行包不一致/);
  assert.equal(await readFile(f.calls, 'utf8'), '');
});

test('分片顺序不连续时拒绝发布', async t => {
  const f = await fixture(t);
  await f.checksum(['codex-aquarium.tgz', f.parts[1], 'install.mjs', 'install.sh']);
  const result = f.run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /分片缺失或顺序不连续/);
  assert.equal(await readFile(f.calls, 'utf8'), '');
});

test('同版本已发布内容不一致时拒绝覆盖', async t => {
  const f = await fixture(t);
  const result = f.run({ PUBLISHED_FILE: 'v0.1.2/install.mjs' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /已发布，拒绝覆盖同版本文件/);
  const calls = (await readFile(f.calls, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  assert.ok(calls.every(call => call.method === 'GET'));
});
