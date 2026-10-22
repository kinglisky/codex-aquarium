import { MathUtils } from "three";
import type { PerspectiveCamera } from "three";
import { GALLERY_FLOOR, TANK_DEPTH, TANK_HALF_WIDTH } from "./aquarium-layout.ts";

export function cameraMaxDistance(camera: PerspectiveCamera): number {
  const halfFov = Math.tan(MathUtils.degToRad(camera.getEffectiveFOV() / 2));
  return Math.min(28.5, (GALLERY_FLOOR.width - 2) / (2 * halfFov * camera.aspect));
}

export function cameraAnchorForViewer(viewerX: number, camera: PerspectiveCamera): number {
  const halfView = Math.tan(MathUtils.degToRad(camera.getEffectiveFOV() / 2))
    * Math.max(0, camera.position.z + TANK_DEPTH / 2) * camera.aspect;
  const limit = Math.max(0, TANK_HALF_WIDTH - halfView + .6);
  return MathUtils.clamp(viewerX, -limit, limit);
}
