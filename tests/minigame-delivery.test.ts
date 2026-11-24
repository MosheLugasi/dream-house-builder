// load the store first: a game module that imports it statically would otherwise start a circular import
import '../src/store/store';
import { describe, expect, it } from 'vitest';
import {
  addressOf,
  cool,
  customersOf,
  deliveryPoints,
  entranceOf,
  HEAT_SECONDS,
  isCrash,
  nextStreak,
  pickCustomer,
  RUSH_HEAT_SECONDS,
} from '../src/game/minigames/delivery/logic';
import { GAME } from '../src/game/minigames/delivery';
import { getFurniture } from '../src/catalog';
import { medalFor } from '../src/game/minigames/store';
import { sampleProject } from '../src/model/neighborhood';
import { buildTemplate } from '../src/model/templates';
import { ROAD_CELL } from '../src/model/types';

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('delivery: houses and addresses', () => {
  it('finds the front door of a building, pointing outside', () => {
    const b = buildTemplate('house-small')!;
    b.x = 10;
    b.y = 20;
    b.rotation = Math.PI;
    const e = entranceOf(b)!;
    expect(e).toBeTruthy();
    // the step is outside, in front of the door
    expect(Math.hypot(e.step.x - e.door.x, e.step.y - e.door.y)).toBeCloseTo(0.75, 2);
    expect(Math.hypot(e.out.x, e.out.y)).toBeCloseTo(1, 5);
    // the door lies on the building's outline (within its footprint ± a wall)
    const xs = b.levels[0].walls.flatMap((w) => [w.a.x, w.b.x]);
    const ys = b.levels[0].walls.flatMap((w) => [w.a.y, w.b.y]);
    const local = { x: -(e.door.x - b.x), y: -(e.door.y - b.y) }; // rotation π
    expect(local.x).toBeGreaterThanOrEqual(Math.min(...xs) - 0.3);
    expect(local.x).toBeLessThanOrEqual(Math.max(...xs) + 0.3);
    expect(local.y).toBeGreaterThanOrEqual(Math.min(...ys) - 0.3);
    expect(local.y).toBeLessThanOrEqual(Math.max(...ys) + 0.3);
  });

  it('every building of the starter neighborhood can order, with a street address', () => {
    const p = sampleProject();
    const shop = p.buildings.find((b) => b.id.startsWith('v-delivery-'))!;
    expect(shop.name).toBe('פיצה שמש');
    const list = customersOf(p.buildings, p.site.roads, (b) => b === shop);
    expect(list.length).toBeGreaterThanOrEqual(6);
    for (const c of list) {
      expect(c.address).toMatch(/^(רחוב|שדרות) .+ \d+$/);
      // the door step is reachable: within 25 m of a road
      const near = p.site.roads.some(([i, j]) => Math.hypot((i + 0.5) * ROAD_CELL - c.entrance.step.x, (j + 0.5) * ROAD_CELL - c.entrance.step.y) < 25);
      expect(near).toBe(true);
    }
    expect(list.some((c) => c.name === 'הבית של סבתא')).toBe(true);
  });

  it('gives different houses different addresses', () => {
    const roads: [number, number][] = [];
    for (let i = 0; i < 10; i++) roads.push([i, 0]);
    const a = addressOf({ x: 12, y: 14 }, roads);
    const b = addressOf({ x: 60, y: 14 }, roads);
    const c = addressOf({ x: 12, y: -4 }, roads);
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
    expect(a.split(' ').slice(0, -1).join(' ')).toBe(b.split(' ').slice(0, -1).join(' '));
  });

  it('never sends you to the same house twice in a row', () => {
    const p = sampleProject();
    const list = customersOf(p.buildings, p.site.roads, (b) => b.id.startsWith('v-delivery-'));
    const r = rng(5);
    let last: string | null = null;
    for (let k = 0; k < 50; k++) {
      const c: { buildingId: string } = pickCustomer(list, { x: 90, y: 10 }, last, r)!;
      expect(c.buildingId).not.toBe(last);
      last = c.buildingId;
    }
  });
});

describe('delivery: scoring', () => {
  it('pays more for hot pizzas, rush orders and streaks', () => {
    expect(deliveryPoints(1, 0, false).total).toBe(200);
    expect(deliveryPoints(0, 0, false).total).toBe(100);
    expect(deliveryPoints(1, 0, true).total).toBe(300);
    expect(deliveryPoints(1, 3, false).total).toBe(250);
    expect(deliveryPoints(1, 10, false).streak).toBe(100);
  });

  it('cools down over time, faster when the customer is in a hurry', () => {
    expect(cool(1, HEAT_SECONDS, false)).toBe(0);
    expect(cool(1, HEAT_SECONDS / 2, false)).toBeCloseTo(0.5, 5);
    expect(cool(1, RUSH_HEAT_SECONDS, true)).toBe(0);
    expect(cool(0.1, 100, false)).toBe(0);
  });

  it('streaks need hot pizzas', () => {
    expect(nextStreak(2, 0.8)).toBe(3);
    expect(nextStreak(2, 0.3)).toBe(0);
  });

  it('tells a crash from braking', () => {
    // braking hard for one frame: −7.5 m/s² × 0.05 s
    expect(isCrash(6, 6 - 0.375)).toBe(false);
    // the walk controller cuts the speed to 60 % on a bump
    expect(isCrash(6, 3.6)).toBe(true);
    expect(isCrash(2, 1.2)).toBe(false);
  });

  it('has fair medals: bronze for two warm pizzas, gold needs a hot streak', () => {
    const m = GAME.medals;
    expect(medalFor(deliveryPoints(0.6, 1, false).total + deliveryPoints(0.5, 2, false).total, m)).toBeGreaterThanOrEqual(1);
    let gold = 0;
    for (let k = 1; k <= 6; k++) gold += deliveryPoints(0.85, k, k % 3 === 0).total;
    expect(medalFor(gold, m)).toBe(3);
    let silver = 0;
    for (let k = 1; k <= 4; k++) silver += deliveryPoints(0.7, k, false).total;
    expect(medalFor(silver, m)).toBe(2);
  });
});

describe('delivery: venue and items', () => {
  it('builds the pizzeria in the west half of the shared plot', () => {
    const p = sampleProject();
    const mine = p.site.props.filter((f) => f.id.startsWith('v-delivery-'));
    const ids = new Set(mine.map((f) => f.catalogId));
    for (const id of ['game-sign-delivery', 'pizza-counter', 'pizza-sign', 'delivery-bike']) expect(ids.has(id)).toBe(true);
    for (const f of mine) {
      expect(f.x).toBeGreaterThanOrEqual(70);
      expect(f.x).toBeLessThanOrEqual(95);
      expect(f.y).toBeGreaterThanOrEqual(10);
      expect(f.y).toBeLessThanOrEqual(40);
    }
  });

  it('the delivery bike is a rideable vehicle with its box on the rack', () => {
    const def = getFurniture('delivery-bike')!;
    expect(def.vehicle?.kind).toBe('bicycle');
    const obj = def.build({ colors: { frame: '#222222', seat: '#333333', box: '#c8372b' } });
    expect((obj.userData.wheels ?? []).length).toBeGreaterThanOrEqual(2);
  });
});
