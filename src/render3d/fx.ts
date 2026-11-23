/**
 * Lightweight visual effects for walk mode: GPU point-sprite particles (water, steam, smoke,
 * fire, hearts, notes, Zzz, confetti, bubbles, sparkles) and animated canvas "channels" for TV /
 * computer / arcade screens. Everything is procedural.
 */
import * as THREE from 'three';

export type ParticleKind = 'water' | 'steam' | 'smoke' | 'fire' | 'heart' | 'note' | 'zzz' | 'confetti' | 'bubble' | 'spark' | 'crumb';

interface P {
  alive: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  life: number;
  size: number;
  grow: number;
  r: number;
  g: number;
  b: number;
  alpha: number;
  gravity: number;
  drag: number;
  floorY: number;
  wobble: number;
}

const MAX = 600;

function spriteTexture(kind: ParticleKind): THREE.Texture {
  const s = 64;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const c = cv.getContext('2d')!;
  c.clearRect(0, 0, s, s);
  const soft = (inner: number) => {
    const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(inner, 'rgba(255,255,255,0.6)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, s, s);
  };
  c.fillStyle = '#fff';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  switch (kind) {
    case 'water':
    case 'spark':
      soft(0.25);
      break;
    case 'steam':
    case 'smoke':
      soft(0.5);
      break;
    case 'fire': {
      const g = c.createRadialGradient(s / 2, s * 0.6, 0, s / 2, s * 0.55, s / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.35, 'rgba(255,255,255,0.7)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.beginPath();
      c.ellipse(s / 2, s * 0.55, s * 0.3, s * 0.45, 0, 0, Math.PI * 2);
      c.fill();
      break;
    }
    case 'heart':
      c.font = `${s * 0.85}px sans-serif`;
      c.beginPath();
      c.moveTo(s / 2, s * 0.85);
      c.bezierCurveTo(s * 0.05, s * 0.5, s * 0.15, s * 0.08, s / 2, s * 0.3);
      c.bezierCurveTo(s * 0.85, s * 0.08, s * 0.95, s * 0.5, s / 2, s * 0.85);
      c.fill();
      break;
    case 'note':
      c.font = `bold ${s * 0.8}px serif`;
      c.fillText('♪', s / 2, s / 2);
      break;
    case 'zzz':
      c.font = `bold ${s * 0.75}px sans-serif`;
      c.fillText('Z', s / 2, s / 2);
      break;
    case 'confetti':
    case 'crumb':
      c.fillRect(s * 0.2, s * 0.35, s * 0.6, s * 0.3);
      break;
    case 'bubble':
      c.strokeStyle = '#fff';
      c.lineWidth = 5;
      c.beginPath();
      c.arc(s / 2, s / 2, s * 0.38, 0, Math.PI * 2);
      c.stroke();
      c.beginPath();
      c.arc(s * 0.38, s * 0.36, s * 0.08, 0, Math.PI * 2);
      c.fill();
      break;
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

class Pool {
  readonly points: THREE.Points;
  private ps: P[] = [];
  private pos = new Float32Array(MAX * 3);
  private col = new Float32Array(MAX * 3);
  private alpha = new Float32Array(MAX);
  private size = new Float32Array(MAX);
  private geo = new THREE.BufferGeometry();
  private next = 0;
  active = 0;

  constructor(kind: ParticleKind, additive: boolean) {
    for (let i = 0; i < MAX; i++) {
      this.ps.push({ alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 0, life: 1, size: 0.1, grow: 0, r: 1, g: 1, b: 1, alpha: 1, gravity: 0, drag: 0, floorY: -99, wobble: 0 });
    }
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setDrawRange(0, 0);
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: spriteTexture(kind) }, scale: { value: 400 } },
      vertexShader: `
        attribute vec3 aColor; attribute float aAlpha; attribute float aSize;
        varying vec3 vColor; varying float vAlpha;
        uniform float scale;
        void main(){
          vColor = aColor; vAlpha = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * scale / max(0.05, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D map; varying vec3 vColor; varying float vAlpha;
        void main(){
          vec4 t = texture2D(map, gl_PointCoord);
          if (t.a * vAlpha < 0.01) discard;
          gl_FragColor = vec4(vColor * t.rgb, t.a * vAlpha);
        }`,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  setScale(px: number): void {
    (this.points.material as THREE.ShaderMaterial).uniforms.scale.value = px;
  }

  spawn(init: Partial<P>): void {
    const p = this.ps[this.next];
    this.next = (this.next + 1) % MAX;
    Object.assign(p, { alive: true, age: 0, vx: 0, vy: 0, vz: 0, grow: 0, r: 1, g: 1, b: 1, alpha: 1, gravity: 0, drag: 0, floorY: -99, wobble: 0, size: 0.1, life: 1 }, init);
  }

  update(dt: number): void {
    let n = 0;
    for (const p of this.ps) {
      if (!p.alive) continue;
      p.age += dt;
      if (p.age >= p.life) {
        p.alive = false;
        continue;
      }
      p.vy -= p.gravity * dt;
      const k = Math.exp(-p.drag * dt);
      p.vx *= k;
      p.vz *= k;
      if (p.drag) p.vy *= k;
      p.x += (p.vx + (p.wobble ? Math.sin(p.age * 6 + p.size * 50) * p.wobble : 0)) * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < p.floorY) {
        p.alive = false;
        continue;
      }
      const t = p.age / p.life;
      this.pos[n * 3] = p.x;
      this.pos[n * 3 + 1] = p.y;
      this.pos[n * 3 + 2] = p.z;
      this.col[n * 3] = p.r;
      this.col[n * 3 + 1] = p.g;
      this.col[n * 3 + 2] = p.b;
      this.alpha[n] = p.alpha * Math.min(1, t * 8) * (1 - t * t);
      this.size[n] = p.size * (1 + p.grow * t);
      n++;
    }
    this.active = n;
    this.geo.setDrawRange(0, n);
    for (const name of ['position', 'aColor', 'aAlpha', 'aSize']) (this.geo.getAttribute(name) as THREE.BufferAttribute).needsUpdate = true;
  }
}

const ADDITIVE: ParticleKind[] = ['fire', 'spark'];

/** All particle pools, added to the scene as one group. */
export class Particles {
  readonly group = new THREE.Group();
  private pools = new Map<ParticleKind, Pool>();

  private pool(kind: ParticleKind): Pool {
    let p = this.pools.get(kind);
    if (!p) {
      p = new Pool(kind, ADDITIVE.includes(kind));
      this.pools.set(kind, p);
      this.group.add(p.points);
    }
    return p;
  }

  setViewport(heightPx: number, fov: number): void {
    const s = heightPx / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2));
    for (const p of this.pools.values()) p.setScale(s);
  }

  emit(kind: ParticleKind, at: THREE.Vector3, opts: Partial<P> & { count?: number; spread?: number; jitter?: number } = {}): void {
    const pool = this.pool(kind);
    const n = opts.count ?? 1;
    const sp = opts.spread ?? 0;
    for (let i = 0; i < n; i++) {
      const base = PRESET[kind]();
      pool.spawn({
        ...base,
        ...opts,
        x: at.x + (Math.random() - 0.5) * sp,
        y: at.y + (Math.random() - 0.5) * sp * 0.3,
        z: at.z + (Math.random() - 0.5) * sp,
        vx: (opts.vx ?? base.vx ?? 0) + (Math.random() - 0.5) * (opts.jitter ?? base.jitter ?? 0),
        vz: (opts.vz ?? base.vz ?? 0) + (Math.random() - 0.5) * (opts.jitter ?? base.jitter ?? 0),
        vy: (opts.vy ?? base.vy ?? 0) + (Math.random() - 0.5) * (opts.jitter ?? base.jitter ?? 0) * 0.5,
      });
    }
  }

  update(dt: number): void {
    for (const p of this.pools.values()) p.update(dt);
  }

  clear(): void {
    for (const p of this.pools.values()) {
      p.update(1e6);
    }
  }
}

type Preset = Partial<P> & { jitter?: number };
const rgb = (hex: string): { r: number; g: number; b: number } => {
  const c = new THREE.Color(hex);
  return { r: c.r, g: c.g, b: c.b };
};
const CONFETTI = ['#ff5d5d', '#ffc93c', '#4cd3c2', '#5b8cff', '#c77dff', '#7bd389'];
const PRESET: Record<ParticleKind, () => Preset> = {
  water: () => ({ ...rgb('#cfe9ff'), size: 0.035, life: 1.2, gravity: 9.8, vy: -0.3, jitter: 0.15, alpha: 0.85 }),
  steam: () => ({ ...rgb('#ffffff'), size: 0.12, grow: 2.5, life: 2.2, vy: 0.35, jitter: 0.12, alpha: 0.35, drag: 0.6, wobble: 0.08 }),
  smoke: () => ({ ...rgb('#8a8a8a'), size: 0.18, grow: 3, life: 3.2, vy: 0.45, jitter: 0.12, alpha: 0.3, drag: 0.3, wobble: 0.1 }),
  fire: () => {
    const t = Math.random();
    return { r: 1, g: 0.45 + t * 0.4, b: 0.12 + t * 0.15, size: 0.12, grow: -0.7, life: 0.55 + Math.random() * 0.4, vy: 0.55, jitter: 0.12, alpha: 0.9, wobble: 0.15 };
  },
  heart: () => ({ ...rgb('#ff5b7f'), size: 0.12, life: 1.6, vy: 0.55, jitter: 0.3, wobble: 0.2 }),
  note: () => ({ ...(Math.random() < 0.5 ? rgb('#ffd34d') : rgb('#7fd6ff')), size: 0.14, life: 1.8, vy: 0.4, jitter: 0.25, wobble: 0.25 }),
  zzz: () => ({ ...rgb('#cfe0ff'), size: 0.12, grow: 0.8, life: 2.4, vy: 0.25, vx: 0.08, jitter: 0.05, wobble: 0.15 }),
  confetti: () => ({ ...rgb(CONFETTI[Math.floor(Math.random() * CONFETTI.length)]), size: 0.06, life: 2.6, gravity: 3.2, vy: 3, jitter: 3, drag: 1.2 }),
  bubble: () => ({ ...rgb('#e8f7ff'), size: 0.05, life: 2, vy: 0.3, jitter: 0.08, wobble: 0.1, alpha: 0.8 }),
  spark: () => ({ ...rgb('#ffe9a6'), size: 0.07, life: 0.8, vy: 0.6, jitter: 1.2, gravity: 1.5 }),
  crumb: () => ({ ...rgb('#d9a25f'), size: 0.03, life: 0.9, gravity: 6, vy: 0.5, jitter: 0.8 }),
};

/* ------------------------------------------------------------------------------------------ */
/* Animated screens                                                                             */
/* ------------------------------------------------------------------------------------------ */

export type Channel = 'nature' | 'cartoon' | 'sports' | 'news' | 'space' | 'music' | 'game' | 'desktop' | 'arcade';
export const TV_CHANNELS: Array<{ id: Channel; name: string }> = [
  { id: 'nature', name: 'טבע' },
  { id: 'cartoon', name: 'סרטים מצוירים' },
  { id: 'sports', name: 'ספורט' },
  { id: 'news', name: 'חדשות' },
  { id: 'space', name: 'חלל' },
  { id: 'music', name: 'קליפים' },
];

interface Screen {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  tex: THREE.CanvasTexture;
  mat: THREE.MeshBasicMaterial;
  users: number;
  t: number;
  acc: number;
  state: Record<string, number>;
}

const W = 256;
const H = 160;

/** Shared animated textures, one per channel, redrawn ~20×/s while in use. */
export class Screens {
  private screens = new Map<Channel, Screen>();

  material(ch: Channel): THREE.MeshBasicMaterial {
    let s = this.screens.get(ch);
    if (!s) {
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d')!;
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
      s = { canvas, ctx, tex, mat, users: 0, t: Math.random() * 10, acc: 1, state: {} };
      this.screens.set(ch, s);
    }
    s.users++;
    return s.mat;
  }

  release(ch: Channel): void {
    const s = this.screens.get(ch);
    if (s) s.users = Math.max(0, s.users - 1);
  }

  update(dt: number): void {
    for (const [ch, s] of this.screens) {
      if (!s.users) continue;
      s.t += dt;
      s.acc += dt;
      if (s.acc < 0.05) continue;
      s.acc = 0;
      draw(ch, s.ctx, s.t, s.state);
      s.tex.needsUpdate = true;
    }
  }
}

function draw(ch: Channel, c: CanvasRenderingContext2D, t: number, st: Record<string, number>): void {
  switch (ch) {
    case 'nature': {
      const g = c.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#5aa7e8');
      g.addColorStop(1, '#cfe8f7');
      c.fillStyle = g;
      c.fillRect(0, 0, W, H);
      c.fillStyle = '#fff4b0';
      c.beginPath();
      c.arc(200, 34, 16, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = 'rgba(255,255,255,0.9)';
      for (let i = 0; i < 4; i++) {
        const x = ((t * (8 + i * 3) + i * 80) % (W + 80)) - 40;
        const y = 22 + i * 13;
        c.beginPath();
        c.ellipse(x, y, 26, 8, 0, 0, Math.PI * 2);
        c.ellipse(x + 14, y - 5, 16, 8, 0, 0, Math.PI * 2);
        c.fill();
      }
      for (let l = 0; l < 3; l++) {
        c.fillStyle = ['#7fae63', '#5e9150', '#3f7340'][l];
        c.beginPath();
        c.moveTo(0, H);
        for (let x = 0; x <= W; x += 8) c.lineTo(x, 95 + l * 18 - Math.sin(x * 0.02 + l * 2 + t * 0.05 * (l + 1)) * 14);
        c.lineTo(W, H);
        c.fill();
      }
      // birds
      c.strokeStyle = '#223';
      c.lineWidth = 1.5;
      for (let i = 0; i < 3; i++) {
        const x = (t * 30 + i * 40) % (W + 40) - 20;
        const y = 50 + Math.sin(t * 2 + i) * 6 + i * 6;
        const f = Math.sin(t * 10 + i) * 4;
        c.beginPath();
        c.moveTo(x - 6, y - f);
        c.lineTo(x, y);
        c.lineTo(x + 6, y - f);
        c.stroke();
      }
      break;
    }
    case 'cartoon': {
      c.fillStyle = '#ffe28a';
      c.fillRect(0, 0, W, H);
      c.fillStyle = '#8fd16a';
      c.fillRect(0, 120, W, 40);
      const bx = 60 + ((t * 50) % 140);
      const by = 120 - Math.abs(Math.sin(t * 4)) * 60;
      c.fillStyle = '#ff6b6b';
      c.beginPath();
      c.ellipse(bx, by - 22, 22, 22 * (1 - 0.15 * Math.max(0, Math.cos(t * 8))), 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#fff';
      c.beginPath();
      c.arc(bx - 7, by - 27, 6, 0, Math.PI * 2);
      c.arc(bx + 7, by - 27, 6, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#222';
      c.beginPath();
      c.arc(bx - 6, by - 26, 2.5, 0, Math.PI * 2);
      c.arc(bx + 8, by - 26, 2.5, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = '#222';
      c.lineWidth = 2;
      c.beginPath();
      c.arc(bx, by - 18, 7, 0.2, Math.PI - 0.2);
      c.stroke();
      // a blue friend
      const fx = 210 - ((t * 30) % 120);
      c.fillStyle = '#5b8cff';
      c.fillRect(fx - 14, 92 + Math.sin(t * 6) * 3, 28, 28);
      c.fillStyle = '#fff';
      c.fillRect(fx - 8, 98, 6, 6);
      c.fillRect(fx + 3, 98, 6, 6);
      break;
    }
    case 'sports': {
      c.fillStyle = '#2f8a3a';
      c.fillRect(0, 0, W, H);
      for (let i = 0; i < 8; i++) {
        c.fillStyle = i % 2 ? '#2f8a3a' : '#34953f';
        c.fillRect(i * 32, 0, 32, H);
      }
      c.strokeStyle = '#e8f5e8';
      c.lineWidth = 2;
      c.strokeRect(8, 18, W - 16, H - 26);
      c.beginPath();
      c.moveTo(W / 2, 18);
      c.lineTo(W / 2, H - 8);
      c.stroke();
      c.beginPath();
      c.arc(W / 2, (H + 10) / 2, 18, 0, Math.PI * 2);
      c.stroke();
      const ballX = W / 2 + Math.sin(t * 0.9) * 90;
      const ballY = H / 2 + Math.sin(t * 1.7) * 40;
      for (let i = 0; i < 10; i++) {
        const team = i < 5;
        const px = ballX + Math.sin(t * 0.7 + i * 1.7) * (30 + i * 6) + (team ? -10 : 10);
        const py = ballY + Math.cos(t * 0.9 + i * 2.3) * (20 + i * 3);
        c.fillStyle = team ? '#ffdf3d' : '#e8453c';
        c.beginPath();
        c.arc(px, py, 4, 0, Math.PI * 2);
        c.fill();
      }
      c.fillStyle = '#fff';
      c.beginPath();
      c.arc(ballX, ballY, 3, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = 'rgba(0,0,0,0.6)';
      c.fillRect(6, 3, 74, 14);
      c.fillStyle = '#fff';
      c.font = 'bold 10px sans-serif';
      c.fillText(`${Math.floor(t / 23) % 4} - ${Math.floor(t / 37) % 3}  ${Math.floor(t) % 90}'`, 10, 13);
      break;
    }
    case 'news': {
      c.fillStyle = '#123a6b';
      c.fillRect(0, 0, W, H);
      c.fillStyle = '#1d5299';
      c.fillRect(0, 0, W, 110);
      c.fillStyle = '#2b6cc4';
      for (let i = 0; i < 6; i++) c.fillRect(150 + i * 16, 20, 10, 70);
      // anchor
      c.fillStyle = '#2a2a33';
      c.beginPath();
      c.ellipse(85, 120, 42, 40, 0, Math.PI, 0);
      c.fill();
      c.fillStyle = '#e3b28f';
      c.beginPath();
      c.arc(85, 58, 20, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#3a2618';
      c.beginPath();
      c.arc(85, 52, 21, Math.PI, 0);
      c.fill();
      c.fillStyle = '#7a3b2a';
      c.fillRect(80 - Math.abs(Math.sin(t * 9)) * 3, 66, 10 + Math.abs(Math.sin(t * 9)) * 6, 2 + Math.abs(Math.sin(t * 9)) * 2);
      c.fillStyle = '#c8102e';
      c.fillRect(0, 118, W, 18);
      c.fillStyle = '#fff';
      c.font = 'bold 12px sans-serif';
      c.fillText('מבזק', 8, 131);
      c.fillStyle = '#f4f4f4';
      c.fillRect(0, 136, W, 24);
      c.fillStyle = '#111';
      c.font = '12px sans-serif';
      const msg = 'חדשות הבית: הבית החדש נבנה בהצלחה • מזג האוויר: נעים ושמשי • הכלב קיבל חטיף • ';
      const w = c.measureText(msg).width;
      const off = (t * 40) % w;
      c.fillText(msg + msg, -w + off, 153);
      break;
    }
    case 'space': {
      c.fillStyle = '#05060f';
      c.fillRect(0, 0, W, H);
      if (!st.init) {
        st.init = 1;
      }
      for (let i = 0; i < 70; i++) {
        const sx = (i * 73.1) % W;
        const sy = (i * 41.7) % H;
        const z = ((i * 13) % 7) + 1;
        const x = (sx - t * z * 6 + W * 10) % W;
        c.fillStyle = `rgba(255,255,255,${0.3 + z / 10})`;
        c.fillRect(x, sy, z > 5 ? 2 : 1, z > 5 ? 2 : 1);
      }
      const g = c.createRadialGradient(150, 80, 5, 160, 90, 50);
      g.addColorStop(0, '#f6c27a');
      g.addColorStop(1, '#a5502e');
      c.fillStyle = g;
      c.beginPath();
      c.arc(160, 90, 45, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = 'rgba(240,220,180,0.7)';
      c.lineWidth = 3;
      c.beginPath();
      c.ellipse(160, 90, 75, 14, -0.3, 0, Math.PI * 2);
      c.stroke();
      // rocket
      const rx = (t * 25) % (W + 60) - 30;
      c.fillStyle = '#eee';
      c.fillRect(rx, 40, 18, 7);
      c.fillStyle = '#ff7b3a';
      c.fillRect(rx - 6 - Math.random() * 4, 41, 6, 5);
      break;
    }
    case 'music': {
      const hue = (t * 40) % 360;
      c.fillStyle = `hsl(${hue},55%,18%)`;
      c.fillRect(0, 0, W, H);
      for (let i = 0; i < 24; i++) {
        const h = (0.3 + 0.7 * Math.abs(Math.sin(t * 3 + i * 0.7) * Math.cos(t * 1.3 + i * 0.3))) * 110;
        c.fillStyle = `hsl(${(hue + i * 12) % 360},80%,60%)`;
        c.fillRect(8 + i * 10, H - 12 - h, 7, h);
      }
      c.fillStyle = 'rgba(255,255,255,0.85)';
      c.beginPath();
      c.arc(W / 2 + Math.sin(t) * 60, 50 + Math.cos(t * 1.3) * 18, 10 + Math.abs(Math.sin(t * 4)) * 6, 0, Math.PI * 2);
      c.fill();
      break;
    }
    case 'game':
    case 'arcade': {
      // auto-playing snake on a grid
      c.fillStyle = ch === 'arcade' ? '#0a0a1a' : '#111';
      c.fillRect(0, 0, W, H);
      const cell = 8;
      const cols = W / cell;
      const rows = (H - 16) / cell;
      const len = 6 + (Math.floor(t / 3) % 10);
      for (let i = 0; i < len; i++) {
        const tt = t * 8 - i;
        const x = Math.floor((Math.sin(tt * 0.13) * 0.45 + 0.5) * (cols - 1));
        const y = Math.floor((Math.sin(tt * 0.21 + 1) * 0.45 + 0.5) * (rows - 1));
        c.fillStyle = i === 0 ? '#9cff6a' : '#3bd16f';
        c.fillRect(x * cell + 1, 16 + y * cell + 1, cell - 2, cell - 2);
      }
      c.fillStyle = '#ff4d6d';
      const fx = Math.floor(((Math.floor(t / 3) * 37) % (cols - 2)) + 1);
      const fy = Math.floor(((Math.floor(t / 3) * 23) % (rows - 2)) + 1);
      c.fillRect(fx * cell + 1, 16 + fy * cell + 1, cell - 2, cell - 2);
      c.fillStyle = '#ffd34d';
      c.font = 'bold 11px monospace';
      c.fillText(`SCORE ${(Math.floor(t / 3) * 10).toString().padStart(5, '0')}`, 6, 12);
      // ghosts for arcade
      if (ch === 'arcade') {
        for (let i = 0; i < 3; i++) {
          const gx = (t * 40 + i * 70) % W;
          c.fillStyle = ['#ff5d5d', '#5df2ff', '#ffb35d'][i];
          c.beginPath();
          c.arc(gx, 60 + i * 30, 7, Math.PI, 0);
          c.fillRect(gx - 7, 60 + i * 30, 14, 6);
          c.fill();
        }
      }
      break;
    }
    case 'desktop': {
      const g = c.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, '#3a6fd8');
      g.addColorStop(1, '#8a5bd8');
      c.fillStyle = g;
      c.fillRect(0, 0, W, H);
      c.fillStyle = '#f7f7f7';
      c.fillRect(20, 14, 216, 124);
      c.fillStyle = '#d9dde3';
      c.fillRect(20, 14, 216, 12);
      for (const [x, col] of [[28, '#ff5f57'], [38, '#febc2e'], [48, '#28c840']] as const) {
        c.fillStyle = col;
        c.beginPath();
        c.arc(x, 20, 3, 0, Math.PI * 2);
        c.fill();
      }
      const lines = Math.floor(t * 3) % 14;
      for (let i = 0; i < lines; i++) {
        c.fillStyle = ['#7a7f87', '#3b82f6', '#a855f7', '#7a7f87'][i % 4];
        c.fillRect(30 + (i % 3) * 10, 32 + i * 7.5, 60 + ((i * 37) % 110), 3.5);
      }
      if (Math.floor(t * 2) % 2) {
        c.fillStyle = '#111';
        c.fillRect(30 + 60 + ((lines * 37) % 110), 32 + lines * 7.5 - 1, 2, 6);
      }
      c.fillStyle = 'rgba(255,255,255,0.8)';
      c.fillRect(0, H - 10, W, 10);
      break;
    }
  }
}
