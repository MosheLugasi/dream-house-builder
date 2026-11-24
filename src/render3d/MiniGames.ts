import * as THREE from 'three';
import { audio } from '../audio';
import type { Sfx as AudioSfx } from '../audio/types';
import { sound, type Sfx as SoundSfx } from '../audio/sound';
import { getFurniture } from '../catalog';
import type { FurnitureDef } from '../catalog/types';
import { report } from '../game/progress';
import { miniGameMeta, type MiniGameId } from '../game/minigames/meta';
import { plotById } from '../game/minigames/plots';
import { miniGame } from '../game/minigames/registry';
import { medalFor, useMiniGame } from '../game/minigames/store';
import type { MiniGameContext, MiniGameResult, MiniGameSession, PlacedProp } from '../game/minigames/types';
import type { FurnitureItem, Project } from '../model/types';
import { useStore } from '../store/store';
import type { ItemLayer } from './ItemLayer';
import type { WalkController, WalkWorld } from './WalkController';
import type { ParticleKind } from './fx';

/** What the runtime needs from the engine. */
export interface MiniGameHost {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  walk: WalkController;
  props: ItemLayer;
  groundAt(x: number, y: number): number;
  night(): number;
  hour(): number;
  emit(kind: ParticleKind, at: THREE.Vector3, count: number, spread: number): void;
}

const AUDIO_SFX = new Set<string>([
  'click', 'place', 'delete', 'door-open', 'door-close', 'door-slide', 'switch-on', 'switch-off', 'sit', 'stand', 'jump', 'land', 'star',
  'success', 'fanfare', 'camera', 'whoosh', 'horn', 'bus-horn', 'bike-bell', 'splash', 'flush', 'bell', 'squeak', 'kick', 'bounce', 'goal',
  'bark', 'meow', 'purr', 'yawn',
]);

/**
 * Runs the neighborhood mini-games in walk mode: one round at a time, with its HUD, a navigation
 * arrow, the result card (medals and records) and clean-up of everything the round added.
 */
export class MiniGames {
  private session: MiniGameSession | null = null;
  private ctx: MiniGameContext | null = null;
  private root: THREE.Group | null = null;
  private t = 0;
  private seed = 1;
  private arrow: THREE.Group;
  private beacon: THREE.Mesh;
  private navTimer = 0;
  private timers = new Set<ReturnType<typeof setTimeout>>();

  constructor(private host: MiniGameHost) {
    // the floating arrow over the player's head and the light column on the target
    this.arrow = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: '#ffcf3a', depthTest: false, transparent: true, opacity: 0.95 });
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.36, 4), mat);
    head.rotation.x = Math.PI / 2;
    head.position.z = 0.28;
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.34), mat);
    tail.position.z = -0.02;
    this.arrow.add(head, tail);
    this.arrow.renderOrder = 20;
    this.arrow.visible = false;
    this.beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.5, 30, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: '#ffd84a', transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
    );
    this.beacon.visible = false;
    host.scene.add(this.arrow, this.beacon);
  }

  get active(): MiniGameId | null {
    return useMiniGame.getState().active;
  }

  /** Show the "how to play" card for a game (the player then presses start). */
  offer(id: MiniGameId): void {
    if (this.session) return;
    useMiniGame.getState().set({ intro: id, menuOpen: false, result: null });
  }

  /** Start a round (the venue must already be installed if the game has one). */
  start(id: MiniGameId): void {
    this.stop();
    const def = miniGame(id);
    const store = useMiniGame.getState();
    store.set({ active: id, intro: null, result: null, menuOpen: false, hud: {}, popups: [], banner: null, countdown: null, nav: null });
    const root = new THREE.Group();
    root.name = `minigame:${id}`;
    this.host.scene.add(root);
    this.root = root;
    this.t = 0;
    this.seed = (Date.now() % 100000) + 1;
    const host = this.host;
    const plot = def.venue ? plotById(def.venue.plot) : null;
    const later = (fn: () => void, ms: number) => {
      const h = setTimeout(() => {
        this.timers.delete(h);
        fn();
      }, ms);
      this.timers.add(h);
    };
    const ctx: MiniGameContext = {
      id,
      scene: host.scene,
      root,
      camera: host.camera,
      walk: host.walk,
      world: (): WalkWorld => host.walk.world,
      project: (): Project => useStore.getState().project,
      props: (filter) => this.placedProps(filter),
      plotToSite: (x, y) => (plot ? { x: plot.x0 + x, y: plot.y0 + y } : { x, y }),
      groundAt: (x, y) => host.groundAt(x, y),
      night: () => host.night(),
      hour: () => host.hour(),
      emit: (kind, at, count = 12, spread = 0.3) => host.emit(kind, at, count, spread),
      sfx: (name, volume = 1) => {
        if (AUDIO_SFX.has(name)) audio.play(name as AudioSfx, { volume });
        else sound.sfx(name as SoundSfx, volume);
      },
      note: (midi, volume = 0.8) => sound.piano(midi, volume),
      ui: {
        set: (patch) => useMiniGame.getState().setHud(patch),
        popup: (text, color) => useMiniGame.getState().popup(text, color),
        banner: (text, ms) => useMiniGame.getState().showBanner(text, ms),
        countdown: (from = 3) =>
          new Promise<void>((resolve) => {
            const step = (n: number) => {
              if (ctx !== this.ctx) return resolve();
              if (n === 0) {
                useMiniGame.getState().set({ countdown: 'צא!' });
                sound.piano(84, 0.9);
                later(() => useMiniGame.getState().set({ countdown: null }), 700);
                resolve();
                return;
              }
              useMiniGame.getState().set({ countdown: String(n) });
              sound.piano(72, 0.8);
              later(() => step(n - 1), 800);
            };
            step(from);
          }),
      },
      finish: (result) => this.finish(id, result),
      quit: () => this.stop(),
      elapsed: () => this.t,
      random: () => {
        // mulberry32
        let x = (this.seed += 0x6d2b79f5);
        x = Math.imul(x ^ (x >>> 15), x | 1);
        x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
        return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
      },
    };
    this.ctx = ctx;
    report('minigame-played');
    try {
      this.session = def.start(ctx);
    } catch (err) {
      console.error('mini-game failed to start', id, err);
      this.stop();
    }
  }

  /** Same game again. */
  restart(): void {
    const id = this.active ?? useMiniGame.getState().result?.id;
    if (id) this.start(id);
  }

  /** Leave the current round (no result). */
  stop(): void {
    const s = this.session;
    this.session = null;
    this.ctx = null;
    for (const h of this.timers) clearTimeout(h);
    this.timers.clear();
    try {
      s?.dispose();
    } catch (err) {
      console.error('mini-game dispose failed', err);
    }
    if (this.root) {
      this.host.scene.remove(this.root);
      this.root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && m.geometry) m.geometry.dispose();
      });
      this.root = null;
    }
    this.arrow.visible = false;
    this.beacon.visible = false;
    useMiniGame.getState().set({ active: null, hud: {}, countdown: null, nav: null, popups: [], banner: null });
  }

  private finish(id: MiniGameId, result: MiniGameResult): void {
    if (this.active !== id) return;
    const def = miniGame(id);
    const completed = result.completed !== false;
    const medal = completed ? medalFor(result.score, def.medals) : 0;
    const store = useMiniGame.getState();
    const isRecord = store.record(id, result.score, medal, !!def.medals.lowerIsBetter, completed);
    const best = useMiniGame.getState().records[id]?.best ?? null;
    this.stop();
    useMiniGame.getState().set({ result: { ...result, id, medal, record: isRecord && completed, best } });
    if (medal >= 3) report('minigame-gold');
    if (medal > 0) audio.play(medal >= 3 ? 'fanfare' : 'success');
    else audio.play('click');
  }

  /** Keys while a round runs (Esc leaves it). Returns true when the key was used. */
  key(code: string, down: boolean): boolean {
    if (!this.session) return false;
    if (code === 'Escape' && down) {
      this.stop();
      return true;
    }
    try {
      return this.session.key?.(code, down) ?? false;
    } catch (err) {
      console.error('mini-game key failed', err);
      return false;
    }
  }

  update(dt: number): void {
    if (!this.session) return;
    dt = Math.min(dt, 0.05);
    this.t += dt;
    try {
      this.session.update(dt);
    } catch (err) {
      console.error('mini-game update failed', err);
      this.stop();
      return;
    }
    this.updateNav(dt);
  }

  /** the arrow over the head points at the HUD target; the HUD gets distance and screen direction */
  private updateNav(dt: number): void {
    const target = useMiniGame.getState().hud.target;
    const walk = this.host.walk;
    if (!target) {
      this.arrow.visible = false;
      this.beacon.visible = false;
      if (useMiniGame.getState().nav) useMiniGame.getState().set({ nav: null });
      return;
    }
    const head = walk.character.root.position;
    const dx = target.x - walk.pos.x;
    const dy = target.y - walk.pos.y;
    const dist = Math.hypot(dx, dy);
    this.arrow.visible = dist > 2;
    this.arrow.position.set(head.x, walk.y + (walk.driving ? 2.6 : 2.25) + Math.sin(this.t * 3) * 0.06, head.z);
    this.arrow.rotation.y = Math.atan2(dx, dy);
    const gz = target.z ?? this.host.groundAt(target.x, target.y);
    this.beacon.visible = dist > 4;
    this.beacon.position.set(target.x, gz + 15, target.y);
    (this.beacon.material as THREE.MeshBasicMaterial).opacity = 0.16 + 0.08 * Math.sin(this.t * 4);
    this.navTimer -= dt;
    if (this.navTimer > 0) return;
    this.navTimer = 0.2;
    // direction on screen: 0 = straight ahead (up), clockwise positive
    const cam = this.host.camera;
    const fwd = new THREE.Vector3();
    cam.getWorldDirection(fwd);
    const camYaw = Math.atan2(fwd.x, fwd.z);
    let a = Math.atan2(dx, dy) - camYaw;
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    useMiniGame.getState().set({ nav: { meters: Math.round(dist), angle: -a, label: target.label } });
  }

  private placedProps(filter?: (item: FurnitureItem, def: FurnitureDef) => boolean): PlacedProp[] {
    const out: PlacedProp[] = [];
    for (const item of useStore.getState().project.site.props) {
      const def = getFurniture(item.catalogId);
      if (!def || (filter && !filter(item, def))) continue;
      out.push({
        item,
        def,
        holder: this.host.props.entries.get(item.id)?.holder,
        pos: { x: item.x, y: item.y },
        rotation: item.rotation,
        floorY: this.host.groundAt(item.x, item.y),
      });
    }
    return out;
  }

  dispose(): void {
    this.stop();
    this.host.scene.remove(this.arrow, this.beacon);
  }
}

export { miniGameMeta };
