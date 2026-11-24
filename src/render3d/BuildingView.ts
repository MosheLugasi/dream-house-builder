import * as THREE from 'three';
import { getFurniture } from '../catalog';
import { getGraph, roomAt } from '../model/graph';
import { roofPlan } from '../model/roofPlan';
import { levelElevation, SLAB, type Building, type FurnitureItem, type Level } from '../model/types';
import { buildArchitecture, disposeArchitecture, type Architecture, type OrientedRect } from './buildArchitecture';
import { buildRoof } from './buildRoof';
import { ItemLayer } from './ItemLayer';
import { itemBatches } from './StaticBatches';

export interface BuildingViewOptions {
  /** the level being edited: levels above it are hidden. null = show the complete building with its roof */
  activeLevel: number | null;
  wallsLow: boolean;
  /** ceilings on every level (walking inside) */
  ceilings: boolean;
  /** build the furniture (false = only the shell and whatever stands outdoors) */
  furniture: boolean;
}

interface LevelView {
  group: THREE.Group;
  arch: Architecture | null;
  key: unknown[];
  items: ItemLayer;
}

/** Footprints of the stairs standing on a level. */
export function stairRects(level: Level): OrientedRect[] {
  const out: OrientedRect[] = [];
  for (const f of level.furniture) {
    const def = getFurniture(f.catalogId);
    if (def?.stair) out.push({ x: f.x, y: f.y, hw: def.size.w / 2, hd: def.size.d / 2, rotation: f.rotation });
  }
  return out;
}

const sameKey = (a: unknown[], b: unknown[]) => a.length === b.length && a.every((v, i) => v === b[i]);

/** The 3D representation of one building: every level's architecture and furniture, plus the roof. */
export class BuildingView {
  readonly group = new THREE.Group();
  readonly levels: LevelView[] = [];
  private roof: THREE.Group | null = null;
  private roofKey: unknown[] = [];

  constructor(readonly id: string) {
    this.group.userData.buildingId = id;
  }

  /** Returns true when geometry that matters for walking (walls, doors, furniture) changed. */
  update(b: Building, o: BuildingViewOptions): boolean {
    let changed = false;
    this.group.position.set(b.x, 0, b.y);
    this.group.rotation.y = -b.rotation;

    while (this.levels.length > b.levels.length) {
      const lv = this.levels.pop()!;
      lv.items.clear();
      this.group.remove(lv.group);
      itemBatches.current?.remove(this.archId(this.levels.length));
      if (lv.arch) disposeArchitecture(lv.arch);
      changed = true;
    }
    while (this.levels.length < b.levels.length) {
      const lv: LevelView = { group: new THREE.Group(), arch: null, key: [], items: new ItemLayer() };
      lv.group.add(lv.items.group);
      this.group.add(lv.group);
      this.levels.push(lv);
    }

    const n = b.levels.length;
    const complete = o.activeLevel === null;
    // a pitched roof needs a rectilinear footprint; otherwise fall back to a flat roof
    const pitched = b.roof.type !== 'flat' && b.roof.type !== 'none' && !!roofPlan(b.levels[n - 1]);
    b.levels.forEach((lvl, i) => {
      const lv = this.levels[i];
      const isTop = i === n - 1;
      const isActive = i === o.activeLevel;
      const visible = complete || i <= (o.activeLevel as number);
      const levelAbove = complete ? !isTop : i < (o.activeLevel as number);
      const flatRoof = isTop && complete && !pitched && b.roof.type !== 'none';
      const wallsLow = isActive && o.wallsLow;
      const floorHoles = i > 0 ? stairRects(b.levels[i - 1]) : [];
      const ceilingHoles = !isTop ? stairRects(lvl) : [];
      const key: unknown[] = [
        lvl.walls,
        lvl.openings,
        lvl.roomStyles,
        lvl.height,
        b.exterior,
        b.defaultFloor,
        b.defaultWall,
        b.roof.finish,
        wallsLow,
        o.ceilings || levelAbove || (isTop && complete),
        levelAbove || flatRoof,
        levelAbove ? SLAB : flatRoof ? 0.3 : 0,
        JSON.stringify(floorHoles),
        JSON.stringify(ceilingHoles),
      ];
      lv.group.position.y = levelElevation(b, i);
      lv.group.visible = visible;
      if (visible && !sameKey(key, lv.key)) {
        lv.key = key;
        if (lv.arch) {
          lv.group.remove(lv.arch.group);
          itemBatches.current?.remove(this.archId(i));
          disposeArchitecture(lv.arch);
        }
        lv.arch = buildArchitecture(lvl, b, {
          wallsLow,
          ceilings: key[9] as boolean,
          topSlab: key[10] as boolean,
          exteriorExtra: key[11] as number,
          floorHoles,
          ceilingHoles,
        });
        lv.group.add(lv.arch.group);
        // walls, floors, windows and doors are drawn through the shared batches too
        itemBatches.current?.add(this.archId(i), lv.arch.group);
        changed = true;
      }
      if (!visible) return;
      // furniture: everything, or only what stands outdoors (gardens) for shell buildings
      let filter: ((f: FurnitureItem) => boolean) | undefined;
      if (!o.furniture) {
        if (i > 0) filter = () => false;
        else {
          const graph = getGraph(lvl.walls);
          filter = (f) => !roomAt(graph, { x: f.x, y: f.y });
        }
      }
      if (lv.items.sync(lvl.furniture, { levelHeight: lvl.height, rise: lvl.height + SLAB, lights: o.furniture }, filter)) changed = true;
      for (const entry of lv.items.entries.values()) {
        if (getFurniture(entry.item.catalogId)?.mount === 'ceiling') entry.holder.visible = !wallsLow;
      }
    });

    // pitched roof
    const top = b.levels[n - 1];
    const wantRoof = complete && pitched;
    const roofKey: unknown[] = wantRoof
      ? [top.walls, top.height, n, b.roof.type, b.roof.finish, b.roof.pitch, b.roof.overhang, b.exterior, ...b.levels.map((l) => l.height)]
      : [];
    if (!sameKey(roofKey, this.roofKey)) {
      this.roofKey = roofKey;
      if (this.roof) {
        itemBatches.current?.remove(`roof:${this.id}`);
        this.group.remove(this.roof);
        this.roof.traverse((m) => (m as THREE.Mesh).geometry?.dispose());
        this.roof = null;
      }
      if (wantRoof) {
        this.roof = buildRoof(b);
        if (this.roof) {
          this.group.add(this.roof);
          itemBatches.current?.add(`roof:${this.id}`, this.roof);
        }
      }
    }
    return changed;
  }

  private archId(level: number): string {
    return `arch:${this.id}:${level}`;
  }

  dispose(): void {
    this.levels.forEach((lv, i) => {
      lv.items.clear();
      itemBatches.current?.remove(this.archId(i));
      if (lv.arch) disposeArchitecture(lv.arch);
    });
    itemBatches.current?.remove(`roof:${this.id}`);
    this.roof?.traverse((m) => (m as THREE.Mesh).geometry?.dispose());
  }
}
