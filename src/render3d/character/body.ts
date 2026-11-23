import type { Accessory, BottomStyle, HairStyle, TopStyle } from '../characterTypes';
import { B, Builder, type RGB, type Slot, type W, WHITE, curve, lerp, rgb, smooth, superR, w1, wmix } from './builder';
import type { Spec } from './spec';

export interface Styles {
  hairStyle: HairStyle;
  topStyle: TopStyle;
  bottomStyle: BottomStyle;
  accessory: Accessory;
}

const N_TORSO = 28;
const N_LEG = 14;
const N_ARM = 12;

const SOCK: RGB = rgb('#f2f1ec');
const SOLE: RGB = rgb('#eeece4');
const SOLE_DARK: RGB = rgb('#8d8a84');
const LACE: RGB = rgb('#fbfbf8');
const RIB: RGB = [0.8, 0.8, 0.8];
const SHADE: RGB = [0.86, 0.86, 0.86];

/** Everything the head / hair builders need to know about the torso. */
export interface TorsoInfo {
  /** radius of the garment surface in direction `th` (from +Z towards +X) at height y */
  shirtR(th: number, y: number): number;
  torsoW(x: number, y: number, z: number): W;
  /** top of the collar (where the bare neck starts), front and back */
  collarY: number;
  /** how wide the neckline is: 0 crew … 1 wide */
  neckOpen: number;
}

export function buildBody(b: Builder, s: Spec, st: Styles): TorsoInfo {
  const k = s.H / 1.78;
  const prof = curve(s.torso);
  const top = st.topStyle;
  const dress = top === 'dress';
  const bottom: BottomStyle = dress ? 'skirt' : st.bottomStyle;
  const hoodie = top === 'hoodie';

  // ---- skin weights of the trunk -------------------------------------------------------------
  const spineW = (y: number): W => {
    const a = smooth(s.spineY - 0.07 * k, s.spineY + 0.05 * k, y);
    const c = smooth(s.chestY - 0.08 * k, s.chestY + 0.05 * k, y);
    return [B.hips, 1 - a, B.spine, a * (1 - c), B.chest, a * c];
  };
  const torsoW = (x: number, y: number, z: number): W => {
    const w = spineW(y);
    // the shoulder girdle follows the collar bone a little so a raised arm lifts the shoulder
    const d = Math.hypot(Math.abs(x) - s.shoulderX, y - s.shoulderY, z);
    const c = (1 - smooth(s.r.delt * 0.6, s.r.delt * 2.6, d)) * 0.75;
    if (c <= 0.001) return w;
    return [...w.map((v, i) => (i % 2 ? v * (1 - c) : v)), x > 0 ? B.clavL : B.clavR, c];
  };

  // ---- garment thickness over the trunk --------------------------------------------------------
  const waistY = s.torso[4][0];
  const loose = hoodie ? 0.03 : dress ? 0.004 : s.female && !s.child ? 0.02 : 0.013;
  const base = hoodie ? 0.016 : 0.006;
  const hemFlare = bottom === 'pants' ? 0.008 : 0.013;
  const shirtOff = (y: number) =>
    base * k + loose * k * Math.exp(-Math.pow((y - waistY) / (0.11 * k), 2)) + hemFlare * k * smooth(waistY, s.hipY, y);
  const shirtR = (th: number, y: number) => {
    const [rx, rf, rb, n] = prof(y);
    const o = shirtOff(y);
    return superR(th, rx + o, rf + o, rb + o, n);
  };

  // ---- pelvis (trousers seat / underwear) -------------------------------------------------------
  {
    const slot: Slot = dress ? 'top' : 'bottom';
    const o = (bottom === 'pants' ? 0.005 : 0.007) * k;
    const y0 = s.torso[0][0];
    const yTop = waistY + 0.035 * k;
    const ys = [yTop, lerp(yTop, s.hipY, 0.5), s.hipY + 0.015 * k, lerp(s.hipY, y0, 0.45), lerp(s.hipY, y0, 0.8), y0];
    const rows = ys.map((y) => {
      const [rx, rf, rb, n] = prof(y);
      // stay inside the shirt above the hem
      const oo = y > s.hipY + 0.03 * k ? Math.min(o, shirtOff(y) - 0.004 * k) : o;
      return b.ring(N_TORSO, { c: [0, y, 0], rx: rx + oo, rf: rf + oo, rb: rb + oo, n, w: (_t, _x, yy) => spineW(yy) });
    });
    b.loft(slot, rows);
    b.cap(slot, rows[rows.length - 1], [0, y0 - 0.012 * k, -0.005 * k], w1(B.hips), true);
  }

  // ---- shirt / hoodie / dress bodice -------------------------------------------------------------
  const neckOpen = dress ? 0.5 : hoodie ? 0.32 : 0.1;
  const nk = s.torso.length;
  const kA = s.torso[nk - 1];
  const kB = s.torso[nk - 2];
  const collar = {
    y: lerp(kA[0], kB[0], neckOpen),
    rx: lerp(kA[1], kB[1], neckOpen) + 0.012 * k,
    rf: lerp(kA[2], kB[2], neckOpen) + 0.012 * k,
    rb: lerp(kA[3], kB[3], neckOpen) + 0.012 * k,
  };
  const drop = (dress ? 0.05 : hoodie ? 0.045 : 0.022) * k;
  {
    const hemY = dress ? waistY - 0.02 * k : hoodie ? s.hipY - 0.03 * k : s.hipY - 0.012 * k;
    const ys: number[] = [];
    const yS = s.shoulderY - 0.035 * k;
    const steps = 8;
    for (let i = 0; i <= steps; i++) ys.push(lerp(hemY, yS, i / steps));
    ys.push(s.torso[nk - 3][0]);
    if (neckOpen < 0.75) ys.push(lerp(s.torso[nk - 3][0], collar.y, 0.55));
    const rows: number[][] = [];
    // hem (inner lip first so the edge has thickness)
    {
      const [rx, rf, rb, n] = prof(hemY);
      const o = shirtOff(hemY) - 0.006 * k;
      rows.push(b.ring(N_TORSO, { c: [0, hemY + 0.003 * k, 0], rx: rx + o, rf: rf + o, rb: rb + o, n, w: spineW(hemY), col: SHADE }));
    }
    ys.forEach((y, i) => {
      const [rx, rf, rb, n] = prof(y);
      let o = shirtOff(y);
      // ribbed hem band of the hoodie pulls the fabric in a little
      if (hoodie && i === 0) o -= 0.006 * k;
      if (hoodie && i === 1) o += 0.004 * k;
      rows.push(
        b.ring(N_TORSO, {
          c: [0, y, 0],
          rx: rx + o,
          rf: rf + o,
          rb: rb + o,
          n,
          // the hem follows the thighs a little, so a lifted leg pushes the fabric instead of poking through it
          w: (_t, x, yy, z) => {
            const legW = dress ? 0 : smooth(s.hipY + 0.07 * k, s.hipY - 0.03 * k, yy) * 0.4 * smooth(-0.02 * k, 0.03 * k, z);
            if (legW <= 0.001) return torsoW(x, yy, z);
            const sl = smooth(-0.035 * k, 0.035 * k, x);
            return [B.hips, 1 - legW, B.thighL, legW * sl, B.thighR, legW * (1 - sl)];
          },
          col: hoodie && i === 0 ? RIB : WHITE,
          v: y * 6,
          uScale: 5,
        }),
      );
    });
    // neckline: lower at the front
    const neckRing = (dy: number, shrink: number, col: RGB) =>
      b.ring(N_TORSO, {
        c: [0, collar.y + dy, 0],
        rx: collar.rx * shrink,
        rf: collar.rf * shrink,
        rb: collar.rb * shrink,
        n: 2,
        w: w1(B.chest),
        col,
        warp: (p, th) => {
          const f = (Math.cos(th) + 1) / 2;
          p[1] -= drop * f * f;
          p[2] += drop * 0.35 * f * f;
        },
      });
    rows.push(neckRing(0, 1, hoodie ? WHITE : RIB));
    rows.push(neckRing(0.004 * k, 0.94, hoodie ? WHITE : RIB));
    rows.push(neckRing(-0.006 * k, 0.86, SHADE));
    b.loft('top', rows, true);
  }

  // ---- limbs ---------------------------------------------------------------------------------------
  for (const side of [1, -1]) {
    b.mirror = side < 0;
    const L = side > 0;
    buildArm(b, s, top, L);
    buildHand(b, s, L);
    buildLeg(b, s, bottom, dress, L);
    buildShoe(b, s, L);
  }
  b.mirror = false;

  // ---- skirt ---------------------------------------------------------------------------------------
  if (bottom === 'skirt') {
    const slot: Slot = dress ? 'top' : 'bottom';
    const shirtHem = top === 'hoodie' ? s.hipY - 0.03 * k : s.hipY - 0.012 * k;
    const yW = dress ? waistY + 0.012 * k : shirtHem + 0.03 * k;
    const yH = s.kneeY + (dress ? 0.03 : 0.07) * k;
    const flare = dress ? 1.42 : 1.32;
    const keys = curve([
      [0, 0, 0],
      [(yW - s.hipY) / (yW - yH), 1, 0.25],
      [1, flare, 1],
    ]);
    const rows: number[][] = [];
    const steps = 7;
    const mk = (y: number, shrink: number, col: RGB) => {
      const t = (yW - y) / (yW - yH);
      const [f, pleat] = keys(t);
      const [wx, wf, wb, n] = prof(Math.max(y, s.hipY));
      const o = (dress ? shirtOff(yW) + 0.004 * k : 0.004 * k) + 0.014 * k * smooth(0.06, 0.4, t);
      const g = Math.max(1, f);
      const rx = wx * (y >= s.hipY ? 1 : g) + o;
      const rf = wf * (y >= s.hipY ? 1 : g * 1.12) + o;
      const rb = wb * (y >= s.hipY ? 1 : g * 1.06) + o;
      const legW = smooth(s.hipY + 0.03 * k, s.hipY - 0.2 * k, y) * 0.9;
      return b.ring(N_TORSO, {
        c: [0, y, 0],
        rx: rx * shrink,
        rf: rf * shrink,
        rb: rb * shrink,
        n: lerp(n, 2, t),
        col,
        v: y * 6,
        uScale: 5,
        warp: (p, th) => {
          const m = 1 + 0.03 * pleat * Math.cos(th * 12);
          p[0] *= m;
          p[2] *= m;
        },
        w: (_th, x) => {
          const sl = smooth(-0.035 * k, 0.035 * k, x);
          return [B.hips, 1 - legW, B.thighL, legW * sl, B.thighR, legW * (1 - sl)];
        },
      });
    };
    for (let i = 0; i <= steps; i++) rows.push(mk(lerp(yW, yH, Math.pow(i / steps, 0.85)), 1, i === 0 && !dress ? RIB : WHITE));
    rows.push(mk(yH + 0.004 * k, 0.975, SHADE));
    b.loft(slot, rows);
  }

  if (hoodie) buildHoodieExtras(b, s, shirtR, waistY, collar.y);
  if (st.accessory === 'backpack') buildBackpack(b, s, shirtR);

  return { shirtR, torsoW, collarY: collar.y, neckOpen };
}

// =====================================================================================================
// arm
// =====================================================================================================

function buildArm(b: Builder, s: Spec, top: TopStyle, L: boolean): void {
  const k = s.H / 1.78;
  const A = L ? B.armL : B.armR;
  const E = L ? B.elbowL : B.elbowR;
  const F = L ? B.foreL : B.foreR;
  const Hn = L ? B.handL : B.handR;
  const sx = s.shoulderX;
  const sy = s.shoulderY;
  const len = s.upperArm + s.foreArm;
  const hoodie = top === 'hoodie';
  const off = (hoodie ? 0.013 : 0.006) * k;
  const sleeveEnd = top === 'tshirt' ? s.upperArm * 0.52 : top === 'dress' ? s.upperArm * 0.3 : len - 0.012 * k;
  const up = curve([
    [0, s.r.delt],
    [0.3, s.r.bicep * 1.05],
    [0.62, s.r.bicep],
    [1, s.r.elbow],
  ]);
  const fo = curve([
    [0, s.r.elbow],
    [0.24, s.r.fore],
    [0.6, s.r.fore * 0.88],
    [1, s.r.wrist],
  ]);
  /** arm radius at distance d below the shoulder joint: [rx (sideways), rz] */
  const rad = (d: number): [number, number] => {
    if (d <= s.upperArm) {
      const r = up(Math.max(0, d) / s.upperArm)[0];
      return [r, r];
    }
    const t = (d - s.upperArm) / s.foreArm;
    const r = fo(t)[0];
    const flat = smooth(0.5, 1, t);
    return [r * lerp(1, 0.84, flat), r * lerp(1, 1.14, flat)];
  };
  const h = s.r.elbow * 1.0;
  const weight = (d: number): W => {
    const e = d - s.upperArm;
    if (e < -h) return w1(A);
    if (e < 0) return wmix(A, E, smooth(-h, 0, e));
    if (e < h) return wmix(E, F, smooth(0, h, e));
    return wmix(F, Hn, smooth(len - 0.035 * k, len + 0.01 * k, d) * 0.6);
  };
  const ringAt = (d: number, o: number, col: RGB = WHITE, capR?: number) => {
    const [rx, rz] = rad(d);
    const m = capR ?? 1;
    return b.ring(N_ARM, { c: [sx, sy - d, 0], rx: (rx + o) * m, rf: (rz + o) * m, w: weight(d), col, v: d * 6, uScale: 2 });
  };
  const VF = 0.8; // the shoulder cap is flatter than a ball so it does not rise above the shoulder line
  const cap = (o: number) => {
    const R = s.r.delt + o;
    return [0.95, 0.8, 0.56, 0.27].map((f) =>
      b.ring(N_ARM, { c: [sx - R * 0.55 * f, sy + f * R * VF, 0], rx: R * Math.sqrt(1 - f * f) * 1.01, w: w1(A) }),
    );
  };
  const upperDs = [0, 0.2, 0.4, 0.6, 0.78].map((t) => t * s.upperArm);
  const elbowDs = [-h, -h * 0.5, 0, h * 0.5, h].map((e) => s.upperArm + e);
  const foreDs = [0.24, 0.42, 0.6, 0.78, 0.92, 1].map((t) => s.upperArm + t * s.foreArm);
  const all = [...upperDs, ...elbowDs, ...foreDs].sort((a, b2) => a - b2);

  // sleeve
  {
    const long = sleeveEnd > s.upperArm;
    const ds = all.filter((d) => d < sleeveEnd - (long ? 0.036 : 0.012) * k);
    const rows = [...cap(off), ...ds.map((d) => ringAt(d, off))];
    if (long) {
      // cuff
      const cuffO = hoodie ? 0.004 * k : off;
      rows.push(ringAt(sleeveEnd - 0.03 * k, hoodie ? off : cuffO));
      rows.push(ringAt(sleeveEnd - 0.026 * k, cuffO, RIB));
      rows.push(ringAt(sleeveEnd, cuffO, RIB));
      rows.push(ringAt(sleeveEnd - 0.003 * k, -0.001 * k, SHADE));
    } else {
      rows.push(ringAt(sleeveEnd, off + 0.004 * k));
      rows.push(ringAt(sleeveEnd - 0.004 * k, 0, SHADE));
    }
    b.loft('top', rows);
    b.cap('top', rows[0], [sx - (s.r.delt + off) * 0.56, sy + (s.r.delt + off) * VF, 0], w1(A));
  }
  // bare arm below the sleeve
  {
    const start = Math.max(0, sleeveEnd - 0.03 * k);
    const ds = [start, ...all.filter((d) => d > start + 0.008 * k)];
    b.loft(
      'skin',
      ds.map((d) => ringAt(d, 0)),
    );
  }
}

// =====================================================================================================
// hand
// =====================================================================================================

function buildHand(b: Builder, s: Spec, L: boolean): void {
  const Hn = L ? B.handL : B.handR;
  const Fg = L ? B.fingL : B.fingR;
  const u = s.hand / 0.186;
  const wx = s.shoulderX;
  const wy = s.shoulderY - s.upperArm - s.foreArm;
  const knuckleTint: RGB = [1, 0.93, 0.91];
  // palm: thickness along x (the palm faces the body, i.e. -x on the left hand), width along z
  const palm = [
    // [dy, half thickness, half width, z shift]
    [0.004, 0.0125, 0.027, 0],
    [-0.018, 0.0135, 0.032, 0.002],
    [-0.045, 0.0145, 0.04, 0.004],
    [-0.075, 0.0135, 0.043, 0.003],
    [-0.097, 0.0115, 0.041, 0.001],
  ];
  const rows = palm.map((r, i) =>
    b.ring(10, {
      c: [wx, wy + r[0] * u, r[3] * u],
      rx: r[1] * u,
      rf: r[2] * u,
      n: 2.6,
      w: w1(Hn),
      col: i >= 3 ? knuckleTint : WHITE,
    }),
  );
  b.loft('skin', rows);
  b.cap('skin', rows[rows.length - 1], [wx, wy - 0.101 * u, 0.001 * u], w1(Hn), true);

  // fingers: relaxed curl towards the palm (-x)
  const fingers = [
    // [z, length, radius, curl]
    [0.031, 0.07, 0.0088, 1.0],
    [0.0105, 0.079, 0.0092, 1.05],
    [-0.0105, 0.073, 0.0088, 1.15],
    [-0.03, 0.057, 0.0078, 1.3],
  ];
  for (const f of fingers) {
    const segs = [0.0, 0.42, 0.72, 1.0];
    const angles = [0.08, 0.3, 0.62, 0.85].map((a) => a * f[3]);
    let x = wx - 0.001 * u;
    let y = wy - 0.092 * u;
    const frows: number[][] = [];
    for (let i = 0; i < segs.length; i++) {
      const a = angles[i];
      if (i > 0) {
        const dl = (segs[i] - segs[i - 1]) * f[1] * u;
        const am = (angles[i - 1] + a) / 2;
        x -= Math.sin(am) * dl;
        y -= Math.cos(am) * dl;
      }
      const r = f[2] * u * (1 - 0.22 * segs[i]);
      // ring plane perpendicular to the finger direction (dir = (-sin a, -cos a, 0))
      frows.push(
        b.ring(6, {
          c: [x, y, f[0] * u],
          rx: r * 0.92,
          rf: r,
          w: i === 0 ? wmix(Hn, Fg, 0.5) : w1(Fg),
          ax: { x: Math.cos(a), y: -Math.sin(a), z: 0 },
          az: { x: 0, y: 0, z: 1 },
        }),
      );
    }
    b.loft('skin', frows);
    const a = angles[3];
    const tipL = f[2] * u * 0.7;
    b.cap('skin', frows[3], [x - Math.sin(a) * tipL, y - Math.cos(a) * tipL, f[0] * u], w1(Fg), true);
  }
  // thumb: from the base of the palm, forward and down
  {
    const dir = [-0.3, -0.72, 0.62];
    const dl = Math.hypot(dir[0], dir[1], dir[2]);
    const d = dir.map((v) => v / dl);
    // frame perpendicular to d
    const ax = { x: 0.93, y: -0.38, z: 0.0 };
    const axl = Math.hypot(ax.x, ax.y, ax.z);
    const az = { x: d[1] * ax.z - d[2] * ax.y, y: d[2] * ax.x - d[0] * ax.z, z: d[0] * ax.y - d[1] * ax.x };
    const azl = Math.hypot(az.x, az.y, az.z);
    const trows: number[][] = [];
    const base = [wx - 0.002 * u, wy - 0.03 * u, 0.026 * u];
    const tl = 0.062 * u;
    [0, 0.4, 0.75, 1].forEach((t, i) => {
      const r = [0.0135, 0.0115, 0.0098, 0.0082][i] * u;
      trows.push(
        b.ring(6, {
          c: [base[0] + d[0] * tl * t, base[1] + d[1] * tl * t, base[2] + d[2] * tl * t],
          rx: r,
          w: w1(Hn),
          ax: { x: ax.x / axl, y: ax.y / axl, z: ax.z / axl },
          az: { x: az.x / azl, y: az.y / azl, z: az.z / azl },
        }),
      );
    });
    b.loft('skin', trows);
    b.cap('skin', trows[3], [base[0] + d[0] * (tl + 0.006 * u), base[1] + d[1] * (tl + 0.006 * u), base[2] + d[2] * (tl + 0.006 * u)], w1(Hn), true);
  }
}

// =====================================================================================================
// leg
// =====================================================================================================

function buildLeg(b: Builder, s: Spec, bottom: BottomStyle, dress: boolean, L: boolean): void {
  const k = s.H / 1.78;
  const T = L ? B.thighL : B.thighR;
  const K = L ? B.kneeL : B.kneeR;
  const S = L ? B.shinL : B.shinR;
  const F = L ? B.footL : B.footR;
  const hx = s.hipX;
  const thigh = s.hipY - s.kneeY;
  const shin = s.kneeY - s.ankleY;
  const len = thigh + shin;
  const th = curve([
    [0, s.r.thighTop],
    [0.3, lerp(s.r.thighTop, s.r.thighMid, 0.45)],
    [0.62, s.r.thighMid * 0.97],
    [1, s.r.knee * 1.03],
  ]);
  const sh = curve([
    [0, s.r.knee * 1.03, 1.06, 0.96],
    [0.14, s.r.knee * 0.96, 0.98, 1.04],
    [0.3, s.r.calf, 0.9, 1.2],
    [0.6, lerp(s.r.calf, s.r.ankle, 0.6), 0.95, 1.1],
    [0.9, s.r.ankle, 0.96, 1.08],
    [1, s.r.ankle * 1.02, 1, 1.05],
  ]);
  /** [rx, rf, rb] at distance d below the hip joint */
  const rad = (d: number): [number, number, number] => {
    if (d <= thigh) {
      const t = Math.max(0, d) / thigh;
      const r = th(t)[0];
      const q = Math.sin(Math.PI * Math.min(1, t * 1.2)) * 0.06;
      return [r, r * (1 + q + 0.06 * smooth(0.8, 1, t)), r * (1 + q * 0.5 - 0.04 * smooth(0.8, 1, t))];
    }
    const [r, f, bk] = sh(Math.min(1.1, (d - thigh) / shin));
    return [r, r * f, r * bk];
  };
  const h = s.r.knee * 1.15;
  const weight = (d: number): W => {
    const e = d - thigh;
    if (e < -h) return w1(T);
    if (e < 0) return wmix(T, K, smooth(-h, 0, e));
    if (e < h) return wmix(K, S, smooth(0, h, e));
    return wmix(S, F, smooth(len - 0.05 * k, len + 0.01 * k, d));
  };
  const pants = bottom === 'pants';
  const shorts = bottom === 'shorts';
  const garmentO = (d: number) => {
    if (pants) return (0.006 + 0.016 * smooth(thigh * 0.75, len, d)) * k;
    return (0.005 + 0.014 * smooth(thigh * 0.08, thigh * 0.6, d)) * k;
  };
  const ringAt = (d: number, o: number, col: RGB = WHITE, even = 0) => {
    const [rx, rf, rb] = rad(d);
    // trousers hang straighter than the calf underneath
    const m = (rf + rb) / 2;
    return b.ring(N_LEG, {
      c: [hx, s.hipY - d, even * (rb - rf) * -0.25],
      rx: rx + o,
      rf: lerp(rf, m, even) + o,
      rb: lerp(rb, m, even) + o,
      w: weight(d),
      col,
      v: d * 6,
      uScale: 3,
    });
  };
  const capRows = (o: number, slot: Slot) => {
    const R = s.r.thighTop + o;
    const rows = [0.86, 0.56, 0.26].map((f) =>
      b.ring(N_LEG, { c: [hx, s.hipY + f * R, 0], rx: R * Math.sqrt(1 - f * f) * 1.02, w: w1(T) }),
    );
    b.cap(slot, rows[0], [hx, s.hipY + R, 0], w1(T));
    return rows;
  };
  const thighDs = [0, 0.16, 0.32, 0.48, 0.64, 0.78].map((t) => t * thigh);
  const kneeDs = [-h, -h * 0.5, 0, h * 0.5, h].map((e) => thigh + e);
  const shinDs = [0.2, 0.3, 0.42, 0.56, 0.7, 0.84].map((t) => thigh + t * shin);
  const sockTop = len - 0.085 * k;
  const all = [...thighDs, ...kneeDs, ...shinDs].sort((a, c) => a - c);
  const hem = pants ? len - 0.04 * k : shorts ? thigh * (s.child ? 0.6 : 0.66) : -1;

  if (hem > 0) {
    const ds = all.filter((d) => d < hem - 0.015 * k);
    const even = (d: number) => (pants ? smooth(thigh, thigh + shin * 0.4, d) * 0.7 : 0);
    const rows = [...capRows(garmentO(0), 'bottom'), ...ds.map((d) => ringAt(d, garmentO(d), WHITE, even(d)))];
    rows.push(ringAt(hem, garmentO(hem) + (shorts ? 0.004 * k : 0), WHITE, even(hem)));
    rows.push(ringAt(hem - 0.004 * k, 0.001 * k, SHADE, even(hem)));
    b.loft('bottom', rows);
  }
  // bare leg
  const skinStart = hem > 0 ? hem - 0.035 * k : -1;
  if (!pants) {
    const ds = all.filter((d) => d > skinStart + 0.01 * k && d < sockTop - 0.01 * k);
    const rows: number[][] = [];
    if (hem < 0) rows.push(...capRows(0, 'skin'));
    else rows.push(ringAt(skinStart, 0));
    for (const d of ds) rows.push(ringAt(d, 0, d > thigh - h && d < thigh + h * 0.5 ? ([1, 0.95, 0.93] as RGB) : WHITE));
    rows.push(ringAt(sockTop + 0.01 * k, 0));
    b.loft('skin', rows);
  }
  // sock
  {
    const o = 0.0035 * k;
    const rows = [ringAt(sockTop + 0.002 * k, -0.001 * k, SOCK), ringAt(sockTop, o, SOCK), ringAt(sockTop + 0.012 * k, o, SOCK)];
    for (const d of [len - 0.04 * k, len - 0.012 * k, len + 0.02 * k]) rows.push(ringAt(d, o, SOCK));
    b.loft('detail', rows);
  }
}

// =====================================================================================================
// shoe
// =====================================================================================================

function buildShoe(b: Builder, s: Spec, L: boolean): void {
  const F = L ? B.footL : B.footR;
  const Tb = L ? B.toeL : B.toeR;
  const k = s.H / 1.78;
  const x0 = s.hipX;
  const len = s.footLen;
  const W2 = s.footW / 2;
  const z0 = -len * 0.27;
  const ys = s.sole;
  const outline = curve([
    // t, half width (× W2), upper height above the sole (× ankle clearance)
    [0, 0.0, 0.4],
    [0.025, 0.5, 0.78],
    [0.08, 0.78, 0.96],
    [0.2, 0.86, 1.0],
    [0.32, 0.85, 1.02],
    [0.45, 0.86, 0.97],
    [0.56, 0.94, 0.8],
    [0.68, 1.0, 0.62],
    [0.8, 0.97, 0.5],
    [0.9, 0.83, 0.42],
    [0.965, 0.56, 0.3],
    [1, 0.0, 0.12],
  ]);
  const hMax = s.ankleY - ys - 0.012 * k;
  const ts = [0, 0.025, 0.08, 0.2, 0.32, 0.45, 0.56, 0.68, 0.8, 0.9, 0.965, 1];
  const toeW = (t: number): W => wmix(F, Tb, smooth(0.6, 0.78, t));
  const spring = (t: number) => 0.012 * k * Math.pow(Math.max(0, (t - 0.72) / 0.28), 2);
  // the big toe side (inner) is straighter: shift the centre line inwards near the toe
  const cx = (t: number) => x0 - 0.1 * W2 * smooth(0.5, 1, t);
  const M = 8;
  const upperRows: number[][] = [];
  const soleRows: number[][] = [];
  for (const t of ts) {
    const [wf, hf] = outline(t);
    const w = Math.max(0.0015, wf * W2);
    const hh = Math.max(0.004, hf * hMax);
    const z = z0 + t * len;
    const yb = spring(t);
    // upper: half super-ellipse dome
    const row: number[] = [];
    for (let j = 0; j <= M; j++) {
      const a = (j / M) * Math.PI;
      const cxn = Math.cos(a);
      const sn = Math.sin(a);
      const e = 2 / 2.6;
      const px = cx(t) + w * 0.97 * Math.sign(cxn) * Math.pow(Math.abs(cxn), e);
      const py = ys + yb + hh * Math.pow(sn, e) - (j === 0 || j === M ? 0.004 * k : 0);
      const toeCap = smooth(0.82, 0.86, t);
      const c: RGB = [lerp(1, 0.9, toeCap), lerp(1, 0.9, toeCap), lerp(1, 0.9, toeCap)];
      row.push(b.v(px, py, z, toeW(t), c));
    }
    upperRows.push(row);
    // sole: bottom-left … up the left wall … (top is hidden under the upper) … right wall
    const sw = w * 1.04 + 0.0025 * k;
    const sx = (f: number) => cx(t) + sw * f;
    const dark = t < 0.3 || t > 0.62 ? SOLE_DARK : SOLE;
    soleRows.push([
      b.v(sx(0.86), yb + 0.0005, z, toeW(t), dark),
      b.v(sx(1.0), yb + 0.007 * k, z, toeW(t), SOLE),
      b.v(sx(1.0), yb + ys, z, toeW(t), SOLE),
      b.v(sx(0.9), yb + ys + 0.003 * k, z, toeW(t), SOLE),
      b.v(sx(-0.9), yb + ys + 0.003 * k, z, toeW(t), SOLE),
      b.v(sx(-1.0), yb + ys, z, toeW(t), SOLE),
      b.v(sx(-1.0), yb + 0.007 * k, z, toeW(t), SOLE),
      b.v(sx(-0.86), yb + 0.0005, z, toeW(t), dark),
      b.v(sx(0.86), yb + 0.0005, z, toeW(t), dark),
    ]);
  }
  for (let i = 0; i < ts.length - 1; i++) {
    b.band('shoes', upperRows[i], upperRows[i + 1], true);
    b.band('detail', soleRows[i], soleRows[i + 1], true);
  }
  // collar around the ankle
  {
    const zc = z0 + 0.27 * len;
    const yc = s.ankleY - 0.004 * k;
    const R = s.r.ankle + 0.013 * k;
    const rows = [
      [yc - 0.02 * k, R * 1.12, 1],
      [yc + 0.002 * k, R * 1.1, 1],
      [yc + 0.009 * k, R * 0.98, 0.92],
      [yc + 0.004 * k, R * 0.8, 0.8],
    ].map((r) =>
      b.ring(10, {
        c: [x0, r[0], zc - 0.004 * k],
        rx: r[1],
        rf: r[1] * 1.12,
        rb: r[1] * 1.08,
        w: w1(F),
        col: [r[2], r[2], r[2]],
        warp: (p, th) => {
          // lower at the front (tongue side) and higher at the heel tab
          p[1] += 0.008 * k * -Math.cos(th);
        },
      }),
    );
    b.loft('shoes', rows, true);
  }
  // laces
  for (let i = 0; i < 3; i++) {
    const t = 0.5 + i * 0.07;
    const [wf, hf] = outline(t);
    const z = z0 + t * len;
    const y = ys + hf * hMax + 0.0025 * k;
    const w = wf * W2 * 0.42;
    const dz = 0.008 * k;
    const slope = (outline(t + 0.03)[1] - outline(t - 0.03)[1]) * hMax * (dz / (0.06 * len));
    const a = b.v(cx(t) - w, y - 0.004 * k - slope, z - dz, w1(F), LACE);
    const c = b.v(cx(t) + w, y - 0.004 * k - slope, z - dz, w1(F), LACE);
    const d = b.v(cx(t) + w, y - 0.004 * k + slope, z + dz, w1(F), LACE);
    const e = b.v(cx(t) - w, y - 0.004 * k + slope, z + dz, w1(F), LACE);
    const m1 = b.v(cx(t), y - slope, z - dz, w1(F), LACE);
    const m2 = b.v(cx(t), y + slope, z + dz, w1(F), LACE);
    b.tri('detail', a, m2, m1);
    b.tri('detail', a, e, m2);
    b.tri('detail', m1, m2, d);
    b.tri('detail', m1, d, c);
  }
}

// =====================================================================================================
// hoodie: hood resting on the back, pocket, drawstrings
// =====================================================================================================

function buildHoodieExtras(b: Builder, s: Spec, shirtR: (th: number, y: number) => number, waistY: number, collarY: number): void {
  const k = s.H / 1.78;
  const chest = w1(B.chest);
  // hood: a thick roll around the back of the neck that droops into a bag between the shoulder blades
  {
    const NS = 12;
    const rows: number[][] = [];
    const R0 = s.r.neck + 0.05 * k;
    for (let i = 0; i <= NS; i++) {
      const u = i / NS;
      const phi = lerp(-2.15, 2.15, u); // around the neck, 0 = straight back
      const back = Math.cos(phi / 2.15 * (Math.PI / 2)); // 1 at the back, 0 at the front ends
      const tube = lerp(0.012, 0.036, Math.pow(back, 0.7)) * k;
      const cxp = Math.sin(phi) * (R0 + 0.01 * k * back);
      const czp = -Math.cos(phi) * (R0 + 0.022 * k * back) - 0.004 * k;
      const cy = collarY + 0.004 * k - 0.03 * k * (1 - back) - 0.012 * k * back;
      const row: number[] = [];
      const M = 7;
      for (let j = 0; j <= M; j++) {
        const a = (j / M) * Math.PI * 2;
        // radial direction (outwards from the neck) and up
        const rx = Math.sin(phi);
        const rz = -Math.cos(phi);
        // the bag: the lower outer part of the roll sags down the back
        const sag = back * back * Math.max(0, -Math.sin(a)) * 0.07 * k * (0.5 + 0.5 * Math.cos(a));
        const rr = tube * (1 + 0.5 * back * Math.max(0, Math.cos(a)));
        const px = cxp + rx * Math.cos(a) * rr;
        const pz = czp + rz * Math.cos(a) * rr - sag * 0.35;
        const py = cy + Math.sin(a) * tube - sag;
        row.push(b.v(px, py, pz, wmix(B.chest, B.neck, 0.15), j > M / 2 ? SHADE : WHITE));
      }
      rows.push(row);
    }
    b.loft('top', rows, true);
    for (const end of [0, NS]) {
      const r = rows[end];
      const c = r.slice(0, -1).reduce((acc, i) => {
        const p = b.p(i);
        return [acc[0] + p[0] / (r.length - 1), acc[1] + p[1] / (r.length - 1), acc[2] + p[2] / (r.length - 1)];
      }, [0, 0, 0]);
      b.cap('top', r, c as [number, number, number], chest, end !== 0);
    }
  }
  // kangaroo pocket
  {
    const yB = s.hipY + 0.035 * k;
    const yT = waistY + 0.07 * k;
    const cols = 8;
    const rowsN = 3;
    const grid: number[][] = [];
    for (let i = 0; i <= rowsN; i++) {
      const v = i / rowsN;
      const y = lerp(yT, yB, v);
      const half = lerp(0.62, 1.0, Math.min(1, v * 1.6)) * 0.78;
      const row: number[] = [];
      for (let j = 0; j <= cols; j++) {
        const u = j / cols;
        const th = lerp(-half, half, u);
        const edge = i === 0 || i === rowsN || j === 0 || j === cols;
        const r = shirtR(th, y) + (edge ? 0.003 : 0.008) * k;
        row.push(b.v(Math.sin(th) * r, y, Math.cos(th) * r, wmix(B.hips, B.spine, smooth(s.spineY - 0.07 * k, s.spineY + 0.05 * k, y)), edge ? ([0.93, 0.93, 0.93] as RGB) : WHITE));
      }
      grid.push(row);
    }
    for (let i = 0; i < rowsN; i++) b.band('top', grid[i], grid[i + 1], true);
  }
  // drawstrings
  for (const sx of [-1, 1]) {
    const th = sx * 0.2;
    const yT = collarY - 0.05 * k;
    const yB = yT - 0.085 * k;
    const w = 0.0035 * k;
    const pt = (y: number, dx: number, lift: number) => {
      const r = shirtR(th, y) + lift;
      return b.v(Math.sin(th) * r + dx, y, Math.cos(th) * r, chest, LACE);
    };
    const a = pt(yT, -w, 0.002 * k);
    const c = pt(yT, w, 0.002 * k);
    const d = pt(yB, w, 0.004 * k);
    const e = pt(yB, -w, 0.004 * k);
    b.tri('detail', a, e, d);
    b.tri('detail', a, d, c);
  }
}

// =====================================================================================================
// backpack
// =====================================================================================================

function buildBackpack(b: Builder, s: Spec, shirtR: (th: number, y: number) => number): void {
  const k = s.H / 1.78;
  const kk = s.child ? k * 1.12 : k;
  const chest = w1(B.chest);
  const yTop = s.shoulderY - 0.005 * k;
  const hgt = 0.36 * kk;
  const halfW = 0.135 * kk;
  const depth = 0.12 * kk;
  const backZ = -shirtR(Math.PI, s.chestY) + 0.006 * k;
  const zc = backZ - depth / 2;
  const shape = curve([
    // v (0 top .. 1 bottom), width factor, depth factor
    [0, 0.25, 0.3],
    [0.05, 0.72, 0.68],
    [0.16, 0.94, 0.9],
    [0.5, 1, 1],
    [0.88, 1, 1.02],
    [0.97, 0.9, 0.9],
    [1, 0.6, 0.55],
  ]);
  const rows: number[][] = [];
  const vs = [0, 0.05, 0.16, 0.5, 0.88, 0.97, 1];
  for (const v of vs) {
    const [fw, fd] = shape(v);
    rows.push(b.ring(16, { c: [0, yTop - v * hgt, zc], rx: halfW * fw, rf: (depth / 2) * fd, n: 3.2, w: chest }));
  }
  b.loft('accent', rows);
  b.cap('accent', rows[0], [0, yTop + 0.006 * k, zc], chest);
  b.cap('accent', rows[rows.length - 1], [0, yTop - hgt - 0.004 * k, zc], chest, true);
  // front pocket
  {
    const prow: number[][] = [];
    const pz = backZ - depth;
    const ph = hgt * 0.4;
    const py = yTop - hgt * 0.5;
    const pw = halfW * 0.74;
    const NS = 6;
    for (let i = 0; i <= 2; i++) {
      const row: number[] = [];
      const inset = [0, 0.012 * kk, 0.014 * kk][i];
      const outz = [0.004 * kk, -0.024 * kk, -0.03 * kk][i];
      const shade: RGB = i === 0 ? [0.72, 0.72, 0.72] : [0.86, 0.86, 0.86];
      for (let j = 0; j <= NS * 4; j++) {
        // rounded rectangle outline
        const a = (j / (NS * 4)) * Math.PI * 2;
        const ex = Math.sign(Math.cos(a)) * Math.pow(Math.abs(Math.cos(a)), 0.45);
        const ey = Math.sign(Math.sin(a)) * Math.pow(Math.abs(Math.sin(a)), 0.45);
        row.push(b.v(ex * (pw - inset), py - ph / 2 + ey * (ph / 2 - inset) - ph * 0.5, pz + outz, chest, shade));
      }
      prow.push(row);
    }
    b.loft('accent', prow);
    b.cap('accent', prow[2], [0, py - ph, pz - 0.032 * kk], chest, false, [0.86, 0.86, 0.86]);
  }
  // straps over the shoulders
  for (const sx of [1, -1]) {
    b.mirror = sx < 0;
    const x = s.shoulderX * 0.6;
    const w = 0.017 * kk;
    const path: [number, number, number][] = [];
    const lift = 0.007 * k;
    // back, top of the pack → over the shoulder → down the chest → under the arm → pack side
    path.push([x, yTop - 0.05 * kk, backZ - 0.01 * k]);
    const surf = (th: number, y: number, extra = 0): [number, number, number] => {
      const r = shirtR(th, y) + lift + extra;
      return [Math.sin(th) * r, y, Math.cos(th) * r];
    };
    const thAt = (y: number, front: boolean) => {
      // direction whose surface point has the strap's x
      let th = front ? 0.6 : Math.PI - 0.6;
      for (let i = 0; i < 6; i++) {
        const r = shirtR(th, y);
        const sn = Math.min(0.98, x / r);
        th = front ? Math.asin(sn) : Math.PI - Math.asin(sn);
      }
      return th;
    };
    const yShoulder = s.shoulderY + 0.012 * k;
    path.push(surf(thAt(yShoulder - 0.02 * k, false), yShoulder - 0.02 * k));
    // over the top of the shoulder
    const topY = s.torso[s.torso.length - 3][0] + 0.03 * k;
    path.push([x, topY + 0.004 * k, -0.035 * k]);
    path.push([x, topY + 0.004 * k, 0.03 * k]);
    for (const dy of [0.02, 0.08, 0.15]) path.push(surf(thAt(yShoulder - dy * k, true), yShoulder - dy * k));
    const yLow = s.shoulderY - 0.235 * k;
    path.push(surf(0.95, yLow + 0.03 * k));
    path.push(surf(1.45, yLow));
    path.push(surf(2.05, yLow - 0.02 * k));
    path.push([halfW * 0.95, yLow - 0.05 * k, backZ - 0.02 * k]);
    const rowA: number[] = [];
    const rowB: number[] = [];
    for (let i = 0; i < path.length; i++) {
      const p = path[i];
      const q = path[Math.min(path.length - 1, i + 1)];
      const o = path[Math.max(0, i - 1)];
      const t = [q[0] - o[0], q[1] - o[1], q[2] - o[2]];
      // width direction: perpendicular to the path and to the outward direction
      const out = [p[0] * 0.6, 0.2, p[2]];
      let wv = [t[1] * out[2] - t[2] * out[1], t[2] * out[0] - t[0] * out[2], t[0] * out[1] - t[1] * out[0]];
      const wl = Math.hypot(wv[0], wv[1], wv[2]) || 1;
      wv = wv.map((v) => (v / wl) * w);
      const wgt = torsoWLite(s, p[1]);
      rowA.push(b.v(p[0] + wv[0], p[1] + wv[1], p[2] + wv[2], wgt, [0.8, 0.8, 0.8]));
      rowB.push(b.v(p[0] - wv[0], p[1] - wv[1], p[2] - wv[2], wgt, [0.8, 0.8, 0.8]));
    }
    b.band('accent', rowA, rowB);
  }
  b.mirror = false;
}

function torsoWLite(s: Spec, y: number): W {
  const k = s.H / 1.78;
  const c = smooth(s.chestY - 0.08 * k, s.chestY + 0.05 * k, y);
  return [B.spine, 1 - c, B.chest, c];
}
