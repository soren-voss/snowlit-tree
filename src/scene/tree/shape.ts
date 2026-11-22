import { MathUtils, Vector3 } from 'three';

export const TREE_TOP = 8.08;
export const TREE_RADIUS = 3.13;
export const CROWN_BASE = 1.48;
export const GIFT_RING = { inner: TREE_RADIUS * 0.6, outer: TREE_RADIUS * 1.6 };
export const TAU = Math.PI * 2;

export function crownRadius(y: number): number {
  const t = MathUtils.clamp((y - CROWN_BASE) / (TREE_TOP - CROWN_BASE), 0, 1);
  return 0.05 + (TREE_RADIUS - 0.05) * ((1 - t) ** 1.07 + 0.052 * Math.sin(Math.PI * t));
}

export function crownCenter(y: number, result: Vector3): Vector3 {
  const t = y / TREE_TOP;
  return result.set(-0.16 * t + 0.119 * Math.sin(t * 4.1), y, 0.13 * t * t);
}

export function crownSurface(y: number, angle: number, margin: number, result = new Vector3()): Vector3 {
  const contour = 1 + 0.058 * Math.sin(angle * 3 + y * 1.07) + 0.029 * Math.sin(angle * 7 - y * 1.91);
  const r = crownRadius(y) * contour + margin;
  crownCenter(y, result);
  result.x += Math.sin(angle) * r;
  result.z += Math.cos(angle) * r;
  return result;
}
