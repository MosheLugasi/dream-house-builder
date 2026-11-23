import { getFurniture } from '../catalog';
import { emptyBuilding } from './defaults';
import { sampleHouse } from './sample';
import { DEFAULT_WALL_THICKNESS, EXTERIOR_WALL_THICKNESS, newId, type Building, type Level, type Opening, type Roof, type Wall } from './types';

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
  U.put('bunk-bed', 0.64, 6.9, FACE.E);
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

const sample = (): Building => sampleHouse();

export const TEMPLATES: BuildingTemplate[] = [
  { id: 'house-family', name: 'בית משפחה', group: 'house', size: { w: 12, d: 9 }, build: sample },
  { id: 'house-small', name: 'בית קטן', group: 'house', size: { w: 8, d: 6 }, build: smallHouse },
  { id: 'house-two-storey', name: 'בית דו־קומתי', group: 'house', size: { w: 10, d: 8 }, build: twoStoreyHouse },
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
