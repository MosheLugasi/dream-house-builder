import {
  type Surface,
  fbm,
  hexToRgb,
  mulberry32,
  newSurface,
  voronoiCells,
  whiteNoise,
} from '../textureGen';

// ---------------------------------------------------------------------------------------------
// grass
// ---------------------------------------------------------------------------------------------

export interface GrassLook {
  seed: number;
  /** color seen between the blades */
  base: string;
  /** blade colors (drawn in this order, later ones on top) and relative amounts */
  blades: string[];
  weights: number[];
  /** blade length range in m */
  lenMin: number;
  lenMax: number;
  /** strokes per pixel */
  density: number;
  /** 0..1: how much bare ground shows through in patches */
  bare: number;
  /** tint of sun-dried patches and its strength */
  dry: string;
  dryAmount: number;
}

export const LAWN: GrassLook = {
  seed: 5101,
  base: '#31551f',
  blades: ['#386524', '#44782a', '#508731', '#5e9537', '#70a440', '#85b34d', '#56742c', '#9cb35b'],
  weights: [3, 4, 5, 5, 4, 2, 1.5, 0.7],
  lenMin: 0.015,
  lenMax: 0.045,
  density: 0.085,
  bare: 0,
  dry: '#9c9a45',
  dryAmount: 0.14,
};

export const WILD_GRASS: GrassLook = {
  seed: 5202,
  base: '#7d6a45',
  blades: ['#7a7a3c', '#8f8a47', '#a89a55', '#bfae68', '#d3c486', '#93984a', '#6f7f39', '#e0d39c'],
  weights: [2, 3, 5, 5, 3, 2, 1.5, 1],
  lenMin: 0.02,
  lenMax: 0.07,
  density: 0.075,
  bare: 0.32,
  dry: '#c9b77a',
  dryAmount: 0.25,
};

/**
 * Grass: tens of thousands of short blade strokes over a darker ground, then modulated by
 * clump- and patch-scale noise so large areas never read as one flat green.
 */
export function grass(n: number, w: number, h: number, look: GrassLook): Surface {
  const s = newSurface(n, w, h);
  const rng = mulberry32(look.seed);
  const u = n / w;
  const mask = n - 1;
  const patch = fbm(n, w / 0.55, h / 0.55, 4, look.seed + 1);
  const clump = fbm(n, w / 0.14, h / 0.14, 3, look.seed + 2);
  const wn = whiteNoise(n, look.seed + 3);
  const { rgba, height } = s;
  const base = hexToRgb(look.base);
  for (let i = 0; i < n * n; i++) {
    const o4 = i * 4;
    rgba[o4] = base[0];
    rgba[o4 + 1] = base[1];
    rgba[o4 + 2] = base[2];
  }
  // rasterize the blades directly (1 px wide, darker at the root, lighter at the tip)
  const colors = look.blades.map(hexToRgb);
  let total = 0;
  for (const wt of look.weights) total += wt;
  const strokes = Math.round(look.density * n * n);
  for (let k = 0; k < strokes; k++) {
    const x = rng() * n;
    const y = rng() * n;
    let r = rng() * total;
    let ci = 0;
    for (; ci < colors.length - 1; ci++) {
      r -= look.weights[ci];
      if (r <= 0) break;
    }
    const a = rng() * Math.PI * 2;
    const len = Math.max(2.5, (look.lenMin + rng() * (look.lenMax - look.lenMin)) * u);
    if (look.bare > 0) {
      // thin the blades where the patch noise says "bare ground"
      const p = patch[(Math.floor(y) & mask) * n + (Math.floor(x) & mask)];
      if (rng() < (0.62 - p) * 4 * look.bare) continue;
    }
    const c = colors[ci];
    const steps = Math.ceil(len);
    const dx = (Math.cos(a) * len) / steps;
    const dy = (Math.sin(a) * len) / steps;
    for (let st = 0; st <= steps; st++) {
      const px = Math.floor(x + dx * st) & mask;
      const py = Math.floor(y + dy * st) & mask;
      const o4 = (py * n + px) * 4;
      const l = 0.78 + (0.4 * st) / steps;
      rgba[o4] = c[0] * l;
      rgba[o4 + 1] = c[1] * l;
      rgba[o4 + 2] = c[2] * l;
    }
  }
  const dry = hexToRgb(look.dry);
  for (let i = 0; i < n * n; i++) {
    const o4 = i * 4;
    const r = rgba[o4];
    const g = rgba[o4 + 1];
    const b = rgba[o4 + 2];
    const c = clump[i] - 0.5;
    const p = patch[i] - 0.5;
    const f = wn[i] - 0.5;
    let m = 0.94 + c * 0.42 + f * 0.14;
    // lush (darker) and sun-dried (yellower) patches
    let d = 0;
    if (p > 0) d = p * 2 * look.dryAmount;
    else m *= 1 + p * 0.12;
    rgba[o4] = (r + (dry[0] - r) * d) * m;
    rgba[o4 + 1] = (g + (dry[1] - g) * d) * m;
    rgba[o4 + 2] = (b + (dry[2] - b) * d) * m;
    height[i] = (g - 90) * 0.11 + c * 9 + f * 3;
  }
  s.uniformRough = 0.9;
  return s;
}

// ---------------------------------------------------------------------------------------------
// asphalt
// ---------------------------------------------------------------------------------------------

export function asphalt(n: number, w: number, h: number): Surface {
  const s = newSurface(n, w, h);
  const seed = 5303;
  const c = hexToRgb('#3d3d3f');
  const stone = hexToRgb('#8b8a86');
  const a1 = fbm(n, w / 0.005, h / 0.005, 2, seed + 1, 0.9);
  const a2 = fbm(n, w / 0.011, h / 0.011, 2, seed + 2, 0.6);
  const blot = fbm(n, w / 0.6, h / 0.6, 4, seed + 3);
  const wn = whiteNoise(n, seed + 4);
  const { rgba, height, rough } = s;
  for (let i = 0; i < n * n; i++) {
    const agg = a1[i] * 0.6 + a2[i] * 0.4;
    // exposed aggregate: bright where the combined noise peaks
    let st = (agg - 0.56) / 0.16;
    st = st < 0 ? 0 : st > 1 ? 1 : st;
    const b = blot[i] - 0.5;
    const f = wn[i] - 0.5;
    const m = 1 + b * 0.07 + f * 0.16 - (agg < 0.4 ? (0.4 - agg) * 1.2 : 0);
    const k = st * (0.26 + f * 0.3);
    const o4 = i * 4;
    rgba[o4] = (c[0] + (stone[0] - c[0]) * k) * m;
    rgba[o4 + 1] = (c[1] + (stone[1] - c[1]) * k) * m;
    rgba[o4 + 2] = (c[2] + (stone[2] - c[2]) * k) * m;
    height[i] = (agg - 0.5) * 3.2 + f * 0.5 + b * 1.5;
    rough[i] = 0.9 - st * 0.12 + f * 0.05;
  }
  return s;
}

// ---------------------------------------------------------------------------------------------
// pebbles (gravel, roof ballast)
// ---------------------------------------------------------------------------------------------

export interface PebbleLook {
  seed: number;
  /** average pebble size, m */
  size: number;
  palette: string[];
  weights: number[];
  /** color in the gaps between the stones */
  gap: string;
  /** dome height, mm */
  dome: number;
}

export const GRAVEL: PebbleLook = {
  seed: 5404,
  size: 0.019,
  palette: ['#b9b2a4', '#a39c8f', '#cfc8ba', '#8d877c', '#c2ad8f', '#9a8f80', '#e0dbd0', '#77726a', '#b3a089'],
  weights: [4, 4, 3, 3, 2, 2, 1.5, 1.5, 2],
  gap: '#3f3a33',
  dome: 7,
};

export const ROOF_BALLAST: PebbleLook = {
  seed: 5505,
  size: 0.016,
  palette: ['#c9c8c4', '#b7b6b2', '#d8d7d2', '#a5a4a0', '#c4c0b8', '#e3e2de', '#989793'],
  weights: [4, 4, 3, 2, 2, 2, 1],
  gap: '#5d5b57',
  dome: 5,
};

export function pebbles(n: number, w: number, h: number, look: PebbleLook): Surface {
  const s = newSurface(n, w, h);
  const cx = Math.max(4, Math.round(w / look.size));
  const cy = Math.max(4, Math.round(h / look.size));
  const cm = voronoiCells(n, w, h, cx, cy, 0.9, look.seed);
  const rng = mulberry32(look.seed + 1);
  const palette = look.palette.map(hexToRgb);
  let total = 0;
  for (const wt of look.weights) total += wt;
  const cr = new Float32Array(cm.count);
  const cg = new Float32Array(cm.count);
  const cb = new Float32Array(cm.count);
  const lift = new Float32Array(cm.count);
  const tx = new Float32Array(cm.count);
  const ty = new Float32Array(cm.count);
  for (let k = 0; k < cm.count; k++) {
    let r = rng() * total;
    let pi = 0;
    for (; pi < palette.length - 1; pi++) {
      r -= look.weights[pi];
      if (r <= 0) break;
    }
    const l = 0.9 + rng() * 0.2;
    cr[k] = palette[pi][0] * l;
    cg[k] = palette[pi][1] * l;
    cb[k] = palette[pi][2] * l;
    lift[k] = rng();
    tx[k] = (rng() * 2 - 1) * 250;
    ty[k] = (rng() * 2 - 1) * 250;
  }
  const gap = hexToRgb(look.gap);
  const wn = whiteNoise(n, look.seed + 2);
  const mot = fbm(n, w / 0.008, h / 0.008, 2, look.seed + 3);
  const reach = look.size * 1000 * 0.3;
  const radius = new Float32Array(cm.count);
  for (let k = 0; k < cm.count; k++) radius[k] = look.size * (0.42 + 0.3 * rng());
  const { id, edge, lx, ly } = cm;
  const { rgba, height, rough } = s;
  for (let i = 0; i < n * n; i++) {
    const k = id[i];
    // rounded stone: limited by the Voronoi cell and by its own radius
    const rk = radius[k];
    const f1 = Math.sqrt(lx[i] * lx[i] + ly[i] * ly[i]);
    let q = (edge[i] - 0.6) / reach;
    const q2 = (rk - f1) / (rk * 0.45);
    if (q2 < q) q = q2;
    q = q > 1 ? 1 : q;
    const f = wn[i] - 0.5;
    const o4 = i * 4;
    if (q <= 0) {
      // deeper layer seen between the stones
      const m = 0.75 + mot[i] * 0.6 + f * 0.2;
      rgba[o4] = gap[0] * m;
      rgba[o4 + 1] = gap[1] * m;
      rgba[o4 + 2] = gap[2] * m;
      height[i] = f * 0.6 + mot[i] * 1.5;
      rough[i] = 0.97;
      continue;
    }
    const dome = Math.sqrt(1 - (1 - q) * (1 - q));
    // stones lying deeper are darker (shadowed), tops catch the light
    const m = (0.42 + 0.58 * dome) * (0.74 + 0.36 * lift[k]) * (1 + f * 0.1 + (mot[i] - 0.5) * 0.16);
    rgba[o4] = cr[k] * m;
    rgba[o4 + 1] = cg[k] * m;
    rgba[o4 + 2] = cb[k] * m;
    height[i] = 1.5 + dome * look.dome * (0.55 + 0.45 * lift[k]) + lift[k] * 3 + (lx[i] * tx[k] + ly[i] * ty[k]) * q + f * 0.2;
    rough[i] = 0.8 + f * 0.06;
  }
  return s;
}

// ---------------------------------------------------------------------------------------------
// soil, sand, water
// ---------------------------------------------------------------------------------------------

export function soil(n: number, w: number, h: number): Surface {
  const s = newSurface(n, w, h);
  const seed = 5606;
  const c = hexToRgb('#5e4632');
  const lightC = hexToRgb('#8a6f55');
  const broad = fbm(n, w / 0.7, h / 0.7, 4, seed + 1);
  const clod = fbm(n, w / 0.035, h / 0.035, 4, seed + 2, 0.65);
  const crumb = fbm(n, w / 0.008, h / 0.008, 2, seed + 3, 0.8);
  const wn = whiteNoise(n, seed + 4);
  const { rgba, height } = s;
  for (let i = 0; i < n * n; i++) {
    const b = broad[i] - 0.5;
    const cl = clod[i] - 0.5;
    const cr = crumb[i] - 0.5;
    const f = wn[i] - 0.5;
    const m = 1 + b * 0.07 + cl * 0.3 + cr * 0.38 + f * 0.16;
    // dry crumbs on top are paler; a few tiny stones
    let k = (cl * 0.7 + cr * 0.6) * 1.6;
    k = k < 0 ? 0 : k > 0.6 ? 0.6 : k;
    const pebble = crumb[i] > 0.9 && clod[i] > 0.5 ? 0.6 : 0;
    const o4 = i * 4;
    rgba[o4] = (c[0] + (lightC[0] - c[0]) * k) * m + pebble * 70;
    rgba[o4 + 1] = (c[1] + (lightC[1] - c[1]) * k) * m + pebble * 66;
    rgba[o4 + 2] = (c[2] + (lightC[2] - c[2]) * k) * m + pebble * 58;
    height[i] = cl * 14 + cr * 4 + b * 8 + f * 1;
  }
  s.uniformRough = 0.96;
  return s;
}

export function sand(n: number, w: number, h: number): Surface {
  const s = newSurface(n, w, h);
  const seed = 5707;
  const c = hexToRgb('#dcc89f');
  const broad = fbm(n, w / 0.8, h / 0.8, 3, seed + 1);
  const warp = fbm(n, w / 0.5, h / 0.25, 3, seed + 2);
  const fine = fbm(n, w / 0.006, h / 0.006, 2, seed + 3, 0.8);
  const wn = whiteNoise(n, seed + 4);
  const ripples = Math.max(3, Math.round(h / 0.11));
  const { rgba, height } = s;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      const b = broad[i] - 0.5;
      const f = fine[i] - 0.5;
      const g = wn[i] - 0.5;
      // soft wind ripples that fade in and out
      const ph = (ripples * y) / n + warp[i] * 2.6;
      const rip = Math.sin(ph * Math.PI * 2) * (0.25 + broad[i] * 0.75);
      // individual darker / lighter grains
      const grain = wn[i] > 0.965 ? -0.22 : wn[i] < 0.03 ? 0.1 : 0;
      const m = 1 + b * 0.03 + f * 0.09 + g * 0.07 + grain + rip * 0.02;
      const o4 = i * 4;
      rgba[o4] = c[0] * m;
      rgba[o4 + 1] = c[1] * m;
      rgba[o4 + 2] = c[2] * (m - b * 0.03);
      height[i] = rip * 2.2 + b * 5 + f * 0.7 + g * 0.35;
    }
  }
  s.uniformRough = 0.95;
  return s;
}

/** calm water: bluish, glossy, gentle ripples in the normal map */
export function water(n: number, w: number, h: number): Surface {
  const s = newSurface(n, w, h);
  const seed = 5808;
  const deep = hexToRgb('#1f6f8f');
  const shallow = hexToRgb('#3f9bb5');
  const big = fbm(n, w / 0.8, h / 0.8, 3, seed + 1);
  const mid = fbm(n, w / 0.22, h / 0.3, 3, seed + 2);
  const small = fbm(n, w / 0.07, h / 0.07, 2, seed + 3);
  const { rgba, height } = s;
  for (let i = 0; i < n * n; i++) {
    const b = big[i];
    const m = mid[i] - 0.5;
    // faint caustic-like light network
    const net = 1 - Math.abs(mid[i] - 0.5) * 6;
    const k = b * 0.7 + (net > 0 ? net * 0.25 : 0);
    const o4 = i * 4;
    rgba[o4] = deep[0] + (shallow[0] - deep[0]) * k;
    rgba[o4 + 1] = deep[1] + (shallow[1] - deep[1]) * k;
    rgba[o4 + 2] = deep[2] + (shallow[2] - deep[2]) * k;
    height[i] = (b - 0.5) * 16 + m * 9 + (small[i] - 0.5) * 2.2;
  }
  s.uniformRough = 0.06;
  return s;
}
