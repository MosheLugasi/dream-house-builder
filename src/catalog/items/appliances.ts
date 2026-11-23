/**
 * Appliances & bathroom fittings: small kitchen appliances, fridges, cookers, ovens, laundry,
 * freestanding tubs, vanities, showers, towel warmers and climate devices.
 */
import * as THREE from 'three';
import type { FurnitureDef } from '../types';
import { D, INK_SOFT, Kit, LINE_THIN, M, PAL, darken, extrudeZ, lighten, roundedRectPath, roundedRectShape, sym, tint, type Ctx2D } from '../kit';
import { barHandle, cabinet, mixerTap, slot } from './_parts';
import { circleZ, cup, discZ, flutedLatheGeo, knobZ, ringZ, sLathe, tumbler, type Prof } from './_props';

type C = Record<string, string>;
const G_KITCHEN = 'מכשירי חשמל';
const G_TUBS = 'אמבטיות ומקלחות';
const G_BATHCAB = 'ארונות אמבטיה';
const G_LAUNDRY = 'כביסה';
const G_CLIMATE = 'מיזוג וחימום';
const r3 = (v: number): number => Math.round(v * 1000) / 1000;

/* ---------------------------------------------------------------- shared helpers */

/** Cheap glass/plastic bottle (fridge contents). (x, y, z) = bottom centre. */
function smallBottle(k: Kit, x: number, y: number, z: number, h: number, r: number, mat: THREE.Material, cap: THREE.Material, seg = 10): void {
  k.lathe(
    [
      [0, 0],
      [r, 0],
      [r, h * 0.62],
      [r * 0.4, h * 0.86],
      [r * 0.4, h],
      [0, h],
    ],
    mat,
    x,
    y,
    z,
    seg,
  );
  k.cyl(r * 0.45, h * 0.07, cap, x, y + h * 0.96, z, r * 0.45, 8);
}

/** Lathe whose cross-section is a superellipse (stadium-like tubs). Profile = [relative radius, y]. */
function superLatheGeo(prof: Prof, ax: number, az: number, n = 2.6, seg = 48): THREE.BufferGeometry {
  const e = 2 / n;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const P = prof.length;
  for (let j = 0; j <= seg; j++) {
    const phi = (j / seg) * Math.PI * 2;
    const s = Math.sin(phi);
    const c = Math.cos(phi);
    const sx = Math.sign(s) * Math.pow(Math.abs(s), e);
    const sz = Math.sign(c) * Math.pow(Math.abs(c), e);
    for (let i = 0; i < P; i++) {
      const [u, y] = prof[i];
      pos.push(u * ax * sx, y, u * az * sz);
      uv.push(j / seg, i / (P - 1));
    }
  }
  for (let j = 0; j < seg; j++) {
    for (let i = 0; i < P - 1; i++) {
      const a = j * P + i;
      const b = a + P;
      const cc = a + P + 1;
      const d = a + 1;
      idx.push(a, b, d, cc, d, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Flat display / label facing +Z. */
function plate(k: Kit, w: number, h: number, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const m = k.box(w, h, 0.0015, mat, x, y - h / 2, z + 0.00075);
  m.castShadow = false;
  return m;
}

const glowDisplay = (col = '#7fd8ff'): THREE.Material => M.glow(col, 1.1, '#0a1820');

/** tall-appliance plan convention: outline, front band and a diagonal */
function drawTall(ctx: Ctx2D, w: number, d: number, fill: string, doorD = 0.07): void {
  D.rr(ctx, 0, 0, w, d, 0.01, fill);
  D.line(ctx, -w / 2, d / 2 - doorD, w / 2, d / 2 - doorD, INK_SOFT);
  D.line(ctx, -w / 2, -d / 2, w / 2, d / 2 - doorD, INK_SOFT);
}

/* ================================================================== SMALL KITCHEN APPLIANCES */

const espresso: FurnitureDef = {
  id: 'appl-espresso-machine',
  name: 'מכונת אספרסו מקצועית',
  category: 'kitchen',
  group: G_KITCHEN,
  tags: ['קפה', 'אספרסו', 'מכונת קפה', 'נירוסטה', 'בריסטה'],
  size: { w: 0.32, d: 0.36, h: 0.42 },
  colors: [slot('body', 'גוף', '#c9ccce')],
  actions: [{ kind: 'snack' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const body = M.brushed(c.body);
    const chrome = M.chrome();
    const black = M.plastic('#1b1c1e');
    const w = 0.3;
    // main block at the back, upper front overhang
    k.rbox(w, 0.36, 0.22, 0.01, body, 0, 0.0, -0.07, 2);
    k.rbox(w, 0.13, 0.12, 0.012, body, 0, 0.23, 0.08, 2);
    // drip tray with grille
    k.rbox(w - 0.01, 0.035, 0.13, 0.006, M.blackMetal(), 0, 0, 0.11, 1);
    for (let i = 0; i < 9; i++) k.box(0.27, 0.003, 0.004, chrome, 0, 0.035, 0.055 + i * 0.013);
    // water tank at the back (translucent)
    k.rbox(0.1, 0.2, 0.08, 0.006, M.glass('#bcd9e6', 0.45), -0.08, 0.15, -0.135, 1);
    // group head + portafilter
    k.cyl(0.04, 0.025, chrome, 0, 0.205, 0.08, 0.042, 20);
    k.cyl(0.036, 0.022, chrome, 0, 0.183, 0.08, 0.036, 20);
    k.rod([0, 0.19, 0.115], [0, 0.178, 0.166], 0.011, black, 0.013, 12);
    k.rod([0, 0.183, 0.1], [0, 0.19, 0.12], 0.008, chrome, 0.008, 8);
    k.rod([-0.008, 0.183, 0.08], [-0.008, 0.16, 0.08], 0.003, chrome, 0.003, 6);
    k.rod([0.008, 0.183, 0.08], [0.008, 0.16, 0.08], 0.003, chrome, 0.003, 6);
    // espresso cup on the tray under the spouts
    cup(k, 0, 0.038, 0.08, M.ceramic('#f4f1ea'), '#4a2c1c', 0.6, 0.85, 0.05);
    // pressure gauge + buttons on the overhang front
    const fz = 0.14;
    discZ(k, 0.032, 0.008, chrome, -0.075, 0.3, fz - 0.002, 24);
    circleZ(k, 0.027, M.paint('#f6f3ea', 0.5), -0.075, 0.3, fz + 0.0065, 24);
    k.box(0.002, 0.022, 0.001, M.matte('#b8322a'), -0.075, 0.29, fz + 0.007).rotation.z = 0.7;
    for (const [x, col] of [
      [0.045, '#2b2c2f'],
      [0.085, '#2b2c2f'],
    ] as Array<[number, string]>)
      knobZ(k, x, 0.3, fz - 0.002, 0.012, 0.01, M.plastic(col), undefined, 14);
    k.sphere(0.004, M.glow('#ffb347', 1.6), 0.065, 0.27, fz + 0.002, 1, 1, 0.6, 8);
    // steam wand + hot water knob on the side
    k.tube(
      [
        [0.12, 0.24, 0.12],
        [0.13, 0.21, 0.13],
        [0.13, 0.12, 0.135],
      ],
      0.0045,
      chrome,
      { seg: 10, radial: 6 },
    );
    knobZ(k, 0.12, 0.27, fz - 0.002, 0.014, 0.014, black, undefined, 12);
    // cup warmer rail + cups
    for (const s of [-1, 1]) k.rod([s * 0.14, 0.36, -0.17], [s * 0.14, 0.36, 0.13], 0.004, chrome, 0.004, 6);
    for (const x of [-0.06, 0.04]) {
      const m = k.lathe(
        [
          [0, 0],
          [0.03, 0],
          [0.025, 0.045],
          [0, 0.045],
        ],
        M.ceramic('#f4f1ea'),
        x,
        0.36,
        -0.06,
        14,
      );
      m.castShadow = true;
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, -0.07, 0.3, 0.22, 0.01, tint(c.body, 0.5));
      D.rr(ctx, 0, 0.08, 0.3, 0.12, 0.01, tint(c.body, 0.35));
      D.rr(ctx, 0, 0.11, 0.29, 0.13, 0.006, null, INK_SOFT, 0.006);
      D.circle(ctx, 0, 0.08, 0.04, '#e6e8ea', undefined, LINE_THIN);
      D.line(ctx, 0, 0.12, 0, 0.18, '#2b2c2f', 0.024);
    }),
};

const kettle: FurnitureDef = {
  id: 'appl-electric-kettle',
  name: 'קומקום חשמלי',
  category: 'kitchen',
  group: G_KITCHEN,
  tags: ['קומקום', 'מים חמים', 'תה', 'נירוסטה'],
  size: { w: 0.25, d: 0.18, h: 0.26 },
  colors: [slot('body', 'גוף', '#c9ccce')],
  actions: [{ kind: 'snack' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const body = M.brushed(c.body);
    const black = M.plastic('#1b1c1e');
    k.cyl(0.085, 0.018, black, 0, 0, 0, 0.082, 28);
    k.disc(0.03, 0.002, M.glow('#7fd8ff', 1.2, '#0a1820'), 0.06, 0.012, 0.055, 10);
    sLathe(
      k,
      [
        [0, 0.018],
        [0.078, 0.018],
        [0.082, 0.03],
        [0.084, 0.12],
        [0.074, 0.2],
        [0.064, 0.225],
        [0, 0.228],
      ],
      body,
      0,
      0,
      0,
      28,
      18,
    );
    // lid with knob + spout to +X
    k.cyl(0.058, 0.006, black, 0, 0.224, 0, 0.054, 24);
    k.rbox(0.03, 0.014, 0.018, 0.006, black, 0, 0.23, 0, 1);
    k.tube(
      [
        [0.07, 0.17, 0],
        [0.09, 0.2, 0],
        [0.102, 0.214, 0],
      ],
      0.014,
      body,
      { seg: 8, radial: 10 },
    );
    // handle (black) to -X with a water window below
    k.tube(
      [
        [-0.065, 0.215, 0],
        [-0.104, 0.21, 0],
        [-0.112, 0.12, 0],
        [-0.096, 0.05, 0],
        [-0.08, 0.045, 0],
      ],
      0.013,
      black,
      { seg: 18, radial: 8 },
    );
    k.box(0.01, 0.1, 0.03, M.glass('#9cc9e0', 0.65), -0.082, 0.05, 0);
    k.box(0.016, 0.008, 0.012, M.plastic('#2b2c2f'), -0.09, 0.04, 0);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.circle(ctx, 0, 0, 0.085, '#d0d2d4');
      D.circle(ctx, 0, 0, 0.064, tint(c.body, 0.4), undefined, LINE_THIN);
      D.line(ctx, -0.07, 0, -0.12, 0, '#2b2c2f', 0.026);
      D.line(ctx, 0.07, 0, 0.1, 0, INK_SOFT, 0.02);
    }),
};

const toaster: FurnitureDef = {
  id: 'appl-toaster',
  name: 'טוסטר רטרו',
  category: 'kitchen',
  group: G_KITCHEN,
  tags: ['טוסטר', 'לחם', 'ארוחת בוקר', 'רטרו'],
  size: { w: 0.34, d: 0.19, h: 0.22 },
  colors: [slot('body', 'גוף', '#a8c3b5')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const body = M.lacquer(c.body);
    const chrome = M.chrome();
    k.rbox(0.29, 0.015, 0.17, 0.006, chrome, 0, 0, 0, 1);
    k.rbox(0.28, 0.175, 0.165, 0.04, body, 0, 0.012, 0, 3);
    // slots + toast popping up
    const dark = M.matte('#1a1a1a');
    for (const z of [-0.035, 0.035]) {
      k.rbox(0.2, 0.004, 0.034, 0.008, chrome, 0, 0.186, z, 1);
      k.box(0.19, 0.002, 0.026, dark, 0, 0.1885, z);
      k.rbox(0.13, 0.08, 0.014, 0.012, M.matte('#c48a4a'), 0, 0.135, z, 2);
      k.rbox(0.118, 0.07, 0.0145, 0.01, M.matte('#e7c58f'), 0, 0.142, z, 2);
    }
    // lever on the side, browning knob, crumb tray, badge
    k.box(0.006, 0.12, 0.012, dark, 0.142, 0.04, 0.0);
    k.rbox(0.03, 0.016, 0.03, 0.006, chrome, 0.155, 0.13, 0.0, 1);
    knobZ(k, 0.09, 0.06, 0.0825, 0.016, 0.012, chrome, M.matte('#222'), 18);
    k.box(0.12, 0.012, 0.006, chrome, -0.05, 0.016, 0.083);
    k.rbox(0.06, 0.012, 0.004, 0.004, chrome, -0.05, 0.1, 0.0825, 1);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 0.29, 0.17, 0.04, tint(c.body, 0.4));
      for (const z of [-0.035, 0.035]) D.rr(ctx, 0, z, 0.2, 0.03, 0.008, '#e7c58f', INK_SOFT, 0.006);
      D.rr(ctx, 0.15, 0, 0.03, 0.03, 0.006, '#e6e8ea');
    }),
};

const microwave: FurnitureDef = (() => {
  const w = 0.5;
  const h = 0.3;
  const d = 0.4;
  const fz = d / 2 - 0.025; // back face of the door
  return {
    id: 'appl-microwave',
    name: 'מיקרוגל',
    category: 'kitchen' as const,
    group: G_KITCHEN,
    tags: ['מיקרוגל', 'חימום', 'מטבח'],
    size: { w, d, h },
    colors: [slot('body', 'גוף', '#2a2b2e')],
    actions: [{ kind: 'open' }, { kind: 'snack' }],
    build: ({ colors: c }: { colors: C }) => {
      const k = new Kit();
      const body = M.paint(c.body, 0.35);
      const inner = M.paint('#d9d9d4', 0.5);
      const cavW = 0.34;
      const cx = -w / 2 + 0.02 + cavW / 2;
      // shell
      k.rbox(w, 0.02, d - 0.025, 0.004, body, 0, h - 0.02, -0.0125, 1);
      k.rbox(w, 0.02, d - 0.025, 0.004, body, 0, 0, -0.0125, 1);
      k.box(0.02, h - 0.04, d - 0.025, body, -w / 2 + 0.01, 0.02, -0.0125);
      k.box(w - cavW - 0.02, h - 0.04, d - 0.025, body, w / 2 - (w - cavW - 0.02) / 2, 0.02, -0.0125);
      k.box(cavW, h - 0.04, 0.01, body, cx, 0.02, -d / 2 + 0.005);
      // cavity liner + glass turntable + light
      k.box(cavW, 0.002, d - 0.05, inner, cx, 0.02, -0.02);
      k.box(cavW, h - 0.04, 0.002, inner, cx, 0.02, -d / 2 + 0.011);
      k.box(0.002, h - 0.04, d - 0.05, inner, cx - cavW / 2 + 0.001, 0.02, -0.02);
      k.box(0.002, h - 0.04, d - 0.05, inner, cx + cavW / 2 - 0.001, 0.02, -0.02);
      k.box(cavW, 0.002, d - 0.05, inner, cx, h - 0.022, -0.02);
      k.cyl(0.13, 0.006, M.glass('#e9f3f5', 0.4), cx, 0.03, -0.02, 0.13, 32);
      k.cyl(0.03, 0.012, M.plastic('#cfcfca'), cx, 0.022, -0.02, 0.03, 12);
      // control panel
      const px = cx + cavW / 2 + 0.01 + (w - cavW - 0.04) / 2;
      const pw = w - cavW - 0.05;
      k.box(pw, h - 0.05, 0.004, M.screen('#141518'), px, 0.025, fz + 0.002);
      plate(k, 0.08, 0.026, glowDisplay('#7ff0a8'), px, h - 0.05, fz + 0.004);
      for (let r = 0; r < 3; r++)
        for (let i = 0; i < 3; i++) k.rbox(0.026, 0.016, 0.004, 0.003, M.plastic('#3a3b3f'), px - 0.032 + i * 0.032, h - 0.12 - r * 0.026, fz + 0.005, 1);
      knobZ(k, px, 0.07, fz + 0.005, 0.022, 0.014, M.brushed('#c9ccce'), M.matte('#222'), 20);
      // door (hinged on the left)
      const dw = cavW + 0.02;
      const door = k.part('door', -w / 2 + 0.002, 0, fz, { open: -1.65 });
      door.rbox(dw - 0.004, h - 0.006, 0.022, 0.004, body, dw / 2, 0.003, 0.011, 1);
      door.box(dw - 0.06, h - 0.07, 0.002, M.screen('#1e2124'), dw / 2 - 0.01, 0.035, 0.0225);
      door.box(dw - 0.08, h - 0.09, 0.001, M.matte('#3c3f42'), dw / 2 - 0.01, 0.045, 0.0236);
      door.rbox(0.014, h - 0.06, 0.008, 0.003, M.brushed('#b9bcbe'), dw - 0.02, 0.03, 0.0255, 1);
      return k.g;
    },
    draw2d: (ctx: Ctx2D, c: C) =>
      sym(ctx, () => {
        D.rr(ctx, 0, 0, w, d, 0.01, tint(c.body, 0.6));
        D.rr(ctx, -0.06, 0.188, 0.36, 0.024, 0.004, tint(c.body, 0.4));
        D.line(ctx, 0.12, -0.2, 0.12, 0.175, INK_SOFT, LINE_THIN);
      }),
  };
})();

const standMixer: FurnitureDef = {
  id: 'appl-stand-mixer',
  name: 'מיקסר עומד',
  category: 'kitchen',
  group: G_KITCHEN,
  tags: ['מיקסר', 'אפייה', 'עוגות', 'בצק', 'קערה'],
  size: { w: 0.24, d: 0.36, h: 0.36 },
  colors: [slot('body', 'גוף', '#b8322a')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const body = M.lacquer(c.body);
    const chrome = M.chrome();
    const steel = M.brushed('#d4d6d8');
    // base foot + column at the back
    k.rbox(0.2, 0.045, 0.32, 0.02, body, 0, 0, -0.01, 3);
    k.rbox(0.13, 0.2, 0.11, 0.04, body, 0, 0.03, -0.11, 3);
    // tilt head: elongated rounded motor housing
    k.sphere(0.075, body, 0, 0.285, -0.005, 1.05, 0.95, 2.1, 18);
    discZ(k, 0.042, 0.012, chrome, 0, 0.285, 0.143, 20);
    k.ring(0.072, 0.004, chrome, 0, 0.27, -0.005, 24).scale.set(1.02, 2.05, 1);
    // speed lever + tilt lock
    k.box(0.006, 0.01, 0.04, chrome, 0.07, 0.24, -0.1);
    k.sphere(0.008, chrome, 0.07, 0.245, -0.075, 1, 1, 1, 8);
    // bowl clamp plate + steel bowl with handle
    k.cyl(0.065, 0.012, chrome, 0, 0.045, 0.05, 0.065, 22);
    sLathe(
      k,
      [
        [0, 0],
        [0.05, 0],
        [0.075, 0.03],
        [0.1, 0.11],
        [0.105, 0.135],
        [0.1, 0.136],
        [0.095, 0.11],
        [0.07, 0.035],
        [0, 0.02],
      ],
      steel,
      0,
      0.057,
      0.05,
      24,
      14,
    );
    k.tube(
      [
        [0.098, 0.17, 0.05],
        [0.115, 0.16, 0.05],
        [0.112, 0.1, 0.05],
        [0.08, 0.085, 0.05],
      ],
      0.006,
      steel,
      { seg: 10, radial: 6 },
    );
    // dough inside + flat beater
    k.sphere(0.07, M.matte('#efe1c2'), 0, 0.09, 0.05, 1, 0.35, 1, 16);
    k.rod([0, 0.21, 0.05], [0, 0.12, 0.05], 0.005, chrome, 0.005, 8);
    const bt = new THREE.TorusGeometry(0.03, 0.005, 6, 16);
    bt.scale(1, 1.4, 1);
    k.geo(bt, M.paint('#f2f2f0', 0.4), 0, 0.12, 0.05);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, -0.01, 0.2, 0.32, 0.02, tint(c.body, 0.45));
      D.circle(ctx, 0, 0.05, 0.105, '#e6e8ea', undefined, LINE_THIN);
      D.ellipse(ctx, 0, -0.02, 0.078, 0.165, tint(c.body, 0.25), INK_SOFT, LINE_THIN);
    }),
};

const blender: FurnitureDef = {
  id: 'appl-blender',
  name: 'בלנדר עם שייק',
  category: 'kitchen',
  group: G_KITCHEN,
  tags: ['בלנדר', 'שייק', 'סמותי', 'מיץ'],
  size: { w: 0.2, d: 0.18, h: 0.43 },
  colors: [slot('body', 'בסיס', '#2a2b2e'), slot('drink', 'שייק', '#e48aa0')],
  actions: [{ kind: 'snack' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const base = M.paint(c.body, 0.3);
    k.rbox(0.16, 0.11, 0.16, 0.025, base, 0, 0, 0, 3);
    k.box(0.15, 0.004, 0.15, M.rubber(), 0, 0, 0);
    knobZ(k, 0, 0.055, 0.079, 0.02, 0.016, M.brushed('#c9ccce'), M.matte('#222'), 20);
    for (const s of [-1, 1]) k.rbox(0.018, 0.01, 0.004, 0.003, M.plastic(s < 0 ? '#3a3b3f' : '#c0392b'), s * 0.045, 0.05, 0.08, 1);
    k.cyl(0.05, 0.02, base, 0, 0.11, 0, 0.048, 20);
    // rounded-square jar, smoothie, lid
    const jar = flutedLatheGeo(
      [
        [0.04, 0],
        [0.05, 0.03],
        [0.07, 0.2],
        [0.074, 0.27],
      ],
      4,
      -0.12,
      32,
    );
    jar.rotateY(Math.PI / 4);
    k.geo(jar, M.glass('#e6f2f4', 0.3), 0, 0.13, 0);
    const fill = flutedLatheGeo(
      [
        [0, 0],
        [0.044, 0.002],
        [0.05, 0.03],
        [0.064, 0.16],
        [0, 0.16],
      ],
      4,
      -0.12,
      24,
    );
    fill.rotateY(Math.PI / 4);
    k.geo(fill, M.glass(c.drink, 0.85), 0, 0.132, 0);
    k.rbox(0.15, 0.02, 0.15, 0.03, M.plastic('#1b1c1e'), 0, 0.4, 0, 2);
    k.cyl(0.022, 0.018, M.glass('#d0e6ec', 0.6), 0, 0.41, 0, 0.022, 14);
    k.tube(
      [
        [0.06, 0.37, 0],
        [0.092, 0.35, 0],
        [0.092, 0.2, 0],
        [0.055, 0.17, 0],
      ],
      0.009,
      M.plastic('#1b1c1e'),
      { seg: 12, radial: 6 },
    );
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 0.16, 0.16, 0.025, tint(c.body, 0.6));
      D.rr(ctx, 0, 0, 0.13, 0.13, 0.03, tint(c.drink, 0.5), INK_SOFT, LINE_THIN);
      D.line(ctx, 0.07, 0, 0.095, 0, INK_SOFT, 0.016);
    }),
};

const airFryer: FurnitureDef = {
  id: 'appl-air-fryer',
  name: 'סיר טיגון באוויר חם',
  category: 'kitchen',
  group: G_KITCHEN,
  tags: ['אייר פרייר', 'טיגון', 'צ׳יפס', 'בישול'],
  size: { w: 0.29, d: 0.37, h: 0.34 },
  colors: [slot('body', 'גוף', '#1f2022')],
  actions: [{ kind: 'open' }, { kind: 'cook', at: { x: 0, y: 0.34, z: 0 } }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const body = M.paint(c.body, 0.35);
    // shell: rounded body with an open front for the drawer
    k.rbox(0.29, 0.14, 0.3, 0.05, body, 0, 0.19, -0.03, 3);
    k.rbox(0.29, 0.03, 0.3, 0.012, body, 0, 0, -0.03, 2);
    for (const s of [-1, 1]) k.rbox(0.025, 0.18, 0.3, 0.01, body, s * 0.1325, 0.02, -0.03, 1);
    k.box(0.24, 0.17, 0.02, body, 0, 0.02, -0.17);
    // top display
    const disp = k.rbox(0.12, 0.004, 0.08, 0.01, M.screen('#0e0f11'), 0, 0.328, 0.03, 1);
    disp.rotation.x = 0.18;
    plate(k, 0.05, 0.016, glowDisplay('#ff9a3c'), 0, 0.322, 0.06).rotation.x = -Math.PI / 2 + 0.18;
    // back vent slots
    for (let i = 0; i < 5; i++) k.box(0.16, 0.006, 0.004, M.matte('#0b0b0b'), 0, 0.22 + i * 0.015, -0.181);
    // drawer + handle
    const dr = k.part('drawer', 0, 0, 0, { open: 0.2 });
    dr.rbox(0.235, 0.17, 0.02, 0.012, body, 0, 0.02, 0.11, 2);
    dr.box(0.22, 0.14, 0.24, M.blackMetal(), 0, 0.03, -0.02);
    for (let i = 0; i < 9; i++) dr.box(0.012, 0.012, 0.06, M.matte('#e8b75b'), -0.08 + i * 0.02, 0.17, 0.0 + (i % 3) * 0.02 - 0.02).rotation.y = i * 0.6;
    dr.rbox(0.05, 0.03, 0.06, 0.01, M.plastic('#2c2d30'), 0, 0.1, 0.15, 1);
    dr.box(0.034, 0.004, 0.03, M.chrome(), 0, 0.13, 0.155);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, -0.03, 0.29, 0.3, 0.05, tint(c.body, 0.65));
      D.rr(ctx, 0, 0.03, 0.12, 0.08, 0.01, tint(c.body, 0.4));
      D.rr(ctx, 0, 0.15, 0.05, 0.06, 0.01, tint(c.body, 0.4));
    }),
};

/* ================================================================== FRIDGES */

const frenchFridge: FurnitureDef = (() => {
  const w = 0.91;
  const d = 0.75;
  const h = 1.8;
  const doorT = 0.07;
  const fz = d / 2 - 0.035; // front plane of the doors
  const cz = fz - doorT; // front plane of the carcass
  const split = 0.62;
  return {
    id: 'appl-fridge-french-door',
    name: 'מקרר דלתות צרפתיות עם מגירת הקפאה',
    category: 'kitchen' as const,
    group: G_KITCHEN,
    tags: ['מקרר', 'מקפיא', 'דלתות צרפתיות', 'נירוסטה', 'מתקן מים'],
    size: { w, d, h },
    colors: [slot('body', 'גוף', '#c9ccce')],
    actions: [{ kind: 'open' }, { kind: 'snack' }],
    build: ({ colors: c }: { colors: C }) => {
      const k = new Kit();
      const steel = M.brushed(c.body);
      const side = M.paint(darken(c.body, 0.2), 0.45);
      const liner = M.paint('#f4f5f3', 0.4);
      const glassShelf = M.glass('#dff0f4', 0.35);
      const bodyD = cz + d / 2;
      const bz = -d / 2 + bodyD / 2;
      // carcass (hollow): sides, top, back, divider, plinth
      for (const s of [-1, 1]) k.box(0.025, h - 0.06, bodyD, side, s * (w / 2 - 0.0125), 0.06, bz);
      k.rbox(w, 0.03, bodyD, 0.006, side, 0, h - 0.03, bz, 1);
      k.box(w - 0.05, h - 0.09, 0.03, side, 0, 0.06, -d / 2 + 0.015);
      k.box(w - 0.05, 0.05, bodyD - 0.03, liner, 0, split - 0.03, bz + 0.015);
      k.box(w - 0.05, 0.03, bodyD - 0.03, liner, 0, 0.06, bz + 0.015);
      k.box(w - 0.01, 0.06, bodyD - 0.08, M.matte('#232426'), 0, 0, bz - 0.04);
      // liner faces inside the fresh-food compartment
      k.box(w - 0.06, h - split - 0.06, 0.004, liner, 0, split + 0.02, -d / 2 + 0.032);
      for (const s of [-1, 1]) k.box(0.004, h - split - 0.06, bodyD - 0.04, liner, s * (w / 2 - 0.027), split + 0.02, bz + 0.02);
      k.box(w - 0.06, 0.004, bodyD - 0.04, liner, 0, h - 0.035, bz + 0.02);
      k.box(w * 0.4, 0.006, 0.02, M.glow('#eaf6ff', 1.2), 0, h - 0.042, bz).castShadow = false;
      // glass shelves + crisper drawers + some food
      const shZ = bz - 0.06;
      const shD = bodyD - 0.16;
      for (const y of [0.98, 1.24, 1.5]) {
        k.box(w - 0.06, 0.006, shD, glassShelf, 0, y, shZ);
        k.box(w - 0.06, 0.012, 0.01, liner, 0, y - 0.003, shZ + shD / 2);
      }
      for (const s of [-1, 1]) k.rbox(w / 2 - 0.05, 0.26, shD, 0.01, M.glass('#e6f2f4', 0.45), s * (w / 4 - 0.01), split + 0.04, shZ, 1);
      k.box(w - 0.06, 0.006, shD, glassShelf, 0, split + 0.31, shZ);
      const caps = M.plastic('#2f6fb5');
      smallBottle(k, -0.3, 0.986, shZ + 0.1, 0.24, 0.04, M.plastic('#f2f2ee'), caps);
      smallBottle(k, -0.2, 0.986, shZ + 0.12, 0.23, 0.035, M.glass('#f2a93b', 0.75), M.plastic('#2a8a3a'));
      k.rbox(0.18, 0.08, 0.14, 0.01, M.plastic('#e9e2d2'), 0.15, 0.986, shZ + 0.05, 1);
      k.rbox(0.14, 0.06, 0.12, 0.01, M.glass('#f0f6f7', 0.6), 0.24, 1.246, shZ + 0.04, 1);
      for (let i = 0; i < 3; i++)
        k.sphere(0.035, M.paint(['#b3242b', '#e8842a', '#9cbb3c'][i], 0.4), -0.25 + i * 0.075, split + 0.085, shZ + 0.03, 1, 0.95, 1, 12);
      k.cyl(0.07, 0.11, M.ceramic('#e8e4da'), 0.0, 1.246, shZ - 0.05, 0.075, 18);
      // gasket gap plate on the freezer opening
      k.box(w - 0.05, 0.004, 0.02, M.matte('#2b2b2c'), 0, split - 0.03, cz - 0.01);
      // left & right doors
      const dh = h - split - 0.006;
      const dW = w / 2 - 0.003;
      const mkDoor = (s: number) => {
        const p = k.part('door', s * (w / 2), split + 0.003, cz, {
          open: s < 0 ? -1.8 : 1.8,
        });
        const cx = -s * (dW / 2);
        p.rbox(dW, dh, doorT, 0.012, steel, cx, 0, doorT / 2, 2);
        p.box(dW - 0.04, dh - 0.06, 0.004, M.paint('#e9eaea', 0.4), cx, 0.03, -0.002);
        // door bins
        for (const y of [0.2, 0.55, 0.85]) {
          p.box(dW - 0.09, 0.08, 0.004, M.glass('#e6f2f4', 0.55), cx, y, -0.085);
          p.box(dW - 0.09, 0.006, 0.08, M.plastic('#f2f2ee'), cx, y, -0.045);
        }
        smallBottle(p, cx - 0.08, 0.556, -0.04, 0.2, 0.03, M.glass('#3b6b34', 0.8), M.plastic('#c7a24a'));
        smallBottle(p, cx + 0.02, 0.556, -0.04, 0.17, 0.03, M.plastic('#f6f6f2'), M.plastic('#c0392b'));
        // long bar handle near the centre seam
        const hx = -s * (dW - 0.05);
        barHandle(p, [hx, 0.15, doorT + 0.024], [hx, dh - 0.15, doorT + 0.024], doorT, M.chrome(), 0.011);
        if (s < 0) {
          // ice & water dispenser niche
          p.rbox(0.2, 0.32, 0.006, 0.02, M.screen('#141518'), cx, 0.32, doorT + 0.001, 1);
          p.box(0.1, 0.03, 0.004, glowDisplay(), cx, 0.6, doorT + 0.004).castShadow = false;
          p.rbox(0.06, 0.06, 0.03, 0.01, M.plastic('#2a2b2e'), cx, 0.52, doorT + 0.015, 1);
          p.box(0.16, 0.012, 0.03, M.plastic('#2a2b2e'), cx, 0.34, doorT + 0.015);
        }
      };
      mkDoor(-1);
      mkDoor(1);
      // freezer drawer
      const dr = k.part('drawer', 0, 0, 0, { open: 0.45 });
      dr.rbox(w - 0.004, split - 0.068, doorT, 0.012, steel, 0, 0.065, cz + doorT / 2, 2);
      barHandle(dr, [-0.3, split - 0.1, fz + 0.024], [0.3, split - 0.1, fz + 0.024], fz, M.chrome(), 0.011);
      const bk = M.metal('#d7d9db', 0.4, 0.6);
      dr.box(w - 0.1, 0.006, 0.5, bk, 0, 0.1, cz - 0.27);
      for (const s of [-1, 1]) dr.box(0.006, 0.32, 0.5, bk, s * (w / 2 - 0.05), 0.1, cz - 0.27);
      dr.box(w - 0.1, 0.32, 0.006, bk, 0, 0.1, cz - 0.52);
      dr.rbox(0.3, 0.12, 0.2, 0.02, M.paint('#f2f2f0', 0.6), -0.15, 0.106, cz - 0.2, 1);
      dr.rbox(0.25, 0.08, 0.3, 0.01, M.matte('#8ab4d8'), 0.2, 0.106, cz - 0.27, 1);
      return k.g;
    },
    draw2d: (ctx: Ctx2D, c: C) =>
      sym(ctx, () => {
        drawTall(ctx, w, d, tint(c.body, 0.5));
        D.line(ctx, 0, d / 2 - 0.07, 0, d / 2, INK_SOFT);
      }),
  };
})();

const wineFridge: FurnitureDef = (() => {
  const w = 0.6;
  const d = 0.57;
  const h = 0.85;
  const fz = d / 2 - 0.065; // carcass front, door (and handle) in front of it
  return {
    id: 'appl-wine-fridge',
    name: 'מקרר יין עם דלת זכוכית',
    category: 'kitchen' as const,
    group: G_KITCHEN,
    tags: ['יין', 'מקרר יין', 'בקבוקים', 'זכוכית', 'בר'],
    size: { w, d, h },
    colors: [slot('body', 'גוף', '#1d1e20'), slot('racks', 'מדפים', PAL.oak)],
    actions: [{ kind: 'open' }],
    build: ({ colors: c }: { colors: C }) => {
      const k = new Kit();
      const body = M.paint(c.body, 0.45);
      const bodyD = fz + d / 2;
      const bz = -d / 2 + bodyD / 2;
      for (const s of [-1, 1]) k.box(0.02, h - 0.1, bodyD, body, s * (w / 2 - 0.01), 0.1, bz);
      k.box(w, 0.02, bodyD, body, 0, h - 0.02, bz);
      k.box(w - 0.04, h - 0.12, 0.02, M.paint('#26282b', 0.6), 0, 0.1, -d / 2 + 0.01);
      k.box(w - 0.04, 0.02, bodyD, body, 0, 0.1, bz);
      // kick plate with vent grille
      k.box(w, 0.1, bodyD - 0.02, M.matte('#141414'), 0, 0, bz - 0.01);
      for (let i = 0; i < 14; i++) k.box(0.025, 0.05, 0.004, M.matte('#2c2d2f'), -0.2 + i * 0.031, 0.025, fz - 0.018);
      // LED strip
      k.box(w - 0.08, 0.006, 0.02, M.glow('#9fd0ff', 1.4), 0, h - 0.028, fz - 0.06).castShadow = false;
      // racks with bottles lying neck-out
      const wood = M.wood(c.racks, 0.5);
      const wire = M.metal('#8a8d90', 0.4, 0.8);
      const glassB = [M.lacquer('#1c2a1e'), M.lacquer('#3a1a1e'), M.lacquer('#2a2f1c')];
      const capM = [M.metal('#6b1420', 0.4, 0.8), M.metal('#c9a35a', 0.35, 1), M.matte('#1a1a1a')];
      for (let r = 0; r < 5; r++) {
        const y = 0.14 + r * 0.135;
        k.box(w - 0.06, 0.01, bodyD - 0.06, wire, 0, y, bz - 0.01);
        k.box(w - 0.06, 0.028, 0.014, wood, 0, y, fz - 0.04);
        for (let i = 0; i < 5; i++) {
          const x = -0.2 + i * 0.1;
          const m = k.lathe(
            [
              [0, 0],
              [0.036, 0],
              [0.036, 0.2],
              [0.014, 0.25],
              [0.014, 0.3],
              [0, 0.3],
            ],
            glassB[(r + i) % 3],
            0,
            0,
            0,
            8,
          );
          m.rotation.x = Math.PI / 2;
          m.position.set(x, y + 0.047, fz - 0.33);
          const cp = k.cyl(0.0145, 0.03, capM[(r * 2 + i) % 3], 0, 0, 0, 0.0145, 8);
          cp.rotation.x = Math.PI / 2;
          cp.position.set(x, y + 0.047, fz - 0.045);
        }
      }
      // glass door
      const dp = k.part('door', -w / 2, 0.1, fz, { open: -1.6 });
      const steel = M.brushed('#9a9da0');
      const dh = h - 0.104;
      const dw = w - 0.004;
      dp.box(dw, 0.04, 0.03, steel, dw / 2, 0, 0.015);
      dp.box(dw, 0.04, 0.03, steel, dw / 2, dh - 0.04, 0.015);
      dp.box(0.04, dh - 0.08, 0.03, steel, 0.02, 0.04, 0.015);
      dp.box(0.04, dh - 0.08, 0.03, steel, dw - 0.02, 0.04, 0.015);
      dp.box(dw - 0.08, dh - 0.08, 0.006, M.glass('#40505a', 0.3), dw / 2, 0.04, 0.016);
      barHandle(dp, [dw - 0.035, 0.18, 0.055], [dw - 0.035, dh - 0.18, 0.055], 0.03, M.chrome(), 0.008);
      plate(dp, 0.05, 0.014, glowDisplay('#9fd0ff'), dw / 2, dh - 0.012, 0.03);
      return k.g;
    },
    draw2d: (ctx: Ctx2D, c: C) =>
      sym(ctx, () => {
        D.rr(ctx, 0, -0.015, w, d - 0.03, 0.006, tint(c.body, 0.65));
        D.rr(ctx, 0, d / 2 - 0.015, w, 0.03, 0.004, '#bcd3dc');
        for (let i = 0; i < 5; i++) D.line(ctx, -0.2 + i * 0.1, -0.06, -0.2 + i * 0.1, 0.24, INK_SOFT, 0.012);
      }),
  };
})();

const retroFridge: FurnitureDef = (() => {
  const w = 0.62;
  const d = 0.7;
  const h = 1.55;
  const doorT = 0.06;
  const fz = d / 2 - 0.045;
  const cz = fz - doorT;
  const split = 1.14;
  return {
    id: 'appl-fridge-retro',
    name: 'מקרר רטרו',
    category: 'kitchen' as const,
    group: G_KITCHEN,
    tags: ['מקרר', 'רטרו', 'וינטג׳', 'צבעוני', 'שנות החמישים'],
    size: { w, d, h },
    colors: [slot('body', 'גוף', '#9fd3c7')],
    actions: [{ kind: 'open' }, { kind: 'snack' }],
    build: ({ colors: c }: { colors: C }) => {
      const k = new Kit();
      const body = M.lacquer(c.body);
      const liner = M.paint('#f6f5f0', 0.4);
      const chrome = M.chrome();
      const bodyD = cz + d / 2;
      const bz = -d / 2 + bodyD / 2;
      // feet / kick grille
      k.box(w - 0.06, 0.1, bodyD - 0.06, M.matte('#2a2b2d'), 0, 0, bz - 0.02);
      for (const sx of [-1, 1]) k.cyl(0.02, 0.1, chrome, sx * (w / 2 - 0.05), 0, cz - 0.05, 0.016, 12);
      // carcass with rounded top
      for (const s of [-1, 1]) k.rbox(0.03, h - 0.13, bodyD, 0.012, body, s * (w / 2 - 0.015), 0.1, bz, 2);
      k.rbox(w, 0.06, bodyD, 0.028, body, 0, h - 0.06, bz, 2);
      k.box(w - 0.06, 0.03, bodyD, body, 0, 0.1, bz);
      k.box(w - 0.06, h - 0.16, 0.03, body, 0, 0.13, -d / 2 + 0.015);
      k.box(w - 0.06, 0.03, bodyD - 0.03, liner, 0, split - 0.03, bz + 0.015);
      // interior liner + shelves + food
      k.box(w - 0.07, h - 0.23, 0.004, liner, 0, 0.13, -d / 2 + 0.032);
      for (const s of [-1, 1]) k.box(0.004, h - 0.23, bodyD - 0.04, liner, s * (w / 2 - 0.032), 0.13, bz + 0.02);
      const shD = bodyD - 0.14;
      const shZ = bz - 0.05;
      for (const y of [0.45, 0.78]) k.box(w - 0.07, 0.008, shD, M.metal('#e3e5e6', 0.3, 0.6), 0, y, shZ);
      k.rbox(w - 0.08, 0.2, shD, 0.01, M.glass('#e6f2f4', 0.45), 0, 0.15, shZ, 1);
      smallBottle(k, -0.18, 0.458, shZ + 0.05, 0.22, 0.035, M.glass('#d9ecf1', 0.55), M.plastic('#2f6fb5'));
      smallBottle(k, -0.1, 0.458, shZ + 0.08, 0.2, 0.03, M.plastic('#f6f6f2'), M.plastic('#c0392b'));
      k.rbox(0.16, 0.07, 0.12, 0.01, M.plastic('#e9e2d2'), 0.12, 0.458, shZ + 0.03, 1);
      k.cyl(0.07, 0.12, M.ceramic('#e8c8a8'), 0.1, 0.786, shZ, 0.075, 16);
      k.box(0.2, 0.004, 0.08, M.glow('#fff4d8', 1.2), 0, h - 0.085, bz - 0.05).castShadow = false;
      // doors hinged on the left, chrome lever handles on the right
      const mk = (y0: number, dh: number, handleY: number) => {
        const p = k.part('door', -w / 2, y0, cz, { open: -1.8 });
        const dw = w - 0.004;
        p.rbox(dw, dh, doorT, 0.03, body, dw / 2, 0, doorT / 2, 2);
        p.box(dw - 0.06, dh - 0.06, 0.006, M.paint('#f2f1ec', 0.4), dw / 2, 0.03, -0.003);
        p.box(dw - 0.08, 0.008, 0.008, M.paint(darken(c.body, 0.1), 0.4), dw / 2, 0.012, -0.01);
        if (dh > 0.6) {
          for (const y of [0.2, 0.5, 0.75]) {
            p.box(dw - 0.1, 0.06, 0.004, M.plastic('#f2f2ee'), dw / 2, y, -0.07);
            p.box(dw - 0.1, 0.006, 0.07, M.plastic('#f2f2ee'), dw / 2, y, -0.035);
          }
          smallBottle(p, dw / 2 - 0.1, 0.506, -0.035, 0.18, 0.028, M.glass('#5b8a3a', 0.8), M.plastic('#c9a35a'));
          smallBottle(p, dw / 2 + 0.05, 0.506, -0.035, 0.15, 0.03, M.plastic('#f6f6f2'), M.plastic('#2f6fb5'));
        }
        // lever handle
        p.rbox(0.03, 0.09, 0.016, 0.006, chrome, dw - 0.04, handleY - 0.045, doorT + 0.004, 1);
        p.rbox(0.022, 0.11, 0.026, 0.01, chrome, dw - 0.04, handleY - 0.055, doorT + 0.016, 2);
        return p;
      };
      const top = mk(split + 0.004, h - split - 0.03, 0.18);
      top.rbox(0.12, 0.018, 0.006, 0.004, M.chrome(), (w - 0.004) / 2, 0.24, doorT + 0.002, 1);
      mk(0.134, split - 0.138, 0.82);
      return k.g;
    },
    draw2d: (ctx: Ctx2D, c: C) =>
      sym(ctx, () => {
        drawTall(ctx, w, d - 0.03, tint(c.body, 0.4), 0.06);
        D.rr(ctx, w / 2 - 0.044, d / 2 - 0.02, 0.024, 0.03, 0.006, '#e6e8ea');
      }),
  };
})();

const waterDispenser: FurnitureDef = {
  id: 'appl-water-dispenser',
  name: 'מתקן מים עם בקבוק',
  category: 'kitchen',
  group: G_KITCHEN,
  tags: ['מים', 'בר מים', 'מתקן', 'קר חם', 'משרד'],
  size: { w: 0.32, d: 0.4, h: 1.47 },
  colors: [slot('body', 'גוף', '#f2f2f0')],
  actions: [{ kind: 'snack' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const body = M.paint(c.body, 0.35);
    const w = 0.3;
    const dd = 0.32;
    k.rbox(w, 0.98, dd, 0.02, body, 0, 0.0, -0.03, 2);
    // recess with drip tray and taps
    const fz = dd / 2 - 0.03;
    k.rbox(0.22, 0.26, 0.004, 0.015, M.paint('#3a3c40', 0.4), 0, 0.62, fz + 0.001, 1);
    k.box(0.2, 0.02, 0.07, M.plastic('#2a2b2e'), 0, 0.62, fz + 0.03);
    for (let i = 0; i < 5; i++) k.box(0.18, 0.002, 0.004, M.chrome(), 0, 0.64, fz + 0.005 + i * 0.012);
    for (const [x, col] of [
      [-0.05, '#c0392b'],
      [0.05, '#2f6fb5'],
    ] as Array<[number, string]>) {
      k.rbox(0.05, 0.05, 0.05, 0.01, M.plastic('#eaeae6'), x, 0.8, fz + 0.022, 1);
      k.rbox(0.04, 0.035, 0.016, 0.006, M.plastic(col), x, 0.83, fz + 0.05, 1);
      k.cyl(0.006, 0.02, M.plastic('#eaeae6'), x, 0.78, fz + 0.03, 0.006, 8);
    }
    for (const [x, col] of [
      [-0.03, '#ff5a4a'],
      [0.03, '#4aa8ff'],
    ] as Array<[number, string]>)
      k.sphere(0.005, M.glow(col, 1.6), x, 0.92, fz + 0.002, 1, 1, 0.5, 8);
    // lower cabinet door
    k.rbox(0.24, 0.42, 0.006, 0.01, M.paint(lighten(c.body, 0.3), 0.4), 0, 0.08, fz + 0.002, 1);
    k.box(0.08, 0.012, 0.01, M.plastic('#bdbdb8'), 0, 0.44, fz + 0.007);
    // bottle on top
    k.cyl(0.08, 0.02, M.plastic('#e4e4e0'), 0, 0.98, -0.03, 0.09, 20);
    sLathe(
      k,
      [
        [0.03, 0],
        [0.03, 0.04],
        [0.1, 0.09],
        [0.135, 0.12],
        [0.135, 0.22],
        [0.13, 0.25],
        [0.135, 0.28],
        [0.135, 0.42],
        [0.12, 0.47],
        [0, 0.48],
      ],
      M.glass('#7fb8de', 0.4),
      0,
      0.99,
      -0.03,
      24,
      18,
    );
    k.cyl(0.128, 0.3, M.water('#a9d4ec'), 0, 1.11, -0.03, 0.128, 24);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, -0.03, 0.3, 0.32, 0.02, tint(c.body, 0.3));
      D.circle(ctx, 0, -0.03, 0.135, '#cfe3ef', undefined, LINE_THIN);
      D.circle(ctx, 0, -0.03, 0.03, null, INK_SOFT, LINE_THIN);
      D.rr(ctx, 0, 0.16, 0.2, 0.07, 0.006, '#55575c');
    }),
};

/* ================================================================== COOKING */

/** cast-iron pan support made of square bars over a w × d area. (x, y, z) = bottom centre. */
function grate(k: Kit, w: number, d: number, x: number, y: number, z: number, mat: THREE.Material): void {
  const b = 0.012;
  const h = 0.022;
  k.box(w, h, b, mat, x, y, z - d / 2 + b / 2);
  k.box(w, h, b, mat, x, y, z + d / 2 - b / 2);
  k.box(b, h, d, mat, x - w / 2 + b / 2, y, z);
  k.box(b, h, d, mat, x + w / 2 - b / 2, y, z);
  k.box(w, h, b, mat, x, y, z);
  k.box(b, h, d, mat, x, y, z);
}

const rangeCooker: FurnitureDef = (() => {
  const w = 0.9;
  const d = 0.65;
  const top = 0.9;
  const potX = -0.21;
  const potZ = 0.1;
  const potTop = top + 0.024 + 0.15;
  return {
    id: 'appl-range-cooker',
    name: 'תנור משולב קלאסי 90 עם סירים',
    category: 'kitchen' as const,
    group: G_KITCHEN,
    tags: ['תנור', 'כיריים', 'גז', 'בישול', 'קלאסי', 'סיר', 'מחבת'],
    size: { w, d, h: 1.1 },
    colors: [slot('enamel', 'אמייל', '#2f3e55'), slot('trim', 'פרזול', '#c9a35a')],
    actions: [{ kind: 'cook', at: { x: potX, y: r3(potTop), z: potZ } }],
    build: ({ colors: c }: { colors: C }) => {
      const k = new Kit();
      const en = M.lacquer(c.enamel);
      const trim = M.metal(c.trim, 0.25, 1);
      const black = M.blackMetal();
      const steel = M.brushed('#c9ccce');
      const fz = d / 2 - 0.05;
      // body + plinth + feet
      k.box(w, top - 0.1, d - 0.05, en, 0, 0.1, -0.025);
      k.box(w - 0.04, 0.1, d - 0.1, M.matte('#1e1f22'), 0, 0, -0.05);
      for (const s of [-1, 1]) k.cyl(0.02, 0.1, trim, s * (w / 2 - 0.05), 0, fz - 0.05, 0.016, 12);
      // hob: steel top, upstand, burners, grates
      k.rbox(w, 0.025, d - 0.04, 0.006, M.brushed('#b9bcbf'), 0, top - 0.025, -0.02, 1);
      k.rbox(w, 0.1, 0.04, 0.008, en, 0, top - 0.002, -d / 2 + 0.02, 1);
      k.box(w - 0.1, 0.012, 0.002, black, 0, top + 0.06, -d / 2 + 0.0405);
      const burners: Array<[number, number, number]> = [
        [-0.21, 0.1, 0.05],
        [-0.21, -0.12, 0.04],
        [0.0, -0.01, 0.065],
        [0.21, 0.1, 0.04],
        [0.21, -0.12, 0.05],
      ];
      for (const [x, z, r] of burners) {
        k.cyl(r + 0.012, 0.008, M.blackMetal(), x, top, z, r + 0.012, 16);
        k.cyl(r, 0.012, M.metal('#5b5d60', 0.5, 0.8), x, top + 0.008, z, r * 0.9, 16);
        k.cyl(r * 0.7, 0.004, black, x, top + 0.02, z, r * 0.7, 14);
      }
      const gy = top + 0.002;
      grate(k, 0.3, 0.5, -0.27, gy, -0.01, black);
      grate(k, 0.24, 0.5, 0.0, gy, -0.01, black);
      grate(k, 0.3, 0.5, 0.27, gy, -0.01, black);
      // pot with lid on the front-left burner
      const py = gy + 0.022;
      k.lathe(
        [
          [0, 0],
          [0.105, 0],
          [0.11, 0.008],
          [0.11, 0.13],
          [0.114, 0.135],
          [0.106, 0.135],
          [0.106, 0.01],
          [0, 0.01],
        ],
        steel,
        potX,
        py,
        potZ,
        20,
      );
      sLathe(
        k,
        [
          [0, 0.0],
          [0.112, 0.0],
          [0.1, 0.012],
          [0.04, 0.025],
          [0, 0.028],
        ],
        M.glass('#e8f2f4', 0.4),
        potX,
        py + 0.13,
        potZ,
        18,
        10,
      );
      k.sphere(0.014, black, potX, py + 0.162, potZ, 1, 0.6, 1, 10);
      for (const s of [-1, 1]) k.rbox(0.04, 0.012, 0.02, 0.005, black, potX + s * 0.125, py + 0.105, potZ, 1);
      // frying pan on the front-right burner, handle to the side
      k.lathe(
        [
          [0, 0],
          [0.1, 0],
          [0.12, 0.04],
          [0.114, 0.042],
          [0.096, 0.008],
          [0, 0.008],
        ],
        M.metal('#2b2c2f', 0.45, 0.6),
        0.21,
        py,
        0.1,
        20,
      );
      k.rod([0.325, py + 0.035, 0.1], [0.44, py + 0.06, 0.1], 0.009, M.wood(PAL.walnut, 0.4), 0.008, 8);
      // control panel with knobs
      k.box(w - 0.02, 0.1, 0.004, en, 0, 0.775, fz + 0.002);
      const knobs = [-0.36, -0.26, -0.16, -0.06, 0.06, 0.18, 0.3];
      for (const x of knobs) {
        discZ(k, 0.025, 0.004, trim, x, 0.825, fz + 0.002, 16);
        knobZ(k, x, 0.825, fz + 0.004, 0.019, 0.03, M.plastic('#1b1c1e'), M.matte('#d8d8d8'), 14);
      }
      plate(k, 0.06, 0.02, glowDisplay('#ffb347'), 0.4, 0.835, fz + 0.004);
      // oven doors (main left, secondary right) with windows + towel rail
      const doors: Array<[number, number]> = [
        [-0.155, 0.55],
        [0.29, 0.29],
      ];
      for (const [x, dw] of doors) {
        k.rbox(dw - 0.01, 0.46, 0.03, 0.006, en, x, 0.27, fz, 1);
        k.rbox(dw - 0.12, 0.25, 0.004, 0.01, M.screen('#141518'), x, 0.36, fz + 0.015, 1);
        k.rbox(dw - 0.08, 0.31, 0.003, 0.006, trim, x, 0.33, fz + 0.0135, 1);
      }
      barHandle(k, [-0.42, 0.68, fz + 0.035], [0.42, 0.68, fz + 0.035], fz + 0.015, trim, 0.011);
      // storage drawer
      k.rbox(w - 0.02, 0.14, 0.03, 0.006, en, 0, 0.11, fz, 1);
      barHandle(k, [-0.12, 0.2, fz + 0.035], [0.12, 0.2, fz + 0.035], fz + 0.015, trim, 0.008);
      return k.g;
    },
    draw2d: (ctx: Ctx2D, c: C) =>
      sym(ctx, () => {
        D.rr(ctx, 0, 0, w, d, 0.006, tint(c.enamel, 0.6));
        D.rr(ctx, 0, -0.01, w - 0.02, 0.5, 0.006, '#d5d8dc');
        for (const [x, z, r] of [
          [-0.21, 0.1, 0.05],
          [-0.21, -0.12, 0.04],
          [0.0, -0.01, 0.065],
          [0.21, 0.1, 0.04],
          [0.21, -0.12, 0.05],
        ]) {
          D.circle(ctx, x, z, r + 0.012, '#f3f4f5', undefined, LINE_THIN);
          D.circle(ctx, x, z, r * 0.6, null, INK_SOFT, 0.006);
        }
        D.circle(ctx, potX, potZ, 0.112, null, INK_SOFT, 0.01);
        D.line(ctx, -w / 2, d / 2 - 0.04, w / 2, d / 2 - 0.04, INK_SOFT);
      }),
  };
})();

const wallOven: FurnitureDef = {
  id: 'appl-wall-oven-tower',
  name: 'עמודת תנורים בנויה',
  category: 'kitchen',
  group: G_KITCHEN,
  tags: ['תנור', 'תנור בנוי', 'עמודה', 'קומבי', 'אפייה'],
  size: { w: 0.6, d: 0.6, h: 2.17 },
  colors: [slot('fronts', 'חזיתות', PAL.sage), slot('oven', 'תנור', '#1c1d20')],
  actions: [{ kind: 'cook', at: { x: 0, y: 1.42, z: 0.3 } }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const w = 0.6;
    const d = 0.6;
    const fr = M.paint(c.fronts);
    const fz = d / 2 - 0.04 - 0.022;
    cabinet(
      k,
      {
        w,
        h: 2.17,
        d: d - 0.04,
        body: fr,
        front: fr,
        cols: [[{ kind: 'panel', weight: 1 }]],
        base: 'plinth',
        handle: 'none',
      },
      0,
      0,
      -0.02,
    );
    // cover the plain panel with real fronts: top door, ovens, warming drawer, bottom door
    const glass = M.screen(c.oven);
    const steel = M.brushed('#c9ccce');
    const oven = (y0: number, h: number, win: number) => {
      k.box(w - 0.006, h - 0.006, 0.022, glass, 0, y0 + 0.003, fz + 0.011);
      k.box(w - 0.006, 0.075, 0.002, M.screen('#101114'), 0, y0 + h - 0.08, fz + 0.0225);
      plate(k, 0.12, 0.024, glowDisplay('#ffb347'), 0, y0 + h - 0.03, fz + 0.023);
      for (const x of [-0.2, 0.2]) knobZ(k, x, y0 + h - 0.042, fz + 0.022, 0.018, 0.014, steel, M.matte('#222'), 16);
      k.box(w - 0.12, win, 0.001, M.screen('#2a2c30'), 0, y0 + 0.06, fz + 0.0225);
      barHandle(k, [-0.24, y0 + h - 0.11, fz + 0.052], [0.24, y0 + h - 0.11, fz + 0.052], fz + 0.022, steel, 0.008);
    };
    k.rbox(w - 0.004, 0.27, 0.019, 0.0035, fr, 0, 1.885, fz + 0.0095, 1);
    oven(1.43, 0.45, 0.24);
    oven(0.84, 0.59, 0.34);
    k.box(w - 0.006, 0.14, 0.022, glass, 0, 0.695, fz + 0.011);
    barHandle(k, [-0.15, 0.785, fz + 0.052], [0.15, 0.785, fz + 0.052], fz + 0.022, steel, 0.008);
    k.rbox(w - 0.004, 0.58, 0.019, 0.0035, fr, 0, 0.102, fz + 0.0095, 1);
    barHandle(k, [w / 2 - 0.045, 0.5, fz + 0.04], [w / 2 - 0.045, 0.66, fz + 0.04], fz + 0.019, steel, 0.006);
    barHandle(k, [w / 2 - 0.045, 1.92, fz + 0.04], [w / 2 - 0.045, 2.08, fz + 0.04], fz + 0.019, steel, 0.006);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      drawTall(ctx, 0.6, 0.6, tint(c.fronts, 0.4), 0.03);
      D.rr(ctx, 0, 0.285, 0.5, 0.012, 0.004, '#c9ccce', null);
    }),
};

/* ================================================================== BATH */

const clawfootTub: FurnitureDef = (() => {
  const ax = 0.82;
  const az = 0.37;
  const rimY = 0.672;
  const spout = { x: -0.64, y: 0.76, z: 0 };
  return {
    id: 'bath-clawfoot-tub',
    name: 'אמבטיה עומדת על רגלי טפרים',
    category: 'bathroom' as const,
    group: G_TUBS,
    tags: ['אמבטיה', 'עומדת', 'רגליים', 'קלאסי', 'וינטג׳', 'ויקטוריאני'],
    size: { w: 1.7, d: 0.78, h: 0.9 },
    colors: [slot('outside', 'צבע חיצוני', '#33464f'), slot('metal', 'רגליים וברזים', PAL.brass)],
    seats: [{ x: 0.12, z: 0, height: 0.3, facing: -Math.PI / 2, kind: 'lie' }],
    actions: [{ kind: 'water', at: spout }],
    build: ({ colors: c }: { colors: C }) => {
      const k = new Kit();
      const outer: Prof = [
        [0, 0.16],
        [0.55, 0.16],
        [0.75, 0.19],
        [0.88, 0.27],
        [0.95, 0.4],
        [0.985, 0.54],
        [1.0, 0.63],
      ];
      const inner: Prof = [
        [1.0, 0.63],
        [1.022, 0.645],
        [1.018, 0.665],
        [0.995, rimY],
        [0.968, 0.662],
        [0.955, 0.6],
        [0.93, 0.45],
        [0.86, 0.3],
        [0.72, 0.23],
        [0.5, 0.212],
        [0, 0.21],
      ];
      k.geo(superLatheGeo(outer, ax, az, 2.8, 56), M.lacquer(c.outside), 0, 0, 0);
      k.geo(superLatheGeo(inner, ax, az, 2.8, 56), M.ceramic('#f7f6f2'), 0, 0, 0);
      const metal = M.metal(c.metal, 0.28, 1);
      // claw feet
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const x = sx * 0.54;
          const z = sz * 0.2;
          k.tube(
            [
              [x, 0.19, z],
              [x + sx * 0.03, 0.12, z + sz * 0.02],
              [x + sx * 0.035, 0.05, z + sz * 0.035],
              [x + sx * 0.05, 0.03, z + sz * 0.05],
            ],
            0.024,
            metal,
            { seg: 8, radial: 8 },
          );
          k.sphere(0.03, metal, x + sx * 0.055, 0.03, z + sz * 0.055, 1.1, 1, 1.1, 10);
          for (const i of [-1, 1]) k.sphere(0.012, metal, x + sx * 0.07 + i * 0.016 * sz, 0.012, z + sz * 0.075 + i * 0.016 * -sx, 1, 1, 1, 6);
        }
      }
      // deck mixer on the rim at the -X end, with hand shower
      const tx = -0.765;
      for (const s of [-1, 1]) {
        k.cyl(0.016, 0.08, metal, tx, rimY - 0.004, s * 0.08, 0.013, 12);
        k.rod([tx, rimY + 0.09, s * 0.08], [tx, rimY + 0.13, s * 0.08], 0.006, metal, 0.006, 8);
        k.box(0.012, 0.012, 0.06, metal, tx, rimY + 0.13, s * 0.08);
      }
      k.rod([tx, rimY + 0.076, -0.08], [tx, rimY + 0.076, 0.08], 0.011, metal, 0.011, 12);
      k.tube(
        [
          [tx, rimY + 0.076, 0],
          [tx + 0.02, rimY + 0.17, 0],
          [tx + 0.1, rimY + 0.2, 0],
          [spout.x, spout.y + 0.04, 0],
          [spout.x, spout.y + 0.005, 0],
        ],
        0.011,
        metal,
        { seg: 20, radial: 10 },
      );
      k.rod([tx - 0.01, rimY + 0.09, 0.0], [tx - 0.04, rimY + 0.16, 0.0], 0.008, metal, 0.008, 8);
      k.rod([tx - 0.04, rimY + 0.16, -0.06], [tx - 0.04, rimY + 0.16, 0.06], 0.013, metal, 0.011, 12);
      k.cyl(0.024, 0.02, metal, tx - 0.04, rimY + 0.14, 0.07, 0.03, 14).rotation.x = -Math.PI / 2;
      return k.g;
    },
    draw2d: (ctx: Ctx2D, c: C) =>
      sym(ctx, () => {
        const path = (sc: number) => {
          const pts: Array<[number, number]> = [];
          for (let i = 0; i < 48; i++) {
            const a = (i / 48) * Math.PI * 2;
            const s = Math.sin(a);
            const co = Math.cos(a);
            pts.push([sc * ax * Math.sign(s) * Math.pow(Math.abs(s), 2 / 2.8), sc * az * Math.sign(co) * Math.pow(Math.abs(co), 2 / 2.8)]);
          }
          return pts;
        };
        D.poly(ctx, path(1.02), true, tint(c.outside, 0.6));
        D.poly(ctx, path(0.955), true, '#ffffff', INK_SOFT, LINE_THIN);
        D.circle(ctx, -0.55, 0, 0.025, null, INK_SOFT, 0.006);
        D.rr(ctx, -0.77, 0, 0.06, 0.18, 0.01, tint(c.metal, 0.3));
      }),
  };
})();

const freestandingTub: FurnitureDef = (() => {
  const ax = 0.8;
  const az = 0.36;
  const cx = 0.09;
  const spout = { x: -0.62, y: 0.79, z: 0 };
  return {
    id: 'bath-freestanding-oval',
    name: 'אמבטיה עומדת מודרנית עם ברז רצפה',
    category: 'bathroom' as const,
    group: G_TUBS,
    tags: ['אמבטיה', 'עומדת', 'מודרני', 'אובלי', 'ברז רצפה', 'ספא'],
    size: { w: 1.8, d: 0.75, h: 0.95 },
    colors: [slot('tub', 'אמבט', '#f7f6f2'), slot('metal', 'ברז', '#2a2b2e')],
    seats: [{ x: cx + 0.1, z: 0, height: 0.18, facing: -Math.PI / 2, kind: 'lie' }],
    actions: [{ kind: 'water', at: spout }],
    build: ({ colors: c }: { colors: C }) => {
      const k = new Kit();
      const prof: Prof = [
        [0, 0],
        [0.8, 0],
        [0.88, 0.02],
        [0.95, 0.12],
        [0.99, 0.34],
        [1.0, 0.57],
        [0.995, 0.585],
        [0.98, 0.585],
        [0.97, 0.56],
        [0.94, 0.34],
        [0.87, 0.18],
        [0.74, 0.11],
        [0.4, 0.1],
        [0, 0.1],
      ];
      k.geo(superLatheGeo(prof, ax, az, 2.3, 56), M.ceramic(c.tub), cx, 0, 0);
      k.geo(
        superLatheGeo(
          [
            [0.8, 0.0],
            [0.82, 0.004],
            [0, 0.004],
          ],
          ax,
          az,
          2.3,
          40,
        ),
        M.matte('#d7d4cc'),
        cx,
        0,
        0,
      );
      k.cyl(0.03, 0.004, M.chrome(), cx + 0.45, 0.1, 0, 0.03, 16);
      // floor-standing mixer column
      const metal = M.metal(c.metal, 0.35, 0.8);
      const fx = -0.84;
      k.cyl(0.055, 0.012, metal, fx, 0, 0, 0.05, 20);
      k.rod([fx, 0.01, 0], [fx, 0.86, 0], 0.018, metal, 0.016, 14);
      k.tube(
        [
          [fx, 0.85, 0],
          [fx + 0.03, 0.92, 0],
          [fx + 0.12, 0.93, 0],
          [spout.x, spout.y + 0.07, 0],
          [spout.x, spout.y + 0.005, 0],
        ],
        0.014,
        metal,
        { seg: 20, radial: 10 },
      );
      k.cyl(0.022, 0.035, metal, fx, 0.7, 0, 0.022, 14);
      k.rod([fx, 0.735, 0], [fx + 0.05, 0.76, 0.0], 0.006, metal, 0.005, 8);
      // hand shower in a holder on the column
      k.rod([fx - 0.02, 0.55, 0], [fx - 0.02, 0.73, 0], 0.014, metal, 0.016, 12);
      return k.g;
    },
    draw2d: (ctx: Ctx2D, c: C) =>
      sym(ctx, () => {
        D.ellipse(ctx, cx, 0, ax, az, tint(c.tub, 0.5));
        D.ellipse(ctx, cx + 0.01, 0, ax * 0.95, az * 0.93, '#ffffff', INK_SOFT, LINE_THIN);
        D.circle(ctx, cx + 0.45, 0, 0.03, null, INK_SOFT, 0.006);
        D.circle(ctx, -0.84, 0, 0.05, tint(c.metal, 0.5));
        D.line(ctx, -0.84, 0, spout.x, 0, INK_SOFT, 0.024);
      }),
  };
})();

const doubleVanity: FurnitureDef = (() => {
  const w = 1.4;
  const d = 0.52;
  const top = 0.86;
  const bx = 0.34;
  const tapZ = -0.19;
  return {
    id: 'bath-double-vanity',
    name: 'ארון אמבטיה כפול עם שתי כיורים',
    category: 'bathroom' as const,
    group: G_BATHCAB,
    tags: ['ארון אמבטיה', 'כיור כפול', 'שיש', 'מגירות', 'זוגי'],
    size: { w, d, h: 1.11 },
    colors: [slot('fronts', 'חזיתות', '#5a6b5d'), slot('top', 'משטח', '#efece6')],
    actions: [
      {
        kind: 'water',
        at: { x: -bx, y: r3(top + 0.2 * 0.62 - 0.012), z: r3(tapZ + 0.13) },
      },
    ],
    build: ({ colors: c }: { colors: C }) => {
      const k = new Kit();
      const fr = M.paint(c.fronts, 0.45);
      cabinet(k, {
        w,
        h: top - 0.03,
        d,
        body: fr,
        front: fr,
        cols: [[{ kind: 'door', hinge: 'l' }], [{ kind: 'drawer' }, { kind: 'drawer' }, { kind: 'drawer' }], [{ kind: 'door', hinge: 'r' }]],
        colWeights: [1.3, 1, 1.3],
        base: 'legs',
        baseH: 0.16,
        baseMat: M.brass(),
        handle: 'bar',
        handleMat: M.brass(),
      });
      // marble top with two undermount basins
      const t = 0.03;
      const sh = roundedRectShape(w, d, 0.006);
      for (const s of [-1, 1]) sh.holes.push(roundedRectPath(new THREE.Path(), 0.44, 0.32, 0.12, s * bx, -0.04));
      k.slab(sh, t, M.marble(c.top), 0, top - t, 0, 0, 6);
      const cer = M.ceramic('#f7f6f2');
      for (const s of [-1, 1]) {
        const x = s * bx;
        const bowl = roundedRectShape(0.46, 0.34, 0.13, x, -0.04);
        bowl.holes.push(roundedRectPath(new THREE.Path(), 0.42, 0.3, 0.115, x, -0.04));
        k.slab(bowl, 0.15, cer, 0, top - t - 0.15, 0, 0, 6);
        k.slab(roundedRectShape(0.44, 0.32, 0.12, x, -0.04), 0.01, cer, 0, top - t - 0.155, 0, 0, 6);
        k.cyl(0.02, 0.003, M.chrome(), x, top - t - 0.145, 0.04, 0.02, 14);
        mixerTap(k, x, top, tapZ, 0.2, 0.13, M.brass());
      }
      // backsplash strip + accessories
      k.box(w, 0.08, 0.015, M.marble(c.top), 0, top, -d / 2 + 0.0075);
      tumbler(k, 0.0, top, -0.18, 0.1, 0.035, null);
      for (const [dx, col] of [
        [-0.01, '#3f8fd1'],
        [0.012, '#e06a7c'],
      ] as Array<[number, string]>)
        k.rod([dx, top + 0.01, -0.18], [dx * 2.5, top + 0.17, -0.175], 0.004, M.plastic(col), 0.004, 6);
      k.cyl(0.03, 0.15, M.ceramic('#d9cbb6'), 0.05, top, -0.19, 0.028, 16);
      k.cyl(0.012, 0.03, M.brass(), 0.05, top + 0.15, -0.19, 0.012, 10);
      k.rod([0.05, top + 0.175, -0.19], [0.07, top + 0.175, -0.19], 0.004, M.brass(), 0.004, 6);
      return k.g;
    },
    draw2d: (ctx: Ctx2D, c: C) =>
      sym(ctx, () => {
        D.rr(ctx, 0, 0, w, d, 0.006, tint(c.top, 0.3));
        D.line(ctx, -w / 2, d / 2 - 0.03, w / 2, d / 2 - 0.03, INK_SOFT);
        for (const s of [-1, 1]) {
          D.rr(ctx, s * bx, -0.04, 0.44, 0.32, 0.12, '#ffffff');
          D.circle(ctx, s * bx, 0.04, 0.02, null, INK_SOFT, LINE_THIN);
          D.rr(ctx, s * bx, tapZ + 0.06, 0.024, 0.13, 0.01, '#e8d39d');
        }
      }),
  };
})();

const walkInShower: FurnitureDef = (() => {
  const w = 1.4;
  const d = 0.9;
  const h = 2.1;
  const head = { x: -0.15, y: 1.98, z: -0.05 };
  return {
    id: 'bath-walkin-shower',
    name: 'מקלחת וולק-אין עם ראש גשם',
    category: 'bathroom' as const,
    group: G_TUBS,
    tags: ['מקלחת', 'וולק אין', 'ראש גשם', 'זכוכית', 'פתוח', 'ספא'],
    size: { w, d, h },
    colors: [slot('tray', 'משטח', '#d8d4cc'), slot('metal', 'פרזול', '#2a2b2e')],
    actions: [{ kind: 'water', at: { x: head.x, y: head.y - 0.03, z: head.z } }],
    build: ({ colors: c }: { colors: C }) => {
      const k = new Kit();
      const metal = M.metal(c.metal, 0.35, 0.8);
      // low stone tray with a linear drain along the back
      k.rbox(w, 0.035, d, 0.006, M.stone(c.tray, 0.6), 0, 0, 0, 1);
      k.box(w - 0.3, 0.003, 0.05, metal, 0, 0.035, -d / 2 + 0.08);
      for (let i = 0; i < 20; i++) k.box(0.02, 0.0012, 0.03, M.matte('#151515'), -0.52 + i * 0.055, 0.0375, -d / 2 + 0.08);
      // fixed glass panel along the front, entrance open on +X
      const gx0 = -w / 2 + 0.01;
      const gw = 0.95;
      const gz = d / 2 - 0.04;
      k.box(gw, 2.0, 0.01, M.glass('#d8eef2', 0.18), gx0 + gw / 2, 0.035, gz);
      k.box(gw, 0.025, 0.03, metal, gx0 + gw / 2, 0.035, gz);
      k.box(0.02, 2.0, 0.03, metal, gx0 + 0.01, 0.035, gz);
      k.box(0.01, 0.02, 0.02, metal, gx0 + gw, 2.02, gz);
      k.rod([gx0 + gw - 0.02, 2.03, gz], [gx0 + gw - 0.02, 2.03, -d / 2 + 0.005], 0.009, metal, 0.009, 10);
      k.disc(0.02, 0.006, metal, gx0 + gw - 0.02, 2.024, -d / 2 + 0.003, 12).rotation.x = Math.PI / 2;
      // rain head on a wall arm
      const bz = -d / 2;
      k.rod([head.x, 2.06, bz + 0.003], [head.x, 2.06, head.z], 0.012, metal, 0.012, 12);
      k.cyl(0.015, 0.06, metal, head.x, 2.0, head.z, 0.015, 12);
      k.rbox(0.3, 0.012, 0.3, 0.02, metal, head.x, 1.98, head.z, 2);
      k.box(0.27, 0.001, 0.27, M.matte('#5a5c60'), head.x, 1.9795, head.z);
      // thermostatic bar + riser + hand shower
      k.rod([head.x - 0.2, 1.05, bz + 0.04], [head.x + 0.2, 1.05, bz + 0.04], 0.025, metal, 0.025, 16);
      for (const s of [-1, 1]) {
        const kn = discZ(k, 0.03, 0.035, metal, 0, 0, 0, 18);
        kn.rotation.y = Math.PI / 2;
        kn.position.set(head.x + s * 0.22, 1.05, bz + 0.04);
      }
      k.rod([head.x + 0.3, 1.0, bz + 0.03], [head.x + 0.3, 1.8, bz + 0.03], 0.011, metal, 0.011, 10);
      k.rod([head.x + 0.3, 1.5, bz + 0.05], [head.x + 0.3, 1.7, bz + 0.07], 0.014, metal, 0.016, 10);
      k.cyl(0.04, 0.02, metal, head.x + 0.3, 1.7, bz + 0.08, 0.045, 18).rotation.x = -0.4;
      k.tube(
        [
          [head.x + 0.3, 1.5, bz + 0.05],
          [head.x + 0.35, 1.2, bz + 0.06],
          [head.x + 0.24, 1.0, bz + 0.05],
          [head.x + 0.2, 1.04, bz + 0.04],
        ],
        0.006,
        metal,
        { seg: 16, radial: 6 },
      );
      // wall niche shelf with bottles
      k.box(0.36, 0.015, 0.1, M.stone(c.tray, 0.5), 0.45, 1.2, bz + 0.05);
      for (const [x, hh, col] of [
        [0.33, 0.2, '#f1ece2'],
        [0.4, 0.17, '#2f3a40'],
        [0.47, 0.22, '#c7a27a'],
      ] as Array<[number, number, string]>)
        smallBottle(k, x, 1.215, bz + 0.05, hh, 0.028, M.plastic(col), M.plastic('#1b1c1e'));
      k.rbox(0.09, 0.025, 0.06, 0.01, M.matte('#e7dcc6'), 0.54, 1.215, bz + 0.05, 1);
      return k.g;
    },
    draw2d: (ctx: Ctx2D, c: C) =>
      sym(ctx, () => {
        D.rr(ctx, 0, 0, w, d, 0.006, tint(c.tray, 0.5));
        D.line(ctx, -0.55, -d / 2 + 0.08, 0.55, -d / 2 + 0.08, INK_SOFT, 0.03);
        D.line(ctx, -w / 2 + 0.01, d / 2 - 0.04, -w / 2 + 0.96, d / 2 - 0.04, '#7fa9c4', 0.024);
        D.rr(ctx, head.x, head.z, 0.3, 0.3, 0.02, null, INK_SOFT, LINE_THIN);
        D.line(ctx, head.x - 0.15, head.z - 0.15, head.x + 0.15, head.z + 0.15, INK_SOFT, 0.006);
        D.line(ctx, head.x - 0.15, head.z + 0.15, head.x + 0.15, head.z - 0.15, INK_SOFT, 0.006);
      }),
  };
})();

const towelWarmer: FurnitureDef = {
  id: 'bath-towel-warmer',
  name: 'מחמם מגבות חשמלי',
  category: 'bathroom',
  group: G_BATHCAB,
  tags: ['מחמם מגבות', 'מגבת', 'רדיאטור', 'קיר', 'כרום'],
  size: { w: 0.5, d: 0.1, h: 0.8 },
  mount: 'wall',
  elevation: 0.35,
  colors: [slot('metal', 'מתכת', '#e6e8ea'), slot('towel', 'מגבת', '#e9e2d6')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const metal = M.metal(c.metal, 0.15, 1);
    const z = 0.0;
    for (const s of [-1, 1]) {
      k.cyl(0.013, 0.8, metal, s * 0.225, 0, z, 0.013, 12);
      for (const y of [0.12, 0.68]) {
        k.rod([s * 0.225, y, z], [s * 0.225, y, -0.045], 0.009, metal, 0.009, 8);
        k.disc(0.022, 0.006, metal, s * 0.225, y, -0.047, 14).rotation.x = Math.PI / 2;
      }
    }
    const ys = [0.06, 0.12, 0.18, 0.24, 0.34, 0.4, 0.46, 0.56, 0.62, 0.68, 0.76];
    for (const y of ys) k.rod([-0.225, y, z], [0.225, y, z], 0.0085, metal, 0.0085, 8);
    k.cyl(0.015, 0.03, M.plastic('#f2f2f0'), 0.225, -0.0, z, 0.015, 10).position.y = 0.015;
    // towel draped over a bar
    const tw = M.fabric(c.towel, 22);
    const ty = 0.46;
    k.rbox(0.3, 0.22, 0.008, 0.004, tw, 0.02, ty - 0.22, z + 0.016, 1);
    k.rbox(0.3, 0.16, 0.008, 0.004, tw, 0.02, ty - 0.16, z - 0.016, 1);
    const roll = k.cyl(0.02, 0.3, tw, 0, 0, 0, 0.02, 12);
    roll.rotation.z = Math.PI / 2;
    roll.position.set(0.02, ty + 0.004, z);
    k.rbox(0.3, 0.008, 0.008, 0.003, M.fabric(darken(c.towel, 0.1), 22), 0.02, ty - 0.2, z + 0.021, 1);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      ctx.setLineDash([0.04, 0.03]);
      D.rr(ctx, 0, 0, 0.5, 0.1, 0.01, tint(c.metal, 0.3) + 'cc', INK_SOFT);
      ctx.setLineDash([]);
      D.rr(ctx, 0.02, 0, 0.3, 0.05, 0.01, tint(c.towel, 0.2), INK_SOFT, 0.006);
    }),
};

const mirrorCabinet: FurnitureDef = (() => {
  const w = 0.8;
  const d = 0.15;
  const h = 0.7;
  return {
    id: 'bath-mirror-cabinet',
    name: 'ארון מראה עם תאורה',
    category: 'bathroom' as const,
    group: G_BATHCAB,
    tags: ['מראה', 'ארון מראה', 'אמבטיה', 'תאורה', 'קיר'],
    size: { w, d, h },
    mount: 'wall' as const,
    elevation: 1.2,
    colors: [slot('body', 'גוף', '#f3f1ec')],
    actions: [{ kind: 'open' }],
    build: ({ colors: c }: { colors: C }) => {
      const k = new Kit();
      const body = M.paint(c.body, 0.4);
      const t = 0.016;
      const bd = d - 0.02;
      const bz = -d / 2 + bd / 2;
      for (const s of [-1, 1]) k.box(t, h, bd, body, s * (w / 2 - t / 2), 0, bz);
      k.box(w - 2 * t, t, bd, body, 0, 0, bz);
      k.box(w - 2 * t, t, bd, body, 0, h - t, bz);
      k.box(w - 2 * t, h - 2 * t, 0.006, body, 0, t, -d / 2 + 0.003);
      k.box(w - 2 * t, h - 2 * t, 0.004, body, 0, t, bz);
      k.box(0.012, h - 2 * t, bd - 0.01, body, 0, t, bz);
      // glass shelves + contents
      const sh = M.glass('#dff0f4', 0.4);
      for (const y of [0.25, 0.48]) k.box(w - 2 * t, 0.006, bd - 0.02, sh, 0, y, bz);
      const r = [
        [-0.3, 0.02, 0.12, '#f1ece2'],
        [-0.22, 0.02, 0.15, '#2f6fb5'],
        [-0.12, 0.02, 0.1, '#c7a27a'],
        [0.12, 0.256, 0.13, '#e06a7c'],
        [0.22, 0.256, 0.09, '#f6f6f2'],
        [-0.28, 0.256, 0.14, '#3b3f45'],
        [0.28, 0.486, 0.12, '#9bae8a'],
        [-0.18, 0.486, 0.1, '#f1ece2'],
      ] as Array<[number, number, number, string]>;
      for (const [x, y, hh, col] of r) smallBottle(k, x, y, bz - 0.01, hh, 0.022, M.plastic(col), M.chrome(), 8);
      tumbler(k, 0.25, t, bz, 0.09, 0.03, null);
      // LED strip under the cabinet
      k.box(w - 0.06, 0.004, 0.02, M.glow('#fff6e8', 1.5), 0, -0.0, bz + 0.03).castShadow = false;
      // two mirror doors (hinged at the outer sides)
      const dw = w / 2 - 0.002;
      for (const s of [-1, 1]) {
        const p = k.part('door', s * (w / 2), 0, d / 2 - 0.02, {
          open: s < 0 ? -1.7 : 1.7,
        });
        const cx = -s * (dw / 2);
        p.box(dw, h, 0.018, body, cx, 0, 0.009);
        p.box(dw - 0.006, h - 0.006, 0.002, M.mirror(), cx, 0.003, 0.0185);
        p.box(dw - 0.04, h - 0.04, 0.003, M.paint('#e9e7e2', 0.4), cx, 0.02, -0.0015);
      }
      return k.g;
    },
    draw2d: (ctx: Ctx2D, c: C) =>
      sym(ctx, () => {
        ctx.setLineDash([0.04, 0.03]);
        D.rr(ctx, 0, 0, w, d, 0.004, tint(c.body, 0.2) + 'cc', INK_SOFT);
        ctx.setLineDash([]);
        D.line(ctx, -w / 2, d / 2 - 0.01, w / 2, d / 2 - 0.01, '#7fa9c4', 0.02);
        D.line(ctx, 0, -d / 2, 0, d / 2, INK_SOFT, 0.006);
      }),
  };
})();

/* ================================================================== LAUNDRY */

/** 60 cm front-loading machine (washer or dryer) standing at y0. */
function frontLoader(k: Kit, color: string, y0: number, kind: 'washer' | 'dryer', feet: boolean): void {
  const body = M.paint(color, 0.35);
  const w = 0.6;
  const d = 0.6;
  const fz = d / 2 - 0.03;
  k.rbox(w, 0.83, d - 0.03, 0.018, body, 0, y0 + 0.02, -0.015, 2);
  if (feet) for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl(0.022, 0.022, M.rubber(), sx * 0.24, 0, sz * 0.22 - 0.01, 0.022, 10);
  else k.box(w - 0.02, 0.02, d - 0.06, M.matte('#2b2c2e'), 0, y0, -0.02);
  // control strip
  k.rbox(w - 0.03, 0.1, 0.006, 0.003, M.paint('#e4e5e6', 0.3), 0, y0 + 0.725, fz + 0.001, 1);
  knobZ(k, 0.02, y0 + 0.775, fz + 0.004, 0.032, 0.02, M.brushed('#c9ccce'), M.matte('#333'), 22);
  k.box(0.11, 0.04, 0.003, M.screen(), 0.19, y0 + 0.755, fz + 0.004);
  plate(k, 0.05, 0.016, glowDisplay(kind === 'washer' ? '#7fd8ff' : '#ffb347'), 0.19, y0 + 0.783, fz + 0.0055);
  for (let i = 0; i < 3; i++) k.rbox(0.018, 0.01, 0.004, 0.003, M.plastic('#9a9c9e'), 0.155 + i * 0.035, y0 + 0.735, fz + 0.004, 1);
  if (kind === 'washer') {
    // detergent drawer
    const dr = k.part('drawer', 0, 0, 0, { open: 0.16 });
    dr.rbox(0.16, 0.07, 0.008, 0.004, body, -0.2, y0 + 0.74, fz + 0.005, 1);
    dr.box(0.06, 0.008, 0.004, M.matte('#9a9c9e'), -0.2, y0 + 0.78, fz + 0.0095);
    dr.box(0.15, 0.06, 0.16, M.plastic('#eaeae6'), -0.2, y0 + 0.745, fz - 0.08);
  } else {
    k.rbox(0.16, 0.07, 0.008, 0.004, body, -0.2, y0 + 0.74, fz + 0.002, 1);
    k.box(0.06, 0.012, 0.006, M.matte('#555'), -0.2, y0 + 0.765, fz + 0.006);
  }
  // drum opening (visible with the door open)
  const cy = y0 + 0.4;
  circleZ(k, 0.16, M.matte('#30343a'), 0, cy, fz + 0.0006, 28);
  ringZ(k, 0.165, 0.012, M.rubber('#3a3c40'), 0, cy, fz + 0.002, 20);
  // porthole door hinged on its left edge
  const door = k.part('door', -0.2, cy, fz + 0.004, { open: -1.7 });
  const ring = new THREE.TorusGeometry(0.175, 0.03, 8, 24);
  ring.scale(1, 1, 0.55);
  door.geo(ring, kind === 'washer' ? M.chrome() : M.metal('#4a4d52', 0.3, 0.8), 0.2, 0, 0);
  const glassG = new THREE.SphereGeometry(0.155, 20, 5, 0, Math.PI * 2, 0, Math.PI / 2);
  glassG.rotateX(Math.PI / 2);
  glassG.scale(1, 1, 0.14);
  door.geo(glassG, M.screen(kind === 'washer' ? '#1a2026' : '#2b2420'), 0.2, 0, 0);
  door.rbox(0.018, 0.09, 0.018, 0.006, M.chrome(), 0.415, -0.045, 0.008, 1);
}

const dryer: FurnitureDef = {
  id: 'appl-dryer',
  name: 'מייבש כביסה',
  category: 'bathroom',
  group: G_LAUNDRY,
  tags: ['מייבש', 'כביסה', 'מכונה', 'חדר כביסה'],
  size: { w: 0.6, d: 0.6, h: 0.85 },
  colors: [slot('body', 'גוף', '#f2f2f0')],
  actions: [{ kind: 'open' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    frontLoader(k, c.body, 0, 'dryer', true);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 0.6, 0.6, 0.02, tint(c.body, 0.5));
      D.circle(ctx, 0, 0, 0.2, '#ffffff', undefined, LINE_THIN);
      D.line(ctx, -0.14, -0.14, 0.14, 0.14, INK_SOFT, 0.006);
      D.line(ctx, -0.3, 0.25, 0.3, 0.25, INK_SOFT);
    }),
};

const laundryStack: FurnitureDef = {
  id: 'appl-washer-dryer-stack',
  name: 'עמודת כביסה – מכונה ומייבש',
  category: 'bathroom',
  group: G_LAUNDRY,
  tags: ['מכונת כביסה', 'מייבש', 'עמודה', 'חדר כביסה', 'חוסך מקום'],
  size: { w: 0.6, d: 0.62, h: 1.74 },
  colors: [slot('body', 'גוף', '#f2f2f0')],
  actions: [{ kind: 'open' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    frontLoader(k, c.body, 0, 'washer', true);
    // stacking kit with a pull-out shelf
    const y = 0.85;
    k.box(0.6, 0.03, 0.58, M.paint('#dcdcd8', 0.4), 0, y, -0.01);
    k.rbox(0.5, 0.012, 0.03, 0.004, M.plastic('#cfcfca'), 0, y + 0.006, 0.29, 1);
    frontLoader(k, c.body, y + 0.03, 'dryer', false);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, -0.01, 0.6, 0.6, 0.02, tint(c.body, 0.5));
      D.circle(ctx, 0, 0, 0.2, '#ffffff', undefined, LINE_THIN);
      D.line(ctx, -0.3, -0.31, 0.3, 0.29, INK_SOFT);
      D.line(ctx, -0.3, 0.24, 0.3, 0.24, INK_SOFT);
    }),
};

/* ================================================================== CLIMATE */

const wallAC: FurnitureDef = {
  id: 'appl-wall-air-conditioner',
  name: 'מזגן עילי',
  category: 'living',
  group: G_CLIMATE,
  tags: ['מזגן', 'מיזוג', 'קירור', 'חימום', 'עילי'],
  size: { w: 0.9, d: 0.23, h: 0.3 },
  mount: 'wall',
  elevation: 2.15,
  colors: [slot('body', 'גוף', '#f5f5f3')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const body = M.plastic(c.body);
    const w = 0.9;
    // side profile (shape x = -world z): flat back, rounded front, bottom outlet
    const s = new THREE.Shape();
    s.moveTo(0.109, 0.006);
    s.lineTo(0.109, 0.294);
    s.lineTo(-0.02, 0.294);
    s.quadraticCurveTo(-0.106, 0.29, -0.106, 0.2);
    s.lineTo(-0.102, 0.075);
    s.quadraticCurveTo(-0.096, 0.006, -0.04, 0.006);
    s.closePath();
    const g = extrudeZ(s, w, 0.006, 8);
    const m = k.geo(g, body, 0, 0, 0);
    m.rotation.y = Math.PI / 2;
    // front panel seam, display, outlet + louvre
    k.box(w - 0.02, 0.002, 0.004, M.matte('#d9d9d6'), 0, 0.085, 0.108);
    plate(k, 0.06, 0.02, M.glow('#9fe3ff', 1.1, '#e8f6fb'), 0.3, 0.15, 0.111);
    k.sphere(0.003, M.glow('#7ff0a8', 1.5), 0.34, 0.12, 0.111, 1, 1, 0.5, 6);
    k.box(w - 0.08, 0.008, 0.07, M.matte('#2b2c2e'), 0, 0.0, 0.02);
    const louvre = k.box(w - 0.09, 0.004, 0.06, body, 0, 0.0, 0.06);
    louvre.rotation.x = 0.35;
    louvre.position.y = 0.012;
    // top intake grille
    for (let i = 0; i < 14; i++) k.box(w - 0.06, 0.0015, 0.004, M.matte('#b5b6b3'), 0, 0.299, -0.08 + i * 0.012);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      ctx.setLineDash([0.04, 0.03]);
      D.rr(ctx, 0, 0, 0.9, 0.23, 0.04, tint(c.body, 0.2) + 'cc', INK_SOFT);
      ctx.setLineDash([]);
      D.line(ctx, -0.41, 0.06, 0.41, 0.06, INK_SOFT, 0.008);
    }),
};

const columnRadiator: FurnitureDef = {
  id: 'appl-column-radiator',
  name: 'רדיאטור עמודים',
  category: 'living',
  group: G_CLIMATE,
  tags: ['רדיאטור', 'חימום', 'עמודים', 'קלאסי', 'מים חמים'],
  size: { w: 0.86, d: 0.13, h: 0.61 },
  colors: [slot('paint', 'צבע', '#3b3f45')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const p = M.paint(c.paint, 0.35);
    const n = 15;
    const pitch = 0.05;
    const x0 = -((n - 1) * pitch) / 2 - 0.02;
    const zs = [-0.035, 0, 0.035];
    for (let i = 0; i < n; i++) {
      const x = x0 + i * pitch;
      for (const z of zs) k.cyl(0.0115, 0.46, p, x, 0.1, z, 0.0115, 8);
      for (const y of [0.09, 0.57]) k.rod([x, y, -0.048], [x, y, 0.048], 0.021, p, 0.021, 8);
    }
    // feet
    for (const s of [-1, 1]) {
      k.rbox(0.035, 0.07, 0.12, 0.01, p, x0 + (s < 0 ? 1 : n - 2) * pitch, 0, 0, 1);
    }
    // valves: thermostatic head on the right, lockshield + bleed on the left
    const chrome = M.chrome();
    const xr = x0 + (n - 1) * pitch + 0.03;
    k.rod([xr - 0.01, 0.09, 0], [xr + 0.03, 0.09, 0], 0.01, chrome, 0.01, 10);
    k.rod([xr + 0.03, 0.09, 0], [xr + 0.03, 0.0, 0], 0.009, chrome, 0.009, 10);
    k.cyl(0.024, 0.07, M.plastic('#f2f2f0'), xr + 0.03, 0.1, 0, 0.022, 16);
    k.cyl(0.02, 0.004, M.matte('#c0392b'), xr + 0.03, 0.17, 0, 0.02, 14);
    const xl = x0 - 0.03;
    k.rod([xl + 0.01, 0.09, 0], [xl - 0.015, 0.09, 0], 0.01, chrome, 0.01, 10);
    k.rod([xl - 0.015, 0.09, 0], [xl - 0.015, 0.0, 0], 0.009, chrome, 0.009, 10);
    k.rod([xl + 0.01, 0.59, 0], [xl - 0.005, 0.59, 0], 0.006, chrome, 0.006, 8);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, -0.01, 0, 0.76, 0.1, 0.012, tint(c.paint, 0.55));
      for (let i = 1; i < 15; i++) D.line(ctx, -0.39 + i * 0.05 - 0.025, -0.05, -0.39 + i * 0.05 - 0.025, 0.05, INK_SOFT, 0.004);
      D.circle(ctx, 0.415, 0, 0.024, '#ffffff', undefined, LINE_THIN);
    }),
};

const dehumidifier: FurnitureDef = {
  id: 'appl-dehumidifier',
  name: 'מסיר לחות',
  category: 'living',
  group: G_CLIMATE,
  tags: ['מסיר לחות', 'לחות', 'ייבוש', 'עובש', 'נייד'],
  size: { w: 0.34, d: 0.25, h: 0.58 },
  colors: [slot('body', 'גוף', '#f4f4f2')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const body = M.plastic(c.body);
    k.rbox(0.34, 0.53, 0.24, 0.04, body, 0, 0.04, 0, 3);
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        k.cyl(0.018, 0.015, M.plastic('#2a2b2e'), sx * 0.13, 0.025, sz * 0.08, 0.018, 10);
        k.sphere(0.02, M.rubber(), sx * 0.13, 0.02, sz * 0.08, 1, 1, 0.6, 10);
      }
    // top: louvre outlet + control panel
    for (let i = 0; i < 8; i++) k.box(0.2, 0.004, 0.006, M.matte('#2b2c2e'), -0.03, 0.568, -0.08 + i * 0.012);
    const panel = k.rbox(0.1, 0.006, 0.09, 0.008, M.screen('#141518'), 0.1, 0.567, 0.04, 1);
    panel.castShadow = false;
    k.box(0.04, 0.0015, 0.018, M.glow('#7fd8ff', 1.3, '#0a1820'), 0.1, 0.573, 0.025);
    for (let i = 0; i < 3; i++) k.sphere(0.005, M.plastic('#c9ccce'), 0.075 + i * 0.025, 0.573, 0.06, 1, 0.5, 1, 8);
    // front water tank with level window
    const fz = 0.12;
    k.rbox(0.3, 0.2, 0.008, 0.02, M.plastic(darken(c.body, 0.06)), 0, 0.06, fz, 1);
    k.rbox(0.03, 0.12, 0.004, 0.01, M.glass('#86c3e6', 0.6), 0.11, 0.09, fz + 0.004, 1);
    k.rbox(0.1, 0.014, 0.01, 0.006, M.plastic('#c9ccce'), 0, 0.235, fz + 0.002, 1);
    // side handle recesses + rear intake
    for (const s of [-1, 1]) k.rbox(0.004, 0.025, 0.11, 0.01, M.matte('#2b2c2e'), s * 0.17, 0.47, 0, 1);
    for (let i = 0; i < 10; i++) k.box(0.24, 0.006, 0.004, M.matte('#2b2c2e'), 0, 0.25 + i * 0.02, -0.12);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 0.34, 0.24, 0.04, tint(c.body, 0.2));
      D.rr(ctx, -0.03, -0.04, 0.2, 0.1, 0.006, null, INK_SOFT, 0.006);
      D.rr(ctx, 0.1, 0.04, 0.1, 0.09, 0.008, '#55575c');
    }),
};

export const APPLIANCES: FurnitureDef[] = [
  espresso,
  kettle,
  toaster,
  microwave,
  standMixer,
  blender,
  airFryer,
  frenchFridge,
  wineFridge,
  retroFridge,
  waterDispenser,
  rangeCooker,
  wallOven,
  clawfootTub,
  freestandingTub,
  doubleVanity,
  walkInShower,
  towelWarmer,
  mirrorCabinet,
  dryer,
  laundryStack,
  wallAC,
  columnRadiator,
  dehumidifier,
];
