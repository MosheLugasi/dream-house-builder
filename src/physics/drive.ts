/**
 * Tyres of the planar vehicles (the player's car, parked cars, the street traffic), applied to the
 * rigid body's velocity before every physics sub-step. The rigid-body solver then resolves the
 * contacts (walls, props, other cars) with real masses; the tyres only push towards what the driver
 * wants, with bounded forces – so a crash really costs speed and spins the car, and the car recovers
 * as the tyres grip again. Pure: no Rapier here.
 */

export interface PlanarVelocity {
  vx: number;
  vz: number;
  /** yaw rate (rotation.y per second) */
  w: number;
}

export interface DriveIntent {
  /** wanted speed along the heading, m/s (negative = reversing) */
  speed: number;
  /** wanted yaw rate, rad/s (rotation.y per second) */
  yawRate: number;
  /** strongest longitudinal acceleration / braking the tyres give, m/s² */
  traction: number;
  /** strongest sideways acceleration (grip), m/s² */
  grip: number;
  /** strongest yaw acceleration the steering can force, rad/s² */
  yawGrip: number;
}

/** the player: the arcade controller decides the speed; very grippy, never spins out by itself */
export const PLAYER_TYRES = { traction: 26, grip: 16, yawGrip: 14 } as const;
/** street traffic */
export const TRAFFIC_TYRES = { traction: 9, grip: 9, yawGrip: 6 } as const;
/** a parked or crashed car: wheels braked, it skids (≈ 0.7 g) */
export const SKID = { decel: 6.5, yawDecel: 5 } as const;

const clamp = (v: number, lim: number) => (v > lim ? lim : v < -lim ? -lim : v);

/** Heading unit vector of rotation.y = yaw (local +Z forward): (sin yaw, cos yaw); right = (cos yaw, −sin yaw). */
export function applyDrive(v: PlanarVelocity, yaw: number, intent: DriveIntent, h: number): void {
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const s = v.vx * fx + v.vz * fz;
  const l = v.vx * fz - v.vz * fx;
  const ds = clamp(intent.speed - s, intent.traction * h);
  const dl = clamp(-l, intent.grip * h);
  v.vx += fx * ds + fz * dl;
  v.vz += fz * ds - fx * dl;
  v.w += clamp(intent.yawRate - v.w, intent.yawGrip * h);
}

/** Braked wheels: slide to a stop (constant deceleration, like rubber on asphalt). */
export function applySkid(v: PlanarVelocity, h: number, decel: number = SKID.decel, yawDecel: number = SKID.yawDecel): void {
  const sp = Math.hypot(v.vx, v.vz);
  if (sp > 1e-6) {
    const k = Math.max(0, sp - decel * h) / sp;
    v.vx *= k;
    v.vz *= k;
  }
  const aw = Math.abs(v.w);
  if (aw > 1e-6) v.w *= Math.max(0, aw - yawDecel * h) / aw;
}

/** Speed along the heading. */
export function forwardSpeed(v: PlanarVelocity, yaw: number): number {
  return v.vx * Math.sin(yaw) + v.vz * Math.cos(yaw);
}

/** Yaw (rotation.y) of a quaternion that only turns about +Y (or mostly so). */
export function yawOfQuat(qx: number, qy: number, qz: number, qw: number): number {
  // forward (local +Z) rotated: x = 2(xz + wy), z = 1 − 2(x² + y²)
  return Math.atan2(2 * (qx * qz + qw * qy), 1 - 2 * (qx * qx + qy * qy));
}
