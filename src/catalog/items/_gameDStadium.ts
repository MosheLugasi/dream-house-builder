/** Team D catalog items: a small football stadium (goal, stands, floodlights, scoreboard, pitch lines). */
import * as THREE from 'three';
import type { FurnitureDef, SeatAnchor } from '../types';
import { D, INK_SOFT, Kit, M, darken, lighten, sym, tint, type V3 } from '../kit';
import { slot } from './_parts';
import { type C2D, canvasMat, netMat } from './_street_shared';

const GROUP = 'אצטדיון';

/* ------------------------------------------------------------------ goal */

/** Full-size-ish goal for the neighborhood stadium: mouth geometry is shared with the penalty game. */
export const STADIUM_GOAL = { w: 5.4, d: 2.0, h: 2.12, halfW: 2.55, top: 2.0, r: 0.06, mouthZ: 0.92, roofDepth: 0.85, backZ: -0.96 };

const stadiumGoal: FurnitureDef = {
  id: 'stadium-goal',
  name: 'שער כדורגל לאצטדיון',
  category: 'sports',
  group: GROUP,
  tags: ['כדורגל', 'שער', 'רשת', 'מגרש', 'פנדל'],
  size: { w: STADIUM_GOAL.w, d: STADIUM_GOAL.d, h: STADIUM_GOAL.h },
  colors: [slot('frame', 'מסגרת', '#f7f7f4'), slot('net', 'רשת', '#f2f2ee')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { halfW: x, top, r, mouthZ: zf, roofDepth, backZ: zb } = STADIUM_GOAL;
    const frame = M.paint(c.frame, 0.35);
    // posts + crossbar
    for (const s of [-1, 1]) {
      k.cyl(r, top, frame, s * x, 0, zf, r, 16);
      k.sphere(r, frame, s * x, top, zf, 1, 1, 1, 12);
    }
    const bar = k.cyl(r, x * 2, frame, 0, 0, 0, r, 16);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, top, zf);
    // net supports (thin, grey)
    const sup = M.metal('#c9ccd0', 0.4, 0.8);
    const zr = zf - roofDepth;
    for (const s of [-1, 1]) {
      k.rod([s * x, top, zf], [s * x, top, zr], 0.02, sup, 0.02, 8);
      k.rod([s * x, top, zr], [s * x, 0.03, zb], 0.02, sup, 0.02, 8);
      k.rod([s * x, 0.03, zf], [s * x, 0.03, zb], 0.025, sup, 0.025, 8);
    }
    k.rod([-x, 0.03, zb], [x, 0.03, zb], 0.025, sup, 0.025, 8);
    k.rod([-x, top, zr], [x, top, zr], 0.02, sup, 0.02, 8);
    // the net (a part, so the penalty game can swap it for a bulging one)
    const netPart = k.part('net', 0, 0, 0);
    const net = netMat(c.net, 0.09, true, [1, 1]);
    const cell = 1 / 0.14;
    const face = (pts: V3[]): void => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3));
      // planar uv in meters along the face's own axes
      const a = new THREE.Vector3(...pts[0]);
      const u = new THREE.Vector3(...pts[1]).sub(a);
      const ul = u.length();
      u.normalize();
      const n = new THREE.Vector3(...pts[2]).sub(a).cross(u).normalize();
      const v = new THREE.Vector3().crossVectors(u, n).normalize();
      const uv: number[] = [];
      for (const p of pts) {
        const q = new THREE.Vector3(...p).sub(a);
        uv.push((q.dot(u) / Math.max(ul, 1e-6)) * ul * cell, q.dot(v) * cell);
      }
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(pts.length === 4 ? [0, 1, 2, 0, 2, 3] : [0, 1, 2]);
      g.computeVertexNormals();
      netPart.geo(g, net).castShadow = false;
    };
    face([
      [-x, top, zf],
      [x, top, zf],
      [x, top, zr],
      [-x, top, zr],
    ]);
    face([
      [-x, top, zr],
      [x, top, zr],
      [x, 0.02, zb],
      [-x, 0.02, zb],
    ]);
    for (const s of [-1, 1]) {
      face([
        [s * x, top, zf],
        [s * x, 0.02, zf],
        [s * x, 0.02, zb],
        [s * x, top, zr],
      ]);
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { halfW: x, mouthZ: zf, backZ: zb } = STADIUM_GOAL;
      D.box(ctx, -x, zb, x, zf, 0, '#f4f5f2b0', INK_SOFT, 0.012);
      for (let i = 1; i < 14; i++) D.line(ctx, -x + (i * x * 2) / 14, zb, -x + (i * x * 2) / 14, zf, INK_SOFT, 0.004);
      D.line(ctx, -x, zf, x, zf, undefined, 0.14);
      D.line(ctx, -x, zf, x, zf, tint(c.frame, 0.3), 0.09);
    }),
};

/* ------------------------------------------------------------------ stand (bleachers) */

/** Bleachers: rows step up towards the back (-Z); spectators face +Z. */
export const STAND = { w: 8, d: 3.7, h: 2.75, rows: 4, rise: 0.42, tread: 0.82, base: 0.3, seatW: 0.52, seatH: 0.4 };

/** Local seat points (x, height of the seat surface, z) of a stand at its catalog size. */
export function standSeatPoints(): Array<{ x: number; y: number; z: number }> {
  const out: Array<{ x: number; y: number; z: number }> = [];
  const { w, d, rows, rise, tread, base, seatW, seatH } = STAND;
  const n = Math.floor((w - 0.5) / seatW);
  for (let i = 0; i < rows; i++) {
    const zFront = d / 2 - i * tread;
    const top = base + i * rise;
    for (let j = 0; j < n; j++) out.push({ x: -((n - 1) * seatW) / 2 + j * seatW, y: top + seatH, z: zFront - tread * 0.42 });
  }
  return out;
}

const standSeats: SeatAnchor[] = standSeatPoints()
  .filter((_, i) => i % 2 === 0)
  .map((p) => ({ x: p.x, z: p.z + 0.12, height: p.y, facing: 0, kind: 'sit' as const }));

const stadiumStand: FurnitureDef = {
  id: 'stadium-stand',
  name: 'טריבונת קהל',
  category: 'sports',
  group: GROUP,
  tags: ['יציע', 'אצטדיון', 'קהל', 'מושבים', 'טריבונה'],
  size: { w: STAND.w, d: STAND.d, h: STAND.h },
  colors: [slot('seats', 'מושבים', '#1f9d6a'), slot('seats2', 'מושבים (פס)', '#f2c230'), slot('concrete', 'בטון', '#b9b5ad')],
  seats: standSeats,
  build: ({ colors: c }) => {
    const k = new Kit();
    const { w, d, rows, rise, tread, base, seatW, seatH } = STAND;
    const conc = M.stone(c.concrete, 0.85);
    const concDark = M.stone(darken(c.concrete, 0.12), 0.9);
    const seatA = M.plastic(c.seats);
    const seatB = M.plastic(c.seats2);
    const n = Math.floor((w - 0.5) / seatW);
    for (let i = 0; i < rows; i++) {
      const zFront = d / 2 - i * tread;
      const top = base + i * rise;
      // the step: from the front of this row to the back wall
      const depth = zFront - (-d / 2 + 0.12);
      k.box(w, top, depth, i % 2 ? conc : concDark, 0, 0, zFront - depth / 2);
      // edge highlight (yellow safety stripe)
      k.box(w, 0.012, 0.05, M.paint('#e8c547', 0.5), 0, top, zFront - 0.025);
      // bucket seats
      for (let j = 0; j < n; j++) {
        const x = -((n - 1) * seatW) / 2 + j * seatW;
        const mat = (j + i * 3) % 7 === 3 ? seatB : seatA;
        const z = zFront - tread * 0.42;
        k.rbox(0.42, 0.05, 0.38, 0.02, mat, x, top + seatH - 0.05, z, 1);
        k.rbox(0.42, 0.32, 0.04, 0.02, mat, x, top + seatH - 0.02, z - 0.2, 1);
        k.box(0.08, seatH - 0.05, 0.12, concDark, x, top, z - 0.02);
      }
    }
    // back wall + railing
    const topY = base + (rows - 1) * rise;
    k.box(w, topY + 0.25, 0.12, conc, 0, 0, -d / 2 + 0.06);
    const rail = M.metal('#5d646c', 0.45, 0.8);
    const railY = STAND.h - 0.04;
    k.rod([-w / 2 + 0.05, railY, -d / 2 + 0.06], [w / 2 - 0.05, railY, -d / 2 + 0.06], 0.03, rail, 0.03, 10);
    for (let i = 0; i <= 8; i++) {
      const x = -w / 2 + 0.05 + (i / 8) * (w - 0.1);
      k.rod([x, topY + 0.25, -d / 2 + 0.06], [x, railY, -d / 2 + 0.06], 0.02, rail, 0.02, 8);
    }
    // side walls
    for (const s of [-1, 1]) {
      const shape = new THREE.Shape();
      shape.moveTo(-d / 2, 0);
      shape.lineTo(d / 2, 0);
      shape.lineTo(d / 2, base + 0.2);
      shape.lineTo(-d / 2 + 0.12, topY + 0.85);
      shape.lineTo(-d / 2, topY + 0.85);
      shape.closePath();
      const g = new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: false });
      g.rotateY(-Math.PI / 2);
      const m = k.geo(g, concDark, s * (w / 2) + (s > 0 ? 0 : 0.1), 0, 0);
      m.position.x = s > 0 ? w / 2 : -w / 2 + 0.1;
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { w, d, rows, tread } = STAND;
      D.box(ctx, -w / 2, -d / 2, w / 2, d / 2, 0, tint(c.concrete, 0.4));
      for (let i = 0; i < rows; i++) {
        const z = d / 2 - i * tread - tread * 0.42;
        D.box(ctx, -w / 2 + 0.2, z - 0.2, w / 2 - 0.2, z + 0.2, 0.05, tint(c.seats, 0.35), INK_SOFT, 0.008);
        D.line(ctx, -w / 2, d / 2 - (i + 1) * tread, w / 2, d / 2 - (i + 1) * tread, INK_SOFT);
      }
    }),
};

/* ------------------------------------------------------------------ floodlight mast */

const FL = { h: 12.4, headY: 11.5, headW: 2.3, headH: 1.3, tilt: 0.42 };

const floodlight: FurnitureDef = {
  id: 'stadium-floodlight',
  name: 'תורן תאורה לאצטדיון',
  category: 'sports',
  group: GROUP,
  tags: ['פרוז\'קטור', 'תאורה', 'אצטדיון', 'עמוד'],
  size: { w: 2.5, d: 1.4, h: FL.h },
  colors: [slot('metal', 'תורן', '#8d949b')],
  light: { x: 0, y: FL.headY - 0.4, z: 0.6, color: '#f4f6ff', intensity: 2200, distance: 48 },
  actions: [{ kind: 'light', label: 'להדליק את הפרוז\'קטור' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const metal = M.metal(c.metal, 0.45, 0.85);
    k.cyl(0.32, 0.25, M.stone('#a9a59e', 0.9), 0, 0, -0.2, 0.3, 16);
    k.cyl(0.16, FL.headY - 0.5, metal, 0, 0.25, -0.2, 0.09, 14);
    // maintenance ladder
    const lad = M.metal('#6f767d', 0.5, 0.7);
    for (const s of [-1, 1]) k.rod([s * 0.12, 0.3, -0.38], [s * 0.1, FL.headY - 0.9, -0.33], 0.012, lad, 0.012, 6);
    for (let y = 0.6; y < FL.headY - 1; y += 0.45) k.rod([-0.12, y, -0.37], [0.12, y, -0.37], 0.009, lad, 0.009, 5);
    // head: frame + 4×3 lamps, tilted down towards +Z
    const head = new Kit();
    head.box(FL.headW + 0.1, 0.06, 0.4, metal, 0, -FL.headH / 2 - 0.08, 0);
    head.box(FL.headW + 0.1, 0.06, 0.4, metal, 0, FL.headH / 2 + 0.02, 0);
    const glow = head.part('glow', 0, 0, 0);
    const lampBody = M.metal('#3a3f45', 0.5, 0.6);
    const lens = M.glow('#f6f8ff', 2.2, '#ffffff');
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 3; j++) {
        const x = -FL.headW / 2 + 0.29 + i * ((FL.headW - 0.58) / 3);
        const y = -FL.headH / 2 + 0.22 + j * ((FL.headH - 0.44) / 2);
        head.rbox(0.46, 0.34, 0.22, 0.03, lampBody, x, y - 0.17, -0.02, 1);
        glow.box(0.38, 0.27, 0.02, lens, x, y - 0.135, 0.1);
      }
    }
    const hg = k.sub(head, 0, FL.headY, 0.15);
    hg.rotation.x = FL.tilt;
    k.box(0.3, 0.35, 0.3, metal, 0, FL.headY - 0.55, -0.1);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.circle(ctx, 0, -0.2, 0.3, tint(c.metal, 0.4));
      D.rr(ctx, 0, 0.35, 2.3, 0.4, 0.04, '#fff6c8', INK_SOFT, 0.012);
    }),
};

/* ------------------------------------------------------------------ scoreboard */

/** The face of the scoreboard (local): the penalty game paints the live score over it. */
export const SCOREBOARD = { w: 5.2, d: 0.6, h: 5.6, faceY: 4.3, faceW: 4.7, faceH: 2.1, faceZ: 0.16 };

function drawBoard(g: C2D, w: number, h: number): void {
  g.fillStyle = '#0d1013';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#1f9d6a';
  g.fillRect(0, 0, w, h * 0.22);
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `700 ${Math.round(h * 0.14)}px system-ui, Arial, sans-serif`;
  g.direction = 'rtl';
  g.fillText('אצטדיון השכונה', w / 2, h * 0.11);
  g.font = `700 ${Math.round(h * 0.42)}px "Courier New", monospace`;
  g.fillStyle = '#ffb02e';
  g.direction = 'ltr';
  g.fillText('0 : 0', w / 2, h * 0.6);
  g.font = `600 ${Math.round(h * 0.1)}px system-ui, Arial, sans-serif`;
  g.fillStyle = '#9fe0c4';
  g.direction = 'rtl';
  g.fillText('בית', w * 0.82, h * 0.88);
  g.fillText('אורחים', w * 0.18, h * 0.88);
}

const scoreboard: FurnitureDef = {
  id: 'stadium-scoreboard',
  name: 'לוח תוצאות אלקטרוני',
  category: 'sports',
  group: GROUP,
  tags: ['לוח', 'תוצאה', 'אצטדיון', 'מסך'],
  size: { w: SCOREBOARD.w, d: SCOREBOARD.d, h: SCOREBOARD.h },
  colors: [slot('frame', 'מסגרת', '#2b3036')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { w, faceY, faceW, faceH, faceZ } = SCOREBOARD;
    const frame = M.metal(c.frame, 0.5, 0.6);
    for (const s of [-1, 1]) {
      k.box(0.22, faceY - faceH / 2, 0.22, frame, s * (w / 2 - 0.5), 0, -0.1);
      k.box(0.5, 0.08, 0.5, M.stone('#a9a59e', 0.9), s * (w / 2 - 0.5), 0, -0.1);
    }
    k.rbox(w, faceH + 0.4, 0.3, 0.04, frame, 0, faceY - faceH / 2 - 0.2, -0.0, 2);
    const face = canvasMat('d-scoreboard', 512, 228, drawBoard, { fallback: '#14181c', emissive: 0.9 });
    const g = new THREE.PlaneGeometry(faceW, faceH);
    k.geo(g, face, 0, faceY, faceZ);
    // little roof
    k.box(w + 0.1, 0.06, 0.6, frame, 0, faceY + faceH / 2 + 0.2, -0.0);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, SCOREBOARD.w, 0.3, 0.03, tint(c.frame, 0.5));
      for (const s of [-1, 1]) D.rr(ctx, s * (SCOREBOARD.w / 2 - 0.5), -0.1, 0.5, 0.5, 0, tint('#a9a59e', 0.4), INK_SOFT, 0.01);
    }),
};

/* ------------------------------------------------------------------ pitch markings */

/** Pitch for kids' football: goal lines at z = ±d/2. */
export const PITCH = { w: 26, d: 40, line: 0.1, spot: 9, boxW: 16, boxD: 12, areaW: 8, areaD: 4, circle: 4 };

const pitchLines: FurnitureDef = {
  id: 'pitch-lines',
  name: 'סימון מגרש כדורגל',
  category: 'sports',
  group: GROUP,
  tags: ['מגרש', 'קווים', 'כדורגל', 'סימון'],
  size: { w: PITCH.w, d: PITCH.d, h: 0.01 },
  walkable: true,
  colors: [slot('lines', 'קווים', '#f7f7f2')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { w, d, line: L, spot, boxW, boxD, areaW, areaD, circle } = PITCH;
    const mat = M.matte(c.lines);
    const y = 0.002;
    const hl = (x0: number, x1: number, z: number) => k.box(Math.abs(x1 - x0), 0.004, L, mat, (x0 + x1) / 2, y, z);
    const vl = (x: number, z0: number, z1: number) => k.box(L, 0.004, Math.abs(z1 - z0), mat, x, y, (z0 + z1) / 2);
    hl(-w / 2, w / 2, -d / 2 + L / 2);
    hl(-w / 2, w / 2, d / 2 - L / 2);
    hl(-w / 2, w / 2, 0);
    vl(-w / 2 + L / 2, -d / 2, d / 2);
    vl(w / 2 - L / 2, -d / 2, d / 2);
    const flat = (g: THREE.BufferGeometry, x: number, z: number) => {
      g.rotateX(-Math.PI / 2);
      k.geo(g, mat, x, y + 0.004, z);
    };
    flat(new THREE.RingGeometry(circle - L / 2, circle + L / 2, 64), 0, 0);
    flat(new THREE.CircleGeometry(0.15, 16), 0, 0);
    for (const s of [-1, 1]) {
      const gl = s * (d / 2);
      // penalty area, goal area, spot, arc
      hl(-boxW / 2, boxW / 2, gl - s * boxD);
      vl(-boxW / 2, gl, gl - s * boxD);
      vl(boxW / 2, gl, gl - s * boxD);
      hl(-areaW / 2, areaW / 2, gl - s * areaD);
      vl(-areaW / 2, gl, gl - s * areaD);
      vl(areaW / 2, gl, gl - s * areaD);
      flat(new THREE.CircleGeometry(0.13, 16), 0, gl - s * spot);
      // the "D": the part of a circle around the spot outside the box
      const r = 3.6;
      const a = Math.acos(Math.min(1, (boxD - spot) / r));
      const ring = new THREE.RingGeometry(r - L / 2, r + L / 2, 32, 1, (s * Math.PI) / 2 - a, a * 2);
      flat(ring, 0, gl - s * spot);
      // corner arcs
      for (const t of [-1, 1]) {
        // quarter facing into the pitch: cos θ has the sign of -t, sin θ the sign of s
        const start = s > 0 ? (t > 0 ? Math.PI / 2 : 0) : t > 0 ? Math.PI : (Math.PI * 3) / 2;
        flat(new THREE.RingGeometry(0.6, 0.6 + L, 10, 1, start, Math.PI / 2), t * (w / 2 - 0.05), gl - s * 0.05);
      }
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { w, d, boxW, boxD, areaW, areaD, circle, spot } = PITCH;
      const col = darken(c.lines, 0.35);
      ctx.strokeStyle = col;
      ctx.lineWidth = 0.12;
      ctx.strokeRect(-w / 2, -d / 2, w, d);
      D.line(ctx, -w / 2, 0, w / 2, 0, col, 0.12);
      D.circle(ctx, 0, 0, circle, null, col, 0.12);
      for (const s of [-1, 1]) {
        const gl = s * (d / 2);
        ctx.strokeRect(-boxW / 2, Math.min(gl, gl - s * boxD), boxW, boxD);
        ctx.strokeRect(-areaW / 2, Math.min(gl, gl - s * areaD), areaW, areaD);
        D.circle(ctx, 0, gl - s * spot, 0.2, col, null);
      }
    }),
};

/* ------------------------------------------------------------------ corner flag + ad board */

const cornerFlag: FurnitureDef = {
  id: 'corner-flag',
  name: 'דגל קרן',
  category: 'sports',
  group: GROUP,
  tags: ['דגל', 'קרן', 'כדורגל'],
  size: { w: 0.4, d: 0.12, h: 1.6 },
  colors: [slot('flag', 'דגל', '#f2c230')],
  build: ({ colors: c }) => {
    const k = new Kit();
    k.cyl(0.015, 1.55, M.paint('#f4f4f0', 0.4), -0.18, 0, 0, 0.012, 8);
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(0.36, -0.04);
    shape.quadraticCurveTo(0.3, -0.14, 0.36, -0.26);
    shape.lineTo(0, -0.28);
    shape.closePath();
    const g = new THREE.ShapeGeometry(shape, 6);
    const flag = new THREE.Mesh(g, M.cloth(c.flag));
    (flag.material as THREE.Material).side = THREE.DoubleSide;
    flag.position.set(-0.18, 1.55, 0);
    flag.castShadow = true;
    k.g.add(flag);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.circle(ctx, -0.18, 0, 0.04, '#ffffff');
      D.poly(ctx, [[-0.18, 0], [0.18, -0.03], [0.18, 0.03]], true, tint(c.flag, 0.2), INK_SOFT, 0.006);
    }),
};

const AD_TEXTS = ['בונים חלום', 'גלידה של סבתא', 'פיצה השכונה', 'ספריית הילדים'];

const adBoard: FurnitureDef = {
  id: 'pitch-ad-board',
  name: 'שלט פרסום לשולי המגרש',
  category: 'sports',
  group: GROUP,
  tags: ['פרסומת', 'שלט', 'אצטדיון', 'מגרש'],
  size: { w: 4, d: 0.5, h: 0.95 },
  colors: [slot('bg', 'רקע', '#1f6fd0'), slot('text', 'כיתוב', '#ffffff')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const key = `d-ad|${c.bg}|${c.text}`;
    const mat = canvasMat(
      key,
      512,
      112,
      (g, w, h) => {
        const grad = g.createLinearGradient(0, 0, w, 0);
        grad.addColorStop(0, c.bg);
        grad.addColorStop(1, darken(c.bg, 0.3));
        g.fillStyle = grad;
        g.fillRect(0, 0, w, h);
        g.fillStyle = lighten(c.bg, 0.25);
        for (let i = 0; i < 6; i++) g.fillRect(i * 96 - 30, 0, 16, h);
        g.fillStyle = c.text;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.direction = 'rtl';
        g.font = `800 ${Math.round(h * 0.55)}px system-ui, Arial, sans-serif`;
        const idx = Math.abs([...c.bg].reduce((a, ch) => a + ch.charCodeAt(0), 0)) % AD_TEXTS.length;
        g.fillText(`⚽ ${AD_TEXTS[idx]} ⚽`, w / 2, h * 0.54);
      },
      { fallback: c.bg, emissive: 0.25 },
    );
    const board = new Kit();
    board.box(4, 0.86, 0.05, M.metal('#2f3338', 0.5, 0.5), 0, 0, -0.03);
    board.geo(new THREE.PlaneGeometry(3.94, 0.8), mat, 0, 0.43, 0.0);
    const b = k.sub(board, 0, 0.05, 0.05);
    b.rotation.x = -0.2;
    for (const s of [-1, 1]) k.rod([s * 1.8, 0, -0.22], [s * 1.8, 0.55, -0.1], 0.02, M.metal('#2f3338', 0.5, 0.5), 0.02, 6);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 4, 0.2, 0.02, tint(c.bg, 0.3));
    }),
};

export const STADIUM_ITEMS: FurnitureDef[] = [stadiumGoal, stadiumStand, floodlight, scoreboard, pitchLines, cornerFlag, adBoard];
