import { audio } from '../audio';
import { getFurniture } from '../catalog';
import { report } from '../game/progress';
import type { FurnitureDef } from '../catalog/types';
import { buildTemplate } from '../model/templates';
import { getOpeningDef } from '../catalog/openings';
import { closestOnSegment, dist, dot, norm, perp, sub } from '../model/geom';
import { getGraph, roomAt, uncoveredParts } from '../model/graph';
import {
  newId,
  type Building,
  type FurnitureItem,
  type Level,
  type Opening,
  type Roof,
  type RoomStyle,
  type SiteArea,
  type Vec2,
  type Wall,
} from '../model/types';
import { currentBuilding, currentLevel, draftLevel, useStore, type Selection } from './store';

const S = () => useStore.getState();
export const level = (): Level => currentLevel(S().project, S().levelIndex);

/** Adds wall segments, skipping stretches already covered by an existing collinear wall. */
export function addWalls(segments: [Vec2, Vec2][], thickness: number): void {
  const roomsBefore = getGraph(level().walls).rooms.length;
  S().update((d) => {
    const lvl = draftLevel(d);
    for (const [a, b] of segments) {
      for (const [pa, pb] of uncoveredParts(a, b, lvl.walls)) {
        lvl.walls.push({ id: newId('w'), a: { ...pa }, b: { ...pb }, thickness });
      }
    }
  });
  const added = getGraph(level().walls).rooms.length - roomsBefore;
  if (added > 0) report('room-built', added);
  audio.play('place', { volume: 0.6 });
}

export function addRoomRect(p0: Vec2, p1: Vec2, thickness: number): void {
  const x0 = Math.min(p0.x, p1.x);
  const x1 = Math.max(p0.x, p1.x);
  const y0 = Math.min(p0.y, p1.y);
  const y1 = Math.max(p0.y, p1.y);
  if (x1 - x0 < 0.5 || y1 - y0 < 0.5) return;
  addWalls(
    [
      [{ x: x0, y: y0 }, { x: x1, y: y0 }],
      [{ x: x1, y: y0 }, { x: x1, y: y1 }],
      [{ x: x1, y: y1 }, { x: x0, y: y1 }],
      [{ x: x0, y: y1 }, { x: x0, y: y0 }],
    ],
    thickness,
  );
}

export function placeOpening(wall: Wall, style: string, offset: number): string {
  const def = getOpeningDef(style);
  const id = newId('o');
  const L = dist(wall.a, wall.b);
  const width = Math.min(def.width, Math.max(0.4, L - 0.2));
  S().update((d) => {
    draftLevel(d).openings.push({
      id,
      wallId: wall.id,
      type: def.type,
      style: def.id,
      offset: clampOffset(offset, width, L),
      width,
      height: def.height,
      sill: def.sill,
    });
  });
  return id;
}

export function clampOffset(offset: number, width: number, wallLength: number): number {
  const m = width / 2 + 0.08;
  if (wallLength <= 2 * m) return wallLength / 2;
  return Math.max(m, Math.min(wallLength - m, offset));
}

export function addFurniture(catalogId: string, pos: Vec2, rotation: number): string | null {
  const def = getFurniture(catalogId);
  if (!def) return null;
  const id = newId('f');
  const item: FurnitureItem = {
    id,
    catalogId,
    x: pos.x,
    y: pos.y,
    rotation,
    elevation: def.mount === 'wall' ? (def.elevation ?? 1.2) : 0,
  };
  S().update((d) => {
    draftLevel(d).furniture.push(item);
  });
  report('furniture-placed');
  audio.play('place');
  return id;
}

export function deleteSelection(sel: Selection | null = S().selection): void {
  if (!sel || sel.kind === 'room') return;
  audio.play('delete', { volume: 0.7 });
  if (sel.kind === 'building') {
    deleteBuilding(sel.id);
    return;
  }
  S().update((d) => {
    if (sel.kind === 'prop') {
      d.site.props = d.site.props.filter((f) => f.id !== sel.id);
      return;
    }
    if (sel.kind === 'area') {
      d.site.areas = d.site.areas.filter((a) => a.id !== sel.id);
      return;
    }
    const lvl = draftLevel(d);
    if (sel.kind === 'wall') {
      lvl.walls = lvl.walls.filter((w) => w.id !== sel.id);
      lvl.openings = lvl.openings.filter((o) => o.wallId !== sel.id);
    } else if (sel.kind === 'opening') {
      lvl.openings = lvl.openings.filter((o) => o.id !== sel.id);
    } else if (sel.kind === 'furniture') {
      lvl.furniture = lvl.furniture.filter((f) => f.id !== sel.id);
    }
  });
  S().select(null);
}

export function duplicateSelection(): void {
  const sel = S().selection;
  if (sel?.kind === 'furniture') {
    const src = level().furniture.find((f) => f.id === sel.id);
    if (!src) return;
    const id = newId('f');
    S().update((d) => {
      draftLevel(d).furniture.push({ ...src, id, x: src.x + 0.4, y: src.y + 0.4, colors: src.colors ? { ...src.colors } : undefined });
    });
    S().select({ kind: 'furniture', id });
  } else if (sel?.kind === 'prop') {
    const src = S().project.site.props.find((f) => f.id === sel.id);
    if (!src) return;
    const id = newId('p');
    S().update((d) => {
      d.site.props.push({ ...src, id, x: src.x + 1.5, y: src.y + 1.5, colors: src.colors ? { ...src.colors } : undefined });
    });
    S().select({ kind: 'prop', id });
  } else if (sel?.kind === 'building') {
    const src = S().project.buildings.find((b) => b.id === sel.id);
    if (!src) return;
    const copy = JSON.parse(JSON.stringify(src)) as Building;
    copy.id = newId('bld');
    copy.x += 14;
    copy.name = `${src.name} (עותק)`;
    S().update((d) => {
      d.buildings.push(copy);
    });
    S().select({ kind: 'building', id: copy.id });
  }
}

export function updateFurniture(id: string, patch: Partial<FurnitureItem>, transient = false): void {
  S().update(
    (d) => {
      const f = draftLevel(d).furniture.find((x) => x.id === id);
      if (f) Object.assign(f, patch);
    },
    { transient },
  );
}

export function updateOpening(id: string, patch: Partial<Opening>, transient = false): void {
  S().update(
    (d) => {
      const lvl = draftLevel(d);
      const o = lvl.openings.find((x) => x.id === id);
      if (!o) return;
      Object.assign(o, patch);
      const w = lvl.walls.find((x) => x.id === o.wallId);
      if (w) o.offset = clampOffset(o.offset, o.width, dist(w.a, w.b));
    },
    { transient },
  );
}

export function updateWall(id: string, patch: Partial<Wall>, transient = false): void {
  S().update(
    (d) => {
      const w = draftLevel(d).walls.find((x) => x.id === id);
      if (w) Object.assign(w, patch);
    },
    { transient },
  );
}

/** Moves every wall endpoint located at `from` to `to` (keeps connected walls connected). */
export function moveNode(from: Vec2, to: Vec2, transient = true): void {
  S().update(
    (d) => {
      for (const w of draftLevel(d).walls) {
        if (dist(w.a, from) < 0.004) w.a = { ...to };
        if (dist(w.b, from) < 0.004) w.b = { ...to };
      }
    },
    { transient },
  );
}

/** Style of the room that contains `point` (creating it if needed), then patch it. */
export function setRoomStyle(point: Vec2, patch: Partial<RoomStyle>): void {
  S().update((d) => {
    const lvl = draftLevel(d);
    const graph = getGraph(currentLevel(S().project, S().levelIndex).walls);
    const room = roomAt(graph, point);
    if (!room) return;
    let style = lvl.roomStyles.find((s) => roomAt(graph, s.point)?.index === room.index);
    if (!style) {
      style = { id: newId('rs'), point: { ...room.labelPoint } };
      lvl.roomStyles.push(style);
    }
    Object.assign(style, patch);
  });
  if (patch.floor || patch.wall) {
    report('room-painted');
    audio.play('click');
  }
}

export function setExterior(finish: string): void {
  S().update((d) => {
    currentBuilding(d).exterior = finish;
  });
}

/** Drops styles whose anchor no longer lies in any room (after walls were removed). */
export function pruneRoomStyles(): void {
  const lvl = level();
  const graph = getGraph(lvl.walls);
  const dead = lvl.roomStyles.filter((s) => !roomAt(graph, s.point));
  if (!dead.length) return;
  S().update(
    (d) => {
      const l = draftLevel(d);
      l.roomStyles = l.roomStyles.filter((s) => !dead.some((x) => x.id === s.id));
    },
    { transient: true },
  );
}

/**
 * Snap a furniture item against the nearest wall face: returns adjusted position/rotation,
 * or null when no wall is close enough.
 */
export function snapFurnitureToWall(
  pos: Vec2,
  size: { w: number; d: number },
  walls: Wall[],
  maxGap: number,
): { pos: Vec2; rotation: number } | null {
  let best: { pos: Vec2; rotation: number; gap: number } | null = null;
  for (const w of walls) {
    const L = dist(w.a, w.b);
    if (L < 0.05) continue;
    const c = closestOnSegment(pos, w.a, w.b);
    const d = norm(sub(w.b, w.a));
    const n = perp(d);
    const side = dot(sub(pos, c.point), n) >= 0 ? 1 : -1;
    const m = { x: n.x * side, y: n.y * side };
    const gap = c.dist - w.thickness / 2 - size.d / 2;
    if (gap > maxGap) continue;
    // must be in front of the wall segment itself, not past its ends
    if (c.t <= 0.001 || c.t >= 0.999) continue;
    if (!best || gap < best.gap) {
      const off = w.thickness / 2 + size.d / 2 + 0.005;
      best = {
        pos: { x: c.point.x + m.x * off, y: c.point.y + m.y * off },
        rotation: Math.atan2(-m.x, m.y),
        gap,
      };
    }
  }
  return best ? { pos: best.pos, rotation: best.rotation } : null;
}

// ---- levels & roof ---------------------------------------------------------------------------

/** Adds a level on top of the current building, starting from the outline of the level below. */
export function addLevel(): void {
  const st = S();
  const b = currentBuilding(st.project);
  const below = b.levels[b.levels.length - 1];
  const graph = getGraph(below.walls);
  const walls: Wall[] = [];
  for (const e of graph.edges) {
    if (e.posRoom < 0 === e.negRoom < 0) continue; // only the outer shell
    const last = walls[walls.length - 1];
    // merge consecutive pieces of the same original wall
    if (last && dist(last.b, e.pa) < 0.004 && Math.abs((last.b.x - last.a.x) * e.dir.y - (last.b.y - last.a.y) * e.dir.x) < 1e-6) last.b = { ...e.pb };
    else walls.push({ id: newId('w'), a: { ...e.pa }, b: { ...e.pb }, thickness: e.thickness });
  }
  const names = ['קומת קרקע', 'קומה א׳', 'קומה ב׳', 'קומה ג׳', 'קומה ד׳', 'קומה ה׳', 'קומה ו׳', 'קומה ז׳'];
  const index = b.levels.length;
  st.update((d) => {
    currentBuilding(d).levels.push({
      id: newId('lvl'),
      name: names[index] ?? `קומה ${index}`,
      height: below.height,
      walls,
      openings: [],
      furniture: [],
      roomStyles: [],
    });
  });
  S().setLevelIndex(index);
  report('level-added');
  audio.play('success', { volume: 0.6 });
}

export function removeLevel(index: number): void {
  const st = S();
  if (currentBuilding(st.project).levels.length <= 1) return;
  st.update((d) => {
    currentBuilding(d).levels.splice(index, 1);
  });
  S().setLevelIndex(Math.max(0, Math.min(index - 1, currentBuilding(S().project).levels.length - 1)));
}

export function updateRoof(patch: Partial<Roof>): void {
  if (patch.type && patch.type !== currentBuilding(S().project).roof.type) report('roof-changed');
  S().update((d) => {
    Object.assign(currentBuilding(d).roof, patch);
  });
}

// ---- neighborhood ----------------------------------------------------------------------------

/** What blocks walking: null = nothing, otherwise the solid footprint (trees and poles only block at the trunk). */
const TRUNK_ONLY = /tree|palm|lamp|flagpole|sign|traffic-light|patio-table|basketball|swing-set|monkey-bars|goal/;
export function collisionFootprint(def: FurnitureDef): { w: number; d: number } | null {
  if (def.walkable || def.mount === 'ceiling' || def.mount === 'wall') return null;
  // things you walk onto, kick around, or that move by themselves
  if (def.bounce || def.ball || def.pet || def.id === 'football-goal') return null;
  if (TRUNK_ONLY.test(def.id)) return { w: 0.4, d: 0.4 };
  return { w: def.size.w, d: def.size.d };
}

export function addProp(catalogId: string, pos: Vec2, rotation: number): string | null {
  const def = getFurniture(catalogId);
  if (!def) return null;
  const id = newId('p');
  S().update((d) => {
    d.site.props.push({ id, catalogId, x: pos.x, y: pos.y, rotation, elevation: def.mount === 'wall' ? (def.elevation ?? 1.2) : 0 });
  });
  report('furniture-placed');
  audio.play('place');
  return id;
}

export function updateProp(id: string, patch: Partial<FurnitureItem>, transient = false): void {
  S().update(
    (d) => {
      const f = d.site.props.find((x) => x.id === id);
      if (f) Object.assign(f, patch);
    },
    { transient },
  );
}

export function updateBuilding(id: string, patch: Partial<Building>, transient = false): void {
  S().update(
    (d) => {
      const b = d.buildings.find((x) => x.id === id);
      if (b) Object.assign(b, patch);
    },
    { transient },
  );
}

export function addBuilding(template: string, pos: Vec2): string | null {
  const b = buildTemplate(template);
  if (!b) return null;
  b.x = pos.x;
  b.y = pos.y;
  S().update((d) => {
    d.buildings.push(b);
  });
  report('building-added');
  audio.play('place');
  return b.id;
}

/** A neighborhood always keeps at least one building. */
export function deleteBuilding(id: string): void {
  const st = S();
  if (st.project.buildings.length <= 1) return;
  const index = st.project.buildings.findIndex((b) => b.id === id);
  if (index < 0) return;
  const editing = currentBuilding(st.project).id;
  st.update((d) => {
    d.buildings.splice(index, 1);
  });
  const next = S().project.buildings.findIndex((b) => b.id === editing);
  useStore.setState({ buildingIndex: Math.max(0, next), selection: null, ...(next < 0 ? { levelIndex: 0 } : {}) });
}

export function setRoad(i: number, j: number, on: boolean, transient = false): void {
  const before = S().project.site.roads.length;
  S().update(
    (d) => {
      const at = d.site.roads.findIndex(([a, b]) => a === i && b === j);
      if (on && at < 0) d.site.roads.push([i, j]);
      else if (!on && at >= 0) d.site.roads.splice(at, 1);
    },
    { transient },
  );
  if (on && S().project.site.roads.length > before) report('road-built');
}

export function addArea(a: Vec2, b: Vec2, finish: string): string | null {
  if (Math.abs(a.x - b.x) < 1 || Math.abs(a.y - b.y) < 1) return null;
  const area: SiteArea = { id: newId('ar'), x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y), finish };
  S().update((d) => {
    d.site.areas.push(area);
  });
  return area.id;
}

export function updateArea(id: string, patch: Partial<SiteArea>, transient = false): void {
  S().update(
    (d) => {
      const a = d.site.areas.find((x) => x.id === id);
      if (a) Object.assign(a, patch);
    },
    { transient },
  );
}

export function setGround(finish: string): void {
  S().update((d) => {
    d.site.ground = finish;
  });
}
