/**
 * The game's sound engine singleton (`audio`). Everything is synthesized at runtime with the Web Audio API.
 *
 * - Importing this module has no side effects (safe under Node / Vitest): no `window`, no `AudioContext`.
 * - Nothing sounds, and no AudioContext exists, until `unlock()` is called from a user gesture.
 * - Every method is a silent no-op before that, while muted, or when Web Audio is missing.
 * - `muted` / `volume` persist in `localStorage['dhb.audio']`.
 *
 * The synthesis lives in `core.ts` (`createEngine(ctx)`), which also runs on an `OfflineAudioContext` – see
 * `tools/audio-preview` for the audition page and the measuring self-test.
 */
import type { Ambience, AudioEngine, Loop, Sfx, SfxOptions, Surface, VehicleSound } from './types';
import { createEngine, type EngineCore } from './core';

export type { Ambience, AudioEngine, Loop, Sfx, SfxOptions, Surface, VehicleSound } from './types';
export { createEngine, type EngineCore, type EngineOptions } from './core';

const STORAGE_KEY = 'dhb.audio';
const DEFAULT_VOLUME = 0.8;

type Ctor = new (opts?: AudioContextOptions) => AudioContext;

function contextCtor(): Ctor | null {
  const w = globalThis as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

class LiveAudio implements AudioEngine {
  private ctx: AudioContext | null = null;
  private core: EngineCore | null = null;
  private failed = false;
  private running = false;
  private loaded = false;
  private _muted = false;
  private _volume = DEFAULT_VOLUME;
  private timer: ReturnType<typeof setInterval> | null = null;
  private suspendTimer: ReturnType<typeof setTimeout> | null = null;
  // what the game asked for before the first gesture, replayed on unlock
  private wantAmbience: Ambience | null = null;
  private wantLoops = new Map<Loop, number>();

  // ---------------------------------------------------------------- settings

  private load(): void {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw) as { muted?: unknown; volume?: unknown };
      if (typeof s.muted === 'boolean') this._muted = s.muted;
      if (typeof s.volume === 'number' && Number.isFinite(s.volume)) this._volume = Math.min(1, Math.max(0, s.volume));
    } catch {
      /* private mode, Node, corrupted value – keep defaults */
    }
  }

  private save(): void {
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify({ muted: this._muted, volume: this._volume }));
    } catch {
      /* ignore */
    }
  }

  get muted(): boolean {
    this.load();
    return this._muted;
  }

  set muted(m: boolean) {
    this.load();
    m = !!m;
    if (m === this._muted) return;
    this._muted = m;
    this.save();
    this.applyMaster();
  }

  get volume(): number {
    this.load();
    return this._volume;
  }

  set volume(v: number) {
    this.load();
    if (!Number.isFinite(v)) return;
    v = Math.min(1, Math.max(0, v));
    if (v === this._volume) return;
    this._volume = v;
    this.save();
    this.applyMaster();
  }

  /** slider position → gain: a gentle curve so the lower half of the slider is still usable */
  private masterGain(): number {
    return this._muted ? 0 : Math.pow(this._volume, 1.6);
  }

  private applyMaster(): void {
    const { ctx, core } = this;
    if (!ctx || !core) return;
    if (this.suspendTimer !== null) {
      clearTimeout(this.suspendTimer);
      this.suspendTimer = null;
    }
    if (this._muted) {
      core.setMaster(0, 0.03);
      // once faded, stop the audio thread altogether: a muted game costs no CPU
      this.suspendTimer = setTimeout(() => {
        this.suspendTimer = null;
        if (this._muted && ctx.state === 'running') void ctx.suspend().catch(() => {});
      }, 250);
    } else {
      if (ctx.state !== 'running' && !this.hidden()) void ctx.resume().catch(() => {});
      core.setMaster(this.masterGain(), 0.05);
    }
  }

  private hidden(): boolean {
    return typeof document !== 'undefined' && document.visibilityState === 'hidden';
  }

  // ---------------------------------------------------------------- lifecycle

  get unlocked(): boolean {
    if (this.ctx && this.ctx.state === 'running') this.running = true;
    return this.running && this.core !== null;
  }

  unlock(): void {
    if (this.failed) return;
    this.load();
    if (!this.ctx) {
      const AC = contextCtor();
      if (!AC) {
        this.failed = true;
        return;
      }
      try {
        const ctx = new AC({ latencyHint: 'interactive' });
        const core = createEngine(ctx);
        this.ctx = ctx;
        this.core = core;
        core.setMaster(this.masterGain(), 0.01);
        ctx.onstatechange = () => {
          if (ctx.state === 'running') this.running = true;
        };
        this.timer = setInterval(() => {
          if (ctx.state === 'running') core.pump();
        }, 100);
        if (typeof document !== 'undefined') {
          document.addEventListener('visibilitychange', () => {
            // a background tab should not keep chirping
            if (this.hidden()) {
              if (ctx.state === 'running') void ctx.suspend().catch(() => {});
            } else if (!this._muted && this.running) void ctx.resume().catch(() => {});
          });
        }
        // replay the state requested before the first gesture
        if (this.wantAmbience) core.setAmbience(this.wantAmbience);
        for (const [loop, vol] of this.wantLoops) core.setLoop(loop, true, vol);
      } catch {
        this.failed = true;
        this.ctx = null;
        this.core = null;
        return;
      }
    }
    const ctx = this.ctx;
    if (ctx && !this._muted && ctx.state !== 'running' && ctx.state !== 'closed' && !this.hidden()) {
      void ctx
        .resume()
        .then(() => {
          if (ctx.state === 'running') this.running = true;
        })
        .catch(() => {});
    }
    // muted: the context is parked (suspended), but the engine counts as unlocked once it exists
    if (this._muted) {
      this.running = true;
      if (this.suspendTimer === null && ctx && ctx.state === 'running') this.applyMaster();
    }
  }

  /** the engine, only when a one-shot may actually sound */
  private live(): EngineCore | null {
    if (!this.core || !this.ctx || this._muted || this.ctx.state !== 'running') return null;
    return this.core;
  }

  // ---------------------------------------------------------------- sounds

  play(sfx: Sfx, opts?: SfxOptions): void {
    try {
      this.live()?.play(sfx, opts);
    } catch {
      /* sound must never break the game */
    }
  }

  footstep(surface: Surface, strength?: number): void {
    try {
      this.live()?.footstep(surface, strength);
    } catch {
      /* ignore */
    }
  }

  note(midi: number, duration?: number): void {
    try {
      this.live()?.note(midi, duration);
    } catch {
      /* ignore */
    }
  }

  setAmbience(a: Ambience): void {
    this.wantAmbience = a ? { ...a } : null;
    try {
      this.core?.setAmbience(a);
    } catch {
      /* ignore */
    }
  }

  setVehicle(v: VehicleSound | null): void {
    try {
      // while muted / suspended only a stop is forwarded (nothing to build for a sound nobody hears)
      if (v === null) this.core?.setVehicle(null);
      else this.live()?.setVehicle(v);
    } catch {
      /* ignore */
    }
  }

  setLoop(loop: Loop, on: boolean, volume = 1): void {
    if (on) this.wantLoops.set(loop, volume);
    else this.wantLoops.delete(loop);
    try {
      this.core?.setLoop(loop, on, volume);
    } catch {
      /* ignore */
    }
  }

  silence(): void {
    this.wantAmbience = null;
    this.wantLoops.clear();
    try {
      this.core?.silence();
    } catch {
      /* ignore */
    }
  }

  // ---------------------------------------------------------------- extras (beyond the contract)

  /** For tools and tests: the live context and engine, or null before `unlock()`. */
  debug(): { ctx: AudioContext; core: EngineCore } | null {
    return this.ctx && this.core ? { ctx: this.ctx, core: this.core } : null;
  }
}

export const audio: AudioEngine & { debug(): { ctx: AudioContext; core: EngineCore } | null } = new LiveAudio();
