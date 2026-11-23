/**
 * Beds: single → king, many frame styles. Every bed has a realistic mattress with fitted sheet,
 * a soft draped duvet with a turn-down fold, pillows (and euro shams / cushions), a throw,
 * a 'lie' seat in the middle of the mattress and the 'sleep' action.
 */
import * as THREE from 'three';
import type { ColorSlot, FurnitureCategory, FurnitureDef, SeatAnchor } from '../types';
import { D, INK_SOFT, Kit, LINE_THIN, M, PAL, arcPanelGeo, darken, extrudeZ, lighten, roundedRectPath, roundedRectShape, sym, tint, type Ctx2D, type V3 } from '../kit';
import { slot } from './_parts';
import { bedding2, drawBedding2, drawer, roundDrapeGeo, softPillowGeo, taperLeg, MX, type BeddingOpts } from './_bedstore';

type Colors = Record<string, string>;
const SHEET = '#f5f2ec';

/* ------------------------------------------------------------------ geometry helpers */

/** Front-facing (+Z) diamond-tufted upholstery surface, w × h, bottom-centre at the origin. Returns button positions. */
function tuftedGeo(w: number, h: number, cols: number, rows: number, depth: number): { geo: THREE.BufferGeometry; buttons: Array<[number, number]> } {
  const sub = 4;
  const nx = cols * sub;
  const ny = rows * sub;
  const sx = w / cols;
  const sy = h / rows;
  const buttons: Array<[number, number]> = [];
  for (let r = 0; r < rows; r++) {
    const y = (r + 0.5) * sy;
    const odd = r % 2 === 1;
    for (let c = 0; c <= cols; c++) {
      const x = -w / 2 + (odd ? c : c + 0.5) * sx;
      if (x <= -w / 2 + 0.01 || x >= w / 2 - 0.01) continue;
      buttons.push([x, y]);
    }
  }
  const pos: number[] = [];
  const uv: number[] = [];
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      const x = -w / 2 + (i / nx) * w;
      const y = (j / ny) * h;
      const edge = Math.min(1, Math.min(x + w / 2, w / 2 - x, y, h - y) / 0.07);
      let dim = 0;
      for (const [bx, by] of buttons) {
        const dx = (x - bx) / (sx * 0.42);
        const dy = (y - by) / (sy * 0.42);
        dim = Math.max(dim, Math.exp(-(dx * dx + dy * dy) * 2.2));
      }
      const z = depth * Math.sqrt(Math.max(0, edge)) * (1 - 0.85 * dim);
      pos.push(x, y, z);
      uv.push(x, y);
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i;
      const b = a + 1;
      const c = a + nx + 1;
      const d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return { geo, buttons };
}

/** A board of thickness t following a smooth (z, y) curve, extruded `w` along X and centred on x = 0. */
function ribbonX(pts: Array<[number, number]>, t: number, w: number, n = 22): THREE.BufferGeometry {
  const curve = new THREE.SplineCurve(pts.map(([z, y]) => new THREE.Vector2(z, y)));
  const P = curve.getSpacedPoints(n);
  const outer: THREE.Vector2[] = [];
  const inner: THREE.Vector2[] = [];
  for (let i = 0; i <= n; i++) {
    const tan = curve.getTangentAt(i / n);
    const nrm = new THREE.Vector2(-tan.y, tan.x);
    outer.push(P[i].clone().addScaledVector(nrm, t / 2));
    inner.push(P[i].clone().addScaledVector(nrm, -t / 2));
  }
  const shape = new THREE.Shape([...outer, ...inner.reverse()]);
  const g = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 1, curveSegments: 4 });
  g.translate(0, 0, -w / 2);
  g.rotateY(-Math.PI / 2);
  return g;
}

/** Side profile (z, y) extruded `t` along X, centred on x. */
function profileX(shape: THREE.Shape, t: number, x: number): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 1, curveSegments: 6 });
  g.translate(0, 0, -t / 2);
  g.rotateY(-Math.PI / 2);
  g.translate(x, 0, 0);
  return g;
}

/* ------------------------------------------------------------------ bed definition */

interface BedSpec {
  id: string;
  name: string;
  category?: FurnitureCategory;
  group?: string;
  tags: string[];
  size: { w: number; d: number; h: number };
  colors: ColorSlot[];
  /** mattress width / length / height, underside y and centre */
  mw: number;
  len: number;
  mh?: number;
  my: number;
  cx?: number;
  cz: number;
  /** mattress laid along X (head at -X): daybeds, lofts, cribs */
  alongX?: boolean;
  bedding: (c: Colors) => Partial<BeddingOpts>;
  frame: (k: Kit, c: Colors) => void;
  /** plan symbol of the frame (bedding is drawn on top) */
  plan: (ctx: Ctx2D, c: Colors) => void;
  /** plan symbol drawn after the bedding */
  planTop?: (ctx: Ctx2D, c: Colors) => void;
  sits?: SeatAnchor[];
  /** the frame builds its own bedding (round bed) */
  ownBedding?: boolean;
  extraActions?: FurnitureDef['actions'];
}

function beddingFor(s: BedSpec, c: Colors): BeddingOpts {
  const extra = s.bedding(c);
  const zHead = s.alongX ? (s.cx ?? 0) - s.len / 2 : s.cz - s.len / 2;
  const x = s.alongX ? -s.cz : (s.cx ?? 0);
  return {
    mw: s.mw,
    len: s.len,
    mh: s.mh,
    y: s.my,
    zHead,
    x,
    sheet: c.sheet ?? SHEET,
    duvet: c.bedding,
    throwC: c.throw ?? null,
    pillows: s.mw >= 1.3 ? 2 : 1,
    ...extra,
  };
}

function mkBed(s: BedSpec): FurnitureDef {
  const mh = s.mh ?? 0.22;
  const top = +(s.my + mh).toFixed(3);
  const cx = s.cx ?? 0;
  const seats: SeatAnchor[] = [{ x: cx, z: s.cz, height: top, facing: s.alongX ? Math.PI / 2 : 0, kind: 'lie' }];
  if (s.sits) seats.push(...s.sits);
  else if (!s.alongX) {
    const ex = +(s.mw / 2 - 0.12).toFixed(3);
    const z = +(s.cz + s.len * 0.15).toFixed(3);
    seats.push({ x: +(cx + ex).toFixed(3), z, height: top, facing: Math.PI / 2, kind: 'sit' });
    if (s.mw >= 1.3) seats.push({ x: +(cx - ex).toFixed(3), z, height: top, facing: -Math.PI / 2, kind: 'sit' });
  }
  return {
    id: s.id,
    name: s.name,
    category: s.category ?? 'bedroom',
    group: s.group ?? (s.category === 'kids' ? 'מיטות ילדים' : 'מיטות'),
    tags: s.tags,
    size: s.size,
    colors: s.colors,
    seats,
    actions: [{ kind: 'sleep' }, ...(s.extraActions ?? [])],
    build: ({ colors: c }) => {
      const k = new Kit();
      s.frame(k, c);
      if (s.ownBedding) return k.g;
      const b = beddingFor(s, c);
      if (s.alongX) {
        const sub = new Kit();
        bedding2(sub, b);
        k.sub(sub).rotation.y = Math.PI / 2;
      } else bedding2(k, b);
      return k.g;
    },
    draw2d: (ctx, c) =>
      sym(ctx, () => {
        s.plan(ctx, c);
        if (s.ownBedding) return;
        const b = beddingFor(s, c);
        const o = { mw: b.mw, len: b.len, zHead: b.zHead, x: b.x, duvet: b.duvet, throwC: b.throwC, pillows: b.pillows, euro: b.euro, deco: b.deco, hw: b.hw, drop: b.drop, cover: b.cover, fold: b.fold };
        if (s.alongX) {
          ctx.save();
          ctx.rotate(-Math.PI / 2);
          drawBedding2(ctx, o);
          ctx.restore();
        } else drawBedding2(ctx, o);
        s.planTop?.(ctx, c);
      }),
  };
}

const C = {
  frame: (d: string, label = 'מסגרת') => slot('frame', label, d),
  fabric: (d: string) => slot('fabric', 'ריפוד', d),
  bedding: (d: string) => slot('bedding', 'שמיכה', d),
  sheet: (d: string = SHEET) => slot('sheet', 'סדין וכריות', d),
  throw: (d: string) => slot('throw', 'כיסוי', d),
};

/** Plan: rectangle frame outline + headboard band. */
function planFrame(ctx: Ctx2D, w: number, d: number, fill: string, headT: number, r = 0.02, hw = w): void {
  D.rr(ctx, 0, 0, w, d, r, tint(fill, 0.4));
  D.rr(ctx, 0, -d / 2 + headT / 2, hw, headT, Math.min(r, headT / 2), tint(fill, 0.15), undefined, LINE_THIN);
}

/* ================================================================== 1. upholstered panel, queen */

const UPH = { w: 1.98, d: 2.22, h: 1.2, mw: 1.6, len: 2.0 };
const upholsteredQueen = mkBed({
  id: 'bed2-upholstered-queen',
  name: 'מיטה מרופדת קווין עם ראש פאנל',
  tags: ['קווין', 'זוגית', 'מרופדת', 'בד', 'מודרני', 'ראש מיטה'],
  size: { w: UPH.w, d: UPH.d, h: UPH.h },
  colors: [C.fabric('#b8afa2'), C.bedding('#e9e3d8'), C.sheet(), C.throw('#a35f45')],
  mw: UPH.mw,
  len: UPH.len,
  my: 0.36,
  cz: -UPH.d / 2 + 0.11 + UPH.len / 2,
  bedding: (c) => ({ hw: 0.86, drop: 0.3, euro: true, deco: [c.throw, lighten(c.fabric, 0.2), c.throw], decoMat: 'velvet', throwKind: 'knit', seed: 2 }),
  frame: (k, c) => {
    const f = M.fabric(c.fabric, 10);
    const pip = M.fabric(darken(c.fabric, 0.12), 10);
    const { w, d, h } = UPH;
    const zb = -d / 2;
    // headboard panel with a stitched inset and piping on the edges
    k.rbox(w, h - 0.03, 0.1, 0.04, f, 0, 0.03, zb + 0.05, 2);
    const fz = zb + 0.1 + 0.0015;
    const ins = 0.09;
    const seam = M.matte(darken(c.fabric, 0.35));
    k.box(w - 2 * ins, 0.004, 0.003, seam, 0, h - ins, fz);
    k.box(w - 2 * ins, 0.004, 0.003, seam, 0, 0.62, fz);
    for (const s of [-1, 1]) k.box(0.004, h - ins - 0.62, 0.003, seam, s * (w / 2 - ins), 0.62, fz);
    k.rod([-w / 2 + 0.03, h - 0.005, zb + 0.1], [w / 2 - 0.03, h - 0.005, zb + 0.1], 0.007, pip, 0.007, 6);
    for (const s of [-1, 1]) k.rod([s * (w / 2 - 0.005), 0.06, zb + 0.1], [s * (w / 2 - 0.005), h - 0.04, zb + 0.1], 0.007, pip, 0.007, 6);
    // upholstered base on recessed dark feet
    k.rbox(1.7, 0.29, 2.02, 0.03, f, 0, 0.07, zb + 0.11 + 1.01, 1);
    const feet = M.wood('#3b2d24');
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl(0.025, 0.07, feet, sx * 0.76, 0, zb + 1.12 + sz * 0.92, 0.022, 10);
  },
  plan: (ctx, c) => {
    planFrame(ctx, UPH.w, UPH.d, c.fabric, 0.1, 0.03);
    D.rr(ctx, 0, -UPH.d / 2 + 0.11 + 1.01, 1.7, 2.02, 0.03, tint(c.fabric, 0.3), INK_SOFT, LINE_THIN);
  },
});

/* ================================================================== 2. velvet wingback, king */

const WB = { w: 2.26, d: 2.28, h: 1.5, mw: 1.8, len: 2.0 };
const wingbackKing = mkBed({
  id: 'bed2-wingback-king',
  name: 'מיטת קינג קטיפה עם ראש כנפיים',
  tags: ['קינג', 'זוגית', 'קטיפה', 'קפיטונאז\'', 'יוקרה', 'כנפיים', 'גבוה'],
  size: { w: WB.w, d: WB.d, h: WB.h },
  colors: [C.fabric('#2f4f4a'), C.bedding('#efeae0'), C.sheet('#f7f5f0'), C.throw('#c9a35a')],
  mw: WB.mw,
  len: WB.len,
  my: 0.38,
  cz: -WB.d / 2 + 0.16 + WB.len / 2,
  bedding: (c) => ({ hw: 0.97, drop: 0.32, euro: true, pillows: 2, deco: [c.fabric, c.throw, c.fabric], decoMat: 'velvet', throwKind: 'fabric', seed: 5 }),
  frame: (k, c) => {
    const v = M.velvet(c.fabric);
    const { d, h } = WB;
    const zb = -d / 2;
    const pw = 1.9;
    // core panel + diamond tufted front
    k.rbox(pw, h - 0.06, 0.12, 0.05, v, 0, 0.06, zb + 0.06, 2);
    const tw = pw - 0.12;
    const th = 0.95;
    const tf = tuftedGeo(tw, th, 6, 3, 0.035);
    k.geo(tf.geo, v, 0, h - 0.06 - th - 0.05, zb + 0.12);
    for (const [bx, by] of tf.buttons) k.rod([bx, h - 0.11 - th + by, zb + 0.118], [bx, h - 0.11 - th + by, zb + 0.13], 0.011, v, 0.009, 6);
    // wings
    for (const s of [-1, 1]) {
      const wing = k.rbox(0.13, h - 0.02, 0.36, 0.05, v, s * 1.02, 0.02, zb + 0.2, 1);
      wing.rotation.y = s * 0.33;
    }
    // base + feet with brass caps
    k.rbox(1.92, 0.3, 2.02, 0.035, v, 0, 0.07, zb + 0.15 + 1.01, 1);
    const feet = M.wood('#2c2420');
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        k.cyl(0.024, 0.06, feet, sx * 0.88, 0.012, zb + 1.16 + sz * 0.92, 0.03, 8);
        k.cyl(0.024, 0.012, M.brass(), sx * 0.88, 0, zb + 1.16 + sz * 0.92, 0.024, 8);
      }
  },
  plan: (ctx, c) => {
    const { w, d } = WB;
    D.rr(ctx, 0, -d / 2 + 1.16, 1.92, 2.02, 0.035, tint(c.fabric, 0.4));
    D.rr(ctx, 0, -d / 2 + 0.06, 1.9, 0.12, 0.05, tint(c.fabric, 0.2));
    for (const s of [-1, 1]) {
      ctx.save();
      ctx.translate(s * 1.02, -d / 2 + 0.2);
      ctx.rotate(-s * 0.33);
      D.rr(ctx, 0, 0, 0.13, 0.36, 0.05, tint(c.fabric, 0.2));
      ctx.restore();
    }
    void w;
  },
});

/* ================================================================== 3. Japandi low platform, queen */

const JP = { w: 2.0, d: 2.3, h: 0.88, mw: 1.6, len: 2.0 };
const japandiPlatform = mkBed({
  id: 'bed2-japandi-platform',
  name: 'מיטת פלטפורמה נמוכה יפנדי',
  tags: ['קווין', 'זוגית', 'יפנדי', 'עץ אלון', 'נמוכה', 'מינימליסטי', 'פלטפורמה', 'סלאטים'],
  size: { w: JP.w, d: JP.d, h: JP.h },
  colors: [C.frame(PAL.oakLight, 'עץ'), C.bedding('#c9c2b2'), C.sheet('#ece6da'), C.throw('#7c8a5c')],
  mw: JP.mw,
  len: JP.len,
  my: 0.22,
  cz: -JP.d / 2 + 0.1 + JP.len / 2,
  bedding: (c) => ({ drop: 0.19, deco: [c.throw, '#d8cfc0'], decoMat: 'linen', throwKind: 'linen', seed: 3, puff: 0.03 }),
  frame: (k, c) => {
    const wood = M.wood(c.frame);
    const dark = M.wood(darken(c.frame, 0.45));
    const { w, d, h } = JP;
    const zb = -d / 2;
    // floating deck on a recessed plinth
    k.rbox(w, 0.06, d - 0.06, 0.012, wood, 0, 0.16, zb + 0.06 + (d - 0.06) / 2, 1);
    k.box(w - 0.3, 0.16, d - 0.4, dark, 0, 0, zb + 0.06 + (d - 0.06) / 2);
    // slatted headboard on a frame
    k.box(w - 0.04, h - 0.22, 0.02, wood, 0, 0.22, zb + 0.01);
    k.rbox(w, 0.04, 0.06, 0.008, wood, 0, h - 0.04, zb + 0.03, 1);
    for (const s of [-1, 1]) k.rbox(0.05, h, 0.06, 0.008, wood, s * (w / 2 - 0.025), 0, zb + 0.03, 1);
    const n = 19;
    const span = w - 0.14;
    for (let i = 0; i < n; i++) k.box(0.034, h - 0.3, 0.026, wood, -span / 2 + (span * (i + 0.5)) / n, 0.22, zb + 0.035);
    // tray with a cup and a book on the deck ledge
    const zl = zb + 0.32;
    k.rbox(0.26, 0.015, 0.2, 0.006, dark, 0.86, 0.22, zl, 1);
    k.cyl(0.035, 0.08, M.ceramic('#e8e2d6'), 0.82, 0.235, zl, 0.04, 14);
    k.box(0.15, 0.025, 0.2, M.matte('#7a8fa3'), 0.88, 0.235, zl + 0.0);
  },
  plan: (ctx, c) => {
    const { w, d } = JP;
    D.rr(ctx, 0, 0.03, w, d - 0.06, 0.012, tint(c.frame, 0.35));
    D.rr(ctx, 0, -d / 2 + 0.03, w, 0.06, 0.008, tint(c.frame, 0.1));
    D.rr(ctx, 0.86, -d / 2 + 0.32, 0.26, 0.2, 0.01, tint(c.frame, 0.1), INK_SOFT, LINE_THIN);
  },
});

/* ================================================================== 4. cane headboard, double */

const CN = { w: 1.74, d: 2.2, h: 1.12, mw: 1.4, len: 2.0 };
const caneDouble = mkBed({
  id: 'bed2-cane-double',
  name: 'מיטה זוגית עם ראש קש וינאי',
  tags: ['זוגית', 'קש', 'ראטן', 'וינאי', 'בוהו', 'עץ', 'רגליים'],
  size: { w: CN.w, d: CN.d, h: CN.h },
  colors: [C.frame(PAL.walnut, 'עץ'), C.bedding('#e3d5c3'), C.sheet(), C.throw('#c7775a'), slot('cane', 'קש', '#d7bb8c')],
  mw: CN.mw,
  len: CN.len,
  my: 0.3,
  cz: -CN.d / 2 + 0.07 + CN.len / 2,
  bedding: (c) => ({ hw: 0.75, drop: 0.28, deco: ['#e9e2d4', c.throw], decoMat: 'linen', throwKind: 'knit', seed: 7 }),
  frame: (k, c) => {
    const wood = M.wood(c.frame);
    const { d, h } = CN;
    const zb = -d / 2;
    const hw = 1.52;
    // headboard: rounded frame around a cane panel, on two posts
    const outer = roundedRectShape(hw, 0.68, 0.2, 0, 0);
    const hole = roundedRectPath(new THREE.Path(), hw - 0.12, 0.56, 0.15, 0, 0);
    outer.holes.push(hole);
    k.geo(extrudeZ(outer, 0.045, 0.006, 5), wood, 0, h - 0.34, zb + 0.035);
    const cane = k.geo(extrudeZ(roundedRectShape(hw - 0.11, 0.57, 0.15), 0.008, 0, 5), M.rattan(c.cane), 0, h - 0.34, zb + 0.035);
    cane.castShadow = true;
    for (const s of [-1, 1]) k.rbox(0.055, h - 0.36, 0.05, 0.01, wood, s * (hw / 2 - 0.06), 0, zb + 0.035, 1);
    // side rails, foot rail, tapered legs
    const z0 = zb + 0.06;
    const z1 = zb + 0.07 + CN.len + 0.03;
    for (const s of [-1, 1]) k.rbox(0.035, 0.17, z1 - z0, 0.008, wood, s * 0.735, 0.2, (z0 + z1) / 2, 1);
    k.rbox(1.505, 0.17, 0.035, 0.008, wood, 0, 0.2, z1 - 0.0175, 1);
    k.box(1.43, 0.02, z1 - z0 - 0.04, M.matte('#3a3531'), 0, 0.28, (z0 + z1) / 2);
    for (const sx of [-1, 1]) taperLeg(k, sx * 0.72, z1 - 0.03, 0.22, 0.05, 0.03, wood, sx * 0.015, 0.015);
  },
  plan: (ctx, c) => {
    const { d } = CN;
    D.rr(ctx, 0, -d / 2 + 0.07 + 1.015, 1.505, 2.03, 0.01, tint(c.frame, 0.4));
    D.rr(ctx, 0, -d / 2 + 0.035, 1.52, 0.045, 0.01, tint(c.frame, 0.1));
  },
});

/* ================================================================== 5. black metal, single */

const MT = { w: 1.2, d: 2.16, h: 1.0, mw: 0.9, len: 2.0 };
const metalSingle = mkBed({
  id: 'bed2-metal-single',
  name: 'מיטת יחיד ממתכת שחורה',
  tags: ['יחיד', 'מתכת', 'שחור', 'תעשייתי', 'נוער', 'מוטות'],
  size: { w: MT.w, d: MT.d, h: MT.h },
  colors: [C.frame('#26272a', 'מתכת'), C.bedding('#8b8d8f'), C.sheet('#eeeeec'), C.throw('#d6a544')],
  mw: MT.mw,
  len: MT.len,
  my: 0.3,
  cz: -MT.d / 2 + 0.05 + MT.len / 2,
  bedding: () => ({ hw: 0.47, drop: 0.3, dropF: 0.07, deco: ['#c4c7ca'], decoMat: 'fabric', throwKind: 'knit', seed: 11 }),
  frame: (k, c) => {
    const m = M.metal(c.frame, 0.45, 0.6);
    const { d } = MT;
    const zH = -d / 2 + 0.025;
    const zF = -d / 2 + 0.05 + MT.len + 0.03;
    const px = 0.47;
    const end = (z: number, hh: number): void => {
      for (const s of [-1, 1]) {
        k.rod([s * px, 0, z], [s * px, hh, z], 0.018, m, 0.018, 12);
        k.sphere(0.028, m, s * px, hh + 0.012, z, 1, 1, 1, 12);
      }
      for (const y of [0.32, hh - 0.06]) k.rod([-px, y, z], [px, y, z], 0.012, m, 0.012, 8);
      const n = 7;
      for (let i = 1; i < n; i++) {
        const x = -px + (2 * px * i) / n;
        k.rod([x, 0.32, z], [x, hh - 0.06, z], 0.007, m, 0.007, 6);
      }
    };
    end(zH, MT.h - 0.04);
    end(zF, 0.62);
    for (const s of [-1, 1]) k.box(0.03, 0.04, zF - zH, m, s * px, 0.28, (zH + zF) / 2);
    const slat = M.wood(PAL.birch);
    for (let i = 0; i < 12; i++) k.box(0.86, 0.012, 0.06, slat, 0, 0.288, zH + 0.12 + i * 0.165);
  },
  plan: (ctx, c) => {
    const { d } = MT;
    const zH = -d / 2 + 0.025;
    const zF = -d / 2 + 0.08 + MT.len;
    D.box(ctx, -0.48, zH, 0.48, zF, 0, tint(c.frame, 0.7), INK_SOFT, LINE_THIN);
    for (const z of [zH, zF]) {
      D.line(ctx, -0.47, z, 0.47, z, c.frame, 0.02);
      for (const s of [-1, 1]) D.circle(ctx, s * 0.47, z, 0.025, tint(c.frame, 0.2));
    }
  },
});

/* ================================================================== 6. brass, queen */

const BR = { w: 1.92, d: 2.2, h: 1.32, mw: 1.6, len: 2.0 };
const brassQueen = mkBed({
  id: 'bed2-brass-queen',
  name: 'מיטת פליז קלאסית קווין',
  tags: ['קווין', 'זוגית', 'פליז', 'זהב', 'וינטג\'', 'קלאסי', 'מתכת'],
  size: { w: BR.w, d: BR.d, h: BR.h },
  colors: [C.bedding('#f3efe7'), C.sheet('#faf8f4'), C.throw('#8a9a6b')],
  mw: BR.mw,
  len: BR.len,
  my: 0.32,
  cz: -BR.d / 2 + 0.06 + BR.len / 2,
  bedding: (c) => ({ hw: 0.83, drop: 0.32, dropF: 0.07, euro: true, deco: [c.throw, '#e5c6b5'], decoMat: 'linen', throwKind: 'linen', seed: 13 }),
  frame: (k) => {
    const b = M.brass();
    const { d } = BR;
    const zH = -d / 2 + 0.03;
    const zF = -d / 2 + 0.06 + BR.len + 0.04;
    const px = 0.83;
    const end = (z: number, hh: number, arch: number): void => {
      for (const s of [-1, 1]) {
        k.rod([s * px, 0, z], [s * px, hh, z], 0.022, b, 0.022, 12);
        k.sphere(0.036, b, s * px, hh + 0.03, z, 1, 1, 1, 10);
        k.cyl(0.03, 0.03, b, s * px, hh - 0.02, z, 0.026, 10);
        k.cyl(0.03, 0.025, b, s * px, 0.32, z, 0.03, 10);
      }
      const yTop = hh - 0.1;
      const pts: V3[] = [];
      for (let i = 0; i <= 8; i++) {
        const t = i / 8;
        pts.push([-px + 2 * px * t, yTop + arch * Math.sin(t * Math.PI), z]);
      }
      k.tube(pts, 0.013, b, { seg: 18, radial: 6 });
      k.rod([-px, 0.36, z], [px, 0.36, z], 0.012, b, 0.012, 8);
      const n = 9;
      for (let i = 1; i < n; i++) {
        const t = i / n;
        const x = -px + 2 * px * t;
        const yt = yTop + arch * Math.sin(t * Math.PI);
        k.rod([x, 0.36, z], [x, yt, z], 0.007, b, 0.007, 6);
        k.cyl(0.013, 0.03, b, x, 0.345 + (yt - 0.36) * 0.5, z, 0.013, 6);
      }
    };
    end(zH, BR.h - 0.07, 0.1);
    end(zF, 0.8, 0.04);
    const rail = M.blackMetal();
    for (const s of [-1, 1]) k.box(0.03, 0.05, zF - zH, rail, s * px, 0.28, (zH + zF) / 2);
  },
  plan: (ctx) => {
    const { d } = BR;
    const zH = -d / 2 + 0.03;
    const zF = -d / 2 + 0.1 + BR.len;
    D.box(ctx, -0.84, zH, 0.84, zF, 0, '#f1e6c8', INK_SOFT, LINE_THIN);
    for (const z of [zH, zF]) {
      D.line(ctx, -0.83, z, 0.83, z, '#b38d43', 0.025);
      for (const s of [-1, 1]) D.circle(ctx, s * 0.83, z, 0.036, '#e2c98f');
    }
  },
});

/* ================================================================== 7. four-poster canopy, king */

const CP = { w: 2.2, d: 2.28, h: 2.2, mw: 1.8, len: 2.0 };
const CP_PX = 1.06;

/** Sheer drape gathered by a tie: hangs in the YZ plane, width along Z centred on z = 0, top at y = h. */
function sheerDrape(w: number, h: number, tieY: number, pleats: number, seed: number): THREE.BufferGeometry {
  const nu = 10;
  const nv = 8;
  const pos: number[] = [];
  const uv: number[] = [];
  for (let j = 0; j <= nv; j++) {
    const v = j / nv;
    const y = h * (1 - v);
    // width: full at the top, gathered at the tie, flaring towards the floor
    const g = y > tieY ? 1 - 0.8 * Math.pow((h - y) / (h - tieY), 1.4) : 0.2 + 0.6 * Math.pow((tieY - y) / tieY, 0.8);
    for (let i = 0; i <= nu; i++) {
      const u = i / nu;
      const z = (u - 0.5) * w * g;
      const amp = 0.035 * (1.15 - g);
      const x = Math.sin(u * Math.PI * 2 * pleats + seed) * (0.02 + amp) + Math.sin(u * 17 + v * 3 + seed) * 0.004;
      pos.push(x, Math.max(0.005, y), z);
      uv.push(u * w, y);
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i;
      idx.push(a, a + nu + 1, a + 1, a + 1, a + nu + 1, a + nu + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

const canopyKing = mkBed({
  id: 'bed2-canopy-king',
  name: 'מיטת אפריון קינג עם וילונות שקופים',
  tags: ['קינג', 'זוגית', 'אפריון', 'עמודים', 'וילון', 'רומנטי', 'עץ', 'בוטיק'],
  size: { w: CP.w, d: CP.d, h: CP.h },
  colors: [C.frame('#3a2e26', 'עץ'), C.bedding('#f2ede4'), C.sheet(), C.throw('#b9a28a'), slot('sheer', 'וילון', '#fbf8f2')],
  mw: CP.mw,
  len: CP.len,
  my: 0.36,
  cz: -CP.d / 2 + 0.1 + CP.len / 2,
  bedding: (c) => ({ hw: 0.93, drop: 0.32, dropF: 0.25, euro: true, deco: ['#d9cbb8', c.throw], decoMat: 'boucle', throwKind: 'knit', seed: 17 }),
  frame: (k, c) => {
    const wood = M.wood(c.frame);
    const { d, h } = CP;
    const zH = -d / 2 + 0.035;
    const zF = d / 2 - 0.035;
    for (const sx of [-1, 1])
      for (const z of [zH, zF]) {
        k.rbox(0.07, h - 0.05, 0.07, 0.008, wood, sx * CP_PX, 0, z, 1);
        k.cyl(0.022, 0.05, wood, sx * CP_PX, h - 0.05, z, 0.012, 10);
      }
    // canopy frame
    for (const z of [zH, zF]) k.box(2 * CP_PX + 0.06, 0.06, 0.05, wood, 0, h - 0.12, z);
    for (const sx of [-1, 1]) k.box(0.05, 0.06, zF - zH, wood, sx * CP_PX, h - 0.12, 0);
    // side rails + low headboard panel
    for (const sx of [-1, 1]) k.box(0.04, 0.24, zF - zH - 0.07, wood, sx * 0.99, 0.16, 0);
    k.box(2 * CP_PX - 0.07, 0.24, 0.04, wood, 0, 0.16, zF);
    k.box(1.94, 0.025, zF - zH - 0.1, M.matte('#3a3531'), 0, 0.34, 0);
    const uph = M.linen('#e4dbcd');
    k.rbox(2 * CP_PX - 0.08, 0.86, 0.08, 0.03, uph, 0, 0.3, zH + 0.035, 1);
    k.box(2 * CP_PX - 0.07, 0.05, 0.05, wood, 0, 1.16, zH);
    // sheer drapes tied to the four posts, hanging along the sides
    const sheer = MX.sheer(c.sheer);
    const tie = M.fabric(c.throw, 10);
    for (const sx of [-1, 1])
      for (const [z, dz] of [
        [zH + 0.4, 0],
        [zF - 0.4, 1],
      ] as const) {
        k.geo(sheerDrape(0.7, h - 0.13, 1.0, 5, sx * 3 + dz), sheer, sx * (CP_PX - 0.06), 0, z);
        k.ring(0.035, 0.012, tie, sx * (CP_PX - 0.06), 1.0, z, 8);
      }
    // valance across the foot
    k.geo(sheerDrape(2.0, 0.22, -1, 14, 2), sheer, 0, h - 0.36, zF - 0.06).rotation.y = Math.PI / 2;
  },
  plan: (ctx, c) => {
    const { w, d } = CP;
    D.box(ctx, -CP_PX, -d / 2 + 0.035, CP_PX, d / 2 - 0.035, 0, tint(c.frame, 0.75), INK_SOFT, LINE_THIN);
    ctx.setLineDash([0.05, 0.04]);
    D.box(ctx, -CP_PX, -d / 2 + 0.035, CP_PX, d / 2 - 0.035, 0, null, INK_SOFT, LINE_THIN);
    ctx.setLineDash([]);
    D.rr(ctx, 0, -d / 2 + 0.07, 2 * CP_PX - 0.08, 0.08, 0.03, tint('#e4dbcd', 0.1));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) D.rr(ctx, sx * CP_PX, sz * (d / 2 - 0.035), 0.07, 0.07, 0.008, tint(c.frame, 0.2));
    void w;
  },
});

/* ================================================================== 8. storage bed with drawers, queen */

const ST = { w: 1.92, d: 2.2, h: 1.22, mw: 1.6, len: 2.0 };
const storageQueen = mkBed({
  id: 'bed2-storage-queen',
  name: 'מיטת קווין עם מגירות אחסון',
  tags: ['קווין', 'זוגית', 'אחסון', 'מגירות', 'מרופדת', 'תעלות', 'פרקטי'],
  size: { w: ST.w, d: ST.d, h: ST.h },
  colors: [C.fabric('#8c8f86'), C.bedding('#f0ece4'), C.sheet(), C.throw('#3d5166')],
  mw: ST.mw,
  len: ST.len,
  my: 0.4,
  cz: -ST.d / 2 + 0.12 + ST.len / 2,
  bedding: (c) => ({ hw: 0.84, drop: 0.27, dropF: 0.06, deco: [c.throw, c.fabric], decoMat: 'velvet', throwKind: 'fabric', seed: 19 }),
  extraActions: [{ kind: 'open' }],
  frame: (k, c) => {
    const f = M.fabric(c.fabric, 10);
    const { w, d, h } = ST;
    const zb = -d / 2;
    // channel-tufted headboard
    k.rbox(w, h - 0.04, 0.06, 0.02, f, 0, 0.04, zb + 0.03, 1);
    const n = 7;
    const cw = (w - 0.04) / n;
    for (let i = 0; i < n; i++) {
      const ch = k.cushion(cw - 0.006, 0.05, h - 0.12, f, 0, 0, 0, 0.022, 0.018, 1);
      ch.rotation.x = Math.PI / 2;
      ch.position.set(-w / 2 + 0.02 + cw * (i + 0.5), 0.08 + (h - 0.12) / 2, zb + 0.06 + 0.025);
    }
    // base: hollow box with two drawers at the foot end
    const bw = 1.7;
    const by = 0.04;
    const bh = 0.36;
    const z0 = zb + 0.12;
    const z1 = d / 2 - 0.06;
    const bz = (z0 + z1) / 2;
    for (const s of [-1, 1]) k.rbox(0.05, bh, z1 - z0, 0.02, f, s * (bw / 2 - 0.025), by, bz, 1);
    k.box(bw - 0.1, 0.04, z1 - z0, f, 0, by + bh - 0.04, bz);
    k.box(bw - 0.1, 0.04, 0.03, f, 0, by, z1 - 0.015);
    k.box(bw - 0.1, 0.06, 0.03, f, 0, by + bh - 0.06, z1 - 0.015);
    k.box(0.04, bh - 0.1, 0.03, f, 0, by + 0.04, z1 - 0.015);
    k.box(bw - 0.1, bh - 0.08, 0.01, MX.inside(c.fabric), 0, by + 0.04, z1 - 0.75);
    k.box(bw - 0.1, 0.01, 0.75, MX.inside(c.fabric), 0, by + 0.035, z1 - 0.375);
    const feet = M.wood('#2f2925');
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.05, by, 0.05, feet, sx * (bw / 2 - 0.06), 0, bz + sz * ((z1 - z0) / 2 - 0.06));
    for (const s of [-1, 1]) {
      drawer(k, {
        x: s * (bw / 4 - 0.005),
        y: by + 0.045,
        zf: z1 + 0.004,
        w: bw / 2 - 0.08,
        h: bh - 0.11,
        depth: 0.72,
        mats: { front: f },
        handle: 'tab',
        hmat: M.brass(),
        open: 0.42,
        clothes: 3,
      });
    }
  },
  plan: (ctx, c) => {
    const { w, d } = ST;
    D.rr(ctx, 0, -d / 2 + 0.12 + (d - 0.18) / 2, 1.7, d - 0.18, 0.02, tint(c.fabric, 0.4));
    D.rr(ctx, 0, -d / 2 + 0.03, w, 0.06, 0.02, tint(c.fabric, 0.15));
  },
  planTop: (ctx) => {
    const z = ST.d / 2 - 0.06;
    for (const s of [-1, 1]) D.line(ctx, s * 0.05, z, s * 0.8, z, INK_SOFT, 0.012);
  },
});

/* ================================================================== 9. daybed */

const DB = { w: 2.06, d: 1.1, h: 1.0, mw: 0.9, len: 1.9 };
const daybed = mkBed({
  id: 'bed2-daybed',
  name: 'מיטת יום עם משענות קש',
  tags: ['מיטת יום', 'דייבד', 'ספה', 'יחיד', 'קש', 'אירוח', 'סלון'],
  size: { w: DB.w, d: DB.d, h: DB.h },
  colors: [C.frame(PAL.oak, 'עץ'), C.bedding('#d9cfbf'), C.sheet('#efe9de'), C.throw('#9bae8a'), slot('cane', 'קש', '#d7bb8c')],
  mw: DB.mw,
  len: DB.len,
  mh: 0.2,
  my: 0.32,
  cz: 0.02,
  alongX: true,
  sits: [
    { x: -0.45, z: 0.3, height: 0.52, facing: 0, kind: 'sit' },
    { x: 0.45, z: 0.3, height: 0.52, facing: 0, kind: 'sit' },
  ],
  bedding: () => ({ pillows: 0, cover: 0.0, fold: 0, drop: 0.15, dropF: 0, hw: 0.46, throwC: null, seed: 23, puff: 0.02 }),
  frame: (k, c) => {
    const wood = M.wood(c.frame);
    const cane = M.rattan(c.cane);
    const { w, d, h } = DB;
    const px = w / 2 - 0.03;
    const pz = d / 2 - 0.03;
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const ph = sz < 0 ? h : 0.66;
        k.rbox(0.05, ph, 0.05, 0.01, wood, sx * px, 0, sz * pz, 1);
        k.sphere(0.03, wood, sx * px, ph, sz * pz, 1, 0.6, 1, 10);
      }
    // arms (ends): frame + cane panel
    for (const sx of [-1, 1]) {
      k.box(0.03, 0.04, d - 0.06, wood, sx * px, 0.6, 0);
      k.box(0.03, 0.04, d - 0.06, wood, sx * px, 0.28, 0);
      k.box(0.008, 0.28, d - 0.08, cane, sx * px, 0.32, 0);
    }
    // back: rails + cane
    k.box(w - 0.06, 0.04, 0.03, wood, 0, h - 0.06, -pz);
    k.box(w - 0.06, 0.04, 0.03, wood, 0, 0.28, -pz);
    k.box(w - 0.08, h - 0.38, 0.008, cane, 0, 0.32, -pz);
    // front rail + slats
    k.rbox(w - 0.06, 0.1, 0.03, 0.006, wood, 0, 0.24, pz, 1);
    k.box(w - 0.1, 0.02, d - 0.08, M.matte('#3a3531'), 0, 0.3, 0);
    // back cushions + bolsters
    const cm = M.linen(c.bedding);
    for (let i = 0; i < 3; i++) {
      const p = k.geo(softPillowGeo(0.58, 0.18, 0.46, 0.08), cm, -0.62 + i * 0.62, 0.52 + 0.21, -pz + 0.12);
      p.rotation.set(-1.25, (i - 1) * 0.04, 0);
    }
    for (const sx of [-1, 1]) {
      const b = k.cyl(0.11, 0.85, M.fabric(c.throw, 10), sx * (px - 0.14), 0.52 + 0.11 - 0.425, 0.02, 0.11, 16);
      b.rotation.x = Math.PI / 2;
      b.position.y = 0.52 + 0.1;
      k.disc(0.112, 0.01, M.fabric(darken(c.throw, 0.15), 10), sx * (px - 0.14), 0.52 + 0.1, 0.02 + 0.43, 14).rotation.x = Math.PI / 2;
    }
  },
  plan: (ctx, c) => {
    const { w, d } = DB;
    D.rr(ctx, 0, 0, w, d, 0.02, tint(c.frame, 0.4));
    D.line(ctx, -w / 2 + 0.03, -d / 2 + 0.03, w / 2 - 0.03, -d / 2 + 0.03, INK_SOFT, 0.02);
  },
  planTop: (ctx, c) => {
    for (let i = 0; i < 3; i++) D.rr(ctx, -0.62 + i * 0.62, -DB.d / 2 + 0.16, 0.56, 0.16, 0.05, tint(c.bedding, 0.4), undefined, LINE_THIN);
    for (const sx of [-1, 1]) D.rr(ctx, sx * (DB.w / 2 - 0.17), 0.02, 0.22, 0.85, 0.08, tint(c.throw, 0.3), undefined, LINE_THIN);
  },
});

/* ================================================================== 10. loft bed with desk (kids) */

const LF = { w: 2.12, d: 1.1, h: 1.95, mw: 0.9, len: 2.0 };
const LF_Y = 1.42;
const loftDesk = mkBed({
  id: 'bed2-loft-desk',
  name: 'מיטת לופט עם שולחן כתיבה',
  category: 'kids',
  tags: ['לופט', 'קומה', 'שולחן', 'ילדים', 'נוער', 'חיסכון במקום', 'סולם'],
  size: { w: LF.w, d: LF.d, h: LF.h },
  colors: [C.frame('#f1eee8', 'מסגרת'), slot('top', 'משטח', PAL.oak), C.bedding('#8ea5b7'), C.sheet(), C.throw('#d6a544')],
  mw: LF.mw,
  len: LF.len,
  mh: 0.18,
  my: LF_Y,
  cz: 0,
  alongX: true,
  sits: [],
  bedding: () => ({ pillows: 1, drop: 0.1, dropF: 0, hw: 0.44, seed: 29, throwKind: 'knit' }),
  frame: (k, c) => {
    const m = M.paint(c.frame, 0.45);
    const top = M.wood(c.top);
    const { w, d, h } = LF;
    const px = w / 2 - 0.03;
    const pz = d / 2 - 0.03;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.rbox(0.06, h, 0.06, 0.008, m, sx * px, 0, sz * pz, 1);
    // bed deck
    for (const sz of [-1, 1]) k.box(w - 0.12, 0.14, 0.03, m, 0, LF_Y - 0.08, sz * pz);
    for (const sx of [-1, 1]) k.box(0.03, 0.14, d - 0.12, m, sx * px, LF_Y - 0.08, 0);
    k.box(w - 0.12, 0.018, d - 0.12, M.wood(PAL.birch), 0, LF_Y - 0.018, 0);
    // guard rails (front has the opening for the ladder at +X)
    const gy = LF_Y + 0.36;
    k.box(w - 0.12, 0.05, 0.028, m, 0, gy, -pz);
    k.box(w - 0.12, 0.05, 0.028, m, 0, LF_Y + 0.12, -pz);
    k.box(w - 0.56, 0.05, 0.028, m, -0.22, gy, pz);
    k.box(w - 0.56, 0.05, 0.028, m, -0.22, LF_Y + 0.12, pz);
    k.box(0.05, gy - LF_Y + 0.05, 0.03, m, 0.55, LF_Y - 0.02, pz);
    for (const sx of [-1, 1]) k.box(0.028, 0.05, d - 0.12, m, sx * px, gy, 0);
    // ladder at the +X end of the front
    const lx0 = 0.66;
    const lx1 = px - 0.03;
    for (const x of [lx0, lx1]) k.rbox(0.04, gy + 0.05, 0.05, 0.006, m, x, 0, pz, 1);
    for (let i = 0; i < 5; i++) k.box(lx1 - lx0 - 0.04, 0.03, 0.045, top, (lx0 + lx1) / 2, 0.3 + i * 0.3, pz);
    // desk underneath + shelf
    const dx0 = -px + 0.03;
    const dx1 = 0.5;
    const dz0 = -pz + 0.03;
    const dz1 = 0.18;
    k.rbox(dx1 - dx0, 0.028, dz1 - dz0, 0.006, top, (dx0 + dx1) / 2, 0.72, (dz0 + dz1) / 2, 1);
    k.box(0.04, 0.72, 0.04, m, dx1 - 0.03, 0, dz1 - 0.03);
    k.box(0.04, 0.72, 0.04, m, dx0 + 0.03, 0, dz1 - 0.03);
    k.box(dx1 - dx0, 0.02, 0.22, top, (dx0 + dx1) / 2, 1.08, -pz + 0.13);
    // drawer box under the desk top
    k.box(0.42, 0.11, dz1 - dz0 - 0.04, m, dx1 - 0.27, 0.61, (dz0 + dz1) / 2 - 0.02);
    drawer(k, { x: dx1 - 0.27, y: 0.612, zf: dz1, w: 0.4, h: 0.105, depth: 0.5, mats: { front: m }, handle: 'cup', hmat: M.steel(), hlen: 0.1, open: 0.28 });
    // desk props: books, lamp, pencil cup, laptop
    const cols = ['#c7775a', '#d6a544', '#9bae8a', '#7a8fa3', '#e6dfd0', '#3d5166'];
    for (let i = 0; i < 6; i++) k.box(0.028, 0.2 + (i % 3) * 0.02, 0.15, M.matte(cols[i]), -0.9 + i * 0.031, 1.1, -pz + 0.12);
    k.cyl(0.03, 0.09, M.ceramic('#d6a544'), 0.36, 0.748, -0.3, 0.032, 12);
    k.rbox(0.32, 0.012, 0.22, 0.004, M.brushed('#b9bcc0'), -0.25, 0.748, -0.12, 1);
    const lamp = M.blackMetal();
    k.cyl(0.06, 0.015, lamp, 0.15, 0.748, -0.35, 0.06, 14);
    k.rod([0.15, 0.76, -0.35], [0.12, 1.0, -0.3], 0.006, lamp);
    k.cyl(0.055, 0.08, lamp, 0.12, 0.94, -0.24, 0.025, 14).rotation.x = 0.5;
  },
  plan: (ctx, c) => {
    const { w, d } = LF;
    D.rr(ctx, 0, 0, w, d, 0.01, tint(c.frame, 0.6));
    D.box(ctx, 0.64, d / 2 - 0.05, w / 2 - 0.04, d / 2, 0, tint(c.top, 0.3), undefined, LINE_THIN);
  },
  planTop: () => {},
});

/* ================================================================== 11. race-car bed (kids) */

const RC = { w: 1.26, d: 2.24, h: 0.78, mw: 0.9, len: 1.9 };
function carSide(): THREE.Shape {
  const zH = -RC.d / 2 + 0.02;
  const zF = RC.d / 2 - 0.02;
  const s = new THREE.Shape();
  const rw = 0.21;
  const fWheel = zF - 0.4;
  const rWheel = zH + 0.42;
  s.moveTo(zH, 0.08);
  s.lineTo(rWheel - rw, 0.08);
  s.absarc(rWheel, 0.08, rw, Math.PI, 0, true);
  s.lineTo(fWheel - rw, 0.08);
  s.absarc(fWheel, 0.08, rw, Math.PI, 0, true);
  s.lineTo(zF, 0.08);
  s.lineTo(zF, 0.3);
  s.quadraticCurveTo(zF - 0.04, 0.4, zF - 0.3, 0.42);
  s.lineTo(zH + 0.75, 0.42);
  s.quadraticCurveTo(zH + 0.4, 0.42, zH + 0.25, 0.62);
  s.quadraticCurveTo(zH + 0.15, 0.7, zH, 0.68);
  s.closePath();
  return s;
}
const raceCar = mkBed({
  id: 'bed2-racecar',
  name: 'מיטת מכונית מרוץ',
  category: 'kids',
  tags: ['מכונית', 'מרוץ', 'ילדים', 'כיף', 'צבעוני', 'יחיד', 'ספוילר'],
  size: { w: RC.w, d: RC.d, h: RC.h },
  colors: [C.frame('#c8322b', 'מרכב'), slot('stripe', 'פסים', '#f4f1ea'), C.bedding('#3d5166'), C.sheet('#eef1f4'), C.throw('#d6a544')],
  mw: RC.mw,
  len: RC.len,
  mh: 0.15,
  my: 0.2,
  cz: 0.0,
  bedding: () => ({ hw: 0.45, drop: 0.06, dropF: 0.05, r: 0.03, thick: 0.04, fold: 0.26, seed: 31, deco: [], throwKind: 'fabric' }),
  frame: (k, c) => {
    const body = M.lacquer(c.frame);
    const stripe = M.lacquer(c.stripe);
    const { d } = RC;
    const zH = -d / 2 + 0.02;
    const zF = d / 2 - 0.02;
    for (const s of [-1, 1]) {
      k.geo(profileX(carSide(), 0.04, s * 0.535), body, 0, 0, 0);
      // number roundel + stripe on the side
      const disc = k.cyl(0.11, 0.006, stripe, s * 0.562, 0.26 - 0.003, 0.1, 0.11, 22);
      disc.rotation.z = Math.PI / 2;
      disc.position.y = 0.26;
      const bar = k.box(0.006, 0.05, 0.07, M.matte('#1e1f22'), s * 0.566, 0.235, 0.1);
      bar.rotation.x = 0.3;
      k.box(0.004, 0.04, zF - zH - 1.3, stripe, s * 0.56, 0.34, 0.25);
    }
    // nose with headlights + grille, head panel, slat deck
    k.rbox(1.07, 0.3, 0.06, 0.02, body, 0, 0.06, zF - 0.03, 1);
    k.rbox(1.07, 0.1, 0.25, 0.04, body, 0, 0.3, zF - 0.14, 1);
    for (const s of [-1, 1]) {
      const hl = k.cyl(0.055, 0.01, M.glow('#fff6d8', 0.6), s * 0.34, 0.25, zF + 0.002, 0.055, 18);
      hl.rotation.x = Math.PI / 2;
      hl.position.set(s * 0.34, 0.25, zF + 0.002);
    }
    k.rbox(0.42, 0.1, 0.01, 0.01, M.matte('#1e1f22'), 0, 0.12, zF + 0.002, 1);
    for (const s of [-1, 1]) k.box(0.08, 0.008, 0.2, stripe, s * 0.1, 0.4, zF - 0.13);
    k.rbox(1.07, 0.62, 0.05, 0.02, body, 0, 0.06, zH + 0.03, 1);
    k.box(1.03, 0.02, d - 0.12, M.matte('#2b2b2c'), 0, 0.18, 0);
    // spoiler on two struts
    for (const s of [-1, 1]) k.box(0.03, 0.12, 0.08, M.matte('#1e1f22'), s * 0.34, 0.66, zH + 0.08);
    k.rbox(1.22, 0.025, 0.2, 0.008, body, 0, RC.h - 0.025, zH + 0.1, 1);
    for (const s of [-1, 1]) k.rbox(0.015, 0.1, 0.22, 0.004, stripe, s * 0.6, RC.h - 0.1, zH + 0.11, 1);
    // wheels
    const tyre = M.rubber('#1c1c1e');
    const rim = M.chrome();
    for (const s of [-1, 1])
      for (const wz of [zF - 0.4, zH + 0.42]) {
        const t = k.cyl(0.17, 0.08, tyre, 0, 0, 0, 0.17, 20);
        t.rotation.z = Math.PI / 2;
        t.position.set(s * 0.585, 0.17, wz);
        const r = k.cyl(0.09, 0.012, rim, 0, 0, 0, 0.09, 14);
        r.rotation.z = Math.PI / 2;
        r.position.set(s * 0.626, 0.17, wz);
      }
  },
  plan: (ctx, c) => {
    const { d } = RC;
    D.rr(ctx, 0, 0, 1.11, d - 0.04, 0.08, tint(c.frame, 0.35));
    for (const s of [-1, 1]) for (const wz of [d / 2 - 0.42, -d / 2 + 0.44]) D.rr(ctx, s * 0.585, wz, 0.08, 0.34, 0.02, '#3a3b3d');
    D.rr(ctx, 0, -d / 2 + 0.12, 1.22, 0.2, 0.02, tint(c.frame, 0.1));
    for (const s of [-1, 1]) D.box(ctx, s * 0.1 - 0.04, d / 2 - 0.25, s * 0.1 + 0.04, d / 2 - 0.03, 0, '#ffffff', undefined, LINE_THIN);
  },
});

/* ================================================================== 12. baby crib */

const CB = { w: 1.3, d: 0.7, h: 0.96, mw: 0.6, len: 1.2 };
const crib = mkBed({
  id: 'bed2-crib',
  name: 'עריסת תינוק עם מעקות',
  category: 'kids',
  tags: ['עריסה', 'מיטת תינוק', 'תינוק', 'לול', 'מעקה', 'חדר תינוק'],
  size: { w: CB.w, d: CB.d, h: CB.h },
  colors: [C.frame('#f3f1ec', 'מסגרת'), C.bedding('#e8c9bd'), C.sheet('#f6f3ee'), slot('toy', 'בובה', '#d9c7a7')],
  mw: CB.mw,
  len: CB.len,
  mh: 0.1,
  my: 0.32,
  cz: 0,
  alongX: true,
  sits: [],
  bedding: () => ({ pillows: 0, cover: 0.42, fold: 0.14, drop: 0, dropF: 0, hw: 0.27, throwC: null, thick: 0.035, puff: 0.015, seed: 37 }),
  frame: (k, c) => {
    const m = M.paint(c.frame, 0.4);
    const { w, d, h } = CB;
    const px = w / 2 - 0.025;
    const pz = d / 2 - 0.025;
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        k.rbox(0.05, h - 0.03, 0.05, 0.01, m, sx * px, 0, sz * pz, 1);
        k.sphere(0.028, m, sx * px, h - 0.03, sz * pz, 1, 0.7, 1, 10);
      }
    for (const sz of [-1, 1]) {
      for (const y of [0.22, h - 0.1]) k.rbox(w - 0.08, 0.04, 0.035, 0.008, m, 0, y, sz * pz, 1);
      const n = 17;
      for (let i = 1; i < n; i++) {
        const x = -px + (2 * px * i) / n;
        k.rod([x, 0.26, sz * pz], [x, h - 0.1, sz * pz], 0.011, m, 0.011, 6);
      }
    }
    for (const sx of [-1, 1]) {
      k.rbox(0.035, 0.04, d - 0.08, 0.008, m, sx * px, 0.22, 0, 1);
      k.rbox(0.035, 0.04, d - 0.08, 0.008, m, sx * px, h - 0.1, 0, 1);
      for (let i = 1; i < 7; i++) {
        const z = -pz + (2 * pz * i) / 7;
        k.rod([sx * px, 0.26, z], [sx * px, h - 0.1, z], 0.011, m, 0.011, 6);
      }
    }
    k.box(w - 0.08, 0.02, d - 0.08, M.wood(PAL.birch), 0, 0.3, 0);
    // a plush bunny in the corner
    const toy = M.fur(c.toy);
    const tx = 0.42;
    const tz = -0.15;
    k.sphere(0.07, toy, tx, 0.42 + 0.06, tz, 1, 1.05, 0.9, 12);
    k.sphere(0.055, toy, tx, 0.42 + 0.17, tz + 0.01, 1, 1, 1, 12);
    for (const s of [-1, 1]) {
      const ear = k.sphere(0.022, toy, tx + s * 0.025, 0.42 + 0.26, tz, 1, 2.6, 0.7, 8);
      ear.rotation.z = -s * 0.25;
    }
    k.sphere(0.008, M.matte('#2a2a2a'), tx - 0.02, 0.42 + 0.18, tz + 0.06, 1, 1, 1, 6);
    k.sphere(0.008, M.matte('#2a2a2a'), tx + 0.02, 0.42 + 0.18, tz + 0.06, 1, 1, 1, 6);
  },
  plan: (ctx, c) => {
    const { w, d } = CB;
    D.rr(ctx, 0, 0, w, d, 0.02, tint(c.frame, 0.5));
    D.rr(ctx, 0, 0, w - 0.08, d - 0.08, 0.01, null, INK_SOFT, LINE_THIN);
  },
  planTop: (ctx, c) => {
    D.circle(ctx, 0.42, -0.15, 0.07, tint(c.toy, 0.3), undefined, LINE_THIN);
  },
});

/* ================================================================== 13. round bed */

const RD = { w: 2.36, d: 2.4, h: 1.05, R: 1.0 };
const RD_OFF = 0.09;
const roundBed = mkBed({
  id: 'bed2-round',
  name: 'מיטה עגולה עם ראש מעוגל',
  tags: ['עגולה', 'זוגית', 'קינג', 'מרופדת', 'קטיפה', 'הוליווד', 'רטרו'],
  size: { w: RD.w, d: RD.d, h: RD.h },
  colors: [C.fabric('#d8c3b3'), C.bedding('#efe6dc'), C.sheet(), C.throw('#a86b5a')],
  mw: 1.4,
  len: 1.4,
  my: 0.36,
  cz: RD_OFF,
  sits: [
    { x: 0.6, z: RD_OFF + 0.55, height: 0.58, facing: Math.PI / 4, kind: 'sit' },
    { x: -0.6, z: RD_OFF + 0.55, height: 0.58, facing: -Math.PI / 4, kind: 'sit' },
  ],
  ownBedding: true,
  bedding: () => ({}),
  frame: (k, c) => {
    const v = M.velvet(c.fabric);
    const z0 = RD_OFF;
    k.cyl(1.1, 0.3, v, 0, 0.06, z0, 1.1, 36);
    k.cyl(1.0, 0.06, M.matte('#2f2925'), 0, 0, z0, 1.0, 24);
    const hb = arcPanelGeo(1.16, 0.12, 0.98, 2.35, 18);
    k.geo(hb, v, 0, 0.07, z0 - 1.16);
    // piping on the headboard top
    const pts: V3[] = [];
    for (let i = 0; i <= 12; i++) {
      const a = -Math.PI / 2 - 1.175 + (2.35 * i) / 12;
      pts.push([Math.cos(a) * 1.22, 1.05 - 0.008, z0 + Math.sin(a) * 1.22]);
    }
    k.tube(pts, 0.009, M.velvet(darken(c.fabric, 0.1)), { seg: 36, radial: 6 });
    // round mattress, bedspread, pillows
    const top = 0.36 + 0.22;
    k.cyl(RD.R, 0.04, M.fabric('#e8e5de', 30), 0, 0.36, z0, RD.R, 36);
    k.cyl(RD.R + 0.005, 0.18, M.fabric(c.sheet, 18), 0, 0.4, z0, RD.R + 0.005, 36);
    const spread = k.geo(roundDrapeGeo(RD.R + 0.01, top + 0.02, 0.24, { seed: 5, nSeg: 36 }), MX.drape(c.bedding, 11), 0, 0, z0);
    spread.castShadow = true;
    const pm = M.fabric(c.sheet, 18);
    for (let i = 0; i < 3; i++) {
      const a = -Math.PI / 2 + (i - 1) * 0.55;
      const p = k.geo(softPillowGeo(0.62, 0.18, 0.44), pm, Math.cos(a) * 0.68, top + 0.14, z0 + Math.sin(a) * 0.68);
      p.rotation.set(-0.5, -(a + Math.PI / 2), 0, 'YXZ');
    }
    for (let i = 0; i < 2; i++) {
      const a = -Math.PI / 2 + (i - 0.5) * 0.5;
      const p = k.geo(softPillowGeo(0.42, 0.13, 0.42, 0.05), M.velvet(c.throw), Math.cos(a) * 0.42, top + 0.22, z0 + Math.sin(a) * 0.42);
      p.rotation.set(-1.15, -(a + Math.PI / 2), 0, 'YXZ');
    }
  },
  plan: (ctx, c) => {
    const z0 = RD_OFF;
    D.circle(ctx, 0, z0, 1.1, tint(c.fabric, 0.4));
    ctx.beginPath();
    ctx.arc(0, z0, 1.22, -Math.PI / 2 - 1.175, -Math.PI / 2 + 1.175);
    ctx.lineWidth = 0.12;
    ctx.strokeStyle = tint(c.fabric, 0.1);
    ctx.stroke();
    ctx.lineWidth = 0.02;
    D.circle(ctx, 0, z0, 1.06, tint(c.bedding, 0.35));
    D.circle(ctx, 0, z0, 0.7, null, INK_SOFT, LINE_THIN);
    for (let i = 0; i < 3; i++) {
      const a = -Math.PI / 2 + (i - 1) * 0.55;
      D.ellipse(ctx, Math.cos(a) * 0.7, z0 + Math.sin(a) * 0.7, 0.3, 0.17, '#ffffff', undefined, LINE_THIN, a + Math.PI / 2);
    }
  },
});

/* ================================================================== 14. sleigh bed, double */

const SL = { w: 1.76, d: 2.32, h: 1.06, mw: 1.4, len: 2.0 };
const sleighDouble = mkBed({
  id: 'bed2-sleigh-double',
  name: 'מיטת מזחלת קלאסית מעץ אגוז',
  tags: ['זוגית', 'מזחלת', 'קלאסי', 'עץ אגוז', 'מעוגל', 'כפרי'],
  size: { w: SL.w, d: SL.d, h: SL.h },
  colors: [C.frame(PAL.walnut, 'עץ'), C.bedding('#ede5d8'), C.sheet(), C.throw('#6f2f2f')],
  mw: SL.mw,
  len: SL.len,
  my: 0.3,
  cz: -SL.d / 2 + 0.16 + SL.len / 2,
  bedding: (c) => ({ hw: 0.75, drop: 0.24, dropF: 0.05, euro: false, deco: [c.throw, '#d8c8a8'], decoMat: 'velvet', throwKind: 'fabric', seed: 41 }),
  frame: (k, c) => {
    const wood = M.wood(c.frame);
    const { w, d } = SL;
    const zb = -d / 2;
    const zfE = d / 2;
    // headboard: board leaning back and scrolling over at the top
    k.geo(
      ribbonX(
        [
          [zb + 0.14, 0.02],
          [zb + 0.12, 0.45],
          [zb + 0.085, 0.82],
          [zb + 0.055, 1.02],
          [zb + 0.04, SL.h - 0.04],
          [zb + 0.02, SL.h - 0.06],
        ],
        0.045,
        w - 0.1,
      ),
      wood,
    );
    // footboard: low panel curling forward
    k.geo(
      ribbonX(
        [
          [zfE - 0.14, 0.02],
          [zfE - 0.13, 0.3],
          [zfE - 0.1, 0.5],
          [zfE - 0.06, 0.6],
          [zfE - 0.03, 0.6],
        ],
        0.045,
        w - 0.1,
      ),
      wood,
    );
    // posts + side rails
    for (const s of [-1, 1]) {
      k.rbox(0.06, 1.0, 0.07, 0.012, wood, s * (w / 2 - 0.03), 0, zb + 0.12, 1);
      k.rbox(0.06, 0.6, 0.07, 0.012, wood, s * (w / 2 - 0.03), 0, zfE - 0.12, 1);
      k.rbox(0.04, 0.2, d - 0.32, 0.012, wood, s * (w / 2 - 0.05), 0.14, 0, 1);
    }
    k.box(w - 0.14, 0.02, d - 0.32, M.matte('#3a3531'), 0, 0.28, 0);
  },
  plan: (ctx, c) => {
    const { w, d } = SL;
    D.rr(ctx, 0, 0, w, d - 0.04, 0.02, tint(c.frame, 0.45));
    D.rr(ctx, 0, -d / 2 + 0.09, w - 0.04, 0.12, 0.03, tint(c.frame, 0.15));
    D.rr(ctx, 0, d / 2 - 0.09, w - 0.04, 0.12, 0.03, tint(c.frame, 0.15));
  },
});

/* ================================================================== 15. house floor bed (kids) */

const HS = { w: 1.24, d: 2.16, h: 1.76, mw: 0.9, len: 2.0 };
const houseBed = mkBed({
  id: 'bed2-house-single',
  name: 'מיטת בית מונטסורי לילדים',
  category: 'kids',
  tags: ['בית', 'מונטסורי', 'רצפה', 'ילדים', 'עץ', 'גג', 'דגלונים', 'יחיד'],
  size: { w: HS.w, d: HS.d, h: HS.h },
  colors: [C.frame(PAL.birch, 'עץ'), C.bedding('#9bae8a'), C.sheet('#f3efe7'), C.throw('#dcb3a6'), slot('flags', 'דגלונים', '#d6a544')],
  mw: HS.mw,
  len: HS.len,
  mh: 0.16,
  my: 0.08,
  cz: 0,
  bedding: (c) => ({ hw: 0.535, drop: 0.19, dropF: 0, r: 0.03, thick: 0.04, deco: [c.flags], decoMat: 'knit', throwKind: 'knit', seed: 43, floor: 0.03 }),
  frame: (k, c) => {
    const wood = M.wood(c.frame);
    const { d } = HS;
    const px = 0.505;
    const pz = d / 2 - 0.025;
    const yE = 1.2;
    const yR = HS.h - 0.04;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.rbox(0.05, yE, 0.05, 0.008, wood, sx * px, 0, sz * pz, 1);
    for (const sx of [-1, 1]) {
      k.rbox(0.04, 0.2, d - 0.1, 0.008, wood, sx * px, 0.02, 0, 1);
      k.rbox(0.04, 0.05, d - 0.1, 0.008, wood, sx * px, yE - 0.05, 0, 1);
    }
    for (const sz of [-1, 1]) {
      k.rbox(1.0, 0.2, 0.04, 0.008, wood, 0, 0.02, sz * pz, 1);
      for (const sx of [-1, 1]) k.beam([sx * (px + 0.0), yE - 0.02, sz * pz], [0, yR, sz * pz], 0.05, 0.05, wood, 0.008);
    }
    k.rbox(0.06, 0.04, d, 0.008, wood, 0, yR, 0, 1);
    k.box(0.95, 0.02, d - 0.1, M.matte('#3a3531'), 0, 0.06, 0);
    // bunting garland under the ridge
    const flag = M.cloth(c.flags);
    const flag2 = M.cloth(lighten(c.flags, 0.45));
    const n = 9;
    const pts: V3[] = [];
    for (let i = 0; i <= n; i++) {
      const z = -pz + 0.06 + ((2 * pz - 0.12) * i) / n;
      const sag = 0.12 * Math.sin((i / n) * Math.PI);
      pts.push([0, yR - 0.02 - sag, z]);
    }
    k.tube(pts, 0.003, M.matte('#e9e4da'), { seg: 24, radial: 3 });
    for (let i = 0; i < n; i++) {
      const [x, y, z] = pts[i];
      const z2 = pts[i + 1][2];
      const s = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2((z2 - z) * 0.8, 0), new THREE.Vector2((z2 - z) * 0.4, -0.14)]);
      const g = new THREE.ShapeGeometry(s);
      const m = k.geo(g, i % 2 ? flag : flag2, x, y, z + 0.02);
      m.rotation.y = -Math.PI / 2;
    }
  },
  plan: (ctx, c) => {
    const { w, d } = HS;
    D.rr(ctx, 0, 0, 1.06, d, 0.01, tint(c.frame, 0.4));
    D.line(ctx, 0, -d / 2, 0, d / 2, INK_SOFT, 0.03);
    void w;
  },
  planTop: (ctx) => {
    ctx.setLineDash([0.05, 0.04]);
    D.line(ctx, 0, -HS.d / 2 + 0.06, 0, HS.d / 2 - 0.06, INK_SOFT, 0.012);
    ctx.setLineDash([]);
  },
});

export const BEDS: FurnitureDef[] = [
  upholsteredQueen,
  wingbackKing,
  japandiPlatform,
  caneDouble,
  metalSingle,
  brassQueen,
  canopyKing,
  storageQueen,
  daybed,
  loftDesk,
  raceCar,
  crib,
  roundBed,
  sleighDouble,
  houseBed,
];

