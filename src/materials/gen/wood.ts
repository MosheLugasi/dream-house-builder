import {
  type RectCell,
  type Surface,
  courseLayout,
  fbm,
  herringboneLayout,
  hexToRgb,
  makeRamp,
  mulberry32,
  newSurface,
  rasterRects,
} from '../textureGen';

/** look of one wood species / finish */
export interface WoodLook {
  /** color ramp: 0 = darkest grain line, 1 = lightest wood */
  ramp: ReadonlyArray<readonly [number, string]>;
  /** per-board lightness variation, e.g. 0.08 = +-8% */
  tone: number;
  /** per-board warm/cool variation */
  hue: number;
  /** growth rings per meter across the board */
  ringsPerM: number;
  /** how much the rings wander (in rings) -> cathedral patterns */
  warp: number;
  /** contrast of ring lines / long streaks / fine fibres (0..1) */
  ring: number;
  streak: number;
  fiber: number;
  /** knots per square meter */
  knots: number;
  /** grain relief in mm */
  relief: number;
  /** base roughness */
  rough: number;
}

export interface BoardOpts {
  seed: number;
  /** joint (dark line) full width, mm */
  gap: number;
  gapDepth: number;
  gapColor: string;
  /** rounded / bevelled arris width and depth, mm */
  bevel: number;
  bevelDepth: number;
  roughGap?: number;
  /** lap siding: each board leans out by this many mm from top to bottom */
  lap?: number;
}

export const OAK: WoodLook = {
  ramp: [
    [0, '#84603a'],
    [0.38, '#ad8854'],
    [0.62, '#c09c68'],
    [1, '#d6b888'],
  ],
  tone: 0.09,
  hue: 0.03,
  ringsPerM: 42,
  warp: 9,
  ring: 0.3,
  streak: 0.34,
  fiber: 0.1,
  knots: 0.5,
  relief: 0.22,
  rough: 0.5,
};

export const WALNUT: WoodLook = {
  ramp: [
    [0, '#2a1c13'],
    [0.38, '#4f3624'],
    [0.62, '#684830'],
    [1, '#8c6645'],
  ],
  tone: 0.14,
  hue: 0.04,
  ringsPerM: 36,
  warp: 8,
  ring: 0.26,
  streak: 0.42,
  fiber: 0.1,
  knots: 0.3,
  relief: 0.18,
  rough: 0.42,
};

export const GREYWASH: WoodLook = {
  ramp: [
    [0, '#857e73'],
    [0.38, '#a59e92'],
    [0.62, '#bab4a8'],
    [1, '#d7d2c7'],
  ],
  tone: 0.07,
  hue: 0.015,
  ringsPerM: 42,
  warp: 9,
  ring: 0.3,
  streak: 0.36,
  fiber: 0.12,
  knots: 0.6,
  relief: 0.3,
  rough: 0.62,
};

export const MAPLE: WoodLook = {
  ramp: [
    [0, '#c2a070'],
    [0.38, '#d9bd92'],
    [0.62, '#e4cda6'],
    [1, '#f0dfc0'],
  ],
  tone: 0.06,
  hue: 0.025,
  ringsPerM: 30,
  warp: 7,
  ring: 0.2,
  streak: 0.26,
  fiber: 0.07,
  knots: 0.15,
  relief: 0.12,
  rough: 0.38,
};

export const DECK_WOOD: WoodLook = {
  ramp: [
    [0, '#46301f'],
    [0.38, '#6f4f37'],
    [0.62, '#866347'],
    [1, '#a8845f'],
  ],
  tone: 0.1,
  hue: 0.03,
  ringsPerM: 40,
  warp: 4.5,
  ring: 0.26,
  streak: 0.46,
  fiber: 0.16,
  knots: 0.3,
  relief: 0.45,
  rough: 0.78,
};

export const CEDAR: WoodLook = {
  ramp: [
    [0, '#74492a'],
    [0.38, '#a16c3e'],
    [0.62, '#b78150'],
    [1, '#d3a26e'],
  ],
  tone: 0.1,
  hue: 0.04,
  ringsPerM: 40,
  warp: 5,
  ring: 0.26,
  streak: 0.42,
  fiber: 0.14,
  knots: 0.5,
  relief: 0.4,
  rough: 0.7,
};

export const SLAT_OAK: WoodLook = {
  ...OAK,
  ramp: [
    [0, '#8a6238'],
    [0.38, '#b38a55'],
    [0.62, '#c69f69'],
    [1, '#dbbd8b'],
  ],
  tone: 0.07,
  knots: 0.2,
  rough: 0.55,
};

/**
 * Tileable grain field (0 = dark grain line .. 1 = light wood) with the grain running along X.
 * Boards sample it with individual offsets so every board gets its own figure.
 */
export function woodGrain(n: number, tw: number, th: number, seed: number, look: WoodLook): Float32Array {
  const rng = mulberry32(seed);
  const warp = fbm(n, Math.max(1, Math.round(tw / 1.5)), Math.max(2, Math.round(th / 0.12)), 2, seed + 11);
  // some regions are straight grained (quarter sawn), others show cathedral figure
  const figure = fbm(n, Math.max(1, Math.round(tw / 1.2)), Math.max(2, Math.round(th / 0.3)), 2, seed + 17);
  const streak = fbm(
    n,
    Math.max(2, Math.round(tw / 0.5)),
    Math.max(8, Math.round(th / 0.011)),
    3,
    seed + 23,
    0.62,
  );
  const fiber = fbm(n, Math.max(4, Math.round(tw / 0.035)), n, 1, seed + 37);
  const rings = Math.max(4, Math.round(look.ringsPerM * th));
  const phase = new Float32Array(n * n);
  const dark = new Float32Array(n * n);
  for (let y = 0; y < n; y++) {
    const base = (rings * y) / n;
    const o = y * n;
    for (let x = 0; x < n; x++) {
      const f = figure[o + x];
      phase[o + x] = base + look.warp * (0.2 + 1.6 * f * f) * warp[o + x];
    }
  }
  // knots: a bump in the ring phase makes the rings flow around an "eye"
  const mask = n - 1;
  const knots = Math.round(look.knots * tw * th + rng() * 0.99);
  for (let k = 0; k < knots; k++) {
    const kx = rng() * n;
    const ky = rng() * n;
    const size = 0.012 + rng() * 0.014; // m
    const ay = (size * n) / th;
    const ax = ((size * (1.6 + rng())) * n) / tw;
    const amp = (2.5 + rng() * 2.5) * (rng() < 0.5 ? 1 : -1);
    const rx = Math.ceil(ax * 3);
    const ry = Math.ceil(ay * 3);
    for (let dy = -ry; dy <= ry; dy++) {
      const o = ((Math.round(ky) + dy) & mask) * n;
      const ey = (dy * dy) / (ay * ay);
      for (let dx = -rx; dx <= rx; dx++) {
        const e = Math.exp(-((dx * dx) / (ax * ax) + ey));
        const i = o + ((Math.round(kx) + dx) & mask);
        phase[i] += amp * e;
        dark[i] += e * e * e * e;
      }
    }
  }
  const out = new Float32Array(n * n);
  for (let i = 0; i < out.length; i++) {
    const p = phase[i];
    const f = p - Math.floor(p);
    // slow darkening through the ring, sharp return: early wood -> late wood
    const line = f < 0.78 ? (f / 0.78) * (f / 0.78) : 1 - (f - 0.78) / 0.22;
    out[i] =
      0.6 +
      look.streak * (streak[i] - 0.5) * 2 -
      look.ring * (line - 0.3) +
      look.fiber * (fiber[i] - 0.5) * 2 -
      dark[i] * 0.45;
  }
  return out;
}

/** shade a board layout (planks, parquet blocks, slats, siding ...) */
export function woodSurface(
  n: number,
  tw: number,
  th: number,
  rects: readonly RectCell[],
  look: WoodLook,
  o: BoardOpts,
): Surface {
  const s = newSurface(n, tw, th);
  const cm = rasterRects(n, tw, th, rects);
  const grain = woodGrain(n, tw, th, o.seed, look);
  const ramp = makeRamp(look.ramp);
  const rng = mulberry32(o.seed ^ 0x51ed);
  const count = rects.length;
  const ox = new Int32Array(count);
  const oy = new Int32Array(count);
  const vert = new Uint8Array(count);
  const tr = new Float32Array(count);
  const tg = new Float32Array(count);
  const tb = new Float32Array(count);
  const shift = new Float32Array(count);
  const invH = new Float32Array(count);
  for (let k = 0; k < count; k++) {
    ox[k] = Math.floor(rng() * n);
    oy[k] = Math.floor(rng() * n);
    vert[k] = rects[k].vert ? 1 : 0;
    const tone = 1 + (rng() * 2 - 1) * look.tone;
    const hue = (rng() * 2 - 1) * look.hue;
    tr[k] = tone * (1 + hue);
    tg[k] = tone;
    tb[k] = tone * (1 - hue * 1.6);
    shift[k] = (rng() * 2 - 1) * 0.08;
    invH[k] = 1 / rects[k].h;
  }
  const gapRgb = hexToRgb(o.gapColor);
  const half = o.gap / 2;
  const pxmm = ((tw + th) * 500) / n;
  const aa = Math.max(0.3, 0.6 * pxmm);
  const roughGap = o.roughGap ?? 0.95;
  const lap = o.lap ?? 0;
  const mask = n - 1;
  const { id, edge, ly } = cm;
  const { rgba, height, rough } = s;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      const k = id[i];
      const gi = vert[k]
        ? ((x + ox[k]) & mask) * n + ((y + oy[k]) & mask)
        : ((y + oy[k]) & mask) * n + ((x + ox[k]) & mask);
      let t = grain[gi] + shift[k];
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const g = edge[i] - half;
      const gf = g <= -aa ? 1 : g >= aa ? 0 : 0.5 - g / (2 * aa);
      let bev = 0;
      if (g < o.bevel) {
        const q = 1 - (g > 0 ? g : 0) / o.bevel;
        bev = q * q;
      }
      let shade = 1 - 0.22 * bev;
      let hh = (t - 0.5) * look.relief - bev * o.bevelDepth;
      if (lap > 0) {
        const v = ly[i] * invH[k] + 0.5; // 0 top .. 1 bottom
        hh += lap * v;
        // contact shadow under the board above
        const sh = 1 - v * rects[k].h * 1000 * 0.07;
        if (sh > 0) shade *= 1 - 0.42 * sh * sh;
      }
      const li = ((t * 255) | 0) * 3;
      const keep = (1 - gf) * shade;
      const o4 = i * 4;
      rgba[o4] = ramp[li] * tr[k] * keep + gapRgb[0] * gf;
      rgba[o4 + 1] = ramp[li + 1] * tg[k] * keep + gapRgb[1] * gf;
      rgba[o4 + 2] = ramp[li + 2] * tb[k] * keep + gapRgb[2] * gf;
      height[i] = hh * (1 - gf) - o.gapDepth * gf;
      rough[i] = (look.rough + (0.5 - t) * 0.22) * (1 - gf) + roughGap * gf;
    }
  }
  return s;
}

// ---------------------------------------------------------------------------------------------
// finishes
// ---------------------------------------------------------------------------------------------

/** strip floor: boards of width `bw` running along X with random lengths */
export function plankFloor(
  n: number,
  w: number,
  h: number,
  look: WoodLook,
  seed: number,
  bw: number,
  lenMin: number,
  lenMax: number,
): Surface {
  const rows = Math.max(1, Math.round(h / bw));
  const heights = new Array<number>(rows).fill(h / rows);
  const rects = courseLayout(w, heights, lenMin, lenMax, mulberry32(seed), 0.2);
  return woodSurface(n, w, h, rects, look, {
    seed,
    gap: 0.7,
    gapDepth: 1.2,
    gapColor: '#2a1c12',
    bevel: 1.6,
    bevelDepth: 0.5,
  });
}

/** herringbone parquet (generate axis aligned, the material rotates the texture by 45 deg) */
export function herringboneFloor(n: number, w: number, h: number, look: WoodLook, seed: number): Surface {
  const k = 5;
  const bw = w / (2 * k * 2); // two periods per tile
  const rects = herringboneLayout(w, bw, k);
  return woodSurface(n, w, h, rects, look, {
    seed,
    gap: 0.6,
    gapDepth: 1.0,
    gapColor: '#2a1c12',
    bevel: 1.2,
    bevelDepth: 0.4,
  });
}

/** outdoor decking: boards along X with open 5 mm gaps and rounded edges */
export function deckBoards(n: number, w: number, h: number, seed: number): Surface {
  const rows = Math.round(h / 0.145);
  const heights = new Array<number>(rows).fill(h / rows);
  const rects = courseLayout(w, heights, 1.6, 3.2, mulberry32(seed), 0.3);
  return woodSurface(n, w, h, rects, DECK_WOOD, {
    seed,
    gap: 5,
    gapDepth: 6,
    gapColor: '#120c08',
    bevel: 5,
    bevelDepth: 1.6,
    roughGap: 1,
  });
}

/** vertical slat wall: 30 mm oak slats on black felt, 45 mm pitch */
export function slatWall(n: number, w: number, h: number, seed: number): Surface {
  const cols = Math.round(w / 0.045);
  const pitch = w / cols;
  const rects: RectCell[] = [];
  for (let c = 0; c < cols; c++) rects.push({ x: c * pitch, y: 0, w: pitch, h, vert: true, openY: true });
  return woodSurface(n, w, h, rects, SLAT_OAK, {
    seed,
    gap: 15,
    gapDepth: 9,
    gapColor: '#141312',
    bevel: 2.5,
    bevelDepth: 1.2,
    roughGap: 1,
  });
}

/** horizontal lap siding */
export function lapSiding(n: number, w: number, h: number, seed: number): Surface {
  const rows = Math.round(h / 0.15);
  const heights = new Array<number>(rows).fill(h / rows);
  const rects = courseLayout(w, heights, 1.8, 3.6, mulberry32(seed), 0.3);
  return woodSurface(n, w, h, rects, CEDAR, {
    seed,
    gap: 0.8,
    gapDepth: 2,
    gapColor: '#1c120a',
    bevel: 1.5,
    bevelDepth: 0.6,
    lap: 9,
  });
}
