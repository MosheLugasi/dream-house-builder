/**
 * Storage: wardrobes, chests of drawers, nightstands, bookcases and shelves, sideboards,
 * media consoles, entryway pieces and wall storage. Doors and drawers are animated parts
 * ('door' / 'drawer') opened by the 'open' action; bookcases offer 'read'.
 */
import * as THREE from 'three';
import type { ColorSlot, FurnitureCategory, FurnitureDef, ActionSpec, SeatAnchor } from '../types';
import { D, INK_SOFT, Kit, LINE_THIN, M, PAL, darken, extrudeZ, leafGeo, organicGeo, sym, tint, type Ctx2D } from '../kit';
import { bookRow, bookStack, legs4, slot } from './_parts';
import {
  MX,
  basket,
  carcass,
  door,
  drawer,
  foldedStack,
  handle,
  hangingClothes,
  handleDepth,
  leaningFrame,
  planBooks,
  planCase,
  smallPlant,
  taperLeg,
  vase,
  type FrontMats,
  type FrontStyle,
  type HandleKind,
} from './_bedstore';

type Colors = Record<string, string>;
type Mat = THREE.Material;

interface Spec {
  id: string;
  name: string;
  category: FurnitureCategory;
  group: string;
  tags: string[];
  size: { w: number; d: number; h: number };
  colors: ColorSlot[];
  mount?: 'wall';
  elevation?: number;
  actions?: ActionSpec[];
  seats?: SeatAnchor[];
  build: (k: Kit, c: Colors) => void;
  plan: (ctx: Ctx2D, c: Colors) => void;
}

function mk(s: Spec): FurnitureDef {
  return {
    id: s.id,
    name: s.name,
    category: s.category,
    group: s.group,
    tags: s.tags,
    size: s.size,
    colors: s.colors,
    mount: s.mount,
    elevation: s.elevation,
    actions: s.actions,
    seats: s.seats,
    build: ({ colors }) => {
      const k = new Kit();
      s.build(k, colors);
      return k.g;
    },
    draw2d: (ctx, c) => sym(ctx, () => s.plan(ctx, c)),
  };
}

const OPEN: ActionSpec[] = [{ kind: 'open' }];
const READ: ActionSpec[] = [{ kind: 'read' }];

/** Row of overlay doors across [x0, x1] in front of a carcass. Hinges alternate l / r in pairs. */
function doorRow(k: Kit, x0: number, x1: number, y: number, h: number, zf: number, n: number, style: FrontStyle, mats: FrontMats, hk: HandleKind, hmat: Mat, o: { hy?: number; hlen?: number; sides?: Array<'l' | 'r'> } = {}): void {
  const gap = 0.003;
  const dw = (x1 - x0) / n;
  for (let i = 0; i < n; i++) {
    const side = o.sides?.[i] ?? (n === 1 ? 'l' : i % 2 === 0 ? 'l' : 'r');
    const a = x0 + dw * i + gap / 2;
    const b = x0 + dw * (i + 1) - gap / 2;
    door(k, { hingeX: side === 'l' ? a : b, y, zf, w: b - a, h, side, style, mats, handle: hk, hmat, hy: o.hy, hlen: o.hlen });
  }
}

/** Grid of drawers (cols × rows) across [x0, x1] × [y0, y1]; `weights` = relative row heights top → bottom. */
function drawerGrid(k: Kit, x0: number, x1: number, y0: number, y1: number, zf: number, cols: number, weights: number[], depth: number, style: FrontStyle, mats: FrontMats, hk: HandleKind, hmat: Mat, o: { groove?: boolean; hlen?: number; knobs2?: boolean; clothes?: boolean } = {}): void {
  const gap = 0.004;
  const cw = (x1 - x0) / cols;
  const sum = weights.reduce((a, b) => a + b, 0);
  for (let c = 0; c < cols; c++) {
    let top = y1;
    weights.forEach((wt, r) => {
      const rh = ((y1 - y0) * wt) / sum;
      const p = drawer(k, {
        x: x0 + cw * (c + 0.5),
        y: top - rh + gap / 2,
        zf,
        w: cw - gap,
        h: rh - gap,
        depth,
        style,
        mats,
        handle: o.knobs2 ? 'none' : hk,
        hmat,
        hlen: o.hlen,
        groove: o.groove,
        clothes: o.clothes && r === 0 ? 3 : 0,
        open: Math.min(0.35, depth * 0.7),
      });
      if (o.knobs2) for (const s of [-1, 1]) handle(p, hk, s * (cw - gap) * 0.27, (rh - gap) / 2, 0, hmat);
      top -= rh;
    });
  }
}

/** Thin stem with a few small leaves (eucalyptus / olive branch) rising from (x, y, z). */
function sprig(k: Kit, x: number, y: number, z: number, len: number, seed: number, lean = 0.2): void {
  const m = M.leaf(PAL.olive);
  const tx = x + Math.sin(lean) * len;
  const ty = y + Math.cos(lean) * len;
  k.rod([x, y, z], [tx, ty, z], 0.0022, m, 0.0015, 4);
  for (let i = 0; i < 5; i++) {
    const t = 0.35 + i * 0.15;
    const lf = k.geo(leafGeo(0.045, 0.022, { seg: 3, droop: 0.2 }), m, x + (tx - x) * t, y + (ty - y) * t, z);
    lf.rotation.set(-0.6, (i % 2 ? 1 : -1) * 1.4 + seed, 0);
  }
}

/** Decor on top of a piece: vase with stems, book stack, little bowl. */
function topDecor(k: Kit, y: number, w: number, z: number, seed: number, accent: string): void {
  const x0 = -w / 2 + 0.16;
  vase(k, x0, y, z, 0.26, 0.07, M.ceramic(accent), 'bud');
  for (let i = 0; i < 3; i++) {
    const a = (i - 1) * 0.35;
    sprig(k, x0 + (i - 1) * 0.01, y + 0.2, z, 0.18 + i * 0.03, i + seed, a);
  }
  const yy = bookStack(k, w / 2 - 0.2, y, z, 3, seed);
  vase(k, w / 2 - 0.2, yy, z, 0.05, 0.07, M.ceramic('#efebe4'), 'bowl');
}

/* ================================================================== wardrobes */

function wardrobeInterior(k: Kit, x0: number, x1: number, y0: number, y1: number, z: number, d: number, seed: number): void {
  const shelf = y1 - 0.3;
  k.box(x1 - x0, 0.018, d - 0.02, M.wood(PAL.birch), (x0 + x1) / 2, shelf, z);
  hangingClothes(k, x0 + 0.02, x1 - 0.02, shelf - 0.06, z, d * 0.8, seed, Math.min(1.0, shelf - y0 - 0.25));
  const n = Math.max(1, Math.floor((x1 - x0) / 0.36));
  for (let i = 0; i < n; i++) foldedStack(k, x0 + ((x1 - x0) * (i + 0.5)) / n, shelf + 0.018, z, 0.3, d * 0.7, 3 + (i % 2), seed + i);
}

const wardrobe2 = mk({
  id: 'wardrobe-2door-oak',
  name: 'ארון בגדים 2 דלתות אלון',
  category: 'bedroom',
  group: 'ארונות',
  tags: ['ארון', 'בגדים', 'אלון', 'עץ', 'שייקר', 'דלתות', 'קלאסי'],
  size: { w: 1.0, d: 0.6, h: 2.0 },
  colors: [slot('wood', 'עץ', PAL.oak), slot('handles', 'ידיות', PAL.brass)],
  actions: OPEN,
  build: (k, c) => {
    const wood = M.wood(c.wood);
    const hm = M.metal(c.handles, 0.3, 1);
    const w = 1.0;
    const d = 0.6;
    const hd = handleDepth('bar');
    const cd = d - hd - 0.02;
    const cz = -d / 2 + cd / 2;
    const b = carcass(k, { w, h: 1.9, d: cd, y0: 0.07, z: cz, mat: wood, inner: MX.inside(c.wood) });
    k.box(w - 0.04, 0.07, cd - 0.04, M.wood(darken(c.wood, 0.3)), 0, 0, cz - 0.01);
    k.rbox(w + 0.01, 0.03, d - 0.004, 0.006, wood, 0, 1.97, -0.002, 1);
    wardrobeInterior(k, b.x0, b.x1, b.y0, b.y1, cz, cd, 3);
    doorRow(k, -w / 2, w / 2, 0.072, 1.896, d / 2 - hd, 2, 'shaker', { front: wood }, 'bar', hm, { hy: 1.0, hlen: 0.24 });
  },
  plan: (ctx, c) => {
    planCase(ctx, 1.0, 0.6, c.wood, { doors: 2 });
    D.line(ctx, -0.46, -0.02, 0.46, -0.02, INK_SOFT, 0.014);
  },
});

const wardrobe3 = mk({
  id: 'wardrobe-3door-white',
  name: 'ארון בגדים 3 דלתות לבן',
  category: 'bedroom',
  group: 'ארונות',
  tags: ['ארון', 'בגדים', 'לבן', 'מודרני', 'מדפים', 'מוט תלייה', 'שלוש דלתות'],
  size: { w: 1.5, d: 0.6, h: 2.2 },
  colors: [slot('fronts', 'דלתות', '#f1efea'), slot('body', 'גוף', '#ebe8e2'), slot('handles', 'ידיות', '#26272a')],
  actions: OPEN,
  build: (k, c) => {
    const body = M.paint(c.body, 0.5);
    const front = M.paint(c.fronts, 0.4);
    const hm = M.metal(c.handles, 0.45, 0.7);
    const w = 1.5;
    const d = 0.6;
    const hd = handleDepth('bar');
    const cd = d - hd - 0.02;
    const cz = -d / 2 + cd / 2;
    const b = carcass(k, { w, h: 2.12, d: cd, y0: 0.08, z: cz, mat: body, inner: M.matte(darken(c.body, 0.18)) });
    k.box(w - 0.03, 0.08, cd - 0.05, M.matte('#2f3032'), 0, 0, cz - 0.02);
    // divider: shelves on the left, hanging on the right
    const xd = b.x0 + 0.48;
    k.box(0.018, b.y1 - b.y0, cd - 0.01, body, xd, b.y0, cz);
    for (let i = 1; i < 5; i++) {
      const y = b.y0 + i * 0.4;
      k.box(xd - b.x0 - 0.009, 0.018, cd - 0.03, body, (b.x0 + xd) / 2, y, cz);
      foldedStack(k, (b.x0 + xd) / 2, y + 0.018, cz + 0.02, 0.34, cd * 0.7, 3 + (i % 3), 20 + i);
    }
    wardrobeInterior(k, xd + 0.009, b.x1, b.y0, b.y1, cz, cd, 7);
    doorRow(k, -w / 2, w / 2, 0.082, 2.114, d / 2 - hd, 3, 'flat', { front }, 'bar', hm, { hy: 1.05, hlen: 0.42, sides: ['l', 'r', 'r'] });
  },
  plan: (ctx, c) => {
    planCase(ctx, 1.5, 0.6, c.body, { doors: 3 });
    D.line(ctx, -0.25, -0.27, -0.25, 0.27, INK_SOFT, LINE_THIN);
    D.line(ctx, -0.2, -0.02, 0.7, -0.02, INK_SOFT, 0.014);
  },
});

const wardrobeMirror = mk({
  id: 'wardrobe-mirror',
  name: 'ארון בגדים עם דלת מראה',
  category: 'bedroom',
  group: 'ארונות',
  tags: ['ארון', 'בגדים', 'מראה', 'אגוז', 'רגליים', 'מודרני'],
  size: { w: 1.2, d: 0.6, h: 2.1 },
  colors: [slot('wood', 'עץ', PAL.walnut), slot('handles', 'ידיות', '#2a2b2e')],
  actions: OPEN,
  build: (k, c) => {
    const wood = M.wood(c.wood);
    const hm = M.metal(c.handles, 0.45, 0.7);
    const w = 1.2;
    const d = 0.6;
    const hd = handleDepth('bar');
    const cd = d - hd - 0.02;
    const cz = -d / 2 + cd / 2;
    const y0 = 0.14;
    const b = carcass(k, { w, h: 2.1 - y0, d: cd, y0, z: cz, mat: wood, inner: MX.inside(c.wood) });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) taperLeg(k, sx * (w / 2 - 0.06), cz + sz * (cd / 2 - 0.06), y0, 0.045, 0.03, wood, sx * 0.01, sz * 0.01);
    wardrobeInterior(k, b.x0, b.x1, b.y0, b.y1, cz, cd, 11);
    const zf = d / 2 - hd;
    const dh = 2.1 - y0 - 0.006;
    door(k, { hingeX: -w / 2 + 0.0015, y: y0 + 0.003, zf, w: w / 2 - 0.003, h: dh, side: 'l', style: 'flat', mats: { front: wood }, handle: 'bar', hmat: hm, hy: 1.0, hlen: 0.3 });
    door(k, { hingeX: w / 2 - 0.0015, y: y0 + 0.003, zf, w: w / 2 - 0.003, h: dh, side: 'r', style: 'mirror', mats: { front: wood, frame: wood }, handle: 'bar', hmat: hm, hy: 1.0, hlen: 0.3 });
  },
  plan: (ctx, c) => {
    planCase(ctx, 1.2, 0.6, c.wood, { doors: 2 });
    D.box(ctx, 0.02, 0.27, 0.58, 0.29, 0, '#dfeaf0', INK_SOFT, LINE_THIN);
  },
});

const wardrobeRattan = mk({
  id: 'wardrobe-rattan',
  name: 'ארון בגדים עם דלתות קש',
  category: 'bedroom',
  group: 'ארונות',
  tags: ['ארון', 'קש', 'ראטן', 'וינאי', 'בוהו', 'רגליים', 'עץ'],
  size: { w: 1.0, d: 0.55, h: 1.85 },
  colors: [slot('wood', 'עץ', PAL.teak), slot('cane', 'קש', '#d7bb8c')],
  actions: OPEN,
  build: (k, c) => {
    const wood = M.wood(c.wood);
    const w = 1.0;
    const d = 0.55;
    const hd = handleDepth('knob');
    const cd = d - hd - 0.02;
    const cz = -d / 2 + cd / 2;
    const y0 = 0.2;
    const b = carcass(k, { w: w - 0.02, h: 1.6, d: cd, y0, z: cz, mat: wood, inner: MX.inside(c.wood), noTop: true });
    k.rbox(w, 0.04, d, 0.012, wood, 0, y0 + 1.6, 0, 1);
    k.rbox(w - 0.02, 0.04, cd, 0.006, wood, 0, y0 - 0.04, cz, 1);
    legs4(k, w - 0.04, cd, y0 - 0.04, wood, { rTop: 0.022, rBot: 0.014, inset: 0.035, splay: 0.012, cz });
    wardrobeInterior(k, b.x0, b.x1, b.y0, b.y1 - 0.02, cz, cd, 13);
    doorRow(k, -w / 2 + 0.012, w / 2 - 0.012, y0 + 0.003, 1.594, d / 2 - hd, 2, 'cane', { front: wood, frame: wood, cane: M.rattan(c.cane) }, 'knob', M.brass(), { hy: 0.85 });
  },
  plan: (ctx, c) => {
    planCase(ctx, 1.0, 0.55, c.wood, { doors: 2 });
  },
});

/* ================================================================== chests of drawers */

const chestMcm = mk({
  id: 'chest-mcm-6',
  name: 'שידת 6 מגירות מיד-סנצ\'ורי',
  category: 'bedroom',
  group: 'שידות',
  tags: ['שידה', 'מגירות', 'אגוז', 'רטרו', 'מיד סנצ\'ורי', 'רגליים'],
  size: { w: 1.4, d: 0.48, h: 1.23 },
  colors: [slot('wood', 'עץ', PAL.walnut), slot('fronts', 'חזיתות', PAL.walnut)],
  actions: OPEN,
  build: (k, c) => {
    const wood = M.wood(c.wood);
    const front = M.wood(c.fronts);
    const w = 1.4;
    const d = 0.48;
    const y0 = 0.2;
    const b = carcass(k, { w, h: 0.6, d, y0, mat: wood, inner: MX.inside(c.wood), t: 0.022 });
    k.box(0.02, b.y1 - b.y0, d - 0.01, wood, 0, b.y0, -0.005);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) taperLeg(k, sx * (w / 2 - 0.09), sz * (d / 2 - 0.07), y0, 0.045, 0.026, wood, sx * 0.03, sz * 0.02);
    for (const s of [-1, 1]) drawerGrid(k, s < 0 ? b.x0 : 0.01, s < 0 ? -0.01 : b.x1, b.y0, b.y1, d / 2, 1, [1, 1, 1], d - 0.04, 'flat', { front }, 'none', M.brass(), { groove: true, clothes: true });
    topDecor(k, y0 + 0.6, w, -0.05, 4, '#c7775a');
  },
  plan: (ctx, c) => {
    planCase(ctx, 1.4, 0.48, c.wood, { doors: 2 });
    topPlanDecor(ctx, 1.4, -0.05);
  },
});

const chestTall = mk({
  id: 'chest-tall-5',
  name: 'שידה גבוהה 5 מגירות',
  category: 'bedroom',
  group: 'שידות',
  tags: ['שידה', 'מגירות', 'גבוהה', 'צבוע', 'ירוק מרווה', 'ידיות פליז', 'כפרי'],
  size: { w: 0.62, d: 0.45, h: 1.56 },
  colors: [slot('paint', 'צבע', '#a3b39a'), slot('top', 'משטח', PAL.oak)],
  actions: OPEN,
  build: (k, c) => {
    const p = M.paint(c.paint, 0.5);
    const w = 0.62;
    const d = 0.45;
    const hd = handleDepth('knob');
    const cd = d - hd - 0.02;
    const cz = -d / 2 + cd / 2 - 0.005;
    carcass(k, { w: w - 0.02, h: 1.09, d: cd, y0: 0.1, z: cz, mat: p, inner: MX.inside(c.paint), noTop: true });
    k.box(w - 0.06, 0.1, cd - 0.04, M.paint(darken(c.paint, 0.2), 0.6), 0, 0, cz - 0.01);
    k.rbox(w, 0.03, d - 0.005, 0.006, M.wood(c.top), 0, 1.19, -0.0025, 1);
    drawerGrid(k, -w / 2 + 0.012, w / 2 - 0.012, 0.102, 1.188, d / 2 - hd, 1, [0.85, 1, 1, 1.1, 1.15], cd - 0.03, 'shaker', { front: p }, 'knob', M.brass(), { knobs2: true, clothes: true });
    smallPlant(k, -0.14, 1.22, -0.05, 1.0, M.ceramic('#efebe4'), PAL.leaf, 5, true);
    leaningFrame(k, 0.13, 1.22, -0.15, 0.26, 0.33, M.wood(PAL.oak), M.art('botanical', 4, ['#f1ece2', '#7c8a5c', '#c7775a', '#d6a544'], 0.18, 0.25));
  },
  plan: (ctx, c) => {
    planCase(ctx, 0.62, 0.45, c.paint, {});
    D.circle(ctx, -0.14, -0.05, 0.065, tint(PAL.leaf, 0.3), undefined, LINE_THIN);
  },
});

const chestCane = mk({
  id: 'chest-cane-3',
  name: 'שידת 3 מגירות עם חזית קש',
  category: 'bedroom',
  group: 'שידות',
  tags: ['שידה', 'מגירות', 'קש', 'ראטן', 'וינאי', 'טבעות', 'בוהו'],
  size: { w: 0.9, d: 0.45, h: 0.98 },
  colors: [slot('wood', 'עץ', '#8a5a3c'), slot('cane', 'קש', '#d7bb8c')],
  actions: OPEN,
  build: (k, c) => {
    const wood = M.wood(c.wood);
    const w = 0.9;
    const d = 0.45;
    const y0 = 0.18;
    const hd = handleDepth('ring');
    const b = carcass(k, { w, h: 0.64, d: d - hd, y0, z: -hd / 2, mat: wood, inner: MX.inside(c.wood), t: 0.024, noTop: true });
    k.rbox(w + 0.0, 0.025, d, 0.006, wood, 0, y0 + 0.64 - 0.005, 0, 1);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) taperLeg(k, sx * (w / 2 - 0.04), sz * (d / 2 - 0.04), y0, 0.04, 0.025, wood, sx * 0.008, sz * 0.008);
    drawerGrid(k, b.x0, b.x1, b.y0, y0 + 0.635, d / 2 - hd, 1, [1, 1, 1], d - 0.05, 'cane', { front: wood, frame: wood, cane: M.rattan(c.cane) }, 'ring', M.brass(), { knobs2: true, clothes: true });
    k.rbox(0.36, 0.015, 0.22, 0.008, M.wood(darken(c.wood, 0.2)), 0.18, y0 + 0.66, -0.03, 1);
    vase(k, 0.1, y0 + 0.675, -0.03, 0.12, 0.05, M.clay('#c7775a'), 'round');
    k.cyl(0.035, 0.08, M.matte('#f4efe4'), 0.26, y0 + 0.675, -0.03, 0.035, 14);
  },
  plan: (ctx, c) => {
    planCase(ctx, 0.9, 0.45, c.wood, {});
    D.rr(ctx, 0.18, -0.03, 0.36, 0.22, 0.01, tint(c.wood, 0.25), INK_SOFT, LINE_THIN);
  },
});

const chestWide = mk({
  id: 'chest-wide-9',
  name: 'קומודה רחבה 9 מגירות',
  category: 'bedroom',
  group: 'שידות',
  tags: ['קומודה', 'שידה', 'מגירות', 'אלון לבן', 'רחבה', 'סקנדינבי', 'רגלי מתכת'],
  size: { w: 1.6, d: 0.48, h: 1.3 },
  colors: [slot('wood', 'עץ', '#d9c4a2'), slot('legs', 'רגליים', '#26272a')],
  actions: OPEN,
  build: (k, c) => {
    const wood = M.wood(c.wood);
    const lm = M.metal(c.legs, 0.45, 0.7);
    const w = 1.6;
    const d = 0.48;
    const hd = handleDepth('bar');
    const cd = d - hd - 0.02;
    const cz = -d / 2 + cd / 2;
    const y0 = 0.14;
    carcass(k, { w, h: 0.64, d: cd, y0, z: cz, mat: wood, inner: MX.inside(c.wood) });
    legs4(k, w - 0.06, cd - 0.04, y0, lm, { rTop: 0.014, rBot: 0.01, inset: 0.03, cz });
    drawerGrid(k, -w / 2 + 0.002, w / 2 - 0.002, y0 + 0.002, y0 + 0.638, d / 2 - hd, 3, [1, 1, 1], cd - 0.03, 'flat', { front: wood }, 'bar', lm, { hlen: 0.16, clothes: true });
    topDecor(k, y0 + 0.64, w, -0.06, 8, '#3d5166');
    leaningFrame(k, 0.05, y0 + 0.64, -0.15, 0.42, 0.52, M.matte('#1e1f22'), M.art('abstract', 9, ['#efe9de', '#c7775a', '#3d5166', '#d6a544'], 0.34, 0.44));
  },
  plan: (ctx, c) => {
    planCase(ctx, 1.6, 0.48, c.wood, { doors: 3 });
    topPlanDecor(ctx, 1.6, -0.06);
  },
});

function topPlanDecor(ctx: Ctx2D, w: number, z: number): void {
  D.circle(ctx, -w / 2 + 0.16, z, 0.07, '#f4efe6', INK_SOFT, LINE_THIN);
  D.rr(ctx, w / 2 - 0.2, z, 0.24, 0.17, 0.005, '#e7e0d2', INK_SOFT, LINE_THIN);
}

/* ================================================================== nightstands */

const nsMcm = mk({
  id: 'nightstand-mcm',
  name: 'שידת לילה רטרו עם מגירה ומדף',
  category: 'bedroom',
  group: 'שידות לילה',
  tags: ['שידת לילה', 'מגירה', 'מדף', 'אגוז', 'רטרו', 'רגליים'],
  size: { w: 0.5, d: 0.4, h: 0.66 },
  colors: [slot('wood', 'עץ', PAL.walnut), slot('fronts', 'חזית', PAL.walnut)],
  actions: OPEN,
  build: (k, c) => {
    const wood = M.wood(c.wood);
    const w = 0.5;
    const d = 0.4;
    const y0 = 0.22;
    const hd = handleDepth('bar');
    const b = carcass(k, { w, h: 0.34, d: d - hd, y0, z: -hd / 2, mat: wood, inner: MX.inside(c.wood), t: 0.02 });
    k.box(w - 0.04, 0.016, d - hd - 0.01, wood, 0, y0 + 0.17, -hd / 2 - 0.005);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) taperLeg(k, sx * (w / 2 - 0.05), sz * (d / 2 - 0.05), y0, 0.035, 0.022, wood, sx * 0.015, sz * 0.012);
    drawer(k, { x: 0, y: y0 + 0.19, zf: d / 2 - hd, w: b.x1 - b.x0 - 0.004, h: b.y1 - y0 - 0.192, depth: d - 0.03, mats: { front: M.wood(c.fronts) }, handle: 'bar', hmat: M.brass(), hlen: 0.12, open: 0.26 });
    bookStack(k, 0.02, y0 + 0.02 + 0.0, -0.01, 2, 31);
    bookStack(k, -0.05, y0 + 0.34, -0.03, 2, 32);
    k.cyl(0.04, 0.09, M.ceramic('#e8e2d6'), 0.14, y0 + 0.34, 0.05, 0.042, 14);
  },
  plan: (ctx, c) => {
    planCase(ctx, 0.5, 0.4, c.wood, {});
    D.circle(ctx, 0.14, 0.05, 0.042, '#ffffff', INK_SOFT, LINE_THIN);
  },
});

const nsCane = mk({
  id: 'nightstand-cane',
  name: 'שידת לילה עם דלת קש',
  category: 'bedroom',
  group: 'שידות לילה',
  tags: ['שידת לילה', 'קש', 'ראטן', 'דלת', 'מגירה', 'בוהו', 'וינאי'],
  size: { w: 0.46, d: 0.4, h: 0.79 },
  colors: [slot('wood', 'עץ', PAL.oak), slot('cane', 'קש', '#d7bb8c')],
  actions: OPEN,
  build: (k, c) => {
    const wood = M.wood(c.wood);
    const w = 0.46;
    const d = 0.4;
    const y0 = 0.1;
    const hd = handleDepth('knob');
    const cd = d - hd - 0.02;
    const cz = -d / 2 + cd / 2;
    carcass(k, { w, h: 0.5, d: cd, y0, z: cz, mat: wood, inner: MX.inside(c.wood), noTop: true });
    k.rbox(w + 0.01, 0.022, d, 0.006, wood, 0, y0 + 0.5, 0, 1);
    legs4(k, w - 0.02, cd - 0.02, y0, wood, { rTop: 0.02, rBot: 0.014, inset: 0.03, cz });
    const zf = d / 2 - hd;
    drawer(k, { x: 0, y: y0 + 0.37, zf, w: w - 0.004, h: 0.128, depth: cd - 0.02, mats: { front: wood }, handle: 'knob', hmat: M.brass(), open: 0.25 });
    door(k, { hingeX: -w / 2 + 0.002, y: y0 + 0.002, zf, w: w - 0.004, h: 0.364, side: 'l', style: 'cane', mats: { front: wood, frame: wood, cane: M.rattan(c.cane) }, handle: 'knob', hmat: M.brass(), hy: 0.3 });
    vase(k, -0.1, y0 + 0.522, -0.04, 0.16, 0.05, M.ceramic('#d9cbb8'), 'tall');
  },
  plan: (ctx, c) => {
    planCase(ctx, 0.46, 0.4, c.wood, {});
    D.circle(ctx, -0.1, -0.04, 0.05, '#f4efe6', INK_SOFT, LINE_THIN);
  },
});

const nsPedestal = mk({
  id: 'nightstand-pedestal',
  name: 'שידת לילה עמוד אבן עגולה',
  category: 'bedroom',
  group: 'שידות לילה',
  tags: ['שידת לילה', 'עגולה', 'אבן', 'טרוורטין', 'פדסטל', 'מינימליסטי'],
  size: { w: 0.42, d: 0.42, h: 0.81 },
  colors: [slot('stone', 'אבן', '#d8cbb5')],
  build: (k, c) => {
    const st = M.stone(c.stone, 0.55);
    k.lathe(
      [
        [0, 0],
        [0.17, 0],
        [0.172, 0.02],
        [0.15, 0.06],
        [0.13, 0.25],
        [0.14, 0.44],
        [0.205, 0.48],
        [0.21, 0.5],
        [0.205, 0.52],
        [0, 0.52],
      ],
      st,
      0,
      0,
      0,
      32,
    );
    bookStack(k, 0.02, 0.52, 0.03, 2, 41);
    vase(k, -0.1, 0.52, -0.08, 0.14, 0.045, M.ceramic('#3b3f45'), 'bud');
    sprig(k, -0.1, 0.64, -0.08, 0.16, 1);
  },
  plan: (ctx, c) => {
    D.circle(ctx, 0, 0, 0.21, tint(c.stone, 0.3));
    D.circle(ctx, 0, 0, 0.17, null, INK_SOFT, LINE_THIN);
    D.rr(ctx, 0.02, 0.03, 0.22, 0.16, 0.005, '#e7e0d2', INK_SOFT, LINE_THIN);
  },
});

const nsFloat = mk({
  id: 'nightstand-float',
  name: 'שידת לילה צפה לקיר',
  category: 'bedroom',
  group: 'שידות לילה',
  tags: ['שידת לילה', 'צפה', 'תלויה', 'קיר', 'מגירה', 'מינימליסטי'],
  size: { w: 0.46, d: 0.32, h: 0.34 },
  mount: 'wall',
  elevation: 0.42,
  colors: [slot('wood', 'עץ', PAL.oakLight), slot('fronts', 'חזית', '#f1efea')],
  actions: OPEN,
  build: (k, c) => {
    const wood = M.wood(c.wood);
    const w = 0.46;
    const d = 0.32;
    carcass(k, { w, h: 0.2, d, mat: wood, inner: MX.inside(c.wood), t: 0.018 });
    drawer(k, { x: 0, y: 0.022, zf: d / 2 + 0.0, w: w - 0.04, h: 0.156, depth: d - 0.03, mats: { front: M.paint(c.fronts, 0.45) }, groove: true, open: 0.22 });
    // fronts sit in the opening: pull back the carcass front edge illusion with a thin lip
    smallPlant(k, 0.1, 0.2, -0.03, 0.65, M.ceramic('#3b3f45'), PAL.leafLight, 9);
  },
  plan: (ctx, c) => {
    planCase(ctx, 0.46, 0.32, c.wood, { front: 0.02 });
    D.foliage(ctx, 0.13, -0.04, 0.08, tint(PAL.leafLight, 0.2), 6, 3);
  },
});

const nsLacquer = mk({
  id: 'nightstand-lacquer',
  name: 'שידת לילה מבריקה 3 מגירות',
  category: 'bedroom',
  group: 'שידות לילה',
  tags: ['שידת לילה', 'לכה', 'מבריק', 'מגירות', 'ידיות זהב', 'גלאם'],
  size: { w: 0.5, d: 0.42, h: 0.76 },
  colors: [slot('paint', 'לכה', '#2e3b55'), slot('handles', 'ידיות', '#c9a35a')],
  actions: OPEN,
  build: (k, c) => {
    const lac = M.lacquer(c.paint);
    const hm = M.metal(c.handles, 0.28, 1);
    const w = 0.5;
    const d = 0.42;
    const hd = handleDepth('cup');
    const cd = d - hd - 0.02;
    const cz = -d / 2 + cd / 2;
    carcass(k, { w, h: 0.58, d: cd, y0: 0.06, z: cz, mat: lac, inner: MX.inside(c.paint) });
    k.box(w - 0.06, 0.06, cd - 0.06, hm, 0, 0, cz - 0.01);
    drawerGrid(k, -w / 2 + 0.002, w / 2 - 0.002, 0.062, 0.638, d / 2 - hd, 1, [1, 1, 1], cd - 0.03, 'flat', { front: lac }, 'cup', hm, { hlen: 0.11 });
    k.cyl(0.07, 0.012, hm, 0.1, 0.64, 0.02, 0.07, 18);
    vase(k, 0.1, 0.652, 0.02, 0.1, 0.035, M.ceramic('#f4efe6'), 'bud');
  },
  plan: (ctx, c) => {
    planCase(ctx, 0.5, 0.42, c.paint, {});
    D.circle(ctx, 0.1, 0.02, 0.07, tint(c.handles, 0.3), INK_SOFT, LINE_THIN);
  },
});

const nsMetal = mk({
  id: 'nightstand-metal',
  name: 'שידת לילה מתכת עם מדפי עץ וסלסלה',
  category: 'bedroom',
  group: 'שידות לילה',
  tags: ['שידת לילה', 'מתכת', 'שחור', 'תעשייתי', 'מדפים', 'סלסלה', 'נצרים'],
  size: { w: 0.45, d: 0.38, h: 0.77 },
  colors: [slot('metal', 'מתכת', '#26272a'), slot('wood', 'מדפים', PAL.oak)],
  build: (k, c) => {
    const m = M.metal(c.metal, 0.5, 0.7);
    const wood = M.wood(c.wood);
    const w = 0.45;
    const d = 0.38;
    const px = w / 2 - 0.01;
    const pz = d / 2 - 0.01;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.02, 0.6, 0.02, m, sx * px, 0, sz * pz);
    for (const y of [0.06, 0.32, 0.575])
      for (const sz of [-1, 1]) k.box(w - 0.02, 0.02, 0.02, m, 0, y, sz * pz);
    for (const y of [0.06, 0.32, 0.575]) for (const sx of [-1, 1]) k.box(0.02, 0.02, d - 0.02, m, sx * px, y, 0);
    k.box(w - 0.04, 0.025, d - 0.04, wood, 0, 0.08, 0);
    k.box(w - 0.04, 0.025, d - 0.04, wood, 0, 0.34, 0);
    k.rbox(w, 0.025, d, 0.004, wood, 0, 0.575, 0, 1);
    basket(k, -0.03, 0.105, 0, 0.32, 0.17, 0.28, M.wicker('#b8925f'), M.wicker(darken('#b8925f', 0.2)));
    bookStack(k, -0.04, 0.365, 0.0, 3, 51);
    smallPlant(k, 0.12, 0.6, -0.05, 0.85, M.clay('#c7775a'), PAL.leaf, 12);
  },
  plan: (ctx, c) => {
    D.rr(ctx, 0, 0, 0.45, 0.38, 0.004, tint(c.wood, 0.35));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) D.rr(ctx, sx * 0.215, sz * 0.18, 0.02, 0.02, 0, c.metal);
    D.foliage(ctx, 0.12, -0.05, 0.08, tint(PAL.leaf, 0.3), 6, 5);
  },
});

/* ================================================================== bookcases & shelves */

const BOOKCASE = 'ספריות ומדפים';

const shelfLadder = mk({
  id: 'shelf-ladder',
  name: 'מדף סולם נשען',
  category: 'living',
  group: BOOKCASE,
  tags: ['מדף', 'סולם', 'ספרייה', 'עץ', 'נשען', 'צמחים', 'סקנדינבי'],
  size: { w: 0.66, d: 0.42, h: 1.82 },
  colors: [slot('wood', 'עץ', PAL.oakLight)],
  actions: READ,
  build: (k, c) => {
    const wood = M.wood(c.wood);
    const w = 0.66;
    const H = 1.82;
    const zB = 0.18; // rail at the floor
    const zT = -0.18; // rail at the top (against the wall)
    const railZ = (y: number): number => zB + ((zT - zB) * y) / H;
    for (const s of [-1, 1]) k.beam([s * (w / 2 - 0.02), 0, zB], [s * (w / 2 - 0.02), H, zT], 0.035, 0.045, wood, 0.006);
    const shelves = [
      { y: 0.2, d: 0.36 },
      { y: 0.55, d: 0.31 },
      { y: 0.9, d: 0.26 },
      { y: 1.24, d: 0.21 },
      { y: 1.56, d: 0.16 },
    ];
    shelves.forEach((s, i) => {
      const zr = railZ(s.y);
      const zc = zr + 0.04 - s.d / 2 + 0.02;
      const zMin = Math.max(-0.21, zc - s.d / 2);
      const dd = Math.min(s.d, zr + 0.06 - zMin);
      const z = zr + 0.06 - dd / 2;
      k.box(w - 0.08, 0.022, dd, wood, 0, s.y, z);
      const front = z + dd / 2;
      if (i === 0) basket(k, -0.1, s.y + 0.022, z, 0.34, 0.2, dd - 0.04, M.wicker('#c9a87a'), M.wicker('#a8875a'));
      if (i === 1) {
        bookRow(k, -0.27, 0.05, s.y + 0.022, front, dd, 0.3, 61, 0.9);
        vase(k, 0.17, s.y + 0.022, z, 0.18, 0.06, M.ceramic('#c7775a'), 'round');
      }
      if (i === 2) smallPlant(k, 0.0, s.y + 0.022, z, 1.0, M.ceramic('#efebe4'), PAL.leaf, 63, true);
      if (i === 3) {
        bookStack(k, -0.12, s.y + 0.022, z, 3, 64);
        k.cyl(0.03, 0.08, M.matte('#f2ece0'), 0.14, s.y + 0.022, z, 0.03, 12);
      }
      if (i === 4) vase(k, 0.05, s.y + 0.022, z, 0.12, 0.045, M.ceramic('#3b3f45'), 'bud');
    });
  },
  plan: (ctx, c) => {
    D.rr(ctx, 0, -0.03, 0.66, 0.36, 0.005, tint(c.wood, 0.4));
    for (const s of [-1, 1]) D.rr(ctx, s * 0.31, -0.03, 0.035, 0.36, 0.005, tint(c.wood, 0.1));
    D.line(ctx, -0.29, 0.06, 0.29, 0.06, INK_SOFT, LINE_THIN);
  },
});

const shelfCube = mk({
  id: 'shelf-cube-4x4',
  name: 'כוורת 4×4 עם סלסלות בד',
  category: 'living',
  group: BOOKCASE,
  tags: ['כוורת', 'קוביות', 'סלסלות', 'ספרייה', 'אחסון', 'לבן', 'חדר ילדים'],
  size: { w: 1.47, d: 0.39, h: 1.47 },
  colors: [slot('body', 'גוף', '#f2f0eb'), slot('baskets', 'סלסלות', '#9a9184'), slot('baskets2', 'סלסלות 2', '#d9cbb3')],
  actions: READ,
  build: (k, c) => {
    const m = M.paint(c.body, 0.55);
    const W = 1.47;
    const d = 0.39;
    const t = 0.035;
    const cell = (W - 5 * t) / 4;
    for (let i = 0; i < 5; i++) k.box(t, W, d, m, -W / 2 + t / 2 + i * (cell + t), 0, 0);
    for (let j = 0; j < 5; j++) k.box(W - 2 * t, t, d, m, 0, j * (cell + t), 0);
    k.box(W - 2 * t, W - 2 * t, 0.004, M.matte(darken(c.body, 0.12)), 0, t, -d / 2 + 0.002);
    const plan = ['b1', 'books', 'b2', 'vase', 'books', 'b2', 'plant', 'b1', 'b2', 'books', 'b1', 'books', 'b1', 'stack', 'books', 'b2'];
    let n = 0;
    for (let j = 0; j < 4; j++)
      for (let i = 0; i < 4; i++) {
        const x = -W / 2 + t + cell / 2 + i * (cell + t);
        const y = t + j * (cell + t);
        const what = plan[n++];
        if (what === 'b1' || what === 'b2') basket(k, x, y, 0.01, cell - 0.01, cell - 0.02, d - 0.04, M.fabric(what === 'b1' ? c.baskets : c.baskets2, 9), undefined, true);
        else if (what === 'books') bookRow(k, x - cell / 2, x + cell / 2, y, d / 2, d - 0.02, cell, 70 + n, 0.7 + (n % 3) * 0.08);
        else if (what === 'vase') vase(k, x, y, 0, 0.2, 0.065, M.ceramic('#c7775a'), 'bud');
        else if (what === 'plant') smallPlant(k, x, y, 0, 1.0, M.ceramic('#efebe4'), PAL.leaf, n, true);
        else {
          const yy = bookStack(k, x, y, 0, 3, n);
          k.sphere(0.04, M.ceramic('#3d5166'), x, yy + 0.04, 0, 1, 1, 1, 12);
        }
      }
  },
  plan: (ctx, c) => {
    D.rr(ctx, 0, 0, 1.47, 0.39, 0.004, tint(c.body, 0.3));
    const cell = (1.47 - 5 * 0.035) / 4;
    for (let i = 1; i < 4; i++) {
      const x = -1.47 / 2 + i * (cell + 0.035) + 0.0175;
      D.line(ctx, x, -0.195, x, 0.195, INK_SOFT, LINE_THIN);
    }
  },
});

const shelfOpenMetal = mk({
  id: 'shelf-open-metal',
  name: 'ספרייה פתוחה מתכת ועץ מעוצבת',
  category: 'living',
  group: BOOKCASE,
  tags: ['ספרייה', 'מדפים', 'מתכת', 'עץ', 'תעשייתי', 'ספרים', 'עציצים', 'מעוצב'],
  size: { w: 1.2, d: 0.36, h: 2.0 },
  colors: [slot('metal', 'מתכת', '#26272a'), slot('wood', 'מדפים', PAL.walnut)],
  actions: READ,
  build: (k, c) => {
    const m = M.metal(c.metal, 0.5, 0.7);
    const wood = M.wood(c.wood);
    const w = 1.2;
    const d = 0.36;
    const H = 1.9;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.025, H, 0.025, m, sx * (w / 2 - 0.0125), 0, sz * (d / 2 - 0.0125));
    // X-braces on the sides
    for (const sx of [-1, 1]) {
      k.rod([sx * (w / 2 - 0.0125), 0.05, -d / 2 + 0.02], [sx * (w / 2 - 0.0125), H - 0.05, d / 2 - 0.02], 0.004, m, 0.004, 4);
      k.rod([sx * (w / 2 - 0.0125), 0.05, d / 2 - 0.02], [sx * (w / 2 - 0.0125), H - 0.05, -d / 2 + 0.02], 0.004, m, 0.004, 4);
    }
    const ys = [0.06, 0.46, 0.84, 1.22, 1.6, H - 0.03];
    ys.forEach((y) => {
      k.rbox(w - 0.03, 0.03, d - 0.01, 0.004, wood, 0, y, 0, 1);
      k.box(w - 0.05, 0.02, 0.02, m, 0, y - 0.02, d / 2 - 0.0125);
    });
    const s = (i: number): number => ys[i] + 0.03;
    bookRow(k, -0.56, 0.1, s(0), d / 2, d - 0.02, 0.36, 81, 0.95);
    basket(k, 0.34, s(0), 0.0, 0.36, 0.24, 0.3, M.wicker('#b8925f'), M.wicker('#8f6c41'));
    vase(k, -0.4, s(1), 0, 0.26, 0.08, M.ceramic('#efebe4'), 'tall');
    bookRow(k, -0.1, 0.56, s(1), d / 2, d - 0.02, 0.34, 82, 0.62);
    smallPlant(k, 0.38, s(2), 0, 1.2, M.clay('#c7775a'), PAL.leaf, 83, true);
    const yy = bookStack(k, -0.3, s(2), 0.02, 4, 84);
    vase(k, -0.3, yy, 0.02, 0.06, 0.08, M.ceramic('#3d5166'), 'bowl');
    bookRow(k, -0.56, 0.0, s(3), d / 2, d - 0.02, 0.34, 85, 0.9);
    leaningFrame(k, 0.3, s(3), -0.08, 0.3, 0.32, M.wood(PAL.oak), M.art('lines', 3, ['#f3efe6', '#1e1f22', '#c7775a'], 0.22, 0.24));
    vase(k, -0.2, s(4), 0, 0.14, 0.07, M.ceramic('#c9a35a'), 'round');
    bookRow(k, 0.05, 0.56, s(4), d / 2, d - 0.02, 0.3, 86, 0.7);
    smallPlant(k, -0.4, s(5), 0, 1.0, M.ceramic('#efebe4'), PAL.leafDark, 87, true);
  },
  plan: (ctx, c) => {
    D.rr(ctx, 0, 0, 1.2, 0.36, 0.004, tint(c.wood, 0.4));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) D.rr(ctx, sx * 0.5875, sz * 0.1675, 0.025, 0.025, 0, c.metal);
    planBooks(ctx, -0.56, 0.0, 0.17, 0.18, 85);
  },
});

const shelfVitrine = mk({
  id: 'shelf-vitrine',
  name: 'ויטרינה עם דלתות זכוכית',
  category: 'living',
  group: BOOKCASE,
  tags: ['ויטרינה', 'זכוכית', 'ספרייה', 'תצוגה', 'כלי חרסינה', 'דלתות', 'קלאסי'],
  size: { w: 0.9, d: 0.42, h: 1.86 },
  colors: [slot('wood', 'עץ', '#5e4636'), slot('inside', 'פנים', '#e9e3d8')],
  actions: [{ kind: 'open' }, { kind: 'read' }],
  build: (k, c) => {
    const wood = M.wood(c.wood);
    const w = 0.9;
    const d = 0.42;
    const hd = handleDepth('knob');
    const cd = d - hd - 0.02;
    const cz = -d / 2 + cd / 2;
    const y0 = 0.16;
    const H = 1.86 - y0;
    const b = carcass(k, { w, h: H - 0.03, d: cd, y0, z: cz, mat: wood, inner: M.matte(c.inside) });
    k.rbox(w + 0.0, 0.03, d, 0.006, wood, 0, 1.83, 0, 1);
    legs4(k, w - 0.04, cd - 0.04, y0, wood, { rTop: 0.02, rBot: 0.015, inset: 0.03, cz });
    const glass = M.glass('#e8f2f0', 0.15);
    const ys = [b.y0 + 0.38, b.y0 + 0.76, b.y0 + 1.14];
    for (const y of ys) k.box(b.x1 - b.x0, 0.008, cd - 0.02, glass, 0, y, cz);
    const fl = b.y0;
    // contents: plates standing, cups, books, vases
    const plate = M.ceramic('#f4f1ea');
    for (let i = 0; i < 4; i++) {
      const p = k.cyl(0.11, 0.012, plate, -0.2 + i * 0.018, fl + 0.11, cz - 0.08, 0.11, 18);
      p.rotation.z = Math.PI / 2 - 0.12;
      p.position.set(-0.24 + i * 0.022, fl + 0.112, cz - 0.07);
    }
    vase(k, 0.17, fl, cz, 0.24, 0.07, M.ceramic('#3d5166'), 'tall');
    bookRow(k, b.x0, b.x1, ys[0] + 0.008, cz + cd / 2 - 0.02, cd - 0.04, 0.36, 91, 0.7);
    for (let i = 0; i < 4; i++) k.cyl(0.04, 0.09, plate, -0.27 + i * 0.12, ys[1] + 0.008, cz + 0.02 * (i % 2), 0.035, 14);
    vase(k, 0.0, ys[2] + 0.008, cz, 0.16, 0.08, M.ceramic('#c7775a'), 'round');
    vase(k, 0.24, ys[2] + 0.008, cz, 0.24, 0.05, M.glass('#bcd8cf', 0.45), 'bud');
    vase(k, -0.24, ys[2] + 0.008, cz, 0.06, 0.1, M.ceramic('#efebe4'), 'bowl');
    doorRow(k, -w / 2, w / 2, y0 + 0.003, H - 0.036, d / 2 - hd, 2, 'glass', { front: wood, frame: wood }, 'knob', M.brass(), { hy: (H - 0.036) / 2 });
  },
  plan: (ctx, c) => {
    planCase(ctx, 0.9, 0.42, c.wood, { doors: 2 });
    D.line(ctx, -0.43, 0.185, 0.43, 0.185, '#9fc4c8', 0.01);
  },
});

/** Arched outline (w wide, h tall, semicircular top) in the XY plane, bottom-centre at origin. */
function archShape(w: number, h: number): THREE.Shape {
  const r = w / 2;
  const s = new THREE.Shape();
  s.moveTo(-r, 0);
  s.lineTo(r, 0);
  s.lineTo(r, h - r);
  s.absarc(0, h - r, r, 0, Math.PI, false);
  s.lineTo(-r, 0);
  return s;
}

const shelfArched = mk({
  id: 'shelf-arched',
  name: 'ספרייה גבוהה עם קשת',
  category: 'living',
  group: BOOKCASE,
  tags: ['ספרייה', 'קשת', 'גבוהה', 'צבוע', 'מודרני', 'ספרים', 'בוטיק'],
  size: { w: 0.9, d: 0.35, h: 2.0 },
  colors: [slot('paint', 'צבע', '#c98b6b')],
  actions: READ,
  build: (k, c) => {
    const p = M.paint(c.paint, 0.55);
    const w = 0.9;
    const d = 0.35;
    const H = 2.0;
    const t = 0.025;
    // arched frame: outer arch minus inner arch, extruded the full depth
    const outer = archShape(w, H);
    const innerW = w - 2 * t;
    const hole = new THREE.Path(archShape(innerW, H - 2 * t).getPoints(16).map((v) => new THREE.Vector2(v.x, v.y + t)));
    outer.holes.push(hole);
    k.geo(extrudeZ(outer, d, 0, 16), p, 0, 0, 0);
    // back panel
    k.geo(extrudeZ(archShape(innerW, H - 2 * t), 0.008, 0, 16), M.paint(darken(c.paint, 0.12), 0.6), 0, t, -d / 2 + 0.004);
    const ys = [0.35, 0.72, 1.09, 1.44];
    for (const y of ys) k.box(innerW, 0.022, d - 0.01, p, 0, y, 0.0);
    const zf = d / 2 - 0.005;
    bookRow(k, -innerW / 2, innerW / 2, t, zf, d - 0.02, 0.33, 101, 0.95);
    bookRow(k, -innerW / 2, 0.15, ys[0] + 0.022, zf, d - 0.02, 0.34, 102, 0.95);
    vase(k, 0.27, ys[0] + 0.022, 0, 0.18, 0.06, M.ceramic('#efebe4'), 'round');
    const yy = bookStack(k, -0.2, ys[1] + 0.022, 0.0, 4, 103);
    k.sphere(0.035, M.brass(), -0.2, yy + 0.035, 0, 1, 1, 1, 12);
    bookRow(k, 0.02, innerW / 2, ys[1] + 0.022, zf, d - 0.02, 0.34, 104, 0.95);
    bookRow(k, -innerW / 2, innerW / 2, ys[2] + 0.022, zf, d - 0.02, 0.32, 105, 0.75);
    smallPlant(k, 0.0, ys[3] + 0.022, 0, 1.1, M.ceramic('#efebe4'), PAL.leaf, 106, true);
  },
  plan: (ctx, c) => {
    D.rr(ctx, 0, 0, 0.9, 0.35, 0.004, tint(c.paint, 0.35));
    D.rr(ctx, 0, 0.005, 0.85, 0.33, 0, null, INK_SOFT, LINE_THIN);
    planBooks(ctx, -0.42, 0.42, 0.17, 0.18, 101);
  },
});

/* ================================================================== sideboards / credenzas */

const SIDEBOARD = 'מזנונים';

const credenzaFluted = mk({
  id: 'credenza-fluted',
  name: 'מזנון עם חזיתות מחורצות',
  category: 'living',
  group: SIDEBOARD,
  tags: ['מזנון', 'קונסולה', 'מחורץ', 'פלוטד', 'אלון', 'דלתות', 'מודרני'],
  size: { w: 1.8, d: 0.45, h: 1.28 },
  colors: [slot('wood', 'עץ', '#c4a074'), slot('handles', 'ידיות', '#c9a35a')],
  actions: OPEN,
  build: (k, c) => {
    const wood = M.wood(c.wood);
    const hm = M.metal(c.handles, 0.28, 1);
    const w = 1.8;
    const d = 0.45;
    const hd = handleDepth('knob');
    const cd = d - hd - 0.02;
    const cz = -d / 2 + cd / 2;
    const y0 = 0.12;
    const b = carcass(k, { w, h: 0.62, d: cd, y0, z: cz, mat: wood, inner: MX.inside(c.wood), noTop: true });
    k.rbox(w, 0.025, d, 0.005, wood, 0, y0 + 0.615, 0, 1);
    k.box(0.018, b.y1 - b.y0, cd - 0.01, wood, 0, b.y0, cz);
    for (const s of [-1, 1]) k.box(w / 2 - 0.03, 0.018, cd - 0.03, wood, (s * w) / 4, b.y0 + 0.26, cz);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl(0.02, y0, M.wood(darken(c.wood, 0.35)), sx * (w / 2 - 0.08), 0, cz + sz * (cd / 2 - 0.07), 0.026, 10);
    doorRow(k, -w / 2, w / 2, y0 + 0.002, 0.611, d / 2 - hd, 4, 'fluted', { front: wood }, 'knob', hm, { hy: 0.38 });
    // stacked plates + glasses inside
    for (let i = 0; i < 5; i++) k.cyl(0.11, 0.012, M.ceramic('#f4f1ea'), -0.6, b.y0 + i * 0.013, cz, 0.11, 16);
    vase(k, -0.62, y0 + 0.64, -0.05, 0.34, 0.09, M.ceramic('#3b3f45'), 'tall');
    vase(k, 0.0, y0 + 0.64, 0.0, 0.08, 0.16, M.ceramic('#efebe4'), 'bowl');
    for (let i = 0; i < 3; i++) k.sphere(0.038, M.matte(['#d6a544', '#c7775a', '#9bae8a'][i]), -0.04 + i * 0.05, y0 + 0.69, 0.01 * i, 1, 1, 1, 10);
    leaningFrame(k, 0.55, y0 + 0.64, -0.14, 0.42, 0.52, M.wood(PAL.walnut), M.art('landscape', 7, ['#e9e4d8', '#9bae8a', '#8ea5b7', '#c7775a'], 0.34, 0.44));
  },
  plan: (ctx, c) => {
    planCase(ctx, 1.8, 0.45, c.wood, { doors: 4 });
    D.circle(ctx, -0.62, -0.05, 0.09, '#f4efe6', INK_SOFT, LINE_THIN);
    D.circle(ctx, 0, 0, 0.15, '#f4efe6', INK_SOFT, LINE_THIN);
  },
});

const credenzaCane = mk({
  id: 'credenza-cane',
  name: 'מזנון אגוז עם דלתות קש',
  category: 'living',
  group: SIDEBOARD,
  tags: ['מזנון', 'קש', 'ראטן', 'אגוז', 'וינאי', 'רגליים', 'בוהו'],
  size: { w: 1.6, d: 0.45, h: 1.3 },
  colors: [slot('wood', 'עץ', PAL.walnut), slot('cane', 'קש', '#d7bb8c')],
  actions: OPEN,
  build: (k, c) => {
    const wood = M.wood(c.wood);
    const w = 1.6;
    const d = 0.45;
    const hd = handleDepth('tab');
    const cd = d - hd - 0.02;
    const cz = -d / 2 + cd / 2;
    const y0 = 0.2;
    const b = carcass(k, { w, h: 0.56, d: cd, y0, z: cz, mat: wood, inner: MX.inside(c.wood), noTop: true });
    k.rbox(w, 0.025, d, 0.006, wood, 0, y0 + 0.555, 0, 1);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) taperLeg(k, sx * (w / 2 - 0.08), cz + sz * (cd / 2 - 0.06), y0, 0.04, 0.025, wood, sx * 0.02, sz * 0.012);
    k.box(w - 0.04, 0.018, cd - 0.03, wood, 0, b.y0 + 0.25, cz);
    doorRow(k, -w / 2, w / 2, y0 + 0.002, 0.551, d / 2 - hd, 3, 'cane', { front: wood, frame: wood, cane: M.rattan(c.cane) }, 'tab', M.brass(), { hy: 0.4, sides: ['l', 'l', 'r'] });
    smallPlant(k, -0.6, y0 + 0.58, -0.04, 1.3, M.clay('#c7775a'), PAL.leaf, 111);
    const yy = bookStack(k, 0.1, y0 + 0.58, 0.0, 3, 112);
    k.cyl(0.03, 0.12, M.brass(), 0.1, yy, 0, 0.02, 12);
    k.cyl(0.011, 0.08, M.matte('#f4efe4'), 0.1, yy + 0.12, 0, 0.011, 8);
    leaningFrame(k, 0.5, y0 + 0.58, -0.14, 0.42, 0.52, M.wood(PAL.oak), M.art('botanical', 12, ['#f1ece2', '#7c8a5c', '#c7775a', '#d6a544'], 0.34, 0.44));
  },
  plan: (ctx, c) => {
    planCase(ctx, 1.6, 0.45, c.wood, { doors: 3 });
    D.foliage(ctx, -0.6, -0.04, 0.12, tint(PAL.leaf, 0.3), 7, 2);
  },
});

const credenzaLacquer = mk({
  id: 'credenza-lacquer',
  name: 'מזנון לכה מבריק עם משטח שיש',
  category: 'living',
  group: SIDEBOARD,
  tags: ['מזנון', 'לכה', 'מבריק', 'שיש', 'יוקרה', 'מגירות', 'דלתות'],
  size: { w: 2.0, d: 0.5, h: 1.14 },
  colors: [slot('paint', 'לכה', '#28443c'), slot('top', 'שיש', '#f0ede8'), slot('handles', 'ידיות', '#c9a35a')],
  actions: OPEN,
  build: (k, c) => {
    const lac = M.lacquer(c.paint);
    const hm = M.metal(c.handles, 0.28, 1);
    const w = 2.0;
    const d = 0.5;
    const hd = handleDepth('bar');
    const cd = d - hd - 0.02;
    const cz = -d / 2 + cd / 2;
    const y0 = 0.08;
    carcass(k, { w, h: 0.63, d: cd, y0, z: cz, mat: lac, inner: MX.inside(c.paint), noTop: true });
    k.box(w - 0.06, y0, cd - 0.06, M.matte('#1e1f22'), 0, 0, cz - 0.02);
    k.rbox(w, 0.03, d, 0.004, M.marble(c.top), 0, 0.71, 0.0, 1);
    for (const s of [-1, 1]) k.box(0.018, 0.61, cd - 0.01, lac, s * 0.3, y0 + 0.018, cz);
    const zf = d / 2 - hd;
    door(k, { hingeX: -w / 2 + 0.0015, y: y0 + 0.002, zf, w: 0.7 - 0.003, h: 0.626, side: 'l', mats: { front: lac }, handle: 'bar', hmat: hm, hlen: 0.2, hy: 0.4 });
    door(k, { hingeX: w / 2 - 0.0015, y: y0 + 0.002, zf, w: 0.7 - 0.003, h: 0.626, side: 'r', mats: { front: lac }, handle: 'bar', hmat: hm, hlen: 0.2, hy: 0.4 });
    drawerGrid(k, -0.3, 0.3, y0 + 0.002, y0 + 0.628, zf, 1, [1, 1, 1.3], cd - 0.04, 'flat', { front: lac }, 'bar', hm, { hlen: 0.2 });
    vase(k, -0.7, 0.74, -0.05, 0.4, 0.1, M.ceramic('#efebe4'), 'tall');
    vase(k, -0.5, 0.74, 0.02, 0.2, 0.07, M.ceramic('#c9a35a'), 'bud');
    const yy = bookStack(k, 0.55, 0.74, 0.0, 3, 121);
    k.sphere(0.05, M.ceramic('#1e1f22'), 0.55, yy + 0.05, 0, 1, 1, 1, 14);
  },
  plan: (ctx, c) => {
    planCase(ctx, 2.0, 0.5, c.top, { doors: 0 });
    for (const x of [-0.3, 0.3]) D.line(ctx, x, 0.225, x, 0.25, INK_SOFT, LINE_THIN);
    D.circle(ctx, -0.7, -0.05, 0.1, '#f4efe6', INK_SOFT, LINE_THIN);
  },
});

/* ================================================================== media consoles */

/** Flat TV on two blade feet; screen is a 'screen' part. (x, y, z) = bottom-centre of the feet, z = TV back plane. */
function tvSet(k: Kit, x: number, y: number, z: number, inch: number): number {
  const diag = inch * 0.0254;
  const sw = diag * 0.8716;
  const sh = diag * 0.4903;
  const feetH = 0.07;
  const body = M.lacquer('#141517');
  k.rbox(sw + 0.012, sh + 0.012, 0.026, 0.003, body, x, y + feetH, z + 0.013, 1);
  k.box(sw * 0.5, sh * 0.5, 0.03, M.matte('#1e1f22'), x, y + feetH + sh * 0.2, z - 0.0);
  const scr = k.part('screen', x, y + feetH + 0.006 + sh / 2, z + 0.0265);
  scr.box(sw, sh, 0.002, M.screen(), 0, -sh / 2, 0);
  const st = M.brushed('#9a9da2');
  for (const s of [-1, 1]) {
    const f = k.beam([x + s * (sw / 2 - 0.12), y, z + 0.07], [x + s * (sw / 2 - 0.16), y + feetH + 0.04, z + 0.013], 0.018, 0.012, st, 0.003);
    f.castShadow = true;
    k.box(0.02, 0.008, 0.16, st, x + s * (sw / 2 - 0.12), y, z + 0.03);
  }
  return feetH + sh + 0.012;
}

const mediaOakTv = mk({
  id: 'media-oak-tv',
  name: 'מזנון טלוויזיה אלון עם מסך 65"',
  category: 'living',
  group: SIDEBOARD,
  tags: ['מזנון טלוויזיה', 'טלוויזיה', 'מסך', 'סלאטים', 'אלון', 'מדיה', 'סלון'],
  size: { w: 1.8, d: 0.42, h: 1.4 },
  colors: [slot('wood', 'עץ', PAL.oak)],
  actions: [{ kind: 'tv' }, { kind: 'open' }],
  build: (k, c) => {
    const wood = M.wood(c.wood);
    const w = 1.8;
    const d = 0.42;
    const hd = handleDepth('none');
    const cd = d - hd - 0.02;
    const cz = -d / 2 + cd / 2;
    const y0 = 0.1;
    const top = 0.5;
    carcass(k, { w, h: top - y0 - 0.025, d: cd, y0, z: cz, mat: wood, inner: MX.inside(c.wood), noTop: true });
    k.rbox(w, 0.025, d, 0.005, wood, 0, top - 0.025, 0, 1);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.04, y0, 0.04, M.blackMetal(), sx * (w / 2 - 0.06), 0, cz + sz * (cd / 2 - 0.05));
    doorRow(k, -w / 2, w / 2, y0 + 0.002, top - y0 - 0.03, d / 2 - hd, 4, 'slats', { front: wood, back: M.matte('#2a2522') }, 'none', M.brass());
    tvSet(k, 0, top, -0.12, 65);
    // soundbar + small plant
    k.rbox(0.9, 0.06, 0.09, 0.02, M.fabric('#2b2c2e', 20), 0, top, 0.08, 1);
    smallPlant(k, 0.7, top, 0.05, 0.9, M.ceramic('#efebe4'), PAL.leaf, 131);
  },
  plan: (ctx, c) => {
    planCase(ctx, 1.8, 0.42, c.wood, { doors: 4 });
    D.rr(ctx, 0, -0.105, 1.45, 0.03, 0.005, '#3a3b3d');
    D.rr(ctx, 0, -0.04, 0.8, 0.12, 0.005, null, INK_SOFT, LINE_THIN);
    D.rr(ctx, 0, 0.08, 0.9, 0.09, 0.02, '#6b6c6f', undefined, LINE_THIN);
  },
});

const mediaWalnut = mk({
  id: 'media-walnut-drawers',
  name: 'מזנון טלוויזיה נמוך אגוז עם מגירות',
  category: 'living',
  group: SIDEBOARD,
  tags: ['מזנון טלוויזיה', 'נמוך', 'אגוז', 'מגירות', 'מדיה', 'קונסולה', 'רטרו'],
  size: { w: 2.0, d: 0.42, h: 0.6 },
  colors: [slot('wood', 'עץ', PAL.walnut), slot('base', 'בסיס', '#2f3032')],
  actions: OPEN,
  build: (k, c) => {
    const wood = M.wood(c.wood);
    const w = 2.0;
    const d = 0.42;
    const y0 = 0.08;
    const b = carcass(k, { w, h: 0.42, d, y0, mat: wood, inner: MX.inside(c.wood), t: 0.022 });
    k.box(w - 0.08, y0, d - 0.08, M.matte(c.base), 0, 0, -0.02);
    for (const x of [-0.4, 0.4]) k.box(0.022, b.y1 - b.y0, d - 0.01, wood, x, b.y0, -0.005);
    for (const s of [-1, 1]) drawerGrid(k, s < 0 ? b.x0 : 0.411, s < 0 ? -0.411 : b.x1, b.y0, b.y1, d / 2, 1, [1, 1], d - 0.04, 'flat', { front: wood }, 'none', M.brass(), { groove: true });
    // open middle: game console, router, records
    const yN = b.y0;
    k.box(0.022, b.y1 - b.y0, d - 0.01, wood, 0, b.y0, -0.005);
    k.box(0.75, 0.018, d - 0.03, wood, 0, yN + 0.17, -0.01);
    k.rbox(0.3, 0.06, 0.24, 0.01, M.plastic('#f2f2f0'), -0.2, yN, -0.02, 1);
    k.box(0.3, 0.004, 0.24, M.matte('#1e1f22'), -0.2, yN + 0.03, -0.02);
    k.rbox(0.18, 0.035, 0.12, 0.006, M.plastic('#2a2b2e'), 0.18, yN, 0.0, 1);
    k.sphere(0.003, M.glow('#9bf0a0', 1.2), 0.15, yN + 0.02, 0.061, 1, 1, 1, 4);
    for (let i = 0; i < 10; i++) k.box(0.006, 0.31, 0.31, M.matte(['#1e1f22', '#c7775a', '#e6dfd0', '#3d5166'][i % 4]), 0.05 + i * 0.012, yN + 0.188, -0.03);
    smallPlant(k, -0.7, 0.5, 0.0, 1.0, M.ceramic('#efebe4'), PAL.leaf, 141, true);
  },
  plan: (ctx, c) => {
    planCase(ctx, 2.0, 0.42, c.wood, { doors: 0 });
    for (const x of [-0.4, 0.4]) D.line(ctx, x, -0.21, x, 0.21, INK_SOFT, LINE_THIN);
    D.line(ctx, -0.3, 0.17, 0.3, 0.17, INK_SOFT, LINE_THIN);
  },
});

const mediaFloat = mk({
  id: 'media-float',
  name: 'יחידת מדיה צפה לקיר',
  category: 'living',
  group: SIDEBOARD,
  tags: ['מזנון צף', 'תלוי', 'קיר', 'מדיה', 'לבן', 'מינימליסטי', 'טלוויזיה'],
  size: { w: 1.6, d: 0.36, h: 0.4 },
  mount: 'wall',
  elevation: 0.35,
  colors: [slot('fronts', 'חזיתות', '#f1efea'), slot('wood', 'נישה', PAL.oak)],
  actions: OPEN,
  build: (k, c) => {
    const lac = M.lacquer(c.fronts);
    const wood = M.wood(c.wood);
    const w = 1.6;
    const d = 0.36;
    const hd = handleDepth('none');
    const cd = d - hd - 0.02;
    const cz = -d / 2 + cd / 2;
    carcass(k, { w, h: 0.3, d: cd, z: cz, mat: lac, inner: M.matte(darken(c.fronts, 0.25)) });
    // oak-lined open niche in the middle
    k.box(0.5, 0.264, 0.006, wood, 0, 0.018, -d / 2 + 0.011);
    for (const s of [-1, 1]) k.box(0.018, 0.264, cd - 0.006, lac, s * 0.25, 0.018, cz);
    k.box(0.482, 0.006, cd - 0.01, wood, 0, 0.018, cz);
    const zf = d / 2 - hd;
    door(k, { hingeX: -w / 2 + 0.002, y: 0.002, zf, w: 0.548, h: 0.296, side: 'l', mats: { front: lac }, handle: 'none' });
    door(k, { hingeX: w / 2 - 0.002, y: 0.002, zf, w: 0.548, h: 0.296, side: 'r', mats: { front: lac }, handle: 'none' });
    for (const s of [-1, 1]) k.box(0.004, 0.296, 0.012, M.matte('#2a2a2b'), s * 0.252, 0.002, zf - 0.006);
    k.rbox(0.2, 0.04, 0.14, 0.008, M.plastic('#2a2b2e'), -0.1, 0.024, -0.02, 1);
    bookStack(k, 0.12, 0.024, -0.01, 2, 151);
    smallPlant(k, 0.6, 0.3, -0.04, 1.0, M.ceramic('#3b3f45'), PAL.leaf, 152, true);
  },
  plan: (ctx, c) => {
    planCase(ctx, 1.6, 0.36, c.fronts, { doors: 0 });
    for (const x of [-0.25, 0.25]) D.line(ctx, x, -0.18, x, 0.18, INK_SOFT, LINE_THIN);
  },
});

/* ================================================================== entry */

const ENTRY = 'כניסה';

const shoeCabinet = mk({
  id: 'hall-shoe-cabinet',
  name: 'ארון נעליים צר לכניסה',
  category: 'living',
  group: ENTRY,
  tags: ['ארון נעליים', 'נעליים', 'כניסה', 'מבואה', 'צר', 'דלתות'],
  size: { w: 0.8, d: 0.32, h: 1.21 },
  colors: [slot('fronts', 'חזיתות', '#e9e5dd'), slot('wood', 'עץ', PAL.oak)],
  actions: OPEN,
  build: (k, c) => {
    const wood = M.wood(c.wood);
    const front = M.paint(c.fronts, 0.45);
    const w = 0.8;
    const d = 0.32;
    const hd = handleDepth('tab');
    const cd = d - hd - 0.02;
    const cz = -d / 2 + cd / 2;
    const y0 = 0.14;
    const b = carcass(k, { w, h: 0.89, d: cd, y0, z: cz, mat: front, inner: MX.inside(c.fronts), noTop: true });
    k.rbox(w + 0.01, 0.03, d, 0.006, wood, 0, 1.03, 0, 1);
    legs4(k, w - 0.04, cd - 0.03, y0, wood, { rTop: 0.016, rBot: 0.011, inset: 0.025, cz });
    // shoes on slanted shelves
    const shoe = (x: number, y: number, z: number, col: string): void => {
      const m = M.leather(col);
      k.rbox(0.09, 0.07, 0.25, 0.03, m, x, y, z, 1);
      k.rbox(0.09, 0.015, 0.26, 0.006, M.rubber('#e9e6df'), x, y - 0.004, z, 1);
    };
    for (let r = 0; r < 2; r++) {
      const y = b.y0 + 0.02 + r * 0.42;
      k.box(b.x1 - b.x0, 0.016, cd - 0.03, M.wood(PAL.birch), 0, y - 0.016, cz);
      for (let i = 0; i < 3; i++) shoe(-0.24 + i * 0.12 + (r ? 0.36 : 0) * 0, y + 0.004, cz + 0.01, ['#3b2d24', '#e6dfd0', '#7a4a2a', '#2b2c2e'][(i + r) % 4]);
      shoe(0.22, y + 0.004, cz + 0.01, '#8ea5b7');
    }
    doorRow(k, -w / 2 + 0.002, w / 2 - 0.002, y0 + 0.002, 0.886, d / 2 - hd, 2, 'flat', { front }, 'tab', M.brass(), { hy: 0.8 });
    // key bowl, little plant, keys
    vase(k, -0.2, 1.06, -0.02, 0.05, 0.1, M.ceramic('#c7775a'), 'bowl');
    k.ring(0.018, 0.003, M.brass(), -0.19, 1.075, -0.02, 10);
    smallPlant(k, 0.24, 1.06, -0.04, 0.7, M.ceramic('#efebe4'), PAL.leafDark, 161);
  },
  plan: (ctx, c) => {
    planCase(ctx, 0.8, 0.32, c.fronts, { doors: 2 });
    D.circle(ctx, -0.2, -0.02, 0.1, tint('#c7775a', 0.4), INK_SOFT, LINE_THIN);
  },
});

/** Soft hanging coat: tapered, rounded body hanging from (x, yTop, z). */
function coat(k: Kit, x: number, yTop: number, z: number, len: number, col: string, seed: number, rotY = 0): void {
  const w = 0.42;
  const g = new THREE.BoxGeometry(w, len, 0.12, 3, 6, 2);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const t = (p.getY(i) + len / 2) / len; // 0 bottom .. 1 top
    let sx = 0.8 + 0.2 * (1 - t);
    if (t > 0.86) sx *= 1 - (t - 0.86) * 4.5;
    p.setX(i, p.getX(i) * sx);
    p.setZ(i, p.getZ(i) * (0.7 + 0.5 * Math.sin(Math.min(1, t * 1.2) * Math.PI * 0.9)));
  }
  const geo = organicGeo(g, 0.006, 6, seed);
  const m = k.geo(geo, M.fabric(col, 12), x, yTop - len / 2 - 0.04, z);
  m.rotation.y = rotY;
  // collar / hood bump at the hook
  k.sphere(0.07, M.fabric(darken(col, 0.08), 12), x, yTop - 0.06, z, 1.1, 0.8, 0.6, 10).rotation.y = rotY;
}

const hallTree = mk({
  id: 'hall-tree',
  name: 'מתלה כניסה עם ספסל ומעילים',
  category: 'living',
  group: ENTRY,
  tags: ['מתלה מעילים', 'ספסל', 'כניסה', 'מבואה', 'וווים', 'מעילים', 'נעליים'],
  size: { w: 1.0, d: 0.42, h: 1.9 },
  colors: [slot('wood', 'עץ', PAL.oak), slot('cushion', 'כרית', '#7c8a5c'), slot('hooks', 'ווים', '#26272a')],
  seats: [{ x: 0, z: 0.08, height: 0.5, facing: 0, kind: 'sit' }],
  build: (k, c) => {
    const wood = M.wood(c.wood);
    const hm = M.metal(c.hooks, 0.45, 0.7);
    const w = 1.0;
    const d = 0.42;
    const H = 1.9;
    for (const s of [-1, 1]) {
      k.rbox(0.04, H, 0.06, 0.006, wood, s * (w / 2 - 0.02), 0, -d / 2 + 0.03, 1);
      k.rbox(0.04, 0.44, 0.05, 0.006, wood, s * (w / 2 - 0.02), 0, d / 2 - 0.025, 1);
      k.box(0.04, 0.04, d - 0.08, wood, s * (w / 2 - 0.02), 0.06, 0);
    }
    // back: vertical boards + hat shelf
    const n = 6;
    for (let i = 0; i < n; i++) k.box((w - 0.08) / n - 0.006, H - 0.5, 0.018, wood, -w / 2 + 0.04 + ((w - 0.08) * (i + 0.5)) / n, 0.46, -d / 2 + 0.02);
    k.rbox(w, 0.025, 0.26, 0.005, wood, 0, H - 0.17, -d / 2 + 0.13, 1);
    k.rbox(w, 0.04, 0.06, 0.005, wood, 0, H - 0.04, -d / 2 + 0.03, 1);
    // bench + cushion + shoe shelf
    k.rbox(w - 0.08, 0.035, d - 0.04, 0.006, wood, 0, 0.42, 0.0, 1);
    k.cushion(w - 0.12, 0.06, d - 0.1, M.linen(c.cushion), 0, 0.455, 0.02, 0.025, 0.012, 2);
    k.box(w - 0.08, 0.02, d - 0.1, wood, 0, 0.1, 0.0);
    // hooks with coats, a bag and a scarf
    const hy = 1.5;
    const hz = -d / 2 + 0.04;
    const xs = [-0.27, -0.09, 0.11, 0.3];
    for (const x of xs) {
      k.rod([x, hy, hz - 0.01], [x, hy + 0.03, hz + 0.06], 0.006, hm, 0.006, 6);
      k.sphere(0.009, hm, x, hy + 0.03, hz + 0.06, 1, 1, 1, 6);
    }
    coat(k, xs[0], hy + 0.02, hz + 0.07, 0.95, '#3d4b5c', 1);
    coat(k, xs[2], hy + 0.02, hz + 0.08, 0.8, '#b48a5a', 2);
    const bag = k.rbox(0.28, 0.24, 0.1, 0.03, M.leather('#7a4a2a'), xs[3], hy - 0.36, hz + 0.08, 1);
    bag.rotation.z = 0.05;
    k.tube([[xs[3] - 0.1, hy - 0.13, hz + 0.08], [xs[3], hy + 0.03, hz + 0.06], [xs[3] + 0.1, hy - 0.13, hz + 0.08]], 0.006, M.leather('#5e3920'), { seg: 10, radial: 4 });
    k.tube([[xs[1] - 0.06, hy - 0.55, hz + 0.05], [xs[1], hy + 0.02, hz + 0.08], [xs[1] + 0.06, hy - 0.45, hz + 0.05]], 0.022, M.knit('#d6a544'), { seg: 14, radial: 6 });
    // hat + basket on the shelf, shoes underneath
    const hatY = H - 0.145;
    k.cyl(0.15, 0.012, M.fabric('#c9b48f', 10), -0.25, hatY, -d / 2 + 0.15, 0.15, 20);
    k.cyl(0.085, 0.09, M.fabric('#c9b48f', 10), -0.25, hatY + 0.01, -d / 2 + 0.15, 0.075, 16);
    basket(k, 0.25, hatY, -d / 2 + 0.14, 0.3, 0.13, 0.2, M.wicker('#c9a87a'));
    for (let i = 0; i < 3; i++) {
      const sx = -0.3 + i * 0.28;
      for (const o of [-0.05, 0.05]) {
        k.rbox(0.085, 0.07, 0.24, 0.03, M.leather(['#2b2c2e', '#e6dfd0', '#7a4a2a'][i]), sx + o, 0.12, 0.03, 1);
      }
    }
  },
  plan: (ctx, c) => {
    D.rr(ctx, 0, 0, 1.0, 0.42, 0.005, tint(c.wood, 0.4));
    D.rr(ctx, 0, 0.02, 0.88, 0.32, 0.02, tint(c.cushion, 0.4), INK_SOFT, LINE_THIN);
    D.line(ctx, -0.5, -0.18, 0.5, -0.18, INK_SOFT, LINE_THIN);
  },
});

const hallBench = mk({
  id: 'hall-bench-storage',
  name: 'ספסל כניסה עם תאי אחסון וסלסלות',
  category: 'living',
  group: ENTRY,
  tags: ['ספסל', 'כניסה', 'אחסון', 'סלסלות', 'נעליים', 'מבואה', 'ריפוד'],
  size: { w: 1.0, d: 0.4, h: 0.5 },
  colors: [slot('wood', 'עץ', '#f1efea'), slot('cushion', 'כרית', '#b8afa2'), slot('baskets', 'סלסלות', '#c9a87a')],
  seats: [
    { x: -0.25, z: 0.03, height: 0.5, facing: 0, kind: 'sit' },
    { x: 0.25, z: 0.03, height: 0.5, facing: 0, kind: 'sit' },
  ],
  build: (k, c) => {
    const m = M.paint(c.wood, 0.5);
    const w = 1.0;
    const d = 0.4;
    const b = carcass(k, { w, h: 0.44, d, mat: m, inner: MX.inside(c.wood), t: 0.022 });
    const cw = (b.x1 - b.x0 - 2 * 0.02) / 3;
    for (let i = 1; i < 3; i++) k.box(0.02, b.y1 - b.y0, d - 0.01, m, b.x0 + i * (cw + 0.02) - 0.01, b.y0, -0.005);
    for (let i = 0; i < 3; i++) {
      const x = b.x0 + cw / 2 + i * (cw + 0.02);
      if (i < 2) basket(k, x, b.y0, 0.01, cw - 0.02, b.y1 - b.y0 - 0.03, d - 0.04, M.wicker(c.baskets), M.wicker(darken(c.baskets, 0.2)));
      else for (const o of [-0.05, 0.05]) k.rbox(0.085, 0.08, 0.25, 0.03, M.leather(o < 0 ? '#3b2d24' : '#8b8d8f'), x + o, b.y0, 0.02, 1);
    }
    k.cushion(w - 0.02, 0.06, d - 0.02, M.fabric(c.cushion, 10), 0, 0.44, 0, 0.025, 0.012, 2);
  },
  plan: (ctx, c) => {
    D.rr(ctx, 0, 0, 1.0, 0.4, 0.01, tint(c.wood, 0.3));
    D.rr(ctx, 0, 0, 0.98, 0.38, 0.03, tint(c.cushion, 0.35), INK_SOFT, LINE_THIN);
  },
});

const coatStand = mk({
  id: 'hall-coat-stand',
  name: 'מתלה מעילים עומד',
  category: 'living',
  group: ENTRY,
  tags: ['מתלה מעילים', 'עומד', 'כניסה', 'עץ', 'ווים', 'כובע', 'מעיל'],
  size: { w: 0.56, d: 0.56, h: 1.87 },
  colors: [slot('wood', 'עץ', PAL.walnut)],
  build: (k, c) => {
    const wood = M.wood(c.wood);
    k.cyl(0.022, 1.78, wood, 0, 0.02, 0, 0.018, 12);
    k.sphere(0.03, wood, 0, 1.8, 0, 1, 0.8, 1, 10);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
      k.rod([0, 0.36, 0], [Math.cos(a) * 0.25, 0.012, Math.sin(a) * 0.25], 0.016, wood, 0.012, 8);
      k.sphere(0.014, M.rubber(), Math.cos(a) * 0.255, 0.012, Math.sin(a) * 0.255, 1, 0.9, 1, 8);
    }
    const hooks: number[] = [];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      hooks.push(a);
      const r0 = 0.02;
      const y = 1.62 + (i % 2) * 0.1;
      k.tube([[Math.cos(a) * r0, y - 0.06, Math.sin(a) * r0], [Math.cos(a) * 0.1, y + 0.0, Math.sin(a) * 0.1], [Math.cos(a) * 0.13, y + 0.07, Math.sin(a) * 0.13]], 0.009, wood, { seg: 8, radial: 6 });
      k.sphere(0.014, wood, Math.cos(a) * 0.13, y + 0.07, Math.sin(a) * 0.13, 1, 1, 1, 8);
    }
    // a coat, a hat and a tote bag
    const a0 = hooks[0];
    coat(k, Math.cos(a0) * 0.1, 1.64, Math.sin(a0) * 0.1, 0.95, '#6f7f6a', 3, Math.PI / 2 - a0);
    const a2 = hooks[2];
    k.cyl(0.15, 0.01, M.fabric('#2f3236', 10), Math.cos(a2) * 0.12, 1.75, Math.sin(a2) * 0.12, 0.15, 18).rotation.x = 0.25;
    k.cyl(0.08, 0.09, M.fabric('#2f3236', 10), Math.cos(a2) * 0.12, 1.75, Math.sin(a2) * 0.12, 0.075, 14).rotation.x = 0.25;
    const a1 = hooks[1];
    const bx = Math.cos(a1) * 0.17;
    const bz = Math.sin(a1) * 0.17;
    k.rbox(0.3, 0.34, 0.06, 0.015, M.fabric('#e6dccb', 10), bx, 1.12, bz, 1).rotation.y = -a1 + Math.PI / 2;
    k.tube([[bx - 0.08, 1.45, bz], [Math.cos(a1) * 0.12, 1.65, Math.sin(a1) * 0.12], [bx + 0.08, 1.45, bz]], 0.006, M.fabric('#c9b48f', 10), { seg: 8, radial: 4 });
  },
  plan: (ctx, c) => {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
      D.line(ctx, 0, 0, Math.cos(a) * 0.25, Math.sin(a) * 0.25, c.wood, 0.03);
    }
    D.circle(ctx, 0, 0, 0.13, null, INK_SOFT, LINE_THIN);
    D.circle(ctx, 0, 0, 0.03, tint(c.wood, 0.2));
  },
});

/* ================================================================== wall storage */

const shelfFloating = mk({
  id: 'shelf-floating-set',
  name: 'סט מדפים צפים עם עיצוב',
  category: 'living',
  group: BOOKCASE,
  tags: ['מדפים צפים', 'קיר', 'מדף', 'עץ', 'עציץ', 'ספרים', 'מעוצב'],
  size: { w: 1.0, d: 0.22, h: 0.8 },
  mount: 'wall',
  elevation: 1.05,
  colors: [slot('wood', 'עץ', PAL.oak)],
  actions: READ,
  build: (k, c) => {
    const wood = M.wood(c.wood);
    const d = 0.22;
    const t = 0.035;
    const shelves = [
      { x: -0.15, y: 0.0, w: 0.7 },
      { x: 0.15, y: 0.33, w: 0.7 },
      { x: -0.1, y: 0.66 - t + 0.045, w: 0.8 },
    ];
    for (const s of shelves) k.rbox(s.w, t, d, 0.004, wood, s.x, s.y, 0, 1);
    const [a, b, cc] = shelves.map((s) => s.y + t);
    // bottom: books + trailing plant
    bookRow(k, -0.48, -0.15, a, d / 2, d - 0.02, 0.28, 171, 0.9);
    smallPlant(k, 0.07, a, -0.03, 0.75, M.ceramic('#efebe4'), PAL.leaf, 172);
    // middle: frame + vase + candle
    leaningFrame(k, 0.0, b, -0.05, 0.2, 0.25, M.matte('#1e1f22'), M.art('circles', 5, ['#efe9de', '#c7775a', '#d6a544'], 0.12, 0.17));
    vase(k, 0.3, b, 0, 0.16, 0.05, M.ceramic('#c7775a'), 'bud');
    k.cyl(0.03, 0.07, M.matte('#f4efe4'), 0.42, b, 0.01, 0.03, 12);
    // top (only partly under the declared height)
    const yy = bookStack(k, -0.3, cc, 0, 2, 173);
    vase(k, -0.3, yy, 0, 0.004 + 0.02, 0.05, M.ceramic('#3d5166'), 'bowl');
  },
  plan: (ctx, c) => {
    D.rr(ctx, -0.1, 0, 0.8, 0.22, 0.004, tint(c.wood, 0.35));
    D.rr(ctx, -0.15, 0, 0.7, 0.22, 0.004, null, INK_SOFT, LINE_THIN);
    D.rr(ctx, 0.15, 0, 0.7, 0.22, 0.004, null, INK_SOFT, LINE_THIN);
  },
});

const wallCabinetCane = mk({
  id: 'wall-cabinet-cane',
  name: 'ארונית קיר עם דלתות קש',
  category: 'living',
  group: 'ארונות',
  tags: ['ארונית', 'קיר', 'תלויה', 'קש', 'ראטן', 'אמבטיה', 'מטבח'],
  size: { w: 0.7, d: 0.3, h: 0.62 },
  mount: 'wall',
  elevation: 1.35,
  colors: [slot('wood', 'עץ', PAL.oak), slot('cane', 'קש', '#d7bb8c')],
  actions: OPEN,
  build: (k, c) => {
    const wood = M.wood(c.wood);
    const w = 0.7;
    const d = 0.3;
    const hd = handleDepth('knob');
    const cd = d - hd - 0.02;
    const cz = -d / 2 + cd / 2;
    const b = carcass(k, { w, h: 0.62, d: cd, z: cz, mat: wood, inner: MX.inside(c.wood) });
    k.box(b.x1 - b.x0, 0.016, cd - 0.03, wood, 0, 0.3, cz);
    for (let i = 0; i < 3; i++) k.cyl(0.04, 0.1, M.ceramic(['#f4f1ea', '#c9d3dc', '#e8c9bd'][i]), -0.2 + i * 0.1, 0.316, cz, 0.036, 12);
    foldedStack(k, 0.15, b.y0, cz, 0.24, 0.2, 4, 181);
    doorRow(k, -w / 2 + 0.002, w / 2 - 0.002, 0.002, 0.616, d / 2 - hd, 2, 'cane', { front: wood, frame: wood, cane: M.rattan(c.cane) }, 'knob', M.brass(), { hy: 0.12 });
  },
  plan: (ctx, c) => {
    planCase(ctx, 0.7, 0.3, c.wood, { doors: 2 });
  },
});

export const STORAGE: FurnitureDef[] = [
  wardrobe2,
  wardrobe3,
  wardrobeMirror,
  wardrobeRattan,
  wallCabinetCane,
  chestMcm,
  chestTall,
  chestCane,
  chestWide,
  nsMcm,
  nsCane,
  nsPedestal,
  nsFloat,
  nsLacquer,
  nsMetal,
  shelfLadder,
  shelfCube,
  shelfOpenMetal,
  shelfVitrine,
  shelfArched,
  shelfFloating,
  credenzaFluted,
  credenzaCane,
  credenzaLacquer,
  mediaOakTv,
  mediaWalnut,
  mediaFloat,
  shoeCabinet,
  hallTree,
  hallBench,
  coatStand,
];

