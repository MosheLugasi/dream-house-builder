import type { FurnitureDef } from '../types';
import { D, INK_SOFT, Kit, LINE_THIN, M, PAL, arcPanelGeo, ellipseShape, roundedRectShape, sym, tint } from '../kit';
import { cabinet, slot } from './_parts';

const diningTable: FurnitureDef = {
  id: 'dining-table',
  name: 'שולחן אוכל ל-6',
  category: 'dining',
  size: { w: 1.8, d: 0.9, h: 0.75 },
  colors: [slot('top', 'משטח', PAL.oak), slot('legs', 'רגליים', PAL.oak)],
  build: ({ colors: c }) => {
    const k = new Kit();
    const top = M.wood(c.top);
    const leg = M.wood(c.legs);
    const w = 1.8;
    const d = 0.9;
    k.slab(roundedRectShape(w - 0.012, d - 0.012, 0.03), 0.036, top, 0, 0.714, 0, 0.006);
    // apron
    const ax = w / 2 - 0.13;
    const az = d / 2 - 0.11;
    for (const s of [-1, 1]) {
      k.box(ax * 2, 0.075, 0.022, leg, 0, 0.64, s * az);
      k.box(0.022, 0.075, az * 2, leg, s * ax, 0.64, 0);
    }
    // tapered, slightly splayed legs
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        k.rod([sx * (ax + 0.035), 0.0015, sz * (az + 0.035)], [sx * (ax - 0.005), 0.716, sz * (az - 0.005)], 0.02, leg, 0.036, 14);
      }
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 1.8, 0.9, 0.03, tint(c.top, 0.35));
      D.rr(ctx, 0, 0, 1.8 - 0.14, 0.9 - 0.14, 0.02, null, INK_SOFT, LINE_THIN);
    }),
};

const roundTable: FurnitureDef = {
  id: 'dining-table-round',
  name: 'שולחן אוכל עגול ל-4',
  category: 'dining',
  size: { w: 1.1, d: 1.1, h: 0.75 },
  colors: [slot('top', 'משטח', PAL.oakLight), slot('base', 'בסיס', PAL.white)],
  build: ({ colors: c }) => {
    const k = new Kit();
    const r = 0.55;
    k.slab(ellipseShape(r - 0.006, r - 0.006), 0.03, M.wood(c.top), 0, 0.72, 0, 0.006, 28);
    // tulip pedestal
    k.lathe(
      [
        [0, 0],
        [0.3, 0],
        [0.305, 0.008],
        [0.29, 0.018],
        [0.2, 0.03],
        [0.11, 0.055],
        [0.062, 0.11],
        [0.045, 0.22],
        [0.04, 0.45],
        [0.048, 0.6],
        [0.085, 0.68],
        [0.17, 0.715],
        [0.2, 0.722],
        [0, 0.722],
      ],
      M.paint(c.base, 0.3),
      0,
      0,
      0,
      32,
    );
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.circle(ctx, 0, 0, 0.55, tint(c.top, 0.35));
      D.circle(ctx, 0, 0, 0.3, null, INK_SOFT, LINE_THIN);
    }),
};

const CHAIR_SEAT = 0.46;

const diningChair: FurnitureDef = {
  id: 'dining-chair',
  name: 'כיסא אוכל',
  category: 'dining',
  size: { w: 0.46, d: 0.52, h: 0.82 },
  colors: [slot('wood', 'עץ', PAL.oak), slot('seat', 'ריפוד', PAL.sage)],
  seats: [{ x: 0, z: 0.02, height: CHAIR_SEAT, facing: 0, kind: 'sit' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const wood = M.wood(c.wood);
    const fab = M.fabric(c.seat);
    const sw = 0.43;
    const zs0 = -0.19; // seat back edge
    const zs1 = 0.245; // seat front edge
    // seat frame + upholstered pad
    k.rbox(sw - 0.02, 0.03, zs1 - zs0 - 0.02, 0.008, wood, 0, 0.395, (zs0 + zs1) / 2, 1);
    k.cushion(sw, 0.045, zs1 - zs0, fab, 0, CHAIR_SEAT - 0.05, (zs0 + zs1) / 2, 0.02, 0.012);
    // front legs
    for (const s of [-1, 1]) {
      k.rod([s * 0.195, 0.001, 0.222], [s * 0.18, 0.4, 0.2], 0.012, wood, 0.018, 12);
      // rear leg continues up into the back post, leaning backwards
      k.rod([s * 0.195, 0.002, -0.235], [s * 0.185, 0.42, -0.175], 0.012, wood, 0.018, 12);
      k.rod([s * 0.185, 0.42, -0.175], [s * 0.185, 0.8, -0.236], 0.018, wood, 0.013, 12);
    }
    // side stretchers
    for (const s of [-1, 1]) k.rod([s * 0.186, 0.2, 0.208], [s * 0.19, 0.2, -0.205], 0.008, wood);
    // curved back rest
    const back = k.geo(arcPanelGeo(0.55, 0.016, 0.17, 0.72), wood, 0, 0.635, -0.2);
    back.rotation.x = -0.16;
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0.03, 0.43, 0.44, 0.05, tint(c.seat, 0.4));
      // back rest
      ctx.beginPath();
      ctx.moveTo(-0.21, -0.19);
      ctx.quadraticCurveTo(0, -0.285, 0.21, -0.19);
      ctx.lineTo(0.21, -0.155);
      ctx.quadraticCurveTo(0, -0.25, -0.21, -0.155);
      ctx.closePath();
      ctx.fillStyle = tint(c.wood, 0.2);
      ctx.fill();
      ctx.stroke();
    }),
};

const STOOL_SEAT = 0.66;

const barStool: FurnitureDef = {
  id: 'bar-stool',
  name: 'כיסא בר',
  category: 'dining',
  size: { w: 0.44, d: 0.44, h: 0.86 },
  colors: [slot('seat', 'מושב', PAL.walnut), slot('frame', 'מסגרת', PAL.black)],
  seats: [{ x: 0, z: 0.01, height: STOOL_SEAT, facing: 0, kind: 'sit' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const metal = M.metal(c.frame, 0.45, 0.8);
    const seat = M.leather(c.seat);
    k.lathe(
      [
        [0, 0.61],
        [0.165, 0.61],
        [0.185, 0.625],
        [0.185, 0.645],
        [0.17, 0.66],
        [0.1, 0.668],
        [0, 0.668],
      ],
      seat,
      0,
      0,
      0.01,
      28,
    );
    const top = 0.13;
    const bot = 0.2;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        k.rod([sx * bot, 0.003, sz * bot + 0.01], [sx * top, 0.615, sz * top + 0.01], 0.011, metal, 0.011);
      }
    }
    // foot rest ring (square with rounded look)
    const fy = 0.24;
    const f = top + (bot - top) * (1 - fy / 0.615);
    for (const s of [-1, 1]) {
      k.rod([-f, fy, s * f + 0.01], [f, fy, s * f + 0.01], 0.008, metal);
      k.rod([s * f, fy, -f + 0.01], [s * f, fy, f + 0.01], 0.008, metal);
    }
    // low back hoop
    k.tube(
      [
        [-0.15, 0.62, -0.09],
        [-0.165, 0.78, -0.15],
        [-0.1, 0.845, -0.2],
        [0, 0.85, -0.211],
        [0.1, 0.845, -0.2],
        [0.165, 0.78, -0.15],
        [0.15, 0.62, -0.09],
      ],
      0.009,
      metal,
      { seg: 36, radial: 8 },
    );
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0.01, 0.42, 0.42, 0.06, null, INK_SOFT, LINE_THIN);
      D.circle(ctx, 0, 0.01, 0.185, tint(c.seat, 0.4));
      D.arc(ctx, 0, 0.0, 0.205, Math.PI * 1.15, Math.PI * 1.85, undefined, 0.02);
    }),
};

const sideboard: FurnitureDef = {
  id: 'sideboard',
  name: 'מזנון',
  category: 'dining',
  size: { w: 1.6, d: 0.45, h: 0.8 },
  colors: [slot('wood', 'גוף', PAL.walnut), slot('fronts', 'חזיתות', PAL.walnut)],
  build: ({ colors: c }) => {
    const k = new Kit();
    const wood = M.wood(c.wood);
    cabinet(k, {
      w: 1.6,
      h: 0.8,
      d: 0.45,
      body: wood,
      front: M.wood(c.fronts),
      cols: [
        [{ kind: 'door', hinge: 'l' }],
        [{ kind: 'drawer' }, { kind: 'drawer' }, { kind: 'drawer' }],
        [{ kind: 'door', hinge: 'r' }],
      ],
      base: 'legs',
      baseH: 0.2,
      baseMat: wood,
      top: wood,
      topT: 0.024,
      handle: 'knob',
      handleMat: M.brass(),
      doorHandle: 'mid',
    });
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 1.6, 0.45, 0.008, tint(c.wood, 0.35));
      D.line(ctx, -0.8, 0.19, 0.8, 0.19, INK_SOFT);
      D.line(ctx, -0.267, 0.19, -0.267, 0.225, INK_SOFT);
      D.line(ctx, 0.267, 0.19, 0.267, 0.225, INK_SOFT);
    }),
};

export const DINING: FurnitureDef[] = [diningTable, roundTable, diningChair, barStool, sideboard];
