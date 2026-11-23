import * as THREE from 'three';
import type { FurnitureDef } from '../types';
import { D, INK_SOFT, Kit, LINE_THIN, M, PAL, arcPanelGeo, roundedRectShape, sym, tint, type Ctx2D } from '../kit';
import { barHandle, cabinet, slot } from './_parts';

type Colors = Record<string, string>;

const DESK_W = 1.4;
const DESK_D = 0.7;
const DESK_H = 0.75;

function buildDesk(c: Colors, computer: boolean): THREE.Object3D {
  const k = new Kit();
  const wood = M.wood(c.top);
  const metal = M.metal(c.legs, 0.45, 0.7);
  k.slab(roundedRectShape(DESK_W - 0.01, DESK_D - 0.01, 0.02), 0.028, wood, 0, DESK_H - 0.028, 0, 0.005);
  // two rectangular loop legs + back rail
  const lx = DESK_W / 2 - 0.08;
  const lz = DESK_D / 2 - 0.06;
  const t = 0.035;
  for (const s of [-1, 1]) {
    for (const sz of [-1, 1]) k.rbox(t, DESK_H - 0.03, t * 0.6, 0.004, metal, s * lx, 0, sz * lz, 1);
    k.rbox(t, t * 0.6, lz * 2, 0.004, metal, s * lx, DESK_H - 0.028 - t * 0.6, 0, 1);
    k.rbox(t, t * 0.6, lz * 2 + t * 0.6, 0.004, metal, s * lx, 0, 0, 1);
  }
  k.box(lx * 2, 0.05, 0.015, metal, 0, DESK_H - 0.1, -lz);
  // slim drawer under the right side
  k.box(0.42, 0.075, 0.42, wood, 0.36, DESK_H - 0.103, 0.06);
  k.rbox(0.416, 0.071, 0.016, 0.003, M.paint(PAL.white), 0.36, DESK_H - 0.101, 0.278, 1);
  barHandle(k, [0.3, DESK_H - 0.065, 0.305], [0.42, DESK_H - 0.065, 0.305], 0.286, M.blackMetal(), 0.004);
  if (computer) {
    const blk = M.plastic('#1d1e21');
    const alu = M.metal('#c7cacd', 0.35, 1);
    const y = DESK_H;
    // 27" monitor on a stand
    k.rbox(0.24, 0.012, 0.17, 0.005, alu, 0, y, -0.2, 1);
    const neck = k.box(0.05, 0.19, 0.012, alu, 0, y + 0.01, -0.235);
    neck.rotation.x = -0.12;
    k.rbox(0.615, 0.365, 0.02, 0.006, blk, 0, y + 0.115, -0.2, 1);
    k.box(0.6, 0.35, 0.002, M.screen('#141a24'), 0, y + 0.1225, -0.1895);
    // keyboard, mouse, mouse pad
    k.rbox(0.42, 0.014, 0.13, 0.005, alu, -0.04, y, 0.1, 1);
    k.box(0.4, 0.004, 0.11, M.plastic('#f2f2f2'), -0.04, y + 0.0125, 0.1);
    k.box(0.22, 0.003, 0.18, M.rubber('#3a3d44'), 0.33, y, 0.1);
    k.sphere(0.03, M.plastic('#f2f2f2'), 0.33, y + 0.014, 0.1, 1, 0.5, 1.6, 12);
    // mug with pencils
    k.cyl(0.035, 0.09, M.ceramic(PAL.terracotta), -0.52, y, -0.17, 0.04, 16);
    for (let i = 0; i < 3; i++) {
      k.rod([-0.52 + (i - 1) * 0.012, y + 0.02, -0.17], [-0.52 + (i - 1) * 0.03, y + 0.16, -0.17 + (i - 1) * 0.02], 0.004, M.matte(['#d6a544', '#8ea5b7', '#c7775a'][i]));
    }
  }
  return k.g;
}

function drawDesk(ctx: Ctx2D, c: Colors, computer: boolean): void {
  sym(ctx, () => {
    D.rr(ctx, 0, 0, DESK_W, DESK_D, 0.02, tint(c.top, 0.35));
    if (computer) {
      D.rr(ctx, 0, -0.2, 0.615, 0.03, 0.006, '#4a4d52');
      D.rr(ctx, 0, -0.2, 0.24, 0.17, 0.01, null, INK_SOFT, LINE_THIN);
      D.rr(ctx, -0.04, 0.1, 0.42, 0.13, 0.01, '#eceef0', undefined, LINE_THIN);
      D.rr(ctx, 0.33, 0.1, 0.22, 0.18, 0.01, '#d3d6da', INK_SOFT, LINE_THIN);
      D.ellipse(ctx, 0.33, 0.1, 0.03, 0.048, '#ffffff', undefined, LINE_THIN);
      D.circle(ctx, -0.52, -0.17, 0.04, tint(PAL.terracotta, 0.3), undefined, LINE_THIN);
    }
  });
}

const DESK_COLORS = [slot('top', 'משטח', PAL.oak), slot('legs', 'רגליים', PAL.white)];

const desk: FurnitureDef = {
  id: 'desk',
  name: 'שולחן עבודה',
  category: 'office',
  size: { w: DESK_W, d: DESK_D, h: DESK_H },
  colors: DESK_COLORS,
  build: ({ colors }) => buildDesk(colors, false),
  draw2d: (ctx, colors) => drawDesk(ctx, colors, false),
};

const deskComputer: FurnitureDef = {
  id: 'desk-computer',
  name: 'שולחן עבודה עם מחשב',
  category: 'office',
  size: { w: DESK_W, d: DESK_D, h: 1.24 },
  colors: DESK_COLORS,
  build: ({ colors }) => buildDesk(colors, true),
  draw2d: (ctx, colors) => drawDesk(ctx, colors, true),
};

const OFFICE_SEAT = 0.5;

const officeChair: FurnitureDef = {
  id: 'office-chair',
  name: 'כיסא משרדי',
  category: 'office',
  size: { w: 0.66, d: 0.66, h: 1.04 },
  colors: [slot('fabric', 'ריפוד', PAL.charcoal), slot('frame', 'מסגרת', PAL.black)],
  seats: [{ x: 0, z: 0.02, height: OFFICE_SEAT, facing: 0, kind: 'sit' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const fab = M.fabric(c.fabric);
    const pl = M.plastic(c.frame);
    const chrome = M.chrome();
    // five-star base with casters
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + Math.PI / 2;
      const cx = Math.cos(a);
      const sz = Math.sin(a);
      k.rod([cx * 0.04, 0.115, sz * 0.04], [cx * 0.29, 0.075, sz * 0.29], 0.018, pl, 0.014, 8);
      k.cyl(0.008, 0.04, pl, cx * 0.29, 0.05, sz * 0.29, 0.008, 8);
      const wheel = k.cyl(0.028, 0.03, M.rubber(), 0, 0, 0, 0.028, 12);
      wheel.rotation.set(Math.PI / 2, 0, 0);
      wheel.rotation.order = 'YXZ';
      wheel.rotation.y = -a;
      wheel.position.set(cx * 0.29, 0.028, sz * 0.29);
    }
    k.cyl(0.045, 0.05, pl, 0, 0.09, 0, 0.035, 14);
    k.cyl(0.022, 0.26, chrome, 0, 0.13, 0, 0.022, 14);
    // seat
    k.rbox(0.36, 0.035, 0.36, 0.012, pl, 0, 0.385, 0.01, 1);
    k.cushion(0.5, 0.085, 0.48, fab, 0, OFFICE_SEAT - 0.085, 0.02, 0.04, 0.012);
    // back: spine + curved upholstered panel
    k.rod([0, 0.4, -0.16], [0, 0.56, -0.27], 0.02, pl, 0.018, 8);
    k.rod([0, 0.56, -0.27], [0, 0.82, -0.3], 0.018, pl, 0.016, 8);
    const back = k.geo(arcPanelGeo(0.45, 0.04, 0.5, 0.98, 10), fab, 0, 0.53, -0.245);
    back.rotation.x = -0.1;
    // arm rests
    for (const s of [-1, 1]) {
      k.tube(
        [
          [s * 0.2, 0.41, -0.02],
          [s * 0.275, 0.45, -0.02],
          [s * 0.292, 0.56, -0.02],
          [s * 0.292, 0.675, -0.02],
        ],
        0.012,
        pl,
        { seg: 14, radial: 8 },
      );
      k.rbox(0.055, 0.025, 0.25, 0.01, pl, s * 0.292, 0.675, 0.02, 1);
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + Math.PI / 2;
        D.line(ctx, 0, 0, Math.cos(a) * 0.3, Math.sin(a) * 0.3, INK_SOFT, 0.014);
        D.circle(ctx, Math.cos(a) * 0.3, Math.sin(a) * 0.3, 0.022, '#ffffff', INK_SOFT, 0.007);
      }
      D.rr(ctx, 0, 0.02, 0.5, 0.48, 0.07, tint(c.fabric, 0.55));
      for (const s of [-1, 1]) D.rr(ctx, s * 0.292, 0.02, 0.055, 0.25, 0.02, tint(c.frame, 0.6), undefined, LINE_THIN);
      ctx.beginPath();
      ctx.moveTo(-0.215, -0.24);
      ctx.quadraticCurveTo(0, -0.345, 0.215, -0.24);
      ctx.lineTo(0.215, -0.2);
      ctx.quadraticCurveTo(0, -0.3, -0.215, -0.2);
      ctx.closePath();
      ctx.fillStyle = tint(c.fabric, 0.35);
      ctx.fill();
      ctx.stroke();
    }),
};

const filingCabinet: FurnitureDef = {
  id: 'filing-cabinet',
  name: 'ארונית תיוק',
  category: 'office',
  size: { w: 0.46, d: 0.6, h: 1.02 },
  colors: [slot('body', 'גוף', PAL.dustyBlue)],
  build: ({ colors: c }) => {
    const k = new Kit();
    const m = M.paint(c.body, 0.35);
    const info = cabinet(k, {
      w: 0.46,
      h: 1.02,
      d: 0.6,
      body: m,
      front: m,
      cols: [[{ kind: 'drawer' }, { kind: 'drawer' }, { kind: 'drawer' }]],
      base: 'plinth',
      baseH: 0.04,
      handle: 'bar',
      handleMat: M.steel(),
    });
    // label holders
    for (let i = 0; i < 3; i++) {
      const y = 0.04 + ((1.02 - 0.04) / 3) * (i + 0.5) + 0.02;
      k.box(0.09, 0.035, 0.003, M.paint('#fbfbf8'), 0, y - 0.11, info.frontZ + 0.001);
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 0.46, 0.6, 0.006, tint(c.body, 0.4));
      D.line(ctx, -0.23, 0.27, 0.23, 0.27, INK_SOFT);
      D.line(ctx, -0.08, 0.288, 0.08, 0.288, INK_SOFT, 0.012);
    }),
};

const SH_W = 0.8;
const SH_D = 0.38;
const SH_H = 1.18;

const officeShelf: FurnitureDef = {
  id: 'office-shelf',
  name: 'כוורת מדפים',
  category: 'office',
  size: { w: SH_W, d: SH_D, h: SH_H },
  colors: [slot('body', 'גוף', PAL.white), slot('boxes', 'קופסאות', PAL.sage)],
  build: ({ colors: c }) => {
    const k = new Kit();
    const m = M.paint(c.body, 0.5);
    const t = 0.036;
    const ti = 0.018;
    const cols = 2;
    const rows = 3;
    const cw = (SH_W - 2 * t - ti * (cols - 1)) / cols;
    const ch = (SH_H - 2 * t - ti * (rows - 1)) / rows;
    for (const s of [-1, 1]) k.rbox(t, SH_H, SH_D, 0.003, m, s * (SH_W / 2 - t / 2), 0, 0, 1);
    k.box(SH_W - 2 * t, t, SH_D - 0.002, m, 0, 0, 0);
    k.box(SH_W - 2 * t, t, SH_D - 0.002, m, 0, SH_H - t, 0);
    k.box(ti, SH_H - 2 * t, SH_D - 0.004, m, 0, t, 0);
    for (let r = 1; r < rows; r++) k.box(SH_W - 2 * t, ti, SH_D - 0.004, m, 0, t + r * (ch + ti) - ti, 0);
    const cell = (cx: number, r: number): [number, number] => [-SH_W / 2 + t + cw / 2 + cx * (cw + ti), t + r * (ch + ti)];
    // storage boxes
    const boxM = M.fabric(c.boxes, 10);
    for (const [cx, r] of [
      [0, 0],
      [1, 0],
      [1, 1],
    ]) {
      const [x, y] = cell(cx, r);
      k.rbox(cw - 0.02, ch - 0.03, SH_D - 0.03, 0.012, boxM, x, y, 0.005, 1);
      k.box(0.09, 0.022, 0.004, M.matte('#3a3531'), x, y + ch - 0.11, SH_D / 2 - 0.009);
    }
    // binders
    const [bx, by] = cell(0, 1);
    const cols3 = ['#52606d', '#e6dfd0', '#c7775a', '#52606d', '#9bae8a'];
    cols3.forEach((col, i) => {
      k.box(0.055, ch - 0.05, 0.28, M.matte(col), bx - cw / 2 + 0.04 + i * 0.058, by, 0.02);
      k.box(0.03, 0.07, 0.002, M.paint('#fbfbf8'), bx - cw / 2 + 0.04 + i * 0.058, by + 0.1, 0.161);
    });
    // top row: books + small plant
    const [tx, ty] = cell(0, 2);
    for (let i = 0; i < 6; i++) {
      k.box(0.03, 0.2 + (i % 3) * 0.025, 0.2, M.matte(['#7a8fa3', '#d6a544', '#e6dfd0', '#a25d4a', '#6f7f6a', '#3f4f5f'][i]), tx - cw / 2 + 0.03 + i * 0.032, ty, 0.03);
    }
    const [px, py] = cell(1, 2);
    k.cyl(0.05, 0.1, M.ceramic(PAL.white), px, py, 0.02, 0.06, 16);
    k.sphere(0.085, M.foliage(PAL.leaf), px, py + 0.15, 0.02, 1, 0.8, 1, 10);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, SH_W, SH_D, 0.004, tint(c.body, 0.5));
      D.line(ctx, 0, -SH_D / 2, 0, SH_D / 2, INK_SOFT);
      D.rr(ctx, -0.19, 0.005, 0.33, 0.32, 0.01, tint(c.boxes, 0.4), INK_SOFT, LINE_THIN);
      D.rr(ctx, 0.19, 0.005, 0.33, 0.32, 0.01, tint(c.boxes, 0.4), INK_SOFT, LINE_THIN);
    }),
};

export const OFFICE: FurnitureDef[] = [desk, deskComputer, officeChair, filingCabinet, officeShelf];
