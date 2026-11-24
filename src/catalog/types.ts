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
  | 'accessories'
  | 'entertainment'
  | 'sports'
  | 'pets'
  | 'outdoor'
  | 'structure'
  | 'playground'
  | 'street'
  | 'public'
  | 'vehicle';

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

/**
 * Interactive behaviours an item offers in walk mode (see docs/catalog-authoring.md).
 *
 * Animated pieces are marked as PARTS: an Object3D whose `userData.part` is one of the names
 * below (use `Kit.part(...)`). Parts survive baking as separate groups named `part:<name>`, with
 * their own transform, so the runtime can rotate / move / hide them per placed instance.
 */
export type ActionKind =
  /** toggle `light`; parts 'glow' (emissive meshes dim when off) */
  | 'light'
  /** TV / monitor: part 'screen' = flat mesh facing +Z that shows animated channels */
  | 'tv'
  /** desk computer / laptop: part 'screen'; the character types */
  | 'computer'
  /** radio / record player / jukebox / speakers: parts 'spin' (turns around local Y), 'pulse' (scales to the beat) */
  | 'music'
  /** keyboard instruments (sit at seats[0]) */
  | 'piano'
  | 'guitar'
  | 'drums'
  /** ceiling / standing fan: part 'rotor' spins around local Y (use `axis` for others) */
  | 'fan'
  /** fireplace, fire pit, candles: flames at `at` */
  | 'fire'
  /** sink, shower, bathtub, fountain, garden hose: water stream from `at` */
  | 'water'
  /** stove, oven, BBQ: steam / smoke at `at`, the character cooks standing in front */
  | 'cook'
  /** fridge, fruit bowl, coffee machine, kettle, snack bar: the character eats / drinks */
  | 'snack'
  /** wardrobes, cabinets, fridges: parts 'door' (rotate about local Y, `userData.open` radians) / 'drawer' (slide +Z, `userData.open` meters) */
  | 'open'
  /** beds: lie down and sleep (fast-forward day/night); needs a 'lie' seat */
  | 'sleep'
  /** bookshelves / books: take a book and read */
  | 'read'
  /** treadmill (run), exercise bike (pedal), rowing machine (row): parts 'spin' turn around local X */
  | 'run'
  | 'pedal'
  | 'row'
  /** weights, punching bag, yoga mat */
  | 'workout'
  /** trampoline */
  | 'bounce'
  /** swings & hammocks: part 'swing' pivots at its origin around local X; character rides at seats[0] */
  | 'swing'
  /** rocking chair / rocking horse: part 'rock' pivots at its origin (on the floor) around local X */
  | 'rock'
  /** playground slide: `path` = local points from the top of the slide to its end */
  | 'slide'
  /** the item itself becomes a kickable ball in walk mode */
  | 'ball'
  /** basketball hoop: ring centre at `at` */
  | 'hoop'
  /** dart board: board centre at `at` (board faces +Z) */
  | 'darts'
  /** arcade cabinet / game console: part 'screen' */
  | 'game'
  /** dogs, cats...: parts 'body', 'head', 'tail', 'leg0'..'leg3' (pivots at hips / shoulders) */
  | 'pet'
  /** aquarium: every child of part 'fish' swims around inside `area` */
  | 'fish'
  /** wall / table clocks: parts 'hour', 'minute' (and 'second'), pivot at the dial centre, turning around local Z */
  | 'clock'
  /** pool / ping-pong / foosball / board games: the character plays a round */
  | 'play'
  /** start sign of a neighborhood mini-game: `variant` = the game id (src/game/minigames/meta.ts) */
  | 'minigame';

export interface ActionSpec {
  kind: ActionKind;
  /** optional Hebrew button label overriding the default for the kind */
  label?: string;
  /** local anchor: effect origin (spout, flame, ring...) */
  at?: { x: number; y: number; z: number };
  /** local polyline (slides) */
  path?: Array<{ x: number; y: number; z: number }>;
  /** local box the effect lives in (aquarium water volume): min/max corners */
  area?: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } };
  /** free-form variant, e.g. pet species 'dog' | 'cat', music style, fire size */
  variant?: string;
}

export interface BuildContext {
  /** resolved colors: every ColorSlot key is present */
  colors: Record<string, string>;
  /** floor-to-floor height (m); only meaningful for stairs */
  rise?: number;
  /**
   * The size the player chose (always present for `parametric` items, clamped to `resize`).
   * Non-parametric items ignore it: the game scales their default-size object instead.
   */
  size?: ItemSize;
}

export interface ItemSize {
  w: number;
  d: number;
  h: number;
}

/** A local point (meters, item frame: origin at the footprint center on the floor, front = +Z). */
export interface LocalPoint {
  x: number;
  y: number;
  z: number;
}

/**
 * Things a PARAMETRIC build publishes for the size it was built at, on `object.userData.anchors`
 * (local coordinates, real meters). Anything left out is derived from the static definition by
 * scaling it with the size (see `scaleLocal` in catalog/index.ts).
 */
export interface ItemAnchors {
  /** where the lamp's light comes from */
  light?: LocalPoint;
  seats?: SeatAnchor[];
  /** effect origins per action kind (spout of the sink, middle of the hob…) */
  actions?: Partial<Record<ActionKind, LocalPoint>>;
  /** polylines per action kind (slides) */
  paths?: Partial<Record<ActionKind, LocalPoint[]>>;
  /**
   * Solid footprint as several boxes (x/z = box center, w along X, d along Z, h = top above the floor).
   * Lets the character walk INTO an L / U shaped kitchen or between a kitchen run and its island.
   */
  boxes?: Array<{ x: number; z: number; w: number; d: number; h: number }>;
}

/** Allowed size range per axis, meters [min, max]. */
export interface ResizeSpec {
  w?: [number, number];
  d?: [number, number];
  h?: [number, number];
  /** width and depth change together (round things: a shade, a globe, a round table) */
  linked?: boolean;
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

/**
 * A pet. `build` must return an UN-BAKED object with `object.userData.pet: PetRuntime`
 * (see render3d/Pet.ts) so that the game can animate it.
 */
/** Walk-mode physics of an item; every field is optional (the rest is inferred). */
export interface PhysicsSpec {
  /**
   * 'static' never moves (big furniture, trees); 'dynamic' is pushed, tips over and flies;
   * 'anchored' stands fixed until hit hard enough, then topples (lamp posts, signs, bollards);
   * 'none' has no collider at all.
   */
  body?: 'static' | 'dynamic' | 'anchored' | 'none';
  /** kg */
  mass?: number;
  /** anchored items: impulse (N·s) that breaks them loose – a 1200 kg car at 4 m/s gives ≈ 6000 */
  breakImpulse?: number;
  /** bounciness 0..1 */
  restitution?: number;
  /** 0..1.5 */
  friction?: number;
  /** what it sounds / sparkles like when hit */
  material?: 'metal' | 'wood' | 'plastic' | 'stone' | 'soft' | 'glass';
}

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
  /** interactive behaviours in walk mode */
  actions?: ActionSpec[];
  /** Hebrew sub-group inside the category (e.g. "ספות", "כורסאות") used to organise the catalog */
  group?: string;
  /** extra Hebrew search words (materials, styles, synonyms) */
  tags?: string[];
  stair?: StairSpec;
  vehicle?: VehicleSpec;
  /** what pressing E next to the item can switch on / off */
  ride?: RideSpec;
  pet?: PetSpec;
  /**
   * Rigid-body behaviour in walk mode (crashes, pushing). Optional: without it the physics infers a
   * sensible body from the category, size and kind of the item (see `src/physics/profile.ts`).
   */
  physics?: PhysicsSpec;
  /**
   * true = hand out a freshly built, un-merged object on every `build` call (needed when parts move
   * or when the geometry depends on more than the colors). Default: baked + cached per color set.
   */
  noBake?: boolean;
  /**
   * true = `build` and `draw2d` honour the requested size (`ctx.size` / the `size` argument) and
   * rebuild the item properly (more cabinets in a longer kitchen, a longer pendant cord…) instead of
   * being stretched. Baked templates are then cached per size as well.
   */
  parametric?: boolean;
  /**
   * How the player may resize the item. Default (absent): every axis from 50% to 200% of `size`.
   * `false` = fixed size (vehicles, pets, rides, stairs). An axis left out of a ResizeSpec stays fixed.
   */
  resize?: ResizeSpec | false;
  /** Build the 3D object. Meshes should set castShadow/receiveShadow. */
  build(ctx: BuildContext): THREE.Object3D;
  /**
   * Draw the plan symbol (see conventions above). Caller sets up transform; lineWidth is in meters.
   * Parametric items get the chosen size and draw at it; the caller stretches the others.
   */
  draw2d(ctx: CanvasRenderingContext2D, colors: Record<string, string>, size?: ItemSize): void;
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
  accessories: 'אביזרים',
  entertainment: 'בידור ומוזיקה',
  sports: 'ספורט ומשחק',
  pets: 'חיות מחמד',
  outdoor: 'חוץ וגינה',
  structure: 'מדרגות',
  playground: 'גן שעשועים',
  street: 'רחוב',
  public: 'מבני ציבור',
  vehicle: 'כלי רכב',
};
