/**
 * Lofted car body: a ring cross-section (underbody, wheel wells, body side, greenhouse, roof)
 * swept along the length of the vehicle. Produces one geometry per material (paint, glass, dark
 * plastic, cabin lining, accent stripe) with crisp wheel arches and see-through windows.
 *
 * Frame: +Z = front, +Y = up, origin on the ground under the middle of the body.
 */
import * as THREE from 'three';

/** [z, value] key; lists are sorted by ascending z and interpolated linearly. */
export type Key = [number, number];

export interface BodySpec {
  /** half of the overall body width */
  halfW: number;
  zRear: number;
  zFront: number;
  /** optional width factor along z (1 = full halfW) */
  width?: Key[];
  /** plan-view corner rounding at the nose and tail: rz along the length, rx across */
  front: { rz: number; rx: number };
  rear: { rz: number; rx: number };
  /** height of the underbody */
  under: Key[];
  /** shoulder line: top of the body side / bottom of the windows */
  belt: Key[];
  /** top centre line: hood, windshield, roof, rear window, tail */
  top: Key[];
  /** inward lean of the side windows, m per m of height */
  tumble: number;
  /** radius of the roof-rail corner (also the pillar thickness) */
  railR: number;
  /** roof crown height */
  crown: number;
  /** how far the bottom of the body side tucks in / how much the shoulder rounds in */
  tuck?: number;
  shoulder?: number;
  /** wheel arches: axle z, arch radius, arch centre height */
  wells: Array<{ z: number; r: number; yc: number }>;
  wellDepth: number;
  /** z ranges where the greenhouse side is glass */
  glassSide: Array<[number, number]>;
  /** z ranges where the top strip between the roof rails is glass (windshield, rear window) */
  glassTop: Array<[number, number]>;
  /** number of body-side rows (from the bottom, max 6) made of dark plastic cladding */
  cladding?: number;
  /** body-side row (0..5) painted in the accent colour */
  stripeRow?: number;
  /** patches of the body side that are lamp lenses: side rows r0..r1 (0..5) between two z */
  lamps?: Array<{ mat: 'lampF' | 'lampR' | 'amber'; rows: [number, number]; z: [number, number] }>;
  /** fraction of the side-window height that is glass (the rest is a painted header); default 1 */
  glassHeight?: number;
  /** z range that gets an inner lining (cabin) */
  liner: [number, number];
  extraStations?: number[];
}

export interface BodyGeo {
  paint: THREE.BufferGeometry;
  glass: THREE.BufferGeometry;
  dark: THREE.BufferGeometry;
  liner: THREE.BufferGeometry;
  stripe: THREE.BufferGeometry | null;
  lampF: THREE.BufferGeometry | null;
  lampR: THREE.BufferGeometry | null;
  amber: THREE.BufferGeometry | null;
  /** x of the outer skin on the +X side at (z, y) */
  sideX(z: number, y: number): number;
  beltAt(z: number): number;
  topAt(z: number): number;
  /** thin dark strip following the body side at station z (door shut lines) */
  seam(z: number, sides: Array<1 | -1>, yMin?: number, upper?: boolean): THREE.BufferGeometry;
}

/** Monotone cubic (PCHIP) interpolation through the keys: smooth, but never overshoots. */
export function lerpKeys(keys: Key[], z: number): number {
  const n = keys.length;
  if (n === 1 || z <= keys[0][0]) return keys[0][1];
  if (z >= keys[n - 1][0]) return keys[n - 1][1];
  let i = 1;
  while (i < n - 1 && z > keys[i][0]) i++;
  const slope = (k: number): number => {
    const dl = k > 0 ? (keys[k][1] - keys[k - 1][1]) / (keys[k][0] - keys[k - 1][0]) : NaN;
    const dr = k < n - 1 ? (keys[k + 1][1] - keys[k][1]) / (keys[k + 1][0] - keys[k][0]) : NaN;
    if (Number.isNaN(dl)) return dr;
    if (Number.isNaN(dr)) return dl;
    if (dl * dr <= 0) return 0;
    const hl = keys[k][0] - keys[k - 1][0];
    const hr = keys[k + 1][0] - keys[k][0];
    const w1 = 2 * hr + hl;
    const w2 = hr + 2 * hl;
    return (w1 + w2) / (w1 / dl + w2 / dr);
  };
  const [z0, v0] = keys[i - 1];
  const [z1, v1] = keys[i];
  const h = z1 - z0;
  if (h < 1e-9) return v1;
  const t = (z - z0) / h;
  const m0 = slope(i - 1) * h;
  const m1 = slope(i) * h;
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * v0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * v1 + (t3 - t2) * m1;
}

/** z between zLo and zHi at which a (monotone there) key curve reaches value y. */
export function zAtValue(keys: Key[], y: number, zLo: number, zHi: number): number {
  let a = zLo;
  let b = zHi;
  const fa = lerpKeys(keys, a) - y;
  for (let i = 0; i < 40; i++) {
    const m = (a + b) / 2;
    const fm = lerpKeys(keys, m) - y;
    if (fa * fm <= 0) b = m;
    else a = m;
  }
  return (a + b) / 2;
}

const SIDE_T = [0, 0.1, 0.26, 0.5, 0.76, 0.92, 1];
const G_UNDER = 0;
const G_WALL = 1;
const G_WROOF = 2;
const G_SIDE = 3;
const G_UPPER = 4;
type Mat = 'paint' | 'glass' | 'dark' | 'stripe' | 'lampF' | 'lampR' | 'amber';

interface Pt {
  x: number;
  y: number;
}

export function loftBody(spec: BodySpec): BodyGeo {
  const tuck = spec.tuck ?? 0.05;
  const gSplit = spec.glassHeight ?? 0.5;
  const glassRows = spec.glassHeight === undefined ? 2 : 1;
  const shoulder = spec.shoulder ?? 0.03;
  const beltAt = (z: number) => lerpKeys(spec.belt, z);
  const topAt = (z: number) => Math.max(lerpKeys(spec.top, z), beltAt(z) + 0.02);
  const underAt = (z: number) => lerpKeys(spec.under, z);

  const halfWAt = (z: number): number => {
    let w = spec.halfW * (spec.width ? lerpKeys(spec.width, z) : 1);
    const df = z - (spec.zFront - spec.front.rz);
    if (df > 0) w -= spec.front.rx * (1 - Math.sqrt(Math.max(0, 1 - (df / spec.front.rz) ** 2)));
    const dr = spec.zRear + spec.rear.rz - z;
    if (dr > 0) w -= spec.rear.rx * (1 - Math.sqrt(Math.max(0, 1 - (dr / spec.rear.rz) ** 2)));
    return w;
  };
  const archAt = (z: number, yu: number): number => {
    let y = yu;
    for (const w of spec.wells) {
      const dz = z - w.z;
      if (Math.abs(dz) <= w.r + 1e-6) y = Math.max(y, w.yc + Math.sqrt(Math.max(0, w.r * w.r - dz * dz)));
    }
    return y;
  };
  const sideProfile = (W: number, yu: number, yb: number, y: number): number => {
    const u = Math.min(1, Math.max(0, (y - yu) / Math.max(0.05, yb - yu)));
    return W - tuck * (1 - u) ** 3 - shoulder * u ** 7;
  };

  const ring = (z: number): Pt[][] => {
    const W = halfWAt(z);
    const yu = underAt(z);
    const yb = Math.max(beltAt(z), yu + 0.1);
    const yt = Math.max(topAt(z), yb + 0.02);
    const ysb = Math.min(archAt(z, yu), yb - 0.06);
    const xin = Math.max(0.02, W - spec.wellDepth);
    const side = SIDE_T.map((t) => {
      const y = ysb + (yb - ysb) * t;
      return { x: sideProfile(W, yu, yb, y), y };
    });
    const hG = yt - yb;
    const c = Math.min(spec.crown, hG * 0.3);
    const rr = Math.min(spec.railR, hG * 0.45);
    const hs = hG - c - rr;
    const xb = side[side.length - 1].x;
    const xg = xb - spec.tumble * hs;
    const xr = Math.max(0.01, xg - rr);
    const ye = yt - c;
    const upper: Pt[] = [
      { x: xb, y: yb },
      { x: xb - spec.tumble * hs * gSplit, y: yb + hs * gSplit },
      { x: xg, y: yb + hs },
      { x: xg - rr * 0.293, y: yb + hs + rr * 0.707 },
      { x: xr, y: ye },
    ];
    for (const s of [0.5, 1]) upper.push({ x: xr * (1 - s), y: yt - c * (1 - s) ** 2 });
    return [
      [
        { x: 0, y: yu },
        { x: xin, y: yu },
      ],
      [
        { x: xin, y: yu },
        { x: xin, y: ysb },
      ],
      [
        { x: xin, y: ysb },
        { x: side[0].x, y: ysb },
      ],
      side,
      upper,
    ];
  };

  /* ---- stations ---- */
  const zs: number[] = [spec.zRear, spec.zFront];
  const inArch = (z: number) => spec.wells.some((w) => Math.abs(z - w.z) < w.r + 0.02);
  // inside the arches the arc samples define the profile; only window / lamp edges are added there
  for (const k of [...spec.belt, ...spec.top, ...spec.under, ...(spec.width ?? [])]) if (!inArch(k[0])) zs.push(k[0]);
  for (const z of spec.extraStations ?? []) zs.push(z);
  for (const [a, b] of [...spec.glassSide, ...spec.glassTop]) zs.push(a, b);
  for (const l of spec.lamps ?? []) zs.push(l.z[0], l.z[1]);
  zs.push(spec.liner[0], spec.liner[1]);
  for (const t of [0.35, 0.62, 0.82, 0.95]) {
    for (const z of [spec.zFront - spec.front.rz * (1 - t), spec.zRear + spec.rear.rz * (1 - t)]) if (!inArch(z)) zs.push(z);
  }
  zs.push(spec.zFront - spec.front.rz, spec.zRear + spec.rear.rz);
  const archZ: number[] = [];
  for (const w of spec.wells) {
    const n = 8;
    for (let i = 0; i <= n; i++) archZ.push(w.z + w.r * Math.cos((i / n) * Math.PI));
    archZ.push(w.z - w.r - 0.003, w.z + w.r + 0.003);
  }
  let st = [...zs, ...archZ].filter((z) => z >= spec.zRear - 1e-9 && z <= spec.zFront + 1e-9).sort((a, b) => a - b);
  const thinned: number[] = [];
  for (let i = 0; i < st.length; i++) {
    const prev = thinned[thinned.length - 1];
    const isArch = archZ.includes(st[i]);
    if (i === 0 || isArch || st[i] - prev > 0.035) thinned.push(st[i]);
  }
  if (thinned[thinned.length - 1] !== spec.zFront) {
    if (spec.zFront - thinned[thinned.length - 1] < 0.035 && !archZ.includes(thinned[thinned.length - 1])) thinned.pop();
    thinned.push(spec.zFront);
  }
  st = thinned;
  // fill long gaps
  const filled: number[] = [];
  for (let i = 0; i < st.length; i++) {
    if (i > 0) {
      const gap = st[i] - st[i - 1];
      const n = Math.ceil(gap / 0.3);
      for (let k = 1; k < n; k++) filled.push(st[i - 1] + (gap * k) / n);
    }
    filled.push(st[i]);
  }
  st = filled;
  const nS = st.length;

  /* ---- vertices ---- */
  const pos: number[] = [];
  // vid[station][group][j] = index of the +X vertex; the -X twin is +1
  const vid: number[][][] = [];
  const centre: number[] = [];
  for (let i = 0; i < nS; i++) {
    const r = ring(st[i]);
    const perG: number[][] = [];
    for (const pts of r) {
      const perJ: number[] = [];
      for (const p of pts) {
        const id = pos.length / 3;
        pos.push(p.x, p.y, st[i], -p.x, p.y, st[i]);
        if (p.x === 0) centre.push(id, id + 1);
        perJ.push(id);
      }
      perG.push(perJ);
    }
    vid.push(perG);
  }

  const inRange = (ranges: Array<[number, number]>, z: number) => ranges.some(([a, b]) => z > Math.min(a, b) && z < Math.max(a, b));
  const classify = (g: number, j: number, z: number, cap: boolean): Mat => {
    if (g < G_SIDE) return 'dark';
    if (g === G_SIDE) {
      if (!cap) {
        for (const l of spec.lamps ?? []) {
          if (j >= l.rows[0] && j <= l.rows[1] && z > Math.min(l.z[0], l.z[1]) && z < Math.max(l.z[0], l.z[1])) return l.mat;
        }
      }
      if (j < (spec.cladding ?? 0)) return 'dark';
      if (spec.stripeRow !== undefined && j === spec.stripeRow) return 'stripe';
      return 'paint';
    }
    if (cap) return 'paint';
    if (j < 2) return j < glassRows && inRange(spec.glassSide, z) ? 'glass' : 'paint';
    if (j < 4) return 'paint';
    return inRange(spec.glassTop, z) ? 'glass' : 'paint';
  };

  const idx: Record<Mat, number[]> = { paint: [], glass: [], dark: [], stripe: [], lampF: [], lampR: [], amber: [] };
  const linerTris: number[] = [];
  for (let i = 0; i < nS - 1; i++) {
    const zm = (st[i] + st[i + 1]) / 2;
    const lined = zm > spec.liner[0] && zm < spec.liner[1];
    for (let g = 0; g < vid[i].length; g++) {
      for (let j = 0; j < vid[i][g].length - 1; j++) {
        const m = classify(g, j, zm, false);
        const A = vid[i][g][j];
        const B = vid[i + 1][g][j];
        const C = vid[i + 1][g][j + 1];
        const Dv = vid[i][g][j + 1];
        idx[m].push(A, Dv, C, A, C, B);
        idx[m].push(A + 1, C + 1, Dv + 1, A + 1, B + 1, C + 1);
        if (lined && m !== 'glass') {
          linerTris.push(A, Dv, C, A, C, B, A + 1, C + 1, Dv + 1, A + 1, B + 1, C + 1);
        }
      }
    }
  }
  for (const [i, front] of [
    [0, false],
    [nS - 1, true],
  ] as Array<[number, boolean]>) {
    for (let g = 0; g < vid[i].length; g++) {
      for (let j = 0; j < vid[i][g].length - 1; j++) {
        const m = classify(g, j, st[i], true);
        const a = vid[i][g][j];
        const b = vid[i][g][j + 1];
        const c = b + 1;
        const d = a + 1;
        if (front) idx[m].push(a, b, c, a, c, d);
        else idx[m].push(a, c, b, a, d, c);
      }
    }
  }

  /* ---- smooth normals over the whole skin ---- */
  const position = new THREE.Float32BufferAttribute(pos, 3);
  const all = new THREE.BufferGeometry();
  all.setAttribute('position', position);
  all.setIndex(Object.values(idx).flat());
  all.computeVertexNormals();
  const normal = all.getAttribute('normal') as THREE.BufferAttribute;
  for (const id of centre) {
    const ny = normal.getY(id);
    const nz = normal.getZ(id);
    const l = Math.hypot(ny, nz) || 1;
    normal.setXYZ(id, 0, ny / l, nz / l);
  }

  const sub = (tris: number[], offset = 0, flip = false): THREE.BufferGeometry => {
    const map = new Map<number, number>();
    const p: number[] = [];
    const n: number[] = [];
    const out: number[] = [];
    for (const v of tris) {
      let k = map.get(v);
      if (k === undefined) {
        k = p.length / 3;
        map.set(v, k);
        const nx = normal.getX(v);
        const ny = normal.getY(v);
        const nz = normal.getZ(v);
        p.push(pos[v * 3] - nx * offset, pos[v * 3 + 1] - ny * offset, pos[v * 3 + 2] - nz * offset);
        if (flip) n.push(-nx, -ny, -nz);
        else n.push(nx, ny, nz);
      }
      out.push(k);
    }
    if (flip) {
      for (let i = 0; i < out.length; i += 3) {
        const t = out[i + 1];
        out[i + 1] = out[i + 2];
        out[i + 2] = t;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((p.length / 3) * 2), 2));
    g.setIndex(out);
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  };

  const sideX = (z: number, y: number): number => {
    const W = halfWAt(z);
    const yu = underAt(z);
    const yb = Math.max(beltAt(z), yu + 0.1);
    if (y <= yb) return sideProfile(W, yu, yb, y);
    return sideProfile(W, yu, yb, yb) - spec.tumble * (y - yb);
  };

  const seam = (z: number, sides: Array<1 | -1>, yMin = -1, upper = false): THREE.BufferGeometry => {
    const r = ring(z);
    const pts = [...r[G_SIDE], ...(upper ? r[G_UPPER].slice(1, 3) : [])].filter((p) => p.y >= yMin);
    const p: number[] = [];
    const n: number[] = [];
    const out: number[] = [];
    const hw = 0.0045;
    for (const s of sides) {
      const base = p.length / 3;
      for (const pt of pts) {
        p.push(s * (pt.x + 0.0025), pt.y, z - hw, s * (pt.x + 0.0025), pt.y, z + hw);
        n.push(s, 0, 0, s, 0, 0);
      }
      for (let j = 0; j < pts.length - 1; j++) {
        const a = base + j * 2;
        if (s > 0) out.push(a, a + 2, a + 3, a, a + 3, a + 1);
        else out.push(a, a + 3, a + 2, a, a + 1, a + 3);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((p.length / 3) * 2), 2));
    g.setIndex(out);
    return g;
  };

  return {
    paint: sub(idx.paint),
    glass: sub(idx.glass),
    dark: sub(idx.dark),
    liner: sub(linerTris, 0.018, true),
    stripe: idx.stripe.length ? sub(idx.stripe) : null,
    lampF: idx.lampF.length ? sub(idx.lampF) : null,
    lampR: idx.lampR.length ? sub(idx.lampR) : null,
    amber: idx.amber.length ? sub(idx.amber) : null,
    sideX,
    beltAt,
    topAt,
    seam,
  };
}
