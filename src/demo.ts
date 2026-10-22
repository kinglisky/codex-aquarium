import type { Activity, AquariumSnapshot } from "../shared/protocol";
import { FISH_TYPES, speciesForExhibit } from "./sessions.ts";
import { MUSEUM_SPECIES } from "./museum-fish.ts";
import type { MuseumFishSpecies } from "./museum-fish.ts";
import { fishName } from "./catalog-i18n.ts";
import type { Locale } from "./i18n.ts";

const examples: (Omit<Activity, "id" | "startedAt" | "label"> & { label: Record<Locale, string> })[] = [
  { kind: "agent", category: "agent", label: { "zh-CN": "界面设计子 Agent", en: "UI design sub-agent" }, status: "running" },
  { kind: "tool", category: "read", label: { "zh-CN": "阅读项目代码", en: "Reading project code" }, status: "running" },
  { kind: "tool", category: "write", label: { "zh-CN": "修改组件", en: "Editing components" }, status: "running" },
  { kind: "tool", category: "terminal", label: { "zh-CN": "运行测试", en: "Running tests" }, status: "running" },
  { kind: "tool", category: "web", label: { "zh-CN": "检索开发文档", en: "Searching developer documentation" }, status: "running" },
  { kind: "tool", category: "tool", label: { "zh-CN": "调用 MCP 工具", en: "Calling MCP tools" }, status: "running" },
];

const firstGroup: MuseumFishSpecies[] = ["whale-shark", "clownfish", "ocean-sunfish", "surgeonfish", "koi", "ray", "betta", "red-snapper", "seahorse", "neon-tetra"];
const remaining = FISH_TYPES.filter(id => !firstGroup.includes(id)).sort((a, b) => MUSEUM_SPECIES[b].length - MUSEUM_SPECIES[a].length);
const otherGroups = Array.from({ length: 7 }, () => [] as MuseumFishSpecies[]);
remaining.forEach((id, index) => {
  const column = index % otherGroups.length;
  const group = Math.floor(index / otherGroups.length) % 2 ? otherGroups.length - 1 - column : column;
  otherGroups[group].push(id);
});
const species = [firstGroup, ...otherGroups].flat();
const sessions = species.map(species => {
  let index = 0;
  while (speciesForExhibit(`demo-${species}-${index}`) !== species) index++;
  return { id: `demo-${species}-${index}`, species };
});
const GROUP_SIZE = 10;
export const DEMO_GROUP_TICKS = 12;
export const DEMO_GROUP_COUNT = Math.ceil(sessions.length / GROUP_SIZE);

export function demoGroup(tick: number) {
  return Math.floor(tick / DEMO_GROUP_TICKS) % DEMO_GROUP_COUNT;
}

export function demoSnapshot(tick: number, locale: Locale = "zh-CN"): AquariumSnapshot {
  const now = Date.now();
  const phase = Math.floor(tick / 3) % examples.length;
  const start = demoGroup(tick) * GROUP_SIZE;
  return {
    version: 1, source: "hooks", updatedAt: now, lastEventAt: now,
    sessions: sessions.slice(start, start + GROUP_SIZE).map(({ id, species }, index) => ({
      id, label: `${locale === "en" ? "Viewing" : "观赏"} ${fishName(species, locale)}`,
      status: index % 3 === 0 ? "working" : "thinking",
      activities: index === 0 ? [0, 1, 2].map(offset => {
        const example = examples[(phase + offset) % examples.length];
        return { ...example, label: example.label[locale], id: `${id}-activity-${offset}`, startedAt: now - 14000 };
      }) : [],
      startedAt: now - 120000, updatedAt: now,
    })),
  };
}
