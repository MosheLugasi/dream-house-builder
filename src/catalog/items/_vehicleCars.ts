/**
 * Cars and the minibus. Photographic glTF models (`_vehicleModels.ts`); the procedural lofted shells
 * with a furnished cabin below are their stand-ins while the model loads and in Node.
 */
import * as THREE from 'three';
import type { FurnitureDef } from '../types';
import { D, INK_SOFT, Kit, LINE_THIN, M, lighten, mesh, sym, tint, type Ctx2D } from '../kit';
import { slot } from './_parts';
import { loftBody, zAtValue, type BodyGeo, type BodySpec } from './_vehicleBody';
import { VM, carSeat, lens, memo, merge, plate, steeringWheel, type WheelSpec } from './_vehicleParts';
import { frontCabin, modelCar, preloadCarModels, rearBench, seatFabric, type CarModel } from './_vehicleModels';

type Colors = Record<string, string>;

/* ================================================================== shared assembly */

/** Add the lofted shell (paint / glass / plastic / lining / lamps) to a kit. */
function addShell(k: Kit, body: BodyGeo, paint: THREE.Material, stripe?: THREE.Material, linerMat: THREE.Material = VM.liner()): void {
  k.geo(body.paint, paint);
  k.geo(body.glass, VM.glass());
  k.geo(body.dark, VM.trim());
  k.geo(body.liner, linerMat);
  if (body.stripe) k.geo(body.stripe, stripe ?? VM.trim());
  if (body.lampF) k.geo(body.lampF, VM.lamp());
  if (body.lampR) k.geo(body.lampR, VM.tail());
  if (body.amber) k.geo(body.amber, VM.amber());
}

/** Wing mirror on the +X / -X side: housing on a short foot, mirror glass facing backwards. */
function wingMirror(k: Kit, s: number, x: number, y: number, z: number, mat: THREE.Material, scale = 1, arm = 0.02): void {
  const w = 0.17 * scale;
  const h = 0.105 * scale;
  const cx = x + arm + w / 2;
  k.rbox(w, h, 0.07 * scale, 0.03 * scale, mat, s * cx, y, z, 1);
  k.box(arm + 0.05, 0.03, 0.045, VM.trim(), s * (x + arm / 2), y + 0.012, z);
  const g = mesh(new THREE.PlaneGeometry(w * 0.82, h * 0.74), M.chrome());
  g.position.set(s * cx, y + h / 2, z - 0.036 * scale);
  g.rotation.y = Math.PI;
  g.castShadow = false;
  k.g.add(g);
}

interface PlanOpts {
  cowl: number;
  roofF: number;
  roofR: number;
  tail: number;
  zf: number;
  zr: number;
  wheelR: number;
  rf?: number;
  rr?: number;
}

/** Top-down car symbol: wheels, body outline, glazed cabin with roof, hood line, mirrors, lamps. */
function carPlan(ctx: Ctx2D, color: string, w: number, d: number, o: PlanOpts): void {
  const hd = d / 2;
  const f = tint(color, 0.3);
  const bw = w / 2 - 0.04;
  for (const z of [o.zf, o.zr]) for (const s of [1, -1]) D.rr(ctx, s * (bw - 0.02), z, 0.14, o.wheelR * 2, 0.04, '#3b3d42', null);
  const rf = o.rf ?? 0.3;
  const rr = o.rr ?? 0.22;
  ctx.beginPath();
  ctx.moveTo(-bw + rr, -hd);
  ctx.lineTo(bw - rr, -hd);
  ctx.quadraticCurveTo(bw, -hd, bw, -hd + rr);
  ctx.lineTo(bw, hd - rf);
  ctx.quadraticCurveTo(bw, hd, bw - rf, hd);
  ctx.lineTo(-bw + rf, hd);
  ctx.quadraticCurveTo(-bw, hd, -bw, hd - rf);
  ctx.lineTo(-bw, -hd + rr);
  ctx.quadraticCurveTo(-bw, -hd, -bw + rr, -hd);
  ctx.closePath();
  ctx.fillStyle = f;
  ctx.fill();
  ctx.stroke();
  const gw = bw - 0.07;
  D.poly(
    ctx,
    [
      [-gw, o.cowl],
      [gw, o.cowl],
      [gw - 0.02, o.tail],
      [-gw + 0.02, o.tail],
    ],
    true,
    '#cfe3ea',
    INK_SOFT,
    LINE_THIN,
  );
  D.rr(ctx, 0, (o.roofF + o.roofR) / 2, (gw - 0.1) * 2, o.roofF - o.roofR, 0.08, lighten(color, 0.42), INK_SOFT, LINE_THIN);
  D.line(ctx, -gw + 0.08, o.cowl + 0.06, gw - 0.08, o.cowl + 0.06, INK_SOFT, LINE_THIN);
  for (const s of [1, -1]) {
    D.line(ctx, s * gw, o.cowl, s * (gw - 0.1), o.roofF, INK_SOFT, LINE_THIN);
    D.line(ctx, s * (gw - 0.02), o.tail, s * (gw - 0.1), o.roofR, INK_SOFT, LINE_THIN);
    D.rr(ctx, s * (bw + 0.005), o.cowl - 0.14, 0.07, 0.12, 0.02, f, undefined, LINE_THIN);
    D.rr(ctx, s * (bw - 0.22), hd - 0.035, 0.24, 0.045, 0.015, '#fff6cf', INK_SOFT, LINE_THIN);
    D.rr(ctx, s * (bw - 0.19), -hd + 0.03, 0.2, 0.04, 0.012, '#e0564f', INK_SOFT, LINE_THIN);
  }
}

/* ================================================================== compact city car */

const COMPACT_WHEEL: WheelSpec = { r: 0.29, w: 0.185, rimR: 0.19, style: 'alloy5' };
const COMPACT = { zf: 1.13, zr: -1.22, wx: 0.7, seatY: 0.54, hipX: 0.36, hipZ: 0.05 };

const compactSpec: BodySpec = {
  halfW: 0.825,
  zRear: -1.85,
  zFront: 1.85,
  width: [
    [-1.85, 0.95],
    [-1.0, 1],
    [0.5, 1],
    [1.85, 0.94],
  ],
  front: { rz: 0.34, rx: 0.26 },
  rear: { rz: 0.24, rx: 0.2 },
  under: [
    [-1.85, 0.3],
    [-1.62, 0.15],
    [1.5, 0.15],
    [1.85, 0.26],
  ],
  belt: [
    [-1.85, 0.6],
    [-1.83, 0.86],
    [-1.76, 0.93],
    [-1.2, 0.945],
    [0.0, 0.91],
    [0.98, 0.885],
    [1.5, 0.8],
    [1.75, 0.72],
    [1.85, 0.58],
  ],
  top: [
    [-1.85, 0.62],
    [-1.83, 0.9],
    [-1.76, 1.0],
    [-1.4, 1.45],
    [-0.6, 1.5],
    [0.26, 1.46],
    [0.98, 0.94],
    [1.5, 0.85],
    [1.75, 0.76],
    [1.85, 0.6],
  ],
  tumble: 0.3,
  railR: 0.06,
  crown: 0.03,
  wells: [
    { z: COMPACT.zf, r: 0.345, yc: 0.29 },
    { z: COMPACT.zr, r: 0.345, yc: 0.29 },
  ],
  wellDepth: 0.3,
  glassSide: [
    [0.9, -0.02],
    [-0.1, -1.0],
    [-1.1, -1.4],
  ],
  glassTop: [
    [0.95, 0.31],
    [-1.43, -1.73],
  ],
  lamps: [
    { mat: 'lampF', rows: [4, 5], z: [1.58, 1.85] },
    { mat: 'amber', rows: [4, 5], z: [1.5, 1.58] },
    { mat: 'lampR', rows: [3, 5], z: [-1.83, -1.66] },
  ],
  liner: [-1.8, 1.0],
};

function compactStatic(c: Colors): THREE.Object3D {
  const body = memo('body|compact', () => loftBody(compactSpec));
  const k = new Kit();
  const paint = VM.paint(c.body);
  addShell(k, body, paint);
  const trim = VM.trim();
  const cabin = VM.cabin();
  const seatMat = M.fabric(c.seats, 16);
  const { seatY, hipX, hipZ } = COMPACT;

  // shut lines, handles, mirrors
  k.geo(merge([body.seam(0.76, [1, -1]), body.seam(-0.06, [1, -1], -1, true), body.seam(-0.93, [1, -1])]), trim).castShadow = false;
  for (const s of [1, -1]) {
    for (const z of [0.06, -0.8]) k.rbox(0.022, 0.028, 0.13, 0.01, paint, s * (body.sideX(z, 0.82) + 0.004), 0.806, z, 1);
    wingMirror(k, s, body.sideX(0.78, 0.94) - 0.02, 0.9, 0.8, paint);
  }

  // cabin: front seats, dashboard, firewall, centre console, rear bench, parcel shelf
  carSeat(k, hipX, hipZ, seatY, seatMat, 0.46, 0.17);
  carSeat(k, -hipX, hipZ, seatY, seatMat, 0.46, 0.17);
  steeringWheel(k, hipX, hipZ, seatY);
  k.rbox(1.46, 0.17, 0.36, 0.05, cabin, 0, 0.745, 0.82, 1);
  k.box(1.46, 0.58, 0.04, cabin, 0, 0.18, 0.74);
  k.rbox(0.2, 0.3, 0.5, 0.04, cabin, 0, 0.19, 0.3, 1);
  k.rbox(1.3, 0.13, 0.5, 0.04, seatMat, 0, seatY - 0.13, -0.66, 1);
  k.box(1.3, seatY - 0.13 - 0.19, 0.4, cabin, 0, 0.19, -0.68);
  const rb = k.rbox(1.3, 0.56, 0.1, 0.04, seatMat, 0, seatY - 0.04, -0.94, 1);
  rb.rotation.x = -0.14;
  k.box(1.3, 0.02, 0.72, cabin, 0, 0.87, -1.37);

  // face and tail
  const zf = compactSpec.zFront;
  const zr = compactSpec.zRear;
  k.rbox(0.94, 0.11, 0.03, 0.012, trim, 0, 0.275, zf - 0.013, 1);
  k.rbox(0.56, 0.028, 0.02, 0.008, trim, 0, 0.545, zf - 0.008, 1);
  plate(k, '63-482-07', 0.465, zf - 0.005, 'front');
  for (const s of [1, -1]) {
    lens(k, VM.lamp(), s * 0.5, 0.33, zf - 0.02, 0.1, 0.07, 0.022, 'front', s * 0.2);
    k.rbox(0.16, 0.035, 0.02, 0.008, VM.tail(), s * 0.52, 0.37, zr + 0.008, 1);
  }
  k.rbox(1.0, 0.07, 0.03, 0.012, trim, 0, 0.305, zr + 0.013, 1);
  plate(k, '63-482-07', 0.5, zr + 0.005, 'rear');
  k.rbox(0.3, 0.025, 0.02, 0.008, M.chrome(), 0, 0.72, zr + 0.014, 1);
  // wipers, aerial
  k.rod([0.3, 1.04, -1.725], [0.02, 1.02, -1.745], 0.006, trim, 0.006, 5);
  for (const x of [0.3, -0.25]) k.rod([x - 0.2, 0.975, 0.955], [x + 0.2, 0.965, 0.975], 0.007, trim, 0.007, 6);
  k.rod([0, 1.48, -1.1], [0, 1.66, -1.3], 0.004, trim, 0.003, 5);
  return k.g;
}

/** Photographic five-door compact hatchback (see public/assets/CREDITS.md). */
const HATCH_SEAT = { hipX: 0.36, hipZ: -0.1, seatY: 0.47 };
const HATCH: CarModel = {
  file: 'hatch',
  wheelX: 0.729,
  zf: 1.169,
  zr: -1.259,
  radius: 0.297,
  plates: { front: [0.613, 1.999], rear: [0.477, -1.887], w: 0.4, h: 0.088, text: '63-482-07' },
  interior: (k, c) => {
    const seat = seatFabric(c);
    frontCabin(k, seat, { ...HATCH_SEAT, floor: 0.22, floorZ: [-1.62, 0.62], width: 1.42 });
    rearBench(k, seat, 1.3, -0.92, 0.47, 0.22);
  },
};

export const carCompact: FurnitureDef = {
  id: 'car-compact',
  name: 'מכונית קטנה',
  category: 'vehicle',
  size: { w: 1.99, d: 4.01, h: 1.5 },
  resize: false,
  colors: [slot('body', 'צבע הרכב', '#c8322c'), slot('seats', 'ריפוד', '#4a4d55')],
  noBake: true,
  vehicle: {
    kind: 'car',
    maxSpeed: 14,
    acceleration: 3,
    wheelbase: HATCH.zf - HATCH.zr,
    maxSteer: 0.5,
    radius: 1.05,
    rider: { x: HATCH_SEAT.hipX, y: HATCH_SEAT.seatY, z: HATCH_SEAT.hipZ, pose: 'sit' },
    cameraDistance: 7,
    prompt: 'לנהוג במכונית',
  },
  build: ({ colors: c }) =>
    modelCar('car-compact', c, HATCH, { key: 'car-compact', statics: () => compactStatic(c), wheel: COMPACT_WHEEL, rimMat: VM.alloy() }, carCompact.size),
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      carPlan(ctx, c.body, 1.84, 4.01, { cowl: 0.92, roofF: 0.4, roofR: -1.45, tail: -1.69, zf: HATCH.zf, zr: HATCH.zr, wheelR: HATCH.radius, rf: 0.36, rr: 0.22 });
    }),
};

/* ================================================================== family crossover */

const FAMILY_WHEEL: WheelSpec = { r: 0.34, w: 0.215, rimR: 0.225, style: 'alloy10' };
const FAMILY = { zf: 1.3, zr: -1.35, wx: 0.76, seatY: 0.62, hipX: 0.39, hipZ: 0.12 };

const familySpec: BodySpec = {
  halfW: 0.9,
  zRear: -2.15,
  zFront: 2.15,
  width: [
    [-2.15, 0.96],
    [-1.1, 1],
    [0.6, 1],
    [2.15, 0.94],
  ],
  front: { rz: 0.36, rx: 0.24 },
  rear: { rz: 0.22, rx: 0.16 },
  under: [
    [-2.15, 0.38],
    [-1.85, 0.22],
    [1.8, 0.22],
    [2.15, 0.32],
  ],
  belt: [
    [-2.15, 0.72],
    [-2.12, 0.98],
    [-2.0, 1.05],
    [-1.2, 1.06],
    [0.1, 1.0],
    [1.02, 0.985],
    [1.72, 0.93],
    [2.03, 0.85],
    [2.15, 0.7],
  ],
  top: [
    [-2.15, 0.74],
    [-2.12, 1.03],
    [-2.02, 1.14],
    [-1.8, 1.55],
    [-1.0, 1.62],
    [-0.1, 1.615],
    [0.42, 1.56],
    [1.04, 1.045],
    [1.72, 0.98],
    [2.03, 0.9],
    [2.15, 0.72],
  ],
  tumble: 0.26,
  railR: 0.065,
  crown: 0.035,
  wells: [
    { z: FAMILY.zf, r: 0.4, yc: 0.34 },
    { z: FAMILY.zr, r: 0.4, yc: 0.34 },
  ],
  wellDepth: 0.32,
  glassSide: [
    [0.96, 0.0],
    [-0.09, -0.97],
    [-1.07, -1.7],
  ],
  glassTop: [
    [1.0, 0.46],
    [-1.83, -2.0],
  ],
  cladding: 1,
  lamps: [
    { mat: 'lampF', rows: [4, 5], z: [1.84, 2.15] },
    { mat: 'amber', rows: [4, 5], z: [1.75, 1.84] },
    { mat: 'lampR', rows: [3, 5], z: [-2.12, -1.9] },
  ],
  liner: [-2.1, 1.06],
};

function familyStatic(c: Colors): THREE.Object3D {
  const body = memo('body|family', () => loftBody(familySpec));
  const k = new Kit();
  const paint = VM.paint(c.body);
  addShell(k, body, paint);
  const trim = VM.trim();
  const cabin = VM.cabin();
  const seatMat = M.fabric(c.seats, 16);
  const { seatY, hipX, hipZ } = FAMILY;
  const floor = 0.24;

  k.geo(merge([body.seam(0.84, [1, -1]), body.seam(-0.045, [1, -1], -1, true), body.seam(-1.0, [1, -1])]), trim).castShadow = false;
  for (const s of [1, -1]) {
    for (const z of [0.08, -0.84]) k.rbox(0.024, 0.03, 0.15, 0.01, paint, s * (body.sideX(z, 0.92) + 0.004), 0.905, z, 1);
    wingMirror(k, s, body.sideX(0.86, 1.04) - 0.02, 1.0, 0.88, paint, 1.15);
    // roof rails
    const rx = 0.6;
    k.rod([s * rx, 1.655, -1.55], [s * rx, 1.665, 0.25], 0.016, M.steel(), 0.016, 8);
    for (const z of [-1.5, -0.65, 0.2]) k.box(0.03, 0.06, 0.07, trim, s * rx, 1.6, z);
  }

  carSeat(k, hipX, hipZ, seatY, seatMat, 0.48, floor);
  carSeat(k, -hipX, hipZ, seatY, seatMat, 0.48, floor);
  steeringWheel(k, hipX, hipZ, seatY);
  k.rbox(1.6, 0.2, 0.4, 0.06, cabin, 0, 0.82, 0.92, 1);
  k.box(1.6, 0.62, 0.04, cabin, 0, floor - 0.01, 0.8);
  k.rbox(0.22, 0.34, 0.6, 0.04, cabin, 0, floor, 0.36, 1);
  k.rbox(1.44, 0.13, 0.5, 0.04, seatMat, 0, seatY - 0.13, -0.68, 1);
  k.box(1.44, seatY - 0.13 - floor, 0.4, cabin, 0, floor, -0.7);
  const rb = k.rbox(1.44, 0.6, 0.1, 0.04, seatMat, 0, seatY - 0.04, -0.97, 1);
  rb.rotation.x = -0.14;
  for (const x of [-0.42, 0.42]) k.rbox(0.24, 0.16, 0.08, 0.03, seatMat, x, seatY + 0.58, -1.07, 1);
  k.box(1.44, 0.02, 0.98, cabin, 0, 0.99, -1.55);

  const zf = familySpec.zFront;
  const zr = familySpec.zRear;
  // grille with a bright surround, lower intake and skid plates
  k.rbox(0.9, 0.16, 0.03, 0.03, M.chrome(), 0, 0.525, zf - 0.013, 1);
  k.rbox(0.84, 0.115, 0.03, 0.02, trim, 0, 0.5475, zf - 0.011, 1);
  k.rbox(1.24, 0.13, 0.03, 0.012, trim, 0, 0.345, zf - 0.016, 1);
  k.rbox(0.5, 0.022, 0.03, 0.008, M.steel(), 0, 0.33, zf - 0.012, 1);
  plate(k, '27-915-36', 0.42, zf - 0.003, 'front', 0.42, 0.095);
  for (const s of [1, -1]) {
    lens(k, VM.lamp(), s * 0.66, 0.41, zf - 0.03, 0.1, 0.07, 0.022, 'front', s * 0.3);
    k.rbox(0.2, 0.04, 0.02, 0.008, VM.tail(), s * 0.6, 0.47, zr + 0.008, 1);
  }
  k.rbox(1.3, 0.1, 0.03, 0.012, trim, 0, 0.385, zr + 0.013, 1);
  k.rbox(0.5, 0.03, 0.03, 0.01, M.steel(), 0, 0.39, zr + 0.011, 1);
  plate(k, '27-915-36', 0.6, zr + 0.005, 'rear');
  k.rbox(0.5, 0.028, 0.02, 0.008, M.chrome(), 0, 0.84, zr + 0.014, 1);
  // roof spoiler over the tail gate, wipers, shark-fin aerial
  k.rbox(1.18, 0.035, 0.2, 0.015, paint, 0, 1.545, -1.86, 1);
  k.rod([0.32, 1.2, -2.0], [0.02, 1.17, -2.02], 0.006, trim, 0.006, 5);
  for (const x of [0.32, -0.26]) k.rod([x - 0.22, 1.085, 1.01], [x + 0.22, 1.07, 1.035], 0.007, trim, 0.007, 6);
  const fin = k.rbox(0.05, 0.06, 0.16, 0.02, paint, 0, 1.61, -1.3, 1);
  fin.rotation.x = 0.3;
  return k.g;
}

/** Photographic four-door family sedan (see public/assets/CREDITS.md). */
const SEDAN_SEAT = { hipX: 0.39, hipZ: 0.26, seatY: 0.48 };
const SEDAN: CarModel = {
  file: 'sedan',
  wheelX: 0.77,
  zf: 1.343,
  zr: -1.32,
  radius: 0.315,
  plates: { front: [0.638, 2.285], rear: [0.662, -2.175], w: 0.42, h: 0.092, text: '27-915-36' },
  interior: (k, c) => {
    const seat = seatFabric(c);
    frontCabin(k, seat, { ...SEDAN_SEAT, floor: 0.23, floorZ: [-1.3, 1.0], width: 1.5 });
    rearBench(k, seat, 1.4, -0.62, 0.48, 0.23);
  },
};

export const carFamily: FurnitureDef = {
  id: 'car-family',
  name: 'מכונית משפחתית',
  category: 'vehicle',
  size: { w: 2.07, d: 4.6, h: 1.47 },
  resize: false,
  colors: [slot('body', 'צבע הרכב', '#2f66a0'), slot('seats', 'ריפוד', '#8a7a68')],
  noBake: true,
  vehicle: {
    kind: 'car',
    maxSpeed: 14,
    acceleration: 2.8,
    wheelbase: SEDAN.zf - SEDAN.zr,
    maxSteer: 0.5,
    radius: 1.2,
    rider: { x: SEDAN_SEAT.hipX, y: SEDAN_SEAT.seatY, z: SEDAN_SEAT.hipZ, pose: 'sit' },
    cameraDistance: 7.5,
    prompt: 'לנהוג במכונית',
  },
  build: ({ colors: c }) =>
    modelCar('car-family', c, SEDAN, { key: 'car-family', statics: () => familyStatic(c), wheel: FAMILY_WHEEL, rimMat: VM.alloy() }, carFamily.size),
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      carPlan(ctx, c.body, 1.92, 4.6, { cowl: 1.28, roofF: 0.6, roofR: -0.8, tail: -1.3, zf: SEDAN.zf, zr: SEDAN.zr, wheelR: SEDAN.radius, rf: 0.34, rr: 0.24 });
      D.line(ctx, -0.78, -1.75, 0.78, -1.75, INK_SOFT, LINE_THIN);
    }),
};

/* ================================================================== minibus */

const BUS_WHEEL: WheelSpec = { r: 0.37, w: 0.24, rimR: 0.235, style: 'steel' };
const BUS = { zf: 2.05, zr: -1.55, wx: 0.9, seatY: 1.18, hipX: 0.5, hipZ: 1.42, floor: 0.8 };

const busTop: BodySpec['top'] = [
  [-3.0, 1.3],
  [-2.93, 2.42],
  [-2.78, 2.55],
  [1.48, 2.55],
  [1.72, 2.47],
  [2.3, 1.38],
  [2.8, 1.16],
  [2.95, 1.06],
  [3.0, 0.92],
];

const busSpec: BodySpec = {
  halfW: 1.05,
  zRear: -3.0,
  zFront: 3.0,
  front: { rz: 0.32, rx: 0.22 },
  rear: { rz: 0.16, rx: 0.12 },
  under: [
    [-3.0, 0.44],
    [-2.6, 0.3],
    [2.6, 0.3],
    [3.0, 0.38],
  ],
  belt: [
    [-3.0, 1.25],
    [-2.9, 1.34],
    [2.2, 1.34],
    [2.32, 1.3],
    [2.8, 1.1],
    [2.95, 1.0],
    [3.0, 0.88],
  ],
  top: busTop,
  tumble: 0.07,
  railR: 0.13,
  crown: 0.05,
  tuck: 0.04,
  shoulder: 0.02,
  wells: [
    { z: BUS.zf, r: 0.43, yc: 0.37 },
    { z: BUS.zr, r: 0.43, yc: 0.37 },
  ],
  wellDepth: 0.33,
  glassHeight: 0.86,
  glassSide: [
    [2.24, 1.5],
    [1.4, 0.5],
    [0.42, -0.48],
    [-0.56, -1.4],
    [-1.56, -2.62],
  ],
  glassTop: [
    [zAtValue(busTop, 1.5, 2.3, 1.72), zAtValue(busTop, 2.4, 2.3, 1.72)],
    [zAtValue(busTop, 1.48, -3.0, -2.93), zAtValue(busTop, 2.3, -3.0, -2.93)],
  ],
  stripeRow: 4,
  lamps: [
    { mat: 'lampF', rows: [4, 5], z: [2.8, 3.0] },
    { mat: 'amber', rows: [4, 5], z: [2.72, 2.8] },
    { mat: 'lampR', rows: [2, 3], z: [-3.0, -2.9] },
  ],
  liner: [-2.96, 2.36],
};

function busStatic(c: Colors): THREE.Object3D {
  const body = memo('body|minibus', () => loftBody(busSpec));
  const k = new Kit();
  const paint = VM.paint(c.body);
  addShell(k, body, paint, VM.paint(c.stripe), VM.liner('#b9b6ae'));
  const trim = VM.trim();
  const cabin = VM.cabin();
  const seatMat = M.fabric(c.seats, 14);
  const { seatY, hipX, hipZ, floor } = BUS;

  // doors: passenger door on the kerb side (-X), driver's door on +X
  k.geo(merge([body.seam(1.4, [-1], 0.42, true), body.seam(0.5, [-1], 0.42, true), body.seam(0.95, [-1], 0.42, true), body.seam(1.5, [1], -1, true), body.seam(2.26, [1])]), trim).castShadow = false;
  k.rbox(0.03, 0.035, 0.14, 0.012, trim, body.sideX(1.6, 1.2) + 0.005, 1.19, 1.62, 1);
  k.rbox(0.03, 0.12, 0.035, 0.012, trim, -(body.sideX(0.95, 1.1) + 0.005), 1.05, 0.9, 1);
  k.rbox(0.03, 0.12, 0.035, 0.012, trim, -(body.sideX(0.95, 1.1) + 0.005), 1.05, 1.0, 1);
  // entry step under the passenger door
  k.rbox(0.12, 0.04, 0.84, 0.015, trim, -1.0, 0.33, 0.95, 1);
  for (const s of [1, -1]) {
    // big mirrors on arms
    const mx = body.sideX(2.2, 1.45);
    k.rod([s * (mx - 0.03), 1.42, 2.22], [s * (mx + 0.16), 1.5, 2.34], 0.014, trim, 0.014, 6);
    k.rbox(0.07, 0.34, 0.16, 0.03, trim, s * (mx + 0.17), 1.42, 2.35, 1);
    const g = mesh(new THREE.PlaneGeometry(0.13, 0.29), M.chrome());
    g.position.set(s * (mx + 0.17), 1.59, 2.268);
    g.rotation.y = Math.PI;
    g.castShadow = false;
    k.g.add(g);
    // side reflectors
    for (const z of [-2.5, -0.05]) k.box(0.01, 0.035, 0.1, VM.amber(), s * (body.sideX(z, 0.7) + 0.003), 0.68, z);
  }

  // cabin: raised flat floor above the wheel wells
  k.box(1.96, 0.05, 5.1, VM.cabin('#55585e'), 0, floor - 0.05, -0.38);
  carSeat(k, hipX, hipZ, seatY, seatMat, 0.48, floor);
  steeringWheel(k, hipX, hipZ, seatY, 0.75, 0.2, 0.34, 0.47, 0.42);
  k.rbox(1.9, 0.26, 0.38, 0.06, cabin, 0, 1.06, 2.12, 1);
  k.box(1.9, 0.3, 0.05, cabin, 0, floor, 2.08);
  k.rbox(0.5, 0.3, 0.5, 0.05, cabin, -0.1, floor, 1.72, 1);
  // partition rail behind the driver + grab pole at the door
  k.box(0.9, 0.5, 0.03, cabin, 0.52, floor, 1.02);
  k.rod([-0.55, floor, 1.42], [-0.55, 2.45, 1.42], 0.016, M.steel(), 0.016, 6);
  // passenger rows: double seat on the driver's side, single seat on the door side
  const rows = [0.4, -0.38, -1.16, -1.94];
  for (const z of rows) {
    k.rbox(0.88, 0.11, 0.44, 0.04, seatMat, 0.56, floor + 0.32, z + 0.06, 1);
    const b1 = k.rbox(0.88, 0.62, 0.09, 0.04, seatMat, 0.56, floor + 0.4, z - 0.2, 1);
    b1.rotation.x = -0.1;
    k.box(0.7, 0.32, 0.3, cabin, 0.56, floor, z + 0.04);
    if (z < 0.4) {
      k.rbox(0.44, 0.11, 0.44, 0.04, seatMat, -0.76, floor + 0.32, z + 0.06, 1);
      const b2 = k.rbox(0.44, 0.62, 0.09, 0.04, seatMat, -0.76, floor + 0.4, z - 0.2, 1);
      b2.rotation.x = -0.1;
      k.box(0.3, 0.32, 0.3, cabin, -0.76, floor, z + 0.04);
    }
  }
  // back bench
  k.rbox(1.9, 0.11, 0.44, 0.04, seatMat, 0, floor + 0.32, -2.58, 1);
  k.rbox(1.9, 0.62, 0.09, 0.04, seatMat, 0, floor + 0.4, -2.84, 1);
  k.box(1.9, 0.32, 0.3, cabin, 0, floor, -2.6);

  const zf = busSpec.zFront;
  const zr = busSpec.zRear;
  // bumpers, grille, plates
  k.rbox(1.74, 0.2, 0.08, 0.035, trim, 0, 0.4, zf - 0.04, 1);
  k.rbox(1.0, 0.16, 0.03, 0.02, trim, 0, 0.67, zf - 0.013, 1);
  for (const y of [0.7, 0.75, 0.8]) k.box(0.92, 0.012, 0.012, M.steel(), 0, y - 0.006, zf - 0.002);
  plate(k, '84-206-51', 0.5, zf - 0.003, 'front');
  k.rbox(1.9, 0.2, 0.07, 0.035, trim, 0, 0.46, zr + 0.04, 1);
  plate(k, '84-206-51', 0.86, zr + 0.005, 'rear');
  for (const s of [1, -1]) {
    lens(k, VM.lamp(), s * 0.62, 0.5, zf - 0.016, 0.11, 0.08, 0.02, 'front');
    k.rbox(0.1, 0.05, 0.02, 0.01, VM.amber(), s * 0.8, 0.53, zr + 0.008, 1);
    // warning lights at the roof corners (front amber, rear red)
    lens(k, VM.amber(), s * 0.62, 2.44, 1.615, 0.13, 0.09, 0.03, 'front');
    lens(k, VM.tail(), s * 0.6, 2.33, -2.925, 0.13, 0.09, 0.03, 'rear');
    for (const x of [0.2, 0.42]) k.rod([s * x - 0.3, 1.5, 2.25], [s * x + 0.12, 1.47, 2.27], 0.008, trim, 0.008, 5);
  }
  // roof: escape hatch and air-conditioning unit
  k.rbox(0.7, 0.04, 0.7, 0.02, VM.liner('#d9d9d6'), 0, 2.545, 0.4, 1);
  k.rbox(1.1, 0.1, 1.5, 0.045, VM.liner('#d9d9d6'), 0, 2.535, -1.5, 1);
  return k.g;
}

/** Photographic passenger van with side windows (see public/assets/CREDITS.md). */
const VAN_SEAT = { hipX: 0.48, hipZ: 1.12, seatY: 0.98 };
const VAN: CarModel = {
  file: 'van',
  wheelX: 0.907,
  zf: 1.701,
  zr: -1.699,
  radius: 0.393,
  plates: { front: [0.5, 2.84], rear: [0.81, -2.79], w: 0.46, h: 0.1, text: '84-206-51' },
  interior: (k, c) => {
    const seat = seatFabric(c);
    const floor = 0.58;
    frontCabin(k, seat, { ...VAN_SEAT, floor, floorZ: [-2.66, 2.0], width: 1.9, wheel: [0.75, 0.2, 0.34, 0.47, 0.42] });
    // dashboard under the windshield
    k.rbox(1.9, 0.3, 0.42, 0.06, VM.cabin('#2a2c30'), 0, 1.08, 1.86, 1);
    for (const z of [0.3, -0.6, -1.5, -2.28]) rearBench(k, seat, 1.72, z, VAN_SEAT.seatY, floor);
  },
};

export const minibus: FurnitureDef = {
  id: 'minibus',
  name: 'מיניבוס',
  category: 'vehicle',
  size: { w: 2.6, d: 5.71, h: 2.3 },
  resize: false,
  colors: [slot('body', 'צבע הרכב', '#f2b21d'), slot('seats', 'ריפוד', '#3f5f8a')],
  noBake: true,
  vehicle: {
    kind: 'bus',
    maxSpeed: 11,
    acceleration: 2.2,
    wheelbase: VAN.zf - VAN.zr,
    maxSteer: 0.5,
    radius: 1.5,
    rider: { x: VAN_SEAT.hipX, y: VAN_SEAT.seatY, z: VAN_SEAT.hipZ, pose: 'sit' },
    cameraDistance: 10,
    prompt: 'לנהוג במיניבוס',
  },
  build: ({ colors: c }) =>
    modelCar('minibus', c, VAN, { key: 'minibus', statics: () => busStatic({ stripe: '#26282c', ...c }), wheel: BUS_WHEEL, rimMat: M.paint('#e8e8e6', 0.5) }, minibus.size),
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      // the drawing below was made for a 2.52 x 6.0 m bus
      ctx.scale(2.6 / 2.52, 5.71 / 6.0);
      c = { stripe: '#26282c', ...c };
      const f = tint(c.body, 0.25);
      for (const z of [BUS.zf, BUS.zr]) for (const s of [1, -1]) D.rr(ctx, s * 0.96, z, 0.16, 0.74, 0.04, '#3b3d42', null);
      D.box(ctx, -1.03, -3.0, 1.03, 3.0, 0.22, f);
      // windshield and hood
      D.poly(
        ctx,
        [
          [-0.92, 2.32],
          [0.92, 2.32],
          [0.86, 1.74],
          [-0.86, 1.74],
        ],
        true,
        '#cfe3ea',
        INK_SOFT,
        LINE_THIN,
      );
      D.line(ctx, -0.8, 2.6, 0.8, 2.6, INK_SOFT, LINE_THIN);
      // roof with hatch and air-conditioning unit, rear window
      D.rr(ctx, 0, -0.6, 1.78, 4.66, 0.12, lighten(c.body, 0.4), INK_SOFT, LINE_THIN);
      D.rr(ctx, 0, 0.4, 0.7, 0.7, 0.06, '#f4f4f1', INK_SOFT, LINE_THIN);
      D.rr(ctx, 0, -1.5, 1.1, 1.5, 0.1, '#f4f4f1', INK_SOFT, LINE_THIN);
      D.box(ctx, -0.8, -2.99, 0.8, -2.94, 0.01, '#cfe3ea', INK_SOFT, LINE_THIN);
      for (const s of [1, -1]) {
        // window pillars along the sides
        for (const z of [1.45, 0.46, -0.52, -1.48]) D.line(ctx, s * 0.9, z, s * 1.03, z, INK_SOFT, LINE_THIN);
        D.line(ctx, s * 1.0, -2.6, s * 1.0, 2.2, c.stripe, 0.03);
        D.rr(ctx, s * 1.17, 2.35, 0.1, 0.16, 0.02, '#4a4d52', undefined, LINE_THIN);
        D.line(ctx, s * 1.03, 2.25, s * 1.14, 2.33, INK_SOFT, LINE_THIN);
        D.rr(ctx, s * 0.72, 2.96, 0.3, 0.05, 0.015, '#fff6cf', INK_SOFT, LINE_THIN);
        D.rr(ctx, s * 0.82, -2.965, 0.24, 0.045, 0.012, '#e0564f', INK_SOFT, LINE_THIN);
      }
    }),
};

preloadCarModels(['hatch', 'sedan', 'van']);
