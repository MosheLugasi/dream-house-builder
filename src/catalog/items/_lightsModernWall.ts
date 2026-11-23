/** Modern wall lights, LED profile and outdoor fittings (see `_lightsModernKit.ts`). */
import * as THREE from 'three';
import type { FurnitureDef, ItemSize } from '../types';
import { D, INK_SOFT, LINE_THIN, M, tint, type V3 } from '../kit';
import { slot } from './_parts';
import { NEUTRAL, WARM, annulusGeo, innerGlow, lamp, lampSym, led, ns, opal, openCyl, powder, wallDisc } from './_lightsModernKit';

const WALL = 'מנורות קיר';
const STRIP = 'פסי לד';
const OUT = 'תאורת חוץ';

/** Plan symbol of a wall fitting: the wall plate line plus the fitting. */
function wallLine(ctx: CanvasRenderingContext2D, s: ItemSize, w: number, fill: string): void {
  D.rr(ctx, 0, -s.d / 2 + 0.005, w, 0.01, 0.003, fill, INK_SOFT, LINE_THIN);
}

/* ===================================================================== WALL */

const udL = (s: ItemSize) => {
  const r = Math.min(s.w, s.d - 0.045) / 2;
  return { r, zc: -s.d / 2 + 0.045 + r };
};
const upDown = lamp({
  id: 'mwall-updown-cylinder',
  name: 'מנורת קיר צילינדר אור למעלה ולמטה',
  group: WALL,
  tags: ['אפ דאון', 'צילינדר', 'מסדרון', 'חזית', 'אנתרציט', 'מנורת קיר'],
  size: { w: 0.08, d: 0.13, h: 0.22 },
  resize: { w: [0.06, 0.12], d: [0.11, 0.17], h: [0.12, 0.45] },
  mount: 'wall',
  elevation: 1.75,
  colors: [slot('body', 'גוף', '#2c2d30'), slot('inner', 'פנים', '#c9a35a')],
  light: { color: WARM, intensity: 26, distance: 5 },
  at: (s) => [0, s.h / 2, udL(s).zc],
  build: (k, g, c, s) => {
    const { r, zc } = udL(s);
    const body = powder(c.body);
    const inner = M.metal(c.inner, 0.25, 1);
    const zb = -s.d / 2;
    k.rbox(0.05, Math.min(0.1, s.h * 0.6), 0.008, 0.003, body, 0, s.h / 2 - Math.min(0.05, s.h * 0.3), zb + 0.004);
    const armL = zc - r - (zb + 0.008) + 0.006;
    k.box(0.022, 0.03, armL, body, 0, s.h / 2 - 0.015, zb + 0.008 + armL / 2);
    k.geo(openCyl(r, r, s.h, 32), body, 0, 0, zc);
    for (const [y0, sgn] of [
      [0, 1],
      [s.h, -1],
    ] as Array<[number, number]>) {
      const deep = y0 + sgn * 0.014;
      // reflector wall (listed top -> bottom so it faces inwards) and the lens
      k.lathe(
        [
          [r - 0.0025, Math.max(y0, deep)],
          [r - 0.0025, Math.min(y0, deep)],
        ],
        inner,
        0,
        0,
        zc,
        28,
      );
      k.geo(annulusGeo(r - 0.0025, r, 28, sgn > 0), body, 0, y0, zc);
      ns(g.cyl(r - 0.004, 0.002, led(WARM, 2.2), 0, deep - 0.001, zc, r - 0.004, 24));
    }
    k.cyl(r - 0.003, s.h - 0.032, body, 0, 0.016, zc, r - 0.003, 20);
  },
  plan: (ctx, c, s) => {
    const { r, zc } = udL(s);
    wallLine(ctx, s, 0.05, tint(c.body, 0.5));
    D.rr(ctx, 0, (-s.d / 2 + zc - r) / 2 + 0.004, 0.022, zc - r + s.d / 2, 0, tint(c.body, 0.5), INK_SOFT, LINE_THIN);
    lampSym(ctx, r, tint(c.body, 0.45), false, 0, zc);
  },
});

const hmL = (s: ItemSize) => ({ R: Math.min(s.w / 2, s.h), zb: -s.d / 2 });
function halfDiscGeo(R: number, depth: number, bevel: number): THREE.BufferGeometry {
  const sh = new THREE.Shape();
  sh.absarc(0, 0, R, Math.PI, Math.PI * 2, false);
  sh.lineTo(-R, 0);
  const g = new THREE.ExtrudeGeometry(sh, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
    curveSegments: 20,
  });
  if (bevel > 0) g.translate(0, 0, bevel);
  return g;
}
const halfMoon = lamp({
  id: 'mwall-half-moon',
  name: 'מנורת קיר חצי ירח אופל',
  group: WALL,
  tags: ['חצי ירח', 'זכוכית אופל', 'פליז', 'ארט דקו', 'חדר שינה', 'מנורת קיר'],
  size: { w: 0.36, d: 0.07, h: 0.18 },
  resize: { w: [0.24, 0.6], h: [0.12, 0.3] },
  mount: 'wall',
  elevation: 1.7,
  colors: [slot('glass', 'זכוכית', '#f7f3ea'), slot('metal', 'מתכת', '#c9a35a')],
  light: { color: WARM, intensity: 26, distance: 5 },
  at: (s) => {
    const { R, zb } = hmL(s);
    return [0, s.h - R * 0.45, zb + 0.04];
  },
  build: (k, g, c, s) => {
    const { R, zb } = hmL(s);
    const metal = M.brushed(c.metal);
    const yTop = s.h - 0.007;
    k.geo(halfDiscGeo(R - 0.002, 0.012, 0), metal, 0, yTop + 0.005, zb);
    // a short brass edge that frames the glass from above
    k.box(2 * R - 0.004, 0.005, 0.05, metal, 0, yTop + 0.0, zb + 0.012 + 0.025);
    ns(g.geo(halfDiscGeo(R - 0.014, 0.038, 0.006), opal(c.glass, 1.05), 0, yTop - 0.004, zb + 0.012));
  },
  plan: (ctx, c, s) => {
    const { R } = hmL(s);
    wallLine(ctx, s, 2 * R - 0.004, tint(c.metal, 0.35));
    D.rr(ctx, 0, -s.d / 2 + 0.038, 2 * R - 0.02, 0.05, 0.01, tint(c.glass, 0.1), INK_SOFT, LINE_THIN);
  },
});

const picL = (s: ItemSize) => ({ zH: s.d / 2 - 0.035, yH: 0.11, rH: 0.03 });
const pictureLight = lamp({
  id: 'mwall-picture-light',
  name: 'מנורת תמונה מפליז',
  group: WALL,
  tags: ['מנורת תמונה', 'ציור', 'גלריה', 'פליז', 'לד', 'מנורת קיר'],
  size: { w: 0.5, d: 0.2, h: 0.15 },
  resize: { w: [0.3, 1.0] },
  mount: 'wall',
  elevation: 1.75,
  colors: [slot('metal', 'מתכת', '#b8935a'), slot('inner', 'פנים', '#f3f1ec')],
  light: { color: WARM, intensity: 18, distance: 3.5 },
  at: (s) => {
    const { zH } = picL(s);
    return [0, 0.08, zH - 0.03];
  },
  build: (k, g, c, s) => {
    const { zH, yH, rH } = picL(s);
    const metal = M.brushed(c.metal);
    const zb = -s.d / 2;
    wallDisc(k, 0.032, 0.012, metal, 0.035, zb);
    k.tube(
      [
        [0, 0.035, zb + 0.01],
        [0, 0.045, zb + 0.045],
        [0, 0.085, zb + 0.085],
        [0, yH - 0.008, zH - 0.04],
        [0, yH, zH - 0.012],
      ],
      0.0055,
      metal,
      { radial: 8, seg: 24 },
    );
    // hood: a tube open towards the wall and down
    const hood = new THREE.CylinderGeometry(rH, rH, s.w - 0.008, 28, 1, true, Math.PI * 1.55, Math.PI * 1.4);
    hood.rotateZ(Math.PI / 2);
    k.geo(hood, metal, 0, yH, zH);
    const hoodIn = new THREE.CylinderGeometry(rH - 0.0015, rH - 0.0015, s.w - 0.01, 28, 1, true, Math.PI * 1.55, Math.PI * 1.4);
    hoodIn.rotateZ(Math.PI / 2);
    ns(g.geo(hoodIn, innerGlow(c.inner, 0.45), 0, yH, zH));
    for (const sg of [-1, 1]) {
      const cap = new THREE.CylinderGeometry(rH + 0.001, rH + 0.001, 0.004, 24);
      cap.rotateZ(Math.PI / 2);
      k.geo(cap, metal, sg * (s.w / 2 - 0.002), yH, zH);
    }
    const strip = ns(g.box(s.w - 0.03, 0.004, 0.012, led(WARM, 2.2), 0, yH - 0.012, zH - 0.004));
    strip.rotation.x = -0.6;
  },
  plan: (ctx, c, s) => {
    const { zH, rH } = picL(s);
    wallLine(ctx, s, 0.064, tint(c.metal, 0.35));
    D.line(ctx, 0, -s.d / 2 + 0.01, 0, zH - rH, INK_SOFT, 0.011);
    D.rr(ctx, 0, zH, s.w - 0.004, 2 * rH, rH, tint(c.metal, 0.35), INK_SOFT, LINE_THIN);
  },
});

const mirrorBar = lamp({
  id: 'mwall-mirror-bar',
  name: 'מנורת מראה לינארית לאמבטיה',
  group: WALL,
  tags: ['מראה', 'אמבטיה', 'לינארי', 'לד', 'כרום', 'כיור', 'מנורת קיר'],
  size: { w: 0.6, d: 0.09, h: 0.05 },
  resize: { w: [0.3, 1.5] },
  mount: 'wall',
  elevation: 1.95,
  colors: [slot('body', 'גוף', '#c9ccce'), slot('diffuser', 'מפזר', '#fbfbf8')],
  light: { color: NEUTRAL, intensity: 26, distance: 5 },
  at: (s) => [0, 0.02, s.d / 2 - 0.01],
  build: (k, g, c, s) => {
    const body = M.brushed(c.body);
    const diff = opal(c.diffuser, 1.55, NEUTRAL);
    const zb = -s.d / 2;
    k.rbox(0.08, 0.05, 0.008, 0.003, body, 0, 0, zb + 0.004);
    k.box(0.02, 0.016, s.d - 0.008 - 0.028, body, 0, 0.017, zb + 0.008 + (s.d - 0.036) / 2);
    k.rbox(s.w, 0.032, 0.03, 0.006, body, 0, 0.009, s.d / 2 - 0.015);
    ns(g.box(s.w - 0.014, 0.018, 0.003, diff, 0, 0.016, s.d / 2 - 0.0015));
    ns(g.box(s.w - 0.014, 0.002, 0.02, diff, 0, 0.0075, s.d / 2 - 0.013));
  },
  plan: (ctx, c, s) => {
    wallLine(ctx, s, 0.08, tint(c.body, 0.4));
    D.rr(ctx, 0, s.d / 2 - 0.015, s.w, 0.03, 0.006, tint(c.body, 0.4), INK_SOFT, LINE_THIN);
    D.line(ctx, -s.w / 2 + 0.01, s.d / 2 - 0.002, s.w / 2 - 0.01, s.d / 2 - 0.002, '#e8d9b4', 0.006);
  },
});

const PLASTER_PROFILE: Array<[number, number]> = [
  [0.024, 0],
  [0.05, 0.03],
  [0.085, 0.08],
  [0.12, 0.135],
  [0.148, 0.18],
];
const plL = (s: ItemSize) => ({ sc: Math.min(s.w / 0.3, s.d / 0.15, s.h / 0.18) });
const plaster = lamp({
  id: 'mwall-plaster-uplight',
  name: 'מנורת קיר גבס מאירה למעלה',
  group: WALL,
  tags: ['גבס', 'צביע', 'תאורה עקיפה', 'אפ לייט', 'חצי קונוס', 'מנורת קיר'],
  size: { w: 0.3, d: 0.15, h: 0.18 },
  resize: { w: [0.2, 0.45], d: [0.1, 0.22], h: [0.12, 0.27] },
  mount: 'wall',
  elevation: 1.75,
  colors: [slot('plaster', 'גבס', '#f1eee8'), slot('inner', 'פנים', '#f6f1e6')],
  light: { color: WARM, intensity: 24, distance: 5 },
  at: (s) => {
    const { sc } = plL(s);
    return [0, 0.16 * sc, -s.d / 2 + 0.045 * sc];
  },
  build: (k, g, c, s) => {
    const { sc } = plL(s);
    const zb = -s.d / 2;
    const mat = M.matte(c.plaster);
    const prof = PLASTER_PROFILE.map(([r, y]) => [r * sc, y * sc] as [number, number]);
    const outer = new THREE.LatheGeometry(
      prof.map(([r, y]) => new THREE.Vector2(r, y)),
      24,
      -Math.PI / 2,
      Math.PI,
    );
    k.geo(outer, mat, 0, 0, zb);
    const t = 0.009 * sc;
    const innerG = new THREE.LatheGeometry(
      prof.map(([r, y]) => new THREE.Vector2(Math.max(0.004, r - t), Math.min(y + t * 0.6, prof[prof.length - 1][1]))),
      24,
      -Math.PI / 2,
      Math.PI,
    );
    ns(g.geo(innerG, innerGlow(c.inner, 0.6), 0, 0, zb));
    const [rTop, yTop] = prof[prof.length - 1];
    const rim = new THREE.RingGeometry(rTop - t, rTop, 24, 1, Math.PI, Math.PI);
    rim.rotateX(-Math.PI / 2);
    k.geo(rim, mat, 0, yTop, zb);
    ns(g.cyl(0.014 * sc, 0.03 * sc, led(WARM, 2.0), 0, 0.09 * sc, zb + 0.03 * sc, 0.014 * sc, 12));
  },
  plan: (ctx, c, s) => {
    const { sc } = plL(s);
    const r = 0.148 * sc;
    ctx.beginPath();
    ctx.arc(0, -s.d / 2, r, 0, Math.PI, false);
    ctx.closePath();
    ctx.fillStyle = tint(c.plaster, 0.1);
    ctx.fill();
    ctx.lineWidth = LINE_THIN;
    ctx.strokeStyle = INK_SOFT;
    ctx.stroke();
  },
});

const swL = (s: ItemSize) => {
  const zb = -s.d / 2;
  const y = 0.1;
  const j0: V3 = [0, y, zb + 0.03];
  const end: V3 = [0, y, s.d / 2 - 0.065];
  const j1: V3 = [0.11, y, (j0[2] + end[2]) / 2];
  return { zb, y, j0, j1, end };
};
const swingModern = lamp({
  id: 'mwall-swing-disc',
  name: 'מנורת קיר זרוע מתקפלת עם ראש דיסק',
  group: WALL,
  tags: ['זרוע', 'מתקפל', 'ליד המיטה', 'קריאה', 'דיסק לד', 'מנורת קיר'],
  size: { w: 0.3, d: 0.56, h: 0.15 },
  resize: { d: [0.36, 0.8] },
  mount: 'wall',
  elevation: 1.25,
  colors: [slot('body', 'גוף', '#1f1f21'), slot('joint', 'מפרקים', '#c9a35a')],
  light: { color: WARM, intensity: 24, distance: 4.5 },
  at: (s) => [0, -0.01, swL(s).end[2]],
  build: (k, g, c, s) => {
    const { zb, y, j0, j1, end } = swL(s);
    const body = powder(c.body);
    const joint = M.metal(c.joint, 0.28, 1);
    wallDisc(k, 0.04, 0.012, body, y, zb);
    k.box(0.024, 0.02, j0[2] - zb - 0.012, body, 0, y - 0.01, zb + 0.012 + (j0[2] - zb - 0.012) / 2);
    for (const p of [j0, j1]) k.cyl(0.012, 0.034, joint, p[0], y - 0.017, p[2], 0.012, 14);
    k.rod(j0, j1, 0.0055, body, 0.0055, 8);
    k.rod(j1, end, 0.0055, body, 0.0055, 8);
    k.cyl(0.011, 0.026, joint, 0, y - 0.013, end[2], 0.011, 14);
    k.cyl(0.0055, y - 0.013 - 0.024, body, 0, 0.024, end[2], 0.0055, 8);
    k.cyl(0.065, 0.02, body, 0, 0.004, end[2], 0.058, 40);
    ns(g.cyl(0.056, 0.004, opal('#ffffff', 1.6), 0, 0, end[2], 0.056, 32));
  },
  plan: (ctx, c, s) => {
    const { j0, j1, end, zb } = swL(s);
    wallLine(ctx, s, 0.08, tint(c.body, 0.5));
    D.line(ctx, 0, zb + 0.01, j0[0], j0[2], INK_SOFT, 0.012);
    D.line(ctx, j0[0], j0[2], j1[0], j1[2], INK_SOFT, 0.011);
    D.line(ctx, j1[0], j1[2], end[0], end[2], INK_SOFT, 0.011);
    D.circle(ctx, j1[0], j1[2], 0.012, tint(c.joint, 0.3), INK_SOFT, LINE_THIN);
    lampSym(ctx, 0.065, tint(c.body, 0.55), false, 0, end[2]);
  },
});

function washerGeo(w: number, d: number): THREE.BufferGeometry {
  // cross-section in (z, y) with the back on the wall, a sloped front and a flat top window
  const sh = new THREE.Shape();
  sh.moveTo(-d / 2, 0);
  sh.lineTo(d / 2 - 0.012, 0);
  sh.lineTo(d / 2, 0.01);
  sh.lineTo(d / 2 - 0.022, 0.04);
  sh.lineTo(-d / 2 + 0.034, 0.045);
  sh.lineTo(-d / 2, 0.045);
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: w, bevelEnabled: false });
  g.rotateY(-Math.PI / 2);
  g.translate(w / 2, 0, 0);
  return g;
}
const washer = lamp({
  id: 'mwall-led-washer',
  name: 'פס לד שוטף קיר',
  group: WALL,
  tags: ['שוטף קיר', 'לד', 'תאורה עקיפה', 'לינארי', 'מעל מיטה', 'מנורת קיר'],
  size: { w: 0.6, d: 0.07, h: 0.05 },
  resize: { w: [0.3, 1.5] },
  mount: 'wall',
  elevation: 2.05,
  colors: [slot('body', 'גוף', '#e8e8e6'), slot('caps', 'קצוות', '#2a2a2c')],
  light: { color: WARM, intensity: 30, distance: 5.5 },
  at: (s) => [0, 0.12, -s.d / 2 + 0.03],
  build: (k, g, c, s) => {
    const body = powder(c.body);
    const caps = powder(c.caps);
    k.geo(washerGeo(s.w - 0.008, s.d), body, 0, 0, 0);
    for (const sg of [-1, 1]) k.box(0.004, 0.047, s.d, caps, sg * (s.w / 2 - 0.002), 0, 0);
    ns(g.box(s.w - 0.016, 0.002, 0.024, opal('#ffffff', 1.7), 0, 0.0445, -s.d / 2 + 0.018));
  },
  plan: (ctx, c, s) => {
    D.rr(ctx, 0, 0, s.w, s.d, 0.004, tint(c.body, 0.3), INK_SOFT, LINE_THIN);
    D.line(ctx, -s.w / 2 + 0.01, -s.d / 2 + 0.018, s.w / 2 - 0.01, -s.d / 2 + 0.018, '#e8d9b4', 0.012);
  },
});

const gbL = (s: ItemSize) => ({ xb: s.w / 2 - 0.066, zc: s.d / 2 - 0.066, rg: 0.064 });
const globeBar = lamp({
  id: 'mwall-twin-globes',
  name: 'מנורת קיר שני כדורים על מוט',
  group: WALL,
  tags: ['כדורים', 'זכוכית אופל', 'פליז', 'מוט', 'מעל מראה', 'מנורת קיר'],
  size: { w: 0.46, d: 0.16, h: 0.19 },
  resize: { w: [0.32, 0.9] },
  mount: 'wall',
  elevation: 1.65,
  colors: [slot('metal', 'מתכת', '#c9a35a'), slot('glass', 'זכוכית', '#fbf8f1')],
  light: { color: WARM, intensity: 30, distance: 5 },
  at: (s) => [0, 0.124, gbL(s).zc],
  build: (k, g, c, s) => {
    const { xb, zc, rg } = gbL(s);
    const metal = M.metal(c.metal, 0.26, 1);
    const zb = -s.d / 2;
    k.rbox(0.05, 0.1, 0.01, 0.004, metal, 0, 0, zb + 0.005);
    k.rod([0, 0.05, zb + 0.01], [0, 0.05, zc], 0.0065, metal, 0.0065, 10);
    k.rod([-xb, 0.05, zc], [xb, 0.05, zc], 0.0065, metal, 0.0065, 10);
    k.sphere(0.012, metal, 0, 0.05, zc, 1, 1, 1, 12);
    for (const x of [-xb, xb]) {
      k.lathe(
        [
          [0.006, 0],
          [0.02, 0.006],
          [0.03, 0.017],
          [0.031, 0.022],
        ],
        metal,
        x,
        0.045,
        zc,
        20,
      );
      ns(g.sphere(rg, opal(c.glass, 1.0), x, 0.06 + rg, zc, 1, 1, 1, 24));
    }
  },
  plan: (ctx, c, s) => {
    const { xb, zc, rg } = gbL(s);
    wallLine(ctx, s, 0.05, tint(c.metal, 0.35));
    D.line(ctx, 0, -s.d / 2 + 0.01, 0, zc, INK_SOFT, 0.012);
    D.line(ctx, -xb, zc, xb, zc, INK_SOFT, 0.012);
    for (const x of [-xb, xb]) lampSym(ctx, rg, '#fffaf0', false, x, zc);
  },
});

/* ===================================================================== LED PROFILE */

const ledProfile = lamp({
  id: 'mled-alu-profile',
  name: 'פרופיל לד אלומיניום עם מפזר',
  group: STRIP,
  tags: ['פס לד', 'פרופיל אלומיניום', 'תאורה נסתרת', 'מתחת לארון', 'קרניז', 'מאחורי טלוויזיה', 'לד'],
  size: { w: 1.2, d: 0.02, h: 0.016 },
  resize: { w: [0.3, 3.0] },
  mount: 'wall',
  elevation: 2.2,
  colors: [slot('profile', 'פרופיל', '#c9ccce'), slot('diffuser', 'מפזר', '#fbfbf8')],
  light: { color: WARM, intensity: 26, distance: 5 },
  at: (s) => [0, 0.008, s.d / 2 + 0.02],
  build: (k, g, c, s) => {
    const alu = M.brushed(c.profile);
    const zb = -s.d / 2;
    const L = s.w - 0.006;
    k.box(L, 0.016, 0.002, alu, 0, 0, zb + 0.001);
    for (const y of [0, 0.0145]) k.box(L, 0.0015, 0.014, alu, 0, y, zb + 0.007);
    const dg = new THREE.CylinderGeometry(0.0066, 0.0066, L, 16, 1, false, -Math.PI / 2, Math.PI);
    dg.rotateZ(Math.PI / 2);
    ns(g.geo(dg, opal(c.diffuser, 1.6), 0, 0.008, zb + 0.0132));
    for (const sg of [-1, 1]) k.box(0.003, 0.016, s.d, M.plastic('#9a9c9e'), sg * (s.w / 2 - 0.0015), 0, 0);
  },
  plan: (ctx, c, s) => {
    D.rr(ctx, 0, 0, s.w, s.d, 0.002, tint(c.profile, 0.3), INK_SOFT, LINE_THIN);
    D.line(ctx, -s.w / 2 + 0.004, s.d / 2 - 0.004, s.w / 2 - 0.004, s.d / 2 - 0.004, '#efd9a8', 0.006);
  },
});

/* ===================================================================== OUTDOOR */

const bolL = (s: ItemSize) => {
  const R = Math.min(s.w, s.d) / 2;
  const hh = 0.11;
  return { R, hh, yh: s.h - 0.014 - hh };
};
const bollard = lamp({
  id: 'mout-bollard',
  name: 'עמוד תאורה נמוך לשביל',
  group: OUT,
  tags: ['בולארד', 'שביל', 'גינה', 'חוץ', 'אנתרציט', 'עמוד נמוך'],
  size: { w: 0.16, d: 0.16, h: 0.65 },
  resize: { w: [0.12, 0.24], d: [0.12, 0.24], h: [0.4, 1.1] },
  colors: [slot('body', 'גוף', '#3a3b3d'), slot('diffuser', 'מפזר', '#fbf8f1')],
  light: { color: WARM, intensity: 18, distance: 4.5 },
  at: (s) => {
    const { yh, hh } = bolL(s);
    return [0, yh + hh / 2, 0];
  },
  build: (k, g, c, s) => {
    const { R, hh, yh } = bolL(s);
    const body = powder(c.body);
    k.cyl(R, 0.012, body, 0, 0, 0, R * 0.97, 32);
    k.cyl(R * 0.88, yh - 0.012, body, 0, 0.012, 0, R * 0.88, 32);
    ns(g.cyl(R * 0.6, hh, opal(c.diffuser, 1.3), 0, yh, 0, R * 0.6, 24));
    for (let i = 0; i < 5; i++) k.cyl(R * 0.88, 0.006, body, 0, yh + 0.014 + i * 0.021, 0, R * 0.88, 28);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
      k.box(0.01, hh, 0.01, body, Math.cos(a) * R * 0.83, yh, Math.sin(a) * R * 0.83);
    }
    k.lathe(
      [
        [0, 0],
        [R * 0.9, 0],
        [R * 0.93, 0.006],
        [R * 0.9, 0.012],
        [R * 0.5, 0.014],
        [0, 0.014],
      ],
      body,
      0,
      s.h - 0.014,
      0,
      32,
    );
  },
  plan: (ctx, c, s) => {
    const { R } = bolL(s);
    D.circle(ctx, 0, 0, R, tint(c.body, 0.5), INK_SOFT, LINE_THIN);
    lampSym(ctx, R * 0.6, tint(c.diffuser, 0.1));
  },
});

const lanL = (s: ItemSize) => {
  const sc = Math.min(s.w / 0.17, s.d / 0.2, s.h / 0.32);
  const zb = -s.d / 2;
  const B = 0.14 * sc;
  const zc = zb + 0.022 * sc + B / 2 + 0.006 * sc;
  return { sc, zb, B, zc };
};
const wallLantern = lamp({
  id: 'mout-wall-lantern',
  name: 'פנס קיר חוץ מודרני',
  group: OUT,
  tags: ['פנס', 'חוץ', 'כניסה', 'מרפסת', 'זכוכית חלבית', 'שחור', 'מנורת קיר'],
  size: { w: 0.17, d: 0.2, h: 0.32 },
  resize: { w: [0.12, 0.26], d: [0.14, 0.3], h: [0.22, 0.48] },
  mount: 'wall',
  elevation: 1.85,
  colors: [slot('body', 'גוף', '#262628'), slot('glass', 'זכוכית', '#f3f0e8')],
  light: { color: WARM, intensity: 22, distance: 5 },
  at: (s) => {
    const { sc, zc } = lanL(s);
    return [0, 0.17 * sc, zc];
  },
  build: (k, g, c, s) => {
    const { sc, zb, B, zc } = lanL(s);
    const body = powder(c.body);
    const hG = 0.24 * sc;
    const y0 = 0.05 * sc;
    k.rbox(0.1 * sc, 0.27 * sc, 0.012 * sc, 0.004, body, 0, 0.035 * sc, zb + 0.006 * sc);
    k.box(0.05 * sc, 0.08 * sc, 0.016 * sc, body, 0, 0.13 * sc, zb + 0.012 * sc + 0.008 * sc);
    ns(g.box(B - 0.008 * sc, hG, B - 0.008 * sc, opal(c.glass, 1.1), 0, y0, zc));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.012 * sc, hG, 0.012 * sc, body, (sx * (B - 0.012 * sc)) / 2, y0, zc + (sz * (B - 0.012 * sc)) / 2);
    // overhanging roof from the wall plate to just past the glass
    const zf = Math.min(s.d / 2 - 0.001, zc + B / 2 + 0.016 * sc);
    const zk = zb + 0.012 * sc;
    k.rbox(B + 0.03 * sc, 0.02 * sc, zf - zk, 0.004, body, 0, y0 + hG, (zf + zk) / 2);
    k.rbox(B + 0.004 * sc, 0.014 * sc, B + 0.004 * sc, 0.003, body, 0, y0 - 0.014 * sc, zc);
    k.cyl(0.012 * sc, 0.036 * sc, body, 0, 0, zc, 0.03 * sc, 16);
  },
  plan: (ctx, c, s) => {
    const { sc, B, zc } = lanL(s);
    wallLine(ctx, s, 0.1 * sc, tint(c.body, 0.5));
    D.rr(ctx, 0, zc, B, B, 0.004, tint(c.glass, 0.1), INK_SOFT, LINE_THIN);
    lampSym(ctx, B * 0.3, null, false, 0, zc);
  },
});

export const MODERN_WALL: FurnitureDef[] = [upDown, halfMoon, pictureLight, mirrorBar, plaster, swingModern, washer, globeBar, ledProfile, bollard, wallLantern];

