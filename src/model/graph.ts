import type { Vec2, Wall, RoomStyle } from './types';
import {
  add,
  closestOnSegment,
  cross,
  dist,
  dot,
  interiorPoint,
  lineIntersect,
  mul,
  norm,
  perp,
  pointInPolygon,
  polygonArea,
  segIntersect,
  sub,
} from './geom';

/**
 * Planar graph derived from a level's walls.
 *
 * Walls are split at every junction (shared endpoints, T-junctions, crossings) into
 * edges. Closed loops of edges become rooms. Each edge knows which room lies on each
 * of its two sides, and its mitered footprint corners.
 *
 * Side naming: for an edge going a -> b with direction `dir`, n = perp(dir) = (-dir.y, dir.x).
 * The "pos" side is the +n side, the "neg" side is the -n side.
 */
export interface GraphNode {
  id: number;
  p: Vec2;
  /** outgoing half-edge ids sorted by ascending angle */
  out: number[];
}

export interface GraphEdge {
  id: number;
  wallId: string;
  a: number;
  b: number;
  pa: Vec2;
  pb: Vec2;
  dir: Vec2;
  n: Vec2;
  length: number;
  thickness: number;
  /** distances from wall.a (of wall `wallId`) to this edge's start / end */
  u0: number;
  u1: number;
  /** room index on each side, -1 = outdoors */
  posRoom: number;
  negRoom: number;
  /** footprint corners */
  aPos: Vec2;
  aNeg: Vec2;
  bPos: Vec2;
  bNeg: Vec2;
  /** true when another edge meets this end (no visible end cap) */
  aJoined: boolean;
  bJoined: boolean;
}

export interface Room {
  index: number;
  /** outer boundary along wall centerlines, positive (numeric CCW) orientation */
  polygon: Vec2[];
  holes: Vec2[][];
  /** net floor area in m² (approx., inside wall faces) */
  area: number;
  labelPoint: Vec2;
  /** edges that bound this room and the side of the edge that faces it */
  sides: { edge: number; side: 'pos' | 'neg' }[];
}

export interface LevelGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  rooms: Room[];
}

const KEY_SCALE = 500; // 2 mm node merge grid
const ON_SEG_TOL = 0.003;

const keyOf = (p: Vec2) => `${Math.round(p.x * KEY_SCALE)},${Math.round(p.y * KEY_SCALE)}`;

export function buildGraph(walls: Wall[]): LevelGraph {
  const nodes: GraphNode[] = [];
  const nodeByKey = new Map<string, number>();
  const nodeAt = (p: Vec2): number => {
    const k = keyOf(p);
    let id = nodeByKey.get(k);
    if (id === undefined) {
      id = nodes.length;
      nodes.push({ id, p: { x: p.x, y: p.y }, out: [] });
      nodeByKey.set(k, id);
    }
    return id;
  };

  const valid = walls.filter((w) => dist(w.a, w.b) > 0.01);

  // 1. split points per wall
  const splits: { p: Vec2; u: number }[][] = valid.map((w) => [
    { p: w.a, u: 0 },
    { p: w.b, u: dist(w.a, w.b) },
  ]);
  for (let i = 0; i < valid.length; i++) {
    const wi = valid[i];
    const li = dist(wi.a, wi.b);
    for (let j = i + 1; j < valid.length; j++) {
      const wj = valid[j];
      const lj = dist(wj.a, wj.b);
      // endpoints of j on i, endpoints of i on j
      let touched = false;
      for (const p of [wj.a, wj.b]) {
        const c = closestOnSegment(p, wi.a, wi.b);
        if (c.dist < ON_SEG_TOL) {
          splits[i].push({ p, u: c.t * li });
          touched = true;
        }
      }
      for (const p of [wi.a, wi.b]) {
        const c = closestOnSegment(p, wj.a, wj.b);
        if (c.dist < ON_SEG_TOL) {
          splits[j].push({ p, u: c.t * lj });
          touched = true;
        }
      }
      if (touched) continue;
      const x = segIntersect(wi.a, wi.b, wj.a, wj.b);
      if (x) {
        const p = add(wi.a, mul(sub(wi.b, wi.a), x.t));
        splits[i].push({ p, u: x.t * li });
        splits[j].push({ p, u: x.s * lj });
      }
    }
  }

  // 2. edges
  const edges: GraphEdge[] = [];
  const edgeByPair = new Map<string, number>();
  valid.forEach((w, i) => {
    const pts = splits[i].slice().sort((m, n) => m.u - n.u);
    let prev = pts[0];
    let prevNode = nodeAt(prev.p);
    for (let k = 1; k < pts.length; k++) {
      const cur = pts[k];
      const curNode = nodeAt(cur.p);
      if (curNode === prevNode) continue;
      const pairKey = prevNode < curNode ? `${prevNode}-${curNode}` : `${curNode}-${prevNode}`;
      const existing = edgeByPair.get(pairKey);
      if (existing !== undefined) {
        edges[existing].thickness = Math.max(edges[existing].thickness, w.thickness);
      } else {
        const pa = nodes[prevNode].p;
        const pb = nodes[curNode].p;
        const dir = norm(sub(pb, pa));
        const n = perp(dir);
        const zero = { x: 0, y: 0 };
        edgeByPair.set(pairKey, edges.length);
        edges.push({
          id: edges.length,
          wallId: w.id,
          a: prevNode,
          b: curNode,
          pa,
          pb,
          dir,
          n,
          length: dist(pa, pb),
          thickness: w.thickness,
          u0: prev.u,
          u1: cur.u,
          posRoom: -1,
          negRoom: -1,
          aPos: zero,
          aNeg: zero,
          bPos: zero,
          bNeg: zero,
          aJoined: false,
          bJoined: false,
        });
      }
      prev = cur;
      prevNode = curNode;
    }
  });

  // 3. half-edges: id = edge*2 (a->b) or edge*2+1 (b->a)
  const heFrom = (h: number) => (h & 1 ? edges[h >> 1].b : edges[h >> 1].a);
  const heTo = (h: number) => (h & 1 ? edges[h >> 1].a : edges[h >> 1].b);
  const heDir = (h: number): Vec2 => {
    const e = edges[h >> 1];
    return h & 1 ? { x: -e.dir.x, y: -e.dir.y } : e.dir;
  };
  const heAngle = (h: number) => {
    const d = heDir(h);
    return Math.atan2(d.y, d.x);
  };
  for (const e of edges) {
    nodes[e.a].out.push(e.id * 2);
    nodes[e.b].out.push(e.id * 2 + 1);
  }
  for (const nd of nodes) nd.out.sort((p, q) => heAngle(p) - heAngle(q));

  // 4. joints: corner between consecutive outgoing half-edges
  const posCorner = new Map<number, Vec2>();
  const negCorner = new Map<number, Vec2>();
  for (const nd of nodes) {
    const k = nd.out.length;
    for (let i = 0; i < k; i++) {
      const h1 = nd.out[i];
      const h2 = nd.out[(i + 1) % k];
      const d1 = heDir(h1);
      const d2 = heDir(h2);
      const t1 = edges[h1 >> 1].thickness / 2;
      const t2 = edges[h2 >> 1].thickness / 2;
      const p1 = add(nd.p, mul(perp(d1), t1)); // pos side of h1
      const p2 = sub(nd.p, mul(perp(d2), t2)); // neg side of h2
      if (k === 1) {
        posCorner.set(h1, p1);
        negCorner.set(h2, p2);
        continue;
      }
      let c: Vec2 | null = null;
      if (Math.abs(cross(d1, d2)) > 0.02) c = lineIntersect(p1, d1, p2, d2);
      if (c && dist(c, nd.p) <= 3 * Math.max(t1, t2) + 0.02) {
        posCorner.set(h1, c);
        negCorner.set(h2, c);
      } else {
        posCorner.set(h1, p1);
        negCorner.set(h2, p2);
      }
    }
  }
  for (const e of edges) {
    const ha = e.id * 2;
    const hb = e.id * 2 + 1;
    e.aPos = posCorner.get(ha)!;
    e.aNeg = negCorner.get(ha)!;
    e.bNeg = posCorner.get(hb)!;
    e.bPos = negCorner.get(hb)!;
    e.aJoined = nodes[e.a].out.length > 1;
    e.bJoined = nodes[e.b].out.length > 1;
  }

  // 5. faces
  const indexInOut = new Map<number, number>();
  for (const nd of nodes) nd.out.forEach((h, i) => indexInOut.set(h, i));
  const nextHe = (h: number): number => {
    const to = nodes[heTo(h)];
    const twin = h ^ 1;
    const i = indexInOut.get(twin)!;
    return to.out[(i - 1 + to.out.length) % to.out.length];
  };

  // connected components (to find nested islands)
  const comp = nodes.map((_, i) => i);
  const find = (x: number): number => (comp[x] === x ? x : (comp[x] = find(comp[x])));
  for (const e of edges) comp[find(e.a)] = find(e.b);

  const visited = new Uint8Array(edges.length * 2);
  const rooms: Room[] = [];
  const outlines: { polygon: Vec2[]; comp: number }[] = [];
  const roomComp: number[] = [];
  for (let h0 = 0; h0 < edges.length * 2; h0++) {
    if (visited[h0]) continue;
    const loop: number[] = [];
    let h = h0;
    let guard = 0;
    while (!visited[h] && guard++ < 100000) {
      visited[h] = 1;
      loop.push(h);
      h = nextHe(h);
    }
    // node sequence with spikes (dead-end walls) removed
    let seq = loop.map((x) => heFrom(x));
    let changed = true;
    while (changed && seq.length > 2) {
      changed = false;
      for (let i = 0; i < seq.length; i++) {
        const prev = seq[(i - 1 + seq.length) % seq.length];
        const next = seq[(i + 1) % seq.length];
        if (prev === next) {
          const j = (i + 1) % seq.length;
          seq = seq.filter((_, idx) => idx !== i && idx !== j);
          changed = true;
          break;
        }
      }
    }
    if (seq.length < 3) continue;
    const polygon = seq.map((id) => nodes[id].p);
    const area = polygonArea(polygon);
    if (area > 0.05) {
      const index = rooms.length;
      const sides: Room['sides'] = [];
      let wallArea = 0;
      for (const x of loop) {
        const e = edges[x >> 1];
        if (x & 1) {
          e.negRoom = index;
          sides.push({ edge: e.id, side: 'neg' });
        } else {
          e.posRoom = index;
          sides.push({ edge: e.id, side: 'pos' });
        }
        wallArea += (e.length * e.thickness) / 2;
      }
      rooms.push({
        index,
        polygon,
        holes: [],
        area: Math.max(0, area - wallArea),
        labelPoint: interiorPoint(polygon),
        sides,
      });
      roomComp.push(find(seq[0]));
    } else if (area < -0.05) {
      outlines.push({ polygon: polygon.slice().reverse(), comp: find(seq[0]) });
    }
  }

  // 6. nested components become holes of the smallest enclosing room
  for (const o of outlines) {
    let best = -1;
    let bestArea = Infinity;
    for (const r of rooms) {
      if (roomComp[r.index] === o.comp) continue;
      if (!pointInPolygon(o.polygon[0], r.polygon)) continue;
      const a = polygonArea(r.polygon);
      if (a < bestArea) {
        bestArea = a;
        best = r.index;
      }
    }
    if (best >= 0) {
      rooms[best].holes.push(o.polygon);
      rooms[best].area = Math.max(0, rooms[best].area - polygonArea(o.polygon));
      if (pointInPolygon(rooms[best].labelPoint, o.polygon)) {
        // move the label out of the island: between the room's first vertex and the island
        const r = rooms[best];
        r.labelPoint = { x: (r.polygon[0].x + o.polygon[0].x) / 2, y: (r.polygon[0].y + o.polygon[0].y) / 2 };
      }
    }
  }

  return { nodes, edges, rooms };
}

const cache = new WeakMap<Wall[], LevelGraph>();
/** Memoized by the identity of the walls array (the store never mutates it in place). */
export function getGraph(walls: Wall[]): LevelGraph {
  let g = cache.get(walls);
  if (!g) {
    g = buildGraph(walls);
    cache.set(walls, g);
  }
  return g;
}

export function roomAt(graph: LevelGraph, p: Vec2): Room | undefined {
  let best: Room | undefined;
  let bestArea = Infinity;
  for (const r of graph.rooms) {
    if (!pointInPolygon(p, r.polygon)) continue;
    if (r.holes.some((h) => pointInPolygon(p, h))) continue;
    const a = polygonArea(r.polygon);
    if (a < bestArea) {
      bestArea = a;
      best = r;
    }
  }
  return best;
}

/** Style attached to a room: the (last) style whose anchor point lies in the room. */
export function styleOfRoom(graph: LevelGraph, room: Room, styles: RoomStyle[]): RoomStyle | undefined {
  let found: RoomStyle | undefined;
  for (const s of styles) {
    if (roomAt(graph, s.point)?.index === room.index) found = s;
  }
  return found;
}

/** Uncovered parts of segment a-b after removing stretches that overlap existing collinear walls. */
export function uncoveredParts(a: Vec2, b: Vec2, walls: Wall[]): [Vec2, Vec2][] {
  const L = dist(a, b);
  if (L < 0.01) return [];
  const d = norm(sub(b, a));
  const covered: [number, number][] = [];
  for (const w of walls) {
    const da = closestOnLine(w.a, a, d);
    const db = closestOnLine(w.b, a, d);
    if (da.dist > ON_SEG_TOL || db.dist > ON_SEG_TOL) continue;
    const lo = Math.max(0, Math.min(da.u, db.u));
    const hi = Math.min(L, Math.max(da.u, db.u));
    if (hi - lo > 0.01) covered.push([lo, hi]);
  }
  covered.sort((m, n) => m[0] - n[0]);
  const parts: [Vec2, Vec2][] = [];
  let cur = 0;
  for (const [lo, hi] of covered) {
    if (lo - cur > 0.01) parts.push([add(a, mul(d, cur)), add(a, mul(d, lo))]);
    cur = Math.max(cur, hi);
  }
  if (L - cur > 0.01) parts.push([add(a, mul(d, cur)), b]);
  return parts;
}

function closestOnLine(p: Vec2, origin: Vec2, d: Vec2): { u: number; dist: number } {
  const rel = sub(p, origin);
  const u = dot(rel, d);
  return { u, dist: Math.abs(cross(d, rel)) };
}
