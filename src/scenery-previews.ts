import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { createMuseum } from "./museum";
import { SCENERY_PRESETS } from "./scenery-presets";
import type { SceneryStyle } from "./scenery-presets";
import { TANK_WIDTH } from "./aquarium-layout";

export function createSceneryPreviews(templates: Map<string, THREE.Group>): Record<SceneryStyle, string> {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(480, 270);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#071437");
  const camera = new THREE.PerspectiveCamera(35, 480 / 270, .1, 80);
  camera.position.set(0, 5, 14.8 * TANK_WIDTH / 18);
  camera.lookAt(0, 3.5, -3);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, .04);
  scene.environment = environment.texture;
  scene.environmentIntensity = .35;
  room.dispose();
  pmrem.dispose();
  scene.add(new THREE.HemisphereLight("#b1cdff", "#18224a", .7));
  const sun = new THREE.DirectionalLight("#a7c4ff", 2.1);
  sun.position.set(-3, 12, 2);
  scene.add(sun);
  const rim = new THREE.DirectionalLight("#6384ff", 1.2);
  rim.position.set(4, 6, -5);
  scene.add(rim);

  try {
    return Object.fromEntries(Object.keys(SCENERY_PRESETS).map(value => {
      const style = value as SceneryStyle;
      const museum = createMuseum(new THREE.Group(), null, templates, style);
      scene.add(museum.group);
      try {
        renderer.render(scene, camera);
        return [style, renderer.domElement.toDataURL("image/webp", .85)];
      } finally {
        scene.remove(museum.group);
        museum.dispose();
      }
    })) as Record<SceneryStyle, string>;
  } finally {
    environment.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
