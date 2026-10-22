import { execFile } from "node:child_process";
import { access, mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { createStartupMonitor, desktopProcesses } from "./desktop.mjs";

const execute = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const label = "com.kinglisky.codex-aquarium";
const selector = "codex-aquarium@codex-aquarium-local";
const xml = value => String(value).replace(/[<>&"']/g, character => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[character]);

export async function configureAutostart(action, {
  platform = process.platform, home = homedir(), installation = root,
  node = process.execPath, env = process.env, run = execute,
} = {}) {
  if (!["enable", "disable"].includes(action)) throw new Error("用法：node server/autostart.mjs enable|disable");
  if (platform !== "darwin") return "当前系统暂不支持随 Codex 应用自动启动，请按需启动鱼缸。";
  const target = `gui/${process.getuid()}/${label}`;
  const file = path.join(home, "Library", "LaunchAgents", `${label}.plist`);
  const loaded = await run("/bin/launchctl", ["print", target]).then(() => true).catch(() => false);
  if (action === "disable") {
    if (loaded) await run("/bin/launchctl", ["bootout", target]);
    await rm(file, { force: true });
    return "已关闭随 Codex 应用自动启动。当前鱼缸服务可单独停止。";
  }
  const directory = path.resolve(env.AQUARIUM_DATA_DIR || path.join(env.CODEX_HOME || path.join(home, ".codex"), "codex-aquarium"));
  const environment = {
    PATH: `${path.dirname(node)}${path.delimiter}${env.PATH || "/usr/bin:/bin:/usr/sbin:/sbin"}`,
    CODEX_HOME: path.resolve(env.CODEX_HOME || path.join(home, ".codex")),
    AQUARIUM_DATA_DIR: directory,
  };
  if (env.AQUARIUM_PORT) environment.AQUARIUM_PORT = env.AQUARIUM_PORT;
  const arguments_ = [node, path.join(installation, "server", "autostart.mjs"), "watch"];
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${label}</string>
<key>ProgramArguments</key><array>${arguments_.map(value => `<string>${xml(value)}</string>`).join("")}</array>
<key>EnvironmentVariables</key><dict>${Object.entries(environment).map(([key, value]) => `<key>${key}</key><string>${xml(value)}</string>`).join("")}</dict>
<key>RunAtLoad</key><true/>
<key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
<key>ThrottleInterval</key><integer>10</integer>
<key>StandardOutPath</key><string>/dev/null</string>
<key>StandardErrorPath</key><string>${xml(path.join(directory, "autostart.log"))}</string>
</dict></plist>
`;
  const previous = await readFile(file, "utf8").catch(error => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  await mkdir(path.dirname(file), { recursive: true });
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = `${file}.tmp`;
  await writeFile(temporary, plist, { mode: 0o600 });
  await rename(temporary, file);
  let unloaded = false;
  try {
    if (loaded) {
      await run("/bin/launchctl", ["bootout", target]);
      unloaded = true;
    }
    await run("/bin/launchctl", ["enable", target]);
    await run("/bin/launchctl", ["bootstrap", `gui/${process.getuid()}`, file]);
  } catch (error) {
    if (previous === null) await rm(file, { force: true });
    if (previous !== null) await writeFile(file, previous, { mode: 0o600 });
    if (previous !== null && unloaded) await run("/bin/launchctl", ["bootstrap", `gui/${process.getuid()}`, file]).catch(() => {});
    throw error;
  }
  return "已启用随 Codex 应用静默启动鱼缸（通常 5 秒内），不会自动打开页面。";
}

async function watch() {
  const monitor = createStartupMonitor({
    processes: () => desktopProcesses(),
    enabled: async () => {
      const { stdout } = await execute("codex", ["plugin", "list", "--json"], { timeout: 10_000 });
      const plugin = JSON.parse(stdout).installed.find(plugin => plugin.pluginId === selector);
      if (!plugin?.enabled || !plugin.installed || !plugin.source?.path) return false;
      return await realpath(plugin.source.path) === await realpath(root);
    },
    start: () => execute(process.execPath, [path.join(root, "server", "cli.mjs"), "start"], { timeout: 10_000 }),
  });
  while (true) {
    // Deleting the installation also lets the watcher exit without a crash loop.
    try { await access(path.join(root, ".codex-plugin", "plugin.json")); }
    catch (error) { if (error.code === "ENOENT") return; throw error; }
    try { await monitor(); }
    catch {
      // No application arguments, conversation data, or child output in logs.
      console.error("鱼缸自动启动暂未成功，5 秒后重试。请检查 Node.js、Codex CLI 和插件状态。");
    }
    await sleep(5000);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv[2] === "watch") await watch();
    if (process.argv[2] !== "watch") console.log(await configureAutostart(process.argv[2]));
  } catch {
    console.error("鱼缸自动启动配置失败，请检查 macOS 用户登录会话和 LaunchAgents 目录权限。");
    process.exitCode = 1;
  }
}
