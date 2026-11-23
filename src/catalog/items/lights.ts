/**
 * Lights: floor / table / pendant lamps, chandeliers, wall sconces, fans and decorative lights.
 * Every light has a `LightSpec`, a `light` action and its emissive meshes inside part 'glow'
 * (pivot at the origin, so coordinates are the same as the item's).
 */
import * as THREE from 'three';
import type { ActionSpec, FurnitureDef } from '../types';
import {
  D,
  INK_SOFT,
  Kit,
  LINE_THIN,
  M,
  blobGeo,
  lighten,
  roundedRectShape,
  smoothProfile,
  sym,
  tint,
  type Ctx2D,
  type V3,
} from '../kit';
import { slot } from './_parts';

const CEILING = 2.7;
const WARM = '#ffe1b5';
const CANDLE = '#ffcf8f';
const LIGHT: ActionSpec[] = [{ kind: 'light' }];

/* ------------------------------------------------------------------------------ helpers */

function noShadow<T extends THREE.Object3D>(o: T): T {
  o.castShadow = false;
  return o;
}

/** Open cylinder / cone (lamp shade) with its BOTTOM at y = 0. */
function openCylGeo(rBot: number, rTop: number, h: number, seg = 32): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, true);
  g.translate(0, h / 2, 0);
  return g;
}

/** Knife-pleated shade: open cone whose rim zig-zags in and out (crisp facets), bottom at y = 0. */
function pleatGeo(rBot: number, rTop: number, h: number, pleats = 28, amp = 0.0055): THREE.BufferGeometry {
  const n = pleats * 2;
  const src = new THREE.CylinderGeometry(rTop, rBot, h, n, 1, true);
  const p = src.getAttribute('position') as THREE.BufferAttribute;
  // vertices: rows of (n + 1), ix = i % (n + 1)
  for (let i = 0; i < p.count; i++) {
    const ix = i % (n + 1);
    const s = ix % 2 === 0 ? 1 : -1;
    const x = p.getX(i);
    const z = p.getZ(i);
    const r = Math.hypot(x, z) || 1;
    const k = (r + s * amp) / r;
    p.setXYZ(i, x * k, p.getY(i) + h / 2, z * k);
  }
  const g = src.toNonIndexed();
  g.computeVertexNormals();
  return g;
}

/** Dome / bell profile (bottom rim at y = 0, closed at the top) for lathes. */
function domeProfile(R: number, H: number, neck = 0.025): Array<[number, number]> {
  return [
    [R, 0],
    [R * 0.985, H * 0.12],
    [R * 0.93, H * 0.32],
    [R * 0.8, H * 0.55],
    [R * 0.58, H * 0.78],
    [R * 0.3, H * 0.93],
    [neck, H],
    [neck * 0.6, H],
    [0, H],
  ];
}
/** The inside of a dome, slightly smaller (rendered with a BackSide glow). */
function innerProfile(prof: Array<[number, number]>, t = 0.004): Array<[number, number]> {
  return prof.slice(0, -2).map(([r, y]) => [Math.max(0, r - t), y - t * 0.6] as [number, number]);
}

/** Fabric-covered power cord through points. */
function cord(k: Kit, pts: V3[], color = '#1f1f21', r = 0.0028): THREE.Mesh {
  return noShadow(k.tube(pts, r, M.rubber(color), { radial: 5, seg: Math.max(10, pts.length * 7) }));
}

/** Ceiling canopy: a shallow disc whose top is flush with the ceiling. */
function canopy(k: Kit, r: number, mat: THREE.Material, h = 0.026, x = 0, z = 0): void {
  k.lathe(
    [
      [0, 0],
      [r * 0.82, 0],
      [r * 0.97, h * 0.35],
      [r, h],
      [0, h],
    ],
    mat,
    x,
    CEILING - h,
    z,
    24,
  );
}

/** Glowing pear bulb (y = centre). */
function bulb(g: Kit, x: number, y: number, z: number, r = 0.032, color = WARM, i = 2.3): void {
  noShadow(g.sphere(r, M.glow(color, i), x, y, z, 1, 1.18, 1, 12));
}

/** Candle-flame bulb (y = centre). */
function flame(g: Kit, x: number, y: number, z: number, r = 0.011): void {
  noShadow(g.sphere(r, M.glow(CANDLE, 2.6, '#fff6e6'), x, y, z, 1, 1.9, 1, 8));
}

/**
 * Edison filament bulb hanging DOWN from a socket at (x, yTop, z): clear glass envelope on the
 * item, glowing filament + warm core in the glow part.
 */
function edison(k: Kit, g: Kit, x: number, yTop: number, z: number, s = 1): void {
  const prof: Array<[number, number]> = [
    [0, -0.118],
    [0.018, -0.112],
    [0.031, -0.09],
    [0.033, -0.065],
    [0.026, -0.04],
    [0.014, -0.018],
    [0.013, 0],
  ];
  noShadow(k.lathe(smoothProfile(prof.map(([r, y]) => [r * s, y * s]), 9), M.glass('#fff2d6', 0.26), x, yTop, z, 12));
  const f: V3[] = [
    [-0.006, -0.02, 0],
    [-0.012, -0.07, 0],
    [-0.004, -0.083, 0],
    [0.004, -0.083, 0],
    [0.012, -0.07, 0],
    [0.006, -0.02, 0],
  ];
  noShadow(g.tube(f.map(([a, b, c]) => [x + a * s, yTop + b * s, z + c * s] as V3), 0.0012 * s, M.glow('#ffb35c', 3.2, '#ffd9a0'), { radial: 3, seg: 24 }));
  noShadow(g.sphere(0.011 * s, M.glow('#ffc87a', 1.6, '#ffe8c4'), x, yTop - 0.062 * s, z, 1, 1.6, 1, 8));
}

/** Plan symbol for a light source: circle with a small cross. */
function lampSym(ctx: Ctx2D, r: number, fill: string, dashed = false, cx = 0, cy = 0): void {
  if (dashed) ctx.setLineDash([0.04, 0.03]);
  D.circle(ctx, cx, cy, r, fill);
  ctx.setLineDash([]);
  const k = r * 0.5;
  D.line(ctx, cx - k, cy - k, cx + k, cy + k, INK_SOFT, LINE_THIN);
  D.line(ctx, cx - k, cy + k, cx + k, cy - k, INK_SOFT, LINE_THIN);
}

/** A sub-builder whose group is transformed (for tilted heads); add it to `into`. */
function tilted(into: Kit, x: number, y: number, z: number, rx = 0, rz = 0): Kit {
  const s = new Kit();
  s.g.position.set(x, y, z);
  s.g.rotation.set(rx, 0, rz);
  into.g.add(s.g);
  return s;
}

/* ===================================================================== FLOOR LAMPS */

const arcLamp: FurnitureDef = {
  id: 'lamp-arc-marble',
  name: 'מנורת קשת עם בסיס שיש',
  category: 'lighting',
  group: 'מנורות רצפה',
  tags: ['קשת', 'שיש', 'מנורת עמידה', 'מודרני', 'פלדה', 'סלון'],
  size: { w: 1.6, d: 0.42, h: 2.02 },
  colors: [slot('shade', 'אהיל', '#d9dadb'), slot('metal', 'מתכת', '#c9ccce'), slot('base', 'שיש', '#f2f0ec')],
  light: { x: 0.593, y: 1.6, z: 0, color: WARM, intensity: 60, distance: 7.5 },
  actions: LIGHT,
  build: ({ colors: c }) => {
    const k = new Kit();
    const g = k.part('glow');
    const metal = M.brushed(c.metal);
    const bx = -0.637;
    k.rbox(0.32, 0.2, 0.32, 0.012, M.marble(c.base), bx, 0, 0);
    k.cyl(0.032, 0.025, metal, bx, 0.198, 0, 0.026, 16);
    const sx = 0.593;
    k.tube(
      [
        [bx, 0.21, 0],
        [bx + 0.004, 1.0, 0],
        [bx + 0.1, 1.55, 0],
        [bx + 0.38, 1.9, 0],
        [0.12, 1.995, 0],
        [0.42, 1.95, 0],
        [sx, 1.84, 0],
        [sx, 1.8, 0],
      ],
      0.011,
      metal,
      { seg: 72, radial: 8 },
    );
    // dimmer on the arc, near the base
    k.cyl(0.016, 0.05, M.plastic('#2b2c2e'), bx + 0.003, 0.62, 0, 0.016, 12);
    // dome shade
    const prof = domeProfile(0.2, 0.24, 0.03);
    k.lathe(prof, M.paint(c.shade, 0.35), sx, 1.56, 0, 32);
    k.ring(0.2, 0.004, M.paint(c.shade, 0.35), sx, 1.56, 0, 32);
    k.cyl(0.03, 0.03, metal, sx, 1.785, 0, 0.022, 16);
    noShadow(g.lathe(innerProfile(prof), M.glow(WARM, 0.6, '#ffffff', THREE.BackSide), sx, 1.56, 0, 32));
    bulb(g, sx, 1.65, 0, 0.04);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.line(ctx, -0.637, 0, 0.593, 0, INK_SOFT, 0.022);
      D.rr(ctx, -0.637, 0, 0.32, 0.32, 0.02, tint(c.base, 0.3));
      lampSym(ctx, 0.2, tint(c.shade, 0.5) + 'dd', true, 0.593, 0);
    }),
};

const tripodLamp: FurnitureDef = {
  id: 'lamp-tripod',
  name: 'מנורת עמידה חצובה מעץ',
  category: 'lighting',
  group: 'מנורות רצפה',
  tags: ['חצובה', 'עץ', 'אהיל פשתן', 'סקנדינבי', 'מנורת עמידה'],
  size: { w: 0.58, d: 0.58, h: 1.55 },
  colors: [slot('shade', 'אהיל', '#ece5d6'), slot('wood', 'עץ', '#a9754a'), slot('metal', 'מתכת', '#c9a35a')],
  light: { x: 0, y: 1.38, z: 0, color: WARM, intensity: 55, distance: 7 },
  actions: LIGHT,
  build: ({ colors: c }) => {
    const k = new Kit();
    const g = k.part('glow');
    const wood = M.wood(c.wood, 0.5);
    const metal = M.metal(c.metal, 0.3, 1);
    const hubY = 1.18;
    for (let i = 0; i < 3; i++) {
      const a = Math.PI / 2 + (i * Math.PI * 2) / 3;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      k.rod([ca * 0.272, 0.003, sa * 0.272], [ca * 0.034, hubY, sa * 0.034], 0.016, wood, 0.011, 10);
      // brass ferrules on the feet
      k.rod([ca * 0.272, 0.003, sa * 0.272], [ca * 0.262, 0.05, sa * 0.262], 0.0175, metal, 0.0165, 10);
    }
    k.cyl(0.045, 0.06, metal, 0, hubY - 0.035, 0, 0.03, 18);
    k.cyl(0.011, 0.15, metal, 0, hubY + 0.02, 0, 0.011, 10);
    k.cyl(0.02, 0.05, M.blackMetal(), 0, 1.31, 0, 0.02, 12);
    // drum shade
    noShadow(g.geo(openCylGeo(0.24, 0.24, 0.3, 40), M.shade(c.shade), 0, 1.24, 0));
    for (const y of [1.241, 1.539]) k.ring(0.241, 0.003, metal, 0, y, 0, 40);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      k.rod([0, 1.36, 0], [Math.cos(a) * 0.236, 1.537, Math.sin(a) * 0.236], 0.0025, metal, 0.0025, 5);
    }
    k.ring(0.022, 0.003, metal, 0, 1.36, 0, 12);
    bulb(g, 0, 1.4, 0, 0.042);
    // cord running down the back leg with an inline switch on the floor
    cord(k, [
      [-0.02, hubY - 0.03, -0.03],
      [-0.12, 0.65, -0.085],
      [-0.215, 0.14, -0.14],
      [-0.24, 0.012, -0.08],
      [-0.27, 0.005, 0.08],
      [-0.285, 0.005, 0.27],
    ]);
    k.rbox(0.03, 0.018, 0.06, 0.006, M.plastic('#f1efea'), -0.272, 0, 0.13);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      for (let i = 0; i < 3; i++) {
        const a = Math.PI / 2 + (i * Math.PI * 2) / 3;
        D.line(ctx, 0, 0, Math.cos(a) * 0.29, Math.sin(a) * 0.29, INK_SOFT, 0.016);
      }
      lampSym(ctx, 0.24, tint(c.shade, 0.5) + 'dd');
    }),
};

const torchiere: FurnitureDef = {
  id: 'lamp-torchiere',
  name: 'מנורת עמידה מאירה לתקרה',
  category: 'lighting',
  group: 'מנורות רצפה',
  tags: ['טורשייר', 'תאורה עקיפה', 'דימר', 'מנורת עמידה', 'מתכת'],
  size: { w: 0.37, d: 0.37, h: 1.8 },
  colors: [slot('metal', 'מתכת', '#3a3b3e')],
  light: { x: 0, y: 1.77, z: 0, color: '#ffe6c2', intensity: 60, distance: 7.5 },
  actions: LIGHT,
  build: ({ colors: c }) => {
    const k = new Kit();
    const g = k.part('glow');
    const metal = M.metal(c.metal, 0.32, 0.9);
    k.lathe(
      [
        [0, 0],
        [0.168, 0],
        [0.172, 0.008],
        [0.163, 0.022],
        [0.06, 0.035],
        [0.02, 0.046],
        [0, 0.046],
      ],
      metal,
      0,
      0,
      0,
      32,
    );
    k.disc(0.165, 0.003, M.rubber(), 0, 0, 0, 24);
    k.cyl(0.011, 1.56, metal, 0, 0.044, 0, 0.0095, 12);
    // pole joints and the dimmer knob
    for (const y of [0.62, 1.12]) k.cyl(0.0135, 0.02, metal, 0, y, 0, 0.0135, 12);
    k.cyl(0.019, 0.06, metal, 0, 0.98, 0, 0.019, 14);
    const knob = k.rod([0, 1.01, 0], [0.036, 1.01, 0], 0.011, M.plastic('#1f1f20'), 0.011, 12);
    knob.castShadow = false;
    // uplighter bowl
    const bowl: Array<[number, number]> = [
      [0.012, 0],
      [0.04, 0.018],
      [0.1, 0.065],
      [0.15, 0.125],
      [0.172, 0.168],
      [0.176, 0.178],
    ];
    k.lathe(bowl, metal, 0, 1.6, 0, 36);
    k.ring(0.176, 0.0045, metal, 0, 1.778, 0, 36);
    noShadow(g.lathe(bowl.slice(2).map(([r, y]) => [r - 0.004, y + 0.002] as [number, number]), M.glow(WARM, 0.8, '#ffffff', THREE.BackSide), 0, 1.6, 0, 36));
    noShadow(g.disc(0.135, 0.004, M.glow('#fff0d8', 1.8, '#ffffff'), 0, 1.735, 0, 32));
    // cord + foot switch
    cord(k, [
      [0, 0.012, -0.16],
      [0.02, 0.006, -0.175],
      [0.09, 0.006, -0.17],
    ]);
    k.cyl(0.025, 0.018, M.plastic('#1f1f20'), 0.12, 0, -0.155, 0.022, 14);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      lampSym(ctx, 0.176, tint(c.metal, 0.6));
      D.circle(ctx, 0, 0, 0.135, null, INK_SOFT, LINE_THIN);
    }),
};

const lanternFloor: FurnitureDef = {
  id: 'lamp-paper-lantern',
  name: 'מנורת עמידה פנס נייר',
  category: 'lighting',
  group: 'מנורות רצפה',
  tags: ['נייר אורז', 'יפני', 'פנס', 'וואבי סאבי', 'מנורת עמידה'],
  size: { w: 0.44, d: 0.44, h: 1.56 },
  colors: [slot('paper', 'נייר', '#f4eee2'), slot('wood', 'בסיס עץ', '#7b5538')],
  light: { x: 0, y: 0.85, z: 0, color: '#ffe0b0', intensity: 42, distance: 6 },
  actions: LIGHT,
  build: ({ colors: c }) => {
    const k = new Kit();
    const g = k.part('glow');
    const wood = M.wood(c.wood, 0.55);
    const black = M.blackMetal();
    k.box(0.42, 0.024, 0.04, wood, 0, 0, 0);
    k.box(0.04, 0.025, 0.42, wood, 0, 0, 0);
    for (const [x, z] of [[0.19, 0], [-0.19, 0], [0, 0.19], [0, -0.19]]) k.cyl(0.01, 0.004, M.rubber(), x, 0, z, 0.01, 8);
    k.cyl(0.006, 0.18, black, 0, 0.025, 0, 0.006, 8);
    const y0 = 0.17;
    const prof = smoothProfile(
      [
        [0.06, 0],
        [0.15, 0.07],
        [0.196, 0.3],
        [0.205, 0.62],
        [0.19, 0.98],
        [0.135, 1.24],
        [0.06, 1.36],
      ],
      24,
    );
    noShadow(g.lathe(prof, M.glow('#ffd9a0', 0.5, c.paper, THREE.DoubleSide), 0, y0, 0, 24));
    // bamboo ribs (seen as soft lines through the paper)
    const rib = M.matte(lighten('#bfae8c', 0.1));
    for (let i = 1; i < prof.length - 1; i += 2) {
      const [r, y] = prof[i];
      const m = k.geo(new THREE.TorusGeometry(r + 0.0015, 0.0018, 3, 24), rib, 0, y0 + y, 0);
      m.rotation.x = Math.PI / 2;
      m.castShadow = false;
    }
    k.ring(0.06, 0.003, black, 0, y0, 0, 16);
    k.ring(0.06, 0.003, black, 0, y0 + 1.36, 0, 16);
    // cord leaving the base
    cord(k, [
      [0.01, 0.026, -0.02],
      [0.015, 0.03, -0.12],
      [0.012, 0.005, -0.2],
    ]);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 0.42, 0.04, 0, '#ffffff', INK_SOFT, LINE_THIN);
      D.rr(ctx, 0, 0, 0.04, 0.42, 0, '#ffffff', INK_SOFT, LINE_THIN);
      lampSym(ctx, 0.205, tint(c.paper, 0.2) + 'dd');
      D.circle(ctx, 0, 0, 0.14, null, INK_SOFT, LINE_THIN);
    }),
};

const globeFloor: FurnitureDef = {
  id: 'lamp-globe-floor',
  name: 'מנורת עמידה כדור אופל',
  category: 'lighting',
  group: 'מנורות רצפה',
  tags: ['כדור', 'זכוכית אופל', 'פליז', 'שיש', 'מנורת עמידה'],
  size: { w: 0.34, d: 0.34, h: 1.6 },
  colors: [slot('metal', 'מתכת', '#c9a35a'), slot('base', 'בסיס', '#2f3033')],
  light: { x: 0, y: 1.44, z: 0, color: WARM, intensity: 50, distance: 7 },
  actions: LIGHT,
  build: ({ colors: c }) => {
    const k = new Kit();
    const g = k.part('glow');
    const metal = M.metal(c.metal, 0.28, 1);
    k.lathe(
      [
        [0, 0],
        [0.15, 0],
        [0.152, 0.03],
        [0.146, 0.04],
        [0, 0.04],
      ],
      M.marble(c.base),
      0,
      0,
      0,
      32,
    );
    k.cyl(0.03, 0.015, metal, 0, 0.04, 0, 0.022, 16);
    k.cyl(0.0095, 1.22, metal, 0, 0.05, 0, 0.0085, 12);
    k.cyl(0.016, 0.03, metal, 0, 0.62, 0, 0.016, 12);
    // gallery holding the globe
    k.lathe(
      [
        [0.008, 0],
        [0.03, 0.006],
        [0.052, 0.026],
        [0.056, 0.036],
      ],
      metal,
      0,
      1.268,
      0,
      20,
    );
    noShadow(g.sphere(0.15, M.glow(WARM, 0.95, '#fbf8f1'), 0, 1.445, 0, 1, 1, 1, 24));
    cord(k, [
      [0, 0.02, -0.145],
      [0, 0.005, -0.165],
    ]);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.circle(ctx, 0, 0, 0.15, tint(c.base, 0.55));
      lampSym(ctx, 0.15, '#fffaf0cc');
    }),
};

const readingSwing: FurnitureDef = {
  id: 'lamp-reading-swing',
  name: 'מנורת קריאה עם זרוע מסתובבת',
  category: 'lighting',
  group: 'מנורות רצפה',
  tags: ['קריאה', 'זרוע', 'כורסה', 'מנורת עמידה', 'תעשייתי'],
  size: { w: 0.74, d: 0.3, h: 1.34 },
  colors: [slot('shade', 'ראש', '#2c2d30'), slot('metal', 'פרזול', '#c9a35a')],
  light: { x: 0.26, y: 1.15, z: 0, color: WARM, intensity: 30, distance: 5 },
  actions: LIGHT,
  build: ({ colors: c }) => {
    const k = new Kit();
    const g = k.part('glow');
    const body = M.paint(c.shade, 0.38);
    const brass = M.metal(c.metal, 0.3, 1);
    const bx = -0.23;
    k.lathe(
      [
        [0, 0],
        [0.135, 0],
        [0.138, 0.01],
        [0.13, 0.022],
        [0.04, 0.03],
        [0, 0.03],
      ],
      body,
      bx,
      0,
      0,
      32,
    );
    k.cyl(0.0095, 1.27, body, bx, 0.03, 0, 0.0095, 12);
    k.cyl(0.018, 0.05, brass, bx, 1.28, 0, 0.018, 14);
    const armY = 1.315;
    k.rod([bx - 0.03, armY, 0], [0.2, armY, 0], 0.0065, brass, 0.0065, 8);
    k.sphere(0.016, brass, bx - 0.04, armY, 0, 1, 1, 1, 12);
    k.sphere(0.012, brass, 0.2, armY, 0, 1, 1, 1, 10);
    // tilted cone head
    const tz = 0.3;
    const hx = 0.27;
    const hy = 1.12;
    const topX = hx - 0.15 * Math.sin(tz);
    const topY = hy + 0.15 * Math.cos(tz);
    k.rod([0.2, armY, 0], [topX, topY, 0], 0.006, brass, 0.006, 8);
    const head = tilted(k, hx, hy, 0, 0, tz);
    const cone: Array<[number, number]> = [
      [0.075, 0],
      [0.073, 0.012],
      [0.062, 0.06],
      [0.035, 0.12],
      [0.02, 0.14],
      [0.018, 0.155],
      [0, 0.155],
    ];
    head.lathe(cone, body, 0, 0, 0, 28);
    head.ring(0.075, 0.0025, brass, 0, 0.0, 0, 28);
    head.cyl(0.008, 0.012, brass, 0.01, 0.13, 0.016, 0.008, 8);
    const gh = tilted(g, hx, hy, 0, 0, tz);
    noShadow(gh.lathe(cone.slice(0, 5).map(([r, y]) => [r - 0.003, y + 0.002] as [number, number]), M.glow(WARM, 0.55, '#ffffff', THREE.BackSide), 0, 0, 0, 28));
    bulb(gh, 0, 0.045, 0, 0.026);
    // cord down the pole with an inline switch
    cord(k, [
      [bx + 0.012, 1.26, 0.006],
      [bx + 0.014, 0.8, 0.01],
      [bx + 0.016, 0.3, 0.012],
      [bx + 0.03, 0.04, 0.03],
      [bx + 0.05, 0.03, 0.1],
      [bx + 0.06, 0.006, 0.14],
    ]);
    k.rbox(0.025, 0.06, 0.018, 0.005, M.plastic('#1f1f20'), bx + 0.015, 0.5, 0.012);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.circle(ctx, -0.23, 0, 0.135, tint(c.shade, 0.6));
      D.line(ctx, -0.27, 0, 0.22, 0, INK_SOFT, 0.016);
      lampSym(ctx, 0.075, tint(c.shade, 0.5), true, 0.27, 0);
    }),
};

/* ===================================================================== TABLE LAMPS */

const mushroom: FurnitureDef = {
  id: 'lamp-mushroom',
  name: 'מנורת שולחן פטרייה',
  category: 'lighting',
  group: 'מנורות שולחן',
  tags: ['פטרייה', 'רטרו', 'מבריק', 'שנות ה-70', 'מנורת לילה'],
  size: { w: 0.36, d: 0.36, h: 0.42 },
  colors: [slot('body', 'גוף', '#d97a4a')],
  light: { x: 0, y: 0.28, z: 0, color: WARM, intensity: 20, distance: 4.5 },
  actions: LIGHT,
  build: ({ colors: c }) => {
    const k = new Kit();
    const g = k.part('glow');
    const body = M.lacquer(c.body);
    k.lathe(
      smoothProfile(
        [
          [0, 0],
          [0.105, 0],
          [0.112, 0.008],
          [0.1, 0.02],
          [0.05, 0.036],
          [0.03, 0.06],
          [0.024, 0.15],
          [0.022, 0.26],
        ],
        18,
      ).concat([[0, 0.26]]),
      body,
      0,
      0,
      0,
      28,
    );
    const prof = domeProfile(0.178, 0.17, 0.02);
    k.lathe(prof, body, 0, 0.25, 0, 36);
    k.ring(0.178, 0.003, body, 0, 0.25, 0, 36);
    noShadow(g.lathe(innerProfile(prof), M.glow(WARM, 0.55, '#ffffff', THREE.BackSide), 0, 0.25, 0, 36));
    bulb(g, 0, 0.3, 0, 0.034);
    cord(k, [
      [0, 0.01, -0.095],
      [0, 0.004, -0.12],
      [0.03, 0.004, -0.17],
    ], '#e8e2d8');
    return k.g;
  },
  draw2d: (ctx, c) => sym(ctx, () => lampSym(ctx, 0.178, tint(c.body, 0.45))),
};

const ceramicPleated: FurnitureDef = {
  id: 'lamp-ceramic-pleated',
  name: 'מנורת שולחן קרמיקה עם אהיל קפלים',
  category: 'lighting',
  group: 'מנורות שולחן',
  tags: ['קרמיקה', 'אהיל קפלים', 'קלאסי', 'שידה', 'חדר שינה'],
  size: { w: 0.42, d: 0.42, h: 0.68 },
  colors: [slot('base', 'בסיס קרמי', '#5f7f8c'), slot('shade', 'אהיל', '#f2ede2'), slot('metal', 'פרזול', '#c9a35a')],
  light: { x: 0, y: 0.5, z: 0, color: WARM, intensity: 24, distance: 5 },
  actions: LIGHT,
  build: ({ colors: c }) => {
    const k = new Kit();
    const g = k.part('glow');
    const metal = M.metal(c.metal, 0.3, 1);
    k.lathe(
      [
        [0, 0],
        [0.085, 0],
        [0.088, 0.012],
        [0.08, 0.03],
        [0, 0.03],
      ],
      M.wood('#4d382b', 0.45),
      0,
      0,
      0,
      28,
    );
    k.lathe(
      smoothProfile(
        [
          [0.06, 0],
          [0.09, 0.03],
          [0.12, 0.1],
          [0.128, 0.17],
          [0.112, 0.245],
          [0.075, 0.295],
          [0.048, 0.315],
          [0.046, 0.335],
        ],
        26,
      ).concat([[0, 0.335]]),
      M.ceramic(c.base),
      0,
      0.03,
      0,
      24,
    );
    k.cyl(0.03, 0.012, metal, 0, 0.365, 0, 0.02, 16);
    k.cyl(0.011, 0.08, metal, 0, 0.375, 0, 0.011, 10);
    k.cyl(0.019, 0.05, metal, 0, 0.445, 0, 0.017, 14);
    // harp + finial
    k.tube(
      [
        [-0.1, 0.44, 0],
        [-0.105, 0.55, 0],
        [-0.06, 0.63, 0],
        [0, 0.648, 0],
        [0.06, 0.63, 0],
        [0.105, 0.55, 0],
        [0.1, 0.44, 0],
      ],
      0.0022,
      metal,
      { radial: 4, seg: 30 },
    );
    k.rod([-0.1, 0.442, 0], [0.1, 0.442, 0], 0.0022, metal, 0.0022, 4);
    k.sphere(0.013, metal, 0, 0.663, 0, 1, 1.2, 1, 12);
    // pleated empire shade
    noShadow(g.geo(pleatGeo(0.2, 0.13, 0.26, 24, 0.0055), M.shade(c.shade), 0, 0.39, 0));
    k.ring(0.2, 0.0035, M.cloth(c.shade), 0, 0.391, 0, 40);
    k.ring(0.13, 0.0035, M.cloth(c.shade), 0, 0.649, 0, 32);
    bulb(g, 0, 0.52, 0, 0.034);
    cord(k, [
      [0, 0.015, -0.08],
      [0, 0.005, -0.12],
      [0.04, 0.005, -0.2],
    ]);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      lampSym(ctx, 0.2, tint(c.shade, 0.3));
      D.circle(ctx, 0, 0, 0.13, null, INK_SOFT, LINE_THIN);
      D.circle(ctx, 0, 0, 0.02, tint(c.base, 0.3), INK_SOFT, LINE_THIN);
    }),
};

const bankers: FurnitureDef = {
  id: 'lamp-bankers',
  name: 'מנורת בנקאי עם זכוכית ירוקה',
  category: 'lighting',
  group: 'מנורות שולחן',
  tags: ['בנקאי', 'זכוכית ירוקה', 'פליז', 'שולחן כתיבה', 'ספרייה', 'וינטג\''],
  size: { w: 0.32, d: 0.24, h: 0.42 },
  colors: [slot('glass', 'זכוכית', '#1f6b45'), slot('metal', 'פליז', '#c9a35a')],
  light: { x: 0, y: 0.3, z: 0.02, color: WARM, intensity: 20, distance: 4.5 },
  actions: LIGHT,
  build: ({ colors: c }) => {
    const k = new Kit();
    const g = k.part('glow');
    const brass = M.metal(c.metal, 0.26, 1);
    k.slab(roundedRectShape(0.25, 0.15, 0.06), 0.03, brass, 0, 0, 0, 0.008, 8);
    k.slab(roundedRectShape(0.2, 0.1, 0.04), 0.006, brass, 0, 0.03, 0, 0.002, 8);
    // turned stem
    k.lathe(
      [
        [0.016, 0],
        [0.012, 0.02],
        [0.008, 0.03],
        [0.008, 0.1],
        [0.014, 0.11],
        [0.008, 0.12],
        [0.008, 0.2],
        [0, 0.2],
      ],
      brass,
      0,
      0.036,
      -0.045,
      14,
    );
    k.tube(
      [
        [0, 0.23, -0.045],
        [0, 0.27, -0.04],
        [0, 0.29, -0.015],
        [0, 0.29, 0.0],
      ],
      0.006,
      brass,
      { radial: 6, seg: 12 },
    );
    // green cased-glass trough shade (tilted towards the reader) with brass end caps
    const tilt = 0.18;
    const sh = tilted(k, 0, 0.32, 0.02, tilt, 0);
    const half = (r: number, len: number, open: boolean) => {
      const gg = new THREE.CylinderGeometry(r, r, len, 20, 1, open, 0, Math.PI);
      gg.rotateZ(Math.PI / 2);
      return gg;
    };
    sh.geo(half(0.085, 0.3, true), M.lacquer(c.glass), 0, 0, 0);
    for (const s of [-1, 1]) sh.geo(half(0.088, 0.006, false), brass, s * 0.153, 0, 0);
    const gs = tilted(g, 0, 0.32, 0.02, tilt, 0);
    noShadow(gs.geo(half(0.082, 0.298, true), M.glow(WARM, 0.75, '#fffdf6', THREE.BackSide), 0, 0, 0));
    const tubeBulb = gs.geo(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 10), M.glow(WARM, 2.4), 0, 0.01, 0);
    tubeBulb.rotation.z = Math.PI / 2;
    noShadow(tubeBulb);
    // pull chain
    k.rod([0.09, 0.285, 0.06], [0.09, 0.2, 0.065], 0.0012, brass, 0.0012, 4);
    k.sphere(0.006, brass, 0.09, 0.197, 0.065, 1, 1.4, 1, 8);
    cord(k, [
      [0, 0.012, -0.075],
      [0, 0.005, -0.1],
      [0.05, 0.005, -0.118],
    ]);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 0.25, 0.15, 0.06, '#efe3c4', INK_SOFT, LINE_THIN);
      D.rr(ctx, 0, 0.02, 0.31, 0.17, 0.03, tint(c.glass, 0.35));
      D.line(ctx, -0.15, 0.02, 0.15, 0.02, INK_SOFT, LINE_THIN);
    }),
};

const taskLamp: FurnitureDef = {
  id: 'lamp-task-desk',
  name: 'מנורת שולחן אדריכל מתכווננת',
  category: 'lighting',
  group: 'מנורות שולחן',
  tags: ['אדריכל', 'שולחן עבודה', 'קפיצים', 'מתכוונן', 'משרד'],
  size: { w: 0.22, d: 0.56, h: 0.54 },
  colors: [slot('body', 'גוף', '#d8473b'), slot('metal', 'זרועות', '#c9ccce')],
  light: { x: 0, y: 0.39, z: 0.165, color: '#fff1dc', intensity: 22, distance: 4.5 },
  actions: LIGHT,
  build: ({ colors: c }) => {
    const k = new Kit();
    const g = k.part('glow');
    const body = M.paint(c.body, 0.35);
    const metal = M.metal(c.metal, 0.25, 1);
    const bz = -0.16;
    k.lathe(
      [
        [0, 0],
        [0.1, 0],
        [0.102, 0.01],
        [0.094, 0.03],
        [0.03, 0.04],
        [0, 0.04],
      ],
      body,
      0,
      0,
      bz,
      32,
    );
    k.rbox(0.05, 0.04, 0.04, 0.006, body, 0, 0.035, bz);
    const P0: V3 = [0, 0.065, bz];
    const P1: V3 = [0, 0.43, -0.065];
    const P2: V3 = [0, 0.495, 0.115];
    for (const s of [-1, 1]) {
      k.rod([s * 0.013, P0[1], P0[2]], [s * 0.013, P1[1], P1[2]], 0.0038, metal, 0.0038, 6);
      k.rod([s * 0.013, P1[1], P1[2]], [s * 0.013, P2[1], P2[2]], 0.0038, metal, 0.0038, 6);
    }
    const knuckle = (p: V3) => k.rod([-0.024, p[1], p[2]], [0.024, p[1], p[2]], 0.009, body, 0.009, 12);
    knuckle(P0);
    knuckle(P1);
    knuckle(P2);
    // springs (helices beside the arms)
    const spring = (a: V3, b: V3, off: number) => {
      const dir = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      const len = dir.length();
      dir.normalize();
      const v = new THREE.Vector3(0, -dir.z, dir.y);
      const pts: V3[] = [];
      const turns = Math.round((len * 0.5) / 0.009);
      for (let i = 0; i <= turns * 4; i++) {
        const t = 0.12 + (0.5 * i) / (turns * 4);
        const th = (i / 4) * Math.PI * 2;
        pts.push([
          off + Math.cos(th) * 0.005,
          a[1] + (b[1] - a[1]) * t + v.y * Math.sin(th) * 0.005,
          a[2] + (b[2] - a[2]) * t + v.z * Math.sin(th) * 0.005,
        ]);
      }
      noShadow(k.tube(pts, 0.0012, metal, { radial: 3, seg: pts.length, tension: 0 }));
    };
    spring(P0, P1, 0.028);
    spring(P1, P2, -0.028);
    // cone head
    const tx = -0.45;
    const head = tilted(k, 0, 0.36, 0.18, tx, 0);
    const cone: Array<[number, number]> = [
      [0.075, 0],
      [0.073, 0.016],
      [0.056, 0.085],
      [0.03, 0.128],
      [0.022, 0.15],
      [0, 0.15],
    ];
    head.lathe(cone, body, 0, 0, 0, 28);
    head.ring(0.075, 0.0025, body, 0, 0, 0, 28);
    head.cyl(0.007, 0.012, M.plastic('#1f1f20'), 0, 0.148, 0, 0.006, 8);
    const gh = tilted(g, 0, 0.36, 0.18, tx, 0);
    noShadow(gh.lathe(cone.slice(0, 4).map(([r, y]) => [r - 0.003, y + 0.002] as [number, number]), M.glow('#fff1dc', 0.6, '#ffffff', THREE.BackSide), 0, 0, 0, 28));
    bulb(gh, 0, 0.04, 0, 0.026, '#fff1dc');
    cord(k, [
      [0, 0.012, bz - 0.095],
      [0, 0.005, bz - 0.115],
    ]);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.circle(ctx, 0, -0.16, 0.1, tint(c.body, 0.55));
      D.line(ctx, 0, -0.16, 0, 0.12, INK_SOFT, 0.012);
      lampSym(ctx, 0.075, tint(c.body, 0.4), false, 0, 0.18);
    }),
};

const candleLamp: FurnitureDef = {
  id: 'lamp-candlestick',
  name: 'מנורת פמוט עם אהיל קטן',
  category: 'lighting',
  group: 'מנורות שולחן',
  tags: ['פמוט', 'נר', 'פליז', 'קלאסי', 'אהיל'],
  size: { w: 0.18, d: 0.18, h: 0.52 },
  colors: [slot('metal', 'פמוט', '#c9a35a'), slot('shade', 'אהיל', '#2f4a3e')],
  light: { x: 0, y: 0.41, z: 0, color: CANDLE, intensity: 14, distance: 4 },
  actions: LIGHT,
  build: ({ colors: c }) => {
    const k = new Kit();
    const g = k.part('glow');
    const metal = M.metal(c.metal, 0.25, 1);
    k.lathe(
      smoothProfile(
        [
          [0.07, 0],
          [0.072, 0.008],
          [0.06, 0.022],
          [0.026, 0.04],
          [0.02, 0.07],
          [0.03, 0.1],
          [0.018, 0.13],
          [0.015, 0.22],
          [0.026, 0.24],
          [0.04, 0.258],
          [0.042, 0.27],
        ],
        26,
      ).concat([
        [0.03, 0.27],
        [0, 0.27],
      ]),
      metal,
      0,
      0,
      0,
      20,
    );
    k.disc(0.069, 0.002, M.matte('#2d4a36'), 0, 0, 0, 20);
    k.cyl(0.013, 0.1, M.ceramic('#f6f1e6'), 0, 0.27, 0, 0.013, 14);
    k.sphere(0.006, M.ceramic('#f6f1e6'), 0.011, 0.355, 0.004, 1, 2.6, 1, 6);
    flame(g, 0, 0.395, 0, 0.012);
    // clip-on shade
    noShadow(g.geo(openCylGeo(0.085, 0.048, 0.13, 32), M.shade(c.shade), 0, 0.385, 0));
    k.ring(0.085, 0.0025, metal, 0, 0.386, 0, 32);
    k.ring(0.048, 0.0025, metal, 0, 0.514, 0, 24);
    for (const s of [-1, 1]) k.rod([0, 0.42, 0], [s * 0.047, 0.512, 0], 0.0013, metal, 0.0013, 4);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      lampSym(ctx, 0.085, tint(c.shade, 0.45));
      D.circle(ctx, 0, 0, 0.048, null, INK_SOFT, LINE_THIN);
    }),
};

/* ===================================================================== PENDANTS */

const pendantOpal: FurnitureDef = {
  id: 'pendant-opal-globe',
  name: 'מנורת תלייה כדור אופל',
  category: 'lighting',
  group: 'מנורות תלייה',
  tags: ['כדור', 'זכוכית אופל', 'מנורת תלייה', 'מינימליסטי'],
  size: { w: 0.32, d: 0.32, h: 0.95 },
  mount: 'ceiling',
  colors: [slot('metal', 'פרזול', '#c9a35a')],
  light: { x: 0, y: CEILING - 0.8, z: 0, color: WARM, intensity: 70, distance: 8 },
  actions: LIGHT,
  build: ({ colors: c }) => {
    const k = new Kit();
    const g = k.part('glow');
    const metal = M.metal(c.metal, 0.28, 1);
    canopy(k, 0.055, metal);
    const cy = CEILING - 0.95 + 0.155;
    k.cyl(0.0028, CEILING - 0.026 - (cy + 0.19), M.rubber('#1d1d1f'), 0, cy + 0.19, 0, 0.0028, 6);
    k.cyl(0.006, 0.03, metal, 0, CEILING - 0.056, 0, 0.006, 8);
    k.lathe(
      [
        [0.048, 0.132],
        [0.045, 0.142],
        [0.024, 0.15],
        [0.022, 0.19],
        [0.004, 0.19],
      ],
      metal,
      0,
      cy,
      0,
      20,
    );
    noShadow(g.sphere(0.155, M.glow(WARM, 1.0, '#fbf8f1'), 0, cy, 0, 1, 1, 1, 26));
    return k.g;
  },
  draw2d: (ctx) => sym(ctx, () => lampSym(ctx, 0.155, '#fffaf0cc', true)),
};

const pendantCluster: FurnitureDef = {
  id: 'pendant-cluster-globes',
  name: 'אשכול חמש כדורי זכוכית',
  category: 'lighting',
  group: 'מנורות תלייה',
  tags: ['אשכול', 'כדורי זכוכית', 'נורת אדיסון', 'חדר מדרגות', 'מנורת תלייה'],
  size: { w: 0.52, d: 0.52, h: 1.23 },
  mount: 'ceiling',
  colors: [slot('glass', 'זכוכית', '#e9d6b4'), slot('metal', 'פרזול', '#2a2b2e')],
  light: { x: 0, y: CEILING - 0.95, z: 0, color: WARM, intensity: 80, distance: 8.5 },
  actions: LIGHT,
  build: ({ colors: c }) => {
    const k = new Kit();
    const g = k.part('glow');
    const metal = M.metal(c.metal, 0.35, 0.9);
    canopy(k, 0.2, metal, 0.03);
    const glass = M.glass(c.glass, 0.3);
    const drops: Array<[number, number, number, number]> = [
      [0, 0, 1.0, 0.095],
      [0.17, 0.07, 0.72, 0.085],
      [-0.12, 0.16, 0.58, 0.08],
      [-0.15, -0.11, 0.86, 0.09],
      [0.07, -0.18, 0.47, 0.075],
    ];
    for (const [x, z, len, r] of drops) {
      const top = CEILING - len;
      k.cyl(0.0026, len - 0.03, M.rubber('#1d1d1f'), x, top, z, 0.0026, 6);
      k.cyl(0.017, 0.05, metal, x, top - 0.04, z, 0.015, 12);
      const cy = top - 0.04 - r * 0.92;
      noShadow(k.sphere(r, glass, x, cy, z, 1, 1, 1, 14));
      edison(k, g, x, top - 0.035, z, (r / 0.095) * 0.8);
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      ctx.setLineDash([0.04, 0.03]);
      D.circle(ctx, 0, 0, 0.2, null, INK_SOFT, LINE_THIN);
      ctx.setLineDash([]);
      const drops: Array<[number, number, number]> = [
        [0, 0, 0.095],
        [0.17, 0.07, 0.085],
        [-0.12, 0.16, 0.08],
        [-0.15, -0.11, 0.09],
        [0.07, -0.18, 0.075],
      ];
      for (const [x, z, r] of drops) D.circle(ctx, x, z, r, tint(c.glass, 0.4) + 'cc');
    }),
};

const pendantRattan: FurnitureDef = {
  id: 'pendant-rattan',
  name: 'מנורת תלייה ראטן קלוע',
  category: 'lighting',
  group: 'מנורות תלייה',
  tags: ['ראטן', 'קש', 'בוהו', 'טבעי', 'מנורת תלייה', 'קלוע'],
  size: { w: 0.52, d: 0.52, h: 1.0 },
  mount: 'ceiling',
  colors: [slot('rattan', 'ראטן', '#c8a06a')],
  light: { x: 0, y: CEILING - 0.82, z: 0, color: '#ffdcaa', intensity: 65, distance: 8 },
  actions: LIGHT,
  build: ({ colors: c }) => {
    const k = new Kit();
    const g = k.part('glow');
    canopy(k, 0.06, M.paint('#f1efea', 0.5));
    const y0 = CEILING - 1.0 + 0.012;
    const prof = smoothProfile(
      [
        [0.25, 0],
        [0.244, 0.07],
        [0.215, 0.15],
        [0.165, 0.225],
        [0.105, 0.28],
        [0.05, 0.31],
        [0.03, 0.318],
      ],
      14,
    ).concat([[0, 0.318]]);
    k.lathe(prof, M.rattan(c.rattan), 0, y0, 0, 36);
    k.geo(new THREE.TorusGeometry(0.25, 0.011, 6, 40), M.wicker(c.rattan), 0, y0, 0).rotation.x = Math.PI / 2;
    noShadow(g.lathe(innerProfile(prof, 0.008), M.glow('#ffd59a', 0.45, '#ffeccc', THREE.BackSide), 0, y0, 0, 36));
    k.cyl(0.0028, CEILING - 0.026 - (y0 + 0.31), M.rubber('#e9e4da'), 0, y0 + 0.31, 0, 0.0028, 6);
    k.cyl(0.018, 0.045, M.plastic('#efeae0'), 0, y0 + 0.16, 0, 0.018, 12);
    bulb(g, 0, y0 + 0.11, 0, 0.04);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      lampSym(ctx, 0.25, tint(c.rattan, 0.45) + 'cc', true);
      D.circle(ctx, 0, 0, 0.17, null, INK_SOFT, LINE_THIN);
    }),
};

const pendantIndustrial: FurnitureDef = {
  id: 'pendant-industrial-dome',
  name: 'מנורת תלייה תעשייתית כיפה',
  category: 'lighting',
  group: 'מנורות תלייה',
  tags: ['תעשייתי', 'אמייל', 'לופט', 'נורת אדיסון', 'מטבח', 'מנורת תלייה'],
  size: { w: 0.44, d: 0.44, h: 1.0 },
  mount: 'ceiling',
  colors: [slot('shade', 'כיפה', '#2f4a3e'), slot('inner', 'פנים', '#f3f1ec'), slot('metal', 'פרזול', '#c9a35a')],
  light: { x: 0, y: CEILING - 0.85, z: 0, color: WARM, intensity: 75, distance: 8 },
  actions: LIGHT,
  build: ({ colors: c }) => {
    const k = new Kit();
    const g = k.part('glow');
    const metal = M.metal(c.metal, 0.3, 1);
    const enamel = M.ceramic(c.shade);
    canopy(k, 0.06, enamel);
    const y0 = CEILING - 1.0 + 0.004;
    const prof: Array<[number, number]> = [
      [0.214, 0],
      [0.21, 0.018],
      [0.192, 0.058],
      [0.155, 0.11],
      [0.1, 0.155],
      [0.058, 0.178],
      [0.046, 0.19],
      [0.044, 0.235],
      [0.03, 0.245],
      [0, 0.245],
    ];
    k.lathe(prof, enamel, 0, y0, 0, 36);
    k.geo(new THREE.TorusGeometry(0.214, 0.004, 6, 40), enamel, 0, y0, 0).rotation.x = Math.PI / 2;
    noShadow(g.lathe(innerProfile(prof, 0.004), M.glow(WARM, 0.5, c.inner, THREE.BackSide), 0, y0, 0, 36));
    // ribbed socket and braided cord
    for (let i = 0; i < 4; i++) k.cyl(0.02, 0.008, metal, 0, y0 + 0.16 + i * 0.012, 0, 0.02, 14);
    k.cyl(0.017, 0.05, metal, 0, y0 + 0.16, 0, 0.017, 14);
    k.cyl(0.0035, CEILING - 0.026 - (y0 + 0.245), M.linen('#3a3633'), 0, y0 + 0.245, 0, 0.0035, 6);
    edison(k, g, 0, y0 + 0.162, 0, 0.95);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      lampSym(ctx, 0.214, tint(c.shade, 0.45) + 'cc', true);
      D.circle(ctx, 0, 0, 0.046, null, INK_SOFT, LINE_THIN);
    }),
};

const pendantLinear: FurnitureDef = {
  id: 'pendant-linear-dining',
  name: 'גוף תאורה לינארי לפינת אוכל',
  category: 'lighting',
  group: 'מנורות תלייה',
  tags: ['לינארי', 'פינת אוכל', 'אלומיניום', 'לד', 'מודרני', 'מנורת תלייה'],
  size: { w: 1.24, d: 0.1, h: 0.85 },
  mount: 'ceiling',
  colors: [slot('metal', 'גוף', '#2a2b2e')],
  light: { x: 0, y: CEILING - 0.88, z: 0, color: '#fff0d8', intensity: 90, distance: 8.5 },
  actions: LIGHT,
  build: ({ colors: c }) => {
    const k = new Kit();
    const g = k.part('glow');
    const body = M.brushed(c.metal, 0.6);
    const yb = CEILING - 0.85 + 0.008;
    for (const s of [-1, 1]) {
      canopy(k, 0.04, body, 0.02, s * 0.5, 0);
      k.cyl(0.0009, CEILING - 0.02 - (yb + 0.05), M.steel(), s * 0.5, yb + 0.05, 0, 0.0009, 4);
      k.cyl(0.006, 0.03, M.chrome(), s * 0.5, yb + 0.05, 0, 0.0045, 8);
    }
    // power cable: a soft loop beside the right wire
    cord(k, [
      [0.48, CEILING - 0.02, 0.012],
      [0.47, CEILING - 0.3, 0.02],
      [0.45, CEILING - 0.6, 0.018],
      [0.44, yb + 0.055, 0.012],
    ], '#e8e6e1', 0.002);
    k.rbox(1.2, 0.05, 0.06, 0.006, body, 0, yb, 0);
    for (const s of [-1, 1]) k.box(0.004, 0.048, 0.058, M.matte('#1f1f21'), s * 0.6, yb + 0.001, 0);
    noShadow(g.box(1.18, 0.008, 0.046, M.glow('#fff0d8', 1.6, '#ffffff'), 0, yb - 0.008, 0));
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      ctx.setLineDash([0.04, 0.03]);
      D.rr(ctx, 0, 0, 1.2, 0.06, 0.006, tint(c.metal, 0.6));
      ctx.setLineDash([]);
      D.line(ctx, -0.58, 0, 0.58, 0, INK_SOFT, LINE_THIN);
      for (const s of [-1, 1]) D.circle(ctx, s * 0.5, 0, 0.035, null, INK_SOFT, LINE_THIN);
    }),
};

/* ===================================================================== CHANDELIERS */

const crystal: FurnitureDef = {
  id: 'chandelier-crystal',
  name: 'נברשת קריסטל קלאסית',
  category: 'lighting',
  group: 'נברשות',
  tags: ['קריסטל', 'נברשת', 'קלאסי', 'פליז', 'נרות', 'יוקרה'],
  size: { w: 0.72, d: 0.72, h: 0.95 },
  mount: 'ceiling',
  colors: [slot('metal', 'מתכת', '#c9a35a')],
  light: { x: 0, y: CEILING - 0.62, z: 0, color: CANDLE, intensity: 95, distance: 9 },
  actions: LIGHT,
  build: ({ colors: c }) => {
    const k = new Kit();
    const g = k.part('glow');
    const metal = M.metal(c.metal, 0.22, 1);
    const cryst = M.glass('#f4fbff', 0.42);
    const prism = (x: number, y: number, z: number, r: number, stretch = 2.2) => {
      const m = k.geo(new THREE.OctahedronGeometry(r, 0), cryst, x, y, z);
      m.scale.set(0.8, stretch, 0.8);
      m.castShadow = false;
    };
    canopy(k, 0.07, metal, 0.03);
    // stem with a few turned beads
    k.cyl(0.006, 0.3, metal, 0, CEILING - 0.33, 0, 0.006, 8);
    for (const y of [CEILING - 0.12, CEILING - 0.22]) k.sphere(0.017, metal, 0, y, 0, 1, 1, 1, 12);
    const yBot = CEILING - 0.95;
    k.lathe(
      smoothProfile(
        [
          [0.008, 0.06],
          [0.03, 0.08],
          [0.048, 0.14],
          [0.04, 0.2],
          [0.022, 0.24],
          [0.02, 0.32],
          [0.034, 0.36],
          [0.016, 0.42],
          [0.01, 0.62],
        ],
        18,
      ),
      metal,
      0,
      yBot,
      0,
      16,
    );
    // central bobeche dish carrying the arms
    const yArm = yBot + 0.22;
    k.lathe(
      [
        [0.02, 0],
        [0.07, 0.01],
        [0.095, 0.03],
        [0.1, 0.036],
      ],
      metal,
      0,
      yArm - 0.03,
      0,
      20,
    );
    const N = 6;
    const R = 0.3;
    const yCup = yArm + 0.07;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const at = (r: number, y: number): V3 => [ca * r, y, sa * r];
      k.tube([at(0.04, yArm), at(0.14, yArm - 0.05), at(0.24, yArm - 0.04), at(R, yArm + 0.01), at(R, yCup - 0.008)], 0.0065, metal, { radial: 5, seg: 18 });
      const [x, , z] = at(R, 0);
      k.lathe(
        [
          [0.008, 0],
          [0.03, 0.006],
          [0.04, 0.012],
          [0.04, 0.015],
        ],
        metal,
        x,
        yCup - 0.012,
        z,
        14,
      );
      k.cyl(0.0115, 0.072, M.ceramic('#f8f4ea'), x, yCup, z, 0.0115, 10);
      flame(g, x, yCup + 0.092, z, 0.0105);
      // prisms around each cup
      for (let j = 0; j < 3; j++) {
        const b = a + (j - 1) * 0.9;
        prism(x + Math.cos(b) * 0.034, yCup - 0.045, z + Math.sin(b) * 0.034, 0.011);
      }
      // bead swag to the next arm
      const a2 = ((i + 1) / N) * Math.PI * 2;
      for (let j = 1; j < 8; j++) {
        const t = j / 8;
        const aa = a + (a2 - a) * t;
        const sag = Math.sin(t * Math.PI) * 0.09;
        prism(Math.cos(aa) * (R - 0.01), yCup - 0.03 - sag, Math.sin(aa) * (R - 0.01), 0.006, 1.2);
      }
    }
    // crystal ring under the centre dish and a drop finial
    for (let j = 0; j < 8; j++) {
      const b = (j / 8) * Math.PI * 2;
      prism(Math.cos(b) * 0.085, yArm - 0.075, Math.sin(b) * 0.085, 0.012, 2.6);
    }
    prism(0, yBot + 0.035, 0, 0.022, 1.6);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      ctx.setLineDash([0.04, 0.03]);
      D.circle(ctx, 0, 0, 0.345, '#ffffff99', INK_SOFT, LINE_THIN);
      ctx.setLineDash([]);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        D.line(ctx, 0, 0, Math.cos(a) * 0.3, Math.sin(a) * 0.3, INK_SOFT, LINE_THIN);
        D.circle(ctx, Math.cos(a) * 0.3, Math.sin(a) * 0.3, 0.04, tint(c.metal, 0.4));
      }
      D.circle(ctx, 0, 0, 0.1, tint(c.metal, 0.4));
    }),
};

const sputnik: FurnitureDef = {
  id: 'chandelier-sputnik',
  name: 'נברשת ספוטניק',
  category: 'lighting',
  group: 'נברשות',
  tags: ['ספוטניק', 'אמצע המאה', 'פליז', 'נורות גלוי', 'מודרני', 'נברשת'],
  size: { w: 0.76, d: 0.76, h: 0.94 },
  mount: 'ceiling',
  colors: [slot('metal', 'מתכת', '#c9a35a')],
  light: { x: 0, y: CEILING - 0.55, z: 0, color: WARM, intensity: 100, distance: 9 },
  actions: LIGHT,
  build: ({ colors: c }) => {
    const k = new Kit();
    const g = k.part('glow');
    const metal = M.metal(c.metal, 0.24, 1);
    canopy(k, 0.06, metal, 0.028);
    const hubY = CEILING - 0.555;
    k.cyl(0.008, CEILING - 0.028 - hubY, metal, 0, hubY, 0, 0.008, 10);
    k.sphere(0.055, metal, 0, hubY, 0, 1, 1, 1, 20);
    const N = 22;
    const ga = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < N; i++) {
      const y = 1 - ((i + 0.5) / N) * 2;
      if (y > 0.8) continue;
      const rr = Math.sqrt(1 - y * y);
      const th = ga * i;
      const d = new THREE.Vector3(Math.cos(th) * rr, y, Math.sin(th) * rr);
      const at = (t: number): V3 => [d.x * t, hubY + d.y * t, d.z * t];
      k.rod(at(0.04), at(0.29), 0.0045, metal, 0.0045, 6);
      k.rod(at(0.285), at(0.325), 0.012, metal, 0.011, 10);
      const [x, yy, z] = at(0.356);
      noShadow(g.sphere(0.032, M.glow(WARM, 2.1), x, yy, z, 1, 1, 1, 10));
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      ctx.setLineDash([0.04, 0.03]);
      D.circle(ctx, 0, 0, 0.388, '#ffffff99', INK_SOFT, LINE_THIN);
      ctx.setLineDash([]);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        D.line(ctx, 0, 0, Math.cos(a) * 0.34, Math.sin(a) * 0.34, INK_SOFT, LINE_THIN);
        D.circle(ctx, Math.cos(a) * 0.35, Math.sin(a) * 0.35, 0.03, '#fff3dc');
      }
      D.circle(ctx, 0, 0, 0.055, tint(c.metal, 0.3));
    }),
};

const wagonWheel: FurnitureDef = {
  id: 'chandelier-wagon-wheel',
  name: 'נברשת גלגל עגלה',
  category: 'lighting',
  group: 'נברשות',
  tags: ['גלגל עגלה', 'כפרי', 'עץ', 'שרשרת', 'נרות', 'נברשת'],
  size: { w: 0.92, d: 0.92, h: 0.91 },
  mount: 'ceiling',
  colors: [slot('wood', 'עץ', '#6d4c33'), slot('metal', 'ברזל', '#2a2b2e')],
  light: { x: 0, y: CEILING - 0.72, z: 0, color: CANDLE, intensity: 95, distance: 9 },
  actions: LIGHT,
  build: ({ colors: c }) => {
    const k = new Kit();
    const g = k.part('glow');
    const wood = M.wood(c.wood, 0.7);
    const iron = M.metal(c.metal, 0.55, 0.7);
    const yW = CEILING - 0.88;
    // rim (annulus) with an iron tyre
    const ring = new THREE.Shape();
    ring.absarc(0, 0, 0.44, 0, Math.PI * 2, false);
    const hole = new THREE.Path();
    hole.absarc(0, 0, 0.4, 0, Math.PI * 2, true);
    ring.holes.push(hole);
    k.slab(ring, 0.045, wood, 0, yW, 0, 0, 30);
    k.geo(openCylGeo(0.4435, 0.4435, 0.034, 48), iron, 0, yW + 0.0055, 0);
    // hub and spokes
    k.cyl(0.06, 0.09, wood, 0, yW - 0.02, 0, 0.06, 16);
    k.cyl(0.064, 0.012, iron, 0, yW - 0.022, 0, 0.064, 16);
    k.cyl(0.064, 0.012, iron, 0, yW + 0.058, 0, 0.064, 16);
    const S = 12;
    for (let i = 0; i < S; i++) {
      const a = ((i + 0.5) / S) * Math.PI * 2;
      k.rod([Math.cos(a) * 0.055, yW + 0.022, Math.sin(a) * 0.055], [Math.cos(a) * 0.405, yW + 0.022, Math.sin(a) * 0.405], 0.016, wood, 0.012, 6);
    }
    // candles on the rim
    const C = 8;
    for (let i = 0; i < C; i++) {
      const a = (i / C) * Math.PI * 2;
      const x = Math.cos(a) * 0.42;
      const z = Math.sin(a) * 0.42;
      k.lathe(
        [
          [0.006, 0],
          [0.028, 0.004],
          [0.032, 0.012],
          [0.02, 0.016],
          [0.016, 0.03],
        ],
        iron,
        x,
        yW + 0.045,
        z,
        12,
      );
      k.cyl(0.0125, 0.075, M.ceramic('#f2ead8'), x, yW + 0.075, z, 0.0125, 10);
      flame(g, x, yW + 0.17, z, 0.011);
    }
    // three suspension rods to a ring, then a chain to the canopy
    const yR = CEILING - 0.36;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + Math.PI / C;
      k.rod([Math.cos(a) * 0.42, yW + 0.045, Math.sin(a) * 0.42], [Math.cos(a) * 0.02, yR, Math.sin(a) * 0.02], 0.0035, iron, 0.0035, 5);
    }
    k.ring(0.026, 0.005, iron, 0, yR, 0, 14);
    canopy(k, 0.07, iron, 0.03);
    const linkGeo = new THREE.TorusGeometry(0.014, 0.0032, 4, 8);
    linkGeo.scale(0.75, 1.3, 1);
    const n = 12;
    for (let i = 0; i < n; i++) {
      const y = yR + 0.03 + i * 0.026;
      const m = k.geo(linkGeo, iron, 0, y, 0);
      m.rotation.y = i % 2 ? Math.PI / 2 : 0;
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      ctx.setLineDash([0.04, 0.03]);
      D.circle(ctx, 0, 0, 0.44, tint(c.wood, 0.6) + '99', INK_SOFT, LINE_THIN);
      ctx.setLineDash([]);
      D.circle(ctx, 0, 0, 0.4, null, INK_SOFT, LINE_THIN);
      for (let i = 0; i < 12; i++) {
        const a = ((i + 0.5) / 12) * Math.PI * 2;
        D.line(ctx, Math.cos(a) * 0.06, Math.sin(a) * 0.06, Math.cos(a) * 0.4, Math.sin(a) * 0.4, INK_SOFT, LINE_THIN);
      }
      D.circle(ctx, 0, 0, 0.06, tint(c.wood, 0.4));
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        D.circle(ctx, Math.cos(a) * 0.42, Math.sin(a) * 0.42, 0.016, '#fff3dc', INK_SOFT, LINE_THIN);
      }
    }),
};

/* ===================================================================== WALL SCONCES */

/** Round wall plate facing +Z with its back on z = zBack. */
function wallPlate(k: Kit, r: number, t: number, mat: THREE.Material, y: number, zBack: number, x = 0): void {
  const m = k.cyl(r, t, mat, 0, 0, 0, r * 0.94, 24);
  m.rotation.x = Math.PI / 2;
  m.position.set(x, y, zBack + t / 2);
}

const sconceSwing: FurnitureDef = {
  id: 'sconce-swing-arm',
  name: 'מנורת קיר עם זרוע מתקפלת',
  category: 'lighting',
  group: 'מנורות קיר',
  tags: ['מנורת קיר', 'זרוע', 'ליד המיטה', 'קריאה', 'פליז', 'אהיל'],
  size: { w: 0.28, d: 0.52, h: 0.38 },
  mount: 'wall',
  elevation: 1.2,
  colors: [slot('shade', 'אהיל', '#ece5d6'), slot('metal', 'מתכת', '#c9a35a')],
  light: { x: 0, y: 0.26, z: 0.13, color: WARM, intensity: 28, distance: 5 },
  actions: LIGHT,
  build: ({ colors: c }) => {
    const k = new Kit();
    const g = k.part('glow');
    const metal = M.metal(c.metal, 0.28, 1);
    const zb = -0.26;
    const y = 0.12;
    k.rbox(0.07, 0.2, 0.012, 0.006, metal, 0, 0, zb + 0.006);
    k.cyl(0.012, 0.09, metal, 0, y - 0.045, zb + 0.026, 0.012, 12);
    for (const yy of [y - 0.03, y + 0.02]) k.rod([0, yy, zb + 0.012], [0, yy, zb + 0.026], 0.006, metal, 0.006, 8);
    k.rod([0, y, zb + 0.026], [0, y, -0.06], 0.006, metal, 0.006, 8);
    k.cyl(0.011, 0.03, metal, 0, y - 0.015, -0.055, 0.011, 12);
    k.rod([0, y, -0.055], [0, y, 0.13], 0.006, metal, 0.006, 8);
    k.sphere(0.009, metal, 0, y, 0.13, 1, 1, 1, 10);
    k.rod([0, y, 0.13], [0, 0.2, 0.13], 0.006, metal, 0.006, 8);
    k.cyl(0.018, 0.05, metal, 0, 0.195, 0.13, 0.017, 14);
    // switch knob on the plate
    k.rod([0, 0.035, zb + 0.012], [0, 0.035, zb + 0.03], 0.007, M.plastic('#1f1f20'), 0.007, 10);
    // drum shade
    noShadow(g.geo(openCylGeo(0.125, 0.12, 0.17, 36), M.shade(c.shade), 0, 0.2, 0.13));
    k.ring(0.125, 0.0025, metal, 0, 0.2, 0.13, 36);
    k.ring(0.12, 0.0025, metal, 0, 0.37, 0.13, 36);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.3;
      k.rod([0, 0.27, 0.13], [Math.cos(a) * 0.117, 0.368, 0.13 + Math.sin(a) * 0.117], 0.0018, metal, 0.0018, 4);
    }
    bulb(g, 0, 0.27, 0.13, 0.03);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, -0.254, 0.07, 0.012, 0.004, tint(c.metal, 0.4));
      D.line(ctx, 0, -0.245, 0, 0.13, INK_SOFT, 0.012);
      lampSym(ctx, 0.125, tint(c.shade, 0.3) + 'dd', false, 0, 0.13);
    }),
};

const sconceGlobe: FurnitureDef = {
  id: 'sconce-globe',
  name: 'מנורת קיר כדור אופל',
  category: 'lighting',
  group: 'מנורות קיר',
  tags: ['מנורת קיר', 'כדור', 'זכוכית אופל', 'פליז', 'מסדרון', 'אמבטיה'],
  size: { w: 0.2, d: 0.25, h: 0.34 },
  mount: 'wall',
  elevation: 1.6,
  colors: [slot('metal', 'מתכת', '#c9a35a')],
  light: { x: 0, y: 0.24, z: 0.025, color: WARM, intensity: 26, distance: 5 },
  actions: LIGHT,
  build: ({ colors: c }) => {
    const k = new Kit();
    const g = k.part('glow');
    const metal = M.metal(c.metal, 0.26, 1);
    const zb = -0.125;
    k.rbox(0.075, 0.16, 0.014, 0.006, metal, 0, 0.0, zb + 0.007);
    for (const y of [0.025, 0.135]) k.rod([0, y, zb + 0.012], [0, y, zb + 0.018], 0.005, M.chrome(), 0.005, 8);
    k.tube(
      [
        [0, 0.07, zb + 0.012],
        [0, 0.07, -0.05],
        [0, 0.085, 0.0],
        [0, 0.12, 0.022],
        [0, 0.135, 0.025],
      ],
      0.0075,
      metal,
      { radial: 8, seg: 20 },
    );
    k.lathe(
      [
        [0.008, 0],
        [0.026, 0.004],
        [0.046, 0.016],
        [0.048, 0.024],
      ],
      metal,
      0,
      0.132,
      0.025,
      20,
    );
    noShadow(g.sphere(0.09, M.glow(WARM, 1.0, '#fbf8f1'), 0, 0.24, 0.025, 1, 1, 1, 22));
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, -0.118, 0.075, 0.014, 0.004, tint(c.metal, 0.4));
      D.line(ctx, 0, -0.11, 0, -0.06, INK_SOFT, 0.012);
      lampSym(ctx, 0.09, '#fffaf0dd', false, 0, 0.025);
    }),
};

const sconcePlug: FurnitureDef = {
  id: 'sconce-plug-in',
  name: 'מנורת קיר עם כבל ומתג',
  category: 'lighting',
  group: 'מנורות קיר',
  tags: ['מנורת קיר', 'כבל בד', 'ללא חיווט', 'מתג', 'שכירות', 'שחור'],
  size: { w: 0.22, d: 0.32, h: 1.25 },
  mount: 'wall',
  elevation: 0.35,
  colors: [slot('shade', 'אהיל', '#232427'), slot('metal', 'פרזול', '#c9a35a'), slot('cord', 'כבל', '#c9a77c')],
  light: { x: 0, y: 1.08, z: 0.06, color: WARM, intensity: 26, distance: 5 },
  actions: LIGHT,
  build: ({ colors: c }) => {
    const k = new Kit();
    const g = k.part('glow');
    const body = M.paint(c.shade, 0.4);
    const metal = M.metal(c.metal, 0.28, 1);
    const zb = -0.16;
    const y = 1.165;
    wallPlate(k, 0.05, 0.016, body, y, zb);
    k.cyl(0.012, 0.02, metal, 0, y - 0.01, zb + 0.02, 0.012, 12);
    k.rod([0, y, zb + 0.016], [0, y, -0.002], 0.006, metal, 0.006, 8);
    k.rod([-0.016, y, 0.0], [0.016, y, 0.0], 0.01, metal, 0.01, 12);
    const tx = -0.5;
    const hy = 1.04;
    const hz = 0.07;
    const head = tilted(k, 0, hy, hz, tx, 0);
    const cone: Array<[number, number]> = [
      [0.072, 0],
      [0.07, 0.014],
      [0.058, 0.07],
      [0.032, 0.118],
      [0.02, 0.135],
      [0.016, 0.145],
      [0, 0.145],
    ];
    head.lathe(cone, body, 0, 0, 0, 28);
    head.ring(0.072, 0.0025, metal, 0, 0, 0, 28);
    const gh = tilted(g, 0, hy, hz, tx, 0);
    noShadow(gh.lathe(cone.slice(0, 5).map(([r, yy]) => [r - 0.003, yy + 0.002] as [number, number]), M.glow(WARM, 0.6, '#ffffff', THREE.BackSide), 0, 0, 0, 28));
    bulb(gh, 0, 0.045, 0, 0.026);
    // braided cord down the wall with an inline switch and a plug
    const cz = zb + 0.012;
    cord(k, [
      [0, y - 0.045, zb + 0.008],
      [0.02, 1.0, cz + 0.012],
      [0.06, 0.75, cz + 0.02],
      [0.075, 0.5, cz + 0.018],
      [0.05, 0.3, cz + 0.01],
      [0.02, 0.12, cz],
      [0.02, 0.05, cz - 0.002],
    ], c.cord, 0.0032);
    k.rbox(0.026, 0.07, 0.018, 0.006, M.plastic('#1f1f20'), 0.068, 0.6, cz + 0.02);
    k.rbox(0.032, 0.05, 0.022, 0.006, M.plastic('#f1efea'), 0.02, 0, zb + 0.011);
    for (const yy of [0.35, 0.9]) k.rbox(0.012, 0.012, 0.01, 0.003, M.plastic('#f1efea'), 0.06 - (yy > 0.5 ? 0.02 : -0.0), yy, zb + 0.005);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.circle(ctx, 0, -0.152, 0.05, tint(c.shade, 0.5));
      D.line(ctx, 0, -0.14, 0, 0.0, INK_SOFT, 0.012);
      lampSym(ctx, 0.072, tint(c.shade, 0.5), false, 0, 0.07);
    }),
};

/* ===================================================================== FANS */

const ceilingFan: FurnitureDef = {
  id: 'fan-ceiling-light',
  name: 'מאוורר תקרה עם תאורה',
  category: 'lighting',
  group: 'מאווררים',
  tags: ['מאוורר', 'מאוורר תקרה', 'להבי עץ', 'תאורה', 'קיץ'],
  size: { w: 1.34, d: 1.34, h: 0.46 },
  mount: 'ceiling',
  colors: [slot('blades', 'להבים', '#8a6a4c'), slot('metal', 'גוף', '#2c2d30')],
  light: { x: 0, y: CEILING - 0.4, z: 0, color: '#fff0d8', intensity: 85, distance: 8.5 },
  actions: [{ kind: 'fan' }, { kind: 'light' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const g = k.part('glow');
    const metal = M.metal(c.metal, 0.4, 0.8);
    k.lathe(
      [
        [0.012, 0],
        [0.05, 0.004],
        [0.075, 0.04],
        [0.082, 0.08],
        [0, 0.08],
      ],
      metal,
      0,
      CEILING - 0.08,
      0,
      24,
    );
    k.cyl(0.013, 0.14, metal, 0, CEILING - 0.215, 0, 0.013, 12);
    k.lathe(
      smoothProfile(
        [
          [0.028, 0.12],
          [0.1, 0.11],
          [0.128, 0.08],
          [0.132, 0.045],
          [0.12, 0.012],
          [0.1, 0],
        ].reverse() as Array<[number, number]>,
        14,
      ),
      metal,
      0,
      CEILING - 0.34,
      0,
      32,
    );
    const hubY = CEILING - 0.31;
    const rotor = k.part('rotor', 0, hubY, 0);
    rotor.cyl(0.126, 0.028, metal, 0, -0.03, 0, 0.126, 32);
    const B = 5;
    const wood = M.wood(c.blades, 0.5);
    for (let i = 0; i < B; i++) {
      const a = (i / B) * Math.PI * 2;
      const bk = new Kit();
      bk.beam([0.11, -0.016, 0], [0.23, -0.012, 0], 0.03, 0.006, metal, 0.002);
      bk.box(0.12, 0.012, 0.045, metal, 0.215, -0.022, 0);
      const blade = bk.slab(roundedRectShape(0.5, 0.125, 0.045), 0.008, wood, 0.42, -0.012, 0, 0, 5);
      blade.rotation.x = 0.16;
      bk.g.rotation.y = a;
      rotor.g.add(bk.g);
    }
    // light kit: switch housing, frosted bowl, pull chains
    k.cyl(0.07, 0.05, metal, 0, CEILING - 0.4, 0, 0.1, 24);
    const bowl: Array<[number, number]> = [
      [0, 0],
      [0.05, 0.004],
      [0.085, 0.02],
      [0.105, 0.045],
      [0.11, 0.06],
    ];
    noShadow(g.lathe(bowl, M.glow('#fff0d8', 1.4, '#fbf8f2'), 0, CEILING - 0.46 + 0.006, 0, 28));
    k.sphere(0.008, metal, 0, CEILING - 0.452, 0, 1, 1, 1, 8);
    for (const s of [-1, 1]) {
      k.rod([s * 0.06, CEILING - 0.39, 0.03], [s * 0.06, CEILING - 0.45, 0.03], 0.0011, M.brass(), 0.0011, 4);
      k.sphere(0.005, M.brass(), s * 0.06, CEILING - 0.452, 0.03, 1, 1.5, 1, 6);
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      ctx.setLineDash([0.05, 0.04]);
      D.circle(ctx, 0, 0, 0.66, null, INK_SOFT, LINE_THIN);
      ctx.setLineDash([]);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        ctx.save();
        ctx.rotate(a);
        D.rr(ctx, 0.42, 0, 0.5, 0.125, 0.04, tint(c.blades, 0.45) + 'dd');
        ctx.restore();
      }
      lampSym(ctx, 0.13, tint(c.metal, 0.6));
    }),
};

const pedestalFan: FurnitureDef = {
  id: 'fan-pedestal',
  name: 'מאוורר עמוד',
  category: 'lighting',
  group: 'מאווררים',
  tags: ['מאוורר', 'מאוורר עומד', 'קיץ', 'רשת', 'נייד'],
  size: { w: 0.46, d: 0.42, h: 1.33 },
  colors: [slot('body', 'גוף', '#f1efea'), slot('blades', 'להבים', '#9fc3d6')],
  actions: [{ kind: 'fan' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const body = M.plastic(c.body);
    const wire = M.chrome();
    k.lathe(
      [
        [0, 0],
        [0.2, 0],
        [0.204, 0.01],
        [0.19, 0.034],
        [0.06, 0.05],
        [0, 0.05],
      ],
      body,
      0,
      0,
      0,
      36,
    );
    // controls on the base
    for (let i = 0; i < 3; i++) {
      const b = k.rbox(0.03, 0.012, 0.022, 0.004, M.plastic(i === 0 ? '#d9534f' : '#8b8d8f'), -0.04 + i * 0.04, 0.034, 0.13, 1);
      b.rotation.x = 0.16;
    }
    const pz = -0.04;
    k.cyl(0.02, 0.66, body, 0, 0.05, pz, 0.018, 12);
    k.cyl(0.024, 0.04, body, 0, 0.7, pz, 0.024, 12);
    k.rod([0, 0.72, pz], [0.04, 0.72, pz], 0.009, body, 0.009, 10);
    k.cyl(0.013, 0.32, wire, 0, 0.72, pz, 0.013, 12);
    const hubY = 1.105;
    const hubZ = 0.055;
    // yoke and motor housing
    k.rbox(0.05, 0.07, 0.04, 0.01, body, 0, 1.02, pz, 1);
    const housing = k.lathe(
      [
        [0, 0],
        [0.05, 0.005],
        [0.066, 0.03],
        [0.068, 0.1],
        [0.055, 0.135],
        [0.03, 0.148],
        [0, 0.15],
      ],
      body,
      0,
      0,
      0,
      24,
    );
    housing.rotation.x = Math.PI / 2;
    housing.position.set(0, hubY, -0.195);
    k.rod([0, hubY, -0.05], [0, hubY, hubZ - 0.01], 0.006, wire, 0.006, 8);
    // rear cage (static)
    const torus = (r: number, z: number, t = 0.0022) => noShadow(k.geo(new THREE.TorusGeometry(r, t, 3, 30), wire, 0, hubY, z));
    torus(0.222, 0.045, 0.005);
    torus(0.17, 0.02);
    torus(0.11, -0.003);
    torus(0.055, -0.018);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const pt = (r: number, z: number): V3 => [Math.cos(a) * r, hubY + Math.sin(a) * r, z];
      noShadow(k.rod(pt(0.05, -0.02), pt(0.17, 0.02), 0.0016, wire, 0.0016, 3));
      noShadow(k.rod(pt(0.17, 0.02), pt(0.222, 0.045), 0.0016, wire, 0.0016, 3));
    }
    // rotor: blades + front cage. Part Y axis points forward (+Z) after rotation.x = PI/2
    const p = k.part('rotor', 0, hubY, hubZ);
    p.g.rotation.x = Math.PI / 2;
    p.lathe(
      [
        [0.04, -0.01],
        [0.04, 0.01],
        [0.032, 0.026],
        [0.015, 0.034],
        [0, 0.036],
      ],
      body,
      0,
      0,
      0,
      20,
    );
    const bladeShape = new THREE.Shape();
    bladeShape.moveTo(0.03, -0.035);
    bladeShape.bezierCurveTo(0.09, -0.07, 0.19, -0.06, 0.2, 0.0);
    bladeShape.bezierCurveTo(0.205, 0.05, 0.12, 0.08, 0.03, 0.03);
    bladeShape.closePath();
    const bm = M.plastic(c.blades);
    for (let i = 0; i < 3; i++) {
      const bk = new Kit();
      const bl = bk.slab(bladeShape, 0.003, bm, 0, -0.0015, 0, 0, 12);
      bl.rotation.x = 0.32;
      bk.g.rotation.y = (i / 3) * Math.PI * 2;
      p.g.add(bk.g);
    }
    const fy = 0.045;
    noShadow(p.geo(new THREE.TorusGeometry(0.222, 0.0045, 3, 36), wire, 0, -0.01, 0)).rotation.x = Math.PI / 2;
    for (const [r, y] of [[0.17, 0.03], [0.11, 0.045], [0.06, 0.05]] as Array<[number, number]>) {
      noShadow(p.geo(new THREE.TorusGeometry(r, 0.002, 3, 26), wire, 0, y, 0)).rotation.x = Math.PI / 2;
    }
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const pt = (r: number, y: number): V3 => [Math.cos(a) * r, y, Math.sin(a) * r];
      noShadow(p.rod(pt(0.04, fy + 0.008), pt(0.17, 0.03), 0.0015, wire, 0.0015, 3));
      noShadow(p.rod(pt(0.17, 0.03), pt(0.222, -0.01), 0.0015, wire, 0.0015, 3));
    }
    p.cyl(0.04, 0.008, M.plastic('#c9ccce'), 0, fy + 0.005, 0, 0.04, 20);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.circle(ctx, 0, 0, 0.2, tint(c.body, 0.3));
      D.rr(ctx, 0, -0.12, 0.14, 0.15, 0.06, tint(c.body, 0.1));
      D.rr(ctx, 0, 0.03, 0.45, 0.09, 0.03, tint(c.blades, 0.4) + 'dd');
      D.line(ctx, -0.22, 0.045, 0.22, 0.045, INK_SOFT, LINE_THIN);
    }),
};

/* ===================================================================== DECORATIVE */

const lavaLamp: FurnitureDef = {
  id: 'lamp-lava',
  name: 'מנורת לבה',
  category: 'lighting',
  group: 'תאורה דקורטיבית',
  tags: ['לבה', 'רטרו', 'שנות ה-60', 'מנורת לילה', 'צבעוני', 'חדר נוער'],
  size: { w: 0.16, d: 0.16, h: 0.43 },
  colors: [slot('wax', 'שעווה', '#ff6a3d'), slot('liquid', 'נוזל', '#ffd24a'), slot('metal', 'בסיס', '#c9ccce')],
  light: { x: 0, y: 0.25, z: 0, color: '#ffae6b', intensity: 6, distance: 2.5 },
  actions: LIGHT,
  build: ({ colors: c }) => {
    const k = new Kit();
    const g = k.part('glow');
    const metal = M.metal(c.metal, 0.2, 1);
    k.lathe(
      [
        [0, 0],
        [0.074, 0],
        [0.076, 0.006],
        [0.068, 0.04],
        [0.05, 0.12],
        [0.046, 0.13],
        [0.043, 0.135],
        [0, 0.135],
      ],
      metal,
      0,
      0,
      0,
      28,
    );
    const yb = 0.132;
    const bottle: Array<[number, number]> = [
      [0.04, 0],
      [0.054, 0.05],
      [0.052, 0.12],
      [0.038, 0.2],
      [0.03, 0.228],
    ];
    noShadow(k.lathe(smoothProfile(bottle, 16), M.glass(lighten(c.liquid, 0.3), 0.32), 0, yb, 0, 24));
    noShadow(g.lathe(smoothProfile(bottle.map(([r, y]) => [r - 0.003, y] as [number, number]), 16), M.glow(c.liquid, 0.55, c.liquid, THREE.BackSide), 0, yb, 0, 24));
    const wax = M.glow(c.wax, 1.1, c.wax);
    // pool at the bottom + rising blobs
    noShadow(g.geo(blobGeo(0.034, 1, 4, 0.2), wax, 0, yb + 0.012, 0)).scale.set(1.05, 0.45, 1.05);
    const blobs: Array<[number, number, number, number, number]> = [
      [0.01, 0.07, 0.006, 0.02, 1],
      [-0.012, 0.115, -0.006, 0.016, 2],
      [0.006, 0.16, 0.008, 0.013, 3],
      [-0.004, 0.2, 0, 0.011, 5],
    ];
    for (const [x, y, z, r, s] of blobs) noShadow(g.geo(blobGeo(r, 1, s, 0.22), wax, x, yb + y, z)).scale.set(1, 1.35, 1);
    k.lathe(
      [
        [0.031, 0],
        [0.031, 0.008],
        [0.024, 0.05],
        [0.016, 0.06],
        [0, 0.062],
      ],
      metal,
      0,
      yb + 0.226,
      0,
      24,
    );
    cord(k, [
      [0, 0.01, -0.07],
      [0, 0.004, -0.078],
    ]);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.circle(ctx, 0, 0, 0.075, tint(c.metal, 0.4));
      D.circle(ctx, 0, 0, 0.054, tint(c.wax, 0.35));
      D.circle(ctx, 0, 0, 0.031, tint(c.metal, 0.3), INK_SOFT, LINE_THIN);
    }),
};

const neonSign: FurnitureDef = {
  id: 'lamp-neon-sign',
  name: 'שלט ניאון קיר',
  category: 'lighting',
  group: 'תאורה דקורטיבית',
  tags: ['ניאון', 'שלט', 'לד', 'קיר', 'חדר נוער', 'אווירה'],
  size: { w: 0.64, d: 0.05, h: 0.4 },
  mount: 'wall',
  elevation: 1.45,
  colors: [slot('neon', 'ניאון', '#ff4fa3'), slot('heart', 'לב', '#59d6ff')],
  light: { x: 0, y: 0.24, z: 0.03, color: '#ff8cc6', intensity: 8, distance: 3 },
  actions: LIGHT,
  build: ({ colors: c }) => {
    const k = new Kit();
    const g = k.part('glow');
    const zb = -0.025;
    // clear acrylic backing on standoffs
    noShadow(k.box(0.62, 0.34, 0.006, M.glass('#f4fbff', 0.18), 0, 0.05, zb + 0.017));
    for (const [x, y] of [[-0.29, 0.07], [0.29, 0.07], [-0.29, 0.37], [0.29, 0.37]]) {
      const m = k.cyl(0.008, 0.024, M.chrome(), 0, 0, 0, 0.008, 12);
      m.rotation.x = Math.PI / 2;
      m.position.set(x, y, zb + 0.012);
    }
    const zt = zb + 0.026;
    const neon = M.glow(c.neon, 2.6, lighten(c.neon, 0.65));
    // a hand-written looking line of loops (prolate cycloid with a wavy baseline)
    const pts: V3[] = [];
    const loops = 6;
    const N = 120;
    for (let i = 0; i <= N; i++) {
      const th = (i / N) * loops * Math.PI * 2 + Math.PI * 0.5;
      const a = 0.44 / (loops * Math.PI * 2);
      const b = 0.028 + 0.012 * Math.sin(i * 0.17);
      const x = -0.27 + a * th - b * Math.sin(th);
      const y = 0.25 - b * Math.cos(th) + Math.sin((i / N) * Math.PI * 2) * 0.015;
      pts.push([x, y, zt]);
    }
    noShadow(g.tube(pts, 0.0055, neon, { radial: 5, seg: 180 }));
    // underline swoosh
    const sw: V3[] = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      sw.push([-0.25 + t * 0.4, 0.15 - Math.sin(t * Math.PI) * 0.02 + t * 0.012, zt]);
    }
    noShadow(g.tube(sw, 0.0055, neon, { radial: 5, seg: 40 }));
    // small heart
    const hp: V3[] = [];
    for (let i = 0; i <= 40; i++) {
      const t = (i / 40) * Math.PI * 2;
      const x = 16 * Math.pow(Math.sin(t), 3);
      const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      hp.push([0.235 + x * 0.0032, 0.165 + y * 0.0032, zt]);
    }
    noShadow(g.tube(hp, 0.0055, M.glow(c.heart, 2.6, lighten(c.heart, 0.65)), { radial: 5, seg: 80, closed: true }));
    // clear power lead to a dimmer box at the bottom
    noShadow(k.tube([[0.27, 0.06, zb + 0.016], [0.275, 0.03, zb + 0.006], [0.27, 0.012, zb + 0.006]], 0.0022, M.glass('#ffffff', 0.5), { radial: 4, seg: 10 }));
    k.rbox(0.04, 0.016, 0.014, 0.004, M.plastic('#1f1f20'), 0.27, 0, zb + 0.007);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, -0.012, 0.62, 0.012, 0.003, '#eef6f8', INK_SOFT, LINE_THIN);
      D.line(ctx, -0.28, 0.001, 0.2, 0.001, c.neon, 0.012);
      D.line(ctx, 0.21, 0.001, 0.26, 0.001, c.heart, 0.012);
    }),
};

const fairyLights: FurnitureDef = {
  id: 'lamp-fairy-string',
  name: 'שרשרת נורות פיות לקיר',
  category: 'lighting',
  group: 'תאורה דקורטיבית',
  tags: ['שרשרת אורות', 'נורות פיות', 'קישוט', 'חדר שינה', 'אווירה', 'מנורת לילה'],
  size: { w: 2.0, d: 0.06, h: 0.5 },
  mount: 'wall',
  elevation: 1.65,
  colors: [slot('wire', 'חוט', '#b08d57'), slot('bulbs', 'נורות', '#ffd28a')],
  light: { x: 0, y: 0.25, z: 0.0, color: '#ffd28a', intensity: 8, distance: 3.5 },
  actions: LIGHT,
  build: ({ colors: c }) => {
    const k = new Kit();
    const g = k.part('glow');
    const wireM = M.metal(c.wire, 0.35, 0.9);
    const zb = -0.03;
    const hooks = [-0.96, -0.32, 0.32, 0.96];
    const yH = 0.47;
    for (const x of hooks) {
      k.rod([x, yH + 0.012, zb], [x, yH + 0.012, zb + 0.016], 0.003, M.brass(), 0.003, 6);
      k.tube([[x, yH + 0.012, zb + 0.016], [x, yH - 0.004, zb + 0.022], [x, yH + 0.006, zb + 0.026]], 0.0022, M.brass(), { radial: 4, seg: 8 });
    }
    const sags = [0.3, 0.38, 0.3];
    const bulbM = M.glow(c.bulbs, 2.4, '#fffaf0');
    for (let s = 0; s < 3; s++) {
      const x0 = hooks[s];
      const x1 = hooks[s + 1];
      const pts: V3[] = [];
      for (let i = 0; i <= 16; i++) {
        const t = i / 16;
        pts.push([x0 + (x1 - x0) * t, yH - sags[s] * 4 * t * (1 - t), zb + 0.01 + Math.sin(t * Math.PI) * 0.012]);
      }
      noShadow(k.tube(pts, 0.0012, wireM, { radial: 3, seg: 48 }));
      const n = 9;
      for (let i = 1; i < n; i++) {
        const t = i / n;
        const x = x0 + (x1 - x0) * t;
        const y = yH - sags[s] * 4 * t * (1 - t);
        const z = zb + 0.01 + Math.sin(t * Math.PI) * 0.012;
        noShadow(g.sphere(0.0085, bulbM, x, y - 0.009, z, 1, 1.3, 1, 6));
      }
    }
    // dangling lead to a battery pack
    noShadow(k.tube([[-0.96, yH, zb + 0.012], [-0.975, 0.3, zb + 0.008], [-0.97, 0.07, zb + 0.012]], 0.0013, wireM, { radial: 3, seg: 18 }));
    k.rbox(0.045, 0.075, 0.022, 0.005, M.plastic('#f1efea'), -0.97, 0, zb + 0.012);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.line(ctx, -0.96, -0.01, 0.96, -0.01, INK_SOFT, LINE_THIN);
      for (let i = 0; i < 25; i++) D.circle(ctx, -0.92 + i * 0.0767, -0.008, 0.012, tint(c.bulbs, 0.2), INK_SOFT, 0.004);
    }),
};

const saltLamp: FurnitureDef = {
  id: 'lamp-salt-rock',
  name: 'מנורת מלח הימלאיה',
  category: 'lighting',
  group: 'תאורה דקורטיבית',
  tags: ['מלח', 'סלע', 'טבעי', 'מנורת לילה', 'אווירה', 'כתום'],
  size: { w: 0.2, d: 0.2, h: 0.29 },
  colors: [slot('salt', 'מלח', '#f0a882'), slot('wood', 'בסיס עץ', '#7b5538')],
  light: { x: 0, y: 0.14, z: 0, color: '#ffa36b', intensity: 7, distance: 3 },
  actions: LIGHT,
  build: ({ colors: c }) => {
    const k = new Kit();
    const g = k.part('glow');
    k.rbox(0.17, 0.035, 0.17, 0.008, M.wood(c.wood, 0.55), 0, 0, 0);
    let geo = blobGeo(0.1, 2, 7, 0.3, 2.4).toNonIndexed();
    geo.computeVertexNormals();
    geo.computeBoundingBox();
    const bb = geo.boundingBox as THREE.Box3;
    const sx = 0.175 / (bb.max.x - bb.min.x);
    const sy = 0.25 / (bb.max.y - bb.min.y);
    const sz = 0.16 / (bb.max.z - bb.min.z);
    geo.translate(-(bb.max.x + bb.min.x) / 2, -bb.min.y, -(bb.max.z + bb.min.z) / 2);
    geo.scale(sx, sy, sz);
    geo = geo.clone();
    noShadow(g.geo(geo, M.glow('#ff8f4d', 0.6, c.salt), 0, 0.034, 0));
    cord(k, [
      [0, 0.012, -0.08],
      [0.01, 0.005, -0.098],
    ], '#f1efea');
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 0.17, 0.17, 0.01, tint(c.wood, 0.5));
      D.poly(ctx, [[-0.08, -0.02], [-0.05, -0.07], [0.02, -0.08], [0.08, -0.03], [0.07, 0.05], [0.0, 0.08], [-0.07, 0.05]], true, tint(c.salt, 0.25), INK_SOFT);
    }),
};

export const LIGHTS: FurnitureDef[] = [
  arcLamp,
  tripodLamp,
  torchiere,
  lanternFloor,
  globeFloor,
  readingSwing,
  mushroom,
  ceramicPleated,
  bankers,
  taskLamp,
  candleLamp,
  pendantOpal,
  pendantCluster,
  pendantRattan,
  pendantIndustrial,
  pendantLinear,
  crystal,
  sputnik,
  wagonWheel,
  sconceSwing,
  sconceGlobe,
  sconcePlug,
  ceilingFan,
  pedestalFan,
  lavaLamp,
  neonSign,
  fairyLights,
  saltLamp,
];
