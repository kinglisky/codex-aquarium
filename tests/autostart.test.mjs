import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { configureAutostart } from "../server/autostart.mjs";
import { createStartupMonitor, desktopProcesses } from "../server/desktop.mjs";

const execute = promisify(execFile);
const label = "com.kinglisky.codex-aquarium";

test("只识别 Codex 桌面主进程，兼容 ChatGPT 应用名称与路径空格", async () => {
  const identifiers = new Map([
    ["/Applications/Codex.app", "com.openai.codex"],
    ["/Applications/ChatGPT.app", "com.openai.codex"],
    ["/Applications/Personal/ChatGPT.app", "com.openai.chat"],
    ["/Users/Test User/My Apps/Codex.app", "com.openai.codex"],
  ]);
  const inspected = [];
  const run = async (program, args) => {
    if (program === "/bin/ps") {
      assert.deepEqual(args, ["-axo", "pid=,comm="]);
      return { stdout: [
        " 101 /Applications/Codex.app/Contents/MacOS/Codex",
        " 102 /Applications/ChatGPT.app/Contents/MacOS/ChatGPT",
        " 103 /Applications/Personal/ChatGPT.app/Contents/MacOS/ChatGPT",
        " 104 /Applications/Codex.app/Contents/Frameworks/Codex Helper.app/Contents/MacOS/Codex Helper",
        " 105 /Applications/Codex.app/Contents/Resources/codex",
        " 106 /Users/Test User/My Apps/Codex.app/Contents/MacOS/Codex",
        " 107 /opt/homebrew/bin/codex",
      ].join("\n") };
    }
    assert.equal(program, "/usr/libexec/PlistBuddy");
    assert.deepEqual(args.slice(0, 2), ["-c", "Print :CFBundleIdentifier"]);
    const bundle = args[2].replace(/\/Contents\/Info\.plist$/, "");
    assert.equal(identifiers.has(bundle), true, "不应读取 Helper 或 CLI 的应用信息");
    inspected.push(bundle);
    return { stdout: `${identifiers.get(bundle)}\n` };
  };
  assert.deepEqual(await desktopProcesses(run), ["101", "102", "106"]);
  assert.deepEqual(inspected.sort(), [...identifiers.keys()].sort());
});

test("未打开 Codex 时不会检查插件或启动鱼缸", async () => {
  const monitor = createStartupMonitor({
    processes: async () => [],
    enabled: async () => assert.fail("没有应用进程时不应检查插件"),
    start: async () => assert.fail("没有应用进程时不应启动服务"),
  });
  await monitor();
  await monitor();
});

test("同一个 Codex 进程只启动一次，重新打开后再次启动", async () => {
  let processes = ["101"];
  let starts = 0;
  let checks = 0;
  const monitor = createStartupMonitor({
    processes: async () => processes,
    enabled: async () => { checks++; return true; },
    start: async () => { starts++; },
  });
  await monitor();
  await monitor();
  assert.equal(starts, 1, "手动停止服务后，同一应用进程不应再次启动");
  processes = [];
  await monitor();
  processes = ["102"];
  await monitor();
  assert.equal(starts, 2);
  assert.equal(checks, 2);
});

test("插件已禁用时不启动，下一次应用启动后重新检查", async () => {
  let processes = ["101"];
  let enabled = false;
  let starts = 0;
  const monitor = createStartupMonitor({
    processes: async () => processes,
    enabled: async () => enabled,
    start: async () => { starts++; },
  });
  await monitor();
  assert.equal(starts, 0);
  enabled = true;
  await monitor();
  assert.equal(starts, 0, "插件状态变化不应被当成应用重新启动");
  processes = ["102"];
  await monitor();
  assert.equal(starts, 1);
});

test("启动失败后，同一个 Codex 进程可以重试", async () => {
  let attempts = 0;
  const monitor = createStartupMonitor({
    processes: async () => ["101"],
    enabled: async () => true,
    start: async () => { if (++attempts === 1) throw new Error("暂时无法启动"); },
  });
  await assert.rejects(monitor(), /暂时无法启动/);
  await monitor();
  await monitor();
  assert.equal(attempts, 2);
});

test("插件检查失败后会重试，不丢失本次应用启动", async () => {
  let checks = 0;
  let starts = 0;
  const monitor = createStartupMonitor({
    processes: async () => ["101"],
    enabled: async () => { if (++checks === 1) throw new Error("CLI 暂不可用"); return true; },
    start: async () => { starts++; },
  });
  await assert.rejects(monitor(), /CLI 暂不可用/);
  await monitor();
  assert.equal(starts, 1);
});

async function fixture(t) {
  const home = await mkdtemp(path.join(tmpdir(), "aquarium startup & "));
  t.after(() => rm(home, { recursive: true, force: true }));
  const file = path.join(home, "Library", "LaunchAgents", `${label}.plist`);
  const state = { loaded: false, failBootstrap: false, calls: [], bootstrapped: [] };
  const run = async (program, args) => {
    assert.equal(program, "/bin/launchctl");
    state.calls.push([...args]);
    switch (args[0]) {
      case "print":
        if (!state.loaded) throw new Error("没有已加载的任务");
        return { stdout: "已加载" };
      case "bootout":
        state.loaded = false;
        return { stdout: "" };
      case "enable":
        return { stdout: "" };
      case "bootstrap":
        state.bootstrapped.push(await readFile(file, "utf8"));
        if (state.failBootstrap) {
          state.failBootstrap = false;
          throw new Error("bootstrap 失败");
        }
        state.loaded = true;
        return { stdout: "" };
      default:
        assert.fail(`意外的 launchctl 参数：${args[0]}`);
    }
  };
  const options = {
    platform: "darwin", home,
    installation: path.join(home, 'Codex & <Aquarium> "插件"'),
    node: path.join(home, 'Node & "运行时"', "node"),
    env: { CODEX_HOME: path.join(home, "Codex & 用户"), PATH: "/usr/bin:/bin:&<>'\"", AQUARIUM_PORT: "43501" },
    run,
  };
  return { home, file, state, options };
}

test("macOS 以外不会创建目录或调用系统服务", async t => {
  const { home, state, options } = await fixture(t);
  for (const platform of ["linux", "win32"]) {
    const output = await configureAutostart("enable", { ...options, platform });
    assert.match(output, /暂不支持/);
    await configureAutostart("disable", { ...options, platform });
  }
  assert.deepEqual(state.calls, []);
  assert.deepEqual(await readdir(home), []);
  await assert.rejects(readFile(path.join(home, "Library", "LaunchAgents", `${label}.plist`)), { code: "ENOENT" });
});

test("非法配置操作会在调用系统服务前拒绝", async t => {
  const { home, state, options } = await fixture(t);
  for (const platform of ["darwin", "linux"]) {
    for (const action of [undefined, "", "watch", "start", "remove"]) {
      await assert.rejects(configureAutostart(action, { ...options, platform }), /用法/);
    }
  }
  assert.deepEqual(state.calls, []);
  assert.deepEqual(await readdir(home), []);
});

test("启动配置保留路径空格并正确转义 XML", { skip: process.platform !== "darwin" }, async t => {
  const { file, options } = await fixture(t);
  await configureAutostart("enable", options);
  await execute("/usr/bin/plutil", ["-lint", file]);
  const { stdout } = await execute("/usr/bin/plutil", ["-convert", "json", "-o", "-", file]);
  const plist = JSON.parse(stdout);
  assert.deepEqual(plist.ProgramArguments, [options.node, path.join(options.installation, "server", "autostart.mjs"), "watch"]);
  assert.equal(plist.EnvironmentVariables.CODEX_HOME, options.env.CODEX_HOME);
  assert.equal(plist.EnvironmentVariables.PATH, `${path.dirname(options.node)}${path.delimiter}${options.env.PATH}`);
  assert.equal(plist.EnvironmentVariables.AQUARIUM_PORT, options.env.AQUARIUM_PORT);
  assert.equal(plist.StandardOutPath, "/dev/null");
  assert.equal(plist.RunAtLoad, true);
  const xml = await readFile(file, "utf8");
  assert.match(xml, /&amp;/);
  assert.match(xml, /&lt;Aquarium&gt;/);
  assert.match(xml, /&quot;/);
  assert.match(xml, /&apos;/);
});

test("重复启用时先卸载旧任务，再加载更新后的配置", async t => {
  const { file, state, options } = await fixture(t);
  await configureAutostart("enable", options);
  await configureAutostart("enable", { ...options, node: "/new node/bin/node" });
  assert.deepEqual(state.calls.map(args => args[0]), ["print", "enable", "bootstrap", "print", "bootout", "enable", "bootstrap"]);
  assert.equal(state.loaded, true);
  assert.equal(state.bootstrapped.length, 2);
  assert.match(await readFile(file, "utf8"), /\/new node\/bin\/node/);
});

test("重复关闭自动启动不会再次卸载或留下配置文件", async t => {
  const { file, state, options } = await fixture(t);
  await configureAutostart("enable", options);
  state.calls.length = 0;
  await configureAutostart("disable", options);
  await configureAutostart("disable", options);
  assert.deepEqual(state.calls.map(args => args[0]), ["print", "bootout", "print"]);
  assert.equal(state.loaded, false);
  await assert.rejects(readFile(file), { code: "ENOENT" });
});

test("新任务加载失败后删除新配置，不留下无效安装", async t => {
  const { file, state, options } = await fixture(t);
  state.failBootstrap = true;
  await assert.rejects(configureAutostart("enable", options), /bootstrap 失败/);
  assert.equal(state.loaded, false);
  await assert.rejects(readFile(file), { code: "ENOENT" });
});

test("更新任务加载失败后恢复原配置与原任务", async t => {
  const { file, state, options } = await fixture(t);
  const previous = "原先的 LaunchAgent 配置";
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, previous);
  state.loaded = true;
  state.failBootstrap = true;
  await assert.rejects(configureAutostart("enable", options), /bootstrap 失败/);
  assert.equal(await readFile(file, "utf8"), previous);
  assert.equal(state.loaded, true);
  assert.deepEqual(state.calls.map(args => args[0]), ["print", "bootout", "enable", "bootstrap", "bootstrap"]);
  assert.equal(state.bootstrapped.at(-1), previous);
});
