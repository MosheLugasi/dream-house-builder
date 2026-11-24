import { FACE } from '../../../model/templates';
import type { VenueBuilder } from '../plots';
import type { MiniGameDef } from '../types';
import { startDelivery } from './session';

/**
 * "שליח פיצה": pick up hot pizzas at the pizzeria's counter and ride them to the front doors of the
 * neighborhood's houses before they cool down. The pizzeria fills the west half of plot e-mid (the
 * race pit is the east half).
 */
export function buildPizzeria(v: VenueBuilder): void {
  v.area(0, 0, 25, 6.5, 'pavers');
  v.area(15, 6.5, 25, 15, 'cobblestone');
  v.area(0, 15, 25, 30, 'grass');
  v.area(9, 15, 11, 30, 'pavers');
  // the pizzeria: a café building turned into a pizza place, its door towards the north street
  v.building('cafe', 15, 14.5, Math.PI, 'פיצה שמש');
  v.prop('pizza-sign', 3.4, 4.4, FACE.N);
  v.prop('pizza-counter', 19.8, 2.6, FACE.N, { colors: { canopy: '#1f7a3a' } });
  v.prop('pizza-box-stack', 21.7, 3.6);
  v.prop('pizza-box-stack', 17.8, 3.7);
  v.sign(23.8, 1.0, FACE.N);
  v.prop('menu-board', 16.6, 2.0, FACE.N);
  // kitchen yard: wood oven, delivery bikes and the bins
  v.prop('fire-pizza-oven', 20, 9.2, FACE.N);
  v.prop('delivery-bike', 16.4, 11.6, FACE.E);
  v.prop('delivery-bike', 16.4, 12.6, FACE.E, { colors: { box: '#1f7a3a' } });
  v.prop('bike-rack', 23.5, 12, FACE.W);
  v.prop('recycling-bins', 23.4, 7.8, FACE.W);
  v.prop('planter', 1.4, 5.6);
  v.prop('planter', 15.5, 5.8);
  // garden with tables behind
  v.prop('picnic-table', 5, 21);
  v.prop('picnic-table', 16, 21);
  v.prop('patio-table', 5, 26.5);
  v.prop('patio-table', 16, 26.5);
  v.prop('tree', 2.5, 17, 0.3);
  v.prop('tree', 22.5, 18, 1.7);
  v.prop('olive-tree', 21.5, 27.5);
  v.prop('palm-tree', 2.5, 28);
  v.prop('flower-bed', 7.5, 16.2);
  v.prop('flower-bed', 12.5, 16.2);
}

export const GAME: MiniGameDef = {
  id: 'delivery',
  howTo: [
    'עולים על אופני השליחויות (E) ועוצרים בעיגול הכתום ליד הדלפק',
    'החץ מוביל לבית שהזמין – עוצרים ליד הדלת ולוחצים E',
    'פיצה חמה = יותר נקודות · רצף של פיצות חמות = בונוס',
    'התנגשות מקפיצה את הפיצה (פחות חום ונקודות) · ⚡ הזמנה דחופה = ×1.5',
    '3 דקות – כמה שיותר משלוחים!',
  ],
  medals: { bronze: 300, silver: 800, gold: 1400, unit: 'points' },
  venue: { plot: 'e-mid', build: buildPizzeria },
  start: (ctx) => startDelivery(ctx),
};
