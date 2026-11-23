import {
  type Surface,
  bondLayout,
  fbm,
  hexToRgb,
  mulberry32,
  newSurface,
  rasterRects,
  whiteNoise,
} from '../textureGen';

/**
 * Terracotta S-profile roof tiles. Canvas "down" (texture v decreasing) is down the slope:
 * each course overlaps the one below it.
 */
export function roofTerracotta(n: number, w: number, h: number): Surface {
  const s = newSurface(n, w, h);
  const seed = 6101;
  const cols = Math.round(w / 0.25);
  const rows = Math.round(h / 0.35);
  const rng = mulberry32(seed);
  const palette = ['#b4573b', '#bb5f41', '#ac5036', '#c06546', '#a84c34', '#b85b3e'].map(hexToRgb);
  const count = cols * rows;
  const cr = new Float32Array(count);
  const cg = new Float32Array(count);
  const cb = new Float32Array(count);
  const lift = new Float32Array(count);
  const off = new Int32Array(count);
  for (let k = 0; k < count; k++) {
    const p = palette[Math.floor(rng() * palette.length)];
    const l = 0.95 + rng() * 0.1;
    cr[k] = p[0] * l;
    cg[k] = p[1] * l;
    cb[k] = p[2] * l;
    lift[k] = (rng() * 2 - 1) * 1.5;
    off[k] = Math.floor(rng() * n * n);
  }
  const mot = fbm(n, w / 0.12, h / 0.12, 4, seed + 1);
  const weather = fbm(n, w / 0.5, h / 0.9, 4, seed + 2);
  const wn = whiteNoise(n, seed + 3);
  const mask = n * n - 1;
  const roll = 0.44; // fraction of the tile width taken by the raised roll
  const { rgba, height, rough } = s;
  for (let y = 0; y < n; y++) {
    const fy = ((y + 0.5) / n) * rows;
    const row = Math.min(rows - 1, Math.floor(fy));
    const v = fy - row; // 0 = top of the exposed course, 1 = its lower edge
    const vmm = v * (h / rows) * 1000;
    for (let x = 0; x < n; x++) {
      const fx = ((x + 0.5) / n) * cols;
      const col = Math.min(cols - 1, Math.floor(fx));
      const ux = fx - col;
      const k = row * cols + col;
      const i = y * n + x;
      let prof: number;
      let ao: number;
      if (ux < roll) {
        // raised half-round roll: bright crown, darker flanks
        const t = ux / roll;
        const sn = Math.sin(t * Math.PI);
        prof = Math.sqrt(sn) * 32;
        ao = 0.72 + 0.36 * sn;
      } else {
        // the pan (water channel) lies in the shade of the rolls on both sides
        const t = (ux - roll) / (1 - roll);
        const sn = Math.sin(t * Math.PI);
        prof = -sn * 6;
        ao = 0.5 + 0.28 * sn;
      }
      // deep shadow under the course above, bright worn lower lip
      let sh = 1;
      if (vmm < 45) {
        const t = 1 - vmm / 45;
        sh = 1 - 0.68 * t * t;
      }
      const lipmm = (1 - v) * (h / rows) * 1000;
      const lip = lipmm < 10 ? 1 - lipmm / 10 : 0;
      const j = (i + off[k]) & mask;
      const f = wn[i] - 0.5;
      const wt = weather[i];
      const m = ao * sh * (1 + (mot[j] - 0.5) * 0.22 + f * 0.07) * (wt < 0.4 ? 0.82 + wt * 0.45 : 1) * (1 + lip * 0.12);
      const o4 = i * 4;
      rgba[o4] = cr[k] * m;
      rgba[o4 + 1] = cg[k] * m;
      rgba[o4 + 2] = cb[k] * m;
      height[i] = prof + v * 22 + lift[k] + (mot[j] - 0.5) * 0.8 + f * 0.25 - lip * lip * 4;
      rough[i] = 0.8 + (mot[j] - 0.5) * 0.12 + (wt < 0.4 ? 0.08 : 0);
    }
  }
  return s;
}

/** natural slate shingles, 25 cm wide with 20 cm exposure, half-bond */
export function roofSlate(n: number, w: number, h: number): Surface {
  const s = newSurface(n, w, h);
  const seed = 6202;
  const cols = Math.round(w / 0.25);
  const rows = Math.round(h / 0.2);
  const rects = bondLayout(w, h, cols, rows, 0.5);
  const cm = rasterRects(n, w, h, rects);
  const rng = mulberry32(seed);
  const palette = ['#4b5057', '#52575d', '#454a50', '#585d63', '#494e52', '#514f57', '#41454a'].map(hexToRgb);
  const cr = new Float32Array(cm.count);
  const cg = new Float32Array(cm.count);
  const cb = new Float32Array(cm.count);
  const lift = new Float32Array(cm.count);
  const drop = new Float32Array(cm.count);
  const off = new Int32Array(cm.count);
  for (let k = 0; k < cm.count; k++) {
    const p = palette[Math.floor(rng() * palette.length)];
    const l = 0.93 + rng() * 0.14;
    cr[k] = p[0] * l;
    cg[k] = p[1] * l;
    cb[k] = p[2] * l;
    lift[k] = rng() * 1.5;
    drop[k] = rng() * 0.006; // uneven lower edges
    off[k] = Math.floor(rng() * n * n);
  }
  // cleft surface: flaky layers running mostly along the slope
  const cleft = fbm(n, w / 0.05, h / 0.16, 4, seed + 1, 0.6);
  const mot = fbm(n, w / 0.2, h / 0.2, 3, seed + 2);
  const wn = whiteNoise(n, seed + 3);
  const rowH = h / rows;
  const mask = n * n - 1;
  const { id, lx, ly } = cm;
  const { rgba, height, rough } = s;
  for (let i = 0; i < n * n; i++) {
    const k = id[i];
    const j = (i + off[k]) & mask;
    const v = ly[i] / rowH + 0.5; // 0 top .. 1 lower edge
    const vmm = v * rowH * 1000;
    const side = (rects[k].w / 2 - Math.abs(lx[i])) * 1000; // mm to the side joint
    const gf = side < 1.6 ? 1 - side / 1.6 : 0;
    let sh = 1;
    const reach = 16 + drop[k] * 1000;
    if (vmm < reach) {
      const t = 1 - vmm / reach;
      sh = 1 - 0.55 * t * t;
    }
    const c = cleft[j] - 0.5;
    const f = wn[i] - 0.5;
    const m = sh * (1 + c * 0.22 + (mot[j] - 0.5) * 0.14 + f * 0.05) * (1 - gf * 0.7);
    const o4 = i * 4;
    rgba[o4] = cr[k] * m;
    rgba[o4 + 1] = cg[k] * m;
    rgba[o4 + 2] = cb[k] * m;
    height[i] = v * 7 + lift[k] + c * 1.1 + f * 0.1 - gf * 5;
    rough[i] = 0.58 + c * 0.2 + gf * 0.3;
  }
  return s;
}
