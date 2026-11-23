import type * as THREE from 'three';
import type { BuildContext, FurnitureDef, ItemSize, LocalPoint, ResizeSpec } from './types';
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
import { MODERN_LIGHTS } from './items/lightsModern';
import { KITCHEN_SETS } from './items/kitchenSets';
import { TEXTILES } from './items/textiles';
import { PLANTS } from './items/plants';
import { WALL_DECOR } from './items/walldecor';
import { ACCESSORIES } from './items/accessories';
import { APPLIANCES } from './items/appliances';
import { ENTERTAINMENT } from './items/entertainment';
import { SPORTS } from './items/sports';
import { PETS } from './items/pets';
import { BACKYARD } from './items/backyard';
import { STRUCTURE } from './items/structure';
import { PLAYGROUND } from './items/playground';
import { STREET } from './items/street';
import { PUBLIC } from './items/public';
import { VEHICLES } from './items/vehicles';
import { REAL_PETS } from './items/realpets';

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

// ---- sizes -----------------------------------------------------------------------------------

/** Items whose size is part of how they work: never resized. */
function fixedSize(def: FurnitureDef): boolean {
  return def.resize === false || !!def.vehicle || !!def.pet || !!def.ride || !!def.stair;
}

/** Allowed range per axis; an axis that cannot change has min === max === the catalog size. */
export function resizeRange(def: FurnitureDef): Required<ResizeSpec> {
  const { w, d, h } = def.size;
  if (fixedSize(def)) return { w: [w, w], d: [d, d], h: [h, h] };
  const spec = def.resize || null;
  const axis = (v: number, r: [number, number] | undefined): [number, number] => {
    if (!spec) return [Math.max(0.02, v * 0.5), v * 2];
    return r ? [Math.min(r[0], v), Math.max(r[1], v)] : [v, v];
  };
  return { w: axis(w, spec?.w), d: axis(d, spec?.d), h: axis(h, spec?.h) };
}

export function isResizable(def: FurnitureDef): boolean {
  const r = resizeRange(def);
  return r.w[0] < r.w[1] || r.d[0] < r.d[1] || r.h[0] < r.h[1];
}

/** A requested size, clamped into the item's range (missing / invalid values fall back to the catalog size). */
export function clampSize(def: FurnitureDef, size?: Partial<ItemSize> | null): ItemSize {
  const r = resizeRange(def);
  const pick = (v: unknown, fallback: number, [lo, hi]: [number, number]) => {
    const n = typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : fallback;
    return Math.round(Math.min(hi, Math.max(lo, n)) * 1000) / 1000;
  };
  return { w: pick(size?.w, def.size.w, r.w), d: pick(size?.d, def.size.d, r.d), h: pick(size?.h, def.size.h, r.h) };
}

/** The size an item is shown at. */
export function itemSize(def: FurnitureDef, item?: { size?: Partial<ItemSize> | null } | null): ItemSize {
  return item?.size ? clampSize(def, item.size) : def.size;
}

/** How much a placed item is stretched relative to the catalog size, per axis. */
export function itemScale(def: FurnitureDef, size: ItemSize): { x: number; y: number; z: number } {
  return { x: size.w / def.size.w, y: size.h / def.size.h, z: size.d / def.size.d };
}

/** Height of the ceiling that ceiling-mounted items are designed against (they hang down from it). */
export const DESIGN_CEILING = 2.7;

/**
 * Map a point given in the catalog item's local frame (at its default size) to the frame of an item
 * resized to `size`: X and Z stretch about the center; Y stretches about the floor, or about the
 * ceiling for ceiling-mounted items (so a longer pendant still hangs from the same canopy).
 */
export function scaleLocal(def: FurnitureDef, size: ItemSize, p: LocalPoint): LocalPoint {
  const k = itemScale(def, size);
  const y = def.mount === 'ceiling' ? DESIGN_CEILING - (DESIGN_CEILING - p.y) * k.y : p.y * k.y;
  return { x: p.x * k.x, y, z: p.z * k.z };
}

const sizeKey = (s: ItemSize) => `${s.w.toFixed(3)}x${s.d.toFixed(3)}x${s.h.toFixed(3)}`;

const MAX_TEMPLATES = 900;
const templates = new Map<string, THREE.Object3D>();
/** recently used sizes per parametric item: dragging a size slider must not pile up templates */
const MAX_SIZES_PER_ITEM = 6;
const sizesUsed = new Map<string, string[]>();
function rememberSize(id: string, key: string): void {
  const list = (sizesUsed.get(id) ?? []).filter((k) => k !== key);
  list.push(key);
  while (list.length > MAX_SIZES_PER_ITEM) templates.delete(list.shift()!);
  sizesUsed.set(id, list);
}

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
      // parametric items always build at a concrete (clamped) size; the others at their own
      const size = raw.parametric ? clampSize(raw, ctx?.size) : undefined;
      if (raw.noBake) {
        const fresh = raw.build({ ...ctx, colors, size });
        fresh.userData.furnitureId = raw.id;
        return fresh;
      }
      const key = `${raw.id}|${(raw.colors ?? []).map((s) => colors[s.key]).join(',')}${size ? `|${sizeKey(size)}` : ''}`;
      let tpl = templates.get(key);
      if (!tpl) {
        tpl = bake(raw.build({ ...ctx, colors, size }), raw.id);
        if (templates.size >= MAX_TEMPLATES) {
          const first = templates.keys().next().value;
          if (first !== undefined) templates.delete(first);
        }
        templates.set(key, tpl);
      }
      if (size) rememberSize(raw.id, key);
      const inst = tpl.clone(true);
      inst.userData.furnitureId = raw.id;
      return inst;
    },
    draw2d(ctx: CanvasRenderingContext2D, colors: Record<string, string>, size?: ItemSize): void {
      ctx.save();
      try {
        const resolved = resolveColors(raw, colors);
        if (raw.parametric) raw.draw2d(ctx, resolved, clampSize(raw, size));
        else {
          // everything else is drawn at its catalog size and stretched
          if (size && (size.w !== raw.size.w || size.d !== raw.size.d)) ctx.scale(size.w / raw.size.w, size.d / raw.size.d);
          raw.draw2d(ctx, resolved);
        }
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
  ...KITCHEN_SETS,
  ...APPLIANCES,
  ...BEDROOM,
  ...BEDS,
  ...STORAGE,
  ...BATHROOM,
  ...OFFICE,
  ...KIDS,
  ...LIGHTING,
  ...LIGHTS,
  ...MODERN_LIGHTS,
  ...DECOR,
  ...PLANTS,
  ...WALL_DECOR,
  ...TEXTILES,
  ...ACCESSORIES,
  ...ENTERTAINMENT,
  ...SPORTS,
  ...REAL_PETS,
  ...PETS,
  ...OUTDOOR,
  ...BACKYARD,
  ...STRUCTURE,
  ...PLAYGROUND,
  ...STREET,
  ...PUBLIC,
  ...VEHICLES,
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
