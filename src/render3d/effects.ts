import * as THREE from 'three';
import { applyShaderPatches } from '../materials/shaderPatches';

/** Shared clock for wind and water so that every material animates in sync. */
export const windTime = { value: 0 };
export const windStrength = { value: 1 };

/**
 * Makes a foliage material sway in the wind. Geometry is expected in item-local coordinates
 * (origin on the ground), so the displacement grows with the vertex's height above the item's base.
 */
export function addWind<T extends THREE.Material>(mat: T, amount = 1): T {
  mat.onBeforeCompile = (shader) => {
    applyShaderPatches(shader);
    shader.uniforms.uWindTime = windTime;
    shader.uniforms.uWindStrength = windStrength;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWindTime;\nuniform float uWindStrength;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          vec4 windWorld = modelMatrix * vec4(position, 1.0);
          float windH = max(position.y - 0.25, 0.0);
          float windA = sin(uWindTime * 1.5 + windWorld.x * 0.31 + windWorld.z * 0.23) * 0.6 + sin(uWindTime * 2.9 + windWorld.x * 0.83 + position.y) * 0.4;
          float windB = cos(uWindTime * 1.2 + windWorld.z * 0.37) * 0.6 + sin(uWindTime * 3.3 + windWorld.z * 0.71 + position.y * 1.3) * 0.4;
          float windAmp = ${(0.014 * amount).toFixed(4)} * windH * uWindStrength;
          transformed.x += windA * windAmp;
          transformed.z += windB * windAmp * 0.7;
        }`,
      );
  };
  mat.customProgramCacheKey = () => `wind-${amount}`;
  return mat;
}

let ripple: THREE.CanvasTexture | null = null;

/** Tileable ripple normal map made of a few plane waves with integer wave vectors. */
function rippleTexture(): THREE.CanvasTexture {
  if (ripple) return ripple;
  const n = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = n;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(n, n);
  const waves: [number, number, number, number][] = [
    [1, 2, 1.0, 0.3],
    [-2, 1, 0.8, 1.7],
    [3, 1, 0.5, 4.1],
    [2, -3, 0.45, 2.6],
    [-4, -2, 0.3, 5.2],
    [5, 3, 0.2, 0.9],
    [1, -6, 0.16, 3.3],
  ];
  const k = (2 * Math.PI) / n;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      let dx = 0;
      let dy = 0;
      for (const [kx, ky, a, ph] of waves) {
        const c = Math.cos((kx * x + ky * y) * k + ph) * a;
        dx += c * kx;
        dy += c * ky;
      }
      const s = 0.09;
      const nx = -dx * s;
      const ny = -dy * s;
      const l = Math.hypot(nx, ny, 1);
      const i = (y * n + x) * 4;
      img.data[i] = (nx / l) * 127 + 128;
      img.data[i + 1] = (ny / l) * 127 + 128;
      img.data[i + 2] = (1 / l) * 127 + 128;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  ripple = new THREE.CanvasTexture(canvas);
  ripple.wrapS = ripple.wrapT = THREE.RepeatWrapping;
  ripple.repeat.set(1 / 3, 1 / 3); // one tile = 3 m (UVs are in meters)
  return ripple;
}

let water: THREE.MeshPhysicalMaterial | null = null;

/** Reflective, gently rippling water for ponds and pools (UVs in meters). */
export function waterMaterial(): THREE.MeshPhysicalMaterial {
  if (!water) {
    water = new THREE.MeshPhysicalMaterial({
      color: '#1f5f7a',
      roughness: 0.06,
      metalness: 0,
      normalMap: rippleTexture(),
      normalScale: new THREE.Vector2(0.55, 0.55),
      envMapIntensity: 1.6,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
      transparent: true,
      opacity: 0.93,
    });
    water.name = 'water-animated';
  }
  return water;
}

/** Advance wind and water. */
export function updateEffects(dt: number): void {
  windTime.value += dt;
  if (water?.normalMap) {
    water.normalMap.offset.x = windTime.value * 0.035;
    water.normalMap.offset.y = windTime.value * 0.021;
    water.normalScale.setScalar(0.5 + Math.sin(windTime.value * 0.7) * 0.08);
  }
}
