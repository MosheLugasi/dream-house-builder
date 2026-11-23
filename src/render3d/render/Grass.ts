import * as THREE from 'three';
import { applyShaderPatches } from '../../materials/shaderPatches';
import { getGraph } from '../../model/graph';
import { ROAD_CELL, toSite, type Project } from '../../model/types';
import { windStrength, windTime } from '../effects';

/**
 * Blades of grass around the camera (ultra quality). One instanced draw call: tufts sit on a
 * world-locked grid that wraps around the camera (so the grass never swims), are thinned out with
 * distance, fade out at the edge of the patch and only grow where the ground is a lawn (a top-down mask
 * of the site: no grass on roads, paths, water or inside buildings). Wind uses the shared wind clock.
 * The blades are shaded with ground-like normals so that they blend into the lawn texture underneath.
 */

const TILE = 40; // m: the patch wraps every TILE meters
const RADIUS = 19; // m: grass is drawn up to here (fading out over the last few meters)
const TUFTS = 22000;
const BLADES = 9;
const SEGMENTS = 2;
const MASK_RES = 0.25; // m per mask pixel
const LAWNS = new Set(['grass', 'grass-dry']);

function tuftGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (let b = 0; b < BLADES; b++) {
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd()) * 0.2;
    const ox = Math.cos(a) * r;
    const oz = Math.sin(a) * r;
    const face = rnd() * Math.PI;
    const fx = Math.cos(face);
    const fz = Math.sin(face);
    const h = 0.07 + rnd() * 0.1;
    const w = 0.01 + rnd() * 0.008;
    const lean = (rnd() - 0.5) * 0.08;
    const lx = -fz * lean;
    const lz = fx * lean;
    const base = pos.length / 3;
    for (let s = 0; s <= SEGMENTS; s++) {
      const t = s / SEGMENTS;
      const y = h * t;
      const bend = t * t;
      const half = s === SEGMENTS ? 0 : w * (1 - t * 0.75);
      const cx = ox + lx * bend;
      const cz = oz + lz * bend;
      const shade = 0.42 + 0.58 * Math.pow(t, 0.8);
      if (s === SEGMENTS) {
        pos.push(cx, y, cz);
        col.push(shade, shade, shade);
      } else {
        pos.push(cx - fx * half, y, cz - fz * half, cx + fx * half, y, cz + fz * half);
        col.push(shade, shade, shade, shade, shade, shade);
      }
    }
    for (let s = 0; s < SEGMENTS; s++) {
      const i = base + s * 2;
      if (s === SEGMENTS - 1) idx.push(i, i + 1, i + 2);
      else idx.push(i, i + 1, i + 3, i, i + 3, i + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  // (the vertex shader replaces the normal; the attribute keeps three from switching to flat shading)
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setIndex(idx);
  return g;
}

export class Grass {
  readonly mesh: THREE.Mesh;
  private material: THREE.MeshStandardMaterial;
  private mask: THREE.CanvasTexture | null = null;
  private key: unknown[] = [];
  private uniforms = {
    uGrassCenter: { value: new THREE.Vector2() },
    uGrassFade: { value: 1 },
    uGrassMask: { value: null as THREE.Texture | null },
    uGrassBox: { value: new THREE.Vector4(0, 0, 0, 0) },
    uWindTime: windTime,
    uWindStrength: windStrength,
  };

  constructor() {
    const tuft = tuftGeometry();
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = tuft.index;
    geo.setAttribute('position', tuft.getAttribute('position'));
    geo.setAttribute('color', tuft.getAttribute('color'));
    geo.setAttribute('normal', tuft.getAttribute('normal'));
    const data = new Float32Array(TUFTS * 4);
    let seed = 97;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    for (let i = 0; i < TUFTS; i++) {
      data[i * 4] = rnd() * TILE;
      data[i * 4 + 1] = rnd() * TILE;
      data[i * 4 + 2] = rnd() * Math.PI * 2;
      data[i * 4 + 3] = rnd();
    }
    geo.setAttribute('aTuft', new THREE.InstancedBufferAttribute(data, 4));
    geo.instanceCount = TUFTS;
    this.material = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.78, metalness: 0, side: THREE.DoubleSide });
    this.material.onBeforeCompile = (shader) => {
      applyShaderPatches(shader);
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
attribute vec4 aTuft;
uniform vec2 uGrassCenter;
uniform float uGrassFade;
uniform sampler2D uGrassMask;
uniform vec4 uGrassBox;
uniform float uWindTime;
uniform float uWindStrength;
varying vec3 vGrassTint;`,
        )
        .replace(
          '#include <beginnormal_vertex>',
          // lit like the lawn underneath, with a hint of the blade's own orientation
          'vec3 objectNormal = normalize( vec3( 0.0, 1.0, 0.0 ) + vec3( sin( aTuft.z ), 0.0, cos( aTuft.z ) ) * 0.25 );',
        )
        .replace(
          '#include <begin_vertex>',
          `vec2 grassRel = mod( aTuft.xy - uGrassCenter + ${(TILE / 2).toFixed(1)}, ${TILE.toFixed(1)} ) - ${(TILE / 2).toFixed(1)};
vec2 grassXZ = uGrassCenter + grassRel;
float grassD = length( grassRel );
float grassKeep = step( aTuft.w, 1.0 / ( 1.0 + grassD * grassD * 0.012 ) );
vec4 grassM = texture2D( uGrassMask, ( grassXZ - uGrassBox.xy ) * uGrassBox.zw );
float grassS = grassKeep * grassM.r * uGrassFade * ( 1.0 - smoothstep( ${(RADIUS * 0.72).toFixed(1)}, ${RADIUS.toFixed(1)}, grassD ) );
float grassC = cos( aTuft.z );
float grassSn = sin( aTuft.z );
vec3 transformed = vec3( position.x * grassC - position.z * grassSn, position.y, position.x * grassSn + position.z * grassC );
float grassH = ( 0.75 + 0.5 * fract( aTuft.w * 13.7 ) ) * mix( 1.0, 1.5, grassM.g );
transformed *= vec3( 1.0, grassH, 1.0 ) * step( 0.04, grassS ) * min( 1.0, grassS * 1.6 );
float grassBend = transformed.y * transformed.y * 6.0 * uWindStrength;
transformed.x += ( sin( uWindTime * 1.7 + grassXZ.x * 0.45 + grassXZ.y * 0.2 ) * 0.6 + sin( uWindTime * 3.1 + grassXZ.x * 1.3 ) * 0.25 ) * grassBend * 0.12;
transformed.z += ( cos( uWindTime * 1.3 + grassXZ.y * 0.4 ) * 0.5 + sin( uWindTime * 2.7 + grassXZ.y * 1.1 ) * 0.25 ) * grassBend * 0.09;
transformed.xz += grassXZ;
float grassR = fract( aTuft.w * 71.3 + aTuft.z );
vGrassTint = mix( mix( vec3( 0.075, 0.2, 0.03 ), vec3( 0.17, 0.36, 0.055 ), grassR * grassR ), vec3( 0.36, 0.32, 0.13 ) * ( 0.75 + 0.5 * grassR ), grassM.g );`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vGrassTint;')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vGrassTint;')
        // both sides of a blade face the sky (no flipped, dark back faces)
        .replace('#include <normal_fragment_begin>', 'float faceDirection = 1.0;\nvec3 normal = normalize( vNormal );\nvec3 nonPerturbedNormal = normal;');
    };
    this.material.customProgramCacheKey = () => 'dhb-grass';
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
    this.mesh.name = 'grass';
    this.mesh.visible = false;
  }

  /** Rebuild the lawn mask when the ground, areas, roads or buildings changed. */
  setProject(project: Project): void {
    const site = project.site;
    const key = [site.ground, site.areas, site.roads, project.buildings, site.size];
    if (key.every((v, i) => v === this.key[i])) return;
    this.key = key;
    if (typeof document === 'undefined') return;
    const half = Math.max(60, site.size + 20);
    const n = Math.min(2048, Math.ceil((half * 2) / MASK_RES));
    const res = (half * 2) / n;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = n;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const px = (x: number) => (x + half) / res;
    const lawn = (finish: string) => (finish === 'grass' ? '#ff0000' : finish === 'grass-dry' ? '#d0ff00' : '#000000');
    ctx.fillStyle = lawn(site.ground);
    ctx.fillRect(0, 0, n, n);
    for (const a of site.areas) {
      ctx.fillStyle = lawn(a.finish);
      ctx.fillRect(px(Math.min(a.x0, a.x1)), px(Math.min(a.y0, a.y1)), Math.abs(a.x1 - a.x0) / res, Math.abs(a.y1 - a.y0) / res);
    }
    ctx.fillStyle = '#000000';
    for (const [i, j] of site.roads) ctx.fillRect(px(i * ROAD_CELL), px(j * ROAD_CELL), ROAD_CELL / res, ROAD_CELL / res);
    // buildings: every room plus a margin for the walls
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 0.8 / res;
    ctx.lineJoin = 'round';
    for (const b of project.buildings) {
      for (const lvl of b.levels.slice(0, 1)) {
        for (const room of getGraph(lvl.walls).rooms) {
          ctx.beginPath();
          room.polygon.forEach((p, k) => {
            const q = toSite(b, p);
            if (k === 0) ctx.moveTo(px(q.x), px(q.y));
            else ctx.lineTo(px(q.x), px(q.y));
          });
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
        for (const w of lvl.walls) {
          const a = toSite(b, w.a);
          const c = toSite(b, w.b);
          ctx.beginPath();
          ctx.moveTo(px(a.x), px(a.y));
          ctx.lineTo(px(c.x), px(c.y));
          ctx.stroke();
        }
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.NoColorSpace;
    tex.flipY = false;
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    this.mask?.dispose();
    this.mask = tex;
    this.uniforms.uGrassMask.value = tex;
    this.uniforms.uGrassBox.value.set(-half, -half, 1 / (half * 2), 1 / (half * 2));
  }

  /** Follow the camera; `on` = drawn at all (quality preset). */
  update(camera: THREE.Camera, on: boolean): void {
    // blades are too small to matter from high up: fade them out with the camera height
    const fade = on ? 1 - THREE.MathUtils.smoothstep(camera.position.y, 16, 30) : 0;
    this.uniforms.uGrassFade.value = fade;
    this.mesh.visible = fade > 0.01 && !!this.mask;
    this.uniforms.uGrassCenter.value.set(camera.position.x, camera.position.z);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.mask?.dispose();
  }
}
