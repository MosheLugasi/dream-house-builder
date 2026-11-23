import * as THREE from 'three';
import { getOpeningDef, type OpeningAnim } from '../catalog/openings';
import { finishes } from '../materials/finishes';
import { getGraph, styleOfRoom } from '../model/graph';
import type { Building, Level, Opening, Vec2 } from '../model/types';
import { MeshBuilder, type V3 } from './MeshBuilder';

export interface ArchOptions {
  /** cut walls at ~1 m so that interiors are visible from above */
  wallsLow: boolean;
  /** ceilings (needed when walking inside) */
  ceilings: boolean;
  roof: boolean;
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
const TOP_KEY = '__top';
const REVEAL_KEY = 'paint:#f1efe9';
const CEILING_KEY = '__ceiling';
const BASEBOARD_KEY = '__baseboard';

const topMaterial = new THREE.MeshStandardMaterial({ color: '#30343b', roughness: 0.9 });
// ceilings only receive bounced light, which a real-time renderer lacks: lift them with a little emissive
const ceilingMaterial = new THREE.MeshStandardMaterial({ color: '#fbfaf6', roughness: 0.95, emissive: '#fff6ea', emissiveIntensity: 0.42 });
const baseboardMaterial = new THREE.MeshStandardMaterial({ color: '#f6f5f1', roughness: 0.5 });

function materialFor(key: string): THREE.Material {
  if (key === TOP_KEY) return topMaterial;
  if (key === BASEBOARD_KEY) return baseboardMaterial;
  if (key === CEILING_KEY) return ceilingMaterial;
  return finishes.material(key);
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

  const showRoof = opts.roof && !opts.wallsLow && building.roof.type !== 'none';

  for (const e of graph.edges) {
    const isExterior = e.posRoom < 0 || e.negRoom < 0;
    const wallH = opts.wallsLow ? LOW_HEIGHT : showRoof && isExterior ? H + 0.3 : H;
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
        mb.quad(BASEBOARD_KEY, Q(u0, h, off), Q(u1, h, off), Q(u1, h, half), Q(u0, h, half), [0, 1, 0], [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ]);
      };
      let cursor = uA;
      for (const c of cuts) {
        rect(cursor, c.u0, 0, wallH);
        baseboard(cursor, c.u0);
        rect(c.u0, c.u1, 0, c.y0);
        if (c.y0 > 0.1) baseboard(c.u0, c.u1);
        rect(c.u0, c.u1, c.y1, wallH);
        cursor = c.u1;
      }
      rect(cursor, uB, 0, wallH);
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
      const topKey = showRoof && isExterior ? building.exterior : TOP_KEY;
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
      mb.quad(key, [neg.x, 0, neg.y], [pos.x, 0, pos.y], [pos.x, wallH, pos.y], [neg.x, wallH, neg.y], normal, [
        [0, 0],
        [e.thickness, 0],
        [e.thickness, wallH],
        [0, wallH],
      ]);
    };
    cap(e.aNeg, e.aPos, e.aJoined, [-e.dir.x, 0, -e.dir.y]);
    cap(e.bNeg, e.bPos, e.bJoined, [e.dir.x, 0, e.dir.y]);
  }

  // floors, ceilings, roof
  for (const room of graph.rooms) {
    const contour = room.polygon.map((p) => new THREE.Vector2(p.x, p.y));
    const holes = room.holes.map((h) => h.map((p) => new THREE.Vector2(p.x, p.y)));
    const all = contour.concat(...holes);
    const tris = THREE.ShapeUtils.triangulateShape(contour, holes);
    const layer = (key: string, y: number, normal: V3) => {
      for (const t of tris) {
        const [a, b, c] = t.map((i) => all[i]);
        mb.tri(key, [a.x, y, a.y], [b.x, y, b.y], [c.x, y, c.y], normal, [
          [a.x, a.y],
          [b.x, b.y],
          [c.x, c.y],
        ]);
      }
    };
    layer(roomFloor[room.index], 0.012, [0, 1, 0]);
    if ((opts.ceilings || showRoof) && !opts.wallsLow) layer(CEILING_KEY, H, [0, -1, 0]);
    if (showRoof) layer(building.roof.finish, H + 0.22, [0, 1, 0]);
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
