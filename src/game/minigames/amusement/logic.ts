/**
 * Pure rules of the amusement-park round (no three.js, no DOM): what a ride is worth, the park
 * rating, the punch card and the final score.
 */

export type RideKind = 'ferris' | 'coaster' | 'drop' | 'pirate' | 'teacups' | 'bumper';

export const ALL_KINDS: RideKind[] = ['ferris', 'coaster', 'drop', 'pirate', 'teacups', 'bumper'];

export const ROUND_SECONDS = 180;

/** points for completing a ride: by its thrill level 1..5 */
export function ridePoints(thrill: number, repeat: boolean): number {
  const base = 100 + 100 * Math.max(1, Math.min(5, Math.round(thrill)));
  return repeat ? Math.round(base * 0.25) : base;
}

/** mini-challenge bonuses */
export const BONUS = {
  /** hands up for a whole drop (coaster, drop tower) */
  handsUp: 150,
  /** pirate ship: per drop with hands up (many per ride) */
  handsUpSwing: 60,
  /** Ferris wheel: a photo from the top */
  photo: 150,
  /** teacups: spun the cup to full speed */
  spin: 150,
  /** bumper cars: per bump (capped) */
  bump: 30,
  bumpCap: 10,
  /** coaster: upside down in the loop */
  loop: 80,
  /** every kind of ride in the park ridden */
  allKinds: 600,
  /** park rating: per star */
  star: 25,
} as const;

/** What stands in the park (counted from the props in the plot). */
export interface ParkInventory {
  /** ride kind of every ride */
  rides: RideKind[];
  /** catalog ids of food stalls / kiosks */
  food: string[];
  /** decorations: trees, flowers, benches, bins, fountains, balloons… */
  decor: number;
  /** lamps / light strings (not the rides' own lights) */
  lights: number;
}

export interface ParkRating {
  variety: number;
  food: number;
  decor: number;
  lighting: number;
  /** sum of the four (0..20) */
  stars: number;
  /** overall 0..5 (rounded average) */
  overall: number;
  bonus: number;
}

const clampStars = (n: number): number => Math.max(0, Math.min(5, Math.floor(n)));

export function ratePark(inv: ParkInventory): ParkRating {
  const kinds = new Set(inv.rides).size;
  let variety = kinds >= 6 ? 5 : kinds >= 5 ? 4 : kinds >= 4 ? 3 : kinds >= 3 ? 2 : kinds >= 1 ? 1 : 0;
  if (inv.rides.length >= 8 && variety < 5) variety++;
  const distinctFood = new Set(inv.food).size;
  const food = clampStars(distinctFood + Math.floor(inv.food.length / 3));
  const decor = clampStars(inv.decor / 14);
  const lighting = clampStars(inv.lights / 7);
  const stars = variety + food + decor + lighting;
  return { variety, food, decor, lighting, stars, overall: Math.round(stars / 4), bonus: stars * BONUS.star };
}

/** ★★★☆☆ */
export const starText = (n: number): string => '★'.repeat(Math.max(0, Math.min(5, n))) + '☆'.repeat(5 - Math.max(0, Math.min(5, n)));

/** How catalog items count for the rating (by id / tags). */
export function classifyProp(id: string, tags: string[] = [], hasLight = false, isRide = false): 'food' | 'decor' | 'light' | null {
  if (isRide) return null;
  if (/^amuse-stall-|^kiosk$|cafe-counter|bakery-display|produce-stand|ice-?cream|popcorn/.test(id)) return 'food';
  if (/light-string|lamp|lantern/.test(id) || (hasLight && /street|garden|lamp/.test(id))) return 'light';
  if (/tree|palm|bush|hedge|flower|planter|fountain|bench|trash|balloon|flag|picnic|statue|plant/.test(id) || tags.includes('קישוט')) return 'decor';
  return null;
}

/** The punch card: one slot per ride item standing in the park. */
export interface Punch {
  id: string;
  kind: RideKind;
  label: string;
  icon: string;
  thrill: number;
  done: boolean;
  rides: number;
}

/** "🎟️ 3/8 · 🎡✅ 🎢⬜ …" */
export function punchLine(card: Punch[]): string {
  const done = card.filter((p) => p.done).length;
  return `🎟️ ${done}/${card.length}  ${card.map((p) => `${p.icon}${p.done ? '✅' : '⬜'}`).join(' ')}`;
}

/** every kind present in the park has at least one stamp */
export function allKindsDone(card: Punch[]): boolean {
  const kinds = new Set(card.map((p) => p.kind));
  if (kinds.size < 3) return false;
  for (const k of kinds) if (!card.some((p) => p.kind === k && p.done)) return false;
  return true;
}

/** Hands-up tracking for one drop window: up the whole time = success. */
export class HandsUp {
  private active = false;
  private ok = false;
  /** feed every frame; returns 'win' | 'lost' at the end of a drop window, else null */
  step(drop: boolean, handsUp: boolean): 'win' | 'lost' | null {
    if (drop && !this.active) {
      this.active = true;
      this.ok = handsUp;
      return null;
    }
    if (drop && this.active) {
      if (!handsUp) this.ok = false;
      return null;
    }
    if (!drop && this.active) {
      this.active = false;
      return this.ok ? 'win' : 'lost';
    }
    return null;
  }
  get inDrop(): boolean {
    return this.active;
  }
  get clean(): boolean {
    return this.active && this.ok;
  }
}

export const MEDALS = { bronze: 1000, silver: 2200, gold: 3400 } as const;
