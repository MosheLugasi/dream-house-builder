/**
 * Chairs & stools: dining chairs (wooden frames, Windsor, bentwood, molded shells, upholstered,
 * metal, folding...), bar / counter stools and office chairs. Built from a handful of parametric
 * families (frame × back × seat × material) so every variant stays distinct but consistent.
 */
import * as THREE from 'three';
import type { ColorSlot, FurnitureCategory, FurnitureDef, SeatAnchor } from '../types';
import { D, INK_SOFT, Kit, LINE_THIN, M, PAL, ellipseShape, extrudeZ, sym, tint, type Ctx2D, type V3 } from '../kit';
import { slot } from './_parts';
import {
  PROF,
  arcZ,
  caster,
  curvedSlat,
  ellOutline,
  lerp3,
  lerpTab,
  mirX,
  pBack,
  pDots,
  pPoly,
  pStar,
  pad,
  pillowT,
  roundPoly,
  sheet,
  shellFn,
  squareLeg,
  starBase,
  trapOutline,
  turned,
  type Mat,
  type Outline,
  type ShellSpec,
} from './chair-parts';

type C = Record<string, string>;

interface Fam {
  seats: SeatAnchor[];
  build: (c: C) => THREE.Object3D;
  draw2d: (ctx: Ctx2D, c: C) => void;
}

const sit = (height: number, z = 0.02, x = 0): SeatAnchor => ({ x, z, height, facing: 0, kind: 'sit' });

const G_DINING = 'כסאות אוכל';
const G_STOOL = 'כסאות בר ושרפרפים';
const G_OFFICE = 'כסאות משרד';

/**
 * Wrap a family into a catalog item. `size` = [w, d, h]; `dz` shifts the geometry (and seats / plan)
 * along Z so the footprint is centred.
 */
function item(
  id: string,
  name: string,
  category: FurnitureCategory,
  group: string,
  tags: string[],
  colors: ColorSlot[],
  fam: Fam,
  size: [number, number, number],
  dz = 0,
): FurnitureDef {
  return {
    id,
    name,
    category,
    group,
    tags,
    colors,
    size: { w: size[0], d: size[1], h: size[2] },
    seats: fam.seats.map((s) => ({ ...s, z: +(s.z + dz).toFixed(3) })),
    build: ({ colors: c }) => {
      const g = new THREE.Group();
      const inner = fam.build(c);
      inner.position.z = dz;
      g.add(inner);
      return g;
    },
    draw2d: (ctx, c) =>
      sym(ctx, () => {
        ctx.translate(0, dz);
        fam.draw2d(ctx, c);
      }),
  };
}

type Uph = 'fabric' | 'linen' | 'velvet' | 'boucle' | 'leather';
const uphM = (u: Uph, col: string): Mat => (u === 'fabric' ? M.fabric(col) : M[u](col));
const woodM = (col: string, paint = false): Mat => (paint ? M.paint(col, 0.45) : M.wood(col));

/** Woven seat inside four round rails: paper cord or rush. Legs stop at `sh - 0.006`. */
function wovenSeat(k: Kit, fr: Mat, wrap: Mat, fx: number, fz: number, bx: number, bz: number, sh: number, rush: boolean): void {
  const yr = sh - 0.017;
  k.rod([-fx, yr, fz], [fx, yr, fz], 0.017, wrap, 0.017, 10);
  k.rod([-bx, yr, bz], [bx, yr, bz], 0.017, wrap, 0.017, 10);
  for (const s of [-1, 1]) k.rod([s * fx, yr, fz], [s * bx, yr, bz], rush ? 0.016 : 0.014, rush ? wrap : fr, rush ? 0.016 : 0.014, 10);
  pad(k, trapOutline(2 * fx, 2 * bx, fz - bz, 0.012, 0.012, 32, (fz + bz) / 2), 0.012, wrap, 0, sh - 0.021, 0, { rTop: 0.005, rBot: 0.003, crown: -0.01, rings: 3 });
  if (rush) {
    const cs: Array<[number, number]> = [
      [-fx, fz],
      [fx, fz],
      [bx, bz],
      [-bx, bz],
    ];
    const czm = (fz + bz) / 2;
    for (let i = 1; i <= 6; i++) {
      const f = (i / 7) * 0.95;
      const y = sh - 0.011 - 0.011 * (i / 6);
      const q = cs.map(([x, z]) => [x * (1 - f), z + (czm - z) * f]);
      for (let e = 0; e < 4; e++) {
        const a = q[e];
        const b = q[(e + 1) % 4];
        k.rod([a[0], y, a[1]], [b[0], y, b[1]], 0.0068, wrap, 0.0068, 6);
      }
    }
  } else {
    // paper cord: the warp strands looping over the front & back rails
    for (let i = -6; i <= 6; i++) {
      const x = (i / 6.5) * (bx - 0.02);
      k.rod([x * (fx / bx), sh - 0.004, fz - 0.004], [x, sh - 0.004, bz + 0.004], 0.0042, wrap, 0.0042, 5);
    }
  }
}

/* ============================================================================================ */
/* Wooden frame chairs: legs × back × seat                                                       */
/* ============================================================================================ */

type Back =
  | { kind: 'ladder'; n: number }
  | { kind: 'spindle'; n: number }
  | { kind: 'vslat'; n: number }
  | { kind: 'cross' }
  | { kind: 'cane' }
  | { kind: 'uph' }
  | { kind: 'board' };
type WSeat = 'wood' | 'pad' | 'uph' | 'cord' | 'rush' | 'cane';

interface WoodOpts {
  sw?: number;
  swb?: number;
  sd?: number;
  sh?: number;
  top?: number;
  rake?: number;
  leg?: 'taper' | 'square' | 'turned' | 'round';
  lr?: number;
  back: Back;
  seat: WSeat;
  uph?: Uph;
  stretch?: 'h' | 'box' | 'side' | 'none' | 'farm';
  arms?: boolean;
  paint?: boolean;
  finial?: boolean;
  R?: number;
  /** a solid curved slat at the top of spindles / slats */
  nails?: boolean;
}

function woodChair(o: WoodOpts): Fam {
  const sw = o.sw ?? 0.44;
  const swb = o.swb ?? sw - 0.06;
  const sd = o.sd ?? 0.42;
  const sh = o.sh ?? 0.46;
  const top = o.top ?? 0.86;
  const rake = o.rake ?? 0.07;
  const lr = o.lr ?? 0.017;
  const R = o.R ?? 0.5;
  const legKind = o.leg ?? 'taper';
  const zf = sd / 2 + 0.03;
  const zb = -sd / 2 + 0.03;
  const zm = (zf + zb) / 2;
  const seatT: Record<WSeat, number> = { wood: 0.03, pad: 0.066, uph: 0.08, cord: 0.006, rush: 0.006, cane: 0.026 };
  const yRail = sh - seatT[o.seat];
  const fx = sw / 2 - lr - 0.01;
  const fz = zf - lr - 0.014;
  const bx = swb / 2 - lr - 0.004;
  const bz = zb + lr + 0.004;
  const armY = 0.66;
  const footF: V3 = [fx + 0.006, 0, fz + 0.012];
  const topF: V3 = [fx, yRail, fz];
  const footB: V3 = [bx + 0.008, 0, zb - 0.03];
  const seatB: V3 = [bx, yRail, bz];
  const topB: V3 = [bx - 0.006, top, bz - rake];
  const post = (y: number): V3 => lerp3(seatB, topB, (y - yRail) / (top - yRail));
  const W = (y: number): number => post(y)[0];
  const tilt = Math.atan2(rake, top - yRail);
  const backTop = o.finial ? top - 0.07 : top;
  const sOut = trapOutline(sw, swb + 0.012, sd, 0.035, 0.02, 40, zm);

  const build = (c: C): THREE.Object3D => {
    const k = new Kit();
    const fr = woodM(c.frame, o.paint);
    const seatM = uphM(o.uph ?? 'fabric', c.seat);
    const leg = (a: V3, b: V3, upper = false): void => {
      if (legKind === 'square') squareLeg(k, a, b, upper ? lr : lr * 0.72, upper ? lr * 0.85 : lr, fr);
      else if (legKind === 'turned' && !upper) turned(k, a, b, PROF.turned(lr * 1.2), fr, 10);
      else if (legKind === 'round') turned(k, a, b, PROF.taper(lr, lr * 0.88), fr, 10);
      else turned(k, a, b, upper ? PROF.taper(lr * 0.8, lr) : PROF.taper(lr, lr * 0.62), fr, 10);
    };
    for (const s of [-1, 1]) {
      const m = (p: V3): V3 => [p[0] * s, p[1], p[2]];
      leg(m(footF), m(topF));
      if (o.arms) leg(m(topF), m([fx, armY, fz]), true);
      leg(m(footB), m(seatB));
      if (o.finial) turned(k, m(seatB), m(topB), PROF.finial(lr * 0.95, top - yRail), fr, 10);
      else if (legKind === 'square') squareLeg(k, m(seatB), m(topB), lr, lr * 0.82, fr);
      else turned(k, m(seatB), m(topB), PROF.taper(lr * 0.8, lr), fr, 10);
    }
    // stretchers
    const atF = (s: number, y: number): V3 => {
      const p = lerp3(footF, topF, y / topF[1]);
      return [p[0] * s, y, p[2]];
    };
    const atB = (s: number, y: number): V3 => {
      const p = lerp3(footB, seatB, y / yRail);
      return [p[0] * s, y, p[2]];
    };
    const str = (a: V3, b: V3): void => {
      if (legKind === 'turned') turned(k, a, b, PROF.stretcher(0.013), fr, 8);
      else if (legKind === 'square') k.beam(a, b, 0.017, 0.017, fr, 0.003);
      else k.rod(a, b, 0.0095, fr, 0.0095, 8);
    };
    const st = o.stretch ?? 'h';
    if (st !== 'none') {
      const ys = 0.16;
      for (const s of [-1, 1]) str(atF(s, ys), atB(s, ys));
      if (st === 'h') {
        const m0 = lerp3(atF(-1, ys), atB(-1, ys), 0.5);
        str(m0, mirX(m0));
      }
      if (st === 'box' || st === 'farm') str(atF(-1, 0.22), atF(1, 0.22));
      if (st === 'farm') str(atF(-1, 0.1), atF(1, 0.1));
      if (st !== 'h') str(atB(-1, 0.21), atB(1, 0.21));
    }
    // seat
    if (o.seat === 'wood' || o.seat === 'pad' || o.seat === 'uph') {
      const apH = o.seat === 'uph' ? 0.05 : 0.06;
      k.box(2 * fx, apH, 0.02, fr, 0, yRail - apH, fz);
      k.box(2 * bx, apH, 0.02, fr, 0, yRail - apH, bz);
      for (const s of [-1, 1]) k.beam([s * fx, yRail - apH / 2, fz], [s * bx, yRail - apH / 2, bz], 0.02, apH, fr);
      if (o.seat === 'wood') pad(k, sOut, 0.03, c.seat ? M.wood(c.seat) : fr, 0, yRail, 0, { rTop: 0.01, rBot: 0.004, crown: -0.008 });
      else if (o.seat === 'pad') {
        pad(k, sOut, 0.024, fr, 0, yRail, 0, { rTop: 0.006, rBot: 0.003, rings: 2 });
        pad(k, trapOutline(sw - 0.03, swb - 0.01, sd - 0.035, 0.05, 0.04, 40, zm + 0.004), 0.036, seatM, 0, yRail + 0.024, 0, { rTop: 0.016, rBot: 0.008, crown: 0.006 });
      } else {
        pad(k, sOut, 0.07, seatM, 0, yRail, 0, { rTop: 0.03, rBot: 0.01, crown: 0.01 });
        if (o.nails) {
          const n = 15;
          for (let i = 0; i <= n; i++) {
            const x = -sw / 2 + 0.03 + ((sw - 0.06) * i) / n;
            k.sphere(0.0055, M.brass(), x, yRail + 0.02, zf + 0.0005, 1, 1, 0.6, 8);
          }
        }
      }
    } else if (o.seat === 'cane') {
      k.rbox(2 * fx + 2 * lr, 0.026, 0.042, 0.005, fr, 0, yRail, fz, 1);
      k.rbox(2 * bx + 2 * lr, 0.026, 0.042, 0.005, fr, 0, yRail, bz, 1);
      for (const s of [-1, 1]) k.beam([s * fx, yRail + 0.013, fz], [s * bx, yRail + 0.013, bz], 0.042, 0.026, fr, 0.005);
      pad(k, trapOutline(2 * fx - 0.02, 2 * bx - 0.02, fz - bz - 0.02, 0.01, 0.01, 32, (fz + bz) / 2), 0.008, M.rattan(c.seat), 0, sh - 0.014, 0, {
        rTop: 0.002,
        rBot: 0.002,
        rings: 2,
      });
    } else wovenSeat(k, fr, M.wicker(c.seat), fx, fz, bx, bz, sh, o.seat === 'rush');

    // back
    const b = o.back;
    const slat = (y: number, h: number, t = 0.018, mat: Mat = fr): THREE.Mesh => curvedSlat(k, mat, y, post(y)[2], 2 * W(y + h / 2), h, t, R, tilt);
    const pt = (xf: number, y: number, inset = 0.03): V3 => {
      const Wy = W(y);
      const x = xf * (Wy - inset);
      return [x, y, post(y)[2] - arcZ(Wy, R) + arcZ(x, R)];
    };
    if (b.kind === 'ladder') {
      const yTopSlat = backTop - 0.08;
      const y0 = sh + 0.17;
      for (let i = 0; i < b.n; i++) {
        const y = b.n === 1 ? yTopSlat : y0 + ((yTopSlat - y0) * i) / (b.n - 1);
        slat(y, i === b.n - 1 ? 0.075 : 0.056, 0.016);
      }
    } else if (b.kind === 'spindle' || b.kind === 'vslat') {
      slat(backTop - 0.08, 0.08, 0.024);
      slat(sh + 0.05, 0.035, 0.02);
      const ya = sh + 0.08;
      const yb = backTop - 0.075;
      for (let i = 0; i < b.n; i++) {
        const xf = -1 + (2 * (i + 1)) / (b.n + 1);
        if (b.kind === 'spindle') turned(k, pt(xf, ya), pt(xf, yb), PROF.spindle(0.0095), fr, 8);
        else k.beam(pt(xf, ya), pt(xf, yb), 0.05, 0.012, fr, 0.003);
      }
    } else if (b.kind === 'cross') {
      slat(backTop - 0.075, 0.075, 0.022);
      slat(sh + 0.05, 0.04, 0.02);
      const ya = sh + 0.09;
      const yb = backTop - 0.07;
      const cp = pt(0, (ya + yb) / 2);
      for (const s of [-1, 1]) {
        k.beam(pt(-s, ya, 0.02), cp, 0.03, 0.013, fr, 0.003);
        k.beam(cp, pt(s, yb, 0.02), 0.03, 0.013, fr, 0.003);
      }
    } else if (b.kind === 'cane') {
      slat(backTop - 0.07, 0.07, 0.022);
      slat(sh + 0.13, 0.04, 0.02);
      slat(sh + 0.168, backTop - 0.07 - (sh + 0.17) + 0.004, 0.006, M.rattan(c.cane ?? c.seat));
    } else if (b.kind === 'board') {
      slat(backTop - 0.17, 0.17, 0.02);
    } else if (b.kind === 'uph') {
      const ya = sh + 0.1;
      const yb = backTop - 0.005;
      sheet(
        k,
        (u, v) => {
          const y = ya + v * (yb - ya);
          const Wy = W(y) + 0.004;
          const x = (2 * u - 1) * Wy;
          return [x, y, post(y)[2] - arcZ(Wy, R) + arcZ(x, R) + 0.006];
        },
        10,
        8,
        pillowT(0.055, 0.3),
        seatM,
      );
    }
    if (o.arms) {
      for (const s of [-1, 1]) {
        const p = post(armY);
        k.beam([s * fx, armY + 0.012, fz + 0.045], [s * p[0], armY + 0.012, p[2] - 0.015], 0.052, 0.024, fr, 0.008);
      }
    }
    return k.g;
  };

  const draw2d = (ctx: Ctx2D, c: C): void => {
    const sc = o.seat === 'wood' ? (c.seat ?? c.frame) : c.seat;
    pPoly(ctx, sOut, tint(sc, 0.4));
    if (o.seat === 'rush') {
      const czm = zm;
      for (const [x, z] of [
        [-fx, fz],
        [fx, fz],
        [bx, bz],
        [-bx, bz],
      ])
        D.line(ctx, x, z, 0, czm, INK_SOFT);
    }
    const p = topB;
    pBack(ctx, 2 * p[0] + 2 * lr, p[2] + lr, 2 * lr, arcZ(p[0], R) * 0.5, tint(c.frame, 0.25));
    pDots(ctx, [
      [-p[0], p[2]],
      [p[0], p[2]],
    ], lr * 1.1, tint(c.frame, 0.2));
    if (o.arms) {
      const q = post(armY);
      for (const s of [-1, 1]) D.box(ctx, s * fx - 0.026, fz + 0.045, s * q[0] + 0.026, q[2] - 0.015, 0.012, tint(c.frame, 0.25));
    }
  };
  return { seats: [sit(sh, zm)], build, draw2d };
}

/* ============================================================================================ */
/* Hoop-back chairs: Y-back (wishbone) and Scandinavian round-back armchair                       */
/* ============================================================================================ */

function hoopChair(style: 'wishbone' | 'round'): Fam {
  const sh = 0.45;
  const sw = 0.46;
  const swb = 0.4;
  const sd = 0.4;
  const lr = 0.017;
  const zf = sd / 2 + 0.03;
  const zb = -sd / 2 + 0.03;
  const zm = (zf + zb) / 2;
  const fx = sw / 2 - lr - 0.01;
  const fz = zf - lr - 0.014;
  const bx = swb / 2 - lr - 0.004;
  const bz = zb + lr + 0.004;
  const round = style === 'round';
  const hoopPts: V3[] = round
    ? [
        [-0.224, 0.646, fz + 0.02],
        [-0.236, 0.652, 0.08],
        [-0.236, 0.665, -0.07],
        [-0.19, 0.688, -0.18],
        [-0.1, 0.705, -0.235],
        [0, 0.71, -0.248],
      ]
    : [
        [-0.262, 0.676, bz + 0.09],
        [-0.232, 0.69, bz - 0.03],
        [-0.19, 0.703, bz - 0.1],
        [-0.1, 0.712, bz - 0.137],
        [0, 0.714, bz - 0.147],
      ];
  const hoop = [...hoopPts, ...hoopPts.slice(0, -1).reverse().map(mirX)];
  const sOut = trapOutline(sw, swb + 0.012, sd, 0.035, 0.02, 40, zm);
  const build = (c: C): THREE.Object3D => {
    const k = new Kit();
    const fr = M.wood(c.frame);
    const yLegTop = round ? 0.646 : sh - 0.006;
    const rearTop: V3 = round ? [0.236, 0.665, -0.07] : [0.232, 0.69, bz - 0.03];
    for (const s of [-1, 1]) {
      turned(k, [s * (fx + 0.008), 0, fz + 0.012], [s * fx, yLegTop, fz], PROF.taper(lr, lr * 0.62), fr, 10);
      // rear leg rising into the hoop
      k.tube(
        [
          [s * (bx + 0.012), 0.004, zb - 0.035],
          [s * (bx + 0.004), 0.2, zb - 0.012],
          [s * bx, sh - 0.01, bz],
          [s * (bx + 0.03), 0.58, (bz + rearTop[2]) / 2 + 0.01],
          [s * rearTop[0], rearTop[1], rearTop[2]],
        ],
        lr,
        fr,
        { seg: 22, radial: 8 },
      );
      k.rod([s * (fx + 0.004), 0.17, fz + 0.006], [s * (bx + 0.006), 0.17, zb - 0.018], 0.009, fr, 0.009, 8);
    }
    k.rod([-(fx + 0.005), 0.22, fz + 0.008], [fx + 0.005, 0.22, fz + 0.008], 0.009, fr, 0.009, 8);
    k.tube(hoop, round ? 0.017 : 0.016, fr, { seg: 48, radial: 8 });
    if (round) {
      // upholstered seat on aprons, spindles all round the back
      const yRail = sh - 0.08;
      k.box(2 * fx, 0.05, 0.02, fr, 0, yRail - 0.05, fz);
      k.box(2 * bx, 0.05, 0.02, fr, 0, yRail - 0.05, bz);
      for (const s of [-1, 1]) k.beam([s * fx, yRail - 0.025, fz], [s * bx, yRail - 0.025, bz], 0.02, 0.05, fr);
      pad(k, sOut, 0.07, M.fabric(c.seat), 0, yRail, 0, { rTop: 0.03, rBot: 0.01, crown: 0.01 });
      const curve = new THREE.CatmullRomCurve3(hoop.map((p) => new THREE.Vector3(...p)));
      const n = 9;
      for (let i = 0; i < n; i++) {
        const t = 0.25 + (0.5 * i) / (n - 1);
        const p = curve.getPoint(t);
        const xb = Math.max(-bx + 0.03, Math.min(bx - 0.03, p.x * 0.85));
        turned(k, [xb, sh - 0.01, Math.max(p.z + 0.03, bz - 0.005)], [p.x, p.y - 0.005, p.z], PROF.spindle(0.0085), fr, 8);
      }
    } else {
      wovenSeat(k, fr, M.wicker(c.seat), fx, fz, bx, bz, sh, false);
      // Y splat from the back rail up to the hoop
      const H = 0.315;
      const s = new THREE.Shape();
      s.moveTo(-0.026, 0);
      s.lineTo(0.026, 0);
      s.lineTo(0.022, H * 0.46);
      s.quadraticCurveTo(0.03, H * 0.66, 0.1, H);
      s.lineTo(0.064, H);
      s.quadraticCurveTo(0.018, H * 0.78, 0, H * 0.68);
      s.quadraticCurveTo(-0.018, H * 0.78, -0.064, H);
      s.lineTo(-0.1, H);
      s.quadraticCurveTo(-0.03, H * 0.66, -0.022, H * 0.46);
      s.closePath();
      const y = k.geo(extrudeZ(s, 0.016, 0.004, 8), fr, 0, sh - 0.022, bz - 0.006);
      y.rotation.x = -Math.atan2(0.14, 0.28);
    }
    return k.g;
  };
  const draw2d = (ctx: Ctx2D, c: C): void => {
    pPoly(ctx, sOut, tint(c.seat, 0.4));
    ctx.beginPath();
    hoop.forEach(([x, , z], i) => (i ? ctx.lineTo(x, z) : ctx.moveTo(x, z)));
    ctx.strokeStyle = tint(c.frame, -0.1);
    ctx.lineWidth = 0.034;
    ctx.stroke();
    ctx.strokeStyle = '#3a3d42';
    ctx.lineWidth = LINE_THIN;
  };
  return { seats: [sit(sh, zm)], build, draw2d };
}

/* ============================================================================================ */
/* Windsor chairs: saddle seat, splayed turned legs, H stretcher, spindles                       */
/* ============================================================================================ */

const WINDSOR_SEAT: Outline = roundPoly(
  [
    [-0.235, 0.21],
    [0.235, 0.21],
    [0.225, -0.04],
    [0.16, -0.19],
    [0, -0.225],
    [-0.16, -0.19],
    [-0.225, -0.04],
  ],
  [0.05, 0.05, 0.12, 0.1, 0.12, 0.1, 0.12],
  44,
);

function windsor(o: { comb?: boolean; n?: number; paint?: boolean }): Fam {
  const sh = 0.46;
  const y0 = sh - 0.036;
  const zSeat = (x: number): number => -0.172 + 0.075 * (x / 0.2) ** 2;
  const build = (c: C): THREE.Object3D => {
    const k = new Kit();
    const fr = woodM(c.frame, o.paint);
    const seatM = woodM(c.seat, false);
    pad(k, WINDSOR_SEAT, 0.044, seatM, 0, y0, 0, {
      rTop: 0.014,
      rBot: 0.006,
      crown: -0.014,
      top: (x, z) => 0.008 * Math.exp(-((x / 0.05) ** 2)) * Math.max(0, (z - 0.06) / 0.15),
    });
    const legs: Array<[V3, V3]> = [];
    for (const s of [-1, 1]) {
      legs.push([[s * 0.235, 0, 0.215], [s * 0.168, y0 + 0.01, 0.13]]);
      legs.push([[s * 0.225, 0, -0.2], [s * 0.158, y0 + 0.01, -0.115]]);
    }
    for (const [a, b] of legs) turned(k, a, b, PROF.windsor(0.021), fr, 10);
    const at = (i: number, y: number): V3 => lerp3(legs[i][0], legs[i][1], y / legs[i][1][1]);
    // H stretcher
    const ys = 0.17;
    const mids: V3[] = [];
    for (const s of [0, 2]) {
      turned(k, at(s, ys), at(s + 1, ys), PROF.stretcher(0.014), fr, 8);
      mids.push(lerp3(at(s, ys), at(s + 1, ys), 0.5));
    }
    turned(k, mids[0], mids[1], PROF.stretcher(0.013), fr, 8);
    const n = o.n ?? 7;
    if (!o.comb) {
      // continuous bow
      const Wb = 0.2;
      const ys0 = y0 + 0.02;
      const H = 0.95 - ys0;
      const lean = 0.08;
      const bowAt = (phi: number): V3 => {
        const x = Wb * Math.sin(phi) * (1 + 0.12 * Math.cos(phi));
        const y = ys0 + H * Math.pow(Math.max(0, Math.cos(phi)), 0.72);
        return [x, y, zSeat(Math.min(0.2, Math.abs(x))) - (lean * (y - ys0)) / H];
      };
      const pts: V3[] = [];
      for (let i = 0; i <= 18; i++) pts.push(bowAt(-Math.PI / 2 + (Math.PI * i) / 18));
      k.tube(pts, 0.0135, fr, { seg: 44, radial: 8 });
      for (let i = 0; i < n; i++) {
        const x = -0.135 + (0.27 * i) / (n - 1);
        let lo = 0;
        let hi = Math.PI / 2;
        const tx = Math.abs(x);
        for (let it = 0; it < 24; it++) {
          const mid = (lo + hi) / 2;
          if (bowAt(mid)[0] < tx) lo = mid;
          else hi = mid;
        }
        const p = bowAt(lo);
        turned(k, [x * 0.97, y0 + 0.03, zSeat(x) + 0.005], [x, p[1] + 0.004, p[2]], PROF.spindle(0.0085), fr, 8);
      }
    } else {
      // arm bow + comb crest
      const arm: V3[] = [
        [-0.258, 0.652, 0.07],
        [-0.262, 0.658, -0.04],
        [-0.215, 0.664, -0.155],
        [-0.11, 0.668, -0.225],
        [0, 0.67, -0.24],
      ];
      const armPts = [...arm, ...arm.slice(0, -1).reverse().map(mirX)];
      k.tube(armPts, 0.016, fr, { seg: 40, radial: 8 });
      for (const s of [-1, 1]) {
        k.sphere(0.02, fr, s * 0.258, 0.652, 0.075, 1, 0.75, 1.3, 10);
        turned(k, [s * 0.205, y0 + 0.03, 0.07], [s * 0.256, 0.645, 0.07], PROF.spindle(0.014), fr, 8);
        turned(k, [s * 0.2, y0 + 0.03, -0.04], [s * 0.258, 0.66, -0.04], PROF.spindle(0.0085), fr, 8);
      }
      const crestY = 0.98;
      const crestZ = -0.2;
      curvedSlat(k, fr, crestY, crestZ, 0.5, 0.085, 0.026, 0.45, 0.1);
      for (let i = 0; i < n; i++) {
        const f = -1 + (2 * i) / (n - 1);
        const xb = f * 0.13;
        const xt = f * 0.2;
        turned(k, [xb, y0 + 0.03, zSeat(xb) + 0.01], [xt, crestY + 0.01, crestZ - 0.012 + arcZ(xt, 0.45) - arcZ(0.25, 0.45)], PROF.spindle(0.0085), fr, 8);
      }
    }
    return k.g;
  };
  const draw2d = (ctx: Ctx2D, c: C): void => {
    pPoly(ctx, WINDSOR_SEAT, tint(c.seat, 0.4));
    if (o.comb) {
      pBack(ctx, 0.5, -0.19, 0.03, 0.04, tint(c.frame, 0.2));
      ctx.beginPath();
      ctx.moveTo(-0.258, 0.075);
      ctx.bezierCurveTo(-0.27, -0.12, -0.15, -0.24, 0, -0.24);
      ctx.bezierCurveTo(0.15, -0.24, 0.27, -0.12, 0.258, 0.075);
      ctx.strokeStyle = tint(c.frame, 0.1);
      ctx.lineWidth = 0.03;
      ctx.stroke();
    } else pBack(ctx, 0.43, -0.105, 0.03, 0.08, tint(c.frame, 0.2));
  };
  return { seats: [sit(sh, 0.01)], build, draw2d };
}

/* ============================================================================================ */
/* Bentwood café chairs                                                                          */
/* ============================================================================================ */

function bentwood(o: { arms?: boolean; cane?: boolean }): Fam {
  const sh = 0.46;
  const zc = 0.02;
  const build = (c: C): THREE.Object3D => {
    const k = new Kit();
    const fr = M.wood(c.frame, 0.45);
    // seat ring + panel
    k.ring(0.2, 0.017, fr, 0, sh - 0.02, zc, 40);
    if (o.cane) pad(k, ellOutline(0.192, 0.192, 32, zc), 0.01, M.rattan(c.seat), 0, sh - 0.017, 0, { rTop: 0.003, rBot: 0.002, rings: 3 });
    else pad(k, ellOutline(0.205, 0.205, 36, zc), 0.016, M.wood(c.seat), 0, sh - 0.016, 0, { rTop: 0.006, rBot: 0.003, crown: -0.004 });
    // rear legs + back hoop: one bent piece
    const side: V3[] = [
      [-0.205, 0.004, -0.225],
      [-0.178, 0.2, -0.178],
      [-0.158, sh - 0.03, -0.155],
      [-0.164, 0.6, -0.19],
      [-0.172, 0.77, -0.232],
      [-0.12, 0.865, -0.25],
      [0, 0.885, -0.256],
    ];
    k.tube([...side, ...side.slice(0, -1).reverse().map(mirX)], 0.0145, fr, { seg: 56, radial: 8 });
    const inner: V3[] = [
      [-0.128, sh - 0.012, -0.172],
      [-0.12, 0.6, -0.198],
      [-0.1, 0.69, -0.218],
      [-0.05, 0.722, -0.226],
      [0, 0.728, -0.228],
    ];
    k.tube([...inner, ...inner.slice(0, -1).reverse().map(mirX)], 0.0105, fr, { seg: 34, radial: 8 });
    for (const s of [-1, 1]) turned(k, [s * 0.2, 0, 0.215], [s * 0.15, sh - 0.025, 0.155], PROF.taper(0.016, 0.0115), fr, 10);
    // leg ring
    const ry = 0.205;
    const ring: V3[] = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ring.push([Math.cos(a) * 0.178, ry, zc - 0.003 + Math.sin(a) * 0.174]);
    }
    k.tube(ring, 0.0105, fr, { closed: true, seg: 36, radial: 6 });
    if (o.arms) {
      for (const s of [-1, 1]) {
        k.tube(
          [
            [s * 0.166, 0.66, -0.205],
            [s * 0.215, 0.665, -0.12],
            [s * 0.235, 0.655, 0.03],
            [s * 0.215, 0.6, 0.13],
            [s * 0.19, sh - 0.005, 0.165],
          ],
          0.0125,
          fr,
          { seg: 22, radial: 8 },
        );
      }
    }
    return k.g;
  };
  const draw2d = (ctx: Ctx2D, c: C): void => {
    D.circle(ctx, 0, zc, 0.217, tint(c.frame, 0.25));
    D.circle(ctx, 0, zc, 0.19, tint(c.seat, 0.4), INK_SOFT, LINE_THIN);
    pBack(ctx, 0.37, -0.18, 0.03, 0.035, tint(c.frame, 0.2));
    if (o.arms)
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * 0.166, -0.205);
        ctx.quadraticCurveTo(s * 0.25, -0.05, s * 0.19, 0.165);
        ctx.lineWidth = 0.025;
        ctx.strokeStyle = tint(c.frame, 0.1);
        ctx.stroke();
      }
  };
  return { seats: [sit(sh, zc)], build, draw2d };
}

/* ============================================================================================ */
/* Molded shell chairs                                                                           */
/* ============================================================================================ */

/** Offset a sheet surface along its (sitter-side) normal and optionally crop its (u, v) range. */
function offsetFn(fn: (u: number, v: number) => V3, d: number, u0 = 0, u1 = 1, v0 = 0, v1 = 1): (u: number, v: number) => V3 {
  return (u, v) => {
    const uu = u0 + (u1 - u0) * u;
    const vv = v0 + (v1 - v0) * v;
    const p = fn(uu, vv);
    const e = 1e-3;
    const a = fn(Math.min(1, uu + e), vv);
    const b = fn(Math.max(0, uu - e), vv);
    const c = fn(uu, Math.min(1, vv + e));
    const q = fn(uu, Math.max(0, vv - e));
    const du = new THREE.Vector3(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const dv = new THREE.Vector3(c[0] - q[0], c[1] - q[1], c[2] - q[2]);
    const n = du.cross(dv).normalize();
    return [p[0] + n.x * d, p[1] + n.y * d, p[2] + n.z * d];
  };
}

const SHELL: ShellSpec = {
  path: [
    [0.235, 0.418],
    [0.212, 0.446],
    [0.12, 0.455],
    [0.0, 0.448],
    [-0.1, 0.452],
    [-0.175, 0.48],
    [-0.215, 0.56],
    [-0.24, 0.68],
    [-0.26, 0.8],
  ],
  hw: [
    [0, 0.212],
    [0.22, 0.232],
    [0.5, 0.215],
    [0.64, 0.198],
    [0.85, 0.226],
    [1, 0.232],
  ],
  curl: [
    [0, 0.006],
    [0.2, 0.03],
    [0.45, 0.055],
    [0.62, 0.065],
    [1, 0.05],
  ],
  pow: 2.4,
};

const SHELL_ARM: ShellSpec = {
  path: [
    [0.24, 0.42],
    [0.215, 0.445],
    [0.1, 0.452],
    [-0.02, 0.447],
    [-0.12, 0.455],
    [-0.19, 0.5],
    [-0.225, 0.6],
    [-0.245, 0.7],
    [-0.255, 0.76],
  ],
  hw: [
    [0, 0.235],
    [0.5, 0.27],
    [1, 0.23],
  ],
  curl: [
    [0, 0.012],
    [0.45, 0.19],
    [1, 0.07],
  ],
  pow: 2.6,
  wrap: 0.08,
};

const STACK: ShellSpec = {
  path: [
    [0.228, 0.408],
    [0.214, 0.444],
    [0.1, 0.456],
    [-0.05, 0.45],
    [-0.15, 0.462],
    [-0.19, 0.52],
    [-0.206, 0.65],
    [-0.216, 0.78],
    [-0.222, 0.84],
  ],
  hw: [
    [0, 0.214],
    [0.3, 0.226],
    [0.55, 0.212],
    [0.75, 0.205],
    [1, 0.2],
  ],
  curl: [
    [0, 0.006],
    [0.3, 0.018],
    [0.6, 0.03],
    [1, 0.03],
  ],
  pow: 4,
};

/** Wire base: four legs, a square ring and crossed struts up to the shell mounts. */
function wireBase(k: Kit, m: Mat, mounts: V3[], feet: V3[], ringY = 0.2): void {
  const ring: V3[] = [];
  for (let i = 0; i < 4; i++) {
    k.rod(feet[i], mounts[i], 0.0055, m, 0.0055, 8);
    k.cyl(0.011, 0.012, M.rubber('#2a2a2c'), feet[i][0], 0, feet[i][2], 0.009, 10);
    ring.push(lerp3(feet[i], mounts[i], ringY / mounts[i][1]));
  }
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    k.rod(ring[i], ring[j], 0.0045, m, 0.0045, 6);
    k.rod(ring[i], mounts[j], 0.0042, m, 0.0042, 6);
    k.rod(ring[j], mounts[i], 0.0042, m, 0.0042, 6);
  }
}

function shellChair(o: { spec: ShellSpec; base: 'dowel' | 'wire' | 'metal4' | 'plastic'; pad?: Uph }): Fam {
  const fn = shellFn(o.spec);
  const sh = o.pad ? 0.475 : 0.46;
  const under = (u: number, v: number, d = 0.012): V3 => {
    const p = fn(u, v);
    return [p[0], p[1] - d, p[2]];
  };
  const build = (c: C): THREE.Object3D => {
    const k = new Kit();
    const shM = M.plastic(c.shell);
    sheet(k, fn, 16, 26, 0.011, shM);
    if (o.pad) sheet(k, offsetFn(fn, 0.017, 0.05, 0.95, 0.03, 0.97), 12, 22, pillowT(0.022, 0.3), uphM(o.pad, c.seat));
    if (o.base === 'plastic') {
      // integrated, splayed stacking legs + a hand slot in the back
      for (const s of [-1, 1]) {
        const uf = s < 0 ? 0.07 : 0.93;
        const f = under(uf, 0.05, 0.004);
        const b = under(uf, 0.46, 0.004);
        turned(k, [f[0] * 1.06, 0, f[2] + 0.03], f, PROF.taper(0.022, 0.014), shM, 12);
        turned(k, [b[0] * 1.06, 0, b[2] - 0.05], b, PROF.taper(0.022, 0.014), shM, 12);
        k.rod(lerp3([f[0] * 1.06, 0, f[2] + 0.03], f, 0.62), lerp3([b[0] * 1.06, 0, b[2] - 0.05], b, 0.62), 0.008, shM, 0.008, 8);
      }
      const p = fn(0.5, 0.93);
      const slot = k.rbox(0.11, 0.024, 0.03, 0.011, M.matte('#1c1d1f'), p[0], p[1] - 0.012, p[2]);
      slot.rotation.x = -0.08;
      return k.g;
    }
    const legTop = 0.415;
    const mounts: V3[] = [
      [-0.135, legTop, 0.11],
      [0.135, legTop, 0.11],
      [0.135, legTop, -0.1],
      [-0.135, legTop, -0.1],
    ];
    const feet: V3[] = [
      [-0.215, 0, 0.215],
      [0.215, 0, 0.215],
      [0.205, 0, -0.205],
      [-0.205, 0, -0.205],
    ];
    const metal = o.base === 'wire' ? M.metal(c.base, 0.25, 0.9) : M.blackMetal();
    // shock mounts under the shell
    for (const m of mounts) k.cyl(0.02, 0.03, M.rubber('#202022'), m[0], legTop, m[2], 0.02, 12);
    if (o.base === 'wire') wireBase(k, metal, mounts, feet);
    else if (o.base === 'dowel') {
      const wd = M.wood(c.base);
      for (let i = 0; i < 4; i++) {
        turned(k, feet[i], [mounts[i][0], legTop - 0.008, mounts[i][2]], PROF.taper(0.0165, 0.0115), wd, 12);
        k.cyl(0.0125, 0.012, metal, feet[i][0], 0, feet[i][2], 0.0115, 10);
        k.cyl(0.0185, 0.05, metal, mounts[i][0] + (feet[i][0] - mounts[i][0]) * 0.04, legTop - 0.05, mounts[i][2] + (feet[i][2] - mounts[i][2]) * 0.04, 0.0175, 10);
      }
      for (let i = 0; i < 4; i++) {
        const j = (i + 1) % 4;
        k.rod([mounts[i][0], legTop - 0.01, mounts[i][2]], [mounts[j][0], legTop - 0.01, mounts[j][2]], 0.0045, metal, 0.0045, 6);
      }
      for (const [a, b] of [
        [0, 3],
        [1, 2],
      ]) {
        const ya = 0.21;
        k.rod([mounts[a][0], legTop - 0.03, mounts[a][2]], lerp3(feet[b], mounts[b], ya / legTop), 0.0042, metal, 0.0042, 6);
        k.rod([mounts[b][0], legTop - 0.03, mounts[b][2]], lerp3(feet[a], mounts[a], ya / legTop), 0.0042, metal, 0.0042, 6);
      }
    } else {
      for (let i = 0; i < 4; i++) turned(k, feet[i], mounts[i], PROF.taper(0.012, 0.0085), metal, 10);
      k.beam([-0.135, legTop - 0.006, 0.11], [0.135, legTop - 0.006, -0.1], 0.03, 0.008, metal);
      k.beam([0.135, legTop - 0.006, 0.11], [-0.135, legTop - 0.006, -0.1], 0.03, 0.008, metal);
    }
    return k.g;
  };
  const draw2d = (ctx: Ctx2D, c: C): void => {
    // outline of the shell seen from above
    const pts: Array<[number, number]> = [];
    const N = 24;
    for (let j = 0; j <= N; j++) {
      const p = fn(1, j / N);
      pts.push([p[0], p[2]]);
    }
    for (let j = N; j >= 0; j--) {
      const p = fn(0, j / N);
      pts.push([p[0], p[2]]);
    }
    if (o.base !== 'plastic') pDots(ctx, [[-0.215, 0.215], [0.215, 0.215], [0.205, -0.205], [-0.205, -0.205]], 0.013, tint(c.base ?? '#444444', 0.2));
    pPoly(ctx, pts, tint(c.shell, 0.35));
    if (o.pad) {
      const q: Array<[number, number]> = [];
      for (let j = 0; j <= 12; j++) q.push([fn(0.9, 0.05 + j * 0.035)[0], fn(0.9, 0.05 + j * 0.035)[2]]);
      for (let j = 12; j >= 0; j--) q.push([fn(0.1, 0.05 + j * 0.035)[0], fn(0.1, 0.05 + j * 0.035)[2]]);
      pPoly(ctx, q, tint(c.seat, 0.35), INK_SOFT, LINE_THIN);
    }
    const back: Array<[number, number]> = [];
    for (let i = 0; i <= 10; i++) back.push([fn(i / 10, 0.62)[0], fn(i / 10, 0.62)[2]]);
    ctx.beginPath();
    back.forEach(([x, z], i) => (i ? ctx.lineTo(x, z) : ctx.moveTo(x, z)));
    ctx.lineWidth = LINE_THIN;
    ctx.strokeStyle = INK_SOFT;
    ctx.stroke();
  };
  return { seats: [sit(sh, 0.03)], build, draw2d };
}

/* ============================================================================================ */
/* Clear "ghost" chair with a medallion back                                                     */
/* ============================================================================================ */

const GHOST_SEAT = roundPoly(
  [
    [-0.195, -0.18],
    [0.195, -0.18],
    [0.218, 0.205],
    [-0.218, 0.205],
  ],
  [0.04, 0.04, 0.09, 0.09],
  40,
);

function ghostChair(): Fam {
  const sh = 0.46;
  const cy = 0.73;
  const cz = -0.215;
  const tilt = 0.12;
  const loop = (rx: number, ry: number): V3[] =>
    Array.from({ length: 22 }, (_, i) => {
      const a = (i / 22) * Math.PI * 2;
      const y = ry * Math.sin(a);
      return [rx * Math.cos(a), cy + y * Math.cos(tilt), cz - y * Math.sin(tilt)] as V3;
    });
  const build = (c: C): THREE.Object3D => {
    const k = new Kit();
    const gl = M.glass(c.frame, 0.55);
    pad(k, GHOST_SEAT, 0.034, gl, 0, sh - 0.034, 0, { rTop: 0.012, rBot: 0.006, crown: -0.004, rings: 3 });
    for (const s of [-1, 1]) {
      squareLeg(k, [s * 0.208, 0, 0.215], [s * 0.192, sh - 0.03, 0.17], 0.01, 0.016, gl);
      squareLeg(k, [s * 0.205, 0, -0.252], [s * 0.178, sh - 0.03, -0.162], 0.01, 0.016, gl);
      squareLeg(k, [s * 0.178, sh - 0.03, -0.162], [s * 0.155, cy - 0.1, cz + 0.012], 0.016, 0.013, gl);
    }
    k.tube(loop(0.168, 0.178), 0.016, gl, { closed: true, seg: 66, radial: 8 });
    const panel = k.geo(extrudeZ(ellipseShape(0.155, 0.165), 0.008, 0, 24), gl, 0, cy, cz);
    panel.rotation.x = -tilt;
    return k.g;
  };
  const draw2d = (ctx: Ctx2D, c: C): void => {
    const f = tint(c.frame, 0.55);
    pPoly(ctx, GHOST_SEAT, f);
    D.rr(ctx, 0, cz - 0.01, 0.37, 0.045, 0.02, f);
    pDots(ctx, [[-0.208, 0.215], [0.208, 0.215], [-0.205, -0.252], [0.205, -0.252]], 0.012, f);
  };
  return { seats: [sit(sh, 0.01)], build, draw2d };
}

/* ============================================================================================ */
/* Pressed-steel industrial café chair / stool                                                   */
/* ============================================================================================ */

function metalCafe(o: { sh: number; back: 'tall' | 'low' | 'none'; round?: boolean }): Fam {
  const sh = o.sh;
  const hs = o.round ? 0.185 : 0.19;
  const seatO: Outline = o.round ? ellOutline(0.19, 0.19, 36) : roundPoly([[-hs, -hs], [hs, -hs], [hs, hs], [-hs, hs]], 0.05, 40);
  const sp = 0.03 + 0.045 * (sh / 0.46);
  const ct = o.round ? 0.13 : 0.165;
  const build = (c: C): THREE.Object3D => {
    const k = new Kit();
    const m = M.metal(c.frame, 0.42, 0.55);
    pad(k, seatO, 0.03, m, 0, sh - 0.03, 0, { rTop: 0.012, rBot: 0.002, crown: -0.006 });
    // drain holes pattern
    for (const [x, z] of [[0, 0], [0.05, 0.05], [-0.05, 0.05], [0.05, -0.05], [-0.05, -0.05]]) k.cyl(0.006, 0.002, M.matte('#141416'), x, sh - 0.0075, z, 0.006, 8);
    const corners: V3[] = [];
    for (const [sx, sz] of [[-1, 1], [1, 1], [1, -1], [-1, -1]]) {
      const top: V3 = [sx * ct, sh - 0.028, sz * ct];
      const foot: V3 = [sx * (ct + sp), 0.004, sz * (ct + sp)];
      corners.push(top);
      // L-section leg: two thin flanges on the outer faces
      k.beam([top[0] - sx * 0.014, top[1], top[2]], [foot[0] - sx * 0.014, foot[1], foot[2]], 0.03, 0.0032, m);
      k.beam([top[0], top[1], top[2] - sz * 0.014], [foot[0], foot[1], foot[2] - sz * 0.014], 0.0032, 0.03, m);
      k.box(0.03, 0.006, 0.03, M.rubber('#1d1d1f'), foot[0] - sx * 0.012, 0, foot[2] - sz * 0.012);
    }
    const ringAt = (y: number): V3[] =>
      corners.map(([x, , z]) => {
        const f = 1 - y / sh;
        return [x + Math.sign(x) * sp * f - Math.sign(x) * 0.012, y, z + Math.sign(z) * sp * f - Math.sign(z) * 0.012] as V3;
      });
    const levels = sh > 0.55 ? [0.26, sh * 0.62] : [sh * 0.42];
    for (const y of levels) {
      const r = ringAt(y);
      for (let i = 0; i < 4; i++) k.rod(r[i], r[(i + 1) % 4], 0.0065, m, 0.0065, 8);
    }
    if (o.back !== 'none') {
      const H = o.back === 'tall' ? 0.36 : 0.17;
      const R = 0.3;
      const zb = -hs + 0.012;
      sheet(
        k,
        (u, v) => {
          const hw = lerpTab([[0, 0.1], [0.3, 0.16], [1, 0.185]], v);
          const x = (2 * u - 1) * hw;
          const y = sh - 0.012 + v * H;
          return [x, y, zb - 0.07 * v * v - 0.02 * v - arcZ(hw, R) + arcZ(x, R) + (v < 0.12 ? 0 : 0)];
        },
        10,
        12,
        0.004,
        m,
      );
      if (o.back === 'tall') {
        const yS = sh + H * 0.86;
        const zS = zb - 0.07 * 0.74 - 0.02 * 0.86 - arcZ(0.185, R) + arcZ(0, R);
        const sl = k.rbox(0.1, 0.022, 0.03, 0.011, M.matte('#151517'), 0, yS - 0.011, zS);
        sl.rotation.x = -0.3;
      }
    }
    return k.g;
  };
  const draw2d = (ctx: Ctx2D, c: C): void => {
    const f = tint(c.frame, 0.4);
    pDots(ctx, corners2d(ct + sp - 0.012), 0.017, f);
    pPoly(ctx, seatO, f);
    if (o.back !== 'none') pBack(ctx, 0.37, -hs + 0.01, 0.02, 0.05 + (o.back === 'tall' ? 0.035 : 0.01), tint(c.frame, 0.3));
  };
  return { seats: [sit(sh, 0)], build, draw2d };
}

const corners2d = (h: number): Array<[number, number]> => [
  [-h, -h],
  [h, -h],
  [h, h],
  [-h, h],
];

/* ============================================================================================ */
/* Wire-mesh chair                                                                               */
/* ============================================================================================ */

const WIRE: ShellSpec = {
  path: [
    [0.235, 0.425],
    [0.205, 0.452],
    [0.1, 0.455],
    [-0.04, 0.45],
    [-0.13, 0.465],
    [-0.19, 0.52],
    [-0.22, 0.64],
    [-0.245, 0.8],
  ],
  hw: [
    [0, 0.215],
    [0.3, 0.232],
    [0.55, 0.21],
    [0.75, 0.215],
    [1, 0.235],
  ],
  curl: [
    [0, 0.008],
    [0.3, 0.03],
    [0.55, 0.06],
    [1, 0.05],
  ],
  pow: 2.6,
};

function wireChair(): Fam {
  const fn = shellFn(WIRE);
  const sh = 0.475;
  const build = (c: C): THREE.Object3D => {
    const k = new Kit();
    const wm = M.metal(c.frame, 0.28, 0.9);
    const NU = 8;
    const NV = 12;
    for (let j = 1; j < NV; j++) {
      const pts = Array.from({ length: NU + 1 }, (_, i) => fn(i / NU, j / NV));
      k.tube(pts, 0.0026, wm, { seg: 16, radial: 3 });
    }
    for (let i = 1; i < NU; i++) {
      const pts = Array.from({ length: NV + 1 }, (_, j) => fn(i / NU, j / NV));
      k.tube(pts, 0.0026, wm, { seg: 24, radial: 3 });
    }
    const rim: V3[] = [];
    for (let j = 0; j <= NV; j++) rim.push(fn(0, j / NV));
    for (let i = 1; i <= NU; i++) rim.push(fn(i / NU, 1));
    for (let j = NV - 1; j >= 0; j--) rim.push(fn(1, j / NV));
    for (let i = NU - 1; i >= 1; i--) rim.push(fn(i / NU, 0));
    k.tube(rim, 0.0048, wm, { closed: true, seg: 72, radial: 5 });
    // seat pad
    sheet(k, offsetFn(fn, 0.016, 0.08, 0.92, 0.04, 0.52), 8, 10, pillowT(0.024, 0.3), uphM('leather', c.seat));
    const legTop = 0.43;
    wireBase(
      k,
      wm,
      [
        [-0.13, legTop, 0.12],
        [0.13, legTop, 0.12],
        [0.13, legTop, -0.1],
        [-0.13, legTop, -0.1],
      ],
      [
        [-0.21, 0.008, 0.22],
        [0.21, 0.008, 0.22],
        [0.2, 0.008, -0.2],
        [-0.2, 0.008, -0.2],
      ],
    );
    for (const x of [-0.13, 0.13]) k.rod([x, legTop, 0.12], [x, legTop, -0.1], 0.005, wm, 0.005, 6);
    return k.g;
  };
  const draw2d = (ctx: Ctx2D, c: C): void => {
    const pts: Array<[number, number]> = [];
    for (let j = 0; j <= 20; j++) pts.push([fn(1, j / 20)[0], fn(1, j / 20)[2]]);
    for (let j = 20; j >= 0; j--) pts.push([fn(0, j / 20)[0], fn(0, j / 20)[2]]);
    pPoly(ctx, pts, '#ffffff');
    for (let i = 1; i < 8; i++) {
      ctx.beginPath();
      for (let j = 0; j <= 12; j++) {
        const p = fn(i / 8, j / 12);
        if (j) ctx.lineTo(p[0], p[2]);
        else ctx.moveTo(p[0], p[2]);
      }
      ctx.lineWidth = 0.004;
      ctx.strokeStyle = INK_SOFT;
      ctx.stroke();
    }
    const q: Array<[number, number]> = [];
    for (let j = 0; j <= 8; j++) q.push([fn(0.92, 0.04 + j * 0.06)[0], fn(0.92, 0.04 + j * 0.06)[2]]);
    for (let j = 8; j >= 0; j--) q.push([fn(0.08, 0.04 + j * 0.06)[0], fn(0.08, 0.04 + j * 0.06)[2]]);
    pPoly(ctx, q, tint(c.seat, 0.35), INK_SOFT, LINE_THIN);
  };
  return { seats: [sit(sh, 0.04)], build, draw2d };
}

/* ============================================================================================ */
/* Cantilever tube chairs                                                                        */
/* ============================================================================================ */

function cantilever(o: { fill: 'cane' | 'leather' }): Fam {
  const s = 0.215;
  const ys = 0.42;
  const side: V3[] = [
    [-s, 0.83, -0.215],
    [-s, 0.62, -0.2],
    [-s, 0.49, -0.19],
    [-s, ys + 0.006, -0.155],
    [-s, ys, -0.1],
    [-s, ys, 0.12],
    [-s, ys - 0.01, 0.2],
    [-s, ys - 0.06, 0.243],
    [-s, 0.3, 0.26],
    [-s, 0.16, 0.26],
    [-s, 0.055, 0.245],
    [-s, 0.0125, 0.2],
    [-s, 0.0125, 0.1],
    [-s, 0.0125, -0.14],
    [-s * 0.93, 0.0125, -0.205],
    [-s * 0.6, 0.0125, -0.228],
    [0, 0.0125, -0.232],
  ];
  const frame = [...side, ...side.slice(0, -1).reverse().map(mirX)];
  const sz0 = -0.2;
  const sz1 = 0.22;
  const sw = 0.47;
  const sh = ys + 0.012 + (o.fill === 'cane' ? 0.026 : 0.045);
  const build = (c: C): THREE.Object3D => {
    const k = new Kit();
    k.tube(frame, 0.0115, M.chrome(), { seg: 120, radial: 8 });
    const y0 = ys + 0.0115;
    const zc = (sz0 + sz1) / 2;
    const backZ = (y: number): number => lerpTab([[0.49, -0.19], [0.62, -0.2], [0.83, -0.215]], y) + 0.022;
    if (o.fill === 'cane') {
      const fr = M.wood(c.frame);
      const bw = 0.036;
      k.rbox(sw, 0.026, bw, 0.009, fr, 0, y0, sz1 - bw / 2, 1);
      k.rbox(sw, 0.026, bw, 0.009, fr, 0, y0, sz0 + bw / 2, 1);
      for (const x of [-1, 1]) k.rbox(bw, 0.026, sz1 - sz0 - 0.002, 0.009, fr, x * (sw / 2 - bw / 2), y0, zc, 1);
      pad(k, trapOutline(sw - 0.05, sw - 0.05, sz1 - sz0 - 0.05, 0.01, 0.01, 28, zc), 0.006, M.rattan(c.seat), 0, y0 + 0.012, 0, { rTop: 0.002, rBot: 0.002, rings: 2 });
      const tilt = 0.07;
      curvedSlat(k, fr, 0.765, backZ(0.765), sw, 0.04, 0.02, 0.45, tilt);
      curvedSlat(k, fr, 0.6, backZ(0.6), sw, 0.036, 0.02, 0.45, tilt);
      curvedSlat(k, M.rattan(c.seat), 0.632, backZ(0.632), sw - 0.04, 0.136, 0.005, 0.45, tilt);
      for (const x of [-1, 1]) {
        const R = 0.45;
        const zz = backZ(0.6) - arcZ(sw / 2, R) + arcZ(sw / 2 - 0.018, R);
        k.beam([x * (sw / 2 - 0.018), 0.6, zz + 0.005], [x * (sw / 2 - 0.018), 0.805, zz - 0.009], 0.036, 0.02, fr, 0.006);
      }
    } else {
      const lea = M.leather(c.seat);
      pad(k, roundPoly([[-sw / 2, sz0], [sw / 2, sz0], [sw / 2, sz1], [-sw / 2, sz1]], 0.05, 40), 0.045, lea, 0, y0, 0, { rTop: 0.016, rBot: 0.006, crown: 0.008 });
      const R = 0.45;
      sheet(
        k,
        (u, v) => {
          const y = 0.585 + v * 0.235;
          const x = (2 * u - 1) * (sw / 2);
          return [x, y, backZ(y) - arcZ(sw / 2, R) + arcZ(x, R)];
        },
        12,
        8,
        pillowT(0.04, 0.35),
        lea,
      );
    }
    return k.g;
  };
  const draw2d = (ctx: Ctx2D, c: C): void => {
    D.line(ctx, -s, 0.26, -s, -0.232, INK_SOFT, 0.023);
    D.line(ctx, s, 0.26, s, -0.232, INK_SOFT, 0.023);
    D.line(ctx, -s, -0.232, s, -0.232, INK_SOFT, 0.023);
    D.rr(ctx, 0, (sz0 + sz1) / 2, sw, sz1 - sz0, 0.03, tint(o.fill === 'cane' ? c.frame : c.seat, 0.35));
    if (o.fill === 'cane') D.rr(ctx, 0, (sz0 + sz1) / 2, sw - 0.07, sz1 - sz0 - 0.07, 0.01, tint(c.seat, 0.4), INK_SOFT, LINE_THIN);
    pBack(ctx, sw, -0.195, 0.03, 0.035, tint(o.fill === 'cane' ? c.frame : c.seat, 0.25));
  };
  return { seats: [sit(sh, 0.01)], build, draw2d };
}

/* ============================================================================================ */
/* School chair, folding chair, director's chair, leather sling chair                            */
/* ============================================================================================ */

function schoolChair(): Fam {
  const build = (c: C): THREE.Object3D => {
    const k = new Kit();
    const fm = M.metal(c.frame, 0.4, 0.45);
    const ply = M.wood(c.seat, 0.5);
    for (const s of [-1, 1]) {
      const x = s * 0.2;
      k.tube(
        [
          [x, 0.012, 0.215],
          [x, 0.3, 0.206],
          [x, 0.405, 0.19],
          [x, 0.42, 0.155],
          [x, 0.42, -0.12],
          [x, 0.405, -0.15],
          [x, 0.3, -0.175],
          [x, 0.012, -0.205],
        ],
        0.011,
        fm,
        { seg: 44, radial: 8 },
      );
      k.tube(
        [
          [x, 0.3, -0.176],
          [x, 0.42, -0.19],
          [x, 0.56, -0.212],
          [x * 0.99, 0.8, -0.245],
        ],
        0.011,
        fm,
        { seg: 22, radial: 8 },
      );
      for (const z of [0.215, -0.205]) k.cyl(0.0125, 0.02, M.rubber('#222'), x, 0, z, 0.0115, 10);
    }
    k.rod([-0.2, 0.41, 0.14], [0.2, 0.41, 0.14], 0.009, fm, 0.009, 8);
    k.rod([-0.2, 0.41, -0.11], [0.2, 0.41, -0.11], 0.009, fm, 0.009, 8);
    sheet(
      k,
      (u, v) => {
        const z = 0.228 - v * 0.43;
        let y = 0.448 - 0.011 * Math.sin(Math.PI * u) * Math.sin(Math.PI * Math.min(1, v * 1.1));
        if (z > 0.185) y -= (z - 0.185) * 0.7;
        if (v > 0.88) y += (v - 0.88) * 0.1;
        return [(2 * u - 1) * 0.218, y, z];
      },
      10,
      12,
      0.012,
      ply,
    );
    const R = 0.42;
    const bz = (y: number): number => -0.212 - (0.033 * (y - 0.56)) / 0.24;
    sheet(
      k,
      (u, v) => {
        const y = 0.6 + v * 0.19;
        const x = (2 * u - 1) * 0.215;
        return [x, y, bz(y) + 0.018 - arcZ(0.215, R) + arcZ(x, R)];
      },
      12,
      6,
      0.011,
      ply,
    );
    for (const s of [-1, 1]) for (const y of [0.65, 0.75]) k.sphere(0.006, M.chrome(), s * 0.2, y, bz(y) + 0.018 - arcZ(0.215, R) + arcZ(0.2, R) + 0.006, 1, 1, 0.6, 8);
    return k.g;
  };
  const draw2d = (ctx: Ctx2D, c: C): void => {
    D.line(ctx, -0.2, 0.215, -0.2, -0.205, INK_SOFT, 0.022);
    D.line(ctx, 0.2, 0.215, 0.2, -0.205, INK_SOFT, 0.022);
    D.rr(ctx, 0, 0.013, 0.436, 0.43, 0.04, tint(c.seat, 0.35));
    pBack(ctx, 0.43, -0.21, 0.02, 0.03, tint(c.seat, 0.2));
  };
  return { seats: [sit(0.46, 0.02)], build, draw2d };
}

function foldingChair(): Fam {
  const aBot: V3 = [0.205, 0.008, 0.15];
  const aTop: V3 = [0.205, 0.84, -0.2];
  const aAt = (y: number): number => aBot[2] + ((aTop[2] - aBot[2]) * (y - aBot[1])) / (aTop[1] - aBot[1]);
  const tilt = Math.atan2(aBot[2] - aTop[2], aTop[1] - aBot[1]);
  const build = (c: C): THREE.Object3D => {
    const k = new Kit();
    const fr = M.wood(c.frame);
    const sl = M.wood(c.seat);
    for (const s of [-1, 1]) {
      k.beam([s * aBot[0], aBot[1], aBot[2]], [s * aTop[0], aTop[1], aTop[2]], 0.021, 0.034, fr, 0.005);
      k.beam([s * 0.177, 0.008, -0.215], [s * 0.177, 0.43, 0.195], 0.02, 0.032, fr, 0.005);
      k.beam([s * 0.158, 0.425, 0.215], [s * 0.158, 0.425, -0.195], 0.018, 0.03, fr, 0.004);
      // pivot bolts
      k.rod([s * 0.218, 0.269, 0.038], [s * 0.165, 0.269, 0.038], 0.007, M.brass(), 0.007, 10);
      k.rod([s * 0.218, 0.43, aAt(0.43)], [s * 0.15, 0.43, aAt(0.43)], 0.006, M.brass(), 0.006, 10);
    }
    k.rod([-0.205, 0.09, aAt(0.09)], [0.205, 0.09, aAt(0.09)], 0.011, fr, 0.011, 10);
    k.rod([-0.177, 0.09, -0.215 + 0.98 * 0.082], [0.177, 0.09, -0.215 + 0.98 * 0.082], 0.011, fr, 0.011, 10);
    const n = 6;
    for (let i = 0; i < n; i++) {
      const z = 0.19 - (0.38 * i) / (n - 1);
      k.rbox(0.37, 0.016, 0.052, 0.005, sl, 0, 0.44, z, 1);
    }
    curvedSlat(k, fr, 0.6, aAt(0.6), 0.44, 0.085, 0.016, 0.6, tilt);
    curvedSlat(k, fr, 0.735, aAt(0.735), 0.44, 0.065, 0.016, 0.6, tilt);
    return k.g;
  };
  const draw2d = (ctx: Ctx2D, c: C): void => {
    for (const s of [-1, 1]) D.line(ctx, s * 0.205, 0.15, s * 0.205, -0.2, INK_SOFT, 0.022);
    for (let i = 0; i < 6; i++) D.rr(ctx, 0, 0.19 - (0.38 * i) / 5, 0.37, 0.052, 0.006, tint(c.seat, 0.35), undefined, LINE_THIN);
    pBack(ctx, 0.44, -0.16, 0.02, 0.025, tint(c.frame, 0.2));
  };
  return { seats: [sit(0.456, 0.0)], build, draw2d };
}

function directorChair(): Fam {
  const x = 0.255;
  const build = (c: C): THREE.Object3D => {
    const k = new Kit();
    const fr = M.wood(c.frame);
    const cv = M.linen(c.seat);
    const rearZ = (y: number): number => -0.215 - (0.02 * y) / 0.9;
    for (const s of [-1, 1]) {
      k.rbox(0.034, 0.66, 0.034, 0.005, fr, s * x, 0, 0.21, 1);
      k.beam([s * x, 0, -0.215], [s * x, 0.9, rearZ(0.9)], 0.034, 0.034, fr, 0.005);
      k.rbox(0.062, 0.024, 0.56, 0.009, fr, s * x, 0.66, -0.0, 1);
      k.rod([s * (x - 0.022), 0.43, 0.215], [s * (x - 0.022), 0.43, -0.215], 0.014, fr, 0.014, 10);
      k.box(0.026, 0.03, 0.4, fr, s * x, 0.07, -0.003);
      // canvas wrapped round the seat rails and the back posts
      k.rod([s * (x - 0.022), 0.43, 0.19], [s * (x - 0.022), 0.43, -0.19], 0.02, cv, 0.02, 10);
      k.rbox(0.046, 0.21, 0.046, 0.008, cv, s * x, 0.675, rearZ(0.78), 1);
    }
    // folding X under the seat, front and back
    for (const z of [0.188, -0.19]) {
      for (const s of [-1, 1]) k.beam([s * (x - 0.02), 0.05, z], [-s * (x - 0.02), 0.41, z], 0.026, 0.016, fr, 0.004);
      k.rod([0, 0.23, z - 0.012], [0, 0.23, z + 0.012], 0.007, M.brass(), 0.007, 10);
    }
    sheet(k, (u, v) => [-(x - 0.022) + 2 * (x - 0.022) * u, 0.445 - 0.024 * Math.pow(Math.sin(Math.PI * u), 0.8), 0.19 - 0.38 * v], 10, 6, 0.004, cv);
    sheet(k, (u, v) => {
      const y = 0.675 + v * 0.21;
      return [-x + 2 * x * u, y, rearZ(y) - 0.024 * Math.pow(Math.sin(Math.PI * u), 0.8)];
    }, 10, 4, 0.004, cv);
    return k.g;
  };
  const draw2d = (ctx: Ctx2D, c: C): void => {
    D.rr(ctx, 0, 0, 2 * x - 0.06, 0.4, 0.01, tint(c.seat, 0.35));
    for (const s of [-1, 1]) D.rr(ctx, s * x, 0, 0.062, 0.56, 0.012, tint(c.frame, 0.25));
    D.rr(ctx, 0, -0.232, 2 * x, 0.02, 0.005, tint(c.seat, 0.15));
  };
  return { seats: [sit(0.43, 0)], build, draw2d };
}

function slingChair(): Fam {
  const xs = 0.22;
  const post = (y: number): number => lerpTab([[0.47, -0.2], [0.6, -0.225], [0.84, -0.27]], y);
  const build = (c: C): THREE.Object3D => {
    const k = new Kit();
    const fm = M.blackMetal();
    const lea = M.leather(c.seat);
    for (const s of [-1, 1]) {
      const x = s * xs;
      k.tube(
        [
          [x, 0.012, 0.205],
          [x, 0.4, 0.205],
          [x, 0.44, 0.175],
          [x, 0.445, 0.1],
          [x, 0.445, -0.14],
          [x, 0.47, -0.2],
          [x, 0.6, -0.225],
          [x, 0.84, -0.27],
        ],
        0.0105,
        fm,
        { seg: 50, radial: 8 },
      );
      k.rod([x, 0.004, -0.215], [x, 0.445, -0.15], 0.0105, fm, 0.0105, 8);
      k.cyl(0.012, 0.012, M.rubber('#202022'), x, 0, 0.205, 0.0115, 10);
      // leather wrapped round the side rails and the posts
      k.rod([x, 0.445, 0.17], [x, 0.445, -0.14], 0.019, lea, 0.019, 10);
      k.rod([x, 0.585, post(0.585)], [x, 0.82, post(0.82)], 0.019, lea, 0.019, 10);
    }
    for (const [y, z] of [
      [0.12, 0.205],
      [0.12, -0.2],
    ])
      k.rod([-xs, y, z], [xs, y, z], 0.008, fm, 0.008, 8);
    k.rod([-xs, 0.84, -0.27], [xs, 0.84, -0.27], 0.0085, fm, 0.0085, 8);
    sheet(k, (u, v) => [(2 * u - 1) * (xs - 0.012), 0.447 - 0.042 * Math.pow(Math.sin(Math.PI * u), 0.75), 0.165 - v * 0.3], 10, 6, 0.006, lea);
    sheet(k, (u, v) => {
      const y = 0.59 + v * 0.225;
      return [(2 * u - 1) * (xs - 0.012), y, post(y) - 0.03 * Math.pow(Math.sin(Math.PI * u), 0.75)];
    }, 10, 4, 0.006, lea);
    return k.g;
  };
  const draw2d = (ctx: Ctx2D, c: C): void => {
    for (const s of [-1, 1]) D.line(ctx, s * xs, 0.205, s * xs, -0.27, INK_SOFT, 0.022);
    D.rr(ctx, 0, 0.012, 2 * xs, 0.32, 0.02, tint(c.seat, 0.35));
    pBack(ctx, 2 * xs, -0.235, 0.02, 0.02, tint(c.seat, 0.2));
  };
  return { seats: [sit(0.43, 0.01)], build, draw2d };
}

/* ============================================================================================ */
/* Upholstered chairs: Parsons, channel-tufted tub, bouclé tub, dining armchair, benches         */
/* ============================================================================================ */

function parsons(o: { uph: Uph; skirt?: boolean; legs?: 'wood' | 'brass' }): Fam {
  const sw = 0.47;
  const z0 = -0.225;
  const z1 = 0.275;
  const seatO = roundPoly([[-sw / 2, z0], [sw / 2, z0], [sw / 2, z1], [-sw / 2, z1]], 0.03, 44);
  const sh = 0.46;
  const build = (c: C): THREE.Object3D => {
    const k = new Kit();
    const um = uphM(o.uph, c.seat);
    const lm = o.legs === 'brass' ? M.brass() : M.wood(c.frame);
    pad(k, seatO, 0.12, um, 0, sh - 0.128, 0, { rTop: 0.02, rBot: 0.012, crown: 0.008 });
    const rim = seatO.map(([x, z]) => [x * 0.985, sh - 0.012, 0.025 + (z - 0.025) * 0.985] as V3);
    k.tube(rim, 0.0045, uphM(o.uph, c.seat), { closed: true, seg: 64, radial: 5 });
    sheet(
      k,
      (u, v) => {
        const y = sh - 0.11 + v * 0.53;
        const x = (2 * u - 1) * (sw / 2 - 0.002);
        return [x, y, -0.19 - 0.075 * v * v - arcZ(sw / 2, 0.9) + arcZ(x, 0.9)];
      },
      10,
      12,
      pillowT(0.075, 0.5, 0.28),
      um,
    );
    for (const s of [-1, 1]) {
      squareLeg(k, [s * 0.205, 0, 0.245], [s * 0.2, sh - 0.125, 0.238], 0.012, 0.018, lm);
      squareLeg(k, [s * 0.205, 0, -0.235], [s * 0.2, sh - 0.125, -0.2], 0.012, 0.018, lm);
    }
    if (o.skirt) {
      const yb = 0.045;
      const hh = sh - 0.125 - yb + 0.01;
      k.rbox(sw + 0.006, hh, 0.012, 0.004, um, 0, yb, z1 - 0.003, 1);
      for (const s of [-1, 1]) k.rbox(0.012, hh, z1 - z0 - 0.02, 0.004, um, s * (sw / 2 - 0.003), yb, 0.025 + 0.004, 1);
      k.rbox(sw - 0.01, hh + 0.04, 0.012, 0.004, um, 0, yb, -0.2, 1);
      // inverted pleats at the front corners
      for (const s of [-1, 1]) k.box(0.004, hh, 0.004, M.matte('#2a2a2a'), s * (sw / 2 - 0.004), yb, z1 - 0.004);
    }
    return k.g;
  };
  const draw2d = (ctx: Ctx2D, c: C): void => {
    pPoly(ctx, seatO, tint(c.seat, 0.4));
    D.rr(ctx, 0, -0.21, sw, 0.08, 0.025, tint(c.seat, 0.2));
  };
  return { seats: [sit(sh, 0.04)], build, draw2d };
}

interface TubSpec {
  /** half angle of the back around the seat (radians from the back centre) */
  a: number;
  rx: number;
  rz: number;
  zc: number;
  y0: number;
  /** top height at the back centre and at the front tips */
  yBack: number;
  yTip: number;
  /** outward lean of the back (radius growth at the top) */
  flare: number;
}

const tubPoint = (t: TubSpec, th: number, v: number, dr = 0): V3 => {
  const f = Math.abs(th) / t.a;
  const top = t.yTip + (t.yBack - t.yTip) * Math.pow(Math.max(0, 1 - f * f), 1.2);
  const y = t.y0 + v * (top - t.y0);
  const g = 1 + t.flare * v;
  return [(t.rx * g + dr) * Math.sin(th), y, t.zc - (t.rz * g + dr) * Math.cos(th)];
};

/** Upholstered tub back: one pillowy sheet, or N vertical channels plus an outer shell. */
function tubBack(k: Kit, t: TubSpec, m: Mat, thick: number, channels = 0, outer?: Mat): void {
  const roundTop = (v: number): number => (v > 0.8 ? 0.35 + 0.65 * Math.pow(Math.cos(((v - 0.8) / 0.2) * (Math.PI / 2)), 0.6) : 1);
  if (channels > 0) {
    for (let i = 0; i < channels; i++) {
      const a0 = -t.a + (2 * t.a * i) / channels;
      const a1 = a0 + (2 * t.a) / channels;
      sheet(k, (u, v) => tubPoint(t, a0 + (a1 - a0) * u, v), 4, 12, (u, v) => thick * (0.3 + 0.7 * Math.pow(Math.sin(Math.PI * u), 0.5)) * roundTop(v), m);
    }
    sheet(k, (u, v) => tubPoint(t, -t.a * 1.01 + 2.02 * t.a * u, v * 0.985, thick * 0.55 + 0.012), 20, 8, pillowT(0.022, 0.4), outer ?? m);
  } else {
    sheet(k, (u, v) => tubPoint(t, -t.a + 2 * t.a * u, v), t.a > 1.2 ? 22 : 16, t.yBack - t.y0 > 0.3 ? 10 : 7, (u, v) => thick * (0.35 + 0.65 * Math.pow(Math.sin(Math.PI * u), 0.35)) * roundTop(v), m);
  }
}

function tubChair(o: { tub: TubSpec; uph: Uph; channels?: number; legs: 'brass' | 'black' | 'wood' | 'turned'; seatW: number; seatD: number; buttons?: boolean; sh?: number }): Fam {
  const sh = o.sh ?? 0.47;
  const zc = o.tub.zc;
  const seatO = roundPoly(
    [
      [-o.seatW / 2 + 0.03, zc - o.seatD / 2],
      [o.seatW / 2 - 0.03, zc - o.seatD / 2],
      [o.seatW / 2, zc + o.seatD / 2],
      [-o.seatW / 2, zc + o.seatD / 2],
    ],
    [0.14, 0.14, 0.09, 0.09],
    44,
  );
  const build = (c: C): THREE.Object3D => {
    const k = new Kit();
    const um = uphM(o.uph, c.seat);
    pad(k, seatO, 0.1, um, 0, sh - 0.112, 0, { rTop: 0.035, rBot: 0.015, crown: 0.012 });
    tubBack(k, o.tub, um, o.channels ? 0.075 : 0.085, o.channels ?? 0);
    const lm = o.legs === 'brass' ? M.brass() : o.legs === 'black' ? M.blackMetal() : M.wood(c.frame);
    const yT = sh - 0.11;
    const lx = o.seatW / 2 - 0.06;
    const lzf = zc + o.seatD / 2 - 0.06;
    const lzb = zc - o.seatD / 2 + 0.06;
    for (const s of [-1, 1]) {
      for (const [z, dz] of [
        [lzf, 0.03],
        [lzb, -0.05],
      ]) {
        const foot: V3 = [s * (lx + 0.03), 0, z + dz];
        const topP: V3 = [s * lx, yT + 0.005, z];
        if (o.legs === 'turned') turned(k, foot, topP, PROF.turned(0.022), lm, 12);
        else if (o.legs === 'wood') turned(k, foot, topP, PROF.taper(0.02, 0.012), lm, 12);
        else turned(k, foot, topP, PROF.taper(0.011, 0.007), lm, 10);
        if (o.legs === 'wood') turned(k, foot, lerp3(foot, topP, 0.12), PROF.taper(0.0128, 0.012), M.brass(), 12);
      }
    }
    if (o.buttons) {
      for (const v of [0.42, 0.72])
        for (let i = -2; i <= 2; i++) {
          const p = tubPoint(o.tub, (i / 2.6) * o.tub.a * (v > 0.6 ? 0.85 : 1), v, -0.085 * 0.5 + 0.004);
          k.sphere(0.008, um, p[0], p[1], p[2], 1, 1, 1, 8);
        }
    }
    return k.g;
  };
  const draw2d = (ctx: Ctx2D, c: C): void => {
    pPoly(ctx, seatO, tint(c.seat, 0.4));
    const t = o.tub;
    const th = o.channels ? 0.075 : 0.085;
    const outer: Array<[number, number]> = [];
    const inner: Array<[number, number]> = [];
    for (let i = 0; i <= 24; i++) {
      const a = -t.a + (2 * t.a * i) / 24;
      const po = tubPoint(t, a, 0.9, th / 2);
      const pi = tubPoint(t, a, 0.9, -th / 2);
      outer.push([po[0], po[2]]);
      inner.push([pi[0], pi[2]]);
    }
    pPoly(ctx, [...outer, ...inner.reverse()], tint(c.seat, 0.22));
    if (o.channels) {
      for (let i = 1; i < o.channels; i++) {
        const a = -t.a + (2 * t.a * i) / o.channels;
        const p0 = tubPoint(t, a, 0.9, th / 2);
        const p1 = tubPoint(t, a, 0.9, -th / 2);
        D.line(ctx, p0[0], p0[2], p1[0], p1[2], INK_SOFT);
      }
    }
  };
  return { seats: [sit(sh, zc + 0.03)], build, draw2d };
}

function bench(o: { uph?: Uph; w: number }): Fam {
  const w = o.w;
  const d = 0.36;
  const top = roundPoly([[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]], 0.025, 48);
  const sh = 0.455;
  const build = (c: C): THREE.Object3D => {
    const k = new Kit();
    const fr = M.wood(c.frame);
    if (o.uph) {
      const y0 = sh - 0.09;
      k.rbox(w - 0.02, 0.06, d - 0.02, 0.008, fr, 0, y0 - 0.05, 0, 1);
      pad(k, top, 0.08, uphM(o.uph, c.seat), 0, y0, 0, { rTop: 0.03, rBot: 0.01, crown: 0.01 });
      for (const sx of [-1, 1])
        for (const sz of [-1, 1]) turned(k, [sx * (w / 2 - 0.04), 0, sz * (d / 2 - 0.04)], [sx * (w / 2 - 0.045), y0 - 0.05, sz * (d / 2 - 0.045)], PROF.turned(0.024), fr, 12);
      for (let i = 1; i < 4; i++) k.sphere(0.009, uphM(o.uph, c.seat), -w / 2 + (w * i) / 4, sh + 0.005, 0, 1, 0.55, 1, 10);
    } else {
      pad(k, top, 0.045, fr, 0, sh - 0.045, 0, { rTop: 0.012, rBot: 0.004, crown: -0.004 });
      const legs: Array<[V3, V3]> = [];
      for (const sx of [-1, 1])
        for (const sz of [-1, 1]) {
          const tp: V3 = [sx * (w / 2 - 0.12), sh - 0.044, sz * 0.1];
          const ft: V3 = [sx * (w / 2 - 0.07), 0, sz * 0.155];
          legs.push([ft, tp]);
          turned(k, ft, tp, PROF.taper(0.022, 0.015), fr, 12);
        }
      const at = (i: number, y: number): V3 => lerp3(legs[i][0], legs[i][1], y / legs[i][1][1]);
      k.rod(at(0, 0.15), at(1, 0.15), 0.011, fr, 0.011, 8);
      k.rod(at(2, 0.15), at(3, 0.15), 0.011, fr, 0.011, 8);
      k.rod(lerp3(at(0, 0.15), at(1, 0.15), 0.5), lerp3(at(2, 0.15), at(3, 0.15), 0.5), 0.012, fr, 0.012, 8);
      k.box(w - 0.3, 0.05, 0.02, fr, 0, sh - 0.095, 0);
    }
    return k.g;
  };
  const draw2d = (ctx: Ctx2D, c: C): void => {
    pPoly(ctx, top, tint(o.uph ? c.seat : c.frame, 0.4));
    if (!o.uph) for (const x of [-0.25, 0, 0.25]) D.line(ctx, x * w, -d / 2 + 0.03, x * w, d / 2 - 0.03, INK_SOFT);
    else for (let i = 1; i < 4; i++) D.circle(ctx, -w / 2 + (w * i) / 4, 0, 0.012, null, INK_SOFT, LINE_THIN);
  };
  return { seats: [sit(sh, 0, -w / 4), sit(sh, 0, w / 4)], build, draw2d };
}

/* ============================================================================================ */
/* Bar & counter stools                                                                          */
/* ============================================================================================ */

const SADDLE: Outline = roundPoly(
  [
    [-0.2, -0.15],
    [0.2, -0.15],
    [0.13, 0.15],
    [0, 0.185],
    [-0.13, 0.15],
  ],
  [0.12, 0.12, 0.1, 0.07, 0.1],
  44,
);
const SQ38: Outline = roundPoly(corners2d(0.19), 0.055, 44);
const TRACTOR: Outline = roundPoly(
  [
    [-0.21, -0.14],
    [0.21, -0.14],
    [0.17, 0.08],
    [0.07, 0.19],
    [-0.07, 0.19],
    [-0.17, 0.08],
  ],
  [0.1, 0.1, 0.08, 0.06, 0.06, 0.08],
  44,
);

interface StoolOpts {
  sh: number;
  seat: 'wood' | 'cushion' | 'saddle' | 'tufted' | 'rattan' | 'bucket' | 'tractor';
  base: 'wood4' | 'metal4' | 'brass4' | 'square' | 'pedestal' | 'tripod';
  back?: 'spindle' | 'tub' | 'low' | 'rattan';
  foot?: 'bars' | 'ring' | 'h';
  uph?: Uph;
  turnedLegs?: boolean;
}

function stool(o: StoolOpts): Fam {
  const sh = o.sh;
  const seatO: Outline = o.seat === 'saddle' ? SADDLE : o.seat === 'tufted' ? SQ38 : o.seat === 'tractor' ? TRACTOR : ellOutline(o.seat === 'wood' ? 0.18 : 0.19, o.seat === 'wood' ? 0.18 : 0.19, 36);
  const seatT: Record<StoolOpts['seat'], number> = { wood: 0.036, cushion: 0.09, saddle: 0.045, tufted: 0.1, rattan: 0.075, bucket: 0.07, tractor: 0.035 };
  const yU = sh - seatT[o.seat];
  const yF = Math.max(0.17, sh - 0.47);
  const four = o.base === 'wood4' || o.base === 'metal4' || o.base === 'brass4' || o.base === 'square';
  const tp = o.base === 'square' ? 0.155 : o.base === 'wood4' ? 0.125 : 0.13;
  const fp = o.base === 'square' ? 0.17 : o.base === 'wood4' ? tp + 0.035 + 0.06 * (sh / 0.75) : tp + 0.02 + 0.045 * (sh / 0.75);
  const feet2d: Array<[number, number]> = four
    ? corners2d(fp)
    : o.base === 'tripod'
      ? [0, 1, 2].map((i) => [Math.cos(Math.PI / 2 + (i * 2 * Math.PI) / 3) * 0.23, Math.sin(Math.PI / 2 + (i * 2 * Math.PI) / 3) * 0.23] as [number, number])
      : [];
  const tub: TubSpec | null =
    o.back === 'tub'
      ? { a: 1.3, rx: 0.2, rz: 0.2, zc: 0, y0: sh - 0.035, yBack: sh + 0.24, yTip: sh + 0.11, flare: 0.08 }
      : o.back === 'low'
        ? { a: 1.05, rx: 0.2, rz: 0.2, zc: 0, y0: sh - 0.035, yBack: sh + 0.17, yTip: sh + 0.1, flare: 0.05 }
        : null;
  const bucketFn = shellFn({
    path: [
      [0.175, sh - 0.018],
      [0.12, sh - 0.002],
      [0.0, sh],
      [-0.12, sh + 0.008],
      [-0.175, sh + 0.06],
      [-0.2, sh + 0.17],
      [-0.215, sh + 0.26],
    ],
    hw: [
      [0, 0.18],
      [0.4, 0.2],
      [1, 0.2],
    ],
    curl: [
      [0, 0.01],
      [0.4, 0.04],
      [1, 0.07],
    ],
    pow: 2.4,
  });
  const build = (c: C): THREE.Object3D => {
    const k = new Kit();
    const fr =
      o.base === 'wood4' || o.base === 'tripod'
        ? M.wood(c.frame)
        : o.base === 'brass4'
          ? M.brass()
          : o.base === 'square' || o.base === 'pedestal'
            ? M.chrome()
            : M.metal(c.frame, 0.45, 0.7);
    const um = uphM(o.uph ?? 'leather', c.seat);
    // ---- seat
    if (o.seat === 'wood') pad(k, seatO, 0.04, M.wood(c.seat), 0, yU, 0, { rTop: 0.012, rBot: 0.005, crown: -0.006 });
    else if (o.seat === 'saddle')
      pad(k, SADDLE, 0.05, M.wood(c.seat), 0, yU, 0, {
        rTop: 0.016,
        rBot: 0.006,
        crown: -0.012,
        rings: 6,
        top: (x, z) => 0.018 * (z / 0.17) ** 2 - 0.024 * (x / 0.2) ** 2 + 0.008,
      });
    else if (o.seat === 'cushion') {
      k.cyl(0.17, 0.014, o.base === 'pedestal' ? M.plastic('#1f2023') : fr, 0, yU, 0, 0.17, 24);
      pad(k, seatO, 0.064, um, 0, yU + 0.014, 0, { rTop: 0.028, rBot: 0.012, crown: 0.012 });
    } else if (o.seat === 'tufted') {
      const btn: Array<[number, number]> = [];
      for (const bx of [-0.085, 0, 0.085]) for (const bz of [-0.085, 0, 0.085]) btn.push([bx, bz]);
      pad(k, SQ38, 0.088, um, 0, yU, 0, {
        rTop: 0.03,
        rBot: 0.012,
        crown: 0.014,
        rings: 9,
        top: (x, z) => btn.reduce((a, [bx, bz]) => a - 0.011 * Math.exp(-((x - bx) ** 2 + (z - bz) ** 2) / 0.0005), 0),
      });
      for (const [bx, bz] of btn) {
        const rho = Math.hypot(bx, bz) / 0.19;
        k.sphere(0.0085, um, bx, yU + 0.088 + 0.014 * (1 - rho * rho) - 0.008, bz, 1, 0.7, 1, 6);
      }
      k.tube(SQ38.filter((_, i) => i % 2 === 0).map(([x, z]) => [x * 0.99, yU + 0.075, z * 0.99] as V3), 0.0045, um, { closed: true, seg: 48, radial: 4 });
    } else if (o.seat === 'rattan') {
      pad(k, seatO, 0.064, M.wicker(c.seat), 0, yU, 0, { rTop: 0.026, rBot: 0.008, crown: 0.01 });
      k.ring(0.188, 0.013, fr, 0, yU + 0.016, 0, 40);
    } else if (o.seat === 'bucket') {
      sheet(k, bucketFn, 14, 16, pillowT(0.045, 0.4), um);
      pad(k, ellOutline(0.15, 0.15, 28), 0.02, M.plastic('#1f2023'), 0, yU, 0, { rTop: 0.006, rBot: 0.003, rings: 2 });
    } else {
      pad(k, TRACTOR, 0.022, M.metal(c.seat, 0.4, 0.5), 0, yU + 0.006, 0, {
        rTop: 0.008,
        rBot: 0.003,
        crown: -0.018,
        rings: 7,
        top: (x, z, rho) => 0.05 * Math.pow(rho, 6) * Math.min(1, Math.max(0, (0.06 - z) / 0.18)),
      });
      for (const [x, z] of [[0, 0], [0.06, 0.02], [-0.06, 0.02], [0.03, -0.05], [-0.03, -0.05], [0.09, -0.04], [-0.09, -0.04], [0, 0.08], [0.05, 0.1], [-0.05, 0.1]])
        k.cyl(0.0085, 0.003, M.matte('#141416'), x, yU + 0.006 + 0.022 - 0.018 * (1 - (Math.hypot(x, z) / 0.17) ** 2) - 0.002, z, 0.0085, 10);
    }
    // ---- base
    if (four) {
      const legs: Array<[V3, V3]> = [];
      for (const [sx, sz] of [[-1, 1], [1, 1], [1, -1], [-1, -1]]) {
        const top: V3 = [sx * tp, yU + 0.004, sz * tp];
        const foot: V3 = [sx * fp, 0, sz * fp];
        legs.push([foot, top]);
        if (o.base === 'wood4') turned(k, foot, top, o.turnedLegs ? PROF.windsor(0.024) : PROF.taper(0.021, 0.0145), fr, 12);
        else if (o.base === 'square') k.beam([foot[0], 0.003, foot[2]], top, 0.024, 0.024, fr, 0);
        else turned(k, foot, top, PROF.taper(0.0115, 0.0085), fr, 10);
        if (o.base !== 'wood4') k.cyl(0.012, 0.01, M.rubber('#202022'), foot[0], 0, foot[2], 0.011, 10);
      }
      const at = (i: number, y: number): V3 => lerp3(legs[i][0], legs[i][1], y / legs[i][1][1]);
      const bar = (a: V3, b: V3, r = 0.011): void => {
        if (o.base === 'wood4') {
          if (o.turnedLegs) turned(k, a, b, PROF.stretcher(0.015), fr, 8);
          else k.rod(a, b, r, fr, r, 8);
        } else if (o.base === 'square') k.beam(a, b, 0.02, 0.02, fr, 0);
        else k.rod(a, b, 0.0085, fr, 0.0085, 8);
      };
      const ft = o.foot ?? 'bars';
      if (ft === 'ring') {
        const hp = at(0, yF)[0];
        k.ring(Math.abs(hp) * Math.SQRT2, 0.0095, fr, 0, yF, 0, 36);
        for (let i = 0; i < 4; i++) bar(at(i, yU - 0.03), at((i + 1) % 4, yU - 0.03), 0.009);
      } else if (ft === 'h') {
        bar(at(0, yF), at(3, yF));
        bar(at(1, yF), at(2, yF));
        bar(lerp3(at(0, yF), at(3, yF), 0.5), lerp3(at(1, yF), at(2, yF), 0.5));
        bar(at(0, yF + 0.04), at(1, yF + 0.04));
      } else {
        for (let i = 0; i < 4; i++) bar(at(i, i % 2 ? yF + 0.035 : yF), at((i + 1) % 4, i % 2 ? yF + 0.035 : yF));
        if (o.base !== 'wood4') for (let i = 0; i < 4; i++) bar(at(i, yU - 0.03), at((i + 1) % 4, yU - 0.03), 0.009);
      }
    } else if (o.base === 'tripod') {
      const legs: Array<[V3, V3]> = [];
      for (let i = 0; i < 3; i++) {
        const a = Math.PI / 2 + (i * 2 * Math.PI) / 3;
        const top: V3 = [Math.cos(a) * 0.05, yU + 0.004, Math.sin(a) * 0.05];
        const foot: V3 = [Math.cos(a) * 0.23, 0.004, Math.sin(a) * 0.23];
        legs.push([foot, top]);
        k.rod(foot, top, 0.012, M.blackMetal(), 0.012, 10);
        k.cyl(0.014, 0.012, M.rubber('#202022'), foot[0], 0, foot[2], 0.013, 10);
      }
      k.cyl(0.06, 0.03, M.blackMetal(), 0, yU - 0.03, 0, 0.055, 16);
      const rr = Math.hypot(legs[0][0][0], legs[0][0][2]) * (1 - yF / yU) + 0.05 * (yF / yU);
      k.ring(rr, 0.0095, M.blackMetal(), 0, yF, 0, 40);
    } else {
      // pedestal: domed disc, gas column, footring, lever
      k.lathe(
        [
          [0, 0],
          [0.212, 0],
          [0.218, 0.006],
          [0.205, 0.014],
          [0.13, 0.03],
          [0.055, 0.046],
          [0.034, 0.062],
          [0, 0.062],
        ],
        fr,
        0,
        0,
        0,
        36,
      );
      k.cyl(0.026, yU - 0.06, fr, 0, 0.055, 0, 0.026, 16);
      k.cyl(0.034, 0.13, M.plastic('#1f2023'), 0, yU - 0.16, 0, 0.032, 16);
      k.cyl(0.07, 0.02, M.plastic('#1f2023'), 0, yU - 0.03, 0, 0.09, 16);
      k.ring(0.185, 0.0095, fr, 0, yF, 0, 36);
      k.cyl(0.038, 0.03, fr, 0, yF - 0.015, 0, 0.038, 16);
      for (let i = 0; i < 3; i++) {
        const a = Math.PI / 2 + (i * 2 * Math.PI) / 3;
        k.rod([Math.cos(a) * 0.035, yF, Math.sin(a) * 0.035], [Math.cos(a) * 0.18, yF, Math.sin(a) * 0.18], 0.0075, fr, 0.0075, 8);
      }
      k.rod([0.06, yU - 0.02, 0.02], [0.19, yU - 0.03, 0.06], 0.005, M.plastic('#1f2023'), 0.005, 8);
      k.sphere(0.011, M.plastic('#1f2023'), 0.19, yU - 0.03, 0.06, 1.6, 0.8, 1, 10);
    }
    // ---- back
    if (tub) tubBack(k, tub, um, 0.07);
    else if (o.back === 'spindle') {
      const R = 0.3;
      const cy = sh + 0.22;
      const cz = -0.205;
      curvedSlat(k, M.wood(c.frame), cy, cz, 0.38, 0.06, 0.024, R, 0.14);
      const sag = arcZ(0.19, R);
      for (let i = 0; i < 6; i++) {
        const x = -0.15 + (0.3 * i) / 5;
        const zs = -0.115 + 0.04 * (x / 0.15) ** 2;
        turned(k, [x * 0.9, sh - 0.012, zs], [x, cy + 0.01, cz - sag + arcZ(x, R) - 0.012], i === 0 || i === 5 ? PROF.spindle(0.012) : PROF.spindle(0.0085), M.wood(c.frame), 8);
      }
    } else if (o.back === 'rattan') {
      const fw = M.wood(c.frame);
      for (const s of [-1, 1]) k.tube([[s * 0.125, yU + 0.02, -0.12], [s * 0.14, sh + 0.1, -0.17], [s * 0.155, sh + 0.255, -0.205]], 0.011, fw, { seg: 12, radial: 8 });
      curvedSlat(k, M.wicker(c.seat), sh + 0.11, -0.19, 0.34, 0.13, 0.014, 0.26, 0.2);
      k.tube(
        Array.from({ length: 9 }, (_, i) => {
          const x = -0.17 + (0.34 * i) / 8;
          return [x, sh + 0.11 + 0.13 * Math.cos(0.2) + 0.004, -0.19 - 0.13 * Math.sin(0.2) - arcZ(0.17, 0.26) + arcZ(x, 0.26) - 0.002] as V3;
        }),
        0.009,
        fw,
        { seg: 24, radial: 8 },
      );
    }
    return k.g;
  };
  const draw2d = (ctx: Ctx2D, c: C): void => {
    const fill = tint(o.seat === 'wood' || o.seat === 'saddle' ? c.seat : c.seat, 0.4);
    if (o.base === 'pedestal') D.circle(ctx, 0, 0, 0.215, '#f4f5f6', INK_SOFT, LINE_THIN);
    if (o.foot === 'ring' || o.base === 'pedestal') D.circle(ctx, 0, 0, o.base === 'pedestal' ? 0.19 : Math.abs(fp - (fp - tp) * (yF / yU)) * Math.SQRT2, null, INK_SOFT, 0.014);
    pDots(ctx, feet2d, 0.016, tint(c.frame ?? '#555555', 0.2));
    if (o.seat === 'bucket') {
      const pts: Array<[number, number]> = [];
      for (let j = 0; j <= 16; j++) pts.push([bucketFn(1, j / 16)[0], bucketFn(1, j / 16)[2]]);
      for (let j = 16; j >= 0; j--) pts.push([bucketFn(0, j / 16)[0], bucketFn(0, j / 16)[2]]);
      pPoly(ctx, pts, fill);
    } else pPoly(ctx, seatO, fill);
    if (o.seat === 'tufted') for (const bx of [-0.085, 0, 0.085]) for (const bz of [-0.085, 0, 0.085]) D.circle(ctx, bx, bz, 0.007, null, INK_SOFT, LINE_THIN);
    if (tub) {
      const outer: Array<[number, number]> = [];
      const inner: Array<[number, number]> = [];
      for (let i = 0; i <= 20; i++) {
        const a = -tub.a + (2 * tub.a * i) / 20;
        const po = tubPoint(tub, a, 0.9, 0.035);
        const pi = tubPoint(tub, a, 0.9, -0.035);
        outer.push([po[0], po[2]]);
        inner.push([pi[0], pi[2]]);
      }
      pPoly(ctx, [...outer, ...inner.reverse()], tint(c.seat, 0.22));
    } else if (o.back === 'spindle') pBack(ctx, 0.38, -0.2, 0.025, 0.06, tint(c.frame, 0.2));
    else if (o.back === 'rattan') pBack(ctx, 0.34, -0.2, 0.02, 0.06, tint(c.seat, 0.2));
  };
  return { seats: [sit(sh, 0)], build, draw2d };
}

function stepStool(): Fam {
  const build = (c: C): THREE.Object3D => {
    const k = new Kit();
    const fr = M.wood(c.frame);
    const tr = M.wood(c.seat);
    const s = new THREE.Shape();
    s.moveTo(-0.17, 0);
    s.lineTo(-0.12, 0);
    s.quadraticCurveTo(-0.08, 0.07, 0, 0.07);
    s.quadraticCurveTo(0.08, 0.07, 0.12, 0);
    s.lineTo(0.17, 0);
    s.lineTo(0.17, 0.236);
    s.lineTo(0.0, 0.236);
    s.lineTo(0.0, 0.478);
    s.lineTo(-0.17, 0.478);
    s.closePath();
    const hole = new THREE.Path();
    hole.absellipse(-0.085, 0.385, 0.045, 0.016, 0, Math.PI * 2, true, 0);
    s.holes.push(hole);
    for (const x of [-0.18, 0.18]) {
      const m = k.geo(extrudeZ(s, 0.022, 0.003, 10), fr, x, 0, 0);
      m.rotation.y = -Math.PI / 2;
    }
    k.rbox(0.4, 0.022, 0.19, 0.005, tr, 0, 0.478, -0.083, 1);
    k.rbox(0.4, 0.022, 0.18, 0.005, tr, 0, 0.236, 0.088, 1);
    for (let i = 0; i < 4; i++) {
      k.box(0.3, 0.002, 0.012, M.rubber('#3a3a3c'), 0, 0.258, 0.03 + i * 0.04);
      k.box(0.3, 0.002, 0.012, M.rubber('#3a3a3c'), 0, 0.5, -0.15 + i * 0.045);
    }
    k.box(0.338, 0.06, 0.018, fr, 0, 0.4, -0.16);
    k.box(0.338, 0.05, 0.018, fr, 0, 0.17, 0.16);
    return k.g;
  };
  const draw2d = (ctx: Ctx2D, c: C): void => {
    D.rr(ctx, 0, 0.088, 0.4, 0.18, 0.01, tint(c.seat, 0.45));
    D.rr(ctx, 0, -0.083, 0.4, 0.19, 0.01, tint(c.seat, 0.3));
    for (const x of [-0.18, 0.18]) D.line(ctx, x, -0.17, x, 0.17, INK_SOFT, 0.012);
  };
  return { seats: [sit(0.5, -0.083)], build, draw2d };
}

function milkingStool(): Fam {
  const sh = 0.3;
  const build = (c: C): THREE.Object3D => {
    const k = new Kit();
    const fr = M.wood(c.frame);
    const st = M.wood(c.seat);
    pad(k, ellOutline(0.155, 0.155, 36), 0.042, st, 0, sh - 0.042, 0, { rTop: 0.014, rBot: 0.006, crown: -0.004 });
    for (let i = 0; i < 3; i++) {
      const a = Math.PI / 2 + (i * 2 * Math.PI) / 3;
      const top: V3 = [Math.cos(a) * 0.085, sh - 0.002, Math.sin(a) * 0.085];
      turned(k, [Math.cos(a) * 0.165, 0, Math.sin(a) * 0.165], top, PROF.taper(0.019, 0.014), fr, 12);
      // wedged through-tenon on top of the seat
      k.cyl(0.0175, 0.0015, M.wood('#5a4030'), top[0] * 1.03, sh - 0.0025, top[2] * 1.03, 0.0175, 14);
    }
    return k.g;
  };
  const draw2d = (ctx: Ctx2D, c: C): void => {
    pDots(
      ctx,
      [0, 1, 2].map((i) => [Math.cos(Math.PI / 2 + (i * 2 * Math.PI) / 3) * 0.165, Math.sin(Math.PI / 2 + (i * 2 * Math.PI) / 3) * 0.165] as [number, number]),
      0.016,
      tint(c.frame, 0.2),
    );
    D.circle(ctx, 0, 0, 0.155, tint(c.seat, 0.4));
  };
  return { seats: [sit(sh, 0)], build, draw2d };
}

/* ============================================================================================ */
/* Office & desk chairs                                                                          */
/* ============================================================================================ */

type Tab = Array<[number, number]>;
interface BackSurf {
  y0: number;
  H: number;
  hw: Tab;
  z: Tab;
  R: number;
  curl?: Tab;
}

interface OfficeOpts {
  back: 'mesh' | 'exec' | 'task' | 'gaming' | 'conf' | 'none';
  arms: 'T' | 'loop' | 'none' | 'gaming';
  base: 'black' | 'chrome' | 'alu';
  head?: boolean;
  sh?: number;
  ring?: boolean;
  casters?: boolean;
  saddle?: boolean;
}

function officeChair(o: OfficeOpts): Fam {
  const sh = o.sh ?? 0.48;
  const yMech = sh - 0.145;
  const seatO = o.saddle ? SADDLE : trapOutline(0.5, 0.46, 0.48, 0.1, 0.08, 32, 0.02);
  const surf: Record<Exclude<OfficeOpts['back'], 'none'>, BackSurf> = {
    mesh: { y0: sh + 0.07, H: 0.56, hw: [[0, 0.2], [0.3, 0.235], [0.8, 0.24], [1, 0.22]], z: [[0, -0.245], [0.25, -0.238], [0.6, -0.275], [1, -0.33]], R: 0.45 },
    exec: { y0: sh + 0.03, H: 0.72, hw: [[0, 0.235], [0.5, 0.25], [1, 0.23]], z: [[0, -0.25], [0.3, -0.255], [1, -0.36]], R: 0.6 },
    task: { y0: sh + 0.12, H: 0.4, hw: [[0, 0.2], [0.5, 0.215], [1, 0.2]], z: [[0, -0.245], [0.4, -0.25], [1, -0.29]], R: 0.5 },
    gaming: {
      y0: sh + 0.02,
      H: 0.86,
      hw: [[0, 0.25], [0.35, 0.235], [0.6, 0.265], [0.78, 0.18], [1, 0.16]],
      z: [[0, -0.27], [0.3, -0.272], [1, -0.39]],
      R: 0.8,
      curl: [[0, 0.09], [0.35, 0.06], [0.6, 0.11], [0.78, 0.03], [1, 0.03]],
    },
    conf: { y0: sh + 0.05, H: 0.48, hw: [[0, 0.215], [0.6, 0.235], [1, 0.22]], z: [[0, -0.24], [0.3, -0.245], [1, -0.3]], R: 0.5 },
  };
  const bs = o.back === 'none' ? null : surf[o.back];
  const fnB = (u: number, v: number): V3 => {
    const b = bs as BackSurf;
    const hw = lerpTab(b.hw, v);
    const sx = 2 * u - 1;
    const x = sx * hw;
    const lift = b.curl ? lerpTab(b.curl, v) * Math.pow(Math.abs(sx), 3) : 0;
    return [x, b.y0 + v * b.H, lerpTab(b.z, v) - arcZ(hw, b.R) + arcZ(x, b.R) + lift];
  };
  const build = (c: C): THREE.Object3D => {
    const k = new Kit();
    const blk = M.plastic('#1f2023');
    const bm = o.base === 'black' ? M.plastic('#26272a') : o.base === 'chrome' ? M.chrome() : M.metal('#d4d7da', 0.2, 1);
    const hubTop = starBase(k, 0.33, bm, { casters: o.casters ?? true, flat: o.base === 'alu' });
    k.cyl(0.024, yMech - hubTop + 0.03, M.chrome(), 0, hubTop - 0.02, 0, 0.024, 14);
    k.cyl(0.033, Math.min(0.15, (yMech - hubTop) * 0.6), blk, 0, hubTop - 0.012, 0, 0.03, 14);
    if (o.ring) {
      const yr = 0.32;
      k.ring(0.225, 0.0105, M.chrome(), 0, yr, 0, 32);
      k.cyl(0.04, 0.035, blk, 0, yr - 0.017, 0, 0.04, 16);
      for (let i = 0; i < 3; i++) {
        const a = Math.PI / 2 + (i * 2 * Math.PI) / 3;
        k.rod([Math.cos(a) * 0.04, yr, Math.sin(a) * 0.04], [Math.cos(a) * 0.222, yr, Math.sin(a) * 0.222], 0.008, M.chrome(), 0.008, 8);
      }
    }
    k.rbox(0.2, 0.05, 0.24, 0.012, blk, 0, yMech, 0, 1);
    k.rod([0.08, yMech + 0.02, 0.07], [0.2, yMech + 0.012, 0.11], 0.005, blk, 0.005, 8);
    k.sphere(0.012, blk, 0.2, yMech + 0.012, 0.11, 1.4, 0.8, 1, 6);
    const leatherLook = o.back === 'exec' || o.back === 'conf' || o.back === 'gaming' || o.saddle;
    const um = leatherLook ? M.leather(c.seat) : M.fabric(c.seat);
    k.box(0.4, 0.016, 0.38, blk, 0, yMech + 0.046, 0.02);
    if (o.saddle) {
      pad(k, SADDLE, 0.08, um, 0, yMech + 0.06, 0, { rTop: 0.03, rBot: 0.012, crown: -0.014, rings: 6, top: (x, z) => 0.02 * (z / 0.17) ** 2 - 0.03 * (x / 0.2) ** 2 + 0.012 });
    } else if (o.back === 'gaming') {
      const acc = M.leather(c.accent);
      pad(k, seatO, 0.075, acc, 0, yMech + 0.06, 0, { rTop: 0.03, rBot: 0.012, crown: 0.004, rings: 4, top: (x) => 0.04 * Math.pow(Math.min(1, Math.abs(x) / 0.25), 4) });
      pad(k, trapOutline(0.29, 0.27, 0.42, 0.05, 0.05, 24, 0.03), 0.018, um, 0, yMech + 0.128, 0, { rTop: 0.008, rBot: 0.004, crown: 0.004, rings: 2 });
    } else pad(k, seatO, 0.075, um, 0, yMech + 0.06, 0, { rTop: 0.03, rBot: 0.012, crown: 0.01, top: (_x, z) => (z > 0.13 ? -(z - 0.13) * 0.35 : 0) });

    // ---- back
    const jBar = (m: Mat, r: number): void => {
      const b = bs as BackSurf;
      k.tube(
        [
          [0, yMech + 0.02, -0.08],
          [0, yMech + 0.025, -0.22],
          [0, yMech + 0.07, lerpTab(b.z, 0) - 0.045],
          [0, b.y0 + 0.16, lerpTab(b.z, 0.16 / b.H) - 0.045],
        ],
        r,
        m,
        { seg: 14, radial: 6 },
      );
    };
    if (o.back === 'mesh') {
      sheet(k, fnB, 10, 12, 0.004, M.fabric(c.mesh, 40));
      const rim: V3[] = [];
      for (let j = 0; j <= 10; j++) rim.push(fnB(0, j / 10));
      for (let i = 1; i <= 8; i++) rim.push(fnB(i / 8, 1));
      for (let j = 9; j >= 0; j--) rim.push(fnB(1, j / 10));
      for (let i = 7; i >= 1; i--) rim.push(fnB(i / 8, 0));
      k.tube(rim, 0.013, blk, { closed: true, seg: 52, radial: 5 });
      sheet(k, offsetFn(fnB, 0.012, 0.18, 0.82, 0.14, 0.3), 8, 3, 0.012, blk);
      jBar(blk, 0.02);
      const jt: V3 = [0, (bs as BackSurf).y0 + 0.16, lerpTab((bs as BackSurf).z, 0.16 / (bs as BackSurf).H) - 0.045];
      for (const u of [0.03, 0.97]) {
        const p = fnB(u, 0.28);
        k.rod(jt, [p[0], p[1], p[2] - 0.01], 0.012, blk, 0.012, 8);
      }
      if (o.head) {
        const b = bs as BackSurf;
        const hy = b.y0 + b.H + 0.075;
        const hz = lerpTab(b.z, 1) - 0.03;
        sheet(
          k,
          (u, v) => {
            const x = (2 * u - 1) * 0.145;
            return [x, hy + v * 0.12, hz - 0.012 * v - arcZ(0.145, 0.3) + arcZ(x, 0.3)];
          },
          8,
          5,
          pillowT(0.045, 0.45),
          M.fabric(c.mesh, 40),
        );
        k.beam([0, b.y0 + b.H - 0.03, lerpTab(b.z, 1) - 0.022], [0, hy + 0.05, hz - 0.035], 0.04, 0.014, blk, 0.004);
      }
    } else if (o.back === 'exec') {
      sheet(k, fnB, 8, 10, pillowT(0.05, 0.45), um);
      for (let i = 0; i < 5; i++) {
        const v0 = 0.04 + i * 0.185;
        const v1 = Math.min(0.98, v0 + (i === 4 ? 0.2 : 0.185));
        sheet(k, offsetFn(fnB, 0.03, 0.06, 0.94, v0, v1), 8, 3, (u, v) => (i === 4 ? 0.065 : 0.05) * (0.3 + 0.7 * Math.pow(Math.sin(Math.PI * v), 0.5)) * (0.45 + 0.55 * Math.pow(Math.sin(Math.PI * u), 0.3)), um);
      }
      jBar(M.chrome(), 0.016);
    } else if (o.back === 'task') {
      sheet(k, fnB, 10, 8, pillowT(0.06, 0.35), um);
      sheet(k, offsetFn(fnB, -0.032, 0.02, 0.98, 0.02, 0.98), 6, 5, 0.008, blk);
      jBar(blk, 0.018);
    } else if (o.back === 'gaming') {
      sheet(k, fnB, 12, 12, pillowT(0.075, 0.45), M.leather(c.accent));
      sheet(k, offsetFn(fnB, 0.036, 0.22, 0.78, 0.04, 0.95), 6, 10, pillowT(0.035, 0.4), um);
      const pn = fnB(0.5, 0.84);
      k.pillow(0.22, 0.09, 0.08, um, pn[0], pn[1] - 0.045, pn[2] + 0.085);
      const pl = fnB(0.5, 0.17);
      k.pillow(0.3, 0.13, 0.1, um, pl[0], pl[1] - 0.065, pl[2] + 0.09);
      // shoulder slots
      for (const s of [-1, 1]) {
        const p = fnB(0.5 + s * 0.34, 0.7);
        k.box(0.07, 0.03, 0.05, M.matte('#141416'), p[0], p[1] - 0.015, p[2]);
      }
      jBar(blk, 0.02);
    } else if (o.back === 'conf') {
      sheet(k, fnB, 10, 8, pillowT(0.035, 0.45), um);
      sheet(k, offsetFn(fnB, -0.022, 0.01, 0.99, 0.01, 0.99), 6, 5, 0.006, blk);
      jBar(M.chrome(), 0.015);
    }

    // ---- arms
    if (o.arms === 'T' || o.arms === 'gaming') {
      const ax = o.arms === 'gaming' ? 0.285 : 0.275;
      for (const s of [-1, 1]) {
        k.beam([s * 0.09, yMech + 0.035, 0.0], [s * ax, yMech + 0.038, 0.0], 0.012, 0.05, blk, 0.003);
        k.box(0.035, sh + 0.19 - (yMech + 0.03), 0.055, blk, s * ax, yMech + 0.03, 0.0);
        k.rbox(o.arms === 'gaming' ? 0.09 : 0.075, 0.03, 0.26, 0.012, o.arms === 'gaming' ? M.leather(c.seat) : M.rubber('#2d2e31'), s * ax, sh + 0.19, 0.02, 1);
      }
    } else if (o.arms === 'loop') {
      for (const s of [-1, 1]) {
        k.tube(
          [
            [s * 0.09, yMech + 0.035, 0.04],
            [s * 0.25, yMech + 0.045, 0.07],
            [s * 0.282, sh + 0.06, 0.15],
            [s * 0.29, sh + 0.17, 0.1],
            [s * 0.29, sh + 0.185, -0.06],
            [s * 0.282, sh + 0.13, -0.18],
            [s * 0.25, sh + 0.04, -0.22],
          ],
          0.011,
          M.chrome(),
          { seg: 26, radial: 6 },
        );
        k.rbox(0.065, 0.03, 0.25, 0.012, o.back === 'exec' ? um : blk, s * 0.29, sh + 0.185, 0.02, 1);
      }
    }
    return k.g;
  };
  const draw2d = (ctx: Ctx2D, c: C): void => {
    pStar(ctx, 0.33);
    pPoly(ctx, seatO, tint(o.back === 'gaming' ? c.accent : c.seat, 0.5));
    if (bs) {
      const outer: Array<[number, number]> = [];
      const inner: Array<[number, number]> = [];
      for (let i = 0; i <= 12; i++) {
        const p = fnB(i / 12, 0.55);
        outer.push([p[0], p[2] - 0.03]);
        inner.push([p[0], p[2] + 0.02]);
      }
      pPoly(ctx, [...outer, ...inner.reverse()], tint(o.back === 'gaming' ? c.accent : o.back === 'mesh' ? c.mesh : c.seat, 0.3));
    }
    if (o.arms !== 'none') for (const s of [-1, 1]) D.rr(ctx, s * 0.282, 0.02, 0.07, 0.26, 0.02, tint('#2a2b2e', 0.6), undefined, LINE_THIN);
  };
  return { seats: [sit(sh, 0.03)], build, draw2d };
}

function kneelingChair(): Fam {
  const runner: V3[] = [
    [0, 0.5, -0.2],
    [0, 0.36, -0.255],
    [0, 0.13, -0.235],
    [0, 0.034, -0.14],
    [0, 0.031, 0.0],
    [0, 0.036, 0.12],
    [0, 0.11, 0.215],
    [0, 0.27, 0.25],
  ];
  const build = (c: C): THREE.Object3D => {
    const k = new Kit();
    const fr = M.wood(c.frame);
    const um = M.fabric(c.seat);
    for (const x0 of [-0.19, 0.19]) {
      const curve = new THREE.CatmullRomCurve3(runner.map((p) => new THREE.Vector3(x0, p[1], p[2])));
      sheet(
        k,
        (u, v) => {
          const p = curve.getPointAt(v);
          return [x0 + (u - 0.5) * 0.024, p.y, p.z];
        },
        1,
        40,
        0.06,
        fr,
      );
    }
    k.rod([-0.19, 0.47, -0.205], [0.19, 0.47, -0.205], 0.016, fr, 0.016, 10);
    k.rod([-0.19, 0.25, 0.245], [0.19, 0.25, 0.245], 0.016, fr, 0.016, 10);
    k.rod([-0.19, 0.06, -0.02], [0.19, 0.06, -0.02], 0.016, fr, 0.016, 10);
    const seatO = roundPoly(corners2d(1).map(([x, z]) => [x * 0.215, z * 0.145] as [number, number]), 0.06, 36);
    const kneeO = roundPoly(corners2d(1).map(([x, z]) => [x * 0.215, z * 0.08] as [number, number]), 0.05, 32);
    const seatG = new Kit();
    seatG.rbox(0.42, 0.018, 0.26, 0.004, fr, 0, 0, 0, 1);
    pad(seatG, seatO, 0.065, um, 0, 0.016, 0, { rTop: 0.028, rBot: 0.01, crown: 0.01 });
    seatG.g.position.set(0, 0.49, -0.165);
    seatG.g.rotation.x = 0.3;
    k.g.add(seatG.g);
    const kneeG = new Kit();
    kneeG.rbox(0.42, 0.018, 0.14, 0.004, fr, 0, 0, 0, 1);
    pad(kneeG, kneeO, 0.06, um, 0, 0.016, 0, { rTop: 0.025, rBot: 0.01, crown: 0.008 });
    kneeG.g.position.set(0, 0.272, 0.235);
    kneeG.g.rotation.x = 0.62;
    k.g.add(kneeG.g);
    return k.g;
  };
  const draw2d = (ctx: Ctx2D, c: C): void => {
    for (const x of [-0.19, 0.19]) D.line(ctx, x, -0.255, x, 0.25, INK_SOFT, 0.024);
    D.rr(ctx, 0, -0.165, 0.43, 0.28, 0.05, tint(c.seat, 0.4));
    D.rr(ctx, 0, 0.225, 0.43, 0.13, 0.04, tint(c.seat, 0.4));
  };
  return { seats: [sit(0.57, -0.15)], build, draw2d };
}

function ballChair(): Fam {
  const rb = 0.26;
  const ringY = 0.13;
  const cy = ringY + Math.sqrt(rb * rb - 0.19 * 0.19);
  const build = (c: C): THREE.Object3D => {
    const k = new Kit();
    const fm = M.plastic(c.frame);
    const frame: V3[] = [];
    for (const [x, z] of [[0.2, 0.2], [0.2, -0.2], [-0.2, -0.2], [-0.2, 0.2]]) {
      frame.push([x + Math.sign(x) * 0.02, 0.075, z - Math.sign(z) * 0.03]);
      frame.push([x - Math.sign(x) * 0.03, 0.075, z + Math.sign(z) * 0.02]);
    }
    k.tube(frame, 0.015, fm, { closed: true, seg: 48, radial: 6, tension: 0.2 });
    for (const [x, z] of [[0.205, 0.205], [0.205, -0.205], [-0.205, -0.205], [-0.205, 0.205]]) {
      caster(k, x, z, Math.atan2(z, x), fm, 0.075);
      k.rod([x * 0.9, 0.075, z * 0.9], [x * 0.66, ringY, z * 0.66], 0.011, fm, 0.011, 8);
    }
    k.ring(0.19, 0.014, fm, 0, ringY, 0, 32);
    k.sphere(rb, M.plastic(c.ball), 0, cy, 0, 1, 1, 1, 26);
    k.cyl(rb + 0.0008, 0.004, M.plastic(c.ball), 0, cy - 0.002, 0, rb + 0.0008, 32);
    k.sphere(0.008, M.rubber('#3a3a3c'), rb * 0.7, cy + rb * 0.7, 0, 1, 1, 1, 8);
    for (const s of [-1, 1]) k.tube([[s * 0.17, 0.075, -0.2], [s * 0.17, 0.4, -0.27], [s * 0.165, 0.79, -0.3]], 0.012, fm, { seg: 16, radial: 8 });
    sheet(
      k,
      (u, v) => {
        const x = (2 * u - 1) * 0.19;
        return [x, 0.66 + v * 0.15, -0.285 - 0.02 * v - arcZ(0.19, 0.35) + arcZ(x, 0.35)];
      },
      8,
      5,
      pillowT(0.045, 0.4),
      M.fabric(c.frame === '#2a2b2e' ? '#3b3f45' : c.frame),
    );
    return k.g;
  };
  const draw2d = (ctx: Ctx2D, c: C): void => {
    D.rr(ctx, 0, 0, 0.47, 0.47, 0.06, null, INK_SOFT, 0.02);
    D.circle(ctx, 0, 0, rb, tint(c.ball, 0.35));
    D.circle(ctx, -rb * 0.3, -rb * 0.3, rb * 0.25, lighten2(c.ball), null);
    pBack(ctx, 0.38, -0.27, 0.04, 0.05, tint(c.frame, 0.4));
  };
  return { seats: [sit(cy + rb, 0)], build, draw2d };
}

const lighten2 = (c: string): string => tint(c, 0.6);

function visitorChair(): Fam {
  const x = 0.26;
  const postZ = (y: number): number => lerpTab([[0.04, -0.235], [0.3, -0.25], [0.55, -0.255], [0.88, -0.29]], y);
  const build = (c: C): THREE.Object3D => {
    const k = new Kit();
    const ch = M.chrome();
    const lea = M.leather(c.seat);
    for (const s of [-1, 1]) {
      const xs = s * x;
      k.tube(
        [
          [xs, 0.0125, 0.23],
          [xs, 0.0125, -0.18],
          [xs, 0.04, -0.235],
          [xs, 0.3, -0.25],
          [xs, 0.55, -0.255],
          [xs, 0.88, -0.29],
        ],
        0.0125,
        ch,
        { seg: 30, radial: 6 },
      );
      k.tube(
        [
          [xs, 0.0125, 0.23],
          [xs, 0.06, 0.25],
          [xs, 0.4, 0.24],
          [xs, 0.62, 0.2],
          [xs, 0.65, 0.12],
          [xs, 0.65, -0.1],
          [xs, 0.63, -0.2],
          [xs, 0.6, postZ(0.6)],
        ],
        0.0125,
        ch,
        { seg: 30, radial: 6 },
      );
      k.rbox(0.05, 0.022, 0.26, 0.009, lea, xs, 0.652, -0.0, 1);
    }
    for (const z of [0.2, -0.2]) k.rod([-x, 0.39, z], [x, 0.39, z], 0.01, ch, 0.01, 8);
    pad(k, roundPoly([[-0.245, -0.22], [0.245, -0.22], [0.245, 0.235], [-0.245, 0.235]], 0.05, 44), 0.07, lea, 0, 0.4, 0, { rTop: 0.026, rBot: 0.01, crown: 0.01 });
    const R = 0.6;
    sheet(
      k,
      (u, v) => {
        const y = 0.56 + v * 0.32;
        const xx = (2 * u - 1) * (x - 0.012);
        return [xx, y, postZ(y) + 0.03 - arcZ(x, R) + arcZ(xx, R)];
      },
      12,
      10,
      pillowT(0.05, 0.4),
      lea,
    );
    return k.g;
  };
  const draw2d = (ctx: Ctx2D, c: C): void => {
    for (const s of [-1, 1]) {
      D.line(ctx, s * x, 0.25, s * x, -0.29, INK_SOFT, 0.025);
      D.rr(ctx, s * x, 0, 0.05, 0.26, 0.012, tint(c.seat, 0.3));
    }
    D.rr(ctx, 0, 0.007, 0.49, 0.455, 0.05, tint(c.seat, 0.45));
    pBack(ctx, 2 * x, -0.23, 0.05, 0.04, tint(c.seat, 0.3));
  };
  return { seats: [sit(0.48, 0.02)], build, draw2d };
}

/* ============================================================================================ */
/* Catalog items                                                                                 */
/* ============================================================================================ */

const FRAME = (def: string, label = 'מסגרת'): ColorSlot => slot('frame', label, def);
const WOOD = (def: string): ColorSlot => slot('frame', 'עץ', def);
const SEAT = (def: string, label = 'מושב'): ColorSlot => slot('seat', label, def);
const UPH = (def: string): ColorSlot => slot('seat', 'ריפוד', def);

const dining = (id: string, name: string, tags: string[], colors: ColorSlot[], fam: Fam, size: [number, number, number], dz = 0): FurnitureDef =>
  item(id, name, 'dining', G_DINING, ['כיסא', 'כיסא אוכל', ...tags], colors, fam, size, dz);
const stoolItem = (id: string, name: string, tags: string[], colors: ColorSlot[], fam: Fam, size: [number, number, number], dz = 0): FurnitureDef =>
  item(id, name, 'dining', G_STOOL, ['שרפרף', 'כיסא בר', ...tags], colors, fam, size, dz);
const office = (id: string, name: string, tags: string[], colors: ColorSlot[], fam: Fam, size: [number, number, number], dz = 0): FurnitureDef =>
  item(id, name, 'office', G_OFFICE, ['כיסא משרדי', 'כיסא עבודה', ...tags], colors, fam, size, dz);

const DINING_CHAIRS: FurnitureDef[] = [
  dining('chair-windsor-bow', 'כיסא וינדזור עם גב קשת', ['וינדזור', 'חישורים', 'עץ מלא', 'כפרי', 'קלאסי'], [WOOD('#b98d5f'), SEAT('#b98d5f')], windsor({ n: 9 }), [0.5, 0.5, 0.96]),
  dining('chair-windsor-comb', 'כורסת וינדזור עם גב מסרק', ['וינדזור', 'חישורים', 'ידיות', 'צבוע', 'כפרי'], [FRAME('#26272a'), SEAT('#6e4a32')], windsor({ comb: true, n: 7, paint: true }), [0.56, 0.55, 1.07]),
  dining(
    'chair-ladder-back',
    'כיסא גב סולם',
    ['גב סולם', 'רגליים מחורטות', 'עץ אגוז', 'קלאסי'],
    [WOOD(PAL.walnut), UPH('#c9b99a')],
    woodChair({ leg: 'turned', back: { kind: 'ladder', n: 4 }, seat: 'pad', finial: true, top: 1.0, stretch: 'box', R: 0.6 }),
    [0.46, 0.53, 1.0],
  ),
  dining(
    'chair-farmhouse-rush',
    'כיסא כפרי עם מושב קש',
    ['קש', 'קלוע', 'גב סולם', 'צבוע לבן', 'פרובנס', 'כפרי'],
    [FRAME('#efebe3'), SEAT('#b99a5b')],
    woodChair({ leg: 'turned', back: { kind: 'ladder', n: 3 }, seat: 'rush', finial: true, paint: true, top: 0.98, stretch: 'farm', R: 0.6 }),
    [0.46, 0.53, 0.98],
  ),
  dining(
    'chair-cross-back',
    'כיסא ביסטרו גב איקס',
    ['ביסטרו', 'גב איקס', 'קנים', 'ראטן', 'צרפתי'],
    [WOOD('#4a3426'), SEAT('#d9bf8c', 'קליעת קנים')],
    woodChair({ leg: 'round', back: { kind: 'cross' }, seat: 'cane', top: 0.86, stretch: 'box', R: 0.55 }),
    [0.46, 0.52, 0.86],
  ),
  dining('chair-y-back', 'כיסא גב Y עם מושב קלוע', ['גב Y', 'חבל נייר', 'קלוע', 'סקנדינבי', 'אלון'], [WOOD('#c8a06c'), SEAT('#d8c49a', 'קליעה')], hoopChair('wishbone'), [0.56, 0.52, 0.74]),
  dining('chair-bentwood', 'כיסא קפה מעץ מכופף', ['עץ מכופף', 'בית קפה', 'וינאי', 'קנים', 'ביסטרו'], [WOOD('#3b2a20'), SEAT('#d4b483', 'קליעת קנים')], bentwood({ cane: true }), [0.44, 0.52, 0.9]),
  dining('chair-bentwood-arm', 'כורסת ביסטרו מעץ מכופף', ['עץ מכופף', 'בית קפה', 'ידיות', 'ביסטרו'], [WOOD('#8a5a3a'), SEAT('#8a5a3a')], bentwood({ arms: true }), [0.5, 0.52, 0.9]),
  dining(
    'chair-cane-back',
    'כיסא עם גב קנים',
    ['קנים', 'ראטן', 'גב קלוע', 'פשתן', 'מודרני'],
    [WOOD('#2f2a26'), UPH('#cbbfa9'), slot('cane', 'קליעת קנים', '#d8bd8c')],
    woodChair({ leg: 'taper', back: { kind: 'cane' }, seat: 'uph', uph: 'linen', top: 0.84, stretch: 'none', R: 0.45 }),
    [0.46, 0.52, 0.84],
  ),
  dining('chair-parsons', 'כיסא פרסונס מרופד', ['פרסונס', 'מרופד', 'פשתן', 'קלאסי'], [WOOD('#5b4232'), UPH('#d8d0c2')], parsons({ uph: 'linen' }), [0.48, 0.56, 0.96]),
  dining('chair-parsons-skirt', 'כיסא מרופד עם חצאית', ['מרופד', 'חצאית', 'כיסוי בד', 'רומנטי'], [WOOD('#5b4232'), UPH('#e9e4da')], parsons({ uph: 'fabric', skirt: true }), [0.48, 0.56, 0.96]),
  dining(
    'chair-channel-velvet',
    'כיסא קטיפה עם תפרים אנכיים',
    ['קטיפה', 'תפרים', 'מרופד', 'פליז', 'יוקרתי'],
    [UPH('#2f5d50')],
    tubChair({ tub: { a: 1.25, rx: 0.24, rz: 0.25, zc: 0.03, y0: 0.4, yBack: 0.84, yTip: 0.68, flare: 0.12 }, uph: 'velvet', channels: 7, legs: 'brass', seatW: 0.5, seatD: 0.48 }),
    [0.6, 0.6, 0.86],
  ),
  dining('chair-shell-dowel', 'כיסא מעטפת על רגלי עץ', ['מעטפת', 'פלסטיק', 'מודרני', 'רגלי עץ', 'אמצע המאה'], [slot('shell', 'מעטפת', '#f2efe8'), slot('base', 'רגליים', '#d9b98c')], shellChair({ spec: SHELL, base: 'dowel' }), [0.48, 0.56, 0.82]),
  dining('chair-shell-wire', 'כיסא מעטפת על בסיס תיל', ['מעטפת', 'פלסטיק', 'תיל', 'מתכת', 'מודרני'], [slot('shell', 'מעטפת', '#2c2d30'), slot('base', 'בסיס', '#d9dcdf')], shellChair({ spec: SHELL, base: 'wire' }), [0.48, 0.56, 0.82]),
  dining('chair-shell-arm', 'כורסת מעטפת על רגלי עץ', ['מעטפת', 'ידיות', 'פלסטיק', 'אמצע המאה'], [slot('shell', 'מעטפת', '#d6a544'), slot('base', 'רגליים', PAL.walnut)], shellChair({ spec: SHELL_ARM, base: 'dowel' }), [0.58, 0.58, 0.78]),
  dining(
    'chair-shell-pad',
    'כיסא מעטפת מרופד',
    ['מעטפת', 'ריפוד', 'רגלי מתכת', 'מודרני'],
    [slot('shell', 'מעטפת', '#e7e3dc'), UPH('#7d8a6e'), slot('base', 'רגליים', '#2a2b2e')],
    shellChair({ spec: SHELL, base: 'metal4', pad: 'fabric' }),
    [0.48, 0.56, 0.82],
  ),
  dining('chair-plastic-stack', 'כיסא פלסטיק נערם', ['פלסטיק', 'נערם', 'חוץ', 'צבעוני'], [slot('shell', 'צבע', '#c8463c')], shellChair({ spec: STACK, base: 'plastic' }), [0.5, 0.56, 0.86]),
  dining('chair-metal-cafe', 'כיסא מתכת תעשייתי', ['מתכת', 'תעשייתי', 'בית קפה', 'לופט'], [FRAME('#2f4f5f', 'צבע')], metalCafe({ sh: 0.46, back: 'tall' }), [0.52, 0.56, 0.84]),
  dining('chair-ghost', 'כיסא שקוף בסגנון לואי', ['שקוף', 'אקריליק', 'פוליקרבונט', 'רוח', 'מודרני'], [FRAME('#e4eef0', 'גוון')], ghostChair(), [0.44, 0.54, 0.92]),
  dining('chair-wire-mesh', 'כיסא רשת תיל', ['תיל', 'רשת', 'מתכת', 'כרום', 'אמצע המאה'], [FRAME('#cfd3d6', 'תיל'), SEAT('#3b3f45', 'כרית')], wireChair(), [0.48, 0.56, 0.82]),
  dining('chair-sling-leather', 'כיסא עור ערסל', ['עור', 'ערסל', 'מתכת שחורה', 'מינימליסטי'], [UPH('#8b5a3c')], slingChair(), [0.48, 0.5, 0.86]),
  dining('chair-scandi-round', 'כורסת אוכל סקנדינבית עם גב מעוגל', ['סקנדינבי', 'ידיות', 'חישורים', 'מרופד', 'עץ טיק'], [WOOD('#c79d6b'), UPH('#b7b2a8')], hoopChair('round'), [0.52, 0.52, 0.74]),
  dining('chair-folding', 'כיסא עץ מתקפל', ['מתקפל', 'עץ אשור', 'אירוח', 'קל'], [WOOD('#b88a5a'), SEAT('#c69c6d', 'שלבים')], foldingChair(), [0.44, 0.48, 0.86]),
  dining('chair-director', 'כיסא במאי', ['במאי', 'קנבס', 'מתקפל', 'ידיות'], [WOOD('#6b4a33'), SEAT('#e3dccb', 'בד קנבס')], directorChair(), [0.56, 0.56, 0.9]),
  dining('chair-school', 'כיסא בית ספר', ['בית ספר', 'דיקט', 'צינור מתכת', 'רטרו'], [FRAME('#3f6b8a'), SEAT('#d9bf93', 'דיקט')], schoolChair(), [0.46, 0.5, 0.8]),
  dining(
    'chair-carver',
    'כורסת קארבר עם גב חישורים',
    ['קארבר', 'ידיות', 'חישורים', 'רגליים מחורטות', 'ראש שולחן'],
    [WOOD('#6e4b33')],
    woodChair({ sw: 0.54, swb: 0.48, leg: 'turned', back: { kind: 'spindle', n: 6 }, seat: 'wood', arms: true, top: 1.0, finial: true, stretch: 'box', R: 0.6 }),
    [0.56, 0.54, 1.0],
  ),
  dining('chair-cantilever-cane', 'כיסא צינור מרחף עם קליעת קנים', ['מרחף', 'כרום', 'קנים', 'באוהאוס', 'קלאסי'], [WOOD('#2d221c'), SEAT('#d6bc8f', 'קליעת קנים')], cantilever({ fill: 'cane' }), [0.48, 0.52, 0.84]),
  dining('chair-cantilever-leather', 'כיסא צינור מרחף מעור', ['מרחף', 'כרום', 'עור', 'באוהאוס'], [UPH('#5a3a2a')], cantilever({ fill: 'leather' }), [0.48, 0.52, 0.84]),
  dining(
    'chair-dining-armchair',
    'כורסת אוכל מרופדת',
    ['כורסה', 'ידיות', 'מרופד', 'כפתורים', 'פשתן'],
    [WOOD('#4d382b'), UPH('#b8a690')],
    tubChair({ tub: { a: 1.55, rx: 0.26, rz: 0.25, zc: 0.03, y0: 0.4, yBack: 0.86, yTip: 0.66, flare: 0.06 }, uph: 'linen', legs: 'wood', seatW: 0.52, seatD: 0.48, buttons: true }),
    [0.62, 0.6, 0.88],
  ),
  dining(
    'chair-boucle',
    'כיסא בוקלה מעוגל',
    ['בוקלה', 'מעוגל', 'מרופד', 'מודרני', 'רך'],
    [UPH('#efe9df')],
    tubChair({ tub: { a: 1.45, rx: 0.25, rz: 0.24, zc: 0.03, y0: 0.4, yBack: 0.78, yTip: 0.6, flare: 0.1 }, uph: 'boucle', legs: 'black', seatW: 0.52, seatD: 0.48 }),
    [0.62, 0.6, 0.8],
  ),
  dining(
    'chair-spindle-black',
    'כיסא חישורים שחור',
    ['חישורים', 'שחור', 'מושב עץ', 'מודרני', 'כפרי'],
    [FRAME('#232323'), SEAT(PAL.oak)],
    woodChair({ leg: 'taper', back: { kind: 'spindle', n: 7 }, seat: 'wood', paint: true, top: 0.88, R: 0.42, stretch: 'side' }),
    [0.46, 0.52, 0.88],
  ),
  dining(
    'chair-mission',
    'כיסא בסגנון מישן',
    ['מישן', 'אלון', 'עור', 'שלבים', 'קלאסי'],
    [WOOD('#5a3b26'), UPH('#6b3f2a')],
    woodChair({ leg: 'square', back: { kind: 'vslat', n: 5 }, seat: 'pad', uph: 'leather', top: 0.95, rake: 0.05, stretch: 'box', R: 0.9, lr: 0.019 }),
    [0.46, 0.52, 0.95],
  ),
  dining(
    'chair-upholstered-frame',
    'כיסא אוכל מרופד עם מסגרת עץ',
    ['מרופד', 'קטיפה', 'מסמרים', 'מסגרת עץ', 'יוקרתי'],
    [WOOD('#3f2e24'), UPH('#7a8ca0')],
    woodChair({ leg: 'taper', back: { kind: 'uph' }, seat: 'uph', uph: 'velvet', top: 0.9, stretch: 'none', nails: true, R: 0.6 }),
    [0.46, 0.52, 0.9],
  ),
  dining('chair-bench-wood', 'ספסל אוכל מעץ', ['ספסל', 'עץ מלא', 'פינת אוכל', 'כפרי'], [WOOD('#a77c52')], bench({ w: 1.4 }), [1.4, 0.36, 0.46]),
  dining('chair-bench-upholstered', 'ספסל אוכל מרופד', ['ספסל', 'מרופד', 'פשתן', 'רגליים מחורטות'], [WOOD('#3d2c22'), UPH('#9aa08a')], bench({ w: 1.3, uph: 'linen' }), [1.3, 0.36, 0.47]),
];

const STOOLS: FurnitureDef[] = [
  stoolItem('stool-bar-wood', 'כיסא בר עגול מעץ', ['עץ', 'עגול', 'ללא גב', 'גובה בר'], [WOOD('#b58a5d'), SEAT('#b58a5d')], stool({ sh: 0.75, seat: 'wood', base: 'wood4', foot: 'bars' }), [0.46, 0.46, 0.75]),
  stoolItem('stool-counter-swivel', 'שרפרף דלפק מסתובב עם גב נמוך', ['מסתובב', 'גב נמוך', 'מרופד', 'גובה דלפק'], [UPH('#6f7f8c')], stool({ sh: 0.65, seat: 'cushion', base: 'pedestal', back: 'low', uph: 'fabric' }), [0.44, 0.44, 0.82]),
  stoolItem('stool-bar-saddle', 'כיסא בר אוכף מעץ', ['אוכף', 'עץ אגוז', 'ללא גב', 'גובה בר'], [WOOD(PAL.walnut), SEAT(PAL.walnut)], stool({ sh: 0.75, seat: 'saddle', base: 'wood4', foot: 'bars' }), [0.46, 0.46, 0.77]),
  stoolItem('stool-bar-industrial', 'כיסא בר מתכת תעשייתי', ['מתכת', 'תעשייתי', 'לופט', 'גובה בר'], [FRAME('#7f8487', 'צבע')], metalCafe({ sh: 0.75, back: 'none', round: true }), [0.46, 0.46, 0.75]),
  stoolItem('stool-counter-metal-back', 'שרפרף דלפק מתכת עם גב', ['מתכת', 'תעשייתי', 'גב נמוך', 'גובה דלפק'], [FRAME('#4a6b5a', 'צבע')], metalCafe({ sh: 0.65, back: 'low' }), [0.5, 0.52, 0.83]),
  stoolItem('stool-counter-rattan', 'שרפרף דלפק מראטן', ['ראטן', 'קלוע', 'גב', 'בוהו', 'גובה דלפק'], [WOOD('#8c6a45'), SEAT('#c19a64', 'קליעה')], stool({ sh: 0.65, seat: 'rattan', base: 'wood4', back: 'rattan', foot: 'bars' }), [0.46, 0.46, 0.92]),
  stoolItem('stool-counter-tufted', 'שרפרף דלפק מעור עם כפתורים', ['עור', 'כפתורים', 'כרום', 'גובה דלפק'], [UPH('#3a2c26')], stool({ sh: 0.65, seat: 'tufted', base: 'square', foot: 'bars', uph: 'leather' }), [0.4, 0.4, 0.65]),
  stoolItem('stool-bar-gaslift', 'כיסא בר בוכנה מתכוונן', ['בוכנה', 'מתכוונן', 'מסתובב', 'כרום', 'גובה בר'], [UPH('#d9d3c7')], stool({ sh: 0.75, seat: 'bucket', base: 'pedestal', uph: 'leather' }), [0.44, 0.44, 1.0]),
  stoolItem('stool-step', 'שרפרף מדרגה מעץ', ['מדרגה', 'שרפרף', 'עץ', 'מטבח'], [WOOD('#d8c3a0'), SEAT('#d8c3a0', 'מדרכים')], stepStool(), [0.4, 0.36, 0.5]),
  stoolItem('stool-milking', 'שרפרף חליבה תלת-רגלי', ['שלוש רגליים', 'נמוך', 'עץ', 'כפרי'], [WOOD('#8a5a3a'), SEAT('#a06a42')], milkingStool(), [0.34, 0.34, 0.3]),
  stoolItem('stool-counter-ring', 'שרפרף דלפק עם טבעת רגליים', ['עור', 'טבעת', 'מתכת שחורה', 'גובה דלפק'], [UPH('#8b5a3c'), FRAME('#222326')], stool({ sh: 0.65, seat: 'cushion', base: 'metal4', foot: 'ring', uph: 'leather' }), [0.44, 0.44, 0.65]),
  stoolItem('stool-bar-spindle', 'כיסא בר וינדזור עם גב חישורים', ['וינדזור', 'חישורים', 'אוכף', 'גובה בר'], [WOOD('#c8a06c'), SEAT('#c8a06c')], stool({ sh: 0.75, seat: 'saddle', base: 'wood4', turnedLegs: true, foot: 'h', back: 'spindle' }), [0.46, 0.46, 1.0]),
  stoolItem('stool-counter-velvet', 'שרפרף דלפק קטיפה עם גב עגול', ['קטיפה', 'פליז', 'גב עגול', 'יוקרתי', 'גובה דלפק'], [UPH('#c27b6a')], stool({ sh: 0.65, seat: 'cushion', base: 'brass4', foot: 'ring', back: 'tub', uph: 'velvet' }), [0.46, 0.46, 0.9]),
  stoolItem('stool-bar-tractor', 'כיסא בר מושב טרקטור', ['טרקטור', 'מתכת', 'תעשייתי', 'רטרו', 'גובה בר'], [SEAT('#b8322a')], stool({ sh: 0.75, seat: 'tractor', base: 'tripod' }), [0.48, 0.48, 0.8]),
];

const OFFICE_CHAIRS: FurnitureDef[] = [
  office('office-chair-mesh', 'כיסא ארגונומי רשת עם משענת ראש', ['ארגונומי', 'רשת', 'משענת ראש', 'גלגלים'], [UPH('#2b2d31'), slot('mesh', 'רשת', '#3a3d42')], officeChair({ back: 'mesh', arms: 'T', base: 'black', head: true }), [0.66, 0.66, 1.3]),
  office('office-chair-executive', 'כיסא מנהלים מעור', ['מנהלים', 'עור', 'גב גבוה', 'כרום'], [UPH('#3b2a22')], officeChair({ back: 'exec', arms: 'loop', base: 'chrome' }), [0.66, 0.66, 1.25]),
  office('office-chair-task', 'כיסא עבודה פשוט', ['פשוט', 'בד', 'גלגלים', 'ללא ידיות'], [UPH('#46617a')], officeChair({ back: 'task', arms: 'none', base: 'black' }), [0.66, 0.66, 1.0]),
  office('office-chair-gaming', 'כיסא גיימינג', ['גיימינג', 'מירוץ', 'דו-גוני', 'כריות'], [UPH('#1d1e21'), slot('accent', 'צבע הדגשה', '#c0282d')], officeChair({ back: 'gaming', arms: 'gaming', base: 'black' }), [0.66, 0.66, 1.36]),
  office('office-chair-drafting', 'כיסא שרטוט גבוה', ['שרטוט', 'גבוה', 'טבעת רגליים', 'דלפק'], [UPH('#5b5f66')], officeChair({ back: 'task', arms: 'none', base: 'black', ring: true, sh: 0.7 }), [0.66, 0.66, 1.22]),
  office('office-chair-kneeling', 'כיסא ברכיים ארגונומי', ['ארגונומי', 'ברכיים', 'עץ', 'נדנוד'], [WOOD('#c9a777'), UPH('#8a8f96')], kneelingChair(), [0.44, 0.56, 0.62]),
  office('office-chair-ball', 'כיסא כדור פיזיו', ['כדור', 'פיזיו', 'ארגונומי', 'גלגלים'], [slot('ball', 'כדור', '#8ea5b7'), FRAME('#2a2b2e')], ballChair(), [0.5, 0.6, 0.85]),
  office('office-chair-visitor', 'כיסא אורח לחדר ישיבות', ['אורח', 'ישיבות', 'עור', 'כרום', 'ידיות'], [UPH('#24252a')], visitorChair(), [0.56, 0.56, 0.9]),
  office('office-chair-conference', 'כיסא ישיבות מסתובב', ['ישיבות', 'מסתובב', 'עור', 'אלומיניום'], [UPH('#e7e2d9')], officeChair({ back: 'conf', arms: 'loop', base: 'alu', casters: false }), [0.66, 0.66, 1.03]),
  office('office-chair-saddle', 'כיסא אוכף ארגונומי', ['אוכף', 'ארגונומי', 'גלגלים', 'ללא גב'], [UPH('#2f2f31')], officeChair({ back: 'none', arms: 'none', base: 'black', saddle: true, sh: 0.62 }), [0.66, 0.66, 0.64]),
];

export const CHAIRS: FurnitureDef[] = [...DINING_CHAIRS, ...STOOLS, ...OFFICE_CHAIRS];
