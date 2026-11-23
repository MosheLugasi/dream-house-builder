/**
 * The sound engine proper, built on any `BaseAudioContext` – the live singleton in `AudioEngine.ts` wraps one on a
 * real `AudioContext`, the self-test (`tools/audio-preview`) renders the same graph on `OfflineAudioContext`s.
 *
 * Mixer:  voices → bus (sfx | steps | music | ambience | vehicle | loops) → pre → DC blocker → master gain
 *         → compressor (limiter) → make-up compensation → soft clip → destination
 */
import type { Ambience, Loop, Sfx, SfxOptions, Surface, VehicleSound } from './types';
import { AmbienceSynth } from './ambience';
import { playStep } from './footsteps';
import { LoopSynth } from './loops';
import { pianoNote } from './piano';
import { SFX, SFX_INFO } from './sfx';
import { Voice, chain, clamp, dbToGain, makeNoise, rr, type BusName, type Graph } from './util';
import { VehicleSynth } from './vehicle';

export interface EngineOptions {
  /** uniform 0…1 random source (seed it for reproducible offline renders) */
  rng?: () => number;
  /** where the mix goes; defaults to `ac.destination` */
  destination?: AudioNode;
}

export interface EngineCore {
  readonly ac: BaseAudioContext;
  /** live node / voice counters (leak test) */
  readonly stats: { nodes: number; voices: number };
  /** the last node of the chain (post limiter) – tap it for a level meter */
  readonly output: AudioNode;
  /** master gain 0…1 (already perceptually scaled by the caller) */
  setMaster(gain: number, tau?: number): void;
  play(sfx: Sfx, opts?: SfxOptions): void;
  footstep(surface: Surface, strength?: number): void;
  note(midi: number, duration?: number): void;
  setAmbience(a: Ambience): void;
  setVehicle(v: VehicleSound | null): void;
  setLoop(loop: Loop, on: boolean, volume?: number): void;
  silence(): void;
  /** scheduler tick – call about ten times a second (birds, jingles, gusts, clean-up) */
  pump(): void;
  dispose(): void;
}

/** Category balance (dB). Recipes are trimmed individually; these set how the families sit against each other. */
export const BUS_DB: Record<BusName, number> = {
  sfx: 0,
  steps: -2,
  music: -7,
  ambience: 3,
  vehicle: 0,
  loops: 0,
};

const LIMIT_THRESHOLD_DB = -10;
const LIMIT_RATIO = 12;
/** absolute ceiling of the soft clipper (≈ -1.6 dBFS) */
const CEILING = 0.83;
/** hard caps so that nothing can pile up */
const MAX_VOICES = 44;
const MAX_STEP_VOICES_GAP = 0.055;
const MAX_NOTES = 12;
/** events are scheduled this far ahead of `currentTime` */
const HORIZON = 0.35;
const LATENCY = 0.012;

function softClipCurve(): Float32Array<ArrayBuffer> {
  // identity up to the knee, then a tanh shoulder that approaches CEILING
  const n = 4097;
  const c = new Float32Array(n);
  const knee = 0.6;
  const range = 2; // input range mapped onto the curve: -2 … +2
  for (let i = 0; i < n; i++) {
    const x = ((i / (n - 1)) * 2 - 1) * range;
    const a = Math.abs(x);
    const y = a <= knee ? a : knee + (CEILING - knee) * Math.tanh((a - knee) / (CEILING - knee));
    c[i] = Math.sign(x) * y;
  }
  return c;
}

export function createEngine(ac: BaseAudioContext, opts: EngineOptions = {}): EngineCore {
  const rng = opts.rng ?? Math.random;

  // ---- master chain
  const pre = ac.createGain();
  const dc = ac.createBiquadFilter();
  dc.type = 'highpass';
  dc.frequency.value = 24;
  dc.Q.value = 0.5;
  const master = ac.createGain();
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = LIMIT_THRESHOLD_DB;
  comp.knee.value = 0;
  comp.ratio.value = LIMIT_RATIO;
  comp.attack.value = 0.003;
  comp.release.value = 0.18;
  // The Web Audio compressor adds a fixed make-up gain of (1 / curve(1))^0.6; take it out again so that quiet
  // signals pass at unity and the node only ever turns things DOWN.
  const fullRangeDb = LIMIT_THRESHOLD_DB - LIMIT_THRESHOLD_DB / LIMIT_RATIO;
  const unmake = ac.createGain();
  unmake.gain.value = dbToGain(fullRangeDb * 0.6);
  // the waveshaper maps input -1…1 onto the curve, so scale into / out of its ±2 range
  const clipIn = ac.createGain();
  clipIn.gain.value = 0.5;
  const clip = ac.createWaveShaper();
  clip.curve = softClipCurve();
  const output = ac.createGain();
  chain(pre, dc, master, comp, unmake, clipIn, clip, output);
  output.connect(opts.destination ?? ac.destination);

  const mkBus = (name: BusName): GainNode => {
    const b = ac.createGain();
    b.gain.value = dbToGain(BUS_DB[name]);
    b.connect(pre);
    return b;
  };
  const bus: Record<BusName, GainNode> = {
    sfx: mkBus('sfx'),
    steps: mkBus('steps'),
    music: mkBus('music'),
    ambience: mkBus('ambience'),
    vehicle: mkBus('vehicle'),
    loops: mkBus('loops'),
  };

  const g: Graph = {
    ac,
    rng,
    noise: {
      white: makeNoise(ac, 'white', 3.1, 11),
      pink: makeNoise(ac, 'pink', 4.3, 23),
      brown: makeNoise(ac, 'brown', 3.7, 37),
    },
    bus,
    stats: { nodes: 0, voices: 0 },
    cache: new Map(),
  };

  const ambience = new AmbienceSynth(g, bus.ambience);
  const vehicle = new VehicleSynth(g, bus.vehicle);
  const loops = new LoopSynth(g, bus.loops);

  const lastPlay = new Map<string, number>();
  let stepSide = 1;
  let notes: { end: number; damp: (at: number) => void }[] = [];
  let disposed = false;

  /** rate limiter: true when `key` may fire now */
  const allow = (key: string, now: number, gap: number): boolean => {
    const last = lastPlay.get(key);
    if (last !== undefined && now - last < gap && now >= last) return false;
    lastPlay.set(key, now);
    return true;
  };

  const core: EngineCore = {
    ac,
    stats: g.stats,
    output,

    setMaster(gain, tau = 0.03) {
      master.gain.setTargetAtTime(clamp(gain, 0, 1), ac.currentTime, tau);
    },

    play(sfx, o) {
      const recipe = SFX[sfx];
      const info = SFX_INFO[sfx];
      if (disposed || !recipe || !info) return;
      const now = ac.currentTime;
      if (g.stats.voices >= MAX_VOICES || !allow(sfx, now, info.minGap)) return;
      const vol = clamp(o?.volume ?? 1, 0, 1);
      if (vol <= 0.001) return;
      const t = now + LATENCY;
      const pitch = clamp(o?.pitch ?? 1, 0.25, 4) * (1 + rr(rng, -info.jitter, info.jitter));
      const v = new Voice(g, t, pitch);
      const level = v.gain(info.gain * vol * rr(rng, 0.92, 1.05));
      chain(level, v.pan(o?.pan ?? 0), bus.sfx);
      recipe(v, level, t, rng);
    },

    footstep(surface, strength = 0.6) {
      if (disposed) return;
      const now = ac.currentTime;
      if (g.stats.voices >= MAX_VOICES - 6 || !allow('step', now, MAX_STEP_VOICES_GAP)) return;
      const t = now + LATENCY;
      const v = new Voice(g, t, 1 + rr(rng, -0.07, 0.07));
      stepSide = -stepSide;
      const pan = v.pan(stepSide * rr(rng, 0.08, 0.16));
      pan.connect(bus.steps);
      playStep(v, pan, t, surface, clamp(strength, 0, 1.3), rng);
    },

    note(midi, duration = 0.6) {
      if (disposed || !Number.isFinite(midi)) return;
      const now = ac.currentTime;
      notes = notes.filter((n) => n.end > now);
      if (g.stats.voices >= MAX_VOICES || !allow(`n${Math.round(midi)}`, now, 0.03)) return;
      // polyphony cap: damp the oldest note instead of refusing the new one
      while (notes.length >= MAX_NOTES) notes.shift()!.damp(now);
      // fingers never land perfectly together: a few ms of scatter also keeps chords from stacking their attacks
      const t = now + LATENCY + rng() * 0.009;
      const v = new Voice(g, t);
      // low notes a little to the left, high notes to the right – like sitting at the keyboard
      const pan = v.pan(clamp((midi - 60) / 48, -0.5, 0.5));
      pan.connect(bus.music);
      const damp = pianoNote(v, pan, t, midi, duration, rng);
      notes.push({ end: v.end, damp });
    },

    setAmbience(a) {
      if (disposed || !a) return;
      ambience.set(a, ac.currentTime);
    },

    setVehicle(v) {
      if (disposed) return;
      vehicle.set(v, ac.currentTime);
    },

    setLoop(loop, on, volume = 1) {
      if (disposed) return;
      loops.set(loop, on, volume, ac.currentTime);
    },

    silence() {
      if (disposed) return;
      const now = ac.currentTime;
      loops.allOff(now);
      vehicle.set(null, now);
      ambience.fadeOut(now);
    },

    pump() {
      if (disposed) return;
      const now = ac.currentTime;
      ambience.pump(now, HORIZON);
      loops.pump(now, HORIZON);
      vehicle.pump(now);
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      ambience.dispose();
      vehicle.dispose();
      loops.dispose();
      for (const n of [pre, dc, master, comp, unmake, clipIn, clip, output, ...Object.values(bus)]) {
        try {
          n.disconnect();
        } catch {
          /* ignore */
        }
      }
    },
  };
  return core;
}
