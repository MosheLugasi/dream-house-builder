import RAPIER from '@dimforge/rapier3d-compat';
import type { Collider, RigidBody } from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { FurnitureDef } from '../catalog/types';
import type { WalkBox, WalkWorld } from '../render3d/WalkController';
import { surfaceTop } from '../render3d/walkSurfaces';
import { pointInPolygon } from '../model/geom';
import { applyDrive, applySkid, forwardSpeed, yawOfQuat, type DriveIntent, type PlanarVelocity } from './drive';
import { overlapDepth, projectBox, wallBox, type PlanBox } from './footprint';
import { bodyGroups, GROUP, groups, physicsProfile, type PhysicsProfile, type PhysMaterial } from './profile';
import type { ImpactEvent, ImpactKind, VehicleState, WalkerBody, WalkItem, WalkPhysics } from './types';

/**
 * The walk-mode rigid-body world (Rapier). Built from the walk world: walls, floors, sidewalks and the
 * solid boxes of static things become fixed colliders; small things, street furniture and vehicles
 * become bodies whose 3D holders are moved while they are simulated and put back afterwards (play
 * state – the project is never written). Vehicles are planar bodies (they slide and spin, never roll
 * over) driven through `drive.ts`; anchored things (lamp posts, signs) stand fixed until a hit is hard
 * enough to break them loose.
 *
 * Per frame (`step`, called by the walk controller between the driver's intent and its read-back):
 * sync the fixed boxes of the walk world and the holders moved from outside → sub-steps of ≤ 1/60 s
 * (tyres → solver → contact forces → anchored things breaking loose → vehicle hits) → write the
 * holders of moving bodies and the walk-world boxes back → impact events.
 */

/** longest physics sub-step (s) and how many sub-steps one frame may take */
const STEP = 1 / 60;
const MAX_SUBSTEPS = 4;
/** a velocity change (m/s) of a vehicle body in one sub-step beyond what its tyres did = a hit */
const HIT_DV = 0.9;
/** displaced props far away from the player for this long (s) go back to their places */
const AWAY_RESET = 25;
const AWAY_DIST = 45;

type Role = 'prop' | 'vehicle' | 'traffic';

interface Rec {
  id: string;
  role: Role;
  def: FurnitureDef;
  profile: PhysicsProfile;
  /** collider half extents and centre (body frame) */
  he: { x: number; y: number; z: number };
  c: { x: number; y: number; z: number };
  body: RigidBody;
  collider: Collider;
  holder: THREE.Object3D | null;
  /** world → holder parent (null = the parent is the world) */
  parentInv: THREE.Matrix4 | null;
  /** the walk world's box of the item, kept in step with the body */
  box: WalkBox | null;
  /** holder's local pose at rest */
  homePos: THREE.Vector3;
  homeQuat: THREE.Quaternion;
  /** world pose at rest */
  worldPos: THREE.Vector3;
  worldQuat: THREE.Quaternion;
  /** anchored and still standing (a fixed body) */
  standing: boolean;
  broken: boolean;
  displaced: boolean;
  /** holder local x / z last written by the physics (detects moves made by somebody else) */
  wx: number;
  wz: number;
  intent: DriveIntent | null;
  air: PlanarVelocity | null;
  /** planar bodies: height of the body origin */
  y: number;
  /** velocity after the tyres, before the solver (hits) */
  pre: PlanarVelocity;
  enabled: boolean;
  away: number;
  /** strongest hit of this frame */
  hit: ImpactEvent | null;
  /** anchored: contact impulse taken this frame, and from whom */
  load: number;
  loadFrom: Rec | null;
  loadX: number;
  loadY: number;
  loadZ: number;
  driven: boolean;
  /** made for a placed item of the walk world (else: a mini-game vehicle or the traffic) */
  fromItem: boolean;
}

let poleCache = new Map<string, { x: number; z: number; hw: number; hd: number } | null>();

/** Where the pole of a tall thin item stands: the extent of its geometry near the ground (holder-local). */
function measurePole(holder: THREE.Object3D, key: string): { x: number; z: number; hw: number; hd: number } | null {
  if (poleCache.has(key)) return poleCache.get(key)!;
  if (poleCache.size > 200) poleCache = new Map();
  holder.updateWorldMatrix(true, true);
  const inv = new THREE.Matrix4().copy(holder.matrixWorld).invert();
  const m = new THREE.Matrix4();
  const v = new THREE.Vector3();
  const box = new THREE.Box3();
  holder.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry?.attributes.position) return;
    m.multiplyMatrices(inv, mesh.matrixWorld);
    const pos = mesh.geometry.attributes.position;
    const n = Math.min(pos.count, 20000);
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m);
      if (v.y > 0.08 && v.y < 0.7) box.expandByPoint(v);
    }
  });
  const out = box.isEmpty() ? null : { x: (box.min.x + box.max.x) / 2, z: (box.min.z + box.max.z) / 2, hw: (box.max.x - box.min.x) / 2, hd: (box.max.z - box.min.z) / 2 };
  poleCache.set(key, out);
  return out;
}

let ready: Promise<void> | null = null;

/** Load Rapier's WebAssembly (once) and make a world. */
export async function createPhysics(): Promise<PhysicsWorld> {
  ready ??= RAPIER.init();
  await ready;
  return new PhysicsWorld();
}

export class PhysicsWorld implements WalkPhysics {
  private world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  private queue = new RAPIER.EventQueue(true);
  private recs = new Map<string, Rec>();
  private byCollider = new Map<number, Rec>();
  private byBody = new Map<number, Rec>();
  private planar: Rec[] = [];
  private staticColliders: Collider[] = [];
  private boxColliders = new Map<WalkBox, BoxEntry>();
  /** fixed boxes of the previous walk world, reused by content when the world is rebuilt */
  private boxPool = new Map<string, BoxEntry>();
  private staticKey = '';
  private stamp = 0;
  /** ids whose walk-world boxes are simulated bodies (not fixed colliders) */
  private owned = new Set<string>();
  private walkWorld: WalkWorld | null = null;
  private walker: RigidBody;
  private walkerPrev = new THREE.Vector3();
  private walkerNow = new THREE.Vector3();
  private walkerOn = false;
  private drivenId: string | null = null;
  private awayTimer = 0;
  /**
   * Bodies just created / put back. They go to sleep once resting (a body created asleep would fall
   * through its floor when woken: it has no contacts yet). One that only settled a few centimetres
   * (placed a little above the ground) takes the settled pose as its home.
   */
  private settle: Rec[] = [];
  private settleFrames = 0;
  private colliderOwner = new Map<number, string>();
  /** pairs that overlapped where they were placed: they never collide (a chair tucked under a table) */
  private ignore = new Map<number, Set<number>>();
  readonly pushable = new Set<string>();
  readonly impacts = new Set<(e: ImpactEvent) => void>();
  /** the time of the simulation (s) */
  time = 0;
  // scratch
  private v3 = new THREE.Vector3();
  private q3 = new THREE.Quaternion();
  private m4 = new THREE.Matrix4();
  private one = new THREE.Vector3(1, 1, 1);
  private tv = { x: 0, y: 0, z: 0 };
  private tq = { x: 0, y: 0, z: 0, w: 1 };
  private vel: PlanarVelocity = { vx: 0, vz: 0, w: 0 };
  private plan: PlanBox = { x: 0, y: 0, hw: 0, hd: 0, rotation: 0, y0: 0, y1: 0 };
  private sp = { x: 0, y: 0, z: 0 };
  private sq = { x: 0, y: 0, z: 0, w: 1 };
  private sv = { x: 0, y: 0, z: 0 };
  private sw = { x: 0, y: 0, z: 0 };
  private bp = { x: 0, y: 0, z: 0 };
  private bq = { x: 0, y: 0, z: 0, w: 1 };
  private zero = { x: 0, y: 0, z: 0 };
  private hooks = {
    filterContactPair: (c1: number, c2: number): RAPIER.SolverFlags | null =>
      this.ignore.get(c1)?.has(c2) || this.ignore.get(c2)?.has(c1) ? null : RAPIER.SolverFlags.COMPUTE_IMPULSE,
    filterIntersectionPair: (): boolean => true,
  };

  constructor() {
    const ground = RAPIER.ColliderDesc.cuboid(4000, 1, 4000).setTranslation(0, -1, 0).setFriction(0.8);
    ground.setCollisionGroups(groups(GROUP.GROUND, GROUP.LIGHT | GROUP.HEAVY));
    this.world.createCollider(ground);
    const wb = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, -100, 0);
    this.walker = this.world.createRigidBody(wb);
    const cap = RAPIER.ColliderDesc.capsule(0.45, 0.22).setTranslation(0, 0.72, 0).setFriction(0.3);
    cap.setCollisionGroups(groups(GROUP.WALKER, GROUP.LIGHT));
    this.world.createCollider(cap, this.walker);
  }

  // ---- building ------------------------------------------------------------------------------

  /** Rebuild the fixed colliders for a walk world and reconcile the bodies (moved props stay moved). */
  setWorld(w: WalkWorld): void {
    this.walkWorld = w;
    // the walk world is rebuilt often (vehicles parked, buildings furnished as you come near): keep
    // what did not change – the walls / floors / sidewalks, and the fixed boxes (matched by content)
    this.boxPool.clear();
    for (const [b, e] of this.boxColliders) this.boxPool.set(boxKey(b), e);
    this.boxColliders.clear();
    const key = staticKey(w);
    if (key !== this.staticKey) this.buildStatic(w, key);

    // bodies: reconcile with the items of the new world
    const boxesById = new Map<string, WalkBox[]>();
    for (const b of w.boxes) {
      if (b.id === undefined) continue;
      const list = boxesById.get(b.id);
      if (list) list.push(b);
      else boxesById.set(b.id, [b]);
    }
    const keep = new Set<string>();
    const fresh: Rec[] = [];
    for (const item of w.items ?? []) {
      if (!item.holder) continue;
      const old = this.recs.get(item.id);
      if (old && old.holder === item.holder && old.def === item.def) {
        keep.add(item.id);
        this.attachBox(old, boxesById.get(item.id));
        continue;
      }
      if (old) this.remove(old, true);
      const rec = this.createFromItem(item, w);
      if (rec) {
        keep.add(item.id);
        fresh.push(rec);
        this.attachBox(rec, boxesById.get(item.id));
      }
    }
    for (const v of w.vehicles) {
      if (this.recs.has(v.id)) keep.add(v.id);
    }
    for (const rec of [...this.recs.values()]) {
      // mini-game vehicles are added to each new walk world later by their game: they stay
      if (!rec.fromItem || keep.has(rec.id)) continue;
      this.remove(rec, true);
    }
    this.syncBoxes();
    for (const e of this.boxPool.values()) {
      this.colliderOwner.delete(e.col.handle);
      this.world.removeCollider(e.col, false);
    }
    this.boxPool.clear();
    if (fresh.length) this.findOverlaps(w, fresh);
  }

  private buildStatic(w: WalkWorld, key: string): void {
    this.staticKey = key;
    for (const c of this.staticColliders) {
      this.colliderOwner.delete(c.handle);
      this.world.removeCollider(c, false);
    }
    this.staticColliders = [];
    const addFixed = (desc: RAPIER.ColliderDesc, member: number, filter: number, owner?: string): Collider => {
      desc.setCollisionGroups(groups(member, filter));
      const c = this.world.createCollider(desc);
      this.staticColliders.push(c);
      if (owner) this.colliderOwner.set(c.handle, owner);
      return c;
    };
    const solid = GROUP.LIGHT | GROUP.HEAVY | GROUP.VEHICLE;
    // walls of the buildings (stair entries are open)
    for (const wall of w.walls) {
      if (wall.openY !== undefined) continue;
      const dx = wall.b.x - wall.a.x;
      const dy = wall.b.y - wall.a.y;
      const len = Math.hypot(dx, dy);
      if (len < 1e-3) continue;
      const th = Math.atan2(-dy, dx);
      const desc = RAPIER.ColliderDesc.cuboid(len / 2 + wall.half * 0.5, (wall.y1 - wall.y0) / 2, wall.half)
        .setTranslation((wall.a.x + wall.b.x) / 2, (wall.y0 + wall.y1) / 2, (wall.a.y + wall.b.y) / 2)
        .setRotation({ x: 0, y: Math.sin(th / 2), z: 0, w: Math.cos(th / 2) })
        .setFriction(0.5)
        .setRestitution(0.15);
      addFixed(desc, GROUP.STATIC, solid);
    }
    // raised ground (sidewalks): props stand on them, vehicles roll over them (their bodies float)
    for (const [x0, y0, x1, y1, top] of w.raised ?? []) {
      const desc = RAPIER.ColliderDesc.cuboid((x1 - x0) / 2, top / 2, (y1 - y0) / 2).setTranslation((x0 + x1) / 2, top / 2, (y0 + y1) / 2).setFriction(0.8);
      addFixed(desc, GROUP.GROUND, GROUP.LIGHT | GROUP.HEAVY);
    }
    // floors of every storey (indoor props fall onto them)
    for (const floors of w.floors) {
      for (const lv of floors.levels) {
        const verts: number[] = [];
        const idx: number[] = [];
        for (const poly of lv.rooms) {
          if (poly.length < 3) continue;
          const contour = poly.map((p) => new THREE.Vector2(p.x, p.y));
          let tris: number[][];
          try {
            // (may drop a duplicated end point of `contour`: the indices refer to it, not to `poly`)
            tris = THREE.ShapeUtils.triangulateShape(contour, []);
          } catch {
            continue;
          }
          const base = verts.length / 3;
          for (const p of contour) verts.push(p.x, lv.y, p.y);
          // every triangle faces up (+Y)
          for (const [i0, i1, i2] of tris) {
            const a = contour[i0];
            const b = contour[i1];
            const c = contour[i2];
            const ny = (b.y - a.y) * (c.x - a.x) - (b.x - a.x) * (c.y - a.y);
            if (ny >= 0) idx.push(base + i0, base + i1, base + i2);
            else idx.push(base + i0, base + i2, base + i1);
          }
        }
        if (!idx.length || lv.y < 0.02) continue;
        const desc = RAPIER.ColliderDesc.trimesh(new Float32Array(verts), new Uint32Array(idx)).setFriction(0.7);
        addFixed(desc, GROUP.GROUND, GROUP.LIGHT | GROUP.HEAVY);
      }
    }
  }

  private attachBox(rec: Rec, boxes: WalkBox[] | undefined): void {
    rec.box = boxes && boxes.length === 1 ? boxes[0] : null;
    if (rec.box && rec.displaced) this.updateBox(rec);
  }

  private createFromItem(item: WalkItem, w: WalkWorld): Rec | null {
    const def = item.def;
    const surface = w.surfaceOwners?.has(item.id) ?? false;
    const opts = { surface, multiBox: item.multiBox, noFootprint: item.noFootprint };
    let profile = physicsProfile(def, item.size, opts);
    if (profile.kind === 'anchored' && item.holder) {
      const key = `${def.id}|${item.size.w},${item.size.d},${item.size.h}|${item.holder.userData.body?.scale?.x < 0 ? 1 : 0}`;
      const pole = measurePole(item.holder, key);
      if (pole) profile = physicsProfile(def, item.size, { ...opts, pole });
    }
    if (profile.kind === 'none' || profile.kind === 'static') return null;
    const make = () => {
      const rec = this.create(item.id, profile.kind === 'vehicle' ? 'vehicle' : 'prop', def, profile, item.holder!);
      rec.fromItem = true;
      return rec;
    };
    // standing on a ramp, a stage or a platform (standable surfaces have no colliders): it stays there
    if (w.surfaces?.length && profile.kind !== 'vehicle') {
      item.holder!.getWorldPosition(this.v3);
      const top = surfaceTop(w.surfaces, this.v3.x, this.v3.z, this.v3.y + 0.05);
      if (top && top.h > w.groundAt(this.v3.x, this.v3.z) + 0.05) return null;
    }
    return make();
  }

  private create(id: string, role: Role, def: FurnitureDef, profile: PhysicsProfile, holder: THREE.Object3D): Rec {
    holder.updateWorldMatrix(true, false);
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    holder.matrixWorld.decompose(pos, quat, this.v3);
    const planar = profile.planar;
    const anchored = profile.kind === 'anchored';
    let desc: RAPIER.RigidBodyDesc;
    if (anchored) desc = RAPIER.RigidBodyDesc.fixed();
    else {
      // created awake: a body created asleep falls through its floor when woken (no contacts yet);
      // it is put to sleep after its first step instead (see `settle`)
      desc = RAPIER.RigidBodyDesc.dynamic().setLinearDamping(profile.linearDamping).setAngularDamping(profile.angularDamping);
      if (planar) {
        desc.enabledTranslations(true, false, true).enabledRotations(false, true, false);
        // planar bodies stand upright on the ground
        const yaw = yawOfQuat(quat.x, quat.y, quat.z, quat.w);
        quat.set(0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2));
      }
    }
    desc.setTranslation(pos.x, pos.y, pos.z).setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w });
    const body = this.world.createRigidBody(desc);
    const cd = (planar ? RAPIER.ColliderDesc.roundCuboid(Math.max(0.05, profile.hx - 0.08), Math.max(0.05, profile.hy - 0.08), Math.max(0.05, profile.hz - 0.08), 0.08) : RAPIER.ColliderDesc.cuboid(Math.max(0.02, profile.hx), Math.max(0.02, profile.hy), Math.max(0.02, profile.hz)))
      .setTranslation(profile.cx, profile.cy, profile.cz)
      .setMass(Math.max(0.3, profile.mass))
      .setFriction(profile.friction)
      .setRestitution(profile.restitution)
      .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
      // an impulse of ~1 m/s × mass within one step reports (sounds); anchored: a fraction of the break impulse
      .setContactForceEventThreshold(anchored ? profile.breakImpulse * 0.12 * 60 : Math.max(30, profile.mass * 1.2 * 60));
    cd.setCollisionGroups(bodyGroups(profile));
    const collider = this.world.createCollider(cd, body);
    // anything knocked about may fly fast: continuous collision keeps thin things (a fallen pole) out of walls
    if (profile.kind !== 'vehicle') body.enableCcd(true);
    const parent = holder.parent;
    let parentInv: THREE.Matrix4 | null = null;
    if (parent) {
      parent.updateWorldMatrix(true, false);
      if (!isIdentity(parent.matrixWorld)) parentInv = new THREE.Matrix4().copy(parent.matrixWorld).invert();
    }
    const rec: Rec = {
      id,
      role,
      def,
      profile,
      he: { x: profile.hx, y: profile.hy, z: profile.hz },
      c: { x: profile.cx, y: profile.cy, z: profile.cz },
      body,
      collider,
      holder,
      parentInv,
      box: null,
      homePos: holder.position.clone(),
      homeQuat: holder.quaternion.clone(),
      worldPos: pos,
      worldQuat: quat,
      standing: anchored,
      broken: false,
      displaced: false,
      wx: holder.position.x,
      wz: holder.position.z,
      intent: null,
      air: null,
      y: pos.y,
      pre: { vx: 0, vz: 0, w: 0 },
      enabled: true,
      away: 0,
      hit: null,
      load: 0,
      loadFrom: null,
      loadX: 0,
      loadY: 0,
      loadZ: 0,
      driven: false,
      fromItem: false,
    };
    this.recs.set(id, rec);
    if (!anchored && role !== 'traffic') this.settle.push(rec);
    this.byCollider.set(collider.handle, rec);
    this.byBody.set(body.handle, rec);
    if (planar) this.planar.push(rec);
    if (role !== 'traffic') this.owned.add(id);
    if (profile.pushable) this.pushable.add(id);
    return rec;
  }

  private remove(rec: Rec, restore: boolean): void {
    if (restore && !rec.driven) this.restoreHolder(rec);
    this.byCollider.delete(rec.collider.handle);
    this.ignore.delete(rec.collider.handle);
    this.byBody.delete(rec.body.handle);
    this.world.removeRigidBody(rec.body);
    this.recs.delete(rec.id);
    this.owned.delete(rec.id);
    this.pushable.delete(rec.id);
    const i = this.planar.indexOf(rec);
    if (i >= 0) this.planar.splice(i, 1);
    if (this.drivenId === rec.id) this.drivenId = null;
  }

  /** fixed colliders for every solid box of the walk world that is not a simulated body */
  private syncBoxes(): void {
    const w = this.walkWorld;
    if (!w) return;
    const stamp = ++this.stamp;
    const skip = w.surfaceOwners;
    for (const b of w.boxes) {
      if (b.id !== undefined && (this.owned.has(b.id) || this.recs.has(b.id) || skip?.has(b.id))) continue;
      let e = this.boxColliders.get(b);
      if (!e && this.boxPool.size) {
        const k = boxKey(b);
        e = this.boxPool.get(k);
        if (e) {
          this.boxPool.delete(k);
          this.boxColliders.set(b, e);
        }
      }
      if (!e) {
        const desc = RAPIER.ColliderDesc.cuboid(Math.max(0.02, b.hw), Math.max(0.02, (b.y1 - b.y0) / 2), Math.max(0.02, b.hd)).setFriction(0.6).setRestitution(0.15);
        desc.setCollisionGroups(groups(GROUP.STATIC, GROUP.LIGHT | GROUP.HEAVY | GROUP.VEHICLE));
        const col = this.world.createCollider(desc);
        e = { col, x: NaN, y: NaN, r: NaN, stamp };
        this.boxColliders.set(b, e);
        if (b.id) this.colliderOwner.set(col.handle, b.id);
      }
      e.stamp = stamp;
      if (e.x !== b.x || e.y !== b.y || e.r !== b.rotation) {
        e.x = b.x;
        e.y = b.y;
        e.r = b.rotation;
        this.tv.x = b.x;
        this.tv.y = (b.y0 + b.y1) / 2;
        this.tv.z = b.y;
        e.col.setTranslation(this.tv);
        this.tq.x = 0;
        this.tq.y = Math.sin(-b.rotation / 2);
        this.tq.z = 0;
        this.tq.w = Math.cos(-b.rotation / 2);
        e.col.setRotation(this.tq);
      }
    }
    for (const [b, e] of this.boxColliders) {
      if (e.stamp === stamp) continue;
      this.colliderOwner.delete(e.col.handle);
      this.world.removeCollider(e.col, false);
      this.boxColliders.delete(b);
    }
  }

  /** bodies placed overlapping something would be shot apart: let those pairs pass through each other */
  private findOverlaps(w: WalkWorld, fresh: Rec[]): void {
    // new bodies first (only they are checked against everything); things already knocked about are
    // not "placed" anywhere: they collide normally
    const isNew = new Set(fresh);
    const others = [...this.recs.values()].filter((r) => !isNew.has(r) && r.role !== 'traffic' && r.body.isEnabled() && !r.displaced);
    const recs = [...fresh.filter((r) => r.body.isEnabled()), ...others];
    const nFresh = recs.length - others.length;
    const boxOf = (r: Rec): PlanBox => {
      const b = { x: 0, y: 0, hw: 0, hd: 0, rotation: 0, y0: 0, y1: 0 };
      const p = r.body.translation();
      const q = r.body.rotation();
      projectBox(p, q, r.he, r.c, b);
      // touching is fine, only real overlaps count
      b.hw -= 0.03;
      b.hd -= 0.03;
      b.y0 += 0.02;
      b.y1 -= 0.02;
      return b;
    };
    const boxes = recs.map(boxOf);
    const fixedToo = new Set<Rec>();
    const pair = (a: number, b: number) => {
      let s = this.ignore.get(a);
      if (!s) this.ignore.set(a, (s = new Set()));
      s.add(b);
    };
    const flag = (c: Collider) => c.setActiveHooks(RAPIER.ActiveHooks.FILTER_CONTACT_PAIRS);
    const near = (a: PlanBox, b: PlanBox) => Math.abs(a.x - b.x) < a.hw + a.hd + b.hw + b.hd && Math.abs(a.y - b.y) < a.hw + a.hd + b.hw + b.hd;
    for (let i = 0; i < nFresh; i++) {
      const a = boxes[i];
      for (let j = i + 1; j < recs.length; j++) {
        const b = boxes[j];
        if (!near(a, b) || overlapDepth(a, b) <= 0.02) continue;
        pair(recs[i].collider.handle, recs[j].collider.handle);
        flag(recs[i].collider);
        flag(recs[j].collider);
      }
      for (const box of this.boxColliders.keys()) {
        // standing in a piece of fixed scenery (a DJ booth on a stage): part of the scenery as well
        if (near(a, box) && overlapDepth(a, box) > 0.02) fixedToo.add(recs[i]);
      }
    }
    // nothing under it (placed floating, or on a stage the walk world has no box for): it stays put
    for (let i = 0; i < nFresh; i++) if (!fixedToo.has(recs[i]) && !this.supported(recs[i], boxes[i], w)) fixedToo.add(recs[i]);
    if (fixedToo.size) {
      for (const r of fixedToo) {
        if (r.role === 'vehicle') continue;
        this.remove(r, true);
      }
      this.syncBoxes();
    }
    // walls only matter for props standing in them (rare): let those through as well
    if (!recs.length) return;
    const wallCols = this.staticColliders.filter((c) => c.collisionGroups() >>> 16 === GROUP.STATIC);
    let k = 0;
    for (const wall of w.walls) {
      if (wall.openY !== undefined) continue;
      if (Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y) < 1e-3) continue;
      const col = wallCols[k++];
      if (!col) break;
      const wb = wallBox(wall.a, wall.b, wall.half, wall.y0, wall.y1);
      for (let i = 0; i < nFresh; i++) {
        if (fixedToo.has(recs[i]) || !near(boxes[i], wb) || overlapDepth(boxes[i], wb) <= 0.02) continue;
        pair(recs[i].collider.handle, col.handle);
        flag(recs[i].collider);
      }
    }
  }

  /** something holds the body up where it was placed: the ground, a sidewalk, a floor, a box under it */
  private supported(r: Rec, b: PlanBox, w: WalkWorld): boolean {
    const bottom = b.y0 - 0.02;
    const x = b.x;
    const z = b.y;
    if (Math.abs(bottom - w.groundAt(x, z)) < 0.08 || bottom < 0.08) return true;
    for (const f of w.floors) for (const lv of f.levels) if (Math.abs(lv.y - bottom) < 0.08 && lv.rooms.some((poly) => pointInPolygon({ x, y: z }, poly))) return true;
    for (const box of w.boxes) {
      if (box.id === r.id || Math.abs(box.y1 - bottom) > 0.1) continue;
      const c = Math.cos(-box.rotation);
      const sn = Math.sin(-box.rotation);
      const lx = (x - box.x) * c - (z - box.y) * sn;
      const lz = (x - box.x) * sn + (z - box.y) * c;
      if (Math.abs(lx) <= box.hw + 0.05 && Math.abs(lz) <= box.hd + 0.05) return true;
    }
    return false;
  }

  // ---- vehicles & traffic --------------------------------------------------------------------

  ensureVehicle(v: { id: string; def: FurnitureDef; holder: THREE.Object3D }): boolean {
    const rec = this.recs.get(v.id);
    if (rec && rec.holder === v.holder) return true;
    if (rec) this.remove(rec, false);
    if (!v.def.vehicle) return false;
    const size = v.def.size;
    const profile = physicsProfile(v.def, size);
    if (profile.kind !== 'vehicle') return false;
    this.create(v.id, 'vehicle', v.def, profile, v.holder);
    return true;
  }

  setDriven(id: string | null): void {
    if (this.drivenId === id) return;
    const prev = this.drivenId ? this.recs.get(this.drivenId) : null;
    if (prev) {
      prev.driven = false;
      prev.intent = null;
      prev.air = null;
      prev.body.enableCcd(!prev.profile.planar);
      if (!prev.profile.planar) {
        // two-wheelers become ordinary props again (they can fall over)
        prev.body.setEnabledTranslations(true, true, true, true);
        prev.body.setEnabledRotations(true, true, true, true);
        prev.collider.setCollisionGroups(bodyGroups(prev.profile));
        const i = this.planar.indexOf(prev);
        if (i >= 0) this.planar.splice(i, 1);
      }
    }
    this.drivenId = id;
    const rec = id ? this.recs.get(id) : null;
    if (!rec) return;
    rec.driven = true;
    rec.displaced = true;
    rec.body.enableCcd(true);
    if (!rec.profile.planar) {
      // ridden two-wheelers stay upright like the cars
      const p = rec.body.translation();
      const q = rec.body.rotation();
      const yaw = yawOfQuat(q.x, q.y, q.z, q.w);
      rec.body.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true);
      rec.body.setTranslation({ x: p.x, y: rec.holder?.position.y ?? p.y, z: p.z }, true);
      rec.body.setEnabledTranslations(true, false, true, true);
      rec.body.setEnabledRotations(false, true, false, true);
      rec.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      rec.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      rec.collider.setCollisionGroups(bodyGroups(rec.profile, true));
      if (!this.planar.includes(rec)) this.planar.push(rec);
    }
    rec.body.wakeUp();
  }

  drive(id: string, intent: DriveIntent | null, y: number): void {
    const rec = this.recs.get(id);
    if (!rec) return;
    rec.intent = intent;
    rec.air = null;
    rec.y = y;
    if (intent && rec.body.isSleeping() && (Math.abs(intent.speed) > 0.01 || Math.abs(intent.yawRate) > 0.01)) rec.body.wakeUp();
  }

  fly(id: string, vx: number, vz: number, yawRate: number, y: number): void {
    const rec = this.recs.get(id);
    if (!rec) return;
    rec.air = rec.air ?? { vx: 0, vz: 0, w: 0 };
    rec.air.vx = vx;
    rec.air.vz = vz;
    rec.air.w = yawRate;
    rec.y = y;
    rec.body.wakeUp();
  }

  read(id: string, out: VehicleState): boolean {
    const rec = this.recs.get(id);
    if (!rec) return false;
    const p = rec.body.translation();
    const q = rec.body.rotation();
    const v = rec.body.linvel();
    out.x = p.x;
    out.y = rec.profile.planar || rec.driven ? rec.y : p.y;
    out.z = p.z;
    out.yaw = yawOfQuat(q.x, q.y, q.z, q.w);
    out.vx = v.x;
    out.vz = v.z;
    out.yawRate = rec.body.angvel().y;
    return true;
  }

  place(id: string, x: number, y: number, z: number, yaw: number, speed = 0): void {
    const rec = this.recs.get(id);
    if (!rec) return;
    rec.y = y;
    rec.body.setTranslation({ x, y, z }, true);
    rec.body.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true);
    rec.body.setLinvel({ x: Math.sin(yaw) * speed, y: 0, z: Math.cos(yaw) * speed }, true);
    rec.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    if (rec.holder) {
      rec.wx = rec.holder.position.x;
      rec.wz = rec.holder.position.z;
    }
  }

  setSpeed(id: string, speed: number): void {
    const rec = this.recs.get(id);
    if (!rec) return;
    const q = rec.body.rotation();
    const yaw = yawOfQuat(q.x, q.y, q.z, q.w);
    rec.body.setLinvel({ x: Math.sin(yaw) * speed, y: 0, z: Math.cos(yaw) * speed }, true);
  }

  park(id: string): void {
    const rec = this.recs.get(id);
    if (!rec?.holder) return;
    // the parked place is saved into the project: it is the new home
    rec.holder.updateWorldMatrix(true, false);
    rec.holder.matrixWorld.decompose(rec.worldPos, rec.worldQuat, this.v3);
    rec.homePos.copy(rec.holder.position);
    rec.homeQuat.copy(rec.holder.quaternion);
    rec.wx = rec.holder.position.x;
    rec.wz = rec.holder.position.z;
    rec.displaced = false;
    rec.body.setLinvel({ x: 0, y: 0, z: 0 }, false);
    rec.body.setAngvel({ x: 0, y: 0, z: 0 }, false);
  }

  addTraffic(id: string, def: FurnitureDef, holder: THREE.Object3D): void {
    const old = this.recs.get(id);
    if (old) this.remove(old, false);
    const profile = physicsProfile(def, def.size);
    if (profile.kind !== 'vehicle') return;
    const rec = this.create(id, 'traffic', def, { ...profile, planar: true }, holder);
    rec.body.wakeUp();
  }

  removeTraffic(id: string): void {
    const rec = this.recs.get(id);
    if (rec?.role === 'traffic') this.remove(rec, false);
  }

  setEnabled(id: string, on: boolean): void {
    const rec = this.recs.get(id);
    if (!rec || rec.enabled === on) return;
    rec.enabled = on;
    rec.body.setEnabled(on);
  }

  isDisplaced(id: string): boolean {
    const r = this.recs.get(id);
    if (!r?.displaced) return false;
    // nudged a little (a chair pushed by the walker) still counts as in place
    const p = r.body.translation(this.bp);
    const q = r.body.rotation(this.bq);
    this.q3.set(q.x, q.y, q.z, q.w);
    return Math.hypot(p.x - r.worldPos.x, p.y - r.worldPos.y, p.z - r.worldPos.z) > 0.3 || this.q3.angleTo(r.worldQuat) > 0.35;
  }

  /** an anchored thing that was knocked loose (lamp posts stop shining) */
  isBroken(id: string): boolean {
    return this.recs.get(id)?.broken ?? false;
  }

  // ---- stepping ------------------------------------------------------------------------------

  step(dt: number, walker: WalkerBody): void {
    if (!(dt > 0)) return;
    dt = Math.min(dt, STEP * MAX_SUBSTEPS);
    const n = Math.max(1, Math.ceil(dt / STEP - 1e-6));
    const h = dt / n;
    this.syncBoxes();
    this.syncRecords();

    // the walker shoves light props: a kinematic capsule following the feet
    this.walkerPrev.copy(this.walkerNow);
    this.walkerNow.set(walker.x, walker.y, walker.z);
    if (walker.active !== this.walkerOn || this.walkerPrev.distanceToSquared(this.walkerNow) > 4) {
      this.walkerOn = walker.active;
      this.walkerPrev.copy(this.walkerNow);
      this.walker.setTranslation(walker.active ? this.walkerNow : { x: 0, y: -100, z: 0 }, false);
    }

    for (const r of this.recs.values()) {
      r.hit = null;
      r.load = 0;
      r.loadFrom = null;
    }
    this.world.timestep = h;
    for (let i = 0; i < n; i++) {
      this.applyTyres(h);
      if (this.walkerOn) {
        const t = (i + 1) / n;
        this.tv.x = this.walkerPrev.x + (this.walkerNow.x - this.walkerPrev.x) * t;
        this.tv.y = this.walkerPrev.y + (this.walkerNow.y - this.walkerPrev.y) * t;
        this.tv.z = this.walkerPrev.z + (this.walkerNow.z - this.walkerPrev.z) * t;
        this.walker.setNextKinematicTranslation(this.tv);
      }
      this.world.step(this.queue, this.hooks as unknown as RAPIER.PhysicsHooks);
      this.time += h;
      this.collectForces(h);
      this.breakLoose();
      this.collectHits();
    }
    this.writeBack();
    if (this.settle.length) this.settleDown();
    this.awayTimer -= dt;
    if (this.awayTimer <= 0) {
      this.awayTimer = 1;
      this.resetFarAway(walker);
    }
    this.emit();
  }

  private settleDown(): void {
    const last = ++this.settleFrames > 30;
    let keep = 0;
    for (const r of this.settle) {
      if (r.driven || !this.recs.has(r.id) || !r.holder) continue;
      const v = r.body.linvel(this.sv);
      const w = r.body.angvel(this.sw);
      const resting = Math.abs(v.x) + Math.abs(v.y) + Math.abs(v.z) + Math.abs(w.x) + Math.abs(w.y) + Math.abs(w.z) < 0.04;
      if (!resting && !last) {
        this.settle[keep++] = r;
        continue;
      }
      const p = r.body.translation(this.sp);
      const q = r.body.rotation(this.sq);
      this.q3.set(q.x, q.y, q.z, q.w);
      const near = Math.abs(p.x - r.worldPos.x) < 0.06 && Math.abs(p.z - r.worldPos.z) < 0.06 && p.y - r.worldPos.y < 0.02 && r.worldPos.y - p.y < 0.6 && this.q3.angleTo(r.worldQuat) < 0.05;
      if (resting && near && r.displaced) {
        // it only settled onto what is under it (placed a little above the ground or a platform): that is where it stands
        r.worldPos.set(p.x, p.y, p.z);
        r.worldQuat.copy(this.q3);
        r.homePos.copy(r.holder.position);
        r.homeQuat.copy(r.holder.quaternion);
        r.y = p.y;
        r.displaced = false;
      }
      if (resting) r.body.sleep();
    }
    this.settle.length = keep;
    if (!keep) this.settleFrames = 0;
  }

  /** holders moved by somebody else (project edits, games), hidden holders, and planar heights */
  private syncRecords(): void {
    for (const r of this.recs.values()) {
      const h = r.holder;
      if (!h || r.role === 'traffic') continue;
      if (!r.fromItem && !h.parent && !r.driven) {
        // a mini-game vehicle whose round is over
        this.remove(r, false);
        continue;
      }
      const visible = h.visible && !!h.parent;
      if (visible !== r.enabled) {
        r.enabled = visible;
        r.body.setEnabled(visible);
      }
      if (!visible || r.driven) continue;
      if (Math.abs(h.position.x - r.wx) > 0.01 || Math.abs(h.position.z - r.wz) > 0.01) {
        // moved from outside: that is its new place
        h.updateWorldMatrix(true, false);
        h.matrixWorld.decompose(r.worldPos, r.worldQuat, this.v3);
        if (r.profile.planar) {
          const yaw = yawOfQuat(r.worldQuat.x, r.worldQuat.y, r.worldQuat.z, r.worldQuat.w);
          r.worldQuat.set(0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2));
        }
        r.homePos.copy(h.position);
        r.homeQuat.copy(h.quaternion);
        r.y = r.worldPos.y;
        r.wx = h.position.x;
        r.wz = h.position.z;
        r.displaced = false;
        if (r.standing === false && r.profile.kind === 'anchored') {
          r.body.setBodyType(RAPIER.RigidBodyType.Fixed, false);
          r.standing = true;
          r.broken = false;
        }
        r.body.setTranslation(r.worldPos, true);
        r.body.setRotation(r.worldQuat, true);
        r.body.setLinvel(this.zero, true);
        r.body.setAngvel(this.zero, true);
        if (!r.standing && !this.settle.includes(r)) this.settle.push(r);
        if (r.box) this.updateBox(r);
      }
    }
  }

  private applyTyres(h: number): void {
    const v = this.vel;
    const ground = this.walkWorld?.groundAt;
    for (const r of this.planar) {
      if (!r.enabled) continue;
      const b = r.body;
      const sleeping = b.isSleeping();
      if (sleeping && !r.intent && !r.air) continue;
      const lv = b.linvel(this.sv);
      const av = b.angvel(this.sw);
      v.vx = lv.x;
      v.vz = lv.z;
      v.w = av.y;
      const q = b.rotation(this.sq);
      const yaw = yawOfQuat(q.x, q.y, q.z, q.w);
      if (r.air) {
        v.vx = r.air.vx;
        v.vz = r.air.vz;
        v.w = r.air.w;
      } else if (r.intent) applyDrive(v, yaw, r.intent, h);
      else applySkid(v, h);
      this.tv.x = v.vx;
      this.tv.y = 0;
      this.tv.z = v.vz;
      b.setLinvel(this.tv, false);
      this.tv.x = 0;
      this.tv.y = v.w;
      this.tv.z = 0;
      b.setAngvel(this.tv, false);
      r.pre.vx = v.vx;
      r.pre.vz = v.vz;
      r.pre.w = v.w;
      // planar bodies ride at their height (the driver's surfaces, or the ground under parked / traffic cars)
      const p = b.translation(this.sp);
      const want = r.driven || r.intent || r.air ? r.y : ground ? ground(p.x, p.z) : p.y;
      if (Math.abs(p.y - want) > 1e-3) {
        this.tv.x = p.x;
        this.tv.y = want;
        this.tv.z = p.z;
        b.setTranslation(this.tv, false);
      }
    }
  }

  private collectForces(h: number): void {
    this.queue.drainContactForceEvents((e) => {
      const a = this.byCollider.get(e.collider1()) ?? null;
      const b = this.byCollider.get(e.collider2()) ?? null;
      const impulse = e.totalForceMagnitude() * h;
      for (const [self, other, otherCol] of [
        [a, b, e.collider2()],
        [b, a, e.collider1()],
      ] as const) {
        if (!self) continue;
        if (self.standing) {
          // an anchored thing takes the load; whoever pushed hardest may break it
          if (!other || other.standing) continue;
          self.load += impulse;
          self.loadFrom = other;
          const p = other.body.translation();
          self.loadX = p.x;
          self.loadY = p.y + other.profile.cy;
          self.loadZ = p.z;
          continue;
        }
        if (self.profile.planar || self.driven) continue; // vehicles are judged by their velocity change
        const dv = impulse / Math.max(0.5, self.profile.mass);
        if (dv < 1.2 || (self.hit && self.hit.dv >= dv)) continue;
        const p = self.body.translation();
        self.hit = this.event(self, other, otherCol, dv, impulse, p.x, p.y + self.profile.cy, p.z);
      }
    });
  }

  /** anchored things hit hard enough topple; the hitter keeps part of its speed */
  private breakLoose(): void {
    for (const r of this.recs.values()) {
      if (!r.standing || r.load < r.profile.breakImpulse) continue;
      r.standing = false;
      r.broken = true;
      r.displaced = true;
      r.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
      r.body.setLinearDamping(r.profile.linearDamping);
      r.body.setAngularDamping(r.profile.angularDamping);
      r.body.recomputeMassPropertiesFromColliders();
      const hitter = r.loadFrom;
      const p = r.body.translation();
      let dx = p.x - r.loadX;
      let dz = p.z - r.loadZ;
      let speed = 0;
      if (hitter && (hitter.profile.planar || hitter.driven)) {
        speed = Math.hypot(hitter.pre.vx, hitter.pre.vz);
        if (speed > 0.5) {
          dx = hitter.pre.vx;
          dz = hitter.pre.vz;
        }
        // breaking it costs the hitter some momentum; the rest it keeps (it was stopped dead by the fixed body)
        const transferred = r.profile.mass * speed * 1.1 + r.profile.breakImpulse * 0.3;
        const keep = speed > 0 ? Math.max(0, speed - transferred / Math.max(1, hitter.profile.mass)) / speed : 0;
        this.tv.x = hitter.pre.vx * keep;
        this.tv.y = 0;
        this.tv.z = hitter.pre.vz * keep;
        hitter.body.setLinvel(this.tv, true);
        speed *= keep;
        const ev = this.event(hitter, r, r.collider.handle, Math.hypot(hitter.pre.vx, hitter.pre.vz) * (1 - keep), r.load, r.loadX, r.loadY, r.loadZ);
        ev.broke = true;
        if (!hitter.hit || hitter.hit.dv <= ev.dv) hitter.hit = ev;
      } else if (hitter) {
        const v = hitter.body.linvel();
        speed = Math.hypot(v.x, v.z);
      }
      const len = Math.hypot(dx, dz) || 1;
      const ux = dx / len;
      const uz = dz / len;

      if (hitter) {
        // the hitter rolls on over the foot instead of bulldozing the falling pole along (or squeezing it
        // through a wall): those two never touch again
        let set = this.ignore.get(r.collider.handle);
        if (!set) this.ignore.set(r.collider.handle, (set = new Set()));
        set.add(hitter.collider.handle);
        r.collider.setActiveHooks(RAPIER.ActiveHooks.FILTER_CONTACT_PAIRS);
      }
      // knocked over away from the hitter, pivoting about its foot: it turns about ω = up × dir and its
      // centre of mass (at height cy) moves forward at ω·cy
      const spin = Math.min(1.8, 0.7 + speed * 0.09);
      this.tv.x = uz * spin;
      this.tv.y = 0;
      this.tv.z = -ux * spin;
      r.body.setAngvel(this.tv, true);
      const lift = spin * r.profile.cy;
      this.tv.x = ux * lift;
      this.tv.y = 0;
      this.tv.z = uz * lift;
      r.body.setLinvel(this.tv, true);
      const ev = this.event(r, hitter, hitter?.collider.handle ?? -1, speed, r.load, r.loadX, r.loadY, r.loadZ);
      ev.broke = true;
      r.hit = ev;
    }
  }

  /** vehicles: a velocity change their tyres did not make is a hit */
  private collectHits(): void {
    for (const r of this.planar) {
      if (!r.enabled || r.body.isSleeping()) continue;
      const v = r.body.linvel(this.sv);
      const dv = Math.hypot(v.x - r.pre.vx, v.z - r.pre.vz);
      if (dv < HIT_DV || (r.hit && r.hit.dv >= dv)) continue;
      // who was it?
      let other: Rec | null = null;
      let otherCol = -1;
      let best = 0;
      let px = 0;
      let py = 0;
      let pz = 0;
      this.world.contactPairsWith(r.collider, (c2) => {
        let imp = 0;
        this.world.contactPair(r.collider, c2, (m) => {
          const k = m.numSolverContacts();
          for (let i = 0; i < m.numContacts(); i++) imp += m.contactImpulse(i);
          if (imp > best && k > 0) {
            const pt = m.solverContactPoint(0);
            if (pt) {
              px = pt.x;
              py = pt.y;
              pz = pt.z;
            }
          }
        });
        if (imp > best) {
          best = imp;
          other = this.byCollider.get(c2.handle) ?? null;
          otherCol = c2.handle;
        }
      });
      if (best <= 0) {
        const p = r.body.translation();
        px = p.x;
        py = p.y + r.profile.cy;
        pz = p.z;
      }
      const o = other as Rec | null;
      if (o && o.profile.pushable && !o.profile.planar && r.profile.mass > o.profile.mass * 4) {
        // a light thing (a bin pinned against a wall, a cone) never stops a car: it gets shoved aside
        this.tv.x = r.pre.vx * 0.97;
        this.tv.y = 0;
        this.tv.z = r.pre.vz * 0.97;
        r.body.setLinvel(this.tv, true);
        this.tv.x = 0;
        this.tv.y = r.pre.w;
        this.tv.z = 0;
        r.body.setAngvel(this.tv, true);
        continue;
      }
      r.hit = this.event(r, other, otherCol, dv, dv * r.profile.mass, px, py, pz);
    }
  }

  private kindOf(r: Rec): ImpactKind {
    return r.driven ? 'player' : r.role === 'traffic' ? 'traffic' : r.role === 'vehicle' ? 'vehicle' : 'prop';
  }

  private event(self: Rec, other: Rec | null, otherCol: number, dv: number, impulse: number, x: number, y: number, z: number): ImpactEvent {
    const otherId = other?.id ?? this.colliderOwner.get(otherCol) ?? null;
    return {
      id: self.id,
      kind: this.kindOf(self),
      otherId,
      otherKind: other ? this.kindOf(other) : otherCol >= 0 ? 'static' : null,
      dv,
      impulse,
      x,
      y,
      z,
      material: self.profile.material,
      otherMaterial: other?.profile.material ?? 'stone',
      mass: self.profile.mass,
    };
  }

  private emit(): void {
    if (!this.impacts.size) return;
    for (const r of this.recs.values()) {
      const e = r.hit;
      if (!e) continue;
      r.hit = null;
      for (const fn of this.impacts) {
        try {
          fn(e);
        } catch (err) {
          console.error('impact listener failed', err);
        }
      }
    }
  }

  /** the holders of moving bodies follow them; the walk world's boxes too */
  private writeBack(): void {
    this.world.forEachActiveRigidBody((b) => {
      const r = this.byBody.get(b.handle);
      if (!r || !r.holder) return;
      if (r.box) this.updateBox(r);
      if (r.driven || r.role === 'traffic') return;
      const p = b.translation(this.sp);
      const q = b.rotation(this.sq);
      this.v3.set(p.x, p.y, p.z);
      this.q3.set(q.x, q.y, q.z, q.w);
      const h = r.holder;
      if (r.parentInv) {
        this.m4.compose(this.v3, this.q3, this.one).premultiply(r.parentInv);
        this.m4.decompose(h.position, h.quaternion, this.v3);
      } else if (r.profile.planar) {
        // a pure turn about +Y: keep the Euler angles clean whatever their order (vehicles use 'YXZ')
        h.position.copy(this.v3);
        h.rotation.set(0, yawOfQuat(q.x, q.y, q.z, q.w), 0);
      } else {
        h.position.copy(this.v3);
        h.quaternion.copy(this.q3);
      }
      r.wx = h.position.x;
      r.wz = h.position.z;
      if (!r.displaced && (h.position.distanceToSquared(r.homePos) > 0.03 * 0.03 || h.quaternion.angleTo(r.homeQuat) > 0.04)) r.displaced = true;
    });
  }

  private updateBox(r: Rec): void {
    const box = r.box!;
    const pr = r.profile;
    const p = r.body.translation(this.bp);
    const q = r.body.rotation(this.bq);
    projectBox(p, q, r.he, r.c, this.plan);
    box.x = this.plan.x;
    box.y = this.plan.y;
    box.hw = this.plan.hw;
    box.hd = this.plan.hd;
    box.rotation = this.plan.rotation;
    // vehicles keep their full height (their collider floats above the ground)
    box.y0 = pr.kind === 'vehicle' ? p.y : this.plan.y0;
    box.y1 = this.plan.y1;
  }

  private resetFarAway(walker: WalkerBody): void {
    for (const r of this.recs.values()) {
      if (!r.displaced || r.driven || r.role === 'traffic') continue;
      const p = r.body.translation();
      const far = Math.hypot(p.x - walker.x, p.z - walker.z) > AWAY_DIST && Math.hypot(r.worldPos.x - walker.x, r.worldPos.z - walker.z) > AWAY_DIST;
      r.away = far ? r.away + 1 : 0;
      if (r.away > AWAY_RESET) this.resetRec(r);
    }
  }

  private resetRec(r: Rec): void {
    r.away = 0;
    if (r.profile.kind === 'anchored' && !r.standing) {
      r.body.setBodyType(RAPIER.RigidBodyType.Fixed, false);
      r.standing = true;
    }
    r.broken = false;
    r.body.setTranslation(r.worldPos, false);
    r.body.setRotation(r.worldQuat, false);
    if (!r.standing) {
      r.body.setLinvel(this.zero, false);
      r.body.setAngvel(this.zero, false);
      r.body.wakeUp();
      this.settle.push(r);
    }
    r.y = r.worldPos.y;
    this.restoreHolder(r);
    if (r.box) this.updateBox(r);
  }

  private restoreHolder(r: Rec): void {
    r.displaced = false;
    const h = r.holder;
    if (!h) return;
    h.position.copy(r.homePos);
    h.quaternion.copy(r.homeQuat);
    r.wx = h.position.x;
    r.wz = h.position.z;
  }

  resetAll(): void {
    for (const r of this.recs.values()) {
      if (r.role === 'traffic' || r.driven) continue;
      this.resetRec(r);
    }
  }

  dispose(): void {
    for (const r of this.recs.values()) if (r.role !== 'traffic') this.restoreHolder(r);
    this.recs.clear();
    this.byBody.clear();
    this.byCollider.clear();
    this.planar = [];
    this.boxColliders.clear();
    this.impacts.clear();
    this.world.free();
    this.queue.free();
  }
}

interface BoxEntry {
  col: Collider;
  x: number;
  y: number;
  r: number;
  stamp: number;
}

const r3 = (v: number) => Math.round(v * 1000);
const boxKey = (b: WalkBox) => `${b.id ?? ''}|${r3(b.x)}|${r3(b.y)}|${r3(b.hw)}|${r3(b.hd)}|${r3(b.rotation)}|${r3(b.y0)}|${r3(b.y1)}`;

/** Content of the walk world's walls, floors and raised ground (rebuild the fixed colliders only when it changes). */
function staticKey(w: WalkWorld): string {
  const parts: number[] = [];
  for (const wall of w.walls) if (wall.openY === undefined) parts.push(r3(wall.a.x), r3(wall.a.y), r3(wall.b.x), r3(wall.b.y), r3(wall.half), r3(wall.y0), r3(wall.y1));
  parts.push(-1);
  for (const f of w.floors) for (const lv of f.levels) {
    parts.push(r3(lv.y));
    for (const poly of lv.rooms) for (const p of poly) parts.push(r3(p.x), r3(p.y));
  }
  parts.push(-2);
  for (const r of w.raised ?? []) parts.push(...r.map(r3));
  return parts.join(',');
}

function isIdentity(m: THREE.Matrix4): boolean {
  const e = m.elements;
  for (let i = 0; i < 16; i++) if (Math.abs(e[i] - (i % 5 === 0 ? 1 : 0)) > 1e-9) return false;
  return true;
}

export type { PhysMaterial };
