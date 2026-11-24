import { FACE } from '../../../model/templates';
import type { VenueBuilder } from '../plots';

/**
 * The skatepark (plot 'se', 50 × 40 m, streets on every side). Plot-local meters: x east, y south.
 * Riders start at the drop-in pad near the north street and roll south into the park.
 */
export function buildSkateparkVenue(v: VenueBuilder): void {
  // ground: a concrete bowl of a park with grass strips around it
  v.area(3, 4, 47, 39, 'concrete-polished');
  v.area(0, 0, 20, 4, 'grass');
  v.area(30, 0, 50, 4, 'grass');
  v.area(20, 0, 30, 4, 'pavers');
  v.area(0, 4, 3, 40, 'grass');
  v.area(47, 4, 50, 40, 'grass');
  v.area(3, 39, 47, 40, 'grass');

  // start sign at the entrance, facing the street
  v.sign(17.5, 1.4, FACE.N);

  // rides waiting at the drop-in pad
  v.prop('skateboard-ride', 24, 7.2, 0);
  v.prop('skateboard-ride', 25.4, 7.2, 0, { colors: { deck: '#e8433a', stripe: '#ffffff', wheels: '#ffd23a' } });
  v.prop('kick-scooter', 27, 7.2, 0);
  v.prop('bicycle', 29, 7.2, 0, { colors: { frame: '#222428', seat: '#111111' } });
  v.prop('bike-rack', 32, 5.4, FACE.S);

  // the long quarter pipe along the south edge, facing the park
  v.prop('skate-quarter-pipe', 20, 36.6, FACE.N, { size: { w: 10, d: 2.4, h: 1.3 } });
  // the mini ramp (half pipe) on the east side, riding east–west
  v.prop('skate-mini-ramp', 41.5, 22, FACE.E);
  // two kickers in the run-in from the start, lips towards the south
  v.prop('skate-kicker', 15, 15, FACE.N);
  v.prop('skate-kicker', 33, 15, FACE.N, { size: { w: 1.5, d: 2.2, h: 0.8 }, colors: { surface: '#2f7fd0', sides: '#3c4450' } });
  // funbox in the middle, a rail and a ledge
  v.prop('skate-funbox', 24, 23, 0);
  v.prop('skate-grind-rail', 9, 22, 0, { size: { w: 0.3, d: 4, h: 0.4 } });
  v.prop('skate-ledge', 41, 10.5, FACE.E, { size: { w: 0.6, d: 4, h: 0.42 } });
  v.prop('skate-pyramid', 10, 31, 0);
  v.prop('skate-stair-set', 33, 31.2, FACE.N);

  // graffiti walls around the park
  v.prop('skate-graffiti-wall', 1.4, 21, FACE.E, { size: { w: 12, d: 0.3, h: 2.6 } });
  v.prop('skate-graffiti-wall-2', 20, 39.4, FACE.N, { size: { w: 12, d: 0.3, h: 2.4 } });
  v.prop('skate-graffiti-wall-3', 48.6, 9, FACE.W, { size: { w: 8, d: 0.3, h: 2.4 } });

  // spectators' corner and park furniture
  v.prop('skate-bleachers', 5.2, 9.5, FACE.E);
  v.prop('skate-bleachers', 46, 33, FACE.W, { colors: { seat: '#e8433a', frame: '#9aa0a6' } });
  v.prop('street-bench', 11, 5.2, FACE.S);
  v.prop('street-bench', 39, 5.2, FACE.S);
  v.prop('trash-bin', 13.2, 5.2);
  v.prop('drinking-fountain', 36.8, 5.2);
  v.prop('kiosk', 45.5, 3.2, FACE.S);
  for (const [x, y] of [
    [3.5, 4.5],
    [46.5, 15.5],
    [3.5, 37],
    [46.5, 38],
    [28, 38.6],
  ] as const) {
    v.prop('street-lamp', x, y, FACE.S);
  }
  // trees on the grass
  for (const [x, y, id] of [
    [1.5, 1.5, 'tree'],
    [9, 1.6, 'olive-tree'],
    [42, 1.6, 'olive-tree'],
    [48.4, 24, 'tree'],
    [1.5, 36, 'tree'],
    [1.5, 6, 'bush'],
  ] as const) {
    v.prop(id, x, y);
  }
}
