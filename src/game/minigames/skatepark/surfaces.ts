import { getFurniture, itemSize } from '../../../catalog';
import type { FurnitureDef } from '../../../catalog/types';
import { OBSTACLE_SHAPES, type LocalSurface, type Profile } from '../../../catalog/items/_gameBShapes';
import type { FurnitureItem } from '../../../model/types';
import type { WalkWorld } from '../../../render3d/WalkController';
import { addSurfaces, addWalkWorldDecorator, type WalkSurface } from '../../../render3d/walkSurfaces';

/**
 * Turns the placed skatepark / obstacle-course items of the site into standable walk surfaces
 * (ramps you ride up and fly off, boxes and platforms you jump onto, rails, beams…).
 *
 * Registered once as a walk-world decorator, so it works all the time in walk mode – not only during a
 * round – and always follows what the player built in the editor.
 */
const mirrorProfile = (p: Profile): Profile => p.map(([t, h]) => [-t, h] as [number, number]).reverse();

/** World surfaces of one placed item (site coordinates); empty for items that are not obstacles. */
export function obstacleSurfaces(item: Pick<FurnitureItem, 'id' | 'catalogId' | 'x' | 'y' | 'rotation' | 'elevation' | 'size' | 'mirror'>, def: FurnitureDef | undefined, groundY: number): WalkSurface[] {
  const shape = OBSTACLE_SHAPES[item.catalogId];
  if (!shape || !def) return [];
  const size = itemSize(def, item);
  const c = Math.cos(item.rotation);
  const s = Math.sin(item.rotation);
  return shape(size).map((ls: LocalSurface) => {
    const cx = item.mirror ? -ls.cx : ls.cx;
    const out: WalkSurface = {
      id: item.id,
      x: item.x + cx * c - ls.cz * s,
      y: item.y + cx * s + ls.cz * c,
      rotation: item.rotation,
      hw: ls.hw,
      hd: ls.hd,
      y0: groundY + (item.elevation ?? 0),
      tag: ls.tag,
      data: { catalogId: item.catalogId, itemId: item.id },
    };
    if (ls.top !== undefined) out.top = ls.top;
    if (ls.profileZ) out.profileZ = ls.profileZ;
    if (ls.profileX) out.profileX = item.mirror ? mirrorProfile(ls.profileX) : ls.profileX;
    if (ls.noStand) out.noStand = true;
    return out;
  });
}

/** Surfaces for every obstacle on the site of a project (used by the decorator and by tests). */
export function siteObstacleSurfaces(props: FurnitureItem[], groundAt: (x: number, y: number) => number): WalkSurface[] {
  const out: WalkSurface[] = [];
  for (const f of props) {
    if (!OBSTACLE_SHAPES[f.catalogId]) continue;
    out.push(...obstacleSurfaces(f, getFurniture(f.catalogId), groundAt(f.x, f.y)));
  }
  return out;
}

// The store is loaded lazily: the store builds the starter project, which imports the mini-game registry,
// which imports this module – a static import would be a cycle. (Function declarations only, for the same reason.)
const holder: { store?: typeof import('../../../store/store') } = {};
function decorate(world: WalkWorld): void {
  const props = holder.store?.useStore.getState().project.site.props;
  if (props) addSurfaces(world, siteObstacleSurfaces(props, world.groundAt));
}

/** Register the decorator (idempotent; safe in Node – it only runs when a walk world is built). */
export function installObstacleSurfaces(): void {
  addWalkWorldDecorator(decorate);
  // only the app builds walk worlds (tests call siteObstacleSurfaces directly)
  if (!holder.store && typeof window !== 'undefined') loadStore(0);
}

function loadStore(attempt: number): void {
  import('../../../store/store').then(
    (m) => {
      holder.store = m;
    },
    () => {
      if (attempt < 5) setTimeout(() => loadStore(attempt + 1), 50);
    },
  );
}
