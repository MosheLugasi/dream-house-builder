import { FACE } from '../../../model/templates';
import type { VenueBuilder } from '../plots';

/**
 * The default amusement park in the 'south' plot (110 × 50 m, plot-local: x east, y south; streets on
 * every side). A row of rides along the north street behind an entrance plaza, a midway (the main
 * promenade) along the middle and three roller coasters in the south half.
 */

/** the midway's centre line (plot-local y) and its ends; visitors walk along it */
export const MIDWAY = { y: 20, x0: 3, x1: 107 };

export function buildPark(v: VenueBuilder): void {
  const W = v.plot.w;
  const H = v.plot.h;
  // ---- ground: lawn, the entrance plaza, the midway and the little squares in front of the rides
  v.area(0, 0, W, H, 'grass');
  v.area(37, 0, 58, 17, 'cobblestone');
  v.area(1, 16.6, W - 1, 23.6, 'pavers');
  v.area(1, 23.6, W - 1, 28.4, 'pavers');
  for (const [x0, x1] of [
    [7, 18],
    [24.5, 35.5],
    [60, 72],
    [77, 91],
    [97, 105],
  ])
    v.area(x0, 12.5, x1, 16.6, 'pavers');
  v.area(75, 3.5, 93, 15.5, 'asphalt');

  // ---- the entrance: gate, ticket booths, the start sign, a fountain and the balloon man
  v.prop('amuse-gate', 47.5, 1.4, FACE.N);
  v.sign(36.2, 1.0, FACE.N);
  v.prop('amuse-ticket-booth', 40.0, 6.2, FACE.E);
  v.prop('amuse-ticket-booth', 55.0, 6.2, FACE.W);
  v.prop('fountain', 47.5, 10.2, 0, { size: { w: 5, d: 5, h: 2.2 } });
  for (const [x, y] of [
    [43.6, 10.2],
    [51.4, 10.2],
  ])
    v.prop('flower-bed', x, y, Math.PI / 2);
  v.prop('amuse-balloon-cart', 44.0, 14.0, FACE.S);
  for (const [x, y, r] of [
    [41.2, 12.4, FACE.E],
    [53.8, 12.4, FACE.W],
  ] as const)
    v.prop('street-bench', x, y, r);

  // ---- the north row (fronts towards the midway)
  v.prop('amuse-ferris-wheel', 12.5, 9.0, FACE.S, { colors: { pods: '#2f7fd0', pods2: '#f2b824' } });
  v.prop('amuse-teacups', 30.0, 9.6, FACE.S);
  v.prop('amuse-pirate-ship', 66.0, 9.0, FACE.S);
  v.prop('amuse-bumper-cars', 84.0, 9.5, FACE.S);
  v.prop('amuse-drop-tower', 101.0, 9.0, FACE.S);

  // ---- the south row: three coasters facing the midway
  v.prop('amuse-coaster-family', 16.0, 37.5, FACE.N);
  v.prop('amuse-coaster-helix', 47.0, 37.5, FACE.N, { size: { w: 30, d: 18, h: 12.75 } });
  v.prop('amuse-coaster-loop', 86.0, 37.0, FACE.N);

  // ---- food on the south side of the midway
  v.prop('amuse-stall-popcorn', 25.0, 25.4, FACE.N);
  v.prop('amuse-stall-cotton-candy', 35.6, 25.4, FACE.N);
  v.prop('amuse-stall-icecream', 66.5, 25.4, FACE.N);
  for (const [x, y] of [
    [28.6, 25.6],
    [62.6, 25.6],
  ])
    v.prop('picnic-table', x, y);

  // ---- light strings across the midway, lamp posts along it
  for (const x of [8, 21, 40, 57, 74, 95]) v.prop('amuse-light-string', x, 20, Math.PI / 2, { size: { w: 7.6, d: 0.4, h: 4.8 } });
  for (const x of [42, 53]) v.prop('amuse-light-string', x, 6.0, Math.PI / 2, { size: { w: 8, d: 0.4, h: 4.8 } });
  for (const [x, y] of [
    [14.5, 17.0],
    [31, 23.2],
    [48, 17.0],
    [65, 23.2],
    [80, 17.0],
    [96, 23.2],
    [38.4, 2.4],
    [56.6, 2.4],
  ])
    v.prop('amuse-lamp-post', x, y);

  // ---- benches and bins along the midway
  for (const x of [5, 27, 52, 71, 91, 106]) {
    v.prop('street-bench', x, 23.0, FACE.N);
    v.prop('trash-bin', x + 1.6, 23.2);
  }
  for (const x of [20, 59, 94]) v.prop('street-bench', x, 17.1, FACE.S);

  // ---- greenery: trees along the borders, palms by the plaza, bushes and flowers
  for (const x of [3, 25, 33, 59, 70, 76, 92, 107]) v.prop('tree', x, 1.8, x);
  for (const y of [5, 13]) {
    v.prop('palm-tree', 1.2, y);
    v.prop('palm-tree', W - 1.2, y);
  }
  for (const x of [5, 31.5, 61.5, 108]) v.prop('tree', x, 48.2, x * 3);
  for (const y of [30, 40]) {
    v.prop('tree', 0.9, y, y);
    v.prop('tree', W - 0.9, y + 3, y);
  }
  for (const x of [38.6, 56.4]) v.prop('palm-tree', x, 15.8);
  for (const [x, y] of [
    [23.3, 2.0],
    [36.7, 15.6],
    [58.8, 14.8],
    [73.6, 14.6],
    [94.6, 14.6],
    [106, 15],
    [2.5, 15.5],
  ])
    v.prop('bush', x, y);
  for (const [x, y] of [
    [5.5, 26.2],
    [44, 26.2],
    [56, 26.2],
    [104, 26.2],
  ])
    v.prop('flower-bed', x, y);
}
