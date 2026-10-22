import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { sanitizeHook } from "../server/events.mjs";
import { dataDirectory, enqueueEvent } from "../server/storage.mjs";

async function observe() {
  const chunks = [];
  let length = 0;
  for await (const chunk of process.stdin) {
    length += chunk.length;
    if (length <= 8 * 1024 * 1024) chunks.push(chunk);
  }
  if (length > 8 * 1024 * 1024) return;
  const event = sanitizeHook(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  if (!event) return;
  await enqueueEvent(dataDirectory(), event);
  if (event.event !== "SessionStart" || process.env.AQUARIUM_AUTOSTART === "0") return;
  const child = spawn(process.execPath, [fileURLToPath(new URL("../server/cli.mjs", import.meta.url)), "start"], {
    detached: true, stdio: "ignore", env: process.env,
  });
  child.once("error", () => {});
  child.unref();
}

// This observer must never change a tool decision or interrupt the user's work.
await observe().catch(() => {
  // Fail open, and never echo a payload that may contain private tool arguments.
});
process.stdout.write("{}\n");
