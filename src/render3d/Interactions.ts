/**
 * Interactive furniture: turns catalog `actions` + animated `part:*` groups into things the
 * character can do in walk mode (TVs, music, instruments, swings, pets, balls, darts…), plus the
 * ambient animations that run in every mode (clocks, fish, fans).
 */
import * as THREE from 'three';
import type { ActionKind, ActionSpec, FurnitureDef, ItemAnchors, ItemSize, PetRuntime, RideRuntime, SeatAnchor } from '../catalog/types';
import { clampSize, itemSize, scaleLocal } from '../catalog';
import { report } from '../game/progress';
import type { FurnitureItem, Vec2 } from '../model/types';
import { sound, STATIONS, type Voice } from '../audio/sound';
import { useWalk } from '../store/walk';
import type { Activity, Prop } from './Character';
import { Particles, Screens, TV_CHANNELS, type Channel } from './fx';
import { collideCircle, RADIUS, type Occupation, type OccupationFrame, type WalkController, type WalkWorld } from './WalkController';

interface RestXf {
  p: THREE.Vector3;
  q: THREE.Quaternion;
  s: THREE.Vector3;
}

interface InstState {
  lightOn: boolean;
  on: Partial<Record<ActionKind, boolean>>;
  channel: number;
  station: number;
  open: number;
  openTarget: number;
  spin: number;
  spinSpeed: number;
  beat: number;
  feedT: number;
}

interface Pose {
  /** world plan position of the item at rest */
  x: number;
  y: number;
  /** absolute height of the floor it stands on */
  floor: number;
  /** plan rotation in site coordinates */
  rot: number;
}

interface PetState {
  pos: Vec2;
  home: Vec2;
  heading: number;
  mode: 'idle' | 'wander' | 'follow' | 'chase' | 'happy';
  target: Vec2 | null;
  timer: number;
  phase: number;
  speed: number;
  happy: number;
  follow: boolean;
  species: string;
  radius: number;
  noiseT: number;
  /** blocked while following: walk around the obstacle for a moment */
  stuck: number;
  detour: number;
  detourSide: number;
  /** resting behaviour of a pet that animates itself (see render3d/Pet.ts) */
  rest: 'idle' | 'sit' | 'lie';
  restT: number;
}

interface BallState {
  floor: number;
  p: THREE.Vector3;
  v: THREE.Vector3;
  r: number;
}

interface FishState {
  obj: THREE.Object3D;
  target: THREE.Vector3;
  speed: number;
  phase: number;
}

interface Inst {
  id: string;
  def: FurnitureDef;
  item: FurnitureItem;
  holder: THREE.Group;
  obj: THREE.Object3D;
  light: THREE.PointLight | null;
  lightBase: number;
  parts: Map<string, THREE.Object3D[]>;
  rest: Map<THREE.Object3D, RestXf>;
  glow: Array<{ mesh: THREE.Mesh; on: THREE.Material }>;
  screens: Array<{ mesh: THREE.Mesh; orig: THREE.Material }>;
  screenCh: Channel | null;
  st: InstState;
  voices: Partial<Record<string, Voice>>;
  fireLight: THREE.PointLight | null;
  waterStop: number | null;
  emitAcc: number;
  pet: PetState | null;
  ball: BallState | null;
  fish: FishState[];
  act: Map<ActionKind, ActionSpec>;
  /** holder height at rest (props stand on raised sidewalks) */
  restY: number;
  /** world yaw of the holder's parent (buildings can be rotated) */
  parentYaw: number;
  /** real size of the placed item (the player may have resized it) */
  size: ItemSize;
  /**
   * extents in the frame of `obj`: the catalog size for stretched items (their `obj` carries the
   * scale), the real size for parametric ones (built at that size). Local points fed to `world3`
   * and `plan` are in this frame.
   */
  lsize: ItemSize;
  /** |scale| of `obj` (1 for parametric items): turns local heights into real heights */
  k: { x: number; y: number; z: number };
  /** the item is mirrored left ↔ right */
  mirror: boolean;
  /** seats in the frame of `obj` */
  seats: SeatAnchor[];
}

interface Choice {
  id: string;
  label: string;
  icon: string;
  run: () => void;
}

interface Projectile {
  mesh: THREE.Object3D;
  from: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
  T: number;
  arc: number;
  done: () => void;
}

const ICON: Partial<Record<ActionKind | 'sit' | 'lie' | 'stand' | 'stop' | 'channel' | 'station' | 'follow' | 'dance', string>> = {
  light: '💡',
  tv: '📺',
  computer: '💻',
  music: '🎵',
  piano: '🎹',
  guitar: '🎸',
  drums: '🥁',
  fan: '🌀',
  fire: '🔥',
  water: '🚿',
  cook: '🍳',
  snack: '🍎',
  open: '🚪',
  sleep: '😴',
  read: '📖',
  run: '🏃',
  pedal: '🚴',
  row: '🚣',
  workout: '💪',
  bounce: '🤸',
  swing: '🎠',
  rock: '🪑',
  slide: '🛝',
  ball: '⚽',
  hoop: '🏀',
  darts: '🎯',
  game: '🕹️',
  pet: '🐾',
  fish: '🐟',
  play: '🎲',
  sit: '🛋️',
  lie: '🛏️',
  stand: '🧍',
  stop: '⏹️',
  channel: '🔁',
  station: '📻',
  follow: '🦮',
  dance: '💃',
};

const PIANO_KEYS: Record<string, number> = {
  KeyA: 60, KeyW: 61, KeyS: 62, KeyE: 63, KeyD: 64, KeyF: 65, KeyT: 66, KeyG: 67, KeyY: 68, KeyH: 69, KeyU: 70, KeyJ: 71, KeyK: 72, KeyO: 73, KeyL: 74, KeyP: 75, Semicolon: 76,
};
const GUITAR_CHORDS: Record<string, { name: string; notes: number[] }> = {
  KeyA: { name: 'C', notes: [48, 52, 55, 60, 64] },
  KeyS: { name: 'G', notes: [43, 47, 50, 55, 59, 67] },
  KeyD: { name: 'Am', notes: [45, 52, 57, 60, 64] },
  KeyF: { name: 'F', notes: [41, 48, 53, 57, 60, 65] },
  KeyG: { name: 'Dm', notes: [50, 57, 62, 65] },
  KeyH: { name: 'Em', notes: [40, 47, 52, 55, 59, 64] },
  KeyJ: { name: 'E', notes: [40, 47, 52, 56, 59, 64] },
  KeyK: { name: 'D', notes: [50, 57, 62, 66] },
};
const DRUM_KEYS: Record<string, { kind: 'kick' | 'snare' | 'hat' | 'tom1' | 'tom2' | 'crash'; side: number }> = {
  KeyA: { kind: 'kick', side: 0 },
  KeyS: { kind: 'snare', side: -1 },
  KeyD: { kind: 'hat', side: 1 },
  KeyF: { kind: 'tom1', side: -1 },
  KeyG: { kind: 'tom2', side: 1 },
  KeyH: { kind: 'crash', side: 1 },
  KeyJ: { kind: 'hat', side: -1 },
  KeyK: { kind: 'snare', side: 1 },
};
export const INSTRUMENT_KEYS = { piano: PIANO_KEYS, guitar: GUITAR_CHORDS, drums: DRUM_KEYS };

const tmpV = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const AX = new THREE.Vector3(1, 0, 0);
const AY = new THREE.Vector3(0, 1, 0);
const AZ = new THREE.Vector3(0, 0, 1);

const has = (def: FurnitureDef, k: ActionKind) => !!def.actions?.some((a) => a.kind === k);
const textOf = (def: FurnitureDef) => `${def.id} ${def.name} ${(def.tags ?? []).join(' ')}`;

export class Interactions {
  private insts = new Map<string, Inst>();
  private states = new Map<string, InstState>();
  private offMats = new Map<THREE.Material, THREE.Material>();
  readonly particles = new Particles();
  readonly screens = new Screens();
  private walk: WalkController | null = null;
  private world: WalkWorld | null = null;
  private walking = false;
  private choices: Choice[] = [];
  private choiceT = 0;
  private projectiles: Projectile[] = [];
  private tempBalls: Array<{ mesh: THREE.Mesh; b: BallState; life: number }> = [];
  private darts = new Map<string, THREE.Object3D[]>();
  private effects = new THREE.Group();
  private lampScale = 0.05;
  private time = 0;
  /** called when the character sleeps through the night */
  onSleep: () => void = () => {};
  /** who decides whether a lamp is lit (the engine's light manager: night-time or a flipped switch) */
  lamps: { isOn(id: string): boolean; toggle(id: string): boolean } | null = null;
  /** a ball crossed a goal line */
  goalScored: (at: THREE.Vector3) => void = () => {};
  private goalCooldown = 0;
  /** play equipment that keeps moving after its rider left */
  private coasting = new Set<RideRuntime>();

  constructor(private scene: THREE.Scene) {
    scene.add(this.particles.group);
    scene.add(this.effects);
  }

  // ---- registry ------------------------------------------------------------------------------

  register(item: FurnitureItem, def: FurnitureDef, holder: THREE.Group, obj: THREE.Object3D, light: THREE.PointLight | null): void {
    this.unregister(item.id, true);
    const parts = new Map<string, THREE.Object3D[]>();
    const rest = new Map<THREE.Object3D, RestXf>();
    obj.traverse((o) => {
      const p = o.userData.part as string | undefined;
      if (o !== obj && p !== undefined) {
        const list = parts.get(p) ?? [];
        list.push(o);
        parts.set(p, list);
        rest.set(o, { p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone() });
      }
    });
    let st = this.states.get(item.id);
    if (!st) {
      st = { lightOn: true, on: {}, channel: 0, station: Math.floor(Math.random() * STATIONS.length), open: 0, openTarget: 0, spin: 0, spinSpeed: 0, beat: 0, feedT: 0 };
      this.states.set(item.id, st);
    }
    const screenSet = new Set<THREE.Object3D>();
    for (const p of parts.get('screen') ?? []) p.traverse((o) => screenSet.add(o));
    const glow: Inst['glow'] = [];
    const screens: Inst['screens'] = [];
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || Array.isArray(m.material)) return;
      if (screenSet.has(m)) {
        screens.push({ mesh: m, orig: m.material });
        return;
      }
      const mat = m.material as THREE.MeshStandardMaterial;
      if (def.light && mat.emissive && mat.emissiveIntensity > 0 && (mat.emissive.r + mat.emissive.g + mat.emissive.b) > 0.05) glow.push({ mesh: m, on: mat });
    });
    // parametric items are built at their real size: their action points come from the anchors the
    // build published, or are scaled from the catalog's; stretched items keep the catalog's points
    // (their `obj` is scaled, so `world3` maps them correctly)
    const size = itemSize(def, item);
    const anchors = obj.userData.anchors as ItemAnchors | undefined;
    const real = !!def.parametric;
    const lsize = real ? clampSize(def, item.size) : def.size;
    const local = (p: { x: number; y: number; z: number }) => (real ? scaleLocal(def, lsize, p) : p);
    const act = new Map<ActionKind, ActionSpec>();
    for (const a of def.actions ?? []) {
      if (act.has(a.kind)) continue;
      if (!real) {
        act.set(a.kind, a);
        continue;
      }
      const at = anchors?.actions?.[a.kind] ?? (a.at ? local(a.at) : undefined);
      const path = anchors?.paths?.[a.kind] ?? a.path?.map(local);
      const area = a.area ? { min: local(a.area.min), max: local(a.area.max) } : undefined;
      act.set(a.kind, { ...a, at, path, area });
    }
    const seats: SeatAnchor[] =
      real && anchors?.seats
        ? anchors.seats
        : (def.seats ?? []).map((st0) => {
            if (!real) return st0;
            const l = local({ x: st0.x, y: st0.height, z: st0.z });
            return { ...st0, x: l.x, z: l.z, height: l.y };
          });
    const inst: Inst = {
      id: item.id,
      def,
      item,
      holder,
      obj,
      light,
      lightBase: (holder.userData.lightBase as number | undefined) ?? light?.intensity ?? 0,
      parts,
      rest,
      glow,
      screens,
      screenCh: null,
      st,
      voices: {},
      fireLight: null,
      waterStop: null,
      emitAcc: 0,
      pet: null,
      ball: null,
      fish: [],
      act,
      restY: holder.position.y,
      parentYaw: 0,
      size,
      lsize,
      k: { x: Math.abs(obj.scale.x), y: Math.abs(obj.scale.y), z: Math.abs(obj.scale.z) },
      mirror: !!item.mirror,
      seats,
    };
    // fish
    for (const fp of parts.get('fish') ?? []) {
      for (const f of fp.children) {
        if (!f.userData.fishRest) f.userData.fishRest = f.position.clone();
        inst.fish.push({ obj: f, target: f.position.clone(), speed: 0.06 + Math.random() * 0.08, phase: Math.random() * 10 });
      }
    }
    this.insts.set(item.id, inst);
    this.applyLight(inst);
    if (this.walking) this.enterInst(inst);
    // restore running devices after a rebuild (e.g. recolour)
    if (st.on.tv || st.on.game || st.on.computer) this.setScreen(inst, true);
  }

  updateItem(item: FurnitureItem): void {
    const inst = this.insts.get(item.id);
    if (inst) {
      inst.item = item;
      if (!inst.pet && !inst.ball) inst.restY = inst.holder.position.y;
    }
  }

  unregister(id: string, keepState = false): void {
    const inst = this.insts.get(id);
    if (!inst) return;
    this.stopInst(inst);
    this.insts.delete(id);
    if (!keepState) this.states.delete(id);
  }

  private applyLight(inst: Inst): void {
    if (!inst.def.light) return;
    if (this.lamps) inst.st.lightOn = this.lamps.isOn(inst.id);
    const on = inst.st.lightOn;
    if (inst.light) inst.light.intensity = on ? inst.lightBase * this.lampScale : 0;
    for (const g of inst.glow) g.mesh.material = on ? g.on : this.offMat(g.on);
  }

  /** dusk or dawn: lamps that nobody switched by hand follow the daylight */
  refreshLights(): void {
    for (const inst of this.insts.values()) this.applyLight(inst);
  }

  private offMat(m: THREE.Material): THREE.Material {
    let o = this.offMats.get(m);
    if (!o) {
      const c = m.clone() as THREE.MeshStandardMaterial;
      c.emissiveIntensity = 0.0;
      if (c.color) c.color.multiplyScalar(0.85);
      o = c;
      this.offMats.set(m, o);
    }
    return o;
  }

  // ---- walk mode -----------------------------------------------------------------------------

  enterWalk(walk: WalkController, world: WalkWorld): void {
    this.walk = walk;
    this.world = world;
    this.walking = true;
    for (const inst of this.insts.values()) this.enterInst(inst);
    walk.onChoose = (i) => this.choose(i);
  }

  setWorld(world: WalkWorld): void {
    this.world = world;
  }

  exitWalk(): void {
    this.walking = false;
    for (const inst of this.insts.values()) this.stopInst(inst);
    for (const p of this.projectiles) this.effects.remove(p.mesh);
    this.projectiles = [];
    for (const b of this.tempBalls) this.effects.remove(b.mesh);
    this.tempBalls = [];
    for (const list of this.darts.values()) list.forEach((d) => this.effects.remove(d));
    this.darts.clear();
    this.particles.clear();
    useWalk.getState().setChoices([]);
    useWalk.getState().set({ instrument: null, fade: 0 });
  }

  private enterInst(inst: Inst): void {
    const def = inst.def;
    inst.restY = inst.holder.position.y;
    inst.parentYaw = this.parentYaw(inst);
    const pose = this.pose(inst);
    if (has(def, 'pet')) {
      const v = inst.act.get('pet')?.variant ?? 'dog';
      inst.pet = {
        pos: { x: pose.x, y: pose.y },
        home: { x: pose.x, y: pose.y },
        heading: -pose.rot,
        mode: 'idle',
        target: null,
        timer: 1 + Math.random() * 3,
        phase: 0,
        speed: 0,
        happy: 0,
        follow: false,
        species: v,
        radius: Math.max(0.12, Math.min(def.size.w, def.size.d) * 0.5),
        noiseT: 4 + Math.random() * 8,
        stuck: 0,
        detour: 0,
        detourSide: 1,
        rest: 'idle',
        restT: 3,
      };
    }
    if (has(def, 'ball')) {
      const r = inst.size.w / 2;
      inst.ball = { floor: pose.floor, p: new THREE.Vector3(pose.x, pose.floor + inst.item.elevation + r, pose.y), v: new THREE.Vector3(), r };
    }
  }

  /** stop sounds / effects of an instance and put its parts and holder back */
  private stopInst(inst: Inst): void {
    for (const v of Object.values(inst.voices)) v?.stop();
    inst.voices = {};
    if (inst.fireLight) {
      inst.holder.remove(inst.fireLight);
      inst.fireLight.dispose();
      inst.fireLight = null;
    }
    const keepLight = inst.st.lightOn;
    inst.st.on = {};
    inst.st.openTarget = 0;
    inst.st.open = 0;
    inst.st.spinSpeed = 0;
    inst.st.lightOn = keepLight;
    this.setScreen(inst, false);
    for (const [o, r] of inst.rest) {
      o.position.copy(r.p);
      o.quaternion.copy(r.q);
      o.scale.copy(r.s);
    }
    inst.pet = null;
    inst.ball = null;
    inst.holder.position.set(inst.item.x, inst.restY, inst.item.y);
    inst.holder.rotation.set(0, -inst.item.rotation, 0);
    inst.obj.quaternion.identity();
  }

  // ---- geometry helpers ----------------------------------------------------------------------

  private world3(inst: Inst, x: number, y: number, z: number, out = new THREE.Vector3()): THREE.Vector3 {
    inst.holder.updateMatrixWorld(true);
    return inst.obj.localToWorld(out.set(x, y, z));
  }

  /** plan point of a local (x, z) */
  private plan(inst: Inst, x: number, z: number): Vec2 {
    const v = this.world3(inst, x, 0, z, tmpV);
    return { x: v.x, y: v.z };
  }

  private parentYaw(inst: Inst): number {
    const parent = inst.holder.parent;
    if (!parent) return 0;
    parent.updateWorldMatrix(true, false);
    const q = parent.getWorldQuaternion(new THREE.Quaternion());
    return new THREE.Euler().setFromQuaternion(q, 'YXZ').y;
  }

  /** where the item stands in the world (its rest place, in site coordinates) */
  private pose(inst: Inst): Pose {
    const parent = inst.holder.parent;
    const item = inst.item;
    if (!parent) return { x: item.x, y: item.y, floor: 0, rot: item.rotation };
    parent.updateWorldMatrix(true, false);
    const v = parent.localToWorld(new THREE.Vector3(item.x, inst.pet || inst.ball ? inst.restY : inst.holder.position.y, item.y));
    return { x: v.x, y: v.z, floor: v.y - item.elevation, rot: item.rotation - this.parentYaw(inst) };
  }

  /** place a holder at a world position / heading (pets, balls) */
  private placeHolder(inst: Inst, x: number, y: number, z: number, heading: number): void {
    const parent = inst.holder.parent;
    const v = new THREE.Vector3(x, y, z);
    if (parent) parent.worldToLocal(v);
    inst.holder.position.copy(v);
    inst.holder.rotation.set(0, heading - inst.parentYaw, 0);
  }

  /** world facing (character convention) of a local direction angle (0 = +Z) */
  private facingOf(inst: Inst, local: number): number {
    return (inst.mirror ? -local : local) - this.pose(inst).rot;
  }

  /**
   * How far the character is from what an action works on: the footprint for most items, the
   * action's own point (sink, hob…) on big pieces such as a whole kitchen.
   */
  private kindDist(inst: Inst, kind: ActionKind, footprint: number): number {
    const at = inst.act.get(kind)?.at;
    if (!at || !this.walk || Math.max(inst.size.w, inst.size.d) < 1.4 || inst.pet || inst.ball) return footprint;
    const p = this.world3(inst, at.x, 0, at.z, new THREE.Vector3());
    return Math.max(footprint, Math.hypot(p.x - this.walk.pos.x, p.z - this.walk.pos.y) - 0.45);
  }

  private floorOf(inst: Inst): number {
    return this.pose(inst).floor;
  }

  /** plan distance from p to the item's footprint */
  private footDist(inst: Inst, p: Vec2): number {
    const pose = inst.pet || inst.ball ? null : this.pose(inst);
    const pos = inst.pet ? inst.pet.pos : inst.ball ? { x: inst.ball.p.x, y: inst.ball.p.z } : { x: pose!.x, y: pose!.y };
    const rot = pose ? pose.rot : 0;
    // other floors are out of reach
    if (this.walk && Math.abs((inst.pet ? this.floorOf(inst) : inst.ball ? inst.ball.floor : pose!.floor) - this.walk.y) > 1.2) return 99;
    const c = Math.cos(-rot);
    const s = Math.sin(-rot);
    const rx = p.x - pos.x;
    const ry = p.y - pos.y;
    const lx = rx * c - ry * s;
    const ly = rx * s + ry * c;
    const dx = Math.max(0, Math.abs(lx) - inst.size.w / 2);
    const dy = Math.max(0, Math.abs(ly) - inst.size.d / 2);
    return Math.hypot(dx, dy);
  }

  private standInFront(inst: Inst, gap = 0.4): Vec2 {
    return this.plan(inst, 0, inst.lsize.d / 2 + gap / inst.k.z);
  }

  // ---- choices -------------------------------------------------------------------------------

  private choose(i: number): void {
    const c = this.choices[i];
    if (!c) return;
    sound.unlock();
    c.run();
    this.choiceT = 0;
  }

  /** run a choice clicked in the UI */
  run(id: string): void {
    const c = this.choices.find((x) => x.id === id);
    if (c) {
      sound.unlock();
      c.run();
      this.choiceT = 0;
    }
  }

  private buildChoices(): Choice[] {
    const walk = this.walk!;
    const out: Choice[] = [];
    const vehicle = walk.vehicleAction();
    if (walk.driving && vehicle) return [{ id: 'vehicle', label: vehicle.label, icon: '🚗', run: vehicle.run }];
    if (walk.occupation) {
      out.push({ id: 'end', label: 'לסיים', icon: ICON.stop!, run: () => walk.release() });
      return out;
    }
    if (walk.seat) {
      const s = walk.seat;
      out.push({ id: 'stand', label: 'לקום', icon: ICON.stand!, run: () => walk.standUp() });
      // remote control: TVs and music in the room
      for (const inst of this.insts.values()) {
        if (this.footDist(inst, walk.pos) > 6) continue;
        if (inst.act.has('tv') && inst.st.on.tv) out.push({ id: `${inst.id}:ch`, label: 'להחליף ערוץ (שלט)', icon: ICON.channel!, run: () => this.tvChannel(inst) });
        else if (inst.act.has('tv')) out.push({ id: `${inst.id}:tv`, label: 'להדליק טלוויזיה (שלט)', icon: ICON.tv!, run: () => this.toggleScreen(inst, 'tv') });
        if (inst.act.has('music') && inst.st.on.music) out.push({ id: `${inst.id}:st`, label: 'להחליף תחנה', icon: ICON.station!, run: () => this.nextStation(inst) });
      }
      if (walk.character.getProp() === 'book' && s.kind === 'sit') {
        const reading = walk.character.getActivity() === 'read';
        out.push({ id: 'read', label: reading ? 'להפסיק לקרוא' : 'לקרוא בספר', icon: ICON.read!, run: () => walk.character.setActivity(reading ? 'none' : 'read') });
      }
      for (const inst of this.insts.values()) {
        if (inst.act.has('computer') && this.footDist(inst, walk.pos) < 1.0) out.push({ id: `${inst.id}:pc`, label: 'לעבוד במחשב', icon: ICON.computer!, run: () => this.useComputer(inst) });
        if (inst.act.has('game') && this.footDist(inst, walk.pos) < 4 && textOf(inst.def).includes('קונסול')) out.push({ id: `${inst.id}:gm`, label: 'לשחק במשחק וידאו', icon: ICON.game!, run: () => this.consoleGame(inst) });
      }
      return out.slice(0, 4);
    }
    const p = walk.pos;
    if (vehicle) out.push({ id: 'vehicle', label: vehicle.label, icon: '🚲', run: vehicle.run });
    const seat = walk.nearestSeat();
    if (seat) out.push({ id: `seat:${seat.pos.x.toFixed(2)},${seat.pos.y.toFixed(2)}`, label: `${seat.kind === 'lie' ? 'לשכב' : 'לשבת'} · ${seat.name}`, icon: seat.kind === 'lie' ? ICON.lie! : ICON.sit!, run: () => walk.sitOn(seat) });
    const cands: Array<{ d: number; c: Choice }> = [];
    for (const inst of this.insts.values()) {
      if (!inst.act.size && !inst.def.ride) continue;
      const d = this.footDist(inst, p);
      // switches of lamps (ceiling ones are always "near") rank below everything else
      for (const c of this.choicesFor(inst, d)) cands.push({ d: c.id.endsWith(':light') ? d + (inst.def.mount === 'ceiling' ? 2 : 0.8) : d, c });
    }
    cands.sort((a, b) => a.d - b.d);
    for (const c of cands) {
      if (out.length >= 4) break;
      if (!out.some((o) => o.id === c.c.id)) out.push(c.c);
    }
    if (walk.character.getProp() === 'book' && out.length < 4) out.push({ id: 'drop-book', label: 'להניח את הספר', icon: ICON.read!, run: () => walk.character.setProp('none') });
    return out;
  }

  private choicesFor(inst: Inst, d0: number): Choice[] {
    const out: Choice[] = [];
    const name = inst.def.name;
    const id = inst.id;
    const on = inst.st.on;
    const mk = (k: string, label: string, icon: string, run: () => void) => out.push({ id: `${id}:${k}`, label, icon, run });
    if (inst.def.ride && d0 < 0.9) mk('ride', inst.def.ride.prompt, ICON.swing!, () => this.ride(inst));
    for (const kind of inst.act.keys()) {
      const d = this.kindDist(inst, kind, d0);
      const near = d < 0.9;
      switch (kind) {
        case 'light':
          if (d < 1.3) mk('light', inst.st.lightOn ? `לכבות · ${name}` : `להדליק · ${name}`, ICON.light!, () => this.toggleLight(inst));
          break;
        case 'tv':
          if (d < 2.5) {
            if (on.tv) {
              mk('ch', 'להחליף ערוץ', ICON.channel!, () => this.tvChannel(inst));
              mk('tv', 'לכבות טלוויזיה', ICON.tv!, () => this.toggleScreen(inst, 'tv'));
            } else mk('tv', 'להדליק טלוויזיה', ICON.tv!, () => this.toggleScreen(inst, 'tv'));
          }
          break;
        case 'computer':
          if (near) mk('pc', 'לעבוד במחשב', ICON.computer!, () => this.useComputer(inst));
          break;
        case 'game':
          if (near) mk('game', `לשחק · ${name}`, ICON.game!, () => (textOf(inst.def).includes('קונסול') ? this.consoleGame(inst) : this.arcade(inst)));
          break;
        case 'music':
          if (d < 1.5) {
            if (on.music) {
              mk('st', 'להחליף תחנה', ICON.station!, () => this.nextStation(inst));
              mk('music', 'לכבות מוזיקה', ICON.stop!, () => this.toggleMusic(inst));
            } else mk('music', `להפעיל מוזיקה · ${name}`, ICON.music!, () => this.toggleMusic(inst));
          }
          break;
        case 'piano':
        case 'guitar':
        case 'drums':
          if (near) mk(kind, kind === 'piano' ? 'לנגן בפסנתר' : kind === 'guitar' ? 'לנגן בגיטרה' : 'לנגן בתופים', ICON[kind]!, () => this.instrument(inst, kind));
          break;
        case 'fan':
          if (d < 1.3) mk('fan', on.fan ? 'לכבות מאוורר' : 'להפעיל מאוורר', ICON.fan!, () => this.toggle(inst, 'fan'));
          break;
        case 'fire':
          if (near) mk('fire', on.fire ? 'לכבות את האש' : inst.act.get('fire')?.variant === 'candle' ? 'להדליק נר' : 'להדליק אש', ICON.fire!, () => this.toggle(inst, 'fire'));
          break;
        case 'water':
          if (near) mk('water', on.water ? 'לסגור את המים' : textOf(inst.def).match(/מקלחת|shower/) ? 'להתקלח' : 'לפתוח מים', ICON.water!, () => this.toggle(inst, 'water'));
          break;
        case 'cook':
          if (near) mk('cook', 'לבשל ארוחה', ICON.cook!, () => this.cook(inst));
          break;
        case 'snack':
          if (near) mk('snack', this.snackLabel(inst), ICON.snack!, () => this.snack(inst));
          break;
        case 'open':
          if (near) mk('open', inst.st.openTarget > 0.5 ? 'לסגור' : `לפתוח · ${name}`, ICON.open!, () => this.toggleOpen(inst));
          break;
        case 'sleep':
          if (d < 0.8) mk('sleep', 'ללכת לישון', ICON.sleep!, () => this.sleep(inst));
          break;
        case 'read':
          if (near && this.walk!.character.getProp() !== 'book') mk('read', 'לקחת ספר לקריאה', ICON.read!, () => this.takeBook());
          break;
        case 'run':
        case 'pedal':
        case 'row':
          if (near) mk(kind, kind === 'run' ? 'לרוץ' : kind === 'pedal' ? 'לרכוב' : 'לחתור', ICON[kind]!, () => this.exercise(inst, kind));
          break;
        case 'workout':
          if (near) mk('workout', 'להתאמן', ICON.workout!, () => this.workout(inst));
          break;
        case 'bounce':
          if (near) mk('bounce', 'לקפוץ על הטרמפולינה', ICON.bounce!, () => this.bounce(inst));
          break;
        case 'swing':
          if (d < 0.7 && inst.seats.length) mk('swing', 'להתנדנד', ICON.swing!, () => this.swing(inst, 'swing'));
          break;
        case 'rock':
          if (d < 0.7 && inst.seats.length) mk('rock', 'לשבת ולהתנדנד', ICON.rock!, () => this.swing(inst, 'rock'));
          break;
        case 'slide':
          if (d < 1.2) mk('slide', 'לגלוש במגלשה', ICON.slide!, () => this.slide(inst));
          break;
        case 'ball':
          if (d < 0.9) mk('ball', 'לבעוט בכדור', ICON.ball!, () => this.kickBall(inst, 8));
          break;
        case 'hoop':
          if (d < 7) mk('hoop', 'לזרוק לסל', ICON.hoop!, () => this.shootHoop(inst));
          break;
        case 'darts':
          if (d < 4) mk('darts', 'לזרוק חץ', ICON.darts!, () => this.throwDart(inst));
          break;
        case 'pet':
          if (d < 1.4) {
            mk('pet', `ללטף · ${name}`, ICON.pet!, () => this.petIt(inst));
            mk('follow', inst.pet?.follow ? 'שיישאר כאן' : 'שיבוא אחריי', ICON.follow!, () => this.toggleFollow(inst));
          }
          break;
        case 'fish':
          if (near) mk('fish', 'להאכיל את הדגים', ICON.fish!, () => this.feedFish(inst));
          break;
        case 'play':
          if (near) mk('play', `לשחק · ${name}`, ICON.play!, () => this.playGame(inst));
          break;
        case 'clock':
          break;
      }
    }
    return out;
  }

  // ---- simple toggles ------------------------------------------------------------------------

  private toggleLight(inst: Inst): void {
    if (this.lamps) this.lamps.toggle(inst.id);
    else inst.st.lightOn = !inst.st.lightOn;
    this.applyLight(inst);
    sound.sfx('switch');
    report('light-switched');
  }

  private toggle(inst: Inst, kind: ActionKind): void {
    const on = !inst.st.on[kind];
    inst.st.on[kind] = on;
    if (on && kind === 'water') report('water-used');
    sound.sfx(kind === 'fire' ? 'pop' : 'switch', 0.6);
    const key = kind;
    inst.voices[key]?.stop();
    delete inst.voices[key];
    if (kind === 'fire') {
      if (on) {
        const a = inst.act.get('fire')!;
        const small = a.variant === 'candle' || inst.size.w < 0.4;
        if (!small) inst.voices[key] = sound.loop('fire') ?? undefined;
        const l = new THREE.PointLight('#ff9a4a', small ? 0.6 : 3, small ? 3 : 7, 2);
        const at = a.at ?? { x: 0, y: inst.lsize.h * 0.4, z: 0 };
        l.position.set(at.x, at.y + 0.1 + inst.obj.position.y, at.z + 0.1);
        inst.holder.add(l);
        inst.fireLight = l;
        this.walk?.playFor('feed', 0.8);
      } else if (inst.fireLight) {
        inst.holder.remove(inst.fireLight);
        inst.fireLight.dispose();
        inst.fireLight = null;
      }
    } else if (kind === 'water') {
      if (on) {
        inst.voices[key] = sound.loop('water') ?? undefined;
        inst.waterStop = this.waterFloor(inst);
        sound.sfx('splash', 0.3);
      }
    } else if (kind === 'fan') {
      if (on) inst.voices[key] = sound.loop('fan') ?? undefined;
    }
  }

  private waterFloor(inst: Inst): number {
    const a = inst.act.get('water')?.at;
    if (!a) return this.floorOf(inst) + inst.item.elevation;
    const from = this.world3(inst, a.x, a.y - 0.03, a.z);
    const rc = new THREE.Raycaster(from, new THREE.Vector3(0, -1, 0), 0, 4);
    const hit = rc.intersectObject(inst.obj, true)[0];
    return hit ? hit.point.y + 0.01 : this.floorOf(inst) + inst.item.elevation;
  }

  private setScreen(inst: Inst, on: boolean, ch?: Channel): void {
    if (inst.screenCh) {
      this.screens.release(inst.screenCh);
      inst.screenCh = null;
    }
    if (!on) {
      for (const s of inst.screens) s.mesh.material = s.orig;
      return;
    }
    const channel: Channel =
      ch ??
      (inst.st.on.computer ? 'desktop' : inst.st.on.game ? (textOf(inst.def).match(/arcade|pinball|ארקייד|פינבול/) ? 'arcade' : 'game') : TV_CHANNELS[inst.st.channel % TV_CHANNELS.length].id);
    const mat = this.screens.material(channel);
    inst.screenCh = channel;
    for (const s of inst.screens) s.mesh.material = mat;
  }

  private toggleScreen(inst: Inst, kind: 'tv' | 'game' | 'computer', force?: boolean): void {
    const on = force ?? !inst.st.on[kind];
    inst.st.on[kind] = on;
    inst.voices[kind]?.stop();
    delete inst.voices[kind];
    this.setScreen(inst, on);
    sound.sfx('switch', 0.6);
    if (on && kind === 'tv') {
      report('tv-watched');
      inst.voices[kind] = sound.loop('tv') ?? undefined;
      useWalk.getState().toast(`📺 ${TV_CHANNELS[inst.st.channel % TV_CHANNELS.length].name}`);
    }
    if (!inst.screens.length && on) useWalk.getState().toast('📺 (לפריט הזה אין מסך מונפש)');
  }

  private tvChannel(inst: Inst): void {
    inst.st.channel = (inst.st.channel + 1) % TV_CHANNELS.length;
    this.setScreen(inst, true);
    sound.sfx('click');
    useWalk.getState().toast(`📺 ערוץ ${inst.st.channel + 1}: ${TV_CHANNELS[inst.st.channel].name}`);
  }

  private toggleMusic(inst: Inst): void {
    const on = !inst.st.on.music;
    inst.st.on.music = on;
    inst.voices.music?.stop();
    delete inst.voices.music;
    sound.sfx('click');
    if (on) this.startMusic(inst);
  }

  private startMusic(inst: Inst): void {
    const st = STATIONS[inst.st.station % STATIONS.length];
    inst.voices.music = sound.music(st.id, (s) => (inst.st.beat = s)) ?? undefined;
    useWalk.getState().toast(`🎵 ${st.name}`);
  }

  private nextStation(inst: Inst): void {
    inst.st.station = (inst.st.station + 1) % STATIONS.length;
    inst.voices.music?.stop();
    this.startMusic(inst);
  }

  private toggleOpen(inst: Inst): void {
    inst.st.openTarget = inst.st.openTarget > 0.5 ? 0 : 1;
    sound.sfx('door', 0.6);
  }

  private snackLabel(inst: Inst): string {
    const t = textOf(inst.def);
    if (/קפה|espresso|coffee/.test(t)) return 'להכין קפה';
    if (/קומקום|kettle|תה|tea/.test(t)) return 'להכין תה';
    if (/מקרר|fridge/.test(t)) return 'לקחת חטיף מהמקרר';
    if (/יין|wine/.test(t)) return 'למזוג כוס';
    if (/מים|water/.test(t)) return 'לשתות מים';
    return `לנשנש · ${inst.def.name}`;
  }

  private snack(inst: Inst): void {
    const walk = this.walk!;
    const t = textOf(inst.def);
    const drink = /קפה|coffee|espresso|קומקום|kettle|תה|tea|יין|wine|מים|water|כוס/.test(t);
    walk.faceTo(this.pose(inst));
    if (inst.parts.has('door')) {
      inst.st.openTarget = 1;
      setTimeout(() => (inst.st.openTarget = 0), 2200);
    }
    const brew = /קפה|coffee|espresso|קומקום|kettle/.test(t);
    if (brew) {
      sound.sfx('sizzle', 0.4);
      const top = this.world3(inst, 0, inst.lsize.h, 0);
      for (let i = 0; i < 6; i++) setTimeout(() => this.particles.emit('steam', top, { count: 2, spread: 0.05 }), i * 250);
    }
    setTimeout(() => {
      walk.playFor(drink ? 'drink' : 'eat', 3.5, drink ? 'cup' : 'apple');
      sound.sfx(drink ? 'sip' : 'chomp');
      if (!drink) {
        const h = walk.character.headWorld();
        for (let i = 0; i < 3; i++) setTimeout(() => this.particles.emit('crumb', h, { count: 4, spread: 0.08 }), 500 + i * 900);
      }
      useWalk.getState().toast(drink ? '☕ אחח, בדיוק מה שהייתי צריך' : '🍎 יאמי!');
    }, brew ? 1500 : 200);
  }

  private takeBook(): void {
    this.walk!.character.setProp('book');
    sound.sfx('page');
    useWalk.getState().toast('📖 לקחת ספר – שבו על ספה או כורסה כדי לקרוא');
  }

  private useComputer(inst: Inst): void {
    const walk = this.walk!;
    inst.st.on.computer = true;
    this.setScreen(inst, true, 'desktop');
    if (!walk.seat) walk.faceTo(this.pose(inst));
    walk.playFor('type', 12);
    const clackT = setInterval(() => sound.sfx('clack', 0.25), 140);
    setTimeout(() => clearInterval(clackT), 3000);
  }

  private consoleGame(inst: Inst): void {
    const walk = this.walk!;
    // the screen in the room shows the game
    for (const tv of this.insts.values()) {
      if ((tv.act.has('tv') || tv === inst) && tv.screens.length && this.footDist(tv, walk.pos) < 6) {
        tv.st.on.game = true;
        this.setScreen(tv, true, 'game');
      }
    }
    walk.playFor('game', 15, 'controller');
    setTimeout(() => {
      sound.sfx('score');
      useWalk.getState().toast(`🎮 עלית שלב! ניקוד: ${(1000 + Math.floor(Math.random() * 9000)).toLocaleString()}`);
    }, 6000);
  }

  // ---- occupations ---------------------------------------------------------------------------

  /** a standing/sitting occupation at a fixed spot */
  private stay(frame: OccupationFrame, o: Omit<Occupation, 'frame'> & { frame?: (dt: number, f: OccupationFrame) => OccupationFrame | null }): Occupation {
    const user = o.frame;
    return { ...o, frame: (dt) => (user ? user(dt, frame) : frame) };
  }

  private instrument(inst: Inst, kind: 'piano' | 'guitar' | 'drums'): void {
    const walk = this.walk!;
    const seat = inst.seats[0];
    let frame: OccupationFrame;
    if (seat && kind !== 'guitar') {
      const p = this.plan(inst, seat.x, seat.z);
      frame = { x: p.x, y: p.y, floor: this.floorOf(inst), facing: this.facingOf(inst, seat.facing), pose: 'sit', seatHeight: seat.height * inst.k.y + inst.item.elevation };
    } else if (kind === 'guitar') {
      const p = this.standInFront(inst, 0.45);
      frame = { x: p.x, y: p.y, floor: this.floorOf(inst), facing: this.facingOf(inst, 0), pose: 'stand' };
    } else {
      const p = this.standInFront(inst, 0.3);
      frame = { x: p.x, y: p.y, floor: this.floorOf(inst), facing: this.facingOf(inst, Math.PI), pose: 'stand' };
    }
    const keyFn = (code: string, down: boolean): boolean => {
      if (!down) return code in PIANO_KEYS || code in GUITAR_CHORDS || code in DRUM_KEYS;
      return this.instrumentKey(kind, code);
    };
    walk.occupy(
      this.stay(frame, {
        activity: kind,
        prop: kind === 'guitar' ? 'guitar' : 'none',
        key: keyFn,
        lockMovement: true,
        label: kind === 'piano' ? 'מנגנים בפסנתר: מקשי A–L (ושורת QWERTY לדיאזים)' : kind === 'guitar' ? 'מנגנים בגיטרה: A–K אקורדים' : 'מתופפים: A–K',
        onEnd: () => useWalk.getState().set({ instrument: null }),
        exit: this.standInFront(inst, 0.6),
      }),
    );
    useWalk.getState().set({ instrument: kind });
  }

  /** play an instrument key (keyboard or on-screen); returns true if the key belongs to it */
  instrumentKey(kind: 'piano' | 'guitar' | 'drums', code: string): boolean {
    const walk = this.walk;
    if (kind === 'piano' && code in PIANO_KEYS) {
      const m = PIANO_KEYS[code];
      sound.piano(m, 0.85);
      report('piano-note');
      walk?.character.strike(m < 67 ? 1 : -1);
    } else if (kind === 'guitar' && code in GUITAR_CHORDS) {
      sound.guitarChord(GUITAR_CHORDS[code].notes);
      walk?.character.strike(-1);
    } else if (kind === 'drums' && code in DRUM_KEYS) {
      const d = DRUM_KEYS[code];
      sound.drum(d.kind);
      walk?.character.strike(d.side);
    } else return false;
    useWalk.getState().set({ pressed: code });
    if (walk && Math.random() < 0.35) this.particles.emit('note', walk.character.headWorld().add(new THREE.Vector3(0, 0.25, 0)), { count: 1 });
    return true;
  }

  private cook(inst: Inst): void {
    const walk = this.walk!;
    const p = this.standInFront(inst, 0.35);
    const at = inst.act.get('cook')?.at ?? { x: 0, y: inst.lsize.h, z: 0 };
    let t = 0;
    let done = false;
    sound.sfx('sizzle', 0.6);
    walk.occupy(
      this.stay(
        { x: p.x, y: p.y, floor: this.floorOf(inst), facing: this.facingOf(inst, Math.PI), pose: 'stand' },
        {
          activity: 'cook',
          prop: 'spoon',
          label: 'מבשלים…',
          frame: (dt, f) => {
            t += dt;
            if (Math.random() < dt * 8) this.particles.emit('steam', this.world3(inst, at.x, at.y + 0.05, at.z), { count: 1, spread: 0.12 });
            if (Math.random() < dt * 0.8) sound.sfx('sizzle', 0.3);
            if (t > 7 && !done) {
              done = true;
              sound.sfx('ding');
              const dishes = ['🍝 פסטה ברוטב עגבניות', '🥘 שקשוקה', '🍲 מרק ירקות', '🥞 פנקייקים', '🍛 קארי'];
              useWalk.getState().toast(`${dishes[Math.floor(Math.random() * dishes.length)]} – מוכן! בתיאבון`);
              return null;
            }
            return f;
          },
        },
      ),
    );
  }

  private sleep(inst: Inst): void {
    const walk = this.walk!;
    const seat = inst.seats.find((s) => s.kind === 'lie') ?? inst.seats[0];
    if (!seat) return;
    const p = this.plan(inst, seat.x, seat.z);
    let t = 0;
    let woke = false;
    walk.occupy(
      this.stay(
        { x: p.x, y: p.y, floor: this.floorOf(inst), facing: this.facingOf(inst, seat.facing), pose: 'lie', seatHeight: seat.height * inst.k.y + inst.item.elevation },
        {
          activity: 'sleep',
          label: 'ישנים… Zzz',
          frame: (dt, f) => {
            t += dt;
            const ws = useWalk.getState();
            if (t > 1.2 && t < 4.5) ws.set({ fade: Math.min(0.92, (t - 1.2) / 1.2) });
            if (t > 1.5 && Math.random() < dt * 1.5) this.particles.emit('zzz', walk.character.headWorld().add(new THREE.Vector3(0, 0.2, 0)));
            if (t > 1.5 && Math.random() < dt * 0.3) sound.sfx('snore', 0.6);
            if (t > 3.2 && !woke) {
              woke = true;
              report('slept');
              this.onSleep();
            }
            if (t >= 4.5) ws.set({ fade: Math.max(0, 0.92 - (t - 4.5) / 1.2) });
            return f;
          },
          onEnd: () => useWalk.getState().set({ fade: 0 }),
        },
      ),
    );
  }

  private exercise(inst: Inst, kind: 'run' | 'pedal' | 'row'): void {
    const walk = this.walk!;
    const a = inst.act.get(kind)!;
    const at = a.at ?? { x: 0, y: kind === 'run' ? 0.2 : 0.6, z: 0 };
    const p = this.plan(inst, at.x, at.z);
    const voice = sound.loop('motor');
    inst.voices[kind] = voice ?? undefined;
    inst.st.spinSpeed = kind === 'run' ? 9 : kind === 'pedal' ? 7 : 4;
    let t = 0;
    let kcal = 0;
    walk.occupy(
      this.stay(
        {
          x: p.x,
          y: p.y,
          floor: this.floorOf(inst),
          facing: this.facingOf(inst, Math.PI),
          pose: kind === 'run' ? 'stand' : 'sit',
          seatHeight: at.y + inst.item.elevation,
          lift: kind === 'run' ? at.y + inst.item.elevation : 0,
          speed: 0,
        },
        {
          activity: kind,
          label: kind === 'run' ? 'רצים על ההליכון' : kind === 'pedal' ? 'רוכבים' : 'חותרים',
          frame: (dt, f) => {
            t += dt;
            voice?.setVolume(0.35);
            if (t > 5) {
              t = 0;
              kcal += 12 + Math.floor(Math.random() * 8);
              useWalk.getState().toast(`🔥 ${kcal} קלוריות`);
            }
            return f;
          },
          onEnd: () => {
            inst.voices[kind]?.stop();
            delete inst.voices[kind];
            inst.st.spinSpeed = 0;
          },
        },
      ),
    );
  }

  private workout(inst: Inst): void {
    const walk = this.walk!;
    const t = textOf(inst.def);
    const a = inst.act.get('workout')!;
    const activity: Activity = /punch|bag|אגרוף|שק/.test(t) ? 'punch' : /yoga|mat|יוגה|מזרן/.test(t) ? 'yoga' : /bar|wall|מתח|סולם/.test(t) ? 'stretch' : 'lift';
    const at = a.at ?? { x: 0, y: 0, z: inst.lsize.d / 2 + 0.4 / inst.k.z };
    const p = this.plan(inst, at.x, at.z);
    let n = 0;
    let acc = 0;
    walk.occupy(
      this.stay(
        { x: p.x, y: p.y, floor: this.floorOf(inst), facing: this.facingOf(inst, Math.PI), pose: 'stand', lift: Math.max(0, at.y) },
        {
          activity,
          prop: activity === 'lift' ? 'dumbbells' : 'none',
          label: 'מתאמנים',
          frame: (dt, f) => {
            acc += dt;
            if (acc > (activity === 'punch' ? 0.39 : 1.96)) {
              acc = 0;
              n++;
              if (activity === 'punch') sound.sfx('kick', 0.6);
              if (n % 10 === 0) useWalk.getState().toast(`💪 ${n} חזרות!`);
            }
            return f;
          },
        },
      ),
    );
  }

  private bounce(inst: Inst): void {
    const walk = this.walk!;
    const at = inst.act.get('bounce')?.at ?? { x: 0, y: 0.6, z: 0 };
    const floor = this.floorOf(inst);
    const p = this.plan(inst, at.x, at.z);
    let t = 0;
    let amp = 0.4;
    let flips = 0;
    let wantFlip = false;
    let lastLand = 0;
    const period = 0.95;
    walk.occupy({
      activity: 'bounce',
      label: 'קופצים! רווח = סלטה',
      key: (code, down) => {
        if (code === 'Space' && down) {
          wantFlip = true;
          return true;
        }
        return false;
      },
      exit: this.standInFront(inst, 0.5),
      frame: (dt) => {
        t += dt;
        const ph = (t % period) / period;
        const cycle = Math.floor(t / period);
        if (cycle !== lastLand) {
          lastLand = cycle;
          amp = Math.min(1.4, amp + 0.15);
          sound.sfx('bounce', 0.5);
          report('bounced');
          if (wantFlip) {
            wantFlip = false;
            flips++;
            walk.character.setActivity('flip');
            sound.sfx('whoosh');
            if (flips % 3 === 0) useWalk.getState().toast(`🤸 ${flips} סלטות!`);
          }
        }
        const h = 4 * amp * ph * (1 - ph);
        return { x: p.x, y: p.y, floor, facing: walk.facing, pose: 'stand', lift: at.y + inst.item.elevation + h };
      },
    });
  }

  /** ride a swing / rocking part with a seat */
  private swing(inst: Inst, kind: 'swing' | 'rock'): void {
    const walk = this.walk!;
    const seats = inst.seats;
    if (!seats.length) return;
    // nearest seat to the character
    let seat = seats[0];
    let best = Infinity;
    for (const s of seats) {
      const p = this.plan(inst, s.x, s.z);
      const d = Math.hypot(p.x - walk.pos.x, p.y - walk.pos.y);
      if (d < best) {
        best = d;
        seat = s;
      }
    }
    const parts = inst.parts.get(kind) ?? [];
    let part: THREE.Object3D | null = null;
    best = Infinity;
    for (const pt of parts) {
      const r = inst.rest.get(pt)!;
      const d = Math.abs(r.p.x - seat.x) + Math.abs(r.p.z - seat.z) * 0.3;
      if (d < best) {
        best = d;
        part = pt;
      }
    }
    const pivot = part ? inst.rest.get(part)!.p.clone() : new THREE.Vector3(0, 0, 0);
    const L = Math.max(0.3, pivot.y - seat.height);
    const seesaw = /seesaw|נדנדה מאזניים|מתנדנדה/.test(textOf(inst.def)) || (kind === 'rock' && Math.abs(seat.z) > 0.8);
    let t = 0;
    let amp = kind === 'swing' ? 0.15 : seesaw ? 0.22 : 0.12;
    const omega = kind === 'swing' ? Math.sqrt(9.8 / L) : seesaw ? 2.2 : 2.6;
    const seatLocal = new THREE.Vector3(seat.x, seat.height, seat.z);
    const sp = new THREE.Vector3();
    const tiltSign = Math.cos(seat.facing);
    const exitP = this.plan(inst, seat.x + Math.sin(seat.facing) * 0.7, seat.z + Math.cos(seat.facing) * 0.7);
    const floor = this.floorOf(inst);
    walk.occupy({
      activity: kind === 'swing' && seat.kind !== 'lie' ? 'swing' : 'none',
      label: kind === 'swing' ? 'מתנדנדים!' : 'מתנדנדים',
      exit: exitP,
      frame: (dt) => {
        t += dt;
        if (kind === 'swing') amp = Math.min(0.75, amp + dt * 0.06);
        const th = amp * Math.sin(t * omega);
        if (part) {
          const r = inst.rest.get(part)!;
          part.quaternion.copy(r.q).multiply(tmpQ.setFromAxisAngle(AX, th));
        }
        if (seesaw && part) {
          // the whole board rocks: both ends move
        }
        sp.copy(seatLocal).sub(pivot).applyAxisAngle(AX, th).add(pivot);
        const w = this.world3(inst, sp.x, sp.y, sp.z);
        if (kind === 'swing' && Math.abs(Math.sin(t * omega)) > 0.995 && Math.random() < 0.08) sound.sfx('squeak', 0.3);
        return {
          x: w.x,
          y: w.z,
          floor,
          facing: this.facingOf(inst, seat.facing),
          pose: seat.kind === 'lie' ? 'lie' : 'sit',
          seatHeight: seat.height * inst.k.y + inst.item.elevation,
          lift: w.y - floor - (seat.height * inst.k.y + inst.item.elevation),
          tilt: th * tiltSign,
        };
      },
      onEnd: () => {
        if (part) part.quaternion.copy(inst.rest.get(part)!.q);
      },
    });
    if (kind === 'swing') useWalk.getState().toast('🎠 ווהו!');
    report('swung');
  }

  /** play equipment that simulates itself (carousel, seesaw, spring rider…): sit on the nearest seat */
  private ride(inst: Inst): void {
    const walk = this.walk!;
    const rt = (inst.obj.userData.ride ?? inst.holder.userData.body?.userData.ride) as RideRuntime | undefined;
    if (!rt || !rt.seatNodes.length) return;
    let index = 0;
    let best = Infinity;
    rt.seatNodes.forEach((n, i) => {
      n.getWorldPosition(tmpV);
      const d = Math.hypot(tmpV.x - walk.pos.x, tmpV.z - walk.pos.y);
      if (d < best) {
        best = d;
        index = i;
      }
    });
    const node = rt.seatNodes[index];
    const floor = this.floorOf(inst);
    const q = new THREE.Quaternion();
    const v = new THREE.Vector3();
    const dir = new THREE.Vector3();
    let pushing = false;
    let squeak = 0;
    this.coasting.delete(rt);
    const SEAT = 0.45;
    walk.occupy({
      activity: 'swing',
      label: 'W – חזק יותר!',
      lockMovement: true,
      key: (code, down) => {
        if (code === 'KeyW' || code === 'ArrowUp') {
          pushing = down;
          return true;
        }
        if (down && (code === 'KeyS' || code === 'ArrowDown' || code === 'KeyE')) {
          walk.release();
          return true;
        }
        return false;
      },
      frame: (dt) => {
        // a gentle push by itself; W pumps for real
        const moving = rt.update(dt, pushing ? 1 : 0.35, [index]);
        squeak -= dt;
        if (moving && squeak <= 0 && Math.random() < 0.05) {
          squeak = 1.2;
          sound.sfx('squeak', 0.2);
        }
        node.updateWorldMatrix(true, false);
        node.getWorldPosition(v);
        node.getWorldQuaternion(q);
        dir.set(0, 0, 1).applyQuaternion(q);
        // forward pitch of the seat (swings tilt the rider with them)
        const tilt = -Math.asin(Math.max(-1, Math.min(1, dir.y)));
        return { x: v.x, y: v.z, floor, facing: Math.atan2(dir.x, dir.z), pose: 'sit', seatHeight: SEAT, lift: v.y - floor - SEAT, tilt };
      },
      onEnd: () => {
        this.coasting.add(rt);
        const p = { x: walk.pos.x, y: walk.pos.y };
        const out = this.standInFront(inst, 0.45);
        // step off away from the equipment
        const dx = p.x - this.pose(inst).x;
        const dy = p.y - this.pose(inst).y;
        const l = Math.hypot(dx, dy);
        walk.pos = l > 0.2 ? { x: p.x + (dx / l) * 0.7, y: p.y + (dy / l) * 0.7 } : out;
      },
    });
    report('swung');
    useWalk.getState().toast('🎠 ווהו!');
  }

  private slide(inst: Inst): void {
    const walk = this.walk!;
    const path = inst.act.get('slide')?.path;
    if (!path || path.length < 2) return;
    const pts = path.map((q) => this.world3(inst, q.x, q.y, q.z).clone());
    const lens: number[] = [0];
    for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + pts[i].distanceTo(pts[i - 1]));
    const total = lens[lens.length - 1];
    const start = { x: pts[0].x, y: pts[0].z };
    let t = 0;
    let s = 0;
    let v = 0.5;
    let whooshed = false;
    const dir = new THREE.Vector3().subVectors(pts[pts.length - 1], pts[0]);
    const facing = Math.atan2(dir.x, dir.z);
    const end = pts[pts.length - 1];
    const exit = { x: end.x + Math.sin(facing) * 0.6, y: end.z + Math.cos(facing) * 0.6 };
    const floor = this.floorOf(inst);
    walk.occupy({
      activity: 'slide',
      label: 'גולשים!',
      exit,
      frame: (dt) => {
        t += dt;
        if (t < 0.9) {
          // climb up
          const k = t / 0.9;
          return { x: start.x, y: start.y, floor, facing, pose: 'stand', lift: Math.max(0, pts[0].y - floor - 0.3) * k };
        }
        if (!whooshed) {
          whooshed = true;
          sound.sfx('whoosh');
        }
        v = Math.min(5, v + dt * 6);
        s += v * dt;
        if (s >= total) {
          useWalk.getState().toast('🛝 ווהווו!');
          report('slid');
          return null;
        }
        let i = 1;
        while (i < lens.length - 1 && lens[i] < s) i++;
        const k = (s - lens[i - 1]) / Math.max(1e-6, lens[i] - lens[i - 1]);
        const p = pts[i - 1].clone().lerp(pts[i], k);
        const seg = new THREE.Vector3().subVectors(pts[i], pts[i - 1]);
        const tilt = -Math.atan2(-seg.y, Math.hypot(seg.x, seg.z)) * 0.6;
        return { x: p.x, y: p.z, floor, facing, pose: 'sit', seatHeight: 0.02, lift: p.y - floor, tilt };
      },
    });
  }

  private arcade(inst: Inst): void {
    const walk = this.walk!;
    const p = this.standInFront(inst, 0.3);
    inst.st.on.game = true;
    this.setScreen(inst, true);
    let t = 0;
    let beep = 0;
    walk.occupy(
      this.stay(
        { x: p.x, y: p.y, floor: this.floorOf(inst), facing: this.facingOf(inst, Math.PI), pose: 'stand' },
        {
          activity: 'game',
          label: 'משחקים!',
          frame: (dt, f) => {
            t += dt;
            beep += dt;
            if (beep > 0.25) {
              beep = 0;
              if (Math.random() < 0.6) sound.sfx(Math.random() < 0.5 ? 'pop' : 'click', 0.3);
            }
            if (t > 8) {
              t = 0;
              sound.sfx('score');
              const score = 1000 + Math.floor(Math.random() * 30000);
              useWalk.getState().addScore(Math.floor(score / 1000));
              useWalk.getState().toast(`🕹️ שיא חדש! ${score.toLocaleString()}`);
            }
            return f;
          },
          onEnd: () => {
            inst.st.on.game = false;
            this.setScreen(inst, false);
          },
        },
      ),
    );
  }

  private playGame(inst: Inst): void {
    const walk = this.walk!;
    const t = textOf(inst.def);
    const a = inst.act.get('play')!;
    const at = a.at ?? { x: 0, y: 0, z: inst.lsize.d / 2 + 0.3 / inst.k.z };
    const p = this.plan(inst, at.x, at.z);
    const prop: Prop = /pool|billiard|ביליארד|סנוקר/.test(t) ? 'cue' : /ping|pong|טניס שולחן|פינג/.test(t) ? 'paddle' : 'none';
    const center = this.pose(inst);
    let time = 0;
    let hits = 0;
    if (inst.parts.has('spin')) inst.st.spinSpeed = 2.5;
    walk.occupy(
      this.stay(
        { x: p.x, y: p.y, floor: center.floor, facing: Math.atan2(center.x - p.x, center.y - p.y), pose: 'stand' },
        {
          activity: /שחמט|chess|קלפים|poker|cards/.test(t) ? 'type' : 'play',
          prop,
          label: `משחקים · ${inst.def.name}`,
          frame: (dt, f) => {
            time += dt;
            if (time > 1.1) {
              time = 0;
              hits++;
              sound.sfx(prop === 'cue' ? 'clack' : prop === 'paddle' ? 'pop' : 'clack', 0.5);
              if (hits % 6 === 0) {
                const win = Math.random() < 0.55;
                sound.sfx(win ? 'cheer' : 'miss', 0.7);
                if (win) {
                  useWalk.getState().addScore(5);
                  this.particles.emit('confetti', this.world3(inst, 0, inst.lsize.h + 0.3 / inst.k.y, 0), { count: 40 });
                }
                useWalk.getState().toast(win ? '🏆 ניצחת את הסיבוב!' : '😅 כמעט! עוד סיבוב?');
              }
            }
            return f;
          },
          onEnd: () => {
            inst.st.spinSpeed = 0;
          },
        },
      ),
    );
  }

  // ---- pets ----------------------------------------------------------------------------------

  private petIt(inst: Inst): void {
    const walk = this.walk!;
    const pet = inst.pet;
    if (!pet) return;
    walk.faceTo(pet.pos);
    walk.playFor('pet', 2.6);
    report('pet-petted');
    pet.mode = 'happy';
    pet.happy = 2.8;
    pet.heading = Math.atan2(walk.pos.x - pet.pos.x, walk.pos.y - pet.pos.y);
    sound.sfx(pet.species === 'cat' ? 'purr' : pet.species === 'dog' ? 'bark' : 'squeak', 0.7);
    for (let i = 0; i < 5; i++) setTimeout(() => this.particles.emit('heart', this.petHead(inst), { count: 1, spread: 0.1 }), i * 380);
    useWalk.getState().toast(pet.species === 'cat' ? '🐱 גרררר… החתול מגרגר' : pet.species === 'dog' ? '🐶 הכלב מכשכש בזנב!' : '💕');
  }

  private petHead(inst: Inst): THREE.Vector3 {
    const h = inst.parts.get('head')?.[0];
    if (h) return h.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.15, 0));
    return this.world3(inst, 0, inst.lsize.h + 0.1 / inst.k.y, 0);
  }

  private toggleFollow(inst: Inst): void {
    if (!inst.pet) return;
    inst.pet.follow = !inst.pet.follow;
    inst.pet.mode = inst.pet.follow ? 'follow' : 'idle';
    sound.sfx(inst.pet.species === 'cat' ? 'meow' : 'bark', 0.6);
    useWalk.getState().toast(inst.pet.follow ? `🦮 ${inst.def.name} הולך אחריך` : `${inst.def.name} נשאר כאן`);
  }

  /** whistle: every pet comes */
  callPets(): void {
    if (!this.walk) return;
    this.walk.playFor('call', 1.2);
    let n = 0;
    for (const inst of this.insts.values()) {
      if (!inst.pet) continue;
      inst.pet.follow = true;
      inst.pet.mode = 'follow';
      n++;
    }
    sound.sfx('squeak', 0.5);
    if (n) setTimeout(() => sound.sfx('bark', 0.5), 400);
    useWalk.getState().toast(n ? '🦮 כל החיות באות אליך!' : 'אין חיות מחמד בבית – הוסיפו מהקטלוג 🐶');
  }

  private updatePet(inst: Inst, dt: number): void {
    const pet = inst.pet!;
    const walk = this.walk!;
    const me = walk.pos;
    const dMe = Math.hypot(me.x - pet.pos.x, me.y - pet.pos.y);
    const cat = pet.species === 'cat';
    const bird = pet.species === 'bird';
    const self = (inst.obj.userData.pet ?? inst.holder.userData.body?.userData.pet) as PetRuntime | undefined;
    const walkSp = inst.def.pet?.walkSpeed ?? (cat ? 0.6 : 0.9);
    const runSp = inst.def.pet?.runSpeed ?? (cat ? 1.6 : 2.8);
    let want = 0;
    pet.timer -= dt;
    pet.happy = Math.max(0, pet.happy - dt);
    // dogs chase moving balls
    let chase: Inst | null = null;
    if (!cat && !bird) {
      for (const b of this.insts.values()) {
        if (!b.ball) continue;
        const sp = Math.hypot(b.ball.v.x, b.ball.v.z);
        const db = Math.hypot(b.ball.p.x - pet.pos.x, b.ball.p.z - pet.pos.y);
        if (sp > 0.6 && db < 10) chase = b;
      }
    }
    if (bird) {
      want = 0;
    } else if (pet.happy > 0) {
      pet.mode = 'happy';
    } else if (chase) {
      pet.mode = 'chase';
      pet.target = { x: chase.ball!.p.x, y: chase.ball!.p.z };
      want = runSp;
      if (Math.hypot(pet.target.x - pet.pos.x, pet.target.y - pet.pos.y) < pet.radius + chase.ball!.r + 0.05) {
        // nudge the ball back towards the character
        const dx = me.x - chase.ball!.p.x;
        const dy = me.y - chase.ball!.p.z;
        const l = Math.hypot(dx, dy) || 1;
        chase.ball!.v.set((dx / l) * 2.5, 1.2, (dy / l) * 2.5);
        sound.sfx('bark', 0.4);
      }
    } else if (pet.follow) {
      pet.mode = 'follow';
      if (dMe > 1.1) {
        pet.target = { ...me };
        want = dMe > 3 ? Math.min(runSp, Math.max(walkSp * 1.3, walk.speed * 1.25)) : walkSp * 1.3;
      } else want = 0;
    } else {
      if (pet.timer <= 0) {
        pet.timer = 3 + Math.random() * 5;
        if (Math.random() < 0.55) {
          const a = Math.random() * Math.PI * 2;
          const r = 0.8 + Math.random() * 2;
          pet.target = { x: pet.home.x + Math.cos(a) * r, y: pet.home.y + Math.sin(a) * r };
          pet.mode = 'wander';
        } else {
          pet.target = null;
          pet.mode = 'idle';
        }
      }
      if (pet.target && Math.hypot(pet.target.x - pet.pos.x, pet.target.y - pet.pos.y) > 0.2) want = walkSp;
      else pet.target = null;
    }
    pet.speed += (want - pet.speed) * Math.min(1, dt * 5);
    if (pet.target && want > 0) {
      pet.detour -= dt;
      const desired = Math.atan2(pet.target.x - pet.pos.x, pet.target.y - pet.pos.y) + (pet.detour > 0 ? pet.detourSide * 1.25 : 0);
      let diff = desired - pet.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      pet.heading += Math.sign(diff) * Math.min(Math.abs(diff), dt * 5);
    } else if (dMe < 3 && pet.mode !== 'happy') {
      // look at the character (slowly turn)
    }
    const beforeX = pet.pos.x;
    const beforeY = pet.pos.y;
    pet.pos.x += Math.sin(pet.heading) * pet.speed * dt;
    pet.pos.y += Math.cos(pet.heading) * pet.speed * dt;
    // keep out of the character's way
    if (dMe < RADIUS + pet.radius) {
      const k = (RADIUS + pet.radius - dMe) / Math.max(dMe, 1e-3);
      pet.pos.x -= (me.x - pet.pos.x) * k;
      pet.pos.y -= (me.y - pet.pos.y) * k;
    }
    const petFloor = this.floorOf(inst);
    if (this.world) collideCircle(this.world, pet.pos, pet.radius * 0.8, petFloor, inst.id);
    // blocked by furniture or a wall: go around it, or give up on a stroll
    const made = Math.hypot(pet.pos.x - beforeX, pet.pos.y - beforeY);
    if (want > 0.2 && made < pet.speed * dt * 0.35) pet.stuck += dt;
    else pet.stuck = Math.max(0, pet.stuck - dt * 2);
    if (pet.stuck > 0.35) {
      pet.stuck = 0;
      if (pet.mode === 'wander') pet.target = null;
      else {
        pet.detour = 0.9;
        pet.detourSide = Math.random() < 0.5 ? -1 : 1;
      }
    }
    // occasional noises
    pet.noiseT -= dt;
    if (pet.noiseT <= 0) {
      pet.noiseT = 8 + Math.random() * 14;
      if (dMe < 8) sound.sfx(cat ? 'meow' : bird ? 'squeak' : 'bark', 0.25);
    }
    // transform + animation
    if (!bird) {
      this.placeHolder(inst, pet.pos.x, petFloor + inst.item.elevation, pet.pos.y, pet.heading);
    }
    if (self) {
      // a pet that animates itself: tell it how fast it moves and how it rests
      if (pet.speed > 0.05) {
        pet.rest = 'idle';
        pet.restT = 2 + Math.random() * 4;
      } else if (pet.rest === 'idle' && (pet.restT -= dt) <= 0) pet.rest = Math.random() < 0.5 ? 'sit' : 'lie';
      const mood = pet.mode === 'happy' ? 'happy' : pet.speed > 0.05 ? 'idle' : pet.follow ? 'sit' : pet.rest;
      self.update(dt, pet.speed, mood);
      return;
    }
    const gait = pet.speed / (cat ? 1.6 : 2.8);
    pet.phase += dt * (3 + pet.speed * 5);
    const ph = pet.phase;
    const legs = ['leg0', 'leg1', 'leg2', 'leg3'];
    const offs = [0, Math.PI, Math.PI, 0];
    legs.forEach((n, i) => {
      for (const leg of inst.parts.get(n) ?? []) {
        const r = inst.rest.get(leg)!;
        const sw = Math.sin(ph + offs[i]) * 0.65 * Math.min(1, gait * 1.6);
        leg.quaternion.copy(r.q).multiply(tmpQ.setFromAxisAngle(AX, sw));
      }
    });
    const now = this.time;
    for (const tail of inst.parts.get('tail') ?? []) {
      const r = inst.rest.get(tail)!;
      const wag = cat ? Math.sin(now * 1.5) * 0.35 : Math.sin(now * (pet.mode === 'happy' || pet.follow ? 16 : 5)) * (pet.mode === 'happy' ? 0.7 : 0.3);
      tail.quaternion.copy(r.q).multiply(tmpQ.setFromAxisAngle(AY, wag));
    }
    for (const body of inst.parts.get('body') ?? []) {
      const r = inst.rest.get(body)!;
      const hop = pet.mode === 'happy' && !cat ? Math.abs(Math.sin(now * 7)) * 0.07 : 0;
      body.position.set(r.p.x, r.p.y + Math.abs(Math.sin(ph)) * 0.015 * gait + hop + (bird ? Math.sin(now * 2) * 0.005 : 0), r.p.z);
    }
    for (const head of inst.parts.get('head') ?? []) {
      const r = inst.rest.get(head)!;
      let look = 0;
      if (dMe < 3.5 && pet.speed < 0.3) {
        let rel = Math.atan2(me.x - pet.pos.x, me.y - pet.pos.y) - pet.heading;
        while (rel > Math.PI) rel -= Math.PI * 2;
        while (rel < -Math.PI) rel += Math.PI * 2;
        look = Math.max(-0.8, Math.min(0.8, rel));
      }
      const tilt = pet.mode === 'happy' ? Math.sin(now * 3) * 0.2 : bird ? Math.sin(now * 1.3) * 0.25 : 0;
      head.quaternion.copy(r.q).multiply(tmpQ.setFromAxisAngle(AY, look)).multiply(new THREE.Quaternion().setFromAxisAngle(AZ, tilt));
    }
  }

  // ---- balls ---------------------------------------------------------------------------------

  private kickBall(inst: Inst, power: number): void {
    const walk = this.walk!;
    const b = inst.ball;
    if (!b) return;
    walk.faceTo({ x: b.p.x, y: b.p.z });
    walk.character.setActivity('kick');
    setTimeout(() => {
      const f = { x: Math.sin(walk.facing), y: Math.cos(walk.facing) };
      b.v.set(f.x * power, power * 0.45, f.y * power);
      sound.sfx('kick');
      report('ball-kicked');
    }, 220);
  }

  private stepBall(b: BallState, dt: number, ignore: string | undefined, obj: THREE.Object3D | null, holderRotY: number): void {
    const g = 9.8;
    b.v.y -= g * dt;
    b.p.addScaledVector(b.v, dt);
    const floor = b.floor + b.r;
    if (b.p.y < floor) {
      b.p.y = floor;
      if (b.v.y < -1.2) sound.sfx('bounce', Math.min(1, -b.v.y / 8));
      b.v.y = -b.v.y * 0.62;
      if (Math.abs(b.v.y) < 0.4) b.v.y = 0;
      const fr = Math.exp(-1.2 * dt);
      b.v.x *= fr;
      b.v.z *= fr;
    }
    if (b.p.y > b.floor + 2.6 - b.r && b.v.y > 0) b.v.y = -b.v.y * 0.5;
    if (this.world) {
      const pos = { x: b.p.x, y: b.p.z };
      const push = collideCircle(this.world, pos, b.r, b.p.y - b.r, ignore);
      const pl = Math.hypot(push.x, push.y);
      if (pl > 1e-6) {
        const nx = push.x / pl;
        const ny = push.y / pl;
        const vn = b.v.x * nx + b.v.z * ny;
        if (vn < 0) {
          b.v.x -= 1.7 * vn * nx;
          b.v.z -= 1.7 * vn * ny;
          if (vn < -1) sound.sfx('kick', Math.min(0.6, -vn / 10));
        }
        b.p.x = pos.x;
        b.p.z = pos.y;
      }
    }
    this.checkGoals(b);
    // the character dribbles it
    const walk = this.walk;
    if (walk) {
      const dx = b.p.x - walk.pos.x;
      const dy = b.p.z - walk.pos.y;
      const d = Math.hypot(dx, dy);
      if (d < RADIUS + b.r && b.p.y < 0.6) {
        const nx = dx / (d || 1);
        const ny = dy / (d || 1);
        const sp = Math.max(1.2, walk.speed * 1.5);
        b.v.x = nx * sp;
        b.v.z = ny * sp;
        b.p.x = walk.pos.x + nx * (RADIUS + b.r);
        b.p.z = walk.pos.y + ny * (RADIUS + b.r);
      }
    }
    if (obj) {
      const hv = Math.hypot(b.v.x, b.v.z);
      if (hv > 0.01) {
        const axis = tmpV.set(b.v.z, 0, -b.v.x).normalize();
        // axis is in world space; the obj lives in a holder rotated by holderRotY
        axis.applyAxisAngle(AY, -holderRotY);
        obj.quaternion.premultiply(tmpQ.setFromAxisAngle(axis, (hv * dt) / b.r));
      }
    }
  }

  /** A ball that rolls over a goal line scores; the net keeps it inside. */
  private checkGoals(b: BallState): void {
    for (const g of this.insts.values()) {
      if (g.def.id !== 'football-goal' && g.def.id !== 'goal-soccer') continue;
      g.holder.updateWorldMatrix(true, false);
      const l = g.holder.worldToLocal(tmpV.copy(b.p));
      const { w, d, h } = g.size;
      if (Math.abs(l.x) > w / 2 - 0.06 || l.y > h - 0.08 || l.z > d / 2 || l.z < -d / 2 - 0.5) continue;
      if (this.goalCooldown <= 0 && l.z < d / 2 - 0.12 && b.v.lengthSq() > 0.3) {
        this.goalCooldown = 4;
        b.v.multiplyScalar(0.2);
        report('goal-scored');
        this.walk?.playFor('cheer', 2.2);
        this.goalScored(g.holder.localToWorld(new THREE.Vector3(0, h + 0.3, 0)));
      }
      // the net
      const back = -d / 2 + b.r;
      if (l.z < back) {
        const p = g.holder.localToWorld(new THREE.Vector3(l.x, l.y, back));
        b.p.x = p.x;
        b.p.z = p.z;
        b.v.multiplyScalar(0.2);
      }
    }
  }

  private shootHoop(inst: Inst): void {
    const walk = this.walk!;
    const at = inst.act.get('hoop')?.at ?? { x: 0, y: 3.05, z: 0.3 };
    const ring = this.world3(inst, at.x, at.y, at.z).clone();
    walk.faceTo({ x: ring.x, y: ring.z });
    walk.character.setActivity('shoot');
    walk.character.setProp('ball');
    const dist = Math.hypot(ring.x - walk.pos.x, ring.z - walk.pos.y);
    const chance = Math.max(0.2, Math.min(0.92, 1.12 - dist / 7));
    const success = Math.random() < chance;
    setTimeout(() => {
      walk.character.setProp('none');
      const from = walk.character.handWorld().add(new THREE.Vector3(0, 0.15, 0));
      const to = ring.clone();
      if (!success) {
        const a = Math.random() * Math.PI * 2;
        to.x += Math.cos(a) * 0.3;
        to.z += Math.sin(a) * 0.3;
        to.y += 0.08;
      }
      to.y += 0.12;
      const mesh = basketball();
      this.effects.add(mesh);
      sound.sfx('whoosh', 0.5);
      this.projectiles.push({
        mesh,
        from,
        to,
        t: 0,
        T: 0.65 + dist * 0.07,
        arc: 0.9 + dist * 0.18,
        done: () => {
          this.effects.remove(mesh);
          const b: BallState = { floor: this.floorOf(inst), p: to.clone(), v: success ? new THREE.Vector3(0, -2.5, 0) : new THREE.Vector3((to.x - ring.x) * 8, 1.5, (to.z - ring.z) * 8), r: 0.12 };
          if (success) b.p.copy(ring);
          const m2 = basketball();
          this.effects.add(m2);
          this.tempBalls.push({ mesh: m2, b, life: 4 });
          const ws = useWalk.getState();
          if (success) {
            const pts = dist > 4.5 ? 3 : 2;
            ws.addScore(pts);
            sound.sfx('score');
            sound.sfx('cheer', 0.6);
            this.particles.emit('confetti', ring, { count: 50 });
            ws.toast(pts === 3 ? '🏀 שלשה!!! +3' : '🏀 סל! +2');
          } else {
            sound.sfx('miss');
            ws.toast('🏀 החטאה… נסו שוב');
          }
        },
      });
    }, 330);
  }

  private throwDart(inst: Inst): void {
    const walk = this.walk!;
    const at = inst.act.get('darts')?.at ?? { x: 0, y: 1.73, z: 0.02 };
    const center = this.world3(inst, at.x, at.y, at.z).clone();
    walk.faceTo({ x: center.x, y: center.z });
    walk.character.setActivity('throw');
    walk.character.setProp('dart');
    const dist = Math.hypot(center.x - walk.pos.x, center.z - walk.pos.y);
    setTimeout(() => {
      walk.character.setProp('none');
      const sigma = 0.035 + dist * 0.02;
      const g = () => (Math.random() + Math.random() + Math.random() - 1.5) * sigma * 1.4;
      const ox = g();
      const oy = g();
      const r = Math.hypot(ox, oy);
      // board plane: local X / Y of the item
      inst.holder.updateMatrixWorld(true);
      const q = inst.obj.getWorldQuaternion(new THREE.Quaternion());
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
      const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
      const hit = center.clone().addScaledVector(right, ox).add(new THREE.Vector3(0, oy, 0)).addScaledVector(normal, 0.01);
      const from = walk.character.handWorld();
      const mesh = dartMesh();
      this.effects.add(mesh);
      sound.sfx('dart');
      this.projectiles.push({
        mesh,
        from,
        to: hit,
        t: 0,
        T: 0.28 + dist * 0.03,
        arc: 0.12,
        done: () => {
          mesh.position.copy(hit).addScaledVector(normal, 0.05);
          mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal.clone().negate());
          const list = this.darts.get(inst.id) ?? [];
          list.push(mesh);
          if (list.length > 3) this.effects.remove(list.shift()!);
          this.darts.set(inst.id, list);
          const score = dartScore(ox, oy, r);
          const ws = useWalk.getState();
          if (score > 0) ws.addScore(score);
          if (score >= 50) {
            sound.sfx('cheer');
            this.particles.emit('confetti', hit, { count: 40 });
            ws.toast(`🎯 בול! +${score}`);
          } else if (score > 0) {
            sound.sfx(score >= 20 ? 'score' : 'pop', 0.6);
            ws.toast(`🎯 +${score}`);
          } else {
            sound.sfx('miss', 0.6);
            ws.toast('🎯 פספוס!');
          }
        },
      });
    }, 260);
  }

  private feedFish(inst: Inst): void {
    const walk = this.walk!;
    walk.faceTo(this.pose(inst));
    walk.playFor('feed', 2);
    inst.st.feedT = 6;
    const area = inst.act.get('fish')?.area;
    const top = area ? (area.max.y as number) : inst.lsize.h;
    for (let i = 0; i < 8; i++) {
      setTimeout(() => this.particles.emit('crumb', this.world3(inst, (Math.random() - 0.5) * 0.2, top, (Math.random() - 0.5) * 0.1), { count: 3, gravity: 0.4, life: 3, vy: 0, jitter: 0.05 }), i * 120);
    }
    sound.sfx('splash', 0.2);
    useWalk.getState().toast('🐟 הדגים שמחים!');
  }

  // ---- per frame -----------------------------------------------------------------------------

  update(dt: number, listener: THREE.Vector3 | null): void {
    dt = Math.min(dt, 0.05);
    this.time += dt;
    this.goalCooldown -= dt;
    for (const rt of this.coasting) if (!rt.update(dt, 0, [])) this.coasting.delete(rt);
    const now = new Date();
    for (const inst of this.insts.values()) this.animate(inst, dt, now, listener);
    // projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.t += dt;
      const k = Math.min(1, p.t / p.T);
      p.mesh.position.lerpVectors(p.from, p.to, k);
      p.mesh.position.y += p.arc * 4 * k * (1 - k);
      p.mesh.rotation.x += dt * 8;
      if (k >= 1) {
        this.projectiles.splice(i, 1);
        p.done();
      }
    }
    for (let i = this.tempBalls.length - 1; i >= 0; i--) {
      const tb = this.tempBalls[i];
      tb.life -= dt;
      this.stepBall(tb.b, dt, undefined, tb.mesh, 0);
      tb.mesh.position.copy(tb.b.p);
      if (tb.life <= 0) {
        this.effects.remove(tb.mesh);
        this.tempBalls.splice(i, 1);
      }
    }
    this.particles.update(dt);
    this.screens.update(dt);
    if (this.walking && this.walk) {
      this.choiceT -= dt;
      if (this.choiceT <= 0) {
        this.choiceT = 0.15;
        this.choices = this.buildChoices();
        useWalk.getState().setChoices(this.choices.map(({ id, label, icon }) => ({ id, label, icon })));
      }
      // reading on a seat
      const ch = this.walk.character;
      if (this.walk.seat?.kind === 'sit' && ch.getProp() === 'book' && ch.getActivity() === 'none' && !this.walk.occupation) ch.setActivity('read');
      // showers wash the character
      for (const inst of this.insts.values()) {
        if (!inst.st.on.water) continue;
        const a = inst.act.get('water')?.at;
        if (!a || a.y < 1.6) continue;
        const w = this.world3(inst, a.x, a.y, a.z);
        if (Math.hypot(w.x - this.walk.pos.x, w.z - this.walk.pos.y) < 0.45 && !this.walk.occupation) {
          if (ch.getActivity() !== 'wash') this.walk.playFor('wash', 1.5);
          if (Math.random() < dt * 10) this.particles.emit('bubble', ch.headWorld(), { count: 1, spread: 0.25 });
        }
      }
    }
  }

  private animate(inst: Inst, dt: number, now: Date, listener: THREE.Vector3 | null): void {
    const st = inst.st;
    const parts = inst.parts;
    // distance-based volume
    if (listener && Object.keys(inst.voices).length) {
      const pp = inst.pet ? inst.pet.pos : inst.ball ? { x: inst.ball.p.x, y: inst.ball.p.z } : this.pose(inst);
      const d = Math.hypot(listener.x - pp.x, listener.z - pp.y) + Math.abs(listener.y - (inst.ball?.floor ?? this.floorOf(inst))) * 2;
      const vol = Math.max(0, 1 - d / 14);
      const v2 = vol * vol;
      inst.voices.music?.setVolume(v2 * 0.9);
      inst.voices.tv?.setVolume(v2 * 0.35);
      inst.voices.water?.setVolume(v2 * 0.5);
      inst.voices.fire?.setVolume(v2 * 0.5);
      inst.voices.fan?.setVolume(v2 * 0.3);
    }
    // clocks
    if (parts.has('hour') || parts.has('minute')) {
      const s = now.getSeconds() + now.getMilliseconds() / 1000;
      const m = now.getMinutes() + s / 60;
      const h = (now.getHours() % 12) + m / 60;
      const set = (name: string, frac: number) => {
        for (const p of parts.get(name) ?? []) {
          const r = inst.rest.get(p)!;
          p.quaternion.copy(r.q).multiply(tmpQ.setFromAxisAngle(AZ, -frac * Math.PI * 2));
        }
      };
      set('hour', h / 12);
      set('minute', m / 60);
      set('second', Math.floor(s) / 60);
    }
    // fish
    if (inst.fish.length) {
      const a = inst.act.get('fish')?.area;
      const fp = parts.get('fish')?.[0];
      const origin = fp ? inst.rest.get(fp)!.p : new THREE.Vector3();
      for (const f of inst.fish) {
        const pos = f.obj.position;
        f.phase += dt;
        if (pos.distanceTo(f.target) < 0.03 || Math.random() < dt * 0.1) {
          if (a) {
            f.target.set(
              THREE.MathUtils.lerp(a.min.x, a.max.x, 0.1 + Math.random() * 0.8) - origin.x,
              THREE.MathUtils.lerp(a.min.y, a.max.y, st.feedT > 0 ? 0.8 + Math.random() * 0.15 : 0.15 + Math.random() * 0.7) - origin.y,
              THREE.MathUtils.lerp(a.min.z, a.max.z, 0.15 + Math.random() * 0.7) - origin.z,
            );
          } else {
            const r0 = f.obj.userData.fishRest as THREE.Vector3;
            f.target.set(r0.x + (Math.random() - 0.5) * 0.3, r0.y + (Math.random() - 0.5) * 0.1, r0.z + (Math.random() - 0.5) * 0.1);
          }
        }
        const dir = tmpV.subVectors(f.target, pos);
        const l = dir.length();
        if (l > 1e-4) {
          const sp = f.speed * (st.feedT > 0 ? 2 : 1);
          pos.addScaledVector(dir, Math.min(1, (sp * dt) / l));
          const yaw = Math.atan2(-dir.z, dir.x);
          f.obj.rotation.set(0, yaw, Math.sin(f.phase * 9) * 0.05);
        }
      }
      st.feedT = Math.max(0, st.feedT - dt);
      if (Math.random() < dt * 0.8 && a) this.particles.emit('bubble', this.world3(inst, THREE.MathUtils.lerp(a.min.x, a.max.x, Math.random()), a.min.y + 0.02, (a.min.z + a.max.z) / 2), { count: 1, vy: 0.12, life: 2.5, size: 0.015, floorY: -99 });
    }
    // open / close
    if (parts.has('door') || parts.has('drawer')) {
      const next = st.open + (st.openTarget - st.open) * Math.min(1, dt * 6);
      if (Math.abs(next - st.open) > 1e-4 || st.open !== st.openTarget) {
        st.open = Math.abs(next - st.openTarget) < 1e-3 ? st.openTarget : next;
        for (const d of parts.get('door') ?? []) {
          const r = inst.rest.get(d)!;
          const ang = (d.userData.open as number | undefined) ?? -1.6;
          d.quaternion.copy(r.q).multiply(tmpQ.setFromAxisAngle(AY, ang * st.open));
        }
        for (const d of parts.get('drawer') ?? []) {
          const r = inst.rest.get(d)!;
          const dist = (d.userData.open as number | undefined) ?? 0.3;
          d.position.set(r.p.x, r.p.y, r.p.z + dist * st.open);
        }
      }
    }
    // rotors / spinning parts
    const spinning = st.on.fan || st.on.music || st.spinSpeed > 0;
    if (spinning || st.spin !== 0) {
      const target = st.on.fan ? 14 : st.on.music ? 3.5 : st.spinSpeed;
      const cur = (inst.holder.userData.spinVel as number | undefined) ?? 0;
      const vel = cur + (target - cur) * Math.min(1, dt * (target > cur ? 1.5 : 0.8));
      inst.holder.userData.spinVel = vel;
      st.spin += vel * dt;
      if (vel < 0.01 && !spinning) st.spin = 0;
      for (const r of parts.get('rotor') ?? []) r.quaternion.copy(inst.rest.get(r)!.q).multiply(tmpQ.setFromAxisAngle(AY, st.spin));
      for (const r of parts.get('spin') ?? []) {
        const axis = inst.act.has('music') || r.userData.axis === 'y' ? AY : AX;
        r.quaternion.copy(inst.rest.get(r)!.q).multiply(tmpQ.setFromAxisAngle(axis, st.spin));
      }
    }
    // speaker cones
    if (parts.has('pulse')) {
      st.beat = Math.max(0, st.beat - dt * 6);
      const k = st.on.music ? 1 + st.beat * 0.09 : 1;
      for (const p of parts.get('pulse')!) p.scale.copy(inst.rest.get(p)!.s).multiplyScalar(k);
    }
    // effects
    inst.emitAcc += dt;
    if (st.on.music && Math.random() < dt * 1.5) this.particles.emit('note', this.world3(inst, 0, inst.lsize.h + 0.1 / inst.k.y, 0), { count: 1 });
    if (st.on.fire) {
      const a = inst.act.get('fire')!;
      const at = a.at ?? { x: 0, y: inst.lsize.h * 0.4, z: 0 };
      const small = a.variant === 'candle' || inst.size.w < 0.4;
      const p = this.world3(inst, at.x, at.y, at.z);
      const rate = small ? 18 : 45;
      const n = Math.floor(inst.emitAcc * rate);
      if (n > 0) {
        const span = small ? 0.006 : Math.min(0.5, inst.size.w * 0.35);
        this.particles.emit('fire', p, { count: n, spread: span, size: small ? 0.025 : 0.13, vy: small ? 0.12 : 0.55, life: small ? 0.35 : 0.8, wobble: small ? 0.02 : 0.15 });
        if (!small && Math.random() < 0.3) this.particles.emit('smoke', p.clone().add(new THREE.Vector3(0, 0.35, 0)), { count: 1, spread: 0.2, alpha: 0.15 });
        if (!small && Math.random() < 0.15) this.particles.emit('spark', p, { count: 1, spread: 0.2 });
      }
      if (inst.fireLight) inst.fireLight.intensity = (small ? 0.5 : 2.6) * (0.8 + Math.random() * 0.35) * (this.lampScale > 0.2 ? 1.6 : 1);
    }
    if (st.on.water) {
      const at = inst.act.get('water')!.at ?? { x: 0, y: inst.lsize.h, z: 0 };
      const p = this.world3(inst, at.x, at.y, at.z);
      const shower = at.y > 1.5;
      const n = Math.floor(inst.emitAcc * (shower ? 140 : 70));
      if (n > 0) this.particles.emit('water', p, { count: n, spread: shower ? 0.18 : 0.012, floorY: inst.waterStop ?? 0, vy: shower ? -0.5 : -0.2 });
      if (Math.random() < dt * 4 && inst.waterStop !== null) this.particles.emit('steam', new THREE.Vector3(p.x, inst.waterStop + 0.05, p.z), { count: 1, spread: 0.1, alpha: 0.12 });
    }
    inst.emitAcc = 0;
    // walk-only simulations
    if (this.walking && this.walk) {
      if (inst.pet) this.updatePet(inst, dt);
      if (inst.ball) {
        this.stepBall(inst.ball, dt, inst.id, inst.obj, 0);
        this.placeHolder(inst, inst.ball.p.x, inst.ball.p.y - inst.ball.r, inst.ball.p.z, 0);
      }
    }
  }
}

/* ------------------------------------------------------------------------------------------ */

function basketball(): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.12, 18, 14), new THREE.MeshStandardMaterial({ color: '#d9692b', roughness: 0.75 }));
  m.castShadow = true;
  const seam = new THREE.Mesh(new THREE.TorusGeometry(0.121, 0.004, 4, 32), new THREE.MeshBasicMaterial({ color: '#2a1a10' }));
  const seam2 = seam.clone();
  seam2.rotation.y = Math.PI / 2;
  m.add(seam, seam2);
  return m;
}

function dartMesh(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.12, 6), new THREE.MeshStandardMaterial({ color: '#c9ccce', metalness: 1, roughness: 0.3 }));
  body.rotation.x = Math.PI / 2;
  const fl = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.002, 0.03), new THREE.MeshStandardMaterial({ color: '#e63946' }));
  fl.position.z = -0.06;
  const fl2 = fl.clone();
  fl2.rotation.z = Math.PI / 2;
  g.add(body, fl, fl2);
  return g;
}

/** standard dartboard scoring for an offset (meters) from the bull */
function dartScore(x: number, y: number, r: number): number {
  if (r < 0.0064) return 50;
  if (r < 0.016) return 25;
  if (r > 0.17) return 0;
  const sectors = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
  let a = Math.atan2(x, y); // 0 = up, clockwise
  if (a < 0) a += Math.PI * 2;
  const idx = Math.floor(((a + Math.PI / 20) % (Math.PI * 2)) / (Math.PI / 10));
  const base = sectors[idx];
  if (r > 0.099 && r < 0.107) return base * 3;
  if (r > 0.162) return base * 2;
  return base;
}
