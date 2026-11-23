/**
 * Furniture kit: cached PBR materials, geometry helpers, a small fluent builder and
 * 2D plan-symbol drawing helpers. Everything is procedural (no network assets).
 *
 * Conventions used by the builder (`Kit`): every primitive is positioned by the CENTER of its
 * footprint in x/z and by its BOTTOM in y (like furniture standing on a floor), unless noted.
 */
import * as THREE from 'three';
import { addWind } from '../render3d/effects';
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
      tex.anisotropy = 4;
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

function texRep(kind: 'grain' | 'weave' | 'noise', rx: number, ry: number): THREE.Texture | null {
  const key = `${kind}|${rx}|${ry}`;
  if (repCache.has(key)) return repCache.get(key) ?? null;
  const base = kind === 'grain' ? grainTexture() : kind === 'weave' ? weaveTexture() : noiseTexture();
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
  fabric(color: string, scale = 14): THREE.MeshStandardMaterial {
    return cached(`fabric|${color}|${scale}`, () => {
      const map = texRep('weave', scale, scale);
      const m = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.94,
        metalness: 0,
        map,
        bumpMap: map,
        bumpScale: 0.9,
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
 */
export function bake(root: THREE.Object3D, name = ''): THREE.Group {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map<string, { mat: THREE.Material; cast: boolean; recv: boolean; geos: THREE.BufferGeometry[] }>();
  const m4 = new THREE.Matrix4();
  root.traverse((o) => {
    const me = o as THREE.Mesh;
    if (!me.isMesh || Array.isArray(me.material)) return;
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
  });
  const out = new THREE.Group();
  out.name = name;
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
