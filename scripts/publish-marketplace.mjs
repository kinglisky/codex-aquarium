import { spawnSync } from 'node:child_process';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const branch = 'marketplace';

export async function publishMarketplace(root = projectRoot) {
  const directory = join(root, 'artifacts', 'marketplace');
  const project = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const manifest = JSON.parse(await readFile(join(directory, '.codex-plugin/plugin.json'), 'utf8'));
  const catalog = JSON.parse(await readFile(join(directory, '.agents/plugins/marketplace.json'), 'utf8'));
  if (manifest.version !== project.version || manifest.name !== 'codex-aquarium') {
    throw new Error('市场包与项目版本不一致，请先运行 pnpm package。');
  }
  if (catalog.name !== 'codex-aquarium-local' || catalog.plugins?.length !== 1 ||
    catalog.plugins[0].source?.source !== 'local' || catalog.plugins[0].source.path !== './') {
    throw new Error('市场目录必须指向同分支中预构建的鱼缸。');
  }
  await Promise.all([
    'dist/index.html', 'server/cli.mjs', 'server/autostart.mjs', 'server/model-manifest.json',
    'hooks/hooks.json', 'hooks/run.sh', 'hooks/observe.mjs', 'skills/aquarium/SKILL.md', 'skills/setup/SKILL.md',
  ].map(file => access(join(directory, file))));

  function git(arguments_, options = {}) {
    const result = spawnSync('git', arguments_, {
      cwd: root, env: process.env, encoding: 'utf8', timeout: 300_000,
      maxBuffer: 4 * 1024 * 1024, ...options,
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`市场发布失败（${result.signal || result.status}）：${result.stderr.trim() || result.stdout.trim()}`);
    return result.stdout.trim();
  }
  const remote = git(['remote', 'get-url', 'origin']);
  const environment = { ...process.env };
  if (environment.GH_TOKEN && /^https:\/\/github\.com\//.test(remote)) {
    const count = Number(environment.GIT_CONFIG_COUNT || 0);
    environment.GIT_CONFIG_COUNT = String(count + 1);
    environment[`GIT_CONFIG_KEY_${count}`] = 'http.https://github.com/.extraheader';
    environment[`GIT_CONFIG_VALUE_${count}`] = `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${environment.GH_TOKEN}`).toString('base64')}`;
  }
  const temporary = await mkdtemp(join(tmpdir(), 'aquarium-marketplace-'));
  const run = arguments_ => git([
    '--git-dir', join(temporary, '.git'), '--work-tree', directory, ...arguments_,
  ], { env: environment });
  try {
    git(['init', '--quiet', '--initial-branch', branch, temporary]);
    const previous = run(['ls-remote', '--heads', remote, `refs/heads/${branch}`]);
    if (previous) {
      run(['fetch', '--quiet', '--depth=1', remote, `refs/heads/${branch}`]);
      run(['update-ref', `refs/heads/${branch}`, 'FETCH_HEAD']);
      run(['read-tree', 'HEAD']);
    }
    run(['add', '--all', '--force']);
    if (!run(['status', '--porcelain'])) {
      console.log(`v${project.version} 市场内容未变化。`);
      return;
    }
    const identity = ['user.name', 'user.email'].flatMap(key => ['-c', `${key}=${git(['config', key])}`]);
    run([...identity, 'commit', '--quiet', '-m', `chore: 发布 v${project.version} 插件市场包`]);
    run(['push', remote, `HEAD:refs/heads/${branch}`]);
    console.log(`已发布市场包 v${project.version}：${branch}@${run(['rev-parse', 'HEAD'])}`);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await publishMarketplace();
}
