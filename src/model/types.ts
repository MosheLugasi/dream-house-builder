/**
 * Project data model. All lengths are meters, angles radians.
 * Plan coordinates: (x, y) where plan-y maps to 3D +Z. 3D +Y is up.
 */
export interface Vec2 {
  x: number;
  y: number;
}

export interface Wall {
  id: string;
  a: Vec2;
  b: Vec2;
  thickness: number;
}

export type OpeningType = 'door' | 'window';

export interface Opening {
  id: string;
  wallId: string;
  type: OpeningType;
  /** catalog style id, see catalog/openings.ts */
  style: string;
  /** distance of the opening's center from wall.a along the wall */
  offset: number;
  width: number;
  height: number;
  /** height of the bottom above the floor (0 for doors) */
  sill: number;
  /** door hinge / swing flips */
  flipH?: boolean;
  flipV?: boolean;
}

export interface FurnitureItem {
  id: string;
  catalogId: string;
  x: number;
  y: number;
  /** plan rotation (clockwise on screen); 3D rotation.y = -rotation */
  rotation: number;
  /** height of the item's bottom above the level floor */
  elevation: number;
  colors?: Record<string, string>;
}

/**
 * Style of a room. Rooms themselves are derived from the walls (closed loops);
 * a style is attached to whichever room contains `point`.
 */
export interface RoomStyle {
  id: string;
  point: Vec2;
  name?: string;
  floor?: string;
  wall?: string;
}

export interface Level {
  id: string;
  name: string;
  /** floor-to-ceiling height */
  height: number;
  walls: Wall[];
  openings: Opening[];
  furniture: FurnitureItem[];
  roomStyles: RoomStyle[];
}

export type RoofType = 'flat' | 'gable' | 'hip' | 'shed' | 'none';

export interface Roof {
  type: RoofType;
  finish: string;
  /** slope in degrees (pitched roofs) */
  pitch?: number;
  /** eave overhang beyond the walls, meters (pitched roofs) */
  overhang?: number;
}

export interface Building {
  id: string;
  name: string;
  /** free label such as 'house' | 'school' | 'shop' – only used for display */
  kind?: string;
  /** position of the building's local origin on the site, and rotation (plan angle, radians) */
  x: number;
  y: number;
  rotation: number;
  /** finish id for wall sides that face outdoors */
  exterior: string;
  /** default finishes for rooms that have no explicit style */
  defaultFloor: string;
  defaultWall: string;
  roof: Roof;
  /** bottom to top; stairs are furniture items (catalog `stair`) of the level they start on */
  levels: Level[];
}

/** A rectangular patch of ground cover (park lawn, plaza, playground surface, pond…), site coordinates. */
export interface SiteArea {
  id: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  finish: string;
}

export interface Site {
  /** ground finish id */
  ground: string;
  /** half-size of the square neighborhood, meters */
  size: number;
  /** road cells on a ROAD_CELL grid: [i, j] covers [i*C, (i+1)*C] x [j*C, (j+1)*C] */
  roads: [number, number][];
  areas: SiteArea[];
  /** street furniture, trees, playground equipment and vehicles, in site coordinates */
  props: FurnitureItem[];
}

export interface Project {
  format: 'dream-house-builder';
  version: 2;
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  site: Site;
  buildings: Building[];
}

export const DEFAULT_WALL_THICKNESS = 0.15;
export const EXTERIOR_WALL_THICKNESS = 0.25;
export const DEFAULT_LEVEL_HEIGHT = 2.7;
/** thickness of the floor slab between two levels */
export const SLAB = 0.3;
/** size of one road grid cell, meters (6 m of asphalt + a 2 m sidewalk on each side) */
export const ROAD_CELL = 10;
export const ROAD_SIDEWALK = 2;

/** Height of a level's floor above the ground. */
export function levelElevation(building: Building, index: number): number {
  let y = 0;
  for (let i = 0; i < index && i < building.levels.length; i++) y += building.levels[i].height + SLAB;
  return y;
}

/** Building-local plan point -> site coordinates. */
export function toSite(b: Pick<Building, 'x' | 'y' | 'rotation'>, p: Vec2): Vec2 {
  const c = Math.cos(b.rotation);
  const s = Math.sin(b.rotation);
  return { x: b.x + p.x * c - p.y * s, y: b.y + p.x * s + p.y * c };
}

/** Site coordinates -> building-local plan point. */
export function toLocal(b: Pick<Building, 'x' | 'y' | 'rotation'>, p: Vec2): Vec2 {
  const c = Math.cos(b.rotation);
  const s = Math.sin(b.rotation);
  const dx = p.x - b.x;
  const dy = p.y - b.y;
  return { x: dx * c + dy * s, y: -dx * s + dy * c };
}

let idCounter = 0;
export function newId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}
