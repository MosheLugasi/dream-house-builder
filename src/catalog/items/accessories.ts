/**
 * Small accessories: serving ware, vases, candles & lanterns, books & desk things, small storage.
 * All stand on the floor origin; users lift them onto tables / shelves with `elevation`.
 */
import * as THREE from 'three';
import type { FurnitureDef } from '../types';
import {
  D,
  INK_SOFT,
  Kit,
  LINE_THIN,
  M,
  PAL,
  artPlaneGeo,
  blobGeo,
  darken,
  ellipseShape,
  extrudeZ,
  lighten,
  noise3,
  rng,
  roundedRectPath,
  roundedRectShape,
  sym,
  tint,
  type Ctx2D,
} from '../kit';
import { slot } from './_parts';
import {
  apple,
  bananas,
  bloom,
  bookColor,
  bookFlat,
  bookUpright,
  bottle,
  candle,
  circleZ,
  cupAndSaucer,
  discZ,
  flutedLatheGeo,
  leaf,
  orange,
  ringZ,
  sLathe,
  sideHandle,
  stem,
  tulip,
  tumbler,
  wineGlass,
} from './_props';

type C = Record<string, string>;
const CAT = 'accessories' as const;
const G_SERVE = 'כלי הגשה';
const G_DECOR = 'קישוטים';
const G_CANDLE = 'נרות ופנסים';
const G_OFFICE = 'ספרים ומשרד';
const G_STORE = 'אחסון קטן';

const GLASS = (): THREE.Material => M.glass('#e8f4f6', 0.24);
const r3 = (v: number): number => Math.round(v * 1000) / 1000;

/** rotate a local point of a sub-kit placed at `o` with Euler `e` */
function rotPt(p: [number, number, number], e: THREE.Euler, o: [number, number, number] = [0, 0, 0]): [number, number, number] {
  const v = new THREE.Vector3(...p).applyEuler(e);
  return [v.x + o[0], v.y + o[1], v.z + o[2]];
}

/* ---------------------------------------------------------------- plan helpers */

const circ = (ctx: Ctx2D, x: number, y: number, r: number, fill: string, lw = LINE_THIN): void => D.circle(ctx, x, y, r, fill, undefined, lw);
const ring2 = (ctx: Ctx2D, x: number, y: number, r: number): void => D.circle(ctx, x, y, r, null, INK_SOFT, 0.006);

/* ================================================================== SERVING */

const fruitBowl: FurnitureDef = {
  id: 'acc-fruit-bowl',
  name: 'קערת פירות',
  category: CAT,
  group: G_SERVE,
  tags: ['פירות', 'תפוחים', 'תפוזים', 'בננות', 'קערה', 'עץ'],
  size: { w: 0.34, d: 0.34, h: 0.135 },
  colors: [slot('bowl', 'קערה', PAL.walnut)],
  actions: [{ kind: 'snack' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    k.lathe(
      [
        [0, 0],
        [0.06, 0],
        [0.066, 0.008],
        [0.112, 0.03],
        [0.152, 0.066],
        [0.168, 0.086],
        [0.16, 0.09],
        [0.143, 0.072],
        [0.1, 0.036],
        [0.055, 0.019],
        [0, 0.017],
      ],
      M.wood(c.bowl, 0.4),
      0,
      0,
      0,
      32,
    );
    const ring: Array<[number, 'a' | 'g' | 'o']> = [
      [0.2, 'a'],
      [1.4, 'o'],
      [2.5, 'a'],
      [3.6, 'g'],
      [4.8, 'o'],
    ];
    for (const [a, t] of ring) {
      const x = Math.cos(a) * 0.078;
      const z = Math.sin(a) * 0.078;
      if (t === 'o') orange(k, x, 0.065, z);
      else apple(k, x, 0.062, z, t === 'a' ? '#b3242b' : '#9cbb3c');
    }
    apple(k, 0.005, 0.085, 0.0, '#c43a2c');
    bananas(k, -0.07, 0.072, 0.045, -0.35);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      circ(ctx, 0, 0, 0.168, tint(c.bowl, 0.4));
      ring2(ctx, 0, 0, 0.143);
      for (const [a, col] of [
        [0.2, '#e79a9a'],
        [1.4, '#f4c08a'],
        [2.5, '#e79a9a'],
        [3.6, '#cfe2a0'],
        [4.8, '#f4c08a'],
      ] as Array<[number, string]>)
        circ(ctx, Math.cos(a) * 0.078, Math.sin(a) * 0.078, 0.036, col);
      D.arc(ctx, 0.02, 0.0, 0.09, 2.6, 4.2, '#c8a83a', 0.03);
    }),
};

/** Classic coffee pot (ceramic) with spout to +X and handle to -X. (x, y, z) = bottom centre. */
function coffeePot(k: Kit, x: number, y: number, z: number, mat: THREE.Material): number {
  sLathe(
    k,
    [
      [0, 0],
      [0.044, 0],
      [0.05, 0.008],
      [0.057, 0.05],
      [0.054, 0.11],
      [0.045, 0.15],
      [0.043, 0.158],
      [0.046, 0.162],
      [0, 0.163],
    ],
    mat,
    x,
    y,
    z,
    18,
    14,
  );
  k.sphere(0.012, mat, x, y + 0.172, z, 1, 0.8, 1, 10);
  k.tube(
    [
      [x + 0.05, y + 0.05, z],
      [x + 0.07, y + 0.09, z],
      [x + 0.08, y + 0.13, z],
      [x + 0.092, y + 0.148, z],
    ],
    0.008,
    mat,
    { seg: 10, radial: 8 },
  );
  k.tube(
    [
      [x - 0.045, y + 0.135, z],
      [x - 0.08, y + 0.125, z],
      [x - 0.085, y + 0.085, z],
      [x - 0.055, y + 0.045, z],
    ],
    0.0065,
    mat,
    { seg: 12, radial: 6 },
  );
  return y + 0.18;
}

/** Tray with a raised rim and two handles. (w, d) outer size; returns the floor height of the tray. */
function tray(k: Kit, w: number, d: number, mat: THREE.Material, handles: THREE.Material | null, rimH = 0.028, r = 0.03): number {
  const t = 0.012;
  k.slab(roundedRectShape(w - 0.006, d - 0.006, r), t, mat, 0, 0, 0, 0.003, 6);
  const rim = roundedRectShape(w, d, r);
  rim.holes.push(roundedRectPath(new THREE.Path(), w - 0.016, d - 0.016, r - 0.008));
  k.slab(rim, rimH, mat, 0, 0, 0, 0, 6);
  if (handles) {
    for (const s of [-1, 1]) {
      k.tube(
        [
          [s * (w / 2 - 0.004), rimH * 0.75, -0.05],
          [s * (w / 2 - 0.0), rimH + 0.012, -0.03],
          [s * (w / 2 - 0.0), rimH + 0.012, 0.03],
          [s * (w / 2 - 0.004), rimH * 0.75, 0.05],
        ],
        0.004,
        handles,
        { seg: 12, radial: 6 },
      );
    }
  }
  return t;
}

const coffeeTray: FurnitureDef = {
  id: 'acc-coffee-tray',
  name: 'מגש קפה עם קנקן וספלים',
  category: CAT,
  group: G_SERVE,
  tags: ['קפה', 'מגש', 'ספלים', 'קנקן', 'אירוח'],
  size: { w: 0.46, d: 0.32, h: 0.19 },
  colors: [slot('tray', 'מגש', PAL.oak), slot('china', 'כלי חרסינה', '#f4f1ea')],
  actions: [{ kind: 'snack' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const fy = tray(k, 0.44, 0.3, M.wood(c.tray, 0.45), M.brass());
    const china = M.ceramic(c.china);
    coffeePot(k, -0.11, fy, -0.03, china);
    cupAndSaucer(k, 0.05, fy, 0.06, china, '#3b2418', 0.4);
    cupAndSaucer(k, 0.135, fy, -0.055, china, '#3b2418', -0.5);
    // sugar bowl with lid
    sLathe(
      k,
      [
        [0, 0],
        [0.024, 0],
        [0.034, 0.025],
        [0.03, 0.045],
        [0.012, 0.05],
        [0.006, 0.058],
        [0, 0.06],
      ],
      china,
      -0.02,
      fy,
      -0.08,
      16,
      10,
    );
    // biscuits on a little plate
    k.lathe(
      [
        [0, 0],
        [0.03, 0],
        [0.05, 0.008],
        [0.046, 0.009],
        [0, 0.006],
      ],
      china,
      -0.06,
      fy,
      0.085,
      18,
    );
    const bis = M.matte('#c99859');
    for (const [dx, dz, a] of [
      [-0.012, 0.006, 0.2],
      [0.014, -0.004, -0.1],
      [0.0, 0.0, 0.0],
    ])
      k.cyl(0.018, 0.006, bis, -0.06 + dx, fy + 0.007 + (a === 0 ? 0.006 : 0), 0.085 + dz, 0.018, 14);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 0.44, 0.3, 0.03, tint(c.tray, 0.4));
      D.rr(ctx, 0, 0, 0.42, 0.28, 0.022, null, INK_SOFT, 0.006);
      circ(ctx, -0.11, -0.03, 0.057, '#ffffff');
      for (const [x, y] of [
        [0.05, 0.06],
        [0.135, -0.055],
      ]) {
        circ(ctx, x, y, 0.066, '#ffffff');
        circ(ctx, x, y, 0.038, '#8a6a52');
      }
      circ(ctx, -0.06, 0.085, 0.05, '#ffffff');
    }),
};

const wineSet: FurnitureDef = {
  id: 'acc-wine-set',
  name: 'בקבוק יין וכוסות',
  category: CAT,
  group: G_SERVE,
  tags: ['יין', 'כוסות', 'בקבוק', 'אירוח', 'שתייה'],
  size: { w: 0.3, d: 0.17, h: 0.32 },
  colors: [slot('wine', 'יין', '#5c0f1e'), slot('label', 'תווית', '#efe6d2')],
  actions: [{ kind: 'snack' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    bottle(k, -0.095, 0, -0.03, '#1e2b20', c.label, '#6b1420', 0.315, 0.037);
    wineGlass(k, 0.015, 0, 0.035, c.wine);
    wineGlass(k, 0.1, 0, -0.035, c.wine);
    // cork lying on the table
    const cork = k.cyl(0.011, 0.045, M.matte('#c9a273'), 0, 0, 0, 0.011, 10);
    cork.rotation.z = Math.PI / 2;
    cork.position.set(-0.04, 0.011, 0.06);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      circ(ctx, -0.095, -0.03, 0.037, '#3e5a44');
      circ(ctx, -0.095, -0.03, 0.015, tint(c.label, 0.2));
      for (const [x, y] of [
        [0.015, 0.035],
        [0.1, -0.035],
      ]) {
        circ(ctx, x, y, 0.042, '#eef6f8');
        circ(ctx, x, y, 0.03, tint(c.wine, 0.3));
      }
    }),
};

/** Round-bellied teapot, spout to +X. */
function teapot(k: Kit, x: number, y: number, z: number, mat: THREE.Material, s = 1): void {
  sLathe(
    k,
    [
      [0, 0],
      [0.045 * s, 0],
      [0.05 * s, 0.006 * s],
      [0.072 * s, 0.035 * s],
      [0.074 * s, 0.06 * s],
      [0.062 * s, 0.09 * s],
      [0.04 * s, 0.105 * s],
      [0.036 * s, 0.11 * s],
      [0, 0.11 * s],
    ],
    mat,
    x,
    y,
    z,
    18,
    14,
  );
  sLathe(
    k,
    [
      [0, 0],
      [0.038 * s, 0],
      [0.03 * s, 0.012 * s],
      [0.008 * s, 0.018 * s],
      [0.011 * s, 0.026 * s],
      [0, 0.03 * s],
    ],
    mat,
    x,
    y + 0.106 * s,
    z,
    14,
    8,
  );
  k.tube(
    [
      [x + 0.06 * s, y + 0.035 * s, z],
      [x + 0.09 * s, y + 0.06 * s, z],
      [x + 0.105 * s, y + 0.09 * s, z],
      [x + 0.118 * s, y + 0.102 * s, z],
    ],
    0.009 * s,
    mat,
    { seg: 10, radial: 8 },
  );
  k.tube(
    [
      [x - 0.055 * s, y + 0.09 * s, z],
      [x - 0.098 * s, y + 0.085 * s, z],
      [x - 0.1 * s, y + 0.045 * s, z],
      [x - 0.066 * s, y + 0.028 * s, z],
    ],
    0.007 * s,
    mat,
    { seg: 12, radial: 6 },
  );
}

const teaSet: FurnitureDef = {
  id: 'acc-tea-set',
  name: 'סט תה – קומקום וספלים',
  category: CAT,
  group: G_SERVE,
  tags: ['תה', 'קומקום', 'ספלים', 'חרסינה', 'אירוח'],
  size: { w: 0.42, d: 0.26, h: 0.15 },
  colors: [slot('china', 'חרסינה', '#dfe7ea'), slot('tray', 'מגש', PAL.brass)],
  actions: [{ kind: 'snack' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const china = M.ceramic(c.china);
    const fy = tray(k, 0.42, 0.26, M.metal(c.tray, 0.28, 1), null, 0.02, 0.1);
    teapot(k, -0.075, fy, -0.01, china);
    cupAndSaucer(k, 0.11, fy, 0.05, china, '#9a5a1e', 0.6, 0.9);
    cupAndSaucer(k, 0.12, fy, -0.06, china, '#9a5a1e', -0.6, 0.9);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 0.42, 0.26, 0.1, tint(c.tray, 0.45));
      circ(ctx, -0.075, -0.01, 0.074, tint(c.china, 0.3));
      D.line(ctx, -0.015, -0.01, 0.045, -0.01, INK_SOFT, 0.016);
      for (const [x, y] of [
        [0.11, 0.05],
        [0.12, -0.06],
      ]) {
        circ(ctx, x, y, 0.06, '#ffffff');
        circ(ctx, x, y, 0.03, '#c79a6a');
      }
    }),
};

const cakeStand: FurnitureDef = {
  id: 'acc-cake-stand',
  name: 'עוגה על מעמד עם פעמון זכוכית',
  category: CAT,
  group: G_SERVE,
  tags: ['עוגה', 'מעמד', 'קינוח', 'זכוכית', 'פירות יער'],
  size: { w: 0.34, d: 0.34, h: 0.35 },
  colors: [slot('stand', 'מעמד', '#f4f1ea'), slot('cake', 'ציפוי', '#f6efe3'), slot('berries', 'פירות', '#a3162d')],
  actions: [{ kind: 'snack' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const cer = M.ceramic(c.stand);
    sLathe(
      k,
      [
        [0, 0],
        [0.07, 0],
        [0.072, 0.006],
        [0.03, 0.02],
        [0.018, 0.06],
        [0.02, 0.085],
        [0.035, 0.095],
        [0.15, 0.1],
        [0.156, 0.108],
        [0, 0.106],
      ],
      cer,
      0,
      0,
      0,
      24,
      18,
    );
    const y0 = 0.106;
    const sponge = M.matte('#e2be82');
    const cream = M.paint(c.cake, 0.7);
    k.cyl(0.1, 0.03, sponge, 0, y0, 0, 0.1, 24);
    k.cyl(0.1, 0.008, cream, 0, y0 + 0.03, 0, 0.1, 24);
    k.cyl(0.1, 0.03, sponge, 0, y0 + 0.038, 0, 0.1, 24);
    k.rbox(0.204, 0.014, 0.204, 0.006, cream, 0, y0 + 0.064, 0, 2).scale.set(1, 1, 1);
    // drips of icing over the edge
    const r = rng(9);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + r() * 0.2;
      const len = 0.012 + r() * 0.022;
      k.sphere(0.006, cream, Math.cos(a) * 0.1, y0 + 0.07 - len / 2, Math.sin(a) * 0.1, 1, (len / 0.012) * 1.1, 0.8, 6);
    }
    // berries + mint on top
    const ber = M.paint(c.berries, 0.3);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const rr = i % 2 ? 0.065 : 0.04;
      k.sphere(0.011, ber, Math.cos(a) * rr, y0 + 0.086, Math.sin(a) * rr, 1, 0.95, 1, 10);
    }
    k.sphere(0.014, M.paint('#2c2a5a', 0.3), 0, y0 + 0.088, 0, 1, 1, 1, 10);
    for (const a of [0.4, 2.4, 4.4]) leaf(k, 0.022, 0.012, M.leaf('#4f8a3c'), Math.cos(a) * 0.02, y0 + 0.088, Math.sin(a) * 0.02, 0.3, a);
    // glass dome
    sLathe(
      k,
      [
        [0.138, 0],
        [0.138, 0.11],
        [0.118, 0.18],
        [0.07, 0.218],
        [0, 0.226],
      ],
      GLASS(),
      0,
      y0 - 0.002,
      0,
      28,
      12,
    );
    k.sphere(0.014, GLASS(), 0, y0 + 0.232, 0, 1, 0.9, 1, 12);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      circ(ctx, 0, 0, 0.156, tint(c.stand, 0.3));
      circ(ctx, 0, 0, 0.1, tint(c.cake, 0.1));
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const rr = i % 2 ? 0.065 : 0.04;
        D.circle(ctx, Math.cos(a) * rr, Math.sin(a) * rr, 0.011, tint(c.berries, 0.2), null);
      }
      D.circle(ctx, 0, 0, 0.138, null, '#8fb9c9', 0.008);
    }),
};

const oilSet: FurnitureDef = {
  id: 'acc-oil-set',
  name: 'שמן זית, חומץ ומטחנות',
  category: CAT,
  group: G_SERVE,
  tags: ['שמן זית', 'חומץ', 'מלח', 'פלפל', 'מטחנה', 'מטבח'],
  size: { w: 0.26, d: 0.11, h: 0.3 },
  colors: [slot('board', 'קרש', PAL.oak)],
  build: ({ colors: c }) => {
    const k = new Kit();
    const wood = M.wood(c.board, 0.5);
    k.rbox(0.26, 0.016, 0.11, 0.005, wood, 0, 0, 0, 2);
    const y = 0.016;
    // oil bottle: clear glass, golden-green oil, steel pourer
    const g = GLASS();
    sLathe(
      k,
      [
        [0, 0.003],
        [0.03, 0],
        [0.034, 0.01],
        [0.034, 0.17],
        [0.026, 0.2],
        [0.012, 0.225],
        [0.012, 0.24],
      ],
      g,
      -0.07,
      y,
      0,
      20,
      18,
    );
    k.cyl(0.031, 0.15, M.glass('#9c8f1c', 0.78), -0.07, y + 0.006, 0, 0.031, 20);
    k.cyl(0.013, 0.02, M.matte('#2b2b2b'), -0.07, y + 0.235, 0, 0.011, 12);
    k.rod([-0.07, y + 0.25, 0], [-0.07 + 0.016, y + 0.282, 0], 0.004, M.chrome(), 0.003, 8);
    k.cyl(0.0345, 0.05, M.matte('#e9dfc2'), -0.07, y + 0.07, 0, 0.0345, 20);
    // vinegar
    sLathe(
      k,
      [
        [0, 0.003],
        [0.022, 0],
        [0.025, 0.01],
        [0.025, 0.12],
        [0.016, 0.15],
        [0.009, 0.17],
        [0.009, 0.185],
      ],
      g,
      0.0,
      y,
      0.01,
      18,
      16,
    );
    k.cyl(0.022, 0.1, M.glass('#3a1610', 0.85), 0, y + 0.006, 0.01, 0.022, 18);
    k.cyl(0.01, 0.03, M.matte('#b9a27a'), 0, y + 0.18, 0.01, 0.009, 10);
    // salt & pepper grinders
    for (const [x, col] of [
      [0.06, lighten(c.board, 0.2)],
      [0.1, darken(c.board, 0.45)],
    ] as Array<[number, string]>) {
      sLathe(
        k,
        [
          [0, 0],
          [0.02, 0],
          [0.021, 0.02],
          [0.017, 0.07],
          [0.019, 0.11],
          [0.012, 0.13],
          [0, 0.132],
        ],
        M.wood(col, 0.45),
        x,
        y,
        -0.005,
        16,
        14,
      );
      k.sphere(0.006, M.chrome(), x, y + 0.134, -0.005, 1, 1, 1, 8);
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 0.26, 0.11, 0.01, tint(c.board, 0.4));
      circ(ctx, -0.07, 0, 0.034, '#e4e3b5');
      circ(ctx, 0, 0.01, 0.025, '#c8a49c');
      circ(ctx, 0.06, -0.005, 0.021, tint(c.board, 0.2));
      circ(ctx, 0.1, -0.005, 0.021, tint(darken(c.board, 0.4), 0.2));
    }),
};

const SPICES = ['#b8401f', '#e0a526', '#6f7f3a', '#8a5a33', '#d8c9a8', '#a12424', '#3a2a20', '#c97b3a', '#9aa86a', '#e6dccb'];

const spiceRack: FurnitureDef = {
  id: 'acc-spice-rack',
  name: 'מדף תבלינים עם צנצנות',
  category: CAT,
  group: G_SERVE,
  tags: ['תבלינים', 'צנצנות', 'מדף', 'מטבח', 'עץ'],
  size: { w: 0.32, d: 0.09, h: 0.27 },
  colors: [slot('wood', 'עץ', PAL.oakLight), slot('lids', 'מכסים', '#2b2b2c')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const wood = M.wood(c.wood, 0.55);
    const w = 0.32;
    const d = 0.09;
    for (const s of [-1, 1]) k.rbox(0.012, 0.27, d, 0.003, wood, s * (w / 2 - 0.006), 0, 0, 1);
    k.box(w - 0.024, 0.26, 0.008, wood, 0, 0.005, -d / 2 + 0.004);
    const shelves = [0.0, 0.13];
    for (const sy of shelves) {
      k.box(w - 0.024, 0.012, d - 0.008, wood, 0, sy, 0.004);
      k.rod([-w / 2 + 0.012, sy + 0.055, d / 2 - 0.006], [w / 2 - 0.012, sy + 0.055, d / 2 - 0.006], 0.004, M.wood(darken(c.wood, 0.1)), 0.004, 8);
    }
    const lid = M.metal(c.lids, 0.4, 0.6);
    const g = GLASS();
    let n = 0;
    for (const sy of shelves) {
      for (let i = 0; i < 5; i++) {
        const x = -0.112 + i * 0.056;
        const y = sy + 0.012;
        const z = 0.006;
        k.cyl(0.0225, 0.08, g, x, y, z, 0.0225, 14);
        k.cyl(0.021, 0.05 + ((n * 7) % 3) * 0.008, M.matte(SPICES[n % SPICES.length]), x, y + 0.002, z, 0.021, 14);
        k.cyl(0.0235, 0.016, lid, x, y + 0.08, z, 0.0235, 14);
        k.box(0.03, 0.022, 0.001, M.matte('#f3eee2'), x, y + 0.03, z + 0.0228);
        n++;
      }
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 0.32, 0.09, 0.004, tint(c.wood, 0.4));
      for (let i = 0; i < 5; i++) circ(ctx, -0.112 + i * 0.056, 0.006, 0.0225, tint(c.lids, 0.5));
    }),
};

const lemonade: FurnitureDef = {
  id: 'acc-lemonade',
  name: 'קנקן לימונדה וכוסות',
  category: CAT,
  group: G_SERVE,
  tags: ['לימונדה', 'קנקן', 'כוסות', 'נענע', 'קיץ', 'שתייה'],
  size: { w: 0.3, d: 0.16, h: 0.25 },
  colors: [slot('drink', 'משקה', '#f2dc6b')],
  actions: [{ kind: 'snack' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const g = GLASS();
    const x = -0.05;
    sLathe(
      k,
      [
        [0, 0.004],
        [0.05, 0],
        [0.058, 0.03],
        [0.06, 0.12],
        [0.052, 0.19],
        [0.056, 0.235],
      ],
      g,
      x,
      0,
      0,
      24,
      18,
    );
    sLathe(
      k,
      [
        [0, 0.008],
        [0.05, 0.005],
        [0.056, 0.03],
        [0.057, 0.12],
        [0.053, 0.16],
        [0, 0.16],
      ],
      M.glass(c.drink, 0.55),
      x,
      0,
      0,
      22,
      12,
    );
    // spout pinch + handle
    k.tube(
      [
        [x - 0.055, 0.2, 0],
        [x - 0.085, 0.19, 0],
        [x - 0.088, 0.1, 0],
        [x - 0.057, 0.06, 0],
      ],
      0.007,
      g,
      { seg: 14, radial: 6 },
    );
    // lemon slices + mint floating
    const lem = M.paint('#f3e06a', 0.5);
    for (const [dx, dz, a] of [
      [0.02, 0.01, 0.4],
      [-0.015, -0.02, 1.1],
      [0.0, 0.025, 2.0],
    ]) {
      const s = k.cyl(0.022, 0.005, lem, x + dx, 0.13, dz, 0.022, 14);
      s.rotation.set(a, 0, 0.6);
    }
    for (const a of [0.2, 1.8, 3.6]) leaf(k, 0.03, 0.016, M.leaf('#3f7f3a'), x + 0.01, 0.16, 0, 0.2, a, 0.2);
    tumbler(k, 0.055, 0, 0.035, 0.1, 0.032, c.drink, 0.72);
    tumbler(k, 0.105, 0, -0.04, 0.1, 0.032, c.drink, 0.6);
    // wedge on the rim
    const wdg = k.sphere(0.018, lem, 0.075, 0.1, 0.045, 1, 0.5, 0.35, 10);
    wdg.rotation.z = 0.6;
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      circ(ctx, -0.05, 0, 0.06, tint(c.drink, 0.35));
      D.line(ctx, -0.11, 0, -0.135, 0, INK_SOFT, 0.012);
      circ(ctx, 0.055, 0.035, 0.032, tint(c.drink, 0.4));
      circ(ctx, 0.105, -0.04, 0.032, tint(c.drink, 0.4));
    }),
};

/* ================================================================== DECOR: vases */

const budTrio: FurnitureDef = {
  id: 'acc-vase-bud-trio',
  name: 'שלישיית אגרטלוני פרח',
  category: CAT,
  group: G_DECOR,
  tags: ['אגרטל', 'פרחים', 'קרמיקה', 'סט', 'מדף'],
  size: { w: 0.24, d: 0.1, h: 0.27 },
  colors: [slot('vase', 'זיגוג', '#c9b8a4'), slot('flower', 'פרחים', '#e8c6cf')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const greens = M.leaf('#56783f');
    const shapes: Array<{
      x: number;
      col: string;
      prof: Array<[number, number]>;
    }> = [
      {
        x: -0.078,
        col: c.vase,
        prof: [
          [0, 0],
          [0.03, 0],
          [0.044, 0.04],
          [0.038, 0.075],
          [0.012, 0.1],
          [0.011, 0.12],
          [0.014, 0.125],
          [0.006, 0.124],
          [0, 0.11],
        ],
      },
      {
        x: 0.0,
        col: lighten(c.vase, 0.45),
        prof: [
          [0, 0],
          [0.026, 0],
          [0.03, 0.02],
          [0.028, 0.12],
          [0.012, 0.15],
          [0.01, 0.17],
          [0.013, 0.175],
          [0.006, 0.174],
          [0, 0.16],
        ],
      },
      {
        x: 0.078,
        col: darken(c.vase, 0.35),
        prof: [
          [0, 0],
          [0.02, 0],
          [0.04, 0.03],
          [0.042, 0.05],
          [0.02, 0.075],
          [0.011, 0.1],
          [0.012, 0.135],
          [0.016, 0.14],
          [0.007, 0.139],
          [0, 0.125],
        ],
      },
    ];
    const tips: Array<[number, number, number]> = [
      [-0.098, 0.22, 0.01],
      [0.008, 0.265, -0.01],
      [0.1, 0.2, 0.0],
    ];
    shapes.forEach((s, i) => {
      sLathe(k, s.prof, M.ceramic(s.col), s.x, 0, 0, 20, 20);
      const top = s.prof[s.prof.length - 3][1];
      const tip = tips[i];
      stem(k, [s.x, top - 0.01, 0], tip, greens, 0.0018);
      if (i === 1) tulip(k, tip[0], tip[1] - 0.04, tip[2], c.flower, 0.8);
      else bloom(k, tip[0], tip[1] - 0.012, tip[2], i === 0 ? c.flower : '#f3efe6', 0.016, i);
      leaf(k, 0.045, 0.014, greens, (s.x + tip[0]) / 2, top + 0.03, 0, 0.5, i * 2.1, 0.35);
    });
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      circ(ctx, -0.078, 0, 0.044, tint(c.vase, 0.3));
      circ(ctx, 0, 0, 0.03, tint(lighten(c.vase, 0.45), 0.2));
      circ(ctx, 0.078, 0, 0.042, tint(darken(c.vase, 0.35), 0.3));
      circ(ctx, 0.008, -0.01, 0.014, tint(c.flower, 0.2));
    }),
};

const tallVase: FurnitureDef = {
  id: 'acc-vase-tall-olive',
  name: 'אגרטל קרמיקה גבוה עם ענפי זית',
  category: CAT,
  group: G_DECOR,
  tags: ['אגרטל', 'קרמיקה', 'זית', 'ענפים', 'גבוה'],
  size: { w: 0.36, d: 0.26, h: 0.86 },
  colors: [slot('vase', 'זיגוג', '#2f4a55'), slot('leaves', 'עלים', '#7d8b5a')],
  build: ({ colors: c }) => {
    const k = new Kit();
    sLathe(
      k,
      [
        [0, 0],
        [0.07, 0],
        [0.098, 0.08],
        [0.11, 0.19],
        [0.092, 0.32],
        [0.052, 0.41],
        [0.044, 0.455],
        [0.054, 0.478],
        [0.042, 0.476],
        [0, 0.43],
      ],
      M.ceramic(c.vase),
      0,
      0,
      0,
      32,
      30,
    );
    // a matte unglazed foot ring
    k.cyl(0.071, 0.012, M.clay('#b89a7c'), 0, 0, 0, 0.074, 32);
    const r = rng(5);
    const twig = M.bark('#6a5a48');
    const lf = M.leaf(c.leaves);
    const lfB = M.leaf(lighten(c.leaves, 0.25));
    const branches: Array<[number, number, number]> = [
      [-0.14, 0.8, 0.03],
      [0.12, 0.78, -0.05],
      [0.02, 0.85, 0.07],
    ];
    for (const [tx, ty, tz] of branches) {
      const base: [number, number, number] = [tx * 0.12, 0.44, tz * 0.12];
      const mid: [number, number, number] = [tx * 0.55, 0.64, tz * 0.6];
      k.tube([base, mid, [tx, ty, tz]], 0.0028, twig, { seg: 10, radial: 4 });
      for (let i = 0; i < 12; i++) {
        const t = 0.25 + (i / 12) * 0.75;
        const p =
          t < 0.5
            ? [base[0] + (mid[0] - base[0]) * t * 2, base[1] + (mid[1] - base[1]) * t * 2, base[2] + (mid[2] - base[2]) * t * 2]
            : [mid[0] + (tx - mid[0]) * (t - 0.5) * 2, mid[1] + (ty - mid[1]) * (t - 0.5) * 2, mid[2] + (tz - mid[2]) * (t - 0.5) * 2];
        leaf(k, 0.05 + r() * 0.015, 0.017, i % 2 ? lf : lfB, p[0], p[1], p[2], -0.3 + r() * 0.9, r() * Math.PI * 2, 0.15);
      }
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.foliage(ctx, 0, 0, 0.15, tint(c.leaves, 0.45) + 'cc', 6, 3, INK_SOFT);
      circ(ctx, 0, 0, 0.11, tint(c.vase, 0.4));
      circ(ctx, 0, 0, 0.045, tint(c.vase, 0.1));
    }),
};

const glassVase: FurnitureDef = {
  id: 'acc-vase-glass-bouquet',
  name: 'אגרטל זכוכית עם זר פרחים',
  category: CAT,
  group: G_DECOR,
  tags: ['פרחים', 'זר', 'זכוכית', 'טוליפים', 'ורדים', 'אגרטל'],
  size: { w: 0.3, d: 0.29, h: 0.4 },
  colors: [slot('flowerA', 'פרחים', '#e06a7c'), slot('flowerB', 'פרחים נוספים', '#f6efe1')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const g = GLASS();
    k.lathe(
      [
        [0, 0.012],
        [0.055, 0.0],
        [0.062, 0.006],
        [0.062, 0.22],
        [0.058, 0.22],
        [0.057, 0.014],
        [0, 0.016],
      ],
      g,
      0,
      0,
      0,
      28,
    );
    k.cyl(0.056, 0.13, M.water('#cfe4e6'), 0, 0.016, 0, 0.056, 24);
    const greens = M.leaf('#4f7a3a');
    const r = rng(17);
    const heads: Array<[number, number, number, number]> = [];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + r() * 0.4;
      const rr = i === 0 ? 0 : 0.05 + r() * 0.07;
      heads.push([Math.cos(a) * rr, 0.36 + r() * 0.07 - rr * 0.4, Math.sin(a) * rr * 0.9, i]);
    }
    for (const [x, y, z, i] of heads) {
      stem(k, [x * 0.2, 0.03, z * 0.2], [x, y, z], greens, 0.0024);
      if (i % 3 === 0) tulip(k, x, y - 0.035, z, c.flowerA, 0.95);
      else bloom(k, x, y - 0.012, z, i % 3 === 1 ? c.flowerB : lighten(c.flowerA, 0.35), 0.024 + r() * 0.006, i);
    }
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      leaf(k, 0.1, 0.022, greens, Math.cos(a) * 0.04, 0.23, Math.sin(a) * 0.035, 0.45, -a + Math.PI / 2, 0.45);
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.foliage(ctx, 0, 0, 0.14, '#cfe0bf', 7, 5, INK_SOFT);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        D.circle(ctx, Math.cos(a) * 0.07, Math.sin(a) * 0.065, 0.024, tint(i % 2 ? c.flowerB : c.flowerA, 0.2), INK_SOFT, 0.006);
      }
      D.circle(ctx, 0, 0, 0.026, tint(c.flowerA, 0.2), INK_SOFT, 0.006);
    }),
};

const flutedVase: FurnitureDef = {
  id: 'acc-vase-fluted-pampas',
  name: 'אגרטל מחורץ עם פמפס',
  category: CAT,
  group: G_DECOR,
  tags: ['אגרטל', 'פמפס', 'מחורץ', 'בוהו', 'קרמיקה'],
  size: { w: 0.28, d: 0.2, h: 0.72 },
  colors: [slot('vase', 'אגרטל', '#efe9df'), slot('pampas', 'פמפס', '#e4d3b2')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const prof = [
      [0, 0],
      [0.05, 0],
      [0.072, 0.06],
      [0.082, 0.14],
      [0.066, 0.23],
      [0.05, 0.27],
      [0.054, 0.3],
      [0.046, 0.299],
      [0.042, 0.27],
      [0, 0.262],
    ] as Array<[number, number]>;
    const geo = flutedLatheGeo(prof, 18, 0.07, 54);
    k.geo(geo, M.matte(c.vase), 0, 0, 0);
    const plume = M.fur(c.pampas);
    const stalk = M.matte(darken(c.pampas, 0.25));
    const tips: Array<[number, number, number, number]> = [
      [-0.12, 0.6, 0.03, 1],
      [0.1, 0.66, -0.04, 2],
      [0.02, 0.7, 0.06, 3],
    ];
    for (const [tx, ty, tz, s] of tips) {
      k.tube(
        [
          [0, 0.26, 0],
          [tx * 0.4, 0.42, tz * 0.4],
          [tx * 0.85, ty - 0.12, tz * 0.85],
        ],
        0.0025,
        stalk,
        { seg: 8, radial: 4 },
      );
      const p = k.geo(blobGeo(0.04, 1, s, 0.25, 2.5), plume, tx * 0.92, ty - 0.08, tz * 0.92);
      p.scale.set(0.55, 2, 0.55);
      p.rotation.z = -tx * 1.6;
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      for (const [x, y] of [
        [-0.11, 0.03],
        [0.09, -0.04],
        [0.02, 0.06],
      ])
        D.ellipse(ctx, x, y, 0.045, 0.025, tint(c.pampas, 0.3), INK_SOFT, 0.006, Math.atan2(y, x));
      circ(ctx, 0, 0, 0.082, tint(c.vase, 0.2));
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2;
        D.line(ctx, Math.cos(a) * 0.06, Math.sin(a) * 0.06, Math.cos(a) * 0.08, Math.sin(a) * 0.08, INK_SOFT, 0.004);
      }
    }),
};

/* ================================================================== DECOR: objects */

const sculpture: FurnitureDef = {
  id: 'acc-sculpture-knot',
  name: 'פסל מופשט על בסיס שיש',
  category: CAT,
  group: G_DECOR,
  tags: ['פסל', 'מופשט', 'ברונזה', 'שיש', 'אמנות'],
  size: { w: 0.2, d: 0.14, h: 0.33 },
  colors: [slot('metal', 'פסל', '#8b6a3e'), slot('base', 'בסיס', '#f0ede8')],
  build: ({ colors: c }) => {
    const k = new Kit();
    k.rbox(0.14, 0.05, 0.12, 0.004, M.marble(c.base), 0, 0, 0, 2);
    const g = new THREE.TorusKnotGeometry(0.055, 0.016, 90, 8, 2, 3);
    g.scale(1, 1.25, 1);
    g.computeBoundingBox();
    const bb = g.boundingBox!;
    const m = k.geo(g, M.metal(c.metal, 0.32, 1), 0, 0.05 + 0.012 - bb.min.y, 0);
    m.position.x = -(bb.min.x + bb.max.x) / 2;
    k.cyl(0.01, 0.02, M.metal(c.metal, 0.32, 1), 0, 0.045, 0, 0.01, 10);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 0.14, 0.12, 0.004, tint(c.base, 0.3));
      D.ellipse(ctx, 0, 0, 0.085, 0.035, tint(c.metal, 0.35), INK_SOFT, 0.008);
    }),
};

const cairn: FurnitureDef = {
  id: 'acc-stone-cairn',
  name: 'מגדל אבנים מאוזן',
  category: CAT,
  group: G_DECOR,
  tags: ['אבנים', 'זן', 'טבע', 'פסל', 'ים'],
  size: { w: 0.2, d: 0.16, h: 0.19 },
  colors: [slot('stone', 'אבן', '#a9a49a')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const sizes: Array<[number, number, number, number]> = [
      [0.095, 0.045, 0.075, 0.0],
      [0.08, 0.04, 0.065, 0.3],
      [0.065, 0.036, 0.055, -0.2],
      [0.05, 0.032, 0.044, 0.5],
      [0.038, 0.028, 0.034, 0.1],
      [0.026, 0.024, 0.024, -0.4],
    ];
    let y = 0;
    sizes.forEach(([rx, h, rz, rot], i) => {
      const col = i % 2 ? lighten(c.stone, 0.15) : darken(c.stone, 0.1 * (i % 3));
      const m = k.geo(blobGeo(1, 2, i + 3, 0.08, 1.4), M.stone(col, 0.7), i % 2 ? 0.006 : -0.006, y + h / 2, 0);
      m.scale.set(rx, h / 2, rz);
      m.rotation.y = rot;
      y += h * 0.86;
    });
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.ellipse(ctx, 0, 0, 0.095, 0.075, tint(c.stone, 0.4));
      D.ellipse(ctx, 0.006, 0, 0.05, 0.044, tint(c.stone, 0.25), INK_SOFT, 0.006);
      D.ellipse(ctx, -0.003, 0, 0.026, 0.024, tint(c.stone, 0.1), INK_SOFT, 0.006);
    }),
};

const bust: FurnitureDef = {
  id: 'acc-classic-bust',
  name: 'פסל ראש קלאסי',
  category: CAT,
  group: G_DECOR,
  tags: ['פסל', 'ראש', 'קלאסי', 'גבס', 'יווני'],
  size: { w: 0.24, d: 0.17, h: 0.33 },
  colors: [slot('plaster', 'גבס', '#eeebe4')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const pl = M.stone(c.plaster, 0.75);
    sLathe(
      k,
      [
        [0, 0],
        [0.068, 0],
        [0.068, 0.014],
        [0.058, 0.02],
        [0.036, 0.05],
        [0.04, 0.066],
        [0.05, 0.072],
        [0, 0.072],
      ],
      M.marble('#e9e6e0'),
      0,
      0,
      0,
      28,
      18,
    );
    // chest / shoulders: upper part of an ellipsoid with a flat cut
    const ch = new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.6);
    ch.scale(0.115, 0.115, 0.062);
    const cutY = Math.cos(Math.PI * 0.6) * 0.115;
    k.geo(ch, pl, 0, 0.072 - cutY, 0);
    k.slab(ellipseShape(0.109, 0.058), 0.004, pl, 0, 0.07, 0);
    // neck, head, jaw, nose, ears, hair
    k.cyl(0.03, 0.08, pl, 0, 0.13, 0.004, 0.027, 16);
    k.sphere(0.056, pl, 0, 0.245, 0.006, 0.88, 1.12, 1, 20);
    k.sphere(0.036, pl, 0, 0.207, 0.028, 1, 0.9, 1, 14);
    const nose = k.geo(new THREE.ConeGeometry(0.011, 0.036, 4), pl, 0, 0.24, 0.058);
    nose.rotation.x = 0.28;
    for (const s of [-1, 1]) {
      k.sphere(0.014, pl, s * 0.05, 0.24, -0.002, 0.45, 1, 0.8, 10);
      k.sphere(0.0075, M.stone(darken(c.plaster, 0.06), 0.8), s * 0.021, 0.256, 0.05, 1.3, 0.6, 0.6, 8);
    }
    k.sphere(0.06, M.stone(darken(c.plaster, 0.03), 0.9), 0, 0.262, -0.022, 0.95, 0.92, 0.85, 18);
    // curls over the forehead
    for (let i = 0; i < 6; i++) {
      const a = -0.9 + (i / 5) * 1.8;
      k.sphere(0.013, pl, Math.sin(a) * 0.045, 0.292 - Math.abs(a) * 0.014, Math.cos(a) * 0.034 - 0.002, 1, 0.8, 0.9, 8);
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.ellipse(ctx, 0, 0, 0.115, 0.07, tint(c.plaster, 0.2));
      D.ellipse(ctx, 0, -0.005, 0.055, 0.06, tint(c.plaster, 0.05), INK_SOFT, 0.008);
      D.poly(
        ctx,
        [
          [-0.01, 0.055],
          [0.01, 0.055],
          [0, 0.075],
        ],
        true,
        '#ffffff',
        INK_SOFT,
        0.005,
      );
    }),
};

let globeMatCache: THREE.MeshStandardMaterial | null = null;
function globeMat(): THREE.MeshStandardMaterial {
  if (globeMatCache) return globeMatCache;
  let map: THREE.CanvasTexture | null = null;
  if (typeof document !== 'undefined') {
    const cv = document.createElement('canvas');
    cv.width = 256;
    cv.height = 128;
    const g = cv.getContext('2d');
    if (g) {
      const img = g.createImageData(256, 128);
      for (let y = 0; y < 128; y++) {
        const lat = (y / 127 - 0.5) * Math.PI;
        for (let x = 0; x < 256; x++) {
          const lon = (x / 256) * Math.PI * 2;
          const px = Math.cos(lat) * Math.cos(lon);
          const py = Math.sin(lat);
          const pz = Math.cos(lat) * Math.sin(lon);
          const n = noise3(px * 1.7 + 3, py * 1.7 + 1, pz * 1.7 + 7) * 0.65 + noise3(px * 4 + 11, py * 4, pz * 4 + 5) * 0.35;
          const land = n > 0.55;
          const polar = Math.abs(py) > 0.9;
          let col: [number, number, number];
          if (polar) col = [236, 232, 222];
          else if (land) {
            const t = Math.min(1, (n - 0.55) * 6);
            col = [Math.round(196 - t * 60), Math.round(176 - t * 20), Math.round(118 - t * 30)];
          } else {
            const t = Math.min(1, (0.55 - n) * 4);
            col = [Math.round(120 - t * 40), Math.round(160 - t * 35), Math.round(170 - t * 20)];
          }
          const i = (y * 256 + x) * 4;
          img.data[i] = col[0];
          img.data[i + 1] = col[1];
          img.data[i + 2] = col[2];
          img.data[i + 3] = 255;
        }
      }
      g.putImageData(img, 0, 0);
      // graticule
      g.strokeStyle = 'rgba(60,50,40,0.25)';
      g.lineWidth = 0.6;
      for (let i = 1; i < 6; i++) {
        g.beginPath();
        g.moveTo(0, (i / 6) * 128);
        g.lineTo(256, (i / 6) * 128);
        g.stroke();
      }
      for (let i = 0; i < 12; i++) {
        g.beginPath();
        g.moveTo((i / 12) * 256, 0);
        g.lineTo((i / 12) * 256, 128);
        g.stroke();
      }
      map = new THREE.CanvasTexture(cv);
      map.colorSpace = THREE.SRGBColorSpace;
    }
  }
  globeMatCache = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.35,
    metalness: 0,
    map,
  });
  globeMatCache.name = 'acc-globe';
  return globeMatCache;
}

const globe: FurnitureDef = {
  id: 'acc-desk-globe',
  name: 'גלובוס שולחני',
  category: CAT,
  group: G_DECOR,
  tags: ['גלובוס', 'מפה', 'עולם', 'פליז', 'שולחן עבודה'],
  size: { w: 0.3, d: 0.26, h: 0.37 },
  colors: [slot('base', 'בסיס', PAL.walnut)],
  build: ({ colors: c }) => {
    const k = new Kit();
    const wood = M.wood(c.base, 0.4);
    const brass = M.brass();
    sLathe(
      k,
      [
        [0, 0],
        [0.085, 0],
        [0.088, 0.012],
        [0.07, 0.025],
        [0.03, 0.035],
        [0.016, 0.05],
        [0.012, 0.06],
        [0, 0.06],
      ],
      wood,
      0,
      0,
      0,
      28,
      16,
    );
    const tilt = -0.41;
    const R = 0.128;
    const cy = 0.06 + 0.146 + 0.006;
    k.rod([0, 0.055, 0], [0, cy - 0.143, 0], 0.007, brass);
    const gm = k.sphere(R, globeMat(), 0, cy, 0, 1, 1, 1, 28);
    gm.rotation.z = tilt;
    gm.rotation.y = 0.6;
    const arc = new THREE.TorusGeometry(0.142, 0.0045, 6, 36, Math.PI * 1.25);
    arc.rotateZ(Math.PI / 2 - Math.PI * 0.125);
    const am = k.geo(arc, brass, 0, cy, 0);
    am.rotation.z = tilt;
    for (const s of [-1, 1]) {
      const p = new THREE.Vector3(0, s * 0.14, 0).applyAxisAngle(new THREE.Vector3(0, 0, 1), tilt);
      k.sphere(0.008, brass, p.x, cy + p.y, 0, 1, 1, 1, 8);
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      circ(ctx, 0, 0, 0.088, tint(c.base, 0.4));
      circ(ctx, 0, 0, 0.128, '#cfe0e6');
      D.arc(ctx, 0, 0, 0.09, 0.5, 2.2, '#c8b37a', 0.012);
      D.line(ctx, -0.142, -0.004, 0.142, 0.004, '#b99a55', 0.01);
    }),
};

/** standing photo frame with an easel strut. Bottom-front edge on the floor at (x, 0, z). */
function photoFrame(k: Kit, w: number, h: number, frame: THREE.Material, pic: THREE.Material, x: number, z: number, rotY: number): void {
  const f = new Kit();
  const t = 0.014;
  const b = 0.016;
  f.box(w, b, t, frame, 0, 0, 0);
  f.box(w, b, t, frame, 0, h - b, 0);
  f.box(b, h - 2 * b, t, frame, -w / 2 + b / 2, b, 0);
  f.box(b, h - 2 * b, t, frame, w / 2 - b / 2, b, 0);
  f.box(w - 2 * b, h - 2 * b, 0.002, M.matte('#f6f3ec'), 0, b, -0.002);
  const pw = w - 2 * b - 0.03;
  const ph = h - 2 * b - 0.03;
  f.geo(artPlaneGeo(pw, ph), pic, 0, b + 0.015, -0.0005);
  f.box(w - 2 * b, h - 2 * b, 0.001, M.glass('#ffffff', 0.08), 0, b, t / 2 - 0.002);
  f.box(w - 0.01, h - 0.01, 0.003, M.matte('#3b3330'), 0, 0.005, -t / 2 - 0.0015);
  // easel strut
  const strut = f.box(0.022, h * 0.62, 0.004, M.matte('#3b3330'), 0, 0, 0);
  strut.rotation.x = 0.38;
  strut.position.set(0, h * 0.31 * Math.cos(0.38), -t / 2 - 0.003 - h * 0.31 * Math.sin(0.38));
  const g = k.sub(f, x, 0.009, z);
  g.rotation.set(-0.16, rotY, 0, 'YXZ');
}

const photoFrames: FurnitureDef = {
  id: 'acc-photo-frames',
  name: 'שלישיית מסגרות תמונה',
  category: CAT,
  group: G_DECOR,
  tags: ['תמונות', 'מסגרות', 'משפחה', 'זיכרונות', 'מזנון'],
  size: { w: 0.46, d: 0.12, h: 0.21 },
  colors: [slot('frame', 'מסגרות', PAL.oak)],
  build: ({ colors: c }) => {
    const k = new Kit();
    photoFrame(k, 0.15, 0.2, M.wood(c.frame, 0.45), M.art('portrait', 3, ['#d9cbb6', '#c9927a', '#5b6f7f', '#3a2c26'], 0.088, 0.138), -0.14, 0.025, 0.18);
    photoFrame(k, 0.2, 0.15, M.metal('#26272a', 0.5, 0.5), M.art('sea', 7, ['#6fa3bf', '#2f5a78', '#efe0bf'], 0.138, 0.088), 0.03, 0.015, -0.05);
    photoFrame(k, 0.11, 0.14, M.brass(), M.art('botanical', 4, ['#f1ebe0', '#5c7a4a', '#9bae8a'], 0.048, 0.078), 0.165, 0.04, -0.35);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const fr = (x: number, y: number, w: number, a: number, col: string) => {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(-a);
        D.rr(ctx, 0, 0, w, 0.016, 0.003, col);
        D.line(ctx, 0, -0.008, 0, -0.06, INK_SOFT, 0.008);
        ctx.restore();
      };
      fr(-0.13, 0.03, 0.15, 0.18, tint(c.frame, 0.2));
      fr(0.03, 0.01, 0.2, -0.05, '#55575c');
      fr(0.165, 0.035, 0.11, -0.35, '#e2cf9d');
    }),
};

const decorBowl: FurnitureDef = {
  id: 'acc-decor-bowl-orbs',
  name: 'קערה דקורטיבית עם כדורים',
  category: CAT,
  group: G_DECOR,
  tags: ['קערה', 'כדורים', 'דקורציה', 'שולחן סלון', 'קרמיקה'],
  size: { w: 0.38, d: 0.38, h: 0.13 },
  colors: [slot('bowl', 'קערה', '#3b3f45')],
  build: ({ colors: c }) => {
    const k = new Kit();
    sLathe(
      k,
      [
        [0, 0],
        [0.06, 0],
        [0.065, 0.01],
        [0.14, 0.04],
        [0.186, 0.072],
        [0.19, 0.078],
        [0.182, 0.078],
        [0.13, 0.046],
        [0.06, 0.022],
        [0, 0.02],
      ],
      M.matte(c.bowl),
      0,
      0,
      0,
      36,
      26,
    );
    k.sphere(0.042, M.wood(PAL.walnut, 0.4), -0.05, 0.062, 0.02, 1, 1, 1, 18);
    k.sphere(0.034, M.brass(), 0.04, 0.054, 0.04, 1, 1, 1, 18);
    k.sphere(0.038, M.marble('#f4f1ec'), 0.015, 0.058, -0.055, 1, 1, 1, 18);
    k.sphere(0.024, M.ceramic('#c7775a'), 0.085, 0.052, -0.02, 1, 1, 1, 14);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      circ(ctx, 0, 0, 0.19, tint(c.bowl, 0.5));
      ring2(ctx, 0, 0, 0.14);
      circ(ctx, -0.05, 0.02, 0.042, tint(PAL.walnut, 0.3));
      circ(ctx, 0.04, 0.04, 0.034, '#e8d39d');
      circ(ctx, 0.015, -0.055, 0.038, '#f8f6f2');
      circ(ctx, 0.085, -0.02, 0.024, tint('#c7775a', 0.3));
    }),
};

const jewelryBox: FurnitureDef = {
  id: 'acc-jewelry-box',
  name: 'קופסת תכשיטים עם מגירה',
  category: CAT,
  group: G_DECOR,
  tags: ['תכשיטים', 'קופסה', 'מגירה', 'עץ', 'שידת איפור'],
  size: { w: 0.24, d: 0.16, h: 0.13 },
  colors: [slot('wood', 'עץ', PAL.walnut), slot('lining', 'ריפוד פנימי', '#7a2f3a')],
  actions: [{ kind: 'open' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const wood = M.wood(c.wood, 0.35);
    const brass = M.brass();
    const w = 0.24;
    const d = 0.16;
    const fy = 0.01;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.sphere(0.008, brass, sx * (w / 2 - 0.02), 0.008, sz * (d / 2 - 0.02), 1, 1, 1, 8);
    // carcass: bottom, sides, back, mid-shelf, upper body
    k.box(w, 0.008, d, wood, 0, fy, 0);
    for (const s of [-1, 1]) k.box(0.01, 0.045, d, wood, s * (w / 2 - 0.005), fy + 0.008, 0);
    k.box(w - 0.02, 0.045, 0.008, wood, 0, fy + 0.008, -d / 2 + 0.004);
    k.rbox(w, 0.05, d, 0.004, wood, 0, fy + 0.053, 0, 1);
    // lid with bevel, brass inlay line and a clasp
    k.rbox(w + 0.004, 0.018, d + 0.004 - 0.004, 0.006, wood, 0, fy + 0.103, -0.002, 2);
    k.box(w - 0.04, 0.0012, d - 0.04, brass, 0, fy + 0.121, -0.002);
    k.box(w - 0.044, 0.0014, d - 0.044, wood, 0, fy + 0.1212, -0.002);
    k.box(0.022, 0.024, 0.004, brass, 0, fy + 0.09, d / 2 - 0.001);
    // drawer (slides out along +Z)
    const dr = k.part('drawer', 0, fy + 0.008, 0, { open: 0.09 });
    const dd = d - 0.02;
    dr.box(w - 0.024, 0.042, 0.012, wood, 0, 0.0015, d / 2 - 0.018);
    for (const s of [-1, 1]) dr.box(0.006, 0.03, dd - 0.012, wood, s * (w / 2 - 0.016), 0.002, d / 2 - 0.024 - (dd - 0.012) / 2);
    dr.box(w - 0.034, 0.03, 0.006, wood, 0, 0.002, d / 2 - 0.012 - dd + 0.003 + 0.0);
    dr.box(w - 0.034, 0.004, dd - 0.012, M.velvet(c.lining), 0, 0.002, d / 2 - 0.024 - (dd - 0.012) / 2);
    for (const [x, z] of [
      [-0.05, 0.02],
      [0.03, -0.02],
    ])
      dr.ring(0.009, 0.0022, brass, x, 0.009, z, 14);
    dr.sphere(0.0035, M.glass('#bfe6ff', 0.8), 0.03, 0.012, 0.009 - 0.02 + 0.009, 1, 1, 1, 8);
    dr.sphere(0.007, brass, 0, 0.023, d / 2 - 0.006, 1, 1, 1, 10);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 0.24, 0.16, 0.008, tint(c.wood, 0.35));
      D.rr(ctx, 0, -0.002, 0.2, 0.12, 0.004, null, '#b99a55', 0.006);
      D.line(ctx, -0.11, 0.075, 0.11, 0.075, INK_SOFT, 0.006);
    }),
};

const perfumeTray: FurnitureDef = {
  id: 'acc-perfume-tray',
  name: 'מגש בשמים ממראה',
  category: CAT,
  group: G_DECOR,
  tags: ['בושם', 'מגש', 'מראה', 'שידת איפור', 'זכוכית'],
  size: { w: 0.3, d: 0.18, h: 0.16 },
  colors: [slot('rim', 'מסגרת', PAL.brass), slot('scent', 'בושם', '#e9b6a8')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const rim = M.metal(c.rim, 0.25, 1);
    const w = 0.3;
    const d = 0.18;
    k.slab(roundedRectShape(w - 0.01, d - 0.01, 0.02), 0.008, M.mirror(), 0, 0, 0);
    const ring = roundedRectShape(w, d, 0.024);
    ring.holes.push(roundedRectPath(new THREE.Path(), w - 0.012, d - 0.012, 0.019));
    k.slab(ring, 0.018, rim, 0, 0, 0);
    const y = 0.008;
    const gl = M.glass('#f3f8f8', 0.3);
    // 1: square faceted flacon with big black cap
    k.rbox(0.062, 0.075, 0.042, 0.006, gl, -0.08, y, -0.02, 1);
    k.rbox(0.054, 0.055, 0.034, 0.005, M.glass(c.scent, 0.7), -0.08, y + 0.006, -0.02, 1);
    k.rbox(0.03, 0.035, 0.03, 0.004, M.lacquer('#151515'), -0.08, y + 0.075, -0.02, 2);
    // 2: round flacon with atomiser bulb
    sLathe(
      k,
      [
        [0, 0],
        [0.03, 0.002],
        [0.04, 0.03],
        [0.03, 0.068],
        [0.008, 0.075],
        [0.007, 0.085],
      ],
      gl,
      0.01,
      y,
      0.025,
      20,
      14,
    );
    sLathe(
      k,
      [
        [0, 0],
        [0.03, 0.004],
        [0.037, 0.03],
        [0.026, 0.055],
        [0, 0.056],
      ],
      M.glass(lighten(c.scent, 0.2), 0.65),
      0.01,
      y + 0.003,
      0.025,
      18,
      10,
    );
    k.cyl(0.009, 0.014, rim, 0.01, y + 0.083, 0.025, 0.007, 12);
    k.tube(
      [
        [0.01, y + 0.096, 0.025],
        [0.03, y + 0.105, 0.03],
        [0.055, y + 0.09, 0.045],
      ],
      0.002,
      M.matte('#7a5a4a'),
      { seg: 8, radial: 4 },
    );
    k.sphere(0.014, M.knit(c.scent), 0.066, y + 0.08, 0.05, 1, 1.25, 1, 10);
    // 3: tall slim cylinder
    k.cyl(0.018, 0.11, gl, 0.1, y, -0.035, 0.018, 18);
    k.cyl(0.015, 0.085, M.glass('#d9c48f', 0.65), 0.1, y + 0.004, -0.035, 0.015, 16);
    k.cyl(0.018, 0.035, rim, 0.1, y + 0.11, -0.035, 0.018, 18);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 0.3, 0.18, 0.024, tint(c.rim, 0.45));
      D.rr(ctx, 0, 0, 0.286, 0.166, 0.019, '#e5eef2', INK_SOFT, 0.006);
      D.rr(ctx, -0.08, -0.02, 0.062, 0.042, 0.006, tint(c.scent, 0.4));
      circ(ctx, 0.01, 0.025, 0.04, tint(c.scent, 0.5));
      circ(ctx, 0.1, -0.035, 0.018, '#efe4c4');
    }),
};

const teddy: FurnitureDef = {
  id: 'acc-teddy-bear',
  name: 'דובי פרווה',
  category: CAT,
  group: G_DECOR,
  tags: ['דובי', 'בובה', 'ילדים', 'פרווה', 'צעצוע'],
  size: { w: 0.24, d: 0.24, h: 0.32 },
  colors: [slot('fur', 'פרווה', '#b08154'), slot('bow', 'פפיון', '#b23a48')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const fur = M.fur(c.fur);
    const pale = M.fur(lighten(c.fur, 0.35));
    const black = M.lacquer('#111111');
    const oz = -0.03;
    k.sphere(0.085, fur, 0, 0.1, oz - 0.01, 1, 1.12, 0.9, 20);
    k.sphere(0.06, pale, 0, 0.095, oz + 0.04, 0.95, 1.1, 0.5, 14);
    // legs sticking forward with paw pads
    for (const s of [-1, 1]) {
      k.sphere(0.036, fur, s * 0.05, 0.036, oz + 0.07, 1, 0.95, 1.7, 14);
      const pad = discZ(k, 0.024, 0.006, pale, s * 0.05, 0.036, oz + 0.123, 16);
      pad.scale.set(1, 1.1, 1);
      // arms
      const arm = k.sphere(0.03, fur, s * 0.088, 0.125, oz + 0.025, 1, 1.9, 1, 12);
      arm.rotation.z = s * 0.35;
      arm.rotation.x = -0.35;
    }
    // head
    const hy = 0.232;
    k.sphere(0.068, fur, 0, hy, oz + 0.005, 1.02, 0.95, 0.96, 20);
    k.sphere(0.03, pale, 0, hy - 0.016, oz + 0.062, 1.15, 0.82, 0.95, 14);
    k.sphere(0.01, black, 0, hy - 0.004, oz + 0.09, 1.3, 0.85, 0.8, 10);
    for (const s of [-1, 1]) {
      k.sphere(0.0075, black, s * 0.027, hy + 0.018, oz + 0.06, 1, 1, 0.7, 10);
      k.sphere(0.026, fur, s * 0.054, hy + 0.052, oz - 0.002, 1, 1, 0.55, 12);
      k.sphere(0.016, pale, s * 0.054, hy + 0.051, oz + 0.008, 1, 1, 0.35, 10);
    }
    // ribbon bow at the neck
    const bow = M.velvet(c.bow);
    k.ring(0.046, 0.006, bow, 0, hy - 0.06, oz + 0.004, 20);
    for (const s of [-1, 1]) {
      const lobe = k.sphere(0.018, bow, s * 0.019, hy - 0.06, oz + 0.052, 1.2, 0.75, 0.45, 10);
      lobe.rotation.z = s * 0.3;
    }
    k.sphere(0.008, bow, 0, hy - 0.06, oz + 0.055, 1, 1, 1, 8);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.ellipse(ctx, 0, -0.04, 0.085, 0.077, tint(c.fur, 0.35));
      for (const s of [-1, 1]) D.ellipse(ctx, s * 0.05, 0.04, 0.036, 0.06, tint(c.fur, 0.3));
      circ(ctx, 0, -0.025, 0.068, tint(c.fur, 0.25));
      circ(ctx, 0, 0.03, 0.028, tint(c.fur, 0.55));
    }),
};

const hourglass: FurnitureDef = {
  id: 'acc-hourglass',
  name: 'שעון חול',
  category: CAT,
  group: G_DECOR,
  tags: ['שעון חול', 'זכוכית', 'עץ', 'וינטג׳'],
  size: { w: 0.12, d: 0.12, h: 0.22 },
  colors: [slot('wood', 'עץ', PAL.walnut), slot('sand', 'חול', '#d9b98a')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const wood = M.wood(c.wood, 0.4);
    const h = 0.22;
    const t = 0.016;
    k.cyl(0.058, t, wood, 0, 0, 0, 0.056, 24);
    k.cyl(0.056, t, wood, 0, h - t, 0, 0.058, 24);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
      sLathe(
        k,
        [
          [0, 0],
          [0.006, 0],
          [0.004, 0.03],
          [0.007, 0.06],
          [0.0045, 0.094],
          [0.007, 0.128],
          [0.004, 0.158],
          [0.006, h - 2 * t],
          [0, h - 2 * t],
        ],
        wood,
        Math.cos(a) * 0.045,
        t,
        Math.sin(a) * 0.045,
        8,
        16,
      );
    }
    const gh = h - 2 * t;
    sLathe(
      k,
      [
        [0.018, 0],
        [0.034, 0.012],
        [0.036, 0.04],
        [0.02, 0.07],
        [0.004, gh / 2],
        [0.02, gh - 0.07],
        [0.036, gh - 0.04],
        [0.034, gh - 0.012],
        [0.018, gh],
      ],
      GLASS(),
      0,
      t,
      0,
      22,
      26,
    );
    const sand = M.matte(c.sand);
    k.lathe(
      [
        [0, 0],
        [0.03, 0.004],
        [0.032, 0.022],
        [0, 0.04],
      ],
      sand,
      0,
      t + 0.006,
      0,
      18,
    );
    k.lathe(
      [
        [0, gh / 2 + 0.006],
        [0.014, gh / 2 + 0.025],
        [0, gh / 2 + 0.03],
      ],
      sand,
      0,
      t,
      0,
      14,
    );
    k.rod([0, t + 0.04, 0], [0, t + gh / 2, 0], 0.0008, sand, 0.0008, 4);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      circ(ctx, 0, 0, 0.058, tint(c.wood, 0.4));
      ring2(ctx, 0, 0, 0.036);
      circ(ctx, 0, 0, 0.012, tint(c.sand, 0.2));
    }),
};

/* ================================================================== CANDLES & LANTERNS */

const pillarCandles: FurnitureDef = (() => {
  const tipY = 0.015 + 0.2 - 0.008 + 0.012;
  return {
    id: 'acc-candles-pillar',
    name: 'שלישיית נרות עמוד על מגש',
    category: CAT,
    group: G_CANDLE,
    tags: ['נרות', 'עמוד', 'מגש', 'שיש', 'רומנטי'],
    size: { w: 0.28, d: 0.28, h: 0.23 },
    colors: [slot('wax', 'שעווה', '#f4ede0'), slot('tray', 'מגש', '#e9e6e0')],
    actions: [
      {
        kind: 'fire',
        at: { x: -0.045, y: r3(tipY), z: -0.04 },
        variant: 'candle',
      },
    ],
    build: ({ colors: c }) => {
      const k = new Kit();
      k.lathe(
        [
          [0, 0],
          [0.13, 0],
          [0.14, 0.01],
          [0.138, 0.015],
          [0, 0.014],
        ],
        M.marble(c.tray),
        0,
        0,
        0,
        36,
      );
      const wax = M.paint(c.wax, 0.6);
      candle(k, 0.042, 0.2, wax, -0.045, 0.014, -0.04);
      candle(k, 0.04, 0.145, wax, 0.06, 0.014, -0.02);
      candle(k, 0.036, 0.095, wax, -0.0, 0.014, 0.07);
      return k.g;
    },
    draw2d: (ctx, c) =>
      sym(ctx, () => {
        circ(ctx, 0, 0, 0.14, tint(c.tray, 0.3));
        for (const [x, y, r] of [
          [-0.045, -0.04, 0.042],
          [0.06, -0.02, 0.04],
          [0, 0.07, 0.036],
        ]) {
          circ(ctx, x, y, r, tint(c.wax, 0.2));
          D.circle(ctx, x, y, 0.004, INK_SOFT, null);
        }
      }),
  };
})();

const brassCandlesticks: FurnitureDef = (() => {
  const H = [0.16, 0.24, 0.2];
  const X = [-0.085, 0, 0.085];
  const ch = 0.2;
  const tip = H[1] + ch - 0.009 * 0.35 + 0.012;
  return {
    id: 'acc-candlesticks-brass',
    name: 'פמוטי פליז עם נרות',
    category: CAT,
    group: G_CANDLE,
    tags: ['פמוטים', 'נרות', 'פליז', 'שבת', 'קלאסי'],
    size: { w: 0.26, d: 0.1, h: 0.45 },
    colors: [slot('wax', 'נרות', '#f6f1e6')],
    actions: [{ kind: 'fire', at: { x: 0, y: r3(tip), z: 0 }, variant: 'candle' }],
    build: ({ colors: c }) => {
      const k = new Kit();
      const brass = M.brass();
      H.forEach((h, i) => {
        sLathe(
          k,
          [
            [0, 0],
            [0.045, 0],
            [0.046, 0.006],
            [0.03, 0.016],
            [0.012, 0.03],
            [0.016, 0.045],
            [0.009, 0.06],
            [0.009, h - 0.06],
            [0.016, h - 0.045],
            [0.01, h - 0.03],
            [0.03, h - 0.018],
            [0.032, h - 0.012],
            [0.014, h - 0.01],
            [0.013, h],
            [0, h],
          ],
          brass,
          X[i],
          0,
          0,
          16,
          22,
        );
        candle(k, 0.0115, ch, M.paint(c.wax, 0.55), X[i], h - 0.012, 0, 0.78);
      });
      return k.g;
    },
    draw2d: (ctx, c) =>
      sym(ctx, () => {
        for (const x of X) {
          circ(ctx, x, 0, 0.045, '#ead9aa');
          circ(ctx, x, 0, 0.012, tint(c.wax, 0.1));
        }
      }),
  };
})();

const candleJar: FurnitureDef = (() => {
  const tip = 0.012 + 0.074 + 0.012;
  return {
    id: 'acc-candle-jar',
    name: 'נר ריחני בצנצנת',
    category: CAT,
    group: G_CANDLE,
    tags: ['נר', 'ריחני', 'צנצנת', 'זכוכית', 'ענבר'],
    size: { w: 0.11, d: 0.11, h: 0.115 },
    colors: [slot('glass', 'זכוכית', '#b06a2a'), slot('wax', 'שעווה', '#efe6d4')],
    actions: [{ kind: 'fire', at: { x: 0, y: r3(tip), z: 0 }, variant: 'candle' }],
    build: ({ colors: c }) => {
      const k = new Kit();
      k.cyl(0.052, 0.012, M.wood(PAL.oak, 0.5), 0, 0, 0, 0.052, 28);
      k.ring(0.04, 0.003, M.rubber('#a68b6a'), 0, 0.006, 0, 20);
      const y = 0.012;
      k.lathe(
        [
          [0, 0.006],
          [0.04, 0],
          [0.046, 0.006],
          [0.046, 0.1],
          [0.043, 0.1],
          [0.043, 0.01],
          [0, 0.008],
        ],
        M.glass(c.glass, 0.55),
        0,
        y,
        0,
        28,
      );
      k.cyl(0.042, 0.066, M.paint(c.wax, 0.6), 0, y + 0.008, 0, 0.042, 24);
      k.rod([0, y + 0.073, 0], [0.001, y + 0.074 + 0.012, 0], 0.0011, M.matte('#1d1a17'), 0.0009, 5);
      // label
      const lab = new THREE.CylinderGeometry(0.0465, 0.0465, 0.04, 20, 1, true, -0.7, 1.4);
      k.geo(lab, M.matte('#f2ede2'), 0, y + 0.045, 0);
      return k.g;
    },
    draw2d: (ctx, c) =>
      sym(ctx, () => {
        circ(ctx, 0, 0, 0.052, tint(PAL.oak, 0.4));
        circ(ctx, 0, 0, 0.046, tint(c.glass, 0.4));
        circ(ctx, 0, 0, 0.04, tint(c.wax, 0.1));
        D.circle(ctx, 0, 0, 0.004, INK_SOFT, null);
      }),
  };
})();

const hurricane: FurnitureDef = (() => {
  const tip = 0.03 + 0.14 - 0.008 + 0.012;
  return {
    id: 'acc-hurricane-lantern',
    name: 'פנס הוריקן עם נר',
    category: CAT,
    group: G_CANDLE,
    tags: ['פנס', 'נר', 'זכוכית', 'מרפסת', 'כפרי'],
    size: { w: 0.22, d: 0.22, h: 0.46 },
    colors: [slot('metal', 'מתכת', '#2b2c2f'), slot('wax', 'נר', '#f4ede0')],
    actions: [{ kind: 'fire', at: { x: 0, y: r3(tip), z: 0 }, variant: 'candle' }],
    build: ({ colors: c }) => {
      const k = new Kit();
      const met = M.metal(c.metal, 0.45, 0.8);
      sLathe(
        k,
        [
          [0, 0],
          [0.1, 0],
          [0.104, 0.008],
          [0.095, 0.022],
          [0.09, 0.03],
          [0, 0.03],
        ],
        met,
        0,
        0,
        0,
        28,
        10,
      );
      k.lathe(
        [
          [0.086, 0],
          [0.086, 0.3],
        ],
        GLASS(),
        0,
        0.03,
        0,
        32,
      );
      k.ring(0.088, 0.004, met, 0, 0.034, 0, 32);
      k.ring(0.088, 0.004, met, 0, 0.328, 0, 32);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        k.rod([Math.cos(a) * 0.094, 0.025, Math.sin(a) * 0.094], [Math.cos(a) * 0.094, 0.335, Math.sin(a) * 0.094], 0.003, met, 0.003, 6);
      }
      sLathe(
        k,
        [
          [0.094, 0],
          [0.098, 0.01],
          [0.07, 0.035],
          [0.025, 0.05],
          [0.02, 0.06],
          [0, 0.062],
        ],
        met,
        0,
        0.33,
        0,
        28,
        12,
      );
      // venting holes as dark dots around the cap
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        k.sphere(0.006, M.matte('#111111'), Math.cos(a) * 0.065, 0.364, Math.sin(a) * 0.065, 1, 0.5, 1, 6);
      }
      const hd = new THREE.TorusGeometry(0.035, 0.003, 6, 20);
      k.geo(hd, met, 0, 0.42, 0);
      candle(k, 0.04, 0.14, M.paint(c.wax, 0.6), 0, 0.03, 0);
      return k.g;
    },
    draw2d: (ctx, c) =>
      sym(ctx, () => {
        circ(ctx, 0, 0, 0.104, tint(c.metal, 0.6));
        circ(ctx, 0, 0, 0.086, '#e6f2f5');
        circ(ctx, 0, 0, 0.04, tint(c.wax, 0.1));
        D.line(ctx, -0.035, 0, 0.035, 0, INK_SOFT, 0.008);
      }),
  };
})();

const moroccanLantern: FurnitureDef = (() => {
  const tip = 0.035 + 0.1 - 0.008 + 0.012;
  return {
    id: 'acc-lantern-moroccan',
    name: 'פנס מרוקאי משושה',
    category: CAT,
    group: G_CANDLE,
    tags: ['פנס', 'מרוקאי', 'פליז', 'זכוכית צבעונית', 'נר', 'מזרחי'],
    size: { w: 0.2, d: 0.18, h: 0.44 },
    colors: [slot('glass', 'זכוכית', '#c4632c'), slot('metal', 'מתכת', '#b38b4a')],
    actions: [{ kind: 'fire', at: { x: 0, y: r3(tip), z: 0 }, variant: 'candle' }],
    build: ({ colors: c }) => {
      const k = new Kit();
      const met = M.metal(c.metal, 0.35, 1);
      const R = 0.088;
      const hex = (r: number, h: number, mat: THREE.Material, y: number, rTop = r, open = false) => {
        const g = new THREE.CylinderGeometry(rTop, r, h, 6, 1, open);
        g.rotateY(Math.PI / 6);
        return k.geo(g, mat, 0, y + h / 2, 0);
      };
      hex(R * 0.85, 0.012, met, 0, R * 0.85);
      hex(R * 0.85, 0.023, met, 0.012, R);
      hex(R, 0.22, M.glass(c.glass, 0.5), 0.035, R, true);
      // frame posts at the corners + horizontal bands
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        k.rod([Math.cos(a) * R, 0.03, Math.sin(a) * R], [Math.cos(a) * R, 0.26, Math.sin(a) * R], 0.0035, met, 0.0035, 6);
      }
      hex(R + 0.002, 0.01, met, 0.1, R + 0.002, true);
      hex(R + 0.002, 0.01, met, 0.19, R + 0.002, true);
      // pierced dome: two cones + finial
      hex(R, 0.012, met, 0.255, R + 0.004);
      hex(R + 0.004, 0.07, met, 0.267, R * 0.35);
      hex(R * 0.35, 0.03, met, 0.337, R * 0.15);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
        k.sphere(0.008, M.glow(c.glass, 0.5, c.glass), Math.cos(a) * R * 0.7, 0.3, Math.sin(a) * R * 0.7, 1, 1.4, 1, 6).castShadow = false;
      }
      k.sphere(0.012, met, 0, 0.375, 0, 1, 1, 1, 10);
      k.geo(new THREE.TorusGeometry(0.024, 0.003, 6, 16), met, 0, 0.408, 0);
      candle(k, 0.035, 0.1, M.paint('#f4ede0', 0.6), 0, 0.035, 0);
      return k.g;
    },
    draw2d: (ctx, c) =>
      sym(ctx, () => {
        const pts: Array<[number, number]> = [];
        for (let i = 0; i < 6; i++) pts.push([Math.cos((i / 6) * Math.PI * 2) * 0.09, Math.sin((i / 6) * Math.PI * 2) * 0.09]);
        D.poly(ctx, pts, true, tint(c.glass, 0.45));
        const p2 = pts.map(([x, y]) => [x * 0.35, y * 0.35] as [number, number]);
        D.poly(ctx, p2, true, tint(c.metal, 0.3), INK_SOFT, 0.006);
        for (const [x, y] of pts) D.line(ctx, x, y, x * 0.35, y * 0.35, INK_SOFT, 0.005);
      }),
  };
})();

/* ================================================================== BOOKS & OFFICE */

const bookStackItem: FurnitureDef = {
  id: 'acc-book-stack',
  name: 'ערימת ספרי אמנות',
  category: CAT,
  group: G_OFFICE,
  tags: ['ספרים', 'ערימה', 'שולחן סלון', 'קריאה', 'אמנות'],
  size: { w: 0.32, d: 0.25, h: 0.17 },
  colors: [slot('top', 'ספר עליון', '#2f3a33')],
  actions: [{ kind: 'read' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const r = rng(31);
    const books: Array<[number, number, number, number]> = [
      [0.3, 0.034, 0.23, 0.02],
      [0.27, 0.028, 0.215, -0.05],
      [0.25, 0.04, 0.2, 0.08],
      [0.22, 0.022, 0.17, -0.12],
    ];
    let y = 0;
    books.forEach(([w, t, d, rot], i) => {
      y = bookFlat(k, w, t, d, i === books.length - 1 ? c.top : bookColor(r), 0, y, 0, rot);
    });
    // a little brass magnifier on top
    k.ring(0.032, 0.004, M.brass(), 0.02, y + 0.004, 0.0, 22);
    k.disc(0.03, 0.002, M.glass('#ffffff', 0.25), 0.02, y + 0.003, 0, 22);
    k.rod([0.052, y + 0.004, 0.0], [0.11, y + 0.004, 0.03], 0.005, M.wood(PAL.darkWood, 0.4), 0.0055, 8);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 0.3, 0.23, 0.004, '#e9e3d6');
      ctx.save();
      ctx.rotate(0.12);
      D.rr(ctx, 0, 0, 0.22, 0.17, 0.004, tint(c.top, 0.4));
      ctx.restore();
      D.circle(ctx, 0.02, 0, 0.032, '#eef5f7', '#b99a55', 0.006);
    }),
};

const bookends: FurnitureDef = {
  id: 'acc-books-bookends',
  name: 'שורת ספרים עם תומכי שיש',
  category: CAT,
  group: G_OFFICE,
  tags: ['ספרים', 'תומכי ספרים', 'שיש', 'מדף', 'קריאה'],
  size: { w: 0.42, d: 0.19, h: 0.27 },
  colors: [slot('ends', 'תומכים', '#f0ede8')],
  actions: [{ kind: 'read' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const mar = M.marble(c.ends);
    for (const s of [-1, 1]) {
      k.rbox(0.07, 0.022, 0.14, 0.004, mar, s * 0.175, 0, 0, 1);
      k.rbox(0.022, 0.16, 0.14, 0.004, mar, s * 0.199, 0.022, 0, 1);
    }
    const r = rng(77);
    let x = -0.186;
    while (x < 0.16) {
      const t = 0.022 + r() * 0.022;
      const h = 0.19 + r() * 0.07;
      const d = 0.15 + r() * 0.035;
      if (x + t > 0.186) break;
      bookUpright(k, t, Math.min(h, 0.268), d, bookColor(r), x + t / 2, 0, 0.19 / 2 - d / 2 - 0.002);
      x += t + 0.001;
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, -0.175, 0, 0.07, 0.14, 0.004, tint(c.ends, 0.2));
      D.rr(ctx, 0.175, 0, 0.07, 0.14, 0.004, tint(c.ends, 0.2));
      D.rr(ctx, 0, 0.005, 0.37, 0.18, 0.002, '#e3d7c6');
      for (let i = -6; i <= 6; i++) D.line(ctx, i * 0.028, -0.085, i * 0.028, 0.095, INK_SOFT, 0.004);
    }),
};

const magazineRack: FurnitureDef = {
  id: 'acc-magazine-rack',
  name: 'מעמד עיתונים מעץ',
  category: CAT,
  group: G_OFFICE,
  tags: ['עיתונים', 'מגזינים', 'מעמד', 'עץ', 'סלון'],
  size: { w: 0.42, d: 0.3, h: 0.46 },
  colors: [slot('wood', 'עץ', PAL.teak)],
  actions: [{ kind: 'read' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const wood = M.wood(c.wood, 0.5);
    const w = 0.42;
    const d = 0.3;
    // end panels with a handle slot cut near the top
    for (const s of [-1, 1]) {
      const sh = roundedRectShape(d, 0.46, 0.04, 0, 0.23);
      sh.holes.push(roundedRectPath(new THREE.Path(), 0.11, 0.032, 0.016, 0, 0.39));
      const g = k.geo(extrudeZ(sh, 0.016, 0.002, 8), wood, s * (w / 2 - 0.008), 0, 0);
      g.rotation.y = Math.PI / 2;
    }
    // bottom + central divider + slats
    k.box(w - 0.032, 0.014, d - 0.04, wood, 0, 0.04, 0);
    k.box(w - 0.032, 0.25, 0.012, wood, 0, 0.054, 0);
    for (const s of [-1, 1]) for (const y of [0.12, 0.22]) k.rbox(w - 0.032, 0.03, 0.012, 0.004, wood, 0, y, s * (d / 2 - 0.016), 1);
    // magazines
    const r = rng(12);
    const pals = [
      ['#e9e2d4', '#c7775a', '#2f3a40'],
      ['#2a3e52', '#d6a544', '#f1ece2'],
      ['#f0e9df', '#9bae8a', '#40524a'],
      ['#c94f4f', '#f3e9da', '#2b2b2b'],
    ];
    for (const s of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const tz = s * (0.03 + i * 0.022);
        const mw = 0.3 + r() * 0.04;
        const mh = 0.29 + r() * 0.03;
        const mg = new Kit();
        mg.box(mw, mh, 0.006, M.matte(['#f4f1ea', '#e6e0d6'][i % 2]), 0, 0, 0);
        mg.geo(
          artPlaneGeo(mw - 0.004, mh - 0.004),
          M.art(i % 2 ? 'geometric' : 'portrait', i * 3 + (s > 0 ? 1 : 2), pals[(i + (s > 0 ? 0 : 2)) % 4], mw - 0.004, mh - 0.004),
          0,
          0.002,
          0.0031 * 1,
        );
        const g = k.sub(mg, (r() - 0.5) * 0.02, 0.054, tz);
        g.rotation.x = s * (0.06 + i * 0.05);
        if (s < 0) g.rotation.y = Math.PI;
      }
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 0.42, 0.3, 0.01, tint(c.wood, 0.5));
      D.rr(ctx, -0.202, 0, 0.016, 0.3, 0.004, tint(c.wood, 0.2));
      D.rr(ctx, 0.202, 0, 0.016, 0.3, 0.004, tint(c.wood, 0.2));
      D.line(ctx, -0.19, 0, 0.19, 0, INK_SOFT, 0.012);
      for (const y of [-0.06, -0.035, 0.035, 0.06]) D.line(ctx, -0.16, y, 0.16, y, INK_SOFT, 0.005);
    }),
};

const deskOrganizer: FurnitureDef = {
  id: 'acc-desk-organizer',
  name: 'מארגן שולחן עבודה',
  category: CAT,
  group: G_OFFICE,
  tags: ['מארגן', 'עטים', 'עפרונות', 'משרד', 'נייר', 'פתקים'],
  size: { w: 0.32, d: 0.16, h: 0.21 },
  colors: [slot('wood', 'עץ', PAL.oakLight)],
  build: ({ colors: c }) => {
    const k = new Kit();
    const wood = M.wood(c.wood, 0.5);
    // base block with a little drawer
    k.rbox(0.32, 0.04, 0.16, 0.004, wood, 0, 0, 0, 1);
    k.box(0.12, 0.024, 0.002, M.matte(darken(c.wood, 0.5)), 0.08, 0.008, 0.0795);
    k.rbox(0.116, 0.02, 0.006, 0.002, wood, 0.08, 0.01, 0.074, 1);
    k.sphere(0.004, M.brass(), 0.08, 0.02, 0.0775, 1, 1, 1, 8);
    const y = 0.04;
    // pen cup
    k.lathe(
      [
        [0, 0],
        [0.035, 0],
        [0.035, 0.1],
        [0.032, 0.1],
        [0.032, 0.006],
        [0, 0.006],
      ],
      M.blackMetal(),
      -0.11,
      y,
      0.0,
      20,
    );
    const r = rng(4);
    const pens = ['#1f3f7a', '#c93a2f', '#1a1a1a', '#e0b33a', '#3c7a3a'];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const bx = -0.11 + Math.cos(a) * 0.014;
      const bz = Math.sin(a) * 0.014;
      const tx = bx + Math.cos(a) * 0.022;
      const tz = bz + Math.sin(a) * 0.022;
      const top = y + 0.14 + r() * 0.02;
      if (i % 2) {
        // pencil: hexagonal yellow with a sharpened tip
        const p = new THREE.CylinderGeometry(0.0038, 0.0038, 0.15, 6);
        const pm = k.geo(p, M.paint('#e7b93a', 0.5), 0, 0, 0);
        const dir = new THREE.Vector3(tx - bx, top - y - 0.005, tz - bz).normalize();
        pm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        pm.position.set(bx + dir.x * 0.075, y + 0.008 + dir.y * 0.075, bz + dir.z * 0.075);
        const tipC = new THREE.Vector3(bx, y + 0.008, bz).addScaledVector(dir, 0.15);
        k.rod([tipC.x, tipC.y, tipC.z], [tipC.x + dir.x * 0.012, tipC.y + dir.y * 0.012, tipC.z + dir.z * 0.012], 0.0036, M.wood('#e2c79c'), 0.0008, 6);
      } else {
        k.rod([bx, y + 0.008, bz], [tx, top, tz], 0.0042, M.plastic(pens[i % pens.length]), 0.0042, 8);
        k.rod([tx, top, tz], [tx + (tx - bx) * 0.08, top + 0.008, tz + (tz - bz) * 0.08], 0.0044, M.chrome(), 0.003, 8);
      }
    }
    // letter tray with papers
    const trayW = 0.14;
    const trayD = 0.13;
    const tx0 = 0.065;
    k.box(trayW, 0.004, trayD, M.blackMetal(), tx0, y, -0.008);
    for (const s of [-1, 1]) k.box(0.004, 0.04, trayD, M.blackMetal(), tx0 + s * (trayW / 2 - 0.002), y, -0.008);
    k.box(trayW, 0.03, 0.004, M.blackMetal(), tx0, y, -0.008 - trayD / 2 + 0.002);
    for (let i = 0; i < 5; i++) {
      const p = k.box(0.125, 0.0012, 0.12, M.matte(i === 4 ? '#f2e9a8' : '#fbfaf6'), tx0 + (r() - 0.5) * 0.006, y + 0.005 + i * 0.0016, -0.006);
      p.rotation.y = (r() - 0.5) * 0.06;
    }
    // sticky notes + phone stand slot
    k.box(0.05, 0.03, 0.05, M.matte('#f3df57'), -0.035, y, 0.03);
    k.box(0.048, 0.001, 0.048, M.matte('#f7e874'), -0.035, y + 0.03, 0.03);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 0.32, 0.16, 0.006, tint(c.wood, 0.4));
      circ(ctx, -0.11, 0, 0.035, '#55575c');
      D.rr(ctx, 0.065, -0.008, 0.14, 0.13, 0.002, '#ffffff');
      D.rr(ctx, -0.035, 0.03, 0.05, 0.05, 0.002, '#f7e874');
    }),
};

const laptop: FurnitureDef = (() => {
  const w = 0.32;
  const bd = 0.22;
  const d = 0.29;
  const bz = d / 2 - bd / 2 - 0.002;
  const hz = bz - bd / 2 + 0.004;
  const by = 0.016;
  const a = 0.26;
  const L = 0.21;
  return {
    id: 'acc-laptop',
    name: 'מחשב נייד פתוח',
    category: CAT,
    group: G_OFFICE,
    tags: ['מחשב נייד', 'לפטופ', 'עבודה', 'משרד', 'טכנולוגיה'],
    size: { w, d, h: 0.225 },
    colors: [slot('body', 'גוף', '#c4c6c9')],
    actions: [{ kind: 'computer' }],
    build: ({ colors: c }) => {
      const k = new Kit();
      const alu = M.brushed(c.body);
      // base
      k.rbox(w, by, bd, 0.006, alu, 0, 0, bz, 2);
      const keyM = M.plastic('#1d1e21');
      k.box(w - 0.05, 0.001, 0.105, M.matte('#2a2b2e'), 0, by - 0.0004, bz - 0.035);
      const cols = 14;
      const kw = (w - 0.06) / cols;
      for (let row = 0; row < 5; row++) {
        for (let i = 0; i < cols; i++) {
          if (row === 4 && i > 3 && i < 10) {
            if (i === 4) k.box(kw * 6 - 0.003, 0.0014, kw - 0.004, keyM, -((w - 0.06) / 2) + kw * 7, by, bz - 0.035 + 0.04);
            continue;
          }
          k.box(kw - 0.003, 0.0014, kw - 0.004, keyM, -((w - 0.06) / 2) + kw * (i + 0.5), by, bz - 0.035 - 0.04 + row * 0.02);
        }
      }
      k.rbox(0.11, 0.0008, 0.07, 0.006, M.brushed(darken(c.body, 0.08)), 0, by - 0.0002, bz + 0.065, 1);
      // lid tilted back, screen as part
      const lid = new Kit();
      lid.rbox(w, L, 0.006, 0.004, alu, 0, 0, -0.003, 1);
      lid.box(w - 0.006, L - 0.006, 0.0008, M.screen('#0b0c0e'), 0, 0.003, 0.0004);
      const lg = k.sub(lid, 0, by, hz);
      lg.rotation.x = -a;
      const scr = k.part('screen', 0, by, hz);
      scr.g.rotation.x = -a;
      scr.box(w - 0.024, L - 0.034, 0.001, M.screen('#141820'), 0, 0.016, 0.0012);
      // hinge barrel
      const hg = k.cyl(0.006, w - 0.08, M.brushed(darken(c.body, 0.2)), 0, 0, 0, 0.006, 12);
      hg.rotation.z = Math.PI / 2;
      hg.position.set(0, by, hz - 0.001);
      return k.g;
    },
    draw2d: (ctx, c) =>
      sym(ctx, () => {
        D.rr(ctx, 0, bz, w, bd, 0.008, tint(c.body, 0.4));
        D.rr(ctx, 0, bz - 0.035, w - 0.05, 0.105, 0.003, '#bfc1c4', INK_SOFT, 0.005);
        D.rr(ctx, 0, bz + 0.065, 0.11, 0.07, 0.006, null, INK_SOFT, 0.005);
        D.rr(ctx, 0, (hz + -d / 2) / 2, w, hz + d / 2, 0.003, '#6b6e73');
      }),
  };
})();

const alarmClock: FurnitureDef = (() => {
  const cy = 0.08;
  const fz = 0.022;
  return {
    id: 'acc-alarm-clock',
    name: 'שעון מעורר עם פעמונים',
    category: CAT,
    group: G_OFFICE,
    tags: ['שעון', 'מעורר', 'פעמונים', 'רטרו', 'שידה'],
    size: { w: 0.14, d: 0.07, h: 0.17 },
    colors: [slot('body', 'גוף', '#2f6f6a')],
    actions: [{ kind: 'clock' }],
    build: ({ colors: c }) => {
      const k = new Kit();
      const body = M.lacquer(c.body);
      const chrome = M.chrome();
      const R = 0.055;
      discZ(k, R, 0.044, body, 0, cy, -fz, 32);
      ringZ(k, R - 0.002, 0.0045, chrome, 0, cy, fz, 32);
      circleZ(k, R - 0.006, M.paint('#f7f3ea', 0.6), 0, cy, fz + 0.0005, 32);
      const ink = M.matte('#222222');
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const big = i % 3 === 0;
        const m = k.box(big ? 0.0035 : 0.002, big ? 0.009 : 0.005, 0.001, ink, 0, 0, 0);
        m.rotation.z = -a;
        const rr = R - 0.014;
        m.position.set(Math.sin(a) * rr, cy + Math.cos(a) * rr, fz + 0.001);
      }
      // bells + hammer + carry handle
      for (const s of [-1, 1]) {
        const bell = new THREE.SphereGeometry(0.026, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
        const m = k.geo(bell, chrome, s * 0.038, cy + 0.052, 0);
        m.rotation.z = -s * 0.55;
        k.rod([s * 0.02, cy + 0.045, 0], [s * 0.038, cy + 0.06, 0], 0.002, chrome, 0.002, 6);
        // legs
        k.rod([s * 0.03, cy - 0.04, -0.004], [s * 0.05, 0.006, -0.004], 0.0035, chrome, 0.0035, 8);
        k.sphere(0.006, chrome, s * 0.05, 0.006, -0.004, 1, 1, 1, 8);
      }
      k.rod([0, cy + 0.055, 0], [0, cy + 0.072, 0], 0.002, chrome, 0.002, 6);
      k.box(0.012, 0.005, 0.005, chrome, 0, cy + 0.071, 0);
      k.tube(
        [
          [-0.018, cy + 0.054, -0.012],
          [0, cy + 0.072, -0.012],
          [0.018, cy + 0.054, -0.012],
        ],
        0.0022,
        chrome,
        { seg: 8, radial: 5 },
      );
      // winding keys on the back
      for (const s of [-1, 1]) {
        k.rod([s * 0.02, cy, -fz], [s * 0.02, cy, -fz - 0.006], 0.002, chrome, 0.002, 6);
        k.box(0.012, 0.01, 0.002, chrome, s * 0.02, cy - 0.005, -fz - 0.008);
      }
      // hands (parts at the dial centre, pointing up at rest)
      const hr = k.part('hour', 0, cy, fz + 0.002);
      hr.box(0.004, 0.028, 0.0012, ink, 0, -0.005, 0);
      const mn = k.part('minute', 0, cy, fz + 0.0035);
      mn.box(0.0028, 0.04, 0.0012, ink, 0, -0.006, 0);
      const sc = k.part('second', 0, cy, fz + 0.005);
      sc.box(0.0012, 0.044, 0.0008, M.matte('#c0392b'), 0, -0.01, 0);
      k.cyl(0.003, 0.006, chrome, 0, 0, 0, 0.003, 8).position.set(0, cy, fz + 0.005);
      return k.g;
    },
    draw2d: (ctx, c) =>
      sym(ctx, () => {
        D.rr(ctx, 0, 0, 0.11, 0.044, 0.02, tint(c.body, 0.4));
        circ(ctx, -0.038, 0, 0.024, '#e5e8ea');
        circ(ctx, 0.038, 0, 0.024, '#e5e8ea');
        D.line(ctx, -0.05, 0.022, 0.05, 0.022, '#c9cbcd', 0.006);
      }),
  };
})();

/* chess */
type Piece = 'p' | 'r' | 'n' | 'b' | 'q' | 'k';
const PIECE_PROF: Record<Piece, Array<[number, number]>> = {
  p: [
    [0, 0],
    [0.011, 0],
    [0.011, 0.004],
    [0.006, 0.01],
    [0.004, 0.02],
    [0.0075, 0.022],
    [0.0065, 0.028],
    [0.0065, 0.033],
    [0.003, 0.037],
    [0, 0.0375],
  ],
  r: [
    [0, 0],
    [0.013, 0],
    [0.013, 0.005],
    [0.008, 0.012],
    [0.0075, 0.034],
    [0.011, 0.037],
    [0.011, 0.046],
    [0.007, 0.046],
    [0.007, 0.042],
    [0, 0.042],
  ],
  n: [
    [0, 0],
    [0.013, 0],
    [0.013, 0.005],
    [0.008, 0.012],
    [0.009, 0.02],
    [0, 0.02],
  ],
  b: [
    [0, 0],
    [0.012, 0],
    [0.012, 0.005],
    [0.007, 0.012],
    [0.0045, 0.035],
    [0.008, 0.037],
    [0.008, 0.046],
    [0.005, 0.056],
    [0.002, 0.06],
    [0, 0.062],
  ],
  q: [
    [0, 0],
    [0.014, 0],
    [0.014, 0.005],
    [0.008, 0.014],
    [0.005, 0.045],
    [0.01, 0.048],
    [0.006, 0.052],
    [0.011, 0.062],
    [0.004, 0.066],
    [0, 0.072],
  ],
  k: [
    [0, 0],
    [0.014, 0],
    [0.014, 0.005],
    [0.008, 0.014],
    [0.0055, 0.05],
    [0.01, 0.053],
    [0.006, 0.057],
    [0.01, 0.068],
    [0, 0.07],
  ],
};

function chessPiece(k: Kit, t: Piece, x: number, y: number, z: number, mat: THREE.Material, facing: number): void {
  k.lathe(PIECE_PROF[t], mat, x, y, z, t === 'p' ? 6 : 7);
  if (t === 'n') {
    const h = new Kit();
    const neck = h.box(0.012, 0.03, 0.02, mat, 0, 0, -0.002);
    neck.rotation.x = -0.12;
    const snout = h.box(0.011, 0.012, 0.024, mat, 0, 0.018, 0.008);
    snout.rotation.x = 0.35;
    h.box(0.004, 0.008, 0.006, mat, 0, 0.029, -0.006);
    const g = k.sub(h, x, y + 0.018, z);
    g.rotation.y = facing;
  }
  if (t === 'k') {
    k.box(0.003, 0.016, 0.003, mat, x, y + 0.068, z);
    k.box(0.01, 0.003, 0.003, mat, x, y + 0.077, z);
  }
}

const chess: FurnitureDef = (() => {
  const S = 0.044;
  const B = 0.4;
  return {
    id: 'acc-chess-set',
    name: 'לוח שחמט עם כלים',
    category: CAT,
    group: G_OFFICE,
    tags: ['שחמט', 'משחק', 'לוח', 'עץ', 'אסטרטגיה'],
    size: { w: B, d: B, h: 0.106 },
    colors: [slot('board', 'לוח', PAL.walnut), slot('light', 'משבצות בהירות', '#e6d2ad')],
    actions: [{ kind: 'play', at: { x: 0, y: 0, z: 0.55 } }],
    build: ({ colors: c }) => {
      const k = new Kit();
      const frame = M.wood(c.board, 0.35);
      k.rbox(B, 0.022, B, 0.004, frame, 0, 0, 0, 2);
      const top = 0.022;
      k.box(8 * S, 0.0015, 8 * S, M.wood(c.light, 0.35), 0, top - 0.001, 0);
      const dark = M.wood(darken(c.board, 0.15), 0.35);
      for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) if ((i + j) % 2 === 1) k.box(S, 0.0016, S, dark, (i - 3.5) * S, top - 0.0008, (j - 3.5) * S);
      const white = M.lacquer('#efe6d4');
      const black = M.lacquer('#26201c');
      const sq = (f: number, r: number): [number, number] => [(f - 3.5) * S, (3.5 - r) * S];
      const y = top + 0.0008;
      const pos: Array<[Piece, number, number, boolean]> = [
        ['r', 0, 0, true],
        ['n', 2, 2, true],
        ['b', 2, 0, true],
        ['q', 3, 0, true],
        ['k', 6, 0, true],
        ['b', 4, 3, true],
        ['r', 5, 0, true],
        ['p', 0, 1, true],
        ['p', 2, 1, true],
        ['p', 3, 3, true],
        ['p', 4, 3, true],
        ['p', 5, 1, true],
        ['p', 6, 1, true],
        ['r', 0, 7, false],
        ['n', 2, 5, false],
        ['b', 2, 7, false],
        ['q', 3, 6, false],
        ['k', 4, 7, false],
        ['n', 5, 5, false],
        ['r', 7, 7, false],
        ['p', 0, 6, false],
        ['p', 1, 5, false],
        ['p', 2, 6, false],
        ['p', 4, 4, false],
        ['p', 5, 6, false],
        ['p', 6, 6, false],
      ];
      for (const [t, f, r, w] of pos) {
        const [x, z] = sq(f, r);
        chessPiece(k, t, x, y, z, w ? white : black, w ? Math.PI : 0);
      }
      // captured pieces lying beside the board edge
      const cp = k.lathe(PIECE_PROF.b, black, 0, 0, 0, 8);
      cp.rotation.z = Math.PI / 2;
      cp.position.set(0.19, top + 0.006, 0.19);
      return k.g;
    },
    draw2d: (ctx, c) =>
      sym(ctx, () => {
        D.rr(ctx, 0, 0, B, B, 0.006, tint(c.board, 0.3));
        D.rr(ctx, 0, 0, 8 * S, 8 * S, 0, tint(c.light, 0.3), null);
        for (let i = 0; i < 8; i++)
          for (let j = 0; j < 8; j++) if ((i + j) % 2 === 1) D.rr(ctx, (i - 3.5) * S, (j - 3.5) * S, S, S, 0, tint(c.board, 0.15), null);
        D.rr(ctx, 0, 0, 8 * S, 8 * S, 0, null, INK_SOFT, 0.006);
      }),
  };
})();

const boardGames: FurnitureDef = {
  id: 'acc-board-games',
  name: 'ערימת משחקי קופסה',
  category: CAT,
  group: G_OFFICE,
  tags: ['משחקי קופסה', 'משחק', 'קוביות', 'משפחה', 'ערב משחקים'],
  size: { w: 0.42, d: 0.3, h: 0.21 },
  colors: [slot('box1', 'קופסה עליונה', '#d6a544')],
  actions: [{ kind: 'play', at: { x: 0, y: 0, z: 0.5 } }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const boxes: Array<[number, number, number, number, string, number, string[]]> = [
      [0.4, 0.075, 0.28, 0.0, '#2f5d8a', 0.0, ['#2f5d8a', '#f2e6c8', '#c94f4f', '#e9b83a']],
      [0.36, 0.06, 0.26, 0.08, '#3d7a4f', 0.0, ['#e7e0cf', '#3d7a4f', '#8a3b3b', '#2b2b2b']],
      [0.3, 0.045, 0.22, -0.1, c.box1, 0.0, [c.box1, '#2b2f3a', '#f4efe4', '#c7775a']],
    ];
    const styles = ['geometric', 'city', 'circles'] as const;
    let y = 0;
    boxes.forEach(([w, h, d, rot, col, , pal], i) => {
      const b = new Kit();
      b.rbox(w, h, d, 0.003, M.matte(darken(col, 0.1)), 0, 0, 0, 1);
      b.box(w + 0.002, h * 0.55, d + 0.002, M.paint(col, 0.5), 0, h * 0.45, 0);
      const art = b.geo(artPlaneGeo(w - 0.03, d - 0.03), M.art(styles[i], i + 11, pal, w - 0.03, d - 0.03), 0, h + 0.0012, 0);
      art.geometry.translate(0, -(d - 0.03) / 2, 0);
      art.rotation.x = -Math.PI / 2;
      art.castShadow = false;
      const g = k.sub(b, (i - 1) * 0.004, y, 0);
      g.rotation.y = rot;
      y += h;
    });
    // dice and pawns on top
    const die = M.paint('#f7f5ef', 0.3);
    const pip = M.matte('#1d1d1d');
    for (const [x, z, a] of [
      [-0.06, 0.04, 0.3],
      [-0.03, 0.06, -0.5],
    ]) {
      const d = k.rbox(0.018, 0.018, 0.018, 0.003, die, x, y, z, 2);
      d.rotation.y = a;
      k.disc(0.0025, 0.0006, pip, x, y + 0.018, z, 8);
    }
    for (const [x, z, col] of [
      [0.05, -0.03, '#c0392b'],
      [0.075, 0.0, '#2f6fb5'],
      [0.035, 0.03, '#2e8b57'],
    ] as Array<[number, number, string]>) {
      sLathe(
        k,
        [
          [0, 0],
          [0.009, 0],
          [0.007, 0.006],
          [0.004, 0.018],
          [0.0055, 0.022],
          [0, 0.03],
        ],
        M.plastic(col),
        x,
        y,
        z,
        10,
        10,
      );
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 0.4, 0.28, 0.004, '#a9bdd1');
      ctx.save();
      ctx.rotate(0.1);
      D.rr(ctx, 0, 0, 0.3, 0.22, 0.004, tint(c.box1, 0.3));
      ctx.restore();
      D.rr(ctx, -0.06, 0.04, 0.018, 0.018, 0.003, '#ffffff');
    }),
};

const recordCrate: FurnitureDef = {
  id: 'acc-record-crate',
  name: 'ארגז תקליטי ויניל',
  category: CAT,
  group: G_OFFICE,
  tags: ['תקליטים', 'ויניל', 'ארגז', 'מוזיקה', 'רטרו'],
  size: { w: 0.36, d: 0.36, h: 0.33 },
  colors: [slot('wood', 'עץ', '#c9a777')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const wood = M.wood(c.wood, 0.6);
    const W = 0.36;
    const t = 0.014;
    k.box(W - 2 * t, 0.012, W - 2 * t, wood, 0, 0.0, 0);
    // end panels (solid with a hand hole) + slatted long sides
    for (const s of [-1, 1]) {
      k.box(t, 0.26, W, wood, s * (W / 2 - t / 2), 0, 0);
      k.rbox(0.004, 0.03, 0.1, 0.012, M.matte('#2b2520'), s * (W / 2 - 0.0015), 0.2, 0, 1);
      for (const y of [0.012, 0.1, 0.19]) k.box(W - 2 * t, 0.07, t, wood, 0, y, s * (W / 2 - t / 2));
    }
    // sleeves leaning back
    const r = rng(21);
    const pals = [
      ['#1e1e24', '#e94f37', '#f6f7eb'],
      ['#f2e8cf', '#386641', '#bc4749'],
      ['#22223b', '#9a8c98', '#f2e9e4'],
      ['#ffbe0b', '#3a86ff', '#fb5607'],
      ['#e5e5e5', '#2b2d42', '#ef233c'],
    ];
    const n = 16;
    for (let i = 0; i < n; i++) {
      const z = -W / 2 + t + 0.048 + i * 0.016;
      const sl = new Kit();
      const col = pals[i % pals.length];
      sl.box(0.31, 0.31, 0.004, M.matte(col[0]), 0, 0, 0);
      if (i === n - 1 || i % 4 === 1) sl.geo(artPlaneGeo(0.3, 0.3), M.art(i % 2 ? 'circles' : 'stripes', i + 2, col, 0.3, 0.3), 0, 0.005, 0.0022);
      else sl.box(0.12, 0.12, 0.001, M.matte(col[1]), 0, 0.12, 0.0022);
      const g = k.sub(sl, (r() - 0.5) * 0.01, 0.012, z);
      g.rotation.x = -0.15 + i * 0.009;
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 0.36, 0.36, 0.004, tint(c.wood, 0.4));
      D.rr(ctx, 0, 0, 0.332, 0.332, 0, '#e9e4dc', INK_SOFT, 0.006);
      for (let i = 0; i < 16; i++) D.line(ctx, -0.155, -0.15 + i * 0.019, 0.155, -0.15 + i * 0.019, INK_SOFT, 0.004);
    }),
};

/* ================================================================== SMALL STORAGE */

function umbrella(k: Kit, col: string, handle: THREE.Material, x: number, z: number, lean: [number, number], len: number): void {
  const u = new Kit();
  const canopy = flutedLatheGeo(
    [
      [0.004, 0.0],
      [0.012, 0.03],
      [0.03, 0.16],
      [0.034, 0.3],
      [0.022, 0.42],
      [0.008, len - 0.12],
      [0.004, len - 0.1],
    ],
    8,
    0.35,
    24,
  );
  u.geo(canopy, M.fabric(col, 20), 0, 0.03, 0);
  u.rod([0, 0, 0], [0, 0.04, 0], 0.003, M.chrome(), 0.002, 6);
  u.ring(0.02, 0.004, M.matte(darken(col, 0.3)), 0, 0.03 + 0.25, 0, 14);
  u.rod([0, len - 0.09, 0], [0, len - 0.03, 0], 0.005, M.chrome(), 0.005, 8);
  u.tube(
    [
      [0, len - 0.035, 0],
      [0, len + 0.0, 0],
      [0.02, len + 0.03, 0],
      [0.045, len + 0.012, 0],
      [0.05, len - 0.02, 0],
    ],
    0.009,
    handle,
    { seg: 16, radial: 8 },
  );
  const g = k.sub(u, x, 0.02, z);
  g.rotation.set(lean[0], lean[1], 0, 'YXZ');
}

const umbrellaStand: FurnitureDef = {
  id: 'acc-umbrella-stand',
  name: 'מעמד מטריות עם מטריות',
  category: CAT,
  group: G_STORE,
  tags: ['מטריות', 'מעמד', 'כניסה', 'חורף', 'מבואה'],
  size: { w: 0.24, d: 0.24, h: 0.88 },
  colors: [slot('stand', 'מעמד', '#2f3a40'), slot('umbrella', 'מטריה', '#7a2e3a')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const mat = M.ceramic(c.stand);
    sLathe(
      k,
      [
        [0, 0],
        [0.1, 0],
        [0.11, 0.02],
        [0.11, 0.48],
        [0.114, 0.5],
        [0.104, 0.5],
        [0.102, 0.48],
        [0.102, 0.03],
        [0, 0.03],
      ],
      mat,
      0,
      0,
      0,
      24,
      14,
    );
    k.ring(0.111, 0.004, M.brass(), 0, 0.44, 0, 32);
    umbrella(k, c.umbrella, M.wood(PAL.darkWood, 0.35), -0.035, -0.02, [-0.12, -0.6], 0.82);
    umbrella(k, '#2c3e50', M.leather('#6b4a2f'), 0.035, 0.01, [-0.1, 2.2], 0.78);
    umbrella(k, '#d6a544', M.plastic('#1e1e1e'), -0.0, 0.04, [-0.1, 0.9], 0.74);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      circ(ctx, 0, 0, 0.114, tint(c.stand, 0.5));
      circ(ctx, 0, 0, 0.102, tint(c.stand, 0.7));
      circ(ctx, -0.05, -0.04, 0.03, tint(c.umbrella, 0.3));
      circ(ctx, 0.05, 0.0, 0.03, tint('#2c3e50', 0.35));
      circ(ctx, 0.0, 0.05, 0.03, tint('#d6a544', 0.3));
    }),
};

const wickerBasket: FurnitureDef = {
  id: 'acc-wicker-basket',
  name: 'סל קש עם שמיכה',
  category: CAT,
  group: G_STORE,
  tags: ['סל', 'קש', 'נצרים', 'שמיכה', 'אחסון'],
  size: { w: 0.44, d: 0.44, h: 0.39 },
  colors: [slot('basket', 'קש', '#b8925f'), slot('throw', 'שמיכה', '#e6ded0')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const wk = M.wicker(c.basket);
    k.lathe(
      [
        [0, 0],
        [0.17, 0],
        [0.18, 0.01],
        [0.2, 0.32],
        [0.205, 0.335],
        [0.196, 0.34],
        [0.19, 0.33],
        [0.172, 0.025],
        [0, 0.025],
      ],
      wk,
      0,
      0,
      0,
      32,
    );
    k.ring(0.201, 0.01, M.wicker(darken(c.basket, 0.12)), 0, 0.33, 0, 32);
    // rope handles
    for (const s of [-1, 1]) {
      const h = new THREE.TorusGeometry(0.04, 0.008, 6, 14, Math.PI);
      h.rotateY(Math.PI / 2);
      k.geo(h, M.linen('#cdb892'), s * 0.205, 0.27, 0);
    }
    // folded knit throw spilling over the rim
    const kn = M.knit(c.throw);
    k.cushion(0.3, 0.09, 0.26, kn, -0.01, 0.27, 0.0, 0.04, 0.03, 2);
    const fold = k.cushion(0.2, 0.03, 0.14, kn, 0.0, 0, 0, 0.012, 0.0, 2);
    fold.rotation.x = 1.15;
    fold.position.set(0.02, 0.31, 0.175);
    k.sphere(0.03, kn, 0.03, 0.35, 0.15, 3, 0.8, 1.2, 10);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      circ(ctx, 0, 0, 0.205, tint(c.basket, 0.4));
      D.ellipse(ctx, -0.01, 0.02, 0.16, 0.15, tint(c.throw, 0.2), INK_SOFT, 0.006);
      for (const s of [-1, 1]) D.line(ctx, s * 0.205, -0.04, s * 0.205, 0.04, INK_SOFT, 0.016);
    }),
};

const laundryHamper: FurnitureDef = {
  id: 'acc-laundry-hamper',
  name: 'סל כביסה קלוע עם מכסה',
  category: CAT,
  group: G_STORE,
  tags: ['כביסה', 'סל', 'קלוע', 'אמבטיה', 'חדר שינה'],
  size: { w: 0.46, d: 0.34, h: 0.61 },
  colors: [slot('weave', 'קליעה', '#c9ad84'), slot('liner', 'בטנה', '#e8e2d6')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const wk = M.wicker(c.weave);
    const w = 0.44;
    const d = 0.32;
    const wall = roundedRectShape(w, d, 0.06);
    wall.holes.push(roundedRectPath(new THREE.Path(), w - 0.03, d - 0.03, 0.045));
    k.slab(wall, 0.54, wk, 0, 0, 0, 0, 8);
    k.slab(roundedRectShape(w - 0.02, d - 0.02, 0.05), 0.02, wk, 0, 0, 0);
    // dark hand holes
    for (const s of [-1, 1]) {
      const hh = k.rbox(0.004, 0.035, 0.11, 0.015, M.matte('#2a241e'), s * (w / 2 + 0.0005), 0.45, 0, 1);
      hh.castShadow = false;
    }
    // linen liner folded over the rim
    const lin = M.linen(c.liner);
    const cuff = roundedRectShape(w + 0.012, d + 0.012, 0.065);
    cuff.holes.push(roundedRectPath(new THREE.Path(), w - 0.03, d - 0.03, 0.045));
    k.slab(cuff, 0.06, lin, 0, 0.5, 0, 0.003, 8);
    // lid, slightly lifted & askew
    const lid = new Kit();
    lid.slab(roundedRectShape(w + 0.016, d + 0.016, 0.068), 0.025, wk, 0, 0, 0, 0.006, 8);
    lid.rbox(0.07, 0.014, 0.022, 0.006, M.leather('#6b4a2f'), 0, 0.025, 0, 2);
    k.sub(lid, 0, 0.56, 0.0);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 0.456, 0.336, 0.068, tint(c.weave, 0.4));
      D.rr(ctx, 0, 0, 0.4, 0.28, 0.05, null, INK_SOFT, 0.006);
      D.rr(ctx, 0, 0, 0.07, 0.022, 0.006, tint('#6b4a2f', 0.3));
    }),
};

const toolbox: FurnitureDef = {
  id: 'acc-toolbox',
  name: 'ארגז כלים ממתכת',
  category: CAT,
  group: G_STORE,
  tags: ['ארגז כלים', 'כלים', 'מתכת', 'מחסן', 'עשה זאת בעצמך'],
  size: { w: 0.46, d: 0.22, h: 0.27 },
  colors: [slot('body', 'גוף', '#b8322a')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const body = M.paint(c.body, 0.3);
    const steel = M.chrome();
    const dark = M.blackMetal();
    const w = 0.45;
    const d = 0.2;
    k.rbox(w, 0.16, d, 0.008, body, 0, 0.004, 0, 2);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.03, 0.006, 0.02, M.rubber(), sx * (w / 2 - 0.03), 0, sz * (d / 2 - 0.02));
    // rolled seam + lid
    k.box(w + 0.004, 0.006, d + 0.004, M.paint(darken(c.body, 0.15), 0.35), 0, 0.16, 0);
    k.rbox(w, 0.045, d, 0.01, body, 0, 0.166, 0, 2);
    // embossed ribs on the lid
    for (const x of [-0.12, 0.12]) k.rbox(0.12, 0.004, 0.14, 0.002, M.paint(lighten(c.body, 0.08), 0.3), x, 0.211, 0, 1);
    // handle
    for (const s of [-1, 1]) k.box(0.02, 0.025, 0.03, dark, s * 0.09, 0.211, 0);
    k.tube(
      [
        [-0.09, 0.222, 0],
        [-0.08, 0.258, 0],
        [0.08, 0.258, 0],
        [0.09, 0.222, 0],
      ],
      0.007,
      dark,
      { seg: 16, radial: 8, tension: 0.1 },
    );
    // latches
    for (const s of [-1, 1]) {
      k.box(0.035, 0.05, 0.006, steel, s * 0.15, 0.14, d / 2 + 0.002);
      k.box(0.02, 0.012, 0.004, steel, s * 0.15, 0.13, d / 2 + 0.006);
    }
    k.box(0.04, 0.018, 0.004, M.matte('#f2f2f0'), 0, 0.09, d / 2 + 0.001);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 0.45, 0.2, 0.01, tint(c.body, 0.45));
      D.rr(ctx, 0, 0, 0.18, 0.02, 0.008, '#6b6e73');
      D.line(ctx, -0.225, 0.1, 0.225, 0.1, INK_SOFT, 0.006);
    }),
};

const storageBoxes: FurnitureDef = {
  id: 'acc-storage-boxes',
  name: 'קופסאות אחסון מבד',
  category: CAT,
  group: G_STORE,
  tags: ['קופסאות', 'אחסון', 'פשתן', 'ארגון', 'מדף'],
  size: { w: 0.4, d: 0.31, h: 0.53 },
  colors: [slot('fabric', 'בד', '#cfc4b2'), slot('tabs', 'ידיות', '#6b4a2f')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const lin = M.linen(c.fabric);
    const leather = M.leather(c.tabs);
    const brass = M.brass();
    const stack: Array<[number, number, number, number, string]> = [
      [0.4, 0.24, 0.3, 0.0, c.fabric],
      [0.38, 0.2, 0.29, 0.03, darken(c.fabric, 0.12)],
      [0.24, 0.08, 0.18, -0.08, lighten(c.fabric, 0.2)],
    ];
    let y = 0;
    stack.forEach(([w, h, d, rot, col], i) => {
      const b = new Kit();
      const m = i === 0 ? lin : M.linen(col);
      b.rbox(w, h, d, 0.012, m, 0, 0, 0, 2);
      b.box(w - 0.006, 0.008, d - 0.006, M.linen(darken(col, 0.1)), 0, h - 0.0075, 0);
      if (i < 2) {
        b.rbox(0.09, 0.022, 0.006, 0.004, leather, 0, h * 0.62, d / 2 + 0.001, 1);
        for (const s of [-1, 1]) b.sphere(0.0035, brass, s * 0.038, h * 0.62 + 0.011, d / 2 + 0.005, 1, 1, 1, 6);
        b.box(0.06, 0.035, 0.003, brass, 0, h * 0.28, d / 2 + 0.0005);
        b.box(0.05, 0.026, 0.0015, M.matte('#f6f1e6'), 0, h * 0.28 + 0.0045, d / 2 + 0.002);
      } else {
        b.rbox(0.08, 0.006, 0.02, 0.003, leather, 0, h, 0, 1);
      }
      const g = k.sub(b, 0, y, 0);
      g.rotation.y = rot;
      y += h;
    });
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 0.4, 0.3, 0.012, tint(c.fabric, 0.4));
      ctx.save();
      ctx.rotate(0.08);
      D.rr(ctx, 0, 0, 0.24, 0.18, 0.01, tint(c.fabric, 0.55));
      ctx.restore();
      D.rr(ctx, 0, 0.152, 0.09, 0.006, 0.002, tint(c.tabs, 0.2), null);
    }),
};

export const ACCESSORIES: FurnitureDef[] = [
  // serving
  fruitBowl,
  coffeeTray,
  wineSet,
  teaSet,
  cakeStand,
  lemonade,
  oilSet,
  spiceRack,
  // decor
  budTrio,
  tallVase,
  glassVase,
  flutedVase,
  sculpture,
  cairn,
  bust,
  globe,
  photoFrames,
  decorBowl,
  jewelryBox,
  perfumeTray,
  teddy,
  hourglass,
  // candles & lanterns
  pillarCandles,
  brassCandlesticks,
  candleJar,
  hurricane,
  moroccanLantern,
  // books & office
  bookStackItem,
  bookends,
  magazineRack,
  deskOrganizer,
  laptop,
  alarmClock,
  chess,
  boardGames,
  recordCrate,
  // small storage
  umbrellaStand,
  wickerBasket,
  laundryHamper,
  toolbox,
  storageBoxes,
];
