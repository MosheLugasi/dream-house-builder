import * as THREE from 'three';

/**
 * Procedural texture toolkit.
 *
 * Conventions
 *  - every texture is a square power-of-two canvas (`n` x `n` px) covering a `w` x `h` METER tile
 *  - "fields" are Float32Array(n*n), row-major, canvas orientation (y grows downwards)
 *  - everything wraps: noise lattices, blurs, Sobel, rasterizers -> all results tile seamlessly
 *  - heights are in MILLIMETERS so normal maps get physically plausible slopes
 *
 * Nothing here touches the DOM at import time.
 */

// ---------------------------------------------------------------------------------------------
// small math helpers
// ---------------------------------------------------------------------------------------------

export type Rng = () => number;
export type RGB = [number, number, number];

/** fast seeded PRNG, returns [0,1) */
export function mulberry32(seed: number): Rng {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a string hash -> uint32 seed */
export function seedFromString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

export function hexToRgb(hex: string): RGB {
  let s = hex.trim().replace('#', '');
  if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  const v = parseInt(s, 16);
  if (s.length !== 6 || Number.isNaN(v)) return [204, 204, 204];
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (x: number) =>
    Math.max(0, Math.min(255, Math.round(x)))
      .toString(16)
      .padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

export function mixRgb(a: RGB, b: RGB, t: number): RGB {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

/** pick from a weighted palette */
export function pick<T>(rng: Rng, items: readonly T[], weights?: readonly number[]): T {
  if (!weights) return items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
  let total = 0;
  for (const w of weights) total += w;
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

/** 256-entry color lookup table (r,g,b floats 0..255) from gradient stops `[t, '#hex']` */
export function makeRamp(stops: ReadonlyArray<readonly [number, string]>): Float32Array {
  const lut = new Float32Array(256 * 3);
  const pts = stops.map(([t, c]) => ({ t, c: hexToRgb(c) })).sort((a, b) => a.t - b.t);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let k = 0;
    while (k < pts.length - 2 && t > pts[k + 1].t) k++;
    const a = pts[k];
    const b = pts[Math.min(k + 1, pts.length - 1)];
    const f = b.t > a.t ? clamp01((t - a.t) / (b.t - a.t)) : 0;
    lut[i * 3] = lerp(a.c[0], b.c[0], f);
    lut[i * 3 + 1] = lerp(a.c[1], b.c[1], f);
    lut[i * 3 + 2] = lerp(a.c[2], b.c[2], f);
  }
  return lut;
}

// ---------------------------------------------------------------------------------------------
// canvases
// ---------------------------------------------------------------------------------------------

export function createCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** 2D context configured for CPU read-back (used for vector-drawn patterns) */
export function drawingContext(n: number, fill?: string): CanvasRenderingContext2D {
  const ctx = createCanvas(n, n).getContext('2d', { willReadFrequently: true })!;
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, n, n);
  }
  return ctx;
}

export function canvasFromRGBA(data: Uint8ClampedArray<ArrayBuffer>, n: number): HTMLCanvasElement {
  const c = createCanvas(n, n);
  c.getContext('2d')!.putImageData(new ImageData(data, n, n), 0, 0);
  return c;
}

/**
 * Calls `draw(dx, dy)` for every wrapped copy of a shape centred at (x,y) with radius r (px)
 * that touches the n x n tile, so vector drawings tile seamlessly.
 */
export function drawWrapped(
  n: number,
  x: number,
  y: number,
  r: number,
  draw: (dx: number, dy: number) => void,
): void {
  for (let oy = -n; oy <= n; oy += n) {
    if (y + oy + r < 0 || y + oy - r > n) continue;
    for (let ox = -n; ox <= n; ox += n) {
      if (x + ox + r < 0 || x + ox - r > n) continue;
      draw(ox, oy);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// noise
// ---------------------------------------------------------------------------------------------

/**
 * Adds `amp * noise` to `out` (an `nx` x `ny` grid), where noise is tileable value noise in
 * [0,1] built on a `cx` x `cy` lattice (cells across the tile). cx == nx gives white noise.
 */
function addValueNoiseRect(
  out: Float32Array,
  nx: number,
  ny: number,
  cx: number,
  cy: number,
  seed: number,
  amp: number,
): void {
  cx = Math.max(1, Math.min(nx, Math.round(cx)));
  cy = Math.max(1, Math.min(ny, Math.round(cy)));
  const rng = mulberry32(seed);
  const lat = new Float32Array(cx * cy);
  for (let i = 0; i < lat.length; i++) lat[i] = rng() * amp;

  // per-column interpolation weight and, per lattice interval, the first pixel after it
  const xw = new Float32Array(nx);
  const spanEnd = new Int32Array(cx + 1);
  for (let x = 0; x < nx; x++) {
    const fx = ((x + 0.5) * cx) / nx - 0.5;
    const f = Math.floor(fx);
    const t = fx - f;
    xw[x] = t * t * (3 - 2 * t);
    spanEnd[f + 1] = x + 1;
  }
  const row = new Float32Array(cx + 1);
  for (let y = 0; y < ny; y++) {
    const fy = ((y + 0.5) * cy) / ny - 0.5;
    const f = Math.floor(fy);
    const t = fy - f;
    const wy = t * t * (3 - 2 * t);
    const j0 = ((f % cy) + cy) % cy;
    const r0 = j0 * cx;
    const r1 = ((j0 + 1) % cy) * cx;
    for (let c = 0; c < cx; c++) row[c] = lat[r0 + c] + (lat[r1 + c] - lat[r0 + c]) * wy;
    row[cx] = row[0];
    const o = y * nx;
    if (cx === nx) {
      for (let x = 0; x < nx; x++) out[o + x] += row[x];
      continue;
    }
    // lattice interval [k-1, k] (k = 0 is the wrapped interval before the first node)
    let x = 0;
    for (let k = 0; k <= cx; k++) {
      const a = k === 0 ? row[cx - 1] : row[k - 1];
      const d = row[k] - a;
      const end = spanEnd[k];
      for (; x < end; x++) out[o + x] += a + d * xw[x];
    }
  }
}

/** square version of {@link addValueNoiseRect}: adds `amp * noise` into an n x n field */
export function addValueNoise(
  out: Float32Array,
  n: number,
  cx: number,
  cy: number,
  seed: number,
  amp = 1,
): void {
  addValueNoiseRect(out, n, n, cx, cy, seed, amp);
}

export function valueNoise(n: number, cx: number, cy: number, seed: number): Float32Array {
  const out = new Float32Array(n * n);
  addValueNoise(out, n, cx, cy, seed, 1);
  return out;
}

/** rescale a field to exactly [0,1] */
export function normalize(f: Float32Array): Float32Array {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < f.length; i++) {
    const v = f[i];
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const k = hi > lo ? 1 / (hi - lo) : 0;
  for (let i = 0; i < f.length; i++) f[i] = (f[i] - lo) * k;
  return f;
}

/** wrapped bilinear upsampling of an `nx` x `ny` grid to `mx` x `my` (integer factors) */
function upsample(src: Float32Array, nx: number, ny: number, mx: number, my: number): Float32Array {
  if (nx === mx && ny === my) return src;
  let cur = src;
  if (nx !== mx) {
    const wide = new Float32Array(mx * ny);
    const i0 = new Int32Array(mx);
    const i1 = new Int32Array(mx);
    const w = new Float32Array(mx);
    for (let x = 0; x < mx; x++) {
      const fx = ((x + 0.5) * nx) / mx - 0.5;
      const f = Math.floor(fx);
      i0[x] = (f + nx) % nx;
      i1[x] = (f + 1 + nx) % nx;
      w[x] = fx - f;
    }
    for (let y = 0; y < ny; y++) {
      const so = y * nx;
      const o = y * mx;
      for (let x = 0; x < mx; x++) {
        const a = cur[so + i0[x]];
        wide[o + x] = a + (cur[so + i1[x]] - a) * w[x];
      }
    }
    cur = wide;
  }
  if (ny === my) return cur;
  const out = new Float32Array(mx * my);
  for (let y = 0; y < my; y++) {
    const fy = ((y + 0.5) * ny) / my - 0.5;
    const f = Math.floor(fy);
    const wy = fy - f;
    const a = ((f + ny) % ny) * mx;
    const b = ((f + 1 + ny) % ny) * mx;
    const o = y * mx;
    for (let x = 0; x < mx; x++) out[o + x] = cur[a + x] + (cur[b + x] - cur[a + x]) * wy;
  }
  return out;
}

/** smallest power of two >= v, clamped to [16, n] */
function gridFor(cells: number, samplesPerCell: number, n: number): number {
  let r = 16;
  while (r < n && r < cells * samplesPerCell) r *= 2;
  return r;
}

/**
 * Tileable fractal (fBm) value noise normalized to [0,1].
 * `cx`,`cy` = lattice cells across the tile for the first octave (use different values for
 * stretched / anisotropic noise); each octave doubles the frequency.
 * Every octave is evaluated on the coarsest grid that still resolves it (>= 3 samples per
 * lattice cell) and the running sum is upsampled as the octaves get finer, so smooth noise
 * costs a fraction of a full-resolution evaluation.
 */
export function fbm(
  n: number,
  cx: number,
  cy: number,
  octaves: number,
  seed: number,
  gain = 0.5,
): Float32Array {
  let ax = Math.max(1, Math.round(cx));
  let ay = Math.max(1, Math.round(cy));
  let nx = gridFor(ax, 4, n);
  let ny = gridFor(ay, 4, n);
  let acc = new Float32Array(nx * ny);
  let amp = 1;
  for (let o = 0; o < octaves; o++) {
    const mx = Math.max(nx, gridFor(ax, 3, n));
    const my = Math.max(ny, gridFor(ay, 3, n));
    if (mx !== nx || my !== ny) {
      acc = upsample(acc, nx, ny, mx, my) as Float32Array<ArrayBuffer>;
      nx = mx;
      ny = my;
    }
    addValueNoiseRect(acc, nx, ny, Math.min(ax, nx), Math.min(ay, ny), seed + o * 7919, amp);
    if (ax >= n && ay >= n) break;
    ax *= 2;
    ay *= 2;
    amp *= gain;
  }
  return normalize(upsample(acc, nx, ny, n, n));
}

/** per-pixel uniform white noise [0,1) */
export function whiteNoise(n: number, seed: number): Float32Array {
  const out = new Float32Array(n * n);
  let s = (seed | 0) || 1;
  for (let i = 0; i < out.length; i++) {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    out[i] = (s >>> 0) / 4294967296;
  }
  return out;
}

/** wrapped box blur (in place). `passes` = 2 approximates a gaussian well enough. */
export function boxBlur(f: Float32Array, n: number, radius: number, passes = 2): Float32Array {
  const r = Math.max(0, Math.min(Math.floor(radius), (n >> 1) - 1));
  if (r === 0) return f;
  const mask = n - 1;
  const inv = 1 / (2 * r + 1);
  const tmp = new Float32Array(n);
  const col = new Float32Array(n);
  const buf = new Float32Array(n * n);
  for (let p = 0; p < passes; p++) {
    // horizontal
    for (let y = 0; y < n; y++) {
      const o = y * n;
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += f[o + (k & mask)];
      for (let x = 0; x < n; x++) {
        tmp[x] = sum * inv;
        sum += f[o + ((x + r + 1) & mask)] - f[o + ((x - r) & mask)];
      }
      for (let x = 0; x < n; x++) buf[o + x] = tmp[x];
    }
    // vertical (row-wise running column sums: cache friendly)
    col.fill(0);
    for (let k = -r; k <= r; k++) {
      const o = (k & mask) * n;
      for (let x = 0; x < n; x++) col[x] += buf[o + x];
    }
    for (let y = 0; y < n; y++) {
      const o = y * n;
      for (let x = 0; x < n; x++) f[o + x] = col[x] * inv;
      const oa = ((y + r + 1) & mask) * n;
      const os = ((y - r) & mask) * n;
      for (let x = 0; x < n; x++) col[x] += buf[oa + x] - buf[os + x];
    }
  }
  return f;
}

/** bilinear wrapped sample of a field at pixel coordinates */
export function sampleField(f: Float32Array, n: number, x: number, y: number): number {
  const mask = n - 1;
  const fx = Math.floor(x);
  const fy = Math.floor(y);
  const tx = x - fx;
  const ty = y - fy;
  const x0 = fx & mask;
  const x1 = (fx + 1) & mask;
  const y0 = (fy & mask) * n;
  const y1 = ((fy + 1) & mask) * n;
  const a = f[y0 + x0] + (f[y0 + x1] - f[y0 + x0]) * tx;
  const b = f[y1 + x0] + (f[y1 + x1] - f[y1 + x0]) * tx;
  return a + (b - a) * ty;
}

/** read one channel (0=r,1=g,2=b,3=a) of a canvas into a [0,1] field */
export function fieldFromCanvas(ctx: CanvasRenderingContext2D, n: number, channel = 0): Float32Array {
  const d = ctx.getImageData(0, 0, n, n).data;
  const out = new Float32Array(n * n);
  for (let i = 0, j = channel; i < out.length; i++, j += 4) out[i] = d[j] / 255;
  return out;
}

// ---------------------------------------------------------------------------------------------
// cell maps (tiles, planks, bricks, stones ...)
// ---------------------------------------------------------------------------------------------

/** axis-aligned rectangle in METERS; may extend past the tile (it wraps) */
export interface RectCell {
  x: number;
  y: number;
  w: number;
  h: number;
  /** long axis runs along Y (used for grain direction) */
  vert?: boolean;
  /** ignore left/right edges (strip continues across the tile) */
  openX?: boolean;
  /** ignore top/bottom edges */
  openY?: boolean;
}

/** per-pixel partition of the tile into cells */
export interface CellMap {
  n: number;
  count: number;
  /** cell index per pixel */
  id: Uint16Array;
  /** distance to the nearest cell border, MILLIMETERS (<= 0 outside rounded corners) */
  edge: Float32Array;
  /** position relative to the cell centre, METERS */
  lx: Float32Array;
  ly: Float32Array;
}

function allocCellMap(n: number, count: number): CellMap {
  return {
    n,
    count,
    id: new Uint16Array(n * n),
    edge: new Float32Array(n * n),
    lx: new Float32Array(n * n),
    ly: new Float32Array(n * n),
  };
}

/** rasterize a rect layout that partitions the `tw` x `th` meter tile. `corner` = radius in m. */
export function rasterRects(
  n: number,
  tw: number,
  th: number,
  rects: readonly RectCell[],
  corner = 0,
): CellMap {
  const cm = allocCellMap(n, rects.length);
  const { id, edge, lx, ly } = cm;
  const sx = n / tw;
  const sy = n / th;
  const mask = n - 1;
  for (let k = 0; k < rects.length; k++) {
    const r = rects[k];
    const ix0 = Math.ceil(r.x * sx - 0.5);
    const ix1 = Math.ceil((r.x + r.w) * sx - 0.5);
    const iy0 = Math.ceil(r.y * sy - 0.5);
    const iy1 = Math.ceil((r.y + r.h) * sy - 0.5);
    const cxm = r.x + r.w / 2;
    const cym = r.y + r.h / 2;
    const hw = r.w / 2;
    const hh = r.h / 2;
    for (let iy = iy0; iy < iy1; iy++) {
      const dyc = (iy + 0.5) / sy - cym;
      const dy = r.openY ? 1e6 : hh - Math.abs(dyc);
      const row = (iy & mask) * n;
      for (let ix = ix0; ix < ix1; ix++) {
        const dxc = (ix + 0.5) / sx - cxm;
        const dx = r.openX ? 1e6 : hw - Math.abs(dxc);
        let d = dx < dy ? dx : dy;
        if (corner > 0 && dx < corner && dy < corner) {
          const a = corner - dx;
          const b = corner - dy;
          d = corner - Math.sqrt(a * a + b * b);
        }
        const i = row + (ix & mask);
        id[i] = k;
        edge[i] = d * 1000;
        lx[i] = dxc;
        ly[i] = dyc;
      }
    }
  }
  return cm;
}

/**
 * Tileable Voronoi partition on a jittered `cx` x `cy` grid (pebbles, cobbles, chips).
 * `edge` is the distance to the bisector with the second nearest site (mm).
 */
export function voronoiCells(
  n: number,
  tw: number,
  th: number,
  cx: number,
  cy: number,
  jitter: number,
  seed: number,
): CellMap {
  const cm = allocCellMap(n, cx * cy);
  const { id, edge, lx, ly } = cm;
  const rng = mulberry32(seed);
  const cw = tw / cx;
  const ch = th / cy;
  // padded site arrays so the 3x3 search needs no modulo
  const pw = cx + 2;
  const px = new Float32Array(pw * (cy + 2));
  const py = new Float32Array(pw * (cy + 2));
  const pid = new Int32Array(pw * (cy + 2));
  const bx = new Float32Array(cx * cy);
  const by = new Float32Array(cx * cy);
  for (let i = 0; i < cx * cy; i++) {
    bx[i] = (0.5 + (rng() - 0.5) * jitter) * cw;
    by[i] = (0.5 + (rng() - 0.5) * jitter) * ch;
  }
  for (let j = -1; j <= cy; j++) {
    const jj = (j + cy) % cy;
    for (let i = -1; i <= cx; i++) {
      const ii = (i + cx) % cx;
      const p = (j + 1) * pw + (i + 1);
      px[p] = i * cw + bx[jj * cx + ii];
      py[p] = j * ch + by[jj * cx + ii];
      pid[p] = jj * cx + ii;
    }
  }
  const mx = tw / n;
  const my = th / n;
  for (let y = 0; y < n; y++) {
    const ym = (y + 0.5) * my;
    const gj = Math.min(cy - 1, Math.floor(ym / ch));
    for (let x = 0; x < n; x++) {
      const xm = (x + 0.5) * mx;
      const gi = Math.min(cx - 1, Math.floor(xm / cw));
      let d1 = 1e9;
      let d2 = 1e9;
      let p1 = 0;
      let p2 = 0;
      for (let dj = 0; dj < 3; dj++) {
        const base = (gj + dj) * pw + gi;
        for (let di = 0; di < 3; di++) {
          const p = base + di;
          const ddx = px[p] - xm;
          const ddy = py[p] - ym;
          const d = ddx * ddx + ddy * ddy;
          if (d < d1) {
            d2 = d1;
            p2 = p1;
            d1 = d;
            p1 = p;
          } else if (d < d2) {
            d2 = d;
            p2 = p;
          }
        }
      }
      const i = y * n + x;
      const sdx = px[p2] - px[p1];
      const sdy = py[p2] - py[p1];
      id[i] = pid[p1];
      edge[i] = ((d2 - d1) / (2 * Math.sqrt(sdx * sdx + sdy * sdy) + 1e-9)) * 1000;
      lx[i] = xm - px[p1];
      ly[i] = ym - py[p1];
    }
  }
  return cm;
}

/**
 * Pointy-top hexagon grid. `cols` hexes of flat-to-flat width tw/cols; `rows` must be even and
 * the tile height must be rows * 1.5 * (width / sqrt(3)) for regular hexagons.
 */
export function hexCells(n: number, tw: number, th: number, cols: number, rows: number): CellMap {
  const cm = allocCellMap(n, cols * rows);
  const { id, edge, lx, ly } = cm;
  const w = tw / cols;
  const rh = th / rows;
  const kx = 0.5;
  // stretch factor so the edge test stays exact even if th is not perfectly regular
  const ky = (w / Math.sqrt(3) / (rh / 1.5)) * (Math.sqrt(3) / 2);
  for (let y = 0; y < n; y++) {
    const ym = ((y + 0.5) / n) * th;
    const r0 = Math.floor(ym / rh);
    for (let x = 0; x < n; x++) {
      const xm = ((x + 0.5) / n) * tw;
      let best = 1e9;
      let bdx = 0;
      let bdy = 0;
      let bid = 0;
      for (let rr = r0; rr <= r0 + 1; rr++) {
        const off = rr & 1 ? 0.5 : 0;
        const c = Math.round(xm / w - off - 0.5);
        const cxm = (c + off + 0.5) * w;
        const cym = rr * rh + rh / 3; // centre: hex spans rh*4/3 vertically
        const dx = xm - cxm;
        const dy = ym - cym;
        const d = dx * dx + dy * dy;
        if (d < best) {
          best = d;
          bdx = dx;
          bdy = dy;
          bid = (((rr % rows) + rows) % rows) * cols + (((c % cols) + cols) % cols);
        }
      }
      const adx = Math.abs(bdx);
      const ady = Math.abs(bdy);
      const m = Math.max(adx, adx * kx + ady * ky);
      const i = y * n + x;
      id[i] = bid;
      edge[i] = (w / 2 - m) * 1000;
      lx[i] = bdx;
      ly[i] = bdy;
    }
  }
  return cm;
}

// ---------------------------------------------------------------------------------------------
// layouts (all in meters)
// ---------------------------------------------------------------------------------------------

/** regular grid with a per-row running-bond offset (`bond` = fraction of a cell, 0 = stacked) */
export function bondLayout(tw: number, th: number, cols: number, rows: number, bond = 0): RectCell[] {
  const cw = tw / cols;
  const ch = th / rows;
  const out: RectCell[] = [];
  for (let r = 0; r < rows; r++) {
    const off = ((r * bond) % 1) * cw;
    for (let c = 0; c < cols; c++) out.push({ x: c * cw + off, y: r * ch, w: cw, h: ch });
  }
  return out;
}

/**
 * Courses of the given heights filled with random-length pieces (planks, ashlar, setts).
 * Joints avoid lining up with the neighbouring course by at least `stagger` meters.
 */
export function courseLayout(
  tw: number,
  heights: readonly number[],
  lenMin: number,
  lenMax: number,
  rng: Rng,
  stagger = 0.1,
): RectCell[] {
  const out: RectCell[] = [];
  let y = 0;
  let prev: number[] = [];
  let first: number[] = [];
  const near = (a: number[], x: number) => {
    for (const j of a) {
      let d = Math.abs(j - x) % tw;
      if (d > tw / 2) d = tw - d;
      if (d < stagger) return true;
    }
    return false;
  };
  for (let r = 0; r < heights.length; r++) {
    let joints: number[] = [];
    for (let attempt = 0; attempt < 24; attempt++) {
      joints = [];
      let x = rng() * tw;
      let remaining = tw;
      let ok = true;
      for (;;) {
        joints.push(((x % tw) + tw) % tw);
        if (remaining <= lenMax) break;
        let len = lenMin + rng() * (lenMax - lenMin);
        if (remaining - len < lenMin) len = remaining > 2 * lenMin ? remaining / 2 : remaining;
        if (len >= remaining) break;
        x += len;
        remaining -= len;
      }
      for (const j of joints) {
        if (near(prev, j) || (r === heights.length - 1 && near(first, j))) {
          ok = false;
          break;
        }
      }
      if (ok) break;
    }
    joints.sort((a, b) => a - b);
    for (let k = 0; k < joints.length; k++) {
      const x0 = joints[k];
      const x1 = k + 1 < joints.length ? joints[k + 1] : joints[0] + tw;
      out.push({ x: x0, y, w: x1 - x0, h: heights[r] });
    }
    if (r === 0) first = joints;
    prev = joints;
    y += heights[r];
  }
  return out;
}

/** swap axes of a layout (courses become columns) */
export function transposeLayout(rects: readonly RectCell[]): RectCell[] {
  return rects.map((r) => ({ x: r.y, y: r.x, w: r.h, h: r.w, vert: !r.vert, openX: r.openY, openY: r.openX }));
}

/**
 * Axis-aligned herringbone of blocks `bw` x (`k`*`bw`). The tile must be a multiple of
 * 2*k*bw. (Rotate the texture by 45deg for the classic look.)
 */
export function herringboneLayout(tw: number, bw: number, k: number): RectCell[] {
  const period = 2 * k;
  const units = Math.round(tw / bw);
  const reps = Math.max(1, Math.round(units / period));
  const out: RectCell[] = [];
  for (let a = 0; a < units; a++) {
    for (let b = 0; b < reps; b++) {
      const x = (a + period * b) % units;
      out.push({ x: x * bw, y: a * bw, w: k * bw, h: bw });
      out.push({ x: ((x + k) % units) * bw, y: (a - k + 1) * bw, w: bw, h: k * bw, vert: true });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// surfaces -> textures
// ---------------------------------------------------------------------------------------------

/** intermediate result of a finish generator */
export interface Surface {
  /** resolution in px */
  n: number;
  /** tile size in meters */
  w: number;
  h: number;
  /** sRGB color, RGBA8 */
  rgba: Uint8ClampedArray<ArrayBuffer>;
  /** height in mm */
  height: Float32Array;
  /** roughness 0..1 (ignored when `uniformRough` is set) */
  rough: Float32Array;
  /** constant roughness: no roughness map is created */
  uniformRough?: number;
}

export function newSurface(n: number, w: number, h: number): Surface {
  const rgba = new Uint8ClampedArray(n * n * 4);
  for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
  return { n, w, h, rgba, height: new Float32Array(n * n), rough: new Float32Array(n * n) };
}

/**
 * Height field (mm) -> tangent-space normal map (RGBA8, OpenGL / three.js convention for a
 * flipY canvas texture). Wrapped Sobel filter, physically scaled slopes times `strength`.
 */
export function heightToNormal(
  height: Float32Array,
  n: number,
  mmPerPxX: number,
  mmPerPxY: number,
  strength = 1,
): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(n * n * 4);
  const mask = n - 1;
  const kx = strength / (8 * mmPerPxX);
  const ky = strength / (8 * mmPerPxY);
  let s = 0x2545f491;
  for (let y = 0; y < n; y++) {
    const r0 = ((y - 1) & mask) * n;
    const r1 = y * n;
    const r2 = ((y + 1) & mask) * n;
    for (let x = 0; x < n; x++) {
      const xl = (x - 1) & mask;
      const xr = (x + 1) & mask;
      const tl = height[r0 + xl];
      const tr = height[r0 + xr];
      const bl = height[r2 + xl];
      const br = height[r2 + xr];
      const gx = (tr + 2 * height[r1 + xr] + br - tl - 2 * height[r1 + xl] - bl) * kx;
      const gy = (bl + 2 * height[r2 + x] + br - tl - 2 * height[r0 + x] - tr) * ky;
      const inv = 127.5 / Math.sqrt(gx * gx + gy * gy + 1);
      // tiny dither so sub-LSB slopes (tile tilt, glaze waviness) survive 8-bit quantization
      s = (Math.imul(s, 1664525) + 1013904223) | 0;
      const d1 = ((s >>> 16) & 255) / 255 - 0.5;
      const d2 = ((s >>> 24) & 255) / 255 - 0.5;
      const o = (r1 + x) * 4;
      out[o] = 127.5 - gx * inv + d1;
      out[o + 1] = 127.5 + gy * inv + d2;
      out[o + 2] = 127.5 + inv;
      out[o + 3] = 255;
    }
  }
  return out;
}

/** roughness field -> RGBA8 grey image, optionally downsampled by 2 (box filter) */
export function roughnessImage(
  rough: Float32Array,
  n: number,
  half = false,
): { data: Uint8ClampedArray<ArrayBuffer>; n: number } {
  if (!half) {
    const out = new Uint8ClampedArray(n * n * 4);
    for (let i = 0, o = 0; i < rough.length; i++, o += 4) {
      const v = rough[i] * 255;
      out[o] = v;
      out[o + 1] = v;
      out[o + 2] = v;
      out[o + 3] = 255;
    }
    return { data: out, n };
  }
  const m = n >> 1;
  const out = new Uint8ClampedArray(m * m * 4);
  for (let y = 0; y < m; y++) {
    const r0 = y * 2 * n;
    const r1 = r0 + n;
    for (let x = 0; x < m; x++) {
      const x2 = x * 2;
      const v = (rough[r0 + x2] + rough[r0 + x2 + 1] + rough[r1 + x2] + rough[r1 + x2 + 1]) * 63.75;
      const o = (y * m + x) * 4;
      out[o] = v;
      out[o + 1] = v;
      out[o + 2] = v;
      out[o + 3] = 255;
    }
  }
  return { data: out, n: m };
}

let maxAnisotropy = 8;
const liveTextures = new Set<THREE.Texture>();

/** anisotropic filtering level for all finish textures (call with renderer.capabilities.getMaxAnisotropy()) */
export function setMaxAnisotropy(n: number): void {
  const v = Math.max(1, Math.floor(n) || 1);
  if (v === maxAnisotropy) return;
  maxAnisotropy = v;
  for (const t of liveTextures) {
    t.anisotropy = v;
    t.needsUpdate = true;
  }
}

export function getMaxAnisotropy(): number {
  return maxAnisotropy;
}

/**
 * Wrap a canvas into a repeating, mip-mapped texture whose UVs are in meters.
 * @param isColor sRGB color map (true) or linear data such as normals / roughness (false)
 */
export function makeTexture(
  canvas: HTMLCanvasElement,
  isColor: boolean,
  tileW: number,
  tileH: number = tileW,
  rotation = 0,
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1 / tileW, 1 / tileH);
  tex.rotation = rotation;
  tex.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  liveTextures.add(tex);
  tex.addEventListener('dispose', () => liveTextures.delete(tex));
  return tex;
}

export interface SurfaceTextures {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture | null;
}

/** convert a generated surface into the three PBR textures */
export function surfaceToTextures(s: Surface, normalStrength = 1, rotation = 0): SurfaceTextures {
  const map = makeTexture(canvasFromRGBA(s.rgba, s.n), true, s.w, s.h, rotation);
  const nrm = heightToNormal(s.height, s.n, (s.w * 1000) / s.n, (s.h * 1000) / s.n, normalStrength);
  const normalMap = makeTexture(canvasFromRGBA(nrm, s.n), false, s.w, s.h, rotation);
  let roughnessMap: THREE.CanvasTexture | null = null;
  if (s.uniformRough === undefined) {
    const r = roughnessImage(s.rough, s.n, s.n >= 1024);
    roughnessMap = makeTexture(canvasFromRGBA(r.data, r.n), false, s.w, s.h, rotation);
  }
  return { map, normalMap, roughnessMap };
}

/**
 * Small lit preview (canvas, no WebGL): the color map shaded by the height field with a
 * top-left light. `showMeters` = real-world width shown across the swatch.
 */
export function surfaceSwatch(
  s: Surface,
  showMeters: number,
  size = 96,
  shade = 1,
  rotation = 0,
): HTMLCanvasElement {
  const n = s.n;
  const mask = n - 1;
  const img = new Uint8ClampedArray(n * n * 4);
  const kx = (shade * 0.5) / ((s.w * 1000) / n);
  const ky = (shade * 0.5) / ((s.h * 1000) / n);
  for (let y = 0; y < n; y++) {
    const r1 = y * n;
    const r0 = ((y - 1) & mask) * n;
    const r2 = ((y + 1) & mask) * n;
    for (let x = 0; x < n; x++) {
      const gx = (s.height[r1 + ((x + 1) & mask)] - s.height[r1 + ((x - 1) & mask)]) * kx;
      const gy = (s.height[r2 + x] - s.height[r0 + x]) * ky;
      // light from the top-left, softly clamped
      const g = gx + gy;
      const l = 1 + 0.5 * (g < -0.6 ? -0.6 : g > 0.5 ? 0.5 : g);
      const o = (r1 + x) * 4;
      img[o] = s.rgba[o] * l;
      img[o + 1] = s.rgba[o + 1] * l;
      img[o + 2] = s.rgba[o + 2] * l;
      img[o + 3] = 255;
    }
  }
  const src = canvasFromRGBA(img, n);
  const out = createCanvas(size, size);
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const pattern = ctx.createPattern(src, 'repeat');
  if (pattern) {
    // source px -> swatch px (texel aspect may be non-square), then the finish's own rotation
    ctx.scale((size * s.w) / (showMeters * n), (size * s.h) / (showMeters * n));
    ctx.rotate(-rotation);
    ctx.fillStyle = pattern;
    const big = n * 4;
    ctx.fillRect(-big, -big, big * 2, big * 2);
  }
  return out;
}
