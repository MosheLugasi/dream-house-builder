import * as THREE from 'three';

export type HairStyle = 'short' | 'ponytail' | 'long' | 'bun' | 'curly' | 'bald';

export interface CharacterLook {
  height: number;
  skin: string;
  hair: string;
  shirt: string;
  pants: string;
  shoes: string;
  /** legacy flag (saved looks); prefer `hairStyle` */
  longHair: boolean;
  hairStyle?: HairStyle;
  /** skirt / dress instead of trousers */
  skirt?: boolean;
  glasses?: boolean;
}

export const DEFAULT_LOOK: CharacterLook = {
  height: 1.5,
  skin: '#e8b996',
  hair: '#5a3620',
  shirt: '#e8725a',
  pants: '#3f5f8a',
  shoes: '#f4f4f2',
  longHair: true,
  hairStyle: 'ponytail',
};

export type Pose = 'stand' | 'sit' | 'lie' | 'ride';

/** Body animations layered over the base pose. */
export type Activity =
  | 'none'
  | 'wave'
  | 'dance'
  | 'clap'
  | 'cheer'
  | 'jump'
  | 'type'
  | 'piano'
  | 'guitar'
  | 'drums'
  | 'cook'
  | 'eat'
  | 'drink'
  | 'read'
  | 'run'
  | 'pedal'
  | 'row'
  | 'lift'
  | 'punch'
  | 'yoga'
  | 'stretch'
  | 'bounce'
  | 'swing'
  | 'kick'
  | 'shoot'
  | 'throw'
  | 'pet'
  | 'sleep'
  | 'game'
  | 'play'
  | 'wash'
  | 'feed'
  | 'slide'
  | 'call'
  | 'photo'
  | 'flip';

export type Prop = 'book' | 'cup' | 'apple' | 'guitar' | 'controller' | 'dart' | 'dumbbells' | 'spoon' | 'phone' | 'ball' | 'paddle' | 'cue' | 'mic' | 'none';

/** One-shot activities and their duration (seconds); others loop until changed. */
const ONE_SHOT: Partial<Record<Activity, number>> = { kick: 0.55, shoot: 0.8, throw: 0.6, jump: 0.75, flip: 0.9, call: 1.2 };

const damp = (current: number, target: number, lambda: number, dt: number) => current + (target - current) * (1 - Math.exp(-lambda * dt));

interface Joints {
  hipY: number;
  hipZ: number;
  chestX: number;
  chestY: number;
  chestZ: number;
  headX: number;
  headY: number;
  legHip: [number, number];
  legKnee: [number, number];
  legSide: [number, number];
  shX: [number, number];
  shZ: [number, number];
  elbow: [number, number];
  bodyY: number;
  bodyRotX: number;
}

/**
 * A procedurally built and animated person. Origin at the feet, facing +Z.
 * arms[0] / legs[0] are the RIGHT side (at -X when facing +Z).
 */
export class Character {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private hips = new THREE.Group();
  private chest = new THREE.Group();
  private head = new THREE.Group();
  private legs: { hip: THREE.Group; knee: THREE.Group }[] = [];
  private arms: { shoulder: THREE.Group; elbow: THREE.Group; hand: THREE.Group }[] = [];
  private propGroup = new THREE.Group();
  private chestProp = new THREE.Group();
  private leftProp = new THREE.Group();
  private phase = 0;
  private legLen = 0.9;
  private moveBlend = 0;
  private pose: Pose = 'stand';
  private seatHeight = 0.45;
  private poseBlend = 0;
  private lieBlend = 0;
  private rideBlend = 0;
  private reachBlend = 0;
  /** hold on to a handlebar while standing (kick scooter) */
  reach = false;
  private activity: Activity = 'none';
  private actTime = 0;
  private actBlend = 0;
  private prevActivity: Activity = 'none';
  private prop: Prop = 'none';
  private hit = 0;
  private hitSide = 0;
  private look: CharacterLook = DEFAULT_LOOK;
  private materials: THREE.Material[] = [];
  private geometries: THREE.BufferGeometry[] = [];
  eyeHeight = 1.4;
  /** extra vertical offset applied by the controller (jumps, rides) */
  lift = 0;

  constructor(look: CharacterLook = DEFAULT_LOOK) {
    this.root.add(this.body);
    this.setLook(look);
  }

  getLook(): CharacterLook {
    return this.look;
  }

  /** (Re)build the body for a look. */
  setLook(look: CharacterLook): void {
    this.look = { ...DEFAULT_LOOK, ...look };
    for (const m of this.materials) m.dispose();
    for (const g of this.geometries) g.dispose();
    this.materials = [];
    this.geometries = [];
    this.body.clear();
    this.hips = new THREE.Group();
    this.chest = new THREE.Group();
    this.head = new THREE.Group();
    this.legs = [];
    this.arms = [];
    this.build(this.look);
    this.setProp(this.prop);
  }

  private build(look: CharacterLook): void {
    const s = look.height / 1.7;
    const mat = (color: string, rough: number, extra: Partial<THREE.MeshPhysicalMaterialParameters> = {}) => {
      const m = new THREE.MeshPhysicalMaterial({ color, roughness: rough, metalness: 0, ...extra });
      this.materials.push(m);
      return m;
    };
    const skin = mat(look.skin, 0.55, { sheen: 0.3, sheenColor: new THREE.Color('#ffd9c4'), sheenRoughness: 0.5 });
    const hair = mat(look.hair, 0.6, { sheen: 0.6, sheenColor: new THREE.Color(look.hair).lerp(new THREE.Color('#ffffff'), 0.4), sheenRoughness: 0.35 });
    const shirt = mat(look.shirt, 0.85, { sheen: 0.4, sheenColor: new THREE.Color(look.shirt).lerp(new THREE.Color('#ffffff'), 0.3), sheenRoughness: 0.6 });
    const pants = mat(look.pants, 0.8, { sheen: 0.3, sheenColor: new THREE.Color(look.pants).lerp(new THREE.Color('#ffffff'), 0.3), sheenRoughness: 0.6 });
    const shoes = mat(look.shoes, 0.5);
    const sole = mat('#d8d4cc', 0.8);
    const dark = mat('#1d1714', 0.25, { clearcoat: 1, clearcoatRoughness: 0.1 });
    const white = mat('#fbfbf8', 0.3, { clearcoat: 1 });
    const lip = mat(new THREE.Color(look.skin).lerp(new THREE.Color('#b0555a'), 0.45).getStyle(), 0.5);
    const brow = mat(new THREE.Color(look.hair).multiplyScalar(0.7).getStyle(), 0.8);

    const mesh = (geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
      this.geometries.push(geo);
      const me = new THREE.Mesh(geo, m);
      me.position.set(x, y, z);
      me.castShadow = true;
      me.receiveShadow = true;
      return me;
    };
    const capsule = (r: number, len: number, rs = 14) => new THREE.CapsuleGeometry(r, Math.max(0.001, len - 2 * r), 6, rs);

    const thigh = 0.44 * s;
    const shin = 0.43 * s;
    const foot = 0.07 * s;
    this.legLen = thigh + shin + foot;
    const torsoLen = 0.52 * s;
    const hipW = 0.1 * s;

    this.body.add(this.hips);
    this.hips.position.y = this.legLen;

    // pelvis + torso
    this.hips.add(mesh(capsule(0.118 * s, 0.31 * s).rotateZ(Math.PI / 2), pants, 0, 0.02 * s, 0));
    if (look.skirt) {
      const sk = mesh(new THREE.CylinderGeometry(0.15 * s, 0.25 * s, 0.36 * s, 20, 1, true), pants, 0, -0.14 * s, 0);
      (sk.material as THREE.Material).side = THREE.DoubleSide;
      this.hips.add(sk);
    }
    this.hips.add(this.chest);
    this.chest.position.y = 0.06 * s;
    const torso = mesh(capsule(0.135 * s, torsoLen, 16), shirt, 0, torsoLen / 2, 0);
    torso.scale.set(1.12, 1, 0.78);
    this.chest.add(torso);
    // collar
    const collar = mesh(new THREE.TorusGeometry(0.058 * s, 0.014 * s, 6, 16), shirt, 0, torsoLen - 0.005 * s, 0.006 * s);
    collar.rotation.x = Math.PI / 2 - 0.25;
    this.chest.add(collar);
    // neck + head
    this.chest.add(mesh(new THREE.CylinderGeometry(0.045 * s, 0.05 * s, 0.09 * s, 12), skin, 0, torsoLen + 0.03 * s, 0));
    this.head.position.y = torsoLen + 0.17 * s;
    this.chest.add(this.head);
    const skull = mesh(new THREE.SphereGeometry(0.115 * s, 28, 20), skin);
    skull.scale.set(0.94, 1.08, 1);
    this.head.add(skull);
    // jaw / chin
    const jaw = mesh(new THREE.SphereGeometry(0.085 * s, 18, 12), skin, 0, -0.05 * s, 0.03 * s);
    jaw.scale.set(1, 0.8, 0.95);
    this.head.add(jaw);
    // ears
    for (const sx of [-1, 1]) {
      const ear = mesh(new THREE.SphereGeometry(0.026 * s, 10, 8), skin, sx * 0.106 * s, 0, -0.005 * s);
      ear.scale.set(0.45, 1, 0.8);
      this.head.add(ear);
    }
    this.buildHair(look, s, hair, mesh, capsule);
    // face: eyes (white + iris + highlight), brows, nose, lips
    for (const sx of [-1, 1]) {
      const eye = mesh(new THREE.SphereGeometry(0.019 * s, 14, 10), white, sx * 0.04 * s, 0.014 * s, 0.093 * s);
      eye.scale.set(1, 0.85, 0.6);
      this.head.add(eye);
      this.head.add(mesh(new THREE.SphereGeometry(0.0115 * s, 12, 8), dark, sx * 0.04 * s, 0.013 * s, 0.1035 * s));
      const b = mesh(capsule(0.006 * s, 0.038 * s, 6).rotateZ(Math.PI / 2 + sx * 0.15), brow, sx * 0.042 * s, 0.043 * s, 0.1 * s);
      this.head.add(b);
      if (look.glasses) {
        const lens = mesh(new THREE.TorusGeometry(0.024 * s, 0.003 * s, 6, 18), dark, sx * 0.042 * s, 0.014 * s, 0.112 * s);
        this.head.add(lens);
      }
    }
    if (look.glasses) this.head.add(mesh(capsule(0.003 * s, 0.03 * s, 6).rotateZ(Math.PI / 2), dark, 0, 0.018 * s, 0.114 * s));
    const nose = mesh(new THREE.SphereGeometry(0.016 * s, 10, 8), skin, 0, -0.008 * s, 0.112 * s);
    nose.scale.set(0.9, 1.2, 1);
    this.head.add(nose);
    const smile = mesh(new THREE.TorusGeometry(0.024 * s, 0.006 * s, 6, 14, Math.PI), lip, 0, -0.038 * s, 0.1 * s);
    smile.rotation.z = Math.PI;
    this.head.add(smile);

    // legs
    for (const sx of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(sx * hipW, 0, 0);
      hip.add(mesh(capsule(0.077 * s, thigh + 0.05 * s), look.skirt ? skin : pants, 0, -thigh / 2, 0));
      const knee = new THREE.Group();
      knee.position.y = -thigh;
      knee.add(mesh(capsule(0.06 * s, shin + 0.04 * s), look.skirt ? skin : pants, 0, -shin / 2, 0));
      const shoe = mesh(capsule(0.052 * s, 0.21 * s).rotateX(Math.PI / 2), shoes, 0, -shin - foot / 2 + 0.012 * s, 0.045 * s);
      shoe.scale.set(1, 0.78, 1);
      knee.add(shoe);
      const so = mesh(new THREE.BoxGeometry(0.1 * s, 0.018 * s, 0.22 * s), sole, 0, -shin - foot + 0.01 * s, 0.048 * s);
      knee.add(so);
      hip.add(knee);
      this.hips.add(hip);
      this.legs.push({ hip, knee });
    }
    // arms
    const upper = 0.3 * s;
    const fore = 0.28 * s;
    for (const sx of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(sx * 0.185 * s, torsoLen - 0.06 * s, 0);
      shoulder.add(mesh(new THREE.SphereGeometry(0.06 * s, 14, 10), shirt));
      shoulder.add(mesh(capsule(0.05 * s, upper * 0.62), shirt, 0, -upper * 0.27, 0));
      shoulder.add(mesh(capsule(0.041 * s, upper * 0.6), skin, 0, -upper * 0.68, 0));
      const elbow = new THREE.Group();
      elbow.position.y = -upper;
      elbow.add(mesh(capsule(0.039 * s, fore + 0.03 * s), skin, 0, -fore / 2, 0));
      const hand = new THREE.Group();
      hand.position.y = -fore - 0.03 * s;
      const palm = mesh(new THREE.SphereGeometry(0.045 * s, 12, 10), skin);
      palm.scale.set(0.75, 1.15, 0.55);
      hand.add(palm);
      const thumb = mesh(capsule(0.014 * s, 0.05 * s, 6), skin, -sx * 0.025 * s, 0.005 * s, 0.022 * s);
      thumb.rotation.z = sx * 0.6;
      hand.add(thumb);
      elbow.add(hand);
      shoulder.add(elbow);
      this.chest.add(shoulder);
      this.arms.push({ shoulder, elbow, hand });
    }
    this.eyeHeight = this.legLen + torsoLen + 0.2 * s;
    this.chest.add(this.chestProp);
    this.chestProp.position.set(0, torsoLen * 0.35, 0.13 * s);
    this.arms[0].hand.add(this.propGroup);
    this.arms[1].hand.add(this.leftProp);
  }

  private buildHair(
    look: CharacterLook,
    s: number,
    hair: THREE.Material,
    mesh: (g: THREE.BufferGeometry, m: THREE.Material, x?: number, y?: number, z?: number) => THREE.Mesh,
    capsule: (r: number, len: number, rs?: number) => THREE.BufferGeometry,
  ): void {
    const style: HairStyle = look.hairStyle ?? (look.longHair ? 'ponytail' : 'short');
    if (style === 'bald') return;
    const cap = mesh(new THREE.SphereGeometry(0.123 * s, 28, 16, 0, Math.PI * 2, 0, Math.PI * (style === 'curly' ? 0.6 : 0.55)), hair, 0, 0.014 * s, -0.012 * s);
    cap.scale.set(0.98, 1.08, 1.05);
    cap.rotation.x = -0.28;
    this.head.add(cap);
    // fringe / sideburns
    const fringe = mesh(new THREE.SphereGeometry(0.12 * s, 20, 8, -Math.PI * 0.35, Math.PI * 0.7, Math.PI * 0.25, Math.PI * 0.18), hair, 0, 0.01 * s, 0.006 * s);
    fringe.rotation.y = 0;
    this.head.add(fringe);
    if (style === 'ponytail') {
      this.head.add(mesh(new THREE.SphereGeometry(0.05 * s, 12, 10), hair, 0, 0.04 * s, -0.115 * s));
      const tail = mesh(capsule(0.042 * s, 0.32 * s), hair, 0, -0.1 * s, -0.135 * s);
      tail.rotation.x = 0.25;
      this.head.add(tail);
    } else if (style === 'long') {
      const back = mesh(capsule(0.1 * s, 0.36 * s, 18), hair, 0, -0.08 * s, -0.045 * s);
      back.scale.set(1.12, 1, 0.75);
      this.head.add(back);
    } else if (style === 'bun') {
      this.head.add(mesh(new THREE.SphereGeometry(0.06 * s, 14, 10), hair, 0, 0.11 * s, -0.07 * s));
    } else if (style === 'curly') {
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        const y = 0.03 * s + Math.sin(i * 1.7) * 0.03 * s;
        const r = 0.115 * s;
        const z = Math.sin(a) * r;
        if (z > 0.07 * s && y < 0.05 * s) continue;
        this.head.add(mesh(new THREE.SphereGeometry(0.042 * s, 10, 8), hair, Math.cos(a) * r, y, z - 0.01 * s));
      }
      this.head.add(mesh(new THREE.SphereGeometry(0.06 * s, 10, 8), hair, 0, 0.1 * s, -0.02 * s));
    }
  }

  setPose(pose: Pose, seatHeight = 0.45): void {
    this.pose = pose;
    this.seatHeight = seatHeight;
  }

  getPose(): Pose {
    return this.pose;
  }

  getActivity(): Activity {
    return this.activity;
  }

  /** Start an activity (one-shot ones return to the previous looping activity afterwards). */
  setActivity(a: Activity): void {
    if (ONE_SHOT[a] === undefined) this.prevActivity = a;
    else if (ONE_SHOT[this.activity] === undefined) this.prevActivity = this.activity;
    this.activity = a;
    this.actTime = 0;
  }

  /** trigger a hit (instrument key, punch...) on a side: -1 right, 1 left, 0 both */
  strike(side = 0): void {
    this.hit = 1;
    this.hitSide = side;
  }

  /** world position of the right hand */
  handWorld(out = new THREE.Vector3()): THREE.Vector3 {
    this.root.updateMatrixWorld(true);
    return this.arms[0].hand.getWorldPosition(out);
  }

  headWorld(out = new THREE.Vector3()): THREE.Vector3 {
    this.root.updateMatrixWorld(true);
    return this.head.getWorldPosition(out);
  }

  setProp(p: Prop): void {
    this.prop = p;
    for (const g of [this.propGroup, this.chestProp, this.leftProp]) {
      for (const c of g.children) {
        c.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) m.geometry.dispose();
        });
      }
      g.clear();
    }
    if (p === 'none') return;
    const s = this.look.height / 1.7;
    const M = (color: string, rough = 0.6, metal = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
    const add = (g: THREE.Group, geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
      const me = new THREE.Mesh(geo, m);
      me.position.set(x, y, z);
      me.castShadow = true;
      g.add(me);
      return me;
    };
    const hy = -0.04 * s;
    switch (p) {
      case 'book': {
        add(this.propGroup, new THREE.BoxGeometry(0.15 * s, 0.2 * s, 0.025 * s), M('#3d5a80'), 0.05 * s, hy, 0.03 * s).rotation.y = 0.4;
        add(this.propGroup, new THREE.BoxGeometry(0.14 * s, 0.19 * s, 0.022 * s), M('#f4efe2', 0.9), 0.05 * s, hy, 0.034 * s).rotation.y = 0.4;
        break;
      }
      case 'cup':
        add(this.propGroup, new THREE.CylinderGeometry(0.035 * s, 0.03 * s, 0.09 * s, 16), M('#f6f4ef', 0.25), 0, hy, 0.04 * s);
        add(this.propGroup, new THREE.CylinderGeometry(0.03 * s, 0.03 * s, 0.002, 16), M('#4a2c1a', 0.2), 0, hy + 0.04 * s, 0.04 * s);
        break;
      case 'apple':
        add(this.propGroup, new THREE.SphereGeometry(0.04 * s, 14, 10), M('#c8312b', 0.35), 0, hy, 0.04 * s);
        add(this.propGroup, new THREE.CylinderGeometry(0.003, 0.003, 0.02 * s), M('#5a3b1f'), 0, hy + 0.045 * s, 0.04 * s);
        break;
      case 'spoon':
        add(this.propGroup, new THREE.CylinderGeometry(0.006 * s, 0.006 * s, 0.3 * s, 8), M('#b7865a'), 0, hy - 0.08 * s, 0.03 * s);
        break;
      case 'phone':
        add(this.propGroup, new THREE.BoxGeometry(0.075 * s, 0.15 * s, 0.01 * s), M('#1b1c1f', 0.3), 0, hy, 0.035 * s);
        break;
      case 'controller':
        add(this.propGroup, new THREE.BoxGeometry(0.16 * s, 0.03 * s, 0.07 * s), M('#2a2b30', 0.4), 0.06 * s, hy, 0.05 * s);
        break;
      case 'dart':
        add(this.propGroup, new THREE.CylinderGeometry(0.004 * s, 0.004 * s, 0.14 * s, 6), M('#c9ccce', 0.3, 1), 0, hy, 0.03 * s).rotation.x = Math.PI / 2;
        break;
      case 'dumbbells':
        for (const g of [this.propGroup, this.leftProp]) {
          const bar = add(g, new THREE.CylinderGeometry(0.012 * s, 0.012 * s, 0.16 * s, 8), M('#8a8d90', 0.4, 1), 0, hy, 0.02 * s);
          bar.rotation.z = Math.PI / 2;
          for (const sx of [-1, 1]) add(g, new THREE.CylinderGeometry(0.035 * s, 0.035 * s, 0.035 * s, 14), M('#2a2b2e', 0.6), sx * 0.075 * s, hy, 0.02 * s).rotation.z = Math.PI / 2;
        }
        break;
      case 'ball':
        add(this.propGroup, new THREE.SphereGeometry(0.12, 18, 14), M('#d9692b', 0.7), 0, hy - 0.06, 0.1);
        break;
      case 'paddle':
        add(this.propGroup, new THREE.CylinderGeometry(0.075 * s, 0.075 * s, 0.012 * s, 18), M('#c0392b', 0.6), 0, hy - 0.1 * s, 0.03 * s).rotation.x = Math.PI / 2;
        break;
      case 'cue':
        add(this.propGroup, new THREE.CylinderGeometry(0.006, 0.012, 1.4, 8), M('#c9a777', 0.5), 0, hy, 0.5).rotation.x = Math.PI / 2;
        break;
      case 'mic':
        add(this.propGroup, new THREE.CylinderGeometry(0.012 * s, 0.008 * s, 0.14 * s, 10), M('#222', 0.4), 0, hy, 0.03 * s);
        add(this.propGroup, new THREE.SphereGeometry(0.025 * s, 12, 10), M('#8a8d90', 0.3, 1), 0, hy + 0.08 * s, 0.03 * s);
        break;
      case 'guitar': {
        const body = add(this.chestProp, new THREE.SphereGeometry(0.17 * s, 18, 12), M('#b5733d', 0.4), -0.04 * s, -0.1 * s, 0.02 * s);
        body.scale.set(1, 1.15, 0.35);
        add(this.chestProp, new THREE.CylinderGeometry(0.045 * s, 0.045 * s, 0.01, 16), M('#1a1410'), -0.04 * s, -0.08 * s, 0.085 * s).rotation.x = Math.PI / 2;
        const neck = add(this.chestProp, new THREE.BoxGeometry(0.05 * s, 0.5 * s, 0.03 * s), M('#4a2f1d', 0.5), 0.2 * s, 0.1 * s, 0.04 * s);
        neck.rotation.z = -1.25;
        this.chestProp.rotation.z = 0.15;
        break;
      }
    }
  }

  getProp(): Prop {
    return this.prop;
  }

  /** speed in m/s (0 = idle). */
  update(dt: number, speed: number): void {
    const act = this.activity;
    this.actTime += dt;
    const shot = ONE_SHOT[act];
    if (shot !== undefined && this.actTime >= shot) {
      this.activity = this.prevActivity;
      this.actTime = 0;
    }
    const treadmill = this.activity === 'run';
    const moving = (speed > 0.05 || treadmill) && this.pose === 'stand';
    const sp = treadmill ? 3.4 : speed;
    this.moveBlend = damp(this.moveBlend, moving ? 1 : 0, 10, dt);
    this.poseBlend = damp(this.poseBlend, this.pose === 'stand' ? 0 : 1, 9, dt);
    this.lieBlend = damp(this.lieBlend, this.pose === 'lie' ? 1 : 0, 7, dt);
    this.rideBlend = damp(this.rideBlend, this.pose === 'ride' ? 1 : 0, 9, dt);
    this.reachBlend = damp(this.reachBlend, this.reach ? 1 : 0, 9, dt);
    this.actBlend = damp(this.actBlend, this.activity === 'none' || this.activity === 'run' ? 0 : 1, 10, dt);
    this.hit = Math.max(0, this.hit - dt * 7);
    this.phase += this.pose === 'ride' ? dt * sp * 2.4 : dt * (4.2 + sp * 2.6) * (moving ? 1 : 0.25);
    const t = this.phase;
    const mb = this.moveBlend;
    const ride = this.rideBlend;
    const sit = this.poseBlend * (1 - this.lieBlend) * (1 - ride);
    const stride = Math.min(0.75, 0.3 + sp * 0.14) * mb;

    const now = performance.now() / 1000;
    const breath = Math.sin(now * 1.1) * 0.006;
    const bob = Math.abs(Math.sin(t)) * 0.035 * mb;

    // ---- base pose (walk / sit) ----
    const j: Joints = {
      hipY: THREE.MathUtils.lerp(this.legLen + bob, this.seatHeight + 0.09, Math.max(sit, ride)),
      hipZ: THREE.MathUtils.lerp(0, -0.02, sit),
      chestX: 0.07 * mb + 0.04 * sit + 0.42 * ride,
      chestY: Math.sin(t) * 0.08 * mb,
      chestZ: 0,
      headX: -0.3 * ride,
      headY: -Math.sin(t) * 0.05 * mb,
      legHip: [0, 0],
      legKnee: [0, 0],
      legSide: [0, 0],
      shX: [0, 0],
      shZ: [-0.09, 0.09],
      elbow: [0, 0],
      bodyY: 0,
      bodyRotX: 0,
    };
    for (let i = 0; i < 2; i++) {
      const ph = t + (i ? Math.PI : 0);
      const s = Math.sin(ph);
      const walkHip = THREE.MathUtils.lerp(-s * stride, -Math.PI / 2 + 0.06, sit);
      const walkKnee = THREE.MathUtils.lerp(Math.max(0, Math.cos(ph)) * stride * 1.5 + 0.04 * mb, Math.PI / 2 - 0.02, sit);
      // riding (bikes, scooters): the foot travels around a circle
      j.legHip[i] = THREE.MathUtils.lerp(walkHip, -0.95 + Math.sin(ph) * 0.42, ride);
      j.legKnee[i] = THREE.MathUtils.lerp(walkKnee, 1.25 - Math.cos(ph) * 0.5, ride);
      const a = Math.sin(t + (i ? 0 : Math.PI));
      const sh = THREE.MathUtils.lerp(THREE.MathUtils.lerp(-a * stride * 0.85, -0.55, sit), -1.05, ride);
      const el = THREE.MathUtils.lerp(THREE.MathUtils.lerp(-0.18 - Math.max(0, -a) * stride * 0.7 - 0.25 * mb, -0.75, sit), -0.35, ride);
      j.shX[i] = THREE.MathUtils.lerp(sh, -0.95, this.reachBlend);
      j.elbow[i] = THREE.MathUtils.lerp(el, -0.5, this.reachBlend);
    }

    // ---- activity overlay ----
    if (this.actBlend > 0.001) {
      const a = this.activityJoints(this.activity === 'none' ? this.prevActivity : this.activity, this.actTime, now, sit);
      const k = this.actBlend;
      const lerpKey = <K extends keyof Joints>(key: K) => {
        const v = a[key];
        if (v === undefined) return;
        if (Array.isArray(v)) {
          const arr = j[key] as unknown as number[];
          (v as number[]).forEach((x, i) => {
            if (Number.isFinite(x)) arr[i] = THREE.MathUtils.lerp(arr[i], x, k);
          });
        } else (j as unknown as Record<string, number>)[key] = THREE.MathUtils.lerp(j[key] as unknown as number, v as number, k);
      };
      (Object.keys(a) as Array<keyof Joints>).forEach(lerpKey);
    }

    // ---- apply ----
    this.hips.position.y = j.hipY;
    this.hips.position.z = j.hipZ;
    this.chest.position.y = 0.06 * (this.legLen / 0.94) + breath;
    this.chest.rotation.set(j.chestX, j.chestY, j.chestZ);
    this.head.rotation.set(j.headX, j.headY, 0);
    this.legs.forEach((leg, i) => {
      leg.hip.rotation.set(j.legHip[i], 0, j.legSide[i]);
      leg.knee.rotation.x = j.legKnee[i];
    });
    this.arms.forEach((arm, i) => {
      arm.shoulder.rotation.set(j.shX[i], 0, j.shZ[i]);
      arm.elbow.rotation.x = j.elbow[i];
    });

    // lying down: rotate the whole body onto its back
    const lie = this.lieBlend;
    this.body.rotation.x = (-Math.PI / 2) * lie + j.bodyRotX;
    this.body.position.y = lie * (this.seatHeight + 0.075) + j.bodyY + this.lift;
    this.body.position.z = lie * this.eyeHeight * 0.5;
  }

  /** Target joint values for an activity (undefined / NaN entries keep the base pose). */
  private activityJoints(a: Activity, at: number, now: number, sit: number): Partial<Joints> {
    const N = NaN;
    const h = this.hit;
    const hs = this.hitSide;
    switch (a) {
      case 'wave':
        return { shX: [-2.7, N], shZ: [-0.35, N], elbow: [-0.5 + Math.sin(now * 11) * 0.45, N], headY: -0.15 };
      case 'dance': {
        const b = now * 7.5;
        return {
          hipY: this.legLen - 0.04 - Math.abs(Math.sin(b)) * 0.06,
          chestY: Math.sin(b / 2) * 0.35,
          chestZ: Math.sin(b) * 0.12,
          headX: Math.sin(b) * 0.12,
          shX: [-1.6 - Math.sin(b / 2) * 1.1, -1.6 + Math.sin(b / 2) * 1.1],
          shZ: [-0.6, 0.6],
          elbow: [-1.2 + Math.sin(b) * 0.4, -1.2 - Math.sin(b) * 0.4],
          legHip: [Math.max(0, Math.sin(b)) * -0.5, Math.max(0, -Math.sin(b)) * -0.5],
          legKnee: [Math.max(0, Math.sin(b)) * 0.9 + 0.12, Math.max(0, -Math.sin(b)) * 0.9 + 0.12],
        };
      }
      case 'clap': {
        const c = Math.max(0, Math.sin(now * 12));
        return { shX: [-1.25, -1.25], shZ: [0.25 + c * 0.25, -0.25 - c * 0.25], elbow: [-0.6, -0.6] };
      }
      case 'cheer':
        return { shX: [-2.9, -2.9], shZ: [-0.4 + Math.sin(now * 10) * 0.15, 0.4 - Math.sin(now * 10) * 0.15], elbow: [-0.2, -0.2], headX: -0.2, bodyY: Math.abs(Math.sin(now * 6)) * 0.05 };
      case 'jump':
      case 'bounce':
      case 'flip': {
        const air = Math.min(1, this.lift * 2.5);
        return {
          legHip: [-0.5 * air - 0.05, -0.5 * air - 0.05],
          legKnee: [1.1 * air + 0.05, 1.1 * air + 0.05],
          shX: [-2.4 * air - 0.2, -2.4 * air - 0.2],
          shZ: [-0.5, 0.5],
          elbow: [-0.3, -0.3],
          bodyRotX: a === 'flip' ? -Math.min(1, at / 0.75) * Math.PI * 2 : 0,
        };
      }
      case 'type':
        return {
          shX: [-0.85, -0.85],
          shZ: [0.2, -0.2],
          elbow: [-0.85 + Math.sin(now * 23) * 0.06, -0.85 + Math.sin(now * 19 + 1) * 0.06],
          headX: 0.12,
          chestX: 0.12,
        };
      case 'piano':
        return {
          shX: [-0.75 - (hs <= 0 ? h * 0.15 : 0), -0.75 - (hs >= 0 ? h * 0.15 : 0)],
          shZ: [0.25 + Math.sin(now * 2) * 0.1, -0.25 + Math.sin(now * 2.3) * 0.1],
          elbow: [-0.95 + (hs <= 0 ? h * 0.25 : 0), -0.95 + (hs >= 0 ? h * 0.25 : 0)],
          headX: 0.15,
          chestX: 0.1 + h * 0.03,
        };
      case 'guitar':
        return { shX: [-0.55, -1.1], shZ: [0.15 + h * 0.25, 0.75], elbow: [-1.45 + h * 0.3, -0.55], headX: 0.2, headY: 0.3 };
      case 'drums':
        return {
          shX: [-0.9 + (hs <= 0 ? h * 0.8 : 0), -0.9 + (hs >= 0 ? h * 0.8 : 0)],
          shZ: [-0.25, 0.25],
          elbow: [-1.3 + (hs <= 0 ? h * 0.6 : 0), -1.3 + (hs >= 0 ? h * 0.6 : 0)],
          headX: Math.sin(now * 8) * 0.1,
          legKnee: [N, Math.PI / 2 - 0.02 - h * 0.3 * (hs === 0 ? 1 : 0)],
        };
      case 'cook':
        return { shX: [-0.9 + Math.sin(now * 5) * 0.12, -0.7], shZ: [0.15 + Math.cos(now * 5) * 0.12, -0.1], elbow: [-1.0, -1.1], headX: 0.35, chestX: 0.15 };
      case 'eat':
      case 'drink': {
        const up = 0.5 + 0.5 * Math.sin(now * (a === 'eat' ? 3 : 1.6));
        return { shX: [-0.5 - up * 0.9, N], shZ: [0.2 * up, N], elbow: [-0.6 - up * 1.75, N], headX: a === 'drink' ? -0.25 * up : 0.05 };
      }
      case 'read':
        return { shX: [-0.75, -0.75], shZ: [0.3, -0.3], elbow: [-1.35, -1.35], headX: 0.4 };
      case 'pedal': {
        const c = now * 7;
        return {
          legHip: [-1.25 + Math.sin(c) * 0.35, -1.25 - Math.sin(c) * 0.35],
          legKnee: [1.3 + Math.cos(c) * 0.45, 1.3 - Math.cos(c) * 0.45],
          shX: [-1.1, -1.1],
          shZ: [-0.05, 0.05],
          elbow: [-0.3, -0.3],
          chestX: 0.35 * (1 - sit * 0.4),
        };
      }
      case 'row': {
        const c = (Math.sin(now * 3) + 1) / 2;
        return {
          legHip: [-1.5 + c * 1.0, -1.5 + c * 1.0],
          legKnee: [2.1 - c * 1.9, 2.1 - c * 1.9],
          shX: [-1.4 + c * 0.9, -1.4 + c * 0.9],
          elbow: [-0.1 - c * 1.5, -0.1 - c * 1.5],
          chestX: 0.45 - c * 0.7,
          hipZ: -0.3 + c * 0.45,
        };
      }
      case 'lift': {
        const c = (Math.sin(now * 3.2) + 1) / 2;
        return { shX: [-0.15, -0.15], shZ: [-0.12, 0.12], elbow: [-0.2 - c * 2.0, -0.2 - (1 - c) * 2.0] };
      }
      case 'punch': {
        const p = Math.max(0, Math.sin(now * 8));
        const q = Math.max(0, -Math.sin(now * 8));
        return { shX: [-1.4 - p * 0.2, -1.4 - q * 0.2], shZ: [0.2, -0.2], elbow: [-1.6 + p * 1.5, -1.6 + q * 1.5], chestY: (p - q) * 0.25, legHip: [-0.25, 0.15], legKnee: [0.25, 0.25] };
      }
      case 'yoga': {
        const c = (Math.sin(now * 0.8) + 1) / 2;
        return { shX: [-3.0, -3.0], shZ: [0.15, -0.15], elbow: [0, 0], legHip: [-0.6 * c, 0], legSide: [-0.9 * c, 0], legKnee: [2.2 * c, 0] };
      }
      case 'stretch': {
        const c = Math.sin(now * 1.2);
        return { shX: [-3.0, -3.0], shZ: [-0.3 + c * 0.2, 0.3 + c * 0.2], elbow: [0, 0], chestZ: c * 0.25 };
      }
      case 'swing':
        return { shX: [-2.4, -2.4], shZ: [-0.05, 0.05], elbow: [-0.4, -0.4], legKnee: [Math.PI / 2 - 0.02 + Math.sin(now * 2.2) * 0.5, Math.PI / 2 - 0.02 + Math.sin(now * 2.2) * 0.5] };
      case 'slide':
        return { shX: [-2.8, -2.8], shZ: [-0.4, 0.4], elbow: [-0.2, -0.2], legKnee: [0.2, 0.2], legHip: [-1.45, -1.45] };
      case 'kick': {
        const k = Math.sin(Math.min(1, at / 0.55) * Math.PI);
        return { legHip: [-1.3 * k + 0.4 * (1 - k), N], legKnee: [0.3 * (1 - k) + 0.1, N], shX: [0.5 * k, -0.6 * k], chestX: -0.15 * k };
      }
      case 'shoot': {
        const k = Math.min(1, at / 0.4);
        return { shX: [-2.2 - 0.6 * k, -2.2 - 0.4 * k], shZ: [0.1, -0.1], elbow: [-1.4 + 1.3 * k, -1.4 + 1.0 * k], legKnee: [0.5 * (1 - k), 0.5 * (1 - k)], headX: -0.25 };
      }
      case 'throw': {
        const k = Math.min(1, at / 0.35);
        return { shX: [-1.8 - 0.3 * (1 - k), N], shZ: [0.05, N], elbow: [-1.9 + 1.7 * k, N], headX: -0.05 };
      }
      case 'pet': {
        const c = Math.sin(now * 4);
        return {
          hipY: this.legLen * 0.62,
          legHip: [-1.1, -0.2],
          legKnee: [1.6, 1.9],
          chestX: 0.55,
          shX: [-0.9 + c * 0.25, -0.2],
          shZ: [0.1, 0.1],
          elbow: [-0.3, -0.4],
          headX: 0.25,
        };
      }
      case 'sleep':
        return { shX: [-0.1, -0.1], shZ: [0.15, -0.15], elbow: [-0.3, -0.3], headY: 0.3 };
      case 'game':
        return { shX: [-0.85, -0.85], shZ: [0.3, -0.3], elbow: [-1.2 + Math.sin(now * 17) * 0.05, -1.2 + Math.sin(now * 13 + 2) * 0.05], headX: sit > 0.5 ? 0 : -0.05, chestY: Math.sin(now * 2) * 0.08 };
      case 'play': {
        const c = Math.sin(now * 3);
        return { shX: [-0.9 + c * 0.6, -0.7], shZ: [0.15, -0.2], elbow: [-0.8 - c * 0.3, -0.9], chestX: 0.3, headX: 0.2, legHip: [-0.3, 0.1], legKnee: [0.35, 0.2] };
      }
      case 'wash': {
        const c = Math.sin(now * 9);
        return { shX: [-2.6, -2.6], shZ: [-0.6 + c * 0.15, 0.6 - c * 0.15], elbow: [-2.0, -2.0], headX: -0.2 };
      }
      case 'feed': {
        const c = Math.sin(now * 6);
        return { shX: [-1.3, N], shZ: [0.1, N], elbow: [-0.4 + c * 0.15, N], headX: 0.3 };
      }
      case 'call':
        return { shX: [-1.4, -1.4], shZ: [0.55, -0.55], elbow: [-2.2, -2.2], headX: -0.15 };
      case 'photo':
        return { shX: [-1.5, -1.4], shZ: [0.35, -0.35], elbow: [-0.9, -0.9], headX: -0.05 };
      default:
        return {};
    }
  }
}
