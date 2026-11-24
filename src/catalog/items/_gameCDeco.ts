/**
 * Team C – amusement park dressing: the entrance gate, a ticket booth, food stalls (popcorn, cotton
 * candy, ice cream), a balloon seller's cart, strings of lights and a fairground lamp post.
 */
import * as THREE from 'three';
import { D, INK_SOFT, Kit, LINE_THIN, M, darken, lighten, sym, tint } from '../kit';
import type { FurnitureDef, ItemSize } from '../types';
import { slot } from './_parts';
import { BULB_COLORS, bulbStrip, signMat } from './_gameCKit';

type Colors = Record<string, string>;
const TAU = Math.PI * 2;

/** a striped cone roof (turret / booth): `n` segments alternating two colours */
function stripedCone(k: Kit, r: number, h: number, y: number, a: string, b: string, x = 0, z = 0, n = 12): void {
  for (let i = 0; i < n; i++) {
    const g = new THREE.ConeGeometry(r, h, 3, 1, true, (i / n) * TAU, TAU / n);
    g.translate(0, h / 2, 0);
    k.geo(g, M.paint(i % 2 ? a : b, 0.5), x, y, z);
  }
}

/** a striped awning sloping down to the front with a scalloped valance */
function awning(k: Kit, w: number, d: number, y: number, z: number, a: string, b: string): void {
  const n = Math.max(4, Math.round(w / 0.35));
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + (w * (i + 0.5)) / n;
    const m = k.box(w / n, 0.03, d, M.cloth(i % 2 ? a : b), x, y, z);
    m.rotation.x = 0.32;
    const s = k.cyl(w / n / 2, 0.02, M.cloth(i % 2 ? a : b), x, y - Math.sin(0.32) * d / 2 - 0.12, z + Math.cos(0.32) * d / 2, w / n / 2, 10);
    s.rotation.x = Math.PI / 2;
  }
}

/* ------------------------------------------------------------------ entrance gate */

const GATE = { w: 12.8, d: 2.4, h: 8.4, tw: 1.5, th: 5.2, archY: 5.0 };

const gate: FurnitureDef = {
  id: 'amuse-gate',
  name: 'שער כניסה ללונה פארק',
  category: 'playground',
  group: 'לונה פארק',
  tags: ['לונה פארק', 'שער', 'כניסה', 'קשת', 'שלט'],
  size: { w: GATE.w, d: GATE.d, h: GATE.h },
  resize: false,
  parametric: true,
  colors: [slot('towers', 'מגדלים', '#f4efe2'), slot('roof', 'גגות', '#d8342c'), slot('roof2', 'פסים', '#f2c21b'), slot('sign', 'שלט', '#1d2a6b')],
  light: { x: 0, y: GATE.archY + 1.2, z: 0.8, color: '#ffd9a0', intensity: 80, distance: 18 },
  actions: [{ kind: 'light' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { w, tw, th, archY } = GATE;
    const body = M.paint(c.towers, 0.6);
    const trim = M.paint(c.roof, 0.45);
    const tx = w / 2 - tw / 2 - 0.45;
    for (const s of [-1, 1]) {
      const x = s * tx;
      k.rbox(tw + 0.2, 0.4, tw + 0.2, 0.04, M.stone('#b9b2a4', 0.8), x, 0, 0);
      k.rbox(tw, th - 0.4, tw, 0.05, body, x, 0.4, 0);
      // panels and a little arched window
      k.box(tw + 0.04, 0.16, tw + 0.04, trim, x, 1.6, 0);
      k.box(tw + 0.08, 0.2, tw + 0.08, trim, x, th - 0.2, 0);
      k.rbox(0.5, 0.8, 0.04, 0.2, M.glow('#ffd690', 1.6, '#ffe9b8'), x, 2.6, tw / 2 + 0.005);
      stripedCone(k, tw * 0.78, 2.1, th, c.roof, c.roof2, x, 0, 12);
      k.cyl(0.03, 0.9, M.metal('#d9a93a', 0.3, 0.8), x, th + 2.05, 0, 0.03, 6);
      const flag = k.geo(new THREE.PlaneGeometry(0.6, 0.36), M.cloth(s > 0 ? c.roof2 : c.roof), x + 0.3, th + 2.72, 0);
      flag.castShadow = false;
    }
    // the arch: a curved board between the towers with the park's name
    const span = 2 * tx - tw;
    const arch = new THREE.Shape();
    const r0 = span / 2;
    arch.moveTo(-r0, 0);
    arch.lineTo(-r0, 0.5);
    arch.quadraticCurveTo(0, 2.0, r0, 0.5);
    arch.lineTo(r0, 0);
    arch.quadraticCurveTo(0, 1.4, -r0, 0);
    const ag = new THREE.ExtrudeGeometry(arch, { depth: 0.3, bevelEnabled: false, curveSegments: 20 });
    ag.translate(0, archY, -0.15);
    k.geo(ag, trim);
    k.box(5.6, 1.1, 0.16, M.paint(c.sign, 0.5), 0, archY + 0.45, 0);
    const face = signMat('לונה פארק', c.sign, '#ffe27a', { icon: '🎡', w: 1024, h: 200, border: '#f2c21b', glow: 0.8 });
    for (const sz of [1, -1]) {
      const p = k.geo(new THREE.PlaneGeometry(5.4, 1.0), face, 0, archY + 1.0, sz * 0.085);
      if (sz < 0) p.rotation.y = Math.PI;
      p.castShadow = false;
    }
    // bulbs along the arch top and bottom curves and up the towers
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 30; i++) {
      const t = i / 30;
      const x = -r0 + 2 * r0 * t;
      if (Math.abs(x) > 2.95) pts.push(new THREE.Vector3(x, archY + 0.5 + 3 * t * (1 - t) + 0.08, 0.2));
      pts.push(new THREE.Vector3(x, archY + 2.8 * t * (1 - t) - 0.06, 0.2));
    }
    for (let i = 0; i <= 14; i++) {
      const x = -2.8 + (5.6 * i) / 14;
      pts.push(new THREE.Vector3(x, archY + 1.58, 0.1), new THREE.Vector3(x, archY + 1.58, -0.1));
    }
    for (const s of [-1, 1]) for (let y = 0.8; y < th - 0.3; y += 0.45) pts.push(new THREE.Vector3(s * tx + (s > 0 ? -1 : 1) * (tw / 2 + 0.03), y, tw / 2 + 0.03));
    for (const m of bulbStrip(pts, 0.085, BULB_COLORS, 3.4)) k.g.add(m);
    // turnstiles in the opening
    const steel = M.metal('#c9ccce', 0.3, 0.9);
    for (const x of [-1.6, 0, 1.6]) {
      k.rbox(0.3, 1.0, 0.6, 0.05, steel, x, 0, 0);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU;
        k.rod([x + 0.15, 0.9, 0], [x + 0.15 + Math.cos(a) * 0.5, 0.9 + Math.sin(a) * 0.15, Math.sin(a) * 0.5], 0.025, steel, 0.025, 6);
      }
    }
    k.g.userData.anchors = {
      light: { x: 0, y: GATE.archY + 1.2, z: 0.8 },
      boxes: [-1, 1].map((s) => ({ x: s * tx, z: 0, w: tw + 0.2, d: tw + 0.2, h: th })),
    };
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { w, tw } = GATE;
      const tx = w / 2 - tw / 2 - 0.45;
      for (const s of [-1, 1]) {
        D.box(ctx, s * tx - tw / 2, -tw / 2, s * tx + tw / 2, tw / 2, 0.05, tint(c.towers, 0.2), INK_SOFT, LINE_THIN);
        D.circle(ctx, s * tx, 0, tw * 0.5, tint(c.roof, 0.4), INK_SOFT, LINE_THIN);
      }
      D.box(ctx, -tx + tw / 2, -0.15, tx - tw / 2, 0.15, 0, tint(c.roof, 0.3), INK_SOFT, LINE_THIN);
      for (const x of [-1.6, 0, 1.6]) D.box(ctx, x - 0.15, -0.3, x + 0.15, 0.3, 0, '#c9ccce', INK_SOFT, LINE_THIN);
    }),
};

/* ------------------------------------------------------------------ ticket booth */

const booth: FurnitureDef = {
  id: 'amuse-ticket-booth',
  name: 'קופת כרטיסים',
  category: 'playground',
  group: 'לונה פארק',
  tags: ['לונה פארק', 'קופה', 'כרטיסים', 'ביתן'],
  size: { w: 2.8, d: 2.8, h: 4.2 },
  colors: [slot('body', 'קירות', '#d8342c'), slot('roof', 'גג', '#f2c21b'), slot('trim', 'עיטור', '#f4efe2')],
  light: { x: 0, y: 2.4, z: 1.0, color: '#ffd9a0', intensity: 30, distance: 8 },
  actions: [{ kind: 'light' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const body = M.paint(c.body, 0.5);
    const trim = M.paint(c.trim, 0.5);
    // an octagonal kiosk
    const oct = new THREE.CylinderGeometry(1.0, 1.05, 2.6, 8);
    oct.translate(0, 1.3 + 0.15, 0);
    oct.rotateY(Math.PI / 8);
    k.geo(oct, body);
    k.cyl(1.15, 0.15, M.stone('#b9b2a4', 0.8), 0, 0, 0, 1.15, 8).rotation.y = Math.PI / 8;
    // ticket window (glass with a lit interior)
    k.box(0.9, 0.7, 0.04, M.glass('#cfe6ee', 0.3), 0, 1.15, 0.99);
    k.box(0.86, 0.66, 0.02, M.glow('#ffe2a8', 1.2, '#fff0d0'), 0, 1.17, 0.9);
    k.box(1.1, 0.06, 0.35, trim, 0, 1.08, 1.08);
    k.box(1.06, 0.1, 0.06, trim, 0, 1.85, 1.0);
    k.geo(new THREE.PlaneGeometry(1.2, 0.34), signMat('כרטיסים', '#1d2a6b', '#ffe27a', { icon: '🎟️', w: 512, h: 140, glow: 0.7 }), 0, 2.32, 1.01).castShadow = false;
    k.box(2.1, 0.12, 2.1, trim, 0, 2.75, 0).rotation.y = Math.PI / 8;
    stripedCone(k, 1.25, 1.1, 2.86, c.roof, c.body, 0, 0, 8);
    k.sphere(0.12, M.metal('#d9a93a', 0.3, 0.8), 0, 4.0, 0, 1, 1, 1, 10);
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      pts.push(new THREE.Vector3(Math.sin(a) * 1.12, 2.82, Math.cos(a) * 1.12));
    }
    for (const m of bulbStrip(pts, 0.05, ['#ffd36a', '#ff6a5a'], 3.2)) k.g.add(m);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const pts: Array<[number, number]> = [];
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU + Math.PI / 8;
        pts.push([Math.cos(a) * 1.15, Math.sin(a) * 1.15]);
      }
      D.poly(ctx, pts, true, tint(c.roof, 0.4), INK_SOFT, LINE_THIN);
      D.line(ctx, -0.45, 1.05, 0.45, 1.05, c.body, 0.06);
    }),
};

/* ------------------------------------------------------------------ food stalls */

type StallKind = 'popcorn' | 'cotton' | 'icecream';

const STALL = { w: 3.0, d: 2.0, h: 5.0 };

function stallGoods(k: Kit, kind: StallKind, c: Colors): void {
  const cy = 1.05; // counter top
  if (kind === 'popcorn') {
    // a popcorn machine: red cart with a glass cabinet full of popcorn
    k.rbox(0.9, 0.5, 0.6, 0.03, M.paint('#d8342c', 0.4), -0.55, cy, -0.1);
    k.box(0.86, 0.7, 0.56, M.glass('#f3efe2', 0.25), -0.55, cy + 0.5, -0.1);
    const pop = M.matte('#f6e3a6');
    for (let i = 0; i < 40; i++) {
      const x = -0.9 + (i % 8) * 0.1 + ((i * 7) % 3) * 0.01;
      const z = -0.3 + Math.floor(i / 8) * 0.09;
      k.sphere(0.06, pop, x, cy + 0.56 + ((i * 13) % 5) * 0.02, z, 1, 0.8, 1, 6);
    }
    k.rbox(0.92, 0.1, 0.6, 0.03, M.paint('#d8342c', 0.4), -0.55, cy + 1.2, -0.1);
    k.cyl(0.07, 0.25, M.metal('#c9ccce', 0.3, 0.9), -0.55, cy + 0.95, -0.1, 0.12, 10);
    // striped popcorn boxes on the counter
    for (let i = 0; i < 4; i++) {
      const x = 0.15 + i * 0.22;
      k.cyl(0.07, 0.22, M.paint(i % 2 ? '#ffffff' : '#d8342c', 0.5), x, cy, 0.55, 0.09, 8);
      k.sphere(0.085, pop, x, cy + 0.25, 0.55, 1, 0.6, 1, 8);
    }
  } else if (kind === 'cotton') {
    // the spinning bowl and sticks of pink and blue clouds
    k.cyl(0.42, 0.35, M.brushed('#c9ccce'), -0.6, cy, -0.05, 0.48, 20);
    k.cyl(0.45, 0.02, M.matte('#ffd3e6'), -0.6, cy + 0.33, -0.05, 0.45, 20);
    const pinks = ['#ffb3d1', '#b8d8ff', '#ffc7e3', '#d6c4ff'];
    for (let i = 0; i < 7; i++) {
      const x = 0.05 + (i % 4) * 0.24;
      const z = i < 4 ? 0.5 : 0.2;
      k.cyl(0.008, 0.35, M.paint('#f4efe2', 0.5), x, cy, z, 0.008, 4);
      k.sphere(0.13, M.fabric(pinks[i % pinks.length], 30), x, cy + 0.48, z, 1, 1.25, 1, 10);
    }
  } else {
    // an ice-cream freezer with coloured tubs and cones
    k.rbox(1.6, 0.06, 0.62, 0.02, M.paint('#f4efe2', 0.4), -0.1, cy, -0.05);
    k.box(1.56, 0.02, 0.58, M.glass('#d8eef4', 0.35), -0.1, cy + 0.34, -0.05);
    const flav = ['#f7e7c6', '#6b3f26', '#f6a7b8', '#9fd18b', '#f2d25c', '#c9a3e8'];
    for (let i = 0; i < 6; i++) {
      const x = -0.75 + i * 0.26;
      k.box(0.22, 0.1, 0.42, M.paint('#d9dcdf', 0.5), x, cy + 0.06, -0.05);
      k.sphere(0.1, M.matte(flav[i]), x, cy + 0.16, -0.05, 1.05, 0.5, 1.8, 10);
    }
    for (let i = 0; i < 3; i++) {
      const x = 0.95 + i * 0.12 - 0.12;
      k.cyl(0.005, 0.18, M.wood('#d9a964', 0.7), x, cy, 0.55, 0.05, 10).rotation.x = Math.PI;
      k.cyl(0.05, 0.18, M.wood('#d9a964', 0.7), x, cy + 0.02, 0.55, 0.005, 10).rotation.x = Math.PI;
      k.sphere(0.055, M.matte(flav[i + 2]), x, cy + 0.22, 0.55, 1, 0.9, 1, 10);
    }
  }
  void c;
}

/** a giant mascot on the roof: popcorn bucket, cotton candy cloud, ice-cream cone */
function stallTopper(k: Kit, kind: StallKind, y: number): void {
  if (kind === 'popcorn') {
    for (let i = 0; i < 8; i++) {
      const g = new THREE.CylinderGeometry(0.42, 0.3, 0.75, 3, 1, true, (i / 8) * TAU, TAU / 8);
      g.translate(0, 0.375, 0);
      k.geo(g, M.paint(i % 2 ? '#ffffff' : '#d8342c', 0.45), 0, y, 0);
    }
    for (let i = 0; i < 9; i++) k.sphere(0.16, M.matte('#f6e3a6'), Math.cos(i * 2.1) * 0.25, y + 0.8 + (i % 3) * 0.08, Math.sin(i * 2.1) * 0.25, 1, 0.8, 1, 8);
  } else if (kind === 'cotton') {
    k.cyl(0.03, 0.6, M.paint('#f4efe2', 0.5), 0, y, 0, 0.03, 6);
    k.sphere(0.5, M.fabric('#ffb3d1', 20), 0, y + 1.0, 0, 1, 1.2, 1, 14);
  } else {
    const cone = k.cyl(0.02, 0.9, M.wood('#d9a964', 0.7), 0, y, 0, 0.32, 14);
    void cone;
    k.sphere(0.36, M.matte('#f6a7b8'), 0, y + 1.05, 0, 1, 0.85, 1, 14);
    k.sphere(0.3, M.matte('#6b3f26'), 0, y + 1.42, 0, 1, 0.85, 1, 14);
    k.sphere(0.07, M.paint('#d8342c', 0.3), 0, y + 1.72, 0, 1, 1, 1, 8);
  }
}

function stall(id: string, kind: StallKind, name: string, sign: string, icon: string, a: string, b: string): FurnitureDef {
  return {
    id,
    name,
    category: 'playground',
    group: 'לונה פארק',
    tags: ['לונה פארק', 'דוכן', 'אוכל', 'חטיף', sign],
    size: { w: STALL.w + 0.2, d: STALL.d, h: STALL.h },
    colors: [slot('awning', 'סוכך', a), slot('awning2', 'פסים', '#fbf6ea'), slot('body', 'דוכן', b)],
    light: { x: 0, y: 2.3, z: 0.4, color: '#ffe2b0', intensity: 35, distance: 8 },
    actions: [{ kind: 'light' }, { kind: 'snack', label: `לקנות ${sign}` }],
    build: ({ colors: c }) => {
      const k = new Kit();
      const { w, d } = STALL;
      const body = M.paint(c.body, 0.5);
      const wood = M.wood('#9a7652', 0.6);
      // cart body on wheels, counter, back wall
      k.rbox(w - 0.2, 0.9, d - 0.5, 0.04, body, 0, 0.2, -0.1);
      for (const x of [-w / 2 + 0.4, w / 2 - 0.4]) {
        const wh = k.cyl(0.24, 0.08, M.paint('#3a3d42', 0.5), x, 0.24, d / 2 - 0.42, 0.24, 14);
        wh.rotation.x = Math.PI / 2;
        wh.position.set(x, 0.24, (d - 0.5) / 2 - 0.1 + 0.04);
      }
      k.rbox(w - 0.1, 0.06, d - 0.4, 0.02, wood, 0, 1.0, -0.05);
      k.box(w - 0.2, 1.45, 0.08, body, 0, 1.06, -d / 2 + 0.3);
      for (const x of [-w / 2 + 0.12, w / 2 - 0.18]) k.cyl(0.04, 1.45, M.metal('#c9ccce', 0.3, 0.9), x, 1.06, d / 2 - 0.35, 0.04, 8);
      // the striped awning and its name board
      awning(k, w + 0.1, 1.5, 2.55, 0.15, c.awning, c.awning2);
      k.box(w - 0.3, 0.5, 0.08, M.paint(darken(c.body, 0.2), 0.5), 0, 2.62, -d / 2 + 0.32);
      k.geo(new THREE.PlaneGeometry(w - 0.4, 0.44), signMat(sign, c.awning, '#ffffff', { icon, w: 768, h: 128, glow: 0.6 }), 0, 2.87, -d / 2 + 0.365).castShadow = false;
      stallGoods(k, kind, c);
      stallTopper(k, kind, 3.1 - 0.0);
      // bulbs along the awning edge
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 10; i++) pts.push(new THREE.Vector3(-w / 2 + (w * i) / 10, 2.26, 0.86));
      for (const m of bulbStrip(pts, 0.055, ['#fff4d6', '#ffd36a'], 3.0)) k.g.add(m);
      void lighten;
      return k.g;
    },
    draw2d: (ctx, c) =>
      sym(ctx, () => {
        const { w, d } = STALL;
        D.box(ctx, -w / 2 + 0.1, -d / 2 + 0.15, w / 2 - 0.1, d / 2 - 0.35, 0.05, tint(c.body, 0.4), INK_SOFT, LINE_THIN);
        const n = 8;
        for (let i = 0; i < n; i++) D.box(ctx, -w / 2 + (w * i) / n, -0.5, -w / 2 + (w * (i + 1)) / n, d / 2 - 0.05, 0, i % 2 ? tint(c.awning2, 0.1) : tint(c.awning, 0.35), null);
        D.box(ctx, -w / 2, -0.5, w / 2, d / 2 - 0.05, 0, null, INK_SOFT, LINE_THIN);
      }),
  };
}

/* ------------------------------------------------------------------ balloon seller */

const BALLOONS = ['#e0402f', '#2f7fd0', '#f2b824', '#3aa35b', '#c23bb0', '#f08a24', '#4fc1c9', '#ff7fb0'];

const balloonCart: FurnitureDef = {
  id: 'amuse-balloon-cart',
  name: 'עגלת בלונים',
  category: 'playground',
  group: 'לונה פארק',
  tags: ['לונה פארק', 'בלונים', 'מוכר', 'עגלה'],
  size: { w: 1.6, d: 1.2, h: 3.8 },
  colors: [slot('cart', 'עגלה', '#2f7fd0'), slot('trim', 'עיטור', '#f2c21b')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const cart = M.paint(c.cart, 0.45);
    k.rbox(1.0, 0.5, 0.6, 0.05, cart, 0, 0.35, 0);
    k.box(1.04, 0.06, 0.64, M.paint(c.trim, 0.4), 0, 0.85, 0);
    for (const s of [-1, 1]) {
      const wh = k.cyl(0.2, 0.05, M.paint('#3a3d42', 0.5), s * 0.42, 0.2, 0.33, 0.2, 14);
      wh.rotation.x = Math.PI / 2;
      wh.position.set(s * 0.42, 0.2, 0.33);
      const wh2 = k.cyl(0.2, 0.05, M.paint('#3a3d42', 0.5), s * 0.42, 0.2, -0.33, 0.2, 14);
      wh2.rotation.x = Math.PI / 2;
      wh2.position.set(s * 0.42, 0.2, -0.33);
    }
    k.rod([-0.5, 0.75, 0.3], [-0.75, 1.0, 0.45], 0.02, M.metal('#c9ccce', 0.3, 0.9), 0.02, 6);
    k.cyl(0.025, 1.0, M.metal('#c9ccce', 0.3, 0.9), 0.3, 0.9, 0, 0.025, 6);
    // the bunch: balloons on strings from the top of the pole
    const top = new THREE.Vector3(0.3, 1.9, 0);
    for (let i = 0; i < 14; i++) {
      const a = i * 2.39996;
      const r = 0.15 + (i % 5) * 0.1;
      const p = new THREE.Vector3(0.3 + Math.cos(a) * r, 2.6 + (i % 4) * 0.22 + (i > 9 ? 0.25 : 0), Math.sin(a) * r * 0.8);
      p.x = Math.max(-0.5, Math.min(0.5, p.x));
      k.rod([top.x, top.y, top.z], [p.x, p.y - 0.18, p.z], 0.004, M.matte('#f4f1ea'), 0.004, 3);
      k.sphere(0.17, M.plastic(BALLOONS[i % BALLOONS.length]), p.x, p.y, p.z, 1, 1.18, 1, 14);
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.box(ctx, -0.5, -0.3, 0.5, 0.3, 0.05, tint(c.cart, 0.3), INK_SOFT, LINE_THIN);
      for (let i = 0; i < 8; i++) D.circle(ctx, 0.3 + Math.cos(i * 2.4) * 0.3, Math.sin(i * 2.4) * 0.25, 0.15, tint(BALLOONS[i], 0.2), INK_SOFT, LINE_THIN);
    }),
};

/* ------------------------------------------------------------------ string of lights */

const STRING_H = 4.6;

function sagAt(w: number, t: number): number {
  return STRING_H - 0.3 - Math.min(1.4, w * 0.06) * 4 * t * (1 - t);
}

const lightString: FurnitureDef = {
  id: 'amuse-light-string',
  name: 'שרשרת נורות על עמודים',
  category: 'playground',
  group: 'לונה פארק',
  tags: ['לונה פארק', 'נורות', 'תאורה', 'שרשרת', 'מסיבה'],
  size: { w: 12, d: 0.4, h: STRING_H + 0.2 },
  resize: { w: [3, 30] },
  parametric: true,
  colors: [slot('poles', 'עמודים', '#2f3b52')],
  light: { x: 0, y: STRING_H - 0.6, z: 0, color: '#ffd9a0', intensity: 40, distance: 12 },
  actions: [{ kind: 'light' }],
  build: ({ colors: c, size }) => {
    const sz: ItemSize = size ?? { w: 12, d: 0.4, h: STRING_H + 0.2 };
    const k = new Kit();
    const w = sz.w;
    const pole = M.metal(c.poles, 0.45, 0.6);
    for (const s of [-1, 1]) {
      k.cyl(0.07, STRING_H, pole, s * (w / 2 - 0.18), 0, 0, 0.05, 10);
      k.cyl(0.14, 0.2, M.stone('#a9a59d', 0.85), s * (w / 2 - 0.18), 0, 0, 0.16, 10);
      k.sphere(0.08, M.metal('#d9a93a', 0.3, 0.8), s * (w / 2 - 0.18), STRING_H + 0.06, 0, 1, 1, 1, 8);
    }
    const n = Math.max(6, Math.round(w / 0.55));
    const wire: Array<[number, number, number]> = [];
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = -w / 2 + 0.12 + (w - 0.24) * t;
      wire.push([x, sagAt(w, t), 0]);
      if (i > 0 && i < n) pts.push(new THREE.Vector3(x, sagAt(w, t) - 0.1, 0));
    }
    k.tube(wire, 0.008, M.matte('#2a2b2e'), { seg: n * 2, radial: 4 });
    for (const m of bulbStrip(pts, 0.085, BULB_COLORS, 3.4)) k.g.add(m);
    k.g.userData.anchors = {
      light: { x: 0, y: sagAt(w, 0.5) - 0.2, z: 0 },
      boxes: [-1, 1].map((s) => ({ x: s * (w / 2 - 0.18), z: 0, w: 0.3, d: 0.3, h: STRING_H })),
    };
    return k.g;
  },
  draw2d: (ctx, c, size) =>
    sym(ctx, () => {
      const w = size?.w ?? 12;
      D.line(ctx, -w / 2 + 0.12, 0, w / 2 - 0.18, 0, '#7d8187', 0.02);
      for (const s of [-1, 1]) D.circle(ctx, s * (w / 2 - 0.18), 0, 0.12, tint(c.poles, 0.2), INK_SOFT, LINE_THIN);
      const n = Math.max(6, Math.round(w / 0.55));
      for (let i = 1; i < n; i++) D.circle(ctx, -w / 2 + 0.12 + ((w - 0.24) * i) / n, 0, 0.06, BULB_COLORS[i % BULB_COLORS.length], null);
    }),
};

/* ------------------------------------------------------------------ fairground lamp post */

const lampPost: FurnitureDef = {
  id: 'amuse-lamp-post',
  name: 'פנס לונה פארק עם חמישה כדורים',
  category: 'playground',
  group: 'לונה פארק',
  tags: ['לונה פארק', 'פנס', 'תאורה', 'עמוד'],
  size: { w: 1.3, d: 1.3, h: 4.3 },
  colors: [slot('post', 'עמוד', '#2f3b52'), slot('trim', 'עיטור', '#d9a93a')],
  light: { x: 0, y: 3.9, z: 0, color: '#ffe0a8', intensity: 70, distance: 14 },
  actions: [{ kind: 'light' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const post = M.metal(c.post, 0.45, 0.6);
    const gold = M.metal(c.trim, 0.3, 0.8);
    k.lathe(
      [
        [0, 0],
        [0.24, 0],
        [0.24, 0.12],
        [0.16, 0.2],
        [0.12, 0.6],
        [0.09, 0.7],
        [0, 0.7],
      ],
      post,
      0,
      0,
      0,
      16,
    );
    k.cyl(0.065, 2.9, post, 0, 0.7, 0, 0.05, 12);
    k.ring(0.08, 0.025, gold, 0, 1.2, 0, 14);
    k.ring(0.07, 0.025, gold, 0, 3.4, 0, 14);
    const globe = M.glow('#ffe6b0', 2.6, '#fff5e0');
    k.sphere(0.2, globe, 0, 4.06, 0, 1, 1, 1, 16);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + Math.PI / 4;
      const x = Math.cos(a) * 0.42;
      const z = Math.sin(a) * 0.42;
      k.tube(
        [
          [0, 3.45, 0],
          [x * 0.6, 3.62, z * 0.6],
          [x, 3.55, z],
        ],
        0.025,
        post,
        { seg: 8, radial: 5 },
      );
      k.cyl(0.04, 0.06, gold, x, 3.55, z, 0.06, 8);
      k.sphere(0.17, globe, x, 3.78, z, 1, 1, 1, 14);
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.circle(ctx, 0, 0, 0.24, tint(c.post, 0.2), INK_SOFT, LINE_THIN);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + Math.PI / 4;
        D.circle(ctx, Math.cos(a) * 0.42, Math.sin(a) * 0.42, 0.17, '#fff1c6', INK_SOFT, LINE_THIN);
      }
    }),
};

export const PARK_DECO: FurnitureDef[] = [
  gate,
  booth,
  stall('amuse-stall-popcorn', 'popcorn', 'דוכן פופקורן', 'פופקורן', '🍿', '#d8342c', '#f4efe2'),
  stall('amuse-stall-cotton-candy', 'cotton', 'דוכן שערות סבתא', 'שערות סבתא', '🍭', '#ff7fb0', '#8ec9f0'),
  stall('amuse-stall-icecream', 'icecream', 'דוכן גלידה', 'גלידה', '🍦', '#3aa3c9', '#f6e7cf'),
  balloonCart,
  lightString,
  lampPost,
];
