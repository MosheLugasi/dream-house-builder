import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { N8AOPass } from 'n8ao';
import { getFurniture } from '../catalog';
import { finishes } from '../materials/finishes';
import { setMaxAnisotropy } from '../materials/textureGen';
import { snapTo } from '../model/geom';
import { getGraph, roomAt } from '../model/graph';
import { stairBarriers } from '../model/stairs';
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
import { BuildingView } from './BuildingView';
import { buildSite, groundHeight, roadSet } from './buildSite';
import { ItemLayer, makeItemHolder, type ItemEntry } from './ItemLayer';
import { emptyWorld, seatsOf, WalkController, type WalkWorld } from './WalkController';
import { Interactions } from './Interactions';
import { itemEvents, setLampScale } from './ItemLayer';
import { sound } from '../audio/sound';
import { useWalk } from '../store/walk';
import { loadLook } from './look';
import type { Activity, CharacterLook } from './Character';

export type TimeOfDay = 'day' | 'sunset' | 'night';

interface Lighting {
  elev: number;
  azim: number;
  sun: string;
  sunI: number;
  hemiSky: string;
  hemiGround: string;
  hemiI: number;
  env: number;
  exposure: number;
  lamps: number;
  fog: string;
  turbidity: number;
  rayleigh: number;
  skyElev: number;
  stars: number;
}

const LIGHTING: Record<TimeOfDay, Lighting> = {
  day: { elev: 44, azim: 318, sun: '#fff1dc', sunI: 3.1, hemiSky: '#fff9f0', hemiGround: '#b3a78f', hemiI: 0.35, env: 0.75, exposure: 0.82, lamps: 0.05, fog: '#cfdde8', turbidity: 3, rayleigh: 0.9, skyElev: 44, stars: 0 },
  sunset: { elev: 7, azim: 285, sun: '#ffab66', sunI: 2.2, hemiSky: '#ffd6b8', hemiGround: '#8a6f5c', hemiI: 0.25, env: 0.38, exposure: 0.92, lamps: 0.15, fog: '#e7b99a', turbidity: 9, rayleigh: 2.6, skyElev: 3, stars: 0 },
  night: { elev: 38, azim: 200, sun: '#9db2ff', sunI: 0.3, hemiSky: '#3a4a7a', hemiGround: '#1a1a22', hemiI: 0.1, env: 0.04, exposure: 0.9, lamps: 0.22, fog: '#070b18', turbidity: 1, rayleigh: 0.3, skyElev: -12, stars: 1 },
};

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



const SUN_DIR = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(44), THREE.MathUtils.degToRad(318));

/** Soft, mostly neutral sky gradient used for image-based lighting (the visible sky is the Sky shader). */
function makeEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const scene = new THREE.Scene();
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(50, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: { sunDir: { value: SUN_DIR.clone() } },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        varying vec3 vDir; uniform vec3 sunDir;
        void main(){
          vec3 d = normalize(vDir);
          vec3 zenith = vec3(0.60, 0.68, 0.84);
          vec3 horizon = vec3(0.96, 0.95, 0.93);
          vec3 ground = vec3(0.50, 0.47, 0.41);
          vec3 col = d.y > 0.0 ? mix(horizon, zenith, pow(d.y, 0.55)) : mix(horizon * 0.75, ground, pow(-d.y, 0.35));
          float s = max(dot(d, sunDir), 0.0);
          col += vec3(1.0, 0.9, 0.74) * (pow(s, 90.0) * 5.0 + pow(s, 6.0) * 0.3);
          gl_FragColor = vec4(col, 1.0);
        }`,
    }),
  );
  scene.add(dome);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(scene, 0, 0.1, 200).texture;
  pmrem.dispose();
  dome.geometry.dispose();
  return tex;
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
  private composer: EffectComposer | null = null;
  private aoPass: N8AOPass | null = null;
  private sun = new THREE.DirectionalLight('#fff1dc', 3.1);
  private hemi = new THREE.HemisphereLight('#fff9f0', '#b3a78f', 0.35);
  private sky!: Sky;
  private stars: THREE.Points;
  private sunDir = SUN_DIR.clone();
  private tod: TimeOfDay = 'day';
  readonly interactions: Interactions;
  private photoPending = false;
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
  private quality: 'low' | 'high' = 'high';
  private framedKey = '';
  private walkProject: unknown = null;
  private nearBuildings = new Set<string>();
  private nearTimer = 0;
  private pendingSpawn: { start: Vec2; y: number } | null = null;

  constructor(private host: HTMLElement) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer = renderer;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.82;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    host.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.touchAction = 'none';
    setMaxAnisotropy(renderer.capabilities.getMaxAnisotropy());

    // sky + image based lighting
    const sky = new Sky();
    this.sky = sky;
    sky.scale.setScalar(1000);
    const u = sky.material.uniforms;
    u.turbidity.value = 3;
    u.rayleigh.value = 0.9;
    u.mieCoefficient.value = 0.004;
    u.mieDirectionalG.value = 0.85;
    u.sunPosition.value.copy(SUN_DIR);
    this.scene.add(sky);
    this.scene.environment = makeEnvironment(renderer);
    this.scene.environmentIntensity = 0.75;
    this.scene.fog = new THREE.Fog('#cfdde8', 160, 620);

    // lights
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096);
    this.sun.shadow.bias = -0.0003;
    this.sun.shadow.normalBias = 0.03;
    this.sun.shadow.radius = 2.5;
    this.scene.add(this.sun, this.sun.target);
    this.scene.add(this.hemi);
    this.stars = makeStars();
    this.scene.add(this.stars);

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
    this.walk.character.root.visible = false;
    this.walk.character.setLook(loadLook());
    this.scene.add(this.walk.character.root);
    this.walk.onShortcut = (code) => this.shortcut(code);
    this.interactions = new Interactions(this.scene);
    this.interactions.onSleep = () => {
      const st = useStore.getState();
      const next: TimeOfDay = st.view.timeOfDay === 'night' ? 'day' : 'night';
      st.setView({ timeOfDay: next });
      useWalk.getState().toast(next === 'day' ? '☀️ בוקר טוב!' : '🌙 לילה טוב…');
    };
    // every placed item (in any building, level or out on the street) registers its behaviours
    itemEvents.current = {
      add: (entry) => {
        const def = getFurniture(entry.item.catalogId);
        if (def) this.interactions.register(entry.item, def, entry.holder, (entry.holder.userData.body as THREE.Object3D) ?? entry.holder, (entry.holder.userData.light as THREE.PointLight | undefined) ?? null);
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
    this.composer?.dispose();
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
    this.composer?.setSize(width, height);
    this.aoPass?.setSize(width, height);
    this.interactions.particles.setViewport(height * this.renderer.getPixelRatio(), this.camera.fov);
  }

  private applyQuality(q: 'low' | 'high'): void {
    this.quality = q;
    const ratio = q === 'high' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
    this.renderer.setPixelRatio(ratio);
    this.sun.shadow.mapSize.setScalar(q === 'high' ? 4096 : 2048);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
    this.composer?.dispose();
    this.composer = null;
    this.aoPass = null;
    if (q === 'high') {
      try {
        const composer = new EffectComposer(this.renderer);
        const ao = new N8AOPass(this.scene, this.camera, this.width, this.height);
        ao.configuration.aoRadius = 1.1;
        ao.configuration.distanceFalloff = 1.0;
        ao.configuration.intensity = 2.6;
        ao.configuration.color = new THREE.Color(0, 0, 0);
        ao.configuration.halfRes = false;
        ao.configuration.gammaCorrection = false;
        ao.setQualityMode('Medium');
        composer.addPass(ao);
        composer.addPass(new OutputPass());
        composer.addPass(new SMAAPass());
        composer.setPixelRatio(ratio);
        composer.setSize(this.width, this.height);
        this.composer = composer;
        this.aoPass = ao;
      } catch (err) {
        console.warn('post-processing unavailable, falling back to direct rendering', err);
        this.composer = null;
      }
    }
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
    }
    if (this.mode === 'walk') this.walk.update(dt);
    else this.controls.update();
    // a far-away overview needs a farther near plane to keep roads and floors from z-fighting
    const near = this.mode === 'walk' ? 0.1 : Math.max(0.1, Math.min(3, this.camera.position.distanceTo(this.controls.target) / 150));
    if (Math.abs(near - this.camera.near) > this.camera.near * 0.2) {
      this.camera.near = near;
      this.camera.updateProjectionMatrix();
    }
    this.interactions.update(dt, this.mode === 'walk' ? this.walk.character.root.position : null);
    this.updateSun();
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
    if (this.photoPending) {
      this.photoPending = false;
      this.savePhoto();
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
    useWalk.getState().set({ flash: Date.now() });
  }

  private savePhoto(): void {
    try {
      const url = this.renderer.domElement.toDataURL('image/png');
      const a = document.createElement('a');
      const d = new Date();
      a.download = `בית-החלומות-${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}-${d.getHours()}${d.getMinutes()}${d.getSeconds()}.png`;
      a.href = url;
      a.click();
      useWalk.getState().toast('📸 התמונה נשמרה');
    } catch (err) {
      console.warn('photo failed', err);
    }
  }

  setLook(look: CharacterLook): void {
    this.walk.character.setLook(look);
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
        st.setView({ timeOfDay: order[(order.indexOf(st.view.timeOfDay) + 1) % order.length] });
        return true;
      }
      case 'KeyM': {
        const m = !sound.isMuted();
        sound.setMuted(m);
        useWalk.getState().set({ muted: m });
        return true;
      }
    }
    return false;
  }

  private applyTimeOfDay(tod: TimeOfDay): void {
    const prev = this.tod;
    this.tod = tod;
    const L = LIGHTING[tod];
    this.sunDir.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - L.elev), THREE.MathUtils.degToRad(L.azim));
    this.sun.color.set(L.sun);
    this.sun.intensity = L.sunI;
    this.hemi.color.set(L.hemiSky);
    this.hemi.groundColor.set(L.hemiGround);
    this.hemi.intensity = L.hemiI;
    this.scene.environmentIntensity = L.env;
    this.renderer.toneMappingExposure = L.exposure;
    (this.scene.fog as THREE.Fog).color.set(L.fog);
    const u = this.sky.material.uniforms;
    u.turbidity.value = L.turbidity;
    u.rayleigh.value = L.rayleigh;
    u.sunPosition.value.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - L.skyElev), THREE.MathUtils.degToRad(L.azim));
    this.stars.visible = L.stars > 0;
    setLampScale(L.lamps);
    this.interactions.setLampScale(L.lamps);
    if (tod === 'night' && prev !== 'night') this.interactions.allLights(true);
  }



  /** Keep the shadow frustum centred on what the camera looks at. */
  private updateSun(): void {
    const focus = this.mode === 'walk' ? this.walk.character.root.position : this.controls.target;
    const range = this.mode === 'walk' ? 26 : Math.max(22, Math.min(170, this.camera.position.distanceTo(this.controls.target) * 0.9));
    const cam = this.sun.shadow.camera;
    if (cam.right !== range) {
      cam.left = -range;
      cam.right = range;
      cam.top = range;
      cam.bottom = -range;
      cam.near = 1;
      cam.far = 420;
      cam.updateProjectionMatrix();
    }
    this.sun.target.position.set(focus.x, 0, focus.z);
    this.sun.position.copy(this.sun.target.position).addScaledVector(this.sunDir, 200);
  }

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
    if (view.timeOfDay !== this.tod) this.applyTimeOfDay(view.timeOfDay);
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

    if (modeChanged) this.applyMode();
    if (walking && (changed || modeChanged || project !== this.walkProject)) {
      this.walkProject = project;
      this.walk.world = this.buildWalkWorld();
      this.interactions.setWorld(this.walk.world);
      if (this.pendingSpawn) {
        const { start, y } = this.pendingSpawn;
        this.pendingSpawn = null;
        this.walk.teleport(start, Math.PI * 0.25, y);
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

  /** Everything the walk controller needs, in site coordinates. */
  private buildWalkWorld(): WalkWorld {
    const { project } = useStore.getState();
    const world = emptyWorld();
    const roads = this.roads;
    world.groundAt = (x, y) => groundHeight(roads, x, y);
    world.occluders = [this.buildingsGroup];

    const addItem = (f: FurnitureItem, origin: Pick<Building, 'x' | 'y' | 'rotation'>, floorY: number, rise: number | null) => {
      const def = getFurniture(f.catalogId);
      if (!def) return;
      const p = toSite(origin, { x: f.x, y: f.y });
      const rot = f.rotation + origin.rotation;
      // swings / rocking things are ridden through their action, not as a plain seat
      const ridden = def.actions?.some((a) => a.kind === 'swing' || a.kind === 'rock');
      if (!ridden) world.seats.push(...seatsOf(def, p.x, p.y, rot, floorY, f.elevation, f.id));
      // pets walk around and balls roll: they are not fixed obstacles
      if (def.actions?.some((a) => a.kind === 'pet' || a.kind === 'ball')) return;
      if (def.stair && rise !== null) {
        world.stairs.push({ x: p.x, y: p.y, rotation: rot, w: def.size.w, d: def.size.d, type: def.stair.type, y0: floorY, y1: floorY + rise });
        const bars = stairBarriers(def.stair.type, def.size.w, def.size.d);
        const c = Math.cos(rot);
        const s = Math.sin(rot);
        const tx = (q: Vec2): Vec2 => ({ x: p.x + q.x * c - q.y * s, y: p.y + q.x * s + q.y * c });
        const y0 = floorY;
        const y1 = floorY + rise + 1;
        for (const [a, b] of bars.solid) world.walls.push({ a: tx(a), b: tx(b), half: 0.05, y0, y1 });
        world.walls.push({ a: tx(bars.entry[0]), b: tx(bars.entry[1]), half: 0.05, y0, y1, openY: floorY });
        world.walls.push({ a: tx(bars.exit[0]), b: tx(bars.exit[1]), half: 0.05, y0, y1, openY: floorY + rise });
        return;
      }
      const foot = collisionFootprint(def);
      if (!foot) return;
      world.boxes.push({
        id: f.id,
        x: p.x,
        y: p.y,
        hw: foot.w / 2,
        hd: foot.d / 2,
        rotation: rot,
        y0: floorY + f.elevation,
        y1: floorY + f.elevation + def.size.h,
      });
    };

    for (const b of project.buildings) {
      const bv = this.buildings.get(b.id);
      const floors: WalkWorld['floors'][number] = { levels: [] };
      b.levels.forEach((lvl, i) => {
        const y = levelElevation(b, i);
        const top = i === b.levels.length - 1;
        const arch = bv?.levels[i]?.arch;
        for (const w of arch?.colliders ?? []) {
          world.walls.push({ a: toSite(b, w.a), b: toSite(b, w.b), half: w.half, y0: y, y1: y + lvl.height + SLAB });
        }
        for (const d of arch?.doors ?? []) world.doors.push({ center: toSite(b, d.center), y, anims: d.anims, open: 0 });
        for (const f of lvl.furniture) addItem(f, b, y, top ? null : lvl.height + SLAB);
        floors.levels.push({ y, rooms: getGraph(lvl.walls).rooms.map((r) => r.polygon.map((p) => toSite(b, p))) });
      });
      world.floors.push(floors);
    }
    const origin = { x: 0, y: 0, rotation: 0 };
    for (const f of project.site.props) {
      addItem(f, origin, 0, null);
      const def = getFurniture(f.catalogId);
      const entry = this.props.entries.get(f.id);
      if (def?.vehicle && entry) world.vehicles.push({ id: f.id, def, holder: entry.holder });
    }
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
    if (this.mode === 'walk') {
      this.controls.enabled = false;
      this.walk.character.root.visible = true;
      this.walk.enable();
      const st = useStore.getState();
      const b = currentBuilding(st.project);
      let start: Vec2;
      let y = 0;
      if (st.scope === 'building') {
        // inside the building being edited: the selected room, or the largest room of the current level
        const graph = getGraph(this.level().walls);
        const room = graph.rooms.slice().sort((p, q) => q.area - p.area)[0];
        const local = st.selection?.kind === 'room' ? st.selection.point : (room?.labelPoint ?? { x: 0, y: 0 });
        start = toSite(b, local);
        y = room ? this.activeElevation() : 0;
      } else {
        // out on the street: on the first road's sidewalk, or in front of the building
        const road = st.project.site.roads[0];
        const lb = this.localBounds(b);
        start = road ? { x: road[0] * ROAD_CELL + 1, y: road[1] * ROAD_CELL + 1 } : toSite(b, { x: (lb.minX + lb.maxX) / 2, y: lb.maxY + 4 });
      }
      this.walk.pos = { ...start };
      this.pendingSpawn = { start, y };
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
  private placement(p: Vec2, catalogId: string, rotation: number): { pos: Vec2; rotation: number } {
    const st = useStore.getState();
    const def = getFurniture(catalogId);
    const snapOn = st.view.snap;
    if (st.scope === 'building' && def && snapOn && !def.walkable && !def.stair && def.mount !== 'ceiling') {
      const s = snapFurnitureToWall(p, def.size, this.level().walls, def.mount === 'wall' ? 1.0 : 0.22);
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
      const placed = this.placement({ x: p.x - drag.offset.x, y: p.y - drag.offset.y }, entry.item.catalogId, entry.item.rotation);
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
