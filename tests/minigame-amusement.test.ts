import { describe, expect, it } from 'vitest';
import { getFurniture, resolveColors } from '../src/catalog';
import type { AmuseRide } from '../src/catalog/items/_gameCKit';
import { LAYOUT_FAMILY, LAYOUT_HELIX, LAYOUT_LOOP, TrainPhysics, trackFor } from '../src/catalog/items/_gameCTrack';
import { GAME } from '../src/game/minigames/amusement';
import { BONUS, HandsUp, allKindsDone, classifyProp, punchLine, ratePark, ridePoints, starText, type Punch } from '../src/game/minigames/amusement/logic';
import { installVenue, plotById } from '../src/game/minigames/plots';
import { emptyProject } from '../src/model/defaults';

const RIDES = ['amuse-ferris-wheel', 'amuse-coaster-loop', 'amuse-coaster-helix', 'amuse-coaster-family', 'amuse-drop-tower', 'amuse-pirate-ship', 'amuse-teacups', 'amuse-bumper-cars'];

/** run one full cycle with a rider in seat 0; returns its duration (s) or -1 */
function cycle(id: string, push = 0.35, size?: { w: number; d: number; h: number }): { t: number; rt: AmuseRide; maxSpeed: number; drop: boolean } {
  const def = getFurniture(id)!;
  const obj = def.build({ colors: resolveColors(def), size });
  const rt = obj.userData.amuse as AmuseRide;
  let t = 0;
  let maxSpeed = 0;
  let drop = false;
  for (let i = 0; i < 60 * 120; i++) {
    rt.step(1 / 60, push, [0]);
    t += 1 / 60;
    maxSpeed = Math.max(maxSpeed, rt.speed);
    drop ||= rt.drop;
    if (rt.cycles > 0) return { t, rt, maxSpeed, drop };
  }
  return { t: -1, rt, maxSpeed, drop };
}

describe('amusement rides (catalog)', () => {
  it('every ride is a self-simulating ride with seats and an entrance', () => {
    for (const id of RIDES) {
      const def = getFurniture(id);
      expect(def, id).toBeDefined();
      expect(def!.ride, id).toBeDefined();
      expect(def!.noBake, id).toBe(true);
      const obj = def!.build({ colors: resolveColors(def!) });
      const rt = obj.userData.amuse as AmuseRide;
      expect(obj.userData.ride).toBe(rt);
      expect(rt.seatFrames.length, id).toBeGreaterThanOrEqual(4);
      expect(rt.thrill).toBeGreaterThanOrEqual(1);
      expect(Number.isFinite(rt.entrance.x) && Number.isFinite(rt.entrance.z)).toBe(true);
    }
  });

  it('a rider gets a full cycle that ends back where it started, in a sensible time', () => {
    for (const id of RIDES) {
      const { t, rt, maxSpeed } = cycle(id, id === 'amuse-bumper-cars' ? 1 : 0.35);
      expect(t, `${id} never finished`).toBeGreaterThan(8);
      expect(t, id).toBeLessThan(40);
      expect(rt.state).toBe('done');
      expect(maxSpeed, id).toBeGreaterThan(0.2);
    }
  });

  it('thrill rides have drops for the hands-up challenge', () => {
    for (const id of ['amuse-coaster-loop', 'amuse-coaster-helix', 'amuse-coaster-family', 'amuse-drop-tower', 'amuse-pirate-ship']) expect(cycle(id).drop, id).toBe(true);
    const drop = cycle('amuse-drop-tower');
    expect(drop.maxSpeed).toBeGreaterThan(15);
  });

  it('stays still and finished without riders; the rider can go again with W', () => {
    const { rt } = cycle('amuse-pirate-ship');
    for (let i = 0; i < 120; i++) rt.step(1 / 60, 0.35, [0]);
    expect(rt.state).toBe('done');
    for (let i = 0; i < 60; i++) rt.step(1 / 60, 1, [0]);
    expect(['loading', 'running']).toContain(rt.state);
    for (let i = 0; i < 60 * 40; i++) rt.step(1 / 60, 0, []);
    expect(rt.state).toBe('idle');
  });

  it('survives bad frame times', () => {
    const def = getFurniture('amuse-coaster-loop')!;
    const rt = def.build({ colors: resolveColors(def) }).userData.amuse as AmuseRide;
    for (const dt of [NaN, -1, 0, 5, Infinity]) rt.step(dt, NaN, [0]);
    for (let i = 0; i < 600; i++) rt.step(1 / 30, 0, [0]);
    expect(Number.isFinite(rt.speed)).toBe(true);
  });

  it('coaster trains complete every layout at the smallest and largest size without stalling', () => {
    for (const L of [LAYOUT_LOOP, LAYOUT_HELIX, LAYOUT_FAMILY]) {
      for (const k of [0.75, 1, 1.3]) {
        const size = { w: L.size.w * k, d: L.size.d * k, h: L.size.h * Math.min(k, 1.3) };
        const t = trackFor(L, size);
        const ph = new TrainPhysics(t, L.chain, (L.cars * 2.55) / 2);
        ph.start();
        let time = 0;
        let maxV = 0;
        while (time < 90 && !ph.step(1 / 60)) {
          time += 1 / 60;
          maxV = Math.max(maxV, ph.v);
        }
        expect(time, `${L.id}×${k}`).toBeLessThan(45);
        expect(maxV, `${L.id}×${k}`).toBeGreaterThan(7);
        expect(maxV).toBeLessThan(30);
      }
    }
  });

  it('the looping coaster goes upside down', () => {
    const t = trackFor(LAYOUT_LOOP, LAYOUT_LOOP.size);
    expect(t.up.some((u) => u.y < -0.9)).toBe(true);
    const h = trackFor(LAYOUT_HELIX, LAYOUT_HELIX.size);
    expect(h.up.every((u) => u.y > -0.2)).toBe(true);
  });

  it('bumper cars: the player drives and bumps visitors cars', () => {
    const def = getFurniture('amuse-bumper-cars')!;
    const rt = def.build({ colors: resolveColors(def) }).userData.amuse as AmuseRide;
    rt.control!.external = true;
    for (let i = 1; i < 6; i++) rt.extraRiders.add(i);
    let bumps = 0;
    rt.onEvent = (e) => {
      if (e === 'bump') bumps++;
    };
    rt.control!.throttle = 1;
    for (let i = 0; i < 60 * 25; i++) {
      rt.control!.steer = Math.sin(i / 50);
      rt.step(1 / 60, 0, [0]);
    }
    expect(rt.speed).toBeGreaterThanOrEqual(0);
    expect(bumps).toBeGreaterThan(0);
  });
});

describe('amusement park round rules', () => {
  it('scores rides by thrill, repeats are worth less', () => {
    expect(ridePoints(5, false)).toBe(600);
    expect(ridePoints(2, false)).toBe(300);
    expect(ridePoints(5, true)).toBeLessThan(ridePoints(5, false) / 2);
    expect(ridePoints(99, false)).toBe(600);
  });

  it('rates a richer park higher', () => {
    const poor = ratePark({ rides: ['ferris', 'coaster'], food: [], decor: 3, lights: 1 });
    const rich = ratePark({ rides: ['ferris', 'coaster', 'drop', 'pirate', 'teacups', 'bumper', 'coaster', 'coaster'], food: ['a', 'b', 'c', 'a'], decor: 80, lights: 40 });
    expect(rich.stars).toBeGreaterThan(poor.stars);
    expect(rich.overall).toBe(5);
    expect(rich.bonus).toBe(rich.stars * BONUS.star);
    expect(poor.variety).toBe(1);
    expect(starText(3)).toBe('★★★☆☆');
  });

  it('classifies park dressing', () => {
    expect(classifyProp('amuse-stall-popcorn')).toBe('food');
    expect(classifyProp('kiosk')).toBe('food');
    expect(classifyProp('amuse-light-string', [], true)).toBe('light');
    expect(classifyProp('street-lamp', [], true)).toBe('light');
    expect(classifyProp('palm-tree')).toBe('decor');
    expect(classifyProp('street-bench')).toBe('decor');
    expect(classifyProp('amuse-ferris-wheel', [], true, true)).toBeNull();
    expect(classifyProp('car-compact')).toBeNull();
  });

  it('hands up all the way down wins, dropping the hands loses', () => {
    const h = new HandsUp();
    expect(h.step(false, false)).toBeNull();
    h.step(true, true);
    h.step(true, true);
    expect(h.step(false, true)).toBe('win');
    h.step(true, true);
    h.step(true, false);
    h.step(true, true);
    expect(h.step(false, true)).toBe('lost');
  });

  it('the punch card and the "every kind" bonus', () => {
    const p = (kind: Punch['kind'], done: boolean): Punch => ({ id: kind, kind, label: kind, icon: '🎡', thrill: 2, done, rides: 0 });
    const card = [p('ferris', true), p('coaster', true), p('coaster', false), p('drop', false)];
    expect(punchLine(card)).toContain('2/4');
    expect(allKindsDone(card)).toBe(false);
    card[3].done = true;
    expect(allKindsDone(card)).toBe(true);
    expect(allKindsDone([p('ferris', true)])).toBe(false);
  });

  it('medals: bronze below silver below gold', () => {
    expect(GAME.medals.bronze).toBeLessThan(GAME.medals.silver);
    expect(GAME.medals.silver).toBeLessThan(GAME.medals.gold);
  });
});

describe('the default park', () => {
  it('stands in its plot with every ride, food, lights and the start sign', () => {
    const p = emptyProject();
    installVenue(p, 'amusement', 'south', GAME.venue!.build);
    const plot = plotById('south');
    const mine = p.site.props.filter((f) => f.id.startsWith('v-amusement-'));
    for (const id of RIDES) expect(mine.some((f) => f.catalogId === id), id).toBe(true);
    expect(mine.some((f) => f.catalogId === 'game-sign-amusement')).toBe(true);
    for (const f of mine) {
      expect(getFurniture(f.catalogId), f.catalogId).toBeDefined();
      expect(f.x).toBeGreaterThanOrEqual(plot.x0);
      expect(f.x).toBeLessThanOrEqual(plot.x0 + plot.w);
      expect(f.y).toBeGreaterThanOrEqual(plot.y0);
      expect(f.y).toBeLessThanOrEqual(plot.y0 + plot.h);
    }
    // the park's rating is good but leaves room to build more
    const inv = { rides: [] as never[], food: [] as string[], decor: 0, lights: 0 };
    for (const f of mine) {
      const def = getFurniture(f.catalogId)!;
      const c = classifyProp(def.id, def.tags, !!def.light, !!def.ride);
      if (c === 'food') inv.food.push(def.id);
      if (c === 'decor') inv.decor++;
      if (c === 'light') inv.lights++;
    }
    const r = ratePark({ ...inv, rides: ['ferris', 'coaster', 'coaster', 'coaster', 'drop', 'pirate', 'teacups', 'bumper'] });
    expect(r.overall).toBeGreaterThanOrEqual(4);
    expect(r.stars).toBeLessThan(20);
  });
});
