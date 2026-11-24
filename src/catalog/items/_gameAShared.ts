import * as THREE from 'three';
import { M } from '../kit';

/** Canvas-drawn faces (banners, signs) for team A's items; plain paint when there is no DOM (tests). */
const cache = new Map<string, THREE.Material>();

export function canvasMaterial(
  key: string,
  w: number,
  h: number,
  draw: (g: CanvasRenderingContext2D, w: number, h: number) => void,
  fallback: string,
  glow = 0.25,
): THREE.Material {
  const hit = cache.get(key);
  if (hit) return hit;
  let mat: THREE.Material;
  if (typeof document === 'undefined') mat = M.paint(fallback);
  else {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    if (!g) mat = M.paint(fallback);
    else {
      draw(g, w, h);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, emissive: new THREE.Color('#ffffff'), emissiveMap: tex, emissiveIntensity: glow });
    }
  }
  cache.set(key, mat);
  return mat;
}

/** checkerboard on part of a canvas */
export function checker(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, cell: number): void {
  for (let i = 0; i * cell < w; i++) {
    for (let j = 0; j * cell < h; j++) {
      g.fillStyle = (i + j) % 2 ? '#111214' : '#f4f4f2';
      g.fillRect(x + i * cell, y + j * cell, Math.min(cell, w - i * cell), Math.min(cell, h - j * cell));
    }
  }
}

/** big centred Hebrew text */
export function title(g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color = '#ffffff', weight = 800): void {
  g.save();
  g.direction = 'rtl';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = color;
  g.font = `${weight} ${size}px system-ui, "Segoe UI", Arial, sans-serif`;
  g.fillText(text, x, y);
  g.restore();
}

export const EMOJI_FONT = 'system-ui, "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
