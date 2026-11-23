import { getFurniture } from '../catalog';
import { getOpeningDef } from '../catalog/openings';
import { closestOnSegment, dist, dot, norm, perp, sub } from '../model/geom';
import { getGraph, roomAt, uncoveredParts } from '../model/graph';
import { newId, type FurnitureItem, type Level, type Opening, type RoomStyle, type Vec2, type Wall } from '../model/types';
import { currentBuilding, currentLevel, draftLevel, useStore, type Selection } from './store';

const S = () => useStore.getState();
export const level = (): Level => currentLevel(S().project, S().levelIndex);

/** Adds wall segments, skipping stretches already covered by an existing collinear wall. */
export function addWalls(segments: [Vec2, Vec2][], thickness: number): void {
  S().update((d) => {
    const lvl = draftLevel(d);
    for (const [a, b] of segments) {
      for (const [pa, pb] of uncoveredParts(a, b, lvl.walls)) {
        lvl.walls.push({ id: newId('w'), a: { ...pa }, b: { ...pb }, thickness });
      }
    }
  });
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
  return id;
}

export function deleteSelection(sel: Selection | null = S().selection): void {
  if (!sel || sel.kind === 'room') return;
  S().update((d) => {
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
  if (sel?.kind !== 'furniture') return;
  const src = level().furniture.find((f) => f.id === sel.id);
  if (!src) return;
  const id = newId('f');
  S().update((d) => {
    draftLevel(d).furniture.push({ ...src, id, x: src.x + 0.4, y: src.y + 0.4, colors: src.colors ? { ...src.colors } : undefined });
  });
  S().select({ kind: 'furniture', id });
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
