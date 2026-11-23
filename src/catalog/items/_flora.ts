/**
 * Plant-building helpers shared by `plants.ts` (leaf blades with slits / cups / waves, fleshy
 * succulent leaves, tapered stems, planters and baskets, plan symbols).
 */
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { D, INK_SOFT, Kit, LINE_THIN, M, darken, lighten, mix, rng, smoothProfile, tint, type Ctx2D, type V3 } from '../kit';

export const GOLDEN = 2.39996;

/** Half-width profile of a leaf: 0 at base and tip, 1 where it is widest (`widest` in 0..1). */
export function leafShape(widest = 0.45, power = 0.8): (u: number) => number {
  const b = Math.log(0.5) / Math.log(Math.min(0.95, Math.max(0.05, widest)));
  return (u) => Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(Math.min(1, Math.max(0, u)), b))), power);
}

export interface BladeOpts {
  /** half-width factor along the blade (u = 0 base .. 1 tip) */
  shape?: (u: number) => number;
  rows?: number;
  /** columns per side */
  cols?: number;
  /** V-fold along the midrib (edge rise per meter of half-width) */
  fold?: number;
  /** tip drop as a fraction of the length (quadratic arch) */
  droop?: number;
  /** cupping: edge rise in meters at the widest point */
  curl?: number;
  /** lateral veins slant towards the tip; > 0 also gives a heart-shaped base */
  slant?: number;
  /** u-bands cut from the edge in to `slitIn` (monstera / banana tears) */
  slits?: Array<[number, number] | [number, number, number]>;
  slitIn?: number;
  /** edge ripple amplitude (meters) and count along the blade */
  wave?: number;
  waveFreq?: number;
  /** twist around the midrib at the tip (radians) */
  twist?: number;
  /** sideways curve of the midrib (fraction of the length) */
  bend?: number;
}

/**
 * Leaf blade in the `leafGeo` convention: starts at the origin, grows along +Z for `len`, lies in
 * the XZ plane (top = +Y). Grid-based so it can fold, cup, ripple, twist and carry slits.
 */
export function bladeGeo(len: number, width: number, o: BladeOpts = {}): THREE.BufferGeometry {
  const shape = o.shape ?? leafShape(0.45, 0.8);
  const rows = o.rows ?? 8;
  const cols = Math.max(1, o.cols ?? 2);
  const slits = o.slits ?? [];
  const slitIn = o.slitIn ?? 0.3;
  const fold = o.fold ?? 0.2;
  const droop = o.droop ?? 0.2;
  const curl = o.curl ?? 0;
  const slant = o.slant ?? 0;
  const wave = o.wave ?? 0;
  const waveFreq = o.waveFreq ?? 4;
  const twist = o.twist ?? 0;
  const bend = o.bend ?? 0;
  const half = width / 2;
  const uSet = new Set<number>();
  for (let i = 0; i <= rows; i++) uSet.add(Math.round((i / rows) * 1e5) / 1e5);
  for (const [a, b] of slits) {
    uSet.add(Math.round(a * 1e5) / 1e5);
    uSet.add(Math.round(b * 1e5) / 1e5);
  }
  const U = [...uSet].sort((a, b) => a - b);
  const S: number[] = [];
  const depthOf = (sl: number[]): number => sl[2] ?? slitIn;
  if (slits.length) {
    const n = Math.max(1, cols - 1);
    const sSet = new Set<number>([0, slitIn]);
    for (const sl of slits) sSet.add(Math.round(depthOf(sl) * 1e4) / 1e4);
    for (let j = 1; j <= n; j++) sSet.add(Math.round((slitIn + ((1 - slitIn) * j) / n) * 1e4) / 1e4);
    S.push(...[...sSet].sort((a, b) => a - b));
  } else for (let j = 0; j <= cols; j++) S.push(j / cols);
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (const side of [-1, 1]) {
    const base = pos.length / 3;
    for (const u of U) {
      const f = shape(u);
      for (const s of S) {
        const zf = u + slant * s * (u - 0.3) * (1 - u * u);
        let x = side * s * half * f;
        let y = fold * Math.abs(x) + curl * (s * f) * (s * f) + wave * Math.sin(u * waveFreq * Math.PI * 2 + side * 1.3) * s * s * f;
        y -= droop * len * zf * Math.abs(zf);
        x += bend * len * zf * zf;
        const z = len * zf;
        if (twist) {
          const a = twist * u;
          const cx = Math.cos(a);
          const sx = Math.sin(a);
          const nx = x * cx - y * sx;
          y = x * sx + y * cx;
          x = nx;
        }
        pos.push(x, y, z);
        uv.push(0.5 + side * s * 0.5, u);
      }
    }
    const nc = S.length;
    for (let i = 0; i < U.length - 1; i++) {
      const um = (U[i] + U[i + 1]) / 2;
      const sl = slits.find(([a, b]) => um > a && um < b);
      const cut = sl ? depthOf(sl) : 2;
      for (let j = 0; j < nc - 1; j++) {
        if (S[j] >= cut - 1e-4) continue;
        const a = base + i * nc + j;
        const b = a + nc;
        const c = a + 1;
        const d = b + 1;
        if (side > 0) idx.push(a, b, c, c, b, d);
        else idx.push(a, c, b, c, d, b);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Thick fleshy leaf (succulents, aloe): pointed spindle growing along +Z from the origin. */
export function fleshGeo(len: number, width: number, thick: number, o: { droop?: number; widest?: number; ws?: number; hs?: number; blunt?: number } = {}): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, o.ws ?? 6, o.hs ?? 5);
  g.rotateX(Math.PI / 2);
  const shape = leafShape(o.widest ?? 0.35, 0.6);
  const blunt = o.blunt ?? 0.35;
  const droop = o.droop ?? 0;
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const u = (p.getZ(i) + 1) / 2;
    const f = Math.max(shape(u), u < 0.5 ? blunt * (1 - u * 2) : 0);
    const z = u * len;
    p.setXYZ(i, p.getX(i) * (width / 2) * f, p.getY(i) * (thick / 2) * f - droop * len * u * u, z);
  }
  g.computeVertexNormals();
  return g;
}

/** Smooth low-poly sphere (pearls, berries): icosahedron (octahedron for detail < 0) with welded, smooth normals. */
export function beadGeo(r: number, detail = 0): THREE.BufferGeometry {
  let g: THREE.BufferGeometry = detail < 0 ? new THREE.OctahedronGeometry(r, 0) : new THREE.IcosahedronGeometry(r, detail);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g, 1e-5);
  g.computeVertexNormals();
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
  return g;
}

/** Tube through points whose radius tapers linearly from r0 to r1 (trunks, stems, vines). */
export function taperTube(pts: V3[], r0: number, r1: number, o: { radial?: number; seg?: number } = {}): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
  const seg = o.seg ?? pts.length * 5;
  const radial = o.radial ?? 6;
  const g = new THREE.TubeGeometry(curve, seg, 1, radial, false);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const c = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    curve.getPointAt(t, c);
    const r = r0 + (r1 - r0) * t;
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      p.setXYZ(k, c.x + (p.getX(k) - c.x) * r, c.y + (p.getY(k) - c.y) * r, c.z + (p.getZ(k) - c.z) * r);
    }
  }
  g.computeVertexNormals();
  return g;
}

export const vec = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

/** Unit direction from a yaw (around Y, 0 = +Z) and a pitch (up = positive). */
export function dirYP(yaw: number, pitch: number): THREE.Vector3 {
  return new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
}

/** Rotate an object so its local +Z points along `dir` and its local +Y leans towards `face`. */
export function orient(o: THREE.Object3D, dir: THREE.Vector3, face: THREE.Vector3 = new THREE.Vector3(0, 1, 0)): void {
  const z = dir.clone().normalize();
  let y = face.clone().addScaledVector(z, -face.dot(z));
  if (y.lengthSq() < 1e-8) {
    y = new THREE.Vector3(1, 0, 0);
    y.addScaledVector(z, -y.dot(z));
    if (y.lengthSq() < 1e-8) y.set(0, 0, 1).addScaledVector(z, -z.z);
  }
  y.normalize();
  const x = new THREE.Vector3().crossVectors(y, z);
  o.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

/** Add a leaf mesh at `p`, pointing along `dir`, top facing `face`, uniformly scaled by `s`. */
export function leafAt(k: Kit, geo: THREE.BufferGeometry, mat: THREE.Material, p: THREE.Vector3 | V3, dir: THREE.Vector3, face?: THREE.Vector3, s = 1): THREE.Mesh {
  const v = Array.isArray(p) ? p : [p.x, p.y, p.z];
  const m = k.geo(geo, mat, v[0], v[1], v[2]);
  orient(m, dir, face);
  if (s !== 1) m.scale.setScalar(s);
  return m;
}

/** A few tints of one leaf colour (glossy leaf material). */
export function leafMats(color: string, glossy = true): THREE.Material[] {
  const f = glossy ? M.leaf : (c: string) => M.foliage(c, true);
  return [f(color), f(lighten(color, 0.13)), f(darken(color, 0.16)), f(mix(color, '#a9b55a', 0.22))];
}

export type PotStyle = 'cylinder' | 'tapered' | 'belly' | 'bowl' | 'cone' | 'egg' | 'urn' | 'tub';

const POT_PROFILES: Record<PotStyle, { pts: Array<[number, number]>; smooth: boolean }> = {
  cylinder: { pts: [[0, 0], [0.93, 0], [0.985, 0.012], [1, 0.045], [1, 1]], smooth: false },
  tapered: { pts: [[0, 0], [0.72, 0], [0.75, 0.015], [0.92, 0.8], [0.995, 0.81], [1, 0.83], [1, 1]], smooth: false },
  belly: { pts: [[0, 0], [0.6, 0], [0.86, 0.16], [1, 0.48], [0.94, 0.8], [0.8, 0.97], [0.8, 1]], smooth: true },
  bowl: { pts: [[0, 0], [0.5, 0], [0.76, 0.25], [0.94, 0.65], [1, 1]], smooth: true },
  cone: { pts: [[0, 0], [0.6, 0], [0.63, 0.02], [0.99, 0.985], [1, 1]], smooth: false },
  egg: { pts: [[0, 0], [0.42, 0], [0.82, 0.18], [1, 0.5], [0.95, 0.8], [0.8, 0.98], [0.78, 1]], smooth: true },
  urn: { pts: [[0, 0], [0.56, 0], [0.56, 0.07], [0.44, 0.13], [0.62, 0.3], [0.92, 0.62], [0.97, 0.9], [1.04, 0.95], [1.04, 1]], smooth: false },
  tub: { pts: [[0, 0], [0.86, 0], [0.9, 0.02], [0.97, 0.5], [1, 1]], smooth: true },
};

export interface PotSpec {
  style: PotStyle;
  /** max radius of the pot and its height */
  r: number;
  h: number;
  mat: THREE.Material;
  x?: number;
  y?: number;
  z?: number;
  wall?: number;
  /** distance from the rim down to the soil */
  depth?: number;
  seg?: number;
  top?: 'soil' | 'moss' | 'pebbles' | 'bark' | 'none';
  saucer?: THREE.Material;
}

/** A planter (pot shell with inner wall) filled with a top dressing. Returns the soil surface y. */
export function planter(k: Kit, p: PotSpec): number {
  const { r, h, mat } = p;
  const x = p.x ?? 0;
  const z = p.z ?? 0;
  let y = p.y ?? 0;
  const seg = p.seg ?? 26;
  const prof = POT_PROFILES[p.style];
  let pts = prof.pts.map(([a, b]) => [a * r, b * h] as [number, number]);
  if (prof.smooth) pts = smoothProfile(pts, 12);
  if (p.saucer) {
    const rb = Math.max(pts[1][0], r * 0.6) * 1.18;
    k.lathe([[0, 0], [rb * 0.9, 0], [rb, 0.004], [rb * 1.06, 0.02], [rb * 1.02, 0.022], [rb * 0.95, 0.008], [0, 0.008]], p.saucer, x, y, z, seg);
    y += 0.008;
  }
  const wall = p.wall ?? Math.max(0.006, r * 0.06);
  const rTop = pts[pts.length - 1][0];
  const rIn = rTop - wall;
  const depth = p.depth ?? Math.max(0.015, h * 0.08);
  k.lathe([...pts, [rIn, h], [rIn - wall * 0.2, h - depth], [0, h - depth]], mat, x, y, z, seg);
  const soilY = y + h - depth;
  const top = p.top ?? 'soil';
  if (top !== 'none') {
    const sm = top === 'moss' ? M.foliage('#5d7838') : top === 'bark' ? M.matte('#6e4b33') : top === 'pebbles' ? M.stone('#b9b2a6', 0.8) : M.soil();
    k.lathe([[rIn - wall * 0.2, 0], [rIn * 0.6, 0.008], [0, 0.012]], sm, x, soilY, z, 18);
    if (top === 'pebbles' || top === 'bark') {
      const rr = rng(Math.round(r * 1000 + h * 100));
      const n = Math.round(6 + rIn * 50);
      const tones = top === 'pebbles' ? ['#d8d2c6', '#9c968c', '#efeae0', '#b7ab98'] : ['#7a5236', '#5e3e28', '#8a6244'];
      for (let i = 0; i < n; i++) {
        const a = rr() * Math.PI * 2;
        const d = Math.sqrt(rr()) * (rIn - 0.012);
        const s = 0.006 + rr() * 0.008;
        const peb = k.sphere(s, M.stone(tones[i % tones.length], 0.7), x + Math.cos(a) * d, soilY + 0.006 + s * 0.3, z + Math.sin(a) * d, 1.3, 0.55, 1, 5);
        peb.rotation.y = rr() * 3;
      }
    }
  }
  return soilY + 0.01;
}

/** Woven basket planter with a rolled rim and two rope handles. Returns the soil surface y. */
export function basket(k: Kit, r: number, h: number, color: string, x = 0, y = 0, z = 0): number {
  const mat = M.wicker(color);
  k.lathe([[0, 0], [r * 0.9, 0], [r * 0.96, 0.008], [r * 0.99, 0.04], [r, h * 0.5], [r, h], [r - 0.012, h], [r - 0.014, h - 0.04], [0, h - 0.04]], mat, x, y, z, 28);
  const rim = M.wicker(darken(color, 0.12));
  k.ring(r - 0.004, 0.011, rim, x, y + h - 0.003, z, 28);
  k.ring(r + 0.0015, 0.004, rim, x, y + 0.035, z, 28);
  for (const s of [-1, 1]) {
    const g = new THREE.TorusGeometry(0.035, 0.0055, 5, 10, Math.PI);
    const m = k.geo(g, rim, x + s * (r + 0.004), y + h - 0.075, z);
    m.rotation.y = Math.PI / 2;
  }
  k.disc(r - 0.014, 0.004, M.soil(), x, y + h - 0.042, z, 20);
  return y + h - 0.038;
}

/* ------------------------------------------------------------------ plan symbols */

export interface PlantTopOpts {
  pot?: number;
  potColor?: string;
  leaf: string;
  n: number;
  /** distance from the centre to the far end of the outermost leaves */
  reach: number;
  len: number;
  wid: number;
  seed?: number;
  /** leaf midribs */
  ribs?: boolean;
}

/** Top view of a potted plant: pot rim + radiating leaves. */
export function plantTop(ctx: Ctx2D, o: PlantTopOpts): void {
  const r = rng(o.seed ?? 3);
  if (o.pot && o.potColor) D.circle(ctx, 0, 0, o.pot, tint(o.potColor, 0.35), undefined, LINE_THIN);
  const fill = tint(o.leaf, 0.42);
  const line = tint(o.leaf, 0.05);
  for (let i = 0; i < o.n; i++) {
    const a = i * GOLDEN + (o.seed ?? 0);
    const d = o.reach - o.len / 2 - (i % 3) * o.len * 0.18 * r();
    const cx = Math.cos(a) * d;
    const cy = Math.sin(a) * d;
    D.ellipse(ctx, cx, cy, o.len / 2, o.wid / 2, fill, INK_SOFT, 0.006, a);
    if (o.ribs !== false) D.line(ctx, cx - (Math.cos(a) * o.len) / 2, cy - (Math.sin(a) * o.len) / 2, cx + (Math.cos(a) * o.len) / 2, cy + (Math.sin(a) * o.len) / 2, line, 0.004);
  }
}
