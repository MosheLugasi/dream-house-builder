import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Realism, snapToShadowTexels } from './render/Realism';
import type { Quality } from '../store/quality';
import { getFurniture, itemSize, type ItemAnchors } from '../catalog';
import { placedBoxes, placedLight, placedSeats } from '../catalog/placed';
import { setWindowGlow } from '../catalog/openings';
import { finishes } from '../materials/finishes';
import { setMaxAnisotropy } from '../materials/textureGen';
import { snapTo } from '../model/geom';
import { getGraph, roomAt, styleOfRoom } from '../model/graph';
import { stairBarriers } from '../model/stairs';
import { audio } from '../audio';
import type { Surface } from '../audio/types';
import { useProgress } from '../game/progress';
import { levelElevation, ROAD_CELL, SLAB, toLocal, toSite, type Building, type FurnitureItem, type Level, type Vec2 } from '../model/types';
import {
  addFurniture,
  addProp,
  collisionFootprint,
  deleteSelection,
  setExterior,
  setRoomStyle,
  snapFurnitureToWall,
  updateBuilding,
  updateFurniture,
  updateProp,
} from '../store/actions';
import { currentBuilding, currentLevel, useStore, type Mode } from '../store/store';
import { Atmosphere } from './Atmosphere';
import { BuildingView } from './BuildingView';
import { buildSite, groundHeight, roadSet, SIDEWALK_HEIGHT } from './buildSite';
import { updateEffects } from './effects';
import { ItemLayer, makeItemHolder, type ItemEntry } from './ItemLayer';
import { Particles, Stars } from './Life';
import { Traffic } from './Traffic';
import { randomLook } from './characterTypes';
import { LightManager, type LampSource } from './LightManager';
import { emptyWorld, seatsOf, WalkController, type WalkWorld } from './WalkController';
import { Interactions } from './Interactions';
import { itemEvents } from './ItemLayer';
import { sound } from '../audio/sound';
import { useWalk } from '../store/walk';
import { normalizeLook, type Activity } from './Character';

/** Named moments of the day (the HUD buttons and the N key jump between them). */
// (the sun sets at 18:00 in Atmosphere's model: 17:42 is the golden hour, 18:36 was already full night)
export const DAY_MOMENTS = { day: 14.5, sunset: 17.7, night: 21.5 } as const;
export type TimeOfDay = keyof typeof DAY_MOMENTS;
export function momentOf(hours: number): TimeOfDay {
  return hours >= 20 || hours < 5.5 ? 'night' : hours >= 17.5 ? 'sunset' : 'day';
}

const EMOTES: Record<string, { activity: Activity; seconds: number; text: string }> = {
  Digit1: { activity: 'wave', seconds: 2.5, text: '👋' },
  Digit2: { activity: 'dance', seconds: 60, text: '💃' },
  Digit3: { activity: 'clap', seconds: 2.5, text: '👏' },
  Digit4: { activity: 'cheer', seconds: 2.5, text: '🙌' },
  Digit5: { activity: 'stretch', seconds: 4, text: '🙆' },
};

interface FurnitureEntry {
  item: FurnitureItem;
  holder: THREE.Group;
  colorsKey: string;
}



type Picked =
  | { kind: 'furniture'; entry: ItemEntry }
  | { kind: 'prop'; entry: ItemEntry }
  | { kind: 'building'; building: Building };

/** Owns the WebGL scene: builds it from the project and handles 3D interaction. */
export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1200);
  private controls: OrbitControls;
  /** post-processing, daylight through windows, grading, photo (see render/Realism.ts) */
  readonly realism: Realism;
  readonly atmosphere: Atmosphere;
  readonly lights = new LightManager();
  private time = 14.5;
  private storeTime = 14.5;
  private clockTimer = 0;
  private lampKey: unknown[] = [];
  readonly interactions: Interactions;
  private photoPending = false;
  private particles = new Particles();
  private stars = new Stars(this.particles);
  private traffic = new Traffic();
  private unsubLook: () => void = () => {};
  private ground: THREE.Mesh;
  private groundFinish = '';
  private buildings = new Map<string, BuildingView>();
  private buildingsGroup = new THREE.Group();
  private props = new ItemLayer();
  private siteGroup: THREE.Group | null = null;
  private siteKey: unknown[] = [];
  private roads = new Set<string>();
  private selectionBox = new THREE.Box3Helper(new THREE.Box3(), new THREE.Color('#ff8a3d'));
  private ghost: { catalogId: string; holder: THREE.Group } | null = null;
  private ghostRotation = 0;
  readonly walk: WalkController;
  private mode: Mode = 'plan';
  private running = false;
  private raf = 0;
  private clock = new THREE.Timer();
  private dirty = true;
  private unsub: () => void;
  private raycaster = new THREE.Raycaster();
  private pointer = { downX: 0, downY: 0, moved: false, down: false };
  private drag: { kind: 'furniture' | 'prop' | 'building'; id: string; offset: Vec2; y: number; started: boolean } | null = null;
  private width = 1;
  private height = 1;
  private quality: Quality = 'high';
  private framedKey = '';
  private walkProject: unknown = null;
  private nearBuildings = new Set<string>();
  private nearTimer = 0;
  private pendingSpawn: { start: Vec2; y: number; yaw: number } | null = null;
  private windowGlow = -1;

  constructor(private host: HTMLElement) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer = renderer;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    // tone mapping and exposure: see render/Realism.ts (colour pipeline) and Atmosphere (exposure by time of day)
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    host.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.touchAction = 'none';
    setMaxAnisotropy(renderer.capabilities.getMaxAnisotropy());

    // sky, sun / moon, ambient light
    this.atmosphere = new Atmosphere(renderer, this.scene);
    this.time = this.storeTime = useStore.getState().view.timeOfDay;
    this.atmosphere.setTime(this.time);
    this.realism = new Realism(renderer, this.scene, this.camera, this.atmosphere, this.lights);
    this.scene.add(this.lights.group, this.particles.group, this.stars.group, this.traffic.group);
    this.stars.group.visible = false;
    this.traffic.group.visible = false;

    // ground (the finish library adds its own large-scale variation, so plain tiling UVs in meters are enough)
    // (tessellated: depth is interpolated more precisely over small triangles than over two 900 m ones)
    const groundGeo = new THREE.PlaneGeometry(900, 900, 60, 60).rotateX(-Math.PI / 2);
    const uv = groundGeo.attributes.uv;
    const gp = groundGeo.attributes.position;
    for (let i = 0; i < gp.count; i++) uv.setXY(i, gp.getX(i), gp.getZ(i));
    this.ground = new THREE.Mesh(groundGeo);
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    this.scene.add(this.buildingsGroup, this.props.group);
    this.selectionBox.visible = false;
    (this.selectionBox.material as THREE.LineBasicMaterial).depthTest = false;
    this.selectionBox.renderOrder = 10;
    this.scene.add(this.selectionBox);

    // orbit camera
    this.camera.position.set(14, 13, 18);
    this.controls = new OrbitControls(this.camera, renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.04;
    this.controls.minDistance = 2;
    this.controls.maxDistance = 320;
    this.controls.target.set(6, 0.5, 4.5);

    this.walk = new WalkController(this.camera, renderer.domElement);
    this.walk.onHint = (hint) => useStore.getState().setHint(hint);
    this.walk.onToggleFirstPerson = () => {
      const st = useStore.getState();
      st.setView({ firstPerson: !st.view.firstPerson });
    };
    this.walk.onVehicleParked = (id, x, y, rotation) => updateProp(id, { x, y, rotation }, true);
    this.adoptLegacyLook();
    this.walk.character.setLook(useProgress.getState().look);
    this.unsubLook = useProgress.subscribe((st, prev) => {
      if (st.look !== prev.look) this.walk.character.setLook(st.look);
    });
    this.walk.character.root.visible = false;
    this.scene.add(this.walk.character.root);
    this.walk.onShortcut = (code) => this.shortcut(code);
    this.interactions = new Interactions(this.scene);
    // lamps are lit by the light manager: after dark by themselves, or when someone flips the switch
    this.interactions.lamps = {
      isOn: (id) => this.lights.isOn(id, this.atmosphere.night),
      toggle: (id) => this.lights.toggle(id, this.atmosphere.night),
    };
    this.interactions.goalScored = (at) => {
      this.particles.burst('confetti', at, 40);
      audio.play('goal');
      useProgress.getState().setFlash('⚽ גוווול!');
    };
    // sleeping skips to the other half of the day: to the morning at night, to the evening by day
    this.interactions.onSleep = () => {
      const morning = this.atmosphere.night > 0.5;
      this.setTime(morning ? 7 : DAY_MOMENTS.night);
      useWalk.getState().toast(morning ? '☀️ בוקר טוב!' : '🌙 לילה טוב…');
    };
    // every placed item (in any building, level or out on the street) registers its behaviours
    itemEvents.current = {
      add: (entry) => {
        const def = getFurniture(entry.item.catalogId);
        if (def) this.interactions.register(entry.item, def, entry.holder, (entry.holder.userData.body as THREE.Object3D) ?? entry.holder, null);
      },
      move: (entry) => this.interactions.updateItem(entry.item),
      remove: (id) => this.interactions.unregister(id),
    };

    const el = renderer.domElement;
    el.addEventListener('pointerdown', this.onPointerDown);
    el.addEventListener('pointermove', this.onPointerMove);
    el.addEventListener('pointerup', this.onPointerUp);
    el.addEventListener('pointerleave', this.onPointerLeave);
    el.addEventListener('dblclick', this.onDblClick);
    window.addEventListener('keydown', this.onKeyDown);

    this.unsub = useStore.subscribe(() => {
      this.dirty = true;
    });
    this.applyQuality(useStore.getState().view.quality);
  }

  dispose(): void {
    this.stop();
    this.unsub();
    this.unsubLook();
    this.walk.disable();
    if (itemEvents.current) itemEvents.current = null;
    const el = this.renderer.domElement;
    el.removeEventListener('pointerdown', this.onPointerDown);
    el.removeEventListener('pointermove', this.onPointerMove);
    el.removeEventListener('pointerup', this.onPointerUp);
    el.removeEventListener('pointerleave', this.onPointerLeave);
    el.removeEventListener('dblclick', this.onDblClick);
    window.removeEventListener('keydown', this.onKeyDown);
    this.controls.dispose();
    for (const v of this.buildings.values()) v.dispose();
    this.realism.dispose();
    this.renderer.dispose();
    el.remove();
  }

  resize(width: number, height: number): void {
    if (width < 2 || height < 2) return;
    this.width = width;
    this.height = height;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.realism.setSize(width, height);
    this.interactions.particles.setViewport(height * this.renderer.getPixelRatio(), this.camera.fov);
  }

  private applyQuality(q: Quality): void {
    this.quality = q;
    this.realism.setQuality(q, this.width, this.height);
  }

  // ---- run loop ------------------------------------------------------------------------------

  start(): void {
    if (this.running) return;
    this.running = true;
    this.clock.update();
    const loop = () => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      this.frame();
    };
    loop();
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private frame(): void {
    this.clock.update();
    const dt = this.clock.getDelta();
    if (this.mode === 'walk') {
      this.nearTimer -= dt;
      if (this.nearTimer <= 0) {
        this.nearTimer = 0.5;
        this.updateNearBuildings();
      }
    }
    if (this.dirty) {
      this.dirty = false;
      this.sync();
      this.realism.invalidate();
    }
    this.advanceClock(dt);
    if (this.mode === 'walk') {
      const walk = this.walk;
      walk.night = this.atmosphere.night;
      walk.update(dt);
      this.stars.update(dt, walk);
      this.traffic.update(dt, walk, () => audio.play('horn', { volume: 0.45 }));
      this.updateHeadlight();
    } else this.controls.update();
    this.particles.update(dt);
    this.atmosphere.update(dt, this.camera);
    updateEffects(dt);
    const focus = this.mode === 'walk' ? this.walk.character.root.position : this.controls.target;
    this.lights.update(dt, focus, this.atmosphere.night);
    // a far-away overview needs a farther near plane to keep roads and floors from z-fighting
    const near = this.mode === 'walk' ? 0.1 : Math.max(0.1, Math.min(3, this.camera.position.distanceTo(this.controls.target) / 150));
    if (Math.abs(near - this.camera.near) > this.camera.near * 0.2) {
      this.camera.near = near;
      this.camera.updateProjectionMatrix();
    }
    this.interactions.update(dt, this.mode === 'walk' ? this.walk.character.root.position : null);
    this.updateSun();
    const walking = this.mode === 'walk';
    this.realism.update(dt, { walking, indoors: walking && this.walk.indoors, project: useStore.getState().project, focus });
    this.realism.render();
    if (this.photoPending) {
      this.photoPending = false;
      this.savePhoto();
    }
  }
  /** A look saved by the first character editor becomes the avatar once, then the old key goes away. */
  private adoptLegacyLook(): void {
    const KEY = 'dream-house-builder:character';
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      localStorage.removeItem(KEY);
      useProgress.getState().setLook(normalizeLook(JSON.parse(raw)));
    } catch {
      /* no storage, or an unreadable value: keep the current avatar */
    }
  }

  // ---- walk-mode extras ----------------------------------------------------------------------

  /** run a walk-mode action button */
  runChoice(id: string): void {
    this.interactions.run(id);
  }

  instrumentKey(kind: 'piano' | 'guitar' | 'drums', code: string): void {
    this.interactions.instrumentKey(kind, code);
  }

  emote(code: string): void {
    const e = EMOTES[code];
    if (!e || this.mode !== 'walk') return;
    if (this.walk.occupation) return;
    if (this.walk.character.getActivity() === e.activity) {
      this.walk.endTimed();
      return;
    }
    this.walk.playFor(e.activity, e.seconds);
    if (e.activity === 'dance') {
      const ps = this.interactions.particles;
      let n = 0;
      const timer = setInterval(() => {
        if (this.walk.character.getActivity() !== 'dance' || ++n > 200) return clearInterval(timer);
        if (Math.random() < 0.5) ps.emit('note', this.walk.character.headWorld().add(new THREE.Vector3(0, 0.3, 0)));
      }, 300);
    }
    if (e.activity === 'clap') {
      for (let i = 0; i < 5; i++) setTimeout(() => sound.sfx('clack', 0.5), 150 + i * 260);
    }
    if (e.activity === 'cheer') sound.sfx('cheer', 0.5);
  }

  jump(): void {
    if (this.mode === 'walk') this.walk.jump();
  }

  callPets(): void {
    this.interactions.callPets();
  }

  takePhoto(): void {
    this.photoPending = true;
    sound.sfx('shutter');
    useProgress.getState().report('photo-taken');
    useWalk.getState().set({ flash: Date.now() });
  }

  private savePhoto(): void {
    try {
      // supersampled at a higher resolution when the quality preset allows it, else the canvas as shown
      const canvas = this.realism.photo() ?? this.renderer.domElement;
      const d = new Date();
      const name = `בית-החלומות-${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}-${d.getHours()}${d.getMinutes()}${d.getSeconds()}.png`;
      const download = (href: string, revoke: boolean) => {
        const a = document.createElement('a');
        a.download = name;
        a.href = href;
        a.click();
        if (revoke) setTimeout(() => URL.revokeObjectURL(href), 10000);
        useWalk.getState().toast('📸 התמונה נשמרה');
      };
      if (canvas === this.renderer.domElement) download(canvas.toDataURL('image/png'), false);
      else canvas.toBlob((blob) => blob && download(URL.createObjectURL(blob), true), 'image/png');
    } catch (err) {
      console.warn('photo failed', err);
    }
  }

  private shortcut(code: string): boolean {
    if (EMOTES[code]) {
      this.emote(code);
      return true;
    }
    const st = useStore.getState();
    switch (code) {
      case 'KeyC':
        this.callPets();
        return true;
      case 'KeyP':
        this.takePhoto();
        return true;
      case 'KeyN': {
        const order: TimeOfDay[] = ['day', 'sunset', 'night'];
        this.setTime(DAY_MOMENTS[order[(order.indexOf(momentOf(st.view.timeOfDay)) + 1) % order.length]]);
        return true;
      }
      case 'KeyM': {
        const m = !sound.isMuted();
        sound.setMuted(m);
        audio.muted = m;
        useWalk.getState().set({ muted: m });
        return true;
      }
    }
    return false;
  }

  /** Time of day: follows the store (slider) and runs on its own when the clock is switched on. */
  private advanceClock(dt: number): void {
    const view = useStore.getState().view;
    if (view.timeOfDay !== this.storeTime) {
      // changed from outside (slider, sleeping…)
      this.storeTime = view.timeOfDay;
      this.time = view.timeOfDay;
    }
    if (view.autoTime) {
      // a full day in 12 minutes; the night passes twice as fast
      const rate = this.atmosphere.night > 0.9 ? 4 : 2;
      this.time = (this.time + dt * (rate / 60)) % 24;
      this.clockTimer -= dt;
      if (this.clockTimer <= 0) {
        this.clockTimer = 1;
        this.storeTime = Math.round(this.time * 60) / 60;
        useStore.getState().setView({ timeOfDay: this.storeTime });
      }
    }
    const before = this.atmosphere.night;
    this.atmosphere.setTime(this.time);
    const night = this.atmosphere.night;
    if (before > 0.45 !== night > 0.45) this.interactions.refreshLights();
    // lit windows glow for whoever looks at a house from outside; from inside the panes stay dark
    const indoors = this.mode === 'walk' && this.walk.indoors;
    const glow = this.windowGlow < 0 ? night : this.windowGlow + ((indoors ? 0 : night) - this.windowGlow) * Math.min(1, dt * 3);
    if (Math.abs(glow - this.windowGlow) > 0.004 || (glow < 0.004 && this.windowGlow !== 0)) {
      this.windowGlow = glow < 0.004 ? 0 : glow;
      setWindowGlow(this.windowGlow);
    }
    const bloom = this.realism.pipeline.bloom;
    if (bloom) {
      // by day the sky itself is far brighter than any lamp: keep the glow for the evening,
      // and keep it gentle in a lit room
      bloom.threshold = 4 - 2.9 * night;
      bloom.strength = 0.03 + 0.25 * night * (indoors ? 0.3 : 1);
    }
  }

  /** Jump to an hour (used when the character sleeps until morning). */
  setTime(hours: number): void {
    this.time = hours;
    this.storeTime = hours;
    useStore.getState().setView({ timeOfDay: hours });
  }

  /** Stars found / placed in this neighborhood. */
  starCount(): { found: number; total: number } {
    return this.stars.count;
  }

  /** Headlights of the vehicle being driven switch on after dark. */
  private updateHeadlight(): void {
    const lamp = this.lights.headlight;
    const v = this.walk.currentVehicle;
    const on = !!v && this.atmosphere.night > 0.35 && v.def.vehicle!.kind !== 'scooter';
    lamp.intensity += ((on ? 260 : 0) - lamp.intensity) * 0.15;
    if (!v) return;
    const phi = v.holder.rotation.y;
    const fx = Math.sin(phi);
    const fz = Math.cos(phi);
    const front = v.def.size.d / 2;
    lamp.position.set(v.holder.position.x + fx * front, v.holder.position.y + Math.min(0.9, v.def.size.h * 0.45), v.holder.position.z + fz * front);
    lamp.target.position.set(lamp.position.x + fx * 16, 0, lamp.position.z + fz * 16);
  }

  /** What the floor is made of at a place (for footsteps). */
  private surfaceAt(x: number, y: number, feetY: number): Surface {
    const { project } = useStore.getState();
    const fromFinish = (id: string): Surface => {
      if (/carpet/.test(id)) return 'carpet';
      if (/plank|wood|herringbone|deck|oak|walnut|maple/.test(id)) return 'wood';
      if (/grass|soil/.test(id)) return 'grass';
      if (/sand|gravel/.test(id)) return 'sand';
      if (/water/.test(id)) return 'water';
      if (/asphalt/.test(id)) return 'asphalt';
      if (/paver|cobble|stone|concrete/.test(id)) return 'stone';
      return 'tile';
    };
    for (const b of project.buildings) {
      const local = toLocal(b, { x, y });
      for (let i = b.levels.length - 1; i >= 0; i--) {
        if (Math.abs(levelElevation(b, i) - feetY) > 1) continue;
        const lvl = b.levels[i];
        const graph = getGraph(lvl.walls);
        const room = roomAt(graph, local);
        if (room) return fromFinish(styleOfRoom(graph, room, lvl.roomStyles)?.floor ?? b.defaultFloor);
      }
    }
    if (feetY > 1) return 'wood'; // stairs
    const g = groundHeight(this.roads, x, y);
    if (g >= SIDEWALK_HEIGHT - 1e-3) return 'stone';
    if (g > 0) return 'asphalt';
    for (let i = project.site.areas.length - 1; i >= 0; i--) {
      const a = project.site.areas[i];
      if (x >= a.x0 && x <= a.x1 && y >= a.y0 && y <= a.y1) return fromFinish(a.finish);
    }
    return fromFinish(project.site.ground);
  }

  /** Keep the shadow frustum centred on what the camera looks at. */
  private updateSun(): void {
    const sun = this.atmosphere.sun;
    const focus = this.mode === 'walk' ? this.walk.character.root.position : this.controls.target;
    const center = this.sunCenter;
    const range = this.realism.sunShadowFit(this.mode === 'walk', focus, this.camera.position.distanceTo(this.controls.target), center);
    snapToShadowTexels(center, this.atmosphere.lightDir, (2 * range) / sun.shadow.mapSize.x);
    const cam = sun.shadow.camera;
    if (cam.right !== range) {
      cam.left = -range;
      cam.right = range;
      cam.top = range;
      cam.bottom = -range;
      cam.near = 1;
      cam.far = 420;
      cam.updateProjectionMatrix();
    }
    sun.target.position.copy(center);
    sun.position.copy(sun.target.position).addScaledVector(this.atmosphere.lightDir, 200);
  }
  private sunCenter = new THREE.Vector3();

  /** Interiors are only furnished for buildings close to the walker. */
  private updateNearBuildings(): void {
    const p = this.walk.pos;
    const near = new Set<string>();
    for (const b of useStore.getState().project.buildings) {
      const box = this.localBounds(b);
      const c = toSite(b, { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 });
      const r = Math.hypot(box.maxX - box.minX, box.maxY - box.minY) / 2;
      if (Math.hypot(c.x - p.x, c.y - p.y) < r + 22) near.add(b.id);
    }
    if (near.size !== this.nearBuildings.size || [...near].some((id) => !this.nearBuildings.has(id))) {
      this.nearBuildings = near;
      this.dirty = true;
    }
  }

  private localBounds(b: Building): { minX: number; minY: number; maxX: number; maxY: number } {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const lvl of b.levels) {
      for (const w of lvl.walls) {
        for (const p of [w.a, w.b]) {
          minX = Math.min(minX, p.x);
          minY = Math.min(minY, p.y);
          maxX = Math.max(maxX, p.x);
          maxY = Math.max(maxY, p.y);
        }
      }
    }
    if (minX === Infinity) return { minX: -3, minY: -3, maxX: 3, maxY: 3 };
    return { minX, minY, maxX, maxY };
  }

  // ---- scene sync ----------------------------------------------------------------------------

  private level(): Level {
    const st = useStore.getState();
    return currentLevel(st.project, st.levelIndex);
  }

  private activeElevation(): number {
    const st = useStore.getState();
    const b = currentBuilding(st.project);
    return levelElevation(b, Math.min(st.levelIndex, b.levels.length - 1));
  }

  private sync(): void {
    const st = useStore.getState();
    const { project, view } = st;
    if (view.quality !== this.quality) this.applyQuality(view.quality);
    const modeChanged = st.mode !== this.mode;
    if (modeChanged) this.mode = st.mode;
    const walking = this.mode === 'walk';
    const active = st.scope === 'building' && !walking ? currentBuilding(project) : null;

    if (project.site.ground !== this.groundFinish) {
      this.groundFinish = project.site.ground;
      // shared material: never clone it, the library upgrades its textures in place
      this.ground.material = finishes.material(this.groundFinish);
    }

    // buildings
    let changed = false;
    const seen = new Set<string>();
    for (const b of project.buildings) {
      seen.add(b.id);
      let bv = this.buildings.get(b.id);
      if (!bv) {
        bv = new BuildingView(b.id);
        this.buildings.set(b.id, bv);
        this.buildingsGroup.add(bv.group);
        changed = true;
      }
      const isActive = b === active;
      const level = Math.min(st.levelIndex, b.levels.length - 1);
      const res = bv.update(b, {
        activeLevel: isActive && !view.showRoof ? level : null,
        wallsLow: isActive && view.wallsLow,
        ceilings: walking,
        furniture: isActive || (walking && this.nearBuildings.has(b.id)),
      });
      changed = changed || res;
    }
    for (const [id, bv] of this.buildings) {
      if (!seen.has(id)) {
        this.buildingsGroup.remove(bv.group);
        bv.dispose();
        this.buildings.delete(id);
        changed = true;
      }
    }

    // roads, areas, props
    const siteKey = [project.site.roads, project.site.areas];
    if (siteKey.some((v, i) => v !== this.siteKey[i])) {
      this.siteKey = siteKey;
      if (this.siteGroup) {
        this.scene.remove(this.siteGroup);
        this.siteGroup.traverse((m) => (m as THREE.Mesh).geometry?.dispose());
      }
      this.siteGroup = buildSite(project.site);
      this.scene.add(this.siteGroup);
      this.roads = roadSet(project.site);
      changed = true;
    }
    if (this.props.sync(project.site.props, { levelHeight: 2.7, rise: 3, lights: false })) {
      changed = true;
      // props stand on the ground, which is a little higher on sidewalks
      for (const e of this.props.entries.values()) e.holder.position.y = e.item.elevation + groundHeight(this.roads, e.item.x, e.item.y);
    }

    // lamps of the site and of every furnished building
    const lampKey: unknown[] = [project.site.props, ...project.buildings.flatMap((b) => [b, this.buildings.get(b.id)?.levels[0]?.items.entries.size ?? 0])];
    if (lampKey.length !== this.lampKey.length || lampKey.some((v, i) => v !== this.lampKey[i])) {
      this.lampKey = lampKey;
      this.lights.setSources(this.collectLamps());
    }

    if (modeChanged) this.applyMode();
    if (walking && (changed || modeChanged || project !== this.walkProject)) {
      this.walkProject = project;
      this.walk.world = this.buildWalkWorld();
      this.interactions.setWorld(this.walk.world);
      if (this.pendingSpawn) {
        const { start, y, yaw } = this.pendingSpawn;
        this.pendingSpawn = null;
        this.walk.teleport(start, yaw, y);
      }
    }
    this.syncSelection();
    this.syncGhost();
    this.walk.firstPerson = view.firstPerson;

    const frameKey = `${project.id}|${st.scope}|${st.scope === 'building' ? st.buildingIndex : ''}`;
    if (!walking && frameKey !== this.framedKey) {
      this.framedKey = frameKey;
      this.frameAll();
    }
  }

  /** Every lamp that currently exists in the scene, with its position in the world. */
  private collectLamps(): LampSource[] {
    const { project } = useStore.getState();
    const out: LampSource[] = [];
    const add = (f: FurnitureItem, origin: Pick<Building, 'x' | 'y' | 'rotation'>, floorY: number, lift: number, holder?: THREE.Object3D) => {
      const def = getFurniture(f.catalogId);
      if (!def?.light) return;
      const rot = f.rotation + origin.rotation;
      const p = toSite(origin, { x: f.x, y: f.y });
      const c = Math.cos(rot);
      const s = Math.sin(rot);
      const l = def.light;
      // the light sits where the (resized / mirrored) fitting really has its bulb; a bigger fitting gives more light
      const at = placedLight(def, f, holder?.userData.body?.userData.anchors) ?? l;
      const sz = itemSize(def, f);
      const grow = Math.min(2.2, Math.max(0.6, Math.sqrt((sz.w * sz.d) / (def.size.w * def.size.d))));
      out.push({
        id: f.id,
        pos: new THREE.Vector3(p.x + at.x * c - at.z * s, floorY + f.elevation + at.y + (def.mount === 'ceiling' ? lift : 0), p.y + at.x * s + at.z * c),
        color: l.color,
        intensity: l.intensity * grow,
        distance: l.distance * Math.sqrt(grow),
      });
    };
    for (const f of project.site.props) add(f, { x: 0, y: 0, rotation: 0 }, groundHeight(this.roads, f.x, f.y), 0, this.props.entries.get(f.id)?.holder);
    for (const b of project.buildings) {
      const bv = this.buildings.get(b.id);
      b.levels.forEach((lvl, i) => {
        const layer = bv?.levels[i]?.items;
        if (!layer) return;
        for (const entry of layer.entries.values()) add(entry.item, b, levelElevation(b, i), lvl.height - 2.7, entry.holder);
      });
    }
    return out;
  }

  /** Everything the walk controller needs, in site coordinates. */
  private buildWalkWorld(): WalkWorld {
    const { project } = useStore.getState();
    const world = emptyWorld();
    const roads = this.roads;
    world.groundAt = (x, y) => groundHeight(roads, x, y);
    world.surfaceAt = (x, y, feetY) => this.surfaceAt(x, y, feetY);
    world.occluders = [this.buildingsGroup];

    const addItem = (
      f: FurnitureItem,
      origin: Pick<Building, 'x' | 'y' | 'rotation'>,
      floorY: number,
      rise: number | null,
      holder: THREE.Group | undefined,
      home: Building | null,
    ) => {
      const def = getFurniture(f.catalogId);
      if (!def) return;
      const p = toSite(origin, { x: f.x, y: f.y });
      const rot = f.rotation + origin.rotation;
      const c = Math.cos(rot);
      const s = Math.sin(rot);
      const tx = (q: Vec2): Vec2 => ({ x: p.x + q.x * c - q.y * s, y: p.y + q.x * s + q.y * c });
      void home;
      const anchors = holder?.userData.body?.userData.anchors as ItemAnchors | undefined;
      // swings / rocking things are ridden through their action, not as a plain seat
      const ridden = def.ride || def.actions?.some((a) => a.kind === 'swing' || a.kind === 'rock');
      if (!ridden) world.seats.push(...seatsOf(def, p.x, p.y, rot, floorY, f.elevation, f.id, placedSeats(def, f, anchors)));
      // pets walk around and balls roll: they are not fixed obstacles
      if (def.actions?.some((a) => a.kind === 'pet' || a.kind === 'ball')) return;
      if (def.stair && rise !== null) {
        world.stairs.push({ x: p.x, y: p.y, rotation: rot, w: def.size.w, d: def.size.d, type: def.stair.type, y0: floorY, y1: floorY + rise });
        const bars = stairBarriers(def.stair.type, def.size.w, def.size.d);
        const y0 = floorY;
        const y1 = floorY + rise + 1;
        for (const [a, b] of bars.solid) world.walls.push({ a: tx(a), b: tx(b), half: 0.05, y0, y1 });
        world.walls.push({ a: tx(bars.entry[0]), b: tx(bars.entry[1]), half: 0.05, y0, y1, openY: floorY });
        world.walls.push({ a: tx(bars.exit[0]), b: tx(bars.exit[1]), half: 0.05, y0, y1, openY: floorY + rise });
        return;
      }
      // one solid box, or several for L / U shaped pieces (local boxes → world)
      for (const b of placedBoxes(def, f, collisionFootprint(def), anchors)) {
        const at = tx({ x: b.x, y: b.z });
        world.boxes.push({
          id: f.id,
          x: at.x,
          y: at.y,
          hw: b.w / 2,
          hd: b.d / 2,
          rotation: rot,
          y0: floorY + f.elevation,
          y1: floorY + f.elevation + b.h,
        });
      }
    };

    for (const b of project.buildings) {
      const bv = this.buildings.get(b.id);
      const floors: WalkWorld['floors'][number] = { levels: [] };
      b.levels.forEach((lvl, i) => {
        const y = levelElevation(b, i);
        const top = i === b.levels.length - 1;
        const view = bv?.levels[i];
        for (const w of view?.arch?.colliders ?? []) {
          world.walls.push({ a: toSite(b, w.a), b: toSite(b, w.b), half: w.half, y0: y, y1: y + lvl.height + SLAB });
        }
        for (const d of view?.arch?.doors ?? []) {
          world.doors.push({ center: toSite(b, d.center), y, anims: d.anims, open: 0, sliding: d.anims.some((a) => a.kind === 'slide') });
        }
        for (const f of lvl.furniture) addItem(f, b, y, top ? null : lvl.height + SLAB, view?.items.entries.get(f.id)?.holder, b);
        floors.levels.push({ y, rooms: getGraph(lvl.walls).rooms.map((r) => r.polygon.map((p) => toSite(b, p))) });
      });
      world.floors.push(floors);
    }
    const origin = { x: 0, y: 0, rotation: 0 };
    for (const f of project.site.props) {
      const entry = this.props.entries.get(f.id);
      addItem(f, origin, groundHeight(roads, f.x, f.y), null, entry?.holder, null);
      const def = getFurniture(f.catalogId);
      if (def?.vehicle && entry) world.vehicles.push({ id: f.id, def, holder: entry.holder });
    }
    this.stars.build(project, world.groundAt);
    this.traffic.setRoads(project.site.roads, world.groundAt, randomLook);
    world.boxes.push(...this.traffic.boxes);
    return world;
  }

  private syncSelection(): void {
    const st = useStore.getState();
    const sel = st.selection;
    let target: THREE.Object3D | undefined;
    if (this.mode !== 'walk') {
      if (sel?.kind === 'furniture') target = this.activeItems()?.entries.get(sel.id)?.holder;
      else if (sel?.kind === 'prop') target = this.props.entries.get(sel.id)?.holder;
      else if (sel?.kind === 'building' && st.scope === 'site') target = this.buildings.get(sel.id)?.group;
    }
    if (target) {
      target.updateWorldMatrix(true, true);
      this.selectionBox.box.setFromObject(target);
      this.selectionBox.box.expandByScalar(0.02);
      this.selectionBox.visible = true;
    } else {
      this.selectionBox.visible = false;
    }
  }

  /** Furniture layer of the level being edited (building scope). */
  private activeItems(): ItemLayer | null {
    const st = useStore.getState();
    if (st.scope !== 'building') return null;
    const b = currentBuilding(st.project);
    return this.buildings.get(b.id)?.levels[Math.min(st.levelIndex, b.levels.length - 1)]?.items ?? null;
  }

  private syncGhost(): void {
    const tool = useStore.getState().tool;
    const want = tool.type === 'furniture' && this.mode === 'view3d' ? tool.catalogId : null;
    if (this.ghost && this.ghost.catalogId !== want) {
      this.scene.remove(this.ghost.holder);
      this.ghost = null;
    }
    if (want && !this.ghost) {
      const lvl = this.level();
      const holder = makeItemHolder({ catalogId: want }, { levelHeight: lvl.height, rise: lvl.height + SLAB, lights: false });
      if (holder) {
        holder.visible = false;
        holder.traverse((o) => {
          o.castShadow = false;
        });
        this.scene.add(holder);
        this.ghost = { catalogId: want, holder };
        this.ghostRotation = 0;
      }
    }
  }

  frameAll(): void {
    const st = useStore.getState();
    const box = new THREE.Box3();
    const addBuilding = (b: Building) => {
      const lb = this.localBounds(b);
      const h = levelElevation(b, b.levels.length - 1) + b.levels[b.levels.length - 1].height;
      for (const [x, y] of [
        [lb.minX, lb.minY],
        [lb.maxX, lb.minY],
        [lb.maxX, lb.maxY],
        [lb.minX, lb.maxY],
      ]) {
        const p = toSite(b, { x, y });
        box.expandByPoint(new THREE.Vector3(p.x, 0, p.y));
        box.expandByPoint(new THREE.Vector3(p.x, h, p.y));
      }
    };
    if (st.scope === 'building') addBuilding(currentBuilding(st.project));
    else {
      st.project.buildings.forEach(addBuilding);
      for (const [i, j] of st.project.site.roads) {
        box.expandByPoint(new THREE.Vector3(i * ROAD_CELL, 0, j * ROAD_CELL));
        box.expandByPoint(new THREE.Vector3((i + 1) * ROAD_CELL, 0, (j + 1) * ROAD_CELL));
      }
    }
    if (box.isEmpty()) box.set(new THREE.Vector3(-5, 0, -5), new THREE.Vector3(5, 3, 5));
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const radius = Math.hypot(size.x, size.z, size.y) * 0.5 + 1.5;
    const fit = Math.min(1, this.camera.aspect);
    const dist = (radius / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2)) / fit) * (st.scope === 'building' ? 0.86 : 0.8);
    this.controls.target.set(center.x, 0.6, center.z);
    this.camera.position.set(center.x + dist * 0.4, dist * 0.62, center.z + dist * 0.68);
    this.controls.update();
  }

  private applyMode(): void {
    this.stars.group.visible = this.mode === 'walk';
    this.traffic.group.visible = this.mode === 'walk';
    if (this.mode === 'walk') {
      this.controls.enabled = false;
      this.walk.character.root.visible = true;
      this.walk.enable();
      const st = useStore.getState();
      const b = currentBuilding(st.project);
      let start: Vec2;
      let y = 0;
      let yaw = Math.PI * 0.25;
      if (st.scope === 'building') {
        // inside the building being edited: the selected room, or the largest room of the current level
        const graph = getGraph(this.level().walls);
        const room = graph.rooms.slice().sort((p, q) => q.area - p.area)[0];
        const local = st.selection?.kind === 'room' ? st.selection.point : (room?.labelPoint ?? { x: 0, y: 0 });
        start = toSite(b, local);
        y = room ? this.activeElevation() : 0;
      } else {
        // out in the neighborhood: in front of the current building, looking at it
        const lb = this.localBounds(b);
        const cx = (lb.minX + lb.maxX) / 2;
        start = toSite(b, { x: cx, y: lb.maxY + 4 });
        const centre = toSite(b, { x: cx, y: (lb.minY + lb.maxY) / 2 });
        yaw = Math.atan2(start.x - centre.x, start.y - centre.y);
      }
      this.walk.pos = { ...start };
      this.pendingSpawn = { start, y, yaw };
      this.updateNearBuildings();
      this.camera.fov = 62;
      this.camera.updateProjectionMatrix();
      this.interactions.enterWalk(this.walk, this.walk.world);
      this.interactions.particles.setViewport(this.height * this.renderer.getPixelRatio(), this.camera.fov);
    } else {
      this.interactions.exitWalk();
      this.walk.disable();
      this.walk.character.root.visible = false;
      useStore.getState().setHint('');
      if (this.camera.fov !== 50) {
        this.camera.fov = 50;
        this.camera.updateProjectionMatrix();
        this.framedKey = '';
      }
      this.controls.enabled = true;
    }
  }

  // ---- interaction (orbit mode) --------------------------------------------------------------

  private setRay(e: PointerEvent | MouseEvent): void {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
  }

  /** Intersection of the pointer ray with a horizontal plane, in site coordinates. */
  private floorPoint(y = 0): Vec2 | null {
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -y);
    const hit = this.raycaster.ray.intersectPlane(plane, new THREE.Vector3());
    return hit ? { x: hit.x, y: hit.z } : null;
  }

  private pickIn(layer: ItemLayer): ItemEntry | null {
    const hits = this.raycaster.intersectObjects(layer.group.children, true);
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      while (o && o.userData.itemId === undefined) o = o.parent;
      if (o) return layer.entries.get(o.userData.itemId as string) ?? null;
    }
    return null;
  }

  private pick(): Picked | null {
    const st = useStore.getState();
    if (st.scope === 'building') {
      const layer = this.activeItems();
      const entry = layer && this.pickIn(layer);
      return entry ? { kind: 'furniture', entry } : null;
    }
    const prop = this.pickIn(this.props);
    if (prop) return { kind: 'prop', entry: prop };
    const hit = this.raycaster.intersectObjects(this.buildingsGroup.children, true)[0];
    if (hit) {
      let o: THREE.Object3D | null = hit.object;
      while (o && o.userData.buildingId === undefined) o = o.parent;
      const id = o?.userData.buildingId as string | undefined;
      const building = st.project.buildings.find((b) => b.id === id);
      if (building) return { kind: 'building', building };
    }
    return null;
  }

  /** Where an item lands: against a wall when one is near (building scope), else on the grid. */
  private placement(p: Vec2, catalogId: string, rotation: number, item?: Pick<FurnitureItem, 'size'>): { pos: Vec2; rotation: number } {
    const st = useStore.getState();
    const def = getFurniture(catalogId);
    const snapOn = st.view.snap;
    if (st.scope === 'building' && def && snapOn && !def.walkable && !def.stair && def.mount !== 'ceiling') {
      const s = snapFurnitureToWall(p, itemSize(def, item), this.level().walls, def.mount === 'wall' ? 1.0 : 0.22);
      if (s) return s;
    }
    const step = snapOn ? 0.05 : 0.01;
    return { pos: { x: snapTo(p.x, step), y: snapTo(p.y, step) }, rotation };
  }

  /** Pointer position in the coordinates items are stored in (building-local or site). */
  private editPoint(y: number): Vec2 | null {
    const st = useStore.getState();
    const p = this.floorPoint(y);
    if (!p) return null;
    return st.scope === 'building' ? toLocal(currentBuilding(st.project), p) : p;
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (this.mode !== 'view3d' || e.button !== 0) return;
    this.pointer = { downX: e.clientX, downY: e.clientY, moved: false, down: true };
    const st = useStore.getState();
    if (st.tool.type !== 'select') return;
    this.setRay(e);
    const picked = this.pick();
    if (!picked) return;
    if (picked.kind === 'building') {
      st.select({ kind: 'building', id: picked.building.id });
      const p = this.floorPoint(0);
      if (p) {
        this.drag = { kind: 'building', id: picked.building.id, offset: { x: p.x - picked.building.x, y: p.y - picked.building.y }, y: 0, started: false };
      }
    } else {
      const item = picked.entry.item;
      st.select({ kind: picked.kind, id: item.id });
      const y = (picked.kind === 'furniture' ? this.activeElevation() : 0) + item.elevation;
      const p = this.editPoint(y);
      if (p) this.drag = { kind: picked.kind, id: item.id, offset: { x: p.x - item.x, y: p.y - item.y }, y, started: false };
    }
    if (this.drag) {
      this.controls.enabled = false;
      this.renderer.domElement.setPointerCapture(e.pointerId);
    }
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (this.mode !== 'view3d') return;
    if (this.pointer.down && Math.hypot(e.clientX - this.pointer.downX, e.clientY - this.pointer.downY) > 4) this.pointer.moved = true;
    this.setRay(e);
    const st = useStore.getState();
    const drag = this.drag;
    if (drag && this.pointer.moved) {
      if (!drag.started) {
        drag.started = true;
        st.checkpoint();
      }
      if (drag.kind === 'building') {
        const p = this.floorPoint(0);
        if (p) updateBuilding(drag.id, { x: snapTo(p.x - drag.offset.x, 0.5), y: snapTo(p.y - drag.offset.y, 0.5) }, true);
        return;
      }
      const p = this.editPoint(drag.y);
      const entry = (drag.kind === 'furniture' ? this.activeItems() : this.props)?.entries.get(drag.id);
      if (!p || !entry) return;
      const placed = this.placement({ x: p.x - drag.offset.x, y: p.y - drag.offset.y }, entry.item.catalogId, entry.item.rotation, entry.item);
      const patch = { x: placed.pos.x, y: placed.pos.y, rotation: placed.rotation };
      if (drag.kind === 'furniture') updateFurniture(drag.id, patch, true);
      else updateProp(drag.id, patch, true);
      return;
    }
    if (this.ghost) {
      const def = getFurniture(this.ghost.catalogId);
      const baseY = st.scope === 'building' ? this.activeElevation() : 0;
      const p = this.editPoint(baseY);
      if (p) {
        const placed = this.placement(p, this.ghost.catalogId, this.ghostRotation);
        const b = st.scope === 'building' ? currentBuilding(st.project) : { x: 0, y: 0, rotation: 0 };
        const w = toSite(b, placed.pos);
        this.ghost.holder.visible = true;
        this.ghost.holder.position.set(w.x, baseY + (def?.mount === 'wall' ? (def.elevation ?? 1.2) : 0), w.y);
        this.ghost.holder.rotation.y = -(placed.rotation + b.rotation);
        this.ghost.holder.userData.placed = placed;
      }
    }
    const tool = st.tool;
    this.renderer.domElement.style.cursor =
      tool.type === 'select' ? (this.pick() ? 'move' : 'grab') : tool.type === 'erase' ? 'not-allowed' : 'crosshair';
  };

  private onPointerLeave = (): void => {
    if (this.ghost) this.ghost.holder.visible = false;
  };

  private onDblClick = (e: MouseEvent): void => {
    if (this.mode !== 'view3d' || useStore.getState().scope !== 'site') return;
    this.setRay(e);
    const picked = this.pick();
    if (picked?.kind === 'building') {
      useStore.getState().editBuilding(picked.building.id);
      useStore.getState().setMode('view3d');
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (this.mode !== 'view3d') return;
    const wasDrag = this.drag;
    this.drag = null;
    this.controls.enabled = true;
    const clicked = this.pointer.down && !this.pointer.moved;
    this.pointer.down = false;
    if (!clicked || e.button !== 0) return;
    const st = useStore.getState();
    const tool = st.tool;
    this.setRay(e);
    if (tool.type === 'select') {
      if (wasDrag) return;
      if (st.scope === 'building') {
        const p = this.editPoint(this.activeElevation());
        const room = p && roomAt(getGraph(this.level().walls), p);
        st.select(room ? { kind: 'room', point: { ...room.labelPoint } } : null);
      } else st.select(null);
    } else if (tool.type === 'furniture' && this.ghost?.holder.visible) {
      const placed = this.ghost.holder.userData.placed as { pos: Vec2; rotation: number };
      const inBuilding = st.scope === 'building';
      const id = inBuilding ? addFurniture(tool.catalogId, placed.pos, placed.rotation) : addProp(tool.catalogId, placed.pos, placed.rotation);
      st.setTool({ type: 'select' });
      if (id) st.select({ kind: inBuilding ? 'furniture' : 'prop', id });
    } else if (tool.type === 'paint' && st.scope === 'building') {
      const b = currentBuilding(st.project);
      const bv = this.buildings.get(b.id);
      const hit = bv ? this.raycaster.intersectObject(bv.group, true)[0] : undefined;
      if (!hit) return;
      const n = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : new THREE.Vector3(0, 1, 0);
      const p = toLocal(b, { x: hit.point.x + n.x * 0.08, y: hit.point.z + n.z * 0.08 });
      const room = roomAt(getGraph(this.level().walls), p);
      if (tool.target === 'exterior') setExterior(tool.finish);
      else if (room) setRoomStyle(p, tool.target === 'floor' ? { floor: tool.finish } : { wall: tool.finish });
      else if (tool.target === 'wall' && Math.abs(n.y) < 0.5) setExterior(tool.finish);
    } else if (tool.type === 'erase') {
      const picked = this.pick();
      if (picked && picked.kind !== 'building') deleteSelection({ kind: picked.kind, id: picked.entry.item.id });
    }
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (this.mode !== 'view3d') return;
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.code === 'KeyR') {
      const step = e.shiftKey ? Math.PI / 12 : Math.PI / 2;
      const st = useStore.getState();
      const sel = st.selection;
      if (this.ghost) {
        this.ghostRotation += step;
        if (this.ghost.holder.userData.placed) this.ghost.holder.rotation.y -= step;
      } else if (sel?.kind === 'furniture') {
        const entry = this.activeItems()?.entries.get(sel.id);
        if (entry) updateFurniture(sel.id, { rotation: entry.item.rotation + step });
      } else if (sel?.kind === 'prop') {
        const entry = this.props.entries.get(sel.id);
        if (entry) updateProp(sel.id, { rotation: entry.item.rotation + step });
      } else if (sel?.kind === 'building') {
        const b = st.project.buildings.find((x) => x.id === sel.id);
        if (b) updateBuilding(b.id, { rotation: b.rotation + step });
      }
    } else if (e.key === 'Escape') {
      useStore.getState().setTool({ type: 'select' });
    }
  };
}

/** a dome of stars, visible at night */
function makeStars(): THREE.Points {
  const n = 1400;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = Math.random();
    const v = Math.random() * 0.9 + 0.08;
    const th = u * Math.PI * 2;
    const ph = Math.acos(1 - v);
    const r = 400;
    pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
    pos[i * 3 + 1] = r * Math.cos(ph);
    pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ color: '#ffffff', size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.9, depthWrite: false });
  const p = new THREE.Points(g, m);
  p.visible = false;
  p.renderOrder = -1;
  return p;
}
