import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeHook, toolCategory } from "../server/events.mjs";
import { createState } from "../server/state.mjs";

const event = (name, extra = {}, timestamp = 1000) => sanitizeHook({
  hook_event_name: name, session_id: "session-a", cwd: "/projects/aquarium", turn_id: "turn-1", ...extra,
}, timestamp);
const first = state => state.snapshot(10_000).sessions[0];

test("three sessions retain distinct identities; repeated starts never duplicate them", () => {
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

test("inactive sessions retain their identity when the next turn becomes active", () => {
  const state = createState();
  state.apply(event("SessionStart"));
  const initial = first(state);
  assert.equal(initial.status, "idle");
  state.apply(event("UserPromptSubmit", {}, 1100));
  assert.equal(first(state).status, "thinking");
  state.apply(event("Stop", {}, 1200));
  assert.equal(first(state).status, "idle");
  state.apply(event("UserPromptSubmit", { turn_id: "turn-2" }, 1300));
  assert.equal(first(state).status, "thinking");
  assert.equal(first(state).id, initial.id);
  assert.equal(first(state).startedAt, initial.startedAt);
  assert.equal(state.snapshot(2000).sessions.length, 1);
});

test("events for an ended turn cannot wake an idle session even with later timestamps", () => {
  const state = createState();
  state.apply(event("UserPromptSubmit"));
  state.apply(event("Stop", {}, 1100));
  const lateEvents = [
    ["UserPromptSubmit", {}],
    ["PreToolUse", { tool_use_id: "late-call" }],
    ["PermissionRequest", { tool_use_id: "late-call" }],
    ["SubagentStart", { agent_id: "late-child" }],
  ];
  for (const [name, fields] of lateEvents) {
    state.apply(event(name, fields, 1200));
    assert.equal(first(state).status, "idle", name);
    assert.deepEqual(first(state).activities, [], name);
  }
});

test("an old turn cannot stop a newer turn or clear its pending approval", () => {
  const state = createState();
  state.apply(event("UserPromptSubmit"));
  state.apply(event("UserPromptSubmit", { turn_id: "turn-2" }, 1100));
  state.apply(event("PreToolUse", { turn_id: "turn-2", tool_use_id: "current" }, 1200));
  state.apply(event("PermissionRequest", { turn_id: "turn-2", tool_use_id: "current" }, 1300));
  for (const name of ["Stop", "Interrupt"]) {
    state.apply(event(name, {}, 1400));
    assert.equal(first(state).status, "waiting", name);
    assert.deepEqual(first(state).activities.map(activity => activity.id), ["tool:current"], name);
  }
  state.apply(event("PostToolUse", { turn_id: "turn-2", tool_use_id: "current" }, 1500));
  assert.equal(first(state).status, "thinking");
});

test("a delayed approval for a completed tool cannot make its session wait", () => {
  const state = createState();
  state.apply(event("UserPromptSubmit"));
  state.apply(event("PreToolUse", { tool_use_id: "call" }, 1100));
  state.apply(event("PostToolUse", { tool_use_id: "call" }, 1200));
  state.apply(event("PermissionRequest", { tool_use_id: "call" }, 1300));
  assert.equal(first(state).status, "thinking");
  assert.deepEqual(first(state).activities, []);
});

test("resuming after the silence timeout keeps the session but drops abandoned followers and approvals", () => {
  const state = createState();
  state.apply(event("UserPromptSubmit"));
  state.apply(event("PreToolUse", { tool_use_id: "abandoned" }, 1100));
  state.apply(event("PermissionRequest", { tool_use_id: "abandoned" }, 1200));
  state.apply(event("SubagentStart", { agent_id: "abandoned-child" }, 1300));
  const resumedAt = 1300 + 31 * 60_000;
  assert.equal(state.snapshot(resumedAt).sessions[0].status, "stale");
  state.apply(event("UserPromptSubmit", { turn_id: "turn-2" }, resumedAt));
  const resumed = state.snapshot(resumedAt).sessions[0];
  assert.equal(resumed.id, "session-a");
  assert.equal(resumed.startedAt, 1000);
  assert.equal(resumed.status, "thinking");
  assert.deepEqual(resumed.activities, []);
});

test("events older than a saved session cannot wake it after a daemon restart", () => {
  const state = createState();
  state.apply(event("UserPromptSubmit"));
  state.apply(event("Stop", {}, 1500));
  const restored = createState(state.snapshot(2000), 2100);
  restored.apply(event("PreToolUse", { tool_use_id: "late-call" }, 1200));
  const stale = restored.snapshot(2200).sessions[0];
  assert.equal(stale.status, "stale");
  assert.deepEqual(stale.activities, []);
  restored.apply(event("UserPromptSubmit", { turn_id: "turn-2" }, 2300));
  const resumed = restored.snapshot(2400).sessions[0];
  assert.equal(resumed.status, "thinking");
  assert.equal(resumed.id, stale.id);
  assert.equal(resumed.startedAt, stale.startedAt);
});

test("hooks without turn IDs can start a fresh turn after completion", () => {
  const state = createState();
  state.apply(event("UserPromptSubmit", { turn_id: "" }));
  state.apply(event("Stop", { turn_id: "" }, 1100));
  assert.equal(first(state).status, "idle");
  state.apply(event("UserPromptSubmit", { turn_id: "" }, 1200));
  assert.equal(first(state).status, "thinking");
});

test("tool, agent, and permission hooks track a new turn when its prompt is missing or delayed", () => {
  const activities = [
    ["PreToolUse", "PostToolUse", { tool_use_id: "new-call" }, "working"],
    ["SubagentStart", "SubagentStop", { agent_id: "new-child" }, "working"],
    ["PermissionRequest", "PostToolUse", { tool_use_id: "new-call" }, "waiting"],
  ];
  for (const [start, finish, fields, status] of activities) {
    for (const delayedPrompt of [false, true]) {
      const state = createState();
      state.apply(event("UserPromptSubmit"));
      state.apply(event("Stop", {}, 1100));
      const nextTurn = { ...fields, turn_id: "turn-2" };
      state.apply(event(start, nextTurn, 1200));
      assert.equal(first(state).status, status, start);
      if (delayedPrompt) state.apply(event("UserPromptSubmit", nextTurn, 1150));
      state.apply(event(finish, nextTurn, 1300));
      state.apply(event("Stop", nextTurn, 1400));
      state.apply(event("UserPromptSubmit", nextTurn, 1500));
      assert.equal(first(state).status, "idle", start);
      assert.deepEqual(first(state).activities, [], start);
    }
  }
});

test("superseded turns cannot reclaim the session from a turn first seen through its tools", () => {
  const state = createState();
  state.apply(event("UserPromptSubmit"));
  const current = { turn_id: "turn-2", tool_use_id: "current" };
  state.apply(event("PreToolUse", current, 1100));
  state.apply(event("PermissionRequest", current, 1200));
  for (const name of ["UserPromptSubmit", "PreToolUse", "SubagentStart", "PermissionRequest", "Stop", "Interrupt"]) {
    state.apply(event(name, { tool_use_id: "old-call", agent_id: "old-child" }, 1300));
    assert.equal(first(state).status, "waiting", name);
    assert.deepEqual(first(state).activities.map(activity => activity.id), ["tool:current"], name);
  }
  state.apply(event("PostToolUse", current, 1400));
  state.apply(event("Stop", current, 1500));
  assert.equal(first(state).status, "idle");
});

test("a delayed prompt in the current turn cannot clear its pending approval", () => {
  const state = createState();
  const current = { turn_id: "turn-2", tool_use_id: "current" };
  state.apply(event("PermissionRequest", current, 1000));
  state.apply(event("UserPromptSubmit", current, 1100));
  assert.equal(first(state).status, "waiting");
  state.apply(event("PostToolUse", current, 1200));
  assert.equal(first(state).status, "thinking");
  state.apply(event("Stop", current, 1300));
  assert.equal(first(state).status, "idle");
});
