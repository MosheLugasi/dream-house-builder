import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import { getFurniture, itemSize } from '../src/catalog';
import { plotById } from '../src/game/minigames/plots';
import { GhostRecorder, buildCourse, courseKey, ghostAt, loadGhost, passed, saveGhost, splitDelta, type GateProp } from '../src/game/minigames/parkour/course';
import { siteObstacleSurfaces } from '../src/game/minigames/skatepark/surfaces';
import { sampleProject } from '../src/model/neighborhood';
import { WalkController, emptyWorld } from '../src/render3d/WalkController';

const gp = (id: string, catalogId: string, x: number, y: number, rotation = 0, w?: number): GateProp => ({ id, catalogId, x, y, rotation, w });

describe('obstacle course order', () => {
  it('orders flags by number, nearest first for duplicates, and ends at the finish arch', () => {
    const gates = buildCourse(
      [gp('f', 'pk-finish-arch', 0, 30, 0, 3), gp('c3', 'pk-checkpoint-3', 10, 20), gp('s', 'pk-start-arch', 0, 0, 0, 3), gp('c1b', 'pk-checkpoint-1', 20, 0), gp('c1a', 'pk-checkpoint-1', 5, 0), gp('x', 'pk-platform', 1, 1)],
      { x: 0, y: 0 },
    );
    expect(gates.map((g) => g.id)).toEqual(['s', 'c1a', 'c1b', 'c3', 'f']);
    expect(gates[0].kind).toBe('start');
    expect(gates[gates.length - 1].kind).toBe('finish');
  });

  it('without arches: starts at the fallback and the last flag is the finish', () => {
    const gates = buildCourse([gp('a', 'pk-checkpoint-2', 5, 0), gp('b', 'pk-checkpoint-5', 9, 0)], { x: -3, y: 1 });
    expect(gates.map((g) => g.kind)).toEqual(['start', 'checkpoint', 'finish']);
    expect(gates[0].x).toBe(-3);
  });

  it('passes arches between the posts only, flags nearby', () => {
    const [start, flag] = buildCourse([gp('s', 'pk-start-arch', 0, 0, 0, 3), gp('c', 'pk-checkpoint-1', 10, 0)], { x: 0, y: 0 });
    expect(passed(start, { x: 0.5, y: 0.2 })).toBe(true);
    expect(passed(start, { x: 2.5, y: 0 })).toBe(false);
    expect(passed(start, { x: 0, y: 1.5 })).toBe(false);
    expect(passed(flag, { x: 11, y: 1 })).toBe(true);
    expect(passed(flag, { x: 13, y: 0 })).toBe(false);
  });

  it('formats split deltas', () => {
    expect(splitDelta(10, 11.25)).toBe('−1.3');
    expect(splitDelta(12, 11)).toBe('+1.0');
    expect(splitDelta(12, undefined)).toBeNull();
  });
});

describe('ghost', () => {
  beforeEach(() => {
    const mem = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
    };
  });

  it('records every 0.1 s and interpolates', () => {
    const r = new GhostRecorder();
    for (let i = 0; i <= 30; i++) r.add(1 / 30, i / 30, 0, 0, 0);
    expect(r.samples.length / 4).toBeGreaterThanOrEqual(10);
    const p = ghostAt({ key: 'k', time: 1, splits: [], samples: r.samples }, 0.55)!;
    expect(p.x).toBeCloseTo(0.55, 1);
    expect(ghostAt({ key: 'k', time: 1, splits: [], samples: r.samples }, 5)).toBeNull();
  });

  it('keeps only the best run per course', () => {
    expect(saveGhost({ key: 'a', time: 60, splits: [], samples: [0, 0, 0, 0, 1, 0, 1, 0] })).toBe(true);
    expect(saveGhost({ key: 'a', time: 70, splits: [], samples: [] })).toBe(false);
    expect(saveGhost({ key: 'a', time: 55, splits: [1], samples: [] })).toBe(true);
    expect(loadGhost('a')!.time).toBe(55);
    expect(loadGhost('b')).toBeNull();
  });
});

describe('the default course', () => {
  const p = sampleProject();
  const plot = plotById('sw');
  const inPlot = (x: number, y: number) => x >= plot.x0 && x <= plot.x0 + plot.w && y >= plot.y0 && y <= plot.y0 + plot.h;
  const props = p.site.props.filter((f) => inPlot(f.x, f.y));

  it('is built from existing items with a start, six flags and a finish', () => {
    for (const f of props) expect(getFurniture(f.catalogId), f.catalogId).toBeTruthy();
    const gates = buildCourse(
      props.map((f) => gp(f.id, f.catalogId, f.x, f.y, f.rotation, itemSize(getFurniture(f.catalogId)!, f).w)),
      { x: 0, y: 0 },
    );
    expect(gates.map((g) => g.kind)).toEqual(['start', 'checkpoint', 'checkpoint', 'checkpoint', 'checkpoint', 'checkpoint', 'checkpoint', 'finish']);
    expect(courseKey(gates)).toContain('s0@');
  });

  it('a runner can step up the jump steps and is stopped by the climbing wall', () => {
    const world = emptyWorld();
    world.surfaces = siteObstacleSurfaces(p.site.props, () => 0);
    world.surfaceOwners = new Set(world.surfaces.map((s) => s.id!));
    const walk = new WalkController(new THREE.PerspectiveCamera(), { addEventListener() {}, removeEventListener() {}, setPointerCapture() {} } as unknown as HTMLElement);
    walk.world = world;
    // in front of the steps (plot 6.5, 7), running east: camera yaw −π/2 looks east
    walk.teleport({ x: plot.x0 + 7, y: plot.y0 + 7 }, -Math.PI / 2);
    walk.setVirtualKey('KeyW', true);
    let top = 0;
    for (let i = 0; i < 90; i++) {
      walk.update(1 / 30);
      top = Math.max(top, walk.y);
    }
    expect(top).toBeGreaterThan(0.85);
    // the climbing tower's wall (plot 45, 14.3, facing north) stops a runner going south
    walk.teleport({ x: plot.x0 + 45, y: plot.y0 + 12 }, Math.PI);
    for (let i = 0; i < 90; i++) walk.update(1 / 30);
    expect(walk.pos.y).toBeLessThan(plot.y0 + 14.3);
    expect(walk.y).toBeLessThan(0.1);
  });
});
