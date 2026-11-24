/**
 * Team B (skatepark / obstacle course): the standable shape of every obstacle as a function of its size.
 * Pure math – used by the catalog builds (so the visible surface IS the playable surface) and by the
 * walk-world decorator that turns placed obstacles into walk surfaces (src/game/minigames/skatepark/surfaces.ts).
 *
 * Item-local frame: x along the width, z along the depth (front = +z), heights above the item's floor.
 */
import type { ItemSize } from '../types';

export type Profile = Array<[number, number]>;

/** A standable box / ramp in the item's local frame (profiles are relative to the surface centre). */
export interface LocalSurface {
  cx: number;
  cz: number;
  hw: number;
  hd: number;
  top?: number;
  profileZ?: Profile;
  profileX?: Profile;
  noStand?: boolean;
  tag: string;
}

/** A circular transition (quarter pipe) rising from 0 at t = 0 to h at t = s, tangent to the ground at 0. */
export function transition(s: number, h: number, n = 12): Profile {
  const R = (s * s + h * h) / (2 * h);
  const out: Profile = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * s;
    out.push([t, R - Math.sqrt(Math.max(0, R * R - t * t))]);
  }
  return out;
}

/** length of a quarter-pipe transition of height h (ends at ~74°), limited to `max` */
export const transitionLength = (h: number, max: number): number => Math.min(h * 1.327, max);

/** quarter pipe: front (+z) at ground level, rising towards the back, flat deck at the back */
export function quarterPipeProfile(size: ItemSize): Profile {
  const hd = size.d / 2;
  const s = transitionLength(size.h, size.d - 0.3);
  const tr = transition(s, size.h);
  const p: Profile = [[-hd, size.h]];
  // deck from -hd to hd - s, then the transition down to the front edge
  for (let i = tr.length - 1; i >= 0; i--) p.push([hd - tr[i][0], tr[i][1]]);
  return p;
}

/** kicker: a curved launch ramp, ground at the front (+z), lip at the back edge */
export function kickerProfile(size: ItemSize): Profile {
  const hd = size.d / 2;
  const tr = transition(size.d, size.h, 10);
  const p: Profile = [];
  for (let i = tr.length - 1; i >= 0; i--) p.push([hd - tr[i][0], tr[i][1]]);
  return p;
}

/** trapezoid: up a bank, flat top, down a bank (along an axis of half length `half`) */
export function trapezoid(half: number, h: number, bank: number): Profile {
  const b = Math.min(bank, half * 0.9);
  return [
    [-half, 0],
    [-half + b, h],
    [half - b, h],
    [half, 0],
  ];
}

/** mini ramp (half pipe): two quarter pipes facing each other with a flat bottom between */
export function miniRampProfile(size: ItemSize): Profile {
  const hd = size.d / 2;
  const deck = 0.55;
  const s = transitionLength(size.h, Math.max(0.6, (size.d - 2 * deck - 0.8) / 2));
  const tr = transition(s, size.h);
  const p: Profile = [[-hd, size.h]];
  for (let i = tr.length - 1; i >= 0; i--) p.push([-hd + deck + s - tr[i][0], tr[i][1]]);
  for (let i = 0; i < tr.length; i++) p.push([hd - deck - s + tr[i][0], tr[i][1]]);
  p.push([hd, size.h]);
  return p;
}

/** stair set: ramp up at the back, a deck, then three steps down to the front */
export const STAIR_SET = { ramp: 1.6, deck: 1.15, steps: 3, tread: 0.36, rail: 0.42 };
/** height of the stair set's deck (the size's height includes the hubba rail above it) */
export const stairDeck = (size: ItemSize): number => size.h - STAIR_SET.rail;
export function stairSetProfile(size: ItemSize): Profile {
  const hd = size.d / 2;
  const h = stairDeck(size);
  const { ramp, deck, steps, tread } = STAIR_SET;
  const p: Profile = [
    [-hd, 0],
    [-hd + ramp, h],
    [-hd + ramp + deck, h],
  ];
  let z = -hd + ramp + deck;
  for (let i = 1; i <= steps; i++) {
    const y = h * (1 - i / steps);
    p.push([z + 0.005, y]);
    z = Math.min(hd, z + tread);
    p.push([z, y]);
  }
  if (z < hd) p.push([hd, 0]);
  return p;
}

/** the hubba rail of the stair set: x position and its top line (z0, y0) → (z1, y1) */
export function stairSetRail(size: ItemSize): { x: number; z0: number; y0: number; z1: number; y1: number } {
  const hd = size.d / 2;
  const { ramp, deck } = STAIR_SET;
  const z0 = -hd + ramp + deck - 0.25;
  return { x: size.w / 2 - 0.16, z0, y0: size.h, z1: hd - 0.05, y1: STAIR_SET.rail };
}

// ---- parkour shapes -------------------------------------------------------------------------

/** climbing tower: climbing wall on the front, a platform on top, steps down at the back */
export const TOWER = { platform: 1.8, depth: 1.3, steps: 4 };
export function towerSurfaces(size: ItemSize): LocalSurface[] {
  const hd = size.d / 2;
  const hw = size.w / 2;
  const top = Math.min(TOWER.platform, size.h - 0.5);
  const depth = TOWER.depth;
  const out: LocalSurface[] = [{ cx: 0, cz: hd - depth / 2, hw, hd: depth / 2, top, tag: 'climb' }];
  const n = TOWER.steps;
  const tread = (size.d - depth) / n;
  for (let i = 0; i < n; i++) {
    const z1 = hd - depth - i * tread;
    out.push({ cx: 0, cz: z1 - tread / 2, hw, hd: tread / 2, top: (top * (n - i)) / (n + 1), tag: 'platform' });
  }
  return out;
}

/** zip-line: steps up to a tower at the back (−z); the cable runs to a post at the front */
export const ZIP = { steps: 5, rise: 0.3, tread: 0.42, platform: 1.3, cableTop: 3.5, cableEnd: 2.05 };
export function zipSurfaces(size: ItemSize): LocalSurface[] {
  const hd = size.d / 2;
  const out: LocalSurface[] = [];
  const { steps, rise, tread, platform } = ZIP;
  for (let i = 0; i < steps; i++) {
    out.push({ cx: 0, cz: -hd + tread * (i + 0.5), hw: 0.5, hd: tread / 2, top: rise * (i + 1), tag: 'platform' });
  }
  out.push({ cx: 0, cz: -hd + tread * steps + platform / 2, hw: size.w / 2, hd: platform / 2, top: rise * steps, tag: 'zip' });
  // the end post
  out.push({ cx: 0, cz: hd - 0.12, hw: 0.1, hd: 0.1, top: ZIP.cableEnd + 0.3, tag: 'post' });
  return out;
}

/** where the zip-line cable starts and ends (local), the rider's feet hang `hang` below it */
export function zipCable(size: ItemSize): { z0: number; y0: number; z1: number; y1: number; platformTop: number; platformZ: number } {
  const hd = size.d / 2;
  const { steps, rise, tread, platform, cableTop, cableEnd } = ZIP;
  return { z0: -hd + tread * steps + platform * 0.7, y0: cableTop, z1: hd - 0.4, y1: cableEnd, platformTop: rise * steps, platformZ: -hd + tread * steps + platform / 2 };
}

/** monkey bars: a platform at each end, bars between them */
export const MONKEY = { platform: 0.75, top: 0.6, barY: 2.2, spacing: 0.42 };
export function monkeySurfaces(size: ItemSize): LocalSurface[] {
  const hd = size.d / 2;
  const hw = size.w / 2;
  const { platform, top } = MONKEY;
  return [
    { cx: 0, cz: hd - platform / 2, hw, hd: platform / 2, top, tag: 'monkey-start' },
    { cx: 0, cz: -hd + platform / 2, hw, hd: platform / 2, top, tag: 'monkey-end' },
  ];
}

/** rung z positions (from the start platform at +z to the end at −z) */
export function monkeyRungs(size: ItemSize): number[] {
  const hd = size.d / 2;
  const z0 = hd - MONKEY.platform;
  const z1 = -hd + MONKEY.platform;
  const n = Math.max(2, Math.round((z0 - z1) / MONKEY.spacing));
  const out: number[] = [];
  for (let i = 0; i <= n; i++) out.push(z0 - ((z0 - z1) * i) / n);
  return out;
}

/** tyre run: tyres lying flat in a grid */
export function tyreCenters(size: ItemSize): Array<[number, number]> {
  const cols = Math.max(1, Math.round(size.w / 0.68));
  const rows = Math.max(1, Math.round(size.d / 0.62));
  const out: Array<[number, number]> = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = (c - (cols - 1) / 2) * (size.w / cols);
      const z = (r - (rows - 1) / 2) * (size.d / rows);
      out.push([x + (r % 2 ? 0.06 : -0.06), z]);
    }
  }
  return out;
}
export const TYRE_R = 0.29;

/** start / finish arch: two posts (surfaces) so that you can run through the middle */
export function archPosts(size: ItemSize): LocalSurface[] {
  const hw = size.w / 2;
  return [-1, 1].map((s) => ({ cx: s * (hw - 0.17), cz: 0, hw: 0.16, hd: size.d / 2, top: size.h, tag: 'post' }));
}

/** Standable surfaces of every team-B obstacle, by catalog id (local frame, at the placed size). */
export const OBSTACLE_SHAPES: Record<string, (size: ItemSize) => LocalSurface[]> = {
  'skate-quarter-pipe': (s) => [{ cx: 0, cz: 0, hw: s.w / 2, hd: s.d / 2, profileZ: quarterPipeProfile(s), tag: 'ramp' }],
  'skate-kicker': (s) => [{ cx: 0, cz: 0, hw: s.w / 2, hd: s.d / 2, profileZ: kickerProfile(s), tag: 'kicker' }],
  'skate-funbox': (s) => [{ cx: 0, cz: 0, hw: s.w / 2, hd: s.d / 2, profileZ: trapezoid(s.d / 2, s.h, 1.6), tag: 'funbox' }],
  'skate-pyramid': (s) => [{ cx: 0, cz: 0, hw: s.w / 2, hd: s.d / 2, profileZ: trapezoid(s.d / 2, s.h, 1.5), profileX: trapezoid(s.w / 2, s.h, 1.5), tag: 'pyramid' }],
  'skate-mini-ramp': (s) => [{ cx: 0, cz: 0, hw: s.w / 2, hd: s.d / 2, profileZ: miniRampProfile(s), tag: 'halfpipe' }],
  'skate-grind-rail': (s) => [{ cx: 0, cz: 0, hw: Math.max(0.18, s.w / 2), hd: s.d / 2, top: s.h, tag: 'rail' }],
  'skate-ledge': (s) => [{ cx: 0, cz: 0, hw: s.w / 2, hd: s.d / 2, top: s.h, tag: 'ledge' }],
  'skate-stair-set': (s) => {
    const r = stairSetRail(s);
    const len = r.z1 - r.z0;
    return [
      { cx: 0, cz: 0, hw: s.w / 2, hd: s.d / 2, profileZ: stairSetProfile(s), tag: 'stairs' },
      {
        cx: r.x,
        cz: (r.z0 + r.z1) / 2,
        hw: 0.15,
        hd: len / 2,
        profileZ: [
          [-len / 2, r.y0],
          [len / 2, r.y1],
        ],
        tag: 'rail',
      },
    ];
  },
  'pk-platform': (s) => [{ cx: 0, cz: 0, hw: s.w / 2, hd: s.d / 2, top: s.h, tag: 'platform' }],
  'pk-steps': (s) => [0, 1, 2].map((i) => ({ cx: 0, cz: s.d / 2 - (s.d / 3) * (i + 0.5), hw: s.w / 2, hd: s.d / 6, top: (s.h * (i + 1)) / 3, tag: 'platform' })),
  'pk-balance-beam': (s) => [{ cx: 0, cz: 0, hw: 0.17, hd: s.d / 2, top: s.h, tag: 'beam' }],
  'pk-tyre-run': (s) => tyreCenters(s).map(([x, z]) => ({ cx: x, cz: z, hw: TYRE_R * 0.9, hd: TYRE_R * 0.9, top: 0.16, tag: 'tyre' })),
  'pk-climb-tower': towerSurfaces,
  'pk-zipline': zipSurfaces,
  'pk-monkey-bars': monkeySurfaces,
  'pk-stepping-stone': (s) => [{ cx: 0, cz: 0, hw: s.w / 2 - 0.03, hd: s.d / 2 - 0.03, top: s.h, tag: 'stone' }],
  'pk-hurdle': (s) => [{ cx: 0, cz: 0, hw: s.w / 2, hd: 0.06, top: s.h, noStand: true, tag: 'hurdle' }],
  'pk-start-arch': archPosts,
  'pk-finish-arch': archPosts,
};
