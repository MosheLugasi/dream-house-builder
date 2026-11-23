/**
 * Additive piano-ish note: stretched (inharmonic) partials, a fast attack, a two-stage decay, a low-pass that
 * closes while the note rings, a slightly detuned second "string" on the low partials and a soft hammer thunk.
 */
import { Voice, chain, clamp, midiToHz, rr, tick } from './util';

/** Schedules the note and returns a function that damps it early (voice stealing). */
export function pianoNote(v: Voice, out: AudioNode, t: number, midi: number, duration: number, r: () => number): (at: number) => void {
  const m = clamp(midi, 21, 108);
  const f = midiToHz(m);
  const dur = clamp(duration, 0.08, 8);
  // register scaling: high notes are shorter, duller in partial count and a bit softer
  const reg = clamp((m - 21) / 87, 0, 1);
  const tau1 = 0.16 - 0.1 * reg; // prompt sound
  const tau2 = 2.6 * Math.pow(0.5, (m - 36) / 18); // after-sound, halves every 1.5 octaves
  const sustain = 0.38;
  const B = 0.00018 * Math.pow(2, (m - 48) / 14); // inharmonicity grows with pitch
  const release = t + dur;
  const rel = 0.07 + 0.08 * (1 - reg);
  const end = release + rel * 7;
  const level = 0.5 * (1 - 0.35 * reg) * (m < 40 ? 1 + (40 - m) * 0.012 : 1);

  const lp = v.bq('lowpass', 1000, 0.5);
  const open = clamp(f * 14, 1800, 9000);
  const closed = clamp(f * 3.2, 500, 5000);
  lp.frequency.setValueAtTime(open, t);
  lp.frequency.setTargetAtTime(closed, t + 0.01, 0.25 + 0.5 * (1 - reg));

  const amp = v.gain(0);
  const att = 0.003 + 0.004 * (1 - reg);
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(level, t + att);
  amp.gain.setTargetAtTime(level * sustain, t + att, tau1);
  const stage2 = t + att + tau1 * 2.5;
  if (stage2 < release) amp.gain.setTargetAtTime(0, stage2, tau2);
  amp.gain.setTargetAtTime(0, release, rel);
  // an all-pass spreads the partials' phases (they all start at zero): same tone, much lower attack peak
  chain(lp, v.bq('allpass', clamp(f * 2.6, 200, 6000), 0.7), amp, out);

  const nyq = Math.min(7000, v.ac.sampleRate * 0.4);
  const maxPartials = m < 48 ? 9 : m < 72 ? 7 : 4;
  for (let n = 1; n <= maxPartials; n++) {
    const fn = n * f * Math.sqrt(1 + B * n * n);
    if (fn > nyq) break;
    // hammer position (~1/8 of the string) carves a comb into the spectrum
    const comb = Math.abs(Math.sin((n * Math.PI) / 8)) * 0.8 + 0.2;
    const a = (comb / Math.pow(n, 1.15)) * (n === 1 ? 1 : 0.9);
    const o = v.osc('sine', fn, t, end);
    // higher partials die sooner: each has its own extra decay
    const g = v.gain(a);
    if (n > 1) g.gain.setTargetAtTime(a * 0.12, t + 0.004, (1.1 * tau2) / (n * 0.9));
    chain(o, g, lp);
    if (n <= 2) {
      // second string, a cent or so off: slow beating and the characteristic two-stage decay
      const o2 = v.osc('sine', fn, t, end);
      o2.detune.value = rr(r, 1.2, 2.4) * (r() < 0.5 ? -1 : 1);
      chain(o2, v.gain(a * 0.55), lp);
    }
  }
  // hammer felt hitting the string
  tick(v, amp, t, clamp(f * 5, 700, 3200), 0.7, 0.006, 0.35 + 0.25 * reg, 'pink', 'bandpass', 0.001);

  return (at: number) => {
    if (v.disposed) return;
    amp.gain.cancelScheduledValues(at);
    amp.gain.setTargetAtTime(0, at, 0.035);
  };
}
