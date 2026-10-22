import { Bone, Object3D, SkinnedMesh } from 'three';

function contains(root: Object3D, object: Object3D) {
  for (let current: Object3D | null = object; current; current = current.parent) {
    if (current === root) return true;
  }
  return false;
}

export function attachVisitorHeadAccessories(model: Object3D): Bone | undefined {
  const head = model.getObjectByName('Head');
  if (!(head instanceof Bone)) return;
  model.updateMatrixWorld(true);
  const roots = new Set<Bone>();
  model.traverse(object => {
    if (!(object instanceof SkinnedMesh) || !/hair|cap|hat/i.test(object.name)) return;
    for (const bone of object.skeleton.bones) {
      let root = bone;
      while (root.parent instanceof Bone) root = root.parent;
      if (contains(root, head) || contains(head, root)) continue;
      roots.add(root);
    }
  });
  for (const root of roots) head.attach(root);
  model.updateMatrixWorld(true);
  return head;
}
