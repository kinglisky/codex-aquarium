import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repository = 'kinglisky/codex-aquarium';
const branch = 'distribution';
const partSize = 48 * 1024 * 1024;

function api(method, endpoint, payload) {
  const args = ['api', '--method', method, `repos/${repository}/${endpoint}`];
  if (payload) args.push('--input', '-');
  const result = spawnSync('gh', args, {
    input: payload && JSON.stringify(payload), encoding: 'utf8',
    timeout: 120_000, maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`GitHub ${method} ${endpoint} 失败：${result.stderr.trim()}`);
  return JSON.parse(result.stdout);
}

const project = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const version = `v${project.version}`;
const sums = await readFile(join(root, 'artifacts/SHA256SUMS'), 'utf8');
const lines = sums.split(/\r?\n/).filter(Boolean);
const checksums = new Map();
for (const line of lines) {
  const entry = line.match(/^([a-f0-9]{64})\s+\*?(install\.(?:mjs|sh)|codex-aquarium\.tgz(?:\.part-\d{3,})?)$/i);
  if (!entry || checksums.has(entry[2])) throw new Error('SHA256SUMS 格式无效，请先运行 pnpm package。');
  checksums.set(entry[2], entry[1].toLowerCase());
}

async function inspect(file) {
  const location = join(root, 'artifacts', file);
  const { size } = await stat(location);
  const hash = createHash('sha256');
  const blob = createHash('sha1').update(`blob ${size}\0`);
  for await (const chunk of createReadStream(location)) {
    hash.update(chunk);
    blob.update(chunk);
  }
  const digest = hash.digest('hex');
  if (checksums.get(file) !== digest) throw new Error(`${file} 校验失败，请先运行 pnpm package。`);
  return { location, size, digest, sha: blob.digest('hex') };
}

const archive = await inspect('codex-aquarium.tgz');
const contents = new Map();
for (const file of ['install.mjs', 'install.sh']) contents.set(file, await inspect(file));

const shell = await readFile(contents.get('install.sh').location, 'utf8');
const shellVersion = shell.match(/^VERSION='([^']+)'\r?$/m)?.[1];
if (shellVersion !== version) throw new Error('install.sh 与项目版本不一致，请先运行 pnpm package。');
const manifest = spawnSync('tar', [
  '-xOf', join(root, 'artifacts/codex-aquarium.tgz'), 'codex-aquarium/.codex-plugin/plugin.json',
], { encoding: 'utf8', timeout: 10_000, maxBuffer: 1024 * 1024 });
if (manifest.error) throw manifest.error;
if (manifest.status !== 0) throw new Error(`读取发行包 manifest 失败：${manifest.stderr.trim()}`);
if (JSON.parse(manifest.stdout).version !== project.version) {
  throw new Error('发行包与项目版本不一致，请先运行 pnpm package。');
}

const parts = [...checksums.keys()].filter(file => /^codex-aquarium\.tgz\.part-\d{3,}$/.test(file)).sort();
if (!parts.length || parts.some((file, index) => file !== `codex-aquarium.tgz.part-${String(index).padStart(3, '0')}`)) {
  throw new Error('raw 分片缺失或顺序不连续，请先运行 pnpm package。');
}
const assembled = createHash('sha256');
for (const file of parts) {
  const content = await inspect(file);
  if (!content.size || content.size > partSize) throw new Error(`${file} 必须为 1 字节至 48 MiB。`);
  for await (const chunk of createReadStream(content.location)) assembled.update(chunk);
  contents.set(file, content);
}
if (assembled.digest('hex') !== archive.digest) throw new Error('raw 分片与发行包不一致，请先运行 pnpm package。');
const checksumContent = Buffer.from(sums);
contents.set('SHA256SUMS', {
  content: checksumContent,
  sha: createHash('sha1').update(`blob ${checksumContent.length}\0`).update(checksumContent).digest('hex'),
});

const reference = api('GET', `git/matching-refs/heads/${branch}`)
  .find(entry => entry.ref === `refs/heads/${branch}`);
const parent = reference?.object.sha;
const baseTree = parent && api('GET', `git/commits/${parent}`).tree.sha;
const existing = baseTree ? api('GET', `git/trees/${baseTree}?recursive=1`).tree : [];
const entries = [];
for (const [file, entry] of contents) {
  const path = `${version}/${file}`;
  const previous = existing.find(entry => entry.path === path);
  if (previous && previous.sha !== entry.sha) throw new Error(`${path} 已发布，拒绝覆盖同版本文件。`);
  if (previous) continue;
  const content = entry.content ?? await readFile(entry.location);
  const blob = api('POST', 'git/blobs', { encoding: 'base64', content: content.toString('base64') });
  if (blob.sha !== entry.sha) throw new Error(`${path} 上传后的内容校验失败。`);
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
