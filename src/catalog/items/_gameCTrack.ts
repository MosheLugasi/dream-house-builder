/**
 * Team C – roller-coaster track: a closed spline through a layout's control points, sampled at equal
 * arc length, with rotation-minimising frames (so loops and helices come out right) plus banking from
 * the forces a rider feels at the expected speed. And the train's "gravity" physics along it.
 *
 * Frame convention at every sample: Z = tangent (direction of travel), Y = track up (the rider's
 * head), X = Y × Z. Car-local coordinates use the same axes.
 */
import * as THREE from 'three';

export type TrackTag = 'station' | 'lift0' | 'lift1' | 'brake';

export interface TrackLayout {
  id: string;
  /** default item size the points are given for (meters) */
  size: { w: number; d: number; h: number };
  /** control points [x, y, z] in meters at the default size; point 0 is the middle of the station */
  points: Array<[number, number, number, TrackTag?]>;
  /** cars in the train */
  cars: number;
  /** lift chain speed, m/s */
  chain: number;
}

const G = 9.81;
const UP = new THREE.Vector3(0, 1, 0);

export class Track {
  /** sample count and spacing (closed: sample n = sample 0) */
  readonly n: number;
  readonly step: number;
  readonly length: number;
  readonly pos: THREE.Vector3[] = [];
  readonly tan: THREE.Vector3[] = [];
  readonly up: THREE.Vector3[] = [];
  readonly side: THREE.Vector3[] = [];
  readonly quat: THREE.Quaternion[] = [];
  /** dy/ds per sample */
  readonly slope: Float32Array;
  /** sample is part of a big drop (hands-up window) */
  readonly dropZone: Uint8Array;
  readonly liftStart: number;
  readonly liftEnd: number;
  readonly brakeStart: number;
  /** highest point (lift crest) */
  readonly top: number;

  constructor(points: THREE.Vector3[], tags: Array<TrackTag | undefined>, spacing = 0.6) {
    const curve = new THREE.CatmullRomCurve3(points, true, 'centripetal');
    const total = curve.getLength();
    const n = Math.max(32, Math.round(total / spacing));
    this.n = n;
    this.length = total;
    this.step = total / n;
    const pts = curve.getSpacedPoints(n);
    for (let i = 0; i < n; i++) this.pos.push(pts[i].clone());
    // arc length of every control point (tags)
    const div = points.length * 40;
    const lens = curve.getLengths(div);
    const sOf = (i: number): number => lens[Math.round((i / points.length) * div)];
    const tagS = (t: TrackTag, fallback: number): number => {
      const i = tags.indexOf(t);
      return i >= 0 ? sOf(i) : fallback;
    };
    this.liftStart = tagS('lift0', total * 0.05);
    this.liftEnd = tagS('lift1', total * 0.2);
    this.brakeStart = tagS('brake', total * 0.9);

    // tangents
    for (let i = 0; i < n; i++) {
      const a = this.pos[(i - 1 + n) % n];
      const b = this.pos[(i + 1) % n];
      this.tan.push(b.clone().sub(a).normalize());
    }
    // rotation-minimising frames (double reflection), starting with world up at the station
    const r: THREE.Vector3[] = [];
    const t0 = this.tan[0];
    r.push(UP.clone().addScaledVector(t0, -UP.dot(t0)).normalize());
    const v1 = new THREE.Vector3();
    const v2 = new THREE.Vector3();
    const rL = new THREE.Vector3();
    const tL = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const xi = this.pos[i];
      const xj = this.pos[(i + 1) % n];
      const ti = this.tan[i];
      const tj = this.tan[(i + 1) % n];
      v1.subVectors(xj, xi);
      const c1 = v1.dot(v1) || 1e-9;
      rL.copy(r[i]).addScaledVector(v1, (-2 / c1) * v1.dot(r[i]));
      tL.copy(ti).addScaledVector(v1, (-2 / c1) * v1.dot(ti));
      v2.subVectors(tj, tL);
      const c2 = v2.dot(v2);
      const next = rL.clone();
      if (c2 > 1e-12) next.addScaledVector(v2, (-2 / c2) * v2.dot(rL));
      r.push(next.normalize());
    }
    // closing twist: spread the mismatch evenly over the circuit
    const rn = r[n];
    const cross = new THREE.Vector3().crossVectors(rn, r[0]);
    const twist = Math.atan2(cross.dot(t0), rn.dot(r[0]));
    for (let i = 0; i < n; i++) r[i].applyAxisAngle(this.tan[i], (twist * i) / n).normalize();

    // expected speed (energy from the crest), curvature → banking
    let top = -Infinity;
    for (const p of this.pos) top = Math.max(top, p.y);
    this.top = top;
    const iLift1 = Math.round(this.liftEnd / this.step);
    const iBrake = Math.round(this.brakeStart / this.step);
    const roll = new Float32Array(n);
    const K = new THREE.Vector3();
    const X = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const free = i >= iLift1 && i < iBrake;
      const v2e = free ? Math.max(4, 2 * G * (top - this.pos[i].y) * 0.85) : 4;
      K.subVectors(this.tan[(i + 1) % n], this.tan[(i - 1 + n) % n]).multiplyScalar(1 / (2 * this.step));
      X.crossVectors(r[i], this.tan[i]);
      const lat = v2e * K.dot(X);
      const vert = G * UP.dot(r[i]) + v2e * K.dot(r[i]);
      roll[i] = Math.max(-1.2, Math.min(1.2, Math.atan(lat / Math.max(vert, 3))));
    }
    // smooth the banking over ±4 m
    const win = Math.max(1, Math.round(4 / this.step));
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let k = -win; k <= win; k++) s += roll[(i + k + n) % n];
      const phi = s / (2 * win + 1);
      const Xi = new THREE.Vector3().crossVectors(r[i], this.tan[i]);
      const u = r[i].clone().multiplyScalar(Math.cos(phi)).addScaledVector(Xi, Math.sin(phi)).normalize();
      this.up.push(u);
      const x = new THREE.Vector3().crossVectors(u, this.tan[i]).normalize();
      this.side.push(x);
      this.quat.push(new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, u, this.tan[i])));
    }
    // slope and drop zones
    this.slope = new Float32Array(n);
    for (let i = 0; i < n; i++) this.slope[i] = this.tan[i].y;
    this.dropZone = new Uint8Array(n);
    const H = top - Math.min(...this.pos.map((p) => p.y));
    let i = 0;
    while (i < n) {
      if (this.slope[i] < -0.25 && i >= iLift1 && i < iBrake) {
        let j = i;
        while (j < n && this.slope[j] < -0.1) j++;
        const fall = this.pos[i].y - this.pos[Math.min(j, n - 1)].y;
        if (fall > Math.max(2, H * 0.3)) for (let k = Math.max(0, i - 2); k < j; k++) this.dropZone[k] = 1;
        i = j + 1;
      } else i++;
    }
  }

  /** wrap an arc length into [0, length) */
  wrap(s: number): number {
    const L = this.length;
    return ((s % L) + L) % L;
  }

  /** position + orientation at arc length s */
  sample(s: number, outPos: THREE.Vector3, outQuat: THREE.Quaternion): void {
    const f = this.wrap(s) / this.step;
    const i = Math.floor(f) % this.n;
    const j = (i + 1) % this.n;
    const k = f - Math.floor(f);
    outPos.lerpVectors(this.pos[i], this.pos[j], k);
    outQuat.slerpQuaternions(this.quat[i], this.quat[j], k);
  }

  index(s: number): number {
    return Math.floor(this.wrap(s) / this.step + 0.5) % this.n;
  }

  slopeAt(s: number): number {
    return this.slope[this.index(s)];
  }

  inverted(s: number): boolean {
    return this.up[this.index(s)].y < -0.2;
  }

  inDrop(s: number): boolean {
    return this.dropZone[this.index(s)] === 1;
  }
}

/** Build a track for a layout at a size (control points stretched per axis). */
export function trackFor(layout: TrackLayout, size: { w: number; d: number; h: number }, spacing = 0.6): Track {
  const kx = size.w / layout.size.w;
  const kz = size.d / layout.size.d;
  const ky = size.h / layout.size.h;
  const pts = layout.points.map(([x, y, z]) => new THREE.Vector3(x * kx, y * ky, z * kz));
  return new Track(
    pts,
    layout.points.map((p) => p[3]),
    spacing,
  );
}

/**
 * The train's motion along the track: tyre drive out of the station, chain lift, gravity with
 * rolling friction and air drag, booster tyres that never let it stall, brakes and a gentle stop
 * exactly back in the station (s = 0 ≡ length).
 */
export class TrainPhysics {
  s = 0;
  v = 0;
  running = false;
  /** seconds since the start of the run */
  time = 0;

  constructor(
    readonly track: Track,
    readonly chain: number,
    /** half the train length (the gravity pull is averaged over the train) */
    readonly half: number,
  ) {}

  start(): void {
    this.s = 0;
    this.v = 0;
    this.time = 0;
    this.running = true;
  }

  /** section the middle of the train is in */
  section(): 'station' | 'lift' | 'free' | 'brake' {
    const { s, track: t } = this;
    if (s < t.liftStart) return 'station';
    if (s < t.liftEnd) return 'lift';
    if (s < t.brakeStart) return 'free';
    return 'brake';
  }

  /** advance h seconds (fixed sub-steps inside); returns true when the train is back and stopped */
  step(h: number): boolean {
    if (!this.running) return false;
    const n = Math.max(1, Math.ceil(h / (1 / 120)));
    const dt = h / n;
    const t = this.track;
    const L = t.length;
    for (let i = 0; i < n; i++) {
      this.time += dt;
      const slope = (t.slopeAt(this.s - this.half) + t.slopeAt(this.s) + t.slopeAt(this.s + this.half)) / 3;
      const grav = -G * slope;
      const fric = 0.012 * G + 0.0016 * this.v * this.v;
      const sec = this.section();
      let v = this.v;
      if (sec === 'station') {
        // drive tyres push the train out towards the lift
        v = Math.min(2.4, v + 1.6 * dt);
      } else if (sec === 'lift') {
        v = Math.max(this.chain, v + (grav - fric) * dt);
      } else if (sec === 'free') {
        v = Math.max(1.6, v + (grav - fric) * dt);
      } else {
        const left = L - this.s;
        // trim brakes to a crawl, then stop on the mark
        const target = left > 7 ? 2.6 : Math.sqrt(2 * 0.9 * Math.max(0, left));
        if (v > target) v = Math.max(target, v - 7 * dt);
        else v = Math.min(target, v + 1.2 * dt);
        if (left < 0.03 || (left < 0.4 && v < 0.05)) {
          this.s = 0;
          this.v = 0;
          this.running = false;
          return true;
        }
      }
      this.v = v;
      this.s += v * dt;
      if (this.s >= L) {
        this.s = 0;
        this.v = 0;
        this.running = false;
        return true;
      }
    }
    return false;
  }
}

/* ------------------------------------------------------------------ layouts */

const loop = (cx: number, y0: number, R: number, z0: number, z1: number): Array<[number, number, number]> => {
  const out: Array<[number, number, number]> = [];
  for (let k = 0; k <= 8; k++) {
    const th = (k / 8) * Math.PI * 2;
    // a slightly tear-dropped loop: tighter at the top
    const rr = R * (1 - 0.12 * (1 - Math.cos(th)) * 0.5);
    out.push([+(cx + rr * Math.sin(th)).toFixed(3), +(y0 + R * (1 - Math.cos(th)) * 0.97).toFixed(3), +(z0 + ((z1 - z0) * k) / 8).toFixed(3)]);
  }
  return out;
};

const helix = (cx: number, cz: number, R: number, y0: number, y1: number, turns: number): Array<[number, number, number]> => {
  const out: Array<[number, number, number]> = [];
  const steps = Math.round(turns * 8);
  for (let k = 0; k <= steps; k++) {
    const a = (k / 8) * Math.PI * 2;
    out.push([+(cx + R * Math.sin(a)).toFixed(3), +(y0 + ((y1 - y0) * k) / steps).toFixed(3), +(cz - R * Math.cos(a)).toFixed(3)]);
  }
  return out;
};

/** the big one: lift hill, a steep first drop into a vertical loop, an airtime hill, a banked turn */
export const LAYOUT_LOOP: TrackLayout = {
  id: 'loop',
  size: { w: 44, d: 20, h: 21 },
  cars: 3,
  chain: 3.6,
  points: [
    [6, 0.62, 7.5, 'station'],
    [1, 0.62, 7.5],
    [-3, 1.0, 7.5, 'lift0'],
    [-6, 4.0, 7.5],
    [-14, 15.6, 7.5],
    [-16.4, 18.0, 7.3, 'lift1'],
    [-18.8, 18.6, 6.2],
    [-20.4, 18.0, 3.6],
    [-20.0, 16.2, 0.4],
    [-17.0, 11.0, -3.6],
    [-13.0, 4.0, -6.4],
    [-9.0, 1.1, -7.6],
    [-5.0, 1.0, -7.8],
    ...loop(0, 1.0, 4.6, -7.8, -4.8),
    [5.0, 1.0, -4.6],
    [9.0, 4.5, -4.4],
    [13.0, 8.4, -4.2],
    [17.0, 4.0, -4.6],
    [19.8, 2.4, -3.0],
    [20.6, 3.0, 0.5],
    [19.6, 3.4, 4.2],
    [16.5, 2.6, 7.0],
    [13.0, 0.9, 7.5, 'brake'],
    [10.0, 0.64, 7.5],
  ],
};

/** a lift, a curving drop, camel humps and a 1½-turn downward helix */
export const LAYOUT_HELIX: TrackLayout = {
  id: 'helix',
  size: { w: 40, d: 24, h: 17 },
  cars: 3,
  chain: 3.4,
  points: [
    [-2, 0.62, 9.5, 'station'],
    [-6, 0.62, 9.5],
    [-9, 1.0, 9.5, 'lift0'],
    [-11, 3.3, 9.5],
    [-16, 12.6, 9.5],
    [-17.6, 14.4, 9.0, 'lift1'],
    [-18.6, 14.7, 7.0],
    [-18.6, 13.8, 4.0],
    [-17.4, 10.8, 0.4],
    [-14.0, 5.0, -4.4],
    [-10.0, 1.4, -8.0],
    [-5.0, 1.4, -9.6],
    [-1.0, 4.2, -10.0],
    [3.0, 6.0, -9.6],
    ...helix(11, -1, 7, 6.6, 1.8, 1.5),
    [6.0, 1.6, 6.4],
    [3.0, 0.9, 8.7, 'brake'],
    [1.0, 0.64, 9.45],
  ],
};

/** a small family coaster (the dragon): a gentle lift, swoops and a wide turn */
export const LAYOUT_FAMILY: TrackLayout = {
  id: 'family',
  size: { w: 28, d: 17, h: 9 },
  cars: 2,
  chain: 2.6,
  points: [
    [3, 0.62, 6, 'station'],
    [-1, 0.62, 6],
    [-4, 0.95, 6, 'lift0'],
    [-6, 2.3, 6],
    [-9.5, 5.8, 6],
    [-11, 6.6, 5.6, 'lift1'],
    [-12.4, 6.6, 4.0],
    [-12.6, 5.6, 1.5],
    [-11, 3.4, -1.5],
    [-8, 1.2, -4.5],
    [-4, 1.6, -6],
    [0, 3.4, -6],
    [4, 1.8, -6],
    [8, 1.4, -5.6],
    [11.4, 2.4, -3.6],
    [12.4, 3.0, 0],
    [11.4, 2.4, 3.6],
    [8.4, 1.1, 5.8, 'brake'],
    [6, 0.64, 6.0],
  ],
};
