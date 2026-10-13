import * as THREE from 'three';

export type FishSpecies = 'neon' | 'guppy' | 'betta' | 'swordtail' | 'rainbow' | 'golden' | 'blacktail' | 'cardinal' | 'tiger' | 'zebra';

export const SPECIES: Record<FishSpecies, { name: string; color: string; description: string }> = {
  neon: { name: '霓虹灯鱼', color: '#32dfff', description: '修长的电蓝光带，划过一抹宝石红。' },
  guppy: { name: '孔雀鱼', color: '#ff9c49', description: '小巧流线的身体，展开斑斓的扇尾。' },
  betta: { name: '燕尾斗鱼', color: '#e26dc9', description: '蓝紫色的长鳍随水舒展，像一条轻盈的丝带。' },
  swordtail: { name: '红剑尾', color: '#ff674b', description: '橙红的细长身形，尾端伸出一柄漂亮的长剑。' },
  rainbow: { name: '蓝鳍虹鱼', color: '#6bafff', description: '钴蓝与柠檬金交织，透明的双背鳍迎光闪烁。' },
  golden: { name: '金色长鳍', color: '#f9d570', description: '香槟金的纤细身体，带着柔软飘逸的长尾。' },
  blacktail: { name: '黑尾大勾', color: '#d8e3bc', description: '银绿的修长身体，墨黑勾纹延伸到轻盈的上尾叶。' },
  cardinal: { name: '宝莲灯', color: '#2bdcff', description: '一道连续的宝蓝光带，映着从头到尾的鲜红腹侧。' },
  tiger: { name: '虎皮', color: '#ffb548', description: '金橙身体披着四道黑纹，尖小的头部配上橙红鳍尖。' },
  zebra: { name: '斑马', color: '#8dbcec', description: '蓝金相间的细密横纹，流线身形拖着轻巧的透明叉尾。' },
};

type Point = readonly [number, number];
type Palette = readonly [string, string, string];
type FishShape = {
  length: number;
  height: number;
  width: number;
  body: Palette;
  fin: Palette;
  tail: readonly Point[];
  dorsal: readonly Point[];
  anal: readonly Point[];
};

const SHAPES: Record<FishSpecies, FishShape> = {
  neon: {
    length: 1, height: 0.083, width: 0.044,
    body: ['#205369', '#70b9c5', '#ddedf0'], fin: ['#49989f', '#9adeee', '#b4edee'],
    tail: [[-0.025, 0.035], [-0.25, 0.16], [-0.18, 0.02], [-0.26, -0.13], [-0.02, -0.03]],
    dorsal: [[0.04, 0.075], [-0.13, 0.23], [-0.24, 0.19], [-0.31, 0.052]],
    anal: [[0.02, -0.067], [-0.19, -0.15], [-0.34, -0.045]],
  },
  guppy: {
    length: 0.87, height: 0.073, width: 0.039,
    body: ['#277f91', '#56dcbd', '#edddb5'], fin: ['#03aab2', '#ff922d', '#e53159'],
    tail: [[-0.015, 0.025], [-0.32, 0.31], [-0.48, 0.29], [-0.55, 0.13], [-0.57, -0.07], [-0.48, -0.28], [-0.27, -0.25], [-0.015, -0.024]],
    dorsal: [[0.14, 0.06], [-0.02, 0.24], [-0.18, 0.26], [-0.39, 0.15], [-0.24, 0.05]],
    anal: [[0.07, -0.06], [-0.12, -0.19], [-0.25, -0.07]],
  },
  betta: {
    length: 1.06, height: 0.101, width: 0.045,
    body: ['#30276e', '#566fed', '#bb70c7'], fin: ['#436cdb', '#925ddb', '#f26faf'],
    tail: [[-0.02, 0.04], [-0.25, 0.29], [-0.46, 0.35], [-0.58, 0.23], [-0.43, 0.07], [-0.55, -0.08], [-0.59, -0.3], [-0.35, -0.31], [-0.015, -0.04]],
    dorsal: [[0.12, 0.09], [-0.04, 0.29], [-0.29, 0.31], [-0.52, 0.22], [-0.36, 0.06]],
    anal: [[0.24, -0.075], [0.06, -0.24], [-0.21, -0.3], [-0.53, -0.27], [-0.35, -0.05]],
  },
  swordtail: {
    length: 1.1, height: 0.092, width: 0.045,
    body: ['#a43a2e', '#ff6f35', '#ffc47b'], fin: ['#ed772f', '#ffb94b', '#9f3c36'],
    tail: [[-0.018, 0.035], [-0.28, 0.2], [-0.23, 0.04], [-0.24, -0.07], [-0.64, -0.25], [-0.48, -0.24], [-0.22, -0.14], [-0.015, -0.03]],
    dorsal: [[0.16, 0.084], [0.01, 0.29], [-0.15, 0.25], [-0.29, 0.063]],
    anal: [[0.09, -0.085], [-0.12, -0.21], [-0.25, -0.07]],
  },
  rainbow: {
    length: 1.08, height: 0.117, width: 0.047,
    body: ['#24507a', '#4dace4', '#bde6cd'], fin: ['#257be0', '#67c8ff', '#e1e69a'],
    tail: [[-0.018, 0.032], [-0.3, 0.23], [-0.18, 0.02], [-0.3, -0.23], [-0.015, -0.033]],
    dorsal: [[0.02, 0.114], [-0.11, 0.25], [-0.23, 0.21], [-0.34, 0.055]],
    anal: [[0.17, -0.1], [-0.05, -0.24], [-0.25, -0.19], [-0.35, -0.05]],
  },
  golden: {
    length: 1.13, height: 0.083, width: 0.039,
    body: ['#a58c45', '#e7b95c', '#fff0bc'], fin: ['#d1a24d', '#ffe5a5', '#fff2d7'],
    tail: [[-0.018, 0.027], [-0.31, 0.25], [-0.6, 0.34], [-0.36, 0.11], [-0.27, 0.01], [-0.39, -0.11], [-0.57, -0.29], [-0.3, -0.2], [-0.014, -0.03]],
    dorsal: [[0.09, 0.079], [-0.06, 0.29], [-0.27, 0.31], [-0.45, 0.18], [-0.31, 0.05]],
    anal: [[0.14, -0.074], [-0.06, -0.22], [-0.41, -0.24], [-0.3, -0.05]],
  },
  blacktail: {
    length: 1.12, height: 0.098, width: 0.043,
    body: ['#64794d', '#c8dbc4', '#eff4dc'], fin: ['#adbd77', '#dce6b0', '#f2f7d5'],
    tail: [[-0.02, 0.031], [-0.27, 0.2], [-0.4, 0.28], [-0.31, 0.115], [-0.16, 0.005], [-0.3, -0.19], [-0.2, -0.155], [-0.018, -0.032]],
    dorsal: [[0.065, 0.089], [-0.08, 0.26], [-0.16, 0.205], [-0.27, 0.07]],
    anal: [[0.085, -0.085], [-0.075, -0.205], [-0.31, -0.12], [-0.39, -0.045]],
  },
  cardinal: {
    length: 0.98, height: 0.086, width: 0.039,
    body: ['#173f64', '#4ba8c9', '#fa2745'], fin: ['#608aab', '#addfe7', '#e0f4ee'],
    tail: [[-0.02, 0.031], [-0.24, 0.15], [-0.15, 0.005], [-0.25, -0.15], [-0.018, -0.03]],
    dorsal: [[0.025, 0.079], [-0.1, 0.205], [-0.19, 0.185], [-0.26, 0.06]],
    anal: [[0.07, -0.075], [-0.13, -0.165], [-0.31, -0.07]],
  },
  tiger: {
    length: 0.95, height: 0.158, width: 0.046,
    body: ['#b98336', '#f3c267', '#ffe1a6'], fin: ['#e95c23', '#ff9936', '#ffd381'],
    tail: [[-0.018, 0.034], [-0.3, 0.2], [-0.185, 0.008], [-0.3, -0.2], [-0.017, -0.032]],
    dorsal: [[0.07, 0.145], [-0.06, 0.345], [-0.19, 0.29], [-0.29, 0.083]],
    anal: [[0.055, -0.14], [-0.12, -0.27], [-0.25, -0.085]],
  },
  zebra: {
    length: 1.18, height: 0.074, width: 0.036,
    body: ['#627f99', '#edddb0', '#f1f0d9'], fin: ['#929d81', '#dfddb2', '#f2efcf'],
    tail: [[-0.018, 0.026], [-0.3, 0.175], [-0.23, 0.045], [-0.15, 0], [-0.24, -0.08], [-0.31, -0.175], [-0.016, -0.027]],
    dorsal: [[-0.055, 0.069], [-0.18, 0.18], [-0.28, 0.15], [-0.37, 0.045]],
    anal: [[0.075, -0.066], [-0.105, -0.17], [-0.32, -0.09], [-0.37, -0.04]],
  },
};

const BODY_RINGS = 40;
const BODY_SIDES = 24;
const FIN_RAYS = 44;
const FIN_STEPS = 6;

function bodyRadius(position: number): number {
  const taper = Math.pow(Math.sin(Math.PI * position), 0.77);
  return taper * (0.55 + position * 0.65);
}

function bodyColor(species: FishSpecies, palette: THREE.Color[], position: number, angle: number): THREE.Color {
  const height = Math.cos(angle);
  const lateral = Math.abs(Math.sin(angle));
  const color = palette[1].clone().lerp(palette[height > 0 ? 0 : 2], Math.abs(height) * 0.8);
  const shine = 0.91 + Math.sin(position * 105 + Math.sin(angle * 10) * 2) * 0.045;
  color.multiplyScalar(shine);

  switch (species) {
    case 'neon': {
      const stripe = Math.exp(-Math.pow((height - 0.2) / 0.16, 4)) * lateral;
      color.lerp(new THREE.Color('#0bdfff'), stripe * 0.98);
      if (height < -0.12 && position < 0.63 && lateral > 0.65) color.lerp(new THREE.Color('#f52847'), 0.92);
      return color;
    }
    case 'guppy': {
      const patch = Math.sin(position * 20 + height * 7) * Math.cos(angle * 2);
      color.lerp(new THREE.Color('#f6aa43'), Math.max(0, patch) * 0.78);
      return color;
    }
    case 'rainbow': {
      color.lerp(new THREE.Color('#efcf52'), THREE.MathUtils.smoothstep(0.64 - position, 0, 0.45));
      const stripe = Math.exp(-Math.pow(height / 0.16, 2)) * lateral;
      color.lerp(new THREE.Color('#357489'), stripe * 0.48);
      return color;
    }
    case 'swordtail':
      return color.lerp(new THREE.Color('#fa3c2b'), lateral * 0.17);
    case 'betta':
      return color.lerp(new THREE.Color('#36bfc5'), Math.max(0, Math.sin(position * 28 + angle * 7)) * 0.2);
    case 'golden':
      return color.lerp(new THREE.Color('#fff1c3'), Math.pow(lateral, 10) * 0.27);
    case 'blacktail': {
      const hook = Math.exp(-Math.pow((height - 0.16 + position * 1.8) / 0.2, 4));
      const rear = 1 - THREE.MathUtils.smoothstep(position, 0.33, 0.53);
      return color.lerp(new THREE.Color('#111c22'), hook * rear * lateral * 0.98);
    }
    case 'cardinal': {
      const red = THREE.MathUtils.smoothstep(-height, -0.08, 0.28) * lateral;
      color.lerp(new THREE.Color('#fa1638'), red * 0.98);
      const blue = Math.exp(-Math.pow((height - 0.21) / 0.23, 4)) * lateral;
      return color.lerp(new THREE.Color('#04cfff'), blue);
    }
    case 'tiger': {
      const bars = [0.13, 0.4, 0.64, 0.85];
      const stripe = Math.max(...bars.map(center => Math.exp(-Math.pow((position - center + height * 0.017) / 0.043, 6))));
      color.lerp(new THREE.Color('#ff722c'), THREE.MathUtils.smoothstep(position, 0.89, 1) * 0.8);
      return color.lerp(new THREE.Color('#142122'), stripe * 0.98);
    }
    case 'zebra': {
      const bands = Math.cos((height + position * 0.025) * Math.PI * 5);
      const stripe = THREE.MathUtils.smoothstep(bands, -0.1, 0.55) * Math.pow(lateral, 0.3);
      return color.lerp(new THREE.Color('#19448e'), stripe * 0.98);
    }
  }
}

function createBody(species: FishSpecies, shape: FishShape): THREE.Mesh {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const palette = shape.body.map(color => new THREE.Color(color));
  const sides = species === 'zebra' ? 48 : BODY_SIDES;

  for (let ring = 0; ring <= BODY_RINGS; ring++) {
    const progress = ring / BODY_RINGS;
    const radius = bodyRadius(progress);
    for (let side = 0; side <= sides; side++) {
      const angle = side / sides * Math.PI * 2;
      positions.push((progress - 0.43) * shape.length, Math.cos(angle) * radius * shape.height, Math.sin(angle) * radius * shape.width);
      const color = bodyColor(species, palette, progress, angle);
      colors.push(color.r, color.g, color.b);
      if (ring === BODY_RINGS || side === sides) continue;
      const index = ring * (sides + 1) + side;
      indices.push(index, index + 1, index + sides + 1, index + 1, index + sides + 2, index + sides + 1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const material = new THREE.MeshPhysicalMaterial({
    vertexColors: true, roughness: 0.31, metalness: 0.2, clearcoat: 0.7, clearcoatRoughness: 0.23,
    iridescence: species === 'golden' ? 0.15 : 0.48, iridescenceIOR: 1.25, iridescenceThicknessRange: [120, 270],
  });
  const body = new THREE.Mesh(geometry, material);
  body.castShadow = true;
  return body;
}

type AnimatedFin = { mesh: THREE.Mesh; original: Float32Array; phase: number; flex: number };
type FinOptions = { flex?: number; part?: 'tail' | 'dorsal' };

function createFin(outline: readonly Point[], origin: Point, palette: Palette, species: FishSpecies, { flex = 0.024, part }: FinOptions = {}): AnimatedFin {
  const curve = new THREE.CatmullRomCurve3(outline.map(([x, y]) => new THREE.Vector3(x, y, 0)), false, 'centripetal');
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const tones = palette.map(color => new THREE.Color(color));

  for (let ray = 0; ray <= FIN_RAYS; ray++) {
    const rayPosition = ray / FIN_RAYS;
    const edge = curve.getPoint(rayPosition);
    for (let step = 0; step <= FIN_STEPS; step++) {
      const reach = step / FIN_STEPS;
      const ripple = Math.sin(rayPosition * Math.PI * 22) * Math.pow(reach, 3) * 0.006;
      const x = THREE.MathUtils.lerp(origin[0], edge.x, reach);
      const y = THREE.MathUtils.lerp(origin[1], edge.y, reach) + ripple;
      positions.push(x, y, Math.sin(rayPosition * 22) * reach * reach * 0.009);
      const band = THREE.MathUtils.smoothstep(reach, 0.28, 0.87);
      const color = tones[0].clone().lerp(tones[1], band).lerp(tones[2], THREE.MathUtils.smoothstep(reach, 0.83, 1) * 0.8);
      const vein = ray % 3 === 0;
      color.multiplyScalar(vein ? 0.78 : 1.12);
      let opacity = vein ? 0.87 : 0.66 - reach * 0.18;
      switch (species) {
        case 'guppy': {
          const spot = Math.sin(rayPosition * 34 + Math.sin(reach * 13)) * Math.cos(reach * 24 + rayPosition * 9);
          color.lerp(new THREE.Color('#183b80'), THREE.MathUtils.smoothstep(spot, 0.36, 0.85) * band * 0.88);
          break;
        }
        case 'blacktail': {
          if (part !== 'tail') break;
          const hook = Math.exp(-Math.pow((y + x * 0.6 - 0.012) / 0.034, 4));
          color.lerp(new THREE.Color('#09151d'), hook * 0.99);
          opacity = Math.max(opacity, hook * 0.96);
          break;
        }
        case 'tiger': {
          if (part !== 'dorsal') break;
          const black = 1 - THREE.MathUtils.smoothstep(reach, 0.65, 0.9);
          color.lerp(new THREE.Color('#172222'), black * 0.97);
          opacity = Math.max(opacity, black * 0.94);
          break;
        }
        case 'zebra': {
          if (part !== 'tail') break;
          const stripe = THREE.MathUtils.smoothstep(Math.cos(y * 96), 0, 0.65);
          color.lerp(new THREE.Color('#285a99'), stripe * 0.8);
          break;
        }
      }
      colors.push(color.r, color.g, color.b, opacity);
      if (ray === FIN_RAYS || step === FIN_STEPS) continue;
      const index = ray * (FIN_STEPS + 1) + step;
      indices.push(index, index + 1, index + FIN_STEPS + 1, index + 1, index + FIN_STEPS + 2, index + FIN_STEPS + 1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const material = new THREE.MeshPhysicalMaterial({
    color: '#ffffff', vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    roughness: 0.43, metalness: 0.08, clearcoat: 0.25,
  });
  const mesh = new THREE.Mesh(geometry, material);
  return { mesh, original: new Float32Array(positions), phase: outline.length * 0.7, flex };
}

function addEyes(group: THREE.Group, shape: FishShape): void {
  const rim = new THREE.MeshStandardMaterial({ color: '#e2d0a1', roughness: 0.3, metalness: 0.35 });
  const pupil = new THREE.MeshPhysicalMaterial({ color: '#081922', roughness: 0.1, clearcoat: 1 });
  const glint = new THREE.MeshBasicMaterial({ color: '#d3edeb' });
  const position = 0.85;
  const radius = bodyRadius(position);
  for (const side of [-1, 1]) {
    const eye = new THREE.Group();
    eye.position.set((position - 0.43) * shape.length, shape.height * radius * 0.23, side * shape.width * radius * 0.92);
    const iris = new THREE.Mesh(new THREE.SphereGeometry(0.018, 12, 8), rim);
    iris.scale.set(1, 1, 0.35);
    const center = new THREE.Mesh(new THREE.SphereGeometry(0.0125, 12, 8), pupil);
    center.position.z = side * 0.005;
    center.scale.z = 0.4;
    const highlight = new THREE.Mesh(new THREE.SphereGeometry(0.003, 6, 4), glint);
    highlight.position.set(0.004, 0.005, side * 0.011);
    eye.add(iris, center, highlight);
    group.add(eye);
  }
}

/** All models face +X. Scaling, navigation, and session identity belong to the aquarium. */
export function createFishModel(species: FishSpecies): { group: THREE.Group; animate(time: number, speed: number): void; dispose(): void } {
  const shape = SHAPES[species];
  const group = new THREE.Group();
  group.name = SPECIES[species].name;
  const body = createBody(species, shape);
  group.add(body);
  addEyes(group, shape);

  const tail = createFin(shape.tail, [0, 0], shape.fin, species, { part: 'tail', flex: species === 'betta' ? 0.045 : 0.025 });
  const tailPivot = new THREE.Group();
  tailPivot.position.x = -0.41 * shape.length;
  tailPivot.add(tail.mesh);
  group.add(tailPivot);
  const dorsal = createFin(shape.dorsal, [-0.09, shape.height * 0.67], shape.fin, species, { part: 'dorsal' });
  const anal = createFin(shape.anal, [-0.08, -shape.height * 0.65], shape.fin, species);
  group.add(dorsal.mesh, anal.mesh);
  const fins = [tail, dorsal, anal];
  const pectorals: THREE.Group[] = [];

  for (const side of [-1, 1]) {
    const pectoral = createFin([[0, 0], [-0.08, 0.035], [-0.17, -0.035], [-0.13, -0.085], [-0.03, -0.02]], [0, 0], shape.fin, species, { flex: 0.008 });
    const pivot = new THREE.Group();
    pivot.position.set(0.19 * shape.length, -shape.height * 0.27, side * shape.width * 0.8);
    pivot.rotation.x = side * 0.65;
    pivot.rotation.y = side * 0.45;
    pivot.add(pectoral.mesh);
    group.add(pivot);
    pectorals.push(pivot);
    fins.push(pectoral);
  }

  if (species === 'rainbow') {
    const frontDorsal = createFin([[0.26, 0.09], [0.19, 0.23], [0.1, 0.2], [0.08, 0.112]], [0.16, 0.09], shape.fin, species);
    group.add(frontDorsal.mesh);
    fins.push(frontDorsal);
  }

  if (species === 'betta') {
    for (const side of [-1, 1]) {
      const filament = createFin([[0.21, -0.07], [0.14, -0.18], [-0.01, -0.35], [0.075, -0.13]], [0.2, -0.08], shape.fin, species, { flex: 0.035 });
      filament.mesh.position.z = side * 0.022;
      group.add(filament.mesh);
      fins.push(filament);
    }
  }

  function animate(time: number, speed: number): void {
    const activity = THREE.MathUtils.clamp(speed, 0, 3);
    const beat = time * (5.4 + activity * 2.5);
    tailPivot.rotation.y = Math.sin(beat) * (0.16 + activity * 0.065);
    pectorals.forEach((fin, index) => { fin.rotation.y = (index === 0 ? -1 : 1) * (0.5 + Math.sin(beat * 0.8) * 0.22); });
    for (const fin of fins) {
      const positions = fin.mesh.geometry.getAttribute('position');
      for (let vertex = 0; vertex < positions.count; vertex++) {
        const reach = (vertex % (FIN_STEPS + 1)) / FIN_STEPS;
        const x = fin.original[vertex * 3];
        const y = fin.original[vertex * 3 + 1];
        positions.setZ(vertex, fin.original[vertex * 3 + 2] + Math.sin(beat - x * 6 + y * 3 + fin.phase) * reach * reach * fin.flex);
      }
      positions.needsUpdate = true;
    }
  }

  function dispose(): void {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    group.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      geometries.add(object.geometry);
      const usedMaterials = Array.isArray(object.material) ? object.material : [object.material];
      usedMaterials.forEach(material => materials.add(material));
    });
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
    group.clear();
  }

  return { group, animate, dispose };
}
