import { getFurniture } from '../catalog';
import { emptyProject } from './defaults';
import { sampleHouse } from './sample';
import { buildTemplate, FACE } from './templates';
import { newId, type Building, type Project } from './types';
import { MINI_GAMES } from '../game/minigames/registry';
import { ensureDistrictRoads, installVenue } from '../game/minigames/plots';

/**
 * The starter project: a small furnished neighborhood so that a first-time player immediately has
 * something to explore – homes, a park with a playground, public buildings around a plaza,
 * streets to drive on and a few vehicles.
 *
 * Road grid: 10 m cells. Streets: y 0…10 (main) and y -60…-50 (north); x -60…-50, 0…10 and 60…70.
 */
export function sampleProject(): Project {
  const p = emptyProject('השכונה שלי');
  const site = p.site;

  // ---- streets ----
  for (let i = -6; i <= 6; i++) {
    site.roads.push([i, 0], [i, -6]);
  }
  for (let j = -5; j <= -1; j++) {
    site.roads.push([-6, j], [0, j], [6, j]);
  }
  for (let j = 1; j <= 3; j++) site.roads.push([0, j]);

  const area = (x0: number, y0: number, x1: number, y1: number, finish: string) => {
    site.areas.push({ id: newId('ar'), x0, y0, x1, y1, finish });
  };
  const prop = (catalogId: string, x: number, y: number, rotation = 0, colors?: Record<string, string>) => {
    const def = getFurniture(catalogId);
    if (!def) {
      console.warn(`[neighborhood] unknown catalog item "${catalogId}"`);
      return;
    }
    site.props.push({ id: newId('p'), catalogId, x, y, rotation, elevation: 0, ...(colors ? { colors } : {}) });
  };
  const place = (b: Building | null, x: number, y: number, rotation = 0, name?: string): void => {
    if (!b) return;
    b.x = x;
    b.y = y;
    b.rotation = rotation;
    if (name) b.name = name;
    p.buildings.push(b);
  };

  // ---- homes (block between the main street and the park) ----
  p.buildings = [];
  const home = sampleHouse();
  home.name = 'הבית שלי';
  place(home, -44, -14);
  place(buildTemplate('house-two-storey'), -22, -13);
  // across the main street, facing it
  place(buildTemplate('house-small'), -32, 24, Math.PI, 'בית קטן');
  place(buildTemplate('house-small'), -12, 24, Math.PI, 'הבית של סבתא');

  // ---- park (north half of the home block) ----
  area(-48, -22, -2, -20, 'pavers'); // promenade
  area(-27, -48, -25, -22, 'pavers');
  area(-46, -46, -29, -26, 'sand'); // playground
  area(-19, -45, -5, -35, 'water'); // pond
  area(-22, -32, -8, -24, 'asphalt'); // ball court
  prop('slide', -43, -41, FACE.S);
  prop('swing-set', -36.5, -43);
  prop('seesaw', -33, -37.5);
  prop('carousel', -42.5, -32);
  prop('climbing-frame', -36.5, -31);
  prop('spring-rider', -31.5, -29);
  prop('spring-rider', -31.5, -31, 0, { body: '#e0a23a' });
  prop('sandbox', -32, -43.5);
  prop('drinking-fountain', -28.2, -27);
  prop('street-bench', -47.2, -34, FACE.E);
  prop('street-bench', -47.2, -40, FACE.E);
  prop('street-bench', -24, -40, FACE.E);
  prop('street-bench', -12, -33.6, FACE.N);
  prop('basketball-hoop', -21.2, -28, FACE.E);
  prop('basketball-hoop', -8.8, -28, FACE.W);
  prop('ping-pong-table', -4.6, -28.5);
  prop('picnic-table', -4.5, -41);
  prop('picnic-table', -4.5, -45.5);
  prop('trash-bin', -24, -23);
  prop('trash-bin', -28.2, -46.5);
  for (const [x, y] of [[-47, -47.5], [-39, -47.6], [-30.5, -47.5], [-22, -46.5], [-12, -47.2], [-3, -32.5], [-23, -34], [-47.5, -24]] as const) prop('tree', x, y, x);
  prop('olive-tree', -21.5, -36);
  prop('palm-tree', -3.4, -36.5);
  prop('palm-tree', -20.5, -43.5);
  prop('bush', -6, -33.8);
  prop('bush', -16, -34);
  prop('flower-bed', -40, -23.4);
  prop('flower-bed', -34, -23.4);
  prop('flower-bed', -15, -23.4);

  // ---- public buildings around a plaza (east block) ----
  area(26, -34, 46, -14, 'cobblestone');
  place(buildTemplate('school'), 13, -47);
  place(buildTemplate('library'), 43, -47);
  place(buildTemplate('shop'), 13, -11.5);
  place(buildTemplate('cafe'), 48.5, -11.5);
  prop('fountain', 36, -24);
  prop('street-bench', 36, -30.5, FACE.S);
  prop('street-bench', 30, -24, FACE.E);
  prop('street-bench', 42, -24, FACE.W);
  prop('planter', 27.5, -32.5);
  prop('planter', 44.5, -32.5);
  prop('planter', 27.5, -15.5);
  prop('planter', 44.5, -15.5);
  prop('kiosk', 36, -16.6, FACE.N);
  prop('flagpole', 24, -36);
  prop('bike-rack', 27.5, -2.6);
  prop('recycling-bins', 44.5, -2.4, FACE.S);
  prop('olive-tree', 30.5, -6.5);
  prop('olive-tree', 41.5, -6.5);
  prop('palm-tree', 57, -36);
  prop('palm-tree', 12.5, -36);

  // ---- sports field and parking (south-east) ----
  area(14, 14, 40, 26, 'asphalt'); // parking
  prop('parking-sign', 13.2, 13.2);
  prop('football-goal', 45, 27, FACE.E);
  prop('football-goal', 58, 27, FACE.W);
  for (const [x, y] of [[43, 14], [51, 13.5], [59, 14.5], [59, 37], [44, 38]] as const) prop('tree', x, y, x);
  prop('picnic-table', 52, 36.5);

  // ---- street furniture ----
  for (const x of [-45, -25, -5, 15, 35, 55]) {
    prop('street-lamp', x, 1.0, FACE.S);
    prop('street-lamp', x + 10, 9.0, FACE.N);
    prop('street-lamp', x, -51.0, FACE.N);
  }
  for (const y of [-42, -24, -8]) {
    prop('street-lamp', -51.0, y, FACE.W);
    prop('street-lamp', 9.0, y, FACE.W);
    prop('street-lamp', 61.0, y, FACE.E);
  }
  prop('bus-stop', 20, 0.95, FACE.S);
  prop('bus-stop', -38, 9.05, FACE.N);
  prop('mailbox', -30.5, -1.0);
  prop('fire-hydrant', -9, -1.0);
  prop('trash-bin', 23, 0.9);
  prop('trash-bin', -41.5, 9.1);
  prop('stop-sign', 1.0, 11.2, FACE.S);
  prop('stop-sign', -1.2, -1.0, FACE.W);
  prop('crosswalk-sign', 11.2, 1.0, FACE.E);
  prop('crosswalk-sign', -1.2, 9.0, FACE.W);
  prop('street-name-sign', 11.2, 9.2);
  prop('stone-wall', -30.5, 12.6);
  prop('stone-wall', -28.5, 12.6);
  prop('stone-wall', -10.5, 12.6);
  prop('stone-wall', -8.5, 12.6);
  for (const x of [-47, -19, -4, 13, 27, 45, 57]) prop('tree-cypress', x, -1.2);

  // ---- things to play with ----
  prop('ball-soccer', 51.5, 27);
  prop('ball-basketball', -15, -28);
  prop('ball-beach', -38, -25);
  prop('trampoline', -46.5, -17.6);
  prop('pet-dog', -30.5, -3.6, FACE.S);

  // ---- vehicles ----
  prop('car-compact', -30, 6.6, FACE.E);
  prop('car-family', 19, 17.5, FACE.S, { body: '#3f6d8f' });
  prop('minibus', 27, 18.6, FACE.S);
  prop('tractor', 35.5, 19, FACE.S);
  prop('bicycle', -31.2, -2.8, FACE.E);
  prop('kids-bike', -45.6, -3.0, FACE.E);
  prop('kick-scooter', -28.6, -24.2, FACE.E);
  prop('bicycle', 26.6, -2.6, FACE.S, { frame: '#2f6f73' });

  // ---- the games district: streets and a venue for every neighborhood mini-game ----
  ensureDistrictRoads(p);
  for (const g of MINI_GAMES) if (g.venue) installVenue(p, g.id, g.venue.plot, g.venue.build);

  return p;
}
