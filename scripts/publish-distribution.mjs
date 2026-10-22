import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const branch = 'distribution';
const partSize = 48 * 1024 * 1024;

export async function publishDistribution(root = projectRoot) {
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

  function git(arguments_, options = {}) {
    const result = spawnSync('git', arguments_, {
      cwd: root, env: process.env, encoding: 'utf8', timeout: 300_000,
      maxBuffer: 4 * 1024 * 1024, ...options,
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`raw 发布失败（${result.signal || result.status}）：${result.stderr.trim() || result.stdout.trim()}`);
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
  const temporary = await mkdtemp(join(tmpdir(), 'aquarium-distribution-'));
  const run = (arguments_, options = {}) => git(['--git-dir', temporary, ...arguments_], { env: environment, ...options });
  try {
    git(['init', '--bare', '--quiet', '--initial-branch', branch, temporary]);
    run(['remote', 'add', 'origin', remote]);
    const reference = `refs/heads/${branch}`;
    const previous = run(['ls-remote', '--heads', remote, reference]);
    if (previous) {
      run(['fetch', '--quiet', '--filter=blob:none', '--depth=1', 'origin', reference]);
      run(['update-ref', reference, 'FETCH_HEAD']);
      run(['read-tree', 'HEAD']);
    }
    const parent = previous && run(['rev-parse', 'HEAD']);
    const existing = new Map((parent ? run(['ls-tree', '-r', '-z', 'HEAD', '--', version]).split('\0').filter(Boolean) : [])
      .map(entry => { const [metadata, path] = entry.split('\t'); return [path, metadata.split(' ')[2]]; }));
    const entries = [...contents].filter(([file, entry]) => {
      const path = `${version}/${file}`;
      const published = existing.get(path);
      if (published && published !== entry.sha) throw new Error(`${path} 已发布，拒绝覆盖同版本文件。`);
      return !published;
    });
    if (!entries.length) {
      console.log(`${version} raw 文件已发布，内容一致。`);
      return;
    }
    for (const [file, entry] of entries) {
      const sha = entry.content
        ? run(['hash-object', '-w', '--stdin'], { input: entry.content })
        : run(['hash-object', '-w', entry.location]);
      if (sha !== entry.sha) throw new Error(`${version}/${file} 写入后的内容校验失败。`);
      run(['update-index', '--add', '--cacheinfo', `100644,${sha},${version}/${file}`]);
    }
    const identity = environment.GITHUB_ACTIONS === 'true'
      ? ['-c', 'user.name=github-actions[bot]', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com']
      : ['user.name', 'user.email'].flatMap(key => ['-c', `${key}=${git(['config', key])}`]);
    // Unchanged release blobs remain on the remote instead of being downloaded to write the tree.
    const tree = run(['write-tree', '--missing-ok']);
    const commit = run([...identity, 'commit-tree', tree, ...(parent ? ['-p', parent] : []), '-m', `chore: 发布 ${version} raw 安装文件`]);
    run(['update-ref', reference, commit]);
    run(['push', remote, `HEAD:${reference}`]);
    console.log(`已发布 ${version} raw 文件：${branch}@${commit}`);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await publishDistribution();
}
