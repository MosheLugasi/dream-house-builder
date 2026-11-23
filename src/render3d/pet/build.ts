/**
 * Builds the skinned geometry of a pet from its anatomy table: lofted torso / neck, head, jaw,
 * legs, paws, tail and ears, plus eyes, nose, tongue, collar and whiskers. One geometry with two
 * material groups (fur, smooth). Pure math – safe under Node.
 */
import * as THREE from 'three';
import { B, type Breed, type LegSpec, type V2 } from './spec';
import { GROUP_SMOOTH, MeshBuf, loft, ringAt, ringPoint, sampleRings, type LoftInfo, type Ring, type Skin, type Station } from './mesh';

export interface Rig {
  count: number;
  /** bind position of every bone in root space */
  pos: THREE.Vector3[];
  /** parent bone index or -1 (child of the root, animated in root space) */
  parent: number[];
  names: string[];
  tailCount: number;
  /** head frame in bind space */
  headFwd: THREE.Vector3;
  headUp: THREE.Vector3;
}

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const sag = (p: V2, x = 0) => new THREE.Vector3(x, p[1], p[0]);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const sstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function legJoints(l: LegSpec, side: number): THREE.Vector3[] {
  return l.j.map((p) => sag(p, l.x * side));
}

/** head-local (x, y, a) → bind space */
function headPoint(b: Breed, x: number, y: number, a: number, out = new THREE.Vector3()): THREE.Vector3 {
  const p = b.head.pitch;
  const h = b.bones.head;
  return out.set(x, h[1] + y * Math.cos(p) - a * Math.sin(p), h[0] + y * Math.sin(p) + a * Math.cos(p));
}

export function tailJoints(b: Breed): THREE.Vector3[] {
  const pts = [sag(b.tail.base)];
  const seg = b.tail.len / b.tail.n;
  for (let i = 0; i < b.tail.n; i++) {
    const a = b.tail.pitch[i];
    const p = pts[i];
    pts.push(v3(0, p.y + Math.sin(a) * seg, p.z - Math.cos(a) * seg));
  }
  return pts;
}

export function makeRig(b: Breed): Rig {
  const pos: THREE.Vector3[] = [];
  const parent: number[] = [];
  const names: string[] = [];
  const set = (i: number, name: string, p: THREE.Vector3, par = -1) => {
    pos[i] = p;
    parent[i] = par;
    names[i] = name;
  };
  const pelvis = sag(b.bones.pelvis);
  const chest = sag(b.bones.chest);
  set(B.pelvis, 'pelvis', pelvis);
  set(B.spine, 'spine', pelvis.clone().add(chest).multiplyScalar(0.5));
  set(B.chest, 'chest', chest);
  set(B.neck1, 'neck1', sag(b.bones.neck1));
  set(B.neck2, 'neck2', sag(b.bones.neck2));
  set(B.head, 'head', sag(b.bones.head));
  set(B.jaw, 'jaw', headPoint(b, 0, b.jaw.hinge[1], b.jaw.hinge[0]), B.head);
  for (const s of [1, -1]) {
    const e = b.ear.pivot;
    set(s > 0 ? B.earL : B.earR, s > 0 ? 'earL' : 'earR', headPoint(b, e[0] * s, e[1], e[2]), B.head);
    set(s > 0 ? B.eyeL : B.eyeR, s > 0 ? 'eyeL' : 'eyeR', eyeCenter(b, s).c, B.head);
  }
  set(B.tongue, 'tongue', headPoint(b, 0, b.jaw.hinge[1] + b.jaw.up * 0.3, b.jaw.hinge[0] + b.jaw.len * 0.25), B.jaw);
  const legNames = ['FL', 'FR', 'HL', 'HR'];
  const seg = ['upper', 'lower', 'pastern', 'paw'];
  for (let l = 0; l < 4; l++) {
    const j = legJoints(l < 2 ? b.front : b.hind, l % 2 === 0 ? 1 : -1);
    for (let k = 0; k < 4; k++) set(B.leg + l * 4 + k, `${legNames[l]}_${seg[k]}`, j[k]);
  }
  const tj = tailJoints(b);
  for (let i = 0; i < b.tail.n; i++) set(B.tail + i, `tail${i}`, tj[i]);
  return {
    count: B.tail + b.tail.n,
    pos,
    parent,
    names,
    tailCount: b.tail.n,
    headFwd: v3(0, -Math.sin(b.head.pitch), Math.cos(b.head.pitch)),
    headUp: v3(0, Math.cos(b.head.pitch), Math.sin(b.head.pitch)),
  };
}

/* ------------------------------------------------------------------ head helpers */

const headRingCache = new Map<string, Ring[]>();
/** the rings of the head loft in bind space (shared by the mesh and by everything placed on the head) */
function headRings(b: Breed): Ring[] {
  let r = headRingCache.get(b.key);
  if (!r) {
    const st: Station[] = b.head.st.map((s) => ({ c: headPoint(b, 0, s.c, s.a), up: s.up, down: s.down, w: s.w, n: s.n, skin: [[B.head, 1]] }));
    r = sampleRings(st, v3(1, 0, 0), b.head.st.length === 6 ? [2, 3, 3, 2, 2] : [2, 2, 3, 3, 2, 2]);
    headRingCache.set(b.key, r);
  }
  return r;
}

/** point on the head surface (bind space) at muzzle-axis distance `a`, angle `th` around (0 = side, π/2 = top) */
function headSurface(b: Breed, a: number, th: number, side: number, out: THREE.Vector3): THREE.Vector3 {
  const rings = headRings(b);
  const h = b.bones.head;
  const p = b.head.pitch;
  const aOf = (r: Ring) => (r.c.z - h[0]) * Math.cos(p) - (r.c.y - h[1]) * Math.sin(p);
  let i = 0;
  while (i < rings.length - 2 && aOf(rings[i + 1]) < a) i++;
  const a0 = aOf(rings[i]);
  const a1 = aOf(rings[i + 1]);
  const t = (a - a0) / (a1 - a0);
  const ang = side > 0 ? th : Math.PI - th;
  const q = ringPoint(rings[i + 1], ang, new THREE.Vector3());
  return ringPoint(rings[i], ang, out).lerp(q, t);
}

/** eye: center of the eyeball (bind space), gaze direction and the basis of the cap */
function eyeCenter(b: Breed, side: number): { c: THREE.Vector3; f: THREE.Vector3; r: THREE.Vector3; u: THREE.Vector3 } {
  const e = b.eye;
  const th = e.th;
  const p0 = headSurface(b, e.a, th, side, new THREE.Vector3());
  const da = headSurface(b, e.a + 0.004, th, side, new THREE.Vector3()).sub(headSurface(b, e.a - 0.004, th, side, new THREE.Vector3()));
  const dt = headSurface(b, e.a, th + 0.05, side, new THREE.Vector3()).sub(headSurface(b, e.a, th - 0.05, side, new THREE.Vector3()));
  const n = new THREE.Vector3().crossVectors(dt, da).normalize().multiplyScalar(side);
  const p = b.head.pitch;
  const fwd = v3(0, -Math.sin(p), Math.cos(p));
  const up = v3(0, Math.cos(p), Math.sin(p));
  // desired gaze: forward and a little outwards; stay close enough to the surface normal to remain visible
  const want = v3(Math.sin(e.out) * side, 0, 0).addScaledVector(up, 0.1).addScaledVector(fwd, Math.cos(e.out)).normalize();
  const ang = n.angleTo(want);
  const f = n.clone().lerp(want, Math.min(1, 0.4 / Math.max(ang, 1e-3))).normalize();
  const r = new THREE.Vector3().crossVectors(up, f).normalize();
  const u = new THREE.Vector3().crossVectors(f, r).normalize();
  return { c: p0.addScaledVector(n, -e.r * e.sink), f, r, u };
}

/* ------------------------------------------------------------------ colors */

interface Palette {
  coat: THREE.Color;
  mark: THREE.Color;
  light: THREE.Color;
  dark: THREE.Color;
  collar: THREE.Color;
  lip: THREE.Color;
  pad: THREE.Color;
  earIn: THREE.Color;
  tongue: THREE.Color;
}

type Part = 'torso' | 'head' | 'jaw' | 'ear' | 'legF' | 'legH' | 'paw' | 'tail';

function makePalette(b: Breed, colors: Record<string, string>): Palette {
  const col = (k: string, d: string) => {
    try {
      return new THREE.Color(colors[k] ?? d);
    } catch {
      return new THREE.Color(d);
    }
  };
  const white = new THREE.Color('#ffffff');
  const coat = col('coat', b.kind === 'cat' ? '#d98f3e' : '#d7a35a');
  const mark = col('markings', b.kind === 'cat' ? '#a9621f' : '#f1dcae');
  const light = b.key === 'cat' ? coat.clone().lerp(white, 0.78) : b.key === 'terrier' ? coat.clone().lerp(white, 0.3) : mark.clone();
  return {
    coat,
    mark,
    light,
    dark: coat.clone().multiplyScalar(0.72),
    collar: col('collar', '#c8362e'),
    lip: new THREE.Color(b.kind === 'cat' ? '#6b3f38' : '#2a1d18'),
    pad: new THREE.Color('#3a2c2a'),
    earIn: new THREE.Color(b.kind === 'cat' ? '#e2a79b' : '#b98a78'),
    tongue: new THREE.Color('#e8727e'),
  };
}

/** cheap deterministic value noise in 2D (0…1) */
function vnoise(x: number, y: number): number {
  const h = (i: number, j: number) => {
    const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  return lerp(lerp(h(xi, yi), h(xi + 1, yi), u), lerp(h(xi, yi + 1), h(xi + 1, yi + 1), u), v);
}

function makeColorizer(b: Breed, pal: Palette, rig: Rig): (part: Part, i: LoftInfo) => THREE.Color {
  const out = new THREE.Color();
  const H = b.h;
  const head = rig.pos[B.head];
  const muzzleA = b.head.st[Math.min(4, b.head.st.length - 2)].a;
  const noseA = b.head.st[b.head.st.length - 1].a;
  const hl = new THREE.Vector3();
  return (part, i) => {
    const p = i.p;
    const under = Math.max(0, -i.sn);
    // head-local coordinates of the point
    hl.copy(p).sub(head);
    const ha = hl.dot(rig.headFwd);
    const hy = hl.dot(rig.headUp);
    const hx = Math.abs(p.x);
    if (b.key === 'retriever') {
      out.copy(pal.coat);
      // darker along the top line, lighter belly / chest / feathering
      if (part === 'torso') {
        out.lerp(pal.dark, 0.3 * sstep(0.55, 1, i.sn) * sstep(0.5 * H, 0.25 * H, Math.abs(p.z - 0.05 * H)));
        out.lerp(pal.light, 0.75 * sstep(0.45, 0.95, under));
        // pale ruff on the fore-chest
        out.lerp(pal.light, 0.55 * sstep(0.3 * H, 0.5 * H, p.z) * sstep(0.1, 0.8, under));
      } else if (part === 'legF' || part === 'legH') {
        out.lerp(pal.light, 0.6 * sstep(0.2, 0.9, under) * sstep(2.2, 3.4, i.k));
        out.lerp(pal.light, 0.28 * sstep(0.3 * H, 0.05 * H, p.y));
      } else if (part === 'paw') {
        out.lerp(pal.light, 0.28);
      } else if (part === 'tail') {
        out.lerp(pal.light, 0.7 * sstep(0.2, 0.9, under));
      } else if (part === 'ear') {
        out.lerp(pal.dark, 0.55);
      } else if (part === 'head' || part === 'jaw') {
        out.lerp(pal.light, 0.4 * sstep(muzzleA - 0.03, muzzleA + 0.02, ha) + 0.3 * sstep(0.3, 0.9, under));
        out.lerp(pal.dark, 0.25 * sstep(0.5, 1, i.sn) * sstep(muzzleA, muzzleA - 0.05, ha));
      }
    } else if (b.key === 'terrier') {
      out.copy(pal.coat);
      let m = 0;
      if (part === 'head') {
        // tan mask with a white blaze and a white muzzle
        const blaze = sstep(0.011, 0.019, hx - 0.006 * Math.max(0, ha / muzzleA));
        m = blaze * sstep(muzzleA + 0.012, muzzleA - 0.012, ha) * sstep(-0.012, 0.004, hy);
      } else if (part === 'ear') {
        m = 1;
      } else if (part === 'torso') {
        const n = vnoise(p.z * 28 + 3.1, i.sn * 2.2 + (p.x > 0 ? 0 : 7.3));
        const zc = (p.z + 0.07) / 0.085;
        m = sstep(1.15, 0.8, Math.abs(zc) + (1 - i.sn) * 0.75 + (n - 0.5) * 0.55);
        // a second patch at the root of the tail
        m = Math.max(m, sstep(-0.15, -0.185, p.z) * sstep(0.2, 0.6, i.sn));
      } else if (part === 'tail') {
        m = sstep(0.5, 0.2, i.k / (b.tail.n * 1.0 + 1));
      }
      out.lerp(pal.mark, m);
      if (part === 'torso' || part === 'legF' || part === 'legH') out.lerp(pal.light, 0.2 * sstep(0.4, 0.95, under));
    } else {
      // ---- tabby cat
      out.copy(pal.coat);
      let stripe = 0;
      let white = 0;
      if (part === 'torso') {
        const wob = (vnoise(p.z * 60, i.sn * 3 + (p.x > 0 ? 0 : 5)) - 0.5) * 0.9;
        const ph = (p.z + (1 - i.sn) * 0.018) / 0.031 + wob;
        const s = 0.5 + 0.5 * Math.cos(ph * Math.PI * 2);
        // a continuous dark line along the spine, bars down the flanks, nothing under the belly
        const spine = sstep(0.93, 1, i.sn);
        stripe = Math.max(sstep(0.6, 0.92, s) * sstep(-0.55, -0.1, i.sn) * (1 - 0.5 * spine), spine * sstep(0.17, 0.12, p.z));
        white = sstep(0.5, 0.95, under) * 0.85;
        // white bib on the chest
        white = Math.max(white, sstep(0.085, 0.13, p.z) * sstep(-0.1, 0.75, under) * sstep(0.265, 0.235, p.y));
        stripe *= sstep(0.185, 0.15, p.z);
      } else if (part === 'legF' || part === 'legH') {
        const s = 0.5 + 0.5 * Math.cos((p.y / 0.03) * Math.PI * 2 + (part === 'legH' ? 1.3 : 0));
        stripe = sstep(0.55, 0.9, s) * sstep(0.1, -0.5, under - 0.6) * sstep(0.035, 0.06, p.y) * sstep(0.2, 0.15, p.y);
        white = Math.max(sstep(0.3, 0.95, under) * 0.6 * sstep(2.2, 3.4, i.k), sstep(0.05, 0.028, p.y));
      } else if (part === 'paw') {
        white = 1;
      } else if (part === 'tail') {
        const s = 0.5 + 0.5 * Math.cos((i.ring.len / 0.034) * Math.PI * 2);
        stripe = Math.max(sstep(0.5, 0.9, s), sstep(b.tail.len * 0.86, b.tail.len * 0.95, i.ring.len));
      } else if (part === 'head') {
        // forehead "M" lines, cheek stripes, white muzzle and chin
        const top = sstep(0.012, 0.03, hy);
        const s = 0.5 + 0.5 * Math.cos((hx / 0.0125) * Math.PI * 2);
        stripe = sstep(0.55, 0.9, s) * top * sstep(0.07, 0.056, ha) * sstep(-0.002, 0.012, ha);
        const cheek = 0.5 + 0.5 * Math.cos(((hy + ha * 0.4) / 0.016) * Math.PI * 2);
        stripe = Math.max(stripe, sstep(0.6, 0.95, cheek) * sstep(0.03, 0.04, hx) * sstep(0.058, 0.04, ha) * sstep(0.014, -0.004, hy) * sstep(-0.03, -0.015, hy));
        // white muzzle, chin and a short blaze up the nose
        white = Math.max(sstep(0.074, 0.086, ha) * sstep(0.012, 0.0, hy), sstep(0.5, 0.95, under) * sstep(0.03, 0.05, ha));
        white = Math.max(white, sstep(0.084, 0.094, ha), sstep(0.012, 0.004, hx) * sstep(0.07, 0.082, ha) * 0.9);
      } else if (part === 'jaw') {
        white = 1;
      } else if (part === 'ear') {
        out.lerp(pal.dark, 0.25);
      }
      out.lerp(pal.mark, Math.min(1, stripe) * 0.9);
      out.lerp(pal.light, Math.min(1, white));
    }
    // dark lips along the mouth line of the upper muzzle
    if (part === 'head' && ha > muzzleA - 0.01 && b.kind === 'dog') {
      out.lerp(pal.lip, sstep(0.82, 0.97, under) * sstep(muzzleA - 0.01, muzzleA + 0.015, ha) * 0.85);
      out.lerp(pal.lip, sstep(noseA - 0.006, noseA + 0.008, ha) * sstep(-0.2, 0.3, i.sn) * 0.5);
    }
    if (part === 'head' && b.kind === 'cat') {
      out.lerp(pal.lip, sstep(0.8, 0.97, under) * sstep(muzzleA - 0.004, muzzleA + 0.006, ha) * 0.6);
    }
    return out;
  };
}

/* ------------------------------------------------------------------ geometry */

export interface BuiltPet {
  geometry: THREE.BufferGeometry;
  triangles: number;
}

export function buildPetGeometry(b: Breed, rig: Rig, colors: Record<string, string>): BuiltPet {
  const buf = new MeshBuf();
  const pal = makePalette(b, colors);
  const colorOf = makeColorizer(b, pal, rig);
  const X = v3(1, 0, 0);
  const cat = b.kind === 'cat';
  const K = b.h / 0.56; // overall size relative to the retriever
  const uTile = 0.15 * Math.max(0.45, K);
  const tmpC = new THREE.Color();

  /* ---- torso + neck */
  const tb: Record<string, number> = { pelvis: B.pelvis, spine: B.spine, chest: B.chest, neck1: B.neck1, neck2: B.neck2, head: B.head };
  const torsoSt: Station[] = b.torso.map((t) => ({
    c: v3(0, t.y, t.z),
    up: t.up,
    down: t.down,
    w: t.w,
    n: t.n,
    skin: Object.entries(t.skin).map(([k, w]) => [tb[k], w as number] as [number, number]),
  }));
  const spacing = cat ? 0.0115 : 0.03;
  const sub = torsoSt.slice(0, -1).map((s, i) => Math.max(1, Math.round(s.c.distanceTo(torsoSt[i + 1].c) / spacing)));
  const torso = sampleRings(torsoSt, X, sub);
  loft(buf, torso, { segs: cat ? 16 : 18, color: (i) => colorOf('torso', i), capStart: b.torsoCap[0], capEnd: b.torsoCap[1], uTile, vRepeat: 5 });

  /* ---- head */
  const head = headRings(b);
  loft(buf, head, { segs: 20, color: (i) => colorOf('head', i), capStart: b.head.capStart, capEnd: b.head.capEnd, uTile: uTile * 0.6, vRepeat: 4 });

  /* ---- lower jaw */
  {
    const j = b.jaw;
    const [a0, c0] = j.hinge;
    const cTip = c0 - j.down * 0.5;
    const st: Station[] = [
      { c: headPoint(b, 0, c0, a0 - j.len * 0.05), up: j.up, down: j.down * 0.8, w: j.w0 * 0.75, n: 2.3, skin: [[B.head, 0.6], [B.jaw, 0.4]] },
      { c: headPoint(b, 0, lerp(c0, cTip, 0.35), a0 + j.len * 0.35), up: j.up, down: j.down, w: j.w0, n: 2.4, skin: [[B.jaw, 1]] },
      { c: headPoint(b, 0, lerp(c0, cTip, 0.75), a0 + j.len * 0.75), up: j.up, down: j.down, w: lerp(j.w0, j.w1, 0.6), n: 2.4, skin: [[B.jaw, 1]] },
      { c: headPoint(b, 0, cTip, a0 + j.len), up: j.up * 0.9, down: j.down * 0.9, w: j.w1, n: 2.2, skin: [[B.jaw, 1]] },
    ];
    const mouth = new THREE.Color('#5a2328');
    loft(buf, sampleRings(st, X, 2), {
      segs: 10,
      capEnd: j.tip,
      uTile: uTile * 0.6,
      vRepeat: 2,
      color: (i) => tmpC.copy(colorOf('jaw', i)).lerp(mouth, sstep(0.55, 0.9, i.sn)),
    });
    /* tongue: lies on the jaw, hidden inside the closed mouth */
    const tb0 = j.len * 0.12;
    const ty = (t: number) => lerp(c0, cTip, t) + j.up * 0.75;
    const tw = j.w1 * 0.78;
    const ts: Station[] = [0.1, 0.4, 0.66, 0.84].map((t, k) => ({
      c: headPoint(b, 0, ty(t) - [0, 0, 0.25, 1.0][k] * j.up, a0 + tb0 + j.len * t * 0.9),
      up: j.up * 0.28,
      down: j.up * 0.28,
      w: k === 3 ? tw * 0.85 : tw,
      n: 2.3,
      skin: [[B.tongue, 1]] as Skin,
    }));
    loft(buf, sampleRings(ts, X, 1), { group: GROUP_SMOOTH, segs: 8, capEnd: tw * 0.7, color: () => pal.tongue });
  }

  /* ---- nose */
  {
    const n = b.nose;
    const noseCol = new THREE.Color(n.color);
    const st: Station[] = [-0.9, 0, 0.6].map((t, k) => ({
      c: headPoint(b, 0, n.c + (k === 0 ? -n.h * 0.2 : 0), n.a + t * n.d),
      up: n.h * [0.8, 1, 0.75][k],
      down: n.h * [0.7, 0.95, 0.8][k],
      w: n.w * [0.85, 1, 0.8][k],
      n: 2.4,
      skin: [[B.head, 1]] as Skin,
    }));
    loft(buf, sampleRings(st, X, 1), { group: GROUP_SMOOTH, segs: 10, capEnd: n.d * 0.5, color: () => noseCol });
  }

  /* ---- eyes */
  for (const side of [1, -1]) {
    const bone = side > 0 ? B.eyeL : B.eyeR;
    const skin: Skin = [[bone, 1]];
    const e = b.eye;
    const { c, f, r, u } = eyeCenter(b, side);
    const R = e.r;
    const ir = e.irisR * Math.sqrt(1 - e.sink * e.sink);
    const iris = new THREE.Color(e.iris);
    const irisEdge = iris.clone().multiplyScalar(0.55);
    const pupil = new THREE.Color('#050505');
    const rim = new THREE.Color(cat ? '#2a1a12' : '#14100e');
    // beyond the dark rim the ball takes the colour of the fur around it: it reads as the eyelid
    const lid = pal.coat.clone().multiplyScalar(cat ? 0.8 : 0.62);
    const rings: [number, number, THREE.Color][] = [
      [e.pupil[0] * ir, e.pupil[1] * ir, pupil],
      [e.pupil[0] * ir * 1.06, e.pupil[1] * ir * 1.03, iris],
      [ir * 0.96, ir * 0.96, irisEdge],
      [ir * 1.0, ir * 1.0, rim],
      [Math.min(0.97, ir * 1.13), Math.min(0.97, ir * 1.13), rim],
      [0.995, 0.995, lid],
    ];
    const N = 12;
    const p = new THREE.Vector3();
    const put = (rx: number, ry: number, ang: number, col: THREE.Color) => {
      const x = rx * Math.cos(ang);
      const y = ry * Math.sin(ang);
      const z = Math.sqrt(Math.max(0, 1 - x * x - y * y));
      p.copy(c).addScaledVector(r, x * R).addScaledVector(u, y * R).addScaledVector(f, z * R);
      return buf.vert(p, col, 0, 0, skin);
    };
    const center = put(0, 0, 0, pupil);
    let prev: number[] = [];
    rings.forEach(([rx, ry, col], k) => {
      const row: number[] = [];
      for (let j = 0; j < N; j++) row.push(put(rx, ry, (j / N) * Math.PI * 2, col));
      for (let j = 0; j < N; j++) {
        const j1 = (j + 1) % N;
        if (k === 0) buf.tri(GROUP_SMOOTH, center, row[j], row[j1]);
        else {
          buf.tri(GROUP_SMOOTH, prev[j], row[j], row[j1]);
          buf.tri(GROUP_SMOOTH, prev[j], row[j1], prev[j1]);
        }
      }
      prev = row;
    });
    // catch-light: a tiny bright disc floating just above the cornea, up and towards the front
    const glint = new THREE.Color(6, 6, 6);
    const gx = -0.24 * side * ir;
    const gy = 0.36 * ir;
    const gz = Math.sqrt(1 - gx * gx - gy * gy) * 1.02;
    const g0 = new THREE.Vector3().copy(c).addScaledVector(r, gx * R).addScaledVector(u, gy * R).addScaledVector(f, gz * R);
    const gc = buf.vert(g0, glint, 0, 0, skin);
    const gr = R * (cat ? 0.13 : 0.15);
    const grow: number[] = [];
    for (let j = 0; j < 6; j++) {
      const a = (j / 6) * Math.PI * 2;
      p.copy(g0).addScaledVector(r, Math.cos(a) * gr).addScaledVector(u, Math.sin(a) * gr).addScaledVector(f, -gr * 0.25);
      grow.push(buf.vert(p, glint, 0, 0, skin));
    }
    for (let j = 0; j < 6; j++) buf.tri(GROUP_SMOOTH, gc, grow[j], grow[(j + 1) % 6]);
  }

  /* ---- ears */
  for (const side of [1, -1]) {
    const bone = side > 0 ? B.earL : B.earR;
    const e = b.ear;
    const sideAxis = side > 0 ? v3(e.side[0], e.side[1], e.side[2]) : v3(e.side[0], -e.side[1], -e.side[2]);
    // the side axis is given in head space: rotate it into bind space
    const sAxis = v3(sideAxis.x, 0, 0).addScaledVector(rig.headUp, sideAxis.y).addScaledVector(rig.headFwd, sideAxis.z);
    const erect = b.key !== 'retriever';
    const st: Station[] = e.path.map((q, k) => ({
      c: headPoint(b, q[0] * side, q[1], q[2]),
      up: erect ? e.thick * (k === e.path.length - 1 ? 0.5 : 1.25) : e.thick,
      down: erect ? e.thick * 0.3 : e.thick,
      w: e.w[k],
      n: 2,
      skin: k === 0 ? [[B.head, 1]] : k === 1 ? [[B.head, 0.25], [bone, 0.75]] : [[bone, 1]],
    }));
    loft(buf, sampleRings(st, sAxis, 2), {
      segs: 8,
      capEnd: e.w[e.w.length - 1] * 0.8,
      uTile: uTile * 0.5,
      vRepeat: 2,
      color: (i) => {
        tmpC.copy(colorOf('ear', i));
        if (erect) tmpC.lerp(pal.earIn, sstep(0.25, 0.75, -i.sn) * sstep(0.95, 0.55, Math.abs(i.cs)) * 0.85);
        return tmpC;
      },
    });
  }

  /* ---- legs + paws */
  const R = b.legR;
  // [front, back, lateral] radii along the leg (retriever scale)
  const frontR = [
    [0.05, 0.05, 0.03],
    [0.066, 0.07, 0.046],
    [0.056, 0.066, 0.045],
    [0.044, 0.056, 0.04],
    [0.038, 0.046, 0.036],
    [0.038, 0.043, 0.035],
    [0.034, 0.038, 0.032],
    [0.028, 0.031, 0.028],
    [0.027, 0.028, 0.027],
    [0.024, 0.026, 0.026],
    [0.025, 0.027, 0.028],
  ];
  const hindR = [
    [0.07, 0.06, 0.03],
    [0.09, 0.088, 0.046],
    [0.078, 0.09, 0.047],
    [0.058, 0.07, 0.043],
    [0.046, 0.058, 0.038],
    [0.04, 0.05, 0.034],
    [0.03, 0.04, 0.028],
    [0.022, 0.027, 0.023],
    [0.023, 0.033, 0.024],
    [0.02, 0.023, 0.023],
    [0.023, 0.024, 0.026],
  ];
  for (let l = 0; l < 4; l++) {
    const front = l < 2;
    const side = l % 2 === 0 ? 1 : -1;
    const J = legJoints(front ? b.front : b.hind, side);
    const b0 = B.leg + l * 4;
    const par = front ? B.chest : B.pelvis;
    const rr = front ? frontR : hindR;
    const at = (a: THREE.Vector3, c: THREE.Vector3, t: number) => a.clone().lerp(c, t);
    // the top station sits inside the body: towards the withers (front) / the croup (hind)
    const top = J[0].clone();
    top.z += (front ? -0.05 : 0.02) * R;
    top.y += (front ? 0.075 : 0.06) * R;
    const centers = [top, J[0], at(J[0], J[1], 0.5), at(J[0], J[1], 0.82), J[1], at(J[1], J[2], 0.2), at(J[1], J[2], 0.55), at(J[1], J[2], 0.85), J[2], at(J[2], J[3], 0.5), J[3]];
    const skins: Skin[] = [
      [[par, 1]],
      [[par, 0.55], [b0, 0.45]],
      [[par, 0.2], [b0, 0.8]],
      [[b0, 0.92], [b0 + 1, 0.08]],
      [[b0, 0.5], [b0 + 1, 0.5]],
      [[b0, 0.08], [b0 + 1, 0.92]],
      [[b0 + 1, 1]],
      [[b0 + 1, 0.92], [b0 + 2, 0.08]],
      [[b0 + 1, 0.5], [b0 + 2, 0.5]],
      [[b0 + 2, 1]],
      [[b0 + 2, 0.6], [b0 + 3, 0.4]],
    ];
    const feather = b.key === 'retriever' ? 1 : 0;
    // the upper stations lean in under the skin of the trunk, so the limb emerges along a soft crease
    const inward = [0.03, 0.016, 0.009, 0.004];
    const st: Station[] = centers.map((c, k) => ({
      c: k < inward.length ? c.clone().setX(c.x - side * inward[k] * R) : c,
      up: rr[k][0] * R,
      down: rr[k][1] * R * (1 + feather * (k >= 2 && k <= 6 ? 0.12 : 0)),
      w: rr[k][2] * R * (cat ? 1.08 : 1),
      // lens-shaped where the limb lies on the trunk, round further down
      n: [1.5, 1.5, 1.6, 1.8][k] ?? 2,
      skin: skins[k],
    }));
    const part: Part = front ? 'legF' : 'legH';
    const trunkInfo: LoftInfo = { k: 4, cs: 1, sn: 0, p: new THREE.Vector3(), ring: torso[0], cap: 0 };
    const tc = new THREE.Color();
    const trunkY = (front ? b.bones.chest : b.bones.pelvis)[1];
    const legColor = (i: LoftInfo): THREE.Color => {
      const own = colorOf(part, i);
      if (i.k >= 3.4) return own;
      tmpC.copy(own);
      trunkInfo.p.copy(i.p);
      trunkInfo.sn = Math.max(-0.6, Math.min(0.9, (i.p.y - trunkY) / (0.11 * K)));
      trunkInfo.cs = Math.sqrt(1 - trunkInfo.sn * trunkInfo.sn);
      tc.copy(colorOf('torso', trunkInfo));
      return tmpC.lerp(tc, sstep(3.4, 1.6, i.k));
    };
    loft(buf, sampleRings(st, X, [2, 2, 1, 1, 1, 1, 1, 1, 1, 1]), { segs: 12, color: legColor, uTile: uTile * 0.7, vRepeat: 2, capStart: 0.03 * R, capEnd: 0.004 * K });

    // paw: a flattened loft along +Z with toe grooves
    const pw = b.paw;
    const pj = J[3];
    const py = (f: number) => pw.h * f;
    const pst: Station[] = [
      { c: v3(pj.x, py(0.44), pj.z - pw.heel), up: py(0.42), down: py(0.44), w: pw.w * 0.66, n: 2.3, skin: [[b0 + 3, 1]] },
      { c: v3(pj.x, py(0.52), pj.z), up: py(0.52), down: py(0.52), w: pw.w * 0.92, n: 2.4, skin: [[b0 + 3, 1]] },
      { c: v3(pj.x, py(0.44), pj.z + pw.toe * 0.55), up: py(0.46), down: py(0.44), w: pw.w, n: 2.5, skin: [[b0 + 3, 1]] },
      { c: v3(pj.x, py(0.34), pj.z + pw.toe), up: py(0.34), down: py(0.34), w: pw.w * 0.84, n: 2.5, skin: [[b0 + 3, 1]] },
    ];
    const toeZ = pj.z + pw.toe * 0.3;
    // four toes: with 16 segments the grooves fall on the vertices at 45°, 90° and 135° of the top half
    const toe = (i: LoftInfo): number => {
      if (i.sn < 0.3 || i.p.z < toeZ || i.cap <= -0.9) return 0;
      const th = Math.atan2(i.sn, i.cs);
      const q = (th - Math.PI / 4) / (Math.PI / 4);
      const near = Math.abs(q - Math.round(q));
      return near < 0.1 && Math.round(q) >= 0 && Math.round(q) <= 2 ? -1 : 0.35;
    };
    const grooveCol = pal.pad.clone().lerp(pal.coat, 0.35);
    loft(buf, sampleRings(pst, X, [1, 1, 2]), {
      segs: 16,
      capStart: 0,
      capEnd: pw.toe * 0.32,
      uTile: uTile * 0.5,
      vRepeat: 2,
      color: (i) => tmpC.copy(colorOf('paw', i)).lerp(grooveCol, (toe(i) < 0 ? 0.75 : 0) + sstep(0.9, 1, -i.sn) * 0.5),
      displace: (i) => toe(i) * pw.h * 0.17 * sstep(toeZ, toeZ + pw.toe * 0.4, i.p.z),
    });
  }

  /* ---- tail */
  {
    const tj = tailJoints(b);
    const n = b.tail.n;
    // root of the tail: buried in the rump, straight in front of the first joint
    const pre = tj[0].clone();
    pre.z += b.tail.r0 * 1.5;
    pre.y -= b.tail.r0 * 0.45;
    const st: Station[] = [{ c: pre, up: b.tail.r0 * 0.95, down: b.tail.r0 * 1.1, w: b.tail.r0 * 1.05, skin: [[B.pelvis, 1]] }];
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const r = lerp(b.tail.r0, b.tail.r1, Math.pow(u, cat ? 1.5 : 0.9));
      const fz = b.tail.feather * Math.sin(Math.PI * Math.pow(u, 0.75)) * (u < 1 ? 1 : 0);
      const skin: Skin = i === 0 ? [[B.pelvis, 0.5], [B.tail, 0.5]] : i === n ? [[B.tail + n - 1, 1]] : [[B.tail + i - 1, 0.5], [B.tail + i, 0.5]];
      st.push({ c: tj[i], up: r, down: r + fz, w: r * (1 + (fz > 0 ? 0.1 : 0)), skin });
    }
    loft(buf, sampleRings(st, v3(-1, 0, 0), 2), { segs: cat ? 8 : 10, color: (i) => colorOf('tail', i), capEnd: b.tail.r1 * (cat ? 1.0 : 1.6), uTile: uTile * 0.7, vRepeat: 2 });
  }

  /* ---- collar + tag */
  {
    const ring: Ring = ringAt(torso, b.collar.k);
    const hw = b.collar.hw;
    const prof: [number, number][] = [
      [-hw, 0.97],
      [-hw, 1.075],
      [hw, 1.075],
      [hw, 0.97],
    ];
    const N = 18;
    const p = new THREE.Vector3();
    const rows = prof.map(([shift, sc]) => {
      const row: number[] = [];
      for (let j = 0; j < N; j++) row.push(buf.vert(ringPoint(ring, (j / N) * Math.PI * 2, p, sc, shift), pal.collar, 0, 0, ring.skin));
      return row;
    });
    for (let k = 0; k < rows.length - 1; k++)
      for (let j = 0; j < N; j++) {
        const j1 = (j + 1) % N;
        buf.tri(GROUP_SMOOTH, rows[k][j], rows[k][j1], rows[k + 1][j]);
        buf.tri(GROUP_SMOOTH, rows[k][j1], rows[k + 1][j1], rows[k + 1][j]);
      }
    // tag: a small golden disc hanging under the throat
    const gold = new THREE.Color('#e0b23a');
    const t = b.collar.tag;
    const c = ringPoint(ring, -Math.PI / 2, new THREE.Vector3(), 1.1, hw * 0.5);
    c.y -= t * 0.75;
    const nrm = ring.t.clone().multiplyScalar(-0.35).addScaledVector(ring.u, -1).normalize();
    nrm.y = Math.max(nrm.y, -0.2);
    nrm.normalize();
    const ax = v3(1, 0, 0);
    const ay = new THREE.Vector3().crossVectors(nrm, ax).normalize();
    for (const face of [1, -1]) {
      const cc = buf.vert(p.copy(c).addScaledVector(nrm, face * t * 0.12), gold, 0, 0, ring.skin);
      const row: number[] = [];
      for (let j = 0; j < 8; j++) {
        const a = (j / 8) * Math.PI * 2;
        p.copy(c).addScaledVector(ax, Math.cos(a) * t).addScaledVector(ay, Math.sin(a) * t).addScaledVector(nrm, face * t * 0.1);
        row.push(buf.vert(p, gold, 0, 0, ring.skin));
      }
      for (let j = 0; j < 8; j++) {
        if (face > 0) buf.tri(GROUP_SMOOTH, cc, row[j], row[(j + 1) % 8]);
        else buf.tri(GROUP_SMOOTH, cc, row[(j + 1) % 8], row[j]);
      }
    }
  }

  /* ---- whiskers (thin double-sided slivers) */
  if (b.whiskers > 0) {
    const wc = new THREE.Color(2.2, 2.2, 2.2);
    const skin: Skin = [[B.head, 1]];
    const muzzle = b.head.st[b.head.st.length - 2];
    for (const side of [1, -1])
      for (let k = 0; k < b.whiskers; k++) {
        const t = k / (b.whiskers - 1) - 0.5;
        const base = headPoint(b, side * muzzle.w * 0.8, muzzle.c - muzzle.down * 0.1 + t * 0.008, muzzle.a - 0.002);
        const len = 0.062 - Math.abs(t) * 0.02;
        const tip = headPoint(b, side * (muzzle.w * 0.8 + len * 0.94), muzzle.c - muzzle.down * 0.1 + t * 0.05 - 0.004, muzzle.a - 0.004 - len * 0.22 + Math.abs(t) * 0.01);
        const off = v3(0, 0.0006, 0);
        for (const flip of [false, true]) {
          const a = buf.vert(base.clone().add(off), wc, 0, 0, skin);
          const c = buf.vert(base.clone().sub(off), wc, 0, 0, skin);
          const d = buf.vert(tip, wc, 0, 0, skin);
          if (flip) buf.tri(GROUP_SMOOTH, a, d, c);
          else buf.tri(GROUP_SMOOTH, a, c, d);
        }
      }
  }

  const geometry = buf.toGeometry();
  return { geometry, triangles: buf.triangles };
}
