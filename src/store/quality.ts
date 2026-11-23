/**
 * Rendering quality preset of the 3D view. `high` is the default; `ultra` adds the expensive effects
 * (see `render3d/render/presets.ts`). The choice is a device preference, so it lives in localStorage and
 * not in the project file.
 */
export type Quality = 'low' | 'high' | 'ultra';

export const QUALITIES: readonly Quality[] = ['low', 'high', 'ultra'];

const KEY = 'dhb.quality';

export function loadQuality(): Quality {
  try {
    const v = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    if (v && (QUALITIES as readonly string[]).includes(v)) return v as Quality;
  } catch {
    /* storage unavailable */
  }
  return 'high';
}

export function saveQuality(q: Quality): void {
  try {
    localStorage.setItem(KEY, q);
  } catch {
    /* storage unavailable: the choice lasts for this session only */
  }
}
