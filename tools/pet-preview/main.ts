/**
 * Pet preview harness (deterministic: fixed time steps, no wall clock).
 *
 *   /tools/pet-preview/index.html?pet=pet-dog&view=turn            5 turntable angles (+ 1.4 m pole)
 *   ?view=strip&speed=1.4&frames=8                                  8 frames over one gait cycle, side view
 *   ?view=seq&seq=idle:1,sit:1.2,lie:1.4,happy:1.2&frames=12        mood timeline sampled at equal intervals
 *   ?view=seq&seq=happy:2&t0=1.6&frames=8                           e.g. tail wag frames
 *   common: az, el (deg), span (m, vertical extent of a tile), tile=WxH, cols, pole=0|1, travel=0|1,
 *           colors=coat:%23aabbcc;collar:%23ff0000, mood, speed, t (settle time for static views)
 *
 * After rendering `window.__ready` is true and `window.__report` holds per-tile ground-contact data.
 * `window.__gaitCheck(id, speed)` measures paw sliding and ground penetration over a few cycles.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { FURNITURE } from '/src/catalog/index.ts';
import type { Pet } from '/src/render3d/Pet.ts';

type Mood = 'idle' | 'sit' | 'lie' | 'happy';
const q = new URLSearchParams(location.search);
const num = (k: string, d: number) => (q.has(k) ? Number(q.get(k)) : d);
const view = q.get('view') ?? 'turn';
const petId = q.get('pet') ?? 'pet-dog';
const [tw, th] = (q.get('tile') ?? (view === 'turn' ? '520x440' : '360x300')).split('x').map(Number);
const DT = 1 / 60;

const def = FURNITURE.find((f) => f.id === petId)!;
const colors: Record<string, string> = {};
for (const pair of (q.get('colors') ?? '').split(';')) {
  const [k, v] = pair.split(':');
  if (k && v) colors[k] = v;
}
const big = def.size.h > 0.5;
const span = num('span', view === 'turn' && q.get('pole') !== '0' ? 1.55 : big ? 1.0 : 0.62);

const canvas = document.getElementById('gl') as HTMLCanvasElement;
const wrap = document.getElementById('wrap')!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.82;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.autoClear = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#cfd9e6');
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;
const sun = new THREE.DirectionalLight('#fff1dc', 3.1);
sun.position.set(2.2, 4.2, 2.6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0003;
sun.shadow.normalBias = 0.02;
sun.shadow.radius = 2.5;
const sc = sun.shadow.camera;
sc.left = sc.bottom = -2;
sc.right = sc.top = 2;
sc.near = 0.5;
sc.far = 12;
scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight('#fff9f0', '#b3a78f', 0.35));

// ground with a 10 cm grid so that sliding paws are easy to spot
const gc = document.createElement('canvas');
gc.width = gc.height = 256;
const g2 = gc.getContext('2d')!;
g2.fillStyle = '#b9ad98';
g2.fillRect(0, 0, 256, 256);
g2.strokeStyle = '#a29681';
g2.lineWidth = 2;
for (let i = 0; i <= 10; i++) {
  g2.beginPath();
  g2.moveTo(i * 25.6, 0);
  g2.lineTo(i * 25.6, 256);
  g2.moveTo(0, i * 25.6);
  g2.lineTo(256, i * 25.6);
  g2.stroke();
}
g2.strokeStyle = '#8d806b';
g2.lineWidth = 5;
g2.strokeRect(0, 0, 256, 256);
const gt = new THREE.CanvasTexture(gc);
gt.wrapS = gt.wrapT = THREE.RepeatWrapping;
gt.repeat.set(60, 60);
gt.colorSpace = THREE.SRGBColorSpace;
gt.anisotropy = 8;
const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ map: gt, roughness: 0.92 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// 1.4 m child-height reference pole, striped every 10 cm
const pole = new THREE.Group();
for (let i = 0; i < 14; i++) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.05), new THREE.MeshStandardMaterial({ color: i % 2 ? '#f4f4f4' : '#d8452e', roughness: 0.7 }));
  m.position.y = 0.05 + i * 0.1;
  m.castShadow = true;
  pole.add(m);
}
pole.position.set(-0.42, 0, -0.5);
pole.visible = q.get('pole') ? q.get('pole') === '1' : view === 'turn';
scene.add(pole);

const camera = new THREE.PerspectiveCamera(22, tw / th, 0.05, 100);

function makePet(): { root: THREE.Object3D; pet: Pet } {
  const root = def.build({ colors });
  scene.add(root);
  return { root, pet: root.userData.pet as Pet };
}

const v = new THREE.Vector3();
function contact(pet: Pet): { minY: number; paws: number[]; maxY: number; minZ: number; maxZ: number; maxX: number; low: string } {
  pet.root.updateMatrixWorld(true);
  pet.mesh.skeleton.update();
  const geo = pet.mesh.geometry;
  const si = geo.getAttribute('skinIndex');
  const n = geo.getAttribute('position').count;
  const pawBones = [15, 19, 23, 27];
  const paws = [9, 9, 9, 9];
  let minY = 9;
  let maxY = -9;
  let minZ = 9;
  let maxZ = -9;
  let maxX = 0;
  let low = '';
  for (let i = 0; i < n; i++) {
    pet.mesh.getVertexPosition(i, v);
    if (v.y < minY) {
      minY = v.y;
      low = pet.bones[si.getX(i)].name;
    }
    maxY = Math.max(maxY, v.y);
    minZ = Math.min(minZ, v.z);
    maxZ = Math.max(maxZ, v.z);
    maxX = Math.max(maxX, Math.abs(v.x));
    const k = pawBones.indexOf(si.getX(i));
    if (k >= 0) paws[k] = Math.min(paws[k], v.y);
  }
  return { minY, paws, maxY, minZ, maxZ, maxX, low };
}

interface Tile {
  label: string;
  az: number;
  el: number;
}
const report: unknown[] = [];
let tiles = 0;
let cols = num('cols', 0);

function label(col: number, row: number, text: string, bad = false): void {
  const d = document.createElement('div');
  d.className = 'lbl' + (bad ? ' bad' : '');
  d.textContent = text;
  d.style.left = `${col * tw + 4}px`;
  d.style.top = `${row * th + 4}px`;
  wrap.appendChild(d);
}

function renderTile(i: number, tile: Tile, pet: Pet, extra = ''): void {
  const col = i % cols;
  const row = Math.floor(i / cols);
  const az = THREE.MathUtils.degToRad(tile.az);
  const el = THREE.MathUtils.degToRad(tile.el);
  const cy = num('cy', span * (pole.visible ? 0.47 : 0.4));
  const target = new THREE.Vector3(pet.root.position.x, cy, pet.root.position.z + num('cz', 0));
  const dist = (span * 0.5) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  camera.position.set(target.x + Math.sin(az) * Math.cos(el) * dist, target.y + Math.sin(el) * dist, target.z + Math.cos(az) * Math.cos(el) * dist);
  camera.up.set(0, 1, 0);
  if (tile.el > 85) camera.up.set(0, 0, 1);
  camera.lookAt(target);
  sun.target.position.copy(target);
  sun.position.set(target.x + 2.2, 4.2, target.z + 2.6);
  sun.target.updateMatrixWorld();
  const c = contact(pet);
  renderer.setViewport(col * tw, (Math.ceil(tiles / cols) - 1 - row) * th, tw, th);
  renderer.setScissor(col * tw, (Math.ceil(tiles / cols) - 1 - row) * th, tw, th);
  renderer.setScissorTest(true);
  renderer.clear();
  renderer.render(scene, camera);
  const bad = c.minY < -0.004 || Math.min(...c.paws) > 0.004 * (view === 'turn' ? 1 : 100);
  label(col, row, `${tile.label}${extra}  minY ${(c.minY * 1000).toFixed(1)}mm ${c.minY < -0.002 ? c.low : ''}`, bad);
  report.push({ label: tile.label + extra, ...c });
}

function begin(n: number): void {
  tiles = n;
  if (!cols) cols = Math.min(n, view === 'turn' ? 3 : 4);
  const rows = Math.ceil(n / cols);
  renderer.setSize(cols * tw, rows * th, false);
  canvas.style.width = `${cols * tw}px`;
  canvas.style.height = `${rows * th}px`;
  renderer.setScissorTest(false);
  renderer.clear();
}

function step(pet: Pet, time: number, speed: number, mood: Mood, travel: boolean): void {
  const n = Math.round(time / DT);
  for (let i = 0; i < n; i++) {
    pet.update(DT, speed, mood);
    if (travel) pet.root.position.z += speed * DT;
  }
}

function run(): void {
  const { pet } = makePet();
  const mood = (q.get('mood') ?? 'idle') as Mood;
  const speed = num('speed', 0);
  const travel = q.get('travel') === '1';
  const az0 = num('az', 90);
  const el0 = num('el', 6);
  if (view === 'turn') {
    const static0 = q.get('static') === '1';
    if (!static0) step(pet, num('t', 1.2), speed, mood, false);
    const list: Tile[] = [
      { label: 'front', az: 0, el: 6 },
      { label: '3/4', az: 38, el: 14 },
      { label: 'side', az: 90, el: 5 },
      { label: 'back 3/4', az: 150, el: 14 },
      { label: 'top', az: 0, el: 89.9 },
      { label: 'low 3/4 (other side)', az: -55, el: 3 },
    ];
    begin(list.length);
    list.forEach((t, i) => renderTile(i, t, pet));
  } else if (view === 'strip') {
    const frames = num('frames', 8);
    step(pet, num('t', 2.5), speed, mood, travel);
    // align to the start of a cycle, then sample `frames` phases
    const ph = () => (pet as unknown as { phase: number }).phase;
    let guard = 0;
    let prev = ph();
    while (guard++ < 2000) {
      step(pet, DT, speed, mood, travel);
      const p = ph();
      if (p < prev) break;
      prev = p;
    }
    begin(frames);
    for (let i = 0; i < frames; i++) {
      guard = 0;
      while (ph() < i / frames && guard++ < 2000) {
        const before = ph();
        step(pet, DT, speed, mood, travel);
        if (ph() < before) break;
      }
      renderTile(i, { label: `${speed} m/s  φ=${ph().toFixed(2)}`, az: az0, el: el0 }, pet);
    }
  } else {
    // seq: mood[:duration[:speed]] list
    const seq = (q.get('seq') ?? 'idle:1,sit:1.2,lie:1.4,happy:1.2').split(',').map((s) => {
      const [m, d, sp] = s.split(':');
      return { mood: m as Mood, dur: Number(d ?? 1), speed: Number(sp ?? 0) };
    });
    const total = seq.reduce((a, s) => a + s.dur, 0);
    const frames = num('frames', 12);
    const t0 = num('t0', 0);
    const t1 = num('t1', total);
    begin(frames);
    let time = 0;
    step(pet, num('t', 0.5), 0, seq[0].mood, false);
    const advanceTo = (target: number) => {
      while (time < target - 1e-6) {
        let acc = 0;
        let cur = seq[seq.length - 1];
        for (const s of seq) {
          if (time < acc + s.dur - 1e-9) {
            cur = s;
            break;
          }
          acc += s.dur;
        }
        pet.update(DT, cur.speed, cur.mood);
        if (travel) pet.root.position.z += cur.speed * DT;
        time += DT;
      }
    };
    const moodAt = (tm: number) => {
      let acc = 0;
      for (const s of seq) {
        if (tm < acc + s.dur) return s.mood + (s.speed ? `@${s.speed}` : '');
        acc += s.dur;
      }
      return seq[seq.length - 1].mood;
    };
    for (let i = 0; i < frames; i++) {
      const tt = t0 + ((t1 - t0) * i) / Math.max(1, frames - 1);
      advanceTo(tt);
      renderTile(i, { label: `t=${tt.toFixed(2)} ${moodAt(Math.max(0, tt - 1e-6))}`, az: az0, el: el0 }, pet);
    }
  }
  const info = renderer.info;
  // draw calls of one pet in the main pass: count the groups
  (window as unknown as Record<string, unknown>).__report = {
    id: petId,
    triangles: pet.triangles,
    drawCallsMainPass: pet.mesh.geometry.groups.length,
    bones: pet.bones.length,
    programs: info.programs?.length,
    tiles: report,
  };
}

/** Walk the pet over the ground for a few cycles; report sliding of planted paws and ground contact. */
function gaitCheck(id: string, speed: number, seconds = 3): unknown {
  const d = FURNITURE.find((f) => f.id === id)!;
  const root = d.build({ colors: {} });
  const pet = root.userData.pet as Pet;
  const pawBones = [15, 19, 23, 27];
  for (let i = 0; i < 180; i++) {
    pet.update(DT, speed, 'idle');
    root.position.z += speed * DT;
  }
  const geo = pet.mesh.geometry;
  const si = geo.getAttribute('skinIndex');
  const n = geo.getAttribute('position').count;
  const idx: number[][] = [[], [], [], []];
  for (let i = 0; i < n; i++) {
    const k = pawBones.indexOf(si.getX(i));
    if (k >= 0) idx[k].push(i);
  }
  const plantedZ: (number | null)[] = [null, null, null, null];
  const slide = [0, 0, 0, 0];
  const contactFrac = [0, 0, 0, 0];
  let minY = 9;
  let maxLift = 0;
  let airborne = 0;
  const steps = Math.round(seconds / DT);
  for (let s = 0; s < steps; s++) {
    pet.update(DT, speed, 'idle');
    root.position.z += speed * DT;
    root.updateMatrixWorld(true);
    pet.mesh.skeleton.update();
    let down = 0;
    for (let k = 0; k < 4; k++) {
      let y = 9;
      for (const i of idx[k]) {
        pet.mesh.getVertexPosition(i, v);
        y = Math.min(y, v.y);
      }
      minY = Math.min(minY, y);
      maxLift = Math.max(maxLift, y);
      // toe-tip z in world space (the paw bone origin moves when the heel lifts, so track the bone + root)
      const bone = pet.bones[pawBones[k]];
      const wz = root.position.z + bone.position.z;
      if (y < 0.003) down++;
      if (y < 0.0006 && Math.abs(bone.quaternion.x) < 0.01) {
        contactFrac[k]++;
        if (plantedZ[k] === null) plantedZ[k] = wz;
        slide[k] = Math.max(slide[k], Math.abs(wz - (plantedZ[k] as number)));
      } else plantedZ[k] = null;
    }
    if (down === 0) airborne++;
  }
  return {
    id,
    speed,
    minY_mm: +(minY * 1000).toFixed(2),
    maxPawLift_mm: +(maxLift * 1000).toFixed(1),
    slide_mm: slide.map((x) => +(x * 1000).toFixed(1)),
    contactFraction: contactFrac.map((x) => +(x / steps).toFixed(2)),
    airborneFraction: +(airborne / steps).toFixed(2),
    gait: +(pet as unknown as { gait: number }).gait.toFixed(2),
  };
}

try {
  run();
} catch (e) {
  console.error(e);
  (window as unknown as Record<string, unknown>).__error = String((e as Error).stack ?? e);
}
(window as unknown as Record<string, unknown>).__gaitCheck = gaitCheck;
(window as unknown as Record<string, unknown>).__ready = true;
