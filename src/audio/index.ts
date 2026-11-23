import type { AudioEngine } from './types';

/** Silent stand-in used until the real engine is loaded (and in tests). */
const silent: AudioEngine = {
  unlock() {},
  unlocked: false,
  muted: false,
  volume: 1,
  play() {},
  footstep() {},
  note() {},
  setAmbience() {},
  setVehicle() {},
  setLoop() {},
  silence() {},
};

/** The game's sound engine. A live binding: it starts silent and is swapped for the real one. */
export let audio: AudioEngine = silent;

// The synthesizer is loaded lazily and only in a browser.
if (typeof window !== 'undefined') {
  const mods = import.meta.glob<{ audio: AudioEngine }>('./AudioEngine.ts');
  const load = mods['./AudioEngine.ts'];
  if (load) {
    load()
      .then((m) => {
        if (m.audio) audio = m.audio;
      })
      .catch((err) => console.warn('sound is unavailable', err));
  }
}
