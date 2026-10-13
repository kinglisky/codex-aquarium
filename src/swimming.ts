import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

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
const BOUNDS = new THREE.Box3(new THREE.Vector3(-9, .55, -6), new THREE.Vector3(9, 8.35, 0));
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
  for (const mesh of obstacles) {
    mesh.updateWorldMatrix(true, false);
    const attribute = mesh.geometry.getAttribute('position');
    const points = new Float32Array(attribute.count * 3);
    const point = new THREE.Vector3();
    for (let index = 0; index < attribute.count; index += 1) {
      point.fromBufferAttribute(attribute, index).applyMatrix4(mesh.matrixWorld).toArray(points, index * 3);
    }
    const collider = RAPIER.ColliderDesc.convexHull(points);
    if (collider) staticColliders.push(world.createCollider(collider));
  }

  function waypoint(swimmer: Swimmer) {
    const angle = swimmer.waypoint * Math.PI / 4;
    const lane = random(swimmer.seed + 1);
    swimmer.goal.set(Math.cos(angle) * (5.7 + lane * .7), 2.2 + random(swimmer.seed + 2) * 4 + Math.sin(angle * 1.7) * .35, -3 + Math.sin(angle) * (1.3 + lane * .4));
    const margin = swimmer.turningRadius + NAVIGATION_GAP;
    swimmer.goal.clamp(BOUNDS.min.clone().addScalar(margin), BOUNDS.max.clone().addScalar(-margin));
  }

  function addFish(id: string, size: THREE.Vector3, seed: number, options: SpawnOptions = {}) {
    const existing = fish.get(id);
    if (existing) return existing;
    const extent = size.clone().multiplyScalar(.5).addScalar(CLEARANCE);
    const shape = new RAPIER.Cuboid(extent.x, extent.y, extent.z);
    const navigation = new RAPIER.Cuboid(extent.x + .12, extent.y + .12, extent.z + .12);
    const position = new THREE.Vector3();
    const rotation = options.quaternion?.clone() ?? new THREE.Quaternion();
    const spawnBounds = new THREE.Box3();
    const transform = new THREE.Matrix4();
    let available = false;
    for (let attempt = 0; attempt < 512; attempt += 1) {
      const key = seed + attempt * 7919;
      position.set(-7 + random(key) * 14, 1.9 + random(key + 137) * 5, -4.9 + random(key + 391) * 3.8);
      if (attempt === 0 && options.position) position.copy(options.position);
      if (!options.quaternion) rotation.setFromAxisAngle(UP, random(key + 3) > .5 ? 0 : Math.PI);
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
      if ([...fish.values()].some(other => navigation.intersectsShape(position, rotation, other.navigation, other.position, other.quaternion))) continue;
      if (staticColliders.some(collider => collider.intersectsShape(navigation, position, rotation))) continue;
      const occupied = [...staticColliders, ...[...fish.values()].map(value => value.collider)].some(collider => collider.intersectsShape(shape, position, rotation));
      if (occupied) continue;
      available = true;
      break;
    }
    // 空间不足时等待后续快照重试，不能把新鱼塞进已有鱼体。
    if (!available) return;
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
    const departing = (shape: RAPIER.Shape, position: RAPIER.Vector, orientation: RAPIER.Rotation, otherVelocity: RAPIER.Vector) => {
      const contact = swimmer.navigation.contactShape(swimmer.position, rotation, shape, position, orientation, NAVIGATION_GAP);
      return contact && relativeVelocity.copy(movement).sub(otherVelocity).dot(contact.normal1) <= .01;
    };
    let hit = world.castShape(swimmer.position, rotation, movement, swimmer.navigation, NAVIGATION_GAP, LOOKAHEAD, false, RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC);
    if (hit?.time_of_impact === 0 && departing(hit.collider.shape, hit.collider.translation(), hit.collider.rotation(), { x: 0, y: 0, z: 0 })) {
      hit = world.castShape(swimmer.position, rotation, movement, swimmer.navigation, NAVIGATION_GAP, LOOKAHEAD, false, RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC, undefined, swimmer.collider, swimmer.body,
        collider => !departing(collider.shape, collider.translation(), collider.rotation(), { x: 0, y: 0, z: 0 }));
    }
    let impact = hit?.time_of_impact ?? LOOKAHEAD;
    const travel = movement.length() * LOOKAHEAD;
    for (const other of fish.values()) {
      if (other === swimmer) continue;
      const reach = swimmer.turningRadius + other.turningRadius + travel + (other.speed + .02) * LOOKAHEAD + NAVIGATION_GAP;
      if (swimmer.position.distanceToSquared(other.position) > reach * reach) continue;
      const encounter = swimmer.navigation.castShape(swimmer.position, rotation, movement, other.navigation, other.position, other.quaternion, other.body.linvel(), NAVIGATION_GAP, impact, false);
      if (!encounter) continue;
      if (encounter.time_of_impact === 0 && departing(other.navigation, other.position, other.quaternion, other.body.linvel())) continue;
      impact = Math.min(impact, encounter.time_of_impact);
    }
    return impact;
  }

  function steer(swimmer: Swimmer) {
    const leader = swimmer.leader;
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
    if (!leader && swimmer.position.distanceTo(swimmer.goal) < 1.7) {
      swimmer.waypoint += 1;
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
      const score = candidate.dot(desired) * .65 + clearance * 8 + candidate.dot(swimmer.heading) * .35 + candidate.dot(forward) * .2;
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
      const targetSpeed = swimmer.leader
        ? Math.min(Math.max(cruise, swimmer.leader.speed) * 1.85, swimmer.goal.distanceTo(swimmer.position) * .9)
        : cruise * pace;
      const escaping = time < swimmer.escapeUntil;
      const speed = Math.min(escaping ? .45 : targetSpeed * THREE.MathUtils.clamp(alignment + .3, 0, 1), swimmer.speedLimit);
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
    world, addFish,
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
