/**
 * Small tabletop props shared by accessories.ts and appliances.ts: tableware, glasses, bottles,
 * candles, books, fruit, flowers, knobs. Positions follow the Kit convention (x/z = centre,
 * y = bottom) unless noted.
 */
import * as THREE from 'three';
import { Kit, M, darken, leafGeo, lighten, rng, smoothProfile } from '../kit';

export type Prof = Array<[number, number]>;

/** Lathe through a smoothed profile. */
export function sLathe(k: Kit, pts: Prof, mat: THREE.Material, x = 0, y = 0, z = 0, seg = 20, n = 20): THREE.Mesh {
  return k.lathe(smoothProfile(pts, n), mat, x, y, z, seg);
}

/** Lathe whose radius is modulated around the axis (fluted / ribbed vases, glasses). */
export function flutedLatheGeo(pts: Prof, flutes: number, depth: number, seg = 48): THREE.BufferGeometry {
  const g = new THREE.LatheGeometry(
    pts.map(([r, y]) => new THREE.Vector2(Math.max(0, r), y)),
    seg,
  );
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const a = Math.atan2(z, x);
    const f = 1 - depth * (0.5 + 0.5 * Math.cos(a * flutes));
    p.setX(i, x * f);
    p.setZ(i, z * f);
  }
  g.computeVertexNormals();
  return g;
}

/** Vertical half-ring handle on the +X side of a vessel (cups, mugs, jugs). (x, y, z) = ring centre. */
export function sideHandle(k: Kit, r: number, tube: number, mat: THREE.Material, x: number, y: number, z: number, rotY = 0): THREE.Mesh {
  const g = new THREE.TorusGeometry(r, tube, 6, 12, Math.PI);
  g.rotateZ(-Math.PI / 2);
  const m = k.geo(g, mat, x, y, z);
  m.rotation.y = rotY;
  return m;
}

/** Saucer, cup with handle and a drink inside. (x, y, z) = bottom centre of the saucer. Returns the top of the cup. */
export function cupAndSaucer(k: Kit, x: number, y: number, z: number, mat: THREE.Material, drink = '#3b2418', rotY = 0, scale = 1): number {
  const s = scale;
  k.lathe(
    [
      [0, 0],
      [0.035 * s, 0],
      [0.06 * s, 0.009 * s],
      [0.068 * s, 0.014 * s],
      [0.064 * s, 0.015 * s],
      [0.03 * s, 0.009 * s],
      [0, 0.009 * s],
    ],
    mat,
    x,
    y,
    z,
    16,
  );
  const cy = y + 0.009 * s;
  cup(k, x, cy, z, mat, drink, rotY, s);
  return cy + 0.058 * s;
}

/** Round cup (espresso / tea) with handle. */
export function cup(k: Kit, x: number, y: number, z: number, mat: THREE.Material, drink: string | null = '#3b2418', rotY = 0, s = 1, h = 0.058): void {
  sLathe(
    k,
    [
      [0, 0],
      [0.022 * s, 0],
      [0.024 * s, 0.004 * s],
      [0.034 * s, h * 0.6 * s],
      [0.039 * s, h * s],
      [0.036 * s, h * s],
      [0.031 * s, h * 0.6 * s],
      [0.02 * s, 0.008 * s],
      [0, 0.008 * s],
    ],
    mat,
    x,
    y,
    z,
    16,
    10,
  );
  if (drink) k.disc(0.033 * s, 0.002, M.ceramic(drink), x, y + h * 0.8 * s, z, 16);
  sideHandle(k, 0.014 * s, 0.0035 * s, mat, x + Math.cos(rotY) * 0.037 * s, y + h * 0.55 * s, z - Math.sin(rotY) * 0.037 * s, rotY);
}

/** Straight mug. */
export function mug(k: Kit, x: number, y: number, z: number, mat: THREE.Material, drink: string | null = '#3b2418', rotY = 0): void {
  k.lathe(
    [
      [0, 0],
      [0.036, 0],
      [0.04, 0.004],
      [0.04, 0.095],
      [0.036, 0.095],
      [0.036, 0.01],
      [0, 0.01],
    ],
    mat,
    x,
    y,
    z,
    18,
  );
  if (drink) k.disc(0.035, 0.002, M.ceramic(drink), x, y + 0.075, z, 16);
  sideHandle(k, 0.024, 0.006, mat, x + Math.cos(rotY) * 0.04, y + 0.05, z - Math.sin(rotY) * 0.04, rotY);
}

/** Stemmed wine glass, optionally with wine. Returns the rim height. */
export function wineGlass(k: Kit, x: number, y: number, z: number, wine: string | null = '#5c0f1e', h = 0.2): number {
  const g = M.glass('#e8f4f6', 0.25);
  const s = h / 0.2;
  sLathe(
    k,
    [
      [0, 0],
      [0.036 * s, 0],
      [0.036 * s, 0.003],
      [0.006, 0.008],
      [0.004, 0.09 * s],
      [0.02 * s, 0.1 * s],
      [0.043 * s, 0.14 * s],
      [0.04 * s, 0.2 * s],
    ],
    g,
    x,
    y,
    z,
    20,
    18,
  );
  if (wine) {
    sLathe(
      k,
      [
        [0, 0.094 * s],
        [0.022 * s, 0.103 * s],
        [0.039 * s, 0.13 * s],
        [0.04 * s, 0.135 * s],
        [0, 0.135 * s],
      ],
      M.glass(wine, 0.88),
      x,
      y,
      z,
      18,
      10,
    );
  }
  return y + 0.2 * s;
}

/** Straight tumbler, optional drink of a given fill (0..1). */
export function tumbler(k: Kit, x: number, y: number, z: number, h = 0.1, r = 0.034, drink: string | null = null, fill = 0.7): void {
  k.lathe(
    [
      [0, 0.008],
      [r * 0.92, 0.001],
      [r * 0.95, 0],
      [r, h],
      [r - 0.002, h],
      [r * 0.9, 0.01],
      [0, 0.01],
    ],
    M.glass('#e6f3f5', 0.28),
    x,
    y,
    z,
    20,
  );
  if (drink) k.cyl(r * 0.9, (h - 0.012) * fill, M.glass(drink, 0.75), x, y + 0.011, z, r * (0.9 + 0.08 * fill), 18);
}

/** Wine / oil bottle (opaque glossy glass), with label and capsule. Returns the top height. */
export function bottle(k: Kit, x: number, y: number, z: number, glassCol: string, labelCol: string, capCol: string, h = 0.31, r = 0.037): number {
  const s = h / 0.31;
  sLathe(
    k,
    [
      [0, 0.004],
      [r - 0.004, 0],
      [r, 0.008],
      [r, 0.2 * s],
      [r * 0.82, 0.225 * s],
      [0.014, 0.255 * s],
      [0.014, h - 0.005],
      [0.016, h - 0.003],
      [0, h],
    ],
    M.lacquer(glassCol),
    x,
    y,
    z,
    20,
    22,
  );
  k.cyl(r + 0.0008, 0.08 * s, M.matte(labelCol), x, y + 0.07 * s, z, r + 0.0008, 20);
  k.cyl(r + 0.0012, 0.012 * s, M.matte(darken(labelCol, 0.45)), x, y + 0.13 * s, z, r + 0.0012, 20);
  k.cyl(0.0158, 0.05 * s, M.metal(capCol, 0.35, 0.85), x, y + h - 0.05 * s, z, 0.0158, 14);
  return y + h;
}

/**
 * Candle with a slightly melted top and a wick. (x, y, z) = bottom centre. Returns the wick tip.
 * `taper`: radius at the top relative to the bottom (taper candles).
 */
export function candle(k: Kit, r: number, h: number, wax: THREE.Material, x: number, y: number, z: number, taper = 1): { x: number; y: number; z: number } {
  const rt = r * taper;
  k.lathe(
    [
      [0, 0],
      [r, 0],
      [rt, h - 0.004],
      [rt * 0.96, h],
      [rt * 0.75, h - Math.min(0.006, rt * 0.3)],
      [0, h - Math.min(0.008, rt * 0.35)],
    ],
    wax,
    x,
    y,
    z,
    taper < 1 ? 14 : 22,
  );
  const wy = y + h - Math.min(0.008, rt * 0.35);
  const tip = { x, y: wy + 0.012, z };
  k.rod([x, wy - 0.001, z], [x + 0.001, tip.y, z], 0.0011, M.matte('#1d1a17'), 0.0009, 5);
  return { x, y: +tip.y.toFixed(3), z };
}

/* ---------------------------------------------------------------- books */

const BOOK_COLS = ['#7a8fa3', '#c7775a', '#e6dfd0', '#52606d', '#d6a544', '#9bae8a', '#b9a79a', '#3f4f5f', '#a25d4a', '#2f3a33', '#6f7f6a', '#8a3b3b'];
export const bookColor = (r: () => number): string => BOOK_COLS[Math.floor(r() * BOOK_COLS.length)];

/**
 * Hardcover book lying flat (spine towards -X before rotation): covers, spine and the cream page
 * block. (x, y, z) = bottom centre. Returns the top height.
 */
export function bookFlat(k: Kit, w: number, t: number, d: number, col: string, x: number, y: number, z: number, rotY = 0): number {
  const b = new Kit();
  const cov = M.leather(col);
  const ct = 0.0028;
  b.box(w, ct, d, cov, 0, 0, 0);
  b.box(w, ct, d, cov, 0, t - ct, 0);
  b.rbox(0.006, t, d, 0.003, cov, -w / 2 + 0.003, 0, 0, 1);
  b.box(w - 0.008, t - 2 * ct, d - 0.008, M.matte('#efe8d8'), 0.002, ct, 0);
  // gilt / contrasting band on the spine
  b.box(0.0015, t * 0.5, d * 0.9, M.matte(lighten(col, 0.4)), -w / 2 - 0.0002, t * 0.25, 0);
  const g = k.sub(b, x, y, z);
  g.rotation.y = rotY;
  return y + t;
}

/** Book standing upright, spine facing +Z. (x, y, z) = bottom centre. `lean` tilts it around Z. */
export function bookUpright(k: Kit, t: number, h: number, d: number, col: string, x: number, y: number, z: number, lean = 0): void {
  const b = new Kit();
  const cov = M.leather(col);
  const ct = 0.0025;
  b.box(ct, h, d, cov, -t / 2 + ct / 2, 0, 0);
  b.box(ct, h, d, cov, t / 2 - ct / 2, 0, 0);
  b.rbox(t, h, 0.005, 0.002, cov, 0, 0, d / 2 - 0.0025, 1);
  b.box(t - 2 * ct, h - 0.006, d - 0.006, M.matte('#efe8d8'), 0, 0.003, -0.002);
  b.box(t + 0.0004, 0.012, 0.002, M.matte(lighten(col, 0.45)), 0, h * 0.78, d / 2 + 0.0002);
  b.box(t + 0.0004, 0.006, 0.002, M.matte(lighten(col, 0.45)), 0, h * 0.14, d / 2 + 0.0002);
  const g = k.sub(b, x, y, z);
  g.rotation.z = lean;
}

/* ---------------------------------------------------------------- fruit & flowers */

export function apple(k: Kit, x: number, yc: number, z: number, col = '#b3242b', r = 0.036): void {
  k.sphere(r, M.paint(col, 0.32), x, yc, z, 1, 0.9, 1, 14);
  k.rod([x, yc + r * 0.8, z], [x + 0.004, yc + r * 1.2, z + 0.002], 0.0022, M.matte('#4b3423'), 0.0018, 5);
}

export function orange(k: Kit, x: number, yc: number, z: number, r = 0.038, col = '#e8842a'): void {
  k.sphere(r, M.leather(col), x, yc, z, 1, 0.95, 1, 14);
  k.sphere(0.005, M.matte('#5d6a2e'), x, yc + r * 0.93, z, 1, 0.5, 1, 6);
}

/** Banana bunch lying on its side; (x, y, z) = where the stems meet. */
export function bananas(k: Kit, x: number, y: number, z: number, rotY = 0, n = 3): void {
  const b = new Kit();
  const peel = M.paint('#e9c74b', 0.55);
  const tipM = M.matte('#3c3224');
  for (let i = 0; i < n; i++) {
    const o = (i - (n - 1) / 2) * 0.03;
    const pts: Array<[number, number, number]> = [];
    for (let j = 0; j <= 5; j++) {
      const t = j / 5;
      const a = -0.25 + t * 1.7;
      pts.push([Math.sin(a) * 0.1 + 0.025, 0.02 + (1 - Math.cos(a)) * 0.03 * (1 - t) + Math.abs(o) * 0.25, o * (1 + t * 0.6) + (Math.cos(a) - 1) * 0.04]);
    }
    b.tube(pts, 0.017, peel, { seg: 14, radial: 5 });
    const e = pts[pts.length - 1];
    b.sphere(0.006, tipM, e[0], e[1], e[2], 1, 1, 1, 6);
  }
  b.rod([-0.002, 0.02, 0], [0.03, 0.022, 0], 0.012, M.matte('#8a7a3a'), 0.009, 6);
  const g = k.sub(b, x, y, z);
  g.rotation.y = rotY;
}

/** A stem with leaves; returns the tip. */
export function stem(k: Kit, base: [number, number, number], tip: [number, number, number], mat: THREE.Material, r = 0.0022): void {
  const mid: [number, number, number] = [(base[0] + tip[0]) / 2 + (tip[0] - base[0]) * 0.1, (base[1] + tip[1]) / 2, (base[2] + tip[2]) / 2];
  k.tube([base, mid, tip], r, mat, { seg: 6, radial: 4 });
}

/** Leaf standing out from a point: elevation (radians above horizontal) and azimuth around Y. */
export function leaf(
  k: Kit,
  len: number,
  wid: number,
  mat: THREE.Material,
  x: number,
  y: number,
  z: number,
  elev: number,
  az: number,
  droop = 0.3,
): THREE.Mesh {
  const m = k.geo(leafGeo(len, wid, { droop, seg: 5 }), mat, x, y, z);
  m.rotation.set(-elev, az, 0, 'YXZ');
  m.castShadow = false;
  return m;
}

/** Tulip head (closed cup of petals) at (x, y, z) = base of the bloom. */
export function tulip(k: Kit, x: number, y: number, z: number, col: string, s = 1): void {
  sLathe(
    k,
    [
      [0, 0],
      [0.012 * s, 0.006 * s],
      [0.017 * s, 0.022 * s],
      [0.015 * s, 0.04 * s],
      [0.009 * s, 0.05 * s],
    ],
    M.leaf(col),
    x,
    y,
    z,
    10,
    8,
  );
}

/** Open round bloom (rose / ranunculus): layered petal discs. */
export function bloom(k: Kit, x: number, y: number, z: number, col: string, r = 0.025, seed = 1): void {
  const rr = rng(seed);
  sLathe(
    k,
    [
      [0, 0],
      [r * 0.5, r * 0.15],
      [r, r * 0.55],
      [r * 0.92, r * 0.8],
      [r * 0.55, r * 0.95],
      [0, r * 0.75],
    ],
    M.leaf(col),
    x,
    y,
    z,
    12,
    10,
  );
  k.sphere(r * 0.45, M.leaf(darken(col, 0.15 + rr() * 0.1)), x, y + r * 0.8, z, 1, 0.6, 1, 8);
}

/* ---------------------------------------------------------------- misc */

/** Knob facing +Z: a short cylinder with a pointer line. (x, y) = centre on the panel plane z. */
export function knobZ(k: Kit, x: number, y: number, z: number, r: number, depth: number, mat: THREE.Material, mark?: THREE.Material, seg = 16): void {
  const g = new THREE.CylinderGeometry(r * 0.94, r, depth, seg);
  g.rotateX(Math.PI / 2);
  k.geo(g, mat, x, y, z + depth / 2);
  if (mark) k.box(r * 0.18, r * 0.8, 0.001, mark, x, y + r * 0.1, z + depth + 0.0003);
}

/** Disc facing +Z (dials, port holes); (x, y) = centre, z = back face. */
export function discZ(k: Kit, r: number, t: number, mat: THREE.Material, x: number, y: number, z: number, seg = 28): THREE.Mesh {
  const g = new THREE.CylinderGeometry(r, r, t, seg);
  g.rotateX(Math.PI / 2);
  return k.geo(g, mat, x, y, z + t / 2);
}

/** Ring (torus) facing +Z. */
export function ringZ(k: Kit, r: number, tube: number, mat: THREE.Material, x: number, y: number, z: number, seg = 28): THREE.Mesh {
  return k.geo(new THREE.TorusGeometry(r, tube, 8, seg), mat, x, y, z);
}

/** Flat circle facing +Z (decals, displays, mirror discs). */
export function circleZ(k: Kit, r: number, mat: THREE.Material, x: number, y: number, z: number, seg = 28): THREE.Mesh {
  const m = k.geo(new THREE.CircleGeometry(r, seg), mat, x, y, z);
  m.castShadow = false;
  return m;
}
