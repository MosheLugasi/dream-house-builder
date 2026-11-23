import * as THREE from 'three';
import type { CharacterLook } from '../characterTypes';
import { SLOTS, type Slot } from './builder';

interface Entry {
  mat: THREE.MeshStandardMaterial;
  refs: number;
}
const cache = new Map<string, Entry>();
let hairTex: THREE.Texture | null | undefined;
let clothTex: THREE.Texture | null | undefined;

const hasDom = () => typeof document !== 'undefined';

/** Streaky gray-scale texture: strands run along v. Multiplies the hair color. */
function hairTexture(): THREE.Texture | null {
  if (hairTex !== undefined) return hairTex;
  if (!hasDom()) return (hairTex = null);
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d');
  if (!g) return (hairTex = null);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.fillStyle = '#d8d8d8';
  g.fillRect(0, 0, c.width, c.height);
  // broad locks first, then fine strands
  for (const [count, wMin, wMax, alpha] of [[26, 6, 22, 0.16], [150, 1, 3, 0.2]] as number[][]) {
    for (let i = 0; i < count; i++) {
      const x = rnd() * c.width;
      const w = wMin + rnd() * (wMax - wMin);
      const light = rnd() > 0.5;
      g.fillStyle = light ? `rgba(255,255,255,${alpha * (0.5 + rnd())})` : `rgba(40,40,40,${alpha * (0.5 + rnd())})`;
      g.fillRect(x, 0, w, c.height);
      if (x + w > c.width) g.fillRect(x - c.width, 0, w, c.height);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return (hairTex = t);
}

/** Fine woven bump for fabric. */
function clothTexture(): THREE.Texture | null {
  if (clothTex !== undefined) return clothTex;
  if (!hasDom()) return (clothTex = null);
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (!g) return (clothTex = null);
  const img = g.createImageData(64, 64);
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const weave = (Math.sin((x / 64) * Math.PI * 2 * 16) * 0.5 + 0.5) * (Math.sin((y / 64) * Math.PI * 2 * 16) * 0.5 + 0.5);
      const v = 150 + weave * 60 + rnd() * 40;
      img.data.set([v, v, v, 255], (y * 64 + x) * 4);
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4, 4);
  return (clothTex = t);
}

export const DEFAULT_EYES = '#5a3a22';

export function slotColor(slot: Slot, look: CharacterLook): string {
  switch (slot) {
    case 'skin':
      return look.skin;
    case 'top':
      return look.top;
    case 'bottom':
      return look.bottom;
    case 'shoes':
      return look.shoes;
    case 'hair':
      return look.hair;
    case 'iris':
      return look.eyes ?? DEFAULT_EYES;
    case 'accent':
      return look.accessoryColor ?? accentFor(look);
    default:
      return '#ffffff';
  }
}

/** A colour for the cap / backpack / bow that goes with the outfit. */
export function accentFor(look: CharacterLook): string {
  const c = new THREE.Color(look.top);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  // a complementary-ish, saturated hue; neutral tops get a cheerful red
  if (hsl.s < 0.15) return '#d9483b';
  const out = new THREE.Color().setHSL((hsl.h + 0.45) % 1, Math.min(0.75, hsl.s + 0.1), THREE.MathUtils.clamp(hsl.l, 0.38, 0.55));
  return '#' + out.getHexString();
}

function create(slot: Slot, color: string): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color, vertexColors: true, metalness: 0 });
  m.name = `character-${slot}`;
  switch (slot) {
    case 'skin':
      m.roughness = 0.56;
      break;
    case 'top':
    case 'bottom':
      m.roughness = 0.93;
      m.side = THREE.DoubleSide;
      m.bumpMap = clothTexture();
      m.bumpScale = 0.25;
      break;
    case 'shoes':
      m.roughness = 0.62;
      break;
    case 'hair':
      m.roughness = 0.48;
      m.side = THREE.DoubleSide;
      m.map = hairTexture();
      break;
    case 'eye':
      m.roughness = 0.1;
      m.envMapIntensity = 1.3;
      break;
    case 'iris':
      m.roughness = 0.16;
      break;
    case 'detail':
      m.roughness = 0.78;
      m.side = THREE.DoubleSide;
      break;
    case 'accent':
      m.roughness = 0.82;
      m.side = THREE.DoubleSide;
      break;
  }
  return m;
}

/** One material per slot for a look (shared between characters with the same colours). */
export function acquireMaterials(look: CharacterLook): THREE.MeshStandardMaterial[] {
  return SLOTS.map((slot) => {
    const key = `${slot}|${slotColor(slot, look)}`;
    let e = cache.get(key);
    if (!e) {
      e = { mat: create(slot, slotColor(slot, look)), refs: 0 };
      cache.set(key, e);
    }
    e.refs++;
    return e.mat;
  });
}

export function releaseMaterials(look: CharacterLook): void {
  for (const slot of SLOTS) {
    const key = `${slot}|${slotColor(slot, look)}`;
    const e = cache.get(key);
    if (!e) continue;
    if (--e.refs <= 0) {
      e.mat.dispose();
      cache.delete(key);
    }
  }
}
