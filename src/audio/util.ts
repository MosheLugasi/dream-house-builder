/**
 * Low-level building blocks shared by every synth in `src/audio/`.
 * Nothing here touches `window` – everything takes a `BaseAudioContext`, so the same code runs on a live
 * `AudioContext` and on an `OfflineAudioContext` (self-test, `tools/audio-preview`).
 */

export type NoiseKind = 'white' | 'pink' | 'brown';
export type BusName = 'sfx' | 'steps' | 'ambience' | 'vehicle' | 'loops' | 'music';

export interface Graph {
  ac: BaseAudioContext;
  /** uniform 0…1 */
  rng: () => number;
  noise: Record<NoiseKind, AudioBuffer>;
  bus: Record<BusName, GainNode>;
  /** bookkeeping used by the leak test: nodes / one-shot voices currently alive */
  stats: { nodes: number; voices: number };
  /** baked helper buffers (rain drops, crickets, …), created on first use */
  cache: Map<string, AudioBuffer>;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const dbToGain = (db: number) => Math.pow(10, db / 20);
export const midiToHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
/** random in [a, b) */
export const rr = (r: () => number, a: number, b: number) => a + (b - a) * r();
export const pick = <T>(r: () => number, list: readonly T[]): T => list[Math.min(list.length - 1, Math.floor(r() * list.length))];

/** Looping noise with a fixed RMS of 0.25, zero mean and a cross-faded seam. */
export function makeNoise(ac: BaseAudioContext, kind: NoiseKind, seconds: number, seed: number): AudioBuffer {
  const sr = ac.sampleRate;
  const n = Math.floor(seconds * sr);
  const fade = Math.floor(0.05 * sr);
  const raw = new Float32Array(n + fade);
  const r = mulberry32(seed);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let br = 0;
  for (let i = 0; i < raw.length; i++) {
    const w = r() * 2 - 1;
    if (kind === 'white') raw[i] = w;
    else if (kind === 'pink') {
      // Paul Kellet's economy pink filter
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      raw[i] = b0 + b1 + b2 + w * 0.1848;
    } else {
      br = (br + 0.02 * w) / 1.02;
      raw[i] = br;
    }
  }
  const buf = ac.createBuffer(1, n, sr);
  const out = buf.getChannelData(0);
  for (let i = 0; i < n; i++) out[i] = raw[i];
  // equal-power cross-fade of the tail into the head so the loop point is seamless
  for (let i = 0; i < fade; i++) {
    const k = i / fade;
    out[i] = raw[i] * Math.sqrt(k) + raw[n + i] * Math.sqrt(1 - k);
  }
  let mean = 0;
  for (let i = 0; i < n; i++) mean += out[i];
  mean /= n;
  let sq = 0;
  for (let i = 0; i < n; i++) {
    out[i] -= mean;
    sq += out[i] * out[i];
  }
  const k = 0.25 / Math.sqrt(sq / n || 1);
  for (let i = 0; i < n; i++) out[i] *= k;
  return buf;
}

/** Connect nodes in series (the last link may be an AudioParam) and return the last one. */
export function chain<T extends AudioNode | AudioParam>(...nodes: [...AudioNode[], T]): T {
  for (let i = 0; i < nodes.length - 1; i++) (nodes[i] as AudioNode).connect(nodes[i + 1] as AudioNode);
  return nodes[nodes.length - 1] as T;
}

/** 0 → peak (linear, `att` s) then exponential decay towards 0 with time constant `tau`. */
export function perc(p: AudioParam, t: number, peak: number, att: number, tau: number): void {
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + att);
  p.setTargetAtTime(0, t + att, tau);
}

/** Piece-wise linear automation through `[offset, value]` points (offsets relative to `t`). */
export function line(p: AudioParam, t: number, pts: readonly (readonly [number, number])[], scale = 1): void {
  p.setValueAtTime(pts[0][1] * scale, t + pts[0][0]);
  for (let i = 1; i < pts.length; i++) p.linearRampToValueAtTime(pts[i][1] * scale, t + pts[i][0]);
}

/** Piece-wise exponential automation (values must be > 0) – the natural choice for frequencies. */
export function expo(p: AudioParam, t: number, pts: readonly (readonly [number, number])[], scale = 1): void {
  p.setValueAtTime(Math.max(1e-4, pts[0][1] * scale), t + pts[0][0]);
  for (let i = 1; i < pts.length; i++) p.exponentialRampToValueAtTime(Math.max(1e-4, pts[i][1] * scale), t + pts[i][0]);
}

/** Only re-schedules a ramp when the target really changed, so per-frame updates stay cheap and zipper-free. */
export class Smooth {
  private last = NaN;
  constructor(
    private readonly param: AudioParam,
    private readonly tau: number,
  ) {}
  set(v: number, now: number, tau = this.tau): void {
    if (!Number.isFinite(v)) return;
    if (Math.abs(v - this.last) <= 1e-3 * Math.max(0.05, Math.abs(v))) return;
    this.last = v;
    this.param.setTargetAtTime(v, now, tau);
  }
}

/**
 * A bag of nodes that live and die together. Long-lived synths (loops, ambience, vehicle) use it directly and
 * call `dispose()`; one-shots use `Voice`, which disposes itself when its last source has ended.
 */
export class Patch {
  readonly ac: BaseAudioContext;
  private nodes: AudioNode[] = [];
  private sources: AudioScheduledSourceNode[] = [];
  disposed = false;
  /** pitch factor applied to every oscillator / filter frequency created through this patch */
  p = 1;

  constructor(readonly g: Graph) {
    this.ac = g.ac;
  }

  add<T extends AudioNode>(n: T): T {
    this.nodes.push(n);
    this.g.stats.nodes++;
    return n;
  }

  gain(v = 1): GainNode {
    const n = this.add(this.ac.createGain());
    n.gain.value = v;
    return n;
  }

  bq(type: BiquadFilterType, freq: number, q = 0.707): BiquadFilterNode {
    const n = this.add(this.ac.createBiquadFilter());
    n.type = type;
    n.frequency.value = clamp(freq * this.p, 10, this.ac.sampleRate * 0.45);
    n.Q.value = q;
    return n;
  }

  pan(v = 0): AudioNode & { pan?: AudioParam } {
    if (typeof this.ac.createStereoPanner !== 'function') return this.gain(1);
    const n = this.add(this.ac.createStereoPanner());
    n.pan.value = clamp(v, -1, 1);
    return n;
  }

  shaper(curve: Float32Array): WaveShaperNode {
    const n = this.add(this.ac.createWaveShaper());
    n.curve = curve as Float32Array<ArrayBuffer>;
    return n;
  }

  osc(type: OscillatorType, freq: number, t0 = 0, t1?: number): OscillatorNode {
    const n = this.add(this.ac.createOscillator());
    n.type = type;
    n.frequency.value = freq * this.p;
    this.begin(n, t0, t1);
    n.start(t0);
    if (t1 !== undefined) n.stop(t1);
    return n;
  }

  /** looping noise, started at a random offset so that no two voices are correlated */
  noise(kind: NoiseKind, t0 = 0, t1?: number, rate = 1): AudioBufferSourceNode {
    const buf = this.g.noise[kind];
    return this.buffer(buf, t0, t1, true, this.g.rng() * (buf.duration - 0.1), rate);
  }

  buffer(buf: AudioBuffer, t0 = 0, t1?: number, loop = true, offset = 0, rate = 1): AudioBufferSourceNode {
    const n = this.add(this.ac.createBufferSource());
    n.buffer = buf;
    n.loop = loop;
    n.playbackRate.value = rate;
    this.begin(n, t0, t1);
    n.start(t0, offset);
    if (t1 !== undefined) n.stop(t1);
    return n;
  }

  /** hook for subclasses; called before a source is started */
  protected begin(src: AudioScheduledSourceNode, _t0: number, _t1?: number): void {
    this.sources.push(src);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const s of this.sources) {
      s.onended = null;
      try {
        s.stop();
      } catch {
        /* never started or already stopped */
      }
    }
    for (const n of this.nodes) {
      try {
        n.disconnect();
      } catch {
        /* ignore */
      }
    }
    this.g.stats.nodes -= this.nodes.length;
    this.nodes = [];
    this.sources = [];
  }
}

/** A one-shot: every source must be given a stop time; the voice frees itself when the last one ended. */
export class Voice extends Patch {
  private pending = 0;
  /** latest stop time of any source */
  end = 0;

  constructor(
    g: Graph,
    readonly t0: number,
    pitch = 1,
  ) {
    super(g);
    this.p = pitch;
    g.stats.voices++;
  }

  protected begin(src: AudioScheduledSourceNode, t0: number, t1?: number): void {
    super.begin(src, t0, t1);
    if (t1 === undefined) throw new Error('audio: a one-shot source needs a stop time');
    this.end = Math.max(this.end, t1);
    this.pending++;
    src.onended = () => {
      if (--this.pending <= 0) this.dispose();
    };
  }

  /** keep the voice alive until `until` (for tails that outlast the sources, e.g. a delay line) */
  hold(until: number, into: AudioNode): void {
    const o = this.osc('sine', 20, this.t0, until);
    chain(o, this.gain(0), into);
  }

  dispose(): void {
    if (this.disposed) return;
    super.dispose();
    this.g.stats.voices--;
  }
}

// ---------------------------------------------------------------- small reusable sound atoms

/** Filtered-noise transient (the "tk" of a latch, a heel on tiles, …). */
export function tick(
  v: Patch,
  out: AudioNode,
  t: number,
  freq: number,
  q: number,
  tau: number,
  level: number,
  kind: NoiseKind = 'white',
  type: BiquadFilterType = 'bandpass',
  att = 0.001,
): void {
  const n = v.noise(kind, t, t + att + tau * 7 + 0.01);
  const f = v.bq(type, freq, q);
  const g = v.gain(0);
  perc(g.gain, t, level, att, tau);
  chain(n, f, g, out);
}

/** Sine with a quick downward pitch glide – the body of a thud. */
export function thump(v: Patch, out: AudioNode, t: number, f0: number, f1: number, tau: number, level: number, glide = 0.04): void {
  const o = v.osc('sine', f0, t, t + 0.004 + tau * 7 + 0.01);
  o.frequency.setValueAtTime(f0 * v.p, t);
  o.frequency.exponentialRampToValueAtTime(f1 * v.p, t + glide);
  const g = v.gain(0);
  perc(g.gain, t, level, 0.004, tau);
  chain(o, g, out);
}

/** A single exponentially damped partial. */
export function ping(v: Patch, out: AudioNode, t: number, freq: number, tau: number, level: number, type: OscillatorType = 'sine', att = 0.002): OscillatorNode {
  const o = v.osc(type, freq, t, t + att + tau * 7 + 0.01);
  const g = v.gain(0);
  perc(g.gain, t, level, att, tau);
  chain(o, g, out);
  return o;
}

/** Band of noise that swells and fades while its centre frequency moves through `freqs` (evenly spaced in time). */
export function swish(
  v: Patch,
  out: AudioNode,
  t: number,
  freqs: readonly number[],
  dur: number,
  q: number,
  level: number,
  kind: NoiseKind = 'white',
  peakAt = 0.4,
): void {
  const n = v.noise(kind, t, t + dur + 0.02);
  const f = v.bq('bandpass', freqs[0], q);
  expo(f.frequency, t, freqs.map((fr, i) => [(dur * i) / Math.max(1, freqs.length - 1), fr * v.p] as const));
  const g = v.gain(0);
  line(g.gain, t, [
    [0, 0],
    [dur * peakAt, level],
    [dur, 0],
  ]);
  chain(n, f, g, out);
}

/**
 * Stick-slip creak: a slow sawtooth (one "slip" per cycle) rings two narrow resonances. Used for door hinges,
 * the swing chain and the playground squeak.
 */
export function creak(
  v: Patch,
  out: AudioNode,
  t: number,
  dur: number,
  level: number,
  rate: readonly number[],
  res: readonly [number, number],
  q = 7,
): void {
  const o = v.osc('sawtooth', rate[0], t, t + dur + 0.03);
  expo(o.frequency, t, rate.map((fr, i) => [(dur * i) / Math.max(1, rate.length - 1), fr * v.p] as const));
  const hp = v.bq('highpass', res[0] * 0.5, 0.7);
  const f1 = v.bq('bandpass', res[0], q);
  const f2 = v.bq('bandpass', res[1], q * 1.2);
  const g2 = v.gain(0.6);
  const g = v.gain(0);
  line(g.gain, t, [
    [0, 0],
    [dur * 0.2, level],
    [dur * 0.7, level * 0.7],
    [dur, 0],
  ]);
  o.connect(hp);
  chain(hp, f1, g);
  chain(hp, f2, g2, g);
  g.connect(out);
}

/** Bakes a short stereo bed of tiny "drops" (rain ticks or bubbly plinks) used as a seamless loop. */
export function bakeDrops(g: Graph, key: string, seconds: number, perSecond: number, style: 'rain' | 'bubble'): AudioBuffer {
  const hit = g.cache.get(key);
  if (hit) return hit;
  const sr = g.ac.sampleRate;
  const n = Math.floor(seconds * sr);
  const buf = g.ac.createBuffer(2, n, sr);
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);
  const r = mulberry32(key.length * 7919 + Math.floor(seconds * 1000));
  const count = Math.floor(seconds * perSecond);
  for (let k = 0; k < count; k++) {
    const start = Math.floor(r() * n);
    const pan = r();
    const amp = 0.15 + 0.85 * r() * r();
    const gl = Math.cos((pan * Math.PI) / 2) * amp;
    const gr = Math.sin((pan * Math.PI) / 2) * amp;
    if (style === 'rain') {
      // a drop on a leaf / sill: 2–6 ms damped sine burst between 1.2 and 4.5 kHz
      const f = 1200 + 3300 * r() * r();
      const tau = (0.0012 + 0.003 * r()) * sr;
      const len = Math.floor(tau * 6);
      const w = (2 * Math.PI * f) / sr;
      for (let i = 0; i < len; i++) {
        const s = Math.sin(w * i) * Math.exp(-i / tau) * Math.min(1, i / 8);
        const j = (start + i) % n;
        L[j] += s * gl;
        R[j] += s * gr;
      }
    } else {
      // a bubble: sine whose pitch rises while it decays
      const f0 = 420 + 1300 * r() * r();
      const tau = (0.006 + 0.02 * r()) * sr;
      const len = Math.floor(tau * 5);
      const rise = 1 + 0.9 * r();
      let ph = 0;
      for (let i = 0; i < len; i++) {
        const f = f0 * (1 + (rise * i) / len);
        ph += (2 * Math.PI * f) / sr;
        const s = Math.sin(ph) * Math.exp(-i / tau) * Math.min(1, i / 24);
        const j = (start + i) % n;
        L[j] += s * gl;
        R[j] += s * gr;
      }
    }
  }
  // normalise to a peak of 0.5 so that the gain after the buffer directly sets how loud a single drop can get
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const k = 0.5 / (peak || 1);
  for (let i = 0; i < n; i++) {
    L[i] *= k;
    R[i] *= k;
  }
  g.cache.set(key, buf);
  return buf;
}

/** Waveshaper curve adding a little 2nd and 3rd harmonic (Chebyshev) – makes pure sines less "test tone". */
let harmonicCurve: Float32Array | null = null;
export function gentleHarmonics(): Float32Array {
  if (harmonicCurve) return harmonicCurve;
  const n = 1024;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = 0.82 * x + 0.12 * (2 * x * x - 1) + 0.06 * (4 * x * x * x - 3 * x);
  }
  harmonicCurve = c;
  return c;
}
