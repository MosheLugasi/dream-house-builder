import * as THREE from 'three';
import type { FurnitureDef, SeatAnchor, WheelPart } from '../catalog/types';
import { closestOnSegment, pointInPolygon } from '../model/geom';
import { stairFraction, type StairType } from '../model/stairs';
import type { Vec2 } from '../model/types';
import type { OpeningAnim } from '../catalog/openings';
import { Character, type Activity, type Pose, type Prop } from './Character';
import { sound } from '../audio/sound';

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
  pos: Vec2;
  /** absolute height of the seat surface */
  height: number;
  /** height of the floor the seat stands on */
  floorY: number;
  dir: Vec2;
  kind: 'sit' | 'lie';
  name: string;
  itemId?: string;
}

export interface WalkDoor {
  center: Vec2;
  y: number;
  anims: OpeningAnim[];
  open: number;
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

export interface WalkWorld {
  walls: WalkWall[];
  boxes: WalkBox[];
  seats: SeatInstance[];
  doors: WalkDoor[];
  stairs: WalkStair[];
  floors: WalkFloors[];
  vehicles: WalkVehicle[];
  /** meshes that can block the camera */
  occluders: THREE.Object3D[];
  /** height of the outdoor ground (sidewalks are raised) */
  groundAt: (x: number, y: number) => number;
}

export const RADIUS = 0.22;
const GRAVITY = 9.8;
const ACTION_KEYS = ['KeyE', 'KeyF', 'KeyG', 'KeyT'];

/** Where the character is while it is "using" something (riding a swing, playing piano…). */
export interface OccupationFrame {
  x: number;
  /** plan y */
  y: number;
  /** absolute height of the floor under the character */
  floor: number;
  /** height of the feet / seat base above that floor */
  lift?: number;
  facing: number;
  pose: Pose;
  /** seat height above the floor */
  seatHeight?: number;
  /** body pitch (swings / slides), radians */
  tilt?: number;
  /** walking speed to animate (treadmill) */
  speed?: number;
}

export interface Occupation {
  activity: Activity;
  prop?: Prop;
  /** per-frame transform; return null to end the occupation */
  frame(dt: number): OccupationFrame | null;
  /** consume a key while occupied (instruments); return true if used */
  key?(code: string, down: boolean): boolean;
  /** movement keys do not end it (instruments use letters) */
  lockMovement?: boolean;
  onEnd?(): void;
  /** where to step when it ends */
  exit?: Vec2;
  label: string;
}

/**
 * Push a circle (feet at height y) out of walls and furniture boxes. Returns the summed push
 * (zero when nothing was hit) so moving bodies can bounce.
 */
export function collideCircle(world: WalkWorld, pos: Vec2, radius: number, y: number, ignoreBox?: string): Vec2 {
  const push = { x: 0, y: 0 };
  for (let iter = 0; iter < 4; iter++) {
    for (const w of world.walls) {
      if (y < w.y0 - 0.15 || y > w.y1 - 0.5) continue;
      if (w.openY !== undefined && Math.abs(y - w.openY) < 0.45) continue;
      const c = closestOnSegment(pos, w.a, w.b);
      const min = w.half + radius;
      if (c.dist >= min) continue;
      let nx: number;
      let ny: number;
      if (c.dist > 1e-5) {
        nx = (pos.x - c.point.x) / c.dist;
        ny = (pos.y - c.point.y) / c.dist;
      } else {
        const dx = w.b.x - w.a.x;
        const dy = w.b.y - w.a.y;
        const l = Math.hypot(dx, dy) || 1;
        nx = -dy / l;
        ny = dx / l;
      }
      const d = min - c.dist;
      pos.x += nx * d;
      pos.y += ny * d;
      push.x += nx * d;
      push.y += ny * d;
    }
    for (const b of world.boxes) {
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
      let amount = 0;
      if (d > 1e-6) {
        if (d >= radius) continue;
        amount = radius - d;
        dx /= d;
        dy /= d;
      } else {
        const px = b.hw - Math.abs(lx);
        const py = b.hd - Math.abs(ly);
        if (px < py) {
          dx = Math.sign(lx) || 1;
          dy = 0;
          amount = px + radius;
        } else {
          dx = 0;
          dy = Math.sign(ly) || 1;
          amount = py + radius;
        }
      }
      const c2 = Math.cos(b.rotation);
      const s2 = Math.sin(b.rotation);
      const wx = dx * c2 - dy * s2;
      const wy = dx * s2 + dy * c2;
      pos.x += wx * amount;
      pos.y += wy * amount;
      push.x += wx * amount;
      push.y += wy * amount;
    }
  }
  return push;
}
const WALK_SPEED = 1.9;
const RUN_SPEED = 3.8;

export const emptyWorld = (): WalkWorld => ({
  walls: [],
  boxes: [],
  seats: [],
  doors: [],
  stairs: [],
  floors: [],
  vehicles: [],
  occluders: [],
  groundAt: () => 0,
});

export function seatsOf(def: FurnitureDef, x: number, y: number, rotation: number, floorY: number, elevation: number, itemId?: string): SeatInstance[] {
  const c = Math.cos(rotation);
  const s = Math.sin(rotation);
  return (def.seats ?? []).map((a: SeatAnchor) => {
    const fx = Math.sin(a.facing);
    const fz = Math.cos(a.facing);
    return {
      pos: { x: x + a.x * c - a.z * s, y: y + a.x * s + a.z * c },
      height: floorY + elevation + a.height,
      floorY,
      dir: { x: fx * c - fz * s, y: fx * s + fz * c },
      kind: a.kind ?? 'sit',
      name: def.name,
      itemId,
    };
  });
}

const inRooms = (p: Vec2, rooms: Vec2[][]) => rooms.some((poly) => pointInPolygon(p, poly));

/** Walking, climbing stairs, sitting, and riding vehicles – with a third/first-person camera. */
export class WalkController {
  readonly character = new Character();
  pos: Vec2 = { x: 0, y: 0 };
  /** height of the feet above the ground */
  y = 0;
  facing = 0;
  private yaw = Math.PI;
  private pitch = 0.32;
  private distance = 3.2;
  private keys = new Set<string>();
  speed = 0;
  seat: SeatInstance | null = null;
  occupation: Occupation | null = null;
  private vy = 0;
  private jumpLift = 0;
  private timed: { left: number; restoreProp: Prop } | null = null;
  private dragging = false;
  private lastPointer = { x: 0, y: 0 };
  private raycaster = new THREE.Raycaster();
  private camDist = 3.2;
  private floorCtx: { floors: WalkFloors; level: number } | null = null;
  // driving
  private vehicle: WalkVehicle | null = null;
  private vSpeed = 0;
  private steer = 0;
  firstPerson = false;
  world: WalkWorld = emptyWorld();
  onHint: (hint: string) => void = () => {};
  onToggleFirstPerson: () => void = () => {};
  /** called when a vehicle is parked so that its new place can be saved */
  onVehicleParked: (id: string, x: number, y: number, rotation: number) => void = () => {};
  /** action buttons E/F/G/T → index 0..3 */
  onChoose: ((index: number) => void) | null = null;
  /** other shortcut keys (emotes, photo, time of day…) */
  onShortcut: (code: string) => boolean = () => false;
  private lastHint = '';

  constructor(
    private camera: THREE.PerspectiveCamera,
    private dom: HTMLElement,
  ) {
    this.character.root.rotation.order = 'YXZ';
  }

  enable(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    this.dom.addEventListener('pointerdown', this.onPointerDown);
    this.dom.addEventListener('pointermove', this.onPointerMove);
    this.dom.addEventListener('pointerup', this.onPointerUp);
    this.dom.addEventListener('pointercancel', this.onPointerUp);
    this.dom.addEventListener('wheel', this.onWheel, { passive: false });
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
    this.release();
    this.dismount();
    this.standUp();
    this.timed = null;
    this.character.setActivity('none');
    this.character.setProp('none');
  }

  teleport(p: Vec2, lookYaw = Math.PI, y = 0): void {
    this.release();
    this.dismount();
    this.pos = { ...p };
    this.y = y;
    this.yaw = lookYaw;
    this.facing = lookYaw + Math.PI; // look where the camera looks
    this.seat = null;
    this.floorCtx = null;
    this.character.setPose('stand');
    this.resolveCollisions(this.pos, RADIUS);
    this.y = this.floorHeight(this.pos, this.y);
  }

  get driving(): boolean {
    return !!this.vehicle;
  }

  /** virtual keys for on-screen controls */
  setVirtualKey(code: string, down: boolean): void {
    if (down) this.keys.add(code);
    else this.keys.delete(code);
  }

  /** E: sit / stand up / get on or off a vehicle. */
  interact(): void {
    if (this.occupation) {
      this.release();
      return;
    }
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
    if (v && (!seat || this.distTo(v.holder.position.x, v.holder.position.z) < Math.hypot(seat.pos.x - this.pos.x, seat.pos.y - this.pos.y))) {
      this.mount(v);
    } else if (seat) {
      this.seat = seat;
      this.character.setPose(seat.kind, seat.height - seat.floorY);
      this.pos = { ...seat.pos };
      this.y = seat.floorY;
      this.facing = Math.atan2(seat.dir.x, seat.dir.y);
    }
  }

  private distTo(x: number, y: number): number {
    return Math.hypot(x - this.pos.x, y - this.pos.y);
  }

  /** camera-forward direction on the ground */
  forward(): Vec2 {
    return { x: -Math.sin(this.yaw), y: -Math.cos(this.yaw) };
  }

  /** what E does with vehicles right now (for the action buttons) */
  vehicleAction(): { label: string; run: () => void } | null {
    if (this.vehicle) return { label: 'לרדת מהרכב', run: () => this.dismount() };
    if (this.seat || this.occupation) return null;
    const v = this.nearestVehicle();
    return v ? { label: v.def.vehicle!.prompt, run: () => this.mount(v) } : null;
  }

  sitOn(s: SeatInstance): void {
    this.release();
    this.dismount();
    this.seat = s;
    this.character.setPose(s.kind, s.height - s.floorY);
    this.pos = { ...s.pos };
    this.y = s.floorY;
    this.facing = Math.atan2(s.dir.x, s.dir.y);
  }

  occupy(o: Occupation): void {
    this.release();
    this.dismount();
    this.standUp();
    this.timed = null;
    this.occupation = o;
    this.character.setActivity(o.activity);
    this.character.setProp(o.prop ?? 'none');
  }

  release(): void {
    const o = this.occupation;
    if (!o) return;
    this.occupation = null;
    this.character.root.rotation.x = 0;
    this.character.lift = 0;
    this.character.setPose('stand');
    this.character.setActivity('none');
    this.character.setProp('none');
    if (o.exit) this.pos = { ...o.exit };
    o.onEnd?.();
    this.resolveCollisions(this.pos, RADIUS);
  }

  /** play an activity for a while (cancelled by walking away) */
  playFor(activity: Activity, seconds: number, prop?: Prop): void {
    const restore = this.character.getProp();
    this.character.setActivity(activity);
    if (prop) this.character.setProp(prop);
    this.timed = { left: seconds, restoreProp: prop ? restore : this.character.getProp() };
  }

  endTimed(): void {
    if (!this.timed) return;
    const t = this.timed;
    this.timed = null;
    this.character.setActivity(this.seat?.kind === 'sit' && this.character.getProp() === 'book' ? 'read' : 'none');
    this.character.setProp(t.restoreProp);
  }

  /** face towards a plan point */
  faceTo(p: Vec2): void {
    this.facing = Math.atan2(p.x - this.pos.x, p.y - this.pos.y);
  }

  jump(): void {
    if (this.occupation || this.vehicle || this.jumpLift > 0.001) return;
    if (this.seat) {
      this.standUp();
      return;
    }
    this.vy = 3.4;
    this.jumpLift = 0.001;
    this.character.setActivity('jump');
    sound.sfx('whoosh', 0.4);
  }

  standUp(): void {
    if (!this.seat) return;
    const s = this.seat;
    this.seat = null;
    this.character.setPose('stand');
    if (this.character.getActivity() === 'read' || this.character.getActivity() === 'sleep') this.character.setActivity('none');
    const side = s.kind === 'lie' ? { x: s.dir.y, y: -s.dir.x } : s.dir;
    const d = s.kind === 'lie' ? 0.9 : 0.5;
    this.pos = { x: s.pos.x + side.x * d, y: s.pos.y + side.y * d };
    this.resolveCollisions(this.pos, RADIUS);
  }

  nearestSeat(): SeatInstance | null {
    let best: SeatInstance | null = null;
    let bestScore = Infinity;
    for (const s of this.world.seats) {
      if (Math.abs(s.floorY - this.y) > 0.6) continue;
      const d = this.distTo(s.pos.x, s.pos.y);
      // a bed's anchor is the middle of the mattress, so it must be reachable from the bed's edge
      const reach = s.kind === 'lie' ? 1.75 : 1.15;
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
      const spec = v.def.vehicle;
      if (!spec) continue;
      const d = this.distTo(v.holder.position.x, v.holder.position.z);
      if (d < Math.max(v.def.size.w, v.def.size.d) / 2 + 1.1 && d < bestD) {
        bestD = d;
        best = v;
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
    this.character.setPose(spec.rider.pose === 'stand' ? 'stand' : spec.rider.pose, spec.rider.y);
    this.character.reach = spec.rider.pose === 'stand';
    this.distance = spec.cameraDistance ?? 6;
    this.camDist = this.distance;
    this.yaw = v.holder.rotation.y + Math.PI;
  }

  private dismount(): void {
    const v = this.vehicle;
    if (!v) return;
    this.vehicle = null;
    const phi = v.holder.rotation.y;
    // step off to the vehicle's left (+X local)
    const side = v.def.size.w / 2 + 0.45;
    this.pos = { x: v.holder.position.x + Math.cos(phi) * side, y: v.holder.position.z - Math.sin(phi) * side };
    this.facing = phi;
    this.y = 0;
    this.character.setPose('stand');
    this.character.reach = false;
    this.distance = 3.2;
    this.resolveCollisions(this.pos, RADIUS);
    this.onVehicleParked(v.id, v.holder.position.x, v.holder.position.z, -phi);
  }

  private updateVehicle(dt: number): void {
    const v = this.vehicle!;
    const spec = v.def.vehicle!;
    const k = this.keys;
    const gas = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const turn = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const max = spec.maxSpeed;
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
    const before = { ...p };
    this.resolveCollisions(p, spec.radius, v.id);
    if (Math.hypot(p.x - before.x, p.y - before.y) > 1e-4) this.vSpeed *= 0.6; // bumped into something
    holder.position.set(p.x, this.world.groundAt(p.x, p.y), p.y);
    holder.rotation.y = phi;

    for (const w of (holder.userData.body?.userData.wheels ?? holder.userData.wheels ?? []) as WheelPart[]) {
      w.spin.rotation.x += (this.vSpeed * dt) / Math.max(0.05, w.radius);
      if (w.steer) w.steer.rotation.y = -this.steer;
    }

    // rider
    const c = Math.cos(phi);
    const s = Math.sin(phi);
    const r = spec.rider;
    this.pos = { x: p.x + r.x * c + r.z * s, y: p.y - r.x * s + r.z * c };
    this.y = holder.position.y + (spec.rider.pose === 'stand' ? r.y : 0);
    this.facing = phi;
    this.speed = Math.abs(this.vSpeed);

    // chase camera swings behind the vehicle
    if (!this.dragging && Math.abs(this.vSpeed) > 0.4) {
      let diff = phi + Math.PI - this.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.yaw += diff * Math.min(1, dt * 2.2);
    }
  }

  // ---- input ---------------------------------------------------------------------------------

  private onKeyDown = (e: KeyboardEvent): void => {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    sound.unlock();
    if (this.occupation?.key && this.occupation.key(e.code, !e.repeat || e.code.startsWith('Arrow'))) {
      e.preventDefault();
      return;
    }
    if (e.code === 'Escape' && this.occupation) {
      this.release();
      return;
    }
    const ai = ACTION_KEYS.indexOf(e.code);
    if (ai >= 0 || e.code === 'Enter') {
      if (e.repeat) return;
      // while driving, E gets off; otherwise the action buttons decide
      if (this.vehicle || !this.onChoose) this.interact();
      else this.onChoose(ai >= 0 ? ai : 0);
      return;
    }
    if (e.code === 'KeyV') {
      if (!e.repeat) this.onToggleFirstPerson();
      return;
    }
    if (e.code === 'Space') {
      e.preventDefault();
      if (!e.repeat) this.jump();
      return;
    }
    if (!e.repeat && !this.vehicle && this.onShortcut(e.code)) {
      e.preventDefault();
      return;
    }
    if (e.code.startsWith('Arrow')) e.preventDefault();
    this.keys.add(e.code);
  };
  private onKeyUp = (e: KeyboardEvent): void => {
    if (this.occupation?.key) this.occupation.key(e.code, false);
    this.keys.delete(e.code);
  };
  private onBlur = (): void => this.keys.clear();
  private onPointerDown = (e: PointerEvent): void => {
    sound.unlock();
    this.dragging = true;
    this.lastPointer = { x: e.clientX, y: e.clientY };
    this.dom.setPointerCapture(e.pointerId);
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

  // ---- collisions & floors -------------------------------------------------------------------

  private resolveCollisions(pos: Vec2, radius: number, ignoreBox?: string): void {
    collideCircle(this.world, pos, radius, this.vehicle ? 0 : this.y, ignoreBox);
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
    return this.world.groundAt(p.x, p.y);
  }

  // ---- frame ---------------------------------------------------------------------------------

  update(dt: number): void {
    dt = Math.min(dt, 0.05);
    const k = this.keys;
    // camera forward on the ground plane
    const fx = -Math.sin(this.yaw);
    const fy = -Math.cos(this.yaw);

    const moveKey = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].some((c) => k.has(c));
    if (moveKey && this.occupation && !this.occupation.lockMovement) this.release();
    if (moveKey && this.timed) this.endTimed();
    if (this.timed) {
      this.timed.left -= dt;
      if (this.timed.left <= 0) this.endTimed();
    }
    let occ: OccupationFrame | null = null;
    if (this.occupation) {
      occ = this.occupation.frame(dt);
      if (!occ) this.release();
    }

    if (occ) {
      this.pos = { x: occ.x, y: occ.y };
      this.y = occ.floor;
      this.facing = occ.facing;
      this.character.setPose(occ.pose, occ.seatHeight ?? 0.45);
      this.speed = 0;
    } else if (this.vehicle) {
      this.updateVehicle(dt);
    } else {
      let fwd = 0;
      let strafe = 0;
      if (k.has('KeyW') || k.has('ArrowUp')) fwd += 1;
      if (k.has('KeyS') || k.has('ArrowDown')) fwd -= 1;
      if (k.has('KeyD') || k.has('ArrowRight')) strafe += 1;
      if (k.has('KeyA') || k.has('ArrowLeft')) strafe -= 1;
      const wantsMove = fwd !== 0 || strafe !== 0;
      if (wantsMove && this.seat) this.standUp();
      if (wantsMove && !this.seat) {
        const rx = -fy;
        const ry = fx;
        let mx = fx * fwd + rx * strafe;
        let my = fy * fwd + ry * strafe;
        const l = Math.hypot(mx, my) || 1;
        mx /= l;
        my /= l;
        const target = k.has('ShiftLeft') || k.has('ShiftRight') ? RUN_SPEED : WALK_SPEED;
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
        const want = Math.atan2(mx, my);
        let diff = want - this.facing;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.facing += diff * Math.min(1, dt * 12);
      } else {
        this.speed += (0 - this.speed) * Math.min(1, dt * 10);
      }
      if (!this.seat) {
        const targetY = this.floorHeight(this.pos, this.y);
        this.y += (targetY - this.y) * Math.min(1, dt * 18);
        if (Math.abs(targetY - this.y) < 0.002) this.y = targetY;
      }
      // jumping
      if (this.jumpLift > 0) {
        this.vy -= GRAVITY * dt;
        this.jumpLift += this.vy * dt;
        if (this.jumpLift <= 0) {
          this.jumpLift = 0;
          this.vy = 0;
          sound.sfx('bounce', 0.3);
        }
      }
    }

    // character
    const ch = this.character;
    ch.root.position.set(this.pos.x, this.y, this.pos.y);
    ch.root.rotation.y = this.facing;
    ch.root.rotation.x = occ?.tilt ?? 0;
    ch.lift = occ ? (occ.lift ?? 0) : this.jumpLift;
    const animSpeed = occ ? (occ.speed ?? 0) : this.jumpLift > 0 ? 0 : this.vehicle && this.vehicle.def.vehicle!.rider.pose === 'stand' ? 0 : this.speed;
    ch.update(dt, animSpeed);
    ch.root.visible = !this.firstPerson;

    // doors
    for (const d of this.world.doors) {
      const near = Math.abs(d.y - this.y) < 1.5 && this.distTo(d.center.x, d.center.y) < (this.vehicle ? 3 : 1.5);
      const next = d.open + ((near ? 1 : 0) - d.open) * Math.min(1, dt * 5);
      if (Math.abs(next - d.open) > 1e-4) {
        d.open = next;
        for (const a of d.anims) {
          if (a.kind === 'swing') a.leaf.rotation.y = a.angle * d.open;
          else a.leaf.position.x = a.leaf.userData.baseX + a.dx * d.open;
        }
      }
    }

    // camera
    const seat = this.seat;
    let headY = this.y + ch.eyeHeight + this.jumpLift;
    if (occ) {
      const l = this.y + (occ.lift ?? 0);
      headY = occ.pose === 'lie' ? l + (occ.seatHeight ?? 0.5) + 0.35 : occ.pose === 'stand' ? l + ch.eyeHeight : l + (occ.seatHeight ?? 0.45) + ch.eyeHeight * 0.52;
    } else if (seat) headY = seat.kind === 'lie' ? seat.height + 0.35 : seat.height + ch.eyeHeight * 0.52;
    else if (this.vehicle && this.vehicle.def.vehicle!.rider.pose !== 'stand') headY = this.y + this.vehicle.def.vehicle!.rider.y + ch.eyeHeight * 0.5;
    const head = new THREE.Vector3(this.pos.x, headY, this.pos.y);
    if (this.firstPerson) {
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
    let hint = '';
    if (this.occupation) hint = `${this.occupation.label} · ${this.occupation.lockMovement ? 'Esc' : 'E / Esc'} לסיום`;
    else if (this.onChoose && !this.vehicle) hint = '';
    else if (this.vehicle) hint = 'W/S – גז ובלם · A/D – היגוי · E – לרדת';
    else if (this.seat) hint = 'לחצו E כדי לקום';
    else {
      const v = this.nearestVehicle();
      const near = this.nearestSeat();
      if (v) hint = `לחצו E כדי ${v.def.vehicle!.prompt}`;
      else if (near) hint = near.kind === 'lie' ? `לחצו E כדי לשכב (${near.name})` : `לחצו E כדי לשבת (${near.name})`;
    }
    if (hint !== this.lastHint) {
      this.lastHint = hint;
      this.onHint(hint);
    }
  }
}
