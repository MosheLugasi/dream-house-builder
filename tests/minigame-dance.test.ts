import { describe, expect, it } from 'vitest';
import { GOOD, LATE, PERFECT, accuracy, beatsToSec, judge, makeSong, maxScore, multiplier, newTally, tally } from '../src/game/minigames/dance/chart';

describe('dance songs', () => {
  it('generates three songs of 1–1.5 minutes with more arrows on harder levels', () => {
    const songs = ([0, 1, 2] as const).map((l) => makeSong(l));
    for (const s of songs) {
      const sec = beatsToSec(s, s.beats);
      expect(sec).toBeGreaterThan(60);
      expect(sec).toBeLessThan(100);
      expect(s.notes.length).toBeGreaterThan(40);
      // arrows only after the intro and inside the song
      expect(s.notes[0].t).toBeGreaterThanOrEqual(s.firstBeat);
      expect(s.notes[s.notes.length - 1].t).toBeLessThan(s.beats);
      // every arrow is on the eighth-note grid and on a lane
      for (const n of s.notes) {
        expect(Math.abs(n.t * 2 - Math.round(n.t * 2))).toBeLessThan(1e-9);
        expect([0, 1, 2, 3]).toContain(n.lane);
      }
      console.log(s.name, s.bpm, s.notes.length, 'notes', Math.round(sec), 's', 'max', maxScore(s));
    }
    const nps = songs.map((s) => s.notes.length / beatsToSec(s, s.beats));
    expect(nps[1]).toBeGreaterThan(nps[0]);
    expect(nps[2]).toBeGreaterThan(nps[1]);
  });

  it('is deterministic and keeps the same lane playable', () => {
    expect(makeSong(1)).toEqual(makeSong(1));
    for (const l of [0, 1, 2] as const) {
      const s = makeSong(l);
      const last: Record<number, number> = {};
      for (const n of s.notes) {
        if (last[n.lane] !== undefined) expect(n.t - last[n.lane]).toBeGreaterThanOrEqual(l === 0 ? 1 : 0.5);
        last[n.lane] = n.t;
      }
    }
  });

  it('puts every arrow on a note of the music (drum or melody)', () => {
    const s = makeSong(1);
    const times = new Set(s.music.filter((m) => m.inst !== 'chord').map((m) => m.t));
    for (const n of s.notes) expect(times.has(n.t)).toBe(true);
  });
});

describe('dance judging', () => {
  it('judges timing windows', () => {
    expect(judge(0)).toBe('perfect');
    expect(judge(-PERFECT)).toBe('perfect');
    expect(judge(GOOD - 0.001)).toBe('good');
    expect(judge(GOOD + 0.01)).toBeNull();
    expect(LATE).toBeGreaterThan(GOOD);
  });

  it('builds combos and multipliers, a miss resets them', () => {
    const t = newTally();
    for (let i = 0; i < 9; i++) tally(t, 'perfect');
    expect(t.score).toBe(900);
    expect(tally(t, 'perfect')).toBe(200);
    expect(multiplier(t.combo)).toBe(2);
    tally(t, 'miss');
    expect(t.combo).toBe(0);
    expect(t.best).toBe(10);
    expect(tally(t, 'good')).toBe(50);
    expect(multiplier(45)).toBe(4);
    expect(accuracy(t)).toBeGreaterThan(0.8);
  });
});
