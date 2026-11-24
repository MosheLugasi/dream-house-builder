import type { Quality } from '../../store/quality';

/**
 * One step of the automatic quality ladder, applied on top of the chosen preset. The first steps change
 * nothing the shaders depend on (so stepping down never stalls the frame); only the last one switches to
 * the plain `low` preset.
 */
export interface QualityStep {
  /** multiplies the preset's pixel ratio (the canvas is stretched to the page) */
  scale: number;
  /** cheapest ambient-occlusion mode */
  lightAo: boolean;
  /** glow around lamps and bright windows */
  bloom: boolean;
  /** multiplies the sun's shadow map size */
  shadow: number;
  /** walking, the sun's shadow map is redrawn every n-th frame (it costs a second pass over the scene) */
  shadowEvery: number;
  /** replaces the preset (last resort: recompiles every shader once) */
  preset?: Quality;
}

export const QUALITY_STEPS: readonly QualityStep[] = [
  { scale: 1, lightAo: false, bloom: true, shadow: 1, shadowEvery: 1 },
  { scale: 1, lightAo: false, bloom: true, shadow: 1, shadowEvery: 2 },
  { scale: 0.85, lightAo: false, bloom: true, shadow: 1, shadowEvery: 2 },
  { scale: 0.75, lightAo: true, bloom: true, shadow: 1, shadowEvery: 2 },
  { scale: 0.67, lightAo: true, bloom: false, shadow: 0.5, shadowEvery: 2 },
  { scale: 0.55, lightAo: true, bloom: false, shadow: 0.5, shadowEvery: 2 },
  { scale: 0.67, lightAo: true, bloom: false, shadow: 0.5, shadowEvery: 2, preset: 'low' },
];

export interface GovernorOptions {
  /** a frame slower than this (ms) counts as slow: 28 ms ≈ 36 frames per second */
  slowMs: number;
  /** length of one measuring window (ms) */
  windowMs: number;
  /** frames a window needs to count */
  minFrames: number;
  /** after a step (or a pause) the frames of this long are not measured: things settle first (ms) */
  settleMs: number;
}

const DEFAULTS: GovernorOptions = { slowMs: 28, windowMs: 2500, minFrames: 12, settleMs: 1500 };

/**
 * Automatic quality: watches the real time between frames and steps the quality down while the frame
 * rate stays low. It judges a whole window by its median frame (single hitches – a shader, a texture, a
 * garbage collection – do not count) and only ever steps down, so it never flaps between two levels; a
 * new session starts at the top again.
 */
export class FrameGovernor {
  level = 0;
  private frames: number[] = [];
  private windowStart = -1;
  private pausedUntil = 0;
  private readonly opts: GovernorOptions;

  constructor(
    readonly maxLevel = QUALITY_STEPS.length - 1,
    opts: Partial<GovernorOptions> = {},
  ) {
    this.opts = { ...DEFAULTS, ...opts };
  }

  get step(): QualityStep {
    return QUALITY_STEPS[this.level];
  }

  /** Do not measure for a while (something big is being built or compiled). */
  pause(now: number, ms = this.opts.settleMs): void {
    this.pausedUntil = Math.max(this.pausedUntil, now + ms);
    this.frames = [];
    this.windowStart = -1;
  }

  /** Back to the top (the player chose a preset or switched automatic quality on again). */
  reset(now: number): void {
    this.level = 0;
    this.pause(now);
  }

  /**
   * Report a drawn frame: `dtMs` since the previous drawn frame. Returns true when the level changed
   * (the caller applies `step`).
   */
  frame(dtMs: number, now: number): boolean {
    if (now < this.pausedUntil || !(dtMs > 0)) return false;
    if (this.windowStart < 0) this.windowStart = now;
    // (a frame of a second – the tab was in the background, a long build – says little about the GPU)
    this.frames.push(Math.min(dtMs, 250));
    if (now - this.windowStart < this.opts.windowMs) return false;
    const enough = this.frames.length >= this.opts.minFrames || now - this.windowStart >= this.opts.windowMs * 2;
    if (!enough) return false;
    const sorted = [...this.frames].sort((a, b) => a - b);
    const median = sorted[sorted.length >> 1];
    this.frames = [];
    this.windowStart = -1;
    if (median > this.opts.slowMs && this.level < this.maxLevel) {
      this.level++;
      this.pause(now);
      return true;
    }
    return false;
  }
}
