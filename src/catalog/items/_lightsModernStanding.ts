/** Modern floor and table lamps (see `_lightsModernKit.ts`). */
import * as THREE from 'three';
import type { FurnitureDef, ItemSize } from '../types';
import { D, INK_SOFT, LINE_THIN, M, smoothProfile, tint, type Kit, type V3 } from '../kit';
import { slot } from './_parts';
import {
  NEUTRAL,
  WARM,
  WARM27,
  bandGeo,
  clamp,
  cordMat,
  cordPath,
  innerGlow,
  lamp,
  lampSym,
  led,
  ns,
  opal,
  openCyl,
  powder,
  ribbedGeo,
  sub,
} from './_lightsModernKit';

const FLOOR = 'מנורות רצפה';
const TABLE = 'מנורות שולחן';
const dia = (s: ItemSize): number => Math.min(s.w, s.d);

function rotX(p: V3, a: number): V3 {
  return [p[0], p[1] * Math.cos(a) - p[2] * Math.sin(a), p[1] * Math.sin(a) + p[2] * Math.cos(a)];
}

/** Round base plate (lathe) with a soft edge; `h` tall, radius `r`. */
function basePlate(k: Kit, r: number, h: number, mat: THREE.Material, x = 0, z = 0, seg = 36): void {
  k.lathe(
    [
      [0, 0],
      [r - 0.004, 0],
      [r, 0.004],
      [r, h - 0.005],
      [r - 0.006, h],
      [0, h],
    ],
    mat,
    x,
    0,
    z,
    seg,
  );
}

/* ===================================================================== FLOOR */

const arcL = (s: ItemSize) => {
  const tr = 0.009;
  const bx = -s.w / 2 + 0.165;
  const hx = s.w / 2 - 0.095;
  const ry = 0.3;
  const cy = s.h - tr - ry;
  return { tr, bx, hx, ry, cy, cx: (bx + hx) / 2, rx: (hx - bx) / 2, yH0: cy - 0.046 };
};
const arcLed = lamp({
  id: 'mfloor-arc-led',
  name: 'מנורת קשת מודרנית עם ראש לד',
  group: FLOOR,
  tags: ['קשת', 'לד', 'בטון', 'מינימליסטי', 'מעל ספה', 'מנורת עמידה'],
  size: { w: 1.45, d: 0.34, h: 2.0 },
  resize: { w: [1.0, 2.0], h: [1.6, 2.3] },
  colors: [slot('body', 'גוף', '#1d1d1f'), slot('base', 'בסיס', '#a3a09a')],
  light: { color: WARM, intensity: 56, distance: 7.5 },
  at: (s) => {
    const L = arcL(s);
    return [L.hx, L.yH0 - 0.04, 0];
  },
  build: (k, g, c, s) => {
    const { tr, bx, hx, ry, cy, cx, rx, yH0 } = arcL(s);
    const body = powder(c.body);
    basePlate(k, 0.162, 0.046, M.stone(c.base, 0.82), bx, 0, 40);
    const pts: V3[] = [
      [bx, 0.04, 0],
      [bx, cy * 0.35, 0],
      [bx, cy * 0.7, 0],
    ];
    for (let i = 0; i <= 18; i++) {
      const t = Math.PI - (Math.PI * i) / 18;
      pts.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t), 0]);
    }
    pts.push([hx, cy - 0.012, 0]);
    k.tube(pts, tr, body, { radial: 8, seg: 90 });
    k.cyl(0.016, 0.055, body, bx, 0.55, 0, 0.016, 14);
    k.cyl(0.013, 0.02, body, hx, cy - 0.02, 0, 0.011, 12);
    k.cyl(0.09, 0.028, body, hx, yH0, 0, 0.084, 40);
    ns(g.cyl(0.08, 0.003, opal('#ffffff', 1.7), hx, yH0 - 0.003, 0, 0.08, 36));
    cordPath(k, [[bx - 0.02, 0.02, -0.15], [bx - 0.03, 0.006, -0.165], [bx + 0.1, 0.005, -0.168]], cordMat('#1f1f21'), 0.0028);
  },
  plan: (ctx, c, s) => {
    const { bx, hx } = arcL(s);
    D.line(ctx, bx, 0, hx, 0, INK_SOFT, 0.018);
    D.circle(ctx, bx, 0, 0.162, tint(c.base, 0.3), INK_SOFT, LINE_THIN);
    lampSym(ctx, 0.09, tint(c.body, 0.6), true, hx, 0);
  },
});

const cornerPole = lamp({
  id: 'mfloor-corner-pole',
  name: 'עמוד לד פינתי',
  group: FLOOR,
  tags: ['פינה', 'עמוד לד', 'מינימליסטי', 'אלומיניום', 'תאורת אווירה', 'מנורת עמידה'],
  size: { w: 0.22, d: 0.22, h: 1.45 },
  resize: { h: [0.8, 1.9] },
  colors: [slot('body', 'גוף', '#cfd2d4'), slot('base', 'בסיס', '#2a2a2c')],
  light: { color: NEUTRAL, intensity: 34, distance: 6 },
  at: (s) => [0, s.h * 0.55, 0.03],
  build: (k, g, c, s) => {
    const alu = M.brushed(c.body);
    const base = powder(c.base);
    basePlate(k, 0.1, 0.022, base, 0, 0, 36);
    k.rbox(0.036, s.h - 0.022, 0.036, 0.006, alu, 0, 0.022, 0);
    ns(g.box(0.02, s.h - 0.1, 0.003, opal('#ffffff', 1.8, NEUTRAL), 0, 0.06, 0.0185));
    k.box(0.04, 0.006, 0.04, base, 0, s.h - 0.006, 0);
    k.cyl(0.009, 0.004, M.metal('#d9dadb', 0.2, 1), 0.06, 0.022, 0.03, 0.009, 14);
    cordPath(k, [[0, 0.01, -0.095], [0.005, 0.004, -0.106], [0.06, 0.004, -0.108]], cordMat('#1f1f21'), 0.0025);
  },
  plan: (ctx, c) => {
    D.circle(ctx, 0, 0, 0.1, tint(c.base, 0.55), INK_SOFT, LINE_THIN);
    D.rr(ctx, 0, 0, 0.036, 0.036, 0.006, tint(c.body, 0.3), INK_SOFT, LINE_THIN);
    D.line(ctx, -0.01, 0.019, 0.01, 0.019, '#e8d9b4', 0.006);
  },
});

const sphL = (s: ItemSize) => {
  const R = Math.min(s.w, s.d, s.h - 0.016) / 2;
  return { R, cy: 0.016 + R * 0.985 };
};
const sphereFloor = lamp({
  id: 'mfloor-sphere',
  name: 'כדור אור עומד על הרצפה',
  group: FLOOR,
  tags: ['כדור', 'אופל', 'רצפה', 'פינה', 'פיסולי', 'מנורת עמידה'],
  size: { w: 0.5, d: 0.5, h: 0.5 },
  resize: { w: [0.3, 0.8], d: [0.3, 0.8], h: [0.3, 0.8] },
  colors: [slot('glass', 'זכוכית', '#fbf9f4'), slot('base', 'בסיס', '#2a2a2c')],
  light: { color: WARM, intensity: 38, distance: 6 },
  at: (s) => [0, sphL(s).cy, 0],
  build: (k, g, c, s) => {
    const { R, cy } = sphL(s);
    k.cyl(R * 0.42, 0.016, powder(c.base), 0, 0, 0, R * 0.4, 32);
    ns(g.sphere(R, opal(c.glass, 0.95), 0, cy, 0, 1, 1, 1, 36));
    cordPath(k, [[0, 0.008, -R * 0.4], [0.01, 0.004, -R * 0.6], [0.02, 0.004, -R + 0.005]], cordMat('#e9e6df'), 0.0028);
  },
  plan: (ctx, c, s) => lampSym(ctx, sphL(s).R, tint(c.glass, 0.1)),
});

const tpL = (s: ItemSize) => {
  const rho = dia(s) / 2 - 0.03;
  const hub = s.h * 0.56;
  const rH = 0.115;
  const L = 0.25;
  const py = s.h - 0.16;
  const rx = Math.PI / 2 - 0.22;
  return { rho, hub, rH, L, py, rx };
};
const tripodSpot = lamp({
  id: 'mfloor-tripod-spot',
  name: 'מנורת חצובה זרקור במה',
  group: FLOOR,
  tags: ['חצובה', 'זרקור', 'קולנוע', 'תעשייתי', 'לופט', 'מנורת עמידה'],
  size: { w: 0.72, d: 0.72, h: 1.65 },
  resize: { w: [0.55, 0.9], d: [0.55, 0.9], h: [1.3, 2.0] },
  colors: [slot('body', 'גוף', '#1c1c1e'), slot('legs', 'רגליים', '#2e2e30'), slot('detail', 'פרזול', '#c9ccce')],
  light: { color: WARM, intensity: 62, distance: 8 },
  at: (s) => {
    const { L, py, rx } = tpL(s);
    const p = rotX([0, L / 2 + 0.03, 0], rx);
    return [p[0], py + p[1], p[2]];
  },
  build: (k, g, c, s) => {
    const { rho, hub, rH, L, py, rx } = tpL(s);
    const body = powder(c.body);
    const legs = M.metal(c.legs, 0.45, 0.8);
    const det = M.metal(c.detail, 0.2, 1);
    for (let i = 0; i < 3; i++) {
      const a = Math.PI / 2 + (i * Math.PI * 2) / 3;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const foot: V3 = [ca * rho, 0.012, sa * rho];
      const mid: V3 = [ca * (rho * 0.5 + 0.015), hub * 0.5, sa * (rho * 0.5 + 0.015)];
      const top: V3 = [ca * 0.03, hub, sa * 0.03];
      k.rod(foot, mid, 0.0085, legs, 0.0085, 8);
      k.rod(mid, top, 0.0115, legs, 0.0115, 8);
      k.rod([mid[0] - ca * 0.003, mid[1] - 0.02, mid[2] - sa * 0.003], [mid[0], mid[1] + 0.02, mid[2]], 0.0145, det, 0.0145, 10);
      k.sphere(0.014, M.rubber('#151516'), foot[0], 0.012, foot[2], 1, 0.85, 1, 10);
      // spider brace to the column
      k.rod([ca * (rho * 0.62), hub * 0.38, sa * (rho * 0.62)], [ca * 0.015, hub * 0.46, sa * 0.015], 0.005, legs, 0.005, 6);
    }
    k.cyl(0.03, 0.06, det, 0, hub - 0.03, 0, 0.026, 16);
    k.cyl(0.012, py - 0.11 - (hub - 0.08), legs, 0, hub - 0.08, 0, 0.012, 10);
    k.cyl(0.018, 0.04, det, 0, hub + 0.2, 0, 0.018, 12);
    // yoke
    const xs = rH + 0.016;
    k.tube(
      [
        [-xs, py, 0],
        [-xs, py - 0.1, 0],
        [-xs + 0.02, py - 0.12, 0],
        [xs - 0.02, py - 0.12, 0],
        [xs, py - 0.1, 0],
        [xs, py, 0],
      ],
      0.007,
      body,
      { radial: 6, seg: 40, tension: 0.2 },
    );
    for (const sg of [-1, 1]) k.rod([sg * (xs - 0.006), py, 0], [sg * (xs + 0.018), py, 0], 0.017, det, 0.017, 14);
    // drum head: built along its local +Y, rotated so the beam points forward and a little up
    const hk = sub(k, 0, py, 0, rx);
    const gk = sub(g, 0, py, 0, rx);
    hk.geo(openCyl(rH, rH, L, 36), body, 0, -L / 2, 0);
    hk.cyl(rH * 0.96, 0.012, body, 0, -L / 2 - 0.004, 0, rH, 36);
    for (let j = 0; j < 4; j++) hk.cyl(rH + 0.004, 0.006, body, 0, -L / 2 + 0.02 + j * 0.022, 0, rH + 0.004, 36);
    hk.geo(openCyl(rH + 0.006, rH + 0.006, 0.022, 36), det, 0, L / 2 - 0.022, 0);
    hk.geo(new THREE.RingGeometry(rH * 0.86, rH + 0.006, 36).rotateX(-Math.PI / 2), det, 0, L / 2, 0);
    ns(gk.cyl(rH * 0.86, 0.004, opal('#fffaf0', 1.6), 0, L / 2 - 0.006, 0, rH * 0.86, 36));
    for (const r of [0.35, 0.6]) ns(gk.geo(new THREE.TorusGeometry(rH * r, 0.0015, 4, 32).rotateX(Math.PI / 2), M.glass('#ffffff', 0.5), 0, L / 2 - 0.0015, 0));
    const f = rho / 0.34;
    cordPath(
      k,
      [
        [0, hub - 0.06, -0.02],
        [-0.05 * f, hub * 0.6, -0.05 * f],
        [-0.12 * f, 0.15, -0.11 * f],
        [-0.18 * f, 0.03, -0.17 * f],
        [-0.2 * f, 0.007, -0.21 * f],
        [-0.23 * f, 0.0045, -0.3 * f],
      ],
      cordMat('#151516'),
      0.003,
    );
  },
  plan: (ctx, c, s) => {
    const { rho, rH } = tpL(s);
    for (let i = 0; i < 3; i++) {
      const a = Math.PI / 2 + (i * Math.PI * 2) / 3;
      D.line(ctx, 0, 0, Math.cos(a) * rho, Math.sin(a) * rho, INK_SOFT, 0.014);
    }
    D.rr(ctx, 0, 0.02, 2 * rH, 0.26, 0.02, tint(c.body, 0.55), INK_SOFT, LINE_THIN);
    D.line(ctx, -rH, 0.15, rH, 0.15, tint(c.detail, 0.1), 0.012);
  },
});

const mcL = (s: ItemSize) => {
  const Rd = dia(s) / 2 - 0.012;
  const ya = s.h * 0.6;
  return { Rd, ya, armEnd: [Math.min(0.15, dia(s) / 2 - 0.05), ya + 0.16, 0.05] as V3 };
};
const motherChild = lamp({
  id: 'mfloor-uplight-reader',
  name: 'מנורת רצפה מאירה לתקרה עם זרוע קריאה',
  group: FLOOR,
  tags: ['אם וילד', 'תאורה עקיפה', 'קריאה', 'דימר', 'לד', 'מנורת עמידה'],
  size: { w: 0.42, d: 0.42, h: 1.8 },
  resize: { w: [0.34, 0.52], d: [0.34, 0.52], h: [1.4, 2.0] },
  colors: [slot('body', 'גוף', '#2a2a2c'), slot('base', 'בסיס', '#3a3a3c'), slot('accent', 'טבעות', '#c9a35a')],
  light: { color: WARM, intensity: 60, distance: 7.5 },
  at: (s) => [0, s.h - 0.03, 0],
  build: (k, g, c, s) => {
    const { Rd, ya, armEnd } = mcL(s);
    const body = powder(c.body);
    const acc = M.metal(c.accent, 0.26, 1);
    basePlate(k, 0.15, 0.024, powder(c.base), 0, 0, 40);
    k.cyl(0.0125, s.h - 0.06 - 0.024, body, 0, 0.024, 0, 0.011, 12);
    const yD = s.h - 0.062;
    const dish: Array<[number, number]> = [
      [0.024, 0],
      [0.06, 0.012],
      [Rd * 0.72, 0.04],
      [Rd, 0.058],
      [Rd, 0.06],
    ];
    k.lathe(dish, body, 0, yD, 0, 48);
    ns(g.lathe(dish.map(([r, y]) => [Math.max(0.01, r - 0.003), y + 0.002] as [number, number]), innerGlow('#ffffff', 0.75), 0, yD, 0, 48));
    ns(g.cyl(0.05, 0.004, led(WARM, 2.2), 0, yD + 0.012, 0, 0.05, 24));
    k.ring(Rd, 0.0022, acc, 0, s.h - 0.0022, 0, 48);
    k.cyl(0.02, 0.03, acc, 0, yD - 0.03, 0, 0.016, 16);
    // reading arm (gooseneck) with a small head
    k.cyl(0.018, 0.04, acc, 0, ya - 0.02, 0, 0.018, 14);
    const [ex, ey, ez] = armEnd;
    k.tube(
      [
        [0.012, ya, 0],
        [0.05, ya + 0.06, 0.005],
        [ex * 0.75, ya + 0.15, 0.02],
        [ex, ey, ez - 0.01],
      ],
      0.0055,
      body,
      { radial: 6, seg: 30 },
    );
    const hk = sub(k, ex, ey, ez, -0.55);
    const gk = sub(g, ex, ey, ez, -0.55);
    hk.geo(openCyl(0.034, 0.02, 0.07, 24), body, 0, -0.07, 0);
    hk.cyl(0.02, 0.006, body, 0, 0, 0, 0.012, 16);
    hk.ring(0.034, 0.0018, acc, 0, -0.07, 0, 24);
    ns(gk.cyl(0.026, 0.003, led(WARM, 2.0), 0, -0.05, 0, 0.026, 16));
  },
  plan: (ctx, c, s) => {
    const { Rd, armEnd } = mcL(s);
    D.circle(ctx, 0, 0, 0.15, tint(c.base, 0.55), INK_SOFT, LINE_THIN);
    lampSym(ctx, Rd, tint(c.body, 0.6) + 'dd');
    D.circle(ctx, armEnd[0], armEnd[2] + 0.02, 0.034, tint(c.body, 0.45), INK_SOFT, LINE_THIN);
  },
});

const tubeL = (s: ItemSize) => {
  const R = dia(s) / 2;
  return { R, rt: clamp(R * 0.48, 0.045, 0.075), y0: 0.058, y1: s.h - 0.03 };
};
const glowTube = lamp({
  id: 'mfloor-opal-tube',
  name: 'מנורת רצפה צינור אופל',
  group: FLOOR,
  tags: ['צינור', 'אופל', 'אנכי', 'פליז', 'פינה', 'מנורת עמידה'],
  size: { w: 0.24, d: 0.24, h: 1.5 },
  resize: { w: [0.18, 0.32], d: [0.18, 0.32], h: [0.9, 1.9] },
  colors: [slot('glass', 'זכוכית', '#fdfbf6'), slot('metal', 'מתכת', '#c9a35a')],
  light: { color: WARM, intensity: 42, distance: 6.5 },
  at: (s) => {
    const L = tubeL(s);
    return [0, (L.y0 + L.y1) / 2, 0];
  },
  build: (k, g, c, s) => {
    const { R, rt, y0, y1 } = tubeL(s);
    const metal = M.brushed(c.metal);
    basePlate(k, R, 0.028, metal, 0, 0, 40);
    k.cyl(rt + 0.009, 0.03, metal, 0, 0.028, 0, rt + 0.006, 32);
    ns(g.cyl(rt, y1 - y0, opal(c.glass, 1.05), 0, y0, 0, rt, 32));
    k.cyl(rt + 0.006, 0.026, metal, 0, y1, 0, rt + 0.008, 32);
    k.cyl(rt * 0.5, 0.004, metal, 0, s.h - 0.004, 0, rt * 0.45, 20);
    cordPath(k, [[0, 0.01, -R + 0.01], [0, 0.004, -R + 0.002]], cordMat('#1f1f21'), 0.0028);
  },
  plan: (ctx, c, s) => {
    const { R, rt } = tubeL(s);
    D.circle(ctx, 0, 0, R, tint(c.metal, 0.4), INK_SOFT, LINE_THIN);
    lampSym(ctx, rt, tint(c.glass, 0.1));
  },
});

const csL = (s: ItemSize) => {
  const R = dia(s) / 2;
  const Hc = R * 1.15;
  return { R, Hc, yb: s.h - Hc - 0.012, rb: Math.min(0.15, R * 0.72) };
};
const coneShade = lamp({
  id: 'mfloor-cone-shade',
  name: 'מנורת רצפה אהיל קונוס',
  group: FLOOR,
  tags: ['קונוס', 'אהיל מתכת', 'שיש', 'פליז', 'קריאה', 'מנורת עמידה'],
  size: { w: 0.42, d: 0.42, h: 1.58 },
  resize: { w: [0.3, 0.56], d: [0.3, 0.56], h: [1.2, 1.9] },
  colors: [slot('shade', 'אהיל', '#d9cdbb'), slot('metal', 'גוף', '#c9a35a'), slot('base', 'בסיס', '#ece8e1')],
  light: { color: WARM, intensity: 52, distance: 7 },
  at: (s) => {
    const L = csL(s);
    return [0, L.yb + L.Hc * 0.4, 0];
  },
  build: (k, g, c, s) => {
    const { R, Hc, yb, rb } = csL(s);
    const metal = M.metal(c.metal, 0.28, 1);
    const shade = powder(c.shade);
    basePlate(k, rb, 0.03, M.marble(c.base), 0, 0, 40);
    k.cyl(0.024, 0.02, metal, 0, 0.03, 0, 0.016, 16);
    k.cyl(0.0085, yb + Hc - 0.05, metal, 0, 0.05, 0, 0.0085, 10);
    k.geo(openCyl(R, 0.042, Hc, 48), shade, 0, yb, 0);
    ns(g.geo(openCyl(R - 0.002, 0.04, Hc - 0.004, 48), innerGlow('#ffffff', 0.62), 0, yb, 0));
    k.ring(R - 0.0014, 0.0024, metal, 0, yb + 0.0024, 0, 48);
    k.cyl(0.044, 0.012, metal, 0, yb + Hc, 0, 0.036, 24);
    k.cyl(0.017, 0.07, metal, 0, yb + Hc - 0.09, 0, 0.017, 14);
    ns(g.sphere(0.03, led(WARM, 2.1), 0, yb + Hc * 0.4, 0, 1, 1.15, 1, 14));
    cordPath(k, [[0, 0.03, -rb + 0.02], [0, 0.005, -rb - 0.02], [0.04, 0.004, -R + 0.01]], cordMat('#1f1f21'), 0.0028);
  },
  plan: (ctx, c, s) => {
    const { R, rb } = csL(s);
    D.circle(ctx, 0, 0, rb, tint(c.base, 0.2), INK_SOFT, LINE_THIN);
    lampSym(ctx, R, tint(c.shade, 0.4) + 'dd');
    D.circle(ctx, 0, 0, 0.044, tint(c.metal, 0.3), INK_SOFT, LINE_THIN);
  },
});

/* ===================================================================== TABLE */

/** Slim hourglass stem (meters at scale 1). */
const PORT_STEM: Array<[number, number]> = [
  [0, 0],
  [0.05, 0],
  [0.052, 0.006],
  [0.047, 0.016],
  [0.03, 0.05],
  [0.016, 0.13],
  [0.014, 0.18],
  [0.02, 0.215],
];
const portL = (s: ItemSize) => ({ sc: Math.min(s.w / 0.15, s.d / 0.15, s.h / 0.26) });
const portable = lamp({
  id: 'mtable-portable',
  name: 'מנורה ניידת נטענת',
  group: TABLE,
  tags: ['נייד', 'נטען', 'אלחוטי', 'מרפסת', 'שולחן אוכל', 'מגע', 'מנורת שולחן'],
  size: { w: 0.15, d: 0.15, h: 0.26 },
  resize: { w: [0.1, 0.22], d: [0.1, 0.22], h: [0.18, 0.38] },
  colors: [slot('body', 'גוף', '#2f4b43'), slot('shade', 'כיפה', '#2f4b43'), slot('strap', 'רצועה', '#8a5a3b')],
  light: { color: WARM27, intensity: 13, distance: 3.5 },
  at: (s) => [0, 0.205 * portL(s).sc, 0],
  build: (k, g, c, s) => {
    const { sc } = portL(s);
    const body = M.paint(c.body, 0.55);
    k.lathe(
      smoothProfile(PORT_STEM.map(([r, y]) => [r * sc, y * sc]), 18).concat([[0, 0.215 * sc]]),
      body,
      0,
      0,
      0,
      32,
    );
    // flat saucer head with a soft lip; the LED diffuser underneath
    const y0 = 0.212 * sc;
    const shade: Array<[number, number]> = [
      [0.075, 0],
      [0.0755, 0.006],
      [0.072, 0.016],
      [0.06, 0.03],
      [0.035, 0.042],
      [0, 0.046],
    ];
    k.lathe(shade.map(([r, y]) => [r * sc, y * sc] as [number, number]), M.paint(c.shade, 0.55), 0, y0, 0, 40);
    ns(g.cyl(0.07 * sc, 0.003, opal('#ffffff', 1.5, WARM27), 0, y0 - 0.0015, 0, 0.07 * sc, 32));
    // touch dimmer dot on top
    k.cyl(0.006 * sc, 0.0015, M.metal('#d9dadb', 0.2, 1), 0, y0 + 0.046 * sc - 0.0005, 0, 0.006 * sc, 12);
    // leather carry loop through the neck of the stem
    const strap = M.leather(c.strap);
    const ys = 0.17 * sc;
    const loop = new THREE.TorusGeometry(0.026 * sc, 0.0035 * sc, 4, 20);
    loop.scale(1, 1.25, 0.35);
    k.geo(loop, strap, 0.012 * sc + 0.026 * sc, ys, 0);
  },
  plan: (ctx, c, s) => {
    const { sc } = portL(s);
    lampSym(ctx, 0.075 * sc, tint(c.shade, 0.4));
    D.circle(ctx, 0, 0, 0.006 * sc, INK_SOFT, null);
  },
});

const gbL = (s: ItemSize) => {
  const R = Math.min(s.w, s.d, s.h - 0.05) / 2;
  const hb = s.h - 2 * R + 0.012;
  return { R, hb, rb: clamp(R * 0.55, 0.045, 0.1), cy: hb + R - 0.012 };
};
const globeBase = lamp({
  id: 'mtable-globe-base',
  name: 'מנורת שולחן כדור אופל על בסיס אבן',
  group: TABLE,
  tags: ['כדור', 'זכוכית אופל', 'טרוורטין', 'אבן', 'שידה', 'מנורת שולחן'],
  size: { w: 0.26, d: 0.26, h: 0.36 },
  resize: { w: [0.18, 0.4], d: [0.18, 0.4], h: [0.26, 0.56] },
  colors: [slot('glass', 'זכוכית', '#fbf8f1'), slot('base', 'בסיס', '#d9cbb2')],
  light: { color: WARM, intensity: 18, distance: 4.5 },
  at: (s) => [0, gbL(s).cy, 0],
  build: (k, g, c, s) => {
    const { R, hb, rb, cy } = gbL(s);
    k.lathe(
      [
        [0, 0],
        [rb - 0.004, 0],
        [rb, 0.004],
        [rb, hb - 0.006],
        [rb - 0.005, hb],
        [R * 0.42, hb],
        [R * 0.34, hb - 0.008],
        [0, hb - 0.008],
      ],
      M.stone(c.base, 0.6),
      0,
      0,
      0,
      40,
    );
    ns(g.sphere(R, opal(c.glass, 0.95), 0, cy, 0, 1, 1, 1, 32));
    cordPath(k, [[0, 0.008, -rb + 0.005], [0, 0.004, -rb - 0.01], [0.03, 0.004, -s.d / 2 + 0.005]], cordMat('#e9e6df'), 0.0025);
  },
  plan: (ctx, c, s) => {
    const { R, rb } = gbL(s);
    lampSym(ctx, R, tint(c.glass, 0.1));
    D.circle(ctx, 0, 0, rb, null, tint(c.base, 0.0), LINE_THIN);
  },
});

const archL = (s: ItemSize) => {
  const zb = -s.d / 2 + 0.08;
  const p2: V3 = [0, s.h - 0.06, s.d / 2 - 0.035];
  const p0: V3 = [0, 0.07, zb];
  const p1: V3 = [0, s.h - 0.012, zb + (p2[2] - zb) * 0.28];
  return { zb, p0, p1, p2, yHead: p2[1] - 0.04 };
};
const architect = lamp({
  id: 'mtable-architect-led',
  name: 'מנורת שולחן אדריכל לד שטוחה',
  group: TABLE,
  tags: ['אדריכל', 'לד', 'שולחן עבודה', 'מתכוונן', 'אלומיניום', 'משרד', 'מנורת שולחן'],
  size: { w: 0.3, d: 0.5, h: 0.55 },
  resize: { w: [0.22, 0.45], d: [0.36, 0.7], h: [0.4, 0.75] },
  colors: [slot('body', 'גוף', '#d9dadb'), slot('joint', 'מפרקים', '#d24a32')],
  light: { color: NEUTRAL, intensity: 20, distance: 4.5 },
  at: (s) => {
    const L = archL(s);
    return [0, L.yHead - 0.02, L.p2[2]];
  },
  build: (k, g, c, s) => {
    const { zb, p0, p1, p2, yHead } = archL(s);
    const alu = M.brushed(c.body);
    const joint = powder(c.joint);
    k.rbox(0.16, 0.022, 0.16, 0.008, alu, 0, 0, zb);
    k.rbox(0.032, 0.05, 0.032, 0.004, alu, 0, 0.02, zb);
    for (const sg of [-1, 1]) {
      k.beam([sg * 0.011, p0[1], p0[2]], [sg * 0.011, p1[1], p1[2]], 0.004, 0.014, alu);
      k.beam([sg * 0.011, p1[1], p1[2]], [sg * 0.011, p2[1], p2[2]], 0.004, 0.012, alu);
    }
    for (const p of [p0, p1, p2]) k.rod([-0.019, p[1], p[2]], [0.019, p[1], p[2]], 0.009, joint, 0.009, 14);
    k.box(0.016, p2[1] - yHead - 0.012, 0.012, alu, 0, yHead + 0.012, p2[2]);
    k.rbox(s.w, 0.014, 0.05, 0.005, alu, 0, yHead, p2[2]);
    ns(g.box(s.w - 0.02, 0.002, 0.036, opal('#ffffff', 1.8, NEUTRAL), 0, yHead - 0.0015, p2[2]));
    k.cyl(0.006, 0.003, joint, 0.05, 0.022, zb + 0.04, 0.006, 12);
  },
  plan: (ctx, c, s) => {
    const { zb, p2 } = archL(s);
    D.rr(ctx, 0, zb, 0.16, 0.16, 0.01, tint(c.body, 0.3), INK_SOFT, LINE_THIN);
    D.line(ctx, 0, zb, 0, p2[2], INK_SOFT, 0.012);
    D.rr(ctx, 0, p2[2], s.w, 0.05, 0.005, tint(c.body, 0.2), INK_SOFT, LINE_THIN);
  },
});

const ringL = (s: ItemSize) => {
  const Ro = Math.min(s.w / 2, (s.h - 0.022) / 2);
  return { Ro, cy: 0.022 + Ro - 0.002 };
};
const ledRing = lamp({
  id: 'mtable-led-ring',
  name: 'מנורת שולחן טבעת לד',
  group: TABLE,
  tags: ['טבעת', 'לד', 'פיסולי', 'זהב', 'שידה', 'מנורת שולחן'],
  size: { w: 0.32, d: 0.12, h: 0.35 },
  resize: { w: [0.2, 0.5], h: [0.22, 0.55] },
  colors: [slot('body', 'טבעת', '#c9a35a'), slot('base', 'בסיס', '#2a2a2c')],
  light: { color: WARM, intensity: 16, distance: 4 },
  at: (s) => [0, ringL(s).cy, 0],
  build: (k, g, c, s) => {
    const { Ro, cy } = ringL(s);
    const metal = M.metal(c.body, 0.26, 1);
    const depth = 0.024;
    const bw = 0.022;
    const seg = Math.round(clamp(Ro * 220, 48, 96));
    const ring = bandGeo(Ro - bw, Ro, depth, seg);
    ring.translate(0, -depth / 2, 0);
    ring.rotateX(Math.PI / 2);
    k.geo(ring, metal, 0, cy, 0);
    const lip = openCyl(Ro - bw - 0.0006, Ro - bw - 0.0006, depth * 0.7, seg);
    lip.translate(0, -depth * 0.35, 0);
    lip.rotateX(Math.PI / 2);
    ns(g.geo(lip, innerGlow('#ffffff', 1.1), 0, cy, 0));
    k.rbox(Math.min(s.w * 0.62, 0.18), 0.024, s.d - 0.01, 0.01, powder(c.base), 0, 0, 0);
  },
  plan: (ctx, c, s) => {
    const { Ro } = ringL(s);
    D.rr(ctx, 0, 0, Math.min(s.w * 0.62, 0.18), s.d - 0.01, 0.01, tint(c.base, 0.55), INK_SOFT, LINE_THIN);
    D.rr(ctx, 0, 0, 2 * Ro, 0.024, 0.006, tint(c.body, 0.3), INK_SOFT, LINE_THIN);
  },
});

const gcL = (s: ItemSize) => {
  const R = dia(s) / 2;
  const hb = 0.04;
  return { R, hb, rg: R - 0.008, Hg: s.h - hb };
};
const glassCylinder = lamp({
  id: 'mtable-ribbed-cylinder',
  name: 'מנורת שולחן גליל זכוכית מחורצת',
  group: TABLE,
  tags: ['זכוכית מחורצת', 'ענבר', 'פילמנט', 'עץ', 'וינטג\' מודרני', 'מנורת שולחן'],
  size: { w: 0.14, d: 0.14, h: 0.3 },
  resize: { w: [0.1, 0.22], d: [0.1, 0.22], h: [0.2, 0.45] },
  colors: [slot('glass', 'זכוכית', '#e5c497'), slot('base', 'בסיס', '#7a5236'), slot('metal', 'מתכת', '#c9a35a')],
  light: { color: WARM27, intensity: 14, distance: 4 },
  at: (s) => {
    const L = gcL(s);
    return [0, L.hb + L.Hg * 0.45, 0];
  },
  build: (k, g, c, s) => {
    const { R, hb, rg, Hg } = gcL(s);
    basePlate(k, R, hb, M.wood(c.base, 0.5), 0, 0, 36);
    const prof: Array<[number, number]> = [
      [rg, 0],
      [rg, Hg - 0.026],
      [rg * 0.93, Hg - 0.008],
      [rg * 0.6, Hg],
      [0, Hg],
    ];
    ns(k.geo(ribbedGeo(prof, 22, 0.05, 2), M.glass(c.glass, 0.36), 0, hb, 0));
    const metal = M.metal(c.metal, 0.26, 1);
    k.cyl(0.017, 0.03, metal, 0, hb, 0, 0.015, 16);
    ns(g.cyl(0.005, Hg * 0.66, led(WARM27, 2.6), 0, hb + 0.03, 0, 0.005, 8));
    ns(g.sphere(0.009, M.glow('#ffc87a', 1.4, '#ffe8c4'), 0, hb + 0.03 + Hg * 0.66, 0, 1, 1, 1, 8));
    cordPath(k, [[0, 0.01, -R + 0.004], [0, 0.004, -R + 0.001]], cordMat('#1f1f21'), 0.0025);
  },
  plan: (ctx, c, s) => {
    const { R, rg } = gcL(s);
    D.circle(ctx, 0, 0, R, tint(c.base, 0.4), INK_SOFT, LINE_THIN);
    lampSym(ctx, rg, tint(c.glass, 0.35) + 'dd');
  },
});

const stL = (s: ItemSize) => {
  const R1 = dia(s) / 2;
  const radii = [R1, R1 * 0.78, R1 * 0.56];
  const hd = radii.map((r) => r * 0.42);
  const yb1 = s.h * 0.34;
  const step = (s.h - 0.016 - hd[2] - yb1) / 2;
  return { radii, hd, ys: [yb1, yb1 + step, yb1 + 2 * step] };
};
const stacked = lamp({
  id: 'mtable-stacked-domes',
  name: 'מנורת שולחן שלוש כיפות אופל מוערמות',
  group: TABLE,
  tags: ['כיפות', 'מוערם', 'זכוכית אופל', 'פגודה', 'פליז', 'מנורת שולחן'],
  size: { w: 0.26, d: 0.26, h: 0.5 },
  resize: { w: [0.18, 0.38], d: [0.18, 0.38], h: [0.36, 0.72] },
  colors: [slot('glass', 'זכוכית', '#fbf6ec'), slot('metal', 'מתכת', '#c9a35a')],
  light: { color: WARM, intensity: 20, distance: 4.5 },
  at: (s) => {
    const L = stL(s);
    return [0, L.ys[1] + L.hd[1] * 0.3, 0];
  },
  build: (k, g, c, s) => {
    const { radii, hd, ys } = stL(s);
    const metal = M.metal(c.metal, 0.26, 1);
    basePlate(k, Math.min(0.075, radii[0] * 0.55), 0.018, metal, 0, 0, 32);
    k.cyl(0.005, s.h - 0.018 - 0.014, metal, 0, 0.018, 0, 0.005, 10);
    const glass = opal(c.glass, 0.9, WARM, THREE.DoubleSide);
    radii.forEach((r, i) => {
      const H = hd[i];
      const prof: Array<[number, number]> = [
        [r, 0],
        [r * 0.97, H * 0.22],
        [r * 0.86, H * 0.5],
        [r * 0.62, H * 0.8],
        [r * 0.3, H * 0.97],
        [0.008, H],
      ];
      ns(g.lathe(prof, glass, 0, ys[i], 0, 40));
      k.cyl(0.011, 0.012, metal, 0, ys[i] + H - 0.004, 0, 0.008, 12);
      ns(g.sphere(0.013, led(WARM, 2.0), 0, ys[i] + H * 0.4, 0, 1, 1, 1, 10));
    });
    k.sphere(0.009, metal, 0, s.h - 0.009, 0, 1, 1, 1, 12);
    cordPath(k, [[0, 0.008, -0.06], [0, 0.004, -0.08], [0.02, 0.004, -s.d / 2 + 0.005]], cordMat('#e9e6df'), 0.0025);
  },
  plan: (ctx, c, s) => {
    const { radii } = stL(s);
    lampSym(ctx, radii[0], tint(c.glass, 0.1));
    D.circle(ctx, 0, 0, radii[1], null, INK_SOFT, LINE_THIN);
    D.circle(ctx, 0, 0, radii[2], null, INK_SOFT, LINE_THIN);
  },
});

export const MODERN_STANDING: FurnitureDef[] = [
  arcLed,
  cornerPole,
  sphereFloor,
  tripodSpot,
  motherChild,
  glowTube,
  coneShade,
  portable,
  globeBase,
  architect,
  ledRing,
  glassCylinder,
  stacked,
];
