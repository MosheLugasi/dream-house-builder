import { getFurniture, itemSize } from '../../../catalog';
import type { FurnitureDef } from '../../../catalog/types';
import { ROAD_CELL, ROAD_SIDEWALK, toLocal, toSite, type Building, type FurnitureItem, type Project, type Vec2 } from '../../../model/types';
import { MINI_GAME_META } from '../meta';
import { CLUES, fillName, type LandmarkType } from './clues';

/**
 * The treasure hunt generator: finds landmarks in the player's neighborhood (buildings, playground
 * equipment, the fountain, ponds, bus stops, the player's own creations…), works out where a chest
 * can be buried next to each one (free ground the character can walk to), and chains five of them
 * into a hunt whose stages are far enough apart. Pure: no DOM, no three.js.
 */

export interface Landmark {
  /** id of the prop / building / area */
  key: string;
  type: LandmarkType;
  /** the landmark's own name (building name, catalog name) */
  name: string;
  /** HUD label ("המזרקה", "בית הספר") */
  label: string;
  /** centre of the landmark */
  pos: Vec2;
  /** where the chest is buried */
  spot: Vec2;
}

export interface HuntStage extends Landmark {
  riddle: string;
  /** straight-line distance from the previous stage (or the start) */
  leg: number;
}

/* ------------------------------------------------------------------ classification */

const PROP_TYPES: Array<[RegExp, LandmarkType]> = [
  [/^drinking-fountain$/, 'drink'],
  [/^fountain$|garden-fountain/, 'fountain'],
  [/slide/, 'slide'],
  [/swing-set|play-swing|tire-swing/, 'swing'],
  [/seesaw/, 'seesaw'],
  [/carousel|merry-go-round/, 'carousel'],
  [/climbing|monkey-bars/, 'climb'],
  [/spring-rider/, 'spring'],
  [/^sandbox$/, 'sandbox'],
  [/^trampoline$/, 'trampoline'],
  [/basketball-hoop|^hoop-portable$/, 'hoop'],
  [/football-goal|goal-soccer/, 'goal'],
  [/ping-pong/, 'pingpong'],
  [/picnic-table/, 'picnic'],
  [/^bus-stop$/, 'bus'],
  [/^mailbox$/, 'mailbox'],
  [/fire-hydrant/, 'hydrant'],
  [/^flagpole$/, 'flag'],
  [/^kiosk$/, 'kiosk'],
  [/^bike-rack$/, 'bikes'],
  [/recycling/, 'recycle'],
  [/^palm-tree$/, 'palm'],
  [/^olive-tree$/, 'olive'],
  [/^tree-fruit$/, 'lemon'],
  [/^farm-scarecrow$/, 'scarecrow'],
  [/^farm-barn$/, 'barn'],
  [/^farm-well$/, 'well'],
  [/^farm-coop$/, 'coop'],
  [/^farm-market-stand$/, 'market'],
];

/** street furniture and clutter that never makes a good stage */
const BORING =
  /street-lamp|lamp|trash|bench|fence|wall|stop-sign|crosswalk|parking-sign|street-name|traffic-light|bollard|planter|hedge|bush|flower-bed|^tree$|tree-cypress|farm-bed|farm-chicken|farm-hay|farm-crates|rug|mat|^ball-|treasure-|plant-|rubber-mat/;

function propType(item: FurnitureItem, def: FurnitureDef): LandmarkType | null {
  if (item.catalogId.startsWith('game-sign-')) return item.catalogId === 'game-sign-treasure' ? null : 'gamesign';
  for (const [re, t] of PROP_TYPES) if (re.test(item.catalogId)) return t;
  if (def.vehicle || def.pet || def.walkable || def.mount === 'wall' || def.mount === 'ceiling') return null;
  if (def.actions?.some((a) => a.kind === 'ball' || a.kind === 'pet')) return null;
  if (BORING.test(item.catalogId)) return null;
  // anything else big enough to be noticed: the player's own creations
  const s = itemSize(def, item);
  if (Math.max(s.w, s.d) < 0.8 && s.h < 1.2) return null;
  return 'creation';
}

function buildingType(b: Building): LandmarkType {
  if (b.name.includes('סבתא')) return 'grandma';
  if (b.name.trim() === 'הבית שלי') return 'myHome';
  switch (b.kind) {
    case 'school':
      return 'school';
    case 'library':
      return 'library';
    case 'shop':
      return 'shop';
    case 'cafe':
      return 'cafe';
    case 'house':
      return 'home';
    default:
      return 'building';
  }
}

/* ------------------------------------------------------------------ obstacles */

interface Rect {
  /** centre, half extents, plan rotation */
  x: number;
  y: number;
  hw: number;
  hd: number;
  rot: number;
}

const TRUNK_ONLY = /tree|palm|lamp|flagpole|sign|traffic-light|patio-table|basketball|swing-set|monkey-bars|goal/;

/** footprint the character collides with (mirrors store/actions#collisionFootprint) */
function footprint(item: FurnitureItem, def: FurnitureDef): { w: number; d: number } | null {
  if (def.walkable || def.mount === 'ceiling' || def.mount === 'wall' || def.vehicle) return null;
  if (def.pet || item.catalogId === 'football-goal' || item.catalogId === 'goal-soccer' || def.actions?.some((a) => a.kind === 'ball' || a.kind === 'pet')) return null;
  if (TRUNK_ONLY.test(item.catalogId)) return { w: 0.4, d: 0.4 };
  const s = itemSize(def, item);
  return { w: s.w, d: s.d };
}

function inRect(r: Rect, p: Vec2, pad: number): boolean {
  const c = Math.cos(r.rot);
  const s = Math.sin(r.rot);
  const dx = p.x - r.x;
  const dy = p.y - r.y;
  const lx = dx * c + dy * s;
  const ly = -dx * s + dy * c;
  return Math.abs(lx) <= r.hw + pad && Math.abs(ly) <= r.hd + pad;
}

/** local bounding box of a building's ground floor walls */
function buildingBox(b: Building): { x0: number; y0: number; x1: number; y1: number } | null {
  const walls = b.levels[0]?.walls ?? [];
  if (!walls.length) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const w of walls) {
    for (const p of [w.a, w.b]) {
      x0 = Math.min(x0, p.x - w.thickness / 2);
      y0 = Math.min(y0, p.y - w.thickness / 2);
      x1 = Math.max(x1, p.x + w.thickness / 2);
      y1 = Math.max(y1, p.y + w.thickness / 2);
    }
  }
  return { x0, y0, x1, y1 };
}

/** Static obstacles of a neighborhood, for "can a chest go here?" and the reachability grid. */
export class SiteMap {
  readonly rects: Rect[] = [];
  readonly water: Array<{ x0: number; y0: number; x1: number; y1: number }> = [];
  readonly half: number;
  private roads: Set<string>;
  private grid: Int32Array | null = null;
  private n = 0;

  constructor(readonly project: Project) {
    this.half = (project.site.size ?? 150) - 1.5;
    this.roads = new Set(project.site.roads.map(([i, j]) => `${i},${j}`));
    for (const b of project.buildings) {
      const box = buildingBox(b);
      if (!box) continue;
      const c = toSite(b, { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 });
      this.rects.push({ x: c.x, y: c.y, hw: (box.x1 - box.x0) / 2, hd: (box.y1 - box.y0) / 2, rot: b.rotation });
    }
    for (const item of project.site.props) {
      const def = getFurniture(item.catalogId);
      if (!def) continue;
      const fp = footprint(item, def);
      if (fp) this.rects.push({ x: item.x, y: item.y, hw: fp.w / 2, hd: fp.d / 2, rot: item.rotation });
    }
    for (const a of project.site.areas) if (a.finish === 'water') this.water.push({ x0: Math.min(a.x0, a.x1), y0: Math.min(a.y0, a.y1), x1: Math.max(a.x0, a.x1), y1: Math.max(a.y0, a.y1) });
  }

  /** on the driving lanes of a street (the sidewalks are fine) */
  onAsphalt(p: Vec2): boolean {
    const i = Math.floor(p.x / ROAD_CELL);
    const j = Math.floor(p.y / ROAD_CELL);
    if (!this.roads.has(`${i},${j}`)) return false;
    const lx = p.x - i * ROAD_CELL;
    const ly = p.y - j * ROAD_CELL;
    const S = ROAD_SIDEWALK;
    const C = ROAD_CELL;
    const inX = lx > S && lx < C - S;
    const inY = ly > S && ly < C - S;
    if (inX && inY) return true;
    if (inX) return this.roads.has(`${i},${ly < S ? j - 1 : j + 1}`);
    if (inY) return this.roads.has(`${lx < S ? i - 1 : i + 1},${j}`);
    return false;
  }

  blocked(p: Vec2, pad: number): boolean {
    if (Math.abs(p.x) > this.half || Math.abs(p.y) > this.half) return true;
    for (const w of this.water) if (p.x > w.x0 - pad && p.x < w.x1 + pad && p.y > w.y0 - pad && p.y < w.y1 + pad) return true;
    for (const r of this.rects) if (inRect(r, p, pad)) return true;
    return false;
  }

  /** a good place for a chest: free ground with some elbow room, not on the driving lanes */
  free(p: Vec2): boolean {
    return !this.blocked(p, 0.55) && !this.onAsphalt(p);
  }

  /** Flood-fill the walkable ground (1 m cells, the character's radius as padding) from `start`. */
  flood(start: Vec2): void {
    const n = Math.ceil(this.half * 2) + 1;
    this.n = n;
    const blocked = new Uint8Array(n * n);
    const cell = (x: number, y: number) => [Math.floor(x + this.half), Math.floor(y + this.half)] as const;
    const mark = (x0: number, y0: number, x1: number, y1: number, test: (p: Vec2) => boolean) => {
      const [i0, j0] = cell(x0, y0);
      const [i1, j1] = cell(x1, y1);
      for (let j = Math.max(0, j0); j <= Math.min(n - 1, j1); j++) {
        for (let i = Math.max(0, i0); i <= Math.min(n - 1, i1); i++) {
          const p = { x: i - this.half + 0.5, y: j - this.half + 0.5 };
          if (test(p)) blocked[j * n + i] = 1;
        }
      }
    };
    const PAD = 0.25;
    for (const r of this.rects) {
      const e = Math.hypot(r.hw, r.hd) + PAD;
      mark(r.x - e, r.y - e, r.x + e, r.y + e, (p) => inRect(r, p, PAD));
    }
    for (const w of this.water) mark(w.x0, w.y0, w.x1, w.y1, (p) => p.x > w.x0 && p.x < w.x1 && p.y > w.y0 && p.y < w.y1);
    const grid = new Int32Array(n * n).fill(-1);
    const [si, sj] = cell(start.x, start.y);
    const queue = new Int32Array(n * n);
    let head = 0;
    let tail = 0;
    const push = (i: number, j: number, d: number) => {
      if (i < 0 || j < 0 || i >= n || j >= n) return;
      const k = j * n + i;
      if (blocked[k] || grid[k] >= 0) return;
      grid[k] = d;
      queue[tail++] = k;
    };
    // the start may sit right next to its sign: begin from the nearest open cells around it
    for (let r = 0; r <= 2 && tail === 0; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) push(si + di, sj + dj, 0);
    while (head < tail) {
      const k = queue[head++];
      const i = k % n;
      const j = (k - i) / n;
      const d = grid[k] + 1;
      push(i + 1, j, d);
      push(i - 1, j, d);
      push(i, j + 1, d);
      push(i, j - 1, d);
    }
    this.grid = grid;
  }

  /** walking distance (m, along the 1 m grid) from the flood start, or -1 when unreachable */
  walkDistance(p: Vec2): number {
    if (!this.grid) return 0;
    const i = Math.floor(p.x + this.half);
    const j = Math.floor(p.y + this.half);
    let best = -1;
    // the chest stands in a free spot, its cell may be clipped by a neighbour's padding: look around
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const ii = i + di;
        const jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= this.n || jj >= this.n) continue;
        const d = this.grid[jj * this.n + ii];
        if (d >= 0 && (best < 0 || d < best)) best = d;
      }
    }
    return best;
  }
}

/* ------------------------------------------------------------------ landmarks */

const DIRS = Array.from({ length: 12 }, (_, i) => (i / 12) * Math.PI * 2);

/** a free spot next to a prop: in front of it first, then around */
function spotNearProp(map: SiteMap, item: FurnitureItem, def: FurnitureDef): Vec2 | null {
  const s = itemSize(def, item);
  const c = Math.cos(item.rotation);
  const sn = Math.sin(item.rotation);
  for (const extra of [1.0, 1.8, 2.8]) {
    for (const a of DIRS) {
      // local direction (front = +Z) → plan
      const lx = Math.sin(a);
      const lz = Math.cos(a);
      const reach = Math.min(Math.abs(lx) > 1e-6 ? s.w / 2 / Math.abs(lx) : Infinity, Math.abs(lz) > 1e-6 ? s.d / 2 / Math.abs(lz) : Infinity);
      const r = (TRUNK_ONLY.test(item.catalogId) ? Math.min(reach, 0.6) : reach) + extra;
      const px = lx * r;
      const pz = lz * r;
      const p = { x: item.x + px * c - pz * sn, y: item.y + px * sn + pz * c };
      if (map.free(p)) return p;
    }
  }
  return null;
}

/** in front of an outside door of a building */
function spotNearBuilding(map: SiteMap, b: Building): { spot: Vec2; center: Vec2 } | null {
  const box = buildingBox(b);
  if (!box) return null;
  const lvl = b.levels[0];
  const center = toSite(b, { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 });
  const cands: Array<{ p: Vec2; n: Vec2; door: boolean }> = [];
  for (const o of lvl.openings) {
    if (o.type !== 'door') continue;
    const w = lvl.walls.find((x) => x.id === o.wallId);
    if (!w) continue;
    const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
    if (L < 1e-6) continue;
    const p = { x: w.a.x + ((w.b.x - w.a.x) * o.offset) / L, y: w.a.y + ((w.b.y - w.a.y) * o.offset) / L };
    const t = w.thickness + 0.05;
    let n: Vec2 | null = null;
    if (Math.abs(p.y - box.y1) < t) n = { x: 0, y: 1 };
    else if (Math.abs(p.y - box.y0) < t) n = { x: 0, y: -1 };
    else if (Math.abs(p.x - box.x1) < t) n = { x: 1, y: 0 };
    else if (Math.abs(p.x - box.x0) < t) n = { x: -1, y: 0 };
    if (n) cands.push({ p, n, door: true });
  }
  // no outside door: the middle of the front, then of the other sides
  cands.push(
    { p: { x: (box.x0 + box.x1) / 2, y: box.y1 }, n: { x: 0, y: 1 }, door: false },
    { p: { x: box.x1, y: (box.y0 + box.y1) / 2 }, n: { x: 1, y: 0 }, door: false },
    { p: { x: box.x0, y: (box.y0 + box.y1) / 2 }, n: { x: -1, y: 0 }, door: false },
    { p: { x: (box.x0 + box.x1) / 2, y: box.y0 }, n: { x: 0, y: -1 }, door: false },
  );
  for (const out of [2.4, 3.4, 4.6]) {
    for (const c of cands) {
      for (const side of [0, 1.2, -1.2]) {
        const lp = { x: c.p.x + c.n.x * out - c.n.y * side, y: c.p.y + c.n.y * out + c.n.x * side };
        const p = toSite(b, lp);
        if (map.free(p)) return { spot: p, center };
      }
    }
  }
  return null;
}

/** on the shore of a pond */
function spotNearWater(map: SiteMap, a: { x0: number; y0: number; x1: number; y1: number }): Vec2 | null {
  const cx = (a.x0 + a.x1) / 2;
  const cy = (a.y0 + a.y1) / 2;
  for (const out of [1.2, 2.2, 3.4]) {
    const cands = [
      { x: cx, y: a.y1 + out },
      { x: cx, y: a.y0 - out },
      { x: a.x1 + out, y: cy },
      { x: a.x0 - out, y: cy },
      { x: (a.x0 + cx) / 2, y: a.y1 + out },
      { x: (a.x1 + cx) / 2, y: a.y1 + out },
      { x: (a.x0 + cx) / 2, y: a.y0 - out },
      { x: (a.x1 + cx) / 2, y: a.y0 - out },
    ];
    for (const p of cands) if (map.free(p)) return p;
  }
  return null;
}

/** Every landmark of a neighborhood that can hold a chest. */
export function findLandmarks(project: Project, map = new SiteMap(project)): Landmark[] {
  const out: Landmark[] = [];
  const names = new Map<string, number>();
  for (const b of project.buildings) names.set(b.name.trim(), (names.get(b.name.trim()) ?? 0) + 1);
  for (const b of project.buildings) {
    const type = buildingType(b);
    const name = b.name.trim() || 'בניין';
    // a plain house is only a good clue when its name is unique
    if ((type === 'home' || type === 'building') && (names.get(name) ?? 0) > 1) continue;
    const s = spotNearBuilding(map, b);
    if (!s) continue;
    out.push({ key: b.id, type, name, label: fillName(CLUES[type].label, name), pos: s.center, spot: s.spot });
  }
  const counts = new Map<string, number>();
  for (const item of project.site.props) counts.set(item.catalogId, (counts.get(item.catalogId) ?? 0) + 1);
  for (const item of project.site.props) {
    const def = getFurniture(item.catalogId);
    if (!def) continue;
    const type = propType(item, def);
    if (!type) continue;
    // a creation must be distinctive (not one of a dozen identical things)
    if (type === 'creation' && (counts.get(item.catalogId) ?? 0) > 2) continue;
    let name = def.name;
    if (type === 'gamesign') {
      const m = MINI_GAME_META.find((g) => `game-sign-${g.id}` === item.catalogId);
      if (!m) continue;
      name = m.name;
    }
    const spot = spotNearProp(map, item, def);
    if (!spot) continue;
    out.push({ key: item.id, type, name, label: fillName(CLUES[type].label, name), pos: { x: item.x, y: item.y }, spot });
  }
  project.site.areas.forEach((a) => {
    if (a.finish !== 'water') return;
    const r = { x0: Math.min(a.x0, a.x1), y0: Math.min(a.y0, a.y1), x1: Math.max(a.x0, a.x1), y1: Math.max(a.y0, a.y1) };
    if ((r.x1 - r.x0) * (r.y1 - r.y0) < 20) return;
    const spot = spotNearWater(map, r);
    if (!spot) return;
    out.push({ key: a.id, type: 'pond', name: 'אגם', label: CLUES.pond.label, pos: { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 }, spot });
  });
  // a landmark type with several copies close together is ambiguous: keep only the lone ones
  return out.filter((l) => !out.some((o) => o !== l && o.type === l.type && !['home', 'building', 'creation', 'gamesign'].includes(l.type) && dist(o.pos, l.pos) < 22));
}

const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);

/* ------------------------------------------------------------------ the hunt */

export const HUNT_STAGES = 5;

export interface HuntOptions {
  stages?: number;
  random?: () => number;
  /** walking distance on the grid must stay below this (keeps hunts compact) */
  maxLeg?: number;
}

/**
 * Chain landmarks into a hunt that starts at `start`: every stage is reachable on foot, a
 * different kind of place, at least ~20 m from every other stage, and the legs are neither
 * trivially short nor exhaustingly long.
 */
export function generateHunt(project: Project, start: Vec2, opts: HuntOptions = {}): HuntStage[] {
  const want = opts.stages ?? HUNT_STAGES;
  const random = opts.random ?? Math.random;
  const map = new SiteMap(project);
  map.flood(start);
  const all = findLandmarks(project, map).filter((l) => map.walkDistance(l.spot) >= 0 && dist(l.spot, start) > 12);
  const tiers: Array<{ min: number; max: number; apart: number }> = [
    { min: 22, max: opts.maxLeg ?? 80, apart: 20 },
    { min: 18, max: 120, apart: 16 },
    { min: 10, max: 400, apart: 10 },
  ];
  let best: Landmark[] = [];
  for (const tier of tiers) {
    for (let attempt = 0; attempt < 60; attempt++) {
      const chain: Landmark[] = [];
      const families = new Map<string, number>();
      const types = new Set<LandmarkType>();
      let buildings = 0;
      let at = start;
      while (chain.length < want) {
        const options = all.filter((l) => {
          if (types.has(l.type)) return false;
          const fam = CLUES[l.type].family;
          if (fam && (families.get(fam) ?? 0) >= 1) return false;
          if (isBuilding(l.type) && buildings >= 2) return false;
          const d = dist(at, l.spot);
          if (d < tier.min || d > tier.max) return false;
          return chain.every((c) => dist(c.spot, l.spot) >= tier.apart) && dist(start, l.spot) >= tier.apart * 0.6;
        });
        if (!options.length) break;
        // weighted by how much fun the place is, a little favouring nearer ones
        let total = 0;
        const w = options.map((l) => {
          const v = CLUES[l.type].weight / (1 + dist(at, l.spot) / 120);
          total += v;
          return v;
        });
        let r = random() * total;
        let pick = options[options.length - 1];
        for (let i = 0; i < options.length; i++) {
          r -= w[i];
          if (r <= 0) {
            pick = options[i];
            break;
          }
        }
        chain.push(pick);
        types.add(pick.type);
        const fam = CLUES[pick.type].family;
        if (fam) families.set(fam, (families.get(fam) ?? 0) + 1);
        if (isBuilding(pick.type)) buildings++;
        at = pick.spot;
      }
      if (chain.length > best.length) best = chain;
      if (best.length >= want) break;
    }
    if (best.length >= want) break;
  }
  let prev = start;
  return best.map((l) => {
    const set = CLUES[l.type];
    const riddle = fillName(set.riddles[Math.floor(random() * set.riddles.length)], l.name);
    const leg = dist(prev, l.spot);
    prev = l.spot;
    return { ...l, riddle, leg };
  });
}

const isBuilding = (t: LandmarkType): boolean => ['school', 'library', 'shop', 'cafe', 'myHome', 'grandma', 'home', 'building'].includes(t);

/* ------------------------------------------------------------------ scoring */

/** par time for a leg: running speed plus some thinking time */
export const parTime = (leg: number): number => leg / 3.4 + 14;

export const HINT_COST = 100;
export const STAGE_BASE = 200;
export const FINAL_BONUS = 300;

/** points for one chest: base + a speed bonus (full at par, gone at 3× par) − hints */
export function stageScore(seconds: number, leg: number, hints: number): { total: number; speed: number } {
  const par = parTime(leg);
  const speed = Math.round(300 * Math.max(0, Math.min(1, 1 - (seconds - par) / (2 * par))));
  return { total: Math.max(50, STAGE_BASE + speed - HINT_COST * hints), speed };
}

/** 0 (freezing) … 1 (on top of it) for the hot/cold meter */
export function warmth(distance: number, leg: number): number {
  const far = Math.max(25, leg * 1.15);
  return Math.max(0, Math.min(1, 1 - distance / far));
}

export function warmthLabel(v: number): { text: string; color: string } {
  if (v > 0.9) return { text: '🔥 רותח! ממש כאן!', color: '#ff3b1f' };
  if (v > 0.72) return { text: '🌶️ חם מאוד', color: '#ff6a2a' };
  if (v > 0.5) return { text: '☀️ חם', color: '#f5a524' };
  if (v > 0.3) return { text: '🌤️ פושר', color: '#d8c84a' };
  if (v > 0.12) return { text: '❄️ קר', color: '#5fa8e8' };
  return { text: '🥶 קפוא', color: '#3d7fd8' };
}

/** the collectibles hidden in the chests (the last one is always the crown) */
export const TREASURES = [
  { icon: '💎', name: 'יהלום כחול', color: '#3fa0e0' },
  { icon: '🪙', name: 'מטבע זהב עתיק', color: '#e8b63c' },
  { icon: '💍', name: 'טבעת קסומה', color: '#e0405a' },
  { icon: '🔮', name: 'כדור בדולח', color: '#9a6ae0' },
  { icon: '🐚', name: 'צדף עם פנינה', color: '#f0d9e0' },
  { icon: '⭐', name: 'כוכב זהב', color: '#ffd23a' },
  { icon: '📿', name: 'שרשרת אבני חן', color: '#40c070' },
];
export const CROWN = { icon: '👑', name: 'כתר האוצר הגדול', color: '#ffcf3a' };
