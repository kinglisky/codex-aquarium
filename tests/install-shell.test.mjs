import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const installer = fileURLToPath(new URL("../install.sh", import.meta.url));
const { version } = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const rawBase = `https://api.github.com/repos/kinglisky/codex-aquarium/contents/v${version}`;

async function fixture(t, { node = true, multipart = false } = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), "aquarium-shell-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const bin = path.join(directory, "bin");
  const temporary = path.join(directory, "temporary");
  const files = path.join(directory, "files");
  await Promise.all([bin, temporary, files].map(file => mkdir(file)));
  for (const tool of ["mktemp", "rm", "tar"]) {
    const command = spawnSync("/bin/sh", ["-c", `command -v ${tool}`], { encoding: "utf8" });
    assert.equal(command.status, 0, command.stderr);
    await symlink(command.stdout.trim(), path.join(bin, tool));
  }
  async function executable(name, source) {
    const file = path.join(bin, name);
    await writeFile(file, source);
    await chmod(file, 0o755);
  }
  const log = `import { appendFileSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
const root = process.env.SHELL_FIXTURE;
const args = process.argv.slice(2);
`;
  await executable("curl", `#!${process.execPath}
${log}
appendFileSync(path.join(root, 'downloads.jsonl'), JSON.stringify(args) + '\\n');
if (process.env.DOWNLOAD_FAILURE) process.exit(35);
const file = new URL(args.at(-1)).pathname.split('/').at(-1);
writeFileSync(args[args.indexOf('-o') + 1], readFileSync(path.join(root, 'files', file)));
`);
  await executable("codex", `#!${process.execPath}
${log}
appendFileSync(path.join(root, 'codex.jsonl'), JSON.stringify(args) + '\\n');
process.exit(process.env.CODEX_FAILURE ? 1 : 0);
`);
  if (node) {
    await writeFile(path.join(directory, "version.mjs"), `
if (process.env.SIMULATED_NODE_VERSION) Object.defineProperty(process.versions, 'node', { value: process.env.SIMULATED_NODE_VERSION });
`);
    await executable("node", `#!/bin/sh
exec "$SHELL_REAL_NODE" --import "$SHELL_FIXTURE/version.mjs" "$@"
`);
  }
  const helper = `${log}
if (args[0] !== '--archive' || !existsSync(args[1])) throw new Error('Archive was not downloaded');
if (readFileSync(args[1], 'utf8') !== 'fixture archive') throw new Error('Archive was not reconstructed');
writeFileSync(path.join(root, 'installed.json'), JSON.stringify(args));
`;
  await writeFile(path.join(files, "install.mjs"), helper);
  await writeFile(path.join(files, "codex-aquarium.tgz"), "fixture archive");
  const parts = multipart ? ['codex-aquarium.tgz.part-000', 'codex-aquarium.tgz.part-001'] : [];
  if (multipart) {
    await writeFile(path.join(files, parts[0]), 'fixture ');
    await writeFile(path.join(files, parts[1]), 'archive');
  }
  async function checksum(names = ["install.mjs", "codex-aquarium.tgz", ...parts]) {
    const sums = await Promise.all(names.map(async file => {
      const digest = createHash("sha256").update(await readFile(path.join(files, file))).digest("hex");
      return `${digest}  ${file}`;
    }));
    await writeFile(path.join(files, "SHA256SUMS"), `${sums.join("\n")}\n`);
  }
  await checksum();
  const env = { ...process.env, PATH: bin, TMPDIR: temporary, SHELL_FIXTURE: directory, SHELL_REAL_NODE: process.execPath };
  function run(extraEnv = {}) {
    return spawnSync("/bin/bash", [installer], { env: { ...env, ...extraEnv }, encoding: "utf8", timeout: 10_000 });
  }
  async function assertNoInstall() {
    await assert.rejects(readFile(path.join(directory, "installed.json")), { code: "ENOENT" });
    assert.deepEqual(await readdir(temporary), []);
  }
  return { directory, files, bin, temporary, parts, checksum, run, assertNoInstall };
}

test("没有 Node.js 时提示安装并在下载之前退出", async t => {
  const f = await fixture(t, { node: false });
  const result = f.run();
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /Node\.js 22\.12/);
  assert.match(result.stderr, /https:\/\/nodejs\.org\//);
  await assert.rejects(readFile(path.join(f.directory, "downloads.jsonl")), { code: "ENOENT" });
  await f.assertNoInstall();
});

test("旧版本 Node.js 在下载之前退出", async t => {
  const f = await fixture(t);
  const result = f.run({ SIMULATED_NODE_VERSION: "22.11.0" });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /Node\.js 22\.12/);
  await assert.rejects(readFile(path.join(f.directory, "downloads.jsonl")), { code: "ENOENT" });
  await f.assertNoInstall();
});

test("Node.js 无法运行时给出安装指引且不下载", async t => {
  const f = await fixture(t);
  await writeFile(path.join(f.bin, "node"), "#!/bin/sh\nexit 126\n");
  const result = f.run();
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /https:\/\/nodejs\.org\//);
  await assert.rejects(readFile(path.join(f.directory, "downloads.jsonl")), { code: "ENOENT" });
  await f.assertNoInstall();
});

test("Codex 不支持插件命令时在下载前退出", async t => {
  const f = await fixture(t);
  const result = f.run({ CODEX_FAILURE: "1" });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /Codex/);
  await assert.rejects(readFile(path.join(f.directory, "downloads.jsonl")), { code: "ENOENT" });
  await f.assertNoInstall();
});

test("下载失败不执行安装并清理临时目录", async t => {
  const f = await fixture(t);
  const result = f.run({ DOWNLOAD_FAILURE: "1" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /下载失败/);
  await f.assertNoInstall();
});

for (const file of ["install.mjs", "codex-aquarium.tgz"]) {
  test(`${file} 校验失败不执行安装并清理临时目录`, async t => {
    const f = await fixture(t);
    await writeFile(path.join(f.files, file), "tampered");
    const result = f.run();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /SHA-256/);
    await f.assertNoInstall();
  });
}

test("直接从固定版本 raw 下载并校验后调用内部安装器", async t => {
  const f = await fixture(t);
  const result = f.run({ SIMULATED_NODE_VERSION: "22.12.0" });
  assert.equal(result.status, 0, result.stderr);
  const downloads = (await readFile(path.join(f.directory, "downloads.jsonl"), "utf8")).trim().split("\n").map(line => JSON.parse(line));
  assert.deepEqual(downloads.map(args => args.at(-1)), ["SHA256SUMS", "install.mjs", "codex-aquarium.tgz"].map(file => `${rawBase}/${file}?ref=distribution`));
  for (const args of downloads) {
    assert.ok(args.includes("--fail"));
    assert.ok(args.includes("Accept: application/vnd.github.raw+json"));
    assert.ok(Number(args[args.indexOf("--max-time") + 1]) >= 180);
    assert.ok(Number(args[args.indexOf("--retry") + 1]) >= 2);
    assert.ok(!args.includes("--insecure"));
  }
  const installed = JSON.parse(await readFile(path.join(f.directory, "installed.json"), "utf8"));
  assert.equal(installed[0], "--archive");
  assert.equal(path.basename(installed[1]), "codex-aquarium.tgz");
  assert.deepEqual(await readdir(f.temporary), []);
  const codex = await readFile(path.join(f.directory, "codex.jsonl"), "utf8");
  assert.deepEqual(JSON.parse(codex.trim()), ["plugin", "add", "--help"]);
});

test("分片安装逐片下载校验并重组整包，不请求超过 raw 限制的完整归档", async t => {
  const f = await fixture(t, { multipart: true });
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  const downloads = (await readFile(path.join(f.directory, "downloads.jsonl"), "utf8")).trim().split("\n").map(line => JSON.parse(line));
  assert.deepEqual(downloads.map(args => args.at(-1)), ["SHA256SUMS", "install.mjs", ...f.parts].map(file => `${rawBase}/${file}?ref=distribution`));
  assert.deepEqual(await readdir(f.temporary), []);
  assert.ok(await readFile(path.join(f.directory, "installed.json"), "utf8"));
});

test("分片校验失败立即停止，不下载后续分片或执行安装", async t => {
  const f = await fixture(t, { multipart: true });
  await writeFile(path.join(f.files, f.parts[0]), "tampered");
  const result = f.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /part-000.*SHA-256/);
  const downloads = await readFile(path.join(f.directory, "downloads.jsonl"), "utf8");
  assert.ok(!downloads.includes('part-001'));
  await f.assertNoInstall();
});

test("各分片校验通过但重组归档校验不符时拒绝安装", async t => {
  const f = await fixture(t, { multipart: true });
  await writeFile(path.join(f.files, "codex-aquarium.tgz"), "different archive");
  await f.checksum();
  const result = f.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /codex-aquarium\.tgz 的 SHA-256/);
  await f.assertNoInstall();
});

test("校验清单缺少中间分片时不开始下载分片", async t => {
  const f = await fixture(t, { multipart: true });
  await f.checksum(["install.mjs", "codex-aquarium.tgz", f.parts[1]]);
  const result = f.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /校验清单格式无效/);
  const downloads = await readFile(path.join(f.directory, "downloads.jsonl"), "utf8");
  assert.ok(!downloads.includes('part-'));
  await f.assertNoInstall();
});

test("校验清单含重复分片时拒绝安装", async t => {
  const f = await fixture(t, { multipart: true });
  await f.checksum(["install.mjs", "codex-aquarium.tgz", ...f.parts, f.parts[0]]);
  const result = f.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /校验清单格式无效/);
  await f.assertNoInstall();
});
