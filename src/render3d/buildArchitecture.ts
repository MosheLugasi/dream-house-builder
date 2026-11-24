import * as THREE from 'three';
import { getOpeningDef, type OpeningAnim } from '../catalog/openings';
import { finishes } from '../materials/finishes';
import { getGraph, styleOfRoom } from '../model/graph';
import { SLAB, type Building, type Level, type Opening, type Vec2 } from '../model/types';
import { MeshBuilder, type V3 } from './MeshBuilder';

/** A rectangle on the plan with a rotation (stair footprints that pierce floors and ceilings). */
export interface OrientedRect {
  x: number;
  y: number;
  hw: number;
  hd: number;
  rotation: number;
}

export interface ArchOptions {
  /** cut walls at ~1 m so that interiors are visible from above */
  wallsLow: boolean;
  /** draw ceilings */
  ceilings: boolean;
  /** draw the flat roof / terrace surface above the ceiling */
  topSlab: boolean;
  /** extra height of the exterior walls: the slab below the next level, or a flat roof's parapet */
  exteriorExtra: number;
  /** openings in this level's floor (stairs arriving from the level below) */
  floorHoles: OrientedRect[];
  /** openings in this level's ceiling and top slab (stairs leaving for the level above) */
  ceilingHoles: OrientedRect[];
}

/** A solid stretch of wall the character cannot pass. */
export interface WallCollider {
  a: Vec2;
  b: Vec2;
  half: number;
}

export interface DoorInstance {
  center: Vec2;
  anims: OpeningAnim[];
  /** 0 closed … 1 open */
  open: number;
}

export interface Architecture {
  group: THREE.Group;
  colliders: WallCollider[];
  doors: DoorInstance[];
}

const LOW_HEIGHT = 1.05;
/** how far exterior wall faces continue below the floor line */
const FOOTING = 0.2;
/** height of the flat roof / terrace surface above the ceiling line */
const TOP_SLAB_Y = 0.22;
const TOP_KEY = '__top';
const REVEAL_KEY = 'paint:#f1efe9';
const CEILING_KEY = '__ceiling';
const BASEBOARD_KEY = '__baseboard';

const topMaterial = new THREE.MeshStandardMaterial({ color: '#30343b', roughness: 0.9 });
// ceilings only receive bounced light, which a real-time renderer lacks: lift them with a little emissive
const CEILING_GLOW = 0.42;
const ceilingMaterial = new THREE.MeshStandardMaterial({ color: '#fbfaf6', roughness: 0.95, emissive: '#fff6ea', emissiveIntensity: CEILING_GLOW });

/** Scale the ceilings' fake bounce light (the renderer lowers it where it lights rooms through their windows). */
export function setCeilingGlow(k: number): void {
  ceilingMaterial.emissiveIntensity = CEILING_GLOW * k;
}
const baseboardMaterial = new THREE.MeshStandardMaterial({ color: '#f6f5f1', roughness: 0.5 });

function materialFor(key: string): THREE.Material {
  if (key === TOP_KEY) return topMaterial;
  if (key === BASEBOARD_KEY) return baseboardMaterial;
  if (key === CEILING_KEY) return ceilingMaterial;
  return finishes.material(key);
}

/** Clip a convex polygon to the half-plane a*x + b*y <= c. */
function clipHalfPlane(poly: Vec2[], a: number, b: number, c: number): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const dp = a * p.x + b * p.y - c;
    const dq = a * q.x + b * q.y - c;
    if (dp <= 0) out.push(p);
    if ((dp < 0 && dq > 0) || (dp > 0 && dq < 0)) {
      const t = dp / (dp - dq);
      out.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
    }
  }
  return out;
}

const polyArea = (poly: Vec2[]): number => {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    s += p.x * q.y - q.x * p.y;
  }
  return Math.abs(s) / 2;
};

/** Convex polygon minus an oriented rectangle, as a list of convex pieces. */
export function subtractRect(poly: Vec2[], r: OrientedRect): Vec2[][] {
  const c = Math.cos(r.rotation);
  const s = Math.sin(r.rotation);
  // half-planes of the rectangle in world space: n·p <= n·center + extent
  const planes: [number, number, number][] = [
    [c, s, c * r.x + s * r.y + r.hw],
    [-c, -s, -(c * r.x + s * r.y) + r.hw],
    [-s, c, -s * r.x + c * r.y + r.hd],
    [s, -c, -(-s * r.x + c * r.y) + r.hd],
  ];
  const pieces: Vec2[][] = [];
  let rest = poly;
  for (const [a, b, d] of planes) {
    const outside = clipHalfPlane(rest, -a, -b, -d);
    if (outside.length >= 3 && polyArea(outside) > 1e-6) pieces.push(outside);
    rest = clipHalfPlane(rest, a, b, d);
    if (rest.length < 3) break;
  }
  return pieces;
}

interface Cut {
  u0: number;
  u1: number;
  y0: number;
  y1: number;
  opening: Opening;
}

export function buildArchitecture(level: Level, building: Building, opts: ArchOptions): Architecture {
  const graph = getGraph(level.walls);
  const mb = new MeshBuilder();
  const group = new THREE.Group();
  const colliders: WallCollider[] = [];
  const doors: DoorInstance[] = [];
  const H = level.height;

  const roomWall: string[] = [];
  const roomFloor: string[] = [];
  for (const room of graph.rooms) {
    const style = styleOfRoom(graph, room, level.roomStyles);
    roomWall.push(style?.wall ?? building.defaultWall);
    roomFloor.push(style?.floor ?? building.defaultFloor);
  }

  const openingsByWall = new Map<string, Opening[]>();
  for (const o of level.openings) {
    const list = openingsByWall.get(o.wallId) ?? [];
    list.push(o);
    openingsByWall.set(o.wallId, list);
  }

  const extra = opts.wallsLow ? 0 : opts.exteriorExtra;

  for (const e of graph.edges) {
    const isExterior = e.posRoom < 0 || e.negRoom < 0;
    const wallH = opts.wallsLow ? LOW_HEIGHT : isExterior ? H + extra : H;
    const half = e.thickness / 2;

    // openings on this edge, in edge-local coordinates
    const cuts: Cut[] = [];
    for (const o of openingsByWall.get(e.wallId) ?? []) {
      const c = o.offset - e.u0;
      if (c < 0 || c > e.length) continue;
      const u0 = Math.max(0.03, c - o.width / 2);
      const u1 = Math.min(e.length - 0.03, c + o.width / 2);
      if (u1 - u0 < 0.1) continue;
      const def = getOpeningDef(o.style, o.type);
      // 3D object
      if (!opts.wallsLow || o.sill + o.height <= LOW_HEIGHT) {
        const obj = def.build({ ...o, width: u1 - u0 }, e.thickness);
        const cu = (u0 + u1) / 2;
        obj.position.set(e.pa.x + e.dir.x * cu, 0, e.pa.y + e.dir.y * cu);
        obj.rotation.y = -Math.atan2(e.dir.y, e.dir.x);
        group.add(obj);
        const anims = obj.userData.anim as OpeningAnim[] | undefined;
        if (anims?.length) doors.push({ center: { x: obj.position.x, y: obj.position.z }, anims, open: 0 });
      }
      if (o.sill < wallH) cuts.push({ u0, u1, y0: o.sill, y1: Math.min(o.sill + o.height, wallH), opening: o });
    }
    cuts.sort((m, n) => m.u0 - n.u0);

    // colliders
    {
      let cursor = 0;
      const at = (u: number): Vec2 => ({ x: e.pa.x + e.dir.x * u, y: e.pa.y + e.dir.y * u });
      for (const c of cuts) {
        if (!getOpeningDef(c.opening.style, c.opening.type).passable) continue;
        if (c.u0 - cursor > 0.01) colliders.push({ a: at(cursor), b: at(c.u0), half });
        cursor = c.u1;
      }
      if (e.length - cursor > 0.01) colliders.push({ a: at(cursor), b: at(e.length), half });
    }

    const P = (u: number, y: number, side: number): V3 => [
      e.pa.x + e.dir.x * u + e.n.x * half * side,
      y,
      e.pa.y + e.dir.y * u + e.n.y * half * side,
    ];
    const uOf = (p: Vec2) => (p.x - e.pa.x) * e.dir.x + (p.y - e.pa.y) * e.dir.y;

    for (const side of [1, -1] as const) {
      const room = side === 1 ? e.posRoom : e.negRoom;
      const key = room >= 0 ? roomWall[room] : building.exterior;
      const uA = uOf(side === 1 ? e.aPos : e.aNeg);
      const uB = uOf(side === 1 ? e.bPos : e.bNeg);
      const normal: V3 = [e.n.x * side, 0, e.n.y * side];
      const rect = (u0: number, u1: number, y0: number, y1: number) => {
        if (u1 - u0 < 1e-4 || y1 - y0 < 1e-4) return;
        const uu0 = e.u0 + u0;
        const uu1 = e.u0 + u1;
        mb.quad(key, P(u0, y0, side), P(u1, y0, side), P(u1, y1, side), P(u0, y1, side), normal, [
          [uu0, y0],
          [uu1, y0],
          [uu1, y1],
          [uu0, y1],
        ]);
      };
      const baseboard = (u0: number, u1: number) => {
        if (room < 0 || u1 - u0 < 0.02) return;
        const off = half + 0.012;
        const h = 0.08;
        const Q = (u: number, y: number, o: number): V3 => [
          e.pa.x + e.dir.x * u + e.n.x * o * side,
          y,
          e.pa.y + e.dir.y * u + e.n.y * o * side,
        ];
        mb.quad(BASEBOARD_KEY, Q(u0, 0, off), Q(u1, 0, off), Q(u1, h, off), Q(u0, h, off), normal, [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ]);
        // the 12 mm top is seen almost edge-on from across a room: thinner than a pixel, it was drawn as a
        // dotted line of bright (sky-lit, upward facing) pixels along every wall. A rounded-over top that
        // is shaded like the baseboard's face (mostly facing the room) keeps those pixels the same colour.
        const top: V3 = [normal[0] * 0.92, 0.4, normal[2] * 0.92];
        mb.quad(BASEBOARD_KEY, Q(u0, h, off), Q(u1, h, off), Q(u1, h + 0.004, half), Q(u0, h + 0.004, half), top, [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ]);
      };
      // outdoor faces reach below the floor so that no gap shows above the ground
      const foot = room < 0 ? -FOOTING : 0;
      let cursor = uA;
      for (const c of cuts) {
        rect(cursor, c.u0, foot, wallH);
        baseboard(cursor, c.u0);
        rect(c.u0, c.u1, foot, c.y0);
        if (c.y0 > 0.1) baseboard(c.u0, c.u1);
        rect(c.u0, c.u1, c.y1, wallH);
        cursor = c.u1;
      }
      rect(cursor, uB, foot, wallH);
      baseboard(cursor, uB);
    }

    // reveals inside the openings
    for (const c of cuts) {
      const d: V3 = [e.dir.x, 0, e.dir.y];
      const nd: V3 = [-e.dir.x, 0, -e.dir.y];
      const t = e.thickness;
      const uvs: [[number, number], [number, number], [number, number], [number, number]] = [
        [0, c.y0],
        [t, c.y0],
        [t, c.y1],
        [0, c.y1],
      ];
      mb.quad(REVEAL_KEY, P(c.u0, c.y0, -1), P(c.u0, c.y0, 1), P(c.u0, c.y1, 1), P(c.u0, c.y1, -1), d, uvs);
      mb.quad(REVEAL_KEY, P(c.u1, c.y0, -1), P(c.u1, c.y0, 1), P(c.u1, c.y1, 1), P(c.u1, c.y1, -1), nd, uvs);
      const huv: [[number, number], [number, number], [number, number], [number, number]] = [
        [c.u0, 0],
        [c.u1, 0],
        [c.u1, t],
        [c.u0, t],
      ];
      if (c.y1 < wallH - 1e-4)
        mb.quad(REVEAL_KEY, P(c.u0, c.y1, -1), P(c.u1, c.y1, -1), P(c.u1, c.y1, 1), P(c.u0, c.y1, 1), [0, -1, 0], huv);
      if (c.y0 > 1e-4)
        mb.quad(REVEAL_KEY, P(c.u0, c.y0, -1), P(c.u1, c.y0, -1), P(c.u1, c.y0, 1), P(c.u0, c.y0, 1), [0, 1, 0], huv);
    }

    // top
    {
      const y = wallH;
      const topKey = extra > 0 && isExterior ? building.exterior : TOP_KEY;
      const p3 = (p: Vec2): V3 => [p.x, y, p.y];
      const uv = (p: Vec2): [number, number] => [p.x, p.y];
      const up: V3 = [0, 1, 0];
      mb.quad(topKey, p3(e.aNeg), p3(e.aPos), p3(e.bPos), p3(e.bNeg), up, [uv(e.aNeg), uv(e.aPos), uv(e.bPos), uv(e.bNeg)]);
      mb.tri(topKey, p3(e.aNeg), p3(e.pa), p3(e.aPos), up, [uv(e.aNeg), uv(e.pa), uv(e.aPos)]);
      mb.tri(topKey, p3(e.bNeg), p3(e.pb), p3(e.bPos), up, [uv(e.bNeg), uv(e.pb), uv(e.bPos)]);
    }

    // free ends
    const cap = (neg: Vec2, pos: Vec2, joined: boolean, normal: V3) => {
      if (joined) return;
      const key = e.posRoom >= 0 ? roomWall[e.posRoom] : e.negRoom >= 0 ? roomWall[e.negRoom] : building.exterior;
      mb.quad(key, [neg.x, -FOOTING, neg.y], [pos.x, -FOOTING, pos.y], [pos.x, wallH, pos.y], [neg.x, wallH, neg.y], normal, [
        [0, 0],
        [e.thickness, 0],
        [e.thickness, wallH],
        [0, wallH],
      ]);
    };
    cap(e.aNeg, e.aPos, e.aJoined, [-e.dir.x, 0, -e.dir.y]);
    cap(e.bNeg, e.bPos, e.bJoined, [e.dir.x, 0, e.dir.y]);
  }

  // floors, ceilings, top slab – with the stair openings cut out
  const drawCeiling = opts.ceilings && !opts.wallsLow;
  const drawTop = opts.topSlab && !opts.wallsLow;
  for (const room of graph.rooms) {
    const contour = room.polygon.map((p) => new THREE.Vector2(p.x, p.y));
    const holes = room.holes.map((h) => h.map((p) => new THREE.Vector2(p.x, p.y)));
    const all = contour.concat(...holes);
    const tris = THREE.ShapeUtils.triangulateShape(contour, holes).map((t) => t.map((i) => ({ x: all[i].x, y: all[i].y })));
    const layer = (key: string, y: number, normal: V3, cut: OrientedRect[]) => {
      let pieces: Vec2[][] = tris;
      for (const rect of cut) pieces = pieces.flatMap((poly) => subtractRect(poly, rect));
      for (const poly of pieces) {
        for (let i = 1; i + 1 < poly.length; i++) {
          const a = poly[0];
          const b = poly[i];
          const c = poly[i + 1];
          mb.tri(key, [a.x, y, a.y], [b.x, y, b.y], [c.x, y, c.y], normal, [
            [a.x, a.y],
            [b.x, b.y],
            [c.x, c.y],
          ]);
        }
      }
    };
    layer(roomFloor[room.index], 0.012, [0, 1, 0], opts.floorHoles);
    if (drawCeiling) layer(CEILING_KEY, H, [0, -1, 0], opts.ceilingHoles);
    if (drawTop) layer(building.roof.finish, H + TOP_SLAB_Y, [0, 1, 0], opts.ceilingHoles);
  }

  // the cut edge of the slab around each stair opening
  if (drawCeiling) {
    for (const r of opts.ceilingHoles) {
      const c = Math.cos(r.rotation);
      const s = Math.sin(r.rotation);
      const corner = (lx: number, ly: number): Vec2 => ({ x: r.x + lx * c - ly * s, y: r.y + lx * s + ly * c });
      const pts = [corner(-r.hw, -r.hd), corner(r.hw, -r.hd), corner(r.hw, r.hd), corner(-r.hw, r.hd)];
      for (let i = 0; i < 4; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % 4];
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const inward: V3 = [r.x - mid.x, 0, r.y - mid.y];
        const L = Math.hypot(b.x - a.x, b.y - a.y);
        mb.quad(REVEAL_KEY, [a.x, H, a.y], [b.x, H, b.y], [b.x, H + SLAB + 0.012, b.y], [a.x, H + SLAB + 0.012, a.y], inward, [
          [0, 0],
          [L, 0],
          [L, SLAB],
          [0, SLAB],
        ]);
      }
    }
  }

  const meshes = mb.build(materialFor);
  group.add(meshes);
  return { group, colliders, doors };
}

export function disposeArchitecture(arch: Architecture): void {
  arch.group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) m.geometry.dispose();
  });
}
