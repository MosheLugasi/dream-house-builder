import '../src/store/store'; // load the store first: it builds the starter project at import time (avoids an import cycle through the games)
import { describe, expect, it } from 'vitest';
import { emptyProject } from '../src/model/defaults';
import { sampleProject } from '../src/model/neighborhood';
import { installVenue } from '../src/game/minigames/plots';
import { CLUES } from '../src/game/minigames/treasure/clues';
import { findLandmarks, generateHunt, HUNT_STAGES, SiteMap, stageScore, warmth, warmthLabel } from '../src/game/minigames/treasure/hunt';
import { GAME } from '../src/game/minigames/treasure';
import type { Project, Vec2 } from '../src/model/types';

/** where the runtime puts the player: 2.2 m in front of the game's start sign */
function signStart(p: Project): Vec2 {
  const sign = p.site.props.find((f) => f.catalogId === 'game-sign-treasure')!;
  return { x: sign.x - Math.sin(sign.rotation) * 2.2, y: sign.y + Math.cos(sign.rotation) * 2.2 };
}

function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

describe('treasure hunt generator', () => {
  const project = sampleProject();
  const start = signStart(project);

  it('finds plenty of landmarks of many kinds in the starter neighborhood', () => {
    const marks = findLandmarks(project);
    const types = new Set(marks.map((l) => l.type));
    expect(marks.length).toBeGreaterThan(20);
    for (const t of ['school', 'library', 'shop', 'cafe', 'fountain', 'myHome', 'grandma', 'pond', 'bus'] as const) expect(types, t).toContain(t);
    for (const l of marks) expect(CLUES[l.type], l.type).toBeTruthy();
  });

  it('builds a valid hunt for many seeds: 5 distinct, reachable, well spread stages', () => {
    const map = new SiteMap(project);
    map.flood(start);
    for (let seed = 1; seed <= 40; seed++) {
      const hunt = generateHunt(project, start, { random: seeded(seed * 7919) });
      expect(hunt.length, `seed ${seed}`).toBe(HUNT_STAGES);
      expect(new Set(hunt.map((s) => s.key)).size).toBe(HUNT_STAGES);
      expect(new Set(hunt.map((s) => s.type)).size).toBe(HUNT_STAGES);
      let prev = start;
      for (const s of hunt) {
        // the chest stands on free, walkable ground the player can reach on foot
        expect(map.free(s.spot), `${s.label} free`).toBe(true);
        expect(map.walkDistance(s.spot), `${s.label} reachable`).toBeGreaterThanOrEqual(0);
        // close to its landmark
        expect(dist(s.spot, s.pos)).toBeLessThan(16);
        // legs are not trivial and not exhausting
        expect(dist(prev, s.spot)).toBeGreaterThanOrEqual(18);
        expect(dist(prev, s.spot)).toBeLessThanOrEqual(120);
        expect(s.riddle.length).toBeGreaterThan(10);
        expect(s.riddle).not.toContain('{name}');
        prev = s.spot;
      }
      for (let i = 0; i < hunt.length; i++) for (let j = i + 1; j < hunt.length; j++) expect(dist(hunt[i].spot, hunt[j].spot)).toBeGreaterThanOrEqual(16);
    }
  });

  it('makes a different hunt every round', () => {
    const keys = new Set<string>();
    for (let seed = 1; seed <= 10; seed++) keys.add(generateHunt(project, start, { random: seeded(seed * 104729) }).map((s) => s.key).join(','));
    expect(keys.size).toBeGreaterThanOrEqual(8);
  });

  it('uses what the player builds', () => {
    const p = sampleProject();
    p.site.props.push({ id: 'my-castle', catalogId: 'playhouse', x: -20, y: -60 + 3 + 0, rotation: 0, elevation: 0 });
    p.site.props.push({ id: 'my-pool', catalogId: 'pool-above-ground', x: 30, y: 30, rotation: 0, elevation: 0 });
    const marks = findLandmarks(p);
    expect(marks.some((l) => l.key === 'my-pool' && l.type === 'creation')).toBe(true);
  });

  it('copes with an almost empty neighborhood', () => {
    const p = emptyProject('ריק');
    installVenue(p, 'treasure', GAME.venue!.plot, GAME.venue!.build);
    const hunt = generateHunt(p, signStart(p), { random: seeded(3) });
    expect(hunt.length).toBeLessThan(HUNT_STAGES);
  });

  it('has several riddles for every kind of place', () => {
    for (const [type, set] of Object.entries(CLUES)) {
      expect(set.riddles.length, type).toBeGreaterThanOrEqual(2);
      for (const r of set.riddles) expect(r.trim().length, type).toBeGreaterThan(8);
    }
    const total = Object.values(CLUES).reduce((s, c) => s + c.riddles.length, 0);
    expect(total).toBeGreaterThan(90);
  });
});

describe('treasure hunt scoring', () => {
  it('rewards speed and charges for hints', () => {
    const fast = stageScore(10, 40, 0).total;
    const slow = stageScore(90, 40, 0).total;
    const hinted = stageScore(10, 40, 1).total;
    expect(fast).toBe(500);
    expect(slow).toBeLessThan(fast);
    expect(hinted).toBe(fast - 100);
    expect(stageScore(1000, 40, 5).total).toBe(50);
  });

  it('medals: a slow first hunt with a few hints still earns bronze', () => {
    // 5 legs of 50 m at twice the par time, 3 hints in total
    let score = 300;
    for (let i = 0; i < 5; i++) score += stageScore(2 * (50 / 3.4 + 14), 50, i < 3 ? 1 : 0).total;
    expect(score).toBeGreaterThanOrEqual(GAME.medals.bronze);
    // gold needs near-par stages without hints
    let gold = 300;
    for (let i = 0; i < 5; i++) gold += stageScore(1.2 * (50 / 3.4 + 14), 50, 0).total;
    expect(gold).toBeGreaterThanOrEqual(GAME.medals.gold);
    expect(GAME.medals.bronze).toBeLessThan(GAME.medals.silver);
    expect(GAME.medals.silver).toBeLessThan(GAME.medals.gold);
  });

  it('the hot/cold meter warms up as you get closer', () => {
    expect(warmth(0, 50)).toBe(1);
    expect(warmth(100, 50)).toBe(0);
    expect(warmth(10, 50)).toBeGreaterThan(warmth(30, 50));
    expect(warmthLabel(0.95).text).toContain('רותח');
    expect(warmthLabel(0.05).text).toContain('קפוא');
  });
});
