import { MathUtils, Vector2 } from "three";
import { VISITOR_DEPTH, VISITOR_LIMIT } from "./aquarium-layout.ts";

export const VISITOR_KEYS = new Set(["KeyA", "KeyD", "ArrowLeft", "ArrowRight"]);
const SPEED = 4;
const ACCELERATION = 18;
const BRAKING = 32;
const LIMIT = VISITOR_LIMIT;
const DEPTH = VISITOR_DEPTH;

export function createVisitorMovement() {
  const position = new Vector2(0, DEPTH);
  let target: number | null = null;
  let heading = 0;
  let distance = 0;
  let velocity = 0;

  function moveTo(x: number, _z: number) {
    target = MathUtils.clamp(x, -LIMIT, LIMIT);
  }

  return {
    position,
    get heading() { return heading; },
    get distance() { return distance; },
    get speed() { return Math.abs(velocity); },
    moveTo,
    walk(x: number, _z: number) {
      moveTo(position.x + MathUtils.clamp(x, -1, 1) * 1.2, DEPTH);
    },
    stop() { target = null; velocity = 0; distance = 0; },
    update(delta: number, keys: ReadonlySet<string>) {
      const elapsed = Math.max(0, delta);
      const left = keys.has("ArrowLeft") || keys.has("KeyA");
      const right = keys.has("ArrowRight") || keys.has("KeyD");
      const keyboard = left || right;
      if (keyboard) target = null;
      const offset = keyboard ? Number(right) - Number(left) : (target ?? position.x) - position.x;
      const desired = Math.sign(offset) * (keyboard ? SPEED : Math.min(SPEED, Math.sqrt(2 * BRAKING * Math.abs(offset))));
      const slowing = velocity * desired < 0 || Math.abs(desired) < Math.abs(velocity);
      const change = (slowing ? BRAKING : ACCELERATION) * elapsed;
      const previous = velocity;
      velocity += MathUtils.clamp(desired - velocity, -change, change);
      let x = MathUtils.clamp(position.x + (previous + velocity) * .5 * elapsed, -LIMIT, LIMIT);
      if (target !== null && (target - position.x) * (target - x) <= 0) {
        x = target;
        target = null;
        velocity = 0;
      }
      if (Math.abs(x) === LIMIT && Math.sign(x) === Math.sign(velocity)) velocity = 0;
      distance = Math.abs(x - position.x);
      if (distance > 1e-6) heading = -Math.sign(x - position.x) * Math.PI / 2;
      position.set(x, DEPTH);
    },
  };
}
