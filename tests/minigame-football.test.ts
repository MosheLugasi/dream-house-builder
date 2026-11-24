import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { resolveColors } from '../src/catalog';
import { GAME_ITEMS_D } from '../src/catalog/items/gameItemsD';
import {
  BALL_R,
  crossing,
  difficulty,
  goalPoints,
  hitFrame,
  inNet,
  planKeeper,
  planShot,
  powerError,
  shotSpeed,
  stepBall,
  zoneOf,
  type GoalFrame,
} from '../src/game/minigames/football/logic';

const G: GoalFrame = { halfW: 2.55, top: 2.0, depth: 1.9, roof: 0.85, postR: 0.06 };

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

describe('football physics', () => {
  it('plans a shot that arrives where it was aimed, with and without curve', () => {
    for (const [tx, ty, spin] of [
      [0, 1, 0],
      [2.1, 1.7, 0],
      [-2.2, 0.4, 1],
      [1.8, 1.6, -1],
    ]) {
      for (const p of [0.3, 0.7, 1]) {
        const b = planShot(0, 9, tx, ty, shotSpeed(p), spin);
        const c = crossing(b)!;
        expect(c).not.toBeNull();
        expect(Math.abs(c.x - tx)).toBeLessThan(0.05);
        expect(Math.abs(c.y - ty)).toBeLessThan(0.05);
        expect(c.t).toBeGreaterThan(0.25);
        expect(c.t).toBeLessThan(1.2);
      }
    }
  });

  it('curves the ball sideways while it flies', () => {
    const b = planShot(0, 9, 0, 1, 18, 1);
    // aimed off to the left first, the spin brings it back to the middle
    expect(b.vx).toBeLessThan(-0.3);
  });

  it('bounces off a post and the crossbar, and lands in the net otherwise', () => {
    const post = { x: G.halfW - 0.05, y: 1, z: 0.3, vx: 0, vy: 0, vz: -20, spin: 0 };
    let hit: string | null = null;
    for (let i = 0; i < 60 && !hit; i++) {
      stepBall(post, 1 / 240);
      hit = hitFrame(post, G);
    }
    expect(hit).toBe('post');
    expect(post.vz).toBeGreaterThan(0);
    const bar = { x: 0.5, y: G.top + 0.05, z: 0.3, vx: 0, vy: 0, vz: -20, spin: 0 };
    hit = null;
    for (let i = 0; i < 60 && !hit; i++) {
      bar.vy = 0;
      stepBall(bar, 1 / 240);
      hit = hitFrame(bar, G);
    }
    expect(hit).toBe('bar');
    const goal = { x: 0, y: 1, z: 0.05, vx: 0, vy: 0, vz: -10, spin: 0 };
    stepBall(goal, 0.02);
    expect(inNet(goal, G)).toBe(true);
  });

  it('rolls along the ground without sinking', () => {
    const b = { x: 0, y: BALL_R, z: 5, vx: 0, vy: -2, vz: -5, spin: 0 };
    for (let i = 0; i < 200; i++) stepBall(b, 1 / 60);
    expect(b.y).toBeGreaterThanOrEqual(BALL_R - 1e-9);
  });
});

describe('football rules', () => {
  it('gives the most points for the top corners and a streak bonus', () => {
    expect(zoneOf(2.2, 1.8, G)).toBe('top-corner');
    expect(zoneOf(-2.2, 0.3, G)).toBe('low-corner');
    expect(zoneOf(0, 1, G)).toBe('center');
    expect(zoneOf(3, 1, G)).toBe('out');
    expect(zoneOf(0, 2.3, G)).toBe('out');
    expect(goalPoints('top-corner', 1, false).points).toBe(300);
    expect(goalPoints('center', 3, false).points).toBe(200);
    expect(goalPoints('center', 1, true).points).toBe(150);
    expect(goalPoints('out', 4, false).points).toBe(0);
  });

  it('makes the keeper better every round', () => {
    const a = difficulty(0);
    const b = difficulty(9);
    expect(b.read).toBeGreaterThan(a.read);
    expect(b.reaction).toBeLessThan(a.reaction);
    expect(b.dive).toBeGreaterThan(a.dive);
  });

  it('sends power over the bar only when the meter is pushed too far', () => {
    const r = rng(3);
    for (let i = 0; i < 50; i++) {
      expect(Math.abs(powerError(0.7, r)[1])).toBeLessThan(0.4);
      expect(powerError(0.97, r)[1]).toBeGreaterThan(0.85);
    }
  });

  it('lets a careful player score most shots and saves many lazy middle shots', () => {
    const r = rng(11);
    let corners = 0;
    let middles = 0;
    const N = 400;
    for (let i = 0; i < N; i++) {
      const round = i % 10;
      const d = difficulty(round);
      const side = r() < 0.5 ? -1 : 1;
      const cb = planShot(0, 9, side * 2.0, 1.55, shotSpeed(0.7), 0);
      const cc = crossing(cb);
      if (!planKeeper(cc, G, d, shotSpeed(0.7), r).save) corners++;
      const mb = planShot(0, 9, 0.2, 0.9, shotSpeed(0.5), 0);
      const mc = crossing(mb);
      if (!planKeeper(mc, G, d, shotSpeed(0.5), r).save) middles++;
    }
    expect(corners / N).toBeGreaterThan(0.5);
    expect(middles / N).toBeLessThan(0.6);
    expect(corners - middles).toBeGreaterThan(N * 0.1);
  });
});

describe('team D catalog items', () => {
  it('fit their declared size', () => {
    const problems: string[] = [];
    for (const def of GAME_ITEMS_D) {
      const obj = def.build({ colors: resolveColors(def) });
      const box = new THREE.Box3().setFromObject(obj, true);
      const { w, d, h } = def.size;
      const t = 0.012;
      if (box.min.x < -w / 2 - t || box.max.x > w / 2 + t) problems.push(`${def.id} x`);
      if (box.min.z < -d / 2 - t || box.max.z > d / 2 + t) problems.push(`${def.id} z`);
      if (box.min.y < -t || box.max.y > h + t) problems.push(`${def.id} y`);
    }
    expect(problems).toEqual([]);
  });
});
