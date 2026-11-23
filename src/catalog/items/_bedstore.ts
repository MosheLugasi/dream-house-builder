/**
 * Shared helpers for `beds.ts` and `storage.ts`: draped bedding (duvets with turn-down folds,
 * throws, pillows), case goods with animated doors / drawers (parts), handles, interiors and
 * small decor props.
 */
import * as THREE from 'three';
import { D, INK_SOFT, Kit, artPlaneGeo, LINE_THIN, M, PAL, darken, extrudeY, latheGeo, leafGeo, lighten, noise3, rng, smoothProfile, tint, type Ctx2D, type V3 } from '../kit';
import { barHandle } from './_parts';

type Mat = THREE.Material;

/* ------------------------------------------------------------------ materials */

const mats = new Map<string, Mat>();
function cache<T extends Mat>(key: string, make: () => T): T {
  let m = mats.get(key) as T | undefined;
  if (!m) {
    m = make();
    mats.set(key, m);
  }
  return m;
}

export const MX = {
  /** woven bedding fabric visible from both sides (duvets fold over, so the back shows) */
  drape(color: string, scale = 12): THREE.MeshStandardMaterial {
    return cache(`drape|${color}|${scale}`, () => {
      const m = M.fabric(color, scale).clone();
      m.side = THREE.DoubleSide;
      return m;
    });
  },
  /** chunky knit throw, double sided */
  knit(color: string): THREE.MeshStandardMaterial {
    return cache(`knitDS|${color}`, () => {
      const m = M.knit(color).clone();
      m.side = THREE.DoubleSide;
      return m;
    });
  },
  /** slubby linen, double sided */
  linen(color: string): THREE.MeshStandardMaterial {
    return cache(`linenDS|${color}`, () => {
      const m = M.linen(color).clone();
      m.side = THREE.DoubleSide;
      return m;
    });
  },
  /** sheer voile (canopy drapes) */
  sheer(color: string): THREE.MeshStandardMaterial {
    return cache(
      `sheer|${color}`,
      () =>
        new THREE.MeshStandardMaterial({
          color,
          roughness: 0.85,
          metalness: 0,
          transparent: true,
          opacity: 0.4,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
    );
  },
  /** dark interior of a cabinet */
  inside(color: string): THREE.MeshStandardMaterial {
    return M.matte(darken(color, 0.45));
  },
};

/* ------------------------------------------------------------------ draped cloth */

/** Cloth passing over an edge: returns [outward, down] for a distance `e` past the edge. */
function wrap(e: number, r: number, drop: number, tuck: number): [number, number] {
  if (drop <= 0 || e <= 0) return [0, 0];
  const rr = Math.min(r, drop);
  const arc = (rr * Math.PI) / 2;
  if (e <= arc) {
    const a = e / rr;
    return [rr * Math.sin(a), rr * (1 - Math.cos(a))];
  }
  const straight = drop - rr;
  if (e <= arc + straight) return [rr, rr + (e - arc)];
  return [rr - Math.min(tuck, e - arc - straight), drop];
}

function edgeSamples(drop: number, r: number, tuck: number): number[] {
  if (drop <= 0) return [];
  const rr = Math.min(r, drop);
  const arc = (rr * Math.PI) / 2;
  const out = [arc * 0.3, arc * 0.65, arc];
  const L = drop - rr;
  if (L > 0.002) {
    const n = Math.max(1, Math.round(L / 0.09));
    for (let i = 1; i <= n; i++) out.push(arc + (L * i) / n);
  }
  out.push(arc + L + tuck);
  return out;
}

export interface DrapeOpts {
  /** half width of the support (mattress) top along X */
  hw: number;
  /** z of the head-side edge / turn-down crease (cloth coordinate t = 0) */
  zA: number;
  /** z of the foot edge of the support */
  zB: number;
  /** cloth height on top of the support */
  y: number;
  dropL?: number;
  dropR?: number;
  dropF?: number;
  /** radius of the cloth bending over the support edges */
  r?: number;
  /** turn-down: length folded back on top at the head side */
  fold?: number;
  /** duvet thickness: crease diameter and hem tuck */
  thick?: number;
  /** dome height in the middle */
  puff?: number;
  /** soft folds amplitude */
  wrinkle?: number;
  seed?: number;
  /** restrict to a band t ∈ [tFrom, tTo] (throws); t is measured from zA towards the foot */
  tFrom?: number;
  tTo?: number;
  /** extra offset outwards (a throw lying on a duvet built with the same options) */
  lift?: number;
  /** how far the hanging corners flare out */
  flare?: number;
  floor?: number;
  nInner?: number;
}

/**
 * A soft cloth (duvet, bedspread, throw) lying on a rectangular support and hanging over its sides
 * and foot, with an optional turn-down fold, soft wrinkles and folds in the hanging parts.
 * Build two drapes with the same options (and `lift` + `tFrom/tTo` on the second) to lay a throw
 * exactly over a duvet. Use a double-sided material (`MX.drape`).
 */
export function drapeGeo(o: DrapeOpts): THREE.BufferGeometry {
  const lift = o.lift ?? 0;
  const r0 = (o.r ?? 0.06) + lift;
  const thick = o.thick ?? 0.05;
  const rho = thick / 2;
  const tuck = Math.max(0.012, thick * 0.7);
  const dL = o.dropL ?? 0;
  const dR = o.dropR ?? 0;
  const dF = o.dropF ?? 0;
  const Lz = o.zB - o.zA;
  const fold = o.fold ?? 0;
  const puff = o.puff ?? 0.03;
  const wr = o.wrinkle ?? 0.012;
  const seed = o.seed ?? 1;
  const flare = o.flare ?? 0.08;
  const floor = o.floor ?? 0.01;
  const arcL = Math.PI * rho;

  const ss: number[] = [];
  const nIn = o.nInner ?? 10;
  for (const e of edgeSamples(dL, r0, tuck).reverse()) ss.push(-(o.hw + e));
  for (let i = 0; i <= nIn; i++) ss.push(-o.hw + (2 * o.hw * i) / nIn);
  for (const e of edgeSamples(dR, r0, tuck)) ss.push(o.hw + e);

  const ts: number[] = [];
  const t0 = o.tFrom ?? (fold > 0 ? -(fold + arcL) : 0);
  const footS = edgeSamples(dF, r0, tuck);
  const t1 = o.tTo ?? Lz + (footS.length ? footS[footS.length - 1] : 0);
  if (t0 < 0) {
    const flat = -arcL - t0;
    const nf = Math.max(1, Math.round(flat / 0.1));
    for (let i = 0; i < nf; i++) ts.push(t0 + (flat * i) / nf);
    for (let j = 0; j < 4; j++) ts.push(-arcL + (arcL * j) / 4);
  }
  const m0 = Math.max(0, t0);
  const m1 = Math.min(Lz, t1);
  const nm = Math.max(2, Math.round((m1 - m0) / 0.15));
  for (let i = 0; i <= nm; i++) ts.push(m0 + ((m1 - m0) * i) / nm);
  if (t1 > Lz) for (const e of footS) if (e <= t1 - Lz + 1e-6) ts.push(Lz + e);

  const ns = ss.length;
  const nt = ts.length;
  const pos = new Float32Array(ns * nt * 3);
  const uv = new Float32Array(ns * nt * 2);
  let vi = 0;
  for (let j = 0; j < nt; j++) {
    const t = ts[j];
    for (let i = 0; i < ns; i++) {
      const s = ss[i];
      let layer = 0;
      let z: number;
      let dyZ = 0;
      let oz = 0;
      if (t < 0) {
        const u = -t;
        if (u <= arcL) {
          const f = u / rho;
          z = o.zA - rho * Math.sin(f);
          layer = rho * (1 - Math.cos(f));
        } else {
          z = o.zA + (u - arcL);
          layer = 2 * rho;
        }
      } else if (t > Lz) {
        [oz, dyZ] = wrap(t - Lz, r0 + layer, dF, tuck);
        z = o.zB + oz;
      } else z = o.zA + t;
      const eX = Math.abs(s) - o.hw;
      let x = s;
      let dyX = 0;
      if (eX > 0) {
        const [ox, dy] = wrap(eX, r0 + layer, s < 0 ? dL : dR, tuck);
        dyX = dy;
        x = Math.sign(s) * (o.hw + ox);
      }
      // dome + soft wrinkles on top (position based so stacked layers follow each other)
      const ix = Math.max(0, 1 - Math.pow(Math.min(1, Math.abs(x) / o.hw), 4));
      const zc = Math.min(1, Math.max(0, (z - o.zA) / Math.max(0.01, Lz)));
      const iz = 1 - Math.pow(Math.abs(zc * 2 - 1), 4);
      const dome = puff * ix * iz;
      const wn = (noise3(x * 2.1 + seed * 3.1, z * 1.7, seed * 0.73) - 0.5) * 2;
      const rip = Math.sin(x * 6 + z * 2.6 + seed + wn * 3);
      const fx = Math.min(1, Math.max(0, -eX / 0.12));
      const fz = t > Lz ? 0 : Math.min(1, Math.max(0, (Lz - t) / 0.12));
      const topW = wr * (0.75 * wn + 0.35 * rip) * fx * fz;
      // vertical folds in the hanging parts
      if (dyX > 0) {
        const k = Math.min(1, dyX / 0.12);
        x += Math.sign(s) * wr * 1.2 * (0.5 + 0.5 * Math.sin(z * 13 + seed * 2 + wn * 2.5)) * k;
      }
      if (dyZ > 0) {
        const k = Math.min(1, dyZ / 0.12);
        z += wr * 1.2 * (0.5 + 0.5 * Math.sin(x * 13 + seed * 5 + wn * 2.5)) * k;
      }
      let down = dyX + dyZ;
      if (dyX > 0 && dyZ > 0) {
        x += Math.sign(s) * flare * dyZ;
        z += flare * dyX;
        down = Math.max(dyX, dyZ) + 0.3 * Math.min(dyX, dyZ);
      }
      const y = Math.max(floor, o.y + lift + layer + dome + topW - down);
      pos[vi * 3] = x;
      pos[vi * 3 + 1] = y;
      pos[vi * 3 + 2] = z;
      uv[vi * 2] = s;
      uv[vi * 2 + 1] = t;
      vi++;
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < nt - 1; j++) {
    for (let i = 0; i < ns - 1; i++) {
      const a = j * ns + i;
      const b = (j + 1) * ns + i;
      const c = a + 1;
      const d = b + 1;
      idx.push(a, b, c, c, b, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Round bedspread over a round mattress of radius R (centre at the origin). */
export function roundDrapeGeo(R: number, y: number, drop: number, o: { r?: number; puff?: number; wrinkle?: number; seed?: number; nRing?: number; nSeg?: number; lift?: number; rMax?: number } = {}): THREE.BufferGeometry {
  const lift = o.lift ?? 0;
  const r = (o.r ?? 0.06) + lift;
  const tuck = 0.03;
  const wr = o.wrinkle ?? 0.012;
  const seed = o.seed ?? 3;
  const puff = o.puff ?? 0.03;
  const rMax = o.rMax ?? R;
  const nSeg = o.nSeg ?? 40;
  const rs: number[] = [];
  const nRing = o.nRing ?? 6;
  for (let i = 0; i <= nRing; i++) rs.push((rMax * i) / nRing);
  if (rMax >= R) for (const e of edgeSamples(drop, r, tuck)) rs.push(R + e);
  const pos: number[] = [];
  const uv: number[] = [];
  for (let j = 0; j < rs.length; j++) {
    for (let i = 0; i <= nSeg; i++) {
      const th = (i / nSeg) * Math.PI * 2;
      const rho = rs[j];
      const [ox, dy] = wrap(rho - R, r, drop, tuck);
      let rad = rho > R ? R + ox : rho;
      const cx = Math.cos(th);
      const cz = Math.sin(th);
      const wn = (noise3(cx * rad * 2.1 + seed, cz * rad * 2.1, seed * 0.5) - 0.5) * 2;
      if (dy > 0) rad += wr * 1.8 * (0.5 + 0.5 * Math.sin(th * 11 + wn * 2.5)) * Math.min(1, dy / 0.12);
      const inR = Math.min(1, rad / R);
      const dome = puff * (1 - Math.pow(inR, 4));
      const topW = rho < R ? wr * (0.75 * wn + 0.3 * Math.sin(cx * rad * 6 + seed)) * Math.min(1, (R - rho) / 0.12) : 0;
      pos.push(cx * rad, Math.max(0.01, y + lift + dome + topW - dy), cz * rad);
      uv.push(th * R, rho);
    }
  }
  const idx: number[] = [];
  const n = nSeg + 1;
  for (let j = 0; j < rs.length - 1; j++) {
    for (let i = 0; i < nSeg; i++) {
      const a = j * n + i;
      const b = (j + 1) * n + i;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Plump pillow (lighter than kit's pillowGeo): squarish super-ellipsoid with a soft dent on top. */
export function softPillowGeo(w: number, h: number, d: number, dent = 0.18): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 12, 7);
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
    let yy = ((Math.sign(y) * Math.pow(Math.abs(y), 0.8) * h) / 2) * (0.25 + 0.75 * flat);
    if (y > 0) yy *= 1 - dent * Math.exp(-(sx * sx + sz * sz) * 3);
    p.setXYZ(i, (sx * w) / 2, yy, (sz * d) / 2);
  }
  g.computeVertexNormals();
  return g;
}

/* ------------------------------------------------------------------ bedding */

export interface BeddingOpts {
  /** mattress width (X) / length (Z) / height */
  mw: number;
  len: number;
  mh?: number;
  /** underside of the mattress */
  y: number;
  /** head end of the mattress */
  zHead: number;
  x?: number;
  /** half width the duvet hangs over (frame rails), defaults to the mattress */
  hw?: number;
  drop?: number;
  dropF?: number;
  sheet: string;
  duvet: string;
  /** throw colour (null = none) */
  throwC?: string | null;
  throwKind?: 'knit' | 'linen' | 'fabric';
  /** sleeping pillows across */
  pillows: number;
  /** upright euro pillows behind the sleeping pillows */
  euro?: boolean;
  pillowC?: string;
  /** decorative cushion colours (front row, centred) */
  deco?: string[];
  decoMat?: 'velvet' | 'linen' | 'boucle' | 'fabric' | 'knit';
  /** turn-down length (0 = flat bedspread over the pillows' foot) */
  fold?: number;
  /** distance from the head end to the duvet crease */
  cover?: number;
  puff?: number;
  wrinkle?: number;
  seed?: number;
  floor?: number;
  /** duvet thickness */
  thick?: number;
  /** radius of the duvet rolling over the edges */
  r?: number;
}

export interface BeddingInfo {
  /** mattress top */
  top: number;
  zA: number;
}

/** Mattress with fitted sheet, puffy duvet with turn-down, optional throw, pillows and cushions. */
export function bedding2(k: Kit, o: BeddingOpts): BeddingInfo {
  const mh = o.mh ?? 0.22;
  const x0 = o.x ?? 0;
  const sheet = M.fabric(o.sheet, 18);
  const zc = o.zHead + o.len / 2;
  // mattress ticking band peeking out under the fitted sheet's elastic hem
  k.rbox(o.mw - 0.01, 0.04, o.len - 0.01, 0.015, M.fabric('#e8e5de', 30), x0, o.y, zc, 1);
  k.rbox(o.mw, mh - 0.025, o.len, 0.05, sheet, x0, o.y + 0.025, zc, 1);
  const top = o.y + mh;
  const thick = o.thick ?? 0.055;
  const nP = o.pillows;
  const pillowZone = (o.euro ? 0.2 : 0) + 0.5;
  const cover = o.cover ?? pillowZone + (o.deco?.length ? 0.06 : 0) + 0.04;
  const zA = o.zHead + cover;
  const zB = o.zHead + o.len;
  const drop = o.drop ?? mh * 0.85;
  const dopts: DrapeOpts = {
    hw: o.hw ?? o.mw / 2 + 0.01,
    zA,
    zB,
    y: top + thick / 2,
    dropL: drop,
    dropR: drop,
    dropF: o.dropF ?? drop,
    r: o.r ?? 0.045,
    fold: o.fold ?? 0.32,
    thick,
    puff: o.puff ?? 0.035,
    wrinkle: o.wrinkle ?? 0.016,
    seed: o.seed ?? 1,
    floor: o.floor ?? 0.012,
  };
  const duvet = k.geo(drapeGeo(dopts), MX.drape(o.duvet, 11), x0, 0, 0);
  duvet.castShadow = true;
  if (o.throwC) {
    const tm = o.throwKind === 'linen' ? MX.linen(o.throwC) : o.throwKind === 'fabric' ? MX.drape(o.throwC, 8) : MX.knit(o.throwC);
    const L = zB - zA;
    const tw = Math.min(0.6, L * 0.42);
    const tOpts: DrapeOpts = { ...dopts, fold: 0, lift: 0.014, tFrom: L - tw - 0.08, tTo: L - 0.08, dropL: drop * 0.8, dropR: drop * 0.8, dropF: 0, nInner: 10 };
    k.geo(drapeGeo(tOpts), tm, x0, 0, 0);
  }
  // pillows
  const pc = M.fabric(o.pillowC ?? o.sheet, 18);
  const r = rng((o.seed ?? 1) * 7 + 3);
  const pw = nP === 1 ? Math.min(0.68, o.mw - 0.14) : Math.min(0.74, (o.mw - 0.08) / nP - 0.03);
  let zRow = o.zHead + 0.04;
  if (o.euro) {
    const ew = Math.min(0.66, (o.mw - 0.06) / nP - 0.02);
    for (let i = 0; i < nP; i++) {
      const x = x0 + (nP === 1 ? 0 : (i - (nP - 1) / 2) * ((o.mw - 0.06) / nP));
      const p = k.geo(softPillowGeo(ew, 0.17, 0.62, 0.1), M.fabric(o.duvet, 11), x, top + 0.29, zRow + 0.1);
      p.rotation.set(-1.18, (r() - 0.5) * 0.06, (r() - 0.5) * 0.04);
    }
    zRow += 0.2;
  }
  for (let i = 0; i < nP; i++) {
    const x = x0 + (nP === 1 ? 0 : (i - (nP - 1) / 2) * ((o.mw - 0.04) / nP));
    const p = k.geo(softPillowGeo(pw, 0.17, 0.46), pc, x, top + 0.1 + (o.euro ? 0.02 : 0.03), zRow + 0.23);
    p.rotation.set(o.euro ? -0.42 : -0.3, (r() - 0.5) * 0.08, (r() - 0.5) * 0.05);
  }
  // decorative cushions leaning on the pillows
  const deco = o.deco ?? [];
  const dm = (c: string): Mat =>
    o.decoMat === 'velvet' ? M.velvet(c) : o.decoMat === 'linen' ? M.linen(c) : o.decoMat === 'boucle' ? M.boucle(c) : o.decoMat === 'knit' ? M.knit(c) : M.fabric(c, 10);
  deco.forEach((c, i) => {
    const n = deco.length;
    const lumbar = n % 2 === 1 && i === (n - 1) / 2 && n > 1;
    const cw = lumbar ? 0.55 : 0.44;
    const ch = lumbar ? 0.3 : 0.44;
    const x = x0 + (i - (n - 1) / 2) * Math.min(0.42, (o.mw - 0.3) / Math.max(1, n - 1));
    const zz = zRow + 0.42 + (lumbar ? 0.08 : 0);
    const p = k.geo(softPillowGeo(cw, 0.14, ch, 0.05), dm(c), x, top + ch / 2 * 0.92 + 0.02, zz);
    p.rotation.set(-1.18, (r() - 0.5) * 0.16, (r() - 0.5) * 0.12);
  });
  return { top, zA };
}

/* ------------------------------------------------------------------ bed plan symbol */

export function drawBedding2(ctx: Ctx2D, o: { mw: number; len: number; zHead: number; x?: number; duvet: string; throwC?: string | null; pillows: number; euro?: boolean; deco?: string[]; hw?: number; drop?: number; cover?: number; fold?: number }): void {
  const x0 = o.x ?? 0;
  const zF = o.zHead + o.len;
  const hw = (o.hw ?? o.mw / 2) + Math.min(0.06, (o.drop ?? 0.2) * 0.2);
  D.box(ctx, x0 - o.mw / 2, o.zHead, x0 + o.mw / 2, zF, 0.05, '#fbfaf6', INK_SOFT, LINE_THIN);
  const cover = o.cover ?? (o.euro ? 0.2 : 0) + 0.5 + (o.deco?.length ? 0.06 : 0) + 0.04;
  const zA = o.zHead + cover;
  const fold = o.fold ?? 0.32;
  D.box(ctx, x0 - hw, zA - 0.02, x0 + hw, zF + ((o.drop ?? 0.2) > 0 ? 0.03 : 0), 0.05, tint(o.duvet, 0.35));
  if (fold > 0) D.box(ctx, x0 - hw, zA - 0.02, x0 + hw, zA + fold, 0.04, tint(o.duvet, 0.6), undefined, LINE_THIN);
  if (o.throwC) {
    const L = zF - zA;
    const tw = Math.min(0.6, L * 0.42);
    D.box(ctx, x0 - hw, zF - 0.08 - tw, x0 + hw, zF - 0.08, 0.02, tint(o.throwC, 0.3), undefined, LINE_THIN);
  }
  const n = o.pillows;
  const pw = n === 1 ? Math.min(0.68, o.mw - 0.14) : Math.min(0.74, (o.mw - 0.08) / n - 0.03);
  const zp = o.zHead + 0.04 + (o.euro ? 0.2 : 0) + 0.23;
  for (let i = 0; i < n; i++) {
    const x = x0 + (n === 1 ? 0 : (i - (n - 1) / 2) * ((o.mw - 0.04) / n));
    if (o.euro) D.rr(ctx, x, o.zHead + 0.13, pw - 0.04, 0.16, 0.05, tint(o.duvet, 0.55), undefined, LINE_THIN);
    D.rr(ctx, x, zp, pw, 0.42, 0.09, '#ffffff', undefined, LINE_THIN);
  }
}

/* ------------------------------------------------------------------ handles */

export type HandleKind = 'bar' | 'knob' | 'ring' | 'tab' | 'cup' | 'none';

/** Handle on a front whose face is at z = zf (local), centred at (x, y). */
export function handle(k: Kit, kind: HandleKind, x: number, y: number, zf: number, mat: Mat, len = 0.14, vertical = false): void {
  if (kind === 'bar') {
    const a: V3 = vertical ? [x, y - len / 2, zf + 0.024] : [x - len / 2, y, zf + 0.024];
    const b: V3 = vertical ? [x, y + len / 2, zf + 0.024] : [x + len / 2, y, zf + 0.024];
    barHandle(k, a, b, zf, mat, 0.0055);
  } else if (kind === 'knob') {
    k.rod([x, y, zf], [x, y, zf + 0.018], 0.005, mat, 0.0065, 8);
    k.sphere(0.0145, mat, x, y, zf + 0.022, 1, 0.95, 0.75, 10);
  } else if (kind === 'ring') {
    k.rod([x, y, zf], [x, y, zf + 0.008], 0.012, mat, 0.012, 10);
    const ring = k.geo(new THREE.TorusGeometry(0.022, 0.0035, 6, 14), mat, x, y - 0.024, zf + 0.012);
    ring.rotation.x = 0.25;
  } else if (kind === 'tab') {
    const tab = k.rbox(0.032, 0.075, 0.005, 0.002, M.leather('#6d4429'), x, y - 0.045, zf + 0.006, 1);
    tab.rotation.x = 0.28;
    k.rod([x, y + 0.02, zf], [x, y + 0.02, zf + 0.008], 0.0045, mat, 0.0045, 6);
  } else if (kind === 'cup') {
    const w = len;
    k.rbox(w, 0.02, 0.016, 0.004, mat, x, y - 0.01, zf + 0.008, 1);
    k.box(w - 0.012, 0.006, 0.004, M.matte('#1c1c1e'), x, y - 0.013, zf + 0.0005);
  }
}

/* ------------------------------------------------------------------ fronts, doors, drawers */

export type FrontStyle = 'flat' | 'shaker' | 'cane' | 'fluted' | 'mirror' | 'glass' | 'slats' | 'reeded-glass';

export interface FrontMats {
  front: Mat;
  /** frame of cane / mirror / glass fronts (defaults to `front`) */
  frame?: Mat;
  /** dark backing (slats) */
  back?: Mat;
  cane?: Mat;
}

/** Front panel occupying x ∈ [x0, x0 + w], y ∈ [0, h], z ∈ [-t, 0]. */
export function frontPanel(k: Kit, style: FrontStyle, x0: number, w: number, h: number, t: number, m: FrontMats): void {
  const cx = x0 + w / 2;
  const fm = m.frame ?? m.front;
  const fw = Math.min(0.065, w * 0.16, h * 0.16);
  const frame = (): void => {
    k.box(fw, h, t, fm, x0 + fw / 2, 0, -t / 2);
    k.box(fw, h, t, fm, x0 + w - fw / 2, 0, -t / 2);
    k.box(w - 2 * fw, fw, t, fm, cx, 0, -t / 2);
    k.box(w - 2 * fw, fw, t, fm, cx, h - fw, -t / 2);
  };
  switch (style) {
    case 'flat':
      k.rbox(w, h, t, 0.0035, m.front, cx, 0, -t / 2, 1);
      break;
    case 'shaker':
      frame();
      k.box(w - 2 * fw, h - 2 * fw, t * 0.5, m.front, cx, fw, -t * 0.75);
      // thin bevel lines inside the frame
      k.box(w - 2 * fw - 0.01, 0.006, t * 0.2, fm, cx, fw + 0.002, -t * 0.45);
      break;
    case 'cane':
      frame();
      k.box(w - 2 * fw + 0.01, h - 2 * fw + 0.01, 0.004, m.cane ?? M.rattan(), cx, fw - 0.005, -t * 0.55);
      k.box(w - 2 * fw, h - 2 * fw, 0.003, m.back ?? M.matte('#2b2520'), cx, fw, -t + 0.0015);
      break;
    case 'mirror':
      frame();
      k.box(w - 2 * fw + 0.004, h - 2 * fw + 0.004, 0.006, M.mirror(), cx, fw - 0.002, -t * 0.4);
      k.box(w - 2 * fw, h - 2 * fw, 0.004, m.back ?? M.matte('#26292c'), cx, fw, -t + 0.002);
      break;
    case 'glass':
      frame();
      k.box(w - 2 * fw + 0.008, h - 2 * fw + 0.008, 0.004, M.glass('#e6f0ee', 0.18), cx, fw - 0.004, -t * 0.5);
      break;
    case 'reeded-glass': {
      frame();
      const gw = w - 2 * fw;
      const n = Math.max(4, Math.round(gw / 0.014));
      const g = M.glass('#eaf2ef', 0.32);
      for (let i = 0; i < n; i++) {
        const x = x0 + fw + (gw * (i + 0.5)) / n;
        const rd = k.cyl(gw / n / 2, h - 2 * fw, g, x, fw, -t * 0.5, gw / n / 2, 5);
        rd.scale.z = 0.5;
      }
      break;
    }
    case 'fluted': {
      const fl = 0.03;
      const n = Math.max(3, Math.round(w / fl));
      const fwid = w / n;
      const dep = Math.min(0.007, t * 0.4);
      const pts: THREE.Vector2[] = [new THREE.Vector2(x0, t), new THREE.Vector2(x0 + w, t)];
      // shape y = -z: back at y = t, front crests at y = 0
      for (let i = n - 1; i >= 0; i--) {
        const xm = x0 + fwid * (i + 0.5);
        for (let a = 0; a < 5; a++) {
          const phi = (a / 5) * Math.PI;
          pts.push(new THREE.Vector2(xm + (fwid / 2) * Math.cos(phi), dep - dep * Math.sin(phi)));
        }
      }
      pts.push(new THREE.Vector2(x0, dep));
      const shape = new THREE.Shape(pts);
      k.geo(extrudeY(shape, h), m.front, 0, 0, 0);
      break;
    }
    case 'slats': {
      k.box(w, h, t * 0.4, m.back ?? M.matte('#2a2522'), cx, 0, -t * 0.8);
      const sw = 0.026;
      const n = Math.max(3, Math.round(w / (sw + 0.011)));
      const step = w / n;
      for (let i = 0; i < n; i++) k.box(step - 0.011, h, t * 0.65, m.front, x0 + step * (i + 0.5), 0, -t * 0.325);
      break;
    }
  }
}

function mkPart(k: Kit, name: 'door' | 'drawer', x: number, y: number, z: number, open: number): Kit {
  return k.part(name, x, y, z, { open });
}

export interface DoorOpts {
  /** hinge x (outer edge of the door) */
  hingeX: number;
  y: number;
  /** front face z */
  zf: number;
  w: number;
  h: number;
  side: 'l' | 'r';
  style?: FrontStyle;
  mats: FrontMats;
  handle?: HandleKind;
  hmat?: Mat;
  /** handle centre height above the door bottom */
  hy?: number;
  hlen?: number;
  t?: number;
  open?: number;
}

/** Hinged door as a 'door' part (pivot = hinge on the front plane). */
export function door(k: Kit, o: DoorOpts): Kit {
  const t = o.t ?? 0.02;
  const open = o.open ?? (o.side === 'l' ? -1.7 : 1.7);
  const p = mkPart(k, 'door', o.hingeX, o.y, o.zf, open);
  const x0 = o.side === 'l' ? 0 : -o.w;
  frontPanel(p, o.style ?? 'flat', x0, o.w, o.h, t, o.mats);
  const hk = o.handle ?? 'bar';
  if (hk !== 'none') {
    const hx = o.side === 'l' ? o.w - 0.04 : -o.w + 0.04;
    const hy = o.hy ?? o.h / 2;
    handle(p, hk, hx, hy, 0, o.hmat ?? M.brass(), o.hlen ?? Math.min(0.22, o.h * 0.3), true);
  }
  return p;
}

export interface DrawerOpts {
  x: number;
  y: number;
  zf: number;
  w: number;
  h: number;
  depth: number;
  style?: FrontStyle;
  mats: FrontMats;
  box?: Mat;
  handle?: HandleKind;
  hmat?: Mat;
  hlen?: number;
  /** finger groove along the top edge instead of a handle */
  groove?: boolean;
  t?: number;
  open?: number;
  /** folded clothes inside */
  clothes?: number;
}

/** Drawer (front + box) as a 'drawer' part sliding out along +Z. Pivot = front face, bottom centre. */
export function drawer(k: Kit, o: DrawerOpts): Kit {
  const t = o.t ?? 0.02;
  const p = mkPart(k, 'drawer', o.x, o.y, o.zf, o.open ?? 0.3);
  const gh = o.groove ? 0.018 : 0;
  frontPanel(p, o.style ?? 'flat', -o.w / 2, o.w, o.h - gh, t, o.mats);
  if (o.groove) {
    p.box(o.w, gh, t * 0.45, M.matte('#1e1d1c'), 0, o.h - gh, -t * 0.75);
    p.box(o.w, 0.004, t, o.mats.front, 0, o.h - 0.004, -t / 2);
  }
  // drawer box (light birch), only visible when pulled out
  const bm = o.box ?? M.wood(PAL.birch);
  const bh = Math.max(0.05, o.h - 0.05);
  const bd = o.depth - t - 0.02;
  const bw = o.w - 0.05;
  const zc = -t - bd / 2;
  for (const s of [-1, 1]) p.box(0.012, bh, bd, bm, (s * (bw - 0.012)) / 2, 0.02, zc);
  p.box(bw - 0.024, bh, 0.012, bm, 0, 0.02, -t - bd + 0.006);
  p.box(bw - 0.024, 0.008, bd, bm, 0, 0.02, zc);
  const n = o.clothes ?? 0;
  if (n > 0) {
    const r = rng(Math.round(o.x * 100 + o.y * 37) + 11);
    const cw = (bw - 0.04) / n;
    for (let i = 0; i < n; i++) {
      const col = CLOTH_COLORS[Math.floor(r() * CLOTH_COLORS.length)];
      p.box(cw - 0.012, Math.min(bh - 0.02, 0.05 + r() * 0.04), bd - 0.06, M.fabric(col, 16), -bw / 2 + 0.02 + cw * (i + 0.5), 0.028, zc);
    }
  }
  const hk = o.handle ?? 'bar';
  if (!o.groove && hk !== 'none') handle(p, hk, 0, (o.h - gh) / 2, 0, o.hmat ?? M.brass(), o.hlen ?? Math.min(0.2, o.w * 0.4));
  return p;
}

/* ------------------------------------------------------------------ carcass */

export interface CarcassOpts {
  w: number;
  h: number;
  d: number;
  /** bottom of the box */
  y0?: number;
  x?: number;
  z?: number;
  mat: Mat;
  inner?: Mat;
  t?: number;
  /** omit the top panel (a separate top is laid on it) */
  noTop?: boolean;
}

/** Open-front hollow case: sides, top, bottom, back. Returns inner bounds. */
export function carcass(k: Kit, o: CarcassOpts): { x0: number; x1: number; y0: number; y1: number; zBack: number; zFront: number } {
  const t = o.t ?? 0.018;
  const y0 = o.y0 ?? 0;
  const x = o.x ?? 0;
  const z = o.z ?? 0;
  const inner = o.inner ?? o.mat;
  for (const s of [-1, 1]) k.box(t, o.h, o.d, o.mat, x + s * (o.w / 2 - t / 2), y0, z);
  k.box(o.w - 2 * t, t, o.d, o.mat, x, y0, z);
  if (!o.noTop) k.box(o.w - 2 * t, t, o.d, o.mat, x, y0 + o.h - t, z);
  k.box(o.w - 2 * t, o.h - 2 * t, 0.008, inner, x, y0 + t, z - o.d / 2 + 0.004);
  return { x0: x - o.w / 2 + t, x1: x + o.w / 2 - t, y0: y0 + t, y1: y0 + o.h - (o.noTop ? 0 : t), zBack: z - o.d / 2 + 0.008, zFront: z + o.d / 2 };
}

/* ------------------------------------------------------------------ interiors & decor */

export const CLOTH_COLORS = ['#e9e4da', '#c9d3dc', '#3d4b5c', '#a7b59a', '#d8b9a8', '#8a8f96', '#f4f1ea', '#b0573f', '#2f3236', '#d6c08f', '#7a8fa3'];

/** Rail with garments on hangers across x0..x1 (garments hang sideways, depth along Z). */
export function hangingClothes(k: Kit, x0: number, x1: number, yRail: number, z: number, depth: number, seed: number, maxLen = 1.0, railMat: Mat = M.chrome()): void {
  k.rod([x0, yRail, z], [x1, yRail, z], 0.011, railMat, 0.011, 10);
  const r = rng(seed);
  const hanger = M.wood('#c9a777');
  let x = x0 + 0.04;
  while (x < x1 - 0.04) {
    const th = 0.02 + r() * 0.03;
    const len = Math.max(0.35, maxLen * (0.5 + r() * 0.5));
    const col = CLOTH_COLORS[Math.floor(r() * CLOTH_COLORS.length)];
    const gd = depth * (0.85 + r() * 0.15);
    // hanger: hook + shoulder bar
    k.rod([x, yRail - 0.005, z], [x, yRail - 0.05, z], 0.003, M.chrome(), 0.003, 4);
    k.box(0.012, 0.016, gd * 0.92, hanger, x, yRail - 0.07, z);
    const g = k.box(th, len, gd, M.fabric(col, 14), x, yRail - 0.07 - len, z);
    g.rotation.z = (r() - 0.5) * 0.05;
    x += th + 0.012 + r() * 0.02;
  }
}

/** Stack of folded clothes / towels; returns top height. */
export function foldedStack(k: Kit, x: number, y: number, z: number, w: number, d: number, n: number, seed: number): number {
  const r = rng(seed);
  let yy = y;
  for (let i = 0; i < n; i++) {
    const h = 0.035 + r() * 0.03;
    const col = CLOTH_COLORS[Math.floor(r() * CLOTH_COLORS.length)];
    k.rbox(w * (0.92 + r() * 0.08), h, d * (0.9 + r() * 0.1), Math.min(0.012, h / 2.5), M.fabric(col, 16), x + (r() - 0.5) * 0.015, yy, z + (r() - 0.5) * 0.01, 1);
    yy += h;
  }
  return yy;
}

/** Ceramic vase (lathe), base at (x, y, z). */
export function vase(k: Kit, x: number, y: number, z: number, h: number, r: number, mat: Mat, kind: 'bud' | 'round' | 'tall' | 'bowl' = 'round'): void {
  const p: Array<[number, number]> =
    kind === 'bud'
      ? [[r * 0.55, 0], [r, h * 0.3], [r * 0.85, h * 0.62], [r * 0.3, h * 0.82], [r * 0.32, h]]
      : kind === 'tall'
        ? [[r * 0.6, 0], [r * 0.95, h * 0.25], [r, h * 0.55], [r * 0.7, h * 0.85], [r * 0.62, h]]
        : kind === 'bowl'
          ? [[r * 0.45, 0], [r * 0.8, h * 0.35], [r, h]]
          : [[r * 0.5, 0], [r, h * 0.35], [r * 0.92, h * 0.7], [r * 0.55, h * 0.92], [r * 0.6, h]];
  const prof: Array<[number, number]> = [[0, 0], ...smoothProfile(p, 10)];
  const inner = prof[prof.length - 1];
  prof.push([inner[0] * 0.85, inner[1] - 0.006], [0, h * (kind === 'bowl' ? 0.3 : 0.75)]);
  k.geo(latheGeo(prof, 14), mat, x, y, z);
}

/** Small potted plant (leafy), base at (x, y, z). Returns its height. */
export function smallPlant(k: Kit, x: number, y: number, z: number, s = 1, potMat: Mat = M.ceramic('#efebe4'), leafC: string = PAL.leaf, seed = 1, trailing = false): number {
  const pr = 0.06 * s;
  const ph = 0.09 * s;
  k.geo(latheGeo([[0, 0], [pr * 0.78, 0], [pr, ph * 0.9], [pr * 1.02, ph], [pr * 0.9, ph], [pr * 0.85, ph - 0.01], [0, ph - 0.01]], 12), potMat, x, y, z);
  k.disc(pr * 0.86, 0.004, M.soil(), x, y + ph - 0.012, z, 10);
  const r = rng(seed);
  const lm = M.leaf(leafC);
  const n = trailing ? 6 : 8;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.4;
    const len = (trailing ? 0.12 : 0.1 + r() * 0.06) * s;
    const g = leafGeo(len, len * 0.55, { droop: trailing ? 0.6 : 0.35, fold: 0.2, seg: 4 });
    const m = k.geo(g, lm, x + Math.cos(a) * pr * 0.3, y + ph + (trailing ? 0 : 0.02 + r() * 0.04 * s), z + Math.sin(a) * pr * 0.3);
    m.rotation.set(trailing ? 0.1 : -0.5 - r() * 0.4, Math.PI / 2 - a, 0);
  }
  if (trailing) {
    // vines falling over the shelf edge (towards +Z)
    const vm = M.leaf(darken(leafC, 0.1));
    for (const sx of [-1, 1]) {
      const pts: V3[] = [
        [x + sx * pr * 0.5, y + ph, z + pr * 0.4],
        [x + sx * pr * 0.9, y + ph - 0.01, z + pr * 1.4],
        [x + sx * pr * 1.1, y + ph - 0.12 * s, z + pr * 1.9],
        [x + sx * pr * 1.3, y + ph - 0.26 * s, z + pr * 2.0],
      ];
      k.tube(pts, 0.002, vm, { seg: 8, radial: 3 });
      for (let j = 1; j < 4; j++) {
        const [px, py, pz] = pts[j];
        const lf = k.geo(leafGeo(0.045 * s, 0.035 * s, { seg: 3, droop: 0.3 }), lm, px, py, pz);
        lf.rotation.set(0.9, sx * 0.6 + r() * 0.5, 0);
      }
    }
  }
  return ph + 0.16 * s;
}

/** Woven or fabric storage basket (open top), base at (x, y, z). */
export function basket(k: Kit, x: number, y: number, z: number, w: number, h: number, d: number, mat: Mat, rim?: Mat, withHole = false): void {
  const t = 0.01;
  k.box(w, h, t, mat, x, y, z + d / 2 - t / 2);
  k.box(w, h, t, mat, x, y, z - d / 2 + t / 2);
  for (const s of [-1, 1]) k.box(t, h, d - 2 * t, mat, x + s * (w / 2 - t / 2), y, z);
  k.box(w - 2 * t, t, d - 2 * t, mat, x, y, z);
  if (rim) {
    k.box(w + 0.006, 0.014, t + 0.006, rim, x, y + h - 0.014, z + d / 2 - t / 2);
    k.box(w + 0.006, 0.014, t + 0.006, rim, x, y + h - 0.014, z - d / 2 + t / 2);
  }
  if (withHole) k.rbox(0.09, 0.03, 0.004, 0.012, M.matte('#2a2826'), x, y + h - 0.07, z + d / 2 + 0.001, 1);
}

/** Small framed picture leaning against a wall / shelf back. */
export function leaningFrame(k: Kit, x: number, y: number, z: number, w: number, h: number, frameMat: Mat, art: Mat): void {
  const g = new Kit();
  g.box(w, h, 0.018, frameMat, 0, 0, 0);
  g.box(w - 0.03, h - 0.03, 0.002, M.matte('#f4f1ea'), 0, 0.015, 0.0095);
  g.geo(artPlaneGeo(w - 0.08, h - 0.08), art, 0, 0.04, 0.0108);
  const s = k.sub(g, x, y + 0.002, z);
  s.rotation.x = -0.1;
}

/** Depth a handle of this kind sticks out in front of its front panel. */
export function handleDepth(kind: HandleKind): number {
  return kind === 'bar' ? 0.031 : kind === 'knob' ? 0.037 : kind === 'ring' ? 0.024 : kind === 'tab' ? 0.022 : kind === 'cup' ? 0.018 : 0.002;
}

/** Tapered square leg from the floor to y = h at (x, z) with a small splay. */
export function taperLeg(k: Kit, x: number, z: number, h: number, top: number, bot: number, mat: Mat, splayX = 0, splayZ = 0, y0 = 0): void {
  k.beam([x + splayX, y0, z + splayZ], [x, y0 + h, z], (top + bot) / 2, (top + bot) / 2, mat, 0.003);
}

/* ------------------------------------------------------------------ plan helpers */

/** Case-goods plan symbol: body, front line and optional door swings. */
export function planCase(ctx: Ctx2D, w: number, d: number, fill: string, o: { doors?: number; front?: number; arcs?: boolean; r?: number } = {}): void {
  D.rr(ctx, 0, 0, w, d, o.r ?? 0.006, tint(fill, 0.4));
  const fz = d / 2 - (o.front ?? 0.025);
  D.line(ctx, -w / 2, fz, w / 2, fz, INK_SOFT, LINE_THIN);
  const n = o.doors ?? 0;
  for (let i = 1; i < n; i++) D.line(ctx, -w / 2 + (w * i) / n, fz, -w / 2 + (w * i) / n, d / 2, INK_SOFT, LINE_THIN);
}

/** Books seen from above along a shelf front edge. */
export function planBooks(ctx: Ctx2D, x0: number, x1: number, z: number, depth: number, seed: number): void {
  const r = rng(seed);
  let x = x0;
  while (x < x1) {
    const t = 0.02 + r() * 0.03;
    if (x + t > x1) break;
    D.box(ctx, x, z - depth, x + t, z, 0, lighten(['#7a8fa3', '#c7775a', '#d6a544', '#9bae8a', '#b9a79a'][Math.floor(r() * 5)], 0.35), INK_SOFT, 0.004);
    x += t + 0.002;
  }
}
