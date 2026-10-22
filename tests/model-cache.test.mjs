import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createModelCache, readModelManifest } from "../server/models.mjs";
import { startServer } from "../server/index.mjs";

const baseUrl = `https://raw.githubusercontent.com/kinglisky/codex-aquarium/${"a".repeat(40)}/public/models/acnh/`;
const name = "companions/test-neighbor.glb";
const content = Buffer.alloc(24);
content.write("glTF");
content.writeUInt32LE(2, 4);
content.writeUInt32LE(content.length, 8);
const sha256 = createHash("sha256").update(content).digest("hex");
const manifest = { version: 1, baseUrl, models: { [name]: { size: content.length, sha256 } } };

async function fixture(t, handler) {
  const directory = await mkdtemp(path.join(tmpdir(), "aquarium-model-cache-"));
  const requests = [];
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });
  const download = (url, options) => {
    requests.push({ url, headers: options.headers });
    const route = url.startsWith("https://api.github.com/") ? "fallback" : "primary";
    return fetch(`http://127.0.0.1:${server.address().port}/${route}`, options);
  };
  return { directory, requests, download, file: path.join(directory, "models", `${sha256}.glb`) };
}

test("仅下载选中模型，并发去重，校验后原子缓存，升级版本后离线复用", async t => {
  const context = await fixture(t, (_request, response) => response.end(content));
  const cache = createModelCache({ directory: context.directory, manifest, fetch: context.download });
  assert.equal(context.requests.length, 0);
  const results = await Promise.all([cache.get(name), cache.get(name)]);
  for (const result of results) assert.deepEqual(result, content);
  assert.equal(context.requests.length, 1);
  assert.equal(context.requests[0].url, `${baseUrl}${name}`);
  assert.equal(context.requests[0].headers.Authorization, undefined);
  assert.deepEqual(await readFile(context.file), content);
  assert.deepEqual(await readdir(path.dirname(context.file)), [`${sha256}.glb`]);
  const upgraded = { ...manifest, baseUrl: baseUrl.replace("a".repeat(40), "b".repeat(40)) };
  const offline = createModelCache({ directory: context.directory, manifest: upgraded, fetch: () => assert.fail("缓存命中不应联网") });
  assert.deepEqual(await offline.get(name), content);
});

test("raw 下载失败时使用同一固定提交的 GitHub API，无需凭据", async t => {
  const context = await fixture(t, (request, response) => {
    if (request.url === "/primary") { response.writeHead(503).end(); return; }
    response.end(content);
  });
  const cache = createModelCache({ directory: context.directory, manifest, fetch: context.download });
  assert.deepEqual(await cache.get(name), content);
  assert.equal(context.requests.length, 2);
  assert.equal(context.requests[1].url, `https://api.github.com/repos/kinglisky/codex-aquarium/contents/public/models/acnh/${name}?ref=${"a".repeat(40)}`);
});

test("保留原模型文件名中的大小写，例如 npc-cmlB.glb", async t => {
  const context = await fixture(t, (_request, response) => response.end(content));
  const model = "companions/npc-cmlB.glb";
  const cache = createModelCache({ directory: context.directory, manifest: { ...manifest, models: { [model]: manifest.models[name] } }, fetch: context.download });
  assert.deepEqual(await cache.get(model), content);
  assert.equal(context.requests[0].url, `${baseUrl}${model}`);
});

test("损坏下载不会写缓存，失败后可重试，已有损坏缓存会重新下载", async t => {
  let corrupt = true;
  const context = await fixture(t, (_request, response) => response.end(corrupt ? Buffer.alloc(24) : content));
  const cache = createModelCache({ directory: context.directory, manifest, fetch: context.download });
  await assert.rejects(cache.get(name), { code: "ERR_MODEL_DOWNLOAD" });
  await assert.rejects(readFile(context.file), { code: "ENOENT" });
  corrupt = false;
  assert.deepEqual(await cache.get(name), content);
  await writeFile(context.file, "broken");
  assert.deepEqual(await cache.get(name), content);
  assert.equal(context.requests.length, 4);
});

test("拒绝超出大小、SHA-256 不符或不是 GLB 的内容", async t => {
  let body = Buffer.concat([content, content]);
  const context = await fixture(t, (_request, response) => response.end(body));
  const cache = createModelCache({ directory: context.directory, manifest, fetch: context.download });
  await assert.rejects(cache.get(name), { code: "ERR_MODEL_DOWNLOAD" });
  body = Buffer.from(content);
  body[23] = 1;
  await assert.rejects(cache.get(name), { code: "ERR_MODEL_DOWNLOAD" });
  const invalid = { version: 1, baseUrl, models: { [name]: { size: body.length, sha256: createHash("sha256").update(body).digest("hex") } } };
  body.write("nope");
  invalid.models[name].sha256 = createHash("sha256").update(body).digest("hex");
  await assert.rejects(createModelCache({ directory: context.directory, manifest: invalid, fetch: context.download }).get(name), { code: "ERR_MODEL_DOWNLOAD" });
  await assert.rejects(readFile(context.file), { code: "ENOENT" });
});

test("未知模型与路径穿越不联网，清单只允许固定 GitHub 提交的已知资源", async () => {
  const cache = createModelCache({ directory: tmpdir(), manifest, fetch: () => assert.fail("未知模型不得联网") });
  for (const unknown of ["companions/unknown.glb", "../secret.glb", "fish/test.glb", "companions/test-neighbor.glb/extra"]) {
    assert.equal(await cache.get(unknown), null);
  }
  for (const base of ["https://example.com/", baseUrl.replace("a".repeat(40), "master"), baseUrl.replace("https:", "http:")]) {
    assert.throws(() => createModelCache({ directory: tmpdir(), manifest: { ...manifest, baseUrl: base } }), /清单无效/);
  }
  assert.throws(() => createModelCache({ directory: tmpdir(), manifest: { ...manifest, models: { "../secret.glb": manifest.models[name] } } }), /清单无效/);
  assert.equal(await createModelCache({ directory: tmpdir(), manifest: null }).get(name), null);
  assert.equal(await readModelManifest(path.join(tmpdir(), "aquarium-no-such-manifest.json")), null);
});

test("轻量包通过原模型 URL 提供缓存资源，HEAD 无响应体，未知模型仍为 404", async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "aquarium-light-server-"));
  const assets = path.join(directory, "dist");
  await mkdir(assets);
  await mkdir(path.join(directory, "models"));
  await writeFile(path.join(directory, "models", `${sha256}.glb`), content);
  const modelManifest = path.join(directory, "manifest.json");
  await writeFile(modelManifest, JSON.stringify(manifest));
  const app = await startServer({ directory, assets, port: 0, modelManifest });
  t.after(async () => { await app.close(); await rm(directory, { recursive: true, force: true }); });
  const url = `http://127.0.0.1:${app.port}/models/acnh/${name}`;
  const response = await fetch(url);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "model/gltf-binary");
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), content);
  const head = await fetch(url, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
  assert.equal((await fetch(url.replace("test-neighbor", "unknown"))).status, 404);
});
