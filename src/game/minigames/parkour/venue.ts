import { FACE } from '../../../model/templates';
import type { VenueBuilder } from '../plots';

type Rect = [number, number, number, number];

/** Fill a plot rectangle with grass around some holes (areas must not overlap). */
function grassAround(v: VenueBuilder, x0: number, y0: number, x1: number, y1: number, holes: Rect[]): void {
  const xs = [...new Set([x0, x1, ...holes.flatMap((h) => [h[0], h[2]])])].sort((a, b) => a - b);
  const ys = [...new Set([y0, y1, ...holes.flatMap((h) => [h[1], h[3]])])].sort((a, b) => a - b);
  // grid cells outside every hole, merged along x
  for (let j = 0; j + 1 < ys.length; j++) {
    let start: number | null = null;
    for (let i = 0; i + 1 < xs.length; i++) {
      const cx = (xs[i] + xs[i + 1]) / 2;
      const cy = (ys[j] + ys[j + 1]) / 2;
      const inHole = holes.some((h) => cx > h[0] && cx < h[2] && cy > h[1] && cy < h[3]);
      if (!inHole && start === null) start = xs[i];
      if ((inHole || i + 2 === xs.length) && start !== null) {
        v.area(start, ys[j], inHole ? xs[i] : xs[i + 1], ys[j + 1], 'grass');
        start = null;
      }
    }
  }
}

/** a lane rope from (x0, y0) to (x1, y1) in pieces of at most 12 m (axis-aligned) */
function rope(v: VenueBuilder, x0: number, y0: number, x1: number, y1: number): void {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.max(1, Math.ceil(len / 12));
  const rot = Math.abs(x1 - x0) >= Math.abs(y1 - y0) ? 0 : Math.PI / 2;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    v.prop('pk-lane-rope', x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, rot, { size: { w: len / n, d: 0.12, h: 0.9 } });
  }
}

/**
 * The obstacle course (plot 'sw', 50 × 40 m, streets on every side). Plot-local meters: x east, y south.
 * Roped lanes make a snake: east along the north side, south down the east side, west along the south side
 * and north to the finish. Water fills the lane under jumps, the beam, the zip-line, the stepping stones and
 * the monkey bars – touch it and you are back at the last checkpoint.
 */
export function buildParkourVenue(v: VenueBuilder): void {
  const water: Rect[] = [
    [11.5, 5.6, 17.8, 8.4], // jumps over the pool
    [24, 5.6, 28, 8.4], // under the balance beam
    [31.4, 31, 41.1, 35], // under the zip-line
    [17, 31, 25.4, 35], // stepping stones
    [10.6, 31, 13.4, 35], // under the monkey bars
  ];
  const track: Rect[] = [
    [2.5, 5.6, 11.5, 8.4],
    [17.8, 5.6, 24, 8.4],
    [28, 5.6, 46.2, 8.4],
    [43.8, 8.4, 46.2, 31],
  ];
  grassAround(v, 0, 0, 50, 40, [...water, ...track]);
  for (const w of water) v.area(w[0], w[1], w[2], w[3], 'water');
  for (const t of track) v.area(t[0], t[1], t[2], t[3], 'pavers');

  v.sign(25, 1.4, FACE.N);

  // ---- lanes
  rope(v, 2.5, 5.6, 46.2, 5.6);
  rope(v, 2.5, 8.4, 43.8, 8.4);
  rope(v, 2.5, 5.6, 2.5, 8.4);
  rope(v, 43.8, 8.4, 43.8, 31);
  rope(v, 46.2, 5.6, 46.2, 35);
  rope(v, 6.2, 31, 43.8, 31);
  rope(v, 4.8, 35, 46.2, 35);
  rope(v, 6.2, 26, 6.2, 31);
  rope(v, 4.8, 26, 4.8, 35);

  // ---- north side, running east
  const E = Math.PI / 2; // local −z points east, the width runs north–south
  v.prop('pk-start-arch', 4.5, 7, E, { size: { w: 3, d: 0.3, h: 2.8 } });
  v.prop('pk-steps', 10, 7, E);
  v.prop('pk-platform', 13.1, 7, 0, { size: { w: 1.2, d: 1.2, h: 0.9 } });
  v.prop('pk-platform', 15.2, 7, 0, { size: { w: 1.2, d: 1.2, h: 0.6 }, colors: { body: '#d9a35b', top: '#2f9ad0' } });
  v.prop('pk-platform', 17.2, 7, 0, { size: { w: 1.2, d: 1.2, h: 0.3 }, colors: { body: '#d9a35b', top: '#3aa35b' } });
  v.prop('pk-checkpoint-1', 20.5, 5.95, 0);
  v.prop('pk-balance-beam', 26, 7, E, { size: { w: 0.6, d: 4.4, h: 0.5 } });
  v.prop('pk-hurdle', 31, 7, E, { size: { w: 2.4, d: 0.5, h: 0.4 } });
  v.prop('pk-hurdle', 33.8, 7, E, { size: { w: 2.4, d: 0.5, h: 0.45 } });
  v.prop('pk-checkpoint-2', 36.5, 5.95, 0);
  v.prop('pk-tyre-run', 40, 7, E, { size: { w: 2.6, d: 3.1, h: 0.16 } });

  // ---- east side, running south
  v.prop('pk-checkpoint-3', 45.85, 11, E);
  v.prop('pk-climb-tower', 45, 15.5, FACE.N);
  v.prop('pk-cargo-net', 45, 22.5, 0);
  v.prop('pk-checkpoint-4', 45.85, 26.5, E);

  // ---- south side, running west: zip-line, stepping stones, monkey bars
  v.prop('pk-zipline', 37.6, 33, E, { size: { w: 1.4, d: 14, h: 3.8 } });
  v.prop('pk-checkpoint-5', 28.5, 31.45, 0);
  for (const [x, y] of [
    [24.6, 33.2],
    [23.2, 32.6],
    [21.8, 33.4],
    [20.4, 32.7],
    [19, 33.3],
    [17.6, 32.8],
  ] as const) {
    v.prop('pk-stepping-stone', x, y, 0);
  }
  v.prop('pk-monkey-bars', 12, 33, E);

  // ---- west side, running north: tunnel and finish
  v.prop('pk-tunnel', 5.5, 29.5, 0);
  v.prop('pk-checkpoint-6', 6.9, 24, 0);
  v.prop('pk-finish-arch', 5.5, 19, 0, { size: { w: 3.4, d: 0.3, h: 2.8 } });

  // spectators, shade and light inside the loop
  v.prop('skate-bleachers', 25, 17, FACE.N, { colors: { seat: '#3aa35b', frame: '#9aa0a6' } });
  v.prop('skate-bleachers', 14, 17, FACE.N, { colors: { seat: '#f08a24', frame: '#9aa0a6' } });
  v.prop('street-bench', 34, 20, FACE.N);
  v.prop('drinking-fountain', 31, 20);
  v.prop('flagpole', 20, 24);
  for (const [x, y, id] of [
    [1.5, 1.5, 'tree'],
    [48.5, 1.5, 'tree'],
    [1.5, 38.5, 'tree'],
    [48.5, 38.5, 'olive-tree'],
    [30, 26, 'tree'],
    [19, 12.5, 'olive-tree'],
    [1.5, 14, 'tree-cypress'],
    [1.5, 18, 'tree-cypress'],
  ] as const) {
    v.prop(id, x, y);
  }
  for (const [x, y] of [
    [1.6, 4.6],
    [48, 4.6],
    [27, 37],
    [2.5, 36.5],
  ] as const) {
    v.prop('street-lamp', x, y, FACE.S);
  }
}
