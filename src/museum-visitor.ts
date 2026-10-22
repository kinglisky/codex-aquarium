import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { attachVisitorHeadAccessories } from './visitor-head-attachments.ts';

const JOINT_KINDS = {
  Head: 'head', Leg_1: 'leg', Leg_2: 'knee', Arm_1: 'arm', Arm_2: 'forearm', Wrist: 'wrist', Spine_2: 'spine',
} as const;

function gestureAt(time: number) {
  const phase = time % 23;
  return THREE.MathUtils.smoothstep(phase, 7, 8.8) * (1 - THREE.MathUtils.smoothstep(phase, 10.5, 12.8));
}

export function createMuseumVisitor(template: THREE.Group) {
  const group = new THREE.Group();
  group.name = 'The aquarium visitor';
  const model = clone(template);
  model.rotation.y = Math.PI;
  group.add(model);
  group.updateMatrixWorld(true);
  const head = attachVisitorHeadAccessories(model);
  model.traverse(object => {
    if (!(object instanceof THREE.Bone) || !/^Arm_1_[LR](?:_\d+)?$/.test(object.name)) return;
    const wrist = model.getObjectByName(object.name.replace('Arm_1_', 'Wrist_'));
    if (!(wrist instanceof THREE.Bone)) return;
    const shoulder = object.getWorldPosition(new THREE.Vector3());
    const direction = wrist.getWorldPosition(new THREE.Vector3()).sub(shoulder).normalize();
    if (direction.y < -.7) return;
    const relaxed = new THREE.Vector3(Math.sign(shoulder.x) * .28, -.96, .02).normalize();
    const rotation = new THREE.Quaternion().setFromUnitVectors(direction, relaxed).multiply(object.getWorldQuaternion(new THREE.Quaternion()));
    const parent = object.parent?.getWorldQuaternion(new THREE.Quaternion()) ?? new THREE.Quaternion();
    object.quaternion.copy(parent.invert().multiply(rotation));
    model.updateMatrixWorld(true);
  });
  const joints: {
    bone: THREE.Bone; rest: THREE.Quaternion; axes: THREE.Vector3[];
    kind: typeof JOINT_KINDS[keyof typeof JOINT_KINDS]; side: number; angles: THREE.Vector3;
  }[] = [];
  const skeletons = new Set<THREE.Skeleton>();
  const rotation = new THREE.Quaternion();
  const target = new THREE.Vector3();
  let idle = 1;
  let running = 0;
  model.traverse(object => {
    if (object instanceof THREE.SkinnedMesh) skeletons.add(object.skeleton);
    if (!(object instanceof THREE.Bone)) return;
    const match = /^(Head|Leg_1|Leg_2|Arm_1|Arm_2|Wrist|Spine_2)(?:_([LR]))?(?:_\d+)?$/.exec(object.name);
    if (!match) return;
    const kind = JOINT_KINDS[match[1] as keyof typeof JOINT_KINDS];
    if (kind === 'head' && object !== head) return;
    const inverse = object.getWorldQuaternion(new THREE.Quaternion()).invert();
    const axes = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)]
      .map(axis => axis.applyQuaternion(inverse));
    joints.push({ bone: object, rest: object.quaternion.clone(), axes, kind, side: match[2] === 'L' ? 1 : -1, angles: new THREE.Vector3() });
  });
  return {
    group,
    animate(time: number, step: number, delta: number, walking = false, speed = walking ? 2.4 : 0) {
      idle = THREE.MathUtils.damp(idle, walking ? 0 : 1, 5, delta);
      running = THREE.MathUtils.damp(running, THREE.MathUtils.clamp(speed / 4, 0, 1), 10, delta);
      const breath = Math.sin(time * 1.65) * idle;
      group.scale.set(1, 1 + breath * .0025, 1 + breath * .002);
      group.rotation.x = -running * .035;
      for (const joint of joints) {
        const { kind, side } = joint;
        const gesture = gestureAt(time + (side > 0 ? 0 : 10)) * idle;
        const sway = Math.sin(time * .7 + side * 1.3) * idle;
        switch (kind) {
          case 'head': target.set((Math.sin(time * .31) * .025 - gesture * .035) * idle, Math.sin(time * .23) * .07 * idle, 0); break;
          case 'spine': target.set(breath * .007 - running * .055, Math.sin(time * .29) * .008 * idle, Math.sin(time * .43) * .012 * idle + step * running * .012); break;
          case 'leg': target.set(step * (.28 + running * .07) * side, 0, 0); break;
          case 'knee': target.set(-Math.max(0, -step * side) * running * .22, 0, 0); break;
          case 'arm': target.set(-step * (.2 + running * .12) * side + sway * .045 + gesture * .38, 0, side * (Math.sin(time * .53) * .025 * idle + gesture * .15)); break;
          case 'forearm': target.set(sway * .025 + gesture * .22 + running * .2, 0, 0); break;
          case 'wrist': target.set(sway * .035, Math.sin(time * .9 + side) * .04 * idle, side * gesture * Math.sin(time * 2.3) * .08); break;
        }
        joint.angles.set(
          THREE.MathUtils.damp(joint.angles.x, target.x, 12, delta),
          THREE.MathUtils.damp(joint.angles.y, target.y, 12, delta),
          THREE.MathUtils.damp(joint.angles.z, target.z, 12, delta),
        );
        joint.bone.quaternion.copy(joint.rest);
        joint.bone.quaternion.multiply(rotation.setFromAxisAngle(joint.axes[0], joint.angles.x));
        joint.bone.quaternion.multiply(rotation.setFromAxisAngle(joint.axes[1], joint.angles.y));
        joint.bone.quaternion.multiply(rotation.setFromAxisAngle(joint.axes[2], joint.angles.z));
      }
    },
    dispose() {
      skeletons.forEach(skeleton => skeleton.dispose());
      group.clear();
    },
  };
}
