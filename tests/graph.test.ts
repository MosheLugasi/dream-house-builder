import { describe, expect, it } from 'vitest';
import { buildGraph, roomAt, uncoveredParts } from '../src/model/graph';
import type { Wall } from '../src/model/types';

let n = 0;
const w = (ax: number, ay: number, bx: number, by: number, thickness = 0.2): Wall => ({
  id: `w${n++}`,
  a: { x: ax, y: ay },
  b: { x: bx, y: by },
  thickness,
});
const rect = (x0: number, y0: number, x1: number, y1: number) => [
  w(x0, y0, x1, y0),
  w(x1, y0, x1, y1),
  w(x1, y1, x0, y1),
  w(x0, y1, x0, y0),
];

describe('graph', () => {
  it('finds a single rectangular room', () => {
    const g = buildGraph(rect(0, 0, 4, 3));
    expect(g.rooms).toHaveLength(1);
    expect(g.edges).toHaveLength(4);
    // net area = 12 - perimeter*t/2 = 12 - 14*0.1
    expect(g.rooms[0].area).toBeCloseTo(12 - 1.4, 5);
    // every edge has exactly one side facing the room
    for (const e of g.edges) expect([e.posRoom, e.negRoom].filter((r) => r === 0)).toHaveLength(1);
  });

  it('miters L corners', () => {
    const g = buildGraph(rect(0, 0, 4, 3));
    for (const e of g.edges) {
      // footprint is longer on the outside than on the inside by one thickness on each end
      const outer = Math.max(
        Math.hypot(e.bPos.x - e.aPos.x, e.bPos.y - e.aPos.y),
        Math.hypot(e.bNeg.x - e.aNeg.x, e.bNeg.y - e.aNeg.y),
      );
      expect(outer).toBeCloseTo(e.length + 0.2, 5);
    }
  });

  it('splits at T junctions into two rooms', () => {
    const g = buildGraph([...rect(0, 0, 6, 4), w(3, 0, 3, 4)]);
    expect(g.rooms).toHaveLength(2);
    expect(g.edges).toHaveLength(7);
    expect(roomAt(g, { x: 1, y: 1 })!.index).not.toBe(roomAt(g, { x: 5, y: 1 })!.index);
    expect(roomAt(g, { x: 10, y: 1 })).toBeUndefined();
  });

  it('handles crossing walls', () => {
    const g = buildGraph([...rect(0, 0, 6, 4), w(3, -1, 3, 5), w(-1, 2, 7, 2)]);
    expect(g.rooms).toHaveLength(4);
  });

  it('dedupes overlapping collinear walls (two adjacent rectangles)', () => {
    const g = buildGraph([...rect(0, 0, 3, 3), ...rect(3, 0, 6, 3)]);
    expect(g.rooms).toHaveLength(2);
    expect(g.edges).toHaveLength(7);
  });

  it('ignores dangling walls when building room polygons', () => {
    const g = buildGraph([...rect(0, 0, 6, 4), w(3, 0, 3, 2)]);
    expect(g.rooms).toHaveLength(1);
    expect(g.rooms[0].polygon).toHaveLength(5); // 4 corners + the junction node on the top wall
  });

  it('treats an island inside a room as a hole', () => {
    const g = buildGraph([...rect(0, 0, 10, 10), ...rect(4, 4, 6, 6)]);
    expect(g.rooms).toHaveLength(2);
    const outer = g.rooms.find((r) => r.holes.length === 1)!;
    expect(outer).toBeDefined();
    expect(roomAt(g, { x: 5, y: 5 })!.index).not.toBe(outer.index);
    expect(roomAt(g, { x: 1, y: 1 })!.index).toBe(outer.index);
  });

  it('computes uncovered parts of a new wall', () => {
    const walls = rect(0, 0, 3, 3);
    const parts = uncoveredParts({ x: 3, y: -1 }, { x: 3, y: 5 }, walls);
    expect(parts).toHaveLength(2);
    expect(parts[0][1].y).toBeCloseTo(0);
    expect(parts[1][0].y).toBeCloseTo(3);
    expect(uncoveredParts({ x: 0, y: 0 }, { x: 3, y: 0 }, walls)).toHaveLength(0);
  });
});
