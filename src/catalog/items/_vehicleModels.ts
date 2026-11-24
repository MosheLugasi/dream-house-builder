/**
 * Photographic car models (glTF, `public/assets/vehicles/`, CC0 – see `public/assets/CREDITS.md`).
 *
 * `build()` has to stay synchronous, so a car is assembled like this:
 *  - the four wheel pivots (`WheelPart`s) are created at once at the model's real axle positions, so
 *    whoever drives the car keeps valid wheel references when the model arrives;
 *  - until the GLB is parsed (and always in Node / the unit tests) the procedural car is shown, scaled
 *    to the model's footprint;
 *  - then the shared, parsed geometry is attached (one Mesh per material, cheap per instance), with
 *    the game's own materials: recolourable clear-coat paint (`body` colour slot), real glass, chrome,
 *    rubber, emissive lamps. Far away a lighter level of detail (`-lo.glb`) takes over.
 * A procedural cabin (seats in the `seats` colour, steering wheel, dash, floor) fills the empty shell so
 * the seated driver looks right through the glass. Lamps: head lamps light up after dusk, tail lamps
 * glow at night and brighten when the car brakes (both derived per frame, nothing to drive from outside).
 */
import * as THREE from 'three';
import type { WheelPart } from '../types';
import { Kit, M } from '../kit';
import { hasDom, loadGLB, whenIdle } from '../../assets/loader';
import { VM, carSeat, mountWheel, plate, roadWheel, staticPart, steeringWheel, type WheelSpec } from './_vehicleParts';

type Colors = Record<string, string>;

export interface CarModel {
  /** GLB base name under `assets/vehicles/` (`<file>.glb` and the far LOD `<file>-lo.glb`) */
  file: string;
  /** wheel centres: ±x, front / rear z; tyre radius (the GLB's `vehicle` extras, checked at load) */
  wheelX: number;
  zf: number;
  zr: number;
  radius: number;
  /** number plates: centre height and z of the front / rear plate, plate size */
  plates: { front: [number, number]; rear: [number, number]; w: number; h: number; text: string };
  /** procedural cabin (seats, steering wheel, dash, floor) in model coordinates */
  interior(k: Kit, c: Colors): void;
}

export interface CarFallback {
  /** cache key of the procedural body (colours are appended) */
  key: string;
  statics: () => THREE.Object3D;
  wheel: WheelSpec;
  rimMat: THREE.Material;
}

/* ------------------------------------------------------------------ loading */

interface Part {
  geo: THREE.BufferGeometry;
  mat: string;
  matrix: THREE.Matrix4;
}
interface ModelParts {
  body: Part[];
  wheel: Part[];
}
interface Loaded {
  hi: ModelParts;
  lo: ModelParts | null;
}

const loaded = new Map<string, Loaded>();
const loading = new Map<string, Promise<Loaded>>();

function partsOf(scene: THREE.Object3D): ModelParts {
  scene.updateMatrixWorld(true);
  const collect = (name: string): Part[] => {
    const out: Part[] = [];
    scene.getObjectByName(name)?.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mat = (Array.isArray(m.material) ? m.material[0] : m.material).name.replace(/\.\d+$/, '');
      out.push({ geo: m.geometry, mat, matrix: m.matrixWorld.clone() });
    });
    return out;
  };
  return { body: collect('body'), wheel: collect('wheel') };
}

/** Load (once) both levels of detail of a car model. */
export function loadCarModel(file: string): Promise<Loaded> {
  let p = loading.get(file);
  if (!p) {
    p = loadGLB(`vehicles/${file}.glb`).then(async (hi) => {
      const lo = await loadGLB(`vehicles/${file}-lo.glb`).catch(() => null);
      const res: Loaded = { hi: partsOf(hi.scene), lo: lo ? partsOf(lo.scene) : null };
      if (!res.hi.body.length || !res.hi.wheel.length) throw new Error(`vehicle model ${file}: no body / wheel`);
      loaded.set(file, res);
      return res;
    });
    p.catch(() => undefined);
    loading.set(file, p);
  }
  return p;
}

/** Start downloading the car models in the background once the page is idle (catalog thumbnails then show them). */
export function preloadCarModels(files: string[]): void {
  whenIdle(() => files.forEach((f) => void loadCarModel(f).catch(() => undefined)));
}

/* ------------------------------------------------------------------ materials & lamps */

interface Lamps {
  head: THREE.MeshPhysicalMaterial;
  tail: THREE.MeshPhysicalMaterial;
}

function materialFor(name: string, c: Colors, lamps: Lamps): THREE.Material {
  switch (name) {
    case 'Paint':
      return VM.paint(c.body);
    case 'glass':
      return VM.carGlass();
    case 'Headlight':
      return lamps.head;
    case 'Taillight':
      return lamps.tail;
    case 'amber':
      return VM.amber();
    case 'chrome':
      return VM.chrome();
    case 'steel':
      return VM.wheelAlloy();
    case 'rubber':
      return VM.rubber();
    case 'interior':
      return VM.cabin('#2a2c30');
    case 'white':
      return M.plastic('#e8e8e4');
    default:
      return VM.plastic();
  }
}

/** Night factor of the scene the car is drawn in: the sky's star field fades in with the night. */
const nightCache = new WeakMap<THREE.Object3D, THREE.Points | null>();
function sceneNight(scene: THREE.Object3D): number {
  let stars = nightCache.get(scene);
  if (stars === undefined) {
    stars = null;
    for (const o of scene.children) {
      if ((o as THREE.Points).isPoints && o.renderOrder === -5) stars = o as THREE.Points;
    }
    nightCache.set(scene, stars);
  }
  if (!stars) return 0;
  return stars.visible ? Math.min(1, (stars.material as THREE.PointsMaterial).opacity / 0.95) : 0;
}

interface LampState extends Lamps {
  spin: THREE.Object3D;
  radius: number;
  angle: number;
  time: number;
  speed: number;
  moved: number;
  brake: number;
  frame: number;
}

/** Per-frame lamp update, hooked on the body's paint mesh (runs once per rendered frame per car). */
function lampHook(state: LampState): THREE.Object3D['onBeforeRender'] {
  return (renderer, scene) => {
    const frame = renderer.info.render.frame;
    if (frame === state.frame) return;
    state.frame = frame;
    const now = performance.now() / 1000;
    const dt = now - state.time;
    state.time = now;
    if (dt > 0 && dt < 0.5) {
      const v = ((state.spin.rotation.x - state.angle) * state.radius) / dt;
      const decel = (Math.abs(state.speed) - Math.abs(v)) / dt;
      state.speed += (v - state.speed) * Math.min(1, dt * 8);
      if (Math.abs(state.speed) > 0.4) state.moved = now;
      // braking hard, or waiting with the foot on the brake after driving
      if ((decel > 2 && Math.abs(state.speed) > 0.3) || (Math.abs(state.speed) < 0.15 && now - state.moved < 4)) state.brake = now;
    }
    state.angle = state.spin.rotation.x;
    // lamps are on after dusk while the car is in use (parked cars stay dark)
    const night = now - state.moved < 90 ? sceneNight(scene) : 0;
    state.head.emissiveIntensity = 0.04 + night * 2.6;
    state.tail.emissiveIntensity = Math.max(0.08 + night * 1.1, now - state.brake < 0.25 ? 2.4 : 0);
  };
}

/* ------------------------------------------------------------------ assembly */

const LOD_DIST = 24;

function partsGroup(parts: Part[], c: Colors, lamps: Lamps): THREE.Group {
  const g = new THREE.Group();
  for (const p of parts) {
    const mat = materialFor(p.mat, c, lamps);
    const m = new THREE.Mesh(p.geo, mat);
    m.matrixAutoUpdate = false;
    m.matrix.copy(p.matrix);
    m.castShadow = !mat.transparent;
    m.receiveShadow = true;
    m.name = p.mat;
    g.add(m);
  }
  return g;
}

function wheelLevel(parts: Part[], side: 1 | -1, c: Colors, lamps: Lamps): THREE.Group {
  const g = partsGroup(parts, c, lamps);
  if (side < 0) g.rotation.y = Math.PI;
  return g;
}

function attachModel(root: THREE.Group, spins: THREE.Object3D[], wheels: WheelPart[], m: Loaded, model: CarModel, c: Colors): void {
  // lamp materials are per car: each one lights up on its own (driven at night, braking)
  const lamps: Lamps = { head: VM.headUnit().clone(), tail: VM.tailUnit().clone() };
  const hi = partsGroup(m.hi.body, c, lamps);
  hi.add(staticPart(`model-cabin|${model.file}|${c.seats ?? ''}`, () => cabin(model, c)));
  let body: THREE.Object3D = hi;
  if (m.lo) {
    const lod = new THREE.LOD();
    lod.addLevel(hi, 0);
    lod.addLevel(partsGroup(m.lo.body, c, lamps), LOD_DIST);
    body = lod;
  }
  body.name = 'model';
  root.add(body);
  spins.forEach((s, i) => {
    const side = i % 2 === 0 ? 1 : -1;
    if (m.lo) {
      const lod = new THREE.LOD();
      lod.addLevel(wheelLevel(m.hi.wheel, side, c, lamps), 0);
      lod.addLevel(wheelLevel(m.lo.wheel, side, c, lamps), LOD_DIST);
      s.add(lod);
    } else s.add(wheelLevel(m.hi.wheel, side, c, lamps));
  });
  const state: LampState = { ...lamps, spin: wheels[0].spin, radius: model.radius, angle: wheels[0].spin.rotation.x, time: 0, speed: 0, moved: -99, brake: -99, frame: -1 };
  // the hook must run whichever level of detail is drawn
  const hook = lampHook(state);
  for (const lvl of body instanceof THREE.LOD ? body.levels.map((l) => l.object) : [body]) {
    const target = lvl.children.find((o) => o.name === 'Paint') ?? lvl.children[0];
    if (target) target.onBeforeRender = hook;
  }
  root.userData.model = model.file;
}

function cabin(model: CarModel, c: Colors): THREE.Object3D {
  const k = new Kit();
  model.interior(k, c);
  const { front, rear, w, h, text } = model.plates;
  plate(k, text, front[0], front[1], 'front', w, h);
  plate(k, text, rear[0], rear[1], 'rear', w, h);
  return k.g;
}

const fallbackScale = new Map<string, THREE.Vector3>();

/**
 * Build a car from a photographic model (see the module comment). `size` is the item's declared size,
 * which the procedural fallback is fitted into.
 */
export function modelCar(id: string, c: Colors, model: CarModel, fb: CarFallback, size: { w: number; d: number; h: number }): THREE.Group {
  const root = new THREE.Group();
  root.name = id;
  const spins: THREE.Group[] = [];
  const wheels: WheelPart[] = [];
  const at: Array<[number, number, boolean]> = [
    [model.wheelX, model.zf, true],
    [-model.wheelX, model.zf, true],
    [model.wheelX, model.zr, false],
    [-model.wheelX, model.zr, false],
  ];
  for (const [x, z, steer] of at) {
    const spin = new THREE.Group();
    wheels.push(mountWheel(root, spin, model.radius, x, z, steer));
    spins.push(spin);
  }
  root.userData.wheels = wheels;

  const ready = loaded.get(model.file);
  if (ready) {
    attachModel(root, spins, wheels, ready, model, c);
    return root;
  }

  // procedural stand-in, fitted to the model's footprint
  const key = `${fb.key}|${Object.values(c).join(',')}`;
  const body = staticPart(key, fb.statics);
  let s = fallbackScale.get(fb.key);
  if (!s) {
    const b = new THREE.Box3().setFromObject(body, true);
    const half = (a: number, b2: number) => Math.max(Math.abs(a), Math.abs(b2));
    s = new THREE.Vector3(
      Math.min(1, (size.w / 2 - 0.01) / half(b.min.x, b.max.x)),
      Math.min(1, (size.h - 0.01) / b.max.y),
      Math.min(1, (size.d / 2 - 0.01) / half(b.min.z, b.max.z)),
    );
    fallbackScale.set(fb.key, s);
  }
  body.scale.copy(s);
  body.name = 'fallback';
  root.add(body);
  const ws = model.radius / fb.wheel.r;
  spins.forEach((sp, i) => {
    const w = roadWheel(fb.wheel, i % 2 === 0 ? 1 : -1, fb.rimMat);
    w.scale.setScalar(ws);
    w.name = 'fallback';
    sp.add(w);
  });

  if (hasDom) {
    loadCarModel(model.file)
      .then((m) => {
        root.remove(body);
        for (const sp of spins) for (const ch of [...sp.children]) if (ch.name === 'fallback') sp.remove(ch);
        attachModel(root, spins, wheels, m, model, c);
      })
      .catch(() => undefined);
  }
  return root;
}

/* ------------------------------------------------------------------ cabins */

/** A front seat pair, the steering wheel on the left (+X) and a floor pan. */
export function frontCabin(k: Kit, seatMat: THREE.Material, o: { hipX: number; hipZ: number; seatY: number; floor: number; floorZ: [number, number]; width: number; wheel?: [number, number, number, number, number] }): void {
  carSeat(k, o.hipX, o.hipZ, o.seatY, seatMat, 0.48, o.floor);
  carSeat(k, -o.hipX, o.hipZ, o.seatY, seatMat, 0.48, o.floor);
  const [tilt, r, col, dz, dy] = o.wheel ?? [0.42, 0.17, 0.3, 0.5, 0.42];
  steeringWheel(k, o.hipX, o.hipZ, o.seatY, tilt, r, col, dz, dy);
  const cab = VM.cabin('#2f3136');
  const fl = k.box(o.width, 0.03, o.floorZ[1] - o.floorZ[0], cab, 0, o.floor - 0.03, (o.floorZ[0] + o.floorZ[1]) / 2);
  fl.castShadow = false;
  // centre console between the front seats
  k.rbox(0.2, o.seatY - o.floor - 0.05, 0.55, 0.04, cab, 0, o.floor, o.hipZ + 0.2, 1);
}

/** Rear bench: cushion, inclined backrest and the box under it. */
export function rearBench(k: Kit, seatMat: THREE.Material, w: number, z: number, seatY: number, floor: number): void {
  k.rbox(w, 0.13, 0.48, 0.045, seatMat, 0, seatY - 0.13, z, 1);
  k.box(w - 0.04, Math.max(0.02, seatY - 0.13 - floor), 0.42, VM.cabin('#2f3136'), 0, floor, z);
  const b = k.rbox(w, 0.58, 0.1, 0.04, seatMat, 0, seatY - 0.04, z - 0.27, 1);
  b.rotation.x = -0.14;
}

/** Seat material of the cabins (fabric in the `seats` colour). */
export function seatFabric(c: Colors): THREE.Material {
  return M.fabric(c.seats ?? '#3e4148', 14);
}
