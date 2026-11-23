import * as THREE from 'three';
import type { FurnitureDef, RideRuntime } from '../types';
import { D, INK_SOFT, Kit, LINE_THIN, M, PAL, darken, extrudeZ, lighten, roundedRectShape, sym, tint, type V3 } from '../kit';
import { BALLS } from './_balls';
import { slot } from './_parts';
import { Rocker, Spinner, Teeter, bakedPart, partKey, push01, seatNode, substeps } from './_ride';
import { axisCyl, canvasMat, coilGeo, extrudeX, faceGeo, netMat, planarUV, polyShape, speckleMat, sweepYZ } from './_street_shared';

/** Playground equipment and sports items for parks and school yards. */

type Colors = Record<string, string>;

const DECK_GREY = '#5a6068';

/* ------------------------------------------------------------------ slide */

const SL = { w: 0.92, d: 3.28, h: 2.15, deckY: 1.25, z0: -1.08, z1: -0.46, px: 0.38 };

function slidePath(): Array<[number, number]> {
  const c = new THREE.CatmullRomCurve3(
    (
      [
        [-0.5, 1.275],
        [-0.3, 1.27],
        [-0.05, 1.17],
        [0.45, 0.8],
        [0.95, 0.43],
        [1.25, 0.31],
        [1.62, 0.29],
      ] as Array<[number, number]>
    ).map(([z, y]) => new THREE.Vector3(0, y, z)),
    false,
    'catmullrom',
    0.5,
  );
  return c.getPoints(18).map((p) => [p.z, p.y] as [number, number]);
}

/** z of the ladder's foot and of step i (1…4): the steps climb to the deck edge */
const SL_LADDER_Z = SL.z0 - 0.52;
const slStep = (i: number): { y: number; z: number } => ({ y: (SL.deckY * i) / 5, z: SL_LADDER_Z + ((SL.z0 - 0.03 - SL_LADDER_Z) * i) / 5 });

/**
 * The way of a child over the slide: ground at the ladder → the four steps → across the deck →
 * (from `slideFrom`) down the bed of the chute → landing on the ground 0.4 m past its lip.
 */
const SLIDE_ROUTE = ((): { path: Array<{ x: number; y: number; z: number }>; slideFrom: number } => {
  const path: Array<{ x: number; y: number; z: number }> = [{ x: 0, y: 0, z: SL_LADDER_Z - 0.02 }];
  for (let i = 1; i <= 4; i++) path.push({ x: 0, y: +(slStep(i).y + 0.015).toFixed(4), z: +slStep(i).z.toFixed(4) });
  path.push({ x: 0, y: SL.deckY, z: SL.z0 + 0.04 }, { x: 0, y: SL.deckY, z: SL.z1 - 0.16 });
  const slideFrom = path.length;
  // the sweep path of the chute is its bed surface: take every second cross-section
  const bed = slidePath();
  for (let i = 0; i < bed.length; i += 2) path.push({ x: 0, y: +bed[i][1].toFixed(4), z: +bed[i][0].toFixed(4) });
  const end = bed[bed.length - 1];
  path.push({ x: 0, y: 0, z: +(end[0] + 0.4).toFixed(4) });
  return { path, slideFrom };
})();

const slide: FurnitureDef = {
  id: 'slide',
  name: 'מגלשה',
  category: 'playground',
  size: { w: SL.w, d: SL.d, h: SL.h },
  colors: [slot('slide', 'מגלשה', '#f2b824'), slot('frame', 'מסגרת', '#2f6fb7'), slot('panel', 'לוחות', '#e0483e')],
  slide: SLIDE_ROUTE,
  build: ({ colors: c }) => {
    const k = new Kit();
    const { deckY, z0, z1, px } = SL;
    const frame = M.metal(c.frame, 0.45, 0.35);
    const chute = M.plastic(c.slide);
    const panel = M.plastic(c.panel);
    const grey = M.plastic(DECK_GREY);
    const pr = 0.032;
    const top = 2.02;
    // tower: four posts, deck, guard panels
    for (const s of [-1, 1]) {
      for (const z of [z0, z1]) {
        k.cyl(pr, top, frame, s * px, 0, z, pr, 10);
        k.sphere(pr * 1.3, grey, s * px, top, z, 1, 0.7, 1, 10);
        k.cyl(0.07, 0.012, frame, s * px, 0, z, 0.07, 12);
      }
      k.rod([s * px, top - 0.1, z0], [s * px, top - 0.1, z1], 0.022, frame, 0.022, 8);
      // side panel with round peep holes
      const sh = roundedRectShape(z1 - z0 - 0.1, 0.62, 0.05, 0, 0.31);
      for (const hz of [-0.14, 0.14]) {
        const hole = new THREE.Path();
        hole.absarc(hz, 0.34, 0.085, 0, Math.PI * 2, true);
        sh.holes.push(hole);
      }
      k.geo(extrudeX(sh, 0.022, 0, 7), panel, s * px, deckY + 0.06, (z0 + z1) / 2);
    }
    k.rbox(px * 2 + 0.06, 0.05, z1 - z0 + 0.06, 0.012, grey, 0, deckY - 0.05, (z0 + z1) / 2, 1);
    // arch over the chute entry
    k.tube(
      [
        [-px, top - 0.35, z1],
        [-px, top - 0.12, z1],
        [-px * 0.6, top + 0.06, z1],
        [0, top + 0.1, z1],
        [px * 0.6, top + 0.06, z1],
        [px, top - 0.12, z1],
        [px, top - 0.35, z1],
      ],
      0.022,
      frame,
      { seg: 20, radial: 8 },
    );
    // ladder: stringers that become hand rails, flat steps
    const lz = SL_LADDER_Z;
    for (const s of [-1, 1]) {
      k.tube(
        [
          [s * 0.3, 0.03, lz],
          [s * 0.3, deckY * 0.5, (lz + z0) / 2 + 0.0],
          [s * 0.3, deckY, z0 - 0.03],
          [s * 0.33, deckY + 0.55, z0 - 0.02],
          [s * px, deckY + 0.72, z0],
        ],
        0.024,
        frame,
        { seg: 14, radial: 6, tension: 0.3 },
      );
    }
    for (let i = 1; i <= 4; i++) k.rbox(0.6, 0.03, 0.13, 0.008, grey, 0, slStep(i).y - 0.015, slStep(i).z, 1);
    // chute
    const prof: Array<[number, number]> = [
      [-0.33, 0.17],
      [-0.33, 0.0],
      [-0.29, -0.03],
      [0.29, -0.03],
      [0.33, 0.0],
      [0.33, 0.17],
      [0.3, 0.17],
      [0.3, 0.02],
      [0.275, 0.0],
      [-0.275, 0.0],
      [-0.3, 0.02],
      [-0.3, 0.17],
    ];
    k.geo(sweepYZ(prof, slidePath()), chute);
    // supports under the run-out
    for (const [z, y] of [
      [0.72, 0.56],
      [1.4, 0.26],
    ]) {
      for (const s of [-1, 1]) k.cyl(0.024, y, frame, s * 0.25, 0, z, 0.024, 8);
      k.rod([-0.25, y - 0.02, z], [0.25, y - 0.02, z], 0.02, frame, 0.02, 8);
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { z0, z1, px } = SL;
      const lz = z0 - 0.52;
      // ladder
      for (const s of [-1, 1]) D.line(ctx, s * 0.3, lz, s * 0.3, z0, INK_SOFT, 0.03);
      for (let i = 1; i <= 4; i++) D.line(ctx, -0.3, lz + ((z0 - lz) * i) / 5, 0.3, lz + ((z0 - lz) * i) / 5, INK_SOFT, 0.02);
      // chute with flow arrow
      D.box(ctx, -0.33, z1 - 0.04, 0.33, 1.62, 0.04, tint(c.slide, 0.3));
      D.box(ctx, -0.275, z1 - 0.04, 0.275, 1.6, 0.02, tint(c.slide, 0.55), INK_SOFT, LINE_THIN);
      D.line(ctx, 0, -0.2, 0, 1.25, INK_SOFT, 0.012);
      D.poly(
        ctx,
        [
          [-0.09, 1.1],
          [0, 1.3],
          [0.09, 1.1],
        ],
        false,
        null,
        INK_SOFT,
        0.012,
      );
      // deck
      D.box(ctx, -px - 0.03, z0 - 0.03, px + 0.03, z1 + 0.03, 0.02, tint(DECK_GREY, 0.6));
      for (const s of [-1, 1]) {
        D.line(ctx, s * px, z0, s * px, z1, tint(c.panel, 0.1), 0.03);
        for (const z of [z0, z1]) D.circle(ctx, s * px, z, 0.04, tint(c.frame, 0.3), undefined, LINE_THIN);
      }
    }),
};

/* ------------------------------------------------------------------ seesaw */

const SEE = { w: 3.0, d: 0.58, h: 0.96, beamY: 0.5, seatX: 1.24, seatY: 0.62, tyreX: 1.21, tyreR: 0.14, tyreT: 0.055 };
/** the beam turns on the axle through its middle */
const SEE_PIVOT_Y = SEE.beamY + 0.035;
/** tilt at which the underside of the beam lands on a tyre bumper (sunk 4 mm into the rubber), ≈ 14° */
const SEE_MAX = ((): number => {
  const gap = SEE.tyreR + SEE.tyreT - 0.004 + (SEE_PIVOT_Y - SEE.beamY);
  let lo = 0;
  let hi = 0.5;
  for (let i = 0; i < 40; i++) {
    const m = (lo + hi) / 2;
    if (SEE_PIVOT_Y * Math.cos(m) - SEE.tyreX * Math.sin(m) > gap) lo = m;
    else hi = m;
  }
  return lo;
})();

/** pivot stand + tyre bumpers (never move) */
function seesawBase(c: Colors): THREE.Object3D {
  const k = new Kit();
  const { beamY } = SEE;
  const frame = M.metal(c.frame, 0.45, 0.35);
  // two hoops and an axle
  for (const s of [-1, 1]) {
    const z = s * 0.14;
    k.tube(
      [
        [-0.3, 0.02, z * 1.6],
        [-0.2, beamY * 0.75, z],
        [0, beamY + 0.02, z],
        [0.2, beamY * 0.75, z],
        [0.3, 0.02, z * 1.6],
      ],
      0.028,
      frame,
      { seg: 16, radial: 8, tension: 0.4 },
    );
    for (const sx of [-1, 1]) k.cyl(0.06, 0.012, frame, sx * 0.3, 0, z * 1.6, 0.06, 10);
  }
  axisCyl(k, 0.03, 0.36, M.steel(), 0, SEE_PIVOT_Y, 0, 'z', 0.03, 12);
  // half-buried tyre bumpers under the seats
  for (const s of [-1, 1]) k.geo(new THREE.TorusGeometry(SEE.tyreR, SEE.tyreT, 8, 14, Math.PI), M.rubber('#2b2c2e'), s * SEE.tyreX, 0, 0);
  return k.g;
}

/** beam with seats and grab hoops, built around the pivot (origin = axle center) */
function seesawBeam(c: Colors): THREE.Object3D {
  const k = new Kit();
  const { seatX } = SEE;
  const by = SEE.beamY - SEE_PIVOT_Y; // underside of the beam
  const beam = M.paint(c.beam, 0.4);
  const seat = M.plastic(c.seat);
  const steel = M.steel();
  k.rbox(SEE.w - 0.06, 0.07, 0.15, 0.02, beam, 0, by, 0, 2);
  // bearing blocks hugging the axle
  for (const s of [-1, 1]) k.rbox(0.12, 0.085, 0.02, 0.006, steel, 0, by - 0.0075, s * 0.085, 1);
  for (const s of [-1, 1]) {
    // moulded seat with a low back
    k.rbox(0.36, SEE.seatY - SEE.beamY - 0.07, 0.32, 0.02, seat, s * seatX, by + 0.07, 0, 2);
    const back = k.rbox(0.05, 0.2, 0.3, 0.02, seat, s * (seatX + 0.2), by + 0.08, 0, 2);
    back.rotation.z = -s * 0.2;
    // grab hoop
    const hx = s * (seatX - 0.3);
    k.tube(
      [
        [hx, by + 0.04, -0.045],
        [hx, by + 0.2, -0.06],
        [hx, by + 0.36, -0.13],
        [hx, by + 0.43, -0.07],
        [hx, by + 0.44, 0],
        [hx, by + 0.43, 0.07],
        [hx, by + 0.36, 0.13],
        [hx, by + 0.2, 0.06],
        [hx, by + 0.04, 0.045],
      ],
      0.016,
      steel,
      { seg: 24, radial: 6 },
    );
  }
  return k.g;
}

const seesaw: FurnitureDef = {
  id: 'seesaw',
  name: 'נדנדת עלה ורד',
  category: 'playground',
  size: { w: SEE.w, d: SEE.d, h: SEE.h },
  colors: [slot('beam', 'קורה', '#e0483e'), slot('seat', 'מושבים', '#f2b824'), slot('frame', 'בסיס', '#2f6fb7')],
  seats: [
    { x: -SEE.seatX, z: 0, height: SEE.seatY, facing: Math.PI / 2, kind: 'sit' },
    { x: SEE.seatX, z: 0, height: SEE.seatY, facing: -Math.PI / 2, kind: 'sit' },
  ],
  noBake: true,
  ride: { kind: 'seesaw', prompt: 'להתנדנד בנדנדה' },
  build: ({ colors: c }) => {
    const root = new THREE.Group();
    root.add(bakedPart(partKey('seesaw-base', c, ['frame']), () => seesawBase(c)));
    // the beam tilts around Z: rotation.z > 0 lifts the +X end
    const pivot = new THREE.Group();
    pivot.name = 'beam';
    pivot.position.set(0, SEE_PIVOT_Y, 0);
    pivot.add(bakedPart(partKey('seesaw-beam', c, ['beam', 'seat']), () => seesawBeam(c)));
    root.add(pivot);
    const sy = SEE.seatY - SEE_PIVOT_Y;
    const seatNodes = [seatNode(pivot, -SEE.seatX, sy, 0, Math.PI / 2), seatNode(pivot, SEE.seatX, sy, 0, -Math.PI / 2)];
    const body = new Teeter(SEE_MAX);
    const ride: RideRuntime = {
      seatNodes,
      update(dt, push, riders) {
        const p = push01(push);
        const left = riders.includes(0);
        const right = riders.includes(1);
        const [n, h] = substeps(dt);
        for (let i = 0; i < n; i++) body.step(h, p, left, right);
        pivot.rotation.z = body.theta;
        return body.moving;
      },
    };
    root.userData.ride = ride;
    return root;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { seatX } = SEE;
      for (const s of [-1, 1]) D.line(ctx, -0.3, s * 0.22, 0.3, s * 0.22, INK_SOFT, 0.04);
      D.rr(ctx, 0, 0, SEE.w - 0.06, 0.15, 0.03, tint(c.beam, 0.4));
      D.line(ctx, 0, -0.18, 0, 0.18, undefined, 0.04);
      for (const s of [-1, 1]) {
        D.rr(ctx, s * seatX, 0, 0.36, 0.32, 0.05, tint(c.seat, 0.35));
        D.rr(ctx, s * (seatX + 0.2), 0, 0.06, 0.3, 0.02, tint(c.seat, 0.15), undefined, LINE_THIN);
        D.line(ctx, s * (seatX - 0.3), -0.14, s * (seatX - 0.3), 0.14, undefined, 0.025);
      }
    }),
};

/* ------------------------------------------------------------------ carousel */

const CAR = { R: 1.08, deckY: 0.2, h: 1.12, seatR: 0.66, seatY: 0.52 };

/** ground hub + fixed centre post with the hand wheel the riders pull on (never move) */
function carouselHub(c: Colors): THREE.Object3D {
  const k = new Kit();
  const { deckY } = CAR;
  const rails = M.metal(c.rails, 0.45, 0.35);
  k.cyl(0.24, deckY - 0.06, M.metal('#3a3d42', 0.6, 0.5), 0, 0, 0, 0.3, 20);
  k.cyl(0.05, 0.86 + 0.06, rails, 0, deckY - 0.06, 0, 0.05, 14);
  k.ring(0.2, 0.018, rails, 0, deckY + 0.78, 0, 24);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    k.rod([0, deckY + 0.78, 0], [Math.cos(a) * 0.2, deckY + 0.78, Math.sin(a) * 0.2], 0.012, rails, 0.012, 6);
  }
  k.sphere(0.06, M.paint(c.b, 0.4), 0, deckY + 0.86, 0, 1, 0.8, 1, 12);
  return k.g;
}

/** the turning part: deck, grab rails on a collar around the post, seats (origin on the axis, on the ground) */
function carouselDeck(c: Colors): THREE.Object3D {
  const k = new Kit();
  const { R, deckY } = CAR;
  const rails = M.metal(c.rails, 0.45, 0.35);
  const steel = M.metal('#8d9399', 0.5, 0.8);
  // deck with coloured sectors and a steel rim
  k.cyl(R - 0.01, 0.05, steel, 0, deckY - 0.06, 0, R - 0.01, 32);
  k.ring(R - 0.02, 0.022, steel, 0, deckY - 0.02, 0, 32);
  const cols = [M.paint(c.a, 0.6), M.paint(c.b, 0.6)];
  for (let i = 0; i < 8; i++) {
    const g = new THREE.CylinderGeometry(R - 0.045, R - 0.045, 0.012, 6, 1, false, (i / 8) * Math.PI * 2 + Math.PI / 8, Math.PI / 4);
    k.geo(g, cols[i % 2], 0, deckY - 0.004, 0);
  }
  // bearing collars around the fixed post
  k.cyl(0.085, 0.03, steel, 0, deckY + 0.002, 0, 0.07, 16);
  k.cyl(0.068, 0.07, steel, 0, deckY + 0.585, 0, 0.068, 16);
  // four radial grab rails
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const p = (rad: number, y: number): V3 => [Math.cos(a) * rad, y, Math.sin(a) * rad];
    k.tube([p(0.06, deckY + 0.62), p(0.45, deckY + 0.68), p(R - 0.2, deckY + 0.64), p(R - 0.08, deckY + 0.5), p(R - 0.07, deckY)], 0.022, rails, { seg: 14, radial: 6, tension: 0.4 });
  }
  // four curved seats between the rails
  const seatShape = new THREE.Shape();
  seatShape.absarc(0, 0, 0.86, -0.52, 0.52, false);
  seatShape.absarc(0, 0, 0.48, 0.52, -0.52, true);
  seatShape.closePath();
  const seatH = 0.045;
  const legH = CAR.seatY - seatH - deckY + 0.005;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const m = k.slab(seatShape, seatH, M.plastic(i % 2 ? c.a : c.b), 0, CAR.seatY - seatH, 0, 0.01, 5);
    m.rotation.y = -a;
    for (const da of [-0.3, 0.3]) k.cyl(0.02, legH, steel, Math.cos(a + da) * 0.67, deckY, Math.sin(a + da) * 0.67, 0.02, 8);
  }
  return k.g;
}

const carousel: FurnitureDef = {
  id: 'carousel',
  name: 'קרוסלה',
  category: 'playground',
  size: { w: CAR.R * 2, d: CAR.R * 2, h: CAR.h },
  colors: [slot('a', 'צבע ראשי', '#e0483e'), slot('b', 'צבע משני', '#f2b824'), slot('rails', 'מעקות', '#2f6fb7')],
  seats: [0, 1, 2, 3].map((i) => {
    const a = (i / 4) * Math.PI * 2;
    return { x: +(Math.cos(a) * CAR.seatR).toFixed(3), z: +(Math.sin(a) * CAR.seatR).toFixed(3), height: CAR.seatY, facing: Math.atan2(Math.cos(a), Math.sin(a)), kind: 'sit' as const };
  }),
  noBake: true,
  ride: { kind: 'spin', prompt: 'להסתובב בקרוסלה' },
  build: ({ colors: c }) => {
    const root = new THREE.Group();
    root.add(bakedPart(partKey('carousel-hub', c, ['b', 'rails']), () => carouselHub(c)));
    // everything the riders stand / sit on turns around the vertical axis
    const deck = new THREE.Group();
    deck.name = 'deck';
    deck.add(bakedPart(partKey('carousel-deck', c, ['a', 'b', 'rails']), () => carouselDeck(c)));
    root.add(deck);
    const seatNodes = [0, 1, 2, 3].map((i) => {
      const a = (i / 4) * Math.PI * 2;
      return seatNode(deck, Math.cos(a) * CAR.seatR, CAR.seatY, Math.sin(a) * CAR.seatR, Math.atan2(Math.cos(a), Math.sin(a)));
    });
    const body = new Spinner(1.6);
    const ride: RideRuntime = {
      seatNodes,
      update(dt, push) {
        const p = push01(push);
        const [n, h] = substeps(dt);
        for (let i = 0; i < n; i++) body.step(h, p);
        deck.rotation.y = body.angle;
        return body.moving;
      },
    };
    root.userData.ride = ride;
    return root;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { R } = CAR;
      for (let i = 0; i < 8; i++) {
        const a0 = (i / 8) * Math.PI * 2 + Math.PI / 8;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, R - 0.03, a0, a0 + Math.PI / 4);
        ctx.closePath();
        ctx.fillStyle = tint(i % 2 ? c.b : c.a, 0.45);
        ctx.fill();
      }
      D.circle(ctx, 0, 0, R - 0.02, null);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(0, 0, 0.86, a - 0.52, a + 0.52);
        ctx.arc(0, 0, 0.48, a + 0.52, a - 0.52, true);
        ctx.closePath();
        ctx.fillStyle = tint(i % 2 ? c.a : c.b, 0.2);
        ctx.fill();
        ctx.lineWidth = LINE_THIN;
        ctx.stroke();
        const b = a + Math.PI / 4;
        D.line(ctx, 0, 0, Math.cos(b) * (R - 0.07), Math.sin(b) * (R - 0.07), tint(c.rails, 0.1), 0.03);
      }
      D.circle(ctx, 0, 0, 0.2, '#ffffff', tint(c.rails, 0.1), 0.02);
    }),
};

/* ------------------------------------------------------------------ climbing dome */

const DOME = { R: 1.4, tube: 0.024 };

let domeCache: { verts: THREE.Vector3[]; edges: Array<[number, number]> } | null = null;

/** 2V geodesic hemisphere: unit vertices (y >= 0) and the struts between them. */
function domeGraph(): { verts: THREE.Vector3[]; edges: Array<[number, number]> } {
  if (domeCache) return domeCache;
  const g = new THREE.IcosahedronGeometry(1, 1);
  const t = (1 + Math.sqrt(5)) / 2;
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(-1, t, 0).normalize(), new THREE.Vector3(0, 1, 0));
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const verts: THREE.Vector3[] = [];
  const index = new Map<string, number>();
  const idOf = (i: number): number => {
    const v = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)).applyQuaternion(q).normalize();
    const key = `${Math.round(v.x * 500)},${Math.round(v.y * 500)},${Math.round(v.z * 500)}`;
    let id = index.get(key);
    if (id === undefined) {
      id = verts.length;
      verts.push(v);
      index.set(key, id);
    }
    return id;
  };
  const edgeSet = new Set<string>();
  const edges: Array<[number, number]> = [];
  for (let i = 0; i < p.count; i += 3) {
    const tri = [idOf(i), idOf(i + 1), idOf(i + 2)];
    for (let e = 0; e < 3; e++) {
      const a = Math.min(tri[e], tri[(e + 1) % 3]);
      const b = Math.max(tri[e], tri[(e + 1) % 3]);
      if (verts[a].y < -0.01 || verts[b].y < -0.01) continue;
      const key = `${a}-${b}`;
      if (!edgeSet.has(key)) {
        edgeSet.add(key);
        edges.push([a, b]);
      }
    }
  }
  domeCache = { verts, edges };
  return domeCache;
}

const climbingFrame: FurnitureDef = {
  id: 'climbing-frame',
  name: 'כיפת טיפוס',
  category: 'playground',
  size: { w: DOME.R * 2 + 0.04, d: DOME.R * 2 + 0.16, h: DOME.R + 0.1 },
  colors: [slot('frame', 'מוטות', '#2f8fd0'), slot('joints', 'מחברים', '#f2b824')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { R, tube } = DOME;
    const frame = M.metal(c.frame, 0.4, 0.4);
    const joint = M.plastic(c.joints);
    const { verts, edges } = domeGraph();
    const P = (v: THREE.Vector3): V3 => [v.x * R, Math.max(0, v.y) * R + 0.047, v.z * R];
    for (const [a, b] of edges) k.rod(P(verts[a]), P(verts[b]), tube, frame, tube, 6);
    verts.forEach((v) => {
      if (v.y < -0.01) return;
      const [x, y, z] = P(v);
      if (v.y < 0.01) k.cyl(0.07, 0.014, joint, x, 0, z, 0.07, 10);
      k.sphere(0.047, joint, x, y, z, 1, 1, 1, 8);
    });
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { R } = DOME;
      const { verts, edges } = domeGraph();
      D.circle(ctx, 0, 0, R + 0.02, tint(c.frame, 0.85) + '90', null);
      for (const [a, b] of edges) D.line(ctx, verts[a].x * R, verts[a].z * R, verts[b].x * R, verts[b].z * R, tint(c.frame, 0.1), 0.03);
      verts.forEach((v) => {
        if (v.y >= -0.01) D.circle(ctx, v.x * R, v.z * R, 0.05, tint(c.joints, 0.2), undefined, 0.008);
      });
    }),
};

/* ------------------------------------------------------------------ spring rider */

function horseShape(): THREE.Shape {
  const pts: Array<[number, number]> = [
    [-0.3, 0.42],
    [-0.4, 0.5],
    [-0.47, 0.6],
    [-0.4, 0.69],
    [-0.22, 0.665],
    [-0.02, 0.65],
    [0.09, 0.74],
    [0.15, 0.9],
    [0.23, 0.975],
    [0.33, 0.93],
    [0.44, 0.81],
    [0.47, 0.74],
    [0.39, 0.7],
    [0.29, 0.73],
    [0.25, 0.61],
    [0.27, 0.49],
    [0.18, 0.42],
    [-0.06, 0.4],
  ];
  const curve = new THREE.CatmullRomCurve3(
    pts.map(([z, y]) => new THREE.Vector3(z, y, 0)),
    true,
    'catmullrom',
    0.5,
  );
  return new THREE.Shape(curve.getPoints(72).map((p) => new THREE.Vector2(p.x, p.y)));
}

/** the body rocks about the top of the ground plate; the coil spring bends between the two */
const SPR = { pivotY: 0.02, coilY: 0.015, coilH: 0.4, seatY: 0.66, seatZ: -0.13 };

/** ground plate (never moves) */
function springBase(): THREE.Object3D {
  const k = new Kit();
  k.cyl(0.17, SPR.pivotY, M.metal('#3a3d42', 0.5, 0.7), 0, 0, 0, 0.17, 18);
  return k.g;
}

/** animal + seat + handles, in item coordinates (the caller shifts it onto the pivot) */
function springBody(c: Colors): THREE.Object3D {
  const k = new Kit();
  const body = M.plastic(c.body);
  const seat = M.plastic(c.seat);
  const steel = M.metal('#3a3d42', 0.5, 0.7);
  // saddle bracket on top of the spring
  k.box(0.2, 0.03, 0.26, steel, 0, 0.405, 0);
  // two silhouette panels
  const panel = extrudeX(horseShape(), 0.022, 0.004, 4);
  for (const s of [-1, 1]) {
    k.geo(panel, body, s * 0.125, 0, 0);
    // eye, nostril, mane stripe
    axisCyl(k, 0.026, 0.004, M.paint('#ffffff', 0.4), s * 0.139, 0.875, 0.31, 'x', 0.026, 12);
    axisCyl(k, 0.013, 0.004, M.paint('#1c1d20', 0.4), s * 0.142, 0.875, 0.317, 'x', 0.013, 10);
    axisCyl(k, 0.009, 0.004, M.paint('#1c1d20', 0.4), s * 0.139, 0.77, 0.43, 'x', 0.009, 8);
  }
  // seat, spacer blocks
  k.rbox(0.23, 0.035, 0.34, 0.012, seat, 0, 0.625, -0.14, 1);
  k.rbox(0.23, 0.16, 0.03, 0.01, seat, 0, 0.56, -0.345, 1);
  k.box(0.23, 0.2, 0.3, M.plastic(darken(c.body, 0.25)), 0, 0.435, 0);
  // handle bar + foot rests with grips
  const grip = M.rubber('#26272a');
  axisCyl(k, 0.014, 0.5, steel, 0, 0.83, 0.21, 'x', 0.014, 8);
  axisCyl(k, 0.014, 0.52, steel, 0, 0.46, 0.1, 'x', 0.014, 8);
  for (const s of [-1, 1]) {
    axisCyl(k, 0.021, 0.1, grip, s * 0.215, 0.83, 0.21, 'x', 0.021, 8);
    axisCyl(k, 0.024, 0.1, grip, s * 0.22, 0.46, 0.1, 'x', 0.024, 8);
  }
  return k.g;
}

let springCoil: { geo: THREE.BufferGeometry; pos: Float32Array; nor: Float32Array; t: Float32Array } | null = null;

/** rest shape of the coil (item coordinates) + per-vertex bend weight: 0 at the plate, 1 at the bracket */
function coilRest(): NonNullable<typeof springCoil> {
  if (!springCoil) {
    const geo = coilGeo(0.085, 0.016, 5, SPR.coilH);
    geo.translate(0, SPR.coilY, 0);
    const pos = (geo.getAttribute('position').array as Float32Array).slice();
    const nor = (geo.getAttribute('normal').array as Float32Array).slice();
    const t = new Float32Array(pos.length / 3);
    for (let i = 0; i < t.length; i++) {
      const u = Math.min(1, Math.max(0, (pos[i * 3 + 1] - SPR.coilY - 0.03) / (SPR.coilH - 0.06)));
      t[i] = u * u * (3 - 2 * u);
    }
    springCoil = { geo, pos, nor, t };
  }
  return springCoil;
}

/** Bend a coil instance so that its top follows the body (rotation `pitch` about X, then `roll` about Z, around the pivot). */
function bendCoil(geo: THREE.BufferGeometry, pitch: number, roll: number): void {
  const { pos, nor, t } = coilRest();
  const p = geo.getAttribute('position') as THREE.BufferAttribute;
  const nm = geo.getAttribute('normal') as THREE.BufferAttribute;
  const pa = p.array as Float32Array;
  const na = nm.array as Float32Array;
  const py = SPR.pivotY;
  for (let i = 0; i < t.length; i++) {
    const j = i * 3;
    // same order as Euler XYZ (matrix = Rx · Rz): roll first, then pitch
    const cz = Math.cos(roll * t[i]);
    const sz = Math.sin(roll * t[i]);
    const cx = Math.cos(pitch * t[i]);
    const sx = Math.sin(pitch * t[i]);
    // position (relative to the pivot)
    let x = pos[j];
    let y = pos[j + 1] - py;
    let z = pos[j + 2];
    let y1 = x * sz + y * cz;
    pa[j] = x * cz - y * sz;
    pa[j + 1] = y1 * cx - z * sx + py;
    pa[j + 2] = y1 * sx + z * cx;
    // normal
    x = nor[j];
    y = nor[j + 1];
    z = nor[j + 2];
    y1 = x * sz + y * cz;
    na[j] = x * cz - y * sz;
    na[j + 1] = y1 * cx - z * sx;
    na[j + 2] = y1 * sx + z * cx;
  }
  p.needsUpdate = true;
  nm.needsUpdate = true;
  geo.computeBoundingSphere();
}

const springRider: FurnitureDef = {
  id: 'spring-rider',
  name: 'סוס קפיץ',
  category: 'playground',
  size: { w: 0.56, d: 0.98, h: 0.99 },
  colors: [slot('body', 'גוף', '#e0483e'), slot('seat', 'מושב', '#f2b824')],
  seats: [{ x: 0, z: SPR.seatZ, height: SPR.seatY, facing: 0, kind: 'sit' }],
  noBake: true,
  ride: { kind: 'rock', prompt: 'להתנדנד' },
  build: ({ colors: c }) => {
    const root = new THREE.Group();
    root.add(bakedPart('spring-base', springBase));
    // the coil has its own (tiny) geometry per instance: it bends while the body rocks
    const coilG = coilRest().geo.clone();
    const coil = new THREE.Mesh(coilG, M.metal('#3a3d42', 0.5, 0.7));
    coil.castShadow = coil.receiveShadow = true;
    root.add(coil);
    // body pivot on the ground plate: rotation.x = pitch (nose down), rotation.z = roll
    const pivot = new THREE.Group();
    pivot.name = 'body';
    pivot.position.set(0, SPR.pivotY, 0);
    const bodyPart = bakedPart(partKey('spring-body', c, ['body', 'seat']), () => springBody(c));
    bodyPart.position.y = -SPR.pivotY;
    pivot.add(bodyPart);
    root.add(pivot);
    const seat = seatNode(pivot, 0, SPR.seatY - SPR.pivotY, SPR.seatZ, 0);
    const body = new Rocker(0.3, 0.05);
    const ride: RideRuntime = {
      seatNodes: [seat],
      update(dt, push, riders) {
        const p = riders.length ? push01(push) : 0;
        const [n, h] = substeps(dt);
        const was = body.moving;
        for (let i = 0; i < n; i++) body.step(h, p);
        if (was || body.moving) {
          pivot.rotation.x = body.pitch;
          pivot.rotation.z = body.roll;
          bendCoil(coilG, body.pitch, body.roll);
        }
        return body.moving;
      },
    };
    root.userData.ride = ride;
    return root;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.circle(ctx, 0, 0, 0.17, '#e3e5e7', INK_SOFT, LINE_THIN);
      D.line(ctx, -0.27, 0.21, 0.27, 0.21, undefined, 0.03);
      D.line(ctx, -0.27, 0.1, 0.27, 0.1, INK_SOFT, 0.03);
      D.box(ctx, -0.138, -0.47, 0.138, 0.47, 0.06, tint(c.body, 0.35));
      D.rr(ctx, 0, -0.14, 0.23, 0.34, 0.03, tint(c.seat, 0.3), undefined, LINE_THIN);
    }),
};

/* ------------------------------------------------------------------ monkey bars */

const MKB = { w: 3.0, d: 1.12, h: 2.2, px: 1.42, pz: 0.48, top: 2.16, r: 0.036 };

const monkeyBars: FurnitureDef = {
  id: 'monkey-bars',
  name: 'סולם תלייה',
  category: 'playground',
  size: { w: MKB.w, d: MKB.d, h: MKB.h },
  colors: [slot('frame', 'מסגרת', '#3f9a55'), slot('rungs', 'שלבים', '#f2b824')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { px, pz, top, r } = MKB;
    const frame = M.metal(c.frame, 0.45, 0.35);
    const rung = M.metal(c.rungs, 0.4, 0.35);
    for (const s of [-1, 1]) {
      const z = s * pz;
      k.tube(
        [
          [-px, 0.02, z],
          [-px, 1.0, z],
          [-px, top - 0.22, z],
          [-px + 0.07, top - 0.06, z],
          [-px + 0.24, top, z],
          [-0.6, top, z],
          [0.6, top, z],
          [px - 0.24, top, z],
          [px - 0.07, top - 0.06, z],
          [px, top - 0.22, z],
          [px, 1.0, z],
          [px, 0.02, z],
        ],
        r,
        frame,
        { seg: 44, radial: 8, tension: 0.25 },
      );
      for (const sx of [-1, 1]) k.cyl(0.075, 0.012, frame, sx * px, 0, z, 0.075, 12);
    }
    // ladder rungs at both ends, overhead rungs
    for (const sx of [-1, 1]) for (let i = 0; i < 5; i++) k.rod([sx * px, 0.35 + i * 0.35, -pz], [sx * px, 0.35 + i * 0.35, pz], 0.019, rung, 0.019, 8);
    const n = 8;
    for (let i = 0; i < n; i++) {
      const x = -1.05 + (i * 2.1) / (n - 1);
      k.rod([x, top, -pz], [x, top, pz], 0.019, rung, 0.019, 8);
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { px, pz } = MKB;
      for (let i = 0; i < 8; i++) {
        const x = -1.05 + (i * 2.1) / 7;
        D.line(ctx, x, -pz, x, pz, tint(c.rungs, 0.05), 0.035);
      }
      for (const s of [-1, 1]) {
        D.line(ctx, -px, s * pz, px, s * pz, INK_SOFT, 0.085);
        D.line(ctx, -px, s * pz, px, s * pz, tint(c.frame, 0.35), 0.06);
      }
      for (const sx of [-1, 1]) D.line(ctx, sx * px, -pz, sx * px, pz, tint(c.rungs, 0.05), 0.035);
    }),
};

/* ------------------------------------------------------------------ playhouse */

const PH = { w: 1.76, d: 1.6, h: 1.95, bw: 1.4, bd: 1.24, eave: 1.18, ridge: 1.82, t: 0.035 };

function gableShape(holes: THREE.Path[]): THREE.Shape {
  const { bw, eave, ridge } = PH;
  const s = polyShape([
    [-bw / 2, 0],
    [bw / 2, 0],
    [bw / 2, eave],
    [0, ridge - 0.07],
    [-bw / 2, eave],
  ]);
  s.holes.push(...holes);
  return s;
}

function rectPath(x0: number, y0: number, x1: number, y1: number): THREE.Path {
  const p = new THREE.Path();
  p.moveTo(x0, y0);
  p.lineTo(x0, y1);
  p.lineTo(x1, y1);
  p.lineTo(x1, y0);
  p.closePath();
  return p;
}

const playhouse: FurnitureDef = {
  id: 'playhouse',
  name: 'בית משחקים מעץ',
  category: 'playground',
  size: { w: PH.w, d: PH.d, h: PH.h },
  colors: [slot('walls', 'קירות', '#dcb98a'), slot('roof', 'גג', '#c8483e'), slot('trim', 'עיטורים', '#f6f3ec')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { bw, bd, eave, ridge, t } = PH;
    const wall = M.wood(c.walls, 0.7);
    const trim = M.paint(c.trim, 0.5);
    const y0 = 0.07;
    // deck
    k.rbox(bw + 0.06, y0, bd + 0.06, 0.008, M.wood(darken(c.walls, 0.2), 0.75), 0, 0, 0, 1);
    // front gable: door + window + round attic window
    const door = { x0: -0.52, x1: -0.02, y1: 1.02 };
    const win = { x0: 0.18, x1: 0.56, y0: 0.5, y1: 0.9 };
    const attic = new THREE.Path();
    attic.absarc(0, eave + 0.2, 0.12, 0, Math.PI * 2, true);
    const front = gableShape([rectPath(door.x0, 0, door.x1, door.y1), rectPath(win.x0, win.y0, win.x1, win.y1), attic]);
    k.geo(extrudeZ(front, t, 0, 16), wall, 0, y0, bd / 2 - t / 2);
    const back = gableShape([rectPath(-0.25, 0.5, 0.25, 0.9)]);
    k.geo(extrudeZ(back, t, 0, 8), wall, 0, y0, -bd / 2 + t / 2);
    // side walls with a window each
    const sideShape = polyShape([
      [-bd / 2 + t, 0],
      [bd / 2 - t, 0],
      [bd / 2 - t, eave],
      [-bd / 2 + t, eave],
    ]);
    sideShape.holes.push(rectPath(-0.22, 0.5, 0.22, 0.9));
    for (const s of [-1, 1]) k.geo(extrudeX(sideShape, t, 0, 4), wall, s * (bw / 2 - t / 2), y0, 0);
    // trim: corner boards, door and window frames with cross bars
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.05, eave, 0.05, trim, sx * (bw / 2 - 0.02), y0, sz * (bd / 2 - 0.02));
    const fz = bd / 2 + 0.006;
    const frameRect = (x0: number, yy0: number, x1: number, yy1: number, z: number, cross: boolean): void => {
      const fw = 0.035;
      k.box(x1 - x0 + 2 * fw, fw, 0.02, trim, (x0 + x1) / 2, y0 + yy1, z);
      if (yy0 > 0.01) k.box(x1 - x0 + 2 * fw + 0.04, fw, 0.035, trim, (x0 + x1) / 2, y0 + yy0 - fw, z + 0.006);
      for (const x of [x0 - fw / 2, x1 + fw / 2]) k.box(fw, yy1 - yy0, 0.02, trim, x, y0 + yy0, z);
      if (cross) {
        k.box(0.018, yy1 - yy0, 0.012, trim, (x0 + x1) / 2, y0 + yy0, z - 0.012);
        k.box(x1 - x0, 0.018, 0.012, trim, (x0 + x1) / 2, y0 + (yy0 + yy1) / 2 - 0.009, z - 0.012);
      }
    };
    frameRect(door.x0, 0, door.x1, door.y1, fz, false);
    frameRect(win.x0, win.y0, win.x1, win.y1, fz, true);
    frameRect(-0.25, 0.5, 0.25, 0.9, -fz, true);
    const ring = k.ring(0.13, 0.016, trim, 0, y0 + eave + 0.2, fz - 0.004, 20);
    ring.rotation.x = 0;
    // half-height stable door, standing ajar
    const dk = new Kit();
    dk.rbox(0.48, 0.52, 0.022, 0.006, M.paint(c.roof, 0.5), 0.24, 0, 0, 1);
    dk.box(0.4, 0.03, 0.006, trim, 0.24, 0.42, 0.014);
    dk.box(0.4, 0.03, 0.006, trim, 0.24, 0.07, 0.014);
    dk.sphere(0.018, M.brass(), 0.42, 0.3, 0.025, 1, 1, 1, 8);
    const dg = k.sub(dk, door.x0 + 0.01, y0 + 0.01, bd / 2 + 0.012);
    dg.rotation.y = -0.3;
    // flower box under the front window
    const fbY = y0 + win.y0 - 0.15;
    k.rbox(0.46, 0.1, 0.1, 0.01, M.paint(c.roof, 0.5), (win.x0 + win.x1) / 2, fbY, bd / 2 + 0.065, 1);
    const flowers = ['#f2c14e', '#f6f3ec', '#e87aa0', '#f2c14e', '#e87aa0'];
    flowers.forEach((col, i) => {
      const x = win.x0 + 0.03 + i * 0.08;
      k.sphere(0.035, M.foliage(PAL.leaf), x, fbY + 0.11, bd / 2 + 0.065, 1, 0.8, 1, 6);
      k.sphere(0.022, M.matte(col), x + 0.01, fbY + 0.15, bd / 2 + 0.07, 1, 0.7, 1, 6);
    });
    // roof: two boarded slopes with a ridge cap
    const roof = M.paint(c.roof, 0.6);
    const hw = 0.85;
    const rise = ridge - (eave - 0.1);
    const ang = Math.atan2(rise, hw);
    const len = Math.hypot(rise, hw) - 0.01;
    for (const s of [-1, 1]) {
      const rk = new Kit();
      rk.box(len, 0.035, PH.d, roof, 0, 0, 0);
      for (let i = 1; i < 6; i++) rk.box(0.012, 0.012, PH.d, M.paint(darken(c.roof, 0.18), 0.6), -len / 2 + (i * len) / 6, 0.035, 0);
      const g = k.sub(rk, (s * hw) / 2, y0 + eave - 0.1 + rise / 2 - 0.03, 0);
      g.rotation.z = -s * ang;
    }
    axisCyl(k, 0.032, PH.d, M.paint(darken(c.roof, 0.15), 0.6), 0, y0 + ridge + 0.012, 0, 'z', 0.032, 8);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { w, d, bw, bd } = PH;
      D.rr(ctx, 0, 0, w, d, 0.01, tint(c.roof, 0.4));
      for (let i = 1; i < 12; i++) if (i !== 6) D.line(ctx, -w / 2 + (i * w) / 12, -d / 2, -w / 2 + (i * w) / 12, d / 2, tint(c.roof, 0.05), 0.006);
      D.line(ctx, 0, -d / 2, 0, d / 2, undefined, 0.03);
      ctx.setLineDash([0.06, 0.05]);
      D.rr(ctx, 0, 0, bw, bd, 0.005, null, INK_SOFT, LINE_THIN);
      ctx.setLineDash([]);
      D.line(ctx, -0.52, bd / 2, -0.02, bd / 2, '#ffffff', 0.04);
    }),
};

/* ------------------------------------------------------------------ basketball hoop */

const BB = { w: 1.2, d: 1.4, h: 3.82, pz: -0.56, hoopY: 3.05, boardZ: 0.02 };

const boardFace = (): THREE.Material =>
  canvasMat(
    'bb-board',
    256,
    192,
    (c, w, h) => {
      c.fillStyle = '#f7f7f4';
      c.fillRect(0, 0, w, h);
      c.strokeStyle = '#1c1d20';
      c.lineWidth = 9;
      c.lineJoin = 'miter';
      c.strokeRect(7, 7, w - 14, h - 14);
      c.strokeStyle = '#d8473d';
      c.lineWidth = 8;
      c.strokeRect(w / 2 - 50, h - 30 - 82, 100, 82);
    },
    { fallback: '#f7f7f4', rough: 0.35 },
  );

const basketballHoop: FurnitureDef = {
  id: 'basketball-hoop',
  name: 'סל כדורסל',
  category: 'playground',
  size: { w: BB.w, d: BB.d, h: BB.h },
  colors: [slot('pole', 'עמוד', '#3d4349'), slot('pad', 'ריפוד', '#2f6fb7')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { pz, hoopY, boardZ } = BB;
    const pole = M.metal(c.pole, 0.5, 0.6);
    // base plate, pole with safety padding, cantilever arm
    k.box(0.26, 0.015, 0.26, pole, 0, 0, pz);
    k.rbox(0.12, 3.5, 0.12, 0.01, pole, 0, 0, pz, 1);
    k.rbox(0.22, 1.8, 0.22, 0.04, M.leather(c.pad), 0, 0.08, pz, 2);
    const by = hoopY - 0.15;
    k.beam([0, 3.44, pz], [0, by + 0.75, boardZ - 0.05], 0.07, 0.07, pole, 0.006);
    k.beam([0, 2.75, pz], [0, by + 0.22, boardZ - 0.05], 0.06, 0.06, pole, 0.006);
    k.box(0.5, 0.75, 0.03, pole, 0, by + 0.1, boardZ - 0.035);
    // backboard
    k.rbox(1.2, 0.9, 0.03, 0.006, M.paint('#f7f7f4', 0.35), 0, by, boardZ - 0.005, 1);
    k.geo(faceGeo(1.19, 0.89), boardFace(), 0, by + 0.45, boardZ + 0.0112).castShadow = false;
    k.box(1.2, 0.05, 0.05, M.leather(c.pad), 0, by - 0.02, boardZ - 0.005);
    // rim on a bracket, net
    const orange = M.paint('#e8622a', 0.4);
    const hz = boardZ + 0.012 + 0.15 + 0.225;
    k.ring(0.225, 0.011, orange, 0, hoopY, hz, 28);
    k.box(0.12, 0.012, 0.16, orange, 0, hoopY - 0.006, boardZ + 0.09);
    k.box(0.14, 0.12, 0.012, orange, 0, hoopY - 0.11, boardZ + 0.016);
    for (const s of [-1, 1]) k.rod([s * 0.05, hoopY - 0.09, boardZ + 0.02], [s * 0.13, hoopY - 0.005, hz - 0.17], 0.006, orange, 0.006, 6);
    const net = new THREE.CylinderGeometry(0.222, 0.13, 0.4, 20, 4, true);
    const np = net.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < np.count; i++) {
      // nets narrow quickly below the rim, then hang straight
      const t = Math.min(1, Math.max(0, 0.5 - np.getY(i) / 0.4));
      const rr = 0.222 - 0.092 * Math.pow(t, 0.6);
      const a = Math.atan2(np.getZ(i), np.getX(i));
      np.setX(i, Math.cos(a) * rr);
      np.setZ(i, Math.sin(a) * rr);
    }
    net.computeVertexNormals();
    k.geo(net, netMat('#f3f1ea', 0.13, true, [12, 4]), 0, hoopY - 0.205, hz);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { pz, boardZ } = BB;
      const hz = boardZ + 0.012 + 0.15 + 0.225;
      D.line(ctx, 0, pz, 0, boardZ, INK_SOFT, 0.06);
      D.rr(ctx, 0, pz, 0.24, 0.24, 0.04, tint(c.pad, 0.35));
      D.rr(ctx, 0, pz, 0.12, 0.12, 0.01, tint(c.pole, 0.3), undefined, LINE_THIN);
      D.rr(ctx, 0, boardZ, 1.2, 0.04, 0.005, '#ffffff', undefined, 0.012);
      D.line(ctx, 0, boardZ + 0.02, 0, hz - 0.225, '#e8622a', 0.05);
      D.circle(ctx, 0, hz, 0.225, null, '#e8622a', 0.03);
      ctx.setLineDash([0.03, 0.03]);
      D.circle(ctx, 0, hz, 0.14, null, INK_SOFT, 0.006);
    }),
};

/* ------------------------------------------------------------------ football goal */

const FB = { w: 3.1, d: 1.3, h: 2.06, px: 1.5, fz: 0.6, bz: -0.6, top: 2.0, r: 0.045 };

const footballGoal: FurnitureDef = {
  id: 'football-goal',
  name: 'שער כדורגל',
  category: 'playground',
  size: { w: FB.w, d: FB.d, h: FB.h },
  colors: [slot('frame', 'מסגרת', '#f6f6f3')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { px, fz, bz, top, r } = FB;
    const frame = M.paint(c.frame, 0.4);
    const thin = 0.024;
    // goal mouth
    k.tube(
      [
        [-px, 0.02, fz],
        [-px, 1.0, fz],
        [-px, top - 0.12, fz],
        [-px + 0.04, top - 0.03, fz],
        [-px + 0.14, top, fz],
        [-0.7, top, fz],
        [0.7, top, fz],
        [px - 0.14, top, fz],
        [px - 0.04, top - 0.03, fz],
        [px, top - 0.12, fz],
        [px, 1.0, fz],
        [px, 0.02, fz],
      ],
      r,
      frame,
      { seg: 44, radial: 10, tension: 0.2 },
    );
    // side frames + ground bar
    for (const s of [-1, 1]) {
      k.rod([s * px, top - 0.02, fz], [s * px, thin, bz], thin, frame, thin, 8);
      k.rod([s * px, thin, fz], [s * px, thin, bz], thin, frame, thin, 8);
      k.sphere(thin, frame, s * px, thin, bz, 1, 1, 1, 8);
    }
    k.rod([-px, thin, bz], [px, thin, bz], thin, frame, thin, 8);
    // net: sloping back + two triangular sides
    const net = netMat('#f1f1ee', 0.1, false, [1, 1]);
    const cell = 1 / 0.12;
    const quad = (pts: V3[], uvs: Array<[number, number]>): void => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs.flat().map((v) => v * cell), 2));
      g.setIndex(pts.length === 4 ? [0, 1, 2, 0, 2, 3] : [0, 1, 2]);
      g.computeVertexNormals();
      k.geo(g, net).castShadow = false;
    };
    const slope = Math.hypot(top, fz - bz);
    quad(
      [
        [-px, top, fz],
        [px, top, fz],
        [px, thin, bz],
        [-px, thin, bz],
      ],
      [
        [0, slope],
        [px * 2, slope],
        [px * 2, 0],
        [0, 0],
      ],
    );
    for (const s of [-1, 1]) {
      quad(
        [
          [s * px, top, fz],
          [s * px, thin, fz],
          [s * px, thin, bz],
        ],
        [
          [fz - bz, top],
          [fz - bz, 0],
          [0, 0],
        ],
      );
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { px, fz, bz } = FB;
      D.box(ctx, -px, bz, px, fz, 0, '#f4f5f2c0', null);
      for (let i = 1; i < 12; i++) D.line(ctx, -px + (i * px * 2) / 12, bz, -px + (i * px * 2) / 12, fz, INK_SOFT, 0.004);
      for (let i = 1; i < 5; i++) D.line(ctx, -px, bz + (i * (fz - bz)) / 5, px, bz + (i * (fz - bz)) / 5, INK_SOFT, 0.004);
      D.line(ctx, -px, bz, px, bz, INK_SOFT, 0.03);
      for (const s of [-1, 1]) D.line(ctx, s * px, bz, s * px, fz, INK_SOFT, 0.03);
      D.line(ctx, -px, fz, px, fz, undefined, 0.1);
      D.line(ctx, -px, fz, px, fz, tint(c.frame, 0.5), 0.07);
    }),
};

/* ------------------------------------------------------------------ ping pong table */

const PP = { L: 2.74, W: 1.525, topY: 0.76, d: 1.83 };

const pingPong: FurnitureDef = {
  id: 'ping-pong-table',
  name: 'שולחן פינג פונג',
  category: 'playground',
  size: { w: PP.L, d: PP.d, h: 0.92 },
  colors: [slot('top', 'משטח', '#2c6e9f'), slot('frame', 'רגליים', '#3d4349')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { L, W, topY } = PP;
    const top = M.paint(c.top, 0.55);
    const white = M.paint('#f6f6f2', 0.5);
    const frame = M.metal(c.frame, 0.5, 0.6);
    const tt = 0.03;
    for (const s of [-1, 1]) k.rbox(L / 2 - 0.004, tt, W, 0.006, top, s * (L / 4 + 0.001), topY - tt, 0, 1);
    // white lines: edges + centre line
    const ly = topY + 0.0005;
    const lw = 0.02;
    for (const s of [-1, 1]) {
      k.box(L, 0.001, lw, white, 0, ly, s * (W / 2 - lw / 2));
      k.box(lw, 0.001, W, white, s * (L / 2 - lw / 2), ly, 0);
    }
    k.box(L, 0.001, 0.004, white, 0, ly, 0);
    // apron + trestle legs
    for (const s of [-1, 1]) {
      k.box(L - 0.2, 0.05, 0.03, frame, 0, topY - tt - 0.05, s * (W / 2 - 0.12));
      const x = s * 0.82;
      k.tube(
        [
          [x, 0.025, -W / 2 + 0.16],
          [x, 0.3, -W / 2 + 0.16],
          [x, topY - 0.16, -W / 2 + 0.2],
          [x, topY - tt - 0.03, -W / 2 + 0.36],
          [x, topY - tt - 0.03, 0],
          [x, topY - tt - 0.03, W / 2 - 0.36],
          [x, topY - 0.16, W / 2 - 0.2],
          [x, 0.3, W / 2 - 0.16],
          [x, 0.025, W / 2 - 0.16],
        ],
        0.025,
        frame,
        { seg: 30, radial: 8, tension: 0.3 },
      );
      k.rod([x, 0.2, -W / 2 + 0.16], [x, 0.2, W / 2 - 0.16], 0.016, frame, 0.016, 6);
      for (const sz of [-1, 1]) k.cyl(0.035, 0.02, M.rubber(), x, 0, sz * (W / 2 - 0.16), 0.035, 10);
    }
    k.box(1.64, 0.04, 0.04, frame, 0, topY - tt - 0.05, 0);
    // net with posts
    const nh = 0.1525;
    const nw = W + 0.3;
    const netG = faceGeo(nw - 0.02, nh - 0.012);
    planarUV(netG, 1 / 0.016, true);
    netG.rotateY(Math.PI / 2);
    k.geo(netG, netMat('#26282b', 0.2, false, [1, 1]), 0, topY + (nh - 0.012) / 2, 0).castShadow = false;
    k.box(0.006, 0.014, nw - 0.02, white, 0, topY + nh - 0.014, 0);
    for (const s of [-1, 1]) {
      k.cyl(0.008, nh + 0.03, frame, 0, topY - 0.03, s * (nw / 2 - 0.008), 0.008, 8);
      k.box(0.03, 0.05, 0.13, frame, 0, topY - 0.055, s * (W / 2 + 0.07));
    }
    // two bats and a ball
    const bat = (x: number, z: number, rot: number, col: string): void => {
      const b = new Kit();
      b.cyl(0.076, 0.012, M.rubber(col), 0, 0, 0, 0.076, 18);
      b.rbox(0.03, 0.02, 0.1, 0.006, M.wood(PAL.oak), 0, -0.004, 0.115, 1);
      const g = k.sub(b, x, topY + 0.002, z);
      g.rotation.y = rot;
    };
    bat(-0.85, 0.3, 0.5, '#c8372d');
    bat(0.9, -0.25, 2.6, '#26282b');
    k.sphere(0.02, M.plastic('#f39a2b'), -0.72, topY + 0.021, 0.42, 1, 1, 1, 10);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { L, W } = PP;
      D.rr(ctx, 0, 0, L, W, 0.01, tint(c.top, 0.4));
      D.rr(ctx, 0, 0, L - 0.04, W - 0.04, 0, null, '#ffffff', 0.02);
      D.line(ctx, -L / 2, 0, L / 2, 0, '#ffffff', 0.012);
      D.line(ctx, 0, -W / 2 - 0.15, 0, W / 2 + 0.15, undefined, 0.025);
      D.circle(ctx, -0.85, 0.3, 0.076, tint('#c8372d', 0.3), undefined, 0.008);
      D.circle(ctx, 0.9, -0.25, 0.076, '#6a6d72', undefined, 0.008);
    }),
};

/* ------------------------------------------------------------------ rubber safety mat */

const rubberMat: FurnitureDef = {
  id: 'rubber-mat',
  name: 'משטח גומי בטיחותי',
  category: 'playground',
  size: { w: 2, d: 2, h: 0.04 },
  walkable: true,
  colors: [slot('color', 'צבע', '#c8553d')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const mat = speckleMat(c.color, [lighten(c.color, 0.22), darken(c.color, 0.25), darken(c.color, 0.1)], 0.95, 1500, 1.4);
    const groove = M.matte(darken(c.color, 0.45));
    // four bevelled 1 × 1 m tiles
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.rbox(0.996, 0.04, 0.996, 0.008, mat, sx * 0.5, 0, sz * 0.5, 1);
    k.box(1.99, 0.03, 0.006, groove, 0, 0, 0);
    k.box(0.006, 0.03, 1.99, groove, 0, 0, 0);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 2, 2, 0.01, tint(c.color, 0.55), INK_SOFT, LINE_THIN);
      D.line(ctx, -1, 0, 1, 0, tint(c.color, 0.15), 0.01);
      D.line(ctx, 0, -1, 0, 1, tint(c.color, 0.15), 0.01);
      ctx.fillStyle = tint(c.color, 0.2);
      for (let i = 0; i < 9; i++) {
        for (let j = 0; j < 9; j++) {
          ctx.beginPath();
          ctx.arc(-0.8 + i * 0.2 + (j % 2) * 0.05, -0.8 + j * 0.2, 0.012, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }),
};

/* ------------------------------------------------------------------ drinking fountain */

const DF_Z = -0.027;

const drinkingFountain: FurnitureDef = {
  id: 'drinking-fountain',
  name: 'ברזייה',
  category: 'playground',
  size: { w: 0.46, d: 0.46, h: 1.04 },
  colors: [slot('body', 'גוף', '#4f8f86')],
  // bubbler nozzle tip, falling into the bowl below it
  interact: [{ kind: 'water', x: 0, y: 1.012, z: DF_Z - 0.058, fall: 0.116, sound: 'tap' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const body = M.metal(c.body, 0.5, 0.4);
    const steel = M.metal('#d3d6d8', 0.3, 0.95);
    const z = DF_Z;
    k.lathe(
      [
        [0.2, 0],
        [0.2, 0.025],
        [0.14, 0.05],
        [0.12, 0.12],
        [0.105, 0.78],
        [0.13, 0.86],
      ],
      body,
      0,
      0,
      z,
      20,
    );
    // stainless bowl, leaning a little towards the user
    k.lathe(
      [
        [0.12, 0.85],
        [0.2, 0.9],
        [0.225, 0.945],
        [0.225, 0.96],
        [0.205, 0.96],
        [0.17, 0.915],
        [0.04, 0.885],
        [0, 0.885],
      ],
      steel,
      0,
      0,
      z + 0.03,
      24,
    );
    k.cyl(0.02, 0.003, M.matte('#2a2b2e'), 0, 0.886, z + 0.03, 0.02, 10);
    // bubbler with a mouth guard + push button
    k.tube(
      [
        [0, 0.9, z - 0.13],
        [0, 1.0, z - 0.13],
        [0, 1.03, z - 0.1],
        [0, 1.015, z - 0.06],
      ],
      0.011,
      M.chrome(),
      { seg: 12, radial: 8 },
    );
    k.cyl(0.03, 0.03, M.chrome(), 0, 0.9, z - 0.13, 0.024, 12);
    axisCyl(k, 0.034, 0.03, M.chrome(), 0, 0.72, z + 0.115, 'z', 0.034, 14);
    axisCyl(k, 0.045, 0.012, body, 0, 0.72, z + 0.103, 'z', 0.045, 14);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const z = DF_Z;
      D.circle(ctx, 0, z, 0.2, tint(c.body, 0.45), undefined, LINE_THIN);
      D.circle(ctx, 0, z + 0.03, 0.225, '#e9ecee');
      D.circle(ctx, 0, z + 0.03, 0.17, '#f7f8f9', INK_SOFT, LINE_THIN);
      D.circle(ctx, 0, z + 0.03, 0.02, '#55585d', null);
      D.circle(ctx, 0, z - 0.13, 0.03, '#ffffff', undefined, 0.008);
    }),
};

export const PLAYGROUND: FurnitureDef[] = [
  slide,
  seesaw,
  carousel,
  climbingFrame,
  springRider,
  monkeyBars,
  playhouse,
  basketballHoop,
  footballGoal,
  pingPong,
  rubberMat,
  drinkingFountain,
  ...BALLS,
];
