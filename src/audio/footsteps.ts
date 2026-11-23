/**
 * Footsteps: a heel transient, a resonant body and (on hard floors) a softer toe roll a few hundredths later.
 * `s` (strength 0…1) scales level and brightness; every step is randomised a little.
 */
import type { Surface } from './types';
import { Voice, chain, expo, line, ping, rr, thump, tick } from './util';

type Step = (v: Voice, out: AudioNode, t: number, s: number, r: () => number) => void;

/** level trims per surface, balanced from the self-test table */
export const STEP_GAIN: Record<Surface, number> = {
  wood: 0.7,
  tile: 0.76,
  stone: 1.03,
  carpet: 0.9,
  grass: 1.02,
  asphalt: 1.38,
  sand: 0.37,
  water: 0.61,
  metal: 0.52,
};

/** short lumpy noise burst – blades of grass, grit, sand grains */
function grains(v: Voice, out: AudioNode, t: number, dur: number, freq: number, q: number, level: number, r: () => number, n: number): void {
  const src = v.noise('white', t, t + dur + 0.04);
  const f = v.bq('bandpass', freq, q);
  const g = v.gain(0);
  const pts: [number, number][] = [[0, 0]];
  for (let i = 0; i < n; i++) {
    const at = (dur * (i + rr(r, 0.2, 0.8))) / n;
    const decay = 1 - (0.6 * i) / n;
    pts.push([at, level * rr(r, 0.55, 1) * decay]);
    pts.push([at + (dur / n) * 0.45, level * rr(r, 0.1, 0.3) * decay]);
  }
  pts.sort((a, b) => a[0] - b[0]);
  pts.push([dur + 0.02, 0]);
  line(g.gain, t, pts);
  chain(src, f, g, out);
}

const STEPS: Record<Surface, Step> = {
  wood(v, out, t, s, r) {
    // hollow knock: heel click + two board resonances + a quieter toe
    tick(v, out, t, 1500, 0.8, 0.009, 0.7, 'white', 'lowpass');
    const f1 = rr(r, 105, 135);
    ping(v, out, t, f1, 0.045, 0.4, 'sine', 0.003);
    ping(v, out, t, f1 * rr(r, 2.2, 2.6), 0.03, 0.4, 'sine', 0.002);
    ping(v, out, t, f1 * rr(r, 4.2, 5), 0.014, 0.14, 'sine', 0.002);
    const toe = t + rr(r, 0.035, 0.05) * (1.3 - 0.4 * s);
    tick(v, out, toe, 900, 0.9, 0.012, 0.3, 'white', 'lowpass');
    ping(v, out, toe, f1 * 1.5, 0.03, 0.22, 'sine', 0.003);
  },

  tile(v, out, t, s, r) {
    tick(v, out, t, rr(r, 2600, 3200), 1.3, 0.006, 1.2);
    ping(v, out, t, rr(r, 380, 460), 0.014, 0.3, 'sine', 0.001);
    thump(v, out, t, 150, 95, 0.018, 0.28, 0.03);
    const toe = t + rr(r, 0.035, 0.05) * (1.3 - 0.4 * s);
    tick(v, out, toe, rr(r, 1900, 2300), 1.2, 0.007, 0.45);
  },

  stone(v, out, t, s, r) {
    tick(v, out, t, rr(r, 1700, 2100), 1.1, 0.008, 1.1);
    tick(v, out, t, 4200, 0.8, 0.004, 0.25);
    thump(v, out, t, 140, 85, 0.02, 0.3, 0.03);
    ping(v, out, t, rr(r, 250, 300), 0.016, 0.22, 'sine', 0.001);
    const toe = t + rr(r, 0.04, 0.055) * (1.3 - 0.4 * s);
    grains(v, out, toe, 0.035, 2400, 0.8, 0.3, r, 2);
  },

  carpet(v, out, t, _s, r) {
    tick(v, out, t, 330, 0.7, 0.03, 1.1, 'brown', 'lowpass', 0.006);
    thump(v, out, t, rr(r, 88, 104), 62, 0.035, 0.3, 0.05);
    tick(v, out, t + 0.008, 800, 0.6, 0.022, 0.7, 'pink', 'bandpass', 0.008);
  },

  grass(v, out, t, _s, r) {
    grains(v, out, t, rr(r, 0.09, 0.12), rr(r, 3000, 4200), 0.7, 0.9, r, 4);
    grains(v, out, t + 0.01, 0.07, rr(r, 1100, 1500), 0.8, 0.45, r, 3);
    thump(v, out, t, 105, 70, 0.025, 0.16, 0.05);
    tick(v, out, t, 300, 0.7, 0.03, 0.35, 'brown', 'lowpass', 0.008);
  },

  asphalt(v, out, t, s, r) {
    tick(v, out, t, rr(r, 1300, 1700), 0.9, 0.009, 0.9);
    thump(v, out, t, 125, 80, 0.02, 0.25, 0.03);
    // the dry scuff of the sole rolling forward
    grains(v, out, t + 0.012, rr(r, 0.05, 0.07) * (1.2 - 0.3 * s), rr(r, 1900, 2500), 0.8, 0.5, r, 3);
  },

  sand(v, out, t, _s, r) {
    const d = rr(r, 0.12, 0.16);
    const src = v.noise('pink', t, t + d + 0.05);
    const f = v.bq('bandpass', 1100, 0.5);
    expo(f.frequency, t, [
      [0, rr(r, 800, 1000) * v.p],
      [d, rr(r, 1500, 1900) * v.p],
    ]);
    const g = v.gain(0);
    line(g.gain, t, [
      [0, 0],
      [0.025, 1.6],
      [d * 0.55, 0.9],
      [d, 0],
    ]);
    chain(src, f, g, out);
    grains(v, out, t + 0.02, d * 0.8, 2800, 0.7, 0.22, r, 4);
    thump(v, out, t, 85, 55, 0.03, 0.3, 0.05);
  },

  water(v, out, t, _s, r) {
    // a shallow puddle: slap, spray and a couple of bubbles
    tick(v, out, t, 480, 0.7, 0.03, 1.4, 'pink', 'lowpass', 0.004);
    const src = v.noise('white', t, t + 0.24);
    const f = v.bq('bandpass', 900, 0.8);
    expo(f.frequency, t, [
      [0, 900 * v.p],
      [0.06, rr(r, 2200, 2800) * v.p],
      [0.2, 1500 * v.p],
    ]);
    const g = v.gain(0);
    line(g.gain, t, [
      [0, 0],
      [0.012, 0.9],
      [0.07, 0.4],
      [0.22, 0],
    ]);
    chain(src, f, g, out);
    const bubbles = 2 + Math.floor(r() * 2);
    for (let i = 0; i < bubbles; i++) {
      const at = t + rr(r, 0.04, 0.17);
      const fr = rr(r, 600, 1500);
      const o = ping(v, out, at, fr, rr(r, 0.012, 0.022), rr(r, 0.12, 0.25), 'sine', 0.002);
      o.frequency.setValueAtTime(fr * v.p, at);
      o.frequency.exponentialRampToValueAtTime(fr * rr(r, 1.4, 1.8) * v.p, at + 0.05);
    }
  },

  metal(v, out, t, _s, r) {
    tick(v, out, t, 2300, 1, 0.006, 0.9);
    thump(v, out, t, 170, 110, 0.02, 0.4, 0.03);
    // a grating / stair tread ringing briefly
    const base = rr(r, 480, 560);
    for (const [ratio, tau, lv] of [
      [1, 0.07, 0.28],
      [2.57, 0.05, 0.2],
      [4.3, 0.035, 0.12],
      [6.1, 0.02, 0.05],
    ] as const)
      ping(v, out, t, base * ratio, tau, lv, 'sine', 0.001);
  },
};

/** Schedules one step; returns the voice (already wired to `out`). */
export function playStep(v: Voice, out: AudioNode, t: number, surface: Surface, strength: number, r: () => number): void {
  const s = Math.min(1.3, Math.max(0.1, strength));
  // brightness follows strength: a gentle walk is duller than a run
  const tone = v.bq('lowpass', 2200 + 5200 * Math.min(1, s), 0.6);
  const level = v.gain((0.3 + 0.7 * s) * STEP_GAIN[surface] * rr(r, 0.85, 1.1));
  chain(tone, level, out);
  (STEPS[surface] ?? STEPS.wood)(v, tone, t, s, r);
}
