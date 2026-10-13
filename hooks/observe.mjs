import { sanitizeHook } from "../server/events.mjs";
import { dataDirectory, enqueueEvent } from "../server/storage.mjs";

// This observer must never change a tool decision or interrupt the user's work.
try {
  const chunks = [];
  let length = 0;
  for await (const chunk of process.stdin) {
    length += chunk.length;
    if (length <= 8 * 1024 * 1024) chunks.push(chunk);
  }
  if (length <= 8 * 1024 * 1024) {
    const event = sanitizeHook(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    if (event) await enqueueEvent(dataDirectory(), event);
  }
} catch {
  // Fail open, and never echo a payload that may contain private tool arguments.
}
process.stdout.write("{}\n");
