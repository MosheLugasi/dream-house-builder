import type { Vec2 } from '../model/types';
import type { WalkWorld } from './WalkController';

/**
 * Standable surfaces of the walk world: solid things you can stand ON, jump onto and ride over
 * (skate ramps, platforms, boxes, rails, balance beams, ledges).
 *
 * A surface is an oriented rectangle (plan) whose top height is a function of the local position:
 * a piecewise-linear profile along local Z (`profileZ`) and optionally one along local X (`profileX`),
 * combined with `min` (so a pyramid or a funbox with side banks is two profiles). Without profiles the
 * top is flat at `top`. Below the top the surface is solid down to its base `y0`: the walker and the
 * vehicles cannot pass through it, they step / roll onto it where it is low enough.
 *
 * The walk controller reads `world.surfaces`. The engine does not fill them (yet): code that knows
 * about such items registers a decorator with `addWalkWorldDecorator`, which runs every time the walk
 * world is (re)built and may add surfaces (and list the item ids whose plain collision box they replace
 * in `world.surfaceOwners`).
 */
export interface WalkSurface {
  /** id of the item that owns it: its plain collision box is ignored by the walker and the vehicles */
  id?: string;
  /** centre (site) */
  x: number;
  y: number;
  /** plan rotation (local X/Z → site like any placed item) */
  rotation: number;
  /** half extents along local X and Z */
  hw: number;
  hd: number;
  /** height of the bottom (the ground it stands on) */
  y0: number;
  /** flat top above y0 when there is no profile */
  top?: number;
  /** [local z, height above y0] pairs, z ascending; outside the first / last z the end values hold */
  profileZ?: Array<[number, number]>;
  /** [local x, height above y0] pairs, x ascending; combined with profileZ by min */
  profileX?: Array<[number, number]>;
  /** must be cleared (hurdles): never stood on, blocks anyone whose feet are below its top */
  noStand?: boolean;
  /** what it is for games: 'rail', 'ledge', 'ramp', 'beam', 'platform', 'stone'… (ignored by the physics) */
  tag?: string;
  /** free data for games (e.g. the item's catalog id) */
  data?: Record<string, unknown>;
}

/** piecewise-linear interpolation of a profile at t (clamped at the ends) */
export function profileAt(p: Array<[number, number]>, t: number): number {
  if (t <= p[0][0]) return p[0][1];
  for (let i = 1; i < p.length; i++) {
    if (t <= p[i][0]) {
      const [t0, h0] = p[i - 1];
      const [t1, h1] = p[i];
      return t1 - t0 < 1e-9 ? h1 : h0 + ((t - t0) / (t1 - t0)) * (h1 - h0);
    }
  }
  return p[p.length - 1][1];
}

/** slope (dh/dt) of a profile at t; 0 outside */
export function profileSlope(p: Array<[number, number]>, t: number): number {
  for (let i = 1; i < p.length; i++) {
    if (t <= p[i][0]) {
      if (t < p[i - 1][0]) return 0;
      const [t0, h0] = p[i - 1];
      const [t1, h1] = p[i];
      return t1 - t0 < 1e-9 ? 0 : (h1 - h0) / (t1 - t0);
    }
  }
  return 0;
}

/** site → surface-local point (x along local X, y along local Z) */
export function toSurfaceLocal(s: WalkSurface, x: number, y: number, out: Vec2 = { x: 0, y: 0 }): Vec2 {
  const c = Math.cos(s.rotation);
  const sn = Math.sin(s.rotation);
  const dx = x - s.x;
  const dy = y - s.y;
  out.x = dx * c + dy * sn;
  out.y = -dx * sn + dy * c;
  return out;
}

/** local point → site */
export function fromSurfaceLocal(s: WalkSurface, lx: number, lz: number, out: Vec2 = { x: 0, y: 0 }): Vec2 {
  const c = Math.cos(s.rotation);
  const sn = Math.sin(s.rotation);
  out.x = s.x + lx * c - lz * sn;
  out.y = s.y + lx * sn + lz * c;
  return out;
}

/** height of the top above y0 at a local point (no bounds check) */
export function localTop(s: WalkSurface, lx: number, lz: number): number {
  let h = s.profileZ ? profileAt(s.profileZ, lz) : (s.top ?? 0);
  if (s.profileX) h = Math.min(h, profileAt(s.profileX, lx));
  return h;
}

const tmp: Vec2 = { x: 0, y: 0 };

/** absolute height of a surface's top at a site point, or null outside its footprint */
export function surfaceHeightAt(s: WalkSurface, x: number, y: number): number | null {
  const l = toSurfaceLocal(s, x, y, tmp);
  if (Math.abs(l.x) > s.hw || Math.abs(l.y) > s.hd) return null;
  return s.y0 + localTop(s, l.x, l.y);
}

/**
 * Slope of a surface's top along a plan direction (unit vector) at a site point: dh / horizontal meter
 * (positive = going up). 0 outside the footprint.
 */
export function surfaceSlopeAlong(s: WalkSurface, x: number, y: number, dx: number, dy: number): number {
  const l = toSurfaceLocal(s, x, y, tmp);
  if (Math.abs(l.x) > s.hw || Math.abs(l.y) > s.hd) return 0;
  const c = Math.cos(s.rotation);
  const sn = Math.sin(s.rotation);
  // direction in local axes
  const ux = dx * c + dy * sn;
  const uz = -dx * sn + dy * c;
  // gradient of min(profileZ, profileX): the active one
  const hz = s.profileZ ? profileAt(s.profileZ, l.y) : (s.top ?? 0);
  if (s.profileX) {
    const hx = profileAt(s.profileX, l.x);
    if (hx < hz) return profileSlope(s.profileX, l.x) * ux;
  }
  return s.profileZ ? profileSlope(s.profileZ, l.y) * uz : 0;
}

/** The highest standable surface whose top at (x, y) is at most `maxY`. */
export function surfaceTop(list: readonly WalkSurface[] | undefined, x: number, y: number, maxY: number): { h: number; s: WalkSurface } | null {
  if (!list) return null;
  let best: { h: number; s: WalkSurface } | null = null;
  for (const s of list) {
    if (s.noStand) continue;
    const h = surfaceHeightAt(s, x, y);
    if (h === null || h > maxY) continue;
    // a surface far below the feet is not "under" someone who stands on something higher
    if (!best || h > best.h) best = { h, s };
  }
  return best;
}

/**
 * Does a surface block someone whose feet are at `feet` from being at (x, y)? Its top must be more
 * than `step` above the feet (hurdles: above the feet at all) and its base below the head.
 */
export function surfaceBlocks(
  list: readonly WalkSurface[] | undefined,
  x: number,
  y: number,
  feet: number,
  step: number,
  body = 1.5,
  /** the surface being ridden: it is followed, never a wall */
  except?: WalkSurface | null,
): WalkSurface | null {
  if (!list) return null;
  for (const s of list) {
    if (s === except) continue;
    const h = surfaceHeightAt(s, x, y);
    if (h === null) continue;
    if (s.y0 > feet + body) continue;
    if (h > feet + (s.noStand ? 0.02 : step)) return s;
  }
  return null;
}

// ---- world decorators ---------------------------------------------------------------------------

type Decorator = (world: WalkWorld) => void;
const decorators = new Set<Decorator>();

/** Run `fn` on every walk world the engine builds (to add surfaces). Returns an unregister function. */
export function addWalkWorldDecorator(fn: Decorator): () => void {
  decorators.add(fn);
  return () => decorators.delete(fn);
}

/** Called by the walk controller whenever it receives a new world. */
export function decorateWalkWorld(world: WalkWorld): void {
  for (const fn of decorators) {
    try {
      fn(world);
    } catch (err) {
      console.error('walk world decorator failed', err);
    }
  }
}

/** Add surfaces to a world (and mark their owner ids so the plain boxes of those items are ignored). */
export function addSurfaces(world: WalkWorld, list: WalkSurface[]): void {
  if (!list.length) return;
  world.surfaces ??= [];
  world.surfaceOwners ??= new Set();
  for (const s of list) {
    world.surfaces.push(s);
    if (s.id) world.surfaceOwners.add(s.id);
  }
}
