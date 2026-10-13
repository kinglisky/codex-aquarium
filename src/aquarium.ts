import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import type { ActivityCategory, AquariumSession, SessionStatus } from "../shared/protocol";
import type { FishSpecies } from "./fish";
import { createMuseumFish } from "./museum-fish";
import { createMuseum } from "./museum";
import { hashSeed, speciesForSession } from "./sessions";

export const ACTIVITY_FISH: Record<ActivityCategory, FishSpecies> = { read: "neon", write: "swordtail", terminal: "golden", web: "rainbow", agent: "betta", tool: "guppy" };
const STATUS_SPEED: Record<SessionStatus, number> = { thinking: 0.65, working: 1, waiting: 0.2, idle: 0.3, interrupted: 0.15, stale: 0.08 };
type FishModel = ReturnType<typeof createMuseumFish>;
interface Follower { model: FishModel; species: FishSpecies; }
interface School {
  session: AquariumSession;
  model: FishModel;
  followers: Map<string, Follower>;
  phase: number;
  speed: number;
  seed: number;
}

export function createAquarium(container: HTMLElement, onSelect: (id: string) => void) {
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
  const museum = createMuseum();
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
    scene.remove(school.model.group);
    school.model.dispose();
    for (const { model } of school.followers.values()) {
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
        const model = createMuseumFish(speciesForSession(session.id));
        const seed = hashSeed(session.id);
        model.group.userData.sessionId = session.id;
        scene.add(model.group);
        school = { model, followers: new Map(), session, phase: seed % 1000 / 1000 * Math.PI * 2, speed: STATUS_SPEED[session.status], seed };
        schools.set(session.id, school);
      }
      school.session = session;
      const activities = new Map(session.activities.map(activity => [activity.id, activity]));
      for (const [id, follower] of school.followers) {
        const activity = activities.get(id);
        if (activity && ACTIVITY_FISH[activity.category] === follower.species) continue;
        scene.remove(follower.model.group);
        follower.model.dispose();
        school.followers.delete(id);
      }
      for (const activity of session.activities) {
        if (school.followers.has(activity.id)) continue;
        const species = ACTIVITY_FISH[activity.category];
        const model = createMuseumFish(species);
        model.group.scale.setScalar(activity.kind === "agent" ? 0.45 : 0.3);
        model.group.userData.sessionId = session.id;
        scene.add(model.group);
        school.followers.set(activity.id, { model, species });
      }
    }
  }

  const position = new THREE.Vector3();
  const next = new THREE.Vector3();
  const heading = new THREE.Vector3();
  const fishRotation = new THREE.Euler(0, 0, 0, "YZX");
  const orientation = new THREE.Quaternion();
  function route(school: School, phase: number, out: THREE.Vector3) {
    const height = 2 + (school.seed >>> 6) % 100 / 100 * 4.1;
    const width = 5.7 + school.seed % 100 / 90;
    const depth = 0.55 + (school.seed >>> 12) % 100 / 120;
    out.set(Math.sin(phase) * width, height + Math.sin(phase * 1.7 + school.seed % 8) * 0.35, -3 + Math.cos(phase) * depth);
  }
  function swim(model: FishModel, school: School, phase: number, lateral: number, delta: number) {
    route(school, phase, position);
    route(school, phase + 0.015, next);
    heading.subVectors(next, position).normalize();
    position.x -= heading.z * lateral;
    position.z += heading.x * lateral;
    model.group.position.copy(position);
    orientation.setFromEuler(fishRotation.set(0, Math.atan2(-heading.z, heading.x), Math.asin(heading.y), "YZX"));
    model.group.quaternion.slerp(orientation, model.group.userData.oriented ? Math.min(1, delta * 3) : 1);
    model.group.userData.oriented = true;
    model.animate(time, school.speed);
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
      school.speed = THREE.MathUtils.damp(school.speed, STATUS_SPEED[school.session.status], 2.5, movement);
      school.phase += movement * school.speed * 0.12;
      swim(school.model, school, school.phase, 0, movement);
      school.model.group.scale.setScalar(school.session.id === selectedId ? 1.15 : 1.05);
      let index = 0;
      for (const follower of school.followers.values()) {
        const row = Math.floor(index / 2) + 1;
        const lateral = (index % 2 === 0 ? -1 : 1) * (0.15 + row * 0.09);
        swim(follower.model, school, school.phase - 0.15 - row * 0.12, lateral, movement);
        index += 1;
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
      museum.dispose();
      environment.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
