import type { Building } from '../../model/types';

/**
 * What the rooms of the buildings are made of – placement, storey heights, walls (and openings) – as a
 * list of values and references (the store's immutable updates keep a level's `walls` the same object
 * while only its furniture changes). Moving furniture leaves the key unchanged, so things derived from
 * the rooms are not rebuilt on every frame of a drag.
 */
export function roomsKey(buildings: readonly Building[], openings = false): unknown[] {
  const key: unknown[] = [];
  for (const b of buildings) {
    key.push(b.x, b.y, b.rotation, b.levels.length);
    for (const lvl of b.levels) {
      key.push(lvl.walls, lvl.height);
      if (openings) key.push(lvl.openings);
    }
  }
  return key;
}

export function sameKey(a: readonly unknown[] | null, b: readonly unknown[]): boolean {
  if (!a || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
