import { describe, expect, it } from 'vitest';
import { audio } from './AudioEngine';
import { SFX, SFX_INFO } from './sfx';

/** Under Node there is no Web Audio: the engine must import cleanly and every call must be a silent no-op. */
describe('audio engine without Web Audio', () => {
  it('imports without touching window / AudioContext and stays locked', () => {
    expect(audio.unlocked).toBe(false);
    expect(() => audio.unlock()).not.toThrow();
    expect(audio.unlocked).toBe(false);
  });

  it('treats every method as a no-op', () => {
    expect(() => {
      audio.play('horn', { volume: 0.5, pitch: 1.2, pan: -1 });
      audio.footstep('wood', 0.5);
      audio.note(60, 0.5);
      audio.setAmbience({ outdoor: 1, night: 0, wind: 0.2, rain: 0 });
      audio.setVehicle({ kind: 'car', speed: 5, throttle: 1 });
      audio.setVehicle(null);
      audio.setLoop('tv', true, 0.5);
      audio.setLoop('tv', false);
      audio.silence();
    }).not.toThrow();
  });

  it('keeps mute / volume settings even when storage is unavailable', () => {
    audio.volume = 0.4;
    expect(audio.volume).toBeCloseTo(0.4);
    audio.volume = 7;
    expect(audio.volume).toBe(1);
    audio.muted = true;
    expect(audio.muted).toBe(true);
    audio.muted = false;
    audio.volume = 0.8;
  });

  it('has a recipe and level info for every sfx', () => {
    expect(Object.keys(SFX).sort()).toEqual(Object.keys(SFX_INFO).sort());
  });
});
