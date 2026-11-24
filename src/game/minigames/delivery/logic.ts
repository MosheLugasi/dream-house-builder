import { pointInPolygon } from '../../../model/geom';
import { getGraph } from '../../../model/graph';
import { ROAD_CELL, toSite, type Building, type Vec2 } from '../../../model/types';

/** Pure rules of the pizza delivery game: addresses, entrances, orders and tips. */

export const ROUND_SECONDS = 180;
/** seconds until a pizza is cold */
export const HEAT_SECONDS = 70;
export const RUSH_HEAT_SECONDS = 45;
/** stop this close to the door (m) and slower than this (m/s) to hand the pizza over */
export const DOOR_REACH = 9;
export const STOP_SPEED = 1.6;

const ROW_STREETS = ['רחוב הגפן', 'רחוב התאנה', 'רחוב הרימון', 'רחוב הדקל', 'רחוב השקד', 'רחוב הזית', 'רחוב האלון', 'רחוב הברוש'];
const COL_STREETS = ['שדרות הורד', 'רחוב הכלנית', 'רחוב הנרקיס', 'רחוב הרקפת', 'רחוב החרצית', 'רחוב הסחלב', 'רחוב הלוטם'];

const mod = (a: number, n: number) => ((a % n) + n) % n;

/** Street name of a road cell: rows (east–west) and columns (north–south) have their own names. */
export function streetName(i: number, j: number, horizontal: boolean): string {
  return horizontal ? ROW_STREETS[mod(j, ROW_STREETS.length)] : COL_STREETS[mod(i, COL_STREETS.length)];
}

/**
 * A postal address for a point: the nearest street and a house number counted along it
 * (odd numbers on one side, even on the other).
 */
export function addressOf(p: Vec2, roads: ReadonlyArray<[number, number]>): string {
  const set = new Set(roads.map(([i, j]) => `${i},${j}`));
  let best: [number, number] | null = null;
  let bd = Infinity;
  for (const [i, j] of roads) {
    const d = Math.hypot((i + 0.5) * ROAD_CELL - p.x, (j + 0.5) * ROAD_CELL - p.y);
    if (d < bd) {
      bd = d;
      best = [i, j];
    }
  }
  if (!best) return 'בלי כתובת';
  const [i, j] = best;
  const horizontal = set.has(`${i - 1},${j}`) || set.has(`${i + 1},${j}`) || !(set.has(`${i},${j - 1}`) || set.has(`${i},${j + 1}`));
  // which side of the street, and how far along it
  const side = horizontal ? (p.y > (j + 0.5) * ROAD_CELL ? 1 : 0) : p.x > (i + 0.5) * ROAD_CELL ? 1 : 0;
  const along = horizontal ? p.x : p.y;
  const n = Math.max(1, Math.round(Math.abs(along + 200) / 8)) * 2 - side;
  return `${streetName(i, j, horizontal)} ${n}`;
}

export interface Entrance {
  /** the middle of the front door (site) */
  door: Vec2;
  /** unit vector pointing out of the house */
  out: Vec2;
  /** where the customer stands: just outside the door */
  step: Vec2;
}

/** The front door of a building: a ground-floor door with the outdoors on one side. */
export function entranceOf(b: Building): Entrance | null {
  const lv = b.levels[0];
  if (!lv) return null;
  const rooms = getGraph(lv.walls).rooms.map((r) => r.polygon);
  const inside = (p: Vec2) => rooms.some((poly) => pointInPolygon(p, poly));
  const found: { door: Vec2; out: Vec2; width: number }[] = [];
  for (const o of lv.openings) {
    if (o.type !== 'door') continue;
    const w = lv.walls.find((x) => x.id === o.wallId);
    if (!w) continue;
    const dx = w.b.x - w.a.x;
    const dy = w.b.y - w.a.y;
    const L = Math.hypot(dx, dy);
    if (L < 1e-6) continue;
    const c = { x: w.a.x + (dx * o.offset) / L, y: w.a.y + (dy * o.offset) / L };
    const n = { x: -dy / L, y: dx / L };
    const p1 = { x: c.x + n.x * 0.6, y: c.y + n.y * 0.6 };
    const p2 = { x: c.x - n.x * 0.6, y: c.y - n.y * 0.6 };
    const in1 = inside(p1);
    const in2 = inside(p2);
    if (in1 === in2) continue; // inner door (or a door in a free-standing wall)
    const outL = in1 ? { x: -n.x, y: -n.y } : n;
    found.push({ door: c, out: outL, width: o.width });
  }
  if (!found.length) return null;
  // the widest outside door is the main entrance
  found.sort((a, b) => b.width - a.width);
  const f = found[0];
  const door = toSite(b, f.door);
  const tip = toSite(b, { x: f.door.x + f.out.x, y: f.door.y + f.out.y });
  const out = { x: tip.x - door.x, y: tip.y - door.y };
  const l = Math.hypot(out.x, out.y) || 1;
  out.x /= l;
  out.y /= l;
  return { door, out, step: { x: door.x + out.x * 0.75, y: door.y + out.y * 0.75 } };
}

export interface Customer {
  buildingId: string;
  name: string;
  address: string;
  entrance: Entrance;
}

/** Every building that can order (it has a front door), except the pizzeria itself. */
export function customersOf(buildings: ReadonlyArray<Building>, roads: ReadonlyArray<[number, number]>, exclude: (b: Building) => boolean): Customer[] {
  const out: Customer[] = [];
  for (const b of buildings) {
    if (exclude(b)) continue;
    const e = entranceOf(b);
    if (!e) continue;
    out.push({ buildingId: b.id, name: b.name, address: addressOf(e.step, roads), entrance: e });
  }
  return out;
}

/**
 * Choose the next customer: not the last one, not too close to the shop, nearer ones a bit more
 * often (a round has room for several trips).
 */
export function pickCustomer(list: ReadonlyArray<Customer>, from: Vec2, lastId: string | null, rand: () => number): Customer | null {
  const ok = list.filter((c) => c.buildingId !== lastId);
  const pool = ok.length ? ok : list;
  if (!pool.length) return null;
  const weights = pool.map((c) => {
    const d = Math.hypot(c.entrance.step.x - from.x, c.entrance.step.y - from.y);
    if (d < 25) return 0.15;
    if (d > 260) return 0.1;
    return 1 / (1 + d / 120);
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

export interface Tip {
  base: number;
  hot: number;
  streak: number;
  total: number;
}

/** Points for a delivery: base + how hot the pizza still is + a streak bonus, ×1.5 for rush orders. */
export function deliveryPoints(heat: number, streak: number, rush: boolean): Tip {
  const base = 100;
  const hot = Math.round(Math.max(0, Math.min(1, heat)) * 100);
  const streakBonus = streak >= 2 ? Math.min(100, 25 * (streak - 1)) : 0;
  const total = Math.round((base + hot) * (rush ? 1.5 : 1)) + streakBonus;
  return { base, hot, streak: streakBonus, total };
}

/** Heat after `dt` seconds (rush pizzas cool faster: the customer is waiting!). */
export function cool(heat: number, dt: number, rush: boolean): number {
  return Math.max(0, heat - dt / (rush ? RUSH_HEAT_SECONDS : HEAT_SECONDS));
}

/** A hot delivery keeps the streak going; a lukewarm one ends it. */
export function nextStreak(streak: number, heat: number): number {
  return heat >= 0.5 ? streak + 1 : 0;
}

/** A sudden loss of speed that braking cannot explain: the bike hit something. */
export function isCrash(prevSpeed: number, speed: number): boolean {
  return prevSpeed > 3 && speed < prevSpeed * 0.75 && prevSpeed - speed > 1;
}

export const CRASH_HEAT = 0.08;
export const CRASH_POINTS = 10;
