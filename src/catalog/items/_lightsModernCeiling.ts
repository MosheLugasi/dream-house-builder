/** Modern ceiling fittings (flush / semi-flush) and spots & tracks (see `_lightsModernKit.ts`). */
import * as THREE from 'three';
import type { FurnitureDef, ItemSize } from '../types';
import { D, INK_SOFT, M, LINE_THIN, tint, type Kit, type V3 } from '../kit';
import { slot } from './_parts';
import {
  CEIL,
  NEUTRAL,
  WARM,
  annulusGeo,
  clamp,
  dashRect,
  lamp,
  lampSym,
  led,
  ns,
  opal,
  openCyl,
  powder,
  sub,
} from './_lightsModernKit';

const FLUSH = 'תאורת תקרה';
const SPOTS = 'ספוטים ומסילות';
const dia = (s: ItemSize): number => Math.min(s.w, s.d);

/** Rotate a local point about X (the head tilt used by `sub(..., rx)`), then about Y. */
function rot(p: V3, rx: number, ry = 0): V3 {
  const y = p[1] * Math.cos(rx) - p[2] * Math.sin(rx);
  const z = p[1] * Math.sin(rx) + p[2] * Math.cos(rx);
  const x = p[0];
  return [x * Math.cos(ry) + z * Math.sin(ry), y, -x * Math.sin(ry) + z * Math.cos(ry)];
}

/* ===================================================================== FLUSH / SEMI-FLUSH */

const ledPanel = lamp({
  id: 'mceil-led-panel',
  name: 'פאנל לד מרובע צמוד תקרה',
  group: FLUSH,
  tags: ['פאנל לד', 'שטוח', 'מרובע', 'משרד', 'מטבח', 'אור אחיד', 'תאורת תקרה'],
  size: { w: 0.6, d: 0.6, h: 0.035 },
  resize: { w: [0.3, 1.2], d: [0.3, 1.2] },
  mount: 'ceiling',
  colors: [slot('frame', 'מסגרת', '#f2f2f0'), slot('diffuser', 'מפזר', '#fbfbf8')],
  light: { color: NEUTRAL, intensity: 110, distance: 9.5 },
  at: () => [0, CEIL - 0.14, 0],
  build: (k, g, c, s) => {
    const fr = M.paint(c.frame, 0.35);
    const H = 0.035;
    const b = 0.014;
    k.box(s.w - 2 * b, H - 0.004, s.d - 2 * b, fr, 0, CEIL - H + 0.004, 0);
    for (const sg of [-1, 1]) {
      k.rbox(s.w, H, b, 0.002, fr, 0, CEIL - H, sg * (s.d / 2 - b / 2));
      k.rbox(b, H, s.d - 2 * b + 0.002, 0.002, fr, sg * (s.w / 2 - b / 2), CEIL - H, 0);
    }
    ns(g.box(s.w - 2 * b, 0.002, s.d - 2 * b, opal(c.diffuser, 1.5, NEUTRAL), 0, CEIL - H + 0.002, 0));
  },
  plan: (ctx, c, s) => {
    dashRect(ctx, 0, 0, s.w, s.d, 0.004, tint(c.frame, 0.3));
    D.rr(ctx, 0, 0, s.w - 0.028, s.d - 0.028, 0, '#fffdf6', INK_SOFT, LINE_THIN);
  },
});

const thinDisc = lamp({
  id: 'mceil-floating-disc',
  name: 'צמודת תקרה דיסק דק מרחף',
  group: FLUSH,
  tags: ['דיסק', 'דק', 'מרחף', 'לד', 'מינימליסטי', 'חדר שינה', 'תאורת תקרה'],
  size: { w: 0.5, d: 0.5, h: 0.065 },
  resize: { w: [0.3, 0.9], d: [0.3, 0.9] },
  mount: 'ceiling',
  colors: [slot('body', 'גוף', '#f3f2ef'), slot('rim', 'פס היקפי', '#c9a35a')],
  light: { color: WARM, intensity: 96, distance: 9 },
  at: () => [0, CEIL - 0.15, 0],
  build: (k, g, c, s) => {
    const R = dia(s) / 2;
    const body = powder(c.body);
    const rim = M.metal(c.rim, 0.28, 1);
    const seg = Math.round(clamp(R * 160, 48, 96));
    const yb = CEIL - 0.065;
    k.cyl(R * 0.3, 0.033, body, 0, CEIL - 0.033, 0, R * 0.3, 32);
    k.cyl(R - 0.001, 0.016, body, 0, yb + 0.006, 0, R - 0.001, seg);
    k.geo(openCyl(R, R, 0.007, seg), rim, 0, yb + 0.0115, 0);
    ns(g.cyl(R - 0.006, 0.006, opal('#ffffff', 1.45), 0, yb, 0, R - 0.006, seg));
    // halo washing the ceiling from the top of the disc
    ns(g.geo(annulusGeo(R * 0.36, R * 0.92, seg), opal('#ffffff', 0.9), 0, yb + 0.0225, 0));
  },
  plan: (ctx, c, s) => {
    const R = dia(s) / 2;
    lampSym(ctx, R, tint(c.body, 0.2) + 'cc', true);
    D.circle(ctx, 0, 0, R - 0.006, null, tint(c.rim, 0.2), LINE_THIN);
  },
});

const drumL = (s: ItemSize) => ({ R: dia(s) / 2 - 0.003, y0: CEIL - s.h, Hd: s.h - 0.014 });
const fabricDrum = lamp({
  id: 'mceil-fabric-drum',
  name: 'צמודת תקרה תוף בד',
  group: FLUSH,
  tags: ['תוף', 'בד', 'פשתן', 'צמודת תקרה', 'רך', 'חדר שינה', 'תאורת תקרה'],
  size: { w: 0.5, d: 0.5, h: 0.2 },
  resize: { w: [0.3, 0.9], d: [0.3, 0.9], h: [0.12, 0.35] },
  mount: 'ceiling',
  colors: [slot('shade', 'אהיל', '#e6ddcc'), slot('metal', 'מסגרת', '#c9a35a'), slot('diffuser', 'מפזר', '#fdfbf6')],
  light: { color: WARM, intensity: 92, distance: 9 },
  at: (s) => {
    const L = drumL(s);
    return [0, L.y0 + L.Hd * 0.5, 0];
  },
  build: (k, g, c, s) => {
    const { R, y0, Hd } = drumL(s);
    const metal = M.metal(c.metal, 0.3, 1);
    const seg = Math.round(clamp(R * 160, 40, 80));
    const yd = y0 + 0.014;
    ns(g.geo(openCyl(R, R, Hd, seg), M.shade(c.shade), 0, yd, 0));
    k.ring(R, 0.0026, metal, 0, yd + 0.0026, 0, seg);
    k.ring(R, 0.0026, metal, 0, CEIL - 0.0026, 0, seg);
    ns(g.cyl(R - 0.004, 0.003, opal(c.diffuser, 1.2), 0, yd + 0.006, 0, R - 0.004, seg));
    // finial holding the diffuser
    k.lathe(
      [
        [0, 0],
        [0.006, 0.001],
        [0.011, 0.006],
        [0.012, 0.012],
        [0.016, 0.016],
        [0, 0.016],
      ],
      metal,
      0,
      y0,
      0,
      16,
    );
  },
  plan: (ctx, c, s) => {
    const { R } = drumL(s);
    lampSym(ctx, R, tint(c.shade, 0.3) + 'cc', true);
    D.circle(ctx, 0, 0, R - 0.01, null, tint(c.metal, 0.2), LINE_THIN);
    D.circle(ctx, 0, 0, 0.012, tint(c.metal, 0.3), INK_SOFT, LINE_THIN);
  },
});

const donutL = (s: ItemSize) => {
  const D0 = dia(s);
  const rt = 0.034 * clamp(D0 / 0.55, 0.8, 1.4);
  return { rt, Rc: D0 / 2 - rt, yc: CEIL - s.h + rt };
};
const glowDonut = lamp({
  id: 'mceil-opal-torus',
  name: 'צמודת תקרה טבעת אופל עבה',
  group: FLUSH,
  tags: ['טבעת', 'דונאט', 'זכוכית אופל', 'רטרו מודרני', 'סלון', 'תאורת תקרה'],
  size: { w: 0.56, d: 0.56, h: 0.12 },
  resize: { w: [0.36, 1.0], d: [0.36, 1.0] },
  mount: 'ceiling',
  colors: [slot('glass', 'אופל', '#fbf9f4'), slot('metal', 'מתכת', '#c9a35a')],
  light: { color: WARM, intensity: 92, distance: 9 },
  at: (s) => [0, donutL(s).yc, 0],
  build: (k, g, c, s) => {
    const { rt, Rc, yc } = donutL(s);
    const metal = M.metal(c.metal, 0.28, 1);
    const tor = ns(g.geo(new THREE.TorusGeometry(Rc, rt, 16, Math.round(clamp(Rc * 220, 56, 112))), opal(c.glass, 1.15), 0, yc, 0));
    tor.rotation.x = Math.PI / 2;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
      const x = Math.cos(a) * Rc;
      const z = Math.sin(a) * Rc;
      k.cyl(0.0035, CEIL - 0.006 - (yc + rt * 0.8), metal, x, yc + rt * 0.8, z, 0.0035, 8);
      k.cyl(0.012, 0.006, metal, x, yc + rt * 0.92, z, 0.008, 12);
      k.cyl(0.016, 0.006, metal, x, CEIL - 0.006, z, 0.016, 14);
    }
  },
  plan: (ctx, c, s) => {
    const { rt, Rc } = donutL(s);
    ctx.setLineDash([0.04, 0.03]);
    D.circle(ctx, 0, 0, Rc + rt, tint(c.glass, 0.1) + 'cc', INK_SOFT, LINE_THIN);
    ctx.setLineDash([]);
    D.circle(ctx, 0, 0, Rc - rt, '#ffffff', INK_SOFT, LINE_THIN);
  },
});

/** Puffs of the cloud: u, v in -1..1 (position in the footprint), radius and depth (relative). */
const PUFFS: Array<[number, number, number, number]> = [
  [0, 0, 0.5, 1.0],
  [-0.62, 0.22, 0.44, 0.86],
  [0.6, -0.18, 0.45, 0.9],
  [-0.22, -0.62, 0.38, 0.72],
  [0.26, 0.64, 0.38, 0.78],
  [-1, -0.5, 0.3, 0.6],
  [1, 0.5, 0.31, 0.62],
  [0.18, -0.3, 0.36, 0.95],
  [-0.4, 0.75, 0.3, 0.62],
  [0.55, -0.85, 0.28, 0.55],
];
const cloudL = (s: ItemSize) => {
  const m = Math.min(s.w, s.d);
  return PUFFS.map(([u, v, rr, dep]) => {
    const r = rr * m * 0.78;
    return { x: u * (s.w / 2 - r), z: v * (s.d / 2 - r), r, hy: (s.h - 0.006) * dep };
  });
};
const cloud = lamp({
  id: 'mceil-cloud',
  name: 'צמודת תקרה ענן',
  group: FLUSH,
  tags: ['ענן', 'אופל', 'רך', 'חדר ילדים', 'פיסולי', 'תאורת תקרה'],
  size: { w: 0.72, d: 0.5, h: 0.2 },
  resize: { w: [0.5, 1.3], d: [0.35, 0.9], h: [0.14, 0.3] },
  mount: 'ceiling',
  colors: [slot('cloud', 'ענן', '#fbfaf7'), slot('base', 'בסיס', '#e9e7e2')],
  light: { color: WARM, intensity: 95, distance: 9 },
  at: (s) => [0, CEIL - s.h * 0.55, 0],
  build: (k, g, c, s) => {
    const mat = opal(c.cloud, 1.0);
    const half = new THREE.SphereGeometry(1, 22, 7, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    for (const p of cloudL(s)) {
      const m = ns(g.geo(half, mat, p.x, CEIL - 0.004, p.z));
      m.scale.set(p.r, p.hy, p.r);
    }
    k.cyl(Math.min(s.w, s.d) * 0.36, 0.004, M.paint(c.base, 0.5), 0, CEIL - 0.004, 0, Math.min(s.w, s.d) * 0.36, 32);
  },
  plan: (ctx, c, s) => {
    ctx.setLineDash([0.04, 0.03]);
    for (const p of cloudL(s)) D.circle(ctx, p.x, p.z, p.r, tint(c.cloud, 0.1) + 'dd', INK_SOFT, LINE_THIN);
    ctx.setLineDash([]);
    lampSym(ctx, 0.05, null);
  },
});

const tierFL = (s: ItemSize) => {
  const R = dia(s) / 2;
  const tt = 0.01;
  const hb = (s.h - 3 * tt) / 3;
  return { tt, hb, radii: [R, R * 0.74, R * 0.48] };
};
const tieredFlush = lamp({
  id: 'mceil-tiered',
  name: 'צמודת תקרה מדורגת שלוש קומות',
  group: FLUSH,
  tags: ['מדורג', 'שכבות', 'אופל', 'חצי צמוד', 'מבואה', 'תאורת תקרה'],
  size: { w: 0.5, d: 0.5, h: 0.21 },
  resize: { w: [0.3, 0.8], d: [0.3, 0.8], h: [0.15, 0.36] },
  mount: 'ceiling',
  colors: [slot('body', 'גוף', '#d9d4cb'), slot('glass', 'אופל', '#fbf8f1')],
  light: { color: WARM, intensity: 96, distance: 9 },
  at: (s) => [0, CEIL - s.h * 0.55, 0],
  build: (k, g, c, s) => {
    const { tt, hb, radii } = tierFL(s);
    const body = powder(c.body);
    const glass = opal(c.glass, 1.2);
    radii.forEach((r, i) => {
      const seg = Math.round(clamp(r * 170, 36, 80));
      const yTop = CEIL - i * (tt + hb);
      k.cyl(r, tt, body, 0, yTop - tt, 0, r, seg);
      const yb = yTop - tt - hb;
      ns(g.geo(openCyl(r * 0.95, r * 0.95, hb, seg), glass, 0, yb, 0));
      if (i < radii.length - 1) ns(g.geo(annulusGeo(radii[i + 1] * 0.98, r * 0.95, seg, true), glass, 0, yb, 0));
      else ns(g.cyl(r * 0.95, 0.002, glass, 0, yb, 0, r * 0.95, seg));
    });
  },
  plan: (ctx, c, s) => {
    const { radii } = tierFL(s);
    ctx.setLineDash([0.04, 0.03]);
    D.circle(ctx, 0, 0, radii[0], tint(c.body, 0.3) + 'cc', INK_SOFT, LINE_THIN);
    ctx.setLineDash([]);
    D.circle(ctx, 0, 0, radii[1], tint(c.glass, 0.1), INK_SOFT, LINE_THIN);
    D.circle(ctx, 0, 0, radii[2], tint(c.body, 0.2), INK_SOFT, LINE_THIN);
  },
});

/* ===================================================================== SPOTS & TRACKS */

/** Round spot head along local -Y (top at y = 0, mouth at y = -len), with a recessed reflector + LED. */
function spotHead(hk: Kit, gk: Kit, r: number, len: number, body: THREE.Material, refl: THREE.Material, fins = 0, seg = 24): void {
  hk.geo(openCyl(r, r, len, seg), body, 0, -len, 0);
  hk.cyl(r, 0.004, body, 0, -0.004, 0, r * 0.94, seg);
  // cooling grooves: thin raised bands
  for (let j = 0; j < fins; j++) hk.geo(openCyl(r + 0.0012, r + 0.0012, 0.0025, seg), body, 0, -0.014 - j * 0.009, 0);
  const depth = Math.min(0.04, len * 0.4);
  // listed top -> bottom so the cone faces the viewer below
  hk.lathe(
    [
      [r * 0.36, -len + depth],
      [r * 0.7, -len + depth * 0.45],
      [r * 0.95, -len],
    ],
    refl,
    0,
    0,
    0,
    seg,
  );
  ns(gk.cyl(r * 0.36, 0.002, led(WARM, 2.4), 0, -len + depth - 0.002, 0, r * 0.36, Math.max(10, seg - 8)));
}

const trackL = (s: ItemSize) => {
  const n = clamp(Math.round(s.w / 0.42), 1, 7);
  const xs: number[] = [];
  for (let i = 0; i < n; i++) xs.push(-s.w / 2 + ((i + 0.5) * s.w) / n);
  return { n, xs };
};
const track3 = lamp({
  id: 'mspot-track-rail',
  name: 'מסילת תאורה עם ספוטים',
  group: SPOTS,
  tags: ['מסילה', 'ספוטים', 'מתכוונן', 'גלריה', 'מטבח', 'שחור', 'ספוט'],
  size: { w: 1.2, d: 0.16, h: 0.25 },
  resize: { w: [0.5, 3.0] },
  mount: 'ceiling',
  colors: [slot('body', 'גוף', '#1d1d1f'), slot('inner', 'רפלקטור', '#c9a35a')],
  light: { color: WARM, intensity: 72, distance: 8 },
  at: () => [0, CEIL - 0.2, 0],
  build: (k, g, c, s) => {
    const { xs, n } = trackL(s);
    const body = powder(c.body);
    const refl = M.metal(c.inner, 0.22, 1);
    k.rbox(s.w, 0.034, 0.034, 0.003, body, 0, CEIL - 0.034, 0);
    k.box(s.w - 0.012, 0.0015, 0.012, M.rubber('#0d0d0e'), 0, CEIL - 0.0352, 0);
    k.rbox(0.075, 0.04, 0.042, 0.004, body, -s.w / 2 + 0.0375, CEIL - 0.04, 0);
    xs.forEach((x, i) => {
      const tilt = (i % 2 ? 0.34 : -0.3) * (n === 1 ? 0.6 : 1);
      const yaw = n === 1 ? 0 : ((i - (n - 1) / 2) / Math.max(1, (n - 1) / 2)) * 0.35;
      const xx = clamp(x, -s.w / 2 + 0.06, s.w / 2 - 0.06);
      k.box(0.032, 0.03, 0.03, body, xx, CEIL - 0.064, 0);
      k.cyl(0.006, 0.026, body, xx, CEIL - 0.09, 0, 0.006, 8);
      k.sphere(0.011, body, xx, CEIL - 0.094, 0, 1, 1, 1, 10);
      const hk = sub(k, xx, CEIL - 0.1, 0, tilt, yaw);
      const gk = sub(g, xx, CEIL - 0.1, 0, tilt, yaw);
      spotHead(hk, gk, 0.032, 0.125, body, refl, 2, 20);
    });
  },
  plan: (ctx, c, s) => {
    const { xs } = trackL(s);
    dashRect(ctx, 0, 0, s.w, 0.034, 0.004, tint(c.body, 0.6));
    for (const x of xs) lampSym(ctx, 0.034, tint(c.body, 0.5) + 'dd', true, clamp(x, -s.w / 2 + 0.06, s.w / 2 - 0.06), 0);
  },
});

/** Layout of a magnetic track: spots at both ends, an LED grille in the middle of long tracks, linear modules between. */
const magL = (s: ItemSize) => {
  const spots = [-(s.w / 2 - 0.05), s.w / 2 - 0.05];
  const lin: Array<[number, number]> = [];
  const pack = (a: number, b: number) => {
    const m = Math.max(1, Math.round((b - a) / 0.31));
    const len = (b - a) / m;
    for (let i = 0; i < m; i++) lin.push([a + (i + 0.5) * len, len - 0.014]);
  };
  const L = s.w / 2 - 0.1;
  const grille = s.w >= 0.95;
  if (grille) {
    pack(-L, -0.11);
    pack(0.11, L);
  } else pack(-L, L);
  return { spots, lin, grille };
};
const magnetic = lamp({
  id: 'mspot-magnetic-track',
  name: 'מסילה מגנטית עם מודולי לד',
  group: SPOTS,
  tags: ['מסילה מגנטית', 'לד', 'ספוטים', 'דק', 'מודולרי', 'שחור', 'ספוט'],
  size: { w: 1.2, d: 0.06, h: 0.11 },
  resize: { w: [0.6, 3.0] },
  mount: 'ceiling',
  colors: [slot('body', 'מסילה', '#141415'), slot('heads', 'ראשי ספוט', '#2b2b2d')],
  light: { color: NEUTRAL, intensity: 66, distance: 7.5 },
  at: () => [0, CEIL - 0.14, 0],
  build: (k, g, c, s) => {
    const { spots, lin, grille } = magL(s);
    const body = powder(c.body);
    const heads = powder(c.heads);
    const lens = opal('#ffffff', 1.6, NEUTRAL);
    const yB = CEIL - 0.045;
    k.rbox(s.w, 0.045, 0.024, 0.002, body, 0, yB, 0);
    for (const [x, len] of lin) {
      k.box(len + 0.008, 0.004, 0.02, heads, x, yB - 0.004, 0);
      ns(g.box(len, 0.0016, 0.014, lens, x, yB - 0.0052, 0));
    }
    if (grille) {
      k.box(0.2, 0.012, 0.02, heads, 0, yB - 0.012, 0);
      for (let i = 0; i < 6; i++) {
        const x = -0.075 + i * 0.03;
        k.box(0.022, 0.0015, 0.016, M.rubber('#0b0b0c'), x, yB - 0.0128, 0);
        ns(g.cyl(0.004, 0.002, led(NEUTRAL, 2.4), x, yB - 0.0122, 0, 0.004, 10));
      }
    }
    spots.forEach((x, i) => {
      k.rbox(0.03, 0.012, 0.02, 0.003, heads, x, yB - 0.012, 0);
      const hk = sub(k, x, yB - 0.014, 0, i ? 0.28 : -0.28, 0);
      const gk = sub(g, x, yB - 0.014, 0, i ? 0.28 : -0.28, 0);
      hk.sphere(0.006, heads, 0, 0, 0, 1, 1, 1, 8);
      spotHead(hk, gk, 0.017, 0.05, heads, heads, 0, 16);
    });
  },
  plan: (ctx, c, s) => {
    const { spots } = magL(s);
    dashRect(ctx, 0, 0, s.w, 0.024, 0.002, tint(c.body, 0.6));
    D.line(ctx, -s.w / 2 + 0.11, 0, s.w / 2 - 0.11, 0, '#d8c79a', 0.008);
    for (const x of spots) D.circle(ctx, x, 0, 0.018, tint(c.heads, 0.5), INK_SOFT, LINE_THIN);
  },
});

const recessed = lamp({
  id: 'mspot-recessed',
  name: 'ספוט שקוע עגול נגד סנוור',
  group: SPOTS,
  tags: ['שקוע', 'ספוט', 'נגד סנוור', 'גבס', 'תקרה אקוסטית', 'לד'],
  size: { w: 0.1, d: 0.1, h: 0.01 },
  resize: { w: [0.06, 0.2], d: [0.06, 0.2] },
  mount: 'ceiling',
  colors: [slot('trim', 'מסגרת', '#f4f4f2'), slot('baffle', 'פנים', '#1b1b1c')],
  light: { color: WARM, intensity: 40, distance: 6 },
  at: () => [0, CEIL - 0.15, 0],
  build: (k, g, c, s) => {
    const R = dia(s) / 2;
    const trim = M.paint(c.trim, 0.4);
    const baffle = M.paint(c.baffle, 0.6);
    k.geo(annulusGeo(R * 0.74, R, 36, true), trim, 0, CEIL - 0.004, 0);
    k.geo(openCyl(R, R * 0.99, 0.004, 36), trim, 0, CEIL - 0.004, 0);
    k.geo(annulusGeo(R * 0.32, R * 0.74, 36, true), baffle, 0, CEIL - 0.0022, 0);
    k.geo(openCyl(R * 0.74, R * 0.74, 0.0018, 36), trim, 0, CEIL - 0.004, 0);
    for (let j = 0; j < 3; j++) k.ring(R * (0.42 + j * 0.1), 0.0009, baffle, 0, CEIL - 0.0024, 0, 28);
    ns(g.cyl(R * 0.32, 0.0016, led(WARM, 2.3), 0, CEIL - 0.0026, 0, R * 0.32, 20));
  },
  plan: (ctx, c, s) => {
    const R = dia(s) / 2;
    D.circle(ctx, 0, 0, R, tint(c.trim, 0.2), INK_SOFT, LINE_THIN);
    D.circle(ctx, 0, 0, R * 0.74, tint(c.baffle, 0.6), INK_SOFT, LINE_THIN);
    const q = R * 0.4;
    D.line(ctx, -q, 0, q, 0, INK_SOFT, LINE_THIN);
    D.line(ctx, 0, -q, 0, q, INK_SOFT, LINE_THIN);
  },
});

const gimL = (s: ItemSize) => {
  const sc = Math.min(s.w / 0.12, s.d / 0.12, s.h / 0.11);
  const B = 0.12 * sc;
  const Hb = 0.07 * sc;
  const rh = 0.033 * sc;
  const Lh = 0.075 * sc;
  const py = CEIL - Hb * 0.55;
  const tilt = 0.42;
  return { sc, B, Hb, rh, Lh, py, tilt };
};
const gimbal = lamp({
  id: 'mspot-gimbal',
  name: 'ספוט גימבל מרובע צמוד תקרה',
  group: SPOTS,
  tags: ['גימבל', 'ספוט', 'מרובע', 'מתכוונן', 'צמוד תקרה', 'ספוט'],
  size: { w: 0.12, d: 0.12, h: 0.11 },
  resize: { w: [0.09, 0.2], d: [0.09, 0.2], h: [0.08, 0.18] },
  mount: 'ceiling',
  colors: [slot('body', 'גוף', '#f2f2f0'), slot('head', 'ראש', '#1d1d1f')],
  light: { color: WARM, intensity: 42, distance: 6.5 },
  at: (s) => {
    const { Lh, py, tilt } = gimL(s);
    const p = rot([0, -Lh * 0.62, 0], tilt);
    return [p[0], py + p[1], p[2]];
  },
  build: (k, g, c, s) => {
    const { B, Hb, rh, Lh, py, tilt } = gimL(s);
    const body = powder(c.body);
    const head = powder(c.head);
    const t = 0.004;
    k.box(B, t, B, body, 0, CEIL - t, 0);
    for (const sg of [-1, 1]) {
      k.box(B, Hb, t, body, 0, CEIL - Hb, sg * (B / 2 - t / 2));
      k.box(t, Hb, B - 2 * t, body, sg * (B / 2 - t / 2), CEIL - Hb, 0);
      // gimbal yoke
      k.box(0.004, CEIL - t - py + 0.008, 0.014, head, sg * (rh + 0.005), py - 0.008, 0);
      k.rod([sg * (rh + 0.007), py, 0], [sg * rh, py, 0], 0.004, head, 0.004, 8);
    }
    k.box(2 * rh + 0.014, 0.004, 0.014, head, 0, CEIL - t - 0.004, 0);
    const hk = sub(k, 0, py, 0, tilt);
    const gk = sub(g, 0, py, 0, tilt);
    hk.geo(openCyl(rh, rh, Lh, 28), head, 0, -Lh * 0.62, 0);
    hk.cyl(rh, 0.004, head, 0, Lh * 0.38 - 0.004, 0, rh * 0.94, 28);
    hk.lathe(
      [
        [rh * 0.4, -Lh * 0.62 + 0.03],
        [rh * 0.93, -Lh * 0.62],
      ],
      M.metal('#d9dadb', 0.2, 1),
      0,
      0,
      0,
      24,
    );
    ns(gk.cyl(rh * 0.4, 0.002, led(WARM, 2.4), 0, -Lh * 0.62 + 0.028, 0, rh * 0.4, 16));
  },
  plan: (ctx, c, s) => {
    const { B, rh } = gimL(s);
    ctx.setLineDash([0.03, 0.02]);
    D.rr(ctx, 0, 0, B, B, 0.004, tint(c.body, 0.3), INK_SOFT, LINE_THIN);
    ctx.setLineDash([]);
    D.circle(ctx, 0, 0, rh, tint(c.head, 0.5), INK_SOFT, LINE_THIN);
  },
});

const swivL = (s: ItemSize) => {
  const sc = Math.min(s.w / 0.14, s.d / 0.14, s.h / 0.22);
  const zb = -0.02 * sc;
  const py = CEIL - 0.05 * sc;
  return { sc, zb, py, rh: 0.033 * sc, L: 0.12 * sc, tilt: -0.4 };
};
const surfaceSwivel = lamp({
  id: 'mspot-surface-swivel',
  name: 'ספוט צילינדר עם מפרק ורפלקטור זהב',
  group: SPOTS,
  tags: ['ספוט', 'צילינדר', 'מפרק', 'כוורת', 'רפלקטור זהב', 'צמוד תקרה'],
  size: { w: 0.14, d: 0.14, h: 0.22 },
  resize: { w: [0.1, 0.22], d: [0.1, 0.22], h: [0.16, 0.34] },
  mount: 'ceiling',
  colors: [slot('body', 'גוף', '#1d1d1f'), slot('inner', 'רפלקטור', '#c9a35a')],
  light: { color: WARM, intensity: 44, distance: 6.5 },
  at: (s) => {
    const { zb, py, L, tilt, sc } = swivL(s);
    const p = rot([0, -0.008 * sc - L + 0.02 * sc, 0], tilt);
    return [p[0], py + p[1], zb + p[2]];
  },
  build: (k, g, c, s) => {
    const { sc, zb, py, rh, L, tilt } = swivL(s);
    const body = powder(c.body);
    const refl = M.metal(c.inner, 0.22, 1);
    k.cyl(0.04 * sc, 0.014 * sc, body, 0, CEIL - 0.014 * sc, zb, 0.038 * sc, 28);
    k.cyl(0.007 * sc, 0.03 * sc, body, 0, CEIL - 0.044 * sc, zb, 0.007 * sc, 10);
    k.sphere(0.012 * sc, body, 0, py, zb, 1, 1, 1, 12);
    const hk = sub(k, 0, py, zb, tilt);
    const gk = sub(g, 0, py, zb, tilt);
    const top = -0.008 * sc;
    const mouth = top - L;
    hk.geo(openCyl(rh, rh, L, 28), body, 0, mouth, 0);
    hk.cyl(rh, 0.004, body, 0, top - 0.004, 0, rh * 0.94, 28);
    const depth = 0.05 * sc;
    hk.lathe(
      [
        [rh * 0.4, mouth + depth],
        [rh * 0.8, mouth + depth * 0.35],
        [rh * 0.96, mouth],
      ],
      refl,
      0,
      0,
      0,
      24,
    );
    // honeycomb louvre just inside the mouth
    const black = M.rubber('#0e0e0f');
    for (let i = -2; i <= 2; i++) {
      const o = (i / 3) * rh;
      const ch = 2 * Math.sqrt(Math.max(0, (rh * 0.92) ** 2 - o * o));
      if (ch < 0.004) continue;
      hk.box(ch, 0.008 * sc, 0.0012, black, 0, mouth + 0.012 * sc, o);
      hk.box(0.0012, 0.008 * sc, ch, black, o, mouth + 0.012 * sc, 0);
    }
    ns(gk.cyl(rh * 0.4, 0.002, led(WARM, 2.4), 0, mouth + depth - 0.002, 0, rh * 0.4, 16));
  },
  plan: (ctx, c, s) => {
    const { sc, zb, rh } = swivL(s);
    D.circle(ctx, 0, zb, 0.04 * sc, tint(c.body, 0.6), INK_SOFT, LINE_THIN);
    D.rr(ctx, 0, zb + 0.03 * sc, rh * 2, 0.07 * sc, rh * 0.5, tint(c.body, 0.45), INK_SOFT, LINE_THIN);
  },
});

/** Eyeball: a sphere cut flat at the front (local -Y) with a recessed lens. */
function eyeball(hk: Kit, gk: Kit, R: number, shell: THREE.Material, bezel: THREE.Material): void {
  const cut = -R * 0.76;
  const a0 = Math.asin(cut / R);
  const prof: Array<[number, number]> = [];
  for (let i = 0; i <= 10; i++) {
    const a = a0 + (i / 10) * (Math.PI / 2 - a0);
    prof.push([R * Math.cos(a), R * Math.sin(a)]);
  }
  hk.lathe(prof, shell, 0, 0, 0, 22);
  const rc = R * Math.cos(a0);
  hk.geo(annulusGeo(rc * 0.62, rc, 22, true), bezel, 0, cut, 0);
  hk.geo(openCyl(rc * 0.62, rc * 0.62, R * 0.12, 22), bezel, 0, cut, 0);
  ns(gk.cyl(rc * 0.62, 0.0015, led(WARM, 2.4), 0, cut + R * 0.12, 0, rc * 0.62, 16));
}
const triL = (s: ItemSize) => [-1, 0, 1].map((i) => i * (s.w / 2 - 0.075));
const tripleBar = lamp({
  id: 'mspot-triple-bar',
  name: 'פס שלושה ספוטים עגולים',
  group: SPOTS,
  tags: ['שלושה ספוטים', 'עין', 'מתכוונן', 'פרוזדור', 'מטבח', 'ספוט'],
  size: { w: 0.5, d: 0.1, h: 0.13 },
  resize: { w: [0.35, 1.0] },
  mount: 'ceiling',
  colors: [slot('body', 'גוף', '#ecebe7'), slot('heads', 'ראשים', '#2a2a2c')],
  light: { color: WARM, intensity: 58, distance: 7 },
  at: () => [0, CEIL - 0.16, 0],
  build: (k, g, c, s) => {
    const body = powder(c.body);
    const heads = powder(c.heads);
    k.rbox(s.w, 0.022, 0.07, 0.008, body, 0, CEIL - 0.022, 0);
    const aim: Array<[number, number]> = [
      [-0.45, -Math.PI / 2],
      [-0.4, 0],
      [-0.45, Math.PI / 2],
    ];
    triL(s).forEach((x, i) => {
      k.cyl(0.007, 0.034, body, x, CEIL - 0.054, 0, 0.007, 10);
      const yc = CEIL - 0.086;
      const [rx, ry] = aim[i];
      eyeball(sub(k, x, yc, 0, rx, ry), sub(g, x, yc, 0, rx, ry), 0.034, heads, body);
    });
  },
  plan: (ctx, c, s) => {
    dashRect(ctx, 0, 0, s.w, 0.07, 0.008, tint(c.body, 0.2));
    for (const x of triL(s)) D.circle(ctx, x, 0, 0.034, tint(c.heads, 0.5), INK_SOFT, LINE_THIN);
  },
});

export const MODERN_CEILING: FurnitureDef[] = [ledPanel, thinDisc, fabricDrum, glowDonut, cloud, tieredFlush, track3, magnetic, recessed, gimbal, surfaceSwivel, tripleBar];

