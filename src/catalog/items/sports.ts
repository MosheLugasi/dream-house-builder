import * as THREE from 'three';
import type { FurnitureDef } from '../types';
import { D, INK, INK_SOFT, Kit, LINE_THIN, M, PAL, darken, lighten, mesh, roundedRectShape, sym, tint, type V3 } from '../kit';
import { slot } from './_parts';
import { ball, chain, profileZ, xcyl, zcyl, type BallKind } from './_sport';

const DARK = '#26282c';
const G_MACH = 'מכשירי כושר';
const G_WEIGHTS = 'משקולות ואימון';
const G_BALLS = 'כדורים';
const G_HOOPS = 'כדורסל ומטרות';

/** Powder-coated steel. */
const coat = (c: string): THREE.MeshStandardMaterial => M.metal(c, 0.42, 0.55);
/** Foam hand grip. */
const foam = (): THREE.MeshStandardMaterial => M.leather('#1d1e20');

/** Small console with a screen on its -Z face, tilted towards a user standing at -Z. */
function consoleUnit(k: Kit, w: number, h: number, t: number, body: THREE.Material, accent: string, x: number, y: number, z: number, tilt: number): void {
  const c = new Kit();
  c.rbox(w, h, t, Math.min(0.03, t / 2), body, 0, -h / 2, 0, 1);
  c.box(w * 0.5, h * 0.62, 0.004, M.screen('#0d1a24'), 0, -h * 0.28, -t / 2 - 0.001);
  // buttons
  for (let i = 0; i < 3; i++) {
    for (const s of [-1, 1]) c.box(0.03, 0.018, 0.006, M.plastic(i === 0 ? accent : '#53565c'), s * (w * 0.33 + 0.02), -h * 0.2 - i * 0.032, -t / 2 - 0.002);
  }
  c.box(w * 0.86, 0.008, 0.004, M.plastic(accent), 0, h * 0.36, -t / 2 - 0.001);
  k.sub(c, x, y, z).rotation.x = tilt;
}

/**
 * Turn a built machine by 180° around Y so its console / handlebars end up at -Z (the runtime puts
 * the user at `at` facing local -Z). Parts keep an identity rotation (their children are turned
 * instead), so the runtime can still spin them about their local X axis.
 */
function faceBack(g: THREE.Group): THREE.Group {
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
  const turn = (o: THREE.Object3D): void => {
    o.position.set(-o.position.x, o.position.y, -o.position.z);
    o.quaternion.premultiply(q);
  };
  for (const c of g.children) {
    if (c.userData.part !== undefined) {
      c.position.set(-c.position.x, c.position.y, -c.position.z);
      for (const cc of c.children) turn(cc);
    } else turn(c);
  }
  return g;
}

/** Plan symbol drawn for the unturned machine, rotated 180° like `faceBack`. */
const backSym = (ctx: CanvasRenderingContext2D, fn: () => void): void =>
  sym(ctx, () => {
    ctx.rotate(Math.PI);
    fn();
  });

/* ================================================================== treadmills */

interface TreadOpts {
  id: string;
  name: string;
  tags: string[];
  w: number;
  d: number;
  h: number;
  frame: string;
  accent: string;
  pad?: boolean; // under-desk walking pad (no uprights)
}

function treadmill(o: TreadOpts): FurnitureDef {
  const { w, d, h } = o;
  const pad = !!o.pad;
  const beltTop = pad ? 0.13 : 0.19;
  const railX = w / 2 - (pad ? 0.04 : 0.05);
  const z0 = -d / 2 + 0.02;
  const hoodZ0 = pad ? d / 2 - 0.16 : d / 2 - 0.45;
  const rollerY = beltTop - 0.012 - (pad ? 0.035 : 0.05);
  const rollerR = pad ? 0.035 : 0.05;
  const beltW = w - (pad ? 0.13 : 0.28);
  return {
    id: o.id,
    name: o.name,
    category: 'sports',
    group: G_MACH,
    tags: o.tags,
    size: { w, d, h },
    colors: [slot('frame', 'מסגרת', o.frame), slot('accent', 'פס צבע', o.accent)],
    actions: [{ kind: 'run', at: { x: 0, y: beltTop, z: pad ? 0.05 : 0.18 } }],
    build: ({ colors: c }) => {
      const k = new Kit();
      const frame = M.plastic(c.frame);
      const rubber = M.rubber('#1b1c1e');
      const steel = M.steel();
      const accent = M.plastic(c.accent);
      const railW = pad ? 0.07 : 0.09;
      const railH = beltTop + (pad ? 0.005 : 0.012) - 0.04;
      // feet
      for (const sx of [-1, 1]) for (const z of [z0 + 0.08, hoodZ0 + 0.1]) k.cyl(0.025, 0.04, rubber, sx * (railX - 0.005), 0, z, 0.03, 10);
      // side rails with rubber foot strips and rear end caps
      for (const sx of [-1, 1]) {
        k.rbox(railW, railH, hoodZ0 - z0 + 0.02, 0.012, frame, sx * (w / 2 - railW / 2 - 0.004), 0.04, (z0 + hoodZ0) / 2 + 0.01, 1);
        k.rbox(railW - 0.012, 0.008, hoodZ0 - z0 - 0.1, 0.003, rubber, sx * (w / 2 - railW / 2 - 0.004), 0.04 + railH - 0.002, (z0 + hoodZ0) / 2 + 0.04, 1);
        k.box(0.006, railH * 0.35, hoodZ0 - z0 - 0.2, accent, sx * (w / 2 - 0.003), 0.04 + railH * 0.45, (z0 + hoodZ0) / 2 + 0.03);
        k.rbox(railW + 0.01, railH + 0.01, 0.06, 0.02, M.plastic(DARK), sx * (w / 2 - railW / 2 - 0.005), 0.035, z0 + 0.03, 1);
      }
      // deck + belt
      k.box(beltW + 0.02, beltTop - 0.012 - 0.06, hoodZ0 - z0 - 0.1, M.plastic('#303236'), 0, 0.06, (z0 + hoodZ0) / 2);
      k.box(beltW, 0.012, hoodZ0 - z0 - 0.08, M.fabric('#2b2c2f', 60), 0, beltTop - 0.012, (z0 + hoodZ0) / 2 + 0.01);
      // rollers (animated)
      for (const rz of [z0 + 0.075, hoodZ0 - 0.02]) {
        const p = k.part('spin', 0, rollerY, rz);
        xcyl(p, rollerR, beltW + 0.02, steel, 0, 0, 0, 16);
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          p.box(beltW + 0.03, 0.006, 0.006, M.plastic('#5a5d62'), 0, Math.sin(a) * rollerR - 0.003, Math.cos(a) * rollerR);
        }
        // visible end caps with a marker stripe
        for (const sx of [-1, 1]) {
          xcyl(p, rollerR * 0.82, 0.008, M.plastic('#3a3c41'), sx * (beltW / 2 + 0.016), 0, 0, 14);
          p.box(0.004, rollerR * 1.4, 0.012, accent, sx * (beltW / 2 + 0.021), -rollerR * 0.7, 0);
        }
      }
      if (pad) {
        // low motor cover + LED strip display
        k.rbox(w - 0.004, 0.11, d / 2 - hoodZ0 - 0.004, 0.035, frame, 0, 0.035, (hoodZ0 + d / 2) / 2, 1);
        k.box(0.16, 0.004, 0.035, M.screen('#0d1a24'), 0, 0.146, (hoodZ0 + d / 2) / 2);
        k.box(w * 0.7, 0.004, 0.008, accent, 0, 0.143, hoodZ0 + 0.03);
        return faceBack(k.g);
      }
      // motor hood
      const hoodD = d / 2 - hoodZ0 - 0.004;
      k.rbox(w - 0.01, 0.27, hoodD, 0.06, frame, 0, 0.035, hoodZ0 + hoodD / 2, 2);
      k.box(w * 0.72, 0.012, 0.004, accent, 0, 0.2, d / 2 - 0.007);
      for (let i = 0; i < 6; i++) k.box(0.18, 0.006, 0.004, M.plastic('#1c1d20'), 0, 0.09 + i * 0.016, d / 2 - 0.006);
      // uprights + console + handlebars
      const upTop: V3 = [0, h - 0.22, d / 2 - 0.2];
      for (const sx of [-1, 1]) {
        k.beam([sx * (w / 2 - 0.07), 0.25, d / 2 - 0.12], [sx * (w / 2 - 0.08), upTop[1], upTop[2]], 0.06, 0.09, M.metal(c.frame, 0.4, 0.55), 0.012);
        // side hand rails with foam
        const pts: V3[] = [
          [sx * (w / 2 - 0.07), h - 0.4, d / 2 - 0.2],
          [sx * (w / 2 - 0.05), h - 0.37, d / 2 - 0.42],
          [sx * (w / 2 - 0.05), h - 0.4, d / 2 - 0.62],
        ];
        k.tube(pts, 0.017, steel, { seg: 10, radial: 6 });
        k.tube(pts.slice(1).map((p) => [p[0], p[1], p[2]] as V3), 0.022, foam(), { seg: 6, radial: 8 });
        // pulse sensors
        k.rbox(0.05, 0.03, 0.09, 0.01, M.chrome(), sx * (w / 2 - 0.05), h - 0.385, d / 2 - 0.36, 1);
      }
      k.rod([-(w / 2 - 0.08), h - 0.33, d / 2 - 0.22], [w / 2 - 0.08, h - 0.33, d / 2 - 0.22], 0.016, foam(), 0.016, 10);
      consoleUnit(k, w - 0.16, 0.24, 0.1, M.plastic(DARK), c.accent, 0, h - 0.15, d / 2 - 0.2, 0.6);
      // safety key (red clip)
      k.cyl(0.012, 0.02, M.plastic('#d0302a'), 0.2, h - 0.27, d / 2 - 0.3, 0.012, 10);
      return faceBack(k.g);
    },
    draw2d: (ctx, c) =>
      backSym(ctx, () => {
        D.rr(ctx, 0, 0, w, d, 0.05, tint(c.frame, 0.5));
        D.rr(ctx, 0, (z0 + hoodZ0) / 2 + 0.01, beltW, hoodZ0 - z0 - 0.08, 0.01, '#5a5c60', undefined, LINE_THIN);
        for (let z = z0 + 0.15; z < hoodZ0 - 0.05; z += 0.12) D.line(ctx, -beltW / 2 + 0.02, z, beltW / 2 - 0.02, z, '#7c7f84', 0.006);
        D.rr(ctx, 0, (hoodZ0 + d / 2) / 2, w - 0.02, d / 2 - hoodZ0, 0.05, tint(c.frame, 0.25));
        if (!pad) D.rr(ctx, 0, d / 2 - 0.16, w - 0.16, 0.12, 0.02, tint(c.accent, 0.3), undefined, LINE_THIN);
      }),
  };
}

/* ================================================================== elliptical */

const ELL = { w: 0.68, d: 1.78, h: 1.66 };

const elliptical: FurnitureDef = {
  id: 'fit-elliptical',
  name: 'מכשיר אליפטי',
  category: 'sports',
  group: G_MACH,
  tags: ['אליפטיקל', 'קרדיו', 'כושר', 'חדר כושר'],
  size: ELL,
  colors: [slot('frame', 'מסגרת', '#2e3035'), slot('accent', 'כיסויים', '#c9ccd0')],
  actions: [{ kind: 'run', label: 'אימון אליפטי', at: { x: 0, y: 0.33, z: 0.02 } }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { d } = ELL;
    const frame = coat(c.frame);
    const cover = M.plastic(c.accent);
    const dark = M.plastic(DARK);
    // base: spine + stabilisers
    k.rbox(0.09, 0.07, d - 0.1, 0.015, frame, 0, 0.02, 0, 1);
    for (const z of [-d / 2 + 0.06, d / 2 - 0.06]) {
      xcyl(k, 0.035, ELL.w - 0.06, frame, 0, 0.045, z, 12);
      for (const s of [-1, 1]) k.cyl(0.03, 0.02, M.rubber(), s * (ELL.w / 2 - 0.05), 0, z, 0.03, 10);
    }
    // rear drive housing with the flywheel
    const hz = -d / 2 + 0.32;
    k.rbox(0.3, 0.56, 0.5, 0.12, cover, 0, 0.06, hz, 2);
    k.rbox(0.31, 0.04, 0.4, 0.015, dark, 0, 0.32, hz, 1);
    // cranks + flywheel side discs (animated)
    const p = k.part('spin', 0, 0.38, hz + 0.04);
    for (const s of [-1, 1]) {
      xcyl(p, 0.16, 0.012, M.plastic(darken(c.accent, 0.15)), s * 0.158, 0, 0, 24);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4;
        p.beam([s * 0.166, 0, 0], [s * 0.166, Math.sin(a) * 0.14, Math.cos(a) * 0.14], 0.004, 0.02, M.chrome());
      }
      p.beam([s * 0.175, 0, 0], [s * 0.175, s * 0.13, 0.05], 0.014, 0.035, M.steel());
      xcyl(p, 0.025, 0.02, M.steel(), s * 0.18, 0, 0, 12);
    }
    // pedal arms (rails) running forward to the front rollers
    for (const s of [-1, 1]) {
      const x = s * 0.2;
      k.beam([x, 0.38 + s * 0.04, hz + 0.08], [x, 0.16, 0.48], 0.05, 0.03, frame, 0.008);
      k.cyl(0.028, 0.03, M.plastic('#45484d'), x, 0.04, 0.5, 0.028, 12);
      // foot pedal with rubber top
      k.rbox(0.13, 0.03, 0.36, 0.01, dark, x, 0.27, -0.04, 1);
      k.rbox(0.12, 0.006, 0.33, 0.003, M.rubber('#3c3e42'), x, 0.3, -0.04, 1);
      k.rbox(0.13, 0.05, 0.03, 0.01, dark, x, 0.29, -0.21, 1);
    }
    // front mast
    const mastTop: V3 = [0, 1.22, d / 2 - 0.26];
    k.beam([0, 0.08, d / 2 - 0.08], mastTop, 0.07, 0.1, frame, 0.015);
    k.rbox(0.18, 0.2, 0.16, 0.04, cover, 0, 0.06, d / 2 - 0.1, 1);
    consoleUnit(k, 0.4, 0.22, 0.09, dark, c.accent, 0, 1.4, d / 2 - 0.27, 0.65);
    // fixed grips with pulse sensors
    k.tube([[-0.14, 1.05, d / 2 - 0.3], [-0.12, 1.12, d / 2 - 0.42], [0, 1.14, d / 2 - 0.44], [0.12, 1.12, d / 2 - 0.42], [0.14, 1.05, d / 2 - 0.3]], 0.016, M.steel(), { seg: 20, radial: 6 });
    // moving handlebars
    for (const s of [-1, 1]) {
      const x = s * 0.26;
      k.beam([s * 0.07, 1.02, d / 2 - 0.27], [x, 1.02, d / 2 - 0.3], 0.03, 0.04, frame, 0.006);
      k.tube([[x, 0.55, d / 2 - 0.15], [x, 1.02, d / 2 - 0.3], [x * 1.05, 1.42, d / 2 - 0.5], [x * 1.0, 1.64, d / 2 - 0.6]], 0.019, frame, { seg: 16, radial: 6 });
      k.tube([[x * 1.05, 1.36, d / 2 - 0.47], [x * 1.04, 1.48, d / 2 - 0.53], [x * 1.0, 1.62, d / 2 - 0.59]], 0.024, foam(), { seg: 10, radial: 6 });
      k.beam([x, 0.55, d / 2 - 0.15], [s * 0.2, 0.2, 0.45], 0.03, 0.03, frame, 0.006);
    }
    return faceBack(k.g);
  },
  draw2d: (ctx, c) =>
    backSym(ctx, () => {
      const { w, d } = ELL;
      D.rr(ctx, 0, 0, 0.09, d - 0.1, 0.02, tint(c.frame, 0.4), undefined, LINE_THIN);
      for (const z of [-d / 2 + 0.06, d / 2 - 0.06]) D.rr(ctx, 0, z, w - 0.06, 0.07, 0.03, tint(c.frame, 0.35), undefined, LINE_THIN);
      D.rr(ctx, 0, -d / 2 + 0.32, 0.34, 0.5, 0.1, tint(c.accent, 0.3));
      for (const s of [-1, 1]) {
        D.rr(ctx, s * 0.2, -0.04, 0.13, 0.36, 0.02, tint('#3c3e42', 0.5));
        D.line(ctx, s * 0.2, 0.14, s * 0.2, 0.5, INK_SOFT, 0.02);
        D.line(ctx, s * 0.26, d / 2 - 0.15, s * 0.26, d / 2 - 0.6, INK_SOFT, 0.03);
      }
      D.rr(ctx, 0, d / 2 - 0.27, 0.4, 0.12, 0.02, tint(c.accent, 0.1));
    }),
};

/* ================================================================== bikes */

/** Saddle (nose towards +Z), top at y. */
function saddle(k: Kit, mat: THREE.Material, x: number, y: number, z: number, wide = 1): void {
  k.sphere(0.1, mat, x, y - 0.032, z - 0.03, 0.95 * wide, 0.32, 0.72);
  k.sphere(0.07, mat, x, y - 0.026, z + 0.07, 0.48, 0.34, 1.05);
  k.cyl(0.013, 0.05, M.blackMetal(), x, y - 0.09, z, 0.013, 8);
}

/** Crank set (animated): pivot at the bottom bracket; pedals at ±x. */
function cranks(k: Kit, y: number, z: number, half: number, len: number, accent: THREE.Material): void {
  const p = k.part('spin', 0, y, z);
  xcyl(p, 0.035, half * 2 - 0.02, M.plastic('#3a3c40'), 0, 0, 0, 14);
  for (const s of [-1, 1]) {
    const dir = s;
    p.beam([s * half, 0, 0], [s * half, 0, dir * len], 0.022, 0.03, M.brushed('#b8bbbf'));
    // pedal: platform + strap
    p.rbox(0.1, 0.022, 0.07, 0.006, M.plastic('#202124'), s * (half + 0.07), -0.011, dir * len, 1);
    p.rbox(0.09, 0.012, 0.03, 0.004, accent, s * (half + 0.07), 0.012, dir * len + 0.015, 1);
  }
}

const BIKE = { w: 0.56, d: 1.02, h: 1.36 };

const exerciseBike: FurnitureDef = {
  id: 'fit-exercise-bike',
  name: 'אופני כושר',
  category: 'sports',
  group: G_MACH,
  tags: ['אופניים נייחים', 'קרדיו', 'כושר', 'דיווש'],
  size: BIKE,
  colors: [slot('frame', 'שלדה', '#e9eaec'), slot('accent', 'פס צבע', '#2c8bd6'), slot('seat', 'מושב', '#232427')],
  actions: [{ kind: 'pedal', at: { x: 0, y: 0.95, z: 0.3 } }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { d } = BIKE;
    const frame = coat(c.frame);
    const accent = M.plastic(c.accent);
    // stabilisers with levelling feet and transport wheels
    for (const z of [-d / 2 + 0.05, d / 2 - 0.08]) {
      xcyl(k, 0.035, BIKE.w - 0.06, frame, 0, 0.05, z, 14);
      for (const s of [-1, 1]) xcyl(k, 0.026, 0.025, M.rubber(), s * (BIKE.w / 2 - 0.02), 0.04, z, 12);
    }
    for (const s of [-1, 1]) k.cyl(0.025, 0.015, M.rubber(), s * 0.2, 0, -d / 2 + 0.05, 0.025, 10);
    k.add(mesh(new THREE.TorusGeometry(0.025, 0.012, 6, 12), M.plastic(DARK)), 0.2, 0.05, d / 2 - 0.045).rotation.y = Math.PI / 2;
    // main tube frame
    k.tube([[0, 0.06, -d / 2 + 0.05], [0, 0.22, -0.32], [0, 0.42, -0.18], [0, 0.72, -0.26]], 0.035, frame, { seg: 18 });
    k.tube([[0, 0.06, d / 2 - 0.08], [0, 0.16, 0.28], [0, 0.3, 0.06]], 0.035, frame, { seg: 12 });
    // flywheel shroud
    k.rbox(0.15, 0.52, 0.5, 0.075, M.plastic(c.frame), 0, 0.08, 0.15, 2);
    k.rbox(0.155, 0.08, 0.3, 0.02, accent, 0, 0.42, 0.12, 1);
    // visible flywheel side discs (animated)
    const fw = k.part('spin', 0, 0.34, 0.18);
    for (const s of [-1, 1]) {
      xcyl(fw, 0.17, 0.008, M.plastic('#4a4d52'), s * 0.08, 0, 0, 24);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        fw.beam([s * 0.085, 0, 0], [s * 0.085, Math.sin(a) * 0.15, Math.cos(a) * 0.15], 0.004, 0.018, M.chrome());
      }
    }
    cranks(k, 0.3, -0.06, 0.1, 0.16, accent);
    // seat post + saddle
    k.beam([0, 0.6, -0.235], [0, 0.88, -0.3], 0.04, 0.04, M.chrome(), 0.008);
    k.cyl(0.02, 0.03, M.plastic('#202124'), 0.03, 0.62, -0.23, 0.02, 10);
    saddle(k, M.leather(c.seat), 0, 0.95, -0.31);
    // handlebar stem, bars and console
    k.beam([0, 0.55, 0.36], [0, 1.08, 0.3], 0.05, 0.05, frame, 0.01);
    k.tube([[-0.22, 1.02, 0.18], [-0.2, 1.1, 0.27], [0, 1.12, 0.3], [0.2, 1.1, 0.27], [0.22, 1.02, 0.18]], 0.016, M.steel(), { seg: 20 });
    for (const s of [-1, 1]) k.rod([s * 0.222, 1.02, 0.18], [s * 0.2, 0.98, 0.08], 0.021, foam(), 0.021, 10);
    consoleUnit(k, 0.26, 0.16, 0.06, M.plastic(DARK), c.accent, 0, 1.2, 0.33, 0.55);
    // resistance knob
    k.cyl(0.03, 0.04, accent, 0, 1.08, 0.36, 0.026, 12);
    return faceBack(k.g);
  },
  draw2d: (ctx, c) =>
    backSym(ctx, () => {
      const { w, d } = BIKE;
      for (const z of [-d / 2 + 0.05, d / 2 - 0.08]) D.rr(ctx, 0, z, w - 0.04, 0.07, 0.03, tint(c.frame, 0.1), undefined, LINE_THIN);
      D.rr(ctx, 0, 0.15, 0.15, 0.5, 0.06, tint(c.frame, 0.2));
      D.line(ctx, 0, -d / 2 + 0.05, 0, -0.2, INK_SOFT, 0.03);
      D.ellipse(ctx, 0, -0.3, 0.08, 0.12, tint(c.seat, 0.4));
      D.line(ctx, -0.22, 0.22, 0.22, 0.22, INK_SOFT, 0.03);
      for (const s of [-1, 1]) D.rr(ctx, s * 0.17, -0.06, 0.1, 0.07, 0.01, tint(c.accent, 0.3), undefined, LINE_THIN);
    }),
};

const SPIN = { w: 0.56, d: 1.2, h: 1.3 };

const spinBike: FurnitureDef = {
  id: 'fit-spin-bike',
  name: 'אופני ספינינג',
  category: 'sports',
  group: G_MACH,
  tags: ['ספינינג', 'אופניים נייחים', 'גלגל תנופה', 'קרדיו'],
  size: SPIN,
  colors: [slot('frame', 'שלדה', '#1f2023'), slot('accent', 'פס צבע', '#d6402b'), slot('seat', 'מושב', '#1a1a1c')],
  actions: [{ kind: 'pedal', at: { x: 0, y: 1.0, z: 0.34 } }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { d } = SPIN;
    const frame = coat(c.frame);
    const accent = coat(c.accent);
    for (const z of [-d / 2 + 0.05, d / 2 - 0.05]) {
      k.rbox(SPIN.w - 0.02, 0.06, 0.08, 0.02, frame, 0, 0.02, z, 1);
      for (const s of [-1, 1]) k.cyl(0.028, 0.02, M.rubber(), s * (SPIN.w / 2 - 0.05), 0, z, 0.028, 10);
    }
    // heavy oval tube frame
    k.beam([0, 0.07, -d / 2 + 0.05], [0, 0.32, -0.05], 0.06, 0.09, frame, 0.02);
    k.beam([0, 0.32, -0.05], [0, 0.75, -0.26], 0.07, 0.09, frame, 0.02);
    k.beam([0, 0.07, d / 2 - 0.05], [0, 0.46, 0.2], 0.06, 0.09, frame, 0.02);
    k.beam([0, 0.32, -0.05], [0, 0.82, 0.24], 0.07, 0.09, accent, 0.02);
    k.beam([0, 0.46, 0.2], [0, 0.82, 0.24], 0.06, 0.08, frame, 0.02);
    // exposed chrome flywheel (animated) + half guard
    const fw = k.part('spin', 0, 0.34, 0.32);
    xcyl(fw, 0.23, 0.045, M.chrome(), 0, 0, 0, 30);
    xcyl(fw, 0.18, 0.05, M.metal('#5a5d62', 0.35, 1), 0, 0, 0, 24);
    xcyl(fw, 0.04, 0.07, M.blackMetal(), 0, 0, 0, 12);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      fw.beam([0.027, Math.sin(a) * 0.05, Math.cos(a) * 0.05], [0.027, Math.sin(a) * 0.17, Math.cos(a) * 0.17], 0.004, 0.02, M.plastic('#2a2b2e'));
    }
    // belt guard (right side)
    k.rbox(0.022, 0.07, 0.4, 0.03, M.plastic('#2a2b2e'), 0.075, 0.29, 0.13, 1);
    k.box(0.004, 0.012, 0.3, M.plastic(c.accent), 0.087, 0.32, 0.13);
    cranks(k, 0.32, -0.05, 0.07, 0.17, M.plastic(c.accent));
    // seat post and saddle with fore-aft slider
    k.beam([0, 0.75, -0.26], [0, 0.92, -0.31], 0.04, 0.045, M.chrome(), 0.006);
    k.rbox(0.04, 0.03, 0.18, 0.006, M.blackMetal(), 0, 0.925, -0.33, 1);
    saddle(k, M.leather(c.seat), 0, 1.0, -0.33, 0.92);
    // handlebar post and bull-horn bars
    k.beam([0, 0.82, 0.24], [0, 1.08, 0.22], 0.04, 0.045, M.chrome(), 0.006);
    const bar = foam();
    k.tube([[-0.2, 1.14, 0.0], [-0.24, 1.12, 0.14], [-0.15, 1.1, 0.23], [0, 1.1, 0.24], [0.15, 1.1, 0.23], [0.24, 1.12, 0.14], [0.2, 1.14, 0.0]], 0.017, bar, { seg: 30 });
    for (const s of [-1, 1]) k.rod([s * 0.06, 1.1, 0.23], [s * 0.05, 1.08, 0.08], 0.016, bar, 0.016, 8);
    // resistance knob + bottle holder
    k.cyl(0.035, 0.04, M.plastic('#d0302a'), 0, 0.84, 0.22, 0.03, 12);
    k.cyl(0.035, 0.2, M.plastic('#e8eaec'), 0, 0.5, 0.32, 0.035, 12);
    return faceBack(k.g);
  },
  draw2d: (ctx, c) =>
    backSym(ctx, () => {
      const { w, d } = SPIN;
      for (const z of [-d / 2 + 0.05, d / 2 - 0.05]) D.rr(ctx, 0, z, w - 0.02, 0.08, 0.02, tint(c.frame, 0.4), undefined, LINE_THIN);
      D.rr(ctx, 0, 0.32, 0.05, 0.46, 0.02, '#d9dadc');
      D.line(ctx, 0, -d / 2 + 0.05, 0, d / 2 - 0.05, INK_SOFT, 0.04);
      D.ellipse(ctx, 0, -0.33, 0.08, 0.12, tint(c.seat, 0.4));
      D.poly(ctx, [[-0.2, 0.0], [-0.24, 0.14], [-0.15, 0.23], [0.15, 0.23], [0.24, 0.14], [0.2, 0]], false, null, INK_SOFT, 0.03);
      for (const s of [-1, 1]) D.rr(ctx, s * 0.14, -0.05, 0.1, 0.07, 0.01, tint(c.accent, 0.3), undefined, LINE_THIN);
    }),
};

const REC = { w: 0.64, d: 1.6, h: 1.28 };

const recumbentBike: FurnitureDef = {
  id: 'fit-recumbent-bike',
  name: 'אופני כושר עם משענת',
  category: 'sports',
  group: G_MACH,
  tags: ['אופניים רכובים', 'משענת גב', 'קרדיו', 'שיקום'],
  size: REC,
  colors: [slot('frame', 'שלדה', '#d9dcdf'), slot('seat', 'ריפוד', '#2a2c30'), slot('accent', 'פס צבע', '#3aa776')],
  actions: [{ kind: 'pedal', at: { x: 0, y: 0.6, z: 0.38 } }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { d } = REC;
    const frame = coat(c.frame);
    const pad = M.leather(c.seat);
    for (const z of [-d / 2 + 0.05, d / 2 - 0.06]) {
      xcyl(k, 0.035, REC.w - 0.06, frame, 0, 0.05, z, 14);
      for (const s of [-1, 1]) xcyl(k, 0.028, 0.025, M.rubber(), s * (REC.w / 2 - 0.02), 0.028, z, 12);
    }
    // low step-through spine
    k.beam([0, 0.06, -d / 2 + 0.05], [0, 0.18, -0.4], 0.08, 0.1, frame, 0.02);
    k.beam([0, 0.18, -0.4], [0, 0.18, 0.32], 0.08, 0.1, frame, 0.02);
    k.beam([0, 0.06, d / 2 - 0.06], [0, 0.2, 0.5], 0.07, 0.09, frame, 0.02);
    // seat on a slider
    k.rbox(0.1, 0.06, 0.5, 0.015, M.chrome(), 0, 0.23, -0.36, 1);
    k.beam([0, 0.28, -0.38], [0, 0.48, -0.38], 0.06, 0.06, frame, 0.01);
    k.cushion(0.46, 0.09, 0.4, pad, 0, 0.5, -0.36, 0.04, 0.015);
    const back = new Kit();
    back.cushion(0.44, 0.08, 0.5, pad, 0, -0.04, -0.25, 0.04, 0.02);
    back.rbox(0.4, 0.03, 0.46, 0.01, M.plastic(DARK), 0, -0.07, -0.25, 1);
    k.sub(back, 0, 0.56, -0.53).rotation.x = 1.25;
    k.beam([0, 0.3, -0.42], [0, 0.62, -0.66], 0.04, 0.04, frame, 0.006);
    for (const s of [-1, 1]) {
      k.tube([[s * 0.25, 0.48, -0.5], [s * 0.28, 0.55, -0.4], [s * 0.28, 0.55, -0.22]], 0.014, M.steel(), { seg: 10 });
      k.rod([s * 0.28, 0.55, -0.34], [s * 0.28, 0.55, -0.2], 0.02, foam(), 0.02, 8);
      k.rod([s * 0.23, 0.3, -0.38], [s * 0.28, 0.55, -0.4], 0.012, M.steel(), 0.012, 8);
    }
    // front drive housing (flywheel hidden) + side discs (animated)
    k.rbox(0.18, 0.5, 0.52, 0.1, M.plastic(c.frame), 0, 0.12, 0.42, 2);
    k.rbox(0.185, 0.05, 0.36, 0.02, M.plastic(c.accent), 0, 0.5, 0.42, 1);
    const fw = k.part('spin', 0, 0.36, 0.44);
    for (const s of [-1, 1]) {
      xcyl(fw, 0.15, 0.008, M.plastic('#4a4d52'), s * 0.093, 0, 0, 24);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        fw.beam([s * 0.098, 0, 0], [s * 0.098, Math.sin(a) * 0.13, Math.cos(a) * 0.13], 0.004, 0.018, M.chrome());
      }
    }
    cranks(k, 0.4, 0.2, 0.11, 0.16, M.plastic(c.accent));
    // console mast
    k.beam([0, 0.6, 0.55], [0, 1.08, 0.48], 0.05, 0.06, frame, 0.01);
    k.tube([[-0.2, 0.92, 0.36], [-0.18, 1.0, 0.46], [0, 1.02, 0.49], [0.18, 1.0, 0.46], [0.2, 0.92, 0.36]], 0.015, M.steel(), { seg: 18 });
    consoleUnit(k, 0.3, 0.18, 0.06, M.plastic(DARK), c.accent, 0, 1.17, 0.5, 0.6);
    return faceBack(k.g);
  },
  draw2d: (ctx, c) =>
    backSym(ctx, () => {
      const { w, d } = REC;
      for (const z of [-d / 2 + 0.05, d / 2 - 0.06]) D.rr(ctx, 0, z, w - 0.04, 0.07, 0.03, tint(c.frame, 0.1), undefined, LINE_THIN);
      D.line(ctx, 0, -d / 2 + 0.05, 0, d / 2 - 0.06, INK_SOFT, 0.05);
      D.rr(ctx, 0, -0.36, 0.46, 0.4, 0.05, tint(c.seat, 0.45));
      D.rr(ctx, 0, -0.62, 0.44, 0.16, 0.04, tint(c.seat, 0.3));
      D.rr(ctx, 0, 0.42, 0.18, 0.52, 0.06, tint(c.frame, 0.2));
      for (const s of [-1, 1]) D.rr(ctx, s * 0.18, 0.2, 0.1, 0.07, 0.01, tint(c.accent, 0.3), undefined, LINE_THIN);
    }),
};

/* ================================================================== rowing machine */

const ROW = { w: 0.6, d: 2.4, h: 1.0 };

const rower: FurnitureDef = {
  id: 'fit-rower',
  name: 'מכשיר חתירה',
  category: 'sports',
  group: G_MACH,
  tags: ['חתירה', 'קרדיו', 'מאוורר אוויר', 'כושר'],
  size: ROW,
  colors: [slot('frame', 'מסגרת', '#2a2c30'), slot('rail', 'מסילה', '#c3c6ca'), slot('accent', 'מושב', '#1d1e20')],
  actions: [{ kind: 'row', at: { x: 0, y: 0.43, z: 0.15 } }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { d } = ROW;
    const frame = coat(c.frame);
    const rail = M.brushed(c.rail);
    const fanZ = d / 2 - 0.36;
    const fanY = 0.42;
    // front legs + stabiliser
    k.rbox(ROW.w - 0.02, 0.05, 0.08, 0.02, frame, 0, 0.0, d / 2 - 0.07, 1);
    k.beam([0, 0.05, d / 2 - 0.07], [0, fanY - 0.1, fanZ + 0.1], 0.07, 0.07, frame, 0.012);
    // fan cage: dark rims, translucent mesh sides
    for (const s of [-1, 1]) {
      xcyl(k, 0.3, 0.01, M.glass('#1f2226', 0.55), s * 0.085, fanY, fanZ, 24);
      k.add(mesh(new THREE.TorusGeometry(0.3, 0.012, 5, 28), M.plastic(DARK)), s * 0.085, fanY, fanZ).rotation.y = Math.PI / 2;
      k.add(mesh(new THREE.TorusGeometry(0.1, 0.008, 6, 20), M.plastic(DARK)), s * 0.09, fanY, fanZ).rotation.y = Math.PI / 2;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        k.rod([s * 0.09, fanY + Math.sin(a) * 0.1, fanZ + Math.cos(a) * 0.1], [s * 0.09, fanY + Math.sin(a) * 0.29, fanZ + Math.cos(a) * 0.29], 0.004, M.plastic(DARK), 0.004, 3);
      }
    }
    // cage drum (top half)
    const drum = new THREE.CylinderGeometry(0.3, 0.3, 0.17, 20, 1, true, 0, Math.PI);
    drum.rotateZ(Math.PI / 2);
    k.add(mesh(drum, M.plastic(DARK)), 0, fanY, fanZ).rotation.x = Math.PI / 2;
    // fan wheel (animated)
    const fan = k.part('spin', 0, fanY, fanZ);
    xcyl(fan, 0.05, 0.16, M.blackMetal(), 0, 0, 0, 14);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const b = fan.beam([0, Math.sin(a) * 0.05, Math.cos(a) * 0.05], [0, Math.sin(a) * 0.27, Math.cos(a) * 0.27], 0.14, 0.012, M.plastic('#3f4247'));
      b.rotateY(0.0);
    }
    // monorail
    const railY = 0.3;
    k.rbox(0.08, 0.05, d - 0.62, 0.008, rail, 0, railY, -0.21, 1);
    k.beam([0, railY, fanZ - 0.08], [0, fanY - 0.06, fanZ - 0.02], 0.08, 0.06, frame, 0.012);
    // rear leg
    k.beam([0, railY, -d / 2 + 0.12], [0, 0.04, -d / 2 + 0.06], 0.07, 0.06, frame, 0.012);
    k.rbox(0.46, 0.05, 0.08, 0.02, frame, 0, 0, -d / 2 + 0.06, 1);
    // seat with rollers
    k.rbox(0.12, 0.05, 0.24, 0.01, M.blackMetal(), 0, railY + 0.05, -0.15, 1);
    k.cushion(0.3, 0.05, 0.27, M.leather(c.accent), 0, railY + 0.08, -0.15, 0.03, 0.006);
    for (const sz of [-1, 1]) xcyl(k, 0.02, 0.14, M.plastic('#5a5d62'), 0, railY + 0.035, -0.15 + sz * 0.08, 10);
    // footrests with straps
    for (const s of [-1, 1]) {
      const f = new Kit();
      f.rbox(0.13, 0.015, 0.3, 0.005, M.plastic(DARK), 0, 0, 0, 1);
      f.rbox(0.135, 0.022, 0.045, 0.006, M.plastic('#a8acb0'), 0, 0.012, 0.03, 1);
      f.rbox(0.12, 0.05, 0.02, 0.006, M.plastic(DARK), 0, 0, -0.15, 1);
      k.sub(f, s * 0.1, 0.38, fanZ - 0.33).rotation.x = 0.85;
    }
    // handle on its hook + chain into the fan
    k.rod([-0.25, 0.62, fanZ - 0.2], [0.25, 0.62, fanZ - 0.2], 0.014, M.steel(), 0.014, 8);
    for (const s of [-1, 1]) k.rod([s * 0.25, 0.62, fanZ - 0.2], [s * 0.14, 0.62, fanZ - 0.2], 0.019, foam(), 0.019, 8);
    k.rod([0, 0.62, fanZ - 0.2], [0, fanY + 0.06, fanZ - 0.06], 0.004, M.steel(), 0.004, 4);
    // monitor arm
    k.tube([[0, fanY + 0.26, fanZ - 0.02], [0, 0.78, fanZ - 0.12], [0, 0.82, fanZ - 0.24]], 0.016, M.steel(), { seg: 12, radial: 6 });
    consoleUnit(k, 0.2, 0.15, 0.05, M.plastic(DARK), '#3a7bd5', 0, 0.92, fanZ - 0.26, 0.55);
    return faceBack(k.g);
  },
  draw2d: (ctx, c) =>
    backSym(ctx, () => {
      const { w, d } = ROW;
      D.rr(ctx, 0, -0.21, 0.08, d - 0.62, 0.01, tint(c.rail, 0.2));
      D.rr(ctx, 0, d / 2 - 0.36, 0.19, 0.62, 0.05, tint(c.frame, 0.45));
      D.rr(ctx, 0, d / 2 - 0.07, w - 0.02, 0.08, 0.02, tint(c.frame, 0.4), undefined, LINE_THIN);
      D.rr(ctx, 0, -d / 2 + 0.06, 0.46, 0.08, 0.02, tint(c.frame, 0.4), undefined, LINE_THIN);
      D.rr(ctx, 0, -0.15, 0.3, 0.27, 0.05, tint(c.accent, 0.5));
      for (const s of [-1, 1]) D.rr(ctx, s * 0.1, d / 2 - 0.69, 0.13, 0.2, 0.02, tint('#3c3e42', 0.5), undefined, LINE_THIN);
      D.line(ctx, -0.25, d / 2 - 0.56, 0.25, d / 2 - 0.56, INK_SOFT, 0.025);
    }),
};

/* ================================================================== weights */

/** Hex dumbbell lying along Z (handle front-back), centred at (x, y = bottom, z). */
function dumbbell(k: Kit, kg: number, x: number, y: number, z: number, head: THREE.Material): number {
  const r = 0.042 + kg * 0.0018;
  const hl = 0.035 + kg * 0.0015;
  const grip = 0.13;
  for (const s of [-1, 1]) {
    const m = zcyl(k, r, hl, head, x, y + r, z + s * (grip / 2 + hl / 2), 6);
    m.rotateY(Math.PI / 6);
    zcyl(k, r * 0.55, 0.008, M.chrome(), x, y + r, z + s * (grip / 2 + hl + 0.004), 12);
  }
  zcyl(k, 0.016, grip + 0.01, M.metal('#bfc2c5', 0.55, 1), x, y + r, z, 10);
  return r;
}

const DBR = { w: 1.35, d: 0.62, h: 0.94 };

const dumbbellRack: FurnitureDef = {
  id: 'fit-dumbbell-rack',
  name: 'מתקן משקולות יד',
  category: 'sports',
  group: G_WEIGHTS,
  tags: ['משקולות', 'דמבלים', 'חדר כושר', 'כוח'],
  size: DBR,
  colors: [slot('frame', 'מתקן', '#25272b'), slot('head', 'ראשי משקולות', '#1b1c1e')],
  actions: [{ kind: 'workout', label: 'הרמת משקולות', at: { x: 0, y: 0, z: 0.8 } }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { w, d, h } = DBR;
    const frame = coat(c.frame);
    const head = M.rubber(c.head);
    // A-frame ends
    for (const s of [-1, 1]) {
      const x = s * (w / 2 - 0.04);
      k.rbox(0.07, 0.05, d, 0.01, frame, x, 0, 0, 1);
      k.beam([x, 0.05, 0.18], [x, h - 0.02, -0.05], 0.06, 0.06, frame, 0.008);
      k.beam([x, 0.05, -0.22], [x, h - 0.02, -0.12], 0.06, 0.06, frame, 0.008);
      k.rbox(0.08, 0.02, 0.18, 0.006, frame, x, h - 0.02, -0.085, 1);
      for (const z of [-d / 2 + 0.04, d / 2 - 0.04]) k.cyl(0.03, 0.012, M.rubber(), x, -0.0, z, 0.03, 10);
    }
    // two angled tiers with saddles
    const tiers = [
      { y: 0.42, z: 0.1, kg: [2, 4, 6, 8, 10] },
      { y: 0.74, z: -0.08, kg: [12, 14, 16, 18, 20] },
    ];
    tiers.forEach((t) => {
      const tier = new Kit();
      tier.rbox(w - 0.08, 0.025, 0.3, 0.005, frame, 0, 0, 0, 1);
      tier.rbox(w - 0.1, 0.006, 0.28, 0.003, M.rubber('#2e3034'), 0, 0.025, 0, 1);
      const n = t.kg.length;
      t.kg.forEach((kg, i) => {
        const x = -w / 2 + 0.16 + (i * (w - 0.32)) / (n - 1);
        dumbbell(tier, kg, x, 0.031, 0, head);
      });
      k.sub(tier, 0, t.y, t.z).rotation.x = 0.16;
    });
    // brand plate
    k.box(0.26, 0.05, 0.006, M.plastic('#c22e2a'), 0, 0.28, 0.17);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { w, d } = DBR;
      D.rr(ctx, 0, 0, w - 0.06, d - 0.06, 0.02, tint(c.frame, 0.55));
      for (const s of [-1, 1]) D.rr(ctx, s * (w / 2 - 0.04), 0, 0.07, d, 0.01, tint(c.frame, 0.3), undefined, LINE_THIN);
      for (const row of [0.1, -0.12]) {
        for (let i = 0; i < 5; i++) {
          const x = -w / 2 + 0.16 + (i * (w - 0.32)) / 4;
          D.line(ctx, x, row - 0.08, x, row + 0.08, INK_SOFT, 0.012);
          D.rr(ctx, x, row - 0.1, 0.1, 0.05, 0.01, tint(c.head, 0.4), undefined, LINE_THIN);
          D.rr(ctx, x, row + 0.1, 0.1, 0.05, 0.01, tint(c.head, 0.4), undefined, LINE_THIN);
        }
      }
    }),
};

/** Kettlebell, bottom at y. */
function kettlebell(k: Kit, s: number, mat: THREE.Material, x: number, y: number, z: number, rot = 0): void {
  const g = new Kit();
  g.lathe(
    [
      [0, 0],
      [0.06 * s, 0],
      [0.1 * s, 0.03 * s],
      [0.11 * s, 0.09 * s],
      [0.095 * s, 0.15 * s],
      [0.055 * s, 0.18 * s],
      [0, 0.185 * s],
    ],
    mat,
    0,
    0,
    0,
    18,
  );
  const hy = 0.16 * s;
  g.tube(
    [
      [-0.075 * s, hy - 0.02 * s, 0],
      [-0.075 * s, hy + 0.08 * s, 0],
      [-0.05 * s, hy + 0.13 * s, 0],
      [0, hy + 0.14 * s, 0],
      [0.05 * s, hy + 0.13 * s, 0],
      [0.075 * s, hy + 0.08 * s, 0],
      [0.075 * s, hy - 0.02 * s, 0],
    ],
    0.016 * s,
    mat,
    { seg: 16, radial: 6 },
  );
  k.sub(g, x, y, z).rotation.y = rot;
}

const KB = { w: 1.0, d: 0.42, h: 0.72 };

const kettlebellRack: FurnitureDef = {
  id: 'fit-kettlebell-set',
  name: 'סט קטלבלים על מדף',
  category: 'sports',
  group: G_WEIGHTS,
  tags: ['קטלבל', 'משקולות', 'קרוספיט', 'כוח'],
  size: KB,
  colors: [slot('frame', 'מדף', '#2a2c30'), slot('bell', 'קטלבלים', '#2b2c2f'), slot('mark', 'סימון משקל', '#e0b437')],
  actions: [{ kind: 'workout', label: 'אימון קטלבל', at: { x: 0, y: 0, z: 0.65 } }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { w, d } = KB;
    const frame = coat(c.frame);
    const bell = M.metal(c.bell, 0.6, 0.6);
    for (const s of [-1, 1]) {
      for (const z of [-d / 2 + 0.03, d / 2 - 0.03]) k.box(0.04, 0.7, 0.04, frame, s * (w / 2 - 0.02), 0, z);
    }
    for (const y of [0.06, 0.42]) {
      k.rbox(w, 0.025, d, 0.005, frame, 0, y, 0, 1);
      k.rbox(w - 0.04, 0.006, d - 0.04, 0.003, M.rubber('#303236'), 0, y + 0.025, 0, 1);
    }
    k.rbox(w, 0.02, 0.04, 0.005, frame, 0, 0.68, -d / 2 + 0.02, 1);
    const sizes = [
      [0.8, 0.72, 0.66],
      [0.95, 0.88, 0.82],
    ];
    sizes.forEach((row, ri) => {
      const y = ri === 0 ? 0.451 : 0.091;
      row.forEach((s, i) => {
        const x = -0.3 + i * 0.3;
        kettlebell(k, s, bell, x, y, 0, 0.2 * (i - 1));
        // coloured weight band
        k.add(mesh(new THREE.TorusGeometry(0.103 * s, 0.006, 4, 20), M.plastic(ri === 0 ? c.mark : lighten(c.mark, 0.1 * i))), x, y + 0.09 * s, 0).rotation.x = Math.PI / 2;
      });
    });
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { w, d } = KB;
      D.rr(ctx, 0, 0, w, d, 0.01, tint(c.frame, 0.55));
      for (let i = 0; i < 3; i++) {
        D.circle(ctx, -0.3 + i * 0.3, 0, 0.12 - i * 0.008, tint(c.bell, 0.4), undefined, LINE_THIN);
        D.arc(ctx, -0.3 + i * 0.3, 0, 0.07, 0, Math.PI * 2, INK_SOFT, 0.012);
      }
    }),
};

/** Olympic-style barbell along X, centred at (0, y, z). */
function barbell(k: Kit, len: number, y: number, z: number, plate: THREE.Material, plates: number[]): void {
  xcyl(k, 0.014, len, M.metal('#c8cbce', 0.45, 1), 0, y, z, 10);
  for (const s of [-1, 1]) {
    xcyl(k, 0.026, len * 0.22, M.chrome(), s * (len / 2 - len * 0.11), y, z, 12);
    let x = len / 2 - len * 0.22 + 0.02;
    xcyl(k, 0.04, 0.02, M.chrome(), s * (x - 0.01), y, z, 12);
    plates.forEach((r) => {
      const t = 0.025 + r * 0.06;
      xcyl(k, r, t, plate, s * (x + t / 2), y, z, 28);
      xcyl(k, 0.06, t + 0.004, M.chrome(), s * (x + t / 2), y, z, 14);
      x += t + 0.003;
    });
    xcyl(k, 0.035, 0.03, M.plastic('#c22e2a'), s * (x + 0.015), y, z, 12);
  }
}

const BENCH = { w: 1.8, d: 1.45, h: 1.33 };

const weightBench: FurnitureDef = {
  id: 'fit-weight-bench',
  name: 'ספסל לחיצת חזה עם מוט',
  category: 'sports',
  group: G_WEIGHTS,
  tags: ['ספסל כוח', 'מוט משקולות', 'לחיצת חזה', 'צלחות'],
  size: BENCH,
  colors: [slot('frame', 'מסגרת', '#1f2023'), slot('pad', 'ריפוד', '#b3292b'), slot('plate', 'צלחות', '#1c1d1f')],
  actions: [{ kind: 'workout', label: 'לחיצת חזה', at: { x: 0, y: 0, z: 0.95 } }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { w, d } = BENCH;
    const frame = coat(c.frame);
    const pad = M.leather(c.pad);
    // bench: feet, spine, pad
    const bz0 = -d / 2 + 0.25;
    const bz1 = d / 2 - 0.05;
    for (const z of [bz0 + 0.05, bz1 - 0.04]) {
      k.rbox(0.5, 0.05, 0.06, 0.015, frame, 0, 0, z, 1);
      for (const s of [-1, 1]) k.cyl(0.022, 0.01, M.rubber(), s * 0.22, 0, z, 0.022, 8);
    }
    for (const z of [bz0 + 0.05, bz1 - 0.04]) k.beam([0, 0.05, z], [0, 0.36, z + (z < 0 ? 0.06 : -0.06)], 0.06, 0.08, frame, 0.01);
    k.rbox(0.07, 0.07, bz1 - bz0 - 0.15, 0.01, frame, 0, 0.32, (bz0 + bz1) / 2, 1);
    k.cushion(0.28, 0.06, bz1 - bz0, pad, 0, 0.385, (bz0 + bz1) / 2, 0.03, 0.01);
    k.rbox(0.26, 0.015, bz1 - bz0 - 0.03, 0.006, M.wood(PAL.birch), 0, 0.37, (bz0 + bz1) / 2, 1);
    // uprights with J-hooks at the head end
    const uz = -d / 2 + 0.2;
    for (const s of [-1, 1]) {
      const x = s * 0.55;
      k.rbox(0.07, 0.05, 0.36, 0.01, frame, x, 0, uz + 0.04, 1);
      k.box(0.06, 1.18, 0.06, frame, x, 0.05, uz);
      for (let i = 0; i < 10; i++) k.cyl(0.008, 0.003, M.plastic('#d6d8db'), x, 0.6 + i * 0.05, uz + 0.031, 0.008, 6).rotation.x = Math.PI / 2;
      k.box(0.05, 0.08, 0.1, M.plastic(c.pad), x, 1.02, uz + 0.06);
      k.rbox(0.06, 0.018, 0.06, 0.004, frame, x, 1.22, uz, 1);
      // weight plate storage peg
      k.rod([x, 0.2, uz - 0.02], [x + s * 0.12, 0.2, uz - 0.02], 0.022, M.chrome(), 0.022, 10);
    }
    k.beam([-0.55, 0.3, uz], [0.55, 0.3, uz], 0.05, 0.05, frame, 0.008);
    barbell(k, 1.8, 1.1, uz + 0.06, M.rubber(c.plate), [0.225, 0.17]);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { w, d } = BENCH;
      const bz0 = -d / 2 + 0.25;
      const bz1 = d / 2 - 0.05;
      D.rr(ctx, 0, (bz0 + bz1) / 2, 0.28, bz1 - bz0, 0.05, tint(c.pad, 0.4));
      for (const s of [-1, 1]) D.rr(ctx, s * 0.55, -d / 2 + 0.24, 0.08, 0.36, 0.01, tint(c.frame, 0.4), undefined, LINE_THIN);
      D.line(ctx, -w / 2 + 0.01, -d / 2 + 0.26, w / 2 - 0.01, -d / 2 + 0.26, INK_SOFT, 0.025);
      for (const s of [-1, 1]) {
        D.rr(ctx, s * 0.7, -d / 2 + 0.26, 0.04, 0.44, 0.01, tint(c.plate, 0.45), undefined, LINE_THIN);
        D.rr(ctx, s * 0.75, -d / 2 + 0.26, 0.035, 0.34, 0.01, tint(c.plate, 0.45), undefined, LINE_THIN);
      }
    }),
};

const RACK = { w: 1.85, d: 1.42, h: 2.25 };

const powerRack: FurnitureDef = {
  id: 'fit-power-rack',
  name: 'כלוב סקוואט',
  category: 'sports',
  group: G_WEIGHTS,
  tags: ['סקוואט', 'כלוב כוח', 'מתח', 'מוט אולימפי'],
  size: RACK,
  colors: [slot('frame', 'מסגרת', '#1f2023'), slot('accent', 'פרטים', '#c9a13b'), slot('plate', 'צלחות', '#1c1d1f')],
  actions: [{ kind: 'workout', label: 'סקוואט', at: { x: 0, y: 0, z: 0.1 } }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { d, h } = RACK;
    const frame = coat(c.frame);
    const px = 0.56;
    const pz = 0.55;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        k.box(0.075, h - 0.06, 0.075, frame, sx * px, 0.03, sz * pz);
        for (let i = 0; i < 26; i++) k.box(0.02, 0.02, 0.002, M.matte('#0c0c0d'), sx * px, 0.45 + i * 0.05, sz * (pz - 0.038));
        k.rbox(0.12, 0.03, 0.12, 0.008, frame, sx * px, 0, sz * pz, 1);
      }
      // base runners + top runners
      k.box(0.075, 0.06, pz * 2 + 0.075, frame, sx * px, 0.03, 0);
      k.box(0.075, 0.075, pz * 2 + 0.075, frame, sx * px, h - 0.075, 0);
      // safety spotter arms
      k.box(0.05, 0.05, pz * 2 + 0.16, M.steel(), sx * px, 0.75, 0);
      // J-hooks
      k.rbox(0.09, 0.1, 0.08, 0.01, M.metal(c.accent, 0.35, 0.8), sx * px, 1.28, pz - 0.075, 1);
      // plate storage horns at the back
      k.rod([sx * px, 0.5, -pz - 0.04], [sx * px, 0.5, -d / 2 + 0.0], 0.025, M.chrome(), 0.025, 10);
    }
    k.box(px * 2, 0.075, 0.075, frame, 0, h - 0.075, -pz);
    k.box(px * 2, 0.06, 0.075, frame, 0, 0.03, -pz);
    // pull-up bar
    xcyl(k, 0.016, px * 2 + 0.08, M.metal('#c8cbce', 0.5, 1), 0, h - 0.11, pz + 0.04, 10);
    // stored plates on the back horns
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const r = i === 0 ? 0.225 : 0.17;
        zcyl(k, r, 0.04, M.rubber(c.plate), sx * px, 0.5, -pz - 0.045 - i * 0.045, 26);
      }
    }
    // barbell on the hooks
    barbell(k, 1.85, 1.36, pz - 0.075, M.rubber(c.plate), [0.225]);
    // floor platform
    k.rbox(1.0, 0.012, 1.0, 0.004, M.rubber('#2a2b2e'), 0, 0, 0, 1);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { w, d } = RACK;
      D.rr(ctx, 0, 0, 1.0, 1.0, 0.01, tint('#2a2b2e', 0.7), undefined, LINE_THIN);
      const px = 0.56;
      const pz = 0.55;
      for (const sx of [-1, 1]) {
        D.rr(ctx, sx * px, 0, 0.08, pz * 2 + 0.08, 0.005, tint(c.frame, 0.4));
        for (const sz of [-1, 1]) D.rr(ctx, sx * px, sz * pz, 0.12, 0.12, 0.01, tint(c.frame, 0.2));
      }
      D.line(ctx, -w / 2 + 0.01, pz - 0.075, w / 2 - 0.01, pz - 0.075, INK_SOFT, 0.025);
      for (const s of [-1, 1]) D.rr(ctx, s * 0.78, pz - 0.075, 0.05, 0.44, 0.01, tint(c.plate, 0.45), undefined, LINE_THIN);
      D.line(ctx, -px, -pz, px, -pz, INK_SOFT, 0.03);
    }),
};

/* ================================================================== mats & small gear */

function matItem(o: { id: string; name: string; tags: string[]; w: number; d: number; t: number; color: string; fold?: number }): FurnitureDef {
  const { w, d, t } = o;
  return {
    id: o.id,
    name: o.name,
    category: 'sports',
    group: G_WEIGHTS,
    tags: o.tags,
    size: { w, d, h: t },
    walkable: true,
    colors: [slot('mat', 'מזרן', o.color)],
    actions: [{ kind: 'workout', label: 'יוגה ומתיחות', at: { x: 0, y: t, z: 0 } }],
    build: ({ colors: c }) => {
      const k = new Kit();
      const m = o.fold ? M.leather(c.mat) : M.rubber(c.mat);
      if (o.fold) {
        const n = o.fold;
        const pd = d / n;
        for (let i = 0; i < n; i++) k.cushion(w, t, pd - 0.006, m, 0, 0, -d / 2 + pd / 2 + i * pd, Math.min(0.012, t * 0.45), 0.003);
        // carry handles on the side
        for (const s of [-1, 1]) k.rbox(0.01, t * 0.5, 0.14, 0.003, M.fabric('#2b2c2f'), s * (w / 2 - 0.004), t * 0.25, -d / 2 + pd / 2, 1);
      } else {
        k.rbox(w, t, d, t * 0.45, m, 0, 0, 0, 1);
        // alignment lines printed on top
        for (const z of [-d / 2 + 0.12, d / 2 - 0.12]) k.box(w - 0.08, 0.0008, 0.004, M.matte(lighten(c.mat, 0.35)), 0, t, z);
        k.box(0.004, 0.0008, d - 0.3, M.matte(lighten(c.mat, 0.35)), 0, t, 0);
      }
      return k.g;
    },
    draw2d: (ctx, c) =>
      sym(ctx, () => {
        D.rr(ctx, 0, 0, w, d, 0.02, tint(c.mat, 0.35));
        if (o.fold) for (let i = 1; i < o.fold; i++) D.line(ctx, -w / 2, -d / 2 + (i * d) / o.fold, w / 2, -d / 2 + (i * d) / o.fold, INK_SOFT, 0.008);
        else {
          for (const z of [-d / 2 + 0.12, d / 2 - 0.12]) D.line(ctx, -w / 2 + 0.04, z, w / 2 - 0.04, z, INK_SOFT, 0.006);
          D.line(ctx, 0, -d / 2 + 0.15, 0, d / 2 - 0.15, INK_SOFT, 0.006);
        }
      }),
  };
}

const STAB = { r: 0.325 };

const stabilityBall: FurnitureDef = {
  id: 'fit-stability-ball',
  name: 'כדור פיזיו (כדור ישיבה)',
  category: 'sports',
  group: G_WEIGHTS,
  tags: ['כדור פילאטיס', 'כדור ישיבה', 'פיזיותרפיה', 'יוגה'],
  size: { w: 0.66, d: 0.66, h: 0.62 },
  colors: [slot('ball', 'כדור', '#6aa3c9')],
  seats: [{ x: 0, z: 0, height: 0.6, facing: 0, kind: 'sit' }],
  actions: [{ kind: 'workout', label: 'תרגילי ליבה', at: { x: 0, y: 0, z: 0.55 } }],
  build: ({ colors: c }) => {
    const k = new Kit();
    // slightly squashed under its own weight
    k.sphere(STAB.r, M.metal(c.ball, 0.38, 0), 0, 0.31, 0, 1.0, 0.953, 1.0, 32);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI;
      const m = k.add(mesh(new THREE.TorusGeometry(STAB.r * 1.0, 0.0012, 3, 48), M.matte(darken(c.ball, 0.12))), 0, 0.31, 0);
      m.rotation.set(0, a, 0);
      m.scale.set(1, 0.953, 1);
    }
    k.cyl(0.008, 0.006, M.plastic('#f2f2f0'), 0, 0.615, 0, 0.008, 8);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.circle(ctx, 0, 0, 0.325, tint(c.ball, 0.35));
      for (let i = 0; i < 3; i++) D.ellipse(ctx, 0, 0, 0.325 * Math.cos((i / 6) * Math.PI), 0.325, null, INK_SOFT, 0.005, (i / 3) * Math.PI);
    }),
};

const foamRoller: FurnitureDef = {
  id: 'fit-foam-roller',
  name: 'גליל עיסוי (פוֹם רולר)',
  category: 'sports',
  group: G_WEIGHTS,
  tags: ['גליל', 'עיסוי', 'שחרור שרירים', 'פילאטיס'],
  size: { w: 0.62, d: 0.15, h: 0.15 },
  colors: [slot('foam', 'קצף', '#e27b34'), slot('core', 'ליבה', '#2b2c2f')],
  actions: [{ kind: 'workout', label: 'עיסוי שרירים', at: { x: 0, y: 0, z: 0.45 } }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const r = 0.075;
    const foamM = M.leather(c.foam);
    const dark = M.rubber(c.core);
    // segmented grid surface: alternating raised bands
    const n = 9;
    const L = 0.6;
    for (let i = 0; i < n; i++) {
      const seg = L / n;
      const x = -L / 2 + seg / 2 + i * seg;
      xcyl(k, i % 2 === 0 ? r : r - 0.006, seg, i % 2 === 0 ? foamM : dark, x, r, 0, 18);
    }
    // grip grooves on the raised bands
    for (let i = 0; i < n; i += 2) {
      const x = -L / 2 + L / n / 2 + i * (L / n);
      for (const dx of [-0.012, 0.012]) k.add(mesh(new THREE.TorusGeometry(r + 0.0005, 0.0018, 3, 24), dark), x + dx, r, 0).rotation.y = Math.PI / 2;
    }
    for (const s of [-1, 1]) xcyl(k, 0.04, 0.012, dark, s * (L / 2 + 0.006), r, 0, 14);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 0.6, 0.15, 0.02, tint(c.foam, 0.35));
      for (let i = 1; i < 9; i++) D.line(ctx, -0.3 + i * (0.6 / 9), -0.07, -0.3 + i * (0.6 / 9), 0.07, INK_SOFT, 0.005);
    }),
};

const aerobicStep: FurnitureDef = {
  id: 'fit-aerobic-step',
  name: 'סטפ אירובי',
  category: 'sports',
  group: G_WEIGHTS,
  tags: ['סטפ', 'אירובי', 'מדרגה', 'קרדיו'],
  size: { w: 0.9, d: 0.36, h: 0.16 },
  colors: [slot('top', 'משטח', '#2b2c2f'), slot('riser', 'מגבהים', '#2f8fc8')],
  actions: [{ kind: 'workout', label: 'אימון סטפ', at: { x: 0, y: 0.16, z: 0 } }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const riser = M.plastic(c.riser);
    for (const s of [-1, 1]) {
      k.rbox(0.2, 0.08, 0.36, 0.02, riser, s * 0.33, 0, 0, 1);
      k.rbox(0.18, 0.012, 0.34, 0.004, M.rubber(), s * 0.33, 0, 0, 1);
    }
    k.rbox(0.9, 0.08, 0.36, 0.03, M.plastic('#3a3c40'), 0, 0.08, 0, 1);
    k.rbox(0.86, 0.006, 0.32, 0.003, M.rubber(c.top), 0, 0.155, 0, 1);
    for (let i = 0; i < 9; i++) k.box(0.84, 0.002, 0.008, M.rubber(darken(c.top, 0.2)), 0, 0.161, -0.14 + i * 0.035);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 0.9, 0.36, 0.04, tint('#3a3c40', 0.5));
      D.rr(ctx, 0, 0, 0.86, 0.32, 0.03, tint(c.top, 0.45), undefined, LINE_THIN);
      for (let i = 0; i < 9; i++) D.line(ctx, -0.4, -0.14 + i * 0.035, 0.4, -0.14 + i * 0.035, INK_SOFT, 0.004);
    }),
};

/* ================================================================== boxing */

/** Heavy bag: leather cylinder hanging from y = top (top of the bag body). */
function heavyBag(k: Kit, r: number, len: number, mat: THREE.Material, x: number, top: number, z: number, accent: string): void {
  const y0 = top - len;
  k.lathe(
    [
      [0, 0],
      [r * 0.82, 0],
      [r * 0.97, 0.025],
      [r, 0.07],
      [r, len - 0.06],
      [r * 0.96, len - 0.02],
      [r * 0.7, len],
      [0, len],
    ],
    mat,
    x,
    y0,
    z,
    24,
  );
  // seams + logo band
  for (const t of [0.25, 0.5, 0.75]) k.add(mesh(new THREE.TorusGeometry(r * 1.002, 0.002, 3, 32), M.matte(darken('#1a1a1a', 0))), x, y0 + len * t, z).rotation.x = Math.PI / 2;
  k.cyl(r * 1.004, len * 0.16, M.leather(accent), x, y0 + len * 0.55, z, r * 1.004, 24);
  // D-rings + straps on top
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    k.beam([x + Math.cos(a) * r * 0.8, top - 0.08, z + Math.sin(a) * r * 0.8], [x + Math.cos(a) * r * 0.55, top + 0.04, z + Math.sin(a) * r * 0.55], 0.025, 0.006, M.leather('#141414'));
  }
}

const PB = { w: 1.0, d: 1.45, h: 2.3 };

const punchingBagStand: FurnitureDef = {
  id: 'fit-punching-bag-stand',
  name: 'שק אגרוף על מעמד',
  category: 'sports',
  group: G_WEIGHTS,
  tags: ['אגרוף', 'שק חבטות', 'קיקבוקס', 'אומנויות לחימה'],
  size: PB,
  colors: [slot('bag', 'שק', '#1c1c1e'), slot('accent', 'פס', '#c8302a'), slot('frame', 'מעמד', '#2a2c30')],
  actions: [{ kind: 'workout', label: 'אגרוף', at: { x: 0, y: 0, z: 0.85 } }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { d, h } = PB;
    const frame = coat(c.frame);
    const postZ = -d / 2 + 0.2;
    const bagZ = 0.22;
    // H base with weight pegs
    k.rbox(0.9, 0.06, 0.08, 0.015, frame, 0, 0, postZ, 1);
    k.rbox(0.08, 0.06, d - 0.1, 0.015, frame, 0, 0, -0.0, 1);
    k.rbox(0.8, 0.06, 0.08, 0.015, frame, 0, 0, d / 2 - 0.09, 1);
    for (const s of [-1, 1]) {
      k.rod([s * 0.3, 0.09, postZ], [s * 0.3, 0.32, postZ], 0.022, M.chrome(), 0.022, 10);
      for (let i = 0; i < 2; i++) k.cyl(0.2, 0.035, M.rubber('#1c1d1f'), s * 0.3, 0.07 + i * 0.04, postZ + 0.0, 0.2, 24);
    }
    // post + boom
    k.box(0.08, h - 0.07, 0.08, frame, 0, 0.06, postZ);
    k.beam([0, h - 0.04, postZ], [0, h - 0.04, bagZ + 0.05], 0.07, 0.07, frame, 0.008);
    k.beam([0, h - 0.5, postZ + 0.04], [0, h - 0.06, postZ + 0.42], 0.05, 0.05, frame, 0.008);
    // swivel + chains
    k.cyl(0.02, 0.05, M.chrome(), 0, h - 0.13, bagZ, 0.02, 10);
    const bagTop = h - 0.52;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      chain(k, [0, h - 0.13, bagZ], [Math.cos(a) * 0.1, bagTop + 0.04, bagZ + Math.sin(a) * 0.1], M.chrome(), 0.035, 0.01);
    }
    heavyBag(k, 0.17, 1.05, M.leather(c.bag), 0, bagTop, bagZ, c.accent);
    // the bag sways on a spring tether to the front base bar
    k.rod([0, 0.06, d / 2 - 0.09], [0, bagTop - 1.05, bagZ + 0.02], 0.006, M.steel(), 0.006, 6);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { d } = PB;
      const postZ = -d / 2 + 0.2;
      D.rr(ctx, 0, postZ, 0.9, 0.08, 0.02, tint(c.frame, 0.4), undefined, LINE_THIN);
      D.rr(ctx, 0, 0, 0.08, d - 0.1, 0.02, tint(c.frame, 0.4), undefined, LINE_THIN);
      D.rr(ctx, 0, d / 2 - 0.09, 0.8, 0.08, 0.02, tint(c.frame, 0.4), undefined, LINE_THIN);
      for (const s of [-1, 1]) D.circle(ctx, s * 0.3, postZ, 0.2, tint('#1c1d1f', 0.6), undefined, LINE_THIN);
      D.rr(ctx, 0, postZ, 0.08, 0.08, 0, tint(c.frame, 0.2));
      D.circle(ctx, 0, 0.22, 0.17, tint(c.bag, 0.4));
      D.circle(ctx, 0, 0.22, 0.06, tint(c.accent, 0.2), undefined, LINE_THIN);
    }),
};

const CEIL_BAG = { w: 0.4, d: 0.4, h: 1.78 };

const ceilingBag: FurnitureDef = {
  id: 'fit-boxing-bag-ceiling',
  name: 'שק אגרוף תלוי מהתקרה',
  category: 'sports',
  group: G_WEIGHTS,
  tags: ['אגרוף', 'שק חבטות', 'תלייה מהתקרה', 'קיקבוקס'],
  size: CEIL_BAG,
  mount: 'ceiling',
  colors: [slot('bag', 'שק', '#7a1f1f'), slot('accent', 'פס', '#e8e6e0')],
  actions: [{ kind: 'workout', label: 'אגרוף', at: { x: 0, y: 0, z: 0.6 } }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const top = 2.7;
    k.rbox(0.16, 0.012, 0.16, 0.004, M.blackMetal(), 0, top - 0.012, 0, 1);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl(0.008, 0.004, M.chrome(), sx * 0.055, top - 0.016, sz * 0.055, 0.008, 6);
    k.box(0.03, 0.06, 0.02, M.blackMetal(), 0, top - 0.07, 0);
    k.cyl(0.018, 0.06, M.chrome(), 0, top - 0.14, 0, 0.018, 10);
    const bagTop = top - 0.58;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      chain(k, [0, top - 0.14, 0], [Math.cos(a) * 0.11, bagTop + 0.04, Math.sin(a) * 0.11], M.chrome(), 0.035, 0.01);
    }
    heavyBag(k, 0.18, 1.2, M.leather(c.bag), 0, bagTop, 0, c.accent);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.circle(ctx, 0, 0, 0.18, tint(c.bag, 0.4));
      D.circle(ctx, 0, 0, 0.07, tint(c.accent, 0.1), undefined, LINE_THIN);
      D.line(ctx, -0.12, -0.12, 0.12, 0.12, INK_SOFT, 0.006);
      D.line(ctx, -0.12, 0.12, 0.12, -0.12, INK_SOFT, 0.006);
    }),
};

/* ================================================================== bars */

const WB = { w: 0.9, d: 0.62, h: 2.45 };

const wallBars: FurnitureDef = {
  id: 'fit-wall-bars',
  name: 'סולם שוודי עם מתח',
  category: 'sports',
  group: G_WEIGHTS,
  tags: ['סולם שוודי', 'מתח', 'התעמלות', 'טיפוס'],
  size: WB,
  mount: 'wall',
  elevation: 0,
  colors: [slot('wood', 'עץ', PAL.birch), slot('bar', 'מוט מתח', '#2a2c30')],
  actions: [{ kind: 'workout', label: 'עליות מתח', at: { x: 0, y: 0, z: 0.75 } }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { w, d, h } = WB;
    const wood = M.wood(c.wood, 0.5);
    const zb = -d / 2;
    const sz = zb + 0.035 + 0.035;
    for (const s of [-1, 1]) k.rbox(0.035, h, 0.1, 0.008, wood, s * (w / 2 - 0.018), 0, zb + 0.05, 1);
    // wall brackets
    for (const y of [0.15, h - 0.2]) k.box(w - 0.04, 0.04, 0.02, wood, 0, y, zb + 0.01);
    // rungs (oval)
    for (let i = 0; i < 15; i++) {
      const y = 0.12 + i * 0.152;
      const m = xcyl(k, 0.017, w - 0.06, wood, 0, y, sz, 12);
      m.scale.set(1, 1, 1);
    }
    // pull-up bar on a bracket at the top
    const bar = coat(c.bar);
    for (const s of [-1, 1]) {
      k.beam([s * (w / 2 - 0.06), h - 0.32, zb + 0.1], [s * (w / 2 - 0.06), h - 0.04, d / 2 - 0.05], 0.04, 0.03, bar, 0.006);
      k.beam([s * (w / 2 - 0.06), h - 0.04, zb + 0.1], [s * (w / 2 - 0.06), h - 0.04, d / 2 - 0.05], 0.04, 0.03, bar, 0.006);
    }
    xcyl(k, 0.016, w - 0.04, M.metal('#c8cbce', 0.5, 1), 0, h - 0.06, d / 2 - 0.03, 10);
    for (const s of [-1, 1]) xcyl(k, 0.021, 0.16, foam(), s * 0.3, h - 0.06, d / 2 - 0.03, 10);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { w, d } = WB;
      D.rr(ctx, 0, -d / 2 + 0.05, w, 0.1, 0.01, tint(c.wood, 0.3));
      for (const s of [-1, 1]) D.line(ctx, s * (w / 2 - 0.06), -d / 2 + 0.1, s * (w / 2 - 0.06), d / 2 - 0.05, INK_SOFT, 0.03);
      D.line(ctx, -w / 2 + 0.02, d / 2 - 0.03, w / 2 - 0.02, d / 2 - 0.03, INK_SOFT, 0.03);
    }),
};

const TOWER = { w: 1.05, d: 1.15, h: 2.2 };

const pullupTower: FurnitureDef = {
  id: 'fit-pullup-tower',
  name: 'מגדל מתח ומקבילים',
  category: 'sports',
  group: G_WEIGHTS,
  tags: ['מתח', 'מקבילים', 'הרמת רגליים', 'כוח'],
  size: TOWER,
  colors: [slot('frame', 'מסגרת', '#1f2023'), slot('pad', 'ריפוד', '#2a2b2e')],
  actions: [{ kind: 'workout', label: 'מתח ומקבילים', at: { x: 0, y: 0, z: 0.2 } }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { w, d, h } = TOWER;
    const frame = coat(c.frame);
    const pad = M.leather(c.pad);
    const bz = -d / 2 + 0.2;
    for (const s of [-1, 1]) {
      const x = s * 0.34;
      // base feet
      k.rbox(0.07, 0.05, d, 0.012, frame, x, 0, 0, 1);
      for (const z of [-d / 2 + 0.04, d / 2 - 0.04]) k.rbox(0.1, 0.02, 0.06, 0.008, M.rubber(), x, 0, z, 1);
      // upright + diagonal brace
      k.beam([x, 0.05, bz], [x, h - 0.1, bz], 0.06, 0.06, frame, 0.008);
      k.beam([x, 0.05, d / 2 - 0.1], [x, 0.9, bz + 0.03], 0.05, 0.05, frame, 0.008);
      // dip handles
      k.beam([x, 1.12, bz + 0.03], [s * 0.3, 1.12, bz + 0.48], 0.04, 0.05, frame, 0.008);
      k.rod([s * 0.3, 1.12, bz + 0.3], [s * 0.3, 1.12, bz + 0.5], 0.022, foam(), 0.022, 10);
      // arm pads (vertical knee raise)
      k.rbox(0.1, 0.05, 0.26, 0.02, pad, s * 0.27, 1.17, bz + 0.17, 1);
      // pull-up bar arms angled outwards
      k.beam([x, h - 0.1, bz], [s * (w / 2 - 0.03), h - 0.03, bz + 0.25], 0.04, 0.04, frame, 0.006);
    }
    // pull-up bar with angled grips
    k.tube([[-(w / 2 - 0.03), h - 0.03, bz + 0.25], [-0.3, h - 0.03, bz + 0.28], [0.3, h - 0.03, bz + 0.28], [w / 2 - 0.03, h - 0.03, bz + 0.25]], 0.017, M.metal('#c8cbce', 0.5, 1), { seg: 20 });
    for (const s of [-1, 1]) k.rod([s * (w / 2 - 0.03), h - 0.03, bz + 0.25], [s * 0.38, h - 0.03, bz + 0.27], 0.022, foam(), 0.022, 10);
    // back pad + cross members
    xcyl(k, 0.025, 0.68, frame, 0, 0.3, bz, 10);
    xcyl(k, 0.025, 0.68, frame, 0, 1.0, bz, 10);
    k.cushion(0.3, 0.05, 0.45, pad, 0, 0.95, bz + 0.05, 0.02, 0.01).rotation.x = Math.PI / 2;
    // push-up handles low at the front
    for (const s of [-1, 1]) k.rod([s * 0.34, 0.12, d / 2 - 0.25], [s * 0.34, 0.12, d / 2 - 0.12], 0.018, foam(), 0.018, 8);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { w, d } = TOWER;
      const bz = -d / 2 + 0.2;
      for (const s of [-1, 1]) {
        D.rr(ctx, s * 0.34, 0, 0.07, d, 0.02, tint(c.frame, 0.4), undefined, LINE_THIN);
        D.line(ctx, s * 0.34, bz, s * 0.3, bz + 0.48, INK_SOFT, 0.03);
      }
      D.poly(ctx, [[-(w / 2 - 0.03), bz + 0.25], [-0.3, bz + 0.28], [0.3, bz + 0.28], [w / 2 - 0.03, bz + 0.25]], false, null, INK_SOFT, 0.03);
      D.rr(ctx, 0, bz + 0.03, 0.3, 0.06, 0.02, tint(c.pad, 0.4));
    }),
};

/* ================================================================== balls */

interface BallOpts {
  id: string;
  name: string;
  kind: BallKind;
  d: number;
  tags: string[];
  colors: Array<[string, string, string]>;
}

function ballItem(o: BallOpts): FurnitureDef {
  const r = o.d / 2;
  return {
    id: o.id,
    name: o.name,
    category: 'sports',
    group: G_BALLS,
    tags: o.tags,
    size: { w: o.d, d: o.d, h: o.d },
    colors: o.colors.map(([k, l, v]) => slot(k, l, v)),
    actions: [{ kind: 'ball' }],
    build: ({ colors: c }) => {
      const k = new Kit();
      ball(k, o.kind, r, 0, r, 0, { a: c.a, b: c.b, c: c.c });
      return k.g;
    },
    draw2d: (ctx, c) =>
      sym(ctx, () => {
        D.circle(ctx, 0, 0, r * 0.98, tint(c.a, 0.25), undefined, LINE_THIN);
        if (o.kind === 'soccer') {
          D.poly(ctx, [0, 1, 2, 3, 4].map((i) => [Math.sin((i / 5) * Math.PI * 2) * r * 0.32, -Math.cos((i / 5) * Math.PI * 2) * r * 0.32] as [number, number]), true, c.b ?? '#222', null);
        } else if (o.kind === 'basket' || o.kind === 'medicine') {
          D.line(ctx, -r, 0, r, 0, c.b && o.kind === 'medicine' ? c.b : '#1b1b1c', 0.004);
          D.line(ctx, 0, -r, 0, r, c.b && o.kind === 'medicine' ? c.b : '#1b1b1c', 0.004);
        } else if (o.kind === 'beach') {
          const cols = [c.a, '#f6f4ee', c.b, '#f6f4ee', c.c, '#f6f4ee'];
          for (let i = 0; i < 6; i++) {
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.arc(0, 0, r * 0.98, (i / 6) * Math.PI * 2, ((i + 1) / 6) * Math.PI * 2);
            ctx.closePath();
            ctx.fillStyle = tint(cols[i] ?? '#fff', 0.15);
            ctx.fill();
          }
          D.circle(ctx, 0, 0, r * 0.98, null, undefined, LINE_THIN);
          D.circle(ctx, 0, 0, r * 0.2, tint(c.a, 0.1), undefined, 0.004);
        } else if (o.kind === 'volley') {
          for (const s of [-1, 1]) D.line(ctx, -r * 0.9, s * r * 0.3, r * 0.9, s * r * 0.3, INK_SOFT, 0.003);
        } else if (o.kind === 'bowling') {
          for (const [x, y] of [[-0.03, -0.04], [0.03, -0.04], [0, 0.03]] as Array<[number, number]>) D.circle(ctx, x, y, 0.013, '#111', null);
        }
      }),
  };
}

/* ================================================================== hoops */

/** Ring (horizontal, inner radius ri) with a hanging net; ring centre at (x, y, z). */
function hoopRing(k: Kit, ri: number, x: number, y: number, z: number, ringMat: THREE.Material, netLen: number, netColor = '#f3f2ee'): void {
  k.ring(ri + 0.009, 0.009, ringMat, x, y, z, 32);
  const net = M.matte(netColor);
  const n = 12;
  const r1 = ri * 0.95;
  const r2 = ri * 0.68;
  const r3 = ri * 0.55;
  const y1 = y - netLen * 0.5;
  const y2 = y - netLen;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const ah = ((i + 0.5) / n) * Math.PI * 2;
    const p = (ang: number, rr: number, yy: number): V3 => [x + Math.cos(ang) * rr, yy, z + Math.sin(ang) * rr];
    k.rod(p(a, r1, y - 0.005), p(ah, r2, y1), 0.0028, net, 0.0028, 3);
    k.rod(p(a + (Math.PI * 2) / n, r1, y - 0.005), p(ah, r2, y1), 0.0028, net, 0.0028, 3);
    k.rod(p(ah, r2, y1), p(a + (Math.PI * 2) / n, r3, y2), 0.0028, net, 0.0028, 3);
    k.rod(p(ah, r2, y1), p(a, r3, y2), 0.0028, net, 0.0028, 3);
    // hooks
    k.box(0.006, 0.012, 0.006, ringMat, x + Math.cos(a) * (ri + 0.006), y - 0.012, z + Math.sin(a) * (ri + 0.006));
  }
}

/** Backboard facing +Z: front face at z, centre x = 0, bottom at y. */
function backboard(k: Kit, w: number, h: number, y: number, z: number, glass: boolean, line: string, frame: THREE.Material): void {
  const t = 0.022;
  if (glass) {
    k.box(w - 0.04, h - 0.04, t * 0.6, M.glass('#e4f0f2', 0.3), 0, y + 0.02, z - t / 2);
    // frame
    k.box(w, 0.025, t, frame, 0, y, z - t / 2);
    k.box(w, 0.025, t, frame, 0, y + h - 0.025, z - t / 2);
    for (const s of [-1, 1]) k.box(0.025, h, t, frame, s * (w / 2 - 0.0125), y, z - t / 2);
  } else {
    k.rbox(w, h, t, 0.01, M.plastic('#f4f3ef'), 0, y, z - t / 2, 1);
  }
  const lm = M.matte(line);
  const bw = 0.012;
  // border line + target square
  if (!glass) {
    k.box(w - 0.05, bw, 0.002, lm, 0, y + 0.025, z + 0.001);
    k.box(w - 0.05, bw, 0.002, lm, 0, y + h - 0.025 - bw, z + 0.001);
    for (const s of [-1, 1]) k.box(bw, h - 0.05, 0.002, lm, s * (w / 2 - 0.025 - bw / 2), y + 0.025, z + 0.001);
  }
  const sw = w * 0.52;
  const sh = h * 0.6;
  const sy = y + h * 0.08;
  k.box(sw, bw, 0.002, lm, 0, sy, z + 0.002);
  k.box(sw, bw, 0.002, lm, 0, sy + sh - bw, z + 0.002);
  for (const s of [-1, 1]) k.box(bw, sh, 0.002, lm, s * (sw / 2 - bw / 2), sy, z + 0.002);
}

const PHOOP = { w: 1.12, d: 2.0, h: 3.63 };

const hoopPortable: FurnitureDef = {
  id: 'hoop-portable',
  name: 'עמוד סל נייד',
  category: 'sports',
  group: G_HOOPS,
  tags: ['כדורסל', 'סל', 'לוח', 'חצר'],
  size: PHOOP,
  colors: [slot('base', 'בסיס', '#202124'), slot('pole', 'עמוד', '#2a2c30'), slot('ring', 'טבעת', '#e0562a')],
  actions: [{ kind: 'hoop', at: { x: 0, y: 3.05, z: 0.75 } }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { d } = PHOOP;
    const pole = coat(c.pole);
    const ringZ = 0.75;
    const ri = 0.2286;
    const boardZ = ringZ - ri - 0.15;
    // water / sand base
    const bz0 = -d / 2;
    const base = M.plastic(c.base);
    k.rbox(1.0, 0.24, 0.62, 0.06, base, 0, 0.0, bz0 + 0.32, 2);
    k.rbox(0.8, 0.12, 0.4, 0.05, base, 0, 0.2, bz0 + 0.3, 1);
    k.cyl(0.04, 0.03, M.plastic('#3a3c40'), 0.3, 0.31, bz0 + 0.3, 0.04, 10);
    for (const s of [-1, 1]) {
      xcyl(k, 0.07, 0.05, M.rubber(), s * 0.42, 0.07, bz0 + 0.07, 16);
      xcyl(k, 0.03, 0.055, M.plastic('#8a8d91'), s * 0.42, 0.07, bz0 + 0.07, 10);
    }
    // three-section pole leaning forward
    const p0: V3 = [0, 0.3, bz0 + 0.42];
    const p1: V3 = [0, 2.95, boardZ - 0.32];
    k.beam(p0, [0, 1.3, (p0[2] * 0.62 + p1[2] * 0.38)], 0.1, 0.1, pole, 0.012);
    k.beam([0, 1.25, (p0[2] * 0.64 + p1[2] * 0.36)], [0, 2.2, (p0[2] * 0.28 + p1[2] * 0.72)], 0.09, 0.09, pole, 0.012);
    k.beam([0, 2.15, (p0[2] * 0.3 + p1[2] * 0.7)], p1, 0.08, 0.08, pole, 0.012);
    // pole pad
    k.rbox(0.16, 0.9, 0.06, 0.02, M.leather('#1d1e20'), 0, 0.3, bz0 + 0.5, 1).rotation.x = 0.0;
    // height-adjust linkage arms to the board
    for (const y of [2.95, 3.25]) {
      for (const s of [-1, 1]) k.beam([s * 0.1, y, p1[2]], [s * 0.18, y + 0.05, boardZ - 0.04], 0.03, 0.04, pole, 0.006);
    }
    k.beam([0, 2.6, (p0[2] * 0.1 + p1[2] * 0.9)], [0, 3.25, p1[2]], 0.04, 0.04, pole, 0.006);
    // backboard
    const bw = 1.12;
    const bh = 0.72;
    backboard(k, bw, bh, 2.9, boardZ, true, '#f4f3ef', M.blackMetal());
    k.box(0.5, 0.36, 0.04, M.blackMetal(), 0, 2.95, boardZ - 0.05);
    // ring support + ring + net
    k.rbox(0.16, 0.12, 0.15, 0.01, M.metal(c.ring, 0.4, 0.6), 0, 2.98, boardZ + 0.075, 1);
    hoopRing(k, ri, 0, 3.05, ringZ, M.metal(c.ring, 0.4, 0.6), 0.42);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { d } = PHOOP;
      D.rr(ctx, 0, -d / 2 + 0.32, 1.0, 0.62, 0.06, tint(c.base, 0.5));
      D.rr(ctx, 0, 0.75 - 0.2286 - 0.15 - 0.011, 1.12, 0.035, 0.005, tint('#9fb3ba', 0.4));
      D.line(ctx, 0, -d / 2 + 0.42, 0, 0.75 - 0.38, INK_SOFT, 0.06);
      D.circle(ctx, 0, 0.75, 0.237, null, c.ring, 0.018);
      D.circle(ctx, 0, 0.75, 0.13, null, INK_SOFT, 0.005);
    }),
};

const KHOOP = { w: 0.8, d: 0.95, h: 1.95 };

const hoopKidsStand: FurnitureDef = {
  id: 'hoop-kids-stand',
  name: 'עמוד סל לילדים',
  category: 'sports',
  group: G_HOOPS,
  tags: ['כדורסל', 'סל', 'ילדים', 'מתכוונן'],
  size: KHOOP,
  colors: [slot('base', 'בסיס', '#2f7fd0'), slot('board', 'לוח', '#e8463a'), slot('ring', 'טבעת', '#f3a224')],
  actions: [{ kind: 'hoop', at: { x: 0, y: 1.5, z: 0.25 } }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { d } = KHOOP;
    const ringZ = 0.25;
    const ri = 0.17;
    const boardZ = ringZ - ri - 0.08;
    const base = M.plastic(c.base);
    // round fillable base
    k.lathe(
      [
        [0, 0],
        [0.3, 0],
        [0.31, 0.04],
        [0.28, 0.14],
        [0.1, 0.2],
        [0, 0.2],
      ],
      base,
      0,
      0,
      -d / 2 + 0.31,
      24,
    );
    k.cyl(0.035, 0.02, M.plastic('#f4f3ef'), 0.18, 0.15, -d / 2 + 0.31, 0.035, 10);
    // telescopic pole
    const pz = -d / 2 + 0.31;
    k.cyl(0.035, 0.9, M.plastic(lighten(c.base, 0.1)), 0, 0.18, pz, 0.035, 14);
    k.cyl(0.028, 0.65, M.steel(), 0, 1.05, pz, 0.028, 14);
    k.cyl(0.04, 0.06, M.plastic('#202124'), 0, 1.05, pz, 0.04, 14);
    k.beam([0, 1.65, pz], [0, 1.5, boardZ - 0.02], 0.05, 0.05, M.plastic(c.base), 0.01);
    k.beam([0, 1.65, pz], [0, 1.65, boardZ - 0.02], 0.04, 0.04, M.plastic(c.base), 0.01);
    // shaped plastic backboard
    const shape = roundedRectShape(0.74, 0.5, 0.08);
    k.geo(profileZ(shape, 0.03), M.plastic(c.board), 0, 1.7, boardZ - 0.015);
    k.box(0.36, 0.22, 0.004, M.plastic('#f4f3ef'), 0, 1.5, boardZ + 0.001);
    k.box(0.3, 0.16, 0.005, M.plastic(c.board), 0, 1.53, boardZ + 0.001);
    hoopRing(k, ri, 0, 1.5, ringZ, M.plastic(c.ring), 0.3);
    k.rbox(0.12, 0.05, 0.1, 0.01, M.plastic(c.ring), 0, 1.47, boardZ + 0.05, 1);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { d } = KHOOP;
      D.circle(ctx, 0, -d / 2 + 0.31, 0.31, tint(c.base, 0.45));
      D.rr(ctx, 0, 0.25 - 0.17 - 0.08 - 0.015, 0.74, 0.03, 0.01, tint(c.board, 0.3));
      D.circle(ctx, 0, 0.25, 0.177, null, c.ring, 0.016);
      D.circle(ctx, 0, -d / 2 + 0.31, 0.035, '#fff', undefined, LINE_THIN);
    }),
};

interface WallHoopOpts {
  id: string;
  name: string;
  tags: string[];
  bw: number;
  bh: number;
  ri: number;
  net: number;
  elevation: number;
  board: string;
  ring: string;
  glass: boolean;
}

function wallHoop(o: WallHoopOpts): FurnitureDef {
  const off = 0.06 + o.bw * 0.08; // board stand-off from the wall
  const boardZ = off + 0.02; // front face (relative to back)
  const ringGap = o.ri * 0.5;
  const ringY = o.net + 0.003;
  const boardY = ringY - o.bh * 0.12 - 0.03;
  const dTot = boardZ + ringGap + o.ri * 2 + 0.035;
  const h = boardY + o.bh;
  const z0 = -dTot / 2;
  const ringZ = z0 + boardZ + ringGap + o.ri + 0.01;
  return {
    id: o.id,
    name: o.name,
    category: 'sports',
    group: G_HOOPS,
    tags: o.tags,
    size: { w: o.bw, d: +dTot.toFixed(3), h: +h.toFixed(3) },
    mount: 'wall',
    elevation: o.elevation,
    colors: [slot('board', 'לוח', o.board), slot('ring', 'טבעת', o.ring)],
    actions: [{ kind: 'hoop', at: { x: 0, y: +ringY.toFixed(3), z: +ringZ.toFixed(3) } }],
    build: ({ colors: c }) => {
      const k = new Kit();
      const ringM = M.metal(c.ring, 0.4, 0.6);
      // wall bracket
      k.box(o.bw * 0.4, o.bh * 0.5, 0.01, M.blackMetal(), 0, boardY + o.bh * 0.25, z0 + 0.005);
      for (const s of [-1, 1]) k.beam([s * o.bw * 0.15, boardY + o.bh * 0.5, z0 + 0.01], [s * o.bw * 0.15, boardY + o.bh * 0.5, z0 + boardZ - 0.022], 0.025, 0.025, M.blackMetal(), 0.004);
      if (o.glass) backboard(k, o.bw, o.bh, boardY, z0 + boardZ, true, '#f4f3ef', M.blackMetal());
      else {
        k.rbox(o.bw, o.bh, 0.022, 0.012, M.plastic(c.board), 0, boardY, z0 + boardZ - 0.011, 1);
        const sw = o.bw * 0.5;
        const sh = o.bh * 0.5;
        const lm = M.matte('#f4f3ef');
        k.box(sw, 0.012, 0.002, lm, 0, boardY + o.bh * 0.12, z0 + boardZ + 0.001);
        k.box(sw, 0.012, 0.002, lm, 0, boardY + o.bh * 0.12 + sh, z0 + boardZ + 0.001);
        for (const s of [-1, 1]) k.box(0.012, sh, 0.002, lm, s * (sw / 2), boardY + o.bh * 0.12, z0 + boardZ + 0.001);
      }
      k.rbox(o.ri * 0.8, 0.05, ringGap + 0.02, 0.006, ringM, 0, ringY - 0.045, z0 + boardZ + ringGap / 2, 1);
      hoopRing(k, o.ri, 0, ringY, ringZ, ringM, o.net);
      return k.g;
    },
    draw2d: (ctx, c) =>
      sym(ctx, () => {
        D.rr(ctx, 0, z0 + boardZ - 0.011, o.bw, 0.022, 0.005, tint(c.board, 0.3));
        D.line(ctx, 0, z0 + boardZ, 0, z0 + boardZ + ringGap, INK_SOFT, 0.02);
        D.circle(ctx, 0, ringZ, o.ri + 0.009, null, c.ring, 0.014);
        D.circle(ctx, 0, ringZ, o.ri * 0.55, null, INK_SOFT, 0.004);
      }),
  };
}

/* ================================================================== goal, bike, boards */

const GOAL = { w: 1.85, d: 0.95, h: 1.22 };

const soccerGoal: FurnitureDef = {
  id: 'goal-soccer',
  name: 'שער כדורגל לחצר',
  category: 'sports',
  group: G_HOOPS,
  tags: ['כדורגל', 'שער', 'רשת', 'חצר'],
  size: GOAL,
  colors: [slot('frame', 'מסגרת', '#f4f4f2'), slot('net', 'רשת', '#e9e9e6')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { w, d, h } = GOAL;
    const fr = M.plastic(c.frame);
    const r = 0.035;
    const x = w / 2 - r;
    const zf = d / 2 - r;
    const zb = -d / 2 + r;
    const top = h - r;
    // front posts + crossbar, ground frame, back stays
    for (const s of [-1, 1]) {
      k.rod([s * x, 0, zf], [s * x, top, zf], r, fr, r, 12);
      k.rod([s * x, r, zf], [s * x, r, zb], r * 0.8, fr, r * 0.8, 10);
      k.rod([s * x, top, zf], [s * x, top * 0.75, zb + 0.15], r * 0.7, fr, r * 0.7, 10);
      k.rod([s * x, top * 0.75, zb + 0.15], [s * x, r, zb], r * 0.7, fr, r * 0.7, 10);
      k.sphere(r * 1.15, fr, s * x, top, zf, 1, 1, 1, 10);
    }
    k.rod([-x, top, zf], [x, top, zf], r, fr, r, 12);
    k.rod([-x, r, zb], [x, r, zb], r * 0.8, fr, r * 0.8, 10);
    k.rod([-x, top * 0.75, zb + 0.15], [x, top * 0.75, zb + 0.15], r * 0.7, fr, r * 0.7, 10);
    // net: vertical + horizontal cords on the back, top and sides
    const net = M.matte(c.net);
    const cr = 0.0025;
    const nx = 14;
    for (let i = 0; i <= nx; i++) {
      const xx = -x + (2 * x * i) / nx;
      k.rod([xx, top, zf], [xx, top * 0.75, zb + 0.15], cr, net, cr, 3);
      k.rod([xx, top * 0.75, zb + 0.15], [xx, 0.01, zb], cr, net, cr, 3);
    }
    for (let j = 1; j <= 6; j++) {
      const t = j / 7;
      k.rod([-x, top + (top * 0.75 - top) * t, zf + (zb + 0.15 - zf) * t], [x, top + (top * 0.75 - top) * t, zf + (zb + 0.15 - zf) * t], cr, net, cr, 3);
    }
    for (let j = 1; j <= 7; j++) {
      const t = j / 8;
      k.rod([-x, top * 0.75 * (1 - t) + 0.01 * t, zb + 0.15 * (1 - t)], [x, top * 0.75 * (1 - t) + 0.01 * t, zb + 0.15 * (1 - t)], cr, net, cr, 3);
    }
    for (const s of [-1, 1]) {
      for (let j = 1; j <= 6; j++) {
        const t = j / 7;
        const y = top * (1 - t);
        k.rod([s * x, y, zf], [s * x, Math.min(y, top * 0.75), zb + 0.15 * Math.min(1, y / (top * 0.75))], cr, net, cr, 3);
      }
      for (let j = 1; j <= 5; j++) {
        const t = j / 6;
        const z = zf + (zb - zf) * t;
        const yTop = z > zb + 0.15 ? top + ((top * 0.75 - top) * (zf - z)) / (zf - zb - 0.15) : top * 0.75 * ((z - zb) / 0.15);
        k.rod([s * x, r, z], [s * x, yTop, z], cr, net, cr, 3);
      }
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { w, d } = GOAL;
      D.rr(ctx, 0, 0, w - 0.02, d - 0.02, 0.02, tint(c.net, 0.5), INK_SOFT, LINE_THIN);
      for (let i = 1; i < 14; i++) D.line(ctx, -w / 2 + (w * i) / 14, -d / 2 + 0.05, -w / 2 + (w * i) / 14, d / 2 - 0.05, INK_SOFT, 0.003);
      D.line(ctx, -w / 2 + 0.035, d / 2 - 0.035, w / 2 - 0.035, d / 2 - 0.035, INK, 0.05);
    }),
};

/** Bicycle wheel in the XY plane (bike runs along X), hub at (x, y, 0). */
function bikeWheel(k: Kit, r: number, x: number, y: number, rim: THREE.Material): void {
  k.add(mesh(new THREE.TorusGeometry(r - 0.018, 0.018, 6, 32), M.rubber('#1d1e20')), x, y, 0);
  k.add(mesh(new THREE.TorusGeometry(r - 0.04, 0.008, 4, 28), rim), x, y, 0);
  zcyl(k, 0.022, 0.1, M.steel(), x, y, 0, 10);
  const spoke = M.chrome();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const side = i % 2 === 0 ? 0.04 : -0.04;
    k.rod([x, y, side], [x + Math.cos(a) * (r - 0.045), y + Math.sin(a) * (r - 0.045), 0], 0.0012, spoke, 0.0012, 3);
  }
}

const BIKEP = { w: 1.74, d: 0.6, h: 1.0 };

const parkedBike: FurnitureDef = {
  id: 'fit-bicycle-stand',
  name: 'אופני עיר על מעמד',
  category: 'sports',
  group: G_HOOPS,
  tags: ['אופניים', 'רכיבה', 'מעמד', 'עיר'],
  size: BIKEP,
  colors: [slot('frame', 'שלדה', '#2e6b5e'), slot('seat', 'אוכף', '#6b4a32'), slot('tyre', 'פסי צד', '#d9c9a8')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const r = 0.34;
    const wy = r;
    const rx = -0.5;
    const fx = 0.5;
    const fr = M.metal(c.frame, 0.3, 0.6);
    bikeWheel(k, r, rx, wy + 0.01, M.chrome());
    bikeWheel(k, r, fx, wy + 0.01, M.chrome());
    // tan-wall stripe
    for (const x of [rx, fx]) k.add(mesh(new THREE.TorusGeometry(r - 0.028, 0.0035, 4, 40), M.matte(c.tyre)), x, wy + 0.01, 0.014);
    // frame (step-through city frame)
    const bb: V3 = [-0.05, 0.3, 0];
    const seatTop: V3 = [-0.2, 0.84, 0];
    const head: V3 = [0.4, 0.82, 0];
    k.rod(bb, seatTop, 0.017, fr, 0.017, 10);
    k.tube([bb, [0.12, 0.42, 0], [0.32, 0.66, 0], head], 0.02, fr, { seg: 16, radial: 6 });
    k.rod([bb[0] + 0.02, bb[1] + 0.1, 0], [0.38, 0.72, 0], 0.014, fr, 0.014, 8);
    for (const s of [-1, 1]) {
      k.rod([rx, wy + 0.01, s * 0.04], bb, 0.009, fr, 0.009, 6);
      k.rod([rx, wy + 0.01, s * 0.04], [-0.19, 0.78, s * 0.01], 0.008, fr, 0.008, 6);
      k.rod([head[0] + 0.04, head[1] - 0.12, s * 0.035], [fx, wy + 0.01, s * 0.04], 0.011, fr, 0.011, 8);
    }
    k.rod([head[0] - 0.01, head[1] + 0.06, 0], [head[0] + 0.04, head[1] - 0.12, 0], 0.02, fr, 0.02, 10);
    // seat post + sprung saddle
    k.rod(seatTop, [-0.22, 0.92, 0], 0.012, M.chrome(), 0.012, 8);
    const s = new Kit();
    s.sphere(0.1, M.leather(c.seat), 0, 0, 0, 1.15, 0.3, 0.85, 12);
    s.sphere(0.07, M.leather(c.seat), 0.11, 0.005, 0, 1.1, 0.32, 0.5, 12);
    for (const sz of [-1, 1]) s.add(mesh(new THREE.TorusGeometry(0.014, 0.003, 4, 10), M.chrome()), -0.05, -0.035, sz * 0.05).rotation.x = Math.PI / 2;
    k.sub(s, -0.22, 0.95, 0);
    // handlebar
    k.rod([head[0] - 0.01, head[1] + 0.06, 0], [head[0] - 0.06, head[1] + 0.12, 0], 0.012, M.chrome(), 0.012, 8);
    k.tube([[head[0] - 0.16, head[1] + 0.14, -0.27], [head[0] - 0.06, head[1] + 0.13, -0.18], [head[0] - 0.06, head[1] + 0.12, 0], [head[0] - 0.06, head[1] + 0.13, 0.18], [head[0] - 0.16, head[1] + 0.14, 0.27]], 0.011, M.chrome(), { seg: 20, radial: 6 });
    for (const sz of [-1, 1]) zcyl(k, 0.016, 0.1, M.leather(c.seat), head[0] - 0.155, head[1] + 0.14, sz * 0.24, 10);
    // front basket
    k.rbox(0.28, 0.2, 0.32, 0.03, M.wicker('#b8925f'), head[0] + 0.12, head[1] - 0.06, 0, 1);
    // mudguards
    for (const [x, a0] of [[rx, 0.2], [fx, 0.5]] as Array<[number, number]>) {
      const g = new THREE.TorusGeometry(r + 0.012, 0.022, 4, 20, Math.PI * 0.85);
      const m = k.add(mesh(g, M.metal(c.frame, 0.3, 0.6)), x, wy + 0.01, 0);
      m.rotation.z = a0;
      m.scale.set(1, 1, 1.5);
    }
    // crank + chain guard + pedals
    k.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.012, 20), M.metal(c.frame, 0.3, 0.6)), bb[0] - 0.12, bb[1], 0.05).rotation.x = Math.PI / 2;
    k.rod([bb[0], bb[1], 0.07], [bb[0] + 0.12, bb[1] - 0.12, 0.07], 0.009, M.steel(), 0.009, 6);
    k.rbox(0.09, 0.02, 0.06, 0.005, M.plastic('#202124'), bb[0] + 0.12, bb[1] - 0.13, 0.11, 1);
    // rear-wheel stand
    const st = M.blackMetal();
    for (const sz of [-1, 1]) {
      k.beam([rx - 0.24, 0.015, sz * 0.25], [rx + 0.24, 0.015, sz * 0.25], 0.03, 0.03, st);
      k.beam([rx, 0.03, sz * 0.25], [rx, 0.3, sz * 0.06], 0.025, 0.025, st);
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, -0.5, 0, 0.68, 0.05, 0.02, tint('#1d1e20', 0.6));
      D.rr(ctx, 0.5, 0, 0.68, 0.05, 0.02, tint('#1d1e20', 0.6));
      D.line(ctx, -0.5, 0, 0.42, 0, c.frame, 0.035);
      D.line(ctx, 0.34, -0.27, 0.34, 0.27, INK, 0.025);
      D.ellipse(ctx, -0.21, 0, 0.12, 0.08, tint(c.seat, 0.3));
      D.rr(ctx, 0.52, 0, 0.28, 0.32, 0.03, tint('#b8925f', 0.3), undefined, LINE_THIN);
      for (const s of [-1, 1]) D.line(ctx, -0.74, s * 0.25, -0.26, s * 0.25, INK_SOFT, 0.02);
    }),
};

const SKATE = { w: 0.81, d: 0.21, h: 0.14 };

const skateboard: FurnitureDef = {
  id: 'fit-skateboard',
  name: 'סקייטבורד',
  category: 'sports',
  group: G_HOOPS,
  tags: ['סקייט', 'גלגיליות', 'קרשן', 'נוער'],
  size: SKATE,
  colors: [slot('deck', 'גרפיקה', '#d24b2e'), slot('wheels', 'גלגלים', '#f0e8d0')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { w, d } = SKATE;
    // deck: flat middle + kicked-up tails, maple sides, grip tape on top
    const L = w - 0.06;
    const deckY = 0.085;
    const mid = L - d;
    const s = new THREE.Shape();
    s.moveTo(-mid / 2, -d / 2 + 0.0);
    s.lineTo(mid / 2, -d / 2);
    s.absarc(mid / 2, 0, d / 2, -Math.PI / 2, Math.PI / 2, false);
    s.lineTo(-mid / 2, d / 2);
    s.absarc(-mid / 2, 0, d / 2, Math.PI / 2, Math.PI * 1.5, false);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: false, curveSegments: 10 });
    g.rotateX(-Math.PI / 2);
    // bend the tails up
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const ex = Math.max(0, Math.abs(x) - mid * 0.42);
      p.setY(i, p.getY(i) + ex * ex * 1.6);
      // slight concave across
      const z = p.getZ(i);
      p.setY(i, p.getY(i) + z * z * 0.25);
    }
    g.computeVertexNormals();
    k.geo(g, M.lacquer(c.deck), 0, deckY, 0);
    k.geo(g.clone(), M.matte('#1d1e20'), 0, deckY + 0.002, 0).scale.set(0.995, 1, 0.97);
    // trucks + wheels
    for (const sx of [-1, 1]) {
      const x = sx * L * 0.3;
      k.rbox(0.05, 0.012, 0.07, 0.004, M.brushed('#c9ccce'), x, deckY - 0.012, 0, 1);
      k.rbox(0.035, 0.03, 0.035, 0.008, M.brushed('#c9ccce'), x, deckY - 0.04, 0, 1);
      zcyl(k, 0.007, d - 0.02, M.steel(), x, 0.027, 0, 8);
      zcyl(k, 0.012, 0.15, M.brushed('#c9ccce'), x, 0.03, 0, 10);
      for (const sz of [-1, 1]) {
        zcyl(k, 0.027, 0.032, M.plastic(c.wheels), x, 0.027, sz * (d / 2 - 0.016), 16);
        zcyl(k, 0.012, 0.034, M.steel(), x, 0.027, sz * (d / 2 - 0.016), 10);
      }
      k.cyl(0.015, 0.014, M.plastic('#d9a640'), x, deckY - 0.026, 0, 0.018, 10);
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { w, d } = SKATE;
      D.rr(ctx, 0, 0, w - 0.06, d - 0.004, d / 2, tint('#1d1e20', 0.55));
      for (const s of [-1, 1]) {
        D.circle(ctx, s * 0.225, -d / 2 + 0.016, 0.016, tint(c.wheels, 0.1), undefined, LINE_THIN);
        D.circle(ctx, s * 0.225, d / 2 - 0.016, 0.016, tint(c.wheels, 0.1), undefined, LINE_THIN);
      }
    }),
};

const SURF = { w: 2.2, d: 0.34, h: 0.62 };

const surfRack: FurnitureDef = {
  id: 'fit-surfboard-rack',
  name: 'מתקן קיר עם גלשנים',
  category: 'sports',
  group: G_HOOPS,
  tags: ['גלשן', 'גלישה', 'ים', 'מתקן קיר'],
  size: SURF,
  mount: 'wall',
  elevation: 1.2,
  colors: [slot('board1', 'גלשן עליון', '#f2efe6'), slot('board2', 'גלשן תחתון', '#59a9c7'), slot('wood', 'זרועות', PAL.teak)],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { w, d } = SURF;
    const z0 = -d / 2;
    const wood = M.wood(c.wood, 0.55);
    // two wall arms with two padded prongs each
    for (const s of [-1, 1]) {
      const x = s * 0.55;
      k.rbox(0.05, 0.6, 0.025, 0.006, wood, x, 0.0, z0 + 0.0125, 1);
      for (const y of [0.08, 0.34]) {
        k.beam([x, y, z0 + 0.02], [x, y + 0.03, z0 + d - 0.01], 0.04, 0.04, wood, 0.008);
        k.rbox(0.05, 0.012, d - 0.06, 0.006, M.fabric('#2b2c2f', 20), x, y + 0.035, z0 + d / 2 + 0.01, 1);
      }
    }
    // surfboards lying flat on the arms
    const board = (len: number, wid: number, y: number, col: string, fins: number) => {
      const sh = new THREE.Shape();
      const n = 18;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const x = -len / 2 + t * len;
        const wv = (wid / 2) * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.85)), 0.62) * (t > 0.9 ? 1 - (t - 0.9) * 2.5 : 1);
        if (i === 0) sh.moveTo(x, 0);
        else sh.lineTo(x, Math.max(0.004, wv));
      }
      for (let i = n; i >= 0; i--) {
        const t = i / n;
        const x = -len / 2 + t * len;
        const wv = (wid / 2) * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.85)), 0.62) * (t > 0.9 ? 1 - (t - 0.9) * 2.5 : 1);
        sh.lineTo(x, -Math.max(0.004, wv));
      }
      const g = new THREE.ExtrudeGeometry(sh, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2, curveSegments: 6 });
      g.rotateX(-Math.PI / 2);
      // rocker: nose lifts
      const p = g.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        const t = (p.getX(i) + len / 2) / len;
        p.setY(i, p.getY(i) + Math.pow(Math.max(0, t - 0.65), 2) * 0.35 + Math.pow(Math.max(0, 0.15 - t), 2) * 0.6);
      }
      g.computeVertexNormals();
      const m = k.geo(g, M.lacquer(col), 0, y + 0.012, z0 + d / 2 + 0.01);
      // stringer
      k.box(len * 0.82, 0.002, 0.004, M.wood(PAL.walnut), 0.02 * len, y + 0.054, z0 + d / 2 + 0.01);
      for (let f = 0; f < fins; f++) {
        const fz = fins === 1 ? 0 : (f - 1) * 0.07;
        const fin = new THREE.Shape();
        fin.moveTo(0, 0);
        fin.lineTo(0.1, 0);
        fin.quadraticCurveTo(0.02, 0.04, -0.03, 0.1);
        fin.closePath();
        const fg = new THREE.ExtrudeGeometry(fin, { depth: 0.006, bevelEnabled: false });
        fg.translate(-0.003, 0, -0.003);
        const fm = k.geo(fg, M.plastic('#2b2c2f'), -len / 2 + 0.12 + (f === 1 ? 0.02 : 0), y + 0.012, z0 + d / 2 + 0.01 + fz);
        fm.rotation.z = Math.PI;
        fm.rotation.y = 0;
      }
      return m;
    };
    board(2.1, 0.5 * 0.56, 0.4, c.board1, 3);
    board(1.85, 0.5 * 0.6, 0.145, c.board2, 3);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { w, d } = SURF;
      D.ellipse(ctx, 0, 0.01, w / 2 - 0.06, d / 2 - 0.03, tint(c.board1, 0.2));
      D.line(ctx, -w / 2 + 0.2, 0.01, w / 2 - 0.2, 0.01, INK_SOFT, 0.005);
      for (const s of [-1, 1]) D.rr(ctx, s * 0.55, 0, 0.05, d - 0.02, 0.01, tint(c.wood, 0.25), undefined, LINE_THIN);
    }),
};

/* ================================================================== export */

export const SPORTS: FurnitureDef[] = [
  treadmill({ id: 'fit-treadmill', name: 'הליכון חשמלי', tags: ['הליכון', 'ריצה', 'קרדיו', 'חדר כושר'], w: 0.84, d: 1.95, h: 1.42, frame: '#2b2d31', accent: '#2f8fd8' }),
  treadmill({ id: 'fit-treadmill-white', name: 'הליכון ביתי לבן', tags: ['הליכון', 'ריצה', 'מתקפל', 'קרדיו'], w: 0.78, d: 1.78, h: 1.36, frame: '#e8e9eb', accent: '#e0632f' }),
  treadmill({ id: 'fit-walking-pad', name: 'מסלול הליכה מתחת לשולחן', tags: ['הליכון', 'הליכה', 'שולחן עמידה', 'משרד'], w: 0.58, d: 1.45, h: 0.16, frame: '#3a3d42', accent: '#55c1e8', pad: true }),
  elliptical,
  exerciseBike,
  spinBike,
  recumbentBike,
  rower,
  dumbbellRack,
  kettlebellRack,
  weightBench,
  powerRack,
  matItem({ id: 'fit-yoga-mat', name: 'מזרן יוגה', tags: ['יוגה', 'פילאטיס', 'מתיחות', 'מזרן'], w: 0.61, d: 1.83, t: 0.006, color: '#7f9c8d' }),
  matItem({ id: 'fit-yoga-mat-purple', name: 'מזרן יוגה עבה', tags: ['יוגה', 'מדיטציה', 'מזרן', 'פילאטיס'], w: 0.66, d: 1.85, t: 0.012, color: '#8a6fa8' }),
  matItem({ id: 'fit-gym-mat', name: 'מזרן התעמלות מתקפל', tags: ['מזרן', 'התעמלות', 'גלגולים', 'ילדים'], w: 1.2, d: 2.4, t: 0.05, color: '#2f6fb7', fold: 4 }),
  stabilityBall,
  foamRoller,
  aerobicStep,
  punchingBagStand,
  ceilingBag,
  wallBars,
  pullupTower,
  ballItem({ id: 'ball-soccer', name: 'כדורגל', kind: 'soccer', d: 0.22, tags: ['כדורגל', 'כדור', 'משחק'], colors: [['a', 'עור', '#f5f5f3'], ['b', 'מחומשים', '#1d1e21']] }),
  ballItem({ id: 'ball-basketball', name: 'כדורסל', kind: 'basket', d: 0.24, tags: ['כדורסל', 'כדור', 'משחק'], colors: [['a', 'כדור', '#d0652a']] }),
  ballItem({ id: 'ball-beach', name: 'כדור ים מתנפח', kind: 'beach', d: 0.4, tags: ['כדור ים', 'חוף', 'בריכה', 'מתנפח'], colors: [['a', 'פס 1', '#e2403a'], ['b', 'פס 2', '#2f7fd0'], ['c', 'פס 3', '#f2c230']] }),
  ballItem({ id: 'ball-volleyball', name: 'כדורעף', kind: 'volley', d: 0.21, tags: ['כדורעף', 'כדור', 'חוף'], colors: [['a', 'לוח 1', '#f5f4ef'], ['b', 'לוח 2', '#f2c230'], ['c', 'לוח 3', '#2459a6']] }),
  ballItem({ id: 'ball-tennis', name: 'כדור טניס', kind: 'tennis', d: 0.067, tags: ['טניס', 'כדור', 'כלב'], colors: [['a', 'לבד', '#d6e64a']] }),
  ballItem({ id: 'ball-medicine', name: 'כדור כוח (מדיסין בול)', kind: 'medicine', d: 0.3, tags: ['כדור כוח', 'כושר', 'משקולת'], colors: [['a', 'כדור', '#2b2c2f'], ['b', 'פס', '#c8302a']] }),
  ballItem({ id: 'ball-bowling', name: 'כדור באולינג', kind: 'bowling', d: 0.218, tags: ['באולינג', 'כדור', 'משחק'], colors: [['a', 'כדור', '#3a2a7a']] }),
  hoopPortable,
  hoopKidsStand,
  wallHoop({ id: 'hoop-wall-kids', name: 'סל כדורסל לקיר לילדים', tags: ['כדורסל', 'סל', 'קיר', 'ילדים'], bw: 0.76, bh: 0.5, ri: 0.2, net: 0.34, elevation: 1.9, board: '#2f7fd0', ring: '#e0562a', glass: false }),
  wallHoop({ id: 'hoop-mini', name: 'מיני סל לחדר', tags: ['כדורסל', 'מיני', 'דלת', 'חדר'], bw: 0.46, bh: 0.31, ri: 0.11, net: 0.2, elevation: 1.85, board: '#f4f3ef', ring: '#e0562a', glass: true }),
  soccerGoal,
  parkedBike,
  skateboard,
  surfRack,
];
