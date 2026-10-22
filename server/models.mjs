import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const SOURCE = /^https:\/\/raw\.githubusercontent\.com\/kinglisky\/codex-aquarium\/([a-f0-9]{40})\/public\/models\/acnh\/$/;
const MODEL = /^companions\/[A-Za-z0-9][A-Za-z0-9_-]*\.glb$/;
const digest = content => createHash("sha256").update(content).digest("hex");

export class ModelDownloadError extends Error {
  constructor() {
    super("小动物模型暂时下载失败，请稍后重试。");
    this.code = "ERR_MODEL_DOWNLOAD";
  }
}

export async function readModelManifest(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export function createModelCache({ directory, manifest, fetch: download = globalThis.fetch }) {
  const pending = new Map();
  const revision = manifest?.baseUrl?.match(SOURCE)?.[1];
  if (manifest && (manifest.version !== 1 || !revision || !manifest.models || typeof manifest.models !== "object")) {
    throw new Error("小动物模型清单无效，请重新安装插件。");
  }
  for (const [name, entry] of Object.entries(manifest?.models ?? {})) {
    if (!MODEL.test(name) || !Number.isSafeInteger(entry?.size) || entry.size < 12 || entry.size > 16 * 1024 * 1024 ||
      !/^[a-f0-9]{64}$/.test(entry.sha256)) {
      throw new Error("小动物模型清单无效，请重新安装插件。");
    }
  }

  function valid(content, entry) {
    return content.length === entry.size && content.toString("ascii", 0, 4) === "glTF" &&
      content.readUInt32LE(4) === 2 && content.readUInt32LE(8) === content.length && digest(content) === entry.sha256;
  }

  async function cached(file, entry) {
    try {
      const content = await readFile(file);
      if (valid(content, entry)) return content;
      await rm(file, { force: true });
      return null;
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  }

  async function receive(url, entry) {
    const response = await download(url, {
      headers: { Accept: "application/vnd.github.raw+json" },
      signal: AbortSignal.timeout(20_000), redirect: "error",
    });
    if (!response.ok || !response.body) throw new ModelDownloadError();
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > entry.size) throw new ModelDownloadError();
      chunks.push(chunk);
    }
    const content = Buffer.concat(chunks);
    if (!valid(content, entry)) throw new ModelDownloadError();
    return content;
  }

  async function load(name, entry) {
    const file = path.join(directory, "models", `${entry.sha256}.glb`);
    const existing = await cached(file, entry);
    if (existing) return existing;
    const sources = [
      `${manifest.baseUrl}${name}`,
      `https://api.github.com/repos/kinglisky/codex-aquarium/contents/public/models/acnh/${name}?ref=${revision}`,
    ];
    for (const source of sources) {
      let content;
      try {
        content = await receive(source, entry);
      } catch {
        continue;
      }
      await mkdir(path.dirname(file), { recursive: true });
      const temporary = `${file}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, content, { flag: "wx" });
        await rename(temporary, file);
      } finally {
        await rm(temporary, { force: true });
      }
      return content;
    }
    throw new ModelDownloadError();
  }

  return {
    async get(name) {
      if (!MODEL.test(name) || !Object.hasOwn(manifest?.models ?? {}, name)) return null;
      const entry = manifest.models[name];
      const active = pending.get(entry.sha256);
      if (active) return active;
      const request = load(name, entry);
      pending.set(entry.sha256, request);
      try {
        return await request;
      } finally {
        pending.delete(entry.sha256);
      }
    },
  };
}
