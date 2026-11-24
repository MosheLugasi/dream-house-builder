/** Team D catalog items: a fishing lake (pier, rowboat, reeds, shore rocks, lily pads). */
import * as THREE from 'three';
import type { FurnitureDef } from '../types';
import { D, INK_SOFT, Kit, M, blobGeo, darken, lighten, rng, sym, tint } from '../kit';
import { slot } from './_parts';

const GROUP = 'אגם';

/* ------------------------------------------------------------------ pier */

/** A low wooden pier: you walk out along +Z; the far end (z = +d/2) is where you fish from. */
export const PIER = { w: 2.6, d: 12, deckY: 0.1, h: 1.0 };

const pier: FurnitureDef = {
  id: 'fishing-pier',
  name: 'מזח עץ לדייג',
  category: 'outdoor',
  group: GROUP,
  tags: ['מזח', 'רציף', 'אגם', 'דייג', 'עץ', 'סיפון'],
  size: { w: PIER.w, d: PIER.d, h: PIER.h },
  walkable: true,
  resize: { w: [1.6, 4], d: [5, 24] },
  colors: [slot('deck', 'סיפון', '#a27a52'), slot('posts', 'עמודים', '#6b4e35')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { w, d, deckY } = PIER;
    const deck = M.wood(c.deck, 0.7);
    const deck2 = M.wood(darken(c.deck, 0.08), 0.75);
    const posts = M.wood(c.posts, 0.8);
    const r = rng(7);
    // joists under the planks
    for (const s of [-1, 1]) k.box(0.12, deckY - 0.03, d, posts, s * (w / 2 - 0.2), 0, 0);
    // planks across the width with small gaps
    const pw = 0.16;
    const n = Math.floor(d / (pw + 0.012));
    for (let i = 0; i < n; i++) {
      const z = -d / 2 + (i + 0.5) * (d / n);
      const t = 0.028 + r() * 0.006;
      k.box(w - 0.02 - r() * 0.04, t, pw, i % 3 === 1 ? deck2 : deck, (r() - 0.5) * 0.02, deckY - t, z);
    }
    // edge beams
    for (const s of [-1, 1]) k.box(0.08, 0.1, d, posts, s * (w / 2 - 0.04), deckY - 0.08, 0);
    // piles poking above the deck, a rope between them
    const rope = M.cloth('#d8c39a');
    const piles: number[] = [];
    for (let z = -d / 2 + 0.3; z <= d / 2 - 0.2; z += 2.4) piles.push(z);
    piles.push(d / 2 - 0.12);
    for (const s of [-1, 1]) {
      for (const z of piles) {
        k.cyl(0.085, 0.75, posts, s * (w / 2 - 0.09), 0, z, 0.08, 10);
        k.cyl(0.09, 0.03, M.metal('#5b5f63', 0.5, 0.6), s * (w / 2 - 0.09), 0.72, z, 0.09, 10);
      }
      for (let i = 0; i < piles.length - 1; i++) {
        const z0 = piles[i];
        const z1 = piles[i + 1];
        k.tube(
          [
            [s * (w / 2 - 0.09), 0.62, z0],
            [s * (w / 2 - 0.09), 0.5, (z0 + z1) / 2],
            [s * (w / 2 - 0.09), 0.62, z1],
          ],
          0.012,
          rope,
          { seg: 10, radial: 5 },
        );
      }
    }
    // a lantern on the last pile and a bait bucket
    k.box(0.16, 0.22, 0.16, M.blackMetal(), w / 2 - 0.09, 0.77, d / 2 - 0.12);
    k.box(0.1, 0.14, 0.1, M.glow('#ffd9a0', 1.2), w / 2 - 0.09, 0.8, d / 2 - 0.12);
    k.cyl(0.13, 0.26, M.plastic('#2f6fb3'), -w / 2 + 0.45, deckY, d / 2 - 0.5, 0.15, 14);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { w, d } = PIER;
      D.box(ctx, -w / 2, -d / 2, w / 2, d / 2, 0, tint(c.deck, 0.35));
      for (let z = -d / 2 + 0.4; z < d / 2; z += 0.4) D.line(ctx, -w / 2, z, w / 2, z, INK_SOFT, 0.006);
      for (const s of [-1, 1]) for (let z = -d / 2 + 0.3; z <= d / 2; z += 2.4) D.circle(ctx, s * (w / 2 - 0.09), z, 0.09, tint(c.posts, 0.2));
    }),
};

/* ------------------------------------------------------------------ rowboat */

function hullGeo(L: number, W: number, H: number): THREE.BufferGeometry {
  const nu = 18;
  const nv = 10;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= nu; i++) {
    const u = i / nu; // 0 = stern, 1 = bow
    const z = -L / 2 + u * L;
    // beam: full at the middle, a transom at the stern, pointed bow
    const hw = (W / 2) * (u < 0.55 ? 0.78 + 0.22 * Math.sin((u / 0.55) * (Math.PI / 2)) : Math.cos(((u - 0.55) / 0.45) * (Math.PI / 2)) ** 0.8) + 0.004;
    const sheer = H + 0.08 * Math.pow(Math.abs(u - 0.45) / 0.55, 2);
    const depth = H * (u < 0.55 ? 1 : 1 - 0.55 * ((u - 0.55) / 0.45));
    for (let j = 0; j <= nv; j++) {
      const phi = (j / nv) * Math.PI;
      const x = hw * Math.cos(phi);
      const y = sheer - depth * Math.pow(Math.sin(phi), 0.7);
      pos.push(x, Math.max(0, y), z);
    }
  }
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const a = i * (nv + 1) + j;
      const b = a + nv + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const rowboat: FurnitureDef = {
  id: 'rowboat',
  name: 'סירת משוטים מעץ',
  category: 'outdoor',
  group: GROUP,
  tags: ['סירה', 'משוטים', 'אגם', 'דייג'],
  size: { w: 1.4, d: 3.55, h: 0.7 },
  resize: false,
  colors: [slot('hull', 'גוף', '#e9e4d8'), slot('stripe', 'פס', '#c8452f'), slot('wood', 'עץ', '#9b7148')],
  seats: [
    { x: 0, z: -0.2, height: 0.34, facing: Math.PI, kind: 'sit' },
    { x: 0, z: -1.2, height: 0.34, facing: 0, kind: 'sit' },
  ],
  build: ({ colors: c }) => {
    const k = new Kit();
    const L = 3.5;
    const W = 1.36;
    const H = 0.6;
    const hull = new THREE.Mesh(hullGeo(L, W, H), M.paint(c.hull, 0.45));
    (hull.material as THREE.Material).side = THREE.DoubleSide;
    hull.castShadow = hull.receiveShadow = true;
    k.g.add(hull);
    // painted stripe and gunwale
    const stripe = new THREE.Mesh(hullGeo(L + 0.02, W + 0.02, H), M.paint(c.stripe, 0.45));
    stripe.scale.set(1, 1, 1);
    const sg = stripe.geometry as THREE.BufferGeometry;
    const p = sg.getAttribute('position');
    // keep only a band near the top by flattening everything else into the hull
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      if (y < H - 0.12) p.setXYZ(i, p.getX(i) * 0.97, y, p.getZ(i) * 0.99);
    }
    sg.computeVertexNormals();
    (stripe.material as THREE.Material).side = THREE.FrontSide;
    k.g.add(stripe);
    const wood = M.wood(c.wood, 0.6);
    k.box(0.12, 0.06, 0.62, wood, 0, H - 0.04, -L / 2 + 0.31);
    k.box(W * 0.94, 0.04, 0.24, wood, 0, 0.3, -0.2);
    k.box(W * 0.9, 0.04, 0.24, wood, 0, 0.3, -1.2);
    k.box(W * 0.62, 0.04, 0.22, wood, 0, 0.36, 0.85);
    k.box(W * 0.98, 0.18, 0.05, M.paint(c.hull, 0.45), 0, 0.18, -L / 2 + 0.03);
    // oars resting inside
    for (const s of [-1, 1]) {
      k.rod([s * 0.42, 0.42, -1.55], [s * 0.36, 0.5, 1.25], 0.022, wood, 0.022, 8);
      const blade = k.box(0.13, 0.012, 0.42, wood, s * 0.36, 0.49, 1.3);
      blade.rotation.y = s * 0.05;
      k.cyl(0.02, 0.07, M.blackMetal(), s * (W / 2 - 0.05), H, -0.2, 0.02, 8);
    }
    k.ring(0.06, 0.012, M.metal('#8a8f94', 0.4, 0.9), 0, H, L / 2 - 0.08, 12);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      ctx.beginPath();
      ctx.moveTo(-0.62, -1.75);
      ctx.lineTo(0.62, -1.75);
      ctx.quadraticCurveTo(0.72, 0.4, 0, 1.75);
      ctx.quadraticCurveTo(-0.72, 0.4, -0.62, -1.75);
      ctx.closePath();
      ctx.fillStyle = tint(c.hull, 0.2);
      ctx.fill();
      ctx.stroke();
      for (const z of [-1.2, -0.2, 0.85]) D.line(ctx, -0.55, z, 0.55, z, darken(c.wood, 0.1), 0.06);
    }),
};

/* ------------------------------------------------------------------ reeds */

const reeds: FurnitureDef = {
  id: 'lake-reeds',
  name: 'קני סוף על שפת האגם',
  category: 'outdoor',
  group: GROUP,
  tags: ['קנים', 'סוף', 'אגם', 'צמחים', 'ביצה'],
  size: { w: 1.6, d: 1.1, h: 1.9 },
  colors: [slot('leaf', 'עלים', '#6f8f3e')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const r = rng(31);
    const leaf = M.leaf(c.leaf);
    const leaf2 = M.leaf(darken(c.leaf, 0.18));
    const head = M.matte('#6a4426');
    for (let i = 0; i < 34; i++) {
      const a = r() * Math.PI * 2;
      const rr = Math.sqrt(r()) * 0.42;
      const x = Math.cos(a) * rr * 1.4;
      const z = Math.sin(a) * rr;
      const h = 0.8 + r() * 1.0;
      const lean = 0.18 + r() * 0.2;
      const tx = Math.max(-0.78, Math.min(0.78, x + Math.cos(a) * lean));
      const tz = Math.max(-0.53, Math.min(0.53, z + Math.sin(a) * lean));
      k.rod([x, 0, z], [tx, h, tz], 0.016, i % 3 ? leaf : leaf2, 0.002, 4);
      if (i % 4 === 0) {
        // cattail: stem + brown head
        const sx = x * 0.6;
        const sz = z * 0.6;
        const top = 1.35 + r() * 0.45;
        k.rod([sx, 0, sz], [sx + 0.03, top, sz], 0.008, leaf2, 0.006, 4);
        k.cyl(0.026, 0.2, head, sx + 0.03, top - 0.32, sz, 0.026, 7);
      }
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.foliage(ctx, 0, 0, 0.5, tint(c.leaf, 0.3), 9, 3);
    }),
};

/* ------------------------------------------------------------------ shore rocks */

const rocks: FurnitureDef = {
  id: 'lake-rocks',
  name: 'סלעים על החוף',
  category: 'outdoor',
  group: GROUP,
  tags: ['סלע', 'אבנים', 'חוף', 'אגם', 'גינה'],
  size: { w: 2.0, d: 1.4, h: 0.72 },
  colors: [slot('stone', 'אבן', '#8f8a80')],
  seats: [{ x: -0.45, z: 0.1, height: 0.62, facing: 0, kind: 'sit' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const set: Array<[number, number, number, number, number, number]> = [
      [-0.4, 0.0, 0.29, 0.5, 0.48, 3],
      [0.5, -0.15, 0.2, 0.42, 0.46, 5],
      [0.18, 0.38, 0.13, 0.3, 0.26, 8],
      [-0.75, 0.4, 0.09, 0.2, 0.2, 11],
    ];
    // [x, z, half height, half width, half depth, seed]; blobs reach about 1.2 × their scale
    for (const [x, z, hs, sx, sz, seed] of set) {
      const g = blobGeo(1, 2, seed, 0.22, 1.4);
      const m = k.geo(g, M.stone(seed % 2 ? c.stone : lighten(c.stone, 0.1), 0.8), x, hs * 1.2, z);
      m.scale.set(sx, hs, sz);
    }
    // moss
    const moss = blobGeo(1, 1, 4, 0.2, 2);
    k.geo(moss, M.foliage('#5d7a35'), -0.45, 0.6, -0.05).scale.set(0.28, 0.06, 0.24);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.ellipse(ctx, -0.45, 0, 0.6, 0.45, tint(c.stone, 0.3));
      D.ellipse(ctx, 0.5, -0.15, 0.48, 0.42, tint(c.stone, 0.4));
      D.ellipse(ctx, 0.2, 0.42, 0.3, 0.26, tint(c.stone, 0.35));
    }),
};

/* ------------------------------------------------------------------ lily pads */

const lily: FurnitureDef = {
  id: 'lily-pads',
  name: 'עלי נופר על המים',
  category: 'outdoor',
  group: GROUP,
  tags: ['נופר', 'פרחים', 'אגם', 'מים'],
  size: { w: 1.4, d: 1.3, h: 0.1 },
  walkable: true,
  colors: [slot('pad', 'עלים', '#4f8a3a'), slot('flower', 'פרח', '#f4a6c6')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const r = rng(5);
    const pad = M.leaf(c.pad);
    const pad2 = M.leaf(darken(c.pad, 0.15));
    const pads: Array<[number, number, number]> = [];
    for (let i = 0; i < 9; i++) pads.push([(r() - 0.5) * 1.1, (r() - 0.5) * 0.9, 0.14 + r() * 0.12]);
    pads.forEach(([x, z, rad], i) => {
      const g = new THREE.CircleGeometry(rad, 16, 0.3, Math.PI * 2 - 0.45);
      g.rotateX(-Math.PI / 2);
      g.rotateY(r() * Math.PI * 2);
      k.geo(g, i % 2 ? pad : pad2, x, 0.025 + i * 0.001, z);
    });
    const fl = M.paint(c.flower, 0.6);
    for (const [x, z] of pads.slice(0, 3)) {
      for (let p = 0; p < 6; p++) {
        const a = (p / 6) * Math.PI * 2;
        const petal = k.sphere(0.05, fl, x + Math.cos(a) * 0.035, 0.07, z + Math.sin(a) * 0.035, 0.6, 0.45, 1, 8);
        petal.rotation.y = -a;
      }
      k.sphere(0.025, M.paint('#f5d33f', 0.6), x, 0.08, z, 1, 0.7, 1, 8);
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const r = rng(5);
      for (let i = 0; i < 9; i++) D.circle(ctx, (r() - 0.5) * 1.1, (r() - 0.5) * 0.9, 0.14 + r() * 0.12, tint(c.pad, 0.3), INK_SOFT, 0.006);
    }),
};

export const LAKE_ITEMS: FurnitureDef[] = [pier, rowboat, reeds, rocks, lily];
