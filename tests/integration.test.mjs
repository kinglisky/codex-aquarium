import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { request } from "node:http";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { startServer } from "../server/index.mjs";

const observer = fileURLToPath(new URL("../hooks/observe.mjs", import.meta.url));
const secret = "AQUARIUM_PRIVATE_TEST_SENTINEL";

test("正式服务提供完整 GLB，允许内嵌贴图与 WebAssembly，保持 JavaScript 动态执行限制", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "aquarium-assets-"));
  const assets = fileURLToPath(new URL("../public", import.meta.url));
  const model = "/models/acnh/fish/whale-shark.glb";
  const server = await startServer({ directory, port: 0, assets });
  try {
    const response = await fetch(`http://127.0.0.1:${server.port}${model}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "model/gltf-binary");
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), await readFile(path.join(assets, model)));
    const policy = response.headers.get("content-security-policy");
    const scripts = policy.split(";").map(directive => directive.trim()).find(directive => directive.startsWith("script-src "));
    assert.deepEqual(scripts.split(/\s+/), ["script-src", "'self'", "'wasm-unsafe-eval'"]);
    const connections = policy.split(";").map(directive => directive.trim()).find(directive => directive.startsWith("connect-src "));
    assert.deepEqual(connections.split(/\s+/), ["connect-src", "'self'", "blob:"]);
    assert.match(policy, /object-src 'none'/);
  } finally {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

async function observe(directory, event, sessionId, fields = {}) {
  const child = spawn(process.execPath, [observer], {
    env: { ...process.env, AQUARIUM_DATA_DIR: directory },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8").on("data", chunk => { stdout += chunk; });
  child.stderr.setEncoding("utf8").on("data", chunk => { stderr += chunk; });
  const exit = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", code => resolve(code));
  });
  const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
  child.stdin.end(JSON.stringify({
    hook_event_name: event,
    session_id: sessionId,
    turn_id: `turn-${sessionId}`,
    cwd: `/private/${secret}/project-${sessionId}`,
    prompt: secret,
    last_assistant_message: secret,
    tool_input: { token: secret },
    tool_response: secret,
    transcript_path: `/private/${secret}/transcript.jsonl`,
    ...fields,
  }));
  try {
    assert.equal(await exit, 0, "observer exits successfully");
    assert.deepEqual(JSON.parse(stdout), {}, "observer never alters the tool decision");
    assert.equal(stderr, "", "observer never prints private payloads");
    assert.equal(stdout.includes(secret), false);
  } finally {
    clearTimeout(timer);
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  }
}

async function allPersistedText(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const contents = await Promise.all(entries.map(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? allPersistedText(file) : readFile(file, "utf8");
  }));
  return contents.join("\n");
}

async function waitForState(base, predicate) {
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) {
    const response = await fetch(`${base}/api/state`, { signal: AbortSignal.timeout(1500) });
    assert.equal(response.status, 200);
    const snapshot = await response.json();
    if (predicate(snapshot)) return snapshot;
    await delay(25);
  }
  assert.fail("HTTP state did not reach the expected condition within 4 seconds");
}

async function stateStream(base) {
  const abort = new AbortController();
  const response = await fetch(`${base}/api/events`, { signal: abort.signal });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /^text\/event-stream/);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  return {
    async next(predicate = () => true) {
      const timeout = setTimeout(() => abort.abort(new Error("SSE update timed out")), 4000);
      try {
        while (true) {
          const boundary = buffer.indexOf("\n\n");
          if (boundary < 0) {
            const chunk = await reader.read();
            assert.equal(chunk.done, false, "SSE connection remains open");
            buffer += decoder.decode(chunk.value, { stream: true });
            continue;
          }
          const frame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const lines = frame.split("\n");
          if (!lines.includes("event: state")) continue;
          const data = lines.find(line => line.startsWith("data: "));
          assert.ok(data, "state event includes a JSON payload");
          const snapshot = JSON.parse(data.slice(6));
          if (predicate(snapshot)) return snapshot;
        }
      } finally {
        clearTimeout(timeout);
      }
    },
    close() { abort.abort(); },
  };
}

const session = (snapshot, id) => snapshot.sessions.find(item => item.id === id);
const activityIds = (snapshot, id) => session(snapshot, id).activities.map(item => item.id).sort();

function requestStatus(url, options) {
  return new Promise((resolve, reject) => {
    const outgoing = request(url, options, response => {
      response.resume();
      response.once("end", () => resolve(response.statusCode));
      response.once("error", reject);
    });
    outgoing.once("error", reject);
    outgoing.setTimeout(2000, () => outgoing.destroy(new Error("HTTP request timed out")));
    outgoing.end();
  });
}

test("real concurrent hooks reach HTTP and SSE without mixing sessions or persisting private data", { timeout: 20_000 }, async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "codex-aquarium-integration-"));
  let server;
  let stream;
  try {
    await Promise.all(["a", "b", "c"].map(id => observe(directory, "SessionStart", id)));
    const pending = await readdir(path.join(directory, "inbox"));
    assert.equal(pending.filter(name => name.endsWith(".json")).length, 3, "parallel observers never overwrite each other's event files");
    assert.equal((await allPersistedText(directory)).includes(secret), false, "raw inbox contains only sanitized metadata");

    server = await startServer({ directory, port: 0 });
    const base = `http://127.0.0.1:${server.port}`;
    const initial = await waitForState(base, snapshot => snapshot.sessions.length === 3);
    assert.deepEqual(initial.sessions.map(item => item.id).sort(), ["a", "b", "c"]);
    stream = await stateStream(base);
    assert.deepEqual((await stream.next()).sessions.map(item => item.id).sort(), ["a", "b", "c"], "SSE immediately publishes the current snapshot");

    await Promise.all([
      observe(directory, "PreToolUse", "a", { tool_use_id: "shared-call", tool_name: "Bash" }),
      observe(directory, "PreToolUse", "a", { tool_use_id: "second-call", tool_name: "Bash" }),
      observe(directory, "PreToolUse", "b", { tool_use_id: "shared-call", tool_name: "Bash" }),
      observe(directory, "SubagentStart", "a", { agent_id: "child-1", agent_type: "reviewer" }),
    ]);
    const working = await stream.next(snapshot => session(snapshot, "a")?.activities.length === 3 && session(snapshot, "b")?.activities.length === 1);
    assert.deepEqual(activityIds(working, "a"), ["agent:child-1", "tool:second-call", "tool:shared-call"]);
    assert.deepEqual(activityIds(working, "b"), ["tool:shared-call"]);
    assert.equal(session(working, "c").activities.length, 0);

    await observe(directory, "PostToolUse", "a", { tool_use_id: "shared-call", tool_name: "Bash" });
    const completed = await stream.next(snapshot => session(snapshot, "a")?.activities.length === 2);
    assert.deepEqual(activityIds(completed, "a"), ["agent:child-1", "tool:second-call"]);
    assert.deepEqual(activityIds(completed, "b"), ["tool:shared-call"], "same call ID in another session remains active");
    const current = await waitForState(base, snapshot => session(snapshot, "a")?.activities.length === 2);
    assert.deepEqual(current.sessions, completed.sessions, "HTTP and SSE expose the same projection");
    assert.equal((await allPersistedText(directory)).includes(secret), false, "persisted state contains no private hook fields");

    const child = { agent_id: "child-1", turn_id: "child-turn", tool_use_id: "child-call" };
    await observe(directory, "PreToolUse", "a", child);
    await stream.next(snapshot => activityIds(snapshot, "a").includes("tool:child-call"));
    await observe(directory, "Stop", "a");
    const parentStopped = await stream.next(snapshot => session(snapshot, "a")?.activities.length === 2);
    assert.deepEqual(activityIds(parentStopped, "a"), ["agent:child-1", "tool:child-call"]);
    await observe(directory, "SubagentStop", "a", child);
    const idle = await stream.next(snapshot => session(snapshot, "a")?.status === "idle");
    assert.deepEqual(activityIds(idle, "a"), []);
    assert.equal(session(idle, "b").status, "working", "another working session keeps its fish");
    const final = await waitForState(base, snapshot => session(snapshot, "a")?.status === "idle");
    assert.deepEqual(final.sessions, idle.sessions);
  } finally {
    stream?.close();
    try { await server?.close(); }
    finally { await rm(directory, { recursive: true, force: true }); }
  }
});

test("HTTP and SSE hide stopped sessions after a missing tool completion and restore them on resume", { timeout: 10_000 }, async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "codex-aquarium-idle-"));
  let server;
  let stream;
  try {
    server = await startServer({ directory, port: 0 });
    const base = `http://127.0.0.1:${server.port}`;
    stream = await stateStream(base);
    await stream.next();
    await observe(directory, "PreToolUse", "a", { tool_use_id: "abandoned" });
    const initial = await stream.next(snapshot => session(snapshot, "a")?.status === "working");
    await observe(directory, "UserPromptSubmit", "a", { turn_id: "next-turn" });
    await observe(directory, "Stop", "a", { turn_id: "next-turn" });
    const stopped = await stream.next(snapshot => session(snapshot, "a")?.status === "idle");
    assert.deepEqual(activityIds(stopped, "a"), []);
    const current = await waitForState(base, snapshot => session(snapshot, "a")?.status === "idle");
    assert.deepEqual(current.sessions, stopped.sessions);
    await observe(directory, "UserPromptSubmit", "a", { turn_id: "resumed-turn" });
    const resumed = await stream.next(snapshot => session(snapshot, "a")?.status === "thinking");
    assert.equal(session(resumed, "a").id, session(initial, "a").id);
    assert.equal(session(resumed, "a").startedAt, session(initial, "a").startedAt);
    assert.deepEqual(activityIds(resumed, "a"), []);
  } finally {
    stream?.close();
    try { await server?.close(); }
    finally { await rm(directory, { recursive: true, force: true }); }
  }
});

test("the local HTTP service rejects foreign origins, hostile hosts, and unauthenticated shutdown", { timeout: 10_000 }, async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "codex-aquarium-http-"));
  let server;
  try {
    server = await startServer({ directory, port: 0 });
    const base = `http://127.0.0.1:${server.port}`;
    const requests = [
      ["/api/state", { headers: { Origin: "https://example.com" } }],
      ["/api/state", { headers: { Host: "attacker.example" } }],
      ["/api/shutdown", { method: "POST" }],
      ["/api/shutdown", { method: "POST", headers: { Authorization: "Bearer invalid-test-token" } }],
    ];
    for (const [route, options] of requests) {
      const status = await requestStatus(`${base}${route}`, options);
      assert.equal(status, 403, `${route} rejects ${JSON.stringify(options)}`);
    }
    const health = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(2000) });
    assert.equal(health.status, 200, "unauthorized shutdown leaves the service running");
    assert.equal((await health.json()).service, "codex-aquarium");
  } finally {
    try { await server?.close(); }
    finally { await rm(directory, { recursive: true, force: true }); }
  }
});
