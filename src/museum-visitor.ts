import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

export function createMuseumVisitor(template: THREE.Group) {
  const group = new THREE.Group();
  group.name = 'The aquarium visitor';
  const model = clone(template);
  model.rotation.y = Math.PI;
  group.add(model);
  group.updateMatrixWorld(true);
  const joints: { bone: THREE.Bone; rest: THREE.Quaternion; axis: THREE.Vector3; strength: number; head: boolean; angle: number }[] = [];
  const skeletons = new Set<THREE.Skeleton>();
  const rotation = new THREE.Quaternion();
  model.traverse(object => {
    if (object instanceof THREE.SkinnedMesh) skeletons.add(object.skeleton);
    if (!(object instanceof THREE.Bone)) return;
    const match = /^(Head|Leg_1_[LR]|Arm_1_[LR])(?:_\d+)?$/.exec(object.name);
    if (!match) return;
    const head = match[1] === 'Head';
    if (head && object.name !== 'Head') return;
    const side = match[1].endsWith('_L') ? 1 : -1;
    const strength = match[1].startsWith('Leg') ? .3 : -.2;
    const axis = (head ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0))
      .applyQuaternion(object.getWorldQuaternion(new THREE.Quaternion()).invert());
    joints.push({ bone: object, rest: object.quaternion.clone(), axis, strength: strength * side, head, angle: 0 });
  });
  return {
    group,
    look(time: number) {
      for (const joint of joints) {
        if (!joint.head) continue;
        joint.bone.quaternion.copy(joint.rest).multiply(rotation.setFromAxisAngle(joint.axis, Math.sin(time * .23) * .035));
      }
    },
    walk(step: number, delta: number) {
      for (const joint of joints) {
        if (joint.head) continue;
        joint.angle = THREE.MathUtils.damp(joint.angle, step * joint.strength, 16, delta);
        joint.bone.quaternion.copy(joint.rest).multiply(rotation.setFromAxisAngle(joint.axis, joint.angle));
      }
    },
    dispose() {
      skeletons.forEach(skeleton => skeleton.dispose());
      group.clear();
    },
  };
}
