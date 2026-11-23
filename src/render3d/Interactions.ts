import * as THREE from 'three';
import { audio } from '../audio';
import type { Loop } from '../audio/types';
import type { FurnitureDef, InteractSpec } from '../catalog/types';
import { report } from '../game/progress';
import type { FurnitureItem, Vec2 } from '../model/types';
import type { LightManager } from './LightManager';
import type { Usable } from './WalkController';

/** A placed catalog item together with its 3D object and where it stands in the world. */
export interface ItemRef {
  item: FurnitureItem;
  def: FurnitureDef;
  holder: THREE.Group;
  /** site coordinates */
  pos: Vec2;
  rotation: number;
  /** height of the floor (or ground) the item stands on */
  floorY: number;
}

interface Active {
  ref: ItemRef;
  screen?: THREE.Mesh;
  water?: THREE.Object3D;
  flame?: THREE.Group;
  appliance?: 'washing' | 'fan';
}

// ---- shared animated resources ---------------------------------------------------------------

let tv: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; texture: THREE.CanvasTexture; material: THREE.MeshBasicMaterial } | null = null;
function tvScreen() {
  if (!tv) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 144;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    tv = { canvas, ctx: canvas.getContext('2d')!, texture, material: new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, color: new THREE.Color(1.35, 1.35, 1.35) }) };
  }
  return tv;
}

/** A little cartoon that plays on every switched-on screen. */
function drawTv(t: number): void {
  const { ctx, texture } = tvScreen();
  const scene = Math.floor(t / 7) % 3;
  if (scene === 0) {
    // countryside with a moving sun and clouds
    const sky = ctx.createLinearGradient(0, 0, 0, 144);
    sky.addColorStop(0, '#6db6ee');
    sky.addColorStop(1, '#cfe9f7');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 256, 144);
    ctx.fillStyle = '#ffd95a';
    ctx.beginPath();
    ctx.arc(60 + Math.sin(t * 0.4) * 30, 40, 18, 0, 7);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 3; i++) {
      const x = ((t * 12 + i * 110) % 320) - 40;
      ctx.beginPath();
      ctx.ellipse(x, 30 + i * 14, 26, 9, 0, 0, 7);
      ctx.fill();
    }
    ctx.fillStyle = '#5faa55';
    ctx.beginPath();
    ctx.ellipse(70, 150, 150, 50, 0, 0, 7);
    ctx.ellipse(210, 156, 130, 46, 0, 0, 7);
    ctx.fill();
    ctx.fillStyle = '#e8734f';
    const bx = (t * 30) % 300;
    ctx.fillRect(bx - 20, 104 + Math.sin(t * 6) * 2, 26, 14);
  } else if (scene === 1) {
    // bouncing shapes
    ctx.fillStyle = '#2b2f55';
    ctx.fillRect(0, 0, 256, 144);
    const colors = ['#ff6b6b', '#ffd166', '#4ecdc4', '#a78bfa', '#7bd389'];
    colors.forEach((c, i) => {
      ctx.fillStyle = c;
      const x = 128 + Math.sin(t * (0.9 + i * 0.23) + i) * 100;
      const y = 72 + Math.cos(t * (1.3 + i * 0.17) + i * 2) * 50;
      ctx.beginPath();
      ctx.arc(x, y, 12 + i * 2, 0, 7);
      ctx.fill();
    });
  } else {
    // underwater
    const sea = ctx.createLinearGradient(0, 0, 0, 144);
    sea.addColorStop(0, '#2aa7c9');
    sea.addColorStop(1, '#0d4f77');
    ctx.fillStyle = sea;
    ctx.fillRect(0, 0, 256, 144);
    for (let i = 0; i < 4; i++) {
      const x = 256 - ((t * (18 + i * 6) + i * 80) % 320);
      const y = 30 + i * 28 + Math.sin(t * 2 + i) * 6;
      ctx.fillStyle = ['#ffb347', '#ff7aa2', '#ffe66d', '#b8f2e6'][i];
      ctx.beginPath();
      ctx.ellipse(x, y, 14, 8, 0, 0, 7);
      ctx.moveTo(x + 12, y);
      ctx.lineTo(x + 24, y - 8);
      ctx.lineTo(x + 24, y + 8);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.arc(30 + i * 40, 144 - ((t * 25 + i * 37) % 160), 3, 0, 7);
      ctx.fill();
    }
  }
  texture.needsUpdate = true;
}

let streakTexture: THREE.CanvasTexture | null = null;
function waterStreaks(): THREE.CanvasTexture {
  if (!streakTexture) {
    const c = document.createElement('canvas');
    c.width = 32;
    c.height = 128;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, 32, 128);
    for (let i = 0; i < 26; i++) {
      const x = (i * 7919) % 32;
      const y = (i * 104729) % 128;
      const len = 14 + ((i * 31) % 30);
      const g = ctx.createLinearGradient(0, y, 0, y + len);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.5, 'rgba(255,255,255,0.85)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x, y, 2, len);
      ctx.fillRect(x, y - 128, 2, len);
    }
    streakTexture = new THREE.CanvasTexture(c);
    streakTexture.wrapS = streakTexture.wrapT = THREE.RepeatWrapping;
  }
  return streakTexture;
}
const waterMat = () =>
  new THREE.MeshBasicMaterial({ color: '#dff3ff', map: waterStreaks(), transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide });
const flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 0.75, 2.4), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });

const LABEL_SFX: Record<string, string> = { flush: 'להוריד את המים', bell: 'לצלצל בפעמון', squeak: 'לנדנד' };

/**
 * Everything the F key does to furniture: lamps, screens, taps and showers, the stove, appliances.
 * The visible effects are small overlay objects parented to the item's own 3D object.
 */
export class Interactions {
  private active = new Map<string, Active>();
  private clock = 0;
  private tvTimer = 0;

  constructor(
    private lights: LightManager,
    private night: () => number,
  ) {}

  /** Usables of an item, re-attaching any effect that was already switched on. */
  usablesFor(ref: ItemRef): Usable[] {
    const out: Usable[] = [];
    const specs = ref.def.interact ?? [];
    const id = ref.item.id;
    const current = this.active.get(id);
    if (current) {
      // the item's 3D object may have been rebuilt: move the effects over
      current.ref = ref;
      for (const o of [current.screen, current.water, current.flame]) if (o && o.parent !== ref.holder) ref.holder.add(o);
    }
    const base = { pos: ref.pos, y: ref.floorY };
    const far = Math.max(ref.def.size.w, ref.def.size.d) / 2;
    for (const spec of specs) {
      switch (spec.kind) {
        case 'light':
          out.push({
            ...base,
            id: `${id}:light`,
            reach: ref.def.mount === 'ceiling' ? 1.5 : far + 1.1,
            prompt: () => `${this.lights.isOn(id, this.night()) ? 'לכבות' : 'להדליק'} את ${ref.def.name}`,
            use: () => {
              const on = this.lights.toggle(id, this.night());
              audio.play(on ? 'switch-on' : 'switch-off');
              report('light-switched');
            },
          });
          break;
        case 'screen':
          out.push({
            ...base,
            id: `${id}:screen`,
            reach: far + 2.2,
            prompt: () => (this.active.get(id)?.screen ? 'לכבות את המסך' : 'להדליק את המסך'),
            use: () => this.toggleScreen(ref, spec),
          });
          break;
        case 'water':
          out.push({
            ...base,
            id: `${id}:water`,
            reach: far + 0.9,
            prompt: () => (this.active.get(id)?.water ? 'לסגור את המים' : 'לפתוח את המים'),
            use: () => this.toggleWater(ref, spec),
          });
          break;
        case 'flame':
          out.push({
            ...base,
            id: `${id}:flame`,
            reach: far + 0.9,
            prompt: () => (this.active.get(id)?.flame ? 'לכבות את הכיריים' : 'להדליק את הכיריים'),
            use: () => this.toggleFlame(ref, spec),
          });
          break;
        case 'sfx':
          out.push({
            ...base,
            id: `${id}:sfx`,
            reach: far + 0.9,
            prompt: () => LABEL_SFX[spec.sound] ?? 'להפעיל',
            use: () => audio.play(spec.sound),
          });
          break;
        case 'appliance':
          out.push({
            ...base,
            id: `${id}:appliance`,
            reach: far + 0.9,
            prompt: () => `${this.active.get(id)?.appliance ? 'לכבות' : 'להפעיל'} את ${ref.def.name}`,
            use: () => {
              const a = this.entry(ref);
              a.appliance = a.appliance ? undefined : spec.sound;
              audio.play(a.appliance ? 'switch-on' : 'switch-off');
              if (!a.appliance) {
                const body = ref.holder.userData.body as THREE.Object3D | undefined;
                body?.position.setX(0);
                this.prune(id);
              }
            },
          });
          break;
        case 'instrument':
          break;
      }
    }
    return out;
  }

  private entry(ref: ItemRef): Active {
    let a = this.active.get(ref.item.id);
    if (!a) {
      a = { ref };
      this.active.set(ref.item.id, a);
    }
    return a;
  }

  private prune(id: string): void {
    const a = this.active.get(id);
    if (a && !a.screen && !a.water && !a.flame && !a.appliance) this.active.delete(id);
  }

  private toggleScreen(ref: ItemRef, spec: Extract<InteractSpec, { kind: 'screen' }>): void {
    const a = this.entry(ref);
    if (a.screen) {
      a.screen.removeFromParent();
      a.screen.geometry.dispose();
      a.screen = undefined;
      audio.play('switch-off');
      this.prune(ref.item.id);
      return;
    }
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(spec.w, spec.h), tvScreen().material);
    mesh.position.set(spec.x, spec.y, spec.z);
    mesh.rotation.y = spec.ry ?? 0;
    ref.holder.add(mesh);
    a.screen = mesh;
    drawTv(this.clock);
    audio.play('switch-on');
    report('tv-watched');
  }

  private toggleWater(ref: ItemRef, spec: Extract<InteractSpec, { kind: 'water' }>): void {
    const a = this.entry(ref);
    if (a.water) {
      a.water.removeFromParent();
      a.water = undefined;
      audio.play('switch-off', { volume: 0.5 });
      this.prune(ref.item.id);
      return;
    }
    const shower = spec.sound === 'shower';
    const geo = shower
      ? new THREE.CylinderGeometry(0.03, 0.2, spec.fall, 14, 1, true)
      : new THREE.CylinderGeometry(0.008, 0.012, spec.fall, 8, 1, true);
    const mat = waterMat();
    mat.map = mat.map!.clone();
    mat.map.repeat.set(shower ? 5 : 1, Math.max(1, spec.fall * 2));
    const stream = new THREE.Mesh(geo, mat);
    stream.position.set(spec.x, spec.y - spec.fall / 2, spec.z);
    const group = new THREE.Group();
    group.add(stream);
    if (!shower) {
      // a little splash where the water lands
      const splash = new THREE.Mesh(new THREE.RingGeometry(0.01, 0.045, 14), new THREE.MeshBasicMaterial({ color: '#e9f7ff', transparent: true, opacity: 0.6, depthWrite: false }));
      splash.rotation.x = -Math.PI / 2;
      splash.position.set(spec.x, spec.y - spec.fall + 0.004, spec.z);
      group.add(splash);
    }
    group.userData.sound = spec.sound;
    ref.holder.add(group);
    a.water = group;
    audio.play('splash', { volume: 0.4 });
    report('water-used');
  }

  private toggleFlame(ref: ItemRef, spec: Extract<InteractSpec, { kind: 'flame' }>): void {
    const a = this.entry(ref);
    if (a.flame) {
      a.flame.removeFromParent();
      a.flame = undefined;
      audio.play('switch-off', { volume: 0.5 });
      this.prune(ref.item.id);
      return;
    }
    const g = new THREE.Group();
    for (const p of spec.points) {
      const ring = new THREE.Group();
      for (let i = 0; i < 10; i++) {
        const tongue = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.028, 5), flameMat);
        const ang = (i / 10) * Math.PI * 2;
        tongue.position.set(Math.cos(ang) * 0.045, 0.014, Math.sin(ang) * 0.045);
        ring.add(tongue);
      }
      ring.position.set(p.x, p.y, p.z);
      g.add(ring);
    }
    ref.holder.add(g);
    a.flame = g;
    audio.play('switch-on', { volume: 0.6 });
  }

  /** Animate the effects and keep their sounds at the right loudness for the listener. */
  update(dt: number, listener: Vec2, y: number): void {
    this.clock += dt;
    const volume: Partial<Record<Loop, number>> = {};
    const hear = (loop: Loop, ref: ItemRef, range: number) => {
      const d = Math.hypot(ref.pos.x - listener.x, ref.pos.y - listener.y) + Math.abs(ref.floorY - y) * 2;
      volume[loop] = Math.max(volume[loop] ?? 0, Math.max(0, 1 - d / range));
    };
    let anyScreen = false;
    for (const a of this.active.values()) {
      if (a.screen) {
        anyScreen = true;
        hear('tv', a.ref, 9);
      }
      if (a.water) {
        const mesh = a.water.children[0] as THREE.Mesh;
        const map = (mesh.material as THREE.MeshBasicMaterial).map;
        if (map) map.offset.y = (this.clock * 2.4) % 1;
        hear(a.water.userData.sound === 'shower' ? 'shower' : 'tap', a.ref, 7);
      }
      if (a.flame) {
        for (const ring of a.flame.children) ring.scale.setScalar(1 + Math.sin(this.clock * 23 + ring.position.x * 40) * 0.12);
        hear('stove', a.ref, 5);
      }
      if (a.appliance) {
        const body = a.ref.holder.userData.body as THREE.Object3D | undefined;
        if (body) body.position.x = Math.sin(this.clock * 38) * 0.0025;
        hear(a.appliance, a.ref, 8);
      }
    }
    for (const loop of ['tv', 'tap', 'shower', 'stove', 'washing', 'fan'] as Loop[]) {
      const v = volume[loop];
      audio.setLoop(loop, v !== undefined && v > 0.01, v ?? 0);
    }
    if (anyScreen) {
      this.tvTimer -= dt;
      if (this.tvTimer <= 0) {
        this.tvTimer = 0.1;
        drawTv(this.clock);
      }
    }
  }
}
