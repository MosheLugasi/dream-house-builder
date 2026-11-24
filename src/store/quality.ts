/**
 * Rendering quality preset of the 3D view. `high` is the default; `ultra` adds the expensive effects
 * (see `render3d/render/presets.ts`). The choice is a device preference, so it lives in localStorage and
 * not in the project file.
 *
 * "Automatic" (the default until the player picks a preset) starts at `high` and steps the quality down
 * while the frame rate stays low (`render3d/render/AdaptiveQuality.ts`).
 */
export type Quality = 'low' | 'high' | 'ultra';
export type QualityChoice = Quality | 'auto';

export const QUALITIES: readonly Quality[] = ['low', 'high', 'ultra'];

const KEY = 'dhb.quality';

function stored(): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
  } catch {
    return null; /* storage unavailable */
  }
}

/** The player's choice: a preset, or automatic (also when nothing was chosen yet). */
export function loadQualityChoice(): QualityChoice {
  const v = stored();
  if (v && (QUALITIES as readonly string[]).includes(v)) return v as Quality;
  return 'auto';
}

/** The preset to start from (automatic starts from `high`). */
export function loadQuality(): Quality {
  const c = loadQualityChoice();
  return c === 'auto' ? 'high' : c;
}

export function saveQuality(q: QualityChoice): void {
  try {
    localStorage.setItem(KEY, q);
  } catch {
    /* storage unavailable: the choice lasts for this session only */
  }
}
