import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { DEFAULT_SCENERY_STYLE } from "./scenery-presets.ts";
import type { SceneryStyle } from "./scenery-presets.ts";
import { TANK_HALF_WIDTH, TANK_WIDTH } from "./aquarium-layout.ts";

export const SCENERY_MODELS = {
  reefLeft: "scenery/reef-island-left",
  reefRight: "scenery/reef-island-right",
  rocks: "scenery/reef-rocks",
  kelpBank: "scenery/kelp-leafy-bank",
  kelpCove: "scenery/kelp-leafy-cove",
  kelpTuft: "scenery/kelp-tuft",
  eelgrass: "scenery/eelgrass-tuft",
  vallisneria: "scenery/vallisneria-tuft",
  carpet: "scenery/foreground-grass-patch",
  seaGrapes: "scenery/sea-grapes-tuft",
  clam: "scenery/giant-clam",
  urchin: "scenery/sea-urchin",
  scallop: "scenery/scallop",
  starfish: "scenery/starfish",
  sand: "scenery/sand-tile",
} as const;

type SceneryKind = keyof typeof SCENERY_MODELS;
type Placement = readonly [SceneryKind, number, number, number, number];
const HORIZONTAL_SCALE = TANK_WIDTH / 18;
const density = (count: number) => Math.round(count * HORIZONTAL_SCALE);

function random(seed: number) {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

// 最佳候选采样均匀填补空隙，不产生行列；固定种子让回到同风格时形态一致。
function scatter(count: number, bounds: readonly [number, number, number, number], seed: number) {
  const points: THREE.Vector2[] = [];
  for (let index = 0; index < count; index++) {
    let best = new THREE.Vector2();
    let distance = -1;
    for (let attempt = 0; attempt < 8; attempt++) {
      const sample = seed + index * 16 + attempt * 2;
      const point = new THREE.Vector2(THREE.MathUtils.lerp(bounds[0], bounds[1], random(sample)),
        THREE.MathUtils.lerp(bounds[2], bounds[3], random(sample + 1)));
      const nearest = Math.min(...points.map(existing => existing.distanceToSquared(point)));
      if (nearest <= distance) continue;
      best = point;
      distance = nearest;
    }
    points.push(best);
  }
  return points;
}

const carpetBed: Placement[] = Array.from({ length: density(1000) }, (_, index) =>
  ["carpet", THREE.MathUtils.lerp(-8.4, 8.4, random(index * 4 + 1000)),
    THREE.MathUtils.lerp(-5.4, -.6, random(index * 4 + 1001)),
    1.3 + random(index * 4 + 1002) * .5, random(index * 4 + 1003) * Math.PI * 2]);

const carpetFringe: Placement[] = [
  ...scatter(density(32), [-8.3, 8.3, -5.35, -4.35], 13000).map(({ x, y: z }, index): Placement =>
    ["vallisneria", x, z, .9 + random(index + 14000) * .85, (random(index + 15000) - .5) * .8]),
  ...scatter(8, [-8.3, -7.25, -4.2, -1.2], 16000).map(({ x, y: z }, index): Placement =>
    ["vallisneria", x, z, .5 + (-z / 6) + random(index + 17000) * .3, random(index + 18000) - .5]),
  ...scatter(8, [7.25, 8.3, -4.2, -1.2], 19000).map(({ x, y: z }, index): Placement =>
    ["vallisneria", x, z, .5 + (-z / 6) + random(index + 20000) * .3, random(index + 21000) - .5]),
];

const meadowBed: Placement[] = [
  ...scatter(density(50), [-8, 8, -5.1, -4.7], 4000).map(({ x, y: z }, index): Placement =>
    ["kelpCove", x, z, 3.45 + random(index + 5000) * 1.25, (random(index + 6000) - .5) * .28]),
  ...scatter(density(48), [-8.1, 8.1, -4.3, -3.15], 7000).filter(({ x, y: z }) =>
    Math.abs(x - (1.5 + Math.sin(z * 1.2))) > .8).map(({ x, y: z }, index): Placement =>
    [index % 3 === 0 ? "kelpBank" : "kelpCove", x, z, 2.5 + random(index + 8000) * 1.3, (random(index + 9000) - .5) * .65]),
  ...scatter(density(42), [-8.35, 8.35, -2.8, -.8], 10000).filter(({ x, y: z }) =>
    Math.abs(x - (1.5 + Math.sin(z * 1.2))) > 1.25).map(({ x, y: z }, index): Placement =>
    [index % 3 === 0 ? "kelpBank" : "kelpCove", x, z, .55 + (-z - .8) * .8 + random(index + 11000) * .65, random(index + 12000) - .5]),
];

const gardenExtension: Placement[] = [
  ["reefRight", -.6, -3.6, 3.3, .1],
  ...scatter(12, [-3.8, 3.6, -5.05, -4.0], 22000).map(({ x, y: z }, index): Placement =>
    ["kelpCove", x, z, 2.15 + random(index + 23000) * 1.65, (random(index + 24000) - .5) * .35]),
  ...scatter(12, [-3.4, 3.6, -3.1, -1.0], 25000).map(({ x, y: z }, index): Placement =>
    ["carpet", x, z, .7 + random(index + 26000) * .65, random(index + 27000) * Math.PI]),
];

// 完整造景保留原来的配比，其余主题各自采用一种素材族群。
const placements: Record<SceneryStyle, readonly Placement[]> = {
  garden: [
    ["reefLeft", -4.7, -2.98, 5.1, .35], ["reefRight", 5.6, -3.65, 4, -.18],
    ["kelpBank", -6.45, -4.35, 3.7, -.12], ["kelpCove", -5.15, -4.8, 4.25, .24],
    ["kelpCove", -3.5, -4.85, 2.85, -.35], ["kelpBank", 6.75, -4.5, 3.1, .12],
    ["kelpCove", 5.2, -4.85, 2.65, -.22], ["kelpTuft", -7.4, -3.3, 2.15, -.35],
    ["kelpTuft", -3.4, -4.15, 1.6, .55], ["kelpTuft", 7.35, -3.25, 1.65, -.7],
    ["eelgrass", -7.9, -2.5, 1.6, .8], ["eelgrass", -7.1, -2.15, 1.25, -.3],
    ["eelgrass", -3.6, -4.6, 1.7, .2], ["vallisneria", -3.2, -4.95, 1.9, -.4],
    ["eelgrass", 7.6, -2.6, 1.45, -.8], ["vallisneria", 4.65, -4.95, 1.45, .35],
    ["carpet", -7.75, -1.55, 1.15, .6], ["carpet", -7.25, -2.1, 1.05, -.7],
    ["carpet", -6.8, -1, .9, -.4], ["carpet", -6.3, -1.45, 1.15, .7],
    ["carpet", -5.55, -1.1, .8, -.2], ["carpet", -4.95, -1.55, 1.1, .9],
    ["carpet", -4.1, -2.05, .8, -.8], ["carpet", -3.3, -2.7, .65, .4],
    ["carpet", 4, -3.65, .6, -.5], ["carpet", 4.35, -2.8, .8, .7],
    ["carpet", 5, -2.15, 1.05, -.3], ["carpet", 5.9, -1.8, .9, .8],
    ["carpet", 6.7, -1.45, 1.1, .3], ["carpet", 7.45, -1.8, 1.15, -.6],
    ["seaGrapes", -7.7, -1.95, .6, .4], ["seaGrapes", -3.4, -3.8, .5, -.6],
    ["seaGrapes", 7.85, -2, .55, .7], ["clam", -3.45, -1.9, .8, .5],
    ["urchin", -6.9, -1.75, .35, .5], ["urchin", 6.2, -1.6, .27, -.8],
    ["scallop", 4.3, -1.6, .4, -.8], ["starfish", 2.65, -1.8, .45, .6],
    ...gardenExtension,
  ],
  meadow: meadowBed,
  coral: [
    ["reefLeft", -4.8, -3.0, 5.1, .35],
    ["reefRight", 5.4, -3.65, 4.3, -.18],
    ["reefRight", -6.6, -1.55, 2.6, -.2],
    ["reefRight", -3.0, -1.65, 3.3, .1],
    ["reefLeft", 3.25, -4.2, 2.7, .15],
    ["reefRight", 6.4, -1.5, 2.65, -.3],
    ["reefRight", -.9, -3.35, 3.8, .18],
    ["reefLeft", 1.2, -1.65, 2.1, -.2],
  ],
  stone: [
    ["rocks", -4.8, -3.05, 5.8, .03],
    ["rocks", -3.0, -3.2, 4.7, -.35],
    ["rocks", -5.8, -1.5, 2.8, .2],
    ["rocks", 5.8, -3.5, 4.8, -.2],
    ["rocks", 4.9, -2.2, 3.3, .45],
    ["rocks", 1.1, -1.2, 1.7, 1.1],
    ["rocks", 0, -3.9, 4.2, .15],
    ["rocks", -1.1, -1.7, 2.6, -.22],
  ],
  carpet: [
    ...carpetBed,
    ...carpetFringe,
  ],
  bare: [],
};

const swayAmplitude: Partial<Record<SceneryKind, number>> = {
  kelpBank: .16, kelpCove: .16, kelpTuft: .16, eelgrass: .16, vallisneria: .16,
  carpet: .04, seaGrapes: .025,
};

export function sandHeight(x: number, z: number) {
  const localX = x / HORIZONTAL_SCALE;
  const mound = (centerX: number, centerZ: number, width: number, depth: number) =>
    Math.exp(-(((localX - centerX) / width) ** 2) - ((z - centerZ) / depth) ** 2);
  return .51 + mound(-4.9, -3.9, 3.1, 2.1) * .26 + mound(5.8, -4.2, 2.5, 1.6) * .17
    + Math.sin(localX * .7 + z * .5) * .012;
}

function geometryBounds(geometry: THREE.BufferGeometry) {
  const position = geometry.getAttribute("position");
  const bounds = new THREE.Box3();
  const point = new THREE.Vector3();
  for (let vertex = 0; vertex < position.count; vertex++) bounds.expandByPoint(point.fromBufferAttribute(position, vertex));
  return bounds;
}

function greenGrassGeometry(source: THREE.BufferGeometry) {
  const uv = source.getAttribute("uv");
  const indices: number[] = [];
  const count = source.index?.count ?? uv.count;
  for (let triangle = 0; triangle < count; triangle += 3) {
    const vertices = [0, 1, 2].map(offset => source.index?.getX(triangle + offset) ?? triangle + offset);
    // 原版图集右上角是细草；右中部的青蓝圆叶不用于草毯主题。
    if (!vertices.every(vertex => uv.getX(vertex) > .69 && uv.getY(vertex) < .3)) continue;
    indices.push(...vertices);
  }
  const indexed = source.clone().setIndex(indices);
  const geometry = indexed.toNonIndexed();
  indexed.dispose();
  return geometry;
}

export function createMuseumScenery(templates: Map<string, THREE.Group>, style: SceneryStyle = DEFAULT_SCENERY_STYLE) {
  const group = new THREE.Group();
  group.name = `ACNH ${style} garden`;
  const materials = new Set<THREE.Material>();
  const geometries = new Set<THREE.BufferGeometry>();
  const batches = new Map<string, { parts: THREE.BufferGeometry[]; material: THREE.Material }>();
  const obstacles: THREE.Mesh[] = [];
  const time = { value: 0 };

  function cloneMaterial(material: THREE.Material, kind: SceneryKind, phase: number, mesh?: THREE.Mesh) {
    const clone = material.clone();
    materials.add(clone);
    const amplitude = swayAmplitude[kind];
    if (amplitude === undefined) return clone;
    const batched = !mesh;
    const bounds = mesh ? geometryBounds(mesh.geometry) : null;
    const worldToLocal = new THREE.Matrix3();
    if (mesh) worldToLocal.setFromMatrix4(mesh.matrixWorld).invert();
    clone.onBeforeCompile = shader => {
      shader.uniforms.sceneryTime = time;
      shader.uniforms.sceneryPhase = { value: phase };
      shader.uniforms.sceneryRoot = { value: bounds?.min.y ?? 0 };
      shader.uniforms.sceneryHeight = { value: Math.max((bounds?.max.y ?? 1) - (bounds?.min.y ?? 0), 1e-6) };
      shader.uniforms.sceneryAmplitude = { value: amplitude };
      shader.uniforms.sceneryWorldToLocal = { value: worldToLocal };
      shader.vertexShader = `uniform float sceneryTime; uniform float sceneryPhase;
        uniform float sceneryRoot; uniform float sceneryHeight; uniform float sceneryAmplitude;
        uniform mat3 sceneryWorldToLocal;
        ${batched ? "attribute float sceneryLift;" : ""}\n` + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", `
        #include <begin_vertex>
        float lift = ${batched ? "sceneryLift" : "pow(clamp((position.y - sceneryRoot) / sceneryHeight, 0.0, 1.0), 1.6)"};
        vec3 sceneryWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        float currentPhase = dot(sceneryWorld.xz, vec2(.34, .27));
        float current = sin(sceneryTime * .72 + currentPhase);
        float flutter = sin(sceneryTime * 1.63 + currentPhase * 1.4 + sceneryPhase + lift * 2.7);
        vec2 bend = vec2(.94, .34) * current * .84 + vec2(.34, -.94) * flutter * .16;
        float wallDistance = min(${TANK_HALF_WIDTH.toFixed(1)} - abs(sceneryWorld.x), min(sceneryWorld.z + 6.0, -sceneryWorld.z));
        float wallFade = smoothstep(0.0, .22, wallDistance);
        transformed += sceneryWorldToLocal * vec3(bend.x, 0.0, bend.y) * sceneryAmplitude * lift * wallFade;
      `);
    };
    clone.customProgramCacheKey = () => `museum-scenery-current-v3-${batched}`;
    return clone;
  }

  for (const [index, [kind, x, z, scale, rotation]] of placements[style].entries()) {
    const template = templates.get(SCENERY_MODELS[kind]);
    if (!template) continue;
    const specimen = template.clone(true);
    specimen.name = `${kind}-${index}`;
    const worldX = x * HORIZONTAL_SCALE;
    specimen.position.set(worldX, sandHeight(worldX, z) - .035, z);
    specimen.scale.setScalar(scale);
    specimen.rotation.y = rotation;
    const batched = style === "carpet" && kind === "carpet";
    if (style === "meadow" || style === "carpet") {
      const bounds = new THREE.Box3().setFromObject(specimen, true);
      specimen.position.x += Math.max(-TANK_HALF_WIDTH + .04 - bounds.min.x, 0) + Math.min(TANK_HALF_WIDTH - .04 - bounds.max.x, 0);
      specimen.position.z += Math.max(-5.96 - bounds.min.z, 0) + Math.min(-.04 - bounds.max.z, 0);
      specimen.position.y = sandHeight(specimen.position.x, specimen.position.z) - .035;
    }
    specimen.updateMatrixWorld(true);
    specimen.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      if (style === "meadow") object.userData.aquariumCollider = "box";
      const original: THREE.Material[] = Array.isArray(object.material) ? object.material : [object.material];
      if (batched) {
        const geometry = kind === "carpet" ? greenGrassGeometry(object.geometry) : object.geometry.clone();
        const position = geometry.getAttribute("position");
        const bounds = geometryBounds(geometry);
        const height = Math.max(bounds.max.y - bounds.min.y, 1e-6);
        geometry.setAttribute("sceneryLift", new THREE.Float32BufferAttribute(Array.from({ length: position.count },
          (_, vertex) => Math.pow(THREE.MathUtils.clamp((position.getY(vertex) - bounds.min.y) / height, 0, 1), 1.6)), 1));
        geometry.applyMatrix4(object.matrixWorld);
        if (kind === "carpet") {
          for (let vertex = 0; vertex < position.count; vertex++) {
            position.setY(vertex, position.getY(vertex) + sandHeight(position.getX(vertex), position.getZ(vertex))
              - sandHeight(specimen.position.x, specimen.position.z));
          }
        }
        const key = `${kind}-${Math.floor((specimen.position.x + TANK_HALF_WIDTH) / 6)}-${Math.floor((specimen.position.z + 6) / 3)}`;
        const batch = batches.get(key) ?? { parts: [], material: cloneMaterial(original[0], kind, 0) };
        batch.parts.push(geometry);
        batches.set(key, batch);
        return;
      }
      const cloned = original.map(material => cloneMaterial(material, kind, index * 2.31, object));
      object.material = Array.isArray(object.material) ? cloned : cloned[0];
      // 所有凸包都在水箱内，与现有 Rapier 避障共用，水流摆幅保留在安全间隙内。
      obstacles.push(object);
    });
    if (!batched) group.add(specimen);
  }
  for (const [key, batch] of batches) {
    const geometry = mergeGeometries(batch.parts);
    for (const part of batch.parts) part.dispose();
    if (!geometry) throw new Error("无法合并原版水草几何");
    geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, batch.material);
    mesh.name = `${key}-bed`;
    group.add(mesh);
    obstacles.push(mesh);
  }
  group.updateMatrixWorld(true);

  return {
    group,
    obstacles,
    animate(elapsed: number) { time.value = elapsed; },
    dispose() {
      for (const material of materials) material.dispose();
      materials.clear();
      for (const geometry of geometries) geometry.dispose();
      geometries.clear();
      obstacles.length = 0;
      group.clear();
    },
  };
}
