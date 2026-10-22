import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const modelDirectory = 'public/models/acnh/companions';
const bundledModels = new Set(['companions/isabelle.glb']);

export function includeBundledModel(file) {
  const normalized = file.replaceAll('\\', '/');
  const model = normalized.match(/(?:^|\/)models\/acnh\/(companions\/[^/]+\.glb)$/)?.[1];
  return !model || bundledModels.has(model);
}

export async function createModelManifest(root) {
  function git(args) {
    const result = spawnSync('git', args, {
      cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`无法读取模型来源版本：${result.stderr.trim()}`);
    return result.stdout.trim();
  }
  const revision = git(['rev-parse', 'HEAD']);
  if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error('模型来源必须为完整的 Git 提交 SHA。');
  const tracked = new Map(git(['ls-tree', '-r', '-z', 'HEAD', '--', modelDirectory])
    .split('\0').filter(Boolean).map(entry => {
      const [metadata, file] = entry.split('\t');
      return [file, metadata.split(' ')[2]];
    }));
  const models = {};
  const directory = join(root, modelDirectory);
  const files = (await readdir(directory, { withFileTypes: true }))
    .filter(file => file.isFile() && /^[\w-]+\.glb$/.test(file.name))
    .map(file => file.name).sort();
  for (const file of files) {
    const location = join(directory, file);
    const { size } = await stat(location);
    const sha256 = createHash('sha256');
    const blob = createHash('sha1').update(`blob ${size}\0`);
    for await (const chunk of createReadStream(location)) {
      sha256.update(chunk);
      blob.update(chunk);
    }
    if (tracked.get(`${modelDirectory}/${file}`) !== blob.digest('hex')) {
      throw new Error(`模型 ${file} 尚未提交，无法生成可验证的固定版本下载地址。`);
    }
    models[`companions/${file}`] = { size, sha256: sha256.digest('hex') };
  }
  if (!models['companions/isabelle.glb']) throw new Error('缺少默认小动物模型 isabelle.glb。');
  return {
    version: 1,
    baseUrl: `https://raw.githubusercontent.com/kinglisky/codex-aquarium/${revision}/public/models/acnh/`,
    models,
  };
}
