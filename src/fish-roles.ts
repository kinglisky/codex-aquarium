import type { ActivityCategory } from '../shared/protocol.ts';
import { MUSEUM_SPECIES } from './museum-fish.ts';
import type { MuseumFishSpecies } from './museum-fish.ts';

export const ACTIVITY_FISH = {
  read: 'anchovy',
  write: 'clownfish',
  terminal: 'bitterling',
  web: 'neon-tetra',
  agent: 'surgeonfish',
  tool: 'rainbowfish',
} as const satisfies Record<ActivityCategory, MuseumFishSpecies>;

export type FishRole = 'session' | 'agent' | 'tool';

const ROLE_LENGTHS: Record<FishRole, readonly [number, number]> = {
  session: [1.7, 3.4],
  agent: [.6, .6],
  tool: [.42, .42],
};

// 按原模型长度确定实际体型，避免将大鱼缩成随行鱼后仍抢过主鱼。
export function scaleForFishRole(species: MuseumFishSpecies, role: FishRole): number {
  const length = MUSEUM_SPECIES[species].length;
  const [min, max] = ROLE_LENGTHS[role];
  return Math.min(max, Math.max(min, length)) / length;
}
