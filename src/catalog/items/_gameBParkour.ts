/**
 * Team B – obstacle course (parkour) items. Standable parts come from _gameBShapes.ts (the walk physics uses
 * the same shapes). Checkpoint flags carry their number in the catalog id (`pk-checkpoint-3`), so the course
 * order is visible on the flag and the player re-orders a course by placing other flags.
 */
import * as THREE from 'three';
import type { FurnitureDef, ItemSize } from '../types';
import { D, INK, INK_SOFT, Kit, LINE_THIN, M, darken, sym, tint } from '../kit';
import { slot } from './_parts';
import { cachedMat, canvasTex, drawBanner, drawNumber } from './_gameBKit';
import { MONKEY, TOWER, TYRE_R, ZIP, monkeyRungs, towerSurfaces, tyreCenters, zipCable, zipSurfaces } from './_gameBShapes';

const GROUP = 'מסלול מכשולים';
const TAGS = ['פארקור', 'מסלול', 'מכשולים', 'טיפוס', 'קפיצה', 'נינג\'ה'];

const box2d = (ctx: CanvasRenderingContext2D, size: ItemSize, fill: string) => D.box(ctx, -size.w / 2, -size.d / 2, size.w / 2, size.d / 2, 0.02, fill, INK);

/** a wooden box with a soft rubber top (platforms, steps) */
function padBox(k: Kit, w: number, d: number, h: number, body: string, top: string, x = 0, z = 0): void {
  k.box(w, h - 0.04, d, M.wood(body, 0.65), x, 0, z);
  k.rbox(w, 0.05, d, 0.015, M.rubber(top), x, h - 0.05, z);
}

/* ===================================================================== platforms & steps */

const platform: FurnitureDef = {
  id: 'pk-platform',
  name: 'במת קפיצה',
  category: 'playground',
  group: GROUP,
  tags: [...TAGS, 'במה', 'קופסה'],
  size: { w: 1.2, d: 1.2, h: 0.5 },
  resize: { w: [0.5, 3], d: [0.5, 3], h: [0.2, 1.6] },
  parametric: true,
  colors: [slot('body', 'גוף', '#d9a35b'), slot('top', 'משטח', '#e8503a')],
  build: ({ colors: c, size = platform.size }) => {
    const k = new Kit();
    padBox(k, size.w, size.d, size.h, c.body, c.top);
    return k.g;
  },
  draw2d: (ctx, c, size = platform.size) =>
    sym(ctx, () => {
      box2d(ctx, size, tint(c.top, 0.3));
      D.box(ctx, -size.w / 2 + 0.06, -size.d / 2 + 0.06, size.w / 2 - 0.06, size.d / 2 - 0.06, 0.02, null, INK_SOFT, LINE_THIN);
    }),
};

const steps: FurnitureDef = {
  id: 'pk-steps',
  name: 'מדרגות קפיצה',
  category: 'playground',
  group: GROUP,
  tags: [...TAGS, 'מדרגות'],
  size: { w: 1.2, d: 3, h: 0.9 },
  resize: { w: [0.6, 3], d: [1.8, 5], h: [0.45, 1.5] },
  parametric: true,
  colors: [slot('body', 'גוף', '#d9a35b'), slot('top', 'משטח', '#2f9ad0')],
  build: ({ colors: c, size = steps.size }) => {
    const k = new Kit();
    for (let i = 0; i < 3; i++) padBox(k, size.w, size.d / 3 - 0.02, (size.h * (i + 1)) / 3, c.body, c.top, 0, size.d / 2 - (size.d / 3) * (i + 0.5));
    return k.g;
  },
  draw2d: (ctx, c, size = steps.size) =>
    sym(ctx, () => {
      box2d(ctx, size, tint(c.top, 0.35));
      for (let i = 1; i < 3; i++) D.line(ctx, -size.w / 2, size.d / 2 - (size.d / 3) * i, size.w / 2, size.d / 2 - (size.d / 3) * i, INK, LINE_THIN);
    }),
};

/* ===================================================================== balance beam */

const beam: FurnitureDef = {
  id: 'pk-balance-beam',
  name: 'קורת שיווי משקל',
  category: 'playground',
  group: GROUP,
  tags: [...TAGS, 'קורה', 'שיווי משקל'],
  size: { w: 0.6, d: 4, h: 0.5 },
  resize: { d: [2, 8], h: [0.25, 1] },
  parametric: true,
  colors: [slot('beam', 'קורה', '#c98d4a'), slot('legs', 'רגליים', '#3b6e4f')],
  build: ({ colors: c, size = beam.size }) => {
    const k = new Kit();
    const wood = M.wood(c.beam, 0.55);
    const legs = M.metal(c.legs, 0.5, 0.5);
    k.rbox(0.12, 0.1, size.d - 0.04, 0.02, wood, 0, size.h - 0.1, 0);
    for (const z of [-size.d / 2 + 0.25, size.d / 2 - 0.25]) {
      for (const s of [-1, 1]) k.beam([s * 0.25, 0.03, z], [0, size.h - 0.1, z], 0.05, 0.05, legs, 0.01);
      k.box(0.56, 0.03, 0.08, legs, 0, 0, z);
    }
    return k.g;
  },
  draw2d: (ctx, c, size = beam.size) =>
    sym(ctx, () => {
      for (const z of [-size.d / 2 + 0.25, size.d / 2 - 0.25]) D.rr(ctx, 0, z, 0.56, 0.08, 0, tint(c.legs, 0.4), INK, LINE_THIN);
      D.rr(ctx, 0, 0, 0.12, size.d - 0.04, 0.02, tint(c.beam, 0.2), INK);
    }),
};

/* ===================================================================== tyre run */

const tyres: FurnitureDef = {
  id: 'pk-tyre-run',
  name: 'מסלול צמיגים',
  category: 'playground',
  group: GROUP,
  tags: [...TAGS, 'צמיגים'],
  size: { w: 1.4, d: 3.1, h: 0.16 },
  resize: { w: [0.7, 3], d: [1.2, 6] },
  parametric: true,
  colors: [slot('tyre', 'צמיגים', '#26272a'), slot('paint', 'צבע', '#f2c14a')],
  build: ({ colors: c, size = tyres.size }) => {
    const k = new Kit();
    const rubber = M.rubber(c.tyre);
    const paint = M.paint(c.paint, 0.6);
    tyreCenters(size).forEach(([x, z], i) => {
      k.ring(TYRE_R - 0.075, 0.075, i % 3 === 0 ? paint : rubber, x, 0.077, z, 20);
    });
    return k.g;
  },
  draw2d: (ctx, c, size = tyres.size) =>
    sym(ctx, () => {
      tyreCenters(size).forEach(([x, z], i) => {
        D.circle(ctx, x, z, TYRE_R, i % 3 === 0 ? tint(c.paint, 0.2) : '#55575c', INK, LINE_THIN);
        D.circle(ctx, x, z, TYRE_R - 0.13, '#d8d2c2', INK_SOFT, LINE_THIN);
      });
    }),
};

/* ===================================================================== climbing tower */

const tower: FurnitureDef = {
  id: 'pk-climb-tower',
  name: 'מגדל טיפוס עם קיר',
  category: 'playground',
  group: GROUP,
  tags: [...TAGS, 'קיר טיפוס', 'מגדל'],
  size: { w: 2, d: 2.4, h: 2.6 },
  resize: false,
  colors: [slot('wall', 'קיר', '#3d8fd6'), slot('holds', 'אחיזות', '#ff7a1a'), slot('wood', 'עץ', '#c98d4a')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const size = tower.size;
    const hd = size.d / 2;
    const hw = size.w / 2;
    const wood = M.wood(c.wood, 0.6);
    const surf = towerSurfaces(size);
    const top = surf[0].top!;
    // posts
    for (const x of [-hw + 0.05, hw - 0.05]) for (const z of [hd - 0.05, hd - TOWER.depth + 0.05]) k.box(0.1, size.h, 0.1, wood, x, 0, z);
    // deck and steps
    k.box(size.w, 0.08, TOWER.depth, wood, 0, top - 0.08, hd - TOWER.depth / 2);
    for (const s of surf.slice(1)) k.box(size.w - 0.1, s.top!, s.hd * 2 - 0.02, wood, 0, 0, s.cz);
    // railings on the sides
    const rail = M.metal('#3a3f46', 0.4, 0.7);
    for (const x of [-hw + 0.05, hw - 0.05]) {
      k.rod([x, top + 0.75, hd - 0.05], [x, top + 0.75, hd - TOWER.depth + 0.05], 0.025, rail, 0.025, 8);
      k.rod([x, top + 0.4, hd - 0.05], [x, top + 0.4, hd - TOWER.depth + 0.05], 0.02, rail, 0.02, 8);
    }
    // climbing wall with holds on the front
    k.box(size.w - 0.2, top, 0.06, M.paint(c.wall, 0.55), 0, 0, hd - 0.1);
    const holds = M.plastic(c.holds);
    const holds2 = M.plastic(darken(c.wall, 0.35));
    let seed = 7;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 22; i++) {
      const x = -hw + 0.25 + r() * (size.w - 0.5);
      const y = 0.2 + r() * (top - 0.3);
      k.sphere(0.035 + r() * 0.03, i % 3 ? holds : holds2, x, y, hd - 0.06, 1, 0.7, 0.6, 8);
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const size = tower.size;
      box2d(ctx, size, tint(c.wood, 0.45));
      for (const s of towerSurfaces(size).slice(1)) D.line(ctx, -size.w / 2, s.cz + s.hd, size.w / 2, s.cz + s.hd, INK_SOFT, LINE_THIN);
      D.box(ctx, -size.w / 2 + 0.1, size.d / 2 - 0.06, size.w / 2 - 0.1, size.d / 2, 0, c.wall, INK, LINE_THIN);
    }),
};

/* ===================================================================== cargo net */

const net: FurnitureDef = {
  id: 'pk-cargo-net',
  name: 'רשת טיפוס',
  category: 'playground',
  group: GROUP,
  tags: [...TAGS, 'רשת', 'חבלים'],
  size: { w: 2.4, d: 2.2, h: 2.3 },
  resize: false,
  colors: [slot('rope', 'חבלים', '#e8d9b0'), slot('frame', 'מסגרת', '#8a5a33')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { w, d, h } = net.size;
    const hw = w / 2;
    const hd = d / 2;
    const frame = M.wood(c.frame, 0.6);
    const rope = M.fabric(c.rope, 30);
    for (const x of [-hw + 0.06, hw - 0.06]) {
      k.box(0.1, 0.06, d - 0.04, frame, x, 0, 0);
      k.beam([x, 0.03, hd - 0.07], [x, h - 0.07, 0], 0.09, 0.09, frame, 0.01);
      k.beam([x, 0.03, -hd + 0.07], [x, h - 0.07, 0], 0.09, 0.09, frame, 0.01);
    }
    k.rod([-hw, h - 0.06, 0], [hw, h - 0.06, 0], 0.05, frame, 0.05, 10);
    for (const s of [1, -1]) {
      k.rod([-hw + 0.1, 0.08, s * (hd - 0.08)], [hw - 0.1, 0.08, s * (hd - 0.08)], 0.04, frame, 0.04, 8);
      // vertical ropes
      for (let i = 0; i <= 7; i++) {
        const x = -hw + 0.12 + (i / 7) * (w - 0.24);
        k.rod([x, 0.08, s * (hd - 0.08)], [x, h - 0.05, 0], 0.012, rope, 0.012, 5);
      }
      // horizontal ropes
      for (let j = 1; j <= 6; j++) {
        const f = j / 7;
        const y = 0.08 + f * (h - 0.13);
        const z = s * (hd - 0.08) * (1 - f);
        k.rod([-hw + 0.12, y, z], [hw - 0.12, y, z], 0.012, rope, 0.012, 5);
      }
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { w, d } = net.size;
      box2d(ctx, net.size, tint(c.rope, 0.3));
      for (let i = 0; i <= 7; i++) {
        const x = -w / 2 + 0.12 + (i / 7) * (w - 0.24);
        D.line(ctx, x, -d / 2, x, d / 2, INK_SOFT, LINE_THIN);
      }
      D.line(ctx, -w / 2, 0, w / 2, 0, c.frame, 0.08);
    }),
};

/* ===================================================================== monkey bars */

const monkey: FurnitureDef = {
  id: 'pk-monkey-bars',
  name: 'סולם קופים עם במות',
  category: 'playground',
  group: GROUP,
  tags: [...TAGS, 'סולם קופים', 'תלייה'],
  size: { w: 1.1, d: 4.4, h: 2.4 },
  resize: { d: [3, 7] },
  parametric: true,
  colors: [slot('frame', 'מסגרת', '#2f9a55'), slot('rungs', 'שלבים', '#f2b824'), slot('mat', 'מזרן', '#3d7fd6')],
  build: ({ colors: c, size = monkey.size }) => {
    const k = new Kit();
    const hd = size.d / 2;
    const hw = size.w / 2;
    const frame = M.metal(c.frame, 0.45, 0.4);
    const rung = M.metal(c.rungs, 0.4, 0.4);
    for (const s of [1, -1]) {
      padBox(k, size.w, MONKEY.platform, MONKEY.top, '#c98d4a', '#e8503a', 0, s * (hd - MONKEY.platform / 2));
      for (const x of [-hw + 0.04, hw - 0.04]) k.rod([x, 0, s * (hd - 0.04)], [x, MONKEY.barY + 0.05, s * (hd - 0.04)], 0.035, frame, 0.035, 10);
    }
    for (const x of [-hw + 0.04, hw - 0.04]) k.rod([x, MONKEY.barY, -hd + 0.04], [x, MONKEY.barY, hd - 0.04], 0.03, frame, 0.03, 10);
    for (const z of monkeyRungs(size)) k.rod([-hw + 0.04, MONKEY.barY, z], [hw - 0.04, MONKEY.barY, z], 0.018, rung, 0.018, 8);
    // soft mat under the bars
    const span = size.d - 2 * MONKEY.platform;
    k.rbox(size.w - 0.04, 0.06, span - 0.04, 0.025, M.fabric(c.mat, 8), 0, 0, 0);
    return k.g;
  },
  draw2d: (ctx, c, size = monkey.size) =>
    sym(ctx, () => {
      box2d(ctx, size, tint(c.mat, 0.45));
      for (const s of [1, -1]) D.rr(ctx, 0, s * (size.d / 2 - MONKEY.platform / 2), size.w, MONKEY.platform, 0, '#e9b59a', INK, LINE_THIN);
      for (const z of monkeyRungs(size)) D.line(ctx, -size.w / 2, z, size.w / 2, z, c.rungs, 0.03);
    }),
};

/* ===================================================================== zip-line */

const zipline: FurnitureDef = {
  id: 'pk-zipline',
  name: 'אומגה',
  category: 'playground',
  group: GROUP,
  tags: [...TAGS, 'אומגה', 'כבל', 'זיפליין'],
  size: { w: 1.4, d: 14, h: 3.8 },
  resize: { d: [8, 22] },
  parametric: true,
  colors: [slot('wood', 'עץ', '#b98049'), slot('cable', 'כבל', '#4a4d52')],
  build: ({ colors: c, size = zipline.size }) => {
    const k = new Kit();
    const wood = M.wood(c.wood, 0.6);
    const surf = zipSurfaces(size);
    const cab = zipCable(size);
    // steps and platform
    for (const s of surf.slice(0, ZIP.steps)) k.box(s.hw * 2, s.top!, s.hd * 2 - 0.02, wood, 0, 0, s.cz);
    const pf = surf[ZIP.steps];
    k.box(pf.hw * 2, 0.08, pf.hd * 2, wood, 0, pf.top! - 0.08, pf.cz);
    for (const x of [-pf.hw + 0.05, pf.hw - 0.05]) for (const z of [pf.cz - pf.hd + 0.05, pf.cz + pf.hd - 0.05]) k.box(0.1, pf.top! - 0.08, 0.1, wood, x, 0, z);
    // the tall pole holding the cable, railing on the platform
    // (beside the platform, so that it never hides the rider from a camera behind them)
    const px = pf.hw - 0.08;
    k.box(0.16, size.h, 0.16, wood, px, 0, pf.cz - pf.hd + 0.08);
    k.box(px + 0.1, 0.12, 0.12, wood, px / 2 - 0.05, cab.y0 + 0.05, pf.cz - pf.hd + 0.08);
    const rail = M.metal('#3a3f46', 0.4, 0.7);
    for (const x of [-pf.hw + 0.05, pf.hw - 0.05]) {
      k.rod([x, pf.top!, pf.cz - pf.hd + 0.05], [x, pf.top! + 0.9, pf.cz - pf.hd + 0.05], 0.02, rail, 0.02, 6);
      k.rod([x, pf.top! + 0.9, pf.cz - pf.hd + 0.05], [x, pf.top! + 0.9, pf.cz + pf.hd - 0.05], 0.02, rail, 0.02, 6);
    }
    // end post with a soft bumper
    const hd = size.d / 2;
    k.box(0.16, cab.y1 + 0.35, 0.16, wood, 0, 0, hd - 0.12);
    k.rbox(0.3, 0.3, 0.12, 0.04, M.fabric('#e8503a', 8), 0, cab.y1 - 0.4, hd - 0.26);
    // cable with a gentle sag (a few straight pieces)
    const cable = M.metal(c.cable, 0.4, 0.9);
    const n = 8;
    const at = (t: number): [number, number, number] => {
      const z = cab.z0 - 0.3 + (cab.z1 + 0.3 - (cab.z0 - 0.3)) * t;
      const y = cab.y0 + 0.15 + (cab.y1 + 0.1 - cab.y0 - 0.15) * t - Math.sin(Math.PI * t) * 0.25;
      return [0, y, z];
    };
    for (let i = 0; i < n; i++) k.rod(at(i / n), at((i + 1) / n), 0.008, cable, 0.008, 5);
    return k.g;
  },
  draw2d: (ctx, c, size = zipline.size) =>
    sym(ctx, () => {
      const surf = zipSurfaces(size);
      for (const s of surf.slice(0, ZIP.steps + 1)) D.rr(ctx, s.cx, s.cz, s.hw * 2, s.hd * 2, 0, tint(c.wood, 0.4), INK, LINE_THIN);
      D.rr(ctx, 0, size.d / 2 - 0.12, 0.16, 0.16, 0, tint(c.wood, 0.1), INK, LINE_THIN);
      D.line(ctx, 0, -size.d / 2 + 2, 0, size.d / 2 - 0.2, c.cable, 0.03);
    }),
};

/* ===================================================================== stepping stone, hurdle, tunnel */

const stone: FurnitureDef = {
  id: 'pk-stepping-stone',
  name: 'אבן קפיצה',
  category: 'playground',
  group: GROUP,
  tags: [...TAGS, 'אבן', 'מים', 'קפיצה'],
  size: { w: 0.7, d: 0.7, h: 0.3 },
  resize: { w: [0.4, 1.2], d: [0.4, 1.2], h: [0.15, 0.7], linked: true },
  parametric: true,
  colors: [slot('stone', 'אבן', '#9c968a')],
  build: ({ colors: c, size = stone.size }) => {
    const k = new Kit();
    const r = size.w / 2;
    k.lathe(
      [
        [0, 0],
        [r * 0.92, 0],
        [r, size.h * 0.35],
        [r * 0.96, size.h * 0.85],
        [r * 0.8, size.h],
        [0, size.h],
      ],
      M.stone(c.stone, 0.8),
      0,
      0,
      0,
      14,
    );
    return k.g;
  },
  draw2d: (ctx, c, size = stone.size) => sym(ctx, () => D.circle(ctx, 0, 0, size.w / 2, tint(c.stone, 0.3), INK)),
};

const hurdle: FurnitureDef = {
  id: 'pk-hurdle',
  name: 'משוכה',
  category: 'playground',
  group: GROUP,
  tags: [...TAGS, 'משוכה', 'ריצה'],
  size: { w: 1.2, d: 0.5, h: 0.45 },
  resize: { w: [0.8, 2.4], h: [0.3, 0.55] },
  parametric: true,
  colors: [slot('bar', 'מוט', '#e8433a'), slot('frame', 'מסגרת', '#e9e7e2')],
  build: ({ colors: c, size = hurdle.size }) => {
    const k = new Kit();
    const frame = M.metal(c.frame, 0.4, 0.5);
    const hw = size.w / 2;
    for (const s of [-1, 1]) {
      k.rod([s * (hw - 0.03), 0, 0], [s * (hw - 0.03), size.h, 0], 0.02, frame, 0.02, 8);
      k.box(0.05, 0.03, size.d, frame, s * (hw - 0.03), 0, 0);
    }
    const n = 6;
    for (let i = 0; i < n; i++) {
      const x0 = -hw + 0.03 + ((size.w - 0.06) * i) / n;
      k.box((size.w - 0.06) / n, 0.08, 0.02, M.paint(i % 2 ? c.frame : c.bar, 0.5), x0 + (size.w - 0.06) / n / 2, size.h - 0.08, 0);
    }
    return k.g;
  },
  draw2d: (ctx, c, size = hurdle.size) =>
    sym(ctx, () => {
      for (const s of [-1, 1]) D.rr(ctx, s * (size.w / 2 - 0.03), 0, 0.05, size.d, 0, '#ddd', INK, LINE_THIN);
      D.rr(ctx, 0, 0, size.w - 0.06, 0.04, 0, c.bar, INK, LINE_THIN);
    }),
};

const tunnel: FurnitureDef = {
  id: 'pk-tunnel',
  name: 'מנהרת זחילה',
  category: 'playground',
  group: GROUP,
  tags: [...TAGS, 'מנהרה', 'זחילה'],
  size: { w: 1.1, d: 3, h: 0.95 },
  resize: { d: [1.5, 5] },
  parametric: true,
  colors: [slot('tube', 'צינור', '#f08a24'), slot('rims', 'שוליים', '#2f7fd0')],
  build: ({ colors: c, size = tunnel.size }) => {
    const k = new Kit();
    const r = size.h / 2;
    const mat = cachedMat(`pk-tunnel|${c.tube}`, () => new THREE.MeshStandardMaterial({ color: c.tube, roughness: 0.5, side: THREE.DoubleSide }));
    const tube = k.geo(new THREE.CylinderGeometry(r - 0.02, r - 0.02, size.d - 0.1, 18, 1, true), mat, 0, r, 0);
    tube.rotation.x = Math.PI / 2;
    for (const s of [1, -1]) {
      const ring = k.add(new THREE.Mesh(new THREE.TorusGeometry(r - 0.05, 0.045, 8, 20), M.plastic(c.rims)), 0, r, s * (size.d / 2 - 0.05));
      ring.castShadow = true;
    }
    // ribs and sand-bag feet
    for (let i = 1; i < 4; i++) {
      const z = -size.d / 2 + (size.d * i) / 4;
      const rib = k.add(new THREE.Mesh(new THREE.TorusGeometry(r - 0.03, 0.025, 6, 20), M.plastic(c.rims)), 0, r, z);
      rib.castShadow = true;
    }
    for (const s of [-1, 1]) k.rbox(0.18, 0.1, size.d * 0.6, 0.04, M.fabric('#6b6152', 8), s * (r - 0.05), 0, 0);
    return k.g;
  },
  draw2d: (ctx, c, size = tunnel.size) =>
    sym(ctx, () => {
      box2d(ctx, { ...size, w: size.h }, tint(c.tube, 0.3));
      for (const s of [1, -1]) D.line(ctx, -size.h / 2, s * (size.d / 2 - 0.05), size.h / 2, s * (size.d / 2 - 0.05), c.rims, 0.06);
    }),
};

/* ===================================================================== lane rope */

const laneRope: FurnitureDef = {
  id: 'pk-lane-rope',
  name: 'חבל סימון מסלול',
  category: 'playground',
  group: GROUP,
  tags: [...TAGS, 'חבל', 'גדר', 'נתיב', 'מחסום'],
  size: { w: 6, d: 0.12, h: 0.9 },
  resize: { w: [1, 16], h: [0.6, 1.2] },
  parametric: true,
  colors: [slot('rope', 'חבל', '#e8433a'), slot('posts', 'עמודים', '#f4f2ec')],
  build: ({ colors: c, size = laneRope.size }) => {
    const k = new Kit();
    const hw = size.w / 2 - 0.04;
    const n = Math.max(1, Math.ceil((size.w - 0.08) / 2));
    const post = M.plastic(c.posts);
    const base = M.plastic(darken(c.posts, 0.35));
    const rope = M.fabric(c.rope, 20);
    for (let i = 0; i <= n; i++) {
      const x = -hw + (2 * hw * i) / n;
      k.cyl(0.05, 0.04, base, x, 0, 0, 0.05, 10);
      k.cyl(0.022, size.h - 0.02, post, x, 0, 0, 0.02, 8);
      k.sphere(0.03, M.plastic(c.rope), x, size.h - 0.02, 0, 1, 1, 1, 8);
    }
    for (const y of [size.h - 0.06, size.h * 0.55]) {
      for (let i = 0; i < n; i++) {
        const x0 = -hw + (2 * hw * i) / n;
        const x1 = -hw + (2 * hw * (i + 1)) / n;
        const xm = (x0 + x1) / 2;
        k.rod([x0, y, 0], [xm, y - 0.04, 0], 0.01, rope, 0.01, 5);
        k.rod([xm, y - 0.04, 0], [x1, y, 0], 0.01, rope, 0.01, 5);
      }
    }
    return k.g;
  },
  draw2d: (ctx, c, size = laneRope.size) =>
    sym(ctx, () => {
      const hw = size.w / 2 - 0.04;
      const n = Math.max(1, Math.ceil((size.w - 0.08) / 2));
      D.line(ctx, -hw, 0, hw, 0, c.rope, 0.04);
      for (let i = 0; i <= n; i++) D.circle(ctx, -hw + (2 * hw * i) / n, 0, 0.05, '#fff', INK, LINE_THIN);
    }),
};

/* ===================================================================== arches and checkpoint flags */

function arch(id: string, name: string, text: string, bg: string, checkered: boolean): FurnitureDef {
  const def: FurnitureDef = {
    id,
    name,
    category: 'playground',
    group: GROUP,
    tags: [...TAGS, 'שער', checkered ? 'סיום' : 'זינוק', 'קו'],
    size: { w: 3.4, d: 0.3, h: 2.8 },
    resize: { w: [2.2, 6] },
    parametric: true,
    colors: [slot('banner', 'שלט', bg), slot('posts', 'עמודים', '#f4f2ec')],
    build: ({ colors: c, size = def.size }) => {
      const k = new Kit();
      const hw = size.w / 2;
      const posts = M.plastic(c.posts);
      for (const s of [-1, 1]) {
        k.cyl(0.11, size.h - 0.1, posts, s * (hw - 0.17), 0, 0, 0.1, 14);
        k.cyl(0.145, 0.08, M.plastic(darken(c.posts, 0.3)), s * (hw - 0.17), 0, 0, 0.145, 14);
      }
      const bw = size.w - 0.1;
      const bh = 0.55;
      k.box(bw, bh, 0.12, M.plastic(c.banner), 0, size.h - bh, 0);
      const map = canvasTex(`${id}|${c.banner}`, 512, 96, (cx, w, h) => drawBanner(cx, w, h, text, c.banner, '#ffffff', checkered));
      if (map) {
        const mat = cachedMat(`${id}|banner|${c.banner}`, () => new THREE.MeshStandardMaterial({ map, roughness: 0.6 }));
        for (const s of [1, -1]) {
          const m = k.geo(new THREE.PlaneGeometry(bw - 0.04, bh - 0.04), mat, 0, size.h - bh / 2, s * 0.062);
          if (s < 0) m.rotation.y = Math.PI;
        }
      }
      return k.g;
    },
    draw2d: (ctx, c, size = def.size) =>
      sym(ctx, () => {
        for (const s of [-1, 1]) D.circle(ctx, s * (size.w / 2 - 0.12), 0, 0.13, '#eee', INK, LINE_THIN);
        D.rr(ctx, 0, 0, size.w - 0.1, 0.12, 0, c.banner, INK, LINE_THIN);
      }),
  };
  return def;
}

const FLAG_COLORS = ['#e8433a', '#f08a24', '#e8c531', '#3aa35b', '#2a8fb5', '#2f5fd0', '#8a46d8', '#c23bb0'];

function checkpoint(n: number): FurnitureDef {
  const def: FurnitureDef = {
    id: `pk-checkpoint-${n}`,
    name: `דגל ביקורת ${n}`,
    category: 'playground',
    group: GROUP,
    tags: [...TAGS, 'דגל', 'נקודת ביקורת', 'צ\'קפוינט', String(n)],
    size: { w: 0.9, d: 0.4, h: 2.5 },
    resize: false,
    colors: [slot('flag', 'דגל', FLAG_COLORS[(n - 1) % FLAG_COLORS.length])],
    build: ({ colors: c }) => {
      const k = new Kit();
      const pole = M.metal('#d8dadc', 0.3, 0.9);
      const px = -0.26;
      k.cyl(0.18, 0.06, M.stone('#7d7a74', 0.8), px, 0, 0, 0.16, 14);
      k.cyl(0.022, 2.36, pole, px, 0.06, 0, 0.018, 10);
      k.sphere(0.04, M.brass(), px, 2.44, 0, 1, 1, 1, 10);
      const fw = 0.66;
      const fh = 0.52;
      k.box(fw, fh, 0.012, M.fabric(c.flag, 6), px + fw / 2 + 0.02, 2.4 - fh, 0);
      const map = canvasTex(`pk-cp|${n}|${c.flag}`, 128, 96, (cx, w, h) => drawNumber(cx, w, h, String(n), c.flag, '#ffffff'));
      if (map) {
        const mat = cachedMat(`pk-cp|${n}|${c.flag}`, () => new THREE.MeshStandardMaterial({ map, roughness: 0.8, side: THREE.DoubleSide }));
        for (const s of [1, -1]) {
          const m = k.geo(new THREE.PlaneGeometry(fw - 0.02, fh - 0.02), mat, px + fw / 2 + 0.02, 2.4 - fh / 2, s * 0.0075);
          if (s < 0) m.rotation.y = Math.PI;
        }
      }
      return k.g;
    },
    draw2d: (ctx, c) =>
      sym(ctx, () => {
        D.circle(ctx, -0.26, 0, 0.17, '#bbb', INK, LINE_THIN);
        D.rr(ctx, 0.09, 0, 0.66, 0.06, 0, c.flag, INK, LINE_THIN);
        ctx.save();
        ctx.fillStyle = INK;
        ctx.font = 'bold 0.28px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(n), 0.05, 0.03);
        ctx.restore();
      }),
  };
  return def;
}

export const PARKOUR_ITEMS: FurnitureDef[] = [
  platform,
  steps,
  beam,
  tyres,
  tower,
  net,
  monkey,
  zipline,
  stone,
  hurdle,
  tunnel,
  laneRope,
  arch('pk-start-arch', 'שער זינוק', 'זינוק', '#3aa35b', false),
  arch('pk-finish-arch', 'שער סיום', 'סיום', '#e8433a', true),
  ...[1, 2, 3, 4, 5, 6, 7, 8].map(checkpoint),
];

