/**
 * Seating: sofas & sectionals, armchairs & lounge chairs, ottomans / poufs / benches.
 * Sofas come from ONE parametric builder (runs of seat columns with arm / back / seat / base
 * options); special shapes (curved, futon, chairs...) have their own builders below.
 */
import * as THREE from 'three';
import type { FurnitureDef, SeatAnchor } from '../types';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { D, INK_SOFT, Kit, LINE_THIN, M, PAL, arcPanelGeo, darken, extrudeZ, latheGeo, noise3, smoothProfile, sym, tint, type Ctx2D, type V3 } from '../kit';
import { slot } from './_parts';
import {
  type ArmKind,
  type BaseKind,
  addPad,
  backPad,
  bendGroup,
  padGeo,
  roundCushionProfile,
  shellGeos,
  taperLeg,
  turnedLeg,
  rrLoop,
  bolster,
  diamondTufts,
  seatPad,
  sofaBase,
  throwPillow,
  upholsteredArm,
} from './seating-parts';

type Colors = Record<string, string>;
export type UpKind = 'fabric' | 'velvet' | 'boucle' | 'linen' | 'leather';

export function upMat(kind: UpKind, c: string): THREE.Material {
  switch (kind) {
    case 'velvet':
      return M.velvet(c);
    case 'boucle':
      return M.boucle(c);
    case 'linen':
      return M.linen(c);
    case 'leather':
      return M.leather(c);
    default:
      return M.fabric(c, 16);
  }
}

const UP_LABEL: Record<UpKind, string> = { fabric: 'ריפוד', velvet: 'קטיפה', boucle: 'בוקלה', linen: 'פשתן', leather: 'עור' };

/* ================================================================== sofa system */

type BackKind = 'loose' | 'pillow' | 'tight' | 'tufted' | 'channel' | 'rows' | 'camel' | 'none';
type Side = 'arm' | 'none' | 'corner';
type Layout = 'straight' | 'chaiseR' | 'chaiseL' | 'lR' | 'lL' | 'u' | 'corner';
type LegMat = 'wood' | 'metal' | 'gold' | 'black';

export interface SofaSpec {
  w: number;
  /** depth of a run */
  d: number;
  /** total depth for chaise / L / U layouts */
  D?: number;
  backH: number;
  seatH: number;
  /** seat columns in the main run (corner columns excluded) */
  n: number;
  /** seat columns in each side run (L / U) */
  sideN?: number;
  layout?: Layout;
  arm: ArmKind;
  armW: number;
  armH: number;
  back: BackKind;
  backT: number;
  /** loose back cushion thickness / lean */
  backCushT?: number;
  lean?: number;
  seat: 'bench' | 'split';
  cushT: number;
  base: BaseKind;
  legH: number;
  legMat?: LegMat;
  mat: UpKind;
  pillows?: number;
  /** 0..1 extra softness: bigger round-overs and crowning */
  plump?: number;
  /** buttons per loose back cushion */
  buttons?: number;
  /** tufting columns / rows for tufted backs */
  tuftCols?: number;
  tuftRows?: number;
  bolsters?: boolean;
  /** frame material for 'wood' arms / base */
  seed?: number;
  /** lower tessellation for big sectionals */
  lod?: boolean;
  /** wingback wings above the arms */
  wings?: boolean;
}

interface Run {
  len: number;
  armL: Side;
  armR: Side;
  n: number;
  extL?: number;
  extR?: number;
}

interface Placed {
  run: Run;
  x: number;
  z: number;
  ry: number;
  main: boolean;
}

interface Mats {
  up: THREE.Material;
  btn: THREE.Material;
  leg: THREE.Material;
  wood: THREE.Material;
  accent: THREE.Material;
}

function sofaH(s: SofaSpec): number {
  return Math.max(s.backH, s.armH);
}
function sofaDepth(s: SofaSpec): number {
  return s.D ?? s.d;
}

function layoutRuns(s: SofaSpec): Placed[] {
  const lay = s.layout ?? 'straight';
  const D = sofaDepth(s);
  const a: Side = s.arm === 'none' ? 'none' : 'arm';
  const zMain = -D / 2 + s.d / 2;
  const sideLen = D - s.d;
  const sideN = s.sideN ?? 1;
  switch (lay) {
    case 'corner':
      return [{ run: { len: s.w, armL: 'none', armR: 'corner', n: 0 }, x: 0, z: 0, ry: 0, main: true }];
    case 'chaiseR':
      return [{ run: { len: s.w, armL: a, armR: a, n: s.n, extR: D - s.d }, x: 0, z: zMain, ry: 0, main: true }];
    case 'chaiseL':
      return [{ run: { len: s.w, armL: a, armR: a, n: s.n, extL: D - s.d }, x: 0, z: zMain, ry: 0, main: true }];
    case 'lR':
      return [
        { run: { len: s.w, armL: a, armR: 'corner', n: s.n }, x: 0, z: zMain, ry: 0, main: true },
        { run: { len: sideLen, armL: 'none', armR: a, n: sideN }, x: s.w / 2 - s.d / 2, z: -D / 2 + s.d + sideLen / 2, ry: -Math.PI / 2, main: false },
      ];
    case 'lL':
      return [
        { run: { len: s.w, armL: 'corner', armR: a, n: s.n }, x: 0, z: zMain, ry: 0, main: true },
        { run: { len: sideLen, armL: a, armR: 'none', n: sideN }, x: -s.w / 2 + s.d / 2, z: -D / 2 + s.d + sideLen / 2, ry: Math.PI / 2, main: false },
      ];
    case 'u':
      return [
        { run: { len: s.w, armL: 'corner', armR: 'corner', n: s.n }, x: 0, z: zMain, ry: 0, main: true },
        { run: { len: sideLen, armL: 'none', armR: a, n: sideN }, x: s.w / 2 - s.d / 2, z: -D / 2 + s.d + sideLen / 2, ry: -Math.PI / 2, main: false },
        { run: { len: sideLen, armL: a, armR: 'none', n: sideN }, x: -s.w / 2 + s.d / 2, z: -D / 2 + s.d + sideLen / 2, ry: Math.PI / 2, main: false },
      ];
    default:
      return [{ run: { len: s.w, armL: a, armR: a, n: s.n }, x: 0, z: 0, ry: 0, main: true }];
  }
}

/** Derived run geometry shared by the 3D builder, the seats and the plan symbol. */
interface RunGeo {
  zb: number;
  zf: number;
  x0: number;
  x1: number;
  /** seat columns: x range, flags */
  cols: Array<{ a: number; b: number; corner: boolean; ext: number }>;
  /** z where seat cushions start (back) */
  zs: number;
  /** z of the front face of the back cushions / tight back (sitting zone starts) */
  zBackFront: number;
  /** offset from the outer back edge to a loose back cushion's bottom-back edge */
  cushOff: number;
  bh: number;
  bt: number;
  lean: number;
  armInset: number;
}

const TIGHT_T = 0.1;

function runGeo(s: SofaSpec, r: Run): RunGeo {
  const zb = -s.d / 2;
  const zf = s.d / 2;
  const sideW = (sd: Side): number => (sd === 'arm' ? s.armW : sd === 'corner' ? s.backT : 0);
  // tufted inner arm faces on scroll arms
  const armInset = s.arm === 'scroll' ? 0.05 : 0;
  const x0 = -r.len / 2 + sideW(r.armL) + (r.armL === 'arm' ? armInset : 0);
  const x1 = r.len / 2 - sideW(r.armR) - (r.armR === 'arm' ? armInset : 0);
  const loose = s.back === 'loose' || s.back === 'pillow';
  const lean = s.lean ?? (s.back === 'pillow' ? 0.3 : 0.22);
  const bt = s.backCushT ?? (s.back === 'pillow' ? 0.22 : 0.17);
  const bh = (s.backH - (s.seatH - 0.03) - bt * Math.sin(lean) * 0.75) / Math.cos(lean);
  const cushOff = s.backT + bh * Math.sin(lean) * 0.8;
  const zs = loose ? zb + s.backT - 0.01 : s.back === 'none' ? zb + 0.01 : zb + s.backT + TIGHT_T * 0.55;
  const zBackFront = loose ? zb + cushOff + bt * 0.85 : s.back === 'none' ? zb + 0.05 : zb + s.backT + TIGHT_T;
  const cols: RunGeo['cols'] = [];
  const cw = s.d - s.backT;
  let a = x0;
  let b = x1;
  if (r.armL === 'corner') a = x0 + cw;
  if (r.armR === 'corner') b = x1 - cw;
  if (r.armL === 'corner') cols.push({ a: x0, b: a, corner: true, ext: 0 });
  for (let i = 0; i < r.n; i++) {
    const ca = a + ((b - a) * i) / r.n;
    const cb = a + ((b - a) * (i + 1)) / r.n;
    const ext = (i === 0 ? r.extL ?? 0 : 0) + (i === r.n - 1 ? r.extR ?? 0 : 0);
    cols.push({ a: ca, b: cb, corner: false, ext });
  }
  if (r.armR === 'corner') cols.push({ a: b, b: x1, corner: true, ext: 0 });
  return { zb, zf, x0, x1, cols, zs, zBackFront, cushOff, bh, bt, lean, armInset };
}

function buildRun(k: Kit, s: SofaSpec, m: Mats, r: Run, main: boolean, seed: number): void {
  const g = runGeo(s, r);
  const { zb, zf } = g;
  const d = s.d;
  const L = r.len;
  const deckY = s.seatH - s.cushT;
  const legH = s.legH;
  const plump = s.plump ?? 0;
  const loose = s.back === 'loose' || s.back === 'pillow';
  const wrinkle = s.mat === 'leather' ? 0.004 : s.mat === 'linen' ? 0.003 : 0.0015;
  const woodFrame = s.arm === 'wood';
  const extL = r.extL ?? 0;
  const extR = r.extR ?? 0;

  /* --- base body (deck) */
  const bodyBot = legH;
  if (woodFrame) {
    // wooden rails carrying a dark deck
    k.rbox(L - 0.1, 0.05, d - 0.06, 0.005, M.matte('#3b3836'), 0, deckY - 0.05, 0, 1);
    for (const sz of [-1, 1]) k.rbox(L - 0.1, 0.07, 0.035, 0.006, m.wood, 0, deckY - 0.075, sz * (d / 2 - 0.03), 1);
  } else {
    k.rbox(L - 0.006, deckY - bodyBot, d - 0.006, Math.min(0.03, (deckY - bodyBot) / 2), m.up, 0, bodyBot, 0, 1);
  }
  const exts: Array<[number, number, number]> = [];
  for (const c of g.cols) if (c.ext > 0) exts.push([c.a, c.b, c.ext]);
  for (const [a, b, ext] of exts) {
    const atR = b > 0;
    const xa = atR ? a : -L / 2;
    const xb = atR ? L / 2 : b;
    if (woodFrame) {
      k.rbox(xb - xa - 0.1, 0.05, ext, 0.005, M.matte('#3b3836'), (xa + xb) / 2, deckY - 0.05, zf + ext / 2 - 0.03, 1);
      k.rbox(xb - xa - 0.1, 0.07, 0.035, 0.006, m.wood, (xa + xb) / 2, deckY - 0.075, zf + ext - 0.03, 1);
    } else {
      k.rbox(xb - xa - 0.006, deckY - bodyBot, ext + 0.02, 0.02, m.up, (xa + xb) / 2, bodyBot, zf + ext / 2 - 0.01, 1);
    }
    if (s.base !== 'wood') sofaBase(k, s.base, xb - xa, ext, legH, m.leg, m.up, (xa + xb) / 2, zf + ext / 2, { inset: 0.07 });
  }

  /* --- legs / plinth / skirt */
  if (s.base !== 'wood') sofaBase(k, s.base, L, d, legH, m.leg, m.up, 0, 0, { mid: L > 1.7 && s.base !== 'sled' && s.base !== 'plinth' && s.base !== 'skirt' });

  /* --- back frame */
  const frameTop = loose ? s.backH - (s.back === 'pillow' ? 0.16 : 0.09) : s.backH;
  if (s.back !== 'none') {
    if (woodFrame) {
      // two posts + rails + slats
      const lean = 0.12;
      const top = frameTop;
      for (const sx of [-1, 1]) {
        k.beam([sx * (L / 2 - 0.03), 0, zb + 0.035], [sx * (L / 2 - 0.03), top, zb + 0.025], 0.045, 0.045, m.wood, 0);
      }
      for (const y of [deckY + 0.02, top - 0.06]) {
        const zz = zb + 0.035 - ((y - deckY) / (top - deckY)) * 0.02;
        k.rbox(L - 0.08, 0.05, 0.03, 0.006, m.wood, 0, y, zz, 1);
      }
      const ns = Math.max(3, Math.round(L / 0.22));
      for (let i = 0; i < ns; i++) {
        const x = -L / 2 + 0.06 + ((L - 0.12) * (i + 0.5)) / ns;
        const sl = k.box(0.05, top - deckY - 0.1, 0.016, m.wood, x, deckY + 0.06, zb + 0.032);
        sl.rotation.x = -lean * 0.15;
      }
    } else if (s.back === 'camel') {
      const sh = new THREE.Shape();
      const hw = L / 2 - 0.02;
      const y0 = 0;
      const yS = s.armH - legH - 0.02;
      const yT = frameTop - legH - 0.02;
      sh.moveTo(-hw, y0);
      sh.lineTo(hw, y0);
      sh.lineTo(hw, yS);
      sh.bezierCurveTo(hw * 0.55, yS + 0.02, hw * 0.45, yT, 0, yT);
      sh.bezierCurveTo(-hw * 0.45, yT, -hw * 0.55, yS + 0.02, -hw, yS);
      sh.lineTo(-hw, y0);
      const geo = new THREE.ExtrudeGeometry(sh, { depth: s.backT - 0.04, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2, curveSegments: 14 });
      k.geo(geo, m.up, 0, legH, zb + 0.02);
    } else {
      if (s.arm === 'scroll') {
        // chesterfield: a continuous roll along the top of the back, level with the arm scrolls
        const rr = s.backT * 0.48;
        k.rbox(L - 0.004, frameTop - legH - rr, s.backT, 0.03, m.up, 0, legH, zb + s.backT / 2, 1);
        const xr = L / 2 - s.armW * 0.5;
        k.rod([-xr, frameTop - rr, zb + s.backT / 2 + 0.004], [xr, frameTop - rr, zb + s.backT / 2 + 0.004], rr, m.up, rr, 14);
      } else {
        k.rbox(L - 0.004, frameTop - legH, s.backT, Math.min(0.05, s.backT / 2), m.up, 0, legH, zb + s.backT / 2, s.lod ? 1 : 2);
      }
    }
  }
  // side backs of corner columns
  for (const sd of [-1, 1] as const) {
    const side = sd < 0 ? r.armL : r.armR;
    if (side !== 'corner') continue;
    k.rbox(s.backT, frameTop - legH, d - s.backT + 0.004, Math.min(0.05, s.backT / 2), m.up, sd * (L / 2 - s.backT / 2), legH, s.backT / 2, s.lod ? 1 : 2);
  }

  /* --- arms */
  for (const sd of [-1, 1] as const) {
    const side = sd < 0 ? r.armL : r.armR;
    if (side !== 'arm' || s.arm === 'none') continue;
    const ext = sd < 0 ? extL : extR;
    const ad = d + ext;
    const zc = zb + ad / 2;
    const xi = sd * (L / 2 - s.armW);
    if (woodFrame) {
      const xo = sd * (L / 2 - s.armW / 2);
      for (const z of [zb + 0.035, zb + ad - 0.035]) k.box(0.045, s.armH - 0.03, 0.045, m.wood, xo, 0, z);
      k.rbox(s.armW, 0.03, ad, 0.012, m.wood, xo, s.armH - 0.03, zc, 1);
      k.rbox(0.03, 0.05, ad - 0.06, 0.006, m.wood, xo, deckY - 0.075, zc, 1);
      const ns = Math.max(3, Math.round(ad / 0.15));
      for (let i = 0; i < ns; i++) {
        const z = zb + 0.07 + ((ad - 0.14) * (i + 0.5)) / ns;
        k.box(0.016, s.armH - 0.03 - deckY + 0.02, 0.04, m.wood, xo, deckY - 0.03, z);
      }
      continue;
    }
    upholsteredArm(k, s.arm, s.armW, s.armH - legH, ad, m.up, xi, legH, zc, sd);
    if (s.arm === 'scroll') {
      // tufted inner face of a scroll arm
      const ph = s.armH - 0.11 - deckY;
      const pw = ad - s.backT - 0.03;
      const tufts = diamondTufts(pw, ph, Math.max(2, Math.round(pw / 0.2)), 2, 0.09, 0.08);
      addPad(k, pw, ph, { t: 0.05, r: 0.035, crown: 0.01, tufts, tuftDepth: 0.04, tuftR: 0.055, step: 0.1, wrinkle }, m.up, xi - sd * 0.003, deckY + ph / 2, zb + s.backT + pw / 2, { ry: -sd * Math.PI / 2, buttons: m.btn });
    }
  }

  /* --- wings (wingback chairs) */
  if (s.wings) {
    for (const sd of [-1, 1] as const) {
      const side = sd < 0 ? r.armL : r.armR;
      if (side !== 'arm') continue;
      const ww = s.armW * 0.62;
      const b = 0.02;
      const sh = new THREE.Shape();
      const z0 = zb + b;
      const yA = s.armH - 0.06;
      const yT = s.backH - b;
      sh.moveTo(z0, yA);
      sh.lineTo(zb + 0.5, yA);
      sh.bezierCurveTo(zb + 0.6, yA + 0.08, zb + 0.5, yT - 0.12, zb + 0.32, yT - 0.02);
      sh.quadraticCurveTo(zb + 0.22, yT, zb + 0.12, yT);
      sh.lineTo(z0, yT);
      sh.lineTo(z0, yA);
      const geo = extrudeZ(sh, ww, b, 8);
      geo.rotateY(-Math.PI / 2);
      k.geo(geo, m.up, sd * (L / 2 - s.armW + ww / 2 + 0.01), 0, 0);
    }
  }

  /* --- tight backs (in front of the frame) */
  if (!loose && s.back !== 'none' && !woodFrame) {
    const pw = g.x1 - g.x0 - 0.004;
    const ph = s.backH - (s.arm === 'scroll' ? 0.06 : 0.04) - (s.seatH - 0.06);
    const o = {
      t: TIGHT_T * 0.8,
      tB: 0,
      r: 0.045,
      p: 2.2,
      crown: 0.02 + plump * 0.02,
      wrinkle,
      seed,
      step: 0.12,
      tBot: 1.1,
      tTop: 0.85,
    } as Parameters<typeof addPad>[3];
    const pl: Parameters<typeof addPad>[8] = {};
    if (s.back === 'tufted') {
      const cols = s.tuftCols ?? Math.max(3, Math.round(pw / 0.19));
      o.tufts = diamondTufts(pw, ph, cols, s.tuftRows ?? 3, 0.1, 0.085);
      o.tuftDepth = 0.045;
      o.tuftR = 0.06;
      o.step = 0.1;
      pl.buttons = m.btn;
    } else if (s.back === 'channel') {
      const nc = Math.max(4, Math.round(pw / 0.16));
      o.channels = Array.from({ length: nc - 1 }, (_, i) => -pw / 2 + (pw * (i + 1)) / nc);
      o.grooveDepth = 0.035;
      o.grooveW = 0.02;
      o.step = 0.2;
    } else if (s.back === 'rows') {
      const nr = 3;
      o.rows = Array.from({ length: nr - 1 }, (_, i) => -ph / 2 + (ph * (i + 1)) / nr);
      o.grooveDepth = 0.05;
      o.grooveW = 0.03;
      o.crown = 0.05;
      o.t = TIGHT_T;
    }
    const lean = 0.1;
    const grp = addPad(k, pw, ph, o, m.up, (g.x0 + g.x1) / 2, 0, 0, { ...pl, rx: -lean });
    grp.position.set((g.x0 + g.x1) / 2, s.seatH - 0.06 + (ph / 2) * Math.cos(lean), zb + s.backT - (ph / 2) * Math.sin(lean) + ph * Math.sin(lean));
    // side tight backs of corners
    for (const sd of [-1, 1] as const) {
      const side = sd < 0 ? r.armL : r.armR;
      if (side !== 'corner') continue;
      const sw = d - s.backT - TIGHT_T - 0.004;
      const sg = addPad(k, sw, ph, { ...o, tufts: undefined, channels: undefined }, m.up, 0, 0, 0, { rx: -lean, ry: -sd * Math.PI / 2 });
      sg.position.set(sd * (L / 2 - s.backT - ph * Math.sin(lean) + (ph / 2) * Math.sin(lean)), s.seatH - 0.06 + (ph / 2) * Math.cos(lean), zb + s.backT + TIGHT_T + sw / 2);
    }
  }

  /* --- seat cushions */
  const crown = 0.012 + plump * 0.03;
  const cushR = Math.min(s.cushT * 0.55, 0.06 + plump * 0.04);
  const benches: Array<[number, number, number]> = [];
  if (s.seat === 'bench') {
    // one long cushion across the regular columns, separate cushions for corners / chaise extensions
    let a = Infinity;
    let b = -Infinity;
    for (const c of g.cols) {
      if (c.corner || c.ext > 0) benches.push([c.a, c.b, c.ext]);
      else {
        a = Math.min(a, c.a);
        b = Math.max(b, c.b);
      }
    }
    if (b > a) benches.push([a, b, 0]);
  } else {
    for (const c of g.cols) benches.push([c.a, c.b, c.ext]);
  }
  benches.forEach(([a, b, ext], i) => {
    const cw = b - a - 0.008;
    const z0 = g.zs;
    const z1 = zf - 0.004 + ext;
    seatPad(k, cw, z1 - z0, s.cushT + 0.01, m.up, (a + b) / 2, deckY - 0.005, (z0 + z1) / 2, {
      crown,
      r: cushR,
      p: 2.6 - plump * 0.4,
      wrinkle,
      seed: seed + i * 3.1,
      step: s.lod ? 0.3 : 0.2,
      eN: s.lod ? 2 : 3,
    });
  });

  /* --- loose back cushions */
  if (loose) {
    const bp: Partial<Parameters<typeof addPad>[3]> = {
      crown: 0.02 + plump * 0.04,
      r: Math.min(g.bt * 0.5, 0.06 + plump * 0.04),
      p: 2.3 - plump * 0.3,
      wrinkle,
      step: s.lod ? 0.3 : 0.2,
      eN: s.lod ? 2 : 3,
      tBot: 0.9,
      tTop: 1.0,
    };
    const yb = s.seatH - 0.03;
    g.cols.forEach((c, i) => {
      let a = c.a;
      let b = c.b;
      if (c.corner) {
        // side cushion along the corner's side back
        const sd = c.b > 0 ? 1 : -1;
        const za = zb + g.cushOff + g.bt * 0.85;
        const zz = zf - 0.03;
        const nb = s.buttons ?? 0;
        const tufts: Array<[number, number]> = nb ? Array.from({ length: nb }, (_, j) => [-(zz - za) / 2 + ((zz - za) * (j + 0.5)) / nb, 0.02]) : [];
        backPad(k, zz - za, g.bh, g.bt, g.lean, m.up, sd * (L / 2 - g.cushOff), yb, (za + zz) / 2, { ...bp, seed: seed + 11 + i, tufts: nb ? tufts : undefined, tuftDepth: 0.03, tuftR: 0.04 }, -sd * Math.PI / 2, nb ? { buttons: m.btn } : {});
        if (sd > 0) b = L / 2 - g.cushOff - g.bt * 0.85;
        else a = -L / 2 + g.cushOff + g.bt * 0.85;
      }
      const cw = b - a - 0.01;
      const nb = s.buttons ?? 0;
      const tufts: Array<[number, number]> = nb ? Array.from({ length: nb }, (_, j) => [-cw / 2 + (cw * (j + 0.5)) / nb, 0.02]) : [];
      const jitter = Math.sin(seed * 7.1 + i * 2.3) * 0.02;
      backPad(
        k,
        cw,
        g.bh,
        g.bt,
        g.lean + jitter,
        m.up,
        (a + b) / 2,
        yb,
        zb + g.cushOff,
        { ...bp, seed: seed + i, tufts: nb ? tufts : undefined, tuftDepth: 0.03, tuftR: 0.04 },
        0,
        nb ? { buttons: m.btn } : {},
      );
    });
  }

  /* --- bolsters & throw pillows (main run only) */
  if (main && s.bolsters) {
    for (const sd of [-1, 1] as const) {
      const x = sd > 0 ? g.x1 - 0.13 : g.x0 + 0.13;
      const bo = bolster;
      const kk = new Kit();
      bo(kk, 0.42, 0.1, m.accent, 0, 0, 0, m.btn);
      kk.g.rotation.y = Math.PI / 2;
      k.add(kk.g, x, s.seatH + 0.09, g.zBackFront + 0.17);
    }
  }
  const np = main ? s.pillows ?? 0 : 0;
  if (np > 0) {
    const zP = g.zBackFront + 0.035;
    const yP = s.seatH - 0.02;
    const size = Math.min(s.back === 'pillow' ? 0.5 : 0.44, (sofaH(s) - s.seatH - 0.01) / 0.93);
    throwPillow(k, size, m.accent, g.x0 + size * 0.62, yP, zP, 0.35, 0.36);
    if (np >= 2) throwPillow(k, size * 0.92, m.accent, g.x1 - size * 0.6, yP, zP, -0.32, 0.36);
    if (np >= 3) throwPillow(k, size * 0.85, m.up, g.x0 + size * 1.25, yP, zP + 0.03, 0.12, 0.4);
  }
}

function sofaMats(s: SofaSpec, c: Colors): Mats {
  const up = upMat(s.mat, c.fabric);
  const lm = s.legMat ?? 'wood';
  const legC = c.legs ?? PAL.walnut;
  const leg = lm === 'wood' ? M.wood(legC) : lm === 'gold' ? M.metal(legC, 0.28, 1) : lm === 'black' ? M.metal(legC, 0.5, 0.7) : M.metal(legC, 0.3, 1);
  return {
    up,
    btn: s.mat === 'leather' ? M.leather(darken(c.fabric, 0.15)) : upMat(s.mat, darken(c.fabric, 0.12)),
    leg,
    wood: M.wood(c.wood ?? c.legs ?? PAL.oak),
    accent: c.accent ? (s.mat === 'leather' || s.mat === 'velvet' ? M.velvet(c.accent) : M.fabric(c.accent, 20)) : up,
  };
}

export function buildSofa(s: SofaSpec, c: Colors): THREE.Object3D {
  const k = new Kit();
  const m = sofaMats(s, c);
  const seed = s.seed ?? 1;
  layoutRuns(s).forEach((p, i) => {
    const rk = new Kit();
    buildRun(rk, s, m, p.run, p.main, seed + i * 17);
    const grp = k.sub(rk, p.x, 0, p.z);
    grp.rotation.y = p.ry;
  });
  return k.g;
}

function toWorld(p: Placed, x: number, z: number): [number, number] {
  const c = Math.cos(p.ry);
  const sn = Math.sin(p.ry);
  return [p.x + x * c + z * sn, p.z - x * sn + z * c];
}

export function sofaSeats(s: SofaSpec): SeatAnchor[] {
  const out: SeatAnchor[] = [];
  for (const p of layoutRuns(s)) {
    const g = runGeo(s, p.run);
    const zSit = (g.zBackFront + g.zf) / 2 + 0.02;
    for (const c of g.cols) {
      let cx = (c.a + c.b) / 2;
      if (c.corner) cx += c.b > 0 ? -0.08 : 0.08;
      const [x, z] = toWorld(p, cx, c.corner ? zSit + 0.06 : zSit);
      const facing = p.ry + (c.corner ? (c.b > 0 ? -Math.PI / 4 : Math.PI / 4) * (p.ry === 0 ? 1 : 0) : 0);
      out.push({ x: +x.toFixed(3), z: +z.toFixed(3), height: s.seatH, facing: +facing.toFixed(3), kind: 'sit' });
      if (c.ext >= 0.6) {
        const [lx, lz] = toWorld(p, cx, (g.zBackFront + g.zf + c.ext) / 2 + 0.1);
        out.push({ x: +lx.toFixed(3), z: +lz.toFixed(3), height: s.seatH, facing: 0, kind: 'lie' });
      }
    }
  }
  return out;
}

export function drawSofa(ctx: Ctx2D, s: SofaSpec, c: Colors): void {
  sym(ctx, () => {
    const body = tint(c.fabric, 0.28);
    const cush = tint(c.fabric, 0.5);
    const loose = s.back === 'loose' || s.back === 'pillow';
    for (const p of layoutRuns(s)) {
      const r = p.run;
      const g = runGeo(s, r);
      ctx.save();
      ctx.translate(p.x, p.z);
      ctx.rotate(-p.ry);
      const L = r.len;
      D.box(ctx, -L / 2, g.zb, L / 2, g.zf, 0.04, body);
      for (const cl of g.cols) if (cl.ext > 0) D.box(ctx, cl.a - (cl.a < 0 && r.armL === 'arm' ? s.armW : 0), g.zf - 0.06, cl.b + (cl.b > 0 && r.armR === 'arm' ? s.armW : 0), g.zf + cl.ext, 0.04, body);
      // back strip
      if (s.back !== 'none') D.box(ctx, -L / 2, g.zb, L / 2, g.zb + s.backT, 0.03, body, INK_SOFT, LINE_THIN);
      for (const sd of [-1, 1]) {
        const side = sd < 0 ? r.armL : r.armR;
        const ext = (sd < 0 ? r.extL : r.extR) ?? 0;
        if (side === 'arm' && s.arm !== 'none') D.box(ctx, sd * (L / 2), g.zb, sd * (L / 2 - s.armW), g.zf + ext, 0.04, body);
        if (side === 'corner') D.box(ctx, sd * (L / 2), g.zb, sd * (L / 2 - s.backT), g.zf, 0.03, body, INK_SOFT, LINE_THIN);
      }
      // seat cushions
      for (const cl of g.cols) {
        D.box(ctx, cl.a + 0.006, g.zs + 0.01, cl.b - 0.006, g.zf + cl.ext - 0.006, 0.04, cush, INK_SOFT, LINE_THIN);
        if (loose) {
          let a = cl.a;
          let b = cl.b;
          if (cl.corner) {
            const sd = cl.b > 0 ? 1 : -1;
            const xo = sd * (L / 2 - g.cushOff);
            const xi = xo - sd * g.bt * 0.85;
            D.box(ctx, Math.min(xo, xi), g.zb + g.cushOff + g.bt * 0.85, Math.max(xo, xi), g.zf - 0.03, 0.04, cush, INK_SOFT, LINE_THIN);
            if (sd > 0) b = xi;
            else a = xi;
          }
          D.box(ctx, a + 0.01, g.zb + g.cushOff - 0.02, b - 0.01, g.zBackFront, 0.05, cush, INK_SOFT, LINE_THIN);
        }
      }
      if (!loose && s.back !== 'none') D.line(ctx, g.x0, g.zb + s.backT + TIGHT_T * 0.9, g.x1, g.zb + s.backT + TIGHT_T * 0.9, INK_SOFT, LINE_THIN);
      ctx.restore();
    }
    const np = s.pillows ?? 0;
    if (np > 0 && c.accent) {
      const p0 = layoutRuns(s)[0];
      const g = runGeo(s, p0.run);
      ctx.save();
      ctx.translate(p0.x, p0.z);
      const pil = (x: number, rot: number) => {
        ctx.save();
        ctx.translate(x, g.zBackFront + 0.02);
        ctx.rotate(rot);
        D.rr(ctx, 0, 0, 0.4, 0.13, 0.05, tint(c.accent, 0.2), INK_SOFT, LINE_THIN);
        ctx.restore();
      };
      pil(g.x0 + 0.28, -0.35);
      if (np >= 2) pil(g.x1 - 0.27, 0.32);
      ctx.restore();
    }
  });
}

interface SofaItem {
  id: string;
  name: string;
  group?: string;
  tags: string[];
  spec: SofaSpec;
  fabric: string;
  legs?: string;
  accent?: string;
  wood?: string;
  /** extra details on top of the generic sofa */
  extra?: (k: Kit, c: Colors) => void;
  seats?: SeatAnchor[];
}

function sofaDef(o: SofaItem): FurnitureDef {
  const s = o.spec;
  const colors = [slot('fabric', UP_LABEL[s.mat], o.fabric)];
  if (s.arm === 'wood') colors.push(slot('wood', 'מסגרת עץ', o.wood ?? PAL.oak));
  if (s.base !== 'plinth' && s.base !== 'skirt' && s.base !== 'wood' && s.base !== 'none')
    colors.push(slot('legs', s.legMat && s.legMat !== 'wood' ? 'בסיס מתכת' : 'רגליים', o.legs ?? PAL.walnut));
  if (s.base === 'plinth') colors.push(slot('legs', 'בסיס', o.legs ?? '#2d2b29'));
  if ((s.pillows ?? 0) > 0 || s.bolsters) colors.push(slot('accent', 'כריות נוי', o.accent ?? PAL.cream));
  return {
    id: o.id,
    name: o.name,
    category: 'living',
    group: o.group ?? 'ספות',
    tags: o.tags,
    size: { w: s.w, d: sofaDepth(s), h: sofaH(s) },
    colors,
    seats: o.seats ?? sofaSeats(s),
    build: ({ colors: c }) => {
      if (!o.extra) return buildSofa(s, c);
      const k = new Kit();
      k.add(buildSofa(s, c));
      o.extra(k, c);
      return k.g;
    },
    draw2d: (ctx, c) => drawSofa(ctx, s, c),
  };
}

/* ------------------------------------------------------------------ sofa presets */

const BASE: SofaSpec = {
  w: 2.2,
  d: 0.95,
  backH: 0.84,
  seatH: 0.45,
  n: 3,
  arm: 'track',
  armW: 0.18,
  armH: 0.62,
  back: 'loose',
  backT: 0.18,
  seat: 'split',
  cushT: 0.16,
  base: 'taper',
  legH: 0.14,
  mat: 'fabric',
  pillows: 2,
};

const sp = (o: Partial<SofaSpec>): SofaSpec => ({ ...BASE, ...o });

const SOFAS: SofaItem[] = [
  {
    id: 'sofa-modern-3',
    name: 'ספה מודרנית תלת-מושבית',
    tags: ['מודרני', 'בד', 'זרועות ישרות'],
    spec: sp({ base: 'block', legMat: 'black', legH: 0.09, seatH: 0.44, cushT: 0.17, armW: 0.16, armH: 0.6, seed: 2 }),
    fabric: '#5f6b75',
    legs: '#1e1f22',
    accent: '#d9b36c',
  },
  {
    id: 'sofa-english-3',
    name: 'ספה אנגלית עם ידיות מגולגלות',
    tags: ['קלאסי', 'אנגלי', 'פשתן', 'ידיות מגולגלות'],
    spec: sp({ arm: 'rolled', armW: 0.2, armH: 0.6, back: 'tight', backH: 0.86, backT: 0.16, base: 'turned', legH: 0.15, mat: 'linen', cushT: 0.17, seed: 3 }),
    fabric: '#cdbb9c',
    legs: PAL.darkWood,
    accent: '#7d8f73',
  },
  {
    id: 'sofa-chesterfield-leather',
    name: "ספת צ'סטרפילד מעור",
    tags: ["צ'סטרפילד", 'עור', 'קפיטונאז׳', 'כפתורים', 'קלאסי', 'וינטג׳'],
    spec: sp({ w: 2.15, d: 0.92, arm: 'scroll', armW: 0.24, armH: 0.74, backH: 0.74, back: 'tufted', backT: 0.2, seat: 'bench', cushT: 0.14, base: 'bun', legH: 0.07, mat: 'leather', pillows: 0, tuftRows: 3, seed: 4 }),
    fabric: '#7a3f22',
    legs: PAL.darkWood,
  },
  {
    id: 'sofa-chesterfield-velvet',
    name: "ספת צ'סטרפילד מקטיפה",
    tags: ["צ'סטרפילד", 'קטיפה', 'קפיטונאז׳', 'כפתורים', 'יוקרתי'],
    spec: sp({ w: 2.2, d: 0.94, arm: 'scroll', armW: 0.24, armH: 0.74, backH: 0.74, back: 'tufted', backT: 0.2, seat: 'split', cushT: 0.15, base: 'brass', legH: 0.12, mat: 'velvet', pillows: 0, tuftRows: 3, seed: 5 }),
    fabric: '#24574a',
    legs: PAL.darkWood,
    accent: '#c9a35a',
  },
  {
    id: 'sofa-midcentury',
    name: 'ספת מיד-סנצ׳ורי על רגלי עץ',
    tags: ['רטרו', 'שנות ה-60', 'רגלי עץ', 'כפתורים'],
    spec: sp({ w: 2.05, d: 0.86, arm: 'track', armW: 0.1, armH: 0.56, backH: 0.8, backT: 0.12, backCushT: 0.14, lean: 0.2, seat: 'bench', cushT: 0.13, base: 'taper', legH: 0.19, buttons: 2, seed: 6 }),
    fabric: '#3f6e6b',
    legs: PAL.teak,
    accent: '#e0b25a',
  },
  {
    id: 'sofa-cloud',
    name: 'ספת ענן עמוקה מבוקלה',
    tags: ['בוקלה', 'ענן', 'עמוקה', 'נמוכה', 'רכה', 'מודרני'],
    spec: sp({ w: 2.6, d: 1.12, arm: 'box', armW: 0.32, armH: 0.6, backH: 0.8, back: 'pillow', backT: 0.22, backCushT: 0.24, seatH: 0.42, cushT: 0.22, plump: 1, base: 'plinth', legH: 0.04, mat: 'boucle', seed: 7 }),
    fabric: '#ece6da',
    legs: '#c9c1b3',
    accent: '#c9b8a0',
  },
  {
    id: 'sofa-tuxedo',
    name: 'ספת טוקסידו',
    tags: ['טוקסידו', 'קטיפה', 'ידיות גבוהות', 'אלגנטי'],
    spec: sp({ w: 2.1, d: 0.92, arm: 'track', armW: 0.15, armH: 0.74, backH: 0.74, back: 'tight', backT: 0.15, cushT: 0.16, base: 'block', legMat: 'gold', legH: 0.08, mat: 'velvet', seed: 8 }),
    fabric: '#2e3d5c',
    legs: PAL.brass,
    accent: '#d8c7a6',
  },
  {
    id: 'sofa-camelback',
    name: 'ספת גב גמל',
    tags: ['גב גמל', 'קלאסי', 'פשתן', 'רגליים מחורטות'],
    spec: sp({ w: 2.15, d: 0.9, arm: 'rolled', armW: 0.19, armH: 0.64, backH: 0.94, back: 'camel', backT: 0.16, seat: 'bench', cushT: 0.15, base: 'turned', legH: 0.16, mat: 'linen', bolsters: true, pillows: 0, seed: 9 }),
    fabric: '#b98b86',
    legs: PAL.darkWood,
    accent: '#efe6d6',
  },
  {
    id: 'sofa-lawson',
    name: 'ספת לוסון עם חצאית',
    tags: ['לוסון', 'חצאית', 'קלאסי', 'כפרי'],
    spec: sp({ w: 2.2, d: 0.96, arm: 'round', armW: 0.2, armH: 0.6, backH: 0.88, base: 'skirt', legH: 0.15, seed: 10 }),
    fabric: '#9fb3c3',
    accent: '#f0e6d2',
  },
  {
    id: 'sofa-scandi-wood',
    name: 'ספה סקנדינבית עם מסגרת עץ',
    tags: ['סקנדינבי', 'עץ', 'נורדי', 'כריות'],
    spec: sp({ w: 2.0, d: 0.86, arm: 'wood', armW: 0.07, armH: 0.6, backH: 0.82, backT: 0.06, backCushT: 0.16, lean: 0.18, base: 'wood', legH: 0.0, mat: 'linen', cushT: 0.15, seatH: 0.44, seed: 11 }),
    fabric: '#9aa58c',
    wood: PAL.oak,
    accent: '#e7dcc9',
  },
  {
    id: 'sofa-club-leather',
    name: 'ספת קלאב מעור',
    tags: ['קלאב', 'עור', 'קלאסי', 'מועדון'],
    spec: sp({ w: 2.15, d: 0.96, arm: 'round', armW: 0.27, armH: 0.66, backH: 0.8, back: 'tight', backT: 0.18, cushT: 0.17, base: 'bun', legH: 0.06, mat: 'leather', plump: 0.6, pillows: 0, seed: 12 }),
    fabric: '#4a3024',
    legs: PAL.darkWood,
  },
  {
    id: 'sofa-4-seater',
    name: 'ספה ארבע-מושבית',
    tags: ['גדולה', 'ארבעה מושבים', 'משפחתית'],
    spec: sp({ w: 2.75, d: 0.98, n: 4, arm: 'slope', armW: 0.2, armH: 0.64, backH: 0.86, base: 'taper', legH: 0.13, pillows: 3, seed: 13 }),
    fabric: '#6f7550',
    legs: PAL.walnut,
    accent: '#d8c3a5',
  },
  {
    id: 'sofa-sleeper-loveseat',
    name: 'ספה נפתחת דו-מושבית',
    tags: ['ספה נפתחת', 'מיטה', 'דו-מושבית', 'אירוח'],
    spec: sp({ w: 1.7, d: 0.94, n: 2, arm: 'track', armW: 0.14, armH: 0.6, backH: 0.84, seat: 'bench', cushT: 0.14, base: 'block', legH: 0.11, seed: 14, pillows: 1 }),
    fabric: '#7b8a99',
    legs: PAL.oak,
    accent: '#e9c9a6',
  },
  {
    id: 'sofa-loveseat-rolled',
    name: 'ספת אהבה דו-מושבית קלאסית',
    tags: ['דו-מושבית', 'ידיות מגולגלות', 'חצאית', 'כפרי'],
    spec: sp({ w: 1.6, d: 0.92, n: 2, arm: 'rolled', armW: 0.19, armH: 0.6, backH: 0.88, base: 'skirt', legH: 0.15, mat: 'linen', seed: 15, pillows: 2 }),
    fabric: '#d8cdb8',
    accent: '#9b5d4b',
  },
  {
    id: 'sofa-armless-loveseat',
    name: 'ספה דו-מושבית ללא ידיות',
    tags: ['ללא ידיות', 'קטיפה', 'תעלות', 'קטנה'],
    spec: sp({ w: 1.42, d: 0.85, n: 2, arm: 'none', armW: 0, armH: 0.5, backH: 0.8, back: 'channel', backT: 0.14, seat: 'bench', cushT: 0.15, base: 'brass', legH: 0.15, mat: 'velvet', pillows: 0, seed: 16 }),
    fabric: '#c98f8f',
    legs: PAL.walnut,
  },
  {
    id: 'sofa-velvet-channel',
    name: 'ספת קטיפה עם תפרי תעלות',
    tags: ['קטיפה', 'תעלות', 'מעוגלת', 'גלאם'],
    spec: sp({ w: 2.1, d: 0.95, arm: 'round', armW: 0.24, armH: 0.66, backH: 0.8, back: 'channel', backT: 0.18, seat: 'bench', cushT: 0.17, plump: 0.6, base: 'block', legMat: 'gold', legH: 0.07, mat: 'velvet', pillows: 0, seed: 17 }),
    fabric: '#b8613f',
    legs: PAL.brass,
  },
  {
    id: 'sofa-leather-modern',
    name: 'ספת עור מודרנית על בסיס מזחלת',
    tags: ['עור', 'מודרני', 'כרום', 'מזחלת', 'מינימליסטי'],
    spec: sp({ w: 2.2, d: 0.92, arm: 'box', armW: 0.14, armH: 0.58, backH: 0.8, backT: 0.14, cushT: 0.16, base: 'sled', legMat: 'metal', legH: 0.17, mat: 'leather', pillows: 0, seed: 18 }),
    fabric: '#2d2a28',
    legs: '#d9dcde',
  },
  {
    id: 'sofa-flared-arm',
    name: 'ספה עם ידיות מתרחבות',
    tags: ['ידיות מתרחבות', 'קלאסי', 'נוח'],
    spec: sp({ w: 2.2, d: 0.98, arm: 'flared', armW: 0.24, armH: 0.62, backH: 0.88, base: 'turned', legH: 0.13, seed: 19, pillows: 2 }),
    fabric: '#b86b4b',
    legs: PAL.darkWood,
    accent: '#e9dcc4',
  },
  {
    id: 'sofa-retro-hairpin',
    name: 'ספה רטרו על רגלי סיכה',
    tags: ['רטרו', 'רגלי סיכה', 'מתכת', 'דו-מושבית'],
    spec: sp({ w: 1.75, d: 0.84, n: 2, arm: 'slope', armW: 0.13, armH: 0.6, backH: 0.8, backT: 0.12, backCushT: 0.14, base: 'hairpin', legMat: 'black', legH: 0.2, cushT: 0.13, buttons: 1, seed: 20, pillows: 1 }),
    fabric: '#d6a544',
    legs: '#1e1f22',
    accent: '#3d5166',
  },
  {
    id: 'sofa-sectional-l-right',
    name: 'ספה פינתית L ימנית',
    group: 'ספות פינתיות',
    tags: ['פינתית', 'L', 'סקשיונל', 'גדולה'],
    spec: sp({ w: 2.7, d: 0.96, D: 2.05, n: 2, sideN: 1, layout: 'lR', lod: true, base: 'block', legMat: 'black', legH: 0.09, pillows: 2, seed: 21 }),
    fabric: '#8d8478',
    legs: '#1e1f22',
    accent: '#3f5a66',
  },
  {
    id: 'sofa-sectional-l-left',
    name: 'ספה פינתית L שמאלית',
    group: 'ספות פינתיות',
    tags: ['פינתית', 'L', 'סקשיונל', 'גדולה'],
    spec: sp({ w: 2.7, d: 0.96, D: 2.05, n: 2, sideN: 1, layout: 'lL', lod: true, arm: 'slope', armW: 0.2, base: 'taper', legH: 0.12, mat: 'linen', pillows: 2, seed: 22 }),
    fabric: '#a7a08f',
    legs: PAL.walnut,
    accent: '#b4573d',
  },
  {
    id: 'sofa-sectional-u',
    name: 'ספה פינתית בצורת U',
    group: 'ספות פינתיות',
    tags: ['U', 'פינתית', 'סקשיונל', 'ענקית', 'משפחתית'],
    spec: sp({ w: 3.3, d: 0.96, D: 2.1, n: 2, sideN: 1, layout: 'u', lod: true, base: 'plinth', legH: 0.05, seatH: 0.44, cushT: 0.18, seat: 'split', pillows: 2, seed: 23, plump: 0.3 }),
    fabric: '#cfc6b6',
    legs: '#4a4540',
    accent: '#6a7d64',
  },
  {
    id: 'sofa-chaise-sectional',
    name: 'ספה עם שזלונג ימני',
    group: 'ספות פינתיות',
    tags: ['שזלונג', 'פינתית', 'סקשיונל', 'שכיבה'],
    spec: sp({ w: 2.5, d: 0.95, D: 1.65, n: 3, layout: 'chaiseR', base: 'taper', legH: 0.12, mat: 'linen', seed: 24 }),
    fabric: '#7d8a96',
    legs: PAL.oak,
    accent: '#e6d3b3',
  },
  {
    id: 'sofa-chaise-left-velvet',
    name: 'ספת קטיפה עם שזלונג שמאלי',
    group: 'ספות פינתיות',
    tags: ['שזלונג', 'קטיפה', 'פינתית', 'גלאם'],
    spec: sp({ w: 2.4, d: 0.95, D: 1.6, n: 3, layout: 'chaiseL', arm: 'round', armW: 0.2, armH: 0.6, base: 'brass', legH: 0.12, mat: 'velvet', seat: 'split', seed: 25 }),
    fabric: '#4b5d48',
    legs: PAL.walnut,
    accent: '#d9b48f',
  },
  {
    id: 'sofa-modular-armless',
    name: 'מודול ספה ללא ידיות',
    group: 'ספות פינתיות',
    tags: ['מודולרי', 'מודול', 'יחידה', 'בוקלה'],
    spec: sp({ w: 0.92, d: 1.0, n: 1, arm: 'none', armW: 0, armH: 0.5, back: 'pillow', backT: 0.18, backCushT: 0.22, base: 'plinth', legH: 0.04, cushT: 0.2, seatH: 0.42, plump: 0.8, mat: 'boucle', pillows: 0, seed: 26 }),
    fabric: '#d9d0c1',
    legs: '#3a3633',
  },
  {
    id: 'sofa-modular-corner',
    name: 'מודול ספה פינתי',
    group: 'ספות פינתיות',
    tags: ['מודולרי', 'פינה', 'מודול', 'בוקלה'],
    spec: sp({ w: 1.0, d: 1.0, n: 0, layout: 'corner', arm: 'none', armW: 0, armH: 0.5, back: 'pillow', backT: 0.18, backCushT: 0.22, base: 'plinth', legH: 0.04, cushT: 0.2, seatH: 0.42, plump: 0.8, mat: 'boucle', pillows: 0, seed: 27 }),
    fabric: '#d9d0c1',
    legs: '#3a3633',
  },
  {
    id: 'sofa-modular-chaise',
    name: 'מודול שזלונג',
    group: 'ספות פינתיות',
    tags: ['מודולרי', 'שזלונג', 'מודול', 'בוקלה'],
    spec: sp({ w: 0.92, d: 1.0, D: 1.65, n: 1, layout: 'chaiseR', arm: 'none', armW: 0, armH: 0.5, back: 'pillow', backT: 0.18, backCushT: 0.22, base: 'plinth', legH: 0.04, cushT: 0.2, seatH: 0.42, plump: 0.8, mat: 'boucle', pillows: 0, seed: 28 }),
    fabric: '#d9d0c1',
    legs: '#3a3633',
  },
];

/* ================================================================== curved sofas */

interface CurvedSpec {
  /** arc length along the back */
  L: number;
  /** radius of the back */
  R: number;
  d: number;
  seatH: number;
  backH: number;
  backT: number;
  n: number;
  mat: UpKind;
  channel?: boolean;
  base: 'plinth' | 'legs';
}

function curvedDims(s: CurvedSpec): { w: number; D: number; zb: number } {
  const a = s.L / 2 / s.R;
  const w = 2 * s.R * Math.sin((s.L / 2 - 0.04) / s.R);
  const D = s.R - (s.R - s.d) * Math.cos(a);
  return { w: +w.toFixed(3), D: +D.toFixed(3), zb: -D / 2 };
}

function buildCurved(s: CurvedSpec, c: Colors): THREE.Object3D {
  const k = new Kit();
  const up = upMat(s.mat, c.fabric);
  const { zb } = curvedDims(s);
  const cz = zb + s.R;
  const d = s.d;
  const L = s.L;
  const legH = s.base === 'plinth' ? 0.06 : 0.12;
  const cushT = 0.17;
  const deckY = s.seatH - cushT;
  const body = new Kit();
  // straight body in local coordinates (back at z = zb), bent afterwards
  const zc = zb + d / 2;
  // deck
  addPad(body, L - 0.02, d - 0.02, { t: (deckY - legH) / 2, tB: (deckY - legH) / 2, backStep: 0.15, r: 0.04, p: 3, step: 0.1, eN: 2 }, up, 0, (deckY + legH) / 2, zc, { rx: -Math.PI / 2 });
  // back: thick rounded wall
  const bh = s.backH - legH;
  const bo: Partial<Parameters<typeof addPad>[3]> = { t: s.backT * 0.55, tB: s.backT * 0.45, backStep: 0.15, r: 0.09, p: 2.2, step: 0.1, eN: 3, crown: 0.01, wrinkle: 0.002 };
  if (s.channel) {
    const nc = Math.round(L / 0.17);
    bo.channels = Array.from({ length: nc - 1 }, (_, i) => -L / 2 + (L * (i + 1)) / nc);
    bo.grooveDepth = 0.04;
    bo.grooveW = 0.025;
    bo.step = 0.3;
  } else {
    bo.step = 0.14;
  }
  addPad(body, L, bh, bo as Parameters<typeof addPad>[3], up, 0, legH + bh / 2, zb + s.backT * 0.45, {});
  // seat cushions
  const cw = (L - 2 * 0.06) / s.n;
  for (let i = 0; i < s.n; i++) {
    const x = -L / 2 + 0.06 + cw * (i + 0.5);
    const z0 = zb + s.backT - 0.02;
    const z1 = zb + d - 0.01;
    seatPad(body, cw - 0.01, z1 - z0, cushT + 0.01, up, x, deckY - 0.005, (z0 + z1) / 2, { backStep: 0.15, crown: 0.03, r: 0.07, p: 2.3, wrinkle: 0.002, seed: i + 3, step: 0.1 });
  }
  // plinth / legs (straight segments, bent too)
  if (s.base === 'plinth') {
    const g = body.geo(new THREE.BoxGeometry(L - 0.24, legH, d - 0.3, Math.ceil(L / 0.1), 1, 1), M.matte(c.legs), 0, legH / 2, zc);
    g.castShadow = true;
  }
  const bent = body.g;
  // bend everything around the vertical axis
  const tmp = new THREE.Group();
  tmp.add(bent);
  bendGroupWrapper(tmp, cz, s.R);
  k.add(tmp);
  if (s.base === 'legs') {
    const a = L / 2 / s.R;
    for (const t of [-0.85, -0.3, 0.3, 0.85]) {
      for (const zz of [zb + 0.08, zb + d - 0.08]) {
        const th = t * a;
        const rho = cz - zz;
        taperLegAt(k, rho * Math.sin(th), cz - rho * Math.cos(th), legH, M.metal(c.legs, 0.28, 1));
      }
    }
  }
  // pillows (not bent)
  const accent = M.velvet(c.accent);
  const a = L / 2 / s.R;
  for (const t of [-0.62, 0.62]) {
    const th = t * a;
    const rho = cz - (zb + s.backT + 0.08);
    const kk = new Kit();
    throwPillow(kk, 0.36, accent, 0, 0, 0, t < 0 ? 0.25 : -0.25, 0.42);
    kk.g.rotation.y = -th;
    k.add(kk.g, rho * Math.sin(th), s.seatH - 0.02, cz - rho * Math.cos(th));
  }
  return k.g;
}

function curvedSeats(s: CurvedSpec): SeatAnchor[] {
  const { zb } = curvedDims(s);
  const cz = zb + s.R;
  const out: SeatAnchor[] = [];
  const zSit = zb + s.backT + (s.d - s.backT) * 0.45;
  const cw = (s.L - 0.12) / s.n;
  for (let i = 0; i < s.n; i++) {
    const x = -s.L / 2 + 0.06 + cw * (i + 0.5);
    const th = x / s.R;
    const rho = cz - zSit;
    out.push({ x: +(rho * Math.sin(th)).toFixed(3), z: +(cz - rho * Math.cos(th)).toFixed(3), height: s.seatH, facing: +(-th).toFixed(3), kind: 'sit' });
  }
  return out;
}

function drawCurved(ctx: Ctx2D, s: CurvedSpec, c: Colors): void {
  const { zb } = curvedDims(s);
  const cz = zb + s.R;
  const a = s.L / 2 / s.R;
  sym(ctx, () => {
    const ring = (r0: number, r1: number, fill: string, lw?: number, stroke = '#3a3d42') => {
      ctx.beginPath();
      // canvas angle for point (sin th, -cos th) around (0, cz): angle = -PI/2 + th
      ctx.arc(0, cz, r0, -Math.PI / 2 - a, -Math.PI / 2 + a, false);
      ctx.arc(0, cz, r1, -Math.PI / 2 + a, -Math.PI / 2 - a, true);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = stroke;
      if (lw) ctx.lineWidth = lw;
      ctx.stroke();
    };
    ring(s.R, s.R - s.d, tint(c.fabric, 0.3));
    ring(s.R, s.R - s.backT, tint(c.fabric, 0.2), LINE_THIN, INK_SOFT);
    // seat cushion seams
    const cw = (s.L - 0.12) / s.n;
    for (let i = 1; i < s.n; i++) {
      const th = (-s.L / 2 + 0.06 + cw * i) / s.R;
      D.line(ctx, (s.R - s.backT) * Math.sin(th), cz - (s.R - s.backT) * Math.cos(th), (s.R - s.d) * Math.sin(th), cz - (s.R - s.d) * Math.cos(th), INK_SOFT, LINE_THIN);
    }
  });
}

function curvedDef(id: string, name: string, tags: string[], s: CurvedSpec, fabric: string, legs: string, accent: string): FurnitureDef {
  const dm = curvedDims(s);
  return {
    id,
    name,
    category: 'living',
    group: 'ספות',
    tags,
    size: { w: dm.w, d: dm.D, h: s.backH },
    colors: [slot('fabric', UP_LABEL[s.mat], fabric), slot('legs', s.base === 'plinth' ? 'בסיס' : 'רגליים', legs), slot('accent', 'כריות נוי', accent)],
    seats: curvedSeats(s),
    build: ({ colors: c }) => {
      const o = buildCurved(s, c);
      return o;
    },
    draw2d: (ctx, c) => drawCurved(ctx, s, c),
  };
}

function bendGroupWrapper(g: THREE.Group, cz: number, R: number): void {
  bendGroup(g, cz, R);
}

function taperLegAt(k: Kit, x: number, z: number, h: number, mat: THREE.Material): void {
  k.rod([x, 0, z], [x, h, z], 0.014, mat, 0.022, 10);
}

const CURVED: FurnitureDef[] = [
  curvedDef(
    'sofa-curved-boucle',
    'ספה מעוגלת (סהר) מבוקלה',
    ['מעוגלת', 'סהר', 'בוקלה', 'מודרני', 'קשתית'],
    { L: 2.9, R: 1.75, d: 0.95, seatH: 0.42, backH: 0.74, backT: 0.22, n: 3, mat: 'boucle', base: 'plinth' },
    '#e7e0d3',
    '#3a3633',
    '#b78a6a',
  ),
  curvedDef(
    'sofa-curved-velvet',
    'ספה קשתית מקטיפה עם תעלות',
    ['מעוגלת', 'קשתית', 'קטיפה', 'תעלות', 'גלאם'],
    { L: 2.5, R: 2.2, d: 0.92, seatH: 0.44, backH: 0.78, backT: 0.2, n: 3, mat: 'velvet', channel: true, base: 'legs' },
    '#5b6e8c',
    PAL.brass,
    '#e1c7a4',
  ),
];

/* ================================================================== armchairs from the sofa builder */

const CH = (o: Partial<SofaSpec>): SofaSpec => sp({ n: 1, pillows: 0, w: 0.9, d: 0.9, ...o });

const ARMCHAIRS: SofaItem[] = [
  {
    id: 'armchair-wingback',
    name: 'כורסת כנפיים',
    group: 'כורסאות',
    tags: ['כנפיים', 'קלאסי', 'קריאה', 'אנגלי', 'קטיפה'],
    spec: CH({ w: 0.86, d: 0.9, arm: 'rolled', armW: 0.15, armH: 0.62, backH: 1.08, back: 'tight', backT: 0.13, cushT: 0.15, base: 'turned', legH: 0.17, mat: 'velvet', wings: true, seed: 31 }),
    fabric: '#2f4a6b',
    legs: PAL.darkWood,
  },
  {
    id: 'armchair-club-leather',
    name: 'כורסת קלאב מעור',
    group: 'כורסאות',
    tags: ['קלאב', 'עור', 'קלאסי', 'מועדון', 'וינטג׳'],
    spec: CH({ w: 0.95, d: 0.95, arm: 'round', armW: 0.25, armH: 0.64, backH: 0.8, back: 'tight', backT: 0.17, cushT: 0.17, base: 'bun', legH: 0.06, mat: 'leather', plump: 0.6, seed: 32 }),
    fabric: '#8a4b2a',
    legs: PAL.darkWood,
  },
  {
    id: 'armchair-chesterfield',
    name: "כורסת צ'סטרפילד",
    group: 'כורסאות',
    tags: ["צ'סטרפילד", 'עור', 'כפתורים', 'קפיטונאז׳', 'קלאסי'],
    spec: CH({ w: 1.05, d: 0.9, arm: 'scroll', armW: 0.24, armH: 0.74, backH: 0.74, back: 'tufted', backT: 0.2, cushT: 0.15, base: 'bun', legH: 0.07, mat: 'leather', tuftCols: 4, tuftRows: 3, seed: 33 }),
    fabric: '#3b2622',
    legs: PAL.darkWood,
  },
  {
    id: 'armchair-english',
    name: 'כורסה אנגלית עם ידיות מגולגלות',
    group: 'כורסאות',
    tags: ['אנגלי', 'קלאסי', 'פשתן', 'ידיות מגולגלות'],
    spec: CH({ w: 0.92, d: 0.92, arm: 'rolled', armW: 0.19, armH: 0.6, backH: 0.88, back: 'tight', backT: 0.15, cushT: 0.17, base: 'turned', legH: 0.15, mat: 'linen', pillows: 0, seed: 34 }),
    fabric: '#a9b4a0',
    legs: PAL.walnut,
  },
  {
    id: 'armchair-lawson',
    name: 'כורסת לוסון עם חצאית',
    group: 'כורסאות',
    tags: ['לוסון', 'חצאית', 'כפרי', 'נוח'],
    spec: CH({ w: 0.95, d: 0.95, arm: 'round', armW: 0.19, armH: 0.6, backH: 0.88, back: 'loose', base: 'skirt', legH: 0.15, seed: 35 }),
    fabric: '#d4b98c',
  },
  {
    id: 'armchair-slipper',
    name: 'כורסת סליפר ללא ידיות',
    group: 'כורסאות',
    tags: ['ללא ידיות', 'סליפר', 'קטיפה', 'כפתורים', 'חדר שינה'],
    spec: CH({ w: 0.66, d: 0.78, arm: 'none', armW: 0, armH: 0.5, backH: 0.9, back: 'tufted', backT: 0.12, tuftCols: 3, tuftRows: 2, seat: 'bench', cushT: 0.14, base: 'taper', legH: 0.18, seatH: 0.44, mat: 'velvet', seed: 36 }),
    fabric: '#c99a3c',
    legs: PAL.walnut,
  },
  {
    id: 'armchair-recliner',
    name: 'כורסת טלוויזיה נפתחת (ריקליינר)',
    group: 'כורסאות',
    tags: ['ריקליינר', 'כורסת טלוויזיה', 'עור', 'נוח', 'מתכווננת'],
    spec: CH({ w: 0.95, d: 0.98, arm: 'round', armW: 0.22, armH: 0.62, backH: 1.04, back: 'rows', backT: 0.16, cushT: 0.18, base: 'plinth', legH: 0.06, mat: 'leather', plump: 0.7, seat: 'bench', seed: 37 }),
    fabric: '#5a3d2b',
    legs: '#2a2522',
    extra: (k, c) => {
      // release lever on the outside of the right arm, footrest seam across the front
      const m = M.metal('#2b2b2d', 0.4, 0.6);
      k.rbox(0.012, 0.1, 0.03, 0.004, m, 0.466, 0.27, 0.22, 1);
      k.box(0.82, 0.006, 0.004, M.matte(darken(c.fabric, 0.4)), 0, 0.24, 0.49);
    },
  },
];

/* ================================================================== futon & daybed */

const futon: FurnitureDef = {
  id: 'sofa-futon',
  name: 'ספת פוטון',
  category: 'living',
  group: 'ספות',
  tags: ['פוטון', 'מזרן', 'ספה נפתחת', 'יפני', 'עץ'],
  size: { w: 1.95, d: 1.0, h: 0.86 },
  colors: [slot('fabric', 'מזרן', '#35424f'), slot('wood', 'מסגרת עץ', PAL.oakLight)],
  seats: [-0.55, 0, 0.55].map((x) => ({ x, z: 0.15, height: 0.44, facing: 0, kind: 'sit' as const })),
  build: ({ colors: c }) => {
    const k = new Kit();
    const wood = M.wood(c.wood);
    const fab = M.fabric(c.fabric, 12);
    const tie = M.fabric(darken(c.fabric, 0.25), 12);
    const w = 1.95;
    const d = 0.92;
    // side frames: posts, arm board, rails, slats
    for (const sx of [-1, 1]) {
      const x = sx * (w / 2 - 0.035);
      for (const z of [-d / 2 + 0.035, d / 2 - 0.035]) k.rbox(0.05, 0.6, 0.05, 0.008, wood, x, 0, z, 1);
      k.rbox(0.09, 0.035, d, 0.012, wood, sx * (w / 2 - 0.045), 0.6, 0, 1);
      for (const y of [0.12, 0.3]) k.rbox(0.035, 0.05, d - 0.08, 0.006, wood, x, y, 0, 1);
      for (let i = 0; i < 4; i++) k.box(0.02, 0.25, 0.04, wood, x, 0.34, -d / 2 + 0.17 + i * ((d - 0.34) / 3));
    }
    // seat rails and slatted deck
    for (const z of [-0.3, d / 2 - 0.03]) k.rbox(w - 0.1, 0.07, 0.035, 0.006, wood, 0, 0.2, z, 1);
    for (let i = 0; i < 7; i++) k.box(w - 0.12, 0.018, 0.06, wood, 0, 0.27, -0.27 + i * 0.1);
    // back frame (reclined)
    const lean = 0.32;
    for (const sx of [-1, 1]) k.beam([sx * (w / 2 - 0.1), 0.27, -0.33], [sx * (w / 2 - 0.1), 0.82, -0.33 - 0.55 * Math.tan(lean)], 0.05, 0.04, wood, 0.006);
    k.beam([-(w / 2 - 0.1), 0.79, -0.33 - 0.52 * Math.tan(lean)], [w / 2 - 0.1, 0.79, -0.33 - 0.52 * Math.tan(lean)], 0.05, 0.035, wood, 0.006);
    // folded mattress: seat + back with ties
    const mw = w - 0.2;
    const sd = 0.74;
    const tuftsS: Array<[number, number]> = [];
    const tuftsB: Array<[number, number]> = [];
    for (let i = 0; i < 4; i++) {
      const x = -mw / 2 + (mw * (i + 0.5)) / 4;
      tuftsS.push([x, 0.08], [x, -0.18]);
      tuftsB.push([x, 0.0]);
    }
    seatPad(k, mw, sd, 0.16, fab, 0, 0.285, 0.1, { crown: 0.015, r: 0.07, p: 2.0, tufts: tuftsS, tuftDepth: 0.03, tuftR: 0.04, step: 0.12, wrinkle: 0.003 }, { buttons: tie, buttonR: 0.014 });
    backPad(k, mw, 0.5, 0.15, lean, fab, 0, 0.36, -0.36, { crown: 0.015, r: 0.07, p: 2.0, tufts: tuftsB, tuftDepth: 0.03, tuftR: 0.04, step: 0.12, wrinkle: 0.003 }, 0, { buttons: tie, buttonR: 0.014 });
    // rounded fold between seat and back
    const kk = new Kit();
    bolster(kk, mw, 0.08, fab, 0, 0, 0);
    k.add(kk.g, 0, 0.375, -0.27);
    k.g.position.z = 0.03;
    const out = new THREE.Group();
    out.add(k.g);
    return out;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const w = 1.95;
      const d = 0.92;
      D.box(ctx, -w / 2, -d / 2, -w / 2 + 0.09, d / 2, 0.01, tint(c.wood, 0.3));
      D.box(ctx, w / 2 - 0.09, -d / 2, w / 2, d / 2, 0.01, tint(c.wood, 0.3));
      D.box(ctx, -w / 2 + 0.1, -0.45, w / 2 - 0.1, -0.24, 0.05, tint(c.fabric, 0.42), INK_SOFT, LINE_THIN);
      D.box(ctx, -w / 2 + 0.1, -0.27, w / 2 - 0.1, 0.47, 0.06, tint(c.fabric, 0.5));
      for (let i = 0; i < 4; i++) {
        const x = -(w - 0.2) / 2 + ((w - 0.2) * (i + 0.5)) / 4;
        D.circle(ctx, x, 0.02, 0.012, tint(c.fabric, 0.1), null);
        D.circle(ctx, x, 0.28, 0.012, tint(c.fabric, 0.1), null);
      }
    }),
};

const daybed: FurnitureDef = {
  id: 'sofa-daybed',
  name: 'ספת דייבד',
  category: 'living',
  group: 'ספות',
  tags: ['דייבד', 'מיטת יום', 'שכיבה', 'עץ', 'אירוח'],
  size: { w: 2.06, d: 0.96, h: 0.89 },
  colors: [slot('fabric', 'מזרן', '#e9e3d6'), slot('wood', 'מסגרת', '#3d3a36'), slot('accent', 'כריות', '#8fa3a0')],
  seats: [
    { x: 0, z: 0.05, height: 0.48, facing: Math.PI / 2, kind: 'lie' },
    { x: -0.55, z: 0.15, height: 0.48, facing: 0, kind: 'sit' },
    { x: 0.55, z: 0.15, height: 0.48, facing: 0, kind: 'sit' },
  ],
  build: ({ colors: c }) => {
    const k = new Kit();
    const wood = M.wood(c.wood, 0.5);
    const fab = M.linen(c.fabric);
    const acc = M.linen(c.accent);
    const w = 2.06;
    const d = 0.96;
    const H = 0.86;
    // corner posts with ball finials
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const x = sx * (w / 2 - 0.03);
        const z = sz * (d / 2 - 0.03);
        const ph = sz < 0 ? H - 0.05 : 0.68;
        k.rbox(0.05, ph, 0.05, 0.008, wood, x, 0, z, 1);
        k.sphere(0.03, wood, x, ph + 0.022, z, 1, 0.8, 1, 10);
      }
    }
    // rails + spindles: back and both ends
    const rail = (a: [number, number], b: [number, number], y: number) => k.beam([a[0], y, a[1]], [b[0], y, b[1]], 0.035, 0.03, wood, 0.005);
    const xb = w / 2 - 0.03;
    const zb = -d / 2 + 0.03;
    const zf = d / 2 - 0.03;
    rail([-xb, zb], [xb, zb], H - 0.1);
    rail([-xb, zb], [xb, zb], 0.3);
    for (const sx of [-1, 1]) {
      rail([sx * xb, zb], [sx * xb, zf], 0.62);
      rail([sx * xb, zb], [sx * xb, zf], 0.3);
      for (let i = 1; i < 7; i++) {
        const z = zb + ((zf - zb) * i) / 7;
        k.rod([sx * xb, 0.33, z], [sx * xb, 0.62, z], 0.009, wood, 0.009, 6);
      }
    }
    for (let i = 1; i < 13; i++) {
      const x = -xb + ((2 * xb) * i) / 13;
      k.rod([x, 0.33, zb], [x, H - 0.1, zb], 0.009, wood, 0.009, 6);
    }
    // front rail + deck
    rail([-xb, zf], [xb, zf], 0.27);
    k.box(w - 0.1, 0.03, d - 0.1, M.matte('#4b4743'), 0, 0.27, 0);
    // mattress with piping
    seatPad(k, w - 0.1, d - 0.1, 0.19, fab, 0, 0.29, 0, { crown: 0.012, r: 0.05, p: 3.2, step: 0.2, wrinkle: 0.002 });
    // back cushions and bolsters
    for (const x of [-0.6, 0, 0.6]) backPad(k, 0.56, 0.42, 0.16, 0.2, acc, x, 0.46, zb + 0.08, { crown: 0.03, r: 0.07, step: 0.2, wrinkle: 0.003, seed: x * 9 + 2 });
    for (const sx of [-1, 1]) {
      const kk = new Kit();
      bolster(kk, 0.5, 0.1, fab, 0, 0, 0, M.linen(darken(c.fabric, 0.15)));
      kk.g.rotation.y = Math.PI / 2;
      k.add(kk.g, sx * (w / 2 - 0.16), 0.575, 0.08);
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const w = 2.06;
      const d = 0.96;
      D.box(ctx, -w / 2, -d / 2, w / 2, d / 2, 0.01, tint(c.wood, 0.55));
      D.box(ctx, -w / 2 + 0.05, -d / 2 + 0.05, w / 2 - 0.05, d / 2 - 0.05, 0.04, tint(c.fabric, 0.3));
      for (const x of [-0.6, 0, 0.6]) D.box(ctx, x - 0.27, -d / 2 + 0.07, x + 0.27, -d / 2 + 0.25, 0.05, tint(c.accent, 0.3), INK_SOFT, LINE_THIN);
      for (const sx of [-1, 1]) D.box(ctx, sx * (w / 2 - 0.26), -0.17, sx * (w / 2 - 0.06), 0.33, 0.08, tint(c.fabric, 0.15), INK_SOFT, LINE_THIN);
    }),
};

/** Wrap a built object in a group shifted along Z (re-centres asymmetric chairs on their footprint). */
function shiftZ(o: THREE.Object3D, dz: number): THREE.Object3D {
  const g = new THREE.Group();
  o.position.z += dz;
  g.add(o);
  return g;
}

/** Plan symbol clipped to the footprint and shifted along Z (matches `shiftZ`). */
function symShift(ctx: Ctx2D, w: number, d: number, dz: number, fn: () => void): void {
  sym(ctx, () => {
    ctx.beginPath();
    ctx.rect(-w / 2, -d / 2, w, d);
    ctx.clip();
    ctx.translate(0, dz);
    fn();
  });
}

/* ================================================================== tub / barrel / swivel chairs */

interface TubSpec {
  /** outer radius of the wrap-around back */
  R: number;
  /** wrap angle (radians) */
  wrap: number;
  seatH: number;
  hBack: number;
  hArm: number;
  thick: number;
  channels?: boolean;
  mat: UpKind;
  base: 'legs' | 'plinth' | 'swivel';
  /** seat cushion radius */
  rs: number;
  plump?: number;
}

function tubDims(s: TubSpec): { w: number; d: number; dz: number } {
  const a = s.wrap / 2;
  const zmax = Math.max(s.rs, s.R - 0.03, -s.R * Math.cos(a) + 0.02);
  const w = a >= Math.PI / 2 ? 2 * s.R : 2 * s.R * Math.sin(a);
  return { w: +w.toFixed(3), d: +(s.R + zmax).toFixed(3), dz: -(zmax - s.R) / 2 };
}

function buildTub(s: TubSpec, c: Colors): THREE.Object3D {
  const k = new Kit();
  const { dz } = tubDims(s);
  const up = upMat(s.mat, c.fabric);
  const legH = s.base === 'legs' ? 0.16 : s.base === 'plinth' ? 0.05 : 0.11;
  const L = s.R * s.wrap;
  const bh = s.hBack - legH - 0.01;
  const plump = s.plump ?? 0;
  const o: Parameters<typeof padGeo>[2] = { t: s.thick * 0.6, tB: s.thick * 0.4, backStep: 0.1, r: 0.06 + plump * 0.03, p: 2.2, step: 0.07, eN: 3, crown: 0.01, wrinkle: 0.0025, seed: 3 };
  if (s.channels) {
    const nc = Math.round(L / 0.11);
    o.channels = Array.from({ length: nc - 1 }, (_, i) => -L / 2 + (L * (i + 1)) / nc);
    o.grooveDepth = 0.03;
    o.grooveW = 0.018;
  }
  const pad = padGeo(L, bh, o);
  // lower the back towards the arm ends
  const armF = (s.hArm - legH) / bh;
  const pos = pad.geo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const t = Math.min(1, Math.abs(pos.getX(i)) / (L / 2));
    const e = t < 0.3 ? 0 : (t - 0.3) / 0.7;
    const f = 1 - (1 - armF) * (e * e * (3 - 2 * e));
    pos.setY(i, -bh / 2 + (pos.getY(i) + bh / 2) * f);
  }
  pad.geo.computeVertexNormals();
  const body = new Kit();
  body.geo(pad.geo, up, 0, legH + 0.01 + bh / 2, -s.R + s.thick * 0.4);
  bendGroup(body.g, 0, s.R);
  k.add(body.g, 0, 0, dz);
  // deck + round seat cushion
  const cushT = 0.15 + plump * 0.04;
  const deckY = s.seatH - cushT;
  k.lathe(roundCushionProfile(s.R - 0.03, deckY - legH, 0), up, 0, legH, dz, 28);
  k.lathe(roundCushionProfile(s.rs, cushT + 0.01, 0.02 + plump * 0.02), up, 0, deckY - 0.005, dz + 0.0, 28);
  const lm = M.metal(c.legs, 0.3, 1);
  if (s.base === 'legs') {
    const wm = M.wood(c.legs);
    for (const a of [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4]) {
      const r = s.R * 0.68;
      taperLegSplay(k, Math.sin(a) * r, dz + Math.cos(a) * r, legH, wm, Math.sin(a) * 0.03, Math.cos(a) * 0.03);
    }
  } else if (s.base === 'plinth') {
    k.cyl(s.R * 0.78, legH, M.matte(c.legs), 0, 0, dz, s.R * 0.78, 28);
  } else {
    k.lathe([[0, 0], [0.3, 0], [0.3, 0.008], [0.27, 0.02], [0.05, 0.03], [0.04, 0.035], [0, 0.035]], lm, 0, 0, dz, 28);
    k.cyl(0.035, legH - 0.03, lm, 0, 0.03, dz, 0.035, 14);
    k.cyl(0.14, 0.012, lm, 0, legH - 0.012, dz, 0.14, 20);
  }
  return k.g;
}

function taperLegSplay(k: Kit, x: number, z: number, h: number, mat: THREE.Material, sx: number, sz: number): void {
  k.rod([x + sx, 0.006, z + sz], [x, h, z], 0.012, mat, 0.021, 10);
}

function tubDef(id: string, name: string, tags: string[], s: TubSpec, fabric: string, legs: string): FurnitureDef {
  const dm = tubDims(s);
  return {
    id,
    name,
    category: 'living',
    group: 'כורסאות',
    tags,
    size: { w: dm.w, d: dm.d, h: s.hBack },
    colors: [slot('fabric', UP_LABEL[s.mat], fabric), slot('legs', s.base === 'legs' ? 'רגליים' : 'בסיס', legs)],
    seats: [{ x: 0, z: +(dm.dz + 0.06).toFixed(3), height: s.seatH, facing: 0, kind: 'sit' }],
    build: ({ colors: c }) => buildTub(s, c),
    draw2d: (ctx, c) =>
      sym(ctx, () => {
        const a = s.wrap / 2;
        const cz = dm.dz;
        D.circle(ctx, 0, cz, s.rs, tint(c.fabric, 0.5));
        ctx.beginPath();
        ctx.arc(0, cz, s.R, Math.PI / 2 + a, Math.PI / 2 - a + 2 * Math.PI, false);
        ctx.arc(0, cz, s.R - s.thick, Math.PI / 2 - a + 2 * Math.PI, Math.PI / 2 + a, true);
        ctx.closePath();
        ctx.fillStyle = tint(c.fabric, 0.25);
        ctx.fill();
        ctx.stroke();
      }),
  };
}

const TUBS: FurnitureDef[] = [
  tubDef('armchair-barrel', 'כורסת חבית עם תפרי תעלות', ['חבית', 'קטיפה', 'תעלות', 'מעוגלת', 'גלאם'], { R: 0.4, wrap: 4.0, seatH: 0.45, hBack: 0.78, hArm: 0.62, thick: 0.13, channels: true, mat: 'velvet', base: 'legs', rs: 0.34 }, '#a8574a', PAL.walnut),
  tubDef('armchair-boucle', 'כורסת בוקלה מעוגלת', ['בוקלה', 'מעוגלת', 'אמבט', 'מודרני', 'רכה'], { R: 0.42, wrap: 4.3, seatH: 0.42, hBack: 0.7, hArm: 0.6, thick: 0.18, mat: 'boucle', base: 'plinth', rs: 0.36, plump: 1 }, '#efe9de', '#c9b8a0'),
  tubDef('armchair-swivel', 'כורסה מסתובבת עגולה', ['מסתובבת', 'עגולה', 'בד', 'מודרני'], { R: 0.4, wrap: 3.7, seatH: 0.45, hBack: 0.8, hArm: 0.6, thick: 0.12, mat: 'fabric', base: 'swivel', rs: 0.36, plump: 0.4 }, '#5c7a8a', '#c9ccce'),
];

/* ================================================================== shell lounge chair + ottoman */

function shellPanel(radius: number, thick: number, height: number, arc: number): THREE.BufferGeometry {
  return arcPanelGeo(radius, thick, height, arc, 12);
}

function buildStarBase(k: Kit, n: number, r: number, h: number, mat: THREE.Material): void {
  k.cyl(0.032, h - 0.04, mat, 0, 0.04, 0, 0.028, 14);
  k.cyl(0.05, 0.04, mat, 0, 0.03, 0, 0.04, 14);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.PI / n;
    const x = Math.sin(a) * r;
    const z = Math.cos(a) * r;
    k.beam([Math.sin(a) * 0.03, 0.05, Math.cos(a) * 0.03], [x, 0.022, z], 0.04, 0.022, mat, 0.006);
    k.cyl(0.018, 0.012, M.rubber(), x, 0, z, 0.016, 10);
  }
}

const shellLounge: FurnitureDef = {
  id: 'lounge-shell',
  name: 'כורסת מעטפת מעץ ועור',
  category: 'living',
  group: 'כסאות נוח',
  tags: ['כורסת מעצבים', 'עור', 'דיקט', 'מסתובבת', 'מיד-סנצ׳ורי', 'טרקלין'],
  size: { w: 0.84, d: 0.84, h: 0.88 },
  colors: [slot('fabric', 'עור', '#1f1c1b'), slot('wood', 'מעטפת עץ', '#5a3423'), slot('legs', 'בסיס', '#2a2b2e')],
  seats: [{ x: 0, z: 0.14, height: 0.42, facing: 0, kind: 'sit' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const lea = M.leather(c.fabric);
    const ply = M.wood(c.wood, 0.4);
    const met = M.metal(c.legs, 0.35, 0.9);
    buildStarBase(k, 5, 0.36, 0.3, met);
    // seat: shell + cushion, slightly reclined
    const seat = new Kit();
    const sg = shellPanel(0.62, 0.016, 0.6, 1.1);
    sg.rotateX(-Math.PI / 2);
    sg.translate(0, 0, 0.3);
    seat.geo(sg, ply);
    addPad(seat, 0.56, 0.54, { t: 0.06, tB: 0.03, r: 0.05, p: 2.4, crown: 0.02, rows: [0.02], grooveDepth: 0.035, grooveW: 0.02, step: 0.12, wrinkle: 0.003, seed: 3 }, lea, 0, 0.05, 0.02, { rx: -Math.PI / 2 });
    seat.g.rotation.x = -0.12;
    k.add(seat.g, 0, 0.31, 0.05);
    // back shell + cushion, reclined, and headrest
    const back = new Kit();
    back.geo(shellPanel(0.55, 0.016, 0.42, 1.3), ply, 0, 0, 0.0);
    addPad(back, 0.6, 0.38, { t: 0.06, tB: 0.03, r: 0.05, p: 2.4, crown: 0.02, rows: [0.0], grooveDepth: 0.035, grooveW: 0.02, step: 0.12, wrinkle: 0.003, seed: 5 }, lea, 0, 0.21, 0.05, {});
    back.g.rotation.x = -0.42;
    k.add(back.g, 0, 0.44, -0.26);
    const head = new Kit();
    head.geo(shellPanel(0.5, 0.016, 0.2, 1.15), ply);
    addPad(head, 0.5, 0.17, { t: 0.055, tB: 0.03, r: 0.05, p: 2.4, crown: 0.015, step: 0.12, wrinkle: 0.003, seed: 7 }, lea, 0, 0.1, 0.045, {});
    head.g.rotation.x = -0.3;
    k.add(head.g, 0, 0.66, -0.41);
    // aluminium spine joining back and headrest
    k.beam([0, 0.33, -0.2], [0, 0.82, -0.42], 0.05, 0.012, met, 0.004);
    // arm rests on brackets
    for (const sx of [-1, 1]) {
      k.beam([sx * 0.33, 0.36, -0.1], [sx * 0.37, 0.56, -0.05], 0.03, 0.012, met, 0.003);
      const a = k.rbox(0.075, 0.045, 0.32, 0.018, lea, sx * 0.375, 0.56, 0.02, 2);
      a.rotation.x = 0.06;
    }
    return shiftZ(k.g, 0.067);
  },
  draw2d: (ctx, c) =>
    symShift(ctx, 0.84, 0.84, 0.067, () => {
      D.circle(ctx, 0, 0.02, 0.36, null, INK_SOFT, LINE_THIN);
      D.rr(ctx, 0, 0.06, 0.62, 0.58, 0.14, tint(c.wood, 0.35));
      D.rr(ctx, 0, 0.06, 0.54, 0.5, 0.1, tint(c.fabric, 0.45), INK_SOFT, LINE_THIN);
      D.rr(ctx, 0, -0.3, 0.6, 0.2, 0.08, tint(c.fabric, 0.4));
      for (const sx of [-1, 1]) D.rr(ctx, sx * 0.375, 0.02, 0.075, 0.32, 0.03, tint(c.fabric, 0.35));
    }),
};

const shellOttoman: FurnitureDef = {
  id: 'ottoman-shell',
  name: 'הדום מעטפת תואם',
  category: 'living',
  group: 'הדומים וספסלים',
  tags: ['הדום', 'עור', 'דיקט', 'מסתובב', 'מיד-סנצ׳ורי'],
  size: { w: 0.66, d: 0.56, h: 0.42 },
  colors: [slot('fabric', 'עור', '#1f1c1b'), slot('wood', 'מעטפת עץ', '#5a3423'), slot('legs', 'בסיס', '#2a2b2e')],
  seats: [{ x: 0, z: 0, height: 0.42, facing: 0, kind: 'sit' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const lea = M.leather(c.fabric);
    const met = M.metal(c.legs, 0.35, 0.9);
    buildStarBase(k, 4, 0.27, 0.27, met);
    const seat = new Kit();
    const sg = shellPanel(0.6, 0.016, 0.5, 1.05);
    sg.rotateX(-Math.PI / 2);
    sg.translate(0, 0, 0.25);
    seat.geo(sg, M.wood(c.wood, 0.4));
    addPad(seat, 0.56, 0.46, { t: 0.06, tB: 0.03, r: 0.05, p: 2.4, crown: 0.02, rows: [0.0], grooveDepth: 0.03, grooveW: 0.02, step: 0.12, wrinkle: 0.003 }, lea, 0, 0.05, 0.0, { rx: -Math.PI / 2 });
    seat.g.rotation.x = 0.08;
    k.add(seat.g, 0, 0.28, 0);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 0.62, 0.52, 0.12, tint(c.wood, 0.35));
      D.rr(ctx, 0, 0, 0.54, 0.44, 0.09, tint(c.fabric, 0.45), INK_SOFT, LINE_THIN);
      D.line(ctx, -0.25, 0, 0.25, 0, INK_SOFT, LINE_THIN);
    }),
};

/* ================================================================== butterfly sling chair */

const butterfly: FurnitureDef = {
  id: 'lounge-butterfly',
  name: 'כיסא פרפר עם בד תלוי',
  category: 'living',
  group: 'כסאות נוח',
  tags: ['פרפר', 'סלינג', 'עור', 'מתכת', 'רטרו'],
  size: { w: 0.86, d: 0.78, h: 0.94 },
  colors: [slot('fabric', 'עור', '#9a5a32'), slot('legs', 'מסגרת', '#1e1f22')],
  seats: [{ x: 0, z: 0.02, height: 0.36, facing: 0, kind: 'sit' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const met = M.metal(c.legs, 0.45, 0.8);
    const lea = M.leather(c.fabric);
    const FT = 0.37;
    const BT = -0.36;
    // sling: front-top corners -> deep seat -> back-top corners
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.56, FT),
      new THREE.Vector3(0, 0.38, 0.17),
      new THREE.Vector3(0, 0.3, -0.04),
      new THREE.Vector3(0, 0.5, -0.27),
      new THREE.Vector3(0, 0.92, BT),
    ]);
    const nu = 12;
    const nv = 20;
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    const pts = curve.getSpacedPoints(nv);
    let acc = 0;
    for (let sheet = 0; sheet < 2; sheet++) {
      const base = pos.length / 3;
      acc = 0;
      for (let j = 0; j <= nv; j++) {
        const v = j / nv;
        const p = pts[j];
        if (j > 0) acc += p.distanceTo(pts[j - 1]);
        const hw = 0.27 + 0.13 * Math.pow(2 * v - 1, 2);
        for (let i = 0; i <= nu; i++) {
          const u = (i / nu) * 2 - 1;
          const sag = (0.05 * (1 - u * u) * Math.sin(Math.PI * v)) + 0.02 * (1 - u * u);
          const y = p.y - sag - sheet * 0.005;
          const z = p.z + (v < 0.5 ? -0.02 : 0.02) * (1 - u * u);
          pos.push(u * hw, y, z);
          uv.push(u * hw, acc);
        }
      }
      for (let j = 0; j < nv; j++) {
        for (let i = 0; i < nu; i++) {
          const a = base + j * (nu + 1) + i;
          const b = a + 1;
          const cc = a + nu + 2;
          const d = a + nu + 1;
          if (sheet === 0) idx.push(a, cc, b, a, d, cc);
          else idx.push(a, b, cc, a, cc, d);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    k.geo(g, lea);
    // frame: two bent rods, each a loop on one side, joined by floor stretchers
    const r = 0.009;
    for (const sx of [-1, 1]) {
      k.tube(
        [
          [sx * 0.4, 0.56, FT + 0.005],
          [sx * 0.41, 0.3, FT + 0.01],
          [sx * 0.41, r + 0.014, FT - 0.04],
          [sx * 0.41, r + 0.002, 0.0],
          [sx * 0.41, r + 0.014, BT + 0.06],
          [sx * 0.41, 0.4, BT + 0.02],
          [sx * 0.4, 0.92, BT],
        ],
        r,
        met,
        { seg: 40, radial: 6, tension: 0.2 },
      );
      // corner pockets
      k.sphere(0.018, lea, sx * 0.4, 0.55, FT - 0.005, 1, 1, 1, 8);
      k.sphere(0.018, lea, sx * 0.4, 0.91, BT + 0.01, 1, 1, 1, 8);
    }
    k.rod([-0.41, r, FT - 0.04], [0.41, r, FT - 0.04], r, met, r, 6);
    k.rod([-0.41, r, BT + 0.06], [0.41, r, BT + 0.06], r, met, r, 6);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.poly(ctx, [[-0.4, 0.37], [0.4, 0.37], [0.27, 0.0], [0.4, -0.37], [-0.4, -0.37], [-0.27, 0.0]], true, tint(c.fabric, 0.4));
      D.line(ctx, -0.41, -0.33, -0.41, 0.36, INK_SOFT, LINE_THIN);
      D.line(ctx, 0.41, -0.33, 0.41, 0.36, INK_SOFT, LINE_THIN);
    }),
};

/* ================================================================== egg chair (pod) */

const eggChair: FurnitureDef = {
  id: 'lounge-egg',
  name: 'כורסת ביצה מסתובבת',
  category: 'living',
  group: 'כסאות נוח',
  tags: ['ביצה', 'פוד', 'מסתובבת', 'מעצבים', 'רטרו'],
  size: { w: 0.86, d: 0.76, h: 1.1 },
  colors: [slot('shell', 'מעטפת', '#f2f0ea'), slot('fabric', 'ריפוד', '#c0392b'), slot('legs', 'בסיס', '#c9ccce')],
  seats: [{ x: 0, z: 0.1, height: 0.45, facing: 0, kind: 'sit' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const shellM = M.lacquer(c.shell);
    const fab = M.fabric(c.fabric, 16);
    const met = M.metal(c.legs, 0.25, 1);
    const sh = shellGeos({
      rx: 0.43,
      ry: 0.53,
      rz: 0.41,
      thMax: 2.45,
      thick: 0.035,
      open: (th) => (th < 0.62 || th > 2.4 ? 0 : 1.25 * Math.pow(Math.sin((Math.PI * (th - 0.62)) / 1.78), 0.55)),
      rows: 18,
      cols: 26,
    });
    const cy = 0.57;
    k.geo(sh.outer, shellM, 0, cy, -0.0);
    k.geo(sh.inner, fab, 0, cy, -0.0);
    k.geo(sh.rim, shellM, 0, cy, -0.0);
    // seat cushion and lumbar cushion
    k.lathe(roundCushionProfile(0.3, 0.09, 0.02), fab, 0, 0.36, 0.03, 24);
    backPad(k, 0.42, 0.3, 0.1, 0.25, fab, 0, 0.45, -0.27, { crown: 0.03, r: 0.06, step: 0.12 });
    // swivel star base
    k.cyl(0.04, 0.25, met, 0, 0.02, 0, 0.04, 14);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      k.beam([0, 0.035, 0], [Math.sin(a) * 0.36, 0.022, Math.cos(a) * 0.36], 0.05, 0.022, met, 0.006);
    }
    return shiftZ(k.g, 0.04);
  },
  draw2d: (ctx, c) =>
    symShift(ctx, 0.86, 0.76, 0.04, () => {
      D.ellipse(ctx, 0, 0, 0.43, 0.41, tint(c.shell, 0.1));
      D.ellipse(ctx, 0, 0, 0.39, 0.37, tint(c.fabric, 0.45), INK_SOFT, LINE_THIN);
      D.circle(ctx, 0, 0.03, 0.29, tint(c.fabric, 0.55), INK_SOFT, LINE_THIN);
      ctx.fillStyle = '#ffffff';
      D.poly(ctx, [[-0.4, 0.16], [0.4, 0.16], [0.3, 0.41], [-0.3, 0.41]], true, tint(c.fabric, 0.6), null);
      D.arc(ctx, 0, 0, 0.43, Math.PI * 0.2, Math.PI * 0.8, INK_SOFT, LINE_THIN);
    }),
};

/* ================================================================== papasan */

const papasan: FurnitureDef = {
  id: 'lounge-papasan',
  name: 'כורסת פפסן מראטן',
  category: 'living',
  group: 'כסאות נוח',
  tags: ['פפסן', 'ראטן', 'קש', 'בוהו', 'קערה', 'כרית'],
  size: { w: 1.14, d: 1.1, h: 0.86 },
  colors: [slot('frame', 'ראטן', '#b8925f'), slot('fabric', 'כרית', '#c96b4a')],
  seats: [{ x: 0, z: 0.1, height: 0.45, facing: 0, kind: 'sit' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const wick = M.wicker(c.frame);
    const cane = M.rattan(darken(c.frame, 0.1));
    const fab = M.fabric(c.fabric, 12);
    // pedestal drum
    k.lathe([[0, 0], [0.3, 0], [0.31, 0.02], [0.25, 0.15], [0.28, 0.28], [0.27, 0.3], [0, 0.3]], wick, 0, 0, 0, 24);
    k.ring(0.3, 0.015, cane, 0, 0.015, 0, 24);
    k.ring(0.275, 0.013, cane, 0, 0.285, 0, 24);
    // tilted bowl
    const bowl = new Kit();
    const R = 0.55;
    const prof: Array<[number, number]> = [];
    for (let i = 0; i <= 8; i++) {
      const r = (R * i) / 8;
      prof.push([r, 0.34 * Math.pow(r / R, 2) - 0.02]);
    }
    const inner: Array<[number, number]> = [];
    for (let i = 8; i >= 0; i--) {
      const r = ((R - 0.02) * i) / 8;
      inner.push([r, 0.34 * Math.pow(r / R, 2)]);
    }
    bowl.lathe([...prof, ...inner], wick, 0, 0, 0, 24);
    bowl.ring(R - 0.005, 0.022, cane, 0, 0.33, 0, 32);
    // radial ribs under the bowl
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const pts: V3[] = [];
      for (let j = 0; j <= 4; j++) {
        const r = 0.08 + ((R - 0.08) * j) / 4;
        pts.push([Math.sin(a) * r, 0.34 * Math.pow(r / R, 2) - 0.03, Math.cos(a) * r]);
      }
      bowl.tube(pts, 0.01, cane, { seg: 10, radial: 4 });
    }
    // dished cushion
    const cp: Array<[number, number]> = [];
    const Rc = 0.52;
    for (let i = 0; i <= 7; i++) {
      const r = (Rc * i) / 7;
      cp.push([r, 0.34 * Math.pow(r / R, 2) + 0.004]);
    }
    cp.push([Rc + 0.02, 0.34 * Math.pow(Rc / R, 2) + 0.07]);
    for (let i = 7; i >= 0; i--) {
      const r = (Rc * i) / 7;
      cp.push([r, 0.34 * Math.pow(r / R, 2) + 0.13 - 0.02 * Math.exp(-r * r * 60) + 0.02 * Math.sin(r * 18) * 0.3]);
    }
    bowl.lathe(cp, fab, 0, 0, 0, 24);
    bowl.sphere(0.018, M.fabric(darken(c.fabric, 0.2), 12), 0, 0.12, 0, 1, 0.5, 1, 8);
    bowl.g.rotation.x = -0.26;
    k.add(bowl.g, 0, 0.3, 0.0);
    return shiftZ(k.g, 0.085);
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.ellipse(ctx, 0, 0, 0.566, 0.545, tint(c.frame, 0.35));
      D.ellipse(ctx, 0, 0.02, 0.5, 0.48, tint(c.fabric, 0.45), INK_SOFT, LINE_THIN);
      D.circle(ctx, 0, 0.05, 0.02, tint(c.fabric, 0.1), null);
    }),
};

/* ================================================================== Scandinavian lounge chair */

const scandiLounge: FurnitureDef = {
  id: 'lounge-scandi',
  name: 'כורסת טרקלין סקנדינבית עם ידיות עץ',
  category: 'living',
  group: 'כסאות נוח',
  tags: ['סקנדינבי', 'עץ', 'טיק', 'נורדי', 'מיד-סנצ׳ורי'],
  size: { w: 0.74, d: 0.84, h: 0.86 },
  colors: [slot('fabric', 'ריפוד', '#7c8a6e'), slot('wood', 'עץ', PAL.teak)],
  seats: [{ x: 0, z: 0.1, height: 0.42, facing: 0, kind: 'sit' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const wood = M.wood(c.wood, 0.45);
    const fab = M.linen(c.fabric);
    const w = 0.74;
    for (const sx of [-1, 1]) {
      const x = sx * (w / 2 - 0.05);
      // front leg, raked back leg, side rail and the wide floating arm
      k.beam([x + sx * 0.012, 0.004, 0.34], [x, 0.57, 0.3], 0.042, 0.042, wood, 0.008);
      k.beam([x + sx * 0.012, 0.004, -0.38], [x, 0.57, -0.2], 0.042, 0.042, wood, 0.008);
      k.beam([x, 0.26, 0.3], [x, 0.26, -0.27], 0.03, 0.05, wood, 0.006);
      k.rbox(0.085, 0.024, 0.76, 0.011, wood, sx * (w / 2 - 0.0425), 0.57, -0.01, 2);
    }
    for (const z of [0.3, -0.27]) k.rbox(w - 0.12, 0.05, 0.028, 0.006, wood, 0, 0.24, z, 1);
    // back posts (raked) + top rail
    const lean = 0.36;
    for (const sx of [-1, 1]) k.beam([sx * 0.27, 0.27, -0.25], [sx * 0.27, 0.8, -0.25 - 0.53 * Math.tan(lean)], 0.035, 0.03, wood, 0.006);
    k.beam([-0.27, 0.74, -0.25 - 0.47 * Math.tan(lean)], [0.27, 0.74, -0.25 - 0.47 * Math.tan(lean)], 0.05, 0.022, wood, 0.006);
    // webbing + cushions
    const seat = new Kit();
    seatPad(seat, 0.6, 0.58, 0.13, fab, 0, 0, 0, { crown: 0.02, r: 0.05, p: 2.6, step: 0.15, wrinkle: 0.003, seed: 2 });
    seat.g.rotation.x = -0.07;
    k.add(seat.g, 0, 0.285, 0.02);
    backPad(k, 0.54, 0.5, 0.12, lean, fab, 0, 0.36, -0.235, { crown: 0.03, r: 0.05, step: 0.15, wrinkle: 0.003, seed: 4, tBot: 1.1, tTop: 0.9 });
    return shiftZ(k.g, 0.045);
  },
  draw2d: (ctx, c) =>
    symShift(ctx, 0.74, 0.84, 0.045, () => {
      D.box(ctx, -0.3, -0.29, 0.3, 0.31, 0.05, tint(c.fabric, 0.45));
      D.box(ctx, -0.27, -0.42, 0.27, -0.2, 0.04, tint(c.fabric, 0.35), INK_SOFT, LINE_THIN);
      for (const sx of [-1, 1]) D.box(ctx, sx * 0.37, -0.39, sx * 0.285, 0.37, 0.02, tint(c.wood, 0.3));
    }),
};

/* ================================================================== rocking chair */

const rockingChair: FurnitureDef = {
  id: 'lounge-rocking',
  name: 'כיסא נדנדה מעץ',
  category: 'living',
  group: 'כסאות נוח',
  tags: ['נדנדה', 'עץ', 'כפרי', 'קלאסי', 'מרפסת'],
  size: { w: 0.64, d: 0.96, h: 1.06 },
  colors: [slot('wood', 'עץ', '#8a5a3b'), slot('fabric', 'כרית', '#b5643f')],
  seats: [{ x: 0, z: 0.04, height: 0.46, facing: 0, kind: 'sit' }],
  actions: [{ kind: 'rock' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const p = k.part('rock', 0, 0, 0);
    const wood = M.wood(c.wood, 0.5);
    const fab = M.fabric(c.fabric, 14);
    const RR = 1.35;
    const ry = (z: number): number => RR - Math.sqrt(RR * RR - z * z);
    // rockers: curved runners
    for (const sx of [-1, 1]) {
      const sh = new THREE.Shape();
      const n = 16;
      const z0 = -0.47;
      const z1 = 0.47;
      for (let i = 0; i <= n; i++) {
        const z = z0 + ((z1 - z0) * i) / n;
        if (i === 0) sh.moveTo(z, ry(z) + 0.004);
        else sh.lineTo(z, ry(z) + 0.004);
      }
      for (let i = n; i >= 0; i--) {
        const z = z0 + ((z1 - z0) * i) / n;
        sh.lineTo(z, ry(z) + 0.04);
      }
      const g = extrudeZ(sh, 0.026, 0.004, 4);
      g.rotateY(-Math.PI / 2);
      p.geo(g, wood, sx * 0.27, 0, 0);
    }
    // legs from rockers to the seat; back legs continue as raked back posts
    for (const sx of [-1, 1]) {
      const x = sx * 0.27;
      p.rod([x, ry(0.22) + 0.03, 0.22], [x, 0.42, 0.2], 0.018, wood, 0.016, 10);
      p.rod([x, ry(-0.2) + 0.03, -0.2], [x, 0.42, -0.21], 0.019, wood, 0.017, 10);
      p.beam([x, 0.42, -0.21], [x * 0.97, 1.03, -0.36], 0.036, 0.03, wood, 0.006);
      p.sphere(0.02, wood, x * 0.97, 1.04, -0.365, 1, 1, 1, 8);
      // stretcher, arm support and arm
      p.rod([x, 0.16, 0.21], [x, 0.16, -0.2], 0.011, wood, 0.011, 8);
      p.rod([x, 0.42, 0.17], [x * 1.04, 0.64, 0.16], 0.013, wood, 0.011, 8);
      p.beam([x * 1.04, 0.65, 0.22], [x, 0.64, -0.26], 0.06, 0.022, wood, 0.008);
    }
    // seat board + tie-on cushion
    p.rbox(0.56, 0.03, 0.46, 0.008, wood, 0, 0.4, -0.0, 1);
    seatPad(p, 0.48, 0.42, 0.055, fab, 0, 0.43, 0.0, { crown: 0.015, r: 0.03, p: 2.2, step: 0.2, tufts: [[0, 0]], tuftDepth: 0.02, tuftR: 0.04 }, { buttons: M.fabric(darken(c.fabric, 0.25), 14) });
    // back: lower rail, top rail and spindles
    const zAt = (y: number): number => -0.21 - ((y - 0.42) / 0.61) * 0.15;
    p.beam([-0.27, 0.52, zAt(0.52)], [0.27, 0.52, zAt(0.52)], 0.04, 0.022, wood, 0.005);
    p.beam([-0.27, 0.98, zAt(0.98)], [0.27, 0.98, zAt(0.98)], 0.08, 0.028, wood, 0.008);
    for (let i = 0; i < 7; i++) {
      const x = -0.2 + i * (0.4 / 6);
      p.rod([x, 0.53, zAt(0.53)], [x, 0.94, zAt(0.94)], 0.008, wood, 0.008, 6);
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      for (const sx of [-1, 1]) D.box(ctx, sx * 0.283, -0.47, sx * 0.257, 0.47, 0.01, tint(c.wood, 0.3));
      D.box(ctx, -0.28, -0.23, 0.28, 0.23, 0.02, tint(c.wood, 0.45));
      D.box(ctx, -0.24, -0.21, 0.24, 0.21, 0.03, tint(c.fabric, 0.45), INK_SOFT, LINE_THIN);
      D.box(ctx, -0.28, -0.38, 0.28, -0.33, 0.01, tint(c.wood, 0.3));
      for (const sx of [-1, 1]) D.box(ctx, sx * 0.31, -0.26, sx * 0.25, 0.22, 0.02, tint(c.wood, 0.3));
    }),
};

/* ================================================================== hanging egg chair on a stand */

const HANG_Y = 1.9;
const hangingEgg: FurnitureDef = {
  id: 'lounge-hanging-egg',
  name: 'כורסת ביצה תלויה עם מעמד',
  category: 'living',
  group: 'כסאות נוח',
  tags: ['תלויה', 'ביצה', 'ראטן', 'נדנדה', 'בוהו', 'קן'],
  size: { w: 0.98, d: 1.04, h: 2.0 },
  colors: [slot('frame', 'ראטן', '#c9a77a'), slot('fabric', 'כריות', '#ece6da'), slot('legs', 'מעמד', '#232427')],
  seats: [{ x: 0, z: 0.12, height: 0.66, facing: 0, kind: 'sit' }],
  actions: [{ kind: 'swing' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const met = M.metal(c.legs, 0.5, 0.7);
    const wick = M.wicker(c.frame);
    const fab = M.fabric(c.fabric, 12);
    const zc = 0.06;
    // stand: weighted dish + C-shaped pole ending in a hook
    k.lathe([[0, 0], [0.4, 0], [0.4, 0.012], [0.33, 0.04], [0, 0.045]], met, 0, 0, zc, 28);
    k.tube(
      [
        [0, 0.04, zc - 0.3],
        [0, 0.6, zc - 0.44],
        [0, 1.4, zc - 0.47],
        [0, 1.86, zc - 0.32],
        [0, 1.975, zc - 0.08],
        [0, 1.95, zc + 0.01],
      ],
      0.024,
      met,
      { seg: 36, radial: 8 },
    );
    k.cyl(0.05, 0.05, met, 0, 0.03, zc - 0.3, 0.035, 12);
    // hanging basket: pivots at the hook
    const p = k.part('swing', 0, HANG_Y, zc);
    for (let i = 0; i < 4; i++) {
      const link = p.ring(0.018, 0.004, met, 0, -0.02 - i * 0.03, 0, 10);
      link.rotation.set(0, (i % 2) * (Math.PI / 2), Math.PI / 2);
    }
    const cy = -0.78;
    const sh = shellGeos({
      rx: 0.46,
      ry: 0.62,
      rz: 0.43,
      thMax: 2.55,
      thick: 0.03,
      open: (th) => (th < 0.8 || th > 2.45 ? 0 : 1.35 * Math.pow(Math.sin((Math.PI * (th - 0.8)) / 1.65), 0.5)),
      rows: 16,
      cols: 22,
    });
    p.geo(sh.outer, wick, 0, cy, 0);
    p.geo(sh.inner, wick, 0, cy, 0);
    p.geo(sh.rim, M.rattan(darken(c.frame, 0.15)), 0, cy, 0);
    p.ring(0.05, 0.008, met, 0, -0.15, 0, 14);
    // cushions
    p.lathe(roundCushionProfile(0.33, 0.11, 0.03), fab, 0, cy - 0.47, 0.04, 24);
    backPad(p, 0.46, 0.36, 0.13, 0.3, fab, 0, cy - 0.38, -0.3, { crown: 0.04, r: 0.07, step: 0.15, wrinkle: 0.003 });
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.circle(ctx, 0, 0.06, 0.4, tint(c.legs, 0.7), INK_SOFT, LINE_THIN);
      D.ellipse(ctx, 0, 0.06, 0.46, 0.43, tint(c.frame, 0.35));
      D.ellipse(ctx, 0, 0.08, 0.36, 0.34, tint(c.fabric, 0.3), INK_SOFT, LINE_THIN);
      D.line(ctx, 0, -0.46, 0, 0.06, INK_SOFT, 0.03);
    }),
};

/* ================================================================== chaise longue */

const chaise: FurnitureDef = {
  id: 'lounge-chaise-longue',
  name: 'שזלונג מרופד',
  category: 'living',
  group: 'כסאות נוח',
  tags: ['שזלונג', 'שכיבה', 'קטיפה', 'מנוחה', 'קריאה'],
  size: { w: 0.7, d: 1.68, h: 0.84 },
  colors: [slot('fabric', 'קטיפה', '#6c7d5b'), slot('legs', 'רגליים', PAL.walnut), slot('accent', 'כרית גליל', '#d9c3a0')],
  seats: [
    { x: 0, z: 0.1, height: 0.44, facing: 0, kind: 'lie' },
    { x: 0, z: 0.25, height: 0.42, facing: Math.PI / 2, kind: 'sit' },
  ],
  build: ({ colors: c }) => {
    const k = new Kit();
    const vel = M.velvet(c.fabric);
    const legH = 0.14;
    const w = 0.7;
    const L = 1.68;
    // side profile (z, y): flat seat rising into a curved back at the head end (-Z)
    const sh = new THREE.Shape();
    const b = 0.03;
    const z0 = -L / 2 + b;
    const z1 = L / 2 - b;
    const yb = legH + b;
    sh.moveTo(z1, yb);
    sh.lineTo(z1, 0.4);
    sh.quadraticCurveTo(z1, 0.43, z1 - 0.05, 0.43);
    sh.lineTo(-0.1, 0.41);
    sh.bezierCurveTo(-0.35, 0.41, -0.48, 0.5, -0.62, 0.75);
    sh.quadraticCurveTo(-0.68, 0.84 - b, -0.76, 0.8 - b);
    sh.quadraticCurveTo(z0 - 0.0, 0.74, z0, 0.62);
    sh.lineTo(z0, yb);
    sh.lineTo(z1, yb);
    const g = extrudeZ(sh, w - 2 * b, b, 14);
    g.rotateY(-Math.PI / 2);
    k.geo(g, vel, 0, 0, 0);
    // welt piping along both edges of the top line
    const top: V3[] = [];
    const curve = new THREE.SplineCurve([
      new THREE.Vector2(z1 + b, 0.405),
      new THREE.Vector2(0.4, 0.448),
      new THREE.Vector2(-0.1, 0.44),
      new THREE.Vector2(-0.4, 0.5),
      new THREE.Vector2(-0.62, 0.78),
      new THREE.Vector2(-0.73, 0.833),
    ]);
    for (const pnt of curve.getPoints(18)) top.push([0, pnt.y, pnt.x]);
    const pipe = M.velvet(darken(c.fabric, 0.12));
    for (const sx of [-1, 1]) k.tube(top.map(([, y, z]) => [sx * (w / 2 - 0.004), y, z] as V3), 0.007, pipe, { seg: 30, radial: 5 });
    // buttons along the back
    for (const [z, y] of [[-0.5, 0.6], [-0.62, 0.74]] as Array<[number, number]>) {
      for (const x of [-0.18, 0, 0.18]) k.sphere(0.012, pipe, x, y + 0.03, z + 0.02, 1, 1, 0.6, 6);
    }
    // bolster
    const kk = new Kit();
    bolster(kk, 0.58, 0.085, M.velvet(c.accent), 0, 0, 0, M.velvet(darken(c.accent, 0.2)));
    k.add(kk.g, 0, 0.53, -0.36);
    // tapered legs with brass caps
    for (const sx of [-1, 1]) for (const z of [-L / 2 + 0.09, L / 2 - 0.09]) taperLeg(k, sx * (w / 2 - 0.07), z, legH, M.wood(c.legs), 0.02, 0.012, sx * 0.012, Math.sign(z) * 0.012, M.brass());
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.box(ctx, -0.35, -0.84, 0.35, 0.84, 0.05, tint(c.fabric, 0.42));
      D.box(ctx, -0.33, -0.82, 0.33, -0.5, 0.05, tint(c.fabric, 0.3), INK_SOFT, LINE_THIN);
      D.box(ctx, -0.29, -0.45, 0.29, -0.28, 0.08, tint(c.accent, 0.3), INK_SOFT, LINE_THIN);
    }),
};

/* ================================================================== bean bags */

function beanGeo(kind: 'pear' | 'lounger' | 'chair', seed: number): THREE.BufferGeometry {
  let g: THREE.BufferGeometry;
  if (kind === 'pear') {
    g = latheGeo(
      smoothProfile([
        [0, 0],
        [0.3, 0.01],
        [0.4, 0.12],
        [0.39, 0.32],
        [0.3, 0.55],
        [0.2, 0.72],
        [0.12, 0.84],
        [0, 0.88],
      ], 20),
      24,
    );
  } else {
    g = new THREE.SphereGeometry(1, 28, 18);
  }
  g.deleteAttribute('normal');
  g = mergeGeo(g);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i);
    let y = p.getY(i);
    let z = p.getZ(i);
    if (kind === 'pear') {
      // seat dent in the front, backrest pushed back
      const dent = Math.exp(-((y - 0.45) ** 2) / 0.02) * Math.max(0, z) * 0.55;
      z -= dent;
      y -= Math.exp(-((y - 0.45) ** 2) / 0.04) * Math.max(0, z) * 0.15;
      z -= y * 0.12;
    } else if (kind === 'lounger') {
      x *= 0.62;
      z *= 0.72;
      y = (y + 1) * 0.2;
      // raised back rim
      const back = Math.max(0, -z / 0.72);
      y += Math.pow(back, 1.6) * 0.6 * (y / 0.4);
      y -= Math.exp(-(x * x + (z - 0.15) * (z - 0.15)) / 0.08) * 0.08 * (y / 0.4);
      y = Math.max(0, y);
    } else {
      x *= 0.44;
      z *= 0.42;
      y = (y + 1) * 0.22;
      const back = Math.max(0, -z / 0.42);
      y += Math.pow(back, 2.2) * 0.4 * Math.min(1, y / 0.2);
      // seat hollow
      y -= Math.exp(-(x * x + (z - 0.05) * (z - 0.05)) / 0.03) * 0.08 * Math.min(1, y / 0.3);
      y = Math.max(0, y);
    }
    const n = noise3(x * 6 + seed, y * 6, z * 6) - 0.5;
    const s = y > 0.02 ? 0.025 : 0;
    p.setXYZ(i, x + n * s, Math.max(0, y + n * s * 0.6), z + n * s);
  }
  g.computeVertexNormals();
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = Math.atan2(p.getZ(i), p.getX(i)) * 0.45;
    uv[i * 2 + 1] = p.getY(i);
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

function mergeGeo(g: THREE.BufferGeometry): THREE.BufferGeometry {
  g.deleteAttribute('uv');
  return mergeVertices(g, 1e-4);
}

function beanDef(id: string, name: string, tags: string[], kind: 'pear' | 'lounger' | 'chair', size: { w: number; d: number; h: number }, mat: UpKind, color: string, seatH: number): FurnitureDef {
  return {
    id,
    name,
    category: 'living',
    group: 'כסאות נוח',
    tags,
    size,
    colors: [slot('fabric', UP_LABEL[mat], color)],
    seats: [{ x: 0, z: kind === 'lounger' ? 0.05 : 0.08, height: seatH, facing: 0, kind: kind === 'lounger' ? 'lie' : 'sit' }],
    build: ({ colors: c }) => {
      const k = new Kit();
      const g = beanGeo(kind, kind.length);
      g.computeBoundingBox();
      const bb = g.boundingBox!;
      g.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
      g.computeBoundingBox();
      const s2 = g.boundingBox!.getSize(new THREE.Vector3());
      g.scale(size.w / s2.x, size.h / s2.y, size.d / s2.z);
      g.computeVertexNormals();
      k.geo(g, upMat(mat, c.fabric));
      return k.g;
    },
    draw2d: (ctx, c) =>
      sym(ctx, () => {
        D.ellipse(ctx, 0, 0, size.w / 2, size.d / 2, tint(c.fabric, 0.4));
        D.ellipse(ctx, 0, size.d * 0.1, size.w * 0.3, size.d * 0.28, tint(c.fabric, 0.55), INK_SOFT, LINE_THIN);
      }),
  };
}

const BEANS: FurnitureDef[] = [
  beanDef('lounge-beanbag-pear', 'פוף ישיבה (בין-באג) טיפה', ['פוף', 'בין באג', 'טיפה', 'נוער', 'רך'], 'pear', { w: 0.78, d: 0.74, h: 0.88 }, 'fabric', '#c2553f', 0.4),
  beanDef('lounge-beanbag-lounger', 'פוף שכיבה ענק', ['פוף', 'בין באג', 'שכיבה', 'ענק', 'קטיפה'], 'lounger', { w: 1.3, d: 1.5, h: 0.58 }, 'velvet', '#8a7a68', 0.32),
  beanDef('lounge-beanbag-chair', 'פוף כורסה מבוקלה', ['פוף', 'בוקלה', 'כורסה', 'בין באג', 'רך'], 'chair', { w: 0.86, d: 0.82, h: 0.7 }, 'boucle', '#5a6b7d', 0.36),
];

/* ================================================================== ottomans, poufs & benches */

/** Lathe whose side bulges between `n` vertical seams (stitched leather panels, knit cables). */
function puffLathe(profile: Array<[number, number]>, seg: number, n: number, amp: number, h: number): THREE.BufferGeometry {
  const g = latheGeo(profile, seg);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const y = p.getY(i);
    const r = Math.hypot(x, z);
    if (r < 1e-5) continue;
    const ph = Math.atan2(x, z);
    const vy = Math.sin(Math.PI * Math.min(1, Math.max(0, y / h)));
    const f = 1 + amp * (Math.pow(Math.abs(Math.sin((n * ph) / 2)), 0.7) - 0.6) * vy;
    p.setX(i, x * f);
    p.setZ(i, z * f);
  }
  g.computeVertexNormals();
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 1.7, p.getY(i));
  return g;
}

const ottomanTufted: FurnitureDef = {
  id: 'ottoman-tufted',
  name: 'הדום מלבני מכופתר',
  category: 'living',
  group: 'הדומים וספסלים',
  tags: ['הדום', 'כפתורים', 'קפיטונאז׳', 'קטיפה', 'שולחן סלון'],
  size: { w: 1.0, d: 0.62, h: 0.46 },
  colors: [slot('fabric', 'קטיפה', '#5e3a55'), slot('legs', 'רגליים', PAL.darkWood)],
  seats: [{ x: -0.25, z: 0, height: 0.45, facing: 0, kind: 'sit' }, { x: 0.25, z: 0, height: 0.45, facing: 0, kind: 'sit' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const vel = M.velvet(c.fabric);
    const legH = 0.11;
    k.rbox(0.98, 0.22, 0.6, 0.03, vel, 0, legH, 0, 2);
    const tufts = diamondTufts(0.96, 0.58, 5, 3, 0.14, 0.12);
    seatPad(k, 0.996, 0.616, 0.115, vel, 0, legH + 0.215, 0, { crown: 0.02, r: 0.05, p: 2.6, tufts, tuftDepth: 0.04, tuftR: 0.05, step: 0.08, wrinkle: 0.002 }, { buttons: M.velvet(darken(c.fabric, 0.2)) });
    // welt along the bottom edge of the body
    const y = legH + 0.004;
    k.tube(rrLoop(0.98, 0.6, 0.03, y), 0.007, M.velvet(darken(c.fabric, 0.1)), { closed: true, seg: 48, radial: 5, tension: 0.1 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) turnedLeg(k, sx * 0.43, sz * 0.24, legH, M.wood(c.legs), 0.026, M.brass());
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 1.0, 0.62, 0.05, tint(c.fabric, 0.45));
      for (const [x, y] of diamondTufts(0.96, 0.58, 5, 3, 0.14, 0.12)) D.circle(ctx, x, y, 0.012, tint(c.fabric, 0.05), null);
    }),
};

const poufLeather: FurnitureDef = {
  id: 'ottoman-pouf-leather',
  name: 'פוף עגול מעור תפור',
  category: 'living',
  group: 'הדומים וספסלים',
  tags: ['פוף', 'עור', 'עגול', 'מרוקאי', 'תפרים'],
  size: { w: 0.56, d: 0.56, h: 0.42 },
  colors: [slot('fabric', 'עור', '#a8693c')],
  seats: [{ x: 0, z: 0, height: 0.42, facing: 0, kind: 'sit' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const lea = M.leather(c.fabric);
    const h = 0.42;
    const g = puffLathe(
      smoothProfile([[0, 0], [0.2, 0], [0.255, 0.03], [0.272, 0.16], [0.268, 0.3], [0.24, 0.39], [0.15, 0.418], [0, 0.42]], 26),
      32,
      8,
      0.05,
      h,
    );
    k.geo(g, lea);
    const seam = M.leather(darken(c.fabric, 0.35));
    k.ring(0.245, 0.006, seam, 0, 0.388, 0, 32);
    k.ring(0.258, 0.006, seam, 0, 0.03, 0, 32);
    // stitched radial panels on top
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      k.rod([Math.sin(a) * 0.03, 0.419, Math.cos(a) * 0.03], [Math.sin(a) * 0.2, 0.405, Math.cos(a) * 0.2], 0.0025, seam, 0.0025, 4);
    }
    k.cyl(0.03, 0.004, seam, 0, 0.416, 0, 0.03, 12);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.circle(ctx, 0, 0, 0.27, tint(c.fabric, 0.4));
      D.circle(ctx, 0, 0, 0.24, null, INK_SOFT, LINE_THIN);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        D.line(ctx, Math.sin(a) * 0.03, Math.cos(a) * 0.03, Math.sin(a) * 0.24, Math.cos(a) * 0.24, INK_SOFT, LINE_THIN);
      }
    }),
};

const poufKnit: FurnitureDef = {
  id: 'ottoman-pouf-knit',
  name: 'פוף סריגה עבה',
  category: 'living',
  group: 'הדומים וספסלים',
  tags: ['פוף', 'סרוג', 'סריגה', 'צמר', 'נורדי', 'היגה'],
  size: { w: 0.52, d: 0.52, h: 0.38 },
  colors: [slot('fabric', 'סריגה', '#d9cfbf')],
  seats: [{ x: 0, z: 0, height: 0.36, facing: 0, kind: 'sit' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const g = puffLathe(
      smoothProfile([[0, 0], [0.18, 0], [0.235, 0.03], [0.25, 0.14], [0.245, 0.26], [0.21, 0.35], [0.12, 0.378], [0, 0.38]], 24),
      40,
      18,
      0.035,
      0.38,
    );
    k.geo(g, M.knit(c.fabric));
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.circle(ctx, 0, 0, 0.255, tint(c.fabric, 0.3));
      D.circle(ctx, 0, 0, 0.17, null, INK_SOFT, LINE_THIN);
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2;
        D.line(ctx, Math.sin(a) * 0.19, Math.cos(a) * 0.19, Math.sin(a) * 0.245, Math.cos(a) * 0.245, INK_SOFT, 0.006);
      }
    }),
};

const benchStorage: FurnitureDef = {
  id: 'bench-storage',
  name: 'ספסל אחסון עם מושב מרופד',
  category: 'living',
  group: 'הדומים וספסלים',
  tags: ['ספסל', 'אחסון', 'ארגז', 'מבואה', 'כניסה', 'עץ'],
  size: { w: 1.1, d: 0.44, h: 0.49 },
  colors: [slot('wood', 'עץ', '#e8e2d6'), slot('fabric', 'מושב', '#7f8c7a')],
  seats: [{ x: -0.27, z: 0.03, height: 0.47, facing: 0, kind: 'sit' }, { x: 0.27, z: 0.03, height: 0.47, facing: 0, kind: 'sit' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const wood = M.paint(c.wood, 0.5);
    const w = 1.04;
    const d = 0.42;
    // carcass on a recessed plinth
    k.rbox(w - 0.06, 0.05, d - 0.06, 0.004, M.paint(darken(c.wood, 0.25)), 0, 0, 0, 1);
    k.rbox(w, 0.32, d, 0.006, wood, 0, 0.05, 0, 1);
    // frame-and-panel front: two raised panels with shadow lines
    for (const x of [-0.25, 0.25]) {
      k.box(0.44, 0.2, 0.004, M.paint(darken(c.wood, 0.18)), x, 0.11, d / 2 + 0.001);
      k.rbox(0.41, 0.17, 0.012, 0.004, wood, x, 0.125, d / 2 + 0.004, 1);
    }
    // lid with a slight overhang
    k.rbox(w + 0.01, 0.025, d + 0.02, 0.006, wood, 0, 0.37, 0, 1);
    k.box(w - 0.01, 0.003, 0.004, M.matte('#3a3836'), 0, 0.368, d / 2 + 0.001);
    // seat cushion with buttons
    const tufts: Array<[number, number]> = [-0.35, -0.12, 0.12, 0.35].map((x) => [x, 0]);
    seatPad(k, w - 0.04, d - 0.02, 0.08, M.linen(c.fabric), 0, 0.395, 0.005, { crown: 0.012, r: 0.035, p: 3, tufts, tuftDepth: 0.02, tuftR: 0.035, step: 0.12, wrinkle: 0.002 }, { buttons: M.linen(darken(c.fabric, 0.2)) });
    // iron side handles
    const iron = M.blackMetal();
    for (const sx of [-1, 1]) {
      const x = sx * (w / 2 + 0.002);
      k.tube([[x, 0.27, -0.06], [sx * (w / 2 + 0.025), 0.27, -0.045], [sx * (w / 2 + 0.025), 0.27, 0.045], [x, 0.27, 0.06]], 0.006, iron, { seg: 12, radial: 6 });
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 1.1, 0.44, 0.01, tint(c.wood, 0.2));
      D.rr(ctx, 0, 0.005, 1.06, 0.4, 0.035, tint(c.fabric, 0.45), INK_SOFT, LINE_THIN);
      for (const x of [-0.36, -0.12, 0.12, 0.36]) D.circle(ctx, x, 0.005, 0.01, tint(c.fabric, 0.1), null);
    }),
};

const benchUph: FurnitureDef = {
  id: 'bench-upholstered',
  name: 'ספסל מרופד עם תפרי תעלות',
  category: 'living',
  group: 'הדומים וספסלים',
  tags: ['ספסל', 'מרופד', 'קטיפה', 'תעלות', 'מרגלות המיטה'],
  size: { w: 1.3, d: 0.42, h: 0.48 },
  colors: [slot('fabric', 'קטיפה', '#566b5a'), slot('legs', 'רגליים', PAL.walnut)],
  seats: [-0.4, 0, 0.4].map((x) => ({ x, z: 0.02, height: 0.47, facing: 0, kind: 'sit' as const })),
  build: ({ colors: c }) => {
    const k = new Kit();
    const vel = M.velvet(c.fabric);
    const legH = 0.24;
    k.rbox(1.28, 0.1, 0.4, 0.03, vel, 0, legH, 0, 2);
    const nc = 9;
    const channels = Array.from({ length: nc - 1 }, (_, i) => -0.65 + (1.3 * (i + 1)) / nc);
    seatPad(k, 1.3, 0.42, 0.13, vel, 0, legH + 0.095, 0, { crown: 0.015, r: 0.05, p: 2.6, channels, grooveDepth: 0.03, grooveW: 0.018, step: 0.25, wrinkle: 0.002 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) taperLeg(k, sx * 0.57, sz * 0.14, legH, M.wood(c.legs), 0.019, 0.011, sx * 0.025, sz * 0.02, M.brass());
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 1.3, 0.42, 0.05, tint(c.fabric, 0.45));
      for (let i = 1; i < 9; i++) {
        const x = -0.65 + (1.3 * i) / 9;
        D.line(ctx, x, -0.19, x, 0.19, INK_SOFT, LINE_THIN);
      }
    }),
};

const footstool: FurnitureDef = {
  id: 'ottoman-footstool',
  name: 'הדום רגליים קטן',
  category: 'living',
  group: 'הדומים וספסלים',
  tags: ['הדום', 'שרפרף רגליים', 'קלאסי', 'רגליים מחורטות'],
  size: { w: 0.52, d: 0.4, h: 0.41 },
  colors: [slot('fabric', 'ריפוד', '#b9a37e'), slot('legs', 'רגליים', PAL.darkWood)],
  seats: [{ x: 0, z: 0, height: 0.4, facing: 0, kind: 'sit' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const fab = M.fabric(c.fabric, 16);
    const wood = M.wood(c.legs, 0.45);
    const legH = 0.2;
    // wooden apron, upholstered top with a single button
    k.rbox(0.48, 0.07, 0.36, 0.008, wood, 0, legH - 0.04, 0, 1);
    seatPad(k, 0.52, 0.4, 0.15, fab, 0, legH + 0.03, 0, { crown: 0.03, r: 0.06, p: 2.2, tufts: [[0, 0]], tuftDepth: 0.03, tuftR: 0.06, step: 0.1, wrinkle: 0.003 }, { buttons: M.fabric(darken(c.fabric, 0.25), 16), buttonR: 0.014 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) turnedLeg(k, sx * 0.2, sz * 0.14, legH - 0.01, wood, 0.024);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 0.52, 0.4, 0.06, tint(c.fabric, 0.4));
      D.circle(ctx, 0, 0, 0.014, tint(c.fabric, 0.05), null);
    }),
};

const cubeOttoman: FurnitureDef = {
  id: 'ottoman-cube-boucle',
  name: 'הדום קובייה מבוקלה',
  category: 'living',
  group: 'הדומים וספסלים',
  tags: ['הדום', 'קובייה', 'בוקלה', 'מודרני', 'רך'],
  size: { w: 0.46, d: 0.46, h: 0.44 },
  colors: [slot('fabric', 'בוקלה', '#c9a9a0')],
  seats: [{ x: 0, z: 0, height: 0.44, facing: 0, kind: 'sit' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    seatPad(k, 0.46, 0.46, 0.427, M.boucle(c.fabric), 0, 0, 0, { tB: 0.2, crown: 0.012, r: 0.07, p: 3.2, step: 0.12, wrinkle: 0.003 });
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 0.46, 0.46, 0.07, tint(c.fabric, 0.4));
      D.rr(ctx, 0, 0, 0.34, 0.34, 0.04, null, INK_SOFT, LINE_THIN);
    }),
};

const OTTOMANS: FurnitureDef[] = [ottomanTufted, poufLeather, poufKnit, benchStorage, benchUph, footstool, cubeOttoman];

export const SEATING: FurnitureDef[] = [
  ...SOFAS.map(sofaDef),
  ...CURVED,
  futon,
  daybed,
  ...ARMCHAIRS.map(sofaDef),
  ...TUBS,
  shellLounge,
  butterfly,
  eggChair,
  papasan,
  scandiLounge,
  rockingChair,
  hangingEgg,
  chaise,
  ...BEANS,
  shellOttoman,
  ...OTTOMANS,
];
