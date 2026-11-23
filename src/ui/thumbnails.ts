import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { getFurniture, resolveColors } from '../catalog';

/**
 * Lazily renders small 3D previews of catalog items with one shared offscreen renderer.
 * Results are cached as data URLs; listeners are notified when a thumbnail becomes ready.
 */
const SIZE = 160;
const cache = new Map<string, string>();
const waiting = new Map<string, Set<(url: string) => void>>();
const queue: string[] = [];
let busy = false;
let ctx: { renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; slot: THREE.Group } | null | undefined;

function init(): typeof ctx {
  if (ctx !== undefined) return ctx;
  try {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(SIZE, SIZE);
    renderer.setPixelRatio(1);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.8;
    const key = new THREE.DirectionalLight('#ffffff', 2.2);
    key.position.set(3, 6, 4);
    scene.add(key);
    const slot = new THREE.Group();
    scene.add(slot);
    ctx = { renderer, scene, camera: new THREE.PerspectiveCamera(28, 1, 0.05, 100), slot };
  } catch {
    ctx = null;
  }
  return ctx;
}

function renderOne(id: string): string | null {
  const c = init();
  const def = getFurniture(id);
  if (!c || !def) return null;
  let obj: THREE.Object3D;
  try {
    obj = def.build({ colors: resolveColors(def) });
  } catch {
    return null;
  }
  c.slot.clear();
  c.slot.add(obj);
  const box = new THREE.Box3().setFromObject(obj);
  const center = box.getCenter(new THREE.Vector3());
  const radius = box.getSize(new THREE.Vector3()).length() / 2 || 0.5;
  const dist = radius / Math.sin(THREE.MathUtils.degToRad(c.camera.fov / 2)) * 1.02;
  const dir = new THREE.Vector3(0.62, 0.52, 0.78).normalize();
  c.camera.position.copy(center).addScaledVector(dir, dist);
  c.camera.lookAt(center);
  c.renderer.render(c.scene, c.camera);
  const url = c.renderer.domElement.toDataURL('image/png');
  c.slot.clear();
  return url;
}

function pump(): void {
  if (busy) return;
  const id = queue.shift();
  if (!id) return;
  busy = true;
  setTimeout(() => {
    const url = renderOne(id);
    busy = false;
    if (url) {
      cache.set(id, url);
      waiting.get(id)?.forEach((fn) => fn(url));
    }
    waiting.delete(id);
    pump();
  }, 0);
}

export function getThumbnail(id: string): string | undefined {
  return cache.get(id);
}

export function requestThumbnail(id: string, onReady: (url: string) => void): () => void {
  const hit = cache.get(id);
  if (hit) {
    onReady(hit);
    return () => {};
  }
  let set = waiting.get(id);
  if (!set) {
    set = new Set();
    waiting.set(id, set);
    queue.push(id);
  }
  set.add(onReady);
  pump();
  return () => set!.delete(onReady);
}
