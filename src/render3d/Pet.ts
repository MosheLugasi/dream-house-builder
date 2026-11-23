/**
 * Procedural, procedurally animated pets (dog / cat).
 *
 * One skinned mesh (2 materials: fur + smooth parts) driven by ~35 bones. There are no keyframes:
 * every frame the body posture (pelvis, spine, chest, neck, head) is computed from the mood and
 * the gait phase, the paws are placed on the ground and the legs are solved with two-bone IK, and
 * tail, ears, eyes, jaw and tongue get layered secondary motion.
 *
 * `root`: origin on the ground under the middle of the body, the animal faces +Z, meters.
 */
import * as THREE from 'three';
import type { PetRuntime } from '../catalog/types';
import { buildPetGeometry, legJoints, makeRig, tailJoints, type Rig } from './pet/build';
import { furTextures } from './pet/mesh';
import { B, BREEDS, type Breed } from './pet/spec';

export type PetKind = 'dog' | 'cat';
export type PetMood = 'idle' | 'sit' | 'lie' | 'happy';
export interface PetOptions {
  /** dog variants: 'retriever' (default) or 'terrier' */
  breed?: Breed['key'];
}

/* ------------------------------------------------------------------ module caches */

const rigCache = new Map<string, Rig>();
interface GeoEntry {
  geometry: THREE.BufferGeometry;
  triangles: number;
  refs: number;
}
const geoCache = new Map<string, GeoEntry>();
const MAX_GEOS = 24;
let materials: [THREE.Material, THREE.Material] | null = null;

function getRig(b: Breed): Rig {
  let r = rigCache.get(b.key);
  if (!r) rigCache.set(b.key, (r = makeRig(b)));
  return r;
}

function getGeometry(b: Breed, rig: Rig, colors: Record<string, string>): { key: string; entry: GeoEntry } {
  const key = `${b.key}|${colors.coat ?? ''}|${colors.markings ?? ''}|${colors.collar ?? ''}`;
  let e = geoCache.get(key);
  if (!e) {
    if (geoCache.size >= MAX_GEOS) {
      for (const [k, old] of geoCache) {
        if (old.refs <= 0) {
          old.geometry.dispose();
          geoCache.delete(k);
          if (geoCache.size < MAX_GEOS) break;
        }
      }
    }
    const built = buildPetGeometry(b, rig, colors);
    // generous static bounds: the skinned pose never leaves them
    const r = Math.max(b.h * 2.2, 0.5);
    built.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, b.h * 0.6, 0), r);
    built.geometry.boundingBox = new THREE.Box3(new THREE.Vector3(-r, 0, -r), new THREE.Vector3(r, r * 1.3, r));
    e = { geometry: built.geometry, triangles: built.triangles, refs: 0 };
    geoCache.set(key, e);
  }
  return { key, entry: e };
}

function getMaterials(): [THREE.Material, THREE.Material] {
  if (materials) return materials;
  const tex = furTextures();
  const fur = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
  fur.name = 'pet|fur';
  if (tex) {
    fur.map = tex.map;
    fur.normalMap = tex.normalMap;
    fur.normalScale = new THREE.Vector2(0.55, 0.55);
  }
  const smooth = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.22, metalness: 0 });
  smooth.name = 'pet|smooth';
  materials = [fur, smooth];
  return materials;
}

/* ------------------------------------------------------------------ small math */

const damp = (cur: number, target: number, lambda: number, dt: number) => cur + (target - cur) * (1 - Math.exp(-lambda * dt));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const sstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const frac = (x: number) => x - Math.floor(x);
const TAU = Math.PI * 2;

interface LegPose {
  /** paw-joint target of the LEFT leg in root space */
  x: number;
  z: number;
  /** pastern lean: the ankle sits L3·(0, cos φ, −sin φ) from the paw joint */
  phi: number;
  /** IK pole (left leg) – x is mirrored for the right leg */
  poleX: number;
  poleY: number;
  yaw: number;
}

interface Posture {
  pelY: number;
  pelZ: number;
  pelPitch: number;
  spineAng: number;
  chestPitch: number;
  neck: number;
  head: number;
  front: LegPose;
  hind: LegPose;
}

interface LegRig {
  front: boolean;
  side: number;
  bone: number;
  parent: number;
  /** joint offset from the parent bone (bind) */
  attach: THREE.Vector3;
  L1: number;
  L2: number;
  L3: number;
  phi0: number;
  /** paw-joint height above the ground when the paw is flat */
  hp: number;
  rest: THREE.Vector3[];
  /** inverse (transpose) of the rest bases of the two upper segments */
  m1: THREE.Matrix4;
  m2: THREE.Matrix4;
  poleZ: number;
}

const _a = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();
const _k = new THREE.Vector3();
const _n = new THREE.Vector3();
const _pp = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _t = new THREE.Vector3();
const _x = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();

/** two-bone IK: finds the middle joint; `c` is pulled into reach. Returns the bend-plane normal in `n`. */
function solve2(a: THREE.Vector3, c: THREE.Vector3, L1: number, L2: number, pole: THREE.Vector3, knee: THREE.Vector3, n: THREE.Vector3): void {
  _d.subVectors(c, a);
  let dist = _d.length();
  const maxR = (L1 + L2) * 0.9985;
  const minR = Math.abs(L1 - L2) * 1.05 + 1e-4;
  if (dist > maxR) {
    c.copy(a).addScaledVector(_d, maxR / dist);
    dist = maxR;
  } else if (dist < minR) {
    if (dist < 1e-6) _d.set(0, -1, 0), (dist = 1);
    c.copy(a).addScaledVector(_d, minR / dist);
    dist = minR;
  }
  _d.subVectors(c, a).divideScalar(dist);
  const cosA = clamp((L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist), -1, 1);
  const sinA = Math.sqrt(1 - cosA * cosA);
  _pp.copy(pole).addScaledVector(_d, -pole.dot(_d));
  if (_pp.lengthSq() < 1e-10) _pp.set(0, 0, 1);
  _pp.normalize();
  knee.copy(a).addScaledVector(_d, L1 * cosA).addScaledVector(_pp, L1 * sinA);
  n.crossVectors(_d, _pp).normalize();
}

/** rotation whose columns are (n, d, n × d) */
function basis(n: THREE.Vector3, d: THREE.Vector3, out: THREE.Matrix4): THREE.Matrix4 {
  _x.crossVectors(n, d);
  return out.makeBasis(n, d, _x);
}

/** the middle joint (elbow / knee) bends towards (0, POLE_Y, ∓1): stable for legs reaching far forward or back */
const POLE_Y = -0.5;

let instanceCounter = 0;

export class Pet implements PetRuntime {
  readonly root = new THREE.Group();
  readonly kind: PetKind;
  readonly breed: Breed;
  /** the skinned mesh (2 draw calls) */
  readonly mesh: THREE.SkinnedMesh;
  readonly bones: THREE.Bone[] = [];
  readonly triangles: number;

  private rig: Rig;
  private geoKey: string;
  private skeleton: THREE.Skeleton;
  private legs: LegRig[] = [];
  private stand: Posture;
  private sit: Posture;
  private lie: Posture;
  private cur: Posture;
  private spineLen: number;
  private spineAng0: number;
  private legLen: number;
  private maxStance: number;
  private tailRest: THREE.Vector3[] = [];
  private tailSeg: number;

  // state
  private time = 0;
  private phase = 0;
  private v = 0;
  private gait = 0;
  private wSit = [0, 0];
  private wLie = [0, 0];
  private wHappy = [0, 0];
  private pant = 0;
  private pantTimer = 0;
  private lookYaw = 0;
  private lookPitch = 0;
  private lookYawT = 0;
  private lookPitchT = 0;
  private lookTimer = 1.5;
  private blink = 0;
  private blinkTimer = 2;
  private earFlick = [0, 0];
  private flickTimer = 3;
  private wag = 0;
  private wagPhase = 0;
  private tailPitch: number[] = [];
  private tailYaw: number[] = [];
  private seed: number;
  private disposed = false;

  constructor(kind: PetKind, colors: Record<string, string> = {}, opts: PetOptions = {}) {
    this.kind = kind;
    const b = (this.breed = kind === 'cat' ? BREEDS.cat : BREEDS[opts.breed === 'terrier' ? 'terrier' : 'retriever']);
    const rig = (this.rig = getRig(b));
    const { key, entry } = getGeometry(b, rig, colors);
    this.geoKey = key;
    entry.refs++;
    this.triangles = entry.triangles;
    this.seed = (++instanceCounter * 2654435761) >>> 0;
    this.time = (this.seed % 1000) / 100;
    this.root.name = `pet:${b.key}`;

    // ---- skeleton (all bind orientations are identity)
    const inverses: THREE.Matrix4[] = [];
    for (let i = 0; i < rig.count; i++) {
      const bone = new THREE.Bone();
      bone.name = rig.names[i];
      this.bones.push(bone);
      inverses.push(new THREE.Matrix4().makeTranslation(-rig.pos[i].x, -rig.pos[i].y, -rig.pos[i].z));
    }
    for (let i = 0; i < rig.count; i++) {
      const p = rig.parent[i];
      if (p < 0) {
        this.bones[i].position.copy(rig.pos[i]);
        this.root.add(this.bones[i]);
      } else {
        this.bones[i].position.copy(rig.pos[i]).sub(rig.pos[p]);
        this.bones[p].add(this.bones[i]);
      }
    }
    this.skeleton = new THREE.Skeleton(this.bones, inverses);
    const mesh = (this.mesh = new THREE.SkinnedMesh(entry.geometry, getMaterials()));
    mesh.name = 'pet-skin';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.bind(this.skeleton, new THREE.Matrix4());
    // static bounds (the default would be recomputed from the skinned vertices)
    mesh.boundingSphere = entry.geometry.boundingSphere!.clone();
    mesh.boundingBox = entry.geometry.boundingBox!.clone();
    this.root.add(mesh);

    // ---- leg rigs
    const pole = new THREE.Vector3();
    for (let l = 0; l < 4; l++) {
      const front = l < 2;
      const side = l % 2 === 0 ? 1 : -1;
      const J = legJoints(front ? b.front : b.hind, side);
      const parent = front ? B.chest : B.pelvis;
      const L1 = J[0].distanceTo(J[1]);
      const L2 = J[1].distanceTo(J[2]);
      const L3 = J[2].distanceTo(J[3]);
      const poleZ = front ? -1 : 1;
      pole.set(0, POLE_Y, poleZ);
      const c = J[2].clone();
      const knee = new THREE.Vector3();
      const n = new THREE.Vector3();
      solve2(J[0], c, L1, L2, pole, knee, n);
      const d1 = J[1].clone().sub(J[0]).normalize();
      const d2 = J[2].clone().sub(J[1]).normalize();
      this.legs.push({
        front,
        side,
        bone: B.leg + l * 4,
        parent,
        attach: J[0].clone().sub(rig.pos[parent]),
        L1,
        L2,
        L3,
        phi0: Math.atan2(J[3].z - J[2].z, J[2].y - J[3].y),
        hp: J[3].y,
        rest: J,
        m1: basis(n, d1, new THREE.Matrix4()).transpose(),
        m2: basis(n, d2, new THREE.Matrix4()).transpose(),
        poleZ,
      });
    }
    this.legLen = b.front.j[0][1];

    // ---- postures
    const pel = rig.pos[B.pelvis];
    const che = rig.pos[B.chest];
    this.spineLen = pel.distanceTo(che);
    this.spineAng0 = Math.atan2(che.y - pel.y, che.z - pel.z);
    const fl = this.legs[0];
    const hl = this.legs[2];
    this.stand = {
      pelY: 0,
      pelZ: 0,
      pelPitch: 0,
      spineAng: 0,
      chestPitch: 0,
      neck: 0,
      head: 0,
      front: { x: fl.rest[3].x, z: fl.rest[3].z, phi: fl.phi0, poleX: 0, poleY: 0, yaw: 0 },
      hind: { x: hl.rest[3].x, z: hl.rest[3].z, phi: hl.phi0, poleX: 0, poleY: 0, yaw: 0 },
    };
    this.sit = this.makeSit();
    this.lie = this.makeLie();
    this.cur = JSON.parse(JSON.stringify(this.stand)) as Posture;

    // the longest stance the legs can cover without over-reaching
    const reach = (l: LegRig, drop: number) => {
      const r = (l.L1 + l.L2) * 0.985 + l.L3;
      const hgt = l.rest[0].y - l.hp - drop;
      return 2 * 0.9 * Math.sqrt(Math.max(1e-4, r * r - hgt * hgt));
    };
    this.maxStance = Math.min(reach(fl, this.legLen * 0.05), reach(hl, this.legLen * 0.05));

    // ---- tail
    const tj = tailJoints(b);
    this.tailSeg = b.tail.len / b.tail.n;
    for (let i = 0; i < b.tail.n; i++) {
      this.tailRest.push(tj[i + 1].clone().sub(tj[i]));
      this.tailPitch.push(b.tail.pitch[i]);
      this.tailYaw.push(0);
    }

    this.update(0, 0, 'idle');
    this.root.updateMatrixWorld(true);
    this.skeleton.update();
  }

  /* ---------------------------------------------------------------- postures */

  /** position of a leg's top joint for a posture (left side), without secondary motion */
  private jointFor(p: Posture, leg: LegRig, out: THREE.Vector3): THREE.Vector3 {
    const pel = this.rig.pos[B.pelvis];
    const py = pel.y + p.pelY;
    const pz = pel.z + p.pelZ;
    if (!leg.front) {
      _e.set(-p.pelPitch, 0, 0);
      return out.copy(leg.attach).applyEuler(_e).add(_t.set(0, py, pz));
    }
    const a = this.spineAng0 + p.spineAng;
    _e.set(-p.chestPitch, 0, 0);
    return out.copy(leg.attach).applyEuler(_e).add(_t.set(0, py + Math.sin(a) * this.spineLen, pz + Math.cos(a) * this.spineLen));
  }

  private makeSit(): Posture {
    const b = this.breed;
    const fl = this.legs[0];
    const hl = this.legs[2];
    const pel = this.rig.pos[B.pelvis];
    const che = this.rig.pos[B.chest];
    const Ls = this.spineLen;
    const cat = b.kind === 'cat';
    const p: Posture = JSON.parse(JSON.stringify(this.stand));
    let chestY = che.y + b.anim.sitChestRaise;
    const j = new THREE.Vector3();
    for (let it = 0; it < 3; it++) {
      const ang = Math.asin(clamp((chestY - b.anim.sitPelvisY) / Ls, -1, 1));
      p.pelY = b.anim.sitPelvisY - pel.y;
      p.spineAng = ang - this.spineAng0;
      const dz = Ls * (Math.cos(this.spineAng0) - Math.cos(ang));
      p.pelZ = dz * 0.62;
      p.pelPitch = ang + (cat ? 0.3 : 0.24);
      p.chestPitch = ang * (cat ? 0.8 : 0.72);
      // keep the straight front legs within reach
      this.jointFor(p, fl, j);
      const maxY = fl.hp + fl.L3 * Math.cos(fl.phi0) + (fl.L1 + fl.L2) * 0.992;
      if (j.y > maxY) chestY -= j.y - maxY;
      else break;
    }
    this.jointFor(p, fl, j);
    p.front = { x: fl.rest[3].x * (cat ? 0.75 : 0.9), z: j.z + fl.L3 * Math.sin(fl.phi0) - 0.02 * b.h, phi: fl.phi0, poleX: 0, poleY: 0, yaw: 0 };
    this.jointFor(p, hl, j);
    // hock on the ground under the hip, paw flat in front of it, knee forward beside the belly
    p.hind = { x: hl.rest[3].x * (cat ? 1.25 : 1.2), z: j.z + hl.L3 * 0.98, phi: 1.36, poleX: 0.22, poleY: 0.1, yaw: 0.28 };
    p.neck = cat ? 0.1 : 0.12;
    p.head = 0;
    return p;
  }

  private makeLie(): Posture {
    const b = this.breed;
    const fl = this.legs[0];
    const hl = this.legs[2];
    const pel = this.rig.pos[B.pelvis];
    const Ls = this.spineLen;
    const cat = b.kind === 'cat';
    const p: Posture = JSON.parse(JSON.stringify(this.stand));
    const ang = Math.asin(clamp((b.anim.lieChestY - b.anim.liePelvisY) / Ls, -1, 1));
    p.pelY = b.anim.liePelvisY - pel.y;
    p.spineAng = ang - this.spineAng0;
    p.pelZ = Ls * (Math.cos(this.spineAng0) - Math.cos(ang)) * 0.5;
    p.pelPitch = ang + 0.06;
    p.chestPitch = ang * 0.5 + (cat ? 0.02 : 0.05);
    const j = new THREE.Vector3();
    this.jointFor(p, fl, j);
    // sphinx: elbow on the ground behind the shoulder, forearm flat on the ground
    const dy = Math.max(0, j.y - fl.hp);
    const back = Math.sqrt(Math.max(0, fl.L1 * fl.L1 - dy * dy));
    p.front = { x: fl.rest[3].x * (cat ? 0.8 : 1.0), z: j.z - back + (fl.L2 + fl.L3) * (cat ? 0.9 : 0.985), phi: 1.5, poleX: cat ? 0.5 : 0.15, poleY: -0.7, yaw: 0 };
    this.jointFor(p, hl, j);
    // folded flat beside the body: hock a little outside and behind the hip, knee forward and out
    const k = hl.L1;
    const yaw = 0.3;
    p.hind = { x: j.x + 0.36 * k + hl.L3 * Math.sin(yaw), z: j.z - 0.28 * k + hl.L3 * Math.cos(yaw), phi: 1.32, poleX: 0.2, poleY: 0, yaw };
    p.neck = cat ? 0.05 : 0.22;
    p.head = cat ? 0 : 0.04;
    return p;
  }

  /* ---------------------------------------------------------------- random */

  private rnd(): number {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  /* ---------------------------------------------------------------- update */

  update(dt: number, speed: number, mood: PetMood): void {
    if (this.disposed) return;
    dt = clamp(dt || 0, 0, 0.1);
    speed = Math.max(0, speed || 0);
    const b = this.breed;
    const cat = b.kind === 'cat';
    const K = b.h / 0.56;
    const bones = this.bones;
    const rig = this.rig;
    this.time += dt;
    const t = this.time;

    /* ---- speed, gait, phase */
    this.v = damp(this.v, speed, 9, dt);
    const v = this.v;
    const move = sstep(0.03, 0.4, v);
    const Fr = v / Math.sqrt(9.81 * this.legLen);
    const gaitT = sstep(b.anim.trotAt - 0.25, b.anim.trotAt + 0.25, v) + sstep(b.anim.gallopAt - 0.45, b.anim.gallopAt + 0.45, v);
    this.gait = damp(this.gait, gaitT, 5, dt);
    const g = this.gait;
    const g01 = clamp(g, 0, 1);
    const g12 = clamp(g - 1, 0, 1);
    const duty = g <= 1 ? lerp(0.62, 0.46, g01) : lerp(0.46, 0.27, g12);
    let stride = this.legLen * (0.95 + 0.95 * Fr + 0.09 * Fr * Fr);
    const drop = this.legLen * (cat ? 0.05 + 0.05 * Math.min(1, Fr) : 0.02 + 0.045 * Math.min(1.2, Fr)) * move;
    if (stride * duty > this.maxStance) stride = this.maxStance / duty;
    const freq = v / stride;
    this.phase = frac(this.phase + freq * dt);
    const ph = this.phase;
    const L = v > 1e-4 ? stride * duty : 0;
    // phase offsets: FL, FR, HL, HR
    const off = (walk: number, trot: number, gal: number) => (g <= 1 ? lerp(walk, trot, g01) : lerp(trot, gal, g12));
    const offs = [off(0.25, 0.5, 0.52), off(0.75, 1.0, 0.64), 0, off(0.5, 0.5, 0.12)];
    const lp = [frac(ph + offs[0]), frac(ph + offs[1]), frac(ph + offs[2]), frac(ph + offs[3])];

    /* ---- moods (two-stage smoothing = ease in and out) */
    const still = 1 - move;
    const two = (w: number[], target: number, rate: number) => {
      w[0] = damp(w[0], target, rate, dt);
      w[1] = damp(w[1], w[0], rate, dt);
      return w[1];
    };
    const wSit = two(this.wSit, mood === 'sit' && speed < 0.05 ? 1 : 0, 7.5);
    const wLie = two(this.wLie, mood === 'lie' && speed < 0.05 ? 1 : 0, 6.5);
    const wHappy = two(this.wHappy, mood === 'happy' ? 1 : 0, 8);
    const wDown = clamp(wSit + wLie, 0, 1);
    const wStand = 1 - wDown;
    const sitN = wSit / Math.max(1, wSit + wLie);
    const lieN = wLie / Math.max(1, wSit + wLie);

    // posture blend
    const P = this.cur;
    const S = this.stand;
    const A = this.sit;
    const E = this.lie;
    const mix = (s: number, a: number, e: number) => s * (1 - sitN - lieN) + a * sitN + e * lieN;
    P.pelY = mix(S.pelY, A.pelY, E.pelY);
    P.pelZ = mix(S.pelZ, A.pelZ, E.pelZ);
    P.pelPitch = mix(S.pelPitch, A.pelPitch, E.pelPitch);
    P.spineAng = mix(S.spineAng, A.spineAng, E.spineAng);
    P.chestPitch = mix(S.chestPitch, A.chestPitch, E.chestPitch);
    P.neck = mix(S.neck, A.neck, E.neck);
    P.head = mix(S.head, A.head, E.head);
    for (const key of ['front', 'hind'] as const) {
      const o = P[key];
      const s = S[key];
      const a = A[key];
      const e = E[key];
      o.x = mix(s.x, a.x, e.x);
      o.z = mix(s.z, a.z, e.z);
      o.phi = mix(s.phi, a.phi, e.phi);
      o.poleX = mix(s.poleX, a.poleX, e.poleX);
      o.poleY = mix(s.poleY, a.poleY, e.poleY);
      o.yaw = mix(s.yaw, a.yaw, e.yaw);
    }

    /* ---- idle life: breathing, panting, looking around, blinking, ear flicks */
    const pantTarget = cat ? 0 : Math.max(wHappy, sstep(1.6, 3, v), this.pantTimer > 0 ? 1 : 0) * (1 - 0.6 * wLie);
    if (!cat) {
      this.pantTimer -= dt;
      if (this.pantTimer < -5 - 6 * this.rnd() && dt > 0) this.pantTimer = 2.5 + 2.5 * this.rnd();
    }
    this.pant = damp(this.pant, pantTarget, 4, dt);
    const pant = this.pant;
    const breath = Math.sin(t * TAU * (cat ? 0.42 : 0.36)) * (1 - pant) + Math.sin(t * TAU * 3.1) * pant * 0.55;

    this.lookTimer -= dt;
    if (this.lookTimer <= 0) {
      this.lookTimer = 1.6 + this.rnd() * 3.2;
      const r = this.rnd();
      this.lookYawT = r < 0.35 ? 0 : (this.rnd() - 0.5) * (cat ? 1.5 : 1.2);
      this.lookPitchT = (this.rnd() - 0.4) * 0.25;
    }
    const lookAmt = (1 - move) * (1 - 0.8 * wHappy);
    this.lookYaw = damp(this.lookYaw, this.lookYawT * lookAmt, cat ? 3.2 : 4.2, dt);
    this.lookPitch = damp(this.lookPitch, this.lookPitchT * lookAmt, 3.5, dt);

    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) this.blinkTimer = (cat ? 3 : 2.2) + this.rnd() * 3.5;
    // normal blink ≈ 0.14 s; a happy or dozing cat blinks slowly
    const slow = cat ? Math.max(wHappy, wLie * 0.6) : 0;
    const blinkLen = lerp(0.14, 1.1, slow);
    const bt = this.blinkTimer / blinkLen;
    this.blink = bt < 1 ? Math.sin(Math.PI * clamp(bt, 0, 1)) ** 0.6 : 0;

    this.flickTimer -= dt;
    if (this.flickTimer <= 0) {
      this.flickTimer = (cat ? 1.5 : 3) + this.rnd() * 4;
      this.earFlick[this.rnd() < 0.5 ? 0 : 1] = 1;
    }
    for (let i = 0; i < 2; i++) this.earFlick[i] = Math.max(0, this.earFlick[i] - dt / 0.22);

    /* ---- body: pelvis, spine, chest */
    // happy dog: little hops of the front end; happy cat: arching and rubbing
    const hopF = 2.5;
    const hop = !cat ? wHappy * still * wStand * Math.max(0, Math.sin(t * TAU * hopF)) ** 1.3 : 0;
    const hopR = !cat ? wHappy * still * wStand * Math.max(0, Math.sin(t * TAU * hopF - 0.5)) ** 1.3 : 0;
    const rub = cat ? wHappy * still * wStand : 0;
    const rubS = Math.sin(t * TAU * 0.45);

    // gait oscillators
    const bobF = Math.cos(2 * TAU * (lp[0] - duty / 2));
    const bobH = Math.cos(2 * TAU * (lp[2] - duty / 2));
    const bobAmp = this.legLen * lerp(0.022, -0.03, g01) * (1 - g12) * move;
    const flex = Math.cos(TAU * (ph - 0.9));
    const G = g12 * move;
    const galY = G * this.legLen * (0.07 * Math.cos(TAU * (ph - 0.95)) + 0.03 * Math.cos(2 * TAU * (ph - 0.45)));
    const swayAmp = move * (1 - 0.45 * g01) * (1 - 0.8 * g12);

    let pelX = 0.012 * K * swayAmp * Math.cos(TAU * (lp[2] - duty / 2)) + rub * 0.03 * K * rubS;
    let pelY = P.pelY - drop * wStand + bobAmp * bobH + galY;
    const pelZ = P.pelZ;
    let pelPitch = P.pelPitch + G * 0.3 * flex;
    let pelYaw = -0.075 * swayAmp * Math.cos(TAU * lp[2]) * (cat ? 1.3 : 1);
    const pelRoll = -0.03 * swayAmp * Math.cos(TAU * (lp[2] - (1 + duty) / 2));
    let spineAng = this.spineAng0 + P.spineAng + G * 0.075 * Math.cos(TAU * (ph - 0.12)) + hop * 0.11;
    let chestPitch = P.chestPitch - G * 0.12 * flex + hop * 0.1;
    let chestYaw = -0.05 * swayAmp * Math.cos(TAU * lp[0]);
    const chestRoll = -0.025 * swayAmp * Math.cos(TAU * (lp[0] - (1 + duty) / 2)) + rub * 0.12 * rubS;
    let arch = G * 0.035 * flex * this.spineLen;
    let chestDY = (bobAmp * bobF - bobAmp * bobH) * 1.0;
    let spineYaw = 0;
    // happy wag wiggles the hips
    this.wag = damp(this.wag, cat ? 0 : Math.max(wHappy, 0.0), 6, dt);
    const wagF = cat ? 0 : lerp(1.2, 5.6, this.wag);
    this.wagPhase += dt * TAU * wagF;
    const wagS = Math.sin(this.wagPhase);
    pelYaw += this.wag * 0.07 * wagS * (1 - 0.6 * wDown);
    pelX += this.wag * 0.006 * K * wagS * wStand;
    if (cat) {
      // stretch up on the toes, round the back, lean into the rub
      arch += rub * 0.05 * this.spineLen * (0.8 + 0.2 * rubS);
      pelPitch += rub * 0.14;
      chestPitch -= rub * 0.1;
      pelY += rub * 0.012;
      chestDY += rub * 0.004;
      spineYaw = rub * 0.12 * rubS;
      pelYaw += rub * 0.1 * rubS;
      chestYaw -= rub * 0.08 * rubS;
    }
    // breathing lifts the lying / sitting chest a hair
    const breathScale = 1 + 0.012 * breath * (1 + 0.4 * wDown);

    const pelvis = bones[B.pelvis];
    const pel0 = rig.pos[B.pelvis];
    pelvis.position.set(pelX, pel0.y + pelY, pel0.z + pelZ);
    _e.set(-pelPitch, pelYaw, pelRoll, 'YXZ');
    pelvis.quaternion.setFromEuler(_e);

    const chest = bones[B.chest];
    const cs = Math.cos(spineAng);
    chest.position.set(pelX + Math.sin(spineYaw) * cs * this.spineLen, pelvis.position.y + Math.sin(spineAng) * this.spineLen + chestDY, pelvis.position.z + Math.cos(spineYaw) * cs * this.spineLen);
    _e.set(-chestPitch, chestYaw + spineYaw, chestRoll, 'YXZ');
    chest.quaternion.setFromEuler(_e);
    chest.scale.set(breathScale, breathScale, 1);

    const spine = bones[B.spine];
    spine.position.addVectors(pelvis.position, chest.position).multiplyScalar(0.5);
    spine.position.y += arch;
    spine.quaternion.slerpQuaternions(pelvis.quaternion, chest.quaternion, 0.5);
    spine.scale.set(1 + (breathScale - 1) * 0.6, 1 + (breathScale - 1) * 0.6, 1);

    /* ---- legs */
    const amp = sstep(0.02, 0.35, v);
    const liftH = this.legLen * (cat ? 0.1 + 0.07 * Fr : 0.1 + 0.085 * Fr) * amp;
    const kSwing = Math.min((1 - duty) / duty, 1.0);
    for (let l = 0; l < 4; l++) {
      const leg = this.legs[l];
      const pose = leg.front ? P.front : P.hind;
      const parent = bones[leg.parent];
      // top joint in root space
      _a.copy(leg.attach).multiply(parent.scale).applyQuaternion(parent.quaternion).add(parent.position);

      // gait: paw-joint target relative to the neutral stance
      const p = lp[l];
      let dz = 0;
      let lift = 0;
      let phi = pose.phi;
      let psi = 0;
      // stance is centered under the top joint (which is ahead of the resting paw)
      const zc = L * (leg.front ? 0.2 + 0.1 * g12 : 0.1 + 0.3 * g12);
      if (p < duty) {
        const s = p / duty;
        dz = zc + L * (0.5 - s);
        const offT = sstep(0.72, 1, s);
        phi += amp * (0.1 * (1 - sstep(0, 0.3, s)) - 0.45 * offT);
        psi = amp * 0.55 * offT;
      } else {
        const s = (p - duty) / (1 - duty);
        const s2 = s * s;
        const s3 = s2 * s;
        const hz = 3 * s2 - 2 * s3 - kSwing * (s3 - 2 * s2 + s + s3 - s2);
        dz = zc + L * (hz - 0.5);
        const bell = Math.sin(Math.PI * Math.pow(s, 0.8)) ** 2;
        const early = 1 - sstep(0, 0.45, s);
        // hind paws stay lower (a tightly folded hind leg would push the knee above the hip)
        lift = liftH * bell * (leg.front ? 1 : 0.85 - 0.35 * g12);
        phi += amp * (-0.45 * early - (leg.front ? 0.85 : 0.6) * Math.sin(Math.PI * Math.pow(s, 0.7)) ** 2 + 0.1 * sstep(0.75, 1, s));
        psi = amp * (0.55 * early + (leg.front ? 0.9 : 0.7) * Math.sin(Math.PI * Math.pow(s, 0.65)) ** 2);
      }
      // happy hops (front paws)
      if (leg.front) lift += (leg.side > 0 ? hop : hopR) * 0.085 * K;

      const hp = leg.hp;
      const cp = Math.cos(psi);
      const sp = Math.sin(psi);
      const jy = lift + Math.max(hp * cp + b.paw.toe * sp, hp * cp - b.paw.heel * sp);
      const jz = pose.z + dz + (psi >= 0 ? b.paw.toe * (1 - cp) + hp * sp : hp * sp - b.paw.heel * (1 - cp));
      const jx = pose.x * leg.side + pelX * (leg.front ? 0 : 0) + 0;
      const yaw = pose.yaw * leg.side;
      // ankle from the pastern lean (rotated by the paw yaw)
      const sy = Math.sin(yaw);
      const cy = Math.cos(yaw);
      const back = leg.L3 * Math.sin(phi);
      _c.set(jx - back * sy, jy + leg.L3 * Math.cos(phi), jz - back * cy);
      const wantX = _c.x;
      const wantY = _c.y;
      const wantZ = _c.z;
      _pole.set(pose.poleX * leg.side, POLE_Y + pose.poleY, leg.poleZ);
      solve2(_a, _c, leg.L1, leg.L2, _pole, _k, _n);
      const upper = bones[leg.bone];
      const lower = bones[leg.bone + 1];
      const pastern = bones[leg.bone + 2];
      const paw = bones[leg.bone + 3];
      upper.position.copy(_a);
      _d.subVectors(_k, _a).normalize();
      upper.quaternion.setFromRotationMatrix(basis(_n, _d, _m).multiply(leg.m1));
      lower.position.copy(_k);
      _d.subVectors(_c, _k).normalize();
      lower.quaternion.setFromRotationMatrix(basis(_n, _d, _m).multiply(leg.m2));
      pastern.position.copy(_c);
      _e.set(leg.phi0 - phi, yaw, 0, 'YXZ');
      pastern.quaternion.setFromEuler(_e);
      // the paw follows the (possibly pulled-in) ankle
      paw.position.set(jx + (_c.x - wantX), jy + (_c.y - wantY), jz + (_c.z - wantZ));
      _e.set(psi, yaw, 0, 'YXZ');
      paw.quaternion.setFromEuler(_e);
    }

    /* ---- neck + head */
    const happyUp = wHappy * (cat ? 0.12 : 0.22) * (1 - 0.5 * move);
    const runLow = move * (cat ? 0.13 + 0.12 * g12 : 0.05 + 0.2 * g01 * (1 - g12) + 0.3 * g12);
    const nod = move * (1 - g01) * (cat ? 0.012 : 0.035) * Math.cos(2 * TAU * (lp[0] - duty / 2 + 0.12));
    const neckAbs = P.neck + happyUp - runLow + nod + this.lookPitch * 0.4 + hop * 0.05;
    const headAbs = P.head + happyUp * 0.9 + runLow * 0.45 + nod * 0.6 + this.lookPitch + G * 0.04 * flex - pant * 0.03 + rub * 0.1;
    const yawAll = this.lookYaw + rub * 0.35 * rubS + this.wag * 0.04 * Math.sin(this.wagPhase + 1.2);
    const tilt = rub * 0.4 * rubS + this.lookYaw * 0.12 + wHappy * (cat ? 0 : 0.1) * Math.sin(t * 1.3);
    const n1Abs = lerp(chestPitch, neckAbs, 0.55);
    const neck1 = bones[B.neck1];
    const neck2 = bones[B.neck2];
    const head = bones[B.head];
    // neck1 hangs off the chest
    neck1.position.copy(rig.pos[B.neck1]).sub(rig.pos[B.chest]).multiply(chest.scale).applyQuaternion(chest.quaternion).add(chest.position);
    _e.set(-(n1Abs - chestPitch), yawAll * 0.3, 0, 'YXZ');
    neck1.quaternion.copy(chest.quaternion).multiply(_q.setFromEuler(_e));
    neck2.position.copy(rig.pos[B.neck2]).sub(rig.pos[B.neck1]).applyQuaternion(neck1.quaternion).add(neck1.position);
    _e.set(-(neckAbs - n1Abs), yawAll * 0.3, tilt * 0.3, 'YXZ');
    neck2.quaternion.copy(neck1.quaternion).multiply(_q.setFromEuler(_e));
    head.position.copy(rig.pos[B.head]).sub(rig.pos[B.neck2]).applyQuaternion(neck2.quaternion).add(neck2.position);
    _e.set(-(headAbs - neckAbs), yawAll * 0.4, tilt * 0.7, 'YXZ');
    head.quaternion.copy(neck2.quaternion).multiply(_q.setFromEuler(_e));

    /* ---- face */
    const jaw = bones[B.jaw];
    const tongue = bones[B.tongue];
    const pantOsc = Math.sin(t * TAU * 3.1);
    const open = cat ? 0 : pant * (0.3 + 0.07 * pantOsc);
    jaw.rotation.x = open;
    const tLen = b.jaw.len;
    const tOut = cat ? 0 : pant * (0.2 + 0.03 * pantOsc);
    tongue.position.copy(rig.pos[B.tongue]).sub(rig.pos[B.jaw]);
    tongue.position.z += tOut * tLen - (1 - Math.min(1, pant * 3)) * tLen * 0.12;
    tongue.position.y += tOut * tLen * 0.06;
    tongue.rotation.x = pant * (0.42 + 0.06 * pantOsc);
    tongue.scale.set(1, 1, 0.85 + 0.25 * pant);

    const squint = cat ? Math.max(wHappy * 0.35, wLie * 0.45) : wHappy * 0.12 + wLie * 0.15;
    const eyeY = Math.max(0.1, (1 - squint) * (1 - 0.92 * this.blink));
    bones[B.eyeL].scale.set(1, eyeY, 1);
    bones[B.eyeR].scale.set(1, eyeY, 1);

    // ears
    const earL = bones[B.earL];
    const earR = bones[B.earR];
    if (b.key === 'retriever') {
      // pendant ears: lift when happy, fly back and bounce when moving
      const bounce = move * (0.1 + 0.18 * g01) * Math.sin(2 * TAU * (lp[0] - 0.1)) + G * 0.25 * Math.cos(TAU * (ph - 0.55));
      const liftE = wHappy * 0.2 + move * 0.12 + hop * 0.3 + Math.max(0, bounce);
      earL.rotation.set(-move * 0.15 - G * 0.2, 0, liftE + this.earFlick[0] * 0.3);
      earR.rotation.set(-move * 0.15 - G * 0.2, 0, -liftE - this.earFlick[1] * 0.3);
    } else {
      // erect ears: swivel when flicking, fold back a little when running
      const backE = G * 0.5 + move * 0.08 - wHappy * 0.05 + (cat ? wLie * 0.1 : 0);
      earL.rotation.set(-backE, this.earFlick[0] * 0.55, this.earFlick[0] * -0.1 - backE * 0.2);
      earR.rotation.set(-backE, -this.earFlick[1] * 0.55, this.earFlick[1] * 0.1 + backE * 0.2);
    }

    /* ---- tail */
    this.updateTail(dt, wSit, wLie, wHappy, move, g01, g12, pelPitch - S.pelPitch, pelYaw, wagS, ph, lp[2]);
  }

  private updateTail(dt: number, wSit: number, wLie: number, wHappy: number, move: number, g01: number, g12: number, pelPitch: number, pelYaw: number, wagS: number, ph: number, hindPhase: number): void {
    const b = this.breed;
    const n = b.tail.n;
    const t = this.time;
    const cat = b.kind === 'cat';
    const short = b.key === 'terrier';
    const bones = this.bones;
    const pelvis = bones[B.pelvis];
    const wDown = clamp(wSit + wLie, 0, 1);
    const rate = cat ? 5 : 8;
    let px = 0;
    let py = 0;
    let pz = 0;
    let yawAcc = pelYaw;
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n;
      const rest = b.tail.pitch[i];
      // --- target pitch (absolute: 0 = straight back, + = up)
      let target: number;
      let yaw = 0;
      if (cat) {
        const walk = lerp(-0.25, 0.75, u * u);
        const run = lerp(0.05, 0.3, u);
        const up = 1.42 + (u > 0.7 ? (u - 0.7) * 2.6 : 0) + 0.06 * Math.sin(t * 9 + i);
        const standing = lerp(lerp(rest, walk, move), run, g12 * move);
        target = lerp(standing, up, wHappy * (1 - 0.3 * wDown));
        target = lerp(target, -0.9, wDown * (1 - 0.65 * wHappy));
        // lazy tip curl, gait sway, quiver when happy
        yaw = (1 - wDown) * (0.1 * u * Math.sin(t * 0.9 + u * 2.4) + move * 0.07 * Math.sin(TAU * hindPhase - u * 2.5));
        yaw += wHappy * 0.05 * Math.sin(t * 21 + i * 0.7) * u;
        // sitting / lying: the tail curls around the body
        yaw += wDown * (1 - 0.5 * wHappy) * (0.2 + 0.26 * u + 0.04 * Math.sin(t * 0.7 + u * 3) * u);
      } else {
        const walk = rest + (short ? 0.1 : 0.32 - 0.1 * u);
        const run = short ? rest - 0.5 : lerp(0.0, 0.12, u);
        const standing = lerp(lerp(rest, walk, move), run, g12 * move);
        const up = short ? rest + 0.15 : rest + 0.62 - 0.15 * u;
        target = lerp(standing, up, wHappy);
        target = lerp(target, short ? rest - 0.75 : -0.8, wDown);
        // slow idle sway, counter-swing with the hind legs, and the wag: a wave travelling to the tip
        const idle = 0.1 * Math.sin(t * 1.4 - u * 1.6) * (1 - move) * (1 - this.wag);
        const sway = move * (0.12 - 0.07 * g12) * Math.sin(TAU * hindPhase + 1.2 - u * 1.8);
        const wagA = this.wag * (short ? 0.5 : 0.34) * (0.55 + 0.6 * u);
        yaw = idle + sway + wagA * Math.sin(this.wagPhase - u * 1.9 - 0.4);
        void wagS;
      }
      target -= pelPitch * (1 - 0.6 * u) * (1 - wDown);
      void g01;
      void ph;
      this.tailPitch[i] = dt > 0 ? damp(this.tailPitch[i], target, rate, dt) : target;
      this.tailYaw[i] = dt > 0 ? damp(this.tailYaw[i], yaw, 14, dt) : yaw;
      yawAcc += this.tailYaw[i];

      const bone = bones[B.tail + i];
      if (i === 0) {
        _t.copy(this.rig.pos[B.tail]).sub(this.rig.pos[B.pelvis]).applyQuaternion(pelvis.quaternion).add(pelvis.position);
        px = _t.x;
        py = _t.y;
        pz = _t.z;
      }
      // keep the segment's far end above the ground
      const fz = (q: number) => b.tail.feather * Math.sin(Math.PI * Math.pow(q, 0.75));
      const r = Math.max(lerp(b.tail.r0, b.tail.r1, (i + 1) / n) + fz((i + 1) / n), lerp(b.tail.r0, b.tail.r1, (i + 0.5) / n) + fz((i + 0.5) / n)) * 1.05 + 0.002;
      let pitch = this.tailPitch[i];
      const minSin = clamp((r - py) / this.tailSeg, -1, 1);
      if (Math.sin(pitch) < minSin) pitch = Math.asin(minSin);
      bone.position.set(px, py, pz);
      // tail points backwards: +X rotation raises it; yaw swings it sideways
      _q.setFromAxisAngle(_x.set(0, 1, 0), yawAcc);
      _q2.setFromAxisAngle(_x.set(1, 0, 0), pitch - rest);
      bone.quaternion.copy(_q).multiply(_q2);
      _t.copy(this.tailRest[i]).applyQuaternion(bone.quaternion);
      px += _t.x;
      py += _t.y;
      pz += _t.z;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.skeleton.dispose();
    this.root.removeFromParent();
    const e = geoCache.get(this.geoKey);
    if (e) e.refs--;
  }
}
