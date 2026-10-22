import { cp, mkdir, mkdtemp, open, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createModelManifest, includeBundledModel } from './model-assets.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = join(root, 'artifacts');
const partSize = 48 * 1024 * 1024;
const temporary = await mkdtemp(join(tmpdir(), 'codex-aquarium-package-'));
const packageRoot = join(temporary, 'codex-aquarium');
const files = [
  'install.sh',
  'hooks/hooks.json',
  '.codex-plugin/plugin.json',
  '.agents/plugins/marketplace.json',
  'skills/aquarium/SKILL.md',
  'skills/setup/SKILL.md',
  'scripts/install.mjs',
  'docs/screenshots/museum-gallery.jpg',
  'docs/screenshots/museum-meadow.jpg',
  'docs/screenshots/aquarium-live.png',
  'docs/screenshots/aquarium-glass.png',
  'docs/screenshots/plugin-configuration.png',
  'README.md',
  'README.en.md',
  'CHANGELOG.md',
  'LICENSE',
];

async function checksum(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(join(outputDirectory, file))) hash.update(chunk);
  return `${hash.digest('hex')}  ${file}`;
}

async function splitArchive(archive) {
  const parts = [];
  const source = await open(archive, 'r');
  try {
    const buffer = Buffer.allocUnsafe(partSize);
    for (let index = 0; ; index += 1) {
      let length = 0;
      while (length < partSize) {
        const { bytesRead } = await source.read(buffer, length, partSize - length, null);
        if (!bytesRead) break;
        length += bytesRead;
      }
      if (!length) return parts;
      const file = `codex-aquarium.tgz.part-${String(index).padStart(3, '0')}`;
      await writeFile(join(outputDirectory, file), buffer.subarray(0, length));
      parts.push(file);
    }
  } finally {
    await source.close();
  }
}

try {
  const project = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const manifest = JSON.parse(await readFile(join(root, '.codex-plugin/plugin.json'), 'utf8'));
  const shell = await readFile(join(root, 'install.sh'), 'utf8');
  if (project.version !== manifest.version || !shell.includes(`VERSION='v${project.version}'`)) {
    throw new Error('项目、插件和 install.sh 版本不一致。');
  }
  const required = ['dist/index.html', 'server/cli.mjs', 'hooks/observe.mjs', ...files];
  await Promise.all(required.map((file) => stat(join(root, file))));
  const modelManifest = await createModelManifest(root);
  await mkdir(packageRoot);
  await cp(join(root, 'dist'), join(packageRoot, 'dist'), {
    recursive: true, filter: includeBundledModel,
  });

  for (const directory of ['server', 'hooks']) {
    await mkdir(join(packageRoot, directory));
    const files = await readdir(join(root, directory), { withFileTypes: true });
    for (const file of files) {
      if (!file.isFile()) continue;
      if (!/\.(mjs|sh)$/.test(file.name)) continue;
      await cp(join(root, directory, file.name), join(packageRoot, directory, file.name));
    }
  }

  for (const file of files) {
    await mkdir(dirname(join(packageRoot, file)), { recursive: true });
    await cp(join(root, file), join(packageRoot, file));
  }
  await writeFile(join(packageRoot, 'server/model-manifest.json'), `${JSON.stringify(modelManifest)}\n`);

  const archive = join(temporary, 'codex-aquarium.tgz');
  const result = spawnSync('tar', ['-czf', archive, '-C', temporary, 'codex-aquarium'], {
    stdio: 'inherit',
    env: { ...process.env, COPYFILE_DISABLE: '1' },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`tar 打包失败，退出码：${result.status}`);

  await mkdir(outputDirectory, { recursive: true });
  for (const file of await readdir(outputDirectory)) {
    if (/^codex-aquarium\.tgz\.part-\d+$/.test(file)) await rm(join(outputDirectory, file));
  }
  await cp(archive, join(outputDirectory, 'codex-aquarium.tgz'));
  await cp(join(root, 'scripts/install.mjs'), join(outputDirectory, 'install.mjs'));
  await cp(join(root, 'install.sh'), join(outputDirectory, 'install.sh'));
  const parts = await splitArchive(archive);
  const checksums = await Promise.all(['codex-aquarium.tgz', ...parts, 'install.mjs', 'install.sh'].map(checksum));
  await writeFile(join(outputDirectory, 'SHA256SUMS'), `${checksums.join('\n')}\n`);
  const marketplace = join(outputDirectory, 'marketplace');
  await rm(marketplace, { recursive: true, force: true });
  await cp(packageRoot, marketplace, { recursive: true });
  console.log(`插件发行包、${parts.length} 个 raw 分片、市场目录和 SHA-256 校验文件：${outputDirectory}`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
