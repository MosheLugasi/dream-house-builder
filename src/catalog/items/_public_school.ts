/** School & kindergarten classroom furniture. */
import * as THREE from 'three';
import type { FurnitureDef } from '../types';
import { D, INK_SOFT, Kit, LINE_THIN, M, PAL, darken, rng, roundedRectShape, sym, tint } from '../kit';
import { barHandle, bookRow, bookStack, slot } from './_parts';
import { type C2D, axisCyl, canvasMat, faceGeo, smoothYZ, squiggle, sweepYZ } from './_street_shared';

const TUBE = (): THREE.Material => M.metal('#8f959b', 0.45, 0.8);

/** One-piece moulded chair shell (seat + back) on four splayed steel legs. Faces +Z. */
export function shellChair(k: Kit, x: number, z: number, color: string, seatH: number, w = 0.36, backH = 0.36): void {
  const shell = M.plastic(color);
  const hw = w / 2;
  const prof: Array<[number, number]> = [
    [-hw, 0],
    [-hw + 0.02, -0.016],
    [hw - 0.02, -0.016],
    [hw, 0],
    [hw - 0.03, 0.004],
    [-hw + 0.03, 0.004],
  ];
  const path: Array<[number, number]> = [
    [-0.215, seatH + backH],
    [-0.205, seatH + backH - 0.08],
    [-0.185, seatH + 0.12],
    [-0.165, seatH + 0.03],
    [-0.12, seatH - 0.004],
    [0, seatH - 0.006],
    [0.13, seatH],
    [0.175, seatH - 0.015],
    [0.19, seatH - 0.04],
  ];
  k.geo(sweepYZ(prof, smoothYZ(path, 16)), shell, x, 0, z);
  const leg = TUBE();
  const yT = seatH - 0.02;
  for (const s of [-1, 1]) {
    k.rod([x + s * (hw - 0.01), 0.004, z + 0.17], [x + s * (hw - 0.06), yT, z + 0.11], 0.011, leg, 0.011, 8);
    k.rod([x + s * (hw - 0.01), 0.004, z - 0.2], [x + s * (hw - 0.06), yT, z - 0.11], 0.011, leg, 0.011, 8);
    k.rod([x + s * (hw - 0.06), yT, z + 0.11], [x + s * (hw - 0.06), yT, z - 0.11], 0.011, leg, 0.011, 6);
  }
  k.rod([x - hw + 0.06, yT, z + 0.11], [x + hw - 0.06, yT, z + 0.11], 0.011, leg, 0.011, 6);
}

export function drawShellChair(ctx: CanvasRenderingContext2D, x: number, z: number, color: string, w = 0.36): void {
  D.rr(ctx, x, z - 0.01, w, 0.4, 0.07, tint(color, 0.4));
  D.rr(ctx, x, z - 0.195, w - 0.02, 0.045, 0.02, tint(color, 0.15), undefined, LINE_THIN);
}

/* ------------------------------------------------------------------ pupils' double desk */

const SD = { w: 1.2, d: 1.02, h: 0.78, topY: 0.72, dz: 0.26, cz: -0.285, seat: 0.42 };

const schoolDesk: FurnitureDef = {
  id: 'school-desk',
  name: 'שולחן תלמידים זוגי',
  category: 'public',
  size: { w: SD.w, d: SD.d, h: SD.h },
  colors: [slot('top', 'משטח', PAL.birch), slot('chair', 'כיסאות', '#3f8fd0')],
  seats: [
    { x: -0.3, z: SD.cz + 0.01, height: SD.seat, facing: 0, kind: 'sit' },
    { x: 0.3, z: SD.cz + 0.01, height: SD.seat, facing: 0, kind: 'sit' },
  ],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { w, topY, dz } = SD;
    const steel = TUBE();
    const top = M.wood(c.top, 0.5);
    k.slab(roundedRectShape(w - 0.01, 0.49, 0.03), 0.022, top, 0, topY - 0.022, dz, 0.004);
    // tube frame: two side loops + book shelf + front modesty panel
    for (const s of [-1, 1]) {
      const x = s * (w / 2 - 0.07);
      k.tube(
        [
          [x, 0.012, dz - 0.2],
          [x, topY - 0.1, dz - 0.2],
          [x, topY - 0.035, dz - 0.14],
          [x, topY - 0.035, dz + 0.14],
          [x, topY - 0.1, dz + 0.2],
          [x, 0.012, dz + 0.2],
        ],
        0.014,
        steel,
        { seg: 20, radial: 8, tension: 0.25 },
      );
      k.rod([x, 0.1, dz - 0.2], [x, 0.1, dz + 0.2], 0.011, steel, 0.011, 6);
      for (const sz of [-1, 1]) k.cyl(0.02, 0.012, M.rubber(), x, 0, dz + sz * 0.2, 0.02, 8);
    }
    k.box(w - 0.16, 0.012, 0.3, M.wood(darken(c.top, 0.08), 0.6), 0, topY - 0.17, dz + 0.02);
    k.box(w - 0.14, 0.26, 0.012, M.wood(darken(c.top, 0.08), 0.6), 0, topY - 0.3, dz + 0.2);
    // on the desk: notebooks, pencil, pencil case
    const paper = M.paint('#fbfaf5', 0.7);
    for (const [x, rot, col] of [
      [-0.3, 0.08, '#d8473d'],
      [0.32, -0.1, '#4f9a4a'],
    ] as Array<[number, number, string]>) {
      const nb = new Kit();
      nb.box(0.3, 0.006, 0.21, M.paint(col, 0.6), 0, 0, 0);
      nb.box(0.14, 0.004, 0.2, paper, -0.074, 0.006, 0);
      nb.box(0.14, 0.004, 0.2, paper, 0.074, 0.006, 0);
      const g = k.sub(nb, x, topY, dz - 0.04);
      g.rotation.y = rot;
    }
    k.rod([-0.08, topY + 0.005, dz + 0.02], [-0.03, topY + 0.005, dz - 0.14], 0.004, M.paint('#f2c21b', 0.5), 0.004, 6);
    k.rbox(0.2, 0.035, 0.07, 0.015, M.fabric('#8a5fb0', 12), 0.12, topY, dz + 0.15, 1);
    shellChair(k, -0.3, SD.cz, c.chair, SD.seat);
    shellChair(k, 0.3, SD.cz, c.chair, SD.seat);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { w, dz, cz } = SD;
      drawShellChair(ctx, -0.3, cz, c.chair);
      drawShellChair(ctx, 0.3, cz, c.chair);
      D.rr(ctx, 0, dz, w - 0.01, 0.49, 0.03, tint(c.top, 0.35));
      D.rr(ctx, -0.3, dz - 0.04, 0.3, 0.21, 0.005, '#ffffff', INK_SOFT, LINE_THIN);
      D.rr(ctx, 0.32, dz - 0.04, 0.3, 0.21, 0.005, '#ffffff', INK_SOFT, LINE_THIN);
    }),
};

/* ------------------------------------------------------------------ teacher's desk */

const TD = { w: 1.4, d: 1.3, h: 1.07, topY: 0.75, dz: 0.3, dd: 0.7, cz: -0.4 };

const globeMat = (): THREE.Material =>
  canvasMat(
    'globe',
    256,
    128,
    (c, w, h) => {
      c.fillStyle = '#3f8fd0';
      c.fillRect(0, 0, w, h);
      const r = rng(23);
      c.fillStyle = '#6fae5a';
      for (let i = 0; i < 9; i++) {
        const x = r() * w;
        const y = h * (0.2 + r() * 0.6);
        for (let j = 0; j < 9; j++) {
          c.beginPath();
          c.ellipse(x + (r() - 0.5) * 46, y + (r() - 0.5) * 30, 6 + r() * 14, 5 + r() * 10, r() * 3, 0, Math.PI * 2);
          c.fill();
        }
      }
      c.fillStyle = '#f3f3ee';
      c.fillRect(0, 0, w, 7);
      c.fillRect(0, h - 9, w, 9);
    },
    { fallback: '#3f8fd0', rough: 0.45 },
  );

const teacherDesk: FurnitureDef = {
  id: 'teacher-desk',
  name: 'שולחן מורה',
  category: 'public',
  size: { w: TD.w, d: TD.d, h: TD.h },
  colors: [slot('wood', 'עץ', PAL.oak), slot('seat', 'ריפוד', '#3d5166')],
  seats: [{ x: -0.15, z: TD.cz + 0.01, height: 0.46, facing: 0, kind: 'sit' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { w, topY, dz, dd } = TD;
    const wood = M.wood(c.wood);
    const dark = M.wood(darken(c.wood, 0.12));
    k.slab(roundedRectShape(w - 0.01, dd - 0.01, 0.015), 0.03, wood, 0, topY - 0.03, dz, 0.004);
    // panel legs, modesty panel on the class side, drawer pedestal on the teacher's right
    const z0 = dz - dd / 2;
    const z1 = dz + dd / 2;
    for (const s of [-1, 1]) k.box(0.03, topY - 0.03, dd - 0.1, wood, s * (w / 2 - 0.05), 0, dz);
    k.box(w - 0.13, 0.5, 0.02, wood, 0, topY - 0.53, z1 - 0.1);
    const pw = 0.42;
    const pxc = w / 2 - 0.065 - pw / 2;
    k.box(pw, topY - 0.11, dd - 0.16, dark, pxc, 0.08, dz - 0.02);
    for (let i = 0; i < 3; i++) {
      const fy = 0.09 + i * 0.212;
      k.rbox(pw - 0.008, 0.204, 0.018, 0.004, wood, pxc, fy, z0 + 0.049, 1);
      barHandle(k, [pxc - 0.07, fy + 0.13, z0 + 0.02], [pxc + 0.07, fy + 0.13, z0 + 0.02], z0 + 0.04, M.steel(), 0.005);
    }
    // globe, books, apple, pen pot
    const y = topY;
    k.cyl(0.07, 0.015, M.wood(PAL.walnut), -0.5, y, dz + 0.12, 0.075, 16);
    k.cyl(0.012, 0.06, M.brass(), -0.5, y + 0.015, dz + 0.12, 0.012, 8);
    const globe = k.sphere(0.115, globeMat(), -0.5, y + 0.185, dz + 0.12, 1, 1, 1, 20);
    globe.rotation.z = 0.4;
    const arc = new THREE.TorusGeometry(0.125, 0.006, 5, 14, Math.PI);
    arc.rotateZ(-Math.PI / 2 + 0.4);
    k.geo(arc, M.brass(), -0.5, y + 0.185, dz + 0.12);
    const top = bookStack(k, 0.42, y, dz + 0.14, 3, 4);
    k.sphere(0.036, M.paint('#d8362c', 0.25), 0.42, top + 0.033, dz + 0.14, 1, 0.92, 1, 12);
    k.rod([0.42, top + 0.06, dz + 0.14], [0.428, top + 0.085, dz + 0.14], 0.003, M.matte('#5a3d24'), 0.003, 4);
    k.cyl(0.035, 0.09, M.ceramic('#f3f1ec'), 0.1, y, dz + 0.2, 0.04, 14);
    ['#d6a544', '#d8473d', '#3f8fd0'].forEach((col, i) => {
      k.rod([0.1 + (i - 1) * 0.012, y + 0.02, dz + 0.2], [0.1 + (i - 1) * 0.03, y + 0.16, dz + 0.2 + (i - 1) * 0.02], 0.004, M.matte(col), 0.004, 5);
    });
    // open register book
    for (const s of [-1, 1]) k.box(0.15, 0.008, 0.21, M.paint('#fbfaf5', 0.7), -0.12 + s * 0.076, y, dz - 0.12);
    // upholstered chair
    const cx = -0.15;
    const cz = TD.cz;
    const fab = M.fabric(c.seat);
    k.cushion(0.44, 0.06, 0.42, fab, cx, 0.4, cz + 0.02, 0.03, 0.012);
    k.rbox(0.42, 0.025, 0.4, 0.008, dark, cx, 0.378, cz + 0.02, 1);
    const back = k.cushion(0.42, 0.3, 0.05, fab, cx, 0.55, cz - 0.2, 0.025, 0.0);
    back.rotation.x = -0.12;
    for (const s of [-1, 1]) {
      k.rod([cx + s * 0.2, 0.002, cz + 0.2], [cx + s * 0.185, 0.385, cz + 0.18], 0.013, dark, 0.017, 10);
      k.rod([cx + s * 0.2, 0.002, cz - 0.215], [cx + s * 0.185, 0.4, cz - 0.17], 0.013, dark, 0.017, 10);
      k.rod([cx + s * 0.185, 0.4, cz - 0.17], [cx + s * 0.185, 0.86, cz - 0.225], 0.017, dark, 0.013, 10);
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { w, dz, dd, cz } = TD;
      D.rr(ctx, -0.15, cz + 0.02, 0.44, 0.42, 0.05, tint(c.seat, 0.45));
      D.rr(ctx, -0.15, cz - 0.2, 0.42, 0.05, 0.02, tint(c.seat, 0.25), undefined, LINE_THIN);
      D.rr(ctx, 0, dz, w - 0.01, dd - 0.01, 0.015, tint(c.wood, 0.35));
      D.circle(ctx, -0.5, dz + 0.12, 0.115, tint('#3f8fd0', 0.4), undefined, LINE_THIN);
      D.rr(ctx, 0.42, dz + 0.14, 0.24, 0.17, 0.005, tint(PAL.terracotta, 0.4), INK_SOFT, LINE_THIN);
      D.rr(ctx, -0.12, dz - 0.12, 0.3, 0.21, 0.005, '#ffffff', INK_SOFT, LINE_THIN);
      D.circle(ctx, 0.1, dz + 0.2, 0.04, '#ffffff', undefined, LINE_THIN);
    }),
};

/* ------------------------------------------------------------------ blackboard */

const BLK = { w: 2.4, h: 1.26, d: 0.09 };

function chalk(c: C2D, color: string, lw: number): void {
  c.strokeStyle = color;
  c.fillStyle = color;
  c.lineWidth = lw;
  c.lineCap = 'round';
  c.lineJoin = 'round';
}

const boardMat = (color: string): THREE.Material =>
  canvasMat(
    `blackboard|${color}`,
    1024,
    512,
    (c, w, h) => {
      c.fillStyle = color;
      c.fillRect(0, 0, w, h);
      // wiped chalk haze
      const r = rng(6);
      for (let i = 0; i < 26; i++) {
        c.strokeStyle = `rgba(255,255,255,${0.012 + r() * 0.02})`;
        c.lineWidth = 30 + r() * 50;
        c.lineCap = 'round';
        c.beginPath();
        const x = r() * w;
        const y = r() * h;
        c.moveTo(x, y);
        c.quadraticCurveTo(x + 80 + r() * 100, y + (r() - 0.5) * 120, x + 200 + r() * 160, y + (r() - 0.5) * 60);
        c.stroke();
      }
      c.globalAlpha = 0.82;
      const white = '#f4f3ea';
      // sum
      chalk(c, white, 7);
      c.font = '86px "Comic Sans MS", "Segoe Print", "Bradley Hand", cursive, sans-serif';
      c.textBaseline = 'middle';
      c.textAlign = 'left';
      c.fillText('2 + 3 = 5', 70, 130);
      c.beginPath();
      c.moveTo(66, 190);
      c.quadraticCurveTo(230, 204, 420, 186);
      c.stroke();
      // Hebrew letters
      chalk(c, '#f6e58a', 7);
      c.font = 'bold 120px Arial, "Noto Sans Hebrew", sans-serif';
      c.textAlign = 'right';
      c.fillText('א ב ג', w - 70, 140);
      // sun
      chalk(c, '#f6e58a', 6);
      c.beginPath();
      c.arc(560, 110, 34, 0, Math.PI * 2);
      c.stroke();
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        c.beginPath();
        c.moveTo(560 + Math.cos(a) * 46, 110 + Math.sin(a) * 46);
        c.lineTo(560 + Math.cos(a) * 64, 110 + Math.sin(a) * 64);
        c.stroke();
      }
      // house with a tree
      chalk(c, white, 6);
      c.strokeRect(120, 330, 150, 110);
      c.beginPath();
      c.moveTo(104, 334);
      c.lineTo(195, 262);
      c.lineTo(286, 334);
      c.stroke();
      c.strokeRect(178, 378, 36, 62);
      c.strokeRect(138, 350, 28, 28);
      chalk(c, '#a8e0a0', 6);
      c.beginPath();
      c.moveTo(352, 440);
      c.lineTo(352, 372);
      c.stroke();
      c.beginPath();
      c.arc(352, 340, 36, 0, Math.PI * 2);
      c.stroke();
      // flower + heart + written lines
      chalk(c, '#f4a9c0', 6);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        c.beginPath();
        c.arc(470 + Math.cos(a) * 17, 388 + Math.sin(a) * 17, 11, 0, Math.PI * 2);
        c.stroke();
      }
      c.beginPath();
      c.moveTo(470, 408);
      c.lineTo(470, 444);
      c.stroke();
      chalk(c, white, 5);
      for (let i = 0; i < 4; i++) squiggle(c, 600, 300 + i * 44, 940 - (i % 2) * 90, 7, 30 + i);
      chalk(c, '#9fd0ee', 6);
      c.beginPath();
      c.moveTo(860, 228);
      c.bezierCurveTo(820, 190, 880, 170, 880, 205);
      c.bezierCurveTo(880, 170, 940, 190, 900, 228);
      c.lineTo(880, 250);
      c.closePath();
      c.stroke();
      c.globalAlpha = 1;
    },
    { fallback: color, rough: 0.9 },
  );

const blackboard: FurnitureDef = {
  id: 'blackboard',
  name: 'לוח כיתה',
  category: 'public',
  size: { w: BLK.w, d: BLK.d, h: BLK.h },
  mount: 'wall',
  elevation: 0.9,
  colors: [slot('board', 'לוח', '#2f5d4a'), slot('frame', 'מסגרת', PAL.oakLight)],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { w, h, d } = BLK;
    const frame = M.wood(c.frame);
    const zb = -d / 2;
    const by = 0.03;
    const bh = h - by;
    const fw = 0.04;
    k.box(w - 0.02, bh - 0.02, 0.016, M.matte(darken(c.board, 0.2)), 0, by + 0.01, zb + 0.008);
    k.geo(faceGeo(w - 2 * fw + 0.01, bh - 2 * fw + 0.01), boardMat(c.board), 0, by + bh / 2, zb + 0.0165).castShadow = false;
    k.rbox(w, fw, 0.03, 0.004, frame, 0, by, zb + 0.015, 1);
    k.rbox(w, fw, 0.03, 0.004, frame, 0, h - fw, zb + 0.015, 1);
    for (const s of [-1, 1]) k.rbox(fw, bh - 2 * fw, 0.03, 0.004, frame, s * (w / 2 - fw / 2), by + fw, zb + 0.015, 1);
    // chalk tray with chalks and an eraser
    k.rbox(w - 0.3, 0.02, d - 0.01, 0.004, frame, 0, 0, zb + (d - 0.01) / 2, 1);
    k.box(w - 0.3, 0.014, 0.008, frame, 0, 0.02, d / 2 - 0.006);
    ['#f6f4ec', '#f6e58a', '#f4a9c0', '#f6f4ec', '#9fd0ee'].forEach((col, i) => {
      const m = axisCyl(k, 0.006, 0.06 + (i % 2) * 0.02, M.matte(col), -0.7 + i * 0.11, 0.026, 0.01 + (i % 3) * 0.006, 'x', 0.006, 6);
      m.rotation.y = (i - 2) * 0.12;
    });
    k.rbox(0.13, 0.022, 0.05, 0.006, M.wood(PAL.walnut), 0.55, 0.02, 0.012, 1);
    k.box(0.13, 0.014, 0.05, M.fabric('#3a3d42', 20), 0.55, 0.042, 0.012);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { w, d } = BLK;
      D.rr(ctx, 0, 0.004, w - 0.3, d - 0.01, 0.004, tint(c.frame, 0.3), undefined, 0.008);
      D.rr(ctx, 0, -d / 2 + 0.015, w, 0.03, 0.004, tint(c.board, 0.3), undefined, 0.008);
    }),
};

/* ------------------------------------------------------------------ cubby cabinet */

const CC = { w: 1.2, d: 0.4, h: 0.98, bodyH: 0.84, cols: 4, rows: 2 };
const BIN_COLORS = ['#e0483e', '#f2b824', '#3f8fd0', '#4f9a4a', '#e8822a', '#8a5fb0'];

const classroomCabinet: FurnitureDef = {
  id: 'classroom-cabinet',
  name: 'ארונית תאים לכיתה',
  category: 'public',
  size: { w: CC.w, d: CC.d, h: CC.h },
  colors: [slot('body', 'גוף', PAL.birch)],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { w, d, bodyH, cols, rows } = CC;
    const m = M.wood(c.body, 0.55);
    const t = 0.022;
    const base = 0.06;
    k.box(w - 0.04, base, d - 0.05, M.matte('#3a3531'), 0, 0, -0.01);
    for (const s of [-1, 1]) k.box(t, bodyH - base, d, m, s * (w / 2 - t / 2), base, 0);
    k.box(w - 2 * t, t, d - 0.002, m, 0, base, 0);
    k.rbox(w, t, d, 0.004, m, 0, bodyH - t, 0, 1);
    k.box(w - 2 * t, bodyH - base - 2 * t, 0.008, M.wood(darken(c.body, 0.1), 0.6), 0, base + t, -d / 2 + 0.006);
    const cw = (w - 2 * t - (cols - 1) * t) / cols;
    const ch = (bodyH - base - 2 * t - (rows - 1) * t) / rows;
    for (let i = 1; i < cols; i++) k.box(t, bodyH - base - 2 * t, d - 0.004, m, -w / 2 + t + i * (cw + t) - t / 2, base + t, 0);
    for (let j = 1; j < rows; j++) k.box(w - 2 * t, t, d - 0.004, m, 0, base + t + j * (ch + t) - t, 0);
    const cell = (i: number, j: number): [number, number] => [-w / 2 + t + cw / 2 + i * (cw + t), base + t + j * (ch + t)];
    // coloured tubs with a grip slot; two open cells with books and toys
    let n = 0;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const [x, y] = cell(i, j);
        if (j === 1 && i === 1) {
          bookRow(k, x - cw / 2 + 0.005, x + cw / 2 - 0.005, y, d / 2 - 0.02, d - 0.08, ch, 12, 0.92);
          continue;
        }
        if (j === 1 && i === 3) {
          k.sphere(0.085, M.plastic('#e0483e'), x - 0.03, y + 0.085, 0.04, 1, 1, 1, 14);
          k.rbox(0.07, 0.07, 0.07, 0.008, M.paint('#f2b824', 0.5), x + 0.08, y, 0.1, 1);
          k.rbox(0.07, 0.07, 0.07, 0.008, M.paint('#3f8fd0', 0.5), x + 0.075, y + 0.07, 0.09, 1);
          continue;
        }
        const col = BIN_COLORS[n++ % BIN_COLORS.length];
        const bm = M.plastic(col);
        k.rbox(cw - 0.024, ch - 0.07, d - 0.05, 0.02, bm, x, y + 0.002, 0.012, 1);
        k.rbox(cw - 0.012, 0.022, d - 0.04, 0.008, bm, x, y + ch - 0.075, 0.012, 1);
        k.rbox(0.11, 0.028, 0.006, 0.012, M.matte(darken(col, 0.55)), x, y + ch - 0.14, d / 2 - 0.015, 1);
      }
    }
    // on top: plant + box of crayons
    k.cyl(0.055, 0.09, M.ceramic('#f3f1ec'), -0.4, bodyH, 0, 0.065, 14);
    k.sphere(0.09, M.foliage(PAL.leaf), -0.4, bodyH + 0.14, 0, 1, 0.75, 1, 10);
    k.rbox(0.2, 0.05, 0.13, 0.006, M.paint('#f2b824', 0.5), 0.3, bodyH, 0.02, 1);
    ['#e0483e', '#3f8fd0', '#4f9a4a', '#8a5fb0', '#e8822a'].forEach((col, i) => {
      k.cyl(0.008, 0.03, M.matte(col), 0.23 + i * 0.035, bodyH + 0.05, 0.02, 0.003, 6);
    });
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { w, d, cols } = CC;
      D.rr(ctx, 0, 0, w, d, 0.004, tint(c.body, 0.4));
      const cw = (w - 0.044) / cols;
      for (let i = 0; i < cols; i++) D.rr(ctx, -w / 2 + 0.022 + cw * (i + 0.5), 0.012, cw - 0.04, d - 0.06, 0.015, tint(BIN_COLORS[i], 0.45), INK_SOFT, LINE_THIN);
    }),
};

/* ------------------------------------------------------------------ lockers */

const LK = { n: 4, w: 1.2, d: 0.46, h: 1.82 };

const schoolLockers: FurnitureDef = {
  id: 'school-lockers',
  name: 'לוקרים',
  category: 'public',
  size: { w: LK.w, d: LK.d, h: LK.h },
  colors: [slot('doors', 'דלתות', '#3f7fb5'), slot('body', 'גוף', '#6a7279')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { n, w, d, h } = LK;
    const body = M.paint(c.body, 0.45);
    const door = M.paint(c.doors, 0.4);
    const dark = M.matte(darken(c.doors, 0.6));
    const steel = M.steel();
    const legH = 0.1;
    // carcass on short legs
    k.box(w, h - legH, d - 0.02, body, 0, legH, -0.01);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.04, legH, 0.04, body, sx * (w / 2 - 0.03), 0, sz * (d / 2 - 0.05) - 0.01);
    const dw = w / n;
    const fz = d / 2 - 0.01;
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + dw * (i + 0.5);
      const dh = h - legH - 0.03;
      k.rbox(dw - 0.012, dh, 0.014, 0.004, door, x, legH + 0.015, fz, 1);
      // louvres
      for (const y0 of [legH + 0.12, h - 0.32]) {
        for (let j = 0; j < 5; j++) k.box(dw - 0.1, 0.008, 0.004, dark, x, y0 + j * 0.026, fz + 0.006);
      }
      // recessed handle with a padlock hasp, number plate
      k.rbox(0.045, 0.13, 0.006, 0.01, steel, x + dw / 2 - 0.05, 1.0, fz + 0.007, 1);
      k.rbox(0.022, 0.06, 0.012, 0.005, dark, x + dw / 2 - 0.05, 1.045, fz + 0.011, 1);
      k.rbox(0.07, 0.035, 0.004, 0.004, M.paint('#f3f1ec', 0.5), x, h - 0.14, fz + 0.007, 1);
      k.box(0.03, 0.008, 0.002, dark, x, h - 0.126, fz + 0.01);
      for (const hy of [legH + 0.2, h - 0.25]) k.cyl(0.006, 0.06, steel, x - dw / 2 + 0.01, hy, fz + 0.006, 0.006, 6);
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { n, w, d } = LK;
      D.rr(ctx, 0, -0.01, w, d - 0.02, 0.004, tint(c.body, 0.5));
      D.rr(ctx, 0, d / 2 - 0.012, w, 0.022, 0.002, tint(c.doors, 0.3), undefined, 0.008);
      for (let i = 1; i < n; i++) D.line(ctx, -w / 2 + (w / n) * i, -d / 2, -w / 2 + (w / n) * i, d / 2, INK_SOFT, LINE_THIN);
    }),
};

export const PUBLIC_SCHOOL: FurnitureDef[] = [schoolDesk, teacherDesk, blackboard, classroomCabinet, schoolLockers];
