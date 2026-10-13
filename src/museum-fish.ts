import * as THREE from 'three';
import type { FishSpecies } from './fish.ts';

export const MUSEUM_SPECIES: Record<FishSpecies, { name: string; color: string; description: string }> = {
  guppy: { name: '鬼头刀', color: '#81bd74', description: '翡翠色背脊与金色腹侧，长长的背鳍像一面海上的旗。' },
  neon: { name: '蓝鳍金枪鱼', color: '#6f9cc9', description: '深蓝的流线身躯与银白腹部，镰形尾鳍有力摆动。' },
  betta: { name: '鹰鳐', color: '#91a7b7', description: '宽大的胸鳍缓缓起伏，仿佛在深海中飞翔。' },
  swordtail: { name: '翻车鱼', color: '#a3bac0', description: '扁平的银灰身形，背鳍与腹鳍像两片柔软的船帆。' },
  rainbow: { name: '旗鱼', color: '#688ed0', description: '细长的剑吻与高高的蓝色帆鳍，在光中划出优雅的弧线。' },
  golden: { name: '双髻鲨', color: '#91a8ad', description: '宽阔的锤形头部与修长身姿，安静巡游在展厅深处。' },
  blacktail: { name: '大白鲨', color: '#91a4b0', description: '灰蓝的背、雪白的腹，锋利轮廓下是从容的游姿。' },
  cardinal: { name: '蓝倒吊', color: '#4984e6', description: '宝蓝身体配上柠檬黄的尾鳍，像一枚游动的海洋宝石。' },
  tiger: { name: '狮子鱼', color: '#d6a690', description: '奶油色与赭红色相间，放射状的长鳍轻轻舒展。' },
  zebra: { name: '竹荚鱼', color: '#9bbec6', description: '银蓝的纤细身体与淡金色侧线，结伴穿过水光。' },
};

type Point = readonly [number, number];
type Section = readonly [number, number, number, number];
type Palette = readonly [string, string, string];
type Shape = {
  length: number; height: number; width: number; colors: Palette; fin: string;
  sections: readonly Section[]; dorsal: readonly Point[]; tail: readonly Point[];
};
const SPINDLE: readonly Section[] = [
  [-0.5, 0.1, 0.12, 0], [-0.33, 0.5, 0.52, 0], [-0.1, 0.94, 0.95, 0],
  [0.14, 1, 1, 0], [0.32, 0.7, 0.68, 0], [0.48, 0.15, 0.2, -0.04], [0.5, 0.02, 0.02, -0.04],
];
const FORK: readonly Point[] = [[0.025, 0.055], [-0.39, 0.43], [-0.25, 0.055], [-0.29, -0.035], [-0.4, -0.4], [0.025, -0.055]];
const SHARK_TAIL: readonly Point[] = [[0.025, 0.045], [-0.38, 0.5], [-0.29, 0.21], [-0.19, 0.015], [-0.32, -0.29], [-0.1, -0.14], [0.025, -0.045]];
const DORSAL: readonly Point[] = [[0.2, 0], [-0.06, 0.35], [-0.26, 0.015], [-0.34, 0]];
const SHAPES: Record<FishSpecies, Shape> = {
  guppy: { length: 1.85, height: 0.23, width: 0.12, colors: ['#21677b', '#8abf67', '#eadb89'], fin: '#487f88', sections: [[-0.5, 0.12, 0.15, 0], [-0.3, 0.6, 0.6, 0.02], [0, 0.98, 1, 0.06], [0.29, 1, 0.88, 0.08], [0.43, 0.75, 0.5, 0.04], [0.5, 0.08, 0.06, -0.03]], dorsal: [[0.64, 0], [0.5, 0.26], [0.2, 0.24], [-0.3, 0.22], [-0.8, 0.025]], tail: FORK },
  neon: { length: 1.9, height: 0.27, width: 0.18, colors: ['#294864', '#7c9eac', '#e1e4d8'], fin: '#597d9e', sections: SPINDLE, dorsal: [[0.37, 0], [0.16, 0.33], [-0.12, 0]], tail: FORK },
  betta: { length: 1.35, height: 0.105, width: 0.26, colors: ['#5e7a8c', '#809bab', '#d0d6cf'], fin: '#8196a0', sections: SPINDLE, dorsal: [], tail: [] },
  swordtail: { length: 1.08, height: 0.52, width: 0.12, colors: ['#6d909e', '#acc0bc', '#d2d5bb'], fin: '#7694a3', sections: [[-0.5, 0.72, 0.3, 0], [-0.3, 0.97, 0.85, 0], [0, 1, 1, 0], [0.29, 0.78, 0.85, 0], [0.45, 0.43, 0.55, -0.08], [0.5, 0.17, 0.25, -0.12]], dorsal: [[0.03, 0], [-0.07, 0.68], [-0.24, 0.81], [-0.34, 0.53], [-0.37, -0.04]], tail: [[0.01, 0.38], [-0.16, 0.3], [-0.17, 0.12], [-0.21, 0], [-0.17, -0.16], [-0.14, -0.31], [0.01, -0.39]] },
  rainbow: { length: 1.8, height: 0.17, width: 0.1, colors: ['#294b7c', '#6c9dbc', '#d9ddd0'], fin: '#396ba1', sections: SPINDLE, dorsal: [[0.57, -0.025], [0.4, 0.55], [0.15, 0.64], [-0.05, 0.5], [-0.31, 0.42], [-0.67, 0.03]], tail: FORK },
  golden: { length: 1.95, height: 0.19, width: 0.13, colors: ['#637c85', '#9aafb0', '#d6d9ce'], fin: '#78929a', sections: SPINDLE, dorsal: [[0.2, 0], [-0.02, 0.47], [-0.25, 0]], tail: SHARK_TAIL },
  blacktail: { length: 2.08, height: 0.29, width: 0.2, colors: ['#576f82', '#9bafb4', '#e2e5d8'], fin: '#788e9a', sections: SPINDLE, dorsal: [[0.28, -0.015], [0.02, 0.43], [-0.27, 0.015]], tail: SHARK_TAIL },
  cardinal: { length: 1.02, height: 0.29, width: 0.085, colors: ['#2853aa', '#347cd5', '#658ccc'], fin: '#497bd2', sections: [[-0.5, 0.15, 0.16, 0], [-0.32, 0.7, 0.7, 0], [-0.06, 1, 1, 0], [0.19, 0.94, 1, 0], [0.39, 0.52, 0.75, -0.02], [0.5, 0.08, 0.05, -0.03]], dorsal: [[0.31, -0.01], [0.12, 0.12], [-0.18, 0.16], [-0.4, 0.03]], tail: [[0.03, 0.03], [-0.25, 0.24], [-0.2, 0], [-0.25, -0.24], [0.03, -0.03]] },
  tiger: { length: 1.02, height: 0.22, width: 0.13, colors: ['#8c655b', '#b18a79', '#d8c7a4'], fin: '#bd947d', sections: SPINDLE, dorsal: [], tail: [[0.02, 0.035], [-0.3, 0.19], [-0.36, 0.12], [-0.37, 0], [-0.33, -0.16], [-0.22, -0.2], [0.02, -0.035]] },
  zebra: { length: 1.35, height: 0.16, width: 0.095, colors: ['#466c81', '#9ab8bd', '#d9dfcf'], fin: '#9cbdc3', sections: SPINDLE, dorsal: DORSAL, tail: FORK.map(([x, y]) => [x * 0.78, y * 0.65]) },
};

function sectionAt(shape: Shape, x: number): [number, number, number] {
  const index = Math.max(0, shape.sections.findIndex(section => section[0] >= x) - 1);
  const a = shape.sections[index];
  const b = shape.sections[Math.min(index + 1, shape.sections.length - 1)];
  const previous = shape.sections[Math.max(index - 1, 0)];
  const next = shape.sections[Math.min(index + 2, shape.sections.length - 1)];
  const t = THREE.MathUtils.clamp((x - a[0]) / Math.max(0.001, b[0] - a[0]), 0, 1);
  const cubic = (field: 1 | 2 | 3) => 0.5 * ((2 * a[field]) + (-previous[field] + b[field]) * t
    + (2 * previous[field] - 5 * a[field] + 4 * b[field] - next[field]) * t * t
    + (-previous[field] + 3 * a[field] - 3 * b[field] + next[field]) * t * t * t);
  return [Math.max(0.015, cubic(1)), Math.max(0.015, cubic(2)), cubic(3)];
}

function skinColor(species: FishSpecies, palette: THREE.Color[], x: number, angle: number): THREE.Color {
  const vertical = Math.sin(angle);
  const color = vertical > 0
    ? palette[1].clone().lerp(palette[0], vertical ** 1.3)
    : palette[1].clone().lerp(palette[2], (-vertical) ** 0.7);
  switch (species) {
    case 'cardinal': {
      const patch = Math.exp(-(((x + 0.03) / 0.31) ** 2) - ((vertical - 0.3) / 0.45) ** 2);
      return color.lerp(new THREE.Color('#172f68'), patch * 0.88);
    }
    case 'tiger': return color.lerp(new THREE.Color('#eee0bb'), (Math.sin(x * 72 + vertical * 2.5) * 0.5 + 0.5) ** 5 * 0.85);
    case 'rainbow': return color.multiplyScalar(0.94 + Math.sin(x * 62) * 0.06 * Math.max(0, vertical));
    case 'zebra': return color.lerp(new THREE.Color('#d8c78c'), Math.exp(-((vertical / 0.2) ** 2)) * 0.55);
    case 'swordtail': return color.multiplyScalar(0.94 + Math.sin(x * 127 + angle * 19) * Math.sin(angle * 37) * 0.06);
    default: return color;
  }
}

function bodyGeometry(species: FishSpecies, shape: Shape): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const palette = shape.colors.map(color => new THREE.Color(color));
  const rings = 40;
  const sides = 20;
  for (let ring = 0; ring <= rings; ring++) {
    const x = ring / rings - 0.5;
    const [height, width, center] = sectionAt(shape, x);
    for (let side = 0; side <= sides; side++) {
      const angle = side / sides * Math.PI * 2;
      positions.push(x * shape.length, (Math.sin(angle) * height + center) * shape.height, Math.cos(angle) * width * shape.width);
      colors.push(...skinColor(species, palette, x, angle).toArray());
      if (ring === rings || side === sides) continue;
      const a = ring * (sides + 1) + side;
      const b = a + sides + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function finMesh(points: readonly Point[], color: string): THREE.Mesh<THREE.ShapeGeometry, THREE.MeshStandardMaterial> {
  const outline = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const geometry = new THREE.ShapeGeometry(outline);
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.56, metalness: 0.08, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'fin';
  return mesh;
}

function lineMesh(points: THREE.Vector3[], color: string, radius = 0.003): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(points);
  return new THREE.Mesh(new THREE.TubeGeometry(curve, 10, radius, 4, false), new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));
}

function addEye(group: THREE.Group, x: number, y: number, z: number, side: number, size: number): void {
  const iris = new THREE.Mesh(new THREE.SphereGeometry(size, 12, 8), new THREE.MeshStandardMaterial({ color: '#c6c6a7', roughness: 0.38 }));
  iris.position.set(x, y, z);
  const pupil = new THREE.Mesh(new THREE.SphereGeometry(size * 0.7, 12, 8), new THREE.MeshStandardMaterial({ color: '#101d28', roughness: 0.22 }));
  pupil.position.set(x + size * 0.12, y, z + side * size * 0.53);
  group.add(iris, pupil);
}

function rayWings(group: THREE.Group): { mesh: THREE.Mesh; original: Float32Array }[] {
  return [-1, 1].map(side => {
    const outline = [[0.52, 0.12], [0.34, 0.43], [0.09, 0.77], [-0.18, 1], [-0.43, 0.72], [-0.6, 0.25], [-0.55, 0.11]];
    const curve = new THREE.CatmullRomCurve3(outline.map(([x, z]) => new THREE.Vector3(x, z, 0)), true, 'catmullrom', 0.25);
    const mesh = finMesh(curve.getPoints(36).map(point => [point.x, point.y]), '#7994a5');
    const positions = mesh.geometry.getAttribute('position');
    for (let vertex = 0; vertex < positions.count; vertex++) {
      const span = positions.getY(vertex);
      positions.setXYZ(vertex, positions.getX(vertex), 0.055 * span * span, span * side);
    }
    mesh.geometry.computeVertexNormals();
    mesh.name = 'ray-wing';
    group.add(mesh);
    return { mesh, original: new Float32Array(positions.array) };
  });
}

export function createMuseumFish(species: FishSpecies): { group: THREE.Group; animate(time: number, speed: number): void; dispose(): void } {
  const shape = SHAPES[species];
  const group = new THREE.Group();
  group.name = MUSEUM_SPECIES[species].name;
  const body = new THREE.Mesh(bodyGeometry(species, shape), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.48, metalness: 0.13 }));
  body.name = 'body';
  const original = new Float32Array(body.geometry.getAttribute('position').array);
  group.add(body);
  const tailPivot = new THREE.Group();
  tailPivot.name = 'tail';
  tailPivot.position.x = -shape.length * 0.48;
  group.add(tailPivot);
  const pectorals: THREE.Group[] = [];
  const softFins: { mesh: THREE.Mesh; original: Float32Array }[] = [];
  const wings = species === 'betta' ? rayWings(group) : [];
  const addFin = (points: readonly Point[], x: number, y: number, color = shape.fin): THREE.Mesh => {
    const mesh = finMesh(points, color);
    mesh.position.set(x, y, 0);
    group.add(mesh);
    softFins.push({ mesh, original: new Float32Array(mesh.geometry.getAttribute('position').array) });
    return mesh;
  };
  if (shape.tail.length) tailPivot.add(finMesh(shape.tail, species === 'cardinal' ? '#e3c950' : shape.fin));
  if (shape.dorsal.length) addFin(shape.dorsal, 0, shape.height * 0.78);
  for (const side of [-1, 1]) {
    const eyeX = species === 'golden' ? shape.length * 0.4 : shape.length * 0.33;
    const [height, width, center] = sectionAt(shape, eyeX / shape.length);
    const eyeY = shape.height * (center + height * 0.27) + (species === 'betta' ? 0.07 : 0);
    const eyeZ = species === 'golden' ? 0.38 : shape.width * width * 0.96;
    addEye(group, eyeX, eyeY, side * eyeZ, side, species === 'swordtail' ? 0.026 : shape.length * 0.014);
    if (species === 'betta') continue;
    const pivot = new THREE.Group();
    pivot.position.set(shape.length * 0.19, -shape.height * 0.28, side * shape.width * 0.75);
    pivot.rotation.set(side * 0.95, side * 0.15, 0);
    pivot.add(finMesh([[0.08, 0], [-0.31, -0.31], [-0.2, -0.055]], shape.fin));
    group.add(pivot);
    pectorals.push(pivot);
  }
  switch (species) {
    case 'betta': {
      const tail = lineMesh([new THREE.Vector3(0, 0, 0), new THREE.Vector3(-0.45, -0.025, 0), new THREE.Vector3(-1.15, 0.01, 0)], '#607986', 0.015);
      tailPivot.add(tail);
      for (const side of [-1, 1]) {
        addFin([[0.16, 0], [0.02, 0.12], [-0.13, 0]], -0.36, 0.075).position.z = side * 0.05;
      }
      break;
    }
    case 'swordtail':
      addFin(shape.dorsal.map(([x, y]) => [x, -y * 0.82]), 0, -shape.height * 0.75);
      break;
    case 'rainbow': {
      const bill = new THREE.Mesh(new THREE.ConeGeometry(0.024, 0.49, 8), new THREE.MeshStandardMaterial({ color: '#7798aa', roughness: 0.48 }));
      bill.rotation.z = -Math.PI / 2;
      bill.position.set(shape.length * 0.5 + 0.2, -0.012, 0);
      group.add(bill);
      addFin([[0.04, 0], [-0.24, -0.17], [-0.37, -0.02]], -0.1, -shape.height * 0.75);
      break;
    }
    case 'golden': {
      const head = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), new THREE.MeshStandardMaterial({ color: '#91a7ac', roughness: 0.54, metalness: 0.08 }));
      head.scale.set(0.17, 0.085, 0.43);
      head.position.set(shape.length * 0.4, 0.015, 0);
      group.add(head);
      break;
    }
    case 'cardinal':
      addFin(shape.dorsal.map(([x, y]) => [x, -y * 0.73]), -0.02, -shape.height * 0.82);
      break;
    case 'tiger': {
      for (let spine = 0; spine < 8; spine++) {
        const x = 0.3 - spine * 0.09;
        const reach = 0.36 + Math.sin(spine / 7 * Math.PI) * 0.23;
        addFin([[0.025, 0], [-0.08, reach], [-0.11, 0]], x, shape.height * 0.78, spine % 2 ? '#c6af94' : '#a07465');
      }
      for (const side of [-1, 1]) {
        const fan = addFin([[0.05, 0], [-0.22, -0.35], [-0.34, -0.57], [-0.48, -0.5], [-0.56, -0.26], [-0.35, -0.04]], 0.18, -0.04, '#c5a68a');
        fan.rotation.x = side * 1.05;
        fan.position.z = side * shape.width * 0.72;
        for (let ray = 0; ray < 6; ray++) {
          const angle = 0.45 + ray * 0.2;
          const tip = new THREE.Vector3(0.1 - Math.sin(angle) * 0.52, -Math.cos(angle) * 0.34, side * Math.cos(angle) * 0.62);
          group.add(lineMesh([new THREE.Vector3(0.2, -0.03, side * 0.11), tip], '#8b6458', 0.005));
        }
      }
      break;
    }
    case 'neon':
    case 'zebra':
      for (let finlet = 0; finlet < 5; finlet++) {
        const x = -0.3 - finlet * 0.11;
        const [height] = sectionAt(shape, x / shape.length);
        for (const side of [-1, 1]) addFin([[0.04, 0], [-0.045, side * 0.075], [-0.08, 0]], x, side * height * shape.height, '#c6bb74');
      }
      break;
    default: break;
  }
  if (species === 'blacktail' || species === 'golden') {
    for (const side of [-1, 1]) {
      for (let gill = 0; gill < 5; gill++) {
        const x = shape.length * (0.16 + gill * 0.026);
        const [height, width] = sectionAt(shape, x / shape.length);
        group.add(lineMesh([
          new THREE.Vector3(x, height * shape.height * 0.22, side * width * shape.width * 0.98),
          new THREE.Vector3(x - 0.025, -height * shape.height * 0.18, side * width * shape.width),
        ], '#5d737b', 0.003));
      }
      group.add(lineMesh([
        new THREE.Vector3(shape.length * 0.46, -shape.height * 0.12, side * shape.width * 0.25),
        new THREE.Vector3(shape.length * 0.38, -shape.height * 0.24, side * shape.width * 0.53),
        new THREE.Vector3(shape.length * 0.31, -shape.height * 0.26, side * shape.width * 0.73),
      ], '#61757b', 0.003));
    }
    addFin([[0.08, 0], [-0.08, 0.1], [-0.15, 0]], -shape.length * 0.32, shape.height * 0.37);
    addFin([[0.07, 0], [-0.11, -0.1], [-0.19, 0]], -shape.length * 0.29, -shape.height * 0.42);
  }

  let lastTime: number | null = null;
  let beat = 0;
  let wingBeat = 0;
  function animate(time: number, speed: number): void {
    if (time === lastTime) return;
    const delta = lastTime === null ? 0 : Math.max(0, time - lastTime);
    lastTime = time;
    const activity = THREE.MathUtils.clamp(speed, 0, 3);
    beat += delta * (2.6 + activity * 3.2);
    wingBeat += delta * (1.7 + activity * 0.5);
    const strength = species === 'betta' ? 0.014 : 0.025 + activity * 0.01;
    const flex = (x: number) => Math.sin(beat - x * 2.2) * Math.max(0, 0.28 - x / shape.length) ** 2 * strength;
    const positions = body.geometry.getAttribute('position');
    for (let vertex = 0; vertex < positions.count; vertex++) positions.setZ(vertex, original[vertex * 3 + 2] + flex(original[vertex * 3]));
    positions.needsUpdate = true;
    tailPivot.position.z = flex(tailPivot.position.x);
    tailPivot.rotation.y = Math.sin(beat + 1.8) * (species === 'betta' ? 0.08 : 0.17 + activity * 0.035);
    pectorals.forEach((fin, index) => { fin.rotation.x = (index === 0 ? -1 : 1) * (0.95 + Math.sin(beat * 0.6) * 0.11); });
    for (const fin of softFins) {
      const vertices = fin.mesh.geometry.getAttribute('position');
      for (let vertex = 0; vertex < vertices.count; vertex++) {
        const x = fin.original[vertex * 3];
        const y = fin.original[vertex * 3 + 1];
        vertices.setZ(vertex, fin.original[vertex * 3 + 2] + Math.sin(beat * 0.8 - x * 3 + y * 2) * Math.abs(y) * 0.075);
      }
      vertices.needsUpdate = true;
    }
    for (const wing of wings) {
      const vertices = wing.mesh.geometry.getAttribute('position');
      for (let vertex = 0; vertex < vertices.count; vertex++) {
        const span = Math.abs(wing.original[vertex * 3 + 2]);
        vertices.setY(vertex, wing.original[vertex * 3 + 1] + Math.sin(wingBeat - span * 1.5) * span ** 1.7 * 0.2);
      }
      vertices.needsUpdate = true;
    }
  }

  function dispose(): void {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    group.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
    });
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
    group.clear();
  }

  return { group, animate, dispose };
}
