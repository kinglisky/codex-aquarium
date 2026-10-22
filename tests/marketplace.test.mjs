import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { publishMarketplace } from '../scripts/publish-marketplace.mjs';

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'aquarium-marketplace-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const remote = path.join(root, 'remote.git');
  function git(...args) {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  }
  git('init', '--quiet');
  git('config', 'user.name', 'Aquarium Test');
  git('config', 'user.email', 'test@example.invalid');
  git('init', '--bare', '--quiet', remote);
  git('remote', 'add', 'origin', remote);
  await writeFile(path.join(root, 'package.json'), '{"version":"0.3.0"}');
  const source = path.join(root, 'artifacts', 'marketplace');
  const files = {
    '.codex-plugin/plugin.json': '{"name":"codex-aquarium","version":"0.3.0"}',
    '.agents/plugins/marketplace.json': JSON.stringify({
      name: 'codex-aquarium-local',
      plugins: [{ name: 'codex-aquarium', source: { source: 'local', path: './' } }],
    }),
    'dist/index.html': '<script src="/assets/app.js"></script>',
    'dist/assets/app.js': 'console.log("aquarium");',
    'dist/models/fish.glb': 'fish model fixture',
    'server/cli.mjs': '', 'server/autostart.mjs': '', 'server/model-manifest.json': '{}',
    'hooks/hooks.json': '{}', 'hooks/run.sh': '', 'hooks/observe.mjs': '',
    'skills/aquarium/SKILL.md': '---\nname: aquarium\ndescription: Watch fish\n---',
    'skills/setup/SKILL.md': '---\nname: setup\ndescription: Set up aquarium\n---',
  };
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(source, name);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content);
  }
  // Keep Git object creation and history real; isolate the remote transport.
  const bin = path.join(root, 'bin');
  await mkdir(bin);
  const gitPath = spawnSync('/bin/sh', ['-c', 'command -v git'], { encoding: 'utf8' }).stdout.trim();
  await writeFile(path.join(bin, 'git'), `#!${process.execPath}
const { spawnSync } = require('node:child_process');
const args = process.argv.slice(2);
const command = args.includes('push')
  ? ['--git-dir', ${JSON.stringify(remote)}, 'fetch', args[args.indexOf('--git-dir') + 1], 'HEAD:refs/heads/marketplace']
  : args;
const result = spawnSync(${JSON.stringify(gitPath)}, command, { stdio: 'inherit' });
process.exit(result.status ?? 1);
`);
  await chmod(path.join(bin, 'git'), 0o755);
  async function publish() {
    const previous = process.env.PATH;
    process.env.PATH = `${bin}${path.delimiter}${previous}`;
    try { await publishMarketplace(root); }
    finally { process.env.PATH = previous; }
  }
  return { root, source, remote, git, publish };
}

test('市场分支包含构建网页、模型、Hooks，并保留主工作区与提交历史', async t => {
  const f = await fixture(t);
  await writeFile(path.join(f.root, 'uncommitted.txt'), 'keep user changes');
  await f.publish();
  const revision = f.git('--git-dir', f.remote, 'rev-parse', 'marketplace');
  assert.match(f.git('--git-dir', f.remote, 'show', 'marketplace:dist/index.html'), /assets\/app.js/);
  assert.equal(f.git('--git-dir', f.remote, 'show', 'marketplace:dist/models/fish.glb'), 'fish model fixture');
  assert.equal(await readFile(path.join(f.root, 'uncommitted.txt'), 'utf8'), 'keep user changes');
  await f.publish();
  assert.equal(f.git('--git-dir', f.remote, 'rev-parse', 'marketplace'), revision);
  await rm(path.join(f.source, 'dist/models/fish.glb'));
  await writeFile(path.join(f.source, 'dist/index.html'), 'updated aquarium');
  await f.publish();
  assert.equal(f.git('--git-dir', f.remote, 'rev-parse', 'marketplace^'), revision);
  assert.equal(f.git('--git-dir', f.remote, 'show', 'marketplace:dist/index.html'), 'updated aquarium');
  assert.doesNotMatch(f.git('--git-dir', f.remote, 'ls-tree', '-r', '--name-only', 'marketplace'), /fish.glb/);
});

test('缺少预构建网页时不发布不完整的市场包', async t => {
  const f = await fixture(t);
  await rm(path.join(f.source, 'dist/index.html'));
  await assert.rejects(publishMarketplace(f.root), { code: 'ENOENT' });
  assert.equal(f.git('--git-dir', f.remote, 'for-each-ref'), '');
});

test('拒绝旧版本市场包', async t => {
  const f = await fixture(t);
  await writeFile(path.join(f.root, 'package.json'), '{"version":"0.4.0"}');
  await assert.rejects(publishMarketplace(f.root), /市场包与项目版本不一致/);
  assert.equal(f.git('--git-dir', f.remote, 'for-each-ref'), '');
});
