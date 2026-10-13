import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const installer = fileURLToPath(new URL("../scripts/install.mjs", import.meta.url));
const selector = "codex-aquarium@codex-aquarium-local";

async function fixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(), "aquarium-installer-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const home = path.join(directory, "codex home");
  const bin = path.join(directory, "bin");
  await mkdir(home);
  await mkdir(bin);
  const stub = path.join(bin, "codex");
  await writeFile(stub, `#!${process.execPath}
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
const root = process.env.CODEX_HOME;
const args = process.argv.slice(2);
appendFileSync(path.join(root, "calls.jsonl"), JSON.stringify(args) + "\\n");
if (args.includes("--help")) process.exit(0);
const file = path.join(root, "stub.json");
const state = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
const [command, area, action, value] = args;
if (command !== "plugin") process.exit(1);
if (area === "marketplace" && action === "list") console.log(JSON.stringify({ marketplaces: state.source ? [{ name: "codex-aquarium-local", marketplaceSource: { sourceType: "local", source: state.source } }] : [] }));
if (area === "marketplace" && action === "add") state.source = value;
if (area === "marketplace" && action === "remove") delete state.source;
if (area === "list") console.log(JSON.stringify({ installed: state.installed ? [{ pluginId: "${selector}" }] : [] }));
if (area === "add") {
  const manifest = JSON.parse(readFileSync(path.join(state.source, ".codex-plugin/plugin.json"), "utf8"));
  if (manifest.version === process.env.FAIL_VERSION) { console.error("安装 CLI 故障"); process.exit(1); }
  state.installed = true;
  state.version = manifest.version;
}
if (area === "remove") delete state.installed;
writeFileSync(file, JSON.stringify(state));
`);
  await chmod(stub, 0o755);
  const env = { ...process.env, CODEX_HOME: home, PATH: `${bin}${path.delimiter}${process.env.PATH}` };
  const destination = path.join(home, "aquarium-install", "codex-aquarium");
  const archive = path.join(directory, "codex-aquarium.tgz");
  const source = path.join(directory, "source", "codex-aquarium");
  async function pack(version = "0.1.0") {
    const files = {
      ".codex-plugin/plugin.json": JSON.stringify({ name: "codex-aquarium", version }),
      ".agents/plugins/marketplace.json": JSON.stringify({ name: "codex-aquarium-local", plugins: [{ name: "codex-aquarium", source: { source: "local", path: "./" } }] }),
      "dist/index.html": `version ${version}`,
      "hooks/hooks.json": "{}",
      "skills/aquarium/SKILL.md": "Read Hooks before trusting them.",
      "server/cli.mjs": `
import { appendFileSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const directory = process.env.CODEX_HOME;
const command = process.argv[2];
appendFileSync(path.join(directory, 'service.jsonl'), command + '\\n');
if (command === 'status' && process.env.INSTALLER_RUNNING_URL) console.log(process.env.INSTALLER_RUNNING_URL);
if (command === 'stop') writeFileSync(path.join(directory, 'stopped'), 'true');
if (command === 'start') {
  if (process.env.INSTALLER_RUNNING_URL && !existsSync(path.join(directory, 'shutdown-polled'))) throw new Error('未等待旧服务退出');
  console.log('http://127.0.0.1:43187');
}`,
    };
    for (const [name, value] of Object.entries(files)) {
      const file = path.join(source, name);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, value);
    }
    const result = spawnSync("tar", ["-czf", archive, "-C", path.dirname(source), "codex-aquarium"], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    await checksum();
  }
  async function checksum() {
    const digest = createHash("sha256").update(await readFile(archive)).digest("hex");
    await writeFile(path.join(directory, "SHA256SUMS"), `${digest}  codex-aquarium.tgz\n`);
  }
  function run(extraEnv = {}, args = ["--archive", archive], entrypoint = installer) {
    return spawnSync(process.execPath, [entrypoint, ...args], { env: { ...env, ...extraEnv }, encoding: "utf8", timeout: 20_000 });
  }
  return { home, directory, destination, source, archive, pack, checksum, run };
}

test("本地发行包校验后安装，重复运行和升级使用同一目录，不触碰状态和信任文件", async t => {
  const f = await fixture(t);
  const sentinel = path.join(f.home, "config.toml");
  await writeFile(sentinel, "user-owned config and trust sentinel");
  await f.pack();
  const first = f.run();
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /http:\/\/127\.0\.0\.1:43187/);
  assert.match(first.stdout, /审阅并信任/);
  assert.equal(f.run().status, 0);
  await f.pack("0.2.0");
  const upgrade = f.run();
  assert.equal(upgrade.status, 0, upgrade.stderr);
  assert.equal(await readFile(path.join(f.destination, "dist/index.html"), "utf8"), "version 0.2.0");
  assert.equal(await readFile(sentinel, "utf8"), "user-owned config and trust sentinel");
  assert.deepEqual(await readdir(path.dirname(f.destination)), ["codex-aquarium"]);
  const state = JSON.parse(await readFile(path.join(f.home, "stub.json"), "utf8"));
  assert.equal(state.source, f.destination);
  assert.equal(state.version, "0.2.0");
});

test("安装 CLI 失败恢复旧文件与插件，不停止原服务", async t => {
  const f = await fixture(t);
  await f.pack();
  assert.equal(f.run().status, 0);
  await writeFile(path.join(f.home, "service.jsonl"), "");
  await f.pack("0.2.0");
  const result = f.run({ FAIL_VERSION: "0.2.0" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /安装 CLI 故障/);
  assert.equal(await readFile(path.join(f.destination, "dist/index.html"), "utf8"), "version 0.1.0");
  assert.equal(await readFile(path.join(f.home, "service.jsonl"), "utf8"), "");
  const state = JSON.parse(await readFile(path.join(f.home, "stub.json"), "utf8"));
  assert.equal(state.version, "0.1.0");
  assert.deepEqual(await readdir(path.dirname(f.destination)), ["codex-aquarium"]);
});

test("安装成功后停止旧服务，确认退出，再启动新服务", async t => {
  const f = await fixture(t);
  await f.pack();
  const server = spawn(process.execPath, ["--input-type=module", "-e", `
import { createServer } from 'node:http';
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const root = process.env.CODEX_HOME;
const server = createServer((request, response) => {
  const stopped = existsSync(path.join(root, 'stopped'));
  if (stopped) writeFileSync(path.join(root, 'shutdown-polled'), 'true');
  response.end(JSON.stringify({ service: stopped ? null : 'codex-aquarium' }));
});
server.listen(0, '127.0.0.1', () => console.log('http://127.0.0.1:' + server.address().port));
`], { env: { ...process.env, CODEX_HOME: f.home }, stdio: ["ignore", "pipe", "inherit"] });
  t.after(() => server.kill());
  const url = await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.stdout.once("data", data => resolve(data.toString().trim()));
  });
  const result = f.run({ INSTALLER_RUNNING_URL: url });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(await readFile(path.join(f.home, "service.jsonl"), "utf8"), "status\nstop\nstart\n");
});

test("旧本地 marketplace 迁移失败会恢复原来源且保留原目录", async t => {
  const f = await fixture(t);
  await f.pack();
  const previous = path.join(f.directory, "previous-install");
  await mkdir(previous);
  const unpack = spawnSync("tar", ["-xzf", f.archive, "-C", previous]);
  assert.equal(unpack.status, 0);
  const previousSource = path.join(previous, "codex-aquarium");
  await writeFile(path.join(f.home, "stub.json"), JSON.stringify({ source: previousSource, installed: true, version: "0.1.0" }));
  await f.pack("0.2.0");
  const result = f.run({ FAIL_VERSION: "0.2.0" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /安装 CLI 故障/);
  const state = JSON.parse(await readFile(path.join(f.home, "stub.json"), "utf8"));
  assert.equal(state.source, previousSource);
  assert.equal(state.version, "0.1.0");
  assert.equal(await readFile(path.join(previousSource, "dist/index.html"), "utf8"), "version 0.1.0");
  await assert.rejects(readFile(path.join(f.destination, "dist/index.html")), { code: "ENOENT" });
});

test("不匹配的校验值在调用安装 CLI 前拒绝", async t => {
  const f = await fixture(t);
  await f.pack();
  await writeFile(path.join(f.directory, "SHA256SUMS"), `${"0".repeat(64)}  codex-aquarium.tgz\n`);
  const result = f.run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /SHA-256 校验失败/);
  await assert.rejects(readFile(path.join(f.home, "stub.json")), { code: "ENOENT" });
});

test("拒绝指向包外的符号链接，不覆盖外部文件", async t => {
  const f = await fixture(t);
  await f.pack();
  const outside = path.join(f.directory, "outside.txt");
  await writeFile(outside, "unchanged");
  await symlink(outside, path.join(f.source, "escape"));
  await f.pack();
  const result = f.run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /不允许链接/);
  assert.equal(await readFile(outside, "utf8"), "unchanged");
});

test("拒绝错误顶级路径与已移除的远程版本参数", async t => {
  const f = await fixture(t);
  await writeFile(path.join(f.directory, "outside.txt"), "content");
  assert.equal(spawnSync("tar", ["-czf", f.archive, "-C", f.directory, "outside.txt"]).status, 0);
  await f.checksum();
  const invalidArchive = f.run();
  assert.equal(invalidArchive.status, 1);
  assert.match(invalidArchive.stderr, /不安全路径/);
  const invalidVersion = f.run({}, ["--version", "../../escape"]);
  assert.equal(invalidVersion.status, 1);
  assert.match(invalidVersion.stderr, /未知参数：--version/);
  const help = f.run({}, ["--help"]);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /SHA256SUMS/);
});

test("缺少 --archive 时立即退出，不访问网络或修改安装目录", async t => {
  const f = await fixture(t);
  const preload = "globalThis.fetch = () => { throw new Error('unexpected network request'); };";
  const result = f.run({ NODE_OPTIONS: `--import=data:text/javascript,${encodeURIComponent(preload)}` }, []);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /缺少 --archive/);
  assert.deepEqual(await readdir(f.home), []);
});

test("通过符号链接启动安装器时实际完成安装", async t => {
  const f = await fixture(t);
  await f.pack();
  const entrypoint = path.join(f.directory, "install.mjs");
  await symlink(installer, entrypoint);
  const result = f.run({}, ["--archive", f.archive], entrypoint);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /已安装 Codex Aquarium 0\.1\.0/);
  assert.equal(await readFile(path.join(f.destination, "dist/index.html"), "utf8"), "version 0.1.0");
});

test("作为模块导入时不自动执行安装", async t => {
  const f = await fixture(t);
  const entrypoint = path.join(f.directory, "importer.mjs");
  await writeFile(entrypoint, `import ${JSON.stringify(new URL("../scripts/install.mjs", import.meta.url).href)};`);
  const result = f.run({}, [], entrypoint);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "");
  assert.deepEqual(await readdir(f.home), []);
});
