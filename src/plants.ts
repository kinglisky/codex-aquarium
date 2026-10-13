import * as THREE from "three";

type Random = () => number;

interface GeometryData {
  positions: number[];
  colors: number[];
  indices: number[];
  motion: number[];
  phase: number;
  rootY: number;
  height: number;
}

interface PlantCluster {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  emergence: number;
}

export interface Plants {
  group: THREE.Group;
  count: number;
  update(time: number, growth: number, flow: number): void;
  setGrowth(growth: number): void;
  dispose(): void;
}

const UP = new THREE.Vector3(0, 1, 0);
const DEEP_GREEN = new THREE.Color("#14552b");
const MID_GREEN = new THREE.Color("#49b63b");
const TIP_GREEN = new THREE.Color("#86e451");
const STEM_GREEN = new THREE.Color("#438e32");

function randomSource(seed: number): Random {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function vertex(
  data: GeometryData,
  point: THREE.Vector3,
  color: THREE.Color,
): number {
  const index = data.positions.length / 3;
  data.positions.push(point.x, point.y, point.z);
  data.colors.push(color.r, color.g, color.b);
  data.motion.push(data.phase, Math.max(0, (point.y - data.rootY) / data.height));
  return index;
}

/** Narrow curved ribbons give every individual leaflet a lit, tapered surface. */
function addRibbon(
  data: GeometryData,
  start: THREE.Vector3,
  end: THREE.Vector3,
  width: number,
  arch: number,
  color: THREE.Color,
  twist = 0,
): void {
  const direction = end.clone().sub(start).normalize();
  const across = new THREE.Vector3().crossVectors(direction, UP).normalize();
  across.y = twist;
  across.normalize();
  const base = data.positions.length / 3;
  const segments = 2;

  for (let step = 0; step <= segments; step += 1) {
    const t = step / segments;
    const point = start.clone().lerp(end, t);
    point.y += Math.sin(t * Math.PI) * arch;
    const halfWidth =
      width * (0.22 + Math.sin(t * Math.PI) * 0.78) * (1 - t * 0.94);
    vertex(data, point.clone().addScaledVector(across, halfWidth), color);
    vertex(data, point.clone().addScaledVector(across, -halfWidth), color);

    if (step === 0) continue;
    const previous = base + (step - 1) * 2;
    data.indices.push(previous, previous + 1, previous + 2);
    data.indices.push(previous + 1, previous + 3, previous + 2);
  }
}

function addStem(
  data: GeometryData,
  root: THREE.Vector3,
  height: number,
  leanX: number,
  leanZ: number,
  phase: number,
): (heightRatio: number) => THREE.Vector3 {
  const bend = phase < Math.PI * 0.84
    ? Math.sign(leanX) * (0.36 + Math.abs(Math.sin(phase * 2.3)) * 0.3)
    : leanX * 0.35;
  const sample = (t: number): THREE.Vector3 =>
    new THREE.Vector3(
      root.x + bend * Math.pow(THREE.MathUtils.smoothstep(t, 0.28, 1), 2)
        + Math.sin(t * 4.4 + phase) * 0.13 * t,
      root.y + height * t,
      root.z + leanZ * t * t + Math.cos(t * 4 + phase) * 0.075 * t,
    );
  const base = data.positions.length / 3;
  const rings = 15;
  const sides = 5;

  for (let ring = 0; ring <= rings; ring += 1) {
    const t = ring / rings;
    const center = sample(t);
    const radius = 0.011 * (1 - t * 0.72);
    const color = STEM_GREEN.clone().lerp(TIP_GREEN, t * t * 0.42);

    for (let side = 0; side < sides; side += 1) {
      const angle = (side / sides) * Math.PI * 2;
      vertex(
        data,
        new THREE.Vector3(
          center.x + Math.cos(angle) * radius,
          center.y,
          center.z + Math.sin(angle) * radius,
        ),
        color,
      );

      if (ring === 0) continue;
      const previous = base + (ring - 1) * sides;
      const current = base + ring * sides;
      const next = (side + 1) % sides;
      data.indices.push(previous + side, current + side, previous + next);
      data.indices.push(previous + next, current + side, current + next);
    }
  }

  return sample;
}

function addFrond(
  data: GeometryData,
  origin: THREE.Vector3,
  angle: number,
  length: number,
  lift: number,
  color: THREE.Color,
  random: Random,
  frame: THREE.Quaternion,
): void {
  const radial = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)).applyQuaternion(frame);
  const lateral = new THREE.Vector3(-Math.sin(angle), 0, Math.cos(angle)).applyQuaternion(frame);
  const up = UP.clone().applyQuaternion(frame);
  const arch = length * (0.16 + Math.cos(angle * 1.7) * 0.06);
  const droop = length * (0.08 + Math.sin(angle * 3.1 + origin.y) * 0.05);
  const pointAt = (t: number): THREE.Vector3 =>
    origin
      .clone()
      .addScaledVector(radial, length * t)
      .addScaledVector(up, lift * t + Math.sin(t * Math.PI) * arch - droop * t * t * t);
  const end = pointAt(1);
  addRibbon(data, origin, end, 0.013, length * 0.12, color, 0.35 + random() * 0.35);
  const pairs = 4;

  for (let pair = 0; pair < pairs; pair += 1) {
    const t = 0.14 + (pair / pairs) * 0.77;
    const base = pointAt(t);
    const featherLength =
      length * (0.31 + Math.sin(t * Math.PI) * 0.23) * (0.85 + random() * 0.3);

    for (const side of [-1, 1]) {
      const tip = base
        .clone()
        .addScaledVector(radial, featherLength * 0.48)
        .addScaledVector(lateral, featherLength * side)
        .addScaledVector(up, featherLength * (0.04 + random() * 0.3));
      addRibbon(
        data,
        base,
        tip,
        0.019 + random() * 0.01,
        featherLength * 0.12,
        color,
        side * (0.65 + random() * 0.65),
      );

      // The outermost pinnae fork once, giving the airy, feathery silhouette.
      if (pair % 2 !== 0 || length < 0.27) continue;
      const fork = base.clone().lerp(tip, 0.48);
      const forkTip = fork
        .clone()
        .addScaledVector(radial, featherLength * 0.52)
        .addScaledVector(lateral, featherLength * side * 0.38)
        .addScaledVector(up, featherLength * 0.1);
      addRibbon(data, fork, forkTip, 0.015, featherLength * 0.14, color, side * 0.65);
    }
  }
}

function addPlant(
  data: GeometryData,
  root: THREE.Vector3,
  height: number,
  random: Random,
  worldX: number,
  branch = false,
): void {
  const phase = random() * Math.PI * 2;
  const variation = randomSource(Math.floor(phase * 1e9));
  if (!branch) {
    data.phase = phase;
    data.rootY = root.y;
    data.height = height;
  }
  const edge = THREE.MathUtils.smoothstep(Math.abs(worldX), 3.6, 4.9);
  const sampleStem = addStem(
    data,
    root,
    height,
    (random() - 0.5) * 1.25 - Math.sign(worldX) * edge * 0.48,
    (random() - 0.5) * 0.36,
    phase,
  );
  const spread = (0.45 + random() * 0.14) * (1 - edge * 0.2) * (branch ? 0.68 : 1);
  let layerAngle = phase;
  const frameAt = (t: number): THREE.Quaternion => {
    const tangent = sampleStem(Math.min(1, t + 0.015))
      .sub(sampleStem(Math.max(0, t - 0.015))).normalize();
    const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(
      (variation() - 0.5) * 0.7,
      0,
      (variation() - 0.5) * 0.9,
    ));
    return new THREE.Quaternion().setFromUnitVectors(UP, tangent).multiply(tilt);
  };

  for (let leafHeight = 0.13 + random() * 0.24; leafHeight < height * 0.98; leafHeight += 0.17 + random() * 0.16) {
    const t = leafHeight / height;
    const origin = sampleStem(t);
    const radius = spread * (0.72 + random() * 0.5)
      * (0.91 + Math.sin(t * 12 + phase) * 0.15);
    const frame = frameAt(t);
    if (variation() < 0.25) {
      const stemOrigin = origin.clone();
      origin.x += (variation() - 0.5) * 0.2;
      origin.z += (variation() - 0.5) * 0.12;
      addRibbon(data, stemOrigin, origin, 0.009, 0.004, STEM_GREEN);
    }
    const count = 6 + Math.floor(random() * 4);
    const color = DEEP_GREEN.clone().lerp(MID_GREEN, Math.min(1, t * 1.1));
    color.lerp(TIP_GREEN, Math.pow(t, 3) * 0.8);
    color.multiplyScalar(0.88 + random() * 0.21);
    layerAngle += 0.4 + random() * 1.3;

    for (let frond = 0; frond < count; frond += 1) {
      const angle =
        layerAngle + (frond / count) * Math.PI * 2 + (random() - 0.5) * 0.16;
      const length = radius * (0.86 + random() * 0.2);
      const lift = length * (0.05 + random() * 0.25 + t * t * 0.025);
      addFrond(data, origin, angle, length, lift, color, random, frame);
    }
  }

  // A compact crown remains distinct from the spaced, open lower whorls.
  const crown = sampleStem(0.96);
  const crownFrame = frameAt(0.96);
  for (let frond = 0; frond < 8; frond += 1) {
    addFrond(
      data,
      crown,
      phase + frond * Math.PI * 0.25,
      0.22 + random() * 0.12,
      0.08 + random() * 0.04,
      TIP_GREEN,
      random,
      crownFrame,
    );
  }

  if (branch || height < 2.8 || random() > 0.18) return;
  const branchRoot = sampleStem(0.38 + random() * 0.2);
  addPlant(data, branchRoot, height * (0.26 + random() * 0.16), random, worldX, true);
}

function createMaterial(
  time: THREE.IUniform<number>,
  flow: THREE.IUniform<number>,
): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    roughness: 0.56,
    metalness: 0,
    emissive: new THREE.Color("#385918"),
    emissiveIntensity: 0.07,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uPlantTime = time;
    shader.uniforms.uPlantFlow = flow;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `
      #include <common>
      uniform float uPlantTime;
      uniform float uPlantFlow;
      attribute vec2 plantMotion;
      varying float vLeafHeight;
    `,
      )
      .replace(
        "#include <begin_vertex>",
        `
      #include <begin_vertex>
      float heightWeight = pow(clamp(plantMotion.y, 0.0, 1.0), 1.55);
      float phase = plantMotion.x;
      float wave = sin(uPlantTime * (0.55 + sin(phase) * 0.13) + phase);
      float ripple = sin(uPlantTime * 1.23 + phase * 2.7 + position.y * 2.5);
      transformed.x += (wave * 0.11 + ripple * 0.022) * heightWeight * uPlantFlow;
      transformed.z += cos(uPlantTime * 0.47 + phase * 1.4 + position.y * 0.7)
        * 0.052 * heightWeight * uPlantFlow;
      vLeafHeight = clamp(position.y / 5.2, 0.0, 1.0);
    `,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `
      #include <common>
      varying float vLeafHeight;
    `,
      )
      .replace(
        "#include <opaque_fragment>",
        `
      // Small forward-scattering lift keeps paper-thin leaves luminous underwater.
      float leafEdge = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 2.0);
      outgoingLight *= 0.74 + 0.26 * smoothstep(0.05, 0.9, vLeafHeight);
      outgoingLight += diffuseColor.rgb * (0.09 + vLeafHeight * 0.065 + leafEdge * 0.08);
      #include <opaque_fragment>
    `,
      );
  };
  material.customProgramCacheKey = () => "aquarium-feather-leaves-v3";
  return material;
}

function createPlantMesh(
  data: GeometryData,
  material: THREE.MeshStandardMaterial,
  name: string,
): THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(data.positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(data.colors, 3));
  geometry.setAttribute("plantMotion", new THREE.Float32BufferAttribute(data.motion, 2));
  geometry.setIndex(data.indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.receiveShadow = true;
  return mesh;
}

function addCarpetTuft(data: GeometryData, root: THREE.Vector3, random: Random, size: number, roundness: number): void {
  const color = MID_GREEN.clone().lerp(TIP_GREEN, 0.25 + random() * 0.48);
  const height = size * (0.6 + random() * 0.7);
  const phase = random() * Math.PI * 2;
  data.phase = phase;
  data.rootY = root.y;
  data.height = height;

  for (let blade = 0; blade < 3 + Math.floor(random() * 4); blade += 1) {
    const angle = phase + blade * 2.4;
    const reach = 0.055 + random() * 0.14;
    const tip = root.clone().add(new THREE.Vector3(
      Math.cos(angle) * reach,
      height * (0.55 + random() * 0.55),
      Math.sin(angle) * reach,
    ));
    addRibbon(data, root, tip, 0.011 + random() * 0.005, 0.05, color, 0.2);
  }

  if (random() > roundness) return;

  // A few low round leaves break up the hairgrass without hiding the fine blades.
  for (let leaf = 0; leaf < 3; leaf += 1) {
    const angle = phase + leaf * 2.1;
    const reach = 0.065 + random() * 0.075;
    const start = root.clone().addScaledVector(UP, 0.035 + random() * 0.03);
    const tip = start.clone().add(new THREE.Vector3(
      Math.cos(angle) * reach,
      0.01 + random() * 0.025,
      Math.sin(angle) * reach,
    ));
    addRibbon(data, start, tip, 0.07 + random() * 0.04, 0.018, color);
  }
}

function geometryData(): GeometryData {
  return { positions: [], colors: [], indices: [], motion: [], phase: 0, rootY: 0, height: 1 };
}

export function createPlants(seed: number): Plants {
  const random = randomSource(seed);
  const group = new THREE.Group();
  group.name = "宝塔草与前景草坪";
  const time = { value: 0 };
  const flow = { value: 1 };
  const material = createMaterial(time, flow);
  const clusters: PlantCluster[] = [];
  const thickets = [
    { x: -4.35, z: -1.1, height: 3.95, radius: 0.48 },
    { x: -3.45, z: -1.58, height: 4.65, radius: 0.65 },
    { x: -2.35, z: -1.1, height: 3.6, radius: 0.72 },
    { x: -1.1, z: -1.56, height: 4.2, radius: 0.6 },
    { x: -0.25, z: -0.9, height: 3.2, radius: 0.63 },
    { x: 1.0, z: -1.5, height: 3.85, radius: 0.67 },
    { x: 2.25, z: -1.48, height: 4.7, radius: 0.7 },
    { x: 3.25, z: -0.9, height: 3.55, radius: 0.67 },
    { x: 4.3, z: -1.18, height: 4.2, radius: 0.5 },
  ] as const;

  for (const [index, thicket] of thickets.entries()) {
    const data = geometryData();

    for (let stem = 0; stem < 6; stem += 1) {
      const angle = random() * Math.PI * 2;
      const distance = Math.sqrt(random()) * thicket.radius;
      const root = new THREE.Vector3(
        THREE.MathUtils.clamp(thicket.x + Math.cos(angle) * distance, -4.75, 4.75),
        0,
        THREE.MathUtils.clamp(thicket.z + Math.sin(angle) * distance * 0.65, -1.83, -0.32),
      );
      const height = thicket.height * (0.68 + random() * 0.39);
      const firstVertex = data.positions.length;
      addPlant(data, root, height, random, root.x);

      // Real leaf whorls retain depth, while glass bounds trim only their outer tips.
      for (let offset = firstVertex; offset < data.positions.length; offset += 3) {
        data.positions[offset] = THREE.MathUtils.clamp(data.positions[offset], -5.23, 5.23);
        data.positions[offset + 2] = root.z + (data.positions[offset + 2] - root.z) * 0.62;
      }
    }

    const mesh = createPlantMesh(data, material, `宝塔草 · 草丛 ${index + 1}`);
    mesh.position.y = 0.2;
    mesh.userData = { kind: "plant", title: "宝塔草", description: "参差交错的羽状叶轮，随着水流独立舒展" };
    group.add(mesh);
    clusters.push({ mesh, emergence: index % 3 * 0.04 });
  }

  for (const x of [-3.4, 0, 3.4]) {
    const data = geometryData();

    for (let patch = 0; patch < 7; patch += 1) {
      const centerX = x + (random() - 0.5) * 2.5;
      const centerZ = -0.25 + random() * 2.1;
      const radius = 0.55 + random() * 0.48;
      const height = 0.075 + Math.pow(random(), 2) * 0.29;
      const roundness = 0.35 + random() * 0.6;

      for (let tuft = 0; tuft < 75; tuft += 1) {
        const angle = random() * Math.PI * 2;
        const distance = Math.sqrt(random()) * radius;
        const root = new THREE.Vector3(
          centerX + Math.cos(angle) * distance,
          random() * 0.025,
          centerZ + Math.sin(angle) * distance * 0.75,
        );
        if (Math.abs(root.x) > 5.04 || root.z > 2.17 || root.z < -0.63) continue;
        addCarpetTuft(data, root, random, height, roundness);
      }
    }

    const mesh = createPlantMesh(data, material, "前景 · 矮珍珠与牛毛草");
    mesh.position.y = 0.2;
    group.add(mesh);
    clusters.push({ mesh, emergence: 0 });
  }

  let previousGrowth = -1;
  const setGrowth = (growth: number): void => {
    const normalized = THREE.MathUtils.clamp((growth - 0.1) / 0.9, 0, 1);
    if (Math.abs(normalized - previousGrowth) < 0.0001) return;
    previousGrowth = normalized;

    for (const cluster of clusters) {
      const stage = THREE.MathUtils.clamp(
        (normalized - cluster.emergence) / (1 - cluster.emergence),
        0,
        1,
      );
      cluster.mesh.visible = stage > 0.015;
      const vertical = 0.035 + Math.pow(stage, 0.6) * 0.965;
      const horizontal = 0.18 + Math.pow(stage, 0.34) * 0.82;
      cluster.mesh.scale.set(horizontal, vertical, horizontal);
    }
  };

  setGrowth(1);

  return {
    group,
    count: thickets.length * 6,
    setGrowth,
    update(elapsed, growth, currentFlow) {
      time.value = elapsed;
      flow.value = THREE.MathUtils.clamp(currentFlow, 0, 2);
      setGrowth(growth);
    },
    dispose() {
      for (const cluster of clusters) cluster.mesh.geometry.dispose();
      material.dispose();
      group.clear();
    },
  };
}
