import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import type { AquariumSession, SessionStatus } from "../shared/protocol";
import { createMuseumFish } from "./museum-fish";
import type { MuseumFishSpecies as FishSpecies } from "./museum-fish";
import { createMuseum } from "./museum";
import type { loadMuseumAssets } from "./museum-assets";
import { hashSeed, speciesForExhibit, speciesForSession } from "./sessions";
import { createSwimmingWorld } from "./swimming";
import type { SwimmingFish } from "./swimming";
import { createVisitorMovement, VISITOR_KEYS } from "./visitor-movement";
import { COMPANION_MODELS, PLAYER_MODELS } from "./museum-characters";
import type { MuseumAppearance } from "./museum-characters";
import { createFishFade, createFishPresence } from "./fish-presence";
import { DEFAULT_SCENERY_STYLE } from "./scenery-presets";
import type { SceneryStyle } from "./scenery-presets";
import { ACTIVITY_FISH, scaleForFishRole } from "./fish-roles";
import { TANK_DEPTH, TANK_HALF_WIDTH } from "./aquarium-layout";
import { cameraAnchorForViewer, cameraMaxDistance } from "./aquarium-camera";

export { ACTIVITY_FISH } from "./fish-roles";
const STATUS_SPEED: Record<SessionStatus, number> = { thinking: 0.65, working: 1, waiting: 0.2, idle: 0.3, interrupted: 0.15, stale: 0.08 };
type FishModel = ReturnType<typeof createMuseumFish>;
interface Resident {
  scale: number;
  model: FishModel;
  motion: SwimmingFish;
  presence: ReturnType<typeof createFishPresence>;
  fade: ReturnType<typeof createFishFade>;
}
interface Follower extends Resident { species: FishSpecies; slot: number; }
interface School extends Resident {
  session: AquariumSession;
  followers: Map<string, Follower>;
}

export function createAquarium(container: HTMLElement, onSelect: (id: string) => void, assets: Awaited<ReturnType<typeof loadMuseumAssets>>, initialScenery: SceneryStyle = DEFAULT_SCENERY_STYLE) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.domElement.setAttribute("aria-label", "A、D 或左右方向键沿玻璃跑动，小动物跟随。拖动观察，滚轮缩放，点击鱼查看会话。");
  renderer.domElement.setAttribute("data-i18n-label", "canvasHint");
  renderer.domElement.tabIndex = 0;
  container.append(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#040b22");
  scene.fog = new THREE.FogExp2("#071437", 0.009);
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 120);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 10;
  controls.maxDistance = cameraMaxDistance(camera);
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
  const museum = createMuseum(assets.visitor, assets.companion, assets.scenery, initialScenery);
  const swimming = createSwimmingWorld(museum.obstacles);
  scene.add(museum.group);
  const schools = new Map<string, School>();
  const keys = new Set<string>();
  const visitor = createVisitorMovement();
  let selectedId: string | null = null;
  let paused = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let disconnected = false;
  let time = 0;
  let lastFrame = performance.now();
  let frame = 0;
  let disposed = false;
  let flow = 0.8;
  let closeView = false;
  let cameraAnchor = 0;
  let appearanceRevision = 0;
  let sceneryStyle = initialScenery;
  let latestSessions: AquariumSession[] = [];
  let latestExhibition = false;
  const pendingFish = new Set<FishSpecies>();
  let cleanupTimer: ReturnType<typeof setTimeout> | undefined;

  async function setAppearance(appearance: MuseumAppearance) {
    const revision = ++appearanceRevision;
    const playerPath = PLAYER_MODELS[appearance.player].model;
    const companionPath = appearance.companion === "none" ? null : COMPANION_MODELS[appearance.companion].model;
    const [player, companion] = await Promise.all([
      assets.loadCharacter(playerPath),
      companionPath ? assets.loadCharacter(companionPath) : null,
    ]);
    if (disposed || revision !== appearanceRevision) return false;
    museum.setPlayer(player);
    museum.setCompanion(companion);
    assets.retainCharacters(companionPath ? [playerPath, companionPath] : [playerPath]);
    return true;
  }

  function setScenery(style: SceneryStyle) {
    if (disposed || style === sceneryStyle) return;
    museum.setScenery(style);
    try {
      swimming.setObstacles(museum.obstacles);
      sceneryStyle = style;
    } catch (error) {
      museum.setScenery(sceneryStyle);
      throw error;
    }
  }

  function removeFish(resident: Resident) {
    swimming.removeFish(resident.motion.id);
    scene.remove(resident.model.group);
    resident.fade.dispose();
    resident.model.dispose();
  }

  function removeSchool(school: School) {
    for (const follower of school.followers.values()) removeFish(follower);
    school.followers.clear();
    removeFish(school);
  }

  function requestFish(species: FishSpecies) {
    if (disposed || pendingFish.has(species)) return;
    pendingFish.add(species);
    void assets.loadFish(species).then(() => {
      if (!disposed) setSessions(latestSessions, latestExhibition);
    }).catch(error => console.warn("鱼模型暂未加载，将在下次会话更新时重试。", species, error))
      .finally(() => pendingFish.delete(species));
  }

  function addFish(species: FishSpecies, id: string, sessionId: string, scale = 1, leader?: SwimmingFish, slot = 0): Resident | undefined {
    const template = assets.fish[species];
    if (!template) { requestFish(species); return; }
    const model = createMuseumFish(species, template);
    const seed = hashSeed(id);
    const motion = swimming.addFish(id, model.size.clone().multiplyScalar(scale * (leader ? 1 : 1.1)), seed, { leader, slot });
    if (!motion) { model.dispose(); return; }
    model.group.userData.sessionId = sessionId;
    model.group.scale.setScalar(scale);
    model.group.position.copy(motion.position);
    model.group.quaternion.copy(motion.quaternion);
    const fade = createFishFade(model.group);
    fade.setOpacity(0);
    scene.add(model.group);
    return { model, motion, fade, scale, presence: createFishPresence(performance.now() / 1000) };
  }

  function setFishActive(resident: Resident, active: boolean, now: number) {
    if (resident.presence.active === active) return;
    resident.presence.setActive(active, now);
    if (active) { resident.motion.destination = undefined; return; }
    const side = resident.motion.position.x < 0 ? -1 : 1;
    resident.motion.destination = new THREE.Vector3(side * (TANK_HALF_WIDTH - 1.8), Math.max(2.5, resident.motion.position.y), -4.9);
  }

  function scheduleCleanup() {
    clearTimeout(cleanupTimer);
    const deadlines = [...schools.values()].flatMap(school => [school.presence.removeAt, ...[...school.followers.values()].map(follower => follower.presence.removeAt)]);
    const next = Math.min(...deadlines);
    if (!Number.isFinite(next)) return;
    cleanupTimer = setTimeout(() => {
      cleanupTimer = undefined;
      updatePresence(performance.now() / 1000);
      scheduleCleanup();
    }, Math.max(0, (next - performance.now() / 1000) * 1000) + 10);
  }

  function updatePresence(now: number) {
    let removed = false;
    for (const [id, school] of schools) {
      if (school.presence.advance(now)) {
        removeSchool(school);
        schools.delete(id);
        removed = true;
        continue;
      }
      school.fade.setOpacity(school.presence.opacity);
      for (const [activityId, follower] of school.followers) {
        if (follower.presence.advance(now)) {
          removeFish(follower);
          school.followers.delete(activityId);
          removed = true;
          continue;
        }
        follower.fade.setOpacity(follower.presence.opacity);
      }
    }
    if (removed && !disposed) setSessions(latestSessions, latestExhibition);
  }

  function setSessions(sessions: AquariumSession[], exhibition = false) {
    if (disposed) return;
    latestSessions = sessions;
    latestExhibition = exhibition;
    const now = performance.now() / 1000;
    const ids = new Set(sessions.map(session => session.id));
    for (const [id, school] of schools) {
      if (ids.has(id)) continue;
      setFishActive(school, false, now);
      for (const follower of school.followers.values()) setFishActive(follower, false, now);
    }
    for (const session of sessions) {
      let school = schools.get(session.id);
      if (!school) {
        const species = exhibition ? speciesForExhibit(session.id) : speciesForSession(session.id);
        const resident = addFish(species, session.id, session.id, exhibition ? 1 : scaleForFishRole(species, "session"));
        if (!resident) continue;
        school = { ...resident, followers: new Map(), session };
        schools.set(session.id, school);
      }
      school.session = session;
      setFishActive(school, true, now);
      const activities = new Map(session.activities.map(activity => [activity.id, activity]));
      for (const [id, follower] of school.followers) {
        const activity = activities.get(id);
        setFishActive(follower, !!activity && ACTIVITY_FISH[activity.category] === follower.species, now);
      }
      for (const activity of session.activities) {
        if (school.followers.has(activity.id)) continue;
        const species = ACTIVITY_FISH[activity.category];
        const occupied = new Set([...school.followers.values()].map(follower => follower.slot));
        let slot = 0;
        while (occupied.has(slot)) slot += 1;
        const resident = addFish(species, `${session.id}:${activity.id}`, session.id, scaleForFishRole(species, activity.kind), school.motion, slot);
        if (resident) school.followers.set(activity.id, { ...resident, species, slot });
      }
    }
    scheduleCleanup();
  }

  function swim(model: FishModel, motion: SwimmingFish) {
    model.group.position.copy(motion.position);
    model.group.quaternion.copy(motion.quaternion);
    model.animate(time, motion.speed, motion.turnRate);
  }

  function resetView(near = false) {
    closeView = near;
    const aspect = Math.max(0.6, container.clientWidth / Math.max(1, container.clientHeight));
    const distance = Math.max(18.5, 24 / Math.max(1, aspect));
    controls.maxDistance = cameraMaxDistance(camera);
    controls.minDistance = Math.min(10, controls.maxDistance * .8);
    camera.far = controls.maxDistance + TANK_DEPTH + 20;
    camera.updateProjectionMatrix();
    camera.position.set(0, near ? 4.25 : 4.4, near ? distance * 0.88 : distance);
    controls.target.set(0, near ? 3.25 : 3.5, -2);
    camera.position.sub(controls.target)
      .clampLength(controls.minDistance, controls.maxDistance).add(controls.target);
    cameraAnchor = cameraAnchorForViewer(visitor.position.x, camera);
    camera.position.x = cameraAnchor;
    controls.target.x = cameraAnchor;
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
  function walk(x: number, z = 0) { visitor.walk(x, z); }
  function pointerDown(event: PointerEvent) { down.set(event.clientX, event.clientY); }
  function pointerUp(event: PointerEvent) {
    if (down.distanceTo(new THREE.Vector2(event.clientX, event.clientY)) > 5) return;
    renderer.domElement.focus({ preventScroll: true });
    const bounds = renderer.domElement.getBoundingClientRect();
    pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const roots = [...schools.values()].filter(school => school.presence.active).flatMap(school =>
      [school, ...school.followers.values()].filter(fish => fish.presence.active && fish.presence.opacity > .2).map(fish => fish.model.group));
    const hit = raycaster.intersectObjects(roots, true)[0];
    if (!hit) {
      if (raycaster.ray.intersectPlane(floor, destination) && destination.z >= 1.25) visitor.moveTo(destination.x, destination.z);
      return;
    }
    let object: THREE.Object3D | null = hit.object;
    while (object && !object.userData.sessionId) object = object.parent;
    if (typeof object?.userData.sessionId === "string") onSelect(object.userData.sessionId);
  }
  function keyDown(event: KeyboardEvent) {
    if (event.target instanceof HTMLElement && (event.target.matches("input, textarea, select") || event.target.isContentEditable)) return;
    if (event.altKey || event.ctrlKey || event.metaKey || !VISITOR_KEYS.has(event.code)) return;
    event.preventDefault();
    keys.add(event.code);
  }
  function keyUp(event: KeyboardEvent) { keys.delete(event.code); }
  function blur() { keys.clear(); visitor.stop(); }
  function visibilityChanged() {
    if (document.hidden) blur();
    updatePresence(performance.now() / 1000);
  }
  renderer.domElement.addEventListener("pointerdown", pointerDown);
  renderer.domElement.addEventListener("pointerup", pointerUp);
  window.addEventListener("keydown", keyDown);
  window.addEventListener("keyup", keyUp);
  window.addEventListener("blur", blur);
  document.addEventListener("visibilitychange", visibilityChanged);

  function animate(now: number) {
    if (disposed) return;
    const delta = Math.min((now - lastFrame) / 1000, 0.05);
    const movement = paused || disconnected ? 0 : delta;
    lastFrame = now;
    updatePresence(now / 1000);
    time += movement;
    visitor.update(delta, keys);
    museum.setVisitorPosition(visitor.position, visitor.heading, visitor.distance, delta);
    for (const school of schools.values()) {
      school.motion.activity = school.presence.active ? STATUS_SPEED[school.session.status] : .65;
      for (const follower of school.followers.values()) follower.motion.activity = school.motion.activity;
    }
    swimming.update(movement);
    for (const school of schools.values()) {
      swim(school.model, school.motion);
      school.model.group.scale.setScalar(school.scale * (school.session.id === selectedId ? 1.08 : 1));
      for (const follower of school.followers.values()) {
        swim(follower.model, follower.motion);
      }
    }
    const anchor = THREE.MathUtils.damp(cameraAnchor, cameraAnchorForViewer(visitor.position.x, camera), 5, delta);
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
    setSessions, walk, resetView, setAppearance, setScenery,
    select(id: string | null) { selectedId = id; },
    setPaused(value: boolean) { paused = value; },
    setDisconnected(value: boolean) { disconnected = value; },
    setFlow(value: number) { flow = value; },
    setLight(value: number) { sun.intensity = value * 2.1; museum.setLight(value); },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      clearTimeout(cleanupTimer);
      resize.disconnect();
      renderer.domElement.removeEventListener("pointerdown", pointerDown);
      renderer.domElement.removeEventListener("pointerup", pointerUp);
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", visibilityChanged);
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
