import test from "node:test";
import assert from "node:assert/strict";
import { createState } from "../server/state.mjs";
import { sanitizeHook } from "../server/events.mjs";
import { FISH_TYPES, isActiveSession, hashSeed, speciesForSession } from "../src/sessions.ts";

test("only thinking, working and waiting sessions enter the aquarium", () => {
  const statuses = ["thinking", "working", "waiting", "idle", "interrupted", "stale"];
  const sessions = statuses.map(status => ({ id: status, status }));
  assert.deepEqual(sessions.filter(isActiveSession).map(session => session.id), ["thinking", "working", "waiting"]);
});

test("a fish keeps its species and appearance seed across hiding, resuming and service restarts", () => {
  let state = createState();
  const apply = (name, timestamp, extra = {}) => state.apply(sanitizeHook({
    hook_event_name: name, session_id: "repeat-session", turn_id: "turn-a", ...extra,
  }, timestamp));
  const visible = time => state.snapshot(time).sessions.filter(isActiveSession);
  const identity = session => ({ species: speciesForSession(session.id), seed: hashSeed(session.id) });

  apply("UserPromptSubmit", 1000);
  const original = identity(visible(1000)[0]);
  apply("Stop", 1100);
  assert.equal(visible(1100).length, 0);
  apply("UserPromptSubmit", 1200, { turn_id: "turn-b" });
  assert.deepEqual(identity(visible(1200)[0]), original);
  apply("Interrupt", 1300, { turn_id: "turn-b" });
  assert.equal(visible(1300).length, 0);

  state = createState(state.snapshot(1300), 1400);
  assert.equal(visible(1400).length, 0);
  apply("UserPromptSubmit", 1500, { turn_id: "turn-c" });
  assert.deepEqual(identity(visible(1500)[0]), original);
  assert.equal(visible(1500)[0].startedAt, 1000);
  assert.equal(visible(1500 + 31 * 60_000).length, 0);
});

test("session identity is independent of order and includes all ten fish species", () => {
  const ids = Array.from({ length: 200 }, (_, index) => `session-${index}`);
  const expected = new Map(ids.map(id => [id, speciesForSession(id)]));
  for (const id of ids.toReversed()) assert.equal(speciesForSession(id), expected.get(id));
  assert.deepEqual(new Set(expected.values()), new Set(FISH_TYPES));
  assert.equal(new Set(FISH_TYPES).size, 10);
});
