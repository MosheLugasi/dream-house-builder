import { FACE } from '../../../model/templates';
import type { VenueBuilder } from '../plots';
import type { MiniGameDef } from '../types';
import { RACE_REF_TIME } from './circuit';
import { startRace } from './session';

/**
 * "מירוץ בשכונה": a 3-lap street race on the neighborhood's own roads against three rivals. The
 * circuit is found automatically through the road grid from the road next to the start sign (see
 * circuit.ts); the pit (garages, grandstand, podium) is in the east half of plot e-mid, which the
 * pizzeria (delivery) shares.
 */

/** the race pit: east half of the plot (plot-local x 25…50) */
export function buildRacePit(v: VenueBuilder): void {
  v.area(25.5, 0, 50, 13.5, 'asphalt');
  v.area(25.5, 13.5, 50, 30, 'grass');
  v.area(36, 13.5, 39, 30, 'pavers');
  v.sign(27.6, 1.0, FACE.N);
  // grandstand looking at the start straight, flags at both ends
  v.prop('race-grandstand', 44.4, 2.6, FACE.N);
  v.prop('race-flag-checkered', 39.6, 0.8, FACE.N);
  v.prop('race-flag-checkered', 49.2, 0.8, FACE.N);
  // two pit garages, open towards the street, with the three race vehicles in front
  v.prop('race-pit-garage', 30, 10.2, FACE.N, { colors: { accent: '#d7262b' } });
  v.prop('race-pit-garage', 36.6, 10.2, FACE.N, { colors: { accent: '#2f6fd6' } });
  v.prop('car-compact', 30, 4.6, FACE.N, { colors: { body: '#f2c230' } });
  v.prop('bicycle', 35.4, 4.8, FACE.N, { colors: { frame: '#e0402f' } });
  v.prop('kick-scooter', 37.6, 4.8, FACE.N, { colors: { frame: '#2f6fd6' } });
  // podium, tyre walls and cones
  v.prop('race-podium', 45, 9.6, FACE.N);
  for (const [x, y] of [
    [26.3, 3.2],
    [26.3, 4.0],
    [26.3, 4.8],
    [40.6, 8.0],
    [40.6, 8.8],
    [49.2, 6.4],
    [49.2, 7.2],
  ] as const)
    v.prop('race-tire-stack', x, y, 0, { colors: { band: (x + y) % 2 > 1 ? '#d7262b' : '#ffffff' } });
  for (let i = 0; i < 5; i++) v.prop('race-cone', 33.2 + i * 0.9, 6.9);
  v.prop('race-arch', 37.5, 15.5, FACE.N, { colors: { color: '#e0402f' }, size: { w: 6, d: 1, h: 4 } });
  // a bit of green behind the pit
  v.prop('street-bench', 34.6, 20, FACE.E);
  v.prop('street-bench', 40.4, 20, FACE.W);
  v.prop('tree', 30, 22, 0.4);
  v.prop('tree', 46, 18.5, 1.2);
  v.prop('tree', 45, 26.5, 2.1);
  v.prop('tree-cypress', 27, 28);
  v.prop('bush', 31.5, 27.5);
  v.prop('flower-bed', 43, 14.6);
  v.prop('trash-bin', 33, 14.4);
}

export const GAME: MiniGameDef = {
  id: 'race',
  howTo: [
    'בחרו כלי: 1 מכונית · 2 אופניים · 3 קורקינט (או עלו על כלי בפיטס)',
    'W/S גז ובלם · A/D היגוי – לבלום לפני הפניות!',
    'לעבור בכל השערים לפי הסדר, 3 הקפות נגד 3 יריבים',
    'החץ מראה את השער הבא · R מחזיר למסלול',
    'הציון: הזמן שלך (מותאם לכלי ולמסלול) – פחות זה טוב יותר',
  ],
  medals: { gold: RACE_REF_TIME * 1.1, silver: RACE_REF_TIME * 1.3, bronze: RACE_REF_TIME * 1.7, lowerIsBetter: true, unit: 'seconds' },
  venue: { plot: 'e-mid', build: buildRacePit },
  start: (ctx) => startRace(ctx),
};
