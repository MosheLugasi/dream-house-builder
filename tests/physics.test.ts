import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { FURNITURE, getFurniture, itemSize } from '../src/catalog';
import type { FurnitureDef } from '../src/catalog/types';
import { applyDrive, applySkid, PLAYER_TYRES, yawOfQuat, type PlanarVelocity } from '../src/physics/drive';
import { overlapDepth, projectBox, type PlanBox } from '../src/physics/footprint';
import { bodyGroups, GROUP, inferMass, physicsProfile, PUSHABLE_MASS } from '../src/physics/profile';
import { crashLevel, crashPlan } from '../src/physics/feedback';
import type { ImpactEvent } from '../src/physics/types';
import { emptyWorld, type WalkBox, type WalkWorld } from '../src/render3d/WalkController';

const def = (id: string): FurnitureDef => {
  const d = getFurniture(id);
  if (!d) throw new Error(`no ${id}`);
  return d;
};
const profileOf = (id: string) => physicsProfile(def(id), def(id).size);

describe('physics profiles (inferred for every catalog item)', () => {
  it('gives every item a finite, sensible body', () => {
    const kinds: Record<string, number> = {};
    for (const d of FURNITURE) {
      const p = physicsProfile(d, itemSize(d, null));
      kinds[p.kind] = (kinds[p.kind] ?? 0) + 1;
      for (const v of [p.mass, p.hx, p.hy, p.hz, p.cx, p.cy, p.cz, p.friction, p.restitution]) expect(Number.isFinite(v)).toBe(true);
      if (p.kind === 'dynamic' || p.kind === 'anchored' || p.kind === 'vehicle') {
        expect(p.mass).toBeGreaterThan(0);
        expect(p.hx).toBeGreaterThan(0);
        expect(p.hy).toBeGreaterThan(0);
        expect(p.hz).toBeGreaterThan(0);
      }
      if (p.kind === 'anchored') expect(p.breakImpulse).toBeGreaterThan(0);
    }
    // a good share of the catalog moves, the big things stay put
    expect(kinds.dynamic).toBeGreaterThan(150);
    expect(kinds.static).toBeGreaterThan(100);
    expect(kinds.anchored).toBeGreaterThan(8);
    expect(kinds.vehicle).toBeGreaterThanOrEqual(8);
  });

  it('street furniture: lamp posts and signs are anchored, cones and bins fly, the walker shoves light things', () => {
    expect(profileOf('street-lamp').kind).toBe('anchored');
    expect(profileOf('stop-sign').kind).toBe('anchored');
    expect(profileOf('traffic-light').kind).toBe('anchored');
    // a hydrant takes a much harder hit than a sign
    expect(profileOf('fire-hydrant').breakImpulse).toBeGreaterThan(profileOf('stop-sign').breakImpulse * 3);
    const cone = profileOf('race-cone');
    expect(cone.kind).toBe('dynamic');
    expect(cone.pushable).toBe(true);
    expect(profileOf('trash-bin').pushable).toBe(true);
    const bench = profileOf('street-bench');
    expect(bench.kind).toBe('dynamic');
    expect(bench.pushable).toBe(false);
  });

  it('big and fixed things are static, trees only by their trunk', () => {
    for (const id of ['kiosk', 'bus-stop', 'fountain', 'fit-treadmill']) expect(profileOf(id).kind).toBe('static');
    const tree = profileOf('palm-tree');
    expect(tree.kind).toBe('static');
    expect(tree.hx).toBeLessThan(0.3);
  });

  it('rugs, wall and ceiling things, balls and pets have no body', () => {
    const ids = FURNITURE.filter((d) => d.walkable || d.mount === 'wall' || d.mount === 'ceiling' || d.pet || d.actions?.some((a) => a.kind === 'ball')).map((d) => d.id);
    expect(ids.length).toBeGreaterThan(10);
    for (const id of ids) expect(profileOf(id).kind).toBe('none');
  });

  it('vehicles: cars are heavy planar bodies floating over kerbs, bikes are light', () => {
    const car = profileOf('car-compact');
    expect(car.kind).toBe('vehicle');
    expect(car.planar).toBe(true);
    expect(car.mass).toBeGreaterThan(800);
    expect(car.cy - car.hy).toBeGreaterThan(0.15); // the body floats above 12 cm kerbs
    const bike = profileOf('bicycle');
    expect(bike.planar).toBe(false);
    expect(bike.mass).toBeLessThan(PUSHABLE_MASS);
  });

  it('mass grows with the size, and a resized item weighs accordingly', () => {
    const d = def('street-bench');
    expect(inferMass(d, { w: 3.6, d: 0.62, h: 0.84 })).toBeCloseTo(inferMass(d, d.size) * 2, 5);
  });

  it('anchored poles use a slim collider around the measured pole', () => {
    const p = physicsProfile(def('street-lamp'), def('street-lamp').size, { pole: { x: 0, z: -0.65, hw: 0.2, hd: 0.2 } });
    expect(p.cz).toBeCloseTo(-0.65);
    expect(p.hz).toBeLessThanOrEqual(0.25);
  });

  it('collision groups: the walker only touches light props; vehicles ignore the ground', () => {
    const member = (g: number) => g >>> 16;
    const filter = (g: number) => g & 0xffff;
    const light = bodyGroups(profileOf('race-cone'));
    const heavy = bodyGroups(profileOf('street-bench'));
    const car = bodyGroups(profileOf('car-compact'));
    expect(filter(light) & GROUP.WALKER).toBeTruthy();
    expect(filter(heavy) & GROUP.WALKER).toBeFalsy();
    expect(member(car)).toBe(GROUP.VEHICLE);
    expect(filter(car) & GROUP.GROUND).toBeFalsy();
    expect(filter(car) & (GROUP.LIGHT | GROUP.HEAVY | GROUP.STATIC | GROUP.VEHICLE)).toBe(GROUP.LIGHT | GROUP.HEAVY | GROUP.STATIC | GROUP.VEHICLE);
  });
});

describe('tyres', () => {
  it('follow the driver within their grip', () => {
    const v: PlanarVelocity = { vx: 0, vz: 0, w: 0 };
    const it = { speed: 10, yawRate: 0.5, ...PLAYER_TYRES };
    for (let i = 0; i < 120; i++) applyDrive(v, 0, it, 1 / 60);
    expect(v.vz).toBeCloseTo(10, 3);
    expect(v.vx).toBeCloseTo(0, 5);
    expect(v.w).toBeCloseTo(0.5, 5);
  });

  it('take a sideways slide out gradually (a crash spins and slides the car for a moment)', () => {
    const v: PlanarVelocity = { vx: 8, vz: 0, w: 3 };
    applyDrive(v, 0, { speed: 0, yawRate: 0, ...PLAYER_TYRES }, 1 / 60);
    expect(v.vx).toBeGreaterThan(7);
    expect(v.w).toBeLessThan(3);
    for (let i = 0; i < 120; i++) applyDrive(v, 0, { speed: 0, yawRate: 0, ...PLAYER_TYRES }, 1 / 60);
    expect(Math.abs(v.vx)).toBeLessThan(1e-6);
  });

  it('braked wheels skid to a stop', () => {
    const v: PlanarVelocity = { vx: 6, vz: 2, w: 1 };
    for (let i = 0; i < 120; i++) applySkid(v, 1 / 60);
    expect(Math.hypot(v.vx, v.vz)).toBe(0);
    expect(v.w).toBe(0);
  });

  it('read the yaw of a quaternion like rotation.y', () => {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 2.3, 0));
    expect(yawOfQuat(q.x, q.y, q.z, q.w)).toBeCloseTo(2.3, 6);
  });
});

describe('footprints', () => {
  it('an upright body projects to the walk-world box convention (rotation = −rotation.y)', () => {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.7, 0));
    const b = projectBox({ x: 1, y: 0, z: 2 }, q, { x: 0.9, y: 0.4, z: 0.3 }, { x: 0, y: 0.4, z: 0 }, {} as PlanBox);
    expect(b.x).toBeCloseTo(1);
    expect(b.y).toBeCloseTo(2);
    expect(b.hw).toBeCloseTo(0.9);
    expect(b.hd).toBeCloseTo(0.3);
    expect(b.rotation).toBeCloseTo(-0.7);
    expect(b.y0).toBeCloseTo(0);
    expect(b.y1).toBeCloseTo(0.8);
  });

  it('a fallen lamp post lies long and low', () => {
    // a 6 m pole knocked over towards +X
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -Math.PI / 2));
    const b = projectBox({ x: 0, y: 0.1, z: 0 }, q, { x: 0.1, y: 3, z: 0.1 }, { x: 0, y: 3, z: 0 }, {} as PlanBox);
    expect(Math.max(b.hw, b.hd)).toBeCloseTo(3, 4);
    expect(b.y1 - b.y0).toBeCloseTo(0.2, 4);
    expect(b.x).toBeCloseTo(3, 4);
  });

  it('measures overlaps (a chair under a table) and ignores touching boxes', () => {
    const a: PlanBox = { x: 0, y: 0, hw: 1, hd: 0.5, rotation: 0, y0: 0, y1: 0.8 };
    expect(overlapDepth(a, { x: 0.2, y: 0.6, hw: 0.25, hd: 0.25, rotation: 0.3, y0: 0, y1: 0.9 })).toBeGreaterThan(0.05);
    expect(overlapDepth(a, { x: 2, y: 0, hw: 1, hd: 0.5, rotation: 0, y0: 0, y1: 0.8 })).toBe(0);
    // stacked, not overlapping
    expect(overlapDepth(a, { ...a, y0: 0.8, y1: 1.2 })).toBe(0);
  });
});

describe('crash feedback', () => {
  const ev = (impulse: number, over: Partial<ImpactEvent> = {}): ImpactEvent => ({
    id: 'a',
    kind: 'player',
    otherId: null,
    otherKind: 'static',
    dv: impulse / 1200,
    impulse,
    x: 0,
    y: 0,
    z: 0,
    material: 'metal',
    otherMaterial: 'metal',
    mass: 1200,
    ...over,
  });
  it('scales with the impulse', () => {
    expect(crashLevel(10)).toBe(0);
    expect(crashLevel(500)).toBeLessThan(crashLevel(5000));
    expect(crashLevel(1e6)).toBe(1);
    const soft = crashPlan(ev(800));
    const hard = crashPlan(ev(14000));
    expect(hard.level).toBeGreaterThan(soft.level);
    expect(hard.sparks).toBeGreaterThan(soft.sparks);
    expect(hard.shake).toBeGreaterThan(soft.shake);
  });
  it('metal on metal sparks, wood splinters, nothing for a feather touch', () => {
    expect(crashPlan(ev(9000)).sparks).toBeGreaterThan(0);
    expect(crashPlan(ev(9000, { otherMaterial: 'wood', material: 'wood' })).sparks).toBe(0);
    expect(crashPlan(ev(9000, { otherMaterial: 'wood', material: 'wood' })).splinters).toBeGreaterThan(0);
    expect(crashPlan(ev(20)).level).toBe(0);
  });
});

// ---- the Rapier world itself (WebAssembly runs in Node too) ---------------------------------------

async function makeWorld() {
  const { createPhysics } = await import('../src/physics/world');
  const physics = await createPhysics();
  const scene = new THREE.Scene();
  const world: WalkWorld = emptyWorld();
  world.items = [];
  const place = (id: string, catalogId: string, x: number, z: number, rot = 0): THREE.Group => {
    const d = def(catalogId);
    const holder = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(d.size.w, d.size.h, d.size.d));
    body.position.y = d.size.h / 2;
    holder.add(body);
    holder.userData.body = body;
    holder.position.set(x, 0, z);
    holder.rotation.y = -rot;
    scene.add(holder);
    world.items!.push({ id, def: d, size: d.size, holder });
    world.boxes.push({ id, x, y: z, hw: d.size.w / 2, hd: d.size.d / 2, rotation: rot, y0: 0, y1: d.size.h } as WalkBox);
    if (d.vehicle) world.vehicles.push({ id, def: d, holder });
    return holder;
  };
  return { physics, scene, world, place };
}

/** drive the car straight along +Z at `speed` until `t` seconds pass; returns the speed left */
function driveFor(physics: Awaited<ReturnType<typeof makeWorld>>['physics'], id: string, speed: number, t: number): number {
  const st = { x: 0, y: 0, z: 0, yaw: 0, vx: 0, vz: 0, yawRate: 0 };
  let left = speed;
  physics.place(id, 0, 0, 0, 0, speed);
  for (let i = 0; i < Math.round(t * 60); i++) {
    physics.drive(id, { speed: left, yawRate: 0, ...PLAYER_TYRES }, 0);
    physics.step(1 / 60, { x: 50, y: 0, z: 50, active: false });
    physics.read(id, st);
    // the arcade controller reads the speed back every frame (a crash really costs speed)
    left = st.vx * Math.sin(st.yaw) + st.vz * Math.cos(st.yaw);
  }
  return left;
}

describe('rigid-body world (Rapier)', () => {
  it('a car sends a cone flying and barely slows down', async () => {
    const { physics, world, place } = await makeWorld();
    const car = place('car', 'car-compact', 0, 0);
    const cone = place('cone', 'race-cone', 0, 6);
    physics.setWorld(world);
    expect(physics.ensureVehicle({ id: 'car', def: def('car-compact'), holder: car })).toBe(true);
    physics.setDriven('car');
    const hits: ImpactEvent[] = [];
    physics.impacts.add((e) => hits.push(e));
    const left = driveFor(physics, 'car', 10, 1.2);
    expect(left).toBeGreaterThan(9);
    expect(physics.isDisplaced('cone')).toBe(true);
    expect(cone.position.z).toBeGreaterThan(8);
    expect(hits.some((e) => e.id === 'cone')).toBe(true);
    // reset puts it back exactly
    physics.resetAll();
    expect(cone.position.z).toBeCloseTo(6, 6);
    expect(cone.quaternion.angleTo(new THREE.Quaternion())).toBeCloseTo(0, 6);
    expect(physics.isDisplaced('cone')).toBe(false);
    physics.dispose();
  });

  it('a lamp post stands a gentle bump but topples when hit fast; the car keeps part of its speed', async () => {
    const { physics, world, place } = await makeWorld();
    const car = place('car', 'car-compact', 0, 0);
    place('lamp', 'street-lamp', 0, 6);
    physics.setWorld(world);
    physics.ensureVehicle({ id: 'car', def: def('car-compact'), holder: car });
    physics.setDriven('car');
    const slow = driveFor(physics, 'car', 2, 3);
    expect(physics.isBroken('lamp')).toBe(false);
    expect(Math.abs(slow)).toBeLessThan(1);
    const hits: ImpactEvent[] = [];
    physics.impacts.add((e) => hits.push(e));
    const fast = driveFor(physics, 'car', 12, 0.8);
    expect(physics.isBroken('lamp')).toBe(true);
    expect(fast).toBeGreaterThan(3);
    expect(fast).toBeLessThan(11.5);
    expect(hits.some((e) => e.broke)).toBe(true);
    physics.dispose();
  });

  it('a wall stops the car hard and it bounces a little', async () => {
    const { physics, world, place } = await makeWorld();
    const car = place('car', 'car-compact', 0, 0);
    world.walls.push({ a: { x: -5, y: 6 }, b: { x: 5, y: 6 }, half: 0.1, y0: 0, y1: 3 });
    physics.setWorld(world);
    physics.ensureVehicle({ id: 'car', def: def('car-compact'), holder: car });
    physics.setDriven('car');
    const hits: ImpactEvent[] = [];
    physics.impacts.add((e) => hits.push(e));
    const left = driveFor(physics, 'car', 10, 1);
    expect(left).toBeLessThan(0.5);
    const st = { x: 0, y: 0, z: 0, yaw: 0, vx: 0, vz: 0, yawRate: 0 };
    physics.read('car', st);
    expect(st.z).toBeLessThan(6 - 1.85 + 0.05);
    const hit = hits.find((e) => e.kind === 'player');
    expect(hit?.otherKind).toBe('static');
    expect(hit!.dv).toBeGreaterThan(8);
    physics.dispose();
  });

  it('a parked car of the same weight is shoved and both share the momentum', async () => {
    const { physics, world, place } = await makeWorld();
    const car = place('car', 'car-compact', 0, 0);
    const parked = place('parked', 'car-family', 0, 7);
    physics.setWorld(world);
    physics.ensureVehicle({ id: 'car', def: def('car-compact'), holder: car });
    physics.setDriven('car');
    const left = driveFor(physics, 'car', 10, 1.0);
    expect(left).toBeLessThan(8);
    expect(parked.position.z).toBeGreaterThan(7.5);
    physics.resetAll();
    expect(parked.position.z).toBeCloseTo(7, 6);
    physics.dispose();
  });

  it('the walker shoves a bin but not a bench', async () => {
    const { physics, world, place } = await makeWorld();
    const bin = place('bin', 'trash-bin', 0, 1);
    place('bench', 'street-bench', 3, 1);
    physics.setWorld(world);
    expect(physics.pushable.has('bin')).toBe(true);
    expect(physics.pushable.has('bench')).toBe(false);
    for (let i = 0; i < 90; i++) physics.step(1 / 60, { x: 0, y: 0, z: -0.5 + i * 0.025, active: true });
    expect(bin.position.z).toBeGreaterThan(1.2);
    physics.dispose();
  });

  it('props placed overlapping (a chair under a table) do not explode apart', async () => {
    const { physics, world, place } = await makeWorld();
    const table = place('table', 'cafe-table', 0, 0);
    const chair = place('chair', 'cafe-chair', 0.15, 0.1);
    physics.setWorld(world);
    for (let i = 0; i < 60; i++) physics.step(1 / 60, { x: 0.15, y: 0, z: 0.9, active: true });
    expect(table.position.distanceTo(new THREE.Vector3(0, 0, 0))).toBeLessThan(0.3);
    expect(chair.position.distanceTo(new THREE.Vector3(0.15, 0, 0.1))).toBeLessThan(0.6);
    physics.dispose();
  });
});
