import * as THREE from 'three';
import type { FurnitureDef } from '../types';
import { D, INK_SOFT, Kit, LINE_THIN, M, PAL, blobGeo, darken, latheGeo, lighten, mix, noise3, organicGeo, rng, roundedBoxGeo, roundedRectShape, ellipseShape, sym, tint, type Ctx2D } from '../kit';
import { barHandle, slot } from './_parts';

type Colors = Record<string, string>;

/* ------------------------------------------------------------------ garden bench */

const gardenBench: FurnitureDef = {
  id: 'garden-bench',
  name: 'ספסל גינה',
  category: 'outdoor',
  size: { w: 1.5, d: 0.62, h: 0.86 },
  colors: [slot('wood', 'עץ', PAL.teak), slot('metal', 'מתכת', PAL.black)],
  seats: [
    { x: -0.38, z: 0.04, height: 0.44, facing: 0, kind: 'sit' },
    { x: 0.38, z: 0.04, height: 0.44, facing: 0, kind: 'sit' },
  ],
  build: ({ colors: c }) => {
    const k = new Kit();
    const wood = M.wood(c.wood, 0.7);
    const metal = M.metal(c.metal, 0.55, 0.6);
    const w = 1.5;
    const sx = w / 2 - 0.03;
    for (const s of [-1, 1]) {
      const x = s * sx;
      // front leg, back leg + back post, seat rail, arm rest
      k.beam([x, 0, 0.25], [x, 0.63, 0.25], 0.045, 0.04, metal, 0.006);
      k.beam([x, 0, -0.25], [x, 0.43, -0.2], 0.045, 0.04, metal, 0.006);
      k.beam([x, 0.43, -0.2], [x, 0.84, -0.285], 0.045, 0.04, metal, 0.006);
      k.beam([x, 0.4, -0.21], [x, 0.4, 0.25], 0.045, 0.04, metal, 0.006);
      k.beam([x, 0.63, -0.25], [x, 0.63, 0.29], 0.055, 0.03, wood, 0.008);
    }
    // seat slats
    const sl = w - 0.02;
    for (let i = 0; i < 6; i++) {
      k.rbox(sl, 0.022, 0.066, 0.006, wood, 0, 0.42, -0.165 + i * 0.079, 1);
    }
    // back slats on the leaning posts
    for (let i = 0; i < 3; i++) {
      const y = 0.54 + i * 0.105;
      const z = -0.2 - ((y + 0.045 - 0.43) / 0.41) * 0.085;
      const m = k.rbox(sl, 0.085, 0.02, 0.006, wood, 0, y, z + 0.032, 1);
      m.rotation.x = -0.2;
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const f = tint(c.wood, 0.35);
      D.rr(ctx, 0, 0.03, 1.5, 0.5, 0.01, f);
      for (let i = 1; i < 6; i++) D.line(ctx, -0.74, -0.21 + i * 0.079, 0.74, -0.21 + i * 0.079, INK_SOFT, 0.007);
      D.rr(ctx, 0, -0.26, 1.5, 0.09, 0.01, tint(c.wood, 0.15));
      for (const s of [-1, 1]) D.rr(ctx, s * 0.72, 0.02, 0.055, 0.54, 0.01, tint(c.wood, 0.2), undefined, LINE_THIN);
    }),
};

/* ------------------------------------------------------------------ table with umbrella */

const UMB_R = 1.3;

const patioTable: FurnitureDef = {
  id: 'patio-table',
  name: 'שולחן גינה עם שמשייה',
  category: 'outdoor',
  size: { w: 2.42, d: 2.42, h: 2.5 },
  colors: [slot('canopy', 'שמשייה', PAL.cream), slot('table', 'שולחן', PAL.teak)],
  build: ({ colors: c }) => {
    const k = new Kit();
    const wood = M.wood(c.table, 0.7);
    const metal = M.metal('#3a3b3e', 0.5, 0.7);
    // round slatted table
    const top = ellipseShape(0.55, 0.55);
    const hole = new THREE.Path();
    hole.absarc(0, 0, 0.03, 0, Math.PI * 2, true);
    top.holes.push(hole);
    k.slab(top, 0.03, wood, 0, 0.71, 0, 0, 28);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      k.rod([Math.cos(a) * 0.44, 0.003, Math.sin(a) * 0.44], [Math.cos(a) * 0.3, 0.712, Math.sin(a) * 0.3], 0.02, wood, 0.024, 10);
    }
    k.ring(0.3, 0.012, metal, 0, 0.36, 0, 28);
    // umbrella: weighted base, pole, octagonal canopy with ribs
    k.cyl(0.2, 0.05, M.stone('#8d8f92', 0.8), 0, 0, 0, 0.18, 24);
    k.cyl(0.022, 2.44, M.metal('#cfd2d4', 0.4, 0.9), 0, 0.04, 0, 0.022, 12);
    const cone = new THREE.ConeGeometry(UMB_R, 0.42, 8, 1, true);
    cone.rotateY(Math.PI / 8);
    const canopy = k.geo(cone, M.cloth(c.canopy), 0, 2.2, 0);
    canopy.castShadow = true;
    // small valance
    const val = new THREE.CylinderGeometry(UMB_R, UMB_R, 0.07, 8, 1, true);
    val.rotateY(Math.PI / 8);
    k.geo(val, M.cloth(darken(c.canopy, 0.06)), 0, 1.955, 0);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      // CylinderGeometry vertices sit at sin/cos of theta
      k.rod([0, 2.38, 0], [Math.sin(a) * (UMB_R - 0.01), 1.985, Math.cos(a) * (UMB_R - 0.01)], 0.006, metal, 0.006, 6);
      k.rod([0, 1.75, 0], [Math.sin(a) * 0.6, 2.2, Math.cos(a) * 0.6], 0.005, metal, 0.005, 6);
    }
    k.sphere(0.035, wood, 0, 2.465, 0, 1, 1, 1, 12);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      // umbrella above (dashed octagon), table below
      const pts: Array<[number, number]> = [];
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
        pts.push([Math.sin(a) * UMB_R, Math.cos(a) * UMB_R]);
      }
      ctx.setLineDash([0.08, 0.06]);
      D.poly(ctx, pts, true, tint(c.canopy, 0.4) + '99', INK_SOFT, LINE_THIN);
      for (const [x, y] of pts) D.line(ctx, 0, 0, x, y, INK_SOFT, 0.006);
      ctx.setLineDash([]);
      D.circle(ctx, 0, 0, 0.55, tint(c.table, 0.35));
      D.circle(ctx, 0, 0, 0.03, '#ffffff', undefined, LINE_THIN);
    }),
};

/* ------------------------------------------------------------------ sun lounger */

const sunLounger: FurnitureDef = {
  id: 'sun-lounger',
  name: 'מיטת שיזוף',
  category: 'outdoor',
  size: { w: 0.7, d: 1.95, h: 0.78 },
  colors: [slot('frame', 'מסגרת', PAL.teak), slot('cushion', 'מזרן', PAL.cream)],
  seats: [{ x: 0, z: 0.15, height: 0.4, facing: 0, kind: 'lie' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const wood = M.wood(c.frame, 0.7);
    const fab = M.fabric(c.cushion, 12);
    const w = 0.7;
    const z0 = -0.955;
    const z1 = 0.965;
    const ry = 0.25;
    for (const s of [-1, 1]) {
      k.rbox(0.04, 0.07, z1 - z0, 0.008, wood, s * (w / 2 - 0.02), ry, (z0 + z1) / 2, 1);
      for (const z of [z0 + 0.14, z1 - 0.14]) k.rbox(0.045, ry, 0.06, 0.006, wood, s * (w / 2 - 0.0225), 0, z, 1);
    }
    for (const z of [z0 + 0.14, z1 - 0.14]) k.box(w - 0.08, 0.04, 0.03, wood, 0, 0.12, z);
    // slats under the flat part
    const hinge = -0.3;
    for (let i = 0; i < 9; i++) k.box(w - 0.08, 0.016, 0.08, wood, 0, ry + 0.045, hinge + 0.07 + i * 0.135);
    // flat cushion
    const flatL = z1 - hinge - 0.02;
    k.cushion(w - 0.07, 0.075, flatL, fab, 0, ry + 0.061, hinge + flatL / 2 + 0.005, 0.03, 0.01);
    // raised back section
    const ang = 0.62;
    const bl = 0.66;
    const back = new Kit();
    back.rbox(w - 0.08, 0.02, bl, 0.004, wood, 0, 0, bl / 2, 1);
    back.cushion(w - 0.07, 0.075, bl, fab, 0, 0.018, bl / 2, 0.03, 0.01);
    back.pillow(0.4, 0.09, 0.22, M.fabric(lighten(c.cushion, 0.25), 12), 0, 0.085, bl - 0.16);
    const bg = k.sub(back, 0, ry + 0.045, hinge);
    bg.rotation.y = Math.PI;
    bg.rotation.x = ang;
    // prop strut
    k.rod([0, ry + 0.03, hinge - 0.52], [0, ry + 0.045 + Math.sin(ang) * 0.42, hinge - Math.cos(ang) * 0.42], 0.012, wood, 0.012, 8);
    k.box(w - 0.08, 0.03, 0.03, wood, 0, ry + 0.01, hinge - 0.52);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 0.7, 1.92, 0.02, tint(c.frame, 0.3));
      D.box(ctx, -0.315, -0.3, 0.315, 0.95, 0.03, tint(c.cushion, 0.5), undefined, LINE_THIN);
      D.box(ctx, -0.315, -0.86, 0.315, -0.3, 0.03, tint(c.cushion, 0.3), undefined, LINE_THIN);
      D.rr(ctx, 0, -0.7, 0.4, 0.2, 0.05, '#ffffff', undefined, LINE_THIN);
    }),
};

/* ------------------------------------------------------------------ BBQ */

const bbq: FurnitureDef = {
  id: 'bbq-grill',
  name: 'גריל / מנגל',
  category: 'outdoor',
  size: { w: 1.3, d: 0.6, h: 1.17 },
  colors: [slot('body', 'גוף', '#2b2c2f')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const body = M.metal(c.body, 0.45, 0.6);
    const steel = M.steel();
    const bw = 0.74;
    const bd = 0.52;
    const zc = -0.02;
    // cart with two doors on casters
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl(0.035, 0.07, M.rubber(), sx * (bw / 2 - 0.06), 0, zc + sz * (bd / 2 - 0.07), 0.035, 12);
    k.box(bw, 0.56, bd - 0.03, body, 0, 0.07, zc - 0.015);
    for (const s of [-1, 1]) {
      k.rbox(bw / 2 - 0.006, 0.54, 0.018, 0.004, steel, s * (bw / 4), 0.08, zc + bd / 2 - 0.021, 1);
      barHandle(k, [s * 0.05, 0.38, zc + bd / 2 + 0.012], [s * 0.05, 0.54, zc + bd / 2 + 0.012], zc + bd / 2 - 0.012, steel, 0.006);
    }
    // control panel with knobs
    k.rbox(bw, 0.1, 0.03, 0.006, steel, 0, 0.635, zc + bd / 2 - 0.015, 1);
    for (const x of [-0.22, 0, 0.22]) {
      const kn = k.cyl(0.024, 0.03, M.plastic('#1c1d20'), 0, 0, 0, 0.02, 14);
      kn.rotation.x = Math.PI / 2;
      kn.position.set(x, 0.685, zc + bd / 2 + 0.014);
    }
    // firebox + rounded hood
    k.rbox(bw, 0.17, bd, 0.012, body, 0, 0.73, zc, 1);
    const hood = new THREE.CylinderGeometry(bd / 2, bd / 2, bw, 20, 1, false, 0, Math.PI);
    hood.rotateZ(Math.PI / 2);
    const hm = k.geo(hood, body, 0, 0.9, zc);
    hm.scale.y = 0.98;
    barHandle(k, [-0.26, 0.985, zc + bd / 2 + 0.032], [0.26, 0.985, zc + bd / 2 + 0.032], zc + 0.245, steel, 0.009);
    const th = k.cyl(0.035, 0.012, steel, 0, 0, 0, 0.035, 16);
    th.rotation.x = Math.PI / 2 - 0.75;
    th.position.set(0, 1.085, zc + 0.185);
    // side shelves
    for (const s of [-1, 1]) {
      k.rbox(0.27, 0.025, 0.42, 0.006, steel, s * (bw / 2 + 0.14), 0.845, zc, 1);
      k.beam([s * (bw / 2), 0.74, zc], [s * (bw / 2 + 0.2), 0.845, zc], 0.02, 0.3, body);
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const f = tint(c.body, 0.62);
      for (const s of [-1, 1]) D.rr(ctx, s * 0.51, -0.02, 0.27, 0.42, 0.01, '#e4e6e8');
      D.rr(ctx, 0, -0.02, 0.74, 0.52, 0.03, f);
      D.rr(ctx, 0, -0.03, 0.62, 0.36, 0.02, null, INK_SOFT, LINE_THIN);
      for (let i = 0; i < 9; i++) D.line(ctx, -0.27 + i * 0.0675, -0.19, -0.27 + i * 0.0675, 0.13, INK_SOFT, 0.006);
      D.line(ctx, -0.26, 0.27, 0.26, 0.27, undefined, 0.016);
    }),
};

/* ------------------------------------------------------------------ trees & shrubs */

interface TreeOpts {
  seed: number;
  trunkH: number;
  trunkR: number;
  canopyY: number;
  canopyR: number;
  squash: number;
  fruits?: number;
  detail?: number;
}

function buildTree(c: Colors, o: TreeOpts): THREE.Object3D {
  const k = new Kit();
  const r = rng(o.seed);
  const bark = M.bark(c.trunk);
  const tr = o.trunkR;
  k.lathe(
    [
      [tr * 1.7, 0],
      [tr * 1.25, o.trunkH * 0.07],
      [tr * 1.05, o.trunkH * 0.22],
      [tr * 0.9, o.trunkH * 0.6],
      [tr * 0.7, o.trunkH],
    ],
    bark,
    0,
    0,
    0,
    10,
  );
  const leafMats = [M.foliage(c.leaves), M.foliage(lighten(c.leaves, 0.1)), M.foliage(darken(c.leaves, 0.14))];
  const R = o.canopyR;
  const cy = o.canopyY;
  const blobs: Array<[number, number, number, number]> = [[0, cy, 0, R * 0.62]];
  const n = 6;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.5;
    const rad = R * (0.44 + r() * 0.06);
    const br = R * (0.4 + r() * 0.08);
    blobs.push([Math.cos(a) * rad, cy + (r() - 0.6) * R * 0.3 * o.squash, Math.sin(a) * rad, br]);
  }
  blobs.push([R * 0.1, cy + R * 0.48 * o.squash, -R * 0.05, R * 0.46]);
  blobs.push([-R * 0.2, cy + R * 0.3 * o.squash, R * 0.22, R * 0.4]);
  blobs.forEach(([x, y, z, br], i) => {
    const m = k.geo(blobGeo(br, o.detail ?? 3, o.seed + i * 3, 0.13, 2.1), leafMats[i % 3], x, y, z);
    m.scale.y = o.squash;
    m.rotation.y = r() * 6;
    // limbs reaching into the canopy
    if (i > 0 && i <= 4) k.rod([0, o.trunkH * 0.82, 0], [x * 0.75, y - br * 0.25, z * 0.75], tr * 0.5, bark, tr * 0.22, 6);
  });
  // center the canopy over the trunk so the footprint stays symmetric
  const canopy = k.g.children.slice(1);
  const box = new THREE.Box3();
  k.g.updateMatrixWorld(true);
  for (const m of canopy) box.expandByObject(m, true);
  const off = box.getCenter(new THREE.Vector3());
  for (const m of canopy) {
    m.position.x -= off.x;
    m.position.z -= off.z;
  }
  if (o.fruits) {
    const fm = M.plastic(c.fruit ?? PAL.mustard);
    for (let i = 0; i < o.fruits; i++) {
      const a = r() * Math.PI * 2;
      const e = (r() - 0.35) * 1.1;
      const rr = R * 0.93;
      k.sphere(0.055, fm, Math.cos(a) * Math.cos(e) * rr * 0.86, cy + Math.sin(e) * rr * o.squash * 0.75, Math.sin(a) * Math.cos(e) * rr * 0.86, 1, 1.15, 1, 8);
    }
  }
  return k.g;
}

function drawTree(ctx: Ctx2D, c: Colors, R: number, trunkR: number, seed: number, fruits = 0): void {
  sym(ctx, () => {
    D.foliage(ctx, 0, 0, R, tint(c.leaves, 0.45) + 'd9', 9, seed);
    D.foliage(ctx, R * 0.06, -R * 0.05, R * 0.55, tint(c.leaves, 0.3) + 'cc', 6, seed + 3, tint(c.leaves, 0.05));
    const r = rng(seed);
    for (let i = 0; i < fruits; i++) {
      const a = r() * 6.283;
      const d = R * (0.3 + r() * 0.5);
      D.circle(ctx, Math.cos(a) * d, Math.sin(a) * d, 0.05, tint(c.fruit ?? PAL.mustard, 0.1), null);
    }
    D.circle(ctx, 0, 0, trunkR, tint(c.trunk, 0.2), undefined, LINE_THIN);
  });
}

const TREE_BIG: TreeOpts = { seed: 3, trunkH: 2.4, trunkR: 0.17, canopyY: 3.4, canopyR: 1.95, squash: 0.84 };
const TREE_FRUIT: TreeOpts = { seed: 8, trunkH: 1.25, trunkR: 0.085, canopyY: 2.0, canopyR: 1.1, squash: 0.85, fruits: 16, detail: 2 };

const tree: FurnitureDef = {
  id: 'tree',
  name: 'עץ נשיר',
  category: 'outdoor',
  size: { w: 3.5, d: 3.5, h: 5.0 },
  colors: [slot('leaves', 'עלווה', '#5d8c45'), slot('trunk', 'גזע', '#6d5544')],
  build: ({ colors }) => buildTree(colors, TREE_BIG),
  draw2d: (ctx, c) => drawTree(ctx, c, 1.75, 0.17, 3),
};

const fruitTree: FurnitureDef = {
  id: 'tree-fruit',
  name: 'עץ לימון',
  category: 'outdoor',
  size: { w: 2.0, d: 2.0, h: 2.95 },
  colors: [slot('leaves', 'עלווה', '#4f7f3f'), slot('fruit', 'פרי', '#edc531'), slot('trunk', 'גזע', '#6d5544')],
  build: ({ colors }) => buildTree(colors, TREE_FRUIT),
  draw2d: (ctx, c) => drawTree(ctx, c, 1.0, 0.085, 8, 9),
};

const cypress: FurnitureDef = {
  id: 'tree-cypress',
  name: 'ברוש',
  category: 'outdoor',
  size: { w: 1.06, d: 1.06, h: 5.46 },
  colors: [slot('leaves', 'עלווה', '#3f6a3c'), slot('trunk', 'גזע', '#5f4a3b')],
  build: ({ colors: c }) => {
    const k = new Kit();
    k.cyl(0.09, 0.5, M.bark(c.trunk), 0, 0, 0, 0.07, 8);
    const R = 0.52;
    const y0 = 0.32;
    const H = 5.5 - y0 - 0.06;
    const profile: Array<[number, number]> = [];
    const N = 18;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const rr = R * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.42)), 0.8) * (1 - t * 0.1);
      profile.push([Math.max(0.001, rr), y0 + t * H]);
    }
    const base = latheGeo(profile, 16);
    const g = organicGeo(base, 0.04, 3.4, 5);
    k.geo(g, M.foliage(c.leaves));
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.foliage(ctx, 0, 0, 0.52, tint(c.leaves, 0.4) + 'e0', 8, 5);
      D.circle(ctx, 0, 0, 0.3, null, tint(c.leaves, 0.05), LINE_THIN);
      D.circle(ctx, 0, 0, 0.09, tint(c.trunk, 0.2), undefined, LINE_THIN);
    }),
};

const bush: FurnitureDef = {
  id: 'bush',
  name: 'שיח',
  category: 'outdoor',
  size: { w: 1.1, d: 0.96, h: 0.8 },
  colors: [slot('leaves', 'עלווה', '#5b8a48')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const mats = [M.foliage(c.leaves), M.foliage(lighten(c.leaves, 0.1)), M.foliage(darken(c.leaves, 0.13))];
    const blobs: Array<[number, number, number, number]> = [
      [0, 0.4, 0, 0.4],
      [-0.26, 0.3, 0.1, 0.27],
      [0.26, 0.31, -0.06, 0.28],
      [0.06, 0.28, 0.22, 0.25],
      [-0.05, 0.3, -0.2, 0.26],
    ];
    blobs.forEach(([x, y, z, r], i) => {
      const m = k.geo(blobGeo(r, 2, 30 + i, 0.14, 2.2), mats[i % 3], x, y, z);
      m.scale.y = 0.9;
    });
    k.cyl(0.04, 0.2, M.bark(), 0, 0, 0, 0.03, 6);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      ctx.save();
      ctx.scale(1, 0.87);
      D.foliage(ctx, 0, 0, 0.54, tint(c.leaves, 0.42), 8, 31);
      ctx.restore();
      D.circle(ctx, 0.02, 0, 0.2, null, tint(c.leaves, 0.05), LINE_THIN);
    }),
};

const HEDGE = { w: 1.6, d: 0.6, h: 1.1 };

const hedge: FurnitureDef = {
  id: 'hedge',
  name: 'גדר חיה',
  category: 'outdoor',
  size: HEDGE,
  colors: [slot('leaves', 'עלווה', '#4c7a40')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { w, d, h } = HEDGE;
    const m = 0.012;
    const bh = h - 0.06;
    const base = roundedBoxGeo(w - 2 * m, bh, d - 2 * m, 0.12, 4);
    const g = organicGeo(base, 0.028, 4.2, 7);
    k.geo(g, M.foliage(c.leaves), 0, bh / 2 + 0.035, 0);
    k.box(w - 0.3, 0.06, d - 0.3, M.soil(), 0, 0, 0);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { w, d } = HEDGE;
      const f = tint(c.leaves, 0.42);
      // scalloped outline
      ctx.beginPath();
      const n = 8;
      const r = w / n / 2;
      for (let i = 0; i < n; i++) ctx.arc(-w / 2 + r + i * 2 * r, -d / 2 + r, r, Math.PI, 0);
      for (let i = n - 1; i >= 0; i--) ctx.arc(-w / 2 + r + i * 2 * r, d / 2 - r, r, 0, Math.PI);
      ctx.closePath();
      ctx.fillStyle = f;
      ctx.fill();
      ctx.stroke();
      D.line(ctx, -w / 2 + 0.15, 0, w / 2 - 0.15, 0, tint(c.leaves, 0.05), LINE_THIN);
    }),
};

/* ------------------------------------------------------------------ flower bed */

const BED = { w: 1.6, d: 0.7, h: 0.56 };

function flowerSpots(): Array<{ x: number; z: number; h: number; k: number }> {
  const r = rng(77);
  const out: Array<{ x: number; z: number; h: number; k: number }> = [];
  for (let i = 0; i < 22; i++) {
    out.push({
      x: (r() - 0.5) * (BED.w - 0.22),
      z: (r() - 0.5) * (BED.d - 0.22),
      h: 0.2 + r() * 0.14,
      k: Math.floor(r() * 3),
    });
  }
  return out;
}

const flowerBed: FurnitureDef = {
  id: 'flower-bed',
  name: 'ערוגת פרחים',
  category: 'outdoor',
  size: BED,
  colors: [slot('flowers', 'פרחים', '#d9728a'), slot('border', 'מסגרת', PAL.teak)],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { w, d } = BED;
    const wood = M.wood(c.border, 0.75);
    const bh = 0.2;
    for (const s of [-1, 1]) {
      k.rbox(w, bh, 0.035, 0.006, wood, 0, 0, s * (d / 2 - 0.0175), 1);
      k.rbox(0.035, bh, d - 0.07, 0.006, wood, s * (w / 2 - 0.0175), 0, 0, 1);
    }
    const soil = organicGeo(roundedBoxGeo(w - 0.07, 0.1, d - 0.07, 0.03, 1), 0.01, 9, 2);
    k.geo(soil, M.soil(), 0, 0.12, 0);
    const soilY = 0.17;
    // leafy tufts
    const greens = [M.foliage('#5b8a48'), M.foliage('#6f9c55'), M.foliage('#4c7a40')];
    const r = rng(5);
    for (let i = 0; i < 9; i++) {
      const x = -w / 2 + 0.16 + (i / 8) * (w - 0.32) + (r() - 0.5) * 0.08;
      const z = (r() - 0.5) * (d - 0.3);
      const rad = 0.09 + r() * 0.04;
      const m = k.geo(blobGeo(rad, 1, 50 + i, 0.25, 3), greens[i % 3], x, soilY + rad * 0.5, z);
      m.scale.y = 0.75;
    }
    // flowers: stem + blossom
    const petals = [M.matte(c.flowers), M.matte(lighten(c.flowers, 0.35)), M.matte(mix(c.flowers, '#f2c14e', 0.75))];
    const centre = M.matte('#f2c14e');
    const stem = M.foliage('#5f8f4d');
    for (const f of flowerSpots()) {
      k.rod([f.x, soilY, f.z], [f.x + 0.01, soilY + f.h, f.z + 0.01], 0.005, stem, 0.004, 4);
      k.sphere(0.036, petals[f.k], f.x + 0.01, soilY + f.h + 0.012, f.z + 0.01, 1, 0.55, 1, 7);
      k.sphere(0.014, centre, f.x + 0.01, soilY + f.h + 0.03, f.z + 0.01, 1, 0.7, 1, 5);
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { w, d } = BED;
      D.rr(ctx, 0, 0, w, d, 0.01, tint(c.border, 0.3));
      D.rr(ctx, 0, 0, w - 0.07, d - 0.07, 0.01, '#d9cdbd', INK_SOFT, LINE_THIN);
      const r = rng(5);
      for (let i = 0; i < 9; i++) {
        const x = -w / 2 + 0.16 + (i / 8) * (w - 0.32) + (r() - 0.5) * 0.08;
        const z = (r() - 0.5) * (d - 0.3);
        D.circle(ctx, x, z, 0.1 + r() * 0.03, tint('#5b8a48', 0.45), INK_SOFT, 0.006);
      }
      const cols = [tint(c.flowers, 0.1), tint(c.flowers, 0.5), tint(mix(c.flowers, '#f2c14e', 0.75), 0.2)];
      for (const f of flowerSpots()) D.circle(ctx, f.x + 0.01, f.z + 0.01, 0.034, cols[f.k], INK_SOFT, 0.005);
    }),
};

/* ------------------------------------------------------------------ swing set */

const SWING = { w: 2.5, d: 1.9, h: 2.2 };

const swingSet: FurnitureDef = {
  id: 'swing-set',
  name: 'נדנדה כפולה',
  category: 'outdoor',
  size: SWING,
  colors: [slot('frame', 'מסגרת', PAL.teak), slot('seat', 'מושבים', PAL.terracotta)],
  seats: [
    { x: -0.5, z: 0, height: 0.5, facing: 0, kind: 'sit' },
    { x: 0.5, z: 0, height: 0.5, facing: 0, kind: 'sit' },
  ],
  build: ({ colors: c }) => {
    const k = new Kit();
    const wood = M.wood(c.frame, 0.7);
    const { w, d, h } = SWING;
    const ax = w / 2 - 0.08;
    const top = h - 0.05;
    for (const s of [-1, 1]) {
      for (const sz of [-1, 1]) k.beam([s * (ax + 0.03), 0.0115, sz * (d / 2 - 0.045)], [s * ax, top, sz * 0.03], 0.075, 0.075, wood, 0.01);
      k.beam([s * (ax + 0.022), 0.55, -(d / 2 - 0.05) * 0.74], [s * (ax + 0.022), 0.55, (d / 2 - 0.05) * 0.74], 0.06, 0.035, wood, 0.006);
    }
    k.beam([-w / 2 + 0.01, top + 0.0, 0], [w / 2 - 0.01, top, 0], 0.09, 0.09, wood, 0.012);
    const metal = M.steel();
    const rope = M.matte('#d8cdb6');
    const seat = M.plastic(c.seat);
    for (const sx of [-0.5, 0.5]) {
      for (const s of [-1, 1]) {
        const x = sx + s * 0.2;
        k.cyl(0.012, 0.05, metal, x, top - 0.09, 0, 0.012, 8);
        k.rod([x, 0.5, 0], [x, top - 0.06, 0], 0.007, rope, 0.007, 6);
      }
      k.rbox(0.46, 0.03, 0.17, 0.012, seat, sx, 0.475, 0, 1);
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { w, d } = SWING;
      const f = tint(c.frame, 0.3);
      for (const s of [-1, 1]) {
        D.line(ctx, s * (w / 2 - 0.05), -d / 2 + 0.05, s * (w / 2 - 0.08), 0, INK_SOFT, 0.02);
        D.line(ctx, s * (w / 2 - 0.05), d / 2 - 0.05, s * (w / 2 - 0.08), 0, INK_SOFT, 0.02);
        for (const sz of [-1, 1]) D.rr(ctx, s * (w / 2 - 0.05), sz * (d / 2 - 0.05), 0.085, 0.085, 0.01, f, undefined, LINE_THIN);
      }
      D.rr(ctx, 0, 0, w - 0.02, 0.09, 0.01, f);
      for (const sx of [-0.5, 0.5]) {
        D.rr(ctx, sx, 0, 0.46, 0.17, 0.02, tint(c.seat, 0.35));
        // swing arc hint
        ctx.setLineDash([0.05, 0.04]);
        D.line(ctx, sx, -0.6, sx, 0.6, INK_SOFT, 0.007);
        ctx.setLineDash([]);
      }
    }),
};

/* ------------------------------------------------------------------ trampoline */

const TR = { r: 1.5, h: 2.5, deck: 0.75 };

const trampoline: FurnitureDef = {
  id: 'trampoline',
  name: 'טרמפולינה',
  category: 'outdoor',
  size: { w: 3.08, d: 3.08, h: TR.h },
  colors: [slot('pad', 'ריפוד', PAL.dustyBlue)],
  build: ({ colors: c }) => {
    const k = new Kit();
    const steel = M.metal('#b9bcbf', 0.4, 0.9);
    const { r, deck } = TR;
    k.ring(r, 0.028, steel, 0, deck, 0, 40);
    // jumping mat + spring pad
    const mat = new THREE.CircleGeometry(r - 0.27, 40);
    mat.rotateX(-Math.PI / 2);
    k.geo(mat, M.rubber('#26272a'), 0, deck + 0.005, 0);
    const pad = new THREE.RingGeometry(r - 0.29, r + 0.01, 40, 1);
    pad.rotateX(-Math.PI / 2);
    k.geo(pad, M.fabric(c.pad, 8), 0, deck + 0.032, 0);
    const padSide = new THREE.CylinderGeometry(r + 0.01, r + 0.01, 0.05, 40, 1, true);
    k.geo(padSide, M.fabric(c.pad, 8), 0, deck + 0.007, 0);
    // legs (W frames) and net poles
    const foam = M.fabric(darken(c.pad, 0.1), 8);
    const n = 6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const a1 = a - 0.2;
      const a2 = a + 0.2;
      const p = (ang: number, rad: number, y: number): [number, number, number] => [Math.cos(ang) * rad, y, Math.sin(ang) * rad];
      k.tube([p(a1, r, deck), p(a1, r, 0.06), p(a, r + 0.0, 0.028), p(a2, r, 0.06), p(a2, r, deck)], 0.022, steel, { seg: 16, radial: 6, tension: 0.2 });
      k.rod(p(a, r + 0.0, deck - 0.3), p(a, r + 0.0, TR.h - 0.02), 0.03, foam, 0.03, 8);
      k.sphere(0.036, M.plastic('#2b2c2f'), ...p(a, r, TR.h - 0.036), 1, 1, 1, 8);
    }
    // safety net
    const net = new THREE.CylinderGeometry(r - 0.02, r - 0.02, TR.h - deck - 0.1, 40, 1, true);
    const netMat = M.glass('#3a3f45', 0.16);
    const nm = k.geo(net, netMat, 0, deck + (TR.h - deck - 0.1) / 2 + 0.04, 0);
    nm.castShadow = false;
    k.ring(r - 0.02, 0.012, M.plastic('#2b2c2f'), 0, TR.h - 0.07, 0, 40);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.circle(ctx, 0, 0, 1.52, tint(c.pad, 0.35));
      D.circle(ctx, 0, 0, 1.23, '#c9ccd0', undefined, LINE_THIN);
      D.circle(ctx, 0, 0, 1.0, null, INK_SOFT, 0.007);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        D.circle(ctx, Math.cos(a) * 1.5, Math.sin(a) * 1.5, 0.03, '#ffffff', undefined, 0.008);
      }
    }),
};

/* ------------------------------------------------------------------ sandbox */

const sandbox: FurnitureDef = {
  id: 'sandbox',
  name: 'ארגז חול',
  category: 'outdoor',
  size: { w: 1.6, d: 1.6, h: 0.38 },
  colors: [slot('wood', 'עץ', PAL.teak), slot('toys', 'צעצועים', PAL.terracotta)],
  build: ({ colors: c }) => {
    const k = new Kit();
    const wood = M.wood(c.wood, 0.75);
    const s = 1.6;
    const bh = 0.24;
    for (const sg of [-1, 1]) {
      k.rbox(s, bh, 0.04, 0.006, wood, 0, 0, sg * (s / 2 - 0.02), 1);
      k.rbox(0.04, bh, s - 0.08, 0.006, wood, sg * (s / 2 - 0.02), 0, 0, 1);
    }
    // corner seats
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const tri = new THREE.Shape();
        tri.moveTo(0, 0);
        tri.lineTo(0.36, 0);
        tri.lineTo(0, 0.36);
        tri.closePath();
        const m = k.slab(tri, 0.025, wood, sx * (s / 2), bh, sz * (s / 2));
        // shape y maps to -z: orient each triangle into its corner
        m.rotation.y = sx === 1 && sz === 1 ? Math.PI / 2 : sx === -1 && sz === 1 ? 0 : sx === -1 && sz === -1 ? -Math.PI / 2 : Math.PI;
      }
    }
    // sand with gentle dunes
    const sandG = new THREE.PlaneGeometry(s - 0.08, s - 0.08, 14, 14);
    sandG.rotateX(-Math.PI / 2);
    const p = sandG.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      const edge = Math.min(1, (s / 2 - 0.04 - Math.max(Math.abs(x), Math.abs(z))) * 8);
      p.setY(i, (noise3(x * 2.5 + 4, 0, z * 2.5) - 0.4) * 0.07 * edge + Math.exp(-((x + 0.25) ** 2 + (z + 0.2) ** 2) * 22) * 0.09);
    }
    sandG.computeVertexNormals();
    k.geo(sandG, M.matte('#e4d3ab'), 0, 0.16, 0);
    // bucket + spade
    const toy = M.plastic(c.toys);
    k.lathe(
      [
        [0, 0],
        [0.055, 0],
        [0.075, 0.13],
        [0.08, 0.13],
        [0.08, 0.138],
        [0.068, 0.138],
        [0.05, 0.012],
        [0, 0.012],
      ],
      toy,
      0.3,
      0.165,
      0.2,
      16,
    );
    k.tube(
      [
        [0.225, 0.29, 0.2],
        [0.25, 0.35, 0.2],
        [0.3, 0.375, 0.2],
        [0.35, 0.35, 0.2],
        [0.375, 0.29, 0.2],
      ],
      0.004,
      M.plastic('#f4f1ea'),
      { seg: 10, radial: 4 },
    );
    const spade = new Kit();
    spade.rbox(0.07, 0.008, 0.1, 0.003, M.plastic(PAL.mustard), 0, 0, 0.05, 1);
    spade.rod([0, 0.006, 0], [0, 0.03, -0.15], 0.008, M.plastic(PAL.mustard), 0.008, 6);
    const sg2 = k.sub(spade, -0.1, 0.19, 0.35);
    sg2.rotation.set(-0.25, 0.9, 0);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 1.6, 1.6, 0.01, tint(c.wood, 0.3));
      D.rr(ctx, 0, 0, 1.52, 1.52, 0.005, '#f1e6c8', INK_SOFT, LINE_THIN);
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          D.poly(
            ctx,
            [
              [sx * 0.8, sz * 0.8],
              [sx * 0.44, sz * 0.8],
              [sx * 0.8, sz * 0.44],
            ],
            true,
            tint(c.wood, 0.3),
            undefined,
            LINE_THIN,
          );
        }
      }
      // sand dots
      const r = rng(3);
      ctx.fillStyle = '#cdb98a';
      for (let i = 0; i < 40; i++) {
        ctx.beginPath();
        ctx.arc((r() - 0.5) * 1.3, (r() - 0.5) * 1.3, 0.008, 0, Math.PI * 2);
        ctx.fill();
      }
      D.circle(ctx, 0.3, 0.2, 0.08, tint(c.toys, 0.3), undefined, LINE_THIN);
    }),
};

/* ------------------------------------------------------------------ garden lamp */

const gardenLamp: FurnitureDef = {
  id: 'garden-lamp',
  name: 'פנס גינה',
  category: 'outdoor',
  size: { w: 0.4, d: 0.4, h: 2.6 },
  colors: [slot('metal', 'מתכת', '#2f3235')],
  light: { x: 0, y: 2.3, z: 0, color: '#ffdca8', intensity: 90, distance: 10 },
  build: ({ colors: c }) => {
    const k = new Kit();
    const metal = M.metal(c.metal, 0.55, 0.6);
    // base, fluted post
    k.lathe(
      [
        [0, 0],
        [0.13, 0],
        [0.13, 0.03],
        [0.1, 0.05],
        [0.075, 0.2],
        [0.05, 0.26],
        [0.042, 0.3],
        [0.036, 1.2],
        [0.03, 2.08],
        [0.045, 2.1],
        [0.045, 2.13],
        [0, 2.13],
      ],
      metal,
      0,
      0,
      0,
      16,
    );
    k.ring(0.045, 0.012, metal, 0, 1.2, 0, 16);
    // lantern: tapered four-sided glass body with frame and roof
    const y0 = 2.13;
    const lh = 0.3;
    const body = new THREE.CylinderGeometry(0.16, 0.1, lh, 4, 1, false);
    body.rotateY(Math.PI / 4);
    k.geo(body, M.glow('#ffdca8', 1.6, '#fff4dc'), 0, y0 + lh / 2, 0).castShadow = false;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      k.rod([Math.sin(a) * 0.102, y0, Math.cos(a) * 0.102], [Math.sin(a) * 0.163, y0 + lh, Math.cos(a) * 0.163], 0.008, metal, 0.008, 6);
    }
    const plate = new THREE.CylinderGeometry(0.115, 0.11, 0.02, 4);
    plate.rotateY(Math.PI / 4);
    k.geo(plate, metal, 0, y0 + 0.0, 0);
    const roof = new THREE.ConeGeometry(0.265, 0.12, 4);
    roof.rotateY(Math.PI / 4);
    k.geo(roof, metal, 0, y0 + lh + 0.06, 0);
    k.sphere(0.022, metal, 0, y0 + lh + 0.13, 0, 1, 1.3, 1, 8);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 0.37, 0.37, 0.02, '#fff3d6');
      D.line(ctx, -0.185, -0.185, 0.185, 0.185, INK_SOFT, LINE_THIN);
      D.line(ctx, -0.185, 0.185, 0.185, -0.185, INK_SOFT, LINE_THIN);
      D.circle(ctx, 0, 0, 0.06, tint(c.metal, 0.5));
    }),
};

export const OUTDOOR: FurnitureDef[] = [
  gardenBench,
  patioTable,
  sunLounger,
  bbq,
  tree,
  fruitTree,
  cypress,
  bush,
  hedge,
  flowerBed,
  swingSet,
  trampoline,
  sandbox,
  gardenLamp,
];
