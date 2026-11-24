/**
 * Small runtime helpers shared by team D's games (football, fishing, dance). Only used inside
 * `start()`: nothing here touches the DOM at import time.
 */
import * as THREE from 'three';
import { Character } from '../../../render3d/Character';
import type { CharacterLook } from '../../../render3d/characterTypes';
import type { Vec2 } from '../../../model/types';

/** Tracks GPU resources a round creates so that `dispose()` can free them (the runtime only frees geometry). */
export class Bin {
  private items: Array<{ dispose(): void }> = [];
  private npcs: Character[] = [];
  add<T extends { dispose(): void }>(x: T): T {
    this.items.push(x);
    return x;
  }
  /** an NPC: its geometry is shared with other characters, so it must never be disposed by the runtime */
  npc(look: CharacterLook, parent: THREE.Object3D): Character {
    const c = new Character(look);
    parent.add(c.root);
    this.npcs.push(c);
    return c;
  }
  dispose(): void {
    for (const c of this.npcs) {
      c.root.removeFromParent();
      c.dispose();
    }
    this.npcs = [];
    for (const x of this.items) x.dispose();
    this.items = [];
  }
}

/** A canvas texture you can redraw (scoreboards, screens, cards). Null without a DOM. */
export function canvasTexture(w: number, h: number): { canvas: HTMLCanvasElement; g: CanvasRenderingContext2D; tex: THREE.CanvasTexture } | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  if (!g) return null;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return { canvas, g, tex };
}

export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smooth = (t: number): number => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};
export const easeOut = (t: number): number => 1 - Math.pow(1 - clamp(t, 0, 1), 3);

/** facing angle (as WalkController.facing) that looks from a towards b in plan coordinates */
export const facingTo = (a: Vec2, b: Vec2): number => Math.atan2(b.x - a.x, b.y - a.y);

/** Move the camera smoothly towards a pose (call after the walk controller placed it). */
export class CameraRig {
  private pos = new THREE.Vector3();
  private look = new THREE.Vector3();
  private ready = false;
  constructor(private camera: THREE.PerspectiveCamera) {}
  /** snap = jump there at once */
  set(pos: THREE.Vector3, look: THREE.Vector3, dt: number, rate = 4, snap = false): void {
    if (!this.ready || snap) {
      this.pos.copy(pos);
      this.look.copy(look);
      this.ready = true;
    } else {
      const k = 1 - Math.exp(-rate * dt);
      this.pos.lerp(pos, k);
      this.look.lerp(look, k);
    }
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.look);
  }
}

/** A white full-screen flash in front of the camera (camera "photo" moments). */
export class Flash {
  readonly mesh: THREE.Mesh;
  private t = 1;
  constructor(bin: Bin, parent: THREE.Object3D) {
    const mat = bin.add(new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), mat);
    this.mesh.renderOrder = 999;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    parent.add(this.mesh);
  }
  fire(): void {
    this.t = 0;
  }
  update(dt: number, camera: THREE.Camera): void {
    this.t += dt;
    const o = Math.max(0, 1 - this.t / 0.45);
    const m = this.mesh.material as THREE.MeshBasicMaterial;
    m.opacity = o * 0.9;
    this.mesh.visible = o > 0.01;
    if (this.mesh.visible) {
      this.mesh.position.copy(camera.position);
      this.mesh.quaternion.copy(camera.quaternion);
      this.mesh.translateZ(-0.3);
    }
  }
}

/** Is a site point on a water area of the project? */
export function onWater(areas: ReadonlyArray<{ x0: number; y0: number; x1: number; y1: number; finish: string }>, x: number, y: number): boolean {
  for (let i = areas.length - 1; i >= 0; i--) {
    const a = areas[i];
    if (x >= Math.min(a.x0, a.x1) && x <= Math.max(a.x0, a.x1) && y >= Math.min(a.y0, a.y1) && y <= Math.max(a.y0, a.y1)) return a.finish === 'water';
  }
  return false;
}
