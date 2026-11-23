import * as THREE from 'three';
import type { FurnitureDef, SeatAnchor } from '../types';
import { D, INK_SOFT, Kit, ellipseShape, LINE_THIN, M, PAL, darken, lighten, roundedRectShape, sym, tint, type Ctx2D } from '../kit';
import { bookRow, bookStack, cabinet, legs4, slot } from './_parts';

type Colors = Record<string, string>;

/* ------------------------------------------------------------------ sofas */

interface SofaOpts {
  w: number;
  /** depth of the main run */
  d: number;
  /** number of seat columns */
  n: number;
  armW: number;
  /** total depth when the right-most column is a chaise longue */
  chaise?: number;
  pillows: number;
}

const SOFA_LEG = 0.13;
const SOFA_BASE = 0.16;
const SOFA_BACK_T = 0.2;
const SOFA_SEAT_H = 0.45;

function buildSofa(c: Colors, o: SofaOpts): THREE.Object3D {
  const k = new Kit();
  const fab = M.fabric(c.fabric);
  const legM = M.wood(c.legs);
  const total = o.chaise ?? o.d;
  const zb = -total / 2;
  const zMid = zb + o.d / 2;
  const seatY = SOFA_LEG + SOFA_BASE;
  const inner = o.w - 2 * o.armW;
  const cw = inner / o.n;

  // frame: base, back and arms
  k.rbox(o.w - 0.03, SOFA_BASE, o.d - 0.03, 0.03, fab, 0, SOFA_LEG, zMid, 1);
  k.rbox(o.w - 0.05, 0.62, SOFA_BACK_T, 0.07, fab, 0, SOFA_LEG + 0.02, zb + SOFA_BACK_T / 2, 2);
  for (const s of [-1, 1]) {
    k.rbox(o.armW, 0.5, o.d, 0.065, fab, s * (o.w / 2 - o.armW / 2), SOFA_LEG, zMid, 2);
  }
  legs4(k, o.w, o.d, SOFA_LEG, legM, { rTop: 0.024, rBot: 0.014, inset: 0.085, splay: 0.012, cz: zMid });
  if (o.n >= 3 && !o.chaise) {
    for (const sz of [-1, 1]) k.cyl(0.014, SOFA_LEG, legM, 0, 0, zMid + sz * (o.d / 2 - 0.085), 0.024, 12);
  }

  for (let i = 0; i < o.n; i++) {
    const x = -inner / 2 + cw * (i + 0.5);
    const isChaise = !!o.chaise && i === o.n - 1;
    const z0 = zb + SOFA_BACK_T - 0.012;
    const z1 = (isChaise ? total / 2 : zb + o.d) - 0.006;
    if (isChaise) {
      // chaise base continues forward past the arm
      const cz0 = zb + o.d - 0.06;
      const cz1 = total / 2 - 0.012;
      k.rbox(cw - 0.012, SOFA_BASE, cz1 - cz0, 0.03, fab, x, SOFA_LEG, (cz0 + cz1) / 2, 1);
      for (const sx of [-1, 1]) k.cyl(0.014, SOFA_LEG, legM, x + sx * (cw / 2 - 0.08), 0, cz1 - 0.075, 0.024, 12);
    }
    // seat cushion
    k.cushion(cw - 0.008, SOFA_SEAT_H - seatY + 0.012, z1 - z0, fab, x, seatY - 0.012, (z0 + z1) / 2, 0.05, 0.022);
    // back cushion, leaning back
    const bh = 0.4;
    const bt = 0.16;
    const lean = 0.2;
    const zBottom = zb + SOFA_BACK_T + bt / 2 + 0.035;
    const bc = k.cushion(cw - 0.016, bt, bh, fab, x, 0, 0, 0.055, 0.03);
    bc.rotation.x = Math.PI / 2 - lean;
    bc.position.set(x, SOFA_SEAT_H + (bh / 2) * Math.cos(lean) + 0.012, zBottom - (bh / 2) * Math.sin(lean));
  }

  // throw pillows
  const accent = M.fabric(c.accent, 10);
  const px = inner / 2 - 0.23;
  const mk = (x: number, rotY: number, size: number) => {
    const p = k.pillow(size, 0.14, size, accent);
    p.rotation.order = 'YXZ';
    p.rotation.set(Math.PI / 2 - 0.42, rotY, 0);
    p.position.set(x, SOFA_SEAT_H + size * 0.46, zb + SOFA_BACK_T + 0.27);
  };
  if (o.pillows >= 1) mk(-px, 0.42, 0.42);
  if (o.pillows >= 2) mk(o.chaise ? px - cw : px, -0.38, 0.38);
  return k.g;
}

function sofaSeats(o: SofaOpts): SeatAnchor[] {
  const total = o.chaise ?? o.d;
  const zb = -total / 2;
  const inner = o.w - 2 * o.armW;
  const cw = inner / o.n;
  const out: SeatAnchor[] = [];
  for (let i = 0; i < o.n; i++) {
    out.push({ x: +(-inner / 2 + cw * (i + 0.5)).toFixed(3), z: +(zb + o.d * 0.6).toFixed(3), height: SOFA_SEAT_H, facing: 0, kind: 'sit' });
  }
  return out;
}

function drawSofa(ctx: Ctx2D, c: Colors, o: SofaOpts): void {
  sym(ctx, () => {
    const total = o.chaise ?? o.d;
    const zb = -total / 2;
    const zf = zb + o.d;
    const body = tint(c.fabric, 0.3);
    const cush = tint(c.fabric, 0.52);
    const inner = o.w - 2 * o.armW;
    const cw = inner / o.n;
    D.box(ctx, -o.w / 2, zb, o.w / 2, zf, 0.06, body);
    if (o.chaise) {
      const x0 = inner / 2 - cw;
      D.box(ctx, x0, zb + 0.3, inner / 2, total / 2, 0.05, body);
    }
    // back cushions + seat cushions per column
    for (let i = 0; i < o.n; i++) {
      const x0 = -inner / 2 + cw * i;
      const isChaise = !!o.chaise && i === o.n - 1;
      const z1 = (isChaise ? total / 2 : zf) - 0.012;
      D.box(ctx, x0 + 0.008, zb + SOFA_BACK_T + 0.17, x0 + cw - 0.008, z1, 0.05, cush, undefined, LINE_THIN);
      D.box(ctx, x0 + 0.012, zb + SOFA_BACK_T - 0.03, x0 + cw - 0.012, zb + SOFA_BACK_T + 0.165, 0.06, cush, undefined, LINE_THIN);
    }
    // arms
    for (const s of [-1, 1]) {
      const x0 = s * (o.w / 2);
      D.box(ctx, x0, zb, x0 - s * o.armW, zf, 0.06, body);
    }
    // throw pillows
    const pil = (x: number, rot: number, size: number) => {
      ctx.save();
      ctx.translate(x, zb + SOFA_BACK_T + 0.2);
      ctx.rotate(rot);
      D.rr(ctx, 0, 0, size, size * 0.62, 0.06, tint(c.accent, 0.25), undefined, LINE_THIN);
      ctx.restore();
    };
    const px = inner / 2 - 0.23;
    if (o.pillows >= 1) pil(-px, -0.4, 0.4);
    if (o.pillows >= 2) pil(o.chaise ? px - cw : px, 0.36, 0.36);
  });
}

const SOFA_COLORS = (fabric: string, accent: string) => [
  slot('fabric', 'ריפוד', fabric),
  slot('legs', 'רגליים', PAL.walnut),
  slot('accent', 'כריות נוי', accent),
];

function sofaDef(id: string, name: string, o: SofaOpts, fabric: string, accent: string): FurnitureDef {
  return {
    id,
    name,
    category: 'living',
    size: { w: o.w, d: o.chaise ?? o.d, h: 0.87 },
    colors: SOFA_COLORS(fabric, accent),
    seats: sofaSeats(o),
    build: ({ colors }) => buildSofa(colors, o),
    draw2d: (ctx, colors) => drawSofa(ctx, colors, o),
  };
}

const SOFA3: SofaOpts = { w: 2.2, d: 0.94, n: 3, armW: 0.2, pillows: 2 };
const SOFA2: SofaOpts = { w: 1.62, d: 0.94, n: 2, armW: 0.2, pillows: 1 };
const SOFA_L: SofaOpts = { w: 2.7, d: 0.94, n: 3, armW: 0.2, chaise: 1.62, pillows: 2 };
const ARMCHAIR: SofaOpts = { w: 0.92, d: 0.88, n: 1, armW: 0.17, pillows: 0 };

/* ------------------------------------------------------------------ tables */

const coffeeTable: FurnitureDef = {
  id: 'coffee-table',
  name: 'שולחן סלון',
  category: 'living',
  size: { w: 1.1, d: 0.6, h: 0.42 },
  colors: [slot('wood', 'עץ', PAL.oak), slot('legs', 'רגליים', PAL.black)],
  build: ({ colors: c }) => {
    const k = new Kit();
    const wood = M.wood(c.wood);
    const metal = M.metal(c.legs, 0.45, 0.8);
    const w = 1.1;
    const d = 0.6;
    k.slab(roundedRectShape(w - 0.012, d - 0.012, 0.05), 0.036, wood, 0, 0.384, 0, 0.006);
    // lower shelf
    k.slab(roundedRectShape(w - 0.16, d - 0.14, 0.02), 0.018, wood, 0, 0.13, 0, 0.003);
    // slim metal frame: 4 legs + rails under the top
    const lx = w / 2 - 0.07;
    const lz = d / 2 - 0.06;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) k.rbox(0.022, 0.386, 0.022, 0.003, metal, sx * lx, 0, sz * lz, 1);
      k.box(0.016, 0.02, lz * 2, metal, sx * lx, 0.362, 0);
      k.box(0.016, 0.014, lz * 2, metal, sx * lx, 0.118, 0);
    }
    for (const sz of [-1, 1]) k.box(lx * 2, 0.02, 0.016, metal, 0, 0.362, sz * lz);
    bookStack(k, -0.22, 0.148, 0.02, 3, 5);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 1.1, 0.6, 0.05, tint(c.wood, 0.35));
      D.rr(ctx, 0, 0, 1.1 - 0.1, 0.6 - 0.1, 0.03, null, INK_SOFT, LINE_THIN);
    }),
};

const sideTable: FurnitureDef = {
  id: 'side-table',
  name: 'שולחן צד עגול',
  category: 'living',
  size: { w: 0.5, d: 0.5, h: 0.52 },
  colors: [slot('top', 'משטח', PAL.oakLight), slot('legs', 'רגליים', PAL.black)],
  build: ({ colors: c }) => {
    const k = new Kit();
    const r = 0.25;
    k.slab(ellipseShape(r - 0.005, r - 0.005), 0.028, M.wood(c.top), 0, 0.492, 0, 0.005, 20);
    const metal = M.metal(c.legs, 0.45, 0.8);
    // three splayed legs meeting a small ring under the top
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
      const cx = Math.cos(a);
      const sz = Math.sin(a);
      k.rod([cx * 0.215, 0.003, sz * 0.215], [cx * 0.12, 0.494, sz * 0.12], 0.009, metal, 0.009);
    }
    k.ring(0.165, 0.006, metal, 0, 0.24, 0, 32);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.circle(ctx, 0, 0, 0.25, tint(c.top, 0.35));
      D.circle(ctx, 0, 0, 0.19, null, INK_SOFT, LINE_THIN);
    }),
};

/* ------------------------------------------------------------------ TV console */

const tvConsole: FurnitureDef = {
  id: 'tv-console',
  name: 'מזנון טלוויזיה',
  category: 'living',
  size: { w: 1.8, d: 0.42, h: 1.32 },
  colors: [slot('wood', 'גוף', PAL.oak), slot('fronts', 'חזיתות', PAL.white)],
  actions: [{ kind: 'tv' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const wood = M.wood(c.wood);
    cabinet(k, {
      w: 1.8,
      h: 0.52,
      d: 0.42,
      body: wood,
      front: M.paint(c.fronts),
      cols: [[{ kind: 'door', hinge: 'l' }], [{ kind: 'panel' }], [{ kind: 'door', hinge: 'r' }]],
      colWeights: [1, 1.1, 1],
      base: 'legs',
      baseH: 0.16,
      baseMat: wood,
      top: wood,
      topT: 0.024,
      handle: 'edge',
    });
    // slatted wood centre panel
    for (let i = 0; i < 21; i++) {
      k.box(0.014, 0.326, 0.012, wood, -0.3 + 0.03 * i, 0.165, 0.21 - 0.006);
    }
    // TV (55"): slim panel on a centered stand
    const blk = M.plastic('#1b1c1f');
    const tw = 1.23;
    const th = 0.71;
    const ty = 0.6;
    k.rbox(0.42, 0.012, 0.2, 0.004, blk, 0, 0.52, -0.02, 1);
    k.box(0.09, 0.09, 0.03, blk, 0, 0.53, -0.05);
    k.rbox(tw, th, 0.028, 0.008, blk, 0, ty, -0.035, 1);
    k.part('screen').box(tw - 0.016, th - 0.016, 0.002, M.screen(), 0, ty + 0.008, -0.0205);
    k.rbox(tw * 0.5, th * 0.5, 0.03, 0.01, blk, 0, ty + 0.1, -0.06, 1);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 1.8, 0.42, 0.01, tint(c.wood, 0.35));
      D.line(ctx, -0.31, -0.21, -0.31, 0.21, INK_SOFT);
      D.line(ctx, 0.31, -0.21, 0.31, 0.21, INK_SOFT);
      // TV panel + stand
      D.rr(ctx, 0, -0.02, 0.42, 0.2, 0.01, '#c9ccd0', undefined, LINE_THIN);
      D.rr(ctx, 0, -0.035, 1.23, 0.04, 0.008, '#4a4d52');
    }),
};

/* ------------------------------------------------------------------ bookshelf */

const bookshelf: FurnitureDef = {
  id: 'bookshelf',
  name: 'כוננית ספרים',
  category: 'living',
  size: { w: 0.9, d: 0.32, h: 1.9 },
  colors: [slot('wood', 'עץ', PAL.oak), slot('back', 'גב', PAL.white)],
  actions: [{ kind: 'read' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const wood = M.wood(c.wood);
    const w = 0.9;
    const d = 0.32;
    const h = 1.9;
    const t = 0.022;
    for (const s of [-1, 1]) k.rbox(t, h, d, 0.003, wood, s * (w / 2 - t / 2), 0, 0, 1);
    k.box(w - 2 * t, 0.006, 0.006, M.matte(darken(c.back, 0.1)), 0, 0.07, -d / 2 + 0.006);
    k.box(w - 2 * t + 0.002, h - 0.08, 0.008, M.paint(c.back, 0.7), 0, 0.07, -d / 2 + 0.004);
    // plinth, bottom, shelves, top
    k.box(w - 2 * t, 0.07, 0.016, wood, 0, 0, d / 2 - 0.03);
    const levels = [0.07, 0.43, 0.79, 1.13, 1.46];
    for (const y of levels) k.box(w - 2 * t + 0.002, t, d - 0.014, wood, 0, y, 0.003);
    k.rbox(w, t, d, 0.003, wood, 0, h - t, 0, 1);
    const x0 = -w / 2 + t;
    const x1 = w / 2 - t;
    const zf = d / 2 - 0.02;
    bookRow(k, x0, x1, levels[0] + t, zf, d - 0.03, 0.33, 21, 0.55);
    bookStack(k, 0.22, levels[0] + t, 0.0, 3, 8);
    bookRow(k, x0, x1, levels[1] + t, zf, d - 0.03, 0.33, 22, 0.9);
    bookRow(k, x0 + 0.3, x1, levels[2] + t, zf, d - 0.03, 0.31, 23, 0.82);
    bookRow(k, x0, x1, levels[3] + t, zf, d - 0.03, 0.3, 24, 0.45);
    bookRow(k, x0 + 0.42, x1, levels[4] + t, zf, d - 0.03, 0.4, 25, 0.75);
    // decor: vase, small box, trailing plant pot
    k.lathe(
      [
        [0, 0],
        [0.045, 0],
        [0.07, 0.07],
        [0.06, 0.15],
        [0.028, 0.2],
        [0.035, 0.24],
        [0.027, 0.24],
        [0, 0.2],
      ],
      M.ceramic(PAL.terracotta),
      x0 + 0.14,
      levels[2] + t,
      0.02,
      20,
    );
    k.lathe(
      [
        [0, 0],
        [0.06, 0],
        [0.075, 0.11],
        [0.068, 0.11],
        [0, 0.1],
      ],
      M.ceramic(PAL.white),
      0.25,
      levels[3] + t,
      0.02,
      20,
    );
    k.sphere(0.085, M.foliage(PAL.leaf), 0.25, levels[3] + t + 0.15, 0.02, 1, 0.75, 1, 10);
    k.rbox(0.2, 0.12, 0.15, 0.01, M.fabric(PAL.sand), x0 + 0.16, levels[4] + t, 0.03, 1);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 0.9, 0.32, 0.005, tint(c.wood, 0.35));
      // book spines
      const cols = ['#b9c4cf', '#e3bfb1', '#f1ece2', '#c9d3c0', '#e9d3a3'];
      let x = -0.42;
      let i = 0;
      while (x < 0.36) {
        const t = 0.03 + ((i * 7) % 4) * 0.008;
        D.box(ctx, x, -0.12 + ((i * 3) % 3) * 0.012, x + t, 0.13, 0, cols[i % cols.length], INK_SOFT, 0.006);
        x += t;
        i++;
      }
    }),
};

/* ------------------------------------------------------------------ rug */

const rug: FurnitureDef = {
  id: 'rug',
  name: 'שטיח',
  category: 'living',
  size: { w: 2.4, d: 1.6, h: 0.014 },
  walkable: true,
  colors: [slot('main', 'צבע', PAL.linen), slot('border', 'דוגמה', PAL.dustyBlue)],
  build: ({ colors: c }) => {
    const k = new Kit();
    const w = 2.4;
    const d = 1.6;
    const m1 = M.fabric(c.main, 9);
    const m2 = M.fabric(c.border, 9);
    const a = k.slab(roundedRectShape(w - 0.006, d - 0.006, 0.03), 0.01, m2, 0, 0, 0, 0.003);
    a.castShadow = false;
    const b = k.slab(roundedRectShape(w - 0.24, d - 0.24, 0.02), 0.012, m1);
    b.castShadow = false;
    // two thin inlaid stripes
    for (const inset of [0.42, 0.5]) {
      const s = new THREE.Shape();
      const ow = w - inset;
      const od = d - inset;
      s.moveTo(-ow / 2, -od / 2);
      s.lineTo(ow / 2, -od / 2);
      s.lineTo(ow / 2, od / 2);
      s.lineTo(-ow / 2, od / 2);
      s.closePath();
      const hole = new THREE.Path();
      const iw = ow - 0.03;
      const id = od - 0.03;
      hole.moveTo(-iw / 2, -id / 2);
      hole.lineTo(-iw / 2, id / 2);
      hole.lineTo(iw / 2, id / 2);
      hole.lineTo(iw / 2, -id / 2);
      hole.closePath();
      s.holes.push(hole);
      const st = k.slab(s, 0.014, m2);
      st.castShadow = false;
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 2.4, 1.6, 0.03, tint(c.border, 0.45), INK_SOFT);
      D.rr(ctx, 0, 0, 2.4 - 0.24, 1.6 - 0.24, 0.02, tint(c.main, 0.5), INK_SOFT, LINE_THIN);
      D.rr(ctx, 0, 0, 2.4 - 0.44, 1.6 - 0.44, 0, null, tint(c.border, 0.1), 0.02);
      D.rr(ctx, 0, 0, 2.4 - 0.52, 1.6 - 0.52, 0, null, tint(c.border, 0.1), 0.01);
    }),
};

/* ------------------------------------------------------------------ pouf */

const pouf: FurnitureDef = {
  id: 'pouf',
  name: 'הדום',
  category: 'living',
  size: { w: 0.55, d: 0.55, h: 0.4 },
  colors: [slot('fabric', 'ריפוד', PAL.mustard)],
  seats: [{ x: 0, z: 0, height: 0.4, facing: 0, kind: 'sit' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const r = 0.275;
    k.lathe(
      [
        [0, 0],
        [r * 0.8, 0],
        [r * 0.95, 0.03],
        [r, 0.1],
        [r, 0.3],
        [r * 0.95, 0.365],
        [r * 0.8, 0.395],
        [0, 0.4],
      ],
      M.fabric(c.fabric, 9),
      0,
      0,
      0,
      32,
    );
    k.ring(r - 0.004, 0.006, M.fabric(lighten(c.fabric, 0.15), 9), 0, 0.2, 0, 32);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.circle(ctx, 0, 0, 0.275, tint(c.fabric, 0.4));
      D.circle(ctx, 0, 0, 0.2, null, INK_SOFT, LINE_THIN);
    }),
};

export const LIVING: FurnitureDef[] = [
  sofaDef('sofa-3', 'ספה תלת-מושבית', SOFA3, PAL.warmGrey, PAL.terracotta),
  sofaDef('sofa-2', 'ספה דו-מושבית', SOFA2, PAL.sage, PAL.cream),
  sofaDef('sofa-corner', 'ספה פינתית', SOFA_L, PAL.linen, PAL.dustyBlue),
  { ...sofaDef('armchair', 'כורסה', ARMCHAIR, PAL.dustyBlue, PAL.cream), size: { w: 0.92, d: 0.88, h: 0.87 } },
  coffeeTable,
  sideTable,
  tvConsole,
  bookshelf,
  rug,
  pouf,
];
