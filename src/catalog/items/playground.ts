import * as THREE from 'three';
import type { FurnitureDef, SeatAnchor } from '../types';
import { D, INK, INK_SOFT, Kit, LINE_THIN, M, PAL, blobGeo, darken, lighten, mesh, roundedRectShape, sym, tint, type V3 } from '../kit';
import { slot } from './_parts';
import { ball, chain, chuteSection, profileX, profileZ, smoothPath, sweepYZ, xcyl, zcyl } from './_sport';

const G_PLAY = 'מגרש משחקים';
const G_POOL = 'בריכה וספא';
const G_FIRE = 'פינת אש וגריל';

const coat = (c: string): THREE.MeshStandardMaterial => M.metal(c, 0.4, 0.55);

/* ================================================================== slides */

/** Slide chute along a [z, y] control polyline (inner surface), returns the smoothed path. */
function chute(k: Kit, ctl: Array<[number, number]>, halfW: number, mat: THREE.Material, n = 22): Array<[number, number]> {
  const path = smoothPath(ctl, n);
  k.geo(sweepYZ(path, chuteSection(halfW, 0.15, 0.014)), mat);
  return path;
}

function pathAction(path: Array<[number, number]>, dz = 0): Array<{ x: number; y: number; z: number }> {
  const idx = [0, Math.round(path.length * 0.2), Math.round(path.length * 0.45), Math.round(path.length * 0.7), Math.round(path.length * 0.88), path.length - 1];
  return idx.map((i) => ({ x: 0, y: +(path[i][1] + 0.01).toFixed(3), z: +(path[i][0] + dz).toFixed(3) }));
}

/** Ladder between two points (centre line), rungs as flat treads. */
function ladder(k: Kit, x0: number, z0: number, y1: number, z1: number, w: number, mat: THREE.Material, steps: number, rung: THREE.Material): void {
  for (const s of [-1, 1]) k.beam([s * (w / 2) + x0, 0.03, z0], [s * (w / 2) + x0, y1, z1], 0.045, 0.07, mat, 0.008);
  for (let i = 1; i <= steps; i++) {
    const t = i / (steps + 1);
    k.rbox(w - 0.04, 0.025, 0.09, 0.006, rung, x0, y1 * t - 0.012, z0 + (z1 - z0) * t, 1);
  }
}

const SLIDE_CTL: Array<[number, number]> = [
  [-0.4, 1.22],
  [-0.22, 1.19],
  [0.15, 0.95],
  [0.72, 0.56],
  [1.1, 0.34],
  [1.3, 0.29],
  [1.44, 0.29],
];
const SLIDE_DZ = -0.15;
const SLIDE_PATH = smoothPath(SLIDE_CTL, 22);

const slide: FurnitureDef = {
  id: 'play-slide',
  name: 'מגלשה עם סולם',
  category: 'outdoor',
  group: G_PLAY,
  tags: ['מגלשה', 'ילדים', 'חצר', 'גן משחקים'],
  size: { w: 0.72, d: 2.62, h: 1.88 },
  colors: [slot('chute', 'מגלשה', '#e9b02b'), slot('frame', 'מסגרת', '#2f7a4f')],
  actions: [{ kind: 'slide', path: pathAction(SLIDE_PATH, SLIDE_DZ) }],
  build: ({ colors: c }) => {
    const root = new Kit();
    const k = new Kit();
    const frame = coat(c.frame);
    const plastic = M.plastic(c.chute);
    chute(k, SLIDE_CTL, 0.24, plastic);
    const P = 1.2;
    // platform with posts and guard rails
    const pz0 = -0.78;
    const pz1 = -0.4;
    for (const sx of [-1, 1]) {
      for (const z of [pz0, pz1]) k.rod([sx * 0.31, 0, z], [sx * 0.31, P + 0.62, z], 0.024, frame, 0.024, 12);
      for (const y of [P + 0.3, P + 0.6]) k.rod([sx * 0.31, y, pz0], [sx * 0.31, y, pz1], 0.016, frame, 0.016, 8);
      // hand grips curving onto the chute
      k.tube([[sx * 0.31, P + 0.6, pz1], [sx * 0.3, P + 0.55, pz1 + 0.15], [sx * 0.27, P + 0.22, pz1 + 0.25]], 0.016, frame, { seg: 10, radial: 6 });
      k.sphere(0.03, M.plastic(c.chute), sx * 0.31, P + 0.64, pz0, 1, 1, 1, 10);
      k.sphere(0.03, M.plastic(c.chute), sx * 0.31, P + 0.64, pz1, 1, 1, 1, 10);
      // chute support legs
      k.rod([sx * 0.22, 0, 0.72], [sx * 0.22, 0.52, 0.72], 0.022, frame, 0.022, 10);
      k.rod([sx * 0.22, 0, 1.35], [sx * 0.22, 0.27, 1.35], 0.022, frame, 0.022, 10);
    }
    xcyl(k, 0.016, 0.62, frame, 0, P + 0.6, pz0, 8);
    k.rbox(0.62, 0.04, pz1 - pz0, 0.01, M.plastic(lighten(c.frame, 0.1)), 0, P - 0.04, (pz0 + pz1) / 2, 1);
    for (let i = 0; i < 4; i++) k.box(0.58, 0.002, 0.006, M.matte(darken(c.frame, 0.2)), 0, P, pz0 + 0.06 + i * 0.09);
    // side guard panels of the platform
    for (const sx of [-1, 1]) k.rbox(0.015, 0.25, pz1 - pz0 - 0.05, 0.006, plastic, sx * 0.31, P + 0.32, (pz0 + pz1) / 2, 1);
    // ladder
    ladder(k, 0, -1.12, P, pz0, 0.52, frame, 4, M.plastic(c.chute));
    root.sub(k, 0, 0, SLIDE_DZ);
    return root.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const dz = SLIDE_DZ;
      D.rr(ctx, 0, (-0.4 + 1.44) / 2 + dz, 0.52, 1.84, 0.12, tint(c.chute, 0.35));
      D.rr(ctx, 0, (-0.4 + 1.44) / 2 + dz, 0.4, 1.72, 0.1, null, INK_SOFT, 0.006);
      D.rr(ctx, 0, -0.59 + dz, 0.66, 0.38, 0.01, tint(c.frame, 0.4));
      for (const s of [-1, 1]) D.line(ctx, s * 0.26, -1.12 + dz, s * 0.26, -0.78 + dz, INK, 0.035);
      for (let i = 1; i <= 4; i++) D.line(ctx, -0.25, -1.12 + dz + (0.34 * i) / 5, 0.25, -1.12 + dz + (0.34 * i) / 5, INK_SOFT, 0.012);
    }),
};

/* ---------------------------------------------------------- climbing frame */

const CLIMB_CTL: Array<[number, number]> = [
  [-0.05, 1.22],
  [0.15, 1.18],
  [0.6, 0.9],
  [1.25, 0.5],
  [1.62, 0.32],
  [1.8, 0.28],
  [1.93, 0.28],
];
const CLIMB_PATH = smoothPath(CLIMB_CTL, 22);

const climber: FurnitureDef = {
  id: 'play-climbing-frame',
  name: 'מתקן טיפוס עם מגלשה וגג',
  category: 'outdoor',
  group: G_PLAY,
  tags: ['מתקן משחק', 'מגלשה', 'קיר טיפוס', 'מגדל', 'ארגז חול'],
  size: { w: 2.04, d: 3.98, h: 2.62 },
  colors: [slot('wood', 'עץ', '#b98a5a'), slot('slide', 'מגלשה', '#2f8a4e'), slot('roof', 'גג בד', '#d9473a'), slot('holds', 'אחיזות', '#f0b52e')],
  actions: [{ kind: 'slide', path: pathAction(CLIMB_PATH) }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const wood = M.wood(c.wood, 0.75);
    const P = 1.2;
    const tz0 = -1.3;
    const tz1 = -0.08;
    const tx = 0.6;
    // posts
    for (const sx of [-1, 1]) for (const z of [tz0, tz1]) k.box(0.09, 2.18, 0.09, wood, sx * tx, 0, z);
    // platform deck
    for (let i = 0; i < 11; i++) k.box(tx * 2 + 0.06, 0.028, 0.1, wood, 0, P - 0.028, tz0 + 0.06 + i * 0.11);
    for (const z of [tz0, tz1]) k.box(tx * 2, 0.12, 0.045, wood, 0, P - 0.15, z);
    // railings: sides (planks) with a window, back rail
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 9; i++) {
        const z = tz0 + 0.12 + i * 0.125;
        if (sx < 0 && i >= 3 && i <= 5) continue; // window on the left
        k.box(0.025, 0.55, 0.09, wood, sx * tx, P, z);
      }
      k.box(0.05, 0.06, tz1 - tz0, wood, sx * tx, P + 0.55, (tz0 + tz1) / 2);
    }
    // front rails beside the slide
    for (const sx of [-1, 1]) {
      k.box(0.3, 0.06, 0.05, wood, sx * 0.43, P + 0.55, tz1);
      k.rod([sx * 0.28, P, tz1], [sx * 0.28, P + 0.55, tz1], 0.02, wood, 0.02, 8);
    }
    // roof: ridge along Z, canvas panels
    const ridgeY = 2.6;
    const eaveY = 2.15;
    k.box(0.06, 0.08, tz1 - tz0 + 0.2, wood, 0, ridgeY - 0.08, (tz0 + tz1) / 2);
    for (const sx of [-1, 1]) {
      const run = Math.hypot(tx + 0.08, ridgeY - eaveY);
      const panel = k.box(run, 0.015, tz1 - tz0 + 0.24, M.fabric(c.roof, 10), sx * (tx + 0.08) / 2, (ridgeY + eaveY) / 2 - 0.05, (tz0 + tz1) / 2);
      panel.rotation.z = -sx * Math.atan2(ridgeY - eaveY, tx + 0.08);
      for (const z of [tz0, tz1]) k.beam([0, ridgeY - 0.05, z], [sx * (tx + 0.04), eaveY - 0.02, z], 0.045, 0.045, wood, 0.006);
    }
    // stripes on the canvas
    // climbing wall at the back
    const wallTop: V3 = [0, P, tz0 - 0.02];
    const wallBot: V3 = [0, 0, tz0 - 0.62];
    const wl = Math.hypot(P, 0.6);
    const ang = Math.atan2(0.6, P);
    const wall = new Kit();
    for (let i = 0; i < 7; i++) wall.box(tx * 2 - 0.1, wl / 7 - 0.01, 0.03, wood, 0, (i * wl) / 7, 0);
    const holdCols = [c.holds, '#3a8bd1', '#e2533f', '#57b05a'];
    for (let i = 0; i < 10; i++) {
      const hx = ((i * 0.37) % 1) * (tx * 2 - 0.3) - (tx - 0.15);
      const hy = 0.12 + (i / 10) * (wl - 0.2);
      wall.sphere(0.04, M.plastic(holdCols[i % 4]), hx, hy, 0.02, 1.2, 0.8, 0.6, 6);
    }
    for (const sx of [-1, 1]) wall.box(0.05, wl, 0.08, wood, sx * (tx - 0.05), 0, -0.04);
    k.sub(wall, 0, wallBot[1], wallBot[2] + 0.03).rotation.x = ang;
    // rope to help climbing
    k.tube([[-0.0, P + 0.5, tz0 + 0.02], [0, P + 0.1, tz0 - 0.15], [0.05, 0.5, tz0 - 0.45], [0.02, 0.05, tz0 - 0.6]], 0.012, M.matte('#d8c7a0'), { seg: 18, radial: 6 });
    // ladder on the right
    for (const sz of [-1, 1]) k.beam([tx + 0.38, 0.03, -0.69 + sz * 0.24], [tx + 0.02, P, -0.69 + sz * 0.24], 0.04, 0.07, wood);
    for (let i = 1; i <= 4; i++) {
      const t = i / 5;
      zcyl(k, 0.018, 0.5, wood, tx + 0.38 - 0.36 * t, P * t, -0.69, 10);
    }
    // fireman's pole on the left
    k.rod([-(tx + 0.36), 0, -0.69], [-(tx + 0.36), 2.0, -0.69], 0.022, M.steel(), 0.022, 12);
    k.beam([-(tx + 0.36), 2.0, -0.69], [-tx, 2.0, -0.69], 0.06, 0.06, wood, 0.006);
    // steering wheel + telescope on the left rail
    k.add(mesh(new THREE.TorusGeometry(0.13, 0.015, 6, 20), M.plastic('#e2533f')), -tx + 0.03, P + 0.4, -0.69).rotation.y = Math.PI / 2;
    xcyl(k, 0.02, 0.06, M.plastic('#e2533f'), -tx + 0.05, P + 0.4, -0.69, 8);
    // sandpit under the tower
    k.box(tx * 2 - 0.1, 0.06, tz1 - tz0 - 0.1, M.matte('#e4d3ab'), 0, 0, (tz0 + tz1) / 2);
    for (const sx of [-1, 1]) k.box(0.035, 0.14, tz1 - tz0, wood, sx * (tx - 0.05), 0, (tz0 + tz1) / 2);
    for (const z of [tz0 + 0.05, tz1 - 0.05]) k.box(tx * 2 - 0.1, 0.14, 0.035, wood, 0, 0, z);
    // slide
    chute(k, CLIMB_CTL, 0.24, M.plastic(c.slide));
    for (const sx of [-1, 1]) {
      k.box(0.06, 0.82, 0.06, wood, sx * 0.24, 0, 0.75);
      k.box(0.06, 0.3, 0.06, wood, sx * 0.24, 0, 1.82);
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const tx = 0.6;
      D.rr(ctx, 0, -0.69, tx * 2 + 0.25, 1.4, 0.01, tint(c.roof, 0.45));
      D.line(ctx, 0, -1.39, 0, 0.01, INK_SOFT, 0.012);
      D.rr(ctx, 0, (-0.05 + 1.93) / 2, 0.52, 1.98, 0.12, tint(c.slide, 0.4));
      D.rr(ctx, 0, -1.6, tx * 2 - 0.1, 0.6, 0.01, tint(c.wood, 0.3));
      D.rr(ctx, tx + 0.2, -0.69, 0.38, 0.52, 0.01, tint(c.wood, 0.35), undefined, LINE_THIN);
      D.circle(ctx, -(tx + 0.36), -0.69, 0.03, '#c9ccce');
    }),
};

/* ================================================================== seesaw */

const SEESAW = { w: 0.62, d: 2.9, h: 0.96 };
const SEESAW_PIVOT = 0.5;

const seesaw: FurnitureDef = {
  id: 'play-seesaw',
  name: 'נדנדת מאזניים',
  category: 'outdoor',
  group: G_PLAY,
  tags: ['נדנדה', 'מאזניים', 'ילדים', 'גן משחקים'],
  size: SEESAW,
  colors: [slot('board', 'קרש', '#c9a777'), slot('frame', 'מסגרת', '#2f6fb7'), slot('seat', 'מושבים', '#e5452f')],
  seats: [
    { x: 0, z: -1.2, height: SEESAW_PIVOT + 0.12, facing: 0, kind: 'sit' },
    { x: 0, z: 1.2, height: SEESAW_PIVOT + 0.12, facing: Math.PI, kind: 'sit' },
  ],
  actions: [{ kind: 'rock', label: 'נדנדה' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const frame = coat(c.frame);
    const py = SEESAW_PIVOT;
    // fulcrum A-frame
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) k.rod([sx * 0.26, 0.02, sz * 0.36], [sx * 0.18, py, 0], 0.028, frame, 0.028, 12);
      k.rod([sx * 0.26, 0.03, -0.36], [sx * 0.26, 0.03, 0.36], 0.022, frame, 0.022, 10);
      k.rbox(0.1, 0.012, 0.1, 0.004, M.steel(), sx * 0.26, 0, 0, 1);
    }
    xcyl(k, 0.035, 0.42, frame, 0, py, 0, 14);
    // rubber bumpers (half-buried tyres)
    for (const sz of [-1, 1]) {
      k.ring(0.15, 0.06, M.rubber(), 0, 0.06, sz * 1.2, 20);
    }
    // rocking board (animated)
    const p = k.part('rock', 0, py, 0);
    p.box(0.08, 0.06, 0.2, M.blackMetal(), 0, -0.03, 0);
    p.rbox(0.26, 0.05, 2.8, 0.012, M.wood(c.board, 0.6), 0, 0.03, 0, 1);
    p.box(0.28, 0.06, 0.08, frame, 0, 0.0, 0);
    for (const sz of [-1, 1]) {
      // moulded seat with a low back
      p.rbox(0.3, 0.035, 0.3, 0.02, M.plastic(c.seat), 0, 0.08, sz * 1.2, 2);
      p.rbox(0.3, 0.12, 0.035, 0.015, M.plastic(c.seat), 0, 0.1, sz * 1.36, 1);
      // handle in front of each seat (towards the centre)
      const hz = sz * 0.95;
      p.tube([[-0.14, 0.08, hz], [-0.13, 0.32, hz], [-0.08, 0.38, hz], [0.08, 0.38, hz], [0.13, 0.32, hz], [0.14, 0.08, hz]], 0.017, frame, { seg: 20, radial: 6 });
      for (const sx of [-1, 1]) p.sphere(0.025, M.plastic(c.seat), sx * 0.11, 0.38, hz, 1.6, 1, 1, 8);
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 0.26, 2.8, 0.02, tint(c.board, 0.3));
      for (const sx of [-1, 1]) D.line(ctx, sx * 0.26, -0.36, sx * 0.26, 0.36, INK_SOFT, 0.03);
      for (const sz of [-1, 1]) {
        D.rr(ctx, 0, sz * 1.22, 0.3, 0.34, 0.03, tint(c.seat, 0.3));
        D.line(ctx, -0.14, sz * 0.95, 0.14, sz * 0.95, INK, 0.03);
      }
    }),
};

/* ================================================================== swings */

type SwingSeat = 'belt' | 'bucket';

/** Belt seat: curved rubber strap (sagging) centred at x = 0, top at y = 0. */
function beltSeat(k: Kit, mat: THREE.Material, y: number): void {
  const w = 0.22;
  const sag = 0.05;
  const s = new THREE.Shape();
  const n = 10;
  for (let i = 0; i <= n; i++) {
    const x = -w + (2 * w * i) / n;
    const yy = -sag * (1 - (x / w) ** 2);
    if (i === 0) s.moveTo(x, yy);
    else s.lineTo(x, yy);
  }
  for (let i = n; i >= 0; i--) {
    const x = -w + (2 * w * i) / n;
    s.lineTo(x, -sag * (1 - (x / w) ** 2) - 0.014);
  }
  k.geo(profileZ(s, 0.15, 0, 4), mat, 0, y, 0);
  // metal end clamps
  for (const sx of [-1, 1]) k.rbox(0.03, 0.03, 0.06, 0.006, M.steel(), sx * w, y - 0.025, 0, 1);
}

/** Toddler bucket seat with leg holes; seat surface at y. */
function bucketSeat(k: Kit, mat: THREE.Material, y: number): void {
  k.rbox(0.36, 0.04, 0.3, 0.02, mat, 0, y - 0.04, 0, 1);
  k.rbox(0.36, 0.3, 0.04, 0.02, mat, 0, y - 0.04, -0.15, 1);
  for (const sx of [-1, 1]) k.rbox(0.04, 0.2, 0.3, 0.02, mat, sx * 0.17, y - 0.04, 0, 1);
  // front guard with two leg holes
  const s = roundedRectShape(0.36, 0.2, 0.04);
  for (const sx of [-1, 1]) s.holes.push(new THREE.Path().absellipse(sx * 0.08, -0.02, 0.055, 0.07, 0, Math.PI * 2, true, 0));
  k.geo(profileZ(s, 0.04, 0, 8), mat, 0, y + 0.06, 0.15);
}

interface SwingOpts {
  id: string;
  name: string;
  tags: string[];
  seats: SwingSeat[];
  frame: string;
  seat: string;
}

function swingFrame(o: SwingOpts): FurnitureDef {
  const n = o.seats.length;
  const pitch = 0.82;
  const w = n * pitch + 0.5;
  const top = 2.05;
  const spread = 0.88;
  const xs = o.seats.map((_, i) => (i - (n - 1) / 2) * pitch);
  const seatY = o.seats.map((t) => (t === 'belt' ? 0.45 : 0.55));
  return {
    id: o.id,
    name: o.name,
    category: 'outdoor',
    group: G_PLAY,
    tags: o.tags,
    size: { w, d: spread * 2 + 0.1, h: top + 0.06 },
    colors: [slot('frame', 'מסגרת', o.frame), slot('seat', 'מושבים', o.seat)],
    seats: xs.map((x, i) => ({ x, z: 0, height: seatY[i], facing: 0, kind: 'sit' as const })),
    actions: [{ kind: 'swing' }],
    build: ({ colors: c }) => {
      const k = new Kit();
      const frame = coat(c.frame);
      const ex = w / 2 - 0.06;
      // A-frame legs, braces and ground anchors
      for (const s of [-1, 1]) {
        for (const sz of [-1, 1]) {
          k.rod([s * (ex - 0.02), 0.014, sz * spread], [s * (ex - 0.08), top, 0], 0.03, frame, 0.03, 12);
          k.rbox(0.1, 0.01, 0.1, 0.004, M.steel(), s * (ex - 0.02), 0, sz * spread, 1);
        }
        k.rod([s * (ex - 0.05), 0.9, -spread * 0.56], [s * (ex - 0.05), 0.9, spread * 0.56], 0.02, frame, 0.02, 10);
        // corner joint
        k.rbox(0.12, 0.12, 0.12, 0.02, M.plastic(darken(c.frame, 0.2)), s * (ex - 0.08), top - 0.07, 0, 1);
      }
      xcyl(k, 0.035, w - 0.02, frame, 0, top, 0, 14);
      const steel = M.steel();
      xs.forEach((x, i) => {
        const p = k.part('swing', x, top, 0);
        const rel = seatY[i] - top;
        const hx = o.seats[i] === 'belt' ? 0.22 : 0.17;
        for (const s of [-1, 1]) {
          p.rbox(0.05, 0.05, 0.08, 0.008, M.blackMetal(), s * hx, -0.07, 0, 1);
          if (o.seats[i] === 'belt') chain(p, [s * hx, -0.07, 0], [s * hx, rel - 0.02, 0], steel, 0.065, 0.014);
          else
            for (const sz of [-1, 1]) chain(p, [s * hx, -0.07, 0], [s * hx, rel + 0.16, sz * 0.13], steel, 0.08, 0.012);
          // plastic chain sleeves where hands grip
          p.rod([s * hx, rel + 0.25, 0], [s * hx, rel + 0.6, 0], 0.012, M.plastic(darken(c.seat, 0.1)), 0.012, 6);
        }
        if (o.seats[i] === 'belt') beltSeat(p, M.rubber(c.seat), rel + 0.01);
        else bucketSeat(p, M.plastic(c.seat), rel);
      });
      return k.g;
    },
    draw2d: (ctx, c) =>
      sym(ctx, () => {
        const ex = w / 2 - 0.06;
        for (const s of [-1, 1]) {
          for (const sz of [-1, 1]) {
            D.line(ctx, s * (ex - 0.02), sz * spread, s * (ex - 0.08), 0, INK_SOFT, 0.04);
            D.rr(ctx, s * (ex - 0.02), sz * spread, 0.1, 0.1, 0.01, tint(c.frame, 0.3), undefined, LINE_THIN);
          }
        }
        D.rr(ctx, 0, 0, w - 0.02, 0.07, 0.03, tint(c.frame, 0.35));
        xs.forEach((x, i) => {
          D.rr(ctx, x, 0, o.seats[i] === 'belt' ? 0.46 : 0.38, o.seats[i] === 'belt' ? 0.15 : 0.32, 0.03, tint(c.seat, 0.3));
          ctx.setLineDash([0.05, 0.04]);
          D.line(ctx, x, -0.7, x, 0.7, INK_SOFT, 0.007);
          ctx.setLineDash([]);
        });
      }),
  };
}

/* ---------------------------------------------------------- tire swing */

const TIRE = { w: 1.9, d: 1.9, h: 2.12 };

const tireSwing: FurnitureDef = {
  id: 'play-tire-swing',
  name: 'נדנדת צמיג',
  category: 'outdoor',
  group: G_PLAY,
  tags: ['נדנדה', 'צמיג', 'ילדים', 'חצר'],
  size: TIRE,
  colors: [slot('frame', 'מסגרת', '#2a6c3f'), slot('tyre', 'צמיג', '#26272a')],
  seats: [{ x: 0, z: 0, height: 0.64, facing: 0, kind: 'sit' }],
  actions: [{ kind: 'swing' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const frame = coat(c.frame);
    const top = 2.06;
    const ex = TIRE.w / 2 - 0.05;
    for (const s of [-1, 1]) {
      for (const sz of [-1, 1]) {
        k.rod([s * ex, 0.015, sz * (TIRE.d / 2 - 0.05)], [s * (ex - 0.07), top, 0], 0.032, frame, 0.032, 12);
        k.rbox(0.1, 0.01, 0.1, 0.004, M.steel(), s * ex, 0, sz * (TIRE.d / 2 - 0.05), 1);
      }
      k.rbox(0.12, 0.12, 0.12, 0.02, M.plastic('#2b2c2f'), s * (ex - 0.07), top - 0.08, 0, 1);
    }
    xcyl(k, 0.04, TIRE.w - 0.08, frame, 0, top - 0.02, 0, 14);
    const p = k.part('swing', 0, top - 0.02, 0);
    const steel = M.steel();
    p.rbox(0.07, 0.06, 0.08, 0.01, M.blackMetal(), 0, -0.09, 0, 1);
    // swivel
    const sy = -0.78;
    p.cyl(0.03, 0.08, M.chrome(), 0, sy - 0.04, 0, 0.03, 12);
    chain(p, [0, -0.09, 0], [0, sy + 0.04, 0], steel, 0.05, 0.016);
    const ty = 0.53 - (top - 0.02);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
      chain(p, [0, sy - 0.04, 0], [Math.cos(a) * 0.36, ty + 0.1, Math.sin(a) * 0.36], steel, 0.05, 0.013);
      p.box(0.03, 0.04, 0.03, M.blackMetal(), Math.cos(a) * 0.36, ty + 0.08, Math.sin(a) * 0.36);
    }
    // the tyre lying flat, with tread blocks
    const tyre = M.rubber(c.tyre);
    p.ring(0.36, 0.11, tyre, 0, ty, 0, 32);
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      const b = p.box(0.03, 0.12, 0.02, M.rubber(darken(c.tyre, 0.3)), Math.cos(a) * 0.468, ty - 0.06, Math.sin(a) * 0.468);
      b.rotation.y = -a;
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const ex = TIRE.w / 2 - 0.05;
      for (const s of [-1, 1]) for (const sz of [-1, 1]) D.line(ctx, s * ex, sz * (TIRE.d / 2 - 0.05), s * (ex - 0.07), 0, INK_SOFT, 0.04);
      D.rr(ctx, 0, 0, TIRE.w - 0.08, 0.08, 0.04, tint(c.frame, 0.35));
      D.circle(ctx, 0, 0, 0.47, tint(c.tyre, 0.5));
      D.circle(ctx, 0, 0, 0.25, '#ffffff', undefined, LINE_THIN);
    }),
};

/* ---------------------------------------------------------- porch swing */

const PORCH = { w: 2.3, d: 1.56, h: 2.22 };

const porchSwing: FurnitureDef = {
  id: 'play-porch-swing',
  name: 'ספסל נדנדה עם גגון',
  category: 'outdoor',
  group: G_PLAY,
  tags: ['ספסל נדנדה', 'גינה', 'מרפסת', 'עץ'],
  size: PORCH,
  colors: [slot('wood', 'עץ', PAL.teak), slot('canopy', 'גגון', '#e7dfcf'), slot('cushion', 'כרית', '#5f7f8f')],
  seats: [
    { x: -0.33, z: 0.04, height: 0.5, facing: 0, kind: 'sit' },
    { x: 0.33, z: 0.04, height: 0.5, facing: 0, kind: 'sit' },
  ],
  actions: [{ kind: 'swing' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const wood = M.wood(c.wood, 0.7);
    const { w, d } = PORCH;
    const top = 2.02;
    const ex = w / 2 - 0.06;
    for (const s of [-1, 1]) {
      for (const sz of [-1, 1]) k.beam([s * ex, 0.03, sz * (d / 2 - 0.06)], [s * (ex - 0.04), top, sz * 0.05], 0.08, 0.08, wood, 0.01);
      k.beam([s * (ex - 0.02), 0.6, -(d / 2 - 0.2)], [s * (ex - 0.02), 0.6, d / 2 - 0.2], 0.06, 0.04, wood, 0.006);
      k.beam([s * (ex - 0.03), 0.03, -(d / 2 - 0.06)], [s * (ex - 0.03), 0.03, d / 2 - 0.06], 0.08, 0.06, wood, 0.006);
    }
    k.beam([-w / 2 + 0.01, top, 0], [w / 2 - 0.01, top, 0], 0.1, 0.12, wood, 0.012);
    // canopy (sloping fabric)
    const can = k.rbox(w - 0.1, 0.012, d * 0.8, 0.004, M.fabric(c.canopy, 10), 0, top + 0.08, 0, 1);
    can.rotation.x = 0.12;
    for (const sz of [-1, 1]) xcyl(k, 0.015, w - 0.12, M.wood(c.wood), 0, top + 0.09 - sz * 0.075, sz * d * 0.39, 8);
    // hanging bench (animated)
    const p = k.part('swing', 0, top - 0.06, 0);
    const steel = M.steel();
    const by = 0.42 - (top - 0.06);
    const bw = 1.4;
    for (const s of [-1, 1]) {
      p.cyl(0.02, 0.05, M.blackMetal(), s * 0.72, -0.05, 0, 0.02, 8);
      for (const sz of [-1, 1]) chain(p, [s * 0.72, -0.05, 0], [s * 0.72, by + 0.25, sz * 0.22], steel, 0.075, 0.013);
      // arms
      p.beam([s * (bw / 2), by + 0.02, 0.23], [s * (bw / 2), by + 0.27, 0.23], 0.05, 0.05, wood, 0.006);
      p.rbox(0.07, 0.03, 0.52, 0.008, wood, s * (bw / 2), by + 0.27, -0.0, 1);
      p.beam([s * (bw / 2), by, -0.24], [s * (bw / 2), by + 0.55, -0.3], 0.05, 0.05, wood, 0.006);
    }
    for (let i = 0; i < 6; i++) p.rbox(bw - 0.04, 0.022, 0.07, 0.006, wood, 0, by, -0.2 + i * 0.083, 1);
    for (let i = 0; i < 3; i++) {
      const m = p.rbox(bw - 0.04, 0.08, 0.022, 0.006, wood, 0, by + 0.16 + i * 0.12, -0.25 - i * 0.015, 1);
      m.rotation.x = -0.12;
    }
    p.box(bw, 0.06, 0.05, wood, 0, by - 0.06, 0.2);
    p.box(bw, 0.06, 0.05, wood, 0, by - 0.06, -0.2);
    p.cushion(bw - 0.1, 0.06, 0.42, M.fabric(c.cushion), 0, by + 0.022, 0.01, 0.03, 0.012);
    for (const s of [-1, 1]) p.pillow(0.36, 0.3, 0.1, M.fabric(lighten(c.cushion, 0.3)), s * 0.4, by + 0.08, -0.17);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { w, d } = PORCH;
      D.rr(ctx, 0, 0, w - 0.1, d * 0.8, 0.02, tint(c.canopy, 0.3));
      for (const s of [-1, 1]) for (const sz of [-1, 1]) D.rr(ctx, s * (w / 2 - 0.06), sz * (d / 2 - 0.06), 0.09, 0.09, 0.01, tint(c.wood, 0.2), undefined, LINE_THIN);
      D.rr(ctx, 0, 0, 1.4, 0.52, 0.03, tint(c.cushion, 0.35));
      D.line(ctx, -0.68, -0.26, 0.68, -0.26, INK, 0.03);
      D.line(ctx, -w / 2 + 0.05, 0, w / 2 - 0.05, 0, INK_SOFT, 0.008);
    }),
};

/* ---------------------------------------------------------- hammock on stand */

const HAM = { w: 3.1, d: 1.1, h: 1.18 };

const hammock: FurnitureDef = {
  id: 'play-hammock-stand',
  name: 'ערסל על מעמד',
  category: 'outdoor',
  group: G_PLAY,
  tags: ['ערסל', 'מנוחה', 'גינה', 'מרפסת'],
  size: HAM,
  colors: [slot('fabric', 'בד', '#d55a3a'), slot('stripe', 'פסים', '#f0e6d2'), slot('frame', 'מעמד', '#2b2c2f')],
  seats: [{ x: 0, z: 0, height: 0.55, facing: Math.PI / 2, kind: 'lie' }],
  actions: [{ kind: 'swing', label: 'להתנדנד בערסל' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const frame = coat(c.frame);
    const { w, d } = HAM;
    const hookX = w / 2 - 0.08;
    const hookY = 1.16;
    // base beam, feet and curved end posts
    k.rbox(1.9, 0.07, 0.08, 0.012, frame, 0, 0.0, 0, 1);
    for (const s of [-1, 1]) {
      k.rbox(0.08, 0.05, d - 0.02, 0.012, frame, s * 0.85, 0, 0, 1);
      for (const sz of [-1, 1]) k.cyl(0.03, 0.012, M.rubber(), s * 0.85, 0, sz * (d / 2 - 0.05), 0.03, 8);
      k.tube([[s * 0.9, 0.05, 0], [s * 1.2, 0.35, 0], [s * 1.42, 0.8, 0], [s * hookX, hookY, 0]], 0.035, frame, { seg: 18, radial: 8 });
      k.cyl(0.012, 0.06, M.chrome(), s * hookX, hookY - 0.06, 0, 0.012, 8);
    }
    // hammock (animated)
    const p = k.part('swing', 0, hookY - 0.05, 0);
    const spX = 0.95;
    const spY = -0.4;
    const rope = M.matte('#e8dfcc');
    for (const s of [-1, 1]) {
      p.cyl(0.015, 0.02, M.chrome(), s * hookX, -0.02, 0, 0.015, 8);
      zcyl(p, 0.018, 0.92, M.wood(PAL.oak), s * spX, spY, 0, 10);
      for (let i = 0; i < 6; i++) {
        const z = -0.42 + (i * 0.84) / 5;
        p.rod([s * hookX, -0.02, 0], [s * spX, spY, z], 0.004, rope, 0.004, 4);
      }
    }
    // striped fabric bed: 5 lengthwise strips
    const sag = 0.24;
    const strips = 5;
    for (let si = 0; si < strips; si++) {
      const z0 = -0.42 + (si * 0.84) / strips;
      const z1 = z0 + 0.84 / strips;
      const g = new THREE.PlaneGeometry(2 * spX, z1 - z0, 16, 2);
      g.rotateX(-Math.PI / 2);
      g.translate(0, 0, (z0 + z1) / 2);
      const pos = g.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const z = pos.getZ(i);
        const ex = 1 - (x / spX) ** 2;
        pos.setY(i, spY - 0.02 - sag * ex + 0.16 * (z / 0.42) ** 2 * ex);
        pos.setZ(i, z * (0.6 + 0.4 * (1 - ex)));
      }
      g.computeVertexNormals();
      p.geo(g, M.cloth(si % 2 === 0 ? c.fabric : c.stripe), 0, 0, 0);
    }
    p.pillow(0.4, 0.1, 0.26, M.fabric(c.stripe), -0.62, spY - 0.17, 0);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { w, d } = HAM;
      D.line(ctx, -w / 2 + 0.08, 0, w / 2 - 0.08, 0, INK_SOFT, 0.05);
      for (const s of [-1, 1]) D.rr(ctx, s * 0.85, 0, 0.08, d - 0.02, 0.02, tint(c.frame, 0.4), undefined, LINE_THIN);
      ctx.beginPath();
      ctx.moveTo(-0.95, -0.42);
      ctx.quadraticCurveTo(0, -0.28, 0.95, -0.42);
      ctx.lineTo(0.95, 0.42);
      ctx.quadraticCurveTo(0, 0.28, -0.95, 0.42);
      ctx.closePath();
      ctx.fillStyle = tint(c.fabric, 0.3);
      ctx.fill();
      ctx.stroke();
      for (const s of [-1, 1]) D.line(ctx, s * 0.95, 0, s * (w / 2 - 0.08), 0, INK_SOFT, 0.006);
    }),
};

/* ---------------------------------------------------------- hanging egg chair */

const EGG = { w: 1.0, d: 1.08, h: 2.01 };

const eggChair: FurnitureDef = {
  id: 'play-hanging-egg-chair',
  name: 'כורסת ביצה תלויה',
  category: 'outdoor',
  group: G_PLAY,
  tags: ['כורסה תלויה', 'ביצה', 'ראטן', 'נדנדה', 'מרפסת'],
  size: EGG,
  colors: [slot('wicker', 'קליעה', '#a98559'), slot('cushion', 'כרית', '#ece6da'), slot('frame', 'מעמד', '#2b2c2f')],
  seats: [{ x: 0, z: 0.04, height: 0.6, facing: 0, kind: 'sit' }],
  actions: [{ kind: 'swing' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const frame = coat(c.frame);
    const baseZ = -0.04;
    // round weighted base + C-arc stand
    k.lathe([[0, 0], [0.48, 0], [0.49, 0.02], [0.44, 0.05], [0, 0.06]], frame, 0, 0, baseZ, 32);
    k.tube(
      [
        [0, 0.05, baseZ - 0.38],
        [0, 0.6, -0.5],
        [0, 1.4, -0.48],
        [0, 1.85, -0.3],
        [0, 1.97, -0.08],
        [0, 1.94, 0.02],
      ],
      0.032,
      frame,
      { seg: 26, radial: 8 },
    );
    k.cyl(0.04, 0.04, frame, 0, 0.04, baseZ - 0.38, 0.034, 12);
    const hy = 1.9;
    k.cyl(0.012, 0.04, M.chrome(), 0, hy, 0.02, 0.012, 8);
    // hanging egg (animated)
    const p = k.part('swing', 0, hy, 0.02);
    chain(p, [0, 0, 0], [0, -0.3, 0], M.steel(), 0.04, 0.014);
    const eggH = 1.12;
    const y0 = 0.4 - hy; // bottom of the egg relative to the pivot
    const prof: Array<[number, number]> = [
      [0.001, 0],
      [0.2, 0.02],
      [0.36, 0.12],
      [0.43, 0.32],
      [0.44, 0.52],
      [0.4, 0.76],
      [0.29, 0.96],
      [0.13, 1.08],
      [0.02, eggH],
    ];
    const wick = M.wicker(c.wicker);
    const lowerPts = prof.slice(0, 4).map(([r, y]) => new THREE.Vector2(r, y));
    const upper = prof.slice(3).map(([r, y]) => new THREE.Vector2(r, y));
    const gap = 2.1;
    const outerLow = new THREE.LatheGeometry(lowerPts, 24);
    const outerUp = new THREE.LatheGeometry(upper, 20, gap / 2, Math.PI * 2 - gap);
    const innerLow = new THREE.LatheGeometry(lowerPts.map((v) => new THREE.Vector2(Math.max(0.001, v.x - 0.03), v.y + 0.02)).reverse(), 24);
    const innerUp = new THREE.LatheGeometry(upper.map((v) => new THREE.Vector2(Math.max(0.001, v.x - 0.03), v.y)).reverse(), 20, gap / 2, Math.PI * 2 - gap);
    for (const g of [outerLow, outerUp, innerLow, innerUp]) p.geo(g, wick, 0, y0, 0);
    // rim along the opening
    const rim: V3[] = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const pr = upper[Math.min(upper.length - 1, Math.floor(t * (upper.length - 1)))];
      void pr;
    }
    for (const s of [-1, 1]) {
      const pts: V3[] = upper.map((v) => [Math.sin(s * (gap / 2)) * (v.x - 0.015), y0 + v.y, Math.cos(gap / 2) * (v.x - 0.015)] as V3);
      p.tube(pts, 0.018, M.wicker(darken(c.wicker, 0.15)), { seg: 16, radial: 6 });
    }
    void rim;
    // cushions
    p.pillow(0.62, 0.12, 0.56, M.linen(c.cushion), 0, y0 + 0.12, 0.02);
    p.pillow(0.5, 0.5, 0.14, M.linen(c.cushion), 0, y0 + 0.28, -0.25);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.circle(ctx, 0, -0.04, 0.48, tint(c.frame, 0.7), INK_SOFT, LINE_THIN);
      D.circle(ctx, 0, 0.02, 0.44, tint(c.wicker, 0.3));
      D.ellipse(ctx, 0, 0.06, 0.3, 0.27, tint(c.cushion, 0.1), undefined, LINE_THIN);
      D.line(ctx, 0, -0.52, 0, -0.02, INK, 0.04);
    }),
};

/* ================================================================== rockers */

const HORSE = { w: 0.34, d: 1.08, h: 0.87 };

const rockingHorse: FurnitureDef = {
  id: 'play-rocking-horse',
  name: 'סוס נדנדה מעץ',
  category: 'kids',
  group: 'צעצועים',
  tags: ['סוס נדנדה', 'צעצוע', 'עץ', 'ילדים'],
  size: HORSE,
  colors: [slot('body', 'גוף', '#f1ece3'), slot('saddle', 'אוכף', '#b3292b'), slot('wood', 'עץ', PAL.oak), slot('mane', 'רעמה', '#4a3427')],
  seats: [{ x: 0, z: -0.06, height: 0.62, facing: 0, kind: 'sit' }],
  actions: [{ kind: 'rock', label: 'לרכוב' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const p = k.part('rock', 0, 0, 0);
    const wood = M.wood(c.wood, 0.5);
    const body = M.paint(c.body, 0.35);
    // bow rockers
    const R = 1.5;
    const L = 0.5;
    const s = new THREE.Shape();
    const n = 16;
    for (let i = 0; i <= n; i++) {
      const z = -L + (2 * L * i) / n;
      const y = R - Math.sqrt(R * R - z * z);
      if (i === 0) s.moveTo(z, y);
      else s.lineTo(z, y);
    }
    for (let i = n; i >= 0; i--) {
      const z = -L + (2 * L * i) / n;
      s.lineTo(z, R - Math.sqrt(R * R - z * z) + 0.055);
    }
    for (const sx of [-1, 1]) p.geo(profileX(s, 0.03, 0.006, 4), wood, sx * 0.15, 0.007, 0);
    for (const z of [-0.4, 0.0, 0.4]) xcyl(p, 0.014, 0.33, wood, 0, R - Math.sqrt(R * R - z * z) + 0.075, z, 8);
    // legs
    const legTop = 0.42;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) p.rod([sx * 0.14, 0.07, sz * 0.32], [sx * 0.07, legTop + 0.06, sz * 0.17], 0.024, body, 0.03, 10);
    }
    // body
    p.sphere(0.15, body, 0, 0.5, -0.02, 0.85, 0.75, 1.75, 16);
    // neck + head silhouette with bevel
    const h = new THREE.Shape();
    h.moveTo(0.06, 0.58);
    h.quadraticCurveTo(0.16, 0.66, 0.24, 0.8);
    h.quadraticCurveTo(0.27, 0.84, 0.31, 0.83);
    h.quadraticCurveTo(0.4, 0.79, 0.49, 0.7);
    h.quadraticCurveTo(0.52, 0.66, 0.49, 0.63);
    h.lineTo(0.4, 0.62);
    h.quadraticCurveTo(0.33, 0.62, 0.3, 0.56);
    h.quadraticCurveTo(0.27, 0.48, 0.22, 0.42);
    h.lineTo(0.1, 0.44);
    h.closePath();
    p.geo(profileX(h, 0.1, 0.03, 6), body, 0, 0, 0);
    // ears
    for (const sx of [-1, 1]) p.rod([sx * 0.022, 0.815, 0.29], [sx * 0.03, 0.838, 0.27], 0.012, body, 0.004, 6);
    // eyes + nostrils
    for (const sx of [-1, 1]) {
      p.sphere(0.013, M.lacquer('#151515'), sx * 0.052, 0.76, 0.36, 1, 1, 1, 8);
      p.sphere(0.007, M.matte('#3a2d28'), sx * 0.03, 0.665, 0.5, 1, 1, 1, 6);
    }
    // dapples
    for (let i = 0; i < 7; i++) {
      const a = i * 1.7;
      p.sphere(0.022, M.paint(darken(c.body, 0.2), 0.4), Math.cos(a) * 0.12, 0.5 + Math.sin(a * 1.3) * 0.05, -0.15 + i * 0.045, 0.2, 1, 1, 8);
    }
    // mane (yarn tufts along the back of the neck) + forelock + tail
    const mane = M.knit(c.mane);
    for (let i = 0; i < 8; i++) {
      const t = i / 7;
      const z = 0.05 + t * 0.2;
      const y = 0.6 + t * 0.21;
      p.sphere(0.042, mane, 0, y + 0.01, z - 0.025, 0.75, 1.1, 0.9, 8);
    }
    p.sphere(0.03, mane, 0, 0.83, 0.33, 0.8, 0.8, 1.1, 8);
    for (let i = 0; i < 6; i++) p.rod([0, 0.55, -0.26], [(i - 2.5) * 0.014, 0.3 + i * 0.01, -0.42 + i * 0.008], 0.016, mane, 0.006, 6);
    // saddle + stirrups
    p.cushion(0.2, 0.025, 0.24, M.leather(c.saddle), 0, 0.6, -0.06, 0.012, 0.006);
    for (const sx of [-1, 1]) {
      p.box(0.006, 0.16, 0.02, M.leather(darken(c.saddle, 0.3)), sx * 0.135, 0.44, -0.04);
      p.add(mesh(new THREE.TorusGeometry(0.022, 0.004, 4, 12), M.brass()), sx * 0.137, 0.42, -0.04).rotation.y = Math.PI / 2;
    }
    // handle peg through the head
    xcyl(p, 0.011, 0.26, wood, 0, 0.7, 0.28, 8);
    for (const sx of [-1, 1]) p.sphere(0.016, wood, sx * 0.13, 0.7, 0.28, 1, 1, 1, 8);
    // reins
    p.tube([[-0.055, 0.66, 0.42], [-0.07, 0.62, 0.3], [0, 0.6, 0.15], [0.07, 0.62, 0.3], [0.055, 0.66, 0.42]], 0.004, M.leather(c.saddle), { seg: 16, radial: 4 });
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      for (const sx of [-1, 1]) D.rr(ctx, sx * 0.15, 0, 0.03, 1.0, 0.01, tint(c.wood, 0.3), undefined, LINE_THIN);
      D.ellipse(ctx, 0, -0.02, 0.13, 0.26, tint(c.body, 0.1));
      D.rr(ctx, 0, 0.31, 0.1, 0.32, 0.04, tint(c.body, 0.1));
      D.rr(ctx, 0, -0.06, 0.2, 0.24, 0.04, tint(c.saddle, 0.3), undefined, LINE_THIN);
      D.line(ctx, -0.13, 0.28, 0.13, 0.28, INK, 0.02);
    }),
};

const SPRING = { w: 0.5, d: 0.98, h: 1.02 };

const springRider: FurnitureDef = {
  id: 'play-spring-rider',
  name: 'קפיץ ברווזון',
  category: 'outdoor',
  group: G_PLAY,
  tags: ['קפיץ', 'ברווז', 'מתקן קפיץ', 'גן משחקים', 'ילדים'],
  size: SPRING,
  colors: [slot('body', 'גוף', '#f0b52e'), slot('accent', 'פרטים', '#e5452f')],
  seats: [{ x: 0, z: -0.08, height: 0.68, facing: 0, kind: 'sit' }],
  actions: [{ kind: 'rock', label: 'לקפץ' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    // anchor plate (static)
    k.cyl(0.25, 0.03, M.stone('#a9a8a4', 0.85), 0, 0, 0, 0.25, 24);
    k.cyl(0.13, 0.012, M.steel(), 0, 0.03, 0, 0.13, 16);
    const p = k.part('rock', 0, 0.03, 0);
    // coil spring
    const pts: V3[] = [];
    const turns = 6;
    const sh = 0.4;
    for (let i = 0; i <= turns * 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      pts.push([Math.cos(a) * 0.1, 0.03 + (i / (turns * 12)) * (sh - 0.06), Math.sin(a) * 0.1]);
    }
    p.tube(pts, 0.017, M.metal('#3a5f9e', 0.35, 0.7), { seg: turns * 14, radial: 6 });
    p.cyl(0.13, 0.02, M.steel(), 0, 0.0, 0, 0.13, 16);
    p.cyl(0.13, 0.02, M.steel(), 0, sh - 0.02, 0, 0.13, 16);
    // pony body: thick bevelled silhouette
    const b = new THREE.Shape();
    b.moveTo(-0.38, 0.6);
    b.quadraticCurveTo(-0.44, 0.7, -0.4, 0.74); // tail root
    b.lineTo(-0.3, 0.72);
    b.quadraticCurveTo(-0.1, 0.62, 0.12, 0.7);
    b.quadraticCurveTo(0.2, 0.82, 0.24, 0.92);
    b.quadraticCurveTo(0.27, 0.99, 0.34, 0.97);
    b.lineTo(0.44, 0.86);
    b.quadraticCurveTo(0.46, 0.81, 0.41, 0.8);
    b.lineTo(0.33, 0.79);
    b.quadraticCurveTo(0.29, 0.66, 0.24, 0.56);
    b.quadraticCurveTo(0.1, 0.42, -0.1, 0.44);
    b.quadraticCurveTo(-0.32, 0.46, -0.38, 0.6);
    const g = profileX(b, 0.2, 0.05, 8);
    g.translate(0, -0.03, 0);
    p.geo(g, M.plastic(c.body), 0, 0, 0);
    p.box(0.08, 0.06, 0.12, M.steel(), 0, sh, 0);
    // saddle, eyes, mane
    p.rbox(0.22, 0.03, 0.26, 0.012, M.plastic(c.accent), 0, 0.62, -0.08, 2);
    for (const sx of [-1, 1]) {
      p.sphere(0.03, M.plastic('#ffffff'), sx * 0.1, 0.86, 0.33, 0.4, 1, 1, 10);
      p.sphere(0.016, M.plastic('#151515'), sx * 0.115, 0.86, 0.34, 0.4, 1, 1, 8);
    }
    for (let i = 0; i < 4; i++) p.sphere(0.04, M.plastic(c.accent), 0, 0.82 + i * 0.03, 0.15 + i * 0.045, 0.7, 1, 1, 8);
    // handles + footrests
    xcyl(p, 0.014, 0.4, M.steel(), 0, 0.82, 0.25, 10);
    for (const sx of [-1, 1]) {
      xcyl(p, 0.022, 0.1, M.plastic(c.accent), sx * 0.18, 0.82, 0.25, 10);
      xcyl(p, 0.016, 0.12, M.plastic(c.accent), sx * 0.15, 0.42, 0.05, 8);
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.circle(ctx, 0, 0, 0.25, tint('#a9a8a4', 0.5));
      D.rr(ctx, 0, 0.03, 0.2, 0.84, 0.08, tint(c.body, 0.3));
      D.rr(ctx, 0, -0.08, 0.22, 0.26, 0.04, tint(c.accent, 0.3), undefined, LINE_THIN);
      D.line(ctx, -0.2, 0.25, 0.2, 0.25, INK, 0.025);
    }),
};

/* ================================================================== merry-go-round */

const MGR = { r: 0.95, h: 1.0 };

const merryGoRound: FurnitureDef = {
  id: 'play-merry-go-round',
  name: 'קרוסלה מסתובבת',
  category: 'outdoor',
  group: G_PLAY,
  tags: ['קרוסלה', 'סחרחרה', 'גן משחקים', 'ילדים'],
  size: { w: MGR.r * 2, d: MGR.r * 2, h: MGR.h },
  colors: [slot('deck', 'משטח', '#e5452f'), slot('bars', 'ידיות', '#f0b52e')],
  actions: [{ kind: 'play', label: 'להסתובב', at: { x: 0, y: 0.23, z: 0.6 } }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { r } = MGR;
    // static bearing pedestal
    k.cyl(0.22, 0.04, M.stone('#a9a8a4', 0.85), 0, 0, 0, 0.2, 20);
    k.cyl(0.08, 0.14, M.blackMetal(), 0, 0.04, 0, 0.08, 14);
    // rotating deck (pivot on the axis)
    const p = k.part('spin', 0, 0, 0, { axis: 'y' });
    p.cyl(r, 0.045, M.metal(c.deck, 0.45, 0.4), 0, 0.18, 0, r, 40);
    p.cyl(r - 0.02, 0.003, M.metal(darken(c.deck, 0.1), 0.6, 0.4), 0, 0.225, 0, r - 0.02, 40);
    p.add(mesh(new THREE.TorusGeometry(r - 0.022, 0.02, 6, 40), M.steel()), 0, 0.2, 0).rotation.x = Math.PI / 2;
    // tread pattern: segments
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      p.beam([Math.cos(a) * 0.12, 0.228, Math.sin(a) * 0.12], [Math.cos(a) * (r - 0.03), 0.228, Math.sin(a) * (r - 0.03)], 0.025, 0.004, M.steel());
    }
    // central post + radial grab bars
    p.cyl(0.05, 0.75, M.metal(c.bars, 0.35, 0.6), 0, 0.22, 0, 0.04, 14);
    p.sphere(0.06, M.metal(c.bars, 0.35, 0.6), 0, 0.98 - 0.06, 0, 1, 1, 1, 12);
    const bars = M.metal(c.bars, 0.35, 0.6);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      p.tube(
        [
          [ca * 0.06, 0.9, sa * 0.06],
          [ca * 0.5, 0.72, sa * 0.5],
          [ca * (r - 0.1), 0.62, sa * (r - 0.1)],
          [ca * (r - 0.08), 0.23, sa * (r - 0.08)],
        ],
        0.019,
        bars,
        { seg: 18, radial: 6 },
      );
      p.rod([ca * 0.5, 0.72, sa * 0.5], [ca * 0.5, 0.23, sa * 0.5], 0.017, bars, 0.017, 8);
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { r } = MGR;
      D.circle(ctx, 0, 0, r - 0.01, tint(c.deck, 0.35));
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
        D.line(ctx, Math.cos(a) * 0.06, Math.sin(a) * 0.06, Math.cos(a) * (r - 0.08), Math.sin(a) * (r - 0.08), c.bars, 0.03);
      }
      D.circle(ctx, 0, 0, 0.06, tint(c.bars, 0.1));
    }),
};

/* ================================================================== playhouse */

const PH = { w: 1.5, d: 1.7, h: 1.85 };

const playhouse: FurnitureDef = {
  id: 'play-wendy-house',
  name: 'בית משחק מעץ',
  category: 'outdoor',
  group: G_PLAY,
  tags: ['בית משחק', 'בקתה', 'ילדים', 'חצר', 'עץ'],
  size: PH,
  colors: [slot('wall', 'קירות', '#a8c6c0'), slot('trim', 'מסגרות', '#f4f1ea'), slot('roof', 'גג', '#8a4b3a'), slot('door', 'דלת', '#e5a13a')],
  actions: [{ kind: 'open', label: 'לפתוח את הדלת' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const wall = M.paint(c.wall, 0.6);
    const trim = M.paint(c.trim, 0.5);
    const bw = 1.24;
    const bd = 1.16;
    const z0 = -PH.d / 2 + 0.02;
    const zF = z0 + bd; // front wall plane
    const eave = 1.2;
    const ridge = 1.68;
    const t = 0.03;
    // floor platform + porch deck
    k.box(bw + 0.04, 0.08, bd + 0.36, M.wood('#9b7a55', 0.8), 0, 0, z0 + (bd + 0.36) / 2 - 0.02);
    for (let i = 0; i < 4; i++) k.box(bw + 0.04, 0.003, 0.006, M.matte('#5e4733'), 0, 0.08, zF + 0.05 + i * 0.08);
    k.box(0.5, 0.06, 0.14, M.wood('#9b7a55', 0.8), -0.2, 0, zF + 0.4);
    // front wall (gable) with door + window holes
    const front = new THREE.Shape();
    front.moveTo(-bw / 2, 0);
    front.lineTo(bw / 2, 0);
    front.lineTo(bw / 2, eave);
    front.lineTo(0, ridge);
    front.lineTo(-bw / 2, eave);
    front.closePath();
    const dx0 = -0.44;
    const dW = 0.48;
    const dH = 0.95;
    front.holes.push(new THREE.Path().moveTo(dx0, 0.0).lineTo(dx0, dH).lineTo(dx0 + dW, dH).lineTo(dx0 + dW, 0.0).lineTo(dx0, 0.0));
    const win = (x: number, y: number, s: number) => new THREE.Path().moveTo(x - s / 2, y - s / 2).lineTo(x - s / 2, y + s / 2).lineTo(x + s / 2, y + s / 2).lineTo(x + s / 2, y - s / 2).lineTo(x - s / 2, y - s / 2);
    front.holes.push(win(0.3, 0.68, 0.32));
    k.geo(profileZ(front, t), wall, 0, 0.08, zF - t / 2);
    // back wall
    const back = new THREE.Shape();
    back.moveTo(-bw / 2, 0);
    back.lineTo(bw / 2, 0);
    back.lineTo(bw / 2, eave);
    back.lineTo(0, ridge);
    back.lineTo(-bw / 2, eave);
    back.closePath();
    k.geo(profileZ(back, t), wall, 0, 0.08, z0 + t / 2);
    // side walls with a window each
    for (const sx of [-1, 1]) {
      const side = new THREE.Shape();
      side.moveTo(z0 + t, 0);
      side.lineTo(zF - t, 0);
      side.lineTo(zF - t, eave);
      side.lineTo(z0 + t, eave);
      side.closePath();
      side.holes.push(win((z0 + zF) / 2, 0.68, 0.34));
      k.geo(profileX(side, t), wall, sx * (bw / 2 - t / 2), 0.08, 0);
      // shutters
      for (const sz of [-1, 1]) k.box(0.012, 0.36, 0.14, M.paint(c.door, 0.5), sx * (bw / 2 + 0.006), 0.58, (z0 + zF) / 2 + sz * 0.26);
      k.box(0.03, 0.03, 0.4, trim, sx * (bw / 2 + 0.01), 0.58 - 0.03, (z0 + zF) / 2);
    }
    // clapboard shadow lines
    const lineM = M.matte(darken(c.wall, 0.18));
    for (let i = 1; i < 10; i++) {
      const y = 0.08 + i * 0.12;
      if (y > eave + 0.05) break;
      for (const sx of [-1, 1]) k.box(0.002, 0.004, bd - 0.08, lineM, sx * (bw / 2 + 0.001), y, (z0 + zF) / 2);
      k.box(0.12 * 0, 0.004, 0.002, lineM, 0, y, zF + 0.001);
      if (!(y < dH + 0.08)) k.box(bw - 0.04, 0.004, 0.002, lineM, 0, y, zF + 0.001);
      else {
        k.box(0.06, 0.004, 0.002, lineM, -bw / 2 + 0.05, y, zF + 0.001);
        if (y < 0.5 || y > 0.86) k.box(0.52, 0.004, 0.002, lineM, 0.32, y, zF + 0.001);
      }
    }
    // corner trims
    for (const sx of [-1, 1]) for (const z of [z0, zF]) k.box(0.05, eave, 0.05, trim, sx * (bw / 2), 0.08, z);
    // window frames + cross bars + flower box
    const frameWin = (x: number, y: number, z: number, s: number) => {
      k.box(s + 0.06, 0.035, 0.04, trim, x, y - s / 2 - 0.035, z);
      k.box(s + 0.06, 0.035, 0.04, trim, x, y + s / 2, z);
      for (const sx of [-1, 1]) k.box(0.035, s, 0.04, trim, x + sx * (s / 2 + 0.0125), y - s / 2, z);
      k.box(0.02, s, 0.015, trim, x, y - s / 2, z);
      k.box(s, 0.02, 0.015, trim, x, y - 0.01, z);
    };
    frameWin(0.3, 0.76, zF + 0.005, 0.32);
    k.box(0.4, 0.08, 0.1, M.paint(c.door, 0.5), 0.3, 0.5, zF + 0.05);
    const flowers = ['#e5452f', '#f0b52e', '#f4f1ea', '#d96aa0'];
    for (let i = 0; i < 6; i++) k.sphere(0.035, M.foliage(i % 2 ? '#4f7d3c' : flowers[i % 4]), 0.16 + i * 0.055, 0.6, zF + 0.05, 1, 1, 1, 8);
    // door (animated) hinged on the left edge of the opening
    const door = k.part('door', dx0 + 0.01, 0.08, zF + 0.01, { open: -1.6 });
    door.rbox(dW - 0.02, dH - 0.01, 0.025, 0.004, M.paint(c.door, 0.45), (dW - 0.02) / 2, 0, 0, 1);
    for (const y of [0.15, 0.55]) door.box(dW - 0.1, 0.3, 0.006, M.paint(darken(c.door, 0.08), 0.45), (dW - 0.02) / 2, y, 0.014);
    door.sphere(0.02, M.brass(), dW - 0.09, 0.48, 0.03, 1, 1, 1, 8);
    k.box(dW + 0.08, 0.04, 0.04, trim, dx0 + dW / 2, 0.08 + dH, zF + 0.01);
    for (const sx of [0, 1]) k.box(0.04, dH, 0.04, trim, dx0 - 0.02 + sx * (dW + 0.04), 0.08, zF + 0.01);
    // roof: two panels with shingles look, ridge cap
    const rx = bw / 2 + 0.12;
    const slope = Math.hypot(rx, ridge - eave + 0.07);
    const ang = Math.atan2(ridge - eave + 0.07, rx);
    const roofD = PH.d - 0.04;
    for (const sx of [-1, 1]) {
      const r = new Kit();
      r.box(slope, 0.03, roofD, M.wood(c.roof, 0.85), 0, 0, 0);
      for (let i = 0; i < 6; i++) r.box(0.012, 0.01, roofD, M.wood(darken(c.roof, 0.2), 0.9), -slope / 2 + 0.06 + i * (slope / 6), 0.03, 0);
      const g = k.sub(r, sx * (rx / 2 - 0.01), (ridge + eave - 0.07) / 2 + 0.08 + 0.02, -0.0);
      g.rotation.z = -sx * ang;
    }
    k.box(0.08, 0.05, roofD + 0.01, M.wood(darken(c.roof, 0.25), 0.8), 0, ridge + 0.08 + 0.03, 0);
    // porch posts
    for (const sx of [-1, 1]) k.box(0.05, eave + 0.02, 0.05, trim, sx * (bw / 2 - 0.02), 0.08, PH.d / 2 - 0.06);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { w, d } = PH;
      D.rr(ctx, 0, 0, w - 0.02, d - 0.02, 0.01, tint(c.roof, 0.45));
      D.line(ctx, 0, -d / 2 + 0.02, 0, d / 2 - 0.02, INK_SOFT, 0.012);
      for (let i = 1; i < 5; i++) for (const s of [-1, 1]) D.line(ctx, s * i * 0.14, -d / 2 + 0.02, s * i * 0.14, d / 2 - 0.02, INK_SOFT, 0.004);
      D.arc(ctx, -0.44, 0.33, 0.46, 0, Math.PI / 2, INK_SOFT, 0.006);
    }),
};

/* ================================================================== climbing dome */

const DOME = { r: 1.2 };

/** Open-ended round bar between two points (no caps: cheap lattice members). */
function bar(k: Kit, a: V3, b: V3, r: number, mat: THREE.Material, seg = 5): void {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const dir = vb.clone().sub(va);
  const m = k.add(mesh(new THREE.CylinderGeometry(r, r, dir.length(), seg, 1, true), mat));
  m.position.copy(va).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
}

const climbingDome: FurnitureDef = {
  id: 'play-climbing-dome',
  name: 'כיפת טיפוס',
  category: 'outdoor',
  group: G_PLAY,
  tags: ['כיפת טיפוס', 'גאודזית', 'גן משחקים', 'ילדים'],
  size: { w: DOME.r * 2 + 0.1, d: DOME.r * 2 + 0.1, h: DOME.r + 0.04 },
  colors: [slot('bars', 'מוטות', '#2f8fc8'), slot('joints', 'מחברים', '#f0b52e')],
  actions: [{ kind: 'play', label: 'לטפס', at: { x: 0, y: 0, z: 0 } }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { r } = DOME;
    const bars = coat(c.bars);
    const joint = M.plastic(c.joints);
    const rings = [
      { e: 0, n: 15, off: 0 },
      { e: 0.42, n: 15, off: 0.5 },
      { e: 0.84, n: 10, off: 0 },
      { e: 1.22, n: 5, off: 0.5 },
    ];
    const pt = (e: number, a: number): V3 => [Math.cos(e) * Math.cos(a) * r, Math.sin(e) * r + 0.03, Math.cos(e) * Math.sin(a) * r];
    const verts: V3[][] = rings.map((ri) => Array.from({ length: ri.n }, (_, i) => pt(ri.e, ((i + ri.off) / ri.n) * Math.PI * 2)));
    const apex: V3 = [0, r + 0.0, 0];
    const rr = 0.022;
    verts.forEach((ring, ri) => {
      // horizontal ring bars
      ring.forEach((p, i) => bar(k, p, ring[(i + 1) % ring.length], rr, bars));
      ring.forEach((p) => k.sphere(0.035, joint, p[0], p[1], p[2], 1, 1, 1, 6));
      const up = verts[ri + 1];
      if (up) {
        // connect every vertex to its two nearest neighbours on the ring above
        ring.forEach((p) => {
          const ds = up.map((q, j) => [Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]), j] as [number, number]).sort((a, b) => a[0] - b[0]);
          for (const [, j] of ds.slice(0, 2)) bar(k, p, up[j], rr, bars);
        });
      } else ring.forEach((p) => bar(k, p, apex, rr, bars));
    });
    k.sphere(0.045, joint, apex[0], apex[1] - 0.005, apex[2], 1, 1, 1, 10);
    // ground feet
    verts[0].forEach((p) => k.cyl(0.04, 0.03, M.steel(), p[0], 0, p[2], 0.04, 8));
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { r } = DOME;
      D.circle(ctx, 0, 0, r, tint(c.bars, 0.6));
      D.circle(ctx, 0, 0, r * Math.cos(0.42), null, INK_SOFT, 0.008);
      D.circle(ctx, 0, 0, r * Math.cos(0.84), null, INK_SOFT, 0.008);
      for (let i = 0; i < 15; i++) {
        const a = (i / 15) * Math.PI * 2;
        D.line(ctx, Math.cos(a) * r * 0.35, Math.sin(a) * r * 0.35, Math.cos(a) * r, Math.sin(a) * r, INK_SOFT, 0.006);
      }
      D.circle(ctx, 0, 0, 0.05, tint(c.joints, 0.1));
    }),
};

/* ================================================================== pools & spa */

const KPOOL = { r: 0.82, h: 0.46 };

const kiddiePool: FurnitureDef = {
  id: 'pool-kiddie',
  name: 'בריכת פעוטות מתנפחת',
  category: 'outdoor',
  group: G_POOL,
  tags: ['בריכה', 'מתנפח', 'פעוטות', 'קיץ', 'מים'],
  size: { w: KPOOL.r * 2, d: KPOOL.r * 2, h: KPOOL.h },
  colors: [slot('ring1', 'טבעת עליונה', '#4fb4e0'), slot('ring2', 'טבעת תחתונה', '#f0b52e')],
  actions: [{ kind: 'water', label: 'להתיז מים', at: { x: 0.52, y: 0.42, z: -0.52 } }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const R = KPOOL.r - 0.1;
    k.disc(R, 0.01, M.plastic(lighten(c.ring1, 0.45)), 0, 0, 0, 32);
    k.ring(R, 0.1, M.plastic(c.ring2), 0, 0.1, 0, 36);
    k.ring(R, 0.1, M.plastic(c.ring1), 0, 0.29, 0, 36);
    // seam lines
    k.ring(R + 0.1, 0.004, M.plastic('#ffffff'), 0, 0.195, 0, 36);
    // water + floating ball
    k.disc(R - 0.02, 0.005, M.water('#8fd0e4'), 0, 0.24, 0, 32);
    ball(k, 'beach', 0.11, -0.28, 0.3, 0.18, { a: '#e2403a', b: '#2f7fd0', c: '#f2c230' });
    // little duck
    k.sphere(0.05, M.plastic('#f3c82a'), 0.25, 0.26, 0.2, 1.2, 0.8, 1, 10);
    k.sphere(0.032, M.plastic('#f3c82a'), 0.29, 0.31, 0.2, 1, 1, 1, 10);
    k.cyl(0.01, 0.02, M.plastic('#e56a2a'), 0.323, 0.3, 0.2, 0.004, 6).rotation.z = -Math.PI / 2;
    // garden-hose sprayer clipped on the rim
    k.tube([[0.66, 0.35, -0.66], [0.6, 0.42, -0.6], [0.53, 0.43, -0.53]], 0.012, M.plastic('#2f8a4e'), { seg: 10, radial: 6 });
    k.cyl(0.02, 0.04, M.plastic('#f0b52e'), 0.52, 0.41, -0.52, 0.015, 8);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const R = KPOOL.r;
      D.circle(ctx, 0, 0, R - 0.01, tint(c.ring1, 0.3));
      D.circle(ctx, 0, 0, R - 0.2, tint('#8fd0e4', 0.4), undefined, LINE_THIN);
      D.circle(ctx, -0.28, 0.18, 0.11, tint('#e2403a', 0.3), undefined, LINE_THIN);
    }),
};

const TUB = { w: 2.06, d: 2.52, h: 0.94 };
const TUB_Z = -0.23;

const hotTub: FurnitureDef = {
  id: 'pool-hot-tub',
  name: 'ג\'קוזי חוץ עם מדרגות',
  category: 'outdoor',
  group: G_POOL,
  tags: ['ג\'קוזי', 'ספא', 'עיסוי', 'מים חמים', 'בריכה'],
  size: TUB,
  colors: [slot('skirt', 'חיפוי עץ', '#6b4f3a'), slot('shell', 'אקריליק', '#e9ecef'), slot('water', 'מים', '#7fc6d8')],
  seats: [
    { x: -0.45, z: TUB_Z - 0.62, height: 0.46, facing: 0, kind: 'sit' },
    { x: 0.45, z: TUB_Z - 0.62, height: 0.46, facing: 0, kind: 'sit' },
    { x: -0.62, z: TUB_Z + 0.2, height: 0.46, facing: Math.PI / 2, kind: 'sit' },
    { x: 0.62, z: TUB_Z + 0.2, height: 0.46, facing: -Math.PI / 2, kind: 'sit' },
  ],
  actions: [{ kind: 'water', label: 'הפעלת מפל', at: { x: 0, y: 0.92, z: TUB_Z - 0.86 } }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const s = 2.06;
    const H = 0.9;
    const cz = TUB_Z;
    const wood = M.wood(c.skirt, 0.75);
    const shell = M.ceramic(c.shell);
    // skirt panels with vertical boards
    for (const sg of [-1, 1]) {
      k.box(s - 0.04, H - 0.04, 0.04, wood, 0, 0, cz + sg * (s / 2 - 0.02));
      k.box(0.04, H - 0.04, s - 0.04, wood, sg * (s / 2 - 0.02), 0, cz);
    }
    const groove = M.matte(darken(c.skirt, 0.35));
    for (let i = 1; i < 16; i++) {
      const o = -s / 2 + (i * s) / 16;
      for (const sg of [-1, 1]) {
        k.box(0.005, H - 0.12, 0.002, groove, o, 0.06, cz + sg * (s / 2 + 0.0005));
        k.box(0.002, H - 0.12, 0.005, groove, sg * (s / 2 + 0.0005), 0.06, cz + o);
      }
    }
    k.box(s, 0.05, s, M.blackMetal(), 0, 0, cz);
    // acrylic rim (rounded rect ring)
    const outer = roundedRectShape(s, s, 0.12);
    outer.holes.push(new THREE.Path().moveTo(-0.86, -0.86).lineTo(-0.86, 0.86).lineTo(0.86, 0.86).lineTo(0.86, -0.86).lineTo(-0.86, -0.86));
    k.slab(outer, 0.05, shell, 0, H - 0.05, cz, 0, 6);
    // interior shell: walls, floor, benches (bench tops visible through the water)
    const inn = 1.72;
    for (const sg of [-1, 1]) {
      k.box(inn, H - 0.2, 0.02, shell, 0, 0.15, cz + sg * (inn / 2 + 0.01));
      k.box(0.02, H - 0.2, inn, shell, sg * (inn / 2 + 0.01), 0.15, cz);
    }
    k.box(inn, 0.02, inn, shell, 0, 0.14, cz);
    k.rbox(inn, 0.3, 0.42, 0.04, shell, 0, 0.15, cz - inn / 2 + 0.21, 1);
    for (const sg of [-1, 1]) k.rbox(0.42, 0.3, inn - 0.9, 0.04, shell, sg * (inn / 2 - 0.21), 0.15, cz + 0.2, 1);
    // lounger in the front corner
    const lng = k.rbox(0.42, 0.06, 0.5, 0.03, shell, 0.6, 0.38, cz + 0.62, 2);
    lng.rotation.x = 0.4;
    // jets
    const jetM = M.chrome();
    for (const [x, z, ry] of [
      [-0.45, -inn / 2, 0],
      [0.45, -inn / 2, 0],
      [-inn / 2, 0.2, Math.PI / 2],
      [inn / 2, 0.2, -Math.PI / 2],
      [-0.2, inn / 2, Math.PI],
    ] as Array<[number, number, number]>) {
      for (const dy of [0.55, 0.68]) {
        const j = k.add(mesh(new THREE.TorusGeometry(0.025, 0.007, 4, 12), jetM), x + Math.sin(ry) * 0.012, dy, cz + z + Math.cos(ry) * 0.012);
        j.rotation.y = ry;
      }
    }
    // water
    const wg = new THREE.PlaneGeometry(inn, inn);
    wg.rotateX(-Math.PI / 2);
    k.geo(wg, M.water(c.water), 0, H - 0.1, cz);
    // headrests, control panel, waterfall spout
    for (const x of [-0.45, 0.45]) k.pillow(0.3, 0.05, 0.14, M.rubber('#2b2c2f'), x, H - 0.02, cz - inn / 2 - 0.08);
    k.rbox(0.18, 0.02, 0.1, 0.01, M.screen('#12202a'), 0.62, H, cz + inn / 2 + 0.07, 1);
    k.rbox(0.3, 0.03, 0.08, 0.01, M.chrome(), 0, H - 0.005, cz - inn / 2 - 0.02, 1);
    // steps
    const stepZ0 = cz + s / 2;
    for (let i = 0; i < 2; i++) {
      const sh = 0.24 * (2 - i);
      const sd = 0.22;
      k.box(0.9, sh, sd, wood, 0, 0, stepZ0 + i * sd + sd / 2);
      k.box(0.9, 0.025, sd, M.wood(lighten(c.skirt, 0.1), 0.7), 0, sh, stepZ0 + i * sd + sd / 2);
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const s = 2.06;
      const cz = TUB_Z;
      D.rr(ctx, 0, cz, s, s, 0.12, tint(c.skirt, 0.45));
      D.rr(ctx, 0, cz, 1.72, 1.72, 0.05, tint(c.water, 0.3));
      D.rr(ctx, 0, cz - 0.65, 1.72, 0.42, 0.04, tint(c.shell, 0.2), INK_SOFT, LINE_THIN);
      for (const sg of [-1, 1]) D.rr(ctx, sg * 0.65, cz + 0.2, 0.42, 0.82, 0.04, tint(c.shell, 0.2), INK_SOFT, LINE_THIN);
      D.rr(ctx, 0, cz + s / 2 + 0.22, 0.9, 0.44, 0.01, tint(c.skirt, 0.3));
      D.line(ctx, -0.45, cz + s / 2 + 0.22, 0.45, cz + s / 2 + 0.22, INK_SOFT, 0.008);
    }),
};

const AGP = { r: 1.82, cz: -0.27 };

const aboveGroundPool: FurnitureDef = {
  id: 'pool-above-ground',
  name: 'בריכה עילית עגולה',
  category: 'outdoor',
  group: G_POOL,
  tags: ['בריכה', 'בריכה עילית', 'שחייה', 'קיץ'],
  size: { w: 3.84, d: 4.4, h: 1.34 },
  colors: [slot('wall', 'דופן', '#d9dcdf'), slot('liner', 'יריעה', '#3f8fc4'), slot('water', 'מים', '#7fc6d8')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { r, cz } = AGP;
    const H = 1.0;
    const wallM = M.metal(c.wall, 0.45, 0.5);
    // outer steel wall
    const wall = new THREE.CylinderGeometry(r, r, H, 40, 1, true);
    k.geo(wall, wallM, 0, H / 2, cz);
    // inner liner (lathe, inward normals: profile from top to bottom)
    k.lathe([[r - 0.012, H - 0.02], [r - 0.012, 0.02], [r - 0.06, 0.004], [0.001, 0.004]], M.plastic(c.liner), 0, 0, cz, 40);
    // water surface
    const wg = new THREE.CircleGeometry(r - 0.02, 48);
    wg.rotateX(-Math.PI / 2);
    k.geo(wg, M.water(c.water), 0, H - 0.17, cz);
    // uprights + top seats
    const n = 14;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.11;
      const x = Math.cos(a) * (r + 0.03);
      const z = cz + Math.sin(a) * (r + 0.03);
      const up = k.box(0.06, H, 0.035, M.metal(lighten(c.wall, 0.08), 0.4, 0.5), x, 0, z);
      up.rotation.y = -a + Math.PI / 2;
      const ft = k.box(0.12, 0.03, 0.14, M.plastic('#e9ebed'), x, 0, z);
      ft.rotation.y = -a;
      const cap = k.box(0.14, 0.04, 0.16, M.plastic('#e9ebed'), Math.cos(a) * (r + 0.0), H + 0.005, cz + Math.sin(a) * r);
      cap.rotation.y = -a;
    }
    // top rail ring
    const rail = new THREE.RingGeometry(r - 0.04, r + 0.06, 40, 1);
    rail.rotateX(-Math.PI / 2);
    k.geo(rail, M.plastic('#e9ebed'), 0, H + 0.02, cz);
    const railSide = new THREE.CylinderGeometry(r + 0.06, r + 0.06, 0.03, 40, 1, true);
    k.geo(railSide, M.plastic('#e9ebed'), 0, H + 0.005, cz);
    // A-frame ladder over the wall at +Z
    const lz = cz + r;
    const steel = M.steel();
    const step = M.plastic('#f4f4f2');
    for (const sx of [-1, 1]) {
      const x = sx * 0.25;
      k.rod([x, 0.012, lz + 0.62], [x, 1.18, lz + 0.03], 0.02, steel, 0.02, 8);
      k.rod([x, 0.012, lz - 0.6], [x, 1.18, lz - 0.03], 0.02, steel, 0.02, 8);
      k.tube([[x, 1.0, lz + 0.42], [x, 1.28, lz + 0.18], [x, 1.28, lz - 0.18], [x, 1.0, lz - 0.42]], 0.018, steel, { seg: 16, radial: 6 });
      k.cyl(0.025, 0.02, M.rubber(), x, 0, lz + 0.62, 0.025, 8);
    }
    for (let i = 1; i <= 3; i++) {
      const t = i / 4;
      k.rbox(0.5, 0.03, 0.12, 0.01, step, 0, 1.18 * t, lz + 0.62 - 0.59 * t, 1);
      k.rbox(0.5, 0.03, 0.12, 0.01, step, 0, 1.18 * t, lz - 0.6 + 0.57 * t, 1);
    }
    k.rbox(0.54, 0.03, 0.2, 0.01, step, 0, 1.17, lz, 1);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { r, cz } = AGP;
      D.circle(ctx, 0, cz, r + 0.06, tint(c.wall, 0.3));
      D.circle(ctx, 0, cz, r - 0.04, tint(c.water, 0.25), undefined, LINE_THIN);
      D.rr(ctx, 0, cz + r, 0.54, 1.24, 0.02, tint('#f4f4f2', 0.0), undefined, LINE_THIN);
      for (let i = 1; i <= 3; i++) {
        D.line(ctx, -0.25, cz + r + 0.62 - 0.15 * i, 0.25, cz + r + 0.62 - 0.15 * i, INK_SOFT, 0.006);
        D.line(ctx, -0.25, cz + r - 0.6 + 0.14 * i, 0.25, cz + r - 0.6 + 0.14 * i, INK_SOFT, 0.006);
      }
    }),
};

const SHOWER = { w: 0.9, d: 0.9, h: 2.27 };

const outdoorShower: FurnitureDef = {
  id: 'pool-outdoor-shower',
  name: 'מקלחת חוץ לבריכה',
  category: 'outdoor',
  group: G_POOL,
  tags: ['מקלחת', 'מקלחת חוץ', 'בריכה', 'נירוסטה'],
  size: SHOWER,
  colors: [slot('deck', 'משטח עץ', PAL.teak), slot('metal', 'מתכת', '#c9ccce')],
  actions: [{ kind: 'water', label: 'להתקלח', at: { x: 0, y: 2.15, z: 0.04 } }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { w, d } = SHOWER;
    const metal = M.brushed(c.metal);
    // teak deck tile
    for (const sx of [-1, 1]) k.box(0.05, 0.035, d, M.wood(darken(c.deck, 0.15), 0.8), sx * (w / 2 - 0.12), 0, 0);
    for (let i = 0; i < 9; i++) k.rbox(w, 0.025, 0.085, 0.006, M.wood(c.deck, 0.7), 0, 0.035, -d / 2 + 0.05 + i * 0.1, 1);
    // column at the back
    const pz = -d / 2 + 0.1;
    k.rbox(0.18, 0.02, 0.18, 0.006, metal, 0, 0.06, pz, 1);
    k.rbox(0.07, 2.2, 0.07, 0.01, metal, 0, 0.06, pz, 1);
    // arm + rain head
    k.rbox(0.05, 0.04, 0.48, 0.01, metal, 0, 2.2, pz + 0.22, 1);
    k.cyl(0.15, 0.015, metal, 0, 2.17, 0.04, 0.15, 28);
    k.cyl(0.14, 0.002, M.matte('#8d9196'), 0, 2.168, 0.04, 0.14, 28);
    // mixer + hand shower + foot tap
    xcyl(k, 0.035, 0.03, metal, 0, 1.1, pz + 0.05, 14).rotation.y = Math.PI / 2;
    zcyl(k, 0.035, 0.03, metal, 0, 1.1, pz + 0.05, 14);
    k.rbox(0.015, 0.09, 0.015, 0.004, metal, 0, 1.08, pz + 0.075, 1);
    k.rbox(0.05, 0.03, 0.05, 0.008, metal, 0, 1.35, pz + 0.06, 1);
    k.rod([0, 1.35, pz + 0.09], [0, 1.58, pz + 0.12], 0.016, metal, 0.022, 10);
    k.tube([[0, 1.3, pz + 0.07], [0.06, 1.0, pz + 0.1], [0.04, 0.7, pz + 0.08], [0.0, 0.9, pz + 0.06]], 0.006, M.chrome(), { seg: 16, radial: 5 });
    k.rod([0, 0.42, pz + 0.04], [0, 0.42, pz + 0.12], 0.01, metal, 0.01, 8);
    k.cyl(0.02, 0.02, metal, 0, 0.42, pz + 0.07, 0.02, 10);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { w, d } = SHOWER;
      D.rr(ctx, 0, 0, w, d, 0.01, tint(c.deck, 0.35));
      for (let i = 1; i < 9; i++) D.line(ctx, -w / 2, -d / 2 + i * 0.1, w / 2, -d / 2 + i * 0.1, INK_SOFT, 0.004);
      D.circle(ctx, 0, 0.04, 0.15, tint(c.metal, 0.2));
      D.rr(ctx, 0, -d / 2 + 0.1, 0.07, 0.07, 0.01, tint(c.metal, 0.0));
      D.line(ctx, 0, -d / 2 + 0.14, 0, -0.11, INK, 0.03);
    }),
};

const FOUNT = { w: 1.5, d: 1.5, h: 1.66 };

const fountain: FurnitureDef = {
  id: 'pool-garden-fountain',
  name: 'מזרקת אבן בשלוש קומות',
  category: 'outdoor',
  group: G_POOL,
  tags: ['מזרקה', 'אבן', 'גינה', 'מים', 'קלאסי'],
  size: FOUNT,
  colors: [slot('stone', 'אבן', '#d6d0c4'), slot('water', 'מים', '#8fc9d6')],
  actions: [{ kind: 'water', label: 'הפעלת מזרקה', at: { x: 0, y: 1.62, z: 0 } }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const stone = M.stone(c.stone, 0.85);
    const water = M.water(c.water);
    // lower basin (outer wall + inner bowl)
    k.lathe(
      [
        [0.001, 0],
        [0.74, 0],
        [0.75, 0.05],
        [0.72, 0.08],
        [0.72, 0.34],
        [0.75, 0.37],
        [0.75, 0.42],
        [0.66, 0.42],
        [0.66, 0.12],
        [0.001, 0.12],
      ],
      stone,
      0,
      0,
      0,
      40,
    );
    k.disc(0.66, 0.005, water, 0, 0.34, 0, 40);
    // pedestal column
    k.lathe(
      [
        [0.001, 0.12],
        [0.2, 0.12],
        [0.2, 0.2],
        [0.14, 0.26],
        [0.1, 0.45],
        [0.12, 0.6],
        [0.09, 0.7],
        [0.14, 0.78],
        [0.001, 0.78],
      ],
      stone,
      0,
      0,
      0,
      20,
    );
    // middle bowl
    k.lathe(
      [
        [0.001, 0.76],
        [0.14, 0.76],
        [0.3, 0.84],
        [0.42, 0.95],
        [0.44, 0.99],
        [0.4, 0.99],
        [0.28, 0.92],
        [0.001, 0.9],
      ],
      stone,
      0,
      0,
      0,
      32,
    );
    k.disc(0.38, 0.004, water, 0, 0.955, 0, 28);
    // upper column + bowl
    k.lathe(
      [
        [0.001, 0.9],
        [0.08, 0.9],
        [0.05, 1.05],
        [0.07, 1.15],
        [0.05, 1.22],
        [0.001, 1.22],
      ],
      stone,
      0,
      0,
      0,
      16,
    );
    k.lathe(
      [
        [0.001, 1.2],
        [0.08, 1.2],
        [0.18, 1.27],
        [0.24, 1.34],
        [0.22, 1.35],
        [0.15, 1.3],
        [0.001, 1.29],
      ],
      stone,
      0,
      0,
      0,
      24,
    );
    k.disc(0.2, 0.004, water, 0, 1.32, 0, 24);
    // finial / spout
    k.lathe(
      [
        [0.001, 1.29],
        [0.05, 1.29],
        [0.03, 1.4],
        [0.05, 1.48],
        [0.03, 1.56],
        [0.015, 1.62],
        [0.001, 1.66],
      ],
      stone,
      0,
      0,
      0,
      14,
    );
    // water curtains falling from the bowls
    for (const [r, y0, y1] of [
      [0.43, 0.99, 0.36],
      [0.235, 1.34, 0.97],
    ] as Array<[number, number, number]>) {
      const curtain = new THREE.CylinderGeometry(r, r + 0.02, y0 - y1, 28, 1, true);
      const m = k.geo(curtain, M.glass(lighten(c.water, 0.3), 0.18), 0, (y0 + y1) / 2, 0);
      m.castShadow = false;
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.circle(ctx, 0, 0, 0.75, tint(c.stone, 0.3));
      D.circle(ctx, 0, 0, 0.66, tint(c.water, 0.3), undefined, LINE_THIN);
      D.circle(ctx, 0, 0, 0.44, tint(c.stone, 0.2), undefined, LINE_THIN);
      D.circle(ctx, 0, 0, 0.24, tint(c.stone, 0.1), undefined, LINE_THIN);
      D.circle(ctx, 0, 0, 0.05, tint(c.stone, 0.0), undefined, LINE_THIN);
    }),
};

/* ================================================================== fire & grill */

const FIRE = { w: 2.36, d: 2.36 };
const FIRE_SEAT_R = 1.18;
const FIRE_SEATS: SeatAnchor[] = [0, 1, 2, 3].map((i) => {
  const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
  const x = Math.cos(a) * FIRE_SEAT_R;
  const z = Math.sin(a) * FIRE_SEAT_R;
  return { x: +x.toFixed(3), z: +z.toFixed(3), height: 0.42, facing: +Math.atan2(-x, -z).toFixed(4), kind: 'sit' as const };
});

const firePit: FurnitureDef = {
  id: 'fire-pit-stones',
  name: 'בור אש עם אבני ישיבה',
  category: 'outdoor',
  group: G_FIRE,
  tags: ['מדורה', 'בור אש', 'אבנים', 'קמפינג', 'ערב'],
  size: { w: FIRE.w, d: FIRE.d, h: 0.44 },
  colors: [slot('stone', 'אבנים', '#9c958a'), slot('seat', 'אבני ישיבה', '#b5ab9c')],
  seats: FIRE_SEATS,
  actions: [{ kind: 'fire', label: 'להדליק מדורה', at: { x: 0, y: 0.12, z: 0 } }],
  build: ({ colors: c }) => {
    const k = new Kit();
    // gravel bed
    k.disc(0.62, 0.02, M.stone('#8a857c', 0.95), 0, 0, 0, 28);
    // stone ring, two courses
    const n = 11;
    for (let course = 0; course < 2; course++) {
      for (let i = 0; i < n; i++) {
        const a = ((i + course * 0.5) / n) * Math.PI * 2;
        const g = blobGeo(0.12, 1, i * 7 + course * 31 + 3, 0.22, 2.2);
        const m = k.geo(g, M.stone(i % 3 === 0 ? darken(c.stone, 0.1) : c.stone, 0.9), Math.cos(a) * 0.5, 0.1 + course * 0.13, Math.sin(a) * 0.5);
        m.scale.set(1.15, 0.62, 0.95);
        m.rotation.y = -a;
      }
    }
    // ash + charred logs + embers
    k.disc(0.38, 0.02, M.matte('#3b3735'), 0, 0.02, 0, 20);
    const bark = M.bark('#4a3a2e');
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.3;
      k.rod([Math.cos(a) * 0.3, 0.05, Math.sin(a) * 0.3], [Math.cos(a) * 0.04, 0.2, Math.sin(a) * 0.04], 0.04, bark, 0.035, 8);
    }
    k.sphere(0.12, M.glow('#ff6a1a', 1.6, '#3a1a0a'), 0, 0.04, 0, 1.6, 0.35, 1.6, 12);
    for (let i = 0; i < 6; i++) {
      const a = i * 1.1;
      k.sphere(0.03, M.glow('#ff8c2a', 1.2, '#2a1508'), Math.cos(a) * 0.18, 0.045, Math.sin(a) * 0.18, 1.2, 0.6, 1, 6);
    }
    // seating boulders with flat tops
    FIRE_SEATS.forEach((s, i) => {
      const g = blobGeo(0.28, 1, 50 + i * 13, 0.12, 1.4);
      const pos = g.getAttribute('position') as THREE.BufferAttribute;
      for (let j = 0; j < pos.count; j++) {
        if (pos.getY(j) > 0.15) pos.setY(j, 0.15 + (pos.getY(j) - 0.15) * 0.1);
        if (pos.getY(j) < -0.24) pos.setY(j, -0.24);
      }
      g.computeVertexNormals();
      const m = k.geo(g, M.stone(c.seat, 0.85), s.x, 0.255, s.z);
      m.scale.set(1.1, 1.05, 0.95);
      m.rotation.y = i * 0.8;
    });
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.circle(ctx, 0, 0, 0.64, tint(c.stone, 0.35));
      D.circle(ctx, 0, 0, 0.38, tint('#3b3735', 0.4), undefined, LINE_THIN);
      for (let i = 0; i < 11; i++) {
        const a = (i / 11) * Math.PI * 2;
        D.circle(ctx, Math.cos(a) * 0.5, Math.sin(a) * 0.5, 0.11, tint(c.stone, 0.25), undefined, 0.006);
      }
      D.circle(ctx, 0, 0, 0.1, tint('#ff6a1a', 0.3), null);
      for (const s of FIRE_SEATS) D.ellipse(ctx, s.x, s.z, 0.3, 0.26, tint(c.seat, 0.35), undefined, LINE_THIN, Math.atan2(s.z, s.x));
    }),
};

const KETTLE = { w: 0.98, d: 0.66, h: 0.95 };

const kettleBbq: FurnitureDef = {
  id: 'bbq-kettle',
  name: 'גריל פחמים כדורי',
  category: 'outdoor',
  group: G_FIRE,
  tags: ['גריל', 'מנגל', 'פחמים', 'על האש', 'ברביקיו'],
  size: KETTLE,
  colors: [slot('enamel', 'אמייל', '#1f2022'), slot('handle', 'ידיות', '#2b2c2f')],
  actions: [{ kind: 'cook', label: 'לצלות', at: { x: -0.16, y: 0.72, z: 0 } }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const enamel = M.lacquer(c.enamel);
    const steel = M.steel();
    const cx = -0.16;
    const rimY = 0.7;
    const R = 0.285;
    // bowl
    k.lathe(smoothArc(R, 0.24, 10), enamel, cx, rimY - 0.24, 0, 20);
    k.lathe(smoothArc(R - 0.008, 0.232, 10).map(([r, y]) => [r, y + 0.01] as [number, number]).reverse(), M.matte('#2a2726'), cx, rimY - 0.24, 0, 20);
    k.ring(R, 0.006, enamel, cx, rimY, 0, 32);
    // charcoal glow below the grate
    k.disc(R - 0.08, 0.04, M.glow('#ff5a1a', 0.9, '#2a1a12'), cx, rimY - 0.14, 0, 18);
    // cooking grate + food
    k.ring(R - 0.02, 0.004, steel, cx, rimY - 0.03, 0, 28);
    for (let i = -5; i <= 5; i++) {
      const z = i * 0.048;
      const half = Math.sqrt(Math.max(0, (R - 0.02) ** 2 - z * z));
      k.rod([cx - half, rimY - 0.03, z], [cx + half, rimY - 0.03, z], 0.003, steel, 0.003, 4);
    }
    for (let i = 0; i < 3; i++) {
      k.rod([cx - 0.12, rimY - 0.01, -0.12 + i * 0.05], [cx + 0.02, rimY - 0.01, -0.13 + i * 0.05], 0.014, M.leather('#8a3d23'), 0.014, 8);
    }
    for (let i = 0; i < 2; i++) k.cyl(0.05, 0.018, M.leather('#5c3322'), cx + 0.1, rimY - 0.025, -0.06 + i * 0.13, 0.048, 12);
    // side handles
    for (const s of [-1, 1]) {
      k.rbox(0.1, 0.02, 0.02, 0.006, M.wood(c.handle), cx, rimY - 0.06, s * (R + 0.035), 1);
      for (const dx of [-0.04, 0.04]) k.rod([cx + dx, rimY - 0.06, s * R], [cx + dx, rimY - 0.05, s * (R + 0.03)], 0.004, steel, 0.004, 4);
    }
    // legs, ash catcher, lower rack, wheels
    const legs = [0, 1, 2].map((i) => (i / 3) * Math.PI * 2 + Math.PI / 2);
    legs.forEach((a, i) => {
      const top: V3 = [cx + Math.cos(a) * 0.17, rimY - 0.2, Math.sin(a) * 0.17];
      const bot: V3 = [cx + Math.cos(a) * 0.29, 0.05, Math.sin(a) * 0.29];
      k.rod(top, [bot[0], i < 2 ? 0.08 : 0.02, bot[2]], 0.012, steel, 0.012, 8);
      if (i < 2) {
        zcyl(k, 0.075, 0.03, M.rubber(), bot[0], 0.075, bot[2] + (bot[2] > 0 ? 0.02 : -0.02), 16);
        zcyl(k, 0.035, 0.032, M.plastic('#3a3c40'), bot[0], 0.075, bot[2] + (bot[2] > 0 ? 0.02 : -0.02), 10);
      } else k.cyl(0.015, 0.02, M.plastic('#2b2c2f'), bot[0], 0, bot[2], 0.015, 8);
    });
    k.lathe([[0.001, 0], [0.12, 0], [0.14, 0.07], [0.135, 0.07], [0.115, 0.006], [0.001, 0.006]], M.brushed('#b9bcbf'), cx, 0.2, 0, 18);
    k.ring(0.24, 0.004, steel, cx, 0.24, 0, 24);
    // lid hanging on the side hook
    k.rbox(0.03, 0.18, 0.06, 0.006, steel, cx + R + 0.03, rimY - 0.12, 0, 1);
    const lid = new Kit();
    lid.lathe(smoothArc(R + 0.005, 0.22, 10), enamel, 0, 0, 0, 20);
    lid.lathe(smoothArc(R - 0.003, 0.212, 8).reverse(), M.matte('#2a2726'), 0, 0, 0, 20);
    lid.cyl(0.05, 0.012, M.brushed('#b9bcbf'), 0, 0.215, 0, 0.05, 14);
    lid.rbox(0.14, 0.022, 0.025, 0.008, M.wood(c.handle), 0, 0.28, 0, 1);
    for (const dx of [-0.05, 0.05]) lid.rod([dx, 0.22, 0], [dx, 0.285, 0], 0.005, steel, 0.005, 4);
    const lg = k.sub(lid, cx + R + 0.065, rimY - 0.04, 0);
    lg.rotation.z = -Math.PI / 2;
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const cx = -0.16;
      D.circle(ctx, cx, 0, 0.285, tint(c.enamel, 0.55));
      for (let i = -6; i <= 6; i += 2) D.line(ctx, cx - Math.sqrt(0.265 ** 2 - (i * 0.04) ** 2), i * 0.04, cx + Math.sqrt(0.265 ** 2 - (i * 0.04) ** 2), i * 0.04, INK_SOFT, 0.005);
      D.rr(ctx, cx + 0.38, 0, 0.12, 0.56, 0.05, tint(c.enamel, 0.45));
      for (const s of [-1, 1]) D.rr(ctx, cx, s * 0.32, 0.1, 0.02, 0.005, tint(c.handle, 0.3), undefined, LINE_THIN);
    }),
};

/** Quarter-circle-ish bowl profile [r, y] from the bottom centre up to the rim (radius R, depth h). */
function smoothArc(R: number, h: number, n: number): Array<[number, number]> {
  const out: Array<[number, number]> = [[0.001, 0]];
  for (let i = 1; i <= n; i++) {
    const a = (i / n) * (Math.PI / 2);
    out.push([Math.sin(a) * R, (1 - Math.cos(a)) * h]);
  }
  return out;
}

const OVEN = { w: 1.2, d: 1.2, h: 1.77 };

const pizzaOven: FurnitureDef = {
  id: 'fire-pizza-oven',
  name: 'טאבון לפיצה על בסיס בנוי',
  category: 'outdoor',
  group: G_FIRE,
  tags: ['טאבון', 'פיצה', 'תנור עצים', 'בנוי', 'גינה'],
  size: OVEN,
  colors: [slot('dome', 'כיפה', '#d8c9b0'), slot('brick', 'לבנים', '#b0644a'), slot('base', 'בסיס', '#a9a39a')],
  actions: [{ kind: 'fire', label: 'להבעיר את הטאבון', at: { x: 0, y: 0.95, z: 0.12 } }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const base = M.stone(c.base, 0.85);
    const brick = M.clay(c.brick);
    const { w, d } = OVEN;
    const bh = 0.82;
    // U-shaped block base with firewood store
    for (const sx of [-1, 1]) k.box(0.18, bh, d - 0.08, base, sx * (w / 2 - 0.13), 0, -0.02);
    k.box(w - 0.4, bh, 0.15, base, 0, 0, -d / 2 + 0.115);
    for (let i = 0; i < 5; i++) for (const sx of [-1, 1]) k.box(0.185, 0.004, d - 0.07, M.matte(darken(c.base, 0.25)), sx * (w / 2 - 0.13), 0.16 * (i + 1), -0.02);
    const bark = M.bark('#6d5544');
    for (let row = 0; row < 3; row++) for (let i = 0; i < 4 - (row % 2); i++) zcyl(k, 0.055, 0.6, bark, -0.18 + i * 0.12 + (row % 2) * 0.06, 0.06 + row * 0.1, 0.0, 10);
    // hearth slab
    k.rbox(w, 0.1, d, 0.02, M.stone('#c9c4ba', 0.7), 0, bh, 0, 1);
    const fy = bh + 0.1;
    // dome
    const dz = -0.1;
    k.lathe(
      [
        [0.5, 0],
        [0.5, 0.08],
        [0.47, 0.25],
        [0.39, 0.4],
        [0.25, 0.52],
        [0.001, 0.56],
      ].map(([r, y]) => [r, y] as [number, number]),
      M.stone(c.dome, 0.95),
      0,
      fy,
      dz,
      32,
    );
    // entrance vault (brick arch) with a dark mouth
    const arch = new THREE.Shape();
    arch.moveTo(-0.3, 0);
    arch.lineTo(0.3, 0);
    arch.lineTo(0.3, 0.26);
    arch.absarc(0, 0.26, 0.3, 0, Math.PI, false);
    arch.lineTo(-0.3, 0);
    const hole = new THREE.Path();
    hole.moveTo(-0.2, 0);
    hole.lineTo(-0.2, 0.2);
    hole.absarc(0, 0.2, 0.2, Math.PI, 0, true);
    hole.lineTo(0.2, 0);
    hole.lineTo(-0.2, 0);
    arch.holes.push(hole);
    k.geo(profileZ(arch, 0.3, 0.01, 12), brick, 0, fy, 0.43);
    // brick joints on the arch face
    for (let i = 0; i < 9; i++) {
      const a = (i / 8) * Math.PI;
      k.beam([Math.cos(a) * 0.205, fy + 0.2 + Math.sin(a) * 0.205, 0.585], [Math.cos(a) * 0.295, fy + 0.26 + Math.sin(a) * 0.295, 0.585], 0.006, 0.004, M.matte('#e2d9c8'));
    }
    // mouth: dark interior + floor, embers + logs at the back
    k.box(0.4, 0.42, 0.01, M.matte('#120d0b'), 0, fy, 0.3);
    k.box(0.4, 0.01, 0.28, M.matte('#2a2320'), 0, fy, 0.43);
    k.sphere(0.07, M.glow('#ff6a1a', 1.5, '#3a1a0a'), 0, fy + 0.02, 0.36, 2, 0.5, 1, 10);
    for (const sx of [-1, 1]) k.rod([sx * 0.12, fy + 0.03, 0.33], [sx * 0.02, fy + 0.08, 0.4], 0.025, bark, 0.025, 8);
    // chimney on the vault
    k.cyl(0.07, 0.3, M.blackMetal(), 0, fy + 0.5, 0.45, 0.06, 14);
    k.cyl(0.1, 0.04, M.blackMetal(), 0, fy + 0.8, 0.45, 0.04, 14);
    // peel leaning on the side
    k.rod([w / 2 - 0.03, bh + 0.1, 0.45], [w / 2 - 0.03, bh + 0.85, 0.42], 0.012, M.wood(PAL.oak), 0.012, 6);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { w, d } = OVEN;
      D.rr(ctx, 0, 0, w, d, 0.02, tint(c.base, 0.4));
      D.circle(ctx, 0, -0.1, 0.5, tint(c.dome, 0.25));
      D.rr(ctx, 0, 0.43, 0.6, 0.3, 0.02, tint(c.brick, 0.35));
      D.circle(ctx, 0, 0.45, 0.07, tint('#2b2c2f', 0.3), undefined, LINE_THIN);
    }),
};

/* ================================================================== export */

export const PLAYGROUND: FurnitureDef[] = [
  slide,
  climber,
  seesaw,
  swingFrame({ id: 'play-swing-double', name: 'נדנדה כפולה ממתכת', tags: ['נדנדה', 'מתכת', 'ילדים', 'גן משחקים'], seats: ['belt', 'belt'], frame: '#2f6fb7', seat: '#26272a' }),
  swingFrame({ id: 'play-swing-trio', name: 'נדנדה משולשת עם כיסא פעוטות', tags: ['נדנדה', 'פעוטות', 'ילדים', 'משפחה'], seats: ['belt', 'bucket', 'belt'], frame: '#2f8a4e', seat: '#e5452f' }),
  tireSwing,
  porchSwing,
  hammock,
  eggChair,
  rockingHorse,
  springRider,
  merryGoRound,
  playhouse,
  climbingDome,
  kiddiePool,
  hotTub,
  aboveGroundPool,
  outdoorShower,
  fountain,
  firePit,
  kettleBbq,
  pizzaOven,
];
