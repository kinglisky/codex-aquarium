import type { AquariumSession } from "../shared/protocol";
import { MUSEUM_SPECIES } from "./museum-fish.ts";
import type { MuseumFishSpecies } from "./museum-fish.ts";

export const FISH_TYPES = Object.keys(MUSEUM_SPECIES) as MuseumFishSpecies[];
export const LEADER_FISH_TYPES = FISH_TYPES.filter(species => MUSEUM_SPECIES[species].length >= 1.35);

export function isActiveSession(session: AquariumSession): boolean {
  return session.status === "thinking" || session.status === "working" || session.status === "waiting";
}

export function hashSeed(id: string): number {
  let result = 2166136261;
  for (const character of id) result = Math.imul(result ^ character.charCodeAt(0), 16777619);
  return result >>> 0;
}

export function speciesForSession(id: string): MuseumFishSpecies {
  return LEADER_FISH_TYPES[hashSeed(id) % LEADER_FISH_TYPES.length];
}

export function speciesForExhibit(id: string): MuseumFishSpecies {
  return FISH_TYPES[hashSeed(id) % FISH_TYPES.length];
}
