import type * as THREE from 'three';

/**
 * Furniture catalog contract.
 *
 * Coordinate conventions (all units are METERS):
 *  - 3D: the object's origin is the center of its footprint ON THE FLOOR (y = 0 is the floor,
 *    +Y up). Width runs along X, depth along Z. The FRONT of the item faces +Z and its BACK
 *    (the side that goes against a wall) is at -Z.
 *  - 2D: `draw2d` draws a top-down plan symbol in the same local frame: canvas x = local X,
 *    canvas y = local Z (so the front, +Z, points DOWN on screen). 1 canvas unit = 1 meter.
 *    The symbol must stay inside [-w/2, w/2] x [-d/2, d/2].
 */
export type FurnitureCategory =
  | 'living'
  | 'dining'
  | 'kitchen'
  | 'bedroom'
  | 'bathroom'
  | 'office'
  | 'kids'
  | 'lighting'
  | 'decor'
  | 'outdoor'
  | 'structure'
  | 'playground'
  | 'street'
  | 'public'
  | 'vehicle'
  | 'pet';

export interface ColorSlot {
  /** key used in the `colors` record passed to build/draw2d */
  key: string;
  /** Hebrew label shown in the inspector, e.g. "ריפוד" */
  label: string;
  /** default CSS hex color, e.g. "#8a9a5b" */
  default: string;
}

/** A place where the character can sit (or lie). Local coordinates. */
export interface SeatAnchor {
  x: number;
  z: number;
  /** height of the sitting surface above the floor */
  height: number;
  /** direction the seated person faces, radians around Y; 0 = facing +Z (front) */
  facing: number;
  kind?: 'sit' | 'lie';
}

export interface LightSpec {
  /** local position of the light source */
  x: number;
  y: number;
  z: number;
  color: string;
  /** candela-ish intensity for a THREE.PointLight */
  intensity: number;
  distance: number;
}

export interface BuildContext {
  /** resolved colors: every ColorSlot key is present */
  colors: Record<string, string>;
  /** floor-to-floor height (m); only meaningful for stairs */
  rise?: number;
}

/** Stairs connect the level they stand on with the level above. Geometry lives in model/stairs.ts. */
export interface StairSpec {
  type: 'straight' | 'u';
}

/**
 * A vehicle the character can ride or drive in walk mode.
 *
 * The object returned by `build` must NOT be baked (set `noBake: true`) and must expose its moving
 * parts through `object.userData.wheels`: an array of `WheelPart`. The vehicle drives towards
 * local +Z; wheels roll around their local X axis.
 */
export interface VehicleSpec {
  kind: 'bicycle' | 'scooter' | 'car' | 'bus' | 'other';
  /** top speed, m/s */
  maxSpeed: number;
  /** m/s² */
  acceleration: number;
  /** distance between front and rear axle, m */
  wheelbase: number;
  /** maximum steering angle of the front wheel(s), radians */
  maxSteer: number;
  /** collision radius around the vehicle's center, m */
  radius: number;
  /**
   * Where the rider's hips go (local coords, y = height of the seat surface above the ground) and how
   * the rider is posed: 'ride' = on a saddle leaning to the handlebar, pedalling; 'sit' = seated
   * upright and visible (open or glazed cabin); 'stand' = standing on a deck (kick scooter).
   */
  rider: { x: number; y: number; z: number; pose: 'ride' | 'sit' | 'stand' };
  /** preferred chase-camera distance, m */
  cameraDistance?: number;
  /** Hebrew verb phrase for the prompt, e.g. "לרכוב על האופניים" / "לנהוג במכונית" */
  prompt: string;
}

/**
 * Things the character can switch on / use in walk mode (E key). Positions are in the item's local
 * frame (meters, origin at the footprint center on the floor, front = +Z).
 */
export type InteractSpec =
  /** a lamp: toggles the item's `light` */
  | { kind: 'light' }
  /** a TV / monitor: a glowing animated picture on a rectangle centered at (x, y, z); `ry` = yaw of its normal (0 = faces +Z) */
  | { kind: 'screen'; x: number; y: number; z: number; w: number; h: number; ry?: number }
  /** running water falling `fall` meters from the spout at (x, y, z) */
  | { kind: 'water'; x: number; y: number; z: number; fall: number; sound: 'tap' | 'shower' }
  /** gas burners on a stove: small flames at these points */
  | { kind: 'flame'; points: { x: number; y: number; z: number }[] }
  /** a keyboard instrument that is played (number keys) while sitting on its seat */
  | { kind: 'instrument'; instrument: 'piano' }
  /** a one-shot sound, e.g. flushing the toilet */
  | { kind: 'sfx'; sound: 'flush' | 'bell' | 'squeak' }
  /** an appliance that hums and shakes a little while on */
  | { kind: 'appliance'; sound: 'washing' | 'fan' };

/**
 * Moving play equipment (swing, carousel, seesaw, spring rider).
 * `build` must return an UN-BAKED object (`noBake: true`) with `object.userData.ride: RideRuntime`.
 */
export interface RideSpec {
  kind: 'swing' | 'spin' | 'seesaw' | 'rock';
  /** Hebrew verb phrase for the prompt, e.g. "להתנדנד" */
  prompt: string;
}

export interface RideRuntime {
  /**
   * One node per `seats` entry, parented to the moving part. A rider is glued to the node's world
   * transform: node origin = seat surface where the hips rest, node +Z = direction the rider faces.
   */
  seatNodes: THREE.Object3D[];
  /**
   * Advance the motion by `dt` seconds. `push` is 0…1 while a rider is pumping (W key held),
   * `riders` lists the occupied seat indices. With nobody pushing the motion must decay to rest.
   * Returns true while the equipment is still moving.
   */
  update(dt: number, push: number, riders: number[]): boolean;
}

/** A slide: the character climbs the ladder and slides down along `path` (local points, y = feet/seat height). */
export interface SlideSpec {
  /** polyline: ladder bottom → platform → chute → landing point on the ground */
  path: { x: number; y: number; z: number }[];
  /** index in `path` where sliding (sitting, fast) starts; before it the character climbs */
  slideFrom: number;
}

/** A trampoline: stepping on the mat (a disc of `radius` at height `surfaceY`) bounces the character. */
export interface BounceSpec {
  radius: number;
  surfaceY: number;
  /** how many times higher than a normal jump */
  boost: number;
}

/** A ball that can be kicked around. The item's origin is the point where it touches the ground. */
export interface BallSpec {
  radius: number;
  /** 0…1 restitution when bouncing off the ground and walls */
  bounce: number;
  /** kg-ish: heavier balls fly less far when kicked */
  mass: number;
}

/**
 * A pet. `build` must return an UN-BAKED object with `object.userData.pet: PetRuntime`
 * (see render3d/Pet.ts) so that the game can animate it.
 */
export interface PetSpec {
  kind: 'dog' | 'cat';
  /** walking / running speed, m/s */
  walkSpeed: number;
  runSpeed: number;
  /** Hebrew name of the animal, e.g. "כלב" */
  label: string;
}

export interface PetRuntime {
  /** animate: `speed` in m/s (0 = standing), `mood` selects the idle behaviour */
  update(dt: number, speed: number, mood: 'idle' | 'sit' | 'lie' | 'happy'): void;
}

export interface WheelPart {
  /** node that spins around its local X axis as the vehicle rolls */
  spin: THREE.Object3D;
  /** wheel radius, m */
  radius: number;
  /** optional node that yaws (rotation.y) with the steering angle; the spin node is usually inside it */
  steer?: THREE.Object3D;
}

export interface FurnitureDef {
  id: string;
  /** Hebrew display name */
  name: string;
  category: FurnitureCategory;
  /** bounding size: w along X, d along Z, h along Y */
  size: { w: number; d: number; h: number };
  /** floor (default), wall-mounted (back against wall at `elevation`), or hanging from ceiling */
  mount?: 'floor' | 'wall' | 'ceiling';
  /** default height of the item's bottom above the floor (wall-mounted items) */
  elevation?: number;
  colors?: ColorSlot[];
  seats?: SeatAnchor[];
  /** true for rugs etc.: the character can walk over it */
  walkable?: boolean;
  light?: LightSpec;
  stair?: StairSpec;
  vehicle?: VehicleSpec;
  /** what pressing E next to the item can switch on / off */
  interact?: InteractSpec[];
  ride?: RideSpec;
  slide?: SlideSpec;
  bounce?: BounceSpec;
  ball?: BallSpec;
  pet?: PetSpec;
  /**
   * true = hand out a freshly built, un-merged object on every `build` call (needed when parts move
   * or when the geometry depends on more than the colors). Default: baked + cached per color set.
   */
  noBake?: boolean;
  /** Build the 3D object. Meshes should set castShadow/receiveShadow. */
  build(ctx: BuildContext): THREE.Object3D;
  /** Draw the plan symbol (see conventions above). Caller sets up transform; lineWidth is in meters. */
  draw2d(ctx: CanvasRenderingContext2D, colors: Record<string, string>): void;
}

export const CATEGORY_LABELS: Record<FurnitureCategory, string> = {
  living: 'סלון',
  dining: 'פינת אוכל',
  kitchen: 'מטבח',
  bedroom: 'חדר שינה',
  bathroom: 'אמבטיה',
  office: 'חדר עבודה',
  kids: 'חדר ילדים',
  lighting: 'תאורה',
  decor: 'דקורציה',
  outdoor: 'חוץ וגינה',
  structure: 'מדרגות',
  playground: 'גן שעשועים',
  street: 'רחוב',
  public: 'מבני ציבור',
  vehicle: 'כלי רכב',
  pet: 'חיות מחמד',
};
