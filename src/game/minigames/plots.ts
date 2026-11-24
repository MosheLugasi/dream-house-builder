import { getFurniture } from '../../catalog';
import { buildTemplate } from '../../model/templates';
import { newId, type Building, type FurnitureItem, type Project, type Vec2 } from '../../model/types';
import type { MiniGameId } from './meta';

/**
 * The games district: plots reserved for the mini-games' venues around the starter neighborhood,
 * joined to it by extra streets. Every venue can be installed into ANY project (the menu offers it
 * when it is missing), so a venue is a recipe, not part of the sample data.
 *
 * Site coordinates (meters, x east, y south). Road grid cells are 10 m (ROAD_CELL).
 */
export interface Plot {
  id: 'sw' | 'se' | 'south' | 'e-north' | 'e-mid' | 'e-south' | 'e-far' | 'west';
  /** north-west corner */
  x0: number;
  y0: number;
  /** size along x / y */
  w: number;
  h: number;
}

export const PLOTS: Plot[] = [
  { id: 'sw', x0: -50, y0: 50, w: 50, h: 40 },
  { id: 'se', x0: 10, y0: 50, w: 50, h: 40 },
  { id: 'south', x0: -50, y0: 100, w: 110, h: 50 },
  { id: 'e-north', x0: 70, y0: -50, w: 50, h: 50 },
  { id: 'e-mid', x0: 70, y0: 10, w: 50, h: 30 },
  { id: 'e-south', x0: 70, y0: 50, w: 50, h: 40 },
  { id: 'e-far', x0: 70, y0: 100, w: 50, h: 50 },
  { id: 'west', x0: -110, y0: -50, w: 50, h: 50 },
];

export const plotById = (id: Plot['id']): Plot => PLOTS.find((p) => p.id === id)!;

/** Road cells of the district (the starter streets are kept as they are). */
function districtRoads(): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const row = (j: number, i0: number, i1: number) => {
    for (let i = i0; i <= i1; i++) out.push([i, j]);
  };
  const col = (i: number, j0: number, j1: number) => {
    for (let j = j0; j <= j1; j++) out.push([i, j]);
  };
  row(-6, -12, 12);
  row(0, -12, 12);
  row(4, -6, 12);
  row(9, -6, 12);
  row(15, -6, 12);
  col(-12, -6, 0);
  col(-6, -6, 15);
  col(0, -6, 9);
  col(6, -6, 15);
  col(12, -6, 15);
  return out;
}

/** Add the district's streets (and their lamps) to a project if they are missing. */
export function ensureDistrictRoads(p: Project): void {
  const have = new Set(p.site.roads.map(([i, j]) => `${i},${j}`));
  const added: Array<[number, number]> = [];
  for (const c of districtRoads()) {
    const k = `${c[0]},${c[1]}`;
    if (have.has(k)) continue;
    have.add(k);
    p.site.roads.push(c);
    added.push(c);
  }
  // a street lamp on every other new cell, on the sidewalk
  let n = 0;
  for (const [i, j] of added) {
    if ((i + j) % 2 !== 0 || !getFurniture('street-lamp')) continue;
    const horizontal = have.has(`${i + 1},${j}`) || have.has(`${i - 1},${j}`);
    const vertical = have.has(`${i},${j + 1}`) || have.has(`${i},${j - 1}`);
    // junctions have no sidewalk to stand on; nor does a side that another street continues from
    if (horizontal && vertical) continue;
    if (horizontal ? have.has(`${i},${j + 1}`) : have.has(`${i + 1},${j}`)) continue;
    const x = horizontal ? i * 10 + 5 : i * 10 + 9;
    const y = horizontal ? j * 10 + 9 : j * 10 + 5;
    p.site.props.push({ id: `v-roads-${i}-${j}-${n++}`, catalogId: 'street-lamp', x, y, rotation: horizontal ? Math.PI : Math.PI / 2, elevation: 0 });
  }
  p.site.size = Math.max(p.site.size ?? 150, 330);
}

/** What a venue recipe may place (plot-local meters: origin = plot's north-west corner, x east, y south). */
export interface VenueBuilder {
  readonly plot: Plot;
  /** a catalog item on the ground; returns its id */
  prop(
    catalogId: string,
    x: number,
    y: number,
    rotation?: number,
    opts?: { colors?: Record<string, string>; size?: { w: number; d: number; h: number }; mirror?: boolean; elevation?: number },
  ): string;
  /** a ground finish rectangle ('grass', 'sand', 'pavers', 'asphalt', 'water', 'cobblestone', 'soil'…) */
  area(x0: number, y0: number, x1: number, y1: number, finish: string): void;
  /** a building from a template (house-small, shop, cafe, school, library…), its origin at (x, y) */
  building(templateId: string, x: number, y: number, rotation?: number, name?: string): Building | null;
  /** the game's start sign (players press E next to it to play) */
  sign(x: number, y: number, rotation?: number): void;
  /** plot-local → site */
  toSite(x: number, y: number): Vec2;
}

const venuePrefix = (game: MiniGameId) => `v-${game}-`;

/** Is the venue of a game already in the project? (its start sign is the marker) */
export function hasVenue(p: Project, game: MiniGameId): boolean {
  return p.site.props.some((f) => f.catalogId === `game-sign-${game}`);
}

/** Run a venue recipe into a project (call inside `update()` – it mutates the draft). */
export function installVenue(p: Project, game: MiniGameId, plotId: Plot['id'], build: (v: VenueBuilder) => void): void {
  ensureDistrictRoads(p);
  const plot = plotById(plotId);
  // whatever an earlier install of this game left behind goes first
  const prefix = venuePrefix(game);
  p.site.props = p.site.props.filter((f) => !f.id.startsWith(prefix));
  p.site.areas = p.site.areas.filter((a) => !a.id.startsWith(prefix));
  p.buildings = p.buildings.filter((b) => !b.id.startsWith(prefix));
  let n = 0;
  const toSite = (x: number, y: number): Vec2 => ({ x: plot.x0 + x, y: plot.y0 + y });
  const v: VenueBuilder = {
    plot,
    toSite,
    prop(catalogId, x, y, rotation = 0, opts = {}) {
      const id = `${prefix}${n++}`;
      if (!getFurniture(catalogId)) {
        console.warn(`[venue ${game}] unknown catalog item "${catalogId}"`);
        return id;
      }
      const s = toSite(x, y);
      const item: FurnitureItem = { id, catalogId, x: s.x, y: s.y, rotation, elevation: opts.elevation ?? 0 };
      if (opts.colors) item.colors = opts.colors;
      if (opts.size) item.size = opts.size;
      if (opts.mirror) item.mirror = true;
      p.site.props.push(item);
      return id;
    },
    area(x0, y0, x1, y1, finish) {
      const a = toSite(Math.min(x0, x1), Math.min(y0, y1));
      const b = toSite(Math.max(x0, x1), Math.max(y0, y1));
      p.site.areas.push({ id: `${prefix}a${n++}`, x0: a.x, y0: a.y, x1: b.x, y1: b.y, finish });
    },
    building(templateId, x, y, rotation = 0, name) {
      const b = buildTemplate(templateId);
      if (!b) return null;
      const s = toSite(x, y);
      b.id = `${prefix}b${n++}`;
      b.x = s.x;
      b.y = s.y;
      b.rotation = rotation;
      if (name) b.name = name;
      p.buildings.push(b);
      return b;
    },
    sign(x, y, rotation = 0) {
      v.prop(`game-sign-${game}`, x, y, rotation);
    },
  };
  build(v);
  void newId;
}
