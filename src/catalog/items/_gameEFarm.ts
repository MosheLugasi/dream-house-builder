import * as THREE from 'three';
import { D, INK_SOFT, Kit, LINE_THIN, M, PAL, blobGeo, darken, extrudeZ, latheGeo, lighten, organicGeo, rng, roundedBoxGeo, sym, tint } from '../kit';
import type { FurnitureDef } from '../types';
import { slot } from './_parts';

/**
 * Farm pieces (team E): the vegetable bed the "החווה שלי" mini-game grows crops in, a well and a
 * garden tap to fill the watering can, a scarecrow, a market stand, a barn, a chicken coop, a long
 * rail fence, hay bales and produce crates. All of them are ordinary catalog items: the player can
 * place them anywhere, and the farm game uses whichever beds / taps / stands stand on its plot.
 */

const GROUP = 'חווה';

/* ------------------------------------------------------------------ vegetable bed */

export const FARM_BED = { w: 2.4, d: 1.2, h: 0.34 };
/** height of the soil surface of a farm bed (at its catalog size) */
export const FARM_BED_SOIL_Y = 0.27;

const farmBed: FurnitureDef = {
  id: 'farm-bed',
  name: 'ערוגת ירקות',
  category: 'outdoor',
  group: GROUP,
  tags: ['ערוגה', 'ירקות', 'גינה', 'חווה', 'אדמה', 'שתילה'],
  size: FARM_BED,
  colors: [slot('wood', 'מסגרת עץ', '#9a6b43'), slot('soil', 'אדמה', '#5b4332')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { w, d, h } = FARM_BED;
    const wood = M.wood(c.wood, 0.78);
    const post = M.wood(darken(c.wood, 0.15), 0.8);
    const t = 0.05;
    // two stacked boards on every side, with a small shadow gap
    for (const y of [0, 0.155]) {
      for (const s of [-1, 1]) {
        k.rbox(w - 0.02, 0.145, t, 0.008, wood, 0, y, s * (d / 2 - t / 2 - 0.005), 1);
        k.rbox(t, 0.145, d - 0.12, 0.008, wood, s * (w / 2 - t / 2 - 0.005), y, 0, 1);
      }
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.rbox(0.075, h, 0.075, 0.01, post, sx * (w / 2 - 0.0375), 0, sz * (d / 2 - 0.0375), 1);
    // soil with two planting ridges
    const soil = M.matte(c.soil);
    k.box(w - 2 * t - 0.02, 0.05, d - 2 * t - 0.02, M.matte(darken(c.soil, 0.12)), 0, FARM_BED_SOIL_Y - 0.06, 0);
    for (const z of [-d / 4 + 0.02, d / 4 - 0.02]) {
      const ridge = organicGeo(roundedBoxGeo(w - 0.2, 0.09, d / 2 - 0.16, 0.04, 2), 0.012, 7, z > 0 ? 3 : 4);
      k.geo(ridge, soil, 0, FARM_BED_SOIL_Y - 0.035, z);
    }
    // a few pebbles / clods
    const r = rng(11);
    const clod = M.matte(lighten(c.soil, 0.12));
    for (let i = 0; i < 7; i++) {
      k.geo(blobGeo(0.018 + r() * 0.012, 0, 20 + i, 0.3), clod, (r() - 0.5) * (w - 0.3), FARM_BED_SOIL_Y + 0.005, (r() - 0.5) * (d - 0.3));
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { w, d } = FARM_BED;
      D.rr(ctx, 0, 0, w, d, 0.02, tint(c.wood, 0.25));
      D.rr(ctx, 0, 0, w - 0.1, d - 0.1, 0.01, tint(c.soil, 0.35), INK_SOFT, LINE_THIN);
      for (const z of [-d / 4 + 0.02, d / 4 - 0.02]) D.line(ctx, -w / 2 + 0.15, z, w / 2 - 0.15, z, INK_SOFT, LINE_THIN);
    }),
};

/* ------------------------------------------------------------------ garden tap */

const TAP = { w: 0.6, d: 0.6, h: 1.0 };
const farmTap: FurnitureDef = {
  id: 'farm-tap',
  name: 'ברז מים לגינה',
  category: 'outdoor',
  group: GROUP,
  tags: ['ברז', 'מים', 'השקיה', 'דלי', 'חווה'],
  size: TAP,
  colors: [slot('pipe', 'צינור', '#5f7f8f'), slot('handle', 'ידית', '#c8402f')],
  actions: [{ kind: 'water', at: { x: 0, y: 0.8, z: 0.17 } }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const pipe = M.metal(c.pipe, 0.45, 0.6);
    k.rbox(0.56, 0.06, 0.56, 0.02, M.stone(PAL.concrete, 0.8), 0, 0, 0, 1);
    // drain grate
    k.box(0.22, 0.004, 0.22, M.blackMetal(), 0, 0.06, 0.12);
    k.cyl(0.035, 0.84, pipe, 0, 0.06, -0.12, 0.035, 12);
    k.sphere(0.045, pipe, 0, 0.9, -0.12, 1, 1, 1, 10);
    k.rod([0, 0.88, -0.12], [0, 0.88, 0.1], 0.025, pipe, 0.025, 10);
    k.rod([0, 0.88, 0.1], [0, 0.8, 0.17], 0.022, pipe, 0.02, 10);
    // the red wheel handle
    const h = M.plastic(c.handle);
    const ring = k.add(new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.01, 6, 16), h), 0, 0.97, 0.02);
    ring.rotation.x = Math.PI / 2;
    k.rod([-0.05, 0.97, 0.02], [0.05, 0.97, 0.02], 0.007, h, 0.007, 6);
    k.rod([0, 0.97, -0.03], [0, 0.97, 0.07], 0.007, h, 0.007, 6);
    k.cyl(0.008, 0.06, pipe, 0, 0.9, 0.02, 0.008, 6);
    // zinc bucket under the tap
    const zinc = M.brushed('#b9bec2', 0.6);
    k.lathe(
      [
        [0.001, 0],
        [0.11, 0],
        [0.135, 0.24],
        [0.14, 0.245],
        [0.128, 0.24],
        [0.104, 0.012],
        [0.001, 0.012],
      ],
      zinc,
      0,
      0.06,
      0.14,
      20,
    );
    k.disc(0.12, 0.01, M.water(), 0, 0.24, 0.14, 18);
    const bail = k.add(new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.004, 4, 16, Math.PI), M.blackMetal()), 0, 0.3, 0.14);
    bail.rotation.y = Math.PI / 2;
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 0.56, 0.56, 0.02, '#d9d6d0');
      D.circle(ctx, 0, -0.12, 0.04, tint(c.pipe, 0.2), INK_SOFT, LINE_THIN);
      D.circle(ctx, 0, 0.14, 0.14, '#cfd4d8', INK_SOFT, LINE_THIN);
      D.circle(ctx, 0, 0.14, 0.11, '#a9d3e0', null);
    }),
};

/* ------------------------------------------------------------------ well */

const WELL = { w: 1.6, d: 1.6, h: 2.35 };
const farmWell: FurnitureDef = {
  id: 'farm-well',
  name: 'באר מים',
  category: 'outdoor',
  group: GROUP,
  tags: ['באר', 'מים', 'דלי', 'אבן', 'חווה', 'כפר'],
  size: WELL,
  colors: [slot('stone', 'אבן', '#b9ad98'), slot('roof', 'גג', '#8f3b2a'), slot('wood', 'עץ', '#7a5638')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const R = 0.68;
    // stone ring: courses of rough stones around a lathe core
    k.lathe(
      [
        [0.52, 0],
        [R, 0],
        [R, 0.78],
        [0.52, 0.78],
        [0.52, 0.1],
      ],
      M.stone(darken(c.stone, 0.1), 0.9),
      0,
      0,
      0,
      24,
    );
    const r = rng(7);
    const stones = [M.stone(c.stone, 0.85), M.stone(lighten(c.stone, 0.1), 0.85), M.stone(darken(c.stone, 0.06), 0.85)];
    for (let row = 0; row < 4; row++) {
      const n = 13;
      for (let i = 0; i < n; i++) {
        const a = ((i + (row % 2) * 0.5) / n) * Math.PI * 2;
        const m = k.geo(organicGeo(roundedBoxGeo(0.3, 0.17, 0.12, 0.04, 1), 0.012, 6, row * 20 + i), stones[(i + row) % 3], Math.sin(a) * (R - 0.02), 0.1 + row * 0.19, Math.cos(a) * (R - 0.02));
        m.rotation.y = a;
        void r;
      }
    }
    k.rbox(1.42, 0.06, 1.42, 0.02, M.stone(lighten(c.stone, 0.05), 0.8), 0, 0.78, 0, 1).scale.set(1, 1, 1);
    k.disc(0.5, 0.02, M.water('#3c6470'), 0, 0.45, 0, 20);
    // posts, axle and crank
    const wood = M.wood(c.wood, 0.75);
    for (const s of [-1, 1]) k.rbox(0.1, 1.42, 0.1, 0.01, wood, s * 0.64, 0.8, 0, 1);
    k.rod([-0.7, 1.72, 0], [0.74, 1.72, 0], 0.045, wood, 0.045, 10);
    k.rod([0.74, 1.72, 0], [0.74, 1.55, 0.05], 0.015, M.blackMetal(), 0.015, 6);
    k.rod([0.74, 1.55, 0.05], [0.78, 1.55, 0.05], 0.02, wood, 0.02, 6);
    // rope coil and bucket
    k.cyl(0.06, 0.3, M.wicker('#c9b083'), 0, 1.72 - 0.06, 0, 0.06, 12).rotation.z = Math.PI / 2;
    k.rod([0, 1.68, 0], [0, 1.2, 0], 0.008, M.wicker('#c9b083'), 0.008, 5);
    k.lathe(
      [
        [0.001, 0],
        [0.1, 0],
        [0.13, 0.2],
        [0.115, 0.2],
        [0.09, 0.012],
        [0.001, 0.012],
      ],
      wood,
      0,
      1.0,
      0,
      14,
    );
    // gable roof (ridge along X)
    const roof = M.wood(c.roof, 0.7);
    for (const s of [-1, 1]) {
      k.beam([0, 2.3, 0], [0, 1.88, s * 0.76], 1.6, 0.04, roof);
    }
    k.rod([-0.77, 2.31, 0], [0.77, 2.31, 0], 0.03, M.wood(darken(c.roof, 0.25)), 0.03, 8);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 1.6, 1.56, 0.02, tint(c.roof, 0.45), INK_SOFT, LINE_THIN);
      D.line(ctx, -0.8, 0, 0.8, 0, INK_SOFT, LINE_THIN);
      D.circle(ctx, 0, 0, 0.68, null, INK_SOFT, LINE_THIN);
    }),
};

/* ------------------------------------------------------------------ scarecrow */

const SC = { w: 1.0, d: 0.5, h: 1.82 };
const scarecrow: FurnitureDef = {
  id: 'farm-scarecrow',
  name: 'דחליל',
  category: 'outdoor',
  group: GROUP,
  tags: ['דחליל', 'שדה', 'ציפורים', 'עורבים', 'חווה'],
  size: SC,
  colors: [slot('shirt', 'חולצה', '#c8553d'), slot('pants', 'מכנסיים', '#3f5f8a'), slot('hat', 'כובע', '#d8b45a')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const wood = M.wood('#7a5a3c', 0.85);
    k.cyl(0.03, 1.5, wood, 0, 0, 0, 0.028, 8);
    k.rod([-0.44, 1.28, 0], [0.44, 1.28, 0], 0.024, wood, 0.024, 6);
    // shirt (body + sleeves) with a contrasting patch
    const shirt = M.fabric(c.shirt);
    k.rbox(0.36, 0.44, 0.2, 0.06, shirt, 0, 0.94, 0, 2);
    for (const s of [-1, 1]) {
      k.rod([s * 0.14, 1.28, 0], [s * 0.4, 1.27, 0], 0.075, shirt, 0.06, 10);
      // straw sticking out of the cuffs
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        k.rod([s * 0.4, 1.27, 0], [s * (0.48 + (i % 2) * 0.02), 1.27 + Math.sin(a) * 0.05, Math.cos(a) * 0.05], 0.008, M.matte('#e2c56a'), 0.003, 4);
      }
    }
    k.box(0.1, 0.1, 0.01, M.fabric('#e8c85a'), 0.08, 1.05, 0.1);
    // pants hanging from the waist
    const pants = M.fabric(c.pants);
    for (const s of [-1, 1]) k.rod([s * 0.08, 0.96, 0], [s * 0.1, 0.56, 0.02], 0.07, pants, 0.06, 10);
    k.box(0.08, 0.08, 0.01, M.fabric('#b8763c'), -0.1, 0.72, 0.075);
    for (const s of [-1, 1]) for (let i = 0; i < 4; i++) k.rod([s * 0.1, 0.56, 0.02], [s * (0.08 + i * 0.015), 0.48, 0.02 + (i - 1.5) * 0.02], 0.007, M.matte('#e2c56a'), 0.003, 4);
    // burlap head with a friendly face
    const burlap = M.linen('#cdb48a');
    k.sphere(0.14, burlap, 0, 1.52, 0, 1, 1.05, 0.95, 14);
    k.cyl(0.05, 0.08, M.wicker('#a98a55'), 0, 1.36, 0, 0.06, 10);
    const ink = M.matte('#2a221c');
    for (const s of [-1, 1]) k.sphere(0.018, ink, s * 0.05, 1.56, 0.128, 1, 1, 0.6, 8);
    for (let i = 0; i < 7; i++) {
      const a = -0.9 + (i / 6) * 1.8;
      k.sphere(0.008, ink, Math.sin(a) * 0.07, 1.49 - Math.cos(a) * 0.025, 0.125, 1, 1, 0.6, 5);
    }
    k.add(new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.05, 6), M.matte('#e07a3a')), 0, 1.53, 0.15).rotation.x = Math.PI / 2;
    // straw hat
    const hat = M.wicker(c.hat);
    k.disc(0.24, 0.015, hat, 0, 1.63, 0, 20);
    k.cyl(0.12, 0.14, hat, 0, 1.64, 0, 0.1, 16);
    k.cyl(0.122, 0.035, M.fabric('#b83b2e'), 0, 1.65, 0, 0.115, 16);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.line(ctx, -0.46, 0, 0.46, 0, INK_SOFT, 0.03);
      D.circle(ctx, 0, 0, 0.24, tint(c.hat, 0.3), INK_SOFT, LINE_THIN);
      D.circle(ctx, 0, 0, 0.11, tint(c.hat, 0.1), INK_SOFT, LINE_THIN);
    }),
};

/* ------------------------------------------------------------------ market stand */

const MS = { w: 2.6, d: 1.3, h: 2.45 };

const signFaces = new Map<string, THREE.Material>();
/** A painted board with Hebrew text (a canvas texture in the browser, plain paint in Node). */
export function paintedBoard(text: string, bg: string, fg: string, w = 512, h = 160): THREE.Material {
  const key = `${text}|${bg}|${fg}|${w}x${h}`;
  let m = signFaces.get(key);
  if (m) return m;
  if (typeof document === 'undefined') m = M.paint(bg);
  else {
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const g = cv.getContext('2d')!;
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 6;
    g.strokeRect(10, 10, w - 20, h - 20);
    g.fillStyle = fg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.direction = 'rtl';
    let px = Math.round(h * 0.48);
    g.font = `700 ${px}px system-ui, Arial, sans-serif`;
    const tw = g.measureText(text).width;
    if (tw > w * 0.86) {
      px = Math.floor((px * w * 0.86) / tw);
      g.font = `700 ${px}px system-ui, Arial, sans-serif`;
    }
    g.fillText(text, w / 2, h / 2 + 4);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 });
  }
  signFaces.set(key, m);
  return m;
}

/** a crate full of produce (local origin = bottom centre of the crate) */
function produceCrate(k: Kit, x: number, y: number, z: number, w: number, d: number, kind: 'tomato' | 'carrot' | 'lettuce' | 'cucumber' | 'lemon' | 'strawberry', crate: THREE.Material, seed: number, tilt = 0): void {
  const g = new Kit();
  const h = 0.16;
  for (const s of [-1, 1]) {
    g.box(w, h, 0.018, crate, 0, 0, s * (d / 2 - 0.009));
    g.box(0.018, h, d - 0.036, crate, s * (w / 2 - 0.009), 0, 0);
  }
  g.box(w - 0.02, 0.012, d - 0.02, crate, 0, 0.01, 0);
  const r = rng(seed);
  const n = Math.round((w * d) / 0.012);
  const mats = {
    tomato: M.plastic('#d83a2a'),
    carrot: M.matte('#ec7c2a'),
    lettuce: M.foliage('#78b04a'),
    cucumber: M.plastic('#3f7a2e'),
    lemon: M.plastic('#efcf3a'),
    strawberry: M.plastic('#d42c3a'),
  };
  const mat = mats[kind];
  for (let i = 0; i < n; i++) {
    const px = (r() - 0.5) * (w - 0.08);
    const pz = (r() - 0.5) * (d - 0.08);
    const py = h - 0.02 + r() * 0.03;
    if (kind === 'carrot') {
      const m = g.add(new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.16, 6), mat), px, py, pz);
      m.rotation.set(Math.PI / 2 + (r() - 0.5) * 0.4, 0, (r() - 0.5) * 0.6);
    } else if (kind === 'cucumber') {
      const m = g.add(new THREE.Mesh(new THREE.CapsuleGeometry(0.022, 0.12, 2, 6), mat), px, py, pz);
      m.rotation.set(Math.PI / 2, 0, r() * Math.PI);
    } else if (kind === 'lettuce') {
      if (i % 3) continue;
      g.geo(blobGeo(0.07, 1, seed + i, 0.25, 3), mat, px, py, pz).scale.y = 0.8;
    } else {
      const rad = kind === 'strawberry' ? 0.022 : kind === 'lemon' ? 0.033 : 0.035;
      g.sphere(rad, mat, px, py, pz, 1, kind === 'lemon' ? 0.8 : 0.9, kind === 'lemon' ? 1.25 : 1, 7);
    }
  }
  const sub = k.sub(g, x, y, z);
  sub.rotation.x = tilt;
}

const marketStand: FurnitureDef = {
  id: 'farm-market-stand',
  name: 'דוכן שוק של החווה',
  category: 'outdoor',
  group: GROUP,
  tags: ['דוכן', 'שוק', 'ירקות', 'פירות', 'מכירה', 'חווה', 'סוכך'],
  size: MS,
  colors: [slot('wood', 'עץ', '#b07f4f'), slot('awning', 'סוכך', '#d8453a'), slot('awning2', 'פס בסוכך', '#f4efe4')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const wood = M.wood(c.wood, 0.75);
    const dark = M.wood(darken(c.wood, 0.25), 0.8);
    const W = MS.w - 0.1;
    // counter: four legs, a top and a planked front facing the customers (+Z)
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.08, 0.9, 0.08, dark, sx * (W / 2 - 0.05), 0, sz * 0.38);
    k.rbox(W, 0.05, 0.9, 0.01, wood, 0, 0.88, 0, 1);
    for (let i = 0; i < 5; i++) k.rbox(W - 0.04, 0.15, 0.03, 0.008, wood, 0, 0.08 + i * 0.16, 0.43, 1);
    k.box(W - 0.06, 0.02, 0.8, dark, 0, 0.28, 0);
    // price chalkboard hanging on the front
    k.box(0.62, 0.36, 0.02, paintedBoard('ירקות טריים', '#26332b', '#f5f1e3', 512, 300), 0, 0.36, 0.455);
    k.box(0.66, 0.4, 0.015, dark, 0, 0.34, 0.442);
    // produce crates on the counter, tilted towards the customers
    const crate = M.wood('#c9a26c', 0.85);
    const kinds = ['tomato', 'cucumber', 'lettuce', 'carrot', 'strawberry'] as const;
    kinds.forEach((kind, i) => produceCrate(k, -W / 2 + 0.26 + i * ((W - 0.52) / 4), 0.93, 0.05, 0.42, 0.5, kind, crate, 30 + i, 0.18));
    // posts and a striped awning sloping towards the front
    for (const sx of [-1, 1]) {
      k.box(0.07, 2.25, 0.07, dark, sx * (W / 2 - 0.035), 0, -0.42);
      k.box(0.07, 1.12, 0.07, dark, sx * (W / 2 - 0.035), 0.9, 0.42);
    }
    const stripes = 10;
    const sw = MS.w / stripes;
    for (let i = 0; i < stripes; i++) {
      const mat = M.cloth(i % 2 ? c.awning2 : c.awning);
      const x = -MS.w / 2 + sw * (i + 0.5);
      k.beam([x, 2.38, -0.62], [x, 2.02, 0.6], sw, 0.02, mat);
      // scalloped valance
      k.box(sw - 0.005, 0.16, 0.012, mat, x, 1.86, 0.6);
    }
    // the farm's name over the counter
    k.box(1.3, 0.26, 0.03, paintedBoard('🥕 החווה שלי', '#f4ead2', '#5b3b22'), 0, 2.08, -0.44);
    // a basket of eggs and a scale
    k.cyl(0.13, 0.1, M.wicker(), W / 2 - 0.3, 0.93, -0.28, 0.16, 14);
    for (let i = 0; i < 5; i++) k.sphere(0.03, M.matte('#f1e6d2'), W / 2 - 0.3 + Math.cos(i * 1.3) * 0.07, 1.04, -0.28 + Math.sin(i * 1.3) * 0.07, 0.85, 1.15, 0.85, 8);
    k.box(0.24, 0.1, 0.18, M.paint('#3f6f5a'), -W / 2 + 0.3, 0.93, -0.3);
    k.cyl(0.1, 0.012, M.steel(), -W / 2 + 0.3, 1.03, -0.3, 0.12, 14);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, MS.w, MS.d, 0.02, null, INK_SOFT, LINE_THIN);
      for (let i = 0; i < 10; i++) {
        const sw = MS.w / 10;
        D.box(ctx, -MS.w / 2 + i * sw, -0.62, -MS.w / 2 + (i + 1) * sw, 0.62, 0, tint(i % 2 ? c.awning2 : c.awning, 0.25), null);
      }
      D.rr(ctx, 0, 0, MS.w, 1.24, 0.02, null, INK_SOFT, LINE_THIN);
    }),
};

/* ------------------------------------------------------------------ barn */

const BARN = { w: 6.4, d: 5.6, h: 5.4 };
const barn: FurnitureDef = {
  id: 'farm-barn',
  name: 'אסם',
  category: 'outdoor',
  group: GROUP,
  tags: ['אסם', 'רפת', 'מחסן', 'חווה', 'חציר', 'עץ'],
  size: BARN,
  colors: [slot('walls', 'קירות', '#b2382c'), slot('trim', 'מסגרות', '#f4efe6'), slot('roof', 'גג', '#4a4d52')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const W = 6.0;
    const Dp = 5.0;
    const wall = M.wood(c.walls, 0.72);
    const trim = M.paint(c.trim, 0.5);
    // gambrel body (front gable faces +Z)
    const s = new THREE.Shape();
    s.moveTo(-W / 2, 0);
    s.lineTo(W / 2, 0);
    s.lineTo(W / 2, 3.0);
    s.lineTo(2.35, 4.15);
    s.lineTo(0, 5.05);
    s.lineTo(-2.35, 4.15);
    s.lineTo(-W / 2, 3.0);
    s.closePath();
    k.geo(extrudeZ(s, Dp), wall);
    // vertical board lines on the gable ends
    const line = M.wood(darken(c.walls, 0.22), 0.8);
    for (const z of [Dp / 2 + 0.006, -Dp / 2 - 0.006]) {
      for (let i = 1; i < 12; i++) {
        const x = -W / 2 + (i * W) / 12;
        const top = Math.abs(x) > 2.35 ? 3.0 + ((W / 2 - Math.abs(x)) / (W / 2 - 2.35)) * 1.15 : 4.15 + ((2.35 - Math.abs(x)) / 2.35) * 0.9;
        k.box(0.025, top - 0.08, 0.008, line, x, 0, z);
      }
    }
    for (const x of [-W / 2 - 0.006, W / 2 + 0.006]) for (let i = 1; i < 10; i++) k.box(0.008, 2.95, 0.025, line, x, 0, -Dp / 2 + (i * Dp) / 10);
    // roof: four panels along the gambrel, overhanging
    const roof = M.matte(c.roof);
    const pts: Array<[number, number]> = [
      [-3.14, 2.92],
      [-2.42, 4.2],
      [0, 5.13],
      [2.42, 4.2],
      [3.14, 2.92],
    ];
    for (let i = 0; i < 4; i++) {
      const [ax, ay] = pts[i];
      const [bx, by] = pts[i + 1];
      k.beam([ax, ay, 0], [bx, by, 0], 0.1, BARN.d, roof);
    }
    // white trim: corners, eaves, gable edges
    for (const z of [Dp / 2 + 0.03, -Dp / 2 - 0.03]) {
      for (const x of [-W / 2 + 0.06, W / 2 - 0.06]) k.box(0.14, 3.0, 0.06, trim, x, 0, z);
      const e: Array<[number, number]> = [
        [-W / 2, 3.0],
        [-2.35, 4.15],
        [0, 5.05],
        [2.35, 4.15],
        [W / 2, 3.0],
      ];
      for (let i = 0; i < 4; i++) k.beam([e[i][0], e[i][1] - 0.06, z], [e[i + 1][0], e[i + 1][1] - 0.06, z], 0.12, 0.06, trim);
      k.box(W, 0.12, 0.06, trim, 0, 2.94, z);
    }
    // big double doors with the classic white X
    const fz = Dp / 2 + 0.04;
    const door = M.wood(darken(c.walls, 0.06), 0.72);
    for (const sx of [-1, 1]) {
      const cx = sx * 0.72;
      k.box(1.38, 2.5, 0.04, door, cx, 0, fz);
      const x0 = cx - 0.62;
      const x1 = cx + 0.62;
      k.box(1.42, 0.1, 0.05, trim, cx, 2.45, fz + 0.01);
      k.box(1.42, 0.1, 0.05, trim, cx, 0, fz + 0.01);
      k.box(0.1, 2.5, 0.05, trim, x0 - 0.03, 0, fz + 0.01);
      k.box(0.1, 2.5, 0.05, trim, x1 + 0.03, 0, fz + 0.01);
      k.beam([x0, 0.1, fz + 0.02], [x1, 2.45, fz + 0.02], 0.08, 0.04, trim);
      k.beam([x1, 0.1, fz + 0.02], [x0, 2.45, fz + 0.02], 0.08, 0.04, trim);
    }
    // hay loft door with hay peeking out, and a pulley beam
    k.box(1.1, 1.0, 0.04, door, 0, 3.15, fz);
    k.box(1.2, 0.08, 0.05, trim, 0, 3.1, fz + 0.01);
    k.box(1.2, 0.08, 0.05, trim, 0, 4.12, fz + 0.01);
    for (const sx of [-1, 1]) k.box(0.08, 1.1, 0.05, trim, sx * 0.58, 3.1, fz + 0.01);
    k.beam([-0.5, 3.2, fz + 0.03], [0.5, 4.1, fz + 0.03], 0.07, 0.04, trim);
    k.beam([0.5, 3.2, fz + 0.03], [-0.5, 4.1, fz + 0.03], 0.07, 0.04, trim);
    k.box(0.14, 0.14, 0.3, M.wood('#6b4a30'), 0, 4.55, Dp / 2 + 0.15);
    // side windows
    for (const sx of [-1, 1]) {
      for (const z of [-1.2, 1.2]) {
        k.box(0.04, 0.8, 0.8, M.glass('#9fb6c2', 0.6), sx * (W / 2 + 0.01), 1.4, z);
        k.box(0.06, 0.08, 0.92, trim, sx * (W / 2 + 0.02), 1.36, z);
        k.box(0.06, 0.08, 0.92, trim, sx * (W / 2 + 0.02), 2.2, z);
        k.box(0.06, 0.04, 0.8, trim, sx * (W / 2 + 0.03), 1.78, z);
      }
    }
    // a weather vane rooster on the ridge
    k.rod([0, 5.1, 0], [0, 5.34, 0], 0.012, M.blackMetal(), 0.012, 6);
    k.box(0.28, 0.02, 0.02, M.blackMetal(), 0, 5.22, 0);
    k.box(0.18, 0.1, 0.012, M.blackMetal(), 0.02, 5.25, 0);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, BARN.w, BARN.d, 0.02, tint(c.roof, 0.55));
      D.line(ctx, 0, -BARN.d / 2, 0, BARN.d / 2, INK_SOFT, LINE_THIN);
      for (const x of [-2.42, 2.42]) D.line(ctx, x, -BARN.d / 2, x, BARN.d / 2, INK_SOFT, LINE_THIN);
      D.box(ctx, -1.4, BARN.d / 2 - 0.1, 1.4, BARN.d / 2, 0, tint(c.walls, 0.3), INK_SOFT, LINE_THIN);
    }),
};

/* ------------------------------------------------------------------ chicken (shared with the game) */

/** A cute chicken (origin between the feet, facing +Z). `pose` 0 = standing, 1 = pecking. */
export function buildChicken(color = '#f3ece0', comb = '#d8342a', pose = 0): THREE.Group {
  const k = new Kit();
  const body = M.matte(color);
  const red = M.matte(comb);
  const beak = M.matte('#efa83a');
  const leg = M.matte('#e8a23a');
  for (const s of [-1, 1]) {
    k.rod([s * 0.035, 0, 0.01], [s * 0.035, 0.12, 0], 0.008, leg, 0.008, 5);
    k.box(0.05, 0.008, 0.06, leg, s * 0.035, 0, 0.02);
  }
  k.sphere(0.11, body, 0, 0.21, -0.01, 0.95, 0.85, 1.15, 14);
  // tail feathers and wings
  k.sphere(0.07, body, 0, 0.29, -0.11, 0.6, 1.1, 0.7, 10);
  for (const s of [-1, 1]) k.sphere(0.065, M.matte(darken(color, 0.08)), s * 0.09, 0.22, -0.02, 0.35, 0.75, 1.1, 10);
  const head = new Kit();
  head.sphere(0.062, body, 0, 0, 0, 1, 1.05, 1, 12);
  head.add(new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.045, 6), beak), 0, -0.005, 0.07).rotation.x = Math.PI / 2;
  for (let i = 0; i < 3; i++) head.sphere(0.017, red, 0, 0.06 + (i === 1 ? 0.008 : 0), -0.02 + i * 0.022, 0.6, 1, 1, 6);
  head.sphere(0.014, red, 0, -0.045, 0.045, 0.7, 1.3, 0.7, 6);
  for (const s of [-1, 1]) {
    head.sphere(0.012, M.matte('#1d1a18'), s * 0.045, 0.012, 0.035, 0.6, 1, 1, 6);
    head.sphere(0.004, M.matte('#ffffff'), s * 0.05, 0.016, 0.042, 1, 1, 1, 4);
  }
  const h = k.sub(head, 0, pose ? 0.16 : 0.35, pose ? 0.17 : 0.09);
  h.name = 'head';
  return k.g;
}

const chicken: FurnitureDef = {
  id: 'farm-chicken',
  name: 'תרנגולת',
  category: 'outdoor',
  group: GROUP,
  tags: ['תרנגולת', 'עוף', 'לול', 'חווה', 'ביצים'],
  size: { w: 0.24, d: 0.36, h: 0.43 },
  resize: false,
  colors: [slot('feathers', 'נוצות', '#f3ece0'), slot('comb', 'כרבולת', '#d8342a')],
  build: ({ colors: c }) => buildChicken(c.feathers, c.comb),
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.ellipse(ctx, 0, -0.01, 0.1, 0.14, tint(c.feathers, 0.1), INK_SOFT, LINE_THIN);
      D.circle(ctx, 0, 0.11, 0.055, tint(c.feathers, 0.1), INK_SOFT, LINE_THIN);
      D.circle(ctx, 0, 0.1, 0.02, c.comb, null);
    }),
};

/* ------------------------------------------------------------------ chicken coop */

const COOP = { w: 1.7, d: 1.9, h: 1.62 };
const coop: FurnitureDef = {
  id: 'farm-coop',
  name: 'לול תרנגולות',
  category: 'outdoor',
  group: GROUP,
  tags: ['לול', 'תרנגולות', 'ביצים', 'חווה', 'עץ'],
  size: COOP,
  colors: [slot('walls', 'קירות', '#e3c48e'), slot('roof', 'גג', '#5f8f6a'), slot('trim', 'מסגרות', '#f6f1e6')],
  build: ({ colors: c }) => {
    const outer = new Kit();
    const k = new Kit();
    outer.sub(k, 0, 0, -0.3);
    const legs = M.wood('#6b4a30', 0.8);
    const wall = M.wood(c.walls, 0.7);
    const trim = M.paint(c.trim);
    const W = 1.3;
    const Dp = 1.0;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.07, 0.5, 0.07, legs, sx * (W / 2 - 0.05), 0, sz * (Dp / 2 - 0.05));
    k.rbox(W, 0.72, Dp, 0.02, wall, 0, 0.45, 0, 1);
    // gable roof (ridge along X)
    const roof = M.wood(c.roof, 0.7);
    for (const s of [-1, 1]) k.beam([0, 1.6, 0], [0, 1.12, s * 0.62], COOP.w - 0.1, 0.04, roof);
    const gable = new THREE.Shape();
    gable.moveTo(-0.5, 0);
    gable.lineTo(0.5, 0);
    gable.lineTo(0, 0.42);
    gable.closePath();
    for (const sx of [-1, 1]) {
      const m = k.geo(extrudeZ(gable, 0.04), wall, sx * (W / 2 - 0.02), 1.17, 0);
      m.rotation.y = Math.PI / 2;
    }
    // pop hole with a ramp, nest box window and trim
    k.box(0.28, 0.32, 0.01, M.matte('#2e2620'), 0.25, 0.5, Dp / 2 + 0.002);
    k.box(0.34, 0.04, 0.02, trim, 0.25, 0.82, Dp / 2 + 0.006);
    k.beam([0.25, 0.5, Dp / 2 + 0.02], [0.25, 0.02, Dp / 2 + 0.6], 0.26, 0.025, M.wood('#a07a52'));
    for (let i = 1; i < 5; i++) k.box(0.26, 0.015, 0.02, M.wood('#7a5a3c'), 0.25, 0.5 - i * 0.1, Dp / 2 + 0.02 + i * 0.12);
    k.box(0.3, 0.22, 0.02, M.glass('#9fb6c2', 0.5), -0.3, 0.75, Dp / 2 + 0.002);
    for (const y of [0.63, 0.98]) k.box(0.38, 0.04, 0.03, trim, -0.3, y, Dp / 2 + 0.008);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.04, 0.72, 0.04, trim, sx * (W / 2 + 0.005), 0.45, sz * (Dp / 2 + 0.005));
    // a heart cut-out on the gable
    k.sphere(0.035, M.matte('#c8553d'), -0.025, 1.31, Dp / 2 + 0.03, 1, 1, 0.3, 8);
    k.sphere(0.035, M.matte('#c8553d'), 0.025, 1.31, Dp / 2 + 0.03, 1, 1, 0.3, 8);
    return outer.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, -0.3, COOP.w - 0.1, 1.24, 0.02, tint(c.roof, 0.4));
      D.line(ctx, -0.8, -0.3, 0.8, -0.3, INK_SOFT, LINE_THIN);
      D.box(ctx, 0.12, 0.2, 0.38, 0.8, 0, tint('#a07a52', 0.3), INK_SOFT, LINE_THIN);
    }),
};

/* ------------------------------------------------------------------ rail fence (parametric) */

const FF = { w: 4, d: 0.17, h: 1.05 };
const farmFence: FurnitureDef = {
  id: 'farm-fence',
  name: 'גדר חווה',
  category: 'outdoor',
  group: GROUP,
  tags: ['גדר', 'חווה', 'עץ', 'מכלאה', 'קורות'],
  size: FF,
  parametric: true,
  resize: { w: [1, 12] },
  colors: [slot('wood', 'עץ', '#f1ece2')],
  build: ({ colors: c, size }) => {
    const w = size?.w ?? FF.w;
    const k = new Kit();
    const wood = M.paint(c.wood, 0.7);
    const n = Math.max(1, Math.round(w / 2));
    for (let i = 0; i <= n; i++) {
      const x = -w / 2 + 0.05 + ((w - 0.1) * i) / n;
      k.rbox(0.1, FF.h - 0.03, 0.1, 0.012, wood, x, 0, 0, 1);
      k.add(new THREE.Mesh(new THREE.ConeGeometry(0.072, 0.06, 4), wood), x, FF.h - 0.03, 0).rotation.y = Math.PI / 4;
    }
    for (const y of [0.32, 0.7]) k.rbox(w - 0.04, 0.1, 0.035, 0.01, wood, 0, y, 0.06, 1);
    // diagonal braces in every bay
    for (let i = 0; i < n; i++) {
      const x0 = -w / 2 + 0.1 + ((w - 0.1) * i) / n;
      const x1 = -w / 2 + ((w - 0.1) * (i + 1)) / n;
      k.beam([x0, 0.42, 0.058], [x1, 0.7, 0.058], 0.06, 0.028, wood);
    }
    return k.g;
  },
  draw2d: (ctx, c, size) =>
    sym(ctx, () => {
      const w = size?.w ?? FF.w;
      D.rr(ctx, 0, 0.03, w - 0.04, 0.05, 0, tint(c.wood, 0.1), INK_SOFT, LINE_THIN);
      const n = Math.max(1, Math.round(w / 2));
      for (let i = 0; i <= n; i++) D.rr(ctx, -w / 2 + 0.05 + ((w - 0.1) * i) / n, 0, 0.1, 0.1, 0, '#ffffff', INK_SOFT, LINE_THIN);
    }),
};

/* ------------------------------------------------------------------ hay bales and crates */

const HAY = { w: 1.14, d: 0.62, h: 0.5 };
const hayBale: FurnitureDef = {
  id: 'farm-hay-bale',
  name: 'חבילת חציר',
  category: 'outdoor',
  group: GROUP,
  tags: ['חציר', 'קש', 'חווה', 'ישיבה'],
  size: HAY,
  colors: [slot('hay', 'חציר', '#d9b860')],
  seats: [{ x: 0, z: 0, height: 0.5, facing: 0, kind: 'sit' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const hay = M.linen(c.hay);
    k.geo(organicGeo(roundedBoxGeo(HAY.w - 0.05, HAY.h - 0.01, HAY.d - 0.03, 0.06, 2), 0.012, 9, 3), hay, 0, HAY.h / 2, 0);
    for (const x of [-0.28, 0.28]) {
      k.box(0.025, 0.012, HAY.d + 0.004, M.matte('#8a6a3a'), x, HAY.h - 0.016, 0);
      for (const z of [-1, 1]) k.box(0.025, HAY.h - 0.02, 0.006, M.matte('#8a6a3a'), x, 0.004, z * (HAY.d / 2 + 0.001));
    }
    const r = rng(3);
    for (let i = 0; i < 10; i++) {
      const x = (r() - 0.5) * HAY.w * 0.9;
      k.rod([x, HAY.h - 0.005, (r() - 0.5) * 0.4], [x + (r() - 0.5) * 0.12, HAY.h + 0.0, (r() - 0.5) * 0.5], 0.004, M.matte(lighten(c.hay, 0.15)), 0.002, 3);
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, HAY.w, HAY.d, 0.05, tint(c.hay, 0.2));
      for (const x of [-0.28, 0.28]) D.line(ctx, x, -HAY.d / 2, x, HAY.d / 2, INK_SOFT, LINE_THIN);
    }),
};

const CR = { w: 1.0, d: 0.66, h: 0.45 };
const crates: FurnitureDef = {
  id: 'farm-crates',
  name: 'ארגזי ירקות',
  category: 'outdoor',
  group: GROUP,
  tags: ['ארגזים', 'ירקות', 'פירות', 'קטיף', 'חווה', 'שוק'],
  size: CR,
  colors: [slot('wood', 'עץ', '#c9a26c')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const crate = M.wood(c.wood, 0.85);
    produceCrate(k, -0.24, 0, 0, 0.5, 0.58, 'tomato', crate, 41);
    produceCrate(k, 0.24, 0, 0, 0.5, 0.58, 'lemon', crate, 42);
    produceCrate(k, 0, 0.2, 0, 0.5, 0.58, 'carrot', crate, 43);
    // the crate on top needs a floor across the two below
    k.box(0.5, 0.02, 0.58, crate, 0, 0.18, 0);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, -0.24, 0, 0.5, 0.58, 0, tint(c.wood, 0.3));
      D.rr(ctx, 0.24, 0, 0.5, 0.58, 0, tint(c.wood, 0.3));
      D.rr(ctx, 0, 0, 0.5, 0.58, 0, tint('#ec7c2a', 0.3), INK_SOFT, LINE_THIN);
    }),
};

export const FARM_ITEMS: FurnitureDef[] = [farmBed, farmTap, farmWell, scarecrow, marketStand, barn, chicken, coop, farmFence, hayBale, crates];

void latheGeo;
