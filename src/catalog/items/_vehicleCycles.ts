/** Human-powered vehicles: bicycles and the kick scooter. */
import * as THREE from 'three';
import type { FurnitureDef, WheelPart } from '../types';
import { D, INK, INK_SOFT, Kit, LINE_THIN, M, extrudeY, mesh, roundedRectShape, sym, tint, type Ctx2D, type V3 } from '../kit';
import { slot } from './_parts';
import { VM, arcBandGeo, cylX, latheX, memo, merge, staticPart } from './_vehicleParts';

type Colors = Record<string, string>;

/* ================================================================== steering assembly helper */

/**
 * Steering for single-track vehicles. The returned `tilt` group sits on the head-tube axis and
 * leans with it; `steer` (inside) is the node the game yaws, so the fork, handlebar and front
 * wheel turn around the real steering axis. `inv` converts vehicle-space coordinates into the
 * steer node's local frame.
 */
function steerPivot(headBottom: [number, number], headTop: [number, number]): { tilt: THREE.Group; steer: THREE.Group; inv: THREE.Matrix4 } {
  // points are [z, y]
  const tilt = new THREE.Group();
  tilt.name = 'steer-axis';
  tilt.position.set(0, (headBottom[1] + headTop[1]) / 2, (headBottom[0] + headTop[0]) / 2);
  tilt.rotation.x = Math.atan2(headTop[0] - headBottom[0], headTop[1] - headBottom[1]);
  tilt.updateMatrix();
  const steer = new THREE.Group();
  steer.name = 'steer';
  tilt.add(steer);
  return { tilt, steer, inv: tilt.matrix.clone().invert() };
}

/* ================================================================== bicycle wheels */

interface BikeWheel {
  r: number;
  tire: number;
  spokes: number;
}

function bikeWheelGeos(w: BikeWheel): { tire: THREE.BufferGeometry; metal: THREE.BufferGeometry } {
  return memo(`bikewheel|${w.r}|${w.tire}|${w.spokes}`, () => {
    const tire = new THREE.TorusGeometry(w.r - w.tire, w.tire, 7, 28);
    tire.rotateY(Math.PI / 2);
    const rimR = w.r - w.tire * 2 + 0.002;
    const rim = latheX(
      [
        [rimR + 0.006, -0.011],
        [rimR - 0.012, -0.007],
        [rimR - 0.012, 0.007],
        [rimR + 0.006, 0.011],
      ].map(([r, a]) => [r, -a] as [number, number]),
      28,
    );
    const parts: THREE.BufferGeometry[] = [rim];
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < w.spokes; i++) {
      const a = (i / w.spokes) * Math.PI * 2;
      const side = i % 2 ? 1 : -1;
      // laced spokes: leave the hub flange tangentially, alternate sides
      const a0 = a + (i % 4 < 2 ? 0.9 : -0.9);
      const p0 = new THREE.Vector3(side * 0.028, Math.cos(a0) * 0.022, Math.sin(a0) * 0.022);
      const p1 = new THREE.Vector3(0, Math.cos(a) * (rimR - 0.01), Math.sin(a) * (rimR - 0.01));
      const dir = p1.clone().sub(p0);
      const len = dir.length();
      const sp = new THREE.CylinderGeometry(0.0022, 0.0022, len, 3, 1, true);
      sp.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, dir.normalize()));
      sp.translate((p0.x + p1.x) / 2, (p0.y + p1.y) / 2, (p0.z + p1.z) / 2);
      parts.push(sp);
    }
    parts.push(cylX(0.016, 0.1, 8));
    for (const s of [-1, 1]) {
      const fl = cylX(0.026, 0.004, 10);
      fl.translate(s * 0.028, 0, 0);
      parts.push(fl);
    }
    return { tire: tire, metal: merge(parts) };
  });
}

function bikeWheel(w: BikeWheel): THREE.Group {
  const { tire, metal } = bikeWheelGeos(w);
  const spin = new THREE.Group();
  spin.add(mesh(tire, VM.tire()), mesh(metal, M.steel()));
  return spin;
}

/* ================================================================== bicycles */

interface BikeDims {
  id: string;
  wheel: BikeWheel;
  /** axle z of the rear / front wheel */
  zr: number;
  zf: number;
  /** bottom bracket [z, y] and crank length */
  bb: [number, number];
  crank: number;
  /** top of the seat tube [z, y] */
  seatTop: [number, number];
  /** saddle: centre z and height of its top */
  saddleZ: number;
  saddleY: number;
  headBottom: [number, number];
  headTop: [number, number];
  /** grips: height, z, half spacing */
  barY: number;
  barZ: number;
  barHalf: number;
  /** tube radii */
  tube: number;
  kids: boolean;
}

const zy = (p: [number, number], x = 0): V3 => [x, p[1], p[0]];

function saddleGeo(len: number, wid: number): THREE.BufferGeometry {
  return memo(`saddle|${len}|${wid}`, () => {
    // pear-shaped outline: wide at the back (-Z), narrow nose at the front (+Z)
    const s = new THREE.Shape();
    const hw = wid / 2;
    const n = 0.022;
    // shape y maps to world -z, so the nose (world +z) is at shape -y
    s.moveTo(-n, -len * 0.55);
    s.quadraticCurveTo(-n * 1.2, -len * 0.1, -hw, len * 0.25);
    s.quadraticCurveTo(-hw * 1.02, len * 0.45, -hw * 0.45, len * 0.45);
    s.lineTo(hw * 0.45, len * 0.45);
    s.quadraticCurveTo(hw * 1.02, len * 0.45, hw, len * 0.25);
    s.quadraticCurveTo(n * 1.2, -len * 0.1, n, -len * 0.55);
    s.quadraticCurveTo(0, -len * 0.6, -n, -len * 0.55);
    return extrudeY(s, 0.045, 0.018, 6);
  });
}

function bikeFrame(d: BikeDims, c: Colors): THREE.Object3D {
  const k = new Kit();
  const paint = VM.enamel(c.frame);
  const steel = M.steel();
  const black = M.rubber('#202124');
  const t = d.tube;
  const R = d.wheel.r;
  const rear: [number, number] = [d.zr, R];
  const ext = (a: [number, number], b: [number, number], f: number): [number, number] => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  const headMid = ext(d.headBottom, d.headTop, 0.5);

  // main triangle
  const seatJoin = ext(d.bb, d.seatTop, 0.93);
  k.rod(zy(d.bb), zy(d.seatTop), t, paint, t, 10);
  k.rod(zy(ext(d.headBottom, d.headTop, 0.22)), zy(d.bb), t * 1.15, paint, t * 1.15, 10);
  if (d.kids) {
    // low step-through top tube
    k.rod(zy(ext(d.headBottom, d.headTop, 0.6)), zy(ext(d.bb, d.seatTop, 0.5)), t, paint, t, 10);
  } else {
    k.rod(zy(ext(d.headBottom, d.headTop, 0.82)), zy(seatJoin), t, paint, t, 10);
  }
  k.rod(zy(d.headBottom), zy(d.headTop), t * 1.35, paint, t * 1.35, 10);
  k.geo(cylX(t * 1.6, 0.075, 12), paint, 0, d.bb[1], d.bb[0]);
  // rear triangle: chain stays and seat stays reaching the drop-outs either side of the wheel
  for (const s of [1, -1]) {
    k.rod([s * 0.03, d.bb[1], d.bb[0]], [s * 0.052, rear[1], rear[0]], t * 0.6, paint, t * 0.55, 8);
    k.rod([s * 0.02, seatJoin[1], seatJoin[0]], [s * 0.052, rear[1], rear[0]], t * 0.55, paint, t * 0.5, 8);
    k.geo(cylX(0.016, 0.01, 8), steel, s * 0.055, rear[1], rear[0]);
  }
  // seat post + saddle
  const postTop: [number, number] = [d.saddleZ + 0.01, d.saddleY - 0.05];
  k.rod(zy(ext(d.bb, d.seatTop, 0.9)), zy(postTop), t * 0.62, steel, t * 0.62, 8);
  k.geo(saddleGeo(d.kids ? 0.24 : 0.27, d.kids ? 0.17 : 0.165), d.kids ? M.plastic(c.seat) : M.leather(c.seat), 0, d.saddleY - 0.045, d.saddleZ + 0.015);

  // drivetrain on the right-hand side (-X): chain ring, sprocket, chain, guard
  const cx = -0.05;
  const ringR = d.kids ? 0.07 : 0.09;
  k.geo(cylX(ringR, 0.005, 20), steel, cx, d.bb[1], d.bb[0]);
  k.geo(cylX(0.035, 0.012, 12), steel, cx, rear[1], rear[0]);
  const chain = M.blackMetal();
  k.beam([cx, d.bb[1] + ringR - 0.004, d.bb[0]], [cx, rear[1] + 0.031, rear[0]], 0.006, 0.01, chain);
  k.beam([cx, d.bb[1] - ringR + 0.004, d.bb[0]], [cx, rear[1] - 0.031, rear[0]], 0.006, 0.01, chain);
  const guardMat = d.kids ? M.plastic('#f4f4f2') : paint;
  k.beam([cx - 0.012, d.bb[1] + ringR * 0.55, d.bb[0] + ringR * 0.9], [cx - 0.012, rear[1] + 0.03, rear[0] + 0.05], 0.005, d.kids ? ringR * 2.3 : ringR * 1.1, guardMat, 0.002);

  // rear mudguard, reflector, kick stand
  const fenderMat = d.kids ? paint : steel;
  k.geo(
    memo(`fender-r|${d.id}`, () => arcBandGeo(R + 0.012, R + 0.017, 0.5, 3.35, d.kids ? 0.062 : 0.05, 18)),
    fenderMat,
    0,
    rear[1],
    rear[0],
  );
  k.box(0.045, 0.03, 0.012, VM.tail(), 0, R + (R + 0.02) * Math.sin(2.75) - 0.015, d.zr + (R + 0.024) * Math.cos(2.75)).rotation.x = -0.4;
  // kick stand, folded up along the chain stay
  k.rod([0.05, d.bb[1] - 0.03, d.bb[0] - 0.1], [0.075, R - 0.045, d.zr + 0.03], 0.007, steel, 0.007, 6);
  if (!d.kids) {
    // luggage rack over the rear wheel
    const ry = R * 2 + 0.06;
    for (const s of [1, -1]) {
      k.rod([s * 0.06, ry, d.zr - 0.22], [s * 0.06, ry, d.zr + 0.24], 0.005, black, 0.005, 6);
      k.rod([s * 0.06, ry, d.zr - 0.1], [s * 0.058, R, d.zr], 0.005, black, 0.005, 6);
      k.rod([s * 0.06, ry, d.zr + 0.24], [s * 0.02, seatJoin[1] - 0.06, seatJoin[0] - 0.02], 0.005, black, 0.005, 6);
    }
    for (const z of [-0.22, -0.07, 0.08, 0.24]) k.rod([-0.06, ry, d.zr + z], [0.06, ry, d.zr + z], 0.005, black, 0.005, 6);
  }
  void headMid;
  return k.g;
}

/** Fork, stem, handlebar, grips, front mudguard, lamp (+ basket) in vehicle coordinates. */
function bikeFront(d: BikeDims, c: Colors): THREE.Object3D {
  const k = new Kit();
  const paint = VM.enamel(c.frame);
  const steel = M.steel();
  const black = M.rubber('#202124');
  const t = d.tube;
  const R = d.wheel.r;
  const axis = new THREE.Vector2(d.headTop[0] - d.headBottom[0], d.headTop[1] - d.headBottom[1]).normalize();
  const along = (f: number): [number, number] => [d.headBottom[0] + axis.x * f, d.headBottom[1] + axis.y * f];
  const headLen = Math.hypot(d.headTop[0] - d.headBottom[0], d.headTop[1] - d.headBottom[1]);
  // fork: crown just under the head tube, two blades to the axle
  const crown = along(-0.02);
  k.geo(cylX(t * 1.05, 0.105, 10), paint, 0, crown[1], crown[0]);
  for (const s of [1, -1]) {
    k.rod([s * 0.047, crown[1], crown[0]], [s * 0.05, R + 0.06, d.zf - 0.035], t * 0.72, paint, t * 0.6, 8);
    k.rod([s * 0.05, R + 0.06, d.zf - 0.035], [s * 0.05, R, d.zf], t * 0.6, paint, t * 0.5, 8);
    k.geo(cylX(0.016, 0.01, 8), steel, s * 0.053, R, d.zf);
  }
  // stem and handlebar
  const stemTop = along(headLen + (d.kids ? 0.1 : 0.09));
  k.rod(zy(along(headLen - 0.01)), zy(stemTop), t * 0.7, steel, t * 0.7, 8);
  const gy = d.barY;
  const gz = d.barZ;
  const h = d.barHalf;
  if (d.kids) {
    // BMX-style riser bar with a cross brace
    const by = stemTop[1];
    const bz = stemTop[0];
    k.tube(
      [
        [-h, gy, gz - 0.02],
        [-h + 0.09, gy, gz],
        [-0.1, gy - 0.02, bz + 0.005],
        [-0.07, by, bz],
        [0.07, by, bz],
        [0.1, gy - 0.02, bz + 0.005],
        [h - 0.09, gy, gz],
        [h, gy, gz - 0.02],
      ],
      0.011,
      steel,
      { seg: 40, radial: 6, tension: 0.2 },
    );
    k.rod([-0.105, gy - 0.07, bz + 0.004], [0.105, gy - 0.07, bz + 0.004], 0.008, steel, 0.008, 6);
  } else {
    // swept-back city bar
    const by = stemTop[1];
    const bz = stemTop[0] + 0.05;
    k.rod(zy(stemTop), [0, by, bz], t * 0.6, steel, t * 0.6, 8);
    k.tube(
      [
        [-h, gy, gz - 0.11],
        [-h, gy, gz],
        [-h + 0.07, gy - 0.005, bz - 0.01],
        [-0.08, by, bz],
        [0.08, by, bz],
        [h - 0.07, gy - 0.005, bz - 0.01],
        [h, gy, gz],
        [h, gy, gz - 0.11],
      ],
      0.011,
      steel,
      { seg: 40, radial: 6, tension: 0.35 },
    );
  }
  for (const s of [1, -1]) {
    const z0 = d.kids ? gz - 0.02 : gz - 0.11;
    k.rod([s * (d.kids ? h - 0.1 : h), gy, d.kids ? gz - 0.004 : z0 + 0.105], [s * (d.kids ? h + 0.005 : h), gy, d.kids ? z0 - 0.002 : z0 - 0.005], 0.016, black, 0.016, 8);
  }
  // bell and head lamp
  k.sphere(0.022, M.chrome(), h - 0.16, gy + 0.018, d.kids ? gz - 0.005 : gz - 0.03, 1, 0.7, 1, 10);
  const lampZ = d.headTop[0] + 0.07;
  const lampY = d.headTop[1] - 0.02;
  k.rod([0, lampY, lampZ - 0.045], [0, lampY, lampZ], 0.026, black, 0.032, 10);
  const lensM = mesh(
    memo('bikeLamp', () => new THREE.CircleGeometry(0.03, 12)),
    VM.lamp(),
  );
  lensM.position.set(0, lampY, lampZ + 0.001);
  k.g.add(lensM);
  // front mudguard
  k.geo(
    memo(`fender-f|${d.id}`, () => arcBandGeo(R + 0.012, R + 0.017, 0.75, 2.75, d.kids ? 0.062 : 0.05, 14)),
    d.kids ? paint : steel,
    0,
    R,
    d.zf,
  );
  if (d.kids) {
    // basket hung from the handlebar
    const bw = 0.26;
    const bd = 0.17;
    const y0 = gy - 0.26;
    const zc = stemTop[0] + 0.16;
    const wicker = M.plastic(c.basket);
    k.slab(roundedRectShape(bw - 0.03, bd - 0.03, 0.03), 0.012, wicker, 0, y0, zc);
    for (let i = 0; i < 4; i++) {
      const yy = y0 + 0.04 + i * 0.046;
      const grow = 1 + i * 0.045;
      k.tube(
        [
          [(-bw / 2) * grow, yy, zc - (bd / 2) * grow],
          [(bw / 2) * grow, yy, zc - (bd / 2) * grow],
          [(bw / 2) * grow, yy, zc + (bd / 2) * grow],
          [(-bw / 2) * grow, yy, zc + (bd / 2) * grow],
        ],
        i === 3 ? 0.008 : 0.005,
        wicker,
        { closed: true, seg: 20, radial: 5, tension: 0.12 },
      );
    }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + 0.26;
      const ex = Math.max(-1, Math.min(1, Math.cos(a) * 1.5));
      const ez = Math.max(-1, Math.min(1, Math.sin(a) * 1.5));
      k.rod([(ex * (bw - 0.03)) / 2, y0 + 0.006, zc + (ez * (bd - 0.03)) / 2], [((ex * bw) / 2) * 1.135, y0 + 0.178, zc + ((ez * bd) / 2) * 1.135], 0.004, wicker, 0.004, 4);
    }
    k.rod([0, y0 + 0.17, zc - bd / 2 - 0.01], [0, stemTop[1] - 0.02, stemTop[0] + 0.01], 0.006, steel, 0.006, 5);
  }
  return k.g;
}

function crankGeos(d: BikeDims): { metal: THREE.BufferGeometry; pedals: THREE.BufferGeometry } {
  return memo(`crank|${d.id}`, () => {
    const L = d.crank;
    const metal: THREE.BufferGeometry[] = [cylX(0.011, 0.19, 8)];
    const pedals: THREE.BufferGeometry[] = [];
    for (const s of [1, -1]) {
      // right crank (-X) points forward-down at rest, left crank opposite
      const arm = new THREE.BoxGeometry(0.012, L + 0.03, 0.026);
      arm.translate(s * 0.086, (-s * L) / 2, 0);
      metal.push(arm);
      const ped = new THREE.BoxGeometry(0.085, 0.022, 0.07);
      ped.translate(s * 0.14, -s * L, 0);
      pedals.push(ped);
    }
    const m = merge(metal);
    const p = merge(pedals);
    // rest pose: cranks roughly horizontal-ish (30° off), looks natural when parked
    m.rotateX(-1.0);
    p.rotateX(-1.0);
    return { metal: m, pedals: p };
  });
}

function buildBike(d: BikeDims, c: Colors): THREE.Group {
  const root = new THREE.Group();
  root.name = d.id;
  const key = `${d.id}|${Object.values(c).join(',')}`;
  root.add(staticPart(`${key}|frame`, () => bikeFrame(d, c)));
  const R = d.wheel.r;
  const wheels: WheelPart[] = [];

  // front: tilt group on the steering axis -> steer node -> fork assembly + spinning wheel
  const { tilt, steer, inv } = steerPivot(d.headBottom, d.headTop);
  const front = staticPart(`${key}|front`, () => bikeFront(d, c));
  front.applyMatrix4(inv);
  steer.add(front);
  const fw = bikeWheel(d.wheel);
  fw.position.set(0, R, d.zf).applyMatrix4(inv);
  steer.add(fw);
  root.add(tilt);
  wheels.push({ spin: fw, radius: R, steer });

  const rw = bikeWheel(d.wheel);
  rw.position.set(0, R, d.zr);
  root.add(rw);
  wheels.push({ spin: rw, radius: R });

  // crank set: turns with the distance travelled like a third "wheel" (one turn per ~4 m)
  const cg = crankGeos(d);
  const crank = new THREE.Group();
  crank.name = 'crank';
  crank.add(mesh(cg.metal, M.steel()), mesh(cg.pedals, M.rubber('#202124')));
  crank.position.set(0, d.bb[1], d.bb[0]);
  root.add(crank);
  wheels.push({ spin: crank, radius: d.kids ? 0.45 : 0.62 });

  root.userData.wheels = wheels;
  root.userData.crank = crank;
  return root;
}

function bikePlan(ctx: Ctx2D, d: BikeDims, c: Colors): void {
  const R = d.wheel.r;
  const tw = d.wheel.tire * 2 + 0.012;
  // wheels seen from above
  D.rr(ctx, 0, d.zr, tw, R * 2, tw / 2, '#4a4d52', INK, LINE_THIN);
  D.rr(ctx, 0, d.zf, tw, R * 2, tw / 2, '#4a4d52', INK, LINE_THIN);
  // frame, pedals, saddle, handlebar
  D.line(ctx, 0, d.zr, 0, d.headTop[0], tint(c.frame, 0.1), 0.035);
  D.line(ctx, 0, d.zr, 0, d.headTop[0], INK_SOFT, 0.006);
  D.line(ctx, -0.15, d.bb[0], 0.15, d.bb[0], INK, 0.014);
  for (const s of [1, -1]) D.rr(ctx, s * 0.15, d.bb[0] - s * 0.05, 0.08, 0.06, 0.012, '#5a5d62', INK, LINE_THIN);
  ctx.beginPath();
  ctx.moveTo(0, d.saddleZ + 0.15);
  ctx.quadraticCurveTo(0.09, d.saddleZ - 0.02, 0.085, d.saddleZ - 0.1);
  ctx.lineTo(-0.085, d.saddleZ - 0.1);
  ctx.quadraticCurveTo(-0.09, d.saddleZ - 0.02, 0, d.saddleZ + 0.15);
  ctx.closePath();
  ctx.fillStyle = tint(c.seat, 0.25);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-d.barHalf, d.barZ - (d.kids ? 0.02 : 0.1));
  ctx.quadraticCurveTo(-d.barHalf, d.headTop[0] + 0.04, 0, d.headTop[0] + 0.03);
  ctx.quadraticCurveTo(d.barHalf, d.headTop[0] + 0.04, d.barHalf, d.barZ - (d.kids ? 0.02 : 0.1));
  ctx.lineWidth = 0.022;
  ctx.stroke();
  if (d.kids) D.rr(ctx, 0, d.headTop[0] + 0.2, 0.28, 0.19, 0.04, tint(c.basket, 0.3), INK, LINE_THIN);
}

const CITY: BikeDims = {
  id: 'bicycle',
  wheel: { r: 0.34, tire: 0.019, spokes: 20 },
  zr: -0.54,
  zf: 0.54,
  bb: [-0.1, 0.28],
  crank: 0.165,
  seatTop: [-0.265, 0.8],
  saddleZ: -0.3,
  saddleY: 0.87,
  headBottom: [0.385, 0.82],
  headTop: [0.345, 0.93],
  barY: 1.04,
  barZ: 0.27,
  barHalf: 0.27,
  tube: 0.016,
  kids: false,
};

export const bicycle: FurnitureDef = {
  id: 'bicycle',
  name: 'אופניים',
  category: 'vehicle',
  size: { w: 0.6, d: 1.8, h: 1.08 },
  colors: [slot('frame', 'שלדה', '#1f7a8c'), slot('seat', 'מושב', '#5a3d2b')],
  noBake: true,
  vehicle: {
    kind: 'bicycle',
    maxSpeed: 7,
    acceleration: 2.5,
    wheelbase: 1.08,
    maxSteer: 0.6,
    radius: 0.45,
    rider: { x: 0, y: CITY.saddleY, z: CITY.saddleZ, pose: 'ride' },
    cameraDistance: 4,
    prompt: 'לרכוב על האופניים',
  },
  build: ({ colors: c }) => buildBike(CITY, c),
  draw2d: (ctx, c) => sym(ctx, () => bikePlan(ctx, CITY, c)),
};

const KIDS: BikeDims = {
  id: 'kids-bike',
  wheel: { r: 0.255, tire: 0.024, spokes: 16 },
  zr: -0.4,
  zf: 0.4,
  bb: [-0.08, 0.25],
  crank: 0.125,
  seatTop: [-0.205, 0.58],
  saddleZ: -0.24,
  saddleY: 0.66,
  headBottom: [0.268, 0.63],
  headTop: [0.232, 0.74],
  barY: 0.93,
  barZ: 0.2,
  barHalf: 0.26,
  tube: 0.017,
  kids: true,
};

export const kidsBike: FurnitureDef = {
  id: 'kids-bike',
  name: 'אופני ילדים',
  category: 'vehicle',
  size: { w: 0.56, d: 1.36, h: 0.97 },
  colors: [slot('frame', 'שלדה', '#e8437a'), slot('seat', 'מושב', '#ffffff'), slot('basket', 'סל', '#f6f1e4')],
  noBake: true,
  vehicle: {
    kind: 'bicycle',
    maxSpeed: 5,
    acceleration: 2.2,
    wheelbase: 0.8,
    maxSteer: 0.6,
    radius: 0.42,
    rider: { x: 0, y: KIDS.saddleY, z: KIDS.saddleZ, pose: 'ride' },
    cameraDistance: 4,
    prompt: 'לרכוב על האופניים',
  },
  build: ({ colors: c }) => buildBike(KIDS, c),
  draw2d: (ctx, c) => sym(ctx, () => bikePlan(ctx, KIDS, c)),
};

/* ================================================================== kick scooter */

const SC = { r: 0.1, zr: -0.37, zf: 0.37, deckY: 0.105, headBottom: [0.335, 0.17] as [number, number], headTop: [0.31, 0.35] as [number, number], barY: 1.0, barHalf: 0.21 };

function scooterWheelGeos(): { tire: THREE.BufferGeometry; hub: THREE.BufferGeometry } {
  return memo('scooterWheel', () => {
    const r = SC.r;
    const tire = latheX(
      [
        [r * 0.62, -0.014],
        [r * 0.9, -0.016],
        [r * 0.985, -0.011],
        [r, 0],
        [r * 0.985, 0.011],
        [r * 0.9, 0.016],
        [r * 0.62, 0.014],
      ],
      24,
    );
    const hubParts: THREE.BufferGeometry[] = [cylX(r * 0.63, 0.024, 20)];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      for (const s of [1, -1]) {
        const dot = cylX(0.012, 0.004, 8);
        dot.translate(s * 0.0125, Math.cos(a) * r * 0.4, Math.sin(a) * r * 0.4);
        hubParts.push(dot);
      }
    }
    hubParts.push(cylX(0.012, 0.05, 8));
    return { tire, hub: merge(hubParts) };
  });
}

function scooterWheel(c: Colors): THREE.Group {
  const g = scooterWheelGeos();
  const spin = new THREE.Group();
  spin.add(mesh(g.tire, M.plastic(c.wheels)), mesh(g.hub, M.steel()));
  return spin;
}

function scooterFrame(c: Colors): THREE.Object3D {
  const k = new Kit();
  const paint = VM.enamel(c.frame);
  const steel = M.steel();
  const black = M.rubber('#202124');
  // deck with grip tape
  k.slab(roundedRectShape(0.125, 0.5, 0.045), 0.028, paint, 0, SC.deckY - 0.03, -0.06, 0.006, 6);
  k.slab(roundedRectShape(0.1, 0.44, 0.035), 0.004, black, 0, SC.deckY - 0.004, -0.06, 0, 6);
  // tail: two plates holding the rear wheel, with a mudguard that doubles as the brake
  for (const s of [1, -1]) k.beam([s * 0.03, SC.deckY - 0.016, -0.28], [s * 0.03, SC.r, SC.zr], 0.006, 0.04, paint, 0.002);
  k.geo(
    memo('scooterFender', () => arcBandGeo(SC.r + 0.012, SC.r + 0.018, 0.9, 3.0, 0.05, 12)),
    paint,
    0,
    SC.r,
    SC.zr,
  );
  // neck rising from the deck to the head tube
  k.beam([0, SC.deckY - 0.016, 0.16], [0, 0.25, 0.305], 0.04, 0.035, paint, 0.01);
  k.rod([0, SC.headBottom[1], SC.headBottom[0]], [0, SC.headTop[1], SC.headTop[0]], 0.024, paint, 0.024, 12);
  void steel;
  return k.g;
}

function scooterFront(c: Colors): THREE.Object3D {
  const k = new Kit();
  const paint = VM.enamel(c.frame);
  const steel = M.steel();
  const black = M.rubber('#202124');
  const ax = new THREE.Vector2(SC.headTop[0] - SC.headBottom[0], SC.headTop[1] - SC.headBottom[1]).normalize();
  const along = (f: number): V3 => [0, SC.headBottom[1] + ax.y * f, SC.headBottom[0] + ax.x * f];
  // fork
  const crown = along(-0.012);
  k.geo(cylX(0.02, 0.07, 10), paint, 0, crown[1], crown[2]);
  for (const s of [1, -1]) k.beam([s * 0.029, crown[1], crown[2]], [s * 0.029, SC.r, SC.zf], 0.006, 0.036, paint, 0.002);
  // steering column, clamp and T-bar with grips
  const len = (SC.barY - 0.012 - SC.headBottom[1]) / ax.y;
  const top = along(len);
  k.rod(along(0.17), top, 0.017, steel, 0.017, 10);
  k.rod(along(0.19), along(0.25), 0.023, black, 0.023, 10);
  k.rod([-SC.barHalf, top[1], top[2]], [SC.barHalf, top[1], top[2]], 0.012, steel, 0.012, 8);
  for (const s of [1, -1]) k.rod([s * (SC.barHalf - 0.11), top[1], top[2]], [s * (SC.barHalf + 0.005), top[1], top[2]], 0.017, M.rubber(c.wheels), 0.017, 10);
  k.rod([0, top[1], top[2] - 0.02], [0, top[1], top[2] + 0.02], 0.02, black, 0.02, 8);
  return k.g;
}

function buildScooter(c: Colors): THREE.Group {
  const root = new THREE.Group();
  root.name = 'kick-scooter';
  const key = `kick-scooter|${Object.values(c).join(',')}`;
  root.add(staticPart(`${key}|frame`, () => scooterFrame(c)));
  const { tilt, steer, inv } = steerPivot(SC.headBottom, SC.headTop);
  const front = staticPart(`${key}|front`, () => scooterFront(c));
  front.applyMatrix4(inv);
  steer.add(front);
  const fw = scooterWheel(c);
  fw.position.set(0, SC.r, SC.zf).applyMatrix4(inv);
  steer.add(fw);
  root.add(tilt);
  const rw = scooterWheel(c);
  rw.position.set(0, SC.r, SC.zr);
  root.add(rw);
  root.userData.wheels = [
    { spin: fw, radius: SC.r, steer },
    { spin: rw, radius: SC.r },
  ] satisfies WheelPart[];
  return root;
}

export const kickScooter: FurnitureDef = {
  id: 'kick-scooter',
  name: 'קורקינט',
  category: 'vehicle',
  size: { w: 0.46, d: 0.98, h: 1.02 },
  colors: [slot('frame', 'צבע', '#17a3b3'), slot('wheels', 'גלגלים', '#ff7a1a')],
  noBake: true,
  vehicle: {
    kind: 'scooter',
    maxSpeed: 5,
    acceleration: 2.5,
    wheelbase: 0.74,
    maxSteer: 0.6,
    radius: 0.4,
    rider: { x: 0, y: SC.deckY, z: -0.03, pose: 'stand' },
    cameraDistance: 4,
    prompt: 'לעלות על הקורקינט',
  },
  build: ({ colors: c }) => buildScooter(c),
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, SC.zr, 0.04, 0.2, 0.02, tint(c.wheels, 0.15), INK, LINE_THIN);
      D.rr(ctx, 0, SC.zf, 0.04, 0.2, 0.02, tint(c.wheels, 0.15), INK, LINE_THIN);
      D.rr(ctx, 0, -0.06, 0.13, 0.5, 0.045, tint(c.frame, 0.25));
      D.rr(ctx, 0, -0.06, 0.09, 0.42, 0.03, '#6a6d72', null);
      D.line(ctx, 0, 0.18, 0, 0.32, tint(c.frame, 0.1), 0.04);
      D.line(ctx, -SC.barHalf, 0.2, SC.barHalf, 0.2, INK, 0.026);
      for (const s of [1, -1]) D.line(ctx, s * (SC.barHalf - 0.1), 0.2, s * SC.barHalf, 0.2, tint(c.wheels, 0.1), 0.034);
      D.circle(ctx, 0, 0.2, 0.025, '#d9dbde', INK, LINE_THIN);
    }),
};
