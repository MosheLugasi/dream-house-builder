/** Café furniture. */
import * as THREE from 'three';
import type { FurnitureDef } from '../types';
import { D, INK_SOFT, Kit, LINE_THIN, M, PAL, darken, sym, tint } from '../kit';
import { slot } from './_parts';
import { type C2D, axisCyl, canvasMat, faceGeo, squiggle } from './_street_shared';

/* ------------------------------------------------------------------ round pedestal table */

const cafeTable: FurnitureDef = {
  id: 'cafe-table',
  name: 'שולחן קפה עגול',
  category: 'public',
  size: { w: 0.7, d: 0.7, h: 0.9 },
  colors: [slot('top', 'משטח', '#ece8e1'), slot('base', 'רגל', '#2b2c2f')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const iron = M.metal(c.base, 0.55, 0.6);
    // cast iron pedestal
    k.lathe(
      [
        [0.22, 0],
        [0.22, 0.012],
        [0.17, 0.03],
        [0.06, 0.055],
        [0.035, 0.1],
        [0.03, 0.2],
        [0.04, 0.24],
        [0.03, 0.28],
        [0.028, 0.66],
        [0.045, 0.7],
        [0.12, 0.715],
        [0.12, 0.722],
      ],
      iron,
      0,
      0,
      0,
      20,
    );
    // marble top with a metal edge band
    k.lathe(
      [
        [0, 0.722],
        [0.335, 0.722],
        [0.348, 0.728],
        [0.35, 0.74],
        [0.345, 0.75],
        [0, 0.75],
      ],
      M.stone(c.top, 0.25),
      0,
      0,
      0,
      36,
    );
    k.cyl(0.351, 0.012, M.brass(), 0, 0.732, 0, 0.351, 36);
    // bud vase with a flower
    k.lathe(
      [
        [0, 0],
        [0.022, 0],
        [0.03, 0.03],
        [0.018, 0.07],
        [0.012, 0.1],
        [0.016, 0.11],
      ],
      M.glass('#cfe6ee', 0.4),
      0.03,
      0.75,
      -0.02,
      10,
    ).castShadow = false;
    k.rod([0.03, 0.76, -0.02], [0.045, 0.875, -0.01], 0.003, M.foliage(PAL.leaf), 0.003, 4);
    k.sphere(0.022, M.matte('#e87aa0'), 0.046, 0.882, -0.01, 1, 0.7, 1, 7);
    k.sphere(0.009, M.matte('#f2c14e'), 0.047, 0.893, -0.009, 1, 0.7, 1, 5);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.circle(ctx, 0, 0, 0.35, tint(c.top, 0.3));
      D.circle(ctx, 0, 0, 0.12, null, INK_SOFT, LINE_THIN);
      D.circle(ctx, 0.03, -0.02, 0.03, '#f4c9d6', undefined, 0.007);
    }),
};

/* ------------------------------------------------------------------ bentwood bistro chair */

const CH_SEAT = 0.46;

const cafeChair: FurnitureDef = {
  id: 'cafe-chair',
  name: 'כיסא ביסטרו',
  category: 'public',
  size: { w: 0.44, d: 0.46, h: 0.88 },
  colors: [slot('frame', 'מסגרת', '#3a2a20'), slot('seat', 'מושב', '#d9bd8f')],
  seats: [{ x: 0, z: 0.02, height: CH_SEAT, facing: 0, kind: 'sit' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const wood = M.wood(c.frame, 0.4);
    const zc = 0.02;
    const R = 0.2;
    // seat: bent ring with a woven cane panel
    k.cyl(R, 0.028, wood, 0, CH_SEAT - 0.03, zc, R, 24);
    k.cyl(R - 0.035, 0.006, M.fabric(c.seat, 26), 0, CH_SEAT - 0.004, zc, R - 0.035, 24);
    // front legs, ring stretcher
    for (const s of [-1, 1]) k.rod([s * 0.17, 0.002, zc + 0.17], [s * 0.13, CH_SEAT - 0.02, zc + 0.12], 0.014, wood, 0.017, 10);
    k.ring(0.145, 0.009, wood, 0, 0.22, zc - 0.005, 24);
    // back legs sweep up into the outer back hoop
    const bz = zc - 0.14;
    k.tube(
      [
        [-0.185, 0.004, bz - 0.085],
        [-0.165, 0.25, bz - 0.03],
        [-0.16, CH_SEAT, bz],
        [-0.17, 0.66, bz - 0.04],
        [-0.13, 0.82, bz - 0.07],
        [0, 0.865, bz - 0.08],
        [0.13, 0.82, bz - 0.07],
        [0.17, 0.66, bz - 0.04],
        [0.16, CH_SEAT, bz],
        [0.165, 0.25, bz - 0.03],
        [0.185, 0.004, bz - 0.085],
      ],
      0.015,
      wood,
      { seg: 44, radial: 8, tension: 0.5 },
    );
    // inner hoop
    k.tube(
      [
        [-0.105, CH_SEAT - 0.005, bz - 0.03],
        [-0.11, 0.62, bz - 0.045],
        [-0.075, 0.74, bz - 0.062],
        [0, 0.775, bz - 0.068],
        [0.075, 0.74, bz - 0.062],
        [0.11, 0.62, bz - 0.045],
        [0.105, CH_SEAT - 0.005, bz - 0.03],
      ],
      0.011,
      wood,
      { seg: 26, radial: 6, tension: 0.5 },
    );
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.circle(ctx, 0, 0.02, 0.2, tint(c.frame, 0.45));
      D.circle(ctx, 0, 0.02, 0.165, tint(c.seat, 0.35), INK_SOFT, LINE_THIN);
      ctx.beginPath();
      ctx.moveTo(-0.17, -0.12);
      ctx.quadraticCurveTo(0, -0.28, 0.17, -0.12);
      ctx.strokeStyle = '#3a3d42';
      ctx.lineWidth = 0.04;
      ctx.stroke();
      ctx.strokeStyle = tint(c.frame, 0.35);
      ctx.lineWidth = 0.024;
      ctx.stroke();
    }),
};

/* ------------------------------------------------------------------ service counter with espresso machine */

const CO = { w: 2.0, d: 0.8, h: 1.56, topY: 1.08, bd: 0.62, bz: -0.06 };

const cafeCounter: FurnitureDef = {
  id: 'cafe-counter',
  name: 'דלפק קפה עם מכונת אספרסו',
  category: 'public',
  size: { w: CO.w, d: CO.d, h: CO.h },
  colors: [slot('front', 'חזית', '#7b5538'), slot('top', 'משטח', '#e8e4dc'), slot('machine', 'מכונת קפה', '#c8372d')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { w, d, topY, bd, bz } = CO;
    const front = M.wood(c.front, 0.6);
    const chrome = M.chrome();
    const steel = M.steel();
    const white = M.ceramic('#f6f4ee');
    // body: plinth, carcass, slatted front, stone top with a customer overhang
    k.box(w - 0.04, 0.1, bd - 0.06, M.matte('#2a2b2d'), 0, 0, bz);
    k.box(w, topY - 0.14, bd, M.wood(darken(c.front, 0.15), 0.65), 0, 0.1, bz);
    const fz = bz + bd / 2;
    const n = 26;
    for (let i = 0; i < n; i++) k.box(w / n - 0.012, topY - 0.19, 0.022, front, -w / 2 + (i + 0.5) * (w / n), 0.12, fz + 0.008);
    k.box(w, 0.05, 0.03, M.metal('#b98d4a', 0.35, 1), 0, 0.1, fz + 0.012);
    k.rbox(w, 0.04, d, 0.01, M.stone(c.top, 0.3), 0, topY - 0.04, 0, 1);
    // staff side: open shelf niche
    k.box(w - 0.1, 0.55, 0.01, M.matte('#3a3531'), 0, 0.3, bz - bd / 2 - 0.004);
    k.box(w - 0.1, 0.02, 0.03, M.wood(PAL.oakLight), 0, 0.57, bz - bd / 2 - 0.012);
    // espresso machine (operated from the -Z side)
    const mx = -0.42;
    const mz = -0.08;
    const mw = 0.72;
    const y = topY;
    const body = M.paint(c.machine, 0.25);
    for (const s of [-1, 1]) k.cyl(0.02, 0.03, M.rubber(), mx + s * (mw / 2 - 0.06), y, mz - 0.14, 0.02, 8);
    for (const s of [-1, 1]) k.cyl(0.02, 0.03, M.rubber(), mx + s * (mw / 2 - 0.06), y, mz + 0.14, 0.02, 8);
    k.rbox(mw, 0.1, 0.44, 0.02, chrome, mx, y + 0.03, mz, 1);
    k.rbox(mw, 0.26, 0.26, 0.025, body, mx, y + 0.13, mz + 0.09, 2);
    k.rbox(mw + 0.02, 0.035, 0.46, 0.015, chrome, mx, y + 0.39, mz, 1);
    for (const s of [-1, 1]) k.rbox(0.03, 0.26, 0.2, 0.01, chrome, mx + s * (mw / 2 - 0.015), y + 0.13, mz - 0.12, 1);
    // cup rail + cups warming on top
    for (const s of [-1, 1]) k.rod([mx - mw / 2 + 0.02, y + 0.455, mz + s * 0.2], [mx + mw / 2 - 0.02, y + 0.455, mz + s * 0.2], 0.006, chrome, 0.006, 6);
    for (let i = 0; i < 8; i++) {
      const cx = mx - 0.25 + (i % 4) * 0.165;
      const cz = mz - 0.08 + Math.floor(i / 4) * 0.15;
      k.cyl(0.03, 0.05, white, cx, y + 0.425, cz, 0.04, 10);
    }
    // group heads with portafilters, steam wands, drip tray
    for (const gx of [-0.17, 0.17]) {
      k.cyl(0.04, 0.05, chrome, mx + gx, y + 0.3, mz - 0.1, 0.045, 12);
      k.cyl(0.036, 0.03, steel, mx + gx, y + 0.27, mz - 0.1, 0.036, 12);
      k.rod([mx + gx, y + 0.285, mz - 0.13], [mx + gx + 0.02, y + 0.265, mz - 0.27], 0.011, M.plastic('#1c1d20'), 0.014, 8);
    }
    for (const s of [-1, 1]) {
      k.tube(
        [
          [mx + s * 0.31, y + 0.36, mz - 0.06],
          [mx + s * 0.32, y + 0.33, mz - 0.14],
          [mx + s * 0.325, y + 0.2, mz - 0.17],
        ],
        0.006,
        chrome,
        { seg: 8, radial: 5 },
      );
      axisCyl(k, 0.018, 0.03, M.plastic('#1c1d20'), mx + s * 0.3, y + 0.37, mz - 0.07, 'z', 0.018, 8);
    }
    k.box(mw - 0.1, 0.006, 0.16, M.metal('#8d9093', 0.5, 0.8), mx, y + 0.13, mz - 0.12);
    axisCyl(k, 0.03, 0.01, white, mx, y + 0.33, mz - 0.042, 'z', 0.03, 12);
    // customer side: plain shiny back with a colour stripe
    k.box(mw - 0.08, 0.05, 0.004, chrome, mx, y + 0.24, mz + 0.222);
    // grinder
    const gx = -0.9;
    k.rbox(0.15, 0.26, 0.2, 0.02, M.plastic('#26282c'), gx, y, mz, 1);
    k.cyl(0.05, 0.14, M.glass('#d9c7a8', 0.45), gx, y + 0.26, mz + 0.02, 0.075, 12).castShadow = false;
    k.cyl(0.05, 0.07, M.matte('#4a2f1e'), gx, y + 0.262, mz + 0.02, 0.06, 10);
    k.cyl(0.078, 0.012, M.plastic('#26282c'), gx, y + 0.4, mz + 0.02, 0.078, 12);
    // cake under a glass dome
    const dx = 0.36;
    k.cyl(0.05, 0.05, white, dx, y, 0.05, 0.08, 12);
    k.cyl(0.16, 0.012, white, dx, y + 0.05, 0.05, 0.16, 20);
    k.cyl(0.115, 0.08, M.matte('#8a5a3a'), dx, y + 0.062, 0.05, 0.115, 16);
    k.cyl(0.118, 0.012, M.matte('#f3e3d0'), dx, y + 0.142, 0.05, 0.118, 16);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      k.sphere(0.014, M.paint('#c8372d', 0.3), dx + Math.cos(a) * 0.08, y + 0.162, 0.05 + Math.sin(a) * 0.08, 1, 1, 1, 6);
    }
    const dome = new THREE.SphereGeometry(0.15, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const dm = k.geo(dome, M.glass('#e6f4f6', 0.22), dx, y + 0.062, 0.05);
    dm.scale.y = 1.15;
    dm.castShadow = false;
    k.sphere(0.016, M.glass('#e6f4f6', 0.5), dx, y + 0.245, 0.05, 1, 1, 1, 8).castShadow = false;
    // paper cups, till tablet, tip jar
    for (let i = 0; i < 2; i++) {
      const px = 0.66 + i * 0.1;
      for (let j = 0; j < 3 - i; j++) k.cyl(0.028, 0.09, M.paint('#f6f4ee', 0.6), px, y + j * 0.022, 0.2, 0.038, 10);
      k.cyl(0.031, 0.04, M.matte('#b98d5a'), px, y + 0.03 + (2 - i) * 0.022, 0.2, 0.036, 10);
    }
    const tab = new Kit();
    tab.rbox(0.26, 0.18, 0.012, 0.008, M.plastic('#26282c'), 0, 0, 0, 1);
    tab.box(0.235, 0.155, 0.002, M.glow('#bfe3ff', 0.5, '#d9eefc'), 0, 0.0125, -0.007);
    const tg = k.sub(tab, 0.74, y + 0.1, -0.13);
    tg.rotation.x = 0.35;
    k.box(0.05, 0.11, 0.05, steel, 0.74, y, -0.1);
    k.cyl(0.045, 0.1, M.glass('#e6f4f6', 0.3), 0.08, y, 0.22, 0.045, 12).castShadow = false;
    for (let i = 0; i < 4; i++) k.cyl(0.014, 0.003, M.brass(), 0.08 + (i - 1.5) * 0.012, y + 0.004 + i * 0.004, 0.22 + (i % 2) * 0.012, 0.014, 8);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { w, d } = CO;
      D.rr(ctx, 0, 0, w, d, 0.01, tint(c.top, 0.25));
      D.line(ctx, -w / 2 + 0.01, d / 2 - 0.05, w / 2 - 0.01, d / 2 - 0.05, tint(c.front, 0.2), 0.02);
      D.rr(ctx, -0.42, -0.08, 0.74, 0.46, 0.02, tint(c.machine, 0.4));
      for (let i = 0; i < 8; i++) D.circle(ctx, -0.67 + (i % 4) * 0.165, -0.16 + Math.floor(i / 4) * 0.15, 0.04, '#ffffff', INK_SOFT, 0.007);
      D.rr(ctx, -0.9, -0.08, 0.15, 0.2, 0.02, '#6a6d72', undefined, LINE_THIN);
      D.circle(ctx, 0.36, 0.05, 0.16, '#ffffff', undefined, LINE_THIN);
      D.circle(ctx, 0.36, 0.05, 0.115, tint('#8a5a3a', 0.45), INK_SOFT, LINE_THIN);
      D.rr(ctx, 0.74, -0.13, 0.26, 0.06, 0.008, '#4a4d52', undefined, 0.008);
      for (const x of [0.66, 0.76]) D.circle(ctx, x, 0.2, 0.038, '#ffffff', undefined, 0.007);
    }),
};

/* ------------------------------------------------------------------ upholstered booth bench */

const BO = { w: 1.4, d: 0.66, h: 1.1, seat: 0.46 };

const cafeBooth: FurnitureDef = {
  id: 'cafe-booth',
  name: 'ספסל מרופד לקפה',
  category: 'public',
  size: { w: BO.w, d: BO.d, h: BO.h },
  colors: [slot('fabric', 'ריפוד', '#7d3a36'), slot('wood', 'עץ', PAL.walnut)],
  seats: [
    { x: -0.35, z: 0.1, height: BO.seat, facing: 0, kind: 'sit' },
    { x: 0.35, z: 0.1, height: BO.seat, facing: 0, kind: 'sit' },
  ],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { w, d, h, seat } = BO;
    const wood = M.wood(c.wood, 0.5);
    const lea = M.leather(c.fabric);
    // timber shell: plinth, seat box, back panel, cap rail, end cheeks
    k.box(w - 0.04, 0.1, d - 0.12, M.matte('#2a2b2d'), 0, 0, -0.02);
    k.rbox(w, 0.22, d - 0.06, 0.008, wood, 0, 0.1, -0.03, 1);
    k.rbox(w, h - 0.14, 0.05, 0.008, wood, 0, 0.1, -d / 2 + 0.025, 1);
    k.rbox(w, 0.04, 0.11, 0.012, wood, 0, h - 0.04, -d / 2 + 0.055, 1);
    // seat cushions
    for (const s of [-1, 1]) k.cushion(w / 2 - 0.012, seat - 0.3, d - 0.16, lea, s * (w / 4 - 0.001), 0.31, 0.04, 0.04, 0.014);
    // channel-tufted back, leaning
    const n = 5;
    const cw = (w - 0.03) / n;
    for (let i = 0; i < n; i++) {
      const m = k.cushion(cw - 0.004, 0.56, 0.1, lea, -w / 2 + 0.015 + (i + 0.5) * cw, seat + 0.03, -d / 2 + 0.115, 0.045, 0.012);
      m.rotation.x = -0.08;
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { w, d } = BO;
      D.rr(ctx, 0, 0, w, d, 0.01, tint(c.wood, 0.4));
      for (const s of [-1, 1]) D.rr(ctx, s * (w / 4), 0.04, w / 2 - 0.012, d - 0.16, 0.04, tint(c.fabric, 0.5), undefined, LINE_THIN);
      D.rr(ctx, 0, -d / 2 + 0.115, w - 0.03, 0.11, 0.03, tint(c.fabric, 0.3));
      for (let i = 1; i < 5; i++) D.line(ctx, -w / 2 + 0.015 + (i * (w - 0.03)) / 5, -d / 2 + 0.065, -w / 2 + 0.015 + (i * (w - 0.03)) / 5, -d / 2 + 0.165, INK_SOFT, 0.007);
    }),
};

/* ------------------------------------------------------------------ chalk menu board */

const MN = { w: 0.8, h: 1.1, d: 0.04 };

function chalkPen(c: C2D, color: string, lw: number): void {
  c.strokeStyle = color;
  c.fillStyle = color;
  c.lineWidth = lw;
  c.lineCap = 'round';
  c.lineJoin = 'round';
}

const menuMat = (): THREE.Material =>
  canvasMat(
    'menu-board',
    384,
    544,
    (c, w, h) => {
      c.fillStyle = '#26292a';
      c.fillRect(0, 0, w, h);
      for (let i = 0; i < 14; i++) {
        c.strokeStyle = `rgba(255,255,255,${0.012 + (i % 3) * 0.008})`;
        c.lineWidth = 46;
        c.lineCap = 'round';
        c.beginPath();
        c.moveTo((i * 67) % w, (i * 113) % h);
        c.lineTo(((i * 67) % w) + 150, ((i * 113) % h) + 40 - (i % 3) * 40);
        c.stroke();
      }
      c.globalAlpha = 0.9;
      // cup with steam
      chalkPen(c, '#f4f3ea', 5);
      c.beginPath();
      c.moveTo(152, 62);
      c.lineTo(160, 104);
      c.quadraticCurveTo(192, 116, 224, 104);
      c.lineTo(232, 62);
      c.closePath();
      c.stroke();
      c.beginPath();
      c.arc(240, 80, 14, -1.2, 1.4);
      c.stroke();
      c.beginPath();
      c.moveTo(136, 116);
      c.quadraticCurveTo(192, 132, 248, 116);
      c.stroke();
      for (const x of [174, 192, 210]) {
        c.beginPath();
        c.moveTo(x, 50);
        c.bezierCurveTo(x - 9, 38, x + 9, 30, x, 16);
        c.stroke();
      }
      // heading with flourishes
      chalkPen(c, '#f6e58a', 7);
      squiggle(c, 112, 164, 272, 9, 3);
      chalkPen(c, '#f4f3ea', 3);
      c.beginPath();
      c.moveTo(60, 188);
      c.quadraticCurveTo(192, 200, 324, 188);
      c.stroke();
      // items: name ..... price
      const cols = ['#f4f3ea', '#f4a9c0', '#9fd0ee', '#a8e0a0'];
      for (let i = 0; i < 8; i++) {
        const y = 232 + i * 36;
        chalkPen(c, cols[i % 4], 4.5);
        const x1 = 150 + ((i * 37) % 60);
        squiggle(c, 44, y, x1, 5, 50 + i);
        chalkPen(c, '#f4f3ea', 2.5);
        for (let x = x1 + 14; x < 280; x += 11) {
          c.beginPath();
          c.arc(x, y + 4, 1.4, 0, Math.PI * 2);
          c.fill();
        }
        chalkPen(c, '#f6e58a', 4.5);
        squiggle(c, 292, y, 338, 4, 80 + i);
      }
      // little heart at the bottom
      chalkPen(c, '#f4a9c0', 4);
      c.beginPath();
      c.moveTo(192, 528);
      c.bezierCurveTo(160, 506, 176, 486, 192, 502);
      c.bezierCurveTo(208, 486, 224, 506, 192, 528);
      c.stroke();
      c.globalAlpha = 1;
    },
    { fallback: '#26292a', rough: 0.9 },
  );

const menuBoard: FurnitureDef = {
  id: 'menu-board',
  name: 'לוח תפריט',
  category: 'public',
  size: { w: MN.w, d: MN.d, h: MN.h },
  mount: 'wall',
  elevation: 1.1,
  colors: [slot('frame', 'מסגרת', PAL.oak)],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { w, h, d } = MN;
    const frame = M.wood(c.frame);
    const fw = 0.045;
    const zb = -d / 2;
    k.box(w - 0.02, h - 0.02, 0.012, M.matte('#1f2122'), 0, 0.01, zb + 0.006);
    k.geo(faceGeo(w - 2 * fw + 0.01, h - 2 * fw + 0.01), menuMat(), 0, h / 2, zb + 0.0125).castShadow = false;
    k.rbox(w, fw, d, 0.006, frame, 0, 0, 0, 1);
    k.rbox(w, fw, d, 0.006, frame, 0, h - fw, 0, 1);
    for (const s of [-1, 1]) k.rbox(fw, h - 2 * fw, d, 0.006, frame, s * (w / 2 - fw / 2), fw, 0, 1);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, MN.w, MN.d, 0.004, tint(c.frame, 0.2), undefined, 0.008);
      D.line(ctx, -MN.w / 2 + 0.05, 0, MN.w / 2 - 0.05, 0, '#3a3d42', 0.012);
    }),
};

export const PUBLIC_CAFE: FurnitureDef[] = [cafeTable, cafeChair, cafeCounter, cafeBooth, menuBoard];
