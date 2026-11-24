import { describe, expect, it } from 'vitest';
import { FrameGovernor, QUALITY_STEPS } from '../src/render3d/render/AdaptiveQuality';
import { Prebuilder } from '../src/render3d/prebuild';
import { loadQualityChoice } from '../src/store/quality';
import { sampleProject } from '../src/model/neighborhood';

/** feed `seconds` of frames `ms` apart, from `t`; returns the time after the last one */
function run(g: FrameGovernor, t: number, ms: number, seconds: number, changes: number[] = []): number {
  for (let k = 0; k < (seconds * 1000) / ms; k++) {
    t += ms;
    if (g.frame(ms, t)) changes.push(t);
  }
  return t;
}

describe('automatic quality', () => {
  it('is the default choice', () => {
    expect(loadQualityChoice()).toBe('auto');
  });

  it('keeps the quality while the frame rate is fine, even with single hitches', () => {
    const g = new FrameGovernor();
    let t = 0;
    for (let k = 0; k < 600; k++) {
      t += 16.7;
      // a 400 ms hitch every second (a shader, a garbage collection…)
      g.frame(k % 60 === 0 ? 400 : 16.7, t);
    }
    expect(g.level).toBe(0);
  });

  it('steps down on sustained slowness, one step per window, and never up again', () => {
    const g = new FrameGovernor();
    const changes: number[] = [];
    let t = run(g, 0, 45, 5, changes);
    expect(g.level).toBeGreaterThanOrEqual(1);
    // a step waits for things to settle and a full window: at most one step per ~4 s
    for (let i = 1; i < changes.length; i++) expect(changes[i] - changes[i - 1]).toBeGreaterThanOrEqual(3900);
    const level = g.level;
    t = run(g, t, 10, 20);
    expect(g.level).toBe(level);
    // slow again: continues down to the floor and stays there
    run(g, t, 60, 60);
    expect(g.level).toBe(QUALITY_STEPS.length - 1);
    expect(g.step.preset).toBe('low');
  });

  it('does not measure while paused and starts over on reset', () => {
    const g = new FrameGovernor();
    g.pause(0, 10_000);
    run(g, 0, 50, 9);
    expect(g.level).toBe(0);
    run(g, 10_000, 50, 6);
    expect(g.level).toBe(1);
    g.reset(20_000);
    expect(g.level).toBe(0);
  });

  it('only changes the preset on the last step', () => {
    for (const s of QUALITY_STEPS.slice(0, -1)) expect(s.preset).toBeUndefined();
    // every step is cheaper than the one before
    for (let i = 2; i < QUALITY_STEPS.length - 1; i++) expect(QUALITY_STEPS[i].scale).toBeLessThan(QUALITY_STEPS[i - 1].scale);
    expect(QUALITY_STEPS[1].shadowEvery).toBeGreaterThan(QUALITY_STEPS[0].shadowEvery);
  });
});

describe('prebuilding the 3D view', () => {
  it('queues every item template and finish once', () => {
    const p = new Prebuilder();
    const project = sampleProject();
    p.plan(project);
    const left = p.runFor(0);
    expect(left).toBeGreaterThan(10);
    // planning the same project again adds nothing
    p.plan({ ...project });
    expect(p.runFor(0)).toBe(left);
    // (running them needs a browser: the finishes draw their textures on canvases)
  });
});
