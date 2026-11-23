import {
  type RectCell,
  type Surface,
  bondLayout,
  drawingContext,
  drawWrapped,
  fbm,
  hexToRgb,
  mulberry32,
  newSurface,
  rasterRects,
  whiteNoise,
} from '../textureGen';
import { CEDAR, woodGrain } from './wood';

// ---------------------------------------------------------------------------------------------
// plaster / stucco
// ---------------------------------------------------------------------------------------------

/** smooth interior plaster with a faint trowel texture */
export function plaster(n: number, w: number, h: number, color: string): Surface {
  const s = newSurface(n, w, h);
  const seed = 3101;
  const c = hexToRgb(color);
  // broad, slightly horizontal trowel sweeps + finer float marks + grain
  const sweep = fbm(n, w / 0.45, h / 0.22, 3, seed + 1);
  const marks = fbm(n, w / 0.06, h / 0.035, 3, seed + 2);
  const wn = whiteNoise(n, seed + 3);
  const { rgba, height } = s;
  for (let i = 0; i < n * n; i++) {
    const a = sweep[i] - 0.5;
    const b = marks[i] - 0.5;
    const m = 1 + a * 0.035 + b * 0.02 + (wn[i] - 0.5) * 0.012;
    const o4 = i * 4;
    rgba[o4] = c[0] * m;
    rgba[o4 + 1] = c[1] * m;
    rgba[o4 + 2] = c[2] * m;
    height[i] = a * 1.1 + b * 0.32 + (wn[i] - 0.5) * 0.05;
  }
  s.uniformRough = 0.86;
  return s;
}

/** exterior sand-float stucco ("shlicht"): grainy, with soft undulation */
export function stucco(n: number, w: number, h: number, color: string): Surface {
  const s = newSurface(n, w, h);
  const seed = 3202;
  const c = hexToRgb(color);
  const grain = fbm(n, w / 0.004, h / 0.004, 2, seed + 1, 0.6);
  const lumps = fbm(n, w / 0.02, h / 0.02, 3, seed + 2);
  const broad = fbm(n, w / 0.5, h / 0.5, 3, seed + 3);
  const wn = whiteNoise(n, seed + 4);
  const { rgba, height, rough } = s;
  for (let i = 0; i < n * n; i++) {
    const g = grain[i] - 0.5;
    const l = lumps[i] - 0.5;
    const b = broad[i] - 0.5;
    // pits between the sand grains read slightly darker
    const m = 1 + g * 0.1 + l * 0.05 + b * 0.04 + (wn[i] - 0.5) * 0.02;
    const o4 = i * 4;
    rgba[o4] = c[0] * m;
    rgba[o4 + 1] = c[1] * m;
    rgba[o4 + 2] = c[2] * (m - b * 0.012);
    height[i] = g * 1.3 + l * 1.0 + b * 1.2;
    rough[i] = 0.93 - g * 0.06;
  }
  return s;
}

// ---------------------------------------------------------------------------------------------
// concrete
// ---------------------------------------------------------------------------------------------

/** power-trowelled, polished concrete floor */
export function concretePolished(n: number, w: number, h: number): Surface {
  const s = newSurface(n, w, h);
  const seed = 3303;
  const c = hexToRgb('#a09f9a');
  const cloud = fbm(n, w / 0.9, h / 0.9, 5, seed + 1, 0.55);
  const blot = fbm(n, w / 0.2, h / 0.2, 4, seed + 2);
  const burn = fbm(n, w / 0.5, h / 0.5, 3, seed + 3);
  const fine = fbm(n, w / 0.006, h / 0.006, 2, seed + 4, 0.7);
  const wn = whiteNoise(n, seed + 5);
  const { rgba, height, rough } = s;
  for (let i = 0; i < n * n; i++) {
    const a = cloud[i] - 0.5;
    const b = blot[i] - 0.5;
    const f = fine[i] - 0.5;
    // sparse dark aggregate / pores
    const pore = fine[i] > 0.86 ? (fine[i] - 0.86) * 4 : 0;
    const m = 1 + a * 0.2 + b * 0.09 + f * 0.05 + (wn[i] - 0.5) * 0.03 - pore * 0.3;
    const o4 = i * 4;
    rgba[o4] = c[0] * m;
    rgba[o4 + 1] = c[1] * m;
    rgba[o4 + 2] = c[2] * (m + a * 0.015);
    height[i] = a * 0.5 + b * 0.12 + f * 0.03 - pore * 0.15;
    rough[i] = 0.3 + (burn[i] - 0.5) * 0.22 + b * 0.08 + pore * 0.5;
  }
  return s;
}

/** fair-faced architectural concrete: formwork panels 180 x 90 cm with tie holes */
export function concreteSmooth(n: number, w: number, h: number): Surface {
  const s = newSurface(n, w, h);
  const seed = 3404;
  const cols = Math.max(1, Math.round(w / 1.8));
  const rows = Math.max(1, Math.round(h / 0.9));
  const rects = bondLayout(w, h, cols, rows, 0);
  const cm = rasterRects(n, w, h, rects);
  const c = hexToRgb('#a7a6a1');
  const cloud = fbm(n, w / 0.7, h / 0.7, 5, seed + 1, 0.55);
  const streak = fbm(n, w / 0.08, h / 0.9, 3, seed + 2);
  const fine = fbm(n, w / 0.008, h / 0.008, 2, seed + 4, 0.7);
  const wn = whiteNoise(n, seed + 5);
  const rng = mulberry32(seed);
  const tone = new Float32Array(cm.count);
  const off = new Int32Array(cm.count);
  for (let k = 0; k < cm.count; k++) {
    tone[k] = 1 + (rng() * 2 - 1) * 0.015;
    off[k] = Math.floor(rng() * n * n);
  }
  const pw = w / cols;
  const ph = h / rows;
  const holeR = 0.013;
  const mask = n * n - 1;
  const { id, edge, lx, ly } = cm;
  const { rgba, height, rough } = s;
  for (let i = 0; i < n * n; i++) {
    const k = id[i];
    const j = (i + off[k]) & mask;
    const a = cloud[j] - 0.5;
    const st = streak[j] - 0.5;
    const f = fine[i] - 0.5;
    const bug = fine[j] > 0.88 ? (fine[j] - 0.88) * 6 : 0; // bug holes
    // panel seam: a fine dark line with a slight ridge
    const e = edge[i];
    const seam = e < 2.2 ? 1 - e / 2.2 : 0;
    // six form-tie holes per panel
    const ux = Math.min(Math.abs(Math.abs(lx[i]) - pw / 3), Math.abs(lx[i]));
    const uy = Math.abs(Math.abs(ly[i]) - ph / 4);
    const hd = Math.sqrt(ux * ux + uy * uy) / holeR;
    const hole = hd < 1 ? 1 - hd * hd : 0;
    const rim = hd < 1.5 && hd >= 1 ? 1 - (hd - 1) * 2 : 0;
    const m = tone[k] * (1 + a * 0.16 + st * 0.06 + f * 0.05 + (wn[i] - 0.5) * 0.03 - bug * 0.25 - seam * 0.22) * (1 - hole * 0.55) * (1 + rim * 0.05);
    const o4 = i * 4;
    rgba[o4] = c[0] * m;
    rgba[o4 + 1] = c[1] * m;
    rgba[o4 + 2] = c[2] * m;
    height[i] = a * 0.4 + f * 0.1 - bug * 0.6 - seam * 0.5 - hole * 7;
    rough[i] = 0.58 + a * 0.12 + bug * 0.3 + hole * 0.3;
  }
  return s;
}

/** board-formed concrete: the timber formwork leaves its grain and board lines */
export function concreteBoard(n: number, w: number, h: number): Surface {
  const s = newSurface(n, w, h);
  const seed = 3505;
  const rows = Math.round(h / 0.1);
  const rects: RectCell[] = [];
  for (let r = 0; r < rows; r++) rects.push({ x: 0, y: (r * h) / rows, w, h: h / rows, openX: true });
  const cm = rasterRects(n, w, h, rects);
  const grain = woodGrain(n, w, h, seed, { ...CEDAR, knots: 0.8, streak: 0.5, ring: 0.5 });
  const cloud = fbm(n, w / 0.6, h / 0.6, 4, seed + 1);
  const wn = whiteNoise(n, seed + 5);
  const c = hexToRgb('#9f9d98');
  const rng = mulberry32(seed);
  const tone = new Float32Array(rows);
  const lift = new Float32Array(rows);
  const off = new Int32Array(rows);
  for (let k = 0; k < rows; k++) {
    tone[k] = 1 + (rng() * 2 - 1) * 0.05;
    lift[k] = (rng() * 2 - 1) * 0.9;
    off[k] = Math.floor(rng() * n * n);
  }
  const mask = n * n - 1;
  const { id, edge } = cm;
  const { rgba, height, rough } = s;
  for (let i = 0; i < n * n; i++) {
    const k = id[i];
    const g = grain[(i + off[k]) & mask] - 0.6;
    const a = cloud[i] - 0.5;
    const e = edge[i];
    // fins of cement paste squeezed between the boards
    const fin = e < 2.5 ? 1 - e / 2.5 : 0;
    const bug = wn[i] > 0.9965 ? 1 : 0; // bug holes
    const m = tone[k] * (1 + g * 0.09 + a * 0.16 + (wn[i] - 0.5) * 0.05 - fin * 0.1 - bug * 0.3);
    const o4 = i * 4;
    rgba[o4] = c[0] * m;
    rgba[o4 + 1] = c[1] * m;
    rgba[o4 + 2] = c[2] * m;
    height[i] = g * 1.5 + lift[k] + fin * fin * 1.2 + a * 0.5 - bug * 1.2;
    rough[i] = 0.7 - g * 0.15 + fin * 0.1;
  }
  return s;
}

// ---------------------------------------------------------------------------------------------
// carpet
// ---------------------------------------------------------------------------------------------

/** cut-pile carpet */
export function carpet(n: number, w: number, h: number, color: string, seed: number): Surface {
  const s = newSurface(n, w, h);
  const c = hexToRgb(color);
  const tuft = fbm(n, w / 0.0045, h / 0.0045, 2, seed + 1, 0.8);
  const clump = fbm(n, w / 0.03, h / 0.03, 3, seed + 2);
  const sweep = fbm(n, w / 0.35, h / 0.35, 3, seed + 3);
  const wn = whiteNoise(n, seed + 4);
  const { rgba, height } = s;
  for (let i = 0; i < n * n; i++) {
    const t = tuft[i] - 0.5;
    const cl = clump[i] - 0.5;
    const sw = sweep[i] - 0.5;
    const f = wn[i] - 0.5;
    // shadows between tufts, lighter fibre tips, brushed pile patches
    const m = 1 + t * 0.42 + cl * 0.12 + sw * 0.1 + f * 0.1;
    const o4 = i * 4;
    rgba[o4] = c[0] * m;
    rgba[o4 + 1] = c[1] * m;
    rgba[o4 + 2] = c[2] * m;
    height[i] = t * 2.4 + cl * 1.2 + f * 0.5;
  }
  s.uniformRough = 0.97;
  return s;
}

// ---------------------------------------------------------------------------------------------
// dark panel cladding
// ---------------------------------------------------------------------------------------------

/** dark fibre-cement rainscreen panels 120 x 60 cm with open shadow joints */
export function claddingDark(n: number, w: number, h: number): Surface {
  const s = newSurface(n, w, h);
  const seed = 3707;
  const cols = Math.round(w / 1.2);
  const rows = Math.round(h / 0.6);
  const cm = rasterRects(n, w, h, bondLayout(w, h, cols, rows, 0.5));
  const c = hexToRgb('#3d4044');
  const cloud = fbm(n, w / 0.5, h / 0.5, 4, seed + 1);
  const brush = fbm(n, w / 0.004, h / 0.5, 2, seed + 2, 0.7);
  const wn = whiteNoise(n, seed + 3);
  const rng = mulberry32(seed);
  const tone = new Float32Array(cm.count);
  const tx = new Float32Array(cm.count);
  const ty = new Float32Array(cm.count);
  const off = new Int32Array(cm.count);
  for (let k = 0; k < cm.count; k++) {
    tone[k] = 1 + (rng() * 2 - 1) * 0.06;
    tx[k] = (rng() * 2 - 1) * 3;
    ty[k] = (rng() * 2 - 1) * 3;
    off[k] = Math.floor(rng() * n * n);
  }
  const pw = w / cols;
  const ph = h / rows;
  const pxmm = ((w + h) * 500) / n;
  const aa = Math.max(0.4, 0.6 * pxmm);
  const mask = n * n - 1;
  const { id, edge, lx, ly } = cm;
  const { rgba, height, rough } = s;
  for (let i = 0; i < n * n; i++) {
    const k = id[i];
    const j = (i + off[k]) & mask;
    const g = edge[i] - 4;
    const gf = g <= -aa ? 1 : g >= aa ? 0 : 0.5 - g / (2 * aa);
    const q = g < 3 ? 1 - (g > 0 ? g : 0) / 3 : 0;
    const a = cloud[j] - 0.5;
    const b = brush[j] - 0.5;
    // four rivets near the corners
    const rx = Math.abs(Math.abs(lx[i]) - (pw / 2 - 0.05));
    const ry = Math.abs(Math.abs(ly[i]) - (ph / 2 - 0.05));
    const rd = Math.sqrt(rx * rx + ry * ry) / 0.006;
    const rivet = rd < 1 ? 1 - rd * rd : 0;
    const m = tone[k] * (1 + a * 0.14 + b * 0.08 + (wn[i] - 0.5) * 0.05) * (1 + q * 0.12) * (1 + rivet * 0.25);
    const keep = 1 - gf;
    const o4 = i * 4;
    rgba[o4] = c[0] * m * keep + 8 * gf;
    rgba[o4 + 1] = c[1] * m * keep + 8 * gf;
    rgba[o4 + 2] = c[2] * m * keep + 9 * gf;
    height[i] = (b * 0.08 + a * 0.3 - q * q * 0.8 + rivet * 1.5 + lx[i] * tx[k] + ly[i] * ty[k]) * keep - 8 * gf;
    rough[i] = (0.6 + a * 0.12 - rivet * 0.2) * keep + 1 * gf;
  }
  return s;
}

// ---------------------------------------------------------------------------------------------
// wallpapers (vector patterns drawn with the 2D canvas, then given a paper texture)
// ---------------------------------------------------------------------------------------------

/** turn a drawn pattern into a surface with paper fibre texture and a faint print emboss */
function paperSurface(ctx: CanvasRenderingContext2D, n: number, w: number, h: number, seed: number, rough = 0.8): Surface {
  const s = newSurface(n, w, h);
  const img = ctx.getImageData(0, 0, n, n).data;
  const fibre = fbm(n, w / 0.003, h / 0.012, 2, seed + 1, 0.7);
  const weave = fbm(n, w / 0.012, h / 0.003, 2, seed + 2, 0.7);
  const soft = fbm(n, w / 0.3, h / 0.3, 2, seed + 3);
  const { rgba, height } = s;
  for (let i = 0; i < n * n; i++) {
    const o4 = i * 4;
    const f = fibre[i] - 0.5;
    const v = weave[i] - 0.5;
    const m = 1 + (f + v) * 0.035 + (soft[i] - 0.5) * 0.012;
    const r = img[o4];
    const g = img[o4 + 1];
    const b = img[o4 + 2];
    rgba[o4] = r * m;
    rgba[o4 + 1] = g * m;
    rgba[o4 + 2] = b * m;
    // printed ink sits a hair above the paper
    height[i] = (f + v) * 0.09 + (r + g + b) * -0.00018;
  }
  s.uniformRough = rough;
  return s;
}

/** soft vertical stripes */
export function wallpaperStripes(n: number, w: number, h: number): Surface {
  const ctx = drawingContext(n, '#efe9dd');
  const stripes = Math.round(w / 0.12);
  const pitch = n / stripes;
  // one extra stripe so the hairline that straddles x = 0 also appears at the right edge
  for (let k = 0; k <= stripes; k++) {
    const x = k * pitch;
    ctx.fillStyle = '#cdd6c8';
    ctx.fillRect(x + pitch * 0.25, 0, pitch * 0.5, n);
    ctx.fillStyle = '#b9c5b6';
    ctx.fillRect(x + pitch * 0.25 - pitch * 0.03, 0, pitch * 0.03, n);
    ctx.fillRect(x + pitch * 0.75, 0, pitch * 0.03, n);
    ctx.fillStyle = '#e4dfd0';
    ctx.fillRect(x - pitch * 0.012, 0, pitch * 0.024, n);
  }
  return paperSurface(ctx, n, w, h, 3801);
}

/** botanical: sage leafy sprigs with small berries on warm white */
export function wallpaperBotanical(n: number, w: number, h: number): Surface {
  const ctx = drawingContext(n, '#f2eee4');
  const rng = mulberry32(3902);
  const u = n / w; // px per meter
  const greens = ['#84a080', '#9db396', '#6f8e72', '#8ca886', '#aabfa1'];
  const leaf = (len: number, wid: number, color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(len * 0.3, -wid, len * 0.75, -wid * 0.8, len, 0);
    ctx.bezierCurveTo(len * 0.75, wid * 0.8, len * 0.3, wid, 0, 0);
    ctx.fill();
    ctx.strokeStyle = 'rgba(242,238,228,0.55)';
    ctx.lineWidth = Math.max(0.6, 0.0012 * u);
    ctx.beginPath();
    ctx.moveTo(len * 0.06, 0);
    ctx.lineTo(len * 0.9, 0);
    ctx.stroke();
  };
  const sprig = (seed: number) => {
    const r = mulberry32(seed);
    const len = (0.2 + r() * 0.08) * u;
    const bend = (r() - 0.5) * 0.6;
    const segs = 7 + Math.floor(r() * 3);
    // stem
    ctx.strokeStyle = '#7f957c';
    ctx.lineWidth = Math.max(0.8, 0.0022 * u);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(len * 0.5, -len * bend * 0.5, len, -len * bend * 0.35);
    ctx.stroke();
    for (let k = 1; k <= segs; k++) {
      const t = k / (segs + 0.6);
      // point on the quadratic stem
      const mt = 1 - t;
      const px = 2 * mt * t * len * 0.5 + t * t * len;
      const py = 2 * mt * t * (-len * bend * 0.5) + t * t * (-len * bend * 0.35);
      const side = k % 2 ? 1 : -1;
      const size = (0.05 + r() * 0.025) * u * (1 - t * 0.45);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(side * (0.75 + r() * 0.35) - bend * t * 0.6);
      leaf(size, size * (0.26 + r() * 0.08), greens[Math.floor(r() * greens.length)]);
      ctx.restore();
    }
    // tip leaf and berries
    ctx.save();
    ctx.translate(len, -len * bend * 0.35);
    ctx.rotate(-bend * 0.5);
    leaf(0.045 * u, 0.013 * u, greens[0]);
    ctx.restore();
    ctx.fillStyle = '#d8b3a2';
    const berries = 2 + Math.floor(r() * 3);
    for (let k = 0; k < berries; k++) {
      const t = 0.15 + r() * 0.5;
      const mt = 1 - t;
      const px = 2 * mt * t * len * 0.5 + t * t * len;
      const py = 2 * mt * t * (-len * bend * 0.5) + t * t * (-len * bend * 0.35);
      const side = r() < 0.5 ? 1 : -1;
      ctx.beginPath();
      ctx.arc(px + (r() - 0.5) * 0.02 * u, py + side * (0.035 + r() * 0.02) * u, (0.005 + r() * 0.003) * u, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  const cols = Math.max(2, Math.round(w / 0.3) & ~1);
  const rows = Math.max(2, Math.round(h / 0.3));
  const cw = n / cols;
  const ch = n / rows;
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const x = (c + 0.5 + (rng() - 0.5) * 0.25) * cw;
      const y = (r + (c % 2 ? 0.5 : 0) + 0.5 + (rng() - 0.5) * 0.25) * ch;
      const rot = -Math.PI / 2 + (rng() - 0.5) * 1.5 + (c % 2 ? 0.5 : -0.5);
      const flip = rng() < 0.5 ? -1 : 1;
      const seed = Math.floor(rng() * 1e9);
      drawWrapped(n, x, y, 0.3 * u, (dx, dy) => {
        ctx.save();
        ctx.translate(x + dx, y + dy);
        ctx.rotate(rot);
        ctx.scale(1, flip);
        ctx.translate(-0.12 * u, 0);
        sprig(seed);
        ctx.restore();
      });
    }
  }
  return paperSurface(ctx, n, w, h, 3903);
}

/** geometric: overlapping fan / wave scallops in dusty blue on cream */
export function wallpaperGeometric(n: number, w: number, h: number): Surface {
  const bg = '#eeece4';
  const ctx = drawingContext(n, bg);
  const cols = Math.round(w / 0.15);
  const R = n / cols / 2; // circle radius: circles touch horizontally
  const rowStep = R / 2;
  const rows = Math.round(n / rowStep);
  const lines = ['#7f96a3', '#9db0b8', '#7f96a3', '#b4c2c6'];
  ctx.lineWidth = Math.max(1, R * 0.085);
  for (let r = -4; r <= rows + 4; r++) {
    const y = r * (n / rows);
    const off = r & 1 ? R : 0;
    for (let c = -1; c <= cols; c++) {
      const x = c * 2 * R + off;
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.arc(x, y, R, 0, Math.PI * 2);
      ctx.fill();
      for (let k = 0; k < 4; k++) {
        ctx.strokeStyle = lines[k];
        ctx.beginPath();
        ctx.arc(x, y, R * (0.94 - k * 0.22), 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }
  return paperSurface(ctx, n, w, h, 4001);
}

/** kids: scattered golden stars and pastel dots on a soft sky blue */
export function wallpaperStars(n: number, w: number, h: number): Surface {
  const ctx = drawingContext(n, '#e3edf3');
  const rng = mulberry32(4102);
  const u = n / w;
  const star = (x: number, y: number, r: number, rot: number, color: string) => {
    drawWrapped(n, x, y, r * 1.2, (dx, dy) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = rot + (k * Math.PI) / 5;
        const rr = k % 2 ? r * 0.46 : r;
        const px = x + dx + Math.sin(a) * rr;
        const py = y + dy - Math.cos(a) * rr;
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.lineJoin = 'round';
      ctx.lineWidth = r * 0.22;
      ctx.strokeStyle = color;
      ctx.stroke();
      ctx.fill();
    });
  };
  const cols = Math.round(w / 0.2);
  const rows = Math.round(h / 0.2);
  const cw = n / cols;
  const ch = n / rows;
  const golds = ['#ecc662', '#f0d27c', '#e6b94f', '#ffffff'];
  const dots = ['#f4b6ae', '#ffffff', '#a9cbe0', '#f6dc8f'];
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const x = (c + 0.5 + (rng() - 0.5) * 0.5) * cw;
      const y = (r + (c % 2 ? 0.5 : 0) + 0.5 + (rng() - 0.5) * 0.5) * ch;
      const big = rng() < 0.4;
      star(x, y, (big ? 0.034 + rng() * 0.012 : 0.016 + rng() * 0.01) * u, (rng() - 0.5) * 0.7, golds[Math.floor(rng() * golds.length)]);
      // a couple of dots between the stars
      for (let k = 0; k < 2; k++) {
        const dxm = x + (0.5 + (rng() - 0.5) * 0.4) * cw;
        const dym = y + (rng() - 0.5) * 0.9 * ch;
        const rad = (0.004 + rng() * 0.005) * u;
        const col = dots[Math.floor(rng() * dots.length)];
        drawWrapped(n, dxm, dym, rad, (dx, dy) => {
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.arc(dxm + dx, dym + dy, rad, 0, Math.PI * 2);
          ctx.fill();
        });
      }
    }
  }
  return paperSurface(ctx, n, w, h, 4103);
}
