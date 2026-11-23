/**
 * Textiles: rugs, curtains / blinds, floor cushions and a throw-blanket basket.
 * Rugs use `M.rug(style, palette, w, d)` on the top face of a `k.slab` of a centred w × d shape,
 * curtains are procedural drapes (irregular folds, gathered tie-backs, cascading roman folds).
 */
import * as THREE from 'three';
import type { FurnitureDef } from '../types';
import {
  D,
  INK_SOFT,
  Kit,
  LINE_THIN,
  M,
  boxUV,
  darken,
  ellipseShape,
  extrudeZ,
  lighten,
  mix,
  rng,
  roundedRectShape,
  sym,
  tint,
  type Ctx2D,
  type RugStyle,
  type V3,
} from '../kit';
import { slot } from './_parts';

/* ------------------------------------------------------------------------------ helpers */

function noShadow<T extends THREE.Object3D>(o: T): T {
  o.castShadow = false;
  return o;
}

/** Double-sided copies of shared kit materials (curtains, throws). Cached, never disposed. */
const dsCache = new Map<string, THREE.Material>();
function ds<T extends THREE.Material>(m: T): T {
  const key = m.name || m.uuid;
  let c = dsCache.get(key) as T | undefined;
  if (!c) {
    c = m.clone() as T;
    c.side = THREE.DoubleSide;
    c.name = `${key}|ds`;
    dsCache.set(key, c);
  }
  return c;
}

/** Translucent voile. */
const sheerCache = new Map<string, THREE.MeshStandardMaterial>();
function sheer(color: string, opacity = 0.42): THREE.MeshStandardMaterial {
  const key = `${color}|${opacity}`;
  let m = sheerCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false });
    m.name = `sheer|${key}`;
    sheerCache.set(key, m);
  }
  return m;
}

/** Shape from a closed list of points (no smoothing). */
function polyShape(pts: Array<[number, number]>): THREE.Shape {
  const s = new THREE.Shape();
  pts.forEach(([x, y], i) => (i === 0 ? s.moveTo(x, y) : s.lineTo(x, y)));
  s.closePath();
  return s;
}

/** Organic closed outline: polar radius function sampled n times around an ellipse. */
function organicPts(rx: number, ry: number, n: number, rad: (a: number) => number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = rad(a);
    out.push([Math.cos(a) * rx * k, Math.sin(a) * ry * k]);
  }
  return out;
}

/** A rug body: slab of `shape` with the rug texture on top (shape is already inset by `bevel`). */
function rugSlab(k: Kit, shape: THREE.Shape, h: number, mat: THREE.Material, bevel = 0.003, curve = 10, y = 0): THREE.Mesh {
  const m = k.slab(shape, h, mat, 0, y, 0, bevel, curve);
  m.castShadow = false;
  return m;
}

/** Fringe strands lying on the floor, starting at x = 0 and pointing to +X, spread along z. */
function fringeGeo(len: number, span: number, seed: number, pitch = 0.011): THREE.BufferGeometry {
  const r = rng(seed);
  const n = Math.round(span / pitch);
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < n; i++) {
    const z = -span / 2 + ((i + 0.5) / n) * span;
    const L = len * (0.74 + r() * 0.26);
    const ang = (r() - 0.5) * 0.35;
    const wd = 0.0042;
    const ex = Math.cos(ang) * L;
    const ez = Math.sin(ang) * L;
    const b = pos.length / 3;
    // two segments per strand so it droops from the rug edge to the floor
    pos.push(-0.004, 0.006, z - wd / 2, -0.004, 0.006, z + wd / 2);
    pos.push(ex * 0.35, 0.0025, z + ez * 0.35 - wd / 2, ex * 0.35, 0.0025, z + ez * 0.35 + wd / 2);
    pos.push(ex, 0.0012, z + ez - wd / 2, ex, 0.0012, z + ez + wd / 2);
    idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2, b + 2, b + 3, b + 4, b + 3, b + 5, b + 4);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Fringe on both short ends (x = ±bodyW / 2) of a rug. */
function fringes(k: Kit, bodyW: number, span: number, len: number, color: string, seed = 1): void {
  const mat = M.cloth(color);
  const a = noShadow(k.geo(fringeGeo(len, span, seed), mat, bodyW / 2, 0, 0));
  a.receiveShadow = true;
  const b = noShadow(k.geo(fringeGeo(len, span, seed + 7), mat, -bodyW / 2, 0, 0));
  b.rotation.y = Math.PI;
}

/** Plan: fringe ticks at both short ends. */
function fringePlan(ctx: Ctx2D, bodyW: number, d: number, len: number): void {
  const n = Math.round(d / 0.05);
  for (let i = 0; i <= n; i++) {
    const z = -d / 2 + (i / n) * d;
    for (const s of [-1, 1]) D.line(ctx, (s * bodyW) / 2, z, s * (bodyW / 2 + len), z, INK_SOFT, 0.006);
  }
}

/** Torus lying flat with UVs in meters (for woven materials). */
function flatTorus(R: number, r: number, radial: number, tubular: number): THREE.BufferGeometry {
  const g = new THREE.TorusGeometry(R, r, radial, tubular);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.PI * 2 * R, uv.getY(i) * Math.PI * 2 * r);
  g.rotateX(Math.PI / 2);
  return g;
}

/* ===================================================================== RUGS */

const RUG = { category: 'decor' as const, group: 'שטיחים', walkable: true };

/** Rectangular patterned rug with optional fringe. */
function patternRug(o: {
  id: string;
  name: string;
  tags: string[];
  w: number;
  d: number;
  h: number;
  style: RugStyle;
  slots: Array<[string, string, string]>;
  palette: (c: Record<string, string>) => string[];
  fringe?: number;
  fringeColor?: string;
  corner?: number;
  bevel?: number;
  binding?: string;
}): FurnitureDef {
  const fl = o.fringe ?? 0;
  const bodyW = o.w - 2 * fl;
  return {
    ...RUG,
    id: o.id,
    name: o.name,
    tags: o.tags,
    size: { w: o.w, d: o.d, h: o.h },
    colors: o.slots.map(([k, l, d]) => slot(k, l, d)),
    build: ({ colors: c }) => {
      const k = new Kit();
      const bev = o.bevel ?? 0.003;
      const pal = o.palette(c);
      if (o.binding) {
        const bw = 0.035;
        rugSlab(k, roundedRectShape(bodyW - 2 * bw, o.d - 2 * bw, Math.max(0.001, (o.corner ?? 0.01) - bw)), o.h * 0.85, M.rug(o.style, pal, bodyW - 2 * bw, o.d - 2 * bw), 0.002);
        const frame = roundedRectShape(bodyW - 0.004, o.d - 0.004, o.corner ?? 0.01);
        const hole = new THREE.Path();
        const iw = bodyW - 2 * bw;
        const id = o.d - 2 * bw;
        hole.moveTo(-iw / 2, -id / 2);
        hole.lineTo(-iw / 2, id / 2);
        hole.lineTo(iw / 2, id / 2);
        hole.lineTo(iw / 2, -id / 2);
        hole.closePath();
        frame.holes.push(hole);
        rugSlab(k, frame, o.h, M.fabric(o.binding === 'slot' ? c.binding : o.binding, 30), 0.002);
      } else {
        rugSlab(k, roundedRectShape(bodyW - 2 * bev, o.d - 2 * bev, o.corner ?? 0.01), o.h, M.rug(o.style, pal, bodyW, o.d), bev);
      }
      if (fl > 0) fringes(k, bodyW, o.d - 0.03, fl, o.fringeColor === 'slot' ? c.fringe : (o.fringeColor ?? '#efe6d2'), o.id.length);
      return k.g;
    },
    draw2d: (ctx, c) =>
      sym(ctx, () => {
        const pal = o.palette(c);
        D.rr(ctx, 0, 0, bodyW, o.d, o.corner ?? 0.01, tint(pal[0], 0.35), INK_SOFT);
        if (o.style === 'persian' || o.style === 'border') {
          const bw = Math.min(bodyW, o.d) * 0.1;
          D.rr(ctx, 0, 0, bodyW - 2 * bw, o.d - 2 * bw, 0, null, tint(pal[1], 0.1), 0.02);
          D.ellipse(ctx, 0, 0, Math.min(bodyW * 0.18, o.d * 0.3), o.d * 0.22, tint(pal[1], 0.3), INK_SOFT, LINE_THIN);
        } else if (o.style === 'stripes') {
          for (let i = 1; i < 9; i++) if (i % 2) D.rr(ctx, -bodyW / 2 + ((i + 0.5) / 9) * bodyW, 0, bodyW / 9, o.d, 0, tint(pal[1], 0.35), null);
        } else if (o.style === 'checker') {
          const n = 8;
          const m = Math.max(2, Math.round((n * bodyW) / o.d));
          for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) if ((i + j) % 2) D.rr(ctx, -bodyW / 2 + ((i + 0.5) / m) * bodyW, -o.d / 2 + ((j + 0.5) / n) * o.d, bodyW / m, o.d / n, 0, tint(pal[1], 0.35), null);
        } else if (o.style === 'kilim' || o.style === 'diamond' || o.style === 'lattice') {
          const n = 6;
          for (let j = 0; j < n; j++) {
            const z = -o.d / 2 + ((j + 0.5) / n) * o.d;
            const m = Math.max(3, Math.round((bodyW / o.d) * n));
            for (let i = 0; i < m; i++) {
              const x = -bodyW / 2 + ((i + 0.5) / m) * bodyW;
              const a = (bodyW / m) * 0.35;
              const b = (o.d / n) * 0.35;
              D.poly(ctx, [[x - a, z], [x, z - b], [x + a, z], [x, z + b]], true, tint(pal[1], 0.3), null);
            }
          }
        }
        D.rr(ctx, 0, 0, bodyW, o.d, o.corner ?? 0.01, null, INK_SOFT);
        if (fl > 0) fringePlan(ctx, bodyW, o.d - 0.03, fl * 0.9);
      }),
  };
}

const persianLarge = patternRug({
  id: 'rug-persian-large',
  name: 'שטיח פרסי גדול',
  tags: ['פרסי', 'מזרחי', 'צמר', 'מדליון', 'קלאסי', 'שטיח'],
  w: 3.12,
  d: 2.0,
  h: 0.012,
  style: 'persian',
  slots: [
    ['field', 'רקע', '#8e2f2a'],
    ['border', 'מסגרת', '#1f3552'],
    ['accent', 'עיטורים', '#d8b377'],
    ['fringe', 'פרנזים', '#efe6d2'],
  ],
  palette: (c) => [c.field, c.border, darken(c.border, 0.35), c.accent],
  fringe: 0.06,
  fringeColor: 'slot',
  corner: 0.008,
});

const persianRunner = patternRug({
  id: 'rug-persian-runner',
  name: 'שטיח ראנר מזרחי למסדרון',
  tags: ['ראנר', 'מסדרון', 'מזרחי', 'פרסי', 'צר וארוך', 'שטיח'],
  w: 2.86,
  d: 0.8,
  h: 0.011,
  style: 'persian',
  slots: [
    ['field', 'רקע', '#2f4a62'],
    ['border', 'מסגרת', '#9c3b30'],
    ['accent', 'עיטורים', '#e6cf9b'],
    ['fringe', 'פרנזים', '#efe6d2'],
  ],
  palette: (c) => [c.field, c.border, darken(c.field, 0.4), c.accent],
  fringe: 0.05,
  fringeColor: 'slot',
  corner: 0.006,
});

const kilim = patternRug({
  id: 'rug-kilim',
  name: 'שטיח קילים ארוג',
  tags: ['קילים', 'אריג שטוח', 'אתני', 'בוהו', 'צבעוני', 'שטיח'],
  w: 2.24,
  d: 1.5,
  h: 0.007,
  style: 'kilim',
  slots: [
    ['base', 'בסיס', '#b5523b'],
    ['pattern', 'דוגמה', '#e8d9bc'],
    ['dark', 'קווים', '#2f4858'],
    ['accent', 'הדגשה', '#d9a441'],
  ],
  palette: (c) => [c.base, c.pattern, c.dark, c.accent],
  fringe: 0.06,
  fringeColor: '#e3d3b4',
  corner: 0.004,
  bevel: 0.002,
});

const stripedFlat = patternRug({
  id: 'rug-striped-flatweave',
  name: 'שטיח פסים אריג שטוח',
  tags: ['פסים', 'כותנה', 'אריג שטוח', 'סקנדינבי', 'כביס', 'שטיח'],
  w: 2.0,
  d: 1.4,
  h: 0.008,
  style: 'stripes',
  slots: [
    ['base', 'בסיס', '#ebe4d6'],
    ['stripe', 'פס', '#3d5166'],
    ['accent', 'פס דק', '#c7775a'],
  ],
  palette: (c) => [c.base, c.stripe, c.accent, lighten(c.base, 0.4)],
  fringe: 0.04,
  fringeColor: '#ebe4d6',
  corner: 0.004,
  bevel: 0.002,
});

const checker = patternRug({
  id: 'rug-checkerboard',
  name: 'שטיח משבצות',
  tags: ['משבצות', 'דמקה', 'צמר', 'מודרני', 'רטרו', 'שטיח'],
  w: 2.0,
  d: 2.0,
  h: 0.014,
  style: 'checker',
  slots: [
    ['a', 'משבצת בהירה', '#ece4d4'],
    ['b', 'משבצת כהה', '#b98a5f'],
  ],
  palette: (c) => [c.a, c.b],
  corner: 0.02,
  bevel: 0.004,
});

const outdoor = patternRug({
  id: 'rug-outdoor',
  name: 'שטיח חוץ עמיד',
  tags: ['חוץ', 'מרפסת', 'פוליפרופילן', 'עמיד למים', 'גינה', 'שטיח'],
  w: 2.4,
  d: 1.6,
  h: 0.008,
  style: 'diamond',
  slots: [
    ['base', 'בסיס', '#2f4858'],
    ['pattern', 'דוגמה', '#e9e3d6'],
    ['binding', 'שוליים', '#1f2d38'],
  ],
  palette: (c) => [c.base, c.pattern, darken(c.base, 0.3), c.pattern],
  binding: 'slot',
  corner: 0.01,
});

/** Moroccan lattice: thick pile, softly rounded edge, short fringe. */
const moroccan: FurnitureDef = {
  ...RUG,
  id: 'rug-moroccan-lattice',
  name: 'שטיח מרוקאי סריג',
  tags: ['מרוקאי', 'בני ואוריין', 'צמר', 'סריג', 'פלאפי', 'שטיח'],
  size: { w: 2.5, d: 1.7, h: 0.028 },
  colors: [slot('base', 'בסיס', '#efe8da'), slot('lines', 'קווים', '#3b3a38')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const bw = 2.4;
    const d = 1.7;
    rugSlab(k, roundedRectShape(bw - 0.02, d - 0.02, 0.03), 0.026, M.rug('lattice', [c.base, c.lines], bw, d), 0.01, 8);
    fringes(k, bw, d - 0.06, 0.05, mix(c.base, '#ffffff', 0.2), 3);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 2.4, 1.7, 0.03, tint(c.base, 0.2), INK_SOFT);
      ctx.save();
      ctx.beginPath();
      ctx.rect(-1.2, -0.85, 2.4, 1.7);
      ctx.clip();
      ctx.strokeStyle = tint(c.lines, 0.3);
      ctx.lineWidth = 0.012;
      const cw = 2.4 / 8;
      const ch = 1.7 / 6;
      for (let i = -1; i <= 9; i++)
        for (let j = -1; j <= 7; j++) {
          const cx = -1.2 + i * cw + (j % 2 ? cw / 2 : 0);
          const cy = -0.85 + j * ch;
          ctx.beginPath();
          ctx.moveTo(cx, cy - ch / 2);
          ctx.lineTo(cx + cw / 2, cy);
          ctx.lineTo(cx, cy + ch / 2);
          ctx.lineTo(cx - cw / 2, cy);
          ctx.closePath();
          ctx.stroke();
        }
      ctx.restore();
      fringePlan(ctx, 2.4, 1.64, 0.045);
    }),
};

const abstract: FurnitureDef = {
  ...RUG,
  id: 'rug-abstract-organic',
  name: 'שטיח מודרני אבסטרקטי בצורה אורגנית',
  tags: ['אבסטרקט', 'אורגני', 'מודרני', 'אמנותי', 'צורה לא סימטרית', 'שטיח'],
  size: { w: 2.44, d: 1.8, h: 0.016 },
  colors: [slot('base', 'בסיס', '#e6dccb'), slot('a', 'צבע 1', '#c7775a'), slot('b', 'צבע 2', '#7c8a5c'), slot('c', 'צבע 3', '#3d5166')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const pts = organicPts(1.28, 0.88, 72, (a) => 0.97 - 0.04 * Math.cos(2 * a + 0.6) - 0.035 * Math.sin(3 * a + 1.1) + 0.02 * Math.cos(5 * a));
    const shape = polyShape(pts.map(([x, y]) => [x * 0.985, y * 0.985]));
    rugSlab(k, shape, 0.016, M.rug('abstract', [c.base, c.a, c.b, c.c], 2.44, 1.8), 0.005);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const pts = organicPts(1.28, 0.88, 72, (a) => 0.97 - 0.04 * Math.cos(2 * a + 0.6) - 0.035 * Math.sin(3 * a + 1.1) + 0.02 * Math.cos(5 * a));
      D.poly(ctx, pts.map(([x, y]) => [x, -y] as [number, number]), true, tint(c.base, 0.2), INK_SOFT);
      D.ellipse(ctx, -0.45, -0.15, 0.4, 0.25, tint(c.a, 0.35) + 'cc', null, 0, 0.4);
      D.ellipse(ctx, 0.35, 0.2, 0.35, 0.22, tint(c.b, 0.35) + 'cc', null, 0, -0.3);
      D.ellipse(ctx, 0.5, -0.35, 0.22, 0.14, tint(c.c, 0.35) + 'cc', null, 0, 0.8);
    }),
};

/** Round shag pile: a disc whose top is lumpy with clumps of long pile, rolling down at the edge. */
function shagGeo(R: number, h: number, seed: number): THREE.BufferGeometry {
  const rings = 22;
  const segs = 56;
  const r = rng(seed);
  const off = r() * 10;
  const pos: number[] = [0, h * 0.9, 0];
  const uv: number[] = [0, 0];
  const idx: number[] = [];
  for (let i = 1; i <= rings + 2; i++) {
    for (let j = 0; j < segs; j++) {
      const a = (j / segs) * Math.PI * 2;
      let rr: number;
      let y: number;
      if (i <= rings) {
        rr = (i / rings) * (R - 0.012);
        const n = Math.sin(a * 9 + off + i * 0.7) * Math.sin(i * 1.9 + a * 3) * 0.5 + 0.5;
        const edge = Math.min(1, (R - rr) / 0.05);
        y = h * (0.7 + 0.3 * n) * (0.45 + 0.55 * edge);
      } else if (i === rings + 1) {
        rr = R;
        y = h * 0.28;
      } else {
        rr = R - 0.004;
        y = 0;
      }
      pos.push(Math.cos(a) * rr, y, Math.sin(a) * rr);
      uv.push(Math.cos(a) * rr, Math.sin(a) * rr);
    }
  }
  for (let j = 0; j < segs; j++) idx.push(0, 1 + ((j + 1) % segs), 1 + j);
  for (let i = 0; i < rings + 1; i++)
    for (let j = 0; j < segs; j++) {
      const a = 1 + i * segs + j;
      const b = 1 + i * segs + ((j + 1) % segs);
      const c = a + segs;
      const d = b + segs;
      idx.push(a, b, c, b, d, c);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const shagRound: FurnitureDef = {
  ...RUG,
  id: 'rug-shag-round',
  name: 'שטיח שאגי עגול',
  tags: ['שאגי', 'עגול', 'פלאפי', 'רך', 'סיב ארוך', 'שטיח'],
  size: { w: 1.6, d: 1.6, h: 0.045 },
  colors: [slot('main', 'צבע', '#d6cdbd')],
  build: ({ colors: c }) => {
    const k = new Kit();
    k.geo(shagGeo(0.8, 0.045, 7), M.fur(c.main), 0, 0, 0).castShadow = false;
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.circle(ctx, 0, 0, 0.8, tint(c.main, 0.2), INK_SOFT);
      const r = rng(5);
      for (let i = 0; i < 70; i++) {
        const a = r() * Math.PI * 2;
        const d = Math.sqrt(r()) * 0.72;
        const x = Math.cos(a) * d;
        const y = Math.sin(a) * d;
        D.line(ctx, x, y, x + (r() - 0.5) * 0.05, y + 0.04, darken(tint(c.main, 0.2), 0.15), 0.006);
      }
    }),
};

const juteRound: FurnitureDef = {
  ...RUG,
  id: 'rug-jute-round',
  name: 'שטיח יוטה קלוע עגול',
  tags: ['יוטה', 'קלוע', 'עגול', 'טבעי', 'חבל', 'שטיח'],
  size: { w: 1.5, d: 1.5, h: 0.02 },
  colors: [slot('jute', 'יוטה', '#c2a57a')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const a = M.wicker(c.jute);
    const b = M.wicker(darken(c.jute, 0.07));
    noShadow(k.disc(0.03, 0.016, a, 0, 0.002, 0, 12));
    let i = 0;
    for (let R = 0.055; R < 0.73; R += 0.05, i++) {
      const g = flatTorus(R, 0.026, 4, Math.max(14, Math.round(R * 70)));
      g.scale(1, 0.36, 1);
      noShadow(k.geo(g, i % 2 ? a : b, 0, 0.0095, 0)).rotation.y = i * 0.7;
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.circle(ctx, 0, 0, 0.75, tint(c.jute, 0.35), INK_SOFT);
      for (let R = 0.055; R < 0.73; R += 0.1) D.circle(ctx, 0, 0, R, null, darken(tint(c.jute, 0.35), 0.18), 0.006);
    }),
};

/** Cowhide outline (spine along X, neck at +X). */
const HIDE: Array<[number, number]> = [
  [0.98, 0.02],
  [0.93, 0.17],
  [0.76, 0.27],
  [0.8, 0.52],
  [0.7, 0.82],
  [0.55, 0.69],
  [0.43, 0.44],
  [0.1, 0.5],
  [-0.3, 0.47],
  [-0.48, 0.5],
  [-0.62, 0.73],
  [-0.76, 0.83],
  [-0.82, 0.58],
  [-0.78, 0.3],
  [-0.97, 0.13],
  [-0.97, -0.1],
  [-0.79, -0.32],
  [-0.84, -0.6],
  [-0.73, -0.84],
  [-0.6, -0.7],
  [-0.46, -0.48],
  [-0.05, -0.52],
  [0.4, -0.45],
  [0.53, -0.7],
  [0.69, -0.83],
  [0.79, -0.56],
  [0.75, -0.3],
  [0.94, -0.16],
];
const SPOTS: Array<[number, number, number, number]> = [
  [0.55, 0.1, 0.2, 1],
  [0.1, 0.25, 0.17, 2],
  [-0.35, -0.05, 0.24, 3],
  [0.25, -0.28, 0.14, 4],
  [-0.6, 0.35, 0.1, 5],
  [0.62, -0.42, 0.09, 6],
  [-0.1, -0.33, 0.1, 7],
  [-0.62, -0.42, 0.1, 8],
];
function spotPts(cx: number, cy: number, r: number, seed: number): Array<[number, number]> {
  const rr = rng(seed * 31);
  const ph = [rr() * 6, rr() * 6, rr() * 6];
  return organicPts(r, r * (0.7 + rr() * 0.4), 22, (a) => 1 + 0.18 * Math.sin(2 * a + ph[0]) + 0.12 * Math.sin(3 * a + ph[1]) + 0.06 * Math.sin(5 * a + ph[2])).map(([x, y]) => [cx + x, cy + y]);
}

const cowhide: FurnitureDef = {
  ...RUG,
  id: 'rug-cowhide',
  name: 'שטיח עור פרה',
  tags: ['עור פרה', 'כתמים', 'כפרי', 'מערבי', 'טבעי', 'שטיח'],
  size: { w: 2.0, d: 1.7, h: 0.008 },
  colors: [slot('hide', 'עור', '#f1ece4'), slot('spots', 'כתמים', '#5b3a29')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const s = new THREE.Shape();
    const v = HIDE.map(([x, y]) => new THREE.Vector2(x * 0.995, y * 0.995));
    s.moveTo(v[0].x, v[0].y);
    s.splineThru([...v.slice(1), v[0]]);
    rugSlab(k, s, 0.006, M.fur(c.hide), 0.002, 3);
    const spot = M.fur(c.spots);
    for (const [x, y, r, seed] of SPOTS) {
      const sp = new THREE.Shape();
      const pv = spotPts(x, y, r, seed).map(([a, b]) => new THREE.Vector2(a, b));
      sp.moveTo(pv[0].x, pv[0].y);
      sp.splineThru([...pv.slice(1), pv[0]]);
      noShadow(k.slab(sp, 0.0015, spot, 0, 0.0062, 0, 0, 2));
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const curve = (pts: Array<[number, number]>, fill: string, stroke: string | null) => {
        ctx.beginPath();
        const n = pts.length;
        const mid = (i: number): [number, number] => [(pts[i % n][0] + pts[(i + 1) % n][0]) / 2, -(pts[i % n][1] + pts[(i + 1) % n][1]) / 2];
        const m0 = mid(n - 1);
        ctx.moveTo(m0[0], m0[1]);
        for (let i = 0; i < n; i++) {
          const m = mid(i);
          ctx.quadraticCurveTo(pts[i][0], -pts[i][1], m[0], m[1]);
        }
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
        if (stroke) {
          ctx.strokeStyle = stroke;
          ctx.stroke();
        }
      };
      curve(HIDE, tint(c.hide, 0.2), INK_SOFT);
      for (const [x, y, r, seed] of SPOTS) curve(spotPts(x, y, r, seed), tint(c.spots, 0.3), null);
    }),
};

const SHEEP = (a: number): number =>
  0.93 + 0.1 * Math.pow(Math.max(0, Math.cos(2 * (a - Math.PI / 4))), 6) * 1.6 + 0.012 * Math.sin(23 * a) + 0.01 * Math.sin(37 * a + 1) - 0.06 * Math.pow(Math.cos(a), 8) * (Math.cos(a) > 0 ? 0 : 1);

const sheepskin: FurnitureDef = {
  ...RUG,
  id: 'rug-sheepskin',
  name: 'פרוות כבש',
  tags: ['פרווה', 'כבש', 'רך', 'סקנדינבי', 'היגה', 'שטיח'],
  size: { w: 0.94, d: 0.62, h: 0.04 },
  colors: [slot('fur', 'פרווה', '#f0e8d6')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const pts = organicPts(0.47, 0.3, 120, SHEEP);
    rugSlab(k, polyShape(pts), 0.04, M.fur(c.fur), 0.016, 4);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const pts = organicPts(0.47, 0.3, 120, SHEEP);
      D.poly(ctx, pts, true, tint(c.fur, 0.15), INK_SOFT);
      const r = rng(9);
      for (let i = 0; i < 26; i++) {
        const x = (r() - 0.5) * 0.7;
        const y = (r() - 0.5) * 0.4;
        D.arc(ctx, x, y, 0.03, 0.2, 2.4, darken(tint(c.fur, 0.15), 0.12), 0.006);
      }
    }),
};

/** Kids' play rug: plain rug with bright inlaid shapes (rainbow, sun, star, cloud, triangles). */
function starShape(cx: number, cy: number, r: number): THREE.Shape {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i / 10) * Math.PI * 2;
    const rr = i % 2 ? r * 0.45 : r;
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  return polyShape(pts);
}
function arcBand(cx: number, cy: number, r0: number, r1: number): THREE.Shape {
  const s = new THREE.Shape();
  s.absarc(cx, cy, r1, 0, Math.PI, false);
  s.lineTo(cx - r0, cy);
  s.absarc(cx, cy, r0, Math.PI, 0, true);
  s.closePath();
  return s;
}
const KIDS = { w: 2.0, d: 1.4 };

const kidsRug: FurnitureDef = {
  ...RUG,
  id: 'rug-kids-play',
  name: 'שטיח משחק לחדר ילדים',
  tags: ['ילדים', 'משחק', 'קשת', 'כוכב', 'צבעוני', 'שטיח'],
  size: { w: KIDS.w, d: KIDS.d, h: 0.016 },
  colors: [
    slot('base', 'רקע', '#bfe0e8'),
    slot('border', 'מסגרת', '#f4f1e8'),
    slot('c1', 'צבע 1', '#e85d4a'),
    slot('c2', 'צבע 2', '#f4c542'),
    slot('c3', 'צבע 3', '#59a96a'),
  ],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { w, d } = KIDS;
    rugSlab(k, roundedRectShape(w - 0.006, d - 0.006, 0.06), 0.012, M.rug('border', [c.base, c.border], w, d), 0.003);
    const y = 0.0118;
    const t = 0.0028;
    const put = (s: THREE.Shape, col: string) => noShadow(k.slab(s, t, M.fabric(col, 20), 0, y, 0, 0, 16));
    // rainbow (shape y -> world -z)
    put(arcBand(-0.45, -0.05, 0.3, 0.37), c.c1);
    put(arcBand(-0.45, -0.05, 0.23, 0.3), c.c2);
    put(arcBand(-0.45, -0.05, 0.16, 0.23), c.c3);
    // sun
    put(ellipseShape(0.13, 0.13, 0.45, 0.22), c.c2);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const cx = 0.45 + Math.cos(a) * 0.19;
      const cy = 0.22 + Math.sin(a) * 0.19;
      put(polyShape([[cx + Math.cos(a) * 0.05, cy + Math.sin(a) * 0.05], [cx + Math.cos(a + 1.8) * 0.025, cy + Math.sin(a + 1.8) * 0.025], [cx + Math.cos(a - 1.8) * 0.025, cy + Math.sin(a - 1.8) * 0.025]]), c.c2);
    }
    put(starShape(0.35, -0.32, 0.12), c.c1);
    put(starShape(0.7, -0.15, 0.07), c.c3);
    // cloud
    for (const [x, yy, r] of [[-0.2, 0.37, 0.07], [-0.1, 0.4, 0.09], [0.0, 0.37, 0.065]] as Array<[number, number, number]>) put(ellipseShape(r * 1.2, r, x, yy), c.border);
    // little hills
    put(polyShape([[-0.85, -0.5], [-0.65, -0.25], [-0.45, -0.5]]), c.c3);
    put(polyShape([[-0.55, -0.5], [-0.4, -0.32], [-0.25, -0.5]]), mix(c.c3, '#ffffff', 0.25));
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { w, d } = KIDS;
      D.rr(ctx, 0, 0, w, d, 0.06, tint(c.border, 0.2), INK_SOFT);
      D.rr(ctx, 0, 0, w - 0.22, d - 0.22, 0.03, tint(c.base, 0.3), null);
      ctx.lineWidth = 0.07;
      for (const [r, col] of [[0.335, c.c1], [0.265, c.c2], [0.195, c.c3]] as Array<[number, string]>) {
        ctx.strokeStyle = tint(col, 0.3);
        ctx.beginPath();
        ctx.arc(-0.45, 0.05, r, Math.PI, Math.PI * 2);
        ctx.stroke();
      }
      D.circle(ctx, 0.45, -0.22, 0.13, tint(c.c2, 0.3), null);
      const st: Array<[number, number]> = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
        const rr = i % 2 ? 0.054 : 0.12;
        st.push([0.35 + Math.cos(a) * rr, 0.32 + Math.sin(a) * rr]);
      }
      D.poly(ctx, st, true, tint(c.c1, 0.3), null);
      D.rr(ctx, 0, 0, w, d, 0.06, null, INK_SOFT);
    }),
};

const bathMat: FurnitureDef = {
  ...RUG,
  id: 'rug-bath-mat',
  name: 'שטיחון אמבטיה שניל',
  tags: ['אמבטיה', 'שניל', 'סופג', 'מקלחת', 'שטיחון'],
  size: { w: 0.8, d: 0.52, h: 0.03 },
  colors: [slot('main', 'צבע', '#9bb7b0')],
  build: ({ colors: c }) => {
    const k = new Kit();
    rugSlab(k, roundedRectShape(0.79, 0.51, 0.06), 0.008, M.fabric(darken(c.main, 0.15), 20), 0.002);
    const mat = M.boucle(c.main);
    const n = 10;
    for (let i = 0; i < n; i++) {
      const z = -0.225 + (i / (n - 1)) * 0.45;
      const half = 0.36 - (Math.abs(z) > 0.2 ? 0.02 : 0);
      noShadow(k.rod([-half, 0.019, z], [half, 0.019, z], 0.0125, mat, 0.0125, 8));
      for (const s of [-1, 1]) noShadow(k.sphere(0.0125, mat, s * half, 0.019, z, 1, 1, 1, 8));
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 0.8, 0.52, 0.06, tint(c.main, 0.35), INK_SOFT);
      for (let i = 0; i < 10; i++) {
        const z = -0.225 + (i / 9) * 0.45;
        D.line(ctx, -0.36, z, 0.36, z, darken(tint(c.main, 0.35), 0.18), 0.008);
      }
    }),
};

/* ===================================================================== CURTAINS */

interface DrapeOpts {
  folds: number;
  amp: number;
  seed?: number;
  /** tie-back: height (0..1 of the panel), side the fabric is gathered towards (-1 | 1), remaining width fraction */
  tie?: { v: number; side: number; squeeze: number };
  flare?: number;
  nv?: number;
  perFold?: number;
}

/**
 * Vertical drape in the XY plane facing +Z: x centred, y from 0 (hem) to `height` (heading).
 * Irregular folds that deepen towards the hem, optional gathered tie-back. UVs in meters.
 */
function drapeGeo(width: number, height: number, o: DrapeOpts): THREE.BufferGeometry {
  const nu = Math.round(o.folds * (o.perFold ?? 6));
  const nv = o.nv ?? 6;
  const r = rng(o.seed ?? 1);
  const famp = Array.from({ length: o.folds + 2 }, () => 0.7 + r() * 0.55);
  const fph = Array.from({ length: o.folds + 2 }, () => (r() - 0.5) * 0.5);
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= nv; j++) {
    const v = j / nv;
    const y = v * height;
    for (let i = 0; i <= nu; i++) {
      const u = i / nu;
      const fi = Math.min(o.folds, Math.floor(u * o.folds));
      let x = (u - 0.5) * width;
      let amp = o.amp * famp[fi] * (0.8 + 0.45 * (1 - v));
      const edge = Math.min(1, Math.min(u, 1 - u) * o.folds * 2 + 0.25);
      amp *= edge;
      let z = Math.sin(u * o.folds * Math.PI * 2 + fph[fi] * Math.sin(u * Math.PI)) * amp;
      if (o.tie) {
        const dv = v - o.tie.v;
        const sig = dv > 0 ? 0.16 : 0.45;
        const g = 1 - (1 - o.tie.squeeze) * Math.exp(-(dv * dv) / (2 * sig * sig));
        const xa = (o.tie.side * width) / 2;
        x = xa + (x - xa) * g;
        z *= 1 + (1 - g) * 0.9;
        z += (1 - g) * 0.02;
      }
      x *= 1 + (1 - v) * (o.flare ?? 0.03);
      pos.push(x, y, z);
      uv.push(x, y);
    }
  }
  const row = nu + 1;
  for (let j = 0; j < nv; j++)
    for (let i = 0; i < nu; i++) {
      const a = j * row + i;
      idx.push(a, a + 1, a + row, a + 1, a + row + 1, a + row);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Curtain rod along X at (y, z) with brackets back to the wall at zBack and finials. */
function curtainRod(k: Kit, w: number, y: number, z: number, zBack: number, r: number, mat: THREE.Material, finial: 'ball' | 'urn' | 'cap'): void {
  const fl = finial === 'cap' ? 0.012 : 0.04;
  k.rod([-w / 2 + fl, y, z], [w / 2 - fl, y, z], r, mat, r, 12);
  for (const s of [-1, 1]) {
    const x = s * (w / 2 - fl);
    if (finial === 'ball') {
      k.sphere(0.03, mat, s * (w / 2 - 0.03), y, z, 1, 1, 1, 14);
      k.rod([x - s * 0.006, y, z], [x + s * 0.002, y, z], r * 1.5, mat, r * 1.5, 12);
    } else if (finial === 'urn') {
      const u = k.lathe(
        [
          [0, 0],
          [r * 1.6, 0],
          [r * 1.6, 0.008],
          [0.024, 0.02],
          [0.026, 0.03],
          [0.016, 0.036],
          [0.009, 0.04],
          [0, 0.042],
        ],
        mat,
        x,
        y,
        z,
        14,
      );
      u.rotation.z = -s * Math.PI / 2;
    } else {
      k.rod([x, y, z], [x + s * 0.01, y, z], r * 1.15, mat, r * 1.15, 12);
    }
    // bracket
    const bx = s * (w / 2 - 0.14);
    k.rod([bx, y, zBack], [bx, y, z], 0.006, mat, 0.006, 8);
    const plate = k.cyl(0.022, 0.008, mat, 0, 0, 0, 0.022, 14);
    plate.rotation.x = Math.PI / 2;
    plate.position.set(bx, y, zBack + 0.004);
  }
}

/** Curtain rings / grommets around the rod at the given x positions. */
function rings(k: Kit, xs: number[], y: number, z: number, R: number, t: number, mat: THREE.Material, radial = 4, tubular = 9): void {
  for (const x of xs) {
    const m = k.geo(new THREE.TorusGeometry(R, t, radial, tubular), mat, x, y, z);
    m.rotation.y = Math.PI / 2;
  }
}

function curtainPlan(ctx: Ctx2D, w: number, rodZ: number, panels: Array<[number, number]>, folds: number, color: string, amp = 0.03): void {
  D.line(ctx, -w / 2 + 0.03, rodZ, w / 2 - 0.03, rodZ, INK_SOFT, 0.012);
  ctx.strokeStyle = darken(tint(color, 0.1), 0.25);
  ctx.lineWidth = 0.022;
  for (const [x0, x1] of panels) {
    ctx.beginPath();
    for (let i = 0; i <= 60; i++) {
      const u = i / 60;
      const x = x0 + (x1 - x0) * u;
      const y = rodZ + Math.sin(u * folds * Math.PI * 2) * amp;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

const SHEER = { w: 2.0, d: 0.14, h: 2.6 };
const curtainSheer: FurnitureDef = {
  id: 'curtain-sheer-voile',
  name: 'וילון וואל שקוף',
  category: 'decor',
  group: 'וילונות',
  tags: ['וילון', 'וואל', 'שקוף', 'מוסלין', 'אור רך', 'לבן'],
  size: { w: SHEER.w, d: SHEER.d, h: SHEER.h },
  mount: 'wall',
  elevation: 0.02,
  colors: [slot('fabric', 'בד', '#efe9dc'), slot('rod', 'מוט', '#c9ccce')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { w, d } = SHEER;
    const zb = -d / 2;
    const rodY = 2.56;
    const rodZ = 0.0;
    const metal = M.metal(c.rod, 0.35, 0.6);
    curtainRod(k, w, rodY, rodZ, zb, 0.009, metal, 'cap');
    const top = rodY - 0.028;
    const g = drapeGeo(1.88, top, { folds: 15, amp: 0.034, seed: 3, flare: 0.012, nv: 5, perFold: 6 });
    noShadow(k.geo(g, sheer(c.fabric, 0.55), 0, 0, rodZ));
    // weighted hem
    const hem = drapeGeo(1.88, 0.05, { folds: 15, amp: 0.034, seed: 3, flare: 0, nv: 1, perFold: 6 });
    hem.scale(1.012, 1, 1.18);
    noShadow(k.geo(hem, sheer(c.fabric, 0.8), 0, 0, rodZ));
    const xs: number[] = [];
    for (let i = 0; i <= 15; i++) xs.push(-0.94 + (i / 15) * 1.88);
    rings(k, xs, rodY, rodZ, 0.014, 0.0022, metal);
    return k.g;
  },
  draw2d: (ctx, c) => sym(ctx, () => curtainPlan(ctx, SHEER.w, 0, [[-0.94, 0.94]], 15, c.fabric, 0.034)),
};

const BLACKOUT = { w: 2.2, d: 0.18, h: 2.6, panel: 0.78 };
const curtainBlackout: FurnitureDef = {
  id: 'curtain-linen-blackout',
  name: 'וילון פשתן האפלה עם טבעות',
  category: 'decor',
  group: 'וילונות',
  tags: ['וילון', 'פשתן', 'האפלה', 'טבעות', 'חדר שינה', 'בד כבד'],
  size: { w: BLACKOUT.w, d: BLACKOUT.d, h: 2.56 },
  mount: 'wall',
  elevation: 0.02,
  colors: [slot('fabric', 'בד', '#b9ad98'), slot('rod', 'מוט', '#2a2b2e')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { w, d, panel } = BLACKOUT;
    const zb = -d / 2;
    const rodY = 2.52;
    const rodZ = 0.0;
    const metal = M.metal(c.rod, 0.45, 0.8);
    curtainRod(k, w, rodY, rodZ, zb, 0.014, metal, 'ball');
    const cloth = ds(M.linen(c.fabric));
    const lining = ds(M.linen(lighten(c.fabric, 0.55)));
    const folds = 6;
    for (const s of [-1, 1]) {
      const cx = s * (w / 2 - 0.07 - panel / 2);
      const top = rodY + 0.035;
      const g = drapeGeo(panel, top, { folds, amp: 0.05, seed: s > 0 ? 5 : 8, flare: 0.02, nv: 6, perFold: 7 });
      noShadow(k.geo(g, cloth, cx, 0, rodZ));
      // white blackout lining band visible along the hem
      const lg = drapeGeo(panel, 0.04, { folds, amp: 0.05, seed: s > 0 ? 5 : 8, flare: 0.0, nv: 1, perFold: 7 });
      lg.translate(0, 0, -0.005);
      noShadow(k.geo(lg, lining, cx, 0.004, rodZ));
      // grommets at the fold tops
      const xs: number[] = [];
      for (let i = 0; i <= folds * 2; i++) xs.push(cx - panel / 2 + (i / (folds * 2)) * panel);
      rings(k, xs, rodY + 0.004, rodZ, 0.022, 0.004, M.metal(c.rod, 0.3, 0.9));
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { w, panel } = BLACKOUT;
      curtainPlan(ctx, w, 0, [[-w / 2 + 0.07, -w / 2 + 0.07 + panel], [w / 2 - 0.07 - panel, w / 2 - 0.07]], 6, c.fabric, 0.05);
    }),
};

const VELVET = { w: 2.3, d: 0.22, h: 2.66, panel: 0.84 };
const curtainVelvet: FurnitureDef = {
  id: 'curtain-velvet-tieback',
  name: 'וילון קטיפה עם קשירה',
  category: 'decor',
  group: 'וילונות',
  tags: ['וילון', 'קטיפה', 'קשירה', 'ציציות', 'קלאסי', 'יוקרה', 'פליז'],
  size: { w: VELVET.w, d: VELVET.d, h: VELVET.h },
  mount: 'wall',
  elevation: 0.0,
  colors: [slot('fabric', 'קטיפה', '#2f5d50'), slot('tie', 'קשירה', '#c9a35a'), slot('rod', 'מוט', '#c9a35a')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { w, d, panel } = VELVET;
    const zb = -d / 2;
    const rodY = 2.6;
    const rodZ = 0.0;
    const metal = M.metal(c.rod, 0.28, 1);
    curtainRod(k, w, rodY, rodZ, zb, 0.016, metal, 'urn');
    const cloth = ds(M.velvet(c.fabric));
    const rope = M.fabric(c.tie, 40);
    const tieV = 0.36;
    for (const s of [-1, 1]) {
      const cx = s * (w / 2 - 0.08 - panel / 2);
      const top = rodY - 0.045;
      const h = top - 0.004;
      const g = drapeGeo(panel, h, { folds: 7, amp: 0.045, seed: s > 0 ? 11 : 4, flare: 0.04, nv: 11, perFold: 5, tie: { v: tieV, side: s, squeeze: 0.3 } });
      noShadow(k.geo(g, cloth, cx, 0.004, rodZ));
      // rings with pins
      const xs: number[] = [];
      for (let i = 0; i <= 7; i++) xs.push(cx - panel / 2 + (i / 7) * panel);
      rings(k, xs, rodY, rodZ, 0.026, 0.0035, metal, 3, 8);
      for (const x of xs) k.rod([x, rodY - 0.026, rodZ], [x, top + 0.01, rodZ], 0.0015, metal, 0.0015, 3);
      // tie-back band around the gathered bundle + tassel + wall hook
      const yT = 0.004 + tieV * h;
      const xa = cx + (s * panel) / 2;
      const bundleC = xa - s * panel * 0.3 * 0.5;
      const band = k.geo(new THREE.TorusGeometry(1, 0.012, 5, 16), rope, bundleC, yT, rodZ + 0.01);
      band.rotation.x = Math.PI / 2;
      band.scale.set(panel * 0.17, 0.085, 1);
      k.rod([xa - s * 0.02, yT, zb], [xa - s * 0.02, yT, rodZ - 0.02], 0.006, metal, 0.006, 8);
      k.sphere(0.02, metal, xa - s * 0.02, yT, zb + 0.02, 1, 1, 0.6, 8);
      const tx = bundleC - s * panel * 0.12;
      const tz = rodZ + 0.07;
      k.rod([tx, yT, tz - 0.005], [tx, yT - 0.08, tz], 0.003, rope, 0.003, 5);
      k.sphere(0.014, rope, tx, yT - 0.085, tz, 1, 1.2, 1, 10);
      k.cyl(0.026, 0.11, rope, tx, yT - 0.2, tz, 0.01, 12);
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { w, panel } = VELVET;
      curtainPlan(ctx, w, 0, [[-w / 2 + 0.08, -w / 2 + 0.08 + panel * 0.45], [w / 2 - 0.08 - panel * 0.45, w / 2 - 0.08]], 4, c.fabric, 0.06);
      for (const s of [-1, 1]) D.circle(ctx, s * (w / 2 - 0.08 - panel * 0.15), 0.01, 0.05, tint(c.tie, 0.3), INK_SOFT, LINE_THIN);
    }),
};

const ROMAN = { w: 1.3, d: 0.1, h: 1.5 };
/** Side profile (z, y) of a half-raised roman blind: flat fabric, then a cascade of soft folds. */
function romanProfile(top: number, flatTo: number, z0: number): Array<[number, number]> {
  const pts: Array<[number, number]> = [[z0, top], [z0, flatTo]];
  const R = [0.034, 0.04, 0.046, 0.052];
  let y = flatTo;
  for (const r of R) {
    const yc = y - r;
    for (let i = 1; i <= 8; i++) {
      const p = (i / 8) * Math.PI;
      pts.push([z0 + Math.sin(p) * r * 1.05, yc + Math.cos(p) * r]);
    }
    y = yc - r;
  }
  pts.push([z0, y - 0.02]);
  return pts;
}

const romanBlind: FurnitureDef = {
  id: 'curtain-roman-blind',
  name: 'וילון רומאי',
  category: 'decor',
  group: 'וילונות',
  tags: ['וילון רומאי', 'תריס בד', 'קפלים', 'פשתן', 'מטבח', 'חלון'],
  size: { w: ROMAN.w, d: ROMAN.d, h: ROMAN.h },
  mount: 'wall',
  elevation: 0.95,
  colors: [slot('fabric', 'בד', '#d8cdb8'), slot('trim', 'פס', '#3d5166')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { w, d, h } = ROMAN;
    const zb = -d / 2;
    const cloth = M.linen(c.fabric);
    k.rbox(w, 0.05, 0.045, 0.006, cloth, 0, h - 0.05, zb + 0.0225);
    const z0 = zb + 0.048;
    const prof = romanProfile(h - 0.04, 0.42, z0);
    const t = 0.004;
    const outline: Array<[number, number]> = prof.concat(prof.slice().reverse().map(([z, y]) => [z - t, y] as [number, number]));
    const shape = polyShape(outline);
    const g = extrudeZ(shape, w - 0.02, 0, 4);
    g.rotateY(-Math.PI / 2);
    noShadow(k.geo(g, cloth, 0, 0, 0)).castShadow = true;
    // contrast trim band along the bottom fold + weighted batten
    const yb = prof[prof.length - 1][1];
    k.rbox(w - 0.02, 0.022, 0.012, 0.004, M.linen(c.trim), 0, yb, z0 - 0.004);
    // pull cord + cleat
    const metal = M.brass();
    k.rod([w / 2 - 0.04, h - 0.05, z0 + 0.004], [w / 2 - 0.04, 0.32, z0 + 0.004], 0.0015, M.cloth('#efeae0'), 0.0015, 4);
    k.cyl(0.008, 0.035, M.wood('#7b5538'), w / 2 - 0.04, 0.29, z0 + 0.004, 0.006, 10);
    for (const x of [-0.4, 0, 0.4]) k.rod([x, h - 0.05, zb + 0.045], [x, 0.43, z0 + 0.001], 0.0008, M.cloth('#efeae0'), 0.0008, 3);
    k.rbox(0.02, 0.05, 0.012, 0.003, metal, w / 2 - 0.035, 0.0, zb + 0.006);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { w, d } = ROMAN;
      D.rr(ctx, 0, -d / 2 + 0.0225, w, 0.045, 0.006, tint(c.fabric, 0.3), INK_SOFT);
      D.rr(ctx, 0, -d / 2 + 0.06, w - 0.02, 0.05, 0.02, tint(c.fabric, 0.15), INK_SOFT, LINE_THIN);
      D.line(ctx, -w / 2 + 0.02, -d / 2 + 0.08, w / 2 - 0.02, -d / 2 + 0.08, tint(c.trim, 0.2), 0.01);
    }),
};

/* ===================================================================== FLOOR CUSHIONS & THROWS */

/** Boxy floor cushion: rounded super-ellipsoid with button tufts pressed into the top. */
function floorCushionGeo(w: number, h: number, d: number, tufts: Array<[number, number]>, depth: number, ws = 40, hs = 22): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, ws, hs);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const e = 0.34;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const sx = Math.sign(x) * Math.pow(Math.abs(x), e);
    const sz = Math.sign(z) * Math.pow(Math.abs(z), e);
    const sy = Math.sign(y) * Math.pow(Math.abs(y), 0.5);
    const flat = Math.sqrt(Math.max(0, 1 - Math.pow(Math.abs(sx), 6))) * Math.sqrt(Math.max(0, 1 - Math.pow(Math.abs(sz), 6)));
    let py = ((sy * h) / 2) * (0.55 + 0.45 * flat);
    const px = (sx * w) / 2;
    const pz = (sz * d) / 2;
    if (y > 0) for (const [tx, tz] of tufts) py -= depth * Math.exp(-((px - tx) ** 2 + (pz - tz) ** 2) / (2 * 0.045 * 0.045));
    p.setXYZ(i, px, py + h / 2, pz);
  }
  g.computeVertexNormals();
  boxUV(g, [w, h, d], false);
  return g;
}

const FC = { w: 0.7, d: 0.7, h: 0.17 };
const FC_TUFTS: Array<[number, number]> = [
  [0, 0],
  [-0.17, -0.17],
  [0.17, -0.17],
  [-0.17, 0.17],
  [0.17, 0.17],
];
const cushionSquare: FurnitureDef = {
  id: 'cushion-floor-square',
  name: 'כרית רצפה מרובעת מכופתרת',
  category: 'living',
  group: 'כריות רצפה',
  tags: ['כרית רצפה', 'זבוטון', 'מושב נמוך', 'פשתן', 'כפתורים', 'יוגה'],
  size: { w: FC.w, d: FC.d, h: FC.h },
  colors: [slot('fabric', 'בד', '#c7775a'), slot('button', 'כפתורים', '#e9e1d2')],
  seats: [{ x: 0, z: 0, height: 0.14, facing: 0, kind: 'sit' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { w, d, h } = FC;
    const g = floorCushionGeo(w, h, d, FC_TUFTS, 0.03);
    k.geo(g, M.linen(c.fabric), 0, 0, 0);
    for (const [x, z] of FC_TUFTS) k.sphere(0.012, M.linen(c.button), x, h - 0.026, z, 1, 0.5, 1, 10);
    // carry handle on the side
    k.tube([[-0.09, 0.1, d / 2 - 0.04], [-0.05, 0.122, d / 2 - 0.013], [0.05, 0.122, d / 2 - 0.013], [0.09, 0.1, d / 2 - 0.04]], 0.007, M.linen(darken(c.fabric, 0.12)), { radial: 6, seg: 14 });
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, FC.w - 0.01, FC.d - 0.01, 0.1, tint(c.fabric, 0.4), INK_SOFT);
      for (const [x, z] of FC_TUFTS) D.circle(ctx, x, z, 0.014, tint(c.button, 0.1), INK_SOFT, 0.006);
      D.line(ctx, -0.17, -0.17, 0.17, 0.17, darken(tint(c.fabric, 0.4), 0.15), 0.006);
      D.line(ctx, -0.17, 0.17, 0.17, -0.17, darken(tint(c.fabric, 0.4), 0.15), 0.006);
    }),
};

/** Round pleated meditation cushion (lathe with radial pleats on the side). */
function zafuGeo(r: number, h: number, pleats: number): THREE.BufferGeometry {
  const prof: Array<[number, number]> = [];
  const n = 12;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = -Math.PI / 2 + t * Math.PI;
    const rr = r * (0.84 + 0.16 * Math.cos(a));
    const y = h / 2 + Math.sin(a) * (h / 2);
    prof.push([rr * Math.min(1, Math.cos(a) * 3.2), y]);
  }
  prof[0] = [0, 0];
  prof[n] = [0, h];
  const g = new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), pleats * 4);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const y = p.getY(i);
    const rad = Math.hypot(x, z);
    if (rad < 1e-5) continue;
    const ang = Math.atan2(z, x);
    const side = Math.pow(Math.max(0, 1 - Math.abs((y - h / 2) / (h / 2))), 0.6);
    const top = y > h / 2 ? Math.max(0, (rad - r * 0.35) / (r * 0.65)) : 0;
    const k = 1 + Math.sin(ang * pleats) * 0.035 * Math.max(side, top * 0.6);
    p.setXYZ(i, x * k, y - (y > h * 0.5 ? (1 - rad / r) * 0.012 : 0), z * k);
  }
  g.computeVertexNormals();
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.PI * 2 * r, uv.getY(i) * (h + r));
  return g;
}

const cushionRound: FurnitureDef = {
  id: 'cushion-floor-round',
  name: 'כרית מדיטציה עגולה',
  category: 'living',
  group: 'כריות רצפה',
  tags: ['כרית רצפה', 'מדיטציה', 'זאפו', 'יוגה', 'עגולה', 'קפלים'],
  size: { w: 0.42, d: 0.42, h: 0.17 },
  colors: [slot('fabric', 'בד', '#3d5166')],
  seats: [{ x: 0, z: 0, height: 0.16, facing: 0, kind: 'sit' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    k.geo(zafuGeo(0.2, 0.165, 18), M.fabric(c.fabric, 18), 0, 0, 0);
    k.sphere(0.016, M.fabric(darken(c.fabric, 0.2), 18), 0, 0.152, 0, 1, 0.45, 1, 10);
    const strap = k.geo(new THREE.TorusGeometry(0.035, 0.007, 5, 12, Math.PI), M.fabric(darken(c.fabric, 0.15), 18), 0, 0.085, -0.2);
    strap.rotation.set(0, Math.PI, Math.PI / 2);
    strap.scale.set(1, 1, 0.5);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.circle(ctx, 0, 0, 0.205, tint(c.fabric, 0.45), INK_SOFT);
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2;
        D.line(ctx, Math.cos(a) * 0.1, Math.sin(a) * 0.1, Math.cos(a) * 0.19, Math.sin(a) * 0.19, darken(tint(c.fabric, 0.45), 0.15), 0.005);
      }
      D.circle(ctx, 0, 0, 0.018, tint(c.fabric, 0.2), INK_SOFT, 0.006);
    }),
};

/** A pillow mesh (kit pillowGeo) placed with a rotation. */
function placedPillow(k: Kit, w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, rx: number, ry: number, rz = 0): THREE.Mesh {
  const m = k.pillow(w, h, d, mat, 0, 0, 0);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  return m;
}

const pillowPile: FurnitureDef = {
  id: 'cushion-pillow-pile',
  name: 'ערימת כריות רצפה גדולה',
  category: 'living',
  group: 'כריות רצפה',
  tags: ['כריות', 'פינת ישיבה', 'בוהו', 'מרוקאי', 'קטיפה', 'סריגה'],
  size: { w: 1.25, d: 0.96, h: 0.66 },
  colors: [slot('base', 'כרית גדולה', '#a9754a'), slot('top', 'כרית עליונה', '#d9d0c1'), slot('accent', 'כריות נוי', '#2f5d50'), slot('accent2', 'כרית סרוגה', '#ebe4d6')],
  seats: [{ x: 0, z: 0.1, height: 0.3, facing: 0, kind: 'sit' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    k.geo(floorCushionGeo(1.2, 0.2, 0.92, [[-0.3, 0], [0.3, 0], [0, 0.22], [0, -0.22]], 0.02, 32, 16), M.velvet(c.base), 0, 0, 0);
    const top = floorCushionGeo(0.78, 0.14, 0.62, [[0, 0]], 0.025, 24, 14);
    const tm = k.geo(top, M.linen(c.top), 0.03, 0.16, 0.12);
    tm.rotation.y = 0.18;
    placedPillow(k, 0.58, 0.18, 0.56, M.velvet(c.accent), -0.26, 0.37, -0.3, -1.2, 0.18, 0.05);
    placedPillow(k, 0.55, 0.17, 0.52, M.knit(c.accent2), 0.26, 0.38, -0.3, -1.15, -0.22, -0.06);
    placedPillow(k, 0.46, 0.14, 0.3, M.linen(mix(c.accent, c.top, 0.5)), 0.02, 0.34, -0.15, -1.05, 0.05, 0);
    placedPillow(k, 0.36, 0.12, 0.36, M.velvet(c.top), -0.38, 0.27, 0.14, -0.25, 0.7, 0.2);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 1.2, 0.92, 0.14, tint(c.base, 0.45), INK_SOFT);
      ctx.save();
      ctx.translate(0.03, 0.12);
      ctx.rotate(-0.18);
      D.rr(ctx, 0, 0, 0.78, 0.62, 0.1, tint(c.top, 0.3), INK_SOFT, LINE_THIN);
      ctx.restore();
      D.rr(ctx, -0.28, -0.32, 0.58, 0.2, 0.08, tint(c.accent, 0.4), INK_SOFT, LINE_THIN);
      D.rr(ctx, 0.26, -0.32, 0.55, 0.2, 0.08, tint(c.accent2, 0.2), INK_SOFT, LINE_THIN);
      D.circle(ctx, -0.38, 0.14, 0.17, tint(c.top, 0.2), INK_SOFT, LINE_THIN);
    }),
};

/** Ribbon of cloth following a path in the YZ plane (x = across), with soft folds. */
function ribbonGeo(path: V3[], width: number, folds: number, amp: number, n = 18, m = 20): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(path.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const len = curve.getLength();
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const P = curve.getPointAt(t);
    const T = curve.getTangentAt(t);
    const N = new THREE.Vector3(0, -T.z, T.y).normalize();
    for (let j = 0; j <= m; j++) {
      const u = j / m;
      const x = (u - 0.5) * width * (1 + t * 0.08);
      const f = Math.sin(u * folds * Math.PI * 2) * amp * (0.3 + t) * Math.sin(u * Math.PI);
      pos.push(P.x + x, P.y + N.y * f, P.z + N.z * f);
      uv.push(x, t * len);
    }
  }
  for (let i = 0; i < n; i++)
    for (let j = 0; j < m; j++) {
      const a = i * (m + 1) + j;
      idx.push(a, a + m + 1, a + 1, a + 1, a + m + 1, a + m + 2);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const throwBasket: FurnitureDef = {
  id: 'textile-throw-basket',
  name: 'סל קש עם שמיכות',
  category: 'decor',
  group: 'טקסטיל',
  tags: ['סל', 'שמיכה', 'פלד', 'סריגה', 'קש', 'אחסון'],
  size: { w: 0.5, d: 0.56, h: 0.58 },
  colors: [slot('basket', 'סל', '#b8925f'), slot('throw1', 'שמיכה סרוגה', '#ebe4d6'), slot('throw2', 'שמיכה', '#9bae8a')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const wick = M.wicker(c.basket);
    k.lathe(
      [
        [0, 0],
        [0.2, 0],
        [0.214, 0.03],
        [0.232, 0.4],
        [0.236, 0.42],
        [0.224, 0.42],
        [0.212, 0.05],
        [0, 0.05],
      ],
      wick,
      0,
      0,
      0,
      32,
    );
    k.geo(flatTorus(0.232, 0.011, 6, 40), wick, 0, 0.42, 0);
    // rope handles
    for (const s of [-1, 1]) {
      const hdl = k.geo(new THREE.TorusGeometry(0.045, 0.008, 6, 14, Math.PI), M.wicker(darken(c.basket, 0.1)), s * 0.231, 0.33, 0);
      hdl.rotation.set(0, Math.PI / 2, -s * Math.PI / 2);
      hdl.scale.set(1, 0.35, 1);
    }
    // two rolled throws standing in the basket
    const knit = M.knit(c.throw1);
    const lin = M.linen(c.throw2);
    k.cyl(0.085, 0.52, knit, -0.08, 0.05, -0.06, 0.085, 18);
    k.cyl(0.075, 0.5, lin, 0.1, 0.05, -0.04, 0.075, 18);
    // spiral roll ends on top
    for (const [x, z, r, m, y] of [[-0.08, -0.06, 0.085, knit, 0.57], [0.1, -0.04, 0.075, lin, 0.55]] as Array<[number, number, number, THREE.Material, number]>) {
      const pts: V3[] = [];
      for (let i = 0; i <= 40; i++) {
        const a = (i / 40) * Math.PI * 6;
        const rr = (i / 40) * (r - 0.01);
        pts.push([x + Math.cos(a) * rr, y + 0.003, z + Math.sin(a) * rr]);
      }
      noShadow(k.tube(pts, 0.004, M.matte(darken((m as THREE.MeshStandardMaterial).color.getStyle(), 0.25)), { radial: 3, seg: 60 }));
    }
    // a throw draped over the front rim
    const drape = ribbonGeo(
      [
        [0.0, 0.5, 0.08],
        [0.0, 0.46, 0.2],
        [0.0, 0.43, 0.245],
        [0.0, 0.32, 0.252],
        [0.0, 0.16, 0.254],
      ],
      0.36,
      3,
      0.016,
    );
    k.geo(drape, ds(M.knit(c.throw1)), -0.02, 0, 0);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.circle(ctx, 0, 0, 0.243, tint(c.basket, 0.35), INK_SOFT);
      D.circle(ctx, 0, 0, 0.222, null, INK_SOFT, LINE_THIN);
      D.circle(ctx, -0.08, -0.06, 0.085, tint(c.throw1, 0.1), INK_SOFT, LINE_THIN);
      D.circle(ctx, 0.1, -0.04, 0.075, tint(c.throw2, 0.3), INK_SOFT, LINE_THIN);
      D.rr(ctx, -0.02, 0.2, 0.36, 0.13, 0.03, tint(c.throw1, 0.1) + 'ee', INK_SOFT, LINE_THIN);
    }),
};

export const TEXTILES: FurnitureDef[] = [
  persianLarge,
  persianRunner,
  kilim,
  moroccan,
  shagRound,
  juteRound,
  stripedFlat,
  checker,
  cowhide,
  sheepskin,
  kidsRug,
  bathMat,
  outdoor,
  abstract,
  curtainSheer,
  curtainBlackout,
  curtainVelvet,
  romanBlind,
  cushionSquare,
  cushionRound,
  pillowPile,
  throwBasket,
];

