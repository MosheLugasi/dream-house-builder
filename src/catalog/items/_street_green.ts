/** Fences, garden wall and Mediterranean trees. */
import * as THREE from 'three';
import type { FurnitureDef } from '../types';
import { D, INK_SOFT, Kit, LINE_THIN, M, blobGeo, darken, extrudeZ, latheGeo, lighten, mix, organicGeo, rng, sym, tint } from '../kit';
import { slot } from './_parts';
import { axisCyl, bendGeo, gnarlGeo, polyShape } from './_street_shared';

/* ------------------------------------------------------------------ timber picket fence + gate */

const FW = { w: 2.0, d: 0.08, h: 1.0, n: 14, pitch: 0.13, pw: 0.09 };

function picketGeo(w: number, h: number, t: number): THREE.BufferGeometry {
  const g = extrudeZ(
    polyShape([
      [-w / 2, 0],
      [w / 2, 0],
      [w / 2, h - w * 0.55],
      [0, h],
      [-w / 2, h - w * 0.55],
    ]),
    t,
  );
  // wood grain runs along the picket
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getY(i), p.getX(i) + p.getZ(i));
  return g;
}

const fenceWood: FurnitureDef = {
  id: 'fence-wood',
  name: 'גדר עץ',
  category: 'street',
  size: { w: FW.w, d: FW.d, h: FW.h },
  colors: [slot('wood', 'צבע', '#f1ede2')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const wood = M.wood(c.wood, 0.7);
    const { w, h, n, pitch, pw } = FW;
    // end posts with chamfered caps
    for (const s of [-1, 1]) {
      const x = s * (w / 2 - 0.035);
      k.rbox(0.07, h - 0.03, 0.07, 0.006, wood, x, 0, 0, 1);
      const cap = new THREE.CylinderGeometry(0.012, 0.052, 0.03, 4);
      cap.rotateY(Math.PI / 4);
      k.geo(cap, wood, x, h - 0.015, 0);
    }
    for (const y of [0.2, 0.66]) k.box(w - 0.14, 0.07, 0.028, wood, 0, y, -0.016);
    const pg = picketGeo(pw, 0.86, 0.02);
    for (let i = 0; i < n; i++) k.geo(pg, wood, (i - (n - 1) / 2) * pitch, 0.06, 0.012);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { w, d, n, pitch, pw } = FW;
      D.rr(ctx, 0, -0.016, w - 0.14, 0.028, 0, tint(c.wood, 0.1), INK_SOFT, 0.006);
      for (let i = 0; i < n; i++) D.rr(ctx, (i - (n - 1) / 2) * pitch, 0.012, pw, 0.022, 0, tint(c.wood, 0.3), undefined, 0.006);
      for (const s of [-1, 1]) D.rr(ctx, s * (w / 2 - 0.035), 0, 0.07, d - 0.01, 0.005, tint(c.wood, 0.2), undefined, 0.008);
    }),
};

const FG = { w: 1.0, d: 0.1, h: 1.1 };

const fenceGate: FurnitureDef = {
  id: 'fence-gate',
  name: 'שער גינה',
  category: 'street',
  size: FG,
  colors: [slot('wood', 'צבע', '#f1ede2')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const wood = M.wood(c.wood, 0.7);
    const iron = M.blackMetal();
    const { w, h } = FG;
    for (const s of [-1, 1]) {
      const x = s * (w / 2 - 0.045);
      k.rbox(0.09, h - 0.06, 0.09, 0.008, wood, x, 0, 0, 1);
      const cap = new THREE.CylinderGeometry(0.015, 0.066, 0.045, 4);
      cap.rotateY(Math.PI / 4);
      k.geo(cap, wood, x, h - 0.0375, 0);
      k.sphere(0.02, wood, x, h - 0.021, 0, 1, 1, 1, 8);
    }
    // gate leaf: arched row of pickets on a Z-braced frame
    const x0 = -0.395;
    const x1 = 0.395;
    for (const y of [0.2, 0.68]) k.box(x1 - x0, 0.07, 0.028, wood, 0, y, -0.016);
    k.beam([x0 + 0.03, 0.235, -0.016], [x1 - 0.03, 0.715, -0.016], 0.065, 0.026, wood);
    const n = 6;
    for (let i = 0; i < n; i++) {
      const x = x0 + 0.05 + (i * (x1 - x0 - 0.1)) / (n - 1);
      const arch = 0.14 * (1 - (x / 0.4) ** 2);
      k.geo(picketGeo(0.095, 0.82 + arch, 0.02), wood, x, 0.07, 0.012);
    }
    // strap hinges, latch
    for (const y of [0.235, 0.715]) {
      k.box(0.22, 0.03, 0.006, iron, x0 + 0.09, y - 0.015, 0.025);
      k.cyl(0.012, 0.06, iron, x0 - 0.012, y - 0.03, 0.02, 0.012, 8);
    }
    k.box(0.14, 0.022, 0.008, iron, x1 - 0.03, 0.74, 0.026);
    k.box(0.02, 0.05, 0.02, iron, x1 + 0.03, 0.725, 0.03);
    axisCyl(k, 0.02, 0.012, iron, x1 - 0.09, 0.751, 0.034, 'z', 0.02, 10);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { w } = FG;
      D.rr(ctx, 0, 0, 0.79, 0.04, 0.004, tint(c.wood, 0.3), undefined, 0.008);
      for (const s of [-1, 1]) D.rr(ctx, s * (w / 2 - 0.045), 0, 0.09, 0.09, 0.008, tint(c.wood, 0.2), undefined, 0.008);
    }),
};

/* ------------------------------------------------------------------ steel railing fence */

const FM = { w: 2.0, d: 0.07, h: 1.1, n: 15, pitch: 0.118 };

const fenceMetal: FurnitureDef = {
  id: 'fence-metal',
  name: 'גדר מתכת',
  category: 'street',
  size: { w: FM.w, d: FM.d, h: FM.h },
  colors: [slot('metal', 'מתכת', '#2b2e31')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const m = M.metal(c.metal, 0.5, 0.6);
    const { w, h, n, pitch } = FM;
    for (const s of [-1, 1]) {
      const x = s * (w / 2 - 0.03);
      k.rbox(0.05, h - 0.07, 0.05, 0.004, m, x, 0, 0, 1);
      k.box(0.07, 0.012, 0.07, m, x, h - 0.07, 0);
      k.sphere(0.03, m, x, h - 0.03, 0, 1, 1, 1, 10);
      k.box(0.06, 0.008, 0.07, m, x, 0, 0);
    }
    for (const y of [0.13, 0.88]) k.box(w - 0.1, 0.035, 0.028, m, 0, y, 0);
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * pitch;
      k.box(0.014, 0.9, 0.014, m, x, 0.1, 0);
      // spear tip
      const tip = new THREE.ConeGeometry(0.016, 0.06, 4);
      tip.rotateY(Math.PI / 4);
      k.geo(tip, m, x, 1.03, 0);
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { w, n, pitch } = FM;
      D.rr(ctx, 0, 0, w - 0.1, 0.028, 0, tint(c.metal, 0.6), undefined, 0.007);
      for (let i = 0; i < n; i++) D.circle(ctx, (i - (n - 1) / 2) * pitch, 0, 0.012, tint(c.metal, 0.1), null);
      for (const s of [-1, 1]) D.rr(ctx, s * (w / 2 - 0.03), 0, 0.06, 0.06, 0.005, tint(c.metal, 0.35), undefined, 0.008);
    }),
};

/* ------------------------------------------------------------------ limestone garden wall */

const SW = { w: 2.0, d: 0.3, h: 0.6 };

interface Stone {
  x: number;
  y: number;
  w: number;
  h: number;
  tone: number;
}

function wallStones(): { stones: Stone[]; cap: Stone[] } {
  const r = rng(12);
  const stones: Stone[] = [];
  const courseH = [0.17, 0.15, 0.165];
  let y = 0;
  courseH.forEach((ch, ci) => {
    let x = -SW.w / 2;
    let first = true;
    while (x < SW.w / 2 - 0.001) {
      let sw = 0.2 + r() * 0.24;
      if (first && ci % 2 === 1) sw *= 0.55;
      first = false;
      if (SW.w / 2 - (x + sw) < 0.14) sw = SW.w / 2 - x;
      stones.push({ x: x + sw / 2, y, w: sw, h: ch, tone: r() });
      x += sw;
    }
    y += ch;
  });
  const cap: Stone[] = [];
  const n = 5;
  for (let i = 0; i < n; i++) cap.push({ x: -SW.w / 2 + (i + 0.5) * (SW.w / n), y, w: SW.w / n, h: SW.h - y, tone: r() });
  return { stones, cap };
}

const stoneWall: FurnitureDef = {
  id: 'stone-wall',
  name: 'חומת אבן נמוכה',
  category: 'street',
  size: SW,
  colors: [slot('stone', 'אבן', '#e3d6bb')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const mats = [M.stone(c.stone, 0.9), M.stone(lighten(c.stone, 0.12), 0.9), M.stone(mix(c.stone, '#c9a877', 0.3), 0.9), M.stone(darken(c.stone, 0.08), 0.9)];
    const { stones, cap } = wallStones();
    const joint = 0.012;
    const bd = SW.d - 0.03;
    // mortar core, then rough-dressed blocks
    k.box(SW.w - 0.004, 0.48, bd - 0.03, M.matte(darken(c.stone, 0.22)), 0, 0, 0);
    const r = rng(4);
    for (const s of stones) {
      const bulge = 0.006 + r() * 0.012;
      k.rbox(s.w - joint, s.h - joint, bd + bulge, 0.018, mats[Math.floor(s.tone * 4)], s.x, s.y + joint / 2, 0, 1);
    }
    for (const s of cap) k.rbox(s.w - 0.006, s.h, SW.d, 0.02, mats[1 + Math.floor(s.tone * 2)], s.x, s.y, 0, 1);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, SW.w, SW.d, 0.01, tint(c.stone, 0.35));
      const { cap } = wallStones();
      for (const s of cap.slice(1)) D.line(ctx, s.x - s.w / 2, -SW.d / 2, s.x - s.w / 2, SW.d / 2, INK_SOFT, 0.008);
    }),
};

/* ------------------------------------------------------------------ date palm */

const PALM = { w: 4.6, h: 7.25, trunkH: 5.2, lean: 0.24, fronds: 24 };

interface Frond {
  az: number;
  elev: number;
  len: number;
  bend: number;
}

function palmFronds(): Frond[] {
  const r = rng(31);
  const out: Frond[] = [];
  const n = PALM.fronds;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1); // 0 = young upright centre, 1 = old drooping skirt
    out.push({
      az: i * 2.39996 + r() * 0.3,
      elev: 1.25 - t * 1.55 + (r() - 0.5) * 0.15,
      len: 2.05 + t * 0.75 + r() * 0.25,
      bend: 0.75 + t * 0.55 + r() * 0.2,
    });
  }
  return out;
}

/** points along a frond's midrib, relative to the crown */
function frondSpine(f: Frond, n: number): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  let rad = 0.1;
  let y = 0;
  const ds = f.len / n;
  pts.push(new THREE.Vector3(Math.cos(f.az) * rad, y, Math.sin(f.az) * rad));
  for (let i = 1; i <= n; i++) {
    const s = (i - 0.5) / n;
    const phi = f.elev - f.bend * s * s * 1.6;
    rad += Math.cos(phi) * ds;
    y += Math.sin(phi) * ds;
    pts.push(new THREE.Vector3(Math.cos(f.az) * rad, y, Math.sin(f.az) * rad));
  }
  return pts;
}

const palmTree: FurnitureDef = {
  id: 'palm-tree',
  name: 'עץ דקל',
  category: 'street',
  size: { w: PALM.w, d: PALM.w, h: PALM.h },
  colors: [slot('leaves', 'כפות', '#55803a'), slot('trunk', 'גזע', '#8a7257')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { trunkH, lean } = PALM;
    const bark = M.bark(c.trunk);
    // ringed trunk: old leaf bases leave a saw-tooth profile
    const prof: Array<[number, number]> = [
      [0.36, 0],
      [0.3, 0.1],
      [0.25, 0.32],
    ];
    const step = 0.2;
    for (let y = 0.4; y < trunkH - 0.2; y += step) {
      const rr = 0.2 - (y / trunkH) * 0.035;
      prof.push([rr + 0.022, y], [rr - 0.004, y + step * 0.85]);
    }
    prof.push([0.17, trunkH - 0.15], [0.24, trunkH + 0.12], [0.26, trunkH + 0.3], [0.2, trunkH + 0.5], [0.06, trunkH + 0.62]);
    const shift = (y: number): [number, number] => [-lean / 2 + lean * Math.pow(Math.min(1.15, y / trunkH), 1.8), 0];
    k.geo(bendGeo(latheGeo(prof, 9), shift), bark);
    const cx = lean / 2;
    const cy = trunkH + 0.35;
    // stubs of cut fronds under the crown
    const r = rng(8);
    const stub = M.bark(mix(c.trunk, '#b08a55', 0.4));
    for (let i = 0; i < 12; i++) {
      const a = i * 2.39996;
      const y0 = trunkH - 0.1 + r() * 0.35;
      k.rod([cx + Math.cos(a) * 0.17, y0, Math.sin(a) * 0.17], [cx + Math.cos(a) * 0.36, y0 + 0.2 + r() * 0.1, Math.sin(a) * 0.36], 0.035, stub, 0.022, 5);
    }
    // fronds: midrib tube + feathered leaflets, two tones
    const leafMats = [M.foliage(c.leaves, true), M.foliage(darken(c.leaves, 0.16), true), M.foliage(lighten(c.leaves, 0.1), true)];
    const rib = M.foliage(mix(c.leaves, '#b9b25a', 0.45));
    const soup: number[][] = [[], [], []];
    const SEG = 9;
    const up = new THREE.Vector3(0, 1, 0);
    palmFronds().forEach((f, fi) => {
      const spine = frondSpine(f, SEG).map((p) => p.add(new THREE.Vector3(cx, cy, 0)));
      const curve = new THREE.CatmullRomCurve3(spine);
      k.geo(new THREE.TubeGeometry(curve, SEG, 0.02, 3, false), rib);
      const lat = new THREE.Vector3(-Math.sin(f.az), 0, Math.cos(f.az));
      const N = 17;
      const out = soup[fi % 3];
      for (let j = 0; j < N; j++) {
        const s0 = 0.1 + (j / N) * 0.9;
        const s1 = 0.1 + ((j + 0.92) / N) * 0.9;
        const sm = (s0 + s1) / 2;
        const p0 = curve.getPoint(s0);
        const p1 = curve.getPoint(Math.min(1, s1));
        const pm = curve.getPoint(Math.min(1, sm));
        const tan = curve.getTangent(Math.min(1, sm));
        const nrm = new THREE.Vector3().crossVectors(lat, tan).normalize(); // "up" of the frond
        if (nrm.dot(up) < 0 && Math.abs(tan.y) < 0.95) nrm.negate();
        const ll = 0.62 * Math.pow(Math.sin(Math.PI * (0.1 + 0.86 * sm)), 0.55) * (0.85 + (f.len - 2) * 0.12);
        for (const side of [-1, 1]) {
          const tip = pm
            .clone()
            .addScaledVector(lat, side * ll * 0.86)
            .addScaledVector(tan, ll * 0.42)
            .addScaledVector(nrm, ll * 0.12)
            .add(new THREE.Vector3(0, -ll * 0.3, 0));
          out.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, tip.x, tip.y, tip.z);
        }
      }
    });
    soup.forEach((arr, i) => {
      if (!arr.length) return;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      const uv = new Float32Array((arr.length / 3) * 2);
      for (let q = 0; q < uv.length; q += 6) {
        uv[q + 2] = 0.2;
        uv[q + 4] = 0.1;
        uv[q + 5] = 1;
      }
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      g.computeVertexNormals();
      k.geo(g, leafMats[i]);
    });
    // bunches of dates
    const dates = M.plastic('#c98a2e');
    for (let i = 0; i < 3; i++) {
      const a = 0.6 + i * 2.2;
      const bx = cx + Math.cos(a) * 0.42;
      const bz = Math.sin(a) * 0.42;
      k.rod([cx + Math.cos(a) * 0.15, cy + 0.05, Math.sin(a) * 0.15], [bx, cy - 0.12, bz], 0.012, rib, 0.01, 4);
      k.sphere(0.13, dates, bx, cy - 0.3, bz, 0.8, 1.5, 0.8, 7);
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const cx = PALM.lean / 2;
      const fr = palmFronds();
      fr.forEach((f, i) => {
        const pts = frondSpine(f, 6);
        const end = pts[pts.length - 1];
        const L = Math.min(PALM.w / 2 - 0.06 - Math.abs(cx), Math.hypot(end.x, end.z));
        ctx.save();
        ctx.translate(cx, 0);
        ctx.rotate(f.az);
        D.ellipse(ctx, L / 2 + 0.05, 0, L / 2, 0.2 + L * 0.06, tint(c.leaves, i % 2 ? 0.5 : 0.36) + 'd0', tint(c.leaves, 0.02), 0.008);
        D.line(ctx, 0.1, 0, L, 0, tint(c.leaves, 0.02), 0.008);
        ctx.restore();
      });
      D.circle(ctx, -PALM.lean / 2, 0, 0.3, null, INK_SOFT, LINE_THIN);
      D.circle(ctx, cx, 0, 0.2, tint(c.trunk, 0.25), undefined, LINE_THIN);
    }),
};

/* ------------------------------------------------------------------ olive tree */

const OLIVE = { w: 3.56, h: 3.66 };

function oliveBlobs(): Array<[number, number, number, number]> {
  const r = rng(52);
  const blobs: Array<[number, number, number, number]> = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + r() * 0.4;
    const rad = 1.1 + r() * 0.22;
    blobs.push([Math.cos(a) * rad, 2.3 + r() * 0.4, Math.sin(a) * rad, 0.44 + r() * 0.1]);
  }
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.5 + r() * 0.3;
    const rad = 0.52 + r() * 0.16;
    blobs.push([Math.cos(a) * rad, 2.85 + r() * 0.25, Math.sin(a) * rad, 0.5 + r() * 0.08]);
  }
  blobs.push([0.12, 3.25, -0.08, 0.5], [-0.2, 3.15, 0.15, 0.44]);
  return blobs;
}

const oliveTree: FurnitureDef = {
  id: 'olive-tree',
  name: 'עץ זית',
  category: 'street',
  size: { w: OLIVE.w, d: OLIVE.w, h: OLIVE.h },
  colors: [slot('leaves', 'עלווה', '#74876a'), slot('trunk', 'גזע', '#6b5a4a')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const bark = M.bark(c.trunk);
    // short, thick, twisted bole with buttress roots
    const bole = latheGeo(
      [
        [0.56, 0],
        [0.42, 0.06],
        [0.32, 0.22],
        [0.26, 0.5],
        [0.24, 0.85],
        [0.27, 1.15],
        [0.25, 1.32],
        [0.1, 1.42],
      ],
      16,
    );
    k.geo(organicGeo(gnarlGeo(bole, 5, 0.17, 2.6, 2), 0.025, 2.4, 6), bark, 0, 0.02, 0);
    // crooked limbs
    const r = rng(19);
    const limbEnds: Array<[number, number, number]> = [];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.5 + r() * 0.4;
      const dx = Math.cos(a);
      const dz = Math.sin(a);
      const k1 = 0.34 + r() * 0.1;
      const p0: [number, number, number] = [dx * 0.1, 1.22, dz * 0.1];
      const p1: [number, number, number] = [dx * k1 + dz * 0.12, 1.75 + r() * 0.1, dz * k1 - dx * 0.12];
      const p2: [number, number, number] = [dx * 0.78 - dz * 0.1, 2.2 + r() * 0.15, dz * 0.78 + dx * 0.1];
      const p3: [number, number, number] = [dx * 1.12, 2.5, dz * 1.12];
      k.rod(p0, p1, 0.13, bark, 0.095, 7);
      k.sphere(0.097, bark, p1[0], p1[1], p1[2], 1, 1, 1, 7);
      k.rod(p1, p2, 0.095, bark, 0.065, 7);
      k.sphere(0.066, bark, p2[0], p2[1], p2[2], 1, 1, 1, 7);
      k.rod(p2, p3, 0.065, bark, 0.035, 6);
      // secondary branch towards the centre top
      k.rod(p1, [dx * 0.3, 2.75, dz * 0.3], 0.07, bark, 0.03, 6);
      limbEnds.push(p3);
    }
    // airy silver-green canopy
    const mats = [M.foliage(c.leaves), M.foliage(lighten(c.leaves, 0.14)), M.foliage(darken(c.leaves, 0.14))];
    oliveBlobs().forEach(([x, y, z, br], i) => {
      const m = k.geo(blobGeo(br, 2, 70 + i * 3, 0.16, 2.4), mats[i % 3], x, y, z);
      m.scale.y = 0.74;
      m.rotation.y = i * 1.7;
    });
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const R = OLIVE.w / 2 - 0.08;
      D.foliage(ctx, 0, 0, R, tint(c.leaves, 0.5) + 'd9', 10, 52);
      D.foliage(ctx, 0.05, -0.04, R * 0.55, tint(c.leaves, 0.34) + 'cc', 7, 55, tint(c.leaves, 0.05));
      D.circle(ctx, 0, 0, 0.3, tint(c.trunk, 0.25), undefined, LINE_THIN);
      D.circle(ctx, 0.04, -0.03, 0.14, null, INK_SOFT, 0.007);
    }),
};

export const STREET_GREEN: FurnitureDef[] = [fenceWood, fenceMetal, fenceGate, stoneWall, palmTree, oliveTree];
