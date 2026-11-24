import * as THREE from 'three';
import { DESIGN_CEILING, getFurniture, resolveColors } from '../catalog';
import { placedObjectScale, placedSize } from '../catalog/placed';
import type { FurnitureItem } from '../model/types';
import { itemBatches } from './StaticBatches';
import { freshKey, takePrebuilt } from './prebuild';

/** Notified when placed items appear, move or disappear (interactive behaviours hook in here). */
export interface ItemEvents {
  add(entry: ItemEntry): void;
  move(entry: ItemEntry): void;
  remove(id: string): void;
}
export const itemEvents: { current: ItemEvents | null } = { current: null };

/** the floor finish of a room is drawn this far above the level (see buildArchitecture) */
const RUG_LIFT = 0.013;

export interface ItemContext {
  /** ceiling height of the level (ceiling-mounted items hang from it) */
  levelHeight: number;
  /** floor-to-floor height (stairs) */
  rise: number;
  /** unused: lamps are lit by the LightManager */
  lights: boolean;
}

export interface ItemEntry {
  item: FurnitureItem;
  holder: THREE.Group;
  key: string;
}

/** Items whose meshes may be drawn through the static batches (see StaticBatches.ts). */
function batchableItem(catalogId: string): boolean {
  const def = getFurniture(catalogId);
  // (vehicles are driven and pets walk: always on their own; rides animate every frame)
  return !!def && !def.vehicle && !def.pet && !def.ride;
}

export function makeItemHolder(item: Pick<FurnitureItem, 'catalogId' | 'colors' | 'size' | 'mirror'>, ctx: ItemContext): THREE.Group | null {
  const def = getFurniture(item.catalogId);
  if (!def) return null;
  const holder = new THREE.Group();
  const size = placedSize(def, item);
  let obj: THREE.Object3D;
  try {
    const colors = resolveColors(def, item.colors);
    obj = (def.noBake && !def.stair ? takePrebuilt(freshKey(def, colors, size)) : undefined) ?? def.build({ colors, rise: ctx.rise, size });
  } catch (err) {
    console.warn('failed to build', item.catalogId, err);
    obj = new THREE.Mesh(new THREE.BoxGeometry(def.size.w, def.size.h, def.size.d), new THREE.MeshStandardMaterial({ color: '#bbb' }));
    obj.position.y = def.size.h / 2;
  }
  // the player's size (stretch for non-parametric items) and mirror
  const k = placedObjectScale(def, item);
  if (k.x !== 1 || k.y !== 1 || k.z !== 1) {
    obj.scale.set(obj.scale.x * k.x, obj.scale.y * k.y, obj.scale.z * k.z);
    obj.position.y *= k.y;
    // ceiling pieces stretch downwards from the ceiling, not upwards from the floor
    if (def.mount === 'ceiling') obj.position.y += DESIGN_CEILING * (1 - k.y);
  }
  const lift = def.mount === 'ceiling' ? ctx.levelHeight - DESIGN_CEILING : 0;
  obj.position.y += lift;
  // rugs and mats lie ON the floor finish (drawn 1.2 cm above the slab) instead of fighting with it
  if (def.walkable && (def.mount ?? 'floor') === 'floor') obj.position.y += RUG_LIFT;
  holder.add(obj);
  holder.userData.body = obj;
  return holder;
}

/** Keeps a group of 3D objects in sync with a list of placed catalog items. */
export class ItemLayer {
  readonly group = new THREE.Group();
  readonly entries = new Map<string, ItemEntry>();

  /** Returns true when anything was added, removed or moved. */
  sync(items: FurnitureItem[], ctx: ItemContext, filter?: (item: FurnitureItem) => boolean): boolean {
    const seen = new Set<string>();
    let changed = false;
    for (const item of items) {
      if (filter && !filter(item)) continue;
      seen.add(item.id);
      let entry = this.entries.get(item.id);
      const def = getFurniture(item.catalogId);
      const key = `${item.catalogId}|${JSON.stringify(item.colors ?? {})}|${ctx.levelHeight}|${def?.stair ? ctx.rise : 0}|${ctx.lights}|${item.size ? `${item.size.w},${item.size.d},${item.size.h}` : ''}|${item.mirror ? 1 : 0}`;
      if (entry && entry.item === item && entry.key === key) continue;
      changed = true;
      if (!entry || entry.key !== key) {
        if (entry) {
          this.group.remove(entry.holder);
          itemBatches.current?.remove(item.id);
          itemEvents.current?.remove(item.id);
        }
        const holder = makeItemHolder(item, ctx);
        if (!holder) {
          this.entries.delete(item.id);
          continue;
        }
        holder.userData.itemId = item.id;
        this.group.add(holder);
        entry = { item, holder, key };
        this.entries.set(item.id, entry);
        entry.holder.position.set(item.x, item.elevation, item.y);
        entry.holder.rotation.y = -item.rotation;
        itemEvents.current?.add(entry);
        if (batchableItem(item.catalogId)) itemBatches.current?.add(item.id, holder);
      }
      entry.item = item;
      entry.holder.position.set(item.x, item.elevation, item.y);
      entry.holder.rotation.y = -item.rotation;
      itemEvents.current?.move(entry);
    }
    for (const [id, entry] of this.entries) {
      if (!seen.has(id)) {
        this.group.remove(entry.holder);
        itemBatches.current?.remove(id);
        this.entries.delete(id);
        itemEvents.current?.remove(id);
        changed = true;
      }
    }
    return changed;
  }

  clear(): void {
    for (const [id, entry] of this.entries) {
      this.group.remove(entry.holder);
      itemBatches.current?.remove(id);
      itemEvents.current?.remove(id);
    }
    this.entries.clear();
  }
}
