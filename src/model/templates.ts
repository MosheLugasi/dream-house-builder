import { getFurniture } from '../catalog';
import { emptyBuilding } from './defaults';
import { sampleHouse } from './sample';
import {
  DEFAULT_WALL_THICKNESS,
  EXTERIOR_WALL_THICKNESS,
  newId,
  type Building,
  type Level,
  type Opening,
  type Roof,
  type Vec2,
  type Wall,
} from './types';

/**
 * Ready-made buildings that can be dropped into the neighborhood. They are ordinary buildings:
 * after placing one, every wall, door and chair can be edited like in a hand-made house.
 */
export interface BuildingTemplate {
  id: string;
  name: string;
  group: 'house' | 'public';
  /** approximate footprint in meters, for the placement preview */
  size: { w: number; d: number };
  build(): Building;
}

// plan rotations by the direction an item's front faces
export const FACE = { S: 0, N: Math.PI, E: -Math.PI / 2, W: Math.PI / 2 };

const EXT = EXTERIOR_WALL_THICKNESS;
const INT = DEFAULT_WALL_THICKNESS;

/** Small helper for writing a level by hand. */
export class LevelBuilder {
  constructor(readonly level: Level) {}

  wall(ax: number, ay: number, bx: number, by: number, thickness = INT): Wall {
    const w: Wall = { id: newId('w'), a: { x: ax, y: ay }, b: { x: bx, y: by }, thickness };
    this.level.walls.push(w);
    return w;
  }

  /** Outer shell rectangle; returns [top, right, bottom, left] (each wall runs clockwise). */
  shell(x0: number, y0: number, x1: number, y1: number): [Wall, Wall, Wall, Wall] {
    return [this.wall(x0, y0, x1, y0, EXT), this.wall(x1, y0, x1, y1, EXT), this.wall(x1, y1, x0, y1, EXT), this.wall(x0, y1, x0, y0, EXT)];
  }

  open(w: Wall, style: string, offset: number, opts: Partial<Opening> = {}): void {
    const isWindow = style.startsWith('window');
    const defaults: Record<string, [number, number, number]> = {
      'door-interior': [0.9, 2.1, 0],
      'door-wood': [0.9, 2.1, 0],
      'door-entrance': [1.0, 2.15, 0],
      'door-double': [1.6, 2.1, 0],
      'door-sliding-glass': [2.4, 2.2, 0],
      'opening-passage': [1.2, 2.2, 0],
      'window-standard': [1.2, 1.2, 0.95],
      'window-wide': [2.0, 1.3, 0.9],
      'window-small': [0.6, 0.6, 1.5],
      'window-tall': [0.9, 2.0, 0.25],
      'window-panorama': [2.8, 2.0, 0.3],
      'window-grid': [1.4, 1.4, 0.9],
    };
    const [width, height, sill] = defaults[style] ?? [1, 2, 0];
    this.level.openings.push({ id: newId('o'), wallId: w.id, type: isWindow ? 'window' : 'door', style, offset, width, height, sill, ...opts });
  }

  /** Evenly spaced windows along a wall. */
  windows(w: Wall, style: string, count: number, from = 0, to?: number): void {
    const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
    const end = to ?? L;
    for (let i = 0; i < count; i++) this.open(w, style, from + ((end - from) * (i + 0.5)) / count);
  }

  put(catalogId: string, x: number, y: number, rotation = 0, colors?: Record<string, string>): void {
    const def = getFurniture(catalogId);
    if (!def) {
      console.warn(`[template] unknown catalog item "${catalogId}"`);
      return;
    }
    this.level.furniture.push({
      id: newId('f'),
      catalogId,
      x,
      y,
      rotation,
      elevation: def.mount === 'wall' ? (def.elevation ?? 1.2) : 0,
      ...(colors ? { colors } : {}),
    });
  }

  /** Place an item with its back against a wall, `offset` meters from the wall's first point, on the side that faces `toward`. */
  against(catalogId: string, w: Wall, offset: number, toward: Vec2, colors?: Record<string, string>): void {
    const def = getFurniture(catalogId);
    if (!def) {
      console.warn(`[template] unknown catalog item "${catalogId}"`);
      return;
    }
    const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
    const d = { x: (w.b.x - w.a.x) / L, y: (w.b.y - w.a.y) / L };
    const c = { x: w.a.x + d.x * offset, y: w.a.y + d.y * offset };
    const side = (toward.x - c.x) * -d.y + (toward.y - c.y) * d.x >= 0 ? 1 : -1;
    const m = { x: -d.y * side, y: d.x * side };
    const off = w.thickness / 2 + def.size.d / 2 + 0.005;
    this.put(catalogId, c.x + m.x * off, c.y + m.y * off, Math.atan2(-m.x, m.y), colors);
  }

  room(x: number, y: number, name: string, floor?: string, wall?: string): void {
    this.level.roomStyles.push({ id: newId('rs'), point: { x, y }, name, ...(floor ? { floor } : {}), ...(wall ? { wall } : {}) });
  }
}

function make(name: string, kind: string, exterior: string, roof: Partial<Roof>): { b: Building; L: LevelBuilder } {
  const b = emptyBuilding();
  b.name = name;
  b.kind = kind;
  b.exterior = exterior;
  b.roof = { ...b.roof, ...roof };
  return { b, L: new LevelBuilder(b.levels[0]) };
}

function addLevelTo(b: Building, name: string): LevelBuilder {
  const lvl: Level = { id: newId('lvl'), name, height: b.levels[0].height, walls: [], openings: [], furniture: [], roomStyles: [] };
  b.levels.push(lvl);
  return new LevelBuilder(lvl);
}

/** One open room with a bathroom: the simplest starting point (8 x 6 m). */
function smallHouse(): Building {
  const { b, L } = make('בית קטן', 'house', 'stucco-white', { type: 'gable', finish: 'roof-terracotta', pitch: 32 });
  const [top, right, bottom, left] = L.shell(0, 0, 8, 6);
  const bathV = L.wall(5.6, 0, 5.6, 2.4);
  L.wall(5.6, 2.4, 8, 2.4);
  L.open(bottom, 'door-entrance', 5.0);
  L.open(bottom, 'window-wide', 2.2);
  L.open(top, 'window-standard', 2.2);
  L.open(top, 'window-small', 6.8);
  L.open(left, 'window-standard', 3.0);
  L.open(right, 'window-standard', 4.2);
  L.open(bathV, 'door-interior', 1.5, { width: 0.8 });
  L.room(3, 3, 'חדר מגורים', 'oak-planks', 'paint:#f4f1ea');
  L.room(6.8, 1.2, 'אמבטיה', 'hex-tiles', 'subway-tiles');
  L.put('bed-double', 6.82, 4.4, FACE.W);
  L.put('sofa-2', 1.6, 4.6, FACE.N);
  L.put('coffee-table', 1.6, 3.5);
  L.put('kitchen-base', 0.43 + 0.6, 0.43);
  L.put('kitchen-sink', 0.43 + 1.3, 0.43);
  L.put('kitchen-stove', 0.43 + 2.0, 0.43);
  L.put('fridge', 0.5, 0.48);
  L.put('dining-table-round', 3.9, 2.2);
  L.put('dining-chair', 3.9, 1.3, FACE.S);
  L.put('dining-chair', 3.9, 3.1, FACE.N);
  L.put('toilet', 7.4, 0.48);
  L.put('basin-vanity', 6.3, 0.37);
  L.put('ceiling-light', 3, 3);
  L.put('ceiling-light', 6.8, 1.2);
  L.put('tree-fruit', -2.2, 3);
  L.put('bush', 2.2, 7.1);
  return b;
}

/** Two-storey house with a U-shaped staircase and a hip roof (10 x 8 m). */
function twoStoreyHouse(): Building {
  const { b, L } = make('בית דו־קומתי', 'house', 'stucco-sand', { type: 'hip', finish: 'roof-terracotta', pitch: 28 });
  const [top, right, bottom, left] = L.shell(0, 0, 10, 8);
  const spine = L.wall(6, 0, 6, 8);
  const mid = L.wall(6, 3.6, 10, 3.6);
  L.open(bottom, 'door-entrance', 3.1); // x = 6.9
  L.open(bottom, 'window-wide', 7.2); // x = 2.8
  L.open(top, 'window-wide', 2.6);
  L.open(top, 'window-standard', 8.2);
  L.open(left, 'door-sliding-glass', 4.0);
  L.open(right, 'window-standard', 2.0);
  L.open(spine, 'opening-passage', 6.2, { width: 1.4 });
  L.open(mid, 'door-interior', 0.8);
  L.room(3, 4, 'סלון ופינת אוכל', 'oak-herringbone', 'paint:#f4f1ea');
  L.room(8, 1.8, 'מטבח', 'porcelain-grey', 'paint:#ebe5d9');
  L.room(6.9, 5.6, 'מבואה', 'porcelain-grey', 'paint:#f4f1ea');
  // living
  L.put('sofa-corner', 1.6, 6.3, FACE.N);
  L.put('rug', 2.4, 4.6);
  L.put('coffee-table', 2.4, 4.7);
  L.put('tv-console', 3.2, 0.36);
  L.put('dining-table', 4.2, 2.6, FACE.W);
  for (const y of [2.05, 2.6, 3.15]) {
    L.put('dining-chair', 3.47, y, FACE.E);
    L.put('dining-chair', 4.93, y, FACE.W);
  }
  L.put('plant-large', 0.8, 0.9);
  L.put('pendant-lamp', 4.2, 2.6);
  L.put('ceiling-light', 2.4, 5.4);
  // kitchen along the top wall
  for (const [id, x] of [['fridge', 6.6], ['kitchen-base', 7.3], ['kitchen-sink', 8.0], ['kitchen-stove', 8.7], ['kitchen-drawers', 9.3]] as const) {
    L.put(id, x, id === 'fridge' ? 0.48 : 0.43);
  }
  L.put('range-hood', 8.7, 0.37);
  L.put('kitchen-island', 8.0, 2.2);
  L.put('ceiling-light', 8, 1.8);
  // hall: the stairs stand in the corner, you step on from the kitchen side
  L.put('stairs-u', 8.82, 6.22, FACE.S);
  L.put('ceiling-light', 6.9, 5.6);
  // garden
  L.put('tree', 12.6, 2.5);
  L.put('hedge', 2.2, 9.2);
  L.put('hedge', 4.6, 9.2);
  L.put('patio-table', -2.6, 4.0);

  const U = addLevelTo(b, 'קומה א׳');
  const [utop, uright, ubottom, uleft] = U.shell(0, 0, 10, 8);
  const hallV = U.wall(6, 0, 6, 8);
  const split = U.wall(0, 4, 6, 4);
  const bathH = U.wall(6, 3.0, 10, 3.0);
  U.open(utop, 'window-wide', 3.0);
  U.open(utop, 'window-small', 8.4);
  U.open(ubottom, 'window-wide', 7.0);
  U.open(ubottom, 'window-standard', 2.6);
  U.open(uleft, 'window-standard', 2.0);
  U.open(uleft, 'window-standard', 6.0);
  U.open(uright, 'window-standard', 1.6);
  U.open(hallV, 'door-interior', 3.4, { flipV: true });
  U.open(hallV, 'door-interior', 4.6);
  U.open(bathH, 'door-interior', 0.8, { width: 0.8 });
  void split;
  U.room(3, 2, 'חדר שינה הורים', 'walnut-planks', 'paint:#e4e8e1');
  U.room(3, 6, 'חדר ילדים', 'carpet-blue', 'wallpaper-stars');
  U.room(8, 1.5, 'אמבטיה', 'ceramic-white', 'zellige-tiles');
  U.room(6.9, 4.0, 'מסדרון', 'oak-planks', 'paint:#f4f1ea');
  U.put('bed-double', 3, 1.19, FACE.S);
  U.put('nightstand', 1.75, 0.33);
  U.put('nightstand', 4.25, 0.33);
  U.put('wardrobe', 0.43, 2.4, FACE.E);
  U.put('ceiling-light', 3, 2.2);
  U.put('bunk-bed', 0.64, 6.8);
  U.put('kids-desk', 3.2, 7.59, FACE.N);
  U.put('kids-chair', 3.2, 7.0);
  U.put('toy-chest', 5.69, 5.2, FACE.W);
  U.put('bean-bag', 4.4, 5.6, 0.5);
  U.put('ceiling-light', 3, 6);
  U.put('bathtub', 8.95, 0.51);
  U.put('toilet', 6.9, 0.48);
  U.put('basin-vanity', 9.63, 2.2, FACE.W);
  U.put('ceiling-light', 8, 1.5);
  U.put('ceiling-light', 6.9, 4.2);
  return b;
}

/* ------------------------------------------------------------------ public buildings */

/** Primary school: two classrooms, a music & play room and a corridor with lockers (22 x 12 m). */
function school(): Building {
  const { b, L } = make('בית ספר', 'school', 'jerusalem-stone', { type: 'flat', finish: 'roof-gravel' });
  b.levels[0].height = 3.0;
  const [top, right, bottom, left] = L.shell(0, 0, 22, 12);
  const cor = L.wall(0, 8, 22, 8);
  const p1 = L.wall(7.5, 0, 7.5, 8);
  const p2 = L.wall(15, 0, 15, 8);
  for (const x of [2.6, 5.2, 10.1, 12.7, 17.2, 19.9]) L.open(top, 'window-wide', x, { height: 1.5 });
  L.open(right, 'window-wide', 4);
  L.open(right, 'window-standard', 10);
  L.open(left, 'window-standard', 2);
  L.open(bottom, 'door-double', 11);
  for (const x of [3.5, 7.2, 14.8, 18.5]) L.open(bottom, 'window-wide', x);
  L.open(cor, 'door-interior', 6.6);
  L.open(cor, 'door-interior', 14.1);
  L.open(cor, 'door-interior', 16.0);
  L.room(4, 4, 'כיתה א׳', 'maple-planks', 'paint:#f7ecc9');
  L.room(11, 4, 'כיתה ב׳', 'maple-planks', 'paint:#dfe8ee');
  L.room(18.5, 4, 'חדר מוזיקה ומשחק', 'carpet-blue', 'paint:#f6e3d7');
  L.room(11, 10, 'מסדרון', 'terrazzo', 'paint:#f4f1ea');

  // classrooms: the board is on the west wall, pupils face it
  const classroom = (x0: number, board: Wall, boardOffset: number) => {
    L.against('blackboard', board, boardOffset, { x: x0 + 3, y: 3.6 });
    L.put('teacher-desk', x0 + 1.05, 6.6, FACE.E);
    for (const cx of [2.9, 4.5, 6.1]) for (const y of [1.3, 3.9, 6.5]) L.put('school-desk', x0 + cx, y, FACE.W);
    L.against('classroom-cabinet', cor, x0 + 3.0, { x: x0 + 3, y: 4 });
    L.put('ceiling-light', x0 + 2.6, 4);
    L.put('ceiling-light', x0 + 5.2, 4);
  };
  classroom(0, left, 8.4);
  classroom(7.5, p1, 3.6);
  // music & play room
  L.put('play-rug', 18.4, 3.6);
  L.against('piano', right, 1.3, { x: 18, y: 1.3 });
  for (const [x, y] of [[17, 6.2], [20, 6.2]] as const) {
    L.put('kids-round-table', x, y);
    L.put('kids-chair', x - 0.7, y, FACE.E);
    L.put('kids-chair', x + 0.7, y, FACE.W);
    L.put('kids-chair', x, y - 0.7, FACE.S);
  }
  L.against('classroom-cabinet', p2, 2.2, { x: 18, y: 2.2 });
  L.against('toy-chest', p2, 4.0, { x: 18, y: 4 });
  L.put('bean-bag', 16.6, 1.2, 0.7);
  L.put('ceiling-light', 18.5, 4);
  // corridor
  for (const x of [1.4, 2.6, 3.8, 9.2, 10.4, 11.6, 18.2, 19.4, 20.6]) L.against('school-lockers', cor, x, { x, y: 10 });
  L.against('notice-board', cor, 8.0, { x: 8, y: 10 });
  L.against('waiting-chairs', bottom, 5.2, { x: 16.8, y: 10 });
  L.put('water-cooler', 21.5, 11.5, FACE.N);
  L.put('plant-large', 0.75, 11.2);
  for (const x of [3.5, 11, 18.5]) L.put('ceiling-light', x, 10);
  // yard
  L.put('flagpole', 8.2, 13.6);
  L.put('street-bench', 15.5, 13.2, FACE.S);
  L.put('tree', -2.6, 6.5);
  L.put('tree', 24.8, 3.2, 1.3);
  return b;
}

/** Neighborhood grocery (12 x 8 m). */
function shop(): Building {
  const { b, L } = make('מרכול', 'shop', 'stucco-sand', { type: 'flat', finish: 'roof-gravel' });
  b.levels[0].height = 3.0;
  const [top, right, bottom, left] = L.shell(0, 0, 12, 8);
  L.open(bottom, 'door-sliding-glass', 6);
  L.open(bottom, 'window-panorama', 2.4);
  L.open(bottom, 'window-panorama', 9.6);
  L.open(right, 'window-small', 6.2);
  L.room(6, 4, 'מרכול', 'terrazzo', 'paint:#ffffff');
  for (const y of [0.6, 1.4, 2.2]) L.against('shop-fridge', left, 8 - y, { x: 3, y });
  L.against('produce-stand', top, 2.4, { x: 2.4, y: 3 });
  L.against('produce-stand', top, 4.0, { x: 4, y: 3 });
  L.against('bakery-display', top, 6.6, { x: 6.6, y: 3 });
  for (const y of [0.9, 2.1, 3.3]) L.against('shop-shelf', right, y, { x: 9, y });
  for (const x of [3.3, 6.2]) {
    for (const y of [3.4, 4.6]) {
      L.put('shop-shelf', x - 0.255, y, FACE.W);
      L.put('shop-shelf', x + 0.255, y, FACE.E);
    }
  }
  L.put('checkout-counter', 9.4, 5.9, FACE.W);
  L.put('shopping-cart', 1.2, 6.9, FACE.N);
  L.put('shopping-cart', 1.95, 6.9, FACE.N);
  for (const [x, y] of [[3, 2.4], [8.6, 2.4], [3, 5.6], [8.6, 5.6]] as const) L.put('ceiling-light', x, y);
  L.put('recycling-bins', 13.6, 6.6, FACE.W);
  L.put('planter', 2.4, 9.2);
  L.put('planter', 9.6, 9.2);
  return b;
}

/** Café with a service counter, tables, booths and a small terrace (10 x 8 m). */
function cafe(): Building {
  const { b, L } = make('בית קפה', 'cafe', 'brick-red', { type: 'hip', finish: 'roof-slate', pitch: 24 });
  b.levels[0].height = 3.0;
  const [top, right, bottom, left] = L.shell(0, 0, 10, 8);
  L.open(bottom, 'door-entrance', 5);
  L.open(bottom, 'window-panorama', 2.0);
  L.open(bottom, 'window-panorama', 8.0);
  L.open(left, 'window-wide', 3.4);
  L.open(right, 'window-small', 1.0);
  L.room(5, 4, 'בית קפה', 'oak-herringbone', 'paint:#f4f1ea');
  // service area along the back wall
  L.against('fridge', top, 0.55, { x: 0.55, y: 3 });
  L.against('kitchen-sink', top, 1.4, { x: 1.4, y: 3 });
  L.against('kitchen-base', top, 2.1, { x: 2.1, y: 3 });
  L.against('kitchen-drawers', top, 2.7, { x: 2.7, y: 3 });
  L.put('cafe-counter', 2.0, 2.05);
  L.put('bakery-display', 3.8, 2.05);
  L.against('menu-board', top, 4.6, { x: 4.6, y: 3 });
  L.against('menu-board', top, 5.5, { x: 5.5, y: 3 });
  // tables
  for (const [x, y] of [[2.0, 4.6], [2.0, 6.5], [4.9, 4.9], [4.9, 6.7]] as const) {
    L.put('cafe-table', x, y);
    L.put('cafe-chair', x - 0.58, y, FACE.E);
    L.put('cafe-chair', x + 0.58, y, FACE.W);
  }
  for (const y of [3.4, 5.4]) {
    L.against('cafe-booth', right, y, { x: 8, y });
    L.put('cafe-table', 8.72, y);
    L.put('cafe-chair', 8.08, y, FACE.E);
  }
  L.put('plant-large', 9.2, 7.2);
  L.put('pendant-lamp', 2.0, 5.5);
  L.put('pendant-lamp', 4.9, 5.8);
  L.put('pendant-lamp', 8.4, 4.4);
  L.put('ceiling-light', 3, 1.2);
  // terrace
  L.put('patio-table', 2.2, 10.3);
  L.put('patio-table', 7.8, 10.3);
  L.put('planter', 5, 9.2);
  return b;
}

/** Public library with bookcases, reading tables and a children's corner (14 x 9 m). */
function library(): Building {
  const { b, L } = make('ספרייה', 'library', 'brick-grey', { type: 'flat', finish: 'roof-gravel' });
  b.levels[0].height = 3.2;
  const [top, right, bottom, left] = L.shell(0, 0, 14, 9);
  L.open(bottom, 'door-double', 7);
  for (const x of [1.6, 3.6, 10.4, 12.4]) L.open(bottom, 'window-tall', x);
  L.open(top, 'window-wide', 11);
  L.open(right, 'window-wide', 2.4);
  L.open(right, 'window-wide', 5.4);
  L.open(left, 'window-standard', 2.0);
  L.room(7, 4.5, 'ספרייה', 'walnut-planks', 'paint:#ebe5d9');
  for (const x of [2.2, 4.7, 7.2]) for (const y of [1.6, 3.5]) L.put('library-shelf', x, y, FACE.E);
  for (const y of [2.1, 5.0]) {
    L.put('reading-table', 11.2, y);
    for (const dx of [-0.5, 0.5]) {
      L.put('dining-chair', 11.2 + dx, y - 0.82, FACE.S);
      L.put('dining-chair', 11.2 + dx, y + 0.82, FACE.N);
    }
    L.put('pendant-lamp', 11.2, y);
  }
  L.put('reception-desk', 9.0, 7.3, FACE.W);
  L.against('waiting-chairs', bottom, 9.2, { x: 4.8, y: 7 });
  L.against('notice-board', left, 3.4, { x: 2, y: 5.6 });
  // children's corner
  L.put('play-rug', 2.0, 6.6);
  L.put('bean-bag', 1.3, 7.6, 2.4);
  L.put('bean-bag', 2.9, 7.5, 3.6);
  L.against('bookshelf', left, 2.2, { x: 2, y: 6.8 });
  L.put('plant-large', 13.2, 8.1);
  L.put('water-cooler', 6.2, 8.55, FACE.N);
  for (const [x, y] of [[3, 2.5], [6.5, 2.5], [3, 6.5], [7, 6.5]] as const) L.put('ceiling-light', x, y);
  L.put('street-bench', 3.2, 10.2, FACE.S);
  L.put('bike-rack', 11, 10.2);
  return b;
}

const sample = (): Building => sampleHouse();

export const TEMPLATES: BuildingTemplate[] = [
  { id: 'house-family', name: 'בית משפחה', group: 'house', size: { w: 12, d: 9 }, build: sample },
  { id: 'house-small', name: 'בית קטן', group: 'house', size: { w: 8, d: 6 }, build: smallHouse },
  { id: 'house-two-storey', name: 'בית דו־קומתי', group: 'house', size: { w: 10, d: 8 }, build: twoStoreyHouse },
  { id: 'school', name: 'בית ספר', group: 'public', size: { w: 22, d: 12 }, build: school },
  { id: 'shop', name: 'מרכול', group: 'public', size: { w: 12, d: 8 }, build: shop },
  { id: 'cafe', name: 'בית קפה', group: 'public', size: { w: 10, d: 8 }, build: cafe },
  { id: 'library', name: 'ספרייה', group: 'public', size: { w: 14, d: 9 }, build: library },
  {
    id: 'house-empty',
    name: 'מגרש ריק לבנייה',
    group: 'house',
    size: { w: 8, d: 8 },
    build: () => {
      const b = emptyBuilding();
      b.name = 'בית חדש';
      return b;
    },
  },
];

export function registerTemplates(list: BuildingTemplate[]): void {
  for (const t of list) if (!TEMPLATES.some((x) => x.id === t.id)) TEMPLATES.push(t);
}

export function buildTemplate(id: string): Building | null {
  const t = TEMPLATES.find((x) => x.id === id);
  return t ? t.build() : null;
}
