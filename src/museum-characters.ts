import companionCatalog from "./companion-catalog.json" with { type: "json" };

export const PLAYER_MODELS = {
  islander: { name: "小女孩", model: "character" },
  boy: { name: "小男孩", model: "players/boy" },
} as const;

export interface CompanionModel {
  id: string;
  name: string;
  englishName: string;
  species: string;
  category: "villager" | "special";
  model: string;
  portrait: string;
}

export const COMPANION_CATALOG = companionCatalog as readonly CompanionModel[];
export const COMPANION_MODELS: Readonly<Record<string, CompanionModel>> = Object.fromEntries(COMPANION_CATALOG.map(model => [model.id, model]));

export function filterCompanions(query: string, species: string) {
  const search = query.trim().toLocaleLowerCase();
  return COMPANION_CATALOG.filter(model => {
    if (species && model.species !== species) return false;
    return !search || [model.id, model.name, model.englishName].some(value => value.toLocaleLowerCase().includes(search));
  });
}

export type PlayerId = keyof typeof PLAYER_MODELS;
export type CompanionId = string;
export interface MuseumAppearance { player: PlayerId; companion: CompanionId | "none"; }
export const DEFAULT_APPEARANCE: MuseumAppearance = { player: "islander", companion: "isabelle" };
export const APPEARANCE_KEY = "codex-aquarium:appearance";

export function isPlayerId(value: unknown): value is PlayerId {
  return typeof value === "string" && Object.hasOwn(PLAYER_MODELS, value);
}

export function isCompanionId(value: unknown): value is MuseumAppearance["companion"] {
  return value === "none" || typeof value === "string" && Object.hasOwn(COMPANION_MODELS, value);
}

export function parseAppearance(value: unknown): MuseumAppearance {
  if (!value || typeof value !== "object") return { ...DEFAULT_APPEARANCE };
  return {
    player: "player" in value && isPlayerId(value.player) ? value.player : DEFAULT_APPEARANCE.player,
    companion: "companion" in value && isCompanionId(value.companion) ? value.companion : DEFAULT_APPEARANCE.companion,
  };
}
