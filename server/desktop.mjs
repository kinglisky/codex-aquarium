import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execute = promisify(execFile);
const bundles = new Map();

export async function desktopProcesses(run = execute) {
  const { stdout } = await run("/bin/ps", ["-axo", "pid=,comm="], { timeout: 5000 });
  const processes = [];
  for (const line of stdout.split("\n")) {
    const match = line.trim().match(/^(\d+)\s+(.+\/(?:Codex|ChatGPT)\.app)\/Contents\/MacOS\/(?:Codex|ChatGPT)$/);
    if (!match) continue;
    const [, pid, bundle] = match;
    if (!bundles.has(bundle)) {
      const { stdout: identifier } = await run("/usr/libexec/PlistBuddy", ["-c", "Print :CFBundleIdentifier", `${bundle}/Contents/Info.plist`], { timeout: 5000 });
      bundles.set(bundle, identifier.trim() === "com.openai.codex");
    }
    if (bundles.get(bundle)) processes.push(pid);
  }
  return processes;
}

// A new application process starts the service once. An explicit stop stays stopped
// until the next application launch; opening another conversation is not a launch.
export function createStartupMonitor({ processes, enabled, start }) {
  let previous = new Set();
  return async () => {
    const current = new Set(await processes());
    const launched = [...current].some(pid => !previous.has(pid));
    if (launched && await enabled()) await start();
    previous = current;
  };
}
