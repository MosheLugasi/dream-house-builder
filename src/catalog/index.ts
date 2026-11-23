import type * as THREE from 'three';
import type { BuildContext, FurnitureDef } from './types';
import { bake } from './kit';
import { LIVING } from './items/living';
import { DINING } from './items/dining';
import { KITCHEN } from './items/kitchen';
import { BEDROOM } from './items/bedroom';
import { BATHROOM } from './items/bathroom';
import { OFFICE } from './items/office';
import { KIDS } from './items/kids';
import { DECOR } from './items/decor';
import { OUTDOOR } from './items/outdoor';
import { LIGHTING } from './items/lighting';
import { SEATING } from './items/seating';
import { CHAIRS } from './items/chairs';
import { TABLES } from './items/tables';
import { BEDS } from './items/beds';
import { STORAGE } from './items/storage';
import { LIGHTS } from './items/lights';
import { TEXTILES } from './items/textiles';
import { PLANTS } from './items/plants';
import { WALL_DECOR } from './items/walldecor';
import { ACCESSORIES } from './items/accessories';
import { APPLIANCES } from './items/appliances';
import { ENTERTAINMENT } from './items/entertainment';
import { SPORTS } from './items/sports';
import { PETS } from './items/pets';
import { PLAYGROUND } from './items/playground';

export * from './types';

/** Resolve the colors of an item: slot defaults overridden by valid user choices. */
export function resolveColors(def: FurnitureDef, overrides?: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of def.colors ?? []) {
    const o = overrides?.[s.key];
    out[s.key] = typeof o === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(o.trim()) ? o.trim() : s.default;
  }
  return out;
}

const MAX_TEMPLATES = 900;
const templates = new Map<string, THREE.Object3D>();

/**
 * Wrap a raw definition so that `build`:
 *  - always receives fully resolved colors,
 *  - bakes the item into one mesh per material (few draw calls),
 *  - caches the baked template per (item, colors) and hands out cheap clones that share
 *    geometry and materials (so do not mutate them; disposing is harmless but pointless).
 */
function wrap(raw: FurnitureDef): FurnitureDef {
  const def: FurnitureDef = {
    ...raw,
    build(ctx: BuildContext): THREE.Object3D {
      const colors = resolveColors(raw, ctx?.colors);
      const key = `${raw.id}|${(raw.colors ?? []).map((s) => colors[s.key]).join(',')}`;
      let tpl = templates.get(key);
      if (!tpl) {
        tpl = bake(raw.build({ ...ctx, colors }), raw.id);
        if (templates.size >= MAX_TEMPLATES) {
          const first = templates.keys().next().value;
          if (first !== undefined) templates.delete(first);
        }
        templates.set(key, tpl);
      }
      const inst = tpl.clone(true);
      inst.userData.furnitureId = raw.id;
      return inst;
    },
    draw2d(ctx: CanvasRenderingContext2D, colors: Record<string, string>): void {
      ctx.save();
      try {
        raw.draw2d(ctx, resolveColors(raw, colors));
      } finally {
        ctx.restore();
      }
    },
  };
  return def;
}

const RAW: FurnitureDef[] = [
  ...LIVING,
  ...SEATING,
  ...DINING,
  ...CHAIRS,
  ...TABLES,
  ...KITCHEN,
  ...APPLIANCES,
  ...BEDROOM,
  ...BEDS,
  ...STORAGE,
  ...BATHROOM,
  ...OFFICE,
  ...KIDS,
  ...LIGHTING,
  ...LIGHTS,
  ...DECOR,
  ...PLANTS,
  ...WALL_DECOR,
  ...TEXTILES,
  ...ACCESSORIES,
  ...ENTERTAINMENT,
  ...SPORTS,
  ...PETS,
  ...OUTDOOR,
  ...PLAYGROUND,
];

if (import.meta.env?.DEV) {
  const seen = new Set<string>();
  for (const f of RAW) {
    if (seen.has(f.id)) console.warn(`duplicate furniture id: ${f.id}`);
    seen.add(f.id);
  }
}

export const FURNITURE: FurnitureDef[] = RAW.map(wrap);

const byId = new Map<string, FurnitureDef>(FURNITURE.map((f) => [f.id, f]));

export function getFurniture(id: string): FurnitureDef | undefined {
  return byId.get(id);
}
