import * as THREE from 'three';
import type { FurnitureDef, SeatAnchor } from '../catalog/types';
import { closestOnSegment } from '../model/geom';
import type { Vec2 } from '../model/types';
import type { DoorInstance, WallCollider } from './buildArchitecture';
import { Character } from './Character';

/** Oriented box obstacle (furniture footprint). */
export interface BoxCollider {
  x: number;
  y: number;
  hw: number;
  hd: number;
  rotation: number;
}

export interface SeatInstance {
  pos: Vec2;
  height: number;
  /** world facing angle (plan): direction the seated person looks at */
  dir: Vec2;
  kind: 'sit' | 'lie';
  name: string;
}

export interface WalkWorld {
  walls: WallCollider[];
  boxes: BoxCollider[];
  seats: SeatInstance[];
  doors: DoorInstance[];
  /** meshes that can block the camera (walls, ceilings) */
  occluders: THREE.Object3D[];
}

const RADIUS = 0.22;
const WALK_SPEED = 1.9;
const RUN_SPEED = 3.8;

export function seatsOf(def: FurnitureDef, x: number, y: number, rotation: number, elevation: number): SeatInstance[] {
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
    };
  });
}

/** Third/first-person walking with collisions, door opening and sitting. */
export class WalkController {
  readonly character = new Character();
  pos: Vec2 = { x: 0, y: 0 };
  private facing = 0; // plan angle of the character's forward (atan2(dir.x, dir.y) style handled below)
  private yaw = Math.PI; // camera orbit yaw
  private pitch = 0.32;
  private distance = 3.2;
  private keys = new Set<string>();
  private speed = 0;
  private seat: SeatInstance | null = null;
  private dragging = false;
  private lastPointer = { x: 0, y: 0 };
  private raycaster = new THREE.Raycaster();
  private camDist = 3.2;
  firstPerson = false;
  world: WalkWorld = { walls: [], boxes: [], seats: [], doors: [], occluders: [] };
  onHint: (hint: string) => void = () => {};
  onToggleFirstPerson: () => void = () => {};
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
    this.standUp();
  }

  teleport(p: Vec2, lookYaw = Math.PI): void {
    this.pos = { ...p };
    this.yaw = lookYaw;
    this.facing = lookYaw + Math.PI; // look where the camera looks
    this.seat = null;
    this.character.setPose('stand');
    this.resolveCollisions();
  }

  /** virtual joystick / buttons for touch screens */
  setVirtualKey(code: string, down: boolean): void {
    if (down) this.keys.add(code);
    else this.keys.delete(code);
  }

  interact(): void {
    if (this.seat) {
      this.standUp();
      return;
    }
    const near = this.nearestSeat();
    if (near) {
      this.seat = near;
      this.character.setPose(near.kind, near.height);
      this.pos = { ...near.pos };
      this.facing = Math.atan2(near.dir.x, near.dir.y);
    }
  }

  private standUp(): void {
    if (!this.seat) return;
    const s = this.seat;
    this.seat = null;
    this.character.setPose('stand');
    const side = s.kind === 'lie' ? { x: s.dir.y, y: -s.dir.x } : s.dir;
    const d = s.kind === 'lie' ? 0.9 : 0.5;
    this.pos = { x: s.pos.x + side.x * d, y: s.pos.y + side.y * d };
    this.resolveCollisions();
  }

  private nearestSeat(): SeatInstance | null {
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
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.code === 'KeyE' || e.code === 'Enter') {
      this.interact();
      return;
    }
    if (e.code === 'KeyV') {
      this.onToggleFirstPerson();
      return;
    }
    if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
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
    for (let iter = 0; iter < 4; iter++) {
      for (const w of this.world.walls) {
        const c = closestOnSegment(this.pos, w.a, w.b);
        const min = w.half + RADIUS;
        if (c.dist < min) {
          if (c.dist > 1e-5) {
            const k = (min - c.dist) / c.dist;
            this.pos.x += (this.pos.x - c.point.x) * k;
            this.pos.y += (this.pos.y - c.point.y) * k;
          } else {
            // exactly on the centerline: push sideways
            const dx = w.b.x - w.a.x;
            const dy = w.b.y - w.a.y;
            const l = Math.hypot(dx, dy) || 1;
            this.pos.x += (-dy / l) * min;
            this.pos.y += (dx / l) * min;
          }
        }
      }
      for (const b of this.world.boxes) {
        const c = Math.cos(-b.rotation);
        const s = Math.sin(-b.rotation);
        const rx = this.pos.x - b.x;
        const ry = this.pos.y - b.y;
        const lx = rx * c - ry * s;
        const ly = rx * s + ry * c;
        const cx = Math.max(-b.hw, Math.min(b.hw, lx));
        const cy = Math.max(-b.hd, Math.min(b.hd, ly));
        let dx = lx - cx;
        let dy = ly - cy;
        let d = Math.hypot(dx, dy);
        let push = 0;
        if (d > 1e-6) {
          if (d >= RADIUS) continue;
          push = RADIUS - d;
          dx /= d;
          dy /= d;
        } else {
          // inside the box: leave through the nearest face
          const px = b.hw - Math.abs(lx);
          const py = b.hd - Math.abs(ly);
          if (px < py) {
            dx = Math.sign(lx) || 1;
            dy = 0;
            push = px + RADIUS;
          } else {
            dx = 0;
            dy = Math.sign(ly) || 1;
            push = py + RADIUS;
          }
          d = 0;
        }
        const c2 = Math.cos(b.rotation);
        const s2 = Math.sin(b.rotation);
        this.pos.x += (dx * c2 - dy * s2) * push;
        this.pos.y += (dx * s2 + dy * c2) * push;
      }
    }
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
    if (wantsMove && this.seat) this.standUp();

    // camera forward on the ground plane (camera looks from behind the character)
    const fx = -Math.sin(this.yaw);
    const fy = -Math.cos(this.yaw);
    const rx = -fy;
    const ry = fx;
    let target = 0;
    if (wantsMove && !this.seat) {
      let mx = fx * fwd + rx * strafe;
      let my = fy * fwd + ry * strafe;
      const l = Math.hypot(mx, my) || 1;
      mx /= l;
      my /= l;
      target = k.has('ShiftLeft') || k.has('ShiftRight') ? RUN_SPEED : WALK_SPEED;
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

    // character
    const ch = this.character;
    ch.root.position.set(this.pos.x, 0, this.pos.y);
    ch.root.rotation.y = this.facing;
    ch.update(dt, this.speed);
    ch.root.visible = !this.firstPerson;

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
    const seated = !!this.seat;
    const headY = seated ? (this.seat!.kind === 'lie' ? this.seat!.height + 0.35 : this.seat!.height + ch.eyeHeight * 0.52) : ch.eyeHeight;
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
      if (this.camDist < 0.95) ch.root.visible = false;
    }

    // hints
    let hint = '';
    if (this.seat) hint = 'לחצו E כדי לקום';
    else {
      const near = this.nearestSeat();
      if (near) hint = near.kind === 'lie' ? `לחצו E כדי לשכב (${near.name})` : `לחצו E כדי לשבת (${near.name})`;
    }
    if (hint !== this.lastHint) {
      this.lastHint = hint;
      this.onHint(hint);
    }
  }
}
