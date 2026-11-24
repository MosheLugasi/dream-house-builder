// load the store first: a game module that imports it statically would otherwise start a circular import
import '../src/store/store';
import { describe, expect, it } from 'vitest';
import {
  buildCircuit,
  centreLine,
  countTurns,
  crossGate,
  findLoop,
  idealRaceTime,
  isStraight,
  loopTarget,
  normalisedTime,
  project,
  RACE_REF_TIME,
  roadNet,
  rubberBand,
  speedProfile,
  standings,
  startCellNear,
  type Cell,
} from '../src/game/minigames/race/circuit';
import { GAME } from '../src/game/minigames/race';
import { sampleProject } from '../src/model/neighborhood';
import { medalFor } from '../src/game/minigames/store';

const CAR = { vmax: 20, accel: 5.2, brake: 9, grip: 9.5 };
const BIKE = { vmax: 12.5, accel: 3.8, brake: 7, grip: 8 };

/** 4-neighbour adjacency of consecutive cells (closing the loop) */
function isClosedPath(cells: Cell[]): boolean {
  for (let k = 0; k < cells.length; k++) {
    const a = cells[k];
    const b = cells[(k + 1) % cells.length];
    if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) !== 1) return false;
  }
  return new Set(cells.map((c) => c.join(','))).size === cells.length;
}

describe('race circuit', () => {
  const p = sampleProject();
  const net = roadNet(p.site.roads);
  const sign = p.site.props.find((f) => f.catalogId === 'game-sign-race')!;

  it('starts on a straight street next to the race sign', () => {
    expect(sign).toBeTruthy();
    const start = startCellNear(net, p.site.roads, sign.x, sign.y)!;
    expect(start).toBeTruthy();
    expect(isStraight(net, start[0], start[1])).toBe(true);
    expect(Math.hypot((start[0] + 0.5) * 10 - sign.x, (start[1] + 0.5) * 10 - sign.y)).toBeLessThan(20);
  });

  for (const kind of ['car', 'bicycle'] as const) {
    it(`finds a long closed loop on the roads for a ${kind}`, () => {
      const start = startCellNear(net, p.site.roads, sign.x, sign.y)!;
      const t0 = performance.now();
      const loop = findLoop(net, start, loopTarget(kind))!;
      expect(performance.now() - t0).toBeLessThan(1500);
      expect(loop).toBeTruthy();
      expect(loop[0]).toEqual(start);
      expect(isClosedPath(loop)).toBe(true);
      for (const [i, j] of loop) expect(net.has(i, j)).toBe(true);
      const L = loop.length * 10;
      if (kind === 'car') {
        expect(L).toBeGreaterThanOrEqual(600);
        expect(L).toBeLessThanOrEqual(1200);
      } else {
        expect(L).toBeGreaterThanOrEqual(400);
        expect(L).toBeLessThanOrEqual(900);
      }
      expect(countTurns(loop)).toBeGreaterThanOrEqual(4);
    });
  }

  it('builds a smooth centre line with gates on straights', () => {
    const start = startCellNear(net, p.site.roads, sign.x, sign.y)!;
    const loop = findLoop(net, start, loopTarget('car'))!;
    const c = buildCircuit(net, loop);
    // samples are ~1 m apart all the way round
    for (let i = 0; i < c.xs.length; i++) {
      const j = (i + 1) % c.xs.length;
      const d = Math.hypot(c.xs[j] - c.xs[i], c.ys[j] - c.ys[i]);
      expect(d).toBeGreaterThan(0.9);
      expect(d).toBeLessThan(1.05);
    }
    // the line stays on the asphalt
    for (let i = 0; i < c.xs.length; i += 3) {
      const ci = Math.floor(c.xs[i] / 10);
      const cj = Math.floor(c.ys[i] / 10);
      expect(net.has(ci, cj)).toBe(true);
    }
    expect(c.gates.length).toBeGreaterThanOrEqual(4);
    expect(c.gates[0].s).toBe(0);
    for (let g = 1; g < c.gates.length; g++) expect(c.gates[g].s).toBeGreaterThan(c.gates[g - 1].s + 30);
  });

  it('keeps gates clear of lamp posts', () => {
    const start = startCellNear(net, p.site.roads, sign.x, sign.y)!;
    const loop = findLoop(net, start, loopTarget('car'))!;
    const lamps = p.site.props.filter((f) => f.catalogId === 'street-lamp');
    const c = buildCircuit(net, loop, { obstacles: lamps });
    for (const g of c.gates) {
      for (const l of lamps) {
        const rx = l.x - g.x;
        const ry = l.y - g.y;
        const along = rx * g.dx + ry * g.dy;
        const across = Math.abs(-rx * g.dy + ry * g.dx);
        expect(Math.abs(along) < 1.3 && across < g.half + 0.8).toBe(false);
      }
    }
  });

  it('uses the player\'s own arches as checkpoints', () => {
    const start = startCellNear(net, p.site.roads, sign.x, sign.y)!;
    const loop = findLoop(net, start, loopTarget('car'))!;
    const a = loop[Math.floor(loop.length / 3)];
    const b = loop[Math.floor((loop.length * 2) / 3)];
    const arches = [
      { id: 'a1', x: a[0] * 10 + 5, y: a[1] * 10 + 5 },
      { id: 'a2', x: b[0] * 10 + 5, y: b[1] * 10 + 5 },
    ];
    const c = buildCircuit(net, loop, { arches });
    expect(c.gates.map((g) => g.placed).filter(Boolean)).toEqual(['a1', 'a2']);
  });

  it('turns corners as quarter circles', () => {
    const square: Cell[] = [];
    for (let i = 0; i < 5; i++) square.push([i, 0]);
    for (let j = 1; j < 5; j++) square.push([4, j]);
    for (let i = 3; i >= 0; i--) square.push([i, 4]);
    for (let j = 3; j >= 1; j--) square.push([0, j]);
    // start on a straight (the first cell is never a corner)
    const loop = square.slice(2).concat(square.slice(0, 2));
    const line = centreLine(loop, 10, 1);
    const L = line.xs.length;
    // 4 × 40 m sides minus 8 × r plus 4 quarter circles of r = 6
    const expected = 160 - 8 * 6 + 2 * Math.PI * 6;
    expect(Math.abs(L - expected)).toBeLessThan(3);
    expect(line.k.filter((k) => k > 0).length).toBeGreaterThan(20);
  });

  it('brakes for corners and gives a sensible lap time', () => {
    const start = startCellNear(net, p.site.roads, sign.x, sign.y)!;
    const c = buildCircuit(net, findLoop(net, start, loopTarget('car'))!);
    const { v, lapTime } = speedProfile(c, CAR);
    const corner = c.k.findIndex((k) => k > 0);
    expect(v[corner]).toBeLessThan(9);
    expect(Math.max(...v)).toBeCloseTo(20, 0);
    // slower before the corner than on the straight before it
    expect(v[(corner - 3 + v.length) % v.length]).toBeLessThan(v[(corner - 40 + v.length) % v.length] + 1e-6);
    const race = idealRaceTime(lapTime, 3, CAR);
    expect(race).toBeGreaterThan(90);
    expect(race).toBeLessThan(240);
    const bike = buildCircuit(net, findLoop(net, start, loopTarget('bicycle'))!);
    const braced = idealRaceTime(speedProfile(bike, BIKE).lapTime, 3, BIKE);
    expect(braced).toBeGreaterThan(90);
    expect(braced).toBeLessThan(260);
  });

  it('detects gate crossings with direction and width', () => {
    const g = { s: 0, x: 0, y: 0, dx: 1, dy: 0, half: 4 };
    expect(crossGate(g, -0.5, 1, 0.5, 1)).toBe(1);
    expect(crossGate(g, 0.5, 1, -0.5, 1)).toBe(-1);
    expect(crossGate(g, -0.5, 9, 0.5, 9)).toBe(0);
    expect(crossGate(g, 0.2, 1, 0.8, 1)).toBe(0);
  });

  it('projects onto the line with a signed lateral offset', () => {
    const start = startCellNear(net, p.site.roads, sign.x, sign.y)!;
    const c = buildCircuit(net, findLoop(net, start, loopTarget('car'))!);
    const i = 10;
    const right = { x: c.xs[i] - c.ty[i] * 2, y: c.ys[i] + c.tx[i] * 2 };
    const pr = project(c, right.x, right.y);
    expect(Math.abs(pr.i - i)).toBeLessThanOrEqual(1);
    expect(pr.lateral).toBeCloseTo(2, 1);
    expect(project(c, right.x, right.y, i, 5).i).toBe(pr.i);
  });
});

describe('race rules', () => {
  it('orders finished racers by time, then by progress', () => {
    const order = standings([
      { progress: 500, finishedAt: null },
      { progress: 900, finishedAt: 120 },
      { progress: 600, finishedAt: null },
      { progress: 900, finishedAt: 110 },
    ]);
    expect(order).toEqual([3, 1, 2, 0]);
  });

  it('rubber-bands gently', () => {
    expect(rubberBand(0)).toBe(1);
    expect(rubberBand(200)).toBeLessThan(1);
    expect(rubberBand(1000)).toBeGreaterThanOrEqual(0.8);
    expect(rubberBand(-1000)).toBeLessThanOrEqual(1.08);
  });

  it('normalises times so that the medals fit every circuit and vehicle', () => {
    expect(normalisedTime(200, 200)).toBe(RACE_REF_TIME);
    // a car on a long loop and a scooter on a short one, both 20% slower than ideal → same score
    expect(normalisedTime(144, 120)).toBe(normalisedTime(216, 180));
    const m = GAME.medals;
    expect(m.lowerIsBetter).toBe(true);
    expect(m.unit).toBe('seconds');
    expect(medalFor(normalisedTime(105, 100), m)).toBe(3);
    expect(medalFor(normalisedTime(125, 100), m)).toBe(2);
    expect(medalFor(normalisedTime(160, 100), m)).toBe(1);
    expect(medalFor(normalisedTime(190, 100), m)).toBe(0);
  });

  it('has a venue with the start sign and the pit vehicles', () => {
    const p = sampleProject();
    const mine = p.site.props.filter((f) => f.id.startsWith('v-race-'));
    const ids = new Set(mine.map((f) => f.catalogId));
    for (const id of ['game-sign-race', 'race-grandstand', 'race-pit-garage', 'car-compact', 'bicycle', 'kick-scooter']) expect(ids.has(id)).toBe(true);
    for (const f of mine) {
      expect(f.x).toBeGreaterThanOrEqual(95);
      expect(f.x).toBeLessThanOrEqual(120);
      expect(f.y).toBeGreaterThanOrEqual(10);
      expect(f.y).toBeLessThanOrEqual(40);
    }
  });
});
