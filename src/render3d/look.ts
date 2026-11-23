import { DEFAULT_LOOK, type CharacterLook } from './Character';

const KEY = 'dream-house-builder:character';

/** The player's character look is a personal preference, stored outside the project file. */
export function loadLook(): CharacterLook {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    if (raw) return { ...DEFAULT_LOOK, ...(JSON.parse(raw) as Partial<CharacterLook>) };
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_LOOK };
}

export function saveLook(look: CharacterLook): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(look));
  } catch {
    /* ignore */
  }
}
