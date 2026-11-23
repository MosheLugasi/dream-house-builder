import { B, Builder, type RGB, type W, WHITE, clamp01, curve, gauss, lerp, rgb, smooth, superR, w1 } from './builder';
import type { Styles, TorsoInfo } from './body';
import type { Spec } from './spec';

/** Head coordinate helper: head units (chin = 0, crown = 1, face towards +z) ↔ meters. */
export interface HeadCtx {
  s: Spec;
  /** head height in meters */
  u: number;
  /** head units → meters */
  abs(p: readonly [number, number, number]): [number, number, number];
  /** bare skull / scalp surface in direction `th` (from +Z towards +X) at height y (head units) */
  scalp(th: number, y: number): [number, number, number];
  /** point of the sculpted face surface in front of (x, y) */
  face(x: number, y: number): [number, number, number];
  eye: { x: number; y: number; z: number; r: number };
  torso: TorsoInfo;
}

const ZC = -0.03;
const ZN = -0.11;
const HEAD = w1(B.head);

const PUPIL: RGB = rgb('#0d0907');
const SCLERA: RGB = rgb('#f3efe9');
const SCLERA_EDGE: RGB = rgb('#cfc2ba');
const LASH: RGB = rgb('#1a1310');
const MOUTH: RGB = rgb('#4a2020');

export function buildHead(b: Builder, s: Spec, st: Styles, torso: TorsoInfo): HeadCtx {
  const u = s.headH;
  const f = s.face;
  const k = s.H / 1.78;
  const z0 = 0.012 * k;
  const abs = (p: readonly [number, number, number]): [number, number, number] => [p[0] * u, s.chinY + p[1] * u, z0 + p[2] * u];
  const yb = (s.neckY - s.chinY) / u;
  const rn = s.r.neck / u;
  const kid = s.child ? 1 : 0;

  // ---- skull profile -----------------------------------------------------------------------------
  // [y, half width, front z, back z, exponent]
  const sk = f.skullW;
  const P = curve([
    [-0.1, 0.08, 0.1, -0.12, 2],
    [-0.045, f.chin * 0.72, 0.2 - 0.02 * kid, -0.13, 1.8],
    [0.0, f.chin * 0.92, 0.338 - 0.012 * kid, -0.16, 1.78],
    [0.05, lerp(f.chin, f.jaw, 0.42), 0.38 - 0.008 * kid, -0.2, 1.92],
    [0.1, f.jaw * 0.87, 0.39 - 0.004 * kid, -0.26, 2.02],
    [0.18, f.jaw, 0.386, -0.32, 2.1],
    [0.26, lerp(f.jaw, sk, 0.38), 0.396, -0.37, 2.15],
    [0.36, sk * 0.925, 0.4, -0.415, 2.2],
    [0.47, sk * 0.96, 0.39, -0.44, 2.2],
    [0.58, sk * 0.99, 0.402 + 0.006 * kid, -0.455, 2.2],
    [0.7, sk, 0.4 + 0.012 * kid, -0.45, 2.2],
    [0.8, sk * 0.95, 0.372 + 0.012 * kid, -0.42, 2.15],
    [0.9, sk * 0.78, 0.292 + 0.01 * kid, -0.345, 2.06],
    [0.96, sk * 0.53, 0.185, -0.238, 2.0],
    [0.988, sk * 0.3, 0.085, -0.15, 2.0],
    [1.0, 0.004, -0.028, -0.036, 2.0],
  ]);
  const rHead = (th: number, y: number): number => {
    const [w, fr, bk, n] = P(y);
    return superR(th, Math.max(0.003, w), Math.max(0.003, fr - ZC), Math.max(0.003, ZC - bk), n);
  };
  const rNeck = (th: number): number => {
    const e = ZN - ZC;
    const c = Math.cos(th);
    const sn = Math.sin(th);
    return e * c + Math.sqrt(Math.max(0, rn * rn - e * e * sn * sn));
  };
  const scalp = (th: number, y: number): [number, number, number] => {
    const r = rHead(th, y);
    return [Math.sin(th) * r, y, ZC + Math.cos(th) * r];
  };

  // ---- face sculpting -------------------------------------------------------------------------------
  const ex = f.eyeX;
  const ey = f.eyeY;
  const tipY = f.noseY + 0.012;
  const bridgeY = ey + 0.03;
  const noseZ = (x: number, y: number): number => {
    let h: number;
    let sg: number;
    if (y >= tipY) {
      const t = (y - tipY) / (bridgeY - tipY);
      if (t > 1.25) return 0;
      h = f.nose * (0.1 * Math.pow(Math.max(0, 1 - t), 1.25) + 0.014) * smooth(1.25, 0.9, t);
      sg = lerp(0.058, 0.036, clamp01(t));
    } else {
      h = f.nose * 0.114 * smooth(tipY - 0.05, tipY, y);
      sg = 0.058;
    }
    // nostril wings
    const wings = f.nose * 0.022 * gauss(Math.abs(x) - 0.052, 0.028) * gauss(y - f.noseY, 0.028);
    return h * Math.exp(-Math.pow(Math.abs(x) / sg, 2.2)) + wings;
  };
  const sculpt = (p: [number, number, number]): void => {
    const [x, y] = p;
    const ax = Math.abs(x);
    const front = smooth(0.0, 0.2, p[2]);
    if (front <= 0) return;
    let dz = 0;
    // eye sockets
    dz -= 0.05 * gauss(ax - ex, 0.108) * gauss(y - ey, 0.074);
    // brow ridge
    dz += (0.01 + 0.008 * (f.brow - 0.8)) * gauss(y - (ey + 0.115), 0.05) * gauss(ax - 0.1, 0.2);
    dz += noseZ(x, y);
    // cheeks
    dz += (0.008 + 0.014 * f.cheek) * gauss(ax - 0.19, 0.11) * gauss(y - 0.3, 0.12);
    // muzzle and chin
    dz += 0.014 * gauss(x, 0.15) * gauss(y - f.mouthY, 0.075);
    dz += 0.012 * gauss(x, 0.09) * gauss(y - 0.05, 0.045);
    // a soft dent under the lower lip
    dz -= 0.008 * gauss(x, 0.08) * gauss(y - (f.mouthY - 0.075), 0.03);
    p[2] += dz * front;
    p[0] *= 1 + f.cheek * 0.035 * gauss(y - 0.27, 0.13) * front;
  };
  const tint = (p: [number, number, number]): RGB => {
    const [x, y, z] = p;
    const ax = Math.abs(x);
    const front = smooth(0.0, 0.2, z);
    const blush = (0.3 + 0.25 * f.cheek) * gauss(ax - 0.2, 0.085) * gauss(y - 0.3, 0.075) * front;
    const nose = 0.18 * gauss(x, 0.05) * gauss(y - f.noseY - 0.01, 0.04) * front;
    const socket = 0.1 * gauss(ax - ex, 0.09) * gauss(y - ey, 0.06) * front;
    const under = 0.1 * smooth(0.02, -0.08, y);
    const t = clamp01(blush + nose);
    const d = 1 - socket - under;
    return [d * lerp(1, 1.0, t), d * lerp(1, 0.8, t), d * lerp(1, 0.79, t)];
  };
  const face = (x: number, y: number): [number, number, number] => {
    const ax = Math.abs(x);
    let lo = 0;
    let hi = 1.6;
    for (let i = 0; i < 22; i++) {
      const mid = (lo + hi) / 2;
      if (Math.sin(mid) * rHead(mid, y) < ax) lo = mid;
      else hi = mid;
    }
    const p = scalp((lo + hi) / 2, y);
    p[0] = x;
    sculpt(p);
    p[0] = x;
    return p;
  };

  // ---- head + neck skin ---------------------------------------------------------------------------
  const N = 40;
  const ys: number[] = [yb - 0.17, yb - 0.07, yb + 0.01, lerp(yb, -0.09, 0.5), -0.09, -0.045, -0.012, 0.02];
  for (const y of [0.05, 0.08, 0.11, 0.14, 0.17, 0.195, 0.22, 0.245, 0.27, 0.295, 0.315, 0.335, 0.36, 0.39, 0.42, 0.45, 0.48, 0.51, 0.54, 0.57, 0.6, 0.64, 0.69, 0.75, 0.81, 0.87, 0.92, 0.96, 0.988])
    ys.push(y);
  const prof = curve(s.torso);
  const rows: number[][] = [];
  for (const y of ys) {
    const row: number[] = [];
    const fade = smooth(-0.1, -0.03, y);
    const flare = smooth(yb + 0.03, yb - 0.12, y);
    for (let j = 0; j <= N; j++) {
      const uu = j / N;
      const th = Math.PI + Math.PI * 2 * uu + 0.42 * Math.sin(Math.PI * 2 * uu);
      const rh = y >= -0.1 ? rHead(th, y) * fade : 0;
      const rk = rNeck(th);
      // smooth union of the skull and the neck column
      const kk = 0.05;
      const h = clamp01(0.5 + (0.5 * (rh - rk)) / kk);
      const r = y > 0.3 ? rh : lerp(rk, rh, h) + kk * h * (1 - h) * 0.6;
      const p: [number, number, number] = [Math.sin(th) * r, y, ZC + Math.cos(th) * r];
      if (y > -0.05) sculpt(p);
      const c = tint(p);
      let a = abs(p);
      if (flare > 0) {
        const [rx, rf, rb, n] = prof(a[1]);
        const rt = superR(th, rx - 0.004 * k, rf - 0.004 * k, rb - 0.004 * k, n);
        a = [lerp(a[0], Math.sin(th) * rt, flare), a[1], lerp(a[2], Math.cos(th) * rt, flare)];
      }
      // weights: the face and skull follow the head, the column blends head → neck → chest
      const hw = Math.max(smooth(-0.04, 0.13, y), smooth(-0.01, 0.035, rh - rk));
      const cw = smooth(yb + 0.07, yb - 0.03, y);
      const w: W = [B.head, hw, B.neck, (1 - hw) * (1 - cw), B.chest, (1 - hw) * cw];
      row.push(b.v(a[0], a[1], a[2], w, c));
    }
    b.seam(row[0], row[N]);
    rows.push(row);
  }
  b.loft('skin', rows, true);
  b.cap('skin', rows[rows.length - 1], abs([0, 1.0, -0.04]), HEAD);

  // ---- eyes -------------------------------------------------------------------------------------------
  const er = f.eyeR;
  const sock = face(ex, ey);
  const ez = sock[2] + 0.03 - er;
  const eye = { x: ex, y: ey, z: ez, r: er };
  const aUp = (s.child ? 46 : s.female ? 42 : 37) * (Math.PI / 180);
  const aLow = (s.child ? -31 : -27) * (Math.PI / 180);
  for (const side of [1, -1]) {
    b.mirror = side < 0;
    const C: [number, number, number] = [ex, ey, ez];
    const sph = (phi: number, psi: number, r: number): [number, number, number] =>
      abs([C[0] + r * Math.sin(phi) * Math.cos(psi), C[1] + r * Math.sin(phi) * Math.sin(psi), C[2] + r * Math.cos(phi)]);
    const M = 14;
    const ringAt = (phi: number, col: RGB, r = er) => {
      const row: number[] = [];
      for (let j = 0; j <= M; j++) {
        const p = sph(phi, (j / M) * Math.PI * 2, r);
        row.push(b.v(p[0], p[1], p[2], HEAD, col));
      }
      b.seam(row[0], row[M]);
      return row;
    };
    const deg = Math.PI / 180;
    const pupilA = 12.5 * deg;
    const irisA = (s.child ? 33 : 30.5) * deg;
    // pupil
    const pr = ringAt(pupilA, PUPIL);
    const pc = sph(0, 0, er);
    b.cap('eye', pr, pc, HEAD, false, PUPIL);
    // iris: darker towards the limbus, a touch lighter at the bottom where light pools
    const i0 = ringAt(pupilA, [0.62, 0.62, 0.62]);
    const i1 = ringAt((pupilA + irisA) / 2, [1.15, 1.15, 1.15]);
    const i2 = ringAt(irisA, [0.42, 0.42, 0.42]);
    b.loft('iris', [i0, i1, i2]);
    // sclera
    const s0 = ringAt(irisA, SCLERA_EDGE);
    const s1 = ringAt(irisA + 9 * deg, SCLERA);
    const s2 = ringAt(60 * deg, SCLERA);
    const s3 = ringAt(100 * deg, SCLERA_EDGE);
    b.loft('eye', [s0, s1, s2, s3]);
    // catch light
    {
      const cl = (dphi: number, dpsi: number) => {
        const p = sph(17 * deg + dphi, 2.2 + dpsi, er * 1.012);
        return b.v(p[0], p[1], p[2], HEAD, [2.4, 2.4, 2.4]);
      };
      const q = [cl(-4.5 * deg, 0), cl(0, 0.26), cl(4.5 * deg, 0), cl(0, -0.26)];
      b.sheet('eye', [[q[0], q[1]], [q[3], q[2]]], [0, 0, 1]);
    }
    // eyelids: patches of a slightly larger sphere, parametrised around the X axis so a blink is one rotation
    const lid = (a0: number, a1: number, bone: W, upper: boolean) => {
      const rl = er * 1.085;
      const b0 = 80 * deg;
      const grid: number[][] = [];
      const R = 5;
      const Cn = 9;
      const lashRow: number[] = [];
      const lashRow2: number[] = [];
      for (let i = 0; i <= R; i++) {
        const al = lerp(a0, a1, i / R);
        const row: number[] = [];
        for (let j = 0; j <= Cn; j++) {
          const be = lerp(-b0, b0, j / Cn);
          // the margin sits a little proud of the eyeball; the rest sinks into the socket
          const rr = rl * (1 + 0.04 * (i === 0 ? 1 : 0));
          const p = abs([C[0] + rr * Math.sin(be), C[1] + rr * Math.cos(be) * Math.sin(al), C[2] + rr * Math.cos(be) * Math.cos(al)]);
          const shade = i === 0 ? 0.8 : i === 1 ? 0.9 : 0.97;
          row.push(b.v(p[0], p[1], p[2], bone, [shade, shade * 0.95, shade * 0.94]));
          if (i === 0 && upper) {
            const lw = (2.5 + 3.5 * f.lash) * deg * (0.55 + 0.45 * Math.cos(be * 0.9)) * (be > 0 ? 1.25 : 1);
            for (const [list, da, dr] of [[lashRow, 0, 1.055], [lashRow2, -lw, 1.075 + 0.02 * f.lash]] as [number[], number, number][]) {
              const q = abs([
                C[0] + rl * dr * Math.sin(be),
                C[1] + rl * dr * Math.cos(be) * Math.sin(al + da),
                C[2] + rl * dr * Math.cos(be) * Math.cos(al + da),
              ]);
              list.push(b.v(q[0], q[1], q[2], bone, LASH));
            }
          }
        }
        grid.push(row);
      }
      b.sheet('skin', grid, [0, upper ? 0.4 : -0.4, 1]);
      if (upper && f.lash > 0.3) b.sheet('detail', [lashRow, lashRow2], [0, -0.3, 1]);
    };
    lid(aUp, 112 * deg, w1(B.lid), true);
    lid(aLow, -112 * deg, HEAD, false);
  }
  b.mirror = false;

  // ---- eyebrows -----------------------------------------------------------------------------------
  for (const side of [1, -1]) {
    b.mirror = side < 0;
    const n = 7;
    const top: number[] = [];
    const mid: number[] = [];
    const bot: number[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = lerp(ex - 0.092, ex + 0.118, t);
      const arch = 0.022 * Math.sin(Math.PI * Math.pow(t, 0.75)) - 0.03 * t * t * (s.female ? 0.6 : 0.9);
      const y = ey + (s.child ? 0.158 : 0.14) + arch + (s.female ? 0.012 : 0);
      const hgt = 0.0135 * f.brow * (1 - 0.72 * Math.pow(t, 1.4)) * (0.55 + 0.45 * smooth(0, 0.14, t));
      const p0 = abs(face(x, y + hgt));
      const p1 = abs(face(x, y));
      const p2 = abs(face(x, y - hgt));
      top.push(b.v(p0[0], p0[1], p0[2] + 0.0012 * k, HEAD));
      mid.push(b.v(p1[0], p1[1], p1[2] + 0.0045 * k, HEAD));
      bot.push(b.v(p2[0], p2[1], p2[2] + 0.0012 * k, HEAD));
    }
    b.sheet('hair', [top, mid, bot], [0, 0, 1]);
  }
  b.mirror = false;

  // ---- lips ---------------------------------------------------------------------------------------------
  {
    const n = 10;
    const lipC: RGB = [lerp(1, 0.84, clamp01(f.lip * 0.62)), lerp(1, 0.47, clamp01(f.lip * 0.62)), lerp(1, 0.46, clamp01(f.lip * 0.62))];
    const rowsU: number[][] = [[], [], []];
    const rowsL: number[][] = [[], [], []];
    const line: number[][] = [[], []];
    const lk = Math.sqrt(f.lip);
    for (let i = 0; i <= n; i++) {
      const sx = lerp(-1, 1, i / n);
      const x = sx * f.mouthW;
      const yl = f.mouthY + 0.02 * (sx * sx - 0.35);
      const open = 1 - Math.pow(Math.abs(sx), 2.4);
      const hu = 0.03 * lk * open * (1 - 0.24 * gauss(sx, 0.17)) + 0.002;
      const hl = 0.037 * lk * Math.pow(open, 0.85) + 0.002;
      const zf = (y: number) => face(x, y)[2];
      const bul = 0.013 * lk * Math.pow(open, 0.7);
      const push = (list: number[], y: number, dz: number, c: RGB) => {
        const p = abs([x, y, zf(y) + dz]);
        list.push(b.v(p[0], p[1], p[2], HEAD, c));
      };
      push(rowsU[0], yl + hu, 0.001, WHITE);
      push(rowsU[1], yl + hu * 0.42, bul * 0.9, lipC);
      push(rowsU[2], yl + 0.0015, bul * 0.5, lipC);
      push(rowsL[0], yl - 0.0015, bul * 0.5, lipC);
      push(rowsL[1], yl - hl * 0.5, bul * 1.05, lipC);
      push(rowsL[2], yl - hl, 0.001, WHITE);
      push(line[0], yl + 0.004 * open + 0.001, bul * 0.52, MOUTH);
      push(line[1], yl - 0.004 * open - 0.001, bul * 0.52, MOUTH);
    }
    b.sheet('skin', rowsU, [0, 0, 1]);
    b.sheet('skin', rowsL, [0, 0, 1]);
    b.sheet('detail', line, [0, 0, 1]);
  }

  // ---- ears -------------------------------------------------------------------------------------------
  for (const side of [1, -1]) {
    b.mirror = side < 0;
    const cy = ey - 0.035;
    const hh = 0.125;
    const dd = 0.075;
    const thE = 1.74;
    const base = scalp(thE, cy);
    const n = 10;
    const rim: number[] = [];
    const mid: number[] = [];
    const root: number[] = [];
    const earC: RGB = [1, 0.9, 0.88];
    const inner: RGB = [0.8, 0.66, 0.63];
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const dz = Math.cos(a);
      const dy = Math.sin(a);
      // the back edge stands away from the skull, the front edge is attached
      const lift = 0.012 + 0.05 * (1 - dz) * 0.5;
      const yy = cy + dy * hh * (1 - 0.12 * dz) + 0.01;
      const zz = base[2] + dz * dd - 0.02;
      const bx = scalp(thE, clamp01(yy))[0];
      const p = abs([bx + lift, yy, zz]);
      rim.push(b.v(p[0], p[1], p[2], HEAD, earC));
      const q = abs([bx + lift * 0.72 - 0.004, cy + dy * hh * 0.62 + 0.01, base[2] + dz * dd * 0.58 - 0.012]);
      mid.push(b.v(q[0], q[1], q[2], HEAD, inner));
      const r = abs([bx - 0.02, cy + dy * hh * 0.8 + 0.01, base[2] + dz * dd * 0.75 - 0.03]);
      root.push(b.v(r[0], r[1], r[2], HEAD, earC));
    }
    const c = abs([base[0] + 0.012, cy + 0.005, base[2] - 0.012]);
    const ci = b.v(c[0], c[1], c[2], HEAD, inner);
    b.sheet('skin', [mid, rim], [1, 0, 0.2]);
    b.sheet('skin', [rim, root], [-0.2, 0, -1]);
    b.sheet('skin', [mid.map(() => ci), mid], [1, 0, 0.2]);
  }
  b.mirror = false;

  return { s, u, abs, scalp, face, eye, torso };
}

// =====================================================================================================
// accessories on the head
// =====================================================================================================

const FRAME: RGB = rgb('#2b2622');

export function buildGlasses(b: Builder, h: HeadCtx): void {
  const { eye, abs } = h;
  const zf = eye.z + eye.r + 0.06;
  const hw = 0.118;
  const hh = 0.088;
  const tube = 0.0095;
  const cx = eye.x + 0.012;
  const cy = eye.y - 0.012;
  for (const side of [1, -1]) {
    b.mirror = side < 0;
    // rim: a super-ellipse outline swept with a small diamond section
    const n = 18;
    const rows: number[][] = [[], [], [], [], []];
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      const e = 2 / 3;
      const ox = Math.sign(c) * Math.pow(Math.abs(c), e);
      const oy = Math.sign(sn) * Math.pow(Math.abs(sn), e);
      // wrap slightly around the face
      const px = cx + ox * hw;
      const wrap = -0.035 * Math.pow(Math.max(0, px - 0.05) / 0.2, 2);
      const mk = (dr: number, dz: number) => {
        const p = abs([cx + ox * (hw + dr), cy + oy * (hh + dr), zf + wrap + dz]);
        return b.v(p[0], p[1], p[2], HEAD, FRAME);
      };
      rows[0].push(mk(tube, 0));
      rows[1].push(mk(0, tube));
      rows[2].push(mk(-tube, 0));
      rows[3].push(mk(0, -tube));
      rows[4].push(rows[0][i]);
    }
    b.sheet('detail', rows, [1, 0, 1]);
    // temple arm
    {
      const x0 = cx + hw;
      const pts: [number, number, number][] = [
        [x0, cy + 0.03, zf - 0.035 * Math.pow((x0 - 0.05) / 0.2, 2)],
        [h.s.face.skullW * 0.985 + 0.01, cy + 0.035, 0.12],
        [h.s.face.skullW * 0.99 + 0.012, cy + 0.045, -0.06],
        [h.s.face.skullW * 0.96 + 0.01, cy - 0.03, -0.13],
      ];
      const t = 0.008;
      const r4: number[][] = [[], [], [], [], []];
      for (const p of pts) {
        const q = [
          abs([p[0], p[1] + t * 1.3, p[2]]),
          abs([p[0] + t * 0.7, p[1], p[2]]),
          abs([p[0], p[1] - t * 1.3, p[2]]),
          abs([p[0] - t * 0.7, p[1], p[2]]),
        ];
        q.forEach((v, i) => r4[i].push(b.v(v[0], v[1], v[2], HEAD, FRAME)));
        r4[4].push(r4[0][r4[0].length - 1]);
      }
      b.sheet('detail', r4, [1, 1, 0]);
    }
  }
  b.mirror = false;
  // bridge
  {
    const x1 = cx - hw + 0.004;
    const r4: number[][] = [[], [], [], [], []];
    const t = 0.008;
    for (let i = 0; i <= 4; i++) {
      const x = lerp(-x1, x1, i / 4);
      const y = cy + 0.03 + 0.012 * (1 - Math.pow(x / x1, 2));
      const q = [abs([x, y + t, zf]), abs([x, y, zf + t]), abs([x, y - t, zf]), abs([x, y, zf - t])];
      q.forEach((v, j) => r4[j].push(b.v(v[0], v[1], v[2], HEAD, FRAME)));
      r4[4].push(r4[0][r4[0].length - 1]);
    }
    b.sheet('detail', r4, [0, 1, 1]);
  }
}

/** Baseball cap: dome over the scalp + visor. Returns nothing; hair builders keep the hair thin under it. */
export const CAP_LINE = { front: 0.735, back: 0.6 };
export const capLineY = (th: number) => lerp(CAP_LINE.back, CAP_LINE.front, (Math.cos(th) + 1) / 2);

export function buildCap(b: Builder, h: HeadCtx): void {
  const { abs, scalp } = h;
  const N = 24;
  const off = 0.034;
  const C: [number, number, number] = [0, 0.5, ZC];
  const dome = (th: number, y: number, o: number): [number, number, number] => {
    const p = scalp(th, y);
    const d = [p[0] - C[0], (p[1] - C[1]) * 1.25, p[2] - C[2]];
    const l = Math.hypot(d[0], d[1], d[2]) || 1;
    return [p[0] + (d[0] / l) * o, p[1] + (d[1] / l) * o, p[2] + (d[2] / l) * o];
  };
  const rows: number[][] = [];
  const ts = [0.14, 0.3, 0.48, 0.66, 0.84, 1.0];
  for (const t of ts) {
    const row: number[] = [];
    for (let j = 0; j <= N; j++) {
      const th = Math.PI + (j / N) * Math.PI * 2;
      const yl = capLineY(th);
      const y = yl + (0.995 - yl) * Math.cos((t * Math.PI) / 2);
      // panel seams: six shallow grooves
      const groove = 1 - 0.035 * Math.pow(Math.abs(Math.cos(th * 3)), 12) * Math.sin(t * Math.PI);
      const p = abs(dome(th, y, off * groove));
      row.push(b.v(p[0], p[1], p[2], HEAD, t === 1 ? [0.82, 0.82, 0.82] : WHITE));
    }
    b.seam(row[0], row[N]);
    rows.push(row);
  }
  // inner lip
  {
    const row: number[] = [];
    for (let j = 0; j <= N; j++) {
      const th = Math.PI + (j / N) * Math.PI * 2;
      const p = abs(dome(th, capLineY(th) + 0.01, 0.006));
      row.push(b.v(p[0], p[1], p[2], HEAD, [0.6, 0.6, 0.6]));
    }
    rows.push(row);
  }
  b.loft('accent', rows);
  const topP = abs([0, 1.0 + off, -0.04]);
  b.cap('accent', rows[0], topP, HEAD);
  // button
  {
    const r = [0.0, 0.02, 0.026].map((rr, i) =>
      b.ring(8, { c: [topP[0], topP[1] + [0.012, 0.009, 0.0][i] * h.u, topP[2]], rx: Math.max(0.0005, rr * h.u), w: HEAD, col: [0.8, 0.8, 0.8] }),
    );
    b.loft('accent', r);
  }
  // visor
  {
    const NV = 10;
    const half = 1.0;
    const len = 0.34;
    const topRows: number[][] = [];
    const botRows: number[][] = [];
    const steps = 4;
    for (let i = 0; i <= steps; i++) {
      const v = i / steps;
      const tr: number[] = [];
      const br: number[] = [];
      for (let j = 0; j <= NV; j++) {
        const uu = lerp(-1, 1, j / NV);
        const th = uu * half;
        const yl = capLineY(th) + 0.012;
        const p0 = dome(th, yl, off * 0.9);
        // forward reach: full in the middle, tapering to nothing at the temples (a crescent)
        const reach = len * Math.pow(Math.max(0, 1 - uu * uu), 0.62) * v;
        const droop = -0.1 * reach - 0.05 * uu * uu * v;
        const p: [number, number, number] = [p0[0] * (1 + 0.06 * v), p0[1] + droop, p0[2] + reach];
        const a = abs(p);
        tr.push(b.v(a[0], a[1] + 0.007 * h.u, a[2], HEAD, WHITE));
        br.push(b.v(a[0], a[1] - 0.007 * h.u, a[2], HEAD, [0.62, 0.62, 0.62]));
      }
      topRows.push(tr);
      botRows.push(br);
    }
    b.sheet('accent', topRows, [0, 1, 0.2]);
    b.sheet('accent', botRows, [0, -1, 0]);
    b.sheet('accent', [topRows[steps], botRows[steps]], [0, 0, 1]);
  }
}

/** A ribbon bow. `o` origin, `r` right, `up`, `n` forward axes (unit, meters space); `size` in meters. */
export function buildBow(
  b: Builder,
  o: [number, number, number],
  r: [number, number, number],
  up: [number, number, number],
  n: [number, number, number],
  size: number,
  w: W,
): void {
  const P = (x: number, y: number, z: number): [number, number, number] => [
    o[0] + (r[0] * x + up[0] * y + n[0] * z) * size,
    o[1] + (r[1] * x + up[1] * y + n[1] * z) * size,
    o[2] + (r[2] * x + up[2] * y + n[2] * z) * size,
  ];
  const mk = (x: number, y: number, z: number, c: RGB = WHITE) => {
    const p = P(x, y, z);
    return b.v(p[0], p[1], p[2], w, c);
  };
  const dark: RGB = [0.72, 0.72, 0.72];
  for (const sx of [1, -1]) {
    // loop: a puffy wedge that widens away from the knot
    const rows: number[][] = [];
    const sec = 8;
    for (const [t, hh, th] of [[0.12, 0.2, 0.12], [0.45, 0.4, 0.22], [0.8, 0.52, 0.2], [1.0, 0.46, 0.1]] as number[][]) {
      const row: number[] = [];
      for (let j = 0; j <= sec; j++) {
        const a = (j / sec) * Math.PI * 2;
        const c = Math.cos(a);
        const sn = Math.sin(a);
        row.push(mk(sx * t, sn * hh, c * th + 0.05, c < -0.2 ? dark : WHITE));
      }
      rows.push(row);
    }
    b.sheet('accent', rows, [sx, 0, 0.3]);
    const end = rows[rows.length - 1];
    const ci = mk(sx * 1.04, 0, 0.05);
    for (let j = 0; j < sec; j++) {
      if (sx > 0) b.tri('accent', ci, end[j + 1], end[j]);
      else b.tri('accent', ci, end[j], end[j + 1]);
    }
    // tail
    const t0 = mk(sx * 0.05, -0.1, 0.1, dark);
    const t1 = mk(sx * 0.2, -0.12, 0.1, dark);
    const t2 = mk(sx * 0.62, -0.92, 0.04);
    const t3 = mk(sx * 0.3, -0.98, 0.04);
    b.sheet('accent', [[t0, t1], [t3, t2]], [0, 0, 1]);
  }
  // knot
  const kr: number[][] = [];
  for (const [y, s2] of [[0.2, 0.5], [0.1, 1], [-0.1, 1], [-0.2, 0.5]] as number[][]) {
    const row: number[] = [];
    for (let j = 0; j <= 8; j++) {
      const a = (j / 8) * Math.PI * 2;
      row.push(mk(Math.cos(a) * 0.16 * s2, y, Math.sin(a) * 0.17 * s2 + 0.06, [0.85, 0.85, 0.85]));
    }
    kr.push(row);
  }
  b.loft('accent', kr);
}

export { HEAD as HEAD_W, ZC as HEAD_ZC };
