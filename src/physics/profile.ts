import type { FurnitureCategory, FurnitureDef, ItemSize, PhysicsSpec } from '../catalog/types';

/**
 * How a placed catalog item behaves as a rigid body in walk mode – inferred for every item from its
 * category, size and kind, so that ~900 items get sensible physics without being edited. An item can
 * override any of it with `FurnitureDef.physics` (or through `OVERRIDES` below). Pure: no Rapier here.
 */

export type BodyKind = 'none' | 'static' | 'dynamic' | 'anchored' | 'vehicle';
export type PhysMaterial = NonNullable<PhysicsSpec['material']>;

export interface PhysicsProfile {
  kind: BodyKind;
  /** kg (0 for static / none) */
  mass: number;
  /** collider: half extents and centre, item-local (origin on the floor, front +Z) */
  hx: number;
  hy: number;
  hz: number;
  cx: number;
  cy: number;
  cz: number;
  friction: number;
  restitution: number;
  /** anchored: impulse (N·s) that breaks it loose */
  breakImpulse: number;
  /** the walker pushes it around instead of being stopped by it */
  pushable: boolean;
  /** never tips over (4-wheel vehicles slide and spin in the ground plane only) */
  planar: boolean;
  material: PhysMaterial;
  linearDamping: number;
  angularDamping: number;
}

/** kg per m³ of bounding box, per category (how "full" and heavy its things usually are) */
export const CATEGORY_DENSITY: Record<FurnitureCategory, number> = {
  living: 45,
  dining: 40,
  kitchen: 120,
  bedroom: 50,
  bathroom: 150,
  office: 45,
  kids: 30,
  lighting: 18,
  decor: 40,
  accessories: 30,
  entertainment: 60,
  sports: 40,
  pets: 25,
  outdoor: 40,
  structure: 0,
  playground: 40,
  street: 55,
  public: 60,
  vehicle: 150,
};

/** vehicles: mass by kind (a rider included for the light ones) */
export const VEHICLE_MASS: Record<string, number> = { car: 1200, bus: 4500, bicycle: 15, scooter: 8, other: 2500 };

/** heavier than this (kg) and things are part of the scenery */
export const STATIC_MASS = 160;
/** the walker shoves things up to this mass (kg) */
export const PUSHABLE_MASS = 40;

/** tall thin things that stand anchored in the ground until hit hard: lamp posts, signs, poles… */
const ANCHORED_ID = /lamp|light-pole|sign|traffic-light|bollard|hydrant|flag|mailbox|post\b|pole|floodlight|parking-meter/;
/** trees and big plants: only their trunk is solid, and they never move */
const TREE_ID = /tree|palm|cypress/;
/** soft greenery: bushes, hedges, reeds */
const SOFT_ID = /bush|hedge|reeds|flower-bed|plant/;
/** behaviours that keep working only while the item stays where it was placed */
const MOVABLE_ACTIONS = new Set(['light', 'snack', 'read', 'clock', 'music']);

/** explicit values for catalog items that inference gets wrong (kept here so item files stay untouched) */
export const OVERRIDES: Record<string, PhysicsSpec> = {
  'street-lamp': { body: 'anchored', mass: 160, breakImpulse: 5200, material: 'metal' },
  'garden-lamp': { body: 'anchored', mass: 45, breakImpulse: 2600, material: 'metal' },
  'amuse-lamp-post': { body: 'anchored', mass: 140, breakImpulse: 5000, material: 'metal' },
  'traffic-light': { body: 'anchored', mass: 110, breakImpulse: 5000, material: 'metal' },
  'stop-sign': { body: 'anchored', mass: 30, breakImpulse: 3000, material: 'metal' },
  'crosswalk-sign': { body: 'anchored', mass: 30, breakImpulse: 3000, material: 'metal' },
  'parking-sign': { body: 'anchored', mass: 30, breakImpulse: 3000, material: 'metal' },
  'street-name-sign': { body: 'anchored', mass: 35, breakImpulse: 3200, material: 'metal' },
  flagpole: { body: 'anchored', mass: 90, breakImpulse: 4500, material: 'metal' },
  'corner-flag': { body: 'anchored', mass: 3, breakImpulse: 150, material: 'plastic' },
  bollard: { body: 'anchored', mass: 120, breakImpulse: 14000, material: 'metal', restitution: 0.15 },
  'fire-hydrant': { body: 'anchored', mass: 150, breakImpulse: 16000, material: 'metal', restitution: 0.15 },
  mailbox: { body: 'anchored', mass: 45, breakImpulse: 4000, material: 'metal' },
  'street-bench': { body: 'dynamic', mass: 70, material: 'wood' },
  'garden-bench': { body: 'dynamic', mass: 45, material: 'wood' },
  'trash-bin': { body: 'dynamic', mass: 14, material: 'plastic', restitution: 0.35 },
  'recycling-bins': { body: 'dynamic', mass: 40, material: 'plastic', restitution: 0.3 },
  'race-cone': { body: 'dynamic', mass: 2.5, material: 'plastic', restitution: 0.45 },
  'race-tire-stack': { body: 'dynamic', mass: 45, material: 'soft', restitution: 0.55 },
  'crowd-barrier': { body: 'dynamic', mass: 18, material: 'metal' },
  'shopping-cart': { body: 'dynamic', mass: 16, material: 'metal', restitution: 0.3 },
  'bike-rack': { body: 'dynamic', mass: 35, material: 'metal' },
  'picnic-table': { body: 'dynamic', mass: 60, material: 'wood' },
  planter: { body: 'static', material: 'stone' },
  'stone-wall': { body: 'static', material: 'stone' },
  'farm-hay-bale': { body: 'dynamic', mass: 25, material: 'soft' },
  'farm-crates': { body: 'dynamic', mass: 12, material: 'wood' },
  'pizza-box-stack': { body: 'dynamic', mass: 2, material: 'soft' },
  'fence-wood': { body: 'anchored', mass: 25, breakImpulse: 2500, material: 'wood' },
  'fence-metal': { body: 'anchored', mass: 30, breakImpulse: 3500, material: 'metal' },
  'farm-fence': { body: 'anchored', mass: 35, breakImpulse: 3000, material: 'wood' },
  'pk-lane-rope': { body: 'none' },
};

const CAT_MATERIAL: Partial<Record<FurnitureCategory, PhysMaterial>> = {
  street: 'metal',
  vehicle: 'metal',
  kitchen: 'metal',
  bathroom: 'stone',
  decor: 'wood',
  outdoor: 'wood',
  playground: 'metal',
  sports: 'plastic',
  kids: 'plastic',
  pets: 'soft',
  bedroom: 'wood',
  living: 'wood',
  dining: 'wood',
  office: 'wood',
  public: 'wood',
  lighting: 'metal',
  entertainment: 'plastic',
  accessories: 'plastic',
};

/** Guess the material from the id first (a "plastic chair" in the living room), then the category. */
export function inferMaterial(def: FurnitureDef): PhysMaterial {
  const id = def.id;
  if (/glass|mirror|vase|aquarium/.test(id)) return 'glass';
  if (/stone|rock|concrete|planter|fountain|well/.test(id)) return 'stone';
  if (SOFT_ID.test(id) || /sofa|couch|pillow|cushion|bean|bed|mattress|hay|tire|tyre|plush|teddy|rug/.test(id)) return 'soft';
  if (/plastic|cone|bin|bucket|toy|crate-plastic/.test(id)) return 'plastic';
  if (/metal|steel|iron|bike|car|bus|lamp|sign|pole|rack|cart/.test(id)) return 'metal';
  if (/wood|bench|table|chair|crate|desk|shelf|cabinet/.test(id)) return 'wood';
  return CAT_MATERIAL[def.category] ?? 'wood';
}

const RESTITUTION: Record<PhysMaterial, number> = { metal: 0.25, wood: 0.2, plastic: 0.35, stone: 0.1, soft: 0.15, glass: 0.2 };
const FRICTION: Record<PhysMaterial, number> = { metal: 0.45, wood: 0.6, plastic: 0.5, stone: 0.8, soft: 0.9, glass: 0.4 };

/** Mass of an item from its (placed) bounding box and category density, kg. */
export function inferMass(def: FurnitureDef, size: ItemSize): number {
  if (def.vehicle) return VEHICLE_MASS[def.vehicle.kind] ?? 1000;
  const vol = Math.max(0, size.w) * Math.max(0, size.d) * Math.max(0, size.h);
  const density = CATEGORY_DENSITY[def.category] ?? 45;
  return Math.max(0.5, Math.min(4000, vol * density));
}

export interface ProfileOptions {
  /** the item's collision is handled by standable surfaces (skatepark ramps…) */
  surface?: boolean;
  /** a parametric build split the footprint into several boxes (L / U kitchens) */
  multiBox?: boolean;
  /** the walk world gave the item no solid footprint (rugs, wall / ceiling things, balls, pets) */
  noFootprint?: boolean;
  /** where the pole of a tall thin item stands (measured on the 3D object), item-local */
  pole?: { x: number; z: number; hw: number; hd: number } | null;
}

const NONE: PhysicsProfile = {
  kind: 'none',
  mass: 0,
  hx: 0,
  hy: 0,
  hz: 0,
  cx: 0,
  cy: 0,
  cz: 0,
  friction: 0.6,
  restitution: 0.2,
  breakImpulse: Infinity,
  pushable: false,
  planar: false,
  material: 'wood',
  linearDamping: 0.05,
  angularDamping: 0.1,
};

/**
 * The rigid body of a placed item (`size` = the placed size, see `itemSize`). Collider extents are
 * item-local; an anchored pole gets a slim collider around its pole only.
 */
export function physicsProfile(def: FurnitureDef, size: ItemSize, opts: ProfileOptions = {}): PhysicsProfile {
  const spec: PhysicsSpec = { ...OVERRIDES[def.id], ...def.physics };
  const material = spec.material ?? inferMaterial(def);
  const base: PhysicsProfile = {
    ...NONE,
    hx: size.w / 2,
    hy: size.h / 2,
    hz: size.d / 2,
    cy: size.h / 2,
    material,
    friction: spec.friction ?? FRICTION[material],
    restitution: spec.restitution ?? RESTITUTION[material],
  };
  const none = (): PhysicsProfile => ({ ...base, kind: 'none' });
  const fixed = (): PhysicsProfile => ({ ...base, kind: 'static' });

  if (spec.body === 'none') return none();
  // things that are not solid boxes in the walk world at all
  if (def.walkable || def.mount === 'wall' || def.mount === 'ceiling' || def.stair || def.category === 'structure') return none();
  if (def.pet || def.actions?.some((a) => a.kind === 'ball' || a.kind === 'pet')) return none();
  if (opts.surface || opts.noFootprint || size.h < 0.05) return none();

  if (def.vehicle) {
    const k = def.vehicle.kind;
    const planar = k === 'car' || k === 'bus' || k === 'other';
    const mass = spec.mass ?? inferMass(def, size);
    // the body floats a little above the ground (wheels): kerbs and low debris pass under it
    const clear = planar ? Math.min(0.28, size.h * 0.18) : 0.05;
    return {
      ...base,
      kind: 'vehicle',
      mass,
      planar,
      hy: (size.h - clear) / 2,
      cy: clear + (size.h - clear) / 2,
      restitution: spec.restitution ?? (planar ? 0.22 : 0.15),
      friction: spec.friction ?? 0.5,
      pushable: !planar && mass <= PUSHABLE_MASS,
      linearDamping: 0.05,
      angularDamping: planar ? 0.4 : 0.2,
      material: spec.material ?? 'metal',
    };
  }

  if (spec.body === 'static') return fixed();
  if (def.ride || opts.multiBox) return fixed();
  if (!spec.body) {
    if (TREE_ID.test(def.id) && size.h > 1.6) {
      // only the trunk
      return { ...fixed(), hx: 0.2, hz: 0.2, material: 'wood' };
    }
    if (def.actions?.some((a) => !MOVABLE_ACTIONS.has(a.kind))) return fixed();
  }

  const mass = spec.mass ?? inferMass(def, size);
  // rooted greenery (bushes, hedges, flower beds) stays put; a small potted plant does not
  if (!spec.body && SOFT_ID.test(def.id) && (def.category === 'outdoor' || def.category === 'street' || mass > 15)) return { ...fixed(), material: 'soft' };
  const tallThin = size.h > 0.75 && Math.min(size.w, size.d) < 0.75 && ['street', 'outdoor', 'playground', 'sports', 'public'].includes(def.category);
  const anchored = spec.body === 'anchored' || (!spec.body && tallThin && ANCHORED_ID.test(def.id) && size.h < 9);
  if (anchored) {
    // poles get a slim collider around the pole (a lamp's arm or a sign's plate does not block);
    // fences and the like keep their whole footprint
    const slim = ANCHORED_ID.test(def.id);
    const pole = slim ? opts.pole : null;
    const hw = pole ? Math.max(0.05, Math.min(pole.hw, 0.25)) : slim ? Math.min(size.w / 2, 0.15) : size.w / 2;
    const hd = pole ? Math.max(0.05, Math.min(pole.hd, 0.25)) : slim ? Math.min(size.d / 2, 0.15) : size.d / 2;
    const m = spec.mass ?? Math.min(250, Math.max(20, mass));
    return {
      ...base,
      kind: 'anchored',
      mass: m,
      hx: hw,
      hz: hd,
      cx: pole?.x ?? 0,
      cz: pole?.z ?? 0,
      breakImpulse: spec.breakImpulse ?? 2500 + m * 20,
      pushable: false,
      material: spec.material ?? 'metal',
      linearDamping: 0.1,
      angularDamping: 0.3,
    };
  }

  // built-in kitchen and bathroom pieces (cabinets, fridges, toilets) stay put; a kettle does not
  const builtIn = (def.category === 'kitchen' || def.category === 'bathroom') && mass > 12;
  const big = builtIn || size.w * size.d > 3.2 || size.h > 2.4 || Math.max(size.w, size.d) > 3.2;
  if (spec.body !== 'dynamic' && (mass > STATIC_MASS || big)) return fixed();
  return {
    ...base,
    kind: 'dynamic',
    mass,
    pushable: mass <= PUSHABLE_MASS,
    linearDamping: 0.08,
    angularDamping: 0.25,
  };
}

/** Collision groups (membership << 16 | filter), shared by the world and the tests. */
export const GROUP = {
  STATIC: 0x0001,
  LIGHT: 0x0002,
  HEAVY: 0x0004,
  VEHICLE: 0x0008,
  WALKER: 0x0010,
  GROUND: 0x0020,
} as const;

export const groups = (member: number, filter: number): number => ((member & 0xffff) << 16) | (filter & 0xffff);

/** The groups of a body of this profile. */
export function bodyGroups(p: PhysicsProfile, driven = false): number {
  const props = GROUP.LIGHT | GROUP.HEAVY;
  if (p.kind === 'vehicle' && (p.planar || driven)) return groups(GROUP.VEHICLE, GROUP.STATIC | props | GROUP.VEHICLE);
  const member = p.pushable ? GROUP.LIGHT : GROUP.HEAVY;
  return groups(member, GROUP.STATIC | GROUP.GROUND | props | GROUP.VEHICLE | (p.pushable ? GROUP.WALKER : 0));
}
