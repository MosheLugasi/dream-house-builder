/**
 * Geometry helpers for chairs & stools: lathe-turned parts between two points, thick parametric
 * sheets (molded shells, bent plywood, upholstered backs), soft pads with rounded edges around
 * any outline (seats, saddles, cushions), office-chair bases and small plan-symbol helpers.
 */
import * as THREE from 'three';
import { D, INK, INK_SOFT, Kit, LINE_THIN, M, arcPanelGeo, boxUV, latheGeo, mesh, tint, type Ctx2D, type V3 } from '../kit';

export type Mat = THREE.Material;
const UP = new THREE.Vector3(0, 1, 0);

/* ------------------------------------------------------------------ interpolation */

/** Smooth piecewise interpolation of a [t, value] table (t ascending). */
export function lerpTab(tab: Array<[number, number]>, t: number): number {
  if (t <= tab[0][0]) return tab[0][1];
  for (let i = 1; i < tab.length; i++) {
    if (t <= tab[i][0]) {
      const [t0, a] = tab[i - 1];
      const [t1, b] = tab[i];
      const f = (t - t0) / (t1 - t0 || 1);
      const s = f * f * (3 - 2 * f);
      return a + (b - a) * s;
    }
  }
  return tab[tab.length - 1][1];
}

export const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const mirX = (p: V3): V3 => [-p[0], p[1], p[2]];

/* ------------------------------------------------------------------ turned parts */

export type Profile = Array<[number, number]>;

/** Radius profiles ([radius, t], t = 0 at `a` .. 1 at `b`) for lathe-turned chair parts. */
export const PROF = {
  taper: (rTop: number, rBot: number): Profile => [
    [0, 0],
    [rBot, 0],
    [rTop, 1],
    [0, 1],
  ],
  /** classic turned leg: small foot, long taper, rings and a vase, plain block at the top */
  turned: (r: number): Profile => [
    [0, 0],
    [r * 0.7, 0],
    [r * 0.78, 0.018],
    [r * 0.66, 0.05],
    [r * 0.6, 0.34],
    [r * 0.9, 0.41],
    [r * 0.6, 0.45],
    [r * 0.55, 0.52],
    [r * 0.82, 0.62],
    [r * 0.9, 0.67],
    [r * 0.6, 0.72],
    [r * 0.72, 0.76],
    [r, 0.8],
    [r, 1],
    [0, 1],
  ],
  /** Windsor-style splayed leg: bulb, ring, long taper */
  windsor: (r: number): Profile => [
    [0, 0],
    [r * 0.62, 0],
    [r * 0.72, 0.25],
    [r * 0.95, 0.45],
    [r * 0.62, 0.5],
    [r * 0.85, 0.56],
    [r, 0.72],
    [r * 0.62, 1],
    [0, 1],
  ],
  /** slender spindle swelling below the middle */
  spindle: (r: number): Profile => [
    [0, 0],
    [r * 0.7, 0],
    [r, 0.28],
    [r * 0.78, 0.68],
    [r * 0.6, 1],
    [0, 1],
  ],
  /** bobbin turned stretcher (thick in the middle) */
  stretcher: (r: number): Profile => [
    [0, 0],
    [r * 0.55, 0],
    [r * 0.6, 0.18],
    [r, 0.46],
    [r * 0.75, 0.54],
    [r * 0.6, 0.82],
    [r * 0.55, 1],
    [0, 1],
  ],
  /** back post with a ball finial */
  finial: (r: number, len: number): Profile => {
    const k = r / len;
    return [
      [0, 0],
      [r, 0],
      [r * 0.86, 1 - k * 4.4],
      [r * 0.5, 1 - k * 3.6],
      [r * 1.02, 1 - k * 2.1],
      [r * 0.85, 1 - k * 0.7],
      [0, 1],
    ];
  },
};

/** Lathe-turned piece (leg, spindle, stretcher) from `a` to `b`; tilted feet touch the floor exactly. */
export function turned(k: Kit, a: V3, b: V3, prof: Profile, mat: Mat, seg = 10): THREE.Mesh {
  const va = new THREE.Vector3(a[0], a[1], a[2]);
  const vb = new THREE.Vector3(b[0], b[1], b[2]);
  const d0 = vb.clone().sub(va).normalize();
  if (va.y < 0.003) {
    const rb = Math.max(...prof.filter((p) => p[1] <= 0.03).map((p) => p[0]));
    va.y = Math.max(0, va.y) + rb * Math.sqrt(Math.max(0, 1 - d0.y * d0.y)) + 0.0004;
  }
  const dir = vb.clone().sub(va);
  const L = dir.length();
  dir.normalize();
  const g = latheGeo(
    prof.map(([r, t]) => [r, t * L] as [number, number]),
    seg,
  );
  const rMax = Math.max(...prof.map((p) => p[0]));
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const grain = mat.userData.grain === true;
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i) * Math.PI * 2 * rMax;
    const v = uv.getY(i) * L;
    uv.setXY(i, grain ? v : u, grain ? u : v);
  }
  const m = mesh(g, mat);
  m.position.copy(va);
  m.quaternion.setFromUnitVectors(UP, dir);
  k.g.add(m);
  return m;
}

/** Tapered SQUARE leg (flat shaded) from a to b; `sBot`/`sTop` are half widths. */
export function squareLeg(k: Kit, a: V3, b: V3, sBot: number, sTop: number, mat: Mat): THREE.Mesh {
  const va = new THREE.Vector3(a[0], a[1], a[2]);
  const vb = new THREE.Vector3(b[0], b[1], b[2]);
  const dir = vb.clone().sub(va);
  const L = dir.length();
  dir.normalize();
  let g: THREE.BufferGeometry = new THREE.CylinderGeometry(sTop * Math.SQRT2, sBot * Math.SQRT2, L, 4, 1);
  g.rotateY(Math.PI / 4);
  g.translate(0, L / 2, 0);
  g = g.toNonIndexed();
  g.computeVertexNormals();
  boxUV(g, [sBot * 2, L, sBot * 2], mat.userData.grain === true, (a[0] * 7.1 + a[2] * 3.3) % 1);
  const m = mesh(g, mat);
  m.position.copy(va);
  m.quaternion.setFromUnitVectors(UP, dir);
  k.g.add(m);
  return m;
}

/* ------------------------------------------------------------------ thick parametric sheets */

export type SheetFn = (u: number, v: number) => V3;

/**
 * Thick sheet around a parametric surface fn(u, v), u, v in 0..1 (molded shells, bent plywood,
 * upholstered panels). `t` = thickness (constant or per (u, v): taper it to 0 at the borders
 * for a pillowy, rounded cushion). UVs are in meters.
 */
export function sheetGeo(fn: SheetFn, nu: number, nv: number, t: number | ((u: number, v: number) => number), grain = false): THREE.BufferGeometry {
  const tf = typeof t === 'number' ? () => t : t;
  const P: THREE.Vector3[] = [];
  const N: THREE.Vector3[] = [];
  const T: number[] = [];
  const at = (u: number, v: number): THREE.Vector3 => {
    const p = fn(u, v);
    return new THREE.Vector3(p[0], p[1], p[2]);
  };
  const e = 1e-3;
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i <= nu; i++) {
      const u = i / nu;
      const v = j / nv;
      P.push(at(u, v));
      const du = at(Math.min(1, u + e), v).sub(at(Math.max(0, u - e), v));
      const dv = at(u, Math.min(1, v + e)).sub(at(u, Math.max(0, v - e)));
      const n = du.cross(dv);
      if (n.lengthSq() < 1e-16) n.set(0, 1, 0);
      N.push(n.normalize());
      T.push(tf(u, v));
    }
  }
  const id = (i: number, j: number): number => j * (nu + 1) + i;
  let Lu = 0;
  let Lv = 0;
  const jm = nv >> 1;
  const im = nu >> 1;
  for (let i = 0; i < nu; i++) Lu += P[id(i + 1, jm)].distanceTo(P[id(i, jm)]);
  for (let j = 0; j < nv; j++) Lv += P[id(im, j + 1)].distanceTo(P[id(im, j)]);
  const swap = grain && Lv > Lu;
  const pos: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  let count = 0;
  const vert = (p: THREE.Vector3, a: number, b: number): number => {
    pos.push(p.x, p.y, p.z);
    if (swap) uvs.push(b, a);
    else uvs.push(a, b);
    return count++;
  };
  const off = (kk: number, s: number): THREE.Vector3 => P[kk].clone().addScaledVector(N[kk], (s * T[kk]) / 2);
  const layer = (s: number): number => {
    const base = count;
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) vert(off(id(i, j), s), (i / nu) * Lu, (j / nv) * Lv);
    return base;
  };
  const A = layer(1);
  const B = layer(-1);
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a00 = id(i, j);
      const a10 = id(i + 1, j);
      const a11 = id(i + 1, j + 1);
      const a01 = id(i, j + 1);
      idx.push(A + a00, A + a10, A + a11, A + a00, A + a11, A + a01);
      idx.push(B + a00, B + a11, B + a10, B + a00, B + a01, B + a11);
    }
  }
  const border = (ks: number[], inner: number[]): void => {
    let len = 0;
    for (let q = 0; q < ks.length - 1; q++) {
      const k0 = ks[q];
      const k1 = ks[q + 1];
      if (T[k0] < 1e-5 && T[k1] < 1e-5) continue;
      const a0 = off(k0, 1);
      const a1 = off(k1, 1);
      const b0 = off(k0, -1);
      const b1 = off(k1, -1);
      const sl = P[k0].distanceTo(P[k1]);
      const i0 = vert(a0, len, 0);
      const i1 = vert(a1, len + sl, 0);
      const i2 = vert(b0, len, T[k0]);
      const i3 = vert(b1, len + sl, T[k1]);
      len += sl;
      const out = P[k0].clone().sub(P[inner[q]]);
      const nrm = a1.clone().sub(a0).cross(b0.clone().sub(a0));
      if (nrm.dot(out) >= 0) idx.push(i0, i1, i3, i0, i3, i2);
      else idx.push(i0, i3, i1, i0, i2, i3);
    }
  };
  const row = (j: number): number[] => Array.from({ length: nu + 1 }, (_, i) => id(i, j));
  const col = (i: number): number[] => Array.from({ length: nv + 1 }, (_, j) => id(i, j));
  border(row(0), row(1));
  border(row(nv), row(nv - 1));
  border(col(0), col(1));
  border(col(nu), col(nu - 1));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Add a sheet to the kit. */
export function sheet(k: Kit, fn: SheetFn, nu: number, nv: number, t: number | ((u: number, v: number) => number), mat: Mat): THREE.Mesh {
  return k.geo(sheetGeo(fn, nu, nv, t, mat.userData.grain === true), mat);
}

/** Thickness profile of a plump cushion: `t` in the middle, `edge`·t at the borders. */
export const pillowT =
  (t: number, edge = 0.3, ex = 0.45) =>
  (u: number, v: number): number =>
    t * (edge + (1 - edge) * Math.pow(Math.sin(Math.PI * u), ex) * Math.pow(Math.sin(Math.PI * v), ex));

/** Thickness that only rounds the u borders (channels, rolls). */
export const pillowU =
  (t: number, edge = 0.3, ex = 0.45) =>
  (u: number): number =>
    t * (edge + (1 - edge) * Math.pow(Math.sin(Math.PI * u), ex));

/* ------------------------------------------------------------------ molded shells */

export interface ShellSpec {
  /** side profile (z, y) of the shell's centre line from the seat front edge up to the top of the back */
  path: Array<[number, number]>;
  /** half width along the path, [v, hw] (v = 0..1 by arc length) */
  hw: Array<[number, number]>;
  /** how much the side edges rise towards the sitter, [v, amount] */
  curl?: Array<[number, number]>;
  /** curl exponent across the width (2 = parabolic, higher = flat middle, sharp sides) */
  pow?: number;
  /** pull the edges inwards in x while they curl (0..1) */
  wrap?: number;
}

export function shellFn(s: ShellSpec): SheetFn {
  const curve = new THREE.SplineCurve(s.path.map(([z, y]) => new THREE.Vector2(z, y)));
  curve.arcLengthDivisions = 120;
  return (u, v) => {
    const c = curve.getPointAt(Math.min(1, Math.max(0, v)));
    const t = curve.getTangentAt(Math.min(1, Math.max(0, v)));
    const sx = 2 * u - 1;
    const w = lerpTab(s.hw, v);
    const lift = (s.curl ? lerpTab(s.curl, v) : 0) * Math.pow(Math.abs(sx), s.pow ?? 2);
    const x = sx * (w - (s.wrap ?? 0) * lift);
    return [x, c.y - t.x * lift, c.x + t.y * lift];
  };
}

/* ------------------------------------------------------------------ pads around an outline */

export type Outline = Array<[number, number]>;

/** Closed outline (x, z) through polygon corners rounded with the given radii. */
export function roundPoly(pts: Array<[number, number]>, radii: number[] | number, n = 40): Outline {
  const s = new THREE.Shape();
  const m = pts.length;
  const r = (i: number): number => (typeof radii === 'number' ? radii : radii[i]);
  const p = (i: number): THREE.Vector2 => new THREE.Vector2(pts[(i + m) % m][0], pts[(i + m) % m][1]);
  const start = p(0).clone().lerp(p(1), 0.5);
  s.moveTo(start.x, start.y);
  for (let q = 1; q <= m; q++) {
    const c = p(q);
    const prev = p(q - 1);
    const next = p(q + 1);
    const ri = r(q % m);
    const a = c.clone().add(prev.clone().sub(c).setLength(Math.min(ri, c.distanceTo(prev) / 2)));
    const b = c.clone().add(next.clone().sub(c).setLength(Math.min(ri, c.distanceTo(next) / 2)));
    s.lineTo(a.x, a.y);
    s.quadraticCurveTo(c.x, c.y, b.x, b.y);
  }
  s.lineTo(start.x, start.y);
  const out = s.getSpacedPoints(n).map((v) => [v.x, v.y] as [number, number]);
  const f = out[0];
  const l = out[out.length - 1];
  if (Math.hypot(f[0] - l[0], f[1] - l[1]) < 1e-6) out.pop();
  return out;
}

/** Trapezoid seat outline: front width `wf` (at +d/2), back width `wb`, rounded corners. */
export const trapOutline = (wf: number, wb: number, d: number, rf = 0.04, rb = 0.03, n = 40, cz = 0): Outline =>
  roundPoly(
    [
      [-wb / 2, cz - d / 2],
      [wb / 2, cz - d / 2],
      [wf / 2, cz + d / 2],
      [-wf / 2, cz + d / 2],
    ],
    [rb, rb, rf, rf],
    n,
  );

export const ellOutline = (rx: number, rz: number, n = 32, cz = 0): Outline =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [Math.cos(a) * rx, cz + Math.sin(a) * rz] as [number, number];
  });

export interface PadOpts {
  /** rounding radius of the top / bottom edges */
  rTop?: number;
  rBot?: number;
  /** dome (+) or dish (−) of the top surface at the centre */
  crown?: number;
  /** extra height of the top surface (applied to the rim and the top), rho = 1 at the rim, 0 at the centre */
  top?: (x: number, z: number, rho: number) => number;
  /** interior rings of the top surface */
  rings?: number;
}

/**
 * Solid pad with rounded edges around a convex outline (x, z): seats, cushions, saddles, stool tops.
 * Bottom at y = 0, top at y = h (+ crown / top()).
 */
export function padGeo(outline: Outline, h: number, o: PadOpts = {}): THREE.BufferGeometry {
  const n = outline.length;
  const rt = Math.min(o.rTop ?? Math.min(0.02, h * 0.45), h * 0.95);
  const rb = Math.min(o.rBot ?? Math.min(0.006, h * 0.3), h - rt);
  const crown = o.crown ?? 0;
  let cx = 0;
  let cz = 0;
  for (const [x, z] of outline) {
    cx += x;
    cz += z;
  }
  cx /= n;
  cz /= n;
  const R = outline.map(([x, z]) => Math.hypot(x - cx, z - cz));
  const dir = outline.map(([x, z], j) => [(x - cx) / R[j], (z - cz) / R[j]]);
  // profile rings: [inset, y, rho (−1 = side/bottom: no top function)]
  const rings: Array<[number, number, number]> = [];
  if (rb > 0.0005) {
    for (const f of [0, 1]) {
      const phi = (f * Math.PI) / 2;
      rings.push([rb * (1 - Math.sin(phi)), rb * (1 - Math.cos(phi)), -1]);
    }
  } else rings.push([0, 0, -1]);
  for (const f of [0, 1 / 3, 2 / 3, 1]) {
    const phi = (f * Math.PI) / 2;
    rings.push([rt * (1 - Math.cos(phi)), h - rt + rt * Math.sin(phi), 1]);
  }
  const nr = o.rings ?? 4;
  for (let i = 1; i <= nr; i++) {
    const rho = 1 - i / (nr + 1);
    rings.push([-rho, h, rho]); // negative inset marks an interior ring (scaled)
  }
  const pos: number[] = [];
  const idx: number[] = [];
  const topY = (x: number, z: number, rho: number, y: number): number => y + crown * (1 - rho * rho) + (o.top ? o.top(x, z, rho) : 0);
  // bottom centre
  pos.push(cx, 0, cz);
  for (const [inset, y, rho] of rings) {
    for (let j = 0; j < n; j++) {
      let r: number;
      if (inset < 0) r = Math.max(0, R[j] - rt) * -inset;
      else r = Math.max(R[j] * 0.04, R[j] - inset);
      const x = cx + dir[j][0] * r;
      const z = cz + dir[j][1] * r;
      pos.push(x, rho >= 0 ? topY(x, z, rho, y) : y, z);
    }
  }
  const topC = pos.length / 3;
  pos.push(cx, topY(cx, cz, 0, h), cz);
  const ringStart = (i: number): number => 1 + i * n;
  for (let j = 0; j < n; j++) {
    const j1 = (j + 1) % n;
    idx.push(0, ringStart(0) + j1, ringStart(0) + j);
  }
  for (let i = 0; i < rings.length - 1; i++) {
    const a = ringStart(i);
    const b = ringStart(i + 1);
    for (let j = 0; j < n; j++) {
      const j1 = (j + 1) % n;
      idx.push(a + j, a + j1, b + j1, a + j, b + j1, b + j);
    }
  }
  const last = ringStart(rings.length - 1);
  for (let j = 0; j < n; j++) {
    const j1 = (j + 1) % n;
    idx.push(topC, last + j, last + j1);
  }
  // orientation check: the top fan must face up
  const p = (i: number): THREE.Vector3 => new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
  const t0 = idx.length - 3;
  const nrm = p(idx[t0 + 1]).sub(p(idx[t0])).cross(p(idx[t0 + 2]).sub(p(idx[t0])));
  if (nrm.y < 0) for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const xs = outline.map((q) => q[0]);
  const zs = outline.map((q) => q[1]);
  boxUV(g, [Math.max(...xs) - Math.min(...xs), h, Math.max(...zs) - Math.min(...zs)], false, (cx * 3.7 + h * 11) % 1);
  return g;
}

export function pad(k: Kit, outline: Outline, h: number, mat: Mat, x = 0, y = 0, z = 0, o: PadOpts = {}): THREE.Mesh {
  return k.geo(padGeo(outline, h, o), mat, x, y, z);
}

/* ------------------------------------------------------------------ curved slats */

/**
 * Curved back slat (concave to the front) whose ENDS sit on the post centre line at z = `zEnds`.
 * `y` = bottom, `tilt` = backward lean in radians.
 */
export function curvedSlat(k: Kit, mat: Mat, y: number, zEnds: number, width: number, h: number, t: number, R: number, tilt = 0, x = 0): THREE.Mesh {
  const half = Math.min(width / 2, R * 0.97);
  const arc = 2 * Math.asin(half / R);
  const sag = R * (1 - Math.cos(arc / 2));
  const m = k.geo(arcPanelGeo(R, t, h, arc, 10), mat, x, y, zEnds - sag + t / 2);
  m.rotation.x = -tilt;
  return m;
}

/** z offset of a point at lateral x on a curve of radius R relative to the curve's middle (front face). */
export const arcZ = (x: number, R: number): number => R - Math.sqrt(Math.max(0, R * R - x * x));

/* ------------------------------------------------------------------ office bases */

/** Caster wheel pair under a point; `a` = direction of the base arm (radians around Y). */
export function caster(k: Kit, x: number, z: number, a: number, body: Mat, h = 0.075): void {
  const tx = Math.cos(a);
  const tz = Math.sin(a);
  const cx = x - tx * 0.022;
  const cz = z - tz * 0.022;
  k.cyl(0.007, h - 0.05, M.chrome(), x, 0.05, z, 0.007, 8);
  const hood = k.box(0.05, 0.028, 0.034, body, cx, 0.03, cz);
  hood.rotation.y = -a;
  for (const s of [-1, 1]) {
    const w = k.cyl(0.026, 0.016, M.rubber('#2a2a2c'), 0, 0, 0, 0.026, 10);
    w.quaternion.setFromUnitVectors(UP, new THREE.Vector3(-tz, 0, tx));
    w.position.set(cx - tz * s * 0.012, 0.026, cz + tx * s * 0.012);
  }
}

/** Five-star swivel base: arms, hub, casters (or glides). Returns the hub top height. */
export function starBase(k: Kit, r: number, mat: Mat, o: { casters?: boolean; n?: number; flat?: boolean; casterMat?: Mat } = {}): number {
  const n = o.n ?? 5;
  const cast = o.casters ?? true;
  const yTip = cast ? 0.085 : 0.03;
  const hubY = cast ? 0.1 : 0.055;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.PI / 2;
    const cx = Math.cos(a);
    const cz = Math.sin(a);
    if (o.flat) {
      k.beam([cx * 0.04, hubY + 0.015, cz * 0.04], [cx * (r - 0.01), yTip + 0.005, cz * (r - 0.01)], 0.045, 0.022, mat, 0);
    } else {
      k.rod([cx * 0.04, hubY + 0.02, cz * 0.04], [cx * (r - 0.012), yTip + 0.006, cz * (r - 0.012)], 0.02, mat, 0.013, 8);
    }
    if (cast) caster(k, cx * (r - 0.03), cz * (r - 0.03), a, o.casterMat ?? M.plastic('#2a2b2e'));
    else k.cyl(0.02, 0.016, M.rubber('#2a2a2c'), cx * (r - 0.02), 0, cz * (r - 0.02), 0.016, 8);
  }
  k.cyl(0.05, 0.05, mat, 0, hubY - 0.01, 0, 0.04, 16);
  return hubY + 0.04;
}

/* ------------------------------------------------------------------ plan symbols */

export function pPoly(ctx: Ctx2D, pts: Outline, fill: string | null, stroke: string = INK, lw?: number): void {
  D.poly(ctx, pts, true, fill, stroke, lw);
}

/** Back rest band seen from above: a strip curving backwards between x = ±w/2, ends at z. */
export function pBack(ctx: Ctx2D, w: number, z: number, t: number, bow: number, fill: string, stroke: string = INK): void {
  ctx.beginPath();
  ctx.moveTo(-w / 2, z);
  ctx.quadraticCurveTo(0, z - 2 * bow, w / 2, z);
  ctx.lineTo(w / 2, z - t);
  ctx.quadraticCurveTo(0, z - t - 2 * bow, -w / 2, z - t);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.stroke();
}

export function pDots(ctx: Ctx2D, pts: Array<[number, number]>, r: number, fill = '#ffffff'): void {
  for (const [x, z] of pts) D.circle(ctx, x, z, r, fill, INK_SOFT, LINE_THIN * 0.8);
}

export function pStar(ctx: Ctx2D, r: number, n = 5): void {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.PI / 2;
    D.line(ctx, 0, 0, Math.cos(a) * (r - 0.02), Math.sin(a) * (r - 0.02), INK_SOFT, 0.014);
    D.circle(ctx, Math.cos(a) * (r - 0.025), Math.sin(a) * (r - 0.025), 0.02, '#ffffff', INK_SOFT, 0.007);
  }
}

export { tint };
