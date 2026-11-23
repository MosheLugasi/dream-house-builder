/**
 * Preview harness for the finish library.
 *
 *   npx vite --port 5198   ->   http://localhost:5198/tools/materials-preview/index.html
 *
 * Query parameters:
 *   mode=scenes|swatches|tiling   (default scenes; tiling = color map repeated 2x2 to check seams)
 *   view=room|close|top      camera preset for scenes
 *   ids=a,b,c  kind=floor    filter the finishes
 *   w=640&h=440              render size per scene
 *   progressive=1            time the app's default path: instant 256 px version first,
 *                            then the full-resolution upgrade (caption shows both)
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  FINISH_KIND_LABELS,
  finishes,
  flushFinishUpgrades,
  setMaxAnisotropy,
  setProgressiveFinishes,
} from '../../src/materials/finishes';
import type { FinishDef, FinishKind } from '../../src/materials/types';

const params = new URLSearchParams(location.search);
const mode = params.get('mode') ?? 'scenes';
const view = params.get('view') ?? 'room';
const W = Number(params.get('w') ?? 640);
const H = Number(params.get('h') ?? 440);
const progressive = params.get('progressive') === '1';
setProgressiveFinishes(progressive);
const grid = document.getElementById('grid')!;
const status = document.getElementById('status')!;

declare global {
  interface Window {
    __done?: boolean;
    __timings?: Record<string, number>;
  }
}

function selected(): FinishDef[] {
  const ids = params.get('ids');
  const kind = params.get('kind') as FinishKind | null;
  let defs = finishes.list;
  if (ids) defs = ids.split(',').map((id) => finishes.get(id.trim()));
  if (kind) defs = defs.filter((d) => d.kinds.includes(kind));
  return defs;
}

/** plane with UVs in meters */
function patch(w: number, h: number): THREE.PlaneGeometry {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w, uv.getY(i) * h);
  return g;
}

const nextFrame = () => new Promise<void>((r) => setTimeout(r, 0));

async function scenes(): Promise<void> {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  setMaxAnisotropy(renderer.capabilities.getMaxAnisotropy());

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#aab4be');
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.5;

  const top = view === 'top';
  const size = top ? 16 : 4;
  const floor = new THREE.Mesh(patch(size, size));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const wall = new THREE.Mesh(patch(size, 2.7));
  wall.position.set(0, 1.35, -size / 2);
  wall.receiveShadow = true;
  scene.add(wall);

  const propMat = new THREE.MeshStandardMaterial({ color: '#e9e6df', roughness: 0.6 });
  const cube = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.45), propMat);
  cube.position.set(-1.25, 0.225, -1.15);
  cube.rotation.y = 0.5;
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.22, 48, 24), propMat);
  ball.position.set(1.0, 0.22, -0.7);
  for (const m of [cube, ball]) {
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
  }

  const sun = new THREE.DirectionalLight('#fff4e2', 1.9);
  sun.position.set(3.5, 5.5, 4.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -size * 0.75;
  sc.right = size * 0.75;
  sc.top = size * 0.75;
  sc.bottom = -size * 0.75;
  sc.near = 0.5;
  sc.far = 30;
  sun.shadow.radius = 4;
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  const camera = new THREE.PerspectiveCamera(42, W / H, 0.05, 100);

  const timings: Record<string, number> = {};
  window.__timings = timings;
  const defs = selected();
  let i = 0;
  for (const def of defs) {
    status.textContent = `rendering ${++i}/${defs.length} ${def.id}`;
    await nextFrame();
    const onFloor = def.kinds.some((k) => k === 'floor' || k === 'ground' || k === 'roof');
    const onWall = def.kinds.some((k) => k === 'wall' || k === 'exterior' || k === 'roof');
    const t0 = performance.now();
    const mat = finishes.material(def.id);
    const first = performance.now() - t0;
    flushFinishUpgrades();
    const ms = performance.now() - t0;
    timings[def.id] = Math.round(ms * 10) / 10;
    const timeLabel = progressive ? `${first.toFixed(0)} + ${(ms - first).toFixed(0)} ms` : `${ms.toFixed(0)} ms`;
    floor.material = onFloor ? mat : finishes.material('oak-planks');
    wall.material = onWall ? mat : finishes.material('paint:#f1eee8');

    if (view === 'close') {
      if (onFloor || !onWall) {
        camera.position.set(0.5, 1.45, 1.5);
        camera.lookAt(0.1, 0, -0.5);
      } else {
        camera.position.set(0.7, 1.45, -0.55);
        camera.lookAt(-0.2, 1.3, -2);
      }
    } else if (top) {
      camera.position.set(0, 13, 11);
      camera.lookAt(0, 0, -1);
    } else {
      camera.position.set(2.3, 1.7, 4.4);
      camera.lookAt(-0.25, 0.85, -1.2);
    }
    renderer.render(scene, camera);

    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.id = def.id;
    const img = new Image(W, H);
    img.src = renderer.domElement.toDataURL('image/jpeg', 0.92);
    const cap = document.createElement('div');
    cap.className = 'cap';
    cap.innerHTML = `<b>${def.id}</b><span>${def.kinds.join('/')} · ${timeLabel}</span><span dir="rtl">${def.name}</span>`;
    card.append(img, cap);
    grid.append(card);
  }
  status.textContent = `done – ${defs.length} finishes`;
}

async function swatches(): Promise<void> {
  const timings: Record<string, number> = {};
  window.__timings = timings;
  const kinds = Object.keys(FINISH_KIND_LABELS) as FinishKind[];
  const only = selected();
  for (const kind of kinds) {
    const defs = only.filter((d) => d.kinds[0] === kind);
    if (!defs.length) continue;
    const h = document.createElement('h2');
    h.textContent = `${FINISH_KIND_LABELS[kind]} (${kind})`;
    grid.append(h);
    for (const def of defs) {
      const t0 = performance.now();
      const url = finishes.swatch(def.id);
      timings[def.id] = Math.round((performance.now() - t0) * 10) / 10;
      const card = document.createElement('div');
      card.className = 'card sw';
      card.dataset.id = def.id;
      card.innerHTML = `<img src="${url}" width="96" height="96"><div dir="rtl">${def.name}</div><div style="opacity:.7;direction:ltr">${def.id} <i style="background:${def.color2d}"></i> ${timings[def.id].toFixed(0)}ms</div>`;
      grid.append(card);
      await nextFrame();
    }
  }
  const h = document.createElement('h2');
  h.textContent = 'paint:#hex';
  grid.append(h);
  for (const hex of ['#f1eee8', '#d9c7b0', '#9db8a5', '#7f9bb5', '#e7b7a6', '#3f4a57']) {
    const id = `paint:${hex}`;
    const def = finishes.get(id);
    const card = document.createElement('div');
    card.className = 'card sw';
    card.innerHTML = `<img src="${finishes.swatch(id)}" width="96" height="96"><div dir="rtl">${def.name}</div><div style="opacity:.7;direction:ltr">${id}</div>`;
    grid.append(card);
  }
  status.textContent = 'done';
}

/** every color map drawn 2 x 2: any seam would show up as a cross through the middle */
async function tiling(): Promise<void> {
  const size = Number(params.get('size') ?? 150);
  for (const def of selected()) {
    const mat = finishes.material(def.id);
    const src = mat.map?.image as HTMLCanvasElement | undefined;
    if (!src) continue;
    const c = document.createElement('canvas');
    c.width = c.height = size * 2;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    for (let k = 0; k < 4; k++) ctx.drawImage(src, (k % 2) * size, (k >> 1) * size, size, size);
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.id = def.id;
    c.style.display = 'block';
    const cap = document.createElement('div');
    cap.className = 'cap';
    cap.innerHTML = `<b>${def.id}</b>`;
    card.append(c, cap);
    grid.append(card);
    await nextFrame();
  }
  status.textContent = 'done';
}

(mode === 'swatches' ? swatches() : mode === 'tiling' ? tiling() : scenes())
  .catch((e) => {
    console.error(e);
    status.textContent = String(e);
  })
  .finally(() => {
    window.__done = true;
  });
