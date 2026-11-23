/**
 * Procedural surface textures for the ready-made kitchens (private to `kitchenSets.ts`):
 * wall tiles (subway, square, zellige, herringbone, vertical stack) with real grout lines and a
 * matching bump map. Everything is drawn on canvases at runtime – no image files.
 *
 * Textures are in METERS: materials are flagged `uvMeters` so `Kit.box` maps 1 UV unit to 1 m and
 * the repeat below makes one canvas cover `PERIOD` meters.
 */
import * as THREE from 'three';
import { M, darken, lighten, mix, rng } from '../kit';

export type TilePattern = 'subway' | 'square' | 'zellige' | 'herring' | 'vstack' | 'brick';

const hasDom = typeof document !== 'undefined';
const texCache = new Map<string, THREE.CanvasTexture | null>();
const matCache = new Map<string, THREE.Material>();

/** meters covered by one canvas, per pattern */
const PERIOD: Record<TilePattern, number> = {
  subway: 0.3,
  square: 0.4,
  zellige: 0.4,
  herring: 0.34,
  vstack: 0.3,
  brick: 0.48,
};

function canvasTex(key: string, size: number, srgb: boolean, draw: (c: CanvasRenderingContext2D, s: number) => void): THREE.CanvasTexture | null {
  if (texCache.has(key)) return texCache.get(key) ?? null;
  let tex: THREE.CanvasTexture | null = null;
  if (hasDom) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const c = cv.getContext('2d');
    if (c) {
      draw(c, size);
      tex = new THREE.CanvasTexture(cv);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      tex.anisotropy = 4;
    }
  }
  texCache.set(key, tex);
  return tex;
}

interface TileRect {
  x: number;
  y: number;
  w: number;
  h: number;
  /** rotation in radians around the rect centre (herringbone) */
  rot?: number;
}

/** The tiles of one period, in canvas pixels (the canvas is `s` × `s`). */
function tileRects(p: TilePattern, s: number): TileRect[] {
  const out: TileRect[] = [];
  if (p === 'subway' || p === 'brick') {
    // running bond: 2 columns × 4 rows (subway 7.5 × 15 cm in 30 cm) / 2 × 8 bricks (6 × 24 cm in 48 cm)
    const rows = p === 'subway' ? 4 : 8;
    const tw = s / 2;
    const th = s / rows;
    for (let r = 0; r < rows; r++) {
      const off = r % 2 ? tw / 2 : 0;
      for (let i = -1; i < 3; i++) out.push({ x: i * tw + off, y: r * th, w: tw, h: th });
    }
  } else if (p === 'square' || p === 'zellige') {
    const n = 4;
    const t = s / n;
    for (let r = 0; r < n; r++) for (let i = 0; i < n; i++) out.push({ x: i * t, y: r * t, w: t, h: t });
  } else if (p === 'vstack') {
    // 5 × 30 cm finger tiles, stacked vertically
    const n = 6;
    const t = s / n;
    for (let i = 0; i < n; i++) out.push({ x: i * t, y: 0, w: t, h: s });
  } else {
    // herringbone of 2:1 planks, built axis-aligned on a cell grid (H plank [k,k+2]×[k,k+1], V plank
    // [k,k+1]×[k+1,k+3], strips repeated by (2,-2)) and turned 45°; one period = 4·√2 cells
    const w = s / (4 * Math.SQRT2);
    const add = (cx: number, cy: number, rw: number, rh: number) => {
      const X = ((cx - cy) * w) / Math.SQRT2;
      const Y = ((cx + cy) * w) / Math.SQRT2;
      if (X >= 0 && X < s && Y >= 0 && Y < s) out.push({ x: X, y: Y, w: rw * w, h: rh * w, rot: Math.PI / 4 });
    };
    for (let k = -24; k <= 24; k++) {
      for (let t = -12; t <= 12; t++) {
        add(k + 1 + 2 * t, k + 0.5 - 2 * t, 2, 1);
        add(k + 0.5 + 2 * t, k + 2 - 2 * t, 1, 2);
      }
    }
  }
  return out;
}

function drawRect(c: CanvasRenderingContext2D, t: TileRect, inset: number, s: number): void {
  // draw with wrap copies so the canvas tiles seamlessly
  for (const ox of [-s, 0, s]) {
    for (const oy of [-s, 0, s]) {
      c.save();
      if (t.rot) {
        c.translate(t.x + ox, t.y + oy);
        c.rotate(t.rot);
        c.fillRect(-t.w / 2 + inset, -t.h / 2 + inset, t.w - inset * 2, t.h - inset * 2);
      } else {
        c.fillRect(t.x + ox + inset, t.y + oy + inset, t.w - inset * 2, t.h - inset * 2);
      }
      c.restore();
    }
  }
}

/** Colour map: tiles with a little tone variation (a lot for zellige) on a grout background. */
function tileColorTex(p: TilePattern, color: string, grout: string): THREE.CanvasTexture | null {
  return canvasTex(`tile|${p}|${color}|${grout}`, 256, true, (c, s) => {
    const r = rng(p.length * 131 + 7);
    c.fillStyle = grout;
    c.fillRect(0, 0, s, s);
    const g = p === 'zellige' ? 2.2 : p === 'herring' ? 1.6 : 1.8;
    const varAmt = p === 'zellige' ? 0.16 : 0.05;
    for (const t of tileRects(p, s)) {
      const v = (r() - 0.5) * 2 * varAmt;
      const base = v > 0 ? lighten(color, v) : darken(color, -v);
      c.fillStyle = base;
      drawRect(c, t, g, s);
      if (p === 'zellige') {
        // hand-made glaze: a darker pooled edge and a lighter centre
        c.fillStyle = mix(base, '#ffffff', 0.08);
        drawRect(c, t, g + 6 + r() * 4, s);
      }
    }
  });
}

/** Grayscale relief: grout recessed (dark), tiles raised with soft bevelled edges. */
function tileBumpTex(p: TilePattern): THREE.CanvasTexture | null {
  return canvasTex(`tilebump|${p}`, 256, false, (c, s) => {
    c.fillStyle = '#202020';
    c.fillRect(0, 0, s, s);
    const g = p === 'zellige' ? 2.2 : 1.8;
    for (const t of tileRects(p, s)) {
      c.fillStyle = '#9a9a9a';
      drawRect(c, t, g, s);
      c.fillStyle = '#d8d8d8';
      drawRect(c, t, g + 2.5, s);
      if (p === 'zellige') {
        c.fillStyle = '#e8e8e8';
        drawRect(c, t, g + 9, s);
      }
    }
  });
}

function repeated(tex: THREE.CanvasTexture | null, period: number): THREE.Texture | null {
  if (!tex) return null;
  const t = tex.clone();
  t.repeat.set(1 / period, 1 / period);
  t.needsUpdate = true;
  return t;
}

/** Glazed wall tiles in `color` with `grout` joints (UVs in meters, see `Kit.box`). */
export function tileMat(p: TilePattern, color: string, grout?: string): THREE.Material {
  const gr = grout ?? (luma(color) > 0.55 ? darken(color, 0.12) : lighten(color, 0.35));
  const key = `ktile|${p}|${color}|${gr}`;
  let m = matCache.get(key);
  if (!m) {
    const map = repeated(tileColorTex(p, color, gr), PERIOD[p]);
    const bump = repeated(tileBumpTex(p), PERIOD[p]);
    const mm = new THREE.MeshPhysicalMaterial({
      color: map ? '#ffffff' : color,
      map,
      bumpMap: bump,
      bumpScale: 1.2,
      roughness: p === 'brick' ? 0.6 : 0.3,
      metalness: 0,
      clearcoat: p === 'zellige' ? 0.8 : 0.35,
      clearcoatRoughness: 0.15,
    });
    mm.userData.uvMeters = true;
    mm.name = key;
    m = mm;
    matCache.set(key, m);
  }
  return m;
}

/** perceived brightness 0..1 of a CSS hex colour */
export function luma(c: string): number {
  let h = c.replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h.slice(0, 6), 16);
  if (!Number.isFinite(n)) return 0.5;
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

/**
 * Stone / quartz / concrete with the soft mottling of `M.stone`, but mapped in METERS (so a long
 * backsplash or a row of concrete fronts shows the same grain as the worktop instead of one
 * stretched blotch). `bump` > 0 adds a faint pitted relief (concrete).
 */
export function stoneMat(color: string, rough: number, bump = 0): THREE.Material {
  const key = `kstone|${color}|${rough}|${bump}`;
  let m = matCache.get(key);
  if (!m) {
    const src = (M.stone(color, rough) as THREE.MeshStandardMaterial).map;
    const map = src ? src.clone() : null;
    if (map) {
      map.repeat.set(1.4, 1.4);
      map.needsUpdate = true;
    }
    const mm = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, map, bumpMap: bump > 0 ? map : null, bumpScale: bump });
    mm.userData.uvMeters = true;
    mm.name = key;
    m = mm;
    matCache.set(key, m);
  }
  return m;
}

/** Engineered quartz / granite: fine speckles (granite: coarser flecks with more contrast). */
function speckleTex(coarse: boolean): THREE.CanvasTexture | null {
  return canvasTex(`speckle|${coarse}`, 256, true, (c, s) => {
    const r = rng(coarse ? 77 : 33);
    c.fillStyle = '#f2f2f2';
    c.fillRect(0, 0, s, s);
    // faint cloudy variation
    for (let i = 0; i < 40; i++) {
      const x = r() * s;
      const y = r() * s;
      const rad = 20 + r() * 50;
      const g = c.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, `rgba(${r() > 0.5 ? '255,255,255' : '215,215,215'},0.07)`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g;
      for (const ox of [-s, 0, s]) for (const oy of [-s, 0, s]) c.fillRect(x - rad + ox, y - rad + oy, rad * 2, rad * 2);
    }
    const n = coarse ? 1400 : 2600;
    for (let i = 0; i < n; i++) {
      const v = coarse ? Math.floor(60 + r() * 170) : Math.floor(120 + r() * 110);
      const a = coarse ? 0.7 : 0.6;
      c.fillStyle = `rgba(${v},${v},${v},${a})`;
      const rad = coarse ? 0.6 + r() * 2.2 : 0.4 + r() * 1.1;
      const x = r() * s;
      const y = r() * s;
      c.beginPath();
      c.arc(x, y, rad, 0, Math.PI * 2);
      c.fill();
    }
  });
}

/** Speckled quartz / granite worktop material (UVs in meters). */
export function quartzMat(color: string, rough: number, coarse = false): THREE.Material {
  const key = `kquartz|${color}|${rough}|${coarse}`;
  let m = matCache.get(key);
  if (!m) {
    const map = repeated(speckleTex(coarse), 0.45);
    const mm = new THREE.MeshPhysicalMaterial({ color, roughness: rough, metalness: 0, map, clearcoat: coarse ? 0.6 : 0.25, clearcoatRoughness: 0.2 });
    mm.userData.uvMeters = true;
    mm.name = key;
    m = mm;
    matCache.set(key, m);
  }
  return m;
}
