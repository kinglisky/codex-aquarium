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
const usage = `Codex Aquarium 本地包安装器（由 install.sh 调用）

  node install.mjs --archive ./codex-aquarium.tgz
                                          安装本地包；同目录需有 SHA256SUMS
  node install.mjs --help                  显示帮助

安装目录：CODEX_HOME（默认 ~/.codex）下的 aquarium-install/codex-aquarium
安装成功后启动本地鱼缸；macOS 同时配置随 Codex 应用自动启动。
请自行审阅并信任 Hooks，再重启 Codex。
不会修改 Hooks 信任记录，也不会自动打开浏览器。`;

function options(arguments_) {
  const result = {};
  for (let index = 0; index < arguments_.length; index++) {
    const option = arguments_[index];
    if (option === "--help" || option === "-h") return { help: true };
    if (option !== "--archive") throw new Error(`未知参数：${option}\n${usage}`);
    const value = arguments_[++index];
    if (!value || value.startsWith("--") || result[option]) throw new Error(`参数错误：${option}\n${usage}`);
    result[option] = value;
  }
  if (!result["--archive"]) throw new Error(`缺少 --archive 参数，请通过 install.sh 安装。\n${usage}`);
  return { archive: path.resolve(result["--archive"]) };
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

async function verifyArchive(archive) {
  const sums = await readFile(path.join(path.dirname(archive), "SHA256SUMS"), "utf8").catch(() => {
    throw new Error("发行包旁缺少 SHA256SUMS。请重新运行 install.sh 下载完整安装文件。");
  });
  const entry = sums.split(/\r?\n/).find(line => /^[a-f\d]{64} [ *]codex-aquarium\.tgz$/i.test(line));
  const digest = createHash("sha256").update(await readFile(archive)).digest("hex");
  if (!entry || entry.slice(0, 64).toLowerCase() !== digest) throw new Error("SHA-256 校验失败，未安装任何文件。请重新运行 install.sh 下载同一版本的发行包与 SHA256SUMS。");

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

async function validatePackage(directory) {
  const manifest = await json(path.join(directory, ".codex-plugin", "plugin.json"));
  const catalog = await json(path.join(directory, ".agents", "plugins", "marketplace.json"));
  const entry = catalog.plugins?.[0];
  if (manifest.name !== plugin || !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(manifest.version)) throw new Error("发行包的插件名称或版本无效。");
  if (catalog.name !== marketplace || catalog.plugins.length !== 1 || entry?.name !== plugin || entry.source?.source !== "local" || entry.source.path !== "./") {
    throw new Error("发行包的本地 marketplace 配置无效。");
  }
  await Promise.all(["dist/index.html", "server/cli.mjs", "server/autostart.mjs", "server/desktop.mjs", "hooks/hooks.json", "skills/aquarium/SKILL.md"].map(file => access(path.join(directory, file))));
  return manifest.version;
}

async function bindHookRuntime(directory) {
  const file = path.join(directory, "hooks", "hooks.json");
  const configuration = await json(file);
  const runtime = `'${process.execPath.replaceAll("'", "'\\''")}'`;
  for (const groups of Object.values(configuration.hooks ?? {})) {
    for (const hook of groups.flatMap(group => group.hooks)) {
      if (hook.type !== "command") continue;
      hook.command = hook.command.replace(/^node(?=\s)/, () => runtime);
    }
  }
  await writeFile(file, `${JSON.stringify(configuration, null, 2)}\n`);
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
    const archive = configuration.archive;
    await verifyArchive(archive);
    command("tar", ["-xzf", archive, "--no-same-owner", "--no-same-permissions", "-C", temporary]);
    const extracted = path.join(temporary, plugin);
    const version = await validatePackage(extracted);
    await bindHookRuntime(extracted);
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
    try {
      console.log(command(process.execPath, [path.join(destination, "server", "autostart.mjs"), "enable"]));
    } catch {
      console.warn("鱼缸已安装，但自动启动未能配置。请在 macOS 登录会话中运行安装目录下的 node server/autostart.mjs enable 重试。");
    }
    console.log("\n请在 Codex 中审阅并信任此插件的 Hooks，然后重启 Codex。继续会话并执行工具调用后，鱼缸才会收到真实事件。\nmacOS 自动启动配置成功后，打开 Codex 即可直接访问鱼缸地址，无需发送启动提示词。");
  } finally {
    if (!preserveBackup) await rm(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && await realpath(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const configuration = options(process.argv.slice(2));
    if (configuration.help) console.log(usage);
    if (!configuration.help) await install(configuration);
  } catch (error) {
    console.error(`安装失败：${error.message}`);
    process.exitCode = 1;
  }
}
