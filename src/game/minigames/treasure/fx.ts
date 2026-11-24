import * as THREE from 'three';

/**
 * Small runtime effects shared by team E's games (browser only: call from `start()`):
 * text/emoji sprites drawn on a canvas and a firework show.
 */

/** A camera-facing sign with emoji / Hebrew text, redrawable. */
export class TextSprite {
  readonly sprite: THREE.Sprite;
  private canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private tex: THREE.CanvasTexture;
  private last = '';

  constructor(
    private w = 256,
    private h = 96,
    worldHeight = 0.5,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = w;
    this.canvas.height = h;
    this.g = this.canvas.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: this.tex, transparent: true, depthWrite: false });
    this.sprite = new THREE.Sprite(mat);
    this.sprite.scale.set((worldHeight * w) / h, worldHeight, 1);
    this.sprite.renderOrder = 10;
  }

  /**
   * Draw a rounded bubble with text. `bar` (0..1) adds a small bar at the bottom (patience…).
   * Skips the redraw when nothing changed.
   */
  draw(text: string, opts: { bg?: string; fg?: string; bar?: number | null; barColor?: string; font?: number; bubble?: boolean } = {}): void {
    const key = `${text}|${opts.bg}|${opts.bar == null ? '' : Math.round(opts.bar * 20)}|${opts.barColor}`;
    if (key === this.last) return;
    this.last = key;
    const { g, w, h } = this;
    g.clearRect(0, 0, w, h);
    if (opts.bubble !== false) {
      g.fillStyle = opts.bg ?? 'rgba(255,255,255,0.94)';
      const r = 18;
      const bh = h - (opts.bubble === undefined ? 14 : 0);
      g.beginPath();
      g.moveTo(r, 2);
      g.lineTo(w - r, 2);
      g.quadraticCurveTo(w - 2, 2, w - 2, r);
      g.lineTo(w - 2, bh - r);
      g.quadraticCurveTo(w - 2, bh, w - r, bh);
      g.lineTo(w / 2 + 12, bh);
      g.lineTo(w / 2, h - 1);
      g.lineTo(w / 2 - 12, bh);
      g.lineTo(r, bh);
      g.quadraticCurveTo(2, bh, 2, bh - r);
      g.lineTo(2, r);
      g.quadraticCurveTo(2, 2, r, 2);
      g.fill();
      g.strokeStyle = 'rgba(60,45,30,0.35)';
      g.lineWidth = 3;
      g.stroke();
    }
    g.fillStyle = opts.fg ?? '#3a2a1a';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.direction = 'rtl';
    let px = opts.font ?? Math.round(h * 0.42);
    g.font = `700 ${px}px system-ui, "Segoe UI Emoji", "Noto Color Emoji", Arial, sans-serif`;
    const tw = g.measureText(text).width;
    if (tw > w * 0.9) {
      px = Math.floor((px * w * 0.9) / tw);
      g.font = `700 ${px}px system-ui, "Segoe UI Emoji", "Noto Color Emoji", Arial, sans-serif`;
    }
    const barH = opts.bar != null ? 10 : 0;
    g.fillText(text, w / 2, (h - 14 - barH) / 2 + 3);
    if (opts.bar != null) {
      const y = h - 14 - barH - 8;
      g.fillStyle = 'rgba(0,0,0,0.12)';
      g.fillRect(24, y, w - 48, barH);
      g.fillStyle = opts.barColor ?? '#6c9a2c';
      g.fillRect(24, y, (w - 48) * Math.max(0, Math.min(1, opts.bar)), barH);
    }
    this.tex.needsUpdate = true;
  }

  dispose(): void {
    this.tex.dispose();
    (this.sprite.material as THREE.SpriteMaterial).dispose();
  }
}

interface Spark {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  r: number;
  g: number;
  b: number;
  rocket: boolean;
}

let sparkTex: THREE.Texture | null = null;
/** a soft round dot with a bright core */
function sparkTexture(): THREE.Texture {
  if (sparkTex) return sparkTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.9)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  sparkTex = new THREE.CanvasTexture(c);
  return sparkTex;
}

const PALETTE = ['#ff5d5d', '#ffc93c', '#4cd3c2', '#5b8cff', '#c77dff', '#7bd389', '#ffffff', '#ff9a3c'];

/** Rockets that rise and burst into coloured spheres of sparks (one Points object). */
export class Fireworks {
  readonly points: THREE.Points;
  private sparks: Spark[] = [];
  private pos: Float32Array;
  private col: Float32Array;
  private geo: THREE.BufferGeometry;
  private mat: THREE.PointsMaterial;
  onBurst: (() => void) | null = null;

  constructor(private max = 900) {
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.geo.setDrawRange(0, 0);
    this.mat = new THREE.PointsMaterial({ size: 0.55, vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: true, map: sparkTexture(), alphaTest: 0.02 });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 12;
  }

  /** a rocket from (x, y, z) bursting `height` meters up */
  launch(x: number, y: number, z: number, height = 14, random: () => number = Math.random): void {
    const c = new THREE.Color(PALETTE[Math.floor(random() * PALETTE.length)]);
    const t = Math.sqrt((2 * height) / 9.8);
    this.add({ x, y, z, vx: (random() - 0.5) * 2, vy: 9.8 * t, vz: (random() - 0.5) * 2, life: t, max: t, r: 1, g: 0.85, b: 0.5, rocket: true });
    void c;
  }

  private add(s: Spark): void {
    if (this.sparks.length >= this.max) return;
    this.sparks.push(s);
  }

  private burst(s: Spark): void {
    const c = new THREE.Color(PALETTE[Math.floor(Math.random() * PALETTE.length)]);
    const c2 = new THREE.Color(PALETTE[Math.floor(Math.random() * PALETTE.length)]);
    const n = 90;
    const speed = 5 + Math.random() * 3;
    for (let i = 0; i < n; i++) {
      // even directions on a sphere
      const yv = 1 - (2 * (i + 0.5)) / n;
      const r = Math.sqrt(1 - yv * yv);
      const a = i * 2.399963;
      const k = i % 3 === 0 ? c2 : c;
      const life = 1.2 + Math.random() * 0.6;
      this.add({ x: s.x, y: s.y, z: s.z, vx: Math.cos(a) * r * speed, vy: yv * speed, vz: Math.sin(a) * r * speed, life, max: life, r: k.r, g: k.g, b: k.b, rocket: false });
    }
    this.onBurst?.();
  }

  update(dt: number): void {
    const list = this.sparks;
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      s.life -= dt;
      if (s.life <= 0) {
        if (s.rocket) this.burst(s);
        continue;
      }
      s.vy -= (s.rocket ? 9.8 : 4.5) * dt;
      const drag = s.rocket ? 1 : Math.max(0, 1 - 1.6 * dt);
      s.vx *= drag;
      s.vz *= drag;
      if (!s.rocket) s.vy *= drag;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;
      list[n++] = s;
    }
    list.length = n;
    const count = Math.min(n, this.max);
    for (let i = 0; i < count; i++) {
      const s = list[i];
      const f = s.rocket ? 1 : Math.min(1, s.life / s.max + 0.15);
      this.pos[i * 3] = s.x;
      this.pos[i * 3 + 1] = s.y;
      this.pos[i * 3 + 2] = s.z;
      this.col[i * 3] = s.r * f;
      this.col[i * 3 + 1] = s.g * f;
      this.col[i * 3 + 2] = s.b * f;
    }
    this.geo.setDrawRange(0, count);
    (this.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }

  get busy(): boolean {
    return this.sparks.length > 0;
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}

/** A DOM card pinned to the top of the screen (riddles, orders). Removed by `dispose()`. */
export class ScreenCard {
  readonly el: HTMLDivElement;
  constructor(style: Partial<CSSStyleDeclaration> = {}) {
    this.el = document.createElement('div');
    Object.assign(this.el.style, {
      position: 'fixed',
      top: '62px',
      left: '50%',
      transform: 'translateX(-50%)',
      maxWidth: 'min(560px, 78vw)',
      padding: '10px 20px 12px',
      borderRadius: '14px',
      background: 'linear-gradient(180deg, #fbf0d0 0%, #ecd49c 100%)',
      color: '#4a3218',
      border: '2px solid #b8862d',
      boxShadow: '0 6px 22px rgba(0,0,0,0.28)',
      direction: 'rtl',
      textAlign: 'center',
      font: '600 18px/1.45 system-ui, "Segoe UI", Arial, sans-serif',
      pointerEvents: 'none',
      zIndex: '29',
      transition: 'opacity 0.3s, transform 0.3s',
      ...style,
    } as Partial<CSSStyleDeclaration>);
    document.body.appendChild(this.el);
  }

  set(html: string): void {
    if (this.el.innerHTML !== html) this.el.innerHTML = html;
  }

  show(on: boolean): void {
    this.el.style.opacity = on ? '1' : '0';
  }

  /** a quick "pop" to draw the eye to new content */
  pulse(): void {
    this.el.animate([{ transform: 'translateX(-50%) scale(1.08)' }, { transform: 'translateX(-50%) scale(1)' }], { duration: 380, easing: 'ease-out' });
  }

  dispose(): void {
    this.el.remove();
  }
}

export const escapeHtml = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
