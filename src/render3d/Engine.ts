import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { N8AOPass } from 'n8ao';
import { getFurniture, resolveColors } from '../catalog';
import { finishes } from '../materials/finishes';
import { setMaxAnisotropy } from '../materials/textureGen';
import { snapTo } from '../model/geom';
import { getGraph, roomAt } from '../model/graph';
import type { FurnitureItem, Level, Vec2 } from '../model/types';
import {
  addFurniture,
  deleteSelection,
  setExterior,
  setRoomStyle,
  snapFurnitureToWall,
  updateFurniture,
} from '../store/actions';
import { currentBuilding, currentLevel, useStore, type Mode } from '../store/store';
import { buildArchitecture, disposeArchitecture, type Architecture } from './buildArchitecture';
import { seatsOf, WalkController, type BoxCollider, type SeatInstance } from './WalkController';

interface FurnitureEntry {
  item: FurnitureItem;
  holder: THREE.Group;
  colorsKey: string;
}

const SUN_DIR = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(44), THREE.MathUtils.degToRad(318));

/** Catalog lamp intensities are tuned for a dark room; by day they only add a gentle warm pool of light. */
const LAMP_SCALE = 0.05;

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

/** Owns the WebGL scene: builds it from the project and handles 3D interaction. */
export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1200);
  private controls: OrbitControls;
  private composer: EffectComposer | null = null;
  private aoPass: N8AOPass | null = null;
  private sun = new THREE.DirectionalLight('#fff1dc', 3.1);
  private ground: THREE.Mesh;
  private groundFinish = '';
  private arch: Architecture | null = null;
  private archKey: unknown[] = [];
  private furnitureGroup = new THREE.Group();
  private furniture = new Map<string, FurnitureEntry>();
  private selectionBox = new THREE.Box3Helper(new THREE.Box3(), new THREE.Color('#ff8a3d'));
  private ghost: { catalogId: string; holder: THREE.Group } | null = null;
  private ghostRotation = 0;
  private walk: WalkController;
  private mode: Mode = 'plan';
  private running = false;
  private raf = 0;
  private clock = new THREE.Timer();
  private dirty = true;
  private unsub: () => void;
  private raycaster = new THREE.Raycaster();
  private pointer = { downX: 0, downY: 0, moved: false, down: false };
  private dragItem: { id: string; offset: Vec2; started: boolean } | null = null;
  private width = 1;
  private height = 1;
  private quality: 'low' | 'high' = 'high';
  private framed = false;

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
    this.scene.fog = new THREE.Fog('#cfdde8', 120, 520);

    // lights
    this.sun.position.copy(SUN_DIR).multiplyScalar(60);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096);
    this.sun.shadow.bias = -0.0003;
    this.sun.shadow.normalBias = 0.03;
    this.sun.shadow.radius = 2.5;
    this.scene.add(this.sun, this.sun.target);
    this.scene.add(new THREE.HemisphereLight('#fff9f0', '#b3a78f', 0.35));

    // ground: a large plane; low-frequency vertex tint hides the texture's repetition at a distance
    const groundGeo = new THREE.PlaneGeometry(600, 600, 150, 150).rotateX(-Math.PI / 2);
    const uv = groundGeo.attributes.uv;
    const gp = groundGeo.attributes.position;
    const tint = new Float32Array(gp.count * 3);
    for (let i = 0; i < gp.count; i++) {
      uv.setXY(i, gp.getX(i), gp.getZ(i));
      const x = gp.getX(i);
      const z = gp.getZ(i);
      const n =
        Math.sin(x * 0.071 + 1.3) * Math.cos(z * 0.083 - 0.4) * 0.5 +
        Math.sin(x * 0.19 + z * 0.13) * 0.3 +
        Math.sin(x * 0.37 - z * 0.41 + 2.0) * 0.2;
      const v = 0.93 + n * 0.11;
      tint[i * 3] = v * (1 + n * 0.035);
      tint[i * 3 + 1] = v;
      tint[i * 3 + 2] = v * (1 - n * 0.05);
    }
    groundGeo.setAttribute('color', new THREE.BufferAttribute(tint, 3));
    this.ground = new THREE.Mesh(groundGeo);
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    this.scene.add(this.furnitureGroup);
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
    this.controls.maxDistance = 120;
    this.controls.target.set(6, 0.5, 4.5);

    this.walk = new WalkController(this.camera, renderer.domElement);
    this.walk.onHint = (hint) => useStore.getState().setHint(hint);
    this.walk.onToggleFirstPerson = () => {
      const st = useStore.getState();
      st.setView({ firstPerson: !st.view.firstPerson });
    };
    this.walk.character.root.visible = false;
    this.scene.add(this.walk.character.root);

    const el = renderer.domElement;
    el.addEventListener('pointerdown', this.onPointerDown);
    el.addEventListener('pointermove', this.onPointerMove);
    el.addEventListener('pointerup', this.onPointerUp);
    el.addEventListener('pointerleave', this.onPointerLeave);
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
    const el = this.renderer.domElement;
    el.removeEventListener('pointerdown', this.onPointerDown);
    el.removeEventListener('pointermove', this.onPointerMove);
    el.removeEventListener('pointerup', this.onPointerUp);
    el.removeEventListener('pointerleave', this.onPointerLeave);
    window.removeEventListener('keydown', this.onKeyDown);
    this.controls.dispose();
    if (this.arch) disposeArchitecture(this.arch);
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
    if (this.dirty) {
      this.dirty = false;
      this.sync();
    }
    if (this.mode === 'walk') this.walk.update(dt);
    else this.controls.update();
    this.updateSun();
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  /** Keep the shadow frustum centred on what the camera looks at. */
  private updateSun(): void {
    const focus = this.mode === 'walk' ? this.walk.character.root.position : this.controls.target;
    const range = this.mode === 'walk' ? 22 : Math.max(22, Math.min(70, this.camera.position.distanceTo(this.controls.target) * 0.9));
    const cam = this.sun.shadow.camera;
    if (cam.right !== range) {
      cam.left = -range;
      cam.right = range;
      cam.top = range;
      cam.bottom = -range;
      cam.near = 1;
      cam.far = 220;
      cam.updateProjectionMatrix();
    }
    this.sun.target.position.set(focus.x, 0, focus.z);
    this.sun.position.copy(this.sun.target.position).addScaledVector(SUN_DIR, 90);
  }

  // ---- scene sync ----------------------------------------------------------------------------

  private level(): Level {
    const st = useStore.getState();
    return currentLevel(st.project, st.levelIndex);
  }

  private sync(): void {
    const st = useStore.getState();
    const { project, view } = st;
    const building = currentBuilding(project);
    const lvl = this.level();

    if (view.quality !== this.quality) this.applyQuality(view.quality);
    if (st.mode !== this.mode) this.setMode(st.mode);

    if (project.site.ground !== this.groundFinish) {
      this.groundFinish = project.site.ground;
      const mat = finishes.material(this.groundFinish).clone();
      mat.vertexColors = true;
      (this.ground.material as THREE.Material | undefined)?.dispose?.();
      this.ground.material = mat;
    }

    const walking = this.mode === 'walk';
    const key = [
      lvl.walls,
      lvl.openings,
      lvl.roomStyles,
      lvl.height,
      building.exterior,
      building.defaultFloor,
      building.defaultWall,
      building.roof,
      walking ? false : view.wallsLow,
      walking || view.showRoof,
      walking,
    ];
    if (key.some((v, i) => v !== this.archKey[i])) {
      this.archKey = key;
      if (this.arch) {
        this.scene.remove(this.arch.group);
        disposeArchitecture(this.arch);
      }
      this.arch = buildArchitecture(lvl, building, {
        wallsLow: walking ? false : view.wallsLow,
        ceilings: walking,
        roof: walking || view.showRoof,
      });
      this.scene.add(this.arch.group);
      this.refreshWalkWorld();
    }

    this.syncFurniture(lvl);
    this.syncSelection();
    this.syncGhost();
    this.walk.firstPerson = view.firstPerson;

    if (!this.framed && lvl.walls.length) {
      this.framed = true;
      this.frameAll();
    }
  }

  private makeHolder(item: Pick<FurnitureItem, 'catalogId' | 'colors'>, lvl: Level): THREE.Group | null {
    const def = getFurniture(item.catalogId);
    if (!def) return null;
    const holder = new THREE.Group();
    let obj: THREE.Object3D;
    try {
      obj = def.build({ colors: resolveColors(def, item.colors) });
    } catch (err) {
      console.warn('failed to build', item.catalogId, err);
      obj = new THREE.Mesh(new THREE.BoxGeometry(def.size.w, def.size.h, def.size.d), new THREE.MeshStandardMaterial({ color: '#bbb' }));
      obj.position.y = def.size.h / 2;
    }
    if (def.mount === 'ceiling') obj.position.y += lvl.height - 2.7;
    holder.add(obj);
    if (def.light) {
      const l = new THREE.PointLight(def.light.color, def.light.intensity * LAMP_SCALE, def.light.distance, 2);
      l.position.set(def.light.x, def.light.y + (def.mount === 'ceiling' ? lvl.height - 2.7 : 0), def.light.z);
      holder.add(l);
    }
    return holder;
  }

  private syncFurniture(lvl: Level): void {
    const seen = new Set<string>();
    let changed = false;
    for (const item of lvl.furniture) {
      seen.add(item.id);
      let entry = this.furniture.get(item.id);
      const colorsKey = `${item.catalogId}|${JSON.stringify(item.colors ?? {})}|${lvl.height}`;
      if (entry && entry.item === item) continue;
      changed = true;
      if (!entry || entry.colorsKey !== colorsKey) {
        if (entry) this.furnitureGroup.remove(entry.holder);
        const holder = this.makeHolder(item, lvl);
        if (!holder) continue;
        holder.userData.itemId = item.id;
        this.furnitureGroup.add(holder);
        entry = { item, holder, colorsKey };
        this.furniture.set(item.id, entry);
      }
      entry.item = item;
      entry.holder.position.set(item.x, item.elevation, item.y);
      entry.holder.rotation.y = -item.rotation;
    }
    // ceiling fixtures would float in mid-air when the walls are cut low
    const hideCeiling = this.mode !== 'walk' && useStore.getState().view.wallsLow;
    for (const entry of this.furniture.values()) {
      if (getFurniture(entry.item.catalogId)?.mount === 'ceiling') entry.holder.visible = !hideCeiling;
    }
    for (const [id, entry] of this.furniture) {
      if (!seen.has(id)) {
        this.furnitureGroup.remove(entry.holder);
        this.furniture.delete(id);
        changed = true;
      }
    }
    if (changed) this.refreshWalkWorld();
  }

  private refreshWalkWorld(): void {
    const boxes: BoxCollider[] = [];
    const seats: SeatInstance[] = [];
    for (const { item } of this.furniture.values()) {
      const def = getFurniture(item.catalogId);
      if (!def) continue;
      seats.push(...seatsOf(def, item.x, item.y, item.rotation, item.elevation));
      if (def.walkable || def.mount === 'ceiling' || def.mount === 'wall') continue;
      boxes.push({ x: item.x, y: item.y, hw: def.size.w / 2, hd: def.size.d / 2, rotation: item.rotation });
    }
    this.walk.world = {
      walls: this.arch?.colliders ?? [],
      boxes,
      seats,
      doors: this.arch?.doors ?? [],
      occluders: this.arch ? [this.arch.group] : [],
    };
  }

  private syncSelection(): void {
    const sel = useStore.getState().selection;
    const entry = sel?.kind === 'furniture' && this.mode !== 'walk' ? this.furniture.get(sel.id) : undefined;
    if (entry) {
      this.selectionBox.box.setFromObject(entry.holder);
      this.selectionBox.box.expandByScalar(0.02);
      this.selectionBox.visible = true;
    } else {
      this.selectionBox.visible = false;
    }
  }

  private syncGhost(): void {
    const tool = useStore.getState().tool;
    const want = tool.type === 'furniture' && this.mode === 'view3d' ? tool.catalogId : null;
    if (this.ghost && this.ghost.catalogId !== want) {
      this.scene.remove(this.ghost.holder);
      this.ghost = null;
    }
    if (want && !this.ghost) {
      const holder = this.makeHolder({ catalogId: want }, this.level());
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
    const lvl = this.level();
    const box = new THREE.Box3();
    for (const w of lvl.walls) {
      box.expandByPoint(new THREE.Vector3(w.a.x, 0, w.a.y));
      box.expandByPoint(new THREE.Vector3(w.b.x, lvl.height, w.b.y));
    }
    if (box.isEmpty()) box.set(new THREE.Vector3(-5, 0, -5), new THREE.Vector3(5, 3, 5));
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const radius = Math.hypot(size.x, size.z) * 0.5 + 1.5;
    const fit = Math.min(1, this.camera.aspect);
    const dist = (radius / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2)) / fit) * 0.86;
    this.controls.target.set(center.x, 0.6, center.z);
    this.camera.position.set(center.x + dist * 0.4, dist * 0.62, center.z + dist * 0.68);
    this.controls.update();
  }

  private setMode(mode: Mode): void {
    const prev = this.mode;
    this.mode = mode;
    if (mode === 'walk') {
      this.controls.enabled = false;
      this.walk.character.root.visible = true;
      this.walk.enable();
      // spawn in the largest room (or at the origin)
      const graph = getGraph(this.level().walls);
      const room = graph.rooms.slice().sort((a, b) => b.area - a.area)[0];
      const selected = useStore.getState().selection;
      const start = selected?.kind === 'room' ? selected.point : (room?.labelPoint ?? { x: 0, y: 0 });
      this.refreshWalkWorld();
      this.walk.teleport(start, Math.PI * 0.25);
      this.camera.fov = 62;
      this.camera.updateProjectionMatrix();
    } else {
      if (prev === 'walk') {
        this.walk.disable();
        this.walk.character.root.visible = false;
        useStore.getState().setHint('');
        this.camera.fov = 50;
        this.camera.updateProjectionMatrix();
        this.frameAll();
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

  private floorPoint(y = 0): Vec2 | null {
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -y);
    const hit = this.raycaster.ray.intersectPlane(plane, new THREE.Vector3());
    return hit ? { x: hit.x, y: hit.z } : null;
  }

  private pickFurniture(): FurnitureEntry | null {
    const hits = this.raycaster.intersectObjects(this.furnitureGroup.children, true);
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      while (o && o.userData.itemId === undefined) o = o.parent;
      if (o) return this.furniture.get(o.userData.itemId as string) ?? null;
    }
    return null;
  }

  private placement(p: Vec2, catalogId: string, rotation: number): { pos: Vec2; rotation: number } {
    const def = getFurniture(catalogId);
    const snapOn = useStore.getState().view.snap;
    if (def && snapOn && !def.walkable && def.mount !== 'ceiling') {
      const s = snapFurnitureToWall(p, def.size, this.level().walls, def.mount === 'wall' ? 1.0 : 0.22);
      if (s) return s;
    }
    const step = snapOn ? 0.05 : 0.01;
    return { pos: { x: snapTo(p.x, step), y: snapTo(p.y, step) }, rotation };
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (this.mode !== 'view3d' || e.button !== 0) return;
    this.pointer = { downX: e.clientX, downY: e.clientY, moved: false, down: true };
    const tool = useStore.getState().tool;
    if (tool.type !== 'select') return;
    this.setRay(e);
    const entry = this.pickFurniture();
    if (entry) {
      useStore.getState().select({ kind: 'furniture', id: entry.item.id });
      const p = this.floorPoint(entry.item.elevation);
      if (p) {
        this.dragItem = { id: entry.item.id, offset: { x: p.x - entry.item.x, y: p.y - entry.item.y }, started: false };
        this.controls.enabled = false;
        this.renderer.domElement.setPointerCapture(e.pointerId);
      }
    }
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (this.mode !== 'view3d') return;
    if (this.pointer.down && Math.hypot(e.clientX - this.pointer.downX, e.clientY - this.pointer.downY) > 4) this.pointer.moved = true;
    this.setRay(e);
    if (this.dragItem && this.pointer.moved) {
      const entry = this.furniture.get(this.dragItem.id);
      if (!entry) return;
      const p = this.floorPoint(entry.item.elevation);
      if (!p) return;
      if (!this.dragItem.started) {
        this.dragItem.started = true;
        useStore.getState().checkpoint();
      }
      const placed = this.placement({ x: p.x - this.dragItem.offset.x, y: p.y - this.dragItem.offset.y }, entry.item.catalogId, entry.item.rotation);
      updateFurniture(entry.item.id, { x: placed.pos.x, y: placed.pos.y, rotation: placed.rotation }, true);
      return;
    }
    if (this.ghost) {
      const p = this.floorPoint(0);
      if (p) {
        const placed = this.placement(p, this.ghost.catalogId, this.ghostRotation);
        const def = getFurniture(this.ghost.catalogId);
        this.ghost.holder.visible = true;
        this.ghost.holder.position.set(placed.pos.x, def?.mount === 'wall' ? (def.elevation ?? 1.2) : 0, placed.pos.y);
        this.ghost.holder.rotation.y = -placed.rotation;
        this.ghost.holder.userData.placed = placed;
      }
    }
    const tool = useStore.getState().tool;
    this.renderer.domElement.style.cursor =
      tool.type === 'select' ? (this.pickFurniture() ? 'move' : 'grab') : tool.type === 'erase' ? 'not-allowed' : 'crosshair';
  };

  private onPointerLeave = (): void => {
    if (this.ghost) this.ghost.holder.visible = false;
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (this.mode !== 'view3d') return;
    const wasDrag = this.dragItem;
    this.dragItem = null;
    this.controls.enabled = true;
    const clicked = this.pointer.down && !this.pointer.moved;
    this.pointer.down = false;
    if (!clicked || e.button !== 0) return;
    const st = useStore.getState();
    const tool = st.tool;
    this.setRay(e);
    if (tool.type === 'select') {
      if (wasDrag) return;
      const p = this.floorPoint(0);
      const room = p && roomAt(getGraph(this.level().walls), p);
      st.select(room ? { kind: 'room', point: { ...room.labelPoint } } : null);
    } else if (tool.type === 'furniture' && this.ghost?.holder.visible) {
      const placed = this.ghost.holder.userData.placed as { pos: Vec2; rotation: number };
      const id = addFurniture(tool.catalogId, placed.pos, placed.rotation);
      st.setTool({ type: 'select' });
      if (id) st.select({ kind: 'furniture', id });
    } else if (tool.type === 'paint' && this.arch) {
      const hit = this.raycaster.intersectObject(this.arch.group, true)[0];
      if (!hit) {
        return;
      }
      const n = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : new THREE.Vector3(0, 1, 0);
      const p = { x: hit.point.x + n.x * 0.08, y: hit.point.z + n.z * 0.08 };
      const room = roomAt(getGraph(this.level().walls), p);
      if (tool.target === 'exterior') setExterior(tool.finish);
      else if (room) setRoomStyle(p, tool.target === 'floor' ? { floor: tool.finish } : { wall: tool.finish });
      else if (tool.target === 'wall' && Math.abs(n.y) < 0.5) setExterior(tool.finish);
    } else if (tool.type === 'erase') {
      const entry = this.pickFurniture();
      if (entry) deleteSelection({ kind: 'furniture', id: entry.item.id });
    }
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (this.mode !== 'view3d') return;
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.code === 'KeyR') {
      const step = e.shiftKey ? Math.PI / 12 : Math.PI / 2;
      const st = useStore.getState();
      if (this.ghost) {
        this.ghostRotation += step;
        const placed = this.ghost.holder.userData.placed as { pos: Vec2; rotation: number } | undefined;
        if (placed) this.ghost.holder.rotation.y -= step;
      } else if (st.selection?.kind === 'furniture') {
        const entry = this.furniture.get(st.selection.id);
        if (entry) updateFurniture(entry.item.id, { rotation: entry.item.rotation + step });
      }
    } else if (e.key === 'Escape') {
      useStore.getState().setTool({ type: 'select' });
    }
  };
}
