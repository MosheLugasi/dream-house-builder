import * as THREE from 'three';
import { roomsKey, sameKey } from './buildingKey';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { getGraph } from '../../model/graph';
import { pointInPolygon } from '../../model/geom';
import { levelElevation, toSite, type Building, type Vec2 } from '../../model/types';

/** A window (or glass door / open passage) in an outside wall, in site coordinates. */
interface WindowSource {
  id: string;
  /** centre of the opening on the inner face of the wall */
  center: THREE.Vector3;
  /** horizontal unit vector pointing into the room */
  normal: THREE.Vector3;
  width: number;
  height: number;
  /** the room the window lights (site coordinates) */
  room: Vec2[];
  floorY: number;
  ceilY: number;
}

interface Slot {
  light: THREE.RectAreaLight;
  source: WindowSource | null;
  target: number;
}

const GLASS_DOORS = /glass|passage/;
const RANGE = 13;

let ltcReady = false;

/**
 * Daylight that comes in through windows. A real room is lit mostly by the bright sky and the sunlit
 * ground seen through its windows; here a small pool of rectangular area lights is placed on the inner
 * side of the windows nearest to the camera, tinted with the sky colour and scaled with the daylight.
 * (Area lights cast no shadows, so only the windows of the storey the camera is on are used, preferring
 * the room the camera stands in.)
 */
export class WindowLights {
  readonly group = new THREE.Group();
  private slots: Slot[] = [];
  private sources: WindowSource[] = [];
  private key: unknown[] | null = null;
  private buildings: unknown = null;
  private timer = 0;

  /** size of the pool */
  get size(): number {
    return this.slots.length;
  }

  /** Number of area lights (changing it recompiles the lit shaders: only on a quality change). */
  setPoolSize(n: number): void {
    if (n > 0 && !ltcReady) {
      RectAreaLightUniformsLib.init();
      ltcReady = true;
    }
    while (this.slots.length > n) {
      const s = this.slots.pop()!;
      this.group.remove(s.light);
      s.light.dispose();
    }
    while (this.slots.length < n) {
      const light = new THREE.RectAreaLight('#ffffff', 0, 1, 1);
      this.group.add(light);
      this.slots.push({ light, source: null, target: 0 });
    }
    this.timer = 0;
  }

  /** Re-collect the windows when the buildings changed (walls, windows; not furniture). */
  setBuildings(buildings: Building[]): void {
    if (buildings === this.buildings) return;
    this.buildings = buildings;
    const key = roomsKey(buildings, true);
    if (sameKey(this.key, key)) return;
    this.key = key;
    const out: WindowSource[] = [];
    for (const b of buildings) {
      const rot = b.rotation;
      const c = Math.cos(rot);
      const s = Math.sin(rot);
      b.levels.forEach((lvl, li) => {
        if (!lvl.openings.length) return;
        const graph = getGraph(lvl.walls);
        const floorY = levelElevation(b, li);
        for (const o of lvl.openings) {
          if (o.type !== 'window' && !GLASS_DOORS.test(o.style)) continue;
          for (const e of graph.edges) {
            if (e.wallId !== o.wallId) continue;
            const u = o.offset - e.u0;
            if (u < 0 || u > e.length) continue;
            // only outside walls let daylight in
            let side = 0;
            if (e.posRoom >= 0 && e.negRoom < 0) side = 1;
            else if (e.negRoom >= 0 && e.posRoom < 0) side = -1;
            if (!side) break;
            const room = graph.rooms[side > 0 ? e.posRoom : e.negRoom];
            const inset = e.thickness / 2 + 0.03;
            const local = { x: e.pa.x + e.dir.x * u + e.n.x * side * inset, y: e.pa.y + e.dir.y * u + e.n.y * side * inset };
            const p = toSite(b, local);
            const nx = e.n.x * side;
            const ny = e.n.y * side;
            out.push({
              id: `${b.id}/${o.id}`,
              center: new THREE.Vector3(p.x, floorY + o.sill + o.height / 2, p.y),
              normal: new THREE.Vector3(nx * c - ny * s, 0, nx * s + ny * c),
              width: Math.max(0.2, o.width - 0.1),
              height: Math.max(0.2, o.height - 0.08),
              room: room.polygon.map((q) => toSite(b, q)),
              floorY,
              ceilY: floorY + lvl.height,
            });
            break;
          }
        }
      });
    }
    this.sources = out;
    for (const slot of this.slots) slot.target = 0;
    this.timer = 0;
  }

  /**
   * @param eye camera position
   * @param radiance brightness of the view out of a window (0 by night)
   * @param color sky tint
   * @param active windows may light rooms now (walk mode by day). Area lights cost every lit pixel even
   *   when dark, so the pool is taken out of the scene while no window is in reach (outside, in the
   *   editor, at night); each variant of the shaders compiles once and is then cached by three.
   */
  update(dt: number, eye: THREE.Vector3, radiance: number, color: THREE.Color, active: boolean): void {
    if (!this.slots.length) return;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 0.2;
      const here = { x: eye.x, y: eye.z };
      const scored: { s: WindowSource; score: number; weight: number }[] = [];
      if (active && radiance > 1e-3) {
        for (const s of this.sources) {
          if (eye.y < s.floorY - 0.3 || eye.y > s.ceilY + 0.6) continue;
          const dx = eye.x - s.center.x;
          const dz = eye.z - s.center.z;
          const d = Math.hypot(dx, dz);
          if (d > RANGE || dx * s.normal.x + dz * s.normal.z < -0.2) continue;
          const inside = pointInPolygon(here, s.room);
          scored.push({ s, score: d - (inside ? 8 : 0), weight: inside ? 1 : 1 - THREE.MathUtils.smoothstep(d, RANGE * 0.45, RANGE) });
        }
        scored.sort((a, b) => a.score - b.score);
      }
      const wanted = scored.slice(0, this.slots.length);
      // windows near the end of the list fade out before they hand their light over to another window
      // (moving around a room with more windows than lights, the light used to jump between them)
      if (scored.length > wanted.length) {
        const cut = scored[wanted.length].score;
        for (const w of wanted) w.weight *= Math.max(0, Math.min(1, (cut - w.score) / 2.5));
      }
      // only in the scene while some window is in reach (or still fading out)
      const on = wanted.length > 0 || this.slots.some((sl) => sl.light.intensity > 1e-3);
      if (this.group.visible !== on) {
        this.group.visible = on;
        if (!on) this.clear();
      }
      const byId = new Map(wanted.map((w) => [w.s.id, w]));
      for (const slot of this.slots) {
        const w = slot.source && byId.get(slot.source.id);
        slot.target = w ? w.weight : 0;
      }
      const held = new Set(this.slots.filter((sl) => sl.source && sl.target > 0).map((sl) => sl.source!.id));
      for (const w of wanted) {
        if (held.has(w.s.id) || w.weight <= 0) continue;
        const free = this.slots.find((sl) => !sl.source || (sl.target === 0 && sl.light.intensity < 1e-3));
        if (!free) break;
        free.source = w.s;
        free.target = w.weight;
        free.light.intensity = 0;
        free.light.width = w.s.width;
        free.light.height = w.s.height;
        free.light.position.copy(w.s.center);
        free.light.lookAt(w.s.center.x + w.s.normal.x, w.s.center.y, w.s.center.z + w.s.normal.z);
      }
    }
    const k = Math.min(1, dt * 5);
    for (const slot of this.slots) {
      slot.light.color.copy(color);
      const goal = slot.target * radiance;
      slot.light.intensity += (goal - slot.light.intensity) * k;
      if (slot.target === 0 && slot.light.intensity < 1e-3) {
        slot.light.intensity = 0;
        slot.source = null;
      }
    }
  }

  /**
   * Put the pool into the scene if it is out of it and vice versa; returns the undo. The lit shaders
   * have a variant with and one without the area lights: the shader warm-up compiles both (see
   * ShaderWarmup.variants) – each switch used to compile the other variant in the middle of a frame,
   * a stall of a second or more walking up to a house.
   */
  readonly flipVisibility = (): (() => void) => {
    const was = this.group.visible;
    this.group.visible = !was;
    return () => {
      this.group.visible = was;
    };
  };

  /** Switch everything off at once (e.g. leaving walk mode). */
  clear(): void {
    for (const slot of this.slots) {
      slot.light.intensity = 0;
      slot.source = null;
      slot.target = 0;
    }
  }

  dispose(): void {
    this.setPoolSize(0);
  }
}
