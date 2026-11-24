import { FACE } from '../../../model/templates';
import type { VenueBuilder } from '../plots';

/** The stage in plot e-south: its centre (plot-local); it faces north, towards the street and the crowd. */
export const STAGE_AT = { x: 25, y: 31 };

/**
 * Plot e-south (50 × 40 m, the street to the north): an outdoor concert stage with a lighting
 * truss, an LED wall, PA speakers and a DJ booth, a paved audience plaza with barriers, and food
 * stalls, tables and trees around it.
 */
export function buildStage(v: VenueBuilder): void {
  const { x: sx, y: sy } = STAGE_AT;
  // ground
  v.area(8, 5, 42, 27, 'pavers');
  v.area(15, 27, 35, 37, 'asphalt');
  // the stage and its gear (the deck is 12 × 7, its top 1 m high)
  v.prop('concert-stage', sx, sy, FACE.N);
  v.prop('stage-truss', sx, sy - 3.15, FACE.N);
  v.prop('led-screen', sx, sy + 3.95, FACE.N);
  v.prop('stage-speaker', sx - 7.3, sy - 2.6, FACE.N + 0.15);
  v.prop('stage-speaker', sx + 7.3, sy - 2.6, FACE.N - 0.15);
  v.prop('stage-speaker', sx - 7.3, sy + 0.2, FACE.N);
  v.prop('stage-speaker', sx + 7.3, sy + 0.2, FACE.N);
  v.prop('music-dj-booth', sx - 3.6, sy + 1.9, FACE.N, { elevation: 1.0 });
  // crowd barriers in front of the stage
  for (let x = sx - 6.6; x <= sx + 6.7; x += 2.2) v.prop('crowd-barrier', x, sy - 5.6, FACE.N);
  // around the plaza: food stalls, tables, benches, lamps, trees
  v.prop('kiosk', 10, 9, FACE.E);
  v.prop('produce-stand', 40, 10, FACE.W, {});
  for (const [x, y] of [
    [6, 16],
    [6, 21],
  ]) {
    v.prop('patio-table', x, y);
  }
  for (const [x, y] of [
    [44, 16],
    [44, 21],
  ]) {
    v.prop('cafe-table', x, y);
    v.prop('cafe-chair', x - 0.7, y, FACE.E);
    v.prop('cafe-chair', x + 0.7, y, FACE.W);
  }
  v.prop('street-bench', 25, 4.2, FACE.S);
  v.prop('street-bench', 16, 4.2, FACE.S);
  v.prop('street-bench', 34, 4.2, FACE.S);
  v.prop('trash-bin', 12.5, 25.5);
  v.prop('trash-bin', 37.5, 25.5);
  v.prop('recycling-bins', 41, 34, FACE.W);
  for (const [x, y] of [
    [8.5, 5.5],
    [41.5, 5.5],
    [8.5, 26],
    [41.5, 26],
  ]) {
    v.prop('street-lamp', x, y, x < 25 ? FACE.E : FACE.W);
  }
  for (const [x, y, id] of [
    [3, 4, 'palm-tree'],
    [47, 4, 'palm-tree'],
    [3, 32, 'tree'],
    [47, 32, 'tree'],
    [10, 37.5, 'tree-cypress'],
    [40, 37.5, 'tree-cypress'],
    [3, 26, 'olive-tree'],
    [47, 26, 'olive-tree'],
  ] as Array<[number, number, string]>) {
    v.prop(id, x, y);
  }
  for (const [x, y] of [
    [14, 37.5],
    [36, 37.5],
    [3, 12],
    [47, 12],
  ]) {
    v.prop('bush', x, y);
  }
  v.prop('flagpole', 13, 30, FACE.N);
  v.prop('flagpole', 37, 30, FACE.N);
  v.sign(20, 1.6, FACE.N);
}
