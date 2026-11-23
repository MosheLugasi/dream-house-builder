import type { Vec2 } from './types';

/**
 * Stair geometry shared by the 3D builder, the plan symbol and the walk controller.
 *
 * Local frame: x across (-w/2 … w/2), z along (-d/2 … d/2). You step ON at z = -d/2.
 *  - 'straight': one flight running toward +z; you step OFF upstairs at z = +d/2.
 *  - 'u': flight 1 on the x < 0 half runs toward +z, a landing spans the far end, flight 2 on the
 *    x > 0 half runs back toward -z; you step OFF upstairs at z = -d/2 on the x > 0 half.
 */
export type StairType = 'straight' | 'u';

export const U_LANDING = 1.0;

/** Fraction (0…1) of the total rise at a local point, or null outside the footprint. */
export function stairFraction(type: StairType, w: number, d: number, x: number, z: number): number | null {
  if (Math.abs(x) > w / 2 || Math.abs(z) > d / 2) return null;
  if (type === 'straight') return Math.max(0, Math.min(1, (z + d / 2) / d));
  const flight = d - U_LANDING;
  if (z > d / 2 - U_LANDING) return 0.5;
  const t = Math.max(0, Math.min(1, (z + d / 2) / flight));
  return x < 0 ? 0.5 * t : 1 - 0.5 * t;
}

export interface StairBarriers {
  /** always solid (while the walker is within the stair's height range) */
  solid: [Vec2, Vec2][];
  /** open only for someone standing at the lower floor */
  entry: [Vec2, Vec2];
  /** open only for someone standing at the upper floor */
  exit: [Vec2, Vec2];
}

/** Barrier segments in the local frame (Vec2.y is local z). */
export function stairBarriers(type: StairType, w: number, d: number): StairBarriers {
  const hw = w / 2;
  const hd = d / 2;
  const p = (x: number, z: number): Vec2 => ({ x, y: z });
  if (type === 'straight') {
    return {
      solid: [
        [p(-hw, -hd), p(-hw, hd)],
        [p(hw, -hd), p(hw, hd)],
      ],
      entry: [p(-hw, -hd), p(hw, -hd)],
      exit: [p(-hw, hd), p(hw, hd)],
    };
  }
  return {
    solid: [
      [p(-hw, -hd), p(-hw, hd)],
      [p(hw, -hd), p(hw, hd)],
      [p(-hw, hd), p(hw, hd)],
      [p(0, -hd), p(0, hd - U_LANDING)],
    ],
    entry: [p(-hw, -hd), p(0, -hd)],
    exit: [p(0, -hd), p(hw, -hd)],
  };
}
