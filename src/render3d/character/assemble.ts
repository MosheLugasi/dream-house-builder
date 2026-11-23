import * as THREE from 'three';
import type { CharacterLook } from '../characterTypes';
import { buildBody, type Styles } from './body';
import { B, BONE_COUNT, Builder } from './builder';
import { type HairInfo, buildHair } from './hair';
import { buildCap, buildGlasses, buildHead } from './head';
import { type Spec, specOf } from './spec';

/** Geometry + rig layout shared by every character with the same body type and styles. */
export interface BodyBuild {
  key: string;
  geometry: THREE.BufferGeometry;
  spec: Spec;
  /** rest position of every bone in character space (x, y, z per bone) */
  rest: Float32Array;
  parents: Int8Array;
  eyeHeight: number;
  /** angle (radians) the upper eyelids travel to close */
  lidTravel: number;
  hair: HairInfo;
  triangles: number;
  refs: number;
}

const cache = new Map<string, BodyBuild>();

export const buildKey = (l: CharacterLook) =>
  [l.body, l.hairStyle, l.topStyle, l.topStyle === 'dress' ? '-' : l.bottomStyle, l.accessory].join('|');

export function acquireBuild(look: CharacterLook): BodyBuild {
  const key = buildKey(look);
  let hit = cache.get(key);
  if (!hit) {
    hit = build(key, look);
    cache.set(key, hit);
  }
  hit.refs++;
  return hit;
}

export function releaseBuild(bb: BodyBuild): void {
  if (--bb.refs > 0) return;
  bb.geometry.dispose();
  cache.delete(bb.key);
}

function build(key: string, look: CharacterLook): BodyBuild {
  const s = specOf(look.body);
  const st: Styles = { hairStyle: look.hairStyle, topStyle: look.topStyle, bottomStyle: look.bottomStyle, accessory: look.accessory };
  const b = new Builder();
  const torso = buildBody(b, s, st);
  const head = buildHead(b, s, st, torso);
  const cap = st.accessory === 'cap';
  const hair = buildHair(b, head, st.hairStyle, cap, st.accessory === 'bow');
  if (cap) buildCap(b, head);
  if (st.accessory === 'glasses') buildGlasses(b, head);
  const geometry = b.build();

  const k = s.H / 1.78;
  const rest = new Float32Array(BONE_COUNT * 3);
  const parents = new Int8Array(BONE_COUNT).fill(-1);
  const set = (bone: number, parent: number, x: number, y: number, z: number) => {
    rest.set([x, y, z], bone * 3);
    parents[bone] = parent;
  };
  set(B.hips, -1, 0, s.hipY, 0);
  set(B.spine, B.hips, 0, s.spineY, 0);
  set(B.chest, B.spine, 0, s.chestY, 0);
  set(B.neck, B.chest, 0, s.neckY, -0.012 * k);
  const hp = head.abs([0, (s.headY - s.chinY) / s.headH, -0.085]);
  set(B.head, B.neck, 0, hp[1], hp[2]);
  const eye = head.abs([0, head.eye.y, head.eye.z]);
  set(B.lid, B.head, 0, eye[1], eye[2]);
  set(B.hairA, hair.parentA === 'head' ? B.head : B.chest, ...hair.pivotA);
  set(B.hairB, hair.chain ? B.hairA : hair.parentA === 'head' ? B.head : B.chest, ...hair.pivotB);
  const wristY = s.shoulderY - s.upperArm - s.foreArm;
  for (const sx of [1, -1]) {
    const L = sx > 0;
    set(L ? B.clavL : B.clavR, B.chest, sx * 0.025 * k, s.shoulderY - 0.035 * k, 0.03 * k);
    set(L ? B.armL : B.armR, L ? B.clavL : B.clavR, sx * s.shoulderX, s.shoulderY, 0);
    set(L ? B.elbowL : B.elbowR, L ? B.armL : B.armR, sx * s.shoulderX, s.shoulderY - s.upperArm, 0);
    set(L ? B.foreL : B.foreR, L ? B.armL : B.armR, sx * s.shoulderX, s.shoulderY - s.upperArm, 0);
    set(L ? B.handL : B.handR, L ? B.foreL : B.foreR, sx * s.shoulderX, wristY, 0);
    set(L ? B.fingL : B.fingR, L ? B.handL : B.handR, sx * s.shoulderX, wristY - 0.094 * (s.hand / 0.186), 0);
    set(L ? B.thighL : B.thighR, B.hips, sx * s.hipX, s.hipY, 0);
    set(L ? B.kneeL : B.kneeR, L ? B.thighL : B.thighR, sx * s.hipX, s.kneeY, 0);
    set(L ? B.shinL : B.shinR, L ? B.thighL : B.thighR, sx * s.hipX, s.kneeY, 0);
    set(L ? B.footL : B.footR, L ? B.shinL : B.shinR, sx * s.hipX, s.ankleY, 0);
    set(L ? B.toeL : B.toeR, L ? B.footL : B.footR, sx * s.hipX, s.sole * 0.5, s.footLen * (0.69 - 0.27));
  }
  // generous static bounds (the pose changes every frame; lying down is as long as the body is tall)
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, s.H * 0.5, 0), s.H * 1.15);
  geometry.boundingBox = new THREE.Box3(new THREE.Vector3(-s.H, -0.2, -s.H), new THREE.Vector3(s.H, s.H * 1.3, s.H));
  return { key, geometry, spec: s, rest, parents, eyeHeight: eye[1], lidTravel: head.eye.travel, hair, triangles: b.triangleCount(), refs: 0 };
}
