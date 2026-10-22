import { randomUUID } from "node:crypto";
import path from "node:path";

export const HOOK_EVENTS = new Set([
  "SessionStart", "SessionEnd", "UserPromptSubmit", "PreToolUse", "PostToolUse",
  "PermissionRequest", "SubagentStart", "SubagentStop", "Stop", "Interrupt",
]);

const text = (value, limit = 200) => typeof value === "string"
  ? value.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, limit) : "";

/** Never retain prompts, arguments, responses, transcript paths or credentials. */
export function sanitizeHook(input, now = Date.now()) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const sessionId = text(input.session_id);
  if (!sessionId || !HOOK_EVENTS.has(input.hook_event_name)) return null;
  const cwd = text(input.cwd, 1000).replaceAll("\\", "/");
  return {
    version: 1,
    eventId: randomUUID(),
    event: input.hook_event_name,
    sessionId,
    label: path.posix.basename(cwd).slice(0, 60) || "Codex 会话",
    turnId: text(input.turn_id),
    toolId: text(input.tool_use_id),
    toolName: text(input.tool_name, 160),
    agentId: text(input.agent_id),
    agentType: text(input.agent_type, 80),
    timestamp: now,
  };
}

const categories = [
  [/web|browser|fetch|chrome|playwright/i, "web"],
  [/bash|exec|shell|terminal|write_stdin|command/i, "terminal"],
  [/spawn_agent|subagent|\bAgent\b|collaboration/i, "agent"],
  [/patch|edit|write|create|update|delete|remove/i, "write"],
  [/read|search|list|get_|query|find|inspect|grep|snippet/i, "read"],
];

export function toolCategory(name) {
  return categories.find(([pattern]) => pattern.test(name))?.[1] ?? "tool";
}
