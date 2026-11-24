/** Team D catalog items: an outdoor concert stage (deck, lighting truss, PA speakers, LED screen, crowd barrier). */
import * as THREE from 'three';
import type { FurnitureDef } from '../types';
import { D, INK_SOFT, Kit, M, darken, sym, tint, type V3 } from '../kit';
import { slot } from './_parts';
import { canvasMat } from './_street_shared';

const GROUP = 'במה והופעות';

/* ------------------------------------------------------------------ stage deck */

/** Deck top at `top`; the audience is at +Z. */
export const STAGE = { w: 12, d: 7, top: 1.0 };

const stage: FurnitureDef = {
  id: 'concert-stage',
  name: 'במת הופעות',
  category: 'entertainment',
  group: GROUP,
  tags: ['במה', 'הופעה', 'קונצרט', 'מופע', 'ריקוד'],
  size: { w: STAGE.w, d: STAGE.d, h: STAGE.top + 0.4 },
  colors: [slot('deck', 'רצפת הבמה', '#26272c'), slot('skirt', 'וילון', '#14151a'), slot('edge', 'פס תאורה', '#b46cff')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { w, d, top } = STAGE;
    // scaffold under a black skirt
    k.box(w - 0.1, top - 0.06, d - 0.1, M.fabric(c.skirt, 10), 0, 0, 0);
    // deck boards
    const deck = M.wood(c.deck, 0.75);
    const n = 8;
    for (let i = 0; i < n; i++) k.box(w / n - 0.01, 0.06, d, deck, -w / 2 + (i + 0.5) * (w / n), top - 0.06, 0);
    // front LED edge strip and the skirt's pleats
    k.box(w, 0.04, 0.04, M.glow(c.edge, 2.0, c.edge), 0, top - 0.1, d / 2 - 0.02);
    const pleat = M.fabric(darken(c.skirt, 0.2), 10);
    for (let x = -w / 2 + 0.25; x < w / 2; x += 0.5) k.box(0.05, top - 0.14, 0.03, pleat, x, 0.02, d / 2 - 0.065);
    // gaffer marks in the middle (where the dancer stands)
    const tape = M.matte('#f2d94a');
    k.box(0.5, 0.003, 0.05, tape, 0, top, 1.0);
    k.box(0.05, 0.003, 0.5, tape, 0, top, 1.0);
    // monitor wedges at the front edge
    const wedge = M.matte('#1b1c20');
    for (const x of [-1.6, 1.6]) {
      const m = k.box(0.6, 0.32, 0.42, wedge, x, top, d / 2 - 0.4);
      m.rotation.x = -0.35;
      k.box(0.5, 0.2, 0.01, M.fabric('#2d2f35', 30), x, top + 0.08, d / 2 - 0.15).rotation.x = -0.35;
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { w, d } = STAGE;
      D.box(ctx, -w / 2, -d / 2, w / 2, d / 2, 0, tint(c.deck, 0.55));
      for (let i = 1; i < 8; i++) D.line(ctx, -w / 2 + (i * w) / 8, -d / 2, -w / 2 + (i * w) / 8, d / 2, INK_SOFT, 0.01);
      D.line(ctx, -w / 2, d / 2, w / 2, d / 2, tint(c.edge, 0.1), 0.1);
    }),
};

/* ------------------------------------------------------------------ lighting truss */

/** Lighting truss over a stage: towers at x = ±tower, top beam at `beamY`, par cans hang at `cans`. */
export const TRUSS = { w: 12.8, d: 0.7, h: 7.2, tower: 6.15, beamY: 6.8, cans: [-4.5, -3, -1.5, 0, 1.5, 3, 4.5], canY: 6.35 };
export const TRUSS_COLORS = ['#ff3b7f', '#3bc3ff', '#ffd23b', '#9b5cff', '#3bff9a', '#ff7b2e', '#ff3b7f'];

function lattice(k: Kit, a: V3, b: V3, size: number, mat: THREE.Material, step = 0.5): void {
  // a square truss between two points along one axis (x or y)
  const dir: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = Math.hypot(...dir);
  const ax = Math.abs(dir[0]) > Math.abs(dir[1]) ? 0 : 1;
  const u = ax === 0 ? [0, 1, 0] : [1, 0, 0];
  const v = [0, 0, 1];
  const h = size / 2;
  const corner = (p: V3, i: number): V3 => {
    const su = i & 1 ? h : -h;
    const sv = i & 2 ? h : -h;
    return [p[0] + u[0] * su + v[0] * sv, p[1] + u[1] * su + v[1] * sv, p[2] + u[2] * su + v[2] * sv];
  };
  for (let i = 0; i < 4; i++) k.rod(corner(a, i), corner(b, i), 0.024, mat, 0.024, 6);
  const n = Math.max(1, Math.round(len / step));
  const at = (t: number): V3 => [a[0] + dir[0] * t, a[1] + dir[1] * t, a[2] + dir[2] * t];
  const faces = [
    [0, 1],
    [1, 3],
    [3, 2],
    [2, 0],
  ];
  for (let s = 0; s < n; s++) {
    const p0 = at(s / n);
    const p1 = at((s + 1) / n);
    for (const [i, j] of faces) k.rod(corner(p0, s % 2 ? i : j), corner(p1, s % 2 ? j : i), 0.011, mat, 0.011, 4);
  }
}

const truss: FurnitureDef = {
  id: 'stage-truss',
  name: 'גשר תאורה לבמה',
  category: 'entertainment',
  group: GROUP,
  tags: ['טראס', 'תאורה', 'במה', 'פנסים', 'הופעה'],
  size: { w: TRUSS.w, d: TRUSS.d, h: TRUSS.h },
  colors: [slot('metal', 'מתכת', '#c3c7cc')],
  light: { x: 0, y: TRUSS.canY - 0.3, z: 0.6, color: '#d9b8ff', intensity: 900, distance: 26 },
  actions: [{ kind: 'light', label: 'להדליק את תאורת הבמה' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const metal = M.metal(c.metal, 0.35, 0.95);
    const { tower, beamY } = TRUSS;
    const s = 0.4;
    for (const x of [-tower, tower]) {
      k.box(0.48, 0.04, 0.6, M.metal('#3a3d42', 0.5, 0.7), x, 0, 0);
      lattice(k, [x, 0.04, 0], [x, beamY - s / 2, 0], s, metal);
      k.box(s + 0.06, 0.06, s + 0.06, metal, x, beamY - s / 2 - 0.03, 0);
    }
    lattice(k, [-tower - s / 2, beamY, 0], [tower + s / 2, beamY, 0], s, metal);
    // par cans with coloured lenses (part 'glow' so the switch dims them)
    const glow = k.part('glow', 0, 0, 0);
    const can = M.metal('#1c1d21', 0.5, 0.6);
    TRUSS.cans.forEach((x, i) => {
      k.rod([x, beamY - s / 2, 0], [x, TRUSS.canY + 0.2, 0], 0.012, can, 0.012, 5);
      const body = k.cyl(0.11, 0.3, can, x, TRUSS.canY - 0.1, 0, 0.12, 12);
      // the can points down and forward (towards the audience)
      body.rotation.x = -0.9;
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.1, 14), M.glow(TRUSS_COLORS[i], 2.4, TRUSS_COLORS[i]));
      lens.position.set(x, TRUSS.canY - 0.05, 0.125);
      lens.rotation.x = Math.PI / 2 - 0.9;
      glow.g.add(lens);
    });
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { tower } = TRUSS;
      for (const x of [-tower, tower]) D.rr(ctx, x, 0, 0.62, 0.62, 0, tint(c.metal, 0.3));
      D.box(ctx, -tower, -0.2, tower, 0.2, 0, null, INK_SOFT, 0.012);
      for (let x = -tower; x < tower; x += 0.5) D.line(ctx, x, -0.2, x + 0.5, 0.2, INK_SOFT, 0.006);
    }),
};

/* ------------------------------------------------------------------ PA speaker stack */

const speaker: FurnitureDef = {
  id: 'stage-speaker',
  name: 'רמקול הגברה לבמה',
  category: 'entertainment',
  group: GROUP,
  tags: ['רמקול', 'הגברה', 'במה', 'סאונד', 'מוזיקה'],
  size: { w: 1.1, d: 0.85, h: 2.5 },
  colors: [slot('box', 'ארגז', '#1c1d21')],
  actions: [{ kind: 'music', variant: 'electro' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const box = M.matte(c.box);
    const grill = M.fabric('#26282d', 30);
    const cone = M.rubber('#121316');
    const pulse = k.part('pulse', 0, 0, 0.36);
    // sub + two tops
    k.rbox(1.08, 1.05, 0.8, 0.02, box, 0, 0, 0, 1);
    k.box(0.96, 0.92, 0.02, grill, 0, 0.06, 0.4);
    for (const x of [-0.24, 0.24]) {
      const g = new THREE.CircleGeometry(0.2, 18);
      pulse.geo(g, cone, x, 0.52, 0.065);
    }
    for (const [y, w] of [
      [1.08, 1.0],
      [1.8, 0.9],
    ] as const) {
      k.rbox(w, 0.68, 0.7, 0.02, box, 0, y, -0.02, 1);
      k.box(w - 0.1, 0.56, 0.02, grill, 0, y + 0.06, 0.34);
      pulse.geo(new THREE.CircleGeometry(0.15, 16), cone, -0.18, y + 0.34 - 0.0, 0.0);
      pulse.geo(new THREE.CircleGeometry(0.07, 12), M.metal('#9aa0a6', 0.3, 0.9), 0.22, y + 0.38, 0.0);
    }
    k.box(0.06, 0.04, 0.5, M.metal('#6b7075', 0.4, 0.8), 0, 2.48 - 0.04, 0);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 1.08, 0.8, 0.02, tint(c.box, 0.6));
      D.line(ctx, -0.48, 0.4, 0.48, 0.4, INK_SOFT, 0.04);
    }),
};

/* ------------------------------------------------------------------ LED screen */

/** Face of the LED wall (local, facing +Z): the dance game shows its visuals on it. */
export const LED = { w: 7.4, d: 0.8, h: 6.6, faceY: 4.0, faceW: 7.0, faceH: 4.0, faceZ: 0.14 };

const ledScreen: FurnitureDef = {
  id: 'led-screen',
  name: 'מסך לד ענק',
  category: 'entertainment',
  group: GROUP,
  tags: ['מסך', 'לד', 'במה', 'הופעה', 'וידאו'],
  size: { w: LED.w, d: LED.d, h: LED.h },
  colors: [slot('frame', 'מסגרת', '#2a2c31')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { w, faceY, faceW, faceH, faceZ } = LED;
    const frame = M.metal(c.frame, 0.5, 0.6);
    for (const s of [-1, 1]) {
      k.box(0.25, faceY + faceH / 2 + 0.3, 0.25, frame, s * (w / 2 - 0.2), 0, -0.1);
      k.box(0.4, 0.05, 0.7, frame, s * (w / 2 - 0.2), 0, -0.05);
    }
    k.box(faceW + 0.2, faceH + 0.2, 0.22, frame, 0, faceY - faceH / 2 - 0.1, -0.02);
    const face = canvasMat(
      'd-led',
      256,
      148,
      (g, cw, ch) => {
        const grad = g.createLinearGradient(0, 0, cw, ch);
        grad.addColorStop(0, '#2a0b4d');
        grad.addColorStop(0.5, '#7a1fa2');
        grad.addColorStop(1, '#0b3a6b');
        g.fillStyle = grad;
        g.fillRect(0, 0, cw, ch);
        g.fillStyle = 'rgba(0,0,0,0.25)';
        for (let x = 0; x < cw; x += 4) g.fillRect(x, 0, 1, ch);
        for (let y = 0; y < ch; y += 4) g.fillRect(0, y, cw, 1);
      },
      { fallback: '#3b1a6b', emissive: 0.8 },
    );
    k.geo(new THREE.PlaneGeometry(faceW, faceH), face, 0, faceY, faceZ);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, LED.faceW + 0.2, 0.22, 0, tint(c.frame, 0.5));
      for (const s of [-1, 1]) D.rr(ctx, s * (LED.w / 2 - 0.2), -0.05, 0.7, 0.7, 0, null, INK_SOFT, 0.01);
    }),
};

/* ------------------------------------------------------------------ crowd barrier */

const barrier: FurnitureDef = {
  id: 'crowd-barrier',
  name: 'מחסום קהל ממתכת',
  category: 'street',
  group: GROUP,
  tags: ['מחסום', 'גדר', 'קהל', 'הופעה', 'אירוע'],
  size: { w: 2.2, d: 0.7, h: 1.1 },
  colors: [slot('metal', 'מתכת', '#b9bec4')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const m = M.metal(c.metal, 0.35, 0.9);
    const x = 1.0;
    k.tube(
      [
        [-x, 0.12, 0],
        [-x, 1.0, 0],
        [-x + 0.08, 1.08, 0],
        [x - 0.08, 1.08, 0],
        [x, 1.0, 0],
        [x, 0.12, 0],
      ],
      0.02,
      m,
      { seg: 24, radial: 6, tension: 0.1 },
    );
    k.rod([-x, 0.2, 0], [x, 0.2, 0], 0.015, m, 0.015, 6);
    for (let i = 1; i < 14; i++) {
      const xi = -x + (i * 2 * x) / 14;
      k.rod([xi, 0.2, 0], [xi, 1.06, 0], 0.008, m, 0.008, 4);
    }
    for (const s of [-1, 1]) {
      k.rod([s * (x - 0.15), 0.02, -0.33], [s * (x - 0.15), 0.02, 0.33], 0.02, m, 0.02, 6);
      k.rod([s * (x - 0.15), 0.02, 0], [s * x, 0.15, 0], 0.016, m, 0.016, 6);
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.line(ctx, -1, 0, 1, 0, darken(c.metal, 0.3), 0.04);
      for (const s of [-1, 1]) D.line(ctx, s * 0.85, -0.33, s * 0.85, 0.33, INK_SOFT, 0.03);
    }),
};

export const STAGE_ITEMS: FurnitureDef[] = [stage, truss, speaker, ledScreen, barrier];
