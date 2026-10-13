import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { dataDirectory, readJson } from "./storage.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const directory = dataDirectory();
const runtimeFile = path.join(directory, "runtime.json");

async function running() {
  const runtime = await readJson(runtimeFile);
  if (!Number.isInteger(runtime?.port) || runtime.port < 1 || runtime.port > 65535) return null;
  try {
    const url = `http://127.0.0.1:${runtime.port}`;
    const response = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(1000) });
    const health = await response.json();
    return health.service === "codex-aquarium" ? { runtime, health, url } : null;
  } catch { return null; }
}

async function start() {
  const existing = await running();
  if (existing) { console.log(existing.url); return; }
  await access(path.join(root, "dist", "index.html")).catch(() => {
    throw new Error("尚未构建界面。请先在仓库执行 pnpm install && pnpm build。");
  });
  const child = spawn(process.execPath, [path.join(root, "server", "index.mjs")], {
    detached: true, stdio: "ignore", cwd: root, env: { ...process.env, AQUARIUM_DATA_DIR: directory },
  });
  child.unref();
  let spawnError;
  child.once("error", error => { spawnError = error; });
  for (let attempt = 0; attempt < 30; attempt++) {
    if (spawnError) throw spawnError;
    await sleep(100);
    const current = await running();
    if (current) { console.log(current.url); return; }
  }
  throw new Error("鱼缸启动失败。请检查 Node.js 版本、43187 端口和数据目录权限；可用 node server/index.mjs 查看原因。");
}

async function stop() {
  const current = await running();
  if (!current) { console.log("鱼缸服务未运行。"); return; }
  const response = await fetch(`${current.url}/api/shutdown`, {
    method: "POST", headers: { Authorization: `Bearer ${current.runtime.token}` }, signal: AbortSignal.timeout(2000),
  });
  if (!response.ok) throw new Error("无法停止鱼缸服务，请在启动终端中停止。");
  console.log("鱼缸服务已停止。已安装的 Hooks 仍会采集事件。");
}

async function status() {
  const current = await running();
  if (!current) { console.log(`鱼缸服务未运行。执行 node "${fileURLToPath(import.meta.url)}" start 打开。`); return; }
  console.log(`${current.url}\n已连接会话：${current.health.sessions}`);
  console.log(current.health.lastEventAt ? "已收到 Codex Hooks 事件。" : "等待首个 Hooks 事件。请先安装插件并在 Codex 中信任 Hooks。");
}

const commands = { start, stop, status };
try {
  const command = commands[process.argv[2] || "start"];
  if (!command) throw new Error("用法：node server/cli.mjs start|stop|status");
  await command();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
