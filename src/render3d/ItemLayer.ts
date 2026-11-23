import * as THREE from 'three';
import { getFurniture, resolveColors } from '../catalog';
import type { FurnitureItem } from '../model/types';

/**
 * Catalog lamp intensities are tuned for a dark room; by day they only add a gentle warm pool of
 * light. The engine changes this with the time of day.
 */
let lampScale = 0.05;
export function setLampScale(s: number): void {
  lampScale = s;
}

/** Notified when placed items appear, move or disappear (interactive behaviours hook in here). */
export interface ItemEvents {
  add(entry: ItemEntry): void;
  move(entry: ItemEntry): void;
  remove(id: string): void;
}
export const itemEvents: { current: ItemEvents | null } = { current: null };

export interface ItemContext {
  /** ceiling height of the level (ceiling-mounted items hang from it) */
  levelHeight: number;
  /** floor-to-floor height (stairs) */
  rise: number;
  /** point lights for lamps (off for far-away / shell buildings) */
  lights: boolean;
}

export interface ItemEntry {
  item: FurnitureItem;
  holder: THREE.Group;
  key: string;
}

export function makeItemHolder(item: Pick<FurnitureItem, 'catalogId' | 'colors'>, ctx: ItemContext): THREE.Group | null {
  const def = getFurniture(item.catalogId);
  if (!def) return null;
  const holder = new THREE.Group();
  let obj: THREE.Object3D;
  try {
    obj = def.build({ colors: resolveColors(def, item.colors), rise: ctx.rise });
  } catch (err) {
    console.warn('failed to build', item.catalogId, err);
    obj = new THREE.Mesh(new THREE.BoxGeometry(def.size.w, def.size.h, def.size.d), new THREE.MeshStandardMaterial({ color: '#bbb' }));
    obj.position.y = def.size.h / 2;
  }
  const lift = def.mount === 'ceiling' ? ctx.levelHeight - 2.7 : 0;
  obj.position.y += lift;
  holder.add(obj);
  holder.userData.body = obj;
  if (def.light && ctx.lights) {
    const l = new THREE.PointLight(def.light.color, def.light.intensity * lampScale, def.light.distance, 2);
    l.position.set(def.light.x, def.light.y + lift, def.light.z);
    holder.add(l);
    holder.userData.light = l;
    holder.userData.lightBase = def.light.intensity;
  }
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
      const key = `${item.catalogId}|${JSON.stringify(item.colors ?? {})}|${ctx.levelHeight}|${def?.stair ? ctx.rise : 0}|${ctx.lights}`;
      if (entry && entry.item === item && entry.key === key) continue;
      changed = true;
      if (!entry || entry.key !== key) {
        if (entry) {
          this.group.remove(entry.holder);
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
      }
      entry.item = item;
      entry.holder.position.set(item.x, item.elevation, item.y);
      entry.holder.rotation.y = -item.rotation;
      itemEvents.current?.move(entry);
    }
    for (const [id, entry] of this.entries) {
      if (!seen.has(id)) {
        this.group.remove(entry.holder);
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
      itemEvents.current?.remove(id);
    }
    this.entries.clear();
  }
}
