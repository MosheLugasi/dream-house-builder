/** Library, reception, kindergarten and general public-building furniture. */
import * as THREE from 'three';
import type { FurnitureDef } from '../types';
import { D, INK_SOFT, Kit, LINE_THIN, M, PAL, darken, lighten, rng, sym, tint, type V3 } from '../kit';
import { bookStack, slot } from './_parts';
import { type C2D, axisCyl, canvasMat, faceGeo, planarUV, smoothYZ, speckleMat, squiggle, sweepYZ } from './_street_shared';

const BOOK_COLORS = ['#7a8fa3', '#c7775a', '#e6dfd0', '#52606d', '#d6a544', '#9bae8a', '#b9a79a', '#3f4f5f', '#a25d4a', '#f0ebe0', '#6f7f6a', '#8a5fb0', '#2f6f64'];

/** Cheap book: only the faces you can see on a shelf (spine, top, two sides). Spine faces +Z at z = 0. */
function bookGeo(t: number, h: number, d: number): THREE.BufferGeometry {
  const x0 = -t / 2;
  const x1 = t / 2;
  const pos = [
    // spine
    x0, 0, 0, x1, 0, 0, x1, h, 0, x0, 0, 0, x1, h, 0, x0, h, 0,
    // top
    x0, h, 0, x1, h, 0, x1, h, -d, x0, h, 0, x1, h, -d, x0, h, -d,
    // right
    x1, 0, 0, x1, 0, -d, x1, h, -d, x1, 0, 0, x1, h, -d, x1, h, 0,
    // left
    x0, 0, -d, x0, 0, 0, x0, h, 0, x0, 0, -d, x0, h, 0, x0, h, -d,
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(48), 2));
  g.computeVertexNormals();
  return g;
}

/** A tightly packed row of library books; returns the plan rectangles for the 2D symbol. */
function libraryRow(k: Kit, x0: number, x1: number, y: number, zFront: number, depth: number, maxH: number, seed: number): void {
  const r = rng(seed);
  let x = x0 + 0.004;
  const gapAt = r() > 0.45 ? x0 + (x1 - x0) * (0.3 + r() * 0.5) : Infinity;
  let gapDone = false;
  while (x < x1 - 0.03) {
    if (!gapDone && x > gapAt) {
      // a few books lying flat + a gap
      const w = 0.2;
      if (x + w < x1) {
        let yy = y;
        for (let j = 0; j < 3; j++) {
          const tt = 0.03 + r() * 0.015;
          k.box(w - j * 0.012, tt, depth - 0.03, M.matte(BOOK_COLORS[Math.floor(r() * BOOK_COLORS.length)]), x + w / 2, yy, zFront - depth / 2);
          yy += tt;
        }
        x += w + 0.012;
      }
      gapDone = true;
      continue;
    }
    const t = 0.03 + r() * 0.034;
    const h = Math.min(maxH - 0.015, 0.2 + r() * 0.1);
    if (x + t > x1) break;
    k.geo(bookGeo(t, h, depth - 0.02 - r() * 0.03), M.matte(BOOK_COLORS[Math.floor(r() * BOOK_COLORS.length)]), x + t / 2, y, zFront - r() * 0.012);
    x += t + 0.0015;
  }
}

/* ------------------------------------------------------------------ library bookcase (double sided) */

const LB = { w: 1.8, d: 0.6, h: 2.0, rows: 5, base: 0.1, t: 0.03 };

const libraryShelf: FurnitureDef = {
  id: 'library-shelf',
  name: 'כוננית ספרייה דו-צדדית',
  category: 'public',
  size: { w: LB.w, d: LB.d, h: LB.h },
  colors: [slot('wood', 'עץ', PAL.oak)],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { w, d, h, rows, base, t } = LB;
    const wood = M.wood(c.wood);
    k.box(w - 0.04, base, d - 0.06, M.matte('#3a3531'), 0, 0, 0);
    for (const s of [-1, 1]) k.rbox(t, h, d, 0.004, wood, s * (w / 2 - t / 2), 0, 0, 1);
    k.box(t, h - base - 2 * t, d - 0.01, wood, 0, base + t, 0);
    k.rbox(w - 2 * t, t, d, 0.004, wood, 0, h - t, 0, 1);
    k.box(w - 2 * t, h - base - t, 0.012, M.wood(darken(c.wood, 0.12)), 0, base, 0);
    const pitch = (h - base - t) / rows;
    for (let i = 0; i < rows; i++) k.box(w - 2 * t, t, d - 0.01, wood, 0, base + i * pitch, 0);
    const bayW = (w - 3 * t) / 2;
    const depth = d / 2 - 0.02;
    for (const side of [0, 1]) {
      const sk = new Kit();
      for (let i = 0; i < rows; i++) {
        for (const b of [-1, 1]) {
          const cx = b * (bayW / 2 + t / 2);
          libraryRow(sk, cx - bayW / 2, cx + bayW / 2, base + i * pitch + t, d / 2 - 0.02, depth, pitch - t, 100 + side * 50 + i * 7 + b);
        }
      }
      const g = k.sub(sk);
      g.rotation.y = side * Math.PI;
    }
    // end-panel signs
    for (const s of [-1, 1]) {
      const plate = k.rbox(0.004, 0.14, 0.2, 0.002, M.paint('#f6f4ee', 0.5), s * (w / 2 + 0.001), 1.5, 0, 1);
      plate.castShadow = false;
      k.box(0.002, 0.012, 0.14, M.matte('#55606d'), s * (w / 2 + 0.0035), 1.59, 0);
      k.box(0.002, 0.008, 0.1, M.matte('#9aa2ab'), s * (w / 2 + 0.0035), 1.555, 0);
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { w, d, t } = LB;
      D.rr(ctx, 0, 0, w, d, 0.004, tint(c.wood, 0.35));
      const r = rng(100);
      for (const sz of [-1, 1]) {
        let x = -w / 2 + t + 0.005;
        while (x < w / 2 - t - 0.05) {
          const bt = 0.03 + r() * 0.034;
          if (Math.abs(x + bt / 2) > t) D.rr(ctx, x + bt / 2, sz * (d / 4 + 0.01), bt, d / 2 - 0.05, 0, tint(BOOK_COLORS[Math.floor(r() * BOOK_COLORS.length)], 0.4), INK_SOFT, 0.004);
          x += bt + 0.002;
        }
      }
      D.line(ctx, -w / 2 + t, 0, w / 2 - t, 0, undefined, 0.012);
    }),
};

/* ------------------------------------------------------------------ reading table */

const RT = { w: 2.0, d: 1.0, h: 1.16, topY: 0.75 };

const readingTable: FurnitureDef = {
  id: 'reading-table',
  name: 'שולחן קריאה',
  category: 'public',
  size: { w: RT.w, d: RT.d, h: RT.h },
  colors: [slot('wood', 'עץ', PAL.walnut), slot('shade', 'אהיל', '#2f6b4f')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { w, d, topY } = RT;
    const wood = M.wood(c.wood, 0.5);
    k.rbox(w, 0.04, d, 0.008, wood, 0, topY - 0.04, 0, 1);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) k.rbox(0.075, topY - 0.04, 0.075, 0.008, wood, sx * (w / 2 - 0.1), 0, sz * (d / 2 - 0.1), 1);
      k.box(0.03, 0.09, d - 0.275, wood, sx * (w / 2 - 0.1), topY - 0.13, 0);
    }
    for (const sz of [-1, 1]) k.box(w - 0.275, 0.09, 0.03, wood, 0, topY - 0.13, sz * (d / 2 - 0.1));
    k.box(w - 0.24, 0.05, 0.035, wood, 0, 0.16, 0);
    for (const sx of [-1, 1]) k.box(0.035, 0.05, d - 0.275, wood, sx * (w / 2 - 0.1), 0.16, 0);
    // two banker's lamps
    const brass = M.brass();
    const shade = M.ceramic(c.shade);
    for (const x of [-0.5, 0.5]) {
      k.rbox(0.22, 0.02, 0.14, 0.008, brass, x, topY, 0, 1);
      k.tube(
        [
          [x, topY + 0.02, -0.02],
          [x, topY + 0.2, -0.03],
          [x, topY + 0.3, -0.01],
          [x, topY + 0.33, 0.01],
        ],
        0.009,
        brass,
        { seg: 12, radial: 6 },
      );
      const sh = new THREE.CylinderGeometry(0.075, 0.075, 0.34, 12, 1, false, 0, Math.PI);
      sh.rotateZ(Math.PI / 2);
      k.geo(sh, shade, x, topY + 0.325, 0.01);
      const glow = k.box(0.3, 0.004, 0.12, M.glow('#ffe7b8', 1.4, '#fff6e2'), x, topY + 0.322, 0.01);
      glow.castShadow = false;
      k.cyl(0.006, 0.07, brass, x + 0.07, topY + 0.25, 0.03, 0.006, 5);
    }
    // an open book, a closed stack
    const paper = M.paint('#fbfaf5', 0.75);
    const ob = new Kit();
    ob.box(0.36, 0.008, 0.25, M.matte('#52606d'), 0, 0, 0);
    for (const s of [-1, 1]) {
      const pg = ob.box(0.17, 0.014, 0.235, paper, s * 0.088, 0.008, 0);
      pg.rotation.z = -s * 0.07;
      for (let i = 0; i < 6; i++) ob.box(0.12, 0.001, 0.004, M.matte('#8d9199'), s * 0.09, 0.0225 + (s * -0.0) * 0, -0.08 + i * 0.03);
    }
    const og = k.sub(ob, -0.02, topY, 0.24);
    og.rotation.y = 0.12;
    bookStack(k, 0.82, topY, -0.24, 4, 9);
    k.rod([0.2, topY + 0.004, 0.3], [0.33, topY + 0.004, 0.24], 0.004, M.paint('#3f8fd0', 0.4), 0.004, 6);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { w, d } = RT;
      D.rr(ctx, 0, 0, w, d, 0.012, tint(c.wood, 0.4));
      for (const x of [-0.5, 0.5]) {
        D.rr(ctx, x, 0.01, 0.34, 0.15, 0.06, tint(c.shade, 0.35), undefined, LINE_THIN);
        D.rr(ctx, x, 0, 0.22, 0.14, 0.01, null, INK_SOFT, LINE_THIN);
      }
      ctx.save();
      ctx.translate(-0.02, 0.24);
      ctx.rotate(-0.12);
      D.rr(ctx, 0, 0, 0.36, 0.25, 0.006, '#ffffff', undefined, LINE_THIN);
      D.line(ctx, 0, -0.125, 0, 0.125, INK_SOFT, LINE_THIN);
      ctx.restore();
      D.rr(ctx, 0.82, -0.24, 0.24, 0.17, 0.005, tint(BOOK_COLORS[1], 0.4), INK_SOFT, LINE_THIN);
    }),
};

/* ------------------------------------------------------------------ curved reception desk */

const RC = { w: 2.38, d: 1.38, h: 1.37, cz: -0.75, Ro: 1.4, half: 0.96, deskY: 0.74, topY: 1.1, chairZ: -0.36 };

/** ring sector in plan (shape coords: x = world x, y = -world z), bulging towards +Z */
function sector(r0: number, r1: number, half: number = RC.half): THREE.Shape {
  const s = new THREE.Shape();
  const cy = -RC.cz;
  const a0 = -Math.PI / 2 - half;
  const a1 = -Math.PI / 2 + half;
  s.absarc(0, cy, r1, a0, a1, false);
  s.absarc(0, cy, r0, a1, a0, true);
  s.closePath();
  return s;
}

const receptionDesk: FurnitureDef = {
  id: 'reception-desk',
  name: 'דלפק קבלה',
  category: 'public',
  size: { w: RC.w, d: RC.d, h: RC.h },
  colors: [slot('front', 'חזית', PAL.oak), slot('top', 'משטח', '#f1efe9'), slot('seat', 'כיסא', '#3d5166')],
  seats: [{ x: 0, z: RC.chairZ, height: 0.48, facing: 0, kind: 'sit' }],
  // the brass desk bell on the transaction shelf
  interact: [{ kind: 'sfx', sound: 'bell' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { cz, Ro, half, deskY, topY, chairZ } = RC;
    const front = M.wood(c.front);
    const top = M.stone(c.top, 0.3);
    const seg = 14;
    // curved front wall on a recessed plinth, with a light strip
    k.slab(sector(Ro - 0.1, Ro - 0.03, half - 0.01), 0.08, M.matte('#2a2b2d'), 0, 0, 0, 0, seg);
    k.slab(sector(Ro - 0.09, Ro, half), topY - 0.08 - 0.035, front, 0, 0.08, 0, 0, seg);
    k.slab(sector(Ro - 0.005, Ro + 0.006, half - 0.02), 0.03, M.glow('#ffe7b8', 1.0, '#fff6e2'), 0, topY - 0.16, 0, 0, seg).castShadow = false;
    // transaction shelf (high) and work surface (low)
    k.slab(sector(Ro - 0.3, Ro + 0.035, half + 0.012), 0.035, top, 0, topY - 0.035, 0, 0.004, seg);
    k.slab(sector(Ro - 0.62, Ro - 0.09, half), 0.03, M.wood(lighten(c.front, 0.25), 0.5), 0, deskY - 0.03, 0, 0, seg);
    // end panels
    for (const s of [-1, 1]) {
      const a = s * half;
      const rad = Ro - 0.355;
      const m = k.box(0.035, deskY - 0.03, 0.53, front, Math.sin(a) * rad, 0, cz + Math.cos(a) * rad);
      m.rotation.y = a;
      // drawer pedestal on one side
      if (s === 1) {
        const pr = Ro - 0.36;
        const pa = a - 0.2;
        const ped = new Kit();
        ped.box(0.4, deskY - 0.13, 0.46, M.wood(darken(c.front, 0.1)), 0, 0.1, 0);
        for (let i = 0; i < 3; i++) {
          ped.rbox(0.38, 0.165, 0.016, 0.004, front, 0, 0.11 + i * 0.172, -0.236, 1);
          ped.box(0.12, 0.012, 0.012, M.steel(), 0, 0.19 + i * 0.172, -0.25);
        }
        const g = k.sub(ped, Math.sin(pa) * pr, 0, cz + Math.cos(pa) * pr);
        g.rotation.y = pa;
      }
    }
    // on the desk: monitor + keyboard, phone; on the shelf: plant, bell, leaflets
    const P = (ang: number, rad: number): [number, number] => [Math.sin(ang) * rad, cz + Math.cos(ang) * rad];
    const blk = M.plastic('#1d1e21');
    {
      const [x, z] = P(0.22, Ro - 0.3);
      const mon = new Kit();
      mon.rbox(0.2, 0.012, 0.15, 0.005, blk, 0, 0, 0, 1);
      mon.box(0.04, 0.12, 0.012, blk, 0, 0.01, 0.01);
      mon.rbox(0.5, 0.3, 0.018, 0.006, blk, 0, 0.1, 0, 1);
      mon.box(0.48, 0.28, 0.002, M.glow('#bfe3ff', 0.45, '#d9eefc'), 0, 0.11, -0.0095);
      const g = k.sub(mon, x, deskY, z);
      g.rotation.y = 0.22;
      const [kx, kz] = P(0.22, Ro - 0.52);
      const kb = k.rbox(0.38, 0.014, 0.12, 0.005, M.plastic('#e9e9e6'), kx, deskY, kz, 1);
      kb.rotation.y = 0.22;
    }
    {
      const [x, z] = P(-0.3, Ro - 0.4);
      const ph = k.rbox(0.16, 0.04, 0.2, 0.012, blk, x, deskY, z, 1);
      ph.rotation.y = -0.3;
      const hs = k.rbox(0.045, 0.03, 0.19, 0.012, blk, x - 0.05, deskY + 0.035, z + 0.016, 1);
      hs.rotation.y = -0.3;
    }
    {
      const [x, z] = P(-0.62, Ro - 0.13);
      k.cyl(0.06, 0.1, M.ceramic('#f3f1ec'), x, topY, z, 0.07, 14);
      k.sphere(0.11, M.foliage(PAL.leaf), x, topY + 0.17, z, 1, 0.85, 1, 10);
      k.sphere(0.07, M.foliage(PAL.leafLight), x + 0.05, topY + 0.2, z + 0.03, 1, 0.85, 1, 8);
    }
    {
      const [x, z] = P(0.05, Ro - 0.1);
      k.cyl(0.05, 0.008, M.matte('#2a2b2d'), x, topY, z, 0.05, 14);
      k.sphere(0.04, M.brass(), x, topY + 0.008, z, 1, 0.75, 1, 12);
      k.cyl(0.006, 0.014, M.brass(), x, topY + 0.036, z, 0.004, 6);
    }
    {
      const [x, z] = P(0.55, Ro - 0.12);
      const lf = new Kit();
      lf.box(0.12, 0.012, 0.07, M.glass('#e6f4f6', 0.4), 0, 0, 0);
      ['#3f8fd0', '#f2c21b', '#e06a9a'].forEach((col, i) => {
        const p = lf.box(0.105, 0.16, 0.004, M.paint(col, 0.6), 0, 0.01, -0.015 + i * 0.014);
        p.rotation.x = -0.18;
      });
      const g = k.sub(lf, x, topY, z);
      g.rotation.y = 0.55;
    }
    // swivel chair
    const fab = M.fabric(c.seat);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + Math.PI / 2;
      k.rod([Math.cos(a) * 0.04, 0.1, chairZ + Math.sin(a) * 0.04], [Math.cos(a) * 0.27, 0.06, chairZ + Math.sin(a) * 0.27], 0.017, blk, 0.013, 6);
      k.sphere(0.028, M.rubber(), Math.cos(a) * 0.27, 0.028, chairZ + Math.sin(a) * 0.27, 1, 1, 1, 8);
    }
    k.cyl(0.022, 0.3, M.chrome(), 0, 0.09, chairZ, 0.022, 10);
    k.cushion(0.46, 0.08, 0.44, fab, 0, 0.4, chairZ + 0.01, 0.04, 0.012);
    k.rod([0, 0.4, chairZ - 0.17], [0, 0.6, chairZ - 0.25], 0.018, blk, 0.016, 8);
    const back = k.cushion(0.42, 0.4, 0.06, fab, 0, 0.52, chairZ - 0.25, 0.04, 0.0);
    back.rotation.x = -0.1;
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { cz, Ro, half, chairZ } = RC;
      const arc = (r0: number, r1: number, fill: string, lw?: number): void => {
        // plan angle: 0 = +x, +y (canvas) = +z
        ctx.beginPath();
        ctx.arc(0, cz, r1, Math.PI / 2 - half, Math.PI / 2 + half);
        ctx.arc(0, cz, r0, Math.PI / 2 + half, Math.PI / 2 - half, true);
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
        if (lw) ctx.lineWidth = lw;
        ctx.stroke();
      };
      D.rr(ctx, 0, chairZ + 0.01, 0.46, 0.44, 0.07, tint(c.seat, 0.5));
      D.rr(ctx, 0, chairZ - 0.25, 0.42, 0.06, 0.02, tint(c.seat, 0.3), undefined, LINE_THIN);
      arc(Ro - 0.62, Ro - 0.09, tint(lighten(c.front, 0.25), 0.4), LINE_THIN);
      arc(Ro - 0.3, Ro + 0.035, tint(c.top, 0.2));
      const mx = Math.sin(0.22) * (Ro - 0.3);
      const mz = cz + Math.cos(0.22) * (Ro - 0.3);
      ctx.save();
      ctx.translate(mx, mz);
      ctx.rotate(-0.22);
      D.rr(ctx, 0, 0, 0.5, 0.03, 0.005, '#4a4d52', undefined, 0.008);
      D.rr(ctx, 0, -0.22, 0.38, 0.12, 0.01, '#eceef0', undefined, LINE_THIN);
      ctx.restore();
      D.circle(ctx, Math.sin(-0.62) * (Ro - 0.13), cz + Math.cos(-0.62) * (Ro - 0.13), 0.1, tint(PAL.leaf, 0.45), undefined, LINE_THIN);
    }),
};

/* ------------------------------------------------------------------ waiting chairs on a beam */

const WC = { w: 1.74, d: 0.62, h: 0.82, pitch: 0.56, seat: 0.43 };

const waitingChairs: FurnitureDef = {
  id: 'waiting-chairs',
  name: 'שורת כיסאות המתנה',
  category: 'public',
  size: { w: WC.w, d: WC.d, h: WC.h },
  colors: [slot('seat', 'מושבים', '#3f7fb5'), slot('frame', 'מסגרת', '#b9bdc1')],
  seats: [-1, 0, 1].map((i) => ({ x: i * WC.pitch, z: 0.03, height: WC.seat, facing: 0, kind: 'sit' as const })),
  build: ({ colors: c }) => {
    const k = new Kit();
    const { pitch, seat } = WC;
    const frame = M.metal(c.frame, 0.35, 0.9);
    const shell = M.plastic(c.seat);
    // beam on two T legs
    k.rbox(pitch * 2 + 0.5, 0.05, 0.08, 0.008, frame, 0, 0.3, -0.02, 1);
    for (const s of [-1, 1]) {
      const x = s * pitch * 0.5;
      k.rbox(0.05, 0.3, 0.07, 0.008, frame, x, 0.01, -0.02, 1);
      k.rbox(0.055, 0.035, 0.56, 0.01, frame, x, 0, 0, 1);
      for (const sz of [-1, 1]) k.cyl(0.022, 0.012, M.rubber(), x, 0, sz * 0.25, 0.022, 8);
    }
    // moulded shells
    const hw = 0.245;
    const prof: Array<[number, number]> = [
      [-hw, 0.012],
      [-hw + 0.03, -0.018],
      [hw - 0.03, -0.018],
      [hw, 0.012],
      [hw - 0.04, 0.0],
      [-hw + 0.04, 0.0],
    ];
    const path = smoothYZ(
      [
        [-0.285, 0.8],
        [-0.27, 0.7],
        [-0.24, 0.54],
        [-0.2, 0.45],
        [-0.12, seat - 0.006],
        [0.05, seat - 0.004],
        [0.2, seat + 0.008],
        [0.255, seat - 0.012],
        [0.275, seat - 0.05],
      ],
      18,
    );
    const g = sweepYZ(prof, path);
    for (const i of [-1, 0, 1]) {
      k.geo(g, shell, i * pitch, 0, 0.02);
      k.rbox(0.2, 0.07, 0.3, 0.01, frame, i * pitch, 0.35, 0.0, 1);
    }
    // arm rests at both ends
    for (const s of [-1, 1]) {
      const x = s * (pitch + hw + 0.035);
      k.tube(
        [
          [x - s * 0.06, 0.33, -0.02],
          [x, 0.36, -0.03],
          [x, 0.58, -0.1],
          [x, 0.63, -0.04],
          [x, 0.63, 0.18],
        ],
        0.014,
        frame,
        { seg: 14, radial: 6, tension: 0.3 },
      );
      k.rbox(0.045, 0.02, 0.26, 0.008, M.plastic('#26282c'), x, 0.64, 0.06, 1);
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { pitch } = WC;
      D.rr(ctx, 0, -0.02, pitch * 2 + 0.5, 0.08, 0.01, tint(c.frame, 0.4), undefined, LINE_THIN);
      for (const i of [-1, 0, 1]) {
        D.rr(ctx, i * pitch, 0.06, 0.49, 0.48, 0.07, tint(c.seat, 0.4));
        D.rr(ctx, i * pitch, -0.25, 0.47, 0.05, 0.02, tint(c.seat, 0.15), undefined, LINE_THIN);
      }
      for (const s of [-1, 1]) D.rr(ctx, s * (pitch + 0.28), 0.06, 0.045, 0.26, 0.01, '#6a6d72', undefined, LINE_THIN);
    }),
};

/* ------------------------------------------------------------------ cork notice board */

const NB = { w: 1.2, h: 0.9, d: 0.04 };

function paperMat(color: string, kind: 'text' | 'drawing' | 'photo'): THREE.Material {
  return canvasMat(
    `paper|${color}|${kind}`,
    96,
    128,
    (c: C2D, w, h) => {
      c.fillStyle = color;
      c.fillRect(0, 0, w, h);
      if (kind === 'text') {
        c.strokeStyle = 'rgba(40,45,55,0.75)';
        c.lineWidth = 5;
        squiggle(c, 14, 18, 70, 3, 2);
        c.strokeStyle = 'rgba(40,45,55,0.45)';
        c.lineWidth = 3;
        for (let i = 0; i < 7; i++) squiggle(c, 12, 40 + i * 12, 84 - ((i * 17) % 30), 2, 10 + i);
      } else if (kind === 'drawing') {
        c.lineWidth = 4;
        c.strokeStyle = '#e8822a';
        c.beginPath();
        c.arc(70, 26, 11, 0, Math.PI * 2);
        c.stroke();
        c.strokeStyle = '#d8473d';
        c.strokeRect(22, 62, 40, 34);
        c.beginPath();
        c.moveTo(16, 64);
        c.lineTo(42, 40);
        c.lineTo(68, 64);
        c.stroke();
        c.strokeStyle = '#4f9a4a';
        c.lineWidth = 6;
        squiggle(c, 6, 108, 90, 4, 8);
      } else {
        c.fillStyle = '#8fc4e6';
        c.fillRect(8, 8, w - 16, h - 34);
        c.fillStyle = '#f2d03b';
        c.beginPath();
        c.arc(64, 34, 10, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#6fae5a';
        c.beginPath();
        c.moveTo(8, h - 26);
        c.lineTo(8, 78);
        c.quadraticCurveTo(34, 52, 56, 76);
        c.quadraticCurveTo(72, 62, w - 8, 80);
        c.lineTo(w - 8, h - 26);
        c.closePath();
        c.fill();
      }
    },
    { fallback: color, rough: 0.8 },
  );
}

const NB_PAPERS: Array<{ x: number; y: number; w: number; h: number; rot: number; color: string; kind: 'text' | 'drawing' | 'photo'; pin: string }> = [
  { x: -0.4, y: 0.6, w: 0.21, h: 0.28, rot: 0.05, color: '#fbfaf5', kind: 'text', pin: '#d8473d' },
  { x: -0.13, y: 0.64, w: 0.2, h: 0.2, rot: -0.07, color: '#f6e58a', kind: 'text', pin: '#3f8fd0' },
  { x: 0.14, y: 0.58, w: 0.24, h: 0.3, rot: 0.03, color: '#fbfaf5', kind: 'drawing', pin: '#4f9a4a' },
  { x: 0.42, y: 0.62, w: 0.18, h: 0.24, rot: -0.04, color: '#f4c9d6', kind: 'text', pin: '#f2c21b' },
  { x: -0.38, y: 0.26, w: 0.22, h: 0.26, rot: -0.06, color: '#cfe6f6', kind: 'text', pin: '#f2c21b' },
  { x: -0.1, y: 0.28, w: 0.19, h: 0.25, rot: 0.08, color: '#fbfaf5', kind: 'photo', pin: '#d8473d' },
  { x: 0.16, y: 0.22, w: 0.16, h: 0.16, rot: -0.1, color: '#c9ecc0', kind: 'text', pin: '#8a5fb0' },
  { x: 0.4, y: 0.27, w: 0.21, h: 0.28, rot: 0.04, color: '#fbfaf5', kind: 'text', pin: '#3f8fd0' },
];

const noticeBoard: FurnitureDef = {
  id: 'notice-board',
  name: 'לוח מודעות',
  category: 'public',
  size: { w: NB.w, d: NB.d, h: NB.h },
  mount: 'wall',
  elevation: 1.1,
  colors: [slot('frame', 'מסגרת', PAL.oakLight)],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { w, h, d } = NB;
    const frame = M.wood(c.frame);
    const fw = 0.035;
    const zb = -d / 2;
    const cork = speckleMat('#c69a68', ['#a87d4e', '#dab88a', '#8f6a44', '#b88d5c'], 0.95, 2200, 2.5);
    k.box(w - 0.02, h - 0.02, 0.02, cork, 0, 0.01, zb + 0.01);
    k.rbox(w, fw, d, 0.006, frame, 0, 0, 0, 1);
    k.rbox(w, fw, d, 0.006, frame, 0, h - fw, 0, 1);
    for (const s of [-1, 1]) k.rbox(fw, h - 2 * fw, d, 0.006, frame, s * (w / 2 - fw / 2), fw, 0, 1);
    NB_PAPERS.forEach((p, i) => {
      const g = faceGeo(p.w, p.h);
      const z = zb + 0.0215 + i * 0.0006;
      const m = k.geo(g, paperMat(p.color, p.kind), p.x, p.y, z);
      m.rotation.z = p.rot;
      m.castShadow = false;
      const px = p.x - Math.sin(p.rot) * (p.h / 2 - 0.02);
      const py = p.y + Math.cos(p.rot) * (p.h / 2 - 0.02);
      k.sphere(0.009, M.plastic(p.pin), px, py, z + 0.007, 1, 1, 0.8, 8);
    });
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, NB.w, NB.d, 0.004, tint(c.frame, 0.2), undefined, 0.008);
      D.line(ctx, -NB.w / 2 + 0.04, 0, NB.w / 2 - 0.04, 0, '#b88d5c', 0.012);
    }),
};

/* ------------------------------------------------------------------ kindergarten round table */

const KT = { r: 0.45, topY: 0.5 };

const kidsDoodle = (): THREE.Material =>
  canvasMat(
    'kids-doodle',
    128,
    96,
    (c: C2D, w, h) => {
      c.fillStyle = '#fbfaf5';
      c.fillRect(0, 0, w, h);
      c.lineWidth = 4;
      c.strokeStyle = '#f2b824';
      c.beginPath();
      c.arc(98, 22, 11, 0, Math.PI * 2);
      c.stroke();
      c.strokeStyle = '#3f8fd0';
      c.strokeRect(20, 44, 38, 30);
      c.strokeStyle = '#d8473d';
      c.beginPath();
      c.moveTo(14, 46);
      c.lineTo(39, 24);
      c.lineTo(64, 46);
      c.stroke();
      c.strokeStyle = '#4f9a4a';
      c.lineWidth = 5;
      squiggle(c, 6, 84, 122, 4, 5);
      c.beginPath();
      c.arc(92, 56, 11, 0, Math.PI * 2);
      c.stroke();
      c.strokeStyle = '#8a5a3a';
      c.beginPath();
      c.moveTo(92, 67);
      c.lineTo(92, 82);
      c.stroke();
    },
    { fallback: '#fbfaf5', rough: 0.8 },
  );

const CRAYONS = ['#e0483e', '#f2b824', '#3f8fd0', '#4f9a4a', '#8a5fb0', '#e8822a'];

const kidsRoundTable: FurnitureDef = {
  id: 'kids-round-table',
  name: 'שולחן עגול לגן',
  category: 'public',
  size: { w: KT.r * 2, d: KT.r * 2, h: 0.59 },
  colors: [slot('top', 'משטח', '#f2b824'), slot('legs', 'רגליים', PAL.birch)],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { r, topY } = KT;
    const wood = M.wood(c.legs);
    k.lathe(
      [
        [0, topY - 0.032],
        [r - 0.012, topY - 0.032],
        [r - 0.003, topY - 0.026],
        [r, topY - 0.016],
        [r - 0.003, topY - 0.005],
        [r - 0.012, topY],
        [0, topY],
      ],
      M.paint(c.top, 0.5),
      0,
      0,
      0,
      36,
    );
    k.cyl(r - 0.09, 0.05, wood, 0, topY - 0.082, 0, r - 0.09, 28);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      k.rod([Math.cos(a) * 0.37, 0.004, Math.sin(a) * 0.37], [Math.cos(a) * 0.3, topY - 0.04, Math.sin(a) * 0.3], 0.022, wood, 0.03, 10);
    }
    // a drawing in progress, crayons, a pot of crayons
    const sheet = faceGeo(0.3, 0.22);
    sheet.rotateX(-Math.PI / 2);
    const sm = k.geo(sheet, kidsDoodle(), 0.02, topY + 0.0015, 0.12);
    sm.rotation.y = 0.2;
    sm.castShadow = false;
    CRAYONS.forEach((col, i) => {
      const a = -0.6 + i * 0.5;
      const x = -0.18 + i * 0.035;
      const z = -0.03 + (i % 2) * 0.05;
      k.rod([x, topY + 0.007, z], [x + Math.cos(a) * 0.08, topY + 0.007, z + Math.sin(a) * 0.08], 0.006, M.matte(col), 0.006, 6);
    });
    k.cyl(0.04, 0.075, M.plastic('#3f8fd0'), 0.2, topY, -0.17, 0.045, 14);
    CRAYONS.slice(0, 4).forEach((col, i) => {
      k.rod([0.2 + (i - 1.5) * 0.012, topY + 0.01, -0.17], [0.2 + (i - 1.5) * 0.03, topY + 0.088, -0.17 + ((i % 2) - 0.5) * 0.03], 0.006, M.matte(col), 0.005, 6);
    });
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.circle(ctx, 0, 0, KT.r, tint(c.top, 0.4));
      ctx.save();
      ctx.translate(0.02, 0.12);
      ctx.rotate(-0.2);
      D.rr(ctx, 0, 0, 0.3, 0.22, 0.004, '#ffffff', INK_SOFT, LINE_THIN);
      ctx.restore();
      D.circle(ctx, 0.2, -0.17, 0.045, tint('#3f8fd0', 0.4), undefined, LINE_THIN);
      CRAYONS.forEach((col, i) => {
        const a = -0.6 + i * 0.5;
        const x = -0.18 + i * 0.035;
        const z = -0.03 + (i % 2) * 0.05;
        D.line(ctx, x, z, x + Math.cos(a) * 0.08, z + Math.sin(a) * 0.08, col, 0.012);
      });
    }),
};

/* ------------------------------------------------------------------ kindergarten play rug */

const RUG = { r: 1.0, h: 0.014 };
const RUG_COLORS = ['#e8635a', '#f2a03d', '#f2d03b', '#7cc36a', '#4fb6c9', '#5b8fd9', '#9a77d1', '#e87aae'];

function starPts(R: number, r: number, n = 5): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 === 0 ? R : r;
    pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  return pts;
}

const playRug: FurnitureDef = {
  id: 'play-rug',
  name: 'שטיח משחק עגול',
  category: 'public',
  size: { w: RUG.r * 2, d: RUG.r * 2, h: RUG.h },
  walkable: true,
  colors: [slot('rim', 'שוליים', '#3f8fd0'), slot('center', 'מרכז', '#fbf3dc')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { r, h } = RUG;
    const flat = (g: THREE.BufferGeometry, color: string, y: number): void => {
      g.rotateX(-Math.PI / 2);
      planarUV(g);
      const m = k.geo(g, M.fabric(color, 9), 0, y, 0);
      m.castShadow = false;
    };
    // pile edge
    k.cyl(r, h - 0.002, M.fabric(darken(c.rim, 0.1), 9), 0, 0, 0, r, 48);
    flat(new THREE.RingGeometry(0.84, r, 48, 1), c.rim, h);
    RUG_COLORS.forEach((col, i) => flat(new THREE.RingGeometry(0.3, 0.84, 6, 1, (i / 8) * Math.PI * 2, Math.PI / 4), col, h));
    flat(new THREE.CircleGeometry(0.3, 32), c.center, h);
    // dots on the rim and a star in the middle
    for (let i = 0; i < 16; i++) {
      const a = ((i + 0.5) / 16) * Math.PI * 2;
      const g = new THREE.CircleGeometry(0.035, 10);
      g.translate(Math.cos(a) * 0.92, Math.sin(a) * 0.92, 0);
      flat(g, '#fbf3dc', h + 0.0006);
    }
    const star = new THREE.Shape();
    starPts(0.2, 0.09).forEach(([x, y], i) => (i === 0 ? star.moveTo(x, y) : star.lineTo(x, y)));
    star.closePath();
    flat(new THREE.ShapeGeometry(star), '#f2b824', h + 0.0006);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { r } = RUG;
      D.circle(ctx, 0, 0, r, tint(c.rim, 0.4));
      RUG_COLORS.forEach((col, i) => {
        const a0 = (i / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, 0.84, a0, a0 + Math.PI / 4);
        ctx.closePath();
        ctx.fillStyle = tint(col, 0.45);
        ctx.fill();
      });
      D.circle(ctx, 0, 0, 0.84, null, INK_SOFT, LINE_THIN);
      D.circle(ctx, 0, 0, 0.3, tint(c.center, 0.3), INK_SOFT, LINE_THIN);
      D.poly(ctx, starPts(0.2, 0.09), true, tint('#f2b824', 0.3), INK_SOFT, LINE_THIN);
      for (let i = 0; i < 16; i++) {
        const a = ((i + 0.5) / 16) * Math.PI * 2;
        D.circle(ctx, Math.cos(a) * 0.92, Math.sin(a) * 0.92, 0.035, '#ffffff', null);
      }
    }),
};

/* ------------------------------------------------------------------ upright piano */

const PN = { w: 1.5, d: 1.16, h: 1.26, zb: -0.58, bodyD: 0.38, keyY: 0.67, stoolZ: 0.4 };

const keysMat = (): THREE.Material =>
  canvasMat(
    'piano-keys',
    1024,
    32,
    (c: C2D, w, h) => {
      c.fillStyle = '#fbfaf4';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#8f8d86';
      for (let i = 1; i < 52; i++) c.fillRect(Math.round((i * w) / 52) - 1, 0, 2, h);
    },
    { fallback: '#fbfaf4', rough: 0.3 },
  );

const sheetMusic = (): THREE.Material =>
  canvasMat(
    'sheet-music',
    128,
    160,
    (c: C2D, w, h) => {
      c.fillStyle = '#fbfaf4';
      c.fillRect(0, 0, w, h);
      c.strokeStyle = '#3a3d42';
      c.fillStyle = '#26282c';
      const r = rng(15);
      for (let s = 0; s < 5; s++) {
        const y0 = 16 + s * 29;
        c.lineWidth = 1;
        for (let l = 0; l < 5; l++) {
          c.beginPath();
          c.moveTo(10, y0 + l * 3.4);
          c.lineTo(w - 10, y0 + l * 3.4);
          c.stroke();
        }
        for (let n = 0; n < 9; n++) {
          const x = 20 + n * 11.5;
          const y = y0 + Math.floor(r() * 5) * 3.4;
          c.beginPath();
          c.ellipse(x, y, 2.8, 2.1, -0.4, 0, Math.PI * 2);
          c.fill();
          c.lineWidth = 1.2;
          c.beginPath();
          c.moveTo(x + 2.4, y);
          c.lineTo(x + 2.4, y - 11);
          c.stroke();
        }
      }
    },
    { fallback: '#fbfaf4', rough: 0.8 },
  );

const piano: FurnitureDef = {
  id: 'piano',
  name: 'פסנתר',
  category: 'public',
  size: { w: PN.w, d: PN.d, h: PN.h },
  colors: [slot('body', 'גוף', '#1b1b1d'), slot('seat', 'ריפוד', '#26272a')],
  seats: [{ x: 0, z: PN.stoolZ, height: 0.5, facing: Math.PI, kind: 'sit' }],
  interact: [{ kind: 'instrument', instrument: 'piano' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { w, h, zb, bodyD, keyY, stoolZ } = PN;
    const lac = M.ceramic(c.body);
    const zf = zb + bodyD; // front plane of the case
    const iw = w - 0.09;
    // case: cheeks, back, bottom, lower + upper front panels, lid
    for (const s of [-1, 1]) {
      const x = s * (w / 2 - 0.0225);
      k.rbox(0.045, h - 0.03, bodyD, 0.006, lac, x, 0, zb + bodyD / 2, 1);
      // key-bed arm and turned leg
      k.rbox(0.045, 0.17, 0.27, 0.01, lac, x, keyY - 0.07, zf + 0.125, 1);
      k.rbox(0.05, keyY - 0.1, 0.06, 0.012, lac, x, 0.03, zf + 0.2, 1);
      k.rbox(0.055, 0.035, bodyD + 0.26, 0.008, lac, x, 0, zb + (bodyD + 0.26) / 2, 1);
    }
    k.box(iw, h - 0.06, 0.02, M.matte('#2a211b'), 0, 0.02, zb + 0.012);
    k.box(iw, 0.1, bodyD - 0.02, lac, 0, 0, zb + bodyD / 2);
    k.box(iw, keyY - 0.15, 0.02, lac, 0, 0.1, zf - 0.02);
    k.box(iw, h - 0.03 - (keyY + 0.2), 0.02, lac, 0, keyY + 0.2, zf - 0.03);
    k.rbox(w, 0.03, bodyD + 0.03, 0.008, lac, 0, h - 0.03, zb + (bodyD + 0.03) / 2, 1);
    // key bed, keys, fallboard, key slip
    k.box(iw, 0.05, 0.27, lac, 0, keyY - 0.05, zf + 0.125);
    const kw = iw - 0.04;
    k.box(kw, 0.022, 0.15, M.paint('#fbfaf4', 0.3), 0, keyY, zf + 0.165);
    const kt = faceGeo(kw, 0.15);
    kt.rotateX(-Math.PI / 2);
    k.geo(kt, keysMat(), 0, keyY + 0.0225, zf + 0.165).castShadow = false;
    const ebony = M.paint('#141416', 0.25);
    const whiteW = kw / 52;
    for (let i = 0; i < 51; i++) {
      // black keys sit between white keys except after B and E (white index mod 7: A=0)
      const n = i % 7;
      if (n === 1 || n === 4) continue;
      k.box(whiteW * 0.58, 0.012, 0.095, ebony, -kw / 2 + (i + 1) * whiteW, keyY + 0.022, zf + 0.137);
    }
    k.rbox(iw, 0.03, 0.022, 0.006, lac, 0, keyY - 0.008, zf + 0.252, 1);
    const fall = k.box(iw, 0.15, 0.016, lac, 0, keyY + 0.05, zf + 0.06);
    fall.rotation.x = -0.25;
    // music desk with an open score
    k.box(iw * 0.6, 0.02, 0.05, lac, 0, keyY + 0.2, zf + 0.0);
    for (const s of [-1, 1]) {
      const pg = k.geo(faceGeo(0.2, 0.26), sheetMusic(), s * 0.105, keyY + 0.35, zf + 0.004);
      pg.rotation.x = -0.14;
      pg.rotation.y = -s * 0.1;
      pg.castShadow = false;
    }
    // brass pedals
    for (const x of [-0.1, 0, 0.1]) k.rbox(0.03, 0.012, 0.11, 0.005, M.brass(), x, 0.035, zf + 0.03, 1);
    // bench
    const lea = M.leather(c.seat);
    k.cushion(0.66, 0.07, 0.32, lea, 0, 0.43, stoolZ, 0.03, 0.01);
    k.rbox(0.64, 0.05, 0.3, 0.006, lac, 0, 0.385, stoolZ, 1);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.rbox(0.04, 0.385, 0.04, 0.006, lac, sx * 0.28, 0, stoolZ + sz * 0.11, 1);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { w, zb, bodyD, stoolZ } = PN;
      const zf = zb + bodyD;
      D.rr(ctx, 0, stoolZ, 0.66, 0.32, 0.03, tint(c.seat, 0.6));
      D.box(ctx, -w / 2, zb, w / 2, zf + 0.02, 0.01, tint(c.body, 0.55));
      D.box(ctx, -w / 2, zf, w / 2, zf + 0.26, 0.01, tint(c.body, 0.7), undefined, LINE_THIN);
      const kw = w - 0.13;
      D.box(ctx, -kw / 2, zf + 0.09, kw / 2, zf + 0.24, 0, '#ffffff', undefined, 0.008);
      for (let i = 1; i < 52; i++) D.line(ctx, -kw / 2 + (i * kw) / 52, zf + 0.09, -kw / 2 + (i * kw) / 52, zf + 0.24, INK_SOFT, 0.004);
      for (let i = 0; i < 51; i++) {
        const n = i % 7;
        if (n === 1 || n === 4) continue;
        D.line(ctx, -kw / 2 + ((i + 1) * kw) / 52, zf + 0.09, -kw / 2 + ((i + 1) * kw) / 52, zf + 0.185, '#2a2b2e', 0.014);
      }
    }),
};

/* ------------------------------------------------------------------ water cooler */

const waterCooler: FurnitureDef = {
  id: 'water-cooler',
  name: 'מתקן מים',
  category: 'public',
  size: { w: 0.4, d: 0.4, h: 1.43 },
  colors: [slot('body', 'גוף', '#f1f1ee')],
  // the cold (blue) tap nozzle down to the drip-tray grille
  interact: [{ kind: 'water', x: -0.095, y: 0.785, z: 0.17, fall: 0.172, sound: 'tap' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const body = M.plastic(c.body);
    const grey = M.plastic('#b9bdc1');
    const bw = 0.32;
    const bx = -0.035;
    const zc = -0.03;
    k.rbox(bw, 1.0, 0.32, 0.03, body, bx, 0, zc, 2);
    // dispensing niche with two taps and a drip tray
    k.rbox(bw - 0.07, 0.3, 0.02, 0.012, M.plastic('#3a3d42'), bx, 0.6, zc + 0.155, 1);
    k.rbox(bw - 0.08, 0.025, 0.09, 0.008, grey, bx, 0.585, zc + 0.19, 1);
    for (let i = 0; i < 5; i++) k.box(bw - 0.11, 0.003, 0.006, M.matte('#55585d'), bx, 0.61, zc + 0.16 + i * 0.014);
    ([
      [-0.06, '#3f8fd0'],
      [0.06, '#d8473d'],
    ] as Array<[number, string]>).forEach(([dx, col]) => {
      axisCyl(k, 0.014, 0.05, grey, bx + dx, 0.82, zc + 0.185, 'z', 0.014, 8);
      k.cyl(0.01, 0.035, grey, bx + dx, 0.785, zc + 0.2, 0.008, 8);
      k.rbox(0.04, 0.018, 0.05, 0.006, M.plastic(col), bx + dx, 0.835, zc + 0.205, 1);
    });
    // indicator lights + vents
    for (const [dx, col] of [
      [-0.03, '#63d67c'],
      [0.03, '#f2a03d'],
    ] as Array<[number, string]>) {
      k.sphere(0.008, M.glow(col, 1.2, col), bx + dx, 0.95, zc + 0.16, 1, 1, 0.5, 6);
    }
    for (let i = 0; i < 4; i++) k.box(bw - 0.12, 0.008, 0.004, M.matte('#c9ccce'), bx, 0.14 + i * 0.03, zc + 0.161);
    // bottle collar + inverted bottle
    k.cyl(0.12, 0.03, grey, bx, 1.0, zc, 0.1, 20);
    const bottle: Array<[number, number]> = [
      [0.035, 1.0],
      [0.04, 1.05],
      [0.11, 1.1],
      [0.135, 1.13],
      [0.135, 1.2],
      [0.128, 1.21],
      [0.135, 1.22],
      [0.135, 1.3],
      [0.128, 1.31],
      [0.135, 1.32],
      [0.135, 1.39],
      [0.12, 1.42],
      [0, 1.425],
    ];
    k.lathe(bottle, M.glass('#8fc8ee', 0.42), bx, 0, zc, 20).castShadow = false;
    k.lathe(
      [
        [0.03, 1.01],
        [0.1, 1.105],
        [0.126, 1.135],
        [0.126, 1.3],
        [0, 1.3],
      ],
      M.water('#6fb6e6'),
      bx,
      0,
      zc,
      16,
    ).castShadow = false;
    // cup dispenser on the side
    const cx = bx + bw / 2 + 0.04;
    k.cyl(0.036, 0.34, M.glass('#e6f4f6', 0.3), cx, 0.56, zc + 0.05, 0.036, 12).castShadow = false;
    k.cyl(0.03, 0.26, M.paint('#fbfaf5', 0.6), cx, 0.6, zc + 0.05, 0.03, 10);
    k.cyl(0.04, 0.02, grey, cx, 0.9, zc + 0.05, 0.04, 12);
    k.box(0.03, 0.03, 0.05, grey, cx - 0.03, 0.75, zc + 0.05);
    const tip: V3 = [cx, 0.52, zc + 0.05];
    k.cyl(0.024, 0.045, M.paint('#fbfaf5', 0.6), tip[0], tip[1], tip[2], 0.03, 10);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, -0.035, -0.03, 0.32, 0.32, 0.03, tint(c.body, 0.3));
      D.circle(ctx, -0.035, -0.03, 0.135, '#cfe6f6', undefined, LINE_THIN);
      D.rr(ctx, -0.035, 0.16, 0.24, 0.09, 0.008, '#d5d7d9', INK_SOFT, LINE_THIN);
      D.circle(ctx, 0.165, 0.02, 0.036, '#ffffff', undefined, LINE_THIN);
    }),
};

export const PUBLIC_MISC: FurnitureDef[] = [libraryShelf, readingTable, receptionDesk, waitingChairs, noticeBoard, kidsRoundTable, playRug, piano, waterCooler];
