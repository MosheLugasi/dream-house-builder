import * as THREE from 'three';
import type { FurnitureDef } from '../types';
import { D, INK_SOFT, Kit, LINE_THIN, M, PAL, blobGeo, darken, latheGeo, leafGeo, lighten, mesh, mix, rng, smoothProfile, sym, tint, type V3 } from '../kit';
import { bookStack, slot } from './_parts';
import { GOLDEN, basket, beadGeo, bladeGeo, fleshGeo, leafAt, leafMats, leafShape, orient, plantTop, planter, taperTube, vec } from './_flora';

/* ------------------------------------------------------------------ shared bits */

const UP = vec(0, 1, 0);
/** outward direction at azimuth `a` (0 = +X, counter-clockwise seen from above... in XZ) with pitch `p` */
const out = (a: number, p: number): THREE.Vector3 => vec(Math.cos(a) * Math.cos(p), Math.sin(p), Math.sin(a) * Math.cos(p));
const jitterUp = (r: () => number, amt = 0.5): THREE.Vector3 => vec((r() - 0.5) * amt, 1, (r() - 0.5) * amt);
const curveOf = (pts: V3[]): THREE.CatmullRomCurve3 => new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
const V = (v: THREE.Vector3): V3 => [v.x, v.y, v.z];

function tube(k: Kit, pts: V3[], r0: number, r1: number, mat: THREE.Material, radial = 5, seg?: number): THREE.Mesh {
  return k.add(mesh(taperTube(pts, r0, r1, { radial, seg }), mat));
}

/** Small cone (spine / needle) growing along +Z from the origin. */
function spineGeo(len: number, r: number): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(r, len, 3, 1, true);
  g.rotateX(Math.PI / 2);
  g.translate(0, 0, len / 2);
  return g;
}

/** Ribbed surface of revolution (cacti). Ridges sit at phi = 2πm / ribs. */
function ribbedGeo(profile: Array<[number, number]>, ribs: number, depth: number, seg = ribs * 3): THREE.BufferGeometry {
  const g = latheGeo(profile, seg);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const phi = Math.atan2(x, z);
    const k = 1 - depth * (0.5 - 0.5 * Math.cos(ribs * phi));
    p.setXYZ(i, x * k, p.getY(i), z * k);
  }
  g.computeVertexNormals();
  return g;
}

const heartShape = (u: number): number => Math.pow(Math.sin(Math.PI * (0.16 + 0.84 * u)), 0.62);
const roundShape = (u: number): number => Math.pow(Math.sin(Math.PI * (0.06 + 0.94 * u)), 0.5);

/* ------------------------------------------------------------------ 1. fiddle-leaf fig */

const fiddleShape = (u: number): number => leafShape(0.66, 0.5)(u) * (1 - 0.17 * Math.exp(-(((u - 0.42) / 0.11) ** 2)));

const fiddleLeaf: FurnitureDef = {
  id: 'plant-fiddle-leaf',
  name: 'פיקוס כינור',
  category: 'decor',
  group: 'צמחים',
  tags: ['פיקוס', 'כינור', 'עץ', 'סל נצרים', 'צמח גדול', 'ירוק'],
  size: { w: 0.78, d: 0.78, h: 1.8 },
  colors: [slot('pot', 'סל', '#b48d5c'), slot('leaves', 'עלים', '#3b6a32')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const r = rng(101);
    const soil = basket(k, 0.2, 0.38, c.pot);
    const bark = M.bark('#7b6652');
    const trunk: V3[] = [
      [0, soil - 0.03, 0],
      [0.018, 0.62, 0.01],
      [-0.022, 1.0, -0.014],
      [0.012, 1.4, 0.012],
      [0, 1.66, 0],
    ];
    tube(k, trunk, 0.024, 0.007, bark, 6, 18);
    const cv = curveOf(trunk);
    const mats = leafMats(c.leaves);
    const geo = bladeGeo(0.33, 0.24, { shape: fiddleShape, rows: 8, cols: 2, fold: 0.16, droop: 0.12, wave: 0.009, waveFreq: 3, curl: 0.012 });
    const n = 32;
    for (let i = 0; i < n; i++) {
      const t = 0.3 + (i / (n - 1)) * 0.7;
      const p = cv.getPointAt(Math.min(0.995, t));
      const a = i * GOLDEN;
      const pitch = -0.15 + t * 0.95 + (r() - 0.5) * 0.25;
      const s = 1.08 - t * 0.38 + r() * 0.08;
      const dir = out(a, pitch);
      leafAt(k, geo, mats[Math.floor(r() * mats.length)], [p.x + Math.cos(a) * 0.02, p.y, p.z + Math.sin(a) * 0.02], dir, jitterUp(r, 0.6), s);
    }
    return k.g;
  },
  draw2d: (ctx, c) => sym(ctx, () => plantTop(ctx, { pot: 0.2, potColor: c.pot, leaf: c.leaves, n: 13, reach: 0.38, len: 0.24, wid: 0.15, seed: 2 })),
};

/* ------------------------------------------------------------------ 2. monstera */

const monsteraShape = (u: number): number => Math.pow(Math.sin(Math.PI * (0.14 + 0.86 * u)), 0.55);

function monsteraLeaf(len: number, seed: number): THREE.BufferGeometry {
  const r = rng(seed);
  const slits: Array<[number, number, number]> = [];
  const n = 5;
  for (let i = 0; i < n; i++) {
    const u = 0.14 + (i / (n - 1)) * 0.62 + (r() - 0.5) * 0.05;
    slits.push([u, u + 0.012 + r() * 0.006, [0.3, 0.45, 0.62][Math.floor(r() * 3)]]);
  }
  return bladeGeo(len, len * 0.92, { shape: monsteraShape, rows: 7, cols: 2, slits, slitIn: 0.3, slant: 0.38, fold: 0.1, droop: 0.22, curl: 0.01 });
}

const monstera: FurnitureDef = {
  id: 'plant-monstera',
  name: 'מונסטרה',
  category: 'decor',
  group: 'צמחים',
  tags: ['מונסטרה', 'עלים מחוררים', 'טרופי', 'צמח בית', 'עמוד אזוב'],
  size: { w: 1.3, d: 1.25, h: 1.12 },
  colors: [slot('pot', 'עציץ', '#f1eee8'), slot('leaves', 'עלים', '#2f5e2c')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const r = rng(7);
    const soil = planter(k, { style: 'cylinder', r: 0.18, h: 0.32, mat: M.ceramic(c.pot), top: 'soil' });
    // moss pole
    k.cyl(0.026, 0.78, M.foliage('#6a6b3e'), 0, soil - 0.02, -0.03, 0.022, 8);
    const petiole = M.leaf(mix(c.leaves, '#9fb36a', 0.35));
    const mats = leafMats(c.leaves);
    const geos = [monsteraLeaf(0.42, 1), monsteraLeaf(0.42, 2), monsteraLeaf(0.42, 3)];
    const n = 9;
    for (let i = 0; i < n; i++) {
      const a = i * GOLDEN + 0.4;
      const t = i / (n - 1);
      const reach = 0.1 + (1 - t) * 0.13 + r() * 0.04;
      const top = 0.55 + t * 0.42 + r() * 0.06;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const base: V3 = [ca * 0.03, soil - 0.01, sa * 0.03];
      const tip: V3 = [ca * reach, top, sa * reach];
      tube(k, [base, [ca * reach * 0.2, soil + (top - soil) * 0.6, sa * reach * 0.2], [ca * reach * 0.7, top + 0.03, sa * reach * 0.7], tip], 0.008, 0.005, petiole, 4, 10);
      const s = 0.82 + (1 - t) * 0.25 + r() * 0.08;
      leafAt(k, geos[i % 3], mats[i % mats.length], tip, out(a, -0.05 - (1 - t) * 0.35 + r() * 0.15), vec(ca * 0.4, 1, sa * 0.4), s);
    }
    // a new leaf still rolled up
    tube(k, [[0.02, soil, 0.03], [0.03, 0.85, 0.05], [0.05, 1.02, 0.08]], 0.007, 0.004, petiole, 4, 8);
    tube(k, [[0.05, 1.0, 0.08], [0.06, 1.1, 0.1]], 0.012, 0.002, M.leaf(lighten(c.leaves, 0.3)), 5, 4);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      plantTop(ctx, { pot: 0.18, potColor: c.pot, leaf: c.leaves, n: 9, reach: 0.49, len: 0.36, wid: 0.3, seed: 1 });
    }),
};

/* ------------------------------------------------------------------ 3. bird of paradise */

const birdOfParadise: FurnitureDef = {
  id: 'plant-bird-of-paradise',
  name: 'ציפור גן עדן',
  category: 'decor',
  group: 'צמחים',
  tags: ['סטרליציה', 'ציפור גן עדן', 'טרופי', 'צמח גדול', 'בטון'],
  size: { w: 1.3, d: 0.5, h: 1.9 },
  colors: [slot('pot', 'עציץ', '#9d9b96'), slot('leaves', 'עלים', '#3a6436')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const r = rng(13);
    const soil = planter(k, { style: 'cylinder', r: 0.22, h: 0.42, mat: M.stone(c.pot, 0.85), top: 'soil' });
    const mats = leafMats(c.leaves);
    const stem = M.leaf(mix(c.leaves, '#8f9f62', 0.3));
    const tears: Array<[number, number]> = [[0.32, 0.335], [0.55, 0.562], [0.7, 0.71]];
    const geoA = bladeGeo(0.56, 0.21, { shape: (u) => Math.pow(Math.sin(Math.PI * u), 0.42), rows: 9, cols: 2, fold: 0.12, droop: 0.06, slits: tears, slitIn: 0.25, twist: 0.25 });
    const geoB = bladeGeo(0.5, 0.19, { shape: (u) => Math.pow(Math.sin(Math.PI * u), 0.45), rows: 9, cols: 2, fold: 0.15, droop: 0.08, twist: -0.2 });
    const n = 9;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const th = (t - 0.5) * 1.1 + (r() - 0.5) * 0.1; // fan angle from vertical, in the XY plane
      const zl = (r() - 0.5) * 0.24;
      const plen = 0.6 + (1 - Math.abs(t - 0.5) * 2) * 0.42 + r() * 0.1;
      const dir = vec(Math.sin(th), Math.cos(th), zl).normalize();
      const base: V3 = [(r() - 0.5) * 0.06, soil - 0.01, (r() - 0.5) * 0.06];
      const tip: V3 = [base[0] + dir.x * plen, base[1] + dir.y * plen, base[2] + dir.z * plen];
      const mid: V3 = [base[0] + dir.x * plen * 0.5, base[1] + dir.y * plen * 0.52, base[2] + dir.z * plen * 0.5];
      tube(k, [base, mid, tip], 0.013, 0.006, stem, 5, 6);
      const ld = vec(dir.x * 1.15, dir.y, dir.z).normalize();
      leafAt(k, i % 2 ? geoA : geoB, mats[i % mats.length], tip, ld, vec(0, 0.25, i % 2 ? 1 : -1), 0.9 + r() * 0.15);
    }
    // sheathing leaf bases
    for (let i = 0; i < 4; i++) k.cyl(0.035 - i * 0.006, 0.12 + i * 0.05, M.foliage('#76784a'), (r() - 0.5) * 0.03, soil - 0.01, (r() - 0.5) * 0.03, 0.012, 7);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.circle(ctx, 0, 0, 0.22, tint(c.pot, 0.4), undefined, LINE_THIN);
      const fill = tint(c.leaves, 0.42);
      for (let i = 0; i < 7; i++) {
        const x = (i / 6 - 0.5) * 0.88;
        D.ellipse(ctx, x, (i % 2 ? 1 : -1) * 0.06, 0.13, 0.08, fill, INK_SOFT, 0.006, (i % 2 ? 0.3 : -0.3));
      }
    }),
};

/* ------------------------------------------------------------------ 4. olive tree */

const oliveTree: FurnitureDef = {
  id: 'plant-olive-tree',
  name: 'עץ זית בעציץ',
  category: 'decor',
  group: 'צמחים',
  tags: ['זית', 'עץ', 'ים תיכוני', 'טרקוטה', 'עציץ גדול'],
  size: { w: 1.06, d: 1.06, h: 1.78 },
  colors: [slot('pot', 'עציץ', '#c27a55'), slot('leaves', 'עלים', '#66745a')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const r = rng(29);
    const soil = planter(k, { style: 'tapered', r: 0.27, h: 0.46, mat: M.clay(c.pot), top: 'soil', seg: 20 });
    const bark = M.bark('#857766');
    // two intertwined trunks
    const t1: V3[] = [[0.03, soil - 0.03, 0], [0.05, 0.62, 0.03], [-0.02, 0.82, 0.04], [0.02, 1.0, -0.01], [0.06, 1.15, 0.02]];
    const t2: V3[] = [[-0.03, soil - 0.03, 0.01], [-0.04, 0.6, -0.03], [0.02, 0.8, -0.03], [-0.03, 1.0, 0.02], [-0.07, 1.12, 0.0]];
    tube(k, t1, 0.034, 0.022, bark, 7, 16);
    tube(k, t2, 0.03, 0.02, bark, 7, 16);
    const clusters: V3[] = [];
    const cr = rng(5);
    for (let i = 0; i < 11; i++) {
      const a = i * GOLDEN;
      const el = -0.35 + cr() * 1.3;
      const rad = i < 8 ? 0.85 : 0.35;
      const cp: V3 = [Math.cos(a) * Math.cos(el) * 0.36 * rad, 1.44 + Math.sin(el) * 0.24 * rad, Math.sin(a) * Math.cos(el) * 0.36 * rad];
      clusters.push(cp);
      const from: V3 = i % 2 ? [0.06, 1.13, 0.02] : [-0.06, 1.1, 0];
      const mid: V3 = [from[0] + (cp[0] - from[0]) * 0.4, from[1] + (cp[1] - from[1]) * 0.55 + 0.03, from[2] + (cp[2] - from[2]) * 0.4];
      tube(k, [from, mid, cp], 0.014, 0.004, bark, 4, 5);
    }
    const crown = [M.foliage(darken(c.leaves, 0.12)), M.foliage(darken(mix(c.leaves, '#9aa58a', 0.3), 0.08))];
    const top = M.leaf(darken(c.leaves, 0.08));
    const under = M.leaf(mix(c.leaves, '#c9ceb9', 0.5));
    const lg = leafGeo(0.085, 0.015, { seg: 1, fold: 0.35, droop: 0 });
    clusters.forEach((cp, ci) => {
      const b = k.geo(blobGeo(0.07, 1, ci + 3, 0.38, 2.6), crown[ci % 2], cp[0], cp[1] + 0.02, cp[2]);
      b.scale.set(1.2, 0.85, 1.05);
      b.rotation.y = ci;
      for (let i = 0; i < 25; i++) {
        const a = r() * Math.PI * 2;
        const el = (r() - 0.4) * 2.2;
        const d = out(a, el);
        const rad = 0.06 + r() * 0.09;
        const p: V3 = [cp[0] + d.x * rad * 1.3, cp[1] + 0.03 + d.y * rad * 0.8, cp[2] + d.z * rad * 1.1];
        leafAt(k, lg, i % 3 ? top : under, p, out(a + (r() - 0.5), el * 0.4 - 0.35), jitterUp(r, 1.4), 0.85 + r() * 0.35);
      }
      if (ci % 2 === 0) for (let j = 0; j < 3; j++) k.sphere(0.009, M.lacquer('#2e2a35'), cp[0] + (r() - 0.5) * 0.12, cp[1] - 0.04, cp[2] + (r() - 0.5) * 0.12, 1, 1.25, 1, 6);
    });
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.circle(ctx, 0, 0, 0.27, tint(c.pot, 0.4), undefined, LINE_THIN);
      D.foliage(ctx, 0, 0, 0.45, tint(c.leaves, 0.45), 9, 5, INK_SOFT);
      D.circle(ctx, 0, 0, 0.04, tint('#857766', 0.2), INK_SOFT, LINE_THIN);
    }),
};

/* ------------------------------------------------------------------ 5. kentia palm */

const kentiaPalm: FurnitureDef = {
  id: 'plant-kentia-palm',
  name: 'דקל קנטיה',
  category: 'decor',
  group: 'צמחים',
  tags: ['דקל', 'פלמה', 'קנטיה', 'טרופי', 'צמח גדול'],
  size: { w: 1.3, d: 1.3, h: 1.95 },
  colors: [slot('pot', 'עציץ', '#2f3134'), slot('leaves', 'עלים', '#3f6b35')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const r = rng(53);
    const soil = planter(k, { style: 'cone', r: 0.21, h: 0.48, mat: M.matte(c.pot), top: 'soil', seg: 24 });
    const stem = M.leaf(mix(c.leaves, '#7b8a4a', 0.3));
    const mats = leafMats(c.leaves);
    const lg = leafGeo(0.3, 0.032, { seg: 3, fold: 0.55, droop: 0.42, tipBias: 0.35 });
    const n = 8;
    for (let i = 0; i < n; i++) {
      const a = i * GOLDEN;
      const t = i / (n - 1);
      const reach = 0.42 + r() * 0.12 - t * 0.12;
      const H = 1.45 + t * 0.35 + r() * 0.08;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const pts: V3[] = [
        [ca * 0.02, soil - 0.02, sa * 0.02],
        [ca * 0.06, soil + (H - soil) * 0.45, sa * 0.06],
        [ca * reach * 0.55, H, sa * reach * 0.55],
        [ca * reach, H - 0.16 - (1 - t) * 0.12, sa * reach],
      ];
      tube(k, pts, 0.01, 0.003, stem, 4, 14);
      const cv = curveOf(pts);
      const m = 12;
      for (let j = 0; j < m; j++) {
        const u = 0.42 + (j / (m - 1)) * 0.56;
        const p = cv.getPointAt(u);
        const tg = cv.getTangentAt(u);
        const side = new THREE.Vector3().crossVectors(tg, UP).normalize();
        const s = 1 - Math.abs(u - 0.62) * 1.1;
        for (const sd of [-1, 1]) {
          const d = side.clone().multiplyScalar(sd * 0.8).addScaledVector(tg, 0.6).add(vec(0, -0.15, 0)).normalize();
          leafAt(k, lg, mats[(i + j) % mats.length], p, d, jitterUp(r, 0.4), Math.max(0.45, s));
        }
      }
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.circle(ctx, 0, 0, 0.21, tint(c.pot, 0.5), undefined, LINE_THIN);
      const fill = tint(c.leaves, 0.42);
      for (let i = 0; i < 8; i++) {
        const a = i * GOLDEN;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        D.ellipse(ctx, ca * 0.36, sa * 0.36, 0.26, 0.11, fill, INK_SOFT, 0.006, a);
        D.line(ctx, ca * 0.12, sa * 0.12, ca * 0.6, sa * 0.6, tint(c.leaves, 0.1), 0.005);
      }
    }),
};

/* ------------------------------------------------------------------ 6. columnar cactus */

function bendArm(p: THREE.Vector3, Lb: number): THREE.Vector3 {
  const R = Lb / (Math.PI / 2);
  if (p.y <= Lb) {
    const ph = Math.max(0, p.y) / R;
    const P = vec(R * Math.sin(ph), R * (1 - Math.cos(ph)), 0);
    const nX = vec(Math.sin(ph), -Math.cos(ph), 0);
    return P.addScaledVector(nX, p.x).add(vec(0, 0, p.z));
  }
  return vec(R + p.x, R + (p.y - Lb), p.z);
}

const cactusColumn: FurnitureDef = {
  id: 'plant-cactus-column',
  name: 'קקטוס עמוד',
  category: 'decor',
  group: 'צמחים',
  tags: ['קקטוס', 'צבר', 'סוקולנט', 'מדברי', 'טרקוטה'],
  size: { w: 0.46, d: 0.4, h: 1.6 },
  colors: [slot('pot', 'עציץ', '#c4825f'), slot('leaves', 'קקטוס', '#4e7a4f')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const soil = planter(k, { style: 'tapered', r: 0.17, h: 0.27, mat: M.clay(c.pot), top: 'pebbles', saucer: M.clay(darken(c.pot, 0.08)), seg: 24 });
    const skin = M.foliage(c.leaves);
    const spineMat = M.matte('#efe8d6');
    const sg = spineGeo(0.014, 0.0013);
    const ribs = 8;
    const L = 1.3;
    const main = ribbedGeo([[0, 0], [0.06, 0], [0.068, 0.06], [0.068, L - 0.07], [0.056, L - 0.025], [0.03, L - 0.004], [0, L]], ribs, 0.18, ribs * 4);
    k.geo(main, skin, 0, soil - 0.02, 0);
    const spines = (pt: (p: THREE.Vector3) => THREE.Vector3, rad: number, y0: number, y1: number, step: number, off: number): void => {
      for (let m = 0; m < ribs; m++) {
        const phi = (m / ribs) * Math.PI * 2;
        for (let y = y0 + ((m % 2) * step) / 2; y < y1; y += step) {
          const n = vec(Math.sin(phi), 0, Math.cos(phi));
          const p = pt(vec(n.x * rad, y, n.z * rad));
          const q = pt(vec(n.x * (rad + 0.02), y, n.z * (rad + 0.02)));
          const d = q.sub(p).normalize();
          for (let s = 0; s < 3; s++) {
            const dd = d.clone().add(vec(Math.cos(s * 2.1) * 0.5, Math.sin(s * 2.1) * 0.5, (s - 1) * 0.3)).normalize();
            leafAt(k, sg, spineMat, vec(p.x + off * 0, p.y, p.z), dd);
          }
        }
      }
    };
    const y0 = soil - 0.02;
    spines((p) => vec(p.x, p.y + y0, p.z), 0.068, 0.08, L - 0.05, 0.1, 0);
    // two arms bending upwards
    const arms: Array<{ a: number; y: number; L: number }> = [
      { a: 0, y: 0.68, L: 0.4 },
      { a: Math.PI, y: 0.92, L: 0.3 },
    ];
    for (const arm of arms) {
      const Lb = 0.11;
      const ar = 0.046;
      const prof: Array<[number, number]> = [[0, 0], [ar, 0.0]];
      for (let i = 1; i <= 6; i++) prof.push([ar, (i / 6) * Lb]);
      prof.push([ar, arm.L - 0.05], [ar * 0.82, arm.L - 0.015], [ar * 0.4, arm.L - 0.002], [0, arm.L]);
      const g = ribbedGeo(prof, ribs, 0.18, ribs * 3);
      const p = g.getAttribute('position') as THREE.BufferAttribute;
      const tmp = vec(0, 0, 0);
      for (let i = 0; i < p.count; i++) {
        tmp.set(p.getX(i), p.getY(i), p.getZ(i));
        const q = bendArm(tmp, Lb);
        p.setXYZ(i, q.x, q.y, q.z);
      }
      g.computeVertexNormals();
      const m = k.geo(g, skin, 0, y0 + arm.y, 0);
      m.rotation.y = arm.a;
      const ca = Math.cos(arm.a);
      const sa = Math.sin(arm.a);
      spines(
        (q) => {
          const b = bendArm(q, Lb);
          return vec(b.x * ca + b.z * sa, b.y + y0 + arm.y, -b.x * sa + b.z * ca);
        },
        ar,
        Lb + 0.02,
        arm.L - 0.04,
        0.09,
        0,
      );
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.circle(ctx, 0, 0, 0.17, tint(c.pot, 0.4), undefined, LINE_THIN);
      const fill = tint(c.leaves, 0.35);
      D.circle(ctx, 0, 0, 0.068, fill, undefined, LINE_THIN);
      D.rr(ctx, 0.11, 0, 0.1, 0.09, 0.045, fill, undefined, LINE_THIN);
      D.rr(ctx, -0.11, 0, 0.1, 0.09, 0.045, fill, undefined, LINE_THIN);
    }),
};

/* ------------------------------------------------------------------ 7. barrel cactus */

const cactusBarrel: FurnitureDef = {
  id: 'plant-cactus-barrel',
  name: 'קקטוס חבית',
  category: 'decor',
  group: 'צמחים',
  tags: ['קקטוס', 'חבית', 'סוקולנט', 'בטון', 'קטן'],
  size: { w: 0.36, d: 0.36, h: 0.36 },
  colors: [slot('pot', 'קערה', '#b4b0a8'), slot('leaves', 'קקטוס', '#5a8a45')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const soil = planter(k, { style: 'bowl', r: 0.17, h: 0.13, mat: M.stone(c.pot, 0.8), top: 'none', seg: 24 });
    k.lathe([[0.155, 0], [0.1, 0.01], [0, 0.014]], M.stone('#cfc6b4', 0.9), 0, soil - 0.012, 0, 20);
    const ribs = 18;
    const prof = smoothProfile([[0, 0], [0.07, 0.004], [0.115, 0.04], [0.128, 0.1], [0.112, 0.17], [0.065, 0.205], [0, 0.212]], 10);
    const y0 = soil - 0.015;
    k.geo(ribbedGeo(prof, ribs, 0.12, ribs * 3), M.foliage(c.leaves), 0, y0, 0);
    const sg = spineGeo(0.022, 0.0012);
    const gold = M.matte('#e2c66f');
    const cv = new THREE.SplineCurve(prof.map(([a, b]) => new THREE.Vector2(a, b)));
    for (let m = 0; m < ribs; m++) {
      const phi = (m / ribs) * Math.PI * 2;
      for (let j = 0; j < 6; j++) {
        const t = 0.2 + j * 0.13 + (m % 2) * 0.06;
        if (t > 0.92) continue;
        const pp = cv.getPoint(t);
        const tg = cv.getTangent(t);
        const n2 = vec(Math.sin(phi), 0, Math.cos(phi));
        const nrm = vec(n2.x * tg.y, -tg.x, n2.z * tg.y).normalize();
        const p = vec(n2.x * pp.x, y0 + pp.y, n2.z * pp.x);
        for (let s = 0; s < 3; s++) {
          const dd = nrm.clone().add(vec(Math.cos(s * 2.1 + m) * 0.55, Math.sin(s * 2.1) * 0.45, Math.sin(s * 2.1 + m) * 0.55)).normalize();
          leafAt(k, sg, gold, p, dd);
        }
      }
    }
    // woolly crown
    k.sphere(0.035, M.fur('#e9dfc3'), 0, y0 + 0.205, 0, 1, 0.35, 1, 10);
    // a small pup
    k.sphere(0.035, M.foliage(lighten(c.leaves, 0.08)), 0.1, y0 + 0.02, 0.07, 1, 0.85, 1, 10);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.circle(ctx, 0, 0, 0.17, tint(c.pot, 0.4), undefined, LINE_THIN);
      D.circle(ctx, 0, 0, 0.128, tint(c.leaves, 0.35), undefined, LINE_THIN);
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2;
        D.line(ctx, Math.cos(a) * 0.035, Math.sin(a) * 0.035, Math.cos(a) * 0.125, Math.sin(a) * 0.125, tint(c.leaves, 0.05), 0.004);
      }
      D.circle(ctx, 0, 0, 0.03, tint('#e9dfc3', 0.2), INK_SOFT, 0.005);
    }),
};

/* ------------------------------------------------------------------ 8. succulent trio */

function echeveria(k: Kit, x: number, y: number, z: number, color: string, seed: number, scale = 1): void {
  const r = rng(seed);
  const rings = [
    { n: 8, len: 0.05, pitch: 0.12, col: mix(color, '#c98a92', 0.3) },
    { n: 6, len: 0.042, pitch: 0.45, col: color },
    { n: 5, len: 0.032, pitch: 0.85, col: lighten(color, 0.1) },
  ];
  rings.forEach((ring, ri) => {
    const g = fleshGeo(ring.len * scale, 0.032 * scale * (1 - ri * 0.15), 0.011 * scale, { widest: 0.6, blunt: 0.4 });
    for (let i = 0; i < ring.n; i++) {
      const a = (i / ring.n) * Math.PI * 2 + ri * 0.4 + r() * 0.1;
      leafAt(k, g, M.foliage(ring.col), [x + Math.cos(a) * 0.006, y + ri * 0.006, z + Math.sin(a) * 0.006], out(a, ring.pitch), UP);
    }
  });
}

const succulentTrio: FurnitureDef = {
  id: 'plant-succulent-trio',
  name: 'שלישיית סוקולנטים',
  category: 'decor',
  group: 'צמחים',
  tags: ['סוקולנט', 'אצ\'ווריה', 'קרסולה', 'קערות', 'קטן', 'שולחן'],
  size: { w: 0.5, d: 0.18, h: 0.18 },
  colors: [slot('pot', 'קערות', '#e9e1d4'), slot('leaves', 'עלים', '#8fb3a2')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const r = rng(61);
    // 1. echeveria in a low bowl
    const s1 = planter(k, { style: 'bowl', r: 0.08, h: 0.065, mat: M.ceramic(c.pot), x: -0.165, top: 'pebbles', seg: 18 });
    echeveria(k, -0.165, s1 - 0.004, 0, c.leaves, 3, 1.1);
    // 2. haworthia in a small cylinder
    const pot2 = mix(c.pot, '#3d4a52', 0.6);
    const s2 = planter(k, { style: 'cylinder', r: 0.058, h: 0.085, mat: M.ceramic(pot2), x: 0, top: 'soil', seg: 18 });
    const hg = fleshGeo(0.075, 0.02, 0.009, { widest: 0.2, blunt: 0.5 });
    for (let i = 0; i < 11; i++) {
      const a = i * GOLDEN;
      const t = i / 10;
      leafAt(k, hg, M.foliage(i % 2 ? '#30523a' : '#3c6146'), [Math.cos(a) * 0.01, s2 - 0.004, Math.sin(a) * 0.01], out(a, 1.25 - t * 0.6), UP, 1.05 - t * 0.35);
    }
    // 3. jade plant in an egg pot
    const pot3 = mix(c.pot, PAL.terracotta, 0.55);
    const s3 = planter(k, { style: 'egg', r: 0.062, h: 0.075, mat: M.ceramic(pot3), x: 0.165, top: 'soil', seg: 18 });
    const wood = M.bark('#6f6a48');
    const jade = M.leaf('#4f7d44');
    const jg = fleshGeo(0.03, 0.021, 0.008, { widest: 0.62, blunt: 0.45 });
    const tips: Array<[V3, number]> = [];
    for (let b = 0; b < 3; b++) {
      const a = b * 2.1 + 0.3;
      const tip: V3 = [0.165 + Math.cos(a) * 0.035, s3 + 0.06 + b * 0.015, Math.sin(a) * 0.03];
      tube(k, [[0.165, s3 - 0.004, 0], [0.165 + Math.cos(a) * 0.012, s3 + 0.03, Math.sin(a) * 0.01], tip], 0.006, 0.003, wood, 4, 5);
      tips.push([tip, a]);
    }
    for (const [tip, a] of tips) {
      for (let j = 0; j < 4; j++) {
        const aa = a + (j % 2 ? Math.PI / 2 : 0) + (j > 1 ? Math.PI : 0);
        leafAt(k, jg, jade, [tip[0], tip[1] - 0.012 + (j > 1 ? 0.012 : 0), tip[2]], out(aa, 0.5 + r() * 0.3), UP, j > 1 ? 0.75 : 1);
      }
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.circle(ctx, -0.165, 0, 0.08, tint(c.pot, 0.2), undefined, LINE_THIN);
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        D.ellipse(ctx, -0.165 + Math.cos(a) * 0.03, Math.sin(a) * 0.03, 0.025, 0.015, tint(c.leaves, 0.3), INK_SOFT, 0.004, a);
      }
      D.circle(ctx, 0, 0, 0.058, tint('#3d4a52', 0.4), undefined, LINE_THIN);
      D.foliage(ctx, 0, 0, 0.05, tint('#30523a', 0.4), 6, 2, INK_SOFT);
      D.circle(ctx, 0.165, 0, 0.062, tint(PAL.terracotta, 0.4), undefined, LINE_THIN);
      D.foliage(ctx, 0.165, 0, 0.06, tint('#4f7d44', 0.4), 6, 3, INK_SOFT);
    }),
};

/* ------------------------------------------------------------------ 9. rubber plant */

const rubberPlant: FurnitureDef = {
  id: 'plant-rubber',
  name: 'פיקוס גומי',
  category: 'decor',
  group: 'צמחים',
  tags: ['פיקוס', 'גומי', 'עלים כהים', 'צמח בית', 'קרמיקה'],
  size: { w: 0.72, d: 0.72, h: 1.42 },
  colors: [slot('pot', 'עציץ', '#d8c9b0'), slot('leaves', 'עלים', '#25412a')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const r = rng(71);
    const soil = planter(k, { style: 'belly', r: 0.19, h: 0.34, mat: M.ceramic(c.pot), top: 'soil', seg: 24 });
    const stemM = M.bark('#6f6a4c');
    const mats = [M.leaf(c.leaves), M.leaf(darken(c.leaves, 0.2)), M.leaf(mix(c.leaves, '#4b2a2e', 0.35)), M.leaf(lighten(c.leaves, 0.1))];
    const geo = bladeGeo(0.27, 0.135, { shape: leafShape(0.5, 0.65), rows: 6, cols: 2, fold: 0.08, droop: 0.1, curl: 0.006 });
    const pet = M.leaf(mix(c.leaves, '#7a5a3a', 0.4));
    const stems: V3[][] = [
      [[0.02, soil - 0.02, 0], [0.04, 0.7, 0.02], [0.02, 1.05, 0.03], [0.03, 1.32, 0.02]],
      [[-0.02, soil - 0.02, 0.01], [-0.06, 0.6, -0.02], [-0.1, 0.92, -0.05], [-0.1, 1.08, -0.06]],
    ];
    stems.forEach((pts, si) => {
      tube(k, pts, 0.014, 0.006, stemM, 5, 14);
      const cv = curveOf(pts);
      const n = si ? 12 : 17;
      for (let i = 0; i < n; i++) {
        const t = 0.25 + (i / (n - 1)) * 0.73;
        const p = cv.getPointAt(Math.min(0.99, t));
        const a = i * GOLDEN + si;
        const pitch = -0.35 + t * 0.85 + (r() - 0.5) * 0.2;
        const q: V3 = [p.x + Math.cos(a) * 0.05, p.y + 0.02, p.z + Math.sin(a) * 0.05];
        tube(k, [V(p), [p.x + Math.cos(a) * 0.025, p.y + 0.02, p.z + Math.sin(a) * 0.025], q], 0.003, 0.0025, pet, 3, 3);
        leafAt(k, geo, mats[Math.floor(r() * mats.length)], q, out(a, pitch), jitterUp(r, 0.5), 1.05 - t * 0.3);
      }
      const e = pts[pts.length - 1];
      const sheath = k.cyl(0.006, 0.07, M.leaf('#a14b42'), e[0], e[1] - 0.01, e[2], 0.0005, 6);
      sheath.rotation.z = 0.1;
    });
    return k.g;
  },
  draw2d: (ctx, c) => sym(ctx, () => plantTop(ctx, { pot: 0.19, potColor: c.pot, leaf: c.leaves, n: 14, reach: 0.35, len: 0.2, wid: 0.1, seed: 4 })),
};

/* ------------------------------------------------------------------ 10. hanging pothos in a macramé hanger */

/** Vine with alternating heart leaves; `pts` is the vine path. */
function vine(k: Kit, pts: V3[], leaf: THREE.BufferGeometry, mats: THREE.Material[], stem: THREE.Material, spacing: number, faceOut: (p: THREE.Vector3) => THREE.Vector3, r: () => number, s0 = 1): void {
  tube(k, pts, 0.0028, 0.0018, stem, 3, Math.max(6, pts.length * 3));
  const cv = curveOf(pts);
  const L = cv.getLength();
  let i = 0;
  for (let d = spacing * 0.6; d < L - 0.01; d += spacing * (0.8 + r() * 0.4)) {
    const t = d / L;
    const p = cv.getPointAt(t);
    const tg = cv.getTangentAt(t);
    const f = faceOut(p);
    const side = new THREE.Vector3().crossVectors(tg, f).normalize().multiplyScalar(i % 2 ? 1 : -1);
    const dir = tg.clone().multiplyScalar(0.55).addScaledVector(side, 0.75).add(vec(0, -0.25, 0)).normalize();
    leafAt(k, leaf, mats[i % mats.length], p, dir, f, (s0 - t * 0.35) * (0.85 + r() * 0.3));
    i++;
  }
}

const pothosHanging: FurnitureDef = {
  id: 'plant-pothos-hanging',
  name: 'פותוס תלוי במקרמה',
  category: 'decor',
  group: 'צמחים תלויים',
  tags: ['פותוס', 'מקרמה', 'תלוי', 'מטפס', 'צמח תקרה', 'בוהו'],
  size: { w: 0.62, d: 0.62, h: 1.4 },
  mount: 'ceiling',
  colors: [slot('pot', 'עציץ', '#f2efe9'), slot('cord', 'חבל', '#e8dfcb'), slot('leaves', 'עלים', '#4f8a3a')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const r = rng(83);
    const C = 2.7;
    const potY = 1.95;
    const rp = 0.115;
    const ph = 0.16;
    const soil = planter(k, { style: 'cylinder', r: rp, h: ph, mat: M.ceramic(c.pot), y: potY, top: 'soil', seg: 22 });
    const cord = M.linen(c.cord);
    const metal = M.brass();
    k.disc(0.03, 0.008, M.paint(PAL.white), 0, C - 0.008, 0, 16);
    const hook = k.add(mesh(new THREE.TorusGeometry(0.012, 0.0025, 5, 12, Math.PI * 1.5), metal), 0, C - 0.022, 0);
    hook.rotation.z = Math.PI;
    const ring = k.add(mesh(new THREE.TorusGeometry(0.022, 0.004, 6, 16), M.wood(PAL.oak)), 0, C - 0.052, 0);
    ring.rotation.y = 0.3;
    const knot = M.linen(darken(c.cord, 0.06));
    const gatherY = potY - 0.05;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const pts: V3[] = [
        [ca * 0.012, C - 0.07, sa * 0.012],
        [ca * 0.05, C - 0.3, sa * 0.05],
        [ca * (rp + 0.01), potY + ph + 0.02, sa * (rp + 0.01)],
        [ca * (rp + 0.012), potY + ph * 0.45, sa * (rp + 0.012)],
        [ca * rp * 0.55, potY - 0.012, sa * rp * 0.55],
        [ca * 0.008, gatherY, sa * 0.008],
      ];
      tube(k, pts, 0.004, 0.004, cord, 3, 18);
      // spiral knots on the long cords + square knots at the pot rim
      const cv = curveOf(pts);
      for (const t of [0.14, 0.2]) {
        const p = cv.getPointAt(t);
        k.sphere(0.0075, knot, p.x, p.y, p.z, 1, 1.3, 1, 5);
      }
      const p2 = cv.getPointAt(0.56);
      k.sphere(0.009, knot, p2.x, p2.y, p2.z, 1, 1.4, 1, 6);
    }
    k.sphere(0.017, knot, 0, gatherY - 0.012, 0, 1, 1.5, 1, 8);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const len = 0.2 + r() * 0.06;
      tube(k, [[Math.cos(a) * 0.006, gatherY - 0.02, Math.sin(a) * 0.006], [Math.cos(a) * 0.016, gatherY - 0.02 - len * 0.5, Math.sin(a) * 0.016], [Math.cos(a) * 0.022, gatherY - 0.02 - len, Math.sin(a) * 0.022]], 0.0025, 0.002, cord, 3, 4);
    }
    // pothos vines
    const leaves = [M.leaf(c.leaves), M.leaf(mix(c.leaves, '#d8cf6a', 0.32)), M.leaf(darken(c.leaves, 0.12)), M.leaf(mix(c.leaves, '#c7c46a', 0.18))];
    const lg = bladeGeo(0.085, 0.066, { shape: heartShape, slant: 0.25, rows: 4, cols: 2, fold: 0.14, droop: 0.12 });
    const stem = M.leaf(mix(c.leaves, '#a8b85a', 0.4));
    for (let i = 0; i < 5; i++) {
      const a = i * GOLDEN + 0.2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const len = 0.25 + r() * 0.42;
      const sw = (r() - 0.5) * 0.08;
      const top = potY + ph;
      const pts: V3[] = [
        [ca * 0.04, soil, sa * 0.04],
        [ca * (rp - 0.01), top + 0.05, sa * (rp - 0.01)],
        [ca * (rp + 0.04), top - 0.04, sa * (rp + 0.04)],
        [ca * (rp + 0.06) - sa * sw, top - len * 0.5, sa * (rp + 0.06) + ca * sw],
        [ca * (rp + 0.05) + sa * sw, top - len, sa * (rp + 0.05) - ca * sw],
      ];
      vine(k, pts, lg, leaves, stem, 0.082, (p) => vec(p.x, 0.25, p.z).normalize(), r);
    }
    // a few leaves standing up from the pot
    for (let i = 0; i < 5; i++) {
      const a = i * 1.3;
      leafAt(k, lg, leaves[i % 4], [Math.cos(a) * 0.04, soil + 0.03, Math.sin(a) * 0.04], out(a, 0.5), jitterUp(r, 0.4), 1);
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      ctx.setLineDash([0.03, 0.02]);
      D.circle(ctx, 0, 0, 0.115, tint(c.pot, 0.2), INK_SOFT, LINE_THIN);
      ctx.setLineDash([]);
      plantTop(ctx, { leaf: c.leaves, n: 12, reach: 0.28, len: 0.08, wid: 0.06, seed: 6, ribs: false });
      D.circle(ctx, 0, 0, 0.02, tint(c.cord, 0.1), INK_SOFT, 0.005);
    }),
};

/* ------------------------------------------------------------------ 11. trailing plant on a wall shelf */

const SHELF = { w: 0.6, d: 0.24, h: 0.7 };

const trailingShelf: FurnitureDef = {
  id: 'plant-trailing-shelf',
  name: 'מדף עם צמח משתלשל',
  category: 'decor',
  group: 'צמחים תלויים',
  tags: ['מדף', 'פילודנדרון', 'משתלשל', 'מטפס', 'קיר', 'ספרים'],
  size: { w: SHELF.w, d: SHELF.d, h: SHELF.h },
  mount: 'wall',
  elevation: 0.95,
  colors: [slot('shelf', 'מדף', PAL.oak), slot('pot', 'עציץ', PAL.terracotta), slot('leaves', 'עלים', '#2f6a35')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const r = rng(97);
    const { w, d } = SHELF;
    const zb = -d / 2;
    const sy = 0.5;
    const bd = 0.2;
    k.rbox(w, 0.025, bd, 0.003, M.wood(c.shelf), 0, sy - 0.025, zb + bd / 2);
    const iron = M.blackMetal();
    for (const s of [-1, 1]) {
      k.box(0.025, 0.14, 0.004, iron, s * 0.2, sy - 0.165, zb + 0.002);
      k.box(0.025, 0.004, 0.15, iron, s * 0.2, sy - 0.029, zb + 0.075);
      k.beam([s * 0.2, sy - 0.15, zb + 0.004], [s * 0.2, sy - 0.03, zb + 0.12], 0.012, 0.004, iron);
    }
    // books + a little vase on the left
    const bt = bookStack(k, -0.15, sy, zb + 0.1, 2, 4);
    k.lathe(smoothProfile([[0, 0], [0.03, 0], [0.04, 0.04], [0.02, 0.1], [0.016, 0.12], [0.02, 0.13]], 10), M.ceramic('#8fa3a8'), -0.17, bt, zb + 0.1, 16);
    // pot + philodendron
    const px = 0.1;
    const pz = zb + 0.1;
    const soil = planter(k, { style: 'tapered', r: 0.075, h: 0.13, mat: M.clay(c.pot), x: px, y: sy, z: pz, top: 'soil', seg: 20 });
    const lg = bladeGeo(0.08, 0.058, { shape: heartShape, slant: 0.22, rows: 4, cols: 2, fold: 0.16, droop: 0.14 });
    const mats = leafMats(c.leaves);
    const stem = M.leaf(mix(c.leaves, '#8fa65a', 0.4));
    const front = zb + bd;
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i - 2.5) * 0.5;
      const len = 0.25 + r() * 0.2 + (i === 2 || i === 3 ? 0.12 : 0);
      const x0 = px + Math.cos(a) * 0.02;
      const xs = px + (i - 2.5) * 0.045;
      const pts: V3[] = [
        [x0, soil, pz + 0.02],
        [px + (i - 2.5) * 0.03, sy + 0.14, pz + 0.06],
        [xs, sy + 0.02, front + 0.012],
        [xs - 0.02 + r() * 0.04, sy - len * 0.5, front + 0.004],
        [xs + (r() - 0.5) * 0.04, Math.max(0.026, sy - len), front - 0.005],
      ];
      vine(k, pts, lg, mats, stem, 0.06, () => vec(0, 0.3, 1).normalize(), r);
    }
    // vine trailing along the shelf to the left
    vine(k, [[px - 0.03, soil, pz], [px - 0.08, sy + 0.03, pz + 0.04], [px - 0.16, sy + 0.012, front - 0.03], [-0.04, sy + 0.01, front - 0.02]], lg, mats, stem, 0.055, () => UP.clone(), r);
    for (let i = 0; i < 7; i++) {
      const a = i * GOLDEN;
      leafAt(k, lg, mats[i % 4], [px + Math.cos(a) * 0.025, soil + 0.02, pz + Math.sin(a) * 0.025], out(a, 0.5 + r() * 0.4), jitterUp(r, 0.6), 0.95);
    }
    // the lowest leaf tip defines the bottom of the item
    const box = new THREE.Box3().setFromObject(k.g, true);
    for (const ch of k.g.children) ch.position.y -= box.min.y;
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { w, d } = SHELF;
      D.box(ctx, -w / 2, -d / 2, w / 2, -d / 2 + 0.2, 0.004, tint(c.shelf, 0.3), undefined, LINE_THIN);
      D.circle(ctx, 0.1, -d / 2 + 0.1, 0.075, tint(c.pot, 0.4), undefined, LINE_THIN);
      D.foliage(ctx, 0.1, -d / 2 + 0.1, 0.09, tint(c.leaves, 0.42), 7, 2, INK_SOFT);
      D.rr(ctx, -0.15, -d / 2 + 0.1, 0.22, 0.15, 0.004, tint('#8a6f5a', 0.4), INK_SOFT, LINE_THIN);
    }),
};

/* ------------------------------------------------------------------ 12. lucky bamboo */

const luckyBamboo: FurnitureDef = {
  id: 'plant-lucky-bamboo',
  name: 'במבוק המזל באגרטל',
  category: 'decor',
  group: 'צמחים',
  tags: ['במבוק', 'מזל', 'דרקנה', 'זכוכית', 'מים', 'שולחני'],
  size: { w: 0.32, d: 0.32, h: 0.78 },
  colors: [slot('leaves', 'גבעולים', '#6e9b3f'), slot('ribbon', 'סרט', '#c9a35a')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const r = rng(103);
    // glass vase with water and pebbles
    const R = 0.068;
    const H = 0.2;
    k.lathe([[0, 0], [R - 0.004, 0], [R, 0.004], [R, H], [R - 0.004, H], [R - 0.004, 0.008], [0, 0.008]], M.glass('#e4f2ee', 0.25), 0, 0, 0, 28);
    k.cyl(R - 0.006, 0.12, M.water('#b8dcd2'), 0, 0.008, 0, R - 0.006, 24);
    for (let i = 0; i < 16; i++) {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * (R - 0.018);
      const s = 0.009 + r() * 0.006;
      k.sphere(s, M.stone(i % 3 ? '#efece5' : '#c9c2b4', 0.4), Math.cos(a) * d, 0.012 + s * 0.4 + (i > 9 ? 0.012 : 0), Math.sin(a) * d, 1.3, 0.7, 1, 6);
    }
    const stalkM = M.leaf(c.leaves);
    const leafM = [M.leaf(darken(c.leaves, 0.08)), M.leaf(lighten(c.leaves, 0.08))];
    const lg = leafGeo(0.13, 0.026, { seg: 4, fold: 0.3, droop: 0.35, tipBias: 0.4 });
    const stalks = [
      { x: 0, z: 0, h: 0.72 },
      { x: 0.026, z: 0.012, h: 0.6 },
      { x: -0.024, z: 0.014, h: 0.52 },
      { x: 0.008, z: -0.026, h: 0.44 },
      { x: -0.018, z: -0.018, h: 0.38 },
    ];
    stalks.forEach((s, i) => {
      const rr = 0.0075;
      const prof: Array<[number, number]> = [[0, 0], [rr, 0]];
      const nodes = Math.floor(s.h / 0.095);
      for (let j = 1; j <= nodes; j++) {
        const y = j * 0.095 - 0.01;
        if (y > s.h - 0.02) break;
        prof.push([rr, y - 0.006], [rr * 1.17, y], [rr, y + 0.005]);
      }
      prof.push([rr, s.h - 0.004], [rr * 0.85, s.h], [0, s.h]);
      const m = k.lathe(prof, stalkM, s.x, 0.01, s.z, 7);
      m.rotation.z = (r() - 0.5) * 0.06;
      m.rotation.x = (r() - 0.5) * 0.06;
      // leafy crown
      for (let j = 0; j < 7; j++) {
        const a = j * GOLDEN + i;
        leafAt(k, lg, leafM[j % 2], [s.x + Math.cos(a) * 0.006, s.h - 0.02 - (j % 4) * 0.025, s.z + Math.sin(a) * 0.006], out(a, 0.95 - j * 0.07), UP, 0.8 + r() * 0.3);
      }
    });
    const rib = k.add(mesh(new THREE.TorusGeometry(0.03, 0.004, 4, 18), M.metal(c.ribbon, 0.35, 0.8)), 0, 0.28, 0);
    rib.rotation.x = Math.PI / 2;
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.circle(ctx, 0, 0, 0.068, '#e3eff0', undefined, LINE_THIN);
      plantTop(ctx, { leaf: c.leaves, n: 9, reach: 0.105, len: 0.09, wid: 0.022, seed: 3 });
    }),
};

/* ------------------------------------------------------------------ 13. bonsai on a stand */

const bonsai: FurnitureDef = {
  id: 'plant-bonsai',
  name: 'בונסאי על מעמד',
  category: 'decor',
  group: 'צמחים',
  tags: ['בונסאי', 'יפני', 'ערער', 'מעמד', 'זן', 'עץ קטן'],
  size: { w: 0.56, d: 0.38, h: 0.87 },
  colors: [slot('stand', 'מעמד', PAL.darkWood), slot('pot', 'כלי', '#4f5e6b'), slot('leaves', 'עלווה', '#3e5f34')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const r = rng(109);
    const wood = M.wood(c.stand);
    // low stand
    const sh = 0.42;
    k.rbox(0.5, 0.03, 0.34, 0.006, wood, 0, sh - 0.03, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.035, sh - 0.03, 0.035, wood, sx * 0.21, 0, sz * 0.13);
    for (const sz of [-1, 1]) k.box(0.42, 0.04, 0.02, wood, 0, sh - 0.075, sz * 0.13);
    for (const sx of [-1, 1]) k.box(0.02, 0.025, 0.24, wood, sx * 0.21, 0.08, 0);
    // tray
    const tray = M.ceramic(c.pot);
    const ty = sh + 0.012;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.03, 0.012, 0.03, tray, sx * 0.16, sh, sz * 0.1);
    k.rbox(0.38, 0.055, 0.25, 0.012, tray, 0, ty, 0);
    k.box(0.35, 0.004, 0.22, M.foliage('#62803a'), 0, ty + 0.052, 0);
    const sy = ty + 0.056;
    for (let i = 0; i < 3; i++) k.sphere(0.02 + i * 0.006, M.stone('#8d8a84', 0.7), 0.1 - i * 0.03, sy, 0.05 + i * 0.015, 1.3, 0.6, 1, 8);
    // trunk with flaring roots
    const bark = M.bark('#6e5b4b');
    const trunk: V3[] = [[-0.03, sy - 0.005, 0], [0.02, sy + 0.08, 0.01], [-0.04, sy + 0.17, -0.01], [0.0, sy + 0.25, 0], [0.04, sy + 0.31, 0.01]];
    tube(k, trunk, 0.032, 0.01, bark, 7, 16);
    for (let i = 0; i < 4; i++) {
      const a = i * 1.7 + 0.3;
      tube(k, [[-0.03, sy + 0.03, 0], [-0.03 + Math.cos(a) * 0.04, sy + 0.005, Math.sin(a) * 0.03], [-0.03 + Math.cos(a) * 0.07, sy - 0.003, Math.sin(a) * 0.05]], 0.012, 0.004, bark, 5, 4);
    }
    const pads: Array<[V3, number]> = [];
    const br = (from: V3, to: V3, rr: number, s: number): void => {
      tube(k, [from, [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2 + 0.02, (from[2] + to[2]) / 2], to], rr, rr * 0.4, bark, 5, 5);
      pads.push([to, s]);
    };
    br([0.02, sy + 0.09, 0.01], [0.17, sy + 0.12, 0.03], 0.012, 1.1);
    br([-0.03, sy + 0.16, -0.01], [-0.17, sy + 0.2, -0.02], 0.011, 1);
    br([-0.01, sy + 0.2, 0], [0.11, sy + 0.25, -0.05], 0.009, 0.85);
    br([0.0, sy + 0.24, 0.01], [-0.08, sy + 0.29, 0.06], 0.008, 0.8);
    pads.push([[0.04, sy + 0.32, 0.01], 0.9]);
    const fol = [M.foliage(c.leaves), M.foliage(lighten(c.leaves, 0.1)), M.foliage(darken(c.leaves, 0.1))];
    const needle = leafGeo(0.03, 0.006, { seg: 1, fold: 0.3, droop: 0 });
    pads.forEach(([p, s], i) => {
      const b = k.geo(blobGeo(0.065, 1, i + 1, 0.32, 2.2), fol[i % 3], p[0], p[1] + 0.012, p[2]);
      b.scale.set(1.35 * s, 0.5 * s, 1.05 * s);
      for (let j = 0; j < 16; j++) {
        const a = r() * Math.PI * 2;
        leafAt(k, needle, fol[(i + j) % 3], [p[0] + Math.cos(a) * 0.075 * s, p[1] + 0.02 + (r() - 0.3) * 0.02, p[2] + Math.sin(a) * 0.06 * s], out(a, 0.3 + r() * 0.5), UP);
      }
    });
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 0.5, 0.34, 0.01, tint(c.stand, 0.4), undefined, LINE_THIN);
      D.rr(ctx, 0, 0, 0.38, 0.25, 0.02, tint(c.pot, 0.4), INK_SOFT, LINE_THIN);
      for (const [x, y, rr] of [[0.15, 0.03, 0.08], [-0.15, -0.02, 0.075], [0.09, -0.05, 0.06], [-0.07, 0.06, 0.055], [0.03, 0.01, 0.06]]) D.foliage(ctx, x, y, rr, tint(c.leaves, 0.45), 6, Math.round(x * 100) + 9, INK_SOFT);
    }),
};

/* ------------------------------------------------------------------ 14. orchid */

function orchidFlower(k: Kit, p: THREE.Vector3, facing: THREE.Vector3, col: string, s: number): void {
  const fk = new Kit();
  const petal = M.cloth(col);
  const lipM = M.leaf(mix(col, '#b0306a', 0.55));
  const wide = bladeGeo(0.046, 0.058, { shape: roundShape, rows: 4, cols: 2, fold: 0.05, droop: 0.12, curl: -0.002 });
  const narrow = bladeGeo(0.044, 0.028, { shape: leafShape(0.5, 0.7), rows: 4, cols: 2, fold: 0.1, droop: 0.12 });
  const parts: Array<[number, THREE.BufferGeometry]> = [
    [Math.PI / 2, narrow],
    [0.18, wide],
    [Math.PI - 0.18, wide],
    [Math.PI * 1.25, narrow],
    [Math.PI * 1.75, narrow],
  ];
  for (const [a, g] of parts) leafAt(fk, g, petal, [0, 0, 0], vec(Math.cos(a), Math.sin(a), 0.18), vec(0, 0, 1));
  fk.sphere(0.012, lipM, 0, -0.014, 0.01, 1, 0.8, 0.9, 8);
  fk.sphere(0.005, M.matte('#f2d35a'), 0, 0.004, 0.006, 1, 1, 1, 6);
  k.sub(fk, p.x, p.y, p.z);
  orient(fk.g, facing, UP);
  fk.g.scale.setScalar(s);
}

const orchid: FurnitureDef = {
  id: 'plant-orchid',
  name: 'סחלב פורח',
  category: 'decor',
  group: 'צמחים',
  tags: ['סחלב', 'פלנופסיס', 'פרחים', 'פורח', 'שולחני'],
  size: { w: 0.4, d: 0.44, h: 0.6 },
  colors: [slot('pot', 'עציץ', '#f4f2ee'), slot('flowers', 'פרחים', '#eab8d3'), slot('leaves', 'עלים', '#3c6a35')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const r = rng(113);
    const soil = planter(k, { style: 'cylinder', r: 0.07, h: 0.13, mat: M.ceramic(c.pot), top: 'bark', z: -0.06, seg: 22 });
    const z0 = -0.06;
    const lg = bladeGeo(0.2, 0.078, { shape: leafShape(0.62, 0.5), rows: 6, cols: 2, fold: 0.28, droop: 0.32 });
    const mats = leafMats(c.leaves);
    [0.3, Math.PI + 0.2, 0.9, Math.PI + 1.0].forEach((a, i) => leafAt(k, lg, mats[i % 4], [0, soil + 0.005 + i * 0.006, z0], out(a, 0.38 - i * 0.05), UP, 1 - i * 0.12));
    const root = M.leaf('#a8b59a');
    for (let i = 0; i < 3; i++) {
      const a = i * 2.2 + 0.5;
      tube(k, [[0, soil + 0.01, z0], [Math.cos(a) * 0.06, soil + 0.03, z0 + Math.sin(a) * 0.06], [Math.cos(a) * 0.085, soil - 0.03, z0 + Math.sin(a) * 0.085]], 0.003, 0.002, root, 4, 5);
    }
    // stake + spike
    k.rod([0.012, soil - 0.01, z0], [0.012, 0.38, z0], 0.0025, M.wood('#c9b083'), 0.002, 5);
    const spike: V3[] = [[0.012, soil, z0 + 0.005], [0.014, 0.28, z0 + 0.006], [0.016, 0.4, z0 + 0.012], [0.02, 0.47, z0 + 0.07], [0.03, 0.48, z0 + 0.17], [0.04, 0.43, z0 + 0.24]];
    tube(k, spike, 0.0028, 0.0018, M.leaf('#5d7a3c'), 4, 22);
    const clip = k.add(mesh(new THREE.TorusGeometry(0.006, 0.0015, 4, 8), M.plastic('#e8e8e8')), 0.013, 0.34, z0 + 0.006);
    clip.rotation.x = Math.PI / 2;
    const cv = curveOf(spike);
    const n = 7;
    for (let i = 0; i < n; i++) {
      const t = 0.5 + (i / (n - 1)) * 0.42;
      const p = cv.getPointAt(t);
      const f = vec((i % 2 ? 0.35 : -0.35) + (r() - 0.5) * 0.2, -0.15, 1);
      orchidFlower(k, p.add(vec((i % 2 ? 0.02 : -0.02), -0.015, 0.01)), f, c.flowers, 1 - (i / n) * 0.25);
    }
    for (let i = 0; i < 2; i++) {
      const p = cv.getPointAt(0.95 + i * 0.045);
      k.sphere(0.008 - i * 0.002, M.leaf(mix(c.flowers, '#9dbb6a', 0.4)), p.x, p.y - 0.006, p.z, 1, 1.2, 1, 6);
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.circle(ctx, 0, -0.06, 0.07, tint(c.pot, 0.2), undefined, LINE_THIN);
      for (const [a, s] of [[0.3, 1], [Math.PI + 0.2, 0.88], [0.9, 0.76], [Math.PI + 1, 0.64]]) {
        D.ellipse(ctx, Math.cos(a) * 0.1 * s, -0.06 + Math.sin(a) * 0.1 * s, 0.1 * s, 0.035, tint(c.leaves, 0.4), INK_SOFT, 0.005, a);
      }
      for (let i = 0; i < 6; i++) D.circle(ctx, (i % 2 ? 0.03 : -0.01), 0.02 + i * 0.028, 0.028, tint(c.flowers, 0.1), INK_SOFT, 0.005);
    }),
};

/* ------------------------------------------------------------------ 15. lavender */

const lavender: FurnitureDef = {
  id: 'plant-lavender',
  name: 'לבנדר בעציץ',
  category: 'decor',
  group: 'צמחים',
  tags: ['לבנדר', 'פרחים', 'סגול', 'ריחני', 'טרקוטה', 'ים תיכוני'],
  size: { w: 0.42, d: 0.42, h: 0.6 },
  colors: [slot('pot', 'עציץ', '#c7805d'), slot('flowers', 'פרחים', '#8566b0'), slot('leaves', 'עלים', '#8c9b7a')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const r = rng(127);
    const soil = planter(k, { style: 'tapered', r: 0.13, h: 0.18, mat: M.clay(c.pot), saucer: M.clay(darken(c.pot, 0.08)), top: 'soil', seg: 24 });
    const mound = k.geo(blobGeo(0.1, 1, 7, 0.3, 2.4), M.foliage(darken(c.leaves, 0.15)), 0, soil + 0.04, 0);
    mound.scale.set(1.0, 0.6, 1.0);
    const lg = leafGeo(0.075, 0.007, { seg: 1, fold: 0.3, droop: 0 });
    const lm = [M.foliage(lighten(c.leaves, 0.1), true), M.foliage(c.leaves, true), M.foliage(mix(c.leaves, '#b5bfa8', 0.4), true)];
    for (let i = 0; i < 120; i++) {
      const a = r() * Math.PI * 2;
      const d = 0.02 + Math.sqrt(r()) * 0.1;
      leafAt(k, lg, lm[i % 3], [Math.cos(a) * d, soil + 0.02 + r() * 0.08 * (1 - d * 5), Math.sin(a) * d], out(a, 0.55 + r() * 0.8 - d * 2), UP);
    }
    const stemM = M.matte(mix(c.leaves, '#6f7f55', 0.5));
    const spikeM = M.boucle(c.flowers);
    const spikeM2 = M.boucle(darken(c.flowers, 0.15));
    const yAxis = vec(0, 1, 0);
    for (let i = 0; i < 46; i++) {
      const a = i * GOLDEN;
      const d0 = Math.sqrt(r()) * 0.06;
      const lean = 0.03 + d0 * 1.0 + r() * 0.035;
      const top = 0.42 + r() * 0.12 - d0 * 0.6;
      const b: V3 = [Math.cos(a) * d0, soil + 0.04, Math.sin(a) * d0];
      const e: V3 = [b[0] + Math.cos(a) * lean, top, b[2] + Math.sin(a) * lean];
      k.rod(b, e, 0.0016, stemM, 0.0013, 3);
      const dir = vec(e[0] - b[0], e[1] - b[1], e[2] - b[2]).normalize();
      const sp = k.sphere(0.0085, i % 3 ? spikeM : spikeM2, e[0] + dir.x * 0.03, e[1] + dir.y * 0.03, e[2] + dir.z * 0.03, 1, 4.2, 1, 6);
      sp.quaternion.setFromUnitVectors(yAxis, dir);
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.circle(ctx, 0, 0, 0.13, tint(c.pot, 0.4), undefined, LINE_THIN);
      D.foliage(ctx, 0, 0, 0.19, tint(c.leaves, 0.4), 8, 4, INK_SOFT);
      const r = rng(5);
      for (let i = 0; i < 26; i++) {
        const a = i * GOLDEN;
        const d = 0.04 + r() * 0.13;
        D.circle(ctx, Math.cos(a) * d, Math.sin(a) * d, 0.012, tint(c.flowers, 0.2), null);
      }
    }),
};

/* ------------------------------------------------------------------ 16. aloe vera */

const aloe: FurnitureDef = {
  id: 'plant-aloe',
  name: 'אלוורה',
  category: 'decor',
  group: 'צמחים',
  tags: ['אלוורה', 'סוקולנט', 'מרפא', 'בטון', 'קטן'],
  size: { w: 0.58, d: 0.52, h: 0.34 },
  colors: [slot('pot', 'עציץ', '#a6a39c'), slot('leaves', 'עלים', '#7c9a6c')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const r = rng(131);
    const soil = planter(k, { style: 'bowl', r: 0.13, h: 0.13, mat: M.stone(c.pot, 0.85), top: 'pebbles', seg: 24 });
    const mats = [M.foliage(c.leaves), M.foliage(mix(c.leaves, '#9bb08f', 0.35)), M.foliage(darken(c.leaves, 0.12))];
    const tooth = spineGeo(0.006, 0.0018);
    const toothM = M.matte('#d9d2b0');
    const n = 15;
    for (let i = 0; i < n; i++) {
      const a = i * GOLDEN;
      const t = i / (n - 1);
      const len = 0.3 - t * 0.12 + r() * 0.03;
      const droop = 0.1 - t * 0.08;
      const g = fleshGeo(len, 0.065 - t * 0.012, 0.03, { widest: 0.1, blunt: 0.7, droop, ws: 6, hs: 7 });
      const pitch = 0.62 + t * 0.62;
      const dir = out(a, pitch);
      const base = vec(Math.cos(a) * 0.012, soil - 0.004, Math.sin(a) * 0.012);
      leafAt(k, g, mats[i % 3], base, dir, UP);
      // a few teeth along the edges
      if (i < 9) {
        const side = new THREE.Vector3().crossVectors(dir, UP).normalize();
        for (let j = 1; j < 4; j++) {
          const u = j * 0.22;
          const w = (0.03 - t * 0.006) * (1 - u * 0.9);
          const up = new THREE.Vector3().crossVectors(side, dir).normalize();
          for (const sd of [-1, 1]) {
            const p = base.clone().addScaledVector(dir, len * u).addScaledVector(side, sd * w).addScaledVector(up, -droop * len * u * u);
            leafAt(k, tooth, toothM, p, side.clone().multiplyScalar(sd).addScaledVector(dir, 0.5).normalize());
          }
        }
      }
    }
    return k.g;
  },
  draw2d: (ctx, c) => sym(ctx, () => plantTop(ctx, { pot: 0.13, potColor: c.pot, leaf: c.leaves, n: 12, reach: 0.24, len: 0.2, wid: 0.05, seed: 7 })),
};

/* ------------------------------------------------------------------ 17. ZZ plant */

const zzPlant: FurnitureDef = {
  id: 'plant-zz',
  name: 'זמיוקולקס (ZZ)',
  category: 'decor',
  group: 'צמחים',
  tags: ['זמיוקולקס', 'ZZ', 'עמיד', 'צל', 'צמח בית', 'בטון'],
  size: { w: 0.76, d: 0.76, h: 0.92 },
  colors: [slot('pot', 'עציץ', '#8e8c87'), slot('leaves', 'עלים', '#2d5a2a')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const r = rng(137);
    const soil = planter(k, { style: 'cylinder', r: 0.15, h: 0.27, mat: M.stone(c.pot, 0.82), top: 'soil', seg: 24 });
    const stemM = M.leaf(mix(c.leaves, '#6c7a3a', 0.35));
    const mats = [M.leaf(c.leaves), M.leaf(lighten(c.leaves, 0.08)), M.leaf(darken(c.leaves, 0.12))];
    const lg = bladeGeo(0.09, 0.046, { shape: leafShape(0.45, 0.7), rows: 3, cols: 2, fold: 0.12, droop: 0.08 });
    const n = 8;
    for (let i = 0; i < n; i++) {
      const a = i * GOLDEN;
      const t = i / (n - 1);
      const len = 0.62 - t * 0.2 + r() * 0.05;
      const lean = 0.12 + t * 0.12 + r() * 0.04;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const pts: V3[] = [
        [ca * 0.02, soil - 0.01, sa * 0.02],
        [ca * lean * 0.3, soil + len * 0.5, sa * lean * 0.3],
        [ca * lean, soil + len * 0.92, sa * lean],
        [ca * lean * 1.3, soil + len * 0.98, sa * lean * 1.3],
      ];
      tube(k, pts, 0.012, 0.003, stemM, 4, 9);
      const cv = curveOf(pts);
      const m = 7;
      for (let j = 0; j < m; j++) {
        const u = 0.3 + (j / (m - 1)) * 0.68;
        const p = cv.getPointAt(Math.min(0.995, u));
        const tg = cv.getTangentAt(Math.min(0.995, u));
        const side = new THREE.Vector3().crossVectors(tg, UP).normalize();
        for (const sd of [-1, 1]) {
          const d = side.clone().multiplyScalar(sd * 0.75).addScaledVector(tg, 0.75).normalize();
          leafAt(k, lg, mats[(i + j + (sd > 0 ? 1 : 0)) % 3], p, d, jitterUp(r, 0.3), 1.05 - u * 0.35);
        }
      }
    }
    return k.g;
  },
  draw2d: (ctx, c) => sym(ctx, () => plantTop(ctx, { pot: 0.15, potColor: c.pot, leaf: c.leaves, n: 9, reach: 0.29, len: 0.22, wid: 0.07, seed: 8 })),
};

/* ------------------------------------------------------------------ 18. peace lily */

const peaceLily: FurnitureDef = {
  id: 'plant-peace-lily',
  name: 'ספטיפילום פורח',
  category: 'decor',
  group: 'צמחים',
  tags: ['ספטיפילום', 'שושנת שלום', 'פרחים לבנים', 'צל', 'צמח בית'],
  size: { w: 0.82, d: 0.82, h: 0.78 },
  colors: [slot('pot', 'עציץ', '#3f4b55'), slot('leaves', 'עלים', '#2c5a2f')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const r = rng(139);
    const soil = planter(k, { style: 'egg', r: 0.15, h: 0.24, mat: M.ceramic(c.pot), top: 'soil', seg: 24 });
    const mats = leafMats(c.leaves);
    const pet = M.leaf(mix(c.leaves, '#7d9a4a', 0.3));
    const lg = bladeGeo(0.26, 0.09, { shape: leafShape(0.42, 0.75), rows: 7, cols: 2, fold: 0.3, droop: 0.28, wave: 0.004, waveFreq: 3 });
    const n = 16;
    for (let i = 0; i < n; i++) {
      const a = i * GOLDEN;
      const t = i / (n - 1);
      const reach = 0.06 + t * 0.08;
      const h = soil + 0.14 + (1 - t) * 0.12 + r() * 0.05;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const tip: V3 = [ca * reach, h, sa * reach];
      tube(k, [[ca * 0.015, soil - 0.01, sa * 0.015], [ca * reach * 0.4, soil + (h - soil) * 0.7, sa * reach * 0.4], tip], 0.004, 0.003, pet, 3, 6);
      leafAt(k, lg, mats[i % 4], tip, out(a, 0.95 - t * 0.55 + r() * 0.15), jitterUp(r, 0.3), 0.9 + r() * 0.2);
    }
    // white spathes with cream spadix
    const spathe = bladeGeo(0.11, 0.065, { shape: leafShape(0.45, 0.65), rows: 5, cols: 2, fold: 0.1, curl: 0.016, droop: -0.08 });
    const white = M.leaf('#f5f4ec');
    for (let i = 0; i < 4; i++) {
      const a = i * 1.7 + 0.6;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const h = soil + 0.36 + r() * 0.1;
      const p: V3 = [ca * 0.07, h, sa * 0.07];
      tube(k, [[ca * 0.01, soil, sa * 0.01], [ca * 0.04, soil + (h - soil) * 0.6, sa * 0.04], p], 0.0032, 0.0028, pet, 3, 6);
      const dir = out(a, 1.15);
      const face = vec(ca, 0, sa);
      leafAt(k, spathe, white, p, dir, face);
      const sp = k.cyl(0.0055, 0.045, M.matte('#e9dfae'), p[0] + ca * 0.012, p[1] + 0.005, p[2] + sa * 0.012, 0.004, 6);
      sp.rotation.set(sa * 0.35, 0, -ca * 0.35);
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      plantTop(ctx, { pot: 0.15, potColor: c.pot, leaf: c.leaves, n: 14, reach: 0.31, len: 0.2, wid: 0.07, seed: 9 });
      for (let i = 0; i < 4; i++) {
        const a = i * 1.7 + 0.6;
        D.ellipse(ctx, Math.cos(a) * 0.08, Math.sin(a) * 0.08, 0.035, 0.025, '#fbfaf4', INK_SOFT, 0.005, a);
      }
    }),
};

/* ------------------------------------------------------------------ 19. pampas grass in a tall vase */

const pampasTall: FurnitureDef = {
  id: 'plant-pampas-tall',
  name: 'פמפס יבש באגרטל גבוה',
  category: 'decor',
  group: 'צמחים',
  tags: ['פמפס', 'יבש', 'בוהו', 'אגרטל', 'קש', 'זרים יבשים'],
  size: { w: 0.66, d: 0.66, h: 1.74 },
  colors: [slot('vase', 'אגרטל', '#e4dccd'), slot('plumes', 'פמפס', '#e6d7bb')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const r = rng(149);
    const prof: Array<[number, number]> = smoothProfile([[0, 0], [0.09, 0], [0.115, 0.06], [0.12, 0.25], [0.105, 0.42], [0.06, 0.52], [0.052, 0.58], [0.058, 0.6]], 14);
    k.lathe([...prof, [0.048, 0.6], [0.045, 0.56], [0, 0.56]], M.stone(c.vase, 0.75), 0, 0, 0, 26);
    for (const y of [0.18, 0.21, 0.24]) k.ring(0.1205, 0.002, M.stone(darken(c.vase, 0.12), 0.75), 0, y, 0, 26);
    const stem = M.matte('#bba57c');
    const plume = M.fur(c.plumes);
    const plume2 = M.fur(lighten(c.plumes, 0.1));
    const yAxis = vec(0, 1, 0);
    for (let i = 0; i < 9; i++) {
      const a = i * GOLDEN + 0.3;
      const lean = 0.08 + r() * 0.12;
      const top = 1.18 + r() * 0.2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const pts: V3[] = [[ca * 0.01, 0.4, sa * 0.01], [ca * lean * 0.4, 0.85, sa * lean * 0.4], [ca * lean, top, sa * lean]];
      tube(k, pts, 0.0035, 0.0025, stem, 4, 8);
      const cv = curveOf(pts);
      const tg = cv.getTangentAt(1);
      const g = blobGeo(1, 1, i + 1, 0.22, 2);
      const len = 0.17 + r() * 0.06;
      const cpos = vec(ca * lean, top, sa * lean).addScaledVector(tg, len * 0.85);
      const m = k.geo(g, i % 2 ? plume : plume2, cpos.x, cpos.y, cpos.z);
      m.scale.set(0.045, len, 0.045);
      m.quaternion.setFromUnitVectors(yAxis, tg.clone().add(vec(ca * 0.25, 0, sa * 0.25)).normalize());
    }
    // a few dried bunny-tail grasses
    for (let i = 0; i < 5; i++) {
      const a = i * 1.3 + 1;
      const e: V3 = [Math.cos(a) * 0.16, 0.95 + r() * 0.12, Math.sin(a) * 0.16];
      k.rod([Math.cos(a) * 0.01, 0.42, Math.sin(a) * 0.01], e, 0.0015, stem, 0.0012, 3);
      const m = k.sphere(0.017, plume2, e[0], e[1] + 0.02, e[2], 0.85, 1.4, 0.85, 8);
      m.rotation.z = -Math.cos(a) * 0.2;
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      for (let i = 0; i < 9; i++) {
        const a = i * GOLDEN + 0.3;
        D.ellipse(ctx, Math.cos(a) * 0.2, Math.sin(a) * 0.2, 0.1, 0.04, tint(c.plumes, 0.3), INK_SOFT, 0.006, a);
      }
      D.circle(ctx, 0, 0, 0.12, tint(c.vase, 0.3));
      D.circle(ctx, 0, 0, 0.05, null, INK_SOFT, LINE_THIN);
    }),
};

/* ------------------------------------------------------------------ 20. herb planter box */

const herbBox: FurnitureDef = {
  id: 'plant-herb-box',
  name: 'אדנית תבלינים',
  category: 'decor',
  group: 'צמחים',
  tags: ['תבלינים', 'בזיליקום', 'רוזמרין', 'עירית', 'אדנית', 'מטבח', 'עשבי תיבול'],
  size: { w: 0.62, d: 0.22, h: 0.47 },
  colors: [slot('box', 'אדנית', '#b98d5f'), slot('leaves', 'בזיליקום', '#4f9a35')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const r = rng(151);
    const wood = M.wood(c.box);
    const W = 0.6;
    const Dd = 0.2;
    const H = 0.14;
    const t = 0.014;
    const y0 = 0.02;
    for (const s of [-1, 1]) k.box(0.05, y0, Dd - 0.02, M.wood(darken(c.box, 0.2)), s * 0.24, 0, 0);
    for (const s of [-1, 1]) {
      k.box(W, H, t, wood, 0, y0, s * (Dd / 2 - t / 2));
      k.box(t, H, Dd - 2 * t, wood, s * (W / 2 - t / 2), y0, 0);
      k.box(W - 0.01, 0.003, 0.002, M.matte(darken(c.box, 0.4)), 0, y0 + H / 2, s * (Dd / 2 + 0.0005));
    }
    k.box(W - 2 * t, 0.012, Dd - 2 * t, wood, 0, y0, 0);
    const sy = y0 + H - 0.02;
    k.box(W - 2 * t, 0.004, Dd - 2 * t, M.soil(), 0, sy - 0.004, 0);
    // basil (left)
    const basil = [M.leaf(c.leaves), M.leaf(lighten(c.leaves, 0.12)), M.leaf(darken(c.leaves, 0.08))];
    const bg = bladeGeo(0.055, 0.034, { shape: leafShape(0.4, 0.7), rows: 4, cols: 2, fold: 0.35, curl: 0.006, droop: 0.15 });
    const bstem = M.leaf(mix(c.leaves, '#a6b86a', 0.4));
    for (let s = 0; s < 5; s++) {
      const bx = -0.19 + (s % 3) * 0.04 - 0.02;
      const bz = (s % 2 ? 0.04 : -0.035);
      const h = 0.13 + r() * 0.08;
      k.rod([bx, sy, bz], [bx + (r() - 0.5) * 0.03, sy + h, bz + (r() - 0.5) * 0.03], 0.003, bstem, 0.002, 4);
      for (let j = 0; j < 3; j++) {
        const y = sy + h * (0.4 + j * 0.3);
        for (let q = 0; q < 2; q++) {
          const a = q * Math.PI + j * Math.PI / 2 + s;
          leafAt(k, bg, basil[(s + j + q) % 3], [bx, y, bz], out(a, 0.35 - j * 0.05), UP, 1.1 - j * 0.25);
        }
      }
    }
    // rosemary (middle)
    const woody = M.bark('#7c6d55');
    const needle = leafGeo(0.032, 0.0065, { seg: 1, fold: 0.4, droop: 0 });
    const nm = [M.foliage('#4f6b52', true), M.foliage('#6c8670', true)];
    for (let s = 0; s < 8; s++) {
      const bx = 0.0 + (r() - 0.5) * 0.08;
      const bz = (r() - 0.5) * 0.09;
      const h = 0.17 + r() * 0.08;
      const e: V3 = [bx + (r() - 0.5) * 0.06, sy + h, bz + (r() - 0.5) * 0.04];
      k.rod([bx, sy, bz], e, 0.0024, woody, 0.0014, 4);
      for (let j = 0; j < 22; j++) {
        const u = 0.15 + (j / 21) * 0.85;
        const p: V3 = [bx + (e[0] - bx) * u, sy + h * u, bz + (e[2] - bz) * u];
        const a = j * 2.1;
        leafAt(k, needle, nm[j % 2], p, out(a, 0.75 + u * 0.3), UP);
      }
    }
    // chives (right) with a few purple pom-poms
    const chive = M.leaf('#4c8a3a');
    for (let s = 0; s < 24; s++) {
      const a = r() * Math.PI * 2;
      const d = r() * 0.035;
      const bx = 0.19 + Math.cos(a) * d;
      const bz = Math.sin(a) * d;
      const h = 0.15 + r() * 0.1;
      k.rod([bx, sy, bz], [bx + Math.cos(a) * 0.04, sy + h, bz + Math.sin(a) * 0.03], 0.0022, chive, 0.0012, 3);
    }
    for (let i = 0; i < 3; i++) {
      const bx = 0.17 + i * 0.025;
      const h = 0.26 + i * 0.02;
      k.rod([bx, sy, 0], [bx, sy + h, 0.01], 0.0018, chive, 0.0016, 3);
      k.sphere(0.014, M.boucle('#b07ac0'), bx, sy + h + 0.01, 0.01, 1, 1, 1, 8);
    }
    // plant labels
    for (const x of [-0.2, 0.0, 0.2]) {
      const st = k.box(0.004, 0.09, 0.002, M.wood(PAL.birch), x + 0.05, sy - 0.03, Dd / 2 - 0.03);
      st.rotation.x = -0.15;
      k.box(0.04, 0.025, 0.003, M.wood(PAL.birch), x + 0.05, sy + 0.04, Dd / 2 - 0.022);
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 0.6, 0.2, 0.004, tint(c.box, 0.4), undefined, LINE_THIN);
      D.foliage(ctx, -0.19, 0, 0.09, tint(c.leaves, 0.4), 6, 1, INK_SOFT);
      D.foliage(ctx, 0, 0, 0.08, tint('#4f6b52', 0.45), 7, 2, INK_SOFT);
      D.foliage(ctx, 0.19, 0, 0.07, tint('#4c8a3a', 0.45), 6, 3, INK_SOFT);
    }),
};

/* ------------------------------------------------------------------ 21. geometric terrarium */

const terrarium: FurnitureDef = {
  id: 'plant-terrarium',
  name: 'טרריום זכוכית גיאומטרי',
  category: 'decor',
  group: 'צמחים',
  tags: ['טרריום', 'זכוכית', 'פליז', 'אזוב', 'מיני גינה', 'שולחני'],
  size: { w: 0.32, d: 0.29, h: 0.42 },
  colors: [slot('frame', 'מסגרת', PAL.brass), slot('leaves', 'צמחייה', '#4f7d3c')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const r = rng(157);
    const metal = M.metal(c.frame, 0.32, 1);
    const R = 0.15;
    const yb = 0.012;
    const yt = 0.21;
    const apex = 0.41;
    const corner = (i: number, y: number, rr = R): V3 => {
      const a = Math.PI / 6 + (i * Math.PI) / 3;
      return [rr * Math.sin(a), y, rr * Math.cos(a)];
    };
    const base = k.cyl(R + 0.004, yb, metal, 0, 0, 0, R + 0.004, 6);
    base.rotation.y = Math.PI / 6;
    // glass panes
    const pos: number[] = [];
    for (let i = 0; i < 6; i++) {
      const a = corner(i, yb);
      const b = corner(i + 1, yb);
      const a2 = corner(i, yt);
      const b2 = corner(i + 1, yt);
      pos.push(...a, ...b, ...b2, ...a, ...b2, ...a2);
      pos.push(...a2, ...b2, 0, apex, 0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    k.geo(g, M.glass('#e8f4f2', 0.16));
    const er = 0.0028;
    for (let i = 0; i < 6; i++) {
      k.rod(corner(i, yb), corner(i, yt), er, metal, er, 5);
      k.rod(corner(i, yt), corner(i + 1, yt), er, metal, er, 5);
      k.rod(corner(i, yb + 0.002), corner(i + 1, yb + 0.002), er, metal, er, 5);
      k.rod(corner(i, yt), [0, apex, 0], er, metal, er, 5);
    }
    k.sphere(0.007, metal, 0, apex, 0, 1, 1, 1, 8);
    // layers: drainage pebbles, soil, moss
    const layer = (h: number, y: number, mat: THREE.Material, rr: number): void => {
      const m = k.cyl(rr, h, mat, 0, y, 0, rr, 6);
      m.rotation.y = Math.PI / 6;
    };
    layer(0.025, yb, M.stone('#a49c90', 0.7), R - 0.006);
    layer(0.03, yb + 0.025, M.soil(), R - 0.006);
    const moss = k.geo(blobGeo(0.11, 1, 3, 0.25, 2.5), M.foliage('#6b8a3a'), -0.02, yb + 0.055, 0.0);
    moss.scale.set(1, 0.22, 0.9);
    for (let i = 0; i < 4; i++) k.sphere(0.014 + r() * 0.01, M.stone(i % 2 ? '#d8d4cc' : '#7d7a76', 0.6), 0.06 - i * 0.03, yb + 0.06, 0.05 + (i % 2) * 0.03 - 0.02, 1.3, 0.65, 1, 8);
    // tiny driftwood
    tube(k, [[0.08, yb + 0.06, -0.05], [0.03, yb + 0.07, -0.02], [-0.02, yb + 0.065, -0.04]], 0.007, 0.004, M.bark('#b5a58e'), 5, 6);
    // fern
    const fernM = [M.leaf(c.leaves), M.leaf(lighten(c.leaves, 0.12))];
    const leaflet = leafGeo(0.018, 0.006, { seg: 1, fold: 0.2 });
    for (let f = 0; f < 6; f++) {
      const a = f * 1.05;
      const pts: V3[] = [[-0.05, yb + 0.06, -0.03], [-0.05 + Math.cos(a) * 0.03, yb + 0.12, -0.03 + Math.sin(a) * 0.03], [-0.05 + Math.cos(a) * 0.07, yb + 0.12, -0.03 + Math.sin(a) * 0.07]];
      tube(k, pts, 0.0015, 0.001, fernM[0], 3, 5);
      const cv = curveOf(pts);
      for (let j = 0; j < 8; j++) {
        const u = 0.3 + j * 0.09;
        const p = cv.getPointAt(u);
        const tg = cv.getTangentAt(u);
        const side = new THREE.Vector3().crossVectors(tg, UP).normalize();
        for (const sd of [-1, 1]) leafAt(k, leaflet, fernM[j % 2], p, side.clone().multiplyScalar(sd).addScaledVector(tg, 0.4).normalize(), UP, 1.1 - u * 0.5);
      }
    }
    // a small succulent rosette
    echeveria(k, 0.055, yb + 0.062, 0.03, '#9cb8a8', 9, 0.8);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const pts: Array<[number, number]> = [];
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 6 + (i * Math.PI) / 3;
        pts.push([0.15 * Math.sin(a), 0.15 * Math.cos(a)]);
      }
      D.poly(ctx, pts, true, '#eef6f5', tint(c.frame, 0), LINE_THIN);
      for (const [x, y] of pts) D.line(ctx, 0, 0, x, y, tint(c.frame, 0.1), 0.005);
      D.foliage(ctx, -0.04, -0.02, 0.06, tint(c.leaves, 0.4), 6, 2, INK_SOFT);
    }),
};

/* ------------------------------------------------------------------ 22. plant stand with three pots */

const standTrio: FurnitureDef = {
  id: 'plant-stand-trio',
  name: 'מעמד עציצים משולש',
  category: 'decor',
  group: 'צמחים',
  tags: ['מעמד', 'עציצים', 'שלושה', 'עץ', 'פילאה', 'קלתאה', 'מדרגות'],
  size: { w: 0.78, d: 0.3, h: 0.9 },
  colors: [slot('stand', 'מעמד', PAL.walnut), slot('pot', 'עציצים', '#ece7df'), slot('leaves', 'עלים', '#3f7038')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const r = rng(163);
    const wood = M.wood(c.stand);
    // base rail with feet
    k.rbox(0.74, 0.03, 0.05, 0.006, wood, 0, 0.02, 0, 1);
    for (const s of [-1, 1]) k.rbox(0.05, 0.02, 0.28, 0.006, wood, s * 0.34, 0, 0, 1);
    k.rbox(0.05, 0.02, 0.28, 0.006, wood, 0, 0, 0, 1);
    const tiers = [
      { x: -0.25, h: 0.56 },
      { x: 0, h: 0.38 },
      { x: 0.25, h: 0.2 },
    ];
    for (const t of tiers) {
      k.rbox(0.03, t.h - 0.05, 0.03, 0.004, wood, t.x, 0.05, 0, 1);
      k.cyl(0.12, 0.022, wood, t.x, t.h - 0.02, 0, 0.115, 22);
    }
    const pots = [M.ceramic(c.pot), M.ceramic(mix(c.pot, '#6f7d70', 0.5)), M.clay(PAL.terracotta)];
    const mats = leafMats(c.leaves);
    // top: pilea
    const s1 = planter(k, { style: 'belly', r: 0.095, h: 0.13, mat: pots[0], x: -0.25, y: 0.56, top: 'soil', seg: 20 });
    const stem = M.leaf(mix(c.leaves, '#a6b86a', 0.4));
    for (let i = 0; i < 15; i++) {
      const a = i * GOLDEN;
      const t = i / 14;
      const reach = 0.04 + t * 0.07;
      const h = s1 + 0.16 - t * 0.09 + r() * 0.02;
      const x = -0.25 + Math.cos(a) * reach;
      const z = Math.sin(a) * reach;
      tube(k, [[-0.25 + Math.cos(a) * 0.01, s1 - 0.004, Math.sin(a) * 0.01], [-0.25 + Math.cos(a) * reach * 0.55, s1 + (h - s1) * 0.75, Math.sin(a) * reach * 0.55], [x, h, z]], 0.0022, 0.0018, stem, 3, 4);
      const g = new THREE.CircleGeometry(0.03 + (1 - t) * 0.01, 9);
      g.rotateX(-Math.PI / 2);
      const leaf = k.geo(g, mats[i % 4], x, h + 0.002, z);
      leaf.rotation.order = 'YXZ';
      leaf.rotation.set(0.25 + t * 0.55, -a + Math.PI / 2, 0);
    }
    // middle: calathea
    const s2 = planter(k, { style: 'cylinder', r: 0.085, h: 0.14, mat: pots[1], x: 0, y: 0.38, top: 'soil', seg: 20 });
    const cg = bladeGeo(0.13, 0.07, { shape: leafShape(0.5, 0.65), rows: 5, cols: 2, fold: 0.12, droop: 0.06, wave: 0.004, waveFreq: 3 });
    const cal = [M.leaf('#4b6b45'), M.leaf('#5d7d4f'), M.leaf(mix('#4b6b45', '#6b3a55', 0.3))];
    for (let i = 0; i < 9; i++) {
      const a = i * GOLDEN;
      const h = s2 + 0.1 + r() * 0.08;
      const p: V3 = [Math.cos(a) * 0.03, h, Math.sin(a) * 0.03];
      tube(k, [[0, s2 - 0.005, 0], p], 0.0025, 0.002, stem, 3, 3);
      leafAt(k, cg, cal[i % 3], p, out(a, 0.95 - (i / 9) * 0.5), vec(Math.cos(a), 0.6, Math.sin(a)));
    }
    // bottom: small snake plant
    const s3 = planter(k, { style: 'tapered', r: 0.08, h: 0.12, mat: pots[2], x: 0.25, y: 0.2, top: 'soil', seg: 20 });
    const sg = bladeGeo(0.22, 0.04, { shape: leafShape(0.35, 0.8), rows: 5, cols: 1, fold: 0.35, droop: 0.02, twist: 0.4 });
    const sm = [M.leaf('#3f6b3c'), M.leaf('#56783f'), M.leaf(mix('#3f6b3c', '#c9cf7a', 0.3))];
    for (let i = 0; i < 9; i++) {
      const a = i * GOLDEN;
      leafAt(k, sg, sm[i % 3], [0.25 + Math.cos(a) * 0.015, s3 - 0.004, Math.sin(a) * 0.015], out(a, 1.4 - (i / 9) * 0.35), vec(Math.cos(a), 0, Math.sin(a)), 1 - (i / 9) * 0.35);
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 0.74, 0.05, 0.01, tint(c.stand, 0.4), undefined, LINE_THIN);
      for (const x of [-0.25, 0, 0.25]) D.circle(ctx, x, 0, 0.12, tint(c.stand, 0.45), undefined, LINE_THIN);
      D.foliage(ctx, -0.25, 0, 0.12, tint(c.leaves, 0.42), 7, 1, INK_SOFT);
      D.foliage(ctx, 0, 0, 0.13, tint('#4b6b45', 0.42), 6, 2, INK_SOFT);
      D.foliage(ctx, 0.25, 0, 0.08, tint('#3f6b3c', 0.42), 5, 3, INK_SOFT);
    }),
};

/* ------------------------------------------------------------------ 23. banana plant */

const bananaPlant: FurnitureDef = {
  id: 'plant-banana',
  name: 'צמח בננה',
  category: 'decor',
  group: 'צמחים',
  tags: ['בננה', 'מוזה', 'טרופי', 'עלים גדולים', 'צמח גדול', 'בטון'],
  size: { w: 1.9, d: 1.9, h: 2.0 },
  colors: [slot('pot', 'עציץ', '#b2aea6'), slot('leaves', 'עלים', '#4f8a3a')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const r = rng(167);
    const soil = planter(k, { style: 'tub', r: 0.27, h: 0.48, mat: M.stone(c.pot, 0.85), top: 'soil', seg: 26 });
    const trunkM = M.foliage('#7d8a4c');
    const pet = M.leaf(mix(c.leaves, '#a3b06a', 0.35));
    const mats = leafMats(c.leaves);
    const oblong = (u: number): number => Math.pow(Math.sin(Math.PI * u), 0.3);
    const geos = [0, 1, 2].map((s) => {
      const rr = rng(s + 40);
      const slits: Array<[number, number]> = [];
      for (let i = 0; i < 4; i++) {
        const u = 0.2 + rr() * 0.65;
        slits.push([u, u + 0.014]);
      }
      slits.sort((a, b) => a[0] - b[0]);
      return bladeGeo(0.8, 0.3, { shape: oblong, rows: 10, cols: 2, fold: 0.14, droop: 0.5, slits, slitIn: 0.16, twist: 0.25 * (s - 1) });
    });
    const stems = [
      { x: 0.02, z: 0.0, h: 1.05 },
      { x: -0.08, z: 0.06, h: 0.82 },
      { x: 0.07, z: -0.07, h: 0.62 },
    ];
    let li = 0;
    stems.forEach((s, si) => {
      tube(k, [[s.x, soil - 0.02, s.z], [s.x * 1.2, soil + (s.h - soil) * 0.5, s.z * 1.2], [s.x * 1.4, s.h, s.z * 1.4]], 0.045 - si * 0.008, 0.03 - si * 0.005, trunkM, 7, 6);
      const nl = si === 0 ? 4 : 3;
      for (let j = 0; j < nl; j++) {
        const a = j * GOLDEN * 1.1 + si * 1.9;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const pl = 0.25 + r() * 0.15;
        const b: V3 = [s.x * 1.4, s.h - 0.02, s.z * 1.4];
        const tip: V3 = [b[0] + ca * pl * 0.5, b[1] + pl, b[2] + sa * pl * 0.5];
        tube(k, [b, [b[0] + ca * pl * 0.2, b[1] + pl * 0.6, b[2] + sa * pl * 0.2], tip], 0.012, 0.007, pet, 5, 5);
        leafAt(k, geos[li % 3], mats[li % 4], tip, out(a, 1.05 - j * 0.1 + r() * 0.15), vec(ca * 0.3, 1, sa * 0.3), 0.82 + r() * 0.16);
        li++;
      }
    });
    // an old dry leaf hanging down
    const dry = bladeGeo(0.5, 0.18, { shape: oblong, rows: 6, cols: 2, fold: 0.3, droop: 0.1, twist: 0.6 });
    leafAt(k, dry, M.leaf('#a08a5a'), [-0.12, 0.72, 0.08], out(2.4, -1.15), vec(-0.6, 0.2, 0.6));
    return k.g;
  },
  draw2d: (ctx, c) => sym(ctx, () => plantTop(ctx, { pot: 0.27, potColor: c.pot, leaf: c.leaves, n: 10, reach: 0.72, len: 0.62, wid: 0.22, seed: 10 })),
};

/* ------------------------------------------------------------------ 24. string of pearls (hanging) */

const stringOfPearls: FurnitureDef = {
  id: 'plant-string-of-pearls',
  name: 'חוטי פנינים תלוי',
  category: 'decor',
  group: 'צמחים תלויים',
  tags: ['חוטי פנינים', 'סנציו', 'סוקולנט', 'תלוי', 'משתלשל', 'צמח תקרה'],
  size: { w: 0.42, d: 0.42, h: 1.2 },
  mount: 'ceiling',
  colors: [slot('pot', 'קערה', '#c9b79c'), slot('leaves', 'פנינים', '#7ea84e')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const r = rng(173);
    const C = 2.7;
    const by = 2.12;
    const rb = 0.11;
    const bh = 0.1;
    const soil = planter(k, { style: 'bowl', r: rb, h: bh, mat: M.ceramic(c.pot), y: by, top: 'soil', seg: 22 });
    const cord = M.matte('#6b4a32');
    k.disc(0.025, 0.008, M.paint(PAL.white), 0, C - 0.008, 0, 14);
    const ring = k.add(mesh(new THREE.TorusGeometry(0.016, 0.003, 5, 14), M.brass()), 0, C - 0.026, 0);
    ring.rotation.y = 0.5;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      k.rod([Math.cos(a) * 0.004, C - 0.04, Math.sin(a) * 0.004], [Math.cos(a) * (rb - 0.004), by + bh + 0.004, Math.sin(a) * (rb - 0.004)], 0.0018, cord, 0.0018, 4);
      k.sphere(0.005, M.brass(), Math.cos(a) * (rb - 0.004), by + bh + 0.004, Math.sin(a) * (rb - 0.004), 1, 1, 1, 6);
    }
    const pearl = beadGeo(0.0068, -1);
    const pm = [M.leaf(c.leaves), M.leaf(lighten(c.leaves, 0.1)), M.leaf(darken(c.leaves, 0.1))];
    const stem = M.matte(mix(c.leaves, '#8a7a50', 0.5));
    for (let i = 0; i < 11; i++) {
      const a = i * GOLDEN + 0.4;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const len = 0.22 + r() * 0.5;
      const sw = (r() - 0.5) * 0.06;
      const top = by + bh;
      const pts: V3[] = [
        [ca * 0.04, soil, sa * 0.04],
        [ca * (rb - 0.01), top + 0.03, sa * (rb - 0.01)],
        [ca * (rb + 0.02), top - 0.04, sa * (rb + 0.02)],
        [ca * (rb + 0.03) - sa * sw, top - len * 0.55, sa * (rb + 0.03) + ca * sw],
        [ca * (rb + 0.025) + sa * sw, top - len, sa * (rb + 0.025) - ca * sw],
      ];
      tube(k, pts, 0.0012, 0.001, stem, 3, 10);
      const cv = curveOf(pts);
      const L = cv.getLength();
      let j = 0;
      for (let d = 0.02; d < L; d += 0.03 + r() * 0.008) {
        const p = cv.getPointAt(d / L);
        const off = (j % 2 ? 1 : -1) * 0.006;
        k.geo(pearl, pm[(i + j) % 3], p.x + off * sa, p.y, p.z - off * ca);
        j++;
      }
    }
    // a mound of pearls on the soil
    for (let i = 0; i < 18; i++) {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * (rb - 0.02);
      k.geo(pearl, pm[i % 3], Math.cos(a) * d, soil + 0.006 + r() * 0.01, Math.sin(a) * d);
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      ctx.setLineDash([0.03, 0.02]);
      D.circle(ctx, 0, 0, 0.11, tint(c.pot, 0.3), INK_SOFT, LINE_THIN);
      ctx.setLineDash([]);
      const r = rng(2);
      for (let i = 0; i < 30; i++) {
        const a = r() * Math.PI * 2;
        const d = 0.04 + r() * 0.12;
        D.circle(ctx, Math.cos(a) * d, Math.sin(a) * d, 0.01, tint(c.leaves, 0.3), null);
      }
    }),
};

/* ------------------------------------------------------------------ 25. flowering geraniums */

function flowerGeo(rad: number, petals = 5): THREE.BufferGeometry {
  const s = new THREE.Shape();
  const n = petals * 6;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = rad * (0.45 + 0.55 * Math.abs(Math.cos((a * petals) / 2)));
    const x = Math.cos(a) * rr;
    const y = Math.sin(a) * rr;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  const g = new THREE.ShapeGeometry(s, 1);
  // shape faces +Z already; cup it slightly
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const d = Math.hypot(p.getX(i), p.getY(i)) / rad;
    p.setZ(i, d * d * rad * 0.25);
  }
  g.computeVertexNormals();
  return g;
}

const geranium: FurnitureDef = {
  id: 'plant-geranium',
  name: 'גרניום פורח',
  category: 'decor',
  group: 'צמחים',
  tags: ['גרניום', 'פרחים', 'אדום', 'פורח', 'מרפסת', 'טרקוטה'],
  size: { w: 0.42, d: 0.42, h: 0.5 },
  colors: [slot('pot', 'עציץ', '#c4785a'), slot('flowers', 'פרחים', '#d8323f'), slot('leaves', 'עלים', '#4c7f38')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const r = rng(179);
    const soil = planter(k, { style: 'tapered', r: 0.12, h: 0.16, mat: M.clay(c.pot), saucer: M.clay(darken(c.pot, 0.08)), top: 'soil', seg: 24 });
    const lg = bladeGeo(0.075, 0.088, { shape: roundShape, slant: 0.32, rows: 4, cols: 2, fold: 0.1, curl: 0.008, droop: 0.12, wave: 0.004, waveFreq: 5 });
    const mats = leafMats(c.leaves, false);
    const pet = M.leaf(mix(c.leaves, '#8a9a4a', 0.35));
    for (let i = 0; i < 19; i++) {
      const a = i * GOLDEN;
      const t = i / 18;
      const reach = 0.05 + t * 0.09;
      const h = soil + 0.13 - t * 0.08 + r() * 0.03;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const tip: V3 = [ca * reach, h, sa * reach];
      tube(k, [[ca * 0.01, soil - 0.005, sa * 0.01], [ca * reach * 0.5, h + 0.02, sa * reach * 0.5], tip], 0.0025, 0.002, pet, 3, 4);
      leafAt(k, lg, mats[i % 4], tip, out(a, 0.15 + (1 - t) * 0.35), jitterUp(r, 0.4), 1 - t * 0.2 + r() * 0.1);
    }
    const fg = flowerGeo(0.014);
    const fm = [M.cloth(c.flowers), M.cloth(lighten(c.flowers, 0.12)), M.cloth(darken(c.flowers, 0.1))];
    for (let u = 0; u < 5; u++) {
      const a = u * 1.3 + 0.2;
      const d = 0.04 + (u % 2) * 0.05;
      const h = soil + 0.22 + r() * 0.07;
      const ctr = vec(Math.cos(a) * d, h, Math.sin(a) * d);
      tube(k, [[Math.cos(a) * 0.01, soil, Math.sin(a) * 0.01], [ctr.x * 0.7, (soil + h) / 2, ctr.z * 0.7], V(ctr)], 0.0022, 0.0018, pet, 3, 5);
      for (let f = 0; f < 10; f++) {
        const fa = f * GOLDEN;
        const el = 0.15 + (f / 10) * 1.3;
        const nd = out(fa, el);
        const m = k.geo(fg, fm[(f + u) % 3], ctr.x + nd.x * 0.022, ctr.y + 0.012 + nd.y * 0.018, ctr.z + nd.z * 0.022);
        orient(m, nd, UP);
        m.rotateZ(f);
      }
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      plantTop(ctx, { pot: 0.12, potColor: c.pot, leaf: c.leaves, n: 15, reach: 0.21, len: 0.08, wid: 0.075, seed: 11, ribs: false });
      for (let u = 0; u < 5; u++) {
        const a = u * 1.3 + 0.2;
        const d = 0.04 + (u % 2) * 0.05;
        D.circle(ctx, Math.cos(a) * d, Math.sin(a) * d, 0.035, tint(c.flowers, 0.2), INK_SOFT, 0.005);
      }
    }),
};

/* ------------------------------------------------------------------ 26. tulips in a glass vase */

const tulipsVase: FurnitureDef = {
  id: 'plant-tulips-vase',
  name: 'טוליפים באגרטל זכוכית',
  category: 'decor',
  group: 'צמחים',
  tags: ['טוליפים', 'צבעונים', 'פרחים', 'זר', 'אגרטל', 'זכוכית'],
  size: { w: 0.44, d: 0.44, h: 0.53 },
  colors: [slot('flowers', 'פרחים', '#e2465c'), slot('leaves', 'עלים', '#5b8a4a')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const r = rng(181);
    const prof = smoothProfile([[0, 0], [0.055, 0], [0.075, 0.04], [0.078, 0.1], [0.055, 0.17], [0.045, 0.2], [0.05, 0.215]], 12);
    k.lathe([...prof, [0.046, 0.215], [0.041, 0.2], [0.05, 0.17], [0.072, 0.1], [0.07, 0.04], [0.05, 0.006], [0, 0.006]], M.glass('#e6f3f0', 0.22), 0, 0, 0, 26);
    k.lathe(smoothProfile([[0, 0.006], [0.05, 0.006], [0.07, 0.04], [0.071, 0.1], [0.06, 0.135], [0, 0.135]], 8), M.water('#cfe6dc'), 0, 0, 0, 22);
    const stemM = M.leaf(mix(c.leaves, '#9bb86a', 0.3));
    const petals = [M.leaf(c.flowers), M.leaf(lighten(c.flowers, 0.12)), M.leaf(darken(c.flowers, 0.08))];
    const outer = bladeGeo(0.058, 0.04, { shape: leafShape(0.55, 0.55), rows: 4, cols: 2, fold: 0.05, curl: 0.006, droop: -0.18 });
    const n = 9;
    for (let i = 0; i < n; i++) {
      const a = i * GOLDEN;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const lean = 0.03 + (i / n) * 0.12 + r() * 0.03;
      const top = 0.4 + r() * 0.1 - lean * 0.4;
      const pts: V3[] = [[ca * 0.02, 0.012, sa * 0.02], [ca * 0.012, 0.2, sa * 0.012], [ca * lean * 0.7, top - 0.06, sa * lean * 0.7], [ca * lean, top, sa * lean]];
      tube(k, pts, 0.0035, 0.003, stemM, 4, 10);
      const cv = curveOf(pts);
      const ax = cv.getTangentAt(1);
      const hb = vec(ca * lean, top, sa * lean);
      const side = new THREE.Vector3().crossVectors(ax, vec(1, 0, 0)).normalize();
      const side2 = new THREE.Vector3().crossVectors(ax, side).normalize();
      for (let p = 0; p < 6; p++) {
        const pa = (p / 6) * Math.PI * 2 + (p % 2 ? 0 : 0.1);
        const radial = side.clone().multiplyScalar(Math.cos(pa)).addScaledVector(side2, Math.sin(pa));
        const dir = ax.clone().multiplyScalar(0.92).addScaledVector(radial, 0.3).normalize();
        const s = p % 2 ? 0.92 : 1;
        leafAt(k, outer, petals[(i + p) % 3], hb.clone().addScaledVector(radial, p % 2 ? 0.004 : 0.007), dir, radial.clone().negate(), s);
      }
    }
    // strap leaves
    const lg = bladeGeo(0.2, 0.034, { shape: leafShape(0.3, 0.5), rows: 6, cols: 1, fold: 0.4, droop: 0.4, twist: 0.4 });
    const lm = leafMats(c.leaves);
    for (let i = 0; i < 5; i++) {
      const a = i * 1.25 + 0.5;
      leafAt(k, lg, lm[i % 4], [Math.cos(a) * 0.03, 0.19, Math.sin(a) * 0.03], out(a, 1.0 - (i % 2) * 0.2), vec(-Math.cos(a), 0.2, -Math.sin(a)), 0.9 + r() * 0.2);
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.circle(ctx, 0, 0, 0.078, '#e6f1f0', undefined, LINE_THIN);
      for (let i = 0; i < 5; i++) {
        const a = i * 1.25 + 0.5;
        D.ellipse(ctx, Math.cos(a) * 0.1, Math.sin(a) * 0.1, 0.07, 0.016, tint(c.leaves, 0.4), INK_SOFT, 0.005, a);
      }
      for (let i = 0; i < 9; i++) {
        const a = i * GOLDEN;
        const d = 0.03 + (i / 9) * 0.12;
        D.circle(ctx, Math.cos(a) * d, Math.sin(a) * d, 0.024, tint(c.flowers, 0.15), INK_SOFT, 0.005);
      }
    }),
};

export const PLANTS: FurnitureDef[] = [
  fiddleLeaf,
  monstera,
  birdOfParadise,
  oliveTree,
  kentiaPalm,
  cactusColumn,
  cactusBarrel,
  succulentTrio,
  rubberPlant,
  pothosHanging,
  trailingShelf,
  luckyBamboo,
  bonsai,
  orchid,
  lavender,
  aloe,
  zzPlant,
  peaceLily,
  pampasTall,
  herbBox,
  terrarium,
  standTrio,
  bananaPlant,
  stringOfPearls,
  geranium,
  tulipsVase,
];
