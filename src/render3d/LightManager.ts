import * as THREE from 'three';

export interface LampSource {
  id: string;
  pos: THREE.Vector3;
  color: string;
  /** catalog intensity (candela-ish, tuned for a dark room) */
  intensity: number;
  distance: number;
}

const POOL = 8;
/** catalog intensities are scaled down: by day a lamp only adds a faint pool of light */
const DAY_SCALE = 0.025;
const NIGHT_SCALE = 0.075;

let glowTexture: THREE.CanvasTexture | null = null;
function glowMap(): THREE.CanvasTexture {
  if (glowTexture) return glowTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.18, 'rgba(255,255,255,0.75)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.2)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  glowTexture = new THREE.CanvasTexture(c);
  return glowTexture;
}

/**
 * Lamps. Every lamp that is on shows a glow, but real-time lights are expensive (and changing
 * their number recompiles every shader), so a fixed pool of point lights is handed to the lamps
 * nearest to the viewer and faded in and out.
 */
export class LightManager {
  readonly group = new THREE.Group();
  private pool: { light: THREE.PointLight; source: LampSource | null; target: number }[] = [];
  private glows = new Map<string, THREE.Sprite>();
  private sources: LampSource[] = [];
  /** switches flipped by the player: id -> on/off (otherwise lamps follow the time of day) */
  private overrides = new Map<string, boolean>();
  private timer = 0;
  /** headlights of the vehicle being driven */
  readonly headlight = new THREE.SpotLight('#fff3d6', 0, 55, 0.46, 0.6, 1.25);

  constructor() {
    for (let i = 0; i < POOL; i++) {
      const light = new THREE.PointLight('#ffffff', 0, 8, 2);
      this.group.add(light);
      this.pool.push({ light, source: null, target: 0 });
    }
    this.group.add(this.headlight, this.headlight.target);
  }

  setSources(list: LampSource[]): void {
    this.sources = list;
    const ids = new Set(list.map((s) => s.id));
    for (const [id, sprite] of this.glows) {
      if (!ids.has(id)) {
        this.group.remove(sprite);
        sprite.material.dispose();
        this.glows.delete(id);
      }
    }
    for (const slot of this.pool) if (slot.source && !ids.has(slot.source.id)) slot.source = null;
    this.timer = 0;
  }

  isOn(id: string, night: number): boolean {
    return this.overrides.get(id) ?? night > 0.45;
  }

  /** Flip a lamp's switch; returns the new state. */
  toggle(id: string, night: number): boolean {
    const next = !this.isOn(id, night);
    this.overrides.set(id, next);
    this.timer = 0;
    return next;
  }

  update(dt: number, focus: THREE.Vector3, night: number): void {
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 0.25;
      const on = this.sources.filter((s) => this.isOn(s.id, night));
      // glows
      const lit = new Set(on.map((s) => s.id));
      for (const s of on) {
        if (this.glows.has(s.id)) continue;
        const sprite = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: glowMap(), color: new THREE.Color(s.color).multiplyScalar(1.05), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
        );
        sprite.position.copy(s.pos);
        sprite.scale.setScalar(0.18 + Math.sqrt(s.intensity) * 0.024);
        this.group.add(sprite);
        this.glows.set(s.id, sprite);
      }
      for (const [id, sprite] of this.glows) sprite.visible = lit.has(id);
      // the nearest lamps get the real lights
      // far-reaching lamps (street lights) matter from further away than a bedside lamp
      const score = (s: LampSource) => s.pos.distanceTo(focus) / s.distance;
      on.sort((a, b) => score(a) - score(b));
      const wanted = on.slice(0, POOL);
      const wantedIds = new Set(wanted.map((s) => s.id));
      const scale = DAY_SCALE + (NIGHT_SCALE - DAY_SCALE) * night;
      for (const slot of this.pool) {
        if (slot.source && !wantedIds.has(slot.source.id)) slot.target = 0;
        else if (slot.source) slot.target = slot.source.intensity * scale * (slot.source.distance > 15 ? 2 : 1);
      }
      const held = new Set(this.pool.filter((s) => s.source && s.target > 0).map((s) => s.source!.id));
      for (const s of wanted) {
        if (held.has(s.id)) continue;
        const free = this.pool.find((slot) => slot.light.intensity < 1e-3 && (slot.target === 0 || !slot.source));
        if (!free) break;
        free.source = s;
        free.target = s.intensity * scale * (s.distance > 15 ? 2 : 1);
        free.light.position.copy(s.pos);
        free.light.color.set(s.color);
        free.light.distance = s.distance;
      }
    }
    const k = Math.min(1, dt * 6);
    for (const slot of this.pool) {
      slot.light.intensity += (slot.target - slot.light.intensity) * k;
      if (slot.target === 0 && slot.light.intensity < 1e-3) {
        slot.light.intensity = 0;
        slot.source = null;
      }
    }
  }
}
