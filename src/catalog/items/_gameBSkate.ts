/**
 * Team B – skatepark items: ramps with real riding surfaces (the shape comes from _gameBShapes.ts, the same
 * functions the walk physics uses), rails, ledges, a stair set, graffiti walls, bleachers and a skateboard.
 */
import * as THREE from 'three';
import type { FurnitureDef, ItemSize, SeatAnchor, WheelPart } from '../types';
import { D, INK, INK_SOFT, Kit, LINE_THIN, M, darken, lighten, roundedRectShape, sym, tint, type Ctx2D } from '../kit';
import { slot } from './_parts';
import { cylX, memo, staticPart } from './_vehicleParts';
import { cachedMat, canvasTex, drawGraffiti, pyramidGeo, rampSideGeo, rampTopGeo } from './_gameBKit';
import {
  kickerProfile,
  miniRampProfile,
  quarterPipeProfile,
  stairSetProfile,
  stairSetRail,
  transitionLength,
  trapezoid,
  type Profile,
} from './_gameBShapes';

type Colors = Record<string, string>;
const GROUP = 'פארק אתגרי';
const TAGS = ['סקייטפארק', 'סקייט', 'רמפה', 'אופניים', 'BMX', 'קורקינט', 'פעלולים'];

const surfaceMat = (c: string) => M.stone(c, 0.62);
const sideMat = (c: string) => M.wood(c, 0.7);

/** riding surface + solid sides of a profiled ramp */
function profiled(k: Kit, profile: Profile, w: number, c: Colors): void {
  k.geo(rampTopGeo(profile, w), surfaceMat(c.surface));
  k.geo(rampSideGeo(profile, w - 0.004), sideMat(c.sides));
}

/** steel coping pipe across the ramp at (z, y) */
function coping(k: Kit, w: number, z: number, y: number): void {
  k.rod([-w / 2, y - 0.034, z], [w / 2, y - 0.034, z], 0.032, M.steel(), 0.032, 12);
}

/** the thin steel plate where a ramp meets the ground */
function kickPlate(k: Kit, w: number, z: number, dir: 1 | -1): void {
  k.box(w, 0.006, 0.16, M.steel(), 0, 0, z - dir * 0.08);
}

/** Plan symbol of a profiled ramp: footprint, a line at every bend, an arrow uphill. */
function planProfile(ctx: Ctx2D, size: ItemSize, profile: Profile, c: Colors): void {
  const hw = size.w / 2;
  const hd = size.d / 2;
  D.box(ctx, -hw, -hd, hw, hd, 0.02, tint(c.surface, 0.55), INK);
  const maxH = Math.max(...profile.map((p) => p[1]));
  for (let i = 1; i < profile.length - 1; i++) {
    const [z, h] = profile[i];
    D.line(ctx, -hw, z, hw, z, h > maxH - 0.01 ? INK : INK_SOFT, h > maxH - 0.01 ? 0.025 : LINE_THIN);
  }
  // shading of the decks
  for (let i = 0; i + 1 < profile.length; i++) {
    if (profile[i][1] > maxH - 0.01 && profile[i + 1][1] > maxH - 0.01) {
      D.box(ctx, -hw, profile[i][0], hw, profile[i + 1][0], 0, tint(c.sides, 0.35), null);
    }
  }
}

const rampColors = (surface: string, sides: string) => [slot('surface', 'משטח', surface), slot('sides', 'דפנות', sides)];

/* ======================================================================= quarter pipe */

const quarterPipe: FurnitureDef = {
  id: 'skate-quarter-pipe',
  name: 'רמפת קוורטר פייפ',
  category: 'sports',
  group: GROUP,
  tags: [...TAGS, 'קוורטר'],
  size: { w: 3, d: 2.4, h: 1.3 },
  resize: { w: [1.5, 8], d: [2.2, 3.4], h: [0.7, 1.8] },
  parametric: true,
  colors: rampColors('#7d8894', '#c79a5f'),
  build: ({ colors: c, size = quarterPipe.size }) => {
    const k = new Kit();
    const p = quarterPipeProfile(size);
    profiled(k, p, size.w, c);
    const s = transitionLength(size.h, size.d - 0.3);
    coping(k, size.w, size.d / 2 - s, size.h);
    kickPlate(k, size.w, size.d / 2, 1);
    return k.g;
  },
  draw2d: (ctx, c, size = quarterPipe.size) => sym(ctx, () => planProfile(ctx, size, quarterPipeProfile(size), c)),
};

/* ======================================================================= kicker */

const kicker: FurnitureDef = {
  id: 'skate-kicker',
  name: 'רמפת קפיצה (קיקר)',
  category: 'sports',
  group: GROUP,
  tags: [...TAGS, 'קיקר', 'קפיצה'],
  size: { w: 1.5, d: 1.8, h: 0.6 },
  resize: { w: [0.8, 3], d: [1.2, 2.8], h: [0.3, 1] },
  parametric: true,
  colors: rampColors('#d8623c', '#3c4450'),
  build: ({ colors: c, size = kicker.size }) => {
    const k = new Kit();
    const p = kickerProfile(size);
    k.geo(rampTopGeo(p, size.w), M.paint(c.surface, 0.5));
    k.geo(rampSideGeo(p, size.w - 0.004), M.metal(c.sides, 0.5, 0.6));
    coping(k, size.w, -size.d / 2 + 0.03, size.h);
    kickPlate(k, size.w, size.d / 2, 1);
    // supports under the open back
    const leg = M.metal(c.sides, 0.5, 0.6);
    for (const x of [-size.w / 2 + 0.04, size.w / 2 - 0.04]) k.box(0.04, size.h - 0.02, 0.04, leg, x, 0, -size.d / 2 + 0.05);
    return k.g;
  },
  draw2d: (ctx, c, size = kicker.size) =>
    sym(ctx, () => {
      planProfile(ctx, size, kickerProfile(size), c);
      D.poly(ctx, [[0, -size.d / 2 + 0.25], [-0.2, -size.d / 2 + 0.55], [0.2, -size.d / 2 + 0.55]], true, INK, null);
    }),
};

/* ======================================================================= funbox / pyramid */

const funbox: FurnitureDef = {
  id: 'skate-funbox',
  name: 'פאנבוקס',
  category: 'sports',
  group: GROUP,
  tags: [...TAGS, 'פאנבוקס', 'קופסה'],
  size: { w: 2.4, d: 5, h: 0.6 },
  resize: { w: [1.6, 5], d: [3.6, 7], h: [0.3, 0.9] },
  parametric: true,
  colors: rampColors('#8a939c', '#2f6db5'),
  build: ({ colors: c, size = funbox.size }) => {
    const k = new Kit();
    const p = trapezoid(size.d / 2, size.h, 1.6);
    profiled(k, p, size.w, c);
    // steel edges on the deck
    for (const z of [p[1][0], p[2][0]]) coping(k, size.w, z, size.h);
    for (const s of [-1, 1]) k.box(0.03, 0.03, p[2][0] - p[1][0], M.steel(), s * (size.w / 2 - 0.015), size.h - 0.03, 0);
    kickPlate(k, size.w, size.d / 2, 1);
    kickPlate(k, size.w, -size.d / 2, -1);
    return k.g;
  },
  draw2d: (ctx, c, size = funbox.size) => sym(ctx, () => planProfile(ctx, size, trapezoid(size.d / 2, size.h, 1.6), c)),
};

const pyramid: FurnitureDef = {
  id: 'skate-pyramid',
  name: 'פירמידה',
  category: 'sports',
  group: GROUP,
  tags: [...TAGS, 'פירמידה'],
  size: { w: 4.4, d: 4.4, h: 0.7 },
  resize: { w: [3.4, 7], d: [3.4, 7], h: [0.4, 1] },
  parametric: true,
  colors: rampColors('#9b9a93', '#6d6b66'),
  build: ({ colors: c, size = pyramid.size }) => {
    const k = new Kit();
    k.geo(pyramidGeo(size.w, size.d, size.h, 1.5), surfaceMat(c.surface));
    const a = size.w / 2 - 1.5;
    const b = size.d / 2 - 1.5;
    const steel = M.steel();
    const y = size.h - 0.026;
    k.rod([-a, y, b], [a, y, b], 0.025, steel, 0.025, 8);
    k.rod([-a, y, -b], [a, y, -b], 0.025, steel, 0.025, 8);
    k.rod([a, y, -b], [a, y, b], 0.025, steel, 0.025, 8);
    k.rod([-a, y, -b], [-a, y, b], 0.025, steel, 0.025, 8);
    // a painted stripe across the top
    k.box(0.3, 0.004, 2 * b, M.paint(c.sides, 0.5), 0, size.h - 0.003, 0);
    return k.g;
  },
  draw2d: (ctx, c, size = pyramid.size) =>
    sym(ctx, () => {
      const hw = size.w / 2;
      const hd = size.d / 2;
      const a = hw - 1.5;
      const b = hd - 1.5;
      D.box(ctx, -hw, -hd, hw, hd, 0.02, tint(c.surface, 0.55), INK);
      D.box(ctx, -a, -b, a, b, 0, tint(c.sides, 0.4), INK);
      for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) D.line(ctx, x * a, y * b, x * hw, y * hd, INK_SOFT, LINE_THIN);
    }),
};

/* ======================================================================= mini ramp */

const miniRamp: FurnitureDef = {
  id: 'skate-mini-ramp',
  name: 'חצי צינור (מיני רמפ)',
  category: 'sports',
  group: GROUP,
  tags: [...TAGS, 'חצי צינור', 'האלף פייפ', 'מיני רמפ'],
  size: { w: 3.6, d: 6.4, h: 1 },
  resize: { w: [2.4, 8], d: [5.4, 8], h: [0.7, 1.4] },
  parametric: true,
  colors: rampColors('#6f7d8c', '#e0b25a'),
  build: ({ colors: c, size = miniRamp.size }) => {
    const k = new Kit();
    const p = miniRampProfile(size);
    profiled(k, p, size.w, c);
    const deck = 0.55;
    for (const s of [-1, 1]) coping(k, size.w, s * (size.d / 2 - deck), size.h);
    return k.g;
  },
  draw2d: (ctx, c, size = miniRamp.size) => sym(ctx, () => planProfile(ctx, size, miniRampProfile(size), c)),
};

/* ======================================================================= rail / ledge / stair set */

const grindRail: FurnitureDef = {
  id: 'skate-grind-rail',
  name: 'מעקה גרינד',
  category: 'sports',
  group: GROUP,
  tags: [...TAGS, 'מעקה', 'גרינד', 'ריל'],
  size: { w: 0.3, d: 3, h: 0.4 },
  resize: { d: [1.5, 6], h: [0.25, 0.6] },
  parametric: true,
  colors: [slot('rail', 'מעקה', '#e2c531'), slot('posts', 'רגליים', '#2d3138')],
  build: ({ colors: c, size = grindRail.size }) => {
    const k = new Kit();
    const hd = size.d / 2 - 0.04;
    const r = 0.03;
    const steel = M.metal(c.rail, 0.32, 0.75);
    const post = M.metal(c.posts, 0.5, 0.6);
    k.rod([0, size.h - r, -hd], [0, size.h - r, hd], r, steel, r, 14);
    for (const z of [-hd + 0.25, hd - 0.25]) {
      k.rod([0, 0.03, z], [0, size.h - r * 2, z], 0.025, post, 0.025, 8);
      k.box(0.28, 0.03, 0.18, post, 0, 0, z);
    }
    return k.g;
  },
  draw2d: (ctx, c, size = grindRail.size) =>
    sym(ctx, () => {
      const hd = size.d / 2;
      for (const z of [-hd + 0.29, hd - 0.29]) D.rr(ctx, 0, z, 0.28, 0.18, 0, tint(c.posts, 0.5), INK, LINE_THIN);
      D.line(ctx, 0, -hd + 0.04, 0, hd - 0.04, c.rail, 0.06);
      D.line(ctx, 0, -hd + 0.04, 0, hd - 0.04, INK, LINE_THIN);
    }),
};

const ledge: FurnitureDef = {
  id: 'skate-ledge',
  name: "לדג' בטון לגרינד",
  category: 'sports',
  group: GROUP,
  tags: [...TAGS, 'לדג', 'ספסל בטון', 'גרינד'],
  size: { w: 0.6, d: 3, h: 0.42 },
  resize: { w: [0.4, 1.2], d: [1.5, 6], h: [0.3, 0.6] },
  parametric: true,
  colors: [slot('concrete', 'בטון', '#b8b4ab'), slot('edge', 'פס מתכת', '#8d939a')],
  build: ({ colors: c, size = ledge.size }) => {
    const k = new Kit();
    k.box(size.w, size.h - 0.01, size.d, M.stone(c.concrete, 0.7), 0, 0, 0);
    const edge = M.metal(c.edge, 0.35, 0.9);
    for (const s of [-1, 1]) k.box(0.035, 0.035, size.d, edge, s * (size.w / 2 - 0.0175), size.h - 0.035, 0);
    k.box(size.w, 0.01, size.d, M.stone(lighten(c.concrete, 0.08), 0.55), 0, size.h - 0.01, 0);
    return k.g;
  },
  draw2d: (ctx, c, size = ledge.size) =>
    sym(ctx, () => {
      D.box(ctx, -size.w / 2, -size.d / 2, size.w / 2, size.d / 2, 0.01, tint(c.concrete, 0.3), INK);
      for (const s of [-1, 1]) D.line(ctx, s * (size.w / 2 - 0.03), -size.d / 2, s * (size.w / 2 - 0.03), size.d / 2, INK_SOFT, LINE_THIN);
    }),
};

const stairSet: FurnitureDef = {
  id: 'skate-stair-set',
  name: 'סט מדרגות עם מעקה',
  category: 'sports',
  group: GROUP,
  tags: [...TAGS, 'מדרגות', 'האבה', 'מעקה'],
  size: { w: 2.6, d: 3.9, h: 1.02 },
  resize: { w: [1.8, 4], h: [0.85, 1.25] },
  parametric: true,
  colors: [slot('surface', 'משטח', '#a6a39b'), slot('sides', 'דפנות', '#8b8880'), slot('rail', 'מעקה', '#d23c3c')],
  build: ({ colors: c, size = stairSet.size }) => {
    const k = new Kit();
    const p = stairSetProfile(size);
    k.geo(rampTopGeo(p, size.w), surfaceMat(c.surface));
    k.geo(rampSideGeo(p, size.w - 0.004), M.stone(c.sides, 0.75));
    // nosings of the steps
    for (let i = 1; i + 1 < p.length; i++) {
      if (Math.abs(p[i + 1][0] - p[i][0]) < 0.02 && p[i][1] > p[i + 1][1]) k.box(size.w, 0.02, 0.03, M.steel(), 0, p[i][1] - 0.02, p[i][0] - 0.015);
    }
    // the hubba rail down the steps
    const r = stairSetRail(size);
    const steel = M.metal(c.rail, 0.35, 0.7);
    const top = (z: number) => r.y0 + ((z - r.z0) / (r.z1 - r.z0)) * (r.y1 - r.y0);
    k.rod([r.x, r.y0 - 0.03, r.z0], [r.x, r.y1 - 0.03, r.z1], 0.03, steel, 0.03, 12);
    for (const z of [r.z0 + 0.1, (r.z0 + r.z1) / 2, r.z1 - 0.1]) {
      const floor = (() => {
        for (let i = 0; i + 1 < p.length; i++) if (z <= p[i + 1][0]) return p[i][1] + ((z - p[i][0]) / Math.max(1e-6, p[i + 1][0] - p[i][0])) * (p[i + 1][1] - p[i][1]);
        return 0;
      })();
      k.rod([r.x, floor, z], [r.x, top(z) - 0.06, z], 0.022, steel, 0.022, 8);
    }
    return k.g;
  },
  draw2d: (ctx, c, size = stairSet.size) =>
    sym(ctx, () => {
      planProfile(ctx, size, stairSetProfile(size), c);
      const r = stairSetRail(size);
      D.line(ctx, r.x, r.z0, r.x, r.z1, c.rail, 0.05);
    }),
};

/* ======================================================================= graffiti walls */

function graffitiWall(id: string, name: string, word: string, palette: [string, string, string], seed: number): FurnitureDef {
  const def: FurnitureDef = {
    id,
    name,
    category: 'street',
    group: GROUP,
    tags: [...TAGS, 'גרפיטי', 'קיר', 'ציור קיר', 'אמנות רחוב'],
    size: { w: 6, d: 0.3, h: 2.4 },
    resize: { w: [2, 10], h: [1.5, 3.2] },
    parametric: true,
    colors: [slot('c1', 'צבע 1', palette[0]), slot('c2', 'צבע 2', palette[1]), slot('c3', 'רקע', palette[2])],
    build: ({ colors: c, size = def.size }) => {
      const k = new Kit();
      const concrete = M.stone('#a8a59e', 0.85);
      const bd = size.d - 0.04;
      k.box(size.w - 0.04, size.h - 0.06, bd, concrete, 0, 0, 0);
      k.box(size.w, 0.06, size.d, M.stone('#96938c', 0.8), 0, size.h - 0.06, 0);
      const pal = [c.c1, c.c2, c.c3];
      const aspect = size.w / size.h;
      const tw = 1024;
      const th = Math.round(Math.max(128, Math.min(1024, tw / aspect)));
      const key = `${id}|${pal.join(',')}|${tw}x${th}`;
      const map = canvasTex(key, tw, th, (cx, w, h) => drawGraffiti(cx, w, h, word, pal, seed));
      const mat = cachedMat(`graffiti|${key}`, () => new THREE.MeshStandardMaterial({ color: map ? '#ffffff' : c.c1, map, roughness: 0.88 }));
      for (const s of [1, -1]) {
        const plane = new THREE.PlaneGeometry(size.w - 0.06, size.h - 0.1);
        const m = k.geo(plane, mat, 0, (size.h - 0.06) / 2, s * (bd / 2 + 0.003));
        if (s < 0) m.rotation.y = Math.PI;
      }
      return k.g;
    },
    draw2d: (ctx, c, size = def.size) =>
      sym(ctx, () => {
        D.box(ctx, -size.w / 2, -size.d / 2, size.w / 2, size.d / 2, 0, '#c9c6bf', INK);
        D.box(ctx, -size.w / 2, size.d / 2 - 0.06, size.w / 2, size.d / 2, 0, c.c1, null);
        D.box(ctx, -size.w / 2, -size.d / 2, size.w / 2, -size.d / 2 + 0.06, 0, c.c2, null);
      }),
  };
  return def;
}

/* ======================================================================= bleachers */

const BL = { w: 4, d: 2.1, rows: 3, rise: 0.42, tread: 0.58, front: 0.45 };
const bleacherSeats: SeatAnchor[] = [];
for (let r = 0; r < BL.rows; r++) {
  for (let i = 0; i < 5; i++) {
    bleacherSeats.push({ x: -BL.w / 2 + 0.45 + i * ((BL.w - 0.9) / 4), z: BL.d / 2 - BL.front - r * BL.tread, height: BL.rise * (r + 1), facing: 0 });
  }
}

const bleachers: FurnitureDef = {
  id: 'skate-bleachers',
  name: 'טריבונת צופים',
  category: 'street',
  group: GROUP,
  tags: [...TAGS, 'טריבונה', 'יציע', 'צופים', 'ספסל'],
  size: { w: BL.w, d: BL.d, h: 1.6 },
  colors: [slot('seat', 'מושבים', '#2f7fd0'), slot('frame', 'מסגרת', '#9aa0a6')],
  seats: bleacherSeats,
  build: ({ colors: c }) => {
    const k = new Kit();
    const frame = M.metal(c.frame, 0.4, 0.8);
    const seat = M.plastic(c.seat);
    const step = M.metal(darken(c.frame, 0.25), 0.6, 0.6);
    for (let r = 0; r < BL.rows; r++) {
      const z = BL.d / 2 - BL.front - r * BL.tread;
      const y = BL.rise * (r + 1);
      k.rbox(BL.w, 0.05, 0.32, 0.02, seat, 0, y - 0.05, z);
      // foot board in front of the row
      k.box(BL.w, 0.025, 0.24, step, 0, y - BL.rise + 0.02, z + 0.3);
    }
    const zb = BL.d / 2 - BL.front - (BL.rows - 1) * BL.tread;
    for (const x of [-BL.w / 2 + 0.05, 0, BL.w / 2 - 0.05]) {
      k.beam([x, 0.03, BL.d / 2 - 0.05], [x, BL.rise * BL.rows - 0.05, zb], 0.05, 0.05, frame, 0.005);
      k.rod([x, 0, zb], [x, BL.rise * BL.rows, zb], 0.025, frame, 0.025, 8);
      // back rail
      k.rod([x, BL.rise * BL.rows, -BL.d / 2 + 0.05], [x, BL.rise * BL.rows + 0.3, -BL.d / 2 + 0.05], 0.02, frame, 0.02, 8);
    }
    k.rod([-BL.w / 2 + 0.05, BL.rise * BL.rows + 0.3, -BL.d / 2 + 0.05], [BL.w / 2 - 0.05, BL.rise * BL.rows + 0.3, -BL.d / 2 + 0.05], 0.022, frame, 0.022, 8);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.box(ctx, -BL.w / 2, -BL.d / 2, BL.w / 2, BL.d / 2, 0, tint(c.frame, 0.6), INK);
      for (let r = 0; r < BL.rows; r++) {
        const z = BL.d / 2 - BL.front - r * BL.tread;
        D.rr(ctx, 0, z, BL.w - 0.04, 0.32, 0.02, tint(c.seat, 0.25), INK, LINE_THIN);
      }
    }),
};

/* ======================================================================= skateboard (rideable) */

const SB = { w: 0.21, len: 0.8, deckY: 0.09, wheelR: 0.028, truckZ: 0.235, track: 0.085 };

function skateDeck(c: Colors): THREE.Object3D {
  const k = new Kit();
  const graphic = M.paint(c.deck, 0.45);
  const maple = M.wood('#e2c79a', 0.6);
  const grip = M.matte('#1d1e21');
  const flat = 0.5;
  // middle
  k.slab(roundedRectShape(SB.w, flat, 0.02), 0.012, maple, 0, SB.deckY - 0.012, 0);
  k.slab(roundedRectShape(SB.w - 0.004, flat, 0.02), 0.002, grip, 0, SB.deckY, 0);
  k.slab(roundedRectShape(SB.w - 0.006, flat - 0.01, 0.02), 0.001, graphic, 0, SB.deckY - 0.0125, 0);
  // kicked-up tails
  for (const s of [1, -1]) {
    const tail = new Kit();
    const tl = (SB.len - flat) / 2 + 0.02;
    tail.slab(roundedRectShape(SB.w, tl, SB.w * 0.48, 0, -s * (tl / 2)), 0.012, maple, 0, -0.012, 0);
    tail.slab(roundedRectShape(SB.w - 0.004, tl - 0.004, SB.w * 0.46, 0, -s * (tl / 2)), 0.002, grip, 0, 0, 0);
    tail.slab(roundedRectShape(SB.w - 0.006, tl - 0.006, SB.w * 0.46, 0, -s * (tl / 2)), 0.001, graphic, 0, -0.0125, 0);
    const g = k.sub(tail, 0, SB.deckY, s * (flat / 2 - 0.01));
    g.rotation.x = -s * 0.32;
  }
  // stripe on the graphic side
  k.box(SB.w * 0.3, 0.001, flat * 0.8, M.paint(c.stripe, 0.45), 0, SB.deckY - 0.0137, 0);
  // trucks
  const metal = M.metal('#c6c9cc', 0.3, 1);
  for (const z of [SB.truckZ, -SB.truckZ]) {
    k.box(0.06, 0.012, 0.08, metal, 0, SB.deckY - 0.024, z);
    k.box(0.03, 0.035, 0.035, metal, 0, SB.wheelR + 0.006, z);
    k.rod([-SB.track - 0.01, SB.wheelR, z], [SB.track + 0.01, SB.wheelR, z], 0.008, metal, 0.008, 8);
    k.rod([-0.07, SB.wheelR + 0.01, z], [0.07, SB.wheelR + 0.01, z], 0.012, metal, 0.012, 8);
  }
  return k.g;
}

function skateWheels(c: Colors, z: number): THREE.Group {
  const spin = new THREE.Group();
  const urethane = M.plastic(c.wheels);
  const g = memo('sb-wheel', () => cylX(SB.wheelR, 0.032, 16));
  for (const s of [1, -1]) {
    const m = new THREE.Mesh(g, urethane);
    m.castShadow = true;
    m.position.x = s * SB.track;
    spin.add(m);
  }
  spin.position.set(0, SB.wheelR, z);
  return spin;
}

const skateboard: FurnitureDef = {
  id: 'skateboard-ride',
  name: 'סקייטבורד לרכיבה',
  category: 'vehicle',
  group: GROUP,
  tags: [...TAGS, 'סקייטבורד', 'גלגשת'],
  size: { w: 0.22, d: 0.82, h: 0.14 },
  colors: [slot('deck', 'גרפיקה', '#2f7fd0'), slot('stripe', 'פס', '#ffd23a'), slot('wheels', 'גלגלים', '#f2ecd8')],
  noBake: true,
  resize: false,
  vehicle: {
    kind: 'scooter',
    maxSpeed: 6.5,
    acceleration: 3,
    wheelbase: 0.5,
    maxSteer: 0.55,
    radius: 0.34,
    rider: { x: 0, y: SB.deckY + 0.004, z: 0, pose: 'stand' },
    cameraDistance: 4.6,
    prompt: 'לעלות על הסקייטבורד',
  },
  build: ({ colors: c }) => {
    const root = new THREE.Group();
    root.name = 'skateboard';
    const key = `skateboard|${Object.values(c).join(',')}`;
    // the deck (with trucks) is a node of its own so that games can flip it
    const deck = new THREE.Group();
    deck.name = 'deck';
    deck.add(staticPart(`${key}|deck`, () => skateDeck(c)));
    const front = skateWheels(c, SB.truckZ);
    const back = skateWheels(c, -SB.truckZ);
    deck.add(front, back);
    root.add(deck);
    root.userData.wheels = [
      { spin: front, radius: SB.wheelR },
      { spin: back, radius: SB.wheelR },
    ] satisfies WheelPart[];
    root.userData.stance = 'side';
    root.userData.coast = 0.35;
    root.userData.deck = deck;
    return root;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, SB.w, SB.len, SB.w / 2, tint(c.deck, 0.2), INK);
      D.rr(ctx, 0, 0, SB.w * 0.3, SB.len * 0.6, 0.01, c.stripe, null);
      for (const z of [SB.truckZ, -SB.truckZ]) for (const s of [1, -1]) D.rr(ctx, s * SB.track, z, 0.03, 0.06, 0.01, c.wheels, INK, LINE_THIN);
    }),
};

export const SKATE_ITEMS: FurnitureDef[] = [
  quarterPipe,
  kicker,
  funbox,
  pyramid,
  miniRamp,
  grindRail,
  ledge,
  stairSet,
  graffitiWall('skate-graffiti-wall', 'קיר גרפיטי "סקייט"', 'SKATE', ['#ff5aa5', '#ffb12a', '#2c3e9e'], 3),
  graffitiWall('skate-graffiti-wall-2', 'קיר גרפיטי "חלום"', 'DREAM', ['#3fe0c5', '#2f7fd0', '#7a2d8f'], 11),
  graffitiWall('skate-graffiti-wall-3', 'קיר גרפיטי "וואו"', 'WOW!', ['#ffe14a', '#ff4d3a', '#1d8a4f'], 21),
  bleachers,
  skateboard,
];
