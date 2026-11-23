import { pointInPolygon, rotate } from './geom';
import { getGraph } from './graph';
import type { Level } from './types';

/** An axis-aligned rectangle in the roof frame (the building plan rotated by -angle). */
export interface RoofRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface RoofPlan {
  /** rotation of the roof frame relative to the plan */
  angle: number;
  /** maximal rectangles covering the footprint, measured to the outer wall faces */
  rects: RoofRect[];
}

const TOL = 0.03;

/**
 * Decomposes the footprint of a level (the union of its rooms) into overlapping maximal rectangles.
 * A pitched roof is then built on every rectangle; where wings overlap the roofs intersect like a
 * real cross-gabled roof. Returns null when the footprint is not rectilinear (e.g. diagonal walls).
 */
const cache = new WeakMap<object, RoofPlan | null>();

export function roofPlan(level: Level): RoofPlan | null {
  if (cache.has(level.walls)) return cache.get(level.walls)!;
  const plan = computeRoofPlan(level);
  cache.set(level.walls, plan);
  return plan;
}

function computeRoofPlan(level: Level): RoofPlan | null {
  const graph = getGraph(level.walls);
  if (!graph.rooms.length) return null;

  // frame: direction of the longest exterior edge
  let angle = 0;
  let longest = 0;
  let margin = 0.1;
  for (const e of graph.edges) {
    const exterior = e.posRoom < 0 !== e.negRoom < 0;
    if (!exterior) continue;
    margin = Math.max(margin, e.thickness / 2);
    if (e.length > longest) {
      longest = e.length;
      angle = Math.atan2(e.dir.y, e.dir.x);
    }
  }
  if (!longest) return null;
  angle = ((angle % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2);
  if (angle > Math.PI / 4) angle -= Math.PI / 2;

  const polys = graph.rooms.map((r) => r.polygon.map((p) => rotate(p, -angle)));
  const xs: number[] = [];
  const ys: number[] = [];
  for (const poly of polys) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      if (Math.abs(p.x - q.x) > TOL && Math.abs(p.y - q.y) > TOL) return null; // diagonal edge
      xs.push(p.x);
      ys.push(p.y);
    }
  }
  const uniq = (v: number[]) => {
    const s = v.slice().sort((a, b) => a - b);
    const out: number[] = [];
    for (const x of s) if (!out.length || x - out[out.length - 1] > TOL) out.push(x);
    return out;
  };
  const gx = uniq(xs);
  const gy = uniq(ys);
  const nx = gx.length - 1;
  const ny = gy.length - 1;
  if (nx < 1 || ny < 1 || nx * ny > 900) return null;

  const inside: boolean[][] = [];
  for (let i = 0; i < nx; i++) {
    inside.push([]);
    for (let j = 0; j < ny; j++) {
      const c = { x: (gx[i] + gx[i + 1]) / 2, y: (gy[j] + gy[j + 1]) / 2 };
      inside[i].push(polys.some((poly) => pointInPolygon(c, poly)));
    }
  }
  // prefix sums for O(1) "is this block fully inside"
  const sum: number[][] = Array.from({ length: nx + 1 }, () => new Array<number>(ny + 1).fill(0));
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < ny; j++) sum[i + 1][j + 1] = sum[i][j + 1] + sum[i + 1][j] - sum[i][j] + (inside[i][j] ? 1 : 0);
  const full = (i0: number, i1: number, j0: number, j1: number) =>
    i0 >= 0 && j0 >= 0 && i1 <= nx && j1 <= ny && sum[i1][j1] - sum[i0][j1] - sum[i1][j0] + sum[i0][j0] === (i1 - i0) * (j1 - j0);

  const rects: RoofRect[] = [];
  for (let i0 = 0; i0 < nx; i0++)
    for (let i1 = i0 + 1; i1 <= nx; i1++)
      for (let j0 = 0; j0 < ny; j0++)
        for (let j1 = j0 + 1; j1 <= ny; j1++) {
          if (!full(i0, i1, j0, j1)) continue;
          const maximal = !full(i0 - 1, i1, j0, j1) && !full(i0, i1 + 1, j0, j1) && !full(i0, i1, j0 - 1, j1) && !full(i0, i1, j0, j1 + 1);
          if (maximal) rects.push({ x0: gx[i0] - margin, y0: gy[j0] - margin, x1: gx[i1] + margin, y1: gy[j1] + margin });
        }
  rects.sort((a, b) => (b.x1 - b.x0) * (b.y1 - b.y0) - (a.x1 - a.x0) * (a.y1 - a.y0));
  return { angle, rects: rects.slice(0, 12) };
}
