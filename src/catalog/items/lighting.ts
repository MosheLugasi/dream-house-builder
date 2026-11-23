import * as THREE from 'three';
import type { FurnitureDef } from '../types';
import { D, INK_SOFT, Kit, LINE_THIN, M, PAL, smoothProfile, sym, tint, type Ctx2D } from '../kit';
import { slot } from './_parts';

const CEILING = 2.7;
const WARM = '#ffe1b5';

/** plan symbol for a light source: circle with a small cross */
function lampSymbol(ctx: Ctx2D, r: number, fill: string, dashed = false): void {
  if (dashed) ctx.setLineDash([0.04, 0.03]);
  D.circle(ctx, 0, 0, r, fill);
  ctx.setLineDash([]);
  const k = r * 0.5;
  D.line(ctx, -k, -k, k, k, INK_SOFT, LINE_THIN);
  D.line(ctx, -k, k, k, -k, INK_SOFT, LINE_THIN);
}

/** open drum / cone shade */
function shadeGeo(rBot: number, rTop: number, h: number): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(rTop, rBot, h, 32, 1, true);
}

const floorLamp: FurnitureDef = {
  id: 'floor-lamp',
  name: 'מנורת עמידה',
  category: 'lighting',
  size: { w: 0.46, d: 0.46, h: 1.62 },
  colors: [slot('shade', 'אהיל', PAL.cream), slot('metal', 'מתכת', PAL.brass)],
  light: { x: 0, y: 1.42, z: 0, color: WARM, intensity: 55, distance: 7 },
  actions: [{ kind: 'light' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const metal = M.metal(c.metal, 0.32, 1);
    k.lathe(
      [
        [0, 0],
        [0.15, 0],
        [0.152, 0.012],
        [0.14, 0.02],
        [0.03, 0.028],
        [0.012, 0.05],
        [0.011, 1.3],
        [0, 1.3],
      ],
      metal,
      0,
      0,
      0,
      28,
    );
    // shade with top ring spokes and a glowing bulb
    const sh = k.geo(shadeGeo(0.23, 0.2, 0.32), M.shade(c.shade), 0, 1.46, 0);
    sh.castShadow = false;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      k.rod([0, 1.3, 0], [Math.cos(a) * 0.2, 1.615, Math.sin(a) * 0.2], 0.003, metal, 0.003, 6);
    }
    k.cyl(0.018, 0.06, metal, 0, 1.3, 0, 0.018, 10);
    k.sphere(0.045, M.glow(WARM, 2.2), 0, 1.4, 0, 1, 1.15, 1, 12).castShadow = false;
    return k.g;
  },
  draw2d: (ctx, c) => sym(ctx, () => lampSymbol(ctx, 0.23, tint(c.shade, 0.5))),
};

const tableLamp: FurnitureDef = {
  id: 'table-lamp',
  name: 'מנורת שולחן',
  category: 'lighting',
  size: { w: 0.28, d: 0.28, h: 0.48 },
  colors: [slot('shade', 'אהיל', PAL.cream), slot('base', 'בסיס', PAL.dustyBlue)],
  light: { x: 0, y: 0.36, z: 0, color: WARM, intensity: 22, distance: 5 },
  actions: [{ kind: 'light' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    k.lathe(
      smoothProfile([
        [0, 0],
        [0.055, 0],
        [0.075, 0.03],
        [0.085, 0.09],
        [0.07, 0.16],
        [0.035, 0.21],
        [0.02, 0.235],
        [0.02, 0.25],
        [0, 0.25],
      ]),
      M.ceramic(c.base),
      0,
      0,
      0,
      24,
    );
    k.cyl(0.012, 0.05, M.brass(), 0, 0.25, 0, 0.012, 10);
    const sh = k.geo(shadeGeo(0.14, 0.1, 0.2), M.shade(c.shade), 0, 0.38, 0);
    sh.castShadow = false;
    k.sphere(0.035, M.glow(WARM, 2.2), 0, 0.35, 0, 1, 1.1, 1, 10).castShadow = false;
    return k.g;
  },
  draw2d: (ctx, c) => sym(ctx, () => lampSymbol(ctx, 0.14, tint(c.shade, 0.5))),
};

const pendant: FurnitureDef = {
  id: 'pendant-lamp',
  name: 'מנורת תלייה',
  category: 'lighting',
  size: { w: 0.44, d: 0.44, h: 0.9 },
  mount: 'ceiling',
  colors: [slot('shade', 'אהיל', PAL.sage), slot('inner', 'פנים', PAL.white)],
  light: { x: 0, y: CEILING - 0.82, z: 0, color: WARM, intensity: 70, distance: 8 },
  actions: [{ kind: 'light' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const top = CEILING;
    const bottom = CEILING - 0.9;
    k.cyl(0.05, 0.025, M.paint(c.shade, 0.4), 0, top - 0.025, 0, 0.05, 20);
    k.cyl(0.003, 0.9 - 0.025 - 0.24, M.rubber('#2a2a2c'), 0, bottom + 0.24, 0, 0.003, 6);
    // dome: outer painted metal, inner white
    const profile: Array<[number, number]> = [
      [0.22, 0],
      [0.215, 0.06],
      [0.19, 0.13],
      [0.14, 0.19],
      [0.07, 0.228],
      [0.028, 0.24],
      [0.024, 0.27],
      [0, 0.27],
    ];
    k.lathe(profile, M.paint(c.shade, 0.4), 0, bottom, 0, 32);
    const inner = k.lathe(
      profile.slice(0, 6).map(([r, y]) => [r - 0.004, y - 0.003] as [number, number]),
      M.glow(WARM, 0.55, c.inner, THREE.BackSide),
      0,
      bottom + 0.003,
      0,
      32,
    );
    inner.castShadow = false;
    k.sphere(0.04, M.glow(WARM, 2.4), 0, bottom + 0.09, 0, 1, 1.15, 1, 12).castShadow = false;
    return k.g;
  },
  draw2d: (ctx, c) => sym(ctx, () => lampSymbol(ctx, 0.22, tint(c.shade, 0.5) + 'cc', true)),
};

const ceilingLight: FurnitureDef = {
  id: 'ceiling-light',
  name: 'מנורת תקרה צמודה',
  category: 'lighting',
  size: { w: 0.42, d: 0.42, h: 0.1 },
  mount: 'ceiling',
  colors: [slot('rim', 'מסגרת', PAL.white)],
  light: { x: 0, y: CEILING - 0.16, z: 0, color: '#fff0d8', intensity: 95, distance: 9 },
  actions: [{ kind: 'light' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const y0 = CEILING - 0.1;
    k.cyl(0.21, 0.045, M.paint(c.rim, 0.4), 0, CEILING - 0.045, 0, 0.2, 36);
    const dome = k.lathe(
      [
        [0, 0],
        [0.1, 0.008],
        [0.17, 0.03],
        [0.2, 0.057],
        [0.2, 0.06],
      ],
      M.glow('#fff0d8', 1.5),
      0,
      y0,
      0,
      36,
    );
    dome.castShadow = false;
    return k.g;
  },
  draw2d: (ctx, c) => sym(ctx, () => lampSymbol(ctx, 0.21, tint(c.rim, 0.6) + 'cc', true)),
};

const ceilingSpot: FurnitureDef = {
  id: 'ceiling-spot',
  name: 'ספוט תקרה',
  category: 'lighting',
  size: { w: 0.11, d: 0.11, h: 0.12 },
  mount: 'ceiling',
  colors: [slot('body', 'גוף', PAL.white)],
  light: { x: 0, y: CEILING - 0.2, z: 0, color: '#fff0d8', intensity: 40, distance: 6 },
  actions: [{ kind: 'light' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const y0 = CEILING - 0.12;
    k.cyl(0.055, 0.12, M.paint(c.body, 0.4), 0, y0, 0, 0.055, 24);
    k.cyl(0.044, 0.002, M.glow('#fff0d8', 2.4), 0, y0 - 0.0005, 0, 0.044, 24).castShadow = false;
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      // drawn a little larger than life so it stays readable on a plan
      D.circle(ctx, 0, 0, 0.055, tint(c.body, 0.6));
      D.line(ctx, -0.03, 0, 0.03, 0, INK_SOFT, 0.008);
      D.line(ctx, 0, -0.03, 0, 0.03, INK_SOFT, 0.008);
    }),
};

export const LIGHTING: FurnitureDef[] = [floorLamp, tableLamp, pendant, ceilingLight, ceilingSpot];
