import { closestOnSegment, dot } from './geom';
import { getGraph } from './graph';
import type { Vec2, Wall } from './types';

/**
 * Stretch an item along the wall its back stands against, from one inner corner to the other
 * (a kitchen run that fills the wall). Returns the new center and width, or null when the item's
 * back is not against a wall. Pure plan geometry: rotation θ ⇒ local +X = (cos θ, sin θ), back
 * (local −Z) = (sin θ, −cos θ).
 */
export function fitAlongWall(
  walls: Wall[],
  item: { x: number; y: number; rotation: number },
  size: { w: number; d: number },
): { x: number; y: number; w: number } | null {
  const g = getGraph(walls);
  const r = item.rotation;
  const ax: Vec2 = { x: Math.cos(r), y: Math.sin(r) };
  const back: Vec2 = { x: Math.sin(r), y: -Math.cos(r) };
  const bp: Vec2 = { x: item.x + (back.x * size.d) / 2, y: item.y + (back.y * size.d) / 2 };
  let best: { x: number; y: number; w: number; gap: number } | null = null;
  for (const e of g.edges) {
    // the wall must run along the item (within ~5°)
    if (Math.abs(dot(e.dir, ax)) < 0.996) continue;
    const c = closestOnSegment(bp, e.pa, e.pb);
    const gap = c.dist - e.thickness / 2;
    if (gap < -0.06 || gap > 0.15) continue;
    // stop at the faces of the walls that meet this one at its ends
    const meet = (node: number) => Math.max(0, ...g.edges.filter((o) => o !== e && (o.a === node || o.b === node)).map((o) => o.thickness));
    const t0 = meet(e.a) / 2 + 0.005;
    const t1 = meet(e.b) / 2 + 0.005;
    const len = e.length - t0 - t1;
    if (len < 0.3) continue;
    const mid = (t0 + e.length - t1) / 2;
    const m: Vec2 = { x: e.pa.x + e.dir.x * mid, y: e.pa.y + e.dir.y * mid };
    // keep the item's distance from the wall, slide its center to the middle of the free stretch
    const along = (item.x - m.x) * e.dir.x + (item.y - m.y) * e.dir.y;
    const center = { x: item.x - e.dir.x * along, y: item.y - e.dir.y * along };
    if (!best || Math.abs(gap) < Math.abs(best.gap)) best = { ...center, w: len, gap };
  }
  return best ? { x: best.x, y: best.y, w: best.w } : null;
}
