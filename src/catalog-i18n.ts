import fishCatalog from './fish-catalog.json' with { type: 'json' };
import type { Locale } from './i18n.ts';
import type { MuseumFishSpecies } from './museum-fish.ts';
import { COMPANION_MODELS, PLAYER_MODELS, type PlayerId } from './museum-characters.ts';
import { SCENERY_PRESETS, type SceneryStyle } from './scenery-presets.ts';

const FISH_DESCRIPTIONS = {
  bitterling: 'Silver-gray body with a warm golden belly',
  'pale-chub': 'Slender silver body with pink fin tips',
  'crucian-carp': 'Rounded silver scales and a fan-shaped tail',
  dace: 'Streamlined silver body with a slender tail base',
  carp: 'Bronze scales and short barbels beside its mouth',
  koi: 'Red patches on white, with long flowing fins',
  goldfish: 'Orange-red body and a translucent fan tail',
  'pop-eyed-goldfish': 'Round black eyes and soft, flowing tail fins',
  'ranchu-goldfish': 'Compact red-and-white body with a small fan tail',
  killifish: 'Tiny translucent body with a pale golden glow',
  crawfish: 'Reddish-brown shell and a pair of large claws',
  'soft-shelled-turtle': 'Flat, soft shell and a long pointed snout',
  'snapping-turtle': 'Ridged shell and a long, serrated tail',
  tadpole: 'Small round body with a long translucent tail',
  frog: 'Bright green skin and folded hind legs',
  'freshwater-goby': 'Broad head and mottled brown markings',
  loach: 'Slender golden-brown body and short barbels',
  catfish: 'Smooth gray-green body and long whiskers',
  'giant-snakehead': 'Long, dark patterned body and a continuous dorsal fin',
  bluegill: 'Rounded blue-green body and an orange belly',
  'yellow-perch': 'Golden sides crossed by dark vertical stripes',
  'black-bass': 'Olive-green back with dark markings along its sides',
  tilapia: 'Broad pale-gray body and a finely patterned tail',
  pike: 'Long snout and a streamlined body covered in pale spots',
  'pond-smelt': 'Slender, translucent silver body',
  sweetfish: 'Yellow-green back and a silvery-white belly',
  'cherry-salmon': 'Silver sides with evenly spaced oval markings',
  char: 'Olive body scattered with pale spots',
  'golden-trout': 'Golden belly and a red stripe along its sides',
  stringfish: 'Large bronze-brown body dotted with fine black spots',
  salmon: 'Olive back with pink markings along its sides',
  'king-salmon': 'Broad silver-gray body with dark spots',
  'mitten-crab': 'Brown shell and distinctive furry claws',
  guppy: 'Colorful fan-shaped tail and a slender little body',
  'nibble-fish': 'Small pale-brown body with translucent fin edges',
  angelfish: 'Striped silver body and tall triangular fins',
  betta: 'Blue-to-red colors and large flowing fins',
  'neon-tetra': 'Neon-blue stripe above a vivid red tail and belly',
  rainbowfish: 'Shimmering sides blending blue-purple with orange-red',
  piranha: 'Rounded silver-gray body with a red lower belly',
  arowana: 'Large golden scales and upward-pointing barbels',
  dorado: 'Golden-yellow body and a vermilion tail',
  gar: 'Long pointed snout and diamond-shaped armored scales',
  arapaima: 'Heavy scales that turn brick-red toward the tail',
  'saddled-bichir': 'Long mottled body with a row of small dorsal fins',
  sturgeon: 'Pointed snout and rows of bony plates',
  'sea-butterfly': 'Translucent body and delicate winglike fins',
  seahorse: 'Curved neck and a tightly curled little tail',
  clownfish: 'Orange-red body with bold white bands',
  surgeonfish: 'Royal-blue body and a bright yellow triangular tail',
  'butterfly-fish': 'Flat yellow body with a black band across the eyes',
  napoleonfish: 'Large blue-green body and a prominent forehead',
  'zebra-turkeyfish': 'Red-and-white stripes and feathery pectoral fins',
  blowfish: 'Pale belly and dark round spots',
  'puffer-fish': 'Golden-brown spots and short spines',
  anchovy: 'Small, streamlined silver-blue body',
  'horse-mackerel': 'Silvery sides and yellow-green fin edges',
  'barred-knifejaw': 'Silver sides crossed by broad black stripes',
  'sea-bass': 'Silver-green back and a broad tail fin',
  'red-snapper': 'Pink scales and pale golden eye rings',
  dab: 'Flat brown body that stays close to the bottom',
  'olive-flounder': 'Flat olive body with rippling fin edges',
  squid: 'Translucent tubular body and soft tentacles',
  'moray-eel': 'Long patterned body and an undulating dorsal fin',
  'ribbon-eel': 'Blue ribbonlike body edged with bright yellow fins',
  tuna: 'Streamlined blue-gray body and sickle-shaped yellow fins',
  'blue-marlin': 'Long swordlike bill and a tall dorsal fin',
  'giant-trevally': 'Broad silver body and a deeply forked tail',
  'mahi-mahi': 'Bright green-and-gold sides and a high forehead',
  'ocean-sunfish': 'Large disk-shaped body with tall dorsal and anal fins',
  ray: 'Broad diamond-shaped fins and a long whiplike tail',
  'saw-shark': 'Long toothed snout and a low, streamlined body',
  'hammerhead-shark': 'Wide hammer-shaped head and a tall dorsal fin',
  'great-white-shark': 'Blue-gray back and a snow-white belly',
  'whale-shark': 'Broad head and a constellation of pale spots',
  suckerfish: 'Long dark-gray body and an oval suction disk on its head',
  'football-fish': 'Rounded dark body with a glowing lure',
  oarfish: 'Long silver ribbonlike body and a crimson dorsal fin',
  barreleye: 'Bright green tubular eyes beneath a transparent head',
  coelacanth: 'Ancient armored scales and fleshy paired fins',
} satisfies Record<MuseumFishSpecies, string>;

const COMPANION_SPECIES_NAMES: Readonly<Record<string, string>> = {
  '仓鼠': 'Hamster', '企鹅': 'Penguin', '兔子': 'Rabbit', '公牛': 'Bull',
  '大象': 'Elephant', '小熊': 'Cub', '小鹿': 'Deer', '山羊': 'Goat',
  '松鼠': 'Squirrel', '树袋熊': 'Koala', '母牛': 'Cow', '河马': 'Hippo',
  '熊': 'Bear', '特殊角色': 'Special characters', '犀牛': 'Rhino', '狗': 'Dog',
  '狮子': 'Lion', '狼': 'Wolf', '猩猩': 'Gorilla', '猪': 'Pig',
  '猫': 'Cat', '猴子': 'Monkey', '章鱼': 'Octopus', '绵羊': 'Sheep',
  '老虎': 'Tiger', '老鼠': 'Mouse', '袋鼠': 'Kangaroo', '雕': 'Eagle',
  '青蛙': 'Frog', '食蚁兽': 'Anteater', '马': 'Horse', '鳄鱼': 'Alligator',
  '鸟': 'Bird', '鸡': 'Chicken', '鸭子': 'Duck', '鸵鸟': 'Ostrich',
};

const PLAYER_NAMES = { islander: 'Girl', boy: 'Boy' } satisfies Record<PlayerId, string>;
const SCENERY_COPY = {
  garden: { name: 'Lush garden', description: 'Layered plants and reefs, growing together' },
  meadow: { name: 'Tall meadow', description: 'A layered forest of long green leaves' },
  coral: { name: 'Coral reef', description: 'Corals nestled among rocks of varied heights' },
  stone: { name: 'Rocky shallows', description: 'Natural rocks in gently layered formations' },
  carpet: { name: 'Green carpet', description: 'A soft green floor of fine-leaved plants' },
  bare: { name: 'Clear tank', description: 'Clear glass, without plants, rocks, or sand' },
} satisfies Record<SceneryStyle, { name: string; description: string }>;

export function fishName(species: MuseumFishSpecies, locale: Locale): string {
  if (locale === 'en') return fishCatalog[species].englishName;
  return fishCatalog[species].name;
}

export function fishDescription(species: MuseumFishSpecies, locale: Locale): string {
  if (locale === 'en') return FISH_DESCRIPTIONS[species];
  return fishCatalog[species].description;
}

export function companionName(id: string, locale: Locale): string {
  if (id === 'none') return locale === 'en' ? 'Visit solo' : '独自逛馆';
  const companion = COMPANION_MODELS[id];
  if (!companion) return id;
  if (locale === 'en') return companion.englishName;
  return companion.name;
}

export function companionSpeciesName(species: string, locale: Locale): string {
  if (locale === 'en') return COMPANION_SPECIES_NAMES[species] ?? species;
  return species;
}

export function playerName(id: PlayerId, locale: Locale): string {
  if (locale === 'en') return PLAYER_NAMES[id];
  return PLAYER_MODELS[id].name;
}

export function sceneryCopy(style: SceneryStyle, locale: Locale): { name: string; description: string } {
  if (locale === 'en') return SCENERY_COPY[style];
  return SCENERY_PRESETS[style];
}
