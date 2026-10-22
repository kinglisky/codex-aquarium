import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { TANK_HALF_WIDTH } from './aquarium-layout.ts';

const STEP = 1 / 120;
const CLEARANCE = .08;
const LOOKAHEAD = 3;
const NAVIGATION_GAP = .18;
const UP = new THREE.Vector3(0, 1, 0);
const ESCAPE_DIRECTIONS: THREE.Vector3[] = [];
for (const x of [-1, 0, 1]) for (const y of [-1, 0, 1]) for (const z of [-1, 0, 1]) {
  if (x === 0 && y === 0 && z === 0) continue;
  ESCAPE_DIRECTIONS.push(new THREE.Vector3(x, y, z).normalize());
}
const BOUNDS = new THREE.Box3(new THREE.Vector3(-TANK_HALF_WIDTH + .25, .55, -6), new THREE.Vector3(TANK_HALF_WIDTH - .25, 8.35, 0));
let initialization: Promise<void> | undefined;

export function initSwimming() {
  return initialization ??= RAPIER.init();
}

export interface SwimmingFish {
  id: string;
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  size: THREE.Vector3;
  speed: number;
  turnRate: number;
  activity: number;
  destination?: THREE.Vector3;
}

interface Swimmer extends SwimmingFish {
  seed: number;
  leader?: SwimmingFish;
  slot: number;
  goal: THREE.Vector3;
  heading: THREE.Vector3;
  waypoint: number;
  steeringAt: number;
  speedLimit: number;
  navigation: RAPIER.Cuboid;
  turningRadius: number;
  stalledFor: number;
  escapeUntil: number;
}

interface SpawnOptions {
  leader?: SwimmingFish;
  slot?: number;
  position?: THREE.Vector3;
  quaternion?: THREE.Quaternion;
}

function random(seed: number) {
  const value = Math.sin(seed * .00137 + 13.71) * 43758.5453;
  return value - Math.floor(value);
}

export function createSwimmingWorld(obstacles: THREE.Mesh[] = []) {
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  world.timestep = STEP;
  world.numSolverIterations = 8;
  world.maxCcdSubsteps = 4;
  const fish = new Map<string, Swimmer>();
  const staticColliders: RAPIER.Collider[] = [];
  let accumulator = 0;
  let time = 0;

  function wall(size: THREE.Vector3, position: THREE.Vector3) {
    staticColliders.push(world.createCollider(RAPIER.ColliderDesc.cuboid(size.x, size.y, size.z).setTranslation(position.x, position.y, position.z)));
  }
  const center = BOUNDS.getCenter(new THREE.Vector3());
  const half = BOUNDS.getSize(new THREE.Vector3()).multiplyScalar(.5);
  for (const axis of ['x', 'y', 'z'] as const) {
    for (const side of [-1, 1]) {
      const size = half.clone().addScalar(.5);
      size[axis] = .5;
      const position = center.clone();
      position[axis] += side * (half[axis] + .5);
      wall(size, position);
    }
  }
  const wallColliderCount = staticColliders.length;
  function createObstacles(meshes: THREE.Mesh[]) {
    const colliders: RAPIER.Collider[] = [];
    for (const mesh of meshes) {
      mesh.updateWorldMatrix(true, false);
      if (mesh.userData.aquariumCollider === 'box') {
        if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
        const bounds = mesh.geometry.boundingBox;
        if (!bounds) continue;
        const position = bounds.getCenter(new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
        const scale = new THREE.Vector3();
        const rotation = new THREE.Quaternion();
        mesh.matrixWorld.decompose(new THREE.Vector3(), rotation, scale);
        const half = bounds.getSize(new THREE.Vector3()).multiply(scale).multiplyScalar(.5);
        const collider = RAPIER.ColliderDesc.cuboid(Math.abs(half.x), Math.abs(half.y), Math.abs(half.z))
          .setTranslation(position.x, position.y, position.z).setRotation(rotation);
        colliders.push(world.createCollider(collider));
        continue;
      }
      const attribute = mesh.geometry.getAttribute('position');
      const points = new Float32Array(attribute.count * 3);
      const point = new THREE.Vector3();
      for (let index = 0; index < attribute.count; index += 1) {
        point.fromBufferAttribute(attribute, index).applyMatrix4(mesh.matrixWorld).toArray(points, index * 3);
      }
      const collider = RAPIER.ColliderDesc.convexHull(points);
      if (collider) colliders.push(world.createCollider(collider));
    }
    return colliders;
  }
  staticColliders.push(...createObstacles(obstacles));

  function waypoint(swimmer: Swimmer) {
    const angle = swimmer.waypoint * Math.PI / 4;
    const lane = random(swimmer.seed + 1);
    swimmer.goal.set(Math.cos(angle) * (TANK_HALF_WIDTH - 2) * (.9 + lane * .1),
      2.2 + random(swimmer.seed + 2) * 4 + Math.sin(angle * 1.7) * .35,
      -3 + Math.sin(angle) * (1.3 + lane * .4));
    const margin = swimmer.turningRadius + NAVIGATION_GAP;
    swimmer.goal.clamp(BOUNDS.min.clone().addScalar(margin), BOUNDS.max.clone().addScalar(-margin));
  }

  function findPose(size: THREE.Vector3, seed: number, options: SpawnOptions, exclude?: Swimmer) {
    const extent = size.clone().multiplyScalar(.5).addScalar(CLEARANCE);
    const navigation = new RAPIER.Cuboid(extent.x + .12, extent.y + .12, extent.z + .12);
    const position = new THREE.Vector3();
    const rotation = options.quaternion?.clone() ?? new THREE.Quaternion();
    const spawnBounds = new THREE.Box3();
    const transform = new THREE.Matrix4();
    for (let attempt = 0; attempt < 512; attempt += 1) {
      const key = seed + attempt * 7919;
      const radius = TANK_HALF_WIDTH - (attempt < 384 ? 2 : 1);
      position.set((random(key) * 2 - 1) * radius, 1.9 + random(key + 137) * 5,
        -3 + (random(key + 391) - .5) * 3.8);
      if (attempt === 0 && options.position) position.copy(options.position);
      if (!options.quaternion) rotation.setFromAxisAngle(UP, position.x < 0 ? 0 : Math.PI);
      if (options.leader && attempt < 24 && !options.position) {
        rotation.copy(options.leader.quaternion);
        const forward = new THREE.Vector3(1, 0, 0).applyQuaternion(rotation);
        const row = Math.floor((options.slot ?? 0) / 2);
        const distance = (options.leader.size.x + size.x) * .5 + .6 + row * (size.x + .3);
        position.copy(options.leader.position).addScaledVector(forward, -distance - attempt * .05);
        position.y += (attempt % 3 - 1) * .3;
        const lateral = ((options.slot ?? 0) % 2 ? -1 : 1) * (.5 + attempt * .08);
        position.x -= forward.z * lateral;
        position.z += forward.x * lateral;
      }
      spawnBounds.set(extent.clone().negate(), extent).applyMatrix4(transform.compose(position, rotation, new THREE.Vector3(1, 1, 1)));
      if (!BOUNDS.containsBox(spawnBounds)) continue;
      if ([...fish.values()].some(other => other !== exclude && navigation.intersectsShape(position, rotation, other.navigation, other.position, other.quaternion))) continue;
      if (staticColliders.some(collider => collider.intersectsShape(navigation, position, rotation))) continue;
      return { position, rotation };
    }
  }

  function addFish(id: string, size: THREE.Vector3, seed: number, options: SpawnOptions = {}) {
    const existing = fish.get(id);
    if (existing) return existing;
    const pose = findPose(size, seed, options);
    // 空间不足时等待后续快照重试，不能把新鱼塞进已有鱼体。
    if (!pose) return;
    const { position, rotation } = pose;
    const extent = size.clone().multiplyScalar(.5).addScalar(CLEARANCE);
    const navigation = new RAPIER.Cuboid(extent.x + .12, extent.y + .12, extent.z + .12);
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(position.x, position.y, position.z).setRotation(rotation).setCanSleep(false).setCcdEnabled(true).setAngularDamping(4));
    const collider = world.createCollider(RAPIER.ColliderDesc.cuboid(extent.x, extent.y, extent.z).setMass(1).setFriction(0).setRestitution(0).setContactSkin(.02), body);
    const swimmer: Swimmer = {
      id, body, collider, position, quaternion: rotation, size: size.clone(), seed,
      leader: options.leader, slot: options.slot ?? 0, speed: 0, turnRate: 0, activity: 1,
      goal: new THREE.Vector3(), heading: new THREE.Vector3(1, 0, 0).applyQuaternion(rotation),
      waypoint: Math.floor(random(seed + 4) * 8), steeringAt: -1, speedLimit: 0, navigation, turningRadius: extent.length(), stalledFor: 0, escapeUntil: 0,
    };
    waypoint(swimmer);
    fish.set(id, swimmer);
    return swimmer;
  }

  function setObstacles(meshes: THREE.Mesh[]) {
    const next = createObstacles(meshes);
    const previous = staticColliders.splice(wallColliderCount, staticColliders.length, ...next);
    const moved: { swimmer: Swimmer; position: THREE.Vector3; rotation: THREE.Quaternion }[] = [];
    for (const swimmer of fish.values()) {
      if (!next.some(collider => collider.intersectsShape(swimmer.collider.shape, swimmer.position, swimmer.quaternion))) continue;
      const pose = findPose(swimmer.size, swimmer.seed, { quaternion: swimmer.quaternion }, swimmer)
        ?? findPose(swimmer.size, swimmer.seed, {}, swimmer);
      if (!pose) {
        for (const entry of moved) {
          entry.swimmer.position.copy(entry.position);
          entry.swimmer.quaternion.copy(entry.rotation);
        }
        staticColliders.splice(wallColliderCount, staticColliders.length, ...previous);
        for (const collider of next) world.removeCollider(collider, false);
        throw new Error('当前鱼群暂时无法安全切换造景');
      }
      moved.push({ swimmer, position: swimmer.position.clone(), rotation: swimmer.quaternion.clone() });
      swimmer.position.copy(pose.position);
      swimmer.quaternion.copy(pose.rotation);
    }
    for (const collider of previous) world.removeCollider(collider, false);
    for (const { swimmer } of moved) {
      swimmer.body.setTranslation(swimmer.position, true);
      swimmer.body.setRotation(swimmer.quaternion, true);
      swimmer.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      swimmer.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      swimmer.heading.set(1, 0, 0).applyQuaternion(swimmer.quaternion);
      swimmer.speed = 0;
      swimmer.turnRate = 0;
      swimmer.speedLimit = 0;
      swimmer.stalledFor = 0;
      swimmer.escapeUntil = 0;
      swimmer.steeringAt = -1;
    }
    world.propagateModifiedBodyPositionsToColliders();
  }

  const forward = new THREE.Vector3();
  const desired = new THREE.Vector3();
  const candidate = new THREE.Vector3();
  const heading = new THREE.Vector3();
  const velocity = new THREE.Vector3();
  const change = new THREE.Vector3();
  const targetRotation = new THREE.Quaternion();
  const probeRotation = new THREE.Quaternion();
  const halfwayRotation = new THREE.Quaternion();
  const relativeVelocity = new THREE.Vector3();
  const errorRotation = new THREE.Quaternion();
  const euler = new THREE.Euler(0, 0, 0, 'YZX');
  function timeToObstacle(swimmer: Swimmer, movement: THREE.Vector3, rotation = swimmer.quaternion) {
    // 让路时收回额外的导航包络，避免靠近玻璃与叶丛时被虚拟安全区夹住。
    const escaping = time < swimmer.escapeUntil;
    const sensor = escaping ? swimmer.collider.shape : swimmer.navigation;
    const gap = escaping ? CLEARANCE * .5 : NAVIGATION_GAP;
    const departing = (shape: RAPIER.Shape, position: RAPIER.Vector, orientation: RAPIER.Rotation, otherVelocity: RAPIER.Vector) => {
      const contact = sensor.contactShape(swimmer.position, rotation, shape, position, orientation, gap);
      return contact && relativeVelocity.copy(movement).sub(otherVelocity).dot(contact.normal1) <= .01;
    };
    let hit = world.castShape(swimmer.position, rotation, movement, sensor, gap, LOOKAHEAD, false, RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC);
    if (hit?.time_of_impact === 0 && departing(hit.collider.shape, hit.collider.translation(), hit.collider.rotation(), { x: 0, y: 0, z: 0 })) {
      hit = world.castShape(swimmer.position, rotation, movement, sensor, gap, LOOKAHEAD, false, RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC, undefined, swimmer.collider, swimmer.body,
        collider => !departing(collider.shape, collider.translation(), collider.rotation(), { x: 0, y: 0, z: 0 }));
    }
    let impact = hit?.time_of_impact ?? LOOKAHEAD;
    const travel = movement.length() * LOOKAHEAD;
    for (const other of fish.values()) {
      if (other === swimmer) continue;
      const reach = swimmer.turningRadius + other.turningRadius + travel + (other.speed + .02) * LOOKAHEAD + NAVIGATION_GAP;
      if (swimmer.position.distanceToSquared(other.position) > reach * reach) continue;
      const otherSensor = escaping ? other.collider.shape : other.navigation;
      const encounter = sensor.castShape(swimmer.position, rotation, movement, otherSensor, other.position, other.quaternion, other.body.linvel(), gap, impact, false);
      if (!encounter) continue;
      if (encounter.time_of_impact === 0 && departing(otherSensor, other.position, other.quaternion, other.body.linvel())) continue;
      impact = Math.min(impact, encounter.time_of_impact);
    }
    return impact;
  }

  function steer(swimmer: Swimmer) {
    const leader = swimmer.destination ? undefined : swimmer.leader;
    if (swimmer.destination) swimmer.goal.copy(swimmer.destination);
    if (leader) {
      const row = Math.floor(swimmer.slot / 2) + 1;
      forward.set(1, 0, 0).applyQuaternion(leader.quaternion);
      const spacing = (leader.size.x + swimmer.size.x) * .5 + .6 + (row - 1) * (.3 + swimmer.size.x);
      swimmer.goal.copy(leader.position).addScaledVector(forward, -spacing);
      swimmer.goal.x -= forward.z * (swimmer.slot % 2 ? -1 : 1) * (.35 + row * .18);
      swimmer.goal.z += forward.x * (swimmer.slot % 2 ? -1 : 1) * (.35 + row * .18);
      const margin = swimmer.turningRadius + NAVIGATION_GAP;
      swimmer.goal.clamp(BOUNDS.min.clone().addScalar(margin), BOUNDS.max.clone().addScalar(-margin));
    }
    if (!leader && !swimmer.destination) {
      if (swimmer.position.distanceTo(swimmer.goal) < 1.7) swimmer.waypoint += 1;
      waypoint(swimmer);
    }
    desired.subVectors(swimmer.goal, swimmer.position).normalize();
    desired.y = THREE.MathUtils.clamp(desired.y, -.35, .35);
    desired.normalize();
    forward.set(1, 0, 0).applyQuaternion(swimmer.quaternion);
    const probeSpeed = Math.max(swimmer.speed, 1.2);
    velocity.copy(forward).multiplyScalar(probeSpeed);
    // 实际前进方向独立探测，不能把“准备绕行的方向安全”当作“现在可以继续加速”。
    const distance = timeToObstacle(swimmer, velocity) * probeSpeed;
    swimmer.speedLimit = Math.sqrt(2 * .9 * Math.max(0, distance - .1));
    let bestScore = -Infinity;
    function considerDirection() {
      velocity.copy(candidate).multiplyScalar(probeSpeed);
      probeRotation.setFromEuler(euler.set(0, Math.atan2(-candidate.z, candidate.x), Math.asin(candidate.y), 'YZX'));
      halfwayRotation.copy(swimmer.quaternion).slerp(probeRotation, .5);
      const straight = timeToObstacle(swimmer, velocity);
      const clearance = (time < swimmer.escapeUntil ? straight : Math.min(straight, timeToObstacle(swimmer, velocity, halfwayRotation), timeToObstacle(swimmer, velocity, probeRotation))) / LOOKAHEAD;
      const score = candidate.dot(desired) * (leader ? 2.2 : .65) + clearance * 8 + candidate.dot(swimmer.heading) * .35 + candidate.dot(forward) * .2;
      if (score <= bestScore) return;
      bestScore = score;
      heading.copy(candidate);
    }
    candidate.copy(forward);
    considerDirection();
    candidate.copy(swimmer.heading);
    considerDirection();
    if (time < swimmer.escapeUntil) {
      for (const direction of ESCAPE_DIRECTIONS) {
        candidate.copy(direction);
        considerDirection();
      }
    }
    const angles = time < swimmer.escapeUntil ? [] : [0, .45, -.45, .9, -.9, 1.5, -1.5, Math.PI];
    for (const angle of angles) {
      for (const lift of [0, .45, -.45]) {
        candidate.copy(desired).applyAxisAngle(UP, angle);
        const pitch = THREE.MathUtils.clamp(candidate.y + lift, -.55, .55);
        candidate.y = 0;
        candidate.normalize().multiplyScalar(Math.sqrt(1 - pitch * pitch));
        candidate.y = pitch;
        considerDirection();
      }
    }
    swimmer.heading.copy(heading);
    if (time < swimmer.escapeUntil) {
      velocity.copy(heading).multiplyScalar(probeSpeed);
      swimmer.speedLimit = Math.sqrt(2 * .9 * Math.max(0, timeToObstacle(swimmer, velocity) * probeSpeed - .1));
    }
    swimmer.steeringAt = time + .09 + random(swimmer.seed) * .02;
  }

  function step() {
    time += STEP;
    for (const swimmer of fish.values()) {
      swimmer.stalledFor = swimmer.speed < .08 ? swimmer.stalledFor + STEP : 0;
      if (swimmer.stalledFor > .8 && time >= swimmer.escapeUntil) {
        swimmer.escapeUntil = time + 1.5;
        swimmer.steeringAt = -1;
        swimmer.stalledFor = 0;
      }
      if (time >= swimmer.steeringAt) steer(swimmer);
      forward.set(1, 0, 0).applyQuaternion(swimmer.quaternion);
      const alignment = forward.dot(swimmer.heading);
      const cruise = (.65 + Math.sqrt(swimmer.size.x) * .25) * (.4 + swimmer.activity * .6);
      const pace = 1 + Math.sin(time * .65 + swimmer.seed % 31) * .09;
      const targetSpeed = swimmer.leader && !swimmer.destination
        ? Math.min(Math.max(cruise, swimmer.leader.speed) * 1.85, swimmer.goal.distanceTo(swimmer.position) * .9)
        : cruise * pace;
      const pursuit = swimmer.leader && !swimmer.destination
        ? THREE.MathUtils.clamp(forward.dot(desired.subVectors(swimmer.goal, swimmer.position).normalize()) + .2, .1, 1)
        : 1;
      const escaping = time < swimmer.escapeUntil;
      const speed = Math.min(escaping ? .45 : targetSpeed * pursuit * THREE.MathUtils.clamp(alignment + .3, 0, 1), swimmer.speedLimit);
      // 狭窄处先短暂侧移或后退让出转身空间，再恢复向前巡游。
      velocity.copy(escaping ? swimmer.heading : forward).multiplyScalar(speed);
      change.copy(velocity).sub(swimmer.body.linvel()).clampLength(0, 1.2 * STEP);
      velocity.copy(swimmer.body.linvel()).add(change);
      swimmer.body.setLinvel(velocity, true);
      targetRotation.setFromEuler(euler.set(0, Math.atan2(-swimmer.heading.z, swimmer.heading.x), Math.asin(THREE.MathUtils.clamp(swimmer.heading.y, -.55, .55)), 'YZX'));
      errorRotation.copy(swimmer.quaternion).invert().premultiply(targetRotation);
      if (errorRotation.w < 0) errorRotation.set(-errorRotation.x, -errorRotation.y, -errorRotation.z, -errorRotation.w);
      const angle = 2 * Math.acos(THREE.MathUtils.clamp(errorRotation.w, -1, 1));
      change.set(errorRotation.x, errorRotation.y, errorRotation.z).normalize().multiplyScalar(Math.min(1.15, angle * 2.4));
      probeRotation.copy(swimmer.quaternion).rotateTowards(targetRotation, change.length() * .12);
      const turningIntoObstacle = world.intersectionWithShape(swimmer.position, probeRotation, swimmer.collider.shape, undefined, undefined, swimmer.collider, swimmer.body);
      if (turningIntoObstacle) change.set(0, 0, 0);
      swimmer.body.setAngvel(change, true);
    }
    world.step();
    for (const swimmer of fish.values()) {
      swimmer.position.copy(swimmer.body.translation());
      swimmer.quaternion.copy(swimmer.body.rotation()).normalize();
      swimmer.speed = velocity.copy(swimmer.body.linvel()).length();
      swimmer.turnRate = swimmer.body.angvel().y;
    }
  }

  return {
    world, addFish, setObstacles,
    removeFish(id: string) {
      const swimmer = fish.get(id);
      if (!swimmer) return;
      world.removeRigidBody(swimmer.body);
      fish.delete(id);
    },
    update(delta: number) {
      if (delta <= 0) return;
      accumulator += Math.min(delta, .1);
      while (accumulator + 1e-9 >= STEP) {
        step();
        accumulator = Math.max(0, accumulator - STEP);
      }
    },
    dispose() { fish.clear(); world.free(); },
  };
}
