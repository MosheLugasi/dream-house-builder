import * as THREE from 'three';
import type { FurnitureDef } from '../types';
import { D, INK_SOFT, Kit, LINE_THIN, M, PAL, darken, latheGeo, lighten, noise3, roundedRectShape, smoothProfile, sym, tint } from '../kit';
import { bedding, drawBedding } from './bedroom';
import { legs4, slot } from './_parts';
import { KIDS_TOYS } from './_kids_toys';

/* ------------------------------------------------------------------ bunk bed */

const BUNK = { mw: 0.9, len: 2.0, w: 1.02, d: 2.1, h: 1.7 };
const BUNK_LOW = 0.26; // underside of the lower mattress
const BUNK_HIGH = 1.14;

const bunkBed: FurnitureDef = {
  id: 'bunk-bed',
  name: 'מיטת קומתיים',
  category: 'kids',
  size: { w: BUNK.w, d: BUNK.d, h: BUNK.h },
  colors: [slot('frame', 'מסגרת', PAL.white), slot('bedding', 'מצעים', PAL.dustyBlue), slot('throw', 'כיסוי', PAL.mustard)],
  seats: [
    { x: 0, z: 0.05, height: BUNK_LOW + 0.26, facing: 0, kind: 'lie' },
    { x: 0, z: 0.05, height: BUNK_HIGH + 0.26, facing: 0, kind: 'lie' },
    { x: 0.3, z: 0.3, height: BUNK_LOW + 0.22, facing: Math.PI / 2, kind: 'sit' },
  ],
  actions: [{ kind: 'sleep' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const m = M.paint(c.frame, 0.45);
    const { w, d, h, mw, len } = BUNK;
    const p = 0.06;
    const px = w / 2 - p / 2;
    const pz = d / 2 - p / 2;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.rbox(p, h, p, 0.008, m, sx * px, 0, sz * pz, 1);
    for (const y of [BUNK_LOW, BUNK_HIGH]) {
      // side rails, end boards, slat base
      for (const sx of [-1, 1]) k.rbox(0.028, 0.16, d - 2 * p, 0.005, m, sx * (w / 2 - 0.02), y - 0.06, 0, 1);
      for (const sz of [-1, 1]) k.rbox(w - 2 * p, 0.36, 0.028, 0.005, m, 0, y - 0.06, sz * (d / 2 - 0.02), 1);
      k.box(w - 0.07, 0.016, d - 2 * p, M.matte('#cfc6b8'), 0, y - 0.018, 0);
    }
    // guard rails for the top bunk (full on the wall side, partial at the open side)
    const gy = BUNK_HIGH + 0.34;
    k.rbox(0.024, 0.07, d - 2 * p, 0.005, m, -(w / 2 - 0.02), gy, 0, 1);
    k.rbox(0.024, 0.07, d - 2 * p - 0.5, 0.005, m, w / 2 - 0.02, gy, -0.25, 1);
    for (const z of [-0.5, 0.0]) k.rbox(0.024, 0.2, 0.05, 0.004, m, w / 2 - 0.02, BUNK_HIGH + 0.1, z, 1);
    k.rbox(0.024, 0.2, 0.05, 0.004, m, -(w / 2 - 0.02), BUNK_HIGH + 0.1, 0, 1);
    // head/foot top rails
    for (const sz of [-1, 1]) k.rbox(w - 2 * p, 0.06, 0.028, 0.005, m, 0, h - 0.1, sz * (d / 2 - 0.02), 1);
    // ladder at the foot end of the open (+X) side
    const lx = w / 2 - 0.02;
    k.rbox(0.03, BUNK_HIGH + 0.42, 0.04, 0.005, m, lx, 0, pz - 0.44, 1);
    for (let i = 0; i < 4; i++) {
      k.rod([lx, 0.28 + i * 0.29, pz - 0.44], [lx, 0.28 + i * 0.29, pz - 0.02], 0.016, m, 0.016, 10);
    }
    const zHead = -d / 2 + p + 0.02;
    const colors = { bedding: c.bedding, throw: c.throw };
    const low = new Kit();
    bedding(low, colors, mw, len - 0.06, 1, 0, zHead, true);
    k.sub(low, 0, BUNK_LOW, 0);
    const top = new Kit();
    bedding(top, { bedding: c.throw, throw: c.bedding }, mw, len - 0.06, 1, 0, zHead, false);
    k.sub(top, 0, BUNK_HIGH, 0);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { w, d, mw, len } = BUNK;
      D.rr(ctx, 0, 0, w, d, 0.01, tint(c.frame, 0.5));
      drawBedding(ctx, { bedding: c.throw, throw: c.bedding }, mw, len - 0.06, 1, -d / 2 + 0.08, false);
      // ladder
      const z0 = d / 2 - 0.47;
      D.box(ctx, w / 2 - 0.05, z0, w / 2, d / 2 - 0.05, 0, '#ffffff', undefined, LINE_THIN);
      for (let i = 1; i < 4; i++) D.line(ctx, w / 2 - 0.05, z0 + i * 0.105, w / 2, z0 + i * 0.105, INK_SOFT, 0.008);
      // "upper bunk" hint: dashed diagonals
      ctx.setLineDash([0.06, 0.05]);
      D.line(ctx, -w / 2, -d / 2, w / 2, d / 2, INK_SOFT, 0.008);
      D.line(ctx, w / 2, -d / 2, -w / 2, d / 2, INK_SOFT, 0.008);
    }),
};

/* ------------------------------------------------------------------ desk + chair */

const kidsDesk: FurnitureDef = {
  id: 'kids-desk',
  name: 'שולחן כתיבה לילדים',
  category: 'kids',
  size: { w: 1.0, d: 0.55, h: 1.02 },
  colors: [slot('top', 'משטח', PAL.birch), slot('accent', 'צבע', PAL.dustyBlue)],
  build: ({ colors: c }) => {
    const k = new Kit();
    const wood = M.wood(c.top);
    const acc = M.paint(c.accent, 0.45);
    const w = 1.0;
    const d = 0.55;
    const th = 0.6;
    k.slab(roundedRectShape(w - 0.01, d - 0.01, 0.04), 0.024, wood, 0, th - 0.024, 0, 0.005);
    k.box(w - 0.14, 0.07, d - 0.12, acc, 0, th - 0.094, 0);
    legs4(k, w - 0.1, d - 0.08, th - 0.09, wood, { rTop: 0.022, rBot: 0.014, inset: 0.035, splay: 0.03 });
    // hutch: two uprights, a shelf and a back board with pegs
    const hz = -d / 2 + 0.085;
    for (const s of [-1, 1]) k.rbox(0.018, 0.3, 0.15, 0.004, acc, s * (w / 2 - 0.06), th, hz, 1);
    k.rbox(w - 0.1, 0.018, 0.16, 0.004, wood, 0, th + 0.3, hz, 1);
    k.box(w - 0.14, 0.3, 0.01, M.paint(lighten(c.accent, 0.6), 0.6), 0, th, -d / 2 + 0.016);
    // things on the desk
    const cols = ['#c7775a', '#d6a544', '#9bae8a', '#7a8fa3', '#e6dfd0'];
    for (let i = 0; i < 5; i++) k.box(0.026, 0.19 + (i % 2) * 0.03, 0.13, M.matte(cols[i]), -0.36 + i * 0.028, th, hz + 0.01);
    k.cyl(0.035, 0.085, M.ceramic(PAL.mustard), 0.3, th, hz + 0.02, 0.038, 14);
    for (let i = 0; i < 4; i++) {
      k.rod([0.3 + (i - 1.5) * 0.012, th + 0.02, hz + 0.02], [0.3 + (i - 1.5) * 0.03, th + 0.17, hz + 0.02 + (i % 2) * 0.02], 0.0045, M.matte(cols[i]));
    }
    k.sphere(0.05, M.plastic('#7a8fa3'), 0.1, th + 0.318 + 0.05, hz, 1, 1, 1, 14);
    k.cyl(0.03, 0.006, M.matte('#3a3531'), 0.1, th + 0.318, hz, 0.03, 12);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 1.0, 0.55, 0.04, tint(c.top, 0.35));
      D.rr(ctx, 0, -0.19, 0.9, 0.16, 0.01, tint(c.accent, 0.45), undefined, LINE_THIN);
      D.circle(ctx, 0.3, -0.17, 0.038, '#ffffff', undefined, LINE_THIN);
    }),
};

const KID_SEAT = 0.34;

const kidsChair: FurnitureDef = {
  id: 'kids-chair',
  name: 'כיסא ילדים',
  category: 'kids',
  size: { w: 0.36, d: 0.38, h: 0.62 },
  colors: [slot('seat', 'צבע', PAL.terracotta), slot('wood', 'רגליים', PAL.birch)],
  seats: [{ x: 0, z: 0.02, height: KID_SEAT, facing: 0, kind: 'sit' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const wood = M.wood(c.wood);
    const col = M.paint(c.seat, 0.45);
    k.slab(roundedRectShape(0.32, 0.3, 0.06), 0.024, col, 0, KID_SEAT - 0.024, 0.025, 0.006);
    for (const s of [-1, 1]) {
      k.rod([s * 0.158, 0.002, 0.168], [s * 0.125, KID_SEAT - 0.02, 0.135], 0.012, wood, 0.016);
      k.rod([s * 0.158, 0.002, -0.172], [s * 0.125, KID_SEAT - 0.02, -0.105], 0.012, wood, 0.016);
      k.rod([s * 0.125, KID_SEAT - 0.02, -0.105], [s * 0.13, 0.6, -0.168], 0.014, wood, 0.012);
    }
    // back board with a soft rounded outline
    const back = k.slab(roundedRectShape(0.3, 0.13, 0.05), 0.018, col, 0, 0, 0, 0.004);
    back.rotation.x = Math.PI / 2 - 0.17;
    back.position.set(0, 0.52, -0.166);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0.025, 0.32, 0.3, 0.06, tint(c.seat, 0.4));
      D.rr(ctx, 0, -0.155, 0.3, 0.035, 0.015, tint(c.seat, 0.2));
    }),
};

/* ------------------------------------------------------------------ toy chest */

const toyChest: FurnitureDef = {
  id: 'toy-chest',
  name: 'ארגז צעצועים',
  category: 'kids',
  size: { w: 0.8, d: 0.45, h: 0.64 },
  colors: [slot('body', 'ארגז', PAL.white), slot('lid', 'מכסה', PAL.oak)],
  build: ({ colors: c }) => {
    const k = new Kit();
    const body = M.paint(c.body, 0.5);
    const w = 0.8;
    const d = 0.45;
    k.rbox(w - 0.02, 0.4, d - 0.02, 0.012, body, 0, 0.03, 0, 1);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl(0.02, 0.03, M.wood(c.lid), sx * (w / 2 - 0.07), 0, sz * (d / 2 - 0.07), 0.024, 10);
    // grip cut-outs on the front and sides
    const dark = M.matte(darken(c.body, 0.6));
    k.rbox(0.14, 0.035, 0.004, 0.002, dark, 0, 0.335, d / 2 - 0.0105, 1);
    for (const s of [-1, 1]) k.rbox(0.004, 0.035, 0.12, 0.002, dark, s * (w / 2 - 0.0105), 0.335, 0, 1);
    // lid
    k.slab(roundedRectShape(w - 0.01, d - 0.01, 0.02), 0.024, M.wood(c.lid), 0, 0.43, 0, 0.005);
    // toys on the lid: ball, stacking blocks, teddy-ish blob
    const y = 0.454;
    k.sphere(0.075, M.plastic(PAL.terracotta), -0.24, y + 0.075, 0.02, 1, 1, 1, 16);
    k.ring(0.0755, 0.006, M.plastic('#f4f1ea'), -0.24, y + 0.075, 0.02, 20);
    const cols = [PAL.dustyBlue, PAL.mustard, PAL.sage];
    k.rbox(0.07, 0.07, 0.07, 0.008, M.paint(cols[0]), 0.02, y, -0.03, 1);
    k.rbox(0.07, 0.07, 0.07, 0.008, M.paint(cols[1]), 0.1, y, 0.0, 1).rotation.y = 0.3;
    k.rbox(0.07, 0.07, 0.07, 0.008, M.paint(cols[2]), 0.055, y + 0.07, -0.015, 1).rotation.y = 0.5;
    // teddy
    const fur = M.fabric('#b98d62', 16);
    k.sphere(0.055, fur, 0.27, y + 0.05, 0, 1, 1, 0.9, 12);
    k.sphere(0.042, fur, 0.27, y + 0.125, 0.005, 1, 1, 1, 12);
    for (const s of [-1, 1]) {
      k.sphere(0.016, fur, 0.27 + s * 0.032, y + 0.16, 0, 1, 1, 0.6, 8);
      k.sphere(0.02, fur, 0.27 + s * 0.055, y + 0.065, 0.02, 1, 1.3, 1, 8);
      k.sphere(0.022, fur, 0.27 + s * 0.035, y + 0.018, 0.045, 1, 0.8, 1.4, 8);
    }
    k.sphere(0.018, M.fabric('#e3c9a8', 16), 0.27, y + 0.118, 0.04, 1, 0.8, 0.8, 8);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 0.8, 0.45, 0.02, tint(c.lid, 0.35));
      D.rr(ctx, 0, 0, 0.72, 0.37, 0.01, null, INK_SOFT, LINE_THIN);
      D.circle(ctx, -0.24, 0.02, 0.075, tint(PAL.terracotta, 0.3), undefined, LINE_THIN);
      D.rr(ctx, 0.05, -0.015, 0.1, 0.1, 0.01, tint(PAL.dustyBlue, 0.3), undefined, LINE_THIN);
      D.circle(ctx, 0.27, 0.01, 0.055, tint('#b98d62', 0.3), undefined, LINE_THIN);
    }),
};

/* ------------------------------------------------------------------ bean bag */

const beanBag: FurnitureDef = {
  id: 'bean-bag',
  name: 'פוף שק',
  category: 'kids',
  size: { w: 0.9, d: 0.92, h: 0.76 },
  colors: [slot('fabric', 'בד', PAL.terracotta)],
  seats: [{ x: 0, z: 0.12, height: 0.33, facing: 0, kind: 'sit' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const g = latheGeo(
      smoothProfile(
        [
          [0, 0],
          [0.3, 0],
          [0.4, 0.035],
          [0.44, 0.13],
          [0.43, 0.26],
          [0.38, 0.4],
          [0.3, 0.53],
          [0.2, 0.64],
          [0.1, 0.71],
          [0, 0.73],
        ],
        18,
      ),
      28,
    );
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i);
      let y = p.getY(i);
      let z = p.getZ(i);
      // lean the peak backwards and press a seat into the front
      const t = y / 0.73;
      z -= 0.3 * t * t;
      const f0 = Math.max(0, Math.min(1, (z + 0.2) / 0.36));
      const front = f0 * f0 * (3 - 2 * f0);
      y -= 0.46 * front * t;
      z += 0.1 * front * t;
      // soft wrinkles
      const n = noise3(x * 5 + 3, y * 5, z * 5) - 0.5;
      const s = 1 + n * 0.07 * Math.min(1, y * 8);
      x *= s;
      z *= s;
      p.setXYZ(i, x, Math.max(0, y), z + 0.01);
    }
    g.computeVertexNormals();
    k.geo(g, M.fabric(c.fabric, 10));
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.ellipse(ctx, 0, 0.01, 0.44, 0.455, tint(c.fabric, 0.4));
      D.ellipse(ctx, 0, 0.14, 0.27, 0.24, null, INK_SOFT, LINE_THIN);
      D.arc(ctx, 0, -0.1, 0.25, Math.PI * 1.15, Math.PI * 1.85, INK_SOFT, LINE_THIN);
    }),
};

/* ------------------------------------------------------------------ play tent (teepee) */

const TENT = { r: 0.62, apex: 1.42, zOff: 0.058 };

function tentVerts(): Array<[number, number]> {
  // pentagon with one EDGE facing +Z (the entrance)
  return [54, 126, 198, 270, 342].map((deg) => {
    const a = (deg * Math.PI) / 180;
    return [Math.cos(a) * TENT.r, Math.sin(a) * TENT.r + TENT.zOff] as [number, number];
  });
}

const playTent: FurnitureDef = {
  id: 'play-tent',
  name: 'אוהל משחק',
  category: 'kids',
  size: { w: 1.22, d: 1.16, h: 1.66 },
  colors: [slot('fabric', 'בד', PAL.cream), slot('accent', 'שטיחון', PAL.dustyBlue)],
  seats: [{ x: 0, z: 0, height: 0.05, facing: 0, kind: 'sit' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const vs = tentVerts();
    const A = new THREE.Vector3(0, TENT.apex, TENT.zOff);
    const V = vs.map(([x, z]) => new THREE.Vector3(x, 0.012, z));
    const pos: number[] = [];
    const uv: number[] = [];
    const tri = (a: THREE.Vector3, b: THREE.Vector3, d: THREE.Vector3) => {
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z, d.x, d.y, d.z);
      for (const q of [a, b, d]) uv.push(Math.atan2(q.z, q.x) / 6.283 + 0.5, q.y / TENT.apex);
    };
    // slightly shortened top so the poles cross above the fabric
    const top = (v: THREE.Vector3) => A.clone().lerp(v, 0.07);
    for (let i = 0; i < 5; i++) {
      const a = V[i];
      const b = V[(i + 1) % 5];
      if (i === 0) {
        // entrance: fabric with an inverted-V opening, flaps pulled aside
        const mid = a.clone().add(b).multiplyScalar(0.5);
        const T = A.clone().lerp(mid, 0.38);
        const a2 = a.clone().lerp(b, 0.1);
        const b2 = a.clone().lerp(b, 0.9);
        tri(top(a), a, a2);
        tri(top(a), a2, T);
        tri(top(a), T, top(b));
        tri(top(b), T, b2);
        tri(top(b), b2, b);
      } else {
        tri(top(a), a, b);
        tri(top(a), b, top(b));
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    k.geo(g, M.cloth(c.fabric));
    // poles
    const wood = M.wood(PAL.birch);
    for (const v of V) {
      const dir = A.clone().sub(v);
      const end = A.clone().addScaledVector(dir, 0.165);
      const foot = v.clone().addScaledVector(dir, -0.006);
      k.rod([foot.x * 1.0, 0.004, foot.z], [end.x, end.y, end.z], 0.014, wood, 0.012, 8);
    }
    // rope binding
    k.cyl(0.035, 0.05, M.fabric('#b9a37e', 30), 0, TENT.apex - 0.02, TENT.zOff, 0.035, 10);
    // floor mat + cushions
    const mat = new THREE.Shape();
    vs.forEach(([x, z], i) => (i === 0 ? mat.moveTo(x * 0.93, -(z - TENT.zOff) * 0.93) : mat.lineTo(x * 0.93, -(z - TENT.zOff) * 0.93)));
    mat.closePath();
    const floor = k.slab(mat, 0.02, M.fabric(c.accent, 10), 0, 0, TENT.zOff);
    floor.castShadow = false;
    k.pillow(0.3, 0.1, 0.3, M.fabric(PAL.mustard, 10), -0.14, 0.02, -0.12).rotation.y = 0.4;
    k.pillow(0.26, 0.09, 0.26, M.fabric(PAL.terracotta, 10), 0.16, 0.02, -0.02).rotation.y = -0.3;
    // little flags above the entrance
    const flagCols = [PAL.terracotta, PAL.mustard, PAL.sage, PAL.dustyBlue, PAL.terracotta];
    const mid = V[0].clone().add(V[1]).multiplyScalar(0.5);
    const T = A.clone().lerp(mid, 0.38);
    flagCols.forEach((col, i) => {
      const t = (i + 0.5) / flagCols.length;
      const fx = (t - 0.5) * 0.36;
      const fg = new THREE.BufferGeometry();
      const fy = T.y + 0.1 + Math.abs(t - 0.5) * 0.05;
      const fz = T.z + 0.012 - 0.035;
      fg.setAttribute('position', new THREE.Float32BufferAttribute([fx - 0.03, fy, fz, fx + 0.03, fy, fz, fx, fy - 0.07, fz + 0.012], 3));
      fg.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2));
      fg.computeVertexNormals();
      k.geo(fg, M.cloth(col));
    });
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const vs = tentVerts();
      D.poly(ctx, vs, true, tint(c.fabric, 0.5));
      for (const [x, z] of vs) D.line(ctx, 0, TENT.zOff, x, z, INK_SOFT, LINE_THIN);
      // entrance
      const [ax, az] = vs[0];
      const [bx, bz] = vs[1];
      D.poly(
        ctx,
        [
          [ax + (bx - ax) * 0.12, az],
          [0, TENT.zOff + 0.18],
          [ax + (bx - ax) * 0.88, bz],
        ],
        true,
        tint(c.accent, 0.4),
        undefined,
        LINE_THIN,
      );
      D.circle(ctx, 0, TENT.zOff, 0.035, '#ffffff', undefined, LINE_THIN);
    }),
};

export const KIDS: FurnitureDef[] = [bunkBed, kidsDesk, kidsChair, toyChest, beanBag, playTent, ...KIDS_TOYS];
