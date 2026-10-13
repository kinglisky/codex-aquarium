export type ActivityCategory = "read" | "write" | "terminal" | "web" | "agent" | "tool";
export type SessionStatus = "thinking" | "working" | "waiting" | "idle" | "interrupted" | "stale";
export interface Activity {
  id: string;
  kind: "tool" | "agent";
  category: ActivityCategory;
  label: string;
  status: "running" | "waiting";
  startedAt: number;
}
export interface AquariumSession {
  id: string;
  label: string;
  status: SessionStatus;
  activities: Activity[];
  startedAt: number;
  updatedAt: number;
}
export interface AquariumSnapshot {
  version: 1;
  sessions: AquariumSession[];
  updatedAt: number;
  lastEventAt: number | null;
  source: "hooks";
}
