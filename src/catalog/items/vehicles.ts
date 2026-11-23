import * as THREE from 'three';
import type { FurnitureDef, WheelPart } from '../types';
import { D, INK_SOFT, Kit, LINE_THIN, M, darken, lighten, mesh, sym, tint, type Ctx2D } from '../kit';
import { slot } from './_parts';
import { loftBody, type BodyGeo, type BodySpec } from './_vehicleBody';
import { VM, carSeat, lens, memo, merge, mountWheel, plate, roadWheel, staticPart, steeringWheel, type WheelSpec } from './_vehicleParts';

type Colors = Record<string, string>;

/* ================================================================== cars: shared assembly */

/** Add the lofted shell (paint / glass / plastic / lining) to a kit. */
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
function wingMirror(k: Kit, s: number, x: number, y: number, z: number, mat: THREE.Material, scale = 1): void {
  const w = 0.17 * scale;
  const h = 0.105 * scale;
  k.rbox(w, h, 0.07 * scale, 0.03 * scale, mat, s * (x + w / 2 + 0.02), y, z, 2);
  k.box(0.06, 0.03 * scale, 0.05 * scale, VM.trim(), s * (x + 0.01), y + 0.01, z);
  const g = mesh(new THREE.PlaneGeometry(w * 0.82, h * 0.74), M.mirror());
  g.position.set(s * (x + w / 2 + 0.02), y + h / 2, z - 0.036 * scale);
  g.rotation.y = Math.PI;
  k.g.add(g);
}

/* ================================================================== compact city car */

const COMPACT_WHEEL: WheelSpec = { r: 0.29, w: 0.185, rimR: 0.19, style: 'alloy5' };
const COMPACT = { halfW: 0.825, zf: 1.13, zr: -1.22, wx: 0.7, seatY: 0.54, hipX: 0.36, hipZ: 0.05 };

const compactSpec: BodySpec = {
  halfW: COMPACT.halfW,
  zRear: -1.85,
  zFront: 1.85,
  front: { rz: 0.34, rx: 0.26 },
  rear: { rz: 0.24, rx: 0.2 },
  under: [
    [-1.85, 0.3],
    [-1.62, 0.17],
    [1.5, 0.17],
    [1.85, 0.26],
  ],
  belt: [
    [-1.85, 0.6],
    [-1.83, 0.86],
    [-1.76, 0.93],
    [-1.2, 0.945],
    [0.0, 0.91],
    [0.98, 0.88],
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
    { mat: 'lampF', rows: [4, 5], z: [1.6, 1.85] },
    { mat: 'amber', rows: [4, 5], z: [1.5, 1.6] },
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

  // cabin
  carSeat(k, hipX, hipZ, seatY, seatMat, 0.46, 0.19);
  carSeat(k, -hipX, hipZ, seatY, seatMat, 0.46, 0.19);
  steeringWheel(k, hipX, hipZ, seatY);
  k.rbox(1.46, 0.17, 0.36, 0.05, cabin, 0, 0.745, 0.82, 2);
  k.box(1.46, 0.58, 0.04, cabin, 0, 0.18, 0.74);
  k.rbox(0.2, 0.3, 0.5, 0.04, cabin, 0, 0.19, 0.3, 1);
  // rear bench + parcel shelf
  k.rbox(1.3, 0.13, 0.5, 0.04, seatMat, 0, seatY - 0.13, -0.66, 1);
  k.box(1.3, seatY - 0.13 - 0.19, 0.4, cabin, 0, 0.19, -0.68);
  const rb = k.rbox(1.3, 0.56, 0.1, 0.04, seatMat, 0, seatY - 0.04, -0.94, 1);
  rb.rotation.x = -0.14;
  k.box(1.3, 0.02, 0.72, cabin, 0, 0.87, -1.37);

  // face: grille, lamps, plates
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
  k.rod([0.3, 1.04, -1.725], [0.02, 1.02, -1.745], 0.006, trim, 0.006, 5);
  // wipers, aerial, exhaust
  for (const x of [0.3, -0.25]) k.rod([x - 0.2, 0.975, 0.955], [x + 0.2, 0.965, 0.975], 0.007, trim, 0.007, 6);
  k.rod([0, 1.48, -1.1], [0, 1.66, -1.3], 0.004, trim, 0.003, 5);
  return k.g;
}

function buildCar(id: string, c: Colors, statics: () => THREE.Object3D, wheel: WheelSpec, wx: number, zf: number, zr: number, rimMat: THREE.Material): THREE.Group {
  const root = new THREE.Group();
  root.name = id;
  root.add(staticPart(`${id}|${Object.values(c).join(',')}`, statics));
  const wheels: WheelPart[] = [];
  for (const s of [1, -1] as const) wheels.push(mountWheel(root, roadWheel(wheel, s, rimMat), wheel.r, s * wx, zf, true));
  for (const s of [1, -1] as const) wheels.push(mountWheel(root, roadWheel(wheel, s, rimMat), wheel.r, s * wx, zr, false));
  root.userData.wheels = wheels;
  return root;
}

/** Top-down car symbol: body outline, glazed cabin, hood line, mirrors and wheels. */
function carPlan(ctx: Ctx2D, color: string, w: number, d: number, o: { cowl: number; roofF: number; roofR: number; tail: number; zf: number; zr: number; wheelR: number; rf?: number; rr?: number }): void {
  const hw = w / 2;
  const hd = d / 2;
  const f = tint(color, 0.3);
  for (const z of [o.zf, o.zr]) for (const s of [1, -1]) D.rr(ctx, s * (hw - 0.05), z, 0.14, o.wheelR * 2, 0.04, '#3b3d42', null);
  ctx.beginPath();
  const rf = o.rf ?? 0.3;
  const rr = o.rr ?? 0.22;
  const bw = hw - 0.035;
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
  // glass ring (windshield, side windows, rear window) and roof
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
  D.line(ctx, -gw + 0.06, o.cowl + 0.05, gw - 0.06, o.cowl + 0.05, INK_SOFT, LINE_THIN);
  for (const s of [1, -1]) {
    D.line(ctx, s * gw, o.cowl, s * (gw - 0.1), o.roofF, INK_SOFT, LINE_THIN);
    D.line(ctx, s * (gw - 0.02), o.tail, s * (gw - 0.1), o.roofR, INK_SOFT, LINE_THIN);
    D.rr(ctx, s * (bw + 0.0), o.cowl - 0.12, 0.07, 0.11, 0.02, f, undefined, LINE_THIN);
    D.rr(ctx, s * (bw - 0.2), hd - 0.03, 0.22, 0.04, 0.015, '#fff6cf', INK_SOFT, LINE_THIN);
    D.rr(ctx, s * (bw - 0.18), -hd + 0.025, 0.2, 0.035, 0.012, '#e0564f', INK_SOFT, LINE_THIN);
  }
}

const carCompact: FurnitureDef = {
  id: 'car-compact',
  name: 'מכונית קטנה',
  category: 'vehicle',
  size: { w: 1.9, d: 3.7, h: 1.66 },
  colors: [slot('body', 'צבע הרכב', '#c8322c'), slot('seats', 'ריפוד', '#4a4d55')],
  noBake: true,
  vehicle: {
    kind: 'car',
    maxSpeed: 14,
    acceleration: 3,
    wheelbase: COMPACT.zf - COMPACT.zr,
    maxSteer: 0.5,
    radius: 1.0,
    rider: { x: COMPACT.hipX, y: COMPACT.seatY, z: COMPACT.hipZ, pose: 'sit' },
    cameraDistance: 7,
    prompt: 'לנהוג במכונית',
  },
  build: ({ colors: c }) => buildCar('car-compact', c, () => compactStatic(c), COMPACT_WHEEL, COMPACT.wx, COMPACT.zf, COMPACT.zr, VM.alloy()),
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      carPlan(ctx, c.body, 1.72, 3.7, { cowl: 0.98, roofF: 0.3, roofR: -1.4, tail: -1.76, zf: COMPACT.zf, zr: COMPACT.zr, wheelR: 0.29 });
    }),
};

export const VEHICLES: FurnitureDef[] = [carCompact];
