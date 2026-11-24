import type * as THREE from 'three';
import type { FurnitureDef } from '../catalog/types';
import type { WalkWorld } from '../render3d/WalkController';
import type { DriveIntent } from './drive';
import type { PhysMaterial } from './profile';

/**
 * What the walk controller, the traffic and the engine see of the physics (`PhysicsWorld` in
 * `world.ts`, loaded lazily with Rapier when walk mode starts). Importing this file never loads Rapier.
 */

export type { DriveIntent } from './drive';

/** Pose and planar velocity of a vehicle body (plan x / y = 3D x / z). */
export interface VehicleState {
  x: number;
  y: number;
  z: number;
  /** rotation.y */
  yaw: number;
  vx: number;
  vz: number;
  /** rotation.y per second */
  yawRate: number;
}

export type ImpactKind = 'player' | 'traffic' | 'vehicle' | 'prop';

/** Something got hit (one event per body and frame, the strongest). */
export interface ImpactEvent {
  /** the walk-world id of the body that took the hit */
  id: string;
  kind: ImpactKind;
  /** what hit it (null = a wall, the ground or unknown) */
  otherId: string | null;
  otherKind: ImpactKind | 'static' | null;
  /** velocity change of this body, m/s */
  dv: number;
  /** N·s */
  impulse: number;
  /** contact point (world) */
  x: number;
  y: number;
  z: number;
  /** what the two things are made of (sounds, sparks) */
  material: PhysMaterial;
  otherMaterial: PhysMaterial;
  mass: number;
  /** an anchored thing (lamp post, sign) was knocked loose by this hit */
  broke?: boolean;
}

/** A placed catalog item of the walk world that may become a rigid body. */
export interface WalkItem {
  id: string;
  def: FurnitureDef;
  /** placed size */
  size: { w: number; d: number; h: number };
  /** the item's 3D holder (absent for far-away buildings: those stay solid boxes) */
  holder?: THREE.Object3D;
  /** a parametric build split the footprint into several boxes */
  multiBox?: boolean;
  /** the walk world gave it no solid footprint */
  noFootprint?: boolean;
}

/** The walker's body this frame (light props are shoved by it). */
export interface WalkerBody {
  x: number;
  /** feet height */
  y: number;
  /** plan y */
  z: number;
  /** on foot (false while driving / seated / busy) */
  active: boolean;
}

export interface WalkPhysics {
  /** (re)build the fixed colliders and reconcile the bodies with a new walk world */
  setWorld(world: WalkWorld): void;
  /** advance the simulation by `dt` seconds (sub-stepped, at most ~60 Hz per step) */
  step(dt: number, walker: WalkerBody): void;
  /** register a vehicle of the walk world (project or mini-game vehicle); true when it has a body */
  ensureVehicle(v: { id: string; def: FurnitureDef; holder: THREE.Object3D }): boolean;
  /** the player drives this vehicle (null = nobody) */
  setDriven(id: string | null): void;
  /** what the driver / the traffic AI wants for the next step (null = brakes on: it skids to a stop) */
  drive(id: string, intent: DriveIntent | null, y: number): void;
  /** flying (ramps): the planar velocity is set directly, no tyres */
  fly(id: string, vx: number, vz: number, yawRate: number, y: number): void;
  read(id: string, out: VehicleState): boolean;
  /** teleport a vehicle (games, respawns, "unstick") */
  place(id: string, x: number, y: number, z: number, yaw: number, speed?: number): void;
  /** set the speed along the heading right now (mini-games stop / boost the vehicle) */
  setSpeed(id: string, speed: number): void;
  /** the vehicle was parked by the player: its current place becomes its home */
  park(id: string): void;
  /** ids of light props the walker shoves (they do not block it) */
  readonly pushable: ReadonlySet<string>;
  /** the item was moved / knocked over by the simulation (its seats are gone for now) */
  isDisplaced(id: string): boolean;
  readonly impacts: Set<(e: ImpactEvent) => void>;
  // traffic
  addTraffic(id: string, def: FurnitureDef, holder: THREE.Object3D): void;
  removeTraffic(id: string): void;
  setEnabled(id: string, on: boolean): void;
  /** put everything back where it was placed */
  resetAll(): void;
  dispose(): void;
}
