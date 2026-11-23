import { describe, expect, it } from 'vitest';
import { FURNITURE, getFurniture } from '../src/catalog';
import { CHALLENGES, useProgress } from '../src/game/progress';
import { sampleProject } from '../src/model/neighborhood';

describe('player progress', () => {
  it('completes a challenge exactly once when its counter reaches the goal', () => {
    const p = useProgress.getState();
    const goal = CHALLENGES.find((c) => c.id === 'trampoline')!;
    for (let i = 0; i < goal.goal - 1; i++) p.report('bounced');
    expect(useProgress.getState().done).not.toContain('trampoline');
    p.report('bounced');
    expect(useProgress.getState().done).toContain('trampoline');
    expect(useProgress.getState().toast?.id).toBe('trampoline');
    p.report('bounced', 10);
    expect(useProgress.getState().done.filter((id) => id === 'trampoline')).toHaveLength(1);
  });

  it('counts each star of a project only once', () => {
    const p = useProgress.getState();
    p.collectStar('prj', 'a');
    p.collectStar('prj', 'a');
    p.collectStar('prj', 'b');
    expect(useProgress.getState().stars.prj).toEqual(['a', 'b']);
    expect(useProgress.getState().counters['star-collected']).toBe(2);
  });

  it('has unique challenge ids', () => {
    expect(new Set(CHALLENGES.map((c) => c.id)).size).toBe(CHALLENGES.length);
  });
});

describe('playable catalog items', () => {
  it('declares consistent ability specs', () => {
    for (const def of FURNITURE) {
      // anything that moves on its own must not be baked into a static batch
      if (def.ride || def.ball || def.pet) expect(def.noBake, def.id).toBe(true);
      if (def.slide) {
        expect(def.slide.path.length, def.id).toBeGreaterThan(2);
        expect(def.slide.slideFrom, def.id).toBeLessThan(def.slide.path.length - 1);
        // a slide goes down
        expect(def.slide.path[def.slide.slideFrom].y, def.id).toBeGreaterThan(def.slide.path[def.slide.path.length - 1].y);
      }
      if (def.bounce) expect(def.bounce.radius, def.id).toBeLessThanOrEqual(Math.min(def.size.w, def.size.d) / 2);
      if (def.ball) expect(def.ball.radius, def.id).toBeGreaterThan(0.03);
      if (def.pet) expect(def.pet.runSpeed, def.id).toBeGreaterThan(def.pet.walkSpeed);
    }
  });

  it('gives the starter neighborhood things to play with', () => {
    const project = sampleProject();
    const site = project.site.props.map((p) => p.catalogId);
    const inside = project.buildings.flatMap((b) => b.levels.flatMap((l) => l.furniture.map((f) => f.catalogId)));
    for (const id of [...site, ...inside]) expect(getFurniture(id), id).toBeDefined();
    const all = [...site, ...inside].map((id) => getFurniture(id)!);
    expect(all.some((d) => d.pet)).toBe(true);
    expect(all.some((d) => d.ball)).toBe(true);
    expect(all.some((d) => d.bounce)).toBe(true);
    expect(all.some((d) => d.ride)).toBe(true);
    expect(all.some((d) => d.slide)).toBe(true);
    expect(all.some((d) => d.interact)).toBe(true);
  });
});
