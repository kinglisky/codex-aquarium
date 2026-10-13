import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repository = 'kinglisky/codex-aquarium';
const branch = 'distribution';
const files = ['codex-aquarium.tgz', 'install.mjs', 'install.sh'];

function api(method, endpoint, payload) {
  const args = ['api', '--method', method, `repos/${repository}/${endpoint}`];
  if (payload) args.push('--input', '-');
  const result = spawnSync('gh', args, {
    input: payload && JSON.stringify(payload), encoding: 'utf8',
    timeout: 30_000, maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`GitHub ${method} ${endpoint} 失败：${result.stderr.trim()}`);
  return JSON.parse(result.stdout);
}

const project = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const version = `v${project.version}`;
const sums = await readFile(join(root, 'artifacts/SHA256SUMS'), 'utf8');
const contents = new Map();
for (const file of files) {
  const content = await readFile(join(root, 'artifacts', file));
  const digest = createHash('sha256').update(content).digest('hex');
  if (!sums.split(/\r?\n/).includes(`${digest}  ${file}`)) {
    throw new Error(`${file} 校验失败，请先运行 pnpm package。`);
  }
  contents.set(file, content);
}
contents.set('SHA256SUMS', Buffer.from(sums));

const shellVersion = contents.get('install.sh').toString('utf8').match(/^VERSION='([^']+)'\r?$/m)?.[1];
if (shellVersion !== version) throw new Error('install.sh 与项目版本不一致，请先运行 pnpm package。');
const manifest = spawnSync('tar', [
  '-xOf', join(root, 'artifacts/codex-aquarium.tgz'), 'codex-aquarium/.codex-plugin/plugin.json',
], { encoding: 'utf8', timeout: 10_000, maxBuffer: 1024 * 1024 });
if (manifest.error) throw manifest.error;
if (manifest.status !== 0) throw new Error(`读取发行包 manifest 失败：${manifest.stderr.trim()}`);
if (JSON.parse(manifest.stdout).version !== project.version) {
  throw new Error('发行包与项目版本不一致，请先运行 pnpm package。');
}

const reference = api('GET', `git/matching-refs/heads/${branch}`)
  .find(entry => entry.ref === `refs/heads/${branch}`);
const parent = reference?.object.sha;
const baseTree = parent && api('GET', `git/commits/${parent}`).tree.sha;
const existing = baseTree ? api('GET', `git/trees/${baseTree}?recursive=1`).tree : [];
const entries = [];
for (const [file, content] of contents) {
  const path = `${version}/${file}`;
  const expected = createHash('sha1').update(`blob ${content.length}\0`).update(content).digest('hex');
  const previous = existing.find(entry => entry.path === path);
  if (previous && previous.sha !== expected) throw new Error(`${path} 已发布，拒绝覆盖同版本文件。`);
  if (previous) continue;
  const blob = api('POST', 'git/blobs', { encoding: 'base64', content: content.toString('base64') });
  entries.push({ path, mode: '100644', type: 'blob', sha: blob.sha });
}
if (entries.length === 0) {
  console.log(`${version} raw 文件已发布，内容一致。`);
  process.exit(0);
}
const tree = api('POST', 'git/trees', { ...(baseTree && { base_tree: baseTree }), tree: entries });
const commit = api('POST', 'git/commits', {
  message: `chore: 发布 ${version} raw 安装文件`, tree: tree.sha, parents: parent ? [parent] : [],
});
const update = parent
  ? api('PATCH', `git/refs/heads/${branch}`, { sha: commit.sha, force: false })
  : api('POST', 'git/refs', { ref: `refs/heads/${branch}`, sha: commit.sha });
if (update.object.sha !== commit.sha) throw new Error('raw 分支更新结果不符合预期。');
console.log(`已发布 ${version} raw 文件：${branch}@${commit.sha}`);
