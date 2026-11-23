/** Indoor toys for the kids' room: a pile of building blocks, a doll's house and a painting easel. */
import * as THREE from 'three';
import type { FurnitureDef } from '../types';
import { D, INK_SOFT, Kit, LINE_THIN, M, PAL, darken, extrudeZ, lighten, sym, tint } from '../kit';
import { slot } from './_parts';
import { axisCyl, canvasMat, extrudeX, faceGeo, polyShape, type C2D } from './_street_shared';

/* ------------------------------------------------------------------ toy blocks */

const BLOCK_COLS = ['#e0483e', '#f2b824', '#2f8fd0', '#4aa85c', '#f08a3c', '#8d6bc4'];

/** loose cubes: [x, z, size, yaw, color index] */
const BLOCK_CUBES: Array<[number, number, number, number, number]> = [
  [-0.19, 0.1, 0.06, 0.5, 2],
  [0.02, 0.02, 0.07, -0.3, 0],
  [0.21, -0.13, 0.05, 0.9, 3],
  [-0.03, -0.15, 0.05, 0.2, 5],
];

const toyBlocks: FurnitureDef = {
  id: 'toy-blocks',
  name: 'קוביות משחק',
  category: 'kids',
  size: { w: 0.5, d: 0.4, h: 0.22 },
  build: () => {
    const k = new Kit();
    const m = BLOCK_COLS.map((c) => M.paint(c, 0.45));
    // a little tower
    const tw: Array<[number, number, number]> = [
      [0.07, 0.1, 1],
      [0.07, -0.25, 2],
      [0.06, 0.4, 0],
    ];
    let y = 0;
    for (const [s, yaw, ci] of tw) {
      k.rbox(s, s, s, 0.006, m[ci], -0.14, y, -0.08, 1).rotation.y = yaw;
      y += s;
    }
    k.rbox(0.05, 0.02, 0.05, 0.004, m[3], -0.14, y, -0.08, 1).rotation.y = 0.2;
    for (const [x, z, s, yaw, ci] of BLOCK_CUBES) k.rbox(s, s, s, 0.006, m[ci], x, 0, z, 1).rotation.y = yaw;
    // arch (bridge) block
    const arch = new THREE.Shape();
    arch.moveTo(-0.075, 0);
    arch.lineTo(-0.04, 0);
    arch.absarc(0, 0, 0.04, Math.PI, 0, true);
    arch.lineTo(0.075, 0);
    arch.lineTo(0.075, 0.07);
    arch.lineTo(-0.075, 0.07);
    arch.closePath();
    const ar = k.geo(extrudeZ(arch, 0.05, 0.003, 12), m[1], 0.1, 0.003, -0.07);
    ar.rotation.y = -0.35;
    // roof (triangle) block lying next to it, cylinder on its side, plank
    const tri = k.geo(
      extrudeZ(
        polyShape([
          [-0.045, 0],
          [0.045, 0],
          [0, 0.06],
        ]),
        0.06,
        0.003,
        2,
      ),
      m[0],
      -0.04,
      0.003,
      0.14,
    );
    tri.rotation.y = 0.6;
    axisCyl(k, 0.03, 0.1, m[4], 0.15, 0.03, 0.1, 'x', 0.03, 16).rotation.y = 0.5;
    k.rbox(0.15, 0.02, 0.045, 0.004, m[5], 0.19, 0, -0.01, 1).rotation.y = 1.1;
    k.cyl(0.025, 0.07, m[3], -0.21, 0, -0.02, 0.025, 14);
    return k.g;
  },
  draw2d: (ctx) =>
    sym(ctx, () => {
      const sq = (x: number, z: number, s: number, yaw: number, col: string): void => {
        ctx.save();
        ctx.translate(x, z);
        ctx.rotate(-yaw);
        D.rr(ctx, 0, 0, s, s, 0.006, tint(col, 0.3), undefined, 0.006);
        ctx.restore();
      };
      sq(-0.14, -0.08, 0.07, 0.1, BLOCK_COLS[1]);
      sq(-0.14, -0.08, 0.05, 0.4, BLOCK_COLS[3]);
      for (const [x, z, s, yaw, ci] of BLOCK_CUBES) sq(x, z, s, yaw, BLOCK_COLS[ci]);
      ctx.save();
      ctx.translate(0.1, -0.07);
      ctx.rotate(0.35);
      D.rr(ctx, 0, 0, 0.15, 0.05, 0.004, tint(BLOCK_COLS[1], 0.3), undefined, 0.006);
      ctx.restore();
      ctx.save();
      ctx.translate(-0.04, 0.14);
      ctx.rotate(-0.6);
      D.rr(ctx, 0, 0, 0.09, 0.06, 0.004, tint(BLOCK_COLS[0], 0.3), undefined, 0.006);
      ctx.restore();
      ctx.save();
      ctx.translate(0.15, 0.1);
      ctx.rotate(-0.5);
      D.rr(ctx, 0, 0, 0.1, 0.06, 0.02, tint(BLOCK_COLS[4], 0.3), undefined, 0.006);
      ctx.restore();
      ctx.save();
      ctx.translate(0.19, -0.01);
      ctx.rotate(-1.1);
      D.rr(ctx, 0, 0, 0.15, 0.045, 0.004, tint(BLOCK_COLS[5], 0.3), undefined, 0.006);
      ctx.restore();
      D.circle(ctx, -0.21, -0.02, 0.025, tint(BLOCK_COLS[3], 0.3), undefined, 0.006);
    }),
};

/* ------------------------------------------------------------------ doll's house */

const DH = { w: 0.86, d: 0.4, h: 1.0, wallH: 0.66, floor2: 0.34, t: 0.016 };

const dollhouse: FurnitureDef = {
  id: 'dollhouse',
  name: 'בית בובות',
  category: 'kids',
  size: { w: DH.w, d: DH.d, h: DH.h },
  colors: [slot('walls', 'קירות', '#f3cfd6'), slot('roof', 'גג', '#d9756a'), slot('trim', 'עץ', PAL.birch)],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { d, wallH, floor2, t } = DH;
    const walls = M.paint(c.walls, 0.55);
    const inner = M.paint(lighten(c.walls, 0.55), 0.6);
    const wood = M.wood(c.trim, 0.6);
    const roof = M.paint(c.roof, 0.5);
    const hw = 0.37; // half width of the body
    const zb = -d / 2;
    const depth = d - 0.02;
    const zc = zb + depth / 2;
    // base board, back wall, two floors
    k.rbox(hw * 2 + 0.04, 0.02, depth + 0.006, 0.004, wood, 0, 0, zc + 0.003, 1);
    k.box(hw * 2, wallH, 0.01, inner, 0, 0.02, zb + 0.005);
    k.box(hw * 2 - t, t, depth - 0.01, wood, 0, floor2, zc + 0.005);
    k.box(hw * 2 + 0.03, t, depth, wood, 0, 0.02 + wallH - t, zc);
    // side walls with a window each
    const side = polyShape([
      [-depth / 2, 0],
      [depth / 2, 0],
      [depth / 2, wallH],
      [-depth / 2, wallH],
    ]);
    for (const wy of [0.11, 0.43]) {
      const win = new THREE.Path();
      win.moveTo(-0.06, wy);
      win.lineTo(-0.06, wy + 0.13);
      win.lineTo(0.06, wy + 0.13);
      win.lineTo(0.06, wy);
      win.closePath();
      side.holes.push(win);
    }
    const sideG = extrudeX(side, t, 0, 2);
    for (const s of [-1, 1]) {
      k.geo(sideG, walls, s * (hw - t / 2), 0.02, zc);
      // window frames + mullions
      for (const wy of [0.11, 0.43]) {
        k.box(0.004, 0.13, 0.008, wood, s * hw, 0.02 + wy, zc);
        k.box(0.004, 0.008, 0.12, wood, s * hw, 0.02 + wy + 0.061, zc);
        k.box(0.02, 0.008, 0.15, wood, s * (hw + 0.004), 0.02 + wy - 0.008, zc);
      }
    }
    // room dividers: one per floor, with a doorway
    for (const [x, y0, h] of [
      [-0.06, 0.02, floor2 - 0.02],
      [0.09, floor2 + t, wallH - floor2 - 2 * t + 0.02],
    ]) {
      k.box(0.012, h, depth * 0.45, inner, x, y0, zb + 0.01 + depth * 0.225);
      k.box(0.012, h - 0.2, depth * 0.3, inner, x, y0 + 0.2, zb + 0.01 + depth * 0.6);
    }
    // gable roof: two panels, triangular back gable, attic floor is the top plate
    const top = 0.02 + wallH;
    const rise = DH.h - top - 0.012;
    const run = hw + 0.045;
    const len = Math.hypot(run, rise);
    const ang = Math.atan2(rise, run);
    for (const s of [-1, 1]) {
      const p = k.box(len + 0.012, 0.014, d, roof, (s * run) / 2, top + rise / 2 - 0.007, 0);
      p.rotation.z = -s * ang;
    }
    k.geo(
      extrudeZ(
        polyShape([
          [-run + 0.03, 0],
          [run - 0.03, 0],
          [0, rise - 0.024],
        ]),
        0.01,
        0,
        2,
      ),
      walls,
      0,
      top,
      zb + 0.006,
    );
    // round attic window in the gable
    const ring = new THREE.TorusGeometry(0.04, 0.006, 6, 20);
    k.geo(ring, wood, 0, top + rise * 0.36, zb + 0.012);
    // tiny furniture: bed, table + stools, sofa, lamp, attic chest
    const bedM = M.paint('#8ec3e6', 0.6);
    k.rbox(0.2, 0.05, 0.11, 0.008, wood, 0.2, floor2 + t, zb + 0.09, 1);
    k.rbox(0.19, 0.025, 0.1, 0.01, bedM, 0.215, floor2 + t + 0.05, zb + 0.09, 1);
    k.rbox(0.05, 0.02, 0.08, 0.008, M.paint('#ffffff', 0.6), 0.13, floor2 + t + 0.055, zb + 0.09, 1);
    k.cyl(0.05, 0.008, wood, -0.2, floor2 + t + 0.07, zb + 0.14, 0.05, 14);
    k.cyl(0.008, 0.07, wood, -0.2, floor2 + t, zb + 0.14, 0.012, 8);
    for (const s of [-1, 1]) k.cyl(0.02, 0.04, M.paint('#f2b824', 0.5), -0.2 + s * 0.085, floor2 + t, zb + 0.15, 0.02, 10);
    const sofa = M.paint('#7fbf8f', 0.6);
    k.rbox(0.2, 0.045, 0.09, 0.012, sofa, -0.22, 0.02, zb + 0.07, 1);
    k.rbox(0.2, 0.1, 0.03, 0.012, sofa, -0.22, 0.02, zb + 0.035, 1);
    k.rbox(0.12, 0.004, 0.16, 0.001, M.paint('#e9a7b6', 0.7), -0.22, 0.02, zb + 0.2, 1);
    k.rbox(0.11, 0.09, 0.08, 0.006, M.paint('#ffffff', 0.4), 0.2, 0.02, zb + 0.06, 1);
    k.box(0.09, 0.03, 0.004, M.paint('#55606a', 0.3), 0.2, 0.065, zb + 0.101);
    k.cyl(0.012, 0.09, wood, 0.05, 0.02, zb + 0.06, 0.012, 8);
    k.cyl(0.03, 0.04, M.paint('#fff1c9', 0.6), 0.05, 0.11, zb + 0.06, 0.02, 12);
    // chimney
    k.box(0.06, 0.13, 0.06, M.paint(darken(c.roof, 0.25), 0.6), 0.2, top + rise * 0.42, -0.02);
    k.box(0.074, 0.014, 0.074, wood, 0.2, top + rise * 0.42 + 0.13, -0.02);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { w, d } = DH;
      D.rr(ctx, 0, 0, w, d, 0.008, tint(c.roof, 0.4));
      D.line(ctx, 0, -d / 2, 0, d / 2, INK_SOFT, 0.012);
      for (const s of [-1, 1]) D.line(ctx, s * 0.37, -d / 2 + 0.01, s * 0.37, d / 2 - 0.01, INK_SOFT, 0.006);
      D.rr(ctx, 0.2, -0.02, 0.07, 0.07, 0.004, tint(darken(c.roof, 0.25), 0.3), undefined, 0.008);
      // open front
      ctx.setLineDash([0.03, 0.02]);
      D.line(ctx, -0.37, d / 2 - 0.012, 0.37, d / 2 - 0.012, tint(c.walls, 0.0), 0.012);
    }),
};

/* ------------------------------------------------------------------ painting easel */

const EZ = { w: 0.62, d: 0.62, h: 1.14, top: 1.12, foot: 0.285, head: 0.028, lx: 0.275 };
const EZ_TILT = Math.atan2(EZ.foot - EZ.head, EZ.top);
/** z of the leg center line at height y (front side) */
const ezZ = (y: number): number => EZ.foot - (EZ.foot - EZ.head) * (y / EZ.top);

const painting = (): THREE.Material =>
  canvasMat(
    'easel-painting',
    256,
    288,
    (g: C2D, w, h) => {
      g.fillStyle = '#fbfaf4';
      g.fillRect(0, 0, w, h);
      // sky, sun, hill, house, flower: a child's painting
      g.fillStyle = '#bfe2f5';
      g.fillRect(8, 8, w - 16, h * 0.55);
      g.fillStyle = '#f7c62a';
      g.beginPath();
      g.arc(w * 0.78, h * 0.2, 26, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#f7c62a';
      g.lineWidth = 5;
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        g.beginPath();
        g.moveTo(w * 0.78 + Math.cos(a) * 34, h * 0.2 + Math.sin(a) * 34);
        g.lineTo(w * 0.78 + Math.cos(a) * 46, h * 0.2 + Math.sin(a) * 46);
        g.stroke();
      }
      g.fillStyle = '#6fbf5e';
      g.beginPath();
      g.moveTo(8, h * 0.62);
      g.quadraticCurveTo(w * 0.5, h * 0.42, w - 8, h * 0.6);
      g.lineTo(w - 8, h - 8);
      g.lineTo(8, h - 8);
      g.closePath();
      g.fill();
      g.fillStyle = '#e8574c';
      g.fillRect(w * 0.2, h * 0.5, 70, 60);
      g.fillStyle = '#7a4b33';
      g.beginPath();
      g.moveTo(w * 0.2 - 12, h * 0.5);
      g.lineTo(w * 0.2 + 35, h * 0.36);
      g.lineTo(w * 0.2 + 82, h * 0.5);
      g.closePath();
      g.fill();
      g.fillStyle = '#fbe9a8';
      g.fillRect(w * 0.2 + 12, h * 0.5 + 14, 20, 20);
      g.fillStyle = '#5a4132';
      g.fillRect(w * 0.2 + 42, h * 0.5 + 24, 16, 36);
      g.strokeStyle = '#3f8f3a';
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(w * 0.72, h * 0.86);
      g.lineTo(w * 0.72, h * 0.68);
      g.stroke();
      g.fillStyle = '#e06a9a';
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        g.beginPath();
        g.arc(w * 0.72 + Math.cos(a) * 10, h * 0.66 + Math.sin(a) * 10, 7, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = '#f7c62a';
      g.beginPath();
      g.arc(w * 0.72, h * 0.66, 6, 0, Math.PI * 2);
      g.fill();
    },
    { fallback: '#f4f1e6', rough: 0.85 },
  );

const chalkboard = (color: string): THREE.Material =>
  canvasMat(
    `easel-chalk|${color}`,
    256,
    288,
    (g: C2D, w, h) => {
      g.fillStyle = color;
      g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(255,255,255,0.85)';
      g.lineWidth = 3;
      // chalk doodles: a star, 1 + 2 = 3, a smiley
      g.beginPath();
      for (let i = 0; i <= 10; i++) {
        const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
        const r = i % 2 ? 14 : 32;
        if (i === 0) g.moveTo(60 + Math.cos(a) * r, 64 + Math.sin(a) * r);
        else g.lineTo(60 + Math.cos(a) * r, 64 + Math.sin(a) * r);
      }
      g.stroke();
      g.font = '700 44px sans-serif';
      g.fillStyle = 'rgba(255,255,255,0.85)';
      g.fillText('1+2=3', 70, 170);
      g.beginPath();
      g.arc(180, 70, 30, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.arc(180, 74, 17, 0.2, Math.PI - 0.2);
      g.stroke();
      g.fillRect(168, 58, 5, 5);
      g.fillRect(188, 58, 5, 5);
      g.strokeStyle = 'rgba(255,220,120,0.8)';
      g.beginPath();
      g.moveTo(30, 230);
      for (let x = 30; x < 226; x += 14) g.quadraticCurveTo(x + 7, 214, x + 14, 230);
      g.stroke();
    },
    { fallback: color, rough: 0.9 },
  );

const kidsEasel: FurnitureDef = {
  id: 'kids-easel',
  name: 'כן ציור',
  category: 'kids',
  size: { w: EZ.w, d: EZ.d, h: EZ.h },
  colors: [slot('frame', 'עץ', PAL.birch), slot('board', 'לוח גיר', '#3f6b57')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { top, lx } = EZ;
    const wood = M.wood(c.frame, 0.6);
    // two leaning frames hinged at the top
    for (const s of [-1, 1]) {
      for (const sz of [-1, 1]) k.beam([s * lx, 0.004, sz * EZ.foot], [s * lx, top, sz * EZ.head], 0.04, 0.022, wood, 0.004);
      // spreader holding the frames apart
      k.rod([s * lx, 0.3, ezZ(0.3)], [s * lx, 0.3, -ezZ(0.3)], 0.006, M.steel(), 0.006, 6);
    }
    k.rbox(lx * 2 + 0.05, 0.03, EZ.head * 2 + 0.03, 0.006, wood, 0, top - 0.008, 0, 1);
    const by = 0.8; // board center height
    const bh = 0.56;
    for (const sz of [-1, 1]) {
      const g = new THREE.Group();
      g.position.set(0, by, sz * ezZ(by));
      g.rotation.y = sz === 1 ? 0 : Math.PI;
      g.rotation.order = 'YXZ';
      g.rotation.x = -EZ_TILT;
      k.g.add(g);
      const b = new Kit();
      // board in its own frame: +Z = the side children draw on
      b.box(lx * 2 - 0.02, bh, 0.012, wood, 0, -bh / 2, 0.012);
      const face = b.geo(faceGeo(lx * 2 - 0.07, bh - 0.05), sz === 1 ? painting() : chalkboard(c.board), 0, 0, 0.0185);
      face.castShadow = false;
      if (sz === 1) {
        // paper clips
        for (const sx of [-1, 1]) b.box(0.03, 0.02, 0.006, M.steel(), sx * 0.12, bh / 2 - 0.04, 0.0185);
      }
      // level tray under the board (un-tilted again)
      const tr = new Kit();
      tr.g.position.set(0, -bh / 2 - 0.03, 0.012);
      tr.g.rotation.x = EZ_TILT;
      b.g.add(tr.g);
      tr.rbox(lx * 2 + 0.02, 0.016, 0.085, 0.004, wood, 0, 0, 0.045, 1);
      tr.box(lx * 2 + 0.02, 0.03, 0.008, wood, 0, 0.004, 0.088);
      if (sz === 1) {
        ['#e0483e', '#f2b824', '#2f8fd0', '#4aa85c'].forEach((col, i) => {
          tr.cyl(0.02, 0.035, M.plastic('#f4f4f1'), -0.18 + i * 0.065, 0.016, 0.045, 0.022, 12);
          tr.cyl(0.018, 0.003, M.paint(col, 0.3), -0.18 + i * 0.065, 0.049, 0.045, 0.018, 12);
        });
        tr.rod([0.1, 0.021, 0.04], [0.24, 0.021, 0.05], 0.004, M.wood(PAL.teak), 0.004, 6).castShadow = false;
      } else {
        ['#ffffff', '#f6e27a', '#f2a0b8'].forEach((col, i) => axisCyl(tr, 0.006, 0.06, M.matte(col), -0.1 + i * 0.09, 0.022, 0.045, 'x', 0.006, 8));
        tr.rbox(0.09, 0.025, 0.04, 0.006, M.fabric('#5a6470', 16), 0.19, 0.016, 0.045, 1);
      }
      g.add(b.g);
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { lx } = EZ;
      for (const s of [-1, 1]) {
        D.line(ctx, s * lx, -EZ.foot, s * lx, EZ.foot, tint(c.frame, 0.1), 0.03);
        for (const sz of [-1, 1]) D.rr(ctx, s * lx, sz * EZ.foot, 0.045, 0.03, 0.004, tint(c.frame, 0.3), undefined, 0.006);
      }
      D.rr(ctx, 0, 0.14, lx * 2 - 0.02, 0.17, 0.006, '#ffffff', INK_SOFT, LINE_THIN);
      D.rr(ctx, 0, -0.14, lx * 2 - 0.02, 0.17, 0.006, tint(c.board, 0.35), INK_SOFT, LINE_THIN);
      D.rr(ctx, 0, 0, lx * 2 + 0.05, 0.085, 0.006, tint(c.frame, 0.35));
      for (let i = 0; i < 4; i++) D.circle(ctx, -0.18 + i * 0.065, 0.24, 0.02, tint(['#e0483e', '#f2b824', '#2f8fd0', '#4aa85c'][i], 0.25), undefined, 0.005);
    }),
};

export const KIDS_TOYS: FurnitureDef[] = [toyBlocks, dollhouse, kidsEasel];
