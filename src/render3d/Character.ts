import * as THREE from 'three';

import {
  DEFAULT_LOOK,
  type Activity,
  type BodyType,
  type CharacterLook,
  type CharacterMotion,
  type Gesture,
  type HairStyle,
  type LegacyLook,
  type Pose,
  type Prop,
} from './characterTypes';
import { Animator } from './character/animator';
import { type BodyBuild, acquireBuild, releaseBuild } from './character/assemble';
import { B, BONE_COUNT, SLOTS } from './character/builder';
import { acquireMaterials, releaseMaterials } from './character/materials';
import { type PropParts, buildProp, disposeProp } from './character/props';
import { specOf } from './character/spec';

export { DEFAULT_LOOK } from './characterTypes';
export type { Activity, CharacterLook, CharacterMotion, Gesture, HairStyle, LegacyLook, Pose, Prop } from './characterTypes';

const HAIR_STYLES: HairStyle[] = ['ponytail', 'short', 'long', 'bun', 'curly', 'braids', 'bald'];

/**
 * Accept any saved / legacy appearance and return a complete `CharacterLook`.
 * The legacy shape is `{ height, skin, hair, shirt, pants, shoes, longHair, hairStyle?, skirt?, glasses? }`.
 */
export function normalizeLook(input: Partial<CharacterLook> | Partial<LegacyLook> | null | undefined): CharacterLook {
  if (!input || typeof input !== 'object') return { ...DEFAULT_LOOK };
  const any = input as Partial<CharacterLook> & Partial<LegacyLook>;
  // saved legacy data may have been merged over the new defaults: legacy keys win then
  const legacy = 'shirt' in any || 'pants' in any || 'longHair' in any;
  if (typeof any.body === 'string' && !legacy) {
    const look = { ...DEFAULT_LOOK, ...(any as Partial<CharacterLook>) };
    if (!HAIR_STYLES.includes(look.hairStyle)) look.hairStyle = DEFAULT_LOOK.hairStyle;
    return look;
  }
  const hairStyle: HairStyle = any.hairStyle && HAIR_STYLES.includes(any.hairStyle) ? any.hairStyle : any.longHair === false ? 'short' : 'ponytail';
  const height = typeof any.height === 'number' && Number.isFinite(any.height) ? THREE.MathUtils.clamp(any.height, 1.0, 2.1) : undefined;
  const feminine = !!any.skirt || hairStyle === 'ponytail' || hairStyle === 'long' || hairStyle === 'bun' || hairStyle === 'braids';
  const child = height === undefined || height < 1.56;
  const body: BodyType = child ? (feminine ? 'girl' : 'boy') : feminine ? 'woman' : 'man';
  const look: CharacterLook = {
    body,
    skin: any.skin ?? DEFAULT_LOOK.skin,
    hair: any.hair ?? DEFAULT_LOOK.hair,
    hairStyle,
    top: any.shirt ?? DEFAULT_LOOK.top,
    topStyle: 'tshirt',
    bottom: any.pants ?? DEFAULT_LOOK.bottom,
    bottomStyle: any.skirt ? 'skirt' : 'pants',
    shoes: any.shoes ?? DEFAULT_LOOK.shoes,
    accessory: any.glasses ? 'glasses' : 'none',
  };
  if (height !== undefined) look.height = height;
  return look;
}


/**
 * A procedurally built, skinned and animated person. Origin at the feet, facing +Z.
 *
 * One `SkinnedMesh` (≤ 9 material groups) over a 30-bone rig. Geometry is cached per body type + styles and
 * materials per colour, so many characters (neighbours) stay cheap. See `character/animator.ts` for the motion.
 */
export class Character {
  readonly root = new THREE.Group();
  /** eye level above the feet when standing */
  eyeHeight = 1.3;
  /** called at every heel strike while walking / running (for footstep sounds) */
  onFootstep?: (foot: 'left' | 'right') => void;
  /** extra vertical offset of the body applied by the game (jumps, trampolines, standing on equipment) */
  lift = 0;

  private look: CharacterLook;
  private build!: BodyBuild;
  private mesh!: THREE.SkinnedMesh;
  /** carries `lift`, the flip rotation and the height scale */
  private rig = new THREE.Group();
  private bones: THREE.Bone[] = [];
  private anim!: Animator;
  private scale = 1;
  private prop: Prop = 'none';
  private propParts: PropParts = { right: null, left: null, chest: null };
  private disposed = false;

  constructor(look: CharacterLook | LegacyLook = DEFAULT_LOOK) {
    this.look = normalizeLook(look);
    this.root.name = 'character';
    this.root.add(this.rig);
    this.rebuild();
  }

  /** hold on to a handlebar while standing (kick scooter) */
  get reach(): boolean {
    return this.anim.reach;
  }
  set reach(v: boolean) {
    this.anim.reach = v;
  }

  /** 0..1 position in the walk cycle (0 = left heel strike, 0.5 = right heel strike) */
  get gaitPhase(): number {
    return this.anim.gaitPhase;
  }

  /**
   * Optional: crank angle (radians) of the bicycle being ridden, so the feet follow the real pedals.
   * Leave `null` to let the character pedal in proportion to its speed.
   */
  get pedalAngle(): number | null {
    return this.anim.pedalAngle;
  }
  set pedalAngle(a: number | null) {
    this.anim.pedalAngle = a;
  }

  getLook(): CharacterLook {
    return { ...this.look };
  }

  /** Rebuild the appearance in place (same `root`, motion state kept). Legacy looks are converted. */
  setLook(look: CharacterLook | LegacyLook): void {
    const old = this.look;
    this.look = normalizeLook(look);
    this.teardown(old);
    this.rebuild();
  }

  setPose(pose: Pose, seatHeight = 0.45): void {
    this.anim.pose = pose;
    this.anim.seatHeight = seatHeight / this.scale;
  }

  getPose(): Pose {
    return this.anim.pose;
  }

  getActivity(): Activity {
    return this.anim.activity;
  }

  /** Start an activity (one-shot ones return to the previous looping activity afterwards). */
  setActivity(a: Activity): void {
    this.anim.setActivity(a);
  }

  /** trigger a hit (instrument key, drum…) on a side: -1 right, 1 left, 0 both */
  strike(side = 0): void {
    this.anim.strike(side);
  }

  /** One-shot upper-body animation blended over the current pose. */
  gesture(g: Gesture): void {
    this.anim.gesture(g);
  }

  /** world position of the right hand (palm) */
  handWorld(out = new THREE.Vector3()): THREE.Vector3 {
    this.root.updateMatrixWorld(true);
    return this.bones[B.handR].localToWorld(out.set(0.02, -0.07 * (this.build.spec.hand / 0.186), 0));
  }

  /** world position of the middle of the head */
  headWorld(out = new THREE.Vector3()): THREE.Vector3 {
    this.root.updateMatrixWorld(true);
    const u = this.build.spec.headH;
    return this.bones[B.head].localToWorld(out.set(0, 0.36 * u, 0.07 * u));
  }

  setProp(p: Prop): void {
    this.prop = p;
    disposeProp(this.propParts);
    const s = this.build.spec;
    const k = s.H / 1.78;
    const chestFront = s.torso[6][2] + 0.01 * k;
    const parts = buildProp(p, k, chestFront);
    const u = s.hand / 0.186;
    for (const [obj, bone, side] of [[parts.right, B.handR, -1], [parts.left, B.handL, 1]] as [THREE.Object3D | null, number, number][]) {
      if (!obj) continue;
      // grip frame → hand bone: up = thumb side (+Z), forward = along the fingers (−Y); the grip is in front of the palm
      const holder = new THREE.Group();
      holder.position.set(-side * 0.03 * u, -0.078 * u, 0.004 * u);
      holder.rotation.x = Math.PI / 2;
      // the left hand mirrors the right one
      if (side > 0) holder.scale.x = -1;
      holder.add(obj);
      this.bones[bone].add(holder);
      if (obj === parts.right) parts.right = holder;
      else parts.left = holder;
    }
    if (parts.chest) this.bones[B.chest].add(parts.chest);
    this.propParts = parts;
  }

  getProp(): Prop {
    return this.prop;
  }

  /**
   * Advance the animation. `speed` in m/s (0 = idle). `motion` is optional: without it, jumps are derived
   * from `lift` while the activity is 'jump' / 'bounce' / 'flip'.
   */
  update(dt: number, speed: number, motion?: CharacterMotion): void {
    const sc = this.scale;
    this.anim.lift = this.lift / sc;
    this.anim.update(dt, speed / sc, motion);
    // lift + flip (about the middle of the body)
    const flip = this.anim.flipAngle;
    const rig = this.rig;
    if (flip !== 0) {
      const c = this.build.spec.hipY * sc;
      rig.rotation.x = flip;
      rig.position.set(0, this.lift + c - Math.cos(flip) * c, -Math.sin(flip) * c);
    } else {
      rig.rotation.x = 0;
      rig.position.set(0, this.lift, 0);
    }
  }

  /** Triangles / material groups of the current look (for budgets and debugging). */
  get stats(): { triangles: number; drawCalls: number; bones: number; height: number } {
    return { triangles: this.build.triangles, drawCalls: this.build.geometry.groups.length, bones: BONE_COUNT, height: this.build.spec.H * this.scale };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    disposeProp(this.propParts);
    this.teardown(this.look);
  }

  private teardown(look: CharacterLook): void {
    if (!this.mesh) return;
    disposeProp(this.propParts);
    this.propParts = { right: null, left: null, chest: null };
    this.rig.remove(this.mesh);
    this.mesh.skeleton.dispose();
    releaseBuild(this.build);
    releaseMaterials(look);
  }

  private rebuild(): void {
    const bb = acquireBuild(this.look);
    this.build = bb;
    const all = acquireMaterials(this.look);
    // one material per slot, in group order
    const mats = SLOTS.map((_, i) => all[i]);
    const bones: THREE.Bone[] = [];
    const inverses: THREE.Matrix4[] = [];
    for (let i = 0; i < BONE_COUNT; i++) {
      const bone = new THREE.Bone();
      const p = bb.parents[i];
      const x = bb.rest[i * 3];
      const y = bb.rest[i * 3 + 1];
      const z = bb.rest[i * 3 + 2];
      if (p >= 0) {
        bone.position.set(x - bb.rest[p * 3], y - bb.rest[p * 3 + 1], z - bb.rest[p * 3 + 2]);
        bones[p].add(bone);
      } else bone.position.set(x, y, z);
      bones.push(bone);
      inverses.push(new THREE.Matrix4().makeTranslation(-x, -y, -z));
    }
    const mesh = new THREE.SkinnedMesh(bb.geometry, mats);
    mesh.name = 'character-body';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.add(bones[0]);
    mesh.bind(new THREE.Skeleton(bones, inverses), new THREE.Matrix4());
    // the pose changes every frame: keep the generous static bounds of the geometry
    mesh.boundingSphere = bb.geometry.boundingSphere!.clone();
    mesh.boundingBox = bb.geometry.boundingBox!.clone();
    // optional stature: scale the body type uniformly
    const h = this.look.height;
    this.scale = h && Number.isFinite(h) ? THREE.MathUtils.clamp(h / bb.spec.H, 0.7, 1.35) : 1;
    this.rig.scale.setScalar(this.scale);
    this.rig.add(mesh);
    this.mesh = mesh;
    this.bones = bones;
    this.eyeHeight = bb.eyeHeight * this.scale;
    if (this.anim) {
      // seat heights are stored in unscaled body units
      const seat = this.anim.seatHeight;
      this.anim.rebind(bones, bb);
      this.anim.seatHeight = seat;
    } else {
      this.anim = new Animator(bones, bb);
      this.anim.onFootstep = (foot) => this.onFootstep?.(foot);
    }
    if (this.prop !== 'none') this.setProp(this.prop);
    // show a sensible pose even before the first update
    this.anim.update(0, 0);
  }
}

/** Natural stature (meters) of a body type. */
export function bodyHeight(body: BodyType): number {
  return specOf(body).H;
}

