/**
 * Team C (amusement park) – shared pieces of the rides: the runtime base class every ride extends
 * (`RideRuntime` for the walk mode + the richer `AmuseRide` the "לונה פארק" game reads), fairground
 * bulbs, instanced repeated parts, painted signs and the idle ticker that keeps a ride turning while
 * nobody rides it.
 *
 * A ride object (`noBake`) carries `userData.ride: RideRuntime` and `userData.amuse: AmuseRide` – the
 * same instance. The walk mode (Interactions.ride) calls `update(dt, push, riders)` while the player
 * rides; the game drives the other rides itself.
 */
import * as THREE from 'three';
import { M, lighten } from '../kit';
import type { RideRuntime } from '../types';
import { rideSound } from './_gameCAudio';

export type AmuseKind = 'ferris' | 'coaster' | 'drop' | 'pirate' | 'teacups' | 'bumper';

export type RideState = 'idle' | 'loading' | 'running' | 'done';

/** What the amusement-park game needs to know about a ride (and may steer). */
export interface AmuseRide extends RideRuntime {
  kind: AmuseKind;
  /**
   * The real seats (they bank, swing and loop with the ride). `seatNodes` may be upright stand-ins at
   * the same places (yaw only) for the walk mode, which pitches the rider about the feet.
   */
  seatFrames: THREE.Object3D[];
  /** short Hebrew name for the punch card */
  label: string;
  icon: string;
  /** 1 (gentle) … 5 (wild) */
  thrill: number;
  /** where riders queue / get on: local point on the ground in front of the loading area, and the way they face */
  entrance: { x: number; z: number; facing: number };
  readonly state: RideState;
  /** seconds spent in the current state */
  readonly t: number;
  /** 0..1 through the running part of the cycle */
  readonly progress: number;
  /** completed cycles */
  readonly cycles: number;
  /** how wild it is right now, 0..1 (cheering, screams) */
  readonly rush: number;
  /** a drop / free fall is happening right now (the "hands up all the way down" window) */
  readonly drop: boolean;
  /** speed of the riders, m/s */
  readonly speed: number;
  /** a player is on board (riders were passed to the last `update`) */
  readonly playerOn: boolean;
  /** seats taken by people the game seats (NPC visitors) – they ride along */
  readonly extraRiders: Set<number>;
  /** start a cycle now (also without riders) */
  dispatch(): void;
  /** advance without external riders (the game's NPC-only cycles); same as update(dt, 0, []) */
  step(dt: number, push: number, riders: readonly number[]): boolean;
  /** the game steers this ride's player car (bumper cars) */
  control?: { throttle: number; steer: number; external: boolean };
  /** bumps the player's car gave (bumper cars) */
  bumps?: number;
  /** called on ride events: 'start' | 'drop' | 'end' | 'bump' | 'top' */
  onEvent: ((e: string) => void) | null;
}

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Clamp a frame time (NaN, negative, huge → safe). */
export const safeDt = (dt: number): number => (Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : 0);

export const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));
export const smooth = (x: number): number => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};

/**
 * Base of every ride: loading → running → done (riders still on) → idle. A cycle starts when a rider
 * gets on (or `dispatch`), runs `advance` until it reports the end, then waits; a rider still on board
 * pressing W (push ≈ 1) goes again.
 */
export abstract class RideBase implements AmuseRide {
  abstract readonly kind: AmuseKind;
  abstract label: string;
  abstract icon: string;
  abstract thrill: number;
  abstract entrance: { x: number; z: number; facing: number };
  seatNodes: THREE.Object3D[] = [];
  seatFrames: THREE.Object3D[] = [];
  private upright: { root: THREE.Object3D; m: THREE.Matrix4 } | null = null;
  state: RideState = 'idle';
  t = 0;
  progress = 0;
  cycles = 0;
  rush = 0;
  drop = false;
  speed = 0;
  playerOn = false;
  readonly extraRiders = new Set<number>();
  onEvent: ((e: string) => void) | null = null;
  /** seconds of "please take your seats" before it starts */
  loadTime = 1.6;
  /** last external update (performance.now) – the idle ticker stays out of the way meanwhile */
  touched = -1e9;
  private wasDrop = false;

  update(dt: number, push: number, riders: number[]): boolean {
    const t = now();
    // a second driver in the same frame (the walk mode's coasting list while the game drives it) is ignored
    if (riders.length === 0 && t - this.touched < 4) return this.state !== 'idle';
    this.touched = t;
    return this.step(dt, push, riders);
  }

  step(dt: number, push: number, riders: readonly number[]): boolean {
    const h = safeDt(dt);
    const p = Number.isFinite(push) ? clamp(push, 0, 1) : 0;
    this.playerOn = riders.length > 0;
    const anyone = this.playerOn || this.extraRiders.size > 0;
    this.t += h;
    switch (this.state) {
      case 'idle':
        if (this.playerOn) this.begin();
        break;
      case 'loading':
        if (this.t >= this.loadTime) {
          this.state = 'running';
          this.t = 0;
          this.progress = 0;
          this.onStart();
          this.emit('start');
        }
        break;
      case 'running':
        if (this.advance(h, p, riders)) {
          this.state = 'done';
          this.t = 0;
          this.progress = 1;
          this.cycles++;
          this.rush = 0;
          this.drop = false;
          this.onEnd();
          this.emit('end');
        }
        break;
      case 'done':
        if (this.playerOn && p > 0.9 && this.t > 0.6) this.begin();
        else if (!anyone && this.t > 0.3) this.state = 'idle';
        break;
    }
    if (this.state !== 'running') {
      this.rush = 0;
      this.drop = false;
      this.speed = 0;
      this.rest(h, p, riders);
    }
    if (this.drop && !this.wasDrop) this.emit('drop');
    this.wasDrop = this.drop;
    rideSound.tick(this, h);
    this.syncUpright();
    return this.state !== 'idle';
  }

  /** the seats are `frames`; with `uprightIn` the walk mode gets yaw-only stand-ins (children of that root) */
  setSeats(frames: THREE.Object3D[], uprightIn?: THREE.Object3D): void {
    this.seatFrames = frames;
    if (!uprightIn) {
      this.seatNodes = frames;
      return;
    }
    this.upright = { root: uprightIn, m: new THREE.Matrix4() };
    this.seatNodes = frames.map(() => {
      const n = new THREE.Object3D();
      n.name = 'seat-upright';
      uprightIn.add(n);
      return n;
    });
    this.syncUpright();
  }

  private syncUpright(): void {
    const u = this.upright;
    if (!u) return;
    const e = u.m.elements;
    for (let i = 0; i < this.seatFrames.length; i++) {
      relMatrix(this.seatFrames[i], u.root, u.m);
      const p = this.seatNodes[i];
      p.position.set(e[12], e[13], e[14]);
      p.rotation.set(0, Math.atan2(e[8], e[10]), 0);
    }
  }

  dispatch(): void {
    if (this.state === 'idle' || this.state === 'done') this.begin();
  }

  protected begin(): void {
    this.state = 'loading';
    this.t = 0;
    this.progress = 0;
    if (this.playerOn) rideSound.bell();
  }

  protected emit(e: string): void {
    if (e === 'drop' && this.playerOn) {
      rideSound.scream(3, 'drop', 0.32);
      rideSound.whoosh(0.9);
    }
    this.onEvent?.(e);
  }

  /** a cycle starts */
  protected onStart(): void {}
  /** a cycle ended */
  protected onEnd(): void {}
  /** advance the running cycle by h; return true when it has ended */
  protected abstract advance(h: number, push: number, riders: readonly number[]): boolean;
  /** pose while not running (loading, done, idle) */
  protected abstract rest(h: number, push: number, riders: readonly number[]): void;
}

/**
 * Let a ride animate on its own while nobody drives it (only while it is on screen): a mesh's
 * `onBeforeRender` measures real time and steps the ride, unless the walk mode / game updated it in
 * the last 0.25 s.
 */
export function idleTicker(rt: RideBase, mesh: THREE.Object3D): void {
  let last = -1;
  mesh.onBeforeRender = () => {
    const t = now();
    if (t - rt.touched < 250) {
      last = t;
      return;
    }
    const dt = last < 0 ? 0 : (t - last) / 1000;
    last = t;
    if (dt > 0.001 && dt < 0.25) rt.step(dt, 0, []);
  };
}

/* ------------------------------------------------------------------ bulbs */

export const BULB_COLORS = ['#ffd36a', '#ff6a5a', '#7fd6ff', '#9dff8a', '#ff9be6', '#fff4d6'];

/** A fairground bulb material (lit at night by the light manager, plain glass bulb by day). */
export const bulbMat = (color: string, intensity = 3.2): THREE.MeshStandardMaterial => M.glow(color, intensity * 0.7, lighten(color, 0.55));

let bulbGeo: THREE.BufferGeometry | null = null;
/** low-poly bulb (20 triangles) */
export function bulbGeometry(): THREE.BufferGeometry {
  if (!bulbGeo) bulbGeo = new THREE.IcosahedronGeometry(1, 0);
  return bulbGeo;
}

/**
 * Many bulbs as ONE merged geometry per colour: `points` are local positions; colours cycle through
 * `colors`. Returns meshes to add to a group (they get baked with it).
 */
export function bulbStrip(points: THREE.Vector3[], r: number, colors: string[], intensity = 3.2): THREE.Mesh[] {
  const byColor = new Map<string, THREE.BufferGeometry[]>();
  points.forEach((p, i) => {
    const c = colors[i % colors.length];
    const g = bulbGeometry().clone();
    g.scale(r, r, r);
    g.translate(p.x, p.y, p.z);
    const list = byColor.get(c) ?? [];
    list.push(g);
    byColor.set(c, list);
  });
  const out: THREE.Mesh[] = [];
  for (const [c, geos] of byColor) {
    const merged = mergeSimple(geos);
    const m = new THREE.Mesh(merged, bulbMat(c, intensity));
    m.castShadow = false;
    m.receiveShadow = false;
    out.push(m);
  }
  return out;
}

/** merge non-indexed position/normal geometries (bulbs, ties) without the addons import */
export function mergeSimple(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const parts = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  let n = 0;
  for (const g of parts) n += g.getAttribute('position').count;
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const uv = new Float32Array(n * 2);
  let o = 0;
  for (const g of parts) {
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    const nn = g.getAttribute('normal') as THREE.BufferAttribute;
    const u = g.getAttribute('uv') as THREE.BufferAttribute | undefined;
    pos.set(p.array as Float32Array, o * 3);
    nor.set(nn.array as Float32Array, o * 3);
    if (u) uv.set(u.array as Float32Array, o * 2);
    o += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.computeBoundingSphere();
  out.computeBoundingBox();
  return out;
}

/* ------------------------------------------------------------------ instanced repeated parts */

/** white materials that an `Instanced` set paints per copy (car bodies, cups) */
export const TINT_GLOSS = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.25, metalness: 0 });
export const TINT_MATTE = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6, metalness: 0 });

/** transform of `node` relative to its ancestor `root` (local matrices updated on the way) */
export function relMatrix(node: THREE.Object3D, root: THREE.Object3D, out: THREE.Matrix4): THREE.Matrix4 {
  node.updateMatrix();
  out.copy(node.matrix);
  let p = node.parent;
  while (p && p !== root) {
    p.updateMatrix();
    out.premultiply(p.matrix);
    p = p.parent;
  }
  return out;
}

/**
 * N copies of a baked template (gondolas, teacups, cars) drawn as one InstancedMesh per material.
 * Call `set(i, matrix)` every frame for the moving ones, then `commit()`.
 */
export class Instanced {
  readonly group = new THREE.Group();
  private meshes: THREE.InstancedMesh[] = [];

  constructor(template: THREE.Object3D, readonly count: number, colors?: string[]) {
    template.updateMatrixWorld(true);
    template.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || Array.isArray(m.material)) return;
      const geo = m.geometry.clone();
      geo.applyMatrix4(m.matrixWorld);
      const im = new THREE.InstancedMesh(geo, m.material, count);
      if (colors && (m.material === TINT_GLOSS || m.material === TINT_MATTE)) {
        const c = new THREE.Color();
        for (let i = 0; i < count; i++) im.setColorAt(i, c.set(colors[i % colors.length]));
      }
      im.castShadow = m.castShadow;
      im.receiveShadow = m.receiveShadow;
      im.frustumCulled = false;
      this.meshes.push(im);
      this.group.add(im);
    });
  }

  set(i: number, m: THREE.Matrix4): void {
    for (const im of this.meshes) im.setMatrixAt(i, m);
  }

  commit(): void {
    for (const im of this.meshes) im.instanceMatrix.needsUpdate = true;
  }

  /** a mesh to hang the idle ticker on */
  get first(): THREE.Object3D {
    return this.meshes[0] ?? this.group;
  }
}

/* ------------------------------------------------------------------ painted signs */

const signCache = new Map<string, THREE.Material>();

/**
 * A lit sign face with Hebrew text (canvas texture; a flat colour where there is no DOM, e.g. tests).
 * `bg` / `fg` colours; `icon` drawn left of the text.
 */
export function signMat(text: string, bg: string, fg: string, opts: { w?: number; h?: number; icon?: string; border?: string; glow?: number; font?: number } = {}): THREE.Material {
  const key = `${text}|${bg}|${fg}|${opts.icon ?? ''}|${opts.border ?? ''}|${opts.w ?? 1024}x${opts.h ?? 256}|${opts.glow ?? 0.5}`;
  let mat = signCache.get(key);
  if (mat) return mat;
  if (typeof document === 'undefined') {
    mat = M.paint(bg);
  } else {
    const W = opts.w ?? 1024;
    const H = opts.h ?? 256;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d')!;
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, bg);
    grad.addColorStop(1, shade(bg, -0.25));
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    if (opts.border) {
      g.strokeStyle = opts.border;
      g.lineWidth = H * 0.07;
      g.strokeRect(H * 0.06, H * 0.06, W - H * 0.12, H - H * 0.12);
      // marquee dots along the border
      g.fillStyle = '#fff3c4';
      const n = Math.round(W / (H * 0.16));
      for (let i = 0; i < n; i++) {
        const x = H * 0.06 + ((W - H * 0.12) * (i + 0.5)) / n;
        for (const y of [H * 0.06, H - H * 0.06]) {
          g.beginPath();
          g.arc(x, y, H * 0.028, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.direction = 'rtl';
    const size = opts.font ?? H * 0.5;
    g.font = `800 ${size}px system-ui, Arial, sans-serif`;
    g.lineWidth = size * 0.1;
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    const text2 = opts.icon ? `${text} ${opts.icon}` : text;
    g.strokeText(text2, W / 2, H * 0.54);
    g.fillStyle = fg;
    g.fillText(text2, W / 2, H * 0.54);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, emissive: new THREE.Color('#ffffff'), emissiveMap: tex, emissiveIntensity: opts.glow ?? 0.5 });
  }
  signCache.set(key, mat);
  return mat;
}

function shade(hex: string, t: number): string {
  const c = new THREE.Color(hex);
  if (t < 0) c.multiplyScalar(1 + t);
  else c.lerp(new THREE.Color('#ffffff'), t);
  return `#${c.getHexString()}`;
}

/** A plane geometry facing +Z with uv 0..1 (for sign faces). */
export function planeGeo(w: number, h: number): THREE.BufferGeometry {
  return new THREE.PlaneGeometry(w, h);
}

/** world-space matrix helper */
export const tmpM = new THREE.Matrix4();
export const tmpQ = new THREE.Quaternion();
export const tmpV = new THREE.Vector3();
export const tmpS = new THREE.Vector3(1, 1, 1);
