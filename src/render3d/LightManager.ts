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
/** lamps reaching further than this never cast shadows */
const SHADOW_RANGE = 10;

interface Slot {
  light: THREE.PointLight;
  source: LampSource | null;
  target: number;
}
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
  private pool: Slot[] = [];
  /** the first `shadowSlots` lights of the pool cast shadows */
  private shadowSlots = 0;
  private frame = 0;
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

  /**
   * How much lamp light reaches a point, relative to one ordinary lamp a couple of meters away
   * (lamps behind walls count too – it is only used to let the camera's exposure adapt).
   */
  brightnessAt(p: THREE.Vector3, night: number): number {
    let sum = 0;
    for (const s of this.sources) {
      if (!this.isOn(s.id, night)) continue;
      const d2 = s.pos.distanceToSquared(p);
      if (d2 > s.distance * s.distance) continue;
      sum += s.intensity / (4 + d2);
    }
    return sum / 12;
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
      const scale = DAY_SCALE + (NIGHT_SCALE - DAY_SCALE) * night;
      const strength = (src: LampSource) => src.intensity * scale * (src.distance > 15 ? 2 : 1);
      // the shadow-casting slots (if any) take the nearest lamps; the others take the rest. A lamp that
      // moves into a shadow slot cross-fades from its old slot.
      const casters = this.pool.slice(0, this.shadowSlots);
      const plain = this.pool.slice(this.shadowSlots);
      const assign = (slots: Slot[], want: LampSource[]) => {
        const ids = new Set(want.map((w) => w.id));
        for (const slot of slots) slot.target = slot.source && ids.has(slot.source.id) ? strength(slot.source) : 0;
        const held = new Set(slots.filter((sl) => sl.source && sl.target > 0).map((sl) => sl.source!.id));
        for (const src of want) {
          if (held.has(src.id)) continue;
          const free = slots.find((slot) => slot.light.intensity < 1e-3 && (slot.target === 0 || !slot.source));
          if (!free) break;
          free.source = src;
          free.target = strength(src);
          free.light.position.copy(src.pos);
          free.light.color.set(src.color);
          free.light.distance = src.distance;
        }
      };
      // (only room-sized lamps: a street light's shadow cube would cover half the street – too costly)
      assign(casters, wanted.filter((w) => w.distance <= SHADOW_RANGE).slice(0, casters.length));
      const cast = new Set(casters.filter((sl) => sl.source && sl.target > 0).map((sl) => sl.source!.id));
      assign(
        plain,
        wanted.filter((w) => !cast.has(w.id)),
      );
    }
    const k = Math.min(1, dt * 6);
    this.frame++;
    for (const [i, slot] of this.pool.entries()) {
      slot.light.intensity += (slot.target - slot.light.intensity) * k;
      if (slot.target === 0 && slot.light.intensity < 1e-3) {
        slot.light.intensity = 0;
        slot.source = null;
      }
      // shadow maps of lit casters: refreshed every other frame (furniture rarely moves; people and pets do)
      if (i < this.shadowSlots) slot.light.shadow.needsUpdate = !slot.light.shadow.map || (slot.light.intensity > 1e-3 && this.frame % 2 === 0);
    }
  }

  /**
   * Let the `n` lamps nearest to the viewer cast soft shadows (0 = none). Their number is fixed so that
   * switching lamps on and off never recompiles shaders; the maps are only rendered while lit.
   */
  setShadowCasters(n: number): void {
    n = Math.max(0, Math.min(POOL, Math.floor(n)));
    if (n === this.shadowSlots) return;
    this.shadowSlots = n;
    this.pool.forEach((slot, i) => {
      const light = slot.light;
      const cast = i < n;
      if (light.castShadow === cast) return;
      light.castShadow = cast;
      light.shadow.map?.dispose();
      light.shadow.map = null;
      if (cast) {
        light.shadow.mapSize.set(512, 512);
        light.shadow.bias = -0.004;
        light.shadow.normalBias = 0.02;
        light.shadow.radius = 5;
        light.shadow.camera.near = 0.08;
        light.shadow.autoUpdate = false;
        light.shadow.needsUpdate = true;
      }
      // a lamp moving between slots must not be lit twice for long
      slot.target = 0;
    });
  }
}
