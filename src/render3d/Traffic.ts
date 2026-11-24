import * as THREE from 'three';
import { getFurniture, resolveColors } from '../catalog';
import type { FurnitureDef, WheelPart } from '../catalog/types';
import { ROAD_CELL, ROAD_SIDEWALK, type Vec2 } from '../model/types';
import { Character } from './Character';
import type { CharacterLook } from './characterTypes';
import type { WalkBox, WalkController } from './WalkController';
import { TRAFFIC_TYRES, type DriveIntent } from '../physics/drive';
import type { ImpactEvent, VehicleState, WalkPhysics } from '../physics/types';

const DIRS: [number, number][] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];
const key = (i: number, j: number) => `${i},${j}`;
const wrap = (a: number) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

interface Car {
  id: string;
  def: FurnitureDef;
  holder: THREE.Group;
  body: THREE.Object3D;
  cell: [number, number];
  dir: number;
  pos: Vec2;
  heading: number;
  speed: number;
  target: Vec2;
  box: WalkBox;
  honked: number;
  /** physics: seconds left standing still after being hit (hazard lights blink) */
  crashed: number;
  hazard: THREE.Group | null;
  intent: DriveIntent;
}

const hazardMaterial = new THREE.MeshBasicMaterial({ color: '#ffae1a', toneMapped: false });
const hazardGeometry = new THREE.SphereGeometry(0.075, 10, 8);

/** Four blinking orange lamps at the corners of a car (hazard lights after a crash). */
function makeHazards(def: FurnitureDef): THREE.Group {
  const g = new THREE.Group();
  const { w, d, h } = def.size;
  const y = Math.min(h * 0.5, 0.85);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const m = new THREE.Mesh(hazardGeometry, hazardMaterial);
      m.position.set(sx * (w / 2 - 0.12), y, sz * (d / 2 + 0.01));
      m.castShadow = false;
      g.add(m);
    }
  }
  g.visible = false;
  return g;
}

interface Walker {
  character: Character;
  pos: Vec2;
  heading: number;
  from: string;
  to: Vec2;
  toKey: string;
  speed: number;
  pause: number;
  greeted: number;
}

const CAR_COLORS = ['#c0392b', '#2f6f9f', '#e9e4d8', '#3d4a52', '#d9a441', '#5e8c6a', '#8e5aa8'];

/**
 * Life on the streets while walking around: a few cars that drive along the roads (keeping to the
 * right, turning at junctions, waiting for anyone in their way) and neighbors strolling on the
 * sidewalks. They are not part of the project – they appear wherever there are roads.
 */
export class Traffic {
  readonly group = new THREE.Group();
  /** obstacles for the walk world (kept up to date every frame) */
  readonly boxes: WalkBox[] = [];
  private cars: Car[] = [];
  private walkers: Walker[] = [];
  private roads = new Set<string>();
  private roadKey: unknown = null;
  private groundAt: (x: number, y: number) => number = () => 0;
  /** rigid bodies for the cars (null = they drive kinematically, as before the physics loaded) */
  private physics: WalkPhysics | null = null;
  private state: VehicleState = { x: 0, y: 0, z: 0, yaw: 0, vx: 0, vz: 0, yawRate: 0 };
  private hidden = false;
  private time = 0;
  private onImpact = (e: ImpactEvent): void => {
    if (e.kind !== 'traffic' || e.dv < 1.6) return;
    const car = this.cars.find((c) => c.id === e.id);
    // hit hard: it stops where it ends up, hazards on, for a while
    if (car) car.crashed = Math.max(car.crashed, 6 + Math.min(6, e.dv));
  };

  /** Give the cars rigid bodies (or take them away: null). */
  setPhysics(p: WalkPhysics | null): void {
    if (this.physics === p) return;
    if (this.physics) {
      this.physics.impacts.delete(this.onImpact);
      for (const c of this.cars) this.physics.removeTraffic(c.id);
    }
    this.physics = p;
    if (p) {
      p.impacts.add(this.onImpact);
      for (const c of this.cars) p.addTraffic(c.id, c.def, c.holder);
      this.hidden = false;
    }
    for (const c of this.cars) {
      c.crashed = 0;
      if (c.hazard) c.hazard.visible = false;
    }
  }

  /** Rebuild for a road layout. `looks` supplies appearances for the neighbors. */
  setRoads(roads: [number, number][], groundAt: (x: number, y: number) => number, looks: (seed: number) => CharacterLook | null): void {
    if (roads === this.roadKey) return;
    this.roadKey = roads;
    this.groundAt = groundAt;
    this.roads = new Set(roads.map(([i, j]) => key(i, j)));
    for (const c of this.cars) {
      this.group.remove(c.holder);
      this.physics?.removeTraffic(c.id);
    }
    for (const w of this.walkers) {
      this.group.remove(w.character.root);
      w.character.dispose();
    }
    this.cars = [];
    this.walkers = [];
    this.boxes.length = 0;
    if (roads.length < 6) return;

    // cars: one per ~14 road cells, at most 4
    const carCount = Math.min(4, Math.max(1, Math.floor(roads.length / 14)));
    const models = ['car-compact', 'car-family', 'car-compact', 'minibus'];
    for (let n = 0; n < carCount; n++) {
      const def = getFurniture(models[n % models.length]);
      if (!def?.vehicle) continue;
      const cell = roads[Math.floor(((n + 0.37) / carCount) * roads.length) % roads.length];
      const dir = this.exits(cell, -1)[0];
      if (dir === undefined) continue;
      const colors = resolveColors(def, def.vehicle.kind === 'bus' ? undefined : { body: CAR_COLORS[(n * 3 + 1) % CAR_COLORS.length] });
      const body = def.build({ colors });
      const holder = new THREE.Group();
      holder.add(body);
      holder.rotation.order = 'YXZ';
      this.group.add(holder);
      const start = this.lanePoint(cell, dir, 0.5);
      const hazard = makeHazards(def);
      holder.add(hazard);
      const heading = Math.atan2(DIRS[dir][0], DIRS[dir][1]);
      holder.position.set(start.x, groundAt(start.x, start.y), start.y);
      holder.rotation.y = heading;
      const car: Car = {
        id: `traffic-${n}`,
        def,
        holder,
        body,
        cell: [cell[0], cell[1]],
        dir,
        pos: start,
        heading,
        speed: 0,
        target: this.lanePoint(cell, dir, 1),
        box: { id: `traffic-${n}`, x: start.x, y: start.y, hw: def.size.w / 2, hd: def.size.d / 2, rotation: -heading, y0: 0, y1: def.size.h },
        honked: 0,
        crashed: 0,
        hazard,
        intent: { speed: 0, yawRate: 0, ...TRAFFIC_TYRES },
      };
      this.cars.push(car);
      this.physics?.addTraffic(car.id, def, holder);
      this.boxes.push(car.box);
    }

    // neighbors on the sidewalks
    const count = Math.min(6, Math.max(2, Math.floor(roads.length / 9)));
    for (let n = 0; n < count; n++) {
      const look = looks(n * 7 + 3);
      if (!look) break;
      const cell = roads[Math.floor(((n + 0.71) / count) * roads.length) % roads.length];
      const corner = n % 4;
      const character = new Character(look);
      this.group.add(character.root);
      const pos = this.corner(cell[0], cell[1], corner);
      const w: Walker = { character, pos: { ...pos }, heading: 0, from: '', to: pos, toKey: `${cell[0]},${cell[1]},${corner}`, speed: 1.1 + (n % 3) * 0.15, pause: n * 0.7, greeted: 0 };
      this.walkers.push(w);
    }
  }

  /** Directions a car in `cell` may take, never back the way it came unless it is a dead end. */
  private exits(cell: [number, number], from: number): number[] {
    const out: number[] = [];
    for (let d = 0; d < 4; d++) {
      if (d === (from + 2) % 4 && from >= 0) continue;
      if (this.roads.has(key(cell[0] + DIRS[d][0], cell[1] + DIRS[d][1]))) out.push(d);
    }
    if (!out.length && from >= 0 && this.roads.has(key(cell[0] + DIRS[(from + 2) % 4][0], cell[1] + DIRS[(from + 2) % 4][1]))) out.push((from + 2) % 4);
    return out;
  }

  /** A point in the right-hand lane of `cell` when travelling in direction `dir`; t = 0 centre … 1 the far edge. */
  private lanePoint(cell: [number, number], dir: number, t: number): Vec2 {
    const [dx, dy] = DIRS[dir];
    const cx = (cell[0] + 0.5) * ROAD_CELL;
    const cy = (cell[1] + 0.5) * ROAD_CELL;
    const lane = 1.5;
    // right of the travel direction (forward x up = right): (dx,dy) -> (-dy, dx)
    return { x: cx + dx * ROAD_CELL * 0.5 * t - dy * lane, y: cy + dy * ROAD_CELL * 0.5 * t + dx * lane };
  }

  /** Sidewalk corner n (0 NW, 1 NE, 2 SE, 3 SW) of a road cell. */
  private corner(i: number, j: number, n: number): Vec2 {
    const m = ROAD_SIDEWALK / 2;
    const x0 = i * ROAD_CELL + m;
    const x1 = (i + 1) * ROAD_CELL - m;
    const y0 = j * ROAD_CELL + m;
    const y1 = (j + 1) * ROAD_CELL - m;
    return [
      { x: x0, y: y0 },
      { x: x1, y: y0 },
      { x: x1, y: y1 },
      { x: x0, y: y1 },
    ][n];
  }

  /** Where a neighbor standing on a corner can go next. */
  private nextCorner(k: string, avoid: string): { key: string; pos: Vec2 } {
    const [i, j, n] = k.split(',').map(Number);
    const options: [number, number, number][] = [
      [i, j, (n + 1) % 4],
      [i, j, (n + 3) % 4],
    ];
    // the matching corner of the neighbouring road cells (continuous sidewalk)
    const west = n === 0 || n === 3;
    const north = n === 0 || n === 1;
    const ni = i + (west ? -1 : 1);
    const nj = j + (north ? -1 : 1);
    if (this.roads.has(key(ni, j))) options.push([ni, j, n === 0 ? 1 : n === 1 ? 0 : n === 2 ? 3 : 2]);
    if (this.roads.has(key(i, nj))) options.push([i, nj, n === 0 ? 3 : n === 3 ? 0 : n === 1 ? 2 : 1]);
    const usable = options.filter((o) => o.join(',') !== avoid);
    const pick = (usable.length ? usable : options)[Math.floor(Math.random() * (usable.length || options.length))];
    return { key: pick.join(','), pos: this.corner(pick[0], pick[1], pick[2]) };
  }

  /** move the 3D car (and its obstacle box) to where it is; spin the wheels */
  private place(car: Car, steer: number, dt: number): void {
    car.holder.position.set(car.pos.x, this.groundAt(car.pos.x, car.pos.y), car.pos.y);
    car.holder.rotation.y = car.heading;
    for (const w of (car.body.userData.wheels ?? []) as WheelPart[]) {
      w.spin.rotation.x += (car.speed * dt) / Math.max(0.05, w.radius);
      if (w.steer) w.steer.rotation.y = steer;
    }
    car.box.x = car.pos.x;
    car.box.y = car.pos.y;
    car.box.rotation = -car.heading;
  }

  /** After a crash: drive on from where it is, or – knocked off its lane and nobody watching – back onto it. */
  private recover(car: Car, me: Vec2): void {
    if (car.hazard) car.hazard.visible = false;
    const i = Math.floor(car.pos.x / ROAD_CELL);
    const j = Math.floor(car.pos.y / ROAD_CELL);
    const lane = this.lanePoint(car.cell, car.dir, 0);
    const [dx, dy] = DIRS[car.dir];
    const across = Math.abs((car.pos.x - lane.x) * dy - (car.pos.y - lane.y) * dx);
    const off = !this.roads.has(key(i, j)) || across > 2 || Math.abs(wrap(Math.atan2(dx, dy) - car.heading)) > 1;
    if (!off) return;
    if (Math.hypot(me.x - car.pos.x, me.y - car.pos.y) < 18) {
      car.crashed = 2; // still being looked at: wait a little longer
      return;
    }
    car.pos = { ...lane };
    car.heading = Math.atan2(dx, dy);
    car.speed = 0;
    car.target = this.lanePoint(car.cell, car.dir, 1);
    this.physics?.place(car.id, lane.x, this.groundAt(lane.x, lane.y), lane.y, car.heading, 0);
  }

  update(dt: number, walker: WalkController, onHonk: () => void): void {
    dt = Math.min(dt, 0.05);
    this.time += dt;
    const me = walker.pos;
    const phys = this.physics;
    const st = this.state;
    if (phys) {
      // a mini-game took the traffic off the streets: no bodies either
      const hidden = !this.group.visible;
      if (hidden !== this.hidden) {
        this.hidden = hidden;
        for (const c of this.cars) phys.setEnabled(c.id, !hidden);
      }
      if (hidden) return;
    }
    for (const car of this.cars) {
      if (phys && phys.read(car.id, st)) {
        car.pos.x = st.x;
        car.pos.y = st.z;
        car.heading = st.yaw;
        car.speed = st.vx * Math.sin(st.yaw) + st.vz * Math.cos(st.yaw);
      }
      if (phys && car.crashed > 0) {
        // hit: brakes on, hazard lights, then back to its lane
        car.crashed -= dt;
        phys.drive(car.id, null, this.groundAt(car.pos.x, car.pos.y));
        if (car.hazard) car.hazard.visible = car.crashed > 0 && Math.sin(this.time * Math.PI * 3) > 0;
        if (car.crashed <= 0) this.recover(car, me);
        this.place(car, 0, dt);
        continue;
      }
      // arrived at the edge of the cell: move on to the next one and choose where to go
      if (Math.hypot(car.target.x - car.pos.x, car.target.y - car.pos.y) < 1.2) {
        const next: [number, number] = [car.cell[0] + DIRS[car.dir][0], car.cell[1] + DIRS[car.dir][1]];
        if (this.roads.has(key(next[0], next[1]))) {
          car.cell = next;
          const exits = this.exits(next, car.dir);
          // prefer going straight, sometimes turn
          const straight = exits.includes(car.dir) && Math.random() < 0.6;
          car.dir = straight ? car.dir : (exits[Math.floor(Math.random() * exits.length)] ?? (car.dir + 2) % 4);
        } else car.dir = (car.dir + 2) % 4;
        car.target = this.lanePoint(car.cell, car.dir, 1);
      }
      // anything in the way? (the player, on foot or driving, and other cars)
      const fx = Math.sin(car.heading);
      const fy = Math.cos(car.heading);
      let blocked = false;
      const ahead = (p: Vec2, margin: number) => {
        const rx = p.x - car.pos.x;
        const ry = p.y - car.pos.y;
        const along = rx * fx + ry * fy;
        const across = Math.abs(-rx * fy + ry * fx);
        return along > 0 && along < 5 + car.speed * 0.9 + margin && across < 1.5 + margin * 0.3;
      };
      if (walker.y < 1 && ahead(me, walker.driving ? 1.5 : 0)) blocked = true;
      for (const other of this.cars) if (other !== car && ahead(other.pos, 2)) blocked = true;
      car.honked -= dt;
      if (blocked && car.speed < 0.3 && car.honked <= 0 && Math.hypot(me.x - car.pos.x, me.y - car.pos.y) < 7) {
        car.honked = 6;
        onHonk();
      }
      const cruise = Math.min(7, car.def.vehicle!.maxSpeed * 0.5);
      const want = wrap(Math.atan2(car.target.x - car.pos.x, car.target.y - car.pos.y) - car.heading);
      const targetSpeed = blocked ? 0 : cruise * (Math.abs(want) > 0.5 ? 0.5 : 1);
      car.speed += Math.max(-9 * dt, Math.min(2.5 * dt, targetSpeed - car.speed));
      const steer = Math.max(-0.5, Math.min(0.5, want));
      const yawRate = (car.speed / car.def.vehicle!.wheelbase) * Math.tan(steer) * 1.6;
      if (phys) {
        // the tyres push towards what the driver wants; the solver handles whoever is in the way
        car.intent.speed = car.speed;
        car.intent.yawRate = yawRate;
        phys.drive(car.id, car.intent, this.groundAt(car.pos.x, car.pos.y));
      } else {
        car.heading += yawRate * dt;
        car.pos.x += Math.sin(car.heading) * car.speed * dt;
        car.pos.y += Math.cos(car.heading) * car.speed * dt;
      }
      this.place(car, steer, dt);
    }

    for (const w of this.walkers) {
      const toMe = Math.hypot(me.x - w.pos.x, me.y - w.pos.y);
      w.greeted -= dt;
      let speed = 0;
      if (toMe < 2.6 && walker.y < 1 && !walker.driving && w.greeted <= 0) {
        // stop, turn to the player and wave
        w.greeted = 14;
        w.pause = 2.4;
        w.heading = Math.atan2(me.x - w.pos.x, me.y - w.pos.y);
        w.character.gesture('wave');
      }
      if (w.pause > 0) w.pause -= dt;
      else {
        const dx = w.to.x - w.pos.x;
        const dy = w.to.y - w.pos.y;
        const d = Math.hypot(dx, dy);
        if (d < 0.25) {
          const next = this.nextCorner(w.toKey, w.from);
          w.from = w.toKey;
          w.toKey = next.key;
          w.to = next.pos;
          if (Math.random() < 0.15) w.pause = 1 + Math.random() * 3;
        } else {
          speed = w.speed;
          w.heading += wrap(Math.atan2(dx, dy) - w.heading) * Math.min(1, dt * 6);
          w.pos.x += Math.sin(w.heading) * speed * dt;
          w.pos.y += Math.cos(w.heading) * speed * dt;
        }
      }
      w.character.root.position.set(w.pos.x, this.groundAt(w.pos.x, w.pos.y), w.pos.y);
      w.character.root.rotation.y = w.heading;
      // far away neighbors are not animated (and not drawn)
      const visible = toMe < 90;
      w.character.root.visible = visible;
      if (visible) w.character.update(dt, speed);
    }
  }
}
