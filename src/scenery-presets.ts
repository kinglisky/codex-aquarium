export const SCENERY_PRESETS = {
  garden: { name: "完整造景", description: "长草与岛礁，丰盈共生" },
  meadow: { name: "长叶草甸", description: "层叠长叶，深浅成林" },
  coral: { name: "珊瑚岛礁", description: "高低礁石，珊瑚附生" },
  stone: { name: "静石浅滩", description: "原生岩石，高低层叠" },
  carpet: { name: "低草甸", description: "绿毯铺底，细叶成簇" },
  bare: { name: "清透裸缸", description: "无草石，无底砂" },
} as const;

export type SceneryStyle = keyof typeof SCENERY_PRESETS;
export const DEFAULT_SCENERY_STYLE: SceneryStyle = "garden";
export const SCENERY_KEY = "codex-aquarium:scenery";

export function parseSceneryStyle(value: unknown): SceneryStyle {
  if (typeof value !== "string" || !Object.hasOwn(SCENERY_PRESETS, value)) return DEFAULT_SCENERY_STYLE;
  return value as SceneryStyle;
}
