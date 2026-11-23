/**
 * Procedural audio: everything is synthesised with WebAudio at runtime (no sound files).
 *
 *  - one-shot effects (`sfx`), instrument notes (`piano`, `guitar`, `drum`)
 *  - looping ambiences (`loop`: water, fire, fan, motor, crowd) and generative music stations
 *    (`music`), each returning a handle whose volume the caller updates every frame
 *    (distance attenuation to the listener).
 *
 * The context is created lazily on the first call (browsers require a user gesture before audio
 * can start; all callers are triggered by key presses / clicks).
 */

export type Sfx =
  | 'click'
  | 'boing'
  | 'whoosh'
  | 'kick'
  | 'bounce'
  | 'score'
  | 'miss'
  | 'bark'
  | 'meow'
  | 'purr'
  | 'chomp'
  | 'sip'
  | 'splash'
  | 'pop'
  | 'dart'
  | 'cheer'
  | 'snore'
  | 'shutter'
  | 'door'
  | 'switch'
  | 'sizzle'
  | 'page'
  | 'ding'
  | 'clack'
  | 'squeak';

export type LoopKind = 'water' | 'fire' | 'fan' | 'motor' | 'tv' | 'bubbles';
export type DrumKind = 'kick' | 'snare' | 'hat' | 'tom1' | 'tom2' | 'crash';

export interface Voice {
  /** 0..1 target volume (smoothed) */
  setVolume(v: number): void;
  stop(): void;
}

export const STATIONS = [
  { id: 'pop', name: 'פופ שמח' },
  { id: 'jazz', name: "ג'אז לאונג'" },
  { id: 'electro', name: 'אלקטרו' },
  { id: 'classical', name: 'קלאסי' },
  { id: 'lofi', name: 'לו-פיי רגוע' },
] as const;
export type StationId = (typeof STATIONS)[number]['id'];

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private ksCache = new Map<number, AudioBuffer>();
  private muted = false;
  private volume = 0.8;

  get available(): boolean {
    return typeof window !== 'undefined' && (typeof AudioContext !== 'undefined' || 'webkitAudioContext' in window);
  }

  private ac(): AudioContext | null {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return this.ctx;
    }
    if (!this.available) return null;
    try {
      const Ctor = (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext) as typeof AudioContext;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      // gentle compressor keeps many simultaneous sources from clipping
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      this.master.connect(comp).connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 2;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch {
      this.ctx = null;
    }
    return this.ctx;
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : this.volume, this.ctx.currentTime, 0.05);
  }

  isMuted(): boolean {
    return this.muted;
  }

  /** resume the context from a user gesture */
  unlock(): void {
    this.ac();
  }

  // ---- building blocks ---------------------------------------------------------------------

  private noise(t: number, dur: number, out: AudioNode, opts: { type?: BiquadFilterType; freq?: number; q?: number; gain?: number; attack?: number; decay?: number } = {}): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = opts.type ?? 'bandpass';
    f.frequency.value = opts.freq ?? 1000;
    f.Q.value = opts.q ?? 1;
    const g = ctx.createGain();
    const peak = opts.gain ?? 0.5;
    const a = opts.attack ?? 0.002;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + (opts.decay ?? dur));
    src.connect(f).connect(g).connect(out);
    src.start(t, Math.random() * 1.5);
    src.stop(t + a + (opts.decay ?? dur) + 0.05);
  }

  private tone(t: number, freq: number, dur: number, out: AudioNode, opts: { type?: OscillatorType; gain?: number; attack?: number; to?: number; detune?: number } = {}): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = opts.type ?? 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
    if (opts.detune) o.detune.value = opts.detune;
    const g = ctx.createGain();
    const a = opts.attack ?? 0.005;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(opts.gain ?? 0.3, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + a + dur + 0.05);
  }

  private dest(volume: number): GainNode {
    const g = this.ctx!.createGain();
    g.gain.value = volume;
    g.connect(this.master!);
    return g;
  }

  // ---- instruments ---------------------------------------------------------------------------

  /** piano-like note: midi number, velocity 0..1 */
  piano(midi: number, vel = 0.8, out?: AudioNode, when?: number): void {
    const ctx = this.ac();
    if (!ctx) return;
    const t = when ?? ctx.currentTime;
    const f = 440 * Math.pow(2, (midi - 69) / 12);
    const o = out ?? this.dest(0.5);
    const decay = 2.6 - (midi - 48) * 0.025;
    this.tone(t, f, decay, o, { type: 'triangle', gain: 0.32 * vel, attack: 0.004 });
    this.tone(t, f * 2, decay * 0.6, o, { type: 'sine', gain: 0.12 * vel, attack: 0.003 });
    this.tone(t, f * 3, decay * 0.35, o, { type: 'sine', gain: 0.05 * vel, attack: 0.002 });
    this.tone(t, f * 0.5, decay * 0.5, o, { type: 'sine', gain: 0.05 * vel });
    this.noise(t, 0.03, o, { type: 'highpass', freq: 3000, gain: 0.05 * vel });
  }

  /** plucked string (Karplus–Strong, pre-rendered per pitch) */
  pluck(midi: number, vel = 0.8, out?: AudioNode, when?: number): void {
    const ctx = this.ac();
    if (!ctx) return;
    let buf = this.ksCache.get(midi);
    if (!buf) {
      const sr = ctx.sampleRate;
      const f = 440 * Math.pow(2, (midi - 69) / 12);
      const n = Math.floor(sr * 2.2);
      buf = ctx.createBuffer(1, n, sr);
      const d = buf.getChannelData(0);
      const p = Math.max(2, Math.round(sr / f));
      const ring = new Float32Array(p);
      for (let i = 0; i < p; i++) ring[i] = Math.random() * 2 - 1;
      let idx = 0;
      for (let i = 0; i < n; i++) {
        const nxt = (idx + 1) % p;
        const v = 0.497 * (ring[idx] + ring[nxt]);
        d[i] = ring[idx];
        ring[idx] = v;
        idx = nxt;
      }
      this.ksCache.set(midi, buf);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = 0.45 * vel;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 3800;
    src.connect(f).connect(g).connect(out ?? this.dest(0.6));
    src.start(when ?? ctx.currentTime);
  }

  guitarChord(chord: number[], vel = 0.8): void {
    const ctx = this.ac();
    if (!ctx) return;
    const t = ctx.currentTime;
    const out = this.dest(0.6);
    chord.forEach((m, i) => this.pluck(m, vel * (0.8 + Math.random() * 0.2), out, t + i * 0.018));
  }

  drum(kind: DrumKind, vel = 0.9, out?: AudioNode, when?: number): void {
    const ctx = this.ac();
    if (!ctx) return;
    const t = when ?? ctx.currentTime;
    const o = out ?? this.dest(0.7);
    switch (kind) {
      case 'kick':
        this.tone(t, 150, 0.35, o, { gain: 0.9 * vel, to: 42 });
        this.noise(t, 0.02, o, { type: 'lowpass', freq: 1200, gain: 0.2 * vel });
        break;
      case 'snare':
        this.tone(t, 190, 0.12, o, { type: 'triangle', gain: 0.3 * vel, to: 150 });
        this.noise(t, 0.18, o, { type: 'highpass', freq: 1500, gain: 0.45 * vel });
        break;
      case 'hat':
        this.noise(t, 0.05, o, { type: 'highpass', freq: 7000, gain: 0.25 * vel });
        break;
      case 'tom1':
        this.tone(t, 220, 0.3, o, { gain: 0.5 * vel, to: 160 });
        break;
      case 'tom2':
        this.tone(t, 130, 0.4, o, { gain: 0.6 * vel, to: 90 });
        break;
      case 'crash':
        this.noise(t, 1.4, o, { type: 'highpass', freq: 4000, gain: 0.3 * vel, decay: 1.4 });
        this.noise(t, 0.9, o, { type: 'bandpass', freq: 9000, q: 0.5, gain: 0.15 * vel });
        break;
    }
  }

  // ---- effects -------------------------------------------------------------------------------

  sfx(kind: Sfx, volume = 1): void {
    const ctx = this.ac();
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = this.dest(0.55 * volume);
    switch (kind) {
      case 'click':
        this.noise(t, 0.015, o, { type: 'highpass', freq: 2500, gain: 0.4 });
        break;
      case 'switch':
        this.noise(t, 0.012, o, { type: 'bandpass', freq: 3500, q: 3, gain: 0.6 });
        this.noise(t + 0.03, 0.01, o, { type: 'bandpass', freq: 2500, q: 3, gain: 0.3 });
        break;
      case 'boing':
        this.tone(t, 180, 0.35, o, { type: 'sine', gain: 0.4, to: 520 });
        break;
      case 'bounce':
        this.tone(t, 90, 0.18, o, { type: 'sine', gain: 0.5, to: 60 });
        this.noise(t, 0.05, o, { type: 'lowpass', freq: 400, gain: 0.25 });
        break;
      case 'whoosh':
        this.noise(t, 0.45, o, { type: 'bandpass', freq: 900, q: 0.8, gain: 0.35, attack: 0.15, decay: 0.35 });
        break;
      case 'kick':
        this.tone(t, 120, 0.12, o, { gain: 0.6, to: 60 });
        this.noise(t, 0.04, o, { type: 'bandpass', freq: 800, gain: 0.35 });
        break;
      case 'score':
        [72, 76, 79, 84].forEach((m, i) => this.tone(t + i * 0.09, 440 * Math.pow(2, (m - 69) / 12), 0.35, o, { type: 'triangle', gain: 0.25 }));
        break;
      case 'miss':
        this.tone(t, 330, 0.25, o, { type: 'triangle', gain: 0.2, to: 250 });
        this.tone(t + 0.22, 250, 0.35, o, { type: 'triangle', gain: 0.2, to: 180 });
        break;
      case 'bark':
        for (const dt of [0, 0.22]) {
          this.tone(t + dt, 520, 0.09, o, { type: 'sawtooth', gain: 0.18, to: 300 });
          this.noise(t + dt, 0.1, o, { type: 'bandpass', freq: 900, q: 2, gain: 0.35 });
        }
        break;
      case 'meow':
        this.tone(t, 600, 0.5, o, { type: 'sawtooth', gain: 0.07, to: 820 });
        this.tone(t + 0.2, 820, 0.35, o, { type: 'triangle', gain: 0.12, to: 520 });
        break;
      case 'purr':
        for (let i = 0; i < 10; i++) this.noise(t + i * 0.09, 0.07, o, { type: 'lowpass', freq: 180, gain: 0.5, attack: 0.02 });
        break;
      case 'chomp':
        for (const dt of [0, 0.18, 0.36]) this.noise(t + dt, 0.07, o, { type: 'bandpass', freq: 1800, q: 1.5, gain: 0.5 });
        break;
      case 'sip':
        this.noise(t, 0.35, o, { type: 'bandpass', freq: 2400, q: 4, gain: 0.25, attack: 0.08 });
        this.tone(t + 0.4, 160, 0.15, o, { gain: 0.2, to: 120 });
        break;
      case 'splash':
        this.noise(t, 0.6, o, { type: 'bandpass', freq: 1400, q: 0.6, gain: 0.5 });
        break;
      case 'pop':
        this.tone(t, 900, 0.06, o, { gain: 0.35, to: 300 });
        break;
      case 'dart':
        this.noise(t, 0.12, o, { type: 'bandpass', freq: 1500, gain: 0.25, attack: 0.05 });
        this.noise(t + 0.18, 0.03, o, { type: 'lowpass', freq: 900, gain: 0.7 });
        break;
      case 'cheer':
        for (let i = 0; i < 6; i++) this.noise(t + i * 0.05, 1.2, o, { type: 'bandpass', freq: 700 + i * 260, q: 1.2, gain: 0.12, attack: 0.15 });
        break;
      case 'snore':
        this.noise(t, 1.0, o, { type: 'lowpass', freq: 300, gain: 0.35, attack: 0.5, decay: 0.6 });
        break;
      case 'shutter':
        this.noise(t, 0.03, o, { type: 'highpass', freq: 2000, gain: 0.6 });
        this.noise(t + 0.08, 0.04, o, { type: 'highpass', freq: 1500, gain: 0.5 });
        break;
      case 'door':
        this.noise(t, 0.3, o, { type: 'bandpass', freq: 420, q: 6, gain: 0.25, attack: 0.05 });
        break;
      case 'sizzle':
        this.noise(t, 1.2, o, { type: 'highpass', freq: 4500, gain: 0.2, attack: 0.1 });
        break;
      case 'page':
        this.noise(t, 0.2, o, { type: 'highpass', freq: 3000, gain: 0.2, attack: 0.05 });
        break;
      case 'ding':
        this.tone(t, 1318, 1.2, o, { gain: 0.25 });
        this.tone(t, 2637, 0.6, o, { gain: 0.08 });
        break;
      case 'clack':
        this.tone(t, 1800, 0.04, o, { type: 'square', gain: 0.12 });
        this.noise(t, 0.03, o, { type: 'bandpass', freq: 2500, q: 2, gain: 0.4 });
        break;
      case 'squeak':
        this.tone(t, 900, 0.15, o, { type: 'square', gain: 0.05, to: 1300 });
        break;
    }
  }

  // ---- loops ---------------------------------------------------------------------------------

  loop(kind: LoopKind): Voice | null {
    const ctx = this.ac();
    if (!ctx) return null;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(this.master!);
    const stops: Array<() => void> = [];
    const noiseSrc = (type: BiquadFilterType, freq: number, q: number, gain: number) => {
      const s = ctx.createBufferSource();
      s.buffer = this.noiseBuf;
      s.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = gain;
      s.connect(f).connect(g).connect(out);
      s.start(0, Math.random() * 1.5);
      stops.push(() => s.stop());
      return { s, f, g };
    };
    let timer: ReturnType<typeof setInterval> | undefined;
    switch (kind) {
      case 'water':
        noiseSrc('bandpass', 1600, 0.5, 0.5);
        noiseSrc('highpass', 5000, 0.7, 0.15);
        break;
      case 'bubbles':
        noiseSrc('lowpass', 500, 1, 0.15);
        timer = setInterval(() => this.tone(ctx.currentTime, 400 + Math.random() * 700, 0.05, out, { gain: 0.08, to: 1200 }), 230);
        break;
      case 'fire':
        noiseSrc('lowpass', 400, 0.7, 0.45);
        timer = setInterval(() => {
          if (Math.random() < 0.6) this.noise(ctx.currentTime, 0.02, out, { type: 'highpass', freq: 2500 + Math.random() * 3000, gain: 0.3 + Math.random() * 0.5 });
        }, 90);
        break;
      case 'fan':
        noiseSrc('lowpass', 260, 0.8, 0.5);
        break;
      case 'motor': {
        noiseSrc('lowpass', 320, 1, 0.3);
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = 58;
        const g = ctx.createGain();
        g.gain.value = 0.035;
        o.connect(g).connect(out);
        o.start();
        stops.push(() => o.stop());
        break;
      }
      case 'tv': {
        // murmuring voices: band-passed noise with a syllable-rate tremolo
        const v = noiseSrc('bandpass', 700, 1.4, 0.4);
        timer = setInterval(() => {
          v.g.gain.setTargetAtTime(Math.random() < 0.25 ? 0.04 : 0.25 + Math.random() * 0.3, ctx.currentTime, 0.03);
          v.f.frequency.setTargetAtTime(500 + Math.random() * 700, ctx.currentTime, 0.05);
        }, 110);
        break;
      }
    }
    return this.voice(out, () => {
      if (timer) clearInterval(timer);
      stops.forEach((s) => {
        try {
          s();
        } catch {
          /* already stopped */
        }
      });
    });
  }

  private voice(out: GainNode, onStop: () => void): Voice {
    const ctx = this.ctx!;
    let stopped = false;
    return {
      setVolume: (v: number) => {
        if (!stopped) out.gain.setTargetAtTime(Math.max(0, Math.min(1, v)), ctx.currentTime, 0.08);
      },
      stop: () => {
        if (stopped) return;
        stopped = true;
        out.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
        setTimeout(() => {
          onStop();
          out.disconnect();
        }, 300);
      },
    };
  }

  // ---- generative music ----------------------------------------------------------------------

  /** Start a looping generative music station. `onBeat` fires on every beat (for visuals). */
  music(station: StationId, onBeat?: (strength: number) => void): Voice | null {
    const ctx = this.ac();
    if (!ctx) return null;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(this.master!);
    const spec = STYLE[station];
    const spb = 60 / spec.bpm / 2; // eighth notes
    let step = 0;
    let next = ctx.currentTime + 0.1;
    const rnd = mulberry(station.length * 99);
    const melody: number[] = [];
    for (let i = 0; i < 32; i++) melody.push(rnd() < spec.rest ? -1 : spec.scale[Math.floor(rnd() * spec.scale.length)]);
    const timer = setInterval(() => {
      while (next < ctx.currentTime + 0.15) {
        const bar = Math.floor(step / 8) % spec.chords.length;
        const s8 = step % 8;
        const chord = spec.chords[bar];
        const swing = spec.swing && s8 % 2 === 1 ? spb * 0.33 : 0;
        const t = next + swing;
        // drums
        const dp = spec.drums;
        if (dp.kick[s8]) this.drum('kick', 0.8, out, t);
        if (dp.snare[s8]) this.drum('snare', 0.55, out, t);
        if (dp.hat[s8]) this.drum('hat', 0.4, out, t);
        // bass
        if (spec.bass[s8] !== null) {
          const b = chord[0] - 24 + (spec.bass[s8] ?? 0);
          this.tone(t, mtof(b), spb * 1.6, out, { type: spec.bassWave, gain: 0.22, attack: 0.01 });
        }
        // chords / arpeggio
        if (spec.arp) {
          const n = chord[s8 % chord.length] + (s8 >= 4 ? 12 : 0);
          spec.inst === 'pluck' ? this.pluck(n, 0.5, out, t) : this.piano(n, 0.45, out, t);
        } else if (s8 === 0 || (spec.comp && s8 === 4)) {
          chord.forEach((n) => (spec.inst === 'pluck' ? this.pluck(n, 0.4, out, t) : this.piano(n, 0.35, out, t)));
        }
        // melody
        const m = melody[step % melody.length];
        if (m >= 0 && s8 % spec.melodyEvery === 0) this.tone(t, mtof(m + 12), spb * 1.8, out, { type: spec.leadWave, gain: 0.09, attack: 0.02 });
        if (onBeat && s8 % 2 === 0) {
          const delay = Math.max(0, (t - ctx.currentTime) * 1000);
          const strength = s8 === 0 ? 1 : 0.6;
          setTimeout(() => onBeat(strength), delay);
        }
        step++;
        next += spb;
      }
    }, 40);
    let crackle: ReturnType<typeof setInterval> | undefined;
    if (station === 'lofi') {
      crackle = setInterval(() => {
        if (Math.random() < 0.5) this.noise(ctx.currentTime, 0.01, out, { type: 'highpass', freq: 3000, gain: 0.12 });
      }, 70);
    }
    return this.voice(out, () => {
      clearInterval(timer);
      if (crackle) clearInterval(crackle);
    });
  }
}

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface StyleSpec {
  bpm: number;
  chords: number[][];
  scale: number[];
  rest: number;
  drums: { kick: number[]; snare: number[]; hat: number[] };
  bass: Array<number | null>;
  bassWave: OscillatorType;
  leadWave: OscillatorType;
  inst: 'piano' | 'pluck';
  arp: boolean;
  comp: boolean;
  swing: boolean;
  melodyEvery: number;
}

const C = [60, 64, 67];
const G = [55, 59, 62];
const Am = [57, 60, 64];
const F = [53, 57, 60];
const Dm7 = [62, 65, 69, 72];
const G7 = [55, 59, 62, 65];
const Cmaj7 = [60, 64, 67, 71];
const Am7 = [57, 60, 64, 67];
const Fmaj7 = [53, 57, 60, 64];
const Em7 = [52, 55, 59, 62];

const STYLE: Record<StationId, StyleSpec> = {
  pop: {
    bpm: 112,
    chords: [C, G, Am, F],
    scale: [60, 62, 64, 67, 69, 72],
    rest: 0.35,
    drums: { kick: [1, 0, 0, 0, 1, 0, 0, 0], snare: [0, 0, 1, 0, 0, 0, 1, 0], hat: [1, 1, 1, 1, 1, 1, 1, 1] },
    bass: [0, null, 0, null, 0, null, 7, null],
    bassWave: 'triangle',
    leadWave: 'square',
    inst: 'piano',
    arp: false,
    comp: true,
    swing: false,
    melodyEvery: 1,
  },
  jazz: {
    bpm: 132,
    chords: [Dm7, G7, Cmaj7, Am7],
    scale: [60, 62, 63, 64, 67, 69, 70, 72],
    rest: 0.45,
    drums: { kick: [1, 0, 0, 0, 0, 0, 0, 0], snare: [0, 0, 0, 0, 0, 0, 0, 0], hat: [1, 0, 1, 1, 1, 0, 1, 1] },
    bass: [0, null, 4, null, 7, null, 9, null],
    bassWave: 'sine',
    leadWave: 'triangle',
    inst: 'piano',
    arp: false,
    comp: true,
    swing: true,
    melodyEvery: 1,
  },
  electro: {
    bpm: 124,
    chords: [Am, F, C, G],
    scale: [57, 60, 62, 64, 67, 69],
    rest: 0.5,
    drums: { kick: [1, 0, 1, 0, 1, 0, 1, 0], snare: [0, 0, 1, 0, 0, 0, 1, 0], hat: [0, 1, 0, 1, 0, 1, 0, 1] },
    bass: [0, 0, 12, 0, 0, 0, 12, 0],
    bassWave: 'sawtooth',
    leadWave: 'sawtooth',
    inst: 'pluck',
    arp: true,
    comp: false,
    swing: false,
    melodyEvery: 2,
  },
  classical: {
    bpm: 96,
    chords: [C, F, G, C, Am, F, G7, C],
    scale: [60, 62, 64, 65, 67, 69, 71, 72],
    rest: 0.2,
    drums: { kick: [0, 0, 0, 0, 0, 0, 0, 0], snare: [0, 0, 0, 0, 0, 0, 0, 0], hat: [0, 0, 0, 0, 0, 0, 0, 0] },
    bass: [0, null, null, null, 7, null, null, null],
    bassWave: 'triangle',
    leadWave: 'triangle',
    inst: 'piano',
    arp: true,
    comp: false,
    swing: false,
    melodyEvery: 2,
  },
  lofi: {
    bpm: 80,
    chords: [Fmaj7, Em7, Dm7, Cmaj7],
    scale: [60, 62, 64, 67, 69],
    rest: 0.55,
    drums: { kick: [1, 0, 0, 1, 0, 0, 0, 0], snare: [0, 0, 1, 0, 0, 0, 1, 0], hat: [1, 0, 1, 0, 1, 0, 1, 1] },
    bass: [0, null, null, null, 0, null, 5, null],
    bassWave: 'sine',
    leadWave: 'sine',
    inst: 'piano',
    arp: false,
    comp: false,
    swing: true,
    melodyEvery: 2,
  },
};

export const sound = new SoundEngine();
