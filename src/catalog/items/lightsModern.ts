import type { FurnitureDef } from '../types';
import { MODERN_CEILING } from './_lightsModernCeiling';
import { MODERN_HANGING } from './_lightsModernHanging';
import { MODERN_STANDING } from './_lightsModernStanding';
import { MODERN_WALL } from './_lightsModernWall';

/**
 * Modern light fittings of every kind: pendants, chandeliers, ceiling, spots & tracks, wall, floor,
 * table, LED profile and outdoor. All are parametric: they rebuild properly at any size (longer cord,
 * bigger round shade, longer track...) and publish the real light position on `userData.anchors`.
 */
export const MODERN_LIGHTS: FurnitureDef[] = [...MODERN_HANGING, ...MODERN_CEILING, ...MODERN_WALL, ...MODERN_STANDING].map(linkRound);

/** Round fittings (same width and depth, same range) resize width and depth together. */
function linkRound(def: FurnitureDef): FurnitureDef {
  const r = def.resize;
  if (!r || !r.w || !r.d || def.size.w !== def.size.d || r.w[0] !== r.d[0] || r.w[1] !== r.d[1]) return def;
  return { ...def, resize: { ...r, linked: true } };
}
