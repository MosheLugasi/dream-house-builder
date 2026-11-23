/** Grocery shop / supermarket / bakery fittings. All products are generic: plain colours, no brands. */
import * as THREE from 'three';
import type { FurnitureDef } from '../types';
import { D, INK_SOFT, Kit, LINE_THIN, M, PAL, darken, latheGeo, lighten, rng, sym, tint, type V3 } from '../kit';
import { slot } from './_parts';
import { axisCyl, extrudeX, netMat, polyShape } from './_street_shared';

export const PRODUCT = ['#d8473d', '#f2c21b', '#3f8fd0', '#4f9a4a', '#e8822a', '#8a5fb0', '#f3f1ec', '#e06a9a', '#2fa39a'];
const prod = (i: number): THREE.Material => M.paint(PRODUCT[((i % PRODUCT.length) + PRODUCT.length) % PRODUCT.length], 0.5);
const LABEL = (): THREE.Material => M.paint('#f8f6ef', 0.6);

let bottleCache: THREE.BufferGeometry | null = null;
/** Unit drinks bottle (height 1, max radius 0.16), 8-sided. */
function bottleGeo(): THREE.BufferGeometry {
  if (!bottleCache) {
    bottleCache = latheGeo(
      [
        [0.15, 0],
        [0.16, 0.04],
        [0.16, 0.56],
        [0.1, 0.74],
        [0.055, 0.84],
        [0.055, 0.94],
        [0.07, 0.95],
        [0.07, 1],
        [0, 1],
      ],
      8,
    );
  }
  return bottleCache;
}

function bottle(k: Kit, x: number, y: number, z: number, h: number, ci: number, capColor = '#f3f1ec'): void {
  const m = k.geo(bottleGeo(), prod(ci), x, y, z);
  m.scale.set(h, h, h);
  k.cyl(h * 0.075, h * 0.07, M.paint(capColor, 0.5), x, y + h * 0.94, z, h * 0.075, 8);
}

type Stock = 'boxes' | 'cans' | 'bottles' | 'jugs' | 'jars';

/** Fill a shelf span with one kind of product, front row aligned at `zFront`. */
function stockRow(k: Kit, kind: Stock, x0: number, x1: number, y: number, zFront: number, maxH: number, seed: number): void {
  const r = rng(seed);
  let x = x0;
  let ci = Math.floor(r() * 9);
  let run = 0;
  while (x < x1 - 0.04) {
    if (run <= 0) {
      ci += 1 + Math.floor(r() * 3);
      run = 2 + Math.floor(r() * 3);
    }
    run--;
    if (kind === 'boxes') {
      const w = 0.085 + (ci % 3) * 0.02;
      const h = Math.min(maxH - 0.02, 0.17 + (ci % 4) * 0.035);
      if (x + w > x1) break;
      k.box(w, h, 0.1, prod(ci), x + w / 2, y, zFront - 0.05);
      k.box(w * 0.7, h * 0.3, 0.002, LABEL(), x + w / 2, y + h * 0.48, zFront + 0.001);
      x += w + 0.006;
    } else if (kind === 'cans') {
      const rad = 0.034;
      if (x + rad * 2 > x1) break;
      for (let j = 0; j < 2; j++) {
        k.cyl(rad, 0.105, prod(ci), x + rad, y + j * 0.107, zFront - rad, rad, 8);
        k.cyl(rad + 0.0015, 0.045, LABEL(), x + rad, y + j * 0.107 + 0.03, zFront - rad, rad + 0.0015, 8);
      }
      x += rad * 2 + 0.008;
    } else if (kind === 'bottles') {
      const h = Math.min(maxH - 0.02, 0.26);
      if (x + 0.085 > x1) break;
      bottle(k, x + 0.042, y, zFront - 0.045, h, ci, PRODUCT[(ci + 4) % 9]);
      x += 0.092;
    } else if (kind === 'jugs') {
      const w = 0.13;
      const h = Math.min(maxH - 0.03, 0.27);
      if (x + w > x1) break;
      k.rbox(w, h, 0.11, 0.02, prod(ci), x + w / 2, y, zFront - 0.06, 1);
      k.cyl(0.022, 0.035, M.paint('#f3f1ec', 0.5), x + w / 2 - 0.03, y + h, zFront - 0.06, 0.022, 8);
      k.box(w * 0.66, h * 0.36, 0.002, LABEL(), x + w / 2, y + h * 0.3, zFront - 0.004);
      x += w + 0.01;
    } else {
      const rad = 0.04;
      if (x + rad * 2 > x1) break;
      k.cyl(rad, 0.1, prod(ci), x + rad, y, zFront - rad, rad, 8);
      k.cyl(rad * 0.92, 0.018, M.paint('#d9b23a', 0.4), x + rad, y + 0.1, zFront - rad, rad * 0.92, 8);
      x += rad * 2 + 0.01;
    }
  }
}

/* ------------------------------------------------------------------ gondola shelf */

const GS = { w: 1.2, d: 0.5, h: 1.8 };
const GS_SHELVES: Array<{ y: number; depth: number; kind: Stock }> = [
  { y: 0.16, depth: 0.44, kind: 'jugs' },
  { y: 0.56, depth: 0.38, kind: 'cans' },
  { y: 0.9, depth: 0.36, kind: 'boxes' },
  { y: 1.22, depth: 0.34, kind: 'bottles' },
  { y: 1.54, depth: 0.32, kind: 'jars' },
];

const shopShelf: FurnitureDef = {
  id: 'shop-shelf',
  name: 'מדף מכולת',
  category: 'public',
  size: GS,
  colors: [slot('body', 'גוף', '#eceae4'), slot('strip', 'פס מחיר', '#f2c21b')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { w, d, h } = GS;
    const body = M.paint(c.body, 0.5);
    const strip = M.paint(c.strip, 0.5);
    const zb = -d / 2;
    // back panel, slotted uprights, base with kick plate
    k.box(w - 0.04, h - 0.1, 0.02, body, 0, 0.08, zb + 0.02);
    for (const s of [-1, 1]) k.box(0.035, h, 0.05, M.metal('#b9bdc1', 0.5, 0.7), s * (w / 2 - 0.0175), 0, zb + 0.025);
    k.box(w - 0.07, 0.14, d - 0.04, body, 0, 0, 0);
    k.box(w - 0.07, 0.1, 0.01, M.matte('#3a3d42'), 0, 0, d / 2 - 0.016);
    k.box(w, 0.03, 0.08, body, 0, h - 0.03, zb + 0.04);
    GS_SHELVES.forEach((sh, i) => {
      const zf = zb + 0.03 + sh.depth;
      if (i > 0) {
        k.box(w - 0.07, 0.022, sh.depth, body, 0, sh.y - 0.022, zb + 0.03 + sh.depth / 2);
        for (const s of [-1, 1]) k.beam([s * (w / 2 - 0.05), sh.y - 0.13, zb + 0.04], [s * (w / 2 - 0.05), sh.y - 0.03, zf - 0.06], 0.012, 0.02, body);
      }
      // price strip with tickets
      k.box(w - 0.07, 0.032, 0.006, strip, 0, sh.y - 0.03, zf + 0.003);
      for (let j = 0; j < 5; j++) k.box(0.05, 0.022, 0.002, LABEL(), -0.44 + j * 0.22, sh.y - 0.025, zf + 0.0065);
      const next = GS_SHELVES[i + 1];
      stockRow(k, sh.kind, -w / 2 + 0.05, w / 2 - 0.05, sh.y, zf - 0.012, (next ? next.y - 0.022 : h - 0.03) - sh.y, 40 + i * 7);
    });
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { w, d } = GS;
      D.rr(ctx, 0, 0, w, d, 0.004, tint(c.body, 0.3));
      D.line(ctx, -w / 2, -d / 2 + 0.05, w / 2, -d / 2 + 0.05, INK_SOFT, LINE_THIN);
      const r = rng(40);
      let x = -w / 2 + 0.05;
      while (x < w / 2 - 0.14) {
        const pw = 0.09 + r() * 0.05;
        D.rr(ctx, x + pw / 2, d / 2 - 0.09, pw, 0.11, 0.008, tint(PRODUCT[Math.floor(r() * 9)], 0.45), INK_SOFT, 0.006);
        x += pw + 0.012;
      }
      D.line(ctx, -w / 2 + 0.03, d / 2 - 0.012, w / 2 - 0.03, d / 2 - 0.012, tint(c.strip, 0.1), 0.016);
    }),
};

/* ------------------------------------------------------------------ drinks fridge */

const FR = { w: 0.74, d: 0.72, h: 2.02 };

const shopFridge: FurnitureDef = {
  id: 'shop-fridge',
  name: 'מקרר משקאות',
  category: 'public',
  size: FR,
  colors: [slot('body', 'גוף', '#2b2e33'), slot('accent', 'שלט עליון', '#d8473d')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { w, d, h } = FR;
    const body = M.paint(c.body, 0.4);
    const inner = M.paint('#f4f5f3', 0.5);
    const t = 0.035;
    const y0 = 0.2; // top of the compressor base
    const y1 = h - 0.24; // underside of the header
    const zb = -d / 2;
    const dz = d - 0.045; // carcass depth (door in front)
    // carcass
    k.box(w, y0, dz, body, 0, 0, zb + dz / 2);
    k.box(w, h - y1, dz, body, 0, y1, zb + dz / 2);
    for (const s of [-1, 1]) k.box(t, y1 - y0, dz, body, s * (w / 2 - t / 2), y0, zb + dz / 2);
    k.box(w - 2 * t, y1 - y0, t, body, 0, y0, zb + t / 2);
    // white liner + LED strips
    k.box(w - 2 * t, y1 - y0, 0.004, inner, 0, y0, zb + t + 0.002);
    for (const s of [-1, 1]) {
      k.box(0.004, y1 - y0, dz - t, inner, s * (w / 2 - t - 0.002), y0, zb + t + (dz - t) / 2);
      k.box(0.012, y1 - y0 - 0.06, 0.02, M.glow('#eaf6ff', 1.6, '#ffffff'), s * (w / 2 - t - 0.01), y0 + 0.03, zb + dz - 0.03).castShadow = false;
    }
    k.box(w - 2 * t, 0.004, dz - t, inner, 0, y0, zb + t + (dz - t) / 2);
    // base grille + header light box
    for (let i = 0; i < 5; i++) k.box(w - 0.12, 0.012, 0.004, M.matte('#111214'), 0, 0.05 + i * 0.026, zb + dz + 0.002);
    k.rbox(w - 0.06, h - y1 - 0.06, 0.012, 0.01, M.glow(c.accent, 0.5, c.accent), 0, y1 + 0.03, zb + dz + 0.004, 1).castShadow = false;
    k.rbox(w - 0.3, 0.05, 0.004, 0.02, M.glow('#ffffff', 0.5, '#ffffff'), 0, y1 + 0.095, zb + dz + 0.011, 1).castShadow = false;
    // wire shelves with rows of drinks
    const shelfY = [y0 + 0.004, 0.52, 0.83, 1.13, 1.43];
    const wire = M.metal('#d8dadc', 0.4, 0.6);
    const zf = zb + dz - 0.07;
    const x0 = -w / 2 + t + 0.035;
    const x1 = w / 2 - t - 0.035;
    shelfY.forEach((y, i) => {
      if (i > 0) {
        k.box(w - 2 * t - 0.01, 0.008, dz - t - 0.04, wire, 0, y - 0.008, zb + t + (dz - t) / 2 - 0.01);
        k.box(w - 2 * t - 0.01, 0.022, 0.006, wire, 0, y - 0.012, zb + dz - 0.03);
      }
      const ci = [4, 0, 3, 2, 1][i];
      if (i % 2 === 0) {
        const n = 6;
        for (let j = 0; j < n; j++) bottle(k, x0 + ((x1 - x0) * j) / (n - 1), y, zf - 0.03, i === 0 ? 0.28 : 0.24, ci + (j >= 3 ? 5 : 0), '#f3f1ec');
      } else {
        const n = 7;
        for (let row = 0; row < 2; row++) {
          for (let j = 0; j < n; j++) {
            const x = x0 + ((x1 - x0) * j) / (n - 1);
            k.cyl(0.033, 0.12, prod(ci + (j > 3 ? 4 : 0)), x, y, zf - 0.03 - row * 0.08, 0.033, 8);
            if (row === 0) k.cyl(0.03, 0.006, M.metal('#d8dadc', 0.3, 0.9), x, y + 0.12, zf - 0.03, 0.03, 8);
          }
        }
      }
    });
    // glass door with frame and handle
    const dzc = d / 2 - 0.02;
    const dh = y1 - y0 + 0.04;
    k.box(w - 0.09, dh - 0.09, 0.008, M.glass('#d7eef5', 0.16), 0, y0 + 0.025, dzc);
    const fr = M.paint(darken(c.body, 0.2), 0.35);
    for (const s of [-1, 1]) k.rbox(0.045, dh, 0.035, 0.006, fr, s * (w / 2 - 0.0225), y0 - 0.02, dzc, 1);
    k.rbox(w - 0.09, 0.045, 0.035, 0.006, fr, 0, y0 - 0.02, dzc, 1);
    k.rbox(w - 0.09, 0.045, 0.035, 0.006, fr, 0, y0 - 0.02 + dh - 0.045, dzc, 1);
    k.rbox(0.022, 0.5, 0.022, 0.008, M.steel(), w / 2 - 0.07, 0.9, d / 2 - 0.011, 1);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { w, d } = FR;
      D.rr(ctx, 0, -0.02, w, d - 0.045, 0.01, tint(c.body, 0.6));
      D.rr(ctx, 0, -0.03, w - 0.1, d - 0.14, 0.005, '#f7f8f7', INK_SOFT, LINE_THIN);
      for (let j = 0; j < 6; j++) D.circle(ctx, -0.27 + j * 0.108, 0.18, 0.036, tint(PRODUCT[j % 2 ? 4 : 3], 0.4), INK_SOFT, 0.006);
      D.rr(ctx, 0, d / 2 - 0.02, w, 0.035, 0.004, '#cfe6ee', undefined, 0.008);
      D.line(ctx, w / 2 - 0.07, d / 2 - 0.004, w / 2 - 0.07, d / 2, undefined, 0.02);
    }),
};

/* ------------------------------------------------------------------ fruit & vegetable stand */

const PS = { w: 1.5, d: 0.92, h: 1.22, cw: 0.46, cd: 0.36, ch: 0.13 };

type Produce = 'orange' | 'tomato' | 'cucumber' | 'apple' | 'lemon' | 'banana';
const PRODUCE_COLOR: Record<Produce, string> = {
  orange: '#f08a1c',
  tomato: '#d8362c',
  cucumber: '#3f7a35',
  apple: '#c8372d',
  lemon: '#f2d03b',
  banana: '#f0cf45',
};
const PS_LAYOUT: Produce[][] = [
  ['orange', 'tomato', 'cucumber'],
  ['apple', 'lemon', 'banana'],
];

function crate(kind: Produce, wood: THREE.Material, seed: number): Kit {
  const k = new Kit();
  const { cw, cd, ch } = PS;
  const t = 0.012;
  k.box(cw, t, cd, wood, 0, 0, 0);
  for (const s of [-1, 1]) {
    k.box(cw, ch - 0.03, t, wood, 0, 0.03, s * (cd / 2 - t / 2));
    k.box(t, ch, cd - 2 * t, wood, s * (cw / 2 - t / 2), 0, 0);
  }
  const col = PRODUCE_COLOR[kind];
  const m = M.paint(col, 0.45);
  // a bed underneath so the heap reads as full
  k.box(cw - 2 * t - 0.004, ch * 0.55, cd - 2 * t - 0.004, M.matte(darken(col, 0.35)), 0, t, 0);
  const r = rng(seed);
  const y = t + ch * 0.55;
  if (kind === 'cucumber') {
    for (let i = 0; i < 9; i++) {
      const s = k.sphere(0.024, m, -cw / 2 + 0.06 + (i % 5) * 0.085 + (i > 4 ? 0.04 : 0), y + 0.02 + (i > 4 ? 0.03 : 0), (r() - 0.5) * 0.06, 1, 1, 4.6, 7);
      s.rotation.y = (r() - 0.5) * 0.3;
    }
  } else if (kind === 'banana') {
    for (let b = 0; b < 3; b++) {
      for (let i = 0; i < 3; i++) {
        const g = new THREE.TorusGeometry(0.075, 0.017, 5, 6, 1.7);
        const me = k.geo(g, m, -0.14 + b * 0.14, y + 0.012 + i * 0.012, -0.03 + (i - 1) * 0.036);
        me.rotation.set(-Math.PI / 2 + 0.25, 0, 0.7 + b * 0.5);
      }
    }
  } else {
    const rad = kind === 'orange' ? 0.046 : kind === 'apple' ? 0.042 : kind === 'tomato' ? 0.04 : 0.036;
    const nx = Math.floor((cw - 0.04) / (rad * 2));
    const nz = Math.floor((cd - 0.04) / (rad * 2));
    const alt = kind === 'apple' ? M.paint('#8fb83f', 0.45) : m;
    let n = 0;
    for (let iz = 0; iz < nz; iz++) {
      for (let ix = 0; ix < nx; ix++) {
        if (n++ % 9 === 7) continue;
        const x = -cw / 2 + 0.02 + rad + ix * ((cw - 0.04 - 2 * rad) / (nx - 1)) + (r() - 0.5) * 0.008;
        const z = -cd / 2 + 0.02 + rad + iz * ((cd - 0.04 - 2 * rad) / (nz - 1)) + (r() - 0.5) * 0.008;
        k.sphere(rad, kind === 'apple' && (ix + iz) % 3 === 0 ? alt : m, x, y + rad * 0.55 + r() * 0.012, z, 1, kind === 'tomato' ? 0.82 : 1, kind === 'lemon' ? 1.3 : 1, 7);
      }
    }
  }
  return k;
}

const produceStand: FurnitureDef = {
  id: 'produce-stand',
  name: 'דוכן פירות וירקות',
  category: 'public',
  size: { w: PS.w, d: PS.d, h: PS.h },
  colors: [slot('wood', 'עץ', '#b98a5a')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { w } = PS;
    const wood = M.wood(c.wood, 0.7);
    const crateWood = M.wood(lighten(c.wood, 0.25), 0.75);
    const tilt = 0.3;
    // stepped frame: two tiers
    const tiers = [
      { y: 0.5, z: 0.2 },
      { y: 0.84, z: -0.19 },
    ];
    for (const s of [-1, 1]) {
      const x = s * (w / 2 - 0.03);
      k.box(0.05, 0.42, 0.05, wood, x, 0, 0.4);
      k.box(0.05, 1.02, 0.05, wood, x, 0, -0.41);
      k.box(0.05, 0.74, 0.05, wood, x, 0, 0.0);
      k.beam([x, 0.39, 0.42], [x, 0.63, -0.03], 0.04, 0.06, wood);
      k.beam([x, 0.73, 0.02], [x, 0.99, -0.43], 0.04, 0.06, wood);
      k.beam([x, 0.12, 0.4], [x, 0.12, -0.41], 0.035, 0.05, wood);
    }
    tiers.forEach((tr, ti) => {
      // sloping shelf board under the crates
      const board = k.box(w - 0.06, 0.02, 0.44, wood, 0, 0, 0);
      board.rotation.x = tilt;
      board.position.set(0, tr.y - 0.012, tr.z);
      const lip = k.box(w - 0.06, 0.05, 0.02, wood, 0, 0, 0);
      lip.rotation.x = tilt;
      lip.position.set(0, tr.y - 0.012 - Math.sin(tilt) * 0.22 + 0.02, tr.z + Math.cos(tilt) * 0.22);
      PS_LAYOUT[ti].forEach((kind, i) => {
        const g = k.sub(crate(kind, crateWood, 7 + ti * 3 + i), (i - 1) * 0.485, tr.y, tr.z);
        g.rotation.x = tilt;
        // chalk price tag
        const tx = (i - 1) * 0.485 + 0.15;
        const ty = tr.y + 0.2;
        const tz = tr.z - 0.14;
        k.rod([tx, tr.y + 0.05, tz], [tx, ty, tz], 0.004, M.matte('#8a6a48'), 0.004, 4);
        const tag = k.rbox(0.1, 0.07, 0.006, 0.004, M.matte('#2b2f2c'), tx, ty, tz, 1);
        tag.rotation.x = -0.2;
        const line = k.box(0.06, 0.008, 0.002, M.matte('#f4f3ea'), tx, ty + 0.035, tz + 0.005);
        line.rotation.x = -0.2;
      });
    });
    // spare crates and a sack underneath
    for (const [x, z] of [
      [-0.42, -0.12],
      [0.1, -0.12],
    ]) {
      k.sub(crate('apple', crateWood, 3), x, 0.0, z);
    }
    k.sphere(0.17, M.fabric('#c9b089', 9), 0.52, 0.15, -0.1, 1, 0.9, 1, 10);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { w, d, cw } = PS;
      D.rr(ctx, 0, 0, w, d - 0.02, 0.01, tint(c.wood, 0.3));
      const zs = [0.21, -0.2];
      PS_LAYOUT.forEach((row, ti) => {
        row.forEach((kind, i) => {
          const x = (i - 1) * 0.485;
          D.rr(ctx, x, zs[ti], cw, 0.36, 0.01, tint(PRODUCE_COLOR[kind], 0.6), undefined, LINE_THIN);
          for (let a = 0; a < 3; a++) for (let b = 0; b < 4; b++) D.circle(ctx, x - 0.15 + b * 0.1, zs[ti] - 0.1 + a * 0.1, 0.04, tint(PRODUCE_COLOR[kind], 0.25), INK_SOFT, 0.005);
        });
      });
    }),
};

/* ------------------------------------------------------------------ checkout counter */

const CK = { w: 2.2, d: 0.9, h: 1.34, topY: 0.86, bz: 0.12, bd: 0.62 };

const checkoutCounter: FurnitureDef = {
  id: 'checkout-counter',
  name: 'קופה',
  category: 'public',
  size: { w: CK.w, d: CK.d, h: CK.h },
  colors: [slot('body', 'גוף', '#e9e6df'), slot('accent', 'פס צבע', '#3f8fd0')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { w, topY, bz, bd } = CK;
    const body = M.paint(c.body, 0.5);
    const accent = M.paint(c.accent, 0.45);
    const steel = M.steel();
    const dark = M.plastic('#26282c');
    // lane body with plinth and a coloured bumper band
    k.box(w - 0.02, 0.1, bd - 0.04, M.matte('#2f3032'), 0, 0, bz);
    k.rbox(w, topY - 0.1 - 0.03, bd, 0.02, body, 0, 0.1, bz, 1);
    k.rbox(w + 0.0, 0.07, bd + 0.012, 0.02, accent, 0, 0.42, bz, 1);
    k.rbox(w, 0.03, bd, 0.008, steel, 0, topY - 0.03, bz, 1);
    // conveyor belt with side rails and a divider bar
    const bx0 = -w / 2 + 0.06;
    const bx1 = 0.12;
    k.box(bx1 - bx0, 0.004, bd - 0.2, M.rubber('#1d1e20'), (bx0 + bx1) / 2, topY, bz);
    for (const s of [-1, 1]) k.rbox(bx1 - bx0 + 0.04, 0.03, 0.03, 0.008, steel, (bx0 + bx1) / 2, topY, bz + s * (bd / 2 - 0.085), 1);
    axisCyl(k, 0.02, bd - 0.2, steel, bx0 - 0.005, topY - 0.005, bz, 'z', 0.02, 10);
    const div = k.rbox(0.04, 0.04, bd - 0.22, 0.008, accent, -0.55, topY + 0.004, bz, 1);
    div.rotation.z = Math.PI / 4;
    div.position.y = topY + 0.032;
    // groceries riding the belt
    k.box(0.1, 0.17, 0.06, prod(1), -0.86, topY + 0.004, bz + 0.05);
    k.cyl(0.034, 0.105, prod(0), -0.72, topY + 0.004, bz - 0.08, 0.034, 8);
    bottle(k, -0.3, topY + 0.004, bz + 0.08, 0.26, 3, '#f3f1ec');
    k.sphere(0.045, M.paint('#f08a1c', 0.45), -0.36, topY + 0.045, bz - 0.09, 1, 1, 1, 8);
    k.sphere(0.045, M.paint('#f08a1c', 0.45), -0.26, topY + 0.045, bz - 0.11, 1, 1, 1, 8);
    // scanner window + upright scanner
    k.box(0.3, 0.004, 0.3, M.screen('#10161c'), 0.32, topY, bz + 0.02);
    k.rbox(0.3, 0.2, 0.05, 0.012, dark, 0.32, topY, bz - bd / 2 + 0.05, 1);
    k.box(0.24, 0.13, 0.004, M.screen('#10161c'), 0.32, topY + 0.035, bz - bd / 2 + 0.076);
    // bagging well with a paper bag
    k.box(0.5, 0.004, bd - 0.16, M.matte('#8d9093'), 0.8, topY, bz);
    const bag = M.matte('#c49a6c');
    k.box(0.26, 0.3, 0.004, bag, 0.82, topY + 0.004, bz - 0.07);
    k.box(0.26, 0.3, 0.004, bag, 0.82, topY + 0.004, bz + 0.09);
    for (const s of [-1, 1]) k.box(0.004, 0.3, 0.16, bag, 0.82 + s * 0.13, topY + 0.004, bz + 0.01);
    k.sphere(0.06, M.foliage(PAL.leafLight), 0.78, topY + 0.3, bz + 0.0, 1.3, 0.7, 1, 7);
    // cashier side: register screen on a post, keyboard, card terminal for the customer
    const zc = bz - bd / 2 - 0.02;
    k.rbox(0.56, 0.03, 0.22, 0.006, body, 0.32, topY - 0.14, zc - 0.07, 1);
    k.box(0.5, 0.11, 0.02, body, 0.32, topY - 0.25, zc + 0.01);
    k.rbox(0.3, 0.02, 0.12, 0.005, dark, 0.3, topY - 0.11, zc - 0.07, 1);
    k.cyl(0.018, 0.34, steel, 0.6, topY, bz - bd / 2 + 0.06, 0.018, 10);
    const scr = new Kit();
    scr.rbox(0.34, 0.25, 0.025, 0.008, dark, 0, 0, 0, 1);
    scr.box(0.31, 0.21, 0.002, M.glow('#bfe3ff', 0.6, '#d9eefc'), 0, 0.02, -0.0135);
    const sg = k.sub(scr, 0.6, topY + 0.24, bz - bd / 2 + 0.05);
    sg.rotation.x = 0.2;
    const term = new Kit();
    term.rbox(0.085, 0.15, 0.03, 0.008, dark, 0, 0, 0, 1);
    term.box(0.065, 0.05, 0.002, M.glow('#bfe3ff', 0.5, '#d9eefc'), 0, 0.09, 0.0155);
    const tg = k.sub(term, 0.56, topY + 0.07, bz + bd / 2 - 0.07);
    tg.rotation.x = -0.6;
    k.cyl(0.012, 0.09, steel, 0.56, topY, bz + bd / 2 - 0.09, 0.012, 8);
    // lane light
    k.cyl(0.015, 0.4, steel, 0.98, topY, bz - bd / 2 + 0.06, 0.015, 8);
    k.rbox(0.16, 0.08, 0.16, 0.02, M.glow('#7dff9a', 1.1, '#63d67c'), 0.98, topY + 0.4, bz - bd / 2 + 0.06, 1).castShadow = false;
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { w, bz, bd } = CK;
      D.rr(ctx, 0.32, bz - bd / 2 - 0.09, 0.56, 0.22, 0.01, tint(c.body, 0.3), undefined, LINE_THIN);
      D.rr(ctx, 0, bz, w, bd, 0.02, tint(c.body, 0.4));
      D.box(ctx, -w / 2 + 0.06, bz - bd / 2 + 0.1, 0.12, bz + bd / 2 - 0.1, 0.01, '#6a6d72', undefined, LINE_THIN);
      for (let i = 0; i < 7; i++) D.line(ctx, -w / 2 + 0.12 + i * 0.15, bz - bd / 2 + 0.11, -w / 2 + 0.12 + i * 0.15, bz + bd / 2 - 0.11, '#9a9da2', 0.006);
      D.rr(ctx, 0.32, bz + 0.02, 0.3, 0.3, 0.01, '#3a4048', undefined, LINE_THIN);
      D.rr(ctx, 0.8, bz, 0.5, bd - 0.16, 0.01, '#d5d7d9', INK_SOFT, LINE_THIN);
      D.rr(ctx, 0.82, bz + 0.01, 0.26, 0.16, 0.005, '#d9bd96', undefined, LINE_THIN);
      D.rr(ctx, 0.6, bz - bd / 2 + 0.05, 0.34, 0.04, 0.005, '#4a4d52', undefined, 0.008);
      D.circle(ctx, 0.98, bz - bd / 2 + 0.06, 0.07, tint('#63d67c', 0.2), undefined, LINE_THIN);
      D.line(ctx, -w / 2, bz + bd / 2, w / 2, bz + bd / 2, tint(c.accent, 0.1), 0.02);
    }),
};

/* ------------------------------------------------------------------ shopping cart */

const CART = { w: 0.6, d: 1.02, h: 1.02 };

const shoppingCart: FurnitureDef = {
  id: 'shopping-cart',
  name: 'עגלת קניות',
  category: 'public',
  size: CART,
  colors: [slot('handle', 'ידית', '#d8473d')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const chrome = M.metal('#cfd3d6', 0.3, 0.95);
    const wire = netMat('#c3c7cb', 0.13, false, [1, 1]);
    const red = M.plastic(c.handle);
    // basket corners: top rim (y = 0.94) and floor (rises towards the front)
    const T: V3[] = [
      [-0.27, 0.94, -0.4],
      [0.27, 0.94, -0.4],
      [0.22, 0.94, 0.47],
      [-0.22, 0.94, 0.47],
    ];
    const B: V3[] = [
      [-0.22, 0.5, -0.34],
      [0.22, 0.5, -0.34],
      [0.16, 0.56, 0.36],
      [-0.16, 0.56, 0.36],
    ];
    const cell = 1 / 0.045;
    const panel = (a: V3, b: V3, cc: V3, d2: V3): void => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...cc, ...d2], 3));
      const wv = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) * cell;
      const hv = Math.hypot(d2[0] - a[0], d2[1] - a[1], d2[2] - a[2]) * cell;
      g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, wv, 0, wv, hv, 0, hv], 2));
      g.setIndex([0, 1, 2, 0, 2, 3]);
      g.computeVertexNormals();
      k.geo(g, wire).castShadow = false;
    };
    for (let i = 0; i < 4; i++) panel(B[i], B[(i + 1) % 4], T[(i + 1) % 4], T[i]);
    panel(B[0], B[1], B[2], B[3]);
    // rim, corner wires, floor frame
    k.tube([...T, T[0]], 0.009, chrome, { seg: 24, radial: 6, tension: 0.05 });
    k.tube([...B, B[0]], 0.006, chrome, { seg: 16, radial: 5, tension: 0.05 });
    for (let i = 0; i < 4; i++) k.rod(B[i], T[i], 0.006, chrome, 0.006, 5);
    // chassis: two side tubes from the handle down to the wheel base
    for (const s of [-1, 1]) {
      k.tube(
        [
          [s * 0.25, 1.0, -0.49],
          [s * 0.25, 0.9, -0.44],
          [s * 0.24, 0.5, -0.37],
          [s * 0.23, 0.26, -0.36],
          [s * 0.22, 0.17, -0.28],
          [s * 0.2, 0.16, 0.1],
          [s * 0.16, 0.16, 0.42],
        ],
        0.013,
        chrome,
        { seg: 22, radial: 6, tension: 0.3 },
      );
      k.rod([s * 0.17, 0.17, 0.3], [s * 0.16, 0.56, 0.34], 0.01, chrome, 0.01, 6);
      // castors
      for (const [z, r] of [
        [-0.34, 0.062],
        [0.4, 0.055],
      ]) {
        const x = s * (z < 0 ? 0.23 : 0.17);
        k.cyl(0.012, 0.16 - r * 2 + 0.02, chrome, x, r * 2 - 0.01, z, 0.012, 6);
        axisCyl(k, r, 0.028, M.rubber('#2a2b2e'), x, r, z + 0.02, 'x', r, 12);
        axisCyl(k, r * 0.5, 0.032, chrome, x, r, z + 0.02, 'x', r * 0.5, 8);
      }
    }
    k.rod([-0.16, 0.16, 0.42], [0.16, 0.16, 0.42], 0.013, chrome, 0.013, 6);
    for (let i = 0; i < 4; i++) k.rod([-0.2 + i * 0.01, 0.16, -0.2 + i * 0.16], [0.2 - i * 0.01, 0.16, -0.2 + i * 0.16], 0.006, chrome, 0.006, 5);
    // handle with a plastic grip, child seat flap
    axisCyl(k, 0.013, 0.5, chrome, 0, 1.0, -0.49, 'x', 0.013, 8);
    axisCyl(k, 0.02, 0.4, red, 0, 1.0, -0.49, 'x', 0.02, 10);
    const flap = k.rbox(0.4, 0.2, 0.012, 0.006, red, 0, 0.7, -0.33, 1);
    flap.rotation.x = 0.16;
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.poly(
        ctx,
        [
          [-0.27, -0.4],
          [0.27, -0.4],
          [0.22, 0.47],
          [-0.22, 0.47],
        ],
        true,
        '#eef0f1',
      );
      for (let i = 1; i < 8; i++) D.line(ctx, -0.26 + i * 0.006, -0.4 + i * 0.109, 0.26 - i * 0.006, -0.4 + i * 0.109, INK_SOFT, 0.005);
      for (let i = -2; i <= 2; i++) D.line(ctx, i * 0.09, -0.4, i * 0.075, 0.47, INK_SOFT, 0.005);
      D.line(ctx, -0.25, -0.49, 0.25, -0.49, undefined, 0.045);
      D.line(ctx, -0.2, -0.49, 0.2, -0.49, tint(c.handle, 0.15), 0.03);
      for (const s of [-1, 1]) D.line(ctx, s * 0.25, -0.49, s * 0.26, -0.4, undefined, 0.02);
    }),
};

/* ------------------------------------------------------------------ bakery display */

const BK = { w: 1.5, d: 0.76, h: 1.3, baseH: 0.56, topY: 1.26 };

function glassProfile(): Array<[number, number]> {
  // front glass: quarter-ellipse from the deck front edge up to the top cap, in (z, y)
  const pts: Array<[number, number]> = [];
  const z0 = BK.d / 2 - 0.03;
  const zTop = -0.02;
  for (let i = 0; i <= 10; i++) {
    const a = (i / 10) * (Math.PI / 2);
    pts.push([zTop + (z0 - zTop) * Math.cos(a), BK.baseH + 0.02 + (BK.topY - BK.baseH - 0.02) * Math.sin(a)]);
  }
  return pts;
}

const bakeryDisplay: FurnitureDef = {
  id: 'bakery-display',
  name: 'ויטרינת מאפים',
  category: 'public',
  size: { w: BK.w, d: BK.d, h: BK.h },
  colors: [slot('body', 'גוף', PAL.oak), slot('trim', 'מסגרת', '#2f3236')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { w, d, baseH, topY } = BK;
    const wood = M.wood(c.body);
    const trim = M.paint(c.trim, 0.4);
    const glass = M.glass('#dff0f4', 0.2);
    const white = M.paint('#f6f4ee', 0.5);
    // base cabinet
    k.box(w - 0.04, 0.08, d - 0.08, M.matte('#2f3032'), 0, 0, 0);
    k.rbox(w, baseH - 0.08, d - 0.02, 0.01, wood, 0, 0.08, 0, 1);
    for (let i = 0; i < 3; i++) k.rbox(w / 3 - 0.05, baseH - 0.2, 0.01, 0.01, M.wood(darken(c.body, 0.08)), (i - 1) * (w / 3), 0.14, d / 2 - 0.008, 1);
    k.rbox(w, 0.025, d, 0.006, white, 0, baseH - 0.005, 0, 1);
    // glass: curved front, flat ends, back frame + top cap with warm light
    const prof = glassProfile();
    const outer = prof.map(([z, y]) => [z, y] as [number, number]);
    const inner = prof.map(([z, y]) => [z - 0.008, y - 0.006] as [number, number]).reverse();
    k.geo(extrudeX(polyShape([...outer, ...inner]), w - 0.03, 0, 4), glass).castShadow = false;
    const end = polyShape([[-d / 2 + 0.04, baseH + 0.02], ...prof, [-d / 2 + 0.04, topY]]);
    for (const s of [-1, 1]) {
      k.geo(extrudeX(end, 0.008, 0, 4), glass, s * (w / 2 - 0.012), 0, 0).castShadow = false;
      k.box(0.03, topY - baseH - 0.02, 0.03, trim, s * (w / 2 - 0.015), baseH + 0.02, -d / 2 + 0.035);
    }
    k.rbox(w, 0.04, 0.36, 0.008, trim, 0, topY, -d / 2 + 0.2, 1);
    k.box(w - 0.1, 0.008, 0.06, M.glow('#ffe2b0', 1.5, '#fff3dc'), 0, topY - 0.008, -0.08).castShadow = false;
    // two glass shelves
    const shelves = [
      { y: baseH + 0.26, z0: -d / 2 + 0.05, z1: 0.17 },
      { y: baseH + 0.48, z0: -d / 2 + 0.05, z1: 0.06 },
    ];
    for (const sh of shelves) k.box(w - 0.06, 0.008, sh.z1 - sh.z0, M.glass('#e6f4f6', 0.3), 0, sh.y - 0.008, (sh.z0 + sh.z1) / 2).castShadow = false;
    const dough = M.matte('#d79a4e');
    const crust = M.matte('#b8732f');
    const deckY = baseH + 0.02;
    // deck: two cakes on stands, loaves, a tray of croissants
    const cake = (x: number, z: number, icing: string, topping: string): void => {
      k.cyl(0.13, 0.012, white, x, deckY + 0.05, z, 0.13, 16);
      k.cyl(0.03, 0.05, white, x, deckY, z, 0.05, 8);
      k.cyl(0.105, 0.085, M.matte(icing), x, deckY + 0.062, z, 0.105, 16);
      k.cyl(0.108, 0.012, M.matte(lighten(icing, 0.4)), x, deckY + 0.147, z, 0.108, 16);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        k.sphere(0.016, M.paint(topping, 0.3), x + Math.cos(a) * 0.07, deckY + 0.168, z + Math.sin(a) * 0.07, 1, 1, 1, 6);
      }
    };
    cake(-0.52, 0.02, '#e9a5b8', '#c8372d');
    cake(-0.18, -0.06, '#6b4630', '#f6f4ee');
    for (let i = 0; i < 3; i++) {
      const lf = k.sphere(0.06, crust, 0.2 + i * 0.03, deckY + 0.05 + (i === 2 ? 0.07 : 0), -0.14 + (i % 2) * 0.13, 2.2, 0.85, 1, 8);
      lf.rotation.y = 0.2 + i * 0.3;
    }
    k.box(0.36, 0.008, 0.26, M.metal('#c9ccce', 0.4, 0.9), 0.52, deckY, 0.02);
    for (let i = 0; i < 6; i++) {
      const g = new THREE.TorusGeometry(0.036, 0.02, 5, 7, Math.PI * 1.05);
      const m = k.geo(g, dough, 0.42 + (i % 3) * 0.1, deckY + 0.022, -0.03 + Math.floor(i / 3) * 0.11);
      m.rotation.set(-Math.PI / 2, 0, 0.4);
      m.scale.set(1, 1, 1.2);
    }
    // lower shelf: doughnuts
    const icings = ['#e87aa0', '#6b4630', '#f6f4ee', '#f2c21b', '#e87aa0', '#6b4630', '#f6f4ee'];
    icings.forEach((col, i) => {
      const x = -0.6 + i * 0.2;
      const z = -0.12 + (i % 2) * 0.12;
      const y = shelves[0].y + 0.022;
      const t = new THREE.TorusGeometry(0.036, 0.022, 5, 9);
      t.rotateX(Math.PI / 2);
      k.geo(t, dough, x, y, z);
      const ic = new THREE.TorusGeometry(0.036, 0.019, 4, 9);
      ic.rotateX(Math.PI / 2);
      ic.scale(1.02, 0.6, 1.02);
      k.geo(ic, M.paint(col, 0.35), x, y + 0.013, z);
    });
    // upper shelf: cupcakes + cookie stacks
    for (let i = 0; i < 7; i++) {
      const x = -0.6 + i * 0.2;
      const y = shelves[1].y;
      const z = -0.17;
      if (i % 3 === 2) {
        for (let j = 0; j < 4; j++) k.cyl(0.04, 0.012, j % 2 ? crust : dough, x + (j % 2) * 0.006, y + j * 0.013, z, 0.04, 9);
      } else {
        k.cyl(0.026, 0.04, M.paint(PRODUCT[(i * 2) % 9], 0.6), x, y, z, 0.036, 9);
        k.sphere(0.036, M.matte(['#f6f4ee', '#e9a5b8', '#8a5a3a'][i % 3]), x, y + 0.052, z, 1, 0.75, 1, 7);
        k.sphere(0.01, M.paint('#c8372d', 0.3), x, y + 0.083, z, 1, 1, 1, 5);
      }
    }
    // price cards
    for (const x of [-0.52, -0.18, 0.2, 0.52]) k.box(0.06, 0.035, 0.003, white, x, deckY, d / 2 - 0.09).rotation.x = -0.3;
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { w, d } = BK;
      D.rr(ctx, 0, 0, w, d, 0.01, tint(c.body, 0.35));
      D.rr(ctx, 0, 0.02, w - 0.04, d - 0.1, 0.01, '#e4f1f4', INK_SOFT, LINE_THIN);
      D.rr(ctx, 0, -d / 2 + 0.2, w, 0.36, 0.008, tint(c.trim, 0.55), undefined, LINE_THIN);
      D.circle(ctx, -0.52, 0.12, 0.11, tint('#e9a5b8', 0.3), INK_SOFT, LINE_THIN);
      D.circle(ctx, -0.18, 0.12, 0.11, tint('#6b4630', 0.5), INK_SOFT, LINE_THIN);
      D.ellipse(ctx, 0.22, 0.12, 0.12, 0.055, tint('#b8732f', 0.4), INK_SOFT, LINE_THIN);
      D.rr(ctx, 0.52, 0.12, 0.3, 0.2, 0.01, '#f4f5f6', INK_SOFT, LINE_THIN);
      ctx.beginPath();
      ctx.moveTo(-w / 2 + 0.02, d / 2 - 0.03);
      ctx.lineTo(w / 2 - 0.02, d / 2 - 0.03);
      ctx.strokeStyle = '#7fb0c4';
      ctx.lineWidth = 0.02;
      ctx.stroke();
    }),
};

export const PUBLIC_SHOP: FurnitureDef[] = [shopShelf, shopFridge, produceStand, checkoutCounter, shoppingCart, bakeryDisplay];
