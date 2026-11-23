/**
 * Shared helpers for moving play equipment (`RideSpec` / `RideRuntime`): a template cache for the
 * rigid parts and the small physics models (pendulum, spinner, teeter, rocker).
 *
 * Ride items are `noBake`: `build` runs once per placed instance. To keep draw calls low every rigid
 * part (the static frame, a swing, the carousel deck...) is baked ONCE per color set and cloned per
 * instance; the clones share geometry and materials, so never mutate or dispose them.
 *
 * The physics classes have no three.js dependency. They integrate with small fixed sub-steps, so
 * any frame time up to 0.1 s is stable; larger / invalid values are clamped.
 */
import * as THREE from 'three';
import { bake } from '../kit';

/* ------------------------------------------------------------------ template cache */

const MAX_PARTS = 160;
const partCache = new Map<string, THREE.Group>();

/** Bake a rigid part once per `key` and hand out cheap clones (shared geometry + materials). */
export function bakedPart(key: string, make: () => THREE.Object3D): THREE.Group {
  let tpl = partCache.get(key);
  if (!tpl) {
    tpl = bake(make(), key);
    if (partCache.size >= MAX_PARTS) {
      const first = partCache.keys().next().value;
      if (first !== undefined) partCache.delete(first);
    }
    partCache.set(key, tpl);
  }
  return tpl.clone(true);
}

/** Cache key for a part: name + the resolved colors it depends on. */
export const partKey = (name: string, colors: Record<string, string>, keys: string[]): string => `${name}|${keys.map((k) => colors[k]).join(',')}`;

/**
 * An empty node a rider is glued to: origin = where the hips rest on the seat, +Z = facing direction
 * (`facing` uses the `SeatAnchor` convention: radians around Y, 0 = +Z).
 */
export function seatNode(parent: THREE.Object3D, x: number, y: number, z: number, facing: number): THREE.Object3D {
  const n = new THREE.Object3D();
  n.name = 'seat';
  n.position.set(x, y, z);
  n.rotation.y = facing;
  parent.add(n);
  return n;
}

/* ------------------------------------------------------------------ integration helpers */

export const GRAVITY = 9.81;
const MAX_DT = 0.1;
const SUB = 1 / 120;

/** Sanitize a frame time and split it into sub-steps: [count, step length]. */
export function substeps(dt: number): [number, number] {
  if (!Number.isFinite(dt) || dt <= 0) return [0, 0];
  const t = Math.min(dt, MAX_DT);
  const n = Math.max(1, Math.ceil(t / SUB));
  return [n, t / n];
}

/** Clamp a push value to 0…1 (NaN → 0). */
export const push01 = (p: number): number => (Number.isFinite(p) ? Math.min(1, Math.max(0, p)) : 0);

const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));

/* ------------------------------------------------------------------ pendulum (swing) */

/**
 * A playground swing: damped pendulum of length `L`. A rider pumps energy in phase with the motion
 * until the amplitude approaches `maxAmp`.
 */
export class Pendulum {
  /** angle from the vertical, radians; positive = forwards */
  theta = 0;
  omega = 0;
  /** angular acceleration of the last sub-step (used to shake the neighbours a little) */
  alpha = 0;
  private readonly w2: number;
  private readonly eMax: number;

  constructor(
    readonly L: number,
    maxAmp = 0.9,
  ) {
    this.w2 = GRAVITY / L;
    this.eMax = this.w2 * (1 - Math.cos(maxAmp));
  }

  /** small-angle period, seconds */
  get period(): number {
    return (2 * Math.PI) / Math.sqrt(this.w2);
  }

  get moving(): boolean {
    return this.theta !== 0 || this.omega !== 0;
  }

  step(h: number, push: number, ext = 0): void {
    const { w2, eMax } = this;
    const e = 0.5 * this.omega * this.omega + w2 * (1 - Math.cos(this.theta));
    // air drag + bearing friction; extra friction at tiny amplitudes so the swing really comes to rest
    const c = 0.26 + 1.3 / (1 + e / 0.02);
    let a = -w2 * Math.sin(this.theta) - c * this.omega + ext;
    if (push > 0) {
      // pump in phase with the motion; from rest: kick off forwards
      let dir: number;
      if (Math.abs(this.omega) > 0.03) dir = this.omega / (Math.abs(this.omega) + 0.12);
      else dir = Math.abs(this.theta) > 0.05 ? -Math.sign(this.theta) : 1;
      a += push * 0.85 * dir * clamp(((eMax - e) / eMax) * 8, 0, 1);
    }
    this.alpha = a;
    this.omega = clamp(this.omega + a * h, -8, 8);
    this.theta = clamp(this.theta + this.omega * h, -1.45, 1.45);
    if (push <= 0 && Math.abs(ext) < 0.02 && Math.abs(this.theta) < 0.003 && Math.abs(this.omega) < 0.012) {
      this.theta = 0;
      this.omega = 0;
      this.alpha = 0;
    }
  }
}

/* ------------------------------------------------------------------ spinner (carousel) */

/** A roundabout: pushing accelerates it towards `topSpeed`; bearing friction stops it in `spinDown` seconds. */
export class Spinner {
  angle = 0;
  omega = 0;
  private readonly visc = 0.25;
  private readonly dry = 0.08;
  private readonly drive: number;
  private readonly limit: number;

  constructor(topSpeed = 1.6) {
    // drive(1 - w/limit) = visc*w + dry at w = topSpeed
    this.limit = topSpeed * 1.375;
    this.drive = (this.visc * topSpeed + this.dry) / (1 - topSpeed / this.limit);
  }

  get moving(): boolean {
    return this.omega !== 0;
  }

  step(h: number, push: number): void {
    let w = this.omega;
    w += push * this.drive * Math.max(0, 1 - w / this.limit) * h;
    const brake = (this.visc * Math.abs(w) + this.dry) * h;
    if (Math.abs(w) <= brake) w = 0;
    else w -= Math.sign(w) * brake;
    this.omega = clamp(w, -4, 4);
    this.angle = (this.angle + this.omega * h) % (Math.PI * 2);
  }
}

/* ------------------------------------------------------------------ teeter (seesaw) */

/**
 * A seesaw beam tilting between ±`max` (positive = the +X end is up). Riders weigh their end down;
 * a pushing rider kicks off the ground whenever the feet reach it, so the beam rocks rhythmically.
 * Empty, a weak spring levels the beam again.
 */
export class Teeter {
  theta = 0;
  omega = 0;
  private resting = true;
  /** legs loaded for the next push-off: [left rider, right rider] */
  private readonly armed = [false, false];

  constructor(readonly max: number) {}

  get moving(): boolean {
    return !this.resting;
  }

  /** `left` / `right`: is the seat at -X / +X occupied */
  step(h: number, push: number, left: boolean, right: boolean): void {
    const { max, armed } = this;
    const n = (left ? 1 : 0) + (right ? 1 : 0);
    // weight of the riders, levelling spring (bearing rubber), damping
    let a = 3.0 * ((left ? 1 : 0) - (right ? 1 : 0)) * Math.cos(this.theta);
    a -= (n === 0 ? 7 : n === 1 ? 0.5 : 1.5) * this.theta;
    // riders who stop pushing brake with their feet
    a -= (n === 0 ? 1.6 : push > 0 ? 0.5 : 2.4) * this.omega;
    // a pushing rider kicks off when the own end comes down close to the ground, and keeps pushing
    // until the legs are stretched (own end about a third of the way up)
    for (let i = 0; i < 2; i++) {
      const own = i === 0 ? -this.theta : this.theta; // height angle of this rider's end
      if (!(i === 0 ? left : right) || push <= 0) armed[i] = false;
      else if (own < -0.72 * max) armed[i] = true;
      else if (own > -0.25 * max) armed[i] = false;
      if (armed[i]) a += (i === 0 ? -1 : 1) * push * (n === 1 ? 9.5 : 6.2);
    }
    // two riders in balance: lean back to get it going
    if (n === 2 && push > 0 && !armed[0] && !armed[1] && Math.abs(this.theta) < 0.8 * max && Math.abs(this.omega) < 0.5) {
      a += push * 1.6 * (this.omega < 0 || (this.omega === 0 && this.theta < 0) ? -1 : 1);
    }
    this.omega = clamp(this.omega + a * h, -6, 6);
    this.theta += this.omega * h;
    // the tyre bumpers: a dull, mostly inelastic stop
    let blocked = false;
    if (this.theta >= max) {
      this.theta = max;
      if (this.omega > 0) this.omega = this.omega > 0.3 ? -0.2 * this.omega : 0;
      blocked = a >= 0;
    } else if (this.theta <= -max) {
      this.theta = -max;
      if (this.omega < 0) this.omega = this.omega < -0.3 ? -0.2 * this.omega : 0;
      blocked = a <= 0;
    }
    const still = Math.abs(this.omega) < 0.01;
    if (blocked && still) {
      this.omega = 0;
      this.resting = true;
    } else if (push <= 0 && n !== 1 && still && Math.abs(this.theta) < 0.002) {
      this.theta = 0;
      this.omega = 0;
      this.resting = true;
    } else {
      this.resting = false;
    }
  }
}

/* ------------------------------------------------------------------ rocker (spring rider) */

/**
 * A spring rider: two lightly damped spring oscillators (pitch fore/aft, roll sideways). A pushing
 * rider throws the weight back and forth in rhythm, up to about `maxPitch`.
 */
export class Rocker {
  /** radians; positive = nose down / forwards */
  pitch = 0;
  pitchV = 0;
  /** radians; sideways wobble */
  roll = 0;
  rollV = 0;
  private readonly wp: number;
  private readonly wr: number;

  constructor(
    readonly maxPitch = 0.3,
    readonly maxRoll = 0.07,
    pitchHz = 1.15,
    rollHz = 1.55,
  ) {
    this.wp = pitchHz * Math.PI * 2;
    this.wr = rollHz * Math.PI * 2;
  }

  get moving(): boolean {
    return this.pitch !== 0 || this.pitchV !== 0 || this.roll !== 0 || this.rollV !== 0;
  }

  private static axis(x: number, v: number, w: number, max: number, zeta: number, drive: number, push: number, h: number): [number, number] {
    const e = 0.5 * v * v + 0.5 * w * w * x * x;
    const eMax = 0.5 * w * w * max * max;
    let a = -w * w * x - 2 * zeta * w * v;
    if (push > 0) {
      // throw the weight in phase with the motion; from rest: lean forwards first
      const vMin = 0.02 * w * max;
      const dir = Math.abs(v) > vMin ? v / (Math.abs(v) + 4 * vMin) : Math.abs(x) > 0.05 * max ? -Math.sign(x) : 1;
      a += push * drive * dir * clamp(((eMax - e) / eMax) * 6, 0, 1);
    }
    v = clamp(v + a * h, -12, 12);
    x = clamp(x + v * h, -1, 1);
    if (push <= 0 && Math.abs(x) < 0.0015 && Math.abs(v) < 0.02) return [0, 0];
    return [x, v];
  }

  step(h: number, push: number): void {
    [this.pitch, this.pitchV] = Rocker.axis(this.pitch, this.pitchV, this.wp, this.maxPitch, 0.09, 6.5, push, h);
    [this.roll, this.rollV] = Rocker.axis(this.roll, this.rollV, this.wr, this.maxRoll, 0.1, 2.2, push, h);
  }
}
