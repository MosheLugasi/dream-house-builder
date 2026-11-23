/**
 * Tables: dining tables, coffee tables, side tables, consoles and desks.
 *
 * Built from a handful of parametric helpers (tops with edge profiles, leg frames, trestles,
 * hairpins, live-edge slabs, small styled props) so every item stays clearly distinct while
 * sharing realistic joinery details.
 */
import * as THREE from 'three';
import type { FurnitureDef } from '../types';
import {
  D,
  INK_SOFT,
  Kit,
  LINE_THIN,
  M,
  PAL,
  boxUV,
  darken,
  ellipseShape,
  extrudeZ,
  lighten,
  mix,
  noise3,
  rng,
  roundedRectShape,
  smoothProfile,
  sym,
  tint,
  type Ctx2D,
  type V3,
} from '../kit';
import { bookStack, legs4, pot, slot } from './_parts';

type Mat = THREE.Material;
type Colors = Record<string, string>;

const G_DIN = 'שולחנות אוכל';
const G_COF = 'שולחנות סלון';
const G_SIDE = 'שולחנות צד';
const G_CON = 'קונסולות';
const G_DESK = 'שולחנות עבודה';

const WOOD = {
  oak: '#c9a777',
  whiteOak: '#d6bf98',
  ash: '#dccbab',
  birch: '#e3d2b4',
  walnut: '#6e4a33',
  darkWalnut: '#553826',
  teak: '#a9754a',
  pine: '#c99a63',
  reclaimed: '#8c6646',
  smoked: '#5c4636',
  cherry: '#9a5a3d',
  ebony: '#2f2a26',
};

/* ================================================================================ helpers */

/** Polygon shape from plan points (x, z). Shape y = -z (see extrudeY). */
function polyShape(pts: Array<[number, number]>): THREE.Shape {
  const s = new THREE.Shape();
  pts.forEach(([x, z], i) => (i === 0 ? s.moveTo(x, -z) : s.lineTo(x, -z)));
  s.closePath();
  return s;
}

type Edge = 'soft' | 'square' | 'bull' | 'knife' | 'step';

/**
 * A table top from an outline generator `shape(inset)` (outline shrunk by `inset`), with an edge
 * profile. `yTop` is the height of the top surface.
 */
function profTop(k: Kit, shape: (inset: number) => THREE.Shape, t: number, yTop: number, mat: Mat, edge: Edge, seg = 10, cx = 0, cz = 0): void {
  const y = yTop - t;
  const k0 = k;
  k = new Kit();
  switch (edge) {
    case 'square':
      k.slab(shape(0.001), t, mat, 0, y, 0, 0.001, seg);
      break;
    case 'soft': {
      const b = Math.min(0.004, t * 0.2);
      k.slab(shape(b), t, mat, 0, y, 0, b, seg);
      break;
    }
    case 'bull': {
      const b = t * 0.45;
      k.slab(shape(b), t, mat, 0, y, 0, b, seg);
      break;
    }
    case 'knife': {
      const t1 = t * 0.42;
      k.slab(shape(0.002), t1, mat, 0, yTop - t1, 0, 0.002, seg);
      const t2 = t - t1 + 0.002;
      const b2 = t2 * 0.48;
      const ins = Math.min(0.035, t * 1.1);
      k.slab(shape(ins + b2), t2, mat, 0, y, 0, b2, seg);
      break;
    }
    case 'step': {
      const t1 = t * 0.58;
      k.slab(shape(0.003), t1, mat, 0, yTop - t1, 0, 0.003, seg);
      k.slab(shape(0.016), t - t1 + 0.001, mat, 0, y, 0, 0.002, seg);
      break;
    }
  }
  k0.sub(k, cx, 0, cz);
}

function rectTop(k: Kit, w: number, d: number, t: number, yTop: number, mat: Mat, r = 0.01, edge: Edge = 'soft'): void {
  profTop(k, (i) => roundedRectShape(w - 2 * i, d - 2 * i, Math.max(0.002, r - i)), t, yTop, mat, edge, 5);
}

function roundTop(k: Kit, rx: number, rz: number, t: number, yTop: number, mat: Mat, edge: Edge = 'soft', seg = 22, cx = 0, cz = 0): void {
  profTop(k, (i) => ellipseShape(rx - i, rz - i), t, yTop, mat, edge, seg, cx, cz);
}

/** Planked top (boards along X with dark shadow seams). */
function plankTop(k: Kit, w: number, d: number, t: number, yTop: number, n: number, color: string, gap = 0.004, seamColor = '#2b211a'): void {
  const mats = [M.wood(color), M.wood(mix(color, '#000000', 0.08)), M.wood(mix(color, '#ffffff', 0.07)), M.wood(mix(color, '#5a3a20', 0.1))];
  const pw = (d - gap * (n - 1)) / n;
  for (let i = 0; i < n; i++) {
    const z = -d / 2 + pw / 2 + i * (pw + gap);
    k.rbox(w, t, pw, 0.005, mats[(i * 3 + 1) % mats.length], 0, yTop - t, z, 1);
  }
  // dark core so the seams read as shadow
  k.box(w - 0.02, t * 0.7, d - 0.02, M.matte(seamColor), 0, yTop - t + 0.002, 0);
}

/** Box whose top face is scaled / shifted: tapered or raked legs. Bottom centred at the origin. */
function taperGeo(w0: number, d0: number, w1: number, d1: number, h: number, dx = 0, dz = 0, off = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w0, h, d0);
  g.translate(0, h / 2, 0);
  boxUV(g, [w0, h, d0], true, off);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) > h / 2) {
      p.setX(i, p.getX(i) * (w1 / w0) + dx);
      p.setZ(i, p.getZ(i) * (d1 / d0) + dz);
    }
  }
  g.computeVertexNormals();
  return g;
}

/** Square leg tapered on its two inside faces; (ox, oz) = outer corner of the leg. */
function sqLeg(k: Kit, ox: number, oz: number, sx: number, sz: number, h: number, wTop: number, wBot: number, mat: Mat, y0 = 0): void {
  const bx = ox - (sx * wBot) / 2;
  const bz = oz - (sz * wBot) / 2;
  const dx = -(sx * (wTop - wBot)) / 2;
  const dz = -(sz * (wTop - wBot)) / 2;
  k.geo(taperGeo(wBot, wBot, wTop, wTop, h, dx, dz, ox * 3 + oz), mat, bx, y0, bz);
}

/** Lathe-turned leg (bun foot, vase, beads) with a square block at the top. */
function turnedLeg(k: Kit, x: number, z: number, h: number, r: number, mat: Mat, block = 0.14): void {
  const L = h - block;
  const P: Array<[number, number]> = [
    [0, 0],
    [0.6, 0],
    [0.68, 0.012],
    [0.7, 0.03],
    [0.55, 0.055],
    [0.48, 0.09],
    [0.55, 0.3],
    [0.68, 0.55],
    [0.82, 0.64],
    [0.86, 0.68],
    [0.66, 0.72],
    [0.72, 0.76],
    [0.92, 0.84],
    [0.68, 0.92],
    [0.84, 0.95],
    [0.84, 0.985],
    [0.6, 1],
    [0, 1],
  ];
  k.lathe(
    P.map(([a, b]) => [a * r, b * L] as [number, number]),
    mat,
    x,
    0,
    z,
    12,
  );
  k.rbox(r * 1.8, block + 0.002, r * 1.8, 0.004, mat, x, L - 0.002, z, 1);
}

interface FrameOpts {
  w: number;
  d: number;
  /** underside of the top */
  h: number;
  legW: number;
  legWb?: number;
  inset?: number;
  apronH?: number;
  apronT?: number;
  /** how far the apron sits back from the outer leg faces */
  apronSet?: number;
  leg: Mat;
  apron?: Mat;
  kind?: 'square' | 'round' | 'turned';
  /** split the long aprons in the middle (extending tables) */
  split?: boolean;
  /** skip the front apron (desks / consoles with drawers build their own) */
  noFront?: boolean;
}

/** Four legs joined by aprons (rails) right under the top. */
function legFrame(k: Kit, o: FrameOpts): void {
  const inset = o.inset ?? 0.03;
  const lx = o.w / 2 - inset;
  const lz = o.d / 2 - inset;
  const kind = o.kind ?? 'square';
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      if (kind === 'square') sqLeg(k, sx * lx, sz * lz, sx, sz, o.h, o.legW, o.legWb ?? o.legW * 0.62, o.leg);
      else if (kind === 'round') {
        const cx = sx * (lx - o.legW / 2);
        const cz = sz * (lz - o.legW / 2);
        k.rod([cx, 0, cz], [cx, o.h, cz], (o.legWb ?? o.legW * 0.6) / 2, o.leg, o.legW / 2, 14);
      } else turnedLeg(k, sx * (lx - o.legW / 2), sz * (lz - o.legW / 2), o.h, o.legW / 2, o.leg, (o.apronH ?? 0.1) + 0.03);
    }
  }
  const ah = o.apronH ?? 0;
  if (ah <= 0) return;
  const at = o.apronT ?? 0.022;
  const set = o.apronSet ?? 0.008;
  const am = o.apron ?? o.leg;
  const lenX = 2 * (lx - o.legW) + 0.01;
  const lenZ = 2 * (lz - o.legW) + 0.01;
  for (const s of [-1, 1]) {
    const z = s * (lz - set - at / 2);
    if (!(o.noFront && s === 1)) {
      if (o.split) {
        for (const h of [-1, 1]) k.box(lenX / 2 - 0.002, ah, at, am, (h * (lenX / 2 + 0.002)) / 2, o.h - ah, z);
      } else k.box(lenX, ah, at, am, 0, o.h - ah, z);
    }
    k.box(at, ah, lenZ, am, s * (lx - set - at / 2), o.h - ah, 0);
  }
}

/** Hairpin leg: two steel rods from a top plate converging into a tight U on the floor. */
function hairpin(k: Kit, x: number, z: number, h: number, sx: number, sz: number, mat: Mat, spread = 0.075, r = 0.0055): void {
  k.box(spread * 2 + 0.04, 0.005, 0.06, mat, x, h - 0.005, z);
  const xb = x + sx * 0.02;
  const zb = z + sz * 0.045;
  const top = h - 0.005;
  const A: V3 = [x - spread, top, z];
  const B1: V3 = [xb - 0.014, r + 0.024, zb];
  const C: V3 = [xb, r, zb];
  const B2: V3 = [xb + 0.014, r + 0.024, zb];
  const E: V3 = [x + spread, top, z];
  const lerp = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  k.tube([A, lerp(A, B1, 0.5), lerp(A, B1, 0.92), B1, C, B2, lerp(B2, E, 0.08), lerp(B2, E, 0.5), E], r, mat, { seg: 40, radial: 6 });
}

/** Live-edge slab outline: straight sawn ends, organic wavy long edges. `inset` shrinks it. */
function liveEdgeShape(w: number, d: number, seed: number, inset: number, amp = 0.035): THREE.Shape {
  const n = 30;
  const edge = (t: number, side: number): number => {
    const a = noise3(t * 4.2 + seed, side * 3.7 + 1, seed * 0.37) - 0.5;
    const b = noise3(t * 13 + seed * 2, side * 1.3 + 4, 5) - 0.5;
    // ends taper a little (natural log shape)
    const taper = Math.pow(Math.abs(t - 0.5) * 2, 4) * amp * 0.6;
    return d / 2 - amp + (a * 1.3 + b * 0.45) * amp - taper - inset;
  };
  const pts: Array<[number, number]> = [];
  const x0 = -w / 2 + inset;
  const x1 = w / 2 - inset;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push([x0 + (x1 - x0) * t, edge(t, 1)]);
  }
  for (let i = n; i >= 0; i--) {
    const t = i / n;
    pts.push([x0 + (x1 - x0) * t, -edge(t, -1)]);
  }
  return polyShape(pts);
}

/** Live-edge slab: pale sapwood rim + heartwood top surface. */
function liveEdgeSlab(k: Kit, w: number, d: number, t: number, yTop: number, color: string, seed: number, amp = 0.055): void {
  const sap = M.wood(mix(color, '#e6cfa6', 0.55));
  k.slab(liveEdgeShape(w, d, seed, 0.002, amp), t - 0.002, sap, 0, yTop - t, 0, 0.002, 4);
  k.slab(liveEdgeShape(w, d, seed, 0.018, amp), t - 0.004, M.wood(color), 0, yTop - t + 0.004, 0, 0.0015, 4);
}

/** River table: two live-edge boards with a resin river between them (straight outer edges). */
function riverTop(k: Kit, w: number, d: number, t: number, yTop: number, wood: Mat, resin: Mat, seed: number): void {
  const n = 32;
  const back: Array<[number, number]> = [];
  const front: Array<[number, number]> = [];
  const xs: number[] = [];
  const hw = w / 2 - 0.002;
  for (let i = 0; i <= n; i++) {
    const t0 = i / n;
    const x = -hw + 2 * hw * t0;
    xs.push(x);
    const c = Math.sin(t0 * 5.2 + seed) * d * 0.08 + (noise3(t0 * 3 + seed, 1, 2) - 0.5) * d * 0.1;
    const half = d * 0.07 + (noise3(t0 * 5 + seed * 3, 7, 1) - 0.3) * d * 0.12;
    const e1 = (noise3(t0 * 15 + seed, 3, 9) - 0.5) * 0.02;
    const e2 = (noise3(t0 * 15 + seed, 8, 2) - 0.5) * 0.02;
    back.push([x, c - Math.max(0.018, half) + e1]);
    front.push([x, c + Math.max(0.018, half) + e2]);
  }
  const hd = d / 2 - 0.002;
  const b = 0.0015;
  k.slab(polyShape([[-hw, -hd], [hw, -hd], ...back.slice().reverse()]), t, wood, 0, yTop - t, 0, b, 2);
  k.slab(polyShape([[-hw, hd], ...front, [hw, hd]]), t, wood, 0, yTop - t, 0, b, 2);
  k.slab(polyShape([...back, ...front.slice().reverse()]), t - 0.004, resin, 0, yTop - t + 0.0015, 0, 0.0015, 2);
}

/** Pale lathe-turned drum with bevelled edges (planar-UV slab: good for stone / marble). */
function disc(k: Kit, r: number, h: number, mat: Mat, y: number, bev = 0.004, x = 0, z = 0, seg = 22): void {
  k.slab(ellipseShape(r - bev, r - bev), h, mat, x, y, z, bev, seg);
}

function knob(k: Kit, x: number, y: number, z: number, mat: Mat, r = 0.011): void {
  k.rod([x, y, z - 0.002], [x, y, z + 0.016], r * 0.38, mat, r * 0.38, 8);
  k.sphere(r, mat, x, y, z + 0.018, 1, 1, 0.7, 10);
}

/** Vertical ring pull on a drawer front at z. */
function ringPull(k: Kit, x: number, y: number, z: number, mat: Mat): void {
  k.sphere(0.007, mat, x, y + 0.006, z + 0.003, 1, 1, 0.6, 8);
  k.geo(new THREE.TorusGeometry(0.016, 0.0028, 6, 16), mat, x, y - 0.008, z + 0.007);
}

/** Drawer front: slightly proud panel with a shadow reveal. */
function drawerFront(k: Kit, x: number, y: number, z: number, w: number, h: number, mat: Mat): void {
  k.box(w + 0.006, h + 0.006, 0.004, M.matte('#1f1b18'), x, y - 0.003, z - 0.002);
  k.rbox(w, h, 0.018, 0.003, mat, x, y, z + 0.009, 1);
}

/* ---------------------------------------------------------------- styled props */

const FRUIT = ['#e3a33a', '#cf4b2f', '#a9c24e', '#e8c547', '#b8352a'];

function fruitBowl(k: Kit, x: number, y: number, z: number, r: number, mat: Mat, seed = 1, fruit = true): void {
  k.lathe(
    [
      [0, 0],
      [r * 0.42, 0],
      [r * 0.46, 0.006],
      [r * 0.8, r * 0.28],
      [r, r * 0.5],
      [r * 0.95, r * 0.52],
      [r * 0.76, r * 0.32],
      [r * 0.38, r * 0.11],
      [0, r * 0.1],
    ],
    mat,
    x,
    y,
    z,
    22,
  );
  if (!fruit) return;
  const rand = rng(seed * 31 + 7);
  const fr = r * 0.27;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + rand();
    const d = r * 0.42;
    k.sphere(fr * (0.9 + rand() * 0.2), M.plastic(FRUIT[Math.floor(rand() * FRUIT.length)]), x + Math.cos(a) * d, y + r * 0.1 + fr * 0.9 + d * 0.25, z + Math.sin(a) * d, 1, 0.95, 1, 10);
  }
  k.sphere(fr, M.plastic(FRUIT[seed % FRUIT.length]), x, y + r * 0.1 + fr * 1.9, z, 1, 0.95, 1, 10);
}

/** Ceramic vase with a few branches of leaves. */
function vase(k: Kit, x: number, y: number, z: number, h: number, mat: Mat, leaves: string | null = '#6f8a5a', seed = 3): void {
  const outer = smoothProfile(
    [
      [h * 0.18, 0],
      [h * 0.3, h * 0.28],
      [h * 0.27, h * 0.6],
      [h * 0.12, h * 0.86],
      [h * 0.13, h],
    ],
    14,
  );
  k.lathe([[0, 0], ...outer, [h * 0.1, h], [h * 0.09, h * 0.9], [0, h * 0.9]], mat, x, y, z, 18);
  if (!leaves) return;
  const rand = rng(seed);
  const lm = M.leaf(leaves);
  const stem = M.matte(darken(leaves, 0.35));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + rand() * 0.8;
    const lean = 0.06 + rand() * 0.12;
    const L = h * (0.9 + rand() * 0.7);
    const tip: V3 = [x + Math.cos(a) * lean * L, y + h + L * 0.9, z + Math.sin(a) * lean * L];
    k.rod([x, y + h * 0.7, z], tip, 0.0025, stem, 0.0018, 5);
    for (let j = 1; j <= 5; j++) {
      const t = 0.3 + j * 0.13;
      const px = x + (tip[0] - x) * t;
      const py = y + h * 0.7 + (tip[1] - y - h * 0.7) * t;
      const pz = z + (tip[2] - z) * t;
      const side = j % 2 ? 1 : -1;
      const la = a + (side * Math.PI) / 2;
      const m = k.sphere(0.016, lm, px + Math.cos(la) * 0.014, py, pz + Math.sin(la) * 0.014, 1, 0.25, 0.62, 6);
      m.rotation.y = -la;
    }
  }
}

function candles(k: Kit, x: number, y: number, z: number, holder: Mat, n = 3): void {
  const wax = M.paint('#f1ebde', 0.6);
  const heights = [0.26, 0.2, 0.15];
  for (let i = 0; i < n; i++) {
    const cx = x + (i - (n - 1) / 2) * 0.09;
    const hh = 0.04 + i * 0.03;
    k.lathe(
      [
        [0, 0],
        [0.034, 0],
        [0.036, 0.006],
        [0.012, 0.02],
        [0.01, hh - 0.015],
        [0.02, hh - 0.004],
        [0.019, hh],
        [0, hh],
      ],
      holder,
      cx,
      y,
      z,
      14,
    );
    k.cyl(0.011, heights[i % 3], wax, cx, y + hh, z, 0.011, 10);
    k.rod([cx, y + hh + heights[i % 3], z], [cx, y + hh + heights[i % 3] + 0.012, z], 0.0012, M.matte('#222'), 0.0012, 4);
  }
}

function laptop(k: Kit, x: number, y: number, z: number, rot = 0, open = 0.28): void {
  const s = new Kit();
  const alu = M.metal('#b9bcc0', 0.35, 1);
  s.rbox(0.32, 0.012, 0.22, 0.004, alu, 0, 0, 0, 1);
  s.box(0.28, 0.002, 0.095, M.matte('#2a2b2e'), 0, 0.011, -0.035);
  s.box(0.1, 0.001, 0.06, M.metal('#a8abaf', 0.25, 1), 0, 0.0115, 0.065);
  const p = new Kit();
  p.rbox(0.32, 0.21, 0.006, 0.003, alu, 0, 0, 0.003, 1);
  p.box(0.3, 0.19, 0.001, M.screen('#1d2a3a'), 0, 0.012, 0.0062);
  const lid = s.sub(p, 0, 0.012, -0.108);
  lid.rotation.x = -open;
  const g = k.sub(s, x, y, z);
  g.rotation.y = rot;
}

function monitor(k: Kit, x: number, y: number, z: number, w = 0.6): void {
  const blk = M.plastic('#1d1e21');
  const alu = M.metal('#c7cacd', 0.35, 1);
  k.rbox(0.24, 0.01, 0.16, 0.004, alu, x, y, z, 1);
  const neck = k.box(0.045, 0.2, 0.014, alu, x, y + 0.008, z - 0.04);
  neck.rotation.x = -0.1;
  const hgt = w * 0.58;
  k.rbox(w, hgt, 0.022, 0.006, blk, x, y + 0.1, z - 0.02, 1);
  k.box(w - 0.016, hgt - 0.03, 0.002, M.screen('#141a24'), x, y + 0.1 + 0.022, z - 0.008);
}

function keyboard(k: Kit, x: number, y: number, z: number): void {
  k.rbox(0.42, 0.012, 0.13, 0.004, M.metal('#c7cacd', 0.35, 1), x, y, z, 1);
  k.box(0.4, 0.004, 0.11, M.plastic('#f2f2f2'), x, y + 0.01, z);
}

function penCup(k: Kit, x: number, y: number, z: number, mat: Mat): void {
  k.cyl(0.035, 0.1, mat, x, y, z, 0.035, 14);
  const cols = ['#d6a544', '#3d5166', '#c7775a', '#4f7d3c'];
  for (let i = 0; i < 4; i++) {
    const a = i * 1.7;
    k.rod([x + Math.cos(a) * 0.01, y + 0.02, z + Math.sin(a) * 0.01], [x + Math.cos(a) * 0.03, y + 0.165, z + Math.sin(a) * 0.03], 0.0035, M.matte(cols[i]), 0.0035, 6);
  }
}

function succulent(k: Kit, x: number, y: number, z: number, potMat: Mat): void {
  const soil = pot(k, 0.055, 0.042, 0.085, potMat, x, y, z);
  const lf = M.leaf('#7ea37a');
  for (let i = 0; i < 9; i++) {
    const a = i * 2.4;
    const rr = i < 5 ? 0.03 : 0.014;
    const m = k.sphere(0.022, lf, x + Math.cos(a) * rr, soil + 0.012 + (i < 5 ? 0 : 0.012), z + Math.sin(a) * rr, 0.55, 0.45, 1, 8);
    m.rotation.y = -a;
  }
}

/* ---------------------------------------------------------------- 2D helpers */

function dashed(ctx: Ctx2D, fn: () => void): void {
  ctx.save();
  ctx.setLineDash([0.03, 0.02]);
  fn();
  ctx.restore();
}

/** Hidden square legs drawn dashed at the four corners. */
function planLegs(ctx: Ctx2D, w: number, d: number, inset: number, s: number, round = false): void {
  dashed(ctx, () => {
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const x = sx * (w / 2 - inset - s / 2);
        const z = sz * (d / 2 - inset - s / 2);
        if (round) D.circle(ctx, x, z, s / 2, null, INK_SOFT, LINE_THIN);
        else D.rr(ctx, x, z, s, s, 0, null, INK_SOFT, LINE_THIN);
      }
    }
  });
}

function planPlanks(ctx: Ctx2D, w: number, d: number, n: number, x0 = -w / 2, x1 = w / 2): void {
  for (let i = 1; i < n; i++) {
    const z = -d / 2 + (d / n) * i;
    D.line(ctx, x0, z, x1, z, INK_SOFT, LINE_THIN);
  }
}

function liveEdgePlan(ctx: Ctx2D, w: number, d: number, seed: number, fill: string, amp = 0.055): void {
  const pts = liveEdgeShape(w, d, seed, 0.002, amp).getPoints();
  D.poly(
    ctx,
    pts.map((p) => [p.x, -p.y] as [number, number]),
    true,
    fill,
  );
}

/* ================================================================================ DINING */

const DH = 0.75;

const oakTable4: FurnitureDef = {
  id: 'table-oak-4',
  name: 'שולחן אוכל אלון ל-4',
  category: 'dining',
  group: G_DIN,
  tags: ['עץ', 'אלון', 'מלבני', '4 סועדים', 'קלאסי'],
  size: { w: 1.2, d: 0.8, h: DH },
  colors: [slot('top', 'משטח', WOOD.oak), slot('legs', 'רגליים', WOOD.oak)],
  build: ({ colors: c }) => {
    const k = new Kit();
    const w = 1.2;
    const d = 0.8;
    const t = 0.032;
    rectTop(k, w, d, t, DH, M.wood(c.top), 0.012, 'soft');
    legFrame(k, { w, d, h: DH - t, legW: 0.058, legWb: 0.036, inset: 0.035, apronH: 0.085, apronSet: 0.012, leg: M.wood(c.legs) });
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 1.2, 0.8, 0.012, tint(c.top, 0.35));
      planLegs(ctx, 1.2, 0.8, 0.035, 0.058);
    }),
};

const walnutTable6: FurnitureDef = {
  id: 'table-walnut-6',
  name: 'שולחן אוכל אגוז ל-6',
  category: 'dining',
  group: G_DIN,
  tags: ['עץ', 'אגוז', 'מיד-סנצ\'ורי', '6 סועדים', 'רטרו'],
  size: { w: 1.8, d: 0.92, h: DH },
  colors: [slot('top', 'משטח', WOOD.walnut), slot('legs', 'רגליים', WOOD.walnut)],
  build: ({ colors: c }) => {
    const k = new Kit();
    const w = 1.8;
    const d = 0.92;
    const t = 0.036;
    const wood = M.wood(c.top);
    const leg = M.wood(c.legs);
    rectTop(k, w, d, t, DH, wood, 0.06, 'knife');
    // inset rail frame
    const ax = w / 2 - 0.2;
    const az = d / 2 - 0.12;
    for (const s of [-1, 1]) {
      k.box(ax * 2, 0.07, 0.02, leg, 0, DH - t - 0.07, s * az);
      k.box(0.02, 0.07, az * 2, leg, s * ax, DH - t - 0.07, 0);
    }
    // round tapered, raked legs on corner blocks
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const tx = sx * (ax - 0.03);
        const tz = sz * (az - 0.03);
        k.box(0.07, 0.05, 0.07, leg, tx, DH - t - 0.05, tz);
        k.rod([tx + sx * 0.06, 0.002, tz + sz * 0.035], [tx, DH - t - 0.04, tz], 0.014, leg, 0.026, 14);
        k.cyl(0.0145, 0.004, M.brass(), tx + sx * 0.06, 0, tz + sz * 0.035, 0.0145, 10);
      }
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 1.8, 0.92, 0.06, tint(c.top, 0.3));
      D.rr(ctx, 0, 0, 1.8 - 0.07, 0.92 - 0.07, 0.04, null, INK_SOFT, LINE_THIN);
    }),
};

const farmTable8: FurnitureDef = {
  id: 'table-farm-8',
  name: 'שולחן אוכל כפרי ל-8',
  category: 'dining',
  group: G_DIN,
  tags: ['עץ מלא', 'כפרי', 'רגליים מחורטות', '8 סועדים', 'פרובאנס'],
  size: { w: 2.4, d: 1.0, h: DH },
  colors: [slot('top', 'משטח', '#a8784e'), slot('base', 'רגליים', '#e9e4d8')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const w = 2.4;
    const d = 1.0;
    const t = 0.045;
    const bw = 0.09; // breadboard ends
    plankTop(k, w - 2 * bw, d, t, DH, 4, c.top);
    const end = M.wood(darken(c.top, 0.06));
    for (const s of [-1, 1]) {
      k.rbox(bw, t, d, 0.006, end, s * (w / 2 - bw / 2), DH - t, 0, 1);
      for (const z of [-0.3, 0, 0.3]) k.cyl(0.008, 0.002, M.wood(darken(c.top, 0.35)), s * (w / 2 - bw / 2), DH - 0.0015, z, 0.008, 8);
    }
    const paint = M.paint(c.base, 0.55);
    legFrame(k, { w, d, h: DH - t, legW: 0.085, inset: 0.05, apronH: 0.11, apronT: 0.024, apronSet: 0.012, leg: paint, kind: 'turned' });
    // moulding under the apron
    for (const s of [-1, 1]) k.box(w - 0.3, 0.012, 0.03, paint, 0, DH - t - 0.122, s * (d / 2 - 0.08));
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 2.4, 1.0, 0.006, tint(c.top, 0.3));
      planPlanks(ctx, 2.4, 1.0, 4, -1.11, 1.11);
      D.line(ctx, -1.11, -0.5, -1.11, 0.5, INK_SOFT, LINE_THIN);
      D.line(ctx, 1.11, -0.5, 1.11, 0.5, INK_SOFT, LINE_THIN);
    }),
};

const trestleTable: FurnitureDef = {
  id: 'table-trestle',
  name: 'שולחן חווה על רגלי טרסל',
  category: 'dining',
  group: G_DIN,
  tags: ['עץ מלא', 'חווה', 'טרסל', 'כפרי', 'קרשים', '8 סועדים'],
  size: { w: 2.2, d: 0.95, h: DH },
  colors: [slot('top', 'משטח', WOOD.pine), slot('base', 'בסיס', '#7f5a3b')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const w = 2.2;
    const d = 0.95;
    const t = 0.05;
    plankTop(k, w, d, t, DH, 5, c.top, 0.005);
    const base = M.wood(c.base);
    const yU = DH - t;
    const px = w / 2 - 0.36;
    const fz = d / 2 - 0.08;
    for (const s of [-1, 1]) {
      const x = s * px;
      for (const zz of [-1, 1]) k.box(0.08, 0.02, 0.14, base, x, 0, zz * (fz - 0.07));
      k.rbox(0.085, 0.075, 2 * fz, 0.018, base, x, 0.02, 0, 1);
      k.rbox(0.075, 0.06, 2 * fz - 0.12, 0.014, base, x, yU - 0.06, 0, 1);
      k.rbox(0.065, yU - 0.06 - 0.093, 0.17, 0.008, base, x, 0.094, 0, 1);
      // chamfered post shoulders
      for (const zz of [-1, 1]) {
        const m = k.box(0.064, 0.05, 0.05, base, x, yU - 0.08, zz * 0.095);
        m.rotation.x = zz * 0.7;
        const m2 = k.box(0.064, 0.05, 0.05, base, x, 0.075, zz * 0.095);
        m2.rotation.x = -zz * 0.7;
      }
      // wedge through the stretcher tenon
      k.box(0.022, 0.15, 0.05, M.wood(darken(c.base, 0.2)), s * (px + 0.065), 0.25, 0);
    }
    k.rbox(2 * px + 0.2, 0.1, 0.042, 0.006, base, 0, 0.275, 0, 1);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 2.2, 0.95, 0.008, tint(c.top, 0.3));
      planPlanks(ctx, 2.2, 0.95, 5);
      dashed(ctx, () => {
        for (const s of [-1, 1]) D.rr(ctx, s * 0.74, 0, 0.085, 0.79, 0.01, null, INK_SOFT, LINE_THIN);
        D.line(ctx, -0.74, 0, 0.74, 0, INK_SOFT, LINE_THIN);
      });
    }),
};

const TULIP: Array<[number, number]> = [
  [0, 0],
  [0.27, 0],
  [0.275, 0.008],
  [0.262, 0.018],
  [0.19, 0.03],
  [0.11, 0.055],
  [0.065, 0.11],
  [0.047, 0.22],
  [0.042, 0.45],
  [0.05, 0.6],
  [0.09, 0.675],
  [0.17, 0.71],
  [0.19, 0.716],
  [0, 0.716],
];

const tulipMarble: FurnitureDef = {
  id: 'table-tulip-marble',
  name: 'שולחן אוכל עגול שיש ברגל טוליפ',
  category: 'dining',
  group: G_DIN,
  tags: ['שיש', 'עגול', 'רגל מרכזית', 'טוליפ', 'מודרני', '4 סועדים'],
  size: { w: 1.2, d: 1.2, h: DH },
  colors: [slot('top', 'שיש', '#f1efea'), slot('base', 'בסיס', '#f4f2ee')],
  build: ({ colors: c }) => {
    const k = new Kit();
    roundTop(k, 0.6, 0.6, 0.032, DH, M.marble(c.top), 'step', 26);
    k.lathe(TULIP, M.lacquer(c.base), 0, 0, 0, 36);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.circle(ctx, 0, 0, 0.6, tint(c.top, 0.2));
      dashed(ctx, () => D.circle(ctx, 0, 0, 0.27, null, INK_SOFT, LINE_THIN));
    }),
};

const ovalPedestal: FurnitureDef = {
  id: 'table-oval-pedestal',
  name: 'שולחן אוכל אובלי',
  category: 'dining',
  group: G_DIN,
  tags: ['אובלי', 'אליפסה', 'רגל מרכזית', 'עץ', '6 סועדים', 'מודרני'],
  size: { w: 2.0, d: 1.05, h: DH },
  colors: [slot('top', 'משטח', WOOD.whiteOak), slot('base', 'בסיס', '#2b2a28')],
  build: ({ colors: c }) => {
    const k = new Kit();
    roundTop(k, 1.0, 0.525, 0.034, DH, M.wood(c.top), 'knife', 30);
    const base = M.lacquer(c.base);
    k.slab(ellipseShape(0.5, 0.23), 0.03, base, 0, 0, 0, 0.008, 24);
    const ped = k.lathe(
      [
        [0, 0.03],
        [0.13, 0.03],
        [0.1, 0.07],
        [0.082, 0.2],
        [0.08, 0.45],
        [0.095, 0.6],
        [0.135, 0.67],
        [0.17, 0.7],
        [0.17, 0.716],
        [0, 0.716],
      ],
      base,
      0,
      0,
      0,
      32,
    );
    ped.scale.set(2.6, 1, 1.25);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.ellipse(ctx, 0, 0, 1.0, 0.525, tint(c.top, 0.3));
      D.ellipse(ctx, 0, 0, 0.97, 0.5, null, INK_SOFT, LINE_THIN);
      dashed(ctx, () => D.ellipse(ctx, 0, 0, 0.6, 0.3, null, INK_SOFT, LINE_THIN));
    }),
};

const glassTable: FurnitureDef = {
  id: 'table-glass-steel',
  name: 'שולחן אוכל זכוכית ומתכת',
  category: 'dining',
  group: G_DIN,
  tags: ['זכוכית', 'מתכת', 'נירוסטה', 'מודרני', '6 סועדים'],
  size: { w: 1.6, d: 0.9, h: DH },
  colors: [slot('frame', 'מסגרת', '#c9ccce'), slot('glass', 'זכוכית', '#d9eee9')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const w = 1.6;
    const d = 0.9;
    const steel = M.brushed(c.frame);
    const gt = 0.012;
    const yG = DH - gt;
    // glass top with a greenish edge
    k.rbox(w - 0.004, gt, d - 0.004, 0.004, M.glass(c.glass, 0.2), 0, yG, 0, 1);
    const edge = M.glass(mix(c.glass, '#4f9a86', 0.6), 0.55);
    for (const s of [-1, 1]) {
      k.box(w - 0.006, gt - 0.002, 0.003, edge, 0, yG + 0.001, s * (d / 2 - 0.0035));
      k.box(0.003, gt - 0.002, d - 0.006, edge, s * (w / 2 - 0.0035), yG + 0.001, 0);
    }
    // rubber pads and frame
    const lx = w / 2 - 0.1;
    const lz = d / 2 - 0.08;
    const s4 = 0.04;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        k.rbox(s4, yG - 0.004, s4, 0.004, steel, sx * lx, 0, sz * lz, 1);
        k.cyl(0.012, 0.004, M.rubber('#cfd3d0'), sx * lx, yG - 0.004, sz * lz, 0.012, 10);
      }
      k.rbox(0.025, 0.05, 2 * lz - s4, 0.003, steel, sx * lx, yG - 0.06, 0, 1);
    }
    for (const s of [-1, 1]) k.rbox(2 * lx - s4, 0.05, 0.025, 0.003, steel, 0, yG - 0.06, s * lz, 1);
    // central spine
    k.rbox(2 * lx - s4, 0.03, 0.03, 0.003, steel, 0, yG - 0.045, 0, 1);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 1.6, 0.9, 0.004, tint(c.glass, 0.4));
      D.rr(ctx, 0, 0, 1.6 - 0.2 + 0.04, 0.9 - 0.16 + 0.04, 0, null, INK_SOFT, LINE_THIN);
      D.line(ctx, -0.7, 0, 0.7, 0, INK_SOFT, LINE_THIN);
    }),
};

const liveEdgeTable: FurnitureDef = {
  id: 'table-live-edge',
  name: 'שולחן אוכל לייב-אדג\' על רגלי סיכה',
  category: 'dining',
  group: G_DIN,
  tags: ['לייב אדג\'', 'עץ מלא', 'אגוז', 'רגלי סיכה', 'תעשייתי', 'סלאב'],
  size: { w: 2.0, d: 0.88, h: DH },
  colors: [slot('top', 'עץ', '#6a4630'), slot('legs', 'רגליים', '#24252a')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const w = 2.0;
    const d = 0.95;
    const t = 0.055;
    liveEdgeSlab(k, w, d, t, DH, c.top, 4);
    const metal = M.metal(c.legs, 0.5, 0.7);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) hairpin(k, sx * (w / 2 - 0.2), sz * (d / 2 - 0.17), DH - t, sx, sz, metal, 0.08, 0.0065);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      liveEdgePlan(ctx, 2.0, 0.95, 4, tint(c.top, 0.35));
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.ellipse(0.25 - i * 0.05, 0.02, 0.32 - i * 0.09, 0.12 - i * 0.035, 0, 0, Math.PI * 2);
        ctx.strokeStyle = INK_SOFT;
        ctx.lineWidth = LINE_THIN * 0.7;
        ctx.stroke();
      }
    }),
};

const extendTable: FurnitureDef = {
  id: 'table-extendable',
  name: 'שולחן אוכל נפתח',
  category: 'dining',
  group: G_DIN,
  tags: ['נפתח', 'הארכה', 'פלטה נוספת', 'לבן', '6-8 סועדים'],
  size: { w: 1.6, d: 0.9, h: DH },
  colors: [slot('top', 'משטח', '#f0eee9'), slot('legs', 'רגליים', WOOD.oak)],
  build: ({ colors: c }) => {
    const k = new Kit();
    const w = 1.6;
    const d = 0.9;
    const t = 0.03;
    const top = M.paint(c.top, 0.38);
    // three segments: two halves + the centre leaf, separated by fine seams
    const leaf = 0.45;
    const half = (w - leaf) / 2;
    const gap = 0.0025;
    const shp = (ww: number, r: number) => roundedRectShape(ww, d - 0.008, r);
    for (const s of [-1, 1]) {
      const m = k.slab(shp(half - gap - 0.008, 0.012), t - 0.008, top, 0, DH - t, 0, 0.004, 5);
      m.position.x = s * (leaf / 2 + half / 2);
    }
    k.slab(shp(leaf - 2 * gap - 0.008, 0.002), t - 0.008, top, 0, DH - t, 0, 0.004, 2);
    // slides under the leaf
    for (const s of [-1, 1]) k.box(w - 0.4, 0.025, 0.03, M.steel(), 0, DH - t - 0.04, s * 0.22);
    legFrame(k, { w, d, h: DH - t, legW: 0.06, legWb: 0.038, inset: 0.035, apronH: 0.08, apronSet: 0.012, leg: M.wood(c.legs), apron: M.paint(c.top, 0.45), split: true });
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 1.6, 0.9, 0.012, tint(c.top, 0.1));
      for (const s of [-1, 1]) D.line(ctx, s * 0.225, -0.45, s * 0.225, 0.45, INK_SOFT, LINE_THIN);
      planLegs(ctx, 1.6, 0.9, 0.035, 0.06);
    }),
};

const bistroTable: FurnitureDef = {
  id: 'table-bistro',
  name: 'שולחן ביסטרו עגול',
  category: 'dining',
  group: G_DIN,
  tags: ['ביסטרו', 'בית קפה', 'קטן', 'שיש', 'ברזל יצוק', '2 סועדים', 'פריזאי'],
  size: { w: 0.7, d: 0.7, h: DH },
  colors: [slot('top', 'שיש', '#f3f1ec'), slot('base', 'בסיס', '#2a2a2c')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const r = 0.34;
    disc(k, r, 0.022, M.marble(c.top), DH - 0.022, 0.003, 0, 0, 26);
    // brass edge band
    k.lathe(
      [
        [r, DH - 0.028],
        [r + 0.006, DH - 0.028],
        [r + 0.008, DH - 0.024],
        [r + 0.008, DH - 0.004],
        [r + 0.006, DH + 0.0],
        [r, DH],
      ],
      M.brass(),
      0,
      0,
      0,
      40,
    );
    const iron = M.metal(c.base, 0.55, 0.6);
    k.lathe(
      [
        [0, 0.1],
        [0.055, 0.1],
        [0.06, 0.12],
        [0.04, 0.14],
        [0.032, 0.2],
        [0.042, 0.24],
        [0.03, 0.27],
        [0.024, 0.5],
        [0.032, 0.6],
        [0.028, 0.63],
        [0.04, 0.66],
        [0.06, 0.69],
        [0.15, 0.71],
        [0.15, DH - 0.022],
        [0, DH - 0.022],
      ],
      iron,
      0,
      0,
      0,
      18,
    );
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const P = (rr: number, y: number): V3 => [ca * rr, y, sa * rr];
      k.tube([P(0.035, 0.13), P(0.09, 0.085), P(0.17, 0.035), P(0.25, 0.02), P(0.28, 0.035), P(0.27, 0.05)], 0.013, iron, { seg: 24, radial: 8 });
      k.cyl(0.02, 0.01, M.rubber(), ca * 0.24, 0, sa * 0.24, 0.02, 10);
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.circle(ctx, 0, 0, 0.348, tint(c.top, 0.15));
      D.circle(ctx, 0, 0, 0.335, null, INK_SOFT, LINE_THIN);
      dashed(ctx, () => {
        for (let i = 0; i < 4; i++) {
          const a = Math.PI / 4 + (i * Math.PI) / 2;
          D.line(ctx, 0, 0, Math.cos(a) * 0.28, Math.sin(a) * 0.28, INK_SOFT, LINE_THIN);
        }
      });
    }),
};

const counterTable: FurnitureDef = {
  id: 'table-counter',
  name: 'שולחן בר גבוה',
  category: 'dining',
  group: G_DIN,
  tags: ['גבוה', 'בר', 'דלפק', 'תעשייתי', 'מתכת', 'אלון'],
  size: { w: 1.5, d: 0.8, h: 0.9 },
  colors: [slot('top', 'משטח', WOOD.oak), slot('frame', 'מסגרת', '#26272a')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const w = 1.5;
    const d = 0.8;
    const H = 0.9;
    const t = 0.04;
    rectTop(k, w, d, t, H, M.wood(c.top), 0.008, 'soft');
    const m = M.metal(c.frame, 0.5, 0.7);
    const lx = w / 2 - 0.06;
    const lz = d / 2 - 0.06;
    const s = 0.04;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        k.rbox(s, H - t, s, 0.003, m, sx * lx, 0, sz * lz, 1);
        k.cyl(0.016, 0.006, M.rubber(), sx * lx, 0, sz * lz, 0.016, 10);
      }
      k.rbox(s * 0.6, s, 2 * lz, 0.003, m, sx * lx, H - t - s, 0, 1);
      // foot rest
      k.rod([sx * lx, 0.25, -lz], [sx * lx, 0.25, lz], 0.012, m, 0.012, 10);
    }
    for (const sz of [-1, 1]) {
      k.rbox(2 * lx, s, s * 0.6, 0.003, m, 0, H - t - s, sz * lz, 1);
      k.rod([-lx, 0.25, sz * lz], [lx, 0.25, sz * lz], 0.012, m, 0.012, 10);
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 1.5, 0.8, 0.008, tint(c.top, 0.35));
      dashed(ctx, () => D.rr(ctx, 0, 0, 1.42, 0.72, 0, null, INK_SOFT, LINE_THIN));
    }),
};

const terrazzoTable: FurnitureDef = {
  id: 'table-terrazzo-round',
  name: 'שולחן אוכל עגול טרצו',
  category: 'dining',
  group: G_DIN,
  tags: ['טרצו', 'עגול', 'רגל מרכזית', 'מודרני', '4 סועדים'],
  size: { w: 1.05, d: 1.05, h: DH },
  colors: [slot('top', 'טרצו', '#ffffff'), slot('base', 'בסיס', '#ece7df')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const tz = M.terrazzo(c.top);
    disc(k, 0.525, 0.03, tz, DH - 0.03, 0.006, 0, 0, 28);
    const base = M.terrazzo(c.base);
    disc(k, 0.29, 0.04, base, 0, 0.008, 0, 0, 24);
    k.lathe(
      [
        [0, 0.039],
        [0.17, 0.039],
        [0.16, 0.06],
        [0.13, 0.3],
        [0.13, 0.5],
        [0.15, 0.66],
        [0.2, 0.7],
        [0.2, DH - 0.03],
        [0, DH - 0.03],
      ],
      base,
      0,
      0,
      0,
      28,
    );
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.circle(ctx, 0, 0, 0.525, tint('#e7e1d6', 0.2));
      const r = rng(9);
      for (let i = 0; i < 40; i++) {
        const a = r() * Math.PI * 2;
        const d = Math.sqrt(r()) * 0.47;
        D.circle(ctx, Math.cos(a) * d, Math.sin(a) * d, 0.008 + r() * 0.012, ['#c7775a', '#8a8d90', '#9bae8a', '#3b3f45'][i % 4], null);
      }
      dashed(ctx, () => D.circle(ctx, 0, 0, 0.29, null, INK_SOFT, LINE_THIN));
    }),
};

const rattanBaseTable: FurnitureDef = {
  id: 'table-rattan-base',
  name: 'שולחן אוכל עגול על בסיס ראטן',
  category: 'dining',
  group: G_DIN,
  tags: ['ראטן', 'קש', 'עגול', 'בוהו', 'עץ', 'טבעי'],
  size: { w: 1.2, d: 1.2, h: DH },
  colors: [slot('top', 'משטח', WOOD.teak), slot('base', 'קליעה', '#c49a62')],
  build: ({ colors: c }) => {
    const k = new Kit();
    roundTop(k, 0.6, 0.6, 0.035, DH, M.wood(c.top), 'bull', 26);
    const wk = M.wicker(c.base);
    // hourglass core wrapped in rattan cord: a ribbed lathe profile
    const prof: Array<[number, number]> = [];
    const y0 = 0.03;
    const y1 = 0.69;
    const n = 46;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const y = y0 + (y1 - y0) * t;
      const base = 0.2 + 0.085 * Math.pow(Math.abs(t - 0.52) / 0.52, 1.6);
      prof.push([base + (i % 2 ? 0.008 : 0), y]);
    }
    k.lathe([[0, y0], ...prof, [0, y1]], wk, 0, 0, 0, 20);
    const ring = M.wood(darken(c.top, 0.15));
    disc(k, 0.305, 0.03, ring, 0, 0.006, 0, 0, 26);
    k.ring(0.278, 0.012, ring, 0, 0.69, 0, 30);
    k.cyl(0.25, DH - 0.035 - 0.69, ring, 0, 0.69, 0, 0.25, 24);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.circle(ctx, 0, 0, 0.6, tint(c.top, 0.35));
      dashed(ctx, () => D.circle(ctx, 0, 0, 0.3, null, INK_SOFT, LINE_THIN));
    }),
};

const concreteTable: FurnitureDef = {
  id: 'table-concrete',
  name: 'שולחן אוכל בטון ומתכת',
  category: 'dining',
  group: G_DIN,
  tags: ['בטון', 'מתכת', 'תעשייתי', 'לופט', '6 סועדים'],
  size: { w: 2.0, d: 0.95, h: DH },
  colors: [slot('top', 'בטון', '#a8a6a1'), slot('frame', 'מסגרת', '#1f2023')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const w = 2.0;
    const d = 0.95;
    const t = 0.05;
    rectTop(k, w, d, t, DH, M.stone(c.top, 0.78), 0.006, 'soft');
    // tiny pores
    const r = rng(17);
    const pore = M.matte(darken(c.top, 0.35));
    for (let i = 0; i < 26; i++) k.cyl(0.0025 + r() * 0.002, 0.0006, pore, (r() - 0.5) * (w - 0.1), DH, (r() - 0.5) * (d - 0.1), 0.002, 6);
    // sled frames
    const m = M.metal(c.frame, 0.45, 0.75);
    const s = 0.045;
    const x = w / 2 - 0.2;
    const lz = d / 2 - 0.09;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) k.rbox(s, DH - t - 0.002, s, 0.003, m, sx * x, 0.001, sz * (lz - s / 2), 1);
      k.rbox(s, s, 2 * lz, 0.003, m, sx * x, 0, 0, 1);
      k.rbox(s, s, 2 * lz, 0.003, m, sx * x, DH - t - s, 0, 1);
    }
    k.rbox(2 * x, 0.03, 0.06, 0.003, m, 0, DH - t - 0.03, 0, 1);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 2.0, 0.95, 0.006, tint(c.top, 0.35));
      dashed(ctx, () => {
        for (const s of [-1, 1]) D.rr(ctx, s * 0.8, 0, 0.045, 0.77, 0, null, INK_SOFT, LINE_THIN);
      });
    }),
};

const pipeTable: FurnitureDef = {
  id: 'table-industrial-pipe',
  name: 'שולחן אוכל תעשייתי רגלי צינור',
  category: 'dining',
  group: G_DIN,
  tags: ['תעשייתי', 'צינורות', 'עץ ממוחזר', 'לופט', 'קרשים'],
  size: { w: 1.8, d: 0.9, h: DH },
  colors: [slot('top', 'עץ ממוחזר', WOOD.reclaimed), slot('pipe', 'צינורות', '#4a4c4f')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const w = 1.8;
    const d = 0.9;
    const t = 0.045;
    plankTop(k, w, d, t, DH, 4, c.top, 0.006);
    const g = M.metal(c.pipe, 0.4, 0.85);
    const yU = DH - t;
    const lx = w / 2 - 0.12;
    const lz = d / 2 - 0.11;
    const pr = 0.017;
    const yR = 0.2;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const x = sx * lx;
        const z = sz * lz;
        k.cyl(0.048, 0.01, g, x, 0, z, 0.046, 16);
        k.cyl(0.026, 0.028, g, x, 0.01, z, 0.024, 12);
        k.cyl(pr, yU - 0.07, g, x, 0.035, z, pr, 12);
        k.cyl(0.024, 0.028, g, x, yU - 0.038, z, 0.026, 12);
        k.cyl(0.046, 0.01, g, x, yU - 0.01, z, 0.048, 16);
        // tee
        k.cyl(0.024, 0.065, g, x, yR - 0.032, z, 0.024, 12);
        k.rod([x, yR, z], [x, yR, z - sz * 0.045], 0.024, g, 0.024, 12);
      }
      k.rod([sx * lx, yR, -lz + 0.045], [sx * lx, yR, lz - 0.045], pr, g, pr, 12);
      // centre tee + long stretcher
      k.rod([sx * lx, yR, -0.035], [sx * lx, yR, 0.035], 0.024, g, 0.024, 12);
      k.rod([sx * lx, yR, 0], [sx * (lx - 0.045), yR, 0], 0.024, g, 0.024, 12);
    }
    k.rod([-(lx - 0.045), yR, 0], [lx - 0.045, yR, 0], pr, g, pr, 12);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 1.8, 0.9, 0.006, tint(c.top, 0.35));
      planPlanks(ctx, 1.8, 0.9, 4);
      dashed(ctx, () => {
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) D.circle(ctx, sx * 0.78, sz * 0.34, 0.048, null, INK_SOFT, LINE_THIN);
      });
    }),
};

const scandiTable: FurnitureDef = {
  id: 'table-scandi',
  name: 'שולחן אוכל סקנדינבי',
  category: 'dining',
  group: G_DIN,
  tags: ['סקנדינבי', 'נורדי', 'רגליים משופעות', 'אשור', 'בהיר', '6 סועדים'],
  size: { w: 1.6, d: 0.85, h: DH },
  colors: [slot('top', 'משטח', WOOD.ash), slot('legs', 'רגליים', WOOD.ash)],
  build: ({ colors: c }) => {
    const k = new Kit();
    const w = 1.6;
    const d = 0.85;
    const t = 0.026;
    const leg = M.wood(c.legs);
    rectTop(k, w, d, t, DH, M.wood(c.top), 0.09, 'bull');
    const ax = w / 2 - 0.16;
    const az = d / 2 - 0.13;
    for (const s of [-1, 1]) {
      k.rbox(ax * 2, 0.065, 0.022, 0.006, leg, 0, DH - t - 0.065, s * az, 1);
      k.rbox(0.022, 0.065, az * 2, 0.006, leg, s * ax, DH - t - 0.065, 0, 1);
    }
    legs4(k, 2 * ax + 0.02, 2 * az + 0.02, DH - t, leg, { rTop: 0.024, rBot: 0.015, inset: 0.035, splay: 0.06 });
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 1.6, 0.85, 0.09, tint(c.top, 0.3));
      dashed(ctx, () => {
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) D.circle(ctx, sx * 0.71, sz * 0.36, 0.018, null, INK_SOFT, LINE_THIN);
      });
    }),
};

const squareXTable: FurnitureDef = {
  id: 'table-square-x',
  name: 'שולחן אוכל מרובע בסיס איקס',
  category: 'dining',
  group: G_DIN,
  tags: ['מרובע', 'ריבועי', 'בסיס X', 'עץ', '4 סועדים', 'פינת אוכל קטנה'],
  size: { w: 0.9, d: 0.9, h: DH },
  colors: [slot('top', 'משטח', WOOD.smoked), slot('base', 'בסיס', WOOD.smoked)],
  build: ({ colors: c }) => {
    const k = new Kit();
    const t = 0.03;
    rectTop(k, 0.9, 0.9, t, DH, M.wood(c.top), 0.02, 'step');
    const base = M.wood(c.base);
    const H = DH - t;
    const s = new THREE.Shape();
    s.moveTo(-0.5, 0);
    s.lineTo(-0.4, 0);
    s.quadraticCurveTo(0, 0.26, 0.4, 0);
    s.lineTo(0.5, 0);
    s.lineTo(0.28, H);
    s.lineTo(-0.28, H);
    s.closePath();
    for (const a of [Math.PI / 4, -Math.PI / 4]) {
      const m = k.geo(extrudeZ(s, 0.042, 0.004, 8), base);
      m.rotation.y = a;
    }
    k.rbox(0.42, 0.03, 0.42, 0.004, base, 0, H - 0.03, 0, 1);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 0.9, 0.9, 0.02, tint(c.top, 0.3));
      D.rr(ctx, 0, 0, 0.87, 0.87, 0.015, null, INK_SOFT, LINE_THIN);
      dashed(ctx, () => {
        D.line(ctx, -0.35, -0.35, 0.35, 0.35, INK_SOFT, LINE_THIN);
        D.line(ctx, -0.35, 0.35, 0.35, -0.35, INK_SOFT, LINE_THIN);
      });
    }),
};

const blackOakRound: FurnitureDef = {
  id: 'table-round-4leg',
  name: 'שולחן אוכל עגול ארבע רגליים',
  category: 'dining',
  group: G_DIN,
  tags: ['עגול', 'עץ', 'אלון מושחר', 'מינימליסטי', '4 סועדים'],
  size: { w: 1.1, d: 1.1, h: DH },
  colors: [slot('top', 'משטח', WOOD.ebony), slot('legs', 'רגליים', WOOD.ebony)],
  build: ({ colors: c }) => {
    const k = new Kit();
    const t = 0.03;
    roundTop(k, 0.55, 0.55, t, DH, M.wood(c.top, 0.5), 'knife', 26);
    const leg = M.wood(c.legs, 0.5);
    // circular apron ring
    k.lathe(
      [
        [0.34, DH - t - 0.07],
        [0.36, DH - t - 0.07],
        [0.36, DH - t],
        [0.34, DH - t],
        [0.34, DH - t - 0.07],
      ],
      leg,
      0,
      0,
      0,
      32,
    );
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2;
      const x = Math.cos(a) * 0.35;
      const z = Math.sin(a) * 0.35;
      k.geo(taperGeo(0.04, 0.04, 0.06, 0.06, DH - t, 0, 0, i), leg, x, 0, z).rotation.y = -a;
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.circle(ctx, 0, 0, 0.55, tint(c.top, 0.55));
      D.circle(ctx, 0, 0, 0.52, null, INK_SOFT, LINE_THIN);
      dashed(ctx, () => D.circle(ctx, 0, 0, 0.36, null, INK_SOFT, LINE_THIN));
    }),
};

/* ================================================================================ COFFEE */

const marbleRoundCoffee: FurnitureDef = {
  id: 'coffee-marble-round',
  name: 'שולחן סלון עגול שיש ופליז',
  category: 'living',
  group: G_COF,
  tags: ['שיש', 'פליז', 'זהב', 'עגול', 'יוקרתי'],
  size: { w: 0.9, d: 0.9, h: 0.4 },
  colors: [slot('top', 'שיש', '#f2f0ec'), slot('frame', 'מסגרת', '#c9a35a')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const H = 0.4;
    roundTop(k, 0.45, 0.45, 0.025, H, M.marble(c.top), 'step', 26);
    const b = M.metal(c.frame, 0.28, 1);
    const R = 0.36;
    k.ring(R, 0.009, b, 0, H - 0.034, 0, 36);
    k.ring(R, 0.008, b, 0, 0.07, 0, 36);
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      k.rod([Math.cos(a) * R, 0.004, Math.sin(a) * R], [Math.cos(a) * R, H - 0.025, Math.sin(a) * R], 0.0095, b, 0.0095, 10);
      k.cyl(0.013, 0.006, b, Math.cos(a) * R, 0, Math.sin(a) * R, 0.011, 10);
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.circle(ctx, 0, 0, 0.45, tint(c.top, 0.15));
      D.circle(ctx, 0, 0, 0.434, null, INK_SOFT, LINE_THIN);
      dashed(ctx, () => D.circle(ctx, 0, 0, 0.36, null, tint(c.frame, 0), LINE_THIN));
    }),
};

const nestingCoffee: FurnitureDef = {
  id: 'coffee-nesting',
  name: 'זוג שולחנות סלון נכנסים',
  category: 'living',
  group: G_COF,
  tags: ['זוג', 'נכנסים', 'קינון', 'עגול', 'עץ', 'מתכת'],
  size: { w: 1.04, d: 0.74, h: 0.42 },
  colors: [slot('top', 'משטחים', WOOD.walnut), slot('frame', 'רגליים', '#1f1f22')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const wood = M.wood(c.top);
    const m = M.metal(c.frame, 0.4, 0.8);
    const rim = M.brass();
    const tbl = (cx: number, cz: number, r: number, H: number, angs: number[]) => {
      disc(k, r, 0.022, wood, H - 0.022, 0.004, cx, cz, 26);
      k.ring(r - 0.003, 0.0045, rim, cx, H - 0.004, cz, 40);
      const lr = r - 0.04;
      for (const a of angs) {
        const x = cx + Math.cos(a) * lr;
        const z = cz + Math.sin(a) * lr;
        k.rod([x, 0, z], [x, H - 0.022, z], 0.0085, m, 0.0085, 10);
      }
      k.ring(lr, 0.006, m, cx, H - 0.03, cz, 32);
    };
    tbl(-0.16, -0.0, 0.36, 0.42, [Math.PI * 0.55, Math.PI * 1.2, Math.PI * 1.88]);
    tbl(0.26, 0.105, 0.26, 0.34, [Math.PI * 0.2, Math.PI * 0.85, Math.PI * 1.5]);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.circle(ctx, 0.26, 0.105, 0.26, tint(c.top, 0.45));
      D.circle(ctx, -0.16, 0, 0.36, tint(c.top, 0.35));
      D.circle(ctx, -0.16, 0, 0.345, null, INK_SOFT, LINE_THIN);
    }),
};

const glassBrassCoffee: FurnitureDef = {
  id: 'coffee-glass-brass',
  name: 'שולחן סלון זכוכית ופליז',
  category: 'living',
  group: G_COF,
  tags: ['זכוכית', 'פליז', 'זהב', 'מלבני', 'אלגנטי', 'מדף'],
  size: { w: 1.2, d: 0.62, h: 0.4 },
  colors: [slot('frame', 'מסגרת', '#c9a35a'), slot('glass', 'זכוכית', '#e2efe9')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const w = 1.2;
    const d = 0.62;
    const H = 0.4;
    const b = M.metal(c.frame, 0.26, 1);
    const s = 0.018;
    const yT = H - 0.01;
    const lx = w / 2 - s / 2 - 0.002;
    const lz = d / 2 - s / 2 - 0.002;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) k.box(s, yT, s, b, sx * lx, 0, sz * lz);
      for (const y of [yT - s, 0.1]) k.box(s, s, 2 * lz, b, sx * lx, y, 0);
    }
    for (const sz of [-1, 1]) for (const y of [yT - s, 0.1]) k.box(2 * lx, s, s, b, 0, y, sz * lz);
    const gl = M.glass(c.glass, 0.24);
    k.box(w - 0.004, 0.01, d - 0.004, gl, 0, yT, 0);
    k.box(w - 0.04, 0.008, d - 0.04, gl, 0, 0.1 + s, 0);
    bookStack(k, -0.28, 0.1 + s + 0.008, 0.02, 3, 14);
    k.sphere(0.06, M.ceramic('#efeae0'), 0.3, 0.1 + s + 0.008 + 0.06, 0, 1, 1, 1, 16);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 1.2, 0.62, 0, tint(c.glass, 0.4), tint(c.frame, 0), LINE_THIN * 2);
      D.rr(ctx, 0, 0, 1.17, 0.59, 0, null, INK_SOFT, LINE_THIN);
    }),
};

const trunkCoffee: FurnitureDef = {
  id: 'coffee-trunk',
  name: 'שולחן סלון תיבה',
  category: 'living',
  group: G_COF,
  tags: ['תיבה', 'ארגז', 'אחסון', 'עץ', 'וינטג\'', 'עור', 'כפרי'],
  size: { w: 1.0, d: 0.56, h: 0.45 },
  colors: [slot('wood', 'עץ', '#8b5e3c'), slot('metal', 'פרזול', '#2c2b2a'), slot('strap', 'רצועות', '#6b3f24')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const w = 1.0;
    const d = 0.56;
    const H = 0.45;
    const wood = M.wood(c.wood);
    const met = M.metal(c.metal, 0.55, 0.7);
    const lea = M.leather(c.strap);
    const bw = w - 0.07;
    const bd = d - 0.03;
    // plinth + body
    k.rbox(bw - 0.02, 0.05, bd - 0.02, 0.006, M.wood(darken(c.wood, 0.25)), 0, 0, 0, 1);
    const bodyH = 0.32;
    k.rbox(bw, bodyH, bd, 0.006, wood, 0, 0.05, 0, 1);
    // board seams
    const seam = M.matte(darken(c.wood, 0.55));
    for (const y of [0.15, 0.26]) {
      for (const s of [-1, 1]) {
        k.box(bw - 0.01, 0.004, 0.002, seam, 0, 0.05 + y - 0.05, s * (bd / 2 + 0.0005));
        k.box(0.002, 0.004, bd - 0.01, seam, s * (bw / 2 + 0.0005), 0.05 + y - 0.05, 0);
      }
    }
    // lid
    const lidY = 0.05 + bodyH + 0.004;
    k.rbox(w, H - lidY, d, 0.012, wood, 0, lidY, 0, 2);
    k.box(w - 0.004, 0.004, d - 0.004, seam, 0, lidY - 0.004, 0);
    // corner brackets (L angles) on the 8 corners
    const ca = 0.065;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        for (const [y0, hh] of [[0.05, ca], [H - ca, ca]] as Array<[number, number]>) {
          const lid = y0 > 0.2;
          const ox = lid ? w / 2 : bw / 2;
          const oz = lid ? d / 2 : bd / 2;
          k.box(ca, hh, 0.003, met, sx * (ox - ca / 2), y0, sz * (oz + 0.0015));
          k.box(0.003, hh, ca, met, sx * (ox + 0.0015), y0, sz * (oz - ca / 2));
        }
      }
    }
    // leather straps over lid and front / back
    for (const sx of [-1, 1]) {
      const x = sx * 0.28;
      k.box(0.05, 0.004, d + 0.002, lea, x, H - 0.001, 0);
      for (const sz of [-1, 1]) k.box(0.05, H - 0.07, 0.004, lea, x, 0.07, sz * (d / 2 - 0.001));
      k.box(0.034, 0.024, 0.006, met, x, 0.27, d / 2 + 0.001);
    }
    // hasp
    k.box(0.05, 0.07, 0.004, M.brass(), 0, lidY - 0.075, bd / 2 + 0.002);
    k.box(0.036, 0.05, 0.004, M.brass(), 0, lidY - 0.015, d / 2 + 0.001);
    k.box(0.016, 0.022, 0.012, M.brass(), 0, lidY - 0.06, bd / 2 + 0.006);
    // side handles
    for (const sx of [-1, 1]) {
      const x = sx * (bw / 2 + 0.003);
      k.box(0.006, 0.04, 0.16, met, x, 0.27, 0);
      k.tube(
        [
          [x + sx * 0.002, 0.3, -0.07],
          [x + sx * 0.022, 0.28, -0.04],
          [x + sx * 0.026, 0.275, 0],
          [x + sx * 0.022, 0.28, 0.04],
          [x + sx * 0.002, 0.3, 0.07],
        ],
        0.007,
        lea,
        { seg: 16, radial: 6 },
      );
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 1.0, 0.56, 0.012, tint(c.wood, 0.35));
      for (const s of [-1, 1]) D.rr(ctx, s * 0.28, 0, 0.05, 0.56, 0, tint(c.strap, 0.25), INK_SOFT, LINE_THIN);
    }),
};

const liftTopCoffee: FurnitureDef = {
  id: 'coffee-lift-top',
  name: 'שולחן סלון עם משטח מתרומם',
  category: 'living',
  group: G_COF,
  tags: ['משטח מתרומם', 'אחסון', 'מגירה', 'נישה', 'מודרני', 'לבן'],
  size: { w: 1.1, d: 0.6, h: 0.43 },
  colors: [slot('top', 'משטח', WOOD.oak), slot('body', 'גוף', '#f1efea'), slot('legs', 'רגליים', WOOD.oak)],
  build: ({ colors: c }) => {
    const k = new Kit();
    const w = 1.1;
    const d = 0.6;
    const H = 0.43;
    const body = M.paint(c.body, 0.4);
    const top = M.wood(c.top);
    const legH = 0.12;
    // legs
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) sqLeg(k, sx * (w / 2 - 0.04), sz * (d / 2 - 0.04), sx, sz, legH + 0.01, 0.045, 0.03, M.wood(c.legs));
    // carcass: closed drawer section on the left, open niche on the right
    const cH = H - legH - 0.03;
    const cw = w - 0.02;
    const cd = d - 0.02;
    const pt = 0.018;
    const dark = M.paint(darken(c.body, 0.12), 0.6);
    k.rbox(cw / 2, cH, cd, 0.004, body, -cw / 4, legH, 0, 1);
    k.box(cw / 2, pt, cd, body, cw / 4, legH, 0);
    k.box(pt, cH, cd, body, cw / 2 - pt / 2, legH, 0);
    k.box(cw / 2, cH, pt, body, cw / 4, legH, -cd / 2 + pt / 2);
    k.box(cw / 2 - pt, cH - pt, 0.002, dark, cw / 4 - pt / 2, legH + pt, -cd / 2 + pt + 0.001);
    k.box(cw / 2 - pt, 0.002, cd - pt, dark, cw / 4 - pt / 2, legH + pt, pt / 2);
    // top: fixed back strip + lifting panel with a seam
    const gap = 0.003;
    const backD = 0.16;
    k.rbox(w, 0.03, backD - gap, 0.006, top, 0, H - 0.03, -d / 2 + (backD - gap) / 2, 1);
    k.rbox(w, 0.03, d - backD - gap, 0.006, top, 0, H - 0.03, d / 2 - (d - backD - gap) / 2, 1);
    k.box(w - 0.02, 0.026, d - 0.024, M.matte('#2a2522'), 0, H - 0.032, 0);
    const fz = cd / 2;
    drawerFront(k, -cw / 4, legH + 0.012, fz - 0.018, cw / 2 - 0.03, cH - 0.024, body);
    k.rbox(0.18, 0.012, 0.01, 0.004, M.wood(c.top), -cw / 4, legH + cH - 0.06, fz + 0.002, 1);
    bookStack(k, 0.2, legH + pt, 0.02, 3, 4);
    fruitBowl(k, 0.4, legH + pt, 0.0, 0.07, M.ceramic('#3a3e44'), 1, false);
    // lift mechanism hint: two side pins
    for (const s of [-1, 1]) k.cyl(0.008, 0.004, M.steel(), s * (w / 2 - 0.01), H - 0.05, 0.05, 0.008, 8).rotation.z = Math.PI / 2;
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 1.1, 0.6, 0.006, tint(c.top, 0.35));
      D.line(ctx, -0.55, -0.14, 0.55, -0.14, INK_SOFT, LINE_THIN);
    }),
};

const travertineCoffee: FurnitureDef = {
  id: 'coffee-travertine',
  name: 'שולחן סלון טרוורטין על בסיס',
  category: 'living',
  group: G_COF,
  tags: ['טרוורטין', 'אבן', 'פלינת', 'וואבי סאבי', 'יוקרתי'],
  size: { w: 1.2, d: 0.65, h: 0.36 },
  colors: [slot('stone', 'אבן', '#d9c7aa')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const w = 1.2;
    const d = 0.65;
    const H = 0.36;
    const st = M.stone(c.stone, 0.62);
    const t = 0.05;
    profTop(k, (i) => roundedRectShape(w - 2 * i, d - 2 * i, d / 2 - i), t, H, st, 'soft', 12);
    // plinth base
    const bw = 0.72;
    const bd = 0.36;
    const bh = H - t;
    k.rbox(bw, bh + 0.002, bd, 0.006, st, 0, 0, 0, 1);
    // travertine pores / bedding lines
    const r = rng(5);
    const pore = M.stone(darken(c.stone, 0.18), 0.8);
    for (let i = 0; i < 9; i++) {
      const y = 0.02 + r() * (bh - 0.05);
      const len = 0.08 + r() * 0.3;
      const x = (r() - 0.5) * (bw - len - 0.04);
      k.box(len, 0.003 + r() * 0.004, 0.002, pore, x, y, (i % 2 ? 1 : -1) * (bd / 2 + 0.0002));
    }
    for (let i = 0; i < 7; i++) {
      const len = 0.12 + r() * 0.4;
      k.box(len, 0.0012, 0.003 + r() * 0.004, pore, (r() - 0.5) * (w - len - 0.3), H + 0.0001, (r() - 0.5) * (d - 0.2));
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 1.2, 0.65, 0.325, tint(c.stone, 0.3));
      dashed(ctx, () => D.rr(ctx, 0, 0, 0.72, 0.36, 0, null, INK_SOFT, LINE_THIN));
    }),
};

const riverCoffee: FurnitureDef = {
  id: 'coffee-river',
  name: 'שולחן סלון "נהר" עץ ואפוקסי',
  category: 'living',
  group: G_COF,
  tags: ['אפוקסי', 'נהר', 'לייב אדג\'', 'עץ מלא', 'שרף', 'מתכת'],
  size: { w: 1.2, d: 0.65, h: 0.42 },
  colors: [slot('wood', 'עץ', '#6e4a33'), slot('resin', 'שרף', '#2f7f95'), slot('legs', 'רגליים', '#202124')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const w = 1.2;
    const d = 0.65;
    const H = 0.42;
    const t = 0.045;
    riverTop(k, w, d, t, H, M.wood(c.wood), M.lacquer(c.resin), 2.3);
    const m = M.metal(c.legs, 0.45, 0.75);
    const s = 0.04;
    for (const sx of [-1, 1]) {
      const x = sx * (w / 2 - 0.12);
      for (const sz of [-1, 1]) k.rbox(s, H - t, s * 0.8, 0.003, m, x, 0, sz * (d / 2 - 0.07), 1);
      k.rbox(s, s * 0.6, d - 0.1, 0.003, m, x, 0, 0, 1);
      k.rbox(s, s * 0.6, d - 0.1, 0.003, m, x, H - t - s * 0.6, 0, 1);
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 1.2, 0.65, 0, tint(c.wood, 0.35));
      ctx.beginPath();
      const n = 24;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const x = -0.6 + 1.2 * t;
        ctx.lineTo(x, Math.sin(t * 5.2 + 2.3) * 0.05 - 0.04);
      }
      for (let i = n; i >= 0; i--) {
        const t = i / n;
        const x = -0.6 + 1.2 * t;
        ctx.lineTo(x, Math.sin(t * 5.2 + 2.3) * 0.05 + 0.05);
      }
      ctx.closePath();
      ctx.fillStyle = tint(c.resin, 0.35);
      ctx.fill();
      ctx.strokeStyle = INK_SOFT;
      ctx.lineWidth = LINE_THIN;
      ctx.stroke();
    }),
};

const concreteCoffee: FurnitureDef = {
  id: 'coffee-concrete',
  name: 'שולחן סלון בטון "מפל"',
  category: 'living',
  group: G_COF,
  tags: ['בטון', 'מפל', 'מינימליסטי', 'תעשייתי', 'מדף עץ'],
  size: { w: 1.1, d: 0.6, h: 0.38 },
  colors: [slot('concrete', 'בטון', '#b2b0aa'), slot('shelf', 'מדף', WOOD.oak)],
  build: ({ colors: c }) => {
    const k = new Kit();
    const w = 1.1;
    const d = 0.6;
    const H = 0.38;
    const t = 0.05;
    const con = M.stone(c.concrete, 0.8);
    k.rbox(w, t, d, 0.006, con, 0, H - t, 0, 1);
    for (const s of [-1, 1]) k.rbox(t, H - t + 0.002, d, 0.006, con, s * (w / 2 - t / 2), 0, 0, 1);
    k.rbox(w - 2 * t + 0.004, 0.025, d - 0.08, 0.004, M.wood(c.shelf), 0, 0.09, 0, 1);
    const r = rng(41);
    const pore = M.matte(darken(c.concrete, 0.35));
    for (let i = 0; i < 18; i++) k.cyl(0.002 + r() * 0.002, 0.0006, pore, (r() - 0.5) * (w - 0.06), H, (r() - 0.5) * (d - 0.06), 0.002, 6);
    bookStack(k, 0.1, 0.115, 0.0, 3, 19);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 1.1, 0.6, 0.006, tint(c.concrete, 0.35));
      for (const s of [-1, 1]) D.line(ctx, s * 0.5, -0.3, s * 0.5, 0.3, INK_SOFT, LINE_THIN);
    }),
};

const rattanCoffee: FurnitureDef = {
  id: 'coffee-rattan',
  name: 'שולחן סלון אלון וקש וינאי',
  category: 'living',
  group: G_COF,
  tags: ['קש וינאי', 'ראטן', 'אלון', 'בוהו', 'מדף'],
  size: { w: 1.0, d: 0.55, h: 0.42 },
  colors: [slot('wood', 'עץ', WOOD.oak), slot('cane', 'קש', '#d8bb8c')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const w = 1.0;
    const d = 0.55;
    const H = 0.42;
    const wood = M.wood(c.wood);
    const cane = M.rattan(c.cane);
    rectTop(k, w, d, 0.025, H, wood, 0.02, 'soft');
    const s = 0.04;
    const lx = w / 2 - 0.02 - s / 2;
    const lz = d / 2 - 0.02 - s / 2;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.rbox(s, H - 0.025, s, 0.004, wood, sx * lx, 0, sz * lz, 1);
    // rails
    const yR = [0.1, H - 0.025 - 0.04];
    for (const y of yR) {
      for (const sz of [-1, 1]) k.box(2 * lx - s, 0.035, 0.022, wood, 0, y, sz * lz);
      for (const sx of [-1, 1]) k.box(0.022, 0.035, 2 * lz - s, wood, sx * lx, y, 0);
    }
    // cane shelf + cane end panels
    k.box(2 * lx - s, 0.006, 2 * lz - s, cane, 0, 0.13, 0);
    for (const sx of [-1, 1]) k.box(0.006, yR[1] - yR[0] - 0.035, 2 * lz - s, cane, sx * lx, yR[0] + 0.035, 0);
    k.box(2 * lx - s, 0.012, 0.02, wood, 0, 0.123, 0);
    bookStack(k, -0.15, 0.136, 0, 2, 41);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 1.0, 0.55, 0.02, tint(c.wood, 0.35));
      D.rr(ctx, 0, 0, 0.94, 0.49, 0.01, null, INK_SOFT, LINE_THIN);
    }),
};

const trayCoffee: FurnitureDef = {
  id: 'coffee-tray-x',
  name: 'שולחן מגש על רגלי איקס',
  category: 'living',
  group: G_COF,
  tags: ['מגש', 'רגלי איקס', 'קלאסי', 'לכה', 'נשלף'],
  size: { w: 0.92, d: 0.6, h: 0.42 },
  colors: [slot('tray', 'מגש', '#1f2a2c'), slot('stand', 'מעמד', WOOD.walnut)],
  build: ({ colors: c }) => {
    const k = new Kit();
    const w = 0.92;
    const d = 0.6;
    const H = 0.42;
    const tray = M.lacquer(c.tray);
    const wood = M.wood(c.stand);
    const yb = H - 0.06;
    // tray: base + walls with handle slots
    k.rbox(w - 0.01, 0.012, d - 0.01, 0.004, tray, 0, yb, 0, 1);
    const wt = 0.012;
    for (const s of [-1, 1]) {
      k.rbox(w, H - yb, wt, 0.004, tray, 0, yb, s * (d / 2 - wt / 2), 1);
      k.rbox(wt, H - yb, d - 2 * wt, 0.004, tray, s * (w / 2 - wt / 2), yb, 0, 1);
      k.rbox(0.004, 0.018, 0.1, 0.002, M.matte('#0d0d0d'), s * (w / 2 + 0.0008), H - 0.036, 0, 1);
      k.rbox(0.004, 0.018, 0.1, 0.002, M.matte('#0d0d0d'), s * (w / 2 - wt - 0.0008), H - 0.036, 0, 1);
    }
    // folding X stand
    const xs = w / 2 - 0.12;
    const zz = d / 2 - 0.06;
    for (const sx of [-1, 1]) {
      const x = sx * xs;
      k.beam([x, 0.014, -zz], [x, yb - 0.012, zz], 0.026, 0.03, wood, 0.004);
      k.beam([x + sx * 0.03, 0.014, zz], [x + sx * 0.03, yb - 0.012, -zz], 0.026, 0.03, wood, 0.004);
      k.rod([x - sx * 0.02, yb / 2, 0], [x + sx * 0.05, yb / 2, 0], 0.008, M.brass(), 0.008, 10);
    }
    for (const sz of [-1, 1]) {
      k.rod([-xs, yb - 0.015, sz * (zz - 0.01)], [xs + 0.03, yb - 0.015, sz * (zz - 0.01)], 0.012, wood, 0.012, 10);
      k.rod([-xs, 0.04, sz * (zz - 0.01)], [xs + 0.03, 0.04, sz * (zz - 0.01)], 0.01, wood, 0.01, 10);
    }
    fruitBowl(k, 0.2, yb + 0.012, 0.02, 0.075, M.brass(), 1, false);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 0.92, 0.6, 0.004, tint(c.tray, 0.6));
      D.rr(ctx, 0, 0, 0.896, 0.576, 0.004, null, INK_SOFT, LINE_THIN);
    }),
};

const ovalScandiCoffee: FurnitureDef = {
  id: 'coffee-oval-scandi',
  name: 'שולחן סלון אובלי סקנדינבי',
  category: 'living',
  group: G_COF,
  tags: ['אובלי', 'סקנדינבי', 'נורדי', 'רגליים משופעות', 'מדף'],
  size: { w: 1.2, d: 0.66, h: 0.42 },
  colors: [slot('top', 'משטח', '#f2efe8'), slot('legs', 'רגליים', WOOD.whiteOak)],
  build: ({ colors: c }) => {
    const k = new Kit();
    const H = 0.42;
    roundTop(k, 0.6, 0.33, 0.022, H, M.paint(c.top, 0.4), 'bull', 28);
    const wood = M.wood(c.legs);
    // under-frame rails
    const ax = 0.36;
    const az = 0.16;
    for (const s of [-1, 1]) k.rbox(2 * ax, 0.05, 0.02, 0.005, wood, 0, H - 0.022 - 0.05, s * az, 1);
    for (const s of [-1, 1]) k.rbox(0.02, 0.05, 2 * az, 0.005, wood, s * ax, H - 0.022 - 0.05, 0, 1);
    // lower oval shelf (cane)
    roundTop(k, 0.44, 0.2, 0.016, 0.13, M.wood(c.legs), 'soft', 22);
    legs4(k, 2 * ax + 0.03, 2 * az + 0.03, H - 0.022, wood, { rTop: 0.02, rBot: 0.013, inset: 0.02, splay: 0.05 });
    bookStack(k, -0.05, 0.13, 0.0, 2, 51);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.ellipse(ctx, 0, 0, 0.6, 0.33, tint(c.top, 0.1));
      dashed(ctx, () => D.ellipse(ctx, 0, 0, 0.44, 0.2, null, INK_SOFT, LINE_THIN));
    }),
};

const twoTierCoffee: FurnitureDef = {
  id: 'coffee-two-tier',
  name: 'שולחן סלון דו-קומתי',
  category: 'living',
  group: G_COF,
  tags: ['שתי קומות', 'זכוכית מעושנת', 'אגוז', 'מתכת', 'רטרו', 'מדף'],
  size: { w: 1.1, d: 0.6, h: 0.42 },
  colors: [slot('frame', 'מסגרת', '#26272a'), slot('glass', 'זכוכית', '#4b4a48'), slot('shelf', 'מדף', WOOD.walnut)],
  build: ({ colors: c }) => {
    const k = new Kit();
    const w = 1.1;
    const d = 0.6;
    const H = 0.42;
    const m = M.metal(c.frame, 0.4, 0.8);
    const r = 0.012;
    const yTop = H - 0.012;
    const lz = d / 2 - 0.035;
    const rr = 0.06;
    // rounded rectangular end loops (tube)
    for (const sx of [-1, 1]) {
      const x = sx * (w / 2 - 0.03);
      const pts: V3[] = [];
      const corners: Array<[number, number, number]> = [
        [lz - rr, yTop - r - rr, 0],
        [-(lz - rr), yTop - r - rr, Math.PI / 2],
        [-(lz - rr), r + rr, Math.PI],
        [lz - rr, r + rr, Math.PI * 1.5],
      ];
      for (const [cz, cy, a0] of corners) for (let i = 0; i <= 4; i++) {
        const a = a0 + (i / 4) * (Math.PI / 2);
        pts.push([x, cy + Math.sin(a) * rr, cz + Math.cos(a) * rr]);
      }
      k.tube(pts, r, m, { closed: true, seg: 64, radial: 8 });
    }
    for (const sz of [-1, 1]) {
      k.rod([-(w / 2 - 0.03), yTop - r, sz * lz], [w / 2 - 0.03, yTop - r, sz * lz], r, m, r, 8);
      k.rod([-(w / 2 - 0.03), 0.14, sz * lz], [w / 2 - 0.03, 0.14, sz * lz], r * 0.8, m, r * 0.8, 8);
    }
    k.rbox(w - 0.004, 0.012, d - 0.004, 0.004, M.glass(c.glass, 0.6), 0, yTop, 0, 1);
    k.rbox(w - 0.09, 0.022, 2 * lz + 0.02, 0.004, M.wood(c.shelf), 0, 0.14 + r * 0.8, 0, 1);
    bookStack(k, 0.2, 0.14 + r * 0.8 + 0.022, 0, 3, 61);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 1.1, 0.6, 0.004, tint(c.glass, 0.5));
      D.rr(ctx, 0, 0, 1.01, 0.55, 0.004, tint(c.shelf, 0.4), INK_SOFT, LINE_THIN);
      for (const s of [-1, 1]) D.line(ctx, s * 0.52, -0.27, s * 0.52, 0.27, INK_SOFT, LINE_THIN);
    }),
};

const plinthDrumCoffee: FurnitureDef = {
  id: 'coffee-drum-oak',
  name: 'שולחן סלון תוף עץ',
  category: 'living',
  group: G_COF,
  tags: ['תוף', 'עגול', 'עץ', 'פלינת', 'מינימליסטי', 'ריהוט כבד'],
  size: { w: 0.85, d: 0.85, h: 0.38 },
  colors: [slot('wood', 'עץ', WOOD.oak), slot('plinth', 'בסיס', '#2b2826')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const H = 0.38;
    const wood = M.wood(c.wood);
    roundTop(k, 0.425, 0.425, 0.04, H, wood, 'bull', 28);
    // staved drum body (vertical boards)
    const n = 22;
    const R = 0.34;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const bw = ((2 * Math.PI * R) / n) * 0.98;
      const m = k.rbox(bw, H - 0.04 - 0.04, 0.03, 0.003, i % 3 === 0 ? M.wood(darken(c.wood, 0.06)) : wood, Math.cos(a) * R, 0.04, Math.sin(a) * R, 1);
      m.rotation.y = -a + Math.PI / 2;
    }
    k.cyl(R - 0.01, H - 0.08, M.matte('#2a2522'), 0, 0.04, 0, R - 0.01, 20);
    k.cyl(R - 0.02, 0.04, M.matte(c.plinth), 0, 0, 0, R - 0.02, 24);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.circle(ctx, 0, 0, 0.425, tint(c.wood, 0.35));
      D.circle(ctx, 0, 0, 0.405, null, INK_SOFT, LINE_THIN);
    }),
};

/* ================================================================================ SIDE */

const cTable: FurnitureDef = {
  id: 'side-c-table',
  name: 'שולחן צד C',
  category: 'living',
  group: G_SIDE,
  tags: ['שולחן C', 'נכנס מתחת לספה', 'מתכת', 'מחשב נייד', 'קטן'],
  size: { w: 0.48, d: 0.42, h: 0.6 },
  colors: [slot('top', 'משטח', WOOD.walnut), slot('frame', 'מסגרת', '#2a2b2e')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const H = 0.6;
    const m = M.metal(c.frame, 0.4, 0.8);
    const cx = 0.04;
    roundTop(k, 0.2, 0.2, 0.022, H, M.wood(c.top), 'soft', 22, cx, 0);
    const px = -0.222;
    const r = 0.012;
    k.tube(
      [
        [cx, H - 0.022 - r, 0],
        [px + 0.04, H - 0.022 - r, 0],
        [px + 0.006, H - 0.03 - r, 0],
        [px, H - 0.07, 0],
        [px, 0.07, 0],
        [px + 0.006, 0.02 + r, 0],
        [px + 0.04, r, 0],
        [cx, r, 0],
      ],
      r,
      m,
      { seg: 60, radial: 8 },
    );
    k.disc(0.17, 0.012, m, cx, 0, 0, 28);
    k.disc(0.08, 0.006, m, cx, H - 0.028, 0, 16);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.circle(ctx, 0.04, 0, 0.2, tint(c.top, 0.35));
      D.line(ctx, -0.22, 0, 0.04, 0, INK_SOFT, LINE_THIN);
      D.circle(ctx, -0.222, 0, 0.012, '#555', INK_SOFT, LINE_THIN);
    }),
};

const pedestalSide: FurnitureDef = {
  id: 'side-pedestal-tripod',
  name: 'שולחן צד רגל מחורטת',
  category: 'living',
  group: G_SIDE,
  tags: ['קלאסי', 'מחורט', 'שולחן יין', 'רגל מרכזית', 'עץ'],
  size: { w: 0.5, d: 0.5, h: 0.56 },
  colors: [slot('wood', 'עץ', WOOD.cherry)],
  build: ({ colors: c }) => {
    const k = new Kit();
    const H = 0.56;
    const wood = M.wood(c.wood);
    roundTop(k, 0.25, 0.25, 0.022, H, wood, 'step', 24);
    k.lathe(
      [
        [0, 0.1],
        [0.04, 0.1],
        [0.045, 0.12],
        [0.035, 0.14],
        [0.03, 0.2],
        [0.042, 0.26],
        [0.032, 0.3],
        [0.025, 0.42],
        [0.034, 0.46],
        [0.026, 0.49],
        [0.035, 0.51],
        [0.06, H - 0.03],
        [0.06, H - 0.022],
        [0, H - 0.022],
      ],
      wood,
      0,
      0,
      0,
      16,
    );
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
      const P = (rr: number, y: number): V3 => [Math.cos(a) * rr, y, Math.sin(a) * rr];
      k.tube([P(0.02, 0.15), P(0.06, 0.1), P(0.13, 0.05), P(0.2, 0.02), P(0.225, 0.016)], 0.016, wood, { seg: 18, radial: 8 });
      k.sphere(0.017, wood, Math.cos(a) * 0.225, 0.016, Math.sin(a) * 0.225, 1, 1, 1, 10);
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.circle(ctx, 0, 0, 0.25, tint(c.wood, 0.35));
      D.circle(ctx, 0, 0, 0.235, null, INK_SOFT, LINE_THIN);
    }),
};

const reededDrum: FurnitureDef = {
  id: 'side-reeded-drum',
  name: 'שולחן צד תוף מחורץ',
  category: 'living',
  group: G_SIDE,
  tags: ['תוף', 'מחורץ', 'פלוטים', 'עגול', 'עץ', 'ארט דקו'],
  size: { w: 0.44, d: 0.44, h: 0.5 },
  colors: [slot('wood', 'עץ', WOOD.oak), slot('top', 'משטח', '#efeae2')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const H = 0.5;
    const wood = M.wood(c.wood);
    disc(k, 0.22, 0.03, M.marble(c.top), H - 0.03, 0.005, 0, 0, 28);
    k.cyl(0.182, H - 0.05, wood, 0, 0.02, 0, 0.182, 24);
    const n = 30;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      k.cyl(0.0195, H - 0.06, wood, Math.cos(a) * 0.19, 0.025, Math.sin(a) * 0.19, 0.0195, 8);
    }
    k.cyl(0.2, 0.025, M.wood(darken(c.wood, 0.4)), 0, 0, 0, 0.2, 28);
    k.cyl(0.2, 0.012, M.wood(darken(c.wood, 0.4)), 0, H - 0.04, 0, 0.2, 28);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.circle(ctx, 0, 0, 0.22, tint(c.top, 0.1));
      D.circle(ctx, 0, 0, 0.2, null, INK_SOFT, LINE_THIN);
    }),
};

const mushroomSide: FurnitureDef = {
  id: 'side-mushroom',
  name: 'שולחן צד פטרייה',
  category: 'living',
  group: G_SIDE,
  tags: ['פטרייה', 'אבן', 'טרוורטין', 'פיסולי', 'עגול'],
  size: { w: 0.44, d: 0.44, h: 0.5 },
  colors: [slot('stone', 'אבן', '#d8c6a6')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const st = M.stone(c.stone, 0.55);
    const prof = smoothProfile(
      [
        [0.17, 0.0],
        [0.15, 0.03],
        [0.08, 0.08],
        [0.06, 0.16],
        [0.058, 0.3],
        [0.075, 0.38],
        [0.16, 0.44],
        [0.215, 0.475],
      ],
      22,
    );
    k.lathe([[0, 0], [0.165, 0], ...prof, [0.22, 0.485], [0.215, 0.495], [0.205, 0.496], [0, 0.496]], st, 0, 0, 0, 36);
    disc(k, 0.208, 0.006, st, 0.494, 0.002, 0, 0, 30);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.circle(ctx, 0, 0, 0.22, tint(c.stone, 0.3));
      D.circle(ctx, 0, 0, 0.2, null, INK_SOFT, LINE_THIN);
    }),
};

const tripodSide: FurnitureDef = {
  id: 'side-tripod-tray',
  name: 'שולחן צד חצובה עם שפה',
  category: 'living',
  group: G_SIDE,
  tags: ['חצובה', 'שלוש רגליים', 'מגש', 'עץ', 'סקנדינבי'],
  size: { w: 0.46, d: 0.46, h: 0.55 },
  colors: [slot('wood', 'עץ', WOOD.ash)],
  build: ({ colors: c }) => {
    const k = new Kit();
    const H = 0.55;
    const wood = M.wood(c.wood);
    const R = 0.22;
    disc(k, R, 0.018, wood, H - 0.03, 0.003, 0, 0, 26);
    // raised rim
    k.lathe(
      [
        [R - 0.012, H - 0.03],
        [R, H - 0.03],
        [R + 0.004, H - 0.015],
        [R, H],
        [R - 0.006, H],
        [R - 0.012, H - 0.006],
        [R - 0.012, H - 0.012],
      ],
      wood,
      0,
      0,
      0,
      32,
    );
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
      const top: V3 = [Math.cos(a) * 0.1, H - 0.03, Math.sin(a) * 0.1];
      const bot: V3 = [Math.cos(a) * 0.205, 0.004, Math.sin(a) * 0.205];
      k.rod(bot, top, 0.012, wood, 0.019, 12);
    }
    k.ring(0.145, 0.007, wood, 0, 0.2, 0, 28);
    k.cyl(0.06, 0.012, wood, 0, H - 0.042, 0, 0.06, 18);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.circle(ctx, 0, 0, 0.222, tint(c.wood, 0.3));
      D.circle(ctx, 0, 0, 0.206, null, INK_SOFT, LINE_THIN);
    }),
};

const stackedMarble: FurnitureDef = {
  id: 'side-stacked-marble',
  name: 'שולחן צד שיש מוערם',
  category: 'living',
  group: G_SIDE,
  tags: ['שיש', 'מוערם', 'צילינדרים', 'פיסולי', 'יוקרתי', 'ירוק'],
  size: { w: 0.44, d: 0.44, h: 0.5 },
  colors: [slot('base', 'בסיס', '#3f5a4c'), slot('mid', 'עמוד', '#f0ede6'), slot('top', 'משטח', '#c9b6a1')],
  build: ({ colors: c }) => {
    const k = new Kit();
    disc(k, 0.17, 0.17, M.marble(c.base), 0, 0.008, 0, 0, 26);
    disc(k, 0.095, 0.27, M.marble(c.mid), 0.17, 0.006, 0, 0, 22);
    disc(k, 0.22, 0.06, M.marble(c.top), 0.44, 0.008, 0, 0, 28);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.circle(ctx, 0, 0, 0.22, tint(c.top, 0.3));
      dashed(ctx, () => D.circle(ctx, 0, 0, 0.17, null, INK_SOFT, LINE_THIN));
    }),
};

const traySide: FurnitureDef = {
  id: 'side-tray-table',
  name: 'שולחן צד מגש מתכת',
  category: 'living',
  group: G_SIDE,
  tags: ['מגש', 'פליז', 'מתכת', 'נשלף', 'מרוקאי', 'קטן'],
  size: { w: 0.46, d: 0.46, h: 0.54 },
  colors: [slot('tray', 'מגש', '#c9a35a'), slot('stand', 'מעמד', '#1f1f21')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const H = 0.54;
    const tray = M.metal(c.tray, 0.25, 1);
    const m = M.metal(c.stand, 0.45, 0.8);
    const R = 0.225;
    const y0 = H - 0.045;
    k.lathe(
      [
        [0, y0],
        [R - 0.02, y0],
        [R - 0.008, y0 + 0.004],
        [R - 0.002, y0 + 0.03],
        [R + 0.003, H - 0.003],
        [R, H],
        [R - 0.006, H - 0.002],
        [R - 0.012, y0 + 0.03],
        [R - 0.024, y0 + 0.008],
        [0, y0 + 0.008],
      ],
      tray,
      0,
      0,
      0,
      40,
    );
    // engraved rings on the tray
    for (const rr of [0.08, 0.15]) k.ring(rr, 0.0018, M.metal(darken(c.tray, 0.3), 0.5, 1), 0, y0 + 0.0085, 0, 36);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
      k.rod([Math.cos(a) * 0.2, 0.004, Math.sin(a) * 0.2], [Math.cos(a) * 0.15, y0, Math.sin(a) * 0.15], 0.008, m, 0.008, 8);
      k.cyl(0.011, 0.005, m, Math.cos(a) * 0.2, 0, Math.sin(a) * 0.2, 0.01, 8);
    }
    k.ring(0.15, 0.007, m, 0, y0 - 0.006, 0, 30);
    k.ring(0.175, 0.005, m, 0, 0.18, 0, 30);
    // tea glass
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.circle(ctx, 0, 0, 0.225, tint(c.tray, 0.3));
      D.circle(ctx, 0, 0, 0.2, null, INK_SOFT, LINE_THIN);
      D.circle(ctx, 0, 0, 0.15, null, INK_SOFT, LINE_THIN);
    }),
};

const rattanSide: FurnitureDef = {
  id: 'side-rattan-drum',
  name: 'שולחן צד ראטן קלוע',
  category: 'living',
  group: G_SIDE,
  tags: ['ראטן', 'קלוע', 'נצרים', 'בוהו', 'זכוכית', 'חוף'],
  size: { w: 0.46, d: 0.46, h: 0.52 },
  colors: [slot('weave', 'קליעה', '#c29a64')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const H = 0.52;
    const wk = M.wicker(c.weave);
    const prof = smoothProfile(
      [
        [0.19, 0.0],
        [0.205, 0.08],
        [0.2, 0.3],
        [0.215, H - 0.04],
      ],
      14,
    );
    k.lathe([[0, 0], ...prof, [0, H - 0.04]], wk, 0, 0, 0, 30);
    const rim = M.wood(darken(c.weave, 0.15));
    k.ring(0.21, 0.016, rim, 0, H - 0.026, 0, 32);
    k.ring(0.19, 0.012, rim, 0, 0.012, 0, 32);
    k.ring(0.204, 0.006, rim, 0, 0.27, 0, 32);
    k.cyl(0.21, 0.01, M.glass('#dcefe8', 0.28), 0, H - 0.01, 0, 0.21, 32);
    disc(k, 0.205, 0.006, M.wood(lighten(c.weave, 0.1)), H - 0.016, 0.002, 0, 0, 28);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.circle(ctx, 0, 0, 0.226, tint(c.weave, 0.3));
      D.circle(ctx, 0, 0, 0.2, null, INK_SOFT, LINE_THIN);
    }),
};

const hourglassSide: FurnitureDef = {
  id: 'side-hourglass-ceramic',
  name: 'שולחן צד קרמיקה שעון חול',
  category: 'living',
  group: G_SIDE,
  tags: ['קרמיקה', 'שעון חול', 'מזוגג', 'פיסולי', 'צבעוני'],
  size: { w: 0.38, d: 0.38, h: 0.48 },
  colors: [slot('glaze', 'זיגוג', '#5f8a83')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const H = 0.48;
    const prof = smoothProfile(
      [
        [0.175, 0.012],
        [0.15, 0.08],
        [0.09, 0.2],
        [0.085, 0.26],
        [0.13, 0.36],
        [0.183, H - 0.016],
      ],
      22,
    );
    k.lathe([[0, 0], [0.165, 0], [0.175, 0.004], ...prof, [0.188, H - 0.008], [0.18, H], [0, H]], M.ceramic(c.glaze), 0, 0, 0, 36);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.circle(ctx, 0, 0, 0.188, tint(c.glaze, 0.3));
      D.circle(ctx, 0, 0, 0.17, null, INK_SOFT, LINE_THIN);
    }),
};

/* ================================================================================ CONSOLES */

const slimConsole: FurnitureDef = {
  id: 'console-slim-drawers',
  name: 'קונסולה צרה עם מגירות',
  category: 'living',
  group: G_CON,
  tags: ['קונסולה', 'כניסה', 'מבואה', 'מגירות', 'עץ', 'צרה'],
  size: { w: 1.2, d: 0.36, h: 0.8 },
  colors: [slot('wood', 'עץ', WOOD.whiteOak), slot('knobs', 'ידיות', '#c9a35a')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const w = 1.2;
    const d = 0.36;
    const H = 0.8;
    const t = 0.025;
    const wood = M.wood(c.wood);
    rectTop(k, w, d, t, H, wood, 0.006, 'soft');
    const apH = 0.12;
    legFrame(k, { w: w - 0.02, d: d - 0.02, h: H - t, legW: 0.042, legWb: 0.026, inset: 0.0, apronH: apH, apronSet: 0.005, leg: wood, noFront: true });
    // drawers
    const lx = (w - 0.02) / 2 - 0.042;
    const fz = (d - 0.02) / 2 - 0.033;
    const dw = lx - 0.01;
    for (const s of [-1, 1]) {
      drawerFront(k, s * (lx / 2 + 0.002), H - t - apH + 0.008, fz, dw - 0.008, apH - 0.016, wood);
      knob(k, s * (lx / 2 + 0.002), H - t - apH / 2, fz + 0.018, M.metal(c.knobs, 0.3, 1), 0.012);
    }
    k.box(w - 0.06, apH, d - 0.06, M.matte('#2a2420'), 0, H - t - apH, -0.01);
    // lower shelf
    k.rbox(w - 0.08, 0.018, d - 0.06, 0.004, wood, 0, 0.12, 0, 1);
    fruitBowl(k, 0.3, 0.138, 0, 0.12, M.wicker('#b48a5a'), 1, false);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 1.2, 0.36, 0.006, tint(c.wood, 0.35));
      D.line(ctx, 0, -0.17, 0, 0.17, INK_SOFT, LINE_THIN);
    }),
};

const marbleConsole: FurnitureDef = {
  id: 'console-marble-brass',
  name: 'קונסולה שיש ופליז',
  category: 'living',
  group: G_CON,
  tags: ['קונסולה', 'שיש', 'פליז', 'זהב', 'כניסה', 'יוקרתי'],
  size: { w: 1.3, d: 0.38, h: 0.82 },
  colors: [slot('top', 'שיש', '#2d2c2b'), slot('frame', 'מסגרת', '#c9a35a')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const w = 1.3;
    const d = 0.38;
    const H = 0.82;
    const marble = M.marble(c.top);
    const b = M.metal(c.frame, 0.26, 1);
    rectTop(k, w, d, 0.025, H, marble, 0.004, 'step');
    const s = 0.02;
    const lx = w / 2 - 0.03;
    const lz = d / 2 - 0.03;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) k.box(s, H - 0.025, s, b, sx * lx, 0, sz * lz);
      for (const y of [H - 0.025 - s, 0.16]) k.box(s, s, 2 * lz, b, sx * lx, y, 0);
    }
    for (const sz of [-1, 1]) for (const y of [H - 0.025 - s, 0.16]) k.box(2 * lx, s, s, b, 0, y, sz * lz);
    k.box(2 * lx - 0.01, 0.018, 2 * lz - 0.01, marble, 0, 0.16 + s, 0);
    bookStack(k, 0.15, 0.16 + s + 0.018, 0, 4, 91);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 1.3, 0.38, 0.004, tint(c.top, 0.55));
      D.rr(ctx, 0, 0, 1.27, 0.35, 0.002, null, INK_SOFT, LINE_THIN);
    }),
};

const rusticConsole: FurnitureDef = {
  id: 'console-rustic',
  name: 'קונסולה כפרית עם סלסלות',
  category: 'living',
  group: G_CON,
  tags: ['קונסולה', 'כפרי', 'עץ ממוחזר', 'סלסלות', 'איקס', 'כניסה'],
  size: { w: 1.5, d: 0.42, h: 0.8 },
  colors: [slot('wood', 'עץ', WOOD.reclaimed), slot('basket', 'סלסלות', '#c4a272')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const w = 1.5;
    const d = 0.42;
    const H = 0.8;
    const t = 0.05;
    plankTop(k, w, d, t, H, 2, c.wood, 0.005);
    const wood = M.wood(darken(c.wood, 0.05));
    const s = 0.065;
    const lx = w / 2 - 0.04 - s / 2;
    const lz = d / 2 - 0.03 - s / 2;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) k.rbox(s, H - t, s, 0.006, wood, sx * lx, 0, sz * lz, 1);
      // X brace on each end
      const x = sx * lx;
      const y0 = 0.2;
      const y1 = H - t - 0.08;
      k.beam([x, y0, -lz + s / 2], [x, y1, lz - s / 2], 0.03, 0.05, wood, 0.004);
      k.beam([x, y0, lz - s / 2], [x, y1, -lz + s / 2], 0.03, 0.05, wood, 0.004);
      for (const y of [0.16, H - t - 0.08]) k.rbox(0.035, 0.045, 2 * lz - s, 0.004, wood, x, y, 0, 1);
    }
    for (const sz of [-1, 1]) k.rbox(2 * lx - s, 0.07, 0.035, 0.004, wood, 0, H - t - 0.075, sz * lz, 1);
    // slatted lower shelf
    for (let i = 0; i < 5; i++) {
      const z = -lz + 0.03 + i * ((2 * lz - 0.06) / 4);
      k.rbox(2 * lx - s + 0.02, 0.02, 0.05, 0.004, wood, 0, 0.205, z, 1);
    }
    k.box(2 * lx - s, 0.035, 0.03, wood, 0, 0.17, -lz + 0.03);
    k.box(2 * lx - s, 0.035, 0.03, wood, 0, 0.17, lz - 0.03);
    // two baskets
    const bm = M.wicker(c.basket);
    for (const sx of [-1, 1]) {
      const bx = sx * 0.3;
      k.rbox(0.42, 0.25, 0.3, 0.03, bm, bx, 0.225, 0, 2);
      k.box(0.39, 0.004, 0.27, M.matte('#3b2e22'), bx, 0.225 + 0.246, 0);
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 1.5, 0.42, 0.006, tint(c.wood, 0.35));
      D.line(ctx, -0.75, 0, 0.75, 0, INK_SOFT, LINE_THIN);
    }),
};

const demiluneConsole: FurnitureDef = {
  id: 'console-demilune',
  name: 'קונסולה חצי ירח',
  category: 'living',
  group: G_CON,
  tags: ['קונסולה', 'חצי עיגול', 'חצי ירח', 'קלאסי', 'כניסה', 'צבוע'],
  size: { w: 1.0, d: 0.45, h: 0.78 },
  colors: [slot('top', 'משטח', WOOD.walnut), slot('body', 'גוף', '#7f8f84')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const w = 1.0;
    const d = 0.45;
    const H = 0.78;
    const t = 0.026;
    const n = 36;
    const half = (rx: number, rz: number): THREE.Shape => {
      const pts: Array<[number, number]> = [];
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI;
        pts.push([Math.cos(a) * rx, -d / 2 + Math.sin(a) * rz]);
      }
      return polyShape(pts);
    };
    profTop(k, (i) => half(w / 2 - i, d - i), t, H, M.wood(c.top), 'step', 4);
    // curved apron ring
    const paint = M.paint(c.body, 0.5);
    const apH = 0.1;
    const outer: Array<[number, number]> = [];
    const inner: Array<[number, number]> = [];
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI;
      outer.push([Math.cos(a) * (w / 2 - 0.035), -d / 2 + Math.sin(a) * (d - 0.035)]);
      inner.push([Math.cos(a) * (w / 2 - 0.055), -d / 2 + Math.sin(a) * (d - 0.055)]);
    }
    k.slab(polyShape([...outer, ...inner.reverse()]), apH, paint, 0, H - t - apH, 0, 0, 4);
    k.box(w - 0.08, apH, 0.02, paint, 0, H - t - apH, -d / 2 + 0.02);
    // gilded bead under the apron
    for (let i = 0; i < n; i++) {
      const a = ((i + 0.5) / n) * Math.PI;
      k.sphere(0.006, M.brass(), Math.cos(a) * (w / 2 - 0.034), H - t - apH + 0.01, -d / 2 + Math.sin(a) * (d - 0.034), 1, 1, 1, 6);
    }
    // four tapered round legs
    const legs: Array<[number, number]> = [
      [-(w / 2 - 0.06), -d / 2 + 0.035],
      [w / 2 - 0.06, -d / 2 + 0.035],
      [Math.cos(Math.PI * 0.68) * (w / 2 - 0.06), -d / 2 + Math.sin(Math.PI * 0.68) * (d - 0.06)],
      [Math.cos(Math.PI * 0.32) * (w / 2 - 0.06), -d / 2 + Math.sin(Math.PI * 0.32) * (d - 0.06)],
    ];
    for (const [x, z] of legs) {
      k.rod([x, 0.03, z], [x, H - t, z], 0.012, paint, 0.022, 12);
      k.cyl(0.015, 0.03, M.brass(), x, 0, z, 0.013, 10);
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      ctx.beginPath();
      ctx.ellipse(0, -0.225, 0.5, 0.45, 0, 0, Math.PI);
      ctx.closePath();
      ctx.fillStyle = tint(c.top, 0.35);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(0, -0.225, 0.465, 0.415, 0, 0, Math.PI);
      ctx.strokeStyle = INK_SOFT;
      ctx.lineWidth = LINE_THIN;
      ctx.stroke();
    }),
};

/* ================================================================================ DESKS */

const writingDesk: FurnitureDef = {
  id: 'desk-writing',
  name: 'שולחן כתיבה קלאסי עם מגירות',
  category: 'office',
  group: G_DESK,
  tags: ['שולחן כתיבה', 'מגירות', 'עור', 'קלאסי', 'אגוז', 'לימוד'],
  size: { w: 1.2, d: 0.62, h: 0.92 },
  colors: [slot('wood', 'עץ', WOOD.darkWalnut), slot('leather', 'עור', '#2f4a3c')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const w = 1.2;
    const d = 0.62;
    const H = 0.755;
    const t = 0.028;
    const wood = M.wood(c.wood);
    rectTop(k, w, d, t, H, wood, 0.006, 'step');
    k.rbox(w - 0.16, 0.002, d - 0.16, 0.001, M.leather(c.leather), 0, H, 0.01, 1);
    k.box(w - 0.152, 0.0016, d - 0.152, M.brass(), 0, H - 0.0002, 0.01);
    const apH = 0.13;
    legFrame(k, { w: w - 0.02, d: d - 0.02, h: H - t, legW: 0.05, legWb: 0.03, inset: 0, apronH: apH, apronSet: 0.006, leg: wood, noFront: true });
    const fz = (d - 0.02) / 2 - 0.022;
    const lx = (w - 0.02) / 2 - 0.05;
    const yD = H - t - apH + 0.01;
    const brass = M.brass();
    const widths = [0.3, 0.42, 0.3];
    let x = -lx;
    const total = widths.reduce((a, b) => a + b, 0);
    for (const ww of widths) {
      const dw = (ww / total) * 2 * lx;
      const cx = x + dw / 2;
      drawerFront(k, cx, yD, fz, dw - 0.012, apH - 0.02, wood);
      ringPull(k, cx, yD + (apH - 0.02) / 2, fz + 0.018, brass);
      x += dw;
    }
    k.box(w - 0.12, apH, d - 0.1, M.matte('#241d18'), 0, H - t - apH, -0.02);
    bookStack(k, 0.42, H, -0.15, 3, 101);
    penCup(k, -0.45, H, -0.18, M.leather('#3a2b22'));
    // open notebook
    k.box(0.3, 0.008, 0.21, M.matte('#f3efe6'), -0.05, H, 0.08).rotation.y = 0.12;
    k.rod([-0.03, H + 0.009, 0.12], [0.12, H + 0.009, 0.06], 0.0035, M.lacquer('#1a1a1a'), 0.003, 6);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 1.2, 0.62, 0.006, tint(c.wood, 0.4));
      D.rr(ctx, 0, 0.01, 1.04, 0.46, 0.003, tint(c.leather, 0.35), INK_SOFT, LINE_THIN);
    }),
};

const cornerDesk: FurnitureDef = {
  id: 'desk-corner-l',
  name: 'שולחן עבודה פינתי L',
  category: 'office',
  group: G_DESK,
  tags: ['פינתי', 'צורת L', 'מגירות', 'מחשב', 'משרד ביתי'],
  size: { w: 1.6, d: 1.4, h: 1.19 },
  colors: [slot('top', 'משטח', WOOD.oak), slot('body', 'גוף', '#f1efea')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const H = 0.74;
    const t = 0.03;
    const top = M.wood(c.top);
    const body = M.paint(c.body, 0.45);
    const pts: Array<[number, number]> = [
      [-0.8, -0.7],
      [0.8, -0.7],
      [0.8, -0.05],
      [-0.18, -0.05],
      [-0.18, 0.7],
      [-0.8, 0.7],
    ];
    k.slab(polyShape(pts), t, top, 0, H - t, 0, 0.002, 2);
    // right panel leg, front-left panel leg, modesty panel
    const pt = 0.025;
    k.rbox(pt, H - t, 0.62, 0.003, body, 0.8 - pt / 2 - 0.01, 0, -0.375, 1);
    k.rbox(0.58, H - t, pt, 0.003, body, -0.49, 0, 0.7 - pt / 2 - 0.01, 1);
    k.rbox(1.0, 0.35, 0.018, 0.003, body, 0.25, H - t - 0.4, -0.66, 1);
    // drawer pedestal in the corner
    const px = -0.58;
    const pw = 0.4;
    const pd = 0.55;
    k.rbox(pw, H - t - 0.01, pd, 0.003, body, px, 0.0, -0.4, 1);
    const fz = -0.4 + pd / 2;
    const hs = [0.14, 0.14, 0.38];
    let y = H - t - 0.012;
    for (const hh of hs) {
      drawerFront(k, px, y - hh + 0.005, fz, pw - 0.012, hh - 0.008, body);
      k.rbox(0.14, 0.01, 0.012, 0.003, M.steel(), px, y - 0.04, fz + 0.026, 1);
      y -= hh;
    }
    // equipment
    monitor(k, 0.2, H, -0.42, 0.6);
    keyboard(k, 0.2, H, -0.2);
    k.rbox(0.06, 0.035, 0.1, 0.012, M.plastic('#2b2c2e'), 0.52, H, -0.2, 2);
    penCup(k, -0.65, H, -0.55, M.ceramic('#3d5166'));
    bookStack(k, -0.5, H, 0.35, 3, 111);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.poly(
        ctx,
        [
          [-0.8, -0.7],
          [0.8, -0.7],
          [0.8, -0.05],
          [-0.18, -0.05],
          [-0.18, 0.7],
          [-0.8, 0.7],
        ],
        true,
        tint(c.top, 0.35),
      );
      D.rr(ctx, 0.2, -0.43, 0.6, 0.04, 0.005, '#4a4d52', INK_SOFT, LINE_THIN);
      D.rr(ctx, 0.2, -0.2, 0.42, 0.13, 0.01, '#eceef0', INK_SOFT, LINE_THIN);
      dashed(ctx, () => D.rr(ctx, -0.58, -0.4, 0.4, 0.55, 0, null, INK_SOFT, LINE_THIN));
    }),
};

const standingDesk: FurnitureDef = {
  id: 'desk-sit-stand',
  name: 'שולחן עבודה חשמלי מתכוונן',
  category: 'office',
  group: G_DESK,
  tags: ['עמידה', 'ישיבה-עמידה', 'חשמלי', 'מתכוונן', 'ארגונומי', 'משרד ביתי'],
  size: { w: 1.4, d: 0.7, h: 1.19 },
  colors: [slot('top', 'משטח', '#e9e4dc'), slot('frame', 'מסגרת', '#2b2c2f')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const w = 1.4;
    const d = 0.7;
    const H = 0.74;
    const t = 0.025;
    rectTop(k, w, d, t, H, M.paint(c.top, 0.5), 0.04, 'soft');
    // edge band in a contrasting oak
    const m = M.metal(c.frame, 0.4, 0.75);
    const yU = H - t;
    const lx = w / 2 - 0.18;
    for (const s of [-1, 1]) {
      const x = s * lx;
      // foot with levellers
      k.rbox(0.07, 0.035, d - 0.06, 0.012, m, x, 0.008, 0, 2);
      for (const z of [-1, 1]) k.cyl(0.014, 0.008, M.rubber(), x, 0, z * (d / 2 - 0.06), 0.014, 10);
      // telescopic column: three stages
      k.rbox(0.085, 0.36, 0.065, 0.004, m, x, 0.043, 0, 1);
      k.rbox(0.075, 0.2, 0.055, 0.004, m, x, 0.4, 0, 1);
      k.rbox(0.065, yU - 0.03 - 0.6, 0.045, 0.004, m, x, 0.6, 0, 1);
      // top bracket along z
      k.rbox(0.05, 0.03, d - 0.12, 0.004, m, x, yU - 0.03, 0, 1);
    }
    k.rbox(2 * lx, 0.04, 0.03, 0.004, m, 0, yU - 0.06, -0.08, 1);
    // motor housing + control panel
    k.rbox(0.14, 0.05, 0.08, 0.01, m, -lx + 0.12, yU - 0.05, -0.08, 1);
    k.rbox(0.12, 0.022, 0.05, 0.008, M.plastic('#1d1e21'), w / 2 - 0.2, yU - 0.022, d / 2 - 0.03, 1);
    k.box(0.04, 0.001, 0.016, M.glow('#7ad1ff', 0.8, '#123'), w / 2 - 0.2, yU - 0.0225, d / 2 - 0.006).rotation.x = Math.PI / 2;
    // cable tray
    k.box(0.8, 0.06, 0.12, M.metal(c.frame, 0.6, 0.5), 0, yU - 0.07, -d / 2 + 0.12);
    monitor(k, -0.15, H, -0.2, 0.6);
    laptop(k, 0.38, H, 0.02, -0.25);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 1.4, 0.7, 0.04, tint(c.top, 0.15));
      D.rr(ctx, -0.15, -0.21, 0.6, 0.04, 0.005, '#4a4d52', INK_SOFT, LINE_THIN);
      dashed(ctx, () => {
        for (const s of [-1, 1]) D.rr(ctx, s * 0.52, 0, 0.07, 0.64, 0.01, null, INK_SOFT, LINE_THIN);
      });
    }),
};

const secretaryDesk: FurnitureDef = {
  id: 'desk-secretary',
  name: 'מזכירה – שולחן כתיבה עם דלת נפתחת',
  category: 'office',
  group: G_DESK,
  tags: ['מזכירה', 'שולחן כתיבה', 'תאים', 'מגירות', 'וינטג\'', 'חוסך מקום'],
  size: { w: 0.9, d: 0.72, h: 1.06 },
  colors: [slot('wood', 'עץ', WOOD.teak), slot('inside', 'פנים', '#efe6d4')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const w = 0.9;
    const H = 1.06;
    const wood = M.wood(c.wood);
    const inside = M.paint(c.inside, 0.6);
    const zb = -0.36;
    const bd = 0.38; // body depth
    const zf = zb + bd;
    const legH = 0.17;
    // legs
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) sqLeg(k, sx * (w / 2 - 0.02), sz === -1 ? zb + 0.02 : zf - 0.02, sx, sz, legH + 0.01, 0.04, 0.025, wood);
    // lower case with two drawers
    const lowTop = 0.72;
    k.rbox(w - 0.02, lowTop - legH, bd - 0.02, 0.004, wood, 0, legH, zb + bd / 2 - 0.01, 1);
    const dh = (lowTop - legH - 0.03) / 2;
    for (let i = 0; i < 2; i++) {
      const y = legH + 0.01 + i * (dh + 0.01);
      drawerFront(k, 0, y, zf - 0.03, w - 0.05, dh - 0.004, wood);
      for (const s of [-1, 1]) knob(k, s * 0.22, y + dh / 2, zf - 0.01, M.brass(), 0.01);
    }
    // writing surface (deck) + open fall-front flap on lopers
    k.rbox(w - 0.02, 0.022, bd - 0.02, 0.003, wood, 0, lowTop, zb + bd / 2 - 0.01, 1);
    const flapD = 0.34;
    k.rbox(w - 0.06, 0.02, flapD, 0.004, wood, 0, lowTop + 0.002, zf + flapD / 2 - 0.02, 1);
    k.box(w - 0.14, 0.002, flapD - 0.07, M.leather('#3b5446'), 0, lowTop + 0.022, zf + flapD / 2 - 0.02);
    for (const s of [-1, 1]) k.rbox(0.04, 0.045, 0.3, 0.004, wood, s * (w / 2 - 0.075), lowTop - 0.045, zf + 0.13, 1);
    for (const s of [-1, 1]) k.cyl(0.006, 0.02, M.brass(), s * (w / 2 - 0.08), lowTop + 0.002, zf - 0.015, 0.006, 8).rotation.z = Math.PI / 2;
    // upper case with pigeonholes
    const uy = lowTop + 0.022;
    const ud = 0.25;
    const uh = H - uy;
    const st = 0.018;
    for (const s of [-1, 1]) k.box(st, uh, ud, wood, s * (w / 2 - 0.01 - st / 2), uy, zb + ud / 2);
    k.rbox(w - 0.02, st, ud + 0.02, 0.003, wood, 0, H - st, zb + ud / 2 + 0.01, 1);
    k.box(w - 0.04, uh - st, 0.01, inside, 0, uy, zb + 0.005);
    const ix = w / 2 - 0.01 - st;
    // small drawers row
    const sdH = 0.07;
    for (let i = 0; i < 4; i++) {
      const cw = (2 * ix) / 4;
      const cx = -ix + cw / 2 + i * cw;
      drawerFront(k, cx, uy + 0.004, zb + ud - 0.03, cw - 0.012, sdH - 0.01, wood);
      knob(k, cx, uy + sdH / 2, zb + ud - 0.012, M.brass(), 0.007);
    }
    k.box(2 * ix, 0.012, ud - 0.02, wood, 0, uy + sdH, zb + ud / 2 - 0.01);
    // pigeonhole dividers
    for (let i = 1; i < 5; i++) k.box(0.01, uh - st - sdH - 0.012, ud - 0.03, wood, -ix + (2 * ix * i) / 5, uy + sdH + 0.012, zb + ud / 2 - 0.015);
    k.box(2 * ix, 0.01, ud - 0.03, wood, 0, uy + sdH + 0.012 + (uh - st - sdH - 0.012) * 0.55, zb + ud / 2 - 0.015);
    // letters / books in the cubbies
    const r = rng(7);
    for (let i = 0; i < 5; i++) {
      if (i === 2) continue;
      const cx = -ix + (2 * ix * (i + 0.5)) / 5;
      k.box(0.11, 0.004 + r() * 0.04, 0.16, M.matte(['#f3efe6', '#d9c9a8', '#c7775a', '#8ea5b7'][i % 4]), cx, uy + sdH + 0.022, zb + 0.11);
    }
    // inkwell + paper on the flap
    k.box(0.21, 0.004, 0.29, M.matte('#f6f2e8'), -0.08, lowTop + 0.024, zf + 0.15).rotation.y = -0.1;
    k.cyl(0.025, 0.04, M.glass('#2a3540', 0.8), 0.22, lowTop + 0.024, zf + 0.06, 0.02, 12);
    k.rod([0.05, lowTop + 0.03, zf + 0.12], [0.16, lowTop + 0.03, zf + 0.06], 0.0035, M.lacquer('#1b1b1b'), 0.003, 6);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, -0.17, 0.9, 0.38, 0.004, tint(c.wood, 0.35));
      D.rr(ctx, 0, -0.235, 0.88, 0.25, 0.003, tint(c.wood, 0.2), INK_SOFT, LINE_THIN);
      D.rr(ctx, 0, 0.19, 0.84, 0.34, 0.004, tint(c.wood, 0.45), INK_SOFT, LINE_THIN);
    }),
};

const trestleDesk: FurnitureDef = {
  id: 'desk-trestle',
  name: 'שולחן עבודה מינימליסטי על חמורים',
  category: 'office',
  group: G_DESK,
  tags: ['חמורים', 'טרסל', 'מינימליסטי', 'סטודיו', 'אדריכל', 'עץ'],
  size: { w: 1.5, d: 0.72, h: 0.97 },
  colors: [slot('top', 'משטח', WOOD.birch), slot('trestle', 'חמורים', '#2a2b2e')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const w = 1.5;
    const d = 0.72;
    const H = 0.74;
    const t = 0.025;
    rectTop(k, w, d, t, H, M.wood(c.top), 0.004, 'square');
    // plywood edge layers
    for (const s of [-1, 1]) for (let i = 1; i < 4; i++) k.box(w - 0.004, 0.0008, 0.001, M.matte(darken(c.top, 0.25)), 0, H - t + (i * t) / 4, s * (d / 2 - 0.0002));
    const m = M.metal(c.trestle, 0.45, 0.75);
    const yU = H - t;
    for (const s of [-1, 1]) {
      const x = s * (w / 2 - 0.28);
      const bz = d / 2 - 0.08;
      k.rbox(0.05, 0.035, 2 * bz + 0.04, 0.004, m, x, yU - 0.035, 0, 1);
      for (const sz of [-1, 1]) {
        for (const sx of [-1, 1]) {
          const top: V3 = [x + sx * 0.02, yU - 0.035, sz * (bz - 0.03)];
          const bot: V3 = [x + sx * 0.16, 0.003, sz * (bz + 0.02)];
          k.beam(bot, top, 0.028, 0.028, m, 0.003);
        }
        k.rod([x - 0.1, 0.24, sz * (bz + 0.0)], [x + 0.1, 0.24, sz * (bz + 0.0)], 0.009, m, 0.009, 8);
      }
    }
    laptop(k, -0.1, H, 0.02, 0.1, 0.32);
    penCup(k, 0.45, H, -0.2, M.ceramic('#e9e2d6'));
    bookStack(k, 0.5, H, 0.05, 2, 121);
    // desk lamp-free task: a mug
    k.cyl(0.04, 0.09, M.ceramic('#c7775a'), 0.28, H, 0.15, 0.04, 16);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 1.5, 0.72, 0.004, tint(c.top, 0.25));
      dashed(ctx, () => {
        for (const s of [-1, 1]) D.rr(ctx, s * 0.47, 0, 0.36, 0.64, 0, null, INK_SOFT, LINE_THIN);
      });
      D.rr(ctx, -0.1, 0.02, 0.32, 0.22, 0.01, '#d7d9dc', INK_SOFT, LINE_THIN);
    }),
};

const executiveDesk: FurnitureDef = {
  id: 'desk-executive',
  name: 'שולחן מנהלים עם שידת מגירות',
  category: 'office',
  group: G_DESK,
  tags: ['מנהלים', 'משרד', 'מגירות', 'אגוז', 'עור', 'מכובד'],
  size: { w: 1.7, d: 0.8, h: 0.98 },
  colors: [slot('wood', 'עץ', WOOD.walnut), slot('accent', 'עור', '#2a2a2c')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const w = 1.7;
    const d = 0.8;
    const H = 0.76;
    const t = 0.04;
    const wood = M.wood(c.wood);
    rectTop(k, w, d, t, H, wood, 0.01, 'knife');
    const yU = H - t;
    // left drawer pedestal
    const pw = 0.46;
    const px = -w / 2 + 0.03 + pw / 2;
    k.rbox(pw, yU - 0.02, d - 0.08, 0.004, wood, px, 0.02, -0.01, 1);
    k.box(pw - 0.04, 0.02, d - 0.12, M.matte('#1d1916'), px, 0, -0.01);
    const fz = d / 2 - 0.05;
    const hs = [0.16, 0.16, 0.34];
    let y = yU - 0.012;
    for (const hh of hs) {
      drawerFront(k, px, y - hh + 0.006, fz - 0.002, pw - 0.02, hh - 0.012, wood);
      k.rbox(0.18, 0.012, 0.016, 0.004, M.metal(c.accent, 0.35, 0.8), px, y - 0.045, fz + 0.022, 1);
      y -= hh;
    }
    // right slab leg + modesty panel
    k.rbox(0.05, yU, d - 0.08, 0.006, wood, w / 2 - 0.06, 0, -0.01, 1);
    k.rbox(w - pw - 0.12, 0.42, 0.02, 0.004, wood, px + pw / 2 + (w - pw - 0.12) / 2 - 0.01, yU - 0.44, -d / 2 + 0.06, 1);
    // pencil drawer
    drawerFront(k, 0.25, yU - 0.07, fz - 0.002, 0.6, 0.06, wood);
    k.box(0.62, 0.07, d - 0.1, M.matte('#1d1916'), 0.25, yU - 0.07, -0.02);
    // desk pad, pen holder, books
    k.rbox(0.7, 0.004, 0.42, 0.01, M.leather(c.accent), 0.1, H, 0.06, 1);
    penCup(k, -0.62, H, -0.25, M.leather(c.accent));
    bookStack(k, 0.65, H, -0.2, 3, 131);
    laptop(k, 0.1, H + 0.004, 0.0, 0, 0.3);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 1.7, 0.8, 0.01, tint(c.wood, 0.4));
      D.rr(ctx, 0, 0, 1.63, 0.73, 0.006, null, INK_SOFT, LINE_THIN);
      D.rr(ctx, 0.1, 0.06, 0.7, 0.42, 0.01, tint(c.accent, 0.5), INK_SOFT, LINE_THIN);
    }),
};

const kidsDesk: FurnitureDef = {
  id: 'desk-kids-organizer',
  name: 'שולחן ילדים עם מעמד אחסון',
  category: 'kids',
  group: 'שולחנות',
  tags: ['ילדים', 'שולחן כתיבה', 'צבעוני', 'יצירה', 'מארגן'],
  size: { w: 0.9, d: 0.55, h: 0.76 },
  colors: [slot('top', 'משטח', '#f4f1ea'), slot('legs', 'רגליים', '#e6a94c'), slot('accent', 'מארגן', '#8fb3c4')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const w = 0.9;
    const d = 0.55;
    const H = 0.58;
    const t = 0.024;
    rectTop(k, w, d, t, H, M.paint(c.top, 0.45), 0.07, 'bull');
    // birch ply edge
    const birch = M.wood(PAL.birch);
    const legs = M.paint(c.legs, 0.45);
    legs4(k, w - 0.04, d - 0.04, H - t, legs, { rTop: 0.024, rBot: 0.02, inset: 0.05, splay: 0.025 });
    for (const s of [-1, 1]) k.rbox(w - 0.2, 0.06, 0.018, 0.006, birch, 0, H - t - 0.06, s * (d / 2 - 0.08), 1);
    // organiser along the back
    const acc = M.paint(c.accent, 0.45);
    const oz = -d / 2 + 0.07;
    k.rbox(w - 0.06, 0.16, 0.014, 0.004, acc, 0, H, -d / 2 + 0.017, 1);
    for (const x of [-(w / 2 - 0.037), -0.15, 0.15, w / 2 - 0.037]) k.rbox(0.014, 0.16, 0.1, 0.004, acc, x, H, oz, 1);
    k.rbox(w - 0.06, 0.012, 0.1, 0.004, birch, 0, H + 0.16 - 0.012, oz, 1);
    // contents: crayons cup, paper roll, books
    penCup(k, -0.28, H, oz + 0.005, M.plastic('#d0573c'));
    const bc = ['#c7775a', '#3d5166', '#d6a544', '#9bae8a', '#f0ebe0'];
    for (let i = 0; i < 5; i++) k.box(0.022, 0.1 + (i % 3) * 0.012, 0.085, M.matte(bc[i]), -0.1 + i * 0.026, H, oz + 0.002);
    k.cyl(0.035, 0.2, M.matte('#f6f2e8'), 0.3, H + 0.04, oz + 0.005, 0.035, 14).rotation.z = Math.PI / 2;
    k.box(0.3, 0.003, 0.21, M.matte('#fbf8f1'), -0.05, H, 0.1).rotation.y = -0.08;
    for (let i = 0; i < 3; i++) k.rod([0.15 + i * 0.03, H + 0.005, 0.12], [0.2 + i * 0.03, H + 0.005, 0.03], 0.004, M.matte(['#d0573c', '#4f7d3c', '#3d5166'][i]), 0.004, 6);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 0.9, 0.55, 0.07, tint(c.top, 0.1));
      D.rr(ctx, 0, -0.205, 0.84, 0.11, 0.01, tint(c.accent, 0.35), INK_SOFT, LINE_THIN);
    }),
};

export const TABLES: FurnitureDef[] = [
  // dining
  oakTable4,
  walnutTable6,
  farmTable8,
  trestleTable,
  tulipMarble,
  ovalPedestal,
  glassTable,
  liveEdgeTable,
  extendTable,
  bistroTable,
  counterTable,
  terrazzoTable,
  rattanBaseTable,
  concreteTable,
  pipeTable,
  scandiTable,
  squareXTable,
  blackOakRound,
  // coffee
  marbleRoundCoffee,
  nestingCoffee,
  glassBrassCoffee,
  trunkCoffee,
  liftTopCoffee,
  travertineCoffee,
  riverCoffee,
  concreteCoffee,
  rattanCoffee,
  trayCoffee,
  ovalScandiCoffee,
  twoTierCoffee,
  plinthDrumCoffee,
  // side
  cTable,
  pedestalSide,
  reededDrum,
  mushroomSide,
  tripodSide,
  stackedMarble,
  traySide,
  rattanSide,
  hourglassSide,
  // consoles
  slimConsole,
  marbleConsole,
  rusticConsole,
  demiluneConsole,
  // desks
  writingDesk,
  cornerDesk,
  standingDesk,
  secretaryDesk,
  trestleDesk,
  executiveDesk,
  kidsDesk,
];
