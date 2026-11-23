/**
 * Sound contract. Everything is synthesized with the Web Audio API at runtime (no audio files).
 * The engine must be completely silent and side-effect free until `unlock()` was called from a
 * user gesture, and every method must be a safe no-op when Web Audio is unavailable.
 */
export type Surface = 'wood' | 'tile' | 'carpet' | 'grass' | 'asphalt' | 'stone' | 'sand' | 'water' | 'metal';

export type Sfx =
  | 'click'
  | 'place'
  | 'delete'
  | 'door-open'
  | 'door-close'
  | 'door-slide'
  | 'switch-on'
  | 'switch-off'
  | 'sit'
  | 'stand'
  | 'jump'
  | 'land'
  | 'star'
  | 'success'
  | 'fanfare'
  | 'camera'
  | 'whoosh'
  | 'horn'
  | 'bus-horn'
  | 'bike-bell'
  | 'splash'
  | 'flush'
  | 'bell'
  | 'squeak'
  | 'kick'
  | 'bounce'
  | 'goal'
  | 'bark'
  | 'meow'
  | 'purr'
  | 'yawn';

/** Continuous sounds that are switched on and off. */
export type Loop = 'tv' | 'tap' | 'shower' | 'washing' | 'fan' | 'stove' | 'fountain' | 'swing';

export interface SfxOptions {
  /** 0…1, default 1 */
  volume?: number;
  /** playback pitch factor, default 1 */
  pitch?: number;
  /** -1 (left) … 1 (right) */
  pan?: number;
}

export interface Ambience {
  /** 0 = deep indoors … 1 = outdoors */
  outdoor: number;
  /** 0 = day … 1 = night (birds fade out, crickets fade in) */
  night: number;
  /** 0…1 wind / air movement, default small */
  wind?: number;
  /** 0…1 rain intensity */
  rain?: number;
}

export interface VehicleSound {
  kind: 'car' | 'bus' | 'bicycle' | 'scooter' | 'other';
  /** m/s */
  speed: number;
  /** 0…1 accelerator */
  throttle: number;
}

export interface AudioEngine {
  /** Create / resume the AudioContext. Must be called from a user gesture; safe to call repeatedly. */
  unlock(): void;
  readonly unlocked: boolean;
  muted: boolean;
  /** master volume 0…1 */
  volume: number;
  play(sfx: Sfx, opts?: SfxOptions): void;
  /** One footstep on a surface; `strength` ~0.5 walking, 1 running or landing. */
  footstep(surface: Surface, strength?: number): void;
  /** A piano note (MIDI number, 60 = middle C). */
  note(midi: number, duration?: number): void;
  /** Smoothly move the ambient bed (birds, wind, crickets, room tone, rain) to these levels. */
  setAmbience(a: Ambience): void;
  /** Engine / drivetrain sound of the vehicle being driven; null = none. Call every frame while driving. */
  setVehicle(v: VehicleSound | null): void;
  /** Switch a continuous sound on or off; `volume` 0…1 (e.g. scaled by distance). */
  setLoop(loop: Loop, on: boolean, volume?: number): void;
  /** Stop every loop, the vehicle and fade the ambience out (leaving walk mode). */
  silence(): void;
}
