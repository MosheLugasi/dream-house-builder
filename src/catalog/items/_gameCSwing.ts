/**
 * Team C – pirate ship (ספינת פיראטים), spinning teacups (ספלים מסתובבים) and bumper cars
 * (מכוניות מתנגשות).
 */
import * as THREE from 'three';
import { D, INK_SOFT, Kit, LINE_THIN, M, darken, latheGeo, roundedRectShape, sym, tint } from '../kit';
import type { FurnitureDef } from '../types';
import { slot } from './_parts';
import { bakedPart, partKey, seatNode } from './_ride';
import { rideSound } from './_gameCAudio';
import { BULB_COLORS, Instanced, RideBase, TINT_GLOSS, bulbStrip, clamp, idleTicker, relMatrix, signMat, smooth } from './_gameCKit';

type Colors = Record<string, string>;
const TAU = Math.PI * 2;

/* ================================================================== pirate ship */

const PS = { P: 10.8, xHalf: 6.4, legX: 4.6, legZ: 3.9, frameZ: 2.35, amp: 1.2, period: 5.6 };

const keelY = (x: number): number => 0.55 + 0.9 * (x / PS.xHalf) ** 2;
const gunY = (x: number): number => 2.05 + 1.3 * (x / PS.xHalf) ** 2;
const halfW = (x: number): number => 1.75 * Math.pow(Math.max(0, 1 - Math.abs(x / 6.6) ** 2.5), 0.7);
const floorY = (x: number): number => keelY(x) + 0.35;
const ROWS = [-4.1, -2.8, -1.5, 1.5, 2.8, 4.1];

/** hull surface: u along the ship, v around the U-shaped section; inset > 0 = the inner skin */
function hullGeo(inset: number, flip: boolean): THREE.BufferGeometry {
  const nu = 28;
  const nv = 12;
  const pos: number[] = [];
  const uv: number[] = [];
  for (let i = 0; i <= nu; i++) {
    const x = -PS.xHalf + (2 * PS.xHalf * i) / nu;
    const w = Math.max(0.02, halfW(x) - inset);
    const yk = keelY(x) + inset;
    const yg = gunY(x);
    for (let j = 0; j <= nv; j++) {
      const phi = -Math.PI / 2 + (Math.PI * j) / nv;
      pos.push(x, yk + (yg - yk) * (1 - Math.cos(phi)), w * Math.sin(phi));
      uv.push(x / 1.2, j / nv * 2.5);
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < nu; i++)
    for (let j = 0; j < nv; j++) {
      const a = i * (nv + 1) + j;
      const b = a + nv + 1;
      if (flip) idx.push(a, a + 1, b, a + 1, b + 1, b);
      else idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const flagMats = new Map<string, THREE.Material>();
function jollyRoger(): THREE.Material {
  let m = flagMats.get('jr');
  if (m) return m;
  if (typeof document === 'undefined') m = M.cloth('#1a1a1a');
  else {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 170;
    const g = c.getContext('2d')!;
    g.fillStyle = '#16161a';
    g.fillRect(0, 0, 256, 170);
    g.fillStyle = '#f4f1ea';
    g.beginPath();
    g.arc(128, 70, 34, 0, TAU);
    g.fill();
    g.fillRect(108, 90, 40, 26);
    g.fillStyle = '#16161a';
    for (const x of [114, 142]) {
      g.beginPath();
      g.arc(x, 68, 9, 0, TAU);
      g.fill();
    }
    g.fillRect(124, 96, 3, 14);
    g.fillRect(131, 96, 3, 14);
    g.strokeStyle = '#f4f1ea';
    g.lineWidth = 12;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(70, 120);
    g.lineTo(186, 160);
    g.moveTo(186, 120);
    g.lineTo(70, 160);
    g.stroke();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, side: THREE.DoubleSide });
  }
  flagMats.set('jr', m);
  return m;
}

const hullMats = new Map<string, THREE.Material>();
function hullPaint(color: string): THREE.Material {
  let m = hullMats.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0, side: THREE.DoubleSide });
    hullMats.set(color, m);
  }
  return m;
}

/** the ship in "ground" coordinates at rest (y = 0 on the ground); shifted under the pivot later */
function shipGeo(c: Colors): THREE.Object3D {
  const k = new Kit();
  const gold = M.metal('#d9a93a', 0.35, 0.8);
  k.geo(hullGeo(0, false), hullPaint(c.hull));
  k.geo(hullGeo(0.07, true), M.wood('#9a7652', 0.7));
  // gunwale cap + a gold trim line below it
  const cap: Array<[number, number, number]> = [];
  const trim: Array<[number, number, number]> = [];
  for (let i = 0; i <= 24; i++) {
    const x = -PS.xHalf + 0.05 + ((2 * PS.xHalf - 0.1) * i) / 24;
    cap.push([x, gunY(x), halfW(x)]);
    trim.push([x, gunY(x) - 0.42 - 0.2 * (x / PS.xHalf) ** 2, halfW(x) * 0.985]);
  }
  for (const s of [-1, 1]) {
    k.tube(cap.map(([x, y, z]) => [x, y, s * z] as [number, number, number]), 0.07, M.wood('#5b3a22', 0.6), { seg: 48, radial: 6 });
    k.tube(trim.map(([x, y, z]) => [x, y, s * (z + 0.02)] as [number, number, number]), 0.04, gold, { seg: 48, radial: 5 });
  }
  // shields along both sides
  for (let x = -4.8; x <= 4.81; x += 1.2) {
    for (const s of [-1, 1]) {
      const y = gunY(x) - 0.75;
      const z = s * (halfW(x) * Math.sin(Math.acos(1 - (y - keelY(x)) / (gunY(x) - keelY(x)))) + 0.04);
      const sh = k.cyl(0.26, 0.05, M.paint(Math.round(x / 1.2) % 2 ? c.sail : '#d9a93a', 0.4), x, y, z, 0.26, 14);
      sh.rotation.x = Math.PI / 2;
      sh.position.set(x, y, z);
      k.sphere(0.06, gold, x, y, z + s * 0.04, 1, 1, 1, 8);
    }
  }
  // stepped floor and the benches; riders face the middle
  const bench = M.wood('#6e4a2c', 0.6);
  const yellow = M.paint('#f2c21b', 0.35);
  for (const x of ROWS) {
    const s = Math.sign(x);
    const w = halfW(x + s * 0.4) * 2 - 0.35;
    k.box(1.3, 0.08, w, M.wood('#a7835e', 0.7), x, floorY(x) - 0.08, 0);
    k.box(0.45, 0.08, w - 0.1, bench, x + s * 0.1, floorY(x) + 0.37, 0);
    k.box(0.4, 0.38, w - 0.1, M.paint(darken(c.hull, 0.35), 0.6), x + s * 0.1, floorY(x), 0);
    k.box(0.08, 0.55, w - 0.1, bench, x + s * 0.36, floorY(x) + 0.42, 0);
    k.rod([x - s * 0.3, floorY(x) + 0.78, -w / 2 + 0.1], [x - s * 0.3, floorY(x) + 0.78, w / 2 - 0.1], 0.035, yellow, 0.035, 6);
  }
  // bow: bowsprit + figurehead; stern: a little castle with lanterns
  const bx = PS.xHalf;
  k.rod([bx - 0.6, gunY(bx) - 0.1, 0], [bx + 0.15, gunY(bx) + 0.5, 0], 0.07, M.wood('#5b3a22', 0.6), 0.04, 8);
  k.sphere(0.2, gold, bx - 0.05, gunY(bx) - 0.35, 0, 1.2, 1, 0.9, 12);
  const sx = -PS.xHalf + 0.8;
  k.box(1.1, 0.7, halfW(sx) * 1.7, M.paint(c.hull, 0.5), sx, gunY(sx) - 0.25, 0);
  k.box(1.25, 0.08, halfW(sx) * 1.85, gold, sx, gunY(sx) + 0.45, 0);
  for (const s of [-1, 1]) k.sphere(0.1, M.glow('#ffb84a', 3.0, '#ffe2a0'), sx - 0.4, gunY(sx) + 0.62, s * 0.5, 1, 1.3, 1, 10);
  // mast with a sail and the skull flag
  const wood = M.wood('#5b3a22', 0.6);
  k.cyl(0.1, 7.6 - floorY(0), wood, 0, floorY(0), 0, 0.07, 10);
  k.rod([0, 6.0, -1.5], [0, 6.0, 1.5], 0.05, wood, 0.05, 6);
  k.rod([0, 3.2, -1.7], [0, 3.2, 1.7], 0.05, wood, 0.05, 6);
  const sail = new THREE.PlaneGeometry(3.2, 2.7, 6, 4);
  const sp = sail.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < sp.count; i++) {
    const u = sp.getX(i) / 1.6;
    const v = sp.getY(i) / 1.35;
    sp.setZ(i, 0.35 * (1 - u * u) * (1 - 0.3 * v * v));
  }
  sail.computeVertexNormals();
  sail.rotateY(Math.PI / 2);
  k.geo(sail, M.cloth(c.sail), 0.05, 4.6, 0);
  const flag = k.geo(new THREE.PlaneGeometry(1.1, 0.72), jollyRoger(), 0.06, 7.0, 0.62);
  flag.rotation.y = Math.PI / 2;
  // arms up to the axle (built in the pivot frame later: from the gunwale to (0, P, ±frameZ-0.2))
  const armM = M.metal(c.arms, 0.4, 0.6);
  for (const s of [-1, 1]) {
    for (const ax of [-1.4, 1.4]) k.rod([ax, gunY(ax) - 0.2, s * (halfW(ax) + 0.08)], [0, PS.P, s * (PS.frameZ - 0.32)], 0.13, armM, 0.1, 10);
  }
  return k.g;
}

function pirateFrame(c: Colors): THREE.Object3D {
  const k = new Kit();
  const frame = M.metal(c.arms, 0.4, 0.6);
  const conc = M.stone('#a9a59d', 0.85);
  const { P, legX, legZ, frameZ } = PS;
  for (const sz of [-1, 1]) {
    for (const sx of [-1, 1]) {
      k.rod([sx * legX, 0.25, sz * legZ], [sx * 0.2, P + 0.1, sz * frameZ], 0.2, frame, 0.15, 12);
      k.box(1.0, 0.25, 1.0, conc, sx * legX, 0, sz * legZ);
    }
    k.rod([-legX * 0.62, 4.0, sz * (legZ - (legZ - frameZ) * 0.37)], [legX * 0.62, 4.0, sz * (legZ - (legZ - frameZ) * 0.37)], 0.09, frame, 0.09, 8);
    k.box(0.7, 0.8, 0.5, M.metal('#3a3d42', 0.5, 0.8), 0, P - 0.4, sz * frameZ);
  }
  const ax = k.cyl(0.2, frameZ * 2 + 0.4, M.metal('#8d9399', 0.35, 0.9), 0, 0, 0, 0.2, 14);
  ax.rotation.x = Math.PI / 2;
  ax.position.set(0, P, 0);
  // name board on top
  k.box(5.2, 1.0, 0.12, M.paint('#3b2516', 0.6), 0, P + 0.42, 0);
  const sg = k.geo(new THREE.PlaneGeometry(5.0, 0.86), signMat('ספינת הפיראטים', '#5b2a14', '#ffe27a', { icon: '🏴‍☠️', w: 1024, h: 176, border: '#d9a93a', glow: 0.6 }), 0, P + 0.92, 0.065);
  sg.castShadow = false;
  const back = k.geo(new THREE.PlaneGeometry(5.0, 0.86), signMat('ספינת הפיראטים', '#5b2a14', '#ffe27a', { icon: '🏴‍☠️', w: 1024, h: 176, border: '#d9a93a', glow: 0.6 }), 0, P + 0.92, -0.065);
  back.rotation.y = Math.PI;
  // bulbs along the four legs
  const pts: THREE.Vector3[] = [];
  for (const sz of [-1, 1])
    for (const sx of [-1, 1])
      for (let i = 1; i <= 14; i++) {
        const f = i / 15;
        pts.push(new THREE.Vector3(sx * (legX + (0.2 - legX) * f), 0.25 + (P - 0.15) * f, sz * (legZ + (frameZ - legZ) * f) + sz * 0.22));
      }
  for (let i = 0; i <= 16; i++) pts.push(new THREE.Vector3(-2.5 + (5 * i) / 16, P + 1.0, 0.1));
  for (const m of bulbStrip(pts, 0.09, BULB_COLORS, 3.2)) k.g.add(m);
  // boarding steps on the front side
  k.box(2.4, 0.18, 0.6, M.wood('#8a6a4c', 0.7), 0, 0, 2.3);
  k.box(2.4, 0.36, 0.5, M.wood('#8a6a4c', 0.7), 0, 0, 1.85);
  return k.g;
}

class PirateRide extends RideBase {
  readonly kind = 'pirate' as const;
  label = 'ספינת הפיראטים';
  icon = '🏴‍☠️';
  thrill = 3;
  entrance = { x: 0, z: 3.2, facing: Math.PI };
  theta = 0;
  private prevTheta = 0;
  private prevOmega = 0;
  readonly T = 21;

  constructor(private pivot: THREE.Object3D) {
    super();
    this.loadTime = 1.8;
  }

  protected advance(h: number): boolean {
    const t = this.t;
    const env = smooth(t / 9) * (1 - smooth((t - 14) / 7));
    const A = PS.amp * env;
    const w = TAU / PS.period;
    this.theta = A * Math.sin(w * t);
    const omega = (this.theta - this.prevTheta) / Math.max(h, 1e-3);
    this.pivot.rotation.z = this.theta;
    this.progress = clamp(t / this.T, 0, 1);
    this.speed = Math.abs(omega) * 8;
    this.rush = clamp(Math.abs(this.theta) / PS.amp + Math.abs(omega) * 0.1, 0, 1);
    this.drop = A > 0.75 && Math.abs(this.theta) > 0.45 * A && this.theta * omega < 0;
    if (this.playerOn) {
      if (Math.sign(this.theta) !== Math.sign(this.prevTheta) && A > 0.55) rideSound.whoosh(0.35 + 0.4 * env);
      if (Math.sign(omega) !== Math.sign(this.prevOmega) && Math.abs(this.theta) > 0.85) rideSound.scream(3, 'drop', 0.25);
    }
    this.prevTheta = this.theta;
    this.prevOmega = omega;
    if (t >= this.T) {
      this.theta = 0;
      this.pivot.rotation.z = 0;
      return true;
    }
    return false;
  }

  protected rest(): void {
    this.pivot.rotation.z = this.theta = 0;
  }
}

export const pirateShip: FurnitureDef = {
  id: 'amuse-pirate-ship',
  name: 'ספינת פיראטים',
  category: 'playground',
  group: 'לונה פארק',
  tags: ['לונה פארק', 'ספינה', 'נדנדה', 'פיראטים', 'מתקן'],
  size: { w: 13.6, d: 9, h: 12.4 },
  resize: false,
  parametric: true,
  noBake: true,
  colors: [slot('hull', 'גוף הספינה', '#8c2a1e'), slot('sail', 'מפרש', '#f1e8d2'), slot('arms', 'מבנה', '#2f3b52')],
  light: { x: 0, y: PS.P + 0.9, z: 0.6, color: '#ffd9a0', intensity: 90, distance: 22 },
  actions: [{ kind: 'light' }],
  ride: { kind: 'swing', prompt: 'לעלות על ספינת הפיראטים' },
  build: ({ colors: c }) => {
    const root = new THREE.Group();
    const frame = bakedPart(partKey('pirate-frame', c, ['arms']), () => pirateFrame(c));
    root.add(frame);
    const pivot = new THREE.Group();
    pivot.position.y = PS.P;
    const ship = bakedPart(partKey('pirate-ship', c, ['hull', 'sail', 'arms']), () => shipGeo(c));
    ship.position.y = -PS.P;
    pivot.add(ship);
    root.add(pivot);
    const seatNodes: THREE.Object3D[] = [];
    for (const x of ROWS) {
      const s = Math.sign(x);
      const w = halfW(x + s * 0.4) * 2 - 0.35;
      for (const z of [-w / 3, 0, w / 3]) seatNodes.push(seatNode(pivot, x + s * 0.1, floorY(x) + 0.45 - PS.P, z, s > 0 ? -Math.PI / 2 : Math.PI / 2));
    }
    const rt = new PirateRide(pivot);
    rt.setSeats(seatNodes, root);
    root.userData.ride = rt;
    root.userData.amuse = rt;
    root.userData.anchors = {
      light: { x: 0, y: PS.P + 0.9, z: 0.6 },
      boxes: [-1, 1].flatMap((sx) => [-1, 1].map((sz) => ({ x: sx * PS.legX, z: sz * PS.legZ, w: 1.0, d: 1.0, h: 3 }))),
    };
    return root;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const pts: Array<[number, number]> = [];
      for (let i = 0; i <= 20; i++) {
        const x = -PS.xHalf + (2 * PS.xHalf * i) / 20;
        pts.push([x, halfW(x)]);
      }
      for (let i = 20; i >= 0; i--) pts.push([pts[i][0], -pts[i][1]]);
      D.poly(ctx, pts, true, tint(c.hull, 0.45), INK_SOFT, LINE_THIN);
      for (const x of ROWS) D.line(ctx, x, -halfW(x) + 0.2, x, halfW(x) - 0.2, darken(c.hull, 0.2), 0.05);
      for (const sz of [-1, 1]) for (const sx of [-1, 1]) D.line(ctx, sx * PS.legX, sz * PS.legZ, sx * 0.2, sz * PS.frameZ, tint(c.arms, 0.2), 0.2);
      D.line(ctx, 0, -PS.frameZ - 0.2, 0, PS.frameZ + 0.2, c.arms, 0.18);
    }),
};

/* ================================================================== teacups */

const TC = { PR: 6.1, tableR: 3.35, TR: 2.05, cupOff: 1.15, perTable: 3, deckY: 0.12, T: 20 };

function teacupStatic(c: Colors): THREE.Object3D {
  const k = new Kit();
  // the pedestal and the giant teapot on top (does not turn)
  const pot = M.ceramic(c.teapot);
  k.cyl(0.95, 2.4, M.paint('#f4f1ea', 0.5), 0, 0, 0, 0.8, 20);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    const st = k.box(0.22, 2.38, 0.06, M.paint(c.teapot, 0.4), Math.sin(a) * 0.88, 0.0, Math.cos(a) * 0.88);
    st.rotation.y = a;
    st.position.set(Math.sin(a) * 0.86, 1.19, Math.cos(a) * 0.86);
    st.rotation.z = 0;
  }
  k.lathe(
    [
      [0, 2.4],
      [0.6, 2.42],
      [1.05, 2.7],
      [1.25, 3.2],
      [1.2, 3.75],
      [0.95, 4.15],
      [0.55, 4.3],
      [0, 4.3],
    ],
    pot,
    0,
    0,
    0,
    28,
  );
  k.lathe(
    [
      [0, 4.28],
      [0.6, 4.3],
      [0.5, 4.48],
      [0.12, 4.56],
      [0.14, 4.7],
      [0.2, 4.85],
      [0, 4.92],
    ],
    M.ceramic('#f4f1ea'),
    0,
    0,
    0,
    20,
  );
  k.tube(
    [
      [1.1, 3.1, 0],
      [1.6, 3.4, 0],
      [1.95, 3.95, 0],
      [2.15, 4.3, 0],
    ],
    0.16,
    pot,
    { seg: 12, radial: 10 },
  );
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.12, 8, 18, Math.PI * 1.15), pot);
  handle.position.set(-1.25, 3.4, 0);
  handle.rotation.z = Math.PI / 2 + 0.05;
  handle.castShadow = true;
  k.g.add(handle);
  // polka dots on the teapot
  const dots: THREE.Vector3[] = [];
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * TAU;
    for (const y of [3.0, 3.6]) dots.push(new THREE.Vector3(Math.sin(a + (y > 3.2 ? 0.17 : 0)) * 1.24, y, Math.cos(a + (y > 3.2 ? 0.17 : 0)) * 1.24));
  }
  for (const d of dots) k.sphere(0.09, M.paint('#ffffff', 0.4), d.x, d.y, d.z, 1, 1, 0.3, 8).lookAt(0, d.y, 0);
  // ring of bulbs around the deck edge (on the fixed skirt)
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < 56; i++) {
    const a = (i / 56) * TAU;
    pts.push(new THREE.Vector3(Math.sin(a) * (TC.PR + 0.18), 0.12, Math.cos(a) * (TC.PR + 0.18)));
  }
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * TAU;
    pts.push(new THREE.Vector3(Math.sin(a) * 1.3, 2.4, Math.cos(a) * 1.3));
  }
  for (const m of bulbStrip(pts, 0.07, BULB_COLORS, 3.2)) k.g.add(m);
  // fixed skirt ring
  const skirt = new THREE.Mesh(new THREE.TorusGeometry(TC.PR + 0.12, 0.1, 6, 64), M.paint(c.deck, 0.5));
  skirt.rotation.x = Math.PI / 2;
  skirt.position.y = 0.1;
  k.g.add(skirt);
  return k.g;
}

/** the big turning deck (origin on the axis, ground level) */
function teacupDeck(c: Colors): THREE.Object3D {
  const k = new Kit();
  const cols = [M.paint(c.deck, 0.55), M.paint('#fbf6ea', 0.55)];
  for (let i = 0; i < 12; i++) {
    const g = new THREE.CylinderGeometry(TC.PR, TC.PR, TC.deckY, 6, 1, false, (i / 12) * TAU, TAU / 12);
    g.translate(0, TC.deckY / 2, 0);
    k.geo(g, cols[i % 2]);
  }
  k.cyl(1.05, 0.05, M.metal('#8d9399', 0.4, 0.8), 0, TC.deckY, 0, 1.05, 24);
  return k.g;
}

/** a small turntable (origin at its centre on the deck surface) */
function teacupTable(c: Colors): THREE.Object3D {
  const k = new Kit();
  k.cyl(TC.TR, 0.06, M.paint(darken(c.deck, 0.15), 0.5), 0, 0, 0, TC.TR, 32);
  k.ring(TC.TR - 0.04, 0.03, M.metal('#d9a93a', 0.35, 0.8), 0, 0.06, 0, 32);
  k.cyl(0.25, 0.1, M.metal('#8d9399', 0.4, 0.8), 0, 0.06, 0, 0.2, 12);
  return k.g;
}

/** one cup (origin at the turntable surface under its centre); TINT_GLOSS gets each cup's colour */
function teacup(): THREE.Object3D {
  const k = new Kit();
  const gold = M.metal('#d9a93a', 0.3, 0.85);
  k.cyl(0.95, 0.06, M.ceramic('#fbf8f2'), 0, 0.06, 0, 0.98, 28);
  k.ring(0.96, 0.025, gold, 0, 0.12, 0, 32);
  k.geo(
    latheGeo(
      [
        [0, 0.14],
        [0.45, 0.12],
        [0.62, 0.3],
        [0.8, 0.72],
        [0.85, 1.0],
        [0.79, 1.0],
        [0.74, 0.74],
        [0.58, 0.36],
        [0.42, 0.22],
        [0, 0.22],
      ],
      28,
    ),
    TINT_GLOSS,
  );
  k.ring(0.82, 0.035, gold, 0, 1.0, 0, 32);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.06, 8, 14, Math.PI * 1.2), TINT_GLOSS);
  handle.position.set(0.86, 0.62, 0);
  handle.rotation.z = -Math.PI / 2 - 0.1 * Math.PI;
  handle.castShadow = true;
  k.g.add(handle);
  // bench ring inside and the wheel in the middle
  const seat = M.leather('#7a3b2a');
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.11, 6, 24), seat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.4;
  k.g.add(ring);
  k.cyl(0.05, 0.55, M.metal('#c9ccce', 0.3, 0.9), 0, 0.22, 0, 0.05, 8);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.035, 6, 18), gold);
  wheel.rotation.x = Math.PI / 2;
  wheel.position.y = 0.78;
  k.g.add(wheel);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU;
    k.rod([0, 0.78, 0], [Math.sin(a) * 0.24, 0.78, Math.cos(a) * 0.24], 0.018, gold, 0.018, 5);
  }
  return k.g;
}

class TeacupRide extends RideBase {
  readonly kind = 'teacups' as const;
  label = 'הספלים המסתובבים';
  icon = '☕';
  thrill = 2;
  entrance = { x: 0, z: TC.PR + 0.7, facing: Math.PI };
  aMain = 0;
  aTable = 0;
  readonly spin: number[];
  readonly ang: number[];
  private spun = false;
  private m = new THREE.Matrix4();

  constructor(
    private deck: THREE.Object3D,
    private tables: THREE.Object3D[],
    private cups: THREE.Object3D[],
    private inst: Instanced,
    private root: THREE.Object3D,
  ) {
    super();
    this.spin = cups.map(() => 0);
    this.ang = cups.map((_, i) => i * 1.3);
    this.loadTime = 1.4;
    this.place();
  }

  protected onStart(): void {
    this.spun = false;
  }

  /** cup of a seat */
  static cupOf(seat: number): number {
    return Math.floor(seat / 2);
  }

  protected advance(h: number, push: number, riders: readonly number[]): boolean {
    const t = this.t;
    const s = smooth(t / 3) * (1 - smooth((t - (TC.T - 4)) / 3.5));
    this.aMain += 0.5 * s * h;
    this.aTable -= 1.15 * s * h;
    const mine = new Set(riders.map(TeacupRide.cupOf));
    const npc = new Set([...this.extraRiders].map(TeacupRide.cupOf));
    let still = true;
    for (let i = 0; i < this.cups.length; i++) {
      const drive = s > 0.3 ? (mine.has(i) ? push * 3.4 : npc.has(i) ? 1.1 + ((i * 7) % 5) * 0.25 : 0.4) : 0;
      this.spin[i] = clamp(this.spin[i] + (drive - 0.45 * this.spin[i]) * h, -6, 6.5);
      this.ang[i] += this.spin[i] * h;
      if (Math.abs(this.spin[i]) > 0.05) still = false;
    }
    let mx = 0;
    for (const i of mine) mx = Math.max(mx, Math.abs(this.spin[i]));
    this.rush = clamp(mx / 5.5, 0, 1);
    this.speed = mx * 0.8 + s * 3;
    this.progress = clamp(t / TC.T, 0, 1);
    if (mx > 5 && !this.spun) {
      this.spun = true;
      this.emit('spin');
      if (this.playerOn) rideSound.scream(2, 'whee', 0.25);
    }
    this.place();
    return t >= TC.T && still;
  }

  protected rest(h: number): void {
    for (let i = 0; i < this.cups.length; i++) {
      this.spin[i] *= Math.max(0, 1 - 1.5 * h);
      this.ang[i] += this.spin[i] * h;
    }
    this.place();
  }

  private place(): void {
    this.deck.rotation.y = this.aMain;
    for (const t of this.tables) t.rotation.y = this.aTable;
    for (let i = 0; i < this.cups.length; i++) {
      this.cups[i].rotation.y = this.ang[i];
      this.inst.set(i, relMatrix(this.cups[i], this.root, this.m));
    }
    this.inst.commit();
  }
}

const CUP_COLORS = ['#f06a8a', '#5aa9e6', '#f2c14e', '#7bc47f', '#b48ae0', '#f08a4b', '#4fc1c9', '#e65a5a', '#f2f0ea'];

export const teacups: FurnitureDef = {
  id: 'amuse-teacups',
  name: 'ספלים מסתובבים',
  category: 'playground',
  group: 'לונה פארק',
  tags: ['לונה פארק', 'ספלים', 'קומקום', 'מסתובב', 'ילדים', 'מתקן'],
  size: { w: 12.8, d: 12.8, h: 4.95 },
  resize: false,
  parametric: true,
  noBake: true,
  colors: [slot('deck', 'במה', '#3f8fd0'), slot('teapot', 'קומקום', '#e85d8a')],
  light: { x: 0, y: 4.6, z: 0, color: '#ffd9a0', intensity: 80, distance: 18 },
  actions: [{ kind: 'light' }],
  ride: { kind: 'spin', prompt: 'לשבת בספל המסתובב' },
  build: ({ colors: c }) => {
    const root = new THREE.Group();
    const stat = bakedPart(partKey('teacup-static', c, ['deck', 'teapot']), () => teacupStatic(c));
    root.add(stat);
    const deck = new THREE.Group();
    deck.add(bakedPart(partKey('teacup-deck', c, ['deck']), () => teacupDeck(c)));
    root.add(deck);
    const tables: THREE.Object3D[] = [];
    const cups: THREE.Object3D[] = [];
    const seatNodes: THREE.Object3D[] = [];
    for (let t = 0; t < 3; t++) {
      const a = (t / 3) * TAU + Math.PI / 3;
      const table = new THREE.Group();
      table.position.set(Math.sin(a) * TC.tableR, TC.deckY, Math.cos(a) * TC.tableR);
      table.add(bakedPart(partKey('teacup-table', c, ['deck']), () => teacupTable(c)));
      deck.add(table);
      tables.push(table);
      for (let j = 0; j < TC.perTable; j++) {
        const b = (j / TC.perTable) * TAU;
        const cup = new THREE.Object3D();
        cup.position.set(Math.sin(b) * TC.cupOff, 0.06, Math.cos(b) * TC.cupOff);
        table.add(cup);
        cups.push(cup);
        seatNodes.push(seatNode(cup, 0.5, 0.5, 0, -Math.PI / 2), seatNode(cup, -0.5, 0.5, 0, Math.PI / 2));
      }
    }
    const inst = new Instanced(bakedPart('teacup-cup', teacup), cups.length, CUP_COLORS);
    root.add(inst.group);
    const rt = new TeacupRide(deck, tables, cups, inst, root);
    rt.setSeats(seatNodes);
    root.userData.ride = rt;
    root.userData.amuse = rt;
    idleTicker(rt, inst.first);
    root.userData.anchors = { light: { x: 0, y: 4.6, z: 0 }, boxes: [{ x: 0, z: 0, w: 2.0, d: 2.0, h: 4.9 }] };
    return root;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.circle(ctx, 0, 0, TC.PR + 0.2, tint(c.deck, 0.6), INK_SOFT, LINE_THIN);
      for (let t = 0; t < 3; t++) {
        const a = (t / 3) * TAU + Math.PI / 3;
        const tx = Math.sin(a) * TC.tableR;
        const tz = Math.cos(a) * TC.tableR;
        D.circle(ctx, tx, tz, TC.TR, tint(c.deck, 0.35), INK_SOFT, LINE_THIN);
        for (let j = 0; j < TC.perTable; j++) {
          const b = (j / TC.perTable) * TAU;
          D.circle(ctx, tx + Math.sin(b) * TC.cupOff, tz + Math.cos(b) * TC.cupOff, 0.85, tint(CUP_COLORS[t * 3 + j], 0.3), INK_SOFT, LINE_THIN);
        }
      }
      D.circle(ctx, 0, 0, 1.25, tint(c.teapot, 0.3), INK_SOFT, LINE_THIN);
    }),
};

/* ================================================================== bumper cars */

const BC = { w: 18, d: 12, roofY: 4.3, n: 6, r: 0.92, T: 28 };
const CAR_COLORS = ['#e0402f', '#2f7fd0', '#f2b824', '#3aa35b', '#c23bb0', '#f08a24'];

interface Car {
  x: number;
  z: number;
  h: number;
  vx: number;
  vz: number;
  tx: number;
  tz: number;
  retarget: number;
  back: number;
}

function arenaStatic(c: Colors): THREE.Object3D {
  const k = new Kit();
  const { w, d, roofY } = BC;
  const hw = w / 2;
  const hd = d / 2;
  // floor plate with a painted lane
  k.box(w - 0.1, 0.06, d - 0.1, M.metal('#5b6068', 0.55, 0.6), 0, 0, 0);
  k.box(w - 4, 0.004, 0.1, M.paint('#f2c21b', 0.6), 0, 0.06, 0);
  // rubber rim with a gap at the front for getting in
  const rub = M.rubber('#1f2023');
  const cap = M.paint(c.arena, 0.45);
  const rim = (x0: number, z0: number, x1: number, z1: number) => {
    const ww = Math.abs(x1 - x0) || 0.32;
    const dd = Math.abs(z1 - z0) || 0.32;
    k.rbox(ww, 0.5, dd, 0.08, rub, (x0 + x1) / 2, 0.06, (z0 + z1) / 2);
    k.box(ww, 0.06, dd, cap, (x0 + x1) / 2, 0.56, (z0 + z1) / 2);
  };
  rim(-hw + 0.16, -hd + 0.16, hw - 0.16, -hd + 0.16);
  rim(-hw + 0.16, -hd + 0.16, -hw + 0.16, hd - 0.16);
  rim(hw - 0.16, -hd + 0.16, hw - 0.16, hd - 0.16);
  rim(-hw + 0.16, hd - 0.16, -1.3, hd - 0.16);
  rim(1.3, hd - 0.16, hw - 0.16, hd - 0.16);
  // posts and the roof frame with its electric grid
  const steel = M.metal(c.roof, 0.4, 0.6);
  const posts: Array<[number, number]> = [];
  for (const x of [-hw + 0.3, -3, 3, hw - 0.3]) for (const z of [-hd + 0.3, hd - 0.3]) posts.push([x, z]);
  for (const [x, z] of posts) k.cyl(0.12, roofY, steel, x, 0.06, z, 0.12, 10);
  for (const z of [-hd + 0.3, hd - 0.3]) k.box(w - 0.4, 0.25, 0.2, steel, 0, roofY, z);
  for (const x of [-hw + 0.3, hw - 0.3]) k.box(0.2, 0.25, d - 0.4, steel, x, roofY, 0);
  const grid: THREE.BufferGeometry[] = [];
  for (let x = -hw + 1.3; x < hw - 0.5; x += 1.0) {
    const g = new THREE.BoxGeometry(0.03, 0.03, d - 0.6);
    g.translate(x, roofY + 0.1, 0);
    grid.push(g);
  }
  for (let z = -hd + 1.0; z < hd - 0.5; z += 1.0) {
    const g = new THREE.BoxGeometry(w - 0.6, 0.03, 0.03);
    g.translate(0, roofY + 0.1, z);
    grid.push(g);
  }
  const gm = new THREE.Mesh(mergeBoxes(grid), M.metal('#9aa0a6', 0.4, 0.8));
  gm.castShadow = false;
  k.g.add(gm);
  // striped fascia all around and the name board at the front
  const stripes = [M.paint(c.arena, 0.5), M.paint('#fbf6ea', 0.5)];
  const fasc = (len: number, x: number, z: number, along: 'x' | 'z') => {
    const n = Math.round(len / 1.0);
    for (let i = 0; i < n; i++) {
      const t = -len / 2 + (len * (i + 0.5)) / n;
      if (along === 'x') k.box(len / n, 0.6, 0.08, stripes[i % 2], x + t, roofY + 0.25, z);
      else k.box(0.08, 0.6, len / n, stripes[i % 2], x, roofY + 0.25, z + t);
    }
  };
  fasc(w - 0.2, 0, -hd + 0.2, 'x');
  fasc(w - 0.2, 0, hd - 0.2, 'x');
  fasc(d - 0.2, -hw + 0.2, 0, 'z');
  fasc(d - 0.2, hw - 0.2, 0, 'z');
  k.box(7.2, 0.62, 0.12, M.paint('#1d2a6b', 0.5), 0, roofY + 0.85, hd - 0.2);
  k.geo(new THREE.PlaneGeometry(7.0, 0.55), signMat('מכוניות מתנגשות', '#1d2a6b', '#ffe27a', { icon: '🚗', w: 1024, h: 80, border: '#f2c21b', glow: 0.7 }), 0, roofY + 1.16, hd - 0.135).castShadow = false;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 34; i++) {
    const x = -hw + 0.2 + ((w - 0.4) * i) / 34;
    pts.push(new THREE.Vector3(x, roofY + 0.02, hd - 0.12), new THREE.Vector3(x, roofY + 0.02, -hd + 0.12));
  }
  for (let i = 1; i < 22; i++) {
    const z = -hd + 0.2 + ((d - 0.4) * i) / 22;
    pts.push(new THREE.Vector3(hw - 0.12, roofY + 0.02, z), new THREE.Vector3(-hw + 0.12, roofY + 0.02, z));
  }
  for (const m of bulbStrip(pts, 0.08, BULB_COLORS, 3.2)) k.g.add(m);
  return k.g;
}

function mergeBoxes(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const parts = list.map((g) => g.toNonIndexed());
  let n = 0;
  for (const g of parts) n += g.getAttribute('position').count;
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  let o = 0;
  for (const g of parts) {
    pos.set(g.getAttribute('position').array as Float32Array, o * 3);
    nor.set(g.getAttribute('normal').array as Float32Array, o * 3);
    o += g.getAttribute('position').count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  return out;
}

/** a bumper car facing +Z (origin on the floor under its middle); TINT_GLOSS = its colour */
function bumperCar(): THREE.Object3D {
  const k = new Kit();
  const body = new THREE.ExtrudeGeometry(roundedRectShape(1.2, 1.75, 0.45), { depth: 0.42, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 2, curveSegments: 6 });
  body.rotateX(-Math.PI / 2);
  body.translate(0, 0.16, 0);
  k.geo(body, TINT_GLOSS);
  const bump = new THREE.Mesh(new THREE.TorusGeometry(1, 0.11, 8, 28), M.rubber('#202124'));
  bump.rotation.x = Math.PI / 2;
  bump.scale.set(0.7, 1.0, 1);
  bump.position.y = 0.2;
  bump.castShadow = true;
  k.g.add(bump);
  k.cyl(0.6, 0.06, M.metal('#3a3d42', 0.5, 0.6), 0, 0.03, 0, 0.6, 16);
  // seat, dashboard, steering wheel
  const seat = M.leather('#2b2d33');
  k.cushion(0.72, 0.12, 0.55, seat, 0, 0.46, -0.2, 0.04, 0.02);
  k.rbox(0.8, 0.55, 0.12, 0.05, seat, 0, 0.5, -0.55);
  k.rbox(0.9, 0.22, 0.35, 0.06, TINT_GLOSS, 0, 0.6, 0.55);
  k.rod([0, 0.62, 0.45], [0, 0.84, 0.3], 0.025, M.metal('#c9ccce', 0.3, 0.9), 0.025, 6);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.025, 6, 16), M.rubber('#111214'));
  wheel.position.set(0, 0.86, 0.29);
  wheel.rotation.x = -Math.PI / 2 + 0.6;
  k.g.add(wheel);
  // the pole to the ceiling grid
  const pole = M.metal('#c9ccce', 0.3, 0.9);
  k.cyl(0.03, BC.roofY - 0.62, pole, 0, 0.62, -0.72, 0.022, 6);
  k.rod([0, BC.roofY - 0.05, -0.72], [0, BC.roofY + 0.05, -0.9], 0.03, pole, 0.03, 5);
  k.geo(new THREE.PlaneGeometry(0.32, 0.22), M.cloth('#ffffff'), 0.17, 2.0, -0.72);
  k.sphere(0.05, M.glow('#fff1c6', 2.5), -0.38, 0.5, 0.86, 1, 1, 0.6, 8);
  k.sphere(0.05, M.glow('#fff1c6', 2.5), 0.38, 0.5, 0.86, 1, 1, 0.6, 8);
  return k.g;
}

class BumperRide extends RideBase {
  readonly kind = 'bumper' as const;
  label = 'מכוניות מתנגשות';
  icon = '🚗';
  thrill = 3;
  entrance = { x: 0, z: BC.d / 2 + 0.5, facing: Math.PI };
  readonly cars: Car[] = [];
  control = { throttle: 0, steer: 0, external: false };
  bumps = 0;
  private keySteer = 0;
  private keyGas = 0;
  private keysOn = false;
  private down = new Set<string>();
  private m = new THREE.Matrix4();
  private hum = 0;

  constructor(
    private nodes: THREE.Object3D[],
    private inst: Instanced,
    private root: THREE.Object3D,
  ) {
    super();
    for (let i = 0; i < BC.n; i++) {
      const x = -6 + i * 2.4;
      this.cars.push({ x, z: -3.6 + (i % 2) * 0.4, h: 0, vx: 0, vz: 0, tx: 0, tz: 0, retarget: 0, back: 0 });
    }
    this.loadTime = 1.2;
    this.place();
  }

  private onKey = (e: KeyboardEvent): void => {
    const down = e.type === 'keydown';
    if (down) this.down.add(e.code);
    else this.down.delete(e.code);
    const d = this.down;
    this.keySteer = (d.has('KeyA') || d.has('ArrowLeft') ? 1 : 0) - (d.has('KeyD') || d.has('ArrowRight') ? 1 : 0);
    this.keyGas = d.has('KeyW') || d.has('ArrowUp') ? 1 : 0;
  };

  private listen(on: boolean): void {
    if (on === this.keysOn || typeof window === 'undefined') return;
    this.keysOn = on;
    if (on) {
      window.addEventListener('keydown', this.onKey);
      window.addEventListener('keyup', this.onKey);
    } else {
      window.removeEventListener('keydown', this.onKey);
      window.removeEventListener('keyup', this.onKey);
      this.down.clear();
      this.keySteer = this.keyGas = 0;
    }
  }

  protected onStart(): void {
    this.bumps = 0;
    for (const c of this.cars) c.retarget = 0;
  }

  protected advance(h: number, push: number, riders: readonly number[]): boolean {
    this.listen(this.playerOn && !this.control.external);
    this.drive(h, push, riders, true);
    this.progress = clamp(this.t / BC.T, 0, 1);
    return this.t >= BC.T;
  }

  protected rest(h: number, push: number, riders: readonly number[]): void {
    this.listen(false);
    this.drive(h, 0, riders, false);
  }

  private drive(h: number, push: number, riders: readonly number[], power: boolean): void {
    const n = Math.max(1, Math.ceil(h / (1 / 90)));
    const dt = h / n;
    const player = riders.length ? riders[0] : -1;
    const hx = BC.w / 2 - 0.35 - BC.r;
    const hz = BC.d / 2 - 0.35 - BC.r;
    for (let s = 0; s < n; s++) {
      for (let i = 0; i < this.cars.length; i++) {
        const c = this.cars[i];
        let gas = 0;
        let steer = 0;
        if (power && i === player) {
          gas = this.control.external ? this.control.throttle : Math.max(this.keyGas, push > 0.9 ? 1 : 0);
          steer = this.control.external ? this.control.steer : this.keySteer;
        } else if (power && this.extraRiders.has(i)) {
          // a visitor at the wheel: roam, sometimes go for the player
          c.retarget -= dt;
          if (c.retarget <= 0) {
            c.retarget = 1.5 + ((i * 13 + Math.floor(this.t)) % 7) * 0.4;
            const p = player >= 0 && (i + Math.floor(this.t / 3)) % 3 === 0 ? this.cars[player] : null;
            c.tx = p ? p.x : (Math.random() * 2 - 1) * hx;
            c.tz = p ? p.z : (Math.random() * 2 - 1) * hz;
          }
          const want = Math.atan2(c.tx - c.x, c.tz - c.z);
          let diff = want - c.h;
          while (diff > Math.PI) diff -= TAU;
          while (diff < -Math.PI) diff += TAU;
          steer = clamp(diff * 1.5, -1, 1);
          gas = c.back > 0 ? -0.8 : 0.8;
          c.back -= dt;
          if (Math.hypot(c.vx, c.vz) < 0.25 && c.back < -1.5) c.back = 0.7;
        }
        const sp = Math.hypot(c.vx, c.vz);
        c.h += steer * 2.3 * dt * (0.45 + Math.min(1, sp / 2));
        const fx = Math.sin(c.h);
        const fz = Math.cos(c.h);
        c.vx += fx * gas * 3.4 * dt;
        c.vz += fz * gas * 3.4 * dt;
        // grip: sideways motion dies quickly, rolling drag slowly
        const fwd = c.vx * fx + c.vz * fz;
        let side = c.vx * fz - c.vz * fx;
        side *= Math.max(0, 1 - 3.5 * dt);
        const f2 = fwd * Math.max(0, 1 - (gas !== 0 ? 0.6 : 1.4) * dt);
        c.vx = fx * f2 + fz * side;
        c.vz = fz * f2 - fx * side;
        const v = Math.hypot(c.vx, c.vz);
        if (v > 4.6) {
          c.vx *= 4.6 / v;
          c.vz *= 4.6 / v;
        }
        c.x += c.vx * dt;
        c.z += c.vz * dt;
        // the rubber rim
        if (Math.abs(c.x) > hx) {
          c.x = Math.sign(c.x) * hx;
          if (Math.abs(c.vx) > 1 && (i === player || this.playerOn)) this.bumpFx(Math.abs(c.vx) / 4, i === player);
          c.vx *= -0.5;
        }
        if (Math.abs(c.z) > hz) {
          c.z = Math.sign(c.z) * hz;
          if (Math.abs(c.vz) > 1 && i === player) this.bumpFx(Math.abs(c.vz) / 4, true);
          c.vz *= -0.5;
        }
      }
      // car against car
      const R2 = BC.r * 2;
      for (let i = 0; i < this.cars.length; i++)
        for (let j = i + 1; j < this.cars.length; j++) {
          const a = this.cars[i];
          const b = this.cars[j];
          const dx = b.x - a.x;
          const dz = b.z - a.z;
          const dist = Math.hypot(dx, dz);
          if (dist >= R2 || dist < 1e-6) continue;
          const nx = dx / dist;
          const nz = dz / dist;
          const over = (R2 - dist) / 2;
          a.x -= nx * over;
          a.z -= nz * over;
          b.x += nx * over;
          b.z += nz * over;
          const vr = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
          if (vr <= 0) continue;
          const imp = (1.75 * vr) / 2;
          a.vx -= imp * nx;
          a.vz -= imp * nz;
          b.vx += imp * nx;
          b.vz += imp * nz;
          a.h += (Math.random() - 0.5) * 0.3 * vr;
          b.h += (Math.random() - 0.5) * 0.3 * vr;
          if (vr > 0.9) {
            const mine = i === player || j === player;
            if (mine) {
              // who hit whom: the player's car moving into the other one
              const p = i === player ? a : b;
              const into = (i === player ? 1 : -1) * ((p.vx + imp * (i === player ? nx : -nx)) * nx + (p.vz + imp * (i === player ? nz : -nz)) * nz);
              if (into > -0.2 || vr > 1.6) {
                this.bumps++;
                this.emit('bump');
              }
            }
            this.bumpFx(vr / 4, mine);
          }
        }
    }
    let ps = 0;
    if (player >= 0) ps = Math.hypot(this.cars[player].vx, this.cars[player].vz);
    this.speed = ps;
    this.rush = clamp(ps / 4.6, 0, 1);
    if (this.playerOn) {
      this.hum -= h;
      if (power && this.hum <= 0) {
        this.hum = 0.5;
        rideSound.hum();
      }
    }
    this.place();
  }

  private bumpFx(strength: number, mine: boolean): void {
    if (this.playerOn && mine) rideSound.bump(clamp(0.4 + strength, 0.4, 1));
  }

  private place(): void {
    for (let i = 0; i < this.cars.length; i++) {
      const c = this.cars[i];
      const node = this.nodes[i];
      node.position.set(c.x, 0.06, c.z);
      node.rotation.y = c.h;
      this.inst.set(i, relMatrix(node, this.root, this.m));
    }
    this.inst.commit();
  }
}

export const bumperCars: FurnitureDef = {
  id: 'amuse-bumper-cars',
  name: 'מכוניות מתנגשות',
  category: 'playground',
  group: 'לונה פארק',
  tags: ['לונה פארק', 'מכוניות', 'מתנגשות', 'זירה', 'מתקן', 'אוטו'],
  size: { w: BC.w, d: BC.d, h: BC.roofY + 1.5 },
  resize: false,
  parametric: true,
  noBake: true,
  colors: [slot('arena', 'זירה', '#e0402f'), slot('roof', 'מבנה', '#2f3b52')],
  light: { x: 0, y: BC.roofY - 0.2, z: 0, color: '#ffe2b0', intensity: 110, distance: 20 },
  actions: [{ kind: 'light' }],
  ride: { kind: 'spin', prompt: 'לנהוג במכונית מתנגשת' },
  build: ({ colors: c }) => {
    const root = new THREE.Group();
    const stat = bakedPart(partKey('bumper-arena', c, ['arena', 'roof']), () => arenaStatic(c));
    root.add(stat);
    const nodes: THREE.Object3D[] = [];
    const seatNodes: THREE.Object3D[] = [];
    for (let i = 0; i < BC.n; i++) {
      const n = new THREE.Object3D();
      root.add(n);
      nodes.push(n);
      seatNodes.push(seatNode(n, 0, 0.55, -0.22, 0));
    }
    const inst = new Instanced(bakedPart('bumper-car', bumperCar), BC.n, CAR_COLORS);
    root.add(inst.group);
    const rt = new BumperRide(nodes, inst, root);
    rt.setSeats(seatNodes);
    root.userData.ride = rt;
    root.userData.amuse = rt;
    const hw = BC.w / 2;
    const hd = BC.d / 2;
    root.userData.anchors = {
      light: { x: 0, y: BC.roofY - 0.2, z: 0 },
      boxes: [
        { x: 0, z: -hd + 0.16, w: BC.w, d: 0.32, h: 0.62 },
        { x: -hw + 0.16, z: 0, w: 0.32, d: BC.d, h: 0.62 },
        { x: hw - 0.16, z: 0, w: 0.32, d: BC.d, h: 0.62 },
        { x: (-hw - 1.3) / 2, z: hd - 0.16, w: hw - 1.3, d: 0.32, h: 0.62 },
        { x: (hw + 1.3) / 2, z: hd - 0.16, w: hw - 1.3, d: 0.32, h: 0.62 },
      ],
    };
    return root;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const hw = BC.w / 2;
      const hd = BC.d / 2;
      D.box(ctx, -hw, -hd, hw, hd, 0.1, tint('#5b6068', 0.6), INK_SOFT, LINE_THIN);
      D.box(ctx, -hw + 0.32, -hd + 0.32, hw - 0.32, hd - 0.32, 0.1, null, tint(c.arena, 0.1), 0.06);
      for (let i = 0; i < BC.n; i++) {
        const x = -6 + i * 2.4;
        D.ellipse(ctx, x, -3.6 + (i % 2) * 0.4, 0.68, 0.98, tint(CAR_COLORS[i], 0.3), INK_SOFT, LINE_THIN);
      }
      D.line(ctx, -1.3, hd - 0.16, 1.3, hd - 0.16, '#ffffff', 0.1);
    }),
};
