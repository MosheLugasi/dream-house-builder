/** Team B catalog helpers: ramp solids from height profiles, canvas textures (graffiti, numbers). */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rng } from '../kit';
import type { Profile } from './_gameBShapes';

/**
 * The riding surface of a ramp: a strip following `profile` ([z, height] pairs, z ascending) across the
 * full width (x from −w/2 to w/2). Smooth across gentle bends, crisp at kinks (steps, deck edges).
 * UVs in meters (u = x, v = distance along the profile).
 */
export function rampTopGeo(profile: Profile, w: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const segN: Array<[number, number]> = [];
  for (let i = 0; i + 1 < profile.length; i++) {
    const dz = profile[i + 1][0] - profile[i][0];
    const dy = profile[i + 1][1] - profile[i][1];
    const l = Math.hypot(dz, dy) || 1;
    // normal of the segment (pointing up / towards +z for a ramp rising towards −z)
    segN.push([-dy / l, dz / l]);
  }
  const at = (i: number, seg: number): [number, number] => {
    const n = segN[seg];
    const other = i === seg ? segN[seg - 1] : segN[seg + 1];
    if (!other) return n;
    const dot = n[0] * other[0] + n[1] * other[1];
    if (dot < 0.9) return n; // kink: keep the segment's own normal
    const x = n[0] + other[0];
    const y = n[1] + other[1];
    const l = Math.hypot(x, y) || 1;
    return [x / l, y / l];
  };
  let v = 0;
  for (let s = 0; s < segN.length; s++) {
    // a hair above the ground so that flat parts do not flicker against the site's ground
    const [z0, py0] = profile[s];
    const [z1, py1] = profile[s + 1];
    const y0 = Math.max(0.012, py0);
    const y1 = Math.max(0.012, py1);
    const len = Math.hypot(z1 - z0, y1 - y0);
    if (len < 1e-6) continue;
    const n0 = at(s, s);
    const n1 = at(s + 1, s);
    const quad: Array<[number, number, number, [number, number], number]> = [
      [-w / 2, y0, z0, n0, v],
      [w / 2, y0, z0, n0, v],
      [w / 2, y1, z1, n1, v + len],
      [-w / 2, y1, z1, n1, v + len],
    ];
    for (const k of [0, 2, 1, 0, 3, 2]) {
      const [x, y, z, n, vv] = quad[k];
      pos.push(x, y, z);
      nor.push(0, n[1], n[0]);
      uv.push(x, vv);
    }
    v += len;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return orient(g);
}

/** Fix the winding of a non-indexed geometry so that faces look along their normals. */
function orient(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const n = g.getAttribute('normal') as THREE.BufferAttribute;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const fn = new THREE.Vector3();
  for (let i = 0; i + 2 < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1);
    c.fromBufferAttribute(p, i + 2);
    fn.subVectors(b, a).cross(c.clone().sub(a));
    const want = new THREE.Vector3(n.getX(i), n.getY(i), n.getZ(i));
    if (fn.dot(want) < 0) {
      for (const attr of Object.values(g.attributes) as THREE.BufferAttribute[]) {
        const s = attr.itemSize;
        for (let k = 0; k < s; k++) {
          const t = attr.array[(i + 1) * s + k];
          (attr.array as Float32Array)[(i + 1) * s + k] = attr.array[(i + 2) * s + k];
          (attr.array as Float32Array)[(i + 2) * s + k] = t;
        }
      }
    }
  }
  return g;
}

export function fixWinding(g: THREE.BufferGeometry): THREE.BufferGeometry {
  return orient(g.index ? g.toNonIndexed() : g);
}

/** The two side panels and the end faces of a ramp (solid down to the ground). */
export function rampSideGeo(profile: Profile, w: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const z0 = profile[0][0];
  const z1 = profile[profile.length - 1][0];
  shape.moveTo(z0, 0);
  for (const [z, h] of profile) shape.lineTo(z, Math.max(0.001, h));
  shape.lineTo(z1, 0);
  shape.closePath();
  const parts: THREE.BufferGeometry[] = [];
  for (const s of [1, -1]) {
    const g = new THREE.ShapeGeometry(shape, 1).toNonIndexed();
    // shape (z, h) → local (x = s·w/2, y = h, z)
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    const n = g.getAttribute('normal') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const z = p.getX(i);
      const y = p.getY(i);
      p.setXYZ(i, (s * w) / 2, y, z);
      n.setXYZ(i, s, 0, 0);
    }
    parts.push(orient(g));
  }
  for (const [z, h, s] of [
    [z0, profile[0][1], -1],
    [z1, profile[profile.length - 1][1], 1],
  ] as const) {
    if (h < 0.01) continue;
    const g = new THREE.PlaneGeometry(w, h).toNonIndexed();
    g.translate(0, h / 2, 0);
    if (s < 0) g.rotateY(Math.PI);
    g.translate(0, 0, z);
    parts.push(g);
  }
  return mergeGeometries(parts, false)!;
}

/** Explicit pyramid / bank box: flat top (2a × 2b) at height h, four sloped faces down to the w × d footprint. */
export function pyramidGeo(w: number, d: number, h: number, bank: number): THREE.BufferGeometry {
  const hw = w / 2;
  const hd = d / 2;
  const a = Math.max(0.05, hw - bank);
  const b = Math.max(0.05, hd - bank);
  const pos: number[] = [];
  const quad = (p: number[][]) => {
    for (const k of [0, 1, 2, 0, 2, 3]) pos.push(...p[k]);
  };
  quad([
    [-a, h, -b],
    [-a, h, b],
    [a, h, b],
    [a, h, -b],
  ]);
  quad([
    [-a, h, b],
    [-hw, 0, hd],
    [hw, 0, hd],
    [a, h, b],
  ]);
  quad([
    [a, h, -b],
    [hw, 0, -hd],
    [-hw, 0, -hd],
    [-a, h, -b],
  ]);
  quad([
    [a, h, b],
    [hw, 0, hd],
    [hw, 0, -hd],
    [a, h, -b],
  ]);
  quad([
    [-a, h, -b],
    [-hw, 0, -hd],
    [-hw, 0, hd],
    [-a, h, b],
  ]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  // flat faces: recompute per-face normals, planar uv in meters
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const uv: number[] = [];
  for (let i = 0; i < p.count; i++) uv.push(p.getX(i), p.getZ(i) + p.getY(i) * 0.5);
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const out = g;
  out.computeVertexNormals();
  // make sure every face points up / outwards
  const n = out.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < n.count; i++) if (n.getY(i) < 0) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  return orient(out);
}

// ---- canvas textures (browser only; null in Node) ---------------------------------------------

const texCache = new Map<string, THREE.CanvasTexture | null>();

export function canvasTex(key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture | null {
  if (texCache.has(key)) return texCache.get(key) ?? null;
  let tex: THREE.CanvasTexture | null = null;
  if (typeof document !== 'undefined') {
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const c = cv.getContext('2d');
    if (c) {
      draw(c, w, h);
      tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
    }
  }
  texCache.set(key, tex);
  return tex;
}

const matCache = new Map<string, THREE.Material>();
export function cachedMat<T extends THREE.Material>(key: string, make: () => T): T {
  let m = matCache.get(key) as T | undefined;
  if (!m) {
    m = make();
    matCache.set(key, m);
  }
  return m;
}

/** A graffiti piece: bubble letters with outlines, highlights, drips, stars and splashes. */
export function drawGraffiti(c: CanvasRenderingContext2D, w: number, h: number, word: string, palette: string[], seed: number): void {
  const r = rng(seed);
  // concrete
  c.fillStyle = '#a9a7a1';
  c.fillRect(0, 0, w, h);
  for (let i = 0; i < 2600; i++) {
    c.fillStyle = r() > 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)';
    c.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
  }
  // panel joints
  c.strokeStyle = 'rgba(60,60,60,0.35)';
  c.lineWidth = 2;
  for (let x = w / 4; x < w; x += w / 4) {
    c.beginPath();
    c.moveTo(x, 0);
    c.lineTo(x, h);
    c.stroke();
  }
  // background blob
  c.fillStyle = palette[2] ?? '#3a3a8a';
  c.beginPath();
  c.ellipse(w / 2, h * 0.52, w * 0.46, h * 0.34, -0.05, 0, Math.PI * 2);
  c.fill();
  // splashes
  for (let i = 0; i < 18; i++) {
    c.fillStyle = palette[Math.floor(r() * palette.length)];
    c.globalAlpha = 0.75;
    c.beginPath();
    c.arc(r() * w, r() * h, 3 + r() * 10, 0, Math.PI * 2);
    c.fill();
  }
  c.globalAlpha = 1;
  // letters
  const size = Math.min(h * 0.62, (w * 1.5) / Math.max(3, word.length));
  c.font = `900 ${size}px "Arial Black", "Arial Rounded MT Bold", Arial, sans-serif`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.lineJoin = 'round';
  const x = w / 2;
  const y = h * 0.53;
  c.save();
  c.translate(x, y);
  c.rotate(-0.06);
  c.lineWidth = size * 0.26;
  c.strokeStyle = '#111';
  c.strokeText(word, size * 0.06, size * 0.07);
  c.strokeText(word, 0, 0);
  c.lineWidth = size * 0.12;
  c.strokeStyle = '#ffffff';
  c.strokeText(word, 0, 0);
  const grad = c.createLinearGradient(0, -size / 2, 0, size / 2);
  grad.addColorStop(0, palette[0]);
  grad.addColorStop(1, palette[1] ?? palette[0]);
  c.fillStyle = grad;
  c.fillText(word, 0, 0);
  // highlights
  c.fillStyle = 'rgba(255,255,255,0.55)';
  c.font = `900 ${size}px "Arial Black", Arial, sans-serif`;
  c.save();
  c.beginPath();
  c.rect(-w, -size / 2, w * 2, size * 0.18);
  c.clip();
  c.fillText(word, 0, 0);
  c.restore();
  c.restore();
  // drips
  for (let i = 0; i < 9; i++) {
    const dx = w * 0.15 + r() * w * 0.7;
    const top = y + size * 0.3;
    const len = 10 + r() * h * 0.25;
    c.strokeStyle = palette[1] ?? palette[0];
    c.lineWidth = 3 + r() * 3;
    c.beginPath();
    c.moveTo(dx, top);
    c.lineTo(dx, top + len);
    c.stroke();
    c.fillStyle = c.strokeStyle;
    c.beginPath();
    c.arc(dx, top + len, c.lineWidth * 0.8, 0, Math.PI * 2);
    c.fill();
  }
  // stars and a crown
  const star = (sx: number, sy: number, rad: number, col: string) => {
    c.fillStyle = col;
    c.strokeStyle = '#111';
    c.lineWidth = 3;
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const rr = i % 2 ? rad * 0.45 : rad;
      c.lineTo(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr);
    }
    c.closePath();
    c.fill();
    c.stroke();
  };
  star(w * 0.08, h * 0.2, h * 0.09, '#ffd23a');
  star(w * 0.93, h * 0.78, h * 0.07, '#ffffff');
  star(w * 0.86, h * 0.16, h * 0.05, palette[0]);
}

/** A big number on a coloured banner (checkpoint flags). */
export function drawNumber(c: CanvasRenderingContext2D, w: number, h: number, text: string, bg: string, fg: string): void {
  c.fillStyle = bg;
  c.fillRect(0, 0, w, h);
  c.strokeStyle = 'rgba(255,255,255,0.85)';
  c.lineWidth = w * 0.05;
  c.strokeRect(w * 0.05, h * 0.05, w * 0.9, h * 0.9);
  c.fillStyle = fg;
  c.font = `900 ${Math.round(h * 0.72)}px "Arial Black", Arial, sans-serif`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(text, w / 2, h * 0.54);
}

/** A banner with a Hebrew word (start / finish arches, park sign). */
export function drawBanner(c: CanvasRenderingContext2D, w: number, h: number, text: string, bg: string, fg: string, checkered = false): void {
  c.fillStyle = bg;
  c.fillRect(0, 0, w, h);
  if (checkered) {
    const s = h / 4;
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x * s < w; x++) {
        if ((x + y) % 2) continue;
        if (x * s > w * 0.18 && x * s < w * 0.8) continue;
        c.fillStyle = '#111';
        c.fillRect(x * s, y * s, s, s);
      }
    }
  }
  c.fillStyle = fg;
  c.font = `900 ${Math.round(h * 0.6)}px Arial, sans-serif`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(text, w / 2, h * 0.55);
}
