/**
 * Furniture kit: cached PBR materials, geometry helpers, a small fluent builder and
 * 2D plan-symbol drawing helpers. Everything is procedural (no network assets).
 *
 * Conventions used by the builder (`Kit`): every primitive is positioned by the CENTER of its
 * footprint in x/z and by its BOTTOM in y (like furniture standing on a floor), unless noted.
 */
import * as THREE from 'three';
import { addWind } from '../render3d/effects';
import { getMaxAnisotropy } from '../materials/textureGen';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type V3 = [number, number, number];

/* ------------------------------------------------------------------------------------------ */
/* Palette                                                                                     */
/* ------------------------------------------------------------------------------------------ */

export const PAL = {
  oak: '#c9a777',
  oakLight: '#dcc39c',
  birch: '#e3d2b4',
  walnut: '#7b5538',
  darkWood: '#4d382b',
  teak: '#a9754a',
  white: '#f3f1ec',
  cream: '#ebe4d6',
  linen: '#d9d0c1',
  sand: '#cdbfa8',
  warmGrey: '#b3ada3',
  grey: '#8b8d8f',
  charcoal: '#3b3f45',
  black: '#1e1f22',
  sage: '#9bae8a',
  olive: '#7c8a5c',
  dustyBlue: '#8ea5b7',
  navy: '#3d5166',
  terracotta: '#c7775a',
  blush: '#dcb3a6',
  mustard: '#d6a544',
  leaf: '#4f7d3c',
  leafDark: '#35602f',
  leafLight: '#7fa651',
  steel: '#c4c7ca',
  brass: '#c9a35a',
  stone: '#e4e1db',
  concrete: '#a9a8a4',
} as const;

/* ------------------------------------------------------------------------------------------ */
/* Color utilities                                                                             */
/* ------------------------------------------------------------------------------------------ */

function parseHex(c: string): [number, number, number] {
  let h = c.trim().replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h.slice(0, 6), 16);
  if (!Number.isFinite(n)) return [128, 128, 128];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Linear mix of two CSS hex colors (in sRGB space, good enough for UI/plan tints). */
export function mix(a: string, b: string, t: number): string {
  const A = parseHex(a);
  const B = parseHex(b);
  const k = Math.min(1, Math.max(0, t));
  const ch = (i: number) =>
    Math.round(A[i] + (B[i] - A[i]) * k)
      .toString(16)
      .padStart(2, '0');
  return `#${ch(0)}${ch(1)}${ch(2)}`;
}
export const lighten = (c: string, t: number): string => mix(c, '#ffffff', t);
export const darken = (c: string, t: number): string => mix(c, '#000000', t);

/* ------------------------------------------------------------------------------------------ */
/* Deterministic randomness                                                                    */
/* ------------------------------------------------------------------------------------------ */

/** mulberry32 – deterministic PRNG so every build of an item looks identical. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash3(x: number, y: number, z: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453123;
  return s - Math.floor(s);
}

/** Smooth 3D value noise in 0..1. */
export function noise3(x: number, y: number, z: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = x - xi;
  const yf = y - yi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const w = zf * zf * (3 - 2 * zf);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  return l(
    l(
      l(hash3(xi, yi, zi), hash3(xi + 1, yi, zi), u),
      l(hash3(xi, yi + 1, zi), hash3(xi + 1, yi + 1, zi), u),
      v,
    ),
    l(
      l(hash3(xi, yi, zi + 1), hash3(xi + 1, yi, zi + 1), u),
      l(hash3(xi, yi + 1, zi + 1), hash3(xi + 1, yi + 1, zi + 1), u),
      v,
    ),
    w,
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Procedural textures (lazy, shared)                                                          */
/* ------------------------------------------------------------------------------------------ */

const hasDom = typeof document !== 'undefined';
const texCache = new Map<string, THREE.CanvasTexture | null>();

function canvasTexture(
  key: string,
  size: number,
  draw: (c: CanvasRenderingContext2D, s: number) => void,
  srgb: boolean,
): THREE.CanvasTexture | null {
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
      tex.anisotropy = getMaxAnisotropy();
    }
  }
  texCache.set(key, tex);
  return tex;
}

/** Wood grain: near-white base with soft darker/lighter streaks running along U. */
function grainTexture(): THREE.CanvasTexture | null {
  return canvasTexture(
    'grain',
    256,
    (c, s) => {
      const r = rng(7);
      c.fillStyle = '#ececec';
      c.fillRect(0, 0, s, s);
      // broad tonal bands
      for (let i = 0; i < 14; i++) {
        const y = r() * s;
        const h = 8 + r() * 30;
        c.fillStyle = r() > 0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(60,35,10,0.06)';
        c.fillRect(0, y, s, h);
      }
      // fine streaks (tileable along x through integer frequencies)
      for (let i = 0; i < 130; i++) {
        const y0 = r() * s;
        const amp = 0.5 + r() * 3;
        const f = 1 + Math.floor(r() * 3);
        const ph = r() * Math.PI * 2;
        c.strokeStyle =
          r() > 0.3 ? `rgba(70,40,15,${0.05 + r() * 0.16})` : `rgba(255,255,255,${0.08 + r() * 0.15})`;
        c.lineWidth = 0.6 + r() * 1.6;
        c.beginPath();
        for (let x = 0; x <= s; x += 8) {
          const y = y0 + Math.sin((x / s) * Math.PI * 2 * f + ph) * amp;
          if (x === 0) c.moveTo(x, y);
          else c.lineTo(x, y);
        }
        c.stroke();
      }
    },
    true,
  );
}

/** Woven fabric: fine light/dark weave with per-thread noise. Used as map and bump map. */
function weaveTexture(): THREE.CanvasTexture | null {
  return canvasTexture(
    'weave',
    64,
    (c, s) => {
      const r = rng(11);
      const img = c.createImageData(s, s);
      for (let y = 0; y < s; y++) {
        for (let x = 0; x < s; x++) {
          const over = ((x >> 1) + (y >> 1)) % 2 === 0;
          const thread = over ? x % 2 : y % 2;
          let v = 226 + (over ? 12 : 0) + thread * 8 + (r() - 0.5) * 22;
          v = Math.max(0, Math.min(255, v));
          const i = (y * s + x) * 4;
          img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
          img.data[i + 3] = 255;
        }
      }
      c.putImageData(img, 0, 0);
    },
    true,
  );
}

/** Soft blotchy noise (leather, stone, foliage, plaster). */
function noiseTexture(): THREE.CanvasTexture | null {
  return canvasTexture(
    'noise',
    128,
    (c, s) => {
      const img = c.createImageData(s, s);
      for (let y = 0; y < s; y++) {
        for (let x = 0; x < s; x++) {
          // tileable: sample noise on a torus-ish domain
          const a = (x / s) * Math.PI * 2;
          const b = (y / s) * Math.PI * 2;
          const n =
            noise3(Math.cos(a) * 3 + 5, Math.sin(a) * 3 + 5, Math.cos(b) * 3) * 0.6 +
            noise3(Math.cos(a) * 9 + 20, Math.sin(a) * 9 + 20, Math.sin(b) * 9) * 0.4;
          const v = 205 + n * 50;
          const i = (y * s + x) * 4;
          img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
          img.data[i + 3] = 255;
        }
      }
      c.putImageData(img, 0, 0);
    },
    true,
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Extra procedural textures: soft furnishings, natural materials, art and rug patterns          */
/* ------------------------------------------------------------------------------------------ */

type TexKind = 'grain' | 'weave' | 'noise' | 'boucle' | 'slub' | 'knit' | 'rattan' | 'wicker' | 'marble' | 'terrazzo' | 'brushed' | 'fur' | 'velour';

/** Bouclé: dense little loops of yarn. */
function boucleTexture(): THREE.CanvasTexture | null {
  return canvasTexture(
    'boucle',
    128,
    (c, s) => {
      const r = rng(31);
      c.fillStyle = '#c8c8c8';
      c.fillRect(0, 0, s, s);
      for (let i = 0; i < 900; i++) {
        const x = r() * s;
        const y = r() * s;
        const rad = 1.5 + r() * 3.2;
        const v = 150 + Math.floor(r() * 105);
        c.strokeStyle = `rgb(${v},${v},${v})`;
        c.lineWidth = 0.8 + r() * 1.2;
        for (const [ox, oy] of [[0, 0], [s, 0], [-s, 0], [0, s], [0, -s]]) {
          c.beginPath();
          c.arc(x + ox, y + oy, rad, 0, Math.PI * 2);
          c.stroke();
        }
      }
    },
    true,
  );
}

/** Linen: irregular slubby threads in both directions. */
function slubTexture(): THREE.CanvasTexture | null {
  return canvasTexture(
    'slub',
    128,
    (c, s) => {
      const r = rng(41);
      const img = c.createImageData(s, s);
      const rows = new Float32Array(s);
      const cols = new Float32Array(s);
      for (let i = 0; i < s; i++) {
        rows[i] = (r() - 0.5) * 26 + (r() > 0.93 ? 22 : 0);
        cols[i] = (r() - 0.5) * 20 + (r() > 0.95 ? 18 : 0);
      }
      for (let y = 0; y < s; y++) {
        for (let x = 0; x < s; x++) {
          const over = (x + y) % 2 === 0;
          const v = 218 + (over ? rows[y] : cols[x]) + (r() - 0.5) * 10;
          const i = (y * s + x) * 4;
          img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.max(0, Math.min(255, v));
          img.data[i + 3] = 255;
        }
      }
      c.putImageData(img, 0, 0);
    },
    true,
  );
}

/** Chunky knit: columns of V-shaped stitches. */
function knitTexture(): THREE.CanvasTexture | null {
  return canvasTexture(
    'knit',
    128,
    (c, s) => {
      c.fillStyle = '#7a7a7a';
      c.fillRect(0, 0, s, s);
      const cw = s / 8;
      const ch = s / 10;
      for (let col = 0; col < 8; col++) {
        for (let row = 0; row < 11; row++) {
          const x = col * cw;
          const y = row * ch - ch / 2;
          for (const side of [-1, 1]) {
            const g = c.createLinearGradient(x + cw / 2, y, x + cw / 2 + side * cw * 0.45, y + ch);
            g.addColorStop(0, '#e9e9e9');
            g.addColorStop(1, '#a5a5a5');
            c.fillStyle = g;
            c.beginPath();
            c.ellipse(x + cw / 2 + side * cw * 0.22, y + ch * 0.55, cw * 0.22, ch * 0.62, -side * 0.55, 0, Math.PI * 2);
            c.fill();
          }
        }
      }
    },
    true,
  );
}

/** Woven cane (rattan webbing): octagonal open weave on a dark backing. */
function rattanTexture(): THREE.CanvasTexture | null {
  return canvasTexture(
    'rattan',
    128,
    (c, s) => {
      c.fillStyle = '#3a3a3a';
      c.fillRect(0, 0, s, s);
      const n = 8;
      const step = s / n;
      c.lineCap = 'round';
      const strand = (x0: number, y0: number, x1: number, y1: number) => {
        c.strokeStyle = '#d9d9d9';
        c.lineWidth = step * 0.22;
        c.beginPath();
        c.moveTo(x0, y0);
        c.lineTo(x1, y1);
        c.stroke();
        c.strokeStyle = 'rgba(255,255,255,0.35)';
        c.lineWidth = step * 0.06;
        c.stroke();
      };
      for (let i = -n; i <= 2 * n; i++) {
        strand(i * step, 0, i * step, s);
        strand(0, i * step, s, i * step);
        strand(i * step, 0, i * step + s, s);
        strand(i * step + s, 0, i * step, s);
      }
    },
    true,
  );
}

/** Basket weave (wicker): over-under thick strands. */
function wickerTexture(): THREE.CanvasTexture | null {
  return canvasTexture(
    'wicker',
    128,
    (c, s) => {
      const n = 8;
      const st = s / n;
      c.fillStyle = '#4a4a4a';
      c.fillRect(0, 0, s, s);
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          const horiz = (i + j) % 2 === 0;
          const g = horiz ? c.createLinearGradient(0, j * st, 0, j * st + st) : c.createLinearGradient(i * st, 0, i * st + st, 0);
          g.addColorStop(0, '#9a9a9a');
          g.addColorStop(0.5, '#eeeeee');
          g.addColorStop(1, '#9a9a9a');
          c.fillStyle = g;
          if (horiz) c.fillRect(i * st - 1, j * st + st * 0.12, st + 2, st * 0.76);
          else c.fillRect(i * st + st * 0.12, j * st - 1, st * 0.76, st + 2);
        }
      }
    },
    true,
  );
}

/** Marble: soft cloudy base with thin dark veins. White-ish so it can be tinted. */
function marbleTexture(): THREE.CanvasTexture | null {
  return canvasTexture(
    'marble',
    256,
    (c, s) => {
      const img = c.createImageData(s, s);
      for (let y = 0; y < s; y++) {
        for (let x = 0; x < s; x++) {
          const a = (x / s) * Math.PI * 2;
          const b = (y / s) * Math.PI * 2;
          const px = Math.cos(a) * 1.6;
          const py = Math.sin(a) * 1.6;
          const pz = Math.cos(b) * 1.6;
          const pw = Math.sin(b) * 1.6;
          const turb = noise3(px + 3, py + pz, pw) * 1.0 + noise3(px * 2.3, py * 2.3 + 7, pz * 2.3 + pw) * 0.5 + noise3(px * 5, py * 5, pz * 5 + pw * 3) * 0.25;
          const v = Math.abs(Math.sin((x / s) * Math.PI * 2 + (y / s) * Math.PI * 4 + turb * 6.5));
          const vein = Math.pow(1 - v, 14);
          const cloud = noise3(px * 3 + 9, py * 3, pz * 3 + pw) * 0.12;
          const val = 250 - cloud * 120 - vein * 150;
          const i = (y * s + x) * 4;
          img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.max(0, Math.min(255, val));
          img.data[i + 3] = 255;
        }
      }
      c.putImageData(img, 0, 0);
    },
    true,
  );
}

/** Terrazzo: stone chips of a few tones scattered on a light ground (colour in the texture). */
function terrazzoTexture(): THREE.CanvasTexture | null {
  return canvasTexture(
    'terrazzo',
    256,
    (c, s) => {
      const r = rng(53);
      c.fillStyle = '#f1eee8';
      c.fillRect(0, 0, s, s);
      const tones = ['#c7775a', '#8a8d90', '#3b3f45', '#d9c6a5', '#9bae8a', '#e6b9a8', '#ffffff'];
      for (let i = 0; i < 420; i++) {
        const x = r() * s;
        const y = r() * s;
        const rad = 1.5 + Math.pow(r(), 3) * 9;
        c.fillStyle = tones[Math.floor(r() * tones.length)];
        c.beginPath();
        const n = 5 + Math.floor(r() * 3);
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2 + r() * 0.5;
          const rr = rad * (0.6 + r() * 0.5);
          const px = x + Math.cos(a) * rr;
          const py = y + Math.sin(a) * rr;
          if (k === 0) c.moveTo(px, py);
          else c.lineTo(px, py);
        }
        c.closePath();
        c.fill();
      }
    },
    true,
  );
}

/** Brushed metal: fine streaks along U (used as roughness map + subtle color variation). */
function brushedTexture(): THREE.CanvasTexture | null {
  return canvasTexture(
    'brushed',
    128,
    (c, s) => {
      const r = rng(61);
      c.fillStyle = '#9a9a9a';
      c.fillRect(0, 0, s, s);
      for (let i = 0; i < 500; i++) {
        const y = r() * s;
        const v = 120 + Math.floor(r() * 110);
        c.fillStyle = `rgba(${v},${v},${v},0.5)`;
        c.fillRect(0, y, s, 0.6 + r() * 0.8);
      }
    },
    false,
  );
}

/** Short fur / plush: fine directional strands. */
function furTexture(): THREE.CanvasTexture | null {
  return canvasTexture(
    'fur',
    128,
    (c, s) => {
      const r = rng(71);
      c.fillStyle = '#bdbdbd';
      c.fillRect(0, 0, s, s);
      for (let i = 0; i < 2600; i++) {
        const x = r() * s;
        const y = r() * s;
        const v = 150 + Math.floor(r() * 105);
        c.strokeStyle = `rgba(${v},${v},${v},0.7)`;
        c.lineWidth = 0.7;
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x + (r() - 0.5) * 2, y + 3 + r() * 4);
        c.stroke();
      }
    },
    true,
  );
}

/** Velour / velvet pile: very fine soft noise. */
function velourTexture(): THREE.CanvasTexture | null {
  return canvasTexture(
    'velour',
    128,
    (c, s) => {
      const r = rng(83);
      const img = c.createImageData(s, s);
      for (let y = 0; y < s; y++) {
        for (let x = 0; x < s; x++) {
          const a = (x / s) * Math.PI * 2;
          const b = (y / s) * Math.PI * 2;
          const n = noise3(Math.cos(a) * 2 + 4, Math.sin(a) * 2 + 4, Math.cos(b) * 2 + Math.sin(b));
          const v = 226 + (n - 0.5) * 34 + (r() - 0.5) * 8;
          const i = (y * s + x) * 4;
          img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
          img.data[i + 3] = 255;
        }
      }
      c.putImageData(img, 0, 0);
    },
    true,
  );
}

const EXTRA_TEX: Record<string, () => THREE.CanvasTexture | null> = {
  boucle: boucleTexture,
  slub: slubTexture,
  knit: knitTexture,
  rattan: rattanTexture,
  wicker: wickerTexture,
  marble: marbleTexture,
  terrazzo: terrazzoTexture,
  brushed: brushedTexture,
  fur: furTexture,
  velour: velourTexture,
};

/* ---------------------------------------------------------------- art & patterns (0..1 UVs) */

export type ArtStyle = 'abstract' | 'geometric' | 'landscape' | 'lines' | 'botanical' | 'sea' | 'stripes' | 'city' | 'circles' | 'mountains' | 'sunset' | 'portrait';
export type RugStyle = 'persian' | 'kilim' | 'stripes' | 'lattice' | 'shag' | 'border' | 'abstract' | 'checker' | 'diamond' | 'solid';

function drawArt(c: CanvasRenderingContext2D, s: number, style: ArtStyle, seed: number, pal: string[]): void {
  const r = rng(seed * 977 + style.length * 13);
  const pick = () => pal[Math.floor(r() * pal.length)];
  const bg = pal[0];
  c.fillStyle = bg;
  c.fillRect(0, 0, s, s);
  const brush = (x: number, y: number, rad: number, col: string, alpha = 0.85) => {
    c.globalAlpha = alpha;
    c.fillStyle = col;
    c.beginPath();
    const n = 9;
    for (let k = 0; k <= n; k++) {
      const a = (k / n) * Math.PI * 2;
      const rr = rad * (0.7 + r() * 0.5);
      const px = x + Math.cos(a) * rr;
      const py = y + Math.sin(a) * rr * (0.6 + r() * 0.5);
      if (k === 0) c.moveTo(px, py);
      else c.quadraticCurveTo(x + Math.cos(a - 0.3) * rr * 1.2, y + Math.sin(a - 0.3) * rr * 1.1, px, py);
    }
    c.fill();
    c.globalAlpha = 1;
  };
  switch (style) {
    case 'abstract':
      for (let i = 0; i < 14; i++) brush(r() * s, r() * s, s * (0.08 + r() * 0.22), pick(), 0.55 + r() * 0.4);
      for (let i = 0; i < 6; i++) {
        c.strokeStyle = pick();
        c.lineWidth = s * (0.006 + r() * 0.02);
        c.beginPath();
        c.moveTo(r() * s, r() * s);
        c.bezierCurveTo(r() * s, r() * s, r() * s, r() * s, r() * s, r() * s);
        c.stroke();
      }
      break;
    case 'geometric': {
      const g = 3 + Math.floor(r() * 2);
      const cs = s / g;
      for (let i = 0; i < g; i++) {
        for (let j = 0; j < g; j++) {
          c.fillStyle = pick();
          c.fillRect(i * cs, j * cs, cs, cs);
          c.fillStyle = pick();
          const t = Math.floor(r() * 4);
          c.beginPath();
          if (t === 0) c.arc(i * cs + cs / 2, j * cs + cs / 2, cs * 0.38, 0, Math.PI * 2);
          else if (t === 1) {
            c.moveTo(i * cs, j * cs + cs);
            c.lineTo(i * cs + cs, j * cs + cs);
            c.lineTo(i * cs + cs, j * cs);
          } else if (t === 2) c.arc(i * cs, j * cs + cs, cs, -Math.PI / 2, 0);
          else c.rect(i * cs + cs * 0.25, j * cs, cs * 0.5, cs);
          c.fill();
        }
      }
      break;
    }
    case 'landscape':
    case 'mountains':
    case 'sunset': {
      const sky = c.createLinearGradient(0, 0, 0, s * 0.65);
      sky.addColorStop(0, style === 'sunset' ? pal[1] : pal[0]);
      sky.addColorStop(1, style === 'sunset' ? pal[2] : lighten(pal[0], 0.4));
      c.fillStyle = sky;
      c.fillRect(0, 0, s, s);
      c.fillStyle = style === 'sunset' ? '#fff1c9' : lighten(pal[2], 0.5);
      c.beginPath();
      c.arc(s * (0.25 + r() * 0.5), s * (style === 'sunset' ? 0.55 : 0.25), s * 0.08, 0, Math.PI * 2);
      c.fill();
      const layers = style === 'mountains' ? 4 : 3;
      for (let l = 0; l < layers; l++) {
        const base = s * (0.45 + l * 0.14);
        c.fillStyle = mix(pal[3] ?? pal[1], pal[4] ?? '#2b3a2f', l / Math.max(1, layers - 1));
        c.beginPath();
        c.moveTo(0, s);
        for (let x = 0; x <= s; x += s / 32) {
          const amp = style === 'mountains' ? s * 0.16 : s * 0.05;
          const y = base - Math.abs(Math.sin(x / s * (2 + l) * Math.PI + seed + l)) * amp - noise3(x / s * 5, l, seed) * amp * 0.6;
          c.lineTo(x, y);
        }
        c.lineTo(s, s);
        c.fill();
      }
      break;
    }
    case 'lines':
      c.strokeStyle = pal[1];
      c.lineWidth = s * 0.008;
      for (let i = 0; i < 3; i++) {
        c.beginPath();
        let x = s * (0.2 + r() * 0.6);
        let y = s * 0.15;
        c.moveTo(x, y);
        for (let k = 0; k < 6; k++) {
          const nx = s * (0.15 + r() * 0.7);
          const ny = y + s * 0.12;
          c.bezierCurveTo(x + (r() - 0.5) * s * 0.4, y + s * 0.05, nx + (r() - 0.5) * s * 0.4, ny - s * 0.05, nx, ny);
          x = nx;
          y = ny;
        }
        c.stroke();
      }
      brush(s * (0.3 + r() * 0.4), s * (0.3 + r() * 0.4), s * 0.12, pal[2] ?? pal[1], 0.7);
      break;
    case 'botanical':
      for (let i = 0; i < 7; i++) {
        const x0 = s * (0.15 + r() * 0.7);
        const y0 = s;
        const ang = -Math.PI / 2 + (r() - 0.5) * 0.9;
        const len = s * (0.45 + r() * 0.4);
        const col = pick() === bg ? pal[1] : pick();
        c.strokeStyle = col;
        c.fillStyle = col;
        c.lineWidth = s * 0.006;
        c.beginPath();
        c.moveTo(x0, y0);
        const x1 = x0 + Math.cos(ang) * len;
        const y1 = y0 + Math.sin(ang) * len;
        c.lineTo(x1, y1);
        c.stroke();
        for (let k = 1; k < 9; k++) {
          const t = k / 9;
          const px = x0 + (x1 - x0) * t;
          const py = y0 + (y1 - y0) * t;
          for (const side of [-1, 1]) {
            c.save();
            c.translate(px, py);
            c.rotate(ang + side * 0.9);
            c.beginPath();
            c.ellipse(s * 0.04, 0, s * 0.045 * (1 - t * 0.5), s * 0.014, 0, 0, Math.PI * 2);
            c.fill();
            c.restore();
          }
        }
      }
      break;
    case 'sea': {
      const g = c.createLinearGradient(0, 0, 0, s);
      g.addColorStop(0, lighten(pal[0], 0.3));
      g.addColorStop(0.45, pal[0]);
      g.addColorStop(1, pal[1]);
      c.fillStyle = g;
      c.fillRect(0, 0, s, s);
      for (let i = 0; i < 18; i++) {
        const y = s * (0.45 + (i / 18) * 0.55);
        c.strokeStyle = `rgba(255,255,255,${0.15 + r() * 0.35})`;
        c.lineWidth = s * 0.004;
        c.beginPath();
        for (let x = 0; x <= s; x += 8) c.lineTo(x, y + Math.sin(x * 0.05 + i) * s * 0.006);
        c.stroke();
      }
      c.fillStyle = pal[2] ?? '#f4e3c3';
      c.beginPath();
      c.moveTo(0, s);
      c.quadraticCurveTo(s * 0.4, s * 0.8, s, s * 0.92);
      c.lineTo(s, s);
      c.fill();
      break;
    }
    case 'stripes': {
      const n = 5 + Math.floor(r() * 6);
      for (let i = 0; i < n; i++) {
        c.fillStyle = pal[i % pal.length];
        c.fillRect(0, (i / n) * s, s, s / n + 1);
      }
      break;
    }
    case 'city': {
      const g = c.createLinearGradient(0, 0, 0, s);
      g.addColorStop(0, '#1c2440');
      g.addColorStop(1, pal[1]);
      c.fillStyle = g;
      c.fillRect(0, 0, s, s);
      let x = 0;
      while (x < s) {
        const bw = s * (0.05 + r() * 0.1);
        const bh = s * (0.25 + r() * 0.5);
        c.fillStyle = mix('#11131c', pal[2] ?? '#30344a', r() * 0.6);
        c.fillRect(x, s - bh, bw, bh);
        c.fillStyle = '#ffd98a';
        for (let wy = s - bh + 6; wy < s - 6; wy += 9) for (let wx = x + 3; wx < x + bw - 4; wx += 7) if (r() > 0.55) c.fillRect(wx, wy, 3, 4);
        x += bw + 2;
      }
      break;
    }
    case 'circles':
      for (let i = 0; i < 6; i++) {
        c.fillStyle = pick();
        c.globalAlpha = 0.85;
        c.beginPath();
        c.arc(s * (0.2 + r() * 0.6), s * (0.2 + r() * 0.6), s * (0.08 + r() * 0.22), 0, Math.PI * 2);
        c.fill();
      }
      c.globalAlpha = 1;
      break;
    case 'portrait':
      c.fillStyle = pal[1];
      c.beginPath();
      c.ellipse(s * 0.5, s * 0.42, s * 0.17, s * 0.22, 0, 0, Math.PI * 2);
      c.fill();
      c.fillRect(s * 0.44, s * 0.6, s * 0.12, s * 0.12);
      c.beginPath();
      c.ellipse(s * 0.5, s, s * 0.34, s * 0.3, 0, Math.PI, Math.PI * 2);
      c.fillStyle = pal[2] ?? pal[1];
      c.fill();
      c.fillStyle = pal[3] ?? darken(pal[1], 0.5);
      c.beginPath();
      c.ellipse(s * 0.5, s * 0.28, s * 0.2, s * 0.12, 0, Math.PI, Math.PI * 2);
      c.fill();
      break;
  }
  // canvas grain
  const img = c.getImageData(0, 0, s, s);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * 14;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  c.putImageData(img, 0, 0);
}

function drawRug(c: CanvasRenderingContext2D, s: number, style: RugStyle, pal: string[], aspect: number): void {
  const [a, b, d = darken(pal[1], 0.3), e = lighten(pal[0], 0.3)] = pal;
  const W = s;
  const H = s;
  c.fillStyle = a;
  c.fillRect(0, 0, W, H);
  // keep motifs square on non-square rugs: work in "units" where x spans aspect
  const ux = (v: number) => (v / aspect) * W;
  switch (style) {
    case 'persian': {
      const bw = H * 0.08;
      c.fillStyle = b;
      c.fillRect(0, 0, W, H);
      c.fillStyle = a;
      c.fillRect(ux(0.08), bw, W - 2 * ux(0.08), H - 2 * bw);
      c.strokeStyle = d;
      c.lineWidth = s * 0.008;
      c.strokeRect(ux(0.1), bw * 1.25, W - 2 * ux(0.1), H - 2.5 * bw);
      // border motifs
      c.fillStyle = e;
      for (let i = 0; i < 24; i++) {
        const t = (i + 0.5) / 24;
        for (const y of [bw / 2, H - bw / 2]) {
          c.beginPath();
          c.ellipse(t * W, y, ux(0.03), bw * 0.25, 0, 0, Math.PI * 2);
          c.fill();
        }
      }
      // central medallion
      c.save();
      c.translate(W / 2, H / 2);
      c.scale(1 / aspect, 1);
      for (let k = 0; k < 4; k++) {
        const rr = s * (0.32 - k * 0.07);
        c.fillStyle = [b, e, d, b][k];
        c.beginPath();
        for (let i = 0; i <= 16; i++) {
          const ang = (i / 16) * Math.PI * 2;
          const rad = rr * (i % 2 ? 0.78 : 1);
          c.lineTo(Math.cos(ang) * rad, Math.sin(ang) * rad * 0.8);
        }
        c.fill();
      }
      c.restore();
      // corner pieces
      c.fillStyle = d;
      for (const [x, y] of [[0.12, 0.17], [0.88, 0.17], [0.12, 0.83], [0.88, 0.83]]) {
        c.beginPath();
        c.arc(x * W, y * H, s * 0.05, 0, Math.PI * 2);
        c.fill();
      }
      break;
    }
    case 'kilim': {
      const bands = 7;
      for (let i = 0; i < bands; i++) {
        const y0 = (i / bands) * H;
        c.fillStyle = i % 2 ? a : b;
        c.fillRect(0, y0, W, H / bands + 1);
        c.fillStyle = [d, e, b, a][i % 4];
        const n = Math.max(3, Math.round(aspect * 6));
        for (let k = 0; k < n; k++) {
          const cx = ((k + 0.5) / n) * W;
          const cy = y0 + H / bands / 2;
          const rw = (W / n) * 0.35;
          const rh = (H / bands) * 0.35;
          c.beginPath();
          c.moveTo(cx - rw, cy);
          c.lineTo(cx, cy - rh);
          c.lineTo(cx + rw, cy);
          c.lineTo(cx, cy + rh);
          c.fill();
        }
      }
      break;
    }
    case 'stripes': {
      const n = 9;
      for (let i = 0; i < n; i++) {
        c.fillStyle = [a, b, a, e, a, d][i % 6];
        c.fillRect((i / n) * W, 0, W / n + 1, H);
      }
      break;
    }
    case 'lattice': {
      c.strokeStyle = b;
      c.lineWidth = s * 0.018;
      const n = 6;
      const cw = W / Math.max(2, Math.round(n * aspect));
      const ch = H / n;
      for (let i = -1; i <= W / cw + 1; i++) {
        for (let j = -1; j <= n + 1; j++) {
          const cx = i * cw + (j % 2 ? cw / 2 : 0);
          const cy = j * ch;
          c.beginPath();
          c.moveTo(cx, cy - ch * 0.5);
          c.quadraticCurveTo(cx + cw * 0.5, cy - ch * 0.3, cx + cw * 0.5, cy);
          c.quadraticCurveTo(cx + cw * 0.5, cy + ch * 0.3, cx, cy + ch * 0.5);
          c.quadraticCurveTo(cx - cw * 0.5, cy + ch * 0.3, cx - cw * 0.5, cy);
          c.quadraticCurveTo(cx - cw * 0.5, cy - ch * 0.3, cx, cy - ch * 0.5);
          c.stroke();
        }
      }
      break;
    }
    case 'shag': {
      const r = rng(5);
      for (let i = 0; i < 6000; i++) {
        c.fillStyle = r() > 0.5 ? lighten(a, r() * 0.2) : darken(a, r() * 0.18);
        c.fillRect(r() * W, r() * H, 2, 2);
      }
      break;
    }
    case 'border': {
      c.fillStyle = b;
      c.fillRect(0, 0, W, H);
      c.fillStyle = a;
      c.fillRect(ux(0.07), H * 0.07, W - 2 * ux(0.07), H * 0.86);
      c.strokeStyle = b;
      c.lineWidth = s * 0.01;
      c.strokeRect(ux(0.12), H * 0.12, W - 2 * ux(0.12), H * 0.76);
      break;
    }
    case 'abstract': {
      const r = rng(17);
      for (let i = 0; i < 9; i++) {
        c.fillStyle = [b, d, e][i % 3];
        c.globalAlpha = 0.85;
        c.beginPath();
        c.ellipse(r() * W, r() * H, ux(0.1 + r() * 0.25), H * (0.08 + r() * 0.2), r() * 3, 0, Math.PI * 2);
        c.fill();
      }
      c.globalAlpha = 1;
      break;
    }
    case 'checker': {
      const n = 8;
      const m = Math.max(2, Math.round(n * aspect));
      for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) {
        c.fillStyle = (i + j) % 2 ? a : b;
        c.fillRect((i / m) * W, (j / n) * H, W / m + 1, H / n + 1);
      }
      break;
    }
    case 'diamond': {
      const n = 5;
      const m = Math.max(2, Math.round(n * aspect));
      c.fillStyle = b;
      for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) {
        const cx = ((i + 0.5) / m) * W;
        const cy = ((j + 0.5) / n) * H;
        c.beginPath();
        c.moveTo(cx - W / m / 2, cy);
        c.lineTo(cx, cy - H / n / 2);
        c.lineTo(cx + W / m / 2, cy);
        c.lineTo(cx, cy + H / n / 2);
        c.closePath();
        c.fill();
        c.strokeStyle = d;
        c.lineWidth = s * 0.006;
        c.stroke();
      }
      break;
    }
    case 'solid':
      break;
  }
  // woven texture
  const r = rng(3);
  const img = c.getImageData(0, 0, W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const n = ((x + y) % 2 ? 6 : -6) + (r() - 0.5) * 16;
      img.data[i] += n;
      img.data[i + 1] += n;
      img.data[i + 2] += n;
    }
  }
  c.putImageData(img, 0, 0);
}

/**
 * A texture whose 0..1 square covers a centred w × d rectangle measured in METERS in the shape /
 * slab coordinates (`k.slab` top faces use shape x / y as UVs). Works for paintings too: build
 * them with `k.slab`/`extrudeZ` of a w × h shape or set plain 0..1 UVs and pass w = d = 1.
 */
function fitTex(tex: THREE.CanvasTexture | null, w: number, d: number): THREE.Texture | null {
  if (!tex) return null;
  const t = tex.clone();
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.repeat.set(1 / w, 1 / d);
  t.offset.set(0.5, 0.5);
  t.needsUpdate = true;
  return t;
}

function rep(tex: THREE.CanvasTexture | null, rx: number, ry: number): THREE.Texture | null {
  if (!tex) return null;
  const t = tex.clone();
  t.repeat.set(rx, ry);
  t.needsUpdate = true;
  return t;
}

/* ------------------------------------------------------------------------------------------ */
/* Materials (cached by kind + color; shared between all items – never mutate or dispose)      */
/* ------------------------------------------------------------------------------------------ */

const matCache = new Map<string, THREE.Material>();
const repCache = new Map<string, THREE.Texture | null>();

function texRep(kind: TexKind, rx: number, ry: number): THREE.Texture | null {
  const key = `${kind}|${rx}|${ry}`;
  if (repCache.has(key)) return repCache.get(key) ?? null;
  const base = kind === 'grain' ? grainTexture() : kind === 'weave' ? weaveTexture() : kind === 'noise' ? noiseTexture() : EXTRA_TEX[kind]();
  const t = rep(base, rx, ry);
  repCache.set(key, t);
  return t;
}

function cached<T extends THREE.Material>(key: string, make: () => T): T {
  let m = matCache.get(key) as T | undefined;
  if (!m) {
    m = make();
    m.name = key;
    matCache.set(key, m);
  }
  return m;
}

export const M = {
  /** Oiled/lacquered timber with visible grain. */
  wood(color: string, rough = 0.58): THREE.MeshStandardMaterial {
    return cached(`wood|${color}|${rough}`, () => {
      const map = texRep('grain', 0.8, 2.6);
      const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, map });
      m.userData.uvMeters = true;
      m.userData.grain = true;
      return m;
    });
  },
  /** Woven upholstery / bedding. `scale` = weave repeats per meter. */
  fabric(color: string, scale = 14): THREE.MeshPhysicalMaterial {
    return cached(`fabric|${color}|${scale}`, () => {
      const map = texRep('weave', scale, scale);
      // a soft sheen at grazing angles (fibres catching the light) is what makes cloth read as cloth
      const m = new THREE.MeshPhysicalMaterial({
        color,
        roughness: 0.94,
        metalness: 0,
        map,
        bumpMap: map,
        bumpScale: 0.9,
        sheen: 0.55,
        sheenColor: new THREE.Color(lighten(color || '#ffffff', 0.3)),
        sheenRoughness: 0.55,
      });
      m.userData.uvMeters = true;
      return m;
    });
  },
  /** Soft plain cloth without weave (sheets, lampshades, canvas). */
  cloth(color: string): THREE.MeshStandardMaterial {
    return cached(
      `cloth|${color}`,
      () => new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0, side: THREE.DoubleSide }),
    );
  },
  leather(color: string): THREE.MeshStandardMaterial {
    return cached(`leather|${color}`, () => {
      const map = texRep('noise', 5, 5);
      const m = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.46,
        metalness: 0,
        map,
        bumpMap: map,
        bumpScale: 0.5,
      });
      m.userData.uvMeters = true;
      return m;
    });
  },
  /** Satin lacquer (cabinet fronts, painted furniture). */
  paint(color: string, rough = 0.42): THREE.MeshStandardMaterial {
    return cached(`paint|${color}|${rough}`, () => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 }));
  },
  /** Flat matte surface. */
  matte(color: string): THREE.MeshStandardMaterial {
    return cached(`matte|${color}`, () => new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0 }));
  },
  plastic(color: string): THREE.MeshStandardMaterial {
    return cached(`plastic|${color}`, () => new THREE.MeshStandardMaterial({ color, roughness: 0.32, metalness: 0 }));
  },
  rubber(color: string = '#232325'): THREE.MeshStandardMaterial {
    return cached(`rubber|${color}`, () => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0 }));
  },
  /** Generic metal; see the presets below. */
  metal(color: string, rough = 0.3, metalness = 1): THREE.MeshStandardMaterial {
    return cached(
      `metal|${color}|${rough}|${metalness}`,
      () => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness }),
    );
  },
  chrome(): THREE.MeshStandardMaterial {
    return M.metal('#e6e8ea', 0.12, 1);
  },
  steel(): THREE.MeshStandardMaterial {
    return M.metal('#c9ccce', 0.38, 1);
  },
  blackMetal(): THREE.MeshStandardMaterial {
    return M.metal('#2a2b2e', 0.5, 0.7);
  },
  brass(): THREE.MeshStandardMaterial {
    return M.metal('#c9a35a', 0.3, 1);
  },
  /** Glazed ceramic / porcelain / enamel. */
  ceramic(color: string = '#f7f6f2'): THREE.MeshPhysicalMaterial {
    return cached(
      `ceramic|${color}`,
      () =>
        new THREE.MeshPhysicalMaterial({
          color,
          roughness: 0.22,
          metalness: 0,
          clearcoat: 1,
          clearcoatRoughness: 0.08,
        }),
    );
  },
  /** Unglazed clay (plant pots). */
  clay(color: string = PAL.terracotta): THREE.MeshStandardMaterial {
    return cached(`clay|${color}`, () => {
      const map = texRep('noise', 2, 1);
      return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, map });
    });
  },
  /** Stone / quartz / concrete surfaces (countertops, planters). */
  stone(color: string, rough = 0.45): THREE.MeshStandardMaterial {
    return cached(`stone|${color}|${rough}`, () => {
      const map = texRep('noise', 1, 1);
      return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, map });
    });
  },
  /** Clear glass (cheap: alpha blended, no transmission pass). */
  glass(tint: string = '#dff0f4', opacity = 0.22): THREE.MeshPhysicalMaterial {
    return cached(
      `glass|${tint}|${opacity}`,
      () =>
        new THREE.MeshPhysicalMaterial({
          color: tint,
          roughness: 0.04,
          metalness: 0,
          transparent: true,
          opacity,
          depthWrite: false,
          side: THREE.DoubleSide,
          envMapIntensity: 1.6,
          specularIntensity: 1,
        }),
    );
  },
  mirror(): THREE.MeshStandardMaterial {
    return cached(
      'mirror',
      () => new THREE.MeshStandardMaterial({ color: '#dbe6ec', roughness: 0.06, metalness: 0.8, envMapIntensity: 1.5 }),
    );
  },
  /** Dark glossy glass (TV / monitor screens, oven doors, cooktops). */
  screen(color: string = '#0c0d10'): THREE.MeshPhysicalMaterial {
    return cached(
      `screen|${color}`,
      () =>
        new THREE.MeshPhysicalMaterial({
          color,
          roughness: 0.12,
          metalness: 0.2,
          clearcoat: 1,
          clearcoatRoughness: 0.05,
        }),
    );
  },
  /** Self-lit surface (bulbs, lamp shades, diffusers). */
  glow(color: string = '#fff1d6', intensity = 1.4, base: string = '#fffaf0', side: THREE.Side = THREE.FrontSide): THREE.MeshStandardMaterial {
    return cached(
      `glow|${color}|${intensity}|${base}|${side}`,
      () =>
        new THREE.MeshStandardMaterial({
          color: base,
          emissive: color,
          emissiveIntensity: intensity,
          roughness: 0.6,
          metalness: 0,
          side,
        }),
    );
  },
  /** Translucent-looking lamp shade: cloth that also glows a little. */
  shade(color: string): THREE.MeshStandardMaterial {
    return cached(
      `shade|${color}`,
      () =>
        new THREE.MeshStandardMaterial({
          color,
          emissive: mix(color, '#ffd9a0', 0.5),
          emissiveIntensity: 0.38,
          roughness: 0.85,
          metalness: 0,
          side: THREE.DoubleSide,
          map: texRep('weave', 10, 4),
        }),
    );
  },
  /** Leaves / hedges / tree canopies. */
  foliage(color: string, doubleSided = false): THREE.MeshStandardMaterial {
    return cached(`foliage|${color}|${doubleSided}`, () => {
      const map = texRep('noise', 2, 2);
      return addWind(
        new THREE.MeshStandardMaterial({
          color,
          roughness: 0.78,
          metalness: 0,
          map,
          side: doubleSided ? THREE.DoubleSide : THREE.FrontSide,
        }),
      );
    });
  },
  /** Glossy leaf (ficus, monstera). */
  leaf(color: string): THREE.MeshStandardMaterial {
    return cached(
      `leaf|${color}`,
      () => addWind(new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0, side: THREE.DoubleSide }), 0.6),
    );
  },
  bark(color: string = '#6d5544'): THREE.MeshStandardMaterial {
    return cached(`bark|${color}`, () => {
      const map = texRep('grain', 3, 1);
      return new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0, map });
    });
  },
  soil(): THREE.MeshStandardMaterial {
    return M.matte('#4a3a2e');
  },
  /** Velvet: soft pile with a bright sheen at grazing angles. */
  velvet(color: string): THREE.MeshPhysicalMaterial {
    return cached(`velvet|${color}`, () => {
      const map = texRep('velour', 6, 6);
      const m = new THREE.MeshPhysicalMaterial({
        color,
        roughness: 0.82,
        metalness: 0,
        map,
        sheen: 1,
        sheenColor: new THREE.Color(lighten(color || '#ffffff', 0.45)),
        sheenRoughness: 0.32,
      });
      m.userData.uvMeters = true;
      return m;
    });
  },
  /** Bouclé: nubby looped yarn (very trendy on curvy sofas / chairs). */
  boucle(color: string): THREE.MeshPhysicalMaterial {
    return cached(`boucle|${color}`, () => {
      const map = texRep('boucle', 7, 7);
      const m = new THREE.MeshPhysicalMaterial({
        color,
        roughness: 1,
        metalness: 0,
        map,
        bumpMap: map,
        bumpScale: 3,
        sheen: 0.5,
        sheenColor: new THREE.Color(lighten(color || '#ffffff', 0.3)),
        sheenRoughness: 0.7,
      });
      m.userData.uvMeters = true;
      return m;
    });
  },
  /** Linen / cotton slub weave. */
  linen(color: string): THREE.MeshStandardMaterial {
    return cached(`linen|${color}`, () => {
      const map = texRep('slub', 9, 9);
      const m = new THREE.MeshStandardMaterial({ color, roughness: 0.96, metalness: 0, map, bumpMap: map, bumpScale: 0.8 });
      m.userData.uvMeters = true;
      return m;
    });
  },
  /** Chunky knit (throws, poufs, cushions). */
  knit(color: string): THREE.MeshStandardMaterial {
    return cached(`knit|${color}`, () => {
      const map = texRep('knit', 5, 5);
      const m = new THREE.MeshStandardMaterial({ color, roughness: 0.98, metalness: 0, map, bumpMap: map, bumpScale: 2.5 });
      m.userData.uvMeters = true;
      return m;
    });
  },
  /** Woven cane webbing (chair seats/backs, cabinet doors). */
  rattan(color: string = '#d2b48a'): THREE.MeshStandardMaterial {
    return cached(`rattan|${color}`, () => {
      const map = texRep('rattan', 14, 14);
      const m = new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0, map, bumpMap: map, bumpScale: 1.5 });
      m.userData.uvMeters = true;
      return m;
    });
  },
  /** Basket weave (wicker baskets, outdoor furniture). */
  wicker(color: string = '#b8925f'): THREE.MeshStandardMaterial {
    return cached(`wicker|${color}`, () => {
      const map = texRep('wicker', 10, 10);
      const m = new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, map, bumpMap: map, bumpScale: 2 });
      m.userData.uvMeters = true;
      return m;
    });
  },
  /** Polished marble with veins. */
  marble(color: string = '#f2f0ec'): THREE.MeshPhysicalMaterial {
    return cached(`marble|${color}`, () => {
      const map = texRep('marble', 1.2, 1.2);
      const m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.18, metalness: 0, map, clearcoat: 0.6, clearcoatRoughness: 0.12 });
      m.userData.uvMeters = true;
      return m;
    });
  },
  /** Terrazzo (multi-coloured chips are in the texture; `color` tints it). */
  terrazzo(color: string = '#ffffff'): THREE.MeshPhysicalMaterial {
    return cached(`terrazzo|${color}`, () => {
      const map = texRep('terrazzo', 1.5, 1.5);
      const m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.35, metalness: 0, map, clearcoat: 0.3 });
      m.userData.uvMeters = true;
      return m;
    });
  },
  /** Brushed metal (stainless appliances, lamp bases). */
  brushed(color: string = '#c9ccce', metalness = 1): THREE.MeshPhysicalMaterial {
    return cached(`brushed|${color}|${metalness}`, () => {
      const rough = texRep('brushed', 4, 4);
      // highlights stretched across the brushing direction, like real brushed steel
      const m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.42, metalness, roughnessMap: rough, anisotropy: 0.55, anisotropyRotation: Math.PI / 2 });
      m.userData.uvMeters = true;
      return m;
    });
  },
  /** High-gloss lacquer (piano black, glossy cabinets). */
  lacquer(color: string): THREE.MeshPhysicalMaterial {
    return cached(
      `lacquer|${color}`,
      () => new THREE.MeshPhysicalMaterial({ color, roughness: 0.25, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.04 }),
    );
  },
  /** Short fur / plush (pets, teddy bears, sheepskin). */
  fur(color: string): THREE.MeshPhysicalMaterial {
    return cached(`fur|${color}`, () => {
      const map = texRep('fur', 8, 8);
      const m = new THREE.MeshPhysicalMaterial({
        color,
        roughness: 1,
        metalness: 0,
        map,
        bumpMap: map,
        bumpScale: 1.5,
        sheen: 0.8,
        sheenColor: new THREE.Color(lighten(color || '#ffffff', 0.35)),
        sheenRoughness: 0.6,
      });
      m.userData.uvMeters = true;
      return m;
    });
  },
  /**
   * A procedural painting / print. The picture covers a centred w × h rectangle measured in
   * meters in the geometry's UVs (e.g. `k.slab` / `extrudeZ` shapes, or `artPlane`).
   * `palette` = 3-5 CSS colours, the first is the background.
   */
  art(style: ArtStyle, seed: number, palette: string[], w: number, h: number): THREE.MeshStandardMaterial {
    return cached(`art|${style}|${seed}|${palette.join(',')}|${w}|${h}`, () => {
      const tex = canvasTexture(`art|${style}|${seed}|${palette.join(',')}`, 256, (c, s) => drawArt(c, s, style, seed, palette), true);
      return new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.78, metalness: 0, map: fitTex(tex, w, h) });
    });
  },
  /** A woven rug pattern covering a centred w × d rectangle (top faces of `k.slab`). */
  rug(style: RugStyle, palette: string[], w: number, d: number): THREE.MeshStandardMaterial {
    return cached(`rug|${style}|${palette.join(',')}|${w}|${d}`, () => {
      const tex = canvasTexture(`rug|${style}|${palette.join(',')}|${(w / d).toFixed(2)}`, 512, (c, s) => drawRug(c, s, style, palette, w / d), true);
      const map = fitTex(tex, w, d);
      return new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.97, metalness: 0, map, bumpMap: texRep('weave', 20, 20), bumpScale: 1.2 });
    });
  },
  water(color: string = '#9fd0dc'): THREE.MeshPhysicalMaterial {
    return cached(
      `water|${color}`,
      () =>
        new THREE.MeshPhysicalMaterial({
          color,
          roughness: 0.05,
          metalness: 0,
          transparent: true,
          opacity: 0.7,
          depthWrite: false,
        }),
    );
  },
};

/* ------------------------------------------------------------------------------------------ */
/* Geometry helpers                                                                            */
/* ------------------------------------------------------------------------------------------ */

function partOffset(x: number, y: number, z: number): number {
  const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + 1.37) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Re-map the UVs of a box-like geometry to METERS (box projection), so textures keep a constant
 * real-world scale on parts of any size. With `grain`, U runs along the longer side of each face
 * (wood grain follows the length of boards, legs, rails...).
 */
export function boxUV(g: THREE.BufferGeometry, dims: [number, number, number], grain: boolean, off = 0): void {
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const n = g.getAttribute('normal') as THREE.BufferAttribute;
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  if (!p || !n || !uv) return;
  const c = [0, 0, 0];
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i));
    const ay = Math.abs(n.getY(i));
    const az = Math.abs(n.getZ(i));
    c[0] = p.getX(i);
    c[1] = p.getY(i);
    c[2] = p.getZ(i);
    let a: number;
    let b: number;
    if (ax >= ay && ax >= az) {
      a = 2;
      b = 1;
    } else if (ay >= az) {
      a = 0;
      b = 2;
    } else {
      a = 0;
      b = 1;
    }
    if (grain && dims[b] > dims[a]) {
      const t = a;
      a = b;
      b = t;
    }
    uv.setXY(i, c[a] + off * 3.1, c[b] + off * 1.7);
  }
  uv.needsUpdate = true;
}

/** For cylinders / lathes: scale the default (around, along) UVs to meters; wood grain runs along the length. */
function roundUV(g: THREE.BufferGeometry, around: number, along: number, grain: boolean, off = 0): void {
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  if (!uv) return;
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i) * around;
    const v = uv.getY(i) * along;
    if (grain) uv.setXY(i, v + off * 3.1, u);
    else uv.setXY(i, u, v);
  }
  uv.needsUpdate = true;
}

const usesMeters = (m: THREE.Material): boolean => m.userData.uvMeters === true;
const usesGrain = (m: THREE.Material): boolean => m.userData.grain === true;

/** Create a mesh with shadows enabled (transparent materials do not cast). */
export function mesh(geo: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = !mat.transparent;
  m.receiveShadow = true;
  return m;
}

/** Box with softly rounded edges. `seg` 1 = chamfer-like (108 tris), 2 = smooth (300 tris). */
export function roundedBoxGeo(w: number, h: number, d: number, r: number, seg = 2): THREE.BufferGeometry {
  const rr = Math.min(r, w / 2, h / 2, d / 2);
  if (rr <= 0.0005) return new THREE.BoxGeometry(w, h, d);
  return new RoundedBoxGeometry(w, h, d, seg, rr);
}

/**
 * Soft cushion: rounded box whose top (and optionally bottom) bulges a little in the middle,
 * like a filled seat cushion.
 */
export function cushionGeo(w: number, h: number, d: number, r = 0.05, bulge = 0.02, seg = 3): THREE.BufferGeometry {
  const g = roundedBoxGeo(w, h, d, Math.min(r, h * 0.49), seg);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / (w / 2);
    const y = p.getY(i) / (h / 2);
    const z = p.getZ(i) / (d / 2);
    const k = Math.max(0, 1 - x * x) * Math.max(0, 1 - z * z);
    if (y > 0) p.setY(i, p.getY(i) + bulge * k * y);
  }
  g.computeVertexNormals();
  return g;
}

/** Pillow: squarish super-ellipsoid, thin at the seams and plump in the middle. */
export function pillowGeo(w: number, h: number, d: number): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 16, 10);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const uvA = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uvA.count; i++) uvA.setXY(i, uvA.getX(i) * (w + d), uvA.getY(i) * Math.max(w, d) * 0.9);
  const e = 0.42;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const sx = Math.sign(x) * Math.pow(Math.abs(x), e);
    const sz = Math.sign(z) * Math.pow(Math.abs(z), e);
    const flat = Math.sqrt(Math.max(0, 1 - Math.pow(Math.abs(sx), 4))) * Math.sqrt(Math.max(0, 1 - Math.pow(Math.abs(sz), 4)));
    p.setXYZ(i, (sx * w) / 2, ((Math.sign(y) * Math.pow(Math.abs(y), 0.8) * h) / 2) * (0.25 + 0.75 * flat), (sz * d) / 2);
  }
  g.computeVertexNormals();
  return g;
}

/** Organic blob (tree canopy cluster, bush, bean bag): noise-displaced icosphere, smooth normals. */
export function blobGeo(r: number, detail = 2, seed = 1, amp = 0.18, freq = 1.6): THREE.BufferGeometry {
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  g = mergeVertices(g, 1e-4);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const n = noise3(x * freq + seed * 13.1, y * freq + seed * 7.7, z * freq + seed * 3.3) - 0.5;
    const k = r * (1 + n * 2 * amp);
    p.setXYZ(i, x * k, y * k, z * k);
    uv[i * 2] = Math.atan2(z, x) / (Math.PI * 2) + 0.5;
    uv[i * 2 + 1] = y * 0.5 + 0.5;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/**
 * Make any closed geometry look organic (hedges, canopies): welds vertices, pushes them around
 * with smooth 3D noise and recomputes smooth normals.
 */
export function organicGeo(src: THREE.BufferGeometry, amp: number, freq = 3, seed = 1): THREE.BufferGeometry {
  let g = src.clone();
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  g = mergeVertices(g, 1e-4);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const s = seed * 9.7;
    const dx = noise3(x * freq + s, y * freq, z * freq) - 0.5;
    const dy = noise3(x * freq, y * freq + s, z * freq + 31) - 0.5;
    const dz = noise3(x * freq + 17, y * freq, z * freq + s) - 0.5;
    p.setXYZ(i, x + dx * 2 * amp, y + dy * 2 * amp, z + dz * 2 * amp);
    uv[i * 2] = (x + z) * 0.8;
    uv[i * 2 + 1] = y * 0.8;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** Shape helpers (2D outlines in the XY plane of a THREE.Shape). */
export function roundedRectShape(w: number, d: number, r: number, cx = 0, cy = 0): THREE.Shape {
  const s = new THREE.Shape();
  roundedRectPath(s, w, d, r, cx, cy);
  return s;
}
export function roundedRectPath<T extends THREE.Path>(s: T, w: number, d: number, r: number, cx = 0, cy = 0): T {
  const rr = Math.max(0.0001, Math.min(r, w / 2, d / 2));
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  const y0 = cy - d / 2;
  const y1 = cy + d / 2;
  s.moveTo(x0 + rr, y0);
  s.lineTo(x1 - rr, y0);
  s.absarc(x1 - rr, y0 + rr, rr, -Math.PI / 2, 0, false);
  s.lineTo(x1, y1 - rr);
  s.absarc(x1 - rr, y1 - rr, rr, 0, Math.PI / 2, false);
  s.lineTo(x0 + rr, y1);
  s.absarc(x0 + rr, y1 - rr, rr, Math.PI / 2, Math.PI, false);
  s.lineTo(x0, y0 + rr);
  s.absarc(x0 + rr, y0 + rr, rr, Math.PI, Math.PI * 1.5, false);
  return s;
}
export function ellipseShape(rx: number, ry: number, cx = 0, cy = 0): THREE.Shape {
  const s = new THREE.Shape();
  s.absellipse(cx, cy, rx, ry, 0, Math.PI * 2, false, 0);
  return s;
}
export function ellipsePath(rx: number, ry: number, cx = 0, cy = 0): THREE.Path {
  const s = new THREE.Path();
  s.absellipse(cx, cy, rx, ry, 0, Math.PI * 2, true, 0);
  return s;
}

/**
 * Extrude a shape UP along +Y from y=0 to y=h. Shape x -> world x, shape y -> world -z.
 * `bevel` rounds the top and bottom edges (the outline grows by `bevel`, so inset your shape).
 */
export function extrudeY(shape: THREE.Shape, h: number, bevel = 0, curveSegments = 10): THREE.BufferGeometry {
  const b = Math.min(bevel, h / 2 - 0.0005);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: b > 0 ? h - 2 * b : h,
    bevelEnabled: b > 0,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: 2,
    curveSegments,
  });
  g.rotateX(-Math.PI / 2);
  if (b > 0) g.translate(0, b, 0);
  return g;
}

/** Extrude a shape along +Z, centered on z (for profiles seen from the front). */
export function extrudeZ(shape: THREE.Shape, depth: number, bevel = 0, curveSegments = 10): THREE.BufferGeometry {
  const b = Math.min(bevel, depth / 2 - 0.0005);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: b > 0 ? depth - 2 * b : depth,
    bevelEnabled: b > 0,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: 2,
    curveSegments,
  });
  g.translate(0, 0, -(b > 0 ? depth - 2 * b : depth) / 2);
  return g;
}

/** Resample a [radius, y] profile through a smooth spline (rounder vases, pots, bowls). */
export function smoothProfile(profile: Array<[number, number]>, n = 28): Array<[number, number]> {
  const curve = new THREE.SplineCurve(profile.map(([r, y]) => new THREE.Vector2(r, y)));
  const ys = profile.map((p) => p[1]);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  return curve.getPoints(n).map((p) => [Math.max(0, p.x), Math.min(y1, Math.max(y0, p.y))] as [number, number]);
}

/** Surface of revolution from [radius, y] pairs (bottom to top). */
export function latheGeo(profile: Array<[number, number]>, seg = 24): THREE.BufferGeometry {
  const pts = profile.map(([r, y]) => new THREE.Vector2(Math.max(0, r), y));
  return new THREE.LatheGeometry(pts, seg);
}

/**
 * Vertical picture plane facing +Z, w × h, centred on x, bottom at y = 0, with UVs in meters
 * centred on the plane (matches `M.art(..., w, h)`).
 */
export function artPlaneGeo(w: number, h: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i), p.getY(i));
  g.translate(0, h / 2, 0);
  return g;
}

/** Smooth tube through points. */
export function tubeGeo(
  pts: V3[],
  r: number,
  opts: { closed?: boolean; seg?: number; radial?: number; tension?: number } = {},
): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(
    pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])),
    opts.closed ?? false,
    'catmullrom',
    opts.tension ?? 0.5,
  );
  return new THREE.TubeGeometry(curve, opts.seg ?? pts.length * 6, r, opts.radial ?? 8, opts.closed ?? false);
}

/**
 * Leaf blade: starts at the origin, grows along +Z for `len`, lies in the XZ plane (top = +Y),
 * folded along the midrib and arching downwards towards the tip.
 */
export function leafGeo(len: number, width: number, opts: { fold?: number; droop?: number; seg?: number; tipBias?: number } = {}): THREE.BufferGeometry {
  const seg = opts.seg ?? 6;
  const fold = opts.fold ?? 0.25;
  const droop = opts.droop ?? 0.25;
  const bias = opts.tipBias ?? 0.45; // where the leaf is widest (0..1)
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    // asymmetric width profile, pointed tip
    const a = t < bias ? t / bias : 1 - (t - bias) / (1 - bias);
    const wv = (width / 2) * Math.pow(Math.sin((a * Math.PI) / 2), 0.75);
    const y = -droop * len * t * t;
    const z = len * t;
    pos.push(-wv, y + wv * fold, z, 0, y, z, wv, y + wv * fold, z);
    uv.push(0, t, 0.5, t, 1, t);
    if (i < seg) {
      const b = i * 3;
      idx.push(b, b + 3, b + 1, b + 1, b + 3, b + 4, b + 1, b + 4, b + 2, b + 2, b + 4, b + 5);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * Vertical curved panel (chair backs etc.), concave towards +Z. Its middle occupies z in [-thickness, 0],
 * the two ends curve forward (+Z); y runs from 0 to `height`.
 */
export function arcPanelGeo(radius: number, thickness: number, height: number, arc: number, seg = 10): THREE.BufferGeometry {
  const s = new THREE.Shape();
  const a0 = -Math.PI / 2 - arc / 2;
  const a1 = -Math.PI / 2 + arc / 2;
  s.absarc(0, 0, radius + thickness, a0, a1, false);
  s.absarc(0, 0, radius, a1, a0, true);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: height, bevelEnabled: false, curveSegments: seg });
  // shape (x, y) -> world (x, -z ... ) : rotate so extrusion is +Y and the arc bulges to -Z
  g.rotateX(-Math.PI / 2);
  g.rotateY(Math.PI);
  g.translate(0, 0, radius);
  return g;
}

/* ------------------------------------------------------------------------------------------ */
/* Builder                                                                                     */
/* ------------------------------------------------------------------------------------------ */

/**
 * Small fluent builder. All `y` arguments are the BOTTOM of the primitive unless noted,
 * x/z are the center.
 */
export class Kit {
  readonly g = new THREE.Group();

  add<T extends THREE.Object3D>(o: T, x = 0, y = 0, z = 0): T {
    o.position.set(x, y, z);
    this.g.add(o);
    return o;
  }

  /** Raw geometry + material, positioned at its own origin. */
  geo(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
    return this.add(mesh(geo, mat), x, y, z);
  }

  box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
    const g = new THREE.BoxGeometry(w, h, d);
    if (usesMeters(mat)) boxUV(g, [w, h, d], usesGrain(mat), partOffset(x, y, z));
    return this.add(mesh(g, mat), x, y + h / 2, z);
  }

  rbox(w: number, h: number, d: number, r: number, mat: THREE.Material, x = 0, y = 0, z = 0, seg = 2): THREE.Mesh {
    const g = roundedBoxGeo(w, h, d, r, seg);
    if (usesMeters(mat)) boxUV(g, [w, h, d], usesGrain(mat), partOffset(x, y, z));
    return this.add(mesh(g, mat), x, y + h / 2, z);
  }

  cushion(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0, r = 0.05, bulge = 0.02, seg = 2): THREE.Mesh {
    const g = cushionGeo(w, h, d, r, bulge, seg);
    if (usesMeters(mat)) boxUV(g, [w, h, d], false, partOffset(x, y, z));
    return this.add(mesh(g, mat), x, y + h / 2, z);
  }

  pillow(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
    return this.add(mesh(pillowGeo(w, h, d), mat), x, y + h / 2, z);
  }

  /** Vertical cylinder / cone; `r` is the bottom radius, `rTop` defaults to `r`. */
  cyl(r: number, h: number, mat: THREE.Material, x = 0, y = 0, z = 0, rTop: number = r, seg = 20): THREE.Mesh {
    const g = new THREE.CylinderGeometry(rTop, r, h, seg);
    if (usesMeters(mat)) roundUV(g, Math.PI * (r + rTop), h, usesGrain(mat), partOffset(x, y, z));
    return this.add(mesh(g, mat), x, y + h / 2, z);
  }

  /** Sphere (y = center); optional non-uniform scale. */
  sphere(r: number, mat: THREE.Material, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, seg = 16): THREE.Mesh {
    const m = this.add(mesh(new THREE.SphereGeometry(r, seg, Math.max(4, Math.round(seg * 0.6))), mat), x, y, z);
    m.scale.set(sx, sy, sz);
    return m;
  }

  /** Straight round bar between two points (absolute coordinates). */
  rod(a: V3, b: V3, r: number, mat: THREE.Material, rEnd: number = r, seg = 10): THREE.Mesh {
    const va = new THREE.Vector3(a[0], a[1], a[2]);
    const vb = new THREE.Vector3(b[0], b[1], b[2]);
    const dir = vb.clone().sub(va);
    const len = dir.length();
    const g = new THREE.CylinderGeometry(rEnd, r, len, seg);
    if (usesMeters(mat)) roundUV(g, Math.PI * (r + rEnd), len, usesGrain(mat), partOffset(a[0], a[1], a[2]));
    const m = mesh(g, mat);
    m.position.copy(va).addScaledVector(dir, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    this.g.add(m);
    return m;
  }

  /** Straight square bar between two points (absolute coordinates). */
  beam(a: V3, b: V3, w: number, d: number, mat: THREE.Material, r = 0): THREE.Mesh {
    const va = new THREE.Vector3(a[0], a[1], a[2]);
    const vb = new THREE.Vector3(b[0], b[1], b[2]);
    const dir = vb.clone().sub(va);
    const len = dir.length();
    const g = roundedBoxGeo(w, len, d, r, 1);
    if (usesMeters(mat)) boxUV(g, [w, len, d], usesGrain(mat), partOffset(a[0], a[1], a[2]));
    const m = mesh(g, mat);
    m.position.copy(va).addScaledVector(dir, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    this.g.add(m);
    return m;
  }

  /** Smooth tube through absolute points. */
  tube(pts: V3[], r: number, mat: THREE.Material, opts: { closed?: boolean; seg?: number; radial?: number; tension?: number } = {}): THREE.Mesh {
    return this.add(mesh(tubeGeo(pts, r, opts), mat));
  }

  /** Lathe profile of [radius, y] pairs; (x, y, z) is the profile origin. */
  lathe(profile: Array<[number, number]>, mat: THREE.Material, x = 0, y = 0, z = 0, seg = 24): THREE.Mesh {
    const g = latheGeo(profile, seg);
    if (usesMeters(mat)) {
      let rMax = 0;
      let len = 0;
      profile.forEach(([r, py], i) => {
        rMax = Math.max(rMax, r);
        if (i > 0) len += Math.hypot(r - profile[i - 1][0], py - profile[i - 1][1]);
      });
      roundUV(g, Math.PI * 2 * rMax, len, false);
    }
    return this.add(mesh(g, mat), x, y, z);
  }

  /** Horizontal ring (torus) lying flat; y = center. */
  ring(r: number, tube: number, mat: THREE.Material, x = 0, y = 0, z = 0, seg = 28): THREE.Mesh {
    const m = this.add(mesh(new THREE.TorusGeometry(r, tube, 8, seg), mat), x, y, z);
    m.rotation.x = Math.PI / 2;
    return m;
  }

  /** Flat horizontal disc (thin cylinder). */
  disc(r: number, h: number, mat: THREE.Material, x = 0, y = 0, z = 0, seg = 28): THREE.Mesh {
    return this.cyl(r, h, mat, x, y, z, r, seg);
  }

  /** Shape extruded upwards from y. */
  slab(shape: THREE.Shape, h: number, mat: THREE.Material, x = 0, y = 0, z = 0, bevel = 0, curveSegments = 10): THREE.Mesh {
    return this.add(mesh(extrudeY(shape, h, bevel, curveSegments), mat), x, y, z);
  }

  /** Nest another builder's group. */
  sub(k: Kit, x = 0, y = 0, z = 0): THREE.Group {
    return this.add(k.g, x, y, z);
  }

  /**
   * Start an animated PART (see `ActionKind` in catalog/types.ts): returns a child builder whose
   * group sits at the pivot (x, y, z) of this builder. Build the part's geometry relative to the
   * pivot (e.g. a door's hinge, a clock hand's axle, a fan's hub). `data` is copied into the
   * part's userData (e.g. `{ open: -1.6 }` for a door). Parts are baked separately and keep their
   * transform, so the runtime can animate them per placed instance.
   */
  part(name: string, x = 0, y = 0, z = 0, data: Record<string, unknown> = {}): Kit {
    const k = new Kit();
    k.g.userData = { ...data, part: name };
    this.add(k.g, x, y, z);
    return k;
  }
}

/* ------------------------------------------------------------------------------------------ */
/* Baking: merge all meshes of a built item into one mesh per material (few draw calls)        */
/* ------------------------------------------------------------------------------------------ */

function flipWinding(g: THREE.BufferGeometry): void {
  for (const name of Object.keys(g.attributes)) {
    const a = g.getAttribute(name) as THREE.BufferAttribute;
    const n = a.itemSize;
    const arr = a.array as Float32Array;
    for (let i = 0; i + 2 < a.count; i += 3) {
      for (let k = 0; k < n; k++) {
        const t = arr[(i + 1) * n + k];
        arr[(i + 1) * n + k] = arr[(i + 2) * n + k];
        arr[(i + 2) * n + k] = t;
      }
    }
  }
}

/**
 * Bake a hierarchy of meshes into a flat group with ONE mesh per (material, shadow flags).
 * Keeps the look identical while cutting draw calls by an order of magnitude.
 *
 * Sub-trees marked as parts (`userData.part`, see `Kit.part`) are baked on their own into child
 * groups named `part:<name>` that keep the part's pivot transform and userData, so they can still
 * be animated.
 */
export function bake(root: THREE.Object3D, name = ''): THREE.Group {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map<string, { mat: THREE.Material; cast: boolean; recv: boolean; geos: THREE.BufferGeometry[] }>();
  const m4 = new THREE.Matrix4();
  const parts: THREE.Object3D[] = [];
  const visit = (o: THREE.Object3D): void => {
    // parts are baked on their own; inside a 'fish' part every child (one fish) stays separate
    if (o !== root && (o.userData.part !== undefined || (o.parent === root && root.userData.part === 'fish'))) {
      parts.push(o);
      return;
    }
    const me = o as THREE.Mesh;
    if (me.isMesh && !Array.isArray(me.material)) addMesh(me);
    for (const c of o.children) visit(c);
  };
  const addMesh = (me: THREE.Mesh): void => {
    let g = me.geometry.index ? me.geometry.toNonIndexed() : me.geometry.clone();
    for (const key of Object.keys(g.attributes)) {
      if (key !== 'position' && key !== 'normal' && key !== 'uv') g.deleteAttribute(key);
    }
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    if (!g.getAttribute('uv')) {
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
    }
    g.morphAttributes = {};
    m4.multiplyMatrices(inv, me.matrixWorld);
    g = g.applyMatrix4(m4);
    if (m4.determinant() < 0) flipWinding(g);
    const mat = me.material as THREE.Material;
    const key = `${mat.uuid}|${me.castShadow ? 1 : 0}${me.receiveShadow ? 1 : 0}`;
    let b = buckets.get(key);
    if (!b) {
      b = { mat, cast: me.castShadow, recv: me.receiveShadow, geos: [] };
      buckets.set(key, b);
    }
    b.geos.push(g);
  };
  visit(root);
  const out = new THREE.Group();
  out.name = name;
  // size-dependent anchors of parametric builds travel with the baked template
  if (root.userData.anchors) out.userData.anchors = root.userData.anchors;
  for (const b of buckets.values()) {
    const merged = b.geos.length === 1 ? b.geos[0] : mergeGeometries(b.geos, false);
    if (!merged) continue;
    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    const m = new THREE.Mesh(merged, b.mat);
    m.castShadow = b.cast;
    m.receiveShadow = b.recv;
    if (b.mat.transparent) m.renderOrder = 2;
    out.add(m);
  }
  for (const p of parts) {
    const baked = bake(p, p.userData.part !== undefined ? `part:${p.userData.part as string}` : 'piece');
    baked.userData = { ...p.userData };
    m4.multiplyMatrices(inv, p.matrixWorld);
    m4.decompose(baked.position, baked.quaternion, baked.scale);
    out.add(baked);
  }
  return out;
}

/* ------------------------------------------------------------------------------------------ */
/* 2D plan-symbol helpers                                                                      */
/* ------------------------------------------------------------------------------------------ */

export type Ctx2D = CanvasRenderingContext2D;

export const INK = '#3a3d42';
export const INK_SOFT = '#7d8187';
export const LINE = 0.02;
export const LINE_THIN = 0.011;

/** Run a plan-symbol drawing with saved/restored state and standard pen settings. */
export function sym(ctx: Ctx2D, fn: () => void): void {
  ctx.save();
  ctx.lineWidth = LINE;
  ctx.strokeStyle = INK;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  try {
    fn();
  } finally {
    ctx.restore();
  }
}

/** Standard plan fill for a material color: lightened so symbols read as "paper". */
export const tint = (c: string, t = 0.45): string => lighten(c, t);

function paint(ctx: Ctx2D, fill?: string | null, stroke: string | null = INK, lw?: number): void {
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    const old = ctx.lineWidth;
    const oldS = ctx.strokeStyle;
    if (lw !== undefined) ctx.lineWidth = lw;
    ctx.strokeStyle = stroke;
    ctx.stroke();
    ctx.lineWidth = old;
    ctx.strokeStyle = oldS;
  }
}

function rrPath(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  ctx.lineTo(x + rr, y + h);
  ctx.arcTo(x, y + h, x, y + h - rr, rr);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.closePath();
}

/** Drawing primitives. Rect helpers take the CENTER (cx, cy) and full size (w, h). */
export const D = {
  /** rounded rectangle by center */
  rr(ctx: Ctx2D, cx: number, cy: number, w: number, h: number, r = 0, fill?: string | null, stroke: string | null = INK, lw?: number): void {
    rrPath(ctx, cx - w / 2, cy - h / 2, w, h, r);
    paint(ctx, fill, stroke, lw);
  },
  /** rounded rectangle by corners x0,y0 -> x1,y1 */
  box(ctx: Ctx2D, x0: number, y0: number, x1: number, y1: number, r = 0, fill?: string | null, stroke: string | null = INK, lw?: number): void {
    rrPath(ctx, Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0), r);
    paint(ctx, fill, stroke, lw);
  },
  circle(ctx: Ctx2D, cx: number, cy: number, r: number, fill?: string | null, stroke: string | null = INK, lw?: number): void {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    paint(ctx, fill, stroke, lw);
  },
  ellipse(ctx: Ctx2D, cx: number, cy: number, rx: number, ry: number, fill?: string | null, stroke: string | null = INK, lw?: number, rot = 0): void {
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2);
    paint(ctx, fill, stroke, lw);
  },
  line(ctx: Ctx2D, x0: number, y0: number, x1: number, y1: number, stroke: string = INK, lw: number = LINE_THIN): void {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    paint(ctx, null, stroke, lw);
  },
  poly(ctx: Ctx2D, pts: Array<[number, number]>, closed = true, fill?: string | null, stroke: string | null = INK, lw?: number): void {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    if (closed) ctx.closePath();
    paint(ctx, fill, stroke, lw);
  },
  arc(ctx: Ctx2D, cx: number, cy: number, r: number, a0: number, a1: number, stroke: string = INK, lw: number = LINE_THIN): void {
    ctx.beginPath();
    ctx.arc(cx, cy, r, a0, a1);
    paint(ctx, null, stroke, lw);
  },
  /** leaf-like blob made of overlapping circles (plants, shrubs, tree canopies) */
  foliage(ctx: Ctx2D, cx: number, cy: number, r: number, color: string, n = 7, seed = 1, stroke: string = INK): void {
    const rand = rng(seed);
    const cs: Array<[number, number, number]> = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand() * 0.5;
      const rr = r * (0.38 + rand() * 0.1);
      const dd = r - rr;
      cs.push([cx + Math.cos(a) * dd, cy + Math.sin(a) * dd, rr]);
    }
    cs.push([cx, cy, r * 0.6]);
    // stroke every circle first, then fill them all: only the outer silhouette line survives
    ctx.strokeStyle = stroke;
    for (const [x, y, rr] of cs) {
      ctx.beginPath();
      ctx.arc(x, y, rr, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = color;
    for (const [x, y, rr] of cs) {
      ctx.beginPath();
      ctx.arc(x, y, Math.max(0, rr - ctx.lineWidth * 0.45), 0, Math.PI * 2);
      ctx.fill();
    }
  },
};
