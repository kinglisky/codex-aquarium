import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = join(root, 'artifacts');
const temporary = await mkdtemp(join(tmpdir(), 'codex-aquarium-package-'));
const packageRoot = join(temporary, 'codex-aquarium');
const files = [
  'install.sh',
  'hooks/hooks.json',
  '.codex-plugin/plugin.json',
  '.agents/plugins/marketplace.json',
  'skills/aquarium/SKILL.md',
  'scripts/install.mjs',
  'docs/screenshots/museum-gallery.jpg',
  'docs/screenshots/aquarium-live.png',
  'docs/screenshots/aquarium-glass.png',
  'docs/screenshots/plugin-configuration.png',
  'README.md',
  'README.en.md',
  'CHANGELOG.md',
  'LICENSE',
];

try {
  const project = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const manifest = JSON.parse(await readFile(join(root, '.codex-plugin/plugin.json'), 'utf8'));
  const shell = await readFile(join(root, 'install.sh'), 'utf8');
  if (project.version !== manifest.version || !shell.includes(`VERSION='v${project.version}'`)) {
    throw new Error('项目、插件和 install.sh 版本不一致。');
  }
  const required = ['dist/index.html', 'server/cli.mjs', 'hooks/observe.mjs', ...files];
  await Promise.all(required.map((file) => stat(join(root, file))));
  await mkdir(packageRoot);
  await cp(join(root, 'dist'), join(packageRoot, 'dist'), { recursive: true });

  for (const directory of ['server', 'hooks']) {
    await mkdir(join(packageRoot, directory));
    const files = await readdir(join(root, directory), { withFileTypes: true });
    for (const file of files) {
      if (!file.isFile()) continue;
      if (!file.name.endsWith('.mjs')) continue;
      await cp(join(root, directory, file.name), join(packageRoot, directory, file.name));
    }
  }

  for (const file of files) {
    await mkdir(dirname(join(packageRoot, file)), { recursive: true });
    await cp(join(root, file), join(packageRoot, file));
  }

  const archive = join(temporary, 'codex-aquarium.tgz');
  const result = spawnSync('tar', ['-czf', archive, '-C', temporary, 'codex-aquarium'], {
    stdio: 'inherit',
    env: { ...process.env, COPYFILE_DISABLE: '1' },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`tar 打包失败，退出码：${result.status}`);

  await mkdir(outputDirectory, { recursive: true });
  await cp(archive, join(outputDirectory, 'codex-aquarium.tgz'));
  await cp(join(root, 'scripts/install.mjs'), join(outputDirectory, 'install.mjs'));
  await cp(join(root, 'install.sh'), join(outputDirectory, 'install.sh'));
  const checksums = await Promise.all(['codex-aquarium.tgz', 'install.mjs', 'install.sh'].map(async (file) => {
    const content = await readFile(join(outputDirectory, file));
    return `${createHash('sha256').update(content).digest('hex')}  ${file}`;
  }));
  await writeFile(join(outputDirectory, 'SHA256SUMS'), `${checksums.join('\n')}\n`);
  console.log(`插件发行包、Shell 安装入口、内部安装组件和 SHA-256 校验文件：${outputDirectory}`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
