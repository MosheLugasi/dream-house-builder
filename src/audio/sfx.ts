/**
 * One-shot sound recipes. Each recipe receives a fresh `Voice`, an output node and a start time and schedules
 * everything up-front; the voice frees itself when its last source has stopped.
 *
 * Design rule: foley, not arcade – short filtered-noise transients, damped resonances, pitch glides.
 * Frequencies created through the voice (`v.osc`, `v.bq`) are scaled by the voice pitch automatically; explicit
 * frequency automation uses `v.p`.
 */
import type { Sfx } from './types';
import { Voice, chain, creak, expo, line, perc, ping, rr, swish, thump, tick } from './util';

export type Recipe = (v: Voice, out: AudioNode, t: number, r: () => number) => void;

export interface SfxInfo {
  /** linear trim applied after the recipe (balanced from the self-test measurements) */
  gain: number;
  /** triggers closer together than this (seconds) are dropped */
  minGap: number;
  /** the sound must have decayed below -60 dBFS by then (seconds) – asserted by the self-test */
  maxDur: number;
  /** random pitch spread per trigger (± fraction) */
  jitter: number;
}

// ---------------------------------------------------------------- helpers

/** Soft mallet / glockenspiel-like note used by the reward sounds. */
function chime(v: Voice, out: AudioNode, t: number, freq: number, tau: number, level: number, bright = 0.25): void {
  ping(v, out, t, freq, tau, level, 'sine', 0.004);
  ping(v, out, t, freq * 1.003, tau * 0.9, level * 0.5, 'sine', 0.004);
  ping(v, out, t, freq * 2, tau * 0.45, level * bright, 'sine', 0.003);
  ping(v, out, t, freq * 3.01, tau * 0.22, level * bright * 0.4, 'sine', 0.002);
}

/** A held note with attack / release, for horns and the fanfare. */
function held(
  v: Voice,
  out: AudioNode,
  t: number,
  type: OscillatorType,
  freq: number,
  dur: number,
  level: number,
  att: number,
  rel: number,
  scoop = 0,
): void {
  const o = v.osc(type, freq, t, t + dur + rel * 7 + 0.02);
  if (scoop > 0) {
    o.frequency.setValueAtTime(freq * v.p * (1 - scoop), t);
    o.frequency.setTargetAtTime(freq * v.p, t, 0.03);
  }
  const g = v.gain(0);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(level, t + att);
  g.gain.setTargetAtTime(level * 0.85, t + att, 0.15);
  g.gain.setTargetAtTime(0, t + dur, rel);
  chain(o, g, out);
}

/** Cloth: a band of noise with an irregular, lumpy envelope. */
function rustle(v: Voice, out: AudioNode, t: number, dur: number, freq: number, level: number, r: () => number, rise = 1): void {
  const n = v.noise('white', t, t + dur + 0.03);
  const f = v.bq('bandpass', freq, 0.8);
  expo(f.frequency, t, [
    [0, freq * 0.7 * v.p],
    [dur * 0.5, freq * (rise > 1 ? rise : 1.25) * v.p],
    [dur, freq * (rise > 1 ? rise * 1.1 : 0.8) * v.p],
  ]);
  const hp = v.bq('highpass', 450, 0.7);
  const g = v.gain(0);
  const lumps = 4;
  const pts: [number, number][] = [[0, 0]];
  for (let i = 1; i < lumps * 2; i++) {
    const hi = i % 2 === 1;
    pts.push([(dur * i) / (lumps * 2), level * (hi ? rr(r, 0.6, 1) : rr(r, 0.15, 0.4))]);
  }
  pts.push([dur, 0]);
  line(g.gain, t, pts);
  chain(n, f, hp, g, out);
}

interface Formant {
  /** [offset, Hz] */
  pts: readonly (readonly [number, number])[];
  q: number;
  gain: number;
}

/**
 * Tiny source–filter voice: sawtooth (+ breath noise, + optional sub-harmonic for roughness) through moving
 * band-pass "formants". Good enough for a friendly bark, a meow and a yawn.
 */
function vocal(
  v: Voice,
  out: AudioNode,
  t: number,
  dur: number,
  f0: readonly (readonly [number, number])[],
  formants: readonly Formant[],
  amp: readonly (readonly [number, number])[],
  o: { noise?: number; sub?: number; level: number; lp?: number; type?: OscillatorType; vibrato?: number },
): void {
  const end = t + dur + 0.03;
  const pre = v.gain(1);
  const src = v.osc(o.type ?? 'sawtooth', f0[0][1], t, end);
  expo(src.frequency, t, f0, v.p);
  chain(src, v.gain(0.5), pre);
  if (o.vibrato) {
    const lfo = v.osc('sine', 5.5 / v.p, t, end);
    chain(lfo, v.gain(o.vibrato * v.p), src.frequency);
  }
  if (o.sub) {
    const s = v.osc('sawtooth', f0[0][1] * 0.5, t, end);
    expo(s.frequency, t, f0, v.p * 0.5);
    chain(s, v.gain(0.5 * o.sub), pre);
  }
  if (o.noise) chain(v.noise('pink', t, end), v.gain(o.noise * 2), pre);
  const env = v.gain(0);
  line(env.gain, t, amp, o.level);
  const post = o.lp ? chain(v.bq('lowpass', o.lp, 0.7), env) : env;
  for (const fm of formants) {
    const f = v.bq('bandpass', fm.pts[0][1], fm.q);
    if (fm.pts.length > 1) expo(f.frequency, t, fm.pts, v.p);
    chain(pre, f, v.gain(fm.gain), post);
  }
  env.connect(out);
}

function oneBark(v: Voice, out: AudioNode, t: number, r: () => number, level: number, pitch: number): void {
  const d = rr(r, 0.1, 0.135);
  vocal(
    v,
    out,
    t,
    d,
    [
      [0, 430 * pitch],
      [0.022, 600 * pitch],
      [d, 330 * pitch],
    ],
    [
      { pts: [[0, 520], [0.03, 1000], [d, 720]], q: 3.5, gain: 1 },
      { pts: [[0, 1300], [0.03, 1850], [d, 1450]], q: 4.5, gain: 0.55 },
      { pts: [[0, 2700]], q: 5, gain: 0.18 },
    ],
    [
      [0, 0],
      [0.012, 1],
      [d * 0.45, 0.8],
      [d, 0],
    ],
    { noise: 0.22, sub: 0.7, level, lp: 3800 },
  );
  // a little chest thump under the bark
  thump(v, out, t, 230 * pitch, 170 * pitch, 0.018, level * 0.15, 0.05);
}

/** Exported for the night ambience ("a dog far away"). */
export function bark(v: Voice, out: AudioNode, t: number, r: () => number, count?: number): void {
  const n = count ?? (r() < 0.6 ? 2 : 1);
  const pitch = rr(r, 0.95, 1.1);
  let at = t;
  for (let i = 0; i < n; i++) {
    oneBark(v, out, at, r, i === 0 ? 1 : rr(r, 0.75, 0.95), pitch * (i === 0 ? 1 : rr(r, 0.94, 1.04)));
    at += rr(r, 0.21, 0.27);
  }
}

// ---------------------------------------------------------------- recipes

export const SFX: Record<Sfx, Recipe> = {
  click(v, out, t) {
    tick(v, out, t, 3000, 1.6, 0.003, 0.5);
    const o = ping(v, out, t, 1500, 0.011, 0.22, 'triangle', 0.001);
    o.frequency.setValueAtTime(1650 * v.p, t);
    o.frequency.exponentialRampToValueAtTime(1250 * v.p, t + 0.03);
  },

  place(v, out, t) {
    thump(v, out, t, 300, 150, 0.035, 0.75);
    tick(v, out, t, 1300, 1, 0.006, 0.6);
    ping(v, out, t, 520, 0.022, 0.1);
  },

  delete(v, out, t) {
    for (const [at, f, lv] of [
      [0, 620, 0.5],
      [0.085, 440, 0.4],
    ] as const) {
      const o = ping(v, out, t + at, f, 0.055, lv, 'sine', 0.006);
      o.frequency.setValueAtTime(f * v.p, t + at);
      o.frequency.exponentialRampToValueAtTime(f * 0.6 * v.p, t + at + 0.16);
      const o2 = ping(v, out, t + at, f * 0.5, 0.05, lv * 0.35, 'triangle', 0.006);
      o2.frequency.setValueAtTime(f * 0.5 * v.p, t + at);
      o2.frequency.exponentialRampToValueAtTime(f * 0.3 * v.p, t + at + 0.16);
    }
  },

  'door-open'(v, out, t, r) {
    // latch: tick, then the bolt sliding back
    tick(v, out, t, 2600, 3, 0.004, 0.7);
    ping(v, out, t, 1900, 0.012, 0.05);
    tick(v, out, t + 0.045, 1100, 2, 0.008, 0.7);
    thump(v, out, t + 0.045, 200, 140, 0.016, 0.15);
    // hinge and moving air
    const d = rr(r, 0.36, 0.46);
    creak(v, out, t + 0.1, d, 0.3, [rr(r, 38, 46), rr(r, 62, 80), rr(r, 48, 58)], [rr(r, 700, 860), rr(r, 1500, 1800)], 7);
    swish(v, out, t + 0.07, [280, 560, 340], 0.5, 0.9, 0.35, 'pink');
  },

  'door-close'(v, out, t) {
    swish(v, out, t, [330, 210], 0.09, 0.8, 0.25, 'pink', 0.7);
    const k = t + 0.055;
    thump(v, out, k, 120, 70, 0.045, 0.4);
    tick(v, out, k, 380, 0.7, 0.03, 0.4, 'brown', 'lowpass', 0.003);
    tick(v, out, k, 620, 1.1, 0.014, 0.9, 'pink');
    ping(v, out, k, 240, 0.035, 0.2);
    ping(v, out, k, 410, 0.02, 0.12);
    tick(v, out, k + 0.028, 2300, 2.5, 0.005, 0.5);
    ping(v, out, k + 0.028, 1750, 0.014, 0.04);
  },

  'door-slide'(v, out, t) {
    const d = 0.7;
    swish(v, out, t, [330, 640, 300], d, 0.9, 0.9, 'pink', 0.45);
    // rollers in the rail: low band with a flutter
    const n = v.noise('brown', t, t + d + 0.05);
    const f = v.bq('bandpass', 150, 1.2);
    const g = v.gain(0);
    line(g.gain, t, [
      [0, 0],
      [0.12, 0.55],
      [d * 0.8, 0.4],
      [d, 0],
    ]);
    const lfo = v.osc('sine', 21, t, t + d + 0.05);
    lfo.frequency.setValueAtTime(21, t);
    lfo.frequency.linearRampToValueAtTime(12, t + d);
    const trem = v.gain(1);
    chain(lfo, v.gain(0.45), trem.gain);
    chain(n, f, g, trem, out);
    // soft stop
    thump(v, out, t + d - 0.03, 135, 85, 0.03, 0.4);
    tick(v, out, t + d - 0.03, 900, 1.5, 0.008, 0.3);
  },

  'switch-on'(v, out, t) {
    tick(v, out, t, 2300, 2.5, 0.003, 0.6);
    ping(v, out, t, 1250, 0.006, 0.1, 'triangle', 0.001);
    tick(v, out, t + 0.022, 3300, 3, 0.0035, 0.9);
    ping(v, out, t + 0.022, 1900, 0.007, 0.08, 'triangle', 0.001);
    thump(v, out, t + 0.022, 240, 180, 0.008, 0.15, 0.02);
  },

  'switch-off'(v, out, t) {
    tick(v, out, t, 3000, 2.5, 0.003, 0.7);
    ping(v, out, t, 1700, 0.006, 0.08, 'triangle', 0.001);
    tick(v, out, t + 0.02, 1800, 2.5, 0.005, 0.8);
    ping(v, out, t + 0.02, 1000, 0.008, 0.1, 'triangle', 0.001);
    thump(v, out, t + 0.02, 200, 150, 0.01, 0.18, 0.02);
  },

  sit(v, out, t, r) {
    rustle(v, out, t, 0.28, 1700, 0.5, r);
    thump(v, out, t + 0.09, 100, 62, 0.045, 0.22);
    tick(v, out, t + 0.09, 320, 0.7, 0.035, 0.28, 'brown', 'lowpass', 0.006);
    tick(v, out, t + 0.09, 520, 0.8, 0.03, 0.35, 'pink', 'bandpass', 0.008);
  },

  stand(v, out, t, r) {
    rustle(v, out, t, 0.24, 1900, 0.45, r, 1.5);
    thump(v, out, t + 0.03, 125, 90, 0.03, 0.2);
  },

  jump(v, out, t) {
    tick(v, out, t, 900, 1, 0.012, 0.6);
    thump(v, out, t, 150, 90, 0.03, 0.4);
    swish(v, out, t + 0.01, [420, 1300], 0.17, 1, 0.45, 'white', 0.35);
  },

  land(v, out, t) {
    for (const [at, lv] of [
      [0, 1],
      [0.032, 0.6],
    ] as const) {
      thump(v, out, t + at, 130, 62, 0.05, lv * 0.45);
      tick(v, out, t + at, 520, 0.7, 0.035, lv * 0.4, 'brown', 'lowpass', 0.002);
      tick(v, out, t + at, 700, 1, 0.016, lv * 0.9, 'pink');
      tick(v, out, t + at, 1700, 0.8, 0.012, lv * 0.6);
    }
  },

  star(v, out, t, r) {
    // C6 E6 G6 C7 – a quick upward sparkle that rings out on the top note
    const notes = [1046.5, 1318.5, 1568, 2093];
    const step = rr(r, 0.052, 0.062);
    notes.forEach((f, i) => {
      const last = i === notes.length - 1;
      chime(v, out, t + i * step, f, last ? 0.28 : 0.1, last ? 0.55 : 0.4 + i * 0.03, 0.18);
    });
    // faint glissando underneath, like running a finger over a toy glockenspiel
    const o = v.osc('sine', 1046.5, t, t + 0.3);
    o.frequency.setValueAtTime(1046.5 * v.p, t);
    o.frequency.exponentialRampToValueAtTime(2093 * v.p, t + 0.2);
    const g = v.gain(0);
    line(g.gain, t, [
      [0, 0],
      [0.05, 0.07],
      [0.26, 0],
    ]);
    chain(o, g, out);
  },

  success(v, out, t) {
    const lp = v.bq('lowpass', 3200, 0.5);
    lp.connect(out);
    [523.25, 659.25, 783.99].forEach((f, i) => {
      const at = t + i * 0.115;
      const last = i === 2;
      const tau = last ? 0.32 : 0.16;
      ping(v, lp, at, f, tau, 0.5, 'sine', 0.008);
      ping(v, lp, at, f, tau * 0.8, 0.16, 'triangle', 0.008);
      ping(v, lp, at, f * 2, tau * 0.4, 0.08, 'sine', 0.006);
      ping(v, lp, at, f * 0.5, tau, 0.12, 'sine', 0.012);
    });
  },

  fanfare(v, out, t) {
    // "ta-ta-ta-taaa, ta-TAAA" in C major; soft brass (two detuned saws, low-passed) doubled by a glockenspiel
    const lp = v.bq('lowpass', 1900, 0.6);
    const hp = v.bq('highpass', 180, 0.7);
    chain(lp, hp, out);
    const G4 = 392;
    const C5 = 523.25;
    const E5 = 659.25;
    const G5 = 783.99;
    const C6 = 1046.5;
    const seq: [number, number, number, number][] = [
      [0, G4, 0.11, 0.8],
      [0.15, C5, 0.11, 0.8],
      [0.3, E5, 0.11, 0.85],
      [0.45, G5, 0.27, 1],
      [0.8, E5, 0.08, 0.8],
      [0.93, G5, 0.5, 1],
      [0.93, C5, 0.5, 0.6],
      [0.93, E5, 0.5, 0.55],
    ];
    for (const [at, f, d, lv] of seq) {
      held(v, lp, t + at, 'sawtooth', f, d, 0.14 * lv, 0.018, 0.05, 0.012);
      held(v, lp, t + at, 'sawtooth', f * 1.006, d, 0.1 * lv, 0.022, 0.05, 0.012);
    }
    chime(v, out, t + 0.45, G5, 0.16, 0.16, 0.15);
    chime(v, out, t + 0.93, C6, 0.3, 0.2, 0.15);
    chime(v, out, t + 0.93, G5, 0.3, 0.12, 0.15);
  },

  camera(v, out, t) {
    tick(v, out, t, 3000, 2, 0.004, 0.9);
    ping(v, out, t, 1400, 0.007, 0.1, 'triangle', 0.001);
    // the mechanism winding for a few hundredths of a second
    const o = v.osc('sawtooth', 230, t + 0.008, t + 0.075);
    const f = v.bq('bandpass', 1900, 1.2);
    const g = v.gain(0);
    line(g.gain, t + 0.008, [
      [0, 0],
      [0.008, 0.22],
      [0.045, 0.16],
      [0.058, 0],
    ]);
    chain(o, f, g, out);
    tick(v, out, t + 0.068, 2100, 2, 0.006, 0.8);
    thump(v, out, t + 0.068, 300, 200, 0.01, 0.15, 0.02);
  },

  whoosh(v, out, t) {
    swish(v, out, t, [320, 1500, 480], 0.38, 1.3, 1, 'white', 0.45);
    swish(v, out, t, [160, 600, 240], 0.38, 0.9, 0.7, 'pink', 0.5);
  },

  horn(v, out, t) {
    // small-car two-tone horn (≈ a major third), reedy but band-limited
    const lp = v.bq('lowpass', 2300, 0.9);
    const hp = v.bq('highpass', 320, 0.7);
    chain(lp, hp, out);
    const d = 0.34;
    for (const f of [415, 520]) {
      held(v, lp, t, 'sawtooth', f, d, 0.2, 0.012, 0.03);
      held(v, lp, t, 'square', f * 1.004, d, 0.1, 0.012, 0.03);
    }
  },

  'bus-horn'(v, out, t) {
    // air horn: lower, slower to speak, with a pitch scoop and a little breath
    const lp = v.bq('lowpass', 1800, 0.8);
    const hp = v.bq('highpass', 150, 0.7);
    chain(lp, hp, out);
    const d = 0.62;
    for (const f of [185, 233]) {
      held(v, lp, t, 'sawtooth', f, d, 0.26, 0.05, 0.06, 0.035);
      held(v, lp, t, 'sawtooth', f * 1.007, d, 0.18, 0.06, 0.06, 0.035);
    }
    swish(v, lp, t, [900, 1200, 1000], d + 0.15, 0.7, 0.25, 'pink', 0.2);
  },

  'bike-bell'(v, out, t, r) {
    const f = rr(r, 1850, 1950);
    const gap = rr(r, 0.16, 0.19);
    for (const [at, lv] of [
      [0, 0.8],
      [gap, 1],
    ] as const) {
      const s = t + at;
      tick(v, out, s, 3600, 2, 0.0025, 0.35 * lv);
      ping(v, out, s, f, 0.3, 0.45 * lv, 'sine', 0.001);
      ping(v, out, s, f * 1.0045, 0.28, 0.3 * lv, 'sine', 0.001);
      ping(v, out, s, f * 2.32, 0.12, 0.16 * lv, 'sine', 0.001);
      ping(v, out, s, f * 3.86, 0.05, 0.05 * lv, 'sine', 0.001);
      ping(v, out, s, f * 0.502, 0.2, 0.08 * lv, 'sine', 0.002);
    }
  },

  splash(v, out, t, r) {
    // body of water displaced, the spray, then drops falling back
    thump(v, out, t, 180, 80, 0.05, 0.4);
    tick(v, out, t, 480, 0.7, 0.06, 0.9, 'pink', 'lowpass', 0.008);
    const n = v.noise('white', t, t + 0.75);
    const f = v.bq('bandpass', 900, 0.7);
    expo(f.frequency, t, [
      [0, 800 * v.p],
      [0.12, 2600 * v.p],
      [0.6, 1500 * v.p],
    ]);
    const g = v.gain(0);
    line(g.gain, t, [
      [0, 0],
      [0.02, 1.5],
      [0.15, 0.7],
      [0.7, 0],
    ]);
    chain(n, f, g, out);
    const drops = 7;
    for (let i = 0; i < drops; i++) {
      const at = t + rr(r, 0.12, 0.62);
      const fr = rr(r, 700, 2100);
      const o = ping(v, out, at, fr, rr(r, 0.012, 0.03), rr(r, 0.08, 0.22), 'sine', 0.002);
      o.frequency.setValueAtTime(fr * v.p, at);
      o.frequency.exponentialRampToValueAtTime(fr * rr(r, 1.4, 1.9) * v.p, at + 0.06);
    }
  },

  flush(v, out, t, r) {
    // lever
    tick(v, out, t, 1200, 2, 0.01, 0.6);
    thump(v, out, t, 180, 120, 0.02, 0.3);
    // rush of water
    const n = v.noise('pink', t, t + 3.3);
    const f = v.bq('bandpass', 700, 0.6);
    expo(f.frequency, t, [
      [0.03, 500],
      [0.35, 1400],
      [1.4, 1000],
      [2.4, 520],
    ]);
    const g = v.gain(0);
    line(g.gain, t, [
      [0.03, 0],
      [0.18, 1.8],
      [1.2, 1.5],
      [1.9, 0.7],
      [2.5, 0.22],
      [3.2, 0],
    ]);
    chain(n, f, g, out);
    const hi = v.noise('white', t, t + 2.2);
    const hf = v.bq('highpass', 2500, 0.7);
    const hl = v.bq('lowpass', 6500, 0.7);
    const hg = v.gain(0);
    line(hg.gain, t, [
      [0.03, 0],
      [0.25, 0.3],
      [1.3, 0.22],
      [2.1, 0],
    ]);
    chain(hi, hf, hl, hg, out);
    // the gurgle as the bowl empties: a resonance whose pitch wobbles faster and faster
    const gn = v.noise('pink', t + 1.3, t + 2.9);
    const gf = v.bq('bandpass', 420, 5);
    const lfo = v.osc('sine', 6, t + 1.3, t + 2.9);
    lfo.frequency.setValueAtTime(6, t + 1.3);
    lfo.frequency.linearRampToValueAtTime(13, t + 2.7);
    chain(lfo, v.gain(190), gf.frequency);
    const gg = v.gain(0);
    line(gg.gain, t, [
      [1.3, 0],
      [1.75, 2.6],
      [2.4, 2.0],
      [2.85, 0],
    ]);
    chain(gn, gf, gg, out);
    for (let i = 0; i < 6; i++) {
      const at = t + rr(r, 1.7, 2.7);
      const fr = rr(r, 130, 260);
      const o = ping(v, out, at, fr, 0.03, rr(r, 0.2, 0.4), 'sine', 0.006);
      o.frequency.setValueAtTime(fr, at);
      o.frequency.exponentialRampToValueAtTime(fr * 1.7, at + 0.09);
    }
  },

  bell(v, out, t) {
    // a small hand / school bell: classic bell partial ratios (hum, prime, tierce, quint, nominal, …)
    const f = 784;
    tick(v, out, t, 3200, 1.5, 0.003, 0.4);
    const partials: [number, number, number][] = [
      [0.5, 0.2, 0.6],
      [1, 1, 0.42],
      [1.183, 0.5, 0.34],
      [1.506, 0.28, 0.27],
      [2, 0.55, 0.22],
      [2.514, 0.18, 0.15],
      [3.011, 0.2, 0.12],
      [4.166, 0.08, 0.07],
    ];
    for (const [ratio, lv, tau] of partials) ping(v, out, t, f * ratio, tau * 0.75, lv * 0.34, 'sine', 0.002);
    ping(v, out, t, f * 1.004, 0.3, 0.12, 'sine', 0.002);
  },

  squeak(v, out, t, r) {
    // dry playground hinge: "eee-uh"
    const a = rr(r, 520, 600);
    creak(v, out, t, 0.2, 0.5, [a, a * 1.22, a * 1.1], [1350, 2700], 5);
    creak(v, out, t + 0.27, 0.16, 0.32, [a * 1.05, a * 0.86], [1250, 2500], 5);
  },

  kick(v, out, t) {
    thump(v, out, t, 170, 75, 0.04, 0.55);
    tick(v, out, t, 1100, 0.8, 0.008, 1.3);
    tick(v, out, t, 480, 1, 0.014, 0.8, 'pink');
    ping(v, out, t, 310, 0.03, 0.35);
  },

  bounce(v, out, t) {
    thump(v, out, t, 240, 125, 0.05, 0.8, 0.07);
    const o = ping(v, out, t, 420, 0.045, 0.28);
    o.frequency.setValueAtTime(430 * v.p, t);
    o.frequency.exponentialRampToValueAtTime(380 * v.p, t + 0.08);
    tick(v, out, t, 800, 0.8, 0.006, 0.5);
  },

  goal(v, out, t, r) {
    // referee whistle with its pea trill
    const w = v.osc('sine', 2250, t, t + 0.42);
    const wg = v.gain(0);
    line(wg.gain, t, [
      [0, 0],
      [0.02, 0.13],
      [0.3, 0.12],
      [0.38, 0],
    ]);
    const trem = v.gain(1);
    chain(v.osc('sine', 36, t, t + 0.42), v.gain(0.45), trem.gain);
    chain(w, wg, trem, out);
    chain(v.osc('sine', 2250 * 1.5, t, t + 0.42), v.gain(0.12), wg);
    // the crowd: broad vowel-ish noise that swells, flutters and falls away
    const end = t + 2.3;
    const n = v.noise('pink', t + 0.1, end);
    const crowd = v.gain(0);
    line(crowd.gain, t + 0.1, [
      [0, 0],
      [0.22, 1],
      [0.7, 0.85],
      [2.1, 0],
    ]);
    const flutter = v.gain(1);
    chain(v.osc('sine', 5.3, t, end), v.gain(0.12), flutter.gain);
    chain(v.osc('sine', 7.7, t, end), v.gain(0.1), flutter.gain);
    for (const [fr, q, lv] of [
      [750, 0.9, 2.2],
      [1250, 1.2, 1.6],
      [2400, 1.5, 0.6],
    ] as const) {
      const f = v.bq('bandpass', fr, q);
      expo(f.frequency, t + 0.1, [
        [0, fr * 0.8],
        [0.4, fr * 1.1],
        [2.1, fr * 0.85],
      ]);
      chain(n, f, v.gain(lv), crowd);
    }
    // a few "voices" inside the crowd: saws gliding up into the cheer
    const vf = v.bq('bandpass', 1000, 1.2);
    chain(vf, v.gain(0.5), crowd);
    const vf2 = v.bq('bandpass', 2600, 2);
    chain(vf2, v.gain(0.25), crowd);
    for (let i = 0; i < 5; i++) {
      const f0 = rr(r, 210, 430);
      const o = v.osc('sawtooth', f0, t + 0.1, end);
      expo(o.frequency, t + 0.1, [
        [0, f0 * 0.85],
        [rr(r, 0.25, 0.5), f0 * rr(r, 1.2, 1.45)],
        [2.1, f0 * rr(r, 0.9, 1.1)],
      ]);
      const vib = v.osc('sine', rr(r, 4.5, 7), t + 0.1, end);
      chain(vib, v.gain(f0 * 0.03), o.frequency);
      const og = v.gain(0.3);
      chain(o, og, vf);
      og.connect(vf2);
    }
    chain(crowd, v.bq('highpass', 260, 0.7), flutter, out);
  },

  bark(v, out, t, r) {
    bark(v, out, t, r);
  },

  meow(v, out, t, r) {
    const d = rr(r, 0.62, 0.8);
    vocal(
      v,
      out,
      t,
      d,
      [
        [0, 490],
        [d * 0.14, 610],
        [d * 0.3, 705],
        [d * 0.48, 715],
        [d * 0.66, 660],
        [d * 0.85, 560],
        [d, 450],
      ],
      [
        { pts: [[0, 420], [d * 0.3, 950], [d * 0.7, 800], [d, 480]], q: 4, gain: 1 },
        { pts: [[0, 1500], [d * 0.3, 2350], [d * 0.7, 1750], [d, 1100]], q: 5, gain: 0.9 },
        { pts: [[0, 3100]], q: 5, gain: 0.25 },
      ],
      [
        [0, 0],
        [0.07, 0.55],
        [d * 0.32, 1],
        [d * 0.7, 0.75],
        [d, 0],
      ],
      { noise: 0.05, level: 1, lp: 3600, vibrato: 7 },
    );
  },

  purr(v, out, t, r) {
    // glottal pulses at ~25 Hz through a small chest, breathing in and out once
    const d = 1.7;
    const o = v.osc('sawtooth', rr(r, 23, 26), t, t + d + 0.05);
    o.frequency.setValueAtTime(24.5, t);
    o.frequency.linearRampToValueAtTime(27, t + 0.7);
    o.frequency.setValueAtTime(22, t + 0.85);
    o.frequency.linearRampToValueAtTime(24, t + d);
    const env = v.gain(0);
    line(env.gain, t, [
      [0, 0],
      [0.25, 1],
      [0.62, 0.9],
      [0.78, 0.25],
      [0.95, 0.8],
      [1.4, 0.7],
      [d, 0],
    ]);
    const hp = v.bq('highpass', 130, 0.7);
    o.connect(hp);
    for (const [fr, q, lv] of [
      [190, 1.6, 0.4],
      [400, 2, 0.9],
      [830, 2.2, 0.45],
    ] as const)
      chain(hp, v.bq('bandpass', fr, q), v.gain(lv), env);
    const n = v.noise('brown', t, t + d + 0.05);
    const breath = v.gain(1);
    chain(o, v.gain(0.8), breath.gain);
    chain(n, v.bq('bandpass', 420, 0.8), v.gain(0.9), breath, env);
    env.connect(out);
  },

  yawn(v, out, t, r) {
    const d = rr(r, 1.1, 1.3);
    vocal(
      v,
      out,
      t,
      d,
      [
        [0, 200],
        [d * 0.33, 335],
        [d * 0.6, 290],
        [d, 150],
      ],
      [
        { pts: [[0, 480], [d * 0.35, 840], [d, 430]], q: 3, gain: 1 },
        { pts: [[0, 1000], [d * 0.35, 1280], [d, 800]], q: 4, gain: 0.45 },
        { pts: [[0, 2600]], q: 4, gain: 0.08 },
      ],
      [
        [0, 0],
        [d * 0.15, 0.45],
        [d * 0.4, 1],
        [d * 0.75, 0.5],
        [d, 0],
      ],
      { noise: 0.18, level: 1, lp: 2200, vibrato: 3 },
    );
    // the breath out at the end
    swish(v, out, t + d * 0.55, [900, 600], d * 0.6, 0.6, 0.5, 'pink', 0.3);
  },
};

const info = (gain: number, minGap: number, maxDur: number, jitter = 0.04): SfxInfo => ({ gain, minGap, maxDur, jitter });

/** Level trims (set from `tools/audio-preview` measurements), retrigger guards and expected lengths. */
export const SFX_INFO: Record<Sfx, SfxInfo> = {
  click: info(0.44, 0.03, 0.2, 0.03),
  place: info(0.48, 0.05, 0.4, 0.06),
  delete: info(0.34, 0.08, 0.7, 0.02),
  'door-open': info(1.5, 0.2, 1.0, 0.05),
  'door-close': info(0.6, 0.2, 0.7, 0.05),
  'door-slide': info(0.92, 0.3, 1.1, 0.04),
  'switch-on': info(0.72, 0.05, 0.25, 0.04),
  'switch-off': info(0.78, 0.05, 0.25, 0.04),
  sit: info(0.74, 0.2, 0.7, 0.06),
  stand: info(0.74, 0.2, 0.6, 0.06),
  jump: info(0.74, 0.15, 0.5, 0.05),
  land: info(0.85, 0.12, 0.6, 0.05),
  star: info(0.235, 0.08, 2.2, 0.015),
  success: info(0.3, 0.25, 2.6, 0),
  fanfare: info(0.68, 0.6, 3.0, 0),
  camera: info(0.71, 0.15, 0.3, 0.02),
  whoosh: info(0.82, 0.12, 0.6, 0.08),
  horn: info(0.74, 0.3, 0.8, 0.01),
  'bus-horn': info(0.6, 0.5, 1.3, 0.01),
  'bike-bell': info(0.38, 0.3, 2.6, 0.01),
  splash: info(0.66, 0.2, 1.0, 0.08),
  flush: info(0.39, 2.5, 3.6, 0.03),
  bell: info(0.57, 0.25, 4.0, 0.01),
  squeak: info(0.51, 0.25, 0.7, 0.07),
  kick: info(0.52, 0.07, 0.5, 0.07),
  bounce: info(0.41, 0.07, 0.5, 0.07),
  goal: info(0.35, 1.5, 2.6, 0.03),
  bark: info(1.04, 0.35, 0.8, 0.06),
  meow: info(0.66, 0.5, 1.1, 0.06),
  purr: info(0.4, 1.2, 2.0, 0.04),
  yawn: info(0.71, 0.8, 1.8, 0.05),
};
