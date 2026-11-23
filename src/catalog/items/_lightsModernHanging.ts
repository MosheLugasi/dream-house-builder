/** Modern pendants and chandeliers (see `_lightsModernKit.ts` for the conventions). */
import * as THREE from 'three';
import type { FurnitureDef, ItemSize } from '../types';
import { D, INK_SOFT, Kit, LINE_THIN, M, mix, smoothProfile, tint, type V3 } from '../kit';
import { slot } from './_parts';
import {
  CEIL,
  CORD,
  NEUTRAL,
  WARM,
  WARM27,
  annulusGeo,
  bandGeo,
  canopy,
  clamp,
  cordMat,
  cordPath,
  innerGlow,
  lamp,
  lampSym,
  dashRect,
  led,
  ns,
  opal,
  openCyl,
  pleatedGeo,
  powder,
  ribbedGeo,
  vcord,
} from './_lightsModernKit';

const PEND = 'מנורות תלייה';
const CHAND = 'נברשות';
const dia = (s: ItemSize): number => Math.min(s.w, s.d);

/* ===================================================================== PENDANTS */

/** Thick-walled concrete bell with a lit copper inside and a frosted diffuser. */
const domeL = (s: ItemSize) => {
  const sc = Math.min(dia(s) / 0.34, (s.h - 0.1) / 0.3);
  return { sc, R: 0.17 * sc, H: 0.3 * sc, y0: CEIL - s.h, t: 0.011 * sc };
};
const concreteDome = lamp({
  id: 'mpend-concrete-dome',
  name: 'מנורת תלייה פעמון בטון',
  group: PEND,
  tags: ['בטון', 'פעמון', 'כיפה', 'תעשייתי', 'מודרני', 'אי מטבח', 'נחושת', 'מנורת תלייה'],
  size: { w: 0.34, d: 0.34, h: 1.0 },
  resize: { w: [0.22, 0.56], d: [0.22, 0.56], h: [0.42, 1.8] },
  mount: 'ceiling',
  colors: [slot('body', 'בטון', '#a19e98'), slot('inner', 'פנים', '#c8895a'), slot('cord', 'כבל', '#2a2a2c')],
  light: { color: WARM, intensity: 72, distance: 8 },
  at: (s) => {
    const L = domeL(s);
    return [0, L.y0 + L.H * 0.3, 0];
  },
  build: (k, g, c, s) => {
    const { R, H, y0, t } = domeL(s);
    const conc = M.stone(c.body, 0.85);
    // bell: nearly straight lower walls, rounded shoulder, short neck
    const prof: Array<[number, number]> = [
      [R, 0],
      [R * 0.995, H * 0.12],
      [R * 0.975, H * 0.36],
      [R * 0.93, H * 0.56],
      [R * 0.82, H * 0.72],
      [R * 0.62, H * 0.84],
      [R * 0.36, H * 0.9],
      [R * 0.2, H * 0.92],
      [R * 0.17, H],
      [0, H],
    ];
    k.lathe(prof, conc, 0, y0, 0, 40);
    k.geo(annulusGeo(R - t, R, 40, true), conc, 0, y0, 0);
    const inner = prof.slice(0, 7).map(([r, y]) => [Math.max(0.004, r - t), y + t * 0.3] as [number, number]);
    ns(g.lathe(inner, innerGlow(c.inner, 0.5), 0, y0, 0, 40));
    // frosted diffuser and the bulb behind it
    ns(g.cyl(R * 0.84, 0.004, opal('#ffffff', 1.25), 0, y0 + H * 0.14, 0, R * 0.84, 36));
    ns(g.sphere(R * 0.18, led(WARM, 2.2), 0, y0 + H * 0.34, 0, 1, 1.15, 1, 12));
    canopy(k, 0.055, conc, 0.03);
    k.cyl(0.011, 0.02, cordMat(c.cord), 0, y0 + H, 0, 0.008, 10);
    vcord(k, 0, 0, y0 + H + 0.02, CEIL - 0.03, cordMat(c.cord), 0.003);
  },
  plan: (ctx, c, s) => {
    const { R, t } = domeL(s);
    lampSym(ctx, R, tint(c.body, 0.4) + 'cc', true);
    D.circle(ctx, 0, 0, R - t, null, INK_SOFT, LINE_THIN);
  },
});

/** Tall slim metal cone with an oak cap. */
const coneL = (s: ItemSize) => {
  const sc = Math.min(dia(s) / 0.22, (s.h - 0.1) / 0.42);
  return { sc, R: 0.11 * sc, r: 0.03 * sc, Hc: 0.36 * sc, Hcap: 0.06 * sc, y0: CEIL - s.h };
};
const coneSlim = lamp({
  id: 'mpend-cone-slim',
  name: 'מנורת תלייה קונוס צר עם כובע עץ',
  group: PEND,
  tags: ['קונוס', 'עץ אלון', 'סקנדינבי', 'מעל שולחן', 'מודרני', 'מנורת תלייה'],
  size: { w: 0.22, d: 0.22, h: 1.0 },
  resize: { w: [0.14, 0.4], d: [0.14, 0.4], h: [0.45, 1.8] },
  mount: 'ceiling',
  colors: [slot('shade', 'אהיל', '#35403a'), slot('wood', 'עץ', '#b8895a'), slot('cord', 'כבל', '#2a2a2c')],
  light: { color: WARM, intensity: 62, distance: 7.5 },
  at: (s) => {
    const L = coneL(s);
    return [0, L.y0 + L.Hc * 0.26, 0];
  },
  build: (k, g, c, s) => {
    const { sc, R, r, Hc, Hcap, y0 } = coneL(s);
    const paint = powder(c.shade);
    const wood = M.wood(c.wood, 0.5);
    k.geo(openCyl(R, r, Hc, 40), paint, 0, y0, 0);
    ns(g.geo(openCyl(R - 0.0015, r - 0.0015, Hc - 0.003, 40), innerGlow('#ffffff', 0.62), 0, y0, 0));
    k.ring(R - 0.0012, 0.0022, paint, 0, y0 + 0.0022, 0, 40);
    // oak cap with a turned top
    k.lathe(
      [
        [0, 0],
        [r * 1.06, 0],
        [r * 1.08, Hcap * 0.15],
        [r * 1.02, Hcap * 0.8],
        [r * 0.7, Hcap],
        [0, Hcap],
      ],
      wood,
      0,
      y0 + Hc - 0.003,
      0,
      24,
    );
    // socket and a small frosted LED globe low in the cone
    k.cyl(0.013 * sc, Hc * 0.55, paint, 0, y0 + Hc * 0.42, 0, 0.013 * sc, 12);
    ns(g.sphere(0.027 * sc, led(WARM, 2.1), 0, y0 + Hc * 0.26, 0, 1, 1.12, 1, 14));
    canopy(k, 0.045, wood, 0.026);
    vcord(k, 0, 0, y0 + Hc + Hcap - 0.004, CEIL - 0.026, cordMat(c.cord), 0.0028);
  },
  plan: (ctx, c, s) => {
    const { R, r } = coneL(s);
    lampSym(ctx, R, tint(c.shade, 0.5) + 'cc', true);
    D.circle(ctx, 0, 0, r * 1.08, tint(c.wood, 0.3), INK_SOFT, LINE_THIN);
  },
});

/** Big ribbed smoked-glass bubble lit from the inside, brass collar. */
const bubbleL = (s: ItemSize) => {
  const sc = Math.min(dia(s) / 0.3, (s.h - 0.1) / 0.345);
  const R = 0.15 * sc;
  const Ry = R * 0.94;
  const y0 = CEIL - s.h;
  const cy = y0 + Ry;
  const capY = cy + Ry * 0.9;
  return { sc, R, Ry, y0, cy, capY, top: capY + 0.07 * sc };
};
const bubbleSmoked = lamp({
  id: 'mpend-bubble-smoked',
  name: 'מנורת תלייה בועת זכוכית מעושנת',
  group: PEND,
  tags: ['זכוכית מעושנת', 'זכוכית מחורצת', 'בועה', 'פליז', 'יוקרתי', 'מנורת תלייה'],
  size: { w: 0.3, d: 0.3, h: 0.95 },
  resize: { w: [0.2, 0.5], d: [0.2, 0.5], h: [0.45, 1.8] },
  mount: 'ceiling',
  colors: [slot('glass', 'זכוכית', '#5b4a3a'), slot('metal', 'מתכת', '#b8935a'), slot('cord', 'כבל', '#2a2a2c')],
  light: { color: WARM, intensity: 66, distance: 8 },
  at: (s) => [0, bubbleL(s).cy, 0],
  build: (k, g, c, s) => {
    const { sc, R, Ry, cy, capY, top } = bubbleL(s);
    const metal = M.metal(c.metal, 0.26, 1);
    const prof: Array<[number, number]> = [];
    const a1 = 1.2;
    for (let i = 0; i <= 12; i++) {
      const a = -Math.PI / 2 + (i / 12) * (Math.PI / 2 + a1);
      prof.push([R * Math.cos(a), Ry * Math.sin(a)]);
    }
    prof.push([R * Math.cos(a1) * 0.98, Ry * Math.sin(a1) + 0.012 * sc]);
    ns(k.geo(ribbedGeo(prof, 26, 0.035, 2), M.glass(c.glass, 0.5), 0, cy, 0));
    // the inside of the smoked bubble glows when lit
    ns(g.sphere(R * 0.95, innerGlow(c.glass, 0.5, mix(WARM, c.glass, 0.3)), 0, cy, 0, 1, 0.94, 1, 24));
    ns(g.sphere(0.042 * sc, opal('#ffffff', 1.9), 0, cy, 0, 1, 1, 1, 16));
    k.cyl(0.014 * sc, capY - cy - 0.03 * sc, metal, 0, cy + 0.03 * sc, 0, 0.014 * sc, 12);
    k.lathe(
      [
        [R * 0.4, 0],
        [R * 0.41, 0.012 * sc],
        [R * 0.36, 0.03 * sc],
        [0.02 * sc, 0.06 * sc],
        [0.011 * sc, top - capY],
        [0, top - capY],
      ],
      metal,
      0,
      capY,
      0,
      28,
    );
    canopy(k, 0.055, metal, 0.026);
    vcord(k, 0, 0, top, CEIL - 0.026, cordMat(c.cord), 0.0028);
  },
  plan: (ctx, c, s) => {
    const { R } = bubbleL(s);
    lampSym(ctx, R, tint(c.glass, 0.45) + 'cc', true);
    D.circle(ctx, 0, 0, R * 0.4, tint(c.metal, 0.35), INK_SOFT, LINE_THIN);
  },
});

/** LED halo ring on three steel wires. */
const haloL = (s: ItemSize) => ({ R: dia(s) / 2, y0: CEIL - s.h, bw: 0.03, bh: 0.034 });
const haloRing = lamp({
  id: 'mpend-halo-ring',
  name: 'טבעת לד תלויה (הילה)',
  group: PEND,
  tags: ['טבעת', 'הילה', 'לד', 'מינימליסטי', 'כבלי פלדה', 'מעל שולחן', 'מנורת תלייה'],
  size: { w: 0.6, d: 0.6, h: 0.8 },
  resize: { w: [0.35, 1.2], d: [0.35, 1.2], h: [0.25, 1.8] },
  mount: 'ceiling',
  colors: [slot('body', 'גוף', '#2b2b2d'), slot('wire', 'כבלים', '#b9bcbf')],
  light: { color: NEUTRAL, intensity: 78, distance: 8.5 },
  at: (s) => [0, haloL(s).y0 + 0.01, 0],
  build: (k, g, c, s) => {
    const { R, y0, bw, bh } = haloL(s);
    const body = powder(c.body);
    const wire = M.metal(c.wire, 0.32, 1);
    const seg = Math.round(clamp(R * 190, 64, 128));
    const rIn = R - bw;
    k.geo(bandGeo(rIn, R, bh - 0.003, seg), body, 0, y0 + 0.003, 0);
    ns(g.geo(bandGeo(rIn + 0.004, R - 0.004, 0.0035, seg), opal('#ffffff', 1.7, NEUTRAL), 0, y0, 0));
    ns(g.geo(openCyl(rIn - 0.0006, rIn - 0.0006, 0.01, seg), innerGlow('#ffffff', 0.8, NEUTRAL), 0, y0 + 0.004, 0));
    canopy(k, 0.065, body, 0.024);
    const rw = R - bw / 2;
    for (let i = 0; i < 3; i++) {
      const a = Math.PI / 2 + (i * Math.PI * 2) / 3;
      const p: V3 = [Math.cos(a) * rw, y0 + bh, Math.sin(a) * rw];
      k.rod(p, [Math.cos(a) * 0.03, CEIL - 0.024, Math.sin(a) * 0.03], 0.0011, wire, 0.0011, 4);
      k.cyl(0.004, 0.012, wire, p[0], p[1], p[2], 0.0028, 8);
    }
    // power lead hanging in a soft curve beside the first wire
    const a = Math.PI / 2 + 0.12;
    const yTop = CEIL - 0.024;
    const yBot = y0 + bh;
    const pts: V3[] = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      const rr = 0.02 + (rw - 0.02) * t;
      const sag = Math.sin(t * Math.PI) * 0.035;
      pts.push([Math.cos(a) * rr - Math.sin(a) * sag * 0.4, yTop + (yBot - yTop) * t, Math.sin(a) * rr + Math.cos(a) * sag * 0.4]);
    }
    cordPath(k, pts, cordMat(c.body), 0.0022);
  },
  plan: (ctx, c, s) => {
    const { R, bw } = haloL(s);
    ctx.setLineDash([0.04, 0.03]);
    D.circle(ctx, 0, 0, R - 0.003, null, INK_SOFT, 0.02);
    ctx.setLineDash([]);
    D.circle(ctx, 0, 0, R - bw, null, INK_SOFT, LINE_THIN);
    D.circle(ctx, 0, 0, R - bw / 2, null, tint(c.body, 0.5), LINE_THIN);
    D.circle(ctx, 0, 0, 0.06, '#ffffffcc', INK_SOFT, LINE_THIN);
  },
});

/** Slim cylinder with a brass mouth ring and a recessed opal disc. */
const cylL = (s: ItemSize) => {
  const sc = Math.min(dia(s) / 0.12, (s.h - 0.1) / 0.36);
  return { sc, r: 0.06 * sc, L: 0.34 * sc, y0: CEIL - s.h };
};
const cylinder = lamp({
  id: 'mpend-cylinder',
  name: 'מנורת תלייה גליל צר',
  group: PEND,
  tags: ['גליל', 'צינור', 'מינימליסטי', 'בר', 'אי מטבח', 'מנורת תלייה'],
  size: { w: 0.12, d: 0.12, h: 1.0 },
  resize: { w: [0.08, 0.24], d: [0.08, 0.24], h: [0.45, 1.8] },
  mount: 'ceiling',
  colors: [slot('body', 'גוף', '#ece9e2'), slot('ring', 'טבעת', '#c9a35a'), slot('cord', 'כבל', '#e9e6df')],
  light: { color: WARM, intensity: 58, distance: 7.5 },
  at: (s) => {
    const L = cylL(s);
    return [0, L.y0 + 0.05 * L.sc, 0];
  },
  build: (k, g, c, s) => {
    const { sc, r, L, y0 } = cylL(s);
    const body = powder(c.body);
    const ring = M.metal(c.ring, 0.26, 1);
    const mouth = 0.026 * sc;
    k.geo(openCyl(r, r, mouth, 32), ring, 0, y0, 0);
    k.geo(openCyl(r, r, L - mouth, 32), body, 0, y0 + mouth, 0);
    k.ring(r - 0.0015, 0.0016, ring, 0, y0 + 0.0016, 0, 32);
    k.cyl(r, 0.006, body, 0, y0 + L - 0.006, 0, r * 0.96, 32);
    ns(g.geo(openCyl(r - 0.0018, r - 0.0018, 0.034 * sc, 32), innerGlow('#ffffff', 0.75), 0, y0, 0));
    ns(g.cyl(r - 0.003, 0.003, opal('#ffffff', 1.7), 0, y0 + 0.034 * sc, 0, r - 0.003, 32));
    k.cyl(0.011, 0.018, ring, 0, y0 + L, 0, 0.008, 12);
    canopy(k, 0.045, body, 0.024);
    vcord(k, 0, 0, y0 + L + 0.018, CEIL - 0.024, cordMat(c.cord), 0.0026);
  },
  plan: (ctx, c, s) => {
    const { r } = cylL(s);
    lampSym(ctx, r, tint(c.body, 0.2) + 'cc', true);
    D.circle(ctx, 0, 0, r * 0.85, null, tint(c.ring, 0.1), LINE_THIN);
  },
});

/** Pleated fabric lantern (oval) with brass rings. */
const pleatL = (s: ItemSize) => {
  const sc = Math.min(dia(s) / 0.46, (s.h - 0.12) / 0.42);
  // the pleats stand out by `amp` beyond the profile
  return { sc, R: 0.216 * sc, H: 0.4 * sc, y0: CEIL - s.h };
};
const PLEAT_PROFILE: Array<[number, number]> = [
  [0.44, 0],
  [0.66, 0.05],
  [0.87, 0.17],
  [0.98, 0.36],
  [0.99, 0.5],
  [0.92, 0.68],
  [0.72, 0.85],
  [0.46, 0.96],
  [0.3, 1.0],
];
const pleated = lamp({
  id: 'mpend-pleated',
  name: 'מנורת תלייה אהיל קפלים אובלי',
  group: PEND,
  tags: ['אהיל קפלים', 'בד', 'פנס', 'רך', 'חדר שינה', 'סלון', 'מנורת תלייה'],
  size: { w: 0.46, d: 0.46, h: 1.0 },
  resize: { w: [0.3, 0.72], d: [0.3, 0.72], h: [0.55, 1.8] },
  mount: 'ceiling',
  colors: [slot('shade', 'אהיל', '#efe6d6'), slot('metal', 'פרזול', '#c9a35a'), slot('cord', 'כבל', '#e6dfd2')],
  light: { color: WARM27, intensity: 64, distance: 8 },
  at: (s) => {
    const L = pleatL(s);
    return [0, L.y0 + L.H * 0.45, 0];
  },
  build: (k, g, c, s) => {
    const { sc, R, H, y0 } = pleatL(s);
    const metal = M.metal(c.metal, 0.3, 1);
    const prof = smoothProfile(
      PLEAT_PROFILE.map(([r, y]) => [r * R, y * H]),
      16,
    );
    ns(g.geo(pleatedGeo(prof, 36, 0.014 * sc), M.shade(c.shade), 0, y0, 0));
    k.ring(0.44 * R, 0.0025, metal, 0, y0 + 0.0025, 0, 28);
    k.ring(0.3 * R, 0.0025, metal, 0, y0 + H - 0.0025, 0, 24);
    // spider + socket + bulb
    const ys = y0 + H * 0.62;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.4;
      k.rod([0, ys + 0.03 * sc, 0], [Math.cos(a) * 0.3 * R, y0 + H - 0.003, Math.sin(a) * 0.3 * R], 0.0016, metal, 0.0016, 4);
    }
    k.cyl(0.016 * sc, H * 0.38, metal, 0, ys, 0, 0.016 * sc, 12);
    ns(g.sphere(0.036 * sc, led(WARM27, 2.2), 0, y0 + H * 0.45, 0, 1, 1.15, 1, 14));
    canopy(k, 0.05, metal, 0.024);
    vcord(k, 0, 0, y0 + H, CEIL - 0.024, cordMat(c.cord), 0.0028);
  },
  plan: (ctx, c, s) => {
    const { R } = pleatL(s);
    lampSym(ctx, R * 0.99, tint(c.shade, 0.25) + 'cc', true);
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      D.line(ctx, Math.cos(a) * R * 0.5, Math.sin(a) * R * 0.5, Math.cos(a) * R * 0.97, Math.sin(a) * R * 0.97, INK_SOFT, LINE_THIN * 0.6);
    }
  },
});

/** Plug-in swag pendant: a big filament globe on a braided cord looped over two ceiling hooks. */
const swagL = (s: ItemSize) => {
  const rb = 0.0625;
  const y0 = CEIL - s.h;
  const xd = s.w / 2 - 0.09;
  return { rb, y0, xd, cy: y0 + rb, xl: -s.w / 2 + 0.035 };
};
const swag = lamp({
  id: 'mpend-plugin-swag',
  name: 'מנורת תלייה עם תקע ווו תלייה',
  group: PEND,
  tags: ['תקע', 'ללא חיווט', 'כבל קלוע', 'נורת פילמנט', 'שכירות', 'וו', 'מנורת תלייה'],
  size: { w: 0.9, d: 0.18, h: 0.9 },
  resize: { w: [0.45, 2.0], h: [0.45, 1.8] },
  mount: 'ceiling',
  colors: [slot('cord', 'כבל', '#c9a77c'), slot('socket', 'בית נורה', '#f2efe9'), slot('glass', 'זכוכית', '#f3e1bf')],
  light: { color: WARM27, intensity: 55, distance: 7.5 },
  at: (s) => {
    const L = swagL(s);
    return [L.xd, L.cy, 0];
  },
  build: (k, g, c, s) => {
    const { rb, y0, xd, cy, xl } = swagL(s);
    const porcelain = M.ceramic(c.socket);
    const braid = M.linen(c.cord);
    // G125 globe bulb
    const prof: Array<[number, number]> = [];
    for (let i = 0; i <= 10; i++) {
      const a = -Math.PI / 2 + (i / 10) * (Math.PI / 2 + 0.95);
      prof.push([rb * Math.cos(a), rb * Math.sin(a)]);
    }
    prof.push([0.022, rb + 0.022], [0.016, rb + 0.034], [0.016, rb + 0.04]);
    ns(k.lathe(prof, M.glass(c.glass, 0.3), xd, cy, 0, 28));
    // spiral LED filament on a glass stem
    const fil: V3[] = [];
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      const a = t * Math.PI * 2 * 3.2;
      const r = 0.022 * (1 - 0.45 * t);
      fil.push([xd + Math.cos(a) * r, cy + 0.03 - t * 0.055, Math.sin(a) * r]);
    }
    ns(g.tube(fil, 0.0014, M.glow('#ffb35c', 3.0, '#ffd9a0'), { radial: 3, seg: 90 }));
    ns(g.sphere(0.014, M.glow('#ffc87a', 1.3, '#ffe8c4'), xd, cy, 0, 1, 1.4, 1, 10));
    ns(k.cyl(0.0025, 0.07, M.glass('#ffffff', 0.35), xd, cy - 0.025, 0, 0.0025, 6));
    // E27 cap + ceramic socket with grooves
    const ys = cy + rb + 0.04;
    k.cyl(0.0165, 0.022, M.steel(), xd, ys - 0.002, 0, 0.0165, 14);
    k.cyl(0.022, 0.064, porcelain, xd, ys + 0.02, 0, 0.021, 18);
    for (const dy of [0.034, 0.046]) k.ring(0.0218, 0.0016, porcelain, xd, ys + 0.02 + dy, 0, 18);
    k.cyl(0.01, 0.012, porcelain, xd, ys + 0.084, 0, 0.007, 10);
    // hooks
    const hy = CEIL - 0.03;
    for (const x of [xd, xl]) {
      k.cyl(0.013, 0.006, porcelain, x, CEIL - 0.006, 0, 0.013, 14);
      k.cyl(0.0022, 0.012, M.steel(), x, CEIL - 0.017, 0, 0.0022, 6);
      const hook = k.geo(new THREE.TorusGeometry(0.0075, 0.0018, 5, 12, Math.PI * 1.3), M.steel(), x, hy + 0.002, 0);
      hook.rotation.z = Math.PI * 0.85;
    }
    // cord: straight up to the hook, over it, a soft swag to the second hook, then along the ceiling
    vcord(k, xd, 0, ys + 0.096, hy - 0.004, braid, 0.0032);
    const sag = clamp(0.06 + 0.09 * s.w, 0.08, Math.min(0.28, s.h - 0.3));
    const pts: V3[] = [[xd + 0.004, hy - 0.004, 0], [xd - 0.004, hy - 0.006, 0]];
    for (let i = 1; i <= 10; i++) {
      const t = i / 10;
      const x = xd - 0.004 + (xl + 0.006 - (xd - 0.004)) * t;
      pts.push([x, hy - 0.008 - sag * 4 * t * (1 - t), 0.012 * Math.sin(t * Math.PI)]);
    }
    pts.push([xl - 0.008, hy - 0.002, 0], [xl - 0.02, CEIL - 0.012, 0], [-s.w / 2 + 0.004, CEIL - 0.0045, 0]);
    cordPath(k, pts, braid, 0.0032);
  },
  plan: (ctx, c, s) => {
    const { rb, xd, xl } = swagL(s);
    ctx.setLineDash([0.03, 0.025]);
    D.line(ctx, -s.w / 2 + 0.005, 0, xd, 0, tint(c.cord, 0.1), 0.008);
    ctx.setLineDash([]);
    D.circle(ctx, xl, 0, 0.013, '#ffffff', INK_SOFT, LINE_THIN);
    lampSym(ctx, rb, tint(c.glass, 0.4) + 'dd', true, xd, 0);
  },
});

/** Seven ribbed-glass tubes at staggered drops from a round brass canopy. */
const CLU_F = [1.0, 0.42, 0.78, 0.18, 0.62, 0.05, 0.52];
const cluL = (s: ItemSize) => {
  const D0 = dia(s);
  const kk = clamp(D0 / 0.5, 0.8, 1.35);
  const rt = 0.038 * kk;
  const Lt = 0.2 * kk;
  const rho = D0 / 2 - rt - 0.004;
  const yLo = CEIL - s.h;
  const yHi = Math.max(yLo, CEIL - 0.03 - 0.1 - Lt - 0.02);
  const pos: Array<[number, number, number]> = [];
  for (let i = 0; i < 7; i++) {
    const [x, z] = i === 0 ? [0, 0] : [Math.cos(((i - 1) / 6) * Math.PI * 2 + 0.26) * rho, Math.sin(((i - 1) / 6) * Math.PI * 2 + 0.26) * rho];
    pos.push([x, z, yHi + (yLo - yHi) * CLU_F[i]]);
  }
  const midY = pos.reduce((a, p) => a + p[2], 0) / 7 + Lt / 2;
  return { rt, Lt, rho, pos, midY, kk };
};
const clusterTubes = lamp({
  id: 'mpend-cluster-tubes',
  name: 'אשכול שבעה גלילי זכוכית מחורצת',
  group: PEND,
  tags: ['אשכול', 'זכוכית מחורצת', 'פליז', 'חדר מדרגות', 'מבואה', 'מנורת תלייה'],
  size: { w: 0.5, d: 0.5, h: 1.15 },
  resize: { w: [0.36, 0.9], d: [0.36, 0.9], h: [0.7, 2.0] },
  mount: 'ceiling',
  colors: [slot('glass', 'זכוכית', '#efe3cf'), slot('metal', 'מתכת', '#c9a35a'), slot('cord', 'כבל', '#2a2a2c')],
  light: { color: WARM27, intensity: 80, distance: 8.5 },
  at: (s) => [0, cluL(s).midY, 0],
  build: (k, g, c, s) => {
    const { rt, Lt, rho, pos, kk } = cluL(s);
    const metal = M.metal(c.metal, 0.26, 1);
    const glass = M.glass(c.glass, 0.42);
    const fil = led(WARM27, 2.6);
    const cm = cordMat(c.cord);
    canopy(k, rho + 0.03, metal, 0.03);
    const gp: Array<[number, number]> = [
      [0, 0],
      [rt * 0.72, 0.002],
      [rt * 0.96, 0.012],
      [rt, 0.03],
      [rt, Lt - 0.006],
      [rt * 0.9, Lt],
    ];
    const gGeo = ribbedGeo(gp, 16, 0.07, 2);
    for (const [x, z, yb] of pos) {
      ns(k.geo(gGeo, glass, x, yb, z));
      k.cyl(rt * 0.95 + 0.002, 0.034 * kk, metal, x, yb + Lt - 0.014, z, rt * 0.5, 20);
      ns(g.cyl(0.0045, Lt * 0.62, fil, x, yb + Lt * 0.2, z, 0.0045, 6));
      vcord(k, x, z, yb + Lt + 0.02 * kk, CEIL - 0.03, cm, 0.0024);
    }
  },
  plan: (ctx, c, s) => {
    const { rt, rho, pos } = cluL(s);
    ctx.setLineDash([0.04, 0.03]);
    D.circle(ctx, 0, 0, rho + 0.03, tint(c.metal, 0.55) + '88', INK_SOFT, LINE_THIN);
    ctx.setLineDash([]);
    for (const [x, z] of pos) D.circle(ctx, x, z, rt, tint(c.glass, 0.3) + 'dd', INK_SOFT, LINE_THIN);
  },
});

/** Flat opal "UFO" disc on a brushed stem. */
const discL = (s: ItemSize) => {
  const R = dia(s) / 2 - 0.003;
  const T = Math.min(0.11 * (R / 0.247), s.h - 0.1);
  const y0 = CEIL - s.h;
  return { R, T, y0, yEq: y0 + T * 0.42 };
};
const opalDisc = lamp({
  id: 'mpend-opal-disc',
  name: 'מנורת תלייה דיסק אופל',
  group: PEND,
  tags: ['דיסק', 'עב"מ', 'זכוכית אופל', 'רטרו מודרני', 'סלון', 'מנורת תלייה'],
  size: { w: 0.5, d: 0.5, h: 0.8 },
  resize: { w: [0.3, 0.8], d: [0.3, 0.8], h: [0.25, 1.6] },
  mount: 'ceiling',
  colors: [slot('glass', 'זכוכית', '#f7f4ee'), slot('metal', 'מתכת', '#bfc2c4')],
  light: { color: WARM, intensity: 74, distance: 8.5 },
  at: (s) => {
    const L = discL(s);
    return [0, L.y0 + L.T * 0.45, 0];
  },
  build: (k, g, c, s) => {
    const { R, T, y0, yEq } = discL(s);
    const metal = M.brushed(c.metal);
    const prof: Array<[number, number]> = [];
    for (let i = 0; i <= 10; i++) {
      const r = (R * i) / 10;
      prof.push([r, T * 0.42 * (r / R) ** 2]);
    }
    for (let i = 9; i >= 0; i--) {
      const r = (R * i) / 10;
      prof.push([r, T * 0.42 + T * 0.58 * (1 - (r / R) ** 2)]);
    }
    ns(g.lathe(prof, opal(c.glass, 0.95), 0, y0, 0, 48));
    k.geo(openCyl(R + 0.002, R + 0.002, 0.014, 48), metal, 0, yEq - 0.007, 0);
    k.cyl(0.02, 0.014, metal, 0, y0 + T - 0.008, 0, 0.012, 16);
    k.cyl(0.006, CEIL - 0.024 - (y0 + T), metal, 0, y0 + T, 0, 0.006, 10);
    canopy(k, 0.05, metal, 0.024);
  },
  plan: (ctx, c, s) => {
    const { R } = discL(s);
    lampSym(ctx, R + 0.002, tint(c.glass, 0.2) + 'cc', true);
    D.circle(ctx, 0, 0, 0.02, tint(c.metal, 0.3), INK_SOFT, LINE_THIN);
  },
});

/* ===================================================================== CHANDELIERS */

/** Molecular branches with opal globes. Positions at sc = 1 relative to the hub. */
interface MolBranch {
  a: number;
  r: number;
  y: number;
  globes: Array<[number, number, number]>; // angle, radius, y
}
const MOL: MolBranch[] = [0, 1, 2, 3, 4].map((i) => {
  const a = (i / 5) * Math.PI * 2 + 0.17;
  const y = [0.05, -0.04, 0.08, -0.06, 0.02][i];
  const r = 0.17;
  return {
    a,
    r,
    y,
    globes: [
      [a - 0.38, i % 2 ? 0.37 : 0.34, y + 0.07],
      [a + 0.38, i % 2 ? 0.33 : 0.37, y - 0.07],
    ],
  };
});
const MOL_EXTRA: Array<[number, number, number]> = [
  [0, 0, -0.14],
  [3.5, 0.13, 0.12],
];
const molL = (s: ItemSize) => {
  const sc = Math.min(dia(s) / 0.9, (s.h - 0.12) / 0.4);
  return { sc, hub: CEIL - s.h + 0.19 * sc, rg: 0.05 * sc };
};
const molecular = lamp({
  id: 'mchand-molecular',
  name: 'נברשת מולקולרית ענפים וכדורי אופל',
  group: CHAND,
  tags: ['מולקולרי', 'ענפים', 'כדורי אופל', 'פליז', 'מודרני', 'פינת אוכל', 'נברשת'],
  size: { w: 0.9, d: 0.9, h: 0.85 },
  resize: { w: [0.6, 1.4], d: [0.6, 1.4], h: [0.55, 1.6] },
  mount: 'ceiling',
  colors: [slot('metal', 'מתכת', '#b8935a'), slot('glass', 'זכוכית', '#f6f2ea')],
  light: { color: WARM, intensity: 105, distance: 9 },
  at: (s) => [0, molL(s).hub, 0],
  build: (k, g, c, s) => {
    const { sc, hub, rg } = molL(s);
    const metal = M.brushed(c.metal);
    const glass = opal(c.glass, 1.05);
    const P = (a: number, r: number, y: number): THREE.Vector3 => new THREE.Vector3(Math.cos(a) * r * sc, hub + y * sc, Math.sin(a) * r * sc);
    const arr = (v: THREE.Vector3): V3 => [v.x, v.y, v.z];
    const globe = (from: THREE.Vector3, center: THREE.Vector3) => {
      const dir = center.clone().sub(from).normalize();
      const end = center.clone().addScaledVector(dir, -(rg + 0.008 * sc));
      k.rod(arr(from), arr(end), 0.0042 * sc, metal, 0.0042 * sc, 8);
      k.rod(arr(end), arr(center.clone().addScaledVector(dir, -rg * 0.72)), 0.011 * sc, metal, 0.017 * sc, 14);
      ns(g.sphere(rg, glass, center.x, center.y, center.z, 1, 1, 1, 18));
    };
    canopy(k, 0.06, metal, 0.026);
    k.cyl(0.0065, CEIL - 0.026 - hub, metal, 0, hub, 0, 0.0065, 10);
    k.sphere(0.022 * sc, metal, 0, hub, 0, 1, 1, 1, 14);
    const H = new THREE.Vector3(0, hub, 0);
    for (const b of MOL) {
      const n = P(b.a, b.r, b.y);
      k.rod(arr(H), arr(n), 0.0058 * sc, metal, 0.0058 * sc, 8);
      k.sphere(0.011 * sc, metal, n.x, n.y, n.z, 1, 1, 1, 10);
      for (const [a, r, y] of b.globes) globe(n, P(a, r, y));
    }
    for (const [a, r, y] of MOL_EXTRA) globe(H, P(a, r, y));
  },
  plan: (ctx, c, s) => {
    const { sc, rg } = molL(s);
    const P = (a: number, r: number): [number, number] => [Math.cos(a) * r * sc, Math.sin(a) * r * sc];
    ctx.setLineDash([0.04, 0.03]);
    D.circle(ctx, 0, 0, 0.42 * sc, '#ffffff66', INK_SOFT, LINE_THIN);
    ctx.setLineDash([]);
    for (const b of MOL) {
      const [nx, nz] = P(b.a, b.r);
      D.line(ctx, 0, 0, nx, nz, INK_SOFT, LINE_THIN);
      for (const [a, r] of b.globes) {
        const [x, z] = P(a, r);
        D.line(ctx, nx, nz, x, z, INK_SOFT, LINE_THIN);
        D.circle(ctx, x, z, rg, tint(c.glass, 0.2), INK_SOFT, LINE_THIN);
      }
    }
    const [x, z] = P(MOL_EXTRA[1][0], MOL_EXTRA[1][1]);
    D.circle(ctx, x, z, rg, tint(c.glass, 0.2), INK_SOFT, LINE_THIN);
    D.circle(ctx, 0, 0, rg, tint(c.glass, 0.2), INK_SOFT, LINE_THIN);
    D.circle(ctx, 0, 0, 0.022 * sc, tint(c.metal, 0.3), INK_SOFT, LINE_THIN);
  },
});

/** Three LED rings at stepped heights, each on its own steel wires. */
const tierL = (s: ItemSize) => {
  const R = dia(s) / 2;
  const y0 = CEIL - s.h;
  const step = clamp((s.h - 0.22) / 3, 0.05, 0.16);
  return { R, y0, step, rings: [R, R * 0.72, R * 0.46].map((r, i) => ({ r, y: y0 + i * step })) };
};
const tieredRings = lamp({
  id: 'mchand-tiered-rings',
  name: 'נברשת טבעות לד מדורגת',
  group: CHAND,
  tags: ['טבעות', 'לד', 'מדורג', 'זהב', 'חלל כפול', 'מודרני', 'נברשת'],
  size: { w: 0.8, d: 0.8, h: 0.9 },
  resize: { w: [0.5, 1.4], d: [0.5, 1.4], h: [0.45, 1.8] },
  mount: 'ceiling',
  colors: [slot('body', 'גוף', '#c9a35a'), slot('wire', 'כבלים', '#b9bcbf')],
  light: { color: NEUTRAL, intensity: 105, distance: 9 },
  at: (s) => {
    const L = tierL(s);
    return [0, L.y0 + L.step, 0];
  },
  build: (k, g, c, s) => {
    const { rings } = tierL(s);
    const body = M.metal(c.body, 0.3, 1);
    const wire = M.metal(c.wire, 0.32, 1);
    const diff = opal('#ffffff', 1.7, NEUTRAL);
    const lip = innerGlow('#ffffff', 0.8, NEUTRAL);
    rings.forEach(({ r, y }, i) => {
      const bw = 0.024;
      const bh = 0.028;
      const seg = Math.round(clamp(r * 190, 56, 128));
      k.geo(bandGeo(r - bw, r, bh - 0.003, seg), body, 0, y + 0.003, 0);
      ns(g.geo(bandGeo(r - bw + 0.004, r - 0.004, 0.0035, seg), diff, 0, y, 0));
      ns(g.geo(openCyl(r - bw - 0.0006, r - bw - 0.0006, 0.01, seg), lip, 0, y + 0.004, 0));
      for (let j = 0; j < 3; j++) {
        const a = (j / 3) * Math.PI * 2 + i * 0.7 + 0.3;
        const x = Math.cos(a) * (r - bw / 2);
        const z = Math.sin(a) * (r - bw / 2);
        k.cyl(0.001, CEIL - 0.008 - (y + bh), wire, x, y + bh, z, 0.001, 4);
        k.cyl(0.0035, 0.012, wire, x, y + bh, z, 0.0025, 8);
        k.cyl(0.011, 0.008, body, x, CEIL - 0.008, z, 0.011, 12);
      }
    });
    canopy(k, 0.07, body, 0.022);
  },
  plan: (ctx, c, s) => {
    const { rings } = tierL(s);
    ctx.setLineDash([0.04, 0.03]);
    for (const { r } of rings) D.circle(ctx, 0, 0, r - 0.003, null, INK_SOFT, 0.016);
    ctx.setLineDash([]);
    for (const { r } of rings) D.circle(ctx, 0, 0, r - 0.024, null, tint(c.body, 0.3), LINE_THIN);
    D.circle(ctx, 0, 0, 0.07, '#ffffffcc', INK_SOFT, LINE_THIN);
  },
});

/** Linear cascade of ribbed glass tubes under a long canopy (dining tables). */
const linL = (s: ItemSize) => {
  const rows = s.d >= 0.3 ? 2 : 1;
  const rt = 0.033;
  const Lt = 0.24;
  const usable = s.w - 0.1 - 2 * rt;
  const n = Math.max(3, Math.round(usable / (rows === 2 ? 0.2 : 0.13)) + 1);
  const sp = usable / (n - 1);
  const yLo = CEIL - s.h;
  const yHi = Math.max(yLo, CEIL - 0.03 - 0.1 - Lt - 0.02);
  const tubes: Array<[number, number, number]> = [];
  for (let r = 0; r < rows; r++) {
    const z = rows === 2 ? (r === 0 ? -1 : 1) * (s.d / 2 - rt - 0.02) : 0;
    const nn = rows === 2 && r === 1 ? n - 1 : n;
    for (let i = 0; i < nn; i++) {
      const x = -usable / 2 + i * sp + (rows === 2 && r === 1 ? sp / 2 : 0);
      const f = 0.5 + 0.5 * Math.cos((x / Math.max(0.3, s.w / 2)) * Math.PI * 1.25 + r * 0.8) * (0.75 + 0.25 * Math.sin(i * 2.3));
      tubes.push([x, z, yHi + (yLo - yHi) * clamp(f, 0, 1)]);
    }
  }
  const lowest = Math.min(...tubes.map((t) => t[2]));
  // the lowest tube always reaches the requested drop
  const shift = lowest - yLo;
  for (const t of tubes) t[2] = Math.max(yLo, t[2] - shift * 0.999);
  const midY = tubes.reduce((a, t) => a + t[2], 0) / tubes.length + Lt / 2;
  return { rows, rt, Lt, tubes, midY };
};
const linearCascade = lamp({
  id: 'mchand-linear-cascade',
  name: 'נברשת מפל לינארית לפינת אוכל',
  group: CHAND,
  tags: ['לינארי', 'מפל', 'זכוכית מחורצת', 'פינת אוכל', 'שולחן ארוך', 'נברשת'],
  size: { w: 1.2, d: 0.2, h: 0.95 },
  resize: { w: [0.6, 2.4], d: [0.16, 0.4], h: [0.6, 1.8] },
  mount: 'ceiling',
  colors: [slot('glass', 'זכוכית', '#f1ece2'), slot('metal', 'מתכת', '#1f1f21'), slot('cord', 'כבל', '#1f1f21')],
  light: { color: WARM27, intensity: 100, distance: 9 },
  at: (s) => [0, linL(s).midY, 0],
  build: (k, g, c, s) => {
    const { rows, rt, Lt, tubes } = linL(s);
    const metal = M.metal(c.metal, 0.4, 0.8);
    const glass = M.glass(c.glass, 0.42);
    const fil = led(WARM27, 2.6);
    const cm = cordMat(c.cord);
    const cw = rows === 2 ? s.d - 0.02 : 0.08;
    k.rbox(s.w - 0.02, 0.03, cw, 0.008, metal, 0, CEIL - 0.03, 0);
    const gp: Array<[number, number]> = [
      [0, 0],
      [rt * 0.72, 0.002],
      [rt * 0.96, 0.012],
      [rt, 0.03],
      [rt, Lt - 0.006],
      [rt * 0.9, Lt],
    ];
    const gGeo = ribbedGeo(gp, rows === 2 ? 11 : 14, 0.07, 2);
    for (const [x, z, yb] of tubes) {
      ns(k.geo(gGeo, glass, x, yb, z));
      k.cyl(rt * 0.95 + 0.002, 0.03, metal, x, yb + Lt - 0.012, z, rt * 0.5, 14);
      ns(g.cyl(0.004, Lt * 0.62, fil, x, yb + Lt * 0.2, z, 0.004, 5));
      vcord(k, x, z, yb + Lt + 0.018, CEIL - 0.03, cm, 0.0022);
    }
  },
  plan: (ctx, c, s) => {
    const { rows, rt, tubes } = linL(s);
    dashRect(ctx, 0, 0, s.w - 0.02, rows === 2 ? s.d - 0.02 : 0.08, 0.008, tint(c.metal, 0.75) + '88');
    for (const [x, z] of tubes) D.circle(ctx, x, z, rt, tint(c.glass, 0.3) + 'dd', INK_SOFT, LINE_THIN);
  },
});

/** Stairwell cascade: many small glass balls with LED cores on a spiral. */
const casL = (s: ItemSize) => {
  const R = dia(s) / 2;
  const kk = clamp(R / 0.3, 0.8, 1.4);
  const N = 19;
  const yLo = CEIL - s.h;
  const ga = Math.PI * (3 - Math.sqrt(5));
  const balls: Array<[number, number, number, number]> = [];
  for (let i = 0; i < N; i++) {
    const rb = (0.04 + 0.02 * (((i * 7) % 5) / 4)) * Math.sqrt(kk);
    const rho = (R - rb - 0.006) * Math.sqrt((i + 0.6) / N);
    const th = i * ga;
    const f = clamp(1 - i / (N - 1) + 0.12 * Math.sin(i * 1.9), 0, 1);
    const yHi = CEIL - 0.03 - 0.12 - rb;
    const yb = yHi + (yLo + rb - yHi) * f;
    balls.push([Math.cos(th) * rho, yb, Math.sin(th) * rho, rb]);
  }
  const midY = balls.reduce((a, b) => a + b[1], 0) / N;
  return { R, balls, midY };
};
const glassCascade = lamp({
  id: 'mchand-glass-cascade',
  name: 'נברשת מפל כדורי זכוכית',
  group: CHAND,
  tags: ['מפל', 'כדורי זכוכית', 'חדר מדרגות', 'חלל כפול', 'שמפניה', 'נברשת'],
  size: { w: 0.6, d: 0.6, h: 1.6 },
  resize: { w: [0.4, 1.0], d: [0.4, 1.0], h: [0.8, 2.2] },
  mount: 'ceiling',
  colors: [slot('glass', 'זכוכית', '#dcc69c'), slot('metal', 'מתכת', '#c9a35a'), slot('cord', 'כבלים', '#3a3a3c')],
  light: { color: WARM27, intensity: 100, distance: 9 },
  at: (s) => [0, casL(s).midY, 0],
  build: (k, g, c, s) => {
    const { R, balls } = casL(s);
    const metal = M.metal(c.metal, 0.26, 1);
    const glass = M.glass(c.glass, 0.4);
    const core = led(WARM27, 2.4);
    const cm = cordMat(c.cord);
    canopy(k, R * 0.82, metal, 0.03);
    for (const [x, y, z, rb] of balls) {
      ns(k.sphere(rb, glass, x, y, z, 1, 1, 1, 14));
      ns(g.sphere(0.011, core, x, y + rb * 0.1, z, 1, 1.3, 1, 8));
      k.cyl(0.009, 0.016, metal, x, y + rb * 0.93, z, 0.007, 10);
      vcord(k, x, z, y + rb * 0.93 + 0.016, CEIL - 0.03, cm, 0.0013);
    }
  },
  plan: (ctx, c, s) => {
    const { R, balls } = casL(s);
    ctx.setLineDash([0.04, 0.03]);
    D.circle(ctx, 0, 0, R * 0.82, tint(c.metal, 0.6) + '66', INK_SOFT, LINE_THIN);
    ctx.setLineDash([]);
    for (const [x, , z, rb] of balls) D.circle(ctx, x, z, rb, tint(c.glass, 0.35) + 'cc', INK_SOFT, LINE_THIN * 0.7);
  },
});

/** Organic "artichoke": tiers of curved metal leaves around a glowing core. */
function petalGeo(root: THREE.Vector3, tip: THREE.Vector3, out: THREE.Vector3, halfW: number, inside: boolean): THREE.BufferGeometry {
  const NU = 4;
  const NV = 4;
  const dir = tip.clone().sub(root);
  const L = dir.length();
  dir.normalize();
  const tang = new THREE.Vector3(-out.z, 0, out.x).normalize();
  // outward normal of the leaf (perpendicular to its length, pointing away from the axis)
  const nrm = new THREE.Vector3().crossVectors(tang, dir).normalize();
  if (nrm.dot(out) < 0) nrm.negate();
  const pos: number[] = [];
  const p = new THREE.Vector3();
  for (let i = 0; i <= NU; i++) {
    const u = i / NU;
    const hw = halfW * (0.3 + 0.7 * Math.sin(Math.PI * Math.min(1, u * 0.62 + 0.18)));
    for (let j = 0; j <= NV; j++) {
      const v = (j / NV) * 2 - 1;
      // rounded tip: the corners of the last row fall back a little
      const along = u * L - (i === NU ? 0.2 * L * v * v : 0);
      p.copy(root)
        .addScaledVector(dir, along)
        .addScaledVector(tang, v * hw)
        .addScaledVector(nrm, (1 - v * v) * hw * 0.35 + 0.16 * L * u * u);
      pos.push(p.x, p.y, p.z);
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < NU; i++) {
    for (let j = 0; j < NV; j++) {
      const a = i * (NV + 1) + j;
      const b = a + NV + 1;
      // (tang x dir) = outward for the outer skin; reversed for the inside
      if (inside) idx.push(a, b, a + 1, b, b + 1, a + 1);
      else idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
const artL = (s: ItemSize) => {
  const sc = Math.min(dia(s) / 0.62, (s.h - 0.1) / 0.58);
  const R = 0.3 * sc;
  const Hb = 0.56 * sc;
  const y0 = CEIL - s.h;
  return { sc, R, Hb, y0, yT: y0 + Hb };
};
const artichoke = lamp({
  id: 'mchand-artichoke',
  name: 'נברשת עלים אורגנית',
  group: CHAND,
  tags: ['עלים', 'אורגני', 'נחושת', 'פיסולי', 'מבואה', 'יוקרה', 'נברשת'],
  size: { w: 0.62, d: 0.62, h: 1.0 },
  resize: { w: [0.42, 0.95], d: [0.42, 0.95], h: [0.7, 1.8] },
  mount: 'ceiling',
  colors: [slot('leaves', 'עלים', '#b4793f'), slot('inner', 'פנים העלים', '#f3eee6')],
  light: { color: WARM, intensity: 100, distance: 9 },
  at: (s) => {
    const L = artL(s);
    return [0, L.y0 + L.Hb * 0.5, 0];
  },
  build: (k, g, c, s) => {
    const { sc, R, Hb, y0, yT } = artL(s);
    const outer = M.metal(c.leaves, 0.34, 1);
    const inner = M.glow(WARM, 0.32, c.inner);
    const T = 7;
    const PER = 12;
    const Lp = 0.15 * sc;
    const env = (t: number) => R * 0.86 * Math.pow(Math.sin(Math.PI * clamp(0.16 + 0.74 * t, 0, 1)), 0.75);
    for (let j = 0; j < T; j++) {
      const t = j / (T - 1);
      const y = yT - 0.02 * sc - t * (Hb - 0.02 * sc - Lp * 0.93);
      const rRoot = env(t) * 0.45 + 0.02 * sc;
      const rTip = env(Math.min(1, t + 0.16));
      const halfW = ((Math.PI * 2 * rTip) / PER) * 0.62;
      for (let i = 0; i < PER; i++) {
        const a = ((i + (j % 2) * 0.5) / PER) * Math.PI * 2;
        const out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
        const root = new THREE.Vector3(out.x * rRoot, y, out.z * rRoot);
        const tip = new THREE.Vector3(out.x * rTip, y - Lp, out.z * rTip);
        k.geo(petalGeo(root, tip, out, halfW, false), outer);
        ns(g.geo(petalGeo(root, tip, out, halfW, true), inner));
      }
    }
    ns(g.sphere(R * 0.42, opal('#fff8ec', 1.5), 0, y0 + Hb * 0.5, 0, 1, 1.3, 1, 18));
    k.cyl(0.03 * sc, 0.03 * sc, outer, 0, yT - 0.02 * sc, 0, 0.014 * sc, 16);
    k.cyl(0.0075, CEIL - 0.026 - (yT + 0.01 * sc), outer, 0, yT + 0.01 * sc, 0, 0.0075, 10);
    canopy(k, 0.06, outer, 0.026);
  },
  plan: (ctx, c, s) => {
    const { R } = artL(s);
    ctx.setLineDash([0.04, 0.03]);
    D.circle(ctx, 0, 0, R * 0.95, tint(c.leaves, 0.45) + 'cc', INK_SOFT, LINE_THIN);
    ctx.setLineDash([]);
    for (let j = 0; j < 3; j++) {
      const r = R * (0.3 + j * 0.22);
      for (let i = 0; i < 12; i++) {
        const a = ((i + (j % 2) * 0.5) / 12) * Math.PI * 2;
        D.arc(ctx, Math.cos(a) * r, Math.sin(a) * r, R * 0.12, a - 1.2, a + 1.2, INK_SOFT, LINE_THIN * 0.7);
      }
    }
  },
});

export const MODERN_HANGING: FurnitureDef[] = [
  concreteDome,
  coneSlim,
  bubbleSmoked,
  haloRing,
  cylinder,
  pleated,
  swag,
  clusterTubes,
  opalDisc,
  molecular,
  tieredRings,
  linearCascade,
  glassCascade,
  artichoke,
];
