import * as THREE from 'three';
import { D, INK_SOFT, Kit, LINE_THIN, M, darken, lighten, rng, sym, tint } from '../kit';
import type { FurnitureDef } from '../types';
import { slot } from './_parts';

/**
 * Treasure-hunt pieces (team E): a pirate chest (its lid is a part, so the game can open it), an
 * explorers' tent and a treasure-map board for the hunt's starting corner.
 */

const GROUP = 'ציד אוצרות';

/* ------------------------------------------------------------------ chest */

export const CHEST = { w: 0.9, d: 0.6, h: 0.72 };
const BODY_H = 0.42;

/**
 * Build a treasure chest (origin = bottom centre, front = +Z). The lid is a part named `lid` with its
 * hinge at the back top edge: rotate `lid.rotation.x` negative to open it.
 */
export function buildChest(c: { wood: string; bands: string }, opts: { gold?: boolean; coins?: boolean; scale?: number } = {}): { group: THREE.Group; lid: THREE.Group } {
  const s = opts.scale ?? 1;
  const k = new Kit();
  const w = CHEST.w * s;
  const d = CHEST.d * s;
  const bh = BODY_H * s;
  const wood = M.wood(c.wood, 0.7);
  const plank = M.wood(darken(c.wood, 0.18), 0.75);
  const band = opts.gold ? M.metal('#d9a93a', 0.28, 1) : M.metal(c.bands, 0.45, 0.8);
  k.rbox(w - 0.04 * s, bh, d - 0.04 * s, 0.015 * s, wood, 0, 0, 0, 1);
  // plank seams
  for (let i = 1; i < 4; i++) k.box(w - 0.03 * s, 0.008 * s, d - 0.03 * s, plank, 0, (i * bh) / 4, 0);
  // metal bands, corners and the lock plate
  for (const x of [-w / 2 + 0.12 * s, w / 2 - 0.12 * s]) k.box(0.05 * s, bh + 0.004, d - 0.02 * s, band, x, -0.002, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.05 * s, bh, 0.05 * s, band, sx * (w / 2 - 0.035 * s), 0, sz * (d / 2 - 0.035 * s));
  k.box(0.11 * s, 0.13 * s, 0.02 * s, band, 0, bh - 0.15 * s, d / 2 - 0.01 * s);
  k.box(0.025 * s, 0.05 * s, 0.024 * s, M.matte('#1d1a18'), 0, bh - 0.12 * s, d / 2 - 0.008 * s);
  if (opts.coins) {
    // gold heaped inside (seen when the lid opens)
    const gold = M.metal('#e8b63c', 0.25, 1);
    const r = rng(9);
    for (let i = 0; i < 26; i++) {
      const m = k.disc(0.03 * s, 0.008 * s, gold, (r() - 0.5) * (w - 0.18 * s), bh - 0.03 * s + r() * 0.06 * s, (r() - 0.5) * (d - 0.16 * s), 10);
      m.rotation.set((r() - 0.5) * 0.8, 0, (r() - 0.5) * 0.8);
    }
    k.sphere(w * 0.34, gold, 0, bh - 0.07 * s, 0, 1, 0.3, 0.6, 14);
    for (const [x, col] of [
      [-0.16, '#3fa0e0'],
      [0.12, '#e0405a'],
      [0.02, '#40c070'],
    ] as const) {
      k.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.035 * s, 0), M.glass(col, 0.85)), x * s, bh + 0.03 * s, (x * 0.4) * s);
    }
  }
  // lid: a half barrel hinged at the back
  const lid = k.part('lid', 0, bh, -d / 2 + 0.02 * s);
  const lw = w - 0.04 * s;
  const R = (d - 0.04 * s) / 2;
  const lidGeo = new THREE.CylinderGeometry(R, R, lw, 18, 1, false, 0, Math.PI);
  lidGeo.rotateZ(Math.PI / 2);
  lidGeo.rotateX(-Math.PI / 2);
  const lm = lid.geo(lidGeo, wood, 0, 0, R);
  lm.scale.set(1, 0.55, 1);
  // its bands follow the arch
  for (const x of [-w / 2 + 0.12 * s, w / 2 - 0.12 * s, 0]) {
    const t = new THREE.TorusGeometry(R + 0.004, 0.012 * s, 4, 14, Math.PI);
    t.rotateY(Math.PI / 2);
    const m = lid.geo(t, band, x, 0, R);
    m.scale.set(1, 0.55, 1);
    if (x === 0) m.visible = false;
  }
  lid.box(0.1 * s, 0.07 * s, 0.02 * s, band, 0, -0.02 * s, 2 * R - 0.004);
  const lg = lid.g;
  return { group: k.g, lid: lg };
}

const chest: FurnitureDef = {
  id: 'treasure-chest',
  name: 'תיבת אוצר',
  category: 'outdoor',
  group: GROUP,
  tags: ['תיבה', 'אוצר', 'פיראטים', 'מטבעות', 'זהב', 'ארגז'],
  size: CHEST,
  colors: [slot('wood', 'עץ', '#8a5a34'), slot('bands', 'חישוקים', '#3b3a38')],
  build: ({ colors: c }) => {
    const { group, lid } = buildChest({ wood: c.wood, bands: c.bands }, { coins: true });
    lid.rotation.x = -1.15;
    // a few coins spilled on the ground in front
    const gold = M.metal('#e8b63c', 0.25, 1);
    const k = new Kit();
    k.sub(new Kit());
    const r = rng(4);
    for (let i = 0; i < 6; i++) k.disc(0.03, 0.008, gold, -0.25 + r() * 0.5, 0, 0.24 + r() * 0.04, 10);
    group.add(k.g);
    // keep the open lid inside the footprint: tilt it a little less and pull the chest forward
    group.position.z = 0.0;
    return group;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, CHEST.w - 0.04, CHEST.d - 0.04, 0.03, tint(c.wood, 0.3));
      for (const x of [-CHEST.w / 2 + 0.12, CHEST.w / 2 - 0.12]) D.line(ctx, x, -CHEST.d / 2 + 0.02, x, CHEST.d / 2 - 0.02, INK_SOFT, 0.02);
      D.rr(ctx, 0, CHEST.d / 2 - 0.03, 0.1, 0.02, 0, '#c9a35a', null);
    }),
};

/* ------------------------------------------------------------------ explorers' tent */

const TENT = { w: 2.4, d: 2.6, h: 2.1 };
const tent: FurnitureDef = {
  id: 'treasure-tent',
  name: 'אוהל חוקרים',
  category: 'outdoor',
  group: GROUP,
  tags: ['אוהל', 'מחנה', 'חוקרים', 'הרפתקה', 'קמפינג'],
  size: TENT,
  colors: [slot('canvas', 'בד', '#c9b48a'), slot('flag', 'דגל', '#d8453a')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const canvas = M.cloth(c.canvas);
    const inner = M.cloth(darken(c.canvas, 0.35));
    const H = 1.75;
    const half = 1.05;
    const L = 2.2;
    // two sloping canvas sides (ridge along Z)
    for (const s of [-1, 1]) k.beam([0, H, 0], [s * half, 0.02, 0], 0.03, L, canvas);
    // back wall triangle
    const tri = new THREE.Shape();
    tri.moveTo(-half, 0);
    tri.lineTo(half, 0);
    tri.lineTo(0, H);
    tri.closePath();
    k.geo(new THREE.ShapeGeometry(tri), canvas, 0, 0.02, -L / 2 + 0.02).material = canvas;
    // open front flaps folded back, dark inside
    const front = new THREE.Shape();
    front.moveTo(-0.55, 0);
    front.lineTo(0.55, 0);
    front.lineTo(0, H - 0.25);
    front.closePath();
    k.geo(new THREE.ShapeGeometry(front), inner, 0, 0.02, L / 2 - 0.25);
    for (const s of [-1, 1]) {
      const flap = new THREE.Shape();
      flap.moveTo(0, 0);
      flap.lineTo(s * 0.5, 0);
      flap.lineTo(0, H * 0.95);
      flap.closePath();
      const g = new THREE.ShapeGeometry(flap);
      const m = k.geo(g, canvas, s * 0.5, 0.02, L / 2 + 0.02);
      m.rotation.y = s * 0.5;
      (m.material as THREE.Material).side = THREE.DoubleSide;
    }
    // poles, ridge rope and pegs
    const pole = M.wood('#6b4a30');
    k.rod([0, 0, L / 2 + 0.1], [0, H + 0.05, L / 2 + 0.06], 0.025, pole, 0.025, 8);
    k.rod([0, 0, -L / 2 - 0.05], [0, H + 0.05, -L / 2 - 0.02], 0.025, pole, 0.025, 8);
    k.rod([0, H + 0.04, -L / 2 - 0.02], [0, H + 0.04, L / 2 + 0.06], 0.012, M.wicker('#c9b083'), 0.012, 5);
    for (const s of [-1, 1]) for (const z of [-0.9, 0.9]) k.rod([s * 1.05, 0.03, z], [s * 1.16, 0.0, z], 0.015, pole, 0.012, 5);
    // flag on top of the front pole
    k.rod([0, H, L / 2 + 0.06], [0, 2.08, L / 2 + 0.06], 0.012, pole, 0.012, 6);
    const f = new THREE.Shape();
    f.moveTo(0, 0);
    f.lineTo(0.36, -0.1);
    f.lineTo(0, -0.22);
    f.closePath();
    const fm = k.geo(new THREE.ShapeGeometry(f), M.cloth(c.flag), 0, 2.06, L / 2 + 0.06);
    fm.rotation.y = -Math.PI / 2;
    // a lantern and a rolled sleeping bag by the entrance
    k.cyl(0.07, 0.18, M.glow('#ffcf7a', 1.2), 0.75, 0, L / 2 + 0.05, 0.07, 10);
    k.cyl(0.08, 0.02, M.blackMetal(), 0.75, 0.18, L / 2 + 0.05, 0.05, 10);
    const bag = k.cyl(0.13, 0.6, M.cloth('#3f6f8f'), -0.6, 0.13, 0.75, 0.13, 12);
    bag.rotation.z = Math.PI / 2;
    bag.position.y = 0.13;
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.poly(ctx, [[-1.05, -1.1], [1.05, -1.1], [1.05, 1.1], [-1.05, 1.1]], true, tint(c.canvas, 0.35), INK_SOFT, LINE_THIN);
      D.line(ctx, 0, -1.15, 0, 1.2, INK_SOFT, LINE_THIN);
      D.circle(ctx, 0, 1.16, 0.04, c.flag, null);
    }),
};

/* ------------------------------------------------------------------ treasure-map board */

let mapMat: THREE.Material | null = null;
/** A hand-drawn treasure map on parchment (canvas in the browser, plain parchment in Node). */
export function treasureMapMaterial(): THREE.Material {
  if (mapMat) return mapMat;
  if (typeof document === 'undefined') {
    mapMat = M.paint('#e9d7a8');
    return mapMat;
  }
  const W = 512;
  const H = 384;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d')!;
  const grad = g.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, W * 0.7);
  grad.addColorStop(0, '#f3e4bc');
  grad.addColorStop(1, '#c9a86a');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  const r = rng(12);
  // island coastline
  g.beginPath();
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const rad = 120 + Math.sin(a * 3) * 22 + Math.cos(a * 5) * 14 + (r() - 0.5) * 8;
    const x = W / 2 + Math.cos(a) * rad * 1.35;
    const y = H / 2 + Math.sin(a) * rad;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
  g.fillStyle = '#d9c38a';
  g.fill();
  g.strokeStyle = '#7a5a34';
  g.lineWidth = 4;
  g.stroke();
  // dashed trail to the X
  g.setLineDash([12, 10]);
  g.strokeStyle = '#a33a2a';
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(120, 280);
  g.bezierCurveTo(200, 200, 260, 300, 330, 180);
  g.lineTo(360, 150);
  g.stroke();
  g.setLineDash([]);
  g.lineWidth = 9;
  g.beginPath();
  g.moveTo(345, 135);
  g.lineTo(380, 170);
  g.moveTo(380, 135);
  g.lineTo(345, 170);
  g.stroke();
  // palm trees, compass and hills
  g.fillStyle = '#4f7d3c';
  for (const [x, y] of [
    [170, 160],
    [300, 250],
    [220, 120],
  ]) {
    g.beginPath();
    g.arc(x, y, 14, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = '#5b3b22';
  g.lineWidth = 3;
  g.beginPath();
  g.arc(440, 80, 34, 0, Math.PI * 2);
  g.stroke();
  g.beginPath();
  g.moveTo(440, 40);
  g.lineTo(448, 80);
  g.lineTo(440, 120);
  g.lineTo(432, 80);
  g.closePath();
  g.fillStyle = '#a33a2a';
  g.fill();
  g.fillStyle = '#5b3b22';
  g.font = '700 26px system-ui, Arial, sans-serif';
  g.textAlign = 'center';
  g.fillText('צ', 440, 30);
  g.direction = 'rtl';
  g.font = '700 40px system-ui, Arial, sans-serif';
  g.fillText('מפת האוצר', W / 2 - 40, 52);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  mapMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
  return mapMat;
}

const MB = { w: 1.5, d: 0.7, h: 1.95 };
const mapBoard: FurnitureDef = {
  id: 'treasure-map-board',
  name: 'לוח מפת אוצר',
  category: 'outdoor',
  group: GROUP,
  tags: ['מפה', 'אוצר', 'לוח', 'כן ציור', 'הרפתקה'],
  size: MB,
  colors: [slot('wood', 'עץ', '#7a5638')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const wood = M.wood(c.wood, 0.75);
    // an easel: two front legs and a back leg
    for (const s of [-1, 1]) k.rod([s * 0.62, 0, 0.18], [s * 0.5, 1.9, -0.04], 0.03, wood, 0.025, 8);
    k.rod([0, 0, -0.33], [0, 1.85, -0.06], 0.028, wood, 0.022, 8);
    k.box(1.3, 0.05, 0.12, wood, 0, 0.78, 0.09);
    // the board with the map
    const board = k.box(1.24, 0.94, 0.03, M.wood(darken(c.wood, 0.2)), 0, 0.84, 0.05);
    board.rotation.x = -0.1;
    const map = k.box(1.14, 0.84, 0.006, treasureMapMaterial(), 0, 0.89, 0.07);
    map.rotation.x = -0.1;
    // a compass and a magnifying glass on the ledge
    k.cyl(0.06, 0.025, M.brass(), -0.4, 0.83, 0.1, 0.06, 14);
    k.cyl(0.05, 0.004, M.matte('#f3ead2'), -0.4, 0.855, 0.1, 0.05, 14);
    const lens = k.add(new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.01, 6, 16), M.blackMetal()), 0.38, 0.84, 0.1);
    lens.rotation.x = Math.PI / 2;
    k.rod([0.44, 0.84, 0.12], [0.58, 0.84, 0.16], 0.012, M.wood('#4d382b'), 0.012, 6);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.box(ctx, -0.65, 0.0, 0.65, 0.14, 0, tint(c.wood, 0.3), INK_SOFT, LINE_THIN);
      D.box(ctx, -0.55, 0.02, 0.55, 0.08, 0, '#e9d7a8', INK_SOFT, LINE_THIN);
      D.line(ctx, 0, 0, 0, -0.33, INK_SOFT, LINE_THIN);
    }),
};

export const TREASURE_ITEMS: FurnitureDef[] = [chest, tent, mapBoard];

void lighten;
