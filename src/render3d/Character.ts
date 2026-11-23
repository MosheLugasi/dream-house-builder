import * as THREE from 'three';

export interface CharacterLook {
  height: number;
  skin: string;
  hair: string;
  shirt: string;
  pants: string;
  shoes: string;
  longHair: boolean;
}

export const DEFAULT_LOOK: CharacterLook = {
  height: 1.5,
  skin: '#e8b996',
  hair: '#5a3620',
  shirt: '#e8725a',
  pants: '#3f5f8a',
  shoes: '#f4f4f2',
  longHair: true,
};

export type Pose = 'stand' | 'sit' | 'lie' | 'ride';

const damp = (current: number, target: number, lambda: number, dt: number) =>
  current + (target - current) * (1 - Math.exp(-lambda * dt));

/**
 * A simple procedurally built and animated person. Origin at the feet, facing +Z.
 * (A rigged glTF character can replace this class later without touching the controller.)
 */
export class Character {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private hips = new THREE.Group();
  private chest = new THREE.Group();
  private head = new THREE.Group();
  private legs: { hip: THREE.Group; knee: THREE.Group }[] = [];
  private arms: { shoulder: THREE.Group; elbow: THREE.Group }[] = [];
  private phase = 0;
  private legLen: number;
  private moveBlend = 0;
  private pose: Pose = 'stand';
  private seatHeight = 0.45;
  private poseBlend = 0; // 0 stand .. 1 sit/lie
  private lieBlend = 0;
  private rideBlend = 0;
  private reachBlend = 0;
  /** hold on to a handlebar while standing (kick scooter) */
  reach = false;
  readonly eyeHeight: number;

  constructor(look: CharacterLook = DEFAULT_LOOK) {
    const s = look.height / 1.7;
    const skin = new THREE.MeshStandardMaterial({ color: look.skin, roughness: 0.65 });
    const hair = new THREE.MeshStandardMaterial({ color: look.hair, roughness: 0.8 });
    const shirt = new THREE.MeshStandardMaterial({ color: look.shirt, roughness: 0.85 });
    const pants = new THREE.MeshStandardMaterial({ color: look.pants, roughness: 0.85 });
    const shoes = new THREE.MeshStandardMaterial({ color: look.shoes, roughness: 0.6 });
    const dark = new THREE.MeshStandardMaterial({ color: '#2a2320', roughness: 0.4 });

    const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      return m;
    };
    const capsule = (r: number, len: number) => new THREE.CapsuleGeometry(r, Math.max(0.001, len - 2 * r), 6, 14);

    const thigh = 0.44 * s;
    const shin = 0.43 * s;
    const foot = 0.07 * s;
    this.legLen = thigh + shin + foot;
    const torsoLen = 0.52 * s;
    const hipW = 0.1 * s;

    this.root.add(this.body);
    this.body.add(this.hips);
    this.hips.position.y = this.legLen;

    // pelvis + torso
    this.hips.add(mesh(capsule(0.115 * s, 0.3 * s).rotateZ(Math.PI / 2), pants, 0, 0.02 * s, 0));
    this.hips.add(this.chest);
    this.chest.position.y = 0.06 * s;
    const torso = mesh(capsule(0.135 * s, torsoLen), shirt, 0, torsoLen / 2, 0);
    torso.scale.set(1.12, 1, 0.78);
    this.chest.add(torso);
    // neck + head
    this.chest.add(mesh(new THREE.CylinderGeometry(0.045 * s, 0.05 * s, 0.08 * s, 12), skin, 0, torsoLen + 0.03 * s, 0));
    this.head.position.y = torsoLen + 0.17 * s;
    this.chest.add(this.head);
    const skull = mesh(new THREE.SphereGeometry(0.115 * s, 24, 18), skin);
    skull.scale.set(0.94, 1.08, 1);
    this.head.add(skull);
    // hair cap
    const cap = mesh(new THREE.SphereGeometry(0.122 * s, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.56), hair, 0, 0.012 * s, -0.012 * s);
    cap.scale.set(0.97, 1.08, 1.04);
    cap.rotation.x = -0.25;
    this.head.add(cap);
    if (look.longHair) {
      const tail = mesh(capsule(0.04 * s, 0.3 * s), hair, 0, -0.1 * s, -0.12 * s);
      tail.rotation.x = 0.25;
      this.head.add(tail);
      this.head.add(mesh(new THREE.SphereGeometry(0.05 * s, 12, 10), hair, 0, 0.04 * s, -0.115 * s));
    }
    // face
    for (const sx of [-1, 1]) {
      this.head.add(mesh(new THREE.SphereGeometry(0.013 * s, 10, 8), dark, sx * 0.042 * s, 0.012 * s, 0.105 * s));
    }
    const smile = mesh(new THREE.TorusGeometry(0.028 * s, 0.005 * s, 6, 14, Math.PI), dark, 0, -0.035 * s, 0.103 * s);
    smile.rotation.z = Math.PI;
    this.head.add(smile);
    this.head.add(mesh(new THREE.SphereGeometry(0.014 * s, 8, 8), skin, 0, -0.008 * s, 0.116 * s));

    // legs
    for (const sx of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(sx * hipW, 0, 0);
      hip.add(mesh(capsule(0.075 * s, thigh + 0.05 * s), pants, 0, -thigh / 2, 0));
      const knee = new THREE.Group();
      knee.position.y = -thigh;
      knee.add(mesh(capsule(0.058 * s, shin + 0.04 * s), pants, 0, -shin / 2, 0));
      const shoe = mesh(capsule(0.05 * s, 0.2 * s).rotateX(Math.PI / 2), shoes, 0, -shin - foot / 2 + 0.01 * s, 0.045 * s);
      shoe.scale.set(1, 0.8, 1);
      knee.add(shoe);
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
      shoulder.rotation.z = sx * 0.09;
      shoulder.add(mesh(new THREE.SphereGeometry(0.058 * s, 12, 10), shirt));
      shoulder.add(mesh(capsule(0.048 * s, upper + 0.03 * s), shirt, 0, -upper / 2, 0));
      const elbow = new THREE.Group();
      elbow.position.y = -upper;
      elbow.add(mesh(capsule(0.04 * s, fore + 0.03 * s), skin, 0, -fore / 2, 0));
      elbow.add(mesh(new THREE.SphereGeometry(0.048 * s, 12, 10), skin, 0, -fore - 0.02 * s, 0));
      shoulder.add(elbow);
      this.chest.add(shoulder);
      this.arms.push({ shoulder, elbow });
    }
    this.eyeHeight = this.legLen + torsoLen + 0.2 * s;
  }

  setPose(pose: Pose, seatHeight = 0.45): void {
    this.pose = pose;
    this.seatHeight = seatHeight;
  }

  getPose(): Pose {
    return this.pose;
  }

  /** speed in m/s (0 = idle). */
  update(dt: number, speed: number): void {
    const moving = speed > 0.05 && this.pose === 'stand';
    this.moveBlend = damp(this.moveBlend, moving ? 1 : 0, 10, dt);
    this.poseBlend = damp(this.poseBlend, this.pose === 'stand' ? 0 : 1, 9, dt);
    this.lieBlend = damp(this.lieBlend, this.pose === 'lie' ? 1 : 0, 7, dt);
    this.rideBlend = damp(this.rideBlend, this.pose === 'ride' ? 1 : 0, 9, dt);
    this.reachBlend = damp(this.reachBlend, this.reach ? 1 : 0, 9, dt);
    this.phase += this.pose === 'ride' ? dt * speed * 2.4 : dt * (4.2 + speed * 2.6) * (moving ? 1 : 0.25);
    const t = this.phase;
    const mb = this.moveBlend;
    const sit = this.poseBlend * (1 - this.lieBlend) * (1 - this.rideBlend);
    const stride = Math.min(0.75, 0.3 + speed * 0.14) * mb;

    const breath = Math.sin(performance.now() / 900) * 0.006;
    const bob = Math.abs(Math.sin(t)) * 0.035 * mb;
    const standY = this.legLen + bob;
    const sitY = this.seatHeight + 0.09;
    this.hips.position.y = THREE.MathUtils.lerp(standY, sitY, Math.max(sit, this.rideBlend));
    this.hips.position.z = THREE.MathUtils.lerp(0, -0.02, sit);
    this.chest.position.y = 0.06 * (this.legLen / 0.94) + breath;
    this.chest.rotation.x = 0.07 * mb + 0.04 * sit;
    this.chest.rotation.y = Math.sin(t) * 0.08 * mb;
    this.head.rotation.y = -Math.sin(t) * 0.05 * mb;

    const ride = this.rideBlend;
    this.chest.rotation.x += 0.42 * ride;
    this.head.rotation.x = -0.3 * ride;
    this.legs.forEach((leg, i) => {
      const ph = t + (i ? Math.PI : 0);
      const s = Math.sin(ph);
      const walkHip = -s * stride;
      const walkKnee = Math.max(0, Math.cos(ph)) * stride * 1.5 + 0.04 * mb;
      const sitHip = -Math.PI / 2 + 0.06;
      const sitKnee = Math.PI / 2 - 0.02;
      // pedalling: the foot travels around a circle
      const rideHip = -0.95 + Math.sin(ph) * 0.42;
      const rideKnee = 1.25 - Math.cos(ph) * 0.5;
      leg.hip.rotation.x = THREE.MathUtils.lerp(THREE.MathUtils.lerp(walkHip, sitHip, sit), rideHip, ride);
      leg.knee.rotation.x = THREE.MathUtils.lerp(THREE.MathUtils.lerp(walkKnee, sitKnee, sit), rideKnee, ride);
    });
    this.arms.forEach((arm, i) => {
      const s = Math.sin(t + (i ? 0 : Math.PI));
      const walkS = -s * stride * 0.85;
      const walkE = -0.18 - Math.max(0, -s) * stride * 0.7 - 0.25 * mb;
      const sh = THREE.MathUtils.lerp(THREE.MathUtils.lerp(walkS, -0.55, sit), -1.05, ride);
      const el = THREE.MathUtils.lerp(THREE.MathUtils.lerp(walkE, -0.75, sit), -0.35, ride);
      arm.shoulder.rotation.x = THREE.MathUtils.lerp(sh, -0.95, this.reachBlend);
      arm.elbow.rotation.x = THREE.MathUtils.lerp(el, -0.5, this.reachBlend);
    });

    // lying down: rotate the whole body onto its back
    const lie = this.lieBlend;
    this.body.rotation.x = (-Math.PI / 2) * lie;
    this.body.position.y = lie * (this.seatHeight + 0.12);
    this.body.position.z = lie * this.eyeHeight * 0.5;
  }
}
