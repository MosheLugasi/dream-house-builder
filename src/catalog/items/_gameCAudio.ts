/**
 * Team C – the sounds of a ride: the bell before it starts, the lift chain, wind rushing with the
 * speed, whooshes and screams on the drops.
 *
 * Chain clicks, bells, whooshes and the wind use the game's two engines (`sound`, `audio`). The
 * engines have no voice, so the screams ("וווי!" / "אאאה!") are synthesised here: a sawtooth
 * "larynx" through two vowel formants with vibrato and a pitch contour. They play on a small
 * AudioContext of their own that is created lazily (always after a key press) and stays silent
 * whenever the game is muted. Nothing here runs at import time.
 */
import { audio } from '../../audio';
import { sound, type Voice } from '../../audio/sound';
import type { RideBase } from './_gameCKit';

let ac: AudioContext | null = null;
let out: GainNode | null = null;

const muted = (): boolean => sound.isMuted() || audio.muted;

function ctx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ac) {
    const Ctor = (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) as typeof AudioContext | undefined;
    if (!Ctor) return null;
    try {
      ac = new Ctor();
      out = ac.createGain();
      out.gain.value = 0.5;
      const comp = ac.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.ratio.value = 6;
      out.connect(comp).connect(ac.destination);
    } catch {
      ac = null;
      return null;
    }
  }
  if (ac.state === 'suspended') void ac.resume();
  return ac;
}

/** vowel formants: [F1, F2] */
const VOWELS: Record<'a' | 'i' | 'u' | 'o', [number, number]> = { a: [850, 1450], i: [380, 2300], u: [360, 900], o: [560, 1000] };

/**
 * One screaming voice. `pitch` ~ fundamental (Hz), `dur` seconds, `vowel`, `level` 0..1,
 * `shape`: 'drop' (rise, hold, fall away) or 'whee' (glide up).
 */
function voice(a: AudioContext, dest: AudioNode, t0: number, pitch: number, dur: number, vowel: keyof typeof VOWELS, level: number, shape: 'drop' | 'whee'): void {
  const osc = a.createOscillator();
  osc.type = 'sawtooth';
  const f = osc.frequency;
  if (shape === 'whee') {
    f.setValueAtTime(pitch * 0.8, t0);
    f.exponentialRampToValueAtTime(pitch * 1.45, t0 + dur * 0.55);
    f.exponentialRampToValueAtTime(pitch * 1.1, t0 + dur);
  } else {
    f.setValueAtTime(pitch * 0.9, t0);
    f.exponentialRampToValueAtTime(pitch * 1.25, t0 + 0.18);
    f.setValueAtTime(pitch * 1.25, t0 + dur * 0.55);
    f.exponentialRampToValueAtTime(pitch * 0.85, t0 + dur);
  }
  // vibrato
  const lfo = a.createOscillator();
  lfo.frequency.value = 5.5 + Math.random() * 2;
  const lfoG = a.createGain();
  lfoG.gain.value = pitch * 0.035;
  lfo.connect(lfoG).connect(f);
  const [f1, f2] = VOWELS[vowel];
  const b1 = a.createBiquadFilter();
  b1.type = 'bandpass';
  b1.frequency.value = f1 * (pitch > 400 ? 1.15 : 1);
  b1.Q.value = 5;
  const b2 = a.createBiquadFilter();
  b2.type = 'bandpass';
  b2.frequency.value = f2 * (pitch > 400 ? 1.12 : 1);
  b2.Q.value = 7;
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(level, t0 + 0.07);
  g.gain.setValueAtTime(level, t0 + dur * 0.7);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  const g2 = a.createGain();
  g2.gain.value = 0.55;
  osc.connect(b1).connect(g);
  osc.connect(b2).connect(g2).connect(g);
  // breath
  const len = Math.floor(a.sampleRate * dur);
  const nb = a.createBuffer(1, len, a.sampleRate);
  const d = nb.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * 0.25;
  const ns = a.createBufferSource();
  ns.buffer = nb;
  const nf = a.createBiquadFilter();
  nf.type = 'bandpass';
  nf.frequency.value = f2;
  nf.Q.value = 1.5;
  ns.connect(nf).connect(g);
  g.connect(dest);
  osc.start(t0);
  lfo.start(t0);
  ns.start(t0);
  osc.stop(t0 + dur + 0.05);
  lfo.stop(t0 + dur + 0.05);
  ns.stop(t0 + dur + 0.05);
}

let wind: Voice | null = null;
let windOwner: RideBase | null = null;
let windSeen = 0;
let windTimer: ReturnType<typeof setInterval> | null = null;
let lastScream = 0;
let clackAcc = 0;

const nowS = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;

function stopWind(): void {
  wind?.stop();
  wind = null;
  windOwner = null;
  if (windTimer) clearInterval(windTimer);
  windTimer = null;
}

export const rideSound = {
  /**
   * A crowd of riders screaming (`n` voices); `kind` 'drop' = a long "אאאה", 'whee' = a gliding "וויי".
   * Plays only after a key press made sound possible and while not muted.
   */
  scream(n = 3, kind: 'drop' | 'whee' = 'drop', level = 0.3): void {
    if (muted()) return;
    const t = nowS();
    if (t - lastScream < 1.2) return;
    lastScream = t;
    const a = ctx();
    if (!a || !out) return;
    const t0 = a.currentTime + 0.02;
    const vowels: Array<keyof typeof VOWELS> = kind === 'whee' ? ['i', 'i', 'u'] : ['a', 'a', 'o', 'i'];
    for (let i = 0; i < n; i++) {
      const pitch = [520, 440, 610, 300, 700][i % 5] * (0.92 + Math.random() * 0.16);
      voice(a, out, t0 + i * 0.09 + Math.random() * 0.05, pitch, (kind === 'whee' ? 1.0 : 1.7) + Math.random() * 0.5, vowels[i % vowels.length], level / Math.sqrt(n), kind);
    }
  },
  bell(): void {
    audio.play('bell', { volume: 0.5 });
  },
  whoosh(volume = 0.8): void {
    audio.play('whoosh', { volume, pitch: 0.8 });
  },
  /** pneumatic brakes */
  brake(): void {
    sound.sfx('sizzle', 0.5);
  },
  bump(volume = 0.8): void {
    sound.sfx('bounce', volume);
    audio.play('kick', { volume: volume * 0.6, pitch: 0.7 });
  },
  /** the electric buzz of a bumper car */
  hum(): void {
    sound.sfx('switch', 0.12);
  },
  squeak(): void {
    sound.sfx('squeak', 0.15);
  },
  /** suspense at the top of the drop tower */
  heartbeat(): void {
    audio.play('kick', { volume: 0.35, pitch: 0.55 });
    setTimeout(() => audio.play('kick', { volume: 0.25, pitch: 0.5 }), 180);
  },
  /** chain lift: call every frame while climbing */
  chain(h: number, speed: number): void {
    clackAcc += h * Math.max(1, speed) * 3.2;
    if (clackAcc >= 1) {
      clackAcc = 0;
      sound.sfx('clack', 0.6);
    }
  },
  /** every frame from RideBase: the wind grows with the speed of the ride the player sits on */
  tick(rt: RideBase, h: void | number): void {
    void h;
    if (!rt.playerOn) {
      if (windOwner === rt) stopWind();
      return;
    }
    const v = Math.max(0, (rt.speed - 3) / 18);
    if (!wind && v > 0.02 && !muted()) {
      wind = sound.loop('fan');
      windOwner = rt;
      windSeen = nowS();
      // the item can disappear while ridden: fade the wind out when nobody keeps it alive
      windTimer = setInterval(() => {
        if (nowS() - windSeen > 0.5) stopWind();
      }, 300);
    }
    if (wind && windOwner === rt) {
      windSeen = nowS();
      wind.setVolume(Math.min(0.9, v) * (muted() ? 0 : 1));
    }
  },
};
