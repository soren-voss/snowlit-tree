import { MathUtils, Vector3 } from 'three';

export const TREE_TOP = 8.08;
export const TREE_RADIUS = 3.13;
export const CROWN_BASE = .46;
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

export type CrownSurface = (y: number, angle: number, inset: number, target?: Vector3) => Vector3;

const SLICES = 64;
const LEVELS = 64;
const HEIGHT_STEP = TREE_TOP / LEVELS;
const angleIndex = (angle: number) => MathUtils.euclideanModulo(angle, TAU) / TAU * SLICES;
const cell = (y: number, a: number) => y * SLICES + MathUtils.euclideanModulo(a, SLICES);

export function measureCrown(points: Vector3[]): CrownSurface {
  const measured = new Float32Array((LEVELS + 1) * SLICES);
  const center = new Vector3();
  for (const point of points) {
    crownCenter(point.y, center);
    const x = point.x - center.x;
    const z = point.z - center.z;
    const y = MathUtils.clamp(Math.round(point.y / HEIGHT_STEP), 0, LEVELS);
    const a = Math.round(angleIndex(Math.atan2(x, z)));
    const index = cell(y, a);
    measured[index] = Math.max(measured[index], Math.hypot(x, z));
  }
  const envelope = measured.slice();
  for (let y = 0; y <= LEVELS; y++) {
    for (let a = 0; a < SLICES; a++) {
      const height = y * HEIGHT_STEP;
      let reach = crownRadius(height) * .63 * MathUtils.smoothstep(height, .15, .69);
      for (let v = Math.max(0, y - 2); v <= Math.min(LEVELS, y + 2); v++) {
        for (let u = a - 2; u <= a + 2; u++) {
          reach = Math.max(reach, measured[cell(v, u)] - .10 * Math.abs(v - y) - .052 * Math.abs(u - a));
        }
      }
      envelope[cell(y, a)] = Math.max(.04, reach - .028);
    }
  }
  return (height, angle, inset, target = new Vector3()) => {
    const level = MathUtils.clamp(height / HEIGHT_STEP, 0, LEVELS - 1e-5);
    const bearing = angleIndex(angle);
    const y = Math.floor(level), a = Math.floor(bearing);
    const r0 = MathUtils.lerp(envelope[cell(y, a)], envelope[cell(y, a + 1)], bearing - a);
    const r1 = MathUtils.lerp(envelope[cell(y + 1, a)], envelope[cell(y + 1, a + 1)], bearing - a);
    const radius = Math.max(.014, MathUtils.lerp(r0, r1, level - y) - inset);
    crownCenter(height, target);
    target.x += Math.sin(angle) * radius;
    target.z += Math.cos(angle) * radius;
    return target;
  };
}
