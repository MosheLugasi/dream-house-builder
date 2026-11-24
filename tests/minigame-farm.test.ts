import '../src/store/store'; // load the store first: it builds the starter project at import time (avoids an import cycle through the games)
import { describe, expect, it } from 'vitest';
import { getFurniture, itemSize } from '../src/catalog';
import { sampleProject } from '../src/model/neighborhood';
import { plotById } from '../src/game/minigames/plots';
import { SiteMap } from '../src/game/minigames/treasure/hunt';
import { plantSpots } from '../src/game/minigames/farm/plants';
import {
  CROPS,
  DAY_SECONDS,
  SPOIL_SECONDS,
  WET_SECONDS,
  canFill,
  crop,
  dayHour,
  emptyBed,
  harvest,
  itemsText,
  makeOrder,
  missing,
  orderValue,
  peck,
  plant,
  stageOf,
  stepBed,
  takeOrder,
  tipFor,
  water,
  type Basket,
  type ProductId,
} from '../src/game/minigames/farm/rules';
import { GAME } from '../src/game/minigames/farm';

function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

const grow = (secs: number, b = emptyBed(), keepWet = true) => {
  for (let t = 0; t < secs; t += 0.1) {
    if (keepWet && b.moisture < 0.3) water(b);
    stepBed(b, 0.1);
  }
  return b;
};

describe('farm beds', () => {
  it('a watered crop goes through every stage and ripens in its growth time', () => {
    for (const c of CROPS) {
      const b = emptyBed();
      expect(plant(b, c.id)).toBe(true);
      expect(stageOf(b)).toBe(0);
      const seen = new Set<number>();
      for (let t = 0; t < c.grow + 0.5; t += 0.1) {
        if (b.moisture < 0.3) water(b);
        stepBed(b, 0.1);
        seen.add(stageOf(b));
      }
      expect([...seen].sort()).toEqual([0, 1, 2, 3, 4]);
      expect(b.progress).toBe(1);
    }
  });

  it('dry beds do not grow, weeds slow them down', () => {
    const dry = emptyBed();
    plant(dry, 'tomato');
    grow(20, dry, false);
    expect(dry.progress).toBe(0);
    const wet = emptyBed();
    plant(wet, 'tomato');
    water(wet);
    grow(WET_SECONDS + 5, wet, false);
    expect(wet.moisture).toBe(0);
    expect(wet.progress).toBeCloseTo(WET_SECONDS / crop('tomato').grow, 1);
    const weedy = emptyBed();
    plant(weedy, 'tomato');
    weedy.weed = true;
    grow(10, weedy);
    const clean = emptyBed();
    plant(clean, 'tomato');
    grow(10, clean);
    expect(weedy.progress).toBeLessThan(clean.progress * 0.6);
  });

  it('harvest fills the basket; left too long, crops spoil', () => {
    const b = emptyBed();
    plant(b, 'strawberry');
    expect(harvest(b)).toBeNull();
    grow(crop('strawberry').grow + 1, b);
    expect(harvest(b)).toEqual({ crop: 'strawberry', count: crop('strawberry').yield });
    expect(b.crop).toBeNull();
    plant(b, 'lettuce');
    grow(crop('lettuce').grow + SPOIL_SECONDS + 1, b);
    expect(b.spoiled).toBe(true);
    expect(harvest(b)).toEqual({ crop: 'lettuce', count: 0 });
    expect(b.crop).toBeNull();
  });

  it('a crow sets a plant back one stage', () => {
    const b = emptyBed();
    plant(b, 'carrot');
    grow(crop('carrot').grow * 0.8, b);
    const s = stageOf(b);
    peck(b);
    expect(stageOf(b)).toBe(s - 1);
  });
});

describe('farm market', () => {
  it('orders ask only for what the farm can make', () => {
    const r = seeded(5);
    const avail: ProductId[] = ['tomato', 'tomato', 'strawberry', 'egg'];
    for (let i = 0; i < 200; i++) {
      const o = makeOrder(r, avail, i / 200);
      const keys = Object.keys(o.items) as ProductId[];
      expect(keys.length).toBeGreaterThan(0);
      for (const k of keys) {
        expect(avail).toContain(k);
        expect(o.items[k]).toBeGreaterThanOrEqual(1);
      }
      expect(o.patience).toBeGreaterThan(40);
    }
  });

  it('fills an order from the basket, with a tip for speed', () => {
    const basket: Basket = { tomato: 3, strawberry: 1 };
    const order = { items: { tomato: 2, strawberry: 1 } as Basket, patience: 60 };
    expect(itemsText(order.items)).toBe('2 עגבניות ותות');
    expect(itemsText({ carrot: 1, lettuce: 2 })).toBe('גזר ו־2 חסות');
    expect(canFill(basket, order)).toBe(true);
    expect(missing({ tomato: 1 }, order)).toEqual({ tomato: 1, strawberry: 1 });
    takeOrder(basket, order);
    expect(basket).toEqual({ tomato: 1, strawberry: 0 });
    const v = orderValue(order);
    expect(v).toBe(2 * 14 + 12);
    expect(tipFor(v, 1)).toBe(Math.round(v / 2));
    expect(tipFor(v, 0)).toBe(0);
  });

  it('the day runs from morning to sunset', () => {
    expect(dayHour(0)).toBe(7);
    expect(dayHour(DAY_SECONDS)).toBeCloseTo(18.5);
    expect(GAME.medals.bronze).toBeLessThan(GAME.medals.silver);
    expect(GAME.medals.silver).toBeLessThan(GAME.medals.gold);
  });
});

describe('farm venue', () => {
  const p = sampleProject();
  const plot = plotById('west');
  const inPlot = (x: number, y: number) => x >= plot.x0 && x <= plot.x0 + plot.w && y >= plot.y0 && y <= plot.y0 + plot.h;
  const mine = p.site.props.filter((f) => f.id.startsWith('v-farm-') || f.id.startsWith('v-treasure-'));

  it('stands on its plot with beds, water, a market stand and a scarecrow', () => {
    for (const f of mine) expect(inPlot(f.x, f.y), f.catalogId).toBe(true);
    const ids = mine.map((f) => f.catalogId);
    expect(ids.filter((i) => i === 'farm-bed').length).toBe(8);
    for (const id of ['farm-tap', 'farm-well', 'farm-market-stand', 'farm-scarecrow', 'farm-coop', 'farm-barn', 'game-sign-farm', 'game-sign-treasure']) expect(ids, id).toContain(id);
  });

  it('nothing in the venues overlaps', () => {
    const solid = mine
      .map((f) => ({ f, def: getFurniture(f.catalogId)! }))
      .filter(({ def }) => !def.walkable && !def.vehicle)
      .map(({ f, def }) => {
        const s = itemSize(def, f);
        return { id: `${f.catalogId}@${f.x.toFixed(1)},${f.y.toFixed(1)}`, x: f.x, y: f.y, hw: s.w / 2, hd: s.d / 2, r: f.rotation, e: f.elevation };
      });
    // separating axis test for two rotated rectangles
    const axes = (a: (typeof solid)[number]) => [
      [Math.cos(a.r), Math.sin(a.r)],
      [-Math.sin(a.r), Math.cos(a.r)],
    ];
    const proj = (a: (typeof solid)[number], ax: number[]) => {
      const c = a.x * ax[0] + a.y * ax[1];
      const [u, v] = axes(a);
      const r = a.hw * Math.abs(u[0] * ax[0] + u[1] * ax[1]) + a.hd * Math.abs(v[0] * ax[0] + v[1] * ax[1]);
      return [c - r, c + r];
    };
    const overlaps: string[] = [];
    for (let i = 0; i < solid.length; i++) {
      for (let j = i + 1; j < solid.length; j++) {
        const a = solid[i];
        const b = solid[j];
        if (a.e !== b.e) continue; // stacked hay bales
        const sep = [...axes(a), ...axes(b)].some((ax) => {
          const [a0, a1] = proj(a, ax);
          const [b0, b1] = proj(b, ax);
          return a1 <= b0 + 0.02 || b1 <= a0 + 0.02;
        });
        if (!sep) overlaps.push(`${a.id} × ${b.id}`);
      }
    }
    expect(overlaps).toEqual([]);
  });

  it('every bed, the tap and the stand can be reached on foot from the farm sign', () => {
    const sign = p.site.props.find((f) => f.catalogId === 'game-sign-farm')!;
    const map = new SiteMap(p);
    map.flood({ x: sign.x - Math.sin(sign.rotation) * 2.2, y: sign.y + Math.cos(sign.rotation) * 2.2 });
    for (const f of mine.filter((m) => ['farm-bed', 'farm-tap', 'farm-well', 'farm-market-stand', 'farm-coop', 'tree-fruit'].includes(m.catalogId))) {
      const def = getFurniture(f.catalogId)!;
      const s = itemSize(def, f);
      // some side of it is reachable
      const sides = [
        [0, s.d / 2 + 0.6],
        [0, -s.d / 2 - 0.6],
        [s.w / 2 + 0.6, 0],
        [-s.w / 2 - 0.6, 0],
      ].map(([lx, ly]) => ({ x: f.x + lx * Math.cos(f.rotation) - ly * Math.sin(f.rotation), y: f.y + lx * Math.sin(f.rotation) + ly * Math.cos(f.rotation) }));
      expect(
        sides.some((q) => map.walkDistance(q) >= 0),
        `${f.catalogId} at ${f.x},${f.y}`,
      ).toBe(true);
    }
  });

  it('plants fit on their bed', () => {
    for (const c of CROPS) {
      const spots = plantSpots(c.id, 2.4, 1.2);
      expect(spots.length).toBeGreaterThanOrEqual(4);
      for (const [x, z] of spots) {
        expect(Math.abs(x)).toBeLessThan(1.2 - 0.05);
        expect(Math.abs(z)).toBeLessThan(0.6 - 0.05);
      }
    }
  });
});
