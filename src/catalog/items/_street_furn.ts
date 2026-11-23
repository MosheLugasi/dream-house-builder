/** Street furniture: bus stop, benches, bins, mailbox, hydrant, bike rack, bollard, planter, fountain, picnic table, kiosk. */
import * as THREE from 'three';
import type { FurnitureDef } from '../types';
import { D, INK_SOFT, Kit, LINE_THIN, M, PAL, blobGeo, darken, extrudeZ, lighten, mix, rng, roundedRectShape, sym, tint } from '../kit';
import { slot } from './_parts';
import { axisCyl, canvasMat, crr, extrudeX, faceGeo, galv, polyShape, squiggle } from './_street_shared';

/* ------------------------------------------------------------------ bus stop */

const BUS = { w: 3.2, d: 1.5, h: 2.62, backZ: -0.66, sideL: 0.9 };

const busIcon = (): THREE.Material =>
  canvasMat(
    'sign-bus',
    256,
    256,
    (c, s) => {
      c.fillStyle = '#f2c21b';
      c.fillRect(0, 0, s, s);
      crr(c, s * 0.04, s * 0.04, s * 0.92, s * 0.92, s * 0.08);
      c.strokeStyle = '#16181b';
      c.lineWidth = s * 0.03;
      c.stroke();
      // bus, front view
      c.fillStyle = '#16181b';
      crr(c, s * 0.3, s * 0.72, s * 0.09, s * 0.1, s * 0.02);
      c.fill();
      crr(c, s * 0.61, s * 0.72, s * 0.09, s * 0.1, s * 0.02);
      c.fill();
      crr(c, s * 0.24, s * 0.2, s * 0.52, s * 0.56, s * 0.07);
      c.fill();
      crr(c, s * 0.17, s * 0.36, s * 0.05, s * 0.12, s * 0.02);
      c.fill();
      crr(c, s * 0.78, s * 0.36, s * 0.05, s * 0.12, s * 0.02);
      c.fill();
      c.fillStyle = '#f2c21b';
      crr(c, s * 0.29, s * 0.3, s * 0.42, s * 0.22, s * 0.03);
      c.fill();
      crr(c, s * 0.36, s * 0.235, s * 0.28, s * 0.035, s * 0.015);
      c.fill();
      for (const x of [0.33, 0.67]) {
        c.beginPath();
        c.arc(s * x, s * 0.65, s * 0.033, 0, Math.PI * 2);
        c.fill();
      }
    },
    { fallback: '#f2c21b', rough: 0.45 },
  );

const routeMap = (): THREE.Material =>
  canvasMat(
    'bus-map',
    256,
    384,
    (c, w, h) => {
      c.fillStyle = '#f7f6f1';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#f2c21b';
      c.fillRect(0, 0, w, 46);
      c.strokeStyle = '#2b2d31';
      c.lineWidth = 7;
      squiggle(c, 24, 24, 150, 5, 3);
      // route lines with stops
      const cols = ['#d8473d', '#2f7fd0', '#4f9a4a'];
      const r = rng(9);
      cols.forEach((col, i) => {
        c.strokeStyle = col;
        c.lineWidth = 7;
        c.beginPath();
        let x = 30 + i * 22;
        let y = 80 + i * 14;
        c.moveTo(x, y);
        const pts: Array<[number, number]> = [[x, y]];
        for (let j = 0; j < 5; j++) {
          if (j % 2 === 0) x += 34 + r() * 30;
          else y += 26 + r() * 34;
          c.lineTo(x, y);
          pts.push([x, y]);
        }
        c.stroke();
        c.fillStyle = '#ffffff';
        c.lineWidth = 3.5;
        for (const [px, py] of pts) {
          c.beginPath();
          c.arc(px, py, 6, 0, Math.PI * 2);
          c.fill();
          c.stroke();
        }
      });
      // timetable rows
      c.strokeStyle = '#8a8d92';
      c.lineWidth = 4;
      for (let i = 0; i < 5; i++) squiggle(c, 26, 268 + i * 22, 230 - (i % 2) * 40, 3, 20 + i);
    },
    { fallback: '#f7f6f1', rough: 0.5 },
  );

function busRoofY(z: number): number {
  return 2.36 + 0.2 * (1 - (z / 0.75) ** 2);
}

const busStop: FurnitureDef = {
  id: 'bus-stop',
  name: 'תחנת אוטובוס',
  category: 'street',
  size: { w: BUS.w, d: BUS.d, h: BUS.h },
  colors: [slot('frame', 'מסגרת', '#3c4248'), slot('bench', 'ספסל', PAL.teak)],
  seats: [
    { x: -0.7, z: -0.33, height: 0.47, facing: 0, kind: 'sit' },
    { x: 0, z: -0.33, height: 0.47, facing: 0, kind: 'sit' },
    { x: 0.7, z: -0.33, height: 0.47, facing: 0, kind: 'sit' },
  ],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { w, backZ, sideL } = BUS;
    const frame = M.metal(c.frame, 0.5, 0.6);
    const glass = M.glass('#cfe6ee', 0.24);
    const px = w / 2 - 0.1;
    const t = 0.07;
    const frontZ = backZ + sideL;
    // posts: three at the back, one at the front end of each side screen
    for (const x of [-px, 0, px]) k.rbox(t, busRoofY(backZ) - 0.01, t, 0.008, frame, x, 0, backZ, 1);
    for (const s of [-1, 1]) k.rbox(0.05, busRoofY(frontZ) - 0.01, 0.05, 0.006, frame, s * px, 0, frontZ, 1);
    // rails + glazing
    for (const y of [0.26, 2.06]) {
      k.box(px * 2, 0.04, 0.04, frame, 0, y, backZ);
      for (const s of [-1, 1]) k.box(0.04, 0.04, sideL, frame, s * px, y, backZ + sideL / 2);
    }
    for (const s of [-1, 1]) {
      k.box(px - t, 1.76, 0.012, glass, (s * px) / 2, 0.3, backZ);
      k.box(0.012, 1.76, sideL - 0.06, glass, s * px, 0.3, backZ + sideL / 2);
      // safety dots strip on the glass
      k.box(px - t - 0.1, 0.05, 0.002, M.glass('#ffffff', 0.55), (s * px) / 2, 1.42, backZ + 0.008);
    }
    // barrel roof on three curved ribs
    const zs: number[] = [];
    for (let i = 0; i <= 12; i++) zs.push(-0.75 + (i / 12) * 1.5);
    const arc = (y0: number, th: number, z0 = -0.75, z1 = 0.75): THREE.Shape => {
      const q = zs.filter((z) => z >= z0 - 1e-6 && z <= z1 + 1e-6);
      const pts: Array<[number, number]> = q.map((z) => [z, busRoofY(z) + y0 + th] as [number, number]);
      for (const z of [...q].reverse()) pts.push([z, busRoofY(z) + y0]);
      return polyShape(pts);
    };
    k.geo(extrudeX(arc(0.02, 0.03), w), M.paint('#eef0f1', 0.5));
    for (const x of [-px, 0, px]) k.geo(extrudeX(arc(-0.04, 0.06, -0.75, 0.75), 0.05), frame, x, 0, 0);
    for (const z of [-0.733, 0.733]) k.box(w, 0.06, 0.03, frame, 0, busRoofY(z) - 0.012, z);
    // bench: timber slats on steel brackets
    const wood = M.wood(c.bench, 0.7);
    for (let i = 0; i < 4; i++) k.rbox(2.3, 0.03, 0.09, 0.008, wood, 0, 0.44, -0.52 + i * 0.105, 1);
    for (const x of [-0.85, 0, 0.85]) {
      k.box(0.05, 0.03, 0.42, frame, x, 0.41, -0.37);
      k.box(0.05, 0.41, 0.05, frame, x, 0, -0.3);
      k.box(0.14, 0.012, 0.14, frame, x, 0, -0.3);
    }
    // route map
    k.rbox(0.62, 0.92, 0.03, 0.006, frame, 0.72, 0.98, backZ + 0.05, 1);
    k.geo(faceGeo(0.56, 0.84), routeMap(), 0.72, 1.44, backZ + 0.0665).castShadow = false;
    // hanging bus sign, readable from both sides
    const sy = busRoofY(0.72) - 0.06;
    for (const x of [-0.14, 0.14]) k.rod([1.12 + x, sy - 0.02, 0.72], [1.12 + x, sy + 0.04, 0.72], 0.006, galv(), 0.006, 6);
    k.rbox(0.4, 0.4, 0.012, 0.004, galv(), 1.12, sy - 0.42, 0.72, 1);
    const f = faceGeo(0.39, 0.39);
    k.geo(f, busIcon(), 1.12, sy - 0.22, 0.727).castShadow = false;
    const b = f.clone();
    b.rotateY(Math.PI);
    k.geo(b, busIcon(), 1.12, sy - 0.22, 0.713).castShadow = false;
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { w, d, backZ, sideL } = BUS;
      const px = w / 2 - 0.1;
      ctx.setLineDash([0.08, 0.06]);
      D.rr(ctx, 0, 0, w, d, 0.02, '#eef0f1b0', INK_SOFT, LINE_THIN);
      ctx.setLineDash([]);
      D.rr(ctx, 0, -0.37, 2.3, 0.4, 0.01, tint(c.bench, 0.35));
      for (let i = 1; i < 4; i++) D.line(ctx, -1.15, -0.57 + i * 0.1, 1.15, -0.57 + i * 0.1, INK_SOFT, 0.006);
      D.line(ctx, -px, backZ, px, backZ, '#7fb0c4', 0.03);
      for (const s of [-1, 1]) D.line(ctx, s * px, backZ, s * px, backZ + sideL, '#7fb0c4', 0.03);
      for (const x of [-px, 0, px]) D.rr(ctx, x, backZ, 0.08, 0.08, 0.01, tint(c.frame, 0.4), undefined, LINE_THIN);
      for (const s of [-1, 1]) D.rr(ctx, s * px, backZ + sideL, 0.06, 0.06, 0.01, tint(c.frame, 0.4), undefined, LINE_THIN);
      D.rr(ctx, 1.12, 0.72, 0.4, 0.03, 0.005, '#f2c21b', undefined, 0.008);
    }),
};

/* ------------------------------------------------------------------ street bench */

const SB = { w: 1.8, d: 0.62, h: 0.84 };

const streetBench: FurnitureDef = {
  id: 'street-bench',
  name: 'ספסל רחוב',
  category: 'street',
  size: SB,
  colors: [slot('wood', 'עץ', '#a9754a'), slot('base', 'בסיס', '#9a9c9d')],
  seats: [
    { x: -0.55, z: 0.03, height: 0.45, facing: 0, kind: 'sit' },
    { x: 0, z: 0.03, height: 0.45, facing: 0, kind: 'sit' },
    { x: 0.55, z: 0.03, height: 0.45, facing: 0, kind: 'sit' },
  ],
  build: ({ colors: c }) => {
    const k = new Kit();
    const wood = M.wood(c.wood, 0.68);
    const stone = M.stone(c.base, 0.85);
    // cast concrete end frames: seat support + leaning back support in one piece
    const side = polyShape([
      [0.27, 0],
      [0.29, 0.405],
      [-0.13, 0.405],
      [-0.215, 0.8],
      [-0.3, 0.8],
      [-0.29, 0],
      [-0.19, 0],
      [-0.17, 0.2],
      [0.15, 0.2],
      [0.17, 0],
    ]);
    for (const s of [-1, 1]) k.geo(extrudeX(side, 0.09, 0.008), stone, s * 0.66, 0.008, 0);
    // seat slats
    for (let i = 0; i < 5; i++) k.rbox(SB.w, 0.035, 0.078, 0.01, wood, 0, 0.405, -0.09 + i * 0.09, 1);
    // back slats, leaning with the supports
    const lean = Math.atan2(0.085, 0.395);
    for (let i = 0; i < 3; i++) {
      const y = 0.52 + i * 0.105;
      const z = -0.13 - ((y - 0.405) / 0.395) * 0.085;
      const m = k.rbox(SB.w, 0.085, 0.03, 0.01, wood, 0, y, z + 0.018, 1);
      m.rotation.x = -lean;
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      for (const s of [-1, 1]) D.rr(ctx, s * 0.66, 0, 0.09, 0.6, 0.01, tint(c.base, 0.4), undefined, LINE_THIN);
      D.rr(ctx, 0, 0.1, SB.w, 0.44, 0.012, tint(c.wood, 0.35));
      for (let i = 1; i < 5; i++) D.line(ctx, -0.89, -0.12 + i * 0.09, 0.89, -0.12 + i * 0.09, INK_SOFT, 0.007);
      D.rr(ctx, 0, -0.2, SB.w, 0.1, 0.012, tint(c.wood, 0.15));
    }),
};

/* ------------------------------------------------------------------ trash bin */

const trashBin: FurnitureDef = {
  id: 'trash-bin',
  name: 'פח אשפה',
  category: 'street',
  size: { w: 0.52, d: 0.52, h: 1.02 },
  colors: [slot('body', 'גוף', '#2f5d46')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const body = M.metal(c.body, 0.55, 0.45);
    const dark = M.metal(darken(c.body, 0.35), 0.6, 0.4);
    k.cyl(0.2, 0.05, dark, 0, 0, 0, 0.2, 20);
    k.lathe(
      [
        [0.215, 0.05],
        [0.235, 0.74],
        [0.25, 0.75],
        [0.25, 0.775],
        [0.225, 0.775],
        [0.215, 0.74],
        [0.0, 0.74],
      ],
      body,
      0,
      0,
      0,
      24,
    );
    // vertical slats and bands
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const m = k.box(0.03, 0.56, 0.012, dark, Math.cos(a) * 0.232, 0.12, Math.sin(a) * 0.232);
      m.rotation.y = -a + Math.PI / 2;
    }
    k.ring(0.222, 0.012, body, 0, 0.11, 0, 24);
    k.ring(0.24, 0.012, body, 0, 0.69, 0, 24);
    // liner + rain hood on four struts
    k.disc(0.21, 0.004, M.matte('#17181a'), 0, 0.742, 0, 20);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      k.rod([Math.cos(a) * 0.235, 0.77, Math.sin(a) * 0.235], [Math.cos(a) * 0.235, 0.93, Math.sin(a) * 0.235], 0.011, dark, 0.011, 6);
    }
    k.lathe(
      [
        [0.26, 0.915],
        [0.26, 0.935],
        [0.2, 0.975],
        [0.08, 1.005],
        [0, 1.012],
      ],
      body,
      0,
      0,
      0,
      24,
    );
    k.disc(0.255, 0.004, dark, 0, 0.912, 0, 20);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.circle(ctx, 0, 0, 0.26, tint(c.body, 0.5));
      D.circle(ctx, 0, 0, 0.2, tint(c.body, 0.3), undefined, LINE_THIN);
      D.circle(ctx, 0, 0, 0.08, null, INK_SOFT, LINE_THIN);
    }),
};

/* ------------------------------------------------------------------ recycling bins */

const RB = { n: 3, bw: 0.62, gap: 0.03, d: 0.62, h: 1.14 };
const RB_W = RB.n * RB.bw + (RB.n - 1) * RB.gap;

const recycleLabel = (color: string): THREE.Material =>
  canvasMat(
    `recycle|${color}`,
    128,
    128,
    (c, s) => {
      c.fillStyle = '#f6f5f0';
      c.fillRect(0, 0, s, s);
      c.strokeStyle = color;
      c.fillStyle = color;
      c.lineWidth = s * 0.085;
      c.lineCap = 'butt';
      const R = s * 0.27;
      for (let i = 0; i < 3; i++) {
        const a0 = (i / 3) * Math.PI * 2 - Math.PI / 2 + 0.3;
        const a1 = a0 + (Math.PI * 2) / 3 - 0.75;
        c.beginPath();
        c.arc(s / 2, s / 2, R, a0, a1);
        c.stroke();
        // arrow head at the end of the arc
        const hx = s / 2 + Math.cos(a1) * R;
        const hy = s / 2 + Math.sin(a1) * R;
        c.save();
        c.translate(hx, hy);
        c.rotate(a1 + Math.PI / 2);
        c.beginPath();
        c.moveTo(s * 0.14, 0);
        c.lineTo(-s * 0.02, -s * 0.115);
        c.lineTo(-s * 0.02, s * 0.115);
        c.closePath();
        c.fill();
        c.restore();
      }
    },
    { fallback: '#f6f5f0', rough: 0.5 },
  );

const recyclingBins: FurnitureDef = {
  id: 'recycling-bins',
  name: 'פחי מיחזור',
  category: 'street',
  size: { w: RB_W, d: RB.d, h: RB.h },
  colors: [slot('a', 'פח נייר', '#2c6fb5'), slot('b', 'פח אריזות', '#e8822a'), slot('c', 'פח זכוכית', '#7a4fa0')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const cols = [c.a, c.b, c.c];
    cols.forEach((col, i) => {
      const x = -RB_W / 2 + RB.bw / 2 + i * (RB.bw + RB.gap);
      const body = M.plastic(col);
      const lid = M.plastic(darken(col, 0.18));
      k.box(RB.bw - 0.08, 0.06, RB.d - 0.1, M.plastic('#2a2b2e'), x, 0, 0);
      k.rbox(RB.bw, 0.86, RB.d - 0.02, 0.045, body, x, 0.05, -0.01, 2);
      // domed lid with a front lip
      k.rbox(RB.bw, 0.06, RB.d, 0.02, lid, x, 0.9, 0, 1);
      const dome = k.sphere(0.3, lid, x, 0.95, 0, 0.98, 0.62, 0.96, 18);
      dome.castShadow = true;
      // deposit opening: paper slot / round holes
      if (i === 0) {
        k.rbox(0.36, 0.07, 0.02, 0.012, M.matte('#141516'), x, 0.72, RB.d / 2 - 0.022, 1);
        k.rbox(0.4, 0.035, 0.03, 0.01, lid, x, 0.8, RB.d / 2 - 0.02, 1);
      } else {
        const n = i === 1 ? 1 : 2;
        for (let j = 0; j < n; j++) {
          const hx = x + (n === 1 ? 0 : (j - 0.5) * 0.24);
          const rr = n === 1 ? 0.1 : 0.075;
          const ring = k.ring(rr, 0.014, lid, hx, 0.75, RB.d / 2 - 0.02, 18);
          ring.rotation.x = 0;
          axisCyl(k, rr, 0.006, M.matte('#141516'), hx, 0.75, RB.d / 2 - 0.021, 'z', rr, 18);
        }
      }
      k.rbox(0.25, 0.25, 0.006, 0.02, M.paint('#f6f5f0'), x, 0.28, RB.d / 2 - 0.022, 1);
      k.geo(faceGeo(0.22, 0.22), recycleLabel(col), x, 0.405, RB.d / 2 - 0.0185).castShadow = false;
    });
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      [c.a, c.b, c.c].forEach((col, i) => {
        const x = -RB_W / 2 + RB.bw / 2 + i * (RB.bw + RB.gap);
        D.rr(ctx, x, 0, RB.bw, RB.d, 0.06, tint(col, 0.35));
        D.ellipse(ctx, x, 0, 0.22, 0.2, tint(col, 0.15), INK_SOFT, LINE_THIN);
      });
    }),
};

/* ------------------------------------------------------------------ mailbox */

const MB = { w: 0.5, d: 0.42, h: 1.38 };

const mailLabel = (): THREE.Material =>
  canvasMat(
    'mail-label',
    128,
    96,
    (c, w, h) => {
      c.fillStyle = '#f7f5ee';
      c.fillRect(0, 0, w, h);
      // envelope pictogram + collection times
      c.strokeStyle = '#b3261e';
      c.lineWidth = 5;
      c.strokeRect(12, 14, 46, 32);
      c.beginPath();
      c.moveTo(12, 14);
      c.lineTo(35, 33);
      c.lineTo(58, 14);
      c.stroke();
      c.strokeStyle = '#55585d';
      c.lineWidth = 4;
      squiggle(c, 70, 20, 116, 2.5, 4);
      squiggle(c, 70, 38, 106, 2.5, 5);
      squiggle(c, 14, 62, 114, 2.5, 6);
      squiggle(c, 14, 80, 90, 2.5, 7);
    },
    { fallback: '#f7f5ee', rough: 0.5 },
  );

const mailbox: FurnitureDef = {
  id: 'mailbox',
  name: 'תיבת דואר',
  category: 'street',
  size: MB,
  colors: [slot('body', 'גוף', '#c5281f')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const red = M.paint(c.body, 0.35);
    const dark = M.paint(darken(c.body, 0.3), 0.4);
    const bw = MB.w - 0.02;
    const bd = MB.d - 0.06;
    const zc = -0.03;
    // pedestal
    k.rbox(0.34, 0.04, 0.3, 0.008, dark, 0, 0, zc, 1);
    k.rbox(0.2, 0.56, 0.18, 0.02, red, 0, 0.04, zc, 1);
    // box with an arched top
    const y0 = 0.6;
    const bh = 0.77;
    const s = new THREE.Shape();
    const r = bw / 2 - 0.012;
    s.moveTo(-r, 0);
    s.lineTo(r, 0);
    s.lineTo(r, bh - 0.012 - r * 0.55);
    s.absellipse(0, bh - 0.012 - r * 0.55, r, r * 0.55, 0, Math.PI, false, 0);
    s.lineTo(-r, 0);
    k.geo(extrudeZ(s, bd, 0.012, 16), red, 0, y0 + 0.012, zc);
    const fz = zc + bd / 2;
    // posting slot under a rain hood
    k.rbox(0.3, 0.035, 0.012, 0.006, M.matte('#141516'), 0, y0 + 0.56, fz - 0.004, 1);
    const hood = k.rbox(0.34, 0.012, 0.06, 0.004, dark, 0, y0 + 0.605, fz + 0.022, 1);
    hood.rotation.x = 0.45;
    // collection plate + door with lock
    k.geo(faceGeo(0.2, 0.15), mailLabel(), 0, y0 + 0.43, fz + 0.0012).castShadow = false;
    k.rbox(0.34, 0.26, 0.008, 0.012, dark, 0, y0 + 0.05, fz - 0.002, 1);
    k.rbox(0.31, 0.23, 0.008, 0.01, red, 0, y0 + 0.065, fz + 0.001, 1);
    axisCyl(k, 0.012, 0.01, M.brass(), 0.11, y0 + 0.18, fz + 0.008, 'z', 0.012, 10);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, -0.03, MB.w - 0.02, MB.d - 0.06, 0.02, tint(c.body, 0.35));
      D.line(ctx, -0.15, 0.12, 0.15, 0.12, undefined, 0.016);
      D.rr(ctx, 0, -0.03, 0.2, 0.18, 0.02, null, INK_SOFT, LINE_THIN);
    }),
};

/* ------------------------------------------------------------------ fire hydrant */

const HY_Z = -0.03;

const fireHydrant: FurnitureDef = {
  id: 'fire-hydrant',
  name: 'ברז כיבוי אש',
  category: 'street',
  size: { w: 0.44, d: 0.38, h: 0.82 },
  colors: [slot('body', 'גוף', '#c8372d')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const red = M.paint(c.body, 0.4);
    const cap = M.metal('#c9ccce', 0.4, 0.9);
    const z = HY_Z;
    k.lathe(
      [
        [0.15, 0],
        [0.15, 0.03],
        [0.1, 0.045],
        [0.092, 0.08],
        [0.086, 0.12],
        [0.086, 0.46],
        [0.1, 0.475],
        [0.1, 0.5],
        [0.086, 0.515],
        [0.086, 0.62],
        [0.105, 0.635],
        [0.105, 0.655],
        [0.092, 0.67],
        [0.07, 0.74],
        [0.03, 0.775],
        [0, 0.78],
      ],
      red,
      0,
      0,
      z,
      20,
    );
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      k.cyl(0.013, 0.016, cap, Math.cos(a) * 0.125, 0.03, z + Math.sin(a) * 0.125, 0.013, 6);
    }
    k.cyl(0.026, 0.045, cap, 0, 0.775, z, 0.022, 5);
    // two hose outlets + a larger pumper outlet at the front, all capped
    for (const s of [-1, 1]) {
      axisCyl(k, 0.05, 0.1, red, s * 0.12, 0.56, z, 'x', 0.05, 14);
      axisCyl(k, 0.058, 0.035, cap, s * 0.185, 0.56, z, 'x', 0.058, 8);
      axisCyl(k, 0.02, 0.03, cap, s * 0.205, 0.56, z, 'x', 0.02, 5);
    }
    axisCyl(k, 0.062, 0.1, red, 0, 0.42, z + 0.11, 'z', 0.062, 14);
    axisCyl(k, 0.072, 0.04, cap, 0, 0.42, z + 0.175, 'z', 0.072, 8);
    axisCyl(k, 0.024, 0.03, cap, 0, 0.42, z + 0.2, 'z', 0.024, 5);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const z = HY_Z;
      D.rr(ctx, 0, z, 0.43, 0.1, 0.02, tint(c.body, 0.3), undefined, LINE_THIN);
      D.rr(ctx, 0, z + 0.13, 0.13, 0.16, 0.02, tint(c.body, 0.3), undefined, LINE_THIN);
      D.circle(ctx, 0, z, 0.15, tint(c.body, 0.45));
      D.circle(ctx, 0, z, 0.07, tint(c.body, 0.2), undefined, LINE_THIN);
    }),
};

/* ------------------------------------------------------------------ bike rack */

const BR = { w: 1.96, d: 0.8, h: 0.82, n: 5, pitch: 0.45 };

const bikeRack: FurnitureDef = {
  id: 'bike-rack',
  name: 'מתקן חניה לאופניים',
  category: 'street',
  size: { w: BR.w, d: BR.d, h: BR.h },
  colors: [slot('metal', 'מתכת', '#b9bdc1')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const m = M.metal(c.metal, 0.4, 0.9);
    const r = 0.024;
    const hz = BR.d / 2 - 0.06;
    const top = BR.h - r;
    for (let i = 0; i < BR.n; i++) {
      const x = (i - (BR.n - 1) / 2) * BR.pitch;
      k.tube(
        [
          [x, 0.02, -hz],
          [x, top - 0.2, -hz],
          [x, top - 0.05, -hz + 0.05],
          [x, top, -hz + 0.2],
          [x, top, hz - 0.2],
          [x, top - 0.05, hz - 0.05],
          [x, top - 0.2, hz],
          [x, 0.02, hz],
        ],
        r,
        m,
        { seg: 26, radial: 8, tension: 0.35 },
      );
      for (const s of [-1, 1]) k.cyl(0.055, 0.012, m, x, 0.012, s * hz, 0.055, 10);
    }
    // ground rails tie the hoops into one rack
    for (const s of [-1, 1]) k.rbox(BR.w, 0.012, 0.09, 0.003, m, 0, 0, s * hz, 1);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const hz = BR.d / 2 - 0.06;
      for (const s of [-1, 1]) D.rr(ctx, 0, s * hz, BR.w, 0.09, 0.01, tint(c.metal, 0.5), INK_SOFT, LINE_THIN);
      for (let i = 0; i < BR.n; i++) {
        const x = (i - (BR.n - 1) / 2) * BR.pitch;
        D.line(ctx, x, -hz, x, hz, undefined, 0.045);
        D.line(ctx, x, -hz, x, hz, tint(c.metal, 0.4), 0.025);
      }
    }),
};

/* ------------------------------------------------------------------ bollard */

const bollard: FurnitureDef = {
  id: 'bollard',
  name: 'עמוד חסימה',
  category: 'street',
  size: { w: 0.2, d: 0.2, h: 0.92 },
  colors: [slot('body', 'גוף', '#34383d'), slot('band', 'פס מחזיר אור', '#f2c21b')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const m = M.metal(c.body, 0.5, 0.6);
    k.lathe(
      [
        [0.1, 0],
        [0.1, 0.025],
        [0.075, 0.05],
        [0.068, 0.1],
        [0.064, 0.76],
        [0.078, 0.775],
        [0.078, 0.8],
        [0.064, 0.815],
        [0.06, 0.86],
        [0.04, 0.9],
        [0, 0.918],
      ],
      m,
      0,
      0,
      0,
      20,
    );
    k.cyl(0.0665, 0.07, M.paint(c.band, 0.3), 0, 0.62, 0, 0.0655, 20);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.circle(ctx, 0, 0, 0.1, tint(c.body, 0.55));
      D.circle(ctx, 0, 0, 0.06, tint(c.band, 0.2), undefined, LINE_THIN);
    }),
};

/* ------------------------------------------------------------------ planter */

const PLANTER = { r: 0.55, h: 1.2 };

function planterFlowers(): Array<{ x: number; z: number; h: number; k: number }> {
  const r = rng(21);
  const out: Array<{ x: number; z: number; h: number; k: number }> = [];
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + r() * 0.25;
    const rad = 0.3 + r() * 0.14;
    out.push({ x: Math.cos(a) * rad, z: Math.sin(a) * rad, h: 0.1 + r() * 0.09, k: Math.floor(r() * 3) });
  }
  return out;
}

const planter: FurnitureDef = {
  id: 'planter',
  name: 'אדנית רחוב',
  category: 'street',
  size: { w: PLANTER.r * 2, d: PLANTER.r * 2, h: 1.15 },
  colors: [slot('pot', 'אדנית', '#b9b4aa'), slot('flowers', 'פרחים', '#d9548a'), slot('leaves', 'עלווה', '#4f7f3f')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const R = PLANTER.r;
    const stone = M.stone(c.pot, 0.8);
    k.lathe(
      [
        [0, 0],
        [0.36, 0],
        [0.38, 0.03],
        [0.46, 0.3],
        [R - 0.02, 0.5],
        [R, 0.52],
        [R, 0.57],
        [R - 0.02, 0.585],
        [R - 0.075, 0.585],
        [R - 0.09, 0.54],
        [0, 0.54],
      ],
      stone,
      0,
      0,
      0,
      32,
    );
    const soilY = 0.54;
    k.disc(R - 0.085, 0.006, M.soil(), 0, soilY, 0, 24);
    // clipped shrub in the middle
    const greens = [M.foliage(c.leaves), M.foliage(lighten(c.leaves, 0.1)), M.foliage(darken(c.leaves, 0.14))];
    const blobs: Array<[number, number, number, number]> = [
      [0, 0.86, 0, 0.28],
      [-0.12, 0.76, 0.08, 0.2],
      [0.13, 0.78, -0.05, 0.21],
      [0.03, 0.75, -0.14, 0.19],
      [0.02, 0.76, 0.15, 0.19],
    ];
    blobs.forEach(([x, y, z, r], i) => k.geo(blobGeo(r, 2, 60 + i, 0.13, 2.4), greens[i % 3], x, y, z));
    k.cyl(0.03, 0.2, M.bark(), 0, soilY, 0, 0.025, 6);
    // ring of flowers with leafy tufts
    const petals = [M.matte(c.flowers), M.matte(lighten(c.flowers, 0.35)), M.matte(mix(c.flowers, '#f2c14e', 0.8))];
    const centre = M.matte('#f2c14e');
    const r = rng(5);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.2;
      const rad = 0.38 + r() * 0.04;
      const m = k.geo(blobGeo(0.085 + r() * 0.02, 1, 80 + i, 0.25, 3), greens[(i + 1) % 3], Math.cos(a) * rad, soilY + 0.04, Math.sin(a) * rad);
      m.scale.y = 0.7;
    }
    for (const f of planterFlowers()) {
      k.rod([f.x, soilY, f.z], [f.x, soilY + f.h, f.z], 0.005, greens[0], 0.004, 4);
      k.sphere(0.04, petals[f.k], f.x, soilY + f.h + 0.012, f.z, 1, 0.55, 1, 7);
      k.sphere(0.015, centre, f.x, soilY + f.h + 0.031, f.z, 1, 0.7, 1, 5);
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const R = PLANTER.r;
      D.circle(ctx, 0, 0, R, tint(c.pot, 0.4));
      D.circle(ctx, 0, 0, R - 0.08, '#d9cdbd', INK_SOFT, LINE_THIN);
      const cols = [tint(c.flowers, 0.1), tint(c.flowers, 0.5), tint(mix(c.flowers, '#f2c14e', 0.8), 0.2)];
      for (const f of planterFlowers()) D.circle(ctx, f.x, f.z, 0.04, cols[f.k], INK_SOFT, 0.005);
      D.foliage(ctx, 0, 0, 0.3, tint(c.leaves, 0.42), 7, 61);
    }),
};

/* ------------------------------------------------------------------ fountain */

const FOUNT = { R: 1.5, h: 1.56, water: 0.36 };

const fountain: FurnitureDef = {
  id: 'fountain',
  name: 'מזרקה',
  category: 'street',
  size: { w: FOUNT.R * 2, d: FOUNT.R * 2, h: FOUNT.h },
  colors: [slot('stone', 'אבן', '#d9d1c0'), slot('water', 'מים', '#7fc4d8')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { R } = FOUNT;
    const stone = M.stone(c.stone, 0.7);
    const water = M.water(c.water);
    const spray = M.glass('#f2fbff', 0.42);
    // basin wall with a rounded coping, tiled floor
    k.lathe(
      [
        [R - 0.02, 0],
        [R - 0.02, 0.04],
        [R - 0.05, 0.06],
        [R - 0.05, 0.4],
        [R, 0.42],
        [R, 0.455],
        [R - 0.02, 0.47],
        [R - 0.28, 0.47],
        [R - 0.3, 0.455],
        [R - 0.3, 0.42],
        [R - 0.25, 0.4],
        [R - 0.27, 0.08],
        [0, 0.08],
      ],
      stone,
      0,
      0,
      0,
      48,
    );
    k.disc(R - 0.26, 0.004, M.ceramic(mix(c.water, '#2f6f8f', 0.5)), 0, 0.081, 0, 40);
    const surf = new THREE.CircleGeometry(R - 0.255, 48);
    surf.rotateX(-Math.PI / 2);
    k.geo(surf, water, 0, FOUNT.water, 0).castShadow = false;
    // pedestal, upper bowl, finial
    k.lathe(
      [
        [0.3, 0.08],
        [0.3, 0.44],
        [0.26, 0.47],
        [0.16, 0.52],
        [0.12, 0.62],
        [0.15, 0.74],
        [0.11, 0.86],
        [0.14, 0.94],
        [0.3, 1.0],
        [0.52, 1.09],
        [0.58, 1.13],
        [0.58, 1.155],
        [0.54, 1.165],
        [0.5, 1.15],
        [0.3, 1.08],
        [0.1, 1.07],
        [0.08, 1.2],
        [0.11, 1.26],
        [0.07, 1.34],
        [0.035, 1.38],
        [0.035, 1.42],
      ],
      stone,
      0,
      0,
      0,
      32,
    );
    const up = new THREE.RingGeometry(0.085, 0.515, 32, 1);
    up.rotateX(-Math.PI / 2);
    k.geo(up, water, 0, 1.142, 0).castShadow = false;
    // water: bubbling crown on top and eight streams arching into the basin
    k.lathe(
      [
        [0.028, 1.42],
        [0.04, 1.47],
        [0.065, 1.52],
        [0.05, 1.55],
        [0, 1.558],
      ],
      spray,
      0,
      0,
      0,
      12,
    ).castShadow = false;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const pts: Array<[number, number, number]> = [];
      for (let j = 0; j <= 6; j++) {
        const t = j / 6;
        const rad = 0.55 + t * 0.5;
        const y = 1.15 + 0.1 * t - 0.88 * t * t;
        pts.push([Math.cos(a) * rad, y, Math.sin(a) * rad]);
      }
      k.tube(pts, 0.014, spray, { seg: 10, radial: 5 }).castShadow = false;
      const ring = new THREE.RingGeometry(0.05, 0.085, 14, 1);
      ring.rotateX(-Math.PI / 2);
      k.geo(ring, M.glass('#ffffff', 0.5), Math.cos(a) * 1.05, FOUNT.water + 0.003, Math.sin(a) * 1.05).castShadow = false;
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { R } = FOUNT;
      D.circle(ctx, 0, 0, R, tint(c.stone, 0.3));
      D.circle(ctx, 0, 0, R - 0.26, tint(c.water, 0.45), undefined, LINE_THIN);
      for (const rr of [1.05, 0.82]) D.circle(ctx, 0, 0, rr, null, tint(c.water, 0.1), 0.008);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
        D.line(ctx, Math.cos(a) * 0.58, Math.sin(a) * 0.58, Math.cos(a) * 1.05, Math.sin(a) * 1.05, tint(c.water, 0.05), 0.012);
      }
      D.circle(ctx, 0, 0, 0.58, tint(c.stone, 0.3), undefined, LINE_THIN);
      D.circle(ctx, 0, 0, 0.5, tint(c.water, 0.45), INK_SOFT, LINE_THIN);
      D.circle(ctx, 0, 0, 0.09, tint(c.stone, 0.2), undefined, LINE_THIN);
    }),
};

/* ------------------------------------------------------------------ picnic table */

const PIC = { w: 1.8, d: 1.56, h: 0.76, bz: 0.62 };

const picnicTable: FurnitureDef = {
  id: 'picnic-table',
  name: 'שולחן פיקניק',
  category: 'street',
  size: { w: PIC.w, d: PIC.d, h: PIC.h },
  colors: [slot('wood', 'עץ', '#b07d4f')],
  seats: [
    { x: -0.45, z: -PIC.bz, height: 0.46, facing: 0, kind: 'sit' },
    { x: 0.45, z: -PIC.bz, height: 0.46, facing: 0, kind: 'sit' },
    { x: -0.45, z: PIC.bz, height: 0.46, facing: Math.PI, kind: 'sit' },
    { x: 0.45, z: PIC.bz, height: 0.46, facing: Math.PI, kind: 'sit' },
  ],
  build: ({ colors: c }) => {
    const k = new Kit();
    const wood = M.wood(c.wood, 0.72);
    const { w, bz } = PIC;
    // top: five boards; benches: two boards each
    for (let i = 0; i < 5; i++) k.rbox(w, 0.04, 0.142, 0.008, wood, 0, 0.72, (i - 2) * 0.15, 1);
    for (const s of [-1, 1]) for (const o of [-0.075, 0.075]) k.rbox(w, 0.04, 0.142, 0.008, wood, 0, 0.42, s * bz + o, 1);
    // A-frames
    for (const s of [-1, 1]) {
      const x = s * 0.62;
      k.beam([x, 0.675, -0.36], [x, 0.675, 0.36], 0.04, 0.09, wood, 0.006);
      k.beam([x, 0.375, -0.775], [x, 0.375, 0.775], 0.04, 0.09, wood, 0.006);
      for (const sz of [-1, 1]) k.beam([x + s * 0.041, 0.024, sz * 0.6], [x + s * 0.041, 0.7, sz * 0.2], 0.04, 0.09, wood, 0.006);
      // diagonal brace to the middle of the top
      k.beam([x - s * 0.04, 0.39, 0], [s * 0.12, 0.69, 0], 0.035, 0.07, wood, 0.006);
    }
    k.beam([-0.14, 0.7, 0], [0.14, 0.7, 0], 0.04, 0.07, wood, 0.004);
    // bolt heads
    const steel = M.steel();
    for (const s of [-1, 1]) for (const sz of [-1, 1]) axisCyl(k, 0.012, 0.006, steel, s * 0.685, 0.375, sz * 0.4, 'x', 0.012, 8);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { w, bz } = PIC;
      const f = tint(c.wood, 0.35);
      for (const s of [-1, 1]) D.line(ctx, s * 0.62, -0.775, s * 0.62, 0.775, INK_SOFT, 0.04);
      for (const s of [-1, 1]) {
        D.rr(ctx, 0, s * bz, w, 0.29, 0.01, f);
        D.line(ctx, -w / 2 + 0.01, s * bz, w / 2 - 0.01, s * bz, INK_SOFT, 0.006);
      }
      D.rr(ctx, 0, 0, w, 0.745, 0.01, tint(c.wood, 0.25));
      for (let i = 0; i < 4; i++) D.line(ctx, -w / 2 + 0.01, (i - 1.5) * 0.15, w / 2 - 0.01, (i - 1.5) * 0.15, INK_SOFT, 0.006);
    }),
};

/* ------------------------------------------------------------------ kiosk */

const KI = { w: 2.5, d: 2.0, h: 2.9, bw: 2.3, bd: 1.45, bz: -0.265, wallH: 2.4 };

const kioskBand = (color: string): THREE.Material =>
  canvasMat(
    `kiosk-band|${color}`,
    512,
    80,
    (c, w, h) => {
      c.fillStyle = color;
      c.fillRect(0, 0, w, h);
      c.strokeStyle = '#ffffff';
      c.lineWidth = 9;
      squiggle(c, 150, h / 2, 362, 13, 12);
      c.fillStyle = '#ffffff';
      for (const x of [110, 402]) {
        c.beginPath();
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
          const rr = i % 2 === 0 ? 17 : 7.5;
          c.lineTo(x + Math.cos(a) * rr, h / 2 + Math.sin(a) * rr);
        }
        c.closePath();
        c.fill();
      }
    },
    { fallback: color, rough: 0.5 },
  );

const PRODUCT_COLORS = ['#d8473d', '#f2c21b', '#3f8fd0', '#4f9a4a', '#e8822a', '#8a5fb0', '#f3f1ec', '#e06a9a', '#2fa39a'];

const kiosk: FurnitureDef = {
  id: 'kiosk',
  name: 'קיוסק',
  category: 'street',
  size: { w: KI.w, d: KI.d, h: KI.h },
  colors: [slot('body', 'גוף', '#e9e2d0'), slot('awning', 'סוכך', '#d8473d'), slot('trim', 'עיטור', '#2f6f64')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { w, bw, bd, bz, wallH } = KI;
    const body = M.paint(c.body, 0.6);
    const trim = M.paint(c.trim, 0.45);
    const fz = bz + bd / 2; // front wall plane
    const t = 0.08;
    // plinth, side and back walls
    k.box(bw, 0.12, bd, M.stone('#8f8f8c', 0.85), 0, 0, bz);
    for (const s of [-1, 1]) k.box(t, wallH - 0.12, bd, body, s * (bw / 2 - t / 2), 0.12, bz);
    k.box(bw - 2 * t, wallH - 0.12, t, body, 0, 0.12, bz - bd / 2 + t / 2);
    // front wall around the serving window (1.0 .. 2.05)
    const win = { x0: -0.95, x1: 0.95, y0: 1.0, y1: 2.05 };
    k.box(bw - 2 * t, win.y0 - 0.12, t, body, 0, 0.12, fz - t / 2);
    k.box(bw - 2 * t, wallH - win.y1, t, body, 0, win.y1, fz - t / 2);
    for (const s of [-1, 1]) k.box(bw / 2 - t - win.x1, win.y1 - win.y0, t, body, s * (win.x1 + (bw / 2 - t - win.x1) / 2), win.y0, fz - t / 2);
    // panelled base with trim frames
    for (const x of [-0.72, 0, 0.72]) k.rbox(0.62, 0.62, 0.012, 0.01, trim, x, 0.24, fz + 0.002, 1);
    for (const x of [-0.72, 0, 0.72]) k.rbox(0.52, 0.52, 0.012, 0.01, body, x, 0.29, fz + 0.006, 1);
    // floor + ceiling inside, dark interior back wall with stocked shelves
    k.box(bw - 2 * t, 0.02, bd - 2 * t, M.matte('#6b655c'), 0, 0.12, bz);
    const backZ = bz - bd / 2 + t;
    k.box(bw - 2 * t, wallH - 0.2, 0.01, M.matte('#4b4640'), 0, 0.14, backZ + 0.005);
    const r = rng(17);
    for (let row = 0; row < 3; row++) {
      const y = 1.08 + row * 0.33;
      k.box(bw - 2 * t - 0.1, 0.02, 0.26, M.wood(PAL.oakLight), 0, y, backZ + 0.14);
      let x = -bw / 2 + t + 0.1;
      while (x < bw / 2 - t - 0.2) {
        const pw = 0.07 + r() * 0.09;
        const ph = 0.1 + r() * 0.16;
        const col = PRODUCT_COLORS[Math.floor(r() * PRODUCT_COLORS.length)];
        if (r() > 0.35) k.box(pw, ph, 0.12, M.paint(col, 0.5), x + pw / 2, y + 0.02, backZ + 0.16);
        else k.cyl(pw * 0.42, ph, M.paint(col, 0.5), x + pw / 2, y + 0.02, backZ + 0.16, pw * 0.42, 8);
        x += pw + 0.012 + r() * 0.03;
      }
    }
    // serving counter with a till and a jar of lollipops
    k.rbox(win.x1 * 2 + 0.16, 0.045, 0.5, 0.012, M.wood(PAL.walnut, 0.5), 0, win.y0 - 0.02, fz - 0.06, 1);
    k.rbox(0.26, 0.11, 0.24, 0.015, M.plastic('#2f3236'), -0.55, win.y0 + 0.025, fz - 0.14, 1);
    const scr = k.rbox(0.2, 0.15, 0.02, 0.006, M.screen('#1a2330'), -0.55, win.y0 + 0.14, fz - 0.2, 1);
    scr.rotation.x = -0.3;
    k.cyl(0.07, 0.15, M.glass('#e8f4f6', 0.3), 0.55, win.y0 + 0.025, fz - 0.1, 0.07, 14);
    k.cyl(0.05, 0.02, M.paint(c.awning, 0.4), 0.55, win.y0 + 0.175, fz - 0.1, 0.055, 14);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      k.sphere(0.02, M.paint(PRODUCT_COLORS[i], 0.5), 0.55 + Math.cos(a) * 0.035, win.y0 + 0.07 + (i % 2) * 0.035, fz - 0.1 + Math.sin(a) * 0.035, 1, 1, 1, 6);
    }
    // magazine rack on the front
    const rackY = 0.42;
    for (let i = 0; i < 2; i++) {
      const rk = new Kit();
      rk.box(0.6, 0.02, 0.07, M.blackMetal(), 0, 0, 0.035);
      rk.box(0.6, 0.06, 0.008, M.blackMetal(), 0, 0, 0.07);
      for (let j = 0; j < 3; j++) {
        const m = rk.box(0.17, 0.24, 0.008, M.paint(PRODUCT_COLORS[(i * 3 + j + 1) % 9], 0.5), -0.2 + j * 0.2, 0.02, 0.04);
        m.rotation.x = -0.18;
      }
      k.sub(rk, 0.72 * (i === 0 ? -1 : 1), rackY, fz + 0.012);
    }
    // roof slab, sign band
    k.rbox(w, 0.1, bd + 0.1, 0.02, trim, 0, wallH, bz + 0.05, 1);
    const bandH = 0.38;
    k.rbox(bw - 0.1, bandH, 0.08, 0.015, M.paint(c.awning, 0.5), 0, wallH + 0.1, fz - 0.1, 1);
    k.geo(faceGeo(bw - 0.2, bandH - 0.08), kioskBand(c.awning), 0, wallH + 0.1 + bandH / 2, fz - 0.058).castShadow = false;
    // striped awning with a scalloped valance
    const n = 10;
    const aw = w - 0.02;
    const sw = aw / n;
    const y1 = wallH - 0.06;
    const z1 = fz + 0.02;
    const y0 = y1 - 0.36;
    const z0 = KI.d / 2 - 0.02;
    const cloth = [M.cloth(c.awning), M.cloth('#f6f2e8')];
    for (let i = 0; i < n; i++) {
      const x0 = -aw / 2 + i * sw;
      const pos = [x0, y1, z1, x0 + sw, y1, z1, x0, y0, z0, x0 + sw, y0, z0];
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(8), 2));
      g.setIndex([0, 2, 1, 1, 2, 3]);
      g.computeVertexNormals();
      const m = k.geo(g, cloth[i % 2]);
      m.castShadow = true;
      // valance scallop
      const sc = new THREE.Shape();
      sc.moveTo(-sw / 2, 0);
      sc.lineTo(sw / 2, 0);
      sc.lineTo(sw / 2, -0.06);
      sc.absellipse(0, -0.06, sw / 2, 0.05, 0, Math.PI, true, 0);
      sc.lineTo(-sw / 2, 0);
      k.geo(new THREE.ShapeGeometry(sc, 6), cloth[i % 2], x0 + sw / 2, y0, z0);
    }
    for (const s of [-1, 1]) {
      const x = s * (aw / 2);
      k.rod([x, y1, z1], [x, y0, z0], 0.012, M.steel(), 0.012, 6);
      k.rod([x, y0 - 0.38, z1], [x, y0, z0], 0.01, M.steel(), 0.01, 6);
    }
    k.rod([-aw / 2, y0, z0], [aw / 2, y0, z0], 0.012, M.steel(), 0.012, 6);
    // side door
    k.rbox(0.012, 1.95, 0.75, 0.004, trim, bw / 2 + 0.002, 0.14, bz - 0.15, 1);
    axisCyl(k, 0.02, 0.05, M.brass(), bw / 2 + 0.03, 1.1, bz + 0.13, 'x', 0.02, 10);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { w, d, bw, bd, bz } = KI;
      const fz = bz + bd / 2;
      // awning (dashed, stripes) in front, booth behind
      const n = 10;
      const sw = (w - 0.02) / n;
      for (let i = 0; i < n; i++) {
        D.box(ctx, -w / 2 + 0.01 + i * sw, fz, -w / 2 + 0.01 + (i + 1) * sw, d / 2 - 0.02, 0, i % 2 === 0 ? tint(c.awning, 0.35) : '#f8f5ee', null);
      }
      ctx.setLineDash([0.07, 0.05]);
      D.box(ctx, -w / 2 + 0.01, fz, w / 2 - 0.01, d / 2 - 0.02, 0, null, INK_SOFT, LINE_THIN);
      ctx.setLineDash([]);
      D.rr(ctx, 0, bz + 0.05, w, bd + 0.1, 0.02, tint(c.trim, 0.45));
      D.rr(ctx, 0, bz, bw - 0.16, bd - 0.16, 0.01, tint(c.body, 0.3), INK_SOFT, LINE_THIN);
      D.rr(ctx, 0, fz - 0.06, 2.06, 0.3, 0.01, tint(PAL.walnut, 0.45), undefined, LINE_THIN);
    }),
};

export const STREET_FURN: FurnitureDef[] = [busStop, streetBench, trashBin, recyclingBins, mailbox, fireHydrant, bikeRack, bollard, planter, fountain, picnicTable, kiosk];
