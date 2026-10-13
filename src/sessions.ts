import type { AquariumSession } from "../shared/protocol";
import type { FishSpecies } from "./fish";

export const FISH_TYPES = [
  "neon", "guppy", "betta", "swordtail", "rainbow", "golden",
  "blacktail", "cardinal", "tiger", "zebra",
] as const satisfies readonly FishSpecies[];

export function isActiveSession(session: AquariumSession): boolean {
  return session.status === "thinking" || session.status === "working" || session.status === "waiting";
}

export function hashSeed(id: string): number {
  let result = 2166136261;
  for (const character of id) result = Math.imul(result ^ character.charCodeAt(0), 16777619);
  return result >>> 0;
}

export function speciesForSession(id: string): FishSpecies {
  return FISH_TYPES[hashSeed(id) % FISH_TYPES.length];
}
