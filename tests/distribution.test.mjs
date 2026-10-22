import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { chmod, copyFile, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
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
  const publisher = await realpath(path.join(scripts, 'publish-distribution.mjs'));
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
  const calls = path.join(directory, 'git-calls');
  await writeFile(calls, '');
  const remote = path.join(directory, 'remote.git');
  const gitPath = spawnSync('/bin/sh', ['-c', 'command -v git'], { encoding: 'utf8' }).stdout.trim();
  function git(...args) {
    const result = spawnSync(gitPath, args, { cwd: directory, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  }
  git('init', '--quiet');
  git('config', 'user.name', 'Aquarium Test');
  git('config', 'user.email', 'test@example.invalid');
  git('init', '--bare', '--quiet', '--initial-branch', 'distribution', remote);
  git('--git-dir', remote, 'config', 'uploadpack.allowFilter', 'true');
  git('remote', 'add', 'origin', remote);
  const executable = path.join(bin, 'git');
  const objects = path.join(directory, 'transferred-objects');
  // Linux CI uses push; keep real object transfer on macOS despite its unavailable push subprocess.
  await writeFile(executable, `#!${process.execPath}
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(calls)}, JSON.stringify(args) + '\\n');
if (args.includes('push')) {
  const result = spawnSync(${JSON.stringify(gitPath)}, ['--git-dir', args[args.indexOf('--git-dir') + 1], 'cat-file', '--batch-all-objects', '--batch-check=%(objectname)'], { encoding: 'utf8' });
  if (result.status !== 0) process.exit(result.status ?? 1);
  fs.writeFileSync(${JSON.stringify(objects)}, result.stdout);
}
const command = process.platform === 'darwin' && args.includes('push')
  ? ['--git-dir', ${JSON.stringify(remote)}, 'fetch', args[args.indexOf('--git-dir') + 1], 'HEAD:refs/heads/distribution']
  : args;
const result = spawnSync(${JSON.stringify(gitPath)}, command, { stdio: 'inherit' });
process.exit(result.status ?? 1);
`);
  await chmod(executable, 0o755);
  const run = (extraEnv = {}) => spawnSync(process.execPath, [publisher], {
    env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, GITHUB_ACTIONS: 'false', ...extraEnv },
    encoding: 'utf8', timeout: 30_000,
  });
  async function seed(files) {
    for (const [file, content] of Object.entries(files)) {
      const location = path.join(directory, file);
      await mkdir(path.dirname(location), { recursive: true });
      await writeFile(location, content);
      git('--git-dir', remote, '--work-tree', directory, 'add', '--', file);
    }
    git('--git-dir', remote, '--work-tree', directory, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'old release');
    return git('--git-dir', remote, 'rev-parse', 'distribution');
  }
  const readCalls = async () => (await readFile(calls, 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
  return { artifacts, calls, objects, parts, checksum, run, remote, git, seed, readCalls };
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

test('raw 发布向空分支传输真实分片与校验清单，完整归档仅保留在本地', async t => {
  const f = await fixture(t);
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  const files = f.git('--git-dir', f.remote, 'ls-tree', '-r', '--name-only', 'distribution').split('\n');
  assert.deepEqual(files, [
    'install.mjs', 'install.sh', ...f.parts, 'SHA256SUMS',
  ].map(file => `v0.1.2/${file}`).sort());
  for (const file of ['install.mjs', 'install.sh', ...f.parts, 'SHA256SUMS']) {
    const actual = spawnSync('git', ['--git-dir', f.remote, 'show', `distribution:v0.1.2/${file}`]);
    assert.equal(actual.status, 0, actual.stderr.toString());
    assert.deepEqual(actual.stdout, await readFile(path.join(f.artifacts, file)));
  }
  const calls = await f.readCalls();
  assert.deepEqual(calls.find(args => args.includes('push')).slice(-3), ['push', f.remote, 'HEAD:refs/heads/distribution']);
  assert.equal(f.git('--git-dir', f.remote, 'log', '-1', '--format=%an <%ae>'), 'Aquarium Test <test@example.invalid>');
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
  const previous = await f.seed({ 'v0.1.2/install.mjs': 'different' });
  const result = f.run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /已发布，拒绝覆盖同版本文件/);
  assert.equal(f.git('--git-dir', f.remote, 'rev-parse', 'distribution'), previous);
  assert.ok((await f.readCalls()).every(args => !args.includes('push') && !args.includes('hash-object')));
});

test('追加版本保留旧版文件与历史，相同内容重复发布不创建提交', async t => {
  const f = await fixture(t);
  const previous = await f.seed({ 'v0.1.1/install.sh': 'old installer', 'v0.1.1/codex-aquarium.tgz.part-000': 'old blob' });
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  const revision = f.git('--git-dir', f.remote, 'rev-parse', 'distribution');
  assert.equal(f.git('--git-dir', f.remote, 'rev-parse', 'distribution^'), previous);
  assert.equal(f.git('--git-dir', f.remote, 'show', 'distribution:v0.1.1/install.sh'), 'old installer');
  assert.equal(f.git('--git-dir', f.remote, 'show', 'distribution:v0.1.1/codex-aquarium.tgz.part-000'), 'old blob');
  const oldBlob = f.git('--git-dir', f.remote, 'rev-parse', 'distribution:v0.1.1/codex-aquarium.tgz.part-000');
  assert.ok(!(await readFile(f.objects, 'utf8')).split('\n').includes(oldBlob));
  const repeated = f.run();
  assert.equal(repeated.status, 0, repeated.stderr);
  assert.match(repeated.stdout, /已发布，内容一致/);
  assert.equal(f.git('--git-dir', f.remote, 'rev-parse', 'distribution'), revision);
  const calls = await f.readCalls();
  assert.equal(calls.filter(args => args.includes('push')).length, 1);
  assert.ok(calls.filter(args => args.includes('fetch')).every(args => args.includes('--filter=blob:none') && args.includes('--depth=1')));
  assert.ok(calls.every(args => !args.includes('checkout') && !args.includes('clone')));
});

test('GitHub Actions 无项目作者配置时使用官方机器人身份', async t => {
  const f = await fixture(t);
  f.git('config', '--unset', 'user.name');
  f.git('config', '--unset', 'user.email');
  const result = f.run({ GITHUB_ACTIONS: 'true' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(f.git('--git-dir', f.remote, 'log', '-1', '--format=%an <%ae>'), 'github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>');
});
