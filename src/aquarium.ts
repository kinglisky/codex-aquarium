import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import type { ActivityCategory, AquariumSession, SessionStatus } from "../shared/protocol";
import type { FishSpecies } from "./fish";
import { createMuseumFish } from "./museum-fish";
import { createMuseum } from "./museum";
import type { loadMuseumAssets } from "./museum-assets";
import { hashSeed, speciesForSession } from "./sessions";
import { createSwimmingWorld } from "./swimming";
import type { SwimmingFish } from "./swimming";

export const ACTIVITY_FISH: Record<ActivityCategory, FishSpecies> = { read: "neon", write: "swordtail", terminal: "golden", web: "rainbow", agent: "betta", tool: "guppy" };
const STATUS_SPEED: Record<SessionStatus, number> = { thinking: 0.65, working: 1, waiting: 0.2, idle: 0.3, interrupted: 0.15, stale: 0.08 };
type FishModel = ReturnType<typeof createMuseumFish>;
interface Follower { model: FishModel; species: FishSpecies; motion: SwimmingFish; slot: number; }
interface School {
  session: AquariumSession;
  model: FishModel;
  followers: Map<string, Follower>;
  motion: SwimmingFish;
}

export function createAquarium(container: HTMLElement, onSelect: (id: string) => void, assets: Awaited<ReturnType<typeof loadMuseumAssets>>) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.domElement.setAttribute("aria-label", "海洋馆。拖动观察，滚轮缩放，点击鱼查看会话，方向键或 A、D 沿玻璃散步。");
  renderer.domElement.tabIndex = 0;
  container.append(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#040b22");
  scene.fog = new THREE.FogExp2("#071437", 0.009);
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 120);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 12;
  controls.maxDistance = 32;
  controls.minPolarAngle = Math.PI * 0.44;
  controls.maxPolarAngle = Math.PI * 0.52;
  controls.minAzimuthAngle = -0.25;
  controls.maxAzimuthAngle = 0.25;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.04);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.35;
  room.dispose();
  pmrem.dispose();
  scene.add(new THREE.HemisphereLight("#b1cdff", "#18224a", 0.7));
  const sun = new THREE.DirectionalLight("#a7c4ff", 2.1);
  sun.position.set(-3, 12, 2);
  scene.add(sun);
  const rim = new THREE.DirectionalLight("#6384ff", 1.2);
  rim.position.set(4, 6, -5);
  scene.add(rim);
  const museum = createMuseum(assets.visitor);
  const swimming = createSwimmingWorld(museum.obstacles);
  scene.add(museum.group);
  const schools = new Map<string, School>();
  const keys = new Set<string>();
  let selectedId: string | null = null;
  let paused = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let disconnected = false;
  let time = 0;
  let lastFrame = performance.now();
  let frame = 0;
  let disposed = false;
  let flow = 0.8;
  let visitorX = 0;
  let visitorTarget = 0;
  let closeView = false;
  let cameraAnchor = 0;

  function removeSchool(school: School) {
    swimming.removeFish(school.motion.id);
    scene.remove(school.model.group);
    school.model.dispose();
    for (const { model, motion } of school.followers.values()) {
      swimming.removeFish(motion.id);
      scene.remove(model.group);
      model.dispose();
    }
  }

  function setSessions(sessions: AquariumSession[]) {
    const ids = new Set(sessions.map(session => session.id));
    for (const [id, school] of schools) {
      if (ids.has(id)) continue;
      removeSchool(school);
      schools.delete(id);
    }
    for (const session of sessions) {
      let school = schools.get(session.id);
      if (!school) {
        const species = speciesForSession(session.id);
        const model = createMuseumFish(species, assets.fish[species]);
        const seed = hashSeed(session.id);
        const motion = swimming.addFish(session.id, model.size.clone().multiplyScalar(1.15), seed);
        if (!motion) { model.dispose(); continue; }
        model.group.userData.sessionId = session.id;
        scene.add(model.group);
        school = { model, followers: new Map(), session, motion };
        schools.set(session.id, school);
      }
      school.session = session;
      const activities = new Map(session.activities.map(activity => [activity.id, activity]));
      for (const [id, follower] of school.followers) {
        const activity = activities.get(id);
        if (activity && ACTIVITY_FISH[activity.category] === follower.species) continue;
        scene.remove(follower.model.group);
        swimming.removeFish(follower.motion.id);
        follower.model.dispose();
        school.followers.delete(id);
      }
      for (const activity of session.activities) {
        if (school.followers.has(activity.id)) continue;
        const species = ACTIVITY_FISH[activity.category];
        const model = createMuseumFish(species, assets.fish[species]);
        const scale = activity.kind === "agent" ? 0.45 : 0.3;
        model.group.scale.setScalar(scale);
        const id = `${session.id}:${activity.id}`;
        const occupied = new Set([...school.followers.values()].map(follower => follower.slot));
        let slot = 0;
        while (occupied.has(slot)) slot += 1;
        const motion = swimming.addFish(id, model.size.clone().multiplyScalar(scale), hashSeed(id), { leader: school.motion, slot });
        if (!motion) { model.dispose(); continue; }
        model.group.userData.sessionId = session.id;
        scene.add(model.group);
        school.followers.set(activity.id, { model, species, motion, slot });
      }
    }
  }

  function swim(model: FishModel, motion: SwimmingFish) {
    model.group.position.copy(motion.position);
    model.group.quaternion.copy(motion.quaternion);
    model.animate(time, motion.speed, motion.turnRate);
  }

  function resetView(near = false) {
    closeView = near;
    cameraAnchor = 0;
    visitorTarget = 0;
    const aspect = Math.max(0.6, container.clientWidth / Math.max(1, container.clientHeight));
    const distance = Math.max(18.5, 24 / Math.max(1, aspect));
    camera.position.set(0, near ? 4.25 : 4.4, near ? distance * 0.88 : distance);
    controls.target.set(0, near ? 3.25 : 3.5, -2);
    controls.update();
  }
  const resize = new ResizeObserver(() => {
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (!width || !height) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    resetView(closeView);
  });
  resize.observe(container);
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const down = new THREE.Vector2();
  const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0.22);
  const destination = new THREE.Vector3();
  function walk(direction: number) { visitorTarget = THREE.MathUtils.clamp(visitorTarget + direction * 1.2, -6.5, 6.5); }
  function pointerDown(event: PointerEvent) { down.set(event.clientX, event.clientY); }
  function pointerUp(event: PointerEvent) {
    if (down.distanceTo(new THREE.Vector2(event.clientX, event.clientY)) > 5) return;
    renderer.domElement.focus({ preventScroll: true });
    const bounds = renderer.domElement.getBoundingClientRect();
    pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const roots = [...schools.values()].flatMap(school => [school.model.group, ...[...school.followers.values()].map(follower => follower.model.group)]);
    const hit = raycaster.intersectObjects(roots, true)[0];
    if (!hit) {
      if (raycaster.ray.intersectPlane(floor, destination) && destination.z > 0.8) visitorTarget = THREE.MathUtils.clamp(destination.x, -6.5, 6.5);
      return;
    }
    let object: THREE.Object3D | null = hit.object;
    while (object && !object.userData.sessionId) object = object.parent;
    if (typeof object?.userData.sessionId === "string") onSelect(object.userData.sessionId);
  }
  function keyDown(event: KeyboardEvent) {
    if (event.target instanceof HTMLElement && (event.target.matches("input, textarea, select") || event.target.isContentEditable)) return;
    if (!["ArrowLeft", "ArrowRight", "KeyA", "KeyD"].includes(event.code)) return;
    event.preventDefault();
    keys.add(event.code);
  }
  function keyUp(event: KeyboardEvent) { keys.delete(event.code); }
  function blur() { keys.clear(); }
  renderer.domElement.addEventListener("pointerdown", pointerDown);
  renderer.domElement.addEventListener("pointerup", pointerUp);
  window.addEventListener("keydown", keyDown);
  window.addEventListener("keyup", keyUp);
  window.addEventListener("blur", blur);

  function animate(now: number) {
    if (disposed) return;
    const delta = Math.min((now - lastFrame) / 1000, 0.05);
    const movement = paused || disconnected ? 0 : delta;
    lastFrame = now;
    time += movement;
    const direction = Number(keys.has("ArrowRight") || keys.has("KeyD")) - Number(keys.has("ArrowLeft") || keys.has("KeyA"));
    visitorTarget = THREE.MathUtils.clamp(visitorTarget + direction * delta * 2.4, -6.5, 6.5);
    visitorX = THREE.MathUtils.damp(visitorX, visitorTarget, 6, delta);
    museum.setVisitorPosition(visitorX, Math.abs(visitorX - visitorTarget) > 0.025, delta);
    for (const school of schools.values()) {
      school.motion.activity = STATUS_SPEED[school.session.status];
      for (const follower of school.followers.values()) follower.motion.activity = school.motion.activity;
    }
    swimming.update(movement);
    for (const school of schools.values()) {
      swim(school.model, school.motion);
      school.model.group.scale.setScalar(school.session.id === selectedId ? 1.15 : 1.05);
      for (const follower of school.followers.values()) {
        swim(follower.model, follower.motion);
      }
    }
    const anchor = visitorX * (camera.aspect < 1 ? 0.9 : 0.15);
    camera.position.x += anchor - cameraAnchor;
    controls.target.x += anchor - cameraAnchor;
    cameraAnchor = anchor;
    museum.update(time, flow);
    controls.update();
    renderer.render(scene, camera);
    frame = requestAnimationFrame(animate);
  }
  frame = requestAnimationFrame(animate);
  return {
    setSessions, walk, resetView,
    select(id: string | null) { selectedId = id; },
    setPaused(value: boolean) { paused = value; },
    setDisconnected(value: boolean) { disconnected = value; },
    setFlow(value: number) { flow = value; },
    setLight(value: number) { sun.intensity = value * 2.1; museum.setLight(value); },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      resize.disconnect();
      renderer.domElement.removeEventListener("pointerdown", pointerDown);
      renderer.domElement.removeEventListener("pointerup", pointerUp);
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", blur);
      controls.dispose();
      for (const school of schools.values()) removeSchool(school);
      schools.clear();
      swimming.dispose();
      museum.dispose();
      assets.dispose();
      environment.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
