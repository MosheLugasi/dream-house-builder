/**
 * Team C – roller coasters (רכבות הרים): three track layouts, each a PARAMETRIC catalog item (the
 * player stretches the whole circuit with the size), a station with a lit roof, and a train that runs
 * the circuit with gravity-like speed. Riders sit in the cars (`RideRuntime.seatNodes`).
 */
import * as THREE from 'three';
import { D, Kit, LINE_THIN, M, darken, lighten, sym, tint } from '../kit';
import type { FurnitureDef, ItemAnchors, ItemSize } from '../types';
import { slot } from './_parts';
import { bakedPart, partKey, seatNode } from './_ride';
import { BULB_COLORS, RideBase, bulbStrip, clamp, idleTicker, mergeSimple, signMat } from './_gameCKit';
import { rideSound } from './_gameCAudio';
import { LAYOUT_FAMILY, LAYOUT_HELIX, LAYOUT_LOOP, Track, TrainPhysics, trackFor, type TrackLayout } from './_gameCTrack';

type Colors = Record<string, string>;

const GAUGE = 1.0;
const SPINE_Y = -0.42;
const CAR_SPACING = 2.55;
const ROOF_H = 3.4;

const trackCache = new Map<string, Track>();
function trackAt(layout: TrackLayout, size: ItemSize): Track {
  const key = `${layout.id}|${size.w.toFixed(2)}|${size.d.toFixed(2)}|${size.h.toFixed(2)}`;
  let t = trackCache.get(key);
  if (!t) {
    t = trackFor(layout, size);
    if (trackCache.size > 24) trackCache.delete(trackCache.keys().next().value!);
    trackCache.set(key, t);
  }
  return t;
}

/* ------------------------------------------------------------------ station geometry */

interface Station {
  /** centre of the platform on the ground, direction of travel and the outward side (towards the front) */
  x: number;
  z: number;
  dir: THREE.Vector2;
  out: THREE.Vector2;
  /** platform depth (from the rails' edge outwards) and length along the track */
  depth: number;
  len: number;
}

function stationOf(t: Track, size: ItemSize, cars: number): Station {
  const p = t.pos[0];
  const tan = t.tan[0];
  const dir = new THREE.Vector2(tan.x, tan.z).normalize();
  let out = new THREE.Vector2(-dir.y, dir.x);
  if (out.y < 0) out = out.multiplyScalar(-1);
  // as deep as the footprint allows in front of the rails
  const room = size.d / 2 - (p.z + out.y * 0.75) - 0.1;
  return { x: p.x, z: p.z, dir, out, depth: clamp(room, 0.9, 2.4), len: cars * CAR_SPACING + 2.4 };
}

/* ------------------------------------------------------------------ static structure */

function sweep(t: Track, ox: number, oy: number, r: number, radial: number, i0 = 0, i1 = t.n, closed = true): THREE.BufferGeometry {
  const rows = closed ? t.n : i1 - i0 + 1;
  const pos: number[] = [];
  const nor: number[] = [];
  const v = new THREE.Vector3();
  for (let k = 0; k < rows; k++) {
    const i = (i0 + k) % t.n;
    const c = t.pos[i];
    const x = t.side[i];
    const u = t.up[i];
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      v.copy(x).multiplyScalar(ca).addScaledVector(u, sa);
      nor.push(v.x, v.y, v.z);
      pos.push(c.x + x.x * ox + u.x * oy + v.x * r, c.y + x.y * ox + u.y * oy + v.y * r, c.z + x.z * ox + u.z * oy + v.z * r);
    }
  }
  const idx: number[] = [];
  const segs = closed ? rows : rows - 1;
  for (let k = 0; k < segs; k++) {
    const a0 = k * radial;
    const b0 = ((k + 1) % rows) * radial;
    for (let j = 0; j < radial; j++) {
      const j1 = (j + 1) % radial;
      idx.push(a0 + j, b0 + j, a0 + j1, a0 + j1, b0 + j, b0 + j1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g.toNonIndexed();
}

/** a box placed in the track frame at sample i (offsets in the frame) */
function frameBox(t: Track, i: number, w: number, h: number, d: number, ox: number, oy: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Matrix4().makeBasis(t.side[i], t.up[i], t.tan[i]);
  const p = t.pos[i].clone().addScaledVector(t.side[i], ox).addScaledVector(t.up[i], oy);
  m.setPosition(p);
  g.applyMatrix4(m);
  return g;
}

interface Column {
  x: number;
  z: number;
  top: number;
  r: number;
}

/** support columns: under the spine wherever nothing else runs below */
function columnsOf(t: Track): Column[] {
  const out: Column[] = [];
  const every = Math.max(1, Math.round(4.2 / t.step));
  for (let i = 0; i < t.n; i += every) {
    const u = t.up[i];
    const steep = Math.abs(t.tan[i].y) > 0.85;
    if (u.y < -0.1 && !steep) continue;
    const a = t.pos[i].clone().addScaledVector(u, SPINE_Y);
    const top = a.y - 0.14;
    if (top < 0.25) continue;
    // anything of the track below this point within reach?
    let blocked = false;
    for (let j = 0; j < t.n && !blocked; j++) {
      if (Math.abs(j - i) < 4 || Math.abs(j - i) > t.n - 4) continue;
      const q = t.pos[j];
      if (q.y < a.y - 0.6 && Math.hypot(q.x - a.x, q.z - a.z) < 1.35) blocked = true;
    }
    if (blocked) continue;
    out.push({ x: a.x, z: a.z, top, r: top > 9 ? 0.22 : 0.16 });
  }
  return out;
}

function structure(layout: TrackLayout, size: ItemSize, c: Colors, name: string): THREE.Object3D {
  const t = trackAt(layout, size);
  const k = new Kit();
  const rail = M.metal(c.track, 0.32, 0.55);
  const steel = M.metal(darken(c.track, 0.25), 0.45, 0.5);
  const supp = M.paint(c.supports, 0.5);
  const conc = M.stone('#a7a39b', 0.85);
  // running rails and the spine
  for (const s of [-1, 1]) k.geo(sweep(t, s * GAUGE * 0.5, 0, 0.055, 6), rail);
  k.geo(sweep(t, 0, SPINE_Y, 0.15, 8), rail);
  // ties every 1.2 m: cross bar + web down to the spine
  const ties: THREE.BufferGeometry[] = [];
  const tieEvery = Math.max(1, Math.round(1.2 / t.step));
  for (let i = 0; i < t.n; i += tieEvery) {
    ties.push(frameBox(t, i, GAUGE + 0.14, 0.07, 0.1, 0, -0.07));
    ties.push(frameBox(t, i, 0.08, 0.34, 0.08, 0, -0.26));
  }
  k.geo(mergeSimple(ties), steel);
  // the chain up the lift
  const i0 = Math.floor(t.liftStart / t.step);
  const i1 = Math.ceil(t.liftEnd / t.step);
  const chain: THREE.BufferGeometry[] = [];
  for (let i = i0; i <= i1; i++) chain.push(frameBox(t, i % t.n, 0.16, 0.04, t.step * 1.02, 0, -0.03));
  k.geo(mergeSimple(chain), M.metal('#2a2b2e', 0.5, 0.7));
  // support columns with concrete footings
  const cols = columnsOf(t);
  const colGeo: THREE.BufferGeometry[] = [];
  const footGeo: THREE.BufferGeometry[] = [];
  for (const col of cols) {
    const g = new THREE.CylinderGeometry(col.r * 0.85, col.r, col.top, 10);
    g.translate(col.x, col.top / 2, col.z);
    colGeo.push(g);
    const f = new THREE.BoxGeometry(col.r * 3.2, 0.22, col.r * 3.2);
    f.translate(col.x, 0.11, col.z);
    footGeo.push(f);
  }
  if (colGeo.length) k.geo(mergeSimple(colGeo), supp);
  if (footGeo.length) k.geo(mergeSimple(footGeo), conc);
  // bulbs along the track (both sides), every ~2.4 m
  const bulbs: THREE.Vector3[] = [];
  const bEvery = Math.max(1, Math.round(2.4 / t.step));
  for (let i = 0; i < t.n; i += bEvery) {
    for (const s of [-1, 1]) bulbs.push(t.pos[i].clone().addScaledVector(t.side[i], s * (GAUGE * 0.5 + 0.13)).addScaledVector(t.up[i], -0.08));
  }
  for (const m of bulbStrip(bulbs, 0.07, BULB_COLORS, 3.0)) k.g.add(m);
  // the station
  stationGeo(k, t, size, layout.cars, c, name);
  return k.g;
}

function stationGeo(k: Kit, t: Track, size: ItemSize, cars: number, c: Colors, name: string): void {
  const st = stationOf(t, size, cars);
  const g = new Kit();
  // local frame: x along the track (direction of travel), z outwards (front), origin at the rails' centre on the ground
  const deck = M.wood('#9a7652', 0.7);
  const L = st.len;
  const z0 = 0.72;
  const z1 = z0 + st.depth;
  g.box(L, 0.05, st.depth, deck, 0, 0, (z0 + z1) / 2);
  // edge stripe (mind the gap)
  g.box(L, 0.012, 0.12, M.paint('#f2c21b', 0.5), 0, 0.05, z0 + 0.06);
  // gates along the platform edge (one per car row) and a back rail
  const rail = M.metal('#c9ccce', 0.35, 0.9);
  for (let i = 0; i < cars; i++) {
    const cx = (i - (cars - 1) / 2) * CAR_SPACING;
    for (const dx of [-1.1, 1.1]) g.cyl(0.03, 1.0, rail, cx + dx, 0.05, z0 + 0.25, 0.03, 8);
    g.rod([cx - 1.1, 1.0, z0 + 0.25], [cx + 1.1, 1.0, z0 + 0.25], 0.022, rail, 0.022, 6);
  }
  // roof on posts: back posts behind the track, front posts at the platform edge
  const post = M.paint(c.roof, 0.45);
  const zb = -0.95;
  for (const x of [-L / 2 + 0.15, 0, L / 2 - 0.15]) {
    g.box(0.14, ROOF_H, 0.14, post, x, 0, zb);
    g.box(0.14, ROOF_H, 0.14, post, x, 0, z1 - 0.1);
  }
  const rz0 = zb - 0.2;
  const rz1 = z1 + 0.05;
  g.box(L + 0.3, 0.16, rz1 - rz0, M.paint(lighten(c.roof, 0.6), 0.6), 0, ROOF_H, (rz0 + rz1) / 2);
  // striped canopy edges
  const stripes = 10;
  for (let i = 0; i < stripes; i++) {
    const x = -L / 2 - 0.15 + ((L + 0.3) * (i + 0.5)) / stripes;
    g.box((L + 0.3) / stripes, 0.32, 0.04, M.paint(i % 2 ? '#fbf6ea' : c.roof, 0.6), x, ROOF_H - 0.3, rz1 - 0.02);
  }
  // name board over the front
  const bw = Math.min(L - 0.6, 5.2);
  g.box(bw + 0.16, 0.86, 0.1, post, 0, ROOF_H + 0.16, rz1 - 0.1);
  g.geo(new THREE.PlaneGeometry(bw, 0.7), signMat(name, '#1d2a6b', '#ffe27a', { icon: '🎢', border: '#f2c21b', w: 1024, h: 140, glow: 0.6 }), 0, ROOF_H + 0.59, rz1 - 0.045).castShadow = false;
  // bulbs along the roof edges
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 18; i++) {
    const x = -L / 2 - 0.1 + ((L + 0.2) * i) / 18;
    pts.push(new THREE.Vector3(x, ROOF_H + 0.17, rz1 + 0.0));
    pts.push(new THREE.Vector3(x, ROOF_H - 0.02, rz1 + 0.0));
  }
  for (const m of bulbStrip(pts, 0.07, ['#ffd36a', '#ff6a5a'], 3.2)) g.g.add(m);
  // place the station
  g.g.position.set(st.x, 0, st.z);
  g.g.rotation.y = Math.atan2(-st.dir.y, st.dir.x);
  // make sure "out" maps to +z of the station frame (the station frame's +z = local out)
  const probe = new THREE.Vector3(0, 0, 1).applyEuler(g.g.rotation);
  if (probe.x * st.out.x + probe.z * st.out.y < 0) g.g.rotation.y += Math.PI;
  k.g.add(g.g);
}

/* ------------------------------------------------------------------ the train */

function carGeo(c: Colors, front: boolean, dragon: boolean): THREE.Object3D {
  const k = new Kit();
  const body = M.paint(c.train, 0.28);
  const trim = M.paint(c.trim, 0.35);
  const dark = M.metal('#2a2c30', 0.5, 0.6);
  const seat = M.leather(darken(c.train, 0.55));
  // chassis and wheel bogies on the rails
  k.box(0.7, 0.1, 1.9, dark, 0, -0.06, 0);
  for (const z of [-0.75, 0.75]) {
    k.box(GAUGE + 0.12, 0.08, 0.22, dark, 0, -0.1, z);
    for (const s of [-1, 1]) {
      const w = k.cyl(0.075, 0.07, M.rubber('#1c1c1e'), s * (GAUGE / 2 + 0.05), -0.04, z, 0.075, 10);
      w.rotation.z = Math.PI / 2;
    }
  }
  // the tub
  k.rbox(1.26, 0.5, 2.2, 0.12, body, 0, 0.04, 0);
  k.box(1.28, 0.06, 2.22, trim, 0, 0.36, 0);
  // seats: two rows of two, backrests, lap bars
  const bar = M.metal('#f2c21b', 0.35, 0.4);
  for (const rz of [0.45, -0.55]) {
    k.cushion(0.98, 0.1, 0.46, seat, 0, 0.3, rz - 0.02, 0.04, 0.015);
    k.rbox(1.02, 0.6, 0.1, 0.04, body, 0, 0.32, rz - 0.3);
    k.cushion(0.92, 0.42, 0.06, seat, 0, 0.42, rz - 0.245, 0.03, 0.01);
    for (const x of [-0.27, 0.27]) {
      k.rod([x - 0.16, 0.62, rz + 0.28], [x + 0.16, 0.62, rz + 0.28], 0.025, bar, 0.025, 8);
      k.rod([x, 0.42, rz + 0.36], [x, 0.62, rz + 0.28], 0.022, bar, 0.022, 8);
    }
  }
  if (front) {
    if (dragon) {
      // a friendly dragon head on the front car
      const scale = M.paint(c.train, 0.4);
      k.sphere(0.36, scale, 0, 0.62, 1.22, 1, 0.9, 1.25, 16);
      k.sphere(0.25, scale, 0, 0.55, 1.62, 1.05, 0.8, 1.1, 14);
      k.sphere(0.09, M.paint('#ffffff', 0.3), -0.18, 0.82, 1.42, 1, 1, 1, 10);
      k.sphere(0.09, M.paint('#ffffff', 0.3), 0.18, 0.82, 1.42, 1, 1, 1, 10);
      k.sphere(0.045, M.paint('#1a1a1a', 0.2), -0.2, 0.84, 1.5, 1, 1, 1, 8);
      k.sphere(0.045, M.paint('#1a1a1a', 0.2), 0.2, 0.84, 1.5, 1, 1, 1, 8);
      for (const s of [-1, 1]) {
        k.rod([s * 0.14, 0.9, 1.15], [s * 0.24, 1.18, 1.0], 0.05, trim, 0.012, 8);
        k.sphere(0.03, M.paint('#3a1f12', 0.5), s * 0.08, 0.6, 1.86, 1, 1, 1, 6);
      }
      for (let i = 0; i < 4; i++) k.rod([0, 0.82 - i * 0.05, 1.05 - i * 0.26], [0, 1.02 - i * 0.06, 0.95 - i * 0.26], 0.06, trim, 0.01, 6);
    } else {
      // streamlined nose with two headlights
      const nose = k.sphere(0.62, body, 0, 0.3, 1.05, 1, 0.55, 0.75, 18);
      nose.castShadow = true;
      k.box(1.28, 0.06, 0.5, trim, 0, 0.36, 1.1);
      for (const s of [-1, 1]) k.sphere(0.07, M.glow('#fff3c8', 2.5), s * 0.36, 0.33, 1.47, 1, 1, 0.6, 10);
    }
  }
  return k.g;
}

/* ------------------------------------------------------------------ runtime */

class CoasterRide extends RideBase {
  readonly kind = 'coaster' as const;
  label: string;
  icon = '🎢';
  thrill: number;
  entrance: { x: number; z: number; facing: number };
  readonly phys: TrainPhysics;
  private p = new THREE.Vector3();
  private q = new THREE.Quaternion();
  private lastSection = 'station';

  constructor(
    readonly track: Track,
    private cars: THREE.Object3D[],
    chain: number,
    label: string,
    thrill: number,
    st: Station,
  ) {
    super();
    this.label = label;
    this.thrill = thrill;
    this.phys = new TrainPhysics(track, chain, (cars.length * CAR_SPACING) / 2);
    const ex = st.x + st.out.x * (0.72 + st.depth + 0.6);
    const ez = st.z + st.out.y * (0.72 + st.depth + 0.6);
    this.entrance = { x: ex, z: ez, facing: Math.atan2(-st.out.x, -st.out.y) };
    this.loadTime = 2.2;
    this.place();
  }

  /** the train's cars along the track around arc length s (front car first) */
  place(): void {
    const n = this.cars.length;
    for (let i = 0; i < n; i++) {
      const s = this.phys.s + ((n - 1) / 2 - i) * CAR_SPACING;
      this.track.sample(s, this.p, this.q);
      this.cars[i].position.copy(this.p);
      this.cars[i].quaternion.copy(this.q);
    }
  }

  protected onStart(): void {
    this.phys.start();
    this.lastSection = 'station';
  }

  protected advance(h: number): boolean {
    const done = this.phys.step(h);
    const ph = this.phys;
    this.speed = ph.v;
    this.progress = clamp(ph.s / this.track.length, 0, 1);
    const sec = done ? 'station' : ph.section();
    this.drop = !done && sec === 'free' && this.track.inDrop(ph.s) && ph.v > 3;
    const inv = !done && this.track.inverted(ph.s);
    this.rush = clamp(ph.v / 16 + (inv ? 0.4 : 0) + (this.drop ? 0.3 : 0), 0, 1);
    if (this.playerOn) {
      if (sec === 'lift') rideSound.chain(h, ph.v);
      if (sec === 'brake' && this.lastSection === 'free') rideSound.brake();
      if (inv && Math.random() < h * 0.6) rideSound.scream(2, 'whee', 0.25);
    }
    if (sec === 'free' && this.lastSection === 'lift') this.emit('top');
    this.lastSection = sec;
    this.place();
    return done;
  }

  protected rest(): void {
    this.place();
  }
}

/* ------------------------------------------------------------------ items */

interface CoasterSpec {
  id: string;
  name: string;
  short: string;
  layout: TrackLayout;
  thrill: number;
  dragon?: boolean;
  colors: { track: string; supports: string; train: string; trim: string; roof: string };
  tags: string[];
}

const anchorsCache = new Map<string, ItemAnchors>();

function coaster(spec: CoasterSpec): FurnitureDef {
  const L = spec.layout;
  return {
    id: spec.id,
    name: spec.name,
    category: 'playground',
    group: 'לונה פארק',
    tags: ['לונה פארק', 'רכבת הרים', 'מתקן', 'אקסטרים', ...spec.tags],
    size: { ...L.size },
    resize: { w: [L.size.w * 0.7, L.size.w * 1.35], d: [L.size.d * 0.75, L.size.d * 1.35], h: [L.size.h * 0.7, L.size.h * 1.3] },
    parametric: true,
    noBake: true,
    colors: [
      slot('track', 'מסילה', spec.colors.track),
      slot('supports', 'עמודים', spec.colors.supports),
      slot('train', 'קרונות', spec.colors.train),
      slot('trim', 'פסים', spec.colors.trim),
      slot('roof', 'גג התחנה', spec.colors.roof),
    ],
    light: { x: 0, y: ROOF_H - 0.2, z: 0, color: '#ffd9a0', intensity: 60, distance: 14 },
    actions: [{ kind: 'light' }],
    ride: { kind: 'spin', prompt: `לעלות על ${spec.short}` },
    build: ({ colors: c, size }) => {
      const sz = size ?? L.size;
      const t = trackAt(L, sz);
      const root = new THREE.Group();
      const sizeKey = `${sz.w.toFixed(2)}x${sz.d.toFixed(2)}x${sz.h.toFixed(2)}`;
      const frame = bakedPart(`${partKey(`coaster-${L.id}`, c, ['track', 'supports', 'roof'])}|${sizeKey}`, () => structure(L, sz, c, spec.short));
      root.add(frame);
      const cars: THREE.Object3D[] = [];
      const seatNodes: THREE.Object3D[] = [];
      for (let i = 0; i < L.cars; i++) {
        const car = new THREE.Group();
        car.add(bakedPart(partKey(`coaster-car-${i === 0 ? 'front' : 'mid'}-${spec.dragon ? 'dragon' : 'std'}`, c, ['train', 'trim']), () => carGeo(c, i === 0, !!spec.dragon)));
        for (const rz of [0.45, -0.55]) for (const x of [-0.27, 0.27]) seatNodes.push(seatNode(car, x, 0.42, rz + 0.02, 0));
        root.add(car);
        cars.push(car);
      }
      const st = stationOf(t, sz, L.cars);
      const rt = new CoasterRide(t, cars, L.chain, spec.short, spec.thrill, st);
      rt.setSeats(seatNodes, root);
      root.userData.ride = rt;
      root.userData.amuse = rt;
      idleTicker(rt, frame.children[0] ?? frame);
      // collisions: the support columns only (the station deck and the space under the track are walkable)
      let anchors = anchorsCache.get(`${L.id}|${sizeKey}`);
      if (!anchors) {
        const light = { x: st.x + st.out.x * 1.0, y: ROOF_H - 0.2, z: st.z + st.out.y * 1.0 };
        const boxes = columnsOf(t).map((col) => ({ x: col.x, z: col.z, w: col.r * 2 + 0.1, d: col.r * 2 + 0.1, h: col.top }));
        anchors = { light, boxes };
        anchorsCache.set(`${L.id}|${sizeKey}`, anchors);
      }
      root.userData.anchors = anchors;
      return root;
    },
    draw2d: (ctx, c, size) =>
      sym(ctx, () => {
        const sz = size ?? L.size;
        const t = trackAt(L, sz);
        const st = stationOf(t, sz, L.cars);
        // station
        ctx.save();
        ctx.translate(st.x, st.z);
        ctx.rotate(Math.atan2(st.dir.y, st.dir.x));
        const sg = -st.dir.y * st.out.x + st.dir.x * st.out.y >= 0 ? 1 : -1;
        D.box(ctx, -st.len / 2, Math.min(-sg * 1.0, sg * (0.72 + st.depth)), st.len / 2, Math.max(-sg * 1.0, sg * (0.72 + st.depth)), 0.1, tint(c.roof, 0.6), undefined, LINE_THIN);
        ctx.restore();
        // the circuit: ties as a broad band, the rails on top
        ctx.beginPath();
        t.pos.forEach((p, i) => (i ? ctx.lineTo(p.x, p.z) : ctx.moveTo(p.x, p.z)));
        ctx.closePath();
        ctx.strokeStyle = tint(c.track, 0.55);
        ctx.lineWidth = 1.1;
        ctx.stroke();
        ctx.strokeStyle = c.track;
        ctx.lineWidth = 0.14;
        ctx.stroke();
        for (const col of columnsOf(t)) D.circle(ctx, col.x, col.z, col.r + 0.05, tint(c.supports, 0.1), '#7d8187', 0.02);
      }),
  };
}

export const COASTERS: FurnitureDef[] = [
  coaster({
    id: 'amuse-coaster-loop',
    name: 'רכבת הרים עם לולאה',
    short: 'רכבת ההרים',
    layout: LAYOUT_LOOP,
    thrill: 5,
    colors: { track: '#d8342c', supports: '#eeeae0', train: '#1f5fbf', trim: '#f2c21b', roof: '#d8342c' },
    tags: ['לולאה', 'מהירה'],
  }),
  coaster({
    id: 'amuse-coaster-helix',
    name: 'רכבת הרים ספירלה',
    short: 'רכבת הספירלה',
    layout: LAYOUT_HELIX,
    thrill: 4,
    colors: { track: '#1f8fa8', supports: '#3b3f46', train: '#e0482e', trim: '#f4f1ea', roof: '#1f8fa8' },
    tags: ['ספירלה', 'הליקס'],
  }),
  coaster({
    id: 'amuse-coaster-family',
    name: 'רכבת הרים משפחתית – הדרקון',
    short: 'רכבת הדרקון',
    layout: LAYOUT_FAMILY,
    thrill: 3,
    dragon: true,
    colors: { track: '#f2a01b', supports: '#6b4a2e', train: '#3a9b4a', trim: '#f26b5b', roof: '#3a9b4a' },
    tags: ['ילדים', 'משפחתית', 'דרקון'],
  }),
];
