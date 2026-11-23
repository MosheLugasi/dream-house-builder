import * as THREE from 'three';
import type { FurnitureDef } from '../types';
import {
  D,
  INK,
  INK_SOFT,
  Kit,
  LINE_THIN,
  M,
  blobGeo,
  darken,
  ellipsePath,
  extrudeZ,
  lighten,
  rng,
  roundedRectPath,
  roundedRectShape,
  smoothProfile,
  sym,
  tint,
  type V3,
} from '../kit';
import { slot } from './_parts';
import {
  PM,
  buildBird,
  buildQuad,
  lerpRGB,
  measureQuad,
  nz,
  rgb,
  shadeRGB,
  smooth,
  type Coat,
  type CoatSample,
  type PlanPts,
  type BirdSpec,
  type QuadSpec,
  type RGB,
} from './_petkit';

/* ------------------------------------------------------------------ coat helpers */

type CoatFn = (c: Record<string, string>) => Coat;

/** gentle counter-shading + large-scale tonal variation */
function tone(s: CoatSample, col: RGB, amt = 0.08): RGB {
  const n = nz(s.p, 9, 2) - 0.5;
  const back = s.region === 'torso' || s.region === 'neck' ? (0.5 - s.d) * 0.1 : 0;
  return shadeRGB(col, 1 + n * amt * 2 - back * 0.6);
}

/** jittered-cell spots in body space (dalmatian, leopard-like) */
function spots(p: { x: number; y: number; z: number }, cell: number, rMin: number, rMax: number, seed: number, fill = 0.75): number {
  const cx = Math.floor(p.x / cell);
  const cy = Math.floor(p.y / cell);
  const cz = Math.floor(p.z / cell);
  let best = 0;
  for (let i = -1; i <= 1; i++)
    for (let j = -1; j <= 1; j++)
      for (let k = -1; k <= 1; k++) {
        const X = cx + i;
        const Y = cy + j;
        const Z = cz + k;
        const h = (a: number) => {
          const s = Math.sin(X * 127.1 + Y * 311.7 + Z * 74.7 + seed * 19.3 + a * 53.1) * 43758.5453;
          return s - Math.floor(s);
        };
        if (h(0) > fill) continue;
        const px = (X + h(1)) * cell;
        const py = (Y + h(2)) * cell;
        const pz = (Z + h(3)) * cell;
        const r = rMin + (rMax - rMin) * h(4);
        const dd = Math.hypot(p.x - px, p.y - py, p.z - pz);
        best = Math.max(best, smooth(r, r * 0.8, dd));
      }
  return best;
}

const golden: CoatFn = (c) => {
  const base = rgb(c.fur);
  const light = rgb(c.patch);
  return (s) => {
    let col = lerpRGB(base, light, smooth(0.45, 0.85, s.d) * 0.85);
    if (s.region === 'tail') col = lerpRGB(base, light, smooth(0.3, 0.9, s.d));
    if (s.region === 'leg' || s.region === 'hind') col = lerpRGB(col, light, smooth(0.5, 0.9, s.d) * 0.6);
    if (s.region === 'ear') col = shadeRGB(base, 0.9);
    if (s.region === 'head' && s.q.z > 0.08) col = lerpRGB(col, light, 0.25);
    return tone(s, col);
  };
};

const solid: CoatFn = (c) => {
  const base = rgb(c.fur);
  const lum = (base[0] + base[1] + base[2]) / 765;
  return (s) => {
    let col = base;
    if (lum < 0.2) {
      // black coats: subtle warm sheen on the back, slightly greyer muzzle
      col = lerpRGB(base, [70, 58, 50], (0.5 - s.d) * 0.3 + nz(s.p, 6, 4) * 0.15);
      if (s.region === 'head' && s.q.z > 0.1) col = lerpRGB(col, [60, 56, 54], 0.25);
    } else {
      col = lerpRGB(base, rgb(c.patch), smooth(0.55, 0.95, s.d) * 0.5);
    }
    return tone(s, col, 0.06);
  };
};

const dalmatian: CoatFn = (c) => {
  const base = rgb(c.fur);
  const dot = rgb(c.patch);
  return (s) => {
    const big = s.region === 'head' || s.region === 'ear' ? 0.028 : 0.05;
    let k = spots(s.p, big, big * 0.2, big * 0.38, 3, 0.72);
    if (s.region === 'ear') k = Math.max(k, 0.55 + 0.45 * smooth(0.45, 0.6, nz(s.p, 40, 6)));
    if (s.region === 'paw') k *= 0.4;
    return tone(s, lerpRGB(base, dot, k), 0.04);
  };
};

const beagle: CoatFn = (c) => {
  const tan = rgb(c.fur);
  const black = rgb(c.patch);
  const white: RGB = [242, 238, 229];
  return (s) => {
    let col = tan;
    const n = nz(s.p, 14, 5) - 0.5;
    // black saddle on the back
    if (s.region === 'torso' && s.d < 0.42 + n * 0.25 && s.p.z < 0.2 + n * 0.1) col = lerpRGB(tan, black, smooth(0.42 + n * 0.25, 0.3 + n * 0.25, s.d));
    if (s.region === 'tail') col = s.v > 0.72 ? white : lerpRGB(black, white, smooth(0.5, 0.8, s.d));
    // white belly, chest, legs
    const belly = smooth(0.62, 0.78, s.d + n * 0.2);
    if (s.region === 'torso' || s.region === 'neck') col = lerpRGB(col, white, belly);
    if (s.region === 'leg' || s.region === 'hind' || s.region === 'paw') col = lerpRGB(tan, white, smooth(0.34, 0.28, s.y + n * 0.05));
    // white blaze + muzzle
    if (s.region === 'head' || s.region === 'jaw') {
      const blaze = smooth(0.016, 0.008, Math.abs(s.q.x) + n * 0.01) * smooth(0.0, 0.04, s.q.z);
      const muz = smooth(0.06, 0.09, s.q.z + n * 0.02);
      col = lerpRGB(col, white, Math.max(blaze, muz, s.region === 'jaw' ? 1 : 0, smooth(0.6, 0.8, s.d) * smooth(0.0, 0.05, s.q.z)));
    }
    if (s.region === 'ear') col = shadeRGB(tan, 0.85);
    return tone(s, col, 0.06);
  };
};

const fluffy: CoatFn = (c) => {
  const base = rgb(c.fur);
  const cream = rgb(c.patch);
  return (s) => {
    let col = lerpRGB(base, cream, nz(s.p, 16, 8) * 0.35);
    if (s.region === 'ear') col = lerpRGB(col, cream, 0.4);
    return tone(s, col, 0.05);
  };
};

const corgi: CoatFn = (c) => {
  const red = rgb(c.fur);
  const white = rgb(c.patch);
  return (s) => {
    const n = nz(s.p, 12, 9) - 0.5;
    let w = 0;
    if (s.region === 'torso') w = smooth(0.6, 0.72, s.d + n * 0.25) + smooth(0.32, 0.4, s.p.z + n * 0.08) * smooth(0.35, 0.55, s.d);
    if (s.region === 'neck') w = smooth(0.4, 0.6, s.d + n * 0.3);
    if (s.region === 'leg' || s.region === 'hind' || s.region === 'paw') w = smooth(0.13, 0.08, s.y + n * 0.03);
    if (s.region === 'head' || s.region === 'jaw') {
      const blaze = smooth(0.014, 0.006, Math.abs(s.q.x) + n * 0.006) * smooth(-0.01, 0.03, s.q.z);
      w = Math.max(blaze, smooth(0.06, 0.085, s.q.z + n * 0.015), s.region === 'jaw' ? 1 : smooth(0.62, 0.8, s.d) * smooth(0, 0.04, s.q.z));
    }
    w = Math.min(1, w);
    let col = lerpRGB(red, white, w);
    if (s.region === 'ear') col = shadeRGB(red, 0.95);
    return tone(s, col, 0.06);
  };
};

const husky: CoatFn = (c) => {
  const grey = rgb(c.fur);
  const white = rgb(c.patch);
  const dark = shadeRGB(grey, 0.55);
  return (s) => {
    const n = nz(s.p, 11, 12) - 0.5;
    let col = white;
    if (s.region === 'torso' || s.region === 'neck') {
      const g = smooth(0.62, 0.48, s.d + n * 0.25);
      col = lerpRGB(white, lerpRGB(grey, dark, smooth(0.3, 0.0, s.d) * 0.6), g);
    } else if (s.region === 'tail') {
      col = s.v > 0.85 ? white : lerpRGB(lerpRGB(grey, dark, 0.4), white, smooth(0.45, 0.7, s.d));
    } else if (s.region === 'leg' || s.region === 'hind') {
      col = lerpRGB(white, grey, smooth(0.2, 0.32, s.y + n * 0.04) * smooth(0.6, 0.2, s.d));
    } else if (s.region === 'ear') {
      col = lerpRGB(grey, dark, 0.3);
    } else if (s.region === 'head') {
      // dark cap with a white mask around the eyes and muzzle
      const cap = smooth(0.42, 0.25, s.d) * smooth(0.06, 0.02, s.q.z);
      const stripe = smooth(0.012, 0.005, Math.abs(s.q.x)) * smooth(0.075, 0.03, s.q.z) * smooth(0.5, 0.2, s.d);
      const eyeBrow = 0;
      col = lerpRGB(white, grey, Math.min(1, cap + stripe + eyeBrow + smooth(0.22, 0.1, s.d) * smooth(0.1, 0.0, s.q.z)));
    }
    return tone(s, col, 0.05);
  };
};

const dachshund: CoatFn = (c) => {
  const red = rgb(c.fur);
  const dark = rgb(c.patch);
  return (s) => {
    let col = lerpRGB(red, dark, smooth(0.35, 0.0, s.d) * 0.35 * (s.region === 'torso' || s.region === 'neck' ? 1 : 0));
    if (s.region === 'ear') col = lerpRGB(red, dark, 0.35);
    if (s.region === 'head' && s.q.z > 0.07) col = lerpRGB(col, dark, smooth(0.07, 0.1, s.q.z) * 0.25);
    return tone(s, col, 0.06);
  };
};


const tabby: CoatFn = (c) => {
  const base = rgb(c.fur);
  const stripe = rgb(c.patch);
  const cream = lerpRGB(base, [246, 228, 196], 0.65);
  return (s) => {
    const w = (nz(s.p, 18, 14) - 0.5) * 3.2;
    let k = 0;
    if (s.region === 'torso' || s.region === 'neck') k = smooth(0.25, 0.6, Math.sin((s.p.z / 0.034) * Math.PI * 2 + w + s.p.y * 25)) * smooth(0.7, 0.45, s.d);
    else if (s.region === 'leg' || s.region === 'hind') k = smooth(0.3, 0.7, Math.sin((s.y / 0.03) * Math.PI * 2 + w * 0.5)) * 0.85 * smooth(0.02, 0.06, s.y);
    else if (s.region === 'tail') k = smooth(0.2, 0.6, Math.sin(s.v * Math.PI * 2 * 7 + w * 0.3)) + smooth(0.88, 0.95, s.v);
    else if (s.region === 'head') {
      const top = smooth(0.4, 0.2, s.d) * smooth(0.05, 0.0, s.q.z);
      k = top * smooth(0.2, 0.7, Math.cos((s.q.x / 0.011) * Math.PI * 2 + w * 0.2)) + smooth(0.6, 0.45, s.d) * smooth(0.2, 0.7, Math.sin(s.q.y / 0.01 + s.q.z * 50)) * 0.6 * smooth(0.0, 0.02, Math.abs(s.q.x) - 0.025);
    } else if (s.region === 'ear') k = 0.4;
    let col = lerpRGB(base, stripe, Math.min(1, k));
    const belly = s.region === 'torso' || s.region === 'neck' ? smooth(0.68, 0.85, s.d) : s.region === 'jaw' ? 1 : s.region === 'head' ? smooth(0.62, 0.8, s.d) * smooth(0.0, 0.03, s.q.z) : 0;
    col = lerpRGB(col, cream, belly);
    return tone(s, col, 0.05);
  };
};

const calico: CoatFn = (c) => {
  const white = rgb(c.fur);
  const orange = rgb(c.patch);
  const black = rgb(c.patch2);
  return (s) => {
    const n1 = nz(s.p, 11, 21) + (nz(s.p, 30, 4) - 0.5) * 0.25;
    const n2 = nz(s.p, 13, 33) + (nz(s.p, 34, 5) - 0.5) * 0.25;
    let dorsal = 1;
    if (s.region === 'torso' || s.region === 'neck') dorsal = smooth(0.66, 0.5, s.d);
    if (s.region === 'leg' || s.region === 'hind' || s.region === 'paw') dorsal = smooth(0.1, 0.16, s.y);
    if (s.region === 'jaw') dorsal = 0;
    if (s.region === 'head') dorsal = smooth(0.06, 0.035, s.q.z) * smooth(0.65, 0.45, s.d) * smooth(0.004, 0.012, Math.abs(s.q.x) + (s.q.z < 0 ? 1 : 0));
    let col = white;
    const ko = smooth(0.5, 0.56, n1) * dorsal;
    const kb = smooth(0.52, 0.58, n2) * dorsal * (1 - ko * 0.9);
    col = lerpRGB(col, orange, ko);
    col = lerpRGB(col, black, kb);
    if (s.region === 'tail') col = lerpRGB(orange, black, smooth(0.45, 0.55, nz(s.p, 25, 3)));
    return tone(s, col, 0.04);
  };
};

const rabbitCoat: CoatFn = (c) => {
  const base = rgb(c.fur);
  const cream = rgb(c.patch);
  return (s) => {
    // agouti ticking: fine dark / light flecks
    const tick = (nz(s.p, 220, 6) - 0.5) * 0.35;
    let col = shadeRGB(base, 1 + tick);
    if (s.region === 'torso' || s.region === 'neck') col = lerpRGB(col, cream, smooth(0.6, 0.78, s.d));
    if (s.region === 'tail') col = lerpRGB(cream, [250, 248, 244], 0.7);
    if (s.region === 'jaw' || (s.region === 'head' && s.d > 0.7)) col = lerpRGB(col, cream, 0.8);
    if (s.region === 'ear') col = lerpRGB(col, shadeRGB(base, 0.7), smooth(0.85, 1, s.v));
    if (s.region === 'paw' || s.region === 'hind' || s.region === 'leg') col = lerpRGB(col, cream, smooth(0.05, 0.02, s.y) * 0.6);
    return tone(s, col, 0.05);
  };
};

/* ------------------------------------------------------------------ animal defs */

interface AnimalDef {
  id: string;
  name: string;
  group: string;
  tags: string[];
  variant: 'dog' | 'cat' | 'rabbit';
  colors: Array<[string, string, string]>;
  spec: QuadSpec;
  coat: CoatFn;
}

function drawAnimal(ctx: CanvasRenderingContext2D, P: PlanPts, fur: string, size: { w: number; d: number }): void {
  sym(ctx, () => {
    ctx.lineWidth = 0.012;
    const f = tint(fur, 0.25);
    const hw = size.w / 2 - 0.006;
    const hd = size.d / 2 - 0.006;
    const cl = (x: number, y: number): [number, number] => [Math.max(-hw, Math.min(hw, x)), Math.max(-hd, Math.min(hd, y))];
    // tail
    if (P.tail.length > 1) {
      ctx.beginPath();
      P.tail.forEach(([x, z], i) => {
        const [a, b] = cl(x, z);
        if (i === 0) ctx.moveTo(a, b);
        else ctx.lineTo(a, b);
      });
      ctx.lineWidth = Math.max(0.012, P.headR * 0.35);
      ctx.strokeStyle = f;
      ctx.stroke();
      ctx.lineWidth = 0.012;
    }
    // paws
    for (const [x, z] of P.paws) D.ellipse(ctx, x, z, P.pawR, P.pawR * 1.4, f, undefined, LINE_THIN);
    // torso
    const bz = (P.body.z0 + P.body.z1) / 2;
    D.ellipse(ctx, 0, Math.max(-hd, Math.min(hd, bz)), Math.min(hw, P.body.w), Math.min(hd, (P.body.z1 - P.body.z0) / 2), f);
    D.line(ctx, 0, P.body.z0 + 0.04, 0, P.body.z1 - 0.04, INK_SOFT, LINE_THIN);
    // ears
    for (const [x, z] of P.ears) D.ellipse(ctx, x * 0.92, z, P.headR * 0.35, P.headR * 0.55, tint(fur, 0.1), undefined, LINE_THIN);
    // head + muzzle
    const [hx, hz] = P.head;
    const [nx, nz2] = cl(P.nose[0], P.nose[1]);
    D.ellipse(ctx, hx, hz, P.headR, P.headR * 1.05, f);
    D.ellipse(ctx, nx, (hz + nz2) / 2 + (nz2 - hz) * 0.15, P.headR * 0.55, Math.max(P.headR * 0.5, (nz2 - hz) * 0.45), f, undefined, LINE_THIN);
    D.circle(ctx, nx, nz2 - 0.008, Math.max(0.006, P.headR * 0.18), '#2b2624', null);
    for (const s of [-1, 1]) D.circle(ctx, hx + s * P.headR * 0.5, hz + P.headR * 0.45, Math.max(0.004, P.headR * 0.12), '#2b2624', null);
  });
}

function animal(a: AnimalDef): FurnitureDef {
  const m = measureQuad(a.spec);
  return {
    id: a.id,
    name: a.name,
    category: 'pets',
    group: a.group,
    tags: a.tags,
    size: m.size,
    colors: a.colors.map(([k, l, d]) => slot(k, l, d)),
    actions: [{ kind: 'pet', variant: a.variant }],
    build: ({ colors: c }) => {
      const key = `${a.id}|${a.colors.map(([k]) => c[k]).join(',')}`;
      return buildQuad(a.spec, c, a.coat(c), key, m.shift).root;
    },
    draw2d: (ctx, c) => drawAnimal(ctx, m.plan, c.fur, m.size),
  };
}

const DOG_SKIN = { base: '#c99a5b', bump: 1.4, sheen: 0.6, rough: 0.9 };

const LAB: QuadSpec = {
  species: 'dog',
  L: 0.47,
  W: 0.125,
  H: 0.15,
  bodyY: 0.42,
  tuck: 0.4,
  legR: 0.033,
  pawW: 0.031,
  pawL: 0.05,
  pawH: 0.034,
  neckLen: 0.17,
  neckR: 0.066,
  neckPitch: 0.95,
  skullL: 0.14,
  skullW: 0.07,
  skullH: 0.067,
  muzL: 0.1,
  muzW: 0.038,
  muzH: 0.04,
  drop: 0.032,
  headPitch: 0.22,
  ear: { kind: 'floppy', len: 0.1, wid: 0.075, thick: 0.006 },
  tail: { kind: 'long', len: 0.3, r: 0.026, pitch: 0.45, curl: 0.12, tipR: 0.3 },
  eyeR: 0.011,
  iris: '#3a2210',
  pupil: 'round',
  nose: '#1c1716',
  tongue: true,
  collar: 'tag',
  skin: DOG_SKIN,
};


const CAT: QuadSpec = {
  species: 'cat',
  L: 0.27,
  W: 0.06,
  H: 0.064,
  bodyY: 0.168,
  tuck: 0.45,
  hipRise: 0.15,
  legR: 0.0142,
  pawW: 0.016,
  pawL: 0.024,
  pawH: 0.017,
  neckLen: 0.07,
  neckR: 0.037,
  neckPitch: 0.9,
  skullL: 0.078,
  skullW: 0.048,
  skullH: 0.044,
  muzL: 0.022,
  muzW: 0.024,
  muzH: 0.021,
  drop: 0.017,
  headPitch: -0.05,
  ear: { kind: 'pointy', len: 0.046, wid: 0.048, thick: 0.004, splay: 0.32, back: 0.1, inner: '#e9b6ad' },
  tail: { kind: 'long', len: 0.24, r: 0.0118, pitch: 1.12, curl: 0.04, tipCurl: 0.55, tipR: 0.65 },
  eyeR: 0.0105,
  eyeUp: 0.36,
  eyeFwd: 0.36,
  eyeOut: 0.5,
  iris: '#9bb534',
  pupil: 'slit',
  nose: '#d88f8c',
  noseScale: 0.9,
  whiskers: true,
  collar: 'bell',
  skin: { base: '#d8863c', bump: 1.1, sheen: 0.9, rough: 0.85, density: 16 },
};

const ANIMALS: AnimalDef[] = [
  {
    id: 'pet-dog-golden',
    name: 'כלב רטריבר זהוב',
    group: 'כלבים',
    tags: ['כלב', 'רטריבר', 'גולדן', 'חיית מחמד'],
    variant: 'dog',
    colors: [
      ['fur', 'פרווה', '#c48a48'],
      ['patch', 'פרווה בהירה', '#e3b877'],
      ['collar', 'קולר', '#2f5d8a'],
    ],
    spec: {
      ...LAB,
      fluff: 0.06,
      ear: { kind: 'floppy', len: 0.105, wid: 0.075, thick: 0.007, fluff: 0.12 },
      tail: { kind: 'bushy', len: 0.32, r: 0.024, pitch: 0.5, curl: 0.1, fluff: 0.2 },
      skin: { ...DOG_SKIN, base: '#c48a48' },
    },
    coat: golden,
  },
  {
    id: 'pet-dog-labrador',
    name: 'כלב לברדור שחור',
    group: 'כלבים',
    tags: ['כלב', 'לברדור', 'שחור', 'חיית מחמד'],
    variant: 'dog',
    colors: [
      ['fur', 'פרווה', '#1e1b1a'],
      ['patch', 'גוון משני', '#2c2724'],
      ['collar', 'קולר', '#b3352c'],
    ],
    spec: { ...LAB, skin: { ...DOG_SKIN, base: '#2a2624', sheen: 0.9, rough: 0.75 } },
    coat: solid,
  },

  {
    id: 'pet-dog-dalmatian',
    name: 'כלב מנומר (דלמטי)',
    group: 'כלבים',
    tags: ['כלב', 'דלמטי', 'נקודות', 'מנומר'],
    variant: 'dog',
    colors: [
      ['fur', 'פרווה', '#f3f0ea'],
      ['patch', 'כתמים', '#1c1a19'],
      ['collar', 'קולר', '#c23b33'],
    ],
    spec: {
      ...LAB,
      W: 0.112,
      H: 0.138,
      bodyY: 0.44,
      tuck: 0.65,
      legR: 0.029,
      neckLen: 0.19,
      neckR: 0.058,
      skullL: 0.135,
      skullW: 0.063,
      muzL: 0.105,
      muzW: 0.034,
      ear: { kind: 'floppy', len: 0.08, wid: 0.068, thick: 0.005, setY: -0.05 },
      tail: { kind: 'long', len: 0.32, r: 0.021, pitch: 0.35, curl: 0.13, tipR: 0.3 },
      tongue: false,
      headPitch: 0.12,
      skin: { ...DOG_SKIN, base: '#f3f0ea', sheen: 0.5, rough: 0.8 },
    },
    coat: dalmatian,
  },
  {
    id: 'pet-dog-beagle',
    name: 'כלב ביגל תלת-צבעי',
    group: 'כלבים',
    tags: ['כלב', 'ביגל', 'תלת צבעי', 'גור'],
    variant: 'dog',
    colors: [
      ['fur', 'פרווה', '#b46d33'],
      ['patch', 'אוכף', '#1f1b19'],
      ['collar', 'קולר', '#2e7d4f'],
    ],
    spec: {
      ...LAB,
      L: 0.31,
      W: 0.085,
      H: 0.098,
      bodyY: 0.265,
      tuck: 0.35,
      legR: 0.021,
      pawW: 0.022,
      pawL: 0.034,
      pawH: 0.024,
      neckLen: 0.11,
      neckR: 0.046,
      skullL: 0.1,
      skullW: 0.05,
      skullH: 0.048,
      muzL: 0.068,
      muzW: 0.027,
      muzH: 0.029,
      drop: 0.022,
      headPitch: 0.1,
      ear: { kind: 'floppy', len: 0.095, wid: 0.06, thick: 0.005, setY: 0.25, setZ: 0.05 },
      tail: { kind: 'long', len: 0.19, r: 0.014, pitch: 1.15, curl: 0.04, tipR: 0.45, fluff: 0.06 },
      eyeR: 0.0098,
      tongue: false,
      skin: { ...DOG_SKIN, base: '#b46d33' },
    },
    coat: beagle,
  },
  {
    id: 'pet-dog-fluffy',
    name: 'כלבלב לבן פרוותי',
    group: 'כלבים',
    tags: ['כלב', 'קטן', 'פרוותי', 'לבן', 'גור', 'מלטז'],
    variant: 'dog',
    colors: [
      ['fur', 'פרווה', '#f5f1e8'],
      ['patch', 'גוון שמנת', '#ecdcc0'],
      ['collar', 'קולר', '#d86a9a'],
    ],
    spec: {
      ...LAB,
      L: 0.19,
      W: 0.066,
      H: 0.07,
      bodyY: 0.17,
      tuck: 0.2,
      fluff: 0.14,
      legR: 0.018,
      pawW: 0.019,
      pawL: 0.026,
      pawH: 0.02,
      neckLen: 0.06,
      neckR: 0.042,
      neckPitch: 1.1,
      skullL: 0.075,
      skullW: 0.046,
      skullH: 0.046,
      muzL: 0.028,
      muzW: 0.022,
      muzH: 0.021,
      drop: 0.018,
      headPitch: -0.08,
      ear: { kind: 'fold', len: 0.05, wid: 0.048, thick: 0.008, fluff: 0.3, setY: 0.05 },
      tail: { kind: 'bushy', len: 0.11, r: 0.018, pitch: 1.25, curl: 0.42, fluff: 0.3 },
      eyeR: 0.0088,
      eyeUp: 0.3,
      iris: '#1a0f08',
      tongue: false,
      skin: { ...DOG_SKIN, base: '#f5f1e8', bump: 1.8, sheen: 0.8 },
    },
    coat: fluffy,
  },
  {
    id: 'pet-dog-corgi',
    name: 'כלב קורגי',
    group: 'כלבים',
    tags: ['כלב', 'קורגי', 'רגליים קצרות'],
    variant: 'dog',
    colors: [
      ['fur', 'פרווה', '#c8773a'],
      ['patch', 'לבן', '#f4efe6'],
      ['collar', 'קולר', '#2f5d8a'],
    ],
    spec: {
      ...LAB,
      L: 0.37,
      W: 0.1,
      H: 0.102,
      bodyY: 0.172,
      tuck: 0.2,
      fluff: 0.03,
      legR: 0.025,
      pawW: 0.025,
      pawL: 0.036,
      pawH: 0.024,
      neckLen: 0.12,
      neckR: 0.056,
      neckPitch: 1.0,
      skullL: 0.11,
      skullW: 0.058,
      skullH: 0.052,
      muzL: 0.064,
      muzW: 0.028,
      muzH: 0.028,
      drop: 0.024,
      headPitch: 0.05,
      ear: { kind: 'pointy', len: 0.085, wid: 0.072, thick: 0.007, splay: 0.36, back: 0.08, inner: '#e7bba8' },
      tail: { kind: 'stub', len: 0.01, r: 0.03, pitch: 0.2, curl: 0, fluff: 0.25 },
      eyeR: 0.0092,
      tongue: true,
      skin: { ...DOG_SKIN, base: '#c8773a' },
    },
    coat: corgi,
  },
  {
    id: 'pet-dog-husky',
    name: 'כלב האסקי',
    group: 'כלבים',
    tags: ['כלב', 'האסקי', 'זאב', 'עיניים כחולות'],
    variant: 'dog',
    colors: [
      ['fur', 'פרווה', '#6c7179'],
      ['patch', 'לבן', '#f2f1ed'],
      ['collar', 'קולר', '#c63a2c'],
    ],
    spec: {
      ...LAB,
      L: 0.44,
      W: 0.112,
      H: 0.135,
      bodyY: 0.4,
      tuck: 0.45,
      fluff: 0.05,
      legR: 0.03,
      neckLen: 0.16,
      neckR: 0.07,
      skullL: 0.13,
      skullW: 0.068,
      skullH: 0.062,
      muzL: 0.085,
      muzW: 0.033,
      muzH: 0.034,
      drop: 0.028,
      headPitch: 0.08,
      ear: { kind: 'pointy', len: 0.075, wid: 0.06, thick: 0.009, splay: 0.2, back: 0.12, inner: '#efe6de', fluff: 0.08 },
      tail: { kind: 'bushy', len: 0.3, r: 0.03, pitch: 1.0, curl: 0.33, fluff: 0.22 },
      iris: '#79aed6',
      tongue: false,
      skin: { ...DOG_SKIN, base: '#8a8f96', bump: 1.6 },
    },
    coat: husky,
  },
  {
    id: 'pet-dog-dachshund',
    name: 'כלב תחש',
    group: 'כלבים',
    tags: ['כלב', 'תחש', 'נקניקיה', 'רגליים קצרות'],
    variant: 'dog',
    colors: [
      ['fur', 'פרווה', '#93461d'],
      ['patch', 'גוון כהה', '#3c2010'],
      ['collar', 'קולר', '#d9a233'],
    ],
    spec: {
      ...LAB,
      L: 0.35,
      W: 0.074,
      H: 0.082,
      bodyY: 0.138,
      tuck: 0.25,
      legR: 0.019,
      pawW: 0.021,
      pawL: 0.034,
      pawH: 0.021,
      neckLen: 0.1,
      neckR: 0.042,
      neckPitch: 0.85,
      skullL: 0.095,
      skullW: 0.046,
      skullH: 0.043,
      muzL: 0.078,
      muzW: 0.022,
      muzH: 0.024,
      drop: 0.018,
      headPitch: 0.12,
      ear: { kind: 'floppy', len: 0.075, wid: 0.055, thick: 0.005, setY: 0.1 },
      tail: { kind: 'long', len: 0.2, r: 0.014, pitch: 0.28, curl: 0.07, tipR: 0.35 },
      eyeR: 0.0085,
      tongue: false,
      skin: { ...DOG_SKIN, base: '#93461d', sheen: 0.8, rough: 0.8 },
    },
    coat: dachshund,
  },
  {
    id: 'pet-cat-tabby',
    name: 'חתול ג\'ינג\'י מפוספס',
    group: 'חתולים',
    tags: ['חתול', 'ג׳ינג׳י', 'מפוספס', 'טאבי'],
    variant: 'cat',
    colors: [
      ['fur', 'פרווה', '#d8863c'],
      ['patch', 'פסים', '#9c4f1a'],
      ['collar', 'קולר', '#2f6f8a'],
    ],
    spec: { ...CAT },
    coat: tabby,
  },
  {
    id: 'pet-cat-black',
    name: 'חתול שחור',
    group: 'חתולים',
    tags: ['חתול', 'שחור'],
    variant: 'cat',
    colors: [
      ['fur', 'פרווה', '#1d1b1d'],
      ['patch', 'גוון משני', '#2b2729'],
      ['collar', 'קולר', '#c0392b'],
    ],
    spec: { ...CAT, iris: '#d6a12a', nose: '#2b2325', skin: { ...CAT.skin, base: '#2a272a', sheen: 1 } },
    coat: solid,
  },
  {
    id: 'pet-cat-grey',
    name: 'חתול אפור',
    group: 'חתולים',
    tags: ['חתול', 'אפור', 'כחול רוסי'],
    variant: 'cat',
    colors: [
      ['fur', 'פרווה', '#7c838c'],
      ['patch', 'בטן', '#9aa0a8'],
      ['collar', 'קולר', '#c9a227'],
    ],
    spec: { ...CAT, iris: '#7fb04a', nose: '#8a7c82', W: 0.06, H: 0.064, skin: { ...CAT.skin, base: '#7c838c' } },
    coat: solid,
  },
  {
    id: 'pet-cat-calico',
    name: 'חתולה משולשת',
    group: 'חתולים',
    tags: ['חתול', 'חתולה', 'קליקו', 'תלת צבעי', 'לבן'],
    variant: 'cat',
    colors: [
      ['fur', 'לבן', '#f3efe8'],
      ['patch', 'כתמים כתומים', '#d8843c'],
      ['patch2', 'כתמים שחורים', '#2a2522'],
      ['collar', 'קולר', '#8e3fa0'],
    ],
    spec: { ...CAT, iris: '#c9a43a', skin: { ...CAT.skin, base: '#f3efe8' } },
    coat: calico,
  },
  {
    id: 'pet-rabbit',
    name: 'ארנב',
    group: 'חיות נוספות',
    tags: ['ארנב', 'ארנבון', 'שפן'],
    variant: 'rabbit',
    colors: [
      ['fur', 'פרווה', '#9b7a58'],
      ['patch', 'בטן', '#ece1cf'],
    ],
    spec: {
      species: 'rabbit',
      L: 0.15,
      W: 0.07,
      H: 0.07,
      bodyY: 0.078,
      fluff: 0.05,
      legR: 0.012,
      pawW: 0.014,
      pawL: 0.026,
      pawH: 0.014,
      neckLen: 0.03,
      neckR: 0.04,
      neckPitch: 0.9,
      skullL: 0.07,
      skullW: 0.034,
      skullH: 0.036,
      muzL: 0.022,
      muzW: 0.022,
      muzH: 0.021,
      drop: 0.012,
      headPitch: 0.05,
      ear: { kind: 'long', len: 0.1, wid: 0.034, thick: 0.004, splay: 0.12, back: 0.32, inner: '#e8b4ae' },
      tail: { kind: 'puff', len: 0.004, r: 0.018, pitch: 0.5, curl: 0, fluff: 0.25 },
      eyeR: 0.0095,
      eyeUp: 0.22,
      eyeFwd: 0.12,
      eyeOut: 1.6,
      iris: '#1d0f08',
      pupil: 'round',
      nose: '#cf8c8c',
      whiskers: true,
      collar: 'none',
      skin: { base: '#9b7a58', bump: 1.3, sheen: 0.9, rough: 0.9 },
    },
    coat: rabbitCoat,
  },
];

/* ------------------------------------------------------------------ birds */

const parrotCoat: CoatFn = (c) => {
  const green = rgb(c.fur);
  const belly = lerpRGB(green, [214, 222, 90], 0.25);
  const crown = rgb(c.head);
  const red = rgb(c.patch);
  const blue: RGB = [38, 72, 150];
  return (s) => {
    let col = green;
    if (s.region === 'torso') col = lerpRGB(green, belly, smooth(0.45, 0.85, s.d));
    if (s.region === 'head') {
      const k = smooth(0.06, 0.075, s.q.y + s.q.z * 0.35) * smooth(-0.05, -0.02, s.q.z);
      col = lerpRGB(green, crown, Math.max(k, smooth(0.07, 0.08, s.q.y + s.q.z * 0.5)));
    }
    if (s.region === 'wing') {
      col = lerpRGB(green, red, smooth(0.32, 0.36, s.v) * smooth(0.5, 0.46, s.v) * smooth(0.7, 0.4, s.d));
      col = lerpRGB(col, blue, smooth(0.62, 0.72, s.v));
      const edge = smooth(0.8, 0.97, (s.v * 9 + s.d * 1.3) % 1);
      col = shadeRGB(col, 1 - edge * 0.25);
    }
    if (s.region === 'tail') col = lerpRGB(green, [196, 210, 70], smooth(0.7, 0.85, s.v));
    return tone(s, col, 0.04);
  };
};

const budgieCoat: CoatFn = (c) => {
  const blue = rgb(c.fur);
  const face = rgb(c.head);
  const black: RGB = [25, 25, 30];
  return (s) => {
    let col = blue;
    if (s.region === 'torso') col = lerpRGB(blue, lighten3(blue), smooth(0.5, 0.9, s.d));
    if (s.region === 'head') {
      const front = smooth(-0.004, 0.004, s.q.z + s.q.y * 0.4 - 0.01);
      const bars = smooth(0.3, 0.8, Math.sin((s.q.y / 0.0032) * Math.PI)) * (1 - front);
      col = lerpRGB(lerpRGB(face, black, bars * 0.85), face, front * 0.2);
      // throat spots
      const sp = Math.min(...[-0.009, 0, 0.009].map((x) => Math.hypot(s.q.x - x, s.q.y - 0.006, 0)));
      if (s.q.z > 0.012) col = lerpRGB(col, black, smooth(0.0028, 0.002, sp));
    }
    if (s.region === 'wing') {
      const t = (s.v * 7 + s.d * 1.2) % 1;
      col = lerpRGB(face, black, smooth(0.35, 0.55, t));
    }
    if (s.region === 'tail') col = shadeRGB(blue, 0.55);
    return tone(s, col, 0.04);
  };
};
const lighten3 = (c: RGB): RGB => lerpRGB(c, [255, 255, 255], 0.25);

const PARROT: BirdSpec = {
  len: 0.19,
  r: 0.062,
  headR: 0.046,
  tilt: 0.35,
  beak: 'hook',
  beakColor: '#5b5550',
  eyeRing: '#ece7dc',
  iris: '#d98a1c',
  tailLen: 0.15,
  tailW: 0.075,
  tailBack: 0.32,
  feet: '#7d7b78',
  skin: { base: '#3f9b3a', bump: 0.4, sheen: 0.4, rough: 0.62, density: 30, streak: 0.08 },
};

const BUDGIE: BirdSpec = {
  len: 0.07,
  r: 0.025,
  headR: 0.019,
  tilt: 0.4,
  beak: 'small',
  beakColor: '#e5c28a',
  cere: '#4a74c9',
  iris: '#151515',
  tailLen: 0.08,
  tailW: 0.02,
  tailBack: 0.22,
  feet: '#c9a6a0',
  lo: true,
  skin: { base: '#5aa3d8', bump: 0.3, sheen: 0.4, rough: 0.6, density: 50, streak: 0.06 },
};

const PARROT_PERCH: V3 = [0, 1.12, 0];

const parrotStand: FurnitureDef = {
  id: 'pet-parrot-stand',
  name: 'תוכי על מעמד',
  category: 'pets',
  group: 'חיות נוספות',
  tags: ['תוכי', 'ציפור', 'מעמד', 'אמזונה'],
  size: { w: 0.5, d: 0.5, h: 1.39 },
  colors: [slot('fur', 'נוצות', '#3f9b3a'), slot('head', 'ראש', '#f2d03a'), slot('patch', 'כתם כנף', '#d4372c'), slot('wood', 'מעמד', '#9a7550')],
  actions: [{ kind: 'pet', variant: 'bird' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const wood = M.wood(c.wood);
    const steel = M.brushed();
    // weighted base tray (catches seeds) + pole
    k.lathe(smoothProfile([[0, 0], [0.22, 0], [0.245, 0.012], [0.24, 0.05], [0.232, 0.054], [0.218, 0.02], [0, 0.018]], 13), M.plastic('#e7e4dc'), 0, 0, 0, 24);
    k.cyl(0.05, 0.05, M.blackMetal(), 0, 0.018, 0, 0.03, 16);
    k.cyl(0.017, PARROT_PERCH[1] - 0.06, steel, 0, 0.06, 0, 0.015, 12);
    // T perch: natural wood dowel with bark-ish knots
    k.rod([-0.23, PARROT_PERCH[1], 0], [0.23, PARROT_PERCH[1], 0], 0.016, wood, 0.016, 12);
    k.rod([0, PARROT_PERCH[1] - 0.06, 0], [0, PARROT_PERCH[1] - 0.005, 0], 0.02, steel, 0.02, 12);
    for (const sx of [-1, 1]) {
      // food / water cups under the perch ends
      const x = sx * 0.19;
      k.rod([x, PARROT_PERCH[1] - 0.016, 0], [x, PARROT_PERCH[1] - 0.05, 0], 0.003, steel, 0.003, 6);
      k.lathe([[0, 0], [0.032, 0], [0.04, 0.04], [0.037, 0.04], [0.03, 0.004], [0, 0.004]], steel, x, PARROT_PERCH[1] - 0.09, 0, 18);
      if (sx < 0) k.lathe(smoothProfile([[0, 0.004], [0.034, 0.022], [0, 0.036]], 8), M.matte('#c9a15a'), x, PARROT_PERCH[1] - 0.09, 0, 14);
      else k.disc(0.034, 0.002, M.water(), x, PARROT_PERCH[1] - 0.06, 0, 18);
    }
    // a hanging wooden-bead toy
    const toy = [-0.13, PARROT_PERCH[1] - 0.012, 0] as V3;
    k.rod(toy, [toy[0], toy[1] - 0.1, 0.0], 0.0015, M.matte('#d9cfbd'), 0.0015, 4);
    ['#d9483b', '#f0c330', '#3f88c5', '#5aa35a'].forEach((col, i) => k.sphere(0.011, M.paint(col), toy[0], toy[1] - 0.025 - i * 0.024, 0, 1, 0.9, 1, 8));
    buildBird(k, PARROT, PARROT_PERCH, 0.016, parrotCoat(c), `parrot|${c.fur},${c.head},${c.patch}`);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.circle(ctx, 0, 0, 0.243, tint('#e7e4dc', 0.3));
      D.circle(ctx, 0, 0, 0.215, null, INK_SOFT, LINE_THIN);
      D.rr(ctx, 0, 0, 0.46, 0.032, 0.016, tint(c.wood, 0.3), undefined, LINE_THIN);
      for (const sx of [-1, 1]) D.circle(ctx, sx * 0.19, 0, 0.04, '#e6e8ea', undefined, LINE_THIN);
      D.ellipse(ctx, 0, -0.02, 0.06, 0.08, tint(c.fur, 0.2));
      D.ellipse(ctx, 0, -0.14, 0.03, 0.07, tint(c.fur, 0.1), undefined, LINE_THIN);
      D.circle(ctx, 0, 0.06, 0.045, tint(c.head, 0.2));
      D.ellipse(ctx, 0, 0.11, 0.013, 0.016, '#6b645e', null);
    }),
};

const CAGE = { r: 0.22, y0: 0.96, y1: 1.36, dome: 0.12 };
const BUDGIE_PERCH: V3 = [0, 1.1, 0.02];

const birdCage: FurnitureDef = {
  id: 'pet-bird-cage',
  name: 'כלוב עם תוכון',
  category: 'pets',
  group: 'חיות נוספות',
  tags: ['תוכי', 'תוכון', 'ציפור', 'כלוב', 'בדג׳י'],
  size: { w: 0.5, d: 0.5, h: 1.55 },
  colors: [slot('fur', 'נוצות', '#5aa3d8'), slot('head', 'פנים', '#f4f1e6'), slot('cage', 'כלוב', '#efeae0')],
  actions: [{ kind: 'pet', variant: 'bird' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const wire = M.paint(c.cage, 0.35);
    const { r, y0, y1, dome } = CAGE;
    // stand: four splayed feet + pole + tray
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2;
      k.tube([[0, 0.12, 0], [Math.cos(a) * 0.16, 0.03, Math.sin(a) * 0.16], [Math.cos(a) * 0.232, 0.012, Math.sin(a) * 0.232]], 0.009, wire, { seg: 6, radial: 4 });
      k.sphere(0.014, M.rubber(), Math.cos(a) * 0.232, 0.009, Math.sin(a) * 0.232, 1, 0.65, 1, 6);
    }
    k.cyl(0.014, y0 - 0.12, wire, 0, 0.12, 0, 0.012, 12);
    k.lathe(smoothProfile([[0.03, y0 - 0.075], [0.16, y0 - 0.06], [r + 0.012, y0 - 0.02], [r + 0.016, y0 + 0.03], [r + 0.004, y0 + 0.035], [0, y0 - 0.01]], 7), wire, 0, 0, 0, 20);
    // rings
    for (const y of [y0 + 0.03, y0 + 0.1, y1]) {
      const ring = k.add(new THREE.Mesh(new THREE.TorusGeometry(r, 0.0035, 3, 32), wire), 0, y, 0);
      ring.rotation.x = Math.PI / 2;
      ring.castShadow = true;
    }
    // vertical bars continuing into the dome
    const n = 18;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const pts: V3[] = [[Math.cos(a) * r, y0 + 0.03, Math.sin(a) * r], [Math.cos(a) * r, y1, Math.sin(a) * r]];
      for (let j = 1; j <= 4; j++) {
        const t = (j / 4) * (Math.PI / 2);
        const rr = Math.cos(t) * r;
        pts.push([Math.cos(a) * rr, y1 + Math.sin(t) * dome, Math.sin(a) * rr]);
      }
      k.tube(pts, 0.0016, wire, { seg: 7, radial: 3, tension: 0.1 });
    }
    k.cyl(0.02, 0.012, wire, 0, y1 + dome - 0.004, 0, 0.012, 12);
    k.add(new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.0035, 4, 12), wire), 0, y1 + dome + 0.03, 0).castShadow = true;
    // door frame (front)
    k.beam([-0.06, y0 + 0.1, r + 0.002], [0.06, y0 + 0.1, r + 0.002], 0.006, 0.006, wire);
    k.beam([-0.06, y0 + 0.24, r + 0.004], [0.06, y0 + 0.24, r + 0.004], 0.006, 0.006, wire);
    // perch, swing, seed cup, cuttlebone
    const perchM = M.wood('#c49a6a');
    k.rod([-r + 0.005, BUDGIE_PERCH[1], BUDGIE_PERCH[2]], [r - 0.005, BUDGIE_PERCH[1], BUDGIE_PERCH[2]], 0.006, perchM, 0.006, 8);
    const sw = new Kit();
    sw.rod([-0.05, 0, 0], [0.05, 0, 0], 0.004, perchM, 0.004, 6);
    sw.tube([[-0.05, 0, 0], [-0.06, 0.08, 0], [0, 0.13, 0], [0.06, 0.08, 0], [0.05, 0, 0]], 0.0015, M.brass(), { seg: 14, radial: 3 });
    k.sub(sw, 0.07, y1 - 0.1, -0.08);
    k.box(0.06, 0.045, 0.04, M.plastic('#f0c330'), -r + 0.035, y0 + 0.11, 0.06);
    k.box(0.054, 0.006, 0.034, M.matte('#c9a15a'), -r + 0.035, y0 + 0.15, 0.06);
    k.rbox(0.012, 0.1, 0.035, 0.006, M.matte('#eee8d8'), r - 0.02, y0 + 0.1, -0.03, 1);
    buildBird(k, BUDGIE, BUDGIE_PERCH, 0.006, budgieCoat(c), `budgie|${c.fur},${c.head}`);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.circle(ctx, 0, 0, 0.238, tint(c.cage, 0.2));
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2;
        D.line(ctx, Math.cos(a) * 0.05, Math.sin(a) * 0.05, Math.cos(a) * 0.22, Math.sin(a) * 0.22, INK_SOFT, 0.004);
      }
      D.circle(ctx, 0, 0, 0.22, null, INK, LINE_THIN);
      D.ellipse(ctx, 0, 0.02, 0.026, 0.034, tint(c.fur, 0.1), undefined, LINE_THIN);
      D.circle(ctx, 0, 0.05, 0.018, tint(c.head, 0.1), undefined, LINE_THIN);
    }),
};

/* ------------------------------------------------------------------ gear helpers */

const sisalCache = new Map<string, THREE.Material>();
/** Coiled sisal rope (scratching posts): horizontal coils with twisted fibres. */
function sisal(color = '#c9ad7e'): THREE.Material {
  let m = sisalCache.get(color);
  if (m) return m;
  let map: THREE.CanvasTexture | null = null;
  if (typeof document !== 'undefined') {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const g = cv.getContext('2d');
    if (g) {
      const R = rng(5);
      const rows = 8;
      const rh = 128 / rows;
      for (let i = 0; i < rows; i++) {
        const grd = g.createLinearGradient(0, i * rh, 0, (i + 1) * rh);
        grd.addColorStop(0, '#5e5e5e');
        grd.addColorStop(0.5, '#e8e8e8');
        grd.addColorStop(1, '#5e5e5e');
        g.fillStyle = grd;
        g.fillRect(0, i * rh, 128, rh);
        // twisted strands: diagonal strokes
        for (let x = -rh; x < 128 + rh; x += 3) {
          const v = 120 + Math.floor(R() * 110);
          g.strokeStyle = `rgba(${v},${v},${v},0.55)`;
          g.lineWidth = 1.1;
          g.beginPath();
          g.moveTo(x, i * rh + 1);
          g.lineTo(x + rh * 0.7, (i + 1) * rh - 1);
          g.stroke();
        }
        // stray fibres
        for (let f = 0; f < 6; f++) {
          g.strokeStyle = 'rgba(250,250,250,0.6)';
          g.lineWidth = 0.6;
          const x = R() * 128;
          const y = i * rh + R() * rh;
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x + (R() - 0.5) * 8, y + (R() - 0.5) * 6);
          g.stroke();
        }
      }
      map = new THREE.CanvasTexture(cv);
      map.wrapS = map.wrapT = THREE.RepeatWrapping;
      map.colorSpace = THREE.SRGBColorSpace;
      map.repeat.set(12.5, 12.5);
      map.anisotropy = 4;
    }
  }
  m = new THREE.MeshStandardMaterial({ color, map, bumpMap: map, bumpScale: 2.5, roughness: 0.95 });
  m.userData.uvMeters = true;
  sisalCache.set(color, m);
  return m;
}

const dsCache = new Map<string, THREE.Material>();
const plasticDS = (color: string): THREE.Material => {
  let m = dsCache.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.35, side: THREE.DoubleSide });
    dsCache.set(color, m);
  }
  return m;
};

/** Pompom / plush ball toy. */
function pompom(k: Kit, r: number, color: string, x: number, y: number, z: number, seed: number): void {
  k.geo(blobGeo(r, 2, seed, 0.12, 6), M.fur(color), x, y, z);
}

/* ------------------------------------------------------------------ beds */

const bedRound: FurnitureDef = {
  id: 'pet-bed-round',
  name: 'מיטה עגולה פרוותית לכלב',
  category: 'pets',
  group: 'ציוד לחיות',
  tags: ['מיטה לכלב', 'מיטה לחתול', 'סופגנייה', 'פרווה', 'פרוותי'],
  size: { w: 0.76, d: 0.76, h: 0.2 },
  colors: [slot('fabric', 'פרווה', '#cdbda8'), slot('cushion', 'כרית', '#e8dfd0')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const fur = M.fur(c.fabric);
    // one continuous lathe: outer wall → rolled rim → inner wall → floor
    k.lathe(
      smoothProfile(
        [
          [0, 0],
          [0.33, 0],
          [0.372, 0.04],
          [0.378, 0.12],
          [0.35, 0.19],
          [0.3, 0.2],
          [0.252, 0.172],
          [0.232, 0.1],
          [0.2, 0.065],
          [0, 0.06],
        ],
        30,
      ),
      fur,
      0,
      0,
      0,
      30,
    );
    // plush inner cushion, slightly sagging in the middle
    k.lathe(smoothProfile([[0, 0.095], [0.12, 0.1], [0.2, 0.092], [0.232, 0.07], [0.235, 0.06]], 12).reverse(), M.fur(c.cushion), 0, 0, 0, 28);
    // a bone-shaped chew toy
    const bone = new Kit();
    const bm = M.matte('#efe6d2');
    bone.rod([-0.05, 0, 0], [0.05, 0, 0], 0.011, bm, 0.011, 10);
    for (const s of [-1, 1]) for (const t of [-1, 1]) bone.sphere(0.017, bm, s * 0.055, 0, t * 0.012, 1, 1, 1, 10);
    k.sub(bone, 0.08, 0.112, 0.08).rotation.y = 0.6;
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.circle(ctx, 0, 0, 0.375, tint(c.fabric, 0.3));
      D.circle(ctx, 0, 0, 0.24, tint(c.cushion, 0.25));
      D.circle(ctx, 0, 0, 0.3, null, INK_SOFT, LINE_THIN);
    }),
};

const bedOrtho: FurnitureDef = {
  id: 'pet-bed-ortho',
  name: 'מיטה אורתופדית לכלב',
  category: 'pets',
  group: 'ציוד לחיות',
  tags: ['מיטה לכלב', 'אורתופדי', 'ספוג', 'מזרן לכלב'],
  size: { w: 1.0, d: 0.72, h: 0.24 },
  colors: [slot('base', 'בסיס', '#5a5f66'), slot('bolster', 'משענת', '#8a8f94'), slot('top', 'מזרן', '#c9c2b6')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const base = M.fabric(c.base, 18);
    const bol = M.velvet(c.bolster);
    k.cushion(0.99, 0.1, 0.71, base, 0, 0, 0, 0.03, 0.004);
    // non-slip bottom strip
    k.box(0.96, 0.006, 0.68, M.rubber('#2b2b2d'), 0, 0, 0);
    // U-shaped bolsters
    k.cushion(0.98, 0.135, 0.16, bol, 0, 0.098, -0.27, 0.065, 0.01);
    for (const sx of [-1, 1]) k.cushion(0.16, 0.13, 0.56, bol, sx * 0.41, 0.098, 0.065, 0.062, 0.01);
    // memory-foam mattress
    k.cushion(0.65, 0.055, 0.53, M.fabric(c.top, 22), 0, 0.098, 0.085, 0.022, 0.01);
    // piping along the base edge + zipper
    k.tube([[-0.49, 0.1, 0.355], [0.49, 0.1, 0.355]], 0.004, M.fabric(darken(c.base, 0.25)), { seg: 4, radial: 5 });
    k.box(0.5, 0.008, 0.004, M.blackMetal(), 0.1, 0.035, 0.356);
    k.box(0.012, 0.022, 0.006, M.chrome(), 0.36, 0.028, 0.358);
    // fabric label
    k.box(0.06, 0.03, 0.002, M.fabric('#e9e3d6'), -0.36, 0.035, 0.356);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 1.0, 0.72, 0.04, tint(c.base, 0.4));
      D.rr(ctx, 0, -0.27, 0.98, 0.16, 0.06, tint(c.bolster, 0.35), undefined, LINE_THIN);
      for (const sx of [-1, 1]) D.rr(ctx, sx * 0.41, 0.065, 0.16, 0.56, 0.06, tint(c.bolster, 0.35), undefined, LINE_THIN);
      D.rr(ctx, 0, 0.085, 0.65, 0.53, 0.025, tint(c.top, 0.3), undefined, LINE_THIN);
    }),
};

/* ------------------------------------------------------------------ dog house */

const HOUSE = { w: 0.78, d: 0.94, wallH: 0.56, ridge: 0.8, y0: 0.08 };

const dogHouse: FurnitureDef = {
  id: 'pet-doghouse',
  name: 'מלונה מעץ לכלב',
  category: 'pets',
  group: 'ציוד לחיות',
  tags: ['מלונה', 'בית לכלב', 'עץ', 'חצר', 'גינה'],
  size: { w: 0.96, d: 1.06, h: 0.97 },
  colors: [slot('wood', 'עץ', '#b48a5e'), slot('roof', 'גג', '#4f5a52'), slot('trim', 'מסגרות', '#f1ede4')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const wood = M.wood(c.wood);
    const trim = M.paint(c.trim, 0.5);
    const { w, d, wallH, ridge, y0 } = HOUSE;
    const t = 0.024;
    // runners + floor
    for (const sx of [-1, 1]) k.box(0.06, 0.05, d, M.wood(darken(c.wood, 0.25)), sx * (w / 2 - 0.06), 0, 0);
    k.box(w, 0.03, d, wood, 0, 0.05, 0);
    // side walls with plank grooves
    const groove = M.matte(darken(c.wood, 0.45));
    for (const sx of [-1, 1]) {
      k.box(t, wallH, d - 0.02, wood, sx * (w / 2 - t / 2), y0, 0);
      for (let y = y0 + 0.09; y < y0 + wallH - 0.02; y += 0.09) k.box(0.002, 0.004, d - 0.03, groove, sx * (w / 2 + 0.0005), y, 0);
    }
    // gable walls: back solid, front with an arched door
    const gable = (): THREE.Shape => {
      const s = new THREE.Shape();
      s.moveTo(-w / 2, 0);
      s.lineTo(w / 2, 0);
      s.lineTo(w / 2, wallH);
      s.lineTo(0, ridge);
      s.lineTo(-w / 2, wallH);
      s.closePath();
      return s;
    };
    const back = k.geo(extrudeZ(gable(), t), wood, 0, y0, -d / 2 + t / 2);
    back.castShadow = true;
    const front = gable();
    const dw = 0.34;
    const dh = 0.3;
    const hole = new THREE.Path();
    hole.moveTo(-dw / 2, 0.02);
    hole.lineTo(dw / 2, 0.02);
    hole.lineTo(dw / 2, dh);
    hole.absarc(0, dh, dw / 2, 0, Math.PI, false);
    hole.lineTo(-dw / 2, 0.02);
    front.holes.push(hole);
    k.geo(extrudeZ(front, t, 0, 16), wood, 0, y0, d / 2 - t / 2);
    // door trim
    const arch: V3[] = [[-dw / 2 - 0.012, y0 + 0.02, d / 2 + 0.004]];
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI - (i / 10) * Math.PI;
      arch.push([Math.cos(a) * (dw / 2 + 0.012), y0 + dh + Math.sin(a) * (dw / 2 + 0.012), d / 2 + 0.004]);
    }
    arch.push([dw / 2 + 0.012, y0 + 0.02, d / 2 + 0.004]);
    k.tube(arch, 0.014, trim, { seg: 40, radial: 6, tension: 0.2 });
    // dark interior
    k.box(w - 0.06, wallH - 0.02, 0.01, M.matte('#2a241e'), 0, y0, -d / 2 + 0.04);
    k.box(w - 0.06, 0.004, d - 0.08, M.matte('#3a3128'), 0, y0, 0);
    // corner trims
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.03, wallH, 0.03, trim, sx * (w / 2 - 0.005), y0, sz * (d / 2 - 0.005));
    // roof: two slopes with overlapping shingle courses + ridge cap
    const roofM = M.paint(c.roof, 0.75);
    const over = 0.06;
    const eaveX = w / 2 + over;
    const eaveY = y0 + wallH - over * ((ridge - wallH) / (w / 2)) + 0.02;
    const topY = y0 + ridge + 0.03;
    const rl = d + 0.1;
    for (const sx of [-1, 1]) {
      k.beam([0, topY, 0], [sx * eaveX, eaveY, 0], 0.022, rl, M.wood(darken(c.wood, 0.1)));
      const nx = sx * ((ridge - wallH + 0.03) / (w / 2 + over));
      const nl = Math.hypot(nx, 1);
      for (let i = 0; i < 5; i++) {
        const f0 = 0.05 + i * 0.19;
        const f1 = f0 + 0.24;
        const p0: V3 = [sx * eaveX * f0, topY + (eaveY - topY) * f0, 0];
        const p1: V3 = [sx * eaveX * Math.min(1.02, f1), topY + (eaveY - topY) * Math.min(1.02, f1), 0];
        const off = 0.018 + 0.004 * i;
        const o: V3 = [(nx / nl) * off, (1 / nl) * off, 0];
        k.beam([p0[0] + o[0], p0[1] + o[1], 0], [p1[0] + o[0], p1[1] + o[1], 0], 0.012, rl + 0.01, roofM, 0.003);
      }
    }
    k.beam([0, topY + 0.03, -rl / 2 - 0.005], [0, topY + 0.03, rl / 2 + 0.005], 0.05, 0.045, M.paint(darken(c.roof, 0.2), 0.7), 0.01);
    // name plate
    k.rbox(0.2, 0.06, 0.012, 0.004, trim, 0, y0 + dh + dw / 2 + 0.05, d / 2 + 0.006, 1);
    k.box(0.12, 0.012, 0.002, M.matte('#6b4a2e'), 0, y0 + dh + dw / 2 + 0.072, d / 2 + 0.013);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 0.96, 1.06, 0.01, tint(c.roof, 0.45));
      D.line(ctx, 0, -0.53, 0, 0.53, INK, LINE_THIN);
      for (const sx of [-1, 1]) for (let i = 1; i < 5; i++) D.line(ctx, sx * i * 0.09, -0.53, sx * i * 0.09, 0.53, INK_SOFT, 0.005);
      D.box(ctx, -0.17, 0.47, 0.17, 0.53, 0, tint(c.trim, 0.2), undefined, LINE_THIN);
    }),
};

/* ------------------------------------------------------------------ cat furniture */

const catTree: FurnitureDef = {
  id: 'pet-cat-tree',
  name: 'עץ חתולים רב-קומתי',
  category: 'pets',
  group: 'ציוד לחיות',
  tags: ['עמוד גירוד', 'חתול', 'מגדל חתולים', 'סיסל', 'בית לחתול'],
  size: { w: 0.62, d: 0.5, h: 1.46 },
  colors: [slot('carpet', 'שטיח', '#c8bfb2'), slot('accent', 'כרית', '#8f9aa3')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const cp = M.fur(c.carpet);
    const rope = sisal();
    // base board
    k.rbox(0.62, 0.05, 0.5, 0.012, cp, 0, 0, 0, 2);
    // condo with a round entrance
    const cx = 0.1;
    const cz = 0.04;
    const bw = 0.38;
    const bh = 0.3;
    const bd = 0.34;
    const y0 = 0.05;
    const front = roundedRectShape(bw, bh, 0.015, 0, bh / 2);
    front.holes.push(ellipsePath(0.085, 0.085, 0, bh * 0.48));
    k.geo(extrudeZ(front, 0.02, 0, 20), cp, cx, y0, cz + bd / 2 - 0.01);
    k.box(bw, bh, 0.02, cp, cx, y0, cz - bd / 2 + 0.01);
    for (const sx of [-1, 1]) k.box(0.02, bh, bd - 0.04, cp, cx + sx * (bw / 2 - 0.01), y0, cz);
    k.box(bw - 0.04, 0.005, bd - 0.04, M.matte('#2e2a26'), cx, y0 + 0.002, cz);
    k.rbox(bw + 0.02, 0.03, bd + 0.02, 0.01, cp, cx, y0 + bh, cz, 2);
    // sisal posts
    const postR = 0.045;
    k.cyl(postR, 0.77, rope, -0.2, 0.05, -0.12, postR, 18);
    k.cyl(postR, 0.75, rope, 0.17, y0 + bh + 0.03, -0.08, postR, 18);
    k.cyl(postR, 0.5, rope, -0.17, 0.855, -0.13, postR, 18);
    // platforms
    k.rbox(0.34, 0.035, 0.3, 0.012, cp, -0.14, 0.82, -0.02, 2);
    k.rbox(0.3, 0.035, 0.3, 0.012, cp, 0.15, 1.13, 0.0, 2);
    // top lounger with a raised rim + cushion
    k.lathe(smoothProfile([[0, 0], [0.16, 0], [0.175, 0.03], [0.17, 0.09], [0.15, 0.095], [0.14, 0.05], [0, 0.04]], 12), cp, -0.13, 1.355, -0.06, 22);
    k.lathe(smoothProfile([[0.14, 0.045], [0.08, 0.065], [0, 0.068]], 8).reverse(), M.velvet(c.accent), -0.13, 1.355, -0.06, 22);
    // dangling toy from the middle platform
    k.rod([0.27, 1.13, 0.1], [0.27, 0.96, 0.11], 0.0015, M.matte('#e0d6c2'), 0.0015, 4);
    pompom(k, 0.024, '#e05a4f', 0.27, 0.94, 0.11, 3);
    // little hammock-like sag on the lower platform: a cushion
    k.cushion(0.26, 0.03, 0.22, M.velvet(c.accent), -0.14, 0.855, 0.0, 0.012, 0.006);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 0.62, 0.5, 0.012, tint(c.carpet, 0.35));
      D.rr(ctx, 0.15, 0.0, 0.3, 0.3, 0.012, tint(c.carpet, 0.2), undefined, LINE_THIN);
      D.rr(ctx, -0.14, -0.02, 0.34, 0.3, 0.012, tint(c.carpet, 0.25), undefined, LINE_THIN);
      D.circle(ctx, -0.13, -0.06, 0.175, tint(c.carpet, 0.15), undefined, LINE_THIN);
      D.circle(ctx, -0.13, -0.06, 0.14, tint(c.accent, 0.3), undefined, LINE_THIN);
    }),
};

const scratchPost: FurnitureDef = {
  id: 'pet-scratch-post',
  name: 'עמוד גירוד לחתול',
  category: 'pets',
  group: 'ציוד לחיות',
  tags: ['עמוד גירוד', 'חתול', 'סיסל'],
  size: { w: 0.4, d: 0.4, h: 0.68 },
  colors: [slot('carpet', 'שטיח', '#b9b1a6'), slot('toy', 'צעצוע', '#e0a33a')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const cp = M.fur(c.carpet);
    k.rbox(0.4, 0.045, 0.4, 0.012, cp, 0, 0, 0, 2);
    k.cyl(0.055, 0.58, sisal(), 0, 0.045, 0, 0.055, 20);
    k.lathe(smoothProfile([[0, 0], [0.135, 0], [0.145, 0.02], [0.135, 0.04], [0, 0.04]], 10), cp, 0, 0.62, 0, 24);
    // spring toy on the base
    const pts: V3[] = [];
    for (let i = 0; i <= 24; i++) {
      const a = i * 0.9;
      pts.push([0.13 + Math.cos(a) * 0.004 - (i / 24) * 0.03, 0.05 + (i / 24) * 0.22, 0.12 + Math.sin(a) * 0.004]);
    }
    k.tube(pts, 0.002, M.chrome(), { seg: 48, radial: 4 });
    pompom(k, 0.028, c.toy, 0.1, 0.29, 0.12, 5);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 0.4, 0.4, 0.012, tint(c.carpet, 0.35));
      D.circle(ctx, 0, 0, 0.145, tint(c.carpet, 0.2), undefined, LINE_THIN);
      D.circle(ctx, 0.1, 0.12, 0.028, tint(c.toy, 0.2), undefined, LINE_THIN);
    }),
};

/* ------------------------------------------------------------------ feeding & hygiene */

const bowlsStand: FurnitureDef = {
  id: 'pet-bowls-stand',
  name: 'מעמד קערות אוכל ומים',
  category: 'pets',
  group: 'ציוד לחיות',
  tags: ['קערה', 'אוכל לכלב', 'מים', 'מאכיל', 'נירוסטה'],
  size: { w: 0.46, d: 0.24, h: 0.16 },
  colors: [slot('wood', 'עץ', '#a07850')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const wood = M.wood(c.wood);
    const th = 0.12;
    // top board + two shaped end panels
    const topS = roundedRectShape(0.452, 0.232, 0.012);
    for (const sx of [-1, 1]) topS.holes.push(ellipsePath(0.084, 0.084, sx * 0.11, 0));
    k.slab(topS, 0.022, wood, 0, th, 0, 0, 16);
    for (const sx of [-1, 1]) {
      const s = new THREE.Shape();
      s.moveTo(-0.11, 0);
      s.lineTo(-0.07, 0);
      s.quadraticCurveTo(0, 0.05, 0.07, 0);
      s.lineTo(0.11, 0);
      s.lineTo(0.11, th);
      s.lineTo(-0.11, th);
      s.closePath();
      const g = k.geo(extrudeZ(s, 0.022, 0, 8), wood, sx * 0.205, 0, 0);
      g.rotation.y = Math.PI / 2;
    }
    k.box(0.38, 0.03, 0.012, wood, 0, th - 0.03, -0.1);
    const steel = M.brushed('#d4d7d9');
    for (const sx of [-1, 1]) {
      const x = sx * 0.11;
      k.lathe(
        [
          [0, 0.085],
          [0.055, 0.086],
          [0.07, 0.1],
          [0.082, 0.135],
          [0.092, 0.146],
          [0.094, 0.15],
          [0.088, 0.151],
          [0.078, 0.14],
          [0.066, 0.11],
          [0.052, 0.094],
          [0, 0.093],
        ],
        steel,
        x,
        0,
        0,
        28,
      );
      if (sx < 0) {
        // kibble heap
        k.geo(blobGeo(0.055, 2, 4, 0.22, 30), M.matte('#7a4a26'), x, 0.1, 0).scale.set(1.1, 0.42, 1.1);
        const R = rng(9);
        for (let i = 0; i < 8; i++) {
          const a = R() * Math.PI * 2;
          const rr = R() * 0.04;
          k.sphere(0.006, M.matte(i % 2 ? '#8a5530' : '#6d4022'), x + Math.cos(a) * rr, 0.118 + (0.04 - rr) * 0.25, Math.sin(a) * rr, 1, 0.7, 1, 6);
        }
      } else {
        k.disc(0.074, 0.002, M.water(), x, 0.132, 0, 24);
      }
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 0.46, 0.24, 0.01, tint(c.wood, 0.4));
      D.circle(ctx, -0.11, 0, 0.094, '#e4e6e8', undefined, LINE_THIN);
      D.circle(ctx, -0.11, 0, 0.055, '#c79a72', null);
      D.circle(ctx, 0.11, 0, 0.094, '#e4e6e8', undefined, LINE_THIN);
      D.circle(ctx, 0.11, 0, 0.074, '#cfe6ee', null);
    }),
};

const litterBox: FurnitureDef = {
  id: 'pet-litter-box',
  name: 'ארגז חול סגור לחתול',
  category: 'pets',
  group: 'ציוד לחיות',
  tags: ['ארגז חול', 'שירותים לחתול', 'חתול', 'חול'],
  size: { w: 0.52, d: 0.43, h: 0.47 },
  colors: [slot('base', 'בסיס', '#6f7f86'), slot('hood', 'מכסה', '#e9e6df')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const base = M.plastic(c.base);
    const hood = M.plastic(c.hood);
    k.rbox(0.52, 0.14, 0.42, 0.03, base, 0, 0, 0, 2);
    k.rbox(0.525, 0.018, 0.425, 0.008, M.plastic(darken(c.base, 0.12)), 0, 0.13, 0, 2);
    // hood: arched shell + front with a door + back
    const hw = 0.5;
    const hh = 0.31;
    const hy = 0.11;
    const shell = roundedRectShape(hw, hh, 0.13, 0, hh / 2);
    shell.holes.push(roundedRectPath(new THREE.Path(), hw - 0.012, hh - 0.012, 0.124, 0, hh / 2));
    k.geo(extrudeZ(shell, 0.396, 0, 12), hood, 0, hy, 0);
    const back = roundedRectShape(hw - 0.006, hh - 0.006, 0.127, 0, hh / 2);
    k.geo(extrudeZ(back, 0.006, 0, 12), hood, 0, hy, -0.198);
    const front = roundedRectShape(hw - 0.006, hh - 0.006, 0.127, 0, hh / 2);
    front.holes.push(roundedRectPath(new THREE.Path(), 0.2, 0.19, 0.06, 0, 0.165));
    k.geo(extrudeZ(front, 0.006, 0, 12), hood, 0, hy, 0.198);
    // smoky swing flap
    const flap = roundedRectShape(0.2, 0.19, 0.06, 0, 0.165);
    k.geo(extrudeZ(flap, 0.003, 0, 12), M.glass('#5a6066', 0.55), 0, hy, 0.2);
    // litter inside + carbon filter grille + carry handle
    k.box(0.47, 0.012, 0.37, M.stone('#d8cfbd', 0.95), 0, 0.09, 0);
    for (let i = 0; i < 5; i++) k.box(0.12, 0.004, 0.008, M.matte('#2e3133'), 0, hy + hh - 0.002, -0.14 + i * 0.016);
    k.tube([[-0.09, hy + hh - 0.01, 0], [-0.07, hy + hh + 0.035, 0], [0.07, hy + hh + 0.035, 0], [0.09, hy + hh - 0.01, 0]], 0.01, M.plastic(darken(c.hood, 0.15)), { seg: 16, radial: 6 });
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 0.52, 0.42, 0.04, tint(c.base, 0.4));
      D.rr(ctx, 0, 0, 0.5, 0.4, 0.13, tint(c.hood, 0.2), undefined, LINE_THIN);
      D.rr(ctx, 0, 0, 0.18, 0.05, 0.02, null, INK_SOFT, LINE_THIN);
      D.line(ctx, -0.1, 0.2, 0.1, 0.2, INK, 0.02);
    }),
};

/* ------------------------------------------------------------------ small animal housing */

/** Hamster (static, sitting) for the cage. */
function hamster(k: Kit, x: number, y: number, z: number, color: string, ry = 0): void {
  const h = new Kit();
  const fur = M.fur(color);
  h.sphere(0.035, fur, 0, 0.032, 0, 1, 0.9, 1.15, 12);
  h.sphere(0.028, M.fur('#f2e8d8'), 0, 0.026, 0.012, 0.95, 0.85, 1.05, 12);
  h.sphere(0.025, fur, 0, 0.05, 0.035, 1, 0.92, 1, 10);
  h.sphere(0.013, M.fur('#f2e8d8'), 0, 0.044, 0.053, 1.1, 0.8, 0.9, 10);
  for (const s of [-1, 1]) {
    h.sphere(0.008, PM.skin('#d99d95'), s * 0.017, 0.072, 0.028, 1, 1, 0.45, 8).rotation.y = s * 0.4;
    h.sphere(0.0045, PM.eye('#0b0706'), s * 0.014, 0.058, 0.052, 1, 1, 1, 8);
    h.sphere(0.0012, PM.spark(), s * 0.0135, 0.0597, 0.0562, 1, 1, 1, 4);
    h.sphere(0.006, PM.skin('#e7b0a6'), s * 0.012, 0.006, 0.04, 1, 0.6, 1.2, 6);
  }
  h.sphere(0.003, PM.nose('#d98f8c'), 0, 0.047, 0.066, 1, 1, 1, 6);
  k.sub(h, x, y, z).rotation.y = ry;
}

const hamsterCage: FurnitureDef = {
  id: 'pet-hamster-cage',
  name: 'כלוב אוגר עם גלגל',
  category: 'pets',
  group: 'ציוד לחיות',
  tags: ['אוגר', 'כלוב', 'גלגל ריצה', 'מכרסם'],
  size: { w: 0.6, d: 0.4, h: 0.44 },
  colors: [slot('base', 'מגש', '#3f8fb5'), slot('accent', 'אביזרים', '#f2b84b'), slot('hamster', 'אוגר', '#d49a5a')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const W = 0.6;
    const Dd = 0.4;
    const bh = 0.13;
    k.rbox(W, bh, Dd, 0.025, M.plastic(c.base), 0, 0, 0, 2);
    k.rbox(W + 0.004, 0.014, Dd + 0.004, 0.006, M.plastic(darken(c.base, 0.15)), 0, bh - 0.012, 0, 2);
    // bedding (wood shavings)
    k.box(W - 0.03, 0.006, Dd - 0.03, M.fur('#e2c99a'), 0, bh - 0.008, 0);
    // wire top
    const wire = M.metal('#dfe1e2', 0.35, 0.8);
    const top = 0.42;
    const iw = W / 2 - 0.012;
    const id = Dd / 2 - 0.012;
    for (let x = -iw; x <= iw + 1e-6; x += (2 * iw) / 18) for (const sz of [-1, 1]) k.rod([x, bh, sz * id], [x, top, sz * id], 0.0016, wire, 0.0016, 3);
    for (let z = -id + (2 * id) / 12; z < id - 1e-6; z += (2 * id) / 12) for (const sx of [-1, 1]) k.rod([sx * iw, bh, z], [sx * iw, top, z], 0.0016, wire, 0.0016, 3);
    for (let z = -id; z <= id + 1e-6; z += (2 * id) / 12) k.rod([-iw, top, z], [iw, top, z], 0.0016, wire, 0.0016, 3);
    for (const y of [bh + 0.005, top]) {
      for (const sz of [-1, 1]) k.rod([-iw, y, sz * id], [iw, y, sz * id], 0.0028, wire, 0.0028, 5);
      for (const sx of [-1, 1]) k.rod([sx * iw, y, -id], [sx * iw, y, id], 0.0028, wire, 0.0028, 5);
    }
    k.tube([[-0.06, top, 0], [-0.05, top + 0.018, 0], [0.05, top + 0.018, 0], [0.06, top, 0]], 0.004, M.plastic(c.base), { seg: 12, radial: 5 });
    // exercise wheel on a stand (open running drum)
    const acc = c.accent;
    const wx = -0.16;
    const wy = 0.215;
    const wz = -0.06;
    const drum = new THREE.CylinderGeometry(0.075, 0.075, 0.05, 28, 1, true);
    drum.rotateX(Math.PI / 2);
    k.geo(drum, plasticDS(acc), wx, wy, wz + 0.01);
    k.disc(0.075, 0.004, M.plastic(acc), wx, wy, wz - 0.016, 28).rotation.x = Math.PI / 2;
    k.cyl(0.01, 0.012, M.plastic(darken(acc, 0.2)), wx, wy, wz - 0.03, 0.01, 12).rotation.x = Math.PI / 2;
    k.beam([wx, bh, wz - 0.03], [wx, wy, wz - 0.03], 0.016, 0.012, M.plastic(darken(acc, 0.2)), 0.004);
    k.box(0.06, 0.008, 0.05, M.plastic(darken(acc, 0.2)), wx, bh, wz - 0.03);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      k.box(0.003, 0.003, 0.05, M.plastic(darken(acc, 0.1)), wx + Math.cos(a) * 0.073, wy - 0.0015 + Math.sin(a) * 0.073, wz + 0.01);
    }
    // hide-out hut with a round doorway
    const hut = new THREE.Shape();
    hut.moveTo(-0.06, 0);
    hut.lineTo(0.06, 0);
    hut.lineTo(0.06, 0.05);
    hut.absarc(0, 0.05, 0.06, 0, Math.PI, false);
    hut.lineTo(-0.06, 0);
    hut.holes.push(ellipsePath(0.024, 0.024, 0, 0.04));
    k.geo(extrudeZ(hut, 0.1, 0, 10), M.plastic(lighten(acc, 0.2)), 0.16, bh - 0.002, -0.05);
    k.disc(0.022, 0.002, M.matte('#2b2622'), 0.16, bh + 0.038, 0.0, 16).rotation.x = Math.PI / 2;
    // ceramic food bowl with seeds
    k.lathe([[0, 0], [0.03, 0], [0.036, 0.022], [0.031, 0.022], [0.026, 0.006], [0, 0.006]], M.ceramic('#f4efe6'), 0.05, bh - 0.002, 0.1, 18);
    k.cyl(0.027, 0.012, M.matte('#c9a15a'), 0.05, bh + 0.004, 0.1, 0.028, 14);
    // water bottle clipped to the outside of the bars (right side)
    const bx = iw - 0.025;
    k.cyl(0.018, 0.12, M.glass('#d6eef5', 0.35), bx, 0.27, 0.1, 0.018, 14);
    k.cyl(0.0175, 0.08, M.water(), bx, 0.275, 0.1, 0.0175, 14);
    k.cyl(0.014, 0.02, M.plastic(c.base), bx, 0.255, 0.1, 0.016, 12);
    k.rod([bx, 0.26, 0.1], [bx - 0.01, 0.2, 0.1], 0.003, M.chrome(), 0.0025, 6);
    k.box(0.03, 0.01, 0.012, M.plastic(c.base), bx + 0.012, 0.36, 0.1);
    hamster(k, 0.02, bh, 0.06, c.hamster, -0.5);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 0.6, 0.4, 0.025, tint(c.base, 0.4));
      for (let i = 1; i < 12; i++) D.line(ctx, -0.29, -0.19 + i * 0.0317, 0.29, -0.19 + i * 0.0317, INK_SOFT, 0.003);
      D.rr(ctx, -0.16, -0.05, 0.16, 0.06, 0.01, tint(c.accent, 0.2), undefined, LINE_THIN);
      D.rr(ctx, 0.16, -0.05, 0.12, 0.1, 0.03, tint(c.accent, 0.35), undefined, LINE_THIN);
      D.ellipse(ctx, 0.02, 0.06, 0.035, 0.045, tint(c.hamster, 0.2), undefined, LINE_THIN);
    }),
};

const rabbitHutch: FurnitureDef = {
  id: 'pet-rabbit-hutch',
  name: 'מלונה לארנבים',
  category: 'pets',
  group: 'ציוד לחיות',
  tags: ['ארנב', 'מלונה', 'לול', 'עץ', 'חצר'],
  size: { w: 1.2, d: 0.64, h: 0.89 },
  colors: [slot('wood', 'עץ', '#c49a6c'), slot('roof', 'גג', '#3d4440'), slot('trim', 'מסגרת', '#efe9de')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const wood = M.wood(c.wood);
    const trim = M.paint(c.trim, 0.5);
    const W = 1.12;
    const Dd = 0.56;
    const fy = 0.36;
    const hb = 0.86;
    const hf = 0.8;
    // legs
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.05, sz < 0 ? hb : hf, 0.05, M.wood(darken(c.wood, 0.15)), sx * (W / 2 - 0.025), 0, sz * (Dd / 2 - 0.025));
    // floor + back + sides
    k.box(W, 0.03, Dd, wood, 0, fy, 0);
    k.box(W, hb - fy, 0.02, wood, 0, fy, -Dd / 2 + 0.01);
    for (const sx of [-1, 1]) {
      const s = new THREE.Shape();
      s.moveTo(-Dd / 2, 0);
      s.lineTo(Dd / 2, 0);
      s.lineTo(Dd / 2, hf - fy);
      s.lineTo(-Dd / 2, hb - fy);
      s.closePath();
      const g = k.geo(extrudeZ(s, 0.02), wood, sx * (W / 2 - 0.01), fy, 0);
      g.rotation.y = -Math.PI / 2;
    }
    // front: mesh run (left) + solid sleeping compartment door (right)
    const split = 0.18;
    const z = Dd / 2 - 0.01;
    const frame = (x0: number, x1: number): void => {
      k.box(x1 - x0, 0.04, 0.025, trim, (x0 + x1) / 2, fy, z);
      k.box(x1 - x0, 0.04, 0.025, trim, (x0 + x1) / 2, hf - 0.04, z);
      k.box(0.04, hf - fy, 0.025, trim, x0 + 0.02, fy, z);
      k.box(0.04, hf - fy, 0.025, trim, x1 - 0.02, fy, z);
    };
    frame(-W / 2, split);
    frame(split, W / 2);
    const wire = M.metal('#b9bcbd', 0.45, 0.8);
    for (let x = -W / 2 + 0.05; x < split - 0.03; x += 0.03) k.rod([x, fy + 0.04, z], [x, hf - 0.04, z], 0.0013, wire, 0.0013, 3);
    for (let y = fy + 0.06; y < hf - 0.04; y += 0.03) k.rod([-W / 2 + 0.04, y, z], [split - 0.04, y, z], 0.0013, wire, 0.0013, 3);
    k.box(W / 2 - split - 0.08, hf - fy - 0.08, 0.018, wood, (split + W / 2) / 2, fy + 0.04, z - 0.002);
    for (const y of [fy + 0.1, hf - 0.14]) k.box(0.04, 0.03, 0.006, M.blackMetal(), split + 0.05, y, z + 0.012);
    k.rod([W / 2 - 0.07, (fy + hf) / 2, z + 0.014], [W / 2 - 0.07, (fy + hf) / 2 + 0.05, z + 0.014], 0.004, M.blackMetal(), 0.004, 6);
    // hay + water bottle inside the run
    k.geo(blobGeo(0.12, 2, 7, 0.3, 14), M.fur('#d8c27a'), -0.32, fy + 0.03, -0.08).scale.set(1.4, 0.5, 0.9);
    k.cyl(0.02, 0.14, M.glass('#d6eef5', 0.35), -0.05, fy + 0.18, z - 0.03, 0.02, 12);
    k.cyl(0.0195, 0.09, M.water(), -0.05, fy + 0.18, z - 0.03, 0.0195, 12);
    // sloped felt roof with overhang
    const rh0 = hb + 0.012;
    const rh1 = hf + 0.012;
    k.beam([0, rh0, -Dd / 2 - 0.025], [0, rh1, Dd / 2 + 0.02], W + 0.08, 0.025, M.fabric(c.roof, 30), 0.004);
    k.beam([0, rh1 + 0.003, Dd / 2 + 0.022], [0, rh1 - 0.04, Dd / 2 + 0.024], W + 0.08, 0.01, M.wood(darken(c.wood, 0.1)));
    // pull-out tray below
    k.box(W - 0.12, 0.05, 0.02, trim, 0, fy - 0.05, Dd / 2 - 0.02);
    k.rod([-0.04, fy - 0.025, Dd / 2 + 0.003], [0.04, fy - 0.025, Dd / 2 + 0.003], 0.004, M.blackMetal(), 0.004, 6);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 1.2, 0.64, 0.01, tint(c.roof, 0.5));
      for (let i = 1; i < 6; i++) D.line(ctx, -0.6, -0.32 + i * 0.107, 0.6, -0.32 + i * 0.107, INK_SOFT, 0.004);
      D.line(ctx, -0.56, 0.3, 0.16, 0.3, INK, 0.012);
    }),
};

/* ------------------------------------------------------------------ travel & walk */

const petCarrier: FurnitureDef = {
  id: 'pet-carrier',
  name: 'כלוב נשיאה לחיות',
  category: 'pets',
  group: 'ציוד לחיות',
  tags: ['כלוב נשיאה', 'תיק נשיאה', 'חתול', 'כלב קטן', 'נסיעה', 'וטרינר'],
  size: { w: 0.36, d: 0.5, h: 0.33 },
  colors: [slot('base', 'תחתית', '#6b7075'), slot('top', 'מכסה', '#e7e3da')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const L = 0.48;
    k.rbox(0.34, 0.14, L, 0.035, M.plastic(c.base), 0, 0, -0.01, 2);
    k.rbox(0.33, 0.15, L - 0.01, 0.05, M.plastic(c.top), 0, 0.13, -0.01, 2);
    k.rbox(0.345, 0.014, L + 0.004, 0.006, M.plastic(darken(c.base, 0.15)), 0, 0.132, -0.01, 2);
    // wing nuts along the seam
    for (const sx of [-1, 1]) for (const zz of [-0.17, 0.0, 0.15]) k.cyl(0.008, 0.012, M.plastic(darken(c.base, 0.2)), sx * 0.173, 0.133, zz, 0.008, 8).rotation.z = Math.PI / 2;
    // side vents
    for (const sx of [-1, 1]) for (let i = 0; i < 6; i++) k.box(0.004, 0.012, 0.05, M.matte('#1f2123'), sx * 0.166, 0.205, -0.17 + i * 0.06);
    for (let i = 0; i < 5; i++) k.box(0.2, 0.004, 0.012, M.matte('#1f2123'), 0, 0.279, -0.15 + i * 0.05);
    // dark interior seen through the grille
    k.box(0.27, 0.21, 0.004, M.matte('#151618'), 0, 0.04, L / 2 - 0.008);
    // wire door
    const wire = M.chrome();
    const zf = L / 2 - 0.004;
    k.tube([[-0.13, 0.035, zf], [0.13, 0.035, zf], [0.135, 0.15, zf], [0.12, 0.255, zf], [-0.12, 0.255, zf], [-0.135, 0.15, zf]], 0.0035, wire, { closed: true, seg: 36, radial: 5, tension: 0.1 });
    for (let i = 0; i < 9; i++) {
      const x = -0.11 + i * 0.0275;
      k.rod([x, 0.035, zf + 0.002], [x, 0.255, zf + 0.002], 0.0022, wire, 0.0022, 4);
    }
    for (const y of [0.1, 0.18]) k.rod([-0.13, y, zf + 0.004], [0.13, y, zf + 0.004], 0.0022, wire, 0.0022, 4);
    k.box(0.03, 0.05, 0.012, M.plastic(darken(c.base, 0.2)), 0.12, 0.12, zf + 0.008);
    // carry handle
    k.tube([[0, 0.278, -0.1], [0, 0.315, -0.07], [0, 0.318, 0.07], [0, 0.278, 0.1]], 0.012, M.plastic(darken(c.top, 0.2)), { seg: 16, radial: 6 });
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, -0.01, 0.34, 0.48, 0.05, tint(c.top, 0.25));
      for (let i = 0; i < 5; i++) D.line(ctx, -0.1, -0.15 + i * 0.05, 0.1, -0.15 + i * 0.05, INK_SOFT, 0.005);
      D.line(ctx, 0, -0.1, 0, 0.1, INK, 0.02);
      D.line(ctx, -0.13, 0.24, 0.13, 0.24, INK, 0.012);
    }),
};

const leashHook: FurnitureDef = {
  id: 'pet-leash-hook',
  name: 'מתלה רצועות לכלב',
  category: 'pets',
  group: 'ציוד לחיות',
  tags: ['רצועה', 'קולר', 'מתלה', 'וו', 'טיול'],
  size: { w: 0.42, d: 0.075, h: 0.42 },
  mount: 'wall',
  elevation: 1.05,
  colors: [slot('wood', 'עץ', '#b08a62'), slot('leash', 'רצועה', '#c2452f'), slot('collar', 'קולר', '#2f5d8a')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const zb = -0.0375;
    const y0 = 0.3;
    // plaque with a paw-print
    k.rbox(0.42, 0.12, 0.02, 0.008, M.wood(c.wood), 0, y0, zb + 0.01, 2);
    const ink = M.matte(darken(c.wood, 0.55));
    k.sphere(0.013, ink, 0.0, y0 + 0.068, zb + 0.02, 1.1, 0.9, 0.12, 12);
    for (let i = 0; i < 4; i++) k.sphere(0.0055, ink, -0.016 + i * 0.0107, y0 + 0.088 + (i === 0 || i === 3 ? 0 : 0.005), zb + 0.02, 1, 1.2, 0.12, 8);
    const brass = M.brass();
    const hooks = [-0.14, 0, 0.14];
    for (const x of hooks) {
      k.cyl(0.009, 0.004, brass, x, y0 + 0.03, zb + 0.022, 0.009, 12).rotation.x = Math.PI / 2;
      k.tube([[x, y0 + 0.03, zb + 0.02], [x, y0 + 0.028, zb + 0.045], [x, y0 + 0.012, zb + 0.06], [x, y0 + 0.025, zb + 0.068]], 0.0035, brass, { seg: 12, radial: 5 });
    }
    // leash: loop over the left hook, hanging down with the handle loop and clip
    const lm = M.fabric(c.leash, 40);
    const hx = hooks[0];
    k.tube(
      [
        [hx - 0.012, y0 + 0.022, zb + 0.05],
        [hx - 0.02, y0 - 0.06, zb + 0.04],
        [hx - 0.03, 0.066, zb + 0.03],
        [hx - 0.01, 0.0065, zb + 0.03],
        [hx + 0.02, 0.046, zb + 0.032],
        [hx + 0.016, y0 - 0.08, zb + 0.042],
        [hx + 0.01, y0 + 0.02, zb + 0.052],
      ],
      0.006,
      lm,
      { seg: 60, radial: 6 },
    );
    k.rbox(0.016, 0.04, 0.012, 0.004, M.chrome(), hx + 0.04, 0.12, zb + 0.035, 1);
    k.tube([[hx + 0.012, y0 + 0.02, zb + 0.052], [hx + 0.04, y0 - 0.06, zb + 0.04], [hx + 0.04, 0.16, zb + 0.035]], 0.0055, lm, { seg: 24, radial: 6 });
    // collar hanging from the right hook
    const cx = hooks[2];
    const col = k.add(new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.008, 6, 28), M.leather(c.collar)), cx, y0 + 0.012 - 0.065, zb + 0.058);
    col.scale.set(1, 1, 0.5);
    col.castShadow = true;
    k.box(0.022, 0.026, 0.008, M.chrome(), cx, y0 + 0.012 - 0.13 - 0.005, zb + 0.058);
    k.cyl(0.011, 0.002, brass, cx, y0 - 0.152, zb + 0.06, 0.011, 12).rotation.x = Math.PI / 2;
    // poop-bag holder on the middle hook
    k.cyl(0.016, 0.07, M.plastic('#3a3f44'), 0, y0 - 0.075, zb + 0.047, 0.016, 12);
    k.cyl(0.012, 0.004, M.plastic('#6fae54'), 0, y0 - 0.079, zb + 0.047, 0.012, 12);
    k.rod([0, y0 + 0.012, zb + 0.062], [0, y0 - 0.005, zb + 0.047], 0.002, M.plastic('#3a3f44'), 0.002, 5);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, -0.025, 0.42, 0.02, 0.005, tint(c.wood, 0.3));
      for (const x of [-0.14, 0, 0.14]) D.line(ctx, x, -0.015, x, 0.03, INK, 0.008);
      D.line(ctx, -0.17, 0.0, -0.11, 0.0, c.leash, 0.012);
      D.line(ctx, 0.1, 0.023, 0.18, 0.023, c.collar, 0.012);
    }),
};

export const PETS: FurnitureDef[] = [
  ...ANIMALS.map(animal),
  parrotStand,
  birdCage,
  hamsterCage,
  rabbitHutch,
  bedRound,
  bedOrtho,
  dogHouse,
  catTree,
  scratchPost,
  bowlsStand,
  litterBox,
  petCarrier,
  leashHook,
];

