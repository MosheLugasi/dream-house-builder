import { FACE } from '../../../model/templates';
import type { VenueBuilder } from '../plots';

/**
 * The stadium in plot e-north (50 × 50 m, streets on every side). The pitch runs north–south,
 * the penalty game uses the goal farthest from the start sign (the north one by default).
 */
export const PITCH_CENTER = { x: 25, y: 26 };

/** plan rotation whose front (+Z) looks from (x, y) towards (tx, ty) */
const towards = (x: number, y: number, tx: number, ty: number): number => Math.atan2(-(tx - x), ty - y);

export function buildStadium(v: VenueBuilder): void {
  const { x: cx, y: cy } = PITCH_CENTER;
  // ground: a big natural-grass pitch with paved concourses around it (no overlapping areas)
  v.area(9.5, 4.5, 40.5, 47.5, 'grass');
  v.area(0, 0, 9.5, 50, 'pavers');
  v.area(40.5, 0, 50, 50, 'pavers');
  v.area(9.5, 0, 40.5, 4.5, 'pavers');
  v.area(9.5, 47.5, 40.5, 50, 'pavers');
  v.prop('pitch-lines', cx, cy);
  // goals: the mouth of a stadium goal is 0.92 m in front of its center
  v.prop('stadium-goal', cx, cy - 20 - 0.92, FACE.S);
  v.prop('stadium-goal', cx, cy + 20 + 0.92, FACE.N);
  for (const [x, y] of [
    [cx - 13, cy - 20],
    [cx + 13, cy - 20],
    [cx - 13, cy + 20],
    [cx + 13, cy + 20],
  ]) {
    v.prop('corner-flag', x, y, FACE.S, { colors: { flag: '#f2c230' } });
  }
  // stands: two behind the north goal, two on each side
  v.prop('stadium-stand', 20.6, 2.0, FACE.S);
  v.prop('stadium-stand', 29.4, 2.0, FACE.S, { colors: { seats: '#f2c230', seats2: '#1f9d6a' } });
  for (const y of [15, 37]) {
    v.prop('stadium-stand', 6.6, y, FACE.E, { colors: { seats: '#2f7fd0', seats2: '#ffffff' } });
    v.prop('stadium-stand', 43.4, y, FACE.W);
  }
  // ad boards along both touchlines
  const ads = ['#1f6fd0', '#e0402f', '#f08a24', '#8a46d8', '#1f9d6a'];
  let i = 0;
  for (const y of [10.5, 22, 30, 41.5]) {
    v.prop('pitch-ad-board', 10.6, y, FACE.E, { colors: { bg: ads[i++ % ads.length] } });
    v.prop('pitch-ad-board', 39.4, y, FACE.W, { colors: { bg: ads[i++ % ads.length] } });
  }
  // dugouts (benches) at the halfway line, scoreboard and floodlights
  v.prop('street-bench', 41.6, 24.4, FACE.W);
  v.prop('street-bench', 41.6, 27.6, FACE.W);
  v.prop('stadium-scoreboard', 40.5, 2.2, towards(40.5, 2.2, cx, cy + 6));
  for (const [x, y] of [
    [2.4, 3],
    [47.6, 3],
    [2.4, 48],
    [47.6, 48],
  ]) {
    v.prop('stadium-floodlight', x, y, towards(x, y, cx, cy));
  }
  // greenery and street furniture
  for (const [x, y] of [
    [3, 26],
    [47, 26],
  ]) {
    v.prop('tree', x, y);
  }
  v.prop('tree-cypress', 12, 1.4);
  v.prop('tree-cypress', 38, 1.4);
  for (const x of [3.5, 46.5]) v.prop('bush', x, 30.5);
  v.prop('trash-bin', 8.6, 26.5);
  v.prop('trash-bin', 41.4, 21.2);
  v.prop('drinking-fountain', 8.6, 24.4);
  v.prop('ball-soccer', cx + 0.4, cy + 0.3);
  v.prop('kiosk', 46.4, 44.6, FACE.W, {});
  v.sign(33.5, 48.6, FACE.S);
}
