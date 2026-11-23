import type { HairStyle } from '../characterTypes';
import { B, Builder, type RGB, type W, WHITE, curve, gauss, lerp, smooth, w1 } from './builder';
import { HEAD_ZC, type HeadCtx, buildBow, capLineY } from './head';

export interface HairInfo {
  /** rest positions (meters) of the two hair bones */
  pivotA: [number, number, number];
  pivotB: [number, number, number];
  /** what the hair bones hang from */
  parentA: 'head' | 'chest';
  /** B is a child of A (a chain: pony tail) or a sibling (two braids) */
  chain: boolean;
  /** how strongly the hair bones swing (0 = no loose hair) */
  swing: number;
}

const HEAD = w1(B.head);
type V3 = [number, number, number];

interface CapOpts {
  NA: number;
  ts: number[];
  /** hairline height for an azimuth in [-π, π] (0 = front) */
  line(th: number): number;
  /** thickness (head units) */
  thick(th: number, t: number): number;
  /** rows that continue below the hairline, hanging: returns the point for (azimuth, 0..1) or null to end on the scalp */
  hang?: { hs: number[]; at(th: number, hh: number, start: V3): { p: V3; w: W } | null };
  cap: boolean;
  uRepeat?: number;
}

const norm = (th: number) => Math.atan2(Math.sin(th), Math.cos(th));

function hairCap(b: Builder, h: HeadCtx, o: CapOpts): void {
  const { scalp, abs } = h;
  const C: V3 = [0, 0.5, HEAD_ZC];
  const out = (p: V3, d: number): V3 => {
    const v = [p[0] - C[0], (p[1] - C[1]) * 1.15, p[2] - C[2]];
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [p[0] + (v[0] / l) * d, p[1] + (v[1] / l) * d, p[2] + (v[2] / l) * d];
  };
  const rep = o.uRepeat ?? 6;
  const rows: number[][] = [];
  const pointAt = (th: number, t: number): V3 => {
    const tn = norm(th);
    const yl = o.line(tn);
    const y = yl + (0.997 - yl) * Math.cos((t * Math.PI) / 2);
    let d = o.thick(tn, t);
    if (o.cap && y > capLineY(tn) - 0.03) d = Math.min(d, lerp(d, 0.018, smooth(capLineY(tn) - 0.03, capLineY(tn) + 0.02, y)));
    return out(scalp(th, y), d);
  };
  for (const t of o.ts) {
    const row: number[] = [];
    for (let j = 0; j <= o.NA; j++) {
      const th = Math.PI + (j / o.NA) * Math.PI * 2;
      const p = abs(pointAt(th, t));
      row.push(b.v(p[0], p[1], p[2], HEAD, WHITE, (j / o.NA) * rep, t * 0.5));
    }
    b.seam(row[0], row[o.NA]);
    rows.push(row);
  }
  // below the hairline: either tuck back to the scalp or hang
  const hs = o.hang?.hs ?? [];
  const extra: number[][] = [...hs.map(() => [] as number[]), []];
  for (let j = 0; j <= o.NA; j++) {
    const th = Math.PI + (j / o.NA) * Math.PI * 2;
    const tn = norm(th);
    const start = pointAt(th, 1);
    const first = o.hang?.at(tn, hs[0] ?? 1, start) ?? null;
    const uu = (j / o.NA) * rep;
    if (!first) {
      // close onto the scalp just under the last row
      const yl = o.line(tn);
      const p = abs(out(scalp(th, yl - 0.012), 0.003));
      for (const list of extra) list.push(b.v(p[0], p[1], p[2], HEAD, [0.8, 0.8, 0.8], uu, 0.55));
      continue;
    }
    let last: V3 = start;
    hs.forEach((hh, i) => {
      const r = o.hang!.at(tn, hh, start)!;
      const a = abs(r.p);
      extra[i].push(b.v(a[0], a[1], a[2], r.w, WHITE, uu, 0.5 + hh * 0.5));
      last = r.p;
    });
    // tips curl in a little
    const tip = abs([last[0] * 0.93, last[1] - 0.01, last[2] * 0.93 + 0.01]);
    const lw = o.hang!.at(tn, 1, start)!.w;
    extra[hs.length].push(b.v(tip[0], tip[1], tip[2], lw, [0.82, 0.82, 0.82], uu, 1));
  }
  for (const list of extra) {
    b.seam(list[0], list[o.NA]);
    rows.push(list);
  }
  b.loft('hair', rows);
  const top = abs(out([0, 0.999, -0.04], Math.min(o.thick(0, 0), o.cap ? 0.018 : 1)));
  b.cap('hair', rows[0], top, HEAD);
}

/** A tapered tube along a path in the YZ-ish plane (used for pony tails and braids). */
function hairTube(
  b: Builder,
  path: (s: number) => V3,
  radius: (s: number) => [number, number],
  weight: (s: number) => W,
  n: number,
  sides: number,
  wobble: (s: number) => number = () => 0,
): void {
  const rows: number[][] = [];
  for (let i = 0; i <= n; i++) {
    const s = i / n;
    const p = path(s);
    const q = path(Math.min(1, s + 0.02));
    const o = path(Math.max(0, s - 0.02));
    const t = [q[0] - o[0], q[1] - o[1], q[2] - o[2]];
    const tl = Math.hypot(t[0], t[1], t[2]) || 1;
    const T = { x: t[0] / tl, y: t[1] / tl, z: t[2] / tl };
    // ax: sideways, perpendicular to T
    let ax = { x: 1, y: 0, z: 0 };
    const d = ax.x * T.x;
    ax = { x: ax.x - T.x * d, y: -T.y * d, z: -T.z * d };
    const al = Math.hypot(ax.x, ax.y, ax.z) || 1;
    ax = { x: ax.x / al, y: ax.y / al, z: ax.z / al };
    const az = { x: T.y * ax.z - T.z * ax.y, y: T.z * ax.x - T.x * ax.z, z: T.x * ax.y - T.y * ax.x };
    const [rx, rz] = radius(s);
    const wb = wobble(s);
    rows.push(
      b.ring(sides, {
        c: [p[0] + ax.x * wb, p[1] + ax.y * wb, p[2] + ax.z * wb],
        rx: Math.max(0.0008, rx),
        rf: Math.max(0.0008, rz),
        w: weight(s),
        ax,
        az,
        v: s * 1.2,
        uScale: 3,
      }),
    );
  }
  b.loft('hair', rows);
  const e = path(1);
  const e0 = path(0.97);
  b.cap('hair', rows[rows.length - 1], [e[0] + (e[0] - e0[0]) * 0.3, e[1] + (e[1] - e0[1]) * 0.3, e[2] + (e[2] - e0[2]) * 0.3], weight(1), true);
}

function tieRing(b: Builder, c: V3, axis: V3, r: number, w: W, col: RGB = WHITE): void {
  // a small band (torus) around `axis` at c
  const al = Math.hypot(axis[0], axis[1], axis[2]) || 1;
  const T = { x: axis[0] / al, y: axis[1] / al, z: axis[2] / al };
  let ax = { x: 1, y: 0, z: 0 };
  const d = T.x;
  ax = { x: 1 - T.x * d, y: -T.y * d, z: -T.z * d };
  const l = Math.hypot(ax.x, ax.y, ax.z) || 1;
  ax = { x: ax.x / l, y: ax.y / l, z: ax.z / l };
  const az = { x: T.y * ax.z - T.z * ax.y, y: T.z * ax.x - T.x * ax.z, z: T.x * ax.y - T.y * ax.x };
  const rows = [
    [-0.5, 0.86],
    [-0.22, 1.08],
    [0.22, 1.08],
    [0.5, 0.86],
  ].map(([t, m]) =>
    b.ring(10, { c: [c[0] + T.x * t * r * 0.7, c[1] + T.y * t * r * 0.7, c[2] + T.z * t * r * 0.7], rx: r * m, w, ax, az, col }),
  );
  b.loft('accent', rows);
}

export function buildHair(b: Builder, h: HeadCtx, style: HairStyle, cap: boolean, bow: boolean): HairInfo {
  const { s, abs, scalp, u } = h;
  const kid = s.child;
  const info: HairInfo = {
    pivotA: abs([0, 0.7, -0.45]),
    pivotB: abs([0, 0.4, -0.6]),
    parentA: 'head',
    chain: true,
    swing: 0,
  };
  const bowAt = (o: V3, r: V3, up: V3, n: V3, size: number, w: W = HEAD) => buildBow(b, o, r, up, n, size * u, w);
  const sideBow = () => {
    const th = 0.75;
    const p = scalp(th, 0.86);
    const o = abs([p[0] * 1.14 + 0.02, p[1] + 0.06, p[2] * 1.1]);
    bowAt(o, [0.72, -0.3, -0.62], [0.36, 0.9, 0.1], [0.6, 0.3, 0.75], 0.17);
  };
  if (style === 'bald') {
    if (bow) sideBow();
    return info;
  }

  const ts = [0.07, 0.18, 0.33, 0.48, 0.64, 0.8, 0.92, 1.0];

  if (style === 'short') {
    const line = curve([
      [0, kid ? 0.74 : 0.795],
      [0.5, kid ? 0.75 : 0.8],
      [0.85, 0.735],
      [1.1, 0.6],
      [1.3, 0.47],
      [1.48, 0.485],
      [1.62, 0.585],
      [1.95, 0.56],
      [2.15, 0.36],
      [2.4, 0.18],
      [Math.PI, 0.115],
    ]);
    hairCap(b, h, {
      NA: 32,
      ts,
      cap,
      line: (th) => {
        const a = Math.abs(th);
        // a side-swept fringe: longer on one side
        const sweep = a < 0.9 ? 0.03 * Math.sin(th * 2.4 + 0.6) * (1 - a / 0.9) : 0;
        return line(a)[0] - sweep - (kid && a < 0.8 ? 0.02 : 0);
      },
      thick: (th, t) => {
        const a = Math.abs(th);
        const frontTop = 0.058 + 0.022 * gauss(th - 0.25, 0.7);
        const side = lerp(0.03, 0.016, smooth(1.0, 2.6, a));
        const tuft = 0.006 * Math.sin(th * 7 + t * 9) * Math.sin(t * Math.PI);
        return lerp(frontTop, a < 0.9 ? 0.03 : side, smooth(0.35, 0.95, t)) + tuft;
      },
    });
    if (bow) sideBow();
    return info;
  }

  if (style === 'curly') {
    const line = curve([
      [0, 0.73],
      [0.6, 0.72],
      [0.95, 0.56],
      [1.3, 0.4],
      [1.7, 0.34],
      [2.2, 0.2],
      [Math.PI, 0.1],
    ]);
    hairCap(b, h, {
      NA: 36,
      ts: [0.06, 0.14, 0.25, 0.36, 0.48, 0.6, 0.72, 0.84, 0.94, 1.0],
      cap,
      uRepeat: 3,
      line: (th) => line(Math.abs(th))[0],
      thick: (th, t) => {
        const base = lerp(0.105, 0.12, smooth(0.2, 0.8, t)) * (1 - 0.35 * smooth(0.88, 1, t));
        const curls = Math.sin(th * 9 + Math.sin(t * 9) * 1.3) * Math.sin(t * 13 + th * 2) * 0.03 + Math.sin(th * 5 - t * 6) * 0.012;
        return base + curls * (0.4 + 0.6 * Math.sin(Math.min(1, t * 1.2) * Math.PI * 0.8));
      },
    });
    if (bow) sideBow();
    return info;
  }

  // styles that pull or part the hair: 'ponytail', 'bun', 'long', 'braids'
  const pulled = style === 'ponytail' || style === 'bun';
  if (pulled) {
    const line = curve([
      [0, 0.8],
      [0.5, 0.8],
      [0.85, 0.74],
      [1.1, 0.62],
      [1.3, 0.5],
      [1.48, 0.52],
      [1.62, 0.6],
      [1.95, 0.56],
      [2.15, 0.34],
      [2.4, 0.19],
      [Math.PI, 0.15],
    ]);
    hairCap(b, h, {
      NA: 32,
      ts,
      cap,
      line: (th) => line(Math.abs(th))[0],
      thick: (th, t) => {
        const a = Math.abs(th);
        // smooth and close to the head, a little volume at the front
        return lerp(0.036 + 0.014 * gauss(a, 0.8), 0.02, smooth(0.3, 0.9, t)) + 0.012 * gauss(a - Math.PI, 0.7) * smooth(0.2, 0.6, t);
      },
    });
    if (style === 'ponytail') {
      const tieY = cap ? 0.6 : 0.72;
      const sp = scalp(Math.PI, tieY);
      const S0: V3 = [0, sp[1] + 0.02, sp[2] - 0.025];
      const len = kid ? 1.25 : 1.35;
      const path = (q: number): V3 => {
        // out and slightly up, then falling under gravity
        const x = q * len;
        return abs([0, S0[1] + 0.2 * x - 0.68 * x * x, S0[2] - 0.5 * x + 0.16 * x * x]);
      };
      const A = path(0);
      const Bp = path(0.42);
      info.pivotA = A;
      info.pivotB = Bp;
      info.chain = true;
      info.parentA = 'head';
      info.swing = 1;
      hairTube(
        b,
        path,
        (q) => {
          const r = (0.04 + 0.05 * Math.sin(Math.min(1, q * 1.9) * Math.PI * 0.56) - 0.07 * smooth(0.55, 1, q) * q) * u;
          return [r * 1.08, r * 0.88];
        },
        (q) => [B.head, 1 - smooth(0.0, 0.12, q), B.hairA, smooth(0, 0.12, q) * (1 - smooth(0.3, 0.6, q)), B.hairB, smooth(0.3, 0.6, q)],
        9,
        10,
      );
      const T0 = path(0.08);
      tieRing(b, path(0.05), [T0[0] - A[0], T0[1] - A[1], T0[2] - A[2]], 0.046 * u, HEAD);
      if (bow) bowAt(path(0.03), [1, 0, 0], [0, 0.8, 0.6], [0, 0.6, -0.8], 0.2);
    } else {
      // bun
      const cy = cap ? 0.5 : 0.84;
      const sp = scalp(Math.PI, cy);
      const c: V3 = [0, sp[1] + (cap ? 0 : 0.06), sp[2] - 0.07];
      const R = 0.155;
      const rows: number[][] = [];
      const NR = 7;
      for (let i = 1; i < NR; i++) {
        const phi = (i / NR) * Math.PI;
        const row: number[] = [];
        const M = 12;
        for (let j = 0; j <= M; j++) {
          const a = (j / M) * Math.PI * 2;
          // twisted strands: a swirl of shallow grooves
          const g = 1 + 0.05 * Math.sin(a * 4 + phi * 3);
          const p = abs([c[0] + Math.sin(phi) * Math.sin(a) * R * g, c[1] + Math.cos(phi) * R * 0.92, c[2] + Math.sin(phi) * Math.cos(a) * R * g]);
          row.push(b.v(p[0], p[1], p[2], HEAD, WHITE, (j / M) * 3 + phi * 0.6, phi / Math.PI));
        }
        b.seam(row[0], row[M]);
        rows.push(row);
      }
      b.loft('hair', rows, true);
      b.cap('hair', rows[0], abs([c[0], c[1] + R * 0.92, c[2]]), HEAD);
      b.cap('hair', rows[rows.length - 1], abs([c[0], c[1] - R * 0.92, c[2]]), HEAD, true);
      if (bow) bowAt(abs([c[0], c[1] - R * 0.2, c[2] - R * 0.98]), [1, 0, 0], [0, 1, 0], [0, 0, -1], 0.19);
    }
    return info;
  }

  // 'long' and 'braids': centre parting, hair over the ears
  const braids = style === 'braids';
  const yShoulder = (s.torso[s.torso.length - 2][0] - s.chinY) / u;
  const z0 = (abs([0, 0, 0])[2]) / u; // head-space z of the body axis is -z0
  const backZ = (y: number) => {
    // head-space z of the garment's back surface at head-space height y
    const ya = s.chinY + y * u;
    return -(h.torso.shirtR(Math.PI, Math.min(ya, s.torso[s.torso.length - 3][0])) + 0.014 * (s.H / 1.78)) / u - z0;
  };
  const line = curve([
    [0, 0.8],
    [0.4, 0.795],
    [0.7, 0.62],
    [0.92, 0.42],
    [1.3, 0.34],
    [2.2, 0.3],
    [Math.PI, 0.28],
  ]);
  const endY = braids ? 0.16 : yShoulder - 0.52;
  hairCap(b, h, {
    NA: 32,
    ts,
    cap,
    line: (th) => line(Math.abs(th))[0],
    thick: (th, t) => {
      const a = Math.abs(th);
      const part = 1 - 0.55 * gauss(a, 0.1) * smooth(0.9, 0.2, t);
      return lerp(0.04, 0.05, smooth(0.2, 0.9, t)) * part;
    },
    hang: {
      hs: braids ? [0.5, 1] : [0.2, 0.45, 0.72, 1],
      at: (th, hh, start) => {
        const a = Math.abs(th);
        if (a < 0.7) return null;
        const sgn = th < 0 ? -1 : 1;
        // how much this column hangs: front locks are short, the back is full length
        const amount = smooth(0.7, 0.98, a);
        const backness = smooth(1.7, 2.5, a);
        if (braids) {
          // gathered towards the braid roots below the ears
          const tgt: V3 = [sgn * 0.3, 0.2, -0.16];
          const m = hh * amount;
          const p: V3 = [lerp(start[0], tgt[0] + (start[0] - tgt[0]) * 0.35, m), lerp(start[1], lerp(0.22, 0.13, backness), m), lerp(start[2], lerp(tgt[2] + (start[2] - tgt[2]) * 0.5, -0.36, backness), m)];
          return { p, w: HEAD };
        }
        const yEnd = lerp(lerp(0.3, yShoulder + 0.05, amount), endY, backness);
        const y = lerp(start[1], yEnd, hh);
        // sides fall straight and rest on the shoulders; the back follows the neck then lies on the back
        let x = start[0] * lerp(1, lerp(1.04, 0.86, backness), hh);
        let z = start[2] * lerp(1, 0.86, hh * (1 - backness)) - 0.02 * hh;
        if (y < 0.12) {
          const bz = backZ(y);
          const f = smooth(0.12, yShoulder, y) * backness;
          z = lerp(z, Math.min(z, bz), f);
          // widen over the shoulders
          x = lerp(x, x * (1 + 0.12 * smooth(yShoulder + 0.1, yShoulder - 0.3, y)), backness);
        }
        const wave = 0.012 * Math.sin(th * 9 + hh * 4) * hh;
        const p: V3 = [x + Math.sin(th) * wave, y, z + Math.cos(th) * wave];
        const hw = smooth(yShoulder - 0.05, 0.2, y);
        const cw = smooth(-0.05, yShoulder - 0.2, y);
        return { p, w: [B.head, hw, B.neck, (1 - hw) * (1 - cw), B.chest, (1 - hw) * cw] };
      },
    },
  });
  if (braids) {
    info.parentA = 'chest';
    info.chain = false;
    info.swing = 0.6;
    for (const sx of [1, -1]) {
      const bone = sx > 0 ? B.hairA : B.hairB;
      const k = s.H / 1.78;
      const yTop = 0.2;
      const yEnd = (s.chestY + 0.03 * k - s.chinY) / u;
      const chestZ = (y: number) => {
        const ya = s.chinY + y * u;
        const th = 0.62;
        return (h.torso.shirtR(th, Math.min(ya, s.torso[s.torso.length - 3][0])) * Math.cos(th) + 0.02 * k) / u - z0;
      };
      const path = (q: number): V3 => {
        const y = lerp(yTop, yEnd, q);
        const x = sx * lerp(0.31, 0.36, smooth(0, 0.5, q));
        // from behind the ear, forward over the collar bone, then down the chest
        const zs = lerp(-0.17, chestZ(Math.min(y, yShoulder - 0.08)), smooth(0.02, 0.42, q));
        return abs([x, y, zs + 0.035 * Math.sin(q * Math.PI)]);
      };
      const pv = path(0.3);
      if (sx > 0) info.pivotA = pv;
      else info.pivotB = pv;
      hairTube(
        b,
        path,
        (q) => {
          const r = 0.052 * (1 - 0.35 * q) * (1 + 0.24 * Math.abs(Math.sin(q * Math.PI * 7))) * u * (q > 0.93 ? 0.75 : 1);
          return [r, r * 0.86];
        },
        (q) => {
          const hw = 1 - smooth(0.0, 0.3, q);
          const sw = smooth(0.35, 0.8, q);
          return [B.head, hw, B.chest, (1 - hw) * (1 - sw), bone, (1 - hw) * sw];
        },
        16,
        7,
        (q) => 0.012 * u * Math.sin(q * Math.PI * 7) * sx,
      );
      tieRing(b, path(0.93), [0, -1, 0], 0.043 * u, w1(bone));
    }
  }
  if (bow) sideBow();
  return info;
}
