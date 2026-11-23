/** Street items on poles: lamps, traffic light, road signs, flagpole. */
import * as THREE from 'three';
import type { FurnitureDef } from '../types';
import { D, INK_SOFT, Kit, LINE_THIN, M, darken, extrudeZ, lighten, roundedRectShape, sym, tint } from '../kit';
import { slot } from './_parts';
import { type C2D, axisCyl, canvasMat, crr, galv, polyShape, shapeFaceGeo } from './_street_shared';

/* ------------------------------------------------------------------ street lamp */

const LAMP_PZ = -0.65;

const streetLamp: FurnitureDef = {
  id: 'street-lamp',
  name: 'פנס רחוב',
  category: 'street',
  size: { w: 0.4, d: 1.7, h: 6.2 },
  colors: [slot('metal', 'עמוד', '#59616a')],
  light: { x: 0, y: 5.95, z: 0.5, color: '#ffe3b5', intensity: 450, distance: 22 },
  interact: [{ kind: 'light' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const metal = M.metal(c.metal, 0.5, 0.75);
    const pz = LAMP_PZ;
    // flange with anchor bolts, service door, tapered pole
    k.cyl(0.2, 0.025, metal, 0, 0, pz, 0.2, 20);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      k.cyl(0.018, 0.03, galv(), Math.cos(a) * 0.155, 0.02, pz + Math.sin(a) * 0.155, 0.018, 6);
    }
    k.lathe(
      [
        [0.115, 0.02],
        [0.115, 0.95],
        [0.1, 1.02],
        [0.092, 1.04],
        [0.058, 5.3],
      ],
      metal,
      0,
      0,
      pz,
      16,
    );
    k.rbox(0.1, 0.32, 0.012, 0.004, M.metal(darken(c.metal, 0.12), 0.5, 0.75), 0, 0.45, pz + 0.112, 1);
    // swept arm
    k.tube(
      [
        [0, 5.25, pz],
        [0, 5.75, pz],
        [0, 6.03, pz + 0.2],
        [0, 6.13, pz + 0.6],
        [0, 6.13, 0.22],
      ],
      0.045,
      metal,
      { seg: 22, radial: 10 },
    );
    k.ring(0.062, 0.014, metal, 0, 5.27, pz, 14);
    // LED head: slim wedge with a glowing lens underneath
    const head = new Kit();
    head.rbox(0.27, 0.075, 0.66, 0.03, metal, 0, 0, 0.33, 2);
    head.rbox(0.2, 0.012, 0.46, 0.005, M.glow('#ffe3b5', 2.2, '#fff6e2'), 0, -0.008, 0.36, 1);
    head.box(0.14, 0.02, 0.1, M.metal(darken(c.metal, 0.2), 0.6, 0.6), 0, 0.075, 0.12);
    const hg = k.sub(head, 0, 6.085, 0.16);
    hg.rotation.x = -0.05;
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const pz = LAMP_PZ;
      D.line(ctx, 0, pz, 0, 0.2, INK_SOFT, 0.05);
      D.rr(ctx, 0, 0.5, 0.27, 0.66, 0.06, '#fff3d6');
      D.line(ctx, -0.09, 0.36, 0.09, 0.64, INK_SOFT, LINE_THIN);
      D.line(ctx, -0.09, 0.64, 0.09, 0.36, INK_SOFT, LINE_THIN);
      D.circle(ctx, 0, pz, 0.19, tint(c.metal, 0.55));
      D.circle(ctx, 0, pz, 0.1, tint(c.metal, 0.3), undefined, LINE_THIN);
    }),
};

/* ------------------------------------------------------------------ traffic light */

const TL_PZ = -0.065;

const trafficLight: FurnitureDef = {
  id: 'traffic-light',
  name: 'רמזור',
  category: 'street',
  size: { w: 0.38, d: 0.4, h: 3.6 },
  colors: [slot('pole', 'עמוד', '#5b6268')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const pole = M.metal(c.pole, 0.5, 0.7);
    const pz = TL_PZ;
    const dark = M.paint('#1f2124', 0.5);
    k.lathe(
      [
        [0.13, 0],
        [0.13, 0.04],
        [0.085, 0.1],
        [0.075, 0.5],
        [0.06, 0.56],
        [0.055, 2.56],
      ],
      pole,
      0,
      0,
      pz,
      16,
    );
    // push button box for pedestrians
    k.rbox(0.11, 0.2, 0.07, 0.012, M.paint('#e8b21e', 0.45), 0, 1.02, pz + 0.085, 1);
    axisCyl(k, 0.026, 0.02, M.chrome(), 0, 1.1, pz + 0.125, 'z', 0.026, 12);
    k.box(0.07, 0.05, 0.004, M.paint('#1f2124'), 0, 1.15, pz + 0.121);
    // signal head with back board
    const hy = 2.56;
    const hh = 1.0;
    k.rbox(0.36, hh + 0.02, 0.02, 0.008, dark, 0, hy, pz - 0.085, 1);
    k.rbox(0.3, hh, 0.19, 0.03, dark, 0, hy + 0.01, pz + 0.005, 2);
    k.cyl(0.05, 0.04, dark, 0, hy - 0.03, pz, 0.05, 12);
    const lens = [M.paint('#d8362c', 0.25), M.paint('#e6a51c', 0.25), M.glow('#3dff7c', 1.5, '#49e07f')];
    const visorShape = new THREE.Shape();
    visorShape.absarc(0, 0, 0.118, -0.25, Math.PI + 0.25, false);
    visorShape.absarc(0, 0, 0.108, Math.PI + 0.25, -0.25, true);
    visorShape.closePath();
    for (let i = 0; i < 3; i++) {
      const y = hy + hh - 0.175 - i * 0.325;
      const l = k.sphere(0.1, lens[i], 0, y, pz + 0.085, 1, 1, 0.3, 16);
      l.castShadow = false;
      k.geo(extrudeZ(visorShape, 0.16, 0, 14), dark, 0, y, pz + 0.18);
      const rim = k.ring(0.104, 0.008, dark, 0, y, pz + 0.1, 20);
      rim.rotation.x = 0;
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const pz = TL_PZ;
      D.rr(ctx, 0, pz + 0.1, 0.3, 0.19, 0.03, '#55595e');
      D.rr(ctx, 0, pz - 0.085, 0.36, 0.03, 0.005, '#3a3d42', null);
      D.circle(ctx, 0, pz, 0.075, tint(c.pole, 0.4), undefined, LINE_THIN);
      for (const [x, col] of [
        [-0.09, '#d8362c'],
        [0, '#e6a51c'],
        [0.09, '#49c070'],
      ] as Array<[number, string]>) {
        D.circle(ctx, x, pz + 0.13, 0.03, col, null);
      }
    }),
};

/* ------------------------------------------------------------------ road signs */

const SIGN_T = 0.006;

/** Aluminium plate cut to `shape` (in the XY plane, centered on its own origin) with a printed face. */
function signPlate(k: Kit, shape: THREE.Shape, w: number, h: number, face: THREE.Material, x: number, y: number, z: number, twoSided = false): void {
  const plate = new THREE.ExtrudeGeometry(shape, { depth: SIGN_T, bevelEnabled: false, curveSegments: 6 });
  k.geo(plate, galv(), x, y, z - SIGN_T);
  const f = shapeFaceGeo(shape, w, h, 0, 0, 6);
  k.geo(f, face, x, y, z + 0.0012).castShadow = false;
  if (twoSided) {
    const b = f.clone();
    b.rotateY(Math.PI);
    k.geo(b, face, x, y, z - SIGN_T - 0.0012).castShadow = false;
  }
}

/** Round galvanized post with a cap, standing at (0, 0, z); two clamps hold a plate at `clampY`. */
function signPost(k: Kit, h: number, z: number, clampY: number[], r = 0.03): void {
  const m = galv();
  k.cyl(r, h, m, 0, 0, z, r, 12);
  k.sphere(r * 1.05, m, 0, h, z, 1, 0.45, 1, 10);
  k.cyl(r * 1.6, 0.012, m, 0, 0, z, r * 1.6, 12);
  for (const y of clampY) k.box(r * 2.6, 0.03, r * 2 + 0.014, m, 0, y - 0.015, z + 0.004);
}

function octShape(R: number): THREE.Shape {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < 8; i++) {
    const a = Math.PI / 8 + (i * Math.PI) / 4;
    pts.push([Math.cos(a) * R, Math.sin(a) * R]);
  }
  return polyShape(pts);
}

function octPath(c: C2D, cx: number, cy: number, R: number): void {
  c.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = Math.PI / 8 + (i * Math.PI) / 4;
    const x = cx + Math.cos(a) * R;
    const y = cy + Math.sin(a) * R;
    if (i === 0) c.moveTo(x, y);
    else c.lineTo(x, y);
  }
  c.closePath();
}

const stopFace = (): THREE.Material =>
  canvasMat(
    'sign-stop',
    256,
    256,
    (c, s) => {
      c.fillStyle = '#c4261d';
      c.fillRect(0, 0, s, s);
      octPath(c, s / 2, s / 2, s * 0.455);
      c.strokeStyle = '#ffffff';
      c.lineWidth = s * 0.035;
      c.stroke();
      // raised open hand
      c.fillStyle = '#ffffff';
      const px = s * 0.5;
      const py = s * 0.6;
      crr(c, px - s * 0.125, py - s * 0.09, s * 0.25, s * 0.25, s * 0.07);
      c.fill();
      const fw = s * 0.054;
      const fh = [0.2, 0.25, 0.235, 0.18];
      for (let i = 0; i < 4; i++) {
        const fx = px - s * 0.125 + i * (fw + s * 0.0113);
        crr(c, fx, py - s * 0.05 - s * fh[i], fw, s * fh[i] + s * 0.05, fw / 2);
        c.fill();
      }
      c.save();
      c.translate(px - s * 0.11, py + s * 0.04);
      c.rotate(-0.85);
      crr(c, -s * 0.03, -s * 0.16, s * 0.06, s * 0.19, s * 0.03);
      c.fill();
      c.restore();
      crr(c, px - s * 0.085, py + s * 0.1, s * 0.17, s * 0.12, s * 0.02);
      c.fill();
    },
    { fallback: '#c4261d', rough: 0.45 },
  );

const SIGN_BLUE = '#1c5aa6';

function blueSquare(c: C2D, s: number): void {
  c.fillStyle = SIGN_BLUE;
  c.fillRect(0, 0, s, s);
  crr(c, s * 0.035, s * 0.035, s * 0.93, s * 0.93, s * 0.07);
  c.strokeStyle = '#ffffff';
  c.lineWidth = s * 0.022;
  c.stroke();
}

const crosswalkFace = (): THREE.Material =>
  canvasMat(
    'sign-crosswalk',
    256,
    256,
    (c, s) => {
      blueSquare(c, s);
      // white triangle
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.moveTo(s * 0.5, s * 0.13);
      c.lineTo(s * 0.9, s * 0.84);
      c.lineTo(s * 0.1, s * 0.84);
      c.closePath();
      c.lineJoin = 'round';
      c.strokeStyle = '#ffffff';
      c.lineWidth = s * 0.04;
      c.stroke();
      c.fill();
      // zebra stripes
      c.fillStyle = '#16181b';
      for (let i = 0; i < 5; i++) {
        c.beginPath();
        const x = s * (0.25 + i * 0.105);
        c.moveTo(x, s * 0.76);
        c.lineTo(x + s * 0.07, s * 0.76);
        c.lineTo(x + s * 0.05, s * 0.81);
        c.lineTo(x - s * 0.02, s * 0.81);
        c.closePath();
        c.fill();
      }
      // walking figure
      c.strokeStyle = '#16181b';
      c.lineCap = 'round';
      c.beginPath();
      c.arc(s * 0.535, s * 0.33, s * 0.036, 0, Math.PI * 2);
      c.fill();
      c.lineWidth = s * 0.05;
      c.beginPath();
      c.moveTo(s * 0.525, s * 0.41);
      c.lineTo(s * 0.5, s * 0.56);
      c.stroke();
      c.lineWidth = s * 0.036;
      c.beginPath();
      c.moveTo(s * 0.5, s * 0.56);
      c.lineTo(s * 0.57, s * 0.64);
      c.lineTo(s * 0.6, s * 0.73);
      c.moveTo(s * 0.5, s * 0.56);
      c.lineTo(s * 0.45, s * 0.65);
      c.lineTo(s * 0.39, s * 0.73);
      c.stroke();
      c.lineWidth = s * 0.028;
      c.beginPath();
      c.moveTo(s * 0.525, s * 0.43);
      c.lineTo(s * 0.59, s * 0.5);
      c.lineTo(s * 0.64, s * 0.5);
      c.moveTo(s * 0.52, s * 0.43);
      c.lineTo(s * 0.455, s * 0.49);
      c.lineTo(s * 0.43, s * 0.55);
      c.stroke();
    },
    { fallback: SIGN_BLUE, rough: 0.45 },
  );

const parkingFace = (): THREE.Material =>
  canvasMat(
    'sign-parking',
    256,
    256,
    (c, s) => {
      blueSquare(c, s);
      // the letter P, drawn as a path so it does not depend on fonts
      c.strokeStyle = '#ffffff';
      c.lineWidth = s * 0.12;
      c.lineCap = 'butt';
      c.lineJoin = 'miter';
      c.beginPath();
      c.moveTo(s * 0.36, s * 0.82);
      c.lineTo(s * 0.36, s * 0.2);
      c.lineTo(s * 0.53, s * 0.2);
      c.arc(s * 0.53, s * 0.36, s * 0.16, -Math.PI / 2, Math.PI / 2);
      c.lineTo(s * 0.36, s * 0.52);
      c.stroke();
    },
    { fallback: SIGN_BLUE, rough: 0.45 },
  );

interface SignOpts {
  id: string;
  name: string;
  /** half width of the plate */
  R: number;
  centerY: number;
  shape: () => THREE.Shape;
  face: () => THREE.Material;
  plan: string;
}

function signDef(o: SignOpts): FurnitureDef {
  const w = +(o.R * 2).toFixed(3);
  const h = +(o.centerY + o.R).toFixed(3);
  const d = 0.12;
  const pz = -0.012;
  return {
    id: o.id,
    name: o.name,
    category: 'street',
    size: { w, d, h },
    build: () => {
      const k = new Kit();
      signPost(k, h - 0.02, pz, [o.centerY - o.R * 0.55, o.centerY + o.R * 0.55]);
      signPlate(k, o.shape(), o.R * 2, o.R * 2, o.face(), 0, o.centerY, pz + 0.03 + SIGN_T + 0.006);
      return k.g;
    },
    draw2d: (ctx) =>
      sym(ctx, () => {
        D.rr(ctx, 0, 0.03, w, 0.022, 0.004, o.plan, undefined, 0.008);
        D.circle(ctx, 0, pz, 0.032, '#d9dcdf', undefined, 0.008);
      }),
  };
}

const stopSign = signDef({
  id: 'stop-sign',
  name: 'תמרור עצור',
  R: 0.33,
  centerY: 2.34,
  shape: () => octShape(0.33 / Math.cos(Math.PI / 8)),
  face: stopFace,
  plan: '#d8473d',
});

const crosswalkSign = signDef({
  id: 'crosswalk-sign',
  name: 'תמרור מעבר חציה',
  R: 0.3,
  centerY: 2.4,
  shape: () => roundedRectShape(0.6, 0.6, 0.035),
  face: crosswalkFace,
  plan: '#3f77bd',
});

const parkingSign = signDef({
  id: 'parking-sign',
  name: 'תמרור חניה',
  R: 0.3,
  centerY: 2.4,
  shape: () => roundedRectShape(0.6, 0.6, 0.035),
  face: parkingFace,
  plan: '#3f77bd',
});

/* ------------------------------------------------------------------ street name sign */

const NAME = { w: 0.9, bh: 0.24, h: 2.8 };

const nameFace = (color: string): THREE.Material =>
  canvasMat(
    `sign-name|${color}`,
    512,
    136,
    (c, w, h) => {
      c.fillStyle = color;
      c.fillRect(0, 0, w, h);
      crr(c, 7, 7, w - 14, h - 14, 14);
      c.strokeStyle = '#ffffff';
      c.lineWidth = 5;
      c.stroke();
      c.fillStyle = '#ffffff';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = 'bold 68px Arial, "Noto Sans Hebrew", sans-serif';
      c.fillText('רחוב הפרחים', w / 2, h / 2 + 4);
    },
    { fallback: color, rough: 0.45 },
  );

const streetNameSign: FurnitureDef = {
  id: 'street-name-sign',
  name: 'שלט שם רחוב',
  category: 'street',
  size: { w: NAME.w, d: 0.1, h: NAME.h },
  colors: [slot('sign', 'שלט', '#1f5fae')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { w, bh, h } = NAME;
    signPost(k, h - bh - 0.02, 0, []);
    // slotted bracket on top of the post, blade readable from both sides
    k.box(0.05, 0.05, 0.03, galv(), 0, h - bh - 0.03, 0);
    signPlate(k, roundedRectShape(w, bh, 0.025), w, bh, nameFace(c.sign), 0, h - bh / 2, SIGN_T / 2, true);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, NAME.w, 0.024, 0.004, tint(c.sign, 0.25), undefined, 0.008);
      D.circle(ctx, 0, 0, 0.034, '#d9dcdf', undefined, 0.008);
    }),
};

/* ------------------------------------------------------------------ flagpole */

const FLAG = { px: -0.7, w: 1.5, h: 1.0, top: 5.86 };

const flagpole: FurnitureDef = {
  id: 'flagpole',
  name: 'תורן עם דגל',
  category: 'street',
  size: { w: 1.7, d: 0.3, h: 6.0 },
  colors: [slot('flag', 'דגל', '#f08a2c')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { px } = FLAG;
    const alu = M.metal('#e3e5e7', 0.35, 0.9);
    k.lathe(
      [
        [0.14, 0],
        [0.14, 0.05],
        [0.07, 0.09],
        [0.055, 0.5],
        [0.05, 0.52],
        [0.028, 5.88],
      ],
      alu,
      px,
      0,
      0,
      14,
    );
    k.sphere(0.055, M.brass(), px, 5.94, 0, 1, 1, 1, 14);
    // halyard + cleat
    k.rod([px + 0.05, 1.2, 0], [px + 0.034, FLAG.top, 0], 0.003, M.matte('#e9e6dc'), 0.003, 4);
    k.box(0.02, 0.08, 0.02, alu, px + 0.055, 1.14, 0);
    // rippling flag with a horizontal stripe
    const seg = 18;
    const rows = [0, 0.36, 0.64, 1];
    const mats = [M.cloth(c.flag), M.cloth(c.flag), M.cloth(c.flag)];
    for (let b = 0; b < 3; b++) {
      const pos: number[] = [];
      const idx: number[] = [];
      for (let i = 0; i <= seg; i++) {
        const t = i / seg;
        for (const v of [rows[b], rows[b + 1]]) {
          const x = px + 0.035 + t * FLAG.w;
          const sag = -0.1 * t * t - 0.03 * t * (1 - v);
          const y = FLAG.top - FLAG.h + v * FLAG.h + sag;
          const z = Math.sin(t * 8.5 + v * 1.1) * 0.075 * Math.min(1, t * 2.2);
          pos.push(x, y, z);
        }
        if (i < seg) {
          const a = i * 2;
          idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      k.geo(g, mats[b]);
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { px } = FLAG;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.bezierCurveTo(px + 0.4, 0.09, px + 0.9, -0.09, px + 1.53, 0.03);
      ctx.strokeStyle = tint(c.flag, 0.15);
      ctx.lineWidth = 0.05;
      ctx.stroke();
      D.circle(ctx, px, 0, 0.14, '#eceef0');
      D.circle(ctx, px, 0, 0.05, lighten('#8b8d8f', 0.3), undefined, LINE_THIN);
    }),
};

export const STREET_POLES: FurnitureDef[] = [streetLamp, trafficLight, stopSign, crosswalkSign, parkingSign, streetNameSign, flagpole];
