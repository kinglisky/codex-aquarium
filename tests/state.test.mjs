import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeHook, toolCategory } from "../server/events.mjs";
import { createState } from "../server/state.mjs";

const event = (name, extra = {}, timestamp = 1000) => sanitizeHook({
  hook_event_name: name, session_id: "session-a", cwd: "/projects/aquarium", turn_id: "turn-1", ...extra,
}, timestamp);
const first = state => state.snapshot(10_000).sessions[0];

test("three sessions create three leaders; repeated starts never duplicate them", () => {
  const state = createState();
  for (const session_id of ["a", "b", "c", "a"]) state.apply(event("SessionStart", { session_id }));
  assert.equal(state.snapshot(2000).sessions.length, 3);
});

test("parallel calls with the same tool name have independent followers", () => {
  const state = createState();
  state.apply(event("UserPromptSubmit"));
  for (const tool_use_id of ["call-1", "call-2"]) state.apply(event("PreToolUse", { tool_use_id, tool_name: "Bash" }, 1100));
  assert.equal(first(state).activities.length, 2);
  state.apply(event("PostToolUse", { tool_use_id: "call-1" }, 1200));
  assert.deepEqual(first(state).activities.map(activity => activity.id), ["tool:call-2"]);
  assert.equal(first(state).status, "working");
});

test("child agents stay with the parent and may outlive the parent response", () => {
  const state = createState();
  state.apply(event("SubagentStart", { agent_id: "child-a", agent_type: "reviewer" }));
  state.apply(event("Stop", {}, 1100));
  assert.equal(first(state).activities[0].kind, "agent");
  assert.equal(first(state).status, "working");
  state.apply(event("SubagentStop", { agent_id: "child-a" }, 1200));
  assert.equal(first(state).activities.length, 0);
  assert.equal(first(state).status, "idle");
});

test("interrupt clears followers, session end removes its leader", () => {
  const state = createState();
  state.apply(event("SubagentStart", { agent_id: "child" }));
  state.apply(event("PreToolUse", { tool_use_id: "call" }));
  state.apply(event("Interrupt", {}, 1100));
  assert.equal(first(state).status, "interrupted");
  assert.equal(first(state).activities.length, 0);
  state.apply(event("SessionEnd", {}, 1200));
  state.apply(event("PreToolUse", { tool_use_id: "late-call" }, 1050));
  assert.equal(state.snapshot(2000).sessions.length, 0);
});

test("late start after a matching finish cannot resurrect a tool", () => {
  const state = createState();
  state.apply(event("PostToolUse", { tool_use_id: "call" }, 1200));
  state.apply(event("PreToolUse", { tool_use_id: "call", tool_name: "read_file" }, 1100));
  assert.equal(first(state).activities.length, 0);
});

test("late tool events cannot revive a completed turn", () => {
  const state = createState();
  state.apply(event("Stop", {}, 1500));
  state.apply(event("PreToolUse", { tool_use_id: "call" }, 1200));
  assert.equal(first(state).activities.length, 0);
  assert.equal(first(state).status, "idle");
});

test("permission requests show waiting and resolved calls resume the session", () => {
  const state = createState();
  state.apply(event("UserPromptSubmit"));
  state.apply(event("PreToolUse", { tool_use_id: "call", tool_name: "Bash" }, 1100));
  state.apply(event("PermissionRequest", { tool_use_id: "call", tool_name: "Bash" }, 1200));
  assert.equal(first(state).status, "waiting");
  state.apply(event("PostToolUse", { tool_use_id: "call" }, 1300));
  assert.equal(first(state).status, "thinking");
});

test("daemon restarts and silent sessions are stale, never shown as active work", () => {
  const state = createState();
  state.apply(event("PreToolUse", { tool_use_id: "call" }));
  const restored = createState(state.snapshot(2000), 2100);
  assert.equal(restored.snapshot(2200).sessions[0].status, "stale");
  assert.equal(restored.snapshot(2200).sessions[0].activities.length, 0);
  assert.equal(state.snapshot(1000 + 31 * 60_000).sessions[0].status, "stale");
});

test("private contents and full paths never enter persisted events", () => {
  const value = event("PreToolUse", { tool_name: "Bash", tool_use_id: "call", prompt: "SECRET", tool_input: { token: "SECRET" }, tool_response: "SECRET", transcript_path: "/private/SECRET", cwd: "/private/project" });
  assert.equal(JSON.stringify(value).includes("SECRET"), false);
  assert.equal(JSON.stringify(value).includes("/private"), false);
  assert.equal(value.label, "project");
  assert.equal(sanitizeHook({ hook_event_name: "Unknown", session_id: "a" }), null);
});

test("a new child agent wakes a restored session", () => {
  const state = createState();
  state.apply(event("SessionStart"));
  const restored = createState(state.snapshot(1100), 1200);
  restored.apply(event("SubagentStart", { agent_id: "fresh-child" }, 1300));
  assert.equal(first(restored).status, "working");
  assert.equal(first(restored).activities[0].id, "agent:fresh-child");
});

test("an unrelated parallel call cannot resolve another call's permission request", () => {
  const state = createState();
  for (const tool_use_id of ["a", "b"]) state.apply(event("PreToolUse", { tool_use_id, tool_name: "Bash" }));
  state.apply(event("PermissionRequest", { tool_use_id: "b", tool_name: "Bash" }, 1100));
  state.apply(event("PostToolUse", { tool_use_id: "a", tool_name: "Bash" }, 1200));
  assert.equal(first(state).status, "waiting");
  state.apply(event("PostToolUse", { tool_use_id: "b", tool_name: "Bash" }, 1300));
  assert.equal(first(state).status, "thinking");
});

test("permission events without call IDs remain waiting until all matching calls finish", () => {
  const state = createState();
  for (const tool_use_id of ["a", "b"]) state.apply(event("PreToolUse", { tool_use_id, tool_name: "Bash" }));
  state.apply(event("PermissionRequest", { tool_name: "Bash" }, 1100));
  state.apply(event("PostToolUse", { tool_use_id: "a", tool_name: "Bash" }, 1200));
  assert.equal(first(state).status, "waiting");
  state.apply(event("PostToolUse", { tool_use_id: "b", tool_name: "Bash" }, 1300));
  assert.equal(first(state).status, "thinking");
});

test("tool categories separate distinct fish species", () => {
  assert.deepEqual(["read_file", "apply_patch", "Bash", "web_search", "spawn_agent", "custom"].map(toolCategory), ["read", "write", "terminal", "web", "agent", "tool"]);
});
