/**
 * Procedural animal anatomy for the pets catalog: smooth lofted bodies (elliptic cross sections
 * along a spline), a per-animal fur atlas painted from a 3D coat field (so spots, saddles and
 * stripes run continuously across torso, neck, legs and tail), and a parametric quadruped / bird
 * builder that produces the part hierarchy the walk-mode runtime animates.
 */
import * as THREE from 'three';
import { Kit, M, lighten, noise3, type V3 } from '../kit';

/* ------------------------------------------------------------------ colour helpers */

export type RGB = [number, number, number];

export function rgb(c: string): RGB {
  let h = c.trim().replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const lerpRGB = (a: RGB, b: RGB, t: number): RGB => {
  const k = Math.max(0, Math.min(1, t));
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
};
export const shadeRGB = (a: RGB, f: number): RGB => [a[0] * f, a[1] * f, a[2] * f];
export const smooth = (e0: number, e1: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
/** 3D value noise in 0..1 at frequency f (per meter) with a seed offset. */
export const nz = (p: THREE.Vector3, f: number, seed = 0): number => noise3(p.x * f + seed * 31.7, p.y * f + seed * 17.3, p.z * f + seed * 7.1);

/* ------------------------------------------------------------------ loft */

export interface Sec {
  p: V3;
  rx: number;
  ry: number;
}

export interface LoftOpts {
  /** reference direction for the cross-section "ry" axis (dorsal side); parallel-transported */
  ref?: V3;
  radial?: number;
  /** rings per section span */
  per?: number;
  /** rounded end caps: length relative to the mean radius (0 = flat) */
  cap0?: number;
  cap1?: number;
  capSeg?: number;
  /** rings of the start cap (defaults to capSeg) */
  capSeg0?: number;
  /** radial noise displacement (fluffy coats), relative */
  fluff?: number;
  fluffF?: number;
  seed?: number;
}

export interface Loft {
  geo: THREE.BufferGeometry;
  rings: number;
  radial: number;
  /** vertex positions, rings × (radial + 1) × 3 */
  grid: Float32Array;
  /** v (0..1) of each ring */
  vs: number[];
  perim: number;
  len: number;
}

function cr(a: number, b: number, c: number, d: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
}

/** Smooth tube with elliptic cross sections through `secs` (centres + radii), rounded caps. */
export function loft(secs: Sec[], o: LoftOpts = {}): Loft {
  const radial = o.radial ?? 12;
  const per = o.per ?? 3;
  const capSeg = o.capSeg ?? 3;
  const capSeg0 = o.capSeg0 ?? capSeg;
  const pts = secs.map((s) => new THREE.Vector3(s.p[0], s.p[1], s.p[2]));
  const ns = secs.length;
  const curve = ns > 2 ? new THREE.CatmullRomCurve3(pts, false, 'centripetal') : null;
  const n = (ns - 1) * per;
  type Ring = { c: THREE.Vector3; t: THREE.Vector3; rx: number; ry: number };
  const body: Ring[] = [];
  const val = (arr: number[], f: number): number => {
    const x = f * (ns - 1);
    const i = Math.min(ns - 2, Math.floor(x));
    const t = x - i;
    const a = arr[Math.max(0, i - 1)];
    const b = arr[i];
    const c = arr[i + 1];
    const d = arr[Math.min(ns - 1, i + 2)];
    return Math.max(0.0004, cr(a, b, c, d, t));
  };
  const rxs = secs.map((s) => s.rx);
  const rys = secs.map((s) => s.ry);
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const c = curve ? curve.getPoint(f) : pts[0].clone().lerp(pts[1], f);
    const t = curve ? curve.getTangent(f).normalize() : pts[1].clone().sub(pts[0]).normalize();
    body.push({ c, t, rx: val(rxs, f), ry: val(rys, f) });
  }
  // caps
  const rings: Ring[] = [];
  const cap0 = o.cap0 ?? 1;
  const cap1 = o.cap1 ?? 1;
  const r0 = body[0];
  const r1 = body[body.length - 1];
  const m0 = (r0.rx + r0.ry) / 2;
  const m1 = (r1.rx + r1.ry) / 2;
  for (let k = capSeg0; k >= 1; k--) {
    const a = (k / capSeg0) * (Math.PI / 2);
    const s = Math.cos(a);
    rings.push({ c: r0.c.clone().addScaledVector(r0.t, -Math.sin(a) * cap0 * m0), t: r0.t, rx: r0.rx * s, ry: r0.ry * s });
  }
  rings.push(...body);
  for (let k = 1; k <= capSeg; k++) {
    const a = (k / capSeg) * (Math.PI / 2);
    const s = Math.cos(a);
    rings.push({ c: r1.c.clone().addScaledVector(r1.t, Math.sin(a) * cap1 * m1), t: r1.t, rx: r1.rx * s, ry: r1.ry * s });
  }
  // parallel-transported frames
  const ref = new THREE.Vector3(...(o.ref ?? [0, 1, 0]));
  const N: THREE.Vector3[] = [];
  const T0 = body[0].t;
  let n0 = ref.clone().addScaledVector(T0, -ref.dot(T0));
  if (n0.lengthSq() < 1e-8) n0 = new THREE.Vector3(1, 0, 0).addScaledVector(T0, -T0.x);
  n0.normalize();
  const bodyN: THREE.Vector3[] = [n0];
  for (let i = 1; i < body.length; i++) {
    const a = body[i - 1].t;
    const b = body[i].t;
    const nn = bodyN[i - 1].clone();
    const axis = new THREE.Vector3().crossVectors(a, b);
    const sl = axis.length();
    if (sl > 1e-7) nn.applyAxisAngle(axis.normalize(), Math.atan2(sl, a.dot(b)));
    nn.addScaledVector(b, -nn.dot(b)).normalize();
    bodyN.push(nn);
  }
  for (let k = 0; k < capSeg0; k++) N.push(bodyN[0]);
  N.push(...bodyN);
  for (let k = 0; k < capSeg; k++) N.push(bodyN[bodyN.length - 1]);

  const R = rings.length;
  const cols = radial + 1;
  const pos = new Float32Array(R * cols * 3);
  const uv = new Float32Array(R * cols * 2);
  const vs: number[] = [];
  let acc = 0;
  const dists: number[] = [0];
  for (let i = 1; i < R; i++) {
    acc += rings[i].c.distanceTo(rings[i - 1].c) + 1e-5;
    dists.push(acc);
  }
  const fl = o.fluff ?? 0;
  const ff = o.fluffF ?? 40;
  const seed = o.seed ?? 1;
  const B = new THREE.Vector3();
  const P = new THREE.Vector3();
  let perim = 0;
  for (let i = 0; i < R; i++) {
    const rg = rings[i];
    const Ni = N[i];
    B.crossVectors(rg.t, Ni).normalize();
    const v = dists[i] / acc;
    vs.push(v);
    let ringLen = 0;
    let prev: THREE.Vector3 | null = null;
    for (let j = 0; j < cols; j++) {
      const th = (j / radial) * Math.PI * 2;
      const cx = Math.cos(th);
      const sy = Math.sin(th);
      P.copy(rg.c).addScaledVector(B, rg.rx * cx).addScaledVector(Ni, rg.ry * sy);
      if (fl > 0) {
        const nv = noise3(P.x * ff + seed * 13.1, P.y * ff + seed * 3.7, P.z * ff) - 0.5;
        const k = 1 + fl * 2 * nv;
        P.sub(rg.c).multiplyScalar(k).add(rg.c);
      }
      const q = (i * cols + j) * 3;
      pos[q] = P.x;
      pos[q + 1] = P.y;
      pos[q + 2] = P.z;
      uv[(i * cols + j) * 2] = j / radial;
      uv[(i * cols + j) * 2 + 1] = v;
      if (prev) ringLen += prev.distanceTo(P);
      prev = (prev ?? new THREE.Vector3()).copy(P);
    }
    perim = Math.max(perim, ringLen);
  }
  const idx: number[] = [];
  for (let i = 0; i < R - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * cols + j;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  // orientation check: first body ring normal should point away from the centre
  {
    const i = capSeg0;
    const a = (i * cols) * 3;
    const b = (i * cols + 1) * 3;
    const c = ((i + 1) * cols) * 3;
    const va = new THREE.Vector3(pos[a], pos[a + 1], pos[a + 2]);
    const e1 = new THREE.Vector3(pos[b], pos[b + 1], pos[b + 2]).sub(va);
    const e2 = new THREE.Vector3(pos[c], pos[c + 1], pos[c + 2]).sub(va);
    const nrm = new THREE.Vector3().crossVectors(e1, e2);
    const out = va.clone().sub(rings[i].c);
    if (nrm.dot(out) < 0) {
      for (let k = 0; k < idx.length; k += 3) {
        const t = idx[k + 1];
        idx[k + 1] = idx[k + 2];
        idx[k + 2] = t;
      }
      g.setIndex(idx);
    }
  }
  g.computeVertexNormals();
  const nr = g.getAttribute('normal') as THREE.BufferAttribute;
  const tmp = new THREE.Vector3();
  for (let i = 0; i < R; i++) {
    // weld seam normals
    const a = i * cols;
    const b = i * cols + radial;
    tmp.set(nr.getX(a) + nr.getX(b), nr.getY(a) + nr.getY(b), nr.getZ(a) + nr.getZ(b)).normalize();
    nr.setXYZ(a, tmp.x, tmp.y, tmp.z);
    nr.setXYZ(b, tmp.x, tmp.y, tmp.z);
  }
  // pole normals
  const poles: Array<[number, THREE.Vector3]> = [];
  if (capSeg0 > 0 && cap0 > 0) poles.push([0, r0.t.clone().negate()]);
  if (capSeg > 0 && cap1 > 0) poles.push([R - 1, r1.t.clone()]);
  for (const [i, dir] of poles) for (let j = 0; j < cols; j++) nr.setXYZ(i * cols + j, dir.x, dir.y, dir.z);
  return { geo: g, rings: R, radial, grid: pos, vs, perim, len: acc };
}

/* ------------------------------------------------------------------ fur atlas */

export interface CoatSample {
  /** position in the animal's body frame (body pivot at the origin), at rest */
  p: THREE.Vector3;
  /** height above the floor */
  y: number;
  /** position in the loft's own frame (e.g. head frame for the head) */
  q: THREE.Vector3;
  /** along the loft 0..1 (torso: rump → chest, legs: top → paw, tail: base → tip, head: back → nose) */
  v: number;
  /** around the loft: 0 = dorsal side, 1 = ventral side */
  d: number;
  region: string;
}
export type Coat = (s: CoatSample) => RGB;

export interface SkinOpts {
  base: string;
  bump?: number;
  sheen?: number;
  rough?: number;
  /** fur strand tiles per meter */
  density?: number;
  /** strand contrast */
  streak?: number;
}

const hasDom = typeof document !== 'undefined';
const skinCache = new Map<string, THREE.Material>();
const placeholder = new THREE.MeshStandardMaterial({ color: '#999999' });

export class Skin {
  entries: Array<{ mesh: THREE.Mesh; lf: Loft; region: string }> = [];

  add(k: Kit, lf: Loft, region: string, x = 0, y = 0, z = 0): THREE.Mesh {
    const m = k.geo(lf.geo, placeholder, x, y, z);
    this.entries.push({ mesh: m, lf, region });
    return m;
  }

  /** Paint the atlas from the coat field and assign one shared fur material. */
  finish(root: THREE.Object3D, bodyFrame: THREE.Object3D, coat: Coat, key: string, o: SkinOpts): void {
    root.updateMatrixWorld(true);
    const S = 512;
    const pad = 3;
    const rects: Array<{ x: number; y: number; w: number; h: number }> = [];
    let area = 0;
    for (const e of this.entries) area += Math.max(0.0004, e.lf.perim * e.lf.len);
    let scale = Math.min(1400, Math.sqrt((0.62 * S * S) / area));
    for (let attempt = 0; attempt < 30; attempt++) {
      rects.length = 0;
      const order = this.entries.map((e, i) => i).sort((a, b) => this.entries[b].lf.len - this.entries[a].lf.len);
      let x = 0;
      let y = 0;
      let rowH = 0;
      let ok = true;
      const tmp: Array<{ x: number; y: number; w: number; h: number }> = new Array(this.entries.length);
      for (const i of order) {
        const e = this.entries[i];
        const w = Math.max(8, Math.ceil(e.lf.perim * scale)) + pad * 2;
        const h = Math.max(8, Math.ceil(e.lf.len * scale)) + pad * 2;
        if (w > S) {
          ok = false;
          break;
        }
        if (x + w > S) {
          x = 0;
          y += rowH;
          rowH = 0;
        }
        tmp[i] = { x, y, w, h };
        x += w;
        rowH = Math.max(rowH, h);
      }
      if (ok && y + rowH <= S) {
        rects.push(...tmp);
        break;
      }
      scale *= 0.9;
    }
    // remap UVs into the atlas
    this.entries.forEach((e, i) => {
      const r = rects[i];
      const uv = e.lf.geo.getAttribute('uv') as THREE.BufferAttribute;
      const iw = r.w - pad * 2;
      const ih = r.h - pad * 2;
      for (let k = 0; k < uv.count; k++) {
        const u = uv.getX(k);
        const v = uv.getY(k);
        uv.setXY(k, (r.x + pad + u * iw) / S, 1 - (r.y + pad + v * ih) / S);
      }
      uv.needsUpdate = true;
    });
    let mat = skinCache.get(key);
    if (!mat) {
      mat = makeSkin(this.entries, rects, root, bodyFrame, coat, S, pad, scale, o);
      skinCache.set(key, mat);
    }
    for (const e of this.entries) e.mesh.material = mat;
  }
}

function makeSkin(
  entries: Skin['entries'],
  rects: Array<{ x: number; y: number; w: number; h: number }>,
  root: THREE.Object3D,
  bodyFrame: THREE.Object3D,
  coat: Coat,
  S: number,
  pad: number,
  scale: number,
  o: SkinOpts,
): THREE.Material {
  const base = new THREE.Color(o.base);
  const furTex = M.fur('#808080').bumpMap;
  let bump: THREE.Texture | null = null;
  if (furTex) {
    bump = furTex.clone();
    const rep = Math.round(((o.density ?? 11) * S) / scale);
    bump.repeat.set(rep, rep);
    bump.needsUpdate = true;
  }
  let map: THREE.CanvasTexture | null = null;
  if (hasDom) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const ctx = cv.getContext('2d');
    if (ctx) {
      const img = ctx.createImageData(S, S);
      const data = img.data;
      const invBody = new THREE.Matrix4().copy(bodyFrame.matrixWorld).invert();
      const toBody = new THREE.Matrix4();
      const P = new THREE.Vector3();
      const Q = new THREE.Vector3();
      const W = new THREE.Vector3();
      const s: CoatSample = { p: P, y: 0, q: Q, v: 0, d: 0, region: '' };
      const streak = o.streak ?? 0.12;
      entries.forEach((e, ei) => {
        const r = rects[ei];
        const lf = e.lf;
        const cols = lf.radial + 1;
        const iw = r.w - pad * 2;
        const ih = r.h - pad * 2;
        toBody.multiplyMatrices(invBody, e.mesh.matrixWorld);
        s.region = e.region;
        for (let py = r.y; py < r.y + r.h && py < S; py++) {
          const v = Math.max(0, Math.min(1, (py - r.y - pad + 0.5) / ih));
          let ri = 0;
          while (ri < lf.rings - 2 && lf.vs[ri + 1] < v) ri++;
          const span = lf.vs[ri + 1] - lf.vs[ri];
          const fv = span > 1e-6 ? Math.max(0, Math.min(1, (v - lf.vs[ri]) / span)) : 0;
          for (let px = r.x; px < r.x + r.w && px < S; px++) {
            let u = (px - r.x - pad + 0.5) / iw;
            u -= Math.floor(u);
            const jf = u * lf.radial;
            const j = Math.min(lf.radial - 1, Math.floor(jf));
            const fu = jf - j;
            const g = lf.grid;
            const i00 = (ri * cols + j) * 3;
            const i01 = i00 + 3;
            const i10 = ((ri + 1) * cols + j) * 3;
            const i11 = i10 + 3;
            for (let c = 0; c < 3; c++) {
              const a = g[i00 + c] + (g[i01 + c] - g[i00 + c]) * fu;
              const b = g[i10 + c] + (g[i11 + c] - g[i10 + c]) * fu;
              const val = a + (b - a) * fv;
              if (c === 0) Q.x = val;
              else if (c === 1) Q.y = val;
              else Q.z = val;
            }
            P.copy(Q).applyMatrix4(toBody);
            W.copy(Q).applyMatrix4(e.mesh.matrixWorld);
            s.y = W.y;
            s.v = v;
            const th = u * Math.PI * 2 - Math.PI / 2;
            const dd = Math.abs(Math.atan2(Math.sin(th), Math.cos(th))) / Math.PI;
            s.d = dd;
            const col = coat(s);
            // fur streaks run along the loft (v)
            const a = u * Math.PI * 2;
            const rr = (lf.perim / (Math.PI * 2)) * 160;
            const sn = noise3(Math.cos(a) * rr, Math.sin(a) * rr, v * lf.len * 26 + ei * 5.3);
            const fine = noise3(px * 0.9, py * 0.9, ei);
            const f = 1 + streak * (sn - 0.5) + 0.08 * (fine - 0.5);
            const q = (py * S + px) * 4;
            data[q] = Math.max(0, Math.min(255, col[0] * f));
            data[q + 1] = Math.max(0, Math.min(255, col[1] * f));
            data[q + 2] = Math.max(0, Math.min(255, col[2] * f));
            data[q + 3] = 255;
          }
        }
      });
      ctx.putImageData(img, 0, 0);
      map = new THREE.CanvasTexture(cv);
      map.colorSpace = THREE.SRGBColorSpace;
      map.anisotropy = 4;
    }
  }
  const m = new THREE.MeshPhysicalMaterial({
    color: map ? '#ffffff' : base,
    map,
    roughness: o.rough ?? 0.92,
    metalness: 0,
    bumpMap: bump,
    bumpScale: o.bump ?? 1.2,
    sheen: o.sheen ?? 0.7,
    sheenColor: new THREE.Color(lighten(o.base, 0.35)),
    sheenRoughness: 0.55,
  });
  m.name = 'pet-skin';
  return m;
}

/* ------------------------------------------------------------------ small materials */

const matCache = new Map<string, THREE.Material>();
function cached<T extends THREE.Material>(key: string, make: () => T): T {
  let m = matCache.get(key) as T | undefined;
  if (!m) {
    m = make();
    m.name = key;
    matCache.set(key, m);
  }
  return m;
}
export const PM = {
  /** glossy wet eye */
  eye: (c: string) =>
    cached(`pet-eye|${c}`, () => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.12, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02 })),
  /** tiny catch-light */
  spark: () => cached('pet-spark', () => new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.9, roughness: 0.3 })),
  /** leathery moist nose */
  nose: (c: string) =>
    cached(`pet-nose|${c}`, () => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.38, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.35 })),
  /** tongue / inner mouth */
  wet: (c: string) => cached(`pet-wet|${c}`, () => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.32, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.2 })),
  /** skin-like (inner ears, paw pads) */
  skin: (c: string) => cached(`pet-skin|${c}`, () => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.75, metalness: 0, sheen: 0.5, sheenColor: new THREE.Color(lighten(c, 0.3)) })),
  /** beak / claws */
  horn: (c: string) => cached(`pet-horn|${c}`, () => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.4, metalness: 0, clearcoat: 0.4, clearcoatRoughness: 0.3 })),
  whisker: () => cached('pet-whisker', () => new THREE.MeshStandardMaterial({ color: '#f3f1ec', roughness: 0.5 })),
};

/* ------------------------------------------------------------------ quadruped */

export interface EarSpec {
  kind: 'floppy' | 'pointy' | 'long' | 'fold';
  len: number;
  wid: number;
  thick?: number;
  /** outward tilt (pointy / long), radians */
  splay?: number;
  /** backward tilt (pointy / long), radians */
  back?: number;
  inner?: string;
  /** move the attachment towards the front (+) / back (-), fraction of skull length */
  setZ?: number;
  /** lower the attachment (fraction of skull height) */
  setY?: number;
  fluff?: number;
}

export interface TailSpec {
  kind: 'long' | 'curled' | 'bushy' | 'stub' | 'puff';
  len: number;
  r: number;
  /** initial angle above horizontal (backwards), radians */
  pitch: number;
  /** extra bend per segment (positive bends upwards/forwards) */
  curl: number;
  /** extra bend over the last segments */
  tipCurl?: number;
  fluff?: number;
  tipR?: number;
}

export interface QuadSpec {
  species: 'dog' | 'cat' | 'rabbit';
  /** torso: length between end sections, half width, half height, centre height */
  L: number;
  W: number;
  H: number;
  bodyY: number;
  tuck?: number;
  hipRise?: number;
  legR: number;
  pawW: number;
  pawL: number;
  pawH: number;
  neckLen: number;
  neckR: number;
  neckPitch: number;
  skullL: number;
  skullW: number;
  skullH: number;
  muzL: number;
  muzW: number;
  muzH: number;
  drop: number;
  headPitch: number;
  ear: EarSpec;
  tail: TailSpec;
  eyeR: number;
  /** eye placement: angle above the side (radians) and forward fraction of the skull */
  eyeUp?: number;
  eyeFwd?: number;
  eyeOut?: number;
  iris: string;
  pupil: 'round' | 'slit';
  nose: string;
  noseScale?: number;
  tongue?: boolean;
  whiskers?: boolean;
  collar: 'tag' | 'bell' | 'none';
  fluff?: number;
  skin: SkinOpts;
}

export interface PlanPts {
  body: { z0: number; z1: number; w: number };
  head: [number, number];
  headR: number;
  nose: [number, number];
  ears: Array<[number, number]>;
  tail: Array<[number, number]>;
  paws: Array<[number, number]>;
  pawR: number;
  shift: number;
}

export interface QuadBuild {
  root: THREE.Group;
  plan: PlanPts;
}

function marker(k: Kit, name: string, x: number, y: number, z: number): void {
  const o = new THREE.Object3D();
  o.name = `mk:${name}`;
  k.add(o, x, y, z);
}

/**
 * Build a quadruped. Structure (all parts unrotated at rest):
 *   body (torso centre) ⟶ head (neck joint), tail (tail base), leg0..leg3 (shoulders / hips).
 */
export function buildQuad(Q: QuadSpec, colors: Record<string, string>, coat: Coat | null, key: string, shiftZ = 0): QuadBuild {
  const root = new Kit();
  const skin = new Skin();
  const { L, W, H } = Q;
  const fl = Q.fluff ?? 0;
  const body = root.part('body', 0, Q.bodyY, shiftZ);
  const tuck = Q.tuck ?? 0.5;
  const hr = Q.hipRise ?? 0;
  const rab = Q.species === 'rabbit';
  /* ---- torso (rump → chest) */
  const torsoSecs: Sec[] = rab
    ? [
        { p: [0, H * 0.12, -L * 0.5], rx: W * 0.82, ry: H * 0.82 },
        { p: [0, H * 0.15, -L * 0.22], rx: W, ry: H * 1.05 },
        { p: [0, H * 0.02, L * 0.08], rx: W * 0.9, ry: H * 0.9 },
        { p: [0, -H * 0.12, L * 0.32], rx: W * 0.74, ry: H * 0.7 },
        { p: [0, -H * 0.14, L * 0.5], rx: W * 0.56, ry: H * 0.56 },
      ]
    : [
        { p: [0, H * (0.16 + hr), -L * 0.5], rx: W * 0.74, ry: H * 0.68 },
        { p: [0, H * (0.08 + hr), -L * 0.32], rx: W * 0.96, ry: H * 0.86 },
        { p: [0, H * (0.06 + tuck * 0.2 + hr * 0.6), -L * 0.08], rx: W * 0.86, ry: H * (0.88 - tuck * 0.24) },
        { p: [0, 0, L * 0.18], rx: W, ry: H },
        { p: [0, -H * 0.03, L * 0.38], rx: W * 0.9, ry: H * 0.95 },
        { p: [0, H * 0.06, L * 0.5], rx: W * 0.66, ry: H * 0.76 },
      ];
  const torso = loft(torsoSecs, { ref: [0, 1, 0], radial: 14, per: 2, cap0: 0.95, cap1: 0.8, capSeg: 2, fluff: fl, fluffF: 30, seed: 1 });
  skin.add(body, torso, 'torso');
  const rump = torsoSecs[0];
  const rumpCap = 0.95 * (rump.rx + rump.ry) * 0.5;

  /* ---- legs */
  const frontPivot: V3 = rab ? [W * 0.42, -H * 0.35, L * 0.34] : [W * 0.55, -H * 0.3, L * 0.34];
  const hindPivot: V3 = rab ? [W * 0.62, -H * 0.15, -L * 0.28] : [W * 0.56, -H * 0.1 + H * hr * 0.6, -L * 0.33];
  const pawPts: Array<[number, number]> = [];
  for (let li = 0; li < 4; li++) {
    const front = li < 2;
    const sx = li % 2 === 0 ? 1 : -1; // leg0/leg2 = left (+X: the animal faces +Z, its left is +X)
    const pv = front ? frontPivot : hindPivot;
    const leg = body.part(`leg${li}`, sx * pv[0], pv[1], pv[2]);
    const h = Q.bodyY + pv[1];
    const r = Q.legR;
    const pH = Q.pawH;
    let secs: Sec[];
    let pawZ: number;
    if (front) {
      secs = [
        { p: [0, h * 0.06, -r * 0.2], rx: r * 1.5, ry: r * 1.8 },
        { p: [0, -h * 0.3, -r * 0.35], rx: r * 1.12, ry: r * 1.3 },
        { p: [0, -h * 0.62, 0], rx: r * 0.84, ry: r * 0.92 },
        { p: [0, -h * 0.86, r * 0.15], rx: r * 0.74, ry: r * 0.74 },
        { p: [0, -h + pH * 0.95, r * 0.4], rx: r * 0.8, ry: r * 0.8 },
      ];
      pawZ = r * 0.4;
    } else if (rab) {
      secs = [
        { p: [0, h * 0.05, 0], rx: r * 2.2, ry: r * 2.9 },
        { p: [0, -h * 0.35, r * 0.4], rx: r * 1.9, ry: r * 2.3 },
        { p: [0, -h * 0.7, -r * 0.6], rx: r * 1.1, ry: r * 1.2 },
        { p: [0, -h + pH * 0.9, -r * 0.9], rx: r * 0.8, ry: r * 0.8 },
      ];
      pawZ = -r * 0.9;
    } else {
      secs = [
        { p: [0, h * 0.06, 0], rx: r * 1.75, ry: r * 2.2 },
        { p: [0, -h * 0.32, r * 0.75], rx: r * 1.35, ry: r * 1.65 },
        { p: [0, -h * 0.57, -r * 0.35], rx: r * 0.88, ry: r * 1.05 },
        { p: [0, -h * 0.72, -r * 1.45], rx: r * 0.62, ry: r * 0.78 },
        { p: [0, -h + pH * 0.95, -r * 0.95], rx: r * 0.74, ry: r * 0.76 },
      ];
      pawZ = -r * 0.95;
    }
    const lf = loft(secs, { ref: [0, 0, 1], radial: 8, per: 2, cap0: 0.6, cap1: 0.35, capSeg: 2, capSeg0: 1, fluff: fl * 0.7, fluffF: 45, seed: 3 + li });
    skin.add(leg, lf, front ? 'leg' : 'hind');
    // paw: loft from heel to toes, flat on the floor
    const pl = rab && !front ? Q.pawL * 2.4 : Q.pawL;
    const pw = Q.pawW;
    const y0 = -h;
    const pz0 = pawZ - pl * (rab && !front ? 0.35 : 0.4);
    const paw = loft(
      [
        { p: [0, y0 + pH * 0.5, pz0], rx: pw * 0.78, ry: pH * 0.5 },
        { p: [0, y0 + pH * 0.5, pz0 + pl * 0.5], rx: pw, ry: pH * 0.5 },
        { p: [0, y0 + pH * 0.42, pz0 + pl], rx: pw * 0.92, ry: pH * 0.42 },
      ],
      { ref: [0, 1, 0], radial: 8, per: 1, cap0: 0.8, cap1: 0.9, capSeg: 2, fluff: fl * 0.5, fluffF: 60, seed: 9 + li },
    );
    skin.add(leg, paw, 'paw');
    // toe grooves
    if (!rab) {
      const toeM = PM.skin('#2b2421');
      for (const tx of [-0.33, 0.33]) {
        leg.rod([tx * pw, y0 + pH * 0.15, pz0 + pl + pH * 0.25], [tx * pw * 0.9, y0 + pH * 0.7, pz0 + pl * 0.55], 0.0011, toeM, 0.0011, 3);
      }
    }
    marker(leg, `paw${li}`, 0, y0, pz0 + pl * 0.5);
  }

  /* ---- neck + collar */
  const np = Q.neckPitch;
  const nb: V3 = rab ? [0, H * 0.2, L * 0.38] : [0, H * 0.3, L * 0.36];
  const nt: V3 = [0, nb[1] + Math.sin(np) * Q.neckLen, nb[2] + Math.cos(np) * Q.neckLen];
  const nMid: V3 = [0, (nb[1] + nt[1]) / 2, (nb[2] + nt[2]) / 2];
  const nape: V3 = [0, Math.cos(np), -Math.sin(np)];
  const nr = Q.neckR;
  const neck = loft(
    [
      { p: [0, nb[1] - Math.sin(np) * H * 0.25, nb[2] - Math.cos(np) * H * 0.25], rx: W * 0.72, ry: H * 0.8 },
      { p: nb, rx: nr * 1.35, ry: nr * 1.5 },
      { p: nMid, rx: nr * 1.08, ry: nr * 1.18 },
      { p: nt, rx: nr, ry: nr * 1.08 },
    ],
    { ref: nape, radial: 12, per: 1, cap0: 0.5, cap1: 0.9, capSeg: 2, fluff: fl, fluffF: 35, seed: 5 },
  );
  skin.add(body, neck, 'neck');
  if (Q.collar !== 'none') {
    const t = 0.62;
    const cc = new THREE.Vector3(...nb).lerp(new THREE.Vector3(...nt), t);
    const dir = new THREE.Vector3(...nt).sub(new THREE.Vector3(...nb)).normalize();
    const crx = nr * (1.35 + (1.0 - 1.35) * t) * (1 + fl * 0.5) + 0.003;
    const cry = nr * (1.5 + (1.08 - 1.5) * t) * (1 + fl * 0.5) + 0.003;
    const bw = Q.species === 'cat' ? 0.005 : Math.max(0.007, nr * 0.13);
    const band = loft(
      [
        { p: [cc.x, cc.y - dir.y * bw, cc.z - dir.z * bw], rx: crx, ry: cry },
        { p: [cc.x, cc.y + dir.y * bw, cc.z + dir.z * bw], rx: crx, ry: cry },
      ],
      { ref: nape, radial: 14, per: 1, cap0: 0.15, cap1: 0.15, capSeg: 1 },
    );
    const cm = M.leather(colors.collar ?? '#a4302a');
    body.geo(band.geo, cm);
    // tag / bell at the throat
    const throat = new THREE.Vector3(...nape).negate();
    const tp = cc.clone().addScaledVector(throat, cry + 0.004);
    if (Q.collar === 'tag') {
      const tr = Math.max(0.009, nr * 0.25);
      
      const tag = body.cyl(tr, 0.0025, M.brass(), tp.x, tp.y - 0.006 - tr, tp.z + 0.004, tr, 12);
      body.rod([tp.x, tp.y + 0.002, tp.z], [tp.x, tp.y - 0.007, tp.z + 0.003], 0.0012, M.brass(), 0.0012, 4);
      tag.rotation.x = Math.PI / 2;
      tag.position.y = tp.y - 0.006 - tr;
    } else {
      body.sphere(0.0065, M.brass(), tp.x, tp.y - 0.007, tp.z + 0.002, 1, 1, 1, 10);
      body.box(0.008, 0.0012, 0.002, M.blackMetal(), tp.x, tp.y - 0.0105, tp.z + 0.008);
    }
  }

  /* ---- head (pivot at the neck joint) */
  const head = body.part('head', nt[0], nt[1], nt[2]);
  const tilt = new Kit();
  head.sub(tilt).rotation.x = Q.headPitch;
  const hk = new Kit();
  const sl = Q.skullL;
  const sw = Q.skullW;
  const sh = Q.skullH;
  const ml = Q.muzL;
  const mw = Q.muzW;
  const mh = Q.muzH;
  const dr = Q.drop;
  const hc: V3 = [0, sh * (rab ? 0.35 : 0.55), sl * 0.22];
  tilt.sub(hk, hc[0], hc[1], hc[2]);
  const zs = sl * 0.42;
  const headSecs: Sec[] = [
    { p: [0, sh * 0.12, -sl * 0.5], rx: sw * 0.62, ry: sh * 0.62 },
    { p: [0, sh * 0.02, -sl * 0.18], rx: sw * 0.98, ry: sh * 0.97 },
    { p: [0, -sh * 0.05, sl * 0.18], rx: sw, ry: sh * 0.9 },
    { p: [0, -dr * 0.7, zs], rx: mw * 1.18, ry: mh * 1.12 },
    { p: [0, -dr, zs + ml * 0.55], rx: mw, ry: mh },
    { p: [0, -dr + mh * 0.05, zs + ml], rx: mw * 0.84, ry: mh * 0.84 },
  ];
  const headLf = loft(headSecs, { ref: [0, 1, 0], radial: 14, per: 2, cap0: 0.9, cap1: 0.55, capSeg: 2, fluff: fl, fluffF: 45, seed: 7 });
  skin.add(hk, headLf, 'head');
  const noseZ = zs + ml + mh * 0.84 * 0.55;
  // lower jaw / chin
  const jaw = loft(
    [
      { p: [0, -dr - mh * 0.45, zs - ml * 0.1], rx: mw * 0.85, ry: mh * 0.45 },
      { p: [0, -dr - mh * 0.62, zs + ml * 0.45], rx: mw * 0.72, ry: mh * 0.36 },
      { p: [0, -dr - mh * 0.62, zs + ml * 0.82], rx: mw * 0.5, ry: mh * 0.28 },
    ],
    { ref: [0, 1, 0], radial: 8, per: 2, cap0: 0.6, cap1: 0.8, capSeg: 2, fluff: fl * 0.6, fluffF: 60, seed: 8 },
  );
  skin.add(hk, jaw, 'jaw');
  // lip line
  const lip = PM.skin(Q.species === 'dog' ? '#2a2220' : '#5a4440');
  for (const sx of [-1, 1]) {
    hk.tube(
      [
        [sx * mw * 0.86, -dr - mh * 0.42, zs + ml * 0.05],
        [sx * mw * 0.84, -dr - mh * 0.52, zs + ml * 0.5],
        [sx * mw * 0.45, -dr - mh * 0.58, zs + ml * 0.86],
        [0, -dr - mh * 0.55, zs + ml * 0.95],
      ],
      Q.species === 'dog' ? 0.0022 : 0.0012,
      lip,
      { seg: 8, radial: 3 },
    );
  }
  // nose
  const ns = Q.noseScale ?? 1;
  const nm = PM.nose(Q.nose);
  if (Q.species === 'dog') {
    hk.sphere(mw * 0.56 * ns, nm, 0, -dr + mh * 0.42, zs + ml + mh * 0.2, 1, 0.68, 0.72, 12);
    hk.box(0.0015, mh * 0.18, 0.003, PM.nose('#0b0909'), 0, -dr + mh * 0.18, zs + ml + mh * 0.2 + mw * 0.36 * ns);
  } else {
    // small triangular nose (cat / rabbit)
    const n = hk.sphere(mw * 0.38 * ns, nm, 0, -dr + mh * 0.5, zs + ml + mh * 0.1, 1, 0.62, 0.55, 12);
    n.rotation.x = -0.4;
  }
  // tongue (relaxed, happy dog)
  if (Q.tongue) {
    const tg = loft(
      [
        { p: [0, -dr - mh * 0.6, zs + ml * 0.5], rx: mw * 0.55, ry: mh * 0.12 },
        { p: [0, -dr - mh * 0.75, zs + ml * 0.9], rx: mw * 0.6, ry: mh * 0.13 },
        { p: [0, -dr - mh * 1.2, zs + ml * 1.02], rx: mw * 0.55, ry: mh * 0.12 },
      ],
      { ref: [0, 1, 0], radial: 6, per: 2, cap0: 0.3, cap1: 1, capSeg: 2 },
    );
    hk.geo(tg.geo, PM.wet('#d0646a'));
  }
  // eyes
  const eu = Q.eyeUp ?? 0.42;
  const ef = Q.eyeFwd ?? 0.3;
  const eo = Q.eyeOut ?? 0.62;
  {
    // interpolate the head section at the eye's z
    const ez = sl * ef;
    const f = Math.max(0, Math.min(1, (ez - sl * 0.18) / (zs - sl * 0.18)));
    const crx = sw + (mw * 1.18 - sw) * f;
    const cry = sh * 0.9 + (mh * 1.12 - sh * 0.9) * f;
    const ccy = -sh * 0.05 + (-dr * 0.7 + sh * 0.05) * f;
    for (const sx of [-1, 1]) {
      const ex = sx * crx * Math.cos(eu);
      const ey = ccy + cry * Math.sin(eu);
      const out = new THREE.Vector3(sx * Math.cos(eu) * eo, 0.12, 1).normalize();
      const er = Q.eyeR;
      const c = new THREE.Vector3(ex, ey, ez).addScaledVector(out, -er * 0.05);
      hk.sphere(er, PM.eye(Q.iris), c.x, c.y, c.z, 1, 1, 1, 9);
      // dark rim (eyelids)
      const rim = hk.add(new THREE.Mesh(new THREE.TorusGeometry(er * 0.98, er * 0.17, 3, 10), PM.skin(Q.species === 'dog' ? '#2a211d' : '#3a302c')));
      rim.position.copy(c).addScaledVector(out, er * 0.32);
      rim.lookAt(rim.position.clone().add(out));
      rim.castShadow = true;
      // pupil
      const pp = c.clone().addScaledVector(out, er * 0.62);
      if (Q.pupil === 'slit') {
        const pm = hk.sphere(er * 0.5, PM.eye('#050505'), pp.x, pp.y, pp.z, 0.22, 1.05, 0.5, 8);
        pm.lookAt(pp.clone().add(out));
        pm.scale.set(0.22, 1.0, 0.5);
      } else {
        const pm = hk.sphere(er * 0.52, PM.eye('#060505'), pp.x, pp.y, pp.z, 1, 1, 0.5, 8);
        pm.lookAt(pp.clone().add(out));
      }
      // catch-light: front, up and a little towards the centre
      const hl = c.clone().addScaledVector(new THREE.Vector3(-sx * 0.25, 0.45, 0.2).add(out).normalize(), er * 0.98);
      hk.sphere(er * 0.17, PM.spark(), hl.x, hl.y, hl.z, 1, 1, 1, 5);
    }
  }
  // whiskers
  if (Q.whiskers) {
    const wm = PM.whisker();
    for (const sx of [-1, 1]) {
      const b0: V3 = [sx * mw * 0.75, -dr - mh * 0.05, zs + ml * 0.7];
      for (let i = 0; i < 3; i++) {
        const len = sw * (1.5 + (i % 2) * 0.25);
        const a = 0.16 - i * 0.15;
        hk.rod(b0, [b0[0] + sx * len * 0.95, b0[1] + len * a, b0[2] - len * 0.1 + i * 0.002], 0.00045, wm, 0.00025, 3);
      }
      // brow whiskers
      hk.rod([sx * sw * 0.55, sh * 0.6, sl * 0.25], [sx * sw * 0.95, sh * 1.2, sl * 0.3], 0.0004, wm, 0.0002, 3);
    }
  }
  // ears
  const E = Q.ear;
  for (const sx of [-1, 1]) {
    const th = E.thick ?? 0.006;
    const ez = (E.setZ ?? 0) * sl;
    const ey = (E.setY ?? 0) * sh;
    if (E.kind === 'floppy' || E.kind === 'fold') {
      const el = E.len;
      const ew = E.wid / 2;
      const fold = E.kind === 'fold';
      const a: V3 = [sx * sw * 0.6, sh * 0.72 - ey, -sl * 0.12 + ez];
      const b: V3 = [sx * sw * 1.0, sh * 0.62 - ey, -sl * 0.08 + ez];
      const c: V3 = [sx * (sw * 1.12 + th), sh * 0.4 - ey - el * (fold ? 0.2 : 0.3), -sl * 0.02 + ez];
      const d: V3 = [sx * (sw * (fold ? 1.18 : 1.08) + th), sh * 0.4 - ey - el * (fold ? 0.55 : 0.85), sl * 0.04 + ez];
      const lf = loft(
        [
          { p: a, rx: th * 1.4, ry: ew * 0.6 },
          { p: b, rx: th, ry: ew * 0.85 },
          { p: c, rx: th, ry: ew },
          { p: d, rx: th * 0.9, ry: ew * 0.7 },
        ],
        { ref: [0, 0, 1], radial: 8, per: 2, cap0: 0.4, cap1: 1, capSeg: 2, fluff: E.fluff ?? 0, fluffF: 50, seed: 20 + sx },
      );
      skin.add(hk, lf, 'ear');
      marker(hk, `ear${sx}`, d[0], d[1], d[2]);
    } else {
      const el = E.len;
      const ew = E.wid / 2;
      const long = E.kind === 'long';
      const spl = E.splay ?? 0.3;
      const bk = E.back ?? 0.15;
      const base: V3 = [sx * sw * (long ? 0.35 : 0.55), sh * (long ? 0.75 : 0.68) - ey, -sl * 0.08 + ez];
      const dir = new THREE.Vector3(sx * Math.sin(spl), Math.cos(spl) * Math.cos(bk), -Math.sin(bk)).normalize();
      const pt = (f: number, fwd = 0): V3 => [base[0] + dir.x * el * f, base[1] + dir.y * el * f, base[2] + dir.z * el * f + fwd];
      const secs: Sec[] = long
        ? [
            { p: pt(-0.05), rx: ew * 0.55, ry: th * 1.4 },
            { p: pt(0.3), rx: ew * 0.95, ry: th },
            { p: pt(0.65), rx: ew, ry: th },
            { p: pt(1), rx: ew * 0.45, ry: th * 0.8 },
          ]
        : [
            { p: pt(-0.1), rx: ew, ry: th * 1.6 },
            { p: pt(0.35), rx: ew * 0.78, ry: th * 1.2 },
            { p: pt(0.75), rx: ew * 0.38, ry: th * 0.9 },
            { p: pt(1), rx: ew * 0.06, ry: th * 0.5 },
          ];
      const lf = loft(secs, { ref: [0, 0, 1], radial: 8, per: 2, cap0: 0.3, cap1: long ? 1 : 0.6, capSeg: 2, fluff: E.fluff ?? 0, fluffF: 50, seed: 30 + sx });
      skin.add(hk, lf, 'ear');
      // inner ear: slightly smaller, in front (cupped)
      const isecs: Sec[] = secs.slice(0, 4).map((s, i) => ({
        p: [s.p[0] - sx * 0.0, s.p[1] - (i === 0 ? 0 : el * 0.02), s.p[2] + th * 1.1] as V3,
        rx: s.rx * (long ? 0.62 : 0.7),
        ry: th * 0.5,
      }));
      const il = loft(isecs, { ref: [0, 0, 1], radial: 6, per: 2, cap0: 0.3, cap1: 0.6, capSeg: 2 });
      hk.geo(il.geo, PM.skin(E.inner ?? '#d9a59c'));
      const tp = pt(1);
      marker(hk, `ear${sx}`, tp[0], tp[1], tp[2]);
    }
  }
  marker(hk, 'nose', 0, -dr, noseZ);
  marker(hk, 'headc', 0, 0, 0);

  /* ---- tail */
  const T = Q.tail;
  const tb: V3 = [0, rump.p[1] + rump.ry * 0.5, rump.p[2] - rumpCap * 0.55];
  const tail = body.part('tail', tb[0], tb[1], tb[2]);
  if (T.kind === 'puff' || T.kind === 'stub') {
    const r = T.r;
    const puff = loft(
      [
        { p: [0, -r * 0.2, r * 0.6], rx: r * 0.8, ry: r * 0.8 },
        { p: [0, r * 0.2 * Math.sin(T.pitch), -T.len], rx: r, ry: r * 0.95 },
      ],
      { ref: [0, 1, 0], radial: 12, per: 3, cap0: 0.6, cap1: 1, capSeg: 3, fluff: T.fluff ?? 0.15, fluffF: 70, seed: 40 },
    );
    skin.add(tail, puff, 'tail');
    marker(tail, 'tail0', 0, 0, 0);
    marker(tail, 'tail1', 0, 0, -T.len - r);
  } else {
    const nSeg = 6;
    const step = T.len / nSeg;
    const pts: V3[] = [[0, -T.r * 0.3, T.r * 1.2]];
    let a = T.pitch;
    let x: V3 = [0, 0, 0];
    pts.push(x);
    for (let i = 0; i < nSeg; i++) {
      a += T.curl + (i >= nSeg - 2 ? T.tipCurl ?? 0 : 0);
      x = [0, x[1] + Math.sin(a) * step, x[2] - Math.cos(a) * step];
      pts.push(x);
    }
    const tipR = T.tipR ?? 0.35;
    const secs: Sec[] = pts.map((p, i) => {
      const f = Math.max(0, (i - 1) / nSeg);
      let r = T.r * (1 - (1 - tipR) * f);
      if (T.kind === 'bushy') r = T.r * (0.85 + 0.55 * Math.sin(Math.PI * Math.min(1, f * 0.9 + 0.1))) * (1 - 0.5 * f * f);
      if (i === 0) r = T.r * 1.05;
      return { p, rx: r, ry: r };
    });
    const tl = loft(secs, { ref: [0, 1, 0], radial: T.kind === 'bushy' ? 10 : 8, per: 1, cap0: 0.6, cap1: 1, capSeg: 2, fluff: T.fluff ?? 0, fluffF: 50, seed: 41 });
    skin.add(tail, tl, 'tail');
    pts.forEach((p, i) => marker(tail, `tail${i}`, p[0], p[1], p[2]));
  }

  /* ---- paint */
  if (coat) skin.finish(root.g, body.g, coat, key, Q.skin);

  // plan points
  root.g.updateMatrixWorld(true);
  const mk: Record<string, THREE.Vector3> = {};
  root.g.traverse((o) => {
    if (o.name.startsWith('mk:')) mk[o.name.slice(3)] = new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);
  });
  const tailPts: Array<[number, number]> = [];
  for (let i = 0; mk[`tail${i}`]; i++) tailPts.push([mk[`tail${i}`].x, mk[`tail${i}`].z]);
  const plan: PlanPts = {
    body: { z0: shiftZ - L / 2 - rumpCap * 0.9, z1: shiftZ + L / 2 + W * 0.5, w: W * (rab ? 1.05 : 1.0) },
    head: [mk.headc.x, mk.headc.z],
    headR: sw,
    nose: [mk.nose.x, mk.nose.z],
    ears: [mk['ear1'], mk['ear-1']].map((v) => [v.x, v.z] as [number, number]),
    tail: tailPts,
    paws: [0, 1, 2, 3].map((i) => [mk[`paw${i}`].x, mk[`paw${i}`].z] as [number, number]),
    pawR: Q.pawW,
    shift: shiftZ,
  };
  // markers are no longer needed
  const rm: THREE.Object3D[] = [];
  root.g.traverse((o) => {
    if (o.name.startsWith('mk:')) rm.push(o);
  });
  for (const o of rm) o.parent?.remove(o);
  return { root: root.g, plan };
}

/** Measure a quadruped once (geometry only) to centre it and derive its exact size. */
export function measureQuad(Q: QuadSpec): { shift: number; size: { w: number; d: number; h: number }; plan: PlanPts } {
  const a = buildQuad(Q, { collar: '#888888' }, null, '');
  const bb = new THREE.Box3().setFromObject(a.root, true);
  const shift = -(bb.min.z + bb.max.z) / 2;
  const b = buildQuad(Q, { collar: '#888888' }, null, '', shift);
  const bb2 = new THREE.Box3().setFromObject(b.root, true);
  const up = (x: number) => Math.ceil(x * 200 + 0.4) / 200;
  const w = up(2 * Math.max(-bb2.min.x, bb2.max.x));
  return { shift, size: { w, d: up(bb2.max.z - bb2.min.z), h: up(bb2.max.y) }, plan: b.plan };
}

/* ------------------------------------------------------------------ birds */

export interface BirdSpec {
  /** body length (vent → neck) and radius */
  len: number;
  r: number;
  headR: number;
  /** forward lean of the body axis (radians from vertical) */
  tilt: number;
  beak: 'hook' | 'small';
  beakColor: string;
  cere?: string;
  eyeRing?: string;
  iris: string;
  tailLen: number;
  tailW: number;
  /** tail angle backwards from straight down */
  tailBack: number;
  feet: string;
  /** low-detail (tiny birds) */
  lo?: boolean;
  skin: SkinOpts;
}

/**
 * Perched bird. `perch` = centre of the perch dowel (axis along X), `pr` its radius.
 * Parts: body (body centre) ⟶ head (neck joint), tail (vent). Feet stay on the perch.
 */
export function buildBird(root: Kit, B: BirdSpec, perch: V3, pr: number, coat: Coat | null, key: string): void {
  const skin = new Skin();
  const { len, r, headR: hr } = B;
  const rd = (n: number): number => (B.lo ? Math.max(6, n - 4) : n);
  const ct = Math.cos(B.tilt);
  const st = Math.sin(B.tilt);
  const rot = (p: V3): V3 => [p[0], p[1] * ct - p[2] * st, p[1] * st + p[2] * ct];
  const legH = r * 0.35;
  const bodyY = perch[1] + pr + legH + len * 0.36;
  const body = root.part('body', perch[0], bodyY, perch[2] - r * 0.15);
  const bk = new Kit();
  body.sub(bk).rotation.x = B.tilt;
  const torso = loft(
    [
      { p: [0, -len * 0.5, -r * 0.18], rx: r * 0.42, ry: r * 0.42 },
      { p: [0, -len * 0.24, r * 0.06], rx: r * 0.92, ry: r * 0.95 },
      { p: [0, len * 0.06, r * 0.1], rx: r, ry: r },
      { p: [0, len * 0.3, r * 0.04], rx: r * 0.8, ry: r * 0.8 },
      { p: [0, len * 0.5, 0], rx: r * 0.6, ry: r * 0.62 },
    ],
    { ref: [0, 0, -1], radial: rd(12), per: 2, cap0: 0.8, cap1: 0.6, capSeg: 2 },
  );
  skin.add(bk, torso, 'torso');
  for (const sx of [-1, 1]) {
    const w = loft(
      [
        { p: [sx * r * 0.74, len * 0.3, -r * 0.2], rx: r * 0.14, ry: r * 0.4 },
        { p: [sx * r * 0.93, len * 0.02, -r * 0.42], rx: r * 0.13, ry: r * 0.62 },
        { p: [sx * r * 0.8, -len * 0.3, -r * 0.66], rx: r * 0.1, ry: r * 0.46 },
        { p: [sx * r * 0.32, -len * 0.66, -r * 0.88], rx: r * 0.06, ry: r * 0.16 },
      ],
      { ref: [0, 0, 1], radial: rd(8), per: 2, cap0: 0.5, cap1: 1, capSeg: 2 },
    );
    skin.add(bk, w, 'wing');
  }
  // tail (pivot at the vent)
  const vent = rot([0, -len * 0.46, -r * 0.35]);
  const tail = body.part('tail', vent[0], vent[1], vent[2]);
  const tb = B.tailBack;
  const td = (f: number): V3 => [0, -Math.cos(tb) * B.tailLen * f, -Math.sin(tb) * B.tailLen * f];
  const tl = loft(
    [
      { p: td(-0.05), rx: B.tailW * 0.3, ry: r * 0.14 },
      { p: td(0.35), rx: B.tailW * 0.45, ry: r * 0.07 },
      { p: td(0.75), rx: B.tailW * 0.5, ry: r * 0.05 },
      { p: td(1), rx: B.tailW * 0.42, ry: r * 0.04 },
    ],
    { ref: [0, 0, -1], radial: rd(8), per: 2, cap0: 0.4, cap1: 0.6, capSeg: 2 },
  );
  skin.add(tail, tl, 'tail');
  // head (pivot at the neck)
  const nk = rot([0, len * 0.46, r * 0.02]);
  const head = body.part('head', nk[0], nk[1], nk[2]);
  const hy = hr * 0.55;
  const hz = hr * 0.12;
  const hl = loft(
    [
      { p: [0, hy - hr * 0.05, hz - hr * 0.78], rx: hr * 0.55, ry: hr * 0.6 },
      { p: [0, hy, hz - hr * 0.25], rx: hr * 0.98, ry: hr },
      { p: [0, hy - hr * 0.02, hz + hr * 0.3], rx: hr * 0.9, ry: hr * 0.92 },
      { p: [0, hy - hr * 0.1, hz + hr * 0.62], rx: hr * 0.55, ry: hr * 0.6 },
    ],
    { ref: [0, 1, 0], radial: rd(12), per: 2, cap0: 0.9, cap1: 0.7, capSeg: 2 },
  );
  skin.add(head, hl, 'head');
  const bm = PM.horn(B.beakColor);
  const bs = B.beak === 'hook' ? 1 : 0.62;
  const bz = hz + hr * 0.5;
  const by = hy - hr * 0.12;
  const upper = loft(
    [
      { p: [0, by, bz], rx: hr * 0.36 * bs, ry: hr * 0.38 * bs },
      { p: [0, by + hr * 0.05 * bs, bz + hr * 0.42 * bs], rx: hr * 0.27 * bs, ry: hr * 0.3 * bs },
      { p: [0, by - hr * 0.22 * bs, bz + hr * 0.72 * bs], rx: hr * 0.17 * bs, ry: hr * 0.18 * bs },
      { p: [0, by - hr * 0.6 * bs, bz + hr * 0.66 * bs], rx: hr * 0.07 * bs, ry: hr * 0.08 * bs },
    ],
    { ref: [0, 1, 0], radial: rd(8), per: 2, cap0: 0.3, cap1: 0.6, capSeg: 2 },
  );
  head.geo(upper.geo, bm);
  const lower = loft(
    [
      { p: [0, by - hr * 0.3 * bs, bz - hr * 0.02], rx: hr * 0.3 * bs, ry: hr * 0.2 * bs },
      { p: [0, by - hr * 0.42 * bs, bz + hr * 0.36 * bs], rx: hr * 0.16 * bs, ry: hr * 0.12 * bs },
    ],
    { ref: [0, 1, 0], radial: rd(8), per: 2, cap0: 0.3, cap1: 0.8, capSeg: 2 },
  );
  head.geo(lower.geo, PM.horn(B.beakColor));
  if (B.cere) head.sphere(hr * 0.2, PM.skin(B.cere), 0, by + hr * 0.22, bz + hr * 0.08, 1.1, 0.6, 0.8, 10);
  for (const sx of [-1, 1]) {
    const out = new THREE.Vector3(sx, 0.12, 0.4).normalize();
    const er = hr * 0.17;
    const c = new THREE.Vector3(0, hy + hr * 0.12, hz + hr * 0.22).addScaledVector(out, hr * 0.86);
    if (B.eyeRing) {
      const ring = head.add(new THREE.Mesh(new THREE.TorusGeometry(er * 1.35, er * 0.45, 4, 12), PM.skin(B.eyeRing)));
      ring.position.copy(c);
      ring.lookAt(c.clone().add(out));
      ring.castShadow = true;
    }
    head.sphere(er, PM.eye(B.iris), c.x, c.y, c.z, 1, 1, 1, B.lo ? 7 : 9);
    const pp = c.clone().addScaledVector(out, er * 0.62);
    head.sphere(er * 0.55, PM.eye('#050505'), pp.x, pp.y, pp.z, 1, 1, 0.5, 8).lookAt(pp.clone().add(out));
    const sp = c.clone().addScaledVector(new THREE.Vector3(0, 0.5, 0.4).add(out).normalize(), er * 0.98);
    head.sphere(er * 0.2, PM.spark(), sp.x, sp.y, sp.z, 1, 1, 1, 5);
  }
  // feet gripping the perch (static)
  const fm = PM.skin(B.feet);
  const tr = Math.max(0.0025, r * 0.07);
  for (const sx of [-1, 1]) {
    const x = perch[0] + sx * r * 0.38;
    const R = pr + tr;
    const arc = (a0: number, a1: number, dx: number): V3[] => {
      const out: V3[] = [];
      for (let i = 0; i <= 4; i++) {
        const a = a0 + ((a1 - a0) * i) / 4;
        out.push([x + dx * (i / 4), perch[1] + Math.cos(a) * R, perch[2] + Math.sin(a) * R]);
      }
      return out;
    };
    root.tube(arc(0, 1.7, sx * 0.004), tr, fm, { seg: 6, radial: 4 });
    root.tube(arc(0, 1.5, -sx * 0.006), tr, fm, { seg: 6, radial: 4 });
    root.tube(arc(0, -1.6, 0), tr, fm, { seg: 6, radial: 4 });
    root.rod([x, perch[1] + R, perch[2]], [x * 0.98 + perch[0] * 0.02, perch[1] + pr + legH + r * 0.4, perch[2] - r * 0.05], tr * 1.3, fm, tr * 1.6, 6);
  }
  if (coat) skin.finish(root.g, body.g, coat, key, B.skin);
}
