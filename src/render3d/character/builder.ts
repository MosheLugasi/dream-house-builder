import * as THREE from 'three';

/** Material slots of a character mesh; one draw call each (when the slot is used). */
export const SLOTS = ['skin', 'top', 'bottom', 'shoes', 'hair', 'eye', 'iris', 'detail', 'accent'] as const;
export type Slot = (typeof SLOTS)[number];

/** Bone indices (the order of `BONE_NAMES`). */
export const B = {
  hips: 0,
  spine: 1,
  chest: 2,
  neck: 3,
  head: 4,
  lid: 5,
  hairA: 6,
  hairB: 7,
  clavL: 8,
  clavR: 9,
  armL: 10,
  armR: 11,
  elbowL: 12,
  elbowR: 13,
  foreL: 14,
  foreR: 15,
  handL: 16,
  handR: 17,
  fingL: 18,
  fingR: 19,
  thighL: 20,
  thighR: 21,
  kneeL: 22,
  kneeR: 23,
  shinL: 24,
  shinR: 25,
  footL: 26,
  footR: 27,
  toeL: 28,
  toeR: 29,
} as const;
export const BONE_COUNT = 30;

export type RGB = readonly [number, number, number];
/** Skin weights as a flat list: bone, weight, bone, weight… */
export type W = number[];
export const WHITE: RGB = [1, 1, 1];

export const w1 = (bone: number): W => [bone, 1];
export const wmix = (a: number, b: number, t: number): W => (t <= 0 ? [a, 1] : t >= 1 ? [b, 1] : [a, 1 - t, b, t]);
/** Scale a weight list. */
export const wscale = (w: W, k: number): W => w.map((v, i) => (i % 2 ? v * k : v));
export const wcat = (...ws: W[]): W => ws.flat();

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const gauss = (d: number, s: number) => Math.exp(-(d * d) / (s * s));

/** sRGB hex → linear RGB triple usable as a vertex color. */
export function rgb(hex: string): RGB {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}

/**
 * Smooth curve through keys `[t, v0, v1, …]` (sorted by t): Catmull-Rom style cubic Hermite.
 * Returns a sampler that clamps outside the key range.
 */
export function curve(keys: number[][]): (t: number) => number[] {
  const n = keys.length;
  const dim = keys[0].length - 1;
  const tan: number[][] = keys.map((k, i) => {
    const a = keys[Math.max(0, i - 1)];
    const b = keys[Math.min(n - 1, i + 1)];
    const dt = b[0] - a[0] || 1;
    const out: number[] = [];
    for (let d = 1; d <= dim; d++) out.push((b[d] - a[d]) / dt);
    return out;
  });
  return (t: number) => {
    if (t <= keys[0][0]) return keys[0].slice(1);
    if (t >= keys[n - 1][0]) return keys[n - 1].slice(1);
    let i = 0;
    while (i < n - 2 && t > keys[i + 1][0]) i++;
    const a = keys[i];
    const b = keys[i + 1];
    const h = b[0] - a[0];
    const s = (t - a[0]) / h;
    const s2 = s * s;
    const s3 = s2 * s;
    const h00 = 2 * s3 - 3 * s2 + 1;
    const h10 = s3 - 2 * s2 + s;
    const h01 = -2 * s3 + 3 * s2;
    const h11 = s3 - s2;
    const out: number[] = [];
    for (let d = 0; d < dim; d++) out.push(h00 * a[d + 1] + h10 * h * tan[i][d] + h01 * b[d + 1] + h11 * h * tan[i + 1][d]);
    return out;
  };
}

/** Radius of a super-ellipse in polar form. `th` is measured from +Z towards +X. */
export function superR(th: number, rx: number, rf: number, rb: number, n = 2): number {
  const s = Math.abs(Math.sin(th));
  const c = Math.cos(th);
  const d = c >= 0 ? rf : rb;
  return 1 / Math.pow(Math.pow(s / rx, n) + Math.pow(Math.abs(c) / d, n), 1 / n);
}

export interface RingOpts {
  /** center */
  c: [number, number, number];
  rx: number;
  /** front (+Z side) radius; defaults to rx */
  rf?: number;
  /** back radius; defaults to rf */
  rb?: number;
  /** super-ellipse exponent (2 = ellipse, larger = boxier) */
  n?: number;
  w: W | ((th: number, x: number, y: number, z: number) => W);
  col?: RGB | ((th: number, x: number, y: number, z: number) => RGB);
  /** texture v coordinate (u runs around the ring) */
  v?: number;
  uScale?: number;
  /** displace a generated point (after the shape, before weights) */
  warp?: (p: [number, number, number], th: number) => void;
  /** ring plane axes (default: X and Z, i.e. a horizontal ring) */
  ax?: { x: number; y: number; z: number };
  az?: { x: number; y: number; z: number };
}

/**
 * Collects a skinned, vertex-colored geometry with one index group per material slot.
 * Vertices are shared inside a loft (smooth normals) and duplicated between parts (crisp edges).
 */
export class Builder {
  private pos: number[] = [];
  private col: number[] = [];
  private uv: number[] = [];
  private si: number[] = [];
  private sw: number[] = [];
  private idx: Record<Slot, number[]> = Object.fromEntries(SLOTS.map((s) => [s, [] as number[]])) as Record<Slot, number[]>;
  private seams: [number, number][] = [];
  private fixedN = new Map<number, [number, number, number]>();
  private blendN = new Map<number, [number, number, number, number]>();
  /** mirror X of everything added while set (used to build the right-hand side from the left) */
  mirror = false;

  get vertexCount(): number {
    return this.pos.length / 3;
  }

  v(x: number, y: number, z: number, w: W, c: RGB = WHITE, u = 0, v = 0): number {
    const i = this.pos.length / 3;
    this.pos.push(this.mirror ? -x : x, y, z);
    this.col.push(c[0], c[1], c[2]);
    this.uv.push(u, v);
    // keep the 4 strongest influences, normalised
    const pairs: [number, number][] = [];
    for (let k = 0; k < w.length; k += 2) {
      if (w[k + 1] <= 1e-4) continue;
      const found = pairs.find((p) => p[0] === w[k]);
      if (found) found[1] += w[k + 1];
      else pairs.push([w[k], w[k + 1]]);
    }
    pairs.sort((a, b) => b[1] - a[1]);
    pairs.length = Math.min(4, pairs.length);
    const sum = pairs.reduce((s, p) => s + p[1], 0) || 1;
    for (let k = 0; k < 4; k++) {
      this.si.push(pairs[k] ? pairs[k][0] : 0);
      this.sw.push(pairs[k] ? pairs[k][1] / sum : 0);
    }
    return i;
  }

  p(i: number): [number, number, number] {
    return [this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]];
  }

  /** Force the shading normal of a vertex (applied after normals are computed). */
  normal(i: number, x: number, y: number, z: number): void {
    const l = Math.hypot(x, y, z) || 1;
    this.fixedN.set(i, [(this.mirror ? -x : x) / l, y / l, z / l]);
  }

  /** Pull the shading normal of a vertex towards a direction (weight 0..1), after normals are computed. */
  normalBlend(i: number, x: number, y: number, z: number, w: number): void {
    const l = Math.hypot(x, y, z) || 1;
    this.blendN.set(i, [(this.mirror ? -x : x) / l, y / l, z / l, w]);
  }

  /** Make two coincident vertices share one averaged normal. */
  seam(a: number, b: number): void {
    this.seams.push([a, b]);
  }

  tri(slot: Slot, a: number, b: number, c: number): void {
    if (this.mirror) this.idx[slot].push(a, c, b);
    else this.idx[slot].push(a, b, c);
  }

  /** A closed ring of `n` segments (n + 1 vertices, the last one duplicating the first for UVs). The seam is at the back. */
  ring(n: number, o: RingOpts): number[] {
    const out: number[] = [];
    const rf = o.rf ?? o.rx;
    const rb = o.rb ?? rf;
    for (let j = 0; j <= n; j++) {
      const th = Math.PI + (j / n) * Math.PI * 2;
      const r = superR(th, o.rx, rf, rb, o.n ?? 2);
      const lx = r * Math.sin(th);
      const lz = r * Math.cos(th);
      const p: [number, number, number] = o.ax && o.az
        ? [o.c[0] + o.ax.x * lx + o.az.x * lz, o.c[1] + o.ax.y * lx + o.az.y * lz, o.c[2] + o.ax.z * lx + o.az.z * lz]
        : [o.c[0] + lx, o.c[1], o.c[2] + lz];
      o.warp?.(p, th);
      const w = typeof o.w === 'function' ? o.w(th, p[0], p[1], p[2]) : o.w;
      const c = typeof o.col === 'function' ? o.col(th, p[0], p[1], p[2]) : o.col ?? WHITE;
      out.push(this.v(p[0], p[1], p[2], w, c, (j / n) * (o.uScale ?? 1), o.v ?? 0));
    }
    this.seam(out[0], out[n]);
    return out;
  }

  /** Triangles between two rows of equal length. `flip` reverses the winding. */
  band(slot: Slot, a: number[], b: number[], flip = false): void {
    for (let j = 0; j < a.length - 1; j++) {
      if (flip) {
        this.tri(slot, a[j], b[j + 1], b[j]);
        this.tri(slot, a[j], a[j + 1], b[j + 1]);
      } else {
        this.tri(slot, a[j], b[j], b[j + 1]);
        this.tri(slot, a[j], b[j + 1], a[j + 1]);
      }
    }
  }

  /**
   * Skin a list of rows. Horizontal rings produced by `ring` listed from TOP to BOTTOM face outward
   * with flip = false; rows listed bottom-up need flip = true.
   */
  loft(slot: Slot, rows: number[][], flip = false): void {
    for (let i = 0; i < rows.length - 1; i++) this.band(slot, rows[i], rows[i + 1], flip);
  }

  /**
   * Skin a grid of rows (an open sheet) so that it faces `towards` (a direction in un-mirrored coordinates).
   */
  sheet(slot: Slot, rows: number[][], towards: [number, number, number]): void {
    let flip = false;
    // sample the quads from the middle outwards: edges are often degenerate or folded
    const mi = Math.floor((rows.length - 1) / 2);
    const mj = Math.floor((rows[0].length - 1) / 2);
    let best = 0;
    for (let i = 0; i < rows.length - 1; i++) {
      for (let j = 0; j < rows[i].length - 1; j++) {
        const a = this.p(rows[i][j]);
        const b = this.p(rows[i + 1][j]);
        const c = this.p(rows[i + 1][j + 1]);
        const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
        const l = Math.hypot(n[0], n[1], n[2]);
        if (l < 1e-14) continue;
        // prefer large triangles near the middle of the sheet
        const score = l / (1 + Math.abs(i - mi) + Math.abs(j - mj));
        if (score <= best) continue;
        best = score;
        // stored positions are mirrored and `tri` swaps the winding, which cancels out for the test below
        const d = (this.mirror ? -1 : 1) * (n[0] * (this.mirror ? -towards[0] : towards[0]) + n[1] * towards[1] + n[2] * towards[2]);
        flip = d < 0;
      }
    }
    this.loft(slot, rows, flip);
  }

  /** Close a row with a triangle fan around a new center vertex (faces +Y for a horizontal ring; flip for -Y). */
  cap(slot: Slot, row: number[], center: [number, number, number], w: W, flip = false, c: RGB = WHITE): number {
    const ci = this.v(center[0], center[1], center[2], w, c);
    for (let j = 0; j < row.length - 1; j++) {
      if (flip) this.tri(slot, ci, row[j + 1], row[j]);
      else this.tri(slot, ci, row[j], row[j + 1]);
    }
    return ci;
  }

  triangleCount(): number {
    return SLOTS.reduce((s, k) => s + this.idx[k].length / 3, 0);
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    const index: number[] = [];
    SLOTS.forEach((slot, mi) => {
      const list = this.idx[slot];
      if (!list.length) return;
      g.addGroup(index.length, list.length, mi);
      for (const i of list) index.push(i);
    });
    g.setIndex(index);
    g.computeVertexNormals();
    const nrm = g.attributes.normal as THREE.BufferAttribute;
    for (const [a, b] of this.seams) {
      const x = nrm.getX(a) + nrm.getX(b);
      const y = nrm.getY(a) + nrm.getY(b);
      const z = nrm.getZ(a) + nrm.getZ(b);
      const l = Math.hypot(x, y, z) || 1;
      nrm.setXYZ(a, x / l, y / l, z / l);
      nrm.setXYZ(b, x / l, y / l, z / l);
    }
    for (const [i, n] of this.blendN) {
      const x = nrm.getX(i) * (1 - n[3]) + n[0] * n[3];
      const y = nrm.getY(i) * (1 - n[3]) + n[1] * n[3];
      const z = nrm.getZ(i) * (1 - n[3]) + n[2] * n[3];
      const l = Math.hypot(x, y, z) || 1;
      nrm.setXYZ(i, x / l, y / l, z / l);
    }
    for (const [i, n] of this.fixedN) nrm.setXYZ(i, n[0], n[1], n[2]);
    return g;
  }
}
