import {
  type CellMap,
  type RGB,
  type Rng,
  type Surface,
  bondLayout,
  courseLayout,
  fbm,
  herringboneLayout,
  hexToRgb,
  mulberry32,
  newSurface,
  pick,
  rasterRects,
  whiteNoise,
} from '../textureGen';

export interface MasonryOpts {
  seed: number;
  /** base color of unit k */
  color: (k: number, rng: Rng) => RGB;
  mortar: string;
  /** joint width / recess, mm */
  mortarW: number;
  mortarDepth: number;
  /** rounded arris: width and drop, mm */
  bevel: number;
  bevelDepth: number;
  /** irregular edges, mm, and the size of the irregularities in m */
  edgeNoise: number;
  edgeNoiseSize?: number;
  /** cloudy color variation (+-fraction), feature size m (sampled per unit) */
  mottle: number;
  mottleSize: number;
  /** per-pixel color grain (+-fraction) */
  speck: number;
  /** face relief: amplitude mm, feature size m (sampled per unit) */
  bump: number;
  bumpSize: number;
  /** per-pixel relief, mm */
  grit: number;
  /** fraction of the face covered by small pits / tool marks, their depth in mm */
  pits?: number;
  pitDepth?: number;
  /** pillowed face: height (mm) gained over `bulgeW` mm from the joint */
  bulge?: number;
  bulgeW?: number;
  /** random proud / recessed units (+-mm) and tilt (slope) */
  offset?: number;
  tilt?: number;
  /** darkening next to the joints: amount and reach in mm */
  ao?: number;
  aoW?: number;
  /** large soft patches tinted towards a color (efflorescence, weathering) */
  stain?: { color: string; amount: number; size: number };
  /** thin mineral veins tinted towards a color */
  veins?: { color: string; amount: number; size: number };
  rough: number;
  roughMortar: number;
}

/** shade a cell map as rough masonry units (brick, stone, concrete pavers) in mortar */
export function shadeMasonry(s: Surface, cm: CellMap, o: MasonryOpts): void {
  const { n } = s;
  const rng = mulberry32(o.seed);
  const count = cm.count;
  const cr = new Float32Array(count);
  const cg = new Float32Array(count);
  const cb = new Float32Array(count);
  const tx = new Float32Array(count);
  const ty = new Float32Array(count);
  const lift = new Float32Array(count);
  const off = new Int32Array(count);
  const tilt = (o.tilt ?? 0) * 1000;
  for (let k = 0; k < count; k++) {
    const c = o.color(k, rng);
    cr[k] = c[0];
    cg[k] = c[1];
    cb[k] = c[2];
    tx[k] = (rng() * 2 - 1) * tilt;
    ty[k] = (rng() * 2 - 1) * tilt;
    lift[k] = (rng() * 2 - 1) * (o.offset ?? 0);
    off[k] = Math.floor(rng() * n * n);
  }
  const size = (s.w + s.h) / 2;
  const mot = fbm(n, size / o.mottleSize, size / o.mottleSize, 4, o.seed + 3);
  const bmp = fbm(n, size / o.bumpSize, size / o.bumpSize, 4, o.seed + 7, 0.55);
  const en = o.edgeNoise ? fbm(n, size / (o.edgeNoiseSize ?? 0.025), size / (o.edgeNoiseSize ?? 0.025), 2, o.seed + 11) : null;
  const wn = whiteNoise(n, o.seed + 13);
  const pit = o.pits ? fbm(n, n / 2.5, n / 2.5, 2, o.seed + 17, 0.7) : null;
  const stainF = o.stain ? fbm(n, size / o.stain.size, size / o.stain.size, 4, o.seed + 19) : null;
  const veinF = o.veins ? fbm(n, size / o.veins.size, size / o.veins.size, 4, o.seed + 23) : null;
  const stainC = hexToRgb(o.stain?.color ?? '#ffffff');
  const veinC = hexToRgb(o.veins?.color ?? '#ffffff');
  const mortar = hexToRgb(o.mortar);
  const half = o.mortarW / 2;
  const pxmm = (size * 1000) / n;
  const aa = Math.max(0.4, 0.6 * pxmm);
  const pitLevel = 1 - (o.pits ?? 0);
  const pitDepth = o.pitDepth ?? 0.5;
  const bulge = o.bulge ?? 0;
  const bulgeW = o.bulgeW ?? 10;
  const ao = o.ao ?? 0.15;
  const aoW = o.aoW ?? 6;
  const { id, edge, lx, ly } = cm;
  const { rgba, height, rough } = s;
  const total = n * n;
  const mask = total - 1;
  for (let i = 0; i < total; i++) {
    const k = id[i];
    const j = (i + off[k]) & mask;
    let d = edge[i];
    if (en) d += (en[i] - 0.5) * 2 * o.edgeNoise;
    const g = d - half;
    const gf = g <= -aa ? 1 : g >= aa ? 0 : 0.5 - g / (2 * aa);
    const gp = g > 0 ? g : 0;
    let q = 0;
    if (gp < o.bevel) {
      const u = 1 - gp / o.bevel;
      q = u * u;
    }
    const w = wn[i] - 0.5;
    const mo = mot[j] - 0.5;
    let m = 1 + mo * 2 * o.mottle + w * 2 * o.speck;
    let hh = (bmp[j] - 0.5) * 2 * o.bump + w * 2 * o.grit - o.bevelDepth * q + lift[k] + lx[i] * tx[k] + ly[i] * ty[k];
    if (pit) {
      const p = pit[j] - pitLevel;
      if (p > 0) {
        const pp = p > 0.08 ? 1 : p / 0.08;
        m *= 1 - 0.14 * pp;
        hh -= pitDepth * pp;
      }
    }
    if (gp < aoW) {
      const u = 1 - gp / aoW;
      m *= 1 - ao * u * u;
    }
    if (bulge) hh += (bulge * gp) / (gp + bulgeW);
    let r = cr[k] * m;
    let gg = cg[k] * m;
    let b = cb[k] * m;
    if (veinF) {
      const v = 1 - Math.abs(veinF[j] - 0.5) / 0.018;
      if (v > 0) {
        const a = v * o.veins!.amount;
        r += (veinC[0] * m - r) * a;
        gg += (veinC[1] * m - gg) * a;
        b += (veinC[2] * m - b) * a;
      }
    }
    if (stainF) {
      let a = (stainF[i] - 0.52) / 0.2;
      if (a > 0) {
        a = (a > 1 ? 1 : a) * o.stain!.amount * (0.6 + 0.8 * (bmp[j] > 0.5 ? 1 : bmp[j] * 2));
        r += (stainC[0] - r) * a;
        gg += (stainC[1] - gg) * a;
        b += (stainC[2] - b) * a;
      }
    }
    const mm = 1 + w * 0.22 + (mot[i] - 0.5) * 0.14;
    const keep = 1 - gf;
    const o4 = i * 4;
    rgba[o4] = r * keep + mortar[0] * mm * gf;
    rgba[o4 + 1] = gg * keep + mortar[1] * mm * gf;
    rgba[o4 + 2] = b * keep + mortar[2] * mm * gf;
    height[i] = hh * keep + (w * 0.9 + (bmp[i] - 0.5) * 0.8 - o.mortarDepth) * gf;
    rough[i] = (o.rough + mo * 0.12) * keep + o.roughMortar * gf;
  }
}

function jitter(c: RGB, rng: Rng, light: number, hue = 0): RGB {
  const l = 1 + (rng() * 2 - 1) * light;
  const h = (rng() * 2 - 1) * hue;
  return [c[0] * l * (1 + h), c[1] * l, c[2] * l * (1 - h)];
}

export interface BrickLook {
  seed: number;
  palette: string[];
  weights?: number[];
  light: number;
  mortar: string;
  /** old / reclaimed brickwork: chipped edges and pale stains */
  rustic?: boolean;
  /** painted over: uniform color, softened relief */
  painted?: boolean;
}

export const BRICK_RED: BrickLook = {
  seed: 2101,
  palette: ['#9a4833', '#a55038', '#8c402e', '#ad5a40', '#9d4d3a', '#7c382a', '#b4654a'],
  weights: [3, 3, 2, 2, 2, 1, 1],
  light: 0.06,
  mortar: '#a39b8e',
};

export const BRICK_GREY: BrickLook = {
  seed: 2202,
  palette: ['#8b8985', '#989691', '#7d7b78', '#a3a19c', '#84827d', '#6f6e6b'],
  weights: [3, 3, 2, 2, 2, 1],
  light: 0.05,
  mortar: '#c6c3bc',
};

export const BRICK_EXPOSED: BrickLook = {
  seed: 2303,
  palette: ['#a3533a', '#b36748', '#8c4531', '#be7855', '#985843', '#783e2f', '#b78868', '#6a3a2e'],
  weights: [3, 3, 2, 2, 2, 1.5, 1.2, 0.8],
  light: 0.1,
  mortar: '#cdc4b4',
  rustic: true,
};

export const BRICK_WHITE: BrickLook = {
  seed: 2404,
  palette: ['#ecE9e2', '#e8e5de', '#f0ede6'],
  light: 0.015,
  mortar: '#e2dfd8',
  painted: true,
};

/** stretcher-bond brickwork: 21 x 6.5 cm bricks, 1 cm joints */
export function brickWall(n: number, w: number, h: number, look: BrickLook): Surface {
  const s = newSurface(n, w, h);
  const cols = Math.round(w / 0.22);
  const rows = Math.round(h / 0.075);
  const palette = look.palette.map(hexToRgb);
  const cm = rasterRects(n, w, h, bondLayout(w, h, cols, rows, 0.5), 0.002);
  shadeMasonry(s, cm, {
    seed: look.seed,
    color: (_k, rng) => jitter(pick(rng, palette, look.weights), rng, look.light, look.painted ? 0 : 0.02),
    mortar: look.mortar,
    mortarW: 10,
    mortarDepth: look.painted ? 2 : 3,
    bevel: look.rustic ? 4 : 2.5,
    bevelDepth: look.rustic ? 1.8 : 1.2,
    edgeNoise: look.rustic ? 2.6 : look.painted ? 1.2 : 1.5,
    mottle: look.painted ? 0.03 : look.rustic ? 0.16 : 0.11,
    mottleSize: 0.05,
    speck: look.painted ? 0.02 : 0.07,
    bump: look.rustic ? 0.9 : look.painted ? 0.4 : 0.6,
    bumpSize: 0.03,
    grit: look.painted ? 0.12 : 0.35,
    pits: look.painted ? 0.03 : 0.1,
    pitDepth: 0.7,
    offset: look.rustic ? 1.2 : 0.6,
    tilt: 0.01,
    ao: look.painted ? 0.1 : 0.16,
    aoW: 5,
    stain: look.rustic ? { color: '#d6cdbf', amount: 0.26, size: 0.3 } : undefined,
    rough: look.painted ? 0.72 : 0.88,
    roughMortar: look.painted ? 0.78 : 0.96,
  });
  return s;
}

/**
 * Jerusalem stone: coursed ashlar of pale golden limestone with mixed course heights.
 * `rough` = false: fine chiselled ("taltish") faces; true: rock-faced ("tubza") blocks.
 */
export function jerusalemStone(n: number, w: number, h: number, rockFace: boolean): Surface {
  const s = newSurface(n, w, h);
  const seed = rockFace ? 2606 : 2505;
  const rng = mulberry32(seed);
  // course heights 20-35 cm that add up exactly to the tile height
  const pattern = [0.3, 0.25, 0.2, 0.3, 0.25, 0.3, 0.2, 0.25, 0.35];
  const heights: number[] = [];
  let sum = 0;
  for (let i = 0; sum < h - 0.19; i++) {
    const c = pattern[i % pattern.length];
    heights.push(c);
    sum += c;
  }
  const scale = h / sum;
  for (let i = 0; i < heights.length; i++) heights[i] *= scale;
  const rects = courseLayout(w, heights, 0.3, 0.68, rng, 0.09);
  const cm = rasterRects(n, w, h, rects, 0.004);
  const palette = ['#dfcda6', '#d5bc8b', '#e7dabd', '#d9c19c', '#cfbd9a', '#e2d0aa', '#c9ad80', '#dcc7a6'].map(hexToRgb);
  const weights = [4, 3, 3, 2, 2, 3, 1.2, 2];
  shadeMasonry(s, cm, {
    seed,
    color: (_k, r) => jitter(pick(r, palette, weights), r, 0.045, 0.012),
    mortar: '#b5a88f',
    mortarW: rockFace ? 12 : 8,
    mortarDepth: rockFace ? 7 : 4,
    bevel: rockFace ? 8 : 4,
    bevelDepth: rockFace ? 3 : 1.4,
    edgeNoise: rockFace ? 4 : 1.6,
    edgeNoiseSize: rockFace ? 0.05 : 0.03,
    mottle: 0.1,
    mottleSize: 0.12,
    speck: 0.045,
    bump: rockFace ? 7 : 1.1,
    bumpSize: rockFace ? 0.09 : 0.06,
    grit: rockFace ? 0.5 : 0.3,
    pits: rockFace ? 0.1 : 0.2,
    pitDepth: rockFace ? 1.2 : 0.8,
    bulge: rockFace ? 14 : 2.2,
    bulgeW: rockFace ? 22 : 12,
    offset: rockFace ? 2.5 : 0.8,
    tilt: 0.006,
    ao: rockFace ? 0.3 : 0.2,
    aoW: rockFace ? 16 : 9,
    veins: { color: '#c4985a', amount: 0.3, size: 0.25 },
    stain: { color: '#efe5cf', amount: 0.1, size: 0.6 },
    rough: 0.86,
    roughMortar: 0.96,
  });
  return s;
}

/** grey interlocking concrete pavers, 10 x 20 cm in herringbone */
export function concretePavers(n: number, w: number, h: number): Surface {
  const s = newSurface(n, w, h);
  const palette = ['#9a9995', '#8f8e8a', '#a5a39e', '#878683', '#9c968c'].map(hexToRgb);
  const cm = rasterRects(n, w, h, herringboneLayout(w, 0.1, 2), 0.004);
  shadeMasonry(s, cm, {
    seed: 2707,
    color: (_k, rng) => jitter(pick(rng, palette), rng, 0.05, 0.01),
    mortar: '#615c54',
    mortarW: 3.5,
    mortarDepth: 4,
    bevel: 4,
    bevelDepth: 2.2,
    edgeNoise: 0.6,
    mottle: 0.08,
    mottleSize: 0.08,
    speck: 0.09,
    bump: 0.4,
    bumpSize: 0.02,
    grit: 0.35,
    pits: 0.08,
    pitDepth: 0.6,
    offset: 0.8,
    tilt: 0.008,
    ao: 0.2,
    aoW: 5,
    stain: { color: '#6f6d68', amount: 0.1, size: 0.3 },
    rough: 0.9,
    roughMortar: 0.97,
  });
  return s;
}

/** granite setts (about 10 cm) with rounded, worn tops in sandy joints */
export function cobblestone(n: number, w: number, h: number): Surface {
  const s = newSurface(n, w, h);
  const seed = 2808;
  const rows = Math.round(h / 0.105);
  const heights = new Array<number>(rows).fill(h / rows);
  const rects = courseLayout(w, heights, 0.085, 0.15, mulberry32(seed), 0.03);
  const cm = rasterRects(n, w, h, rects, 0.016);
  const palette = ['#8b8985', '#9a978f', '#7b7976', '#a29d93', '#8f8679', '#76716b', '#a89f8e'].map(hexToRgb);
  shadeMasonry(s, cm, {
    seed,
    color: (_k, rng) => jitter(pick(rng, palette), rng, 0.05, 0.012),
    mortar: '#57503f',
    mortarW: 9,
    mortarDepth: 6,
    bevel: 10,
    bevelDepth: 3,
    edgeNoise: 2.5,
    edgeNoiseSize: 0.04,
    mottle: 0.1,
    mottleSize: 0.05,
    speck: 0.12,
    bump: 1.2,
    bumpSize: 0.04,
    grit: 0.3,
    pits: 0.06,
    pitDepth: 0.8,
    bulge: 5,
    bulgeW: 14,
    offset: 1.5,
    tilt: 0.02,
    ao: 0.3,
    aoW: 10,
    rough: 0.72,
    roughMortar: 0.97,
  });
  return s;
}
