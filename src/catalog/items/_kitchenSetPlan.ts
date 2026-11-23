/**
 * Ready-made kitchens, part 1: the declarative spec of a kitchen set and the PLANNER that lays it
 * out at any size (runs of cabinet modules, wall-cabinet spans, island, stools, anchors), plus the
 * 2D plan symbol. Geometry lives in `_kitchenSetBuild.ts`.
 *
 * Every run (a straight row of cabinets) is planned in its own local frame: x runs along the run
 * from 0 to L, the back (wall side) is at z = 0 and the fronts face +z; y is up. A run is placed in
 * the item frame by a rotation `th` about Y and an origin (ox, oz):
 *   item = (ox + x·cos th + z·sin th,  oz − x·sin th + z·cos th)
 */
import type { ColorSlot, ItemAnchors, ItemSize, LocalPoint, ResizeSpec, SeatAnchor } from '../types';
import { D, INK, INK_SOFT, LINE_THIN, sym, tint, type Ctx2D } from '../kit';

/* ------------------------------------------------------------------------------------------ */
/* Spec                                                                                        */
/* ------------------------------------------------------------------------------------------ */

export type Layout = 'straight' | 'L' | 'U' | 'galley' | 'island' | 'peninsula';
export type SlotKind =
  | 'sink'
  | 'dw'
  | 'hob'
  | 'drawers'
  | 'doors'
  | 'flex'
  | 'pull'
  | 'fridge'
  | 'free'
  | 'oven'
  | 'pantry'
  | 'wine'
  | 'open'
  | 'corner'
  | 'filler';
export type UpperKind = 'cab' | 'glass' | 'shelf' | 'none';
export type SpanKind = UpperKind | 'hood' | 'ihood';
export type FrontStyle = 'slab' | 'shaker' | 'slim' | 'fluted' | 'slats';
export type Finish = 'matte' | 'satin' | 'gloss' | 'wood' | 'concrete' | 'steel';
export type Handle = 'gola' | 'bar' | 'long' | 'knob' | 'cup' | 'tab' | 'jpull' | 'push';
export type TopFinish = 'quartz' | 'marble' | 'terrazzo' | 'concrete' | 'wood' | 'steel' | 'granite';
export type SplashKind = 'slab' | 'subway' | 'square' | 'zellige' | 'herring' | 'vstack' | 'brick' | 'glass' | 'steel' | 'paint';
export type HoodKind = 'chimney' | 'box' | 'integrated' | 'canopy' | 'glass' | 'island' | 'downdraft';
export type HobKind = 'induction' | 'gas' | 'gas5';
export type SinkKind = 'steel' | 'steel15' | 'double' | 'farm' | 'black';
export type TapKind = 'goose' | 'pro' | 'square';
export type StoolKind = 'metal' | 'wood' | 'pedestal';
export type PropKind = 'board' | 'fruit' | 'jars' | 'herbs' | 'vase' | 'pot' | 'oil' | 'crock' | 'kettle';

/** One slot of a run. Tall slots (fridge / free / oven / pantry) go from the floor to the top. */
export interface Slot {
  k: SlotKind;
  /** width; `flex` slots share whatever length is left */
  w?: number;
  /** the planner may shrink the slot down to this width when the run is short */
  min?: number;
  /** drop order when the run is too short (higher = dropped first); absent = never dropped */
  drop?: number;
  /** weight of a flex slot */
  wt?: number;
  /** override of the wall-cabinet kind above this slot */
  up?: UpperKind;
}

export interface KStyle {
  front: FrontStyle;
  upperFront?: FrontStyle;
  finish: Finish;
  upperFinish?: Finish;
  /** which colour / finish the tall units take */
  tall: 'base' | 'upper';
  handle: Handle;
  upperHandle?: Handle;
  metal?: 'polished' | 'brushed' | 'matte';
  top: TopFinish;
  topT: number;
  splash: SplashKind;
  plinth: 'match' | 'dark' | 'steel' | 'legs';
  upper: UpperKind;
  /** wall cabinets of the side legs / the opposite galley run (default = upper) */
  legUpper?: UpperKind;
  /** wall cabinets of the right leg of a U (default = legUpper) */
  rightUpper?: UpperKind;
  hood: HoodKind;
  hob: HobKind;
  sink: SinkKind;
  tap: TapKind;
  led?: boolean;
  /** drawer split of drawer modules, top to bottom */
  drawers?: number[];
  /** door modules get a drawer on top */
  doorDrawer?: boolean;
  /** what flexible stretches are filled with */
  flex?: Array<'drawers' | 'doors'>;
  /** open shelves: oak boards / painted boards / steel */
  shelf?: 'wood' | 'paint' | 'steel';
  /** island / peninsula fronts finish (colour = accent) */
  islandFinish?: Finish;
  islandFront?: FrontStyle;
  /** freestanding fridge: french door or single door with freezer drawer */
  fridgeDoors?: 'french' | 'single';
  stool?: StoolKind;
  props?: PropKind[];
  /** stainless dishwasher instead of an integrated one */
  dwSteel?: boolean;
}

export interface IslandSpec {
  /** island length as a fraction of w (island layout) */
  len?: number;
  seats?: boolean;
  waterfall?: boolean;
  /** peninsula: raised breakfast bar on the dining side */
  raised?: boolean;
}

export interface KSpec {
  id: string;
  name: string;
  tags: string[];
  layout: Layout;
  size: ItemSize;
  resize: ResizeSpec;
  colors: ColorSlot[];
  style: KStyle;
  /** back run left → right; legs from the corner outward; galley front run left → right; island left → right */
  slots: { back: Slot[]; left?: Slot[]; right?: Slot[]; front?: Slot[]; island?: Slot[] };
  island?: IslandSpec;
}

/* ------------------------------------------------------------------------------------------ */
/* Dimensions                                                                                  */
/* ------------------------------------------------------------------------------------------ */

/** countertop height */
export const TOP = 0.9;
/** standard counter depth */
export const CD = 0.62;
/** wall cabinet depth (to the front face) */
export const UD = 0.35;
/** bottom of the wall cabinets */
export const UB = 1.45;
/** front panel thickness */
export const FT = 0.019;
/** how far a raised breakfast bar sits above the floor */
export const BAR_Y = 1.08;

const DEF_W: Record<SlotKind, number> = {
  sink: 0.8,
  dw: 0.6,
  hob: 0.6,
  drawers: 0.6,
  doors: 0.6,
  flex: 0,
  pull: 0.2,
  fridge: 0.6,
  free: 0.78,
  oven: 0.6,
  pantry: 0.6,
  wine: 0.3,
  open: 0.4,
  corner: CD,
  filler: 0.05,
};

export const isTall = (k: SlotKind): boolean => k === 'fridge' || k === 'free' || k === 'oven' || k === 'pantry';
const hoodOnWall = (h: HoodKind): boolean => h !== 'island' && h !== 'downdraft';

/* ------------------------------------------------------------------------------------------ */
/* Plan                                                                                        */
/* ------------------------------------------------------------------------------------------ */

export interface Mod {
  k: SlotKind;
  x0: number;
  x1: number;
  up?: UpperKind;
}

export interface USpan {
  x0: number;
  x1: number;
  kind: SpanKind;
}

export interface Run {
  key: 'back' | 'left' | 'right' | 'front' | 'island' | 'pen';
  L: number;
  /** counter depth (fronts at cd − 0.02) */
  cd: number;
  /** counter overhang behind the back (island / peninsula seating side) */
  bo: number;
  th: number;
  ox: number;
  oz: number;
  mods: Mod[];
  spans: USpan[];
  /** against a wall: backsplash + wall cabinets */
  wall: boolean;
  /** finished end panels at local x = 0 / L */
  end0: boolean;
  end1: boolean;
  /** extension of the wall cabinets / backsplash beyond the run ends (into a corner) */
  ue0: number;
  ue1: number;
  raised: boolean;
  waterfall: boolean;
}

export interface Stool {
  x: number;
  z: number;
  facing: number;
  seat: number;
}

export interface Plan {
  size: ItemSize;
  runs: Run[];
  stools: Stool[];
  /** island hood centre (item frame) when the hob is on the island */
  islandHood?: { x: number; z: number; th: number; w: number };
  anchors: ItemAnchors;
}

const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));
const r3 = (v: number): number => Math.round(v * 1000) / 1000;

/** Lay out the slots of one run along [0, L]. */
export function planRun(slots: Slot[], L: number, pattern: Array<'drawers' | 'doors'>): Mod[] {
  const items = slots.map((s) => ({ ...s, w: s.k === 'flex' ? 0 : (s.w ?? DEF_W[s.k]) }));
  const fixed = () => items.reduce((a, i) => a + (i.k === 'flex' ? 0 : i.w), 0);
  for (let guard = 0; guard < 40 && fixed() > L + 1e-6; guard++) {
    const shrink = items.filter((i) => i.min !== undefined && i.w > i.min + 1e-6).sort((a, b) => b.w - b.min! - (a.w - a.min!))[0];
    if (shrink) {
      shrink.w = Math.max(shrink.min!, shrink.w - (fixed() - L));
      continue;
    }
    const drop = items.filter((i) => i.drop !== undefined).sort((a, b) => b.drop! - a.drop!)[0];
    if (drop) {
      items.splice(items.indexOf(drop), 1);
      continue;
    }
    // last resort: squeeze everything but the corners proportionally
    const f = fixed();
    const corners = items.filter((i) => i.k === 'corner').reduce((a, i) => a + i.w, 0);
    const k = Math.max(0.1, (L - corners) / Math.max(1e-6, f - corners));
    for (const i of items) if (i.k !== 'corner') i.w *= k;
    break;
  }
  let rest = Math.max(0, L - fixed());
  const flexes = items.filter((i) => i.k === 'flex');
  if (!flexes.length && rest > 0.004) {
    // nothing absorbs the slack: a filler at the open end of the run
    items.push({ k: 'filler', w: rest });
    rest = 0;
  }
  const wsum = flexes.reduce((a, i) => a + (i.wt ?? 1), 0) || 1;
  for (const f of flexes) f.w = (rest * (f.wt ?? 1)) / wsum;
  const out: Mod[] = [];
  let x = 0;
  let pi = 0;
  for (const it of items) {
    if (it.w < 0.004) continue;
    if (it.k !== 'flex') {
      out.push({ k: it.k, x0: r3(x), x1: r3(x + it.w), up: it.up });
      x += it.w;
      continue;
    }
    const f = it.w;
    if (f < 0.15) out.push({ k: 'filler', x0: r3(x), x1: r3(x + f), up: it.up });
    else if (f < 0.3) out.push({ k: 'pull', x0: r3(x), x1: r3(x + f), up: it.up });
    else {
      let n = Math.max(1, Math.round(f / 0.6));
      if (f / n > 0.92) n++;
      for (let i = 0; i < n; i++) {
        out.push({ k: pattern[pi++ % pattern.length], x0: r3(x + (f * i) / n), x1: r3(x + (f * (i + 1)) / n), up: it.up });
      }
    }
    x += f;
  }
  if (out.length) out[out.length - 1].x1 = r3(L);
  return out;
}

/** Wall-cabinet spans of a run (merged stretches of one kind; tall units and hoods break them). */
function planSpans(r: Run, st: KStyle, upper: UpperKind): USpan[] {
  if (!r.wall) return [];
  const segs: Array<USpan | { x0: number; x1: number; kind: 'tall' }> = [];
  for (const m of r.mods) {
    if (isTall(m.k)) segs.push({ x0: m.x0, x1: m.x1, kind: 'tall' });
    else if (m.k === 'hob' && hoodOnWall(st.hood)) {
      const hw = Math.min(0.9, m.x1 - m.x0);
      const c = (m.x0 + m.x1) / 2;
      if (c - hw / 2 > m.x0 + 0.01) segs.push({ x0: m.x0, x1: c - hw / 2, kind: m.up ?? upper });
      segs.push({ x0: c - hw / 2, x1: c + hw / 2, kind: st.hood === 'integrated' ? 'ihood' : 'hood' });
      if (c + hw / 2 < m.x1 - 0.01) segs.push({ x0: c + hw / 2, x1: m.x1, kind: m.up ?? upper });
    } else segs.push({ x0: m.x0, x1: m.x1, kind: m.up ?? upper });
  }
  const plain = (k: string) => k !== 'tall' && k !== 'hood' && k !== 'ihood';
  if (r.ue0 > 0 && segs.length && segs[0].kind !== 'tall') segs.unshift({ x0: -r.ue0, x1: segs[0].x0, kind: plain(segs[0].kind) ? segs[0].kind : upper });
  const last = segs[segs.length - 1];
  if (r.ue1 > 0 && last && last.kind !== 'tall') segs.push({ x0: last.x1, x1: r.L + r.ue1, kind: plain(last.kind) ? last.kind : upper });
  const out: USpan[] = [];
  for (const s of segs) {
    const prev = out[out.length - 1];
    if (prev && prev.kind === s.kind && plain(s.kind) && Math.abs(prev.x1 - s.x0) < 1e-6) prev.x1 = s.x1;
    else out.push({ ...s } as USpan);
  }
  return out.filter((s) => (s.kind as string) !== 'tall' && s.x1 - s.x0 > 0.02);
}

/** run-local → item frame (x, z) */
export function toItem(r: Run, x: number, z: number): [number, number] {
  const c = Math.cos(r.th);
  const s = Math.sin(r.th);
  return [r.ox + x * c + z * s, r.oz - x * s + z * c];
}

/* ------------------------------------------------------------------------------------------ */
/* Fixture geometry shared by the planner (anchors), the 3D builder and the plan symbol        */
/* ------------------------------------------------------------------------------------------ */

export interface Bowl {
  cx: number;
  cz: number;
  w: number;
  d: number;
}

/** Bowls of a sink module (run-local), and where the tap stands. */
export function sinkLayout(kind: SinkKind, x0: number, x1: number, cd: number): { bowls: Bowl[]; tapX: number; tapZ: number; farm?: { x0: number; x1: number; z0: number; z1: number } } {
  const W = x1 - x0;
  const cx = (x0 + x1) / 2;
  const bd = Math.min(0.42, cd - 0.2);
  const cz = cd / 2 + 0.01;
  if (kind === 'farm') {
    const fw = Math.min(0.84, W - 0.05);
    const z1 = cd - 0.015;
    const z0 = z1 - 0.5;
    const inner = { cx, cz: (z0 + z1) / 2 + 0.005, w: fw - 0.06, d: z1 - z0 - 0.06 };
    return { bowls: [inner], tapX: cx, tapZ: z0 - 0.05, farm: { x0: cx - fw / 2, x1: cx + fw / 2, z0, z1 } };
  }
  const span = W - 0.14;
  if (kind === 'double' && W >= 0.78) {
    const bw = (span - 0.05) / 2;
    return { bowls: [{ cx: cx - bw / 2 - 0.025, cz, w: bw, d: bd }, { cx: cx + bw / 2 + 0.025, cz, w: bw, d: bd }], tapX: cx, tapZ: cz - bd / 2 - 0.05 };
  }
  if (kind === 'steel15' && W >= 0.75) {
    const small = Math.min(0.2, span * 0.3);
    const main = Math.min(0.5, span - small - 0.05);
    const mx = cx - (small + 0.05) / 2;
    const sx = mx + main / 2 + 0.05 + small / 2;
    return { bowls: [{ cx: mx, cz, w: main, d: bd }, { cx: sx, cz: cz + 0.03, w: small, d: bd - 0.06 }], tapX: mx, tapZ: cz - bd / 2 - 0.05 };
  }
  const bw = Math.min(kind === 'black' ? 0.62 : 0.7, span);
  return { bowls: [{ cx, cz, w: bw, d: bd }], tapX: cx, tapZ: cz - bd / 2 - 0.05 };
}

/** Spout tip of a tap standing at (x, TOP, z), local to the run. */
export function tapSpout(kind: TapKind, x: number, z: number): LocalPoint {
  if (kind === 'pro') return { x, y: TOP + 0.34, z: z + 0.22 };
  if (kind === 'square') return { x, y: TOP + 0.255, z: z + 0.2 };
  return { x, y: TOP + 0.3 - 0.08 - 0.03, z: z + 0.2 };
}

/** hob footprint inside a hob module (run-local): centre and size */
export function hobRect(x0: number, x1: number, cd: number, kind: HobKind): { cx: number; cz: number; w: number; d: number } {
  const W = x1 - x0;
  const w = kind === 'gas5' ? Math.min(0.88, W - 0.02) : W >= 0.88 ? 0.88 : W >= 0.75 ? 0.78 : Math.min(0.58, W - 0.02);
  return { cx: (x0 + x1) / 2, cz: cd / 2 - 0.01, w, d: Math.min(0.52, cd - 0.08) };
}

/* ------------------------------------------------------------------------------------------ */
/* Planner                                                                                     */
/* ------------------------------------------------------------------------------------------ */

const STOOL_OUT = 0.26;

function makeRun(key: Run['key'], L: number, cd: number, th: number, ox: number, oz: number, o: Partial<Run> = {}): Run {
  return { key, L, cd, bo: 0, th, ox, oz, mods: [], spans: [], wall: true, end0: false, end1: false, ue0: 0, ue1: 0, raised: false, waterfall: false, ...o };
}

export function planKitchen(sp: KSpec, size: ItemSize): Plan {
  const { w, d } = size;
  const st = sp.style;
  const pat = st.flex ?? ['drawers', 'doors'];
  const runs: Run[] = [];
  const stools: Stool[] = [];
  let islandHood: Plan['islandHood'];
  const add = (r: Run, slots: Slot[], upper: UpperKind | null) => {
    r.mods = planRun(slots, r.L, pat);
    r.spans = upper ? planSpans(r, st, upper) : [];
    runs.push(r);
    return r;
  };
  // blind corner square + a 5 cm filler strip so fronts and handles clear the inner corner
  const corner: Slot = { k: 'corner', w: CD + 0.05 };
  const fill: Slot = { k: 'filler', w: 0.05 };
  const legUp = st.legUpper ?? st.upper;
  const S = sp.slots;
  switch (sp.layout) {
    case 'straight': {
      const cd = clamp(d - 0.05, 0.56, 0.72);
      add(makeRun('back', w, cd, 0, -w / 2, -d / 2, { end0: true, end1: true }), S.back, st.upper);
      break;
    }
    case 'L': {
      add(makeRun('back', w, CD, 0, -w / 2, -d / 2, { end1: true }), [corner, ...S.back], st.upper);
      add(makeRun('left', d - CD, CD, Math.PI / 2, -w / 2, d / 2, { end0: true, ue1: CD - UD }), [fill, ...(S.left ?? [])].reverse(), legUp);
      break;
    }
    case 'U': {
      add(makeRun('back', w, CD, 0, -w / 2, -d / 2), [corner, ...S.back, corner], st.upper);
      add(makeRun('left', d - CD, CD, Math.PI / 2, -w / 2, d / 2, { end0: true, ue1: CD - UD }), [fill, ...(S.left ?? [])].reverse(), legUp);
      add(makeRun('right', d - CD, CD, -Math.PI / 2, w / 2, -d / 2 + CD, { end1: true, ue0: CD - UD }), [fill, ...(S.right ?? [])], st.rightUpper ?? legUp);
      break;
    }
    case 'galley': {
      add(makeRun('back', w, CD, 0, -w / 2, -d / 2, { end0: true, end1: true }), S.back, st.upper);
      add(makeRun('front', w, CD, Math.PI, w / 2, d / 2, { end0: true, end1: true }), [...(S.front ?? [])].reverse(), legUp);
      break;
    }
    case 'island': {
      const isl = sp.island ?? {};
      add(makeRun('back', w, CD, 0, -w / 2, -d / 2, { end0: true, end1: true }), S.back, st.upper);
      const t = isl.waterfall ? Math.max(0.03, st.topT) : 0;
      const IL = clamp(Math.round(w * (isl.len ?? 0.6) * 20) / 20, 1.2, w - 0.6 - 2 * t);
      const O = isl.seats ? 0.32 : 0.05;
      const out = isl.seats ? STOOL_OUT : 0;
      const zBack = d / 2 - out - O; // island cabinet back (seating side), item frame
      const r = add(makeRun('island', IL, CD, Math.PI, IL / 2, zBack, { wall: false, end0: true, end1: true, bo: O, waterfall: !!isl.waterfall }), [...(S.island ?? [{ k: 'flex' }])].reverse(), null);
      if (isl.seats) {
        const n = Math.max(1, Math.floor((IL - 0.12) / 0.6));
        for (let i = 0; i < n; i++) {
          const x = -IL / 2 + (IL * (i + 0.5)) / n;
          stools.push({ x: r3(x), z: r3(zBack + O + 0.07), facing: Math.PI, seat: 0.66 });
        }
      }
      if (st.hood === 'island') {
        const hob = r.mods.find((m) => m.k === 'hob');
        if (hob) {
          const [hx, hz] = toItem(r, (hob.x0 + hob.x1) / 2, hobRect(hob.x0, hob.x1, r.cd, st.hob).cz);
          islandHood = { x: hx, z: hz, th: r.th, w: Math.min(0.9, Math.max(0.6, hob.x1 - hob.x0)) };
        }
      }
      break;
    }
    case 'peninsula': {
      const raised = !!sp.island?.raised;
      const O = raised ? 0.3 : 0.32;
      const xc = -w / 2 + STOOL_OUT + O + (raised ? 0.02 : 0);
      const pen = add(
        makeRun('pen', d, CD, Math.PI / 2, xc, d / 2, { wall: false, end0: true, bo: O + (raised ? 0.02 : 0), raised }),
        [corner, ...(S.left ?? [])].reverse(),
        null,
      );
      add(makeRun('back', w / 2 - (xc + CD), CD, 0, xc + CD, -d / 2, { end1: true, ue0: CD }), [fill, ...S.back], st.upper);
      const z0 = -d / 2 + CD + 0.25;
      const z1 = d / 2 - 0.05;
      const n = Math.max(1, Math.floor((z1 - z0) / 0.6));
      for (let i = 0; i < n; i++) {
        const z = z1 - ((z1 - z0) * (i + 0.5)) / n;
        stools.push({ x: r3(xc - pen.bo - 0.08), z: r3(z), facing: Math.PI / 2, seat: raised ? 0.76 : 0.66 });
      }
      break;
    }
  }
  return { size, runs, stools, islandHood, anchors: anchorsOf(sp, size, runs, stools) };
}

function anchorsOf(sp: KSpec, size: ItemSize, runs: Run[], stools: Stool[]): ItemAnchors {
  const st = sp.style;
  const actions: ItemAnchors['actions'] = {};
  const boxes: NonNullable<ItemAnchors['boxes']> = [];
  const pt = (r: Run, p: LocalPoint): LocalPoint => {
    const [x, z] = toItem(r, p.x, p.z);
    return { x: r3(x), y: r3(p.y), z: r3(z) };
  };
  for (const r of runs) {
    for (const m of r.mods) {
      if (m.k === 'sink' && !actions.water) {
        const s = sinkLayout(st.sink, m.x0, m.x1, r.cd);
        actions.water = pt(r, tapSpout(st.tap, s.tapX, s.tapZ));
      }
      if (m.k === 'hob' && !actions.cook) {
        const h = hobRect(m.x0, m.x1, r.cd, st.hob);
        actions.cook = pt(r, { x: h.cx, y: TOP + 0.1, z: h.cz });
      }
      if ((m.k === 'fridge' || m.k === 'free') && !actions.snack) actions.snack = pt(r, { x: (m.x0 + m.x1) / 2, y: 1.2, z: r.cd + 0.02 });
    }
    // solid footprint: one box per stretch of counter, one per tall unit
    const box = (x0: number, x1: number, z0: number, z1: number, h: number) => {
      const [ax, az] = toItem(r, x0, z0);
      const [bx, bz] = toItem(r, x1, z1);
      boxes.push({ x: r3((ax + bx) / 2), z: r3((az + bz) / 2), w: r3(Math.abs(bx - ax)), d: r3(Math.abs(bz - az)), h: r3(h) });
    };
    const topH = r.raised ? BAR_Y + 0.04 : TOP;
    const xa = r.waterfall ? -Math.max(0.03, st.topT) : 0;
    const xb = r.waterfall ? r.L + Math.max(0.03, st.topT) : r.L;
    let segStart: number | null = null;
    const flush = (x1: number) => {
      if (segStart !== null && x1 - segStart > 0.01) box(segStart, x1, -r.bo, r.cd, topH);
      segStart = null;
    };
    r.mods.forEach((m, i) => {
      if (isTall(m.k)) {
        flush(m.x0);
        box(m.x0, m.x1, 0, r.cd, size.h);
      } else if (segStart === null) segStart = i === 0 ? xa : m.x0;
    });
    flush(xb);
  }
  const seats: SeatAnchor[] = stools.map((s) => ({ x: s.x, z: s.z, height: s.seat, facing: s.facing, kind: 'sit' }));
  return { actions, boxes, ...(seats.length ? { seats } : {}) };
}

/* ------------------------------------------------------------------------------------------ */
/* Plan symbol                                                                                 */
/* ------------------------------------------------------------------------------------------ */

const planCache = new Map<string, Plan>();

/** Cached plan of a kit at a size (plans are cheap, but draw2d runs every frame in the editor). */
export function planOf(sp: KSpec, size: ItemSize): Plan {
  const key = `${sp.id}|${size.w.toFixed(3)}|${size.d.toFixed(3)}|${size.h.toFixed(3)}`;
  let p = planCache.get(key);
  if (!p) {
    if (planCache.size > 400) planCache.clear();
    p = planKitchen(sp, size);
    planCache.set(key, p);
  }
  return p;
}

export function drawKitchen(ctx: Ctx2D, sp: KSpec, c: Record<string, string>, size: ItemSize): void {
  const P = planOf(sp, size);
  const st = sp.style;
  const topFill = tint(c.top ?? '#e4e1db', 0.35);
  const tallCol = st.tall === 'upper' ? (c.upper ?? c.base) : c.base;
  sym(ctx, () => {
    for (const r of P.runs) {
      ctx.save();
      ctx.translate(r.ox, r.oz);
      ctx.rotate(-r.th);
      const bf = r.cd - 0.02;
      const t = r.waterfall ? Math.max(0.03, st.topT) : 0;
      // counter stretches between tall units
      let s0: number | null = null;
      const counter = (x0: number, x1: number) => {
        D.box(ctx, x0, -r.bo, x1, r.cd, 0.004, topFill, INK, LINE_THIN * 1.5);
        D.line(ctx, x0, bf - 0.012, x1, bf - 0.012, INK_SOFT, LINE_THIN * 0.7);
      };
      r.mods.forEach((m, i) => {
        if (isTall(m.k)) {
          if (s0 !== null) counter(s0, m.x0);
          s0 = null;
        } else if (s0 === null) s0 = i === 0 ? -t : m.x0;
      });
      if (s0 !== null) counter(s0, r.L + t);
      if (r.raised) D.box(ctx, 0, -r.bo, r.L, 0.06, 0, tint(c.top ?? '#e4e1db', 0.2), INK, LINE_THIN);
      for (const m of r.mods) {
        if (isTall(m.k)) {
          D.box(ctx, m.x0, 0, m.x1, bf, 0, tint(tallCol, 0.4), INK, LINE_THIN * 1.5);
          D.line(ctx, m.x0, 0, m.x1, bf, INK_SOFT, LINE_THIN * 0.8);
          if (m.k === 'fridge' || m.k === 'free') {
            D.line(ctx, m.x0, bf - 0.05, m.x1, bf - 0.05, INK_SOFT, LINE_THIN * 0.8);
            D.line(ctx, m.x1, 0, m.x0, bf, INK_SOFT, LINE_THIN * 0.8);
          }
        } else if (m.k === 'sink') {
          const s = sinkLayout(st.sink, m.x0, m.x1, r.cd);
          for (const b of s.bowls) {
            D.rr(ctx, b.cx, b.cz, b.w, b.d, 0.04, '#eef1f3', INK_SOFT, LINE_THIN);
            D.circle(ctx, b.cx, b.cz + b.d * 0.15, 0.022, null, INK_SOFT, LINE_THIN * 0.8);
          }
          D.circle(ctx, s.tapX, s.tapZ, 0.025, '#dfe3e6', INK_SOFT, LINE_THIN * 0.8);
          D.line(ctx, s.tapX, s.tapZ, s.tapX, s.tapZ + 0.16, INK_SOFT, 0.012);
        } else if (m.k === 'hob') {
          const h = hobRect(m.x0, m.x1, r.cd, st.hob);
          const ind = st.hob === 'induction';
          D.rr(ctx, h.cx, h.cz, h.w, h.d, 0.01, ind ? '#45484d' : '#d5d8dc', INK, LINE_THIN);
          for (const [bx, bz, br] of burners(st.hob, h.w, h.d)) {
            D.circle(ctx, h.cx + bx, h.cz + bz, br, ind ? null : '#f3f4f5', ind ? '#b9bcc0' : INK_SOFT, LINE_THIN * 0.8);
            if (!ind) D.circle(ctx, h.cx + bx, h.cz + bz, br * 0.45, '#55585d', null);
          }
        } else if (m.k === 'dw') {
          ctx.setLineDash([0.03, 0.025]);
          D.line(ctx, m.x0 + 0.06, 0.08, m.x1 - 0.06, bf - 0.06, INK_SOFT, LINE_THIN * 0.7);
          D.line(ctx, m.x1 - 0.06, 0.08, m.x0 + 0.06, bf - 0.06, INK_SOFT, LINE_THIN * 0.7);
          ctx.setLineDash([]);
        }
      }
      // wall cabinets / hoods (dashed, above the counter)
      ctx.setLineDash([0.06, 0.045]);
      for (const s of r.spans) {
        if (s.kind === 'none') continue;
        const dd = s.kind === 'shelf' ? 0.26 : s.kind === 'hood' ? 0.5 : UD;
        D.box(ctx, s.x0, 0.012, s.x1, dd, 0, null, INK_SOFT, LINE_THIN);
        if (s.kind === 'hood') {
          D.line(ctx, s.x0, 0.012, s.x1, dd, INK_SOFT, LINE_THIN * 0.8);
          D.line(ctx, s.x1, 0.012, s.x0, dd, INK_SOFT, LINE_THIN * 0.8);
        }
      }
      ctx.setLineDash([]);
      ctx.restore();
    }
    if (P.islandHood) {
      const hd = P.islandHood;
      ctx.setLineDash([0.06, 0.045]);
      D.rr(ctx, hd.x, hd.z, hd.w, 0.5, 0, null, INK_SOFT, LINE_THIN);
      ctx.setLineDash([]);
    }
    for (const s of P.stools) D.circle(ctx, s.x, s.z, 0.17, tint(c.accent ?? c.base, 0.35), INK, LINE_THIN);
  });
}

/** Burner / cooking-zone layout of a hob (relative to the hob centre): [x, z, radius]. */
export function burners(kind: HobKind, w: number, d: number): Array<[number, number, number]> {
  const fx = w / 2 - Math.max(0.12, w * 0.22);
  const fz = d / 2 - 0.13;
  if (kind === 'gas5' || (kind === 'gas' && w > 0.8)) {
    return [
      [-w / 2 + 0.14, -fz, 0.065],
      [-w / 2 + 0.14, fz, 0.05],
      [0, 0, 0.085],
      [w / 2 - 0.14, -fz, 0.05],
      [w / 2 - 0.14, fz, 0.065],
    ];
  }
  if (kind === 'induction' && w > 0.7) {
    return [
      [-fx, -fz + 0.01, 0.1],
      [-fx, fz - 0.01, 0.085],
      [0.02, 0, 0.11],
      [fx + 0.02, -fz + 0.01, 0.08],
      [fx + 0.02, fz - 0.01, 0.095],
    ];
  }
  return [
    [-fx, -fz + 0.005, kind === 'induction' ? 0.1 : 0.075],
    [fx, -fz + 0.005, kind === 'induction' ? 0.085 : 0.06],
    [-fx, fz - 0.005, kind === 'induction' ? 0.085 : 0.06],
    [fx, fz - 0.005, kind === 'induction' ? 0.105 : 0.085],
  ];
}
