import { describe, expect, it } from 'vitest';
import {
  FISH_COUNT,
  SPECIES,
  addToAlbum,
  bitesAt,
  catchPoints,
  fightStrength,
  rollCatch,
  startFight,
  stepFight,
  type Album,
  type Catch,
} from '../src/game/minigames/fishing/species';

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

const catchOf = (id: string, weight: number): Catch => ({ species: SPECIES.find((s) => s.id === id)!, weight, length: 50 });

describe('fishing species', () => {
  it('has at least 12 fish with unique ids and Hebrew names', () => {
    expect(FISH_COUNT).toBeGreaterThanOrEqual(12);
    expect(new Set(SPECIES.map((s) => s.id)).size).toBe(SPECIES.length);
    for (const s of SPECIES) expect(/[֐-׿]/.test(s.name)).toBe(true);
  });

  it('lets night fish bite only at night and dawn fish only at dawn', () => {
    const cat = SPECIES.find((s) => s.id === 'catfish')!;
    const trout = SPECIES.find((s) => s.id === 'trout')!;
    expect(bitesAt(cat, 23)).toBe(true);
    expect(bitesAt(cat, 13)).toBe(false);
    expect(bitesAt(trout, 6)).toBe(true);
    expect(bitesAt(trout, 14)).toBe(false);
    const r = rng(2);
    for (let i = 0; i < 300; i++) {
      const c = rollCatch(13, Math.random(), r);
      expect(c.species.when === 'night').toBe(false);
      expect(c.weight).toBeGreaterThanOrEqual(c.species.weight[0]);
      expect(c.weight).toBeLessThanOrEqual(c.species.weight[1]);
    }
  });

  it('finds rarer fish with long casts', () => {
    const r = rng(5);
    const rareShare = (far: number) => {
      let n = 0;
      for (let i = 0; i < 2000; i++) if (rollCatch(18, far, r).species.rarity !== 'common') n++;
      return n / 2000;
    };
    expect(rareShare(1)).toBeGreaterThan(rareShare(0) + 0.15);
  });

  it('scores rarity × weight', () => {
    expect(catchPoints(catchOf('carp', 4))).toBe(80);
    expect(catchPoints(catchOf('koi', 4))).toBeGreaterThan(catchPoints(catchOf('carp', 4)));
    expect(catchPoints(catchOf('carp', 6))).toBeGreaterThan(catchPoints(catchOf('carp', 1)));
    expect(catchPoints(catchOf('boot', 0.5))).toBe(5);
  });

  it('keeps a persistent album', () => {
    const a: Album = { species: {} };
    expect(addToAlbum(a, catchOf('carp', 2))).toBe(true);
    expect(addToAlbum(a, catchOf('carp', 3))).toBe(false);
    expect(a.species.carp).toEqual({ n: 2, best: 3 });
  });
});

describe('the fight on the line', () => {
  const play = (c: Catch, policy: 'smart' | 'greedy' | 'lazy', seed: number) => {
    const r = rng(seed);
    const f = startFight(14, r);
    const s = fightStrength(c);
    for (let t = 0; t < 90; t += 1 / 30) {
      const reel = policy === 'greedy' ? true : policy === 'lazy' ? false : f.tension < (f.run ? 0.55 : 0.8);
      const steer = policy === 'smart' ? f.dir : 0;
      const end = stepFight(f, 1 / 30, reel, steer, s, r);
      if (end) return { end, t };
    }
    return { end: null, t: 90 };
  };

  it('lands fish when you reel carefully and follow them', () => {
    let landed = 0;
    for (let i = 0; i < 40; i++) {
      const res = play(catchOf(i % 2 ? 'carp' : 'pike', i % 2 ? 3 : 8), 'smart', i);
      if (res.end === 'landed') {
        landed++;
        expect(res.t).toBeLessThan(40);
      }
    }
    expect(landed).toBeGreaterThanOrEqual(36);
  });

  it('snaps the line of a big fish when you never let go, and loses it when you never reel', () => {
    let snapped = 0;
    for (let i = 0; i < 20; i++) if (play(catchOf('wels', 30), 'greedy', i).end === 'snapped') snapped++;
    expect(snapped).toBeGreaterThan(14);
    for (let i = 0; i < 10; i++) expect(play(catchOf('carp', 2), 'lazy', i).end).not.toBe('landed');
  });
});
