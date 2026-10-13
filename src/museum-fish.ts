import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import type { FishSpecies } from './fish.ts';

export const MUSEUM_SPECIES: Record<FishSpecies, { name: string; color: string; description: string; model: string; length: number }> = {
  guppy: { name: '凤尾鱼', color: '#a7bbc5', description: '银色鱼身、深蓝背脊，细小的鱼鳍轻快地摆动。', model: 'anchovy', length: 1.3 },
  neon: { name: '真鲷', color: '#dd9297', description: '粉红的鳞片与半透明鱼鳍，在蓝色水光中闪烁。', model: 'red-snapper', length: 1.6 },
  betta: { name: '鲸鲨', color: '#7cacc6', description: '蓝灰色背部布满白色斑点，宽阔身躯安静巡游。', model: 'whale-shark', length: 2.8 },
  swordtail: { name: '翻车鱼', color: '#a3bac0', description: '扁高的银灰身形，上下长鳍像两片柔软的船帆。', model: 'ocean-sunfish', length: 1.7 },
  rainbow: { name: '皇带鱼', color: '#d78c96', description: '银白长身与红色背鳍，像一条舒展的丝带。', model: 'oarfish', length: 2.7 },
  golden: { name: '锦鲤', color: '#d9b291', description: '白底红斑沿着柔和的身体延伸，尾鳍轻轻摇曳。', model: 'koi', length: 1.7 },
  blacktail: { name: '大白鲨', color: '#91a4b0', description: '灰蓝背部与雪白腹侧，锋利轮廓下是从容的游姿。', model: 'great-white-shark', length: 2.5 },
  cardinal: { name: '金鱼', color: '#e5a45a', description: '橙红的鳞片与舒展的尾鳍，为展厅添上一抹暖色。', model: 'goldfish', length: 1.15 },
  tiger: { name: '管眼鱼', color: '#9ec789', description: '透明的头罩中藏着绿色管状眼睛，是深海里的奇妙来客。', model: 'barreleye', length: 1.35 },
  zebra: { name: '竹荚鱼', color: '#9bbec6', description: '银蓝鱼身与淡金色侧线，结伴穿过水光。', model: 'horse-mackerel', length: 1.4 },
};

export function normalizeFish(model: THREE.Group, length: number): THREE.Group {
  const content = new THREE.Group();
  const facing = new THREE.Group();
  facing.rotation.y = Math.PI / 2;
  facing.add(model);
  content.add(facing);
  content.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(content);
  const size = bounds.getSize(new THREE.Vector3());
  if (!Number.isFinite(size.x) || size.x <= 0) throw new Error('鱼模型没有有效的尺寸');
  facing.position.sub(bounds.getCenter(new THREE.Vector3()));
  content.scale.setScalar(length / size.x);
  model.traverse(object => { if (object instanceof THREE.SkinnedMesh) object.frustumCulled = false; });
  return content;
}

type SwimRig = {
  spine: string[];
  frequency: number;
  amplitude: number;
  fins?: string[];
  finAmplitude?: number;
};

// 原版模型没有动画片段，逐种绑定脊椎与鳍，避开下颌、眼睛等骨骼。
const SWIM_RIGS: Record<FishSpecies, SwimRig> = {
  guppy: { spine: ['joint2', 'joint3'], frequency: 6.2, amplitude: .26 },
  neon: { spine: ['joint2', 'joint3', 'joint4'], frequency: 4.8, amplitude: .25 },
  betta: { spine: ['a', 'b', 'c', 'd', 'e'], frequency: 2.6, amplitude: .15, fins: ['fin_l', 'fin_r'], finAmplitude: .1 },
  swordtail: { spine: ['a'], frequency: 3.2, amplitude: .02, fins: ['Fin', 'up_Fin', 'down_Fin'], finAmplitude: .3 },
  rainbow: { spine: ['joint2', 'joint6', 'joint10', 'joint13', 'joint14'], frequency: 3.1, amplitude: .22, fins: ['joint3', 'joint4', 'joint5', 'joint7', 'joint8', 'joint9', 'joint11', 'joint12'], finAmplitude: .06 },
  golden: { spine: ['joint2', 'joint4', 'joint5'], frequency: 4.2, amplitude: .28, fins: ['joint3'], finAmplitude: .1 },
  blacktail: { spine: ['a', 'b', 'c', 'd'], frequency: 3, amplitude: .18 },
  cardinal: { spine: ['a', 'b', 'c'], frequency: 5.3, amplitude: .34 },
  tiger: { spine: ['a', 'b'], frequency: 4.5, amplitude: .19, fins: ['Fin_a', 'Fin_b', 'Fin_c'], finAmplitude: .16 },
  zebra: { spine: ['joint2', 'joint3', 'joint4', 'joint5'], frequency: 5.8, amplitude: .28 },
};

// 覆盖 0.3–3 单位 / 秒、±1.8 弧度 / 秒与完整摆动周期；相对原点取双侧最大值，再留 8% 余量。
const SWIM_BOUNDS: Record<FishSpecies, readonly [number, number, number]> = {
  guppy: [1.41, .41, .71],
  neon: [1.73, .85, .73],
  betta: [3.03, .99, 1.21],
  swordtail: [1.84, 2.29, .81],
  rainbow: [2.92, .82, 1.22],
  golden: [1.84, .89, .82],
  blacktail: [2.71, 1.09, 1.18],
  cardinal: [1.43, .89, .99],
  tiger: [1.46, .97, 1.01],
  zebra: [1.52, .59, .83],
};

export function createMuseumFish(species: FishSpecies, template: THREE.Group) {
  const group = new THREE.Group();
  group.name = MUSEUM_SPECIES[species].name;
  const content = clone(template);
  group.add(content);
  group.updateMatrixWorld(true);
  const length = MUSEUM_SPECIES[species].length;
  const rig = SWIM_RIGS[species];
  const turn = new THREE.Quaternion();
  const skeletons = new Set<THREE.Skeleton>();
  content.traverse(object => {
    if (object instanceof THREE.SkinnedMesh) skeletons.add(object.skeleton);
  });
  function bind(name: string, axis: THREE.Vector3) {
    const bone = content.getObjectByName(name);
    if (!(bone instanceof THREE.Bone)) throw new Error(`鱼模型缺少游动骨骼：${name}`);
    return {
      bone, rest: bone.quaternion.clone(), position: bone.getWorldPosition(new THREE.Vector3()),
      axis: axis.applyQuaternion(bone.getWorldQuaternion(new THREE.Quaternion()).invert()),
    };
  }
  const spine = rig.spine.map(name => bind(name, new THREE.Vector3(0, 1, 0)));
  const head = spine[0].position.x;
  const span = Math.max(.01, head - spine.at(-1)!.position.x);
  const joints = spine.map(joint => ({ ...joint, progress: THREE.MathUtils.clamp((head - joint.position.x) / span, 0, 1) }));
  const fins = (rig.fins ?? []).map(name => bind(name, new THREE.Vector3(1, 0, 0)));
  let lastTime: number | undefined;
  let phase = 0;
  let bend = 0;
  return {
    group,
    size: new THREE.Vector3(...SWIM_BOUNDS[species]),
    // speed 为世界单位 / 秒，turnRate 为绕竖直轴的弧度 / 秒。
    animate(time: number, speed: number, turnRate = 0) {
      if (time === lastTime) return;
      const delta = lastTime === undefined ? 0 : THREE.MathUtils.clamp(time - lastTime, 0, .1);
      lastTime = time;
      const effort = THREE.MathUtils.clamp(speed / length, 0, 2);
      phase += delta * (rig.frequency + effort * 3.2);
      bend = THREE.MathUtils.damp(bend, THREE.MathUtils.clamp(turnRate, -1.8, 1.8), 6, delta);
      for (const { bone, rest, axis, progress } of joints) {
        const wave = Math.sin(phase - progress * 3.2) * rig.amplitude * (.04 + progress * progress * .96) * (.7 + effort * .3);
        const angle = wave - bend * progress * .1;
        bone.quaternion.copy(rest).multiply(turn.setFromAxisAngle(axis, angle));
      }
      for (const { bone, rest, axis, position } of fins) {
        const offset = (.5 - position.x / length) * 3.2 + (position.y < 0 ? Math.PI : 0);
        const mirror = position.z > .01 ? -1 : 1;
        const angle = Math.sin(phase * 1.25 - offset) * (rig.finAmplitude ?? .1) * mirror;
        bone.quaternion.copy(rest).multiply(turn.setFromAxisAngle(axis, angle));
      }
    },
    dispose() {
      skeletons.forEach(skeleton => skeleton.dispose());
      group.clear();
    },
  };
}
