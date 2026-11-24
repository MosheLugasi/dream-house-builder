/**
 * A small WebAudio band for the dance game: drums, bass, chord pad and lead, scheduled ahead on the
 * audio clock so that the arrows can be timed against what is really heard. It has its own context
 * (the song clock) and follows the game's mute switch.
 */
import { sound } from '../../../audio/sound';
import type { MusicEvent, Song } from './chart';

const mtof = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

export class Band {
  readonly ac: AudioContext | null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private startAt = 0;
  private next = 0;
  private song: Song | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private spb = 0.5;
  /** called (on the main thread, roughly in time) for every kick / beat, for the visuals */
  onBeat: ((inst: MusicEvent['inst'], vel: number) => void) | null = null;
  private pending: Array<{ at: number; inst: MusicEvent['inst']; vel: number }> = [];

  constructor() {
    let ac: AudioContext | null = null;
    try {
      const Ctor = typeof window !== 'undefined' ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined;
      if (Ctor) ac = new Ctor();
    } catch {
      ac = null;
    }
    this.ac = ac;
    if (!ac) return;
    void ac.resume();
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.ratio.value = 3;
    this.master = ac.createGain();
    this.master.gain.value = sound.isMuted() ? 0 : 0.55;
    this.master.connect(comp).connect(ac.destination);
    const len = ac.sampleRate;
    this.noise = ac.createBuffer(1, len, ac.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  /** the audio clock runs (a context needs a user gesture; tests / headless may not have one) */
  get running(): boolean {
    return !!this.ac && this.ac.state === 'running';
  }

  /** seconds since the song started, as heard (output latency compensated) */
  songTime(): number {
    if (!this.ac) return 0;
    const lat = (this.ac as AudioContext & { outputLatency?: number }).outputLatency ?? this.ac.baseLatency ?? 0;
    return this.ac.currentTime - this.startAt - Math.min(0.1, lat || 0);
  }

  /** start a song `lead` seconds from now */
  play(song: Song, lead = 0.2): void {
    if (!this.ac) return;
    this.song = song;
    this.spb = 60 / song.bpm;
    this.startAt = this.ac.currentTime + lead;
    this.next = 0;
    this.timer = setInterval(() => this.pump(), 25);
    this.pump();
  }

  /** follow the mute switch; deliver beat callbacks that are due */
  tick(): void {
    if (this.master && this.ac) {
      const target = sound.isMuted() ? 0 : 0.55;
      if (Math.abs(this.master.gain.value - target) > 0.01) this.master.gain.setTargetAtTime(target, this.ac.currentTime, 0.05);
    }
    if (!this.ac || !this.pending.length) return;
    const now = this.ac.currentTime;
    while (this.pending.length && this.pending[0].at <= now) {
      const p = this.pending.shift()!;
      this.onBeat?.(p.inst, p.vel);
    }
  }

  /** a short sound for a missed arrow */
  miss(): void {
    const ac = this.ac;
    if (!ac || !this.master) return;
    const t = ac.currentTime;
    this.tone(t, 180, 0.12, 'sawtooth', 0.12, 90);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.song = null;
    this.pending = [];
    if (this.ac && this.master) {
      this.master.gain.setTargetAtTime(0, this.ac.currentTime, 0.08);
      const ac = this.ac;
      setTimeout(() => void ac.close().catch(() => undefined), 400);
    }
  }

  private pump(): void {
    const ac = this.ac;
    const song = this.song;
    if (!ac || !song) return;
    const horizon = ac.currentTime + 0.3;
    const ev = song.music;
    while (this.next < ev.length) {
      const e = ev[this.next];
      const at = this.startAt + e.t * this.spb;
      if (at > horizon) break;
      this.next++;
      if (at < ac.currentTime - 0.05) continue;
      this.play1(e, at);
      if (e.inst === 'kick' || e.inst === 'snare' || e.inst === 'clap' || e.inst === 'crash') this.pending.push({ at, inst: e.inst, vel: e.vel ?? 1 });
    }
  }

  private play1(e: MusicEvent, t: number): void {
    const v = e.vel ?? 1;
    const len = (e.len ?? 0.25) * this.spb;
    switch (e.inst) {
      case 'kick':
        this.tone(t, 150, 0.32, 'sine', 0.95 * v, 42);
        this.hiss(t, 0.02, 'lowpass', 1500, 0.25 * v);
        break;
      case 'snare':
        this.tone(t, 200, 0.12, 'triangle', 0.32 * v, 150);
        this.hiss(t, 0.16, 'highpass', 1800, 0.5 * v);
        break;
      case 'clap':
        for (const d of [0, 0.012, 0.025]) this.hiss(t + d, 0.09, 'bandpass', 1300, 0.55 * v);
        break;
      case 'hat':
        this.hiss(t, 0.04, 'highpass', 7500, 0.28 * v);
        break;
      case 'crash':
        this.hiss(t, 1.2, 'highpass', 4500, 0.28 * v);
        break;
      case 'bass':
        for (const m of e.midi ?? []) this.synth(t, mtof(m), len, 'sawtooth', 0.26 * v, 520, 0.005);
        break;
      case 'chord':
        for (const m of e.midi ?? []) {
          this.synth(t, mtof(m), len, 'sawtooth', 0.06 * v, 1400, len > 1 ? 0.08 : 0.01, 6);
          this.synth(t, mtof(m), len, 'sawtooth', 0.06 * v, 1400, len > 1 ? 0.08 : 0.01, -6);
        }
        break;
      case 'lead':
        for (const m of e.midi ?? []) {
          this.synth(t, mtof(m), len, 'square', 0.085 * v, 2600, 0.01, 0, true);
          this.synth(t, mtof(m + 12), len * 0.6, 'triangle', 0.05 * v, 5000, 0.005);
        }
        break;
    }
  }

  private tone(t: number, f: number, dur: number, type: OscillatorType, gain: number, to?: number): void {
    const ac = this.ac!;
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private hiss(t: number, dur: number, type: BiquadFilterType, freq: number, gain: number): void {
    const ac = this.ac!;
    const src = ac.createBufferSource();
    src.buffer = this.noise;
    const f = ac.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ac.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master!);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  private synth(t: number, f: number, dur: number, type: OscillatorType, gain: number, cutoff: number, attack: number, detune = 0, vibrato = false): void {
    const ac = this.ac!;
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.value = f;
    o.detune.value = detune;
    let lfo: OscillatorNode | null = null;
    if (vibrato && dur > 0.25) {
      lfo = ac.createOscillator();
      lfo.frequency.value = 5.5;
      const lg = ac.createGain();
      lg.gain.setValueAtTime(0, t);
      lg.gain.linearRampToValueAtTime(f * 0.006, t + dur * 0.6);
      lfo.connect(lg).connect(o.frequency);
      lfo.start(t);
      lfo.stop(t + dur + 0.1);
    }
    const flt = ac.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.setValueAtTime(cutoff, t);
    flt.frequency.exponentialRampToValueAtTime(Math.max(200, cutoff * 0.45), t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.setValueAtTime(gain, t + Math.max(attack, dur * 0.7));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.08);
    o.connect(flt).connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + dur + 0.12);
  }
}
