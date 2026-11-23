import * as THREE from 'three';
import type { CharacterMotion, Gesture, Pose } from '../characterTypes';
import type { BodyBuild } from './assemble';
import { B, clamp01, lerp, smooth } from './builder';

/**
 * Procedural animation of the character rig.
 *
 * Every pose ("layer": standing / locomotion, sitting, lying, riding) is evaluated into a flat parameter
 * vector — pelvis transform, spine angles, ANKLE TARGETS (solved with two-bone IK so feet stay where they
 * are planted), arm angles and optional hand targets. Layers are blended with critically damped weights,
 * gestures are layered on top, then the result is written to the bones.
 */

// ---- parameter vector layout -------------------------------------------------------------------------
const I = {
  hip: 0, // pelvis position (character space)
  hipR: 3, // pelvis rotation: pitch (x, + = forward), yaw (y), roll (z, + = left side up)
  spine: 6,
  chest: 9,
  neck: 12,
  head: 15,
  footL: 18, // ankle position
  footLr: 21, // foot pitch (+ = toes down), yaw, roll
  toeL: 24,
  footR: 25,
  footRr: 28,
  toeR: 31,
  shL: 32, // shoulder: x = swing (+ = back), y = twist, z = abduction (+ = away from the body on the left)
  elL: 35, // elbow (negative = flexed)
  wrL: 36,
  shR: 39,
  elR: 42,
  wrR: 43,
  ikL: 46, // wrist target × weight
  ikLw: 49,
  poleL: 50, // elbow direction × weight
  ikR: 53,
  ikRw: 56,
  poleR: 57,
  gripL: 60,
  gripR: 61,
  clavL: 62,
  clavR: 63,
  palmL: 64, // palm normal × weight
  palmR: 67,
  kneeOut: 70,
  N: 71,
} as const;

const TAU = Math.PI * 2;
const G = 9.81;

/** Critically damped spring (implicit integration, stable for any dt). */
class Spring {
  v = 0;
  constructor(public x = 0) {}
  step(target: number, omega: number, dt: number): number {
    const f = 1 + 2 * dt * omega;
    const oo = omega * omega;
    const hoo = dt * oo;
    const hhoo = dt * hoo;
    const detInv = 1 / (f + hhoo);
    const x = (f * this.x + dt * this.v + hhoo * target) * detInv;
    this.v = (this.v + hoo * (target - this.x)) * detInv;
    this.x = x;
    return x;
  }
}

/** Under-damped spring for bouncy secondary motion. */
class Bounce {
  x = 0;
  v = 0;
  step(target: number, omega: number, zeta: number, dt: number): number {
    // semi-implicit Euler with sub-steps
    const n = Math.max(1, Math.ceil(dt * omega * 0.5));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      this.v += (omega * omega * (target - this.x) - 2 * zeta * omega * this.v) * h;
      this.x += this.v * h;
    }
    return this.x;
  }
}

interface FootState {
  stance: boolean;
  /** flat-frame z of the planted foot */
  z: number;
  /** where the swing started */
  sw: { x: number; y: number; z: number; pitch: number; toe: number };
  last: { x: number; y: number; z: number; pitch: number; toe: number };
}

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _vx = new THREE.Vector3();
const _vy = new THREE.Vector3();
const _vz = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _q3 = new THREE.Quaternion();
const _q4 = new THREE.Quaternion();
const _qi = new THREE.Quaternion();
const _e = new THREE.Euler();
const ID = new THREE.Quaternion();
const X_AXIS = new THREE.Vector3(1, 0, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);

let instanceCounter = 0;

export class Animator {
  pose: Pose = 'stand';
  seatHeight = 0.45;
  reach = false;
  onFootstep?: (foot: 'left' | 'right') => void;
  /** crank angle of the bicycle being ridden (radians), when the game knows it; otherwise integrated from speed */
  pedalAngle: number | null = null;

  private bones: THREE.Bone[];
  private bb: BodyBuild;
  private off: THREE.Vector3[] = [];
  private L1: number;
  private L2: number;
  private legLen: number;
  private armLen: number;
  private k: number;
  private restAbduct: number;

  private time = 0;
  private phase = 0.1;
  private pedal = 0;
  private vs = new Spring(0);
  private turn = new Spring(0);
  private wMove = new Spring(0);
  private wSit = new Spring(0);
  private wLie = new Spring(0);
  private wRide = new Spring(0);
  private wReach = new Spring(0);
  private wAir = new Spring(0);
  private wSleep = new Spring(0);
  private vyS = new Spring(0);
  private land = new Bounce();
  private hairX = new Bounce();
  private hairZ = new Bounce();
  private hairX2 = new Bounce();
  private wasAir = false;
  private lastVy = 0;
  private feet: FootState[] = [0, 1].map(() => ({
    stance: true,
    z: 0,
    sw: { x: 0, y: 0, z: 0, pitch: 0, toe: 0 },
    last: { x: 0, y: 0, z: 0, pitch: 0, toe: 0 },
  }));
  private blinkAt = 1.5;
  private blink = 0;
  private seed: number;
  private gest: { kind: Gesture; t: number; dur: number } | null = null;
  private P = new Float32Array(I.N);
  private T = new Float32Array(I.N);

  constructor(bones: THREE.Bone[], bb: BodyBuild) {
    this.bones = bones;
    this.bb = bb;
    this.seed = 1234567 + 7919 * instanceCounter++;
    this.L1 = 0;
    this.L2 = 0;
    this.legLen = 0;
    this.armLen = 0;
    this.k = 1;
    this.restAbduct = 0.1;
    this.rebind(bones, bb);
    // settle the first frame in the idle pose
    for (let i = 0; i < 2; i++) this.feet[i].last.y = bb.spec.ankleY;
  }

  /** Point the animator at a new rig (after the look changed) keeping the motion state. */
  rebind(bones: THREE.Bone[], bb: BodyBuild): void {
    this.bones = bones;
    this.bb = bb;
    const s = bb.spec;
    this.off = [];
    for (let i = 0; i < bones.length; i++) {
      const p = bb.parents[i];
      const o = new THREE.Vector3(bb.rest[i * 3], bb.rest[i * 3 + 1], bb.rest[i * 3 + 2]);
      if (p >= 0) o.sub(new THREE.Vector3(bb.rest[p * 3], bb.rest[p * 3 + 1], bb.rest[p * 3 + 2]));
      this.off.push(o);
    }
    this.L1 = s.hipY - s.kneeY;
    this.L2 = s.kneeY - s.ankleY;
    this.legLen = this.L1 + this.L2;
    this.armLen = s.upperArm + s.foreArm;
    this.k = s.H / 1.78;
    // arms hang clear of the hips
    const hipR = s.torso[2][1] + 0.03 * this.k;
    this.restAbduct = Math.max(0.07, Math.asin(Math.min(0.5, (hipR + 0.045 * this.k - s.shoulderX) / (this.armLen + s.hand * 0.5))));
  }

  get gaitPhase(): number {
    return this.phase;
  }

  gesture(g: Gesture): void {
    const dur = { wave: 2.2, cheer: 1.7, pet: 2.4, kick: 0.95 }[g];
    this.gest = { kind: g, t: 0, dur };
  }

  private rnd(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  // =====================================================================================================
  update(dtIn: number, speed: number, motion: CharacterMotion = {}): void {
    const dt = Math.min(0.1, Math.max(0, dtIn));
    this.time += dt;
    const pose = this.pose;
    const standing = pose === 'stand';
    const v = standing ? Math.max(0, speed) : 0;
    this.vs.step(v, 9, dt);
    this.turn.step(motion.turn ?? 0, 8, dt);
    this.wMove.step(standing && v > 0.08 ? 1 : 0, 11, dt);
    this.wSit.step(pose === 'sit' ? 1 : 0, 8, dt);
    this.wLie.step(pose === 'lie' ? 1 : 0, 6.5, dt);
    this.wRide.step(pose === 'ride' ? 1 : 0, 8, dt);
    this.wReach.step(this.reach && standing ? 1 : 0, 8, dt);
    const air = !!motion.airborne && standing;
    this.wAir.step(air ? 1 : 0, air ? 16 : 13, dt);
    this.vyS.step(motion.vy ?? 0, 14, dt);
    this.wSleep.step(motion.asleep ? 1 : 0, 5, dt);
    if (air) this.lastVy = motion.vy ?? 0;
    if (this.wasAir && !air) this.land.v -= Math.min(4.5, Math.abs(this.lastVy)) * 0.2 + 0.25;
    this.wasAir = air;
    this.land.step(0, 13, 0.42, dt);

    const wSit = clamp01(this.wSit.x);
    const wLie = clamp01(this.wLie.x);
    const wRide = clamp01(this.wRide.x);
    const wStand = clamp01(1 - wSit - wLie - wRide);

    const P = this.P;
    const T = this.T;
    P.fill(0);
    const add = (w: number) => {
      for (let i = 0; i < I.N; i++) P[i] += T[i] * w;
    };
    if (wStand > 0.001) {
      T.fill(0);
      this.layerStand(T, dt, v, motion);
      add(wStand);
    } else {
      this.idleFeet();
    }
    if (wSit > 0.001) {
      T.fill(0);
      this.layerSit(T);
      add(wSit);
    }
    if (wLie > 0.001) {
      T.fill(0);
      this.layerLie(T);
      add(wLie);
    }
    if (wRide > 0.001) {
      T.fill(0);
      this.layerRide(T, dt, speed);
      add(wRide);
    }
    this.applyGesture(P, dt, wStand);
    this.apply(P, dt, v, wStand, motion);
  }

  private idleFeet(): void {
    for (const f of this.feet) {
      f.stance = true;
      f.z = 0;
    }
    this.phase = 0.1;
  }

  // =====================================================================================================
  // standing, walking, running, jumping
  // =====================================================================================================
  private layerStand(o: Float32Array, dt: number, v: number, m: CharacterMotion): void {
    const s = this.bb.spec;
    const k = this.k;
    const L = this.legLen;
    const fl = s.footLen;
    const t = this.time;
    const vs = Math.max(0, this.vs.x);
    const Fr = (vs * vs) / (G * L);
    const run = smooth(0.62, 1.12, Fr);
    const stride = L * Math.min(3.4, 2.35 * Math.pow(Math.max(Fr, 1e-5), 0.3));
    const amp = clamp01(stride / (1.4 * L));
    const duty = lerp(0.63, 0.36, run);
    const freq = stride > 0.02 ? v / stride : 0;
    const mv = clamp01(this.wMove.x);
    const airW = clamp01(this.wAir.x);
    const reach = clamp01(this.wReach.x);
    if (mv < 0.02 && v < 0.05) this.idleFeet();
    else if (airW < 0.5) this.phase = (this.phase + freq * dt) % 1;
    const ph = this.phase;

    // ---- pelvis ----------------------------------------------------------------------------------------
    const breath = Math.sin(t * 1.55);
    const idleSway = Math.sin(t * 0.43) * 0.6 + Math.sin(t * 0.19 + 1) * 0.4;
    const base = s.hipY - L * lerp(0.004, 0.02 + 0.014 * amp + 0.05 * run, mv);
    const bobW = -L * 0.024 * amp * Math.cos(2 * TAU * (ph - 0.03));
    const bobR = -L * 0.045 * Math.cos(2 * TAU * (ph - duty * 0.5));
    let hipY = base + mv * lerp(bobW, bobR, run) + (1 - mv) * 0.0015 * k * breath;
    let hipX = mv * 0.02 * k * (1 - 0.6 * run) * amp * Math.cos(TAU * (ph - duty * 0.5)) + (1 - mv) * 0.014 * k * idleSway * (1 - reach);
    const lean = mv * (0.015 + 0.03 * amp + 0.085 * run + 0.012 * Math.min(vs, 5));
    const yawA = (0.075 + 0.085 * run) * amp * mv;
    const hipYaw = -yawA * Math.cos(TAU * ph) - 0.22 * reach;
    const hipRoll = mv * 0.05 * amp * (1 - 0.45 * run) * Math.sin(TAU * ph + 0.35) + (1 - mv) * 0.022 * idleSway * (1 - reach);
    const turn = THREE.MathUtils.clamp(this.turn.x, -4, 4);
    const bank = -THREE.MathUtils.clamp(turn * vs * 0.022, -0.2, 0.2) * mv;
    const land = Math.max(-0.3 * L, Math.min(0.03, this.land.x));
    // jump: tuck on the way up, legs reaching for the ground on the way down
    const vy = this.vyS.x;
    const tuck = airW * lerp(0.62, 0.1, smooth(0.6, -2.6, vy));
    hipY += land - tuck * 0.04 * L;
    const hipZ = -0.03 * k * reach - 0.012 * k * mv * run;

    // ---- feet --------------------------------------------------------------------------------------------
    const stanceX = lerp(s.hipX * 1.04, s.hipX * lerp(0.62, 0.3, run), mv);
    const zLand = duty * stride * 0.5 + 0.015 * k;
    const hs = -(0.36 - 0.27 * run) * amp;
    const to = (0.92 + 0.12 * run) * amp;
    const hoff = lerp(0.5, 0.34, run);
    const heel = -0.24 * fl;
    const ball = 0.42 * fl;
    const anY = s.ankleY;
    /** ankle offset caused by pitching the foot about its heel (pitch < 0) or ball (pitch > 0): returns [dy, dz] */
    const roll = (pitch: number): [number, number] => {
      const pz = pitch < 0 ? heel : ball;
      // pivot local = (0, -anY, pz); ankle = pivot - Rx(pitch)·pivotLocal
      const c = Math.cos(pitch);
      const sn = Math.sin(pitch);
      const ry = -anY * c - pz * sn;
      const rz = -anY * sn + pz * c;
      return [-anY - ry, pz - rz];
    };
    let minReach = Infinity;
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? 1 : -1;
      const st = this.feet[i];
      const p = (ph + i * 0.5) % 1;
      const inStance = p < duty;
      if (mv >= 0.02 || v >= 0.05) {
        if (inStance && !st.stance) {
          st.stance = true;
          st.z = zLand - p * stride;
          if (mv > 0.4 && airW < 0.3 && v > 0.25) this.onFootstep?.(i === 0 ? 'left' : 'right');
        } else if (!inStance && st.stance) {
          st.stance = false;
          st.sw = { ...st.last };
        }
        if (st.stance) st.z -= v * dt;
      }
      const x = side * stanceX;
      let ax: number;
      let ay: number;
      let az: number;
      let pitch: number;
      let toe: number;
      let contact: number;
      if (inStance) {
        const sn = p / duty;
        if (sn < 0.16) pitch = hs * (1 - smooth(0, 0.16, sn));
        else if (sn < hoff) pitch = 0;
        else pitch = to * Math.pow((sn - hoff) / (1 - hoff), 1.35);
        const [dy, dz] = roll(pitch);
        ax = x;
        ay = anY + dy;
        az = st.z + dz;
        toe = pitch > 0 ? -Math.min(pitch, 0.95) : 0;
        contact = 1;
      } else {
        const u = (p - duty) / (1 - duty);
        const [ly, lz] = roll(hs);
        const z1 = zLand + lz;
        const y1 = anY + ly;
        const mT = -(1 - duty) * stride;
        const u2 = u * u;
        const u3 = u2 * u;
        az = (2 * u3 - 3 * u2 + 1) * st.sw.z + (u3 - 2 * u2 + u) * mT + (-2 * u3 + 3 * u2) * z1 + (u3 - u2) * mT;
        const lift = L * (0.035 * amp + 0.3 * run) + 0.01 * k * amp;
        ay = lerp(st.sw.y, y1, smooth(0, 1, u)) + lift * Math.sin(Math.PI * Math.pow(u, lerp(1, 0.82, run)));
        ax = lerp(st.sw.x, x, smooth(0, 0.7, u));
        pitch = lerp(st.sw.pitch, hs, smooth(0.08, 0.85, u)) + 0.35 * run * Math.sin(Math.PI * u) * amp;
        toe = lerp(st.sw.toe, 0, smooth(0, 0.3, u));
        contact = smooth(0.72, 1, u);
      }
      st.last = { x: ax, y: ay, z: az, pitch, toe };
      // blend with the idle stance (feet planted under the hips, slightly turned out)
      const reachX = side > 0 ? 0.028 * k : -0.03 * k;
      const reachZ = side > 0 ? 0.075 * k : -0.15 * k;
      const ix = lerp(side * s.hipX * 1.04, reachX, reach);
      const iz = lerp(0, reachZ, reach);
      let fx = lerp(ix, ax, mv);
      let fy = lerp(anY, ay, mv);
      let fz = lerp(iz, az, mv);
      let fp = pitch * mv;
      let ft = toe * mv;
      const yaw = side * lerp(lerp(0.15, side > 0 ? 0.05 : 0.55, reach), lerp(0.09, 0.03, run), mv);
      // airborne
      if (airW > 0.001) {
        const jx = side * s.hipX * 0.95;
        const jy = anY + tuck * L * 0.36;
        const jz = (side > 0 ? 0.1 : -0.12) * L * tuck * 1.6 - 0.02 * k;
        fx = lerp(fx, jx, airW);
        fy = lerp(fy, jy, airW);
        fz = lerp(fz, jz, airW);
        fp = lerp(fp, 0.35 + 0.55 * (airW - tuck), airW);
        ft = lerp(ft, 0, airW);
        contact *= 1 - airW;
      }
      o[(i === 0 ? I.footL : I.footR) + 0] = fx;
      o[(i === 0 ? I.footL : I.footR) + 1] = fy;
      o[(i === 0 ? I.footL : I.footR) + 2] = fz;
      o[(i === 0 ? I.footLr : I.footRr) + 0] = fp;
      o[(i === 0 ? I.footLr : I.footRr) + 1] = yaw;
      o[i === 0 ? I.toeL : I.toeR] = ft;
      // the highest the pelvis may be for this leg to reach its foot
      const dx = fx - (hipX + side * s.hipX);
      const dz = fz - hipZ;
      const reachY = fy + Math.sqrt(Math.max(0.01, 0.994 * L * (0.994 * L) - dx * dx - dz * dz));
      const lim = lerp(reachY + 0.5, reachY, contact);
      minReach = minReach === Infinity ? lim : -Math.log(Math.exp(-120 * (minReach - lim)) + 1) / 120 + lim;
    }
    hipY = Math.min(hipY, minReach);

    o[I.hip] = hipX;
    o[I.hip + 1] = hipY;
    o[I.hip + 2] = hipZ;
    o[I.hipR] = lean * 0.4 - land * 0.9 + 0.1 * tuck;
    o[I.hipR + 1] = hipYaw;
    o[I.hipR + 2] = hipRoll + bank * 0.5;
    // ---- spine: counter-rotate so the shoulders oppose the hips, keep the head steady -----------------------
    const sYaw = yawA * 0.95 * Math.cos(TAU * ph) + 0.11 * reach;
    const look = THREE.MathUtils.clamp(turn * 0.07, -0.3, 0.3);
    o[I.spine] = lean * 0.33 - land * 0.5 + 0.03 * (1 - mv) + 0.04 * reach;
    o[I.spine + 1] = sYaw + look * 0.3;
    o[I.spine + 2] = -hipRoll * 0.55 + bank * 0.25;
    o[I.chest] = lean * 0.27 - land * 0.3 - 0.012 * breath * (1 - mv) + 0.03 * reach;
    o[I.chest + 1] = sYaw + look * 0.3;
    o[I.chest + 2] = -hipRoll * 0.5 + bank * 0.25;
    const lookYaw = (1 - mv) * (1 - airW) * (0.2 * Math.sin(t * 0.31 + 1.3) * Math.sin(t * 0.17) + 0.05 * Math.sin(t * 0.83));
    const lookPitch = (1 - mv) * 0.035 * Math.sin(t * 0.23 + 0.5);
    const totalYaw = hipYaw + 2 * sYaw + look * 0.6;
    const totalPitch = lean - land * 1.7 + 0.1 * tuck;
    o[I.neck] = -totalPitch * 0.3 + lookPitch * 0.4;
    o[I.neck + 1] = -totalYaw * 0.4 + lookYaw * 0.4 + look * 0.5;
    o[I.neck + 2] = -(hipRoll * -0.05 + bank) * 0.4;
    o[I.head] = -totalPitch * 0.36 + lookPitch * 0.6 - 0.12 * airW * smooth(-0.5, 2, vy);
    o[I.head + 1] = -totalYaw * 0.52 + lookYaw * 0.6 + look * 0.6;
    o[I.head + 2] = -bank * 0.3 + (1 - mv) * 0.02 * Math.sin(t * 0.21);

    // ---- arms -----------------------------------------------------------------------------------------------
    const swingA = (0.44 * amp * (1 - run) + 0.78 * run) * mv;
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? 1 : -1;
      const c = Math.cos(TAU * ph + 0.25) * side; // + = this arm is back
      const fwd = Math.max(0, -c);
      const sh = i === 0 ? I.shL : I.shR;
      let sx = swingA * c + 0.16 * run * mv + 0.02 + (1 - mv) * 0.02 * Math.sin(t * 0.7 + i * 2);
      let sy = -side * (0.1 + 0.42 * run * mv);
      let sz = side * (this.restAbduct + 0.06 * run * mv + 0.012 * breath * (1 - mv));
      let el = -(0.16 + (0.14 + 0.26 * fwd) * amp * mv * (1 - run) + (1.5 + 0.22 * fwd - 0.15 * Math.max(0, c)) * run * mv);
      // jump: arms up while rising, out to the sides for balance while falling
      if (airW > 0.001) {
        const up = smooth(-1.5, 1.5, vy);
        sx = lerp(sx, lerp(-0.2, -0.75, up), airW);
        sz = lerp(sz, side * lerp(0.95, 0.5, up), airW);
        sy = lerp(sy, -side * 0.2, airW);
        el = lerp(el, -lerp(0.55, 1.0, up), airW);
      }
      // landing: arms swing down and forward a little
      sx += land * 0.9;
      o[sh] = sx;
      o[sh + 1] = sy;
      o[sh + 2] = sz;
      o[i === 0 ? I.elL : I.elR] = el;
      o[(i === 0 ? I.wrL : I.wrR) + 2] = side * -0.06;
      o[i === 0 ? I.gripL : I.gripR] = lerp(0.12, 0.85, run * mv) + 0.2 * amp * mv * (1 - run);
      if (reach > 0.001) {
        // kick-scooter handlebar: ~0.9 m above the deck, a little ahead
        const ik = i === 0 ? I.ikL : I.ikR;
        o[ik] = side * 0.168 * reach;
        o[ik + 1] = 0.905 * reach;
        o[ik + 2] = 0.2 * reach;
        o[ik + 3] = reach;
        const pole = i === 0 ? I.poleL : I.poleR;
        o[pole] = side * 0.55 * reach;
        o[pole + 1] = -0.75 * reach;
        o[pole + 2] = -0.4 * reach;
        o[(i === 0 ? I.palmL : I.palmR) + 1] = -reach;
        o[i === 0 ? I.gripL : I.gripR] = lerp(o[i === 0 ? I.gripL : I.gripR], 1.15, reach);
      }
    }
    o[I.kneeOut] = 0.02 + 0.1 * tuck;
    void m;
  }

  // =====================================================================================================
  private layerSit(o: Float32Array): void {
    const s = this.bb.spec;
    const k = this.k;
    const t = this.time;
    const breath = Math.sin(t * 1.4);
    const butt = s.r.thighTop * 0.96;
    const hy = this.seatHeight + butt;
    const hz = -0.035 * k;
    o[I.hip] = 0;
    o[I.hip + 1] = hy;
    o[I.hip + 2] = hz;
    o[I.hipR] = -0.16;
    o[I.spine] = 0.13;
    o[I.chest] = 0.07 - 0.01 * breath;
    const lookYaw = 0.14 * Math.sin(t * 0.27 + 0.6) * Math.sin(t * 0.13);
    o[I.neck] = -0.02;
    o[I.neck + 1] = lookYaw * 0.4;
    o[I.head] = -0.02 + 0.03 * Math.sin(t * 0.21);
    o[I.head + 1] = lookYaw * 0.6;
    const L1 = this.L1;
    const L2 = this.L2;
    // thighs level (resting on the seat), shins hanging; a low seat pushes the feet forward
    const kneeY = hy - 0.012 * k;
    const drop = kneeY - s.ankleY;
    let ay = kneeY - L2;
    let az = hz + L1 * 0.995;
    let pitch = 0.22;
    if (drop < L2) {
      ay = s.ankleY;
      az = hz + L1 * 0.97 + Math.sqrt(Math.max(0, L2 * L2 - drop * drop)) * 0.96;
      pitch = 0;
      // sitting on the ground: knees come up a little instead of locking straight
      const maxD = (L1 + L2) * 0.965;
      const d = Math.hypot(az - hz, ay - hy);
      if (d > maxD) az = hz + Math.sqrt(Math.max(0, maxD * maxD - (ay - hy) * (ay - hy)));
      if (drop < L2 * 0.5) pitch = -0.35 * (1 - drop / (L2 * 0.5));
    }
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? 1 : -1;
      const f = i === 0 ? I.footL : I.footR;
      o[f] = side * (s.hipX + 0.012 * k);
      o[f + 1] = ay;
      o[f + 2] = az;
      o[(i === 0 ? I.footLr : I.footRr) + 0] = pitch;
      o[(i === 0 ? I.footLr : I.footRr) + 1] = side * 0.1;
      // hands rest on the thighs
      const sh = i === 0 ? I.shL : I.shR;
      o[sh] = -0.35;
      o[sh + 2] = side * 0.12;
      o[i === 0 ? I.elL : I.elR] = -1.0;
      const ik = i === 0 ? I.ikL : I.ikR;
      const tz = hz + L1 * 0.56;
      const ty = lerp(hy, kneeY, 0.56) + lerp(s.r.thighTop, s.r.thighMid, 0.6) + 0.03 * k;
      o[ik] = side * (s.hipX + 0.004 * k);
      o[ik + 1] = ty;
      o[ik + 2] = tz;
      o[ik + 3] = 1;
      const pole = i === 0 ? I.poleL : I.poleR;
      o[pole] = side * 0.75;
      o[pole + 1] = -0.25;
      o[pole + 2] = -0.6;
      o[(i === 0 ? I.palmL : I.palmR) + 1] = -1;
      o[i === 0 ? I.gripL : I.gripR] = 0.1;
    }
    o[I.kneeOut] = 0.05;
  }

  // =====================================================================================================
  private layerLie(o: Float32Array): void {
    const s = this.bb.spec;
    const k = this.k;
    const t = this.time;
    const breath = Math.sin(t * lerp(1.3, 0.9, clamp01(this.wSleep.x)));
    const back = s.torso[2][3] + 0.012 * k;
    const hy = this.seatHeight + back;
    const hz = s.H * 0.5 - s.hipY;
    o[I.hip + 1] = hy;
    o[I.hip + 2] = hz;
    o[I.hipR] = -Math.PI / 2 + 0.02;
    o[I.chest] = -0.02 - 0.012 * breath;
    o[I.neck] = 0.06;
    o[I.head] = 0.04;
    o[I.head + 1] = 0.06 * Math.sin(t * 0.1);
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? 1 : -1;
      const f = i === 0 ? I.footL : I.footR;
      o[f] = side * (s.hipX * 1.25);
      o[f + 1] = this.seatHeight + 0.24 * s.footLen + 0.012 * k;
      o[f + 2] = hz + this.legLen * 0.992;
      o[(i === 0 ? I.footLr : I.footRr) + 0] = -Math.PI / 2 + 0.38;
      o[(i === 0 ? I.footLr : I.footRr) + 1] = side * 0.28;
      const sh = i === 0 ? I.shL : I.shR;
      o[sh] = 0.13;
      o[sh + 1] = -side * 0.5;
      o[sh + 2] = side * (this.restAbduct + 0.16);
      o[i === 0 ? I.elL : I.elR] = -0.2;
      o[i === 0 ? I.gripL : I.gripR] = 0.15;
    }
    o[I.kneeOut] = 0.08;
  }

  // =====================================================================================================
  private layerRide(o: Float32Array, dt: number, speed: number): void {
    const s = this.bb.spec;
    const k = this.k;
    const sh0 = this.seatHeight;
    // bicycle geometry relative to the saddle, interpolated between the kids' and the city bike
    const q = clamp01((sh0 - 0.66) / 0.21);
    const bbY = lerp(0.25, 0.28, q);
    const bbZ = lerp(0.16, 0.2, q);
    const crank = lerp(0.125, 0.165, q);
    const barY = lerp(0.93, 1.04, q);
    const barZ = lerp(0.44, 0.57, q);
    const gripX = lerp(0.2, 0.225, q);
    const gear = lerp(0.45, 0.62, q);
    this.pedal += (speed * dt) / gear;
    const A = (this.pedalAngle ?? this.pedal) - 1.0;
    const butt = s.r.thighTop * 0.8;
    const hy = sh0 + butt;
    const hz = -0.01 * k;
    // lean until the hands reach the grips
    const torso = s.shoulderY - s.hipY;
    const gy = barY + 0.035;
    const gz = barZ - 0.05;
    let lo = 0.12;
    let hi = 1.15;
    for (let i = 0; i < 12; i++) {
      const a = (lo + hi) / 2;
      const d = Math.hypot(hy + torso * Math.cos(a) - gy, hz + torso * Math.sin(a) - gz, s.shoulderX - gripX);
      if (d > this.armLen * 0.93) lo = a;
      else hi = a;
    }
    const lean = hi;
    const bob = Math.sin(2 * A);
    const moving = clamp01(Math.abs(speed) / 1.5);
    o[I.hip] = 0.006 * k * Math.sin(A) * moving;
    o[I.hip + 1] = hy;
    o[I.hip + 2] = hz;
    o[I.hipR] = lean * 0.5;
    o[I.hipR + 2] = 0.03 * Math.sin(A) * moving;
    o[I.spine] = lean * 0.3 + 0.015 * bob * moving;
    o[I.spine + 2] = -0.02 * Math.sin(A) * moving;
    o[I.chest] = lean * 0.2;
    o[I.neck] = -lean * 0.35;
    o[I.head] = -lean * 0.45;
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? 1 : -1;
      // left pedal = bb + crank·(−cos A, −sin A) in (y, z); the right one is opposite
      const py = bbY - side * crank * Math.cos(A);
      const pz = bbZ - side * crank * Math.sin(A);
      // ankling: toes dip at the bottom of the stroke
      const pitch = 0.22 - side * 0.18 * Math.cos(A + 0.6);
      const c = Math.cos(pitch);
      const sn = Math.sin(pitch);
      const bz = 0.4 * s.footLen;
      // ankle = pedal top − Rx(pitch)·(0, −ankleY, bz)
      const f = i === 0 ? I.footL : I.footR;
      o[f] = side * 0.135;
      o[f + 1] = py + 0.014 - (-s.ankleY * c - bz * sn);
      o[f + 2] = pz - (-s.ankleY * sn + bz * c);
      o[(i === 0 ? I.footLr : I.footRr) + 0] = pitch;
      const sh = i === 0 ? I.shL : I.shR;
      o[sh] = -0.9;
      o[sh + 2] = side * 0.2;
      o[i === 0 ? I.elL : I.elR] = -0.3;
      const ik = i === 0 ? I.ikL : I.ikR;
      o[ik] = side * gripX;
      o[ik + 1] = gy;
      o[ik + 2] = gz;
      o[ik + 3] = 1;
      const pole = i === 0 ? I.poleL : I.poleR;
      o[pole] = side * 0.6;
      o[pole + 1] = -0.7;
      o[pole + 2] = -0.35;
      o[(i === 0 ? I.palmL : I.palmR) + 1] = -1;
      o[i === 0 ? I.gripL : I.gripR] = 1.15;
    }
    o[I.kneeOut] = 0.06;
  }

  // =====================================================================================================
  // one-shot gestures, layered over the blended pose
  // =====================================================================================================
  private applyGesture(P: Float32Array, dt: number, wStand: number): void {
    const g = this.gest;
    if (!g) return;
    g.t += dt;
    if (g.t >= g.dur) {
      this.gest = null;
      return;
    }
    const s = this.bb.spec;
    const k = this.k;
    const L = this.legLen;
    const t = g.t;
    const w = smooth(0, 0.28, t) * smooth(g.dur, g.dur - 0.38, t);
    const mix = (i: number, target: number, ww = w) => {
      P[i] = lerp(P[i], target, ww);
    };
    const noIk = (side: 'L' | 'R', ww = w) => {
      const ik = side === 'L' ? I.ikL : I.ikR;
      const pole = side === 'L' ? I.poleL : I.poleR;
      const palm = side === 'L' ? I.palmL : I.palmR;
      for (let i = 0; i < 4; i++) P[ik + i] *= 1 - ww;
      for (let i = 0; i < 3; i++) {
        P[pole + i] *= 1 - ww;
        P[palm + i] *= 1 - ww;
      }
    };
    if (g.kind === 'wave') {
      // right arm up, forearm swinging from the elbow
      noIk('R');
      const osc = Math.sin(t * 9.5);
      mix(I.shR, -0.25);
      mix(I.shR + 1, 1.45);
      mix(I.shR + 2, -1.75);
      mix(I.elR, -1.05 + 0.42 * osc);
      mix(I.wrR + 2, 0.12 * osc);
      mix(I.gripR, -0.1);
      mix(I.clavR, 0.2);
      P[I.head + 2] += -0.08 * w;
      P[I.chest + 2] += 0.03 * w;
      P[I.head + 1] += -0.06 * w;
    } else if (g.kind === 'cheer') {
      noIk('L');
      noIk('R');
      const ws = w * wStand;
      // two hops
      const hopT = t - 0.22;
      const hopDur = 0.5;
      let hop = 0;
      let crouch = 0;
      if (hopT > 0 && hopT < hopDur * 2) {
        const u = (hopT % hopDur) / hopDur;
        hop = 4 * u * (1 - u) * (hopT < hopDur ? 1 : 0.7);
      }
      crouch = smooth(0.02, 0.2, t) * smooth(0.3, 0.2, t) + 0.6 * gaussLike(t - (0.22 + hopDur), 0.07) + 0.5 * gaussLike(t - (0.22 + hopDur * 2), 0.09);
      const up = 0.13 * L * hop * ws;
      P[I.hip + 1] += up - 0.07 * L * crouch * ws;
      for (const f of [I.footL, I.footR]) P[f + 1] += up * 1.0 + 0.05 * L * hop * ws;
      for (const fr of [I.footLr, I.footRr]) P[fr] += 0.5 * hop * ws;
      const shake = Math.sin(t * 13) * 0.07;
      for (const [sh, el, side] of [[I.shL, I.elL, 1], [I.shR, I.elR, -1]] as number[][]) {
        mix(sh, -0.25);
        mix(sh + 1, side * 0.5);
        mix(sh + 2, side * (2.55 + shake));
        mix(el, -0.38 - 0.2 * crouch);
      }
      mix(I.clavL, 0.3);
      mix(I.clavR, 0.3);
      mix(I.gripL, 0.9);
      mix(I.gripR, 0.9);
      P[I.chest] += -0.08 * w;
      P[I.head] += -0.14 * w;
    } else if (g.kind === 'pet') {
      const ws = w * wStand;
      noIk('R', ws);
      // bend the knees and hinge forward, right hand strokes something at knee height in front
      P[I.hip + 1] -= 0.16 * L * ws;
      P[I.hip + 2] -= 0.12 * L * ws;
      P[I.hipR] += 0.62 * ws;
      P[I.spine] += 0.34 * ws;
      P[I.chest] += 0.22 * ws;
      P[I.neck] += -0.25 * ws;
      P[I.head] += -0.1 * ws;
      const stroke = Math.sin(t * 5.2);
      const ik = I.ikR;
      const tx = -0.07 * k;
      const ty = s.kneeY * 0.98 + 0.02 * k * Math.cos(t * 5.2);
      const tz = 0.47 * L + 0.07 * k * stroke;
      // blend the IK target in (weights are premultiplied)
      P[ik] += tx * ws;
      P[ik + 1] += ty * ws;
      P[ik + 2] += tz * ws;
      P[ik + 3] += ws;
      P[I.poleR] += -0.7 * ws;
      P[I.poleR + 1] += 0.1 * ws;
      P[I.poleR + 2] += -0.6 * ws;
      P[I.palmR + 1] += -ws;
      mix(I.gripR, 0.05, ws);
      // left hand on the left knee for support
      mix(I.shL, -0.35, ws);
      mix(I.elL, -0.5, ws);
    } else if (g.kind === 'kick') {
      const ws = wStand;
      const u = t / g.dur;
      // wind up → strike → follow through → back
      const back = gaussLike(u - 0.2, 0.13);
      const fwd = gaussLike(u - 0.5, 0.15);
      const e = smooth(0, 0.12, u) * smooth(1, 0.8, u);
      const f = I.footR;
      P[f + 2] += (-0.33 * L * back + 0.62 * L * fwd) * ws;
      P[f + 1] += (0.16 * L * back + 0.3 * L * fwd + 0.03 * L * e) * ws;
      P[I.footRr] += (0.5 * back + 0.75 * fwd) * ws;
      P[I.hip] += 0.035 * k * e * ws;
      P[I.hipR] += (0.1 * back - 0.2 * fwd) * ws;
      P[I.hipR + 1] += (-0.12 * back + 0.22 * fwd) * ws;
      P[I.spine] += (0.05 * back + 0.06 * fwd) * ws;
      P[I.chest + 1] += (0.12 * back - 0.28 * fwd) * ws;
      // arms counterbalance
      P[I.shL] += (0.35 * back - 0.75 * fwd) * ws;
      P[I.shR] += (-0.3 * back + 0.6 * fwd) * ws;
      P[I.shL + 2] += 0.35 * e * ws;
      P[I.shR + 2] -= 0.4 * e * ws;
      P[I.elL] -= 0.4 * e * ws;
      P[I.elR] -= 0.3 * e * ws;
    }
  }

  // =====================================================================================================
  // write the blended parameters to the bones
  // =====================================================================================================
  private apply(P: Float32Array, dt: number, v: number, wStand: number, motion: CharacterMotion): void {
    const bn = this.bones;
    const off = this.off;
    const s = this.bb.spec;
    const t = this.time;

    // ---- trunk ---------------------------------------------------------------------------------------------
    const hips = bn[B.hips];
    hips.position.set(P[I.hip], P[I.hip + 1], P[I.hip + 2]);
    hips.quaternion.setFromEuler(_e.set(P[I.hipR], P[I.hipR + 1], P[I.hipR + 2], 'YXZ'));
    for (const [bone, idx] of [[B.spine, I.spine], [B.chest, I.chest], [B.neck, I.neck], [B.head, I.head]] as number[][]) {
      bn[bone].quaternion.setFromEuler(_e.set(P[idx], P[idx + 1], P[idx + 2], 'YXZ'));
    }
    // breathing
    const asleep = clamp01(this.wSleep.x);
    const br = Math.sin(t * lerp(1.55, 0.95, asleep)) * (0.6 + 0.4 * asleep) + clamp01(v / 4) * 0.5 * Math.sin(t * 4.2);
    bn[B.chest].scale.set(1 + 0.008 * br, 1, 1 + 0.028 * br);

    const qHips = hips.quaternion;
    const pHips = hips.position;

    // ---- legs (two-bone IK towards the ankle targets) ----------------------------------------------------------
    for (let i = 0; i < 2; i++) {
      const L = i === 0;
      const side = L ? 1 : -1;
      const thigh = bn[L ? B.thighL : B.thighR];
      const knee = bn[L ? B.kneeL : B.kneeR];
      const shin = bn[L ? B.shinL : B.shinR];
      const foot = bn[L ? B.footL : B.footR];
      const toe = bn[L ? B.toeL : B.toeR];
      const f = L ? I.footL : I.footR;
      const fr = L ? I.footLr : I.footRr;
      const H = _v1.copy(off[L ? B.thighL : B.thighR]).applyQuaternion(qHips).add(pHips);
      const A = _v2.set(P[f], P[f + 1], P[f + 2]);
      const yaw = P[fr + 1];
      const pole = _v3.set(side * P[I.kneeOut] + Math.sin(yaw) * 0.6, 0.35, 1).applyQuaternion(qHips);
      this.solve(H, A, pole, this.L1, this.L2, 1, _q1, _q2);
      thigh.quaternion.copy(_qi.copy(qHips).invert()).multiply(_q1);
      shin.quaternion.copy(_qi.copy(_q1).invert()).multiply(_q2);
      knee.quaternion.copy(ID).slerp(shin.quaternion, 0.5);
      _q3.setFromEuler(_e.set(P[fr], yaw, P[fr + 2], 'YXZ'));
      foot.quaternion.copy(_qi.copy(_q2).invert()).multiply(_q3);
      toe.quaternion.setFromAxisAngle(X_AXIS, P[L ? I.toeL : I.toeR]);
    }

    // ---- arms -----------------------------------------------------------------------------------------------
    const qSpine = _q1.copy(qHips).multiply(bn[B.spine].quaternion);
    const pSpine = _v1.copy(off[B.spine]).applyQuaternion(qHips).add(pHips);
    const pChest = _v2.copy(off[B.chest]).applyQuaternion(qSpine).add(pSpine);
    const qChest = _q2.copy(qSpine).multiply(bn[B.chest].quaternion);
    const pChestC = pChest.clone();
    const qChestC = qChest.clone();
    for (let i = 0; i < 2; i++) {
      const L = i === 0;
      const side = L ? 1 : -1;
      const clav = bn[L ? B.clavL : B.clavR];
      const arm = bn[L ? B.armL : B.armR];
      const elbow = bn[L ? B.elbowL : B.elbowR];
      const fore = bn[L ? B.foreL : B.foreR];
      const hand = bn[L ? B.handL : B.handR];
      const fing = bn[L ? B.fingL : B.fingR];
      const sh = L ? I.shL : I.shR;
      const el = P[L ? I.elL : I.elR];
      const wr = L ? I.wrL : I.wrR;
      // FK pose
      const qArmFk = _q1.setFromEuler(_e.set(P[sh], P[sh + 1], P[sh + 2], 'ZXY')).clone();
      const qForeFk = _q2.setFromAxisAngle(X_AXIS, el).clone();
      // shoulder girdle lifts with the arm
      const raise = Math.abs(P[sh + 2]) + Math.max(0, -P[sh]) * 0.6;
      const lift = P[L ? I.clavL : I.clavR] + 0.3 * smooth(1.0, 2.6, raise);
      clav.quaternion.setFromEuler(_e.set(0, 0, side * lift, 'XYZ'));
      const qClav = _q3.copy(qChestC).multiply(clav.quaternion).clone();
      const pClav = _v1.copy(off[L ? B.clavL : B.clavR]).applyQuaternion(qChestC).add(pChestC);
      const S = pClav.clone().add(_v2.copy(off[L ? B.armL : B.armR]).applyQuaternion(qClav));
      const ik = L ? I.ikL : I.ikR;
      const w = clamp01(P[ik + 3]);
      let twist = 0;
      if (w > 0.001) {
        const inv = 1 / Math.max(P[ik + 3], 1e-4);
        const W = _v2.set(P[ik] * inv, P[ik + 1] * inv, P[ik + 2] * inv);
        const po = L ? I.poleL : I.poleR;
        const pole = _v3.set(P[po], P[po + 1], P[po + 2]);
        if (pole.lengthSq() < 1e-6) pole.set(side * 0.5, -0.6, -0.6);
        const qU = new THREE.Quaternion();
        const qF = new THREE.Quaternion();
        this.solve(S, W, pole, s.upperArm, s.foreArm, -1, qU, qF);
        const qArmIk = _qi.copy(qClav).invert().multiply(qU).clone();
        const qForeIk = _qi.copy(qU).invert().multiply(qF).clone();
        qArmFk.slerp(qArmIk, w);
        qForeFk.slerp(qForeIk, w);
        // turn the palm towards the requested direction with a forearm / wrist twist
        const pa = L ? I.palmL : I.palmR;
        const pn = _v4.set(P[pa], P[pa + 1], P[pa + 2]);
        if (pn.lengthSq() > 1e-4) {
          pn.normalize().applyQuaternion(_qi.copy(qF).invert());
          twist = (L ? Math.atan2(pn.z, -pn.x) : Math.atan2(-pn.z, pn.x)) * w;
          twist = THREE.MathUtils.clamp(twist, -1.7, 1.7);
        }
      }
      arm.quaternion.copy(qArmFk);
      fore.quaternion.copy(qForeFk);
      if (twist !== 0) fore.quaternion.multiply(_q4.setFromAxisAngle(Y_AXIS, twist * 0.5));
      elbow.quaternion.copy(ID).slerp(fore.quaternion, 0.5);
      hand.quaternion.setFromEuler(_e.set(P[wr], P[wr + 1] + twist * 0.5, P[wr + 2], 'YXZ'));
      // fingers curl towards the palm (the palm faces -x on the left hand)
      fing.quaternion.setFromEuler(_e.set(0, 0, -side * P[L ? I.gripL : I.gripR] * 1.1, 'XYZ'));
    }

    // ---- eyes -----------------------------------------------------------------------------------------------
    this.blinkAt -= dt;
    if (this.blinkAt <= 0) {
      this.blinkAt = 2.2 + this.rnd() * 3.6;
      if (this.rnd() < 0.18) this.blinkAt = 0.32;
    }
    const sinceBlink = this.blinkAt;
    // a blink takes ~0.16 s just before the timer runs out
    const bt = 0.16 - sinceBlink;
    this.blink = bt > 0 ? Math.sin(clamp01(bt / 0.16) * Math.PI) : 0;
    const closed = Math.max(this.blink, asleep);
    const lidTravel = (s.child ? 77 : s.female ? 69 : 64) * (Math.PI / 180);
    bn[B.lid].quaternion.setFromAxisAngle(X_AXIS, closed * lidTravel);

    // ---- loose hair ----------------------------------------------------------------------------------------------
    const hair = this.bb.hair;
    if (hair.swing > 0) {
      const lying = clamp01(this.wLie.x);
      const bob = Math.sin(TAU * 2 * this.phase) * clamp01(this.wMove.x);
      const stream = clamp01(v / 5) * 0.55 * wStand;
      const hx = this.hairX.step(stream + bob * 0.16 * clamp01(v / 2) - (motion.vy ?? 0) * 0.06 * clamp01(this.wAir.x), 11, 0.3, dt);
      const hz = this.hairZ.step(-this.turn.x * 0.06 * clamp01(v / 2) + P[I.hipR + 2] * 1.5, 9, 0.3, dt);
      const hx2 = this.hairX2.step(hx, 13, 0.35, dt);
      if (hair.chain) {
        bn[B.hairA].quaternion.setFromEuler(_e.set(hx * hair.swing - 0.5 * lying, 0, hz * hair.swing, 'XYZ'));
        bn[B.hairB].quaternion.setFromEuler(_e.set((hx2 - hx) * 1.4 * hair.swing + hx * 0.4, 0, hz * 0.7 * hair.swing, 'XYZ'));
      } else {
        const sw = hair.swing * (1 - lying);
        bn[B.hairA].quaternion.setFromEuler(_e.set(-(hx - stream) * 0.9 * sw, 0, hz * 0.5 * sw, 'XYZ'));
        bn[B.hairB].quaternion.setFromEuler(_e.set((hx2 - stream) * 0.9 * sw, 0, hz * 0.5 * sw, 'XYZ'));
      }
    }
  }

  /**
   * Two-bone IK. `H` root joint, `A` target for the end joint, `pole` direction the middle joint should point to.
   * `bend` = +1 for a knee (middle joint towards the limb's local +Z), −1 for an elbow (towards local −Z).
   * Writes the character-space orientations of both bones (bones hang along local −Y at rest).
   */
  private solve(H: THREE.Vector3, A: THREE.Vector3, pole: THREE.Vector3, l1: number, l2: number, bend: number, q1: THREE.Quaternion, q2: THREE.Quaternion): void {
    const dir = _vy.copy(A).sub(H);
    let d = dir.length();
    if (d < 1e-5) {
      dir.set(0, -1, 0);
      d = 1e-5;
    } else dir.multiplyScalar(1 / d);
    d = THREE.MathUtils.clamp(d, Math.abs(l1 - l2) + 0.01, (l1 + l2) * 0.9985);
    const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    // perpendicular to the limb axis, towards the pole
    const perp = _vz.copy(pole).addScaledVector(dir, -pole.dot(dir));
    if (perp.lengthSq() < 1e-8) perp.set(0, 0, 1).addScaledVector(dir, -dir.z);
    perp.normalize();
    const K = _vx.copy(H).addScaledVector(dir, a).addScaledVector(perp, h);
    const end = _v4.copy(H).addScaledVector(dir, d);
    // upper bone
    const y1 = new THREE.Vector3().copy(H).sub(K).normalize();
    const zh = perp.clone().multiplyScalar(bend);
    const x = new THREE.Vector3().crossVectors(y1, zh).normalize();
    const z1 = new THREE.Vector3().crossVectors(x, y1);
    q1.setFromRotationMatrix(_m.makeBasis(x, y1, z1));
    const y2 = new THREE.Vector3().copy(K).sub(end).normalize();
    const z2 = new THREE.Vector3().crossVectors(x, y2);
    q2.setFromRotationMatrix(_m.makeBasis(x, y2, z2));
  }
}

function gaussLike(x: number, s: number): number {
  return Math.exp(-(x * x) / (s * s));
}
