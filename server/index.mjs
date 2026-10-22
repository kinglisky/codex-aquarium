import http from "node:http";
import { readFile, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { createState } from "./state.mjs";
import { dataDirectory, readJson, atomicJson, consumeEvents } from "./storage.mjs";
import { createModelCache, readModelManifest } from "./models.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".glb": "model/gltf-binary" };
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

function localRequest(request) {
  try {
    if (!LOOPBACK.has(new URL(`http://${request.headers.host}`).hostname)) return false;
    return !request.headers.origin || LOOPBACK.has(new URL(request.headers.origin).hostname);
  } catch { return false; }
}

export async function startServer({ directory = dataDirectory(), port = 43187, assets = path.join(root, "dist"), modelManifest = path.join(root, "server/model-manifest.json") } = {}) {
  const state = createState(await readJson(path.join(directory, "state.json")));
  const models = createModelCache({ directory, manifest: await readModelManifest(modelManifest) });
  const clients = new Set();
  const token = randomBytes(32).toString("hex");
  let lastPublished = "";
  let stopping = false;
  let consuming = Promise.resolve();
  let busy = false;
  let runtime;

  const broadcast = () => {
    const snapshot = state.snapshot();
    const signature = JSON.stringify({ sessions: snapshot.sessions, lastEventAt: snapshot.lastEventAt });
    if (signature === lastPublished) return;
    lastPublished = signature;
    const message = `event: state\ndata: ${JSON.stringify(snapshot)}\n\n`;
    for (const client of clients) {
      if (client.writableLength > 256 * 1024) { client.destroy(); continue; }
      client.write(message);
    }
  };

  const tick = () => {
    if (busy || stopping) return;
    busy = true;
    consuming = consumeEvents(directory, state)
      .then(broadcast)
      .catch(() => console.error("鱼缸状态暂未写入，请检查数据目录权限。"))
      .finally(() => { busy = false; });
  };

  async function shutdown() {
    if (stopping) return;
    stopping = true;
    clearInterval(poll);
    clearInterval(heartbeat);
    for (const client of clients) client.end();
    await consuming;
    await atomicJson(path.join(directory, "state.json"), state.snapshot());
    await new Promise(resolve => server.close(resolve));
    const current = await readJson(path.join(directory, "runtime.json"));
    if (current?.token === token) await unlink(path.join(directory, "runtime.json"));
  }

  const server = http.createServer(async (request, response) => {
    const json = (status, body) => {
      response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      response.end(JSON.stringify(body));
    };
    if (!localRequest(request)) { json(403, { error: "仅允许本机访问。" }); return; }
    const url = new URL(request.url, "http://127.0.0.1");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    try {
      switch (`${request.method} ${url.pathname}`) {
        case "GET /api/health":
          json(200, { service: "codex-aquarium", version: "0.1.0", sessions: state.snapshot().sessions.length, lastEventAt: state.snapshot().lastEventAt });
          return;
        case "GET /api/state":
          json(200, state.snapshot());
          return;
        case "GET /api/events":
          response.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
          response.write(`retry: 2000\nevent: state\ndata: ${JSON.stringify(state.snapshot())}\n\n`);
          clients.add(response);
          response.on("close", () => clients.delete(response));
          return;
        case "POST /api/shutdown":
          if (request.headers.authorization !== `Bearer ${token}`) { json(403, { error: "无效请求。" }); return; }
          json(200, { stopped: true });
          void shutdown();
          return;
        default:
          break;
      }
      if (!["GET", "HEAD"].includes(request.method)) { json(405, { error: "不支持此操作。" }); return; }
      const file = path.resolve(assets, `.${decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname)}`);
      const type = MIME[path.extname(file)];
      if (!file.startsWith(`${path.resolve(assets)}${path.sep}`) || !type) { json(404, { error: "页面不存在。" }); return; }
      const content = await readFile(file).catch(async error => {
        if (error.code !== "ENOENT") throw error;
        const name = path.relative(path.join(assets, "models/acnh"), file).split(path.sep).join("/");
        const model = await models.get(name);
        if (!model) throw error;
        return model;
      });
      response.writeHead(200, { "Content-Type": type, "Cache-Control": "no-cache", "Content-Security-Policy": "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" });
      response.end(request.method === "HEAD" ? undefined : content);
    } catch (error) {
      if (response.headersSent) { response.destroy(); return; }
      if (error.code === "ERR_MODEL_DOWNLOAD") { json(503, { error: error.message }); return; }
      json(error.code === "ENOENT" ? 404 : 500, { error: "页面暂不可用，请先执行 pnpm build。" });
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  runtime = { port: server.address().port, pid: process.pid, token };
  await atomicJson(path.join(directory, "runtime.json"), runtime);
  const poll = setInterval(tick, 250);
  const heartbeat = setInterval(() => {
    for (const client of clients) client.write(": heartbeat\n\n");
  }, 15_000);
  tick();
  return { port: runtime.port, close: shutdown, state };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.AQUARIUM_PORT || 43187);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("AQUARIUM_PORT 必须为有效端口。");
  await stat(path.join(root, "dist", "index.html"));
  const app = await startServer({ port });
  console.log(`Codex Aquarium: http://127.0.0.1:${app.port}`);
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => void app.close());
}
