/**
 * Skatepark trick rules (pure, unit-tested): trick names, base points, combos and landings.
 *
 * Every trick adds its base points to the running combo; the combo multiplier is the number of tricks in it
 * (max ×10). A combo is banked when the rider rolls on the ground for a moment without a new trick, and lost
 * on a bail. Repeating the same trick inside one combo is worth less (½, then ¼).
 */
export type Family = 'board' | 'bike';
export type FlipKind = 'kick' | 'heel';
export type GrabDir = 'none' | 'up' | 'down' | 'left' | 'right';

/** points for 0, 180, 360, 540, 720, 900, 1080 */
export const SPIN_POINTS = [0, 100, 250, 450, 700, 1000, 1400];

export const spinHalves = (spin: number): number => Math.round(Math.abs(spin) / Math.PI);
export const spinLabel = (halves: number): string => (halves <= 0 ? '' : String(halves * 180));

export function flipName(family: Family, kind: FlipKind, count: number): string {
  const base = family === 'board' ? (kind === 'kick' ? 'קיקפליפ' : 'היילפליפ') : kind === 'kick' ? 'טייל-וויפ' : 'בארספין';
  return count >= 3 ? `טריפל ${base}` : count === 2 ? `דאבל ${base}` : base;
}

export function grabName(family: Family, dir: GrabDir): string {
  if (family === 'board') return { none: 'אינדי גראב', up: 'נוז גראב', down: 'טייל גראב', left: 'מיוט גראב', right: 'מלון גראב' }[dir];
  return { none: 'נו-פוטר', up: 'סופרמן', down: 'נו-הנדר', left: 'קאן-קאן', right: 'קאן-קאן' }[dir];
}

export function grindName(family: Family, mode: 'normal' | 'nose' | 'tail', ledge: boolean): string {
  if (family === 'bike') return mode === 'nose' ? 'גרינד אף' : mode === 'tail' ? 'אייספיק' : 'גרינד פגים';
  if (mode === 'nose') return 'נוזגרינד';
  if (mode === 'tail') return ledge ? 'טיילסלייד' : '5-0 גרינד';
  return ledge ? 'בורדסלייד' : '50-50 גרינד';
}

export interface AirTrick {
  /** total yaw turned in the air (radians) */
  spin: number;
  /** completed flips in order */
  flips: FlipKind[];
  /** the grab and how long it was held (s) */
  grab: { dir: GrabDir; time: number } | null;
  airTime: number;
}

/** Name and base points of what was done in one jump (null = nothing worth points). */
export function airTrick(family: Family, t: AirTrick): { name: string; points: number } | null {
  const halves = spinHalves(t.spin);
  const parts: string[] = [];
  let points = Math.round(Math.min(2.5, t.airTime) * 60);
  if (halves > 0) points += SPIN_POINTS[Math.min(halves, SPIN_POINTS.length - 1)];
  if (t.flips.length) {
    const kind = t.flips[0];
    const same = t.flips.every((f) => f === kind);
    const name = same ? flipName(family, kind, t.flips.length) : `${flipName(family, t.flips[0], 1)} ל${flipName(family, t.flips[1], 1)}`;
    parts.push(halves > 0 ? `${spinLabel(halves)} ${name}` : name);
    points += t.flips.length === 1 ? 250 : 250 + (t.flips.length - 1) * 220;
  } else if (halves > 0) parts.push(spinLabel(halves));
  if (t.grab && t.grab.time > 0.12) {
    parts.push(grabName(family, t.grab.dir));
    points += 150 + Math.round(Math.min(1.5, t.grab.time) * 200);
  }
  if (!parts.length) {
    if (t.airTime < 0.45) return null;
    return { name: family === 'board' ? 'אולי' : 'באני הופ', points: 40 + Math.round(t.airTime * 60) };
  }
  return { name: parts.join(' + '), points };
}

export type Landing = 'clean' | 'fakie' | 'bail-angle' | 'bail-flip';

/**
 * How a landing went. `align` = heading vs travel direction (1 forwards, −1 backwards); a flip / whip
 * still turning when the wheels touch down is a bail.
 */
export function judgeLanding(align: number, flipInProgress: number): Landing {
  if (flipInProgress > 0 && flipInProgress < 0.8) return 'bail-flip';
  if (Math.abs(align) < 0.72) return 'bail-angle';
  return align < 0 ? 'fakie' : 'clean';
}

export class Combo {
  tricks: string[] = [];
  points = 0;

  get multiplier(): number {
    return Math.min(10, Math.max(1, this.tricks.length));
  }

  get value(): number {
    return Math.round(this.points * this.multiplier);
  }

  get active(): boolean {
    return this.tricks.length > 0;
  }

  /** add a trick; returns the points it really added (repeats are worth less) */
  add(name: string, points: number): number {
    const repeats = this.tricks.filter((t) => t === name).length;
    const p = Math.round(points * [1, 0.5, 0.25][Math.min(2, repeats)]);
    this.tricks.push(name);
    this.points += p;
    return p;
  }

  /** extra points for the trick in progress (grinds, manuals grow while you hold them) */
  grow(points: number): void {
    this.points += points;
  }

  bank(): number {
    const v = this.value;
    this.reset();
    return v;
  }

  reset(): void {
    this.tricks = [];
    this.points = 0;
  }
}

export const MEDALS = { bronze: 1500, silver: 6000, gold: 15000 } as const;

/** a short line for the result card */
export function verdict(score: number): string {
  if (score >= MEDALS.gold) return 'אגדה של הפארק! הקהל משתגע 🤘';
  if (score >= MEDALS.silver) return 'רוכבת מקצוענית – קומבואים מטורפים!';
  if (score >= MEDALS.bronze) return 'יופי של סשן! עכשיו נסו לחבר טריקים לקומבו.';
  return 'כל אלוף התחיל ככה – קפצו מהרמפות ושלבו סיבובים!';
}
