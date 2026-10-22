import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cp, chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const root = fileURLToPath(new URL("../", import.meta.url));

async function readRuntime(directory) {
  return readFile(path.join(directory, "runtime.json"), "utf8").then(JSON.parse).catch(error => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
}

async function waitFor(check) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await delay(25);
  }
  assert.fail("隔离的鱼缸服务未在 5 秒内达到预期状态");
}

async function fixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(), "aquarium hook's $ "));
  const plugin = path.join(directory, "plugin");
  const home = path.join(directory, "home");
  const data = path.join(home, ".codex", "codex-aquarium");
  const bin = path.join(directory, "bin");
  const node = path.join(home, ".cache", "codex-runtimes", "test-runtime", "dependencies", "node", "bin", "node");
  await Promise.all([
    cp(path.join(root, "hooks"), path.join(plugin, "hooks"), { recursive: true }),
    cp(path.join(root, "server"), path.join(plugin, "server"), { recursive: true }),
    mkdir(path.join(plugin, "dist"), { recursive: true }),
    mkdir(path.dirname(node), { recursive: true }),
    mkdir(bin),
  ]);
  await writeFile(path.join(plugin, "dist", "index.html"), "isolated marketplace aquarium");
  await symlink(process.execPath, node);
  await writeFile(path.join(bin, "node"), "#!/bin/sh\nexit 71\n");
  await chmod(path.join(bin, "node"), 0o755);
  const socket = createServer();
  await new Promise(resolve => socket.listen(0, "127.0.0.1", resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const env = {
    ...process.env, HOME: home, CODEX_HOME: path.join(home, ".codex"),
    AQUARIUM_DATA_DIR: data, AQUARIUM_PORT: String(port), AQUARIUM_AUTOSTART: "1",
    AQUARIUM_NODE: "", PLUGIN_ROOT: plugin, PATH: bin,
  };
  const base = `http://127.0.0.1:${port}`;
  async function shutdown() {
    const runtime = await readRuntime(data);
    if (!runtime) return;
    assert.equal(runtime.port, port, "只关闭本测试创建的随机端口");
    const response = await fetch(`${base}/api/shutdown`, {
      method: "POST", headers: { Authorization: `Bearer ${runtime.token}` },
      signal: AbortSignal.timeout(1000),
    });
    assert.equal(response.status, 200);
    await waitFor(async () => !await readRuntime(data));
  }
  t.after(async () => {
    try { await shutdown(); }
    finally { await rm(directory, { recursive: true, force: true }); }
  });
  function observe(event, fields = {}) {
    const child = spawn("/bin/sh", [path.join(plugin, "hooks", "run.sh")], { env, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", chunk => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", chunk => { stderr += chunk; });
    child.stdin.end(JSON.stringify({ hook_event_name: event, session_id: "main", turn_id: "turn", ...fields }));
    return new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", code => {
        try {
          assert.equal(code, 0, stderr);
          assert.equal(stdout, "{}\n");
          assert.equal(stderr, "");
          resolve();
        } catch (error) { reject(error); }
      });
    });
  }
  return { data, base, observe, shutdown };
}

test("市场安装的 Hooks 在 GUI PATH 缺少 Node 时静默启动并复用真实鱼缸服务", { timeout: 20_000 }, async t => {
  const f = await fixture(t);
  await f.observe("SessionStart");
  const runtime = await waitFor(() => readRuntime(f.data));
  assert.equal((await fetch(f.base)).status, 200);
  assert.equal(await (await fetch(f.base)).text(), "isolated marketplace aquarium");
  await Promise.all(["second", "third"].map(session_id => f.observe("SessionStart", { session_id })));
  await delay(300);
  assert.equal((await readRuntime(f.data)).pid, runtime.pid, "新会话复用服务，不重启现有服务");

  await f.observe("UserPromptSubmit");
  await f.observe("SubagentStart", { agent_id: "reviewer", agent_type: "review" });
  await f.observe("PreToolUse", { tool_use_id: "read-1", tool_name: "read_file" });
  const session = await waitFor(async () => {
    const snapshot = await (await fetch(`${f.base}/api/state`)).json();
    const current = snapshot.sessions.find(session => session.id === "main");
    return current?.activities.length === 2 ? current : null;
  });
  assert.deepEqual(session.activities.map(activity => activity.id).sort(), ["agent:reviewer", "tool:read-1"]);
  await f.shutdown();
  await f.observe("PreToolUse", { tool_use_id: "read-2" });
  await f.observe("UserPromptSubmit");
  await delay(300);
  assert.equal(await readRuntime(f.data), null, "工具和提示事件不会重新启动用户手动停止的服务");
  await f.observe("SessionStart", { session_id: "reopened" });
  await waitFor(() => readRuntime(f.data));
});

test("市场 Hooks 遇到无效输入或缺少插件目录时不影响 Codex 决策", { timeout: 10_000 }, async t => {
  const f = await fixture(t);
  await f.observe("UnrecognizedEvent");
  await delay(100);
  assert.equal(await readRuntime(f.data), null);
  const child = spawn("/bin/sh", [path.join(root, "hooks", "run.sh")], {
    env: { ...process.env, PLUGIN_ROOT: "" }, stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  child.stdout.setEncoding("utf8").on("data", chunk => { stdout += chunk; });
  await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", code => {
      assert.equal(code, 0);
      resolve();
    });
  });
  assert.equal(stdout, "{}\n");
});
