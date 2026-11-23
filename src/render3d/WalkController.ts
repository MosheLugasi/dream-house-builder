import * as THREE from 'three';
import { audio } from '../audio';
import type { Surface } from '../audio/types';
import type { OpeningAnim } from '../catalog/openings';
import type { FurnitureDef, RideRuntime, SeatAnchor, WheelPart } from '../catalog/types';
import { report } from '../game/progress';
import { closestOnSegment, pointInPolygon } from '../model/geom';
import { stairFraction, type StairType } from '../model/stairs';
import type { Vec2 } from '../model/types';
import { Character } from './Character';

/** A solid stretch of wall (site coordinates) between two heights. */
export interface WalkWall {
  a: Vec2;
  b: Vec2;
  half: number;
  y0: number;
  y1: number;
  /** a stair's entry/exit: passable only for someone standing at this height */
  openY?: number;
}

/** Oriented box obstacle (furniture, props, parked vehicles). */
export interface WalkBox {
  id?: string;
  x: number;
  y: number;
  hw: number;
  hd: number;
  rotation: number;
  y0: number;
  y1: number;
}

export interface SeatInstance {
  itemId: string;
  pos: Vec2;
  /** absolute height of the seat surface */
  height: number;
  /** height of the floor the seat stands on */
  floorY: number;
  dir: Vec2;
  kind: 'sit' | 'lie';
  name: string;
  /** sitting here lets you play (number keys) */
  instrument?: 'piano';
  /** the seat is part of moving play equipment */
  ride?: { runtime: RideRuntime; index: number; prompt: string };
}

export interface WalkDoor {
  center: Vec2;
  y: number;
  anims: OpeningAnim[];
  open: number;
  sliding?: boolean;
}

export interface WalkStair {
  x: number;
  y: number;
  rotation: number;
  w: number;
  d: number;
  type: StairType;
  y0: number;
  y1: number;
}

/** The floors of one building: where you can stand on each level (site coordinates). */
export interface WalkFloors {
  levels: { y: number; rooms: Vec2[][] }[];
}

export interface WalkVehicle {
  id: string;
  def: FurnitureDef;
  holder: THREE.Object3D;
}

/** Something that reacts to the F key: a lamp, a TV, a tap, a pet… */
export interface Usable {
  id: string;
  pos: Vec2;
  y: number;
  reach: number;
  prompt(): string;
  use(): void;
}

/** A playground slide: a path the character climbs and then slides down (world coordinates). */
export interface WalkSlide {
  points: THREE.Vector3[];
  slideFrom: number;
}

/** A trampoline mat. */
export interface WalkBouncer {
  x: number;
  y: number;
  radius: number;
  surfaceY: number;
  boost: number;
}

export interface WalkWorld {
  walls: WalkWall[];
  boxes: WalkBox[];
  seats: SeatInstance[];
  doors: WalkDoor[];
  stairs: WalkStair[];
  floors: WalkFloors[];
  vehicles: WalkVehicle[];
  usables: Usable[];
  slides: WalkSlide[];
  bouncers: WalkBouncer[];
  /** meshes that can block the camera */
  occluders: THREE.Object3D[];
  /** height of the outdoor ground (sidewalks are raised) */
  groundAt: (x: number, y: number) => number;
  /** what the floor is made of at a position, for footsteps */
  surfaceAt: (x: number, y: number, feetY: number) => Surface;
}

const RADIUS = 0.22;
const WALK_SPEED = 1.9;
const RUN_SPEED = 3.8;
const GRAVITY = 14;
const JUMP_SPEED = 4.6;
const PIANO_SCALE = [0, 2, 4, 5, 7, 9, 11, 12, 14];

export const emptyWorld = (): WalkWorld => ({
  walls: [],
  boxes: [],
  seats: [],
  doors: [],
  stairs: [],
  floors: [],
  vehicles: [],
  usables: [],
  slides: [],
  bouncers: [],
  occluders: [],
  groundAt: () => 0,
  surfaceAt: () => 'grass',
});

export function seatsOf(def: FurnitureDef, itemId: string, x: number, y: number, rotation: number, floorY: number, elevation: number): SeatInstance[] {
  const c = Math.cos(rotation);
  const s = Math.sin(rotation);
  const instrument = def.interact?.some((i) => i.kind === 'instrument') ? 'piano' : undefined;
  return (def.seats ?? []).map((a: SeatAnchor) => {
    const fx = Math.sin(a.facing);
    const fz = Math.cos(a.facing);
    return {
      itemId,
      pos: { x: x + a.x * c - a.z * s, y: y + a.x * s + a.z * c },
      height: floorY + elevation + a.height,
      floorY,
      dir: { x: fx * c - fz * s, y: fx * s + fz * c },
      kind: a.kind ?? 'sit',
      name: def.name,
      instrument,
    };
  });
}

const inRooms = (p: Vec2, rooms: Vec2[][]) => rooms.some((poly) => pointInPolygon(p, poly));
const wrap = (a: number) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();

/** Walking, jumping, stairs, sitting, play equipment and vehicles – with a third/first-person camera. */
export class WalkController {
  readonly character = new Character();
  pos: Vec2 = { x: 0, y: 0 };
  /** height of the feet above the ground */
  y = 0;
  /** current velocity on the ground plane, m/s (used by balls and pets) */
  readonly velocity: Vec2 = { x: 0, y: 0 };
  facing = 0;
  private yaw = Math.PI;
  private pitch = 0.32;
  private distance = 3.2;
  private keys = new Set<string>();
  private speed = 0;
  private vy = 0;
  private airborne = false;
  private seat: SeatInstance | null = null;
  private dragging = false;
  private lastPointer = { x: 0, y: 0 };
  private raycaster = new THREE.Raycaster();
  private camDist = 3.2;
  private floorCtx: { floors: WalkFloors; level: number } | null = null;
  private lastLevelY = 0;
  private stepDistance = 0;
  private stepSide = 1;
  private travelled = 0;
  private nightTimer = 0;
  private ambienceTimer = 0;
  private asleep = 0;
  private turnRate = 0;
  // scripted motion along a slide
  private sliding: { slide: WalkSlide; segment: number; t: number; speed: number } | null = null;
  // play equipment that is still moving after its rider left
  private coasting = new Set<RideRuntime>();
  // driving
  private vehicle: WalkVehicle | null = null;
  private vSpeed = 0;
  private steer = 0;
  firstPerson = false;
  /** 0…1, set by the engine (lamps, crickets, headlights) */
  night = 0;
  world: WalkWorld = emptyWorld();
  onHint: (hint: string) => void = () => {};
  onToggleFirstPerson: () => void = () => {};
  /** called when a vehicle is parked so that its new place can be saved */
  onVehicleParked: (id: string, x: number, y: number, rotation: number) => void = () => {};
  /** the character went to sleep in a bed */
  onSleep: () => void = () => {};
  private lastHint = '';

  constructor(
    private camera: THREE.PerspectiveCamera,
    private dom: HTMLElement,
  ) {}

  enable(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    this.dom.addEventListener('pointerdown', this.onPointerDown);
    this.dom.addEventListener('pointermove', this.onPointerMove);
    this.dom.addEventListener('pointerup', this.onPointerUp);
    this.dom.addEventListener('pointercancel', this.onPointerUp);
    this.dom.addEventListener('wheel', this.onWheel, { passive: false });
    audio.unlock();
  }

  disable(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.dom.removeEventListener('pointerdown', this.onPointerDown);
    this.dom.removeEventListener('pointermove', this.onPointerMove);
    this.dom.removeEventListener('pointerup', this.onPointerUp);
    this.dom.removeEventListener('pointercancel', this.onPointerUp);
    this.dom.removeEventListener('wheel', this.onWheel);
    this.keys.clear();
    this.dismount();
    this.standUp();
    this.sliding = null;
    audio.silence();
  }

  teleport(p: Vec2, lookYaw = Math.PI, y = 0): void {
    this.dismount();
    this.pos = { ...p };
    this.y = y;
    this.vy = 0;
    this.airborne = false;
    this.yaw = lookYaw;
    this.facing = lookYaw + Math.PI; // look where the camera looks
    this.seat = null;
    this.sliding = null;
    this.floorCtx = null;
    this.character.setPose('stand');
    this.resolveCollisions(this.pos, RADIUS);
    this.y = this.floorHeight(this.pos, this.y);
    this.lastLevelY = this.y;
  }

  get driving(): boolean {
    return !!this.vehicle;
  }
  get currentVehicle(): WalkVehicle | null {
    return this.vehicle;
  }
  get vehicleSpeed(): number {
    return this.vSpeed;
  }
  get seated(): SeatInstance | null {
    return this.seat;
  }

  /** virtual keys for on-screen controls */
  setVirtualKey(code: string, down: boolean): void {
    if (down) this.keys.add(code);
    else this.keys.delete(code);
  }

  /** Circle-vs-world collision for other actors (pets, balls). */
  collide(pos: Vec2, radius: number, y: number, ignoreBox?: string): void {
    this.resolveCollisions(pos, radius, ignoreBox, y);
  }

  /** E: sit / stand up / ride / get on or off a vehicle. */
  interact(): void {
    if (this.sliding) return;
    if (this.vehicle) {
      this.dismount();
      return;
    }
    if (this.seat) {
      this.standUp();
      return;
    }
    const v = this.nearestVehicle();
    const seat = this.nearestSeat();
    const slide = this.nearestSlide();
    const dv = v ? this.distTo(v.holder.position.x, v.holder.position.z) : Infinity;
    const ds = seat ? this.distTo(seat.pos.x, seat.pos.y) : Infinity;
    const dl = slide ? this.distTo(slide.points[0].x, slide.points[0].z) : Infinity;
    if (slide && dl <= dv && dl <= ds) {
      this.sliding = { slide, segment: 0, t: 0, speed: 1.3 };
      this.character.setPose('stand');
    } else if (v && dv <= ds) {
      this.mount(v);
    } else if (seat) {
      this.seat = seat;
      this.airborne = false;
      this.vy = 0;
      this.character.setPose(seat.kind, seat.ride ? 0.45 : seat.height - seat.floorY);
      this.pos = { ...seat.pos };
      this.y = seat.floorY;
      this.facing = Math.atan2(seat.dir.x, seat.dir.y);
      audio.play('sit', { volume: 0.7 });
      report('sat');
      if (seat.ride) report('swung');
    }
  }

  /** F: use the nearest lamp, tap, TV, pet… */
  use(): void {
    const u = this.nearestUsable();
    if (u) u.use();
  }

  private distTo(x: number, y: number): number {
    return Math.hypot(x - this.pos.x, y - this.pos.y);
  }

  private standUp(): void {
    if (!this.seat) return;
    const s = this.seat;
    this.seat = null;
    if (s.ride) this.coasting.add(s.ride.runtime);
    this.character.setPose('stand');
    this.character.root.rotation.set(0, this.facing, 0);
    const side = s.kind === 'lie' ? { x: s.dir.y, y: -s.dir.x } : s.dir;
    const d = s.kind === 'lie' ? 0.9 : 0.5;
    this.pos = { x: s.pos.x + side.x * d, y: s.pos.y + side.y * d };
    this.y = s.floorY;
    this.resolveCollisions(this.pos, RADIUS);
    audio.play('stand', { volume: 0.6 });
  }

  private nearestSeat(): SeatInstance | null {
    let best: SeatInstance | null = null;
    let bestScore = Infinity;
    for (const s of this.world.seats) {
      if (Math.abs(s.floorY - this.y) > 0.6) continue;
      const d = this.distTo(s.pos.x, s.pos.y);
      // a bed's anchor is the middle of the mattress, so it must be reachable from the bed's edge
      const reach = s.kind === 'lie' ? 1.75 : s.ride ? 1.5 : 1.15;
      if (d > reach) continue;
      const score = d / reach;
      if (score < bestScore) {
        bestScore = score;
        best = s;
      }
    }
    return best;
  }

  private nearestVehicle(): WalkVehicle | null {
    if (this.y > 0.4) return null;
    let best: WalkVehicle | null = null;
    let bestD = Infinity;
    for (const v of this.world.vehicles) {
      if (!v.def.vehicle) continue;
      const d = this.distTo(v.holder.position.x, v.holder.position.z);
      if (d < Math.max(v.def.size.w, v.def.size.d) / 2 + 1.1 && d < bestD) {
        bestD = d;
        best = v;
      }
    }
    return best;
  }

  private nearestSlide(): WalkSlide | null {
    for (const s of this.world.slides) {
      if (this.distTo(s.points[0].x, s.points[0].z) < 1.3 && Math.abs(s.points[0].y - this.y) < 0.6) return s;
    }
    return null;
  }

  private nearestUsable(): Usable | null {
    let best: Usable | null = null;
    let bestScore = Infinity;
    for (const u of this.world.usables) {
      if (Math.abs(u.y - this.y) > 1.6) continue;
      const d = this.distTo(u.pos.x, u.pos.y);
      if (d > u.reach) continue;
      const score = d / u.reach;
      if (score < bestScore) {
        bestScore = score;
        best = u;
      }
    }
    return best;
  }

  // ---- vehicles ------------------------------------------------------------------------------

  private mount(v: WalkVehicle): void {
    this.vehicle = v;
    this.vSpeed = 0;
    this.steer = 0;
    this.seat = null;
    const spec = v.def.vehicle!;
    v.holder.rotation.order = 'YXZ';
    this.character.setPose(spec.rider.pose === 'stand' ? 'stand' : spec.rider.pose, spec.rider.y);
    this.character.reach = spec.rider.pose === 'stand';
    this.distance = spec.cameraDistance ?? 6;
    this.camDist = this.distance;
    this.yaw = v.holder.rotation.y + Math.PI;
    audio.play(spec.kind === 'car' || spec.kind === 'bus' ? 'door-close' : 'sit', { volume: 0.7 });
  }

  private dismount(): void {
    const v = this.vehicle;
    if (!v) return;
    this.vehicle = null;
    const phi = v.holder.rotation.y;
    v.holder.rotation.x = 0;
    v.holder.rotation.z = 0;
    // step off to the vehicle's left (+X local)
    const side = v.def.size.w / 2 + 0.45;
    this.pos = { x: v.holder.position.x + Math.cos(phi) * side, y: v.holder.position.z - Math.sin(phi) * side };
    this.facing = phi;
    this.y = 0;
    this.character.setPose('stand');
    this.character.reach = false;
    this.character.root.rotation.set(0, this.facing, 0);
    this.distance = 3.2;
    this.resolveCollisions(this.pos, RADIUS);
    this.onVehicleParked(v.id, v.holder.position.x, v.holder.position.z, -phi);
    audio.setVehicle(null);
  }

  private updateVehicle(dt: number): void {
    const v = this.vehicle!;
    const spec = v.def.vehicle!;
    const k = this.keys;
    const gas = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const turn = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const max = spec.maxSpeed;
    const before = this.vSpeed;
    if (gas > 0) this.vSpeed += spec.acceleration * dt * (this.vSpeed < 0 ? 2.5 : 1);
    else if (gas < 0) this.vSpeed -= (this.vSpeed > 0 ? spec.acceleration * 2.5 : spec.acceleration * 0.7) * dt;
    else this.vSpeed -= Math.sign(this.vSpeed) * Math.min(Math.abs(this.vSpeed), (0.6 + Math.abs(this.vSpeed) * 0.25) * dt);
    this.vSpeed = Math.max(-max * 0.3, Math.min(max, this.vSpeed));

    // steering eases in and gets gentler at speed
    const limit = spec.maxSteer * (1 - 0.55 * Math.min(1, Math.abs(this.vSpeed) / max));
    this.steer += (turn * limit - this.steer) * Math.min(1, dt * 6);
    const holder = v.holder;
    let phi = holder.rotation.y;
    phi -= (this.vSpeed / spec.wheelbase) * Math.tan(this.steer) * dt;
    const p = { x: holder.position.x + Math.sin(phi) * this.vSpeed * dt, y: holder.position.z + Math.cos(phi) * this.vSpeed * dt };
    const wanted = { ...p };
    this.resolveCollisions(p, spec.radius, v.id, 0);
    if (Math.hypot(p.x - wanted.x, p.y - wanted.y) > 1e-4) this.vSpeed *= 0.6; // bumped into something
    holder.position.set(p.x, this.world.groundAt(p.x, p.y), p.y);
    holder.rotation.y = phi;

    // two-wheelers lean into the turn; cars roll outwards and pitch a little
    const twoWheels = spec.kind === 'bicycle' || spec.kind === 'scooter';
    const accel = (this.vSpeed - before) / Math.max(dt, 1e-3);
    const roll = twoWheels
      ? Math.max(-0.4, Math.min(0.4, this.steer * this.vSpeed * 0.085))
      : Math.max(-0.045, Math.min(0.045, -this.steer * this.vSpeed * 0.006));
    const pitch = twoWheels ? 0 : Math.max(-0.03, Math.min(0.03, -accel * 0.004));
    holder.rotation.z += (roll - holder.rotation.z) * Math.min(1, dt * 6);
    holder.rotation.x += (pitch - holder.rotation.x) * Math.min(1, dt * 5);

    for (const w of (holder.userData.body?.userData.wheels ?? holder.userData.wheels ?? []) as WheelPart[]) {
      w.spin.rotation.x += (this.vSpeed * dt) / Math.max(0.05, w.radius);
      if (w.steer) w.steer.rotation.y = -this.steer;
    }

    // rider
    const c = Math.cos(phi);
    const s = Math.sin(phi);
    const r = spec.rider;
    this.velocity.x = Math.sin(phi) * this.vSpeed;
    this.velocity.y = Math.cos(phi) * this.vSpeed;
    this.pos = { x: p.x + r.x * c + r.z * s, y: p.y - r.x * s + r.z * c };
    this.y = holder.position.y + (spec.rider.pose === 'stand' ? r.y : 0);
    this.facing = phi;
    this.speed = Math.abs(this.vSpeed);
    this.turnRate = 0;

    const moved = Math.abs(this.vSpeed) * dt;
    this.travelled += moved;
    if (this.travelled > 5) {
      report(twoWheels ? 'cycled' : 'drove', this.travelled);
      this.travelled = 0;
    }
    audio.setVehicle({ kind: spec.kind, speed: Math.abs(this.vSpeed), throttle: Math.max(0, gas * Math.sign(this.vSpeed || 1)) });

    // chase camera swings behind the vehicle
    if (!this.dragging && Math.abs(this.vSpeed) > 0.4) {
      this.yaw += wrap(phi + Math.PI - this.yaw) * Math.min(1, dt * 2.2);
    }
  }

  // ---- input ---------------------------------------------------------------------------------

  private onKeyDown = (e: KeyboardEvent): void => {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    if (!e.repeat) {
      switch (e.code) {
        case 'KeyE':
        case 'Enter':
          this.interact();
          return;
        case 'KeyF':
          this.use();
          return;
        case 'KeyV':
          this.onToggleFirstPerson();
          return;
        case 'KeyG':
          this.character.gesture('wave');
          return;
        case 'KeyH':
          if (this.vehicle) {
            const kind = this.vehicle.def.vehicle!.kind;
            audio.play(kind === 'bus' ? 'bus-horn' : kind === 'bicycle' || kind === 'scooter' ? 'bike-bell' : 'horn');
          }
          return;
        case 'KeyZ':
          if (this.seat?.kind === 'lie' && this.asleep <= 0) {
            this.asleep = 4;
            audio.play('yawn', { volume: 0.7 });
            report('slept');
            this.onSleep();
          }
          return;
        case 'Space':
          this.jump();
          break;
      }
      const digit = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
      if (digit && this.seat?.instrument) {
        audio.note(60 + PIANO_SCALE[Number(digit[1]) - 1]);
        report('piano-note');
        return;
      }
    }
    this.keys.add(e.code);
  };
  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };
  private onBlur = (): void => this.keys.clear();
  private onPointerDown = (e: PointerEvent): void => {
    this.dragging = true;
    this.lastPointer = { x: e.clientX, y: e.clientY };
    this.dom.setPointerCapture(e.pointerId);
    audio.unlock();
  };
  private onPointerMove = (e: PointerEvent): void => {
    if (!this.dragging) return;
    const dx = e.clientX - this.lastPointer.x;
    const dy = e.clientY - this.lastPointer.y;
    this.lastPointer = { x: e.clientX, y: e.clientY };
    this.yaw -= dx * 0.005;
    this.pitch = Math.max(-0.5, Math.min(1.2, this.pitch + dy * 0.004));
  };
  private onPointerUp = (): void => {
    this.dragging = false;
  };
  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.distance = Math.max(1.2, Math.min(18, this.distance * Math.exp(e.deltaY * 0.001)));
  };

  private jump(): void {
    if (this.vehicle || this.seat || this.sliding || this.airborne) return;
    this.vy = JUMP_SPEED;
    this.airborne = true;
    audio.play('jump', { volume: 0.6 });
  }

  // ---- collisions & floors -------------------------------------------------------------------

  private resolveCollisions(pos: Vec2, radius: number, ignoreBox?: string, atY?: number): void {
    const y = atY ?? (this.vehicle ? 0 : this.y);
    for (let iter = 0; iter < 4; iter++) {
      for (const w of this.world.walls) {
        if (y < w.y0 - 0.15 || y > w.y1 - 0.5) continue;
        if (w.openY !== undefined && Math.abs(y - w.openY) < 0.45) continue;
        const c = closestOnSegment(pos, w.a, w.b);
        const min = w.half + radius;
        if (c.dist >= min) continue;
        if (c.dist > 1e-5) {
          const k = (min - c.dist) / c.dist;
          pos.x += (pos.x - c.point.x) * k;
          pos.y += (pos.y - c.point.y) * k;
        } else {
          const dx = w.b.x - w.a.x;
          const dy = w.b.y - w.a.y;
          const l = Math.hypot(dx, dy) || 1;
          pos.x += (-dy / l) * min;
          pos.y += (dx / l) * min;
        }
      }
      for (const b of this.world.boxes) {
        if (b.id !== undefined && b.id === ignoreBox) continue;
        if (y > b.y1 - 0.1 || y + 1.4 < b.y0) continue;
        const c = Math.cos(-b.rotation);
        const s = Math.sin(-b.rotation);
        const rx = pos.x - b.x;
        const ry = pos.y - b.y;
        const lx = rx * c - ry * s;
        const ly = rx * s + ry * c;
        const cx = Math.max(-b.hw, Math.min(b.hw, lx));
        const cy = Math.max(-b.hd, Math.min(b.hd, ly));
        let dx = lx - cx;
        let dy = ly - cy;
        const d = Math.hypot(dx, dy);
        let push = 0;
        if (d > 1e-6) {
          if (d >= radius) continue;
          push = radius - d;
          dx /= d;
          dy /= d;
        } else {
          const px = b.hw - Math.abs(lx);
          const py = b.hd - Math.abs(ly);
          if (px < py) {
            dx = Math.sign(lx) || 1;
            dy = 0;
            push = px + radius;
          } else {
            dx = 0;
            dy = Math.sign(ly) || 1;
            push = py + radius;
          }
        }
        const c2 = Math.cos(b.rotation);
        const s2 = Math.sin(b.rotation);
        pos.x += (dx * c2 - dy * s2) * push;
        pos.y += (dx * s2 + dy * c2) * push;
      }
    }
  }

  /** Height on a staircase at this position, if the walker is on one. */
  private stairHeight(p: Vec2, y: number): number | null {
    for (const s of this.world.stairs) {
      if (y < s.y0 - 0.35 || y > s.y1 + 0.35) continue;
      const c = Math.cos(-s.rotation);
      const sn = Math.sin(-s.rotation);
      const dx = p.x - s.x;
      const dy = p.y - s.y;
      const f = stairFraction(s.type, s.w, s.d, dx * c - dy * sn, dx * sn + dy * c);
      if (f !== null) return s.y0 + f * (s.y1 - s.y0);
    }
    return null;
  }

  private bouncerAt(p: Vec2, y: number): WalkBouncer | null {
    for (const b of this.world.bouncers) {
      if (Math.hypot(p.x - b.x, p.y - b.y) < b.radius && y > b.surfaceY - 0.9) return b;
    }
    return null;
  }

  /** Height of the floor under a position for someone currently at height y. */
  private floorHeight(p: Vec2, y: number): number {
    const stair = this.stairHeight(p, y);
    if (stair !== null) {
      this.floorCtx = null;
      return stair;
    }
    for (const floors of this.world.floors) {
      let best = -1;
      for (let i = 0; i < floors.levels.length; i++) {
        const lv = floors.levels[i];
        if (lv.y > y + 0.4) continue;
        // an upper floor carries you where it has rooms, or where the level below forms a terrace
        const here = inRooms(p, lv.rooms) || (i > 0 && inRooms(p, floors.levels[i - 1].rooms));
        if (here && (best < 0 || lv.y > floors.levels[best].y)) best = i;
      }
      if (best > 0) {
        this.floorCtx = { floors, level: best };
        return floors.levels[best].y;
      }
      if (best === 0) {
        this.floorCtx = null;
        return floors.levels[0].y;
      }
    }
    this.floorCtx = null;
    const bouncer = this.bouncerAt(p, y);
    if (bouncer) return bouncer.surfaceY;
    return this.world.groundAt(p.x, p.y);
  }

  /** true when under a roof (any room of any building at this height). */
  private isIndoors(): boolean {
    for (const floors of this.world.floors) {
      for (const lv of floors.levels) {
        if (Math.abs(lv.y - this.y) < 1.2 && inRooms(this.pos, lv.rooms)) return true;
      }
    }
    return false;
  }

  // ---- scripted: the slide -------------------------------------------------------------------

  private updateSlide(dt: number): void {
    const st = this.sliding!;
    const pts = st.slide.points;
    const sliding = st.segment >= st.slide.slideFrom;
    st.speed = sliding ? Math.min(4.2, st.speed + 3.5 * dt) : 1.25;
    let travel = st.speed * dt;
    while (travel > 0 && st.segment < pts.length - 1) {
      const a = pts[st.segment];
      const b = pts[st.segment + 1];
      const len = a.distanceTo(b) || 1e-3;
      const left = (1 - st.t) * len;
      if (travel < left) {
        st.t += travel / len;
        travel = 0;
      } else {
        travel -= left;
        st.segment += 1;
        st.t = 0;
        if (st.segment === st.slide.slideFrom) {
          this.character.setPose('sit', 0.02);
          audio.play('whoosh', { volume: 0.8 });
        }
      }
    }
    if (st.segment >= pts.length - 1) {
      const end = pts[pts.length - 1];
      this.pos = { x: end.x, y: end.z };
      this.y = end.y;
      this.sliding = null;
      this.character.setPose('stand');
      report('slid');
      audio.play('land', { volume: 0.5 });
      return;
    }
    const a = pts[st.segment];
    const b = pts[st.segment + 1];
    _v.lerpVectors(a, b, st.t);
    this.pos = { x: _v.x, y: _v.z };
    this.y = _v.y;
    if (Math.hypot(b.x - a.x, b.z - a.z) > 0.05) this.facing = Math.atan2(b.x - a.x, b.z - a.z);
    this.speed = sliding ? 0 : st.speed;
  }

  // ---- frame ---------------------------------------------------------------------------------

  update(dt: number): void {
    dt = Math.min(dt, 0.05);
    const k = this.keys;
    // camera forward on the ground plane
    const fx = -Math.sin(this.yaw);
    const fy = -Math.cos(this.yaw);
    const ch = this.character;
    let glued = false;
    this.asleep = Math.max(0, this.asleep - dt);

    if (this.vehicle) {
      this.updateVehicle(dt);
    } else if (this.sliding) {
      this.updateSlide(dt);
      this.velocity.x = this.velocity.y = 0;
    } else {
      let fwd = 0;
      let strafe = 0;
      if (k.has('KeyW') || k.has('ArrowUp')) fwd += 1;
      if (k.has('KeyS') || k.has('ArrowDown')) fwd -= 1;
      if (k.has('KeyD') || k.has('ArrowRight')) strafe += 1;
      if (k.has('KeyA') || k.has('ArrowLeft')) strafe -= 1;
      const wantsMove = fwd !== 0 || strafe !== 0;
      const seat = this.seat;
      if (seat?.ride) {
        // on play equipment: W pumps, any other direction gets off
        if (strafe !== 0 || fwd < 0) this.standUp();
      } else if (wantsMove && seat) this.standUp();

      if (this.seat?.ride) {
        const ride = this.seat.ride;
        const moving = ride.runtime.update(dt, fwd > 0 ? 1 : 0, [ride.index]);
        audio.setLoop('swing', moving, 0.5);
        const node = ride.runtime.seatNodes[ride.index];
        if (node) {
          node.updateWorldMatrix(true, false);
          node.getWorldPosition(_v);
          node.getWorldQuaternion(_q);
          // hips rest on the node: the body hangs below it and tilts with it
          const up = new THREE.Vector3(0, 1, 0).applyQuaternion(_q);
          ch.root.quaternion.copy(_q);
          ch.root.position.copy(_v).addScaledVector(up, -0.45);
          this.pos = { x: _v.x, y: _v.z };
          const dir = new THREE.Vector3(0, 0, 1).applyQuaternion(_q);
          this.facing = Math.atan2(dir.x, dir.z);
          glued = true;
        }
        this.speed = 0;
        this.velocity.x = this.velocity.y = 0;
      } else if (wantsMove && !this.seat) {
        const rx = -fy;
        const ry = fx;
        let mx = fx * fwd + rx * strafe;
        let my = fy * fwd + ry * strafe;
        const l = Math.hypot(mx, my) || 1;
        mx /= l;
        my /= l;
        const running = k.has('ShiftLeft') || k.has('ShiftRight');
        const target = running ? RUN_SPEED : WALK_SPEED;
        this.speed += (target - this.speed) * Math.min(1, dt * 8);
        const prev = { ...this.pos };
        const upstairs = this.floorCtx;
        this.pos.x += mx * this.speed * dt;
        this.pos.y += my * this.speed * dt;
        this.resolveCollisions(this.pos, RADIUS);
        // never step off the edge of an upper floor
        if (upstairs && this.stairHeight(this.pos, this.y) === null) {
          const lv = upstairs.floors.levels;
          const ok = inRooms(this.pos, lv[upstairs.level].rooms) || inRooms(this.pos, lv[upstairs.level - 1].rooms);
          if (!ok) this.pos = prev;
        }
        const moved = Math.hypot(this.pos.x - prev.x, this.pos.y - prev.y);
        this.velocity.x = (this.pos.x - prev.x) / dt;
        this.velocity.y = (this.pos.y - prev.y) / dt;
        const turn = wrap(Math.atan2(mx, my) - this.facing);
        this.turnRate = (turn * Math.min(1, dt * 12)) / dt;
        this.facing += turn * Math.min(1, dt * 12);

        // footsteps and distance
        if (!this.airborne) {
          this.stepDistance += moved;
          const stride = running ? 1.05 : 0.72;
          if (this.stepDistance > stride) {
            this.stepDistance = 0;
            this.stepSide = -this.stepSide;
            audio.footstep(this.world.surfaceAt(this.pos.x, this.pos.y, this.y), running ? 0.9 : 0.5);
          }
        }
        this.travelled += moved;
        if (this.travelled > 5) {
          report('walked', this.travelled);
          this.travelled = 0;
        }
      } else {
        this.speed += (0 - this.speed) * Math.min(1, dt * 10);
        this.velocity.x = this.velocity.y = 0;
        this.turnRate = 0;
      }

      // vertical: gravity, landing, trampolines, stairs
      if (!this.seat) {
        const floorY = this.floorHeight(this.pos, this.y);
        if (this.airborne) {
          this.vy -= GRAVITY * dt;
          this.y += this.vy * dt;
          if (this.y <= floorY && this.vy <= 0) {
            this.y = floorY;
            const bouncer = this.bouncerAt(this.pos, this.y + 0.05);
            if (bouncer && Math.abs(floorY - bouncer.surfaceY) < 0.05) {
              // a trampoline throws you back up; hold Space to go higher
              this.vy = JUMP_SPEED * (k.has('Space') ? Math.sqrt(bouncer.boost) * 1.15 : Math.sqrt(bouncer.boost) * 0.8);
              audio.play('bounce', { volume: 0.7 });
              report('bounced');
            } else {
              this.airborne = false;
              this.vy = 0;
              audio.footstep(this.world.surfaceAt(this.pos.x, this.pos.y, this.y), 1);
            }
          }
        } else {
          const bouncer = this.bouncerAt(this.pos, this.y);
          if (bouncer && Math.abs(this.y - bouncer.surfaceY) < 0.06) {
            // standing on the mat: it starts you bouncing
            this.vy = JUMP_SPEED * Math.sqrt(bouncer.boost) * 0.8;
            this.airborne = true;
          } else if (this.y - floorY > 0.45) {
            this.airborne = true; // walked off an edge
            this.vy = 0;
          } else {
            this.y += (floorY - this.y) * Math.min(1, dt * 18);
            if (Math.abs(floorY - this.y) < 0.002) this.y = floorY;
          }
        }
        // arrived on another storey?
        if (this.floorCtx || this.y < 0.3) {
          const levelY = this.floorCtx ? this.floorCtx.floors.levels[this.floorCtx.level].y : 0;
          if (!this.airborne && Math.abs(levelY - this.lastLevelY) > 1.5) {
            this.lastLevelY = levelY;
            report('climbed-stairs');
          }
        }
      }
    }

    // play equipment keeps swinging for a while after the rider left
    for (const ride of this.coasting) {
      if (this.seat?.ride?.runtime === ride) continue;
      if (!ride.update(dt, 0, [])) this.coasting.delete(ride);
    }
    if (!this.seat?.ride) audio.setLoop('swing', false);

    // character
    if (!glued) {
      ch.root.position.set(this.pos.x, this.y, this.pos.y);
      const lean = this.vehicle ? this.vehicle.holder.rotation.z : 0;
      ch.root.rotation.set(0, this.facing, lean, 'YXZ');
    }
    const standingRide = this.vehicle && this.vehicle.def.vehicle!.rider.pose === 'stand';
    const onChute = !!this.sliding && this.sliding.segment >= this.sliding.slide.slideFrom;
    ch.update(dt, standingRide || onChute ? 0 : this.speed, {
      turn: this.turnRate,
      airborne: this.airborne,
      vy: this.vy,
      asleep: this.asleep > 0,
    });
    ch.root.visible = !this.firstPerson;

    // doors
    for (const d of this.world.doors) {
      const near = Math.abs(d.y - this.y) < 1.5 && this.distTo(d.center.x, d.center.y) < (this.vehicle ? 3 : 1.5);
      const next = d.open + ((near ? 1 : 0) - d.open) * Math.min(1, dt * 5);
      if (Math.abs(next - d.open) > 1e-4) {
        const dist = this.distTo(d.center.x, d.center.y);
        const vol = Math.max(0, 1 - dist / 9);
        if (d.open < 0.04 && next >= 0.04 && vol > 0) audio.play(d.sliding ? 'door-slide' : 'door-open', { volume: vol });
        if (d.open > 0.06 && next <= 0.06 && vol > 0) audio.play(d.sliding ? 'door-slide' : 'door-close', { volume: vol * 0.8 });
        d.open = next;
        for (const a of d.anims) {
          if (a.kind === 'swing') a.leaf.rotation.y = a.angle * d.open;
          else a.leaf.position.x = a.leaf.userData.baseX + a.dx * d.open;
        }
      }
    }

    // ambience follows where we are
    this.ambienceTimer -= dt;
    if (this.ambienceTimer <= 0) {
      this.ambienceTimer = 0.4;
      const indoors = this.isIndoors();
      audio.setAmbience({ outdoor: indoors ? 0.12 : 1, night: this.night, wind: 0.3 });
      if (!indoors && this.night > 0.6 && this.speed > 0.5) {
        this.nightTimer += 0.4;
        if (this.nightTimer >= 5) {
          report('night-walk', this.nightTimer);
          this.nightTimer = 0;
        }
      }
    }

    // camera
    const seat = this.seat;
    let headY = this.y + ch.eyeHeight;
    if (seat?.ride) headY = ch.root.position.y + 0.45 + ch.eyeHeight * 0.48;
    else if (seat) headY = seat.kind === 'lie' ? seat.height + 0.35 : seat.height + ch.eyeHeight * 0.52;
    else if (this.vehicle && this.vehicle.def.vehicle!.rider.pose !== 'stand') headY = this.y + this.vehicle.def.vehicle!.rider.y + ch.eyeHeight * 0.5;
    const head = new THREE.Vector3(this.pos.x, headY, this.pos.y);
    if (this.firstPerson) {
      // a little head bob with every step
      if (!this.vehicle && !this.seat && !this.airborne) head.y += Math.sin((this.stepDistance / 0.72) * Math.PI) * 0.035 * Math.min(1, this.speed / WALK_SPEED);
      const look = new THREE.Vector3(fx * Math.cos(this.pitch), -Math.sin(this.pitch), fy * Math.cos(this.pitch));
      this.camera.position.copy(head).addScaledVector(new THREE.Vector3(fx, 0, fy), 0.05);
      this.camera.lookAt(head.clone().add(look));
    } else {
      const pivot = head.clone().add(new THREE.Vector3(0, 0.12, 0));
      const dir = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
      let dist = this.distance;
      this.raycaster.set(pivot, dir);
      this.raycaster.far = this.distance + 0.3;
      const hits = this.raycaster.intersectObjects(this.world.occluders, true);
      if (hits.length) dist = Math.max(0.35, Math.min(dist, hits[0].distance - 0.25));
      // ease out slowly, snap in quickly to never see through walls
      this.camDist = dist < this.camDist ? dist : this.camDist + (dist - this.camDist) * Math.min(1, dt * 4);
      this.camera.position.copy(pivot).addScaledVector(dir, this.camDist);
      this.camera.lookAt(pivot);
      // squeezed against a wall: hide the body instead of filling the screen with the back of a head
      if (this.camDist < 0.95) ch.root.visible = false;
    }

    // hints
    const parts: string[] = [];
    if (this.vehicle) parts.push('W/S – גז ובלם', 'A/D – היגוי', 'H – צופר', 'E – לרדת');
    else if (this.sliding) parts.push('וייייי!');
    else if (this.seat) {
      if (this.seat.ride) parts.push(`החזיקו W כדי ${this.seat.ride.prompt}`);
      if (this.seat.instrument) parts.push('מקשים 1–9 – לנגן');
      if (this.seat.kind === 'lie') parts.push('Z – לישון עד הבוקר');
      parts.push('E – לקום');
    } else {
      const v = this.nearestVehicle();
      const near = this.nearestSeat();
      const slide = this.nearestSlide();
      if (slide) parts.push('E – להתגלש');
      else if (v) parts.push(`E – ${v.def.vehicle!.prompt}`);
      else if (near) parts.push(near.ride ? `E – ${near.ride.prompt}` : near.kind === 'lie' ? `E – לשכב (${near.name})` : `E – לשבת (${near.name})`);
    }
    if (!this.vehicle && !this.sliding) {
      const u = this.nearestUsable();
      if (u) parts.push(`F – ${u.prompt()}`);
    }
    const hint = parts.join(' · ');
    if (hint !== this.lastHint) {
      this.lastHint = hint;
      this.onHint(hint);
    }
  }
}
