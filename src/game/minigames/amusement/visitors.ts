import * as THREE from 'three';
import type { AmuseRide } from '../../../catalog/items/_gameCKit';
import type { Vec2 } from '../../../model/types';
import { Character } from '../../../render3d/Character';
import { randomLook } from '../../../render3d/characterTypes';
import type { Activity, Prop } from '../../../render3d/characterTypes';
import type { MiniGameContext } from '../types';

/**
 * The park's visitors: people walking along the midway, queuing at the rides, riding along (glued to
 * the ride's seat nodes), eating at the stalls and taking photos of the rides.
 */

/** what the crowd needs to know about a ride */
export interface CrowdRide {
  rt: AmuseRide;
  /** site point where the queue starts and the direction the queue grows (away from the ride) */
  entrance: Vec2;
  away: Vec2;
  /** world yaw facing the ride (character convention) */
  facing: number;
}

export interface Spot {
  at: Vec2;
  facing: number;
}

type State = 'walk' | 'queue' | 'ride' | 'eat' | 'watch';

const SEAT_DROP = 0.45;

export class Visitor {
  readonly ch: Character;
  pos: Vec2;
  heading = 0;
  state: State = 'walk';
  route: Vec2[] = [];
  /** what the walk leads to */
  goal: { kind: 'ride'; ride: CrowdRide } | { kind: 'eat'; spot: Spot } | { kind: 'watch'; spot: Spot } | null = null;
  timer = 0;
  speed: number;
  ride: CrowdRide | null = null;
  seat = -1;
  stuck = 0;

  constructor(seed: number, pos: Vec2) {
    this.ch = new Character(randomLook(seed));
    this.pos = { ...pos };
    this.speed = 1.15 + (seed % 5) * 0.08;
  }
}

export class Crowd {
  readonly people: Visitor[] = [];
  private queues = new Map<CrowdRide, Visitor[]>();
  private tmp = new THREE.Vector3();

  constructor(
    private ctx: MiniGameContext,
    readonly rides: CrowdRide[],
    private food: Spot[],
    private watch: Spot[],
    /** the midway: site y and x range */
    private mid: { y: number; x0: number; x1: number },
    count: number,
  ) {
    for (const r of rides) this.queues.set(r, []);
    for (let i = 0; i < count; i++) {
      const x = mid.x0 + ((i + 0.5) / count) * (mid.x1 - mid.x0) + (ctx.random() - 0.5) * 4;
      const v = new Visitor(1000 + i * 37 + Math.floor(ctx.random() * 1000), { x, y: mid.y + (ctx.random() - 0.5) * 4 });
      ctx.root.add(v.ch.root);
      this.people.push(v);
      // a few start already waiting in line, the others pick something to do
      this.choose(v, i % 3 === 0);
    }
  }

  queueOf(r: CrowdRide): Visitor[] {
    return this.queues.get(r) ?? [];
  }

  /** where the i-th person in the queue stands */
  private queueSpot(r: CrowdRide, i: number): Vec2 {
    const d = 0.9 + i * 0.85;
    return { x: r.entrance.x + r.away.x * d, y: r.entrance.y + r.away.y * d };
  }

  private routeTo(from: Vec2, to: Vec2): Vec2[] {
    const { y, x0, x1 } = this.mid;
    const cx = (x: number) => Math.max(x0, Math.min(x1, x));
    const out: Vec2[] = [];
    if (Math.abs(from.y - y) > 1.5 && Math.hypot(to.x - from.x, to.y - from.y) > 6) out.push({ x: cx(from.x), y: y + (this.ctx.random() - 0.5) * 3 });
    if (Math.abs(to.y - y) > 1.5 || Math.abs(to.x - from.x) > 6) out.push({ x: cx(to.x), y: y + (this.ctx.random() - 0.5) * 3 });
    out.push(to);
    return out;
  }

  /** pick the next thing to do */
  private choose(v: Visitor, preferRide = false): void {
    const r = this.ctx.random();
    v.ride = null;
    v.seat = -1;
    if ((preferRide || r < 0.55) && this.rides.length) {
      // the shortest queues are the most tempting
      const sorted = [...this.rides].sort((a, b) => this.queueOf(a).length - this.queueOf(b).length + (this.ctx.random() - 0.5) * 2);
      const ride = sorted[0];
      if (this.queueOf(ride).length < 4) {
        v.goal = { kind: 'ride', ride };
        v.route = this.routeTo(v.pos, this.queueSpot(ride, this.queueOf(ride).length));
        v.state = 'walk';
        if (preferRide) {
          // start right in the queue
          v.pos = this.queueSpot(ride, this.queueOf(ride).length);
          this.joinQueue(v, ride);
        }
        return;
      }
    }
    if (r < 0.8 && this.food.length) {
      const spot = this.food[Math.floor(this.ctx.random() * this.food.length)];
      const at = { x: spot.at.x + (this.ctx.random() - 0.5) * 1.6, y: spot.at.y + (this.ctx.random() - 0.5) * 0.6 };
      v.goal = { kind: 'eat', spot: { at, facing: spot.facing } };
      v.route = this.routeTo(v.pos, at);
      v.state = 'walk';
      return;
    }
    const spot = this.watch[Math.floor(this.ctx.random() * this.watch.length)] ?? { at: { x: this.mid.x0 + this.ctx.random() * (this.mid.x1 - this.mid.x0), y: this.mid.y }, facing: 0 };
    const at = { x: spot.at.x + (this.ctx.random() - 0.5) * 3, y: spot.at.y + (this.ctx.random() - 0.5) * 1.2 };
    v.goal = { kind: 'watch', spot: { at, facing: spot.facing } };
    v.route = this.routeTo(v.pos, at);
    v.state = 'walk';
  }

  private joinQueue(v: Visitor, ride: CrowdRide): void {
    const q = this.queueOf(ride);
    if (!q.includes(v)) q.push(v);
    v.state = 'queue';
    v.ride = ride;
    v.route = [];
  }

  /**
   * Seat up to `max` people from the head of a ride's queue on free seats (nearest to `near` first).
   * Returns the seat indices taken.
   */
  board(ride: CrowdRide, max: number, taken: ReadonlySet<number>, near?: THREE.Vector3): number[] {
    const q = this.queueOf(ride);
    const nodes = ride.rt.seatFrames;
    const free: Array<{ i: number; d: number }> = [];
    nodes.forEach((n, i) => {
      if (taken.has(i) || ride.rt.extraRiders.has(i)) return;
      n.getWorldPosition(this.tmp);
      free.push({ i, d: near ? this.tmp.distanceTo(near) : i });
    });
    free.sort((a, b) => a.d - b.d);
    const out: number[] = [];
    while (q.length && out.length < max && free.length) {
      const v = q.shift()!;
      const seat = free.shift()!.i;
      v.state = 'ride';
      v.seat = seat;
      v.ride = ride;
      ride.rt.extraRiders.add(seat);
      const node = nodes[seat];
      node.add(v.ch.root);
      v.ch.root.position.set(0, -SEAT_DROP, 0);
      v.ch.root.rotation.set(0, 0, 0);
      v.ch.setPose('sit', SEAT_DROP);
      v.ch.setActivity('none');
      v.ch.setProp('none');
      out.push(seat);
    }
    return out;
  }

  /** everyone riding `ride` gets off and goes somewhere else */
  unboard(ride: CrowdRide): void {
    for (const v of this.people) {
      if (v.state !== 'ride' || v.ride !== ride) continue;
      ride.rt.extraRiders.delete(v.seat);
      this.ctx.root.add(v.ch.root);
      v.ch.root.rotation.set(0, 0, 0);
      v.ch.setPose('stand');
      v.ch.setActivity('none');
      v.pos = { x: ride.entrance.x + ride.away.x * 1.2 + (this.ctx.random() - 0.5) * 2, y: ride.entrance.y + ride.away.y * 1.2 + (this.ctx.random() - 0.5) * 2 };
      v.seat = -1;
      this.choose(v);
      // a happy wave after a good ride
      if (this.ctx.random() < 0.5) v.ch.gesture('cheer');
    }
  }

  /** riders currently on a ride (for the session) */
  riding(ride: CrowdRide): Visitor[] {
    return this.people.filter((v) => v.state === 'ride' && v.ride === ride);
  }

  update(dt: number): void {
    const ctx = this.ctx;
    for (const v of this.people) {
      const ch = v.ch;
      if (v.state === 'ride') {
        // arms up on the drops, a little cheer when it is wild
        const rt = v.ride!.rt;
        const want: Activity = rt.drop || rt.rush > 0.8 ? 'cheer' : 'none';
        if (ch.getActivity() !== want) ch.setActivity(want);
        ch.update(dt, 0);
        continue;
      }
      let speed = 0;
      if (v.state === 'walk') {
        const tgt = v.route[0];
        if (!tgt) this.arrive(v);
        else {
          const dx = tgt.x - v.pos.x;
          const dy = tgt.y - v.pos.y;
          const d = Math.hypot(dx, dy);
          if (d < 0.35) v.route.shift();
          else {
            speed = v.speed;
            const step = Math.min(d, speed * dt);
            const prev = { ...v.pos };
            v.pos.x += (dx / d) * step;
            v.pos.y += (dy / d) * step;
            ctx.walk.collide(v.pos, 0.25, ctx.groundAt(v.pos.x, v.pos.y));
            const moved = Math.hypot(v.pos.x - prev.x, v.pos.y - prev.y);
            v.stuck = moved < step * 0.3 ? v.stuck + dt : 0;
            if (v.stuck > 2.5) {
              // squeezed against something: skip this waypoint
              v.stuck = 0;
              v.route.shift();
            }
            const want = Math.atan2(v.pos.x - prev.x, v.pos.y - prev.y);
            v.heading = turn(v.heading, want, dt * 8);
          }
        }
      } else if (v.state === 'queue') {
        const q = this.queueOf(v.ride!);
        const spot = this.queueSpot(v.ride!, Math.max(0, q.indexOf(v)));
        const dx = spot.x - v.pos.x;
        const dy = spot.y - v.pos.y;
        const d = Math.hypot(dx, dy);
        if (d > 0.08) {
          speed = Math.min(1, d * 2);
          v.pos.x += (dx / d) * Math.min(d, speed * dt);
          v.pos.y += (dy / d) * Math.min(d, speed * dt);
        }
        v.heading = turn(v.heading, d > 0.3 ? Math.atan2(dx, dy) : v.ride!.facing, dt * 6);
        v.timer -= dt;
        if (v.timer <= 0) {
          v.timer = 3 + ctx.random() * 5;
          if (ctx.random() < 0.3) ch.gesture('wave');
        }
      } else {
        // eating / watching
        v.timer -= dt;
        const g = v.goal;
        if (g && g.kind !== 'ride') v.heading = turn(v.heading, g.spot.facing, dt * 5);
        if (v.timer <= 0) {
          ch.setActivity('none');
          ch.setProp('none');
          this.choose(v);
        }
      }
      ch.root.position.set(v.pos.x, ctx.groundAt(v.pos.x, v.pos.y), v.pos.y);
      ch.root.rotation.set(0, v.heading, 0);
      ch.update(dt, speed);
    }
  }

  private arrive(v: Visitor): void {
    const g = v.goal;
    if (!g) return this.choose(v);
    if (g.kind === 'ride') {
      if (this.queueOf(g.ride).length >= 5) return this.choose(v);
      this.joinQueue(v, g.ride);
      v.timer = 2;
      return;
    }
    v.state = g.kind === 'eat' ? 'eat' : 'watch';
    v.timer = g.kind === 'eat' ? 6 + this.ctx.random() * 5 : 5 + this.ctx.random() * 6;
    const acts: Array<[Activity, Prop]> = g.kind === 'eat' ? [['eat', 'apple'], ['drink', 'cup']] : [['photo', 'phone'], ['clap', 'none'], ['none', 'none'], ['wave', 'none']];
    const [a, p] = acts[Math.floor(this.ctx.random() * acts.length)];
    v.ch.setProp(p);
    v.ch.setActivity(a);
  }

  dispose(): void {
    for (const v of this.people) {
      if (v.state === 'ride' && v.ride) v.ride.rt.extraRiders.delete(v.seat);
      v.ch.root.removeFromParent();
      v.ch.dispose();
    }
    this.people.length = 0;
  }
}

function turn(from: number, to: number, k: number): number {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return from + d * Math.min(1, k);
}
