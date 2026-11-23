import * as THREE from 'three';
import type { FurnitureDef, SeatAnchor } from '../catalog/types';
import { closestOnSegment } from '../model/geom';
import type { Vec2 } from '../model/types';
import type { DoorInstance, WallCollider } from './buildArchitecture';
import { Character, type Activity, type Pose, type Prop } from './Character';
import { sound } from '../audio/sound';

/** Oriented box obstacle (furniture footprint). */
export interface BoxCollider {
  x: number;
  y: number;
  hw: number;
  hd: number;
  rotation: number;
  /** id of the furniture item (lets moving objects ignore themselves) */
  id?: string;
  /** top of the obstacle above the floor (balls can fly over low things) */
  top?: number;
}

export interface SeatInstance {
  pos: Vec2;
  height: number;
  /** world facing angle (plan): direction the seated person looks at */
  dir: Vec2;
  kind: 'sit' | 'lie';
  name: string;
  itemId?: string;
}

export interface WalkWorld {
  walls: WallCollider[];
  boxes: BoxCollider[];
  seats: SeatInstance[];
  doors: DoorInstance[];
  /** meshes that can block the camera (walls, ceilings) */
  occluders: THREE.Object3D[];
}

/** Where the character is while it is "using" something (riding a swing, playing piano…). */
export interface OccupationFrame {
  x: number;
  /** plan y */
  y: number;
  /** height of the feet / seat base above the floor */
  lift?: number;
  facing: number;
  pose: Pose;
  seatHeight?: number;
  /** body pitch (swings / slides), radians */
  tilt?: number;
  /** walking speed to animate (treadmill) */
  speed?: number;
}

export interface Occupation {
  /** activity played while occupied */
  activity: Activity;
  prop?: Prop;
  /** per-frame transform; return null to end the occupation */
  frame(dt: number): OccupationFrame | null;
  /** consume a key while occupied (instruments); return true if used */
  key?(code: string, down: boolean): boolean;
  /** movement keys do not end it (e.g. instruments use letters) */
  lockMovement?: boolean;
  onEnd?(): void;
  /** where to step when it ends */
  exit?: Vec2;
  label: string;
}

export const RADIUS = 0.22;
const WALK_SPEED = 1.9;
const RUN_SPEED = 3.8;
const GRAVITY = 9.8;

export function seatsOf(def: FurnitureDef, x: number, y: number, rotation: number, elevation: number, itemId?: string): SeatInstance[] {
  const c = Math.cos(rotation);
  const s = Math.sin(rotation);
  return (def.seats ?? []).map((a: SeatAnchor) => {
    const fx = Math.sin(a.facing);
    const fz = Math.cos(a.facing);
    return {
      pos: { x: x + a.x * c - a.z * s, y: y + a.x * s + a.z * c },
      height: a.height + elevation,
      dir: { x: fx * c - fz * s, y: fx * s + fz * c },
      kind: a.kind ?? 'sit',
      name: def.name,
      itemId,
    };
  });
}

/**
 * Push a circle out of walls and furniture boxes. Returns the summed push direction
 * (zero vector when nothing was hit) so moving bodies can bounce.
 */
export function collideCircle(world: WalkWorld, pos: Vec2, radius: number, opts: { ignore?: string; height?: number } = {}): Vec2 {
  const push = { x: 0, y: 0 };
  for (let iter = 0; iter < 4; iter++) {
    for (const w of world.walls) {
      const c = closestOnSegment(pos, w.a, w.b);
      const min = w.half + radius;
      if (c.dist < min) {
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
    }
    for (const b of world.boxes) {
      if (opts.ignore && b.id === opts.ignore) continue;
      if (opts.height !== undefined && b.top !== undefined && opts.height > b.top + radius) continue;
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

const ACTION_KEYS = ['KeyE', 'KeyF', 'KeyG', 'KeyT'];

/** Third/first-person walking with collisions, door opening, sitting, jumping and occupations. */
export class WalkController {
  readonly character = new Character();
  pos: Vec2 = { x: 0, y: 0 };
  facing = 0;
  private yaw = Math.PI; // camera orbit yaw
  private pitch = 0.32;
  private distance = 3.2;
  private keys = new Set<string>();
  speed = 0;
  seat: SeatInstance | null = null;
  occupation: Occupation | null = null;
  private dragging = false;
  private lastPointer = { x: 0, y: 0 };
  private raycaster = new THREE.Raycaster();
  private camDist = 3.2;
  private vy = 0;
  private lift = 0;
  private timed: { left: number; restoreProp: Prop } | null = null;
  firstPerson = false;
  world: WalkWorld = { walls: [], boxes: [], seats: [], doors: [], occluders: [] };
  onHint: (hint: string) => void = () => {};
  onToggleFirstPerson: () => void = () => {};
  /** action buttons E/F/G/T → index 0..3 */
  onChoose: (index: number) => void = () => {};
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
    this.standUp();
    this.character.setActivity('none');
    this.character.setProp('none');
    this.timed = null;
  }

  teleport(p: Vec2, lookYaw = Math.PI): void {
    this.pos = { ...p };
    this.yaw = lookYaw;
    this.facing = lookYaw + Math.PI; // look where the camera looks
    this.seat = null;
    this.occupation = null;
    this.character.setPose('stand');
    this.resolveCollisions();
  }

  /** virtual joystick / buttons for touch screens */
  setVirtualKey(code: string, down: boolean): void {
    if (down) this.keys.add(code);
    else this.keys.delete(code);
  }

  /** camera-forward direction on the ground */
  forward(): Vec2 {
    return { x: -Math.sin(this.yaw), y: -Math.cos(this.yaw) };
  }

  isBusy(): boolean {
    return !!this.seat || !!this.occupation;
  }

  sitOn(s: SeatInstance): void {
    this.release();
    this.seat = s;
    this.character.setPose(s.kind, s.height);
    this.pos = { ...s.pos };
    this.facing = Math.atan2(s.dir.x, s.dir.y);
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
    this.resolveCollisions();
  }

  occupy(o: Occupation): void {
    this.release();
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
    const root = this.character.root;
    root.rotation.x = 0;
    root.position.y = 0;
    this.character.lift = 0;
    this.lift = 0;
    this.vy = 0;
    this.character.setPose('stand');
    this.character.setActivity('none');
    this.character.setProp('none');
    if (o.exit) this.pos = { ...o.exit };
    o.onEnd?.();
    this.resolveCollisions();
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
    if (this.occupation || this.lift > 0.001) return;
    if (this.seat) {
      this.standUp();
      return;
    }
    this.vy = 3.4;
    this.lift = 0.001;
    this.character.setActivity('jump');
    sound.sfx('whoosh', 0.4);
  }

  nearestSeat(): SeatInstance | null {
    let best: SeatInstance | null = null;
    let bestScore = Infinity;
    for (const s of this.world.seats) {
      const d = Math.hypot(s.pos.x - this.pos.x, s.pos.y - this.pos.y);
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

  private onKeyDown = (e: KeyboardEvent): void => {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.repeat && !e.code.startsWith('Arrow') && !['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) return;
    sound.unlock();
    if (this.occupation?.key && this.occupation.key(e.code, true)) {
      e.preventDefault();
      return;
    }
    if (e.code === 'Escape' && this.occupation) {
      this.release();
      return;
    }
    const ai = ACTION_KEYS.indexOf(e.code);
    if (ai >= 0 || e.code === 'Enter') {
      this.onChoose(ai >= 0 ? ai : 0);
      return;
    }
    if (e.code === 'KeyV') {
      this.onToggleFirstPerson();
      return;
    }
    if (e.code === 'Space') {
      e.preventDefault();
      if (this.occupation?.key && this.occupation.key('Space', true)) return;
      this.jump();
      return;
    }
    if (this.onShortcut(e.code)) {
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
    this.distance = Math.max(1.2, Math.min(9, this.distance * Math.exp(e.deltaY * 0.001)));
  };

  private resolveCollisions(): void {
    collideCircle(this.world, this.pos, RADIUS);
  }

  update(dt: number): void {
    dt = Math.min(dt, 0.05);
    const k = this.keys;
    let fwd = 0;
    let strafe = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) fwd += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) fwd -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) strafe += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) strafe -= 1;
    const wantsMove = fwd !== 0 || strafe !== 0;
    if (wantsMove && this.occupation && !this.occupation.lockMovement) this.release();
    if (wantsMove && this.seat) this.standUp();
    if (wantsMove && this.timed) this.endTimed();
    if (this.timed) {
      this.timed.left -= dt;
      if (this.timed.left <= 0) this.endTimed();
    }

    // camera forward on the ground plane (camera looks from behind the character)
    const fx = -Math.sin(this.yaw);
    const fy = -Math.cos(this.yaw);
    const rx = -fy;
    const ry = fx;
    const ch = this.character;
    const root = ch.root;
    let animSpeed = 0;
    let headLift = 0;

    if (this.occupation) {
      const f = this.occupation.frame(dt);
      if (!f) {
        this.release();
      } else {
        this.pos = { x: f.x, y: f.y };
        this.facing = f.facing;
        ch.setPose(f.pose, f.seatHeight ?? 0.45);
        root.position.set(f.x, 0, f.y);
        root.rotation.x = f.tilt ?? 0;
        ch.lift = f.lift ?? 0;
        headLift = ch.lift;
        animSpeed = f.speed ?? 0;
        this.speed = 0;
      }
    }
    if (!this.occupation) {
      if (wantsMove && !this.seat) {
        let mx = fx * fwd + rx * strafe;
        let my = fy * fwd + ry * strafe;
        const l = Math.hypot(mx, my) || 1;
        mx /= l;
        my /= l;
        const target = k.has('ShiftLeft') || k.has('ShiftRight') ? RUN_SPEED : WALK_SPEED;
        this.speed += (target - this.speed) * Math.min(1, dt * 8);
        this.pos.x += mx * this.speed * dt;
        this.pos.y += my * this.speed * dt;
        const want = Math.atan2(mx, my);
        let diff = want - this.facing;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.facing += diff * Math.min(1, dt * 12);
        this.resolveCollisions();
      } else {
        this.speed += (0 - this.speed) * Math.min(1, dt * 10);
      }
      // jumping
      if (this.lift > 0) {
        this.vy -= GRAVITY * dt;
        this.lift += this.vy * dt;
        if (this.lift <= 0) {
          this.lift = 0;
          this.vy = 0;
          sound.sfx('bounce', 0.3);
        }
      }
      ch.lift = this.lift;
      headLift = this.lift;
      root.position.set(this.pos.x, 0, this.pos.y);
      root.rotation.x = 0;
      animSpeed = this.lift > 0 ? 0 : this.speed;
    }

    // character
    root.rotation.y = this.facing;
    ch.update(dt, animSpeed);
    root.visible = !this.firstPerson;

    // doors
    for (const d of this.world.doors) {
      const near = Math.hypot(d.center.x - this.pos.x, d.center.y - this.pos.y) < 1.5;
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
    const seatH = this.seat ? this.seat : null;
    const pose = ch.getPose();
    let headY: number;
    if (seatH) headY = seatH.kind === 'lie' ? seatH.height + 0.35 : seatH.height + ch.eyeHeight * 0.52;
    else if (this.occupation && pose !== 'stand') headY = headLift + (pose === 'lie' ? 0.8 : 0.45 + ch.eyeHeight * 0.52);
    else headY = ch.eyeHeight + headLift;
    const head = new THREE.Vector3(this.pos.x, headY, this.pos.y);
    if (this.firstPerson) {
      const look = new THREE.Vector3(fx * Math.cos(this.pitch), -Math.sin(this.pitch), fy * Math.cos(this.pitch));
      this.camera.position.copy(head).addScaledVector(new THREE.Vector3(fx, 0, fy), 0.05);
      this.camera.lookAt(head.clone().add(look));
    } else {
      const pivot = head.clone().add(new THREE.Vector3(0, 0.12, 0));
      const dir = new THREE.Vector3(
        Math.sin(this.yaw) * Math.cos(this.pitch),
        Math.sin(this.pitch),
        Math.cos(this.yaw) * Math.cos(this.pitch),
      );
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
      if (this.camDist < 0.95) root.visible = false;
    }

    // hint
    const hint = this.occupation ? `${this.occupation.label} · E / Esc לסיום` : '';
    if (hint !== this.lastHint) {
      this.lastHint = hint;
      this.onHint(hint);
    }
  }
}
