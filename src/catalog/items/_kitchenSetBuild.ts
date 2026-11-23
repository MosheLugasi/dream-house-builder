/**
 * Ready-made kitchens, part 2: the 3D builder. Turns a `Plan` (see `_kitchenSetPlan.ts`) into
 * geometry: cabinets with plinth, carcass, real door / drawer splits and handles, worktops with sink
 * cut-outs, sinks and taps, hobs, ovens, hoods, fridges, wall cabinets / glass cabinets / open
 * shelves, backsplash, LED strips, islands, bar stools and a few props.
 *
 * All runs are built in their run-local frame (x along the run, back at z = 0, fronts towards +z)
 * inside a child group rotated / moved into the item frame.
 */
import * as THREE from 'three';
import type { ItemSize } from '../types';
import { Kit, M, blobGeo, darken, lighten, mix, rng, roundedRectPath, roundedRectShape } from '../kit';
import { barHandle, faucet } from './_parts';
import { knobZ } from './_props';
import { luma, quartzMat, stoneMat, tileMat } from './_kitchenSetTex';
import {
  BAR_Y,
  CD,
  FT,
  TOP,
  UB,
  UD,
  burners,
  hobRect,
  isTall,
  planOf,
  sinkLayout,
  tapSpout,
  type Finish,
  type FrontStyle,
  type Handle,
  type KSpec,
  type KStyle,
  type Mod,
  type Plan,
  type PropKind,
  type Run,
  type Stool,
  type TopFinish,
  type USpan,
} from './_kitchenSetPlan';

type Mat = THREE.Material;
type C = Record<string, string>;

/* ------------------------------------------------------------------------------------------ */
/* Colours & materials                                                                         */
/* ------------------------------------------------------------------------------------------ */

interface Pal {
  base: string;
  upper: string;
  top: string;
  metal: string;
  splash: string;
  accent: string;
  shelf: string;
  appl: string;
}

function palette(c: C): Pal {
  const base = c.base ?? '#ece9e2';
  const top = c.top ?? '#e4e1db';
  return {
    base,
    upper: c.upper ?? base,
    top,
    metal: c.metal ?? '#c9ccce',
    splash: c.splash ?? lighten(top, 0.1),
    accent: c.accent ?? base,
    shelf: c.shelf ?? c.accent ?? '#c9a777',
    appl: c.appl ?? '#c9ccce',
  };
}

export function finishMat(f: Finish, color: string): Mat {
  switch (f) {
    case 'matte':
      return M.paint(color, 0.8);
    case 'satin':
      return M.paint(color, 0.45);
    case 'gloss':
      return M.lacquer(color);
    case 'wood':
      return M.wood(color, 0.55);
    case 'concrete':
      return stoneMat(color, 0.85, 0.6);
    case 'steel':
      return M.brushed(color);
  }
}

function topMat(f: TopFinish, color: string): Mat {
  switch (f) {
    case 'quartz':
      return quartzMat(color, 0.32);
    case 'marble':
      return M.marble(color);
    case 'terrazzo':
      return M.terrazzo(color);
    case 'concrete':
      return stoneMat(color, 0.78, 0.5);
    case 'wood':
      return M.wood(color, 0.45);
    case 'steel':
      return M.brushed(color);
    case 'granite':
      return quartzMat(color, 0.2, true);
  }
}

interface Mats {
  base: Mat;
  upper: Mat;
  tall: Mat;
  island: Mat;
  top: Mat;
  splash: Mat;
  metal: Mat;
  gola: Mat;
  plinth: Mat;
  reveal: Mat;
  shelf: Mat;
  appl: Mat;
  applDark: Mat;
  glass: Mat;
  liner: Mat;
  led: Mat;
  sink: Mat;
  canopy: Mat;
}

function mats(st: KStyle, p: Pal): Mats {
  const upperFinish = st.upperFinish ?? st.finish;
  const metal = st.metal === 'polished' ? M.metal(p.metal, 0.14, 1) : st.metal === 'matte' ? M.metal(p.metal, 0.55, 0.6) : M.metal(p.metal, 0.3, 1);
  const top = topMat(st.top, p.top);
  const tiles = st.splash === 'subway' || st.splash === 'square' || st.splash === 'zellige' || st.splash === 'herring' || st.splash === 'vstack' || st.splash === 'brick';
  const splash = st.splash === 'slab' ? top : tiles ? tileMat(st.splash as 'subway', p.splash) : st.splash === 'glass' ? M.lacquer(p.splash) : st.splash === 'steel' ? M.brushed(p.splash) : M.paint(p.splash, 0.85);
  const base = finishMat(st.finish, p.base);
  const upper = finishMat(upperFinish, p.upper);
  return {
    base,
    upper,
    tall: st.tall === 'upper' ? upper : base,
    island: finishMat(st.islandFinish ?? st.finish, p.accent),
    top,
    splash,
    metal,
    gola: metal,
    plinth:
      st.plinth === 'dark'
        ? M.matte('#2a2b2d')
        : st.plinth === 'steel'
          ? M.brushed('#a9acaf')
          : st.plinth === 'legs'
            ? metal
            : finishMat(st.finish === 'gloss' ? 'satin' : st.finish, darken(p.base, 0.12)),
    reveal: M.matte(luma(p.base) > 0.5 ? '#4a4a4a' : '#1d1d1e'),
    shelf: st.shelf === 'steel' ? M.metal(p.shelf, 0.45, 0.8) : st.shelf === 'paint' ? M.paint(p.shelf, 0.6) : M.wood(p.shelf, 0.55),
    appl: M.brushed(p.appl),
    applDark: M.screen('#0f1012'),
    glass: M.glass('#e4f1f3', 0.2),
    liner: M.paint('#f2f3f1', 0.4),
    led: M.glow('#fff1d8', 1.6, '#fffaf2'),
    sink: st.sink === 'black' ? stoneMat('#2c2d2f', 0.55) : st.sink === 'farm' ? M.ceramic('#f6f5f1') : M.brushed('#d0d3d5'),
    canopy: M.paint(p.upper, 0.85),
  };
}

/* ------------------------------------------------------------------------------------------ */
/* Builder context                                                                             */
/* ------------------------------------------------------------------------------------------ */

interface B {
  sp: KSpec;
  st: KStyle;
  p: Pal;
  m: Mats;
  P: Plan;
  h: number;
  /** plinth height */
  PL: number;
  /** worktop thickness */
  t: number;
  /** underside of the worktop */
  yC: number;
  /** base front zone */
  y0: number;
  y1: number;
  gola: boolean;
  /** free counter spots for props: [run, x] */
  spots: Array<{ r: Run; k: Kit; x: number; w: number }>;
  runKits: Map<Run, Kit>;
}

const GOLA_H = 0.034;

/* ------------------------------------------------------------------------------------------ */
/* Fronts                                                                                      */
/* ------------------------------------------------------------------------------------------ */

/** Vertical reeds (convex half-round flutes) facing +z: smooth-shaded strip of quads, no caps. */
function reedGeo(w: number, h: number, depth: number, pitch: number): THREE.BufferGeometry {
  const n = Math.max(2, Math.round(w / pitch));
  const p = w / n;
  const S = 4;
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let v = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= S; j++) {
      const t = j / S;
      const x = -w / 2 + (i + t) * p;
      const z = depth * Math.sin(Math.PI * t);
      const dz = ((depth * Math.PI) / p) * Math.cos(Math.PI * t);
      const len = Math.hypot(dz, 1);
      for (const y of [0, h]) {
        pos.push(x, y, z);
        nor.push(-dz / len, 0, 1 / len);
        uv.push(x, y);
      }
      if (j > 0) {
        const a = v - 2;
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
      v += 2;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** A front panel (door / drawer face): x0..x1, y0..y1, its face at z = zf (facing +z). `back`: face −z. */
function panel(k: Kit, style: FrontStyle, mat: Mat, x0: number, x1: number, y0: number, y1: number, zf: number, back = false): void {
  const w = x1 - x0;
  const h = y1 - y0;
  if (w < 0.004 || h < 0.004) return;
  const cx = (x0 + x1) / 2;
  const s = back ? -1 : 1;
  const zc = zf - (s * FT) / 2;
  if (style === 'slab' || w < 0.12) {
    k.rbox(w, h, FT, 0.0025, mat, cx, y0, zc, 1);
    return;
  }
  if (style === 'shaker' || style === 'slim') {
    const fw = style === 'slim' ? Math.min(0.026, w * 0.12, h * 0.2) : Math.min(0.068, w * 0.16, h * 0.22);
    k.box(fw, h, FT, mat, x0 + fw / 2, y0, zc);
    k.box(fw, h, FT, mat, x1 - fw / 2, y0, zc);
    k.box(w - 2 * fw, fw, FT, mat, cx, y0, zc);
    k.box(w - 2 * fw, fw, FT, mat, cx, y1 - fw, zc);
    // recessed centre panel with a small bevelled lip
    k.box(w - 2 * fw, h - 2 * fw, FT - 0.008, mat, cx, y0 + fw, zc - s * 0.004);
    if (style === 'shaker') {
      const lip = 0.006;
      k.box(w - 2 * fw - 0.002, lip, 0.004, mat, cx, y0 + fw, zf - s * 0.0095);
      k.box(w - 2 * fw - 0.002, lip, 0.004, mat, cx, y1 - fw - lip, zf - s * 0.0095);
    }
    return;
  }
  if (style === 'fluted') {
    k.box(w, h, FT - 0.007, mat, cx, y0, zf - s * (FT + 0.007) / 2);
    const g = reedGeo(w - 0.004, h, 0.006, 0.028);
    if (back) g.rotateY(Math.PI);
    k.geo(g, mat, cx, y0, zf - s * 0.007);
    return;
  }
  // slats: thin backing + vertical wooden slats with dark gaps
  k.box(w, h, 0.008, M.matte('#2a2420'), cx, y0, zf - s * (FT - 0.004));
  const pitch = 0.042;
  const n = Math.max(2, Math.round(w / pitch));
  const sw = w / n - 0.012;
  for (let i = 0; i < n; i++) k.box(sw, h, 0.013, mat, x0 + (w * (i + 0.5)) / n, y0, zf - s * 0.0065);
}

/** Small knob facing +z. */
function knob(k: Kit, mat: Mat, x: number, y: number, zf: number): void {
  const m = k.lathe(
    [
      [0, 0],
      [0.007, 0],
      [0.006, 0.012],
      [0.014, 0.02],
      [0.014, 0.026],
      [0, 0.028],
    ],
    mat,
    0,
    0,
    0,
    10,
  );
  m.geometry.rotateX(Math.PI / 2);
  m.position.set(x, y, zf);
}

type Role = 'door' | 'drawer';
type Level = 'base' | 'upper' | 'tall';

/** Handle of one front. `hinge`: side of the hinges (the handle goes to the other side). */
function handle(k: Kit, b: B, kind: Handle, role: Role, level: Level, x0: number, x1: number, y0: number, y1: number, zf: number, hinge: 'l' | 'r' = 'l', yOff = 0): void {
  const mat = b.m.metal;
  const w = x1 - x0;
  const h = y1 - y0;
  const cx = (x0 + x1) / 2;
  const hz = zf + 0.024;
  const freeX = hinge === 'l' ? x1 - 0.04 : x0 + 0.04;
  if (kind === 'gola' || kind === 'push') return;
  if (kind === 'bar' || kind === 'long') {
    if (role === 'drawer') {
      const L = kind === 'long' ? Math.max(0.12, w - 0.12) : Math.min(Math.max(0.128, w * 0.42), 0.32);
      const hy = h > 0.3 && level === 'base' ? y1 - 0.06 : (y0 + y1) / 2;
      barHandle(k, [cx - L / 2, hy, hz], [cx + L / 2, hy, hz], zf, mat, 0.0055);
    } else {
      const L = level === 'tall' ? (kind === 'long' ? Math.min(0.9, h * 0.6) : Math.min(0.45, h * 0.4)) : kind === 'long' ? Math.min(0.45, h * 0.7) : Math.min(0.2, h * 0.35);
      let hy: number;
      if (level === 'upper') hy = y0 + 0.05 + L / 2;
      else if (level === 'tall') hy = Math.min(Math.max(1.08 - yOff, y0 + L / 2 + 0.06), y1 - L / 2 - 0.06);
      else hy = y1 - 0.05 - L / 2;
      barHandle(k, [freeX, hy - L / 2, hz], [freeX, hy + L / 2, hz], zf, mat, 0.0055);
    }
    return;
  }
  if (kind === 'knob' || (kind === 'cup' && role === 'door')) {
    if (role === 'drawer') {
      if (w > 0.7) {
        knob(k, mat, x0 + w * 0.25, (y0 + y1) / 2, zf);
        knob(k, mat, x1 - w * 0.25, (y0 + y1) / 2, zf);
      } else knob(k, mat, cx, h > 0.3 && level === 'base' ? y1 - 0.07 : (y0 + y1) / 2, zf);
    } else {
      const hy = level === 'upper' ? y0 + 0.07 : level === 'tall' ? Math.min(Math.max(1.05 - yOff, y0 + 0.1), y1 - 0.1) : y1 - 0.07;
      knob(k, mat, hinge === 'l' ? x1 - 0.05 : x0 + 0.05, hy, zf);
    }
    return;
  }
  if (kind === 'cup') {
    // half-round cup pull with a dark hollow
    const hy = h > 0.3 ? y1 - 0.07 : (y0 + y1) / 2 + 0.008;
    const g = new THREE.CylinderGeometry(0.019, 0.019, 0.096, 12, 1, false, Math.PI / 2, Math.PI);
    g.rotateZ(Math.PI / 2);
    k.geo(g, mat, cx, hy, zf + 0.001);
    k.box(0.09, 0.004, 0.012, M.matte('#1b1b1c'), cx, hy - 0.002, zf + 0.007);
    k.box(0.11, 0.024, 0.003, mat, cx, hy - 0.004, zf + 0.0015);
    return;
  }
  if (kind === 'tab') {
    // small metal edge tab: a plate on the top edge with a lip hanging down in front of the face
    // (wall cabinets: on the bottom edge, lip pointing up; tall doors: on the free edge)
    const tw = role === 'drawer' ? 0.06 : 0.045;
    if (level === 'tall') {
      const ex = hinge === 'l' ? x1 : x0;
      const hy = Math.min(Math.max(1.08 - yOff, y0 + 0.1), y1 - 0.1);
      k.box(0.026, tw, 0.003, mat, ex + (hinge === 'l' ? -0.004 : 0.004), hy - tw / 2, zf + 0.006);
      return;
    }
    const tx = role === 'drawer' ? cx : hinge === 'l' ? x1 - 0.05 : x0 + 0.05;
    if (level === 'upper') {
      k.box(tw, 0.003, 0.026, mat, tx, y0, zf + 0.006);
      k.box(tw, 0.018, 0.003, mat, tx, y0, zf + 0.0175);
    } else {
      k.box(tw, 0.003, 0.026, mat, tx, y1 - 0.003, zf + 0.006);
      k.box(tw, 0.018, 0.003, mat, tx, y1 - 0.018, zf + 0.0175);
    }
    return;
  }
  if (kind === 'jpull') {
    // aluminium lip along the whole top edge (bottom edge of wall cabinets)
    const ty = level === 'upper' ? y0 : y1;
    if (level === 'upper') {
      k.box(w - 0.004, 0.004, 0.022, mat, cx, ty, zf + 0.009);
      k.box(w - 0.004, 0.018, 0.003, mat, cx, ty, zf + 0.019);
    } else if (level === 'tall') {
      const ex = hinge === 'l' ? x1 - 0.002 : x0 + 0.002;
      k.box(0.004, h - 0.004, 0.022, mat, ex, y0 + 0.002, zf + 0.009);
      k.box(0.018, h - 0.004, 0.003, mat, ex + (hinge === 'l' ? -0.009 : 0.009), y0 + 0.002, zf + 0.019);
    } else {
      k.box(w - 0.004, 0.004, 0.022, mat, cx, ty - 0.004, zf + 0.009);
      k.box(w - 0.004, 0.018, 0.003, mat, cx, ty - 0.018, zf + 0.019);
    }
  }
}

interface FrontSpec {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  role: Role | 'panel';
  hinge?: 'l' | 'r';
}

function fronts(k: Kit, b: B, level: Level, style: FrontStyle, mat: Mat, hk: Handle, list: FrontSpec[], zf: number): void {
  for (const f of list) {
    panel(k, style, mat, f.x0, f.x1, f.y0, f.y1, zf);
    if (f.role !== 'panel') handle(k, b, hk, f.role, level, f.x0, f.x1, f.y0, f.y1, zf, f.hinge);
  }
}

/** split [y0, y1] by weights (top to bottom) */
function rows(y0: number, y1: number, weights: number[], gap: number): Array<[number, number]> {
  const H = y1 - y0 - gap * (weights.length - 1);
  const sum = weights.reduce((a, b2) => a + b2, 0);
  const out: Array<[number, number]> = [];
  let y = y1;
  for (const wt of weights) {
    const hh = (H * wt) / sum;
    out.push([y - hh, y]);
    y -= hh + gap;
  }
  return out;
}

/** one or two doors side by side in [x0, x1] */
function doorsAcross(x0: number, x1: number, y0: number, y1: number, hingeIfSingle: 'l' | 'r', maxSingle = 0.65): FrontSpec[] {
  if (x1 - x0 <= maxSingle) return [{ x0, x1, y0, y1, role: 'door', hinge: hingeIfSingle }];
  const m = (x0 + x1) / 2;
  return [
    { x0, x1: m - 0.0015, y0, y1, role: 'door', hinge: 'l' },
    { x0: m + 0.0015, x1, y0, y1, role: 'door', hinge: 'r' },
  ];
}

/* ------------------------------------------------------------------------------------------ */
/* Appliances & fixtures                                                                       */
/* ------------------------------------------------------------------------------------------ */

/** Built-in oven: dark glass door, control strip, display, knobs, bar handle. (cx, y) = bottom centre, face at zf. */
function oven(k: Kit, b: B, cx: number, ow: number, y: number, oh: number, zf: number): void {
  const dark = b.m.applDark;
  k.rbox(ow - 0.004, oh - 0.004, 0.022, 0.003, dark, cx, y + 0.002, zf - 0.011, 1);
  const strip = Math.min(0.085, oh * 0.2);
  k.box(ow - 0.008, strip, 0.004, b.m.appl, cx, y + oh - strip - 0.004, zf + 0.0005);
  k.box(Math.min(0.11, ow * 0.18), 0.028, 0.002, M.screen('#060607'), cx, y + oh - strip / 2 - 0.014, zf + 0.0025).castShadow = false;
  k.box(Math.min(0.05, ow * 0.09), 0.01, 0.001, M.glow('#ff9a3c', 0.8, '#1a0d05'), cx, y + oh - strip / 2 - 0.005, zf + 0.0035).castShadow = false;
  for (const s of [-1, 1]) knobZ(k, cx + s * ow * 0.33, y + oh - strip / 2 - 0.004, zf + 0.0025, 0.017, 0.016, b.m.appl, M.matte('#222'), 12);
  // window
  k.rbox(ow - 0.14, (oh - strip) * 0.55, 0.002, 0.01, M.screen('#2a2c31'), cx, y + 0.07, zf + 0.0005, 1);
  barHandle(k, [cx - ow * 0.38, y + oh - strip - 0.04, zf + 0.035], [cx + ow * 0.38, y + oh - strip - 0.04, zf + 0.035], zf, b.m.appl, 0.0075);
}

/** Cooking hob on top of the worktop (run-local). */
function hob(k: Kit, b: B, r: Run, m: Mod): void {
  const st = b.st;
  const H = hobRect(m.x0, m.x1, r.cd, st.hob);
  const down = st.hood === 'downdraft';
  if (st.hob === 'induction') {
    k.rbox(H.w, 0.006, H.d, 0.003, b.m.applDark, H.cx, TOP, H.cz, 1);
    const ringM = M.matte('#7b7e83');
    const zones: Array<[number, number, number]> = down
      ? [
          [-H.w / 2 + 0.14, -H.d / 2 + 0.14, 0.095],
          [-H.w / 2 + 0.14, H.d / 2 - 0.14, 0.085],
          [H.w / 2 - 0.14, -H.d / 2 + 0.14, 0.085],
          [H.w / 2 - 0.14, H.d / 2 - 0.14, 0.095],
        ]
      : burners('induction', H.w, H.d);
    for (const [x, z, rr] of zones) {
      const g = new THREE.RingGeometry(rr - 0.004, rr, 32);
      g.rotateX(-Math.PI / 2);
      k.geo(g, ringM, H.cx + x, TOP + 0.0062, H.cz + z).castShadow = false;
      const g2 = new THREE.RingGeometry(rr * 0.35 - 0.003, rr * 0.35, 16);
      g2.rotateX(-Math.PI / 2);
      k.geo(g2, ringM, H.cx + x, TOP + 0.0062, H.cz + z).castShadow = false;
    }
    // touch slider
    k.box(Math.min(0.24, H.w * 0.4), 0.0008, 0.012, M.matte('#9a9da2'), H.cx, TOP + 0.006, H.cz + H.d / 2 - 0.03).castShadow = false;
    for (let i = 0; i < 4; i++) k.box(0.012, 0.0008, 0.012, M.matte('#9a9da2'), H.cx + H.w / 2 - 0.05 - i * 0.03, TOP + 0.006, H.cz + H.d / 2 - 0.03).castShadow = false;
    if (down) {
      // downdraft vent across the middle
      k.box(0.12, 0.003, H.d - 0.06, M.metal('#3a3b3e', 0.5, 0.8), H.cx, TOP + 0.005, H.cz);
      for (let i = 0; i < 9; i++) k.box(0.1, 0.002, 0.006, M.matte('#111'), H.cx, TOP + 0.0075, H.cz - H.d / 2 + 0.06 + (i * (H.d - 0.12)) / 8).castShadow = false;
    }
    return;
  }
  // gas: plate, burners, cast-iron grates, knobs along the front edge
  const steelTop = st.finish === 'steel' || st.hob === 'gas5';
  k.rbox(H.w, 0.008, H.d, 0.003, steelTop ? M.brushed('#c3c6c9') : b.m.applDark, H.cx, TOP, H.cz, 1);
  const iron = M.metal('#232427', 0.7, 0.4);
  const crown = M.metal('#5a5c60', 0.5, 0.8);
  const y = TOP + 0.008;
  for (const [x, z, rr] of burners(st.hob, H.w, H.d)) {
    const br = rr * 0.55;
    k.cyl(br + 0.01, 0.008, iron, H.cx + x, y, H.cz + z, br + 0.008, 16);
    k.cyl(br * 0.86, 0.008, crown, H.cx + x, y + 0.008, H.cz + z, br * 0.86, 14);
    k.cyl(br * 0.78, 0.005, iron, H.cx + x, y + 0.016, H.cz + z, br * 0.6, 14);
  }
  // grates: one per pair of burners (or one wide over a 5-burner hob)
  const gy = y + 0.001;
  const gh = 0.024;
  const gw = st.hob === 'gas5' || H.w > 0.8 ? [H.w / 3 - 0.01, H.w / 3 - 0.01, H.w / 3 - 0.01] : [H.w / 2 - 0.012, H.w / 2 - 0.012];
  let gx = H.cx - H.w / 2 + 0.006;
  const gd = H.d - 0.07;
  for (const ww of gw) {
    const c = gx + ww / 2;
    const bar = 0.011;
    k.box(ww, gh, bar, iron, c, gy, H.cz - gd / 2 + bar / 2);
    k.box(ww, gh, bar, iron, c, gy, H.cz + gd / 2 - bar / 2);
    k.box(bar, gh, gd, iron, c - ww / 2 + bar / 2, gy, H.cz);
    k.box(bar, gh, gd, iron, c + ww / 2 - bar / 2, gy, H.cz);
    k.box(ww, gh, bar, iron, c, gy, H.cz);
    k.box(bar, gh, gd, iron, c, gy, H.cz);
    gx += ww + 0.006;
  }
  // knobs on the front edge (on the hob plate)
  const nK = st.hob === 'gas5' || H.w > 0.8 ? 5 : 4;
  for (let i = 0; i < nK; i++) {
    const kx = H.cx - H.w / 2 + 0.06 + (i * (H.w - 0.12)) / (nK - 1);
    k.cyl(0.017, 0.022, M.metal('#2c2d30', 0.45, 0.6), kx, TOP + 0.008, H.cz + H.d / 2 - 0.018, 0.016, 12);
  }
}

/** Sink bowls (+ apron sink) and the tap. */
function sink(k: Kit, b: B, r: Run, m: Mod): void {
  const st = b.st;
  const S = sinkLayout(st.sink, m.x0, m.x1, r.cd);
  const mat = b.m.sink;
  const bottomY = TOP - b.t - 0.2;
  if (S.farm) {
    const f = S.farm;
    const fw = f.x1 - f.x0;
    const fd = f.z1 - f.z0;
    const y0 = TOP - 0.25;
    const t = 0.022;
    const cx = (f.x0 + f.x1) / 2;
    const cz = (f.z0 + f.z1) / 2;
    k.rbox(fw, 0.25, t, 0.006, mat, cx, y0, f.z1 - t / 2, 1);
    k.box(fw, 0.25, t, mat, cx, y0, f.z0 + t / 2);
    for (const s of [-1, 1]) k.box(t, 0.25, fd - 2 * t, mat, cx + s * (fw / 2 - t / 2), y0, cz);
    k.box(fw - 2 * t, 0.03, fd - 2 * t, mat, cx, y0, cz);
    k.disc(0.03, 0.003, M.metal('#6f7376', 0.3), cx, y0 + 0.03, cz + 0.05, 14);
  } else {
    for (const bw of S.bowls) {
      const wall = roundedRectShape(bw.w + 0.016, bw.d + 0.016, 0.045, bw.cx, -bw.cz);
      wall.holes.push(roundedRectPath(new THREE.Path(), bw.w - 0.006, bw.d - 0.006, 0.03, bw.cx, -bw.cz));
      // undermount bowls stop under the worktop (its cut edge shows); inset ones reach the top
      k.slab(wall, st.sink === 'black' ? 0.2 + b.t : 0.2, mat, 0, bottomY, 0, 0, 6);
      k.slab(roundedRectShape(bw.w, bw.d, 0.035, bw.cx, -bw.cz), 0.004, mat, 0, bottomY - 0.002, 0, 0, 6);
      k.disc(Math.min(0.035, bw.w * 0.15), 0.003, M.metal('#6f7376', 0.3), bw.cx, bottomY + 0.002, bw.cz + bw.d * 0.15, 14);
      if (st.sink === 'black') {
        // inset composite sink: a rim on top of the worktop
        const rim = roundedRectShape(bw.w + 0.05, bw.d + 0.05, 0.05, bw.cx, -bw.cz);
        rim.holes.push(roundedRectPath(new THREE.Path(), bw.w - 0.004, bw.d - 0.004, 0.034, bw.cx, -bw.cz));
        k.slab(rim, 0.006, mat, 0, TOP, 0, 0, 6);
      }
    }
  }
  tap(k, b, st.tap, S.tapX, S.tapZ);
}

function tap(k: Kit, b: B, kind: 'goose' | 'pro' | 'square', x: number, z: number): void {
  const mat = b.m.metal;
  if (kind === 'goose') {
    faucet(k, x, TOP, z, 0.3, 0.2, mat);
    return;
  }
  const sp = tapSpout(kind, x, z);
  if (kind === 'square') {
    k.rbox(0.05, 0.012, 0.05, 0.004, mat, x, TOP, z, 1);
    k.rbox(0.032, 0.27, 0.032, 0.004, mat, x, TOP + 0.01, z, 1);
    k.rbox(0.03, 0.022, sp.z - z + 0.016, 0.004, mat, x, TOP + 0.26, (z + sp.z) / 2, 1);
    k.box(0.022, 0.004, 0.022, M.matte('#2a2a2a'), x, sp.y - 0.003, sp.z - 0.006);
    k.rbox(0.012, 0.012, 0.06, 0.004, mat, x + 0.026, TOP + 0.21, z + 0.0, 1);
    return;
  }
  // professional pull-down tap with a spring coil
  k.cyl(0.03, 0.02, mat, x, TOP, z, 0.026, 16);
  k.cyl(0.019, 0.16, mat, x, TOP + 0.02, z, 0.019, 12);
  const coil: Array<[number, number, number]> = [];
  const turns = 9;
  for (let i = 0; i <= turns * 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    coil.push([x + Math.cos(a) * 0.024, TOP + 0.17 + (i / (turns * 8)) * 0.2, z + Math.sin(a) * 0.024]);
  }
  k.tube(coil, 0.0032, mat, { seg: turns * 12, radial: 5 });
  k.cyl(0.012, 0.26, mat, x, TOP + 0.16, z, 0.012, 10);
  k.tube(
    [
      [x, TOP + 0.4, z],
      [x, TOP + 0.45, z + 0.04],
      [x, TOP + 0.44, z + 0.13],
      [x, TOP + 0.4, z + 0.2],
      [x, sp.y + 0.03, sp.z],
    ],
    0.011,
    mat,
    { seg: 24, radial: 8 },
  );
  k.cyl(0.017, 0.05, mat, sp.x, sp.y, sp.z, 0.015, 12);
  k.rod([x + 0.022, TOP + 0.1, z], [x + 0.065, TOP + 0.12, z], 0.006, mat);
}

/* ------------------------------------------------------------------------------------------ */
/* Run modules                                                                                 */
/* ------------------------------------------------------------------------------------------ */

function runFront(b: B, r: Run): { mat: Mat; style: FrontStyle } {
  if (r.key === 'island' || r.key === 'pen') return { mat: b.m.island, style: b.st.islandFront ?? b.st.front };
  return { mat: b.m.base, style: b.st.front };
}

function plinthAt(k: Kit, b: B, x0: number, x1: number, bf: number): void {
  if (x1 - x0 < 0.005) return;
  if (b.st.plinth === 'legs') {
    // open toe-kick on slim steel legs, dark underside
    k.box(x1 - x0, 0.004, bf - FT, M.matte('#3a3a3a'), (x0 + x1) / 2, b.PL - 0.004, (bf - FT) / 2);
    for (const x of [x0 + 0.04, x1 - 0.04]) {
      k.cyl(0.013, b.PL - 0.004, b.m.plinth, x, 0, bf - 0.07, 0.011, 8);
      k.cyl(0.013, b.PL - 0.004, b.m.plinth, x, 0, 0.06, 0.011, 8);
    }
    return;
  }
  k.box(x1 - x0, b.PL, bf - 0.06, b.m.plinth, (x0 + x1) / 2, 0, (bf - 0.06) / 2);
}

function baseModule(k: Kit, b: B, r: Run, m: Mod, i: number): void {
  const st = b.st;
  const bf = r.cd - 0.02;
  const first = i === 0;
  const last = i === r.mods.length - 1;
  const ex0 = m.x0 + (first && r.end0 ? 0.02 : 0);
  const ex1 = m.x1 - (last && r.end1 ? 0.02 : 0);
  const { mat, style } = runFront(b, r);
  const fx0 = ex0 + 0.0015;
  const fx1 = ex1 - 0.0015;
  const W = fx1 - fx0;
  const cx = (ex0 + ex1) / 2;
  const y0 = b.y0;
  const y1 = b.y1;
  const hk: Handle = st.handle;
  const hingeSingle: 'l' | 'r' = i % 2 ? 'r' : 'l';
  const gap = b.gola ? 0.03 : 0.004;
  const carTop = m.k === 'sink' ? TOP - 0.255 : b.yC;
  const carD = bf - FT;
  const hollow = m.k === 'open' || m.k === 'wine';
  // plinth + carcass + dark reveal behind the fronts
  if (m.k === 'corner') {
    const vis0 = first ? m.x0 + CD : m.x0;
    const vis1 = first ? m.x1 : m.x1 - CD;
    k.box(m.x1 - m.x0, b.yC - b.PL, carD, mat, (m.x0 + m.x1) / 2, b.PL, carD / 2);
    plinthAt(k, b, vis0, vis1, bf);
    if (vis1 - vis0 > 0.004) {
      panel(k, 'slab', mat, vis0 + 0.0015, vis1 - 0.0015, y0, y1, bf);
      if (b.gola) gola(k, b, vis0, vis1, bf, []);
    }
    return;
  }
  plinthAt(k, b, ex0, ex1, bf);
  if (hollow) {
    const tt = 0.018;
    for (const x of [ex0 + tt / 2, ex1 - tt / 2]) k.box(tt, b.yC - b.PL, carD + FT, mat, x, b.PL, (carD + FT) / 2);
    k.box(ex1 - ex0, tt, carD + FT, mat, cx, b.PL, (carD + FT) / 2);
    k.box(ex1 - ex0, b.yC - b.PL, tt, M.paint(darken(b.p.base, 0.08), 0.6), cx, b.PL, tt / 2);
  } else {
    k.box(ex1 - ex0, carTop - b.PL, carD, mat, cx, b.PL, carD / 2);
    k.box(ex1 - ex0 - 0.004, y1 - y0, 0.003, b.m.reveal, cx, y0, carD + 0.0015);
  }
  const list: FrontSpec[] = [];
  const rowGaps: number[] = [];
  const addRows = (rs: Array<[number, number]>, roles: Array<Role | 'panel'>, split: boolean[]) => {
    rs.forEach(([a, c], j) => {
      if (roles[j] === 'door' && split[j]) list.push(...doorsAcross(fx0, fx1, a, c, hingeSingle));
      else list.push({ x0: fx0, x1: fx1, y0: a, y1: c, role: roles[j], hinge: hingeSingle });
      if (j > 0) rowGaps.push(c);
    });
  };
  switch (m.k) {
    case 'drawers': {
      const wts = st.drawers ?? [1, 1.6, 1.6];
      addRows(rows(y0, y1, wts, gap), wts.map(() => 'drawer'), wts.map(() => false));
      break;
    }
    case 'doors':
    case 'pull': {
      if (m.k === 'doors' && st.doorDrawer) addRows(rows(y0, y1, [1, 3.6], gap), ['drawer', 'door'], [false, true]);
      else if (m.k === 'pull') list.push({ x0: fx0, x1: fx1, y0, y1, role: 'drawer' });
      else list.push(...doorsAcross(fx0, fx1, y0, y1, hingeSingle));
      break;
    }
    case 'sink': {
      if (st.sink === 'farm') {
        const top = TOP - 0.255;
        list.push(...doorsAcross(fx0, fx1, y0, Math.min(y1, top), hingeSingle));
      } else if (b.gola) list.push(...doorsAcross(fx0, fx1, y0, y1, hingeSingle));
      else addRows(rows(y0, y1, [1, 3.6], gap), ['panel', 'door'], [false, true]);
      sink(k, b, r, m);
      break;
    }
    case 'dw': {
      if (st.dwSteel) {
        k.rbox(W, y1 - y0, 0.02, 0.003, b.m.appl, cx, y0, bf - 0.01, 1);
        k.box(0.08, 0.016, 0.002, b.m.applDark, cx + W * 0.28, y1 - 0.045, bf + 0.001);
        barHandle(k, [cx - W * 0.38, y1 - 0.1, bf + 0.03], [cx + W * 0.38, y1 - 0.1, bf + 0.03], bf, b.m.appl, 0.007);
      } else list.push({ x0: fx0, x1: fx1, y0, y1, role: 'drawer' });
      break;
    }
    case 'hob': {
      {
        const ow = W >= 0.86 ? W : Math.min(0.597, W);
        const oh = 0.595;
        const oy = Math.max(y0 + 0.1, y1 - oh);
        oven(k, b, cx, ow, oy, y1 - oy, bf);
        if (oy - y0 > 0.06) list.push({ x0: fx0, x1: fx1, y0, y1: oy - gap, role: 'drawer' });
        if (W - ow > 0.02) {
          list.push({ x0: fx0, x1: cx - ow / 2 - 0.002, y0: oy, y1, role: 'panel' });
          list.push({ x0: cx + ow / 2 + 0.002, x1: fx1, y0: oy, y1, role: 'panel' });
        }
        if (b.gola && oy - y0 > 0.06) rowGaps.push(oy);
      }
      hob(k, b, r, m);
      break;
    }
    case 'wine': {
      // open wine rack: shelves with bottles lying down
      const n = Math.max(2, Math.floor((y1 - y0) / 0.13));
      const bottleM = M.lacquer('#2c3a2a');
      const cap = M.metal('#7a1f2a', 0.4, 0.6);
      for (let j = 1; j < n; j++) {
        const yy = y0 + ((y1 - y0) * j) / n;
        k.box(W - 0.036, 0.012, carD, mat, cx, yy, carD / 2 + 0.01);
      }
      for (let j = 0; j < n; j++) {
        const yy = y0 + ((y1 - y0) * j) / n + 0.012;
        const nb = Math.max(1, Math.floor((W - 0.04) / 0.085));
        for (let q = 0; q < nb; q++) {
          const bx = cx - ((nb - 1) * 0.085) / 2 + q * 0.085;
          k.rod([bx, yy + 0.038, 0.12], [bx, yy + 0.038, bf - 0.08], 0.037, bottleM, 0.037, 10);
          k.rod([bx, yy + 0.038, bf - 0.08], [bx, yy + 0.038, bf - 0.01], 0.014, cap, 0.013, 8);
        }
      }
      break;
    }
    case 'open': {
      const n = 2;
      for (let j = 1; j <= n; j++) {
        const yy = b.PL + ((b.yC - b.PL) * j) / (n + 1);
        k.box(W - 0.036, 0.018, carD + FT - 0.02, mat, cx, yy, (carD + FT) / 2);
        shelfProps(k, b, fx0 + 0.03, fx1 - 0.03, yy + 0.018, 0.04, 0.4, 0.26, i * 7 + j);
      }
      shelfProps(k, b, fx0 + 0.03, fx1 - 0.03, b.PL + 0.018, 0.04, 0.4, 0.22, i * 7 + 5);
      break;
    }
    case 'filler':
      list.push({ x0: fx0, x1: fx1, y0, y1, role: 'panel' });
      break;
  }
  const hkUse: Handle = W < 0.2 && (hk === 'knob' || hk === 'cup') ? 'knob' : hk;
  fronts(k, b, 'base', style, mat, hkUse, list, bf);
  if (b.gola && !hollow) gola(k, b, ex0, ex1, bf, rowGaps);
  // counter spot for props
  if ((m.k === 'drawers' || m.k === 'doors' || m.k === 'dw' || m.k === 'pull' || m.k === 'filler') && r.key !== 'island' && r.key !== 'pen') {
    if (W > 0.25) b.spots.push({ r, k, x: cx, w: W });
  }
}

/** handle-less channel under the worktop (+ C-channels between drawer rows) */
function gola(k: Kit, b: B, x0: number, x1: number, bf: number, gaps: number[]): void {
  const w = x1 - x0;
  const cx = (x0 + x1) / 2;
  const z = bf - FT - 0.008;
  k.box(w, GOLA_H, 0.004, b.m.gola, cx, b.yC - GOLA_H, z);
  k.box(w, 0.004, bf - z - 0.004, b.m.gola, cx, b.yC - GOLA_H, (z + bf - 0.004) / 2);
  for (const g of gaps) k.box(w, 0.03, 0.004, b.m.gola, cx, g, z);
}

/** End panel at a run end: from the floor to the worktop (or to the top for tall units). */
function endPanel(k: Kit, b: B, r: Run, x: number, tallH: number | null): void {
  const bf = r.cd - 0.02;
  const { mat } = runFront(b, r);
  const h = tallH ?? b.yC;
  k.box(0.02, h, bf, tallH ? b.m.tall : mat, x, 0, bf / 2);
}

/* ------------------------------------------------------------------------------------------ */
/* Tall units                                                                                  */
/* ------------------------------------------------------------------------------------------ */

function tallStyle(b: B): FrontStyle {
  return b.st.tall === 'upper' ? (b.st.upperFront ?? b.st.front) : b.st.front;
}
function tallHandle(b: B): Handle {
  return b.st.handle === 'gola' ? 'push' : b.st.handle;
}

function tallModule(k: Kit, b: B, r: Run, m: Mod, i: number): void {
  const h = b.h;
  const bf = r.cd - 0.02;
  const first = i === 0;
  const last = i === r.mods.length - 1;
  const ex0 = m.x0 + (first && r.end0 ? 0.02 : 0);
  const ex1 = m.x1 - (last && r.end1 ? 0.02 : 0);
  if (first && r.end0) endPanel(k, b, r, m.x0 + 0.01, h);
  if (last && r.end1) endPanel(k, b, r, m.x1 - 0.01, h);
  const fx0 = ex0 + 0.0015;
  const fx1 = ex1 - 0.0015;
  const cx = (ex0 + ex1) / 2;
  const W = fx1 - fx0;
  const mat = b.m.tall;
  const style = tallStyle(b);
  const hk = tallHandle(b);
  const carD = bf - FT;
  const top = h - 0.002;
  const y0 = b.PL + 0.002;
  const hinge: 'l' | 'r' = last ? 'r' : 'l';
  if (m.k !== 'free') plinthAt(k, b, ex0, ex1, bf);
  if (m.k === 'free') {
    freeFridge(k, b, r, ex0, ex1, bf, hinge);
    return;
  }
  if (m.k === 'fridge') {
    fridgeColumn(k, b, ex0, ex1, bf, hinge);
    return;
  }
  k.box(ex1 - ex0, h - b.PL, carD, mat, cx, b.PL, carD / 2);
  k.box(ex1 - ex0 - 0.004, h - b.PL - 0.004, 0.003, b.m.reveal, cx, b.PL + 0.002, carD + 0.0015);
  const list: FrontSpec[] = [];
  if (m.k === 'oven') {
    const oy0 = 0.82;
    const ovH = 0.595;
    oven(k, b, cx, Math.min(0.597, W), oy0, ovH, bf);
    let yTop = oy0 + ovH + 0.003;
    if (h - yTop > 0.45 + 0.22) {
      oven(k, b, cx, Math.min(0.597, W), yTop, 0.455, bf);
      yTop += 0.455 + 0.003;
    }
    const rs = rows(y0, oy0 - 0.003, [1, 1], 0.004);
    for (const [a, c] of rs) list.push({ x0: fx0, x1: fx1, y0: a, y1: c, role: 'drawer' });
    if (top - yTop > 0.05) list.push(...doorsAcross(fx0, fx1, yTop, top, hinge, 0.7).map((f) => ({ ...f, role: 'door' as const })));
    fronts(k, b, 'upper', style, mat, hk === 'long' ? 'bar' : hk, list.slice(2), bf);
    fronts(k, b, 'base', style, mat, hk, list.slice(0, 2), bf);
    return;
  }
  // pantry: one tall door (two side by side when wide) + a flap on top when there is room
  const split = h - 2.02 > 0.24 ? 2.02 : top;
  list.push(...doorsAcross(fx0, fx1, y0, split - (split < top ? 0.002 : 0), hinge, 0.7));
  fronts(k, b, 'tall', style, mat, hk, list, bf);
  if (split < top) fronts(k, b, 'upper', style, mat, hk === 'long' ? 'bar' : hk, doorsAcross(fx0, fx1, split + 0.002, top, hinge, 0.7), bf);
}

/** Integrated fridge-freezer in a tall unit: matching fronts, the fridge door opens (part 'door'). */
function fridgeColumn(k: Kit, b: B, ex0: number, ex1: number, bf: number, hinge: 'l' | 'r'): void {
  const h = b.h;
  const mat = b.m.tall;
  const style = tallStyle(b);
  const hk = tallHandle(b);
  const carD = bf - FT;
  const cx = (ex0 + ex1) / 2;
  const W = ex1 - ex0;
  const fx0 = ex0 + 0.0015;
  const fx1 = ex1 - 0.0015;
  const yF0 = 0.84;
  const t = 0.018;
  const flap = h - 2.03 > 0.22;
  const yF1 = flap ? 2.03 : h - t;
  // carcass: solid below / above the fridge compartment, open box around it
  k.box(W, yF0 - b.PL, carD, mat, cx, b.PL, carD / 2);
  k.box(W, h - yF1, carD, mat, cx, yF1, carD / 2);
  for (const s of [-1, 1]) k.box(t, yF1 - yF0, carD, mat, cx + s * (W / 2 - t / 2), yF0, carD / 2);
  k.box(W, yF1 - yF0, t, mat, cx, yF0, t / 2);
  // white liner, shelves, crisper, light, a few things
  const iw = W - 2 * t - 0.01;
  const liner = b.m.liner;
  const zb = t + 0.004;
  const zf = carD - 0.01;
  k.box(iw, yF1 - yF0 - 0.04, 0.006, liner, cx, yF0 + 0.02, zb + 0.003);
  for (const s of [-1, 1]) k.box(0.006, yF1 - yF0 - 0.04, zf - zb, liner, cx + s * (iw / 2 - 0.003), yF0 + 0.02, (zb + zf) / 2);
  k.box(iw, 0.02, zf - zb, liner, cx, yF0, (zb + zf) / 2);
  k.box(iw, 0.02, zf - zb, liner, cx, yF1 - 0.02, (zb + zf) / 2);
  k.box(iw * 0.4, 0.006, 0.02, M.glow('#eef6ff', 1.2), cx, yF1 - 0.027, zb + 0.1).castShadow = false;
  const shelfY = [yF0 + 0.3, yF0 + 0.56, yF0 + 0.82].filter((y) => y < yF1 - 0.15);
  for (const y of shelfY) k.box(iw - 0.01, 0.006, zf - zb - 0.06, M.glass('#dff0f4', 0.35), cx, y, (zb + zf) / 2 - 0.02);
  k.rbox(iw - 0.02, 0.2, zf - zb - 0.08, 0.01, M.glass('#e6f2f4', 0.45), cx, yF0 + 0.024, (zb + zf) / 2 - 0.02, 1);
  k.cyl(0.035, 0.22, M.plastic('#f1f1ec'), cx - iw / 4, shelfY[0] + 0.006, zb + 0.12, 0.035, 10);
  k.rbox(0.16, 0.08, 0.13, 0.01, M.plastic('#e6dccb'), cx + iw / 6, shelfY[0] + 0.006, zb + 0.1, 1);
  if (shelfY[1]) k.cyl(0.07, 0.1, M.ceramic('#e9e4da'), cx, shelfY[1] + 0.006, zb + 0.14, 0.075, 14);
  // freezer door + top flap
  const lo: FrontSpec[] = [{ x0: fx0, x1: fx1, y0: b.PL + 0.002, y1: yF0 - 0.002, role: 'door', hinge }];
  fronts(k, b, 'base', style, mat, hk, lo, bf);
  if (flap) fronts(k, b, 'upper', style, mat, hk === 'long' ? 'bar' : hk, [{ x0: fx0, x1: fx1, y0: yF1 + 0.002, y1: h - 0.002, role: 'door', hinge }], bf);
  // fridge door (part): hinge on the outer edge of the front
  const dW = fx1 - fx0;
  const hx = hinge === 'l' ? fx0 : fx1;
  const sgn = hinge === 'l' ? 1 : -1;
  const door = k.part('door', hx, yF0 + 0.002, bf, { open: -sgn * 1.75 });
  const dh = yF1 - yF0 - 0.004;
  panel(door, style, mat, hinge === 'l' ? 0 : -dW, hinge === 'l' ? dW : 0, 0, dh, 0);
  handle(door, b, hk, 'door', 'tall', hinge === 'l' ? 0 : -dW, hinge === 'l' ? dW : 0, 0, dh, 0, hinge, yF0 + 0.002);
  // inner door liner with bins
  const icx = (sgn * dW) / 2;
  door.box(dW - 0.04, dh - 0.06, 0.02, liner, icx, 0.03, -FT - 0.01);
  for (const y of [0.25, 0.6]) {
    if (y > dh - 0.15) continue;
    door.box(dW - 0.08, 0.07, 0.004, M.glass('#e6f2f4', 0.55), icx, y, -FT - 0.075);
    door.box(dW - 0.08, 0.006, 0.05, liner, icx, y, -FT - 0.05);
  }
  door.cyl(0.03, 0.2, M.glass('#3b6b34', 0.8), icx - 0.1, 0.606, -FT - 0.05, 0.03, 10);
}

/** Freestanding fridge in a housing (side panels + cabinet above). Doors open (part 'door'). */
function freeFridge(k: Kit, b: B, r: Run, ex0: number, ex1: number, bf: number, hinge: 'l' | 'r'): void {
  const h = b.h;
  const mat = b.m.tall;
  const t = 0.02;
  const carD = bf - FT;
  const W = ex1 - ex0;
  const cx = (ex0 + ex1) / 2;
  // housing
  for (const x of [ex0 + t / 2, ex1 - t / 2]) k.box(t, h, bf, mat, x, 0, bf / 2);
  const fh = Math.min(1.86, h - 0.02);
  const fw = W - 2 * t - 0.012;
  const hasTop = h - fh - 0.02 > 0.22;
  if (h - fh > 0.025) {
    k.box(W - 2 * t, h - fh - 0.012, carD, mat, cx, fh + 0.012, carD / 2);
    if (hasTop) fronts(k, b, 'upper', tallStyle(b), mat, tallHandle(b) === 'long' ? 'bar' : tallHandle(b), doorsAcross(cx - (W - 2 * t) / 2 + 0.0015, cx + (W - 2 * t) / 2 - 0.0015, fh + 0.014, h - 0.002, hinge, 0.7), bf);
    else panel(k, 'slab', mat, cx - (W - 2 * t) / 2, cx + (W - 2 * t) / 2, fh + 0.014, h - 0.002, bf);
  }
  // appliance
  const body = b.m.appl;
  const doorT = 0.055;
  const zDoor = bf + 0.012; // door fronts
  const zBody = zDoor - doorT; // carcass front
  const bodyD = zBody - 0.03;
  const bz = 0.03 + bodyD / 2;
  const side = M.paint(darken(b.p.appl, 0.25), 0.45);
  for (const s of [-1, 1]) k.box(0.02, fh - 0.05, bodyD, side, cx + s * (fw / 2 - 0.01), 0.05, bz);
  k.box(fw, 0.03, bodyD, side, cx, fh - 0.03, bz);
  k.box(fw, fh - 0.08, 0.02, side, cx, 0.05, 0.04);
  k.box(fw - 0.01, 0.05, bodyD - 0.08, M.matte('#232426'), cx, 0, bz - 0.04);
  const liner = b.m.liner;
  const french = b.st.fridgeDoors !== 'single';
  const split = 0.66;
  k.box(fw - 0.04, 0.05, bodyD - 0.03, liner, cx, split - 0.03, bz + 0.015);
  k.box(fw - 0.04, 0.03, bodyD - 0.03, liner, cx, 0.06, bz + 0.015);
  k.box(fw - 0.06, fh - split - 0.06, 0.004, liner, cx, split + 0.02, 0.052);
  for (const s of [-1, 1]) k.box(0.004, fh - split - 0.06, bodyD - 0.04, liner, cx + s * (fw / 2 - 0.022), split + 0.02, bz + 0.02);
  k.box(fw - 0.06, 0.004, bodyD - 0.04, liner, cx, fh - 0.035, bz + 0.02);
  k.box(fw * 0.4, 0.006, 0.02, M.glow('#eaf6ff', 1.2), cx, fh - 0.042, bz).castShadow = false;
  for (const y of [split + 0.33, split + 0.62, split + 0.9]) if (y < fh - 0.12) k.box(fw - 0.06, 0.006, bodyD - 0.12, M.glass('#dff0f4', 0.35), cx, y, bz - 0.04);
  k.cyl(0.04, 0.24, M.plastic('#f2f2ee'), cx - fw / 4, split + 0.336, bz + 0.05, 0.04, 10);
  k.rbox(0.18, 0.08, 0.14, 0.01, M.plastic('#e9e2d2'), cx + fw / 5, split + 0.336, bz + 0.02, 1);
  for (let q = 0; q < 3; q++) k.sphere(0.035, M.paint(['#b3242b', '#e8842a', '#9cbb3c'][q], 0.4), cx - 0.12 + q * 0.08, split + 0.665, bz + 0.05, 1, 0.95, 1, 10);
  k.box(fw - 0.05, 0.004, 0.02, M.matte('#2b2b2c'), cx, split - 0.03, zBody - 0.01);
  const dh = fh - split - 0.006;
  const mkDoor = (s: number, dW: number) => {
    // s = -1: hinge on the left edge, door extends to +x; s = 1: hinge on the right edge
    const p = k.part('door', cx + s * (fw / 2), split + 0.003, zBody, { open: s < 0 ? -1.8 : 1.8 });
    const dcx = -s * (dW / 2);
    p.rbox(dW, dh, doorT, 0.01, body, dcx, 0, doorT / 2, 2);
    p.box(dW - 0.04, dh - 0.06, 0.004, liner, dcx, 0.03, -0.002);
    for (const y of [0.2, 0.55, 0.85]) {
      if (y > dh - 0.15) continue;
      p.box(dW - 0.09, 0.07, 0.004, M.glass('#e6f2f4', 0.55), dcx, y, -0.075);
      p.box(dW - 0.09, 0.006, 0.07, M.plastic('#f2f2ee'), dcx, y, -0.04);
    }
    const hx = -s * (dW - 0.045);
    barHandle(p, [hx, 0.12, doorT + 0.026], [hx, Math.min(0.9, dh - 0.15), doorT + 0.026], doorT, b.m.metal, 0.0085);
  };
  if (french) {
    mkDoor(-1, fw / 2 - 0.002);
    mkDoor(1, fw / 2 - 0.002);
  } else mkDoor(hinge === 'l' ? -1 : 1, fw - 0.003);
  // freezer drawer
  k.rbox(fw - 0.004, split - 0.064, doorT, 0.01, body, cx, 0.06, zBody + doorT / 2, 2);
  barHandle(k, [cx - fw * 0.33, split - 0.1, zDoor + 0.024], [cx + fw * 0.33, split - 0.1, zDoor + 0.024], zDoor, b.m.metal, 0.0085);
  void r;
}

/* ------------------------------------------------------------------------------------------ */
/* Worktop & backsplash                                                                        */
/* ------------------------------------------------------------------------------------------ */

function worktop(k: Kit, b: B, r: Run): void {
  const st = b.st;
  const t = b.t;
  const wf = r.waterfall ? t : 0;
  const z0 = r.raised ? 0 : -r.bo;
  const z1 = r.cd;
  // stretches between tall units
  const segs: Array<[number, number]> = [];
  let s0: number | null = null;
  r.mods.forEach((m, i) => {
    if (isTall(m.k)) {
      if (s0 !== null) segs.push([s0, m.x0]);
      s0 = null;
    } else if (s0 === null) s0 = i === 0 ? -wf : m.x0;
  });
  if (s0 !== null) segs.push([s0, r.L + wf]);
  const bev = Math.min(0.002, t / 6);
  const slab = (xa: number, xb: number, za: number, zb: number, holes: Array<{ cx: number; cz: number; w: number; d: number }>) => {
    if (xb - xa < 0.005 || zb - za < 0.005) return;
    const shape = roundedRectShape(xb - xa - 2 * bev, zb - za - 2 * bev, 0.003, (xa + xb) / 2, -(za + zb) / 2);
    for (const h of holes) shape.holes.push(roundedRectPath(new THREE.Path(), h.w, h.d, 0.035, h.cx, -h.cz));
    k.slab(shape, t, b.m.top, 0, TOP - t, 0, bev, 6);
  };
  for (const [xa, xb] of segs) {
    const sinks = r.mods.filter((m) => m.k === 'sink' && m.x0 >= xa - 1e-6 && m.x1 <= xb + 1e-6);
    let cur = xa;
    const holes: Array<{ cx: number; cz: number; w: number; d: number }> = [];
    for (const m of sinks) {
      const S = sinkLayout(st.sink, m.x0, m.x1, r.cd);
      if (S.farm) {
        slab(cur, S.farm.x0, z0, z1, holes.splice(0));
        slab(S.farm.x0, S.farm.x1, z0, S.farm.z0, []);
        cur = S.farm.x1;
      } else holes.push(...S.bowls);
    }
    slab(cur, xb, z0, z1, holes);
  }
  if (r.waterfall) {
    for (const x of [-t / 2, r.L + t / 2]) k.box(t, TOP - t, z1 - z0, b.m.top, x, 0, (z0 + z1) / 2);
  }
  if (r.raised) {
    // raised breakfast bar on the dining side, on an upstand
    k.box(r.L - 0.04, BAR_Y - TOP, 0.04, runFront(b, r).mat, r.L / 2 - 0.0, TOP, 0.03);
    k.rbox(r.L, 0.04, r.bo + 0.08, 0.004, b.m.top, r.L / 2, BAR_Y, (-r.bo + 0.08) / 2, 1);
  }
}

function backsplash(k: Kit, b: B, r: Run): void {
  if (!r.wall) return;
  const T = b.st.splash === 'slab' ? Math.max(0.012, Math.min(0.02, b.t)) : 0.01;
  // one piece per stretch of equal height (no seams between spans)
  let run: { x0: number; x1: number; top: number } | null = null;
  const flush = () => {
    if (run && run.top - TOP > 0.02) k.box(run.x1 - run.x0, run.top - TOP, T, b.m.splash, (run.x0 + run.x1) / 2, TOP, T / 2);
    run = null;
  };
  for (const s of r.spans) {
    let x0 = s.x0;
    let x1 = s.x1;
    if (r.ue0 > 0 && Math.abs(x0 + r.ue0) < 1e-6 && r.ue0 < CD - 0.01) x0 = -(CD - T);
    if (r.ue1 > 0 && Math.abs(x1 - r.L - r.ue1) < 1e-6 && r.ue1 < CD - 0.01) x1 = r.L + CD - T;
    // a U's right leg / a galley's second run without wall cabinets is the window or pass-through
    // side: just a low upstand in the worktop material there
    if (s.kind === 'none' && (r.key === 'right' || r.key === 'front')) {
      flush();
      k.box(x1 - x0, 0.1, Math.max(0.012, Math.min(0.02, b.t)), b.m.top, (x0 + x1) / 2, TOP, 0.008);
      continue;
    }
    const top = s.kind === 'cab' || s.kind === 'glass' || s.kind === 'ihood' || s.kind === 'none' ? UB : b.h;
    if (run && Math.abs(run.top - top) < 1e-6 && Math.abs(run.x1 - x0) < 1e-6) run.x1 = x1;
    else {
      flush();
      run = { x0, x1, top };
    }
  }
  flush();
}

/* ------------------------------------------------------------------------------------------ */
/* Wall cabinets, shelves, hoods                                                               */
/* ------------------------------------------------------------------------------------------ */

function upperHandle(b: B): Handle {
  return b.st.upperHandle ?? (b.st.handle === 'gola' ? 'push' : b.st.handle);
}

function wallCabs(k: Kit, b: B, s: USpan, glass: boolean): void {
  const len = s.x1 - s.x0;
  if (len < 0.2) {
    // too narrow for a door: a filler panel in front of a carcass
    k.box(len, b.h - UB, UD - FT, b.m.upper, (s.x0 + s.x1) / 2, UB, (UD - FT) / 2);
    panel(k, 'slab', b.m.upper, s.x0 + 0.0015, s.x1 - 0.0015, UB + 0.002, b.h - 0.002, UD);
    return;
  }
  const n = Math.max(1, Math.round(len / 0.8));
  const H = b.h - UB;
  const mat = b.m.upper;
  const style = b.st.upperFront ?? b.st.front;
  const hk = upperHandle(b);
  const drop = hk === 'push' ? 0.02 : 0;
  const carD = UD - FT;
  const stacked = H > 1.0;
  const yMain1 = stacked ? UB + Math.min(0.76, H - 0.3) : b.h - 0.002;
  for (let i = 0; i < n; i++) {
    const x0 = s.x0 + (len * i) / n;
    const x1 = s.x0 + (len * (i + 1)) / n;
    const cx = (x0 + x1) / 2;
    const w = x1 - x0;
    const fx0 = x0 + 0.0015;
    const fx1 = x1 - 0.0015;
    if (glass) {
      // hollow carcass with a lit interior
      const t = 0.016;
      const inner = M.paint(mix(b.p.upper, '#ffffff', luma(b.p.upper) > 0.6 ? 0.25 : 0.12), 0.7);
      for (const x of [x0 + t / 2, x1 - t / 2]) k.box(t, H, carD, mat, x, UB, carD / 2);
      k.box(w, t, carD, mat, cx, UB, carD / 2);
      k.box(w, t, carD, mat, cx, b.h - t, carD / 2);
      k.box(w - 2 * t, H - 2 * t, 0.006, inner, cx, UB + t, 0.003);
      const yTopIn = (stacked ? yMain1 : b.h) - t;
      const shelfYs = [UB + t + (yTopIn - UB - t) / 3, UB + t + ((yTopIn - UB - t) * 2) / 3];
      if (stacked) k.box(w - 2 * t, t, carD, mat, cx, yMain1 - t / 2, carD / 2);
      for (const y of shelfYs) k.box(w - 2 * t, 0.008, carD - 0.03, M.glass('#e3f1f3', 0.4), cx, y, carD / 2 - 0.01);
      k.box(w - 2 * t - 0.02, 0.004, 0.012, b.m.led, cx, yTopIn - 0.004, carD - 0.03).castShadow = false;
      glassContents(k, b, x0 + t + 0.02, x1 - t - 0.02, [UB + t, ...shelfYs.map((y) => y + 0.008)], carD, i, (yTopIn - UB - t) / 3 - 0.03);
      // framed glass doors
      const ds = doorsAcross(fx0, fx1, UB + 0.002 - drop, yMain1 - 0.002, i % 2 ? 'r' : 'l', 0.62);
      for (const d of ds) {
        glassDoor(k, b, mat, d.x0, d.x1, d.y0, d.y1, UD);
        handle(k, b, hk, 'door', 'upper', d.x0, d.x1, d.y0, d.y1, UD, d.hinge);
      }
    } else {
      k.box(w, H, carD, mat, cx, UB, carD / 2);
      k.box(w - 0.004, H - 0.004, 0.003, b.m.reveal, cx, UB + 0.002, carD + 0.0015);
      fronts(k, b, 'upper', style, mat, hk, doorsAcross(fx0, fx1, UB + 0.002 - drop, yMain1 - 0.002, i % 2 ? 'r' : 'l', 0.62), UD);
    }
    if (stacked) {
      fronts(k, b, 'upper', style === 'fluted' || style === 'slats' ? 'slab' : style, mat, 'push', [{ x0: fx0, x1: fx1, y0: yMain1 + 0.002, y1: b.h - 0.002, role: 'door' }], UD);
    }
  }
  if (b.st.led) k.box(len - 0.05, 0.005, 0.014, b.m.led, (s.x0 + s.x1) / 2, UB - 0.005, UD - 0.05).castShadow = false;
}

function glassDoor(k: Kit, b: B, frame: Mat, x0: number, x1: number, y0: number, y1: number, zf: number): void {
  const fw = 0.028;
  const w = x1 - x0;
  const h = y1 - y0;
  const cx = (x0 + x1) / 2;
  const z = zf - FT / 2;
  k.box(fw, h, FT, frame, x0 + fw / 2, y0, z);
  k.box(fw, h, FT, frame, x1 - fw / 2, y0, z);
  k.box(w - 2 * fw, fw, FT, frame, cx, y0, z);
  k.box(w - 2 * fw, fw, FT, frame, cx, y1 - fw, z);
  k.box(w - 2 * fw, h - 2 * fw, 0.005, b.m.glass, cx, y0 + fw, z);
}

/** Plates, bowls and glasses on the shelves of a glass cabinet. */
function glassContents(k: Kit, b: B, x0: number, x1: number, ys: number[], depth: number, seed: number, maxH: number): void {
  const r = rng(seed * 31 + 5);
  const cer = M.ceramic('#f3f1ec');
  const gl = M.glass('#eef6f7', 0.35);
  ys.forEach((y, j) => {
    const kind = (j + seed) % 3;
    if (kind === 0) {
      // plates standing on edge
      // plates standing in a rack, leaning back a little
      const rp = Math.min(0.11, (x1 - x0) / 2 - 0.01, maxH / 2);
      if (rp > 0.06) {
        for (let i = 0; i < 5; i++) {
          const g = new THREE.CylinderGeometry(rp, rp, 0.01, 18);
          g.rotateX(Math.PI / 2 - 0.12);
          k.geo(g, cer, (x0 + x1) / 2, y + rp + 0.005, depth * 0.3 + i * 0.03);
        }
      }
    } else if (kind === 1) {
      const n = Math.max(1, Math.floor((x1 - x0) / 0.09));
      for (let i = 0; i < Math.min(n, 5); i++) k.cyl(0.032, Math.min(maxH, 0.11 + r() * 0.04), gl, x0 + 0.05 + i * 0.085, y, depth * 0.5, 0.036, 12);
    } else {
      for (let i = 0; i < 2; i++) {
        const bx = x0 + 0.1 + i * 0.22;
        if (bx > x1 - 0.08) break;
        for (let q = 0; q < 3 && q * 0.03 + 0.035 < maxH; q++) k.cyl(0.07 - q * 0.004, 0.035, cer, bx, y + q * 0.03, depth * 0.5, 0.085 - q * 0.004, 16);
      }
    }
  });
}

function shelves(k: Kit, b: B, s: USpan): void {
  const len = s.x1 - s.x0;
  if (len < 0.3) return;
  const cx = (s.x0 + s.x1) / 2;
  const dep = 0.26;
  const th = 0.036;
  const ys: number[] = [];
  for (let y = UB + 0.06; y + th < b.h - 0.16; y += 0.4) ys.push(y);
  const steel = b.st.shelf === 'steel';
  ys.forEach((y, j) => {
    k.box(len - 0.02, th, dep, b.m.shelf, cx, y, dep / 2 + 0.012);
    if (steel || b.st.handle === 'long') {
      const br = M.metal('#232427', 0.5, 0.7);
      const inset = Math.min(0.12, len * 0.2);
      for (const x of [s.x0 + inset, s.x1 - inset]) {
        k.box(0.008, 0.18, 0.008, br, x, y - 0.18, 0.016);
        k.box(0.008, 0.008, dep - 0.02, br, x, y - 0.008, dep / 2 + 0.012);
      }
    }
    shelfProps(k, b, s.x0 + 0.06, s.x1 - 0.06, y + th, 0.02, dep - 0.02, 0.36, j * 13 + Math.round(s.x0 * 10));
  });
}

/** Things on an open shelf: plates, bowls, jars, a plant, books. */
function shelfProps(k: Kit, b: B, x0: number, x1: number, y: number, z0: number, z1: number, maxH: number, seed: number): void {
  const r = rng(seed * 97 + 13);
  const cer = M.ceramic(['#f3f1ec', '#e8e2d6', '#d9d4ca'][seed % 3]);
  const cz = (z0 + z1) / 2;
  let x = x0 + 0.05 + r() * 0.1;
  let guard = 0;
  let prev = -1;
  let plant = false;
  let jars = false;
  while (x < x1 - 0.1 && guard++ < 6) {
    let kind = Math.floor(r() * 5);
    if (kind === prev || (kind === 2 && plant) || (kind === 1 && jars)) kind = (kind + 1 + Math.floor(r() * 3)) % 5;
    if ((kind === 2 && plant) || (kind === 1 && jars)) kind = 3;
    prev = kind;
    if (kind === 2) plant = true;
    if (kind === 1) jars = true;
    if (kind !== 4 && x > x1 - 0.25) break;
    if (kind === 0) {
      for (let q = 0; q < 4; q++) k.cyl(0.11, 0.012, cer, x + 0.06, y + q * 0.013, cz, 0.12, 16);
      x += 0.3;
    } else if (kind === 1) {
      const gl = M.glass('#f2f6f2', 0.32);
      for (let q = 0; q < 3 && x < x1 - 0.06; q++) {
        const hh = Math.min(maxH - 0.03, 0.14 + r() * 0.08);
        k.cyl(0.042, hh, gl, x, y, cz, 0.042, 12);
        k.cyl(0.038, hh * (0.4 + r() * 0.4), M.matte(['#c9a26b', '#e8d9b0', '#7a4b2a', '#b6452c'][Math.floor(r() * 4)]), x, y + 0.004, cz, 0.038, 10);
        k.cyl(0.045, 0.02, M.wood('#b98d5e', 0.5), x, y + hh, cz, 0.045, 12);
        x += 0.1;
      }
      x += 0.08;
    } else if (kind === 2 && maxH > 0.2) {
      // herbs / trailing plant in a pot
      k.cyl(0.06, 0.1, M.ceramic(['#e9e4da', '#c7775a', '#3d4a3f'][seed % 3]), x + 0.06, y, cz, 0.07, 14);
      const leaf = k.geo(blobGeo(0.09, 1, seed, 0.25), M.foliage('#5f8a46'), x + 0.06, y + 0.15, cz);
      leaf.scale.set(1.1, 0.8, 0.9);
      x += 0.22;
    } else if (kind === 3) {
      for (let q = 0; q < 3; q++) k.cyl(0.075 - q * 0.012, 0.045, cer, x + 0.08, y + q * 0.04, cz, 0.09 - q * 0.012, 16);
      x += 0.24;
    } else {
      const cols = ['#7a8fa3', '#c7775a', '#e6dfd0', '#52606d', '#d6a544', '#9bae8a'];
      let bx = x;
      for (let q = 0; q < 5; q++) {
        const bt = 0.025 + r() * 0.02;
        const bh = Math.min(maxH - 0.02, 0.2 + r() * 0.06);
        k.box(bt, bh, 0.16, M.matte(cols[Math.floor(r() * cols.length)]), bx + bt / 2, y, cz);
        bx += bt + 0.002;
      }
      x = bx + 0.12;
    }
  }
}

/** Hood above a wall hob. */
function hood(k: Kit, b: B, s: USpan): void {
  const kind = b.st.hood;
  const w = s.x1 - s.x0;
  const cx = (s.x0 + s.x1) / 2;
  const steel = b.m.appl;
  const y0 = Math.min(TOP + 0.68, b.h - 0.5);
  const light = (yy: number, zz: number) => k.box(Math.min(0.3, w * 0.4), 0.003, 0.03, M.glow('#fff3da', 1.2), cx, yy - 0.003, zz).castShadow = false;
  if (kind === 'chimney' || kind === 'box') {
    const d = 0.5;
    if (kind === 'chimney') {
      k.rbox(w - 0.02, 0.05, d, 0.004, steel, cx, y0, d / 2, 1);
      const fr = new THREE.CylinderGeometry(0.5, 1, 1, 4, 1);
      fr.rotateY(Math.PI / 4);
      const m = k.geo(fr, steel, cx, 0, 0);
      m.scale.set((w - 0.02) / Math.SQRT2, 0.14, d / Math.SQRT2);
      m.position.set(cx, y0 + 0.05 + 0.07, d / 2);
    } else {
      k.rbox(w - 0.02, 0.07, d, 0.006, steel, cx, y0, d / 2, 1);
    }
    k.box(w - 0.08, 0.003, d - 0.08, M.metal('#6d7073', 0.6, 0.6), cx, y0 - 0.0005, d / 2);
    const cw = kind === 'box' ? 0.3 : 0.28;
    const cdp = 0.24;
    const yc = y0 + (kind === 'chimney' ? 0.19 : 0.07);
    if (b.h - yc > 0.02) k.box(cw, b.h - yc, cdp, steel, cx, yc, cdp / 2 + 0.012);
    light(y0, d - 0.12);
    return;
  }
  if (kind === 'glass') {
    // inclined black-glass hood on a slim body
    const body = 0.28;
    k.box(w - 0.02, 0.42, body, steel, cx, y0 + 0.05, body / 2 + 0.012);
    const g = new THREE.BoxGeometry(w - 0.02, 0.012, 0.44);
    const m = k.geo(g, b.m.applDark, cx, 0, 0);
    m.rotation.x = 0.85;
    m.position.set(cx, y0 + 0.24, 0.32);
    k.box(w - 0.02, 0.02, 0.2, steel, cx, y0, 0.42);
    if (b.h - (y0 + 0.47) > 0.02) k.box(0.28, b.h - (y0 + 0.47), 0.22, steel, cx, y0 + 0.47, 0.122);
    light(y0, 0.45);
    return;
  }
  if (kind === 'canopy') {
    // plastered mantle hood with a small ledge and a chimney breast to the top
    const yb = y0 - 0.05;
    const yt = Math.min(b.h - 0.02, yb + 0.55);
    const prof = new THREE.Shape();
    prof.moveTo(0.012, yb);
    prof.lineTo(0.56, yb);
    prof.lineTo(0.56, yb + 0.09);
    prof.lineTo(0.53, yb + 0.09);
    prof.lineTo(0.3, yt);
    prof.lineTo(0.012, yt);
    prof.closePath();
    const g = new THREE.ExtrudeGeometry(prof, { depth: w, bevelEnabled: false });
    g.rotateY(-Math.PI / 2);
    g.translate(w / 2, 0, 0);
    k.geo(g, b.m.canopy, cx, 0, 0);
    if (b.h - yt > 0.01) k.box(w - 0.12, b.h - yt, 0.3, b.m.canopy, cx, yt, 0.162);
    k.box(w - 0.04, 0.02, 0.5, b.m.shelf, cx, yb + 0.09, 0.28);
    k.box(w - 0.08, 0.003, 0.48, M.metal('#5d6063', 0.5, 0.8), cx, yb - 0.003, 0.29);
    light(yb, 0.4);
    return;
  }
  void cx;
}

/** Wall cabinet with a slide-out hood visor underneath (integrated hood). */
function integratedHood(k: Kit, b: B, s: USpan): void {
  wallCabs(k, b, s, false);
  const w = s.x1 - s.x0;
  const cx = (s.x0 + s.x1) / 2;
  k.box(w - 0.02, 0.032, 0.3, b.m.appl, cx, UB - 0.032 - (upperHandle(b) === 'push' ? 0.02 : 0), UD - 0.15);
  k.box(w * 0.5, 0.003, 0.03, M.glow('#fff3da', 1.2), cx, UB - 0.035 - (upperHandle(b) === 'push' ? 0.02 : 0), UD - 0.08).castShadow = false;
}

/* ------------------------------------------------------------------------------------------ */
/* Stools & props                                                                              */
/* ------------------------------------------------------------------------------------------ */

function stool(root: Kit, b: B, s: Stool): void {
  const k = new Kit();
  const seatM = b.st.stool === 'wood' ? M.wood(b.p.shelf, 0.5) : M.leather(b.p.accent === b.p.base ? '#6b4a35' : darken(b.p.accent, 0.05));
  const frame = b.st.stool === 'wood' ? M.wood(b.p.shelf, 0.5) : M.metal(b.p.metal, 0.4, 0.9);
  const sy = s.seat;
  const kind = b.st.stool ?? 'metal';
  if (kind === 'wood') {
    k.rbox(0.4, 0.035, 0.36, 0.012, seatM, 0, sy - 0.035, 0, 1);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) k.beam([sx * 0.17, 0, sz * 0.15], [sx * 0.15, sy - 0.035, sz * 0.13], 0.032, 0.032, frame, 0.004);
      k.beam([sx * 0.16, sy * 0.38, -0.14], [sx * 0.16, sy * 0.38, 0.14], 0.022, 0.022, frame);
    }
    k.beam([-0.16, sy * 0.38, 0.14], [0.16, sy * 0.38, 0.14], 0.022, 0.022, frame);
    // low back
    for (const sx of [-1, 1]) k.beam([sx * 0.15, sy - 0.02, -0.15], [sx * 0.16, sy + 0.2, -0.17], 0.024, 0.024, frame);
    k.rbox(0.36, 0.07, 0.02, 0.008, frame, 0, sy + 0.14, -0.168, 1);
  } else if (kind === 'pedestal') {
    k.cyl(0.17, 0.014, frame, 0, 0, 0, 0.16, 20);
    k.cyl(0.024, sy - 0.08, frame, 0, 0.014, 0, 0.024, 10);
    k.ring(0.15, 0.008, frame, 0, sy * 0.42, 0, 18);
    for (let q = 0; q < 3; q++) {
      const a = (q / 3) * Math.PI * 2;
      k.rod([0, sy * 0.42, 0], [Math.cos(a) * 0.15, sy * 0.42, Math.sin(a) * 0.15], 0.005, frame);
    }
    k.lathe(
      [
        [0, 0],
        [0.16, 0],
        [0.175, 0.02],
        [0.178, 0.045],
        [0.165, 0.07],
        [0, 0.07],
      ],
      seatM,
      0,
      sy - 0.07,
      0,
      20,
    );
    k.rbox(0.3, 0.14, 0.04, 0.02, seatM, 0, sy + 0.03, -0.14, 1).rotation.x = -0.18;
  } else {
    k.lathe(
      [
        [0, 0],
        [0.16, 0],
        [0.178, 0.015],
        [0.178, 0.04],
        [0.16, 0.055],
        [0, 0.055],
      ],
      seatM,
      0,
      sy - 0.055,
      0,
      20,
    );
    for (let q = 0; q < 4; q++) {
      const a = Math.PI / 4 + (q / 4) * Math.PI * 2;
      k.rod([Math.cos(a) * 0.18, 0.006, Math.sin(a) * 0.18], [Math.cos(a) * 0.11, sy - 0.055, Math.sin(a) * 0.11], 0.011, frame, 0.011, 8);
    }
    k.ring(0.152, 0.007, frame, 0, sy * 0.4, 0, 20);
  }
  const g = root.sub(k, s.x, 0, s.z);
  g.rotation.y = s.facing;
}

function props(b: B): void {
  const list = b.st.props ?? [];
  const spots = b.spots.slice();
  // spread: alternate from the two ends of the free-spot list
  const order: typeof spots = [];
  while (spots.length) {
    order.push(spots.shift()!);
    if (spots.length) order.push(spots.pop()!);
  }
  const used = new Set<number>();
  for (const kind of list) {
    if (kind === 'pot') {
      potOnHob(b);
      continue;
    }
    const i = order.findIndex((s, j) => !used.has(j) && s.w / 2 >= PROP_HALF[kind]);
    if (i < 0) continue;
    used.add(i);
    const s = order[i];
    prop(s.k, b, kind, s.x, s.r.cd, s.w);
  }
}

/** half-width each prop needs on the counter */
const PROP_HALF: Record<PropKind, number> = { board: 0.2, fruit: 0.15, jars: 0.16, herbs: 0.15, vase: 0.1, pot: 0, oil: 0.1, crock: 0.08, kettle: 0.12 };

function prop(k: Kit, b: B, kind: PropKind, xc: number, cd: number, w: number): void {
  const y = TOP;
  const half = PROP_HALF[kind];
  if (w / 2 < half) return;
  const x = xc;
  if (kind === 'board') {
    const m = k.rbox(0.3, 0.42, 0.018, 0.012, M.wood('#b98a5a', 0.5), x - 0.04, y, 0.05, 1);
    m.rotation.x = -0.12;
    m.position.z = 0.05;
    k.rbox(0.24, 0.016, 0.34, 0.01, M.wood('#d9b98a', 0.5), x + 0.07, y, 0.3, 1);
  } else if (kind === 'fruit') {
    const bx = x;
    const bz = cd * 0.42;
    k.lathe(
      [
        [0, 0],
        [0.07, 0],
        [0.13, 0.05],
        [0.135, 0.07],
        [0.125, 0.07],
        [0.064, 0.012],
        [0, 0.012],
      ],
      M.ceramic('#efebe3'),
      bx,
      y,
      bz,
      20,
    );
    const cols = ['#b3242b', '#e8842a', '#9cbb3c', '#e8842a'];
    const pos: Array<[number, number]> = [
      [-0.045, -0.02],
      [0.045, -0.025],
      [0, 0.045],
      [0.005, -0.005],
    ];
    pos.forEach(([dx, dz], q) => k.sphere(0.036, M.paint(cols[q], 0.4), bx + dx, y + 0.05 + (q === 3 ? 0.045 : 0), bz + dz, 1, 0.92, 1, 10));
  } else if (kind === 'jars') {
    const gl = M.glass('#f2f6f2', 0.3);
    const fill = ['#e8d9b0', '#7a4b2a', '#c9a26b'];
    for (let q = 0; q < 3; q++) {
      const hh = 0.24 - q * 0.05;
      const jx = x - 0.1 + q * 0.1;
      k.cyl(0.045, hh, gl, jx, y, 0.1, 0.045, 14);
      k.cyl(0.041, hh * 0.6, M.matte(fill[q]), jx, y + 0.004, 0.1, 0.041, 12);
      k.cyl(0.047, 0.025, M.wood('#b98d5e', 0.5), jx, y + hh, 0.1, 0.047, 14);
    }
  } else if (kind === 'herbs') {
    for (let q = 0; q < 2; q++) {
      const px = x - 0.08 + q * 0.16;
      k.cyl(0.055, 0.11, M.ceramic(q ? '#c7775a' : '#e9e4da'), px, y, 0.12, 0.065, 14);
      const g = k.geo(blobGeo(0.085, 1, q + 3, 0.28), M.foliage(q ? '#4f7d3c' : '#6f9a4a'), px, y + 0.17, 0.12);
      g.scale.set(1, 0.85, 1);
    }
  } else if (kind === 'vase') {
    k.lathe(
      [
        [0, 0],
        [0.06, 0],
        [0.08, 0.08],
        [0.07, 0.18],
        [0.035, 0.26],
        [0.04, 0.28],
        [0.03, 0.28],
        [0, 0.2],
      ],
      M.ceramic('#d8cfc2'),
      x,
      y,
      0.14,
      18,
    );
    const stemM = M.matte('#5a4636');
    const tips: Array<[number, number, number]> = [
      [-0.14, 0.46, 0.02],
      [0.11, 0.42, -0.03],
      [0.02, 0.5, 0.05],
    ];
    const leafM = M.foliage('#7f9a7a');
    for (const [dx, hh, dz] of tips) {
      k.rod([x, y + 0.22, 0.14], [x + dx, y + hh, 0.14 + dz], 0.003, stemM, 0.0015, 5);
      // small eucalyptus leaves along the twig
      for (const t of [0.45, 0.62, 0.78, 0.93]) {
        const lx = x + dx * t;
        const ly = y + 0.22 + (hh - 0.22) * t;
        const lz = 0.14 + dz * t;
        const s = t > 0.9 ? 0.012 : 0.016;
        k.sphere(s, leafM, lx + (t * 10 % 2 > 1 ? 0.012 : -0.012), ly, lz, 1.3, 0.35, 1, 6);
      }
    }
  } else if (kind === 'oil') {
    for (let q = 0; q < 2; q++) {
      const bx = x - 0.05 + q * 0.08;
      const hh = 0.26 - q * 0.05;
      k.lathe(
        [
          [0, 0],
          [0.032, 0],
          [0.032, hh * 0.65],
          [0.012, hh * 0.85],
          [0.012, hh],
          [0, hh],
        ],
        M.glass(q ? '#c9b24a' : '#6b7d2a', 0.7),
        bx,
        y,
        0.08,
        12,
      );
      k.cyl(0.013, 0.02, M.matte('#2a2a2a'), bx, y + hh, 0.08, 0.013, 8);
    }
  } else if (kind === 'crock') {
    k.cyl(0.06, 0.15, M.ceramic('#ece6da'), x, y, 0.1, 0.065, 16);
    const wd = M.wood('#9c7148', 0.5);
    for (const [dx, dz, hh] of [
      [-0.02, 0.0, 0.33],
      [0.02, 0.01, 0.3],
      [0.0, -0.02, 0.36],
    ] as Array<[number, number, number]>) {
      k.rod([x + dx * 0.5, y + 0.02, 0.1 + dz * 0.5], [x + dx * 2.5, y + hh, 0.1 + dz * 2.5], 0.007, wd, 0.006, 6);
      k.sphere(0.022, wd, x + dx * 2.6, y + hh + 0.02, 0.1 + dz * 2.6, 0.7, 1.2, 0.35, 8);
    }
  } else if (kind === 'kettle') {
    const kx = x;
    const kz = 0.18;
    k.lathe(
      [
        [0, 0],
        [0.075, 0],
        [0.085, 0.04],
        [0.08, 0.14],
        [0.055, 0.185],
        [0.02, 0.2],
        [0, 0.2],
      ],
      b.m.appl,
      kx,
      y,
      kz,
      18,
    );
    k.tube(
      [
        [kx - 0.05, y + 0.17, kz],
        [kx - 0.06, y + 0.24, kz],
        [kx + 0.06, y + 0.24, kz],
        [kx + 0.05, y + 0.17, kz],
      ],
      0.009,
      M.matte('#2a2a2a'),
      { seg: 14, radial: 6 },
    );
    k.rod([kx + 0.06, y + 0.06, kz], [kx + 0.13, y + 0.15, kz], 0.012, b.m.appl, 0.007, 8);
  }
}

function potOnHob(b: B): void {
  for (const r of b.P.runs) {
    const m = r.mods.find((q) => q.k === 'hob');
    if (!m) continue;
    const k = b.runKits.get(r);
    if (!k) return;
    const H = hobRect(m.x0, m.x1, r.cd, b.st.hob);
    const [bx, bz] = burners(b.st.hob, H.w, H.d)[0];
    const px = H.cx + bx;
    const pz = H.cz + bz + 0.02;
    const py = TOP + (b.st.hob === 'induction' ? 0.006 : 0.034);
    const steel = M.brushed('#c9ccce');
    k.lathe(
      [
        [0, 0],
        [0.1, 0],
        [0.105, 0.008],
        [0.105, 0.12],
        [0.109, 0.125],
        [0.1, 0.125],
        [0.1, 0.01],
        [0, 0.01],
      ],
      steel,
      px,
      py,
      pz,
      20,
    );
    k.lathe(
      [
        [0, 0],
        [0.107, 0],
        [0.095, 0.012],
        [0.04, 0.024],
        [0, 0.026],
      ],
      M.glass('#e8f2f4', 0.45),
      px,
      py + 0.122,
      pz,
      18,
    );
    k.sphere(0.013, M.matte('#232323'), px, py + 0.152, pz, 1, 0.6, 1, 8);
    for (const s of [-1, 1]) k.rbox(0.04, 0.012, 0.02, 0.005, M.matte('#232323'), px + s * 0.12, py + 0.1, pz, 1);
    return;
  }
}

/* ------------------------------------------------------------------------------------------ */
/* Entry point                                                                                 */
/* ------------------------------------------------------------------------------------------ */

export function buildKitchen(sp: KSpec, c: C, size: ItemSize): THREE.Object3D {
  const P = planOf(sp, size);
  const st = sp.style;
  const p = palette(c);
  const m = mats(st, p);
  const t = st.topT;
  const PL = st.plinth === 'legs' ? 0.14 : 0.1;
  const gola = st.handle === 'gola';
  const yC = TOP - t;
  const b: B = {
    sp,
    st,
    p,
    m,
    P,
    h: size.h,
    PL,
    t,
    yC,
    y0: PL + 0.002,
    y1: yC - (gola ? GOLA_H : 0.003),
    gola,
    spots: [],
    runKits: new Map(),
  };
  const root = new Kit();
  for (const r of P.runs) {
    const k = new Kit();
    const g = root.add(k.g, r.ox, 0, r.oz);
    g.rotation.y = r.th;
    b.runKits.set(r, k);
    r.mods.forEach((mod, i) => (isTall(mod.k) ? tallModule(k, b, r, mod, i) : baseModule(k, b, r, mod, i)));
    // end panels of base stretches
    const m0 = r.mods[0];
    const m1 = r.mods[r.mods.length - 1];
    if (r.end0 && m0 && !isTall(m0.k) && !r.waterfall) endPanel(k, b, r, m0.x0 + 0.01, null);
    if (r.end1 && m1 && !isTall(m1.k) && !r.waterfall) endPanel(k, b, r, m1.x1 - 0.01, null);
    if (r.key === 'island' || r.key === 'pen') {
      // finished back on the seating side
      const { mat, style } = runFront(b, r);
      panel(k, style === 'slats' || style === 'fluted' ? style : 'slab', mat, 0, r.L, 0, b.yC, -FT, true);
    }
    worktop(k, b, r);
    backsplash(k, b, r);
    for (const s of r.spans) {
      if (s.kind === 'cab') wallCabs(k, b, s, false);
      else if (s.kind === 'glass') wallCabs(k, b, s, true);
      else if (s.kind === 'shelf') shelves(k, b, s);
      else if (s.kind === 'hood') hood(k, b, s);
      else if (s.kind === 'ihood') integratedHood(k, b, s);
    }
  }
  if (P.islandHood) islandHood(root, b, P.islandHood);
  for (const s of P.stools) stool(root, b, s);
  props(b);
  root.g.userData.anchors = P.anchors;
  return root.g;
}

function islandHood(root: Kit, b: B, hd: NonNullable<Plan['islandHood']>): void {
  const k = new Kit();
  const w = hd.w;
  const y0 = Math.min(TOP + 0.72, b.h - 0.3);
  k.rbox(w, 0.1, 0.5, 0.008, b.m.appl, 0, y0, 0, 1);
  k.box(w - 0.06, 0.003, 0.44, M.metal('#5d6063', 0.5, 0.8), 0, y0 - 0.002, 0);
  for (const s of [-1, 1]) k.box(0.12, 0.003, 0.02, M.glow('#fff3da', 1.3), s * w * 0.28, y0 - 0.003, 0.15).castShadow = false;
  // suspension cables to the ceiling
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.rod([sx * (w / 2 - 0.05), y0 + 0.1, sz * 0.2], [sx * (w / 2 - 0.05), b.h - 0.006, sz * 0.2], 0.0015, M.metal('#9a9da0', 0.3), 0.0015, 4);
  k.box(w * 0.6, 0.006, 0.12, b.m.appl, 0, b.h - 0.006, 0);
  const g = root.sub(k, hd.x, 0, hd.z);
  g.rotation.y = hd.th;
}
