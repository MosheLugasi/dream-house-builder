import type * as THREE from 'three';
import { U_LANDING } from '../../model/stairs';
import type { FurnitureDef } from '../types';
import { D, INK_SOFT, Kit, LINE_THIN, M, PAL, bake, sym, tint } from '../kit';
import { slot } from './_parts';

/**
 * Stairs. They are ordinary catalog items so that placing, moving and rotating them works like
 * furniture; `stair` makes the engine cut the opening in the floor above and lets the character
 * climb them (see model/stairs.ts for the shared geometry).
 */
const DEFAULT_RISE = 3.0;
const GAP = 0.1; // between the two flights of a U stair

interface FlightOpts {
  /** center x and width of the flight */
  cx: number;
  width: number;
  /** z where the flight starts and ends (it may run toward -z) */
  z0: number;
  z1: number;
  /** heights at start / end */
  y0: number;
  y1: number;
  /** which sides get a handrail: -1 = -x side, 1 = +x side */
  rails: number[];
}

function flight(k: Kit, o: FlightOpts, tread: THREE.Material, frame: THREE.Material, rail: THREE.Material): void {
  const rise = o.y1 - o.y0;
  const n = Math.max(2, Math.round(rise / 0.175));
  const run = o.z1 - o.z0;
  const stepD = Math.abs(run) / n;
  const stepH = rise / n;
  const dir = Math.sign(run);
  for (let i = 0; i < n; i++) {
    const zc = o.z0 + dir * stepD * (i + 0.5);
    const top = o.y0 + stepH * (i + 1);
    // riser block + slightly overhanging tread board
    // (Kit.box takes the height of the box's BOTTOM)
    k.box(o.width - 0.08, stepH - 0.035, stepD, frame, o.cx, top - stepH, zc);
    k.box(o.width - 0.06, 0.035, stepD + 0.025, tread, o.cx, top - 0.035, zc - dir * 0.0125);
  }
  // stringers and handrails follow the slope
  const hw = o.width / 2 - 0.02;
  for (const s of [-1, 1]) {
    const x = o.cx + s * hw;
    k.beam([x, o.y0 - 0.02, o.z0], [x, o.y1 - 0.02, o.z1], 0.04, 0.3, frame);
  }
  for (const s of o.rails) {
    const x = o.cx + s * hw;
    const lift = 0.92;
    k.rod([x, o.y0 + stepH + lift, o.z0], [x, o.y1 + lift, o.z1], 0.022, rail);
    const posts = Math.max(2, Math.round(Math.abs(run) / 0.9) + 1);
    for (let i = 0; i < posts; i++) {
      const t = i / (posts - 1);
      const z = o.z0 + run * t;
      const y = o.y0 + stepH + (rise - stepH) * t;
      k.rod([x, y - stepH, z], [x, y + lift, z], 0.014, rail);
    }
  }
}

const colors = [slot('tread', 'מדרכים', PAL.oak), slot('frame', 'גוף המדרגות', PAL.white), slot('rail', 'מעקה', PAL.charcoal)];

const stairsStraight: FurnitureDef = {
  id: 'stairs-straight',
  name: 'מדרגות ישרות',
  category: 'structure',
  size: { w: 1.0, d: 4.2, h: DEFAULT_RISE },
  stair: { type: 'straight' },
  noBake: true,
  colors,
  build: ({ colors: c, rise = DEFAULT_RISE }) => {
    const k = new Kit();
    flight(k, { cx: 0, width: 1.0, z0: -2.1, z1: 2.1, y0: 0, y1: rise, rails: [-1, 1] }, M.wood(c.tread), M.paint(c.frame), M.metal(c.rail, 0.5, 0.7));
    return bake(k.g, 'stairs-straight');
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 1.0, 4.2, 0, tint(c.tread, 0.55));
      for (let i = 1; i < 16; i++) D.line(ctx, -0.5, -2.1 + i * (4.2 / 16), 0.5, -2.1 + i * (4.2 / 16), INK_SOFT, 0.008);
      // arrow pointing up the stairs
      D.line(ctx, 0, -1.8, 0, 1.75, INK_SOFT, LINE_THIN);
      D.poly(ctx, [[-0.14, 1.5], [0, 1.8], [0.14, 1.5]], false, null, INK_SOFT, LINE_THIN);
      D.circle(ctx, 0, -1.8, 0.05, INK_SOFT, null);
    }),
};

const U_W = 2.1;
const U_D = 3.3;

const stairsU: FurnitureDef = {
  id: 'stairs-u',
  name: 'מדרגות עם פודסט',
  category: 'structure',
  size: { w: U_W, d: U_D, h: DEFAULT_RISE },
  stair: { type: 'u' },
  noBake: true,
  colors,
  build: ({ colors: c, rise = DEFAULT_RISE }) => {
    const k = new Kit();
    const tread = M.wood(c.tread);
    const frame = M.paint(c.frame);
    const rail = M.metal(c.rail, 0.5, 0.7);
    const fw = (U_W - GAP) / 2;
    const zEnd = U_D / 2 - U_LANDING;
    flight(k, { cx: -(GAP + fw) / 2, width: fw, z0: -U_D / 2, z1: zEnd, y0: 0, y1: rise / 2, rails: [-1] }, tread, frame, rail);
    flight(k, { cx: (GAP + fw) / 2, width: fw, z0: zEnd, z1: -U_D / 2, y0: rise / 2, y1: rise, rails: [1] }, tread, frame, rail);
    // landing
    k.box(U_W, 0.14, U_LANDING, frame, 0, rise / 2 - 0.14 - 0.035, U_D / 2 - U_LANDING / 2);
    k.box(U_W - 0.02, 0.035, U_LANDING, tread, 0, rise / 2 - 0.035, U_D / 2 - U_LANDING / 2);
    // landing rail along the far end and the outer side
    const y = rise / 2 + 0.92;
    const hw = U_W / 2 - 0.02;
    const zf = U_D / 2 - 0.02;
    k.rod([-hw, y, zf], [hw, y, zf], 0.022, rail);
    k.rod([-hw, y, zEnd], [-hw, y, zf], 0.022, rail);
    for (const x of [-hw, 0, hw]) k.rod([x, rise / 2, zf], [x, y, zf], 0.014, rail);
    // divider between the two flights
    k.box(GAP - 0.02, rise / 2 + 1.0, 0.06, frame, 0, 0, zEnd - 0.03);
    return bake(k.g, 'stairs-u');
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const hw = U_W / 2;
      const hd = U_D / 2;
      const zEnd = hd - U_LANDING;
      D.rr(ctx, 0, 0, U_W, U_D, 0, tint(c.tread, 0.55));
      const steps = 8;
      for (let i = 1; i <= steps; i++) {
        const z = -hd + (i * (U_D - U_LANDING)) / steps;
        D.line(ctx, -hw, z, -GAP / 2, z, INK_SOFT, 0.008);
        D.line(ctx, GAP / 2, z, hw, z, INK_SOFT, 0.008);
      }
      D.box(ctx, -GAP / 2, -hd, GAP / 2, zEnd, 0, '#ffffff', INK_SOFT, 0.008);
      // walking line: up the left flight, across the landing, back down the right flight
      const xl = -(hw + GAP / 2) / 2;
      const xr = (hw + GAP / 2) / 2;
      D.poly(ctx, [[xl, -hd + 0.25], [xl, hd - 0.5], [xr, hd - 0.5], [xr, -hd + 0.3]], false, null, INK_SOFT, LINE_THIN);
      D.poly(ctx, [[xr - 0.14, -hd + 0.58], [xr, -hd + 0.28], [xr + 0.14, -hd + 0.58]], false, null, INK_SOFT, LINE_THIN);
      D.circle(ctx, xl, -hd + 0.25, 0.05, INK_SOFT, null);
    }),
};

export const STRUCTURE: FurnitureDef[] = [stairsStraight, stairsU];
