import type { Quality } from '../../store/quality';

/**
 * What each quality preset of the 3D view turns on. `low` is the plain forward renderer (no post
 * processing), `high` (the default) adds ambient occlusion, bloom, grading and the cheap lighting tricks,
 * `ultra` adds the expensive effects for a strong GPU.
 */
export interface RenderPreset {
  quality: Quality;
  /**
   * upper limit of the device pixel ratio. `high` renders at CSS resolution, as it effectively did before
   * (N8AO was sized in CSS pixels, so the scene was never drawn at 2× anyway); `ultra` renders sharper on
   * HiDPI screens.
   */
  pixelRatioCap: number;
  /** post-processing chain (AO, bloom, graded output, SMAA); off = render straight to the canvas */
  post: boolean;
  /**
   * multisample antialiasing of the scene render with post-processing on (0 = off). Off on every preset:
   * N8AO reads one depth sample per pixel while the colour is the resolved average, which left dotted
   * bright seams along edges and made edges flip back and forth while walking; SMAA alone was steadier.
   */
  msaa: number;
  /** N8AO quality mode */
  ao: 'Performance' | 'Low' | 'Medium' | 'High' | 'Ultra';
  /** AO at half resolution with depth-aware upsampling (looks the same here, ~10% cheaper overall) */
  aoHalfRes: boolean;
  /** frames averaged with sub-pixel jitter while the camera stands still (0 = off) */
  accumulate: number;
  /** sun shadow map size */
  shadowMapSize: number;
  /** walking: a tighter sun shadow map pushed ahead of the camera, with a smaller blur */
  sharpShadows: boolean;
  /** pool of area lights that bring daylight in through the nearest windows */
  windowLights: number;
  /** interior surfaces see less of the sky (ambient + reflections) than outdoor ones, the camera adapts
   * its exposure indoors (needs the window lights to look right) */
  indoorAmbient: boolean;
  /** nearest lit lamps that cast (soft) shadows at night */
  lampShadows: number;
  /** blades of grass around the camera */
  grass: boolean;
  /** photo: resolution multiplier and jittered samples per pixel */
  photoScale: number;
  photoSamples: number;
}

export const PRESETS: Record<Quality, RenderPreset> = {
  low: {
    quality: 'low',
    pixelRatioCap: 1,
    post: false,
    msaa: 0,
    ao: 'Low',
    aoHalfRes: true,
    accumulate: 0,
    shadowMapSize: 2048,
    sharpShadows: false,
    windowLights: 0,
    indoorAmbient: false,
    lampShadows: 0,
    grass: false,
    photoScale: 1,
    photoSamples: 1,
  },
  high: {
    quality: 'high',
    pixelRatioCap: 1,
    post: true,
    msaa: 0,
    ao: 'Medium',
    aoHalfRes: true,
    accumulate: 0,
    shadowMapSize: 4096,
    sharpShadows: false,
    windowLights: 3,
    indoorAmbient: true,
    lampShadows: 0,
    grass: false,
    photoScale: 2,
    photoSamples: 4,
  },
  ultra: {
    quality: 'ultra',
    pixelRatioCap: 1.5,
    post: true,
    msaa: 0,
    ao: 'High',
    aoHalfRes: false,
    accumulate: 16,
    shadowMapSize: 4096,
    sharpShadows: true,
    windowLights: 6,
    indoorAmbient: true,
    lampShadows: 1,
    grass: true,
    photoScale: 2,
    photoSamples: 6,
  },
};
