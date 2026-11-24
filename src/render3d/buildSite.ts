import * as THREE from 'three';
import { finishes } from '../materials/finishes';
import { ROAD_CELL, ROAD_SIDEWALK, type Site } from '../model/types';
import { waterMaterial } from './effects';
import { MeshBuilder, type V3 } from './MeshBuilder';

export const SIDEWALK_HEIGHT = 0.12;
const ASPHALT_Y = 0.035;
const MARK_Y = 0.045;
const AREA_Y = 0.018;
const MARK = '__mark';
const AREA = '__area:';
const markMaterial = new THREE.MeshStandardMaterial({ color: '#f2f0e6', roughness: 0.75 });

const roadKey = (i: number, j: number) => `${i},${j}`;

/** Fast lookup of road cells. */
export function roadSet(site: Site): Set<string> {
  return new Set(site.roads.map(([i, j]) => roadKey(i, j)));
}

/** Height of the walkable ground at a site position (sidewalks are slightly raised). */
export function groundHeight(set: Set<string>, x: number, y: number): number {
  const i = Math.floor(x / ROAD_CELL);
  const j = Math.floor(y / ROAD_CELL);
  if (!set.has(roadKey(i, j))) return 0;
  const lx = x - i * ROAD_CELL;
  const ly = y - j * ROAD_CELL;
  const S = ROAD_SIDEWALK;
  const C = ROAD_CELL;
  const inX = lx > S && lx < C - S;
  const inY = ly > S && ly < C - S;
  if (inX && inY) return ASPHALT_Y;
  if (inX) return set.has(roadKey(i, ly < S ? j - 1 : j + 1)) ? ASPHALT_Y : SIDEWALK_HEIGHT;
  if (inY) return set.has(roadKey(lx < S ? i - 1 : i + 1, j)) ? ASPHALT_Y : SIDEWALK_HEIGHT;
  return SIDEWALK_HEIGHT;
}

/** The pieces of one road cell, shared by the 3D mesh and the 2D plan. */
export interface RoadPieces {
  asphalt: [number, number, number, number][]; // x0, y0, x1, y1
  sidewalk: [number, number, number, number][];
  marks: [number, number, number, number][];
}

export function roadPieces(set: Set<string>, i: number, j: number): RoadPieces {
  const C = ROAD_CELL;
  const S = ROAD_SIDEWALK;
  const x = i * C;
  const y = j * C;
  const n = set.has(roadKey(i, j - 1));
  const s = set.has(roadKey(i, j + 1));
  const w = set.has(roadKey(i - 1, j));
  const e = set.has(roadKey(i + 1, j));
  const out: RoadPieces = { asphalt: [[x + S, y + S, x + C - S, y + C - S]], sidewalk: [], marks: [] };
  const arm = (connected: boolean, r: [number, number, number, number]) => (connected ? out.asphalt : out.sidewalk).push(r);
  arm(n, [x + S, y, x + C - S, y + S]);
  arm(s, [x + S, y + C - S, x + C - S, y + C]);
  arm(w, [x, y + S, x + S, y + C - S]);
  arm(e, [x + C - S, y + S, x + C, y + C - S]);
  out.sidewalk.push([x, y, x + S, y + S], [x + C - S, y, x + C, y + S], [x, y + C - S, x + S, y + C], [x + C - S, y + C - S, x + C, y + C]);

  const count = [n, s, w, e].filter(Boolean).length;
  const cx = x + C / 2;
  const cy = y + C / 2;
  const lw = 0.07;
  if (count === 2 && n && s) {
    for (let k = 0; k < 3; k++) out.marks.push([cx - lw, y + 0.9 + k * 3.4, cx + lw, y + 2.7 + k * 3.4]);
  } else if (count === 2 && w && e) {
    for (let k = 0; k < 3; k++) out.marks.push([x + 0.9 + k * 3.4, cy - lw, x + 2.7 + k * 3.4, cy + lw]);
  } else if (count >= 3) {
    // zebra crossings on every arm of a junction
    const stripes = 6;
    const sw = 0.5;
    const pitch = (C - 2 * S) / stripes;
    for (let k = 0; k < stripes; k++) {
      const o = S + pitch * (k + 0.5);
      if (n) out.marks.push([x + o - sw / 2, y + 0.2, x + o + sw / 2, y + S - 0.2]);
      if (s) out.marks.push([x + o - sw / 2, y + C - S + 0.2, x + o + sw / 2, y + C - 0.2]);
      if (w) out.marks.push([x + 0.2, y + o - sw / 2, x + S - 0.2, y + o + sw / 2]);
      if (e) out.marks.push([x + C - S + 0.2, y + o - sw / 2, x + C - 0.2, y + o + sw / 2]);
    }
  }
  return out;
}

type Rect = [number, number, number, number]; // x0, y0, x1, y1 (x0 < x1, y0 < y1)

/** `r` minus `cut`: up to four rectangles. */
export function subtractRect(r: Rect, cut: Rect): Rect[] {
  const [x0, y0, x1, y1] = r;
  const cx0 = Math.max(x0, cut[0]);
  const cy0 = Math.max(y0, cut[1]);
  const cx1 = Math.min(x1, cut[2]);
  const cy1 = Math.min(y1, cut[3]);
  if (cx0 >= cx1 - 1e-6 || cy0 >= cy1 - 1e-6) return [r];
  const out: Rect[] = [];
  if (cy0 > y0 + 1e-6) out.push([x0, y0, x1, cy0]);
  if (cy1 < y1 - 1e-6) out.push([x0, cy1, x1, y1]);
  if (cx0 > x0 + 1e-6) out.push([x0, cy0, cx0, cy1]);
  if (cx1 < x1 - 1e-6) out.push([cx1, cy0, x1, cy1]);
  return out;
}

/**
 * The visible part of every ground-cover area, as in the 2D site plan: a later area covers the earlier
 * ones and roads cover areas. Overlapping coplanar areas would z-fight (flicker) in 3D, so the covered
 * parts are cut away instead of being drawn twice at the same height.
 */
export function visibleAreas(site: Site): { finish: string; rects: Rect[] }[] {
  const boxes: Rect[] = site.areas.map((a) => [Math.min(a.x0, a.x1), Math.min(a.y0, a.y1), Math.max(a.x0, a.x1), Math.max(a.y0, a.y1)]);
  const roads: Rect[] = site.roads.map(([i, j]) => [i * ROAD_CELL, j * ROAD_CELL, (i + 1) * ROAD_CELL, (j + 1) * ROAD_CELL]);
  const hits = (a: Rect, b: Rect) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
  return site.areas.map((a, i) => {
    let rects: Rect[] = [boxes[i]];
    const cuts = [...boxes.slice(i + 1), ...roads].filter((c) => hits(c, boxes[i]));
    for (const c of cuts) {
      rects = rects.flatMap((r) => subtractRect(r, c));
      if (!rects.length) break;
    }
    return { finish: a.finish, rects: rects.filter((r) => r[2] - r[0] > 1e-3 && r[3] - r[1] > 1e-3) };
  });
}

/**
 * Pushes a mesh's depth back by a slope-scaled amount while it is drawn, so that thin layers lying a
 * few millimetres above it (areas on the lawn, asphalt, road markings) win the depth test even far
 * away, where 24-bit depth cannot resolve the real gap. The materials are shared with other meshes
 * (finish library), so the offset is switched on only around this mesh's own draw call; it is not a
 * program parameter, so nothing recompiles.
 */
export function setDepthLayer(mesh: THREE.Mesh, layer: number): void {
  if (layer <= 0) return;
  mesh.onBeforeRender = (_r, _s, _c, _g, material) => {
    material.polygonOffset = true;
    material.polygonOffsetFactor = layer;
    material.polygonOffsetUnits = layer;
  };
  mesh.onAfterRender = (_r, _s, _c, _g, material) => {
    material.polygonOffset = false;
    material.polygonOffsetFactor = 0;
    material.polygonOffsetUnits = 0;
  };
}

/** Depth layers (bigger = pushed further back): ground < areas < asphalt / sidewalks < markings. */
export const DEPTH_LAYER = { ground: 3, area: 2, road: 1, mark: 0 } as const;

/** Roads (asphalt, raised sidewalks, markings) and ground-cover areas. */
export function buildSite(site: Site): THREE.Group {
  const mb = new MeshBuilder();
  const up: V3 = [0, 1, 0];
  const flat = (key: string, r: [number, number, number, number], y: number) => {
    const [x0, y0, x1, y1] = r;
    mb.quad(key, [x0, y, y0], [x1, y, y0], [x1, y, y1], [x0, y, y1], up, [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ]);
  };
  // (areas get their own bucket keys so that they can be layered below the roads that share a finish)
  for (const a of visibleAreas(site)) for (const r of a.rects) flat(AREA + a.finish, r, AREA_Y);
  const set = roadSet(site);
  for (const [i, j] of site.roads) {
    const p = roadPieces(set, i, j);
    for (const r of p.asphalt) flat('asphalt', r, ASPHALT_Y);
    for (const r of p.marks) flat(MARK, r, MARK_Y);
    for (const r of p.sidewalk) {
      flat('pavers', r, SIDEWALK_HEIGHT);
      const [x0, y0, x1, y1] = r;
      const h = SIDEWALK_HEIGHT;
      const side = (ax: number, ay: number, bx: number, by: number, n: V3) => {
        const L = Math.hypot(bx - ax, by - ay);
        mb.quad('concrete-smooth', [ax, 0, ay], [bx, 0, by], [bx, h, by], [ax, h, ay], n, [
          [0, 0],
          [L, 0],
          [L, h],
          [0, h],
        ]);
      };
      side(x0, y0, x1, y0, [0, 0, -1]);
      side(x1, y1, x0, y1, [0, 0, 1]);
      side(x0, y1, x0, y0, [-1, 0, 0]);
      side(x1, y0, x1, y1, [1, 0, 0]);
    }
  }
  const group = mb.build((key) => {
    const finish = key.startsWith(AREA) ? key.slice(AREA.length) : key;
    return finish === MARK ? markMaterial : finish === 'water' ? waterMaterial() : finishes.material(finish);
  });
  group.traverse((o) => {
    o.castShadow = false;
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    // (the kerbs' vertical faces need no offset; the markings are on top)
    if (m.name.startsWith(AREA)) setDepthLayer(m, DEPTH_LAYER.area);
    else if (m.name === 'asphalt' || m.name === 'pavers') setDepthLayer(m, DEPTH_LAYER.road);
  });
  return group;
}
