import * as THREE from 'three';
import type { FurnitureDef } from '../types';
import { D, INK_SOFT, Kit, LINE_THIN, M, PAL, darken, roundedRectPath, roundedRectShape, sym, tint, type Ctx2D } from '../kit';
import { barHandle, cabinet, faucet, slot, type Front } from './_parts';

type Colors = Record<string, string>;

const BASE_H = 0.9;
const BASE_D = 0.6;
const TOP_T = 0.03;
const FRONT_Z = BASE_D / 2 - 0.03;

const KITCHEN_COLORS = [slot('fronts', 'חזיתות', PAL.sage), slot('top', 'משטח', PAL.stone)];

function baseUnit(k: Kit, c: Colors, w: number, cols: Front[][], extra: { hollow?: boolean; noTop?: boolean } = {}): void {
  cabinet(k, {
    w,
    h: BASE_H,
    d: BASE_D,
    body: M.paint(c.fronts),
    front: M.paint(c.fronts),
    cols,
    base: 'plinth',
    top: extra.noTop ? undefined : M.stone(c.top, 0.35),
    topT: TOP_T,
    handle: 'bar',
    hollow: extra.hollow,
  });
}

/** plan symbol shared by base units: worktop + front line */
function drawBase(ctx: Ctx2D, c: Colors, w: number, d = BASE_D): void {
  D.rr(ctx, 0, 0, w, d, 0.004, tint(c.top, 0.3));
  D.line(ctx, -w / 2, d / 2 - 0.03, w / 2, d / 2 - 0.03, INK_SOFT);
}

const baseCabinet: FurnitureDef = {
  id: 'kitchen-base',
  name: 'ארון מטבח תחתון 60',
  category: 'kitchen',
  size: { w: 0.6, d: BASE_D, h: BASE_H },
  colors: KITCHEN_COLORS,
  build: ({ colors: c }) => {
    const k = new Kit();
    baseUnit(k, c, 0.6, [[{ kind: 'drawer', weight: 1 }, { kind: 'door', weight: 3.6, hinge: 'l' }]]);
    return k.g;
  },
  draw2d: (ctx, c) => sym(ctx, () => drawBase(ctx, c, 0.6)),
};

const drawerCabinet: FurnitureDef = {
  id: 'kitchen-drawers',
  name: 'ארון מגירות 60',
  category: 'kitchen',
  size: { w: 0.6, d: BASE_D, h: BASE_H },
  colors: KITCHEN_COLORS,
  build: ({ colors: c }) => {
    const k = new Kit();
    baseUnit(k, c, 0.6, [[{ kind: 'drawer', weight: 1 }, { kind: 'drawer', weight: 1.8 }, { kind: 'drawer', weight: 1.8 }]]);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      drawBase(ctx, c, 0.6);
      D.line(ctx, -0.1, 0.285, 0.1, 0.285, INK_SOFT, 0.012);
    }),
};

const SINK_W = 0.8;

const sinkCabinet: FurnitureDef = {
  id: 'kitchen-sink',
  name: 'ארון כיור',
  category: 'kitchen',
  size: { w: SINK_W, d: BASE_D, h: 1.2 },
  colors: KITCHEN_COLORS,
  actions: [{ kind: 'water', at: { x: 0, y: BASE_H + 0.17, z: 0.02 - 0.2 - 0.045 + 0.19 } }],
  build: ({ colors: c }) => {
    const k = new Kit();
    baseUnit(
      k,
      c,
      SINK_W,
      [
        [{ kind: 'panel', weight: 1 }, { kind: 'door', weight: 3.6, hinge: 'l' }],
        [{ kind: 'panel', weight: 1 }, { kind: 'door', weight: 3.6, hinge: 'r' }],
      ],
      { hollow: true, noTop: true },
    );
    // worktop with a cut-out
    const bw = 0.5;
    const bd = 0.4;
    const bz = 0.02; // bowl center (towards the front)
    const top = roundedRectShape(SINK_W, BASE_D, 0.004);
    top.holes.push(roundedRectPath(new THREE.Path(), bw, bd, 0.06, 0, -bz));
    k.slab(top, TOP_T, M.stone(c.top, 0.35), 0, BASE_H - TOP_T, 0);
    // stainless bowl: rim, walls, bottom
    const steel = M.steel();
    const rim = roundedRectShape(bw + 0.03, bd + 0.03, 0.07, 0, -bz);
    rim.holes.push(roundedRectPath(new THREE.Path(), bw - 0.012, bd - 0.012, 0.055, 0, -bz));
    k.slab(rim, 0.004, steel, 0, BASE_H - 0.001, 0);
    const wall = roundedRectShape(bw + 0.004, bd + 0.004, 0.062, 0, -bz);
    wall.holes.push(roundedRectPath(new THREE.Path(), bw - 0.012, bd - 0.012, 0.055, 0, -bz));
    k.slab(wall, 0.18, steel, 0, BASE_H - 0.18, 0);
    k.slab(roundedRectShape(bw, bd, 0.06, 0, -bz), 0.004, steel, 0, BASE_H - 0.182, 0);
    k.disc(0.028, 0.003, M.metal('#6f7376', 0.3), 0, BASE_H - 0.178, bz, 16);
    faucet(k, 0, BASE_H, bz - bd / 2 - 0.045, 0.28, 0.19);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      drawBase(ctx, c, SINK_W);
      D.rr(ctx, 0, 0.02, 0.5, 0.4, 0.06, '#eef1f3');
      D.rr(ctx, 0, 0.02, 0.44, 0.34, 0.045, null, INK_SOFT, LINE_THIN);
      D.circle(ctx, 0, 0.02, 0.025, null, INK_SOFT, LINE_THIN);
      // faucet
      D.circle(ctx, 0, -0.225, 0.028, '#dfe3e6');
      D.rr(ctx, 0, -0.14, 0.03, 0.17, 0.015, '#dfe3e6');
    }),
};

const stove: FurnitureDef = {
  id: 'kitchen-stove',
  name: 'תנור וכיריים',
  category: 'kitchen',
  size: { w: 0.6, d: BASE_D, h: 0.91 },
  colors: [slot('body', 'גוף', '#c9ccce'), slot('top', 'משטח', PAL.stone)],
  actions: [{ kind: 'cook', at: { x: -0.135, y: BASE_H + 0.12, z: 0.11 } }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const w = 0.6;
    const body = M.metal(c.body, 0.4, 0.9);
    const glass = M.screen('#101114');
    const steel = M.steel();
    // carcass + plinth
    k.box(w, BASE_H - 0.1 - TOP_T, BASE_D - 0.05, body, 0, 0.1, -0.025);
    k.box(w - 0.002, 0.1, BASE_D - 0.1, M.matte('#2f3032'), 0, 0, -0.05);
    // control strip with knobs
    const fz = FRONT_Z;
    k.rbox(w - 0.004, 0.105, 0.02, 0.004, body, 0, 0.762, fz - 0.01, 1);
    for (const x of [-0.21, -0.13, 0.13, 0.21]) {
      const kn = k.cyl(0.018, 0.022, M.plastic('#26272a'), x, 0, 0, 0.016, 16);
      kn.rotation.x = Math.PI / 2;
      kn.position.set(x, 0.815, fz + 0.011);
    }
    k.box(0.1, 0.03, 0.002, glass, 0, 0.8, fz + 0.0005);
    // oven door: steel frame, dark glass, bar handle
    k.rbox(w - 0.004, 0.655, 0.02, 0.004, body, 0, 0.103, fz - 0.01, 1);
    k.rbox(w - 0.09, 0.44, 0.004, 0.002, glass, 0, 0.17, fz + 0.001, 1);
    barHandle(k, [-0.23, 0.7, fz + 0.026], [0.23, 0.7, fz + 0.026], fz, steel, 0.007);
    // worktop + glass hob
    k.rbox(w, TOP_T, BASE_D, 0.004, M.stone(c.top, 0.35), 0, BASE_H - TOP_T, 0, 1);
    k.rbox(0.56, 0.006, 0.5, 0.003, glass, 0, BASE_H - 0.001, -0.005, 1);
    const ringM = M.metal('#8a8d90', 0.5, 0.3);
    const zones: Array<[number, number, number]> = [
      [-0.135, -0.125, 0.085],
      [0.135, -0.125, 0.07],
      [-0.135, 0.11, 0.07],
      [0.135, 0.11, 0.095],
    ];
    for (const [x, z, r] of zones) {
      const ring = new THREE.RingGeometry(r - 0.004, r, 28);
      ring.rotateX(-Math.PI / 2);
      k.geo(ring, ringM, x, BASE_H + 0.0056, z).castShadow = false;
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      drawBase(ctx, c, 0.6);
      D.rr(ctx, 0, -0.005, 0.56, 0.5, 0.01, '#d5d8dc');
      for (const [x, z, r] of [
        [-0.135, -0.125, 0.085],
        [0.135, -0.125, 0.07],
        [-0.135, 0.11, 0.07],
        [0.135, 0.11, 0.095],
      ]) {
        D.circle(ctx, x, z, r, '#f3f4f5', undefined, LINE_THIN);
        D.circle(ctx, x, z, r * 0.45, null, INK_SOFT, 0.007);
      }
    }),
};

const dishwasher: FurnitureDef = {
  id: 'dishwasher',
  name: 'מדיח כלים',
  category: 'kitchen',
  size: { w: 0.6, d: BASE_D, h: BASE_H },
  colors: [slot('body', 'חזית', '#c9ccce'), slot('top', 'משטח', PAL.stone)],
  build: ({ colors: c }) => {
    const k = new Kit();
    const w = 0.6;
    const body = M.metal(c.body, 0.4, 0.9);
    const fz = FRONT_Z;
    k.box(w, BASE_H - 0.1 - TOP_T, BASE_D - 0.05, M.paint('#e9e9e7'), 0, 0.1, -0.025);
    k.box(w - 0.002, 0.1, BASE_D - 0.1, M.matte('#2f3032'), 0, 0, -0.05);
    k.rbox(w - 0.004, 0.64, 0.02, 0.004, body, 0, 0.103, fz - 0.01, 1);
    k.rbox(w - 0.004, 0.118, 0.02, 0.004, M.screen('#15161a'), 0, 0.749, fz - 0.01, 1);
    k.box(0.07, 0.02, 0.002, M.glow('#7fd0ff', 0.9, '#0b2a3a'), 0.2, 0.8, fz + 0.0005);
    barHandle(k, [-0.22, 0.705, fz + 0.026], [0.22, 0.705, fz + 0.026], fz, M.steel(), 0.007);
    k.rbox(w, TOP_T, BASE_D, 0.004, M.stone(c.top, 0.35), 0, BASE_H - TOP_T, 0, 1);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      drawBase(ctx, c, 0.6);
      D.rr(ctx, 0, -0.02, 0.44, 0.4, 0.02, null, INK_SOFT, LINE_THIN);
      ctx.setLineDash([0.03, 0.025]);
      D.line(ctx, -0.22, -0.02, 0.22, -0.02, INK_SOFT);
      D.line(ctx, 0, -0.22, 0, 0.18, INK_SOFT);
    }),
};

const fridge: FurnitureDef = {
  id: 'fridge',
  name: 'מקרר',
  category: 'kitchen',
  size: { w: 0.72, d: 0.7, h: 1.85 },
  colors: [slot('body', 'גוף', '#c5c8cb')],
  actions: [{ kind: 'snack' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const w = 0.72;
    const d = 0.7;
    const h = 1.85;
    const body = M.metal(c.body, 0.42, 0.85);
    const doorT = 0.06;
    const fz = d / 2 - 0.035; // door front plane (handles project beyond)
    k.rbox(w, h - 0.05, d - 0.035 - doorT - 0.004, 0.006, M.metal(darken(c.body, 0.25), 0.5, 0.6), 0, 0.05, -d / 2 + (d - 0.035 - doorT - 0.004) / 2, 1);
    k.box(w - 0.04, 0.05, d - 0.2, M.matte('#27282a'), 0, 0, -0.03);
    // dark gasket gap plate
    k.box(w - 0.01, h - 0.07, 0.004, M.matte('#222325'), 0, 0.06, fz - doorT - 0.002);
    // freezer drawer (bottom) + fridge door (top)
    const split = 0.66;
    k.rbox(w - 0.003, split - 0.058, doorT, 0.012, body, 0, 0.055, fz - doorT / 2);
    k.rbox(w - 0.003, h - split - 0.006, doorT, 0.012, body, 0, split + 0.004, fz - doorT / 2);
    const steel = M.steel();
    barHandle(k, [-w / 2 + 0.06, split + 0.08, fz + 0.03], [-w / 2 + 0.06, split + 0.7, fz + 0.03], fz, steel, 0.009);
    barHandle(k, [-0.2, split - 0.07, fz + 0.03], [0.2, split - 0.07, fz + 0.03], fz, steel, 0.009);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, -0.035, 0.72, 0.63, 0.01, tint(c.body, 0.5));
      D.rr(ctx, 0, 0.285, 0.72, 0.06, 0.012, tint(c.body, 0.3));
      D.line(ctx, -0.3, 0.335, -0.3, 0.345, undefined, 0.02);
      // diagonal = tall appliance convention
      D.line(ctx, -0.36, -0.35, 0.36, 0.255, INK_SOFT);
    }),
};

const island: FurnitureDef = {
  id: 'kitchen-island',
  name: 'אי מטבח',
  category: 'kitchen',
  size: { w: 1.8, d: 0.95, h: BASE_H },
  colors: KITCHEN_COLORS,
  build: ({ colors: c }) => {
    const k = new Kit();
    const w = 1.8;
    const d = 0.95;
    const bodyD = 0.62;
    const bz = d / 2 - bodyD / 2 - 0.02;
    const drawers: Front[] = [{ kind: 'drawer', weight: 1 }, { kind: 'drawer', weight: 1.8 }, { kind: 'drawer', weight: 1.8 }];
    const door = (hinge: 'l' | 'r'): Front[] => [{ kind: 'drawer', weight: 1 }, { kind: 'door', weight: 3.6, hinge }];
    cabinet(
      k,
      {
        w: w - 0.1,
        h: BASE_H - 0.04,
        d: bodyD,
        body: M.paint(c.fronts),
        front: M.paint(c.fronts),
        cols: [door('l'), drawers, door('r')],
        base: 'plinth',
        handle: 'bar',
      },
      0,
      0,
      bz,
    );
    // back panel flush with the carcass, facing the stools
    k.rbox(w - 0.1, BASE_H - 0.04 - 0.1, 0.018, 0.003, M.paint(c.fronts), 0, 0.1, bz - bodyD / 2 - 0.009, 1);
    // thick stone top with breakfast overhang at the back
    k.rbox(w, 0.04, d, 0.006, M.stone(c.top, 0.3), 0, BASE_H - 0.04, 0, 1);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 1.8, 0.95, 0.008, tint(c.top, 0.3));
      ctx.setLineDash([0.04, 0.03]);
      D.rr(ctx, 0, 0.145, 1.7, 0.62, 0, null, INK_SOFT, LINE_THIN);
    }),
};

const wallCabinet: FurnitureDef = {
  id: 'kitchen-wall-cabinet',
  name: 'ארון מטבח עליון 60',
  category: 'kitchen',
  size: { w: 0.6, d: 0.35, h: 0.72 },
  mount: 'wall',
  elevation: 1.45,
  colors: [slot('fronts', 'חזיתות', PAL.white)],
  build: ({ colors: c }) => {
    const k = new Kit();
    cabinet(k, {
      w: 0.6,
      h: 0.72,
      d: 0.35,
      body: M.paint(c.fronts),
      front: M.paint(c.fronts),
      cols: [[{ kind: 'door', hinge: 'l' }], [{ kind: 'door', hinge: 'r' }]],
      base: 'none',
      handle: 'bar',
      doorHandle: 'bottom',
    });
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      ctx.setLineDash([0.05, 0.035]);
      D.rr(ctx, 0, 0, 0.6, 0.35, 0, tint(c.fronts, 0.2) + 'aa', INK_SOFT);
      D.line(ctx, -0.3, -0.175, 0.3, 0.175, INK_SOFT);
      D.line(ctx, -0.3, 0.175, 0.3, -0.175, INK_SOFT);
    }),
};

const tallCabinet: FurnitureDef = {
  id: 'kitchen-tall',
  name: 'ארון מזווה גבוה',
  category: 'kitchen',
  size: { w: 0.6, d: BASE_D, h: 2.17 },
  colors: [slot('fronts', 'חזיתות', PAL.sage)],
  build: ({ colors: c }) => {
    const k = new Kit();
    cabinet(k, {
      w: 0.6,
      h: 2.17,
      d: BASE_D,
      body: M.paint(c.fronts),
      front: M.paint(c.fronts),
      cols: [[{ kind: 'door', weight: 1.1, hinge: 'l' }, { kind: 'door', weight: 2, hinge: 'l' }]],
      base: 'plinth',
      handle: 'bar',
      doorHandle: 'mid',
    });
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 0.6, BASE_D, 0.004, tint(c.fronts, 0.4));
      D.line(ctx, -0.3, 0.27, 0.3, 0.27, INK_SOFT);
      D.line(ctx, -0.3, -0.3, 0.3, 0.27, INK_SOFT);
    }),
};

const rangeHood: FurnitureDef = {
  id: 'range-hood',
  name: 'קולט אדים',
  category: 'kitchen',
  size: { w: 0.6, d: 0.48, h: 1.05 },
  mount: 'wall',
  elevation: 1.65,
  colors: [slot('body', 'גוף', '#c9ccce')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const steel = M.metal(c.body, 0.36, 0.95);
    const w = 0.6;
    const d = 0.48;
    // canopy: flat lip + tapered pyramid
    k.rbox(w, 0.05, d, 0.004, steel, 0, 0, 0, 1);
    k.box(w - 0.06, 0.004, d - 0.08, M.metal('#6d7073', 0.6, 0.6), 0, -0.0005, 0.005).position.y = 0.0025;
    const fr = new THREE.CylinderGeometry(0.5, 1, 1, 4, 1);
    fr.rotateY(Math.PI / 4);
    // unit frustum: bottom half-diagonal 1 -> square side sqrt(2)
    const m = k.geo(fr, steel, 0, 0, 0);
    m.scale.set(w / Math.SQRT2, 0.13, d / Math.SQRT2);
    m.position.set(0, 0.05 + 0.065, 0);
    // chimney to the ceiling, against the wall
    const cw = 0.26;
    const cd = 0.22;
    k.rbox(cw, 1.05 - 0.17, cd, 0.004, steel, 0, 0.17, -d / 2 + cd / 2, 1);
    // light strip
    k.box(0.3, 0.004, 0.03, M.glow('#fff3da', 1.2), 0, 0.001, 0.14).castShadow = false;
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      ctx.setLineDash([0.05, 0.035]);
      D.rr(ctx, 0, 0, 0.6, 0.48, 0, tint(c.body, 0.5) + 'aa', INK_SOFT);
      D.rr(ctx, 0, -0.13, 0.26, 0.22, 0, null, INK_SOFT, LINE_THIN);
    }),
};

export const KITCHEN: FurnitureDef[] = [
  baseCabinet,
  drawerCabinet,
  sinkCabinet,
  stove,
  dishwasher,
  fridge,
  island,
  tallCabinet,
  wallCabinet,
  rangeHood,
];
