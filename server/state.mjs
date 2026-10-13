import { toolCategory } from "./events.mjs";

const STALE_AFTER = 30 * 60_000;
const RETAIN_FOR = 24 * 60 * 60_000;

function newSession(event) {
  return {
    id: event.sessionId, label: event.label, startedAt: event.timestamp,
    updatedAt: event.timestamp, phase: "idle", phaseAt: 0, turnId: "",
    permissions: new Map(), activities: new Map(), completed: new Map(), endedTurns: new Map(),
  };
}

function finishActivity(session, key, time) {
  const activity = session.activities.get(key);
  if (!activity || time >= activity.startedAt) session.activities.delete(key);
  session.completed.set(key, Math.max(session.completed.get(key) ?? 0, time));
}

function isEndedTurn(session, event) {
  if (event.turnId) return session.endedTurns.has(event.turnId);
  return (session.endedTurns.get("") ?? 0) >= event.timestamp;
}

function clearParentPermissions(session) {
  for (const [key, permission] of session.permissions) {
    if (!permission.agentId) session.permissions.delete(key);
  }
}

function trackTurn(session, event) {
  if (isEndedTurn(session, event)) return false;
  if (event.agentId) {
    if (event.event === "SubagentStart") return true;
    const key = `agent:${event.agentId}`;
    return session.activities.has(key) || !session.completed.has(key);
  }
  if (!event.turnId || event.turnId === session.turnId) return true;
  if (event.timestamp < session.phaseAt) return false;
  if (session.turnId) session.endedTurns.set(session.turnId, event.timestamp);
  for (const [key, activity] of session.activities) {
    if (activity.kind !== "tool" || activity.agentId || activity.startedAt > event.timestamp) continue;
    finishActivity(session, key, event.timestamp);
  }
  session.turnId = event.turnId;
  session.phaseAt = event.timestamp;
  clearParentPermissions(session);
  return true;
}

function startActivity(session, event, activity) {
  if ((session.completed.get(activity.id) ?? 0) >= event.timestamp) return false;
  const existing = session.activities.get(activity.id);
  if (existing?.startedAt > event.timestamp) return false;
  if (!trackTurn(session, event)) return false;
  session.activities.set(activity.id, {
    ...activity, agentId: event.agentId, turnId: event.turnId, startedAt: event.timestamp,
  });
  return true;
}

function finishAgent(session, event) {
  if (!event.agentId) return;
  finishActivity(session, `agent:${event.agentId}`, event.timestamp);
  for (const [key, activity] of session.activities) {
    if (activity.kind !== "tool" || activity.agentId !== event.agentId) continue;
    finishActivity(session, key, event.timestamp);
  }
  for (const [key, permission] of session.permissions) {
    if (permission.agentId !== event.agentId || permission.timestamp > event.timestamp) continue;
    session.permissions.delete(key);
  }
}

function endTurn(session, event, phase) {
  if (event.agentId) { finishAgent(session, event); return; }
  session.endedTurns.set(event.turnId, Math.max(session.endedTurns.get(event.turnId) ?? 0, event.timestamp));
  const interruptsSession = phase === "interrupted" && event.timestamp >= session.phaseAt
    && (!event.turnId || !session.turnId || event.turnId === session.turnId);
  for (const [key, activity] of session.activities) {
    if (!interruptsSession && event.turnId && activity.turnId !== event.turnId) continue;
    if (activity.startedAt > event.timestamp) continue;
    // A completed parent turn can leave an independently running subagent.
    if (phase === "idle" && activity.kind === "agent") continue;
    finishActivity(session, key, event.timestamp);
  }
  if (event.timestamp < session.phaseAt) return;
  if (event.turnId && session.turnId && event.turnId !== session.turnId) return;
  session.phase = phase;
  session.phaseAt = event.timestamp;
  if (interruptsSession) { session.permissions.clear(); return; }
  clearParentPermissions(session);
}

const handlers = {
  SessionStart(session, event) {
    if (event.timestamp < session.phaseAt) return;
    if (session.phase === "stale") session.phase = "idle";
  },
  UserPromptSubmit(session, event) {
    if (event.agentId) return;
    if (event.timestamp < session.phaseAt) return;
    if (!trackTurn(session, event)) return;
    session.phase = "thinking";
    session.phaseAt = event.timestamp;
    session.turnId = event.turnId;
    if (!event.turnId) clearParentPermissions(session);
  },
  PreToolUse(session, event) {
    if (!event.toolId) return;
    const started = startActivity(session, event, {
      id: `tool:${event.toolId}`, kind: "tool", category: toolCategory(event.toolName),
      label: event.toolName || "工具", status: "running",
    });
    if (!started) return;
    if (!event.agentId && event.timestamp >= session.phaseAt) session.phase = "thinking";
  },
  PostToolUse(session, event) {
    if (event.toolId) finishActivity(session, `tool:${event.toolId}`, event.timestamp);
    for (const [key, permission] of session.permissions) {
      if (event.timestamp < permission.timestamp) continue;
      if (permission.toolId === event.toolId && event.toolId) {
        session.permissions.delete(key);
        continue;
      }
      if (permission.toolId || permission.toolName !== event.toolName) continue;
      // Without a call ID, wait until every matching concurrent call has finished.
      const pending = [...session.activities.values()].some(activity => activity.label === permission.toolName);
      if (!pending) session.permissions.delete(key);
    }
  },
  PermissionRequest(session, event) {
    if (!event.agentId && event.timestamp < session.phaseAt) return;
    if (event.toolId && session.completed.has(`tool:${event.toolId}`)) return;
    if (!trackTurn(session, event)) return;
    const key = event.toolId ? `tool:${event.toolId}` : `name:${event.toolName}`;
    session.permissions.set(key, event);
    if (!event.agentId) {
      session.phase = "thinking";
      session.phaseAt = event.timestamp;
    }
    const activity = session.activities.get(`tool:${event.toolId}`);
    if (activity) activity.status = "waiting";
  },
  SubagentStart(session, event) {
    if (!event.agentId) return;
    startActivity(session, event, {
      id: `agent:${event.agentId}`, kind: "agent", category: "agent",
      label: event.agentType || "子 Agent", status: "running",
    });
  },
  SubagentStop(session, event) {
    finishAgent(session, event);
  },
  Stop: (session, event) => endTurn(session, event, "idle"),
  Interrupt: (session, event) => endTurn(session, event, "interrupted"),
};

export function createState(saved, now = Date.now()) {
  const sessions = new Map();
  const closed = new Map();
  let lastEventAt = saved?.lastEventAt ?? null;
  for (const previous of saved?.sessions ?? []) {
    if (!previous?.id || !Number.isFinite(previous.updatedAt) || now - previous.updatedAt > RETAIN_FOR) continue;
    const session = newSession({ sessionId: previous.id, label: previous.label, timestamp: previous.startedAt });
    session.updatedAt = previous.updatedAt;
    session.phase = "stale";
    session.phaseAt = previous.updatedAt;
    sessions.set(session.id, session);
  }

  return {
    apply(event) {
      lastEventAt = Math.max(lastEventAt ?? 0, event.timestamp);
      const existing = sessions.get(event.sessionId);
      if (event.event === "SessionEnd") {
        if (!existing || event.timestamp >= existing.updatedAt) sessions.delete(event.sessionId);
        closed.set(event.sessionId, Math.max(closed.get(event.sessionId) ?? 0, event.timestamp));
        return;
      }
      if ((closed.get(event.sessionId) ?? 0) >= event.timestamp) return;
      const handler = handlers[event.event];
      if (!handler) return;
      const session = existing ?? newSession(event);
      if (session.phase === "stale" && event.timestamp < session.phaseAt) return;
      if (event.timestamp - session.updatedAt > STALE_AFTER) {
        session.activities.clear();
        session.permissions.clear();
        session.phase = "idle";
      }
      if (session.phase === "stale" && event.timestamp >= session.phaseAt) session.phase = "idle";
      if (event.timestamp >= session.updatedAt) session.label = event.label;
      session.updatedAt = Math.max(session.updatedAt, event.timestamp);
      handler(session, event);
      sessions.set(session.id, session);
    },
    snapshot(time = Date.now()) {
      for (const [id, session] of sessions) {
        if (time - session.updatedAt > RETAIN_FOR) sessions.delete(id);
        for (const map of [session.completed, session.endedTurns]) {
          for (const [key, timestamp] of map) if (time - timestamp > RETAIN_FOR) map.delete(key);
        }
      }
      for (const [id, timestamp] of closed) if (time - timestamp > RETAIN_FOR) closed.delete(id);
      return {
        version: 1, source: "hooks", updatedAt: time, lastEventAt,
        sessions: [...sessions.values()].sort((a, b) => a.startedAt - b.startedAt).map(session => {
          const activities = [...session.activities.values()].map(({ turnId, agentId, ...activity }) => activity);
          const stale = time - session.updatedAt > STALE_AFTER || session.phase === "stale";
          const status = stale ? "stale" : session.permissions.size ? "waiting" : activities.length ? "working" : session.phase;
          return {
            id: session.id, label: session.label, startedAt: session.startedAt,
            updatedAt: session.updatedAt, status, activities: stale ? [] : activities,
          };
        }),
      };
    },
  };
}
