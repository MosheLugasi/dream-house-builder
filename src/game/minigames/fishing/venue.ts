import { FACE } from '../../../model/templates';
import type { VenueBuilder } from '../plots';

/** The lake (water area, plot-local) and where the pier starts. */
export const LAKE = { x0: 7, y0: 14, x1: 45, y1: 46 };

/**
 * Plot e-far (50 × 50 m, the street to the north): a lake with a wooden pier going out from a
 * sandy beach, reeds and rocks along the shore, lily pads, a rowboat, benches and a bait kiosk.
 */
export function buildLake(v: VenueBuilder): void {
  const L = LAKE;
  // ground: the water, a beach where the pier starts, a gravel path from the street
  v.area(L.x0, L.y0, L.x1, L.y1, 'water');
  v.area(L.x0, 10, L.x1, L.y0, 'sand');
  v.area(22, 0, 29, 10, 'gravel');
  // the pier: from the beach 11 m out into the lake (its far end faces south)
  v.prop('fishing-pier', 25.5, 19.6, FACE.S);
  v.prop('rowboat', 28.6, 22.5, FACE.S + 0.12);
  // shore: reeds and rocks hide the straight edges of the water
  for (const y of [17, 23, 29.5, 36, 42.5]) {
    v.prop('lake-reeds', L.x0 + 0.5, y, FACE.E + (y % 3) * 0.3);
    v.prop('lake-reeds', L.x1 - 0.5, y + 2.5, FACE.W - (y % 2) * 0.4);
  }
  for (const x of [12, 19, 33, 40]) v.prop('lake-reeds', x, L.y1 - 0.5, FACE.N + (x % 3) * 0.2);
  v.prop('lake-reeds', 10.5, 14.4, FACE.S);
  v.prop('lake-reeds', 41.5, 14.4, FACE.S + 0.5);
  for (const [x, y, r] of [
    [L.x0 + 0.4, L.y0 + 0.3, 0.4],
    [L.x1 - 0.4, L.y0 + 0.4, 2.1],
    [L.x0 + 0.5, L.y1 - 0.4, 1.2],
    [L.x1 - 0.5, L.y1 - 0.5, 3.0],
    [L.x0 + 0.6, 26.4, 1.6],
    [L.x1 - 0.6, 33.0, 0.2],
    [26, L.y1 - 0.4, 2.6],
    [16.5, 13.4, 0.7],
  ]) {
    v.prop('lake-rocks', x, y, r);
  }
  for (const [x, y] of [
    [13, 24],
    [37.5, 35],
    [19, 40],
    [36, 20],
  ]) {
    v.prop('lily-pads', x, y, x * 0.3);
  }
  // the beach: benches looking at the water, a picnic table, a bait kiosk, a fire pit
  v.prop('garden-bench', 15, 11.2, FACE.S);
  v.prop('garden-bench', 36, 11.2, FACE.S);
  v.prop('picnic-table', 40.5, 6.5, FACE.S);
  v.prop('kiosk', 11, 5.4, FACE.N);
  v.prop('fire-pit-stones', 44, 5);
  v.prop('trash-bin', 30.2, 9.3);
  v.prop('sun-lounger', 19, 11.6, FACE.S);
  // lamps along the path and on the beach
  for (const [x, y] of [
    [21.3, 3],
    [29.7, 6],
    [8.5, 11.5],
    [43.5, 11.5],
  ]) {
    v.prop('garden-lamp', x, y);
  }
  // trees around the lake
  for (const [x, y, id] of [
    [3, 3, 'tree'],
    [47, 3, 'olive-tree'],
    [3, 18, 'tree-cypress'],
    [3, 30, 'tree'],
    [3, 43, 'tree-cypress'],
    [47.5, 20, 'tree'],
    [47.5, 32, 'tree-cypress'],
    [47.5, 44, 'olive-tree'],
    [10, 48.4, 'tree-cypress'],
    [25, 48.4, 'tree'],
    [40, 48.4, 'tree-cypress'],
    [33, 3, 'tree-fruit'],
  ] as Array<[number, number, string]>) {
    v.prop(id, x, y);
  }
  for (const [x, y] of [
    [5, 9],
    [46, 9],
    [17, 2],
    [36, 1.8],
  ]) {
    v.prop('bush', x, y);
  }
  v.sign(19.8, 1.6, FACE.N);
}
