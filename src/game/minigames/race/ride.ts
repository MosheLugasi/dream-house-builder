import * as THREE from 'three';
import { getFurniture, resolveColors } from '../../../catalog';
import type { FurnitureDef, VehicleSpec, WheelPart } from '../../../catalog/types';
import type { Vec2 } from '../../../model/types';
import { Character } from '../../../render3d/Character';
import { randomLook } from '../../../render3d/characterTypes';
import type { CharacterLook } from '../../../render3d/characterTypes';
import type { WalkBox, WalkVehicle, WalkWorld } from '../../../render3d/WalkController';
import type { MiniGameContext } from '../types';

/**
 * Shared helpers of team A's games (race, delivery): vehicles that exist only during a round (built
 * under `ctx.root`, registered in the walk world so the player can ride them), extra obstacles, and
 * NPC riders.
 */

export interface GameVehicle {
  /** id in the walk world (never a project id) */
  id: string;
  def: FurnitureDef;
  holder: THREE.Group;
  body: THREE.Object3D;
  wheels: WheelPart[];
  entry: WalkVehicle;
}

/** plan heading (direction of travel, unit vector) → `rotation.y` of an object whose front is +Z */
export const yawOf = (dx: number, dy: number): number => Math.atan2(dx, dy);

/** Build a catalog vehicle for this round, optionally tuned (faster race bikes…). */
export function makeVehicle(
  ctx: MiniGameContext,
  id: string,
  catalogId: string,
  colors?: Record<string, string>,
  tune?: Partial<VehicleSpec>,
): GameVehicle | null {
  const base = getFurniture(catalogId);
  if (!base?.vehicle) return null;
  const def: FurnitureDef = tune ? { ...base, vehicle: { ...base.vehicle, ...tune } } : base;
  const body = base.build({ colors: resolveColors(base, colors) });
  const holder = new THREE.Group();
  holder.name = id;
  holder.add(body);
  holder.userData.body = body;
  holder.rotation.order = 'YXZ';
  ctx.root.add(holder);
  const wheels = ((body.userData.wheels ?? holder.userData.wheels ?? []) as WheelPart[]).slice();
  return { id, def, holder, body, wheels, entry: { id, def, holder } };
}

/** Place a vehicle on the ground at a plan point, facing a plan direction. */
export function placeVehicle(ctx: MiniGameContext, v: GameVehicle, p: Vec2, heading: number): void {
  v.holder.position.set(p.x, ctx.groundAt(p.x, p.y), p.y);
  v.holder.rotation.set(0, heading, 0);
}

/** The walk controller's driving speed is private; games reset it on a restart / respawn. */
export function setDriveSpeed(ctx: MiniGameContext, speed: number): void {
  const w = ctx.walk as unknown as { vSpeed?: number; steer?: number };
  if (typeof w.vSpeed === 'number') w.vSpeed = speed;
  if (typeof w.steer === 'number') w.steer = 0;
}

/**
 * Keeps the round's vehicles and obstacles in the walk world (the world is rebuilt whenever the
 * project changes), stops the parking of round-only vehicles from being saved into the project, and
 * optionally clears the street traffic out of the way. Call `sync()` every frame and `dispose()` at
 * the end.
 */
export class WorldHooks {
  private vehicles: WalkVehicle[] = [];
  readonly boxes: WalkBox[] = [];
  private world: WalkWorld | null = null;
  private removedTraffic: WalkBox[] = [];
  private trafficGroup: THREE.Object3D | null = null;
  private trafficWasVisible = true;
  private prevParked: ((id: string, x: number, y: number, rotation: number) => void) | null = null;
  /** project props cleared away for the round (hidden, not solid) */
  private cleared = new Map<string, THREE.Object3D | undefined>();

  constructor(
    private ctx: MiniGameContext,
    private opts: { hideTraffic?: boolean } = {},
  ) {
    const walk = ctx.walk;
    const prev = walk.onVehicleParked;
    this.prevParked = prev;
    walk.onVehicleParked = (id, x, y, rotation) => {
      if (this.vehicles.some((v) => v.id === id)) return;
      prev(id, x, y, rotation);
    };
  }

  addVehicle(v: GameVehicle): void {
    this.vehicles.push(v.entry);
    this.world?.vehicles.push(v.entry);
  }

  addBox(b: WalkBox): WalkBox {
    this.boxes.push(b);
    this.world?.boxes.push(b);
    return b;
  }

  sync(): void {
    const world = this.ctx.world();
    if (world !== this.world) {
      this.world = world;
      for (const v of this.vehicles) if (!world.vehicles.includes(v)) world.vehicles.push(v);
      for (const b of this.boxes) if (!world.boxes.includes(b)) world.boxes.push(b);
      if (this.opts.hideTraffic) this.clearTraffic(world);
      if (this.cleared.size) this.applyCleared(world);
    }
  }

  /**
   * Take project props out of the way for the round (a parked car or a lamp post standing on the
   * race's asphalt): hidden and not solid until the round ends. The project is not changed.
   */
  clearProps(props: ReadonlyArray<{ item: { id: string }; holder: THREE.Object3D | undefined }>): void {
    for (const p of props) {
      if (this.cleared.has(p.item.id)) continue;
      this.cleared.set(p.item.id, p.holder);
    }
    if (this.world) this.applyCleared(this.world);
  }

  private applyCleared(world: WalkWorld): void {
    world.boxes = world.boxes.filter((b) => !(b.id !== undefined && this.cleared.has(b.id)));
    world.vehicles = world.vehicles.filter((v) => !this.cleared.has(v.id));
    for (const h of this.cleared.values()) if (h) h.visible = false;
  }

  /** the street traffic drives through the circuit: take its cars out of the race for a while */
  private clearTraffic(world: WalkWorld): void {
    const traffic = world.boxes.filter((b) => b.id?.startsWith('traffic-'));
    if (!traffic.length) return;
    for (const b of traffic) {
      world.boxes.splice(world.boxes.indexOf(b), 1);
      if (!this.removedTraffic.includes(b)) this.removedTraffic.push(b);
    }
    if (!this.trafficGroup) {
      // the traffic layer is the scene group whose children stand where the traffic cars are
      for (const g of this.ctx.scene.children) {
        if (g === this.ctx.root || !g.children.length) continue;
        const hit = g.children.some((c) => traffic.some((b) => Math.abs(c.position.x - b.x) < 1e-3 && Math.abs(c.position.z - b.y) < 1e-3));
        if (hit) {
          this.trafficGroup = g;
          this.trafficWasVisible = g.visible;
          g.visible = false;
          break;
        }
      }
    }
  }

  /** the round is running: keep the traffic and cleared props hidden even if the engine shows them again */
  frame(): void {
    if (this.trafficGroup && this.trafficGroup.visible) this.trafficGroup.visible = false;
    for (const h of this.cleared.values()) if (h && h.visible) h.visible = false;
  }

  dispose(): void {
    const world = this.ctx.world();
    world.vehicles = world.vehicles.filter((v) => !this.vehicles.includes(v));
    world.boxes = world.boxes.filter((b) => !this.boxes.includes(b));
    if (world === this.world) for (const b of this.removedTraffic) if (!world.boxes.includes(b)) world.boxes.push(b);
    if (this.trafficGroup) this.trafficGroup.visible = this.trafficWasVisible;
    for (const h of this.cleared.values()) if (h) h.visible = true;
    this.cleared.clear();
    if (this.prevParked) this.ctx.walk.onVehicleParked = this.prevParked;
    this.vehicles = [];
  }
}

/** After a round: stand in front of the game's start sign again (off any round vehicle). */
export function backToSign(ctx: MiniGameContext, catalogId: string): void {
  const sign = ctx.project().site.props.find((f) => f.catalogId === catalogId);
  if (!sign) return;
  const fx = -Math.sin(sign.rotation);
  const fy = Math.cos(sign.rotation);
  const p = { x: sign.x + fx * 2.2, y: sign.y + fy * 2.2 };
  ctx.walk.teleport(p, Math.atan2(fx, fy), ctx.groundAt(p.x, p.y));
}

/**
 * Put the player on a round vehicle: stand next to it and press "E" for them. Returns whether the
 * player now rides it.
 */
export function mountPlayer(ctx: MiniGameContext, v: GameVehicle): boolean {
  const walk = ctx.walk;
  if (walk.currentVehicle?.id === v.id) return true;
  const phi = v.holder.rotation.y;
  const side = v.def.size.w / 2 + 0.35;
  const p = { x: v.holder.position.x + Math.cos(phi) * side, y: v.holder.position.z - Math.sin(phi) * side };
  walk.teleport(p, phi + Math.PI, 0);
  walk.y = 0;
  walk.interact();
  if (walk.currentVehicle?.id !== v.id) {
    // something else (a seat, another vehicle) was nearer: try once more from the vehicle's own spot
    if (walk.currentVehicle) walk.interact();
    if (walk.seat) walk.standUp();
    walk.pos = { x: v.holder.position.x, y: v.holder.position.z };
    walk.interact();
  }
  return walk.currentVehicle?.id === v.id;
}

/** An NPC rider (or driver) glued to a vehicle that the game moves itself. */
export class Rider {
  readonly character: Character;
  private spec: VehicleSpec;

  constructor(
    ctx: MiniGameContext,
    def: FurnitureDef,
    look: CharacterLook,
  ) {
    this.spec = def.vehicle!;
    this.character = new Character(look);
    this.character.root.rotation.order = 'YXZ';
    const r = this.spec.rider;
    this.character.setPose(r.pose === 'stand' ? 'stand' : r.pose, r.y);
    this.character.reach = r.pose === 'stand';
    ctx.root.add(this.character.root);
  }

  /** follow the vehicle (call after moving its holder) */
  update(dt: number, holder: THREE.Object3D, speed: number): void {
    const r = this.spec.rider;
    const phi = holder.rotation.y;
    const c = Math.cos(phi);
    const s = Math.sin(phi);
    const x = holder.position.x + r.x * c + r.z * s;
    const z = holder.position.z - r.x * s + r.z * c;
    const ch = this.character;
    ch.root.position.set(x, holder.position.y + (r.pose === 'stand' ? r.y : 0), z);
    ch.root.rotation.y = phi;
    ch.root.rotation.z = holder.rotation.z;
    ch.update(dt, r.pose === 'stand' ? 0 : speed);
  }

  dispose(): void {
    this.character.root.removeFromParent();
    this.character.dispose();
  }
}

/** A neighbour look with a chosen shirt colour. */
export function lookWith(seed: number, top: string): CharacterLook {
  const l = randomLook(seed);
  return { ...l, top, accessoryColor: top };
}

/** Spin the wheels and turn the front wheel of a vehicle that the game drives itself. */
export function rollWheels(wheels: WheelPart[], speed: number, steer: number, dt: number): void {
  for (const w of wheels) {
    w.spin.rotation.x += (speed * dt) / Math.max(0.05, w.radius);
    if (w.steer) w.steer.rotation.y = -steer;
  }
}
