/**
 * The ambient bed. Outdoor layers (birds by day, crickets + a distant owl / dog by night, wind, rain) are summed
 * into one "outdoor" bus that is low-passed and attenuated the further indoors the listener is; indoors a faint
 * room tone takes over. All levels glide with a ~1 s response.
 *
 * Event-like sounds (bird phrases, owl, gusts) are scheduled a fraction of a second ahead from `pump()`.
 */
import type { Ambience } from './types';
import { bark } from './sfx';
import { Patch, Smooth, Voice, bakeDrops, chain, clamp, gentleHarmonics, lerp, mulberry32, pick, rr, type Graph } from './util';

const TAU = 0.33; // ≈ 1 s to settle

// ---------------------------------------------------------------- birds

/** One bird = one oscillator whose pitch and loudness are automated note by note. */
class Phrase {
  private readonly o: OscillatorNode;
  private readonly g: GainNode;
  private last: number;
  constructor(
    private readonly v: Voice,
    out: AudioNode,
    private readonly t0: number,
    maxLen: number,
    pure = false,
  ) {
    this.o = v.osc('sine', 1000, t0, t0 + maxLen + 0.05);
    this.g = v.gain(0);
    this.g.gain.setValueAtTime(0, t0);
    this.last = t0;
    if (pure) chain(this.o, this.g, out);
    else chain(this.o, v.shaper(gentleHarmonics()), this.g, out);
  }
  /** a note gliding through `freqs`; returns its end time */
  note(at: number, dur: number, freqs: readonly number[], level: number, soft = 0.25): number {
    const t = Math.max(at, this.last + 0.004);
    const f = this.o.frequency;
    f.setValueAtTime(freqs[0], t);
    for (let i = 1; i < freqs.length; i++) f.exponentialRampToValueAtTime(freqs[i], t + (dur * i) / (freqs.length - 1));
    const a = Math.min(dur * soft, 0.03);
    const gp = this.g.gain;
    gp.setValueAtTime(0, t);
    gp.linearRampToValueAtTime(level, t + a);
    gp.linearRampToValueAtTime(level * 0.8, t + dur - a);
    gp.linearRampToValueAtTime(0, t + dur);
    this.last = t + dur;
    return this.last;
  }
}

type Bird = (v: Voice, out: AudioNode, t: number, r: () => number) => void;

const BIRDS: { weight: number; level?: number; sing: Bird }[] = [
  {
    // house sparrow: a handful of bright down-slurred chirps
    weight: 3,
    sing(v, out, t, r) {
      const ph = new Phrase(v, out, t, 1.6);
      const n = 2 + Math.floor(r() * 4);
      const base = rr(r, 3300, 4300);
      let at = t;
      for (let i = 0; i < n; i++) {
        const f = base * rr(r, 0.93, 1.07);
        const up = r() < 0.3;
        const d = rr(r, 0.045, 0.075);
        at = ph.note(at, d, up ? [f * 0.8, f, f * 0.7] : [f, f * rr(r, 0.62, 0.75)], rr(r, 0.6, 1)) + rr(r, 0.07, 0.19);
      }
    },
  },
  {
    // great tit: "tea-cher, tea-cher"
    weight: 2,
    sing(v, out, t, r) {
      const ph = new Phrase(v, out, t, 1.8);
      const a = rr(r, 3300, 4100);
      const b = a * rr(r, 0.72, 0.8);
      const reps = 2 + Math.floor(r() * 3);
      let at = t;
      for (let i = 0; i < reps; i++) {
        at = ph.note(at, 0.09, [a, a * 0.98], 0.9) + 0.03;
        at = ph.note(at, 0.11, [b, b * 0.97], 0.8) + rr(r, 0.06, 0.09);
      }
    },
  },
  {
    // blackbird: unhurried, mellow, fluting phrase
    weight: 3,
    sing(v, out, t, r) {
      const ph = new Phrase(v, out, t, 2.6);
      const n = 4 + Math.floor(r() * 4);
      let at = t;
      let f = rr(r, 1700, 2500);
      for (let i = 0; i < n; i++) {
        f = clamp(f * rr(r, 0.75, 1.35), 1400, 3100);
        const d = rr(r, 0.1, 0.22);
        const shape = r();
        const fr = shape < 0.35 ? [f, f * 1.18] : shape < 0.7 ? [f * 1.1, f * 0.85] : [f, f * 1.12, f * 0.96, f * 1.08];
        at = ph.note(at, d, fr, rr(r, 0.7, 1), 0.3) + rr(r, 0.02, 0.09);
      }
    },
  },
  {
    // a small warbler's trill
    weight: 2,
    level: 0.7,
    sing(v, out, t, r) {
      const ph = new Phrase(v, out, t, 1.5);
      const f = rr(r, 3200, 4600);
      const rate = rr(r, 14, 23);
      const n = 8 + Math.floor(r() * 10);
      let at = t;
      for (let i = 0; i < n; i++) {
        const k = i / (n - 1);
        const lv = 0.45 + 0.5 * Math.sin(Math.PI * k);
        const drift = 1 - 0.08 * k;
        at = ph.note(at, 0.62 / rate, [f * 1.14 * drift, f * 0.9 * drift], lv, 0.3) + 0.38 / rate;
      }
    },
  },
  {
    // laughing / collared dove: soft "coo-COOO-coo", sometimes twice
    weight: 3,
    level: 1.5, // low voices need more level to read as equally loud
    sing(v, out, t, r) {
      const ph = new Phrase(v, out, t, 3.2, true);
      const f = rr(r, 430, 520);
      const reps = r() < 0.5 ? 2 : 1;
      let at = t;
      for (let i = 0; i < reps; i++) {
        at = ph.note(at, 0.2, [f, f * 1.05], 0.75, 0.3) + 0.09;
        at = ph.note(at, 0.44, [f * 1.1, f * 1.12, f * 1.02], 1, 0.3) + 0.11;
        at = ph.note(at, 0.24, [f * 0.99, f * 0.93], 0.7, 0.3) + rr(r, 0.45, 0.7);
      }
    },
  },
  {
    // bulbul: liquid "pi-yu-pi" whistles
    weight: 2,
    sing(v, out, t, r) {
      const ph = new Phrase(v, out, t, 1.4);
      const n = 3 + Math.floor(r() * 2);
      const base = rr(r, 1900, 2600);
      let at = t;
      for (let i = 0; i < n; i++) {
        const f = base * (i % 2 === 0 ? 1 : rr(r, 0.74, 0.84));
        at = ph.note(at, rr(r, 0.11, 0.17), i % 2 === 0 ? [f * 0.85, f * 1.12, f] : [f * 1.1, f * 0.9], rr(r, 0.75, 1), 0.3) + rr(r, 0.03, 0.06);
      }
    },
  },
  {
    // hoopoe: three hollow, low "oop-oop-oop"
    weight: 1,
    level: 1.4,
    sing(v, out, t, r) {
      const ph = new Phrase(v, out, t, 2.2, true);
      const f = rr(r, 500, 560);
      const reps = r() < 0.4 ? 2 : 1;
      let at = t;
      for (let k = 0; k < reps; k++) {
        for (let i = 0; i < 3; i++) at = ph.note(at, 0.11, [f * 0.97, f, f * 0.98], 0.85, 0.35) + 0.13;
        at += 0.35;
      }
    },
  },
];

function owl(v: Voice, out: AudioNode, t: number, r: () => number): void {
  const ph = new Phrase(v, out, t, 2.6, true);
  const f = rr(r, 330, 380);
  let at = ph.note(t, 0.34, [f * 0.96, f, f * 0.95], 0.8, 0.4) + rr(r, 0.5, 0.7);
  at = ph.note(at, 0.16, [f * 0.97, f], 0.6, 0.4) + 0.07;
  at = ph.note(at, 0.16, [f * 0.97, f], 0.65, 0.4) + 0.07;
  ph.note(at, 0.5, [f, f * 1.01, f * 0.9], 0.9, 0.4);
}

/** A cricket: 3–4 pulses of a ~4 kHz tone, a pause, repeat. Baked as a seamless loop (cheap: one buffer source). */
function bakeCricket(g: Graph, idx: number): AudioBuffer {
  const key = `cricket${idx}`;
  const hit = g.cache.get(key);
  if (hit) return hit;
  const r = mulberry32(977 + idx * 131);
  const sr = 22050;
  const carrier = [3900, 4350, 3550][idx % 3] * rr(r, 0.98, 1.02);
  const period = [0.52, 0.71, 0.9][idx % 3];
  const chirps = 6;
  const n = Math.floor(sr * period * chirps);
  const buf = g.ac.createBuffer(1, n, sr);
  const d = buf.getChannelData(0);
  const pulses = 3 + (idx % 2);
  const pulseLen = 0.013;
  const pulseGap = 0.021;
  for (let c = 0; c < chirps; c++) {
    const start = c * period + rr(r, 0, 0.04);
    const lv = rr(r, 0.7, 1);
    for (let k = 0; k < pulses; k++) {
      const s0 = Math.floor((start + k * pulseGap) * sr);
      const len = Math.floor(pulseLen * sr);
      const acc = 0.6 + (0.4 * k) / (pulses - 1);
      for (let i = 0; i < len && s0 + i < n; i++) {
        const w = Math.sin((Math.PI * i) / len);
        d[s0 + i] += Math.sin((2 * Math.PI * carrier * (s0 + i)) / sr) * w * w * lv * acc * 0.5;
      }
    }
  }
  g.cache.set(key, buf);
  return buf;
}

// ---------------------------------------------------------------- the bed

interface Bed {
  patch: Patch;
  master: GainNode;
  birds: GainNode;
  night: GainNode;
  crickets: { gain: GainNode; next: number; level: number }[];
  windGain: GainNode;
  windF: BiquadFilterNode;
  sOutLp: Smooth;
  sOutGain: Smooth;
  sRoom: Smooth;
  sBirds: Smooth;
  sNight: Smooth;
  sRain: Smooth;
  sRainLow: Smooth;
  sDrops: Smooth;
  sRoof: Smooth;
}

export class AmbienceSynth {
  private bed: Bed | null = null;
  private target: Required<Ambience> = { outdoor: 1, night: 0, wind: 0.15, rain: 0 };
  private on = false;
  private offAt = Infinity;
  private nextBird = 0;
  private nextNight = 0;
  private nextWind = 0;
  private windLevel = 0;

  constructor(
    private readonly g: Graph,
    private readonly out: AudioNode,
  ) {}

  get active(): boolean {
    return this.bed !== null;
  }

  private build(now: number): Bed {
    const g = this.g;
    const p = new Patch(g);
    const master = p.gain(0);
    master.connect(this.out);

    // outdoor bus → "wall" (low-pass + attenuation) → master
    const outdoor = p.gain(1);
    const wall = p.bq('lowpass', 16000, 0.5);
    const outGain = p.gain(0);
    chain(outdoor, wall, outGain, master);

    // room tone: the quiet hum of a house
    const room = p.gain(0);
    chain(p.noise('brown'), p.bq('lowpass', 600, 0.5), p.bq('highpass', 90, 0.5), room, master);

    // birds (voices are attached per phrase)
    const birds = p.gain(0);
    chain(birds, p.bq('lowpass', 6500, 0.5), outdoor);

    // night creatures
    const night = p.gain(0);
    night.connect(outdoor);
    const crickets = [0, 1, 2].map((i) => {
      const gain = p.gain(0);
      const src = p.buffer(bakeCricket(g, i), now, undefined, true, 0, rr(g.rng, 0.97, 1.03));
      chain(src, gain, p.pan([-0.6, 0.5, 0.1][i]), night);
      return { gain, next: now, level: 0 };
    });

    // wind: two decorrelated bands (left / right), slowly breathing
    const windGain = p.gain(0);
    const windF = p.bq('bandpass', 420, 0.6);
    chain(p.noise('pink'), windF, windGain, p.bq('highpass', 160, 0.6), p.pan(-0.35), outdoor);
    chain(p.noise('pink'), p.bq('bandpass', 900, 0.5), p.gain(0.5), windGain);
    const windGainR = p.gain(0);
    chain(p.noise('pink'), p.bq('bandpass', 520, 0.6), p.gain(0.7), windGainR, p.bq('highpass', 160, 0.6), p.pan(0.4), outdoor);

    // rain: hiss (stereo), a low body, and individual drops
    const rain = p.gain(0);
    const hissL = chain(p.noise('pink'), p.bq('highpass', 900, 0.5), p.bq('lowpass', 5200, 0.5), p.pan(-0.6));
    const hissR = chain(p.noise('pink'), p.bq('highpass', 1000, 0.5), p.bq('lowpass', 4800, 0.5), p.pan(0.6));
    hissL.connect(rain);
    hissR.connect(rain);
    rain.connect(outdoor);
    const rainLow = p.gain(0);
    chain(p.noise('pink'), p.bq('bandpass', 380, 0.7), p.bq('highpass', 130, 0.6), rainLow, outdoor);
    const drops = p.gain(0);
    const dropBuf = bakeDrops(g, 'rain-drops', 5.3, 26, 'rain');
    chain(p.buffer(dropBuf, now, undefined, true, g.rng() * 4), drops, outdoor);
    const dropBuf2 = bakeDrops(g, 'rain-drops-b', 3.7, 14, 'rain');
    chain(p.buffer(dropBuf2, now, undefined, true, g.rng() * 3, 0.82), drops);
    // … and heard from inside: a dull patter on the roof and the window panes (bypasses the "wall")
    const roof = p.gain(0);
    chain(p.buffer(dropBuf, now, undefined, true, g.rng() * 4, 0.6), p.bq('lowpass', 1500, 0.6), roof, master);
    chain(p.noise('pink'), p.bq('bandpass', 420, 0.6), p.gain(0.5), roof);

    const bed: Bed = {
      patch: p,
      master,
      birds,
      night,
      crickets,
      windGain,
      windF,
      sOutLp: new Smooth(wall.frequency, TAU),
      sOutGain: new Smooth(outGain.gain, TAU),
      sRoom: new Smooth(room.gain, TAU),
      sBirds: new Smooth(birds.gain, TAU),
      sNight: new Smooth(night.gain, TAU),
      sRain: new Smooth(rain.gain, TAU),
      sRainLow: new Smooth(rainLow.gain, TAU),
      sDrops: new Smooth(drops.gain, TAU),
      sRoof: new Smooth(roof.gain, TAU),
    };
    this.windR = windGainR;
    this.nextBird = now + rr(g.rng, 0.2, 1.2);
    this.nextNight = now + rr(g.rng, 3, 9);
    this.nextWind = now;
    return bed;
  }

  private windR: GainNode | null = null;

  set(a: Ambience, now: number): void {
    this.target = {
      outdoor: clamp(a.outdoor ?? 1, 0, 1),
      night: clamp(a.night ?? 0, 0, 1),
      wind: clamp(a.wind ?? 0.15, 0, 1),
      rain: clamp(a.rain ?? 0, 0, 1),
    };
    if (!this.bed) this.bed = this.build(now);
    const b = this.bed;
    if (!this.on) {
      this.on = true;
      this.offAt = Infinity;
      b.master.gain.setTargetAtTime(1, now, 0.25);
    }
    const { outdoor, night, rain } = this.target;
    // the wall: fully open outdoors, a dull murmur deep inside
    b.sOutLp.set(450 * Math.pow(16000 / 450, Math.pow(outdoor, 0.8)), now);
    b.sOutGain.set(0.1 + 0.9 * outdoor, now);
    b.sRoom.set(0.025 * (1 - outdoor), now);
    // rain keeps most birds quiet
    b.sBirds.set((1 - night) * (1 - 0.7 * rain), now);
    b.sNight.set(night * (1 - 0.5 * rain), now);
    b.sRain.set(0.14 * Math.pow(rain, 1.3), now);
    b.sRainLow.set(0.1 * rain, now);
    b.sDrops.set(rain > 0.01 ? 0.035 + 0.07 * rain : 0, now);
    b.sRoof.set(0.1 * rain * (1 - outdoor), now);
  }

  /** fade the whole bed out (and free it a moment later) */
  fadeOut(now: number): void {
    if (!this.bed || !this.on) return;
    this.on = false;
    this.bed.master.gain.setTargetAtTime(0, now, 0.2);
    this.offAt = now + 1.6;
  }

  pump(now: number, horizon: number): void {
    const b = this.bed;
    if (!b) return;
    if (!this.on) {
      if (now >= this.offAt) {
        b.patch.dispose();
        this.bed = null;
        this.windR = null;
      }
      return;
    }
    const r = this.g.rng;
    const { night, rain, wind, outdoor } = this.target;
    const day = (1 - night) * (1 - 0.7 * rain);

    // --- birds: sparse phrases, each from a random direction and distance
    if (this.nextBird < now - 1) this.nextBird = now;
    while (this.nextBird < now + horizon) {
      const t = Math.max(this.nextBird, now + 0.02);
      if (day > 0.08 && outdoor > 0.02 && r() < day + 0.15) this.spawnBird(b, t);
      // calm stretches now and then; busier at full daylight
      const gap = r() < 0.18 ? rr(r, 3.5, 7) : rr(r, 0.7, 3.4);
      this.nextBird = t + gap / (0.45 + 0.55 * day);
    }

    // --- night: crickets wander in and out, and something calls far away once in a while
    for (const c of b.crickets) {
      if (now >= c.next) {
        const resting = r() < 0.22;
        c.level = resting ? 0 : rr(r, 0.35, 1);
        c.gain.gain.setTargetAtTime(c.level * 0.22, now, resting ? 0.4 : 1.2);
        c.next = now + (resting ? rr(r, 1.5, 4) : rr(r, 3, 9));
      }
    }
    if (this.nextNight < now - 1) this.nextNight = now + rr(r, 2, 6);
    while (this.nextNight < now + horizon) {
      const t = Math.max(this.nextNight, now + 0.02);
      if (night > 0.5 && outdoor > 0.05) this.spawnNight(b, t);
      this.nextNight = t + rr(r, 9, 26);
    }

    // --- wind: a random walk in loudness and colour (gusts are just the larger steps)
    if (now >= this.nextWind) {
      const gust = r() < 0.25 ? rr(r, 1.2, 1.9) : rr(r, 0.45, 1.1);
      this.windLevel = (0.012 + 0.28 * wind) * gust;
      const tau = rr(r, 0.7, 1.6);
      b.windGain.gain.setTargetAtTime(this.windLevel, now, tau);
      this.windR?.gain.setTargetAtTime(this.windLevel * rr(r, 0.7, 1.2), now + 0.2, tau);
      b.windF.frequency.setTargetAtTime(lerp(300, 620, clamp(wind * gust, 0, 1)) * rr(r, 0.85, 1.2), now, tau);
      this.nextWind = now + rr(r, 1.2, 3);
    }
  }

  private spawnBird(b: Bed, t: number): void {
    const g = this.g;
    const r = g.rng;
    const total = BIRDS.reduce((s, x) => s + x.weight, 0);
    let k = r() * total;
    let bird = BIRDS[0];
    for (const x of BIRDS) {
      k -= x.weight;
      if (k <= 0) {
        bird = x;
        break;
      }
    }
    const v = new Voice(g, t);
    const dist = r(); // 0 near … 1 far
    const level = v.gain((0.02 + 0.07 * Math.pow(1 - dist, 2)) * (bird.level ?? 1));
    const air = v.bq('lowpass', 7500 - 4200 * dist, 0.5);
    chain(air, level, v.pan(rr(r, -0.85, 0.85)), b.birds);
    bird.sing(v, air, t, r);
  }

  private spawnNight(b: Bed, t: number): void {
    const g = this.g;
    const r = g.rng;
    const v = new Voice(g, t, r() < 0.5 ? 1 : 0.9);
    const far = v.bq('lowpass', 1100, 0.5);
    const level = v.gain(1);
    chain(far, level, v.pan(rr(r, -0.7, 0.7)), b.night);
    if (r() < 0.6) {
      level.gain.value = 0.05;
      owl(v, far, t, r);
    } else {
      // a dog a few streets away, with the slap-back of the houses
      level.gain.value = 0.07;
      const n = pick(r, [1, 2, 2, 3]);
      bark(v, far, t, r, n);
      const echo = v.gain(0.3);
      const dl = v.add(g.ac.createDelay(0.5));
      dl.delayTime.value = rr(r, 0.16, 0.24);
      chain(far, dl, v.bq('lowpass', 700, 0.5), echo, level);
      v.hold(v.end + 0.4, level); // let the echo ring out before the voice frees itself
    }
  }

  dispose(): void {
    this.bed?.patch.dispose();
    this.bed = null;
    this.windR = null;
    this.on = false;
  }
}
