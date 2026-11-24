/**
 * Penalty shoot-out rules and ball physics (pure, testable). Everything is in GOAL-LOCAL meters:
 * origin = middle of the goal line on the ground, x along the goal line (+x = the shooter's right),
 * y up, +z out of the goal towards the shooter. The goal mouth is x ∈ [−halfW, halfW], y ∈ [0, top] at z = 0.
 */

export interface GoalFrame {
  halfW: number;
  top: number;
  /** net depth at the ground / at the crossbar */
  depth: number;
  roof: number;
  /** post / crossbar radius */
  postR: number;
}

export const BALL_R = 0.11;
export const GRAVITY = 9.81;
const DRAG = 0.011;
/** lateral acceleration per unit spin and speed (Magnus) */
const MAGNUS = 0.42;

export interface Ball {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** side spin: + curves towards +x */
  spin: number;
}

export type Zone = 'top-corner' | 'low-corner' | 'side' | 'center' | 'out';

export const SHOTS = 10;
/** shots from this index on are free kicks with a wall */
export const FREE_KICK_FROM = 7;

/** Where in the goal a point is (for points): corners are worth more. */
export function zoneOf(x: number, y: number, g: GoalFrame): Zone {
  if (Math.abs(x) > g.halfW - BALL_R * 0.3 || y > g.top - BALL_R * 0.3 || y < 0) return 'out';
  const side = Math.abs(x) / g.halfW;
  const up = y / g.top;
  if (side > 0.62 && up > 0.58) return 'top-corner';
  if (side > 0.62 && up < 0.32) return 'low-corner';
  if (side > 0.42) return 'side';
  return 'center';
}

export const ZONE_POINTS: Record<Zone, number> = { 'top-corner': 300, 'low-corner': 200, side: 150, center: 100, out: 0 };
export const ZONE_NAMES: Record<Zone, string> = { 'top-corner': 'טופ פינה!', 'low-corner': 'פינה נמוכה!', side: 'בצד!', center: 'באמצע', out: '' };

/** Points for a goal: the zone, a streak bonus (+50 per goal in a row after the first, up to +250) and ×1.5 for free kicks. */
export function goalPoints(zone: Zone, streak: number, freeKick: boolean): { points: number; bonus: number } {
  const base = ZONE_POINTS[zone];
  if (!base) return { points: 0, bonus: 0 };
  const bonus = Math.min(250, Math.max(0, streak - 1) * 50);
  return { points: Math.round((base + bonus) * (freeKick ? 1.5 : 1)), bonus };
}

export interface Difficulty {
  /** chance the keeper reads the shot (else he guesses) */
  read: number;
  /** seconds before he moves */
  reaction: number;
  /** m/s of the dive */
  dive: number;
  /** radius around the hands that still saves */
  reach: number;
  /** power meter cycles per second */
  powerSpeed: number;
  /** reticle wobble amplitude (m) */
  wobble: number;
}

export function difficulty(round: number): Difficulty {
  const t = Math.min(1, round / (SHOTS - 1));
  return {
    read: 0.2 + 0.42 * t,
    // he leaves the line at the kick (a negative reaction = he reads the run-up and goes early)
    reaction: 0.06 - 0.12 * t,
    dive: 6.4 + 3.0 * t,
    reach: 0.5 + 0.12 * t,
    powerSpeed: 0.65 + 0.55 * t,
    wobble: 0.04 + 0.2 * t,
  };
}

/** Shot speed (m/s) from the power meter. */
export const shotSpeed = (power: number): number => 12 + 16 * Math.min(1, Math.max(0, power));

/** Advance the ball by dt (gravity, drag, curve). Ground bounce is handled here too. */
export function stepBall(b: Ball, dt: number): void {
  const v = Math.hypot(b.vx, b.vy, b.vz);
  const drag = DRAG * v;
  // Magnus: perpendicular to the horizontal velocity
  const ax = -drag * b.vx + MAGNUS * b.spin * -b.vz;
  const az = -drag * b.vz + MAGNUS * b.spin * b.vx;
  const ay = -drag * b.vy - GRAVITY;
  b.vx += ax * dt;
  b.vy += ay * dt;
  b.vz += az * dt;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.z += b.vz * dt;
  b.spin *= Math.exp(-0.25 * dt);
  if (b.y < BALL_R) {
    b.y = BALL_R;
    if (b.vy < 0) b.vy = -b.vy * 0.45;
    if (Math.abs(b.vy) < 0.4) b.vy = 0;
    const f = Math.exp(-2.2 * dt);
    b.vx *= f;
    b.vz *= f;
    b.spin *= f;
  }
}

/** Where and when the ball first reaches the goal line (or null if it never does). */
export function crossing(b0: Ball, maxT = 3, dt = 1 / 240): { x: number; y: number; t: number } | null {
  const b = { ...b0 };
  let t = 0;
  while (t < maxT) {
    const pz = b.z;
    const px = b.x;
    const py = b.y;
    stepBall(b, dt);
    t += dt;
    if (b.z <= 0 && pz > 0) {
      const f = pz / (pz - b.z);
      return { x: px + (b.x - px) * f, y: py + (b.y - py) * f, t: t - dt + dt * f };
    }
    if (b.vz >= 0 && b.z > 0) return null;
  }
  return null;
}

/**
 * Initial velocity so that a ball kicked from (x0, z0) with the given speed and spin reaches the
 * target point on the goal line (shooting method: a few corrections of the aim).
 */
export function planShot(x0: number, z0: number, tx: number, ty: number, speed: number, spin: number): Ball {
  let ax = tx;
  let ay = ty;
  let ball: Ball = { x: x0, y: BALL_R, z: z0, vx: 0, vy: 0, vz: 0, spin };
  for (let it = 0; it < 6; it++) {
    const dx = ax - x0;
    const dz = -z0;
    const dist = Math.hypot(dx, dz);
    const tf = dist / speed;
    // vertical: parabola (drag is corrected by the iterations)
    const vy = (ay - BALL_R + 0.5 * GRAVITY * tf * tf) / tf;
    const h = speed;
    ball = { x: x0, y: BALL_R, z: z0, vx: (dx / dist) * h, vy, vz: (dz / dist) * h, spin };
    const c = crossing(ball);
    if (!c) break;
    ax += tx - c.x;
    ay += ty - c.y;
  }
  return ball;
}

/** The keeper's plan for one shot. */
export interface KeeperPlan {
  /** where his hands go (goal plane) */
  x: number;
  y: number;
  /** seconds after the kick when he starts / arrives */
  start: number;
  arrive: number;
  /** does he get to the ball */
  save: boolean;
  /** did he read it (else: a guess) */
  read: boolean;
}

export function planKeeper(cross: { x: number; y: number; t: number } | null, g: GoalFrame, d: Difficulty, speed: number, random: () => number): KeeperPlan {
  const slow = Math.max(0, (18 - speed) / 6); // soft shots are easier to read
  const read = random() < Math.min(0.92, d.read + slow * 0.25);
  let x: number;
  let y: number;
  if (cross && read) {
    x = cross.x + (random() - 0.5) * 0.5;
    y = cross.y + (random() - 0.5) * 0.4;
  } else {
    const r = random();
    const side = r < 0.42 ? -1 : r < 0.84 ? 1 : 0;
    x = side * (0.9 + random() * (g.halfW - 1.0));
    y = 0.3 + random() * (g.top - 0.4);
  }
  // he can't fly further than his body allows
  x = Math.max(-(g.halfW - 0.15), Math.min(g.halfW - 0.15, x));
  y = Math.max(0.15, Math.min(g.top + 0.1, y));
  const start = d.reaction;
  const travel = Math.hypot(x, y - 1.0);
  const arrive = start + 0.08 + travel / d.dive;
  let save = false;
  if (cross && Math.abs(cross.x) < g.halfW && cross.y < g.top) {
    // top corners are hard to reach even for a good dive
    const corner = Math.abs(cross.x) > g.halfW * 0.7 && cross.y > g.top * 0.62;
    const reach = d.reach * (corner ? 0.55 : 1) + (Math.abs(cross.x) < 0.6 && cross.y < 1.7 ? 0.35 : 0);
    const miss = Math.hypot(cross.x - x, cross.y - y);
    // a late dive still blocks if he is right there; the body covers the middle
    const late = arrive - cross.t;
    save = miss < reach && late < 0.06 + (reach - miss) * 0.25;
    // a keeper who stays in the middle (or read it) blocks a shot at his body
    const stays = Math.abs(x) < 0.55;
    if (!save && stays && Math.abs(cross.x) < 0.6 && cross.y < 1.8) save = true;
  }
  return { x, y, start, arrive, save, read };
}

/** Random aim error from the power meter (sweet spot 0.55–0.8). Returns [dx, dy] in meters. */
export function powerError(power: number, random: () => number): [number, number] {
  const gauss = () => (random() + random() + random() - 1.5) * 0.8;
  if (power > 0.93) return [gauss() * 0.4, 0.9 + random() * 0.8];
  if (power > 0.8) return [gauss() * 0.25, (power - 0.8) * 3 + gauss() * 0.15];
  if (power >= 0.55) return [gauss() * 0.1, gauss() * 0.08];
  return [gauss() * 0.22, gauss() * 0.18 - (0.55 - power) * 0.6];
}

/** Collisions with posts and crossbar: returns 'post' | 'bar' when the ball bounced off. */
export function hitFrame(b: Ball, g: GoalFrame): 'post' | 'bar' | null {
  const rr = BALL_R + g.postR;
  for (const s of [-1, 1]) {
    const dx = b.x - s * g.halfW;
    const dz = b.z;
    const d = Math.hypot(dx, dz);
    if (d < rr && b.y < g.top + g.postR) {
      const nx = dx / d;
      const nz = dz / d;
      const vn = b.vx * nx + b.vz * nz;
      if (vn < 0) {
        b.vx -= 1.6 * vn * nx;
        b.vz -= 1.6 * vn * nz;
        b.x = s * g.halfW + nx * rr;
        b.z = nz * rr;
        return 'post';
      }
    }
  }
  if (Math.abs(b.x) < g.halfW) {
    const dy = b.y - g.top;
    const dz = b.z;
    const d = Math.hypot(dy, dz);
    if (d < rr) {
      const ny = dy / d;
      const nz = dz / d;
      const vn = b.vy * ny + b.vz * nz;
      if (vn < 0) {
        b.vy -= 1.6 * vn * ny;
        b.vz -= 1.6 * vn * nz;
        b.y = g.top + ny * rr;
        b.z = nz * rr;
        return 'bar';
      }
    }
  }
  return null;
}

/** Inside the net (behind the goal line, between the posts, under the bar)? */
export const inNet = (b: Ball, g: GoalFrame): boolean => b.z < 0 && b.z > -g.depth - 0.3 && Math.abs(b.x) < g.halfW && b.y < g.top;

/** Keep a ball that is in the net inside it (the net catches it); returns the bulge strength. */
export function netCatch(b: Ball, g: GoalFrame, dt: number): number {
  // depth of the net at this height (sloping back net)
  const backAt = (y: number) => -(g.roof + (g.depth - g.roof) * (1 - Math.min(1, y / g.top)));
  let bulge = 0;
  const back = backAt(b.y) + BALL_R;
  if (b.z < back) {
    bulge = Math.max(bulge, Math.abs(b.vz));
    b.z = back;
    b.vz = Math.abs(b.vz) * 0.12;
    b.vx *= 0.5;
    b.vy *= 0.5;
  }
  for (const s of [-1, 1]) {
    if (s * b.x > g.halfW - BALL_R) {
      bulge = Math.max(bulge, Math.abs(b.vx) * 0.6);
      b.x = s * (g.halfW - BALL_R);
      b.vx = -b.vx * 0.15;
    }
  }
  if (b.y > g.top - BALL_R) {
    b.y = g.top - BALL_R;
    b.vy = -Math.abs(b.vy) * 0.2;
  }
  const f = Math.exp(-1.5 * dt);
  b.vx *= f;
  b.vz *= f;
  return bulge;
}

/** Medal-free summary line for the result card. */
export function resultDetail(goals: number, shots: number): string {
  if (goals === shots) return `מושלם! ${goals} גולים מתוך ${shots}!`;
  if (goals >= shots * 0.7) return `וואו! ${goals} גולים מתוך ${shots}`;
  if (goals >= shots * 0.4) return `יפה מאוד! ${goals} גולים מתוך ${shots}`;
  return `הבקעת ${goals} מתוך ${shots} – השוער היה חזק היום`;
}
