import { describe, expect, it, vi } from 'vitest';
import { parseProject } from '../src/io/storage';
import { emptyProject } from '../src/model/defaults';
import { buildGraph } from '../src/model/graph';
import { roofPlan } from '../src/model/roofPlan';
import { stairBarriers, stairFraction, U_LANDING } from '../src/model/stairs';
import { TEMPLATES } from '../src/model/templates';
import { levelElevation, SLAB, toLocal, toSite, type Level, type Wall } from '../src/model/types';
import { subtractRect } from '../src/render3d/buildArchitecture';
import { groundHeight, roadPieces, SIDEWALK_HEIGHT } from '../src/render3d/buildSite';

let n = 0;
const w = (ax: number, ay: number, bx: number, by: number): Wall => ({ id: `w${n++}`, a: { x: ax, y: ay }, b: { x: bx, y: by }, thickness: 0.2 });
const levelOf = (walls: Wall[]): Level => ({ id: 'l', name: 'l', height: 2.7, walls, openings: [], furniture: [], roomStyles: [] });
const loop = (pts: [number, number][]) => pts.map((p, i) => w(p[0], p[1], pts[(i + 1) % pts.length][0], pts[(i + 1) % pts.length][1]));
const area = (poly: { x: number; y: number }[]) => Math.abs(poly.reduce((s, p, i) => s + p.x * poly[(i + 1) % poly.length].y - poly[(i + 1) % poly.length].x * p.y, 0)) / 2;

describe('roof plan', () => {
  it('covers a rectangle with one rectangle reaching the outer wall faces', () => {
    const plan = roofPlan(levelOf(loop([[0, 0], [8, 0], [8, 6], [0, 6]])))!;
    expect(plan.rects).toHaveLength(1);
    expect(plan.rects[0]).toMatchObject({ x0: -0.1, y0: -0.1, x1: 8.1, y1: 6.1 });
  });

  it('covers an L shape with two overlapping wings', () => {
    const plan = roofPlan(levelOf(loop([[0, 0], [10, 0], [10, 4], [4, 4], [4, 9], [0, 9]])))!;
    expect(plan.rects).toHaveLength(2);
  });

  it('follows a rotated house', () => {
    const rot = (x: number, y: number): [number, number] => [x * Math.cos(0.5) - y * Math.sin(0.5), x * Math.sin(0.5) + y * Math.cos(0.5)];
    const plan = roofPlan(levelOf(loop([rot(0, 0), rot(8, 0), rot(8, 6), rot(0, 6)])))!;
    expect(plan.rects).toHaveLength(1);
    expect(plan.angle).toBeCloseTo(0.5, 3);
  });

  it('gives up on diagonal walls and on open plans', () => {
    expect(roofPlan(levelOf(loop([[0, 0], [8, 0], [5, 6], [0, 6]])))).toBeNull();
    expect(roofPlan(levelOf([w(0, 0, 5, 0)]))).toBeNull();
  });
});

describe('stairs', () => {
  it('straight flight rises linearly from the entry to the exit', () => {
    expect(stairFraction('straight', 1, 4, 0, -2)).toBeCloseTo(0);
    expect(stairFraction('straight', 1, 4, 0, 0)).toBeCloseTo(0.5);
    expect(stairFraction('straight', 1, 4, 0, 2)).toBeCloseTo(1);
    expect(stairFraction('straight', 1, 4, 0.6, 0)).toBeNull();
  });

  it('U stair: up the left flight, across the landing, back on the right flight', () => {
    const d = 3.3;
    expect(stairFraction('u', 2.1, d, -0.5, -d / 2)).toBeCloseTo(0);
    expect(stairFraction('u', 2.1, d, -0.5, d / 2 - U_LANDING - 0.001)).toBeCloseTo(0.5, 2);
    expect(stairFraction('u', 2.1, d, 0, d / 2 - 0.2)).toBeCloseTo(0.5);
    expect(stairFraction('u', 2.1, d, 0.5, -d / 2)).toBeCloseTo(1);
    const bars = stairBarriers('u', 2.1, d);
    // entry and exit are the two halves of the same end
    expect(bars.entry[0].y).toBe(-d / 2);
    expect(bars.exit[1].y).toBe(-d / 2);
    expect(bars.entry[1].x).toBe(bars.exit[0].x);
  });

  it('cuts a stair opening out of a floor triangle', () => {
    const tri = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }];
    const pieces = subtractRect(tri, { x: 2, y: 2, hw: 1, hd: 1, rotation: 0.3 });
    expect(pieces.reduce((s, p) => s + area(p), 0)).toBeCloseTo(50 - 4, 6);
    // a hole outside leaves the polygon alone
    expect(subtractRect(tri, { x: 20, y: 20, hw: 1, hd: 1, rotation: 0 }).reduce((s, p) => s + area(p), 0)).toBeCloseTo(50, 6);
  });
});

describe('buildings on the site', () => {
  it('stacks levels with a slab in between', () => {
    const b = TEMPLATES.find((t) => t.id === 'house-two-storey')!.build();
    expect(b.levels).toHaveLength(2);
    expect(levelElevation(b, 1)).toBeCloseTo(b.levels[0].height + SLAB);
  });

  it('converts between building and site coordinates', () => {
    const b = { x: 30, y: -12, rotation: 1.1 };
    const p = toLocal(b, toSite(b, { x: 3, y: 4 }));
    expect(p.x).toBeCloseTo(3);
    expect(p.y).toBeCloseTo(4);
  });

  it('every template is a valid building', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const t of TEMPLATES) {
      const b = t.build();
      for (const lvl of b.levels) {
        const graph = buildGraph(lvl.walls);
        for (const o of lvl.openings) {
          const wall = lvl.walls.find((x) => x.id === o.wallId)!;
          const L = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y);
          expect(o.offset - o.width / 2, `${t.id}: ${o.style}`).toBeGreaterThan(0);
          expect(o.offset + o.width / 2, `${t.id}: ${o.style}`).toBeLessThan(L);
        }
        // every named room exists
        for (const s of lvl.roomStyles) expect(graph.rooms.some((r) => r.polygon.length > 2 && inside(s.point, r.polygon)), `${t.id}: ${s.name}`).toBe(true);
      }
    }
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

function inside(p: { x: number; y: number }, poly: { x: number; y: number }[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    if (poly[i].y > p.y !== poly[j].y > p.y && p.x < ((poly[j].x - poly[i].x) * (p.y - poly[i].y)) / (poly[j].y - poly[i].y) + poly[i].x) c = !c;
  }
  return c;
}

describe('roads', () => {
  const set = new Set(['0,0', '1,0', '0,1']);
  it('raises sidewalks and keeps the carriageway low', () => {
    expect(groundHeight(set, 5, 5)).toBeLessThan(0.05); // middle of the junction cell
    expect(groundHeight(set, 9.5, 5)).toBeLessThan(0.05); // arm towards the neighbour
    expect(groundHeight(set, 0.5, 0.5)).toBe(SIDEWALK_HEIGHT); // corner
    expect(groundHeight(set, 0.5, 5)).toBe(SIDEWALK_HEIGHT); // closed side
    expect(groundHeight(set, 50, 50)).toBe(0); // grass
  });

  it('builds a corner cell from asphalt arms and sidewalk pieces', () => {
    const p = roadPieces(set, 0, 0);
    expect(p.asphalt).toHaveLength(3); // center + two arms
    expect(p.sidewalk).toHaveLength(6); // 4 corners + two closed sides
  });
});

describe('file migration', () => {
  it('upgrades a version 1 file', () => {
    const v2 = emptyProject();
    const v1 = JSON.parse(JSON.stringify(v2));
    v1.version = 1;
    v1.site = { ground: 'grass', size: 60 };
    delete v1.buildings[0].x;
    delete v1.buildings[0].y;
    delete v1.buildings[0].rotation;
    v1.buildings[0].roof = { type: 'flat', finish: 'roof-gravel' };
    const p = parseProject(JSON.stringify(v1));
    expect(p.version).toBe(2);
    expect(p.site.roads).toEqual([]);
    expect(p.site.props).toEqual([]);
    expect(p.buildings[0]).toMatchObject({ x: 0, y: 0, rotation: 0 });
    expect(p.buildings[0].roof.pitch).toBe(30);
  });
});
