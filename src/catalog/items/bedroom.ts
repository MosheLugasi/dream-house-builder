import * as THREE from 'three';
import type { FurnitureDef, SeatAnchor } from '../types';
import { D, INK_SOFT, Kit, LINE_THIN, M, PAL, extrudeZ, lighten, roundedRectShape, sym, tint, type Ctx2D } from '../kit';
import { cabinet, legs4, slot } from './_parts';

type Colors = Record<string, string>;

/* ------------------------------------------------------------------ beds */

interface BedOpts {
  /** mattress width / length */
  mw: number;
  len: number;
  headH: number;
  pillows: number;
}

const BED_TOP = 0.5;

export function bedSize(o: BedOpts): { w: number; d: number; h: number } {
  return { w: +(o.mw + 0.1).toFixed(3), d: +(o.len + 0.11).toFixed(3), h: o.headH };
}

/** Mattress + bedding (duvet, fold, pillows, throw). `zHead` is the head end of the mattress, `y` its underside. */
export function bedding(k: Kit, c: Colors, mw: number, len: number, pillows: number, y: number, zHead: number, withThrow = true): void {
  const sheet = M.fabric('#f4f1ea', 18);
  const duvet = M.fabric(c.bedding, 12);
  const mh = 0.2;
  const zc = zHead + len / 2;
  k.rbox(mw, mh, len, 0.045, sheet, 0, y, zc, 1);
  // duvet wraps the foot end and the sides
  const dl = len * 0.7;
  const zFoot = zHead + len;
  k.cushion(mw + 0.07, 0.19, dl + 0.03, duvet, 0, y + 0.075, zFoot - dl / 2 + 0.015, 0.06, 0.02);
  // folded-back band
  k.rbox(mw + 0.074, 0.05, 0.3, 0.024, M.fabric(lighten(c.bedding, 0.35), 12), 0, y + mh + 0.035, zFoot - dl + 0.13, 1);
  // pillows
  const pw = pillows === 1 ? Math.min(0.66, mw - 0.16) : Math.min(0.68, mw / 2 - 0.06);
  for (let i = 0; i < pillows; i++) {
    const x = pillows === 1 ? 0 : (i - 0.5) * (mw / 2);
    const p = k.pillow(pw, 0.17, 0.42, sheet, x, y + mh - 0.03, zHead + 0.27);
    p.rotation.x = -0.16;
  }
  if (withThrow) {
    k.rbox(mw + 0.09, 0.2, 0.42, 0.03, M.fabric(c.throw, 9), 0, y + 0.085, zFoot - 0.33, 1);
  }
}

function buildBed(c: Colors, o: BedOpts): THREE.Object3D {
  const k = new Kit();
  const wood = M.wood(c.frame);
  const { w, d } = bedSize(o);
  const headT = 0.05;
  const zHead = -d / 2 + headT + 0.02; // head end of the mattress
  const zFoot = d / 2;
  // frame: side rails + foot rail around the mattress, on short legs
  const railH = 0.2;
  const railY = 0.12;
  const railT = 0.03;
  for (const s of [-1, 1]) {
    k.rbox(railT, railH, zFoot - zHead + 0.02, 0.006, wood, s * (w / 2 - railT / 2), railY, (zHead + zFoot) / 2 - 0.01, 1);
  }
  k.rbox(w, railH, railT, 0.006, wood, 0, railY, zFoot - railT / 2, 1);
  k.box(w - 2 * railT, 0.02, zFoot - zHead - railT, M.matte('#3a3531'), 0, railY + 0.02, (zHead + zFoot - railT) / 2);
  legs4(k, w, zFoot - zHead, railY, wood, { rTop: 0.028, rBot: 0.02, inset: 0.06, cz: (zHead + zFoot) / 2 });
  // headboard: softly rounded slab
  const hb = roundedRectShape(w - 0.016, o.headH - 0.116, 0.06, 0, (o.headH - 0.1) / 2);
  k.geo(extrudeZ(hb, headT, 0.008), wood, 0, 0.1, -d / 2 + headT / 2);
  for (const s of [-1, 1]) k.box(0.05, 0.1, headT - 0.01, wood, s * (w / 2 - 0.1), 0, -d / 2 + headT / 2);
  bedding(k, c, o.mw, o.len, o.pillows, railY + 0.14, zHead + 0.005);
  return k.g;
}

function bedSeats(o: BedOpts): SeatAnchor[] {
  const out: SeatAnchor[] = [];
  const n = o.pillows;
  for (let i = 0; i < n; i++) {
    out.push({ x: n === 1 ? 0 : +((i - 0.5) * (o.mw / 2)).toFixed(3), z: 0.05, height: BED_TOP + 0.04, facing: 0, kind: 'lie' });
  }
  out.push({ x: +(o.mw / 2 - 0.12).toFixed(3), z: 0.35, height: BED_TOP, facing: Math.PI / 2, kind: 'sit' });
  if (n > 1) out.push({ x: -+(o.mw / 2 - 0.12).toFixed(3), z: 0.35, height: BED_TOP, facing: -Math.PI / 2, kind: 'sit' });
  return out;
}

/** plan view of mattress + bedding; head towards -y */
export function drawBedding(ctx: Ctx2D, c: Colors, mw: number, len: number, pillows: number, zHead: number, withThrow = true): void {
  const zFoot = zHead + len;
  D.box(ctx, -mw / 2, zHead, mw / 2, zFoot, 0.05, '#fbfaf6', INK_SOFT, LINE_THIN);
  const dl = len * 0.7;
  D.box(ctx, -mw / 2 - 0.02, zFoot - dl, mw / 2 + 0.02, zFoot, 0.05, tint(c.bedding, 0.4));
  // folded band
  D.box(ctx, -mw / 2 - 0.02, zFoot - dl, mw / 2 + 0.02, zFoot - dl + 0.26, 0.04, tint(c.bedding, 0.7), undefined, LINE_THIN);
  if (withThrow) D.box(ctx, -mw / 2 - 0.02, zFoot - 0.52, mw / 2 + 0.02, zFoot - 0.12, 0.02, tint(c.throw, 0.35), undefined, LINE_THIN);
  const pw = pillows === 1 ? Math.min(0.66, mw - 0.16) : Math.min(0.68, mw / 2 - 0.06);
  for (let i = 0; i < pillows; i++) {
    const x = pillows === 1 ? 0 : (i - 0.5) * (mw / 2);
    D.rr(ctx, x, zHead + 0.27, pw, 0.4, 0.08, '#ffffff', undefined, LINE_THIN);
  }
}

function drawBed(ctx: Ctx2D, c: Colors, o: BedOpts): void {
  sym(ctx, () => {
    const { w, d } = bedSize(o);
    D.rr(ctx, 0, 0, w, d, 0.02, tint(c.frame, 0.35));
    D.line(ctx, -w / 2, -d / 2 + 0.05, w / 2, -d / 2 + 0.05);
    drawBedding(ctx, c, o.mw, o.len, o.pillows, -d / 2 + 0.075);
  });
}

const BED_COLORS = (bedding: string, throwC: string) => [
  slot('frame', 'מסגרת', PAL.oak),
  slot('bedding', 'מצעים', bedding),
  slot('throw', 'כיסוי', throwC),
];

const DOUBLE: BedOpts = { mw: 1.6, len: 2.0, headH: 1.05, pillows: 2 };
const SINGLE: BedOpts = { mw: 0.9, len: 2.0, headH: 0.95, pillows: 1 };

function bedDef(id: string, name: string, o: BedOpts, bed: string, thr: string): FurnitureDef {
  return {
    id,
    name,
    category: 'bedroom',
    size: bedSize(o),
    colors: BED_COLORS(bed, thr),
    seats: bedSeats(o),
    build: ({ colors }) => buildBed(colors, o),
    draw2d: (ctx, colors) => drawBed(ctx, colors, o),
  };
}

/* ------------------------------------------------------------------ storage */

const nightstand: FurnitureDef = {
  id: 'nightstand',
  name: 'שידת לילה',
  category: 'bedroom',
  size: { w: 0.45, d: 0.4, h: 0.52 },
  colors: [slot('wood', 'גוף', PAL.oak), slot('fronts', 'מגירות', PAL.white)],
  build: ({ colors: c }) => {
    const k = new Kit();
    const wood = M.wood(c.wood);
    cabinet(k, {
      w: 0.45,
      h: 0.52,
      d: 0.4,
      body: wood,
      front: M.paint(c.fronts),
      cols: [[{ kind: 'drawer' }, { kind: 'drawer' }]],
      base: 'legs',
      baseH: 0.16,
      baseMat: wood,
      top: wood,
      topT: 0.02,
      handle: 'knob',
      handleMat: M.brass(),
    });
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 0.45, 0.4, 0.01, tint(c.wood, 0.35));
      D.line(ctx, -0.225, 0.165, 0.225, 0.165, INK_SOFT);
      D.circle(ctx, 0, 0.185, 0.012, '#ffffff', undefined, 0.006);
    }),
};

const wardrobe: FurnitureDef = {
  id: 'wardrobe',
  name: 'ארון בגדים',
  category: 'bedroom',
  size: { w: 2.0, d: 0.6, h: 2.2 },
  colors: [slot('fronts', 'דלתות', PAL.white), slot('wood', 'גוף', PAL.oak)],
  build: ({ colors: c }) => {
    const k = new Kit();
    cabinet(k, {
      w: 2.0,
      h: 2.2,
      d: 0.6,
      body: M.wood(c.wood),
      front: M.paint(c.fronts),
      cols: [
        [{ kind: 'door', hinge: 'l' }],
        [{ kind: 'door', hinge: 'r' }],
        [{ kind: 'door', hinge: 'l' }],
        [{ kind: 'door', hinge: 'r' }],
      ],
      base: 'plinth',
      baseH: 0.08,
      baseMat: M.wood(c.wood),
      handle: 'bar',
      handleMat: M.blackMetal(),
      doorHandle: 'mid',
    });
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 2.0, 0.6, 0.005, tint(c.wood, 0.45));
      D.line(ctx, -1, 0.27, 1, 0.27);
      for (const x of [-0.5, 0, 0.5]) D.line(ctx, x, 0.27, x, 0.3, INK_SOFT);
      // hanging rail with hangers
      D.line(ctx, -0.94, -0.02, 0.94, -0.02, INK_SOFT, 0.014);
      for (let i = 0; i < 13; i++) {
        const x = -0.86 + i * 0.143;
        const tilt = ((i * 37) % 5) * 0.012 - 0.024;
        D.line(ctx, x - tilt, -0.23, x + tilt, 0.19, INK_SOFT, 0.008);
      }
    }),
};

const dresser: FurnitureDef = {
  id: 'dresser',
  name: 'שידת מגירות',
  category: 'bedroom',
  size: { w: 1.2, d: 0.48, h: 0.82 },
  colors: [slot('wood', 'גוף', PAL.oak), slot('fronts', 'מגירות', PAL.oak)],
  build: ({ colors: c }) => {
    const k = new Kit();
    const wood = M.wood(c.wood);
    const col = [{ kind: 'drawer' as const }, { kind: 'drawer' as const }, { kind: 'drawer' as const }];
    cabinet(k, {
      w: 1.2,
      h: 0.82,
      d: 0.48,
      body: wood,
      front: M.wood(c.fronts),
      cols: [col, col],
      base: 'legs',
      baseH: 0.15,
      baseMat: wood,
      top: wood,
      topT: 0.022,
      handle: 'bar',
      handleMat: M.blackMetal(),
    });
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 1.2, 0.48, 0.008, tint(c.wood, 0.35));
      D.line(ctx, -0.6, 0.205, 0.6, 0.205, INK_SOFT);
      D.line(ctx, 0, 0.205, 0, 0.24, INK_SOFT);
      for (const x of [-0.3, 0.3]) D.line(ctx, x - 0.08, 0.225, x + 0.08, 0.225, INK_SOFT, 0.01);
    }),
};

const vanity: FurnitureDef = {
  id: 'vanity',
  name: 'שולחן איפור עם מראה',
  category: 'bedroom',
  size: { w: 1.0, d: 0.45, h: 1.36 },
  colors: [slot('wood', 'עץ', PAL.oakLight), slot('fronts', 'מגירות', PAL.white)],
  build: ({ colors: c }) => {
    const k = new Kit();
    const wood = M.wood(c.wood);
    const w = 1.0;
    const d = 0.45;
    // top + drawer box
    k.slab(roundedRectShape(w - 0.01, d - 0.01, 0.025), 0.026, wood, 0, 0.734, 0, 0.005);
    k.box(w - 0.08, 0.11, d - 0.07, wood, 0, 0.625, -0.01);
    const fz = d / 2 - 0.045;
    for (const s of [-1, 1]) {
      k.rbox((w - 0.08) / 2 - 0.006, 0.098, 0.016, 0.003, M.paint(c.fronts), s * ((w - 0.08) / 4), 0.631, fz + 0.008, 1);
      k.sphere(0.012, M.brass(), s * ((w - 0.08) / 4), 0.68, fz + 0.03, 1, 1, 0.8, 12);
    }
    legs4(k, w - 0.08, d - 0.07, 0.63, wood, { rTop: 0.02, rBot: 0.012, inset: 0.03, splay: 0.02, cz: -0.01 });
    // round mirror on a brass stand
    const brass = M.brass();
    const my = 1.06;
    const mr = 0.29;
    const mz = -d / 2 + 0.078;
    const frame = new THREE.TorusGeometry(mr, 0.011, 8, 40);
    k.geo(frame, brass, 0, my, mz);
    const glass = new THREE.CircleGeometry(mr - 0.004, 40);
    k.geo(glass, M.mirror(), 0, my, mz + 0.003);
    const back = new THREE.CylinderGeometry(mr, mr, 0.008, 40);
    back.rotateX(Math.PI / 2);
    k.geo(back, M.matte('#8b6f47'), 0, my, mz - 0.003);
    k.cyl(0.07, 0.012, brass, 0, 0.76, mz, 0.065, 24);
    k.rod([0, 0.77, mz - 0.012], [0, my - mr + 0.01, mz - 0.012], 0.008, brass);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 1.0, 0.45, 0.025, tint(c.wood, 0.35));
      D.rr(ctx, 0, -0.175, 0.6, 0.03, 0.012, '#dfeaf0');
      D.circle(ctx, 0, -0.175, 0.065, null, INK_SOFT, LINE_THIN);
    }),
};

export const BEDROOM: FurnitureDef[] = [
  bedDef('bed-double', 'מיטה זוגית', DOUBLE, PAL.dustyBlue, PAL.mustard),
  bedDef('bed-single', 'מיטת יחיד', SINGLE, PAL.sage, PAL.terracotta),
  nightstand,
  wardrobe,
  dresser,
  vanity,
];
