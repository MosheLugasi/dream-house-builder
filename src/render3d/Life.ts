import * as THREE from 'three';
import { audio } from '../audio';
import { report, useProgress } from '../game/progress';
import { getGraph } from '../model/graph';
import { levelElevation, ROAD_CELL, toLocal, toSite, type Building, type Project, type Vec2 } from '../model/types';
import type { WalkController } from './WalkController';

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
