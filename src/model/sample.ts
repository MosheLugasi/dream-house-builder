import { getFurniture } from '../catalog';
import { emptyBuilding, emptyProject } from './defaults';
import {
  DEFAULT_WALL_THICKNESS,
  EXTERIOR_WALL_THICKNESS,
  newId,
  type Building,
  type Opening,
  type Project,
  type Wall,
} from './types';

// plan rotations by the direction the item's front faces
const S = 0; // +y (down on the plan)
const N = Math.PI;
const E = -Math.PI / 2;
const W = Math.PI / 2;

/** A furnished single-storey family house (12 x 9 m) with a small garden. */
export function sampleHouse(): Building {
  const b = emptyBuilding();
  b.name = 'בית משפחה';
  const lvl = b.levels[0];
  b.exterior = 'jerusalem-stone';
  const EXT = EXTERIOR_WALL_THICKNESS;
  const INT = DEFAULT_WALL_THICKNESS;
  const wall = (ax: number, ay: number, bx: number, by: number, t: number): Wall => {
    const w: Wall = { id: newId('w'), a: { x: ax, y: ay }, b: { x: bx, y: by }, thickness: t };
    lvl.walls.push(w);
    return w;
  };
  const open = (
    w: Wall,
    type: Opening['type'],
    style: string,
    offset: number,
    width: number,
    height: number,
    sill: number,
    flips: Partial<Opening> = {},
  ) => {
    lvl.openings.push({ id: newId('o'), wallId: w.id, type, style, offset, width, height, sill, ...flips });
  };
  const put = (catalogId: string, x: number, y: number, rotation = S, colors?: Record<string, string>) => {
    const def = getFurniture(catalogId);
    if (!def) {
      console.warn(`[sample] unknown catalog item "${catalogId}"`);
      return;
    }
    lvl.furniture.push({
      id: newId('f'),
      catalogId,
      x,
      y,
      rotation,
      elevation: def.mount === 'wall' ? (def.elevation ?? 1.2) : 0,
      ...(colors ? { colors } : {}),
    });
  };

  // ---- shell 12 x 9 m ----
  const top = wall(0, 0, 12, 0, EXT);
  const right = wall(12, 0, 12, 9, EXT);
  const bottom = wall(12, 9, 0, 9, EXT);
  const left = wall(0, 9, 0, 0, EXT);
  const spine = wall(7, 0, 7, 9, INT);
  const bed1 = wall(7, 3.6, 12, 3.6, INT);
  const bed2 = wall(7, 6, 12, 6, INT);
  const bath = wall(9.2, 3.6, 9.2, 6, INT);

  // ---- openings (offset is measured from the wall's first point) ----
  open(bottom, 'door', 'door-entrance', 8.6, 1.0, 2.15, 0); // x = 3.4
  open(bottom, 'window', 'window-wide', 10.4, 2.0, 1.4, 0.8); // x = 1.6
  open(bottom, 'window', 'window-standard', 2.5, 1.4, 1.3, 0.9); // x = 9.5 (kids room)
  open(left, 'door', 'door-sliding-glass', 3.2, 2.4, 2.2, 0); // y = 5.8
  open(top, 'window', 'window-standard', 1.6, 1.4, 1.1, 1.05);
  open(top, 'window', 'window-standard', 5.6, 1.4, 1.3, 0.9);
  open(top, 'window', 'window-wide', 9.5, 2.0, 1.3, 0.9);
  open(right, 'window', 'window-small', 4.8, 0.6, 0.6, 1.5);
  open(right, 'window', 'window-standard', 7.7, 1.2, 1.3, 0.9);
  open(spine, 'door', 'opening-passage', 4.8, 1.3, 2.2, 0);
  open(bed1, 'door', 'door-interior', 0.75, 0.9, 2.1, 0, { flipV: true });
  open(bed2, 'door', 'door-interior', 0.75, 0.9, 2.1, 0);
  open(bath, 'door', 'door-interior', 1.2, 0.8, 2.1, 0, { flipV: true });

  lvl.roomStyles.push(
    { id: newId('rs'), point: { x: 3.5, y: 4.5 }, name: 'סלון ומטבח', floor: 'oak-planks', wall: 'paint:#f4f1ea' },
    { id: newId('rs'), point: { x: 9.5, y: 1.8 }, name: 'חדר שינה הורים', floor: 'walnut-planks', wall: 'paint:#e4e8e1' },
    { id: newId('rs'), point: { x: 8.1, y: 4.8 }, name: 'מסדרון', floor: 'oak-planks', wall: 'paint:#f4f1ea' },
    { id: newId('rs'), point: { x: 10.6, y: 4.8 }, name: 'אמבטיה', floor: 'hex-tiles', wall: 'subway-tiles' },
    { id: newId('rs'), point: { x: 9.5, y: 7.5 }, name: 'חדר ילדים', floor: 'carpet-beige', wall: 'paint:#f6e3d7' },
  );

  // ---- kitchen (along the top wall) ----
  const ky = 0.125 + 0.3 + 0.005;
  put('fridge', 0.52, 0.125 + 0.35 + 0.005);
  put('kitchen-base', 1.2, ky);
  put('kitchen-sink', 1.9, ky);
  put('dishwasher', 2.6, ky);
  put('kitchen-stove', 3.2, ky);
  put('kitchen-drawers', 3.8, ky);
  put('kitchen-base', 4.4, ky);
  put('range-hood', 3.2, 0.125 + 0.24 + 0.005);
  put('kitchen-wall-cabinet', 2.6, 0.125 + 0.175 + 0.005);
  put('kitchen-wall-cabinet', 3.8, 0.125 + 0.175 + 0.005);
  put('kitchen-wall-cabinet', 4.4, 0.125 + 0.175 + 0.005);
  put('kitchen-island', 2.7, 2.35);
  for (const x of [2.1, 2.7, 3.3]) put('bar-stool', x, 3.12, N);
  for (const x of [1.4, 2.7, 4.0]) put('ceiling-spot', x, 1.3);

  // ---- dining ----
  put('dining-table', 5.35, 2.5, W);
  for (const y of [1.95, 2.5, 3.05]) {
    put('dining-chair', 4.62, y, E);
    put('dining-chair', 6.08, y, W);
  }
  put('pendant-lamp', 5.35, 2.5);

  // ---- living ----
  put('rug', 5.0, 6.9, W);
  put('sofa-3', 3.55, 6.9, E);
  put('coffee-table', 5.0, 6.9, W);
  put('tv-console', 6.925 - 0.21 - 0.005, 6.9, W);
  put('armchair', 5.0, 8.3, N);
  put('side-table', 3.55, 5.4);
  put('bookshelf', 6.25, 8.875 - 0.16 - 0.005, N);
  put('floor-lamp', 4.25, 8.5);
  put('plant-large', 0.75, 8.2);
  put('plant-snake', 0.5, 4.15);
  put('wall-painting', 0.125 + 0.0175 + 0.005, 3.0, E);
  put('ceiling-light', 4.6, 6.9);

  // ---- parents' bedroom ----
  put('bed-double', 11.875 - 1.055 - 0.005, 1.8, W);
  put('nightstand', 11.875 - 0.2 - 0.005, 0.68, W);
  put('nightstand', 11.875 - 0.2 - 0.005, 2.92, W);
  put('wardrobe', 7.075 + 0.3 + 0.005, 1.35, E);
  put('dresser', 9.5, 3.525 - 0.24 - 0.005, N);
  put('wall-painting', 11.875 - 0.0175 - 0.005, 1.8, W);
  put('ceiling-light', 9.3, 1.8);

  // ---- hallway ----
  put('ceiling-light', 8.1, 4.8);

  // ---- bathroom ----
  put('bathtub', 10.95, 5.925 - 0.375 - 0.005, N);
  put('basin-vanity', 10.2, 3.675 + 0.24 + 0.005);
  put('toilet', 11.4, 3.675 + 0.35 + 0.005);
  put('washing-machine', 9.62, 5.925 - 0.3 - 0.005, N);
  put('ceiling-light', 10.55, 4.8);

  // ---- kids' room ----
  put('rug', 9.2, 7.55, S, { main: '#e9c7b5' });
  put('bed-single', 11.875 - 1.055 - 0.005, 6.075 + 0.5 + 0.01, W);
  put('kids-desk', 9.5, 8.875 - 0.275 - 0.005, N);
  put('kids-chair', 9.5, 8.02, S);
  put('toy-chest', 7.075 + 0.225 + 0.005, 8.25, E);
  put('bean-bag', 8.15, 7.4, 0.6);
  put('play-tent', 11.15, 8.15, N);
  put('ceiling-light', 9.4, 7.45);

  put('pet-cat', 2.2, 5.3, 0.8);

  // ---- garden ----
  put('tree', -3.6, 1.6);
  put('tree-fruit', 15.2, 7.8, 1.2);
  put('tree-cypress', 13.6, -1.6);
  put('tree-cypress', 14.8, -1.9);
  put('bush', 5.2, 10.1);
  put('bush', 6.3, 10.2, 0.7);
  put('flower-bed', 1.6, 10.0);
  put('garden-bench', 14.2, 3.4, W);
  put('hedge', 2.0, -1.6);
  put('hedge', 4.4, -1.6);
  put('patio-table', -2.8, 5.0);
  put('sun-lounger', -3.4, 9.6, 0.4);
  put('garden-lamp', 4.6, 10.6);

  return b;
}
