import * as THREE from 'three';
import type { FurnitureDef } from '../types';
import { D, INK_SOFT, Kit, LINE_THIN, M, PAL, ellipseShape, roundedRectPath, roundedRectShape, sym, tint } from '../kit';
import { barHandle, cabinet, mixerTap, slot } from './_parts';

const toilet: FurnitureDef = {
  id: 'toilet',
  name: 'אסלה',
  category: 'bathroom',
  size: { w: 0.4, d: 0.7, h: 0.8 },
  colors: [slot('ceramic', 'חרסינה', '#f7f6f2')],
  seats: [{ x: 0, z: 0.1, height: 0.43, facing: 0, kind: 'sit' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const cer = M.ceramic(c.ceramic);
    const bz = 0.105; // bowl center
    // pedestal + bowl: elongated lathe
    const bowl = k.lathe(
      [
        [0, 0],
        [0.118, 0],
        [0.124, 0.015],
        [0.112, 0.09],
        [0.114, 0.19],
        [0.15, 0.3],
        [0.172, 0.365],
        [0.176, 0.395],
        [0, 0.395],
      ],
      cer,
      0,
      0,
      bz,
      28,
    );
    bowl.scale.set(1, 1, 1.33);
    // neck joining the bowl to the wall / cistern
    k.rbox(0.25, 0.4, 0.3, 0.05, cer, 0, 0, -0.185);
    // seat + lid (closed)
    const plast = M.plastic('#fbfbf9');
    k.slab(ellipseShape(0.184, 0.24), 0.018, plast, 0, 0.396, bz, 0.006, 20);
    k.slab(ellipseShape(0.18, 0.236), 0.02, plast, 0, 0.416, bz, 0.008, 20);
    for (const s of [-1, 1]) k.cyl(0.012, 0.03, M.chrome(), s * 0.075, 0.4, -0.13, 0.012, 10);
    // cistern with lid and dual flush button
    k.rbox(0.38, 0.36, 0.17, 0.03, cer, 0, 0.41, -0.35 + 0.085);
    k.rbox(0.396, 0.032, 0.186, 0.012, cer, 0, 0.768, -0.35 + 0.093, 1);
    k.cyl(0.024, 0.006, M.chrome(), 0, 0.798, -0.26, 0.024, 20);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const f = tint(c.ceramic, 0.6);
      D.rr(ctx, 0, -0.26, 0.39, 0.18, 0.03, f);
      D.ellipse(ctx, 0, 0.105, 0.185, 0.24, f);
      D.ellipse(ctx, 0, 0.12, 0.12, 0.165, null, INK_SOFT, LINE_THIN);
      D.line(ctx, -0.12, -0.13, 0.12, -0.13, INK_SOFT);
    }),
};

const basinVanity: FurnitureDef = {
  id: 'basin-vanity',
  name: 'ארון אמבטיה עם כיור ומראה',
  category: 'bathroom',
  size: { w: 0.8, d: 0.48, h: 1.95 },
  colors: [slot('fronts', 'ארון', PAL.oak), slot('top', 'משטח', PAL.white)],
  actions: [{ kind: 'water', at: { x: 0, y: 0.8 + 0.124, z: -0.185 + 0.13 } }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const w = 0.8;
    const d = 0.48;
    const wood = M.wood(c.fronts);
    cabinet(k, {
      w,
      h: 0.8,
      d,
      body: wood,
      front: wood,
      cols: [[{ kind: 'drawer' }, { kind: 'drawer' }]],
      base: 'legs',
      baseH: 0.22,
      baseMat: M.blackMetal(),
      top: M.stone(c.top, 0.3),
      topT: 0.024,
      handle: 'edge',
    });
    // vessel basin
    const cer = M.ceramic();
    const by = 0.8;
    k.lathe(
      [
        [0, 0],
        [0.1, 0],
        [0.15, 0.03],
        [0.19, 0.1],
        [0.2, 0.13],
        [0.193, 0.134],
        [0.18, 0.1],
        [0.13, 0.035],
        [0.03, 0.022],
        [0, 0.022],
      ],
      cer,
      0.0,
      by,
      0.03,
      32,
    );
    k.cyl(0.018, 0.003, M.chrome(), 0, by + 0.022, 0.03, 0.018, 14);
    mixerTap(k, 0, by, -0.185, 0.2, 0.13);
    // round wall mirror above, flush with the back
    const my = 1.56;
    const mr = 0.36;
    const mz = -d / 2;
    const frame = new THREE.CylinderGeometry(mr + 0.012, mr + 0.012, 0.022, 44);
    frame.rotateX(Math.PI / 2);
    k.geo(frame, M.blackMetal(), 0, my, mz + 0.011);
    k.geo(new THREE.CircleGeometry(mr, 44), M.mirror(), 0, my, mz + 0.0235);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 0.8, 0.48, 0.008, tint(c.top, 0.3));
      D.line(ctx, -0.4, 0.21, 0.4, 0.21, INK_SOFT);
      D.circle(ctx, 0, 0.03, 0.2, '#ffffff');
      D.circle(ctx, 0, 0.03, 0.16, null, INK_SOFT, LINE_THIN);
      D.circle(ctx, 0, 0.03, 0.018, null, INK_SOFT, LINE_THIN);
      D.rr(ctx, 0, -0.14, 0.03, 0.12, 0.012, '#dfe3e6');
      // mirror on the wall
      D.line(ctx, -0.36, -0.228, 0.36, -0.228, '#7fa9c4', 0.024);
    }),
};

const bathtub: FurnitureDef = {
  id: 'bathtub',
  name: 'אמבטיה',
  category: 'bathroom',
  size: { w: 1.7, d: 0.75, h: 0.74 },
  colors: [slot('ceramic', 'אמבט', '#f7f6f2')],
  seats: [{ x: 0.25, z: 0, height: 0.14, facing: -Math.PI / 2, kind: 'sit' }],
  actions: [{ kind: 'water', at: { x: -1.7 / 2 + 0.05 + 0.15, y: 0.56 + 0.075, z: 0 } }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const cer = M.ceramic(c.ceramic);
    const w = 1.7;
    const d = 0.75;
    const h = 0.56;
    const b = 0.012;
    const iw = w - 0.2;
    const id = d - 0.19;
    // shell: outer apron with the basin cut out, softly bevelled rim
    const shell = roundedRectShape(w - 2 * b, d - 2 * b, 0.03);
    shell.holes.push(roundedRectPath(new THREE.Path(), iw + 2 * b, id + 2 * b, 0.21));
    k.slab(shell, h, cer, 0, 0, 0, b, 12);
    // basin floor and a sloped backrest end
    k.slab(roundedRectShape(iw + 0.02, id + 0.02, 0.2), 0.02, cer, 0, 0.1, 0, 0, 12);
    const slope = k.box(0.03, 0.4, id - 0.1, cer, 0, 0, 0);
    slope.rotation.z = -0.45;
    slope.position.set(iw / 2 - 0.1, 0.3, 0);
    // drain, overflow, deck-mounted mixer
    const chrome = M.chrome();
    k.cyl(0.03, 0.004, chrome, -iw / 2 + 0.28, 0.12, 0, 0.03, 16);
    const tap = new Kit();
    mixerTap(tap, 0, 0, 0, 0.13, 0.15);
    tap.g.rotation.y = Math.PI / 2;
    k.sub(tap, -w / 2 + 0.05, h, 0);
    for (const s of [-1, 1]) {
      k.cyl(0.016, 0.03, chrome, -w / 2 + 0.05, h, s * 0.11, 0.014, 12);
      k.box(0.05, 0.008, 0.012, chrome, -w / 2 + 0.05, h + 0.03, s * 0.11);
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const f = tint(c.ceramic, 0.6);
      D.rr(ctx, 0, 0, 1.7, 0.75, 0.03, f);
      D.rr(ctx, 0, 0, 1.5, 0.56, 0.21, '#ffffff', undefined, LINE_THIN);
      D.rr(ctx, 0.01, 0, 1.36, 0.42, 0.17, null, INK_SOFT, 0.007);
      D.circle(ctx, -0.47, 0, 0.03, null, INK_SOFT, LINE_THIN);
      D.rr(ctx, -0.74, 0, 0.14, 0.03, 0.012, '#dfe3e6', undefined, LINE_THIN);
      D.circle(ctx, -0.8, 0.11, 0.016, '#dfe3e6', undefined, LINE_THIN);
      D.circle(ctx, -0.8, -0.11, 0.016, '#dfe3e6', undefined, LINE_THIN);
    }),
};

const shower: FurnitureDef = {
  id: 'shower',
  name: 'מקלחון',
  category: 'bathroom',
  size: { w: 0.9, d: 0.9, h: 2.05 },
  colors: [slot('tray', 'אגנית', '#f4f3ef'), slot('metal', 'פרזול', '#d9dcdf')],
  actions: [{ kind: 'water', at: { x: -0.1, y: 1.98, z: -0.9 / 2 + 0.03 + 0.3 } }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const s = 0.9;
    const tray = M.ceramic(c.tray);
    const metal = M.metal(c.metal, 0.2, 1);
    const glass = M.glass('#d8eef2', 0.2);
    // tray: raised rim + lower floor
    const rim = roundedRectShape(s, s, 0.02);
    rim.holes.push(roundedRectPath(new THREE.Path(), s - 0.12, s - 0.12, 0.05));
    k.slab(rim, 0.05, tray, 0, 0, 0);
    k.box(s - 0.1, 0.03, s - 0.1, tray, 0, 0, 0);
    k.cyl(0.04, 0.004, metal, 0, 0.03, 0, 0.04, 20);
    // glass: fixed side panel (+X) and hinged door (+Z); the other two sides are room walls
    const gh = 1.95;
    const gy = 0.05;
    const e = s / 2 - 0.036;
    k.box(0.008, gh, s - 0.05, glass, e, gy, -0.012);
    k.box(s - 0.05, gh, 0.008, glass, -0.012, gy, e);
    // profiles: corner post, wall channels, top rails
    const p = 0.018;
    k.box(p, gh, p, metal, e, gy, e);
    k.box(p, gh, p, metal, e, gy, -s / 2 + p / 2);
    k.box(p, gh, p, metal, -s / 2 + p / 2, gy, e);
    k.box(p, p, s - 0.04, metal, e, gy + gh - p, -0.016);
    k.box(s - 0.04, p, p, metal, -0.016, gy + gh - p, e);
    k.box(0.012, 0.012, s - 0.05, metal, e, gy, -0.012);
    k.box(s - 0.05, 0.012, 0.012, metal, -0.012, gy, e);
    // door handle
    barHandle(k, [0.26, 0.95, e + 0.022], [0.26, 1.2, e + 0.022], e + 0.004, metal, 0.008);
    // shower column on the back wall: riser, rain head, mixer
    const bz = -s / 2 + 0.03;
    k.rod([-0.1, 0.95, bz], [-0.1, 2.02, bz], 0.011, metal);
    k.rod([-0.1, 2.02, bz], [-0.1, 2.02, bz + 0.3], 0.011, metal);
    k.cyl(0.11, 0.012, metal, -0.1, 1.99, bz + 0.3, 0.11, 24);
    k.rbox(0.2, 0.05, 0.05, 0.02, metal, -0.1, 0.95, bz);
    for (const sx of [-1, 1]) {
      const kn = k.cyl(0.022, 0.03, metal, 0, 0, 0, 0.022, 14);
      kn.rotation.z = Math.PI / 2;
      kn.position.set(-0.1 + sx * 0.115, 0.975, bz);
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 0.9, 0.9, 0.02, tint(c.tray, 0.6));
      D.rr(ctx, 0, 0, 0.78, 0.78, 0.05, null, INK_SOFT, LINE_THIN);
      D.line(ctx, -0.39, -0.39, 0.39, 0.39, INK_SOFT, 0.007);
      D.line(ctx, -0.39, 0.39, 0.39, -0.39, INK_SOFT, 0.007);
      D.circle(ctx, 0, 0, 0.04, '#ffffff', undefined, LINE_THIN);
      // glass sides
      D.line(ctx, 0.414, -0.44, 0.414, 0.414, '#7fa9c4', 0.024);
      D.line(ctx, -0.44, 0.414, 0.414, 0.414, '#7fa9c4', 0.024);
      // shower head
      D.circle(ctx, -0.1, -0.12, 0.11, null, INK_SOFT, LINE_THIN);
    }),
};

const washer: FurnitureDef = {
  id: 'washing-machine',
  name: 'מכונת כביסה',
  category: 'bathroom',
  size: { w: 0.6, d: 0.6, h: 0.85 },
  colors: [slot('body', 'גוף', '#f2f2f0')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const body = M.paint(c.body, 0.35);
    const w = 0.6;
    const d = 0.6;
    const fz = d / 2 - 0.03;
    k.rbox(w, 0.83, d - 0.03, 0.018, body, 0, 0.02, -0.015);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl(0.022, 0.022, M.rubber(), sx * 0.24, 0, sz * 0.22 - 0.01, 0.022, 10);
    // control strip
    k.rbox(w - 0.03, 0.1, 0.006, 0.003, M.paint('#e4e5e6', 0.3), 0, 0.725, fz + 0.001, 1);
    k.rbox(0.16, 0.07, 0.008, 0.004, body, -0.2, 0.74, fz + 0.002, 1);
    const dial = k.cyl(0.03, 0.02, M.steel(), 0, 0, 0, 0.027, 20);
    dial.rotation.x = Math.PI / 2;
    dial.position.set(0.02, 0.775, fz + 0.012);
    k.box(0.11, 0.04, 0.003, M.screen(), 0.19, 0.755, fz + 0.004);
    // porthole door
    const cy = 0.4;
    const ring = new THREE.TorusGeometry(0.175, 0.03, 10, 36);
    ring.scale(1, 1, 0.55);
    k.geo(ring, M.steel(), 0, cy, fz + 0.004);
    const glassG = new THREE.SphereGeometry(0.155, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    glassG.rotateX(Math.PI / 2);
    glassG.scale(1, 1, 0.14);
    k.geo(glassG, M.screen('#1a2026'), 0, cy, fz + 0.004);
    k.rbox(0.018, 0.09, 0.018, 0.006, M.steel(), 0.215, cy - 0.045, fz + 0.012, 1);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 0.6, 0.6, 0.02, tint(c.body, 0.5));
      D.circle(ctx, 0, 0.0, 0.2, '#ffffff', undefined, LINE_THIN);
      D.circle(ctx, 0, 0.0, 0.14, null, INK_SOFT, LINE_THIN);
      D.line(ctx, -0.3, 0.25, 0.3, 0.25, INK_SOFT);
    }),
};

export const BATHROOM: FurnitureDef[] = [toilet, basinVanity, bathtub, shower, washer];
