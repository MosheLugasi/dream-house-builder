/**
 * Catalog preview (3D contact sheet).
 *
 *   /tools/catalog-preview/index.html            all items, one auto-framed tile each
 *   ?cat=living                                   only one category
 *   ?id=sofa-3,armchair                           only some items
 *   ?az=35&el=22                                  camera azimuth / elevation in degrees
 *   ?tile=480x380&cols=4                          tile size / columns
 *   ?mode=row                                     all selected items side by side at true scale
 *
 * After rendering, `window.__report` holds per-item bbox / triangle stats and `window.__ready` is true.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { FURNITURE, resolveColors } from '/src/catalog/index.ts';
import type { FurnitureDef } from '/src/catalog/types.ts';
import { CATEGORY_LABELS } from '/src/catalog/types.ts';

const q = new URLSearchParams(location.search);
const cat = q.get('cat');
const ids = q.get('id')?.split(',');
const az = THREE.MathUtils.degToRad(Number(q.get('az') ?? 32));
const el = THREE.MathUtils.degToRad(Number(q.get('el') ?? 20));
const [tw, th] = (q.get('tile') ?? '460x380').split('x').map(Number);
const LABEL_H = 44;
const rh = th - LABEL_H;
const mode = q.get('mode') ?? 'sheet';
const CEILING = 2.7;

const items = FURNITURE.filter((f) => (!cat || f.category === cat) && (!ids || ids.includes(f.id)));

const nav = document.getElementById('nav')!;
nav.innerHTML =
  `<b>3D</b> <a href="?">all</a> ` +
  Object.keys(CATEGORY_LABELS)
    .map((c) => `<a href="?cat=${c}">${c}</a>`)
    .join(' ') +
  ` <a href="plan.html">2D plan symbols →</a> <span>${items.length} items</span>`;

const gl = document.getElementById('gl') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas: gl, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#e9ebee');
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.6;

const sun = new THREE.DirectionalLight('#fff4e2', 2.0);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
sun.shadow.radius = 4;
scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight('#ffffff', '#b9b2a6', 0.35));

const floorMat = new THREE.MeshStandardMaterial({ color: '#d8d4cc', roughness: 0.9 });
const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), floorMat);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const wallMat = new THREE.MeshStandardMaterial({ color: '#f1eee8', roughness: 0.95 });
const camera = new THREE.PerspectiveCamera(30, tw / rh, 0.05, 400);

interface Report {
  id: string;
  ok: boolean;
  notes: string[];
  tris: number;
  meshes: number;
  bbox: number[];
}
const report: Report[] = [];

function place(def: FurnitureDef): { root: THREE.Group; box: THREE.Box3; rep: Report } {
  const root = new THREE.Group();
  const obj = def.build({ colors: resolveColors(def) });
  root.add(obj);
  obj.updateMatrixWorld(true);
  const raw = new THREE.Box3().setFromObject(obj, true);
  let tris = 0;
  let meshes = 0;
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      meshes++;
      const g = m.geometry;
      tris += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
    }
  });
  const { w, d, h } = def.size;
  const tol = 0.006;
  const notes: string[] = [];
  const mount = def.mount ?? 'floor';
  const y0 = mount === 'ceiling' ? CEILING - h : 0;
  const y1 = mount === 'ceiling' ? CEILING : h;
  if (raw.min.x < -w / 2 - tol || raw.max.x > w / 2 + tol) notes.push(`x ${raw.min.x.toFixed(3)}..${raw.max.x.toFixed(3)} > ±${w / 2}`);
  if (raw.min.z < -d / 2 - tol || raw.max.z > d / 2 + tol) notes.push(`z ${raw.min.z.toFixed(3)}..${raw.max.z.toFixed(3)} > ±${d / 2}`);
  if (raw.min.y < y0 - tol || raw.max.y > y1 + tol) notes.push(`y ${raw.min.y.toFixed(3)}..${raw.max.y.toFixed(3)} outside ${y0}..${y1}`);
  if (mount !== 'ceiling' && Math.abs(raw.min.y) > tol) notes.push(`minY=${raw.min.y.toFixed(3)}`);
  if (mount === 'ceiling' && Math.abs(raw.max.y - CEILING) > tol) notes.push(`maxY=${raw.max.y.toFixed(3)}≠2.7`);
  if (mount === 'wall' && Math.abs(raw.min.z + d / 2) > tol) notes.push(`back z=${raw.min.z.toFixed(3)}`);
  const slack = 0.04;
  if (w - (raw.max.x - raw.min.x) > slack) notes.push(`loose w ${(raw.max.x - raw.min.x).toFixed(2)}/${w}`);
  if (d - (raw.max.z - raw.min.z) > slack) notes.push(`loose d ${(raw.max.z - raw.min.z).toFixed(2)}/${d}`);
  if (h - (raw.max.y - raw.min.y) > slack) notes.push(`loose h ${(raw.max.y - raw.min.y).toFixed(2)}/${h}`);
  if (Math.abs(raw.min.x + raw.max.x) > 0.03) notes.push(`off-center x ${((raw.min.x + raw.max.x) / 2).toFixed(3)}`);
  if (tris > 4000) notes.push(`tris ${tris}`);
  const hard = notes.filter((n) => !n.startsWith('loose') && !n.startsWith('tris') && !n.startsWith('off-center'));
  const rep: Report = {
    id: def.id,
    ok: hard.length === 0,
    notes,
    tris: Math.round(tris),
    meshes,
    bbox: [raw.min.x, raw.min.y, raw.min.z, raw.max.x, raw.max.y, raw.max.z].map((v) => +v.toFixed(3)),
  };

  if (mount === 'wall') {
    const elev = def.elevation ?? 0;
    obj.position.y = elev;
    const wh = Math.max(elev + h + 0.35, 1.2);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w + 0.9, wh, 0.1), wallMat);
    wall.position.set(0, wh / 2, -d / 2 - 0.05);
    wall.receiveShadow = true;
    wall.castShadow = true;
    root.add(wall);
  }
  if (mount === 'ceiling') {
    const c = new THREE.Mesh(new THREE.BoxGeometry(Math.max(w, 0.6) + 0.6, 0.06, Math.max(d, 0.6) + 0.6), wallMat);
    c.position.set(0, CEILING + 0.03, 0);
    root.add(c);
  }
  if (def.seats && q.has('seats')) {
    for (const s of def.seats) {
      const m = new THREE.Mesh(
        new THREE.ConeGeometry(0.06, 0.2, 12),
        new THREE.MeshBasicMaterial({ color: s.kind === 'lie' ? '#2d6cdf' : '#e0483e' }),
      );
      m.rotation.x = Math.PI / 2;
      const g = new THREE.Group();
      g.add(m);
      g.rotation.y = s.facing;
      g.position.set(s.x, s.height + 0.08, s.z);
      root.add(g);
    }
  }
  if (def.light && q.has('lights')) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.04), new THREE.MeshBasicMaterial({ color: '#ff00ff' }));
    m.position.set(def.light.x, def.light.y, def.light.z);
    root.add(m);
  }
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj, true);
  return { root, box, rep };
}

function frame(box: THREE.Box3, aspect: number, elev: number = el): void {
  const c = box.getCenter(new THREE.Vector3());
  const r = box.getSize(new THREE.Vector3()).length() / 2;
  const fov = THREE.MathUtils.degToRad(camera.fov);
  const hfov = 2 * Math.atan(Math.tan(fov / 2) * aspect);
  const dist = (r / Math.sin(Math.min(fov, hfov) / 2)) * 1.02;
  const dir = new THREE.Vector3(Math.sin(az) * Math.cos(elev), Math.sin(elev), Math.cos(az) * Math.cos(elev));
  camera.position.copy(c).addScaledVector(dir, dist);
  camera.near = Math.max(0.02, dist - r * 3);
  camera.far = dist + r * 30 + 50;
  camera.aspect = aspect;
  camera.lookAt(c);
  camera.updateProjectionMatrix();
  const s = Math.max(r * 1.6, 0.5);
  sun.position.copy(c).add(new THREE.Vector3(-0.55, 1.1, 0.75).multiplyScalar(s * 3));
  sun.target.position.copy(c);
  const sc = sun.shadow.camera;
  sc.left = -s;
  sc.right = s;
  sc.top = s;
  sc.bottom = -s;
  sc.near = 0.01;
  sc.far = s * 8;
  sc.updateProjectionMatrix();
}

const sheet = document.getElementById('sheet') as HTMLCanvasElement;
const s2d = sheet.getContext('2d')!;

function label(x: number, y: number, def: FurnitureDef, rep: Report): void {
  s2d.fillStyle = 'rgba(255,255,255,0.82)';
  s2d.fillRect(x, y + th - 44, tw, 44);
  s2d.fillStyle = '#1d1f23';
  s2d.font = '600 14px system-ui, sans-serif';
  s2d.textAlign = 'left';
  s2d.fillText(def.id, x + 8, y + th - 26);
  s2d.textAlign = 'right';
  s2d.fillText(def.name, x + tw - 8, y + th - 26);
  s2d.textAlign = 'left';
  s2d.font = '11px system-ui, sans-serif';
  s2d.fillStyle = rep.ok ? '#5b6168' : '#c62828';
  const info = `${def.size.w}×${def.size.d}×${def.size.h}m · ${rep.tris}△ · ${rep.meshes} draws ${rep.notes.length ? '· ' + rep.notes.join('; ') : ''}`;
  s2d.fillText(info.slice(0, 96), x + 8, y + th - 9);
  s2d.strokeStyle = '#c9ccd1';
  s2d.lineWidth = 1;
  s2d.strokeRect(x + 0.5, y + 0.5, tw - 1, th - 1);
}

function renderSheet(): void {
  const cols = Number(q.get('cols') ?? Math.min(4, Math.max(1, items.length)));
  const rows = Math.ceil(items.length / cols);
  sheet.width = cols * tw;
  sheet.height = Math.max(1, rows) * th;
  renderer.setSize(tw, rh, false);
  items.forEach((def, i) => {
    const x = (i % cols) * tw;
    const y = Math.floor(i / cols) * th;
    try {
      const { root, box, rep } = place(def);
      report.push(rep);
      scene.add(root);
      frame(box, tw / rh, def.mount === 'ceiling' && !q.has('el') ? THREE.MathUtils.degToRad(-12) : el);
      renderer.render(scene, camera);
      s2d.drawImage(gl, x, y);
      scene.remove(root);
      label(x, y, def, rep);
    } catch (e) {
      console.error(def.id, e);
      report.push({ id: def.id, ok: false, notes: [String(e)], tris: 0, meshes: 0, bbox: [] });
      s2d.fillStyle = '#c62828';
      s2d.font = '13px system-ui';
      s2d.fillText(`${def.id}: ${String(e).slice(0, 60)}`, x + 8, y + 30);
    }
  });
}

/** all items side by side at true scale, with a 1.70 m figure for reference */
function renderRow(): void {
  const W = Number(q.get('w') ?? 1800);
  const H = Number(q.get('h') ?? 700);
  sheet.width = W;
  sheet.height = H;
  renderer.setSize(W, H, false);
  const all = new THREE.Group();
  const total = new THREE.Box3();
  let x = 0;
  const gap = 0.45;
  const dummy = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: '#8d9aa8', roughness: 0.8 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 1.02, 6, 14), skin);
  body.position.y = 0.17 + 0.51 + 0.0;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 16, 12), skin);
  head.position.y = 1.585;
  body.castShadow = head.castShadow = true;
  dummy.add(body, head);
  dummy.position.set(-0.5, 0, 0);
  all.add(dummy);
  for (const def of items) {
    const { root, rep } = place(def);
    report.push(rep);
    root.position.x = x + def.size.w / 2;
    x += def.size.w + gap;
    all.add(root);
  }
  scene.add(all);
  all.updateMatrixWorld(true);
  total.setFromObject(all);
  total.min.y = 0;
  frame(total, W / H);
  // a row is much wider than tall: fit its width instead of its bounding sphere
  {
    const c = total.getCenter(new THREE.Vector3());
    const size = total.getSize(new THREE.Vector3());
    const hfov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * (W / H));
    const dist = Math.max((size.x / 2 / Math.tan(hfov / 2)) * 1.04, (size.y / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) * 1.3) + size.z;
    const dir = camera.position.clone().sub(c).normalize();
    camera.position.copy(c).addScaledVector(dir, dist);
    camera.near = 0.1;
    camera.far = dist * 4 + 100;
    camera.lookAt(c);
    camera.updateProjectionMatrix();
  }
  renderer.render(scene, camera);
  s2d.drawImage(gl, 0, 0);
}

if (mode === 'row') renderRow();
else renderSheet();

declare global {
  interface Window {
    __report: unknown;
    __ready: boolean;
  }
}
window.__report = report;
window.__ready = true;
