/**
 * Character preview harness (deterministic: animation is advanced with fixed time steps).
 *
 *   /tools/character-preview/index.html?mode=lineup            four body types side by side
 *   ?mode=styles&kind=hair|top|bottom|acc&body=girl             every style of one kind
 *   ?mode=turn&body=woman                                       front, 3/4, side, back
 *   ?mode=strip&anim=walk|run&frames=8&body=girl&view=side      frames across one gait cycle
 *   ?mode=poses&body=girl                                       sit, lie, ride, reach, jump, fall, land
 *   ?mode=gestures&body=girl                                    wave, cheer, pet, kick (several moments)
 *   ?mode=face&body=girl                                        head close-ups (also eyes closed)
 *   ?mode=one&pose=sit&t=1.5&speed=0&yaw=30 …                   a single character, live when &live=1
 *   ?mode=metrics                                               numbers only (window.__metrics)
 *
 * Look overrides for every mode: body, skin, hair, hairStyle, top, topStyle, bottom, bottomStyle, shoes, accessory.
 * Camera: view=front|side|back|34, elev=<deg>, zoom=<factor>, nolabel=1, nonav=1.
 * `window.__done` becomes true once the frame is rendered; `window.__metrics` holds the numbers.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Character } from '/src/render3d/Character.ts';
import { DEFAULT_LOOK, type Activity, type BodyType, type CharacterLook, type Gesture, type Prop } from '/src/render3d/characterTypes.ts';
import { randomLook } from '/src/render3d/character/options.ts';

const q = new URLSearchParams(location.search);
const mode = q.get('mode') ?? 'lineup';
const DT = 1 / 60;

const canvas = document.getElementById('gl') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(q.get('bg') ?? '#cfd8e2');
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;
const sun = new THREE.DirectionalLight('#fff1dc', 2.6);
sun.castShadow = q.get('noshadow') !== '1';
if (q.get('nb')) sun.shadow.normalBias = Number(q.get('nb'));
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.bias = -0.0003;
sun.shadow.normalBias = 0.02;
sun.shadow.radius = 3;
scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight('#fff9f0', '#b3a78f', 0.35));
const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#b9c2a6', roughness: 0.95 }));
ground.receiveShadow = true;
scene.add(ground);

// ---- looks ----------------------------------------------------------------------------------------------
const LOOKS: Record<BodyType, CharacterLook> = {
  girl: { ...DEFAULT_LOOK },
  boy: { body: 'boy', skin: '#d9a37a', hair: '#2a1b12', hairStyle: 'short', top: '#3d7fc4', topStyle: 'hoodie', bottom: '#5b5f66', bottomStyle: 'shorts', shoes: '#e24a3b', accessory: 'none' },
  woman: { body: 'woman', skin: '#eec4a4', hair: '#8a5a2b', hairStyle: 'long', top: '#2f8f83', topStyle: 'longsleeve', bottom: '#2c3550', bottomStyle: 'pants', shoes: '#f4f4f2', accessory: 'none' },
  man: { body: 'man', skin: '#a56c43', hair: '#17120f', hairStyle: 'short', top: '#e9e4d8', topStyle: 'tshirt', bottom: '#3f5f8a', bottomStyle: 'pants', shoes: '#3a3a3c', accessory: 'none' },
};
const KEYS = ['body', 'skin', 'hair', 'hairStyle', 'top', 'topStyle', 'bottom', 'bottomStyle', 'shoes', 'accessory', 'eyes', 'accessoryColor'] as const;
function lookOf(body?: string | null, patch: Partial<CharacterLook> = {}): CharacterLook {
  const b = (body ?? q.get('body') ?? 'girl') as BodyType;
  const l: CharacterLook = { ...LOOKS[b], ...patch };
  for (const key of KEYS) {
    const v = q.get(key);
    if (v && key !== 'body') (l as unknown as Record<string, string>)[key] = v.startsWith('#') || !/^[0-9a-f]{6}$/i.test(v) ? v : '#' + v;
  }
  return l;
}

// ---- actors ----------------------------------------------------------------------------------------------
interface Actor {
  c: Character;
  label: string;
  x: number;
  z?: number;
  yaw?: number;
  props?: THREE.Object3D[];
}
const actors: Actor[] = [];
const viewName = q.get('view') ?? 'front';
const baseYaw = { front: 0, side: Math.PI / 2, back: Math.PI, '34': Math.PI / 5, '34b': Math.PI * 0.8 }[viewName] ?? THREE.MathUtils.degToRad(Number(q.get('yaw') ?? 0));

const run = (c: Character, seconds: number, speed = 0, motion = {}, dt = DT) => {
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) c.update(dt, speed, motion);
};
/** advance until the gait phase reaches `target` (0..1) */
const toPhase = (c: Character, speed: number, target: number) => {
  let guard = 0;
  const dt = 1 / 480;
  let prev = c.gaitPhase;
  while (guard++ < 4000) {
    c.update(dt, speed);
    const p = c.gaitPhase;
    const crossed = prev <= p ? prev < target && p >= target : prev < target || p >= target;
    if (crossed) break;
    prev = p;
  }
};
const boxMat = new THREE.MeshStandardMaterial({ color: '#c9b79c', roughness: 0.8 });
const metalMat = new THREE.MeshStandardMaterial({ color: '#4a5560', roughness: 0.5, metalness: 0.3 });
const box = (w: number, h: number, d: number, x = 0, y = 0, z = 0, mat = boxMat) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y + h / 2, z);
  m.castShadow = m.receiveShadow = true;
  return m;
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** stand-in bicycle with the same reference points as the catalog bikes (saddle at the origin) */
function bike(seat: number, pedal: number): THREE.Object3D[] {
  const t = Math.min(1, Math.max(0, (seat - 0.66) / 0.21));
  const bbY = lerp(0.25, 0.28, t);
  const bbZ = lerp(0.16, 0.2, t);
  const crank = lerp(0.125, 0.165, t);
  const barY = lerp(0.93, 1.04, t);
  const barZ = lerp(0.44, 0.57, t);
  const half = lerp(0.26, 0.27, t);
  const out: THREE.Object3D[] = [];
  out.push(box(0.14, 0.04, 0.24, 0, seat - 0.04, 0, metalMat));
  out.push(box(0.03, seat - bbY, 0.03, 0, bbY, 0.05, metalMat));
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, half * 2, 8).rotateZ(Math.PI / 2), metalMat);
  bar.position.set(0, barY, barZ);
  out.push(bar);
  out.push(box(0.025, barY - 0.3, 0.025, 0, 0.3, barZ + 0.03, metalMat));
  const A = pedal - 1.0;
  for (const s of [1, -1]) {
    const p = box(0.085, 0.022, 0.07, s * 0.14, bbY - s * crank * Math.cos(A) - 0.011, bbZ - s * crank * Math.sin(A), metalMat);
    out.push(p);
  }
  for (const z of [-0.34, 0.74]) {
    const w = new THREE.Mesh(new THREE.TorusGeometry(lerp(0.255, 0.34, t), 0.02, 8, 24).rotateY(Math.PI / 2), metalMat);
    w.position.set(0, lerp(0.255, 0.34, t), z);
    out.push(w);
  }
  return out;
}

const body = (q.get('body') ?? 'girl') as BodyType;
const ALL: BodyType[] = ['girl', 'boy', 'woman', 'man'];
let spacing = 0.95;
const metrics: Record<string, unknown> = {};

if (mode === 'lineup') {
  ALL.forEach((b, i) => {
    const c = new Character(lookOf(b));
    run(c, 2);
    actors.push({ c, label: `${b} ${c.stats.height.toFixed(2)} m · eye ${c.eyeHeight.toFixed(2)} · ${c.stats.triangles} tris · ${c.stats.drawCalls} draws`, x: i });
  });
} else if (mode === 'random') {
  const n = Number(q.get('n') ?? 8);
  for (let i = 0; i < n; i++) {
    const c = new Character(randomLook(Number(q.get('seed') ?? 1) * 100 + i));
    run(c, 2 + i * 0.37);
    actors.push({ c, label: `${c.getLook().body} ${c.getLook().hairStyle} ${c.getLook().topStyle} ${c.getLook().accessory}`, x: i });
  }
} else if (mode === 'styles') {
  const kind = q.get('kind') ?? 'hair';
  const list: Partial<CharacterLook>[] =
    kind === 'hair'
      ? (['ponytail', 'short', 'long', 'bun', 'curly', 'braids', 'bald'] as const).map((hairStyle) => ({ hairStyle }))
      : kind === 'top'
        ? (['tshirt', 'longsleeve', 'hoodie', 'dress'] as const).map((topStyle) => ({ topStyle }))
        : kind === 'bottom'
          ? (['pants', 'shorts', 'skirt'] as const).map((bottomStyle) => ({ bottomStyle, topStyle: 'tshirt' as const }))
          : (['none', 'glasses', 'cap', 'backpack', 'bow'] as const).map((accessory) => ({ accessory }));
  list.forEach((patch, i) => {
    const c = new Character(lookOf(body, patch));
    run(c, 2);
    actors.push({ c, label: Object.values(patch)[0] as string, x: i });
  });
  spacing = kind === 'hair' ? 0.72 : 0.85;
} else if (mode === 'turn') {
  [0, Math.PI / 5, Math.PI / 2, Math.PI * 0.8, Math.PI].forEach((yaw, i) => {
    const c = new Character(lookOf(body));
    run(c, 2);
    actors.push({ c, label: ['front', '3/4', 'side', '3/4 back', 'back'][i], x: i, yaw });
  });
} else if (mode === 'strip') {
  const anim = q.get('anim') ?? 'walk';
  const speed = Number(q.get('speed') ?? (anim === 'run' ? 3.8 : 1.9));
  const n = Number(q.get('frames') ?? 8);
  spacing = Number(q.get('spacing') ?? (anim === 'run' ? 1.25 : 0.95));
  for (let i = 0; i < n; i++) {
    const c = new Character(lookOf(body));
    run(c, 2.5, speed);
    toPhase(c, speed, i / n);
    actors.push({ c, label: `${anim} ${(i / n).toFixed(3)}`, x: i });
  }
} else if (mode === 'poses') {
  const add = (label: string, setup: (c: Character) => THREE.Object3D[] | void) => {
    const c = new Character(lookOf(body));
    const props = setup(c) ?? [];
    actors.push({ c, label, x: actors.length, props });
  };
  add('idle', (c) => run(c, 3));
  add('sit 0.45', (c) => {
    c.setPose('sit', 0.45);
    run(c, 2);
    return [box(0.5, 0.45, 0.5, 0, 0, -0.03)];
  });
  add('sit 0.30', (c) => {
    c.setPose('sit', 0.3);
    run(c, 2);
    return [box(0.5, 0.3, 0.5, 0, 0, -0.03)];
  });
  add('sit floor', (c) => {
    c.setPose('sit', 0.02);
    run(c, 2);
  });
  add('ride', (c) => {
    const seat = c.stats.height < 1.5 ? 0.66 : 0.87;
    c.setPose('ride', seat);
    c.pedalAngle = 0.6;
    run(c, 2, 4);
    return bike(seat, 0.6);
  });
  add('reach', (c) => {
    c.reach = true;
    run(c, 2);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.42, 8).rotateZ(Math.PI / 2), metalMat);
    bar.position.set(0, 0.895, 0.25);
    return [bar, box(0.02, 0.9, 0.02, 0, 0, 0.27, metalMat), box(0.125, 0.02, 0.5, 0, -0.02, -0.03, metalMat)];
  });
  add('jump up', (c) => {
    run(c, 1);
    run(c, 0.16, 0, { airborne: true, vy: 2.6 });
  });
  add('fall', (c) => {
    run(c, 1);
    run(c, 0.25, 0, { airborne: true, vy: 2.6 });
    run(c, 0.25, 0, { airborne: true, vy: -2.6 });
  });
  add('land', (c) => {
    run(c, 1);
    run(c, 0.3, 0, { airborne: true, vy: -3 });
    run(c, 0.1, 0, { airborne: false, vy: 0 });
  });
  spacing = 1.15;
} else if (mode === 'lie') {
  for (const yaw of [Math.PI / 2, Math.PI / 5]) {
    const c = new Character(lookOf(body));
    c.setPose('lie', 0.5);
    run(c, 3, 0, { asleep: yaw < 1 });
    actors.push({ c, label: yaw < 1 ? 'lie (asleep)' : 'lie', x: actors.length, yaw, props: [box(0.95, 0.5, 2.0)] });
  }
  spacing = 2.4;
} else if (mode === 'gestures') {
  const times: Record<Gesture, number[]> = { wave: [0.5, 0.85, 1.2], cheer: [0.3, 0.5, 0.85], pet: [0.7, 1.2], kick: [0.2, 0.47, 0.7] };
  const only = q.get('g');
  for (const g of Object.keys(times) as Gesture[]) {
    if (only && only !== g) continue;
    for (const t of times[g]) {
      const c = new Character(lookOf(body));
      run(c, 1);
      c.gesture(g);
      run(c, t);
      actors.push({ c, label: `${g} ${t}s`, x: actors.length });
    }
  }
  spacing = 1.05;
} else if (mode === 'activities') {
  // every activity of the game's interaction runtime, in the pose / with the prop it is used with
  type Row = [Activity, { pose?: 'sit' | 'lie'; seat?: number; prop?: Prop; t?: number; strike?: number; lift?: (t: number) => number; box?: [number, number, number] }];
  const hop = (t: number) => Math.max(0, 2.2 * t - 4.9 * t * t) * 1.6;
  const list: Row[] = [
    ['wave', {}],
    ['dance', { t: 1.3 }],
    ['clap', { t: 1.05 }],
    ['cheer', { t: 1.4 }],
    ['jump', { t: 0.22, lift: hop }],
    ['type', { pose: 'sit', box: [0.45, 0.45, 0.45] }],
    ['piano', { pose: 'sit', strike: 1, box: [0.45, 0.45, 0.45] }],
    ['guitar', { prop: 'guitar', strike: 0 }],
    ['drums', { pose: 'sit', strike: -1, box: [0.4, 0.45, 0.4] }],
    ['cook', { prop: 'spoon' }],
    ['eat', { pose: 'sit', prop: 'apple', t: 1.6, box: [0.45, 0.45, 0.45] }],
    ['drink', { prop: 'cup', t: 2.0 }],
    ['read', { pose: 'sit', prop: 'book', box: [0.45, 0.45, 0.45] }],
    ['run', { t: 1.5 }],
    ['pedal', { pose: 'sit', seat: 0.8, box: [0.2, 0.8, 0.25] }],
    ['row', { pose: 'sit', seat: 0.3, t: 1.25, box: [0.3, 0.3, 0.3] }],
    ['lift', { prop: 'dumbbells', t: 1.4 }],
    ['punch', { t: 1.02 }],
    ['yoga', { t: 2 }],
    ['stretch', { t: 2.2 }],
    ['bounce', { t: 0.2, lift: (t) => 0.4 + hop(t) }],
    ['swing', { pose: 'sit', seat: 0.5, box: [0.45, 0.03, 0.2] }],
    ['kick', { t: 0.3, prop: 'none' }],
    ['shoot', { t: 0.42, prop: 'ball' }],
    ['throw', { t: 0.16, prop: 'dart' }],
    ['pet', { t: 1.5 }],
    ['sleep', { pose: 'lie', seat: 0.4, box: [0.9, 0.4, 1.9] }],
    ['game', { prop: 'controller' }],
    ['play', { prop: 'paddle' }],
    ['wash', {}],
    ['feed', {}],
    ['slide', { pose: 'sit', seat: 0.02 }],
    ['call', { t: 0.6 }],
    ['photo', { prop: 'phone' }],
    ['flip', { t: 0.3, lift: hop }],
    ['none', { prop: 'mic' }],
    ['none', { prop: 'cue' }],
  ];
  const per = Number(q.get('per') ?? 9);
  const page = Number(q.get('page') ?? 0);
  for (const [act, o] of list.slice(page * per, page * per + per)) {
    const c = new Character(lookOf(body));
    if (o.pose) c.setPose(o.pose, o.seat ?? 0.45);
    run(c, 1.2);
    if (o.prop) c.setProp(o.prop);
    c.setActivity(act);
    const T = o.t ?? 1.2;
    const steps = Math.round(T / DT);
    for (let i = 0; i < steps; i++) {
      if (o.lift) c.lift = o.lift(i * DT);
      if (o.strike !== undefined && i === steps - 4) c.strike(o.strike);
      c.update(DT, 0);
    }
    const props: THREE.Object3D[] = [];
    if (o.box) {
      const bx = box(o.box[0], o.box[1], o.box[2], 0, 0, act === 'sleep' ? 0 : -0.03);
      if (act === 'swing') bx.position.y = (o.seat ?? 0.5) - 0.03;
      if (act === 'pedal') bx.position.z = -0.12;
      props.push(bx);
    }
    actors.push({ c, label: `${act}${o.prop && o.prop !== 'none' ? ' + ' + o.prop : ''} (${c.getActivity()})`, x: actors.length, props });
  }
  spacing = 1.25;
} else if (mode === 'face') {
  const variants: [string, number, (c: Character) => void][] = [
    ['front', 0, (c) => run(c, 0.2)],
    ['3/4', Math.PI / 5, (c) => run(c, 0.2)],
    ['side', Math.PI / 2, (c) => run(c, 0.2)],
    ['asleep', Math.PI / 9, (c) => run(c, 2, 0, { asleep: true })],
  ];
  variants.forEach(([label, yaw, f], i) => {
    const c = new Character(lookOf(body));
    f(c);
    actors.push({ c, label, x: i, yaw });
  });
  spacing = 0.42;
} else if (mode === 'faces') {
  ALL.forEach((b, i) => {
    const c = new Character(lookOf(b));
    run(c, 0.2);
    actors.push({ c, label: b, x: i, yaw: Number(q.get('fy') ?? 0.3) });
  });
  spacing = 0.42;
} else if (mode === 'one') {
  const c = new Character(lookOf(body));
  const pose = q.get('pose') ?? 'stand';
  const seat = Number(q.get('seat') ?? 0.45);
  if (pose !== 'stand') c.setPose(pose as 'sit', seat);
  if (q.get('reach')) c.reach = true;
  if (q.get('rest') === '1') {
    /* keep the bind pose: only the constructor's update(0) ran */
  } else run(c, Number(q.get('t') ?? 1.5), Number(q.get('speed') ?? 0));
  if (q.get('phase')) toPhase(c, Number(q.get('speed') ?? 0), Number(q.get('phase')));
  if (q.get('g')) {
    c.gesture(q.get('g') as Gesture);
    run(c, Number(q.get('gt') ?? 0.6));
  }
  actors.push({ c, label: '', x: 0 });
}

// ---- metrics ----------------------------------------------------------------------------------------------
function skinnedMinY(c: Character): { minY: number; maxY: number } {
  c.root.updateMatrixWorld(true);
  let minY = Infinity;
  let maxY = -Infinity;
  const v = new THREE.Vector3();
  c.root.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isSkinnedMesh) return;
    m.skeleton.update();
    const n = m.geometry.attributes.position.count;
    const stride = Number(q.get('vstride') ?? 1);
    for (let i = 0; i < n; i += stride) {
      m.getVertexPosition(i, v);
      v.applyMatrix4(m.matrixWorld);
      if (v.y < minY) minY = v.y;
      if (v.y > maxY) maxY = v.y;
    }
  });
  return { minY, maxY };
}
if (mode === 'metrics') {
  for (const b of q.get('only') ? [q.get('only') as BodyType] : ALL) {
    const c = new Character(lookOf(b));
    run(c, 2);
    const idle = skinnedMinY(c);
    const out: Record<string, unknown> = { ...c.stats, eyeHeight: +c.eyeHeight.toFixed(3), idleMinY: +idle.minY.toFixed(4), idleMaxY: +idle.maxY.toFixed(4) };
    for (const [name, speed] of [['walk', 1.9], ['run', 3.8]] as [string, number][]) {
      run(c, 3, speed);
      let lo = Infinity;
      let hi = -Infinity;
      let steps = 0;
      c.onFootstep = () => steps++;
      let skinned: THREE.SkinnedMesh | null = null;
      c.root.traverse((o) => {
        if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned = o as THREE.SkinnedMesh;
      });
      const toes = (skinned as unknown as THREE.SkinnedMesh).skeleton.bones.slice(28, 30);
      // slip: horizontal speed of a planted ball-of-foot relative to the ground while it is low
      let slip = 0;
      let slipN = 0;
      const prev = toes.map(() => new THREE.Vector3());
      // the ball of a planted foot sits at its rest height (half the sole)
      const plantY = 0.0165;
      const cur = new THREE.Vector3();
      const dt = 1 / 120;
      const seconds = Number(q.get('secs') ?? 2);
      const frames = Math.round(seconds / dt);
      for (let i = 0; i < frames; i++) {
        c.update(dt, speed);
        if (i % 8 === 0) {
          const mm = skinnedMinY(c);
          lo = Math.min(lo, mm.minY);
          hi = Math.max(hi, mm.minY);
        } else c.root.updateMatrixWorld(true);
        toes.forEach((t, j) => {
          cur.setFromMatrixPosition(t.matrixWorld);
          if (i > 0 && cur.y < plantY && prev[j].y < plantY) {
            // ground speed of the foot = (dz / dt) + body speed; should be 0 while planted
            slip += Math.abs((cur.z - prev[j].z) / dt + speed);
            slipN++;
          }
          prev[j].copy(cur);
        });
      }
      c.onFootstep = undefined;
      out[name] = { minYlow: +lo.toFixed(4), minYhigh: +hi.toFixed(4), stepsPerSec: steps / seconds, plantedSlip_mps: +(slip / Math.max(1, slipN)).toFixed(4), plantedSamples: slipN };
    }
    metrics[b] = out;
    c.dispose();
  }
  document.getElementById('info')!.textContent = JSON.stringify(metrics, null, 1);
}

// ---- layout + camera ----------------------------------------------------------------------------------------------
const cols = Number(q.get('cols') ?? 99);
const alignHeads = mode === 'faces';
const tallest = Math.max(...actors.map((a) => a.c.stats.height), 0);
let maxH = 0;
actors.forEach((a, i) => {
  const col = i % cols;
  const row = Math.floor(i / cols);
  a.x = col * spacing;
  a.z = -row * 2.2;
  a.c.root.position.set(a.x, 0, a.z);
  if (alignHeads) a.c.root.position.y = tallest - a.c.stats.height;
  a.c.root.rotation.y = a.yaw ?? baseYaw;
  scene.add(a.c.root);
  for (const p of a.props ?? []) {
    const g = new THREE.Group();
    g.position.copy(a.c.root.position);
    g.rotation.y = a.c.root.rotation.y;
    g.add(p);
    scene.add(g);
  }
  maxH = Math.max(maxH, a.c.stats.height);
});
const n = Math.min(actors.length, cols);
const rows = Math.ceil(actors.length / cols);
const cx = ((n - 1) * spacing) / 2;
const headOnly = mode === 'face' || mode === 'faces' || q.get('head') === '1';
const width = (n - 1) * spacing + (headOnly ? 0.4 : 1.1);
const top = maxH + 0.12;
const bottom = headOnly ? maxH - 0.36 : -0.06;
const focusY = Number(q.get('fy0') ?? (top + bottom) / 2);
const elev = THREE.MathUtils.degToRad(Number(q.get('elev') ?? 6));
const fov = 14;
const aspect = window.innerWidth / window.innerHeight;
const camera = new THREE.PerspectiveCamera(fov, aspect, 0.5, 200);
const zoom = Number(q.get('zoom') ?? 1);
const needH = (top - bottom) * (rows > 1 ? rows * 0.75 : 1);
const dist = Math.max(needH / 2 / Math.tan(THREE.MathUtils.degToRad(fov / 2)), width / 2 / (Math.tan(THREE.MathUtils.degToRad(fov / 2)) * aspect)) / zoom;
const camYaw = THREE.MathUtils.degToRad(Number(q.get('cam') ?? 0));
const target = new THREE.Vector3(cx + Number(q.get('dx') ?? 0), focusY, -(rows - 1) * 1.1);
camera.position.set(target.x + Math.sin(camYaw) * Math.cos(elev) * dist, focusY + Math.sin(elev) * dist, target.z + Math.cos(camYaw) * Math.cos(elev) * dist);
camera.lookAt(target);
sun.position.set(cx - 5, 9, 7);
sun.target.position.set(cx, 0.8, 0);
const sc = sun.shadow.camera;
sc.left = -width / 2 - 1.5;
sc.right = width / 2 + 1.5;
sc.top = 3;
sc.bottom = -3;
sc.near = 1;
sc.far = 30;
sc.updateProjectionMatrix();

if (!q.get('nolabel')) {
  scene.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);
  for (const a of actors) {
    if (!a.label) continue;
    const p = new THREE.Vector3(a.x, bottom + 0.02, a.z ?? 0).project(camera);
    const d = document.createElement('div');
    d.className = 'label';
    d.textContent = a.label;
    d.style.left = `${((p.x + 1) / 2) * window.innerWidth}px`;
    d.style.top = `${Math.min(window.innerHeight - 22, ((1 - p.y) / 2) * window.innerHeight + 4)}px`;
    document.body.appendChild(d);
  }
}
if (!q.get('nonav')) {
  document.getElementById('nav')!.innerHTML = ['lineup', 'random', 'styles&kind=hair', 'styles&kind=top', 'styles&kind=bottom', 'styles&kind=acc', 'turn', 'strip&anim=walk', 'strip&anim=run', 'poses', 'lie', 'gestures', 'face', 'faces', 'one&live=1', 'metrics']
    .map((m) => `<a href="?mode=${m}&body=${body}">${m}</a>`)
    .join('');
}

const info = renderer.info;
renderer.render(scene, camera);
metrics.render = { calls: info.render.calls, triangles: info.render.triangles };
(window as unknown as Record<string, unknown>).__metrics = metrics;

if (q.get('live') === '1') {
  const speed = Number(q.get('speed') ?? 0);
  let last = performance.now();
  const tick = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    for (const a of actors) a.c.update(dt, speed);
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
(window as unknown as Record<string, unknown>).__done = true;
