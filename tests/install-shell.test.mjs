import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const installer = fileURLToPath(new URL("../install.sh", import.meta.url));
const rawBase = "https://api.github.com/repos/kinglisky/codex-aquarium/contents/v0.1.5";

async function fixture(t, { node = true } = {}) {
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
writeFileSync(path.join(root, 'installed.json'), JSON.stringify(args));
`;
  await writeFile(path.join(files, "install.mjs"), helper);
  await writeFile(path.join(files, "codex-aquarium.tgz"), "fixture archive");
  const sums = await Promise.all(["install.mjs", "codex-aquarium.tgz"].map(async file => {
    const digest = createHash("sha256").update(await readFile(path.join(files, file))).digest("hex");
    return `${digest}  ${file}`;
  }));
  await writeFile(path.join(files, "SHA256SUMS"), `${sums.join("\n")}\n`);
  const env = { ...process.env, PATH: bin, TMPDIR: temporary, SHELL_FIXTURE: directory, SHELL_REAL_NODE: process.execPath };
  function run(extraEnv = {}) {
    return spawnSync("/bin/bash", [installer], { env: { ...env, ...extraEnv }, encoding: "utf8", timeout: 10_000 });
  }
  async function assertNoInstall() {
    await assert.rejects(readFile(path.join(directory, "installed.json")), { code: "ENOENT" });
    assert.deepEqual(await readdir(temporary), []);
  }
  return { directory, files, bin, temporary, run, assertNoInstall };
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
    assert.ok(!args.includes("--insecure"));
  }
  const installed = JSON.parse(await readFile(path.join(f.directory, "installed.json"), "utf8"));
  assert.equal(installed[0], "--archive");
  assert.equal(path.basename(installed[1]), "codex-aquarium.tgz");
  assert.deepEqual(await readdir(f.temporary), []);
  const codex = await readFile(path.join(f.directory, "codex.jsonl"), "utf8");
  assert.deepEqual(JSON.parse(codex.trim()), ["plugin", "add", "--help"]);
});
