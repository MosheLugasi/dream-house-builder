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
  const does = (def: { actions?: Array<{ kind: string }> }, kind: string) => !!def.actions?.some((a) => a.kind === kind);

  it('declares consistent ability specs', () => {
    for (const def of FURNITURE) {
      // anything that simulates itself must not be baked into a static batch
      if (def.ride || def.pet) expect(def.noBake, def.id).toBe(true);
      if (def.pet) {
        expect(def.pet.runSpeed, def.id).toBeGreaterThan(def.pet.walkSpeed);
        expect(does(def, 'pet'), def.id).toBe(true);
      }
      for (const a of def.actions ?? []) {
        if (a.kind !== 'slide') continue;
        expect(a.path?.length ?? 0, def.id).toBeGreaterThan(1);
        // a slide goes down
        expect(a.path![0].y, def.id).toBeGreaterThan(a.path![a.path!.length - 1].y);
      }
    }
  });

  it('gives the starter neighborhood things to play with', () => {
    const project = sampleProject();
    const site = project.site.props.map((p) => p.catalogId);
    const inside = project.buildings.flatMap((b) => b.levels.flatMap((l) => l.furniture.map((f) => f.catalogId)));
    for (const id of [...site, ...inside]) expect(getFurniture(id), id).toBeDefined();
    const all = [...site, ...inside].map((id) => getFurniture(id)!);
    for (const kind of ['pet', 'ball', 'bounce', 'slide', 'light', 'tv', 'water']) expect(all.some((d) => does(d, kind)), kind).toBe(true);
    expect(all.some((d) => d.ride)).toBe(true);
    expect(all.some((d) => d.id === 'football-goal' || d.id === 'goal-soccer')).toBe(true);
  });
});
