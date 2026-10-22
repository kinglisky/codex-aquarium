import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import catalog from './fish-catalog.json' with { type: 'json' };
import swimBounds from './fish-bounds.json' with { type: 'json' };

export const MUSEUM_SPECIES = catalog;
export type MuseumFishSpecies = keyof typeof catalog;

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

// 骨骼名称来自原版 BFRES；仅驱动脊椎和鳍，保留下颌、眼睛等原始姿态。
const FIN_AMPLITUDE: Record<string, number> = { ray: .28, turtle: .2, frog: .22, crab: .14, squid: .18, seahorse: .2 };

export function createMuseumFish(species: MuseumFishSpecies, template: THREE.Group) {
  const group = new THREE.Group();
  group.name = MUSEUM_SPECIES[species].name;
  const content = clone(template);
  group.add(content);
  group.updateMatrixWorld(true);
  const length = MUSEUM_SPECIES[species].length;
  const rig = MUSEUM_SPECIES[species];
  const finAmplitude = species === 'ocean-sunfish' ? .3 : FIN_AMPLITUDE[rig.profile] ?? .1;
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
  const span = head - spine.at(-1)!.position.x;
  const joints = spine.map((joint, index) => ({
    ...joint,
    progress: span > length * .02 ? THREE.MathUtils.clamp((head - joint.position.x) / span, 0, 1) : index / Math.max(1, spine.length - 1),
  }));
  const fins = (rig.fins ?? []).map(name => bind(name, new THREE.Vector3(1, 0, 0)));
  let lastTime: number | undefined;
  let phase = 0;
  let bend = 0;
  return {
    group,
    size: new THREE.Vector3().fromArray(swimBounds[species]),
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
        const angle = Math.sin(phase * 1.25 - offset) * finAmplitude * mirror;
        bone.quaternion.copy(rest).multiply(turn.setFromAxisAngle(axis, angle));
      }
    },
    dispose() {
      skeletons.forEach(skeleton => skeleton.dispose());
      group.clear();
    },
  };
}
