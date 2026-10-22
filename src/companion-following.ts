import { MathUtils, Vector2 } from "three";
import { TANK_HALF_WIDTH } from "./aquarium-layout.ts";

const LIMIT = TANK_HALF_WIDTH - .2;

export function createCompanionFollowing() {
  const position = new Vector2(1.15, 3.35);
  let side = 1;
  let distance = 0;
  let heading = 0;
  let velocity = 0;
  return {
    position,
    get distance() { return distance; },
    get heading() { return heading; },
    get speed() { return Math.abs(velocity); },
    update(playerX: number, direction: number, delta: number) {
      if (direction) side = -Math.sign(direction);
      const elapsed = Math.max(0, delta);
      const target = MathUtils.clamp(playerX + side * 1.15, -LIMIT, LIMIT);
      const offset = target - position.x;
      distance = 0;
      if (Math.abs(offset) < .015 && Math.abs(velocity) < .15) { velocity = 0; return; }
      const desired = MathUtils.clamp(offset * 7, -5.2, 5.2);
      const slowing = velocity * desired < 0 || Math.abs(desired) < Math.abs(velocity);
      const change = (slowing ? 32 : 24) * elapsed;
      const previous = velocity;
      velocity += MathUtils.clamp(desired - velocity, -change, change);
      let x = MathUtils.clamp(position.x + (previous + velocity) * .5 * elapsed, -LIMIT, LIMIT);
      if ((target - position.x) * (target - x) <= 0) { x = target; velocity = 0; }
      distance = Math.abs(x - position.x);
      if (distance > 1e-6) heading = -Math.sign(x - position.x) * Math.PI / 2;
      position.x = x;
    },
  };
}
