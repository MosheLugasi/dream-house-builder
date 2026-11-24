import * as THREE from 'three';
import { D, INK, INK_SOFT, Kit, LINE_THIN, M, sym, tubeGeo } from '../kit';
import type { FurnitureDef, ItemSize, SeatAnchor } from '../types';
import { slot } from './_parts';
import { canvasMaterial, checker, EMOJI_FONT, title } from './_gameAShared';

/**
 * Race-day items (team A): start/finish gantry, inflatable checkpoint arch, grandstand, pit garage,
 * podium, tyre stacks, checkered flag, traffic cone. The race game builds the gantry and arches over
 * the street at run time; players can also place them (an arch on the circuit becomes a checkpoint).
 */

// ---- start / finish gantry ------------------------------------------------------------------

const GANTRY = { w: 10, d: 0.9, h: 5.6 };
const BEAM_H = 1.15;
/** where the five start lights are (item space; the game lights them) */
export const GANTRY_LIGHTS = { y: GANTRY.h - BEAM_H - 0.32, z: 0.2, xs: [-0.84, -0.42, 0, 0.42, 0.84], r: 0.13 };

function gantryBanner(): THREE.Material {
  return canvasMaterial(
    'race-gantry-banner',
    1024,
    128,
    (g, w, h) => {
      g.fillStyle = '#c81f24';
      g.fillRect(0, 0, w, h);
      checker(g, 0, 0, 160, h, 32);
      checker(g, w - 160, 0, 160, h, 32);
      title(g, 'זינוק · סיום', w / 2, h / 2 + 4, 78);
    },
    '#c81f24',
    0.35,
  );
}

function postBanner(): THREE.Material {
  return canvasMaterial(
    'race-post-banner',
    64,
    512,
    (g, w, h) => {
      g.fillStyle = '#f2f2ee';
      g.fillRect(0, 0, w, h);
      checker(g, 0, 0, w, h, 32);
    },
    '#dddddd',
    0.15,
  );
}

function buildGantry(c: Record<string, string>, size: ItemSize): THREE.Object3D {
  const k = new Kit();
  const { w, h, d } = size;
  const frame = M.paint(c.frame, 0.35);
  const dark = M.paint('#2a2c30', 0.5);
  const px = w / 2 - 0.3;
  const beamY = h - BEAM_H;
  for (const x of [-px, px]) {
    k.rbox(0.5, beamY, 0.5, 0.04, frame, x, 0, 0);
    k.box(0.6, 0.08, d, dark, x, 0, 0);
    // checkered banners down both faces of the posts
    k.box(0.36, beamY - 0.7, 0.01, postBanner(), x, 0.5, 0.255);
    k.box(0.36, beamY - 0.7, 0.01, postBanner(), x, 0.5, -0.255);
  }
  k.rbox(w, BEAM_H, 0.55, 0.05, frame, 0, beamY, 0);
  k.box(w - 0.6, BEAM_H - 0.2, 0.01, gantryBanner(), 0, beamY + 0.1, 0.28);
  k.box(w - 0.6, BEAM_H - 0.2, 0.01, gantryBanner(), 0, beamY + 0.1, -0.28).rotation.y = Math.PI;
  // start-light pod under the beam
  const L = GANTRY_LIGHTS;
  k.box(2.3, 0.5, 0.3, dark, 0, beamY - 0.55, 0);
  k.box(0.08, 0.06, 0.08, dark, -0.6, beamY - 0.06, 0);
  k.box(0.08, 0.06, 0.08, dark, 0.6, beamY - 0.06, 0);
  const lamp = M.paint('#4a1414', 0.3);
  for (const x of L.xs) {
    for (const z of [L.z - 0.04, -L.z + 0.04]) {
      const m = k.cyl(L.r, 0.04, lamp, x, 0, z);
      m.rotation.x = Math.PI / 2;
      m.position.y = L.y;
    }
  }
  k.g.userData.anchors = {
    boxes: [
      { x: -px, z: 0, w: 0.55, d: 0.55, h },
      { x: px, z: 0, w: 0.55, d: 0.55, h },
    ],
  };
  return k.g;
}

const raceGantry: FurnitureDef = {
  id: 'race-gantry',
  name: 'שער זינוק וסיום',
  category: 'street',
  group: 'יום מירוץ',
  tags: ['מירוץ', 'זינוק', 'סיום', 'דגל משובץ', 'רמזור זינוק'],
  size: { ...GANTRY },
  parametric: true,
  resize: { w: [6, 16], h: [4.6, 7] },
  colors: [slot('frame', 'מסגרת', '#d7262b')],
  build: ({ colors: c, size }) => buildGantry(c, size ?? GANTRY),
  draw2d: (ctx, c, size) =>
    sym(ctx, () => {
      const w = size?.w ?? GANTRY.w;
      const d = size?.d ?? GANTRY.d;
      D.box(ctx, -w / 2, -0.2, w / 2, 0.2, 0, '#f0f0ee', INK_SOFT, LINE_THIN);
      for (let i = 0; i < 8; i++) D.box(ctx, -w / 2 + 0.6 + i * 0.25, -0.2, -w / 2 + 0.72 + i * 0.25, 0.2, 0, '#222', null);
      for (const x of [-w / 2 + 0.3, w / 2 - 0.3]) D.box(ctx, x - 0.25, -d / 2, x + 0.25, d / 2, 0.03, c.frame, INK, LINE_THIN);
    }),
};

// ---- inflatable checkpoint arch -------------------------------------------------------------

const ARCH = { w: 9.4, d: 1.0, h: 4.8 };

function archBanner(color: string): THREE.Material {
  return canvasMaterial(
    `race-arch-banner-${color}`,
    512,
    96,
    (g, w, h) => {
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, w, h);
      checker(g, 0, 0, 72, h, 24);
      checker(g, w - 72, 0, 72, h, 24);
      title(g, 'שער', w / 2, h / 2 + 3, 62, color);
    },
    '#ffffff',
    0.3,
  );
}

function buildArch(c: Record<string, string>, size: ItemSize): THREE.Object3D {
  const k = new Kit();
  const { w, h } = size;
  const r = 0.42;
  const x = w / 2 - 0.47;
  const top = h - r - 0.05;
  const skin = new THREE.MeshPhysicalMaterial({ color: c.color, roughness: 0.38, clearcoat: 0.5, clearcoatRoughness: 0.35, sheen: 0.3 });
  const stripe = new THREE.MeshPhysicalMaterial({ color: c.stripe, roughness: 0.38, clearcoat: 0.5 });
  const bend = Math.min(1.4, w * 0.18);
  const pts: [number, number, number][] = [
    [-x, 0.05, 0],
    [-x, top - bend, 0],
    [-x + bend * 0.3, top - bend * 0.3, 0],
    [-x + bend, top, 0],
    [x - bend, top, 0],
    [x - bend * 0.3, top - bend * 0.3, 0],
    [x, top - bend, 0],
    [x, 0.05, 0],
  ];
  k.geo(tubeGeo(pts, r, { seg: 64, radial: 14, tension: 0.4 }), skin);
  // two bands around the legs
  for (const sx of [-x, x]) {
    for (const y of [0.9, 2.0]) k.cyl(r + 0.012, 0.22, stripe, sx, y, 0, r + 0.012, 16);
    k.box(0.84, 0.18, 0.9, M.paint('#3b3d40', 0.8), sx, 0, 0); // sand-bag base
  }
  // banner across the top, both faces
  const bw = Math.max(1, w - 2 * bend - 0.6);
  k.box(bw, 0.78, 0.04, archBanner(c.color), 0, top - 0.39, r * 0.55);
  k.box(bw, 0.78, 0.04, archBanner(c.color), 0, top - 0.39, -r * 0.55).rotation.y = Math.PI;
  k.g.userData.anchors = {
    boxes: [
      { x: -x, z: 0, w: 0.9, d: 0.9, h },
      { x, z: 0, w: 0.9, d: 0.9, h },
    ],
  };
  return k.g;
}

const raceArch: FurnitureDef = {
  id: 'race-arch',
  name: 'קשת שער מתנפחת',
  category: 'street',
  group: 'יום מירוץ',
  tags: ['מירוץ', 'שער', 'מתנפח', 'קשת', 'צ׳קפוינט'],
  size: { ...ARCH },
  parametric: true,
  resize: { w: [5, 14], h: [3.6, 6] },
  colors: [slot('color', 'צבע', '#ff7a1a'), slot('stripe', 'פסים', '#ffffff')],
  build: ({ colors: c, size }) => buildArch(c, size ?? ARCH),
  draw2d: (ctx, c, size) =>
    sym(ctx, () => {
      const w = size?.w ?? ARCH.w;
      D.box(ctx, -w / 2 + 0.1, -0.12, w / 2 - 0.1, 0.12, 0.1, c.color, INK_SOFT, LINE_THIN);
      D.circle(ctx, -w / 2 + 0.5, 0, 0.45, c.color, INK, LINE_THIN);
      D.circle(ctx, w / 2 - 0.5, 0, 0.45, c.color, INK, LINE_THIN);
    }),
};

// ---- grandstand -----------------------------------------------------------------------------

const STAND = { w: 7.2, d: 3.6, h: 3.6 };
const TIERS = 3;
const TIER_D = 1.0;
const TIER_H = 0.45;
const SEAT_XS = [-2.7, -1.62, -0.54, 0.54, 1.62, 2.7];

const standSeats: SeatAnchor[] = [];
for (let t = 0; t < TIERS; t++) {
  for (const x of SEAT_XS) standSeats.push({ x, z: STAND.d / 2 - 0.35 - t * TIER_D - 0.25, height: (t + 1) * TIER_H + 0.42, facing: 0 });
}

const grandstand: FurnitureDef = {
  id: 'race-grandstand',
  name: 'יציע צופים',
  category: 'street',
  group: 'יום מירוץ',
  tags: ['מירוץ', 'יציע', 'צופים', 'ספסל', 'אצטדיון'],
  size: { ...STAND },
  colors: [slot('seats', 'כיסאות', '#1f6fd1'), slot('frame', 'מבנה', '#9aa0a6'), slot('roof', 'גגון', '#d7262b')],
  seats: standSeats,
  build: ({ colors: c }) => {
    const k = new Kit();
    const { w, d, h } = STAND;
    const frame = M.metal(c.frame, 0.45, 0.8);
    const deck = M.paint('#bfc3c7', 0.7);
    const seat = M.plastic(c.seats);
    for (let t = 0; t < TIERS; t++) {
      const z = d / 2 - t * TIER_D;
      const y = (t + 1) * TIER_H;
      // the stepped deck: one solid block per tier
      k.box(w, y, TIER_D, deck, 0, 0, z - TIER_D / 2);
      k.box(w, 0.03, 0.06, M.paint('#f2c230'), 0, y, z - 0.03); // yellow step edge
      for (const x of SEAT_XS) {
        const sz = z - 0.6;
        k.rbox(0.46, 0.08, 0.42, 0.03, seat, x, y + 0.34, sz);
        k.rbox(0.46, 0.42, 0.07, 0.03, seat, x, y + 0.38, sz - 0.22);
        k.box(0.08, 0.34, 0.3, frame, x, y, sz);
      }
    }
    // back rail and roof on two back columns
    const backZ = -d / 2 + 0.08;
    for (const x of [-w / 2 + 0.15, w / 2 - 0.15]) k.box(0.12, h, 0.12, frame, x, 0, backZ);
    k.box(w, 0.06, 0.06, frame, 0, TIERS * TIER_H + 1.0, backZ);
    const roof = k.box(w, 0.08, d * 0.85, M.paint(c.roof, 0.5), 0, h - 0.25, -d / 2 + (d * 0.85) / 2);
    roof.rotation.x = -0.08;
    for (let i = 0; i < 6; i++) k.box(0.4, 0.3, 0.02, M.paint(i % 2 ? '#ffffff' : c.roof), -w / 2 + 0.6 + i * ((w - 1.2) / 5), h - 0.62, -d / 2 + d * 0.85);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { w, d } = STAND;
      D.box(ctx, -w / 2, -d / 2, w / 2, d / 2, 0.02, '#d9dcdf', INK, LINE_THIN);
      for (let t = 1; t < TIERS; t++) D.line(ctx, -w / 2, d / 2 - t * TIER_D, w / 2, d / 2 - t * TIER_D, INK_SOFT);
      for (let t = 0; t < TIERS; t++) for (const x of SEAT_XS) D.box(ctx, x - 0.2, d / 2 - t * TIER_D - 0.8, x + 0.2, d / 2 - t * TIER_D - 0.42, 0.04, c.seats, null);
    }),
};

// ---- tyre stack, flag, cone -----------------------------------------------------------------

const tyreStack: FurnitureDef = {
  id: 'race-tire-stack',
  name: 'ערימת צמיגים',
  category: 'street',
  group: 'יום מירוץ',
  tags: ['מירוץ', 'צמיגים', 'מחסום', 'פיטס'],
  size: { w: 0.78, d: 0.78, h: 1.0 },
  colors: [slot('band', 'פס צבע', '#ffffff')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const rubber = M.rubber('#202124');
    const band = M.paint(c.band, 0.5);
    const torus = new THREE.TorusGeometry(0.28, 0.105, 10, 22);
    for (let i = 0; i < 4; i++) {
      const m = k.geo(torus, i % 2 ? band : rubber, 0, 0.105 + i * 0.205, 0);
      m.rotation.x = Math.PI / 2;
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.circle(ctx, 0, 0, 0.38, '#2a2b2e', INK, LINE_THIN);
      D.circle(ctx, 0, 0, 0.17, c.band, INK_SOFT, LINE_THIN);
    }),
};

function flagMaterial(): THREE.Material {
  const m = canvasMaterial('race-flag', 256, 192, (g, w, h) => checker(g, 0, 0, w, h, 32), '#888888', 0.12) as THREE.MeshStandardMaterial;
  m.side = THREE.DoubleSide;
  return m;
}

const checkeredFlag: FurnitureDef = {
  id: 'race-flag-checkered',
  name: 'דגל משובץ',
  category: 'street',
  group: 'יום מירוץ',
  tags: ['מירוץ', 'דגל', 'משובץ', 'סיום'],
  size: { w: 1.4, d: 0.3, h: 4.2 },
  colors: [slot('pole', 'תורן', '#d9dcdf')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const pole = M.metal(c.pole, 0.3, 0.9);
    k.cyl(0.04, 4.08, pole, -0.5, 0, 0, 0.03, 12);
    k.sphere(0.06, M.brass(), -0.5, 4.1, 0);
    k.cyl(0.16, 0.08, M.paint('#3b3d40'), -0.5, 0, 0, 0.16, 16);
    // a waving flag: a gently curved plane
    const geo = new THREE.PlaneGeometry(1.15, 0.85, 12, 1);
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      pos.setZ(i, Math.sin((x + 0.575) * 5.2) * 0.07 * (x + 0.575));
    }
    geo.computeVertexNormals();
    k.geo(geo, flagMaterial(), 0.08, 3.6, 0);
    return k.g;
  },
  draw2d: (ctx) =>
    sym(ctx, () => {
      D.circle(ctx, -0.5, 0, 0.1, '#888', INK, LINE_THIN);
      D.line(ctx, -0.45, 0, 0.6, 0.05, INK, 0.03);
    }),
};

const cone: FurnitureDef = {
  id: 'race-cone',
  name: 'קונוס תנועה',
  category: 'street',
  group: 'יום מירוץ',
  tags: ['קונוס', 'תנועה', 'מחסום', 'מירוץ', 'כתום'],
  size: { w: 0.38, d: 0.38, h: 0.72 },
  colors: [slot('color', 'צבע', '#ff6a13')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const o = M.plastic(c.color);
    const wht = M.plastic('#f4f4f2');
    k.rbox(0.38, 0.04, 0.38, 0.03, o, 0, 0, 0);
    const H = 0.66;
    const rb = 0.15;
    const rt = 0.025;
    const r = (y: number) => rb + (rt - rb) * (y / H);
    const bands: [number, number, THREE.Material][] = [
      [0, 0.22, o],
      [0.22, 0.32, wht],
      [0.32, 0.42, o],
      [0.42, 0.5, wht],
      [0.5, H, o],
    ];
    for (const [y0, y1, m] of bands) k.cyl(r(y0), y1 - y0, m, 0, 0.04 + y0, 0, r(y1), 16);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.box(ctx, -0.19, -0.19, 0.19, 0.19, 0.03, c.color, INK, LINE_THIN);
      D.circle(ctx, 0, 0, 0.08, '#ffffff', INK_SOFT, LINE_THIN);
    }),
};

// ---- pit garage -----------------------------------------------------------------------------

const GARAGE = { w: 6, d: 5.6, h: 3.4 };

function garageSign(): THREE.Material {
  return canvasMaterial(
    'race-garage-sign',
    512,
    96,
    (g, w, h) => {
      g.fillStyle = '#1b1d21';
      g.fillRect(0, 0, w, h);
      checker(g, 0, 0, 64, h, 24);
      checker(g, w - 64, 0, 64, h, 24);
      title(g, 'פיטס', w / 2, h / 2 + 3, 60, '#ffd23a');
    },
    '#1b1d21',
    0.4,
  );
}

function buildGarage(c: Record<string, string>, size: ItemSize): THREE.Object3D {
  const k = new Kit();
  const { w, d, h } = size;
  const wall = M.paint(c.walls, 0.8);
  const t = 0.15;
  k.box(t, h, d, wall, -w / 2 + t / 2, 0, 0);
  k.box(t, h, d, wall, w / 2 - t / 2, 0, 0);
  k.box(w, h, t, wall, 0, 0, -d / 2 + t / 2);
  k.box(w, 0.18, d, M.paint('#3b3e44', 0.6), 0, h - 0.18, 0);
  // fascia with the sign and the rolled-up door
  k.box(w, 0.6, 0.12, M.paint(c.accent, 0.4), 0, h - 0.78, d / 2 - 0.08);
  k.box(w * 0.6, 0.42, 0.01, garageSign(), 0, h - 0.7, d / 2 - 0.015);
  const roll = k.cyl(0.18, w - 0.4, M.metal('#b8bcc0', 0.4, 0.8), 0, h - 0.8, d / 2 - 0.35, 0.18, 14);
  roll.rotation.z = Math.PI / 2;
  roll.position.y = h - 1.0;
  // floor with a yellow box
  k.box(w - 2 * t, 0.02, d - t, M.paint('#8d9196', 0.35), 0, 0, t / 2);
  for (const x of [-w / 2 + 0.6, w / 2 - 0.6]) k.box(0.08, 0.025, d - 1.2, M.paint('#f2c230'), x, 0, 0.3);
  // tool wall and a red tool cabinet at the back
  k.box(w * 0.5, 1.1, 0.03, M.paint('#d9cfb8', 0.9), -w * 0.12, 1.1, -d / 2 + t + 0.015);
  for (let i = 0; i < 7; i++) k.box(0.05, 0.3 + (i % 3) * 0.08, 0.03, M.metal('#8c9095', 0.4), -w * 0.12 - w * 0.2 + i * (w * 0.4) / 6, 1.45, -d / 2 + t + 0.04);
  k.rbox(1.1, 0.95, 0.55, 0.02, M.lacquer(c.accent), w / 2 - t - 0.75, 0, -d / 2 + t + 0.3);
  for (let i = 0; i < 4; i++) k.box(1.0, 0.012, 0.01, M.chrome(), w / 2 - t - 0.75, 0.2 + i * 0.2, -d / 2 + t + 0.58);
  // spare tyres along the left wall
  const tyre = new THREE.TorusGeometry(0.3, 0.11, 10, 20);
  for (let i = 0; i < 3; i++) {
    const m = k.geo(tyre, M.rubber(), -w / 2 + t + 0.14, 0.42, -d / 2 + 0.9 + i * 0.32);
    m.rotation.y = Math.PI / 2;
  }
  k.g.userData.anchors = {
    boxes: [
      { x: -w / 2 + t / 2, z: 0, w: t, d, h },
      { x: w / 2 - t / 2, z: 0, w: t, d, h },
      { x: 0, z: -d / 2 + t / 2, w, d: t, h },
      { x: w / 2 - t - 0.75, z: -d / 2 + t + 0.3, w: 1.1, d: 0.6, h: 1 },
    ],
  };
  return k.g;
}

const pitGarage: FurnitureDef = {
  id: 'race-pit-garage',
  name: 'מוסך פיטס',
  category: 'street',
  group: 'יום מירוץ',
  tags: ['מירוץ', 'מוסך', 'פיטס', 'כלי עבודה', 'חניה'],
  size: { ...GARAGE },
  parametric: true,
  resize: { w: [4, 9], d: [4, 8], h: [2.8, 4.2] },
  colors: [slot('walls', 'קירות', '#eceae4'), slot('accent', 'צבע קבוצה', '#d7262b')],
  build: ({ colors: c, size }) => buildGarage(c, size ?? GARAGE),
  draw2d: (ctx, c, size) =>
    sym(ctx, () => {
      const w = size?.w ?? GARAGE.w;
      const d = size?.d ?? GARAGE.d;
      D.box(ctx, -w / 2, -d / 2, w / 2, d / 2, 0, '#e3e4e6', INK_SOFT, LINE_THIN);
      D.box(ctx, -w / 2, -d / 2, -w / 2 + 0.15, d / 2, 0, c.walls, INK, LINE_THIN);
      D.box(ctx, w / 2 - 0.15, -d / 2, w / 2, d / 2, 0, c.walls, INK, LINE_THIN);
      D.box(ctx, -w / 2, -d / 2, w / 2, -d / 2 + 0.15, 0, c.walls, INK, LINE_THIN);
      D.line(ctx, -w / 2, d / 2, w / 2, d / 2, c.accent, 0.05);
    }),
};

// ---- podium ---------------------------------------------------------------------------------

function podiumFace(n: number): THREE.Material {
  return canvasMaterial(
    `race-podium-${n}`,
    128,
    128,
    (g, w, h) => {
      g.fillStyle = ['#e9b923', '#c0c4c8', '#c8803c'][n - 1];
      g.fillRect(0, 0, w, h);
      g.font = `900 96px ${EMOJI_FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = '#ffffff';
      g.fillText(String(n), w / 2, h / 2 + 6);
    },
    ['#e9b923', '#c0c4c8', '#c8803c'][n - 1],
    0.2,
  );
}

const podium: FurnitureDef = {
  id: 'race-podium',
  name: 'פודיום מנצחים',
  category: 'street',
  group: 'יום מירוץ',
  tags: ['מירוץ', 'פודיום', 'מנצחים', 'מקום ראשון', 'טקס'],
  size: { w: 3.0, d: 1.1, h: 0.85 },
  colors: [slot('body', 'צבע', '#ffffff')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const body = M.paint(c.body, 0.4);
    const blocks: [number, number, number][] = [
      [0, 0.85, 1],
      [-1.0, 0.6, 2],
      [1.0, 0.4, 3],
    ];
    for (const [x, h, n] of blocks) {
      k.rbox(0.98, h, 1.1, 0.02, body, x, 0, 0);
      k.box(0.34, 0.34, 0.01, podiumFace(n), x, h / 2 - 0.17, 0.545);
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      for (const x of [-1, 0, 1]) D.box(ctx, x - 0.49, -0.55, x + 0.49, 0.55, 0.02, c.body, INK, LINE_THIN);
      D.circle(ctx, 0, 0, 0.15, '#e9b923', INK_SOFT, LINE_THIN);
    }),
};

export const GAME_A_RACE_ITEMS: FurnitureDef[] = [raceGantry, raceArch, grandstand, pitGarage, podium, tyreStack, checkeredFlag, cone];
