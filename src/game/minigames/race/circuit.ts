/**
 * Race circuits on the neighborhood's own streets (pure logic, no three.js).
 *
 * 1. `findLoop` looks for a closed loop of road cells through a start cell: the road grid is reduced
 *    to its junctions and the corridors between them, and a bounded depth-first search scores every
 *    simple cycle it meets (length close to the target, a lively number of corners, the player's own
 *    arches on it).
 * 2. `buildCircuit` turns the loop into a smooth centre line (rounded corners), sampled every metre,
 *    with headings, curvature and checkpoint gates on clean straights.
 * 3. `speedProfile` gives the fastest sensible speed at every sample for a vehicle (corner speed,
 *    braking before corners, acceleration out of them) and the ideal lap time.
 */

export type Cell = [number, number];

/** direction index → cell step (0 north, 1 east, 2 south, 3 west; y grows to the south) */
export const DIRS: ReadonlyArray<Cell> = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

const key = (i: number, j: number): string => `${i},${j}`;

export interface RoadNet {
  has(i: number, j: number): boolean;
  /** road neighbours of a cell as direction indices */
  exits(i: number, j: number): number[];
}

export function roadNet(roads: ReadonlyArray<Cell>): RoadNet {
  const set = new Set(roads.map(([i, j]) => key(i, j)));
  const has = (i: number, j: number) => set.has(key(i, j));
  return {
    has,
    exits: (i, j) => {
      const out: number[] = [];
      for (let d = 0; d < 4; d++) if (has(i + DIRS[d][0], j + DIRS[d][1])) out.push(d);
      return out;
    },
  };
}

/** A plain straight piece of street: exactly two road neighbours, opposite each other. */
export function isStraight(net: RoadNet, i: number, j: number): boolean {
  if (!net.has(i, j)) return false;
  const e = net.exits(i, j);
  return e.length === 2 && (e[0] + 2) % 4 === e[1];
}

/** The straight road cell nearest to a point (site meters); prefers cells inside a straight run of 3. */
export function startCellNear(net: RoadNet, roads: ReadonlyArray<Cell>, x: number, y: number, cell = 10): Cell | null {
  let best: Cell | null = null;
  let bestScore = Infinity;
  for (const [i, j] of roads) {
    if (!isStraight(net, i, j)) continue;
    const e = net.exits(i, j);
    const [a, b] = [DIRS[e[0]], DIRS[e[1]]];
    const run = (isStraight(net, i + a[0], j + a[1]) ? 1 : 0) + (isStraight(net, i + b[0], j + b[1]) ? 1 : 0);
    const d = Math.hypot((i + 0.5) * cell - x, (j + 0.5) * cell - y);
    const score = d + (2 - run) * 12;
    if (score < bestScore) {
      bestScore = score;
      best = [i, j];
    }
  }
  return best;
}

interface Corridor {
  /** cells after the node, ending with the next node */
  cells: Cell[];
  to: string;
}

export interface LoopOptions {
  /** wanted length in cells */
  target: number;
  min: number;
  max: number;
  /** cells the loop should pass through if it can (the player's own arches) */
  prefer?: ReadonlyArray<Cell>;
  /** search budget (corridor expansions) */
  budget?: number;
}

/** Number of 90° corners of a closed cell loop. */
export function countTurns(cells: ReadonlyArray<Cell>): number {
  let n = 0;
  for (let k = 0; k < cells.length; k++) {
    const a = cells[(k + cells.length - 1) % cells.length];
    const b = cells[k];
    const c = cells[(k + 1) % cells.length];
    if (b[0] - a[0] !== c[0] - b[0] || b[1] - a[1] !== c[1] - b[1]) n++;
  }
  return n;
}

/**
 * A closed loop of road cells through `start`, in driving order beginning with `start`.
 * Returns null when the start cell is on no loop at all.
 */
export function findLoop(net: RoadNet, start: Cell, opts: LoopOptions): Cell[] | null {
  const startKey = key(start[0], start[1]);
  const isNode = (i: number, j: number) => key(i, j) === startKey || net.exits(i, j).length !== 2;
  const corridorCache = new Map<string, Corridor | null>();
  const corridor = (i: number, j: number, d: number): Corridor | null => {
    const ck = `${i},${j},${d}`;
    if (corridorCache.has(ck)) return corridorCache.get(ck)!;
    const cells: Cell[] = [];
    let ci = i + DIRS[d][0];
    let cj = j + DIRS[d][1];
    let from = (d + 2) % 4;
    let out: Corridor | null = null;
    for (let guard = 0; guard < 4000; guard++) {
      cells.push([ci, cj]);
      if (isNode(ci, cj)) {
        out = { cells, to: key(ci, cj) };
        break;
      }
      const next = net.exits(ci, cj).find((e) => e !== from);
      if (next === undefined) break;
      ci += DIRS[next][0];
      cj += DIRS[next][1];
      from = (next + 2) % 4;
    }
    corridorCache.set(ck, out);
    return out;
  };
  const prefer = new Set((opts.prefer ?? []).map(([i, j]) => key(i, j)));
  const startExits = net.exits(start[0], start[1]);
  if (startExits.length < 1) return null;

  let best: Cell[] | null = null;
  let bestScore = Infinity;
  const score = (cells: Cell[]): number => {
    const L = cells.length;
    const turns = countTurns(cells);
    let s = Math.abs(L - opts.target) / opts.target * 4;
    // 6–12 corners make a lively lap; more is fiddly, fewer is a boring rectangle
    s += turns < 6 ? (6 - turns) * 0.12 : turns > 14 ? (turns - 14) * 0.08 : -0.02 * (turns - 6);
    let hit = 0;
    for (const [i, j] of cells) if (prefer.has(key(i, j))) hit++;
    s -= hit * 0.6;
    return s;
  };

  let budget = opts.budget ?? 120000;
  const visited = new Set<string>([startKey]);
  const path: Cell[] = [[start[0], start[1]]];
  const sx = start[0];
  const sy = start[1];
  // leave the start cell through its first exit; the loop comes back through another one
  const d0 = startExits[0];
  const dfs = (i: number, j: number, firstDir: number | null): void => {
    for (let d = 0; d < 4; d++) {
      if (budget-- <= 0) return;
      if (firstDir !== null && d !== firstDir) continue;
      if (!net.has(i + DIRS[d][0], j + DIRS[d][1])) continue;
      const c = corridor(i, j, d);
      if (!c) continue;
      const newLen = path.length + c.cells.length;
      if (c.to === startKey) {
        // closed: the corridor's last cell is the start itself
        if (path.length === 1) continue; // straight back out and in again
        const loop = path.concat(c.cells.slice(0, -1));
        if (loop.length >= opts.min && loop.length <= opts.max) {
          const sc = score(loop);
          if (sc < bestScore) {
            bestScore = sc;
            best = loop.map((p) => [p[0], p[1]] as Cell);
          }
        }
        continue;
      }
      if (visited.has(c.to)) continue;
      // also never step through a cell already used (corridors of different nodes cannot overlap, but be safe)
      const [ti, tj] = c.cells[c.cells.length - 1];
      const back = Math.abs(ti - sx) + Math.abs(tj - sy);
      if (newLen + back > opts.max) continue;
      visited.add(c.to);
      const before = path.length;
      for (const cell of c.cells) path.push(cell);
      dfs(ti, tj, null);
      path.length = before;
      visited.delete(c.to);
    }
  };
  dfs(sx, sy, d0);
  return best;
}

export interface Gate {
  /** distance along the lap, m */
  s: number;
  x: number;
  y: number;
  /** driving direction at the gate (unit) */
  dx: number;
  dy: number;
  /** half the width of the gate, m */
  half: number;
  /** a gate the player placed (race-arch prop) instead of an automatic one */
  placed?: string;
}

export interface Circuit {
  cells: Cell[];
  /** samples every `ds` metres along the centre line, starting at the start line */
  xs: Float64Array;
  ys: Float64Array;
  /** unit tangent */
  tx: Float64Array;
  ty: Float64Array;
  /** curvature 1/m (unsigned) */
  k: Float64Array;
  ds: number;
  length: number;
  /** gates[0] is the start / finish line at s = 0; then the checkpoints in order */
  gates: Gate[];
}

/** Corner radius of the racing line in a 10 m street grid. */
const CORNER_R = 4.6;

/**
 * Smooth centre line through a cell loop: straight between corners, a circular arc in every corner.
 * `cellSize` is the road grid (10 m). The returned samples start at the middle of the first cell.
 */
export function centreLine(cells: ReadonlyArray<Cell>, cellSize = 10, ds = 1): { xs: number[]; ys: number[]; k: number[] } {
  const n = cells.length;
  const c = (p: Cell) => ({ x: (p[0] + 0.5) * cellSize, y: (p[1] + 0.5) * cellSize });
  // corner vertices (cells where the direction changes), starting with the first cell as a plain point
  const verts: { x: number; y: number; corner: boolean }[] = [];
  for (let k = 0; k < n; k++) {
    const a = cells[(k + n - 1) % n];
    const b = cells[k];
    const d = cells[(k + 1) % n];
    const corner = b[0] - a[0] !== d[0] - b[0] || b[1] - a[1] !== d[1] - b[1];
    if (k === 0 || corner) verts.push({ ...c(b), corner });
  }
  const xs: number[] = [];
  const ys: number[] = [];
  const ks: number[] = [];
  let carry = 0; // distance already travelled past the last sample
  const emitLine = (x0: number, y0: number, x1: number, y1: number) => {
    const L = Math.hypot(x1 - x0, y1 - y0);
    if (L < 1e-9) return;
    let t = ds - carry;
    if (xs.length === 0) t = 0;
    for (; t < L - 1e-9; t += ds) {
      xs.push(x0 + ((x1 - x0) * t) / L);
      ys.push(y0 + ((y1 - y0) * t) / L);
      ks.push(0);
    }
    carry = L - (t - ds);
  };
  const emitArc = (cx: number, cy: number, r: number, a0: number, sweep: number) => {
    const L = Math.abs(sweep) * r;
    let t = ds - carry;
    if (xs.length === 0) t = 0;
    for (; t < L - 1e-9; t += ds) {
      const a = a0 + (sweep * t) / L;
      xs.push(cx + Math.cos(a) * r);
      ys.push(cy + Math.sin(a) * r);
      ks.push(1 / r);
    }
    carry = L - (t - ds);
  };
  const m = verts.length;
  let px = verts[0].x;
  let py = verts[0].y;
  for (let v = 1; v <= m; v++) {
    const V = verts[v % m];
    const N = verts[(v + 1) % m];
    if (!V.corner) {
      emitLine(px, py, V.x, V.y);
      px = V.x;
      py = V.y;
      continue;
    }
    const inL = Math.hypot(V.x - px, V.y - py);
    const outL = Math.hypot(N.x - V.x, N.y - V.y);
    const inx = (V.x - px) / inL;
    const iny = (V.y - py) / inL;
    const outx = (N.x - V.x) / outL;
    const outy = (N.y - V.y) / outL;
    const r = Math.min(CORNER_R, inL * 0.5, outL * 0.5);
    const ax = V.x - inx * r;
    const ay = V.y - iny * r;
    emitLine(px, py, ax, ay);
    // the arc's centre is to the inside of the turn
    const turn = inx * outy - iny * outx; // >0: turning towards +y side (clockwise on screen)
    const nx = turn > 0 ? -iny : iny;
    const ny = turn > 0 ? inx : -inx;
    const cx = ax + nx * r;
    const cy = ay + ny * r;
    const a0 = Math.atan2(ay - cy, ax - cx);
    emitArc(cx, cy, r, a0, turn > 0 ? Math.PI / 2 : -Math.PI / 2);
    px = V.x + outx * r;
    py = V.y + outy * r;
  }
  return { xs, ys, k: ks };
}

export interface GateOptions {
  /** places the gate must not stand on (lamp posts, trees on the sidewalk…) */
  obstacles?: ReadonlyArray<{ x: number; y: number }>;
  /** the player's arches on the roads: become the checkpoints when they are on the loop */
  arches?: ReadonlyArray<{ id: string; x: number; y: number }>;
  cellSize?: number;
}

/**
 * Build the circuit from a loop of cells. The start line is moved a little along the first straight
 * if a lamp post stands where the gantry would go.
 */
export function buildCircuit(net: RoadNet, loop: ReadonlyArray<Cell>, opts: GateOptions = {}): Circuit {
  const C = opts.cellSize ?? 10;
  const ds = 1;
  const line = centreLine(loop, C, ds);
  let n = line.xs.length;
  const obstacles = opts.obstacles ?? [];
  const tangent = (i: number) => {
    const a = (i + n - 1) % n;
    const b = (i + 1) % n;
    const dx = line.xs[b] - line.xs[a];
    const dy = line.ys[b] - line.ys[a];
    const l = Math.hypot(dx, dy) || 1;
    return { x: dx / l, y: dy / l };
  };
  const HALF = C / 2 - 0.4;
  /** is a gate at sample i free of posts / trees at both ends? */
  const clear = (i: number) => {
    const t = tangent(i);
    for (const o of obstacles) {
      const rx = o.x - line.xs[i];
      const ry = o.y - line.ys[i];
      const along = rx * t.x + ry * t.y;
      const across = Math.abs(-rx * t.y + ry * t.x);
      if (Math.abs(along) < 1.3 && across < HALF + 0.8) return false;
    }
    return true;
  };
  // start line: the middle of the first cell, or a little before/after it
  let s0 = 0;
  for (const off of [0, 3, -3, 2, -2, 4, -4]) {
    const i = (off + n) % n;
    if (clear(i)) {
      s0 = i;
      break;
    }
  }
  // rotate the samples so that the start line is sample 0
  const rot = <T>(arr: T[]) => arr.slice(s0).concat(arr.slice(0, s0));
  const xsA = rot(line.xs);
  const ysA = rot(line.ys);
  const kA = rot(line.k);
  n = xsA.length;
  const xs = Float64Array.from(xsA);
  const ys = Float64Array.from(ysA);
  const k = Float64Array.from(kA);
  const tx = new Float64Array(n);
  const ty = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = (i + n - 1) % n;
    const b = (i + 1) % n;
    const dx = xs[b] - xs[a];
    const dy = ys[b] - ys[a];
    const l = Math.hypot(dx, dy) || 1;
    tx[i] = dx / l;
    ty[i] = dy / l;
  }
  const length = n * ds;
  const gateAt = (i: number, placed?: string): Gate => ({ s: i * ds, x: xs[i], y: ys[i], dx: tx[i], dy: ty[i], half: HALF, placed });
  const gates: Gate[] = [gateAt(0)];

  const cellOf = (x: number, y: number): Cell => [Math.floor(x / C), Math.floor(y / C)];
  const straightAt = (i: number) => {
    if (k[i] > 0) return false;
    const [ci, cj] = cellOf(xs[i], ys[i]);
    return isStraight(net, ci, cj);
  };
  // the player's own arches that stand on the loop become the checkpoints
  const placed: Gate[] = [];
  for (const a of opts.arches ?? []) {
    let bi = -1;
    let bd = Infinity;
    for (let i = 0; i < n; i++) {
      const d = Math.hypot(xs[i] - a.x, ys[i] - a.y);
      if (d < bd) {
        bd = d;
        bi = i;
      }
    }
    if (bi >= 0 && bd < C * 0.6 && bi * ds > 25 && length - bi * ds > 25) {
      const g = gateAt(bi, a.id);
      g.x = a.x;
      g.y = a.y;
      if (!placed.some((p) => Math.abs(p.s - g.s) < 25)) placed.push(g);
    }
  }
  if (placed.length >= 2) {
    placed.sort((a, b) => a.s - b.s);
    gates.push(...placed);
  } else {
    // automatic checkpoints: evenly spread, on plain straights, clear of lamp posts
    const count = Math.max(3, Math.min(7, Math.round(length / 120)));
    for (let g = 1; g <= count; g++) {
      const want = Math.round((length * g) / (count + 1));
      let pick = -1;
      for (let off = 0; off < length / (count + 1) / 2; off++) {
        for (const sgn of [1, -1]) {
          const i = (want + sgn * off + n) % n;
          if (i * ds < 30 || length - i * ds < 30) continue;
          if (!straightAt(i) || !clear(i)) continue;
          if (gates.some((q) => Math.abs(q.s - i * ds) < 40)) continue;
          pick = i;
          break;
        }
        if (pick >= 0) break;
      }
      if (pick >= 0) gates.push(gateAt(pick));
    }
    gates.sort((a, b) => a.s - b.s);
  }
  return { cells: loop.map((c) => [c[0], c[1]] as Cell), xs, ys, tx, ty, k, ds, length, gates };
}

export interface DriveSpec {
  /** top speed, m/s */
  vmax: number;
  /** m/s² */
  accel: number;
  brake: number;
  /** lateral grip, m/s² */
  grip: number;
}

/** Fastest sensible speed at each sample and the ideal (flying) lap time. */
export function speedProfile(c: Circuit, spec: DriveSpec): { v: Float64Array; lapTime: number } {
  const n = c.xs.length;
  const v = new Float64Array(n);
  // corners: average the curvature a little so the car brakes for the whole corner
  for (let i = 0; i < n; i++) {
    let kk = 0;
    for (let o = -2; o <= 2; o++) kk = Math.max(kk, c.k[(i + o + n) % n]);
    v[i] = kk > 1e-6 ? Math.min(spec.vmax, Math.sqrt(spec.grip / kk)) : spec.vmax;
  }
  // braking (backwards) and accelerating (forwards), twice around for the wrap
  for (let pass = 0; pass < 2; pass++) {
    for (let i = n - 1; i >= 0; i--) {
      const nx = v[(i + 1) % n];
      v[i] = Math.min(v[i], Math.sqrt(nx * nx + 2 * spec.brake * c.ds));
    }
  }
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < n; i++) {
      const pv = v[(i + n - 1) % n];
      v[i] = Math.min(v[i], Math.sqrt(pv * pv + 2 * spec.accel * c.ds));
    }
  }
  let t = 0;
  for (let i = 0; i < n; i++) t += c.ds / Math.max(0.5, v[i]);
  return { v, lapTime: t };
}

/** Ideal race time: `laps` flying laps plus the standing start. */
export function idealRaceTime(lapTime: number, laps: number, spec: DriveSpec): number {
  return lapTime * laps + spec.vmax / (2 * spec.accel);
}

/**
 * Closest point of the circuit to (x, y), searching ±`window` samples around `hint` (or everywhere
 * when hint < 0). Returns the sample index and the signed lateral offset (positive = right of travel).
 */
export function project(c: Circuit, x: number, y: number, hint = -1, window = 40): { i: number; dist: number; lateral: number } {
  const n = c.xs.length;
  let bi = 0;
  let bd = Infinity;
  const scan = (i: number) => {
    const d = (c.xs[i] - x) ** 2 + (c.ys[i] - y) ** 2;
    if (d < bd) {
      bd = d;
      bi = i;
    }
  };
  if (hint < 0) for (let i = 0; i < n; i++) scan(i);
  else for (let o = -window; o <= window; o++) scan((((hint + o) % n) + n) % n);
  const rx = x - c.xs[bi];
  const ry = y - c.ys[bi];
  // right of travel in plan coordinates (x east, y south): (tx, ty) → (-ty, tx)
  const lateral = -rx * c.ty[bi] + ry * c.tx[bi];
  return { i: bi, dist: Math.sqrt(bd), lateral };
}

/** Did a move from p to q pass a gate forwards (+1), backwards (-1) or not (0)? */
export function crossGate(g: Gate, px: number, py: number, qx: number, qy: number): -1 | 0 | 1 {
  const a = (px - g.x) * g.dx + (py - g.y) * g.dy;
  const b = (qx - g.x) * g.dx + (qy - g.y) * g.dy;
  if ((a < 0) === (b < 0)) return 0;
  const t = a / (a - b);
  const mx = px + (qx - px) * t - g.x;
  const my = py + (qy - py) * t - g.y;
  const across = Math.abs(-mx * g.dy + my * g.dx);
  if (across > g.half + 1.5) return 0;
  return a < 0 ? 1 : -1;
}

/** Race order: index of each racer sorted by progress (finished racers first, by finishing time). */
export function standings(racers: ReadonlyArray<{ progress: number; finishedAt: number | null }>): number[] {
  return racers
    .map((r, i) => i)
    .sort((a, b) => {
      const A = racers[a];
      const B = racers[b];
      if (A.finishedAt !== null || B.finishedAt !== null) {
        if (A.finishedAt === null) return 1;
        if (B.finishedAt === null) return -1;
        return A.finishedAt - B.finishedAt;
      }
      return B.progress - A.progress;
    });
}

/** Rubber band: AI speed factor from how far it is ahead of the player (m). */
export function rubberBand(aheadOfPlayer: number): number {
  return Math.max(0.84, Math.min(1.06, 1 - aheadOfPlayer / 260));
}

/** Normalised race score: real seconds scaled so that an ideal race of any circuit/vehicle = REF. */
export const RACE_REF_TIME = 150;
export function normalisedTime(real: number, ideal: number): number {
  return Math.round((real * (RACE_REF_TIME / Math.max(1, ideal))) * 10) / 10;
}

/** Circuit length goals (cells of 10 m) per vehicle kind. */
export function loopTarget(kind: 'car' | 'bicycle' | 'scooter'): LoopOptions {
  if (kind === 'car') return { target: 80, min: 40, max: 125 };
  return { target: 56, min: 30, max: 90 };
}
