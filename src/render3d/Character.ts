import * as THREE from 'three';

import { DEFAULT_LOOK, type CharacterLook, type CharacterMotion, type Gesture, type Pose } from './characterTypes';
import { Animator } from './character/animator';
import { type BodyBuild, acquireBuild, releaseBuild } from './character/assemble';
import { BONE_COUNT, SLOTS } from './character/builder';
import { acquireMaterials, releaseMaterials } from './character/materials';

export type { Pose } from './characterTypes';

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

  private look: CharacterLook;
  private build!: BodyBuild;
  private mesh!: THREE.SkinnedMesh;
  private bones: THREE.Bone[] = [];
  private anim!: Animator;
  private disposed = false;

  constructor(look: CharacterLook = DEFAULT_LOOK) {
    this.look = { ...look };
    this.root.name = 'character';
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

  /** Rebuild the appearance in place (same `root`, motion state kept). */
  setLook(look: CharacterLook): void {
    const old = this.look;
    this.look = { ...look };
    this.teardown(old);
    this.rebuild();
  }

  setPose(pose: Pose, seatHeight = 0.45): void {
    this.anim.pose = pose;
    this.anim.seatHeight = seatHeight;
  }

  getPose(): Pose {
    return this.anim.pose;
  }

  gesture(g: Gesture): void {
    this.anim.gesture(g);
  }

  /** speed in m/s (0 = idle). */
  update(dt: number, speed: number, motion?: CharacterMotion): void {
    this.anim.update(dt, speed, motion);
  }

  /** Triangles / material groups of the current look (for budgets and debugging). */
  get stats(): { triangles: number; drawCalls: number; bones: number; height: number } {
    return { triangles: this.build.triangles, drawCalls: this.build.geometry.groups.length, bones: BONE_COUNT, height: this.build.spec.H };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.teardown(this.look);
  }

  private teardown(look: CharacterLook): void {
    if (!this.mesh) return;
    this.root.remove(this.mesh);
    this.mesh.skeleton.dispose();
    releaseBuild(this.build);
    releaseMaterials(look);
  }

  private rebuild(): void {
    const bb = acquireBuild(this.look);
    this.build = bb;
    const all = acquireMaterials(this.look);
    // one material per used slot, in group order
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
    this.root.add(mesh);
    this.mesh = mesh;
    this.bones = bones;
    this.eyeHeight = bb.eyeHeight;
    if (this.anim) this.anim.rebind(bones, bb);
    else {
      this.anim = new Animator(bones, bb);
      this.anim.onFootstep = (foot) => this.onFootstep?.(foot);
    }
    // show a sensible pose even before the first update
    this.anim.update(0, 0);
  }
}
