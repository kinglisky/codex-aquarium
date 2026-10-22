import * as THREE from 'three';

export const FISH_ARRIVAL_DURATION = 1.6;
export const FISH_DEPARTURE_DURATION = 1.8;

export function createFishPresence(now: number) {
  let active = true;
  let opacity = 0;
  let from = 0;
  let startedAt = now;
  let duration = FISH_ARRIVAL_DURATION;

  function advance(time: number) {
    const progress = Math.min(1, Math.max(0, (time - startedAt) / duration));
    const eased = progress * progress * (3 - 2 * progress);
    opacity = from + ((active ? 1 : 0) - from) * eased;
    return !active && progress === 1;
  }

  return {
    advance,
    setActive(value: boolean, time: number) {
      advance(time);
      if (value === active) return;
      active = value;
      from = opacity;
      startedAt = time;
      duration = Math.max(.001, (value ? 1 - opacity : opacity) * (value ? FISH_ARRIVAL_DURATION : FISH_DEPARTURE_DURATION));
    },
    get active() { return active; },
    get opacity() { return opacity; },
    get removeAt() { return active ? Infinity : startedAt + duration; },
  };
}

// 克隆实例材质，淡入淡出不能改动同种鱼共用的模板或透明鱼鳍。
export function createFishFade(group: THREE.Group) {
  const materials = new Map<THREE.Material, THREE.Material>();
  const meshes: Array<{ mesh: THREE.Mesh; original: THREE.Material | THREE.Material[] }> = [];
  let disposed = false;
  function clone(material: THREE.Material) {
    const existing = materials.get(material);
    if (existing) return existing;
    const copy = material.clone();
    materials.set(material, copy);
    return copy;
  }
  group.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    meshes.push({ mesh: object, original: object.material });
    object.material = Array.isArray(object.material) ? object.material.map(clone) : clone(object.material);
  });
  return {
    setOpacity(value: number) {
      if (disposed) return;
      const opacity = THREE.MathUtils.clamp(value, 0, 1);
      group.visible = opacity > 0;
      for (const [original, copy] of materials) {
        const alphaHash = original.alphaHash || opacity < 1;
        const transparent = original.transparent && opacity === 1;
        if (copy.alphaHash !== alphaHash || copy.transparent !== transparent) copy.needsUpdate = true;
        copy.opacity = original.opacity * opacity;
        copy.alphaHash = alphaHash;
        copy.transparent = transparent;
        copy.depthWrite = opacity < 1 || original.depthWrite;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const { mesh, original } of meshes) mesh.material = original;
      for (const copy of materials.values()) copy.dispose();
      materials.clear();
    },
  };
}
