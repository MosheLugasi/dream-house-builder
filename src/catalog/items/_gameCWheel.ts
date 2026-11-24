/**
 * Team C – Ferris wheel (גלגל ענק) and drop tower (מגדל נפילה).
 */
import * as THREE from 'three';
import { D, INK_SOFT, Kit, LINE_THIN, M, darken, lighten, sym, tint } from '../kit';
import type { FurnitureDef } from '../types';
import { slot } from './_parts';
import { bakedPart, partKey, seatNode } from './_ride';
import { rideSound } from './_gameCAudio';
import { BULB_COLORS, Instanced, RideBase, TINT_GLOSS as TINT, bulbStrip, clamp, idleTicker, relMatrix, signMat, smooth } from './_gameCKit';

type Colors = Record<string, string>;
const TAU = Math.PI * 2;

/* ================================================================== Ferris wheel */

const FW = { R: 9, hubY: 11.3, n: 12, rimZ: 1.0, drop: 2.05, legX: 5.4, legZ: 3.5, frameZ: 1.75 };

/** the static part: A-frames, axle bearings, boarding deck, ticket stand */
function wheelBase(c: Colors): THREE.Object3D {
  const k = new Kit();
  const frame = M.metal(c.frame, 0.4, 0.6);
  const conc = M.stone('#a9a59d', 0.85);
  const { hubY, legX, legZ, frameZ } = FW;
  for (const sz of [-1, 1]) {
    for (const sx of [-1, 1]) {
      k.rod([sx * legX, 0.25, sz * legZ], [sx * 0.25, hubY, sz * frameZ], 0.2, frame, 0.15, 12);
      k.box(1.0, 0.25, 1.0, conc, sx * legX, 0, sz * legZ);
    }
    // cross braces between the legs of one frame
    for (const y of [3.2, 7.2]) {
      const f = y / hubY;
      const x = legX + (0.25 - legX) * f;
      const z = legZ + (frameZ - legZ) * f;
      k.rod([-x, y, sz * z], [x, y, sz * z], 0.09, frame, 0.09, 8);
    }
    k.rod([-legX * 0.62, 4.3, sz * (legZ + (frameZ - legZ) * 0.38)], [legX * 0.3, 7.9, sz * (legZ + (frameZ - legZ) * 0.7)], 0.06, frame, 0.06, 8);
    // bearing block
    k.box(0.7, 0.9, 0.5, M.metal('#3a3d42', 0.5, 0.8), 0, hubY - 0.45, sz * frameZ);
  }
  // the fixed axle
  const ax = k.cyl(0.22, frameZ * 2 + 0.5, M.metal('#8d9399', 0.35, 0.9), 0, hubY, 0, 0.22, 16);
  ax.rotation.x = Math.PI / 2;
  ax.position.set(0, hubY, 0);
  // boarding deck with steps and a rail
  const deck = M.wood('#8a6a4c', 0.7);
  k.box(4.2, 0.12, 2.4, deck, 0, 0, 2.1);
  k.box(4.2, 0.06, 0.4, deck, 0, 0, 3.5);
  const rail = M.metal('#c9ccce', 0.35, 0.9);
  for (const sx of [-1, 1]) {
    for (const z of [1.0, 2.0, 3.2]) k.cyl(0.025, 1.0, rail, sx * 2.05, 0.12, z, 0.025, 6);
    k.rod([sx * 2.05, 1.12, 1.0], [sx * 2.05, 1.12, 3.2], 0.022, rail, 0.022, 6);
  }
  // operator booth beside the deck
  k.rbox(1.0, 2.1, 0.9, 0.05, M.paint(c.rim, 0.5), 3.0, 0, 2.6);
  k.box(0.8, 0.6, 0.02, M.glass('#cfe6ee', 0.35), 3.0, 1.15, 3.06);
  k.box(1.2, 0.12, 1.1, M.paint('#f4f1ea', 0.5), 3.0, 2.1, 2.6);
  return k.g;
}

/** the turning part: two rims, spokes, the hub, gondola axles and the bulbs (origin = hub centre) */
function wheelRotor(c: Colors): THREE.Object3D {
  const k = new Kit();
  const { R, n, rimZ } = FW;
  const white = M.metal(c.frame, 0.4, 0.6);
  const red = M.metal(c.rim, 0.35, 0.5);
  for (const z of [-rimZ, rimZ]) {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.11, 8, 72), red);
    rim.position.z = z;
    rim.castShadow = true;
    k.g.add(rim);
    const inner = new THREE.Mesh(new THREE.TorusGeometry(R * 0.55, 0.06, 6, 48), white);
    inner.position.z = z;
    k.g.add(inner);
  }
  const bulbs: THREE.Vector3[] = [];
  const spokes = 24;
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * TAU;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    for (const z of [-rimZ, rimZ]) {
      k.rod([ca * 0.55, sa * 0.55, z * 0.55], [ca * R, sa * R, z], 0.045, white, 0.035, 6);
      for (let j = 1; j <= 7; j++) {
        const f = 0.12 + (j / 7) * 0.86;
        bulbs.push(new THREE.Vector3(ca * R * f, sa * R * f, z * (0.55 + 0.45 * f) + (z > 0 ? 0.06 : -0.06)));
      }
    }
    // zig-zag truss between the rims
    const b = ((i + 0.5) / spokes) * TAU;
    k.rod([ca * R, sa * R, -rimZ], [Math.cos(b) * R, Math.sin(b) * R, rimZ], 0.04, white, 0.04, 5);
  }
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * TAU;
    for (const z of [-rimZ, rimZ]) bulbs.push(new THREE.Vector3(Math.cos(a) * (R + 0.16), Math.sin(a) * (R + 0.16), z));
  }
  // gondola axles
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const g = k.cyl(0.07, rimZ * 2 + 0.2, M.metal('#8d9399', 0.35, 0.9), 0, 0, 0, 0.07, 8);
    g.rotation.x = Math.PI / 2;
    g.position.set(Math.cos(a) * R, Math.sin(a) * R, 0);
  }
  // the hub: a drum with a star
  const hub = k.cyl(0.75, 1.5, red, 0, 0, 0, 0.75, 24);
  hub.rotation.x = Math.PI / 2;
  hub.position.set(0, 0, 0);
  for (const z of [-0.78, 0.78]) {
    const star = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU + Math.PI / 2;
      const r = i % 2 ? 0.36 : 0.85;
      if (i === 0) star.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else star.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const sg = new THREE.ExtrudeGeometry(star, { depth: 0.05, bevelEnabled: false });
    if (z < 0) {
      sg.rotateY(Math.PI);
      sg.translate(0, 0, -0.78);
    } else sg.translate(0, 0, 0.78);
    k.geo(sg, M.glow('#ffd36a', 2.6, '#ffe9a8'));
  }
  for (const m of bulbStrip(bulbs, 0.075, BULB_COLORS, 3.0)) k.g.add(m);
  return k.g;
}

/** one gondola, its origin at the pivot (the axle), hanging down; riders face +Z */
function gondola(): THREE.Object3D {
  const k = new Kit();
  const shell = M.paint('#ffffff', 0.35);
  const { drop } = FW;
  const fy = -drop; // floor
  // the tub
  k.rbox(1.5, 0.08, 1.25, 0.03, M.metal('#5b6068', 0.5, 0.6), 0, fy, 0);
  k.rbox(1.5, 0.82, 0.06, 0.03, shell, 0, fy + 0.06, -0.6);
  k.rbox(1.5, 0.62, 0.06, 0.03, shell, 0, fy + 0.06, 0.6);
  for (const s of [-1, 1]) k.rbox(0.06, 0.72, 1.25, 0.03, shell, s * 0.72, fy + 0.06, 0);
  // bench and backrest
  k.cushion(1.3, 0.1, 0.42, M.leather('#7a3b2a'), 0, fy + 0.34, -0.33, 0.03, 0.01);
  k.box(1.3, 0.3, 0.42, M.metal('#5b6068', 0.5, 0.6), 0, fy + 0.06, -0.33);
  // hangers and the canopy
  const rod = M.metal('#c9ccce', 0.35, 0.9);
  for (const s of [-1, 1]) {
    k.rod([s * 0.72, fy + 0.7, 0], [s * 0.12, -0.05, 0], 0.03, rod, 0.03, 6);
  }
  k.rod([-0.12, -0.05, 0], [0.12, -0.05, 0], 0.05, rod, 0.05, 6);
  const canopy = k.cyl(1.0, 0.36, M.paint('#fbf6ea', 0.5), 0, fy + 1.55, 0, 0.12, 8);
  canopy.scale.set(1, 1, 0.82);
  k.cyl(0.95, 0.05, M.paint('#f2c21b', 0.5), 0, fy + 1.52, 0, 0.95, 8).scale.set(1, 1, 0.82);
  for (const s of [-1, 1]) for (const z of [-0.55, 0.55]) k.cyl(0.02, 0.86, rod, s * 0.68, fy + 0.68, z, 0.02, 5);
  return k.g;
}

/** the painted parts of a gondola get the instance colours */
function gondolaTinted(): THREE.Object3D {
  const g = gondola();
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && (m.material as THREE.MeshStandardMaterial).color?.getHexString() === 'ffffff') m.material = TINT;
  });
  return g;
}


class FerrisRide extends RideBase {
  readonly kind = 'ferris' as const;
  label = 'גלגל ענק';
  icon = '🎡';
  thrill = 2;
  entrance = { x: 0, z: 3.95, facing: Math.PI };
  phi = 0;
  omega = 0;
  private target = 0;
  private sway: number[];
  private swayV: number[];
  private m = new THREE.Matrix4();

  constructor(
    private rotor: THREE.Object3D,
    private pods: THREE.Object3D[],
    private inst: Instanced,
    private root: THREE.Object3D,
  ) {
    super();
    this.sway = pods.map(() => 0);
    this.swayV = pods.map(() => 0);
    this.loadTime = 1.4;
    this.place(0);
  }

  protected onStart(): void {
    // one full turn: the riders come back to where they got on
    this.target = this.phi + TAU;
  }

  protected advance(h: number): boolean {
    const left = this.target - this.phi;
    const want = Math.min(0.34, Math.sqrt(2 * 0.1 * Math.max(0, left)));
    const acc = (want - this.omega) / Math.max(h, 1e-3);
    this.omega += clamp(acc, -0.12, 0.12) * h;
    this.phi += this.omega * h;
    this.progress = clamp(1 - left / TAU, 0, 1);
    this.speed = this.omega * FW.R;
    this.place(h);
    if (this.playerOn && Math.random() < h * 0.08) rideSound.squeak();
    if (left < 0.002) {
      this.phi = this.target;
      this.omega = 0;
      return true;
    }
    return false;
  }

  protected rest(h: number): void {
    // turning slowly while people get on and off (it never quite stops); loading: stop gently
    const want = this.state === 'idle' ? 0.06 : 0;
    this.omega += clamp(want - this.omega, -0.05 * h, 0.05 * h);
    this.phi += this.omega * h;
    this.place(h);
  }

  /** height (local y) of a seat's gondola floor: 0 at the bottom */
  seatAngle(i: number): number {
    return this.phi + (Math.floor(i / 2) / FW.n) * TAU;
  }

  private place(h: number): void {
    this.rotor.rotation.z = this.phi;
    const n = this.pods.length;
    for (let i = 0; i < n; i++) {
      const a = this.phi + (i / n) * TAU - Math.PI / 2;
      // a lazy pendulum: the gondolas lag a little when the wheel speeds up or slows down
      if (h > 0) {
        const aT = 0;
        this.swayV[i] += (-6 * this.sway[i] - 1.2 * this.swayV[i] - aT) * h;
        this.sway[i] += this.swayV[i] * h;
      }
      const p = this.pods[i];
      p.position.set(Math.cos(a) * FW.R, FW.hubY + Math.sin(a) * FW.R, 0);
      p.rotation.z = this.sway[i] + this.omega * 0.12;
      this.inst.set(i, relMatrix(p, this.root, this.m));
    }
    this.inst.commit();
  }
}

export const ferrisWheel: FurnitureDef = {
  id: 'amuse-ferris-wheel',
  name: 'גלגל ענק',
  category: 'playground',
  group: 'לונה פארק',
  tags: ['לונה פארק', 'גלגל', 'תצפית', 'מתקן'],
  size: { w: 2 * FW.R + 2.1, d: 8, h: FW.hubY + FW.R + 0.45 },
  resize: false,
  parametric: true,
  noBake: true,
  colors: [slot('frame', 'מבנה', '#f1eee6'), slot('rim', 'חישוק', '#d8342c'), slot('pods', 'קרונות', '#2f7fd0'), slot('pods2', 'קרונות נוספים', '#f2b824')],
  light: { x: 0, y: FW.hubY, z: 1.4, color: '#ffd9a0', intensity: 140, distance: 30 },
  actions: [{ kind: 'light' }],
  ride: { kind: 'spin', prompt: 'לעלות לגלגל הענק' },
  build: ({ colors: c }) => {
    const root = new THREE.Group();
    root.add(bakedPart(partKey('ferris-base', c, ['frame', 'rim']), () => wheelBase(c)));
    const rotor = new THREE.Group();
    rotor.position.y = FW.hubY;
    rotor.add(bakedPart(partKey('ferris-rotor', c, ['frame', 'rim']), () => wheelRotor(c)));
    root.add(rotor);
    const pods: THREE.Object3D[] = [];
    const seatNodes: THREE.Object3D[] = [];
    for (let i = 0; i < FW.n; i++) {
      const p = new THREE.Object3D();
      root.add(p);
      pods.push(p);
      for (const x of [-0.36, 0.36]) seatNodes.push(seatNode(p, x, -FW.drop + 0.48, -0.3, 0));
    }
    const inst = new Instanced(bakedPart('ferris-gondola', gondolaTinted), FW.n, [c.pods, c.pods2]);
    root.add(inst.group);
    const rt = new FerrisRide(rotor, pods, inst, root);
    rt.setSeats(seatNodes);
    root.userData.ride = rt;
    root.userData.amuse = rt;
    idleTicker(rt, rotor.children[0]?.children[0] ?? rotor);
    root.userData.anchors = {
      light: { x: 0, y: FW.hubY, z: 1.4 },
      boxes: [
        ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => ({ x: sx * FW.legX, z: sz * FW.legZ, w: 1.0, d: 1.0, h: 3 }))),
        { x: 3.0, z: 2.6, w: 1.1, d: 1.0, h: 2.2 },
      ],
    };
    return root;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { R, legX, legZ, frameZ, rimZ } = FW;
      for (const sz of [-1, 1]) for (const sx of [-1, 1]) D.line(ctx, sx * legX, sz * legZ, sx * 0.25, sz * frameZ, tint(c.frame, 0.1), 0.2);
      D.box(ctx, -2.1, 0.9, 2.1, 3.7, 0.05, tint('#8a6a4c', 0.5), INK_SOFT, LINE_THIN);
      D.box(ctx, -R - 0.15, -rimZ - 0.1, R + 0.15, rimZ + 0.1, 0.1, tint(c.rim, 0.55), undefined, LINE_THIN);
      for (let i = 0; i < FW.n; i++) {
        const x = Math.cos((i / FW.n) * TAU) * R;
        D.box(ctx, x - 0.75, -0.62, x + 0.75, 0.62, 0.1, tint(i % 2 ? c.pods2 : c.pods, 0.3), INK_SOFT, LINE_THIN);
      }
      D.circle(ctx, 0, 0, 0.75, tint(c.rim, 0.2), undefined, LINE_THIN);
      D.box(ctx, 2.5, 2.15, 3.5, 3.05, 0.05, tint(c.rim, 0.4), undefined, LINE_THIN);
    }),
};

/* ================================================================== drop tower */

const DT = { H: 32, w: 7, core: 1.5, ring: 2.05, seats: 12, y0: 0.62, top: 26.5, brakeY: 8.5 };

function towerStatic(c: Colors): THREE.Object3D {
  const k = new Kit();
  const { H, core } = DT;
  const steel = M.metal(c.tower, 0.4, 0.6);
  const h = core / 2;
  // base plinth and the fenced platform
  k.rbox(DT.w - 0.4, 0.14, DT.w - 0.4, 0.05, M.stone('#b5b0a6', 0.8), 0, 0, 0);
  k.box(2.4, 0.5, 2.4, M.metal('#3a3d42', 0.5, 0.7), 0, 0.14, 0);
  // four corner posts
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl(0.1, H - 2.4, steel, sx * h, 0.6, sz * h, 0.1, 8);
  // lattice: rings + diagonals every 2 m
  for (let y = 1.0; y < H - 2.4; y += 2) {
    for (let s = 0; s < 4; s++) {
      const a = [
        [-h, -h],
        [h, -h],
        [h, h],
        [-h, h],
      ][s];
      const b = [
        [h, -h],
        [h, h],
        [-h, h],
        [-h, -h],
      ][s];
      k.rod([a[0], y, a[1]], [b[0], y, b[1]], 0.04, steel, 0.04, 5);
      if (y + 2 < H - 2.4) k.rod([a[0], y, a[1]], [b[0], y + 2, b[1]], 0.035, steel, 0.035, 5);
    }
  }
  // the guide rails the carriage runs on
  for (const [x, z] of [
    [0, h + 0.06],
    [0, -h - 0.06],
    [h + 0.06, 0],
    [-h - 0.06, 0],
  ] as Array<[number, number]>)
    k.box(0.14, H - 3.0, 0.14, M.metal('#c9ccce', 0.3, 0.9), x, 0.6, z);
  // the crown: machine house + lit sign band + spire
  const crownY = H - 2.4;
  k.rbox(2.4, 1.2, 2.4, 0.08, M.paint(c.crown, 0.4), 0, crownY, 0);
  for (let s = 0; s < 4; s++) {
    const a = (s / 4) * TAU;
    const p = k.geo(new THREE.PlaneGeometry(2.2, 0.75), signMat('מגדל הנפילה', '#16205c', '#ffe27a', { w: 768, h: 256, glow: 0.7, border: '#f2c21b' }), Math.sin(a) * 1.215, crownY + 0.6, Math.cos(a) * 1.215);
    p.rotation.y = a;
    p.castShadow = false;
  }
  k.cyl(1.25, 0.12, M.paint(c.tower, 0.4), 0, crownY + 1.2, 0, 1.3, 16);
  k.cyl(0.08, 0.9, steel, 0, crownY + 1.32, 0, 0.03, 8);
  k.sphere(0.16, M.glow('#ff3a2a', 3.5, '#ff8a7a'), 0, crownY + 2.25, 0, 1, 1, 1, 10);
  // vertical light strips on the corners and around the crown
  const pts: THREE.Vector3[] = [];
  for (let y = 1.2; y < crownY - 0.2; y += 0.9) for (const sx of [-1, 1]) for (const sz of [-1, 1]) pts.push(new THREE.Vector3(sx * (h + 0.12), y, sz * (h + 0.12)));
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * TAU;
    pts.push(new THREE.Vector3(Math.cos(a) * 1.32, crownY + 1.26, Math.sin(a) * 1.32));
  }
  for (const m of bulbStrip(pts, 0.085, ['#ff6a5a', '#ffd36a', '#7fd6ff'], 3.2)) k.g.add(m);
  // fence around the platform with an opening at the front
  const rail = M.metal('#c9ccce', 0.35, 0.9);
  const e = DT.w / 2 - 0.35;
  const posts: Array<[number, number]> = [];
  for (let i = 0; i <= 6; i++) {
    const t = -e + (2 * e * i) / 6;
    posts.push([t, -e], [-e, t], [e, t]);
    if (Math.abs(t) > 0.9) posts.push([t, e]);
  }
  for (const [x, z] of posts) k.cyl(0.03, 1.0, rail, x, 0.14, z, 0.03, 6);
  k.rod([-e, 1.12, -e], [e, 1.12, -e], 0.025, rail, 0.025, 6);
  k.rod([-e, 1.12, -e], [-e, 1.12, e], 0.025, rail, 0.025, 6);
  k.rod([e, 1.12, -e], [e, 1.12, e], 0.025, rail, 0.025, 6);
  k.rod([-e, 1.12, e], [-0.9, 1.12, e], 0.025, rail, 0.025, 6);
  k.rod([0.9, 1.12, e], [e, 1.12, e], 0.025, rail, 0.025, 6);
  return k.g;
}

/** the carriage ring with 12 outward-facing seats (origin = seat height level, on the axis) */
function towerCarriage(c: Colors): THREE.Object3D {
  const k = new Kit();
  const { ring, seats, core } = DT;
  const frame = M.paint(c.carriage, 0.35);
  const dark = M.metal('#2f3236', 0.5, 0.6);
  // collar around the tower
  const col = new THREE.Mesh(new THREE.CylinderGeometry(ring - 0.45, ring - 0.45, 0.55, 12, 1, true), frame);
  col.position.y = 0.05;
  k.g.add(col);
  k.ring(ring - 0.45, 0.06, M.metal('#c9ccce', 0.3, 0.9), 0, 0.33, 0, 24);
  k.cyl(core / 2 + 0.5, 0.08, dark, 0, -0.23, 0, core / 2 + 0.5, 12);
  for (let i = 0; i < seats; i++) {
    const a = (i / seats) * TAU + TAU / seats / 2;
    const s = new Kit();
    // bucket seat facing +Z (outwards), shoulder harness, foot rest
    s.rbox(0.5, 0.08, 0.46, 0.03, M.leather('#2b2d33'), 0, -0.06, 0.05);
    s.rbox(0.52, 0.85, 0.1, 0.04, frame, 0, -0.08, -0.2);
    s.rbox(0.5, 0.18, 0.42, 0.04, frame, 0, -0.24, 0.05);
    const yellow = M.paint('#f2c21b', 0.35);
    for (const x of [-0.17, 0.17]) s.rod([x, 0.78, -0.12], [x, 0.3, 0.18], 0.04, yellow, 0.04, 6);
    s.rod([-0.17, 0.3, 0.18], [0.17, 0.3, 0.18], 0.05, yellow, 0.05, 6);
    s.box(0.36, 0.04, 0.2, dark, 0, -0.62, 0.42);
    s.rod([0, -0.24, 0.2], [0, -0.6, 0.42], 0.03, dark, 0.03, 5);
    const g = k.sub(s, Math.sin(a) * ring, 0, Math.cos(a) * ring);
    g.rotation.y = a;
  }
  return k.g;
}

class DropRide extends RideBase {
  readonly kind = 'drop' as const;
  label = 'מגדל הנפילה';
  icon = '🗼';
  thrill = 4;
  entrance = { x: 0, z: DT.w / 2 + 0.3, facing: Math.PI };
  y = DT.y0;
  v = 0;
  private phase: 'rise' | 'hold' | 'fall' | 'brake' | 'lower' = 'rise';
  private pt = 0;
  private hold = 3;
  private beat = 0;

  constructor(private carriage: THREE.Object3D) {
    super();
    this.loadTime = 1.8;
    this.carriage.position.y = this.y;
  }

  protected onStart(): void {
    this.phase = 'rise';
    this.pt = 0;
    this.hold = 2 + Math.random() * 2.2;
    this.v = 0;
  }

  protected advance(h: number): boolean {
    this.pt += h;
    const { y0, top, brakeY } = DT;
    let done = false;
    switch (this.phase) {
      case 'rise': {
        const T = 9;
        const k = smooth(this.pt / T);
        const ny = y0 + (top - y0) * k;
        this.v = (ny - this.y) / Math.max(h, 1e-3);
        this.y = ny;
        this.rush = 0.15 + 0.35 * k;
        if (this.playerOn) rideSound.chain(h * 0.35, 1);
        if (this.pt >= T) {
          this.phase = 'hold';
          this.pt = 0;
          this.emit('top');
        }
        break;
      }
      case 'hold':
        this.v = 0;
        this.rush = 0.6;
        this.beat -= h;
        if (this.playerOn && this.beat <= 0) {
          this.beat = 0.75;
          rideSound.heartbeat();
        }
        if (this.pt >= this.hold) {
          this.phase = 'fall';
          this.pt = 0;
        }
        break;
      case 'fall':
        this.v -= 9.81 * h;
        this.y += this.v * h;
        this.rush = 1;
        if (this.y <= brakeY) {
          this.phase = 'brake';
          this.pt = 0;
          if (this.playerOn) rideSound.brake();
        }
        break;
      case 'brake':
        // magnetic brakes: about 2.5 g
        this.v = Math.min(-1.2, this.v + 24 * h);
        this.y += this.v * h;
        this.rush = 0.5;
        if (this.v >= -1.21 || this.y < y0 + 1.5) {
          this.phase = 'lower';
          this.pt = 0;
        }
        break;
      case 'lower': {
        const left = this.y - y0;
        this.v = -Math.min(1.2, Math.max(0.05, left * 0.9));
        this.y += this.v * h;
        this.rush = 0.1;
        if (left < 0.01) {
          this.y = y0;
          this.v = 0;
          done = true;
        }
        break;
      }
    }
    this.drop = this.phase === 'fall';
    this.speed = Math.abs(this.v);
    this.progress = this.phase === 'rise' ? 0.4 * smooth(this.pt / 9) : this.phase === 'hold' ? 0.45 : this.phase === 'lower' ? 0.9 : 0.6;
    this.carriage.position.y = this.y;
    return done;
  }

  protected rest(): void {
    this.carriage.position.y = this.y;
  }
}

export const dropTower: FurnitureDef = {
  id: 'amuse-drop-tower',
  name: 'מגדל נפילה',
  category: 'playground',
  group: 'לונה פארק',
  tags: ['לונה פארק', 'נפילה חופשית', 'מגדל', 'אקסטרים', 'מתקן'],
  size: { w: DT.w, d: DT.w, h: DT.H + 0.15 },
  resize: false,
  parametric: true,
  noBake: true,
  colors: [slot('tower', 'מגדל', '#e9e6de'), slot('crown', 'כתר', '#2f5fbf'), slot('carriage', 'מושבים', '#e0402f')],
  light: { x: 0, y: DT.H - 1.2, z: 0, color: '#ffd9a0', intensity: 120, distance: 32 },
  actions: [{ kind: 'light' }],
  ride: { kind: 'spin', prompt: 'לעלות למגדל הנפילה' },
  build: ({ colors: c }) => {
    const root = new THREE.Group();
    const base = bakedPart(partKey('drop-tower', c, ['tower', 'crown']), () => towerStatic(c));
    root.add(base);
    const carriage = new THREE.Group();
    carriage.add(bakedPart(partKey('drop-carriage', c, ['carriage']), () => towerCarriage(c)));
    root.add(carriage);
    const seatNodes: THREE.Object3D[] = [];
    for (let i = 0; i < DT.seats; i++) {
      const a = (i / DT.seats) * TAU + TAU / DT.seats / 2;
      seatNodes.push(seatNode(carriage, Math.sin(a) * (DT.ring + 0.05), 0.0, Math.cos(a) * (DT.ring + 0.05), a));
    }
    const rt = new DropRide(carriage);
    rt.setSeats(seatNodes);
    root.userData.ride = rt;
    root.userData.amuse = rt;
    root.userData.anchors = {
      light: { x: 0, y: DT.H - 1.2, z: 0 },
      boxes: [
        { x: 0, z: 0, w: 2.4, d: 2.4, h: DT.H },
        { x: 0, z: -DT.w / 2 + 0.35, w: DT.w - 0.6, d: 0.15, h: 1.1 },
        { x: -DT.w / 2 + 0.35, z: 0, w: 0.15, d: DT.w - 0.6, h: 1.1 },
        { x: DT.w / 2 - 0.35, z: 0, w: 0.15, d: DT.w - 0.6, h: 1.1 },
      ],
    };
    return root;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const e = DT.w / 2 - 0.2;
      D.box(ctx, -e, -e, e, e, 0.1, tint('#b5b0a6', 0.5), INK_SOFT, LINE_THIN);
      for (let i = 0; i < DT.seats; i++) {
        const a = (i / DT.seats) * TAU + TAU / DT.seats / 2;
        D.circle(ctx, Math.sin(a) * DT.ring, Math.cos(a) * DT.ring, 0.26, tint(c.carriage, 0.3), INK_SOFT, LINE_THIN);
      }
      D.circle(ctx, 0, 0, DT.ring - 0.4, tint(c.carriage, 0.5), undefined, LINE_THIN);
      D.box(ctx, -DT.core / 2, -DT.core / 2, DT.core / 2, DT.core / 2, 0, tint(c.tower, 0.1), undefined, LINE_THIN);
      D.line(ctx, -DT.core / 2, -DT.core / 2, DT.core / 2, DT.core / 2, darken(c.tower, 0.3), LINE_THIN);
      D.line(ctx, -DT.core / 2, DT.core / 2, DT.core / 2, -DT.core / 2, darken(c.tower, 0.3), LINE_THIN);
      void lighten;
    }),
};
