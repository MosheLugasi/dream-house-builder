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

export interface Building {
  id: string;
  name: string;
  /** finish id for wall sides that face outdoors */
  exterior: string;
  /** default finishes for rooms that have no explicit style */
  defaultFloor: string;
  defaultWall: string;
  roof: { type: 'flat' | 'none'; finish: string };
  levels: Level[];
}

export interface Site {
  /** ground finish id */
  ground: string;
  /** half-size of the square lot, meters */
  size: number;
}

export interface Project {
  format: 'dream-house-builder';
  version: 1;
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

let idCounter = 0;
export function newId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}
