/**
 * Entertainment: TVs & screens, music / speakers, musical instruments, games, fireplaces and
 * aquariums. Everything interactive in walk mode declares `actions` + animated parts
 * (`screen`, `spin`, `pulse`, `fish`) as described in docs/catalog-authoring.md.
 */
import * as THREE from 'three';
import type { FurnitureDef, SeatAnchor } from '../types';
import {
  D,
  INK,
  INK_SOFT,
  Kit,
  LINE,
  LINE_THIN,
  M,
  PAL,
  darken,
  extrudeY,
  extrudeZ,
  lighten,
  mix,
  rng,
  roundedRectShape,
  sym,
  tint,
  type Ctx2D,
  type V3,
} from '../kit';
import { cabinet, legs4, slot } from './_parts';

type C = Record<string, string>;
const CAT = 'entertainment' as const;
const G_TV = 'טלוויזיות ומסכים';
const G_MUSIC = 'מוזיקה';
const G_INST = 'כלי נגינה';
const G_GAME = 'משחקים';
const G_FIRE = 'אח ואש';
const G_AQUA = 'אקווריומים';

/* ================================================================== shared helpers */

/** Cylinder whose axis runs along Z (front cap faces +Z), centred at (x, y, z). */
function zcyl(k: Kit, r: number, len: number, mat: THREE.Material, x: number, y: number, z: number, seg = 18, rFront = r): THREE.Mesh {
  const m = k.cyl(r, len, mat, 0, 0, 0, rFront, seg);
  m.position.set(x, y, z);
  m.rotation.x = Math.PI / 2;
  return m;
}

/** Cylinder whose axis runs along X, centred at (x, y, z). */
function xcyl(k: Kit, r: number, len: number, mat: THREE.Material, x: number, y: number, z: number, seg = 16): THREE.Mesh {
  const m = k.cyl(r, len, mat, 0, 0, 0, r, seg);
  m.position.set(x, y, z);
  m.rotation.z = Math.PI / 2;
  return m;
}

/** Tiny self-lit indicator LED on a +Z facing surface at z. */
function led(k: Kit, x: number, y: number, z: number, color = '#5dff8a', s = 0.005): void {
  k.box(s, s * 0.7, 0.002, M.glow(color, 2.4, color), x, y - s * 0.35, z + 0.001);
}

/** Knob on a +Z facing surface at z (y = centre). */
function knob(k: Kit, x: number, y: number, z: number, r: number, mat: THREE.Material, len = r * 0.8): void {
  zcyl(k, r, len, mat, x, y, z + len / 2, 12, r * 0.85);
}

/**
 * Speaker driver built in a part builder at its pivot: the rim of the cone lies in the z = 0 plane,
 * the cone recedes into -Z. Centred so `pulse` scaling happens around the cone.
 */
function driver(p: Kit, r: number, coneMat: THREE.Material, rimMat: THREE.Material, capMat: THREE.Material = coneMat): void {
  const m = p.lathe(
    [
      [r * 0.96, 0],
      [r * 0.8, -r * 0.1],
      [r * 0.42, -r * 0.27],
      [r * 0.25, -r * 0.34],
    ],
    coneMat,
    0,
    0,
    0,
    16,
  );
  m.rotation.x = Math.PI / 2;
  p.geo(new THREE.TorusGeometry(r * 0.97, r * 0.06, 4, 16), rimMat, 0, 0, -0.001);
  p.sphere(r * 0.3, capMat, 0, 0, -r * 0.28, 1, 1, 0.5, 9);
}

/** Dome tweeter on a +Z baffle at z (y = centre). */
function tweeter(k: Kit, x: number, y: number, z: number, r: number, ring: THREE.Material, dome: THREE.Material): void {
  zcyl(k, r * 1.9, 0.004, ring, x, y, z + 0.002, 16);
  k.sphere(r, dome, x, y, z + 0.003, 1, 1, 0.55, 9);
}

/** Simple box-shaped key / slider row helper: a strip of n boxes along X. */
function rowOf(k: Kit, n: number, x0: number, x1: number, w: number, h: number, d: number, mat: THREE.Material, y: number, z: number): void {
  for (let i = 0; i < n; i++) k.box(w, h, d, mat, x0 + ((x1 - x0) * (i + 0.5)) / n, y, z);
}

/* ================================================================== TVs */

type TvStand = 'feet' | 'pedestal' | 'wall' | 'frame' | 'swivel';

interface TvCfg {
  id: string;
  name: string;
  inch: number;
  stand: TvStand;
  tags: string[];
  frame?: string;
  standColor?: string;
}

interface TvGeom {
  sw: number;
  sh: number;
  W: number;
  H: number;
  t: number;
  hump: number;
  chin: number;
  bez: number;
  y0: number;
  zf: number;
  w: number;
  d: number;
  h: number;
}

function tvGeom(cfg: TvCfg): TvGeom {
  const dg = cfg.inch * 0.0254;
  const sw = dg * 0.8716;
  const sh = dg * 0.4903;
  const frame = cfg.stand === 'frame';
  const bez = frame ? 0.045 : 0.006;
  const chin = frame ? 0.045 : cfg.inch <= 43 ? 0.016 : 0.012;
  const W = sw + 2 * bez;
  const H = sh + bez + chin;
  switch (cfg.stand) {
    case 'feet': {
      const t = cfg.inch <= 43 ? 0.034 : 0.026;
      const fd = 0.085 + cfg.inch * 0.0012;
      const y0 = cfg.inch <= 43 ? 0.06 : 0.075;
      return { sw, sh, W, H, t, hump: 0.04, chin, bez, y0, zf: t / 2, w: W, d: +(2 * fd + 0.02).toFixed(3), h: y0 + H };
    }
    case 'pedestal': {
      const t = 0.024;
      const y0 = 0.1;
      return { sw, sh, W, H, t, hump: 0.035, chin, bez, y0, zf: 0.035, w: W, d: 0.3, h: y0 + H };
    }
    case 'swivel': {
      const t = 0.024;
      const y0 = 0.8;
      return { sw, sh, W, H, t, hump: 0.035, chin, bez, y0, zf: 0.06, w: Math.max(W, 0.8), d: 0.5, h: y0 + H };
    }
    case 'frame': {
      const d = 0.05;
      return { sw, sh, W, H, t: 0.03, hump: 0, chin, bez, y0: 0, zf: d / 2, w: W, d, h: H };
    }
    default: {
      const d = 0.06;
      return { sw, sh, W, H, t: 0.012, hump: 0.028, chin, bez, y0: 0, zf: d / 2, w: W, d, h: H };
    }
  }
}

function buildTv(cfg: TvCfg, c: C): THREE.Object3D {
  const k = new Kit();
  const g = tvGeom(cfg);
  const frame = cfg.stand === 'frame' ? M.wood(c.frame, 0.5) : M.plastic(c.frame);
  const back = M.matte(darken(c.frame, 0.15));
  const standM = M.metal(c.stand ?? '#2a2b2e', 0.32, 0.9);
  const { W, H, t, zf, y0 } = g;

  // panel body (bezel) + back hump
  k.rbox(W, H, t, Math.min(0.004, t * 0.3), frame, 0, y0, zf - t / 2, 1);
  if (cfg.stand === 'frame') {
    // inner bevel of the picture frame + a thin white mat line
    k.box(g.sw + 0.012, g.sh + 0.012, 0.004, M.matte('#f1eee8'), 0, y0 + g.chin - 0.006, zf - 0.002);
  }
  const humpBack = zf - t - g.hump + 0.002;
  if (g.hump > 0) k.rbox(W * 0.7, H * 0.62, g.hump, 0.016, back, 0, y0 + H * 0.14, zf - t - g.hump / 2 + 0.002, 1);

  // the animated screen surface
  const s = k.part('screen');
  s.box(g.sw, g.sh, 0.002, M.screen(), 0, y0 + g.chin, zf + 0.0005);
  // standby LED + tiny IR window in the chin
  if (cfg.stand !== 'frame') {
    led(k, 0, y0 + g.chin * 0.5, zf, '#ff5a4a', 0.004);
    k.box(0.03, 0.006, 0.002, M.screen('#121318'), W / 2 - 0.08, y0 + g.chin * 0.25, zf + 0.0005);
  }

  if (cfg.stand === 'feet') {
    const fd = g.d / 2 - 0.012;
    const inset = Math.min(0.14, W * 0.12);
    for (const sx of [-1, 1]) {
      const fx = sx * (W / 2 - inset);
      const top: V3 = [fx, y0 + 0.05, zf - t / 2];
      for (const sz of [-1, 1]) {
        const end: V3 = [fx, 0.012, sz * fd];
        k.beam(top, end, 0.022, 0.012, standM, 0.003);
        k.rbox(0.03, 0.012, 0.024, 0.004, M.rubber(), fx, 0, sz * (fd - 0.002), 1);
      }
    }
  } else if (cfg.stand === 'pedestal') {
    const bw = Math.min(0.62, W * 0.42);
    k.rbox(bw, 0.014, 0.28, 0.006, standM, 0, 0, 0, 1);
    k.rbox(bw - 0.03, 0.004, 0.25, 0.002, M.rubber(), 0, 0, 0, 1);
    // neck: from the base up behind the hump
    const nz = humpBack - 0.012;
    k.rbox(0.09, y0 + H * 0.3, 0.022, 0.006, standM, 0, 0.012, nz, 1);
    k.rbox(0.16, 0.06, 0.03, 0.006, standM, 0, y0 + H * 0.22, nz + 0.012, 1);
  } else if (cfg.stand === 'swivel') {
    // heavy base with glass top, column, console shelf and VESA mount
    k.rbox(0.78, 0.03, 0.46, 0.012, standM, 0, 0, 0, 1);
    k.rbox(0.76, 0.008, 0.44, 0.01, M.glass('#1a1c20', 0.6), 0, 0.03, 0, 1);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl(0.014, 0.006, M.rubber(), sx * 0.33, -0.0001 + 0.0001, sz * 0.18, 0.014, 10);
    const cz = humpBack - 0.04;
    k.rbox(0.11, y0 + H * 0.55, 0.06, 0.01, standM, 0, 0.03, cz, 1);
    // cable cover groove
    k.box(0.04, y0 + H * 0.5, 0.004, M.matte('#151618'), 0, 0.05, cz + 0.031);
    // glass shelf for a console / soundbar
    k.rbox(0.56, 0.008, 0.26, 0.006, M.glass('#bcd3da', 0.35), 0, 0.42, cz + 0.12, 1);
    k.rbox(0.12, 0.03, 0.12, 0.004, standM, 0, 0.395, cz + 0.07, 1);
    // mount plate between column and hump
    k.rbox(0.3, 0.26, humpBack - cz - 0.03 + 0.004, 0.006, standM, 0, y0 + H * 0.3, (humpBack + cz + 0.03) / 2, 1);
  } else {
    // wall bracket: plate on the wall up to the back hump (or picture-frame cleat)
    const zb = -g.d / 2;
    const zTo = cfg.stand === 'frame' ? zf - t : humpBack;
    const bd = zTo - zb + 0.002;
    k.box(Math.min(0.45, W * 0.4), H * 0.4, bd, M.blackMetal(), 0, H * 0.3, zb + bd / 2);
  }
  return k.g;
}

function drawTv(ctx: Ctx2D, cfg: TvCfg, c: C): void {
  const g = tvGeom(cfg);
  sym(ctx, () => {
    const sc = tint(c.stand ?? '#2a2b2e', 0.55);
    if (cfg.stand === 'feet') {
      const inset = Math.min(0.14, g.W * 0.12);
      for (const sx of [-1, 1]) D.rr(ctx, sx * (g.W / 2 - inset), 0, 0.03, g.d - 0.004, 0.01, sc, INK_SOFT, LINE_THIN);
    } else if (cfg.stand === 'pedestal') {
      D.rr(ctx, 0, 0, Math.min(0.62, g.W * 0.42), 0.28, 0.02, sc, INK_SOFT, LINE_THIN);
    } else if (cfg.stand === 'swivel') {
      D.rr(ctx, 0, 0, 0.78, 0.46, 0.03, sc, INK_SOFT, LINE_THIN);
      D.rr(ctx, 0, 0.083, 0.56, 0.26, 0.01, null, INK_SOFT, LINE_THIN);
    }
    const zc = g.zf - g.t / 2;
    if (g.hump > 0) D.rr(ctx, 0, g.zf - g.t - g.hump / 2, g.W * 0.7, g.hump, 0.005, '#5a5d62', INK_SOFT, LINE_THIN);
    D.rr(ctx, 0, zc, g.W, g.t, 0.004, cfg.stand === 'frame' ? tint(c.frame, 0.2) : '#2c2e33');
    D.line(ctx, -g.sw / 2, g.zf - 0.002, g.sw / 2, g.zf - 0.002, '#7fa7c9', LINE_THIN);
  });
}

function tvItem(cfg: TvCfg): FurnitureDef {
  const g = tvGeom(cfg);
  const wall = cfg.stand === 'wall' || cfg.stand === 'frame';
  return {
    id: cfg.id,
    name: cfg.name,
    category: CAT,
    group: G_TV,
    tags: ['טלוויזיה', 'מסך', `${cfg.inch} אינץ'`, ...cfg.tags],
    size: { w: +g.w.toFixed(3), d: g.d, h: +g.h.toFixed(3) },
    ...(wall ? { mount: 'wall' as const, elevation: cfg.stand === 'frame' ? 1.05 : 1.0 } : {}),
    colors: [
      slot('frame', cfg.stand === 'frame' ? 'מסגרת' : 'מסגרת מסך', cfg.frame ?? '#1b1c1f'),
      ...(wall ? [] : [slot('stand', 'מעמד', cfg.standColor ?? '#2a2b2e')]),
    ],
    actions: [{ kind: 'tv' }],
    build: ({ colors: c }) => buildTv(cfg, c),
    draw2d: (ctx, c) => drawTv(ctx, cfg, c),
  };
}

const TVS: FurnitureDef[] = [
  tvItem({ id: 'tv-32-feet', name: 'טלוויזיה 32" על רגליות', inch: 32, stand: 'feet', tags: ['קטנה', 'חדר שינה'] }),
  tvItem({ id: 'tv-43-feet', name: 'טלוויזיה 43" על רגליות', inch: 43, stand: 'feet', tags: ['חכמה'], frame: '#2b2d31' }),
  tvItem({ id: 'tv-55-pedestal', name: 'טלוויזיה 55" על מעמד מרכזי', inch: 55, stand: 'pedestal', tags: ['חכמה', '4K'] }),
  tvItem({ id: 'tv-65-feet', name: 'טלוויזיה 65" על רגליות', inch: 65, stand: 'feet', tags: ['4K', 'סלון'], standColor: '#b9bcc0' }),
  tvItem({ id: 'tv-75-pedestal', name: 'טלוויזיה 75" על מעמד מרכזי', inch: 75, stand: 'pedestal', tags: ['ענקית', 'קולנוע ביתי'], standColor: '#5a5d62' }),
  tvItem({ id: 'tv-85-feet', name: 'טלוויזיה 85" על רגליות', inch: 85, stand: 'feet', tags: ['ענקית', 'קולנוע ביתי', '8K'] }),
  tvItem({ id: 'tv-55-wall', name: 'טלוויזיה 55" תלויה על הקיר', inch: 55, stand: 'wall', tags: ['תלייה', 'קיר', 'דקה'] }),
  tvItem({ id: 'tv-65-wall', name: 'טלוויזיה 65" תלויה על הקיר', inch: 65, stand: 'wall', tags: ['תלייה', 'קיר', 'OLED'] }),
  tvItem({ id: 'tv-75-wall', name: 'טלוויזיה 75" תלויה על הקיר', inch: 75, stand: 'wall', tags: ['תלייה', 'קיר', 'ענקית'] }),
  tvItem({ id: 'tv-55-frame', name: 'טלוויזיית אמנות 55" במסגרת עץ', inch: 55, stand: 'frame', tags: ['מסגרת', 'אמנות', 'קיר', 'עץ'], frame: PAL.oak }),
  tvItem({ id: 'tv-65-swivel-stand', name: 'טלוויזיה 65" על עמוד מסתובב', inch: 65, stand: 'swivel', tags: ['מעמד רצפה', 'מסתובב', 'עמוד'] }),
];

/* ------------------------------------------------------------------ projector + screen */

const PSCR = { w: 2.24, d: 0.1, h: 1.62, sw: 2.0, sh: 1.24 };

const projectorScreen: FurnitureDef = {
  id: 'tv-projector-screen',
  name: 'מסך הקרנה נגלל',
  category: CAT,
  group: G_TV,
  tags: ['מקרן', 'מסך', 'קולנוע ביתי', 'נגלל', 'קיר'],
  size: { w: PSCR.w, d: PSCR.d, h: PSCR.h },
  mount: 'wall',
  elevation: 0.88,
  colors: [slot('case', 'מארז', PAL.white)],
  actions: [{ kind: 'tv', label: 'הקרן סרט' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { w, d, h, sw, sh } = PSCR;
    const caseM = M.paint(c.case, 0.35);
    // roller case along the top (with end caps) on two wall brackets
    const cy = h - 0.1;
    const zc = -d / 2 + 0.05;
    for (const sx of [-1, 1]) k.box(0.05, 0.08, 0.04, M.blackMetal(), sx * (w / 2 - 0.25), cy + 0.01, -d / 2 + 0.02);
    xcyl(k, 0.045, w - 0.04, caseM, 0, cy + 0.05, zc, 18);
    k.box(w - 0.04, 0.05, 0.09, caseM, 0, cy + 0.045, zc + 0.002);
    for (const sx of [-1, 1]) k.rbox(0.02, 0.1, 0.1, 0.008, M.plastic('#2b2c2f'), sx * (w / 2 - 0.01), cy, zc, 1);
    // black masking border + the projection surface (the animated "screen")
    const top = cy;
    const sTot = top - 0.06;
    k.box(sw + 0.1, sTot, 0.002, M.matte('#141416'), 0, 0.06, zc + 0.01);
    const s = k.part('screen');
    s.box(sw, sh, 0.002, M.matte('#eef0f2'), 0, sTot - 0.08 - sh + 0.06, zc + 0.012);
    // weighted bottom bar + pull cord
    k.rbox(sw + 0.14, 0.03, 0.03, 0.01, M.blackMetal(), 0, 0.03, zc + 0.01, 1);
    k.rod([0, 0.03, zc + 0.026], [0, -0.0 + 0.0, zc + 0.026], 0.003, M.cloth('#222'));
    k.sphere(0.012, M.plastic('#1b1c1f'), 0, 0.016, zc + 0.026, 1, 1, 1, 10);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, PSCR.w - 0.02, PSCR.d - 0.01, 0.04, tint(c.case, 0.1));
      D.line(ctx, -PSCR.sw / 2, PSCR.d / 2 - 0.035, PSCR.sw / 2, PSCR.d / 2 - 0.035, '#7fa7c9', LINE_THIN);
    }),
};

const projector: FurnitureDef = {
  id: 'tv-projector-stand',
  name: 'מקרן ביתי על שולחן צד',
  category: CAT,
  group: G_TV,
  tags: ['מקרן', 'קולנוע ביתי', 'שולחן צד'],
  size: { w: 0.42, d: 0.42, h: 0.76 },
  colors: [slot('body', 'מקרן', PAL.white), slot('table', 'שולחן', PAL.walnut)],
  light: { x: 0, y: 0.69, z: 0.19, color: '#e9f1ff', intensity: 6, distance: 4 },
  actions: [{ kind: 'light', label: 'הדלק מקרן' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const wood = M.wood(c.table);
    // round pedestal side table
    k.disc(0.2, 0.03, wood, 0, 0.6, 0, 32);
    k.cyl(0.025, 0.58, M.blackMetal(), 0, 0.02, 0, 0.022, 12);
    k.cyl(0.17, 0.02, M.blackMetal(), 0, 0, 0, 0.16, 28);
    // projector body
    const body = M.plastic(c.body);
    k.rbox(0.3, 0.1, 0.24, 0.025, body, 0, 0.63, 0, 2);
    k.box(0.22, 0.004, 0.16, M.matte(darken(c.body, 0.15)), 0, 0.73, -0.01);
    // vents on the sides
    for (let i = 0; i < 6; i++) for (const sx of [-1, 1]) k.box(0.002, 0.05, 0.008, M.matte('#2b2c2f'), sx * 0.15, 0.655, -0.08 + i * 0.022);
    // lens barrel + glowing lens
    zcyl(k, 0.042, 0.03, M.plastic('#1d1e21'), 0.07, 0.68, 0.125, 20);
    const glow = k.part('glow');
    zcyl(glow, 0.03, 0.004, M.glow('#dfe9ff', 2.2, '#f4f8ff'), 0.07, 0.68, 0.142, 18);
    // buttons + LED
    for (let i = 0; i < 3; i++) k.cyl(0.006, 0.004, M.plastic('#8b8d90'), -0.09 + i * 0.022, 0.73, 0.06, 0.006, 8);
    led(k, -0.11, 0.66, 0.12, '#5dd2ff');
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.circle(ctx, 0, 0, 0.2, tint(c.table, 0.4));
      D.rr(ctx, 0, 0, 0.3, 0.24, 0.03, tint(c.body, 0.1));
      D.circle(ctx, 0.07, 0.12, 0.04, '#4a4d52', INK, LINE_THIN);
      D.poly(ctx, [[0.07, 0.15], [0.03, 0.22], [0.11, 0.22]], true, '#fff6c9', INK_SOFT, LINE_THIN);
    }),
};

/* ================================================================== MUSIC */

const CONE = '#232427';

/** Floor-standing tower speaker centred at x (footprint 0.26 × 0.34). */
function towerSpeaker(k: Kit, x: number, c: C): void {
  const body = M.lacquer(c.body);
  const baffle = M.matte(c.baffle);
  const cone = M.cloth(CONE);
  const rim = M.rubber('#1a1a1c');
  const w = 0.22;
  const d = 0.3;
  const h = 1.0;
  const y0 = 0.05;
  // plinth with spikes
  k.rbox(0.26, 0.022, 0.34, 0.006, M.blackMetal(), x, y0 - 0.022, 0, 1);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl(0.008, 0.028, M.chrome(), x + sx * 0.105, 0, sz * 0.145, 0.012, 8);
  k.rbox(w, h, d, 0.012, body, x, y0, -0.005, 1);
  const zf = d / 2 - 0.005;
  k.rbox(w - 0.02, h - 0.03, 0.006, 0.006, baffle, x, y0 + 0.015, zf, 1);
  const zb = zf + 0.003;
  tweeter(k, x, y0 + 0.9, zb, 0.013, M.brushed('#8d9094'), M.metal('#d8d8d8', 0.25, 0.6));
  for (const [yy, r] of [[0.78, 0.055], [0.6, 0.075], [0.4, 0.075]] as const) {
    zcyl(k, r * 1.18, 0.004, M.brushed('#6f7276'), x, y0 + yy, zb + 0.002, 20);
    driver(k.part('pulse', x, y0 + yy, zb + 0.005), r, cone, rim, M.metal('#c8c9cb', 0.3, 0.8));
  }
  // bass reflex port
  zcyl(k, 0.028, 0.01, M.matte('#08080a'), x, y0 + 0.17, zb + 0.004, 16);
  k.geo(new THREE.TorusGeometry(0.03, 0.005, 4, 12), M.plastic('#1b1c1f'), x, y0 + 0.17, zb + 0.008);
}

function drawTower(ctx: Ctx2D, x: number, c: C): void {
  D.rr(ctx, x, 0, 0.26, 0.34, 0.01, '#4a4d52', INK_SOFT, LINE_THIN);
  D.rr(ctx, x, -0.005, 0.22, 0.3, 0.012, tint(c.body, 0.3));
  D.line(ctx, x - 0.09, 0.145, x + 0.09, 0.145, INK, LINE_THIN * 2);
}

const speakerColors = [slot('body', 'ארון', '#2a1d16'), slot('baffle', 'חזית', '#141416')];

const towerPair: FurnitureDef = {
  id: 'speaker-tower-pair',
  name: 'זוג רמקולי עמוד לקולנוע ביתי',
  category: CAT,
  group: G_MUSIC,
  tags: ['רמקולים', 'קולנוע ביתי', 'סטריאו', 'עמוד'],
  size: { w: 1.6, d: 0.34, h: 1.05 },
  colors: speakerColors,
  actions: [{ kind: 'music' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    for (const sx of [-1, 1]) towerSpeaker(k, sx * 0.67, c);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      for (const sx of [-1, 1]) drawTower(ctx, sx * 0.67, c);
      D.line(ctx, -0.5, 0, 0.5, 0, INK_SOFT, LINE_THIN);
    }),
};

const towerSingle: FurnitureDef = {
  id: 'speaker-tower',
  name: 'רמקול עמוד',
  category: CAT,
  group: G_MUSIC,
  tags: ['רמקול', 'קולנוע ביתי', 'עמוד'],
  size: { w: 0.26, d: 0.34, h: 1.05 },
  colors: [slot('body', 'ארון', PAL.walnut), slot('baffle', 'חזית', '#141416')],
  actions: [{ kind: 'music' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    towerSpeaker(k, 0, c);
    return k.g;
  },
  draw2d: (ctx, c) => sym(ctx, () => drawTower(ctx, 0, c)),
};

const bookshelfPair: FurnitureDef = {
  id: 'speaker-bookshelf-stands',
  name: 'זוג רמקולי מדף על עמודונים',
  category: CAT,
  group: G_MUSIC,
  tags: ['רמקולים', 'סטריאו', 'מדף', 'עמודון'],
  size: { w: 1.2, d: 0.3, h: 0.96 },
  colors: [slot('body', 'ארון', PAL.oak), slot('baffle', 'חזית', '#1b1c1f')],
  actions: [{ kind: 'music' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const stand = M.blackMetal();
    for (const sx of [-1, 1]) {
      const x = sx * 0.48;
      // stand: base plate, twin pillars, top plate
      k.rbox(0.24, 0.014, 0.28, 0.005, stand, x, 0, 0, 1);
      for (const px of [-1, 1]) k.rbox(0.04, 0.6, 0.04, 0.006, stand, x + px * 0.05, 0.014, 0, 1);
      k.rbox(0.18, 0.012, 0.2, 0.004, stand, x, 0.614, 0, 1);
      // speaker
      const y0 = 0.626;
      k.rbox(0.19, 0.33, 0.26, 0.012, M.wood(c.body), x, y0, 0, 2);
      k.rbox(0.18, 0.32, 0.006, 0.008, M.matte(c.baffle), x, y0 + 0.005, 0.128, 1);
      tweeter(k, x, y0 + 0.26, 0.131, 0.012, M.brushed('#8d9094'), M.metal('#d6d6d6', 0.25, 0.6));
      zcyl(k, 0.075, 0.004, M.brushed('#6f7276'), x, y0 + 0.12, 0.133, 20);
      driver(k.part('pulse', x, y0 + 0.12, 0.136), 0.064, M.cloth('#d8cfba'), M.rubber(), M.matte('#2a2a2c'));
      led(k, x, y0 + 0.03, 0.131, '#73b5ff', 0.004);
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      for (const sx of [-1, 1]) {
        D.rr(ctx, sx * 0.48, 0, 0.24, 0.28, 0.01, '#55585c', INK_SOFT, LINE_THIN);
        D.rr(ctx, sx * 0.48, 0, 0.19, 0.26, 0.012, tint(c.body, 0.3));
        D.line(ctx, sx * 0.48 - 0.08, 0.125, sx * 0.48 + 0.08, 0.125, INK, LINE_THIN * 2);
      }
    }),
};

const soundbar: FurnitureDef = {
  id: 'speaker-soundbar-wall',
  name: 'מקרן קול (סאונדבר) לתלייה',
  category: CAT,
  group: G_MUSIC,
  tags: ['סאונדבר', 'רמקול', 'קולנוע ביתי', 'קיר'],
  size: { w: 1.0, d: 0.1, h: 0.075 },
  mount: 'wall',
  elevation: 0.86,
  colors: [slot('fabric', 'בד', '#3a3b3e'), slot('body', 'גוף', '#1e1f22')],
  actions: [{ kind: 'music' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const zb = -0.05;
    k.box(0.4, 0.05, 0.02, M.blackMetal(), 0, 0.012, zb + 0.01);
    k.rbox(0.99, 0.072, 0.08, 0.03, M.plastic(c.body), 0, 0.0015, 0.01, 2);
    k.rbox(0.97, 0.06, 0.012, 0.02, M.fabric(c.fabric, 40), 0, 0.0075, 0.044, 2);
    // top touch buttons + status LED row
    for (let i = 0; i < 4; i++) k.cyl(0.006, 0.002, M.plastic('#6a6c70'), -0.06 + i * 0.04, 0.073, 0.0, 0.006, 10);
    for (let i = 0; i < 5; i++) led(k, -0.04 + i * 0.02, 0.012, 0.05, '#f5f5ff', 0.003);
    // drivers barely visible behind the fabric: animated cones
    for (const sx of [-0.33, 0, 0.33]) driver(k.part('pulse', sx, 0.0375, 0.039), 0.022, M.cloth('#18181a'), M.rubber());
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0.01, 0.99, 0.08, 0.03, tint(c.body, 0.4));
      D.line(ctx, -0.46, 0.045, 0.46, 0.045, tint(c.fabric, 0.1), LINE_THIN * 2);
    }),
};

const subwoofer: FurnitureDef = {
  id: 'speaker-subwoofer',
  name: 'סאבוופר',
  category: CAT,
  group: G_MUSIC,
  tags: ['רמקול', 'בס', 'קולנוע ביתי'],
  size: { w: 0.4, d: 0.42, h: 0.44 },
  colors: [slot('body', 'ארון', '#1f2023')],
  actions: [{ kind: 'music' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl(0.03, 0.025, M.rubber(), sx * 0.15, 0, sz * 0.16, 0.026, 12);
    k.rbox(0.4, 0.41, 0.4, 0.015, M.lacquer(c.body), 0, 0.025, -0.01, 2);
    zcyl(k, 0.155, 0.006, M.brushed('#5f6266'), 0, 0.235, 0.193, 28);
    driver(k.part('pulse', 0, 0.235, 0.198), 0.135, M.matte('#2b2c2e'), M.rubber('#1a1a1c'), M.brushed('#8a8d90'));
    led(k, 0.15, 0.06, 0.19, '#5dd2ff');
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, -0.01, 0.4, 0.4, 0.015, tint(c.body, 0.4));
      D.line(ctx, -0.155, 0.2, 0.155, 0.2, INK, LINE_THIN * 2);
    }),
};

/* ------------------------------------------------------------------ record player */

/** Turntable centred at (x, y, z) (plinth 0.44 × 0.34). */
function turntable(k: Kit, x: number, y: number, z: number, plinth: THREE.Material, label: string, rot = 0): void {
  const t = new Kit();
  t.rbox(0.44, 0.09, 0.34, 0.01, plinth, 0, 0.015, 0, 1);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) t.cyl(0.025, 0.015, M.rubber(), sx * 0.18, 0, sz * 0.13, 0.022, 8);
  t.box(0.43, 0.002, 0.33, M.matte('#1b1c1f'), 0, 0.105, 0);
  // platter + record + label = the part that spins (pivot on the spindle axis)
  const sp = t.part('spin', -0.05, 0.107, 0);
  sp.cyl(0.15, 0.018, M.brushed('#b9bcbf'), 0, 0, 0, 0.15, 28);
  sp.cyl(0.148, 0.002, M.lacquer('#121214'), 0, 0.018, 0, 0.148, 28);
  sp.cyl(0.11, 0.0004, M.lacquer('#2a2a2f'), 0, 0.0198, 0, 0.11, 24);
  sp.cyl(0.045, 0.0008, M.matte(label), 0, 0.0198, 0, 0.045, 24);
  sp.box(0.04, 0.001, 0.008, M.matte(lighten(label, 0.6)), 0.015, 0.02, 0);
  sp.cyl(0.003, 0.016, M.chrome(), 0, 0.02, 0, 0.003, 8);
  // tonearm: pivot base at the right-back, arm resting near the record edge
  const px = 0.15;
  const pz = -0.1;
  t.cyl(0.022, 0.02, M.brushed('#9fa2a5'), px, 0.107, pz, 0.02, 16);
  t.cyl(0.008, 0.028, M.chrome(), px, 0.127, pz, 0.008, 10);
  t.rod([px, 0.15, pz], [-0.03, 0.135, 0.1], 0.004, M.chrome());
  t.rod([px, 0.15, pz], [px + 0.01, 0.15, pz - 0.06], 0.004, M.chrome());
  xcyl(t, 0.012, 0.03, M.metal('#3a3b3e', 0.4, 0.8), px + 0.012, 0.15, pz - 0.065, 12).rotation.y = Math.PI / 2;
  t.box(0.018, 0.006, 0.03, M.matte('#1b1c1f'), -0.034, 0.128, 0.108);
  // arm rest + speed buttons + start/stop
  t.cyl(0.004, 0.03, M.chrome(), px + 0.02, 0.107, 0.06, 0.004, 8);
  t.cyl(0.012, 0.004, M.brushed('#c8cacc'), -0.17, 0.107, 0.13, 0.012, 14);
  for (let i = 0; i < 2; i++) t.box(0.022, 0.004, 0.012, M.brushed('#c8cacc'), -0.13 + i * 0.03, 0.107, 0.135);
  led(t, -0.19, 0.09, 0.17, '#ff6a3d', 0.004);
  const g = k.sub(t, x, y, z);
  g.rotation.y = rot;
}

const RECORD_SLEEVES = ['#d64f3c', '#2f6db3', '#e8c547', '#1c1c1c', '#f0ebe0', '#5d8a4e', '#9b4a8c', '#e07a2e', '#3a3a3a', '#7fb6c9'];

/** A row of LP sleeves standing on edge along X from x0 to x1 (bottom y, centre z). */
function recordRow(k: Kit, x0: number, x1: number, y: number, z: number, size: number, seed: number, minT = 0.004): void {
  const r = rng(seed);
  let x = x0;
  while (x < x1 - 0.004) {
    const th = minT + r() * 0.004;
    const col = RECORD_SLEEVES[Math.floor(r() * RECORD_SLEEVES.length)];
    const m = k.box(th, size, size, M.matte(col), x + th / 2, y, z);
    m.rotation.z = (r() - 0.5) * 0.06;
    x += th + 0.0008;
  }
}

const recordPlayer: FurnitureDef = {
  id: 'music-record-player-cabinet',
  name: 'פטיפון על שידת תקליטים',
  category: CAT,
  group: G_MUSIC,
  tags: ['פטיפון', 'תקליטים', 'ויניל', 'רטרו', 'שידה'],
  size: { w: 1.2, d: 0.42, h: 0.92 },
  colors: [slot('wood', 'שידה', PAL.walnut), slot('plinth', 'פטיפון', '#2b2420'), slot('label', 'תווית תקליט', '#d64f3c')],
  actions: [{ kind: 'music' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const wood = M.wood(c.wood);
    const w = 1.2;
    const d = 0.42;
    const h = 0.62;
    const t = 0.02;
    const legH = 0.18;
    legs4(k, w - 0.06, d - 0.06, legH, wood, { rTop: 0.02, rBot: 0.011, splay: 0.02, inset: 0.05 });
    // carcass: open record compartment on the left, two sliding doors on the right
    k.box(w, t, d, wood, 0, legH, 0);
    k.rbox(w, t, d, 0.004, wood, 0, h - t, 0, 1);
    for (const sx of [-1, 1]) k.box(t, h - legH - 2 * t, d, wood, sx * (w / 2 - t / 2), legH + t, 0);
    k.box(t, h - legH - 2 * t, d - 0.02, wood, -0.12, legH + t, -0.01);
    k.box(w - 2 * t, h - legH - 2 * t, 0.006, M.matte('#2a2220'), 0, legH + t, -d / 2 + 0.003);
    recordRow(k, -w / 2 + t + 0.01, -0.13 - 0.01, legH + t, 0.0, 0.31, 4);
    // cane doors
    for (const [x0, x1] of [[-0.11, 0.24], [0.24, w / 2 - t]] as const) {
      const fw = x1 - x0 - 0.004;
      k.box(fw, h - legH - 2 * t - 0.008, 0.016, wood, (x0 + x1) / 2, legH + t + 0.004, d / 2 - 0.012);
      k.box(fw - 0.06, h - legH - 2 * t - 0.07, 0.004, M.rattan('#c9a77a'), (x0 + x1) / 2, legH + t + 0.035, d / 2 - 0.003);
    }
    // turntable on top + a small crate of records
    turntable(k, -0.24, h, 0.0, M.wood(c.plinth, 0.4), c.label);
    const cx = 0.33;
    const cw = 0.36;
    const cd = 0.34;
    const crate = M.wood(PAL.oakLight);
    for (const sz of [-1, 1]) k.box(cw, 0.2, 0.012, crate, cx, h, sz * (cd / 2 - 0.006));
    for (const sx of [-1, 1]) k.box(0.012, 0.2, cd - 0.024, crate, cx + sx * (cw / 2 - 0.006), h, 0);
    k.box(cw - 0.024, 0.01, cd - 0.024, crate, cx, h, 0);
    for (let i = 0; i < 28; i++) {
      const r = rng(9 + i);
      const m = k.box(0.31, 0.31, 0.004, M.matte(RECORD_SLEEVES[i % RECORD_SLEEVES.length]), cx, h + 0.01, -0.14 + i * 0.0095);
      m.rotation.x = -0.18 + (r() - 0.5) * 0.04;
      m.position.y = h + 0.01 + 0.155 * Math.cos(m.rotation.x) - 0.002;
      m.scale.set(0.98, 0.9, 1);
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 1.2, 0.42, 0.01, tint(c.wood, 0.35));
      D.rr(ctx, -0.24, 0, 0.44, 0.34, 0.012, tint(c.plinth, 0.3));
      D.circle(ctx, -0.29, 0, 0.15, '#3a3b3e');
      D.circle(ctx, -0.29, 0, 0.045, tint(c.label, 0.2), INK, LINE_THIN);
      D.line(ctx, -0.09, -0.1, -0.27, 0.1, '#b9bcbf', LINE_THIN * 1.5);
      D.rr(ctx, 0.33, 0, 0.36, 0.34, 0.005, tint(PAL.oakLight, 0.2));
      for (let i = 0; i < 6; i++) D.line(ctx, 0.17, -0.12 + i * 0.05, 0.49, -0.12 + i * 0.05, INK_SOFT, LINE_THIN);
    }),
};

/* ------------------------------------------------------------------ vintage console radio */

const consoleRadio: FurnitureDef = {
  id: 'music-radio-console-vintage',
  name: 'רדיו קונסולה וינטג\'',
  category: CAT,
  group: G_MUSIC,
  tags: ['רדיו', 'וינטג\'', 'רטרו', 'שנות ה-50', 'עץ'],
  size: { w: 1.0, d: 0.44, h: 0.82 },
  colors: [slot('wood', 'עץ', '#8a5a36'), slot('cloth', 'בד רמקול', '#cdb892')],
  actions: [{ kind: 'music' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const wood = M.wood(c.wood, 0.4);
    const brass = M.brass();
    legs4(k, 0.94, 0.36, 0.2, wood, { rTop: 0.022, rBot: 0.012, splay: 0.025, inset: 0.05 });
    k.rbox(1.0, 0.6, 0.4, 0.02, wood, 0, 0.2, -0.01, 2);
    k.rbox(1.0, 0.025, 0.42, 0.01, wood, 0, 0.795, 0, 1);
    // speaker grille: cloth panel with vertical wooden slats
    const zf = 0.19;
    k.box(0.56, 0.38, 0.004, M.linen(c.cloth), -0.17, 0.27, zf + 0.001);
    const pulse = k.part('pulse', -0.17, 0.46, zf + 0.004);
    pulse.cyl(0.14, 0.004, M.linen(darken(c.cloth, 0.12)), 0, -0.002, 0, 0.14, 28).rotation.x = Math.PI / 2;
    for (let i = 0; i < 7; i++) k.box(0.018, 0.4, 0.014, wood, -0.42 + i * 0.083, 0.26, zf + 0.008);
    k.box(0.6, 0.02, 0.016, wood, -0.17, 0.25, zf + 0.008);
    k.box(0.6, 0.02, 0.016, wood, -0.17, 0.66, zf + 0.008);
    // glowing tuning dial
    k.rbox(0.3, 0.14, 0.012, 0.01, brass, 0.3, 0.6, zf + 0.004, 1);
    k.box(0.27, 0.11, 0.003, M.glow('#ffb35c', 1.1, '#f6e3b8'), 0.3, 0.615, zf + 0.011);
    for (let i = 0; i < 9; i++) k.box(0.002, 0.03, 0.001, M.matte('#5a3e22'), 0.19 + i * 0.027, 0.655, zf + 0.0125);
    k.box(0.003, 0.09, 0.002, M.matte('#c62828'), 0.27, 0.625, zf + 0.0125);
    // knobs
    for (const kx of [0.2, 0.3, 0.4]) knob(k, kx, 0.48, zf, 0.026, M.wood('#4a3020', 0.35), 0.03);
    for (const kx of [0.2, 0.3, 0.4]) zcyl(k, 0.029, 0.003, brass, kx, 0.48, zf + 0.002, 16);
    // push-buttons band
    for (let i = 0; i < 5; i++) k.rbox(0.04, 0.025, 0.02, 0.005, M.ceramic('#f1ead8'), 0.22 + i * 0.045, 0.36, zf + 0.008, 1);
    k.box(0.28, 0.006, 0.006, brass, 0.31, 0.33, zf + 0.004);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 1.0, 0.42, 0.02, tint(c.wood, 0.35));
      for (const kx of [0.2, 0.3, 0.4]) D.circle(ctx, kx, 0.205, 0.015, tint('#4a3020', 0.3), INK, LINE_THIN);
      D.line(ctx, -0.45, 0.19, 0.11, 0.19, tint(c.cloth, 0), LINE_THIN * 2);
      D.rr(ctx, 0.3, 0.19, 0.3, 0.02, 0.005, '#f6c27a', INK_SOFT, LINE_THIN);
    }),
};

/* ------------------------------------------------------------------ jukebox */

/** Points of an arch (vertical straight sides up to `hs`, semicircular top) in the XY plane at z. */
function archPts(r: number, hs: number, y0: number, z: number, n = 14): V3[] {
  const pts: V3[] = [[-r, y0, z]];
  pts.push([-r, y0 + hs, z]);
  for (let i = 1; i < n; i++) {
    const a = Math.PI - (Math.PI * i) / n;
    pts.push([Math.cos(a) * r, y0 + hs + Math.sin(a) * r, z]);
  }
  pts.push([r, y0 + hs, z]);
  pts.push([r, y0, z]);
  return pts;
}

function archShape(r: number, hs: number, y0: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-r, y0);
  s.lineTo(r, y0);
  s.lineTo(r, y0 + hs);
  s.absarc(0, y0 + hs, r, 0, Math.PI, false);
  s.lineTo(-r, y0);
  return s;
}

const jukebox: FurnitureDef = {
  id: 'music-jukebox',
  name: 'ג\'וקבוקס רטרו מואר',
  category: CAT,
  group: G_MUSIC,
  tags: ['ג\'וקבוקס', 'רטרו', 'שנות ה-50', 'תקליטים', 'ניאון'],
  size: { w: 0.9, d: 0.62, h: 1.6 },
  colors: [slot('body', 'גוף', '#7a1f24'), slot('glow1', 'תאורה פנימית', '#ffb03a'), slot('glow2', 'תאורה חיצונית', '#ff4f8b')],
  actions: [{ kind: 'music', variant: 'jukebox' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const body = M.lacquer(c.body);
    const chrome = M.chrome();
    const R = 0.45;
    const hs = 1.1;
    const d = 0.56;
    // main arched cabinet
    k.geo(extrudeZ(archShape(R - 0.012, hs, 0.05), d, 0.01, 14), body, 0, 0, -0.02);
    k.rbox(0.86, 0.04, 0.56, 0.01, M.blackMetal(), 0, 0, -0.02, 1);
    const zf = d / 2 - 0.02;
    // glowing arch tubes (outer + inner)
    k.tube(archPts(R - 0.03, hs - 0.04, 0.08, zf + 0.012), 0.022, M.glow(c.glow2, 1.6, lighten(c.glow2, 0.5)), { seg: 36, radial: 6, tension: 0.2 });
    k.tube(archPts(R - 0.085, hs - 0.06, 0.12, zf + 0.01), 0.016, M.glow(c.glow1, 1.6, lighten(c.glow1, 0.5)), { seg: 36, radial: 6, tension: 0.2 });
    k.tube(archPts(R - 0.055, hs - 0.05, 0.1, zf + 0.004), 0.006, chrome, { seg: 30, radial: 5, tension: 0.2 });
    // record carousel window under the dome
    const wy = 0.95;
    k.geo(extrudeZ(archShape(0.25, 0.25, wy), 0.006, 0, 16), M.matte('#1b1416'), 0, 0, zf - 0.05);
    const sp = k.part('spin', 0, wy + 0.12, zf - 0.17);
    sp.cyl(0.14, 0.004, M.lacquer('#111113'), 0, 0, 0, 0.14, 28);
    sp.cyl(0.04, 0.001, M.matte(c.glow1), 0, 0.004, 0, 0.04, 16);
    sp.box(0.03, 0.001, 0.006, M.matte('#ffffff'), 0.012, 0.005, 0);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const m = sp.box(0.003, 0.17, 0.17, M.lacquer('#151517'), Math.cos(a) * 0.2, 0.0, Math.sin(a) * 0.2 - 0.0);
      m.rotation.y = -a;
      m.scale.set(1, 1, 0.8);
    }
    k.cyl(0.02, 0.06, chrome, 0, wy + 0.06, zf - 0.17, 0.02, 12);
    k.geo(extrudeZ(archShape(0.25, 0.25, wy), 0.004, 0, 16), M.glass('#fff5e0', 0.18), 0, 0, zf + 0.002);
    // title strip panel with glowing song cards
    k.box(0.5, 0.18, 0.02, chrome, 0, 0.72, zf - 0.01);
    for (let r = 0; r < 2; r++) for (let i = 0; i < 6; i++) k.box(0.07, 0.07, 0.002, M.glow('#fff4d6', 0.8, '#fff9ec'), -0.2 + i * 0.08, 0.73 + r * 0.085, zf + 0.001);
    // selection buttons
    for (let i = 0; i < 10; i++) k.rbox(0.032, 0.028, 0.03, 0.006, M.ceramic(i % 2 ? '#f1ead8' : '#e0c27a'), -0.2 + i * 0.045, 0.64, zf - 0.005, 1);
    // speaker grille with chrome bars
    k.box(0.6, 0.42, 0.006, M.fabric('#2a1f1c', 30), 0, 0.12, zf - 0.002);
    for (let i = 0; i < 9; i++) k.rod([-0.3, 0.14 + i * 0.048, zf + 0.008], [0.3, 0.14 + i * 0.048, zf + 0.008], 0.005, chrome, 0.005, 8);
    k.box(0.62, 0.02, 0.02, chrome, 0, 0.56, zf - 0.006);
    // coin slot plate
    k.rbox(0.08, 0.05, 0.012, 0.004, chrome, 0.3, 0.57, zf, 1);
    k.box(0.004, 0.025, 0.002, M.matte('#111'), 0.3, 0.582, zf + 0.012);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 0.9, 0.56, 0.06, tint(c.body, 0.35));
      D.line(ctx, -0.42, 0.28, 0.42, 0.28, tint(c.glow2, 0), LINE_THIN * 3);
      D.circle(ctx, 0, 0.09, 0.14, '#3a3b3e', INK, LINE_THIN);
    }),
};

/* ------------------------------------------------------------------ boombox */

const boombox: FurnitureDef = {
  id: 'music-boombox',
  name: 'בומבוקס רטרו',
  category: CAT,
  group: G_MUSIC,
  tags: ['רדיו', 'טייפ', 'קסטות', 'רטרו', 'שנות ה-80'],
  size: { w: 0.62, d: 0.18, h: 0.4 },
  colors: [slot('body', 'גוף', '#c9ccd0'), slot('accent', 'פס צבע', '#d64f3c')],
  actions: [{ kind: 'music', variant: 'boombox' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const body = M.plastic(c.body);
    const dark = M.plastic('#1d1e21');
    const chrome = M.chrome();
    for (const sx of [-1, 1]) k.rbox(0.06, 0.012, 0.12, 0.005, M.rubber(), sx * 0.24, 0, 0, 1);
    k.rbox(0.62, 0.3, 0.16, 0.025, body, 0, 0.01, -0.01, 2);
    const zf = 0.07;
    // speakers
    for (const sx of [-1, 1]) {
      zcyl(k, 0.095, 0.006, dark, sx * 0.19, 0.15, zf + 0.001, 24);
      k.geo(new THREE.TorusGeometry(0.095, 0.006, 6, 24), chrome, sx * 0.19, 0.15, zf + 0.004);
      driver(k.part('pulse', sx * 0.19, 0.15, zf + 0.006), 0.075, M.cloth('#2a2b2e'), M.rubber(), chrome);
      tweeter(k, sx * 0.19, 0.27, zf, 0.012, dark, chrome);
    }
    // cassette deck + tape window
    k.rbox(0.18, 0.11, 0.008, 0.006, dark, 0, 0.06, zf, 1);
    k.box(0.12, 0.045, 0.002, M.glass('#3a2c28', 0.5), 0, 0.09, zf + 0.009);
    for (const sx of [-1, 1]) zcyl(k, 0.012, 0.002, M.matte('#f0ebe0'), sx * 0.03, 0.112, zf + 0.008, 12);
    // tuner window + accent stripe
    k.box(0.18, 0.05, 0.002, M.glow('#9fe3c4', 0.7, '#d9fff0'), 0, 0.2, zf + 0.001);
    for (let i = 0; i < 12; i++) k.box(0.001, 0.02, 0.001, M.matte('#1d1e21'), -0.08 + i * 0.0145, 0.215, zf + 0.0025);
    k.box(0.6, 0.012, 0.002, M.matte(c.accent), 0, 0.29, zf + 0.0015);
    // piano keys on top + handle + antenna
    for (let i = 0; i < 6; i++) k.box(0.028, 0.012, 0.03, i === 0 ? M.plastic(c.accent) : dark, -0.08 + i * 0.032, 0.31, 0.03);
    for (const sx of [-1, 1]) k.rbox(0.03, 0.04, 0.03, 0.006, dark, sx * 0.22, 0.31, -0.02, 1);
    k.tube([[-0.22, 0.34, -0.02], [-0.18, 0.385, -0.02], [0.18, 0.385, -0.02], [0.22, 0.34, -0.02]], 0.011, chrome, { seg: 24, radial: 8 });
    k.rod([0.27, 0.31, -0.06], [0.3, 0.395, -0.075], 0.003, chrome);
    for (const kx of [-0.05, 0.05]) knob(k, kx, 0.255, zf, 0.012, chrome, 0.012);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, -0.01, 0.62, 0.16, 0.025, tint(c.body, 0.2));
      for (const sx of [-1, 1]) D.line(ctx, sx * 0.19 - 0.09, 0.07, sx * 0.19 + 0.09, 0.07, INK, LINE_THIN * 2);
      D.line(ctx, -0.18, -0.02, 0.18, -0.02, INK_SOFT, LINE_THIN * 2);
    }),
};

/* ------------------------------------------------------------------ DJ booth */

const djBooth: FurnitureDef = {
  id: 'music-dj-booth',
  name: 'עמדת די-ג\'יי עם שני פטיפונים',
  category: CAT,
  group: G_MUSIC,
  tags: ['די ג\'יי', 'מיקסר', 'פטיפונים', 'מסיבה', 'תקליטים'],
  size: { w: 1.5, d: 0.7, h: 1.21 },
  colors: [slot('body', 'עמדה', '#1d1e21'), slot('led', 'פס לד', '#3fd0ff')],
  actions: [{ kind: 'music', variant: 'dj' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const body = M.matte(c.body);
    const top = M.lacquer(darken(c.body, 0.2));
    const w = 1.5;
    const d = 0.7;
    const th = 0.92;
    // side panels, back panel, top with glowing edge strip
    for (const sx of [-1, 1]) k.rbox(0.04, th - 0.03, d - 0.04, 0.006, body, sx * (w / 2 - 0.02), 0, 0, 1);
    k.box(w - 0.08, th - 0.2, 0.02, body, 0, 0.1, -d / 2 + 0.04);
    k.rbox(w, 0.03, d, 0.008, top, 0, th - 0.03, 0, 1);
    k.box(w - 0.1, 0.01, 0.006, M.glow(c.led, 2, lighten(c.led, 0.5)), 0, th - 0.045, d / 2 - 0.02);
    k.box(w - 0.1, 0.01, 0.006, M.glow(c.led, 2, lighten(c.led, 0.5)), 0, 0.03, d / 2 - 0.06);
    // lower shelf with a record crate
    k.box(w - 0.08, 0.02, d - 0.1, body, 0, 0.2, -0.02);
    recordRow(k, -0.6, -0.25, 0.22, 0.0, 0.31, 31, 0.008);
    // two decks + mixer
    for (const sx of [-1, 1]) turntable(k, sx * 0.46, th, 0.08, M.matte('#2a2b2e'), sx < 0 ? '#3fd0ff' : '#ff4f8b');
    const mx = M.matte('#26272a');
    k.rbox(0.3, 0.07, 0.34, 0.008, mx, 0, th, 0.08, 1);
    k.box(0.28, 0.002, 0.32, M.matte('#16171a'), 0, th + 0.07, 0.08);
    for (let col = 0; col < 4; col++) {
      for (let row = 0; row < 3; row++) k.cyl(0.011, 0.014, M.plastic(row === 0 ? '#c9ccd0' : '#3a3b3e'), -0.105 + col * 0.07, th + 0.072, -0.03 + row * 0.05, 0.01, 10);
      k.box(0.006, 0.002, 0.07, M.matte('#050506'), -0.105 + col * 0.07, th + 0.072, 0.15);
      k.box(0.022, 0.014, 0.012, M.plastic('#e6e7e9'), -0.105 + col * 0.07, th + 0.072, 0.13 + col * 0.012);
      for (let l = 0; l < 5; l++) k.box(0.006, 0.002, 0.006, M.glow(l < 3 ? '#5dff8a' : '#ff5a4a', 2.2), -0.105 + col * 0.07 + 0.03, th + 0.071, 0.07 - l * 0.012);
    }
    k.box(0.1, 0.002, 0.006, M.matte('#050506'), 0, th + 0.072, 0.225);
    k.box(0.014, 0.016, 0.024, M.plastic('#e6e7e9'), 0.02, th + 0.072, 0.225);
    // laptop on a stand behind the mixer
    k.rod([-0.1, th, -0.2], [-0.1, th + 0.05, -0.2], 0.006, M.brushed());
    k.rod([0.1, th, -0.2], [0.1, th + 0.05, -0.2], 0.006, M.brushed());
    k.rbox(0.34, 0.012, 0.23, 0.004, M.brushed('#b9bcbf'), 0, th + 0.05, -0.2, 1);
    const lid = k.box(0.34, 0.22, 0.008, M.brushed('#b9bcbf'), 0, 0, 0);
    lid.position.set(0, th + 0.062 + 0.108, -0.315 + 0.012);
    lid.rotation.x = -0.18;
    const scr = k.box(0.31, 0.18, 0.002, M.glow('#2a6fb3', 0.6, '#16324f'), 0, 0, 0);
    scr.position.set(0, th + 0.062 + 0.11, -0.308 + 0.012);
    scr.rotation.x = -0.18;
    // headphones resting on the top
    k.geo(new THREE.TorusGeometry(0.08, 0.008, 6, 18, Math.PI), M.plastic('#1b1c1f'), 0.62, th + 0.012, -0.26).rotation.x = -Math.PI / 2;
    for (const sx of [-1, 1]) k.cyl(0.04, 0.03, M.leather('#1b1c1f'), 0.62 + sx * 0.08, th, -0.26, 0.04, 14);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 1.5, 0.7, 0.01, tint(c.body, 0.55));
      for (const sx of [-1, 1]) {
        D.rr(ctx, sx * 0.46, 0.08, 0.44, 0.34, 0.012, '#8b8d90', INK, LINE_THIN);
        D.circle(ctx, sx * 0.46 - 0.05, 0.08, 0.15, '#3a3b3e', INK, LINE_THIN);
      }
      D.rr(ctx, 0, 0.08, 0.3, 0.34, 0.008, '#5a5d62', INK, LINE_THIN);
      D.rr(ctx, 0, -0.2, 0.34, 0.23, 0.004, '#c9ccd0', INK_SOFT, LINE_THIN);
      D.line(ctx, -0.7, 0.33, 0.7, 0.33, c.led, LINE_THIN * 2);
    }),
};

/* ------------------------------------------------------------------ karaoke mic */

const micStand: FurnitureDef = {
  id: 'music-karaoke-mic',
  name: 'עמדת קריוקי – מיקרופון ורמקול',
  category: CAT,
  group: G_MUSIC,
  tags: ['קריוקי', 'מיקרופון', 'שירה', 'רמקול', 'מסיבה'],
  size: { w: 0.64, d: 0.42, h: 1.58 },
  colors: [slot('speaker', 'רמקול', '#1d1e21'), slot('led', 'תאורת לד', '#c45dff')],
  actions: [{ kind: 'music', variant: 'karaoke', label: 'שר קריוקי' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const blk = M.blackMetal();
    // tripod mic stand (left)
    const mx = -0.1;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
      k.rod([mx + Math.cos(a) * 0.2, 0.012, Math.sin(a) * 0.2], [mx, 0.3, 0], 0.008, blk);
      k.sphere(0.012, M.rubber(), mx + Math.cos(a) * 0.2, 0.012, Math.sin(a) * 0.2, 1, 1, 1, 8);
    }
    k.cyl(0.016, 0.06, blk, mx, 0.28, 0, 0.016, 12);
    k.cyl(0.011, 0.9, blk, mx, 0.3, 0, 0.011, 10);
    k.cyl(0.008, 0.3, M.chrome(), mx, 1.18, 0, 0.008, 10);
    k.cyl(0.016, 0.03, blk, mx, 1.19, 0, 0.016, 12);
    // mic clip + handheld microphone tilted towards the singer (+Z)
    const mic = new Kit();
    mic.cyl(0.016, 0.17, M.matte('#1b1c1f'), 0, -0.17, 0, 0.022, 14);
    mic.cyl(0.024, 0.012, M.brushed('#9fa2a5'), 0, 0, 0, 0.024, 14);
    mic.sphere(0.03, M.brushed('#c8cacc'), 0, 0.035, 0, 1, 1, 1, 14);
    led(mic, 0, -0.1, 0.017, '#5dff8a', 0.003);
    const g = k.sub(mic, mx, 1.5, 0.05);
    g.rotation.x = 0.45;
    // small karaoke speaker on the floor (right) with LED ring
    const sx = 0.17;
    k.rbox(0.28, 0.42, 0.26, 0.02, M.plastic(c.speaker), sx, 0.02, -0.02, 2);
    for (const fx of [-1, 1]) for (const fz of [-1, 1]) k.cyl(0.015, 0.02, M.rubber(), sx + fx * 0.1, 0, -0.02 + fz * 0.09, 0.015, 8);
    const zf = 0.11;
    k.geo(new THREE.TorusGeometry(0.11, 0.008, 6, 24), M.glow(c.led, 2, lighten(c.led, 0.5)), sx, 0.22, zf + 0.002);
    driver(k.part('pulse', sx, 0.22, zf + 0.004), 0.095, M.cloth('#2a2b2e'), M.rubber(), M.matte('#3a3b3e'));
    tweeter(k, sx, 0.38, zf, 0.012, M.plastic('#2a2b2e'), M.brushed());
    k.rbox(0.2, 0.03, 0.06, 0.008, M.plastic('#2a2b2e'), sx, 0.44, -0.02, 1);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
        D.line(ctx, -0.1, 0, -0.1 + Math.cos(a) * 0.2, Math.sin(a) * 0.2, INK, LINE_THIN * 1.5);
      }
      D.circle(ctx, -0.1, 0.05, 0.03, '#c8cacc', INK, LINE_THIN);
      D.rr(ctx, 0.17, -0.02, 0.28, 0.26, 0.02, tint(c.speaker, 0.45));
      D.line(ctx, 0.06, 0.11, 0.28, 0.11, c.led, LINE_THIN * 2);
    }),
};

const MUSIC: FurnitureDef[] = [towerPair, towerSingle, bookshelfPair, soundbar, subwoofer, recordPlayer, consoleRadio, jukebox, boombox, djBooth, micStand];

/* ================================================================== INSTRUMENTS */

/**
 * Piano keyboard: `nWhite` white keys from x0 (left edge) with pitch `ww`, first key letter index
 * `start` into 'ABCDEFG' (A = 0, C = 2). Keys sit on y, front edge at zFront, length `len`.
 */
function keyboard(k: Kit, x0: number, nWhite: number, start: number, ww: number, y: number, zFront: number, len: number, white: THREE.Material, black: THREE.Material): void {
  for (let i = 0; i < nWhite; i++) k.box(ww - 0.0012, 0.02, len, white, x0 + (i + 0.5) * ww, y, zFront - len / 2);
  for (let i = 0; i < nWhite - 1; i++) {
    const L = 'ABCDEFG'[(start + i) % 7];
    if (L === 'B' || L === 'E') continue;
    k.box(ww * 0.55, 0.012, len * 0.62, black, x0 + (i + 1) * ww, y + 0.02, zFront - len + (len * 0.62) / 2);
  }
}

/** Piano bench centred at (x, z): legs + padded top whose surface is at `seatH`. */
function pianoBench(k: Kit, x: number, z: number, w: number, d: number, seatH: number, frame: THREE.Material, pad: THREE.Material): void {
  const legH = seatH - 0.07;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.rbox(0.045, legH, 0.045, 0.006, frame, x + sx * (w / 2 - 0.035), 0, z + sz * (d / 2 - 0.035), 1);
  k.box(w - 0.02, 0.06, d - 0.02, frame, x, legH - 0.06, z);
  k.rbox(w, 0.025, d, 0.006, frame, x, legH, z, 1);
  k.cushion(w - 0.02, 0.045, d - 0.02, pad, x, legH + 0.025, z, 0.02, 0.008);
  // tufting buttons
  for (const bx of [-1, 0, 1]) k.sphere(0.006, pad, x + bx * w * 0.28, seatH + 0.001, z, 1, 0.5, 1, 6);
}

const pianoColors = [slot('case', 'גוף', '#141416'), slot('cushion', 'ריפוד ספסל', '#1c1c1e')];

/* ------------------------------------------------------------------ upright piano */

const UP = { w: 1.5, d: 1.14, h: 1.27, zB: -0.57, benchZ: 0.39, seatH: 0.5 };

const uprightPiano: FurnitureDef = {
  id: 'piano-upright',
  name: 'פסנתר עומד עם ספסל',
  category: CAT,
  group: G_INST,
  tags: ['פסנתר', 'פסנתר זקוף', 'קלידים', 'מוזיקה', 'ספסל'],
  size: { w: UP.w, d: UP.d, h: UP.h },
  colors: pianoColors,
  seats: [{ x: 0, z: UP.benchZ, height: UP.seatH, facing: Math.PI, kind: 'sit' }],
  actions: [{ kind: 'piano' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const lac = M.lacquer(c.case);
    const brass = M.brass();
    const { w, zB } = UP;
    // cheeks, upper and lower case, top lid
    for (const sx of [-1, 1]) k.rbox(0.05, 1.24, 0.6, 0.006, lac, sx * (w / 2 - 0.025), 0, zB + 0.3, 1);
    k.box(w - 0.1, 0.4, 0.5, lac, 0, 0.84, zB + 0.25);
    k.box(w - 0.1, 0.6, 0.46, lac, 0, 0.02, zB + 0.23);
    k.rbox(w + 0.0, 0.03, 0.6, 0.008, lac, 0, 1.24, zB + 0.3, 1);
    // raised panels on the upper and lower fronts
    k.rbox(w - 0.3, 0.3, 0.012, 0.006, lac, 0, 0.88, zB + 0.505, 1);
    k.rbox(w - 0.36, 0.42, 0.012, 0.006, lac, 0, 0.1, zB + 0.465, 1);
    // keybed, key slip, arms and front legs
    k.box(w - 0.1, 0.06, 0.32, lac, 0, 0.64, -0.01);
    k.rbox(1.24, 0.045, 0.02, 0.004, lac, 0, 0.665, 0.16, 1);
    for (const sx of [-1, 1]) {
      k.rbox(0.13, 0.11, 0.36, 0.01, lac, sx * 0.685, 0.64, -0.005, 1);
      k.rbox(0.065, 0.64, 0.065, 0.01, lac, sx * 0.685, 0, 0.13, 1);
      k.rbox(0.075, 0.03, 0.3, 0.006, lac, sx * 0.685, 0, 0.0, 1);
    }
    keyboard(k, -0.61, 52, 0, 1.22 / 52, 0.7, 0.158, 0.15, M.ceramic('#f5f2ea'), M.lacquer('#0e0e10'));
    k.box(1.22, 0.004, 0.16, M.velvet('#7a1a1f'), 0, 0.698, 0.08);
    // fallboard folded back + music desk with a score
    k.box(1.22, 0.13, 0.016, lac, 0, 0.72, 0.0);
    k.box(0.9, 0.02, 0.06, lac, 0, 0.84, -0.03);
    const score = k.box(0.42, 0.29, 0.004, M.matte('#f6f2e6'), 0, 0, 0);
    score.position.set(0, 0.995, -0.04);
    score.rotation.x = -0.12;
    for (let i = 0; i < 7; i++) {
      const ln = k.box(0.36, 0.002, 0.001, M.matte('#555'), 0, 0, 0);
      ln.position.set(0, 0.9 + i * 0.033 + 0.01, -0.036 + (i * 0.033 + 0.01 - 0.095) * Math.sin(0.12));
      ln.rotation.x = -0.12;
    }
    // pedals + brass hinge line
    k.box(0.22, 0.05, 0.03, lac, 0, 0.02, zB + 0.475);
    for (const px of [-0.06, 0, 0.06]) k.rbox(0.025, 0.012, 0.09, 0.005, brass, px, 0.04, zB + 0.53, 1);
    k.box(1.22, 0.006, 0.006, brass, 0, 0.855, 0.007);
    // bench
    pianoBench(k, 0, UP.benchZ, 0.76, 0.34, UP.seatH, lac, M.leather(c.cushion));
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { w, zB } = UP;
      D.rr(ctx, 0, zB + 0.3, w, 0.6, 0.01, tint(c.case, 0.6));
      D.rr(ctx, 0, 0.0, 1.5, 0.34, 0.01, tint(c.case, 0.6));
      D.rr(ctx, 0, 0.08, 1.22, 0.15, 0, '#fbfaf6', INK, LINE_THIN);
      for (let i = 1; i < 52; i += 1) if (i % 7 !== 2 && i % 7 !== 5) D.line(ctx, -0.61 + i * (1.22 / 52), 0.01, -0.61 + i * (1.22 / 52), 0.1, INK, LINE_THIN * 1.6);
      D.rr(ctx, 0, UP.benchZ, 0.76, 0.34, 0.03, tint(c.cushion, 0.5));
    }),
};

/* ------------------------------------------------------------------ grand piano */

const GR = { w: 1.5, d: 2.35, h: 1.73, front: 0.45, keysFront: 0.6, benchZ: 0.96, seatH: 0.5, rimY: 0.66, rimTop: 0.98, lid: 0.5 };

/** Plan outline of the grand piano case in (x, z) points, scaled by s about (cx, cz), offset dx. */
function grandOutline(s = 1, dx = 0): THREE.Shape {
  const cx = 0;
  const cz = -0.35;
  const P = (x: number, z: number): [number, number] => [cx + (x - cx) * s + dx, -(cz + (z - cz) * s)];
  const sh = new THREE.Shape();
  sh.moveTo(...P(-0.75, 0.45));
  sh.lineTo(...P(0.75, 0.45));
  sh.lineTo(...P(0.75, -0.05));
  sh.bezierCurveTo(...P(0.75, -0.45), ...P(0.2, -0.55), ...P(0.05, -0.85));
  sh.bezierCurveTo(...P(-0.08, -1.1), ...P(-0.35, -1.175), ...P(-0.55, -1.175));
  sh.quadraticCurveTo(...P(-0.75, -1.175), ...P(-0.75, -0.98));
  sh.lineTo(...P(-0.75, 0.45));
  return sh;
}

const grandPiano: FurnitureDef = {
  id: 'piano-grand',
  name: 'פסנתר כנף עם ספסל',
  category: CAT,
  group: G_INST,
  tags: ['פסנתר', 'פסנתר כנף', 'קלידים', 'קונצרט', 'מבריק'],
  size: { w: GR.w + 0.02, d: GR.d, h: GR.h },
  colors: pianoColors,
  seats: [{ x: 0, z: GR.benchZ, height: GR.seatH, facing: Math.PI, kind: 'sit' }],
  actions: [{ kind: 'piano' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const lac = M.lacquer(c.case);
    const brass = M.brass();
    const gold = M.metal('#c9a35a', 0.38, 0.85);
    const { rimY, rimTop } = GR;
    // case: solid body up to the soundboard, then the rim wall with a hollow inside
    k.slab(grandOutline(), 0.24, lac, 0, rimY, 0, 0, 8);
    const wall = grandOutline();
    const inner = grandOutline(0.95);
    wall.holes.push(inner as unknown as THREE.Path);
    k.slab(wall, rimTop - rimY - 0.24, lac, 0, rimY + 0.24, 0, 0, 8);
    // soundboard + golden cast-iron plate + strings
    k.slab(grandOutline(0.95), 0.004, M.wood('#d9b77e', 0.5), 0, rimY + 0.24, 0, 0, 8);
    k.slab(grandOutline(0.86), 0.012, gold, 0, rimY + 0.244, 0, 0, 8);
    for (let i = 0; i < 20; i++) {
      const x = -0.62 + i * 0.06;
      // strings get shorter towards the treble (+X) following the bentside
      const zEnd = x < 0 ? -0.95 + (x + 0.62) * 0.1 : -0.85 + x * 0.6;
      const len = 0.32 - zEnd;
      k.box(0.004, 0.003, len, M.chrome(), x, rimY + 0.257, 0.32 - len / 2);
    }
    // key area: keybed, cheeks, keys, fallboard, music desk
    const kz = GR.keysFront;
    k.box(1.5, 0.08, kz - GR.front + 0.02, lac, 0, rimY, (kz + GR.front) / 2);
    for (const sx of [-1, 1]) k.rbox(0.14, 0.12, kz - GR.front + 0.02, 0.01, lac, sx * 0.68, rimY + 0.06, (kz + GR.front) / 2, 1);
    keyboard(k, -0.61, 52, 0, 1.22 / 52, rimY + 0.08, kz, 0.15, M.ceramic('#f5f2ea'), M.lacquer('#0e0e10'));
    k.box(1.22, 0.09, 0.016, lac, 0, rimY + 0.09, GR.front - 0.006);
    k.rbox(1.24, 0.04, 0.02, 0.004, lac, 0, rimY + 0.04, kz + 0.008, 1);
    const desk = k.box(0.8, 0.26, 0.018, lac, 0, 0, 0);
    desk.position.set(0, rimTop + 0.13, 0.26);
    desk.rotation.x = -0.25;
    const score = k.box(0.42, 0.28, 0.004, M.matte('#f6f2e6'), 0, 0, 0);
    score.position.set(0, rimTop + 0.14, 0.275);
    score.rotation.x = -0.25;
    k.box(0.8, 0.02, 0.05, lac, 0, rimTop - 0.005, 0.29);
    // three tapered legs with brass casters + lyre with pedals
    for (const [lx, lz] of [[-0.66, 0.36], [0.66, 0.36], [-0.48, -0.95]] as const) {
      k.cyl(0.032, rimY - 0.04, lac, lx, 0.04, lz, 0.052, 14);
      k.cyl(0.036, 0.03, brass, lx, 0.01, lz, 0.033, 14);
      k.sphere(0.018, brass, lx, 0.018, lz, 1, 1, 1, 8);
    }
    for (const sx of [-1, 1]) k.rbox(0.03, rimY - 0.1, 0.03, 0.006, lac, sx * 0.08, 0.1, 0.32, 1);
    k.rbox(0.24, 0.05, 0.12, 0.01, lac, 0, 0.06, 0.32, 1);
    for (const px of [-0.06, 0, 0.06]) k.rbox(0.025, 0.012, 0.1, 0.005, brass, px, 0.075, 0.42, 1);
    k.rod([0, 0.06, 0.28], [0, 0.0 + 0.012, 0.2], 0.012, lac);
    // lid: hinged along the straight (bass) side, propped open on a stick
    const lidK = new Kit();
    lidK.slab(grandOutline(1, 0.75), 0.02, lac, 0, 0, 0, 0, 8);
    const lid = k.sub(lidK, -0.75, rimTop, 0);
    lid.rotation.z = GR.lid;
    const xl = 1.36;
    const tip: V3 = [-0.75 + xl * Math.cos(GR.lid), rimTop + xl * Math.sin(GR.lid) - 0.004, -0.12];
    k.rod([0.68, rimTop, -0.12], tip, 0.011, lac);
    // hinges
    for (const hz of [-0.7, -0.2, 0.3]) k.box(0.016, 0.012, 0.06, brass, -0.742, rimTop - 0.006, hz);
    // bench
    pianoBench(k, 0, GR.benchZ, 0.8, 0.36, GR.seatH, lac, M.leather(c.cushion));
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const pts: Array<[number, number]> = grandOutline()
        .getPoints(12)
        .map((p) => [p.x, -p.y]);
      D.poly(ctx, pts, true, tint(c.case, 0.62));
      // open lid hatch
      ctx.save();
      ctx.setLineDash([0.04, 0.03]);
      D.line(ctx, -0.73, -0.9, 0.6, -0.1, INK_SOFT, LINE_THIN);
      ctx.restore();
      D.rr(ctx, 0, (GR.keysFront + GR.front) / 2, 1.5, 0.17, 0.01, tint(c.case, 0.6));
      D.rr(ctx, 0, GR.keysFront - 0.075, 1.22, 0.15, 0, '#fbfaf6', INK, LINE_THIN);
      for (let i = 1; i < 52; i++) if (i % 7 !== 2 && i % 7 !== 5) D.line(ctx, -0.61 + i * (1.22 / 52), 0.45, -0.61 + i * (1.22 / 52), 0.54, INK, LINE_THIN * 1.6);
      D.rr(ctx, 0, GR.benchZ, 0.8, 0.36, 0.03, tint(c.cushion, 0.5));
    }),
};

/* ------------------------------------------------------------------ digital keyboard */

const digitalKeyboard: FurnitureDef = {
  id: 'piano-keyboard-stand',
  name: 'אורגן / קלידים על מעמד X',
  category: CAT,
  group: G_INST,
  tags: ['קלידים', 'אורגן', 'סינתיסייזר', 'פסנתר חשמלי', 'מעמד'],
  size: { w: 1.0, d: 0.48, h: 1.08 },
  colors: [slot('body', 'גוף', '#1d1e21'), slot('stand', 'מעמד', '#2a2b2e')],
  actions: [{ kind: 'piano' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const st = M.metal(c.stand, 0.45, 0.8);
    // X stand: two crossing frames (seen from the front), foot caps and the top bars
    const yTop = 0.78;
    for (const sx of [-1, 1]) {
      const x = sx * 0.3;
      k.rod([x, 0.02, -0.17], [x, yTop, 0.12], 0.014, st);
      k.rod([x, 0.02, 0.17], [x, yTop, -0.12], 0.014, st);
      for (const sz of [-1, 1]) k.rbox(0.04, 0.02, 0.05, 0.008, M.rubber(), x, 0, sz * 0.18, 1);
    }
    for (const sz of [-1, 1]) k.rod([-0.33, yTop, sz * 0.11], [0.33, yTop, sz * 0.11], 0.012, st);
    k.cyl(0.03, 0.04, st, -0.33, 0.38, 0, 0.03, 10).rotation.z = Math.PI / 2;
    // keyboard body
    const body = M.plastic(c.body);
    const y0 = yTop + 0.012;
    k.rbox(0.98, 0.09, 0.32, 0.012, body, 0, y0, 0.0, 2);
    keyboard(k, -0.42, 36, 2, 0.84 / 36, y0 + 0.055, 0.155, 0.14, M.plastic('#f6f4ef'), M.plastic('#111113'));
    // control panel: LCD, buttons, knobs, wheels, speaker grilles
    const py = y0 + 0.09;
    k.box(0.14, 0.002, 0.05, M.glow('#7fd3ff', 0.9, '#bfe9ff'), 0, py, -0.07);
    for (let i = 0; i < 10; i++) k.box(0.018, 0.006, 0.012, M.plastic(i % 3 ? '#4a4c50' : '#d64f3c'), -0.27 + i * 0.024, py, -0.04);
    for (let i = 0; i < 4; i++) k.cyl(0.009, 0.012, M.plastic('#8b8d90'), 0.12 + i * 0.03, py, -0.08, 0.008, 10);
    for (const sx of [-1, 1]) k.box(0.16, 0.002, 0.05, M.fabric('#111113', 40), sx * 0.38, py, -0.08);
    for (const wx of [-0.455, -0.432]) zcyl(k, 0.012, 0.008, M.rubber('#3a3b3e'), wx, y0 + 0.06, 0.08, 12).rotation.set(0, Math.PI / 2, 0);
    // music rest with a score
    const rest = k.box(0.5, 0.17, 0.006, M.plastic('#2a2b2e'), 0, 0, 0);
    rest.position.set(0, py + 0.09, -0.12);
    rest.rotation.x = -0.2;
    const score = k.box(0.3, 0.2, 0.003, M.matte('#f6f2e6'), 0, 0, 0);
    score.position.set(0, py + 0.1, -0.113);
    score.rotation.x = -0.2;
    led(k, 0.45, y0 + 0.06, 0.15, '#5dff8a', 0.004);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      for (const sx of [-1, 1]) D.line(ctx, sx * 0.3, -0.18, sx * 0.3, 0.18, INK_SOFT, LINE_THIN * 2);
      D.rr(ctx, 0, 0, 0.98, 0.32, 0.012, tint(c.body, 0.55));
      D.rr(ctx, 0, 0.085, 0.84, 0.14, 0, '#fbfaf6', INK, LINE_THIN);
      for (let i = 1; i < 36; i++) if ((i + 2) % 7 !== 2 && (i + 2) % 7 !== 5) D.line(ctx, -0.42 + i * (0.84 / 36), 0.015, -0.42 + i * (0.84 / 36), 0.1, INK, LINE_THIN * 1.4);
    }),
};

/* ------------------------------------------------------------------ guitars */

function acousticBody(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(0.12, 0, 0.19, 0.04, 0.19, 0.14);
  s.bezierCurveTo(0.19, 0.22, 0.12, 0.24, 0.12, 0.29);
  s.bezierCurveTo(0.12, 0.33, 0.148, 0.35, 0.148, 0.41);
  s.bezierCurveTo(0.148, 0.48, 0.08, 0.5, 0, 0.5);
  s.bezierCurveTo(-0.08, 0.5, -0.148, 0.48, -0.148, 0.41);
  s.bezierCurveTo(-0.148, 0.35, -0.12, 0.33, -0.12, 0.29);
  s.bezierCurveTo(-0.12, 0.24, -0.19, 0.22, -0.19, 0.14);
  s.bezierCurveTo(-0.19, 0.04, -0.12, 0, 0, 0);
  return s;
}

function electricBody(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(0.15, 0, 0.18, 0.08, 0.17, 0.18);
  s.bezierCurveTo(0.16, 0.25, 0.12, 0.26, 0.13, 0.33);
  s.bezierCurveTo(0.14, 0.4, 0.12, 0.46, 0.09, 0.46);
  s.bezierCurveTo(0.06, 0.46, 0.06, 0.38, 0.03, 0.37);
  s.lineTo(-0.03, 0.37);
  s.bezierCurveTo(-0.06, 0.38, -0.07, 0.42, -0.1, 0.42);
  s.bezierCurveTo(-0.14, 0.42, -0.15, 0.36, -0.14, 0.31);
  s.bezierCurveTo(-0.13, 0.26, -0.17, 0.24, -0.17, 0.17);
  s.bezierCurveTo(-0.18, 0.08, -0.15, 0, 0, 0);
  return s;
}

/**
 * Guitar built upright: end pin at the origin, neck up +Y, top facing +Z. Returns the kit.
 * `acoustic` true: hollow body with sound hole; false: solid body with pickups.
 */
function guitar(acoustic: boolean, top: string, back: string): Kit {
  const g = new Kit();
  const t = acoustic ? 0.1 : 0.045;
  const shape = acoustic ? acousticBody() : electricBody();
  const bodyL = acoustic ? 0.5 : 0.46;
  g.geo(extrudeZ(shape, t, 0.004, 8), acoustic ? M.wood(back, 0.4) : M.lacquer(back), 0, 0, 0);
  const neckMat = M.wood('#8a5a36', 0.45);
  const board = M.wood('#2b1d16', 0.5);
  const chrome = M.chrome();
  if (acoustic) {
    g.geo(extrudeZ(shape, 0.003, 0, 8), M.wood(top, 0.35), 0, 0, t / 2 + 0.0005);
    zcyl(g, 0.044, 0.002, M.matte('#120d0a'), 0, 0.33, t / 2 + 0.002, 20);
    g.geo(new THREE.TorusGeometry(0.052, 0.004, 4, 24), M.wood('#3a2a1e', 0.4), 0, 0.33, t / 2 + 0.002);
    g.box(0.15, 0.012, 0.008, M.wood('#2b1d16', 0.4), 0, 0.11, t / 2 + 0.006);
    g.box(0.07, 0.003, 0.004, M.ceramic('#efe9da'), 0, 0.118, t / 2 + 0.011);
  } else {
    // pickguard, two pickups, bridge, knobs, jack
    const pg = new THREE.Shape();
    pg.moveTo(-0.11, 0.1);
    pg.bezierCurveTo(-0.13, 0.25, -0.05, 0.32, 0.02, 0.36);
    pg.lineTo(0.06, 0.3);
    pg.bezierCurveTo(0.1, 0.2, 0.09, 0.12, 0.02, 0.08);
    pg.lineTo(-0.11, 0.1);
    g.geo(extrudeZ(pg, 0.002, 0, 6), M.plastic(top), 0, 0, t / 2 + 0.001);
    for (const py of [0.2, 0.29]) g.rbox(0.075, 0.022, 0.008, 0.004, M.plastic('#151517'), 0, py, t / 2 + 0.006, 1);
    g.box(0.08, 0.014, 0.012, chrome, 0, 0.12, t / 2 + 0.006);
    for (const [kx, ky] of [[0.1, 0.12], [0.08, 0.07], [0.12, 0.17]] as const) zcyl(g, 0.011, 0.012, M.plastic('#e8e2d2'), kx, ky, t / 2 + 0.006, 10);
    g.rod([0.06, 0.23, t / 2 + 0.002], [0.11, 0.25, t / 2 + 0.014], 0.003, chrome);
  }
  // neck + fingerboard + frets + headstock + tuners
  const neckL = acoustic ? 0.46 : 0.5;
  const ny = bodyL - 0.06;
  g.box(0.048, neckL + 0.06, 0.022, neckMat, 0, ny, -0.003 + (acoustic ? t / 2 - 0.012 : 0));
  const zb = (acoustic ? t / 2 : t / 2) + 0.006;
  g.box(0.05, neckL + (acoustic ? 0.03 : 0.06), 0.006, board, 0, ny + 0.02, zb - 0.003);
  for (let i = 1; i < 14; i++) g.box(0.05, 0.0015, 0.007, M.metal('#d8d8d8', 0.3, 1), 0, ny + neckL + 0.06 - i * (neckL / 14) * (1 - i * 0.025), zb - 0.003);
  const hy = ny + neckL + 0.06;
  const head = g.box(0.085, 0.18, 0.016, acoustic ? M.wood(back, 0.4) : M.lacquer(back), 0, 0, 0);
  head.position.set(0, hy + 0.09, zb - 0.016);
  head.rotation.x = -0.18;
  for (let i = 0; i < 3; i++) {
    for (const sx of [-1, 1]) {
      const yy = hy + 0.05 + i * 0.045;
      const zz = zb - 0.016 - Math.sin(0.18) * (yy - hy);
      xcyl(g, 0.005, 0.03, chrome, sx * 0.055, yy, zz, 8);
      g.box(0.008, 0.014, 0.004, chrome, sx * 0.072, yy - 0.007, zz);
    }
  }
  // nut + strings
  g.box(0.048, 0.006, 0.006, M.ceramic('#efe9da'), 0, hy - 0.004, zb);
  const sy0 = acoustic ? 0.115 : 0.12;
  for (let i = 0; i < 6; i++) {
    const x0 = -0.03 + i * 0.012;
    const x1 = -0.02 + i * 0.008;
    g.rod([x0, sy0, zb + 0.004], [x1, hy, zb + 0.004], 0.0007, chrome, 0.0007, 3);
  }
  return g;
}

/** Folding A-frame guitar stand; the guitar's end pin rests at (x, 0.07, z + 0.03). */
function guitarStand(k: Kit, x: number, z: number, mat: THREE.Material, neckY: number): void {
  for (const sx of [-1, 1]) {
    k.rod([x + sx * 0.16, 0.01, z + 0.16], [x + sx * 0.05, 0.3, z - 0.02], 0.008, mat);
    k.sphere(0.012, M.rubber(), x + sx * 0.16, 0.012, z + 0.16, 1, 1, 1, 8);
    // cradle arms with foam
    k.rod([x + sx * 0.05, 0.08, z + 0.04], [x + sx * 0.11, 0.08, z + 0.1], 0.007, mat);
    k.rod([x + sx * 0.09, 0.08, z + 0.08], [x + sx * 0.09, 0.12, z + 0.1], 0.012, M.rubber());
  }
  k.rod([x, 0.01, z - 0.2], [x, 0.32, z - 0.03], 0.008, mat);
  k.sphere(0.012, M.rubber(), x, 0.012, z - 0.2, 1, 1, 1, 8);
  k.rod([x - 0.05, 0.08, z + 0.04], [x + 0.05, 0.08, z + 0.04], 0.008, mat);
  // upright post leaning back to the neck yoke
  k.rod([x, 0.3, z - 0.02], [x, neckY, z - 0.2], 0.009, mat);
  k.geo(new THREE.TorusGeometry(0.035, 0.008, 6, 12, Math.PI), M.rubber(), x, neckY + 0.01, z - 0.2);
}

const acousticGuitar: FurnitureDef = {
  id: 'guitar-acoustic-stand',
  name: 'גיטרה אקוסטית על מעמד',
  category: CAT,
  group: G_INST,
  tags: ['גיטרה', 'אקוסטית', 'כלי מיתר', 'מעמד'],
  size: { w: 0.4, d: 0.4, h: 1.2 },
  colors: [slot('top', 'עץ קדמי', '#dcb47a'), slot('back', 'גוף', '#6b3b22')],
  actions: [{ kind: 'guitar' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    guitarStand(k, 0, 0.02, M.blackMetal(), 0.86);
    const g = k.sub(guitar(true, c.top, c.back), 0, 0.07, 0.09);
    g.rotation.x = -0.24;
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.poly(ctx, [[-0.16, 0.18], [0, 0.0], [0.16, 0.18]], false, null, INK_SOFT, LINE_THIN * 1.5);
      D.line(ctx, 0, -0.18, 0, 0.0, INK_SOFT, LINE_THIN * 1.5);
      D.rr(ctx, 0, 0.06, 0.38, 0.11, 0.04, tint(c.back, 0.45));
      D.rr(ctx, 0, -0.1, 0.05, 0.2, 0.01, tint('#8a5a36', 0.3), INK, LINE_THIN);
      D.rr(ctx, 0, -0.19, 0.085, 0.05, 0.01, tint(c.back, 0.3), INK, LINE_THIN);
    }),
};

const electricGuitar: FurnitureDef = {
  id: 'guitar-electric-amp',
  name: 'גיטרה חשמלית ומגבר',
  category: CAT,
  group: G_INST,
  tags: ['גיטרה', 'חשמלית', 'מגבר', 'רוק', 'מעמד'],
  size: { w: 0.92, d: 0.44, h: 1.2 },
  colors: [slot('body', 'גוף הגיטרה', '#b3242c'), slot('guard', 'מגן', '#f1ede4'), slot('amp', 'מגבר', '#1b1c1f')],
  actions: [{ kind: 'guitar' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const gx = -0.28;
    guitarStand(k, gx, 0.0, M.blackMetal(), 0.9);
    const g = k.sub(guitar(false, c.guard, c.body), gx, 0.07, 0.07);
    g.rotation.x = -0.22;
    // cable from the guitar jack to the amp
    k.tube([[gx + 0.08, 0.27, 0.06], [gx + 0.12, 0.06, 0.16], [-0.01, 0.03, 0.19], [0.11, 0.04, 0.14], [0.17, 0.35, 0.14]], 0.004, M.rubber('#111'), { seg: 30, radial: 5 });
    // combo amplifier
    const ax = 0.21;
    const tolex = M.leather(c.amp);
    k.rbox(0.48, 0.44, 0.26, 0.015, tolex, ax, 0.02, -0.03, 2);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.04, 0.02, 0.04, M.rubber(), ax + sx * 0.2, 0, -0.03 + sz * 0.1);
    const zf = 0.1;
    k.box(0.44, 0.3, 0.006, M.fabric('#3a3329', 34), ax, 0.04, zf);
    k.box(0.46, 0.012, 0.01, M.chrome(), ax, 0.345, zf);
    // control strip with knobs + jewel light
    k.box(0.44, 0.07, 0.006, M.brushed('#c8b88a'), ax, 0.36, zf);
    for (let i = 0; i < 6; i++) knob(k, ax - 0.15 + i * 0.05, 0.395, zf + 0.003, 0.011, M.plastic('#111113'), 0.016);
    k.sphere(0.008, M.glow('#ff3b30', 2, '#ff8a80'), ax + 0.19, 0.395, zf + 0.008, 1, 1, 1, 8);
    zcyl(k, 0.006, 0.01, M.chrome(), ax - 0.19, 0.395, zf + 0.008, 8);
    // corner protectors + handle
    for (const sx of [-1, 1]) for (const sy of [0, 1]) k.rbox(0.03, 0.03, 0.03, 0.006, M.chrome(), ax + sx * 0.23, 0.02 + sy * 0.41, zf - 0.005, 1);
    k.rbox(0.16, 0.02, 0.03, 0.008, M.rubber(), ax, 0.46, -0.03, 1);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.line(ctx, -0.28, -0.2, -0.28, 0.0, INK_SOFT, LINE_THIN * 1.5);
      D.poly(ctx, [[-0.44, 0.16], [-0.28, -0.02], [-0.12, 0.16]], false, null, INK_SOFT, LINE_THIN * 1.5);
      D.rr(ctx, -0.28, 0.06, 0.34, 0.06, 0.02, tint(c.body, 0.4));
      D.rr(ctx, -0.28, -0.12, 0.05, 0.2, 0.01, tint('#8a5a36', 0.3), INK, LINE_THIN);
      D.rr(ctx, 0.21, -0.03, 0.48, 0.26, 0.015, tint(c.amp, 0.5));
      D.line(ctx, 0.01, 0.1, 0.41, 0.1, INK, LINE_THIN * 2);
    }),
};

/* ------------------------------------------------------------------ drum kit */

const DR = { w: 1.56, d: 1.3, h: 1.32, stoolZ: -0.46, seatH: 0.52 };

/** A drum with vertical axis: shell from y0 to y0 + depth, heads, hoops and lugs. */
function drum(k: Kit, r: number, depth: number, shell: THREE.Material, x: number, y0: number, z: number): void {
  const chrome = M.chrome();
  k.cyl(r, depth, shell, x, y0, z, r, 16);
  k.cyl(r - 0.002, 0.002, M.matte('#f2efe6'), x, y0 + depth, z, r - 0.002, 16);
  for (const hy of [y0 + depth - 0.004, y0 + 0.004]) k.geo(new THREE.TorusGeometry(r + 0.003, 0.005, 3, 16), chrome, x, hy, z).rotation.x = Math.PI / 2;
  const n = r > 0.15 ? 8 : 6;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    k.box(0.012, depth * 0.4, 0.012, chrome, x + Math.cos(a) * (r + 0.006), y0 + depth * 0.3, z + Math.sin(a) * (r + 0.006));
  }
}

/** Cymbal centred at (x, y, z) on a stand from the floor. */
function cymbal(k: Kit, r: number, x: number, y: number, z: number, tilt = 0.12): void {
  const ck = new Kit();
  ck.lathe([[0, 0.012], [0.035, 0.008], [r, -0.004], [r, -0.006], [0, 0.006]], M.metal('#d2ae5a', 0.28, 1), 0, 0, 0, 18);
  const g = k.sub(ck, x, y, z);
  g.rotation.x = -tilt;
  k.cyl(0.008, y - 0.02, M.chrome(), x, 0.02, z, 0.006, 8);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    k.rod([x + Math.cos(a) * 0.2, 0.014, z + Math.sin(a) * 0.2], [x, 0.35, z], 0.007, M.chrome(), 0.007, 6);
  }
}

const drumKit: FurnitureDef = {
  id: 'drums-kit',
  name: 'מערכת תופים עם כיסא מתופף',
  category: CAT,
  group: G_INST,
  tags: ['תופים', 'מערכת תופים', 'מצלתיים', 'רוק', 'כלי הקשה'],
  size: { w: DR.w, d: DR.d, h: DR.h },
  colors: [slot('shell', 'גוף התופים', '#a3191f'), slot('seat', 'מושב', '#1b1c1f')],
  seats: [{ x: 0, z: DR.stoolZ, height: DR.seatH, facing: 0, kind: 'sit' }],
  actions: [{ kind: 'drums' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const shell = M.lacquer(c.shell);
    const chrome = M.chrome();
    // bass drum (axis along Z) with front head + spurs
    const bz = 0.3;
    const br = 0.27;
    const by = br + 0.016;
    zcyl(k, br, 0.4, shell, 0, by, bz, 24);
    zcyl(k, br - 0.003, 0.004, M.matte('#f2efe6'), 0, by, bz + 0.2, 24);
    zcyl(k, br * 0.45, 0.002, M.matte(darken(c.shell, 0.2)), 0, by, bz + 0.203, 20);
    for (const sz of [-1, 1]) k.geo(new THREE.TorusGeometry(br + 0.004, 0.01, 4, 24), M.wood(darken(c.shell, 0.3), 0.4), 0, by, bz + sz * 0.198);
    for (const sx of [-1, 1]) k.rod([sx * 0.22, 0.12, bz + 0.12], [sx * 0.33, 0.014, bz + 0.2], 0.007, chrome, 0.007, 6);
    // bass pedal + hi-hat
    k.rbox(0.08, 0.02, 0.24, 0.006, chrome, 0, 0, bz - 0.36, 1);
    k.rod([0, 0.06, bz - 0.24], [0, 0.22, bz - 0.21], 0.006, chrome);
    k.sphere(0.025, M.matte('#e8e4da'), 0, 0.23, bz - 0.21, 1, 1, 1, 10);
    // rack toms on the bass drum, tilted to the drummer
    for (const [tx, tr] of [[-0.13, 0.1], [0.14, 0.115]] as const) {
      const tk = new Kit();
      drum(tk, tr, 0.17, shell, 0, -0.085, 0);
      const g = k.sub(tk, tx, 0.73, bz - 0.02);
      g.rotation.x = -0.32;
      g.rotation.z = tx < 0 ? 0.12 : -0.12;
    }
    k.rod([0, by + br, bz], [0, 0.66, bz - 0.02], 0.01, chrome);
    // snare on its stand (left) + floor tom (right)
    k.cyl(0.008, 0.48, chrome, -0.32, 0.02, -0.14, 0.008, 8);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      k.rod([-0.32 + Math.cos(a) * 0.18, 0.012, -0.14 + Math.sin(a) * 0.18], [-0.32, 0.3, -0.14], 0.006, chrome, 0.006, 6);
    }
    drum(k, 0.18, 0.13, shell, -0.32, 0.5, -0.14);
    drum(k, 0.2, 0.36, shell, 0.42, 0.2, -0.12);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.3;
      k.rod([0.42 + Math.cos(a) * 0.21, 0.4, -0.12 + Math.sin(a) * 0.21], [0.42 + Math.cos(a) * 0.26, 0.012, -0.12 + Math.sin(a) * 0.26], 0.006, chrome, 0.006, 6);
    }
    // hi-hat (two cymbals), crash and ride
    const hx = -0.6;
    const hz = -0.02;
    k.cyl(0.008, 0.82, chrome, hx, 0.02, hz, 0.006, 8);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.2;
      k.rod([hx + Math.cos(a) * 0.17, 0.014, hz + Math.sin(a) * 0.17], [hx, 0.3, hz], 0.007, chrome, 0.007, 6);
    }
    k.rbox(0.07, 0.015, 0.2, 0.005, chrome, hx, 0.0, hz - 0.18, 1);
    for (const dy of [0.82, 0.835]) {
      const ck = new Kit();
      ck.lathe([[0, 0.008], [0.03, 0.006], [0.17, -0.002], [0.17, -0.004], [0, 0.003]], M.metal('#d2ae5a', 0.28, 1), 0, 0, 0, 18);
      const g = k.sub(ck, hx, dy, hz);
      if (dy > 0.83) g.rotation.x = Math.PI;
    }
    cymbal(k, 0.2, -0.5, 1.25, 0.35, 0.25);
    cymbal(k, 0.23, 0.52, 1.1, 0.3, 0.2);
    // sticks on the snare
    k.rod([-0.42, 0.637, -0.1], [-0.2, 0.637, -0.24], 0.006, M.wood(PAL.birch, 0.5));
    k.rod([-0.42, 0.637, -0.16], [-0.2, 0.637, -0.2], 0.006, M.wood(PAL.birch, 0.5));
    // drum throne
    const sz0 = DR.stoolZ;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
      k.rod([Math.cos(a) * 0.22, 0.016, sz0 + Math.sin(a) * 0.22], [0, 0.22, sz0], 0.01, chrome, 0.01, 8);
      k.sphere(0.014, M.rubber(), Math.cos(a) * 0.22, 0.014, sz0 + Math.sin(a) * 0.22, 1, 1, 1, 8);
    }
    k.cyl(0.018, 0.3, chrome, 0, 0.2, sz0, 0.016, 10);
    k.cushion(0.36, 0.07, 0.36, M.leather(c.seat), 0, DR.seatH - 0.07, sz0, 0.03, 0.01, 1);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const sh = tint(c.shell, 0.45);
      D.rr(ctx, 0, 0.3, 0.54, 0.4, 0.02, sh);
      D.circle(ctx, -0.13, 0.25, 0.1, sh);
      D.circle(ctx, 0.14, 0.25, 0.115, sh);
      D.circle(ctx, -0.32, -0.14, 0.18, '#f2efe6');
      D.circle(ctx, 0.42, -0.12, 0.2, '#f2efe6');
      for (const [x, z, r] of [[-0.6, -0.02, 0.17], [-0.5, 0.35, 0.2], [0.52, 0.3, 0.23]] as const) D.circle(ctx, x, z, r, 'rgba(214,174,90,0.35)', '#a88a3e', LINE_THIN);
      D.circle(ctx, 0, DR.stoolZ, 0.18, tint(c.seat, 0.5));
    }),
};

const INSTRUMENTS: FurnitureDef[] = [uprightPiano, grandPiano, digitalKeyboard, acousticGuitar, electricGuitar, drumKit];

/* ================================================================== GAMES */

/* ------------------------------------------------------------------ arcade cabinet */

/** Side profile of the arcade cabinet in (z, y). */
function arcadeProfile(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-0.42, 0);
  s.lineTo(0.2, 0);
  s.lineTo(0.2, 0.86);
  s.lineTo(0.42, 0.95);
  s.lineTo(0.42, 1.0);
  s.lineTo(0.14, 1.1);
  s.lineTo(0.02, 1.6);
  s.lineTo(0.08, 1.63);
  s.lineTo(0.08, 1.85);
  s.lineTo(-0.42, 1.85);
  s.lineTo(-0.42, 0);
  return s;
}

/** Place a +Z facing mesh tilted by rotation.x = rx with its centre at (x, y, z). */
/** a tilted mesh wrapped in a group (Kit.add resets the position of what it adds) */
function tilted(m: THREE.Mesh, x: number, y: number, z: number, rx: number): THREE.Group {
  m.position.set(x, y, z);
  m.rotation.x = rx;
  m.castShadow = !(m.material as THREE.Material).transparent;
  m.receiveShadow = true;
  const g = new THREE.Group();
  g.add(m);
  return g;
}

const arcade: FurnitureDef = {
  id: 'game-arcade-cabinet',
  name: 'מכונת משחקי ארקייד',
  category: CAT,
  group: G_GAME,
  tags: ['ארקייד', 'משחק וידאו', 'רטרו', 'ג\'ויסטיק', 'שנות ה-80'],
  size: { w: 0.7, d: 0.84, h: 1.85 },
  colors: [slot('body', 'צדדים', '#2347a8'), slot('marquee', 'שלט מואר', '#ffcf4a'), slot('buttons', 'כפתורים', '#e0383e')],
  actions: [{ kind: 'game' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const prof = arcadeProfile();
    const side = M.lacquer(c.body);
    const inner = M.matte('#141416');
    for (const sx of [-1, 1]) {
      const m = k.geo(extrudeZ(prof, 0.02, 0.003, 4), side, sx * 0.34, 0, 0);
      m.rotation.y = -Math.PI / 2;
    }
    const body = k.geo(extrudeZ(prof, 0.66, 0, 4), inner, 0, 0, 0);
    body.rotation.y = -Math.PI / 2;
    // T-molding along the front edges of the sides
    const edge: Array<[number, number]> = [[0.004, 0.2], [0.86, 0.2], [0.95, 0.42], [1.0, 0.42], [1.1, 0.14], [1.6, 0.02], [1.63, 0.08], [1.846, 0.08]];
    for (const sx of [-1, 1]) {
      for (let i = 0; i + 1 < edge.length; i++) k.rod([sx * 0.348, edge[i][0], edge[i][1]], [sx * 0.348, edge[i + 1][0], edge[i + 1][1]], 0.004, M.plastic('#e8e8ea'), 0.004, 5);
    }
    // marquee (back-lit sign) + speaker grille under it
    k.box(0.62, 0.17, 0.006, M.glow(c.marquee, 1.3, lighten(c.marquee, 0.5)), 0, 1.655, 0.081);
    for (let i = 0; i < 5; i++) k.box(0.3, 0.004, 0.002, M.matte(darken(c.marquee, 0.5)), 0, 1.7 + i * 0.022, 0.085);
    // screen bezel + the animated screen along the tilted face
    const rx = -Math.atan2(0.12, 0.5);
    const nY = Math.sin(-rx);
    const nZ = Math.cos(rx);
    k.add(tilted(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.47, 0.004), M.plastic('#0b0b0d')), 0, 1.35 + nY * 0.002, 0.08 + nZ * 0.002, rx));
    const s = k.part('screen');
    s.add(tilted(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.38, 0.002), M.screen()), 0, 1.355 + nY * 0.005, 0.08 + nZ * 0.005, rx));
    // control panel: joystick + buttons for 2 players
    const yAt = (z: number): number => 1.1 - ((z - 0.14) * 0.1) / 0.28;
    const pz = 0.28;
    const btn = M.plastic(c.buttons);
    for (const px of [-0.2, 0.12]) {
      const y = yAt(pz);
      k.cyl(0.018, 0.006, M.matte('#1d1e21'), px, y, pz, 0.018, 10);
      k.rod([px, y, pz], [px, y + 0.07, pz], 0.005, M.chrome());
      k.sphere(0.017, M.plastic('#e0383e'), px, y + 0.075, pz, 1, 1, 1, 10);
      for (let i = 0; i < 3; i++) for (let r = 0; r < 2; r++) {
        const bz = pz - 0.03 + r * 0.05;
        k.cyl(0.012, 0.014, i === 1 ? M.plastic('#f2c94c') : btn, px + 0.06 + i * 0.03, yAt(bz) - 0.004, bz, 0.012, 10);
      }
    }
    k.cyl(0.008, 0.01, M.glow('#ffffff', 1.2), -0.04, yAt(0.36), 0.36, 0.008, 8);
    k.cyl(0.008, 0.01, M.glow('#ffffff', 1.2), 0.04, yAt(0.36), 0.36, 0.008, 8);
    // coin door
    k.box(0.28, 0.3, 0.01, M.brushed('#9fa2a5'), 0, 0.42, 0.203);
    for (const cx of [-0.06, 0.06]) {
      k.box(0.05, 0.07, 0.006, M.glow('#ff4a3d', 1.4), cx, 0.6, 0.209);
      k.box(0.004, 0.03, 0.002, M.matte('#111'), cx, 0.615, 0.213);
    }
    k.box(0.3, 0.02, 0.4, M.rubber(), 0, 0, -0.1);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, -0.11, 0.7, 0.62, 0.01, tint(c.body, 0.45));
      D.rr(ctx, 0, 0.31, 0.66, 0.22, 0.01, '#4a4d52', INK, LINE_THIN);
      for (const px of [-0.2, 0.12]) D.circle(ctx, px, 0.28, 0.02, tint(c.buttons, 0.1), INK, LINE_THIN);
      D.line(ctx, -0.25, 0.08, 0.25, 0.08, '#7fa7c9', LINE_THIN * 2);
    }),
};

/* ------------------------------------------------------------------ pinball */

const PIN = { zF: 0.57, L: 1.2 };

const pinball: FurnitureDef = {
  id: 'game-pinball',
  name: 'מכונת פינבול',
  category: CAT,
  group: G_GAME,
  tags: ['פינבול', 'פליפר', 'ארקייד', 'רטרו'],
  size: { w: 0.76, d: 1.36, h: 1.92 },
  colors: [slot('body', 'ארגז', '#1f2f6b'), slot('field', 'משטח משחק', '#e8a13a'), slot('accent', 'אורות', '#ff4f8b')],
  actions: [{ kind: 'game' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const body = M.lacquer(c.body);
    const chrome = M.chrome();
    const zF = PIN.zF;
    const L = PIN.L;
    const tiltA = 0.06;
    // legs with levelers
    for (const sx of [-1, 1]) {
      for (const [lz, top] of [[zF - 0.08, 0.62], [zF - L + 0.1, 0.62 + (L - 0.1) * Math.sin(tiltA)]] as const) {
        k.rbox(0.05, top - 0.02, 0.05, 0.004, chrome, sx * 0.31, 0.02, lz, 1);
        k.cyl(0.02, 0.02, M.rubber(), sx * 0.31, 0, lz, 0.016, 8);
      }
    }
    // tilted cabinet with playfield, rails and glass
    const pb = new Kit();
    pb.box(0.72, 0.26, L, body, 0, 0, -L / 2);
    pb.box(0.66, 0.004, L - 0.06, M.paint(c.field, 0.35), 0, 0.26, -L / 2);
    for (const sx of [-1, 1]) pb.box(0.03, 0.06, L, body, sx * 0.345, 0.26, -L / 2);
    pb.box(0.72, 0.06, 0.03, body, 0, 0.26, -0.015);
    pb.box(0.66, 0.004, L - 0.05, M.glass('#e8f4f8', 0.18), 0, 0.31, -L / 2);
    pb.rbox(0.7, 0.02, 0.05, 0.008, chrome, 0, 0.32, -0.03, 1);
    // bumpers with glowing caps
    for (const [bx, bz] of [[-0.12, -0.8], [0.1, -0.82], [0, -0.66]] as const) {
      pb.cyl(0.035, 0.035, M.plastic('#f5f5f5'), bx, 0.264, bz, 0.035, 14);
      pb.cyl(0.04, 0.01, M.glow(c.accent, 1.6, lighten(c.accent, 0.5)), bx, 0.299, bz, 0.03, 14);
    }
    // inserts (lights in the playfield), slingshots, flippers, lanes, ramp, ball
    for (let i = 0; i < 9; i++) pb.cyl(0.012, 0.002, M.glow(i % 2 ? '#ffe066' : c.accent, 1.3), -0.16 + (i % 3) * 0.16, 0.262, -0.25 - Math.floor(i / 3) * 0.12, 0.012, 10);
    for (const sx of [-1, 1]) {
      const sl = new THREE.Shape();
      sl.moveTo(sx * 0.2, 0.0);
      sl.lineTo(sx * 0.2, 0.14);
      sl.lineTo(sx * 0.1, 0.02);
      sl.lineTo(sx * 0.2, 0.0);
      pb.slab(sl, 0.03, M.plastic('#f5f5f5'), 0, 0.262, -0.14);
      const f = pb.rbox(0.09, 0.02, 0.018, 0.008, M.plastic('#f5f5f5'), 0, 0, 0, 1);
      f.position.set(sx * 0.07, 0.275, -0.12);
      f.rotation.y = sx * 0.45;
      pb.cyl(0.004, 0.02, M.plastic('#e0383e'), sx * 0.11, 0.262, -0.14, 0.004, 6);
    }
    for (let i = 0; i < 3; i++) pb.box(0.006, 0.025, 0.12, chrome, -0.08 + i * 0.08, 0.262, -L + 0.18);
    pb.tube([[-0.25, 0.27, -0.3], [-0.24, 0.33 - 0.03, -0.6], [-0.1, 0.29, -0.95], [0.1, 0.27, -1.0]], 0.012, M.glass('#bfe9ff', 0.45), { seg: 20, radial: 6 });
    pb.sphere(0.014, chrome, 0.04, 0.278, -0.3, 1, 1, 1, 10);
    // plunger + flipper buttons + coin door
    pb.rod([0.3, 0.16, 0.0], [0.3, 0.16, 0.06], 0.008, chrome);
    pb.cyl(0.02, 0.03, M.plastic('#e0383e'), 0, 0, 0, 0.02, 10).position.set(0.3, 0.16, 0.075);
    pb.box(0.32, 0.18, 0.01, M.brushed('#9fa2a5'), 0, 0.03, 0.005);
    for (const cx of [-0.05, 0.05]) pb.box(0.04, 0.06, 0.004, M.glow('#ff4a3d', 1.3), cx, 0.12, 0.012);
    for (const sx of [-1, 1]) xcyl(pb, 0.014, 0.014, M.plastic('#f2f2f2'), sx * 0.366, 0.2, -0.08, 10);
    const g = k.sub(pb, 0, 0.62, zF);
    g.rotation.x = tiltA;
    // backbox with the animated display + speaker panel
    const by = 0.62 + L * Math.sin(tiltA) + 0.3 - 0.02;
    const bz = zF - L + 0.13;
    k.rbox(0.72, 1.92 - by, 0.24, 0.01, body, 0, by, bz, 1);
    k.box(0.68, 0.08, 0.1, body, 0, by - 0.06, bz + 0.04);
    k.box(0.66, 0.6, 0.006, M.matte('#0b0b0d'), 0, by + 0.3, bz + 0.12);
    const s = k.part('screen');
    s.box(0.62, 0.42, 0.002, M.screen(), 0, by + 0.38, bz + 0.124);
    k.box(0.62, 0.2, 0.004, M.matte('#151517'), 0, by + 0.05, bz + 0.122);
    for (const sx of [-1, 1]) zcyl(k, 0.07, 0.004, M.fabric('#2a2b2e', 40), sx * 0.2, by + 0.15, bz + 0.126, 18);
    k.box(0.3, 0.1, 0.002, M.glow('#ff8a3d', 1.2, '#ffd2a8'), 0, by + 0.1, bz + 0.125);
    k.box(0.74, 0.02, 0.26, chrome, 0, 1.9, bz);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { zF, L } = PIN;
      D.rr(ctx, 0, zF - L / 2, 0.72, L, 0.01, tint(c.body, 0.45));
      D.rr(ctx, 0, zF - L / 2, 0.64, L - 0.08, 0.01, tint(c.field, 0.3), INK, LINE_THIN);
      for (const [bx, bz] of [[-0.12, -0.8], [0.1, -0.82], [0, -0.66]] as const) D.circle(ctx, bx, bz + zF, 0.035, tint(c.accent, 0.2), INK, LINE_THIN);
      for (const sx of [-1, 1]) D.line(ctx, sx * 0.11, zF - 0.14, sx * 0.03, zF - 0.1, INK, LINE_THIN * 2);
      D.rr(ctx, 0, zF - L + 0.13, 0.72, 0.24, 0.01, tint(c.body, 0.25));
    }),
};

/* ------------------------------------------------------------------ console gaming setup */

const consoleSetup: FurnitureDef = {
  id: 'game-console-setup',
  name: 'עמדת קונסולת משחקים עם טלוויזיה',
  category: CAT,
  group: G_GAME,
  tags: ['קונסולה', 'משחקי וידאו', 'גיימינג', 'טלוויזיה', 'שלט'],
  size: { w: 1.6, d: 0.45, h: 1.3 },
  colors: [slot('unit', 'מזנון', '#2a2b2e'), slot('led', 'תאורת לד', '#7a5cff'), slot('frame', 'מסגרת מסך', '#1b1c1f')],
  actions: [{ kind: 'game' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const unit = M.paint(c.unit, 0.5);
    cabinet(k, {
      w: 1.6,
      h: 0.45,
      d: 0.45,
      body: unit,
      front: unit,
      cols: [[{ kind: 'drawer' }], [{ kind: 'open' }], [{ kind: 'drawer' }]],
      colWeights: [1, 0.9, 1],
      base: 'none',
      handle: 'edge',
      top: M.matte(darken(c.unit, 0.2)),
      topT: 0.025,
    });
    // RGB glow under the top edge and in the open bay
    k.box(1.56, 0.008, 0.004, M.glow(c.led, 2, lighten(c.led, 0.5)), 0, 0.41, 0.226);
    k.box(0.5, 0.004, 0.3, M.glow(c.led, 0.8, lighten(c.led, 0.5)), 0, 0.43, -0.03);
    // console (horizontal) in the bay + router-like box
    k.rbox(0.36, 0.08, 0.26, 0.015, M.plastic('#f2f2f4'), 0, 0.03, 0.0, 2);
    k.box(0.36, 0.012, 0.26, M.plastic('#1b1c1f'), 0, 0.064, 0.0);
    led(k, 0.15, 0.08, 0.13, '#5dd2ff', 0.006);
    k.rbox(0.2, 0.05, 0.14, 0.01, M.plastic('#1b1c1f'), 0, 0.15, -0.04, 1);
    // 55" TV on its pedestal on the top
    const tv = buildTv({ id: '', name: '', inch: 55, stand: 'pedestal', tags: [], frame: c.frame }, { frame: c.frame, stand: '#2a2b2e' });
    k.add(tv, 0, 0.45, -0.06);
    // two controllers + headset on the top
    for (const [cx, rot, col] of [[-0.55, 0.3, '#f2f2f4'], [0.5, -0.4, '#1b1c1f']] as const) {
      const ck = new Kit();
      const pm = M.plastic(col);
      ck.rbox(0.11, 0.03, 0.06, 0.014, pm, 0, 0, 0, 2);
      for (const sx of [-1, 1]) ck.sphere(0.024, pm, sx * 0.05, 0.016, 0.022, 1, 0.6, 1.2, 10);
      for (const sx of [-1, 1]) ck.cyl(0.008, 0.008, M.plastic('#2b2c2f'), sx * 0.022, 0.028, 0.01, 0.007, 8);
      ck.box(0.03, 0.003, 0.015, M.glow(c.led, 1.6), 0, 0.03, -0.018);
      k.sub(ck, cx, 0.45, 0.12).rotation.y = rot;
    }
    k.geo(new THREE.TorusGeometry(0.08, 0.012, 6, 16, Math.PI), M.plastic('#1b1c1f'), 0.68, 0.45 + 0.05, -0.08).rotation.set(-Math.PI / 2, 0, 0);
    for (const sx of [-1, 1]) k.cyl(0.045, 0.035, M.leather('#2a2b2e'), 0.68 + sx * 0.08, 0.45, -0.08, 0.045, 14);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 1.6, 0.45, 0.01, tint(c.unit, 0.55));
      D.line(ctx, -0.27, -0.22, -0.27, 0.22, INK_SOFT, LINE_THIN);
      D.line(ctx, 0.27, -0.22, 0.27, 0.22, INK_SOFT, LINE_THIN);
      D.rr(ctx, 0, -0.06, 1.23, 0.03, 0.005, '#2c2e33');
      D.rr(ctx, 0, -0.06, 0.52, 0.28, 0.02, null, INK_SOFT, LINE_THIN);
      D.rr(ctx, -0.55, 0.12, 0.11, 0.06, 0.02, '#f2f2f4', INK, LINE_THIN);
      D.rr(ctx, 0.5, 0.12, 0.11, 0.06, 0.02, '#55585c', INK, LINE_THIN);
    }),
};

/* ------------------------------------------------------------------ pool table */

const POOL = { w: 2.54, d: 1.42, h: 0.85, pw: 2.24, pd: 1.12 };
const BALL_COLORS = ['#f2c230', '#1f4fb4', '#d1262b', '#5b2a86', '#f07f22', '#1d7a3c', '#7a1f24', '#111113'];

const poolTable: FurnitureDef = {
  id: 'game-pool-table',
  name: 'שולחן ביליארד (סנוקר) עם כדורים ומקלות',
  category: CAT,
  group: G_GAME,
  tags: ['ביליארד', 'פול', 'סנוקר', 'שולחן משחק', 'מקל'],
  size: { w: POOL.w, d: POOL.d, h: POOL.h },
  colors: [slot('felt', 'לבד', '#1f6b45'), slot('wood', 'עץ', '#5a3522')],
  actions: [{ kind: 'play', label: 'שחק ביליארד', at: { x: POOL.w / 2 + 0.35, y: 0, z: 0 } }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const wood = M.wood(c.wood, 0.35);
    const felt = M.fabric(c.felt, 60);
    const { w, d, h, pw, pd } = POOL;
    const top = 0.775;
    // legs + apron
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      k.lathe([[0.075, 0], [0.085, 0.04], [0.06, 0.08], [0.07, 0.25], [0.055, 0.45], [0.08, 0.56], [0.0, 0.56]], wood, sx * (w / 2 - 0.22), 0, sz * (d / 2 - 0.2), 14);
    }
    k.rbox(w - 0.16, 0.2, d - 0.16, 0.01, wood, 0, 0.55, 0, 1);
    k.box(w - 0.12, 0.03, d - 0.12, M.paint(darken(c.wood, 0.2)), 0, 0.72, 0);
    // bed (slate + cloth), cushions, wooden rails
    k.box(pw, 0.03, pd, felt, 0, top - 0.03, 0);
    const rw = (w - pw) / 2;
    const rd = (d - pd) / 2;
    for (const sz of [-1, 1]) {
      k.box(pw - 0.12, 0.035, 0.04, felt, 0, top, sz * (pd / 2 - 0.02));
      k.rbox(w, 0.045, rd, 0.012, wood, 0, top, sz * (d / 2 - rd / 2), 1);
    }
    for (const sx of [-1, 1]) {
      k.box(0.04, 0.035, pd - 0.12, felt, sx * (pw / 2 - 0.02), top, 0);
      k.rbox(rw, 0.045, d - 2 * rd + 0.002, 0.012, wood, sx * (w / 2 - rw / 2), top, 0, 1);
    }
    // pockets (6) with leather drops
    for (const [px, pz] of [[-1, -1], [0, -1], [1, -1], [-1, 1], [0, 1], [1, 1]] as const) {
      const x = px * (pw / 2 - 0.0);
      const z = pz * (pd / 2 - 0.0);
      k.cyl(0.062, 0.05, M.matte('#0a0a0b'), x, top - 0.006, z, 0.062, 14);
      k.cyl(0.07, 0.11, M.leather('#2a1a12'), x, top - 0.11, z, 0.06, 12);
    }
    // sights (diamonds) on the rails
    for (let i = 1; i < 8; i++) {
      if (i === 4) continue;
      for (const sz of [-1, 1]) k.box(0.014, 0.002, 0.008, M.ceramic('#f4efe2'), -pw / 2 + (pw * i) / 8, top + 0.045, sz * (d / 2 - rd / 2));
    }
    for (let i = 1; i < 4; i++) for (const sx of [-1, 1]) k.box(0.008, 0.002, 0.014, M.ceramic('#f4efe2'), sx * (w / 2 - rw / 2), top + 0.045, -pd / 2 + (pd * i) / 4);
    // racked balls + wooden triangle + cue ball
    const r = 0.028;
    const fx = pw / 4;
    let n = 0;
    for (let row = 0; row < 5; row++) {
      for (let j = 0; j <= row; j++) {
        const bx = fx + row * r * 1.74;
        const bz = (j - row / 2) * r * 2.02;
        const col = n === 4 ? BALL_COLORS[7] : BALL_COLORS[n % 7];
        k.sphere(r, M.ceramic(col), bx, top + r, bz, 1, 1, 1, 8);
        if (n >= 8) k.sphere(r * 0.55, M.ceramic('#f6f3ea'), bx, top + r + r * 0.6, bz, 1, 0.6, 1, 6);
        n++;
      }
    }
    const tri = new THREE.Shape();
    tri.moveTo(fx - 0.05, 0);
    tri.lineTo(fx + 0.3, 0.2);
    tri.lineTo(fx + 0.3, -0.2);
    tri.lineTo(fx - 0.05, 0);
    const hole = new THREE.Path();
    hole.moveTo(fx - 0.025, 0);
    hole.lineTo(fx + 0.285, -0.178);
    hole.lineTo(fx + 0.285, 0.178);
    hole.lineTo(fx - 0.025, 0);
    tri.holes.push(hole);
    k.slab(tri, 0.035, M.wood(PAL.oak, 0.4), 0, top, 0);
    k.sphere(r, M.ceramic('#f6f3ea'), -pw / 4, top + r, 0, 1, 1, 1, 8);
    // two cues lying on the table + chalk
    for (const dz of [-0.36, -0.42]) k.rod([-0.85, top + 0.01, dz], [0.6, top + 0.018, dz + 0.04], 0.0065, M.wood(PAL.birch, 0.4), 0.014, 8);
    for (const dz of [-0.36, -0.42]) k.rod([-0.85, top + 0.01, dz], [-0.55, top + 0.016, dz + 0.008], 0.0145, M.wood('#2b1d16', 0.4), 0.014, 8);
    k.box(0.022, 0.022, 0.022, M.matte('#2f6db3'), 0.9, top + 0.045, d / 2 - rd / 2);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { w, d, pw, pd } = POOL;
      D.rr(ctx, 0, 0, w, d, 0.03, tint(c.wood, 0.35));
      D.rr(ctx, 0, 0, pw, pd, 0, tint(c.felt, 0.3), INK, LINE_THIN);
      for (const [px, pz] of [[-1, -1], [0, -1], [1, -1], [-1, 1], [0, 1], [1, 1]] as const) D.circle(ctx, (px * pw) / 2, (pz * pd) / 2, 0.06, '#3a3b3e', INK, LINE_THIN);
      D.poly(ctx, [[pw / 4 - 0.05, 0], [pw / 4 + 0.3, -0.2], [pw / 4 + 0.3, 0.2]], true, '#f2e6c8', INK, LINE_THIN);
      D.circle(ctx, -pw / 4, 0, 0.028, '#ffffff', INK, LINE_THIN);
      D.line(ctx, -0.85, -0.38, 0.6, -0.36, INK_SOFT, LINE_THIN * 1.5);
    }),
};

/* ------------------------------------------------------------------ ping-pong */

const PP = { w: 2.74, d: 1.525, h: 0.76 };

const pingPong: FurnitureDef = {
  id: 'game-ping-pong',
  name: 'שולחן טניס שולחן (פינג-פונג)',
  category: CAT,
  group: G_GAME,
  tags: ['פינג פונג', 'טניס שולחן', 'מחבט', 'שולחן משחק'],
  size: { w: PP.w, d: PP.d, h: 0.93 },
  colors: [slot('top', 'משטח', '#1f4f8a'), slot('frame', 'מסגרת', '#2a2b2e')],
  actions: [{ kind: 'play', label: 'שחק פינג-פונג', at: { x: PP.w / 2 + 0.45, y: 0, z: 0 } }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { w, d, h } = PP;
    const fr = M.metal(c.frame, 0.5, 0.6);
    const white = M.matte('#f4f4f2');
    // undercarriages with wheels
    for (const sx of [-1, 1]) {
      const x = sx * 0.75;
      for (const sz of [-1, 1]) {
        k.rbox(0.04, h - 0.1, 0.04, 0.006, fr, x, 0.05, sz * 0.6, 1);
        xcyl(k, 0.05, 0.03, M.rubber(), x, 0.05, sz * 0.6, 14);
      }
      k.rbox(0.04, 0.04, 1.24, 0.006, fr, x, 0.18, 0, 1);
      k.rod([x, 0.2, -0.6], [x * 0.3, h - 0.05, 0], 0.012, fr);
      k.rod([x, 0.2, 0.6], [x * 0.3, h - 0.05, 0], 0.012, fr);
    }
    for (const sx of [-1, 1]) k.box(w / 2 - 0.1, 0.05, d - 0.1, fr, sx * (w / 4), h - 0.075, 0);
    // top (two halves) with white lines
    for (const sx of [-1, 1]) k.box(w / 2 - 0.004, 0.025, d, M.paint(c.top, 0.55), sx * (w / 4 + 0.001), h - 0.025, 0);
    for (const sz of [-1, 1]) k.box(w, 0.0015, 0.02, white, 0, h, sz * (d / 2 - 0.01));
    for (const sx of [-1, 1]) k.box(0.02, 0.0015, d - 0.04, white, sx * (w / 2 - 0.01), h, 0);
    k.box(w - 0.04, 0.0015, 0.003, white, 0, h, 0);
    // net with posts
    for (const sz of [-1, 1]) {
      k.box(0.03, 0.17, 0.03, fr, 0, h - 0.02, sz * (d / 2 + 0.0 - 0.015));
    }
    k.box(0.003, 0.15, d - 0.03, M.glass('#1b1c1f', 0.55), 0, h, 0);
    k.box(0.006, 0.015, d - 0.03, white, 0, h + 0.14, 0);
    // two paddles + ball
    for (const [px, pz, rot] of [[-0.9, 0.35, 0.4], [1.0, -0.4, -2.4]] as const) {
      const pk = new Kit();
      pk.cyl(0.075, 0.006, M.rubber('#c62828'), 0, 0, 0, 0.075, 18);
      pk.cyl(0.075, 0.003, M.rubber('#151517'), 0, -0.003, 0, 0.075, 18);
      pk.rbox(0.03, 0.022, 0.1, 0.008, M.wood(PAL.oakLight), 0, -0.006, 0.12, 1);
      k.sub(pk, px, h + 0.003, pz).rotation.y = rot;
    }
    k.sphere(0.02, M.matte('#ff8a1f'), 0.3, h + 0.02, 0.2, 1, 1, 1, 10);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, PP.w, PP.d, 0, tint(c.top, 0.3));
      D.rr(ctx, 0, 0, PP.w - 0.04, PP.d - 0.04, 0, null, '#ffffff', LINE_THIN);
      D.line(ctx, -PP.w / 2 + 0.02, 0, PP.w / 2 - 0.02, 0, '#ffffff', LINE_THIN);
      D.line(ctx, 0, -PP.d / 2, 0, PP.d / 2, INK, LINE * 1.5);
    }),
};

/* ------------------------------------------------------------------ foosball */

const FB = { bw: 1.2, bd: 0.72, w: 1.24, d: 1.2, h: 0.95 };

const foosball: FurnitureDef = {
  id: 'game-foosball',
  name: 'שולחן כדורגל (פוסבול)',
  category: CAT,
  group: G_GAME,
  tags: ['כדורגל שולחן', 'פוסבול', 'שולחן משחק', 'בובות'],
  size: { w: FB.w, d: FB.d, h: FB.h },
  colors: [slot('body', 'ארגז', PAL.walnut), slot('team1', 'קבוצה 1', '#d1262b'), slot('team2', 'קבוצה 2', '#1f4fb4')],
  actions: [{ kind: 'play', label: 'שחק כדורגל שולחן', at: { x: 0, y: 0, z: FB.d / 2 + 0.3 } }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { bw, bd } = FB;
    const wood = M.wood(c.body, 0.45);
    const chrome = M.chrome();
    // legs, body walls, playfield
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      k.rbox(0.07, 0.62, 0.07, 0.008, wood, sx * (bw / 2 - 0.06), 0.02, sz * (bd / 2 - 0.06), 1);
      k.cyl(0.035, 0.02, M.rubber(), sx * (bw / 2 - 0.06), 0, sz * (bd / 2 - 0.06), 0.03, 10);
    }
    k.box(bw - 0.2, 0.05, 0.04, wood, 0, 0.15, 0);
    const y0 = 0.62;
    k.box(bw, 0.04, bd, wood, 0, y0, 0);
    k.box(bw - 0.06, 0.006, bd - 0.06, M.fabric('#2f8a4a', 50), 0, y0 + 0.04, 0);
    const lineM = M.matte('#f4f4f2');
    k.box(0.006, 0.001, bd - 0.07, lineM, 0, y0 + 0.046, 0);
    k.ring(0.09, 0.003, lineM, 0, y0 + 0.047, 0, 20);
    for (const sz of [-1, 1]) k.box(bw, 0.25, 0.03, wood, 0, y0 + 0.04, sz * (bd / 2 - 0.015));
    for (const sx of [-1, 1]) {
      k.box(0.03, 0.25, bd - 0.06, wood, sx * (bw / 2 - 0.015), y0 + 0.04, 0);
      k.box(0.004, 0.08, 0.2, M.matte('#050506'), sx * (bw / 2 - 0.031), y0 + 0.046, 0);
    }
    // score counters (beads on a rod)
    for (const sx of [-1, 1]) {
      k.rod([sx * 0.45, y0 + 0.3, -bd / 2 + 0.015], [sx * 0.45, y0 + 0.3, -bd / 2 + 0.2], 0.003, chrome);
      for (let i = 0; i < 5; i++) k.sphere(0.012, M.plastic('#f2f2f2'), sx * 0.45, y0 + 0.3, -bd / 2 + 0.04 + i * 0.03, 1, 1, 1, 6);
    }
    // rods with players and handles
    const teams = [0, 0, 1, 0, 1, 0, 1, 1];
    const counts = [1, 2, 3, 5, 5, 3, 2, 1];
    const ry = y0 + 0.2;
    for (let i = 0; i < 8; i++) {
      const x = -bw / 2 + 0.11 + i * ((bw - 0.22) / 7);
      const t = teams[i];
      const side = t === 0 ? 1 : -1;
      const zEnd = side * (FB.d / 2 - 0.13);
      const zStart = -side * (bd / 2 + 0.02);
      k.rod([x, ry, zStart], [x, ry, zEnd], 0.008, chrome, 0.008, 8);
      k.cyl(0.02, 0.11, M.rubber('#1b1c1f'), 0, 0, 0, 0.02, 10).position.set(x, ry, zEnd + side * 0.055);
      (k.g.children[k.g.children.length - 1] as THREE.Mesh).rotation.x = Math.PI / 2;
      const col = M.plastic(t === 0 ? c.team1 : c.team2);
      const n = counts[i];
      const span = n === 1 ? 0 : n === 2 ? 0.24 : n === 3 ? 0.4 : 0.52;
      for (let j = 0; j < n; j++) {
        const z = n === 1 ? 0 : -span / 2 + (span * j) / (n - 1);
        k.box(0.03, 0.085, 0.036, col, x, ry - 0.06, z);
        k.sphere(0.017, M.plastic('#f0d2b4'), x, ry + 0.035, z, 1, 1, 1, 6);
        k.box(0.022, 0.07, 0.016, col, x, ry - 0.13, z);
        k.box(0.03, 0.008, 0.02, M.matte('#151517'), x + 0.004, ry - 0.135, z);
      }
    }
    k.sphere(0.017, M.matte('#f4f4f2'), 0.07, y0 + 0.064, 0.08, 1, 1, 1, 10);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { bw, bd } = FB;
      D.rr(ctx, 0, 0, bw, bd, 0.01, tint(c.body, 0.35));
      D.rr(ctx, 0, 0, bw - 0.06, bd - 0.06, 0, tint('#2f8a4a', 0.35), INK, LINE_THIN);
      for (let i = 0; i < 8; i++) {
        const x = -bw / 2 + 0.11 + i * ((bw - 0.22) / 7);
        const side = [0, 0, 1, 0, 1, 0, 1, 1][i] === 0 ? 1 : -1;
        D.line(ctx, x, -side * (bd / 2), x, side * (FB.d / 2 - 0.02), INK, LINE_THIN * 1.4);
      }
    }),
};

/* ------------------------------------------------------------------ air hockey */

const AH = { w: 2.14, d: 1.16, h: 0.98 };

const airHockey: FurnitureDef = {
  id: 'game-air-hockey',
  name: 'שולחן הוקי אוויר',
  category: CAT,
  group: G_GAME,
  tags: ['הוקי אוויר', 'שולחן משחק', 'ארקייד', 'דיסקית'],
  size: { w: AH.w, d: AH.d, h: AH.h },
  colors: [slot('body', 'גוף', '#1b1c1f'), slot('accent', 'פסים', '#d1262b'), slot('led', 'לד', '#3fd0ff')],
  actions: [{ kind: 'play', label: 'שחק הוקי אוויר', at: { x: AH.w / 2 + 0.4, y: 0, z: 0 } }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { w, d } = AH;
    const body = M.lacquer(c.body);
    const accent = M.matte(c.accent);
    // legs + cabinet with glowing side strip
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.rbox(0.08, 0.6, 0.08, 0.01, body, sx * (w / 2 - 0.15), 0, sz * (d / 2 - 0.12), 1);
    k.rbox(w - 0.2, 0.06, d - 0.2, 0.01, body, 0, 0.12, 0, 1);
    k.rbox(w, 0.2, d, 0.02, body, 0, 0.6, 0, 1);
    for (const sz of [-1, 1]) k.box(w - 0.1, 0.012, 0.004, M.glow(c.led, 2, lighten(c.led, 0.5)), 0, 0.69, sz * (d / 2 + 0.001));
    // playing surface + markings
    const ty = 0.8;
    k.box(w - 0.1, 0.004, d - 0.1, M.matte('#f4f5f6'), 0, ty, 0);
    k.box(0.012, 0.001, d - 0.1, accent, 0, ty + 0.004, 0);
    k.ring(0.16, 0.004, accent, 0, ty + 0.005, 0, 28);
    for (const sx of [-1, 1]) {
      k.box(0.008, 0.001, d - 0.1, M.matte('#1f4fb4'), sx * 0.5, ty + 0.004, 0);
      const arc = k.geo(new THREE.TorusGeometry(0.2, 0.004, 4, 16, Math.PI), accent, sx * (w / 2 - 0.05), ty + 0.005, 0);
      arc.rotation.set(-Math.PI / 2, 0, sx > 0 ? Math.PI / 2 : -Math.PI / 2);
    }
    // rails with goal slots
    for (const sz of [-1, 1]) k.rbox(w, 0.06, 0.05, 0.012, body, 0, ty - 0.004, sz * (d / 2 - 0.025), 1);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) k.rbox(0.05, 0.06, (d - 0.3) / 2 - 0.05, 0.012, body, sx * (w / 2 - 0.025), ty - 0.004, sz * ((d - 0.3) / 4 + 0.15 - 0.0), 1);
      k.box(0.02, 0.03, 0.3, M.matte('#050506'), sx * (w / 2 - 0.02), ty - 0.004, 0);
    }
    // score display at the side
    k.rbox(0.3, 0.12, 0.06, 0.01, body, 0, ty + 0.056, -d / 2 + 0.03, 1);
    for (const sx of [-1, 1]) k.box(0.08, 0.06, 0.002, M.glow(sx < 0 ? c.accent : c.led, 2), sx * 0.07, ty + 0.085, -d / 2 + 0.061);
    // mallets + puck
    for (const [mx, col] of [[-0.75, c.accent], [0.75, '#1f4fb4']] as const) {
      k.cyl(0.048, 0.025, M.plastic(col), mx, ty + 0.004, 0.05, 0.045, 18);
      k.cyl(0.02, 0.05, M.plastic(col), mx, ty + 0.029, 0.05, 0.018, 12);
      k.sphere(0.024, M.plastic(col), mx, ty + 0.08, 0.05, 1, 0.8, 1, 10);
    }
    k.cyl(0.032, 0.006, M.plastic('#f2c230'), 0.2, ty + 0.004, -0.12, 0.032, 18);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, AH.w, AH.d, 0.03, tint(c.body, 0.5));
      D.rr(ctx, 0, 0, AH.w - 0.1, AH.d - 0.1, 0, '#fbfbfc', INK, LINE_THIN);
      D.line(ctx, 0, -AH.d / 2 + 0.05, 0, AH.d / 2 - 0.05, c.accent, LINE_THIN);
      D.circle(ctx, 0, 0, 0.16, null, c.accent, LINE_THIN);
      for (const sx of [-1, 1]) {
        D.arc(ctx, sx * (AH.w / 2 - 0.05), 0, 0.2, sx > 0 ? Math.PI / 2 : -Math.PI / 2, sx > 0 ? (Math.PI * 3) / 2 : Math.PI / 2, c.accent, LINE_THIN);
        D.circle(ctx, sx * 0.75, 0.05, 0.048, tint(sx < 0 ? c.accent : '#1f4fb4', 0.2), INK, LINE_THIN);
      }
    }),
};

/* ------------------------------------------------------------------ poker table */

/** Upholstered game chair at (x, z) rotated so its front faces angle `a` (0 = +Z). */
function gameChair(k: Kit, x: number, z: number, a: number, wood: THREE.Material, pad: THREE.Material): void {
  const ck = new Kit();
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) ck.box(0.04, 0.4, 0.04, wood, sx * 0.19, 0, sz * 0.18);
  ck.box(0.46, 0.04, 0.44, wood, 0, 0.4, 0);
  ck.cushion(0.44, 0.05, 0.42, pad, 0, 0.43, 0.005, 0.025, 0.012, 1);
  for (const sx of [-1, 1]) ck.box(0.04, 0.48, 0.04, wood, sx * 0.19, 0.44, -0.2);
  ck.cushion(0.4, 0.3, 0.06, pad, 0, 0.58, -0.2, 0.025, 0.01, 1);
  const g = k.sub(ck, x, 0, z);
  g.rotation.y = a;
}

const POKER = { r: 0.62, chairR: 0.86, size: 2.2, seatH: 0.48 };

const pokerTable: FurnitureDef = {
  id: 'game-poker-table',
  name: 'שולחן פוקר עגול עם 4 כיסאות',
  category: CAT,
  group: G_GAME,
  tags: ['פוקר', 'קלפים', 'שולחן משחק', 'לבד', 'כיסאות', 'קזינו'],
  size: { w: POKER.size, d: POKER.size, h: 0.92 },
  colors: [slot('felt', 'לבד', '#1f6b45'), slot('rail', 'מסעד מרופד', '#1b1c1f'), slot('wood', 'עץ', PAL.walnut)],
  seats: [0, 1, 2, 3].map((i): SeatAnchor => {
    const a = (i * Math.PI) / 2;
    return { x: Math.sin(a) * POKER.chairR, z: Math.cos(a) * POKER.chairR, height: POKER.seatH, facing: a + Math.PI, kind: 'sit' };
  }),
  actions: [{ kind: 'play', label: 'שחק קלפים', at: { x: 0, y: 0, z: POKER.chairR } }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const wood = M.wood(c.wood, 0.4);
    const { r } = POKER;
    const ty = 0.76;
    // pedestal base
    k.cyl(0.34, 0.04, wood, 0, 0, 0, 0.3, 28);
    k.cyl(0.08, ty - 0.1, wood, 0, 0.04, 0, 0.1, 18);
    k.cyl(0.26, 0.06, wood, 0, ty - 0.06, 0, 0.3, 28);
    // felt top, wooden racetrack, padded rail
    k.cyl(r - 0.1, 0.02, M.fabric(c.felt, 60), 0, ty, 0, r - 0.1, 32);
    k.cyl(r - 0.05, 0.016, wood, 0, ty, 0, r - 0.05, 32);
    k.ring(r - 0.05, 0.05, M.leather(c.rail), 0, ty + 0.03, 0, 32);
    k.ring(r - 0.3, 0.003, M.matte(lighten(c.felt, 0.35)), 0, ty + 0.021, 0, 28);
    // chip stacks + a deck and dealt cards
    const chipCols = ['#d1262b', '#1f4fb4', '#f4f4f2', '#111113', '#1d7a3c'];
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      const cx = Math.sin(a) * 0.36;
      const cz = Math.cos(a) * 0.36;
      for (let s = 0; s < 3; s++) {
        const n = 3 + ((i + s) % 4);
        const ox = cx + Math.cos(a) * (s - 1) * 0.045;
        const oz = cz - Math.sin(a) * (s - 1) * 0.045;
        k.cyl(0.019, n * 0.0034, M.plastic(chipCols[(i + s) % 5]), ox, ty + 0.02, oz, 0.019, 12);
      }
      for (let j = 0; j < 2; j++) {
        const card = k.box(0.063, 0.001, 0.088, M.matte('#f6f6f4'), 0, 0, 0);
        card.position.set(Math.sin(a) * 0.22 + Math.cos(a) * (j - 0.5) * 0.04, ty + 0.021 + j * 0.001, Math.cos(a) * 0.22 - Math.sin(a) * (j - 0.5) * 0.04);
        card.rotation.y = a + (j - 0.5) * 0.2;
      }
    }
    for (let i = 0; i < 3; i++) k.box(0.063, 0.001, 0.088, M.matte('#f6f6f4'), -0.08 + i * 0.075, ty + 0.021, 0);
    k.box(0.064, 0.02, 0.089, M.matte('#b3242c'), 0.16, ty + 0.021, -0.08);
    // chairs
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      gameChair(k, Math.sin(a) * POKER.chairR, Math.cos(a) * POKER.chairR, a + Math.PI, wood, M.leather(c.rail));
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2;
        ctx.save();
        ctx.translate(Math.sin(a) * POKER.chairR, Math.cos(a) * POKER.chairR);
        ctx.rotate(-a);
        D.rr(ctx, 0, 0, 0.46, 0.44, 0.04, tint(c.rail, 0.5));
        D.line(ctx, -0.2, 0.2, 0.2, 0.2, INK, LINE_THIN * 2);
        ctx.restore();
      }
      D.circle(ctx, 0, 0, POKER.r, tint(c.rail, 0.45));
      D.circle(ctx, 0, 0, POKER.r - 0.1, tint(c.felt, 0.3), INK, LINE_THIN);
    }),
};

/* ------------------------------------------------------------------ chess table */

const CHESS = { w: 0.62, d: 1.66, h: 0.92, chairZ: 0.6, seatH: 0.48 };

function chessPiece(k: Kit, type: number, mat: THREE.Material, x: number, y: number, z: number, s: number): void {
  // type: 0 pawn, 1 rook, 2 knight, 3 bishop, 4 queen, 5 king
  const hgt = [0.032, 0.038, 0.042, 0.048, 0.056, 0.062][type] * s;
  const r = 0.011 * s;
  k.lathe(
    [
      [r, 0],
      [r * 0.85, r * 0.6],
      [r * 0.38, hgt * 0.72],
      [type === 1 ? r * 0.7 : r * 0.55, hgt * 0.82],
      [0, hgt * 0.84],
    ],
    mat,
    x,
    y,
    z,
    6,
  );
  if (type === 0) k.sphere(r * 0.55, mat, x, y + hgt * 0.9, z, 1, 1, 1, 6);
  else if (type === 2) {
    const h = k.box(r * 0.6, hgt * 0.4, r * 1.4, mat, 0, 0, 0);
    h.position.set(x, y + hgt * 0.95, z);
    h.rotation.x = 0.5;
  } else if (type === 3) k.sphere(r * 0.5, mat, x, y + hgt * 0.95, z, 1, 1.5, 1, 6);
  else if (type === 4) k.sphere(r * 0.55, mat, x, y + hgt * 0.95, z, 1, 1, 1, 6);
  else if (type === 5) {
    k.box(r * 0.3, hgt * 0.3, r * 0.3, mat, x, y + hgt * 0.82, z);
    k.box(r * 0.9, r * 0.28, r * 0.3, mat, x, y + hgt * 0.92, z);
  }
}

const chessTable: FurnitureDef = {
  id: 'game-chess-table',
  name: 'שולחן שחמט עם 2 כיסאות',
  category: CAT,
  group: G_GAME,
  tags: ['שחמט', 'שח', 'משחק קופסה', 'שולחן', 'כיסאות'],
  size: { w: CHESS.w, d: CHESS.d, h: CHESS.h },
  colors: [slot('wood', 'עץ', PAL.walnut), slot('light', 'משבצות בהירות', '#e8d6b0'), slot('pad', 'ריפוד', '#6b2d2a')],
  seats: [
    { x: 0, z: CHESS.chairZ, height: CHESS.seatH, facing: Math.PI, kind: 'sit' },
    { x: 0, z: -CHESS.chairZ, height: CHESS.seatH, facing: 0, kind: 'sit' },
  ],
  actions: [{ kind: 'play', label: 'שחק שחמט', at: { x: 0, y: 0, z: CHESS.chairZ } }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const wood = M.wood(c.wood, 0.35);
    const ty = 0.72;
    // pedestal table with inlaid board
    k.rbox(0.42, 0.03, 0.42, 0.01, wood, 0, 0, 0, 1);
    k.lathe([[0.05, 0], [0.04, 0.1], [0.06, 0.3], [0.035, 0.5], [0.06, ty - 0.04 - 0.03], [0, ty - 0.07]], wood, 0, 0.03, 0, 14);
    k.rbox(0.62, 0.035, 0.62, 0.01, wood, 0, ty - 0.035, 0, 1);
    const sq = 0.058;
    const b0 = -4 * sq;
    k.box(8 * sq + 0.02, 0.003, 8 * sq + 0.02, M.wood('#2b1d16', 0.3), 0, ty, 0);
    k.box(8 * sq, 0.002, 8 * sq, M.wood(c.light, 0.3), 0, ty + 0.001, 0);
    const dark = M.wood(darken(c.wood, 0.25), 0.3);
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) if ((i + j) % 2 === 1) k.geo(new THREE.PlaneGeometry(sq, sq), dark, b0 + (i + 0.5) * sq, ty + 0.0032, b0 + (j + 0.5) * sq).rotation.x = -Math.PI / 2;
    // pieces in their starting squares (a pawn already moved)
    const back = [1, 2, 3, 4, 5, 3, 2, 1];
    const wM = M.ceramic('#f3eee2');
    const bM = M.lacquer('#1b1b1d');
    const py = ty + 0.0035;
    for (let i = 0; i < 8; i++) {
      const x = b0 + (i + 0.5) * sq;
      chessPiece(k, back[i], wM, x, py, b0 + 7.5 * sq, 1);
      chessPiece(k, 0, wM, x, py, b0 + (i === 4 ? 4.5 : 6.5) * sq, 1);
      chessPiece(k, back[i], bM, x, py, b0 + 0.5 * sq, 1);
      chessPiece(k, 0, bM, x, py, b0 + (i === 3 ? 3.5 : 1.5) * sq, 1);
    }
    // two chairs facing each other
    gameChair(k, 0, CHESS.chairZ, Math.PI, wood, M.velvet(c.pad));
    gameChair(k, 0, -CHESS.chairZ, 0, wood, M.velvet(c.pad));
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      for (const sz of [-1, 1]) {
        D.rr(ctx, 0, sz * CHESS.chairZ, 0.46, 0.44, 0.04, tint(c.pad, 0.5));
        D.line(ctx, -0.2, sz * (CHESS.chairZ + 0.2), 0.2, sz * (CHESS.chairZ + 0.2), INK, LINE_THIN * 2);
      }
      D.rr(ctx, 0, 0, 0.62, 0.62, 0.02, tint(c.wood, 0.35));
      const sq = 0.058;
      D.rr(ctx, 0, 0, 8 * sq, 8 * sq, 0, tint(c.light, 0.2), INK, LINE_THIN);
      for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) if ((i + j) % 2 === 1) D.rr(ctx, -4 * sq + (i + 0.5) * sq, -4 * sq + (j + 0.5) * sq, sq, sq, 0, tint(c.wood, 0.1), null);
    }),
};

/* ------------------------------------------------------------------ dart board */

const DART = { w: 1.24, d: 0.17, h: 0.62, cy: 0.31, elev: 1.73 - 0.31 };

const dartBoard: FurnitureDef = {
  id: 'game-dart-board',
  name: 'לוח חצים בארון עם לוח ניקוד',
  category: CAT,
  group: G_GAME,
  tags: ['חצים', 'דארטס', 'לוח', 'קיר', 'משחק'],
  size: { w: DART.w, d: DART.d, h: DART.h },
  mount: 'wall',
  elevation: DART.elev,
  colors: [slot('wood', 'ארון', '#6b3b22'), slot('red', 'אדום', '#c62828'), slot('green', 'ירוק', '#1d7a3c')],
  actions: [{ kind: 'darts', at: { x: 0, y: DART.cy, z: -DART.d / 2 + 0.065 } }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const wood = M.wood(c.wood, 0.45);
    const zb = -DART.d / 2;
    const cy = DART.cy;
    // cabinet box (open) + two doors swung flat against the wall with chalk boards
    k.box(0.62, 0.62, 0.02, wood, 0, 0, zb + 0.01);
    for (const sx of [-1, 1]) k.box(0.025, 0.62, 0.1, wood, sx * 0.2975, 0, zb + 0.05);
    for (const sy of [0, 1]) k.box(0.57, 0.025, 0.1, wood, 0, sy * 0.595, zb + 0.05);
    for (const sx of [-1, 1]) {
      const x = sx * (0.31 + 0.155);
      k.box(0.31, 0.62, 0.025, wood, x, 0, zb + 0.0125);
      k.box(0.26, 0.5, 0.004, M.matte('#2b3a33'), x, 0.08, zb + 0.026);
      for (let i = 0; i < 4; i++) k.box(0.2, 0.004, 0.001, M.matte('#d7dcd8'), x, 0.5 - i * 0.1, zb + 0.0285);
      k.box(0.24, 0.02, 0.03, wood, x, 0.04, zb + 0.04);
      k.box(0.04, 0.012, 0.012, M.matte('#f4f4f2'), x + 0.06, 0.06, zb + 0.045);
    }
    // board: black sisal base + coloured segments
    const bz = zb + 0.02;
    zcyl(k, 0.225, 0.04, M.matte('#141414'), 0, cy, bz + 0.02, 40);
    const fz = bz + 0.0405;
    const cream = M.matte('#efe3c6');
    const black = M.matte('#1a1a1a');
    const red = M.matte(c.red);
    const green = M.matte(c.green);
    const bands: Array<[number, number, boolean]> = [
      [0.0159, 0.099, false],
      [0.099, 0.107, true],
      [0.107, 0.162, false],
      [0.162, 0.17, true],
    ];
    for (let j = 0; j < 20; j++) {
      const a = Math.PI / 2 - (j * Math.PI * 2) / 20;
      for (const [r0, r1, scoring] of bands) {
        const mat = scoring ? (j % 2 === 0 ? red : green) : j % 2 === 0 ? black : cream;
        k.geo(new THREE.RingGeometry(r0, r1, 2, 1, a - Math.PI / 20, Math.PI / 10), mat, 0, cy, fz);
      }
      // number marker
      k.box(0.012, 0.012, 0.002, M.matte('#f4f4f2'), Math.cos(a) * 0.195, cy + Math.sin(a) * 0.195 - 0.006, fz);
    }
    zcyl(k, 0.0159, 0.002, green, 0, cy, fz + 0.0005, 16);
    zcyl(k, 0.00635, 0.002, red, 0, cy, fz + 0.001, 12);
    k.geo(new THREE.TorusGeometry(0.17, 0.0015, 3, 40), M.chrome(), 0, cy, fz + 0.001);
    // three darts stuck in the board
    for (const [dx, dy, col] of [[0.02, 0.1, '#e0383e'], [-0.06, 0.13, '#e0383e'], [0.11, -0.05, '#1f4fb4']] as const) {
      const x = dx;
      const y = cy + dy;
      k.rod([x, y, fz], [x, y, fz + 0.02], 0.0012, M.chrome(), 0.0012, 6);
      k.rod([x, y, fz + 0.02], [x, y, fz + 0.05], 0.0035, M.brushed('#9fa2a5'), 0.003, 8);
      k.rod([x, y, fz + 0.05], [x, y, fz + 0.07], 0.0018, M.plastic('#1b1c1f'), 0.0018, 6);
      k.box(0.03, 0.002, 0.03, M.plastic(col), x, y - 0.001, fz + 0.072);
      k.box(0.002, 0.03, 0.03, M.plastic(col), x, y - 0.015, fz + 0.072);
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const zb = -DART.d / 2;
      D.rr(ctx, 0, zb + 0.05, 0.62, 0.1, 0, tint(c.wood, 0.35));
      for (const sx of [-1, 1]) D.rr(ctx, sx * 0.465, zb + 0.0125, 0.31, 0.025, 0, tint(c.wood, 0.2));
      D.rr(ctx, 0, zb + 0.04, 0.45, 0.04, 0, '#3a3b3e', INK, LINE_THIN);
      D.line(ctx, 0.02, zb + 0.06, 0.02, zb + 0.165, c.red, LINE_THIN * 1.5);
    }),
};

/* ------------------------------------------------------------------ cue rack */

const cueRack: FurnitureDef = {
  id: 'game-cue-rack',
  name: 'מתקן קיר למקלות ביליארד',
  category: CAT,
  group: G_GAME,
  tags: ['ביליארד', 'מקלות', 'מתלה', 'קיר'],
  size: { w: 0.6, d: 0.12, h: 1.52 },
  mount: 'wall',
  elevation: 0.2,
  colors: [slot('wood', 'עץ', '#5a3522')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const wood = M.wood(c.wood, 0.4);
    const zb = -0.06;
    k.box(0.08, 1.52, 0.02, wood, -0.26, 0, zb + 0.01);
    k.box(0.08, 1.52, 0.02, wood, 0.26, 0, zb + 0.01);
    k.rbox(0.6, 0.04, 0.1, 0.008, wood, 0, 1.3, zb + 0.05, 1);
    k.rbox(0.6, 0.12, 0.12, 0.01, wood, 0, 0.0, zb + 0.06, 1);
    // ball tray on the base: balls in a row
    for (let i = 0; i < 8; i++) k.sphere(0.022, M.ceramic(BALL_COLORS[i]), -0.2 + i * 0.057, 0.142, zb + 0.06, 1, 1, 1, 8);
    for (let i = 0; i < 6; i++) {
      const x = -0.2 + i * 0.08;
      k.rod([x, 0.08, zb + 0.06], [x, 1.47, zb + 0.06], 0.014, M.wood(i % 2 ? '#2b1d16' : '#6b3b22', 0.4), 0.0065, 8);
      k.rod([x, 0.47, zb + 0.06], [x, 1.47, zb + 0.06], 0.0105, M.wood(PAL.birch, 0.4), 0.0065, 8);
      k.cyl(0.0068, 0.012, M.matte('#3a7bd5'), x, 1.47, zb + 0.06, 0.0068, 8);
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 0.6, 0.12, 0.01, tint(c.wood, 0.35));
      for (let i = 0; i < 6; i++) D.circle(ctx, -0.2 + i * 0.08, 0, 0.014, tint(c.wood, 0.1), INK, LINE_THIN);
    }),
};

const GAMES: FurnitureDef[] = [arcade, pinball, consoleSetup, poolTable, pingPong, foosball, airHockey, pokerTable, chessTable, dartBoard, cueRack];

/* ================================================================== FIRE */

/** A split log lying along X (y = centre), bark + lighter end grain. */
function log(k: Kit, len: number, r: number, x: number, y: number, z: number, rotY = 0, rotZ = 0): void {
  const lk = new Kit();
  xcyl(lk, r, len, M.bark('#4a3527'), 0, 0, 0, 9);
  for (const sx of [-1, 1]) xcyl(lk, r * 0.92, 0.004, M.wood('#b98a5a', 0.8), sx * (len / 2 + 0.001), 0, 0, 9);
  const g = k.sub(lk, x, y, z);
  g.rotation.set(0, rotY, rotZ);
}

/** Bed of glowing embers + three logs centred at (x, y, z) (y = floor of the bed). */
function logBed(k: Kit, x: number, y: number, z: number, s = 1): void {
  const ember = M.glow('#ff5a1a', 1.6, '#ff9a4a');
  const hot = M.glow('#ffb347', 2.2, '#ffd9a0');
  k.box(0.42 * s, 0.012, 0.18 * s, M.matte('#2a2422'), x, y, z);
  for (let i = 0; i < 9; i++) {
    const r = rng(40 + i);
    k.sphere(0.018 * s, i % 3 ? ember : hot, x + (r() - 0.5) * 0.34 * s, y + 0.012, z + (r() - 0.5) * 0.12 * s, 1, 0.5, 1, 6);
  }
  log(k, 0.4 * s, 0.045 * s, x, y + 0.05 * s, z - 0.035 * s, 0.12, 0.02);
  log(k, 0.38 * s, 0.04 * s, x, y + 0.045 * s, z + 0.045 * s, -0.1, -0.03);
  log(k, 0.36 * s, 0.038 * s, x + 0.02 * s, y + 0.12 * s, z + 0.0, 0.35, 0.08);
}

/* ------------------------------------------------------------------ mantel fireplace */

const MANTEL = { w: 1.5, d: 0.42, h: 1.22, ow: 0.82, oh: 0.76 };

const mantelFireplace: FurnitureDef = {
  id: 'fireplace-mantel',
  name: 'אח קלאסית עם מדף ובולי עץ',
  category: CAT,
  group: G_FIRE,
  tags: ['אח', 'קמין', 'עצים', 'שיש', 'קלאסי', 'חורף'],
  size: { w: MANTEL.w, d: MANTEL.d, h: 1.36 },
  colors: [slot('stone', 'שיש', '#efece6'), slot('inner', 'פנים האח', '#3a2f2a')],
  actions: [{ kind: 'fire', at: { x: 0, y: 0.13, z: -0.08 } }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const stone = M.marble(c.stone);
    const { w, d, ow, oh } = MANTEL;
    const zb = -d / 2;
    const sd = 0.26;
    const zs = zb + sd / 2;
    // hearth slab on the floor
    k.rbox(w - 0.06, 0.04, d - 0.0, 0.008, stone, 0, 0, 0, 1);
    // pilasters with plinths and capitals
    const pw = (w - 0.12 - ow) / 2;
    for (const sx of [-1, 1]) {
      const x = sx * (ow / 2 + pw / 2);
      k.box(pw + 0.04, 0.12, sd + 0.03, stone, x, 0.04, zs + 0.015);
      k.box(pw, oh + 0.08 - 0.16, sd, stone, x, 0.16, zs);
      for (let i = 0; i < 3; i++) k.box(0.012, oh - 0.2, 0.006, M.marble(darken(c.stone, 0.06)), x - pw / 3 + (i * pw) / 3, 0.2, zs + sd / 2 + 0.001);
      k.box(pw + 0.03, 0.04, sd + 0.02, stone, x, oh + 0.04, zs + 0.01);
    }
    // frieze over the opening + mantel shelf with moulding
    k.box(w - 0.12, 0.2, sd, stone, 0, oh + 0.08, zs);
    k.box(ow * 0.55, 0.1, 0.012, M.marble(darken(c.stone, 0.04)), 0, oh + 0.13, zs + sd / 2 + 0.004);
    k.rbox(w - 0.08, 0.03, sd + 0.06, 0.01, stone, 0, oh + 0.28, zs + 0.03, 1);
    k.rbox(w, 0.05, d - 0.04, 0.012, stone, 0, oh + 0.31, zb + (d - 0.04) / 2, 2);
    // firebox: dark interior with brick-like courses
    const inner = M.matte(c.inner);
    k.box(ow, oh + 0.08 - 0.04, 0.02, inner, 0, 0.04, zb + 0.01);
    for (const sx of [-1, 1]) {
      const m = k.box(0.02, oh + 0.04, sd - 0.02, inner, sx * (ow / 2 - 0.07), 0.04, zb + sd / 2);
      m.rotation.y = sx * 0.35;
    }
    for (let i = 0; i < 7; i++) k.box(ow - 0.02, 0.004, 0.002, M.matte(darken(c.inner, 0.3)), 0, 0.1 + i * 0.1, zb + 0.021);
    k.box(ow, 0.006, sd, M.matte('#1d1917'), 0, 0.04, zs);
    // grate + logs + embers
    const gm = M.blackMetal();
    for (let i = 0; i < 5; i++) k.box(0.012, 0.012, 0.2, gm, -0.2 + i * 0.1, 0.07, -0.08);
    for (const sx of [-1, 1]) k.box(0.02, 0.06, 0.02, gm, sx * 0.24, 0.046, 0.0);
    logBed(k, 0, 0.082, -0.08, 0.95);
    // décor on the mantel: two brass candlesticks
    for (const sx of [-1, 1]) {
      const x = sx * 0.55;
      k.lathe([[0.04, 0], [0.04, 0.01], [0.012, 0.03], [0.01, 0.16], [0.022, 0.17], [0.0, 0.175]], M.brass(), x, oh + 0.36, -0.08, 12);
      k.cyl(0.011, 0.06, M.matte('#f4efe2'), x, oh + 0.535, -0.08, 0.011, 10);
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { w, d, ow } = MANTEL;
      D.rr(ctx, 0, 0, w - 0.06, d, 0.01, tint(c.stone, 0.1));
      D.rr(ctx, 0, -d / 2 + 0.19, w, 0.38, 0.01, tint(c.stone, 0.2));
      D.rr(ctx, 0, -d / 2 + 0.1, ow, 0.2, 0, '#4a3f3a', INK, LINE_THIN);
      D.poly(ctx, [[-0.12, -0.08], [0, -0.16], [0.12, -0.08], [0, -0.02]], true, '#ff9a4a', INK_SOFT, LINE_THIN);
    }),
};

/* ------------------------------------------------------------------ linear wall fireplace */

const LIN = { w: 1.5, d: 0.22, h: 0.56 };

const linearFireplace: FurnitureDef = {
  id: 'fireplace-linear-wall',
  name: 'אח חשמלית לינארית לתלייה',
  category: CAT,
  group: G_FIRE,
  tags: ['אח', 'אח חשמלית', 'מודרני', 'קיר', 'לינארי'],
  size: { w: LIN.w, d: LIN.d, h: LIN.h },
  mount: 'wall',
  elevation: 0.45,
  colors: [slot('frame', 'מסגרת', '#1b1c1f'), slot('bed', 'מצע גבישים', '#cfd8e0')],
  actions: [{ kind: 'fire', at: { x: 0, y: 0.13, z: 0.02 } }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { w, d, h } = LIN;
    const frame = M.metal(c.frame, 0.45, 0.6);
    const zb = -d / 2;
    // box: back, top, bottom, sides; front frame strips around a big glass pane
    k.box(w, h, 0.02, frame, 0, 0, zb + 0.01);
    k.box(w, 0.04, d, frame, 0, 0, 0);
    k.box(w, 0.05, d, frame, 0, h - 0.05, 0);
    for (const sx of [-1, 1]) k.box(0.04, h - 0.09, d, frame, sx * (w / 2 - 0.02), 0.04, 0);
    k.box(w - 0.08, 0.06, 0.02, frame, 0, 0.04, d / 2 - 0.01);
    k.box(w - 0.08, 0.004, 0.012, M.glass('#2b2f36', 0.3), 0, 0.1, d / 2 - 0.006);
    k.box(w - 0.08, h - 0.15, 0.006, M.glass('#2b2f36', 0.28), 0, 0.1, d / 2 - 0.004);
    // reflective black interior + glowing crystal bed + flame strip
    k.box(w - 0.08, h - 0.09, 0.004, M.screen('#0e0f12'), 0, 0.04, zb + 0.022);
    k.box(w - 0.08, 0.05, d - 0.06, M.matte('#141416'), 0, 0.04, 0.0);
    const bed = M.glass(c.bed, 0.85);
    for (let i = 0; i < 46; i++) {
      const r = rng(300 + i);
      const m = k.sphere(0.018 + r() * 0.012, i % 4 === 0 ? M.glow('#ff7a2a', 1.3) : bed, -w / 2 + 0.08 + r() * (w - 0.16), 0.1, -0.04 + r() * 0.1, 1.2, 0.6, 1, 6);
      m.rotation.y = r() * 3;
    }
    k.box(w - 0.24, 0.012, 0.012, M.glow('#ff8a2a', 2.4, '#ffd09a'), 0, 0.105, 0.02);
    // control panel: small display + touch buttons on the bottom rail
    k.box(0.06, 0.016, 0.002, M.glow('#ff5a4a', 1.4), w / 2 - 0.12, 0.062, d / 2 + 0.001);
    for (let i = 0; i < 3; i++) led(k, w / 2 - 0.2 - i * 0.03, 0.07, d / 2, '#f5f5ff', 0.006);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, LIN.w, LIN.d, 0.005, tint(c.frame, 0.6));
      D.rr(ctx, 0, 0.0, LIN.w - 0.1, 0.1, 0, tint(c.bed, 0.1), INK_SOFT, LINE_THIN);
      D.line(ctx, -0.6, 0.02, 0.6, 0.02, '#ff8a2a', LINE_THIN * 2);
    }),
};

/* ------------------------------------------------------------------ wood stove */

const STOVE = { w: 0.9, d: 0.9, h: 2.4 };

const woodStove: FurnitureDef = {
  id: 'fireplace-wood-stove',
  name: 'תנור עצים מברזל יצוק עם ארובה',
  category: CAT,
  group: G_FIRE,
  tags: ['תנור עצים', 'קמין', 'ברזל יצוק', 'ארובה', 'חורף', 'כפרי'],
  size: { w: STOVE.w, d: STOVE.d + 0.06, h: STOVE.h },
  colors: [slot('iron', 'ברזל', '#2a2b2e'), slot('hearth', 'משטח אבן', '#8f8a84')],
  actions: [{ kind: 'fire', at: { x: 0, y: 0.26, z: 0.0 } }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const iron = M.metal(c.iron, 0.62, 0.65);
    // stone hearth pad
    k.rbox(0.9, 0.03, 0.9, 0.008, M.stone(c.hearth, 0.7), 0, 0, 0, 1);
    // short cabriole-ish legs
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl(0.03, 0.12, iron, sx * 0.22, 0.03, -0.05 + sz * 0.17, 0.022, 10);
    // hollow firebox: bottom, top, sides, back + front frame around the window
    const y0 = 0.15;
    const bw = 0.56;
    const bd = 0.46;
    const bh = 0.56;
    const zc = -0.05;
    const t = 0.025;
    k.rbox(bw + 0.04, 0.03, bd + 0.04, 0.008, iron, 0, y0, zc, 1);
    k.rbox(bw + 0.06, 0.035, bd + 0.06, 0.01, iron, 0, y0 + bh - 0.035, zc, 1);
    for (const sx of [-1, 1]) {
      k.box(t, bh - 0.06, bd, iron, sx * (bw / 2 - t / 2), y0 + 0.03, zc);
      // cooling fins on the sides
      for (let i = 0; i < 4; i++) k.box(0.012, bh - 0.14, 0.02, iron, sx * (bw / 2 + 0.006), y0 + 0.07, zc - 0.15 + i * 0.1);
    }
    k.box(bw - 2 * t, bh - 0.06, t, iron, 0, y0 + 0.03, zc - bd / 2 + t / 2);
    const zf = zc + bd / 2;
    k.box(bw, 0.07, t, iron, 0, y0 + 0.03, zf - t / 2);
    k.box(bw, 0.08, t, iron, 0, y0 + bh - 0.115, zf - t / 2);
    for (const sx of [-1, 1]) k.box(0.08, bh - 0.18, t, iron, sx * (bw / 2 - 0.04), y0 + 0.1, zf - t / 2);
    // door window + interior fire
    k.box(bw - 0.16, bh - 0.18, 0.004, M.glass('#3a2a20', 0.35), 0, y0 + 0.1, zf - 0.004);
    k.box(bw - 2 * t, 0.004, bd - 2 * t, M.matte('#1d1917'), 0, y0 + 0.03, zc);
    k.box(bw - 2 * t, bh - 0.06, 0.004, M.matte('#2a1d16'), 0, y0 + 0.03, zc - bd / 2 + t + 0.002);
    logBed(k, 0, y0 + 0.034, zc + 0.04, 0.85);
    // handle, air control, hinges
    k.rod([bw / 2 - 0.04, y0 + 0.36, zf + 0.002], [bw / 2 - 0.04, y0 + 0.36, zf + 0.04], 0.008, M.chrome());
    k.rod([bw / 2 - 0.06, y0 + 0.36, zf + 0.04], [bw / 2 - 0.0, y0 + 0.36, zf + 0.04], 0.01, M.wood('#2b1d16', 0.5));
    k.box(0.12, 0.02, 0.012, M.brushed('#9fa2a5'), 0, y0 + 0.045, zf + 0.004);
    for (const hy of [0.18, 0.42]) k.cyl(0.01, 0.05, iron, -bw / 2 + 0.03, y0 + hy, zf + 0.008, 0.01, 8);
    // flue collar + stove pipe with damper and wall-trim ring
    const fy = y0 + bh;
    k.cyl(0.09, 0.05, iron, 0, fy, zc - 0.05, 0.085, 18);
    k.cyl(0.075, STOVE.h - fy - 0.05, M.metal('#1d1e21', 0.55, 0.7), 0, fy + 0.05, zc - 0.05, 0.075, 18);
    for (const ry of [fy + 0.35, fy + 0.9]) k.cyl(0.079, 0.02, iron, 0, ry, zc - 0.05, 0.079, 18);
    xcyl(k, 0.006, 0.18, iron, 0, fy + 0.25, zc - 0.05, 8);
    k.cyl(0.13, 0.015, iron, 0, STOVE.h - 0.015, zc - 0.05, 0.13, 20);
    // firewood basket next to it (front left on the hearth)
    for (let i = 0; i < 3; i++) log(k, 0.3, 0.035, -0.3, 0.065 + i * 0.05, 0.3 + (i % 2) * 0.02, Math.PI / 2 + 0.1 * i, 0);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 0.9, 0.9, 0.01, tint(c.hearth, 0.35));
      D.rr(ctx, 0, -0.05, 0.62, 0.52, 0.02, tint(c.iron, 0.4));
      D.circle(ctx, 0, -0.1, 0.13, tint(c.iron, 0.25), INK, LINE_THIN);
      D.circle(ctx, 0, -0.1, 0.075, tint(c.iron, 0.1), INK, LINE_THIN);
      D.line(ctx, -0.18, 0.18, 0.18, 0.18, '#ff8a2a', LINE_THIN * 2);
      for (let i = 0; i < 3; i++) D.rr(ctx, -0.3 + (i - 1) * 0.04, 0.3, 0.035, 0.28, 0.015, tint('#6d5544', 0.2), INK, LINE_THIN);
    }),
};

/* ------------------------------------------------------------------ bioethanol tabletop burner */

const bioBurner: FurnitureDef = {
  id: 'fireplace-bioethanol-tabletop',
  name: 'אח ביו-אתנול שולחנית',
  category: CAT,
  group: G_FIRE,
  tags: ['אח', 'ביו אתנול', 'שולחני', 'זכוכית', 'מודרני'],
  size: { w: 0.52, d: 0.2, h: 0.26 },
  colors: [slot('base', 'בסיס', '#9a9792')],
  actions: [{ kind: 'fire', at: { x: 0, y: 0.08, z: 0 } }],
  build: ({ colors: c }) => {
    const k = new Kit();
    k.rbox(0.52, 0.06, 0.2, 0.01, M.stone(c.base, 0.75), 0, 0, 0, 2);
    k.rbox(0.3, 0.02, 0.07, 0.004, M.brushed('#c9ccce'), 0, 0.06, 0, 1);
    k.box(0.24, 0.004, 0.04, M.glow('#ff7a2a', 1.4, '#ffb070'), 0, 0.077, 0);
    for (const sz of [-1, 1]) k.box(0.48, 0.19, 0.005, M.glass('#e8f2f4', 0.2), 0, 0.065, sz * 0.07);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.012, 0.19, 0.018, M.brushed('#c9ccce'), sx * 0.245, 0.065, sz * 0.07);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 0.52, 0.2, 0.01, tint(c.base, 0.35));
      for (const sz of [-1, 1]) D.line(ctx, -0.24, sz * 0.07, 0.24, sz * 0.07, '#7fa7c9', LINE_THIN);
      D.rr(ctx, 0, 0, 0.24, 0.04, 0.01, '#ffb070', INK_SOFT, LINE_THIN);
    }),
};

const FIRE: FurnitureDef[] = [mantelFireplace, linearFireplace, woodStove, bioBurner];

/* ================================================================== AQUARIUMS */

type FishType = 'clown' | 'tetra' | 'tang' | 'angel' | 'guppy' | 'goldfish';

/** One fish centred at the origin of `f`, nose towards +X, length ≈ 0.07 * s. */
function fish(f: Kit, type: FishType, s: number): void {
  const pal: Record<FishType, [string, string]> = {
    clown: ['#ff7a1a', '#ffffff'],
    tetra: ['#3fb8ff', '#e0383e'],
    tang: ['#ffd23a', '#ffe98a'],
    angel: ['#e8e2d0', '#2b2b2e'],
    guppy: ['#8a6cff', '#ff4f8b'],
    goldfish: ['#ff9a2a', '#ffcf6a'],
  };
  const [a, b] = pal[type];
  const body = M.plastic(a);
  const acc = M.plastic(b);
  const L = 0.035 * s;
  const tall = type === 'tang' || type === 'angel' ? 1.5 : type === 'goldfish' ? 1.15 : 0.85;
  f.sphere(L, body, 0, 0, 0, 1, 0.5 * tall, 0.32, 8);
  // tail fin (diamond) + dorsal / ventral fins
  const tail = f.box(L * 0.55, L * 0.55, 0.002, type === 'guppy' ? acc : body, 0, 0, 0);
  tail.position.set(-L * 1.12, 0, 0);
  tail.rotation.z = Math.PI / 4;
  if (type === 'guppy') tail.scale.set(1.5, 1.5, 1);
  const fin = f.box(L * 0.7, L * 0.35 * tall, 0.002, type === 'angel' ? acc : body, 0, 0, 0);
  fin.position.set(-L * 0.15, L * 0.5 * tall, 0);
  fin.rotation.z = 0.5;
  if (type === 'angel') {
    const vf = f.box(L * 0.7, L * 0.6, 0.002, acc, 0, 0, 0);
    vf.position.set(-L * 0.15, -L * 0.75, 0);
    vf.rotation.z = -0.5;
  }
  // stripes / accents
  if (type === 'clown' || type === 'angel') for (const sx of [0.35, -0.3]) f.box(L * 0.14, L * 0.82 * tall, L * 0.6, acc, sx * L, -L * 0.41 * tall, 0);
  if (type === 'tetra') f.box(L * 1.1, L * 0.12, L * 0.62, acc, -L * 0.2, -L * 0.22, 0);
  // eyes
  for (const sz of [-1, 1]) f.box(L * 0.12, L * 0.12, 0.002, M.matte('#111'), L * 0.62, L * 0.06, sz * L * 0.24);
}

/** Part 'fish' whose children are individual fish (each its own sub-part so it survives baking). */
function fishSchool(k: Kit, n: number, area: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } }, seed: number, s = 1, types: FishType[] = ['clown', 'tetra', 'tang', 'angel', 'guppy', 'goldfish']): void {
  const school = k.part('fish');
  const r = rng(seed);
  const pad = 0.04 * s;
  for (let i = 0; i < n; i++) {
    const x = area.min.x + pad + r() * (area.max.x - area.min.x - 2 * pad);
    const y = area.min.y + pad + r() * (area.max.y - area.min.y - 2 * pad);
    const z = area.min.z + pad * 0.8 + r() * (area.max.z - area.min.z - 1.6 * pad);
    const f = school.part('swimmer', x, y, z, { index: i });
    fish(f, types[i % types.length], s * (0.8 + r() * 0.4));
    f.g.rotation.y = (r() - 0.5) * 1.2 + (r() < 0.5 ? Math.PI : 0);
  }
}

/** A few swaying aquarium plants (blades as thin tubes) rooted at (x, y, z). */
function waterPlant(k: Kit, x: number, y: number, z: number, h: number, color: string, seed: number, blades = 6): void {
  const r = rng(seed);
  const mat = M.leaf(color);
  for (let i = 0; i < blades; i++) {
    const a = r() * Math.PI * 2;
    const lean = 0.02 + r() * 0.05;
    const hh = h * (0.6 + r() * 0.4);
    const x0 = x + Math.cos(a) * 0.01;
    const z0 = z + Math.sin(a) * 0.01;
    k.tube(
      [
        [x0, y, z0],
        [x0 + Math.cos(a) * lean * 0.4, y + hh * 0.5, z0 + Math.sin(a) * lean * 0.4],
        [x0 + Math.cos(a) * lean, y + hh, z0 + Math.sin(a) * lean],
      ],
      0.0045,
      mat,
      { seg: 6, radial: 3 },
    );
  }
}

function rock(k: Kit, r: number, x: number, y: number, z: number, seed: number, color = '#7d7a75'): void {
  const m = k.geo(blobGeoLite(r, seed), M.stone(color, 0.85), x, y, z);
  m.scale.set(1.2, 0.75, 1);
}

/** Small rock blob (icosahedron detail 1, displaced). */
function blobGeoLite(r: number, seed: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(r, 1);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const rr = rng(seed);
  const cache = new Map<string, number>();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(4)}|${p.getY(i).toFixed(4)}|${p.getZ(i).toFixed(4)}`;
    let f = cache.get(key);
    if (f === undefined) {
      f = 0.78 + rr() * 0.4;
      cache.set(key, f);
    }
    p.setXYZ(i, p.getX(i) * f, Math.max(-r * 0.2, p.getY(i) * f), p.getZ(i) * f);
  }
  g.computeVertexNormals();
  return g;
}

/* ------------------------------------------------------------------ large aquarium on cabinet */

const AQ = { w: 1.22, d: 0.47, h: 1.38, cabH: 0.76, tankH: 0.56, sand: 0.05, waterTop: 0.52 };
const AQ_AREA = {
  min: { x: -AQ.w / 2 + 0.03, y: AQ.cabH + 0.012 + AQ.sand + 0.02, z: -AQ.d / 2 + 0.04 },
  max: { x: AQ.w / 2 - 0.03, y: AQ.cabH + 0.012 + AQ.waterTop - 0.02, z: AQ.d / 2 - 0.04 },
};

const aquarium: FurnitureDef = {
  id: 'aquarium-cabinet',
  name: 'אקווריום גדול על ארון',
  category: CAT,
  group: G_AQUA,
  tags: ['אקווריום', 'דגים', 'מים', 'צמחים', 'ארון'],
  size: { w: AQ.w, d: AQ.d, h: AQ.h },
  colors: [slot('cabinet', 'ארון', '#2a2b2e'), slot('back', 'רקע', '#163a5c'), slot('sand', 'חול', '#e0cda4')],
  actions: [{ kind: 'fish', area: AQ_AREA }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { w, d, cabH, tankH, sand, waterTop } = AQ;
    const cab = M.paint(c.cabinet, 0.45);
    cabinet(k, {
      w,
      h: cabH,
      d,
      body: cab,
      front: cab,
      cols: [[{ kind: 'door', hinge: 'l' }], [{ kind: 'door', hinge: 'r' }]],
      base: 'plinth',
      baseH: 0.06,
      handle: 'knob',
      handleMat: M.brushed('#9fa2a5'),
      top: M.matte(darken(c.cabinet, 0.2)),
      topT: 0.02,
      frontInset: 0.03,
    });
    // tank: glass panes, black silicone corners and bottom frame
    const y0 = cabH + 0.012;
    k.box(w - 0.01, 0.012, d - 0.03, M.matte('#111113'), 0, cabH, -0.005);
    const glass = M.glass('#dff2f0', 0.16);
    const gt = 0.008;
    const tw = w - 0.02;
    const td = d - 0.05;
    const tz = -0.01;
    k.box(tw, tankH, gt, glass, 0, y0, tz + td / 2 - gt / 2);
    k.box(tw, tankH, gt, glass, 0, y0, tz - td / 2 + gt / 2);
    for (const sx of [-1, 1]) k.box(gt, tankH, td - 2 * gt, glass, sx * (tw / 2 - gt / 2), y0, tz);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.01, tankH, 0.01, M.matte('#141416'), sx * (tw / 2 - 0.005), y0, tz + sz * (td / 2 - 0.005));
    // background panel, sand, water body + surface
    k.box(tw - 0.02, tankH - 0.01, 0.004, M.matte(c.back), 0, y0 + 0.005, tz - td / 2 + gt + 0.002);
    k.box(tw - 2 * gt, sand, td - 2 * gt, M.stone(c.sand, 0.95), 0, y0, tz);
    for (let i = 0; i < 5; i++) {
      const r = rng(70 + i);
      k.sphere(0.12, M.stone(c.sand, 0.95), -0.45 + i * 0.22, y0 + sand - 0.005, tz - 0.06 + r() * 0.06, 1, 0.18, 0.6, 10);
    }
    k.box(tw - 2 * gt - 0.002, waterTop - sand, td - 2 * gt - 0.002, M.water('#a9dcd6'), 0, y0 + sand, tz);
    // rocks, driftwood, plants, bubbler
    const sy = y0 + sand;
    rock(k, 0.09, -0.32, sy + 0.03, tz - 0.07, 3);
    rock(k, 0.06, -0.2, sy + 0.02, tz - 0.1, 5, '#8c8781');
    rock(k, 0.07, 0.36, sy + 0.025, tz - 0.08, 7, '#6e6a66');
    rock(k, 0.035, 0.15, sy + 0.01, tz + 0.07, 9, '#9a958e');
    k.tube([[-0.05, sy + 0.01, tz - 0.05], [0.05, sy + 0.08, tz - 0.08], [0.18, sy + 0.2, tz - 0.1]], 0.016, M.bark('#6b4a32'), { seg: 10, radial: 6 });
    waterPlant(k, -0.5, sy, tz - 0.12, 0.42, '#3f8f3a', 11, 7);
    waterPlant(k, -0.42, sy, tz - 0.14, 0.32, '#5fae48', 12, 5);
    waterPlant(k, 0.47, sy, tz - 0.13, 0.44, '#3f8f3a', 13, 7);
    waterPlant(k, 0.25, sy, tz - 0.14, 0.26, '#a3493a', 14, 5);
    waterPlant(k, 0.0, sy, tz - 0.15, 0.36, '#5fae48', 15, 6);
    k.cyl(0.015, 0.012, M.stone('#6e7a86', 0.9), 0.55, sy, tz - 0.12, 0.015, 8);
    for (let i = 0; i < 9; i++) k.sphere(0.004 + (i % 3) * 0.002, M.glass('#ffffff', 0.5), 0.55 + Math.sin(i * 1.7) * 0.008, sy + 0.04 + i * 0.045, tz - 0.12, 1, 1, 1, 5);
    // LED light bar on the rim
    k.rbox(tw - 0.04, 0.02, 0.08, 0.006, M.brushed('#2a2b2e'), 0, y0 + tankH, tz, 1);
    k.box(tw - 0.08, 0.003, 0.05, M.glow('#e9f6ff', 1.8), 0, y0 + tankH - 0.003, tz);
    for (const sx of [-1, 1]) k.box(0.01, 0.04, 0.04, M.brushed('#2a2b2e'), sx * (tw / 2 - 0.04), y0 + tankH - 0.02, tz);
    // the fish
    fishSchool(k, 8, AQ_AREA, 21, 1.1);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { w, d } = AQ;
      D.rr(ctx, 0, 0, w, d, 0.01, tint(c.cabinet, 0.55));
      D.rr(ctx, 0, -0.01, w - 0.02, d - 0.05, 0, '#cfe9ee', INK, LINE_THIN);
      D.rr(ctx, 0, -0.01 - (d - 0.05) / 2 + 0.01, w - 0.04, 0.01, 0, tint(c.back, 0.2), null);
      for (const [x, z, col] of [[-0.3, 0.02, '#ff7a1a'], [0.1, -0.05, '#3fb8ff'], [0.32, 0.06, '#ffd23a']] as const) D.ellipse(ctx, x, z, 0.035, 0.012, col, INK_SOFT, LINE_THIN);
    }),
};

/* ------------------------------------------------------------------ fish bowl on a stand */

const BOWL = { r: 0.16, y0: 0.7, h: 0.98 };
const BOWL_AREA = {
  min: { x: -0.09, y: BOWL.y0 + 0.06, z: -0.09 },
  max: { x: 0.09, y: BOWL.y0 + 0.2, z: 0.09 },
};

const fishBowl: FurnitureDef = {
  id: 'aquarium-fish-bowl',
  name: 'צנצנת דגים עגולה על עמוד',
  category: CAT,
  group: G_AQUA,
  tags: ['אקווריום', 'דג זהב', 'צנצנת', 'דגים', 'מים'],
  size: { w: 0.4, d: 0.4, h: BOWL.h },
  colors: [slot('stand', 'עמוד', PAL.oak), slot('gravel', 'חצץ', '#5a8fd6')],
  actions: [{ kind: 'fish', area: BOWL_AREA }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const wood = M.wood(c.stand);
    // slim round pedestal
    k.cyl(0.18, 0.025, wood, 0, 0, 0, 0.17, 28);
    k.lathe([[0.05, 0], [0.035, 0.1], [0.03, 0.4], [0.04, 0.6], [0.0, BOWL.y0 - 0.025]], wood, 0, 0.025, 0, 16);
    k.cyl(0.2, 0.025, wood, 0, BOWL.y0 - 0.025, 0, 0.2, 32);
    // bowl (glass lathe), water, gravel, plant, castle-ish rock
    const y = BOWL.y0;
    const prof: Array<[number, number]> = [
      [0.0, 0],
      [0.08, 0],
      [0.14, 0.05],
      [0.16, 0.13],
      [0.15, 0.2],
      [0.11, 0.26],
      [0.115, 0.27],
    ];
    k.lathe(prof, M.glass('#e2f3f2', 0.2), 0, y, 0, 24);
    k.lathe(
      [
        [0, 0.004],
        [0.08, 0.004],
        [0.136, 0.05],
        [0.155, 0.13],
        [0.145, 0.2],
        [0, 0.2],
      ],
      M.water('#a9dcd6'),
      0,
      y,
      0,
      20,
    );
    k.lathe([[0, 0.004], [0.08, 0.004], [0.12, 0.035], [0, 0.04]], M.stone(c.gravel, 0.9), 0, y, 0, 18);
    waterPlant(k, -0.05, y + 0.035, -0.04, 0.12, '#4f9a3c', 31, 5);
    rock(k, 0.03, 0.05, y + 0.045, -0.03, 4, '#8c8781');
    fishSchool(k, 3, BOWL_AREA, 5, 0.9, ['goldfish', 'goldfish', 'guppy']);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.circle(ctx, 0, 0, 0.2, tint(c.stand, 0.35));
      D.circle(ctx, 0, 0, 0.16, '#cfe9ee', INK, LINE_THIN);
      D.circle(ctx, 0, 0, 0.115, null, INK_SOFT, LINE_THIN);
      D.ellipse(ctx, 0.02, 0.03, 0.03, 0.012, '#ff9a2a', INK_SOFT, LINE_THIN);
    }),
};

/* ------------------------------------------------------------------ column aquarium */

const COL = { r: 0.25, base: 0.42, tank: 1.1, h: 1.62 };
const COL_AREA = {
  min: { x: -0.16, y: COL.base + 0.1, z: -0.16 },
  max: { x: 0.16, y: COL.base + COL.tank - 0.08, z: 0.16 },
};

const columnAquarium: FurnitureDef = {
  id: 'aquarium-column',
  name: 'אקווריום עמוד עגול',
  category: CAT,
  group: G_AQUA,
  tags: ['אקווריום', 'עמוד', 'דגים', 'מודרני', 'מים'],
  size: { w: 0.56, d: 0.56, h: COL.h },
  colors: [slot('base', 'בסיס ומכסה', PAL.walnut), slot('gravel', 'חצץ', '#efe6d2')],
  actions: [{ kind: 'fish', area: COL_AREA }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const base = M.wood(c.base, 0.35);
    const { r, tank } = COL;
    const y0 = COL.base;
    k.cyl(0.28, y0 - 0.02, base, 0, 0, 0, 0.27, 36);
    k.cyl(0.27, 0.02, M.blackMetal(), 0, y0 - 0.02, 0, 0.27, 36);
    k.cyl(r, tank, M.glass('#dff2f0', 0.16), 0, y0, 0, r, 36);
    k.cyl(r - 0.006, tank - 0.06, M.water('#a6d8e8'), 0, y0 + 0.004, 0, r - 0.006, 28);
    k.cyl(r - 0.006, 0.06, M.stone(c.gravel, 0.9), 0, y0, 0, r - 0.006, 28);
    // lid with LED
    k.cyl(0.265, 0.08, base, 0, y0 + tank, 0, 0.26, 36);
    k.cyl(0.2, 0.004, M.glow('#e9f6ff', 1.6), 0, y0 + tank - 0.004, 0, 0.2, 24);
    // décor: tall plants, rocks, bubble column
    const sy = y0 + 0.06;
    waterPlant(k, -0.1, sy, -0.08, 0.7, '#3f8f3a', 41, 7);
    waterPlant(k, 0.1, sy, -0.1, 0.5, '#5fae48', 42, 6);
    waterPlant(k, 0.0, sy, 0.1, 0.3, '#a3493a', 43, 5);
    rock(k, 0.07, 0.04, sy + 0.02, -0.02, 13);
    rock(k, 0.045, -0.12, sy + 0.015, 0.08, 17, '#9a958e');
    for (let i = 0; i < 16; i++) k.sphere(0.004 + (i % 3) * 0.002, M.glass('#ffffff', 0.5), 0.15 + Math.sin(i * 1.3) * 0.006, sy + 0.03 + i * 0.058, 0.0, 1, 1, 1, 5);
    fishSchool(k, 7, COL_AREA, 77, 1.0, ['tetra', 'tang', 'clown', 'angel', 'guppy', 'tetra', 'goldfish']);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.circle(ctx, 0, 0, 0.28, tint(c.base, 0.35));
      D.circle(ctx, 0, 0, 0.25, '#cfe9ee', INK, LINE_THIN);
      D.ellipse(ctx, -0.05, 0.04, 0.035, 0.012, '#3fb8ff', INK_SOFT, LINE_THIN);
      D.ellipse(ctx, 0.07, -0.06, 0.035, 0.014, '#ffd23a', INK_SOFT, LINE_THIN);
    }),
};

const AQUARIUMS: FurnitureDef[] = [aquarium, fishBowl, columnAquarium];

/* ================================================================== export */

export const ENTERTAINMENT: FurnitureDef[] = [...TVS, projectorScreen, projector, ...MUSIC, ...INSTRUMENTS, ...GAMES, ...FIRE, ...AQUARIUMS];

// keep helpers referenced while sections are being added
void [INK, lighten, mix, rng, roundedRectShape, extrudeY, extrudeZ, cabinet, legs4, rowOf, knob, driver, tweeter];
export type { SeatAnchor };
