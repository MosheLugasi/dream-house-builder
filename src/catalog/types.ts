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
  | 'outdoor';

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
};
