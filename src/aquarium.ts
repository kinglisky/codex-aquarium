import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import type { ActivityCategory, AquariumSession, SessionStatus } from "../shared/protocol";
import { createFishModel, type FishSpecies } from "./fish";
import { createPlants } from "./plants";
import { hashSeed, speciesForSession } from "./sessions";

export const ACTIVITY_FISH: Record<ActivityCategory, FishSpecies> = { read: "neon", write: "swordtail", terminal: "golden", web: "rainbow", agent: "betta", tool: "guppy" };
const STATUS_SPEED: Record<SessionStatus, number> = { thinking: 0.65, working: 1, waiting: 0.2, idle: 0.3, interrupted: 0.15, stale: 0.08 };
const STATUS_COLOR: Record<SessionStatus, string> = { thinking: "#93c5ec", working: "#86d6ca", waiting: "#f1b875", idle: "#6c95b0", interrupted: "#ee8894", stale: "#647c8a" };

type FishModel = ReturnType<typeof createFishModel>;
interface Follower { model: FishModel; species: FishSpecies; }
interface School {
  session: AquariumSession;
  model: FishModel;
  followers: Map<string, Follower>;
  phase: number;
  speed: number;
  seed: number;
  halo: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
}

export function createAquarium(container: HTMLElement, onSelect: (id: string) => void) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.domElement.setAttribute("aria-label", "可旋转的 3D 鱼缸。拖动旋转，滚轮缩放；可从右侧会话列表选择鱼。");
  renderer.domElement.setAttribute("role", "img");
  container.append(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#020504");
  scene.fog = new THREE.FogExp2("#020907", 0.004);
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 9;
  controls.maxDistance = 42;
  controls.minPolarAngle = Math.PI * 0.29;
  controls.maxPolarAngle = Math.PI * 0.54;
  controls.minAzimuthAngle = -Math.PI * 0.43;
  controls.maxAzimuthAngle = Math.PI * 0.43;
  controls.target.set(0, 2.75, 0);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const environmentScene = new RoomEnvironment();
  const environment = pmrem.fromScene(environmentScene, 0.04);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.16;
  environmentScene.dispose();
  pmrem.dispose();

  scene.add(new THREE.HemisphereLight("#e8ffe1", "#071109", 0.42));
  const sun = new THREE.DirectionalLight("#f5fff6", 3.2);
  sun.position.set(-1, 8, 2);
  sun.target.position.set(0, 1.5, -0.8);
  scene.add(sun, sun.target);
  const rimLight = new THREE.DirectionalLight("#b6e7ff", 0.85);
  rimLight.position.set(2, 6, -2);
  scene.add(rimLight);
  const plants = createPlants(1024);
  scene.add(plants.group);
  plants.setGrowth(1);

  const resources: { dispose(): void }[] = [];
  function mesh<G extends THREE.BufferGeometry, M extends THREE.Material>(geometry: G, material: M) {
    resources.push(geometry, material);
    return new THREE.Mesh(geometry, material);
  }

  const floor = mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshBasicMaterial({ color: "#020504", toneMapped: false }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.31;
  scene.add(floor);
  const substrate = mesh(new THREE.BoxGeometry(10.7, 0.38, 4.9), new THREE.MeshStandardMaterial({ color: "#171912", roughness: 1 }));
  substrate.position.y = -0.01;
  scene.add(substrate);

  const gravelGeometry = new THREE.IcosahedronGeometry(0.055, 0);
  const gravelMaterial = new THREE.MeshStandardMaterial({ color: "#777862", roughness: 1 });
  resources.push(gravelGeometry, gravelMaterial);
  const gravel = new THREE.InstancedMesh(gravelGeometry, gravelMaterial, 1500);
  const dummy = new THREE.Object3D();
  for (let index = 0; index < gravel.count; index += 1) {
    const value = hashSeed(`gravel-${index}`);
    dummy.position.set(((value % 1000) / 1000 - 0.5) * 10.6, 0.18, (((value >>> 12) % 1000) / 1000 - 0.5) * 4.8);
    dummy.rotation.set(value % 6, value % 4, value % 3);
    dummy.scale.setScalar(0.55 + ((value >>> 8) % 100) / 100);
    dummy.updateMatrix();
    gravel.setMatrixAt(index, dummy.matrix);
    gravel.setColorAt(index, new THREE.Color().setHSL(0.16, 0.16, 0.045 + ((value >>> 4) % 100) / 1100));
  }
  scene.add(gravel);

  const back = mesh(new THREE.PlaneGeometry(10.8, 6.1), new THREE.MeshBasicMaterial({ color: "#010503", toneMapped: false }));
  back.position.set(0, 2.8, -2.48);
  scene.add(back);
  const glassVertexShader = `
    varying vec2 vUv;
    varying vec3 vWorldPosition;
    varying vec3 vWorldNormal;
    void main() {
      vUv = uv;
      vec4 world = modelMatrix * vec4(position, 1.0);
      vWorldPosition = world.xyz;
      vWorldNormal = normalize(mat3(modelMatrix) * normal);
      gl_Position = projectionMatrix * viewMatrix * world;
    }
  `;
  const glassFragmentShader = `
    uniform vec2 paneSize;
    uniform vec3 tint;
    varying vec2 vUv;
    varying vec3 vWorldPosition;
    varying vec3 vWorldNormal;
    void main() {
      vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
      vec3 normal = normalize(vWorldNormal);
      float fresnel = pow(1.0 - abs(dot(normal, viewDirection)), 4.0);
      vec3 reflected = reflect(-viewDirection, normal);
      float azimuth = atan(reflected.x, reflected.z);
      // Soft room lights move across the glass as the camera orbits.
      float tallLight = exp(-pow((azimuth + 0.31) / 0.045, 2.0));
      float softLight = exp(-pow((azimuth - 0.46) / 0.11, 2.0)) * 0.32;
      float lightHeight = smoothstep(-0.42, -0.14, reflected.y)
        * (1.0 - smoothstep(0.21, 0.44, reflected.y));
      float topLight = exp(-pow((reflected.y - 0.155) / 0.014, 2.0))
        * (1.0 - smoothstep(0.35, 0.8, abs(reflected.x))) * 0.35;
      float reflection = (tallLight + softLight) * lightHeight + topLight;
      vec2 edgeDistance = min(vUv, 1.0 - vUv) * paneSize;
      float edge = 1.0 - smoothstep(0.0, 0.08, min(edgeDistance.x, edgeDistance.y));
      float alpha = 0.012 + fresnel * 0.17 + reflection * 0.17 + edge * 0.13;
      gl_FragColor = vec4(mix(tint, vec3(0.88, 0.96, 0.94), min(1.0, reflection)), alpha);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `;
  const panes = [
    { width: 10.82, x: 0, z: 2.49, rotation: 0, order: 12 },
    { width: 4.98, x: -5.41, z: 0, rotation: -Math.PI / 2, order: 11 },
    { width: 4.98, x: 5.41, z: 0, rotation: Math.PI / 2, order: 11 },
  ];
  for (const pane of panes) {
    const glass = mesh(new THREE.PlaneGeometry(pane.width, 6.18), new THREE.ShaderMaterial({
      uniforms: { paneSize: { value: new THREE.Vector2(pane.width, 6.18) }, tint: { value: new THREE.Color("#abcfc8") } },
      vertexShader: glassVertexShader, fragmentShader: glassFragmentShader,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true,
    }));
    glass.position.set(pane.x, 2.8, pane.z);
    glass.rotation.y = pane.rotation;
    glass.renderOrder = pane.order;
    scene.add(glass);
  }

  // Polished cut edges have physical width, including the open top of the tank.
  const edgeGeometry = new THREE.BoxGeometry(1, 1, 1);
  const edgeMaterial = new THREE.MeshPhysicalMaterial({
    color: "#73afa0", roughness: 0.12, metalness: 0, clearcoat: 1,
    transparent: true, opacity: 0.48, depthWrite: false,
    emissive: "#274e45", emissiveIntensity: 0.25,
  });
  const glassEdges = new THREE.InstancedMesh(edgeGeometry, edgeMaterial, 12);
  let edgeIndex = 0;
  for (const x of [-5.375, 5.375]) {
    for (const z of [-2.455, 2.455]) {
      dummy.position.set(x, 2.8, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(0.07, 6.18, 0.07);
      dummy.updateMatrix();
      glassEdges.setMatrixAt(edgeIndex++, dummy.matrix);
    }
  }
  for (const y of [-0.255, 5.855]) {
    for (const z of [-2.455, 2.455]) {
      dummy.position.set(0, y, z);
      dummy.scale.set(10.82, 0.07, 0.07);
      dummy.updateMatrix();
      glassEdges.setMatrixAt(edgeIndex++, dummy.matrix);
    }
    for (const x of [-5.375, 5.375]) {
      dummy.position.set(x, y, 0);
      dummy.scale.set(0.07, 0.07, 4.98);
      dummy.updateMatrix();
      glassEdges.setMatrixAt(edgeIndex++, dummy.matrix);
    }
  }
  glassEdges.renderOrder = 13;
  resources.push(edgeGeometry, edgeMaterial, glassEdges);
  scene.add(glassEdges);

  const lamp = mesh(new THREE.BoxGeometry(10.7, 0.12, 0.65), new THREE.MeshStandardMaterial({ color: "#101916", metalness: 0.7, roughness: 0.3 }));
  lamp.position.set(0, 6.14, 0.15);
  const lampStrip = mesh(new THREE.BoxGeometry(10.35, 0.022, 0.48), new THREE.MeshBasicMaterial({ color: "#e3fff3", toneMapped: false }));
  lampStrip.position.set(0, 6.07, 0.15);
  scene.add(lamp, lampStrip);

  const waterMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { time: { value: 0 } },
    vertexShader: "varying vec2 vUv; uniform float time; void main() { vUv = uv; vec3 p = position; p.z += sin(p.x * 2.8 + time * .6) * cos(p.y * 2. + time * .35) * .008; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.); }",
    fragmentShader: "varying vec2 vUv; uniform float time; void main() { float wave = sin(vUv.x * 50. + sin(vUv.y * 18. + time * .4) * 2. + time * .2); float glint = pow(max(0., wave), 22.); float edge = pow(abs(vUv.y * 2. - 1.), 16.); gl_FragColor = vec4(.46, .78, .68, .018 + glint * .045 + edge * .12); }",
  });
  const water = mesh(new THREE.PlaneGeometry(10.64, 4.8, 48, 24), waterMaterial);
  water.rotation.x = -Math.PI / 2;
  water.position.y = 5.65;
  water.renderOrder = 9;
  scene.add(water);
  const waterline = mesh(new THREE.BoxGeometry(10.64, 0.015, 0.012), new THREE.MeshBasicMaterial({ color: "#a5dfb7", transparent: true, opacity: 0.45, depthWrite: false }));
  waterline.position.set(0, 5.65, 2.405);
  scene.add(waterline);

  const causticMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { time: { value: 0 } },
    vertexShader: "varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
    fragmentShader: "varying vec2 vUv;uniform float time;void main(){vec2 p=vUv*16.;float a=sin(p.x+sin(p.y*1.9+time*.23)*.9);float b=cos(p.y+sin(p.x*1.3-time*.2)*1.2);float c=pow(max(0.,1.-abs(a+b)),14.);gl_FragColor=vec4(.28,.65,.82,c*.1);}",
  });
  const caustics = mesh(new THREE.PlaneGeometry(10.65, 4.84), causticMaterial);
  caustics.rotation.x = -Math.PI / 2;
  caustics.position.y = 0.24;
  scene.add(caustics);

  const particleGeometry = new THREE.BufferGeometry();
  const particlePositions = new Float32Array(75 * 3);
  for (let index = 0; index < 75; index += 1) {
    const seed = hashSeed(`water-${index}`);
    particlePositions[index * 3] = (seed % 1000 / 1000 - 0.5) * 10;
    particlePositions[index * 3 + 1] = (seed >>> 8) % 1000 / 1000 * 5.2 + 0.3;
    particlePositions[index * 3 + 2] = ((seed >>> 16) % 1000 / 1000 - 0.5) * 4;
  }
  particleGeometry.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));
  const particleMaterial = new THREE.PointsMaterial({ color: "#b9efff", size: 0.016, opacity: 0.28, transparent: true, depthWrite: false });
  resources.push(particleGeometry, particleMaterial);
  scene.add(new THREE.Points(particleGeometry, particleMaterial));

  const schools = new Map<string, School>();
  let selectedId: string | null = null;
  let paused = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let disconnected = false;
  let time = 0;
  let lastFrame = performance.now();
  let frame = 0;
  let disposed = false;
  let flow = 1;

  function removeSchool(school: School) {
    scene.remove(school.model.group, school.halo);
    school.model.dispose();
    school.halo.geometry.dispose();
    school.halo.material.dispose();
    for (const { model } of school.followers.values()) {
      scene.remove(model.group);
      model.dispose();
    }
  }

  function setSessions(sessions: AquariumSession[]) {
    const ids = new Set(sessions.map((session) => session.id));
    for (const [id, school] of schools) {
      if (ids.has(id)) continue;
      removeSchool(school);
      schools.delete(id);
    }
    for (const session of sessions) {
      let school = schools.get(session.id);
      if (!school) {
        const model = createFishModel(speciesForSession(session.id));
        const seed = hashSeed(session.id);
        model.group.userData.sessionId = session.id;
        const halo = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.475, 48), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
        halo.rotation.x = -Math.PI / 2;
        scene.add(model.group, halo);
        school = { model, halo, followers: new Map(), session, phase: seed % 1000 / 1000 * Math.PI * 2, speed: STATUS_SPEED[session.status], seed };
        schools.set(session.id, school);
      }
      school.session = session;
      school.halo.material.color.set(STATUS_COLOR[session.status]);
      const activityIds = new Set(session.activities.map((activity) => activity.id));
      for (const [id, follower] of school.followers) {
        const activity = session.activities.find((item) => item.id === id);
        if (activityIds.has(id) && activity && ACTIVITY_FISH[activity.category] === follower.species) continue;
        scene.remove(follower.model.group);
        follower.model.dispose();
        school.followers.delete(id);
      }
      for (const activity of session.activities) {
        if (school.followers.has(activity.id)) continue;
        const species = ACTIVITY_FISH[activity.category];
        const model = createFishModel(species);
        model.group.scale.setScalar(activity.kind === "agent" ? 0.54 : 0.4);
        model.group.userData.sessionId = session.id;
        scene.add(model.group);
        school.followers.set(activity.id, { model, species });
      }
    }
  }

  const position = new THREE.Vector3();
  const next = new THREE.Vector3();
  const heading = new THREE.Vector3();
  const forward = new THREE.Vector3(1, 0, 0);
  const orientation = new THREE.Quaternion();

  function route(school: School, phase: number, out: THREE.Vector3) {
    const height = 1.35 + (school.seed >>> 6) % 100 / 100 * 2.5;
    const width = 3.1 + school.seed % 100 / 160;
    const depth = 0.5 + (school.seed >>> 12) % 100 / 280;
    out.set(Math.sin(phase) * width, height + Math.sin(phase * 1.7 + school.seed % 8) * 0.3, Math.cos(phase) * depth + 0.75);
  }

  function swim(model: FishModel, school: School, phase: number, lateral: number, delta: number) {
    route(school, phase, position);
    route(school, phase + 0.02, next);
    heading.subVectors(next, position).normalize();
    position.x += -heading.z * lateral;
    position.z += heading.x * lateral;
    model.group.position.copy(position);
    orientation.setFromUnitVectors(forward, heading);
    model.group.quaternion.slerp(orientation, delta === 0 ? 1 : Math.min(1, delta * 9));
    model.animate(time, school.speed);
  }

  function resetView(front = false) {
    const aspect = Math.max(0.4, container.clientWidth / Math.max(1, container.clientHeight));
    const distance = Math.max(16.9, 25.9 / aspect);
    camera.position.set(front ? 0 : distance * 0.04, front ? 3.05 : 3.75, distance);
    controls.target.set(0, 2.85, 0);
    controls.update();
  }

  const resize = new ResizeObserver(() => {
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (!width || !height) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    controls.maxDistance = Math.max(42, 30 / camera.aspect);
    resetView();
  });
  resize.observe(container);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const down = new THREE.Vector2();
  function pointerDown(event: PointerEvent) { down.set(event.clientX, event.clientY); }
  function pointerUp(event: PointerEvent) {
    if (down.distanceTo(new THREE.Vector2(event.clientX, event.clientY)) > 5) return;
    const bounds = renderer.domElement.getBoundingClientRect();
    pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const roots = [...schools.values()].flatMap((school) => [school.model.group, ...[...school.followers.values()].map((follower) => follower.model.group)]);
    const hit = raycaster.intersectObjects(roots, true)[0];
    if (!hit) return;
    let object: THREE.Object3D | null = hit.object;
    while (object && !object.userData.sessionId) object = object.parent;
    if (typeof object?.userData.sessionId === "string") onSelect(object.userData.sessionId);
  }
  renderer.domElement.addEventListener("pointerdown", pointerDown);
  renderer.domElement.addEventListener("pointerup", pointerUp);

  function animate(now: number) {
    if (disposed) return;
    const delta = Math.min((now - lastFrame) / 1000, 0.05);
    const movement = paused || disconnected ? 0 : delta;
    lastFrame = now;
    time += movement;
    for (const school of schools.values()) {
      school.speed = THREE.MathUtils.damp(school.speed, STATUS_SPEED[school.session.status], 2.5, movement);
      school.phase += movement * school.speed * 0.22;
      swim(school.model, school, school.phase, 0, movement);
      const selected = school.session.id === selectedId;
      school.model.group.scale.setScalar(selected ? 1.3 : 1.18);
      school.halo.position.set(school.model.group.position.x, 0.25, school.model.group.position.z);
      school.halo.material.opacity = selected ? 0.75 : 0.14;
      let index = 0;
      for (const follower of school.followers.values()) {
        const row = Math.floor(index / 2) + 1;
        const lateral = (index % 2 === 0 ? -1 : 1) * (0.12 + row * 0.08);
        swim(follower.model, school, school.phase - 0.22 - row * 0.16, lateral, movement);
        index += 1;
      }
    }
    plants.update(time, 1, flow * 0.65);
    waterMaterial.uniforms.time.value = time * flow;
    causticMaterial.uniforms.time.value = time;
    controls.update();
    renderer.render(scene, camera);
    frame = requestAnimationFrame(animate);
  }
  frame = requestAnimationFrame(animate);

  return {
    setSessions,
    select(id: string | null) { selectedId = id; },
    setPaused(value: boolean) { paused = value; },
    setDisconnected(value: boolean) { disconnected = value; },
    setFlow(value: number) { flow = value; },
    setLight(value: number) { sun.intensity = value * 3.2; renderer.toneMappingExposure = 0.85 + value * 0.2; },
    resetView,
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      resize.disconnect();
      renderer.domElement.removeEventListener("pointerdown", pointerDown);
      renderer.domElement.removeEventListener("pointerup", pointerUp);
      controls.dispose();
      for (const school of schools.values()) removeSchool(school);
      schools.clear();
      plants.dispose();
      for (const resource of resources) resource.dispose();
      environment.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
