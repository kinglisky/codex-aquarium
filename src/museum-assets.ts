import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { FishSpecies } from './fish.ts';
import { MUSEUM_SPECIES, normalizeFish } from './museum-fish';

function disposeModels(models: THREE.Group[]) {
  const resources = new Set<{ dispose(): void }>();
  for (const model of models) model.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    resources.add(object.geometry);
    if (object instanceof THREE.SkinnedMesh) resources.add(object.skeleton);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      resources.add(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) resources.add(value);
    }
  });
  resources.forEach(resource => resource.dispose());
}

export async function loadMuseumAssets() {
  const loader = new GLTFLoader();
  const species = Object.keys(MUSEUM_SPECIES) as FishSpecies[];
  const paths = [...species.map(id => `fish/${MUSEUM_SPECIES[id].model}`), 'character'];
  const results = await Promise.allSettled(paths.map(async path => (await loader.loadAsync(`/models/acnh/${path}.glb`)).scene));
  const models = results.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
  const failure = results.find(result => result.status === 'rejected');
  if (failure?.status === 'rejected') {
    disposeModels(models);
    throw new Error('展厅模型加载失败，请刷新页面重试。', { cause: failure.reason });
  }
  const fish = Object.fromEntries(species.map((id, index) => [id, normalizeFish(models[index], MUSEUM_SPECIES[id].length)])) as Record<FishSpecies, THREE.Group>;
  return { fish, visitor: models[species.length], dispose() { disposeModels(models); } };
}
