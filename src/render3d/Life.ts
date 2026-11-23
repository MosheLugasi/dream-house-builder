import * as THREE from 'three';
import { audio } from '../audio';
import type { PetRuntime } from '../catalog/types';
import { report, useProgress } from '../game/progress';
import { getGraph } from '../model/graph';
import { levelElevation, ROAD_CELL, toLocal, toSite, type Building, type Project, type Vec2 } from '../model/types';
import type { ItemRef } from './Interactions';
import type { Usable, WalkController } from './WalkController';

// ---- particles -------------------------------------------------------------------------------

type ParticleKind = 'spark' | 'heart' | 'confetti';

function particleTexture(kind: ParticleKind): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 48;
  const ctx = c.getContext('2d')!;
  if (kind === 'spark') {
    const g = ctx.createRadialGradient(24, 24, 0, 24, 24, 24);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.3, 'rgba(255,236,150,0.9)');
    g.addColorStop(1, 'rgba(255,200,60,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 48, 48);
  } else if (kind === 'heart') {
    ctx.fillStyle = '#ff5a7a';
    ctx.beginPath();
    ctx.moveTo(24, 40);
    ctx.bezierCurveTo(2, 24, 8, 6, 24, 16);
    ctx.bezierCurveTo(40, 6, 46, 24, 24, 40);
    ctx.fill();
  } else {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(12, 16, 24, 14);
  }
  return new THREE.CanvasTexture(c);
}

interface Particle {
  sprite: THREE.Sprite;
  vel: THREE.Vector3;
  life: number;
  max: number;
  gravity: number;
  size: number;
}

/** Tiny sprite bursts: sparkles for stars, hearts for pets, confetti for goals. */
export class Particles {
  readonly group = new THREE.Group();
  private textures = new Map<ParticleKind, THREE.CanvasTexture>();
  private live: Particle[] = [];

  burst(kind: ParticleKind, at: THREE.Vector3, count: number): void {
    let tex = this.textures.get(kind);
    if (!tex) {
      tex = particleTexture(kind);
      this.textures.set(kind, tex);
    }
    const colors = ['#ff6b6b', '#ffd166', '#4ecdc4', '#a78bfa', '#7bd389', '#ff9f68'];
    for (let i = 0; i < count; i++) {
      const mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
        blending: kind === 'spark' ? THREE.AdditiveBlending : THREE.NormalBlending,
        color: kind === 'confetti' ? colors[i % colors.length] : kind === 'spark' ? new THREE.Color(1.6, 1.4, 0.8) : '#ffffff',
        rotation: Math.random() * Math.PI,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.position.copy(at);
      const a = Math.random() * Math.PI * 2;
      const up = kind === 'heart' ? 0.7 + Math.random() * 0.5 : 1.5 + Math.random() * 3;
      const out = kind === 'heart' ? 0.25 : kind === 'confetti' ? 2.5 : 1.6;
      const size = kind === 'heart' ? 0.16 : kind === 'confetti' ? 0.12 : 0.14;
      this.group.add(sprite);
      this.live.push({
        sprite,
        vel: new THREE.Vector3(Math.cos(a) * out * Math.random(), up, Math.sin(a) * out * Math.random()),
        life: 0,
        max: kind === 'heart' ? 1.4 : kind === 'confetti' ? 2.2 : 0.8,
        gravity: kind === 'heart' ? 0 : kind === 'confetti' ? 3.5 : 5,
        size,
      });
    }
  }

  update(dt: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      p.life += dt;
      p.vel.y -= p.gravity * dt;
      p.sprite.position.addScaledVector(p.vel, dt);
      const t = p.life / p.max;
      p.sprite.scale.setScalar(p.size * (t < 0.2 ? t / 0.2 : 1));
      p.sprite.material.opacity = Math.max(0, 1 - t * t);
      if (t >= 1) {
        this.group.remove(p.sprite);
        p.sprite.material.dispose();
        this.live.splice(i, 1);
      }
    }
  }
}

// ---- collectible stars -----------------------------------------------------------------------

interface Star {
  id: string;
  mesh: THREE.Mesh;
  base: THREE.Vector3;
}

let starGeo: THREE.BufferGeometry | null = null;
function starGeometry(): THREE.BufferGeometry {
  if (starGeo) return starGeo;
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.085 : 0.2;
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  shape.closePath();
  starGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.018, bevelSize: 0.018, bevelSegments: 2 });
  starGeo.translate(0, 0, -0.025);
  return starGeo;
}
const starMaterial = new THREE.MeshStandardMaterial({ color: '#ffcf3a', emissive: '#ffb300', emissiveIntensity: 1.3, roughness: 0.3, metalness: 0.4 });

/**
 * Gold stars scattered around the neighborhood: along the streets, in parks and inside buildings.
 * Walking (or riding) through one collects it. Which stars are placed depends only on the project,
 * and what was collected is remembered per project.
 */
export class Stars {
  readonly group = new THREE.Group();
  private stars: Star[] = [];
  private total = 0;
  private projectId = '';
  private key: unknown[] = [];
  private clock = 0;

  constructor(private particles: Particles) {}

  get count(): { found: number; total: number } {
    const found = useProgress.getState().stars[this.projectId]?.length ?? 0;
    return { found: Math.min(found, this.total), total: this.total };
  }

  /** (Re)place the stars for a project. Cheap to call: it only rebuilds when the layout changed. */
  build(project: Project, groundAt: (x: number, y: number) => number): void {
    const collected = useProgress.getState().stars[project.id] ?? [];
    const key = [project.id, project.site.roads, project.site.areas, project.buildings.length, collected.length === 0];
    if (key.length === this.key.length && key.every((v, i) => v === this.key[i])) return;
    this.key = key;
    this.projectId = project.id;
    for (const s of this.stars) this.group.remove(s.mesh);
    this.stars = [];
    const spots: { id: string; x: number; y: number; h: number }[] = [];
    // along the streets: every third road cell, on a sidewalk corner
    project.site.roads.forEach(([i, j], n) => {
      if (n % 3) return;
      const cx = (n % 2 ? i + 0.9 : i + 0.1) * ROAD_CELL;
      const cy = (n % 4 < 2 ? j + 0.1 : j + 0.9) * ROAD_CELL;
      spots.push({ id: `r${i},${j}`, x: cx, y: cy, h: groundAt(cx, cy) });
    });
    // in parks and plazas
    for (const a of project.site.areas.slice(0, 8)) {
      const x = (a.x0 + a.x1) / 2;
      const y = (a.y0 + a.y1) / 2;
      if (a.finish === 'water') continue;
      spots.push({ id: `a${a.id}`, x, y, h: 0 });
    }
    // inside buildings: the biggest room of every level
    for (const b of project.buildings) {
      b.levels.forEach((lvl, li) => {
        const room = getGraph(lvl.walls)
          .rooms.slice()
          .sort((p, q) => q.area - p.area)[li === 0 ? 1 : 0];
        if (!room) return;
        const p = toSite(b, room.labelPoint);
        spots.push({ id: `b${b.id}:${li}`, x: p.x, y: p.y, h: levelElevation(b, li) });
      });
    }
    this.total = spots.length;
    for (const s of spots) {
      if (collected.includes(s.id)) continue;
      const mesh = new THREE.Mesh(starGeometry(), starMaterial);
      mesh.castShadow = true;
      const base = new THREE.Vector3(s.x, s.h + 1.05, s.y);
      mesh.position.copy(base);
      this.group.add(mesh);
      this.stars.push({ id: s.id, mesh, base });
    }
  }

  update(dt: number, walker: WalkController): void {
    this.clock += dt;
    const reach = walker.driving ? 1.6 : 0.85;
    for (let i = this.stars.length - 1; i >= 0; i--) {
      const s = this.stars[i];
      s.mesh.rotation.y = this.clock * 1.6 + i;
      s.mesh.position.y = s.base.y + Math.sin(this.clock * 2 + i * 1.7) * 0.08;
      const d = Math.hypot(s.base.x - walker.pos.x, s.base.z - walker.pos.y);
      if (d < reach && Math.abs(s.base.y - 1.05 - walker.y) < 1.4) {
        this.group.remove(s.mesh);
        this.stars.splice(i, 1);
        this.particles.burst('spark', s.mesh.position, 14);
        audio.play('star');
        useProgress.getState().collectStar(this.projectId, s.id);
        const { found, total } = this.count;
        if (found >= total && total > 0) {
          audio.play('fanfare');
          useProgress.getState().setFlash(`🌟 אספתם את כל ${total} הכוכבים!`);
        } else useProgress.getState().setFlash(`⭐ ${found} / ${total}`);
      }
    }
  }
}

// ---- balls -----------------------------------------------------------------------------------

interface Ball {
  ref: ItemRef;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  radius: number;
  bounce: number;
  mass: number;
  mesh: THREE.Object3D | null;
  kickCooldown: number;
}

interface GoalMouth {
  pos: Vec2;
  rotation: number;
  hw: number;
  depth: number;
  height: number;
}

/** Kickable balls with simple, believable physics (site props only). */
export class Balls {
  private balls: Ball[] = [];
  private goals: GoalMouth[] = [];
  private goalCooldown = 0;

  constructor(private particles: Particles) {}

  set(refs: ItemRef[], goals: ItemRef[]): void {
    const old = new Map(this.balls.map((b) => [b.ref.item.id, b]));
    this.balls = refs.map((ref) => {
      const prev = old.get(ref.item.id);
      if (prev && prev.ref.holder === ref.holder) {
        prev.ref = ref;
        return prev;
      }
      const spec = ref.def.ball!;
      const body = ref.holder.userData.body as THREE.Object3D | undefined;
      return {
        ref,
        pos: new THREE.Vector3(ref.pos.x, ref.floorY, ref.pos.y),
        vel: new THREE.Vector3(),
        radius: spec.radius,
        bounce: spec.bounce,
        mass: spec.mass,
        mesh: (body?.userData.ballMesh as THREE.Object3D | undefined) ?? null,
        kickCooldown: 0,
      };
    });
    this.goals = goals.map((g) => ({ pos: g.pos, rotation: g.rotation, hw: g.def.size.w / 2 - 0.08, depth: g.def.size.d, height: g.def.size.h - 0.1 }));
  }

  update(dt: number, walker: WalkController, groundAt: (x: number, y: number) => number): void {
    this.goalCooldown -= dt;
    const kicker = walker.pos;
    const kv = walker.velocity;
    const kickerSpeed = Math.hypot(kv.x, kv.y);
    const kickerRadius = walker.driving ? walker.currentVehicle!.def.vehicle!.radius : 0.28;
    for (const b of this.balls) {
      b.kickCooldown -= dt;
      const ground = groundAt(b.pos.x, b.pos.z);
      // kicks
      const dx = b.pos.x - kicker.x;
      const dz = b.pos.z - kicker.y;
      const d = Math.hypot(dx, dz);
      if (d < b.radius + kickerRadius && Math.abs(b.pos.y - walker.y) < 1 && b.kickCooldown <= 0) {
        const nx = d > 1e-4 ? dx / d : Math.sin(walker.facing);
        const nz = d > 1e-4 ? dz / d : Math.cos(walker.facing);
        if (kickerSpeed > 0.4) {
          const power = (2.2 + kickerSpeed * 1.5) / Math.sqrt(Math.max(0.2, b.mass) / 0.43);
          // mostly where the kicker is heading, a little away from the foot
          b.vel.x = (kv.x / kickerSpeed) * power * 0.8 + nx * power * 0.2;
          b.vel.z = (kv.y / kickerSpeed) * power * 0.8 + nz * power * 0.2;
          b.vel.y = 1.6 + kickerSpeed * 0.45;
          b.kickCooldown = 0.35;
          audio.play('kick', { volume: Math.min(1, 0.5 + kickerSpeed * 0.12) });
          if (!walker.driving) walker.character.gesture('kick');
          report('ball-kicked');
        } else {
          // a ball that rolls into a standing person stops there
          b.pos.x = kicker.x + nx * (b.radius + kickerRadius);
          b.pos.z = kicker.y + nz * (b.radius + kickerRadius);
          b.vel.x *= 0.3;
          b.vel.z *= 0.3;
        }
      }
      const moving = b.vel.lengthSq() > 1e-4 || b.pos.y > ground + 1e-3;
      if (!moving) continue;
      // integrate
      b.vel.y -= 12 * dt;
      b.pos.addScaledVector(b.vel, dt);
      if (b.pos.y <= ground) {
        b.pos.y = ground;
        if (b.vel.y < -1.2) {
          b.vel.y = -b.vel.y * b.bounce;
          audio.play('bounce', { volume: Math.min(0.8, Math.abs(b.vel.y) * 0.12) });
        } else b.vel.y = 0;
        // rolling resistance (grass slows more than you would think)
        const sp = Math.hypot(b.vel.x, b.vel.z);
        const drop = (1.1 + sp * 0.25) * dt;
        const k = sp > drop ? (sp - drop) / sp : 0;
        b.vel.x *= k;
        b.vel.z *= k;
      }
      // walls and furniture
      const p2 = { x: b.pos.x, y: b.pos.z };
      walker.collide(p2, b.radius, Math.max(0, b.pos.y), b.ref.item.id);
      const px = p2.x - b.pos.x;
      const pz = p2.y - b.pos.z;
      const pl = Math.hypot(px, pz);
      if (pl > 1e-5) {
        const nx = px / pl;
        const nz = pz / pl;
        const vn = b.vel.x * nx + b.vel.z * nz;
        if (vn < 0) {
          b.vel.x -= (1 + b.bounce) * vn * nx;
          b.vel.z -= (1 + b.bounce) * vn * nz;
          if (vn < -1.5) audio.play('bounce', { volume: Math.min(0.7, -vn * 0.1) });
        }
        b.pos.x = p2.x;
        b.pos.z = p2.y;
      }
      // goals
      if (this.goalCooldown <= 0) {
        for (const g of this.goals) {
          const c = Math.cos(-g.rotation);
          const s = Math.sin(-g.rotation);
          const rx = b.pos.x - g.pos.x;
          const rz = b.pos.z - g.pos.y;
          const lx = rx * c - rz * s;
          const lz = rx * s + rz * c;
          if (Math.abs(lx) < g.hw && lz > -g.depth / 2 && lz < g.depth / 2 - 0.12 && b.pos.y < g.height && b.vel.lengthSq() > 0.3) {
            this.goalCooldown = 4;
            b.vel.multiplyScalar(0.15);
            audio.play('goal');
            report('goal-scored');
            useProgress.getState().setFlash('⚽ גוווול!');
            this.particles.burst('confetti', new THREE.Vector3(g.pos.x, 2.2, g.pos.y), 40);
            if (!walker.driving) walker.character.gesture('cheer');
          }
        }
      }
      // the net catches whatever flies into a goal
      for (const g of this.goals) {
        const c = Math.cos(-g.rotation);
        const s = Math.sin(-g.rotation);
        const rx = b.pos.x - g.pos.x;
        const rz = b.pos.z - g.pos.y;
        const lx = rx * c - rz * s;
        const lz = rx * s + rz * c;
        if (Math.abs(lx) < g.hw + 0.1 && lz < -g.depth / 2 + b.radius && lz > -g.depth / 2 - 0.5 && b.pos.y < g.height) {
          // push back along the goal's local +z axis, which is (-sin r, cos r) on the plan
          const back = -g.depth / 2 + b.radius - lz;
          b.pos.x += -Math.sin(g.rotation) * back;
          b.pos.z += Math.cos(g.rotation) * back;
          b.vel.multiplyScalar(0.2);
        }
      }
      // show it
      const holder = b.ref.holder;
      holder.position.set(b.pos.x, b.pos.y, b.pos.z);
      if (b.mesh) {
        const sp = Math.hypot(b.vel.x, b.vel.z);
        if (sp > 1e-3) {
          const axis = new THREE.Vector3(b.vel.z / sp, 0, -b.vel.x / sp);
          b.mesh.rotateOnWorldAxis(axis, (sp * dt) / b.radius);
        }
      }
    }
  }
}

// ---- pets ------------------------------------------------------------------------------------

interface PetActor {
  ref: ItemRef;
  runtime: PetRuntime;
  /** building the pet lives in (its 3D object is in that building's local frame), or null on the site */
  home: Building | null;
  pos: Vec2;
  heading: number;
  homePos: Vec2;
  target: Vec2 | null;
  following: boolean;
  speed: number;
  mood: 'idle' | 'sit' | 'lie' | 'happy';
  timer: number;
  happy: number;
  stuck: number;
  detour: number;
  detourSide: number;
  usable: Usable;
}

/** Dogs and cats: they wander around their home, and follow you once you have petted them. */
export class Pets {
  private pets: PetActor[] = [];

  constructor(private particles: Particles) {}

  /** Usables (F = pet) for the walk world; call after `set`. */
  get usables(): Usable[] {
    return this.pets.map((p) => p.usable);
  }

  set(refs: { ref: ItemRef; home: Building | null }[]): void {
    const old = new Map(this.pets.map((p) => [p.ref.item.id, p]));
    this.pets = [];
    for (const { ref, home } of refs) {
      const body = ref.holder.userData.body as THREE.Object3D | undefined;
      const runtime = body?.userData.pet as PetRuntime | undefined;
      if (!runtime || !ref.def.pet) continue;
      const prev = old.get(ref.item.id);
      if (prev && prev.ref.holder === ref.holder) {
        prev.ref = ref;
        this.pets.push(prev);
        continue;
      }
      const label = ref.def.pet.label;
      const actor: PetActor = {
        ref,
        runtime,
        home,
        pos: { ...ref.pos },
        heading: ref.rotation,
        homePos: { ...ref.pos },
        target: null,
        following: prev?.following ?? false,
        speed: 0,
        mood: 'idle',
        timer: 1 + Math.random() * 3,
        happy: 0,
        stuck: 0,
        detour: 0,
        detourSide: 1,
        usable: {
          id: `${ref.item.id}:pet`,
          pos: { ...ref.pos },
          y: ref.floorY,
          reach: 1.3,
          prompt: () => (actor.following ? `ללטף את ה${label} (ולהגיד לו להישאר)` : `ללטף את ה${label}`),
          use: () => this.pet(actor),
        },
      };
      this.pets.push(actor);
    }
  }

  private walker: WalkController | null = null;

  private pet(a: PetActor): void {
    a.happy = 2.6;
    a.following = !a.following;
    a.target = null;
    const kind = a.ref.def.pet!.kind;
    audio.play(kind === 'dog' ? 'bark' : 'meow', { volume: 0.8 });
    if (kind === 'cat') audio.play('purr', { volume: 0.5 });
    this.particles.burst('heart', new THREE.Vector3(a.pos.x, a.ref.floorY + a.ref.def.size.h + 0.15, a.pos.y), 5);
    this.walker?.character.gesture('pet');
    report('pet-petted');
    useProgress.getState().setFlash(a.following ? `ה${a.ref.def.pet!.label} בא איתך ❤` : `ה${a.ref.def.pet!.label} נשאר כאן`);
  }

  update(dt: number, walker: WalkController): void {
    this.walker = walker;
    for (const a of this.pets) {
      const spec = a.ref.def.pet!;
      a.happy -= dt;
      a.timer -= dt;
      const sameFloor = Math.abs(walker.y - a.ref.floorY) < 1.2;
      const toWalker = Math.hypot(walker.pos.x - a.pos.x, walker.pos.y - a.pos.y);
      let wantSpeed = 0;
      let dest: Vec2 | null = null;

      if (a.happy > 0) {
        a.mood = 'happy';
        // look at the person
        if (toWalker > 0.05) a.heading = Math.atan2(walker.pos.x - a.pos.x, walker.pos.y - a.pos.y);
      } else if (a.following && sameFloor) {
        if (toWalker > 1.7) {
          // heel: a spot beside and a little behind the person
          dest = { x: walker.pos.x - Math.sin(walker.facing) * 0.7 + Math.cos(walker.facing) * 0.6, y: walker.pos.y - Math.cos(walker.facing) * 0.7 - Math.sin(walker.facing) * 0.6 };
          wantSpeed = toWalker > 5 ? spec.runSpeed : Math.min(spec.walkSpeed * 1.5, 0.6 + toWalker * 0.7);
          a.mood = 'idle';
          a.timer = 2.5;
        } else if (a.timer <= 0) a.mood = 'sit';
      } else {
        // potter about near home
        if (a.target && Math.hypot(a.target.x - a.pos.x, a.target.y - a.pos.y) < 0.25) {
          a.target = null;
          a.timer = 2 + Math.random() * 5;
          a.mood = Math.random() < 0.5 ? 'sit' : Math.random() < 0.5 ? 'lie' : 'idle';
        }
        if (!a.target && a.timer <= 0) {
          const ang = Math.random() * Math.PI * 2;
          const r = 0.8 + Math.random() * 2.6;
          a.target = { x: a.homePos.x + Math.cos(ang) * r, y: a.homePos.y + Math.sin(ang) * r };
          a.mood = 'idle';
        }
        if (a.target) {
          dest = a.target;
          wantSpeed = spec.walkSpeed * 0.8;
        }
        // greet a visitor
        if (!a.target && sameFloor && toWalker < 2.2 && a.mood !== 'idle') a.mood = 'idle';
      }

      a.speed += (wantSpeed - a.speed) * Math.min(1, dt * 5);
      if (dest && a.speed > 0.02) {
        a.detour -= dt;
        // blocked a moment ago: walk around the obstacle for a bit
        const want = Math.atan2(dest.x - a.pos.x, dest.y - a.pos.y) + (a.detour > 0 ? a.detourSide * 1.25 : 0);
        let diff = want - a.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        a.heading += diff * Math.min(1, dt * 7);
        const before = { ...a.pos };
        a.pos.x += Math.sin(a.heading) * a.speed * dt;
        a.pos.y += Math.cos(a.heading) * a.speed * dt;
        walker.collide(a.pos, 0.18, a.ref.floorY, a.ref.item.id);
        const moved = Math.hypot(a.pos.x - before.x, a.pos.y - before.y);
        // blocked by a wall or furniture: give up on this spot
        a.stuck = moved < a.speed * dt * 0.3 ? a.stuck + dt : 0;
        if (a.stuck > 0.35) {
          a.stuck = 0;
          if (a.following) {
            a.detour = 0.9;
            a.detourSide = a.detour > 0 && Math.random() < 0.5 ? -1 : 1;
          } else {
            a.target = null;
            a.timer = 0.5;
          }
        }
      }
      a.runtime.update(dt, a.speed, a.speed > 0.05 ? 'idle' : a.mood);

      // place the 3D object (in its building's frame when it lives indoors)
      const holder = a.ref.holder;
      if (a.home) {
        const l = toLocal(a.home, a.pos);
        holder.position.x = l.x;
        holder.position.z = l.y;
        holder.rotation.y = a.heading + a.home.rotation;
      } else {
        holder.position.x = a.pos.x;
        holder.position.z = a.pos.y;
        holder.rotation.y = a.heading;
      }
      a.usable.pos.x = a.pos.x;
      a.usable.pos.y = a.pos.y;
    }
  }
}
