import * as THREE from 'three';
import { bake, blobGeo, Kit, leafGeo, M } from '../../../catalog/kit';
import type { CropId } from './rules';

/**
 * Procedural crops for the farm beds, one baked group per (crop, stage, bed size) – a whole bed of
 * plants is a handful of draw calls. Stage 0 seeds, 1 sprouts, 2 leaves, 3 flowers, 4 ripe.
 * `spoiled` turns everything brown and droopy.
 */

const SPACING: Record<CropId, number> = { lettuce: 0.42, carrot: 0.22, strawberry: 0.34, tomato: 0.5, cucumber: 0.55, sunflower: 0.5 };

/** plant spots on a bed of the given size (bed-local x, z) */
export function plantSpots(c: CropId, w: number, d: number): Array<[number, number]> {
  const cols = Math.max(2, Math.floor((w - 0.2) / SPACING[c]));
  const rows = d >= 0.9 ? 2 : 1;
  const out: Array<[number, number]> = [];
  for (let r = 0; r < rows; r++) {
    const z = rows === 1 ? 0 : (r === 0 ? -1 : 1) * (d / 4 - 0.02);
    for (let i = 0; i < cols; i++) {
      const x = -((cols - 1) * SPACING[c]) / 2 + i * SPACING[c] + (r % 2 ? SPACING[c] * 0.25 : 0);
      out.push([x, z]);
    }
  }
  return out;
}

interface Mats {
  stem: THREE.Material;
  leaf: THREE.Material;
  leafDark: THREE.Material;
  leafLight: THREE.Material;
  fruit: Record<CropId, THREE.Material>;
  green: THREE.Material;
  flowerY: THREE.Material;
  flowerW: THREE.Material;
  seed: THREE.Material;
  mound: THREE.Material;
  stake: THREE.Material;
  brown: THREE.Material;
  center: THREE.Material;
}

function mats(spoiled: boolean): Mats {
  if (spoiled) {
    const dry = M.matte('#8a7440');
    const dark = M.matte('#5e4a2a');
    return {
      stem: dry,
      leaf: M.leaf('#8f7a3e'),
      leafDark: M.leaf('#6e5a2e'),
      leafLight: M.leaf('#a8925a'),
      fruit: { lettuce: dry, carrot: dark, strawberry: dark, tomato: dark, cucumber: dark, sunflower: dark },
      green: dark,
      flowerY: dry,
      flowerW: dry,
      seed: dark,
      mound: M.matte('#4d3828'),
      stake: M.wood('#8a6a44'),
      brown: dark,
      center: dark,
    };
  }
  return {
    stem: M.matte('#5d8f3e'),
    leaf: M.leaf('#4f9a3a'),
    leafDark: M.leaf('#2f6e2c'),
    leafLight: M.leaf('#8cc65a'),
    fruit: {
      lettuce: M.foliage('#8fd05a'),
      carrot: M.matte('#f07a22'),
      strawberry: M.plastic('#e0283a'),
      tomato: M.plastic('#e2341f'),
      cucumber: M.plastic('#3e7d2a'),
      sunflower: M.matte('#ffc81e'),
    },
    green: M.plastic('#7cbf4a'),
    flowerY: M.matte('#ffd84a'),
    flowerW: M.matte('#fbf7ee'),
    seed: M.matte('#e9d7a4'),
    mound: M.matte('#4d3828'),
    stake: M.wood('#a07a52'),
    brown: M.matte('#6b3e1e'),
    center: M.matte('#5a3518'),
  };
}

/** a leaf from (x, y, z) pointing at angle `a` (around Y), tilted up by `up` */
function leaf(k: Kit, m: THREE.Material, x: number, y: number, z: number, a: number, len: number, width: number, up: number, droop = 0.3): void {
  const mesh = k.geo(leafGeo(len, width, { droop, fold: 0.3, seg: 5 }), m, x, y, z);
  mesh.rotation.set(-up, a, 0, 'YXZ');
}

function one(k: Kit, c: CropId, stage: number, x: number, z: number, m: Mats, r: () => number, spoiled: boolean): void {
  const a0 = r() * Math.PI * 2;
  const droop = spoiled ? 0.9 : 0.3;
  if (stage === 0) {
    const mound = k.sphere(0.06, m.mound, x, 0, z, 1, 0.35, 1, 8);
    mound.position.y = 0.0;
    k.sphere(0.012, m.seed, x + 0.01, 0.018, z, 1, 0.7, 1, 5);
    return;
  }
  if (stage === 1) {
    k.rod([x, 0, z], [x, 0.08, z], 0.005, m.stem, 0.004, 4);
    leaf(k, m.leafLight, x, 0.08, z, a0, 0.075, 0.05, 0.6, droop);
    leaf(k, m.leafLight, x, 0.08, z, a0 + Math.PI, 0.075, 0.05, 0.6, droop);
    return;
  }
  const big = stage === 2 ? 0.7 : 1;
  switch (c) {
    case 'lettuce': {
      const n = stage === 2 ? 6 : 8;
      for (let i = 0; i < n; i++) leaf(k, i % 2 ? m.leafLight : m.leaf, x, 0.01, z, a0 + (i / n) * Math.PI * 2, 0.13 * big, 0.11 * big, 0.9, 0.35 + (spoiled ? 0.6 : 0));
      if (stage >= 3) k.geo(blobGeo(stage === 4 ? 0.1 : 0.07, 1, Math.floor(r() * 50), 0.22, 3), m.fruit.lettuce, x, stage === 4 ? 0.07 : 0.05, z).scale.y = 0.75;
      break;
    }
    case 'carrot': {
      const n = stage === 2 ? 4 : 6;
      const h = stage === 2 ? 0.14 : 0.2;
      for (let i = 0; i < n; i++) leaf(k, m.leafDark, x, 0.0, z, a0 + (i / n) * Math.PI * 2, h, 0.035, 1.25, spoiled ? 1 : 0.15);
      if (stage === 3) for (let i = 0; i < 3; i++) k.sphere(0.012, m.flowerW, x + Math.cos(i * 2.1) * 0.03, h + 0.02, z + Math.sin(i * 2.1) * 0.03, 1, 0.6, 1, 5);
      if (stage === 4) {
        const top = k.add(new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.08, 8), m.fruit.carrot), x, 0.02, z);
        top.rotation.x = Math.PI;
        k.sphere(0.03, m.fruit.carrot, x, 0.045, z, 1, 0.4, 1, 8);
      }
      break;
    }
    case 'strawberry': {
      const n = stage === 2 ? 3 : 5;
      for (let i = 0; i < n; i++) {
        const a = a0 + (i / n) * Math.PI * 2;
        k.rod([x, 0, z], [x + Math.sin(a) * 0.06, 0.07 * big, z + Math.cos(a) * 0.06], 0.004, m.stem, 0.003, 4);
        k.sphere(0.04 * big, i % 2 ? m.leafDark : m.leaf, x + Math.sin(a) * 0.08, 0.075 * big, z + Math.cos(a) * 0.08, 1, 0.3, 1, 8);
      }
      if (stage === 3)
        for (let i = 0; i < 3; i++) {
          const a = a0 + i * 2.1 + 0.5;
          k.sphere(0.018, m.flowerW, x + Math.sin(a) * 0.1, 0.06, z + Math.cos(a) * 0.1, 1, 0.4, 1, 6);
          k.sphere(0.007, m.flowerY, x + Math.sin(a) * 0.1, 0.067, z + Math.cos(a) * 0.1, 1, 1, 1, 4);
        }
      if (stage === 4)
        for (let i = 0; i < 3; i++) {
          const a = a0 + i * 2.1 + 0.5;
          const bx = x + Math.sin(a) * 0.14;
          const bz = z + Math.cos(a) * 0.14;
          const berry = k.add(new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.065, 8), m.fruit.strawberry), bx, 0.045, bz);
          berry.rotation.x = Math.PI;
          k.sphere(0.03, m.fruit.strawberry, bx, 0.07, bz, 1, 0.6, 1, 8);
          k.sphere(0.02, m.leafDark, bx, 0.088, bz, 1, 0.35, 1, 6);
        }
      break;
    }
    case 'tomato': {
      const h = stage === 2 ? 0.3 : stage === 3 ? 0.45 : 0.55;
      if (stage >= 3) k.box(0.02, h + 0.1, 0.02, m.stake, x + 0.06, 0, z);
      k.rod([x, 0, z], [x + 0.01, h, z], 0.009, m.stem, 0.006, 5);
      const n = stage === 2 ? 4 : 6;
      for (let i = 0; i < n; i++) {
        const y = 0.08 + (i / n) * (h - 0.08);
        leaf(k, i % 2 ? m.leaf : m.leafDark, x, y, z, a0 + i * 2.3, 0.12 * big, 0.07 * big, 0.25, droop);
      }
      if (stage === 3) for (let i = 0; i < 3; i++) k.sphere(0.016, m.flowerY, x + Math.sin(a0 + i * 2) * 0.05, h * (0.5 + i * 0.15), z + Math.cos(a0 + i * 2) * 0.05, 1, 0.7, 1, 6);
      if (stage === 4)
        for (let i = 0; i < 4; i++) {
          const a = a0 + i * 1.7;
          k.sphere(0.035, i === 3 && !spoiled ? m.fruit.tomato : m.fruit.tomato, x + Math.sin(a) * 0.07, h * (0.35 + (i % 2) * 0.25), z + Math.cos(a) * 0.07, 1, 0.9, 1, 10);
        }
      break;
    }
    case 'cucumber': {
      const h = stage === 2 ? 0.12 : 0.18;
      const n = stage === 2 ? 3 : 5;
      for (let i = 0; i < n; i++) {
        const a = a0 + (i / n) * Math.PI * 2;
        k.rod([x, 0, z], [x + Math.sin(a) * 0.08, h, z + Math.cos(a) * 0.08], 0.005, m.stem, 0.004, 4);
        k.sphere(0.065 * big, i % 2 ? m.leaf : m.leafDark, x + Math.sin(a) * 0.1, h + 0.01, z + Math.cos(a) * 0.1, 1, 0.25, 1, 9);
      }
      if (stage === 3) for (let i = 0; i < 3; i++) k.sphere(0.02, m.flowerY, x + Math.sin(a0 + i * 2) * 0.13, h + 0.03, z + Math.cos(a0 + i * 2) * 0.13, 1, 0.6, 1, 6);
      if (stage === 4)
        for (let i = 0; i < 2; i++) {
          const a = a0 + i * 3;
          const cu = k.add(new THREE.Mesh(new THREE.CapsuleGeometry(0.022, 0.12, 2, 8), m.fruit.cucumber), x + Math.sin(a) * 0.1, 0.03, z + Math.cos(a) * 0.1);
          cu.rotation.set(Math.PI / 2, 0, a);
        }
      break;
    }
    case 'sunflower': {
      const h = stage === 2 ? 0.45 : stage === 3 ? 0.75 : 1.0;
      k.rod([x, 0, z], [x, h, z], 0.014, m.stem, 0.01, 6);
      for (let i = 0; i < 4; i++) leaf(k, m.leaf, x, 0.15 + i * h * 0.18, z, a0 + i * 1.6, 0.15 * big, 0.11 * big, 0.2, droop);
      if (stage === 3) k.sphere(0.05, m.green, x, h + 0.02, z, 1, 0.8, 1, 10);
      if (stage === 4) {
        const head = new Kit();
        const petals = 14;
        for (let i = 0; i < petals; i++) {
          const a = (i / petals) * Math.PI * 2;
          head.sphere(0.035, m.fruit.sunflower, Math.cos(a) * 0.1, Math.sin(a) * 0.1, 0, 1.6, 0.6, 0.25, 6).rotation.z = a;
        }
        head.disc(0.07, 0.03, m.center, 0, 0, 0, 16).rotation.x = Math.PI / 2;
        const g = k.sub(head, x, h + 0.04, z + 0.03);
        g.rotation.x = spoiled ? 0.9 : -0.35;
      }
      break;
    }
  }
}

/** A whole bed of one crop at one stage, baked (bed-local, y = 0 at the soil surface). */
export function buildBedPlants(c: CropId, stage: number, w: number, d: number, spoiled: boolean): THREE.Group {
  const k = new Kit();
  const m = mats(spoiled);
  let seed = 7 + c.length * 13 + stage;
  const r = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (const [x, z] of plantSpots(c, w, d)) one(k, c, stage, x, z, m, r, spoiled);
  const g = bake(k.g);
  g.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });
  return g;
}

/** a tuft of weeds (bed-local, on the soil) */
export function buildWeeds(w: number, d: number, seed: number): THREE.Group {
  const k = new Kit();
  const m = M.leaf('#3f6b2a');
  const m2 = M.leaf('#6a8a2a');
  let s = seed * 9301 + 49297;
  const r = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  for (let i = 0; i < 6; i++) {
    const x = (r() - 0.5) * (w - 0.3);
    const z = (r() - 0.5) * (d - 0.25);
    for (let j = 0; j < 6; j++) leaf(k, j % 2 ? m : m2, x, 0, z, r() * Math.PI * 2, 0.1 + r() * 0.08, 0.025, 1.0 + r() * 0.4, 0.1);
    if (i % 2 === 0) k.sphere(0.014, M.matte('#f2e04a'), x, 0.15, z, 1, 1, 1, 5);
  }
  return bake(k.g);
}
