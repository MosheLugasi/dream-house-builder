/** Shared building blocks for catalog items (cabinets, legs, pots, faucets, books...). */
import * as THREE from 'three';
import { Kit, M, PAL, darken, rng, type V3 } from '../kit';
import type { ColorSlot } from '../types';

export const slot = (key: string, label: string, def: string): ColorSlot => ({ key, label, default: def });

/* ---------------------------------------------------------------- legs */

export interface LegOpts {
  /** radius at the top / at the floor */
  rTop?: number;
  rBot?: number;
  /** how far the leg top is inset from the footprint edge */
  inset?: number;
  /** outward splay of the foot relative to the top (meters) */
  splay?: number;
  /** center offset of the leg rectangle */
  cx?: number;
  cz?: number;
  y0?: number;
}

/** Four round (optionally tapered & splayed) legs under a w × d rectangle, from the floor up to `h`. */
export function legs4(k: Kit, w: number, d: number, h: number, mat: THREE.Material, o: LegOpts = {}): void {
  const rTop = o.rTop ?? 0.02;
  const rBot = o.rBot ?? rTop * 0.6;
  const inset = o.inset ?? rTop + 0.03;
  const splay = o.splay ?? 0;
  const cx = o.cx ?? 0;
  const cz = o.cz ?? 0;
  const y0 = o.y0 ?? 0;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const tx = cx + sx * (w / 2 - inset);
      const tz = cz + sz * (d / 2 - inset);
      const bx = tx + sx * splay;
      const bz = tz + sz * splay;
      // lift the tilted end cap so its lowest point touches the floor exactly
      const tilt = Math.atan2(Math.hypot(splay, splay), h);
      const lift = rBot * Math.sin(tilt);
      k.rod([bx, y0 + lift, bz], [tx, y0 + h, tz], rBot, mat, rTop, 12);
    }
  }
}

/** Four square legs (posts) under a rectangle. */
export function posts4(k: Kit, w: number, d: number, h: number, t: number, mat: THREE.Material, inset = 0, cx = 0, cz = 0, y0 = 0): void {
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      k.rbox(t, h, t, t * 0.12, mat, cx + sx * (w / 2 - t / 2 - inset), y0, cz + sz * (d / 2 - t / 2 - inset), 1);
    }
  }
}

/* ---------------------------------------------------------------- cabinets */

export interface Front {
  kind: 'door' | 'drawer' | 'panel' | 'open';
  /** relative height within its column */
  weight?: number;
  /** door hinge side (handle goes on the other side) */
  hinge?: 'l' | 'r';
}

export interface CabinetOpts {
  w: number;
  h: number;
  d: number;
  body: THREE.Material;
  front: THREE.Material;
  /** color of the dark shadow gaps between fronts */
  revealColor?: string;
  /** columns left to right, each a list of fronts top to bottom */
  cols: Front[][];
  colWeights?: number[];
  base?: 'plinth' | 'legs' | 'none';
  baseH?: number;
  baseMat?: THREE.Material;
  /** top panel / countertop (full w × d) */
  top?: THREE.Material;
  topT?: number;
  topR?: number;
  handle?: 'bar' | 'knob' | 'edge' | 'none';
  handleMat?: THREE.Material;
  /** where door handles sit vertically */
  doorHandle?: 'top' | 'mid' | 'bottom';
  /** extra distance the fronts sit behind +d/2 (defaults to handle projection) */
  frontInset?: number;
  /** build the carcass from panels without a lid (for sinks / hobs cut into the top) */
  hollow?: boolean;
}

export interface CabinetInfo {
  /** z of the front plane of the fronts */
  frontZ: number;
  /** y of the top of the carcass (underside of the top panel) */
  bodyTop: number;
  /** y of the underside of the carcass */
  bodyBottom: number;
}

const FRONT_T = 0.019;

/** Frameless cabinet with a grid of doors / drawers, optional plinth or legs and top. Origin: footprint center, floor. */
export function cabinet(k: Kit, o: CabinetOpts, x = 0, y = 0, z = 0): CabinetInfo {
  const handle = o.handle ?? 'bar';
  const inset = o.frontInset ?? (handle === 'bar' ? 0.03 : handle === 'knob' ? 0.032 : 0.0);
  const base = o.base ?? 'plinth';
  const baseH = base === 'none' ? 0 : (o.baseH ?? (base === 'plinth' ? 0.1 : 0.14));
  const topT = o.top ? (o.topT ?? 0.03) : 0;
  const bodyH = o.h - baseH - topT;
  const frontZ = z + o.d / 2 - inset;
  const bodyD = o.d - inset - FRONT_T;
  const bodyZ = z - o.d / 2 + bodyD / 2;
  const hm = o.handleMat ?? M.steel();
  const reveal = M.matte(o.revealColor ?? '#2b2b2c');

  // carcass
  if (o.hollow) {
    const t = 0.018;
    for (const sx of [-1, 1]) k.box(t, bodyH, bodyD, o.body, x + sx * (o.w / 2 - t / 2), y + baseH, bodyZ);
    k.box(o.w - 2 * t, t, bodyD, o.body, x, y + baseH, bodyZ);
    k.box(o.w - 2 * t, bodyH - t, t, o.body, x, y + baseH + t, bodyZ - bodyD / 2 + t / 2);
  } else {
    k.box(o.w, bodyH, bodyD, o.body, x, y + baseH, bodyZ);
  }
  // shadow-gap plate just behind the fronts
  k.box(o.w - 0.004, bodyH - 0.004, 0.003, reveal, x, y + baseH + 0.002, bodyZ + bodyD / 2 + 0.0015);

  if (base === 'plinth') {
    k.box(o.w - 0.002, baseH, bodyD - 0.045, o.baseMat ?? M.matte('#2f3032'), x, y, bodyZ - 0.0225);
  } else if (base === 'legs') {
    legs4(k, o.w, bodyD, baseH, o.baseMat ?? o.body, { rTop: 0.019, rBot: 0.012, inset: 0.05, cx: x, cz: bodyZ, y0: y });
  }
  if (o.top) {
    k.rbox(o.w, topT, o.d, o.topR ?? 0.004, o.top, x, y + o.h - topT, z, 1);
  }

  // fronts
  const gap = 0.004;
  const edge = 0.0015;
  const cw = o.colWeights ?? o.cols.map(() => 1);
  const cwSum = cw.reduce((a, b) => a + b, 0);
  let fx = x - o.w / 2;
  o.cols.forEach((col, ci) => {
    const colW = (o.w * cw[ci]) / cwSum;
    const x0 = fx + (ci === 0 ? edge : gap / 2);
    const x1 = fx + colW - (ci === o.cols.length - 1 ? edge : gap / 2);
    fx += colW;
    const wSum = col.reduce((a, f) => a + (f.weight ?? 1), 0);
    let fy = y + baseH + bodyH;
    col.forEach((f, ri) => {
      const fh = (bodyH * (f.weight ?? 1)) / wSum;
      const y1 = fy - (ri === 0 ? edge : gap / 2);
      const y0 = fy - fh + (ri === col.length - 1 ? edge : gap / 2);
      fy -= fh;
      if (f.kind === 'open') return;
      const fw = x1 - x0;
      let ph = y1 - y0;
      let py = y0;
      const cxm = (x0 + x1) / 2;
      if (handle === 'edge' && f.kind !== 'panel') {
        // handle-less: a recessed dark finger groove along the top (or bottom) edge
        const gh = 0.016;
        ph -= gh;
        const atBottom = o.doorHandle === 'bottom';
        if (atBottom) py += gh;
        k.box(fw, gh, FRONT_T - 0.008, reveal, cxm, atBottom ? y0 : y1 - gh, frontZ - FRONT_T / 2 - 0.004);
      }
      k.rbox(fw, ph, FRONT_T - 0.003, 0.0035, o.front, cxm, py, frontZ - (FRONT_T - 0.003) / 2, 1);
      if (f.kind === 'panel') return;
      const hz = frontZ + 0.022;
      if (handle === 'bar') {
        if (f.kind === 'drawer') {
          const L = Math.min(fw * 0.45, 0.22);
          const hy = y0 + (y1 - y0) * (y1 - y0 > 0.3 ? 0.78 : 0.5);
          barHandle(k, [cxm - L / 2, hy, hz], [cxm + L / 2, hy, hz], frontZ, hm);
        } else {
          const L = Math.min((y1 - y0) * 0.3, 0.2);
          const hx = (f.hinge ?? 'l') === 'l' ? x1 - 0.045 : x0 + 0.045;
          const at = o.doorHandle ?? 'top';
          const hy = at === 'top' ? y1 - 0.06 - L / 2 : at === 'bottom' ? y0 + 0.06 + L / 2 : (y0 + y1) / 2;
          barHandle(k, [hx, hy - L / 2, hz], [hx, hy + L / 2, hz], frontZ, hm);
        }
      } else if (handle === 'knob') {
        let hx = cxm;
        let hy = (y0 + y1) / 2;
        if (f.kind === 'door') {
          hx = (f.hinge ?? 'l') === 'l' ? x1 - 0.05 : x0 + 0.05;
          const at = o.doorHandle ?? 'top';
          hy = at === 'top' ? y1 - 0.09 : at === 'bottom' ? y0 + 0.09 : (y0 + y1) / 2;
        }
        k.rod([hx, hy, frontZ - 0.002], [hx, hy, frontZ + 0.016], 0.005, hm);
        k.sphere(0.013, hm, hx, hy, frontZ + 0.018, 1, 1, 0.8, 12);
      }
    });
  });
  return { frontZ, bodyTop: y + baseH + bodyH, bodyBottom: y + baseH };
}

/** Slim bar handle between two points, standing off a surface at z = `surfZ`. */
export function barHandle(k: Kit, a: V3, b: V3, surfZ: number, mat: THREE.Material, r = 0.005): void {
  k.rod(a, b, r, mat, r, 8);
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const dir = vb.clone().sub(va).normalize();
  const len = va.distanceTo(vb);
  const off = Math.min(0.02, len * 0.15);
  for (const p of [va.clone().addScaledVector(dir, off), vb.clone().addScaledVector(dir, -off)]) {
    k.rod([p.x, p.y, surfZ - 0.002], [p.x, p.y, a[2]], r * 0.9, mat, r * 0.9, 6);
  }
}

/* ---------------------------------------------------------------- small props */

const BOOK_COLORS = ['#7a8fa3', '#c7775a', '#e6dfd0', '#52606d', '#d6a544', '#9bae8a', '#b9a79a', '#3f4f5f', '#a25d4a', '#f0ebe0', '#6f7f6a'];

/**
 * A row of books standing on a shelf. (x0..x1) is the usable span, `y` the shelf surface,
 * `zFront` the front edge the spines align near, `maxH` the clear height.
 */
export function bookRow(k: Kit, x0: number, x1: number, y: number, zFront: number, depth: number, maxH: number, seed: number, fill = 0.8): void {
  const r = rng(seed);
  let x = x0 + 0.005;
  const end = x0 + (x1 - x0) * fill;
  while (x < end) {
    const t = 0.018 + r() * 0.028;
    const h = Math.min(maxH - 0.01, 0.17 + r() * 0.1);
    const dp = Math.min(depth - 0.01, 0.13 + r() * 0.06);
    const col = BOOK_COLORS[Math.floor(r() * BOOK_COLORS.length)];
    if (x + t > end) break;
    k.box(t, h, dp, M.matte(col), x + t / 2, y, zFront - 0.012 - dp / 2);
    x += t + 0.0012;
  }
  // a leaning book at the end of the row
  if (end + 0.06 < x1) {
    const h = Math.min(maxH - 0.02, 0.2);
    const col = BOOK_COLORS[Math.floor(r() * BOOK_COLORS.length)];
    const m = k.box(0.026, h, 0.15, M.matte(col), x + 0.036, y + 0.002, zFront - 0.012 - 0.075);
    m.rotation.z = 0.2;
    m.position.y = y + (h / 2) * Math.cos(0.2) + 0.013 * Math.sin(0.2);
  }
}

/** A few books lying in a stack; (x, y, z) is the center of the bottom. */
export function bookStack(k: Kit, x: number, y: number, z: number, n: number, seed: number): number {
  const r = rng(seed);
  let yy = y;
  for (let i = 0; i < n; i++) {
    const t = 0.022 + r() * 0.02;
    const w = 0.2 + r() * 0.06;
    const d = 0.14 + r() * 0.04;
    const m = k.box(w, t, d, M.matte(BOOK_COLORS[Math.floor(r() * BOOK_COLORS.length)]), x, yy, z);
    m.rotation.y = (r() - 0.5) * 0.3;
    yy += t;
  }
  return yy;
}

/** Tapered round planter pot with a rolled rim and soil. Returns the soil height. */
export function pot(k: Kit, rTop: number, rBot: number, h: number, mat: THREE.Material, x = 0, y = 0, z = 0): number {
  const t = Math.max(0.008, rTop * 0.07);
  k.lathe(
    [
      [0, 0],
      [rBot, 0],
      [rBot + (rTop - rBot) * 0.5, h * 0.5],
      [rTop, h - t],
      [rTop + t * 0.4, h - t * 0.5],
      [rTop, h],
      [rTop - t, h],
      [rTop - t * 1.4, h - t * 2.2],
      [0, h - t * 2.2],
    ],
    mat,
    x,
    y,
    z,
    28,
  );
  const soilY = h - t * 2.2;
  k.disc(rTop - t * 1.3, 0.004, M.soil(), x, y + soilY, z, 20);
  return y + soilY + 0.004;
}

/** Chrome gooseneck faucet; base at (x, y, z), spout towards +Z. */
export function faucet(k: Kit, x: number, y: number, z: number, h = 0.26, reach = 0.16, mat: THREE.Material = M.chrome()): void {
  k.cyl(0.022, 0.03, mat, x, y, z, 0.02, 16);
  const r = Math.min(reach / 2, 0.08);
  const pts: V3[] = [
    [x, y + 0.02, z],
    [x, y + h - r, z],
    [x, y + h - r * 0.3, z + r * 0.3],
    [x, y + h, z + r],
    [x, y + h - r * 0.3, z + reach - r * 0.3],
    [x, y + h - r, z + reach],
    [x, y + h - r - 0.03, z + reach],
  ];
  k.tube(pts, 0.011, mat, { seg: 28, radial: 8 });
  // lever
  k.rod([x + 0.02, y + 0.045, z], [x + 0.065, y + 0.075, z], 0.006, mat);
}

/** Straight mixer tap (bathroom basin): base at (x, y, z), spout towards +Z. */
export function mixerTap(k: Kit, x: number, y: number, z: number, h = 0.12, reach = 0.11, mat: THREE.Material = M.chrome()): void {
  k.cyl(0.02, h, mat, x, y, z, 0.018, 16);
  k.rod([x, y + h * 0.72, z], [x, y + h * 0.62, z + reach], 0.012, mat, 0.01);
  k.rod([x, y + h, z], [x, y + h + 0.035, z - 0.01], 0.008, mat);
  k.rod([x, y + h + 0.03, z - 0.008], [x, y + h + 0.036, z + 0.04], 0.006, mat);
}

/** Dark wood tone derived from a color (for end grain, shadow lines...). */
export const shade = (c: string, t = 0.25): string => darken(c, t);

export { PAL };
