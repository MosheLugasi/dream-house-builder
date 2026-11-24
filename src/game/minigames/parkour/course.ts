/**
 * Obstacle-course rules (pure, unit-tested): which gates make the course, in what order, passing them,
 * split times and the ghost of the best run.
 *
 * The course is whatever stands in the plot: a start arch (`pk-start-arch`), numbered checkpoint flags
 * (`pk-checkpoint-1` … `pk-checkpoint-8` – the number is printed on the flag) and a finish arch
 * (`pk-finish-arch`). Flags are taken in number order (missing numbers are skipped; two flags with the same
 * number are both visited, nearest first). Without a finish arch the last flag is the finish; without a start
 * arch the run starts at the start sign.
 */
import type { Vec2 } from '../../../model/types';

export interface GateProp {
  id: string;
  catalogId: string;
  x: number;
  y: number;
  rotation: number;
  /** width of an arch (its posts are at ±w/2) */
  w?: number;
}

export interface Gate {
  kind: 'start' | 'checkpoint' | 'finish';
  /** checkpoint number (0 for the arches) */
  n: number;
  id: string;
  x: number;
  y: number;
  rotation: number;
  w: number;
}

export const checkpointNumber = (catalogId: string): number | null => {
  const m = /^pk-checkpoint-(\d+)$/.exec(catalogId);
  return m ? Number(m[1]) : null;
};

/** Order the gates of a course. `fallbackStart` = where to start without a start arch. */
export function buildCourse(props: GateProp[], fallbackStart: Vec2 & { rotation?: number }): Gate[] {
  const startArch = props.find((p) => p.catalogId === 'pk-start-arch');
  const finishArch = props.find((p) => p.catalogId === 'pk-finish-arch');
  const start: Gate = startArch
    ? { kind: 'start', n: 0, id: startArch.id, x: startArch.x, y: startArch.y, rotation: startArch.rotation, w: startArch.w ?? 3.4 }
    : { kind: 'start', n: 0, id: 'start', x: fallbackStart.x, y: fallbackStart.y, rotation: fallbackStart.rotation ?? 0, w: 3 };
  const flags = props
    .map((p) => ({ p, n: checkpointNumber(p.catalogId) }))
    .filter((f): f is { p: GateProp; n: number } => f.n !== null);
  const out: Gate[] = [start];
  let prev: Vec2 = start;
  const numbers = [...new Set(flags.map((f) => f.n))].sort((a, b) => a - b);
  for (const n of numbers) {
    const same = flags.filter((f) => f.n === n);
    while (same.length) {
      same.sort((a, b) => Math.hypot(a.p.x - prev.x, a.p.y - prev.y) - Math.hypot(b.p.x - prev.x, b.p.y - prev.y));
      const f = same.shift()!;
      out.push({ kind: 'checkpoint', n, id: f.p.id, x: f.p.x, y: f.p.y, rotation: f.p.rotation, w: 0 });
      prev = f.p;
    }
  }
  if (finishArch) out.push({ kind: 'finish', n: 0, id: finishArch.id, x: finishArch.x, y: finishArch.y, rotation: finishArch.rotation, w: finishArch.w ?? 3.4 });
  else if (out.length > 1) out[out.length - 1] = { ...out[out.length - 1], kind: 'finish' };
  return out;
}

/**
 * Has a runner at `p` passed the gate? Arches: between the posts and within a stride of the arch line.
 * Flags: within 1.8 m (they stand next to the path).
 */
export function passed(gate: Gate, p: Vec2): boolean {
  if (gate.kind === 'checkpoint' || gate.w <= 0) return Math.hypot(p.x - gate.x, p.y - gate.y) < 1.8;
  const c = Math.cos(gate.rotation);
  const s = Math.sin(gate.rotation);
  const dx = p.x - gate.x;
  const dy = p.y - gate.y;
  const lx = dx * c + dy * s;
  const lz = -dx * s + dy * c;
  return Math.abs(lx) < gate.w / 2 + 0.2 && Math.abs(lz) < 0.7;
}

/** a short fingerprint of a course layout: a ghost only replays on the course it was recorded on */
export function courseKey(gates: Gate[]): string {
  return gates.map((g) => `${g.kind[0]}${g.n}@${Math.round(g.x * 2)},${Math.round(g.y * 2)}`).join('|');
}

/** "+1.2" / "−0.8" against the best split */
export function splitDelta(t: number, best: number | undefined): string | null {
  if (best === undefined) return null;
  const d = t - best;
  return `${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(1)}`;
}

// ---- ghost ----------------------------------------------------------------------------------------

export const GHOST_STEP = 0.1;

/** A recorded run: one sample every GHOST_STEP seconds – x, height, y, facing. */
export interface GhostRun {
  key: string;
  time: number;
  splits: number[];
  samples: number[];
}

export class GhostRecorder {
  samples: number[] = [];
  private acc = 0;

  add(dt: number, x: number, h: number, y: number, facing: number): void {
    this.acc -= dt;
    if (this.acc > 0) return;
    this.acc += GHOST_STEP;
    this.samples.push(Math.round(x * 100) / 100, Math.round(h * 100) / 100, Math.round(y * 100) / 100, Math.round(facing * 100) / 100);
  }
}

/** Interpolated ghost pose at time t, or null after its end. */
export function ghostAt(run: GhostRun, t: number, out = { x: 0, h: 0, y: 0, facing: 0 }): typeof out | null {
  const n = run.samples.length / 4;
  if (n < 2) return null;
  const f = t / GHOST_STEP;
  if (f >= n - 1) return null;
  const i = Math.max(0, Math.floor(f));
  const k = f - i;
  const a = i * 4;
  const b = a + 4;
  const s = run.samples;
  out.x = s[a] + (s[b] - s[a]) * k;
  out.h = s[a + 1] + (s[b + 1] - s[a + 1]) * k;
  out.y = s[a + 2] + (s[b + 2] - s[a + 2]) * k;
  let df = s[b + 3] - s[a + 3];
  while (df > Math.PI) df -= Math.PI * 2;
  while (df < -Math.PI) df += Math.PI * 2;
  out.facing = s[a + 3] + df * k;
  return out;
}

const GHOST_KEY = 'dhb.parkour.ghost';

export function loadGhost(key: string): GhostRun | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(GHOST_KEY);
    if (!raw) return null;
    const runs = JSON.parse(raw) as GhostRun[];
    return runs.find((r) => r.key === key) ?? null;
  } catch {
    return null;
  }
}

/** Keep the run if it is the best on its course (a few courses are remembered). Returns true if saved. */
export function saveGhost(run: GhostRun): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    const raw = localStorage.getItem(GHOST_KEY);
    const runs = raw ? (JSON.parse(raw) as GhostRun[]) : [];
    const old = runs.find((r) => r.key === run.key);
    if (old && old.time <= run.time) return false;
    const rest = runs.filter((r) => r.key !== run.key).slice(-3);
    localStorage.setItem(GHOST_KEY, JSON.stringify([...rest, run]));
    return true;
  } catch {
    return false;
  }
}

export const MEDALS = { bronze: 150, silver: 95, gold: 68 } as const;

export function verdict(time: number, falls: number): string {
  if (time <= MEDALS.gold) return falls ? 'מהירה כמו נינג׳ה! (ובלי הנפילות – אפילו מהר יותר)' : 'ריצה מושלמת של נינג׳ה! 🥷';
  if (time <= MEDALS.silver) return 'ריצה מעולה! נסו לרוץ (Shift) בין המכשולים.';
  return 'סיימתם את המסלול! עכשיו נסו לנצח את רוח הרפאים שלכם.';
}
