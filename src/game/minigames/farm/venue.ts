import { FACE } from '../../../model/templates';
import type { VenueBuilder } from '../plots';

/**
 * "החווה שלי" on the west plot (plot-local meters, x east, y south; the main street runs along
 * the south edge, the old neighborhood's west street along the east edge). The north-east corner
 * is left for the treasure hunt's explorers' camp.
 */
export const FARM_BEDS: Array<[number, number]> = [
  [13, 22],
  [25, 22],
  [13, 25.5],
  [25, 25.5],
  [13, 29],
  [25, 29],
  [13, 32.5],
  [25, 32.5],
];

export function buildFarmVenue(v: VenueBuilder): void {
  // ground: a tilled field under the beds, gravel paths, the farmyard and the market corner
  v.area(9.8, 19.8, 28.2, 34.7, 'soil');
  v.area(17.9, 19.8, 20.1, 49.6, 'gravel');
  v.area(1.5, 12.2, 31, 17.2, 'gravel');
  v.area(23.5, 43.4, 37.5, 49.6, 'pavers');
  v.area(20.2, 2.4, 28.8, 10.6, 'sand');

  // barn, hay, tractor
  v.prop('farm-barn', 9, 7.4, FACE.S);
  for (const [x, y, e] of [
    [2.6, 8.9, 0],
    [2.6, 10.1, 0],
    [2.6, 9.5, 0.5],
    [14.4, 10.6, 0],
  ] as const) v.prop('farm-hay-bale', x, y, Math.PI / 2, { elevation: e });
  v.prop('tractor', 16.4, 5.6, FACE.S);
  v.prop('farm-well', 4.2, 15.6);
  v.prop('farm-crates', 14.6, 13.2, FACE.S);

  // chicken run with the coop
  v.prop('farm-coop', 24.6, 5.6, FACE.S);
  v.prop('farm-fence', 24.5, 2.2, 0, { size: { w: 8.4, d: 0.17, h: 1.05 } });
  v.prop('farm-fence', 20.2, 6.5, Math.PI / 2, { size: { w: 8.2, d: 0.17, h: 1.05 } });
  v.prop('farm-fence', 28.8, 6.5, Math.PI / 2, { size: { w: 8.2, d: 0.17, h: 1.05 } });
  v.prop('farm-fence', 21.8, 10.8, 0, { size: { w: 2.8, d: 0.17, h: 1.05 } });
  v.prop('farm-fence', 27.2, 10.8, 0, { size: { w: 2.8, d: 0.17, h: 1.05 } });
  for (const [x, y, r] of [
    [22.4, 8.4, 0.6],
    [26.6, 8.9, -2.2],
    [23.6, 9.6, 2.6],
  ] as const) v.prop('farm-chicken', x, y, r);

  // vegetable beds, the garden tap in the middle aisle, a scarecrow keeping the crows away
  for (const [x, y] of FARM_BEDS) v.prop('farm-bed', x, y);
  v.prop('farm-tap', 19, 27.3, FACE.E);
  v.prop('farm-scarecrow', 19, 36, FACE.S);

  // the lemon orchard
  for (const [x, y] of [
    [38.6, 19.5],
    [44.6, 19.5],
    [38.6, 26],
    [44.6, 26],
    [41.6, 32.5],
  ] as const) v.prop('tree-fruit', x, y, x);

  // the market stand by the street
  v.prop('farm-market-stand', 30.5, 46.4, FACE.S);
  v.prop('farm-crates', 27.6, 46.6, FACE.S);
  v.prop('farm-hay-bale', 34.2, 46.2, 0);
  v.prop('flower-bed', 25.6, 43.8, 0, { colors: { flowers: '#f2b632' } });
  v.prop('flower-bed', 35.6, 43.8, 0, { colors: { flowers: '#e0607a' } });
  v.sign(36.8, 48.4, FACE.S);

  // fences along the streets (a gate gap for the market and the path)
  const fence = (x: number, y: number, w: number, rot: number) => v.prop('farm-fence', x, y, rot, { size: { w, d: 0.17, h: 1.05 } });
  fence(6.9, 49.3, 11.6, 0);
  fence(17.4, 49.3, 9.2, 0);
  fence(44.2, 49.3, 9.6, 0);
  fence(0.7, 22.5, 12, Math.PI / 2);
  fence(0.7, 34.5, 12, Math.PI / 2);
  fence(0.7, 44.6, 8.2, Math.PI / 2);
  fence(49.3, 22.5, 9, Math.PI / 2);
  fence(49.3, 33.5, 12, Math.PI / 2);
  fence(49.3, 44.3, 9.4, Math.PI / 2);

  // greenery around the edges
  for (const [x, y] of [
    [2.5, 2.5],
    [3, 26],
    [3.2, 38],
    [8, 45.5],
    [46.5, 40],
    [33.5, 3],
  ] as const) v.prop('tree', x, y, x);
  for (const [x, y] of [
    [6, 18.6],
    [31.5, 18.6],
    [7, 40],
    [31, 40],
  ] as const) v.prop('bush', x, y);
}

/** The explorers' camp in the plot's north-east corner: the treasure hunt starts here. */
export function buildTreasureCamp(v: VenueBuilder): void {
  v.area(36.5, 0.6, 49.6, 13.4, 'sand');
  v.prop('treasure-tent', 40.6, 5, FACE.E);
  v.prop('treasure-map-board', 46.2, 11.2, FACE.E);
  v.prop('treasure-chest', 45, 2.6, FACE.E);
  v.prop('fire-pit-stones', 43, 8);
  v.prop('farm-hay-bale', 43, 10.1, 0);
  v.prop('farm-hay-bale', 40.6, 8.6, Math.PI / 2);
  v.prop('palm-tree', 38, 11.8);
  v.prop('palm-tree', 48.4, 1.6);
  // something to explore the neighborhood with
  v.prop('kids-bike', 47.2, 4.2, FACE.E);
  v.prop('bicycle', 47.4, 5.6, FACE.E);
  v.sign(48.7, 8.2, FACE.E);
}
