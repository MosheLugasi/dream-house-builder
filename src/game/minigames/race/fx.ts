import * as THREE from 'three';

/** Small visual helpers shared by team A's games (labels floating in the world, glowing rings). */

const owned: Array<{ dispose(): void }> = [];

/** A camera-facing text label (canvas sprite). Height in metres. */
export function textSprite(text: string, opts: { color?: string; bg?: string; height?: number; font?: number } = {}): THREE.Sprite {
  const font = opts.font ?? 64;
  const c = document.createElement('canvas');
  const g = c.getContext('2d')!;
  const fontCss = `800 ${font}px system-ui, "Segoe UI", "Segoe UI Emoji", "Noto Color Emoji", Arial, sans-serif`;
  g.font = fontCss;
  const w = Math.ceil(g.measureText(text).width) + font;
  c.width = w;
  c.height = Math.round(font * 1.5);
  const ctx = c.getContext('2d')!;
  if (opts.bg) {
    ctx.fillStyle = opts.bg;
    const r = c.height / 2;
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.lineTo(w - r, 0);
    ctx.arc(w - r, r, r, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(r, c.height);
    ctx.arc(r, r, r, Math.PI / 2, (Math.PI * 3) / 2);
    ctx.fill();
  }
  ctx.font = fontCss; // resizing the canvas reset the context
  ctx.direction = 'rtl';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = opts.color ?? '#ffffff';
  ctx.fillText(text, w / 2, c.height / 2 + font * 0.04);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true });
  owned.push(tex, mat);
  const s = new THREE.Sprite(mat);
  const h = opts.height ?? 0.8;
  s.scale.set((h * w) / c.height, h, 1);
  s.renderOrder = 5;
  return s;
}

/** A flat glowing ring lying on the ground (pick-up / drop-off zones). */
export function groundRing(radius: number, color: string): THREE.Mesh {
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  owned.push(mat);
  const m = new THREE.Mesh(new THREE.RingGeometry(radius * 0.82, radius, 40), mat);
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 4;
  return m;
}

/** A see-through glowing curtain (the next race gate). */
export function curtain(width: number, height: number, color: string): THREE.Mesh {
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  owned.push(mat);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
  m.renderOrder = 4;
  return m;
}

/** an unlit material the game recolours (start lights) */
export function basic(color: string): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ color });
  owned.push(m);
  return m;
}

/** free the textures and materials made by these helpers (geometry goes with ctx.root) */
export function disposeFx(): void {
  for (const o of owned.splice(0)) o.dispose();
}
