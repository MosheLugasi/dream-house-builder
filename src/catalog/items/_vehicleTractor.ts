/** Farm tractor: open driver's station under a sun canopy, big lugged rear wheels. */
import * as THREE from 'three';
import type { FurnitureDef, WheelPart } from '../types';
import { D, INK, INK_SOFT, Kit, LINE_THIN, M, darken, mesh, roundedBoxGeo, roundedRectShape, sym, tint } from '../kit';
import { slot } from './_parts';
import { VM, arcBandGeo, cylX, latheX, lens, memo, merge, mountWheel, staticPart, steeringWheel } from './_vehicleParts';

type Colors = Record<string, string>;

const T = {
  zr: -0.85,
  zf: 1.03,
  rearR: 0.68,
  rearW: 0.4,
  rearX: 0.68,
  frontR: 0.38,
  frontW: 0.23,
  frontX: 0.62,
  seatY: 1.08,
  hipZ: -0.72,
  floor: 0.7,
};

function rearWheelGeos(): { tire: THREE.BufferGeometry; rim: THREE.BufferGeometry } {
  return memo('tractorRear', () => {
    const R = T.rearR;
    const hw = T.rearW / 2;
    const rimR = 0.37;
    const Rb = R - 0.036;
    const parts: THREE.BufferGeometry[] = [
      latheX(
        [
          [rimR, -hw * 0.72],
          [rimR + 0.03, -hw * 0.95],
          [(rimR + Rb) / 2 + 0.02, -hw],
          [Rb - 0.05, -hw * 0.94],
          [Rb, -hw * 0.7],
          [Rb, hw * 0.7],
          [Rb - 0.05, hw * 0.94],
          [(rimR + Rb) / 2 + 0.02, hw],
          [rimR + 0.03, hw * 0.95],
          [rimR, hw * 0.72],
        ],
        28,
      ),
    ];
    // chevron lugs, alternating left / right
    const n = 22;
    for (let i = 0; i < n * 2; i++) {
      const s = i % 2 ? 1 : -1;
      const lug = new THREE.BoxGeometry(hw * 1.08, 0.034, 0.055);
      lug.rotateY(s * 0.5);
      lug.translate(s * hw * 0.46, Rb + 0.015, 0);
      lug.rotateX((i / (n * 2)) * Math.PI * 2);
      parts.push(lug);
    }
    const inner = new THREE.CircleGeometry(rimR + 0.01, 24);
    inner.rotateY(-Math.PI / 2);
    inner.translate(-hw * 0.7, 0, 0);
    parts.push(inner);
    const rim: THREE.BufferGeometry[] = [
      latheX(
        [
          [rimR + 0.012, hw * 0.76],
          [rimR - 0.012, hw * 0.72],
          [rimR - 0.04, hw * 0.3],
          [rimR * 0.62, hw * 0.12],
          [rimR * 0.4, hw * 0.34],
          [rimR * 0.3, hw * 0.4],
          [0, hw * 0.4],
        ],
        28,
      ),
    ];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const nut = cylX(0.018, 0.03, 6);
      nut.translate(hw * 0.38, Math.cos(a) * rimR * 0.36, Math.sin(a) * rimR * 0.36);
      rim.push(nut);
    }
    return { tire: merge(parts), rim: merge(rim) };
  });
}

function frontWheelGeos(): { tire: THREE.BufferGeometry; rim: THREE.BufferGeometry } {
  return memo('tractorFront', () => {
    const R = T.frontR;
    const hw = T.frontW / 2;
    const rimR = 0.2;
    const prof: Array<[number, number]> = [
      [rimR, -hw * 0.75],
      [rimR + 0.02, -hw * 0.96],
      [(rimR + R) / 2, -hw],
      [R - 0.04, -hw * 0.92],
      [R - 0.012, -hw * 0.66],
    ];
    // raised centre rib for steering grip
    prof.push([R - 0.014, -0.3 * hw], [R, -0.2 * hw], [R, 0.2 * hw], [R - 0.014, 0.3 * hw]);
    prof.push([R - 0.012, hw * 0.66], [R - 0.04, hw * 0.92], [(rimR + R) / 2, hw], [rimR + 0.02, hw * 0.96], [rimR, hw * 0.75]);
    const inner = new THREE.CircleGeometry(rimR + 0.01, 20);
    inner.rotateY(-Math.PI / 2);
    inner.translate(-hw * 0.7, 0, 0);
    const rim: THREE.BufferGeometry[] = [
      latheX(
        [
          [rimR + 0.01, hw * 0.8],
          [rimR - 0.01, hw * 0.74],
          [rimR - 0.03, hw * 0.3],
          [rimR * 0.5, hw * 0.24],
          [rimR * 0.36, hw * 0.5],
          [0, hw * 0.5],
        ],
        24,
      ),
    ];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const nut = cylX(0.013, 0.024, 6);
      nut.translate(hw * 0.48, Math.cos(a) * rimR * 0.3, Math.sin(a) * rimR * 0.3);
      rim.push(nut);
    }
    return { tire: merge([latheX(prof, 24), inner]), rim: merge(rim) };
  });
}

function tractorWheel(front: boolean, side: 1 | -1, rimMat: THREE.Material): THREE.Group {
  const g = front ? frontWheelGeos() : rearWheelGeos();
  const spin = new THREE.Group();
  const t = mesh(g.tire, VM.tire());
  const r = mesh(g.rim, rimMat);
  if (side < 0) {
    t.rotation.y = Math.PI;
    r.rotation.y = Math.PI;
  }
  spin.add(t, r);
  return spin;
}

/** Hood: rounded box that narrows and slopes down towards the nose. */
function hoodGeo(): THREE.BufferGeometry {
  return memo('tractorHood', () => {
    const len = 1.42;
    const g = roundedBoxGeo(0.66, 0.6, len, 0.09, 3);
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const t = p.getZ(i) / len + 0.5; // 0 at the dash, 1 at the nose
      p.setX(i, p.getX(i) * (1 - 0.14 * t));
      if (p.getY(i) > 0) p.setY(i, p.getY(i) - 0.16 * t * t);
    }
    g.computeVertexNormals();
    return g;
  });
}

function tractorStatic(c: Colors): THREE.Object3D {
  const k = new Kit();
  const paint = VM.enamel(c.body);
  const iron = M.metal('#4b4e53', 0.6, 0.6);
  const black = VM.trim();
  const steel = M.steel();
  const { zr, zf, seatY, hipZ, floor } = T;

  // drive train: rear axle, gearbox, engine, front axle on a pivot
  k.geo(cylX(0.12, 1.0, 14), iron, 0, T.rearR, zr);
  k.rbox(0.46, 0.5, 0.95, 0.05, iron, 0, 0.45, -0.62, 1);
  k.rbox(0.42, 0.46, 1.0, 0.04, iron, 0, 0.5, 0.36, 1);
  k.rbox(0.3, 0.3, 0.4, 0.04, iron, 0, 0.42, zf - 0.06, 1);
  k.rbox(1.06, 0.09, 0.11, 0.03, iron, 0, T.frontR - 0.045, zf, 1);
  for (const s of [1, -1]) k.geo(cylX(0.05, 0.1, 10), iron, s * 0.5, T.frontR, zf);

  // hood, grille, lamps, nose weights
  k.geo(hoodGeo(), paint, 0, 1.2, 0.74);
  k.rbox(0.44, 0.36, 0.03, 0.03, black, 0, 0.96, 1.44, 1);
  for (let i = 0; i < 5; i++) k.box(0.38, 0.012, 0.012, steel, 0, 1.0 + i * 0.065, 1.456);
  for (const s of [1, -1]) lens(k, VM.lamp(), s * 0.2, 1.36, 1.425, 0.11, 0.09, 0.03, 'front', s * 0.15);
  k.rbox(0.5, 0.3, 0.16, 0.03, iron, 0, 0.52, 1.47, 1);
  for (const x of [-0.2, -0.1, 0, 0.1, 0.2]) k.box(0.012, 0.3, 0.165, black, x, 0.52, 1.47);
  // side panels: a stripe along the hood and the engine bay vents
  for (const s of [1, -1]) {
    k.box(0.012, 0.05, 1.0, M.paint(c.rims, 0.4), s * 0.305, 1.24, 0.6).rotation.y = -s * 0.068;
    k.box(0.012, 0.2, 0.5, black, s * 0.213, 0.62, 0.4);
  }
  // exhaust stack with muffler and rain flap
  k.rod([-0.19, 1.4, 0.5], [-0.19, 1.62, 0.5], 0.03, iron, 0.03, 10);
  k.rod([-0.19, 1.6, 0.5], [-0.19, 1.9, 0.5], 0.05, iron, 0.05, 12);
  k.rod([-0.19, 1.9, 0.5], [-0.19, 2.12, 0.5], 0.026, steel, 0.026, 10);
  k.rod([-0.19, 2.12, 0.5], [-0.19, 2.17, 0.46], 0.026, steel, 0.03, 10);
  // air intake pre-cleaner on the other side
  k.rod([0.19, 1.42, 0.3], [0.19, 1.62, 0.3], 0.025, black, 0.025, 8);
  k.cyl(0.055, 0.07, black, 0.19, 1.62, 0.3, 0.045, 12);

  // dash, steering wheel
  k.rbox(0.58, 0.56, 0.22, 0.05, black, 0, 0.95, 0.0, 1);
  const dashTop = k.rbox(0.5, 0.05, 0.2, 0.02, M.plastic('#33363b'), 0, 1.5, -0.03, 1);
  dashTop.rotation.x = 0.5;
  steeringWheel(k, 0, hipZ, seatY, 0.8, 0.19, 0.3, 0.44, 0.47);

  // platform, steps, seat on a suspension pedestal
  k.rbox(0.9, 0.04, 0.62, 0.015, black, 0, floor - 0.04, -0.4, 1);
  for (const s of [1, -1]) k.rbox(0.2, 0.03, 0.3, 0.01, black, s * 0.36, 0.42, -0.34, 1);
  for (const s of [1, -1]) k.rod([s * 0.4, 0.44, -0.26], [s * 0.4, floor - 0.03, -0.3], 0.012, iron, 0.012, 6);
  k.rbox(0.3, 0.1, 0.3, 0.03, black, 0, 0.94, hipZ + 0.02, 1);
  const seatMat = M.leather(c.seat);
  k.rbox(0.46, 0.09, 0.44, 0.04, seatMat, 0, seatY - 0.09, hipZ + 0.06, 2);
  const back = k.rbox(0.46, 0.4, 0.09, 0.04, seatMat, 0, seatY - 0.03, hipZ - 0.2, 2);
  back.rotation.x = -0.12;
  for (const s of [1, -1]) k.rbox(0.05, 0.03, 0.26, 0.012, black, s * 0.27, seatY + 0.17, hipZ - 0.02, 1);

  // rear fenders with inner side plates and tail lamps
  const fender = memo('tractorFender', () => arcBandGeo(T.rearR + 0.035, T.rearR + 0.055, 0.2, 2.5, 0.48, 20));
  for (const s of [1, -1]) {
    k.geo(fender, paint, s * (T.rearX + 0.0), T.rearR, zr);
    k.rbox(0.03, 0.5, 0.95, 0.012, paint, s * 0.455, floor, zr + 0.08, 1);
    k.rbox(0.09, 0.07, 0.03, 0.012, VM.tail(), s * 0.6, 1.08, zr - 0.62, 1).rotation.x = -0.75;
    lens(k, VM.amber(), s * 0.74, 1.3, zr + 0.44, 0.07, 0.07, 0.025, 'front');
  }

  // roll-over bar carrying the sun canopy, with an orange beacon
  for (const s of [1, -1]) {
    k.beam([s * 0.44, 0.9, -1.12], [s * 0.44, 2.24, -1.02], 0.06, 0.07, black, 0.012);
    k.rod([s * 0.44, 2.24, -1.02], [s * 0.44, 2.24, -0.25], 0.018, black, 0.018, 6);
  }
  k.beam([-0.47, 2.2, -1.022], [0.47, 2.2, -1.022], 0.07, 0.06, black, 0.012).rotation.set(0, 0, -Math.PI / 2);
  k.slab(roundedRectShape(1.26, 1.24, 0.12), 0.05, paint, 0, 2.255, -0.6, 0.014, 6);
  k.slab(roundedRectShape(1.18, 1.16, 0.1), 0.012, M.plastic('#ededea'), 0, 2.246, -0.6, 0, 6);
  k.cyl(0.05, 0.02, black, 0.34, 2.305, -1.0, 0.05, 12);
  k.cyl(0.042, 0.07, VM.amber(), 0.34, 2.32, -1.0, 0.036, 12);

  // three-point hitch and draw bar
  for (const s of [1, -1]) k.rod([s * 0.22, 0.6, zr - 0.1], [s * 0.3, 0.42, zr - 0.66], 0.022, iron, 0.022, 8);
  k.rod([0, 0.95, zr - 0.2], [0, 0.6, zr - 0.6], 0.02, iron, 0.02, 8);
  k.rbox(0.1, 0.035, 0.5, 0.01, iron, 0, 0.36, zr - 0.42, 1);
  return k.g;
}

function buildTractor(c: Colors): THREE.Group {
  const root = new THREE.Group();
  root.name = 'tractor';
  root.add(staticPart(`tractor|${Object.values(c).join(',')}`, () => tractorStatic(c)));
  const rim = VM.enamel(c.rims);
  const wheels: WheelPart[] = [];
  for (const s of [1, -1] as const) wheels.push(mountWheel(root, tractorWheel(true, s, rim), T.frontR, s * T.frontX, T.zf, true));
  for (const s of [1, -1] as const) wheels.push(mountWheel(root, tractorWheel(false, s, rim), T.rearR, s * T.rearX, T.zr, false));
  root.userData.wheels = wheels;
  return root;
}

export const tractor: FurnitureDef = {
  id: 'tractor',
  name: 'טרקטור',
  category: 'vehicle',
  size: { w: 1.86, d: 3.12, h: 2.4 },
  colors: [slot('body', 'צבע הטרקטור', '#3a8f3a'), slot('rims', 'חישוקים', '#f2c230'), slot('seat', 'מושב', '#2b2c30')],
  noBake: true,
  vehicle: {
    kind: 'other',
    maxSpeed: 7,
    acceleration: 2,
    wheelbase: T.zf - T.zr,
    maxSteer: 0.55,
    radius: 1.1,
    rider: { x: 0, y: T.seatY, z: T.hipZ, pose: 'sit' },
    cameraDistance: 7.5,
    prompt: 'לנהוג בטרקטור',
  },
  build: ({ colors: c }) => buildTractor(c),
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const f = tint(c.body, 0.3);
      // wheels
      for (const s of [1, -1]) {
        D.rr(ctx, s * T.rearX, T.zr, T.rearW, T.rearR * 2, 0.06, '#4a4d52', INK, LINE_THIN);
        for (let i = -4; i <= 4; i++) D.line(ctx, s * (T.rearX - 0.16), T.zr + i * 0.14, s * (T.rearX + 0.16), T.zr + i * 0.14 + s * 0.06, '#2b2d31', 0.012);
        D.rr(ctx, s * T.frontX, T.zf, T.frontW, T.frontR * 2, 0.05, '#4a4d52', INK, LINE_THIN);
        D.rr(ctx, s * 0.62, T.zr + 0.1, 0.36, 0.9, 0.05, f, INK, LINE_THIN);
      }
      D.line(ctx, -0.5, T.zf, 0.5, T.zf, INK, 0.05);
      // hood, platform, seat, steering wheel
      D.poly(
        ctx,
        [
          [-0.33, 0.03],
          [0.33, 0.03],
          [0.28, 1.45],
          [-0.28, 1.45],
        ],
        true,
        f,
      );
      D.rr(ctx, 0, 1.5, 0.5, 0.14, 0.03, '#8b8e93', INK, LINE_THIN);
      D.circle(ctx, -0.19, 0.5, 0.05, '#55585d', INK, LINE_THIN);
      D.rr(ctx, 0, -0.4, 0.9, 0.62, 0.03, '#8b8e93', INK, LINE_THIN);
      D.rr(ctx, 0, T.hipZ - 0.02, 0.46, 0.5, 0.08, tint(c.seat, 0.3), INK, LINE_THIN);
      D.circle(ctx, 0, T.hipZ + 0.44, 0.19, null, INK, 0.025);
      // canopy outline
      ctx.setLineDash([0.08, 0.06]);
      D.rr(ctx, 0, -0.6, 1.26, 1.24, 0.12, darken(f, 0.02) + '55', INK_SOFT, LINE_THIN);
      ctx.setLineDash([]);
    }),
};
