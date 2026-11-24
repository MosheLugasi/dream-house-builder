import * as THREE from 'three';
import { roomsKey, sameKey } from './buildingKey';
import { getGraph } from '../../model/graph';
import { levelElevation, toSite, type Building } from '../../model/types';
import { registerShaderPatch } from '../../materials/shaderPatches';

/**
 * Rooms see much less of the sky than the street does. A real-time renderer lights every surface with
 * the whole sky (environment map + hemisphere light) unless something is in between, so interiors look
 * flat and evenly lit. This module keeps a top-down mask of every room of every building (and the
 * height of its ceiling) and scales the sky part of the light – diffuse ambient and reflections – of
 * the fragments that are inside a room. What lights a room is then what really comes in: the sun
 * through the windows (shadowed), the window area lights, the lamps and a little bounce.
 *
 * The patch is registered with the shared shader patches (`materials/shaderPatches.ts`) and is driven
 * by shared uniforms, so switching it on and off never recompiles a shader.
 */

const RES = 0.2; // meters per mask pixel
const MAX_PX = 2048;
const HEIGHT_RANGE = 32; // meters encoded in the green channel

export const indoorUniforms = {
  dhbIndoorMap: { value: null as THREE.Texture | null },
  /** min x, min z, 1 / size x, 1 / size z of the mask in world space */
  dhbIndoorBox: { value: new THREE.Vector4(0, 0, 0, 0) },
  /** multipliers of the diffuse sky light and of the reflections inside rooms (1 = off) */
  dhbIndoorAmount: { value: new THREE.Vector2(1, 1) },
};

let emptyMap: THREE.DataTexture | null = null;
function empty(): THREE.DataTexture {
  if (!emptyMap) {
    emptyMap = new THREE.DataTexture(new Uint8Array(4), 1, 1);
    emptyMap.needsUpdate = true;
  }
  return emptyMap;
}
const VERTEX_DECL = 'varying vec3 vDhbWorld;\n';
const VERTEX_CODE = /* glsl */ `
{
  vec4 dhbP = vec4( transformed, 1.0 );
  #ifdef USE_BATCHING
    dhbP = batchingMatrix * dhbP;
  #endif
  #ifdef USE_INSTANCING
    dhbP = instanceMatrix * dhbP;
  #endif
  vDhbWorld = ( modelMatrix * dhbP ).xyz;
}
`;
const FRAGMENT_DECL = /* glsl */ `
varying vec3 vDhbWorld;
uniform sampler2D dhbIndoorMap;
uniform vec4 dhbIndoorBox;
uniform vec2 dhbIndoorAmount;
`;
const FRAGMENT_CODE = /* glsl */ `
if ( dhbIndoorAmount.x < 0.999 || dhbIndoorAmount.y < 0.999 ) {
  // sample a little in front of the surface: exterior wall faces look out, interior faces into the room
  vec3 dhbN = normalize( ( vec4( geometryNormal, 0.0 ) * viewMatrix ).xyz );
  vec2 dhbUv = ( vDhbWorld.xz + dhbN.xz * 0.32 - dhbIndoorBox.xy ) * dhbIndoorBox.zw;
  vec4 dhbM = texture2D( dhbIndoorMap, dhbUv );
  float dhbIn = dhbM.r * step( vDhbWorld.y, dhbM.g * ${HEIGHT_RANGE.toFixed(1)} );
  float dhbD = mix( 1.0, dhbIndoorAmount.x, dhbIn );
  float dhbS = mix( 1.0, dhbIndoorAmount.y, dhbIn );
  #if defined( RE_IndirectDiffuse )
    irradiance *= dhbD;
    iblIrradiance *= dhbD;
  #endif
  #if defined( RE_IndirectSpecular )
    radiance *= dhbS;
    #ifdef USE_CLEARCOAT
      clearcoatRadiance *= dhbS;
    #endif
  #endif
}
`;

/** Add the indoor-ambient code to a lit built-in shader (no-op for anything else; idempotent). */
export function patchIndoorShader(shader: THREE.WebGLProgramParametersWithUniforms): void {
  if (!shader.fragmentShader.includes('#include <lights_fragment_end>')) return;
  if (!shader.vertexShader.includes('#include <project_vertex>')) return;
  if (shader.fragmentShader.includes('vDhbWorld')) return;
  Object.assign(shader.uniforms, indoorUniforms);
  if (!indoorUniforms.dhbIndoorMap.value) indoorUniforms.dhbIndoorMap.value = empty();
  shader.vertexShader = VERTEX_DECL + shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>\n${VERTEX_CODE}`);
  shader.fragmentShader = FRAGMENT_DECL + shader.fragmentShader.replace('#include <lights_fragment_end>', `${FRAGMENT_CODE}\n#include <lights_fragment_end>`);
}

registerShaderPatch(patchIndoorShader);

/** Builds and updates the room mask from the project's buildings. */
export class IndoorAmbient {
  private texture: THREE.CanvasTexture | null = null;
  private key: unknown[] | null = null;
  private buildings: unknown = null;

  /** Rebuild the mask when the rooms changed (cheap identity checks otherwise; furniture moves do not count). */
  update(buildings: Building[]): void {
    if (buildings === this.buildings) return;
    this.buildings = buildings;
    const key = roomsKey(buildings);
    if (sameKey(this.key, key)) return;
    this.key = key;
    if (typeof document === 'undefined') return;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    type Shape = { poly: { x: number; y: number }[]; holes: { x: number; y: number }[][]; top: number };
    const shapes: Shape[] = [];
    for (const b of buildings) {
      b.levels.forEach((lvl, i) => {
        // half-way between the ceiling and the roof slab above it
        const top = levelElevation(b, i) + lvl.height + 0.11;
        for (const room of getGraph(lvl.walls).rooms) {
          const poly = room.polygon.map((p) => toSite(b, p));
          const holes = room.holes.map((h) => h.map((p) => toSite(b, p)));
          for (const p of poly) {
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x);
            maxY = Math.max(maxY, p.y);
          }
          shapes.push({ poly, holes, top });
        }
      });
    }
    if (!shapes.length) {
      indoorUniforms.dhbIndoorBox.value.set(0, 0, 0, 0);
      return;
    }
    minX -= 2;
    minY -= 2;
    maxX += 2;
    maxY += 2;
    const res = Math.max(RES, (maxX - minX) / MAX_PX, (maxY - minY) / MAX_PX);
    const w = Math.ceil((maxX - minX) / res);
    const h = Math.ceil((maxY - minY) / res);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    const path = (s: Shape) => {
      ctx.beginPath();
      for (const ring of [s.poly, ...s.holes]) {
        ring.forEach((p, i) => {
          const x = (p.x - minX) / res;
          const y = (p.y - minY) / res;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.closePath();
      }
    };
    // green: ceiling height, drawn lowest first so that upper storeys win, and grown a little so that
    // bilinear filtering never lowers it at a room's edge
    shapes.sort((a, b) => a.top - b.top);
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    for (const s of shapes) {
      const g = Math.min(255, Math.round((s.top / HEIGHT_RANGE) * 255));
      ctx.fillStyle = ctx.strokeStyle = `rgb(0,${g},0)`;
      path(s);
      ctx.fill('evenodd');
      ctx.stroke();
    }
    const green = ctx.getImageData(0, 0, w, h);
    // red: inside a room
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#ff0000';
    for (const s of shapes) {
      path(s);
      ctx.fill('evenodd');
    }
    const red = ctx.getImageData(0, 0, w, h);
    for (let i = 0; i < red.data.length; i += 4) {
      red.data[i] = red.data[i + 3]; // coverage, not the un-premultiplied colour
      red.data[i + 1] = green.data[i + 1];
      red.data[i + 2] = 0;
      red.data[i + 3] = 255;
    }
    ctx.putImageData(red, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.NoColorSpace;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.flipY = false;
    this.texture?.dispose();
    this.texture = tex;
    indoorUniforms.dhbIndoorMap.value = tex;
    indoorUniforms.dhbIndoorBox.value.set(minX, minY, 1 / (w * res), 1 / (h * res));
  }

  /** Strength of the effect: multipliers of the sky light inside rooms (1, 1 = off). */
  setAmount(diffuse: number, specular: number): void {
    indoorUniforms.dhbIndoorAmount.value.set(diffuse, specular);
  }

  dispose(): void {
    this.texture?.dispose();
    this.texture = null;
  }
}
