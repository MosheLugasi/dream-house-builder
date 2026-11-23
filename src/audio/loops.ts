/**
 * Switchable continuous sounds (TV, taps, appliances, fountain, swing). Each loop is built when first switched on,
 * follows its `volume` smoothly (the game updates it every frame for distance attenuation) and is freed a moment
 * after it faded out.
 */
import type { Loop } from './types';
import { Patch, Smooth, Voice, bakeDrops, chain, creak, mulberry32, perc, pick, ping, rr, swish, type Graph } from './util';

/** called from the scheduler with (now, horizon); may spawn one-shot voices into the loop's output */
type Events = (now: number, horizon: number) => void;
type Builder = (g: Graph, p: Patch, out: GainNode, now: number) => Events | void;

/** level trims, balanced from the self-test table */
export const LOOP_GAIN: Record<Loop, number> = {
  tv: 0.7,
  tap: 0.22,
  shower: 0.18,
  washing: 0.6,
  fan: 0.14,
  stove: 0.12,
  fountain: 0.24,
  swing: 1.4,
};

/** slow random modulation of a param (noise → low-pass → depth) */
function drift(p: Patch, param: AudioParam, cutoff: number, depth: number): void {
  chain(p.noise('brown'), p.bq('lowpass', cutoff, 0.7), p.gain(depth), param);
}

/**
 * Control tracks for the TV "speech": syllable loudness, voice pitch and two formants, baked at a low sample rate
 * into a 4-channel loop. Sentences alternate between a lower and a higher speaker.
 */
function bakeBabble(g: Graph): AudioBuffer {
  const hit = g.cache.get('babble');
  if (hit) return hit;
  const sr = 8000;
  const seconds = 11.3;
  const n = Math.floor(sr * seconds);
  const buf = g.ac.createBuffer(4, n, sr);
  const amp = buf.getChannelData(0);
  const f0 = buf.getChannelData(1);
  const f1 = buf.getChannelData(2);
  const f2 = buf.getChannelData(3);
  const r = mulberry32(4242);
  let t = 0.15;
  let pf0 = 150;
  let pf1 = 500;
  let pf2 = 1500;
  let filled = 0;
  const fillTo = (end: number, a0: number, a1: number, shape: boolean, nf0: number, nf1: number, nf2: number) => {
    const e = Math.min(n, Math.floor(end * sr));
    const len = Math.max(1, e - filled);
    for (let i = filled; i < e; i++) {
      const k = (i - filled) / len;
      amp[i] = shape ? a1 * Math.pow(Math.sin(Math.PI * k), 0.8) : a0 + (a1 - a0) * k;
      f0[i] = pf0 + (nf0 - pf0) * k;
      f1[i] = pf1 + (nf1 - pf1) * k;
      f2[i] = pf2 + (nf2 - pf2) * k;
    }
    filled = e;
    pf0 = nf0;
    pf1 = nf1;
    pf2 = nf2;
  };
  while (t < seconds - 1) {
    const base = pick(r, [112, 128, 196, 215]);
    const sentence = rr(r, 1.1, 2.8);
    const end = Math.min(t + sentence, seconds - 0.6);
    let k = 0;
    while (t < end) {
      const d = rr(r, 0.09, 0.21);
      const decl = 1.12 - 0.22 * (k / 8); // pitch declines along the sentence
      const stress = r() < 0.3 ? 1.12 : 1;
      const nf0 = base * decl * stress * rr(r, 0.94, 1.06);
      const nf1 = rr(r, 330, 820);
      const nf2 = rr(r, 950, 2100);
      // short gap (consonant) gliding to the next vowel, then the vowel itself
      fillTo(t, 0, 0, false, nf0, nf1, nf2);
      fillTo(t + d, 0, rr(r, 0.5, 1) * stress, true, nf0 * rr(r, 0.95, 1.03), nf1, nf2);
      t += d + rr(r, 0.02, 0.09);
      k++;
    }
    t += rr(r, 0.3, 0.8); // breath between sentences
  }
  fillTo(seconds, 0, 0, false, pf0, pf1, pf2);
  g.cache.set('babble', buf);
  return buf;
}

const BUILD: Record<Loop, Builder> = {
  tv(g, p, out, now) {
    // muffled speech-like babble through a small speaker
    const speaker = p.bq('lowpass', 1900, 0.6);
    chain(speaker, p.bq('highpass', 220, 0.6), out);
    const ctl = p.buffer(bakeBabble(g), now, undefined, true, g.rng() * 8);
    const split = p.add(g.ac.createChannelSplitter(4));
    ctl.connect(split);
    const voice = p.osc('sawtooth', 0);
    voice.frequency.value = 0;
    split.connect(voice.frequency, 1);
    const src = p.gain(1);
    chain(voice, p.gain(0.55), src);
    chain(p.noise('pink'), p.gain(0.9), src);
    const env = p.gain(0);
    split.connect(env.gain, 0);
    const fa = p.bq('bandpass', 500, 3);
    fa.frequency.value = 0;
    split.connect(fa.frequency, 2);
    const fb = p.bq('bandpass', 1500, 4);
    fb.frequency.value = 0;
    split.connect(fb.frequency, 3);
    chain(src, fa, env);
    chain(src, fb, p.gain(0.6), env);
    env.connect(speaker);
    // now and then a programme jingle: a few soft notes from a pentatonic scale
    let next = now + rr(g.rng, 3, 7);
    const scale = [523.25, 587.33, 659.25, 783.99, 880, 1046.5];
    return (t0, horizon) => {
      if (next < t0 - 1) next = t0;
      while (next < t0 + horizon) {
        const r = g.rng;
        const t = Math.max(next, t0 + 0.02);
        const v = p.adopt(new Voice(g, t));
        const n = 3 + Math.floor(r() * 4);
        let at = t;
        let idx = Math.floor(r() * scale.length);
        for (let i = 0; i < n; i++) {
          idx = Math.max(0, Math.min(scale.length - 1, idx + pick(r, [-2, -1, 1, 1, 2])));
          const f = scale[idx];
          ping(v, speaker, at, f, 0.14, 0.12, 'sine', 0.01);
          ping(v, speaker, at, f, 0.1, 0.05, 'triangle', 0.01);
          at += pick(r, [0.14, 0.14, 0.28]);
        }
        next = t + rr(r, 7, 17);
      }
    };
  },

  tap(g, p, dest) {
    // water has next to nothing below ~150 Hz
    const out = p.bq('highpass', 160, 0.6);
    out.connect(dest);
    // the stream itself: hiss + a gurgling resonance that never sits still
    chain(p.noise('white'), p.bq('highpass', 1100, 0.6), p.bq('bandpass', 2700, 0.6), p.bq('lowpass', 7000, 0.5), p.gain(0.55), out);
    const gur = p.bq('bandpass', 1150, 2.2);
    drift(p, gur.frequency, 14, 5200);
    chain(p.noise('white'), gur, p.gain(0.9), out);
    const gur2 = p.bq('bandpass', 640, 2.5);
    drift(p, gur2.frequency, 9, 2600);
    chain(p.noise('pink'), gur2, p.gain(0.8), out);
    // water drumming into the basin
    chain(p.noise('pink'), p.bq('bandpass', 330, 1), p.gain(0.5), out);
    const drops = bakeDrops(g, 'tap-bubbles', 3.1, 34, 'bubble');
    chain(p.buffer(drops, 0, undefined, true, g.rng() * 2), p.gain(0.3), out);
  },

  shower(g, p, dest) {
    const out = p.bq('highpass', 170, 0.6);
    out.connect(dest);
    // many fine jets: broad hiss, plus the patter on the floor
    chain(p.noise('white'), p.bq('highpass', 1700, 0.5), p.bq('lowpass', 6800, 0.5), p.gain(0.75), out);
    const pat = p.gain(0.8);
    drift(p, pat.gain, 22, 3.5);
    chain(p.noise('pink'), p.bq('bandpass', 620, 0.7), pat, out);
    const drops = bakeDrops(g, 'rain-drops', 5.3, 26, 'rain');
    chain(p.buffer(drops, 0, undefined, true, g.rng() * 4, 0.9), p.gain(0.5), out);
    chain(p.noise('pink'), p.bq('bandpass', 250, 0.8), p.gain(0.35), out);
  },

  washing(_g, p, out) {
    // motor + drum: soft hum whose loudness turns with the drum
    const hum = p.gain(0.6);
    const turn = p.osc('sine', 0.82);
    chain(turn, p.gain(0.25), hum.gain);
    chain(p.osc('sine', 100), p.gain(0.05), hum);
    chain(p.osc('sine', 150.4), p.gain(0.05), hum);
    chain(p.osc('sawtooth', 201), p.bq('lowpass', 520, 0.7), p.gain(0.035), hum);
    chain(p.noise('pink'), p.bq('bandpass', 240, 0.8), p.gain(0.5), hum);
    hum.connect(out);
    // water sloshing once per turn
    const slosh = p.gain(0.3);
    chain(turn, p.gain(0.28), slosh.gain);
    const sf = p.bq('bandpass', 560, 0.9);
    chain(turn, p.gain(170), sf.frequency);
    chain(p.noise('pink'), sf, slosh, out);
    chain(p.noise('white'), p.bq('bandpass', 2300, 0.6), p.gain(0.3), slosh);
    // the laundry falling: a dull thump every revolution
    const th = p.osc('sawtooth', 0.82);
    chain(th, p.bq('highpass', 30, 0.7), p.bq('bandpass', 84, 4), p.gain(0.5), out);
    chain(th, p.bq('highpass', 30, 0.7), p.bq('bandpass', 190, 3), p.gain(0.45), out);
  },

  fan(_g, p, out) {
    const blades = p.gain(1);
    chain(p.osc('sine', 12.5), p.gain(0.13), blades.gain);
    chain(p.osc('sine', 3.1), p.gain(0.06), blades.gain);
    chain(p.noise('pink'), p.bq('lowpass', 950, 0.5), p.bq('highpass', 200, 0.6), p.gain(1.3), blades);
    chain(p.noise('white'), p.bq('bandpass', 1900, 0.4), p.gain(0.22), blades);
    blades.connect(out);
    chain(p.osc('sine', 118), p.gain(0.035), out);
    chain(p.osc('sine', 236.4), p.gain(0.012), out);
  },

  stove(_g, p, out) {
    // gas hiss with a little low roar from the flame
    chain(p.noise('white'), p.bq('highpass', 2100, 0.5), p.bq('bandpass', 4300, 0.5), p.bq('lowpass', 7500, 0.5), p.gain(0.7), out);
    const roar = p.gain(0.45);
    drift(p, roar.gain, 16, 1.4);
    chain(p.noise('pink'), p.bq('bandpass', 260, 0.8), roar, out);
    chain(p.noise('pink'), p.bq('bandpass', 900, 0.6), p.gain(0.12), out);
  },

  fountain(g, p, dest) {
    const out = p.bq('highpass', 120, 0.6);
    out.connect(dest);
    // falling water: a broad wash, splashes that come and go, and lots of little bubbles
    const wash = p.bq('bandpass', 780, 0.8);
    drift(p, wash.frequency, 6, 2600);
    chain(p.noise('pink'), wash, p.gain(0.95), out);
    const spray = p.gain(0.3);
    drift(p, spray.gain, 9, 1.6);
    chain(p.noise('white'), p.bq('highpass', 2300, 0.5), p.bq('lowpass', 6500, 0.5), spray, out);
    const bub = bakeDrops(g, 'fountain-bubbles', 4.3, 55, 'bubble');
    chain(p.buffer(bub, 0, undefined, true, g.rng() * 3), p.gain(0.5), out);
    chain(p.buffer(bub, 0, undefined, true, g.rng() * 3 + 0.7, 0.77), p.gain(0.35), out);
    chain(p.noise('brown'), p.bq('bandpass', 190, 0.9), p.gain(0.6), out);
  },

  swing(g, p, out, now) {
    // nothing sounds between swings: a chain creak at each end of the arc and a breath of air through the middle
    const period = 2.7;
    let next = now + 0.05;
    let fwd = true;
    return (t0, horizon) => {
      if (next < t0 - 1) next = t0;
      while (next < t0 + horizon) {
        const r = g.rng;
        const t = Math.max(next, t0 + 0.02);
        const v = p.adopt(new Voice(g, t, rr(r, 0.96, 1.04)));
        const res: [number, number] = fwd ? [rr(r, 980, 1080), rr(r, 2150, 2350)] : [rr(r, 820, 900), rr(r, 1800, 1950)];
        const d = rr(r, 0.26, 0.36);
        creak(v, out, t, d, 0.5, fwd ? [34, 58, 50] : [52, 36, 30], res, 8);
        // the hanger knocking in its eye
        const k = v.gain(0);
        perc(k.gain, t + d * 0.5, 0.25, 0.002, 0.012);
        chain(v.noise('white', t, t + d + 0.1), v.bq('bandpass', 1500, 2), k, out);
        swish(v, out, t + 0.45, [300, 560, 340], 0.8, 1.1, 0.28, 'pink', 0.5);
        fwd = !fwd;
        next = t + (period / 2) * rr(r, 0.97, 1.03);
      }
    };
  },
};

interface Active {
  patch: Patch;
  gain: GainNode;
  smooth: Smooth;
  on: boolean;
  events: Events | void;
  /** when to free the patch after switching off */
  freeAt: number;
}

export class LoopSynth {
  private act = new Map<Loop, Active>();

  constructor(
    private readonly g: Graph,
    private readonly out: AudioNode,
  ) {}

  get count(): number {
    return this.act.size;
  }

  set(loop: Loop, on: boolean, volume: number, now: number): void {
    let a = this.act.get(loop);
    if (!a) {
      if (!on || !BUILD[loop]) return;
      const patch = new Patch(this.g);
      const gain = patch.gain(0);
      gain.gain.setValueAtTime(0, now);
      const trim = patch.gain(LOOP_GAIN[loop] ?? 1);
      chain(gain, trim, this.out);
      const events = BUILD[loop](this.g, patch, gain, now);
      a = { patch, gain, smooth: new Smooth(gain.gain, 0.09), on: true, events, freeAt: Infinity };
      this.act.set(loop, a);
    }
    a.on = on;
    if (on) {
      a.freeAt = Infinity;
      a.smooth.set(Math.min(1, Math.max(0, volume)), now, 0.09);
    } else if (a.freeAt === Infinity) {
      a.smooth.set(0, now, 0.14);
      a.freeAt = now + 1.3;
    }
  }

  allOff(now: number): void {
    for (const k of this.act.keys()) this.set(k, false, 0, now);
  }

  pump(now: number, horizon: number): void {
    for (const [k, a] of this.act) {
      if (a.on) a.events?.(now, horizon);
      else if (now >= a.freeAt) {
        a.patch.dispose();
        this.act.delete(k);
      }
    }
  }

  dispose(): void {
    for (const a of this.act.values()) a.patch.dispose();
    this.act.clear();
  }
}
