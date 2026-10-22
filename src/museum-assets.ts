import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { MuseumFishSpecies } from './museum-fish.ts';
import { SCENERY_MODELS } from './museum-scenery.ts';
import { MUSEUM_SPECIES, normalizeFish } from './museum-fish.ts';
import { COMPANION_MODELS, DEFAULT_APPEARANCE, PLAYER_MODELS } from './museum-characters.ts';
import type { MuseumAppearance } from './museum-characters.ts';

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

export async function loadMuseumAssets(appearance: MuseumAppearance = DEFAULT_APPEARANCE) {
  const loader = new GLTFLoader();
  const characterPaths: string[] = [PLAYER_MODELS[appearance.player].model];
  if (appearance.companion !== 'none') characterPaths.push(COMPANION_MODELS[appearance.companion].model);
  const sceneryPaths = Object.values(SCENERY_MODELS);
  const paths = [...characterPaths, ...sceneryPaths];
  const results = await Promise.allSettled(paths.map(async path => (await loader.loadAsync(`/models/acnh/${path}.glb`)).scene));
  const models = results.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
  const failure = results.find(result => result.status === 'rejected');
  if (failure?.status === 'rejected') {
    disposeModels(models);
    throw new Error('展厅模型加载失败，请刷新页面重试。', { cause: failure.reason });
  }
  const fish: Partial<Record<MuseumFishSpecies, THREE.Group>> = {};
  const fishLoads = new Map<MuseumFishSpecies, Promise<THREE.Group>>();
  const characters = new Map(characterPaths.map((path, index) => [path, Promise.resolve(models[index])]));
  const scenery = new Map(sceneryPaths.map((path, index) => [path, models[characterPaths.length + index]]));
  const ownedModels = new Set(models);
  let disposed = false;
  async function loadModel(path: string) {
    if (disposed) throw new Error('展厅已关闭。');
    const { scene } = await loader.loadAsync(`/models/acnh/${path}.glb`);
    if (disposed) { disposeModels([scene]); throw new Error('展厅已关闭。'); }
    ownedModels.add(scene);
    return scene;
  }
  function loadFish(species: MuseumFishSpecies) {
    const cached = fishLoads.get(species);
    if (cached) return cached;
    const metadata = MUSEUM_SPECIES[species];
    const pending = loadModel(`fish/${metadata.model}`).then(model => {
      if (disposed) throw new Error('展厅已关闭。');
      try {
        const template = normalizeFish(model, metadata.length);
        fish[species] = template;
        return template;
      } catch (error) {
        ownedModels.delete(model);
        disposeModels([model]);
        throw error;
      }
    }).catch(error => {
      if (fishLoads.get(species) === pending) fishLoads.delete(species);
      throw error;
    });
    fishLoads.set(species, pending);
    return pending;
  }
  function loadCharacter(path: string) {
    const cached = characters.get(path);
    if (cached) return cached;
    const pending = loadModel(path).catch(error => {
      if (characters.get(path) === pending) characters.delete(path);
      throw error;
    });
    characters.set(path, pending);
    return pending;
  }
  function retainCharacters(paths: string[]) {
    const retained = new Set(paths);
    for (const [path, pending] of characters) {
      if (retained.has(path)) continue;
      characters.delete(path);
      void pending.then(model => {
        if (!ownedModels.delete(model)) return;
        disposeModels([model]);
      }, () => {});
    }
  }
  return {
    fish, scenery, visitor: models[0], companion: characterPaths.length > 1 ? models[1] : null, loadFish, loadCharacter, retainCharacters,
    dispose() { disposed = true; disposeModels([...ownedModels]); ownedModels.clear(); characters.clear(); fishLoads.clear();
      for (const species of Object.keys(fish) as MuseumFishSpecies[]) delete fish[species]; },
  };
}
