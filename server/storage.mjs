import { mkdir, readFile, writeFile, rename, readdir, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { HOOK_EVENTS } from "./events.mjs";

export function dataDirectory() {
  return path.resolve(process.env.AQUARIUM_DATA_DIR || path.join(process.env.CODEX_HOME || path.join(homedir(), ".codex"), "codex-aquarium"));
}

export async function readJson(file) {
  try { return JSON.parse(await readFile(file, "utf8")); }
  catch (error) {
    if (error.code === "ENOENT" || error instanceof SyntaxError) return null;
    throw error;
  }
}

export async function atomicJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(value), { mode: 0o600 });
  await rename(temporary, file);
}

export async function enqueueEvent(directory, event) {
  const name = `${event.timestamp}-${event.eventId}.json`;
  await atomicJson(path.join(directory, "inbox", name), event);
}

export async function consumeEvents(directory, state) {
  const inbox = path.join(directory, "inbox");
  await mkdir(inbox, { recursive: true, mode: 0o700 });
  const names = (await readdir(inbox)).filter(name => /^\d+-[a-f\d-]+\.json$/.test(name)).sort().slice(0, 500);
  if (!names.length) return false;
  for (const name of names) {
    const event = await readJson(path.join(inbox, name));
    if (!event || !HOOK_EVENTS.has(event.event) || typeof event.sessionId !== "string" || !Number.isFinite(event.timestamp)) continue;
    state.apply(event);
  }
  // Commit the projection before acknowledging the consumed files.
  await atomicJson(path.join(directory, "state.json"), state.snapshot());
  await Promise.all(names.map(name => unlink(path.join(inbox, name))));
  return true;
}
