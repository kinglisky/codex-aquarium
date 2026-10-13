import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { access, lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const plugin = "codex-aquarium";
const marketplace = "codex-aquarium-local";
const selector = `${plugin}@${marketplace}`;
const archiveName = `${plugin}.tgz`;
const repository = "https://github.com/kinglisky/codex-aquarium";
const usage = `Codex Aquarium 安装器（Node.js 22.12+、Codex CLI、tar）

  node install.mjs                         下载最新公开 Release 并安装
  node install.mjs --version v0.1.0        安装指定 Release
  node install.mjs --archive ./codex-aquarium.tgz
                                          安装本地包；同目录需有 SHA256SUMS
  node install.mjs --help                  显示帮助

安装目录：CODEX_HOME（默认 ~/.codex）下的 aquarium-install/codex-aquarium
安装成功后启动本地鱼缸。请自行审阅并信任 Hooks，再重启 Codex。
不会修改 Hooks 信任记录，也不会自动打开浏览器。`;

function options(arguments_) {
  const result = {};
  for (let index = 0; index < arguments_.length; index++) {
    const option = arguments_[index];
    if (option === "--help" || option === "-h") return { help: true };
    if (!["--archive", "--version"].includes(option)) throw new Error(`未知参数：${option}\n${usage}`);
    const value = arguments_[++index];
    if (!value || value.startsWith("--") || result[option]) throw new Error(`参数错误：${option}\n${usage}`);
    result[option] = value;
  }
  if (result["--archive"] && result["--version"]) throw new Error("--archive 和 --version 不能同时使用。");
  if (result["--version"] && !/^v\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(result["--version"])) {
    throw new Error("版本格式应为 v0.1.0 或 v0.1.0-beta.1。");
  }
  return { archive: result["--archive"], version: result["--version"] };
}

function command(program, arguments_) {
  const result = spawnSync(program, arguments_, { encoding: "utf8", timeout: 30_000, maxBuffer: 8 * 1024 * 1024 });
  if (result.error) throw new Error(`无法执行 ${program}：${result.error.message}`);
  if (result.status !== 0) throw new Error(`${program} ${arguments_.slice(0, 3).join(" ")} 失败：${result.stderr.trim() || `退出码 ${result.status}`}`);
  return result.stdout.trim();
}

async function json(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

async function exists(file) {
  try { await lstat(file); return true; }
  catch (error) { if (error.code === "ENOENT") return false; throw error; }
}

async function download(url, destination) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) }).catch(error => {
    throw new Error(`无法下载发行附件：${error.message}。请检查网络，或下载发行包与 SHA256SUMS 后使用 --archive。`);
  });
  if (response.status === 404) throw new Error("找不到发行附件：Release 可能尚未发布，或仓库为私有。请从有访问权限的 GitHub 页面下载发行包与 SHA256SUMS，再使用 --archive 安装。");
  if (!response.ok) throw new Error(`下载失败：HTTP ${response.status}（${url}）。请稍后重试或使用 --archive。`);
  await writeFile(destination, Buffer.from(await response.arrayBuffer()));
}

async function prepareArchive(configuration, temporary) {
  if (configuration.archive) return path.resolve(configuration.archive);
  const release = configuration.version ? `download/${configuration.version}` : "latest/download";
  console.log(`正在下载 ${configuration.version || "最新"} Release…`);
  for (const name of [archiveName, "SHA256SUMS"]) {
    await download(`${repository}/releases/${release}/${name}`, path.join(temporary, name));
  }
  return path.join(temporary, archiveName);
}

async function verifyArchive(archive) {
  const sums = await readFile(path.join(path.dirname(archive), "SHA256SUMS"), "utf8").catch(() => {
    throw new Error("发行包旁缺少 SHA256SUMS。请从同一个 Release 下载该文件，避免安装不完整或被修改的包。");
  });
  const entry = sums.split(/\r?\n/).find(line => /^[a-f\d]{64} [ *]codex-aquarium\.tgz$/i.test(line));
  const digest = createHash("sha256").update(await readFile(archive)).digest("hex");
  if (!entry || entry.slice(0, 64).toLowerCase() !== digest) throw new Error("SHA-256 校验失败，未安装任何文件。请重新下载同一 Release 的发行包与 SHA256SUMS。");

  const entries = command("tar", ["-tzf", archive]).split(/\r?\n/);
  for (const entryName of entries) {
    const parts = entryName.replace(/\/$/, "").split("/");
    if (!/^[\w./-]+$/.test(entryName) || parts[0] !== plugin || parts.some(part => !part || part === "." || part === "..")) {
      throw new Error(`发行包包含不安全路径：${entryName}`);
    }
  }
  const detailed = command("tar", ["-tvzf", archive]).split(/\r?\n/);
  if (detailed.some(line => !/^[d-]/.test(line))) throw new Error("发行包只能包含普通文件和目录，不允许链接或设备文件。");
}

async function validatePackage(directory, version) {
  const manifest = await json(path.join(directory, ".codex-plugin", "plugin.json"));
  const catalog = await json(path.join(directory, ".agents", "plugins", "marketplace.json"));
  const entry = catalog.plugins?.[0];
  if (manifest.name !== plugin || !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(manifest.version)) throw new Error("发行包的插件名称或版本无效。");
  if (version && `v${manifest.version}` !== version) throw new Error("发行包内版本与请求的 Release 不一致。");
  if (catalog.name !== marketplace || catalog.plugins.length !== 1 || entry?.name !== plugin || entry.source?.source !== "local" || entry.source.path !== "./") {
    throw new Error("发行包的本地 marketplace 配置无效。");
  }
  await Promise.all(["dist/index.html", "server/cli.mjs", "hooks/hooks.json", "skills/aquarium/SKILL.md"].map(file => access(path.join(directory, file))));
  return manifest.version;
}

async function waitForShutdown(url) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const running = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(500) })
      .then(response => response.json()).then(health => health.service === plugin).catch(() => false);
    if (!running) return;
    await sleep(100);
  }
  throw new Error("旧鱼缸服务尚未退出，已停止更新启动流程。");
}

async function install(configuration) {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 12)) throw new Error("需要 Node.js 22.12 或更新版本。");
  command("tar", ["--version"]);
  command("codex", ["plugin", "add", "--help"]);
  const parent = path.resolve(process.env.CODEX_HOME || path.join(homedir(), ".codex"), "aquarium-install");
  await mkdir(parent, { recursive: true });
  const temporary = await mkdtemp(path.join(parent, ".install-"));
  const destination = path.join(parent, plugin);
  const backup = path.join(temporary, "previous");
  let preserveBackup = false;
  try {
    const archive = await prepareArchive(configuration, temporary);
    await verifyArchive(archive);
    command("tar", ["-xzf", archive, "--no-same-owner", "--no-same-permissions", "-C", temporary]);
    const extracted = path.join(temporary, plugin);
    const version = await validatePackage(extracted, configuration.version);
    const hadDirectory = await exists(destination);
    if (hadDirectory && ((await lstat(destination)).isSymbolicLink() || (await json(path.join(destination, ".codex-plugin", "plugin.json"))).name !== plugin)) {
      throw new Error(`拒绝覆盖非鱼缸安装目录：${destination}`);
    }
    const previous = JSON.parse(command("codex", ["plugin", "marketplace", "list", "--json"]))
      .marketplaces.find(entry => entry.name === marketplace);
    if (previous && previous.marketplaceSource?.sourceType !== "local") throw new Error("同名 marketplace 来自非本地来源，请先在 Codex 中检查并移除该来源后重试。");
    const previousSource = previous?.marketplaceSource.source;
    const wasInstalled = JSON.parse(command("codex", ["plugin", "list", "--json"])).installed.some(entry => entry.pluginId === selector);
    const canonicalDestination = path.join(await realpath(parent), plugin);
    const sameSource = previousSource && await realpath(previousSource) === canonicalDestination;
    let sourceChanged = false;
    let pluginAttempted = false;
    let newDirectory = false;
    let stoppedUrl;
    try {
      if (hadDirectory) await rename(destination, backup);
      await rename(extracted, destination);
      newDirectory = true;
      if (previousSource && !sameSource) {
        command("codex", ["plugin", "marketplace", "remove", marketplace]);
        sourceChanged = true;
      }
      command("codex", ["plugin", "marketplace", "add", destination]);
      sourceChanged = !sameSource;
      pluginAttempted = true;
      command("codex", ["plugin", "add", selector]);
      const cli = path.join(destination, "server", "cli.mjs");
      const status = command(process.execPath, [cli, "status"]);
      const url = status.match(/^http:\/\/127\.0\.0\.1:\d+/)?.[0];
      if (url) {
        command(process.execPath, [cli, "stop"]);
        stoppedUrl = url;
        await waitForShutdown(url);
      }
      const output = command(process.execPath, [cli, "start"]);
      console.log(`已安装 Codex Aquarium ${version}\n安装目录：${destination}\n${output}`);
    } catch (error) {
      const failures = [];
      const recover = async action => { try { await action(); } catch (failure) { failures.push(failure.message); } };
      if (newDirectory) await recover(() => rm(destination, { recursive: true, force: true }));
      if (hadDirectory && await exists(backup)) await recover(() => rename(backup, destination));
      if (sourceChanged) {
        await recover(() => command("codex", ["plugin", "marketplace", "remove", marketplace]));
        if (previousSource) await recover(() => command("codex", ["plugin", "marketplace", "add", previousSource]));
      }
      if (pluginAttempted && wasInstalled) await recover(() => command("codex", ["plugin", "add", selector]));
      if (pluginAttempted && !wasInstalled) await recover(() => command("codex", ["plugin", "remove", selector]));
      if (stoppedUrl && previousSource) await recover(() => command(process.execPath, [path.join(previousSource, "server", "cli.mjs"), "start"]));
      preserveBackup = await exists(backup);
      throw new Error(`${error.message}\n安装未完成，已尝试恢复原有安装。${failures.length ? `\n恢复提示：${failures.join("\n")}` : ""}${preserveBackup ? `\n原安装保留在：${backup}` : ""}`);
    }
    console.log("\n请在 Codex 中审阅并信任此插件的 Hooks，然后重启 Codex。继续会话并执行工具调用后，鱼缸才会收到真实事件。\n以后可对 Codex 说：打开我的实时鱼缸。");
  } finally {
    if (!preserveBackup) await rm(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const configuration = options(process.argv.slice(2));
    if (configuration.help) console.log(usage);
    if (!configuration.help) await install(configuration);
  } catch (error) {
    console.error(`安装失败：${error.message}`);
    process.exitCode = 1;
  }
}
