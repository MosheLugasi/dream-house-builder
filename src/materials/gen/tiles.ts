import {
  type CellMap,
  type RGB,
  type Rng,
  type Surface,
  bondLayout,
  drawingContext,
  drawWrapped,
  fbm,
  hexCells,
  hexToRgb,
  mulberry32,
  newSurface,
  pick,
  rasterRects,
  whiteNoise,
} from '../textureGen';

export interface TileOpts {
  seed: number;
  /** base color of cell k */
  color: (k: number, rng: Rng) => RGB;
  grout: string;
  /** joint width / recess, mm */
  groutW: number;
  groutDepth: number;
  /** rounded (pillowed) edge: width and drop, mm */
  round: number;
  roundDepth: number;
  /** random per-tile tilt (slope, e.g. 0.01 = 1 cm per m) -> every tile reflects differently */
  tilt?: number;
  /** glaze / surface waviness: amplitude mm and feature size m */
  wave?: number;
  waveSize?: number;
  /** cloudy color variation (+-fraction) and its feature size in m */
  mottle?: number;
  mottleSize?: number;
  /** each tile samples the mottle noise at its own offset */
  mottlePerTile?: boolean;
  /** per-pixel speckle (+-fraction) */
  speck?: number;
  /** irregular (hand made) edges, mm */
  edgeNoise?: number;
  /** darkening towards the edge (>0) or lightening (<0) */
  edgeShade?: number;
  rough: number;
  roughGrout: number;
  /** roughness variation (+-) following the wave/mottle noise */
  roughVar?: number;
}

/** shade any cell map as glazed / fired tiles with grout joints */
export function shadeTiles(s: Surface, cm: CellMap, o: TileOpts): void {
  const { n } = s;
  const rng = mulberry32(o.seed);
  const count = cm.count;
  const cr = new Float32Array(count);
  const cg = new Float32Array(count);
  const cb = new Float32Array(count);
  const tx = new Float32Array(count);
  const ty = new Float32Array(count);
  const off = new Int32Array(count);
  const tilt = (o.tilt ?? 0) * 1000;
  for (let k = 0; k < count; k++) {
    const c = o.color(k, rng);
    cr[k] = c[0];
    cg[k] = c[1];
    cb[k] = c[2];
    tx[k] = (rng() * 2 - 1) * tilt;
    ty[k] = (rng() * 2 - 1) * tilt;
    off[k] = o.mottlePerTile ? Math.floor(rng() * n * n) : 0;
  }
  const size = (s.w + s.h) / 2;
  const mot = o.mottle ? fbm(n, size / (o.mottleSize ?? 0.3), size / (o.mottleSize ?? 0.3), 4, o.seed + 5) : null;
  const wav = o.wave || o.roughVar ? fbm(n, size / (o.waveSize ?? 0.2), size / (o.waveSize ?? 0.2), 3, o.seed + 9) : null;
  const en = o.edgeNoise ? fbm(n, size / 0.03, size / 0.03, 2, o.seed + 13) : null;
  const wn = whiteNoise(n, o.seed + 17);
  const grout = hexToRgb(o.grout);
  const half = o.groutW / 2;
  const pxmm = (size * 1000) / n;
  const aa = Math.max(0.3, 0.6 * pxmm);
  const mottle = o.mottle ?? 0;
  const speck = o.speck ?? 0;
  const wave = o.wave ?? 0;
  const roughVar = o.roughVar ?? 0;
  const edgeShade = o.edgeShade ?? 0.06;
  const edgeNoise = o.edgeNoise ?? 0;
  const { id, edge, lx, ly } = cm;
  const { rgba, height, rough } = s;
  const total = n * n;
  const mask = total - 1;
  for (let i = 0; i < total; i++) {
    const k = id[i];
    let d = edge[i];
    if (en) d += (en[i] - 0.5) * 2 * edgeNoise;
    const g = d - half;
    const gf = g <= -aa ? 1 : g >= aa ? 0 : 0.5 - g / (2 * aa);
    let q = 0;
    if (g < o.round) {
      const u = 1 - (g > 0 ? g : 0) / o.round;
      q = u * u;
    }
    const w = wn[i] - 0.5;
    let m = 1 + w * 2 * speck;
    if (mot) m += (mot[(i + off[k]) & mask] - 0.5) * 2 * mottle;
    m *= 1 - edgeShade * q;
    const wv = wav ? wav[i] - 0.5 : 0;
    const face = -o.roundDepth * q + lx[i] * tx[k] + ly[i] * ty[k] + wv * 2 * wave;
    const gm = 1 + w * 0.14;
    const keep = 1 - gf;
    const o4 = i * 4;
    rgba[o4] = cr[k] * m * keep + grout[0] * gm * gf;
    rgba[o4 + 1] = cg[k] * m * keep + grout[1] * gm * gf;
    rgba[o4 + 2] = cb[k] * m * keep + grout[2] * gm * gf;
    height[i] = face * keep + (w * 0.25 - o.groutDepth) * gf;
    rough[i] = (o.rough + wv * 2 * roughVar) * keep + o.roughGrout * gf;
  }
}

function jitter(c: RGB, rng: Rng, light: number, hue = 0): RGB {
  const l = 1 + (rng() * 2 - 1) * light;
  const h = (rng() * 2 - 1) * hue;
  return [c[0] * l * (1 + h), c[1] * l, c[2] * l * (1 - h)];
}

/** square tiles in a stacked grid; `cols` x `rows` tiles per texture */
function gridTiles(n: number, w: number, h: number, cols: number, rows: number, bond: number, o: TileOpts): Surface {
  const s = newSurface(n, w, h);
  shadeTiles(s, rasterRects(n, w, h, bondLayout(w, h, cols, rows, bond)), o);
  return s;
}

/** glossy white ceramic, 60 x 60 cm */
export function ceramicWhite(n: number, w: number, h: number): Surface {
  const base = hexToRgb('#eeece6');
  return gridTiles(n, w, h, Math.round(w / 0.6), Math.round(h / 0.6), 0, {
    seed: 1101,
    color: (_k, rng) => jitter(base, rng, 0.012, 0.004),
    grout: '#b3b0a9',
    groutW: 3,
    groutDepth: 1.2,
    round: 2.2,
    roundDepth: 0.7,
    tilt: 0.004,
    wave: 0.12,
    waveSize: 0.25,
    mottle: 0.012,
    mottleSize: 0.4,
    speck: 0.008,
    rough: 0.16,
    roughGrout: 0.9,
    roughVar: 0.04,
  });
}

/** matt grey porcelain stoneware, 60 x 60 cm */
export function porcelainGrey(n: number, w: number, h: number): Surface {
  const base = hexToRgb('#8f908d');
  return gridTiles(n, w, h, Math.round(w / 0.6), Math.round(h / 0.6), 0, {
    seed: 1202,
    color: (_k, rng) => jitter(base, rng, 0.035, 0.008),
    grout: '#63635f',
    groutW: 3,
    groutDepth: 1.2,
    round: 1.5,
    roundDepth: 0.5,
    tilt: 0.003,
    wave: 0.1,
    waveSize: 0.12,
    mottle: 0.045,
    mottleSize: 0.5,
    mottlePerTile: true,
    speck: 0.035,
    rough: 0.42,
    roughGrout: 0.92,
    roughVar: 0.1,
  });
}

/** black & white checkerboard, 30 x 30 cm */
export function checkerTiles(n: number, w: number, h: number): Surface {
  const cols = Math.round(w / 0.3);
  const rows = Math.round(h / 0.3);
  const white = hexToRgb('#ece8df');
  const black = hexToRgb('#1d1d20');
  return gridTiles(n, w, h, cols, rows, 0, {
    seed: 1303,
    color: (k, rng) => jitter(((k % cols) + Math.floor(k / cols)) % 2 ? black : white, rng, 0.02),
    grout: '#77746e',
    groutW: 2.4,
    groutDepth: 1,
    round: 2,
    roundDepth: 0.6,
    tilt: 0.005,
    wave: 0.1,
    waveSize: 0.2,
    mottle: 0.03,
    mottleSize: 0.2,
    speck: 0.01,
    rough: 0.14,
    roughGrout: 0.9,
    roughVar: 0.04,
  });
}

/** small white hexagon mosaic with grey joints */
export function hexTiles(n: number, w: number, h: number): Surface {
  const s = newSurface(n, w, h);
  const cols = Math.round(w / 0.1);
  const rows = Math.round(h / (0.1 * 0.8660254)) & ~1;
  const base = hexToRgb('#eceae4');
  shadeTiles(s, hexCells(n, w, h, cols, rows), {
    seed: 1404,
    color: (_k, rng) => jitter(base, rng, 0.03, 0.006),
    grout: '#85837e',
    groutW: 2.6,
    groutDepth: 1.2,
    round: 2,
    roundDepth: 0.7,
    tilt: 0.012,
    wave: 0.05,
    waveSize: 0.1,
    speck: 0.01,
    rough: 0.22,
    roughGrout: 0.92,
  });
  return s;
}

/** rustic terracotta, 30 x 30 cm with wide joints */
export function terracottaTiles(n: number, w: number, h: number): Surface {
  const palette = ['#b5633f', '#a85636', '#c0714a', '#b96a45', '#9e5033', '#c57b55'].map(hexToRgb);
  return gridTiles(n, w, h, Math.round(w / 0.3), Math.round(h / 0.3), 0, {
    seed: 1505,
    color: (_k, rng) => jitter(pick(rng, palette), rng, 0.06, 0.02),
    grout: '#c2b49e',
    groutW: 8,
    groutDepth: 2,
    round: 5,
    roundDepth: 1.6,
    tilt: 0.006,
    wave: 0.5,
    waveSize: 0.08,
    mottle: 0.12,
    mottleSize: 0.09,
    mottlePerTile: true,
    speck: 0.08,
    edgeNoise: 1.8,
    edgeShade: 0.18,
    rough: 0.72,
    roughGrout: 0.95,
    roughVar: 0.1,
  });
}

/** white glossy metro / subway tiles 7.5 x 15 cm in running bond */
export function subwayTiles(n: number, w: number, h: number): Surface {
  const base = hexToRgb('#f2f1ec');
  return gridTiles(n, w, h, Math.round(w / 0.15), Math.round(h / 0.075), 0.5, {
    seed: 1606,
    color: (_k, rng) => jitter(base, rng, 0.012, 0.004),
    grout: '#c4c1ba',
    groutW: 2.4,
    groutDepth: 1.3,
    round: 3,
    roundDepth: 1.0,
    tilt: 0.012,
    wave: 0.06,
    waveSize: 0.06,
    speck: 0.006,
    rough: 0.1,
    roughGrout: 0.9,
    roughVar: 0.03,
  });
}

/** hand made zellige-like tiles, 10 x 10 cm, sea green / teal glaze */
export function zelligeTiles(n: number, w: number, h: number): Surface {
  const palette = ['#2f7f79', '#34877f', '#2c7477', '#3b8f85', '#2a726c', '#419488', '#327c80', '#4a9a8d'].map(
    hexToRgb,
  );
  return gridTiles(n, w, h, Math.round(w / 0.1), Math.round(h / 0.1), 0, {
    seed: 1707,
    color: (_k, rng) => jitter(pick(rng, palette), rng, 0.07, 0.02),
    grout: '#bdb7a8',
    groutW: 1.6,
    groutDepth: 1.2,
    round: 3,
    roundDepth: 1.1,
    tilt: 0.03,
    wave: 0.3,
    waveSize: 0.035,
    mottle: 0.13,
    mottleSize: 0.06,
    mottlePerTile: true,
    speck: 0.03,
    edgeNoise: 1.4,
    edgeShade: -0.18,
    rough: 0.1,
    roughGrout: 0.9,
    roughVar: 0.05,
  });
}

/** polished white marble slabs (80 x 80 cm) with grey veining */
export function marbleWhite(n: number, w: number, h: number): Surface {
  const s = newSurface(n, w, h);
  const seed = 1808;
  const cols = Math.round(w / 0.8);
  const rows = Math.round(h / 0.8);
  const cm = rasterRects(n, w, h, bondLayout(w, h, cols, rows, 0));
  // veins = thin ridges of a warped diagonal wave (tileable: integer wave numbers);
  // fine turbulence makes them crumbly and feathered instead of smooth ribbons
  const warp = fbm(n, 2, 2, 4, seed + 1, 0.45);
  const warp2 = fbm(n, 3, 3, 4, seed + 2, 0.5);
  const fine = fbm(n, 28, 28, 4, seed + 6, 0.6);
  const c = fbm(n, 3, 3, 3, seed + 3);
  const cloud = fbm(n, 5, 5, 5, seed + 4, 0.6);
  const wn = whiteNoise(n, seed + 5);
  // vein intensity field (0 = clean white, 1 = dark vein)
  const vein = new Float32Array(n * n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      const m = c[i];
      const fi = fine[i];
      const p1 = (2 * x + 3 * y) / n + warp[i] * 3.2 + (fi - 0.5) * 0.16;
      const d1 = Math.abs(p1 - Math.round(p1));
      const core = d1 < 0.02 ? 1 - d1 / 0.02 : 0;
      const halo = d1 < 0.1 ? 1 - d1 / 0.1 : 0;
      // main veins fade in and out along their length and break up at small scale
      const fade = m < 0.3 ? 0 : m > 0.6 ? 1 : (m - 0.3) / 0.3;
      const v1 = (core * 0.5 + halo * halo * 0.28 * (0.4 + 1.2 * fi)) * (0.15 + 0.85 * fade);
      const p2 = (-5 * x + 3 * y) / n + warp2[i] * 4.5 + (fi - 0.5) * 0.25;
      const d2 = Math.abs(p2 - Math.round(p2));
      const v2 = d2 < 0.025 ? (1 - d2 / 0.025) * 0.26 * (1 - fade * 0.6) * (0.3 + 1.4 * fi) : 0;
      const cl = cloud[i] - 0.5;
      vein[i] = v1 + v2 + (cl > 0 ? cl * 0.45 : 0) + (fi - 0.5) * 0.05;
    }
  }
  const rng = mulberry32(seed);
  const off = new Int32Array(cm.count);
  const tone = new Float32Array(cm.count);
  const tx = new Float32Array(cm.count);
  const ty = new Float32Array(cm.count);
  for (let k = 0; k < cm.count; k++) {
    off[k] = Math.floor(rng() * n * n);
    tone[k] = 1 + (rng() * 2 - 1) * 0.015;
    tx[k] = (rng() * 2 - 1) * 2.5;
    ty[k] = (rng() * 2 - 1) * 2.5;
  }
  const white = hexToRgb('#f0eeea');
  const grey = hexToRgb('#7d838a');
  const warm = hexToRgb('#978f86');
  const grout = hexToRgb('#cfccc5');
  const pxmm = ((w + h) * 500) / n;
  const aa = Math.max(0.3, 0.6 * pxmm);
  const half = 0.8;
  const mask = n * n - 1;
  const { id, edge, lx, ly } = cm;
  const { rgba, height, rough } = s;
  for (let i = 0; i < n * n; i++) {
    const k = id[i];
    const j = (i + off[k]) & mask;
    let v = vein[j];
    v = v > 1 ? 1 : v < 0 ? 0 : v;
    const g = edge[i] - half;
    const gf = g <= -aa ? 1 : g >= aa ? 0 : 0.5 - g / (2 * aa);
    const q = g < 1.5 ? 1 - (g > 0 ? g : 0) / 1.5 : 0;
    const wm = c[j]; // warm/cool drift of the vein color
    const t = tone[k] * (1 + (wn[i] - 0.5) * 0.012);
    const keep = 1 - gf;
    const o4 = i * 4;
    rgba[o4] = (white[0] + ((grey[0] + (warm[0] - grey[0]) * wm) - white[0]) * v) * t * keep + grout[0] * gf;
    rgba[o4 + 1] = (white[1] + ((grey[1] + (warm[1] - grey[1]) * wm) - white[1]) * v) * t * keep + grout[1] * gf;
    rgba[o4 + 2] = (white[2] + ((grey[2] + (warm[2] - grey[2]) * wm) - white[2]) * v) * t * keep + grout[2] * gf;
    height[i] = (-0.3 * q * q + lx[i] * tx[k] + ly[i] * ty[k] - v * 0.02) * keep - 0.8 * gf;
    rough[i] = (0.07 + v * 0.05) * keep + 0.8 * gf;
  }
  return s;
}

/** light terrazzo with multi-coloured marble chips (seamless, cast in place) */
export function terrazzo(n: number, w: number, h: number): Surface {
  const s = newSurface(n, w, h);
  const seed = 1909;
  const rng = mulberry32(seed);
  const ctx = drawingContext(n, '#d8d2c6');
  const pxPerM = n / w;
  const colors = ['#f4f0e8', '#8d8983', '#b4684a', '#343231', '#c9a36c', '#70828a', '#e6d6bd', '#a79a8b'];
  const weights = [5, 3, 2, 1.6, 2, 1.4, 3, 2.5];
  const paths = colors.map(() => new Path2D());
  const chip = (path: Path2D, cx: number, cy: number, r: number) => {
    const sides = 4 + Math.floor(rng() * 3);
    const rot = rng() * Math.PI * 2;
    const squash = 0.55 + rng() * 0.45;
    const pts: Array<[number, number]> = [];
    for (let k = 0; k < sides; k++) {
      const a = rot + ((k + (rng() - 0.5) * 0.7) / sides) * Math.PI * 2;
      const rr = r * (0.7 + rng() * 0.5);
      const px = Math.cos(a) * rr;
      const py = Math.sin(a) * rr * squash;
      pts.push([px * Math.cos(rot) - py * Math.sin(rot), px * Math.sin(rot) + py * Math.cos(rot)]);
    }
    drawWrapped(n, cx, cy, r * 1.3, (dx, dy) => {
      path.moveTo(cx + dx + pts[0][0], cy + dy + pts[0][1]);
      for (let k = 1; k < pts.length; k++) path.lineTo(cx + dx + pts[k][0], cy + dy + pts[k][1]);
      path.closePath();
    });
  };
  const area = w * h;
  // small chips first, big ones on top
  const classes: Array<[number, number, number]> = [
    [5200, 0.0012, 0.003],
    [1500, 0.003, 0.006],
    [330, 0.006, 0.012],
  ];
  for (const [perM2, rMin, rMax] of classes) {
    const count = Math.round(perM2 * area);
    for (let k = 0; k < count; k++) {
      const ci = colors.indexOf(pick(rng, colors, weights));
      chip(paths[ci], rng() * n, rng() * n, (rMin + rng() * (rMax - rMin)) * pxPerM);
    }
    for (let ci = 0; ci < colors.length; ci++) {
      ctx.fillStyle = colors[ci];
      ctx.fill(paths[ci]);
      paths[ci] = new Path2D();
    }
  }
  const img = ctx.getImageData(0, 0, n, n).data;
  const mot = fbm(n, w / 0.5, h / 0.5, 3, seed + 3);
  const wn = whiteNoise(n, seed + 4);
  const { rgba, height, rough } = s;
  for (let i = 0; i < n * n; i++) {
    const o4 = i * 4;
    const m = 1 + (mot[i] - 0.5) * 0.06 + (wn[i] - 0.5) * 0.05;
    rgba[o4] = img[o4] * m;
    rgba[o4 + 1] = img[o4 + 1] * m;
    rgba[o4 + 2] = img[o4 + 2] * m;
    height[i] = (wn[i] - 0.5) * 0.03 + (mot[i] - 0.5) * 0.3;
    rough[i] = 0.2 + (mot[i] - 0.5) * 0.14;
  }
  return s;
}
