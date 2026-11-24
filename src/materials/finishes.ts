import * as THREE from 'three';
import type { FinishDef, FinishKind, FinishLibrary } from './types';
import {
  type Surface,
  createCanvas,
  fbm,
  heightToNormal,
  canvasFromRGBA,
  hexToRgb,
  makeTexture,
  rgbToHex,
  surfaceSwatch,
  surfaceToTextures,
  trackTexture,
} from './textureGen';
import { CATALOG, type FinishSpec } from './catalog';
import { hasDom, loadTexture } from '../assets/loader';
import { applyShaderPatches } from './shaderPatches';

export { setMaxAnisotropy } from './textureGen';

/** Hebrew label for each finish kind (catalog tabs) */
export const FINISH_KIND_LABELS: Record<FinishKind, string> = {
  floor: 'ריצוף',
  wall: 'קירות',
  exterior: 'חיפוי חוץ',
  roof: 'גג',
  ground: 'קרקע וחצר',
};

const PAINT_PREFIX = 'paint:';
const SWATCH_SIZE = 96;

const specById = new Map<string, FinishSpec>();
for (const spec of CATALOG) specById.set(spec.id, spec);

const list: FinishDef[] = CATALOG.map(({ id, name, kinds, color2d }) => ({ id, name, kinds, color2d }));
const defById = new Map<string, FinishDef>();
for (const def of list) defById.set(def.id, def);

const materialCache = new Map<string, THREE.MeshStandardMaterial>();
const swatchCache = new Map<string, string>();
const warned = new Set<string>();

/** `paint:#abc` / `paint:#AABBCC` -> `#aabbcc`, or null when the id is not a valid paint id */
function paintColor(id: string): string | null {
  if (!id.startsWith(PAINT_PREFIX)) return null;
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(id.slice(PAINT_PREFIX.length).trim());
  if (!m) return null;
  const [r, g, b] = hexToRgb(m[1]);
  return rgbToHex(r, g, b);
}

function fallbackDef(id: string): FinishDef {
  if (!warned.has(id)) {
    warned.add(id);
    console.warn(`[finishes] unknown finish id "${id}"`);
  }
  return { id, name: id, kinds: ['wall'], color2d: '#cfcfcf' };
}

function get(id: string): FinishDef {
  const def = defById.get(id);
  if (def) return def;
  const hex = paintColor(id);
  if (hex) return { id, name: `צבע ${hex}`, kinds: ['wall', 'exterior'], color2d: hex };
  return fallbackDef(id);
}

// --- paint ------------------------------------------------------------------------------------

let paintNormal: THREE.CanvasTexture | null = null;

/** very subtle roller / orange-peel relief shared by every paint color */
function getPaintNormal(): THREE.CanvasTexture {
  if (paintNormal) return paintNormal;
  const n = 256;
  const tile = 0.32; // m
  const a = fbm(n, 72, 72, 2, 9001, 0.45);
  const b = fbm(n, 10, 10, 2, 9002);
  const h = new Float32Array(n * n);
  for (let i = 0; i < h.length; i++) h[i] = (a[i] - 0.5) * 0.11 + (b[i] - 0.5) * 0.12;
  const nrm = heightToNormal(h, n, (tile * 1000) / n, (tile * 1000) / n, 1);
  paintNormal = makeTexture(canvasFromRGBA(nrm, n), false, tile, tile);
  return paintNormal;
}

function paintMaterial(hex: string): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(hex),
    roughness: 0.9,
    metalness: 0,
    normalMap: getPaintNormal(),
  });
  mat.normalScale.set(0.6, 0.6);
  mat.name = `paint:${hex}`;
  return mat;
}

// --- macro variation --------------------------------------------------------------------------

let macroTexture: THREE.CanvasTexture | null = null;

/** small smooth noise texture shared by all finishes that use macro variation */
function getMacroTexture(): THREE.CanvasTexture {
  if (macroTexture) return macroTexture;
  const n = 256;
  const f = fbm(n, 4, 4, 5, 4242, 0.5);
  const data = new Uint8ClampedArray(n * n * 4);
  for (let i = 0; i < f.length; i++) {
    const v = f[i] * 255;
    data[i * 4] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  macroTexture = makeTexture(canvasFromRGBA(data, n), false, 1, 1);
  return macroTexture;
}

/**
 * Hide texture tiling on large areas: multiply the albedo by two layers of very low
 * frequency noise (9.7 m and 23 m periods, rotated against each other, so the combination
 * practically never repeats). Implemented as a small patch of the standard shader; if the
 * hook is not supported (or the material is cloned) the finish simply renders without it.
 */
function addMacroVariation(
  mat: THREE.MeshStandardMaterial,
  tileW: number,
  tileH: number,
  macro: NonNullable<FinishSpec['macro']>,
): void {
  const uniforms = {
    finishMacroMap: { value: getMacroTexture() },
    // map-uv -> macro-uv scales for both layers, strength, tint amount
    finishMacroScale: { value: new THREE.Vector4(tileW / 9.7, tileH / 9.7, tileW / 23.3, tileH / 23.3) },
    finishMacroParams: { value: new THREE.Vector2(macro.strength, macro.tintAmount ?? 0) },
    finishMacroTint: { value: new THREE.Color(macro.tint ?? '#ffffff') },
  };
  // kept so a photographic texture set with a different tile size can rescale the macro noise
  mat.userData.finishMacro = uniforms;
  mat.onBeforeCompile = (shader) => {
    applyShaderPatches(shader);
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <map_pars_fragment>',
        `#include <map_pars_fragment>
uniform sampler2D finishMacroMap;
uniform vec4 finishMacroScale;
uniform vec2 finishMacroParams;
uniform vec3 finishMacroTint;`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
#ifdef USE_MAP
{
  vec2 fmUv = vMapUv;
  float fm1 = texture2D( finishMacroMap, fmUv * finishMacroScale.xy ).r;
  vec2 fmRot = vec2( fmUv.x * 0.8 - fmUv.y * 0.6, fmUv.x * 0.6 + fmUv.y * 0.8 );
  float fm2 = texture2D( finishMacroMap, fmRot * finishMacroScale.zw + 0.37 ).r;
  float fm = ( fm1 * 0.55 + fm2 * 0.45 - 0.5 ) * 2.6;
  diffuseColor.rgb *= 1.0 + clamp( fm, -1.0, 1.0 ) * finishMacroParams.x;
  diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * finishMacroTint, clamp( fm, 0.0, 1.0 ) * finishMacroParams.y );
}
#endif`,
      );
  };
  mat.customProgramCacheKey = () => 'finish-macro-variation';
}

// --- catalog finishes -------------------------------------------------------------------------

/** resolution of the instant first version of a finish (see {@link setProgressiveFinishes}) */
const PREVIEW_RES = 256;

let progressive = typeof window !== 'undefined';
const upgradeQueue: Array<{ spec: FinishSpec; mat: THREE.MeshStandardMaterial }> = [];
let upgradeScheduled = false;
const listeners = new Set<(id: string) => void>();

/**
 * Progressive generation (default on in browsers): `material(id)` returns immediately with
 * 256 px textures (a few ms) and the full resolution textures are generated shortly after,
 * one finish per idle slot, and swapped into the same material. Turn it off to always
 * generate at full resolution synchronously (screenshots, tests).
 */
export function setProgressiveFinishes(enabled: boolean): void {
  progressive = enabled;
  if (!enabled) flushFinishUpgrades();
}

/**
 * Subscribe to "textures of finish `id` were upgraded to full resolution". Apps that render
 * on demand should request a new frame from the listener. Returns an unsubscribe function.
 */
export function onFinishTexturesUpdated(listener: (id: string) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** finish all pending full-resolution upgrades right now (blocking) */
export function flushFinishUpgrades(): void {
  while (upgradeQueue.length) upgradeNext();
}

function applyTextures(spec: FinishSpec, mat: THREE.MeshStandardMaterial, n: number): void {
  // a photographic set has replaced the generated textures: never overwrite it
  if (mat.userData.photo) return;
  const surface: Surface = spec.gen(n, spec.tile[0], spec.tile[1]);
  const tex = surfaceToTextures(surface, spec.normalStrength ?? 1, spec.rotation ?? 0);
  const old = [mat.map, mat.normalMap, mat.roughnessMap];
  mat.map = tex.map;
  mat.normalMap = tex.normalMap;
  mat.roughnessMap = tex.roughnessMap;
  mat.roughness = surface.uniformRough ?? 1;
  for (const t of old) t?.dispose();
}

function upgradeNext(): void {
  const job = upgradeQueue.shift();
  if (!job) return;
  applyTextures(job.spec, job.mat, job.spec.res);
  for (const l of listeners) l(job.spec.id);
}

let upgradesPaused = false;

/**
 * Hold the full-resolution upgrades back (e.g. while only the 2D editor is open: each is a main-thread
 * task of 100-500 ms that would make dragging stutter, and the 3D view is not looking at them yet).
 */
export function pauseFinishUpgrades(paused: boolean): void {
  upgradesPaused = paused;
  if (!paused) scheduleUpgrade();
}

function scheduleUpgrade(): void {
  if (upgradeScheduled || upgradesPaused || !upgradeQueue.length) return;
  upgradeScheduled = true;
  const run = () => {
    upgradeScheduled = false;
    if (upgradesPaused) return;
    upgradeNext();
    scheduleUpgrade();
  };
  // (a generous timeout: with the 3D view running there is little idle time, and a forced slot is a
  // long task in the middle of the animation – the low resolution textures are shown meanwhile)
  if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 1500 });
  else setTimeout(run, 30);
}

/**
 * Swap a finish to its photographic PBR set once the three maps have loaded (browser only). The same
 * images are shared by every finish using the set; each finish gets its own texture objects so it can
 * repeat them at its own scale.
 */
function loadPhoto(spec: FinishSpec, mat: THREE.MeshStandardMaterial): void {
  const photo = spec.photo;
  if (!photo || !hasDom) return;
  const dir = `textures/${photo.set}`;
  Promise.all([
    loadTexture(`${dir}/color.webp`, { srgb: true }),
    loadTexture(`${dir}/normal.webp`),
    loadTexture(`${dir}/rough.webp`),
  ])
    .then(([c, nrm, r]) => {
      const [tw, th] = photo.tile;
      const own = (t: THREE.Texture) => {
        const u = t.clone();
        u.repeat.set(1 / tw, 1 / th);
        trackTexture(u);
        u.needsUpdate = true;
        return u;
      };
      const old = [mat.map, mat.normalMap, mat.roughnessMap];
      mat.userData.photo = photo.set;
      mat.map = own(c);
      mat.normalMap = own(nrm);
      mat.roughnessMap = own(r);
      mat.roughness = photo.roughness ?? 1;
      mat.color.set(photo.color ?? '#ffffff');
      const ns = photo.normalScale ?? 1;
      mat.normalScale.set(ns, ns);
      const macro = mat.userData.finishMacro as { finishMacroScale: { value: THREE.Vector4 } } | undefined;
      macro?.finishMacroScale.value.set(tw / 9.7, th / 9.7, tw / 23.3, th / 23.3);
      mat.needsUpdate = true;
      for (const t of old) t?.dispose();
      const i = upgradeQueue.findIndex((j) => j.mat === mat);
      if (i >= 0) upgradeQueue.splice(i, 1);
      for (const l of listeners) l(spec.id);
    })
    .catch(() => {
      if (progressive && spec.res > PREVIEW_RES && !mat.userData.photo) queueUpgrade(spec, mat);
    });
}

function queueUpgrade(spec: FinishSpec, mat: THREE.MeshStandardMaterial): void {
  upgradeQueue.push({ spec, mat });
  scheduleUpgrade();
}

function buildMaterial(spec: FinishSpec): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ metalness: 0 });
  const ns = spec.normalScale ?? 1;
  mat.normalScale.set(ns, ns);
  if (spec.envMapIntensity !== undefined) mat.envMapIntensity = spec.envMapIntensity;
  if (spec.macro) addMacroVariation(mat, spec.tile[0], spec.tile[1], spec.macro);
  mat.name = spec.id;
  if (progressive && spec.res > PREVIEW_RES) {
    applyTextures(spec, mat, PREVIEW_RES);
    // a photographic set replaces the generated textures anyway: generate the full resolution only if
    // the photos cannot be loaded (each generation is a main-thread task of 100-500 ms)
    if (!spec.photo || !hasDom) queueUpgrade(spec, mat);
  } else {
    applyTextures(spec, mat, spec.res);
  }
  loadPhoto(spec, mat);
  return mat;
}

function material(id: string): THREE.MeshStandardMaterial {
  const spec = specById.get(id);
  const hex = spec ? null : paintColor(id);
  // all spellings of one paint color share one material
  const key = spec ? id : hex ? PAINT_PREFIX + hex : '?';
  let mat = materialCache.get(key);
  if (!mat) {
    if (spec) mat = buildMaterial(spec);
    else if (hex) mat = paintMaterial(hex);
    else {
      fallbackDef(id);
      mat = paintMaterial('#cfcfcf');
    }
    materialCache.set(key, mat);
  }
  return mat;
}

function flatSwatch(hex: string): string {
  const c = createCanvas(SWATCH_SIZE, SWATCH_SIZE);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, SWATCH_SIZE, SWATCH_SIZE);
  // faint top-left light so the chip does not look like a hole in the UI
  const g = ctx.createLinearGradient(0, 0, SWATCH_SIZE, SWATCH_SIZE);
  g.addColorStop(0, 'rgba(255,255,255,0.10)');
  g.addColorStop(1, 'rgba(0,0,0,0.06)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, SWATCH_SIZE, SWATCH_SIZE);
  return c.toDataURL('image/png');
}

function swatch(id: string): string {
  const spec = specById.get(id);
  const hex = spec ? null : paintColor(id);
  const key = spec ? id : hex ? PAINT_PREFIX + hex : '?';
  let url = swatchCache.get(key);
  if (url) return url;
  if (spec) {
    // generate a low-resolution copy: just enough pixels for the visible crop
    const [tw, th] = spec.tile;
    const show = Math.min(spec.swatchMeters ?? 1.2, tw, th);
    let n = 64;
    while ((n * show) / Math.max(tw, th) < SWATCH_SIZE * 1.2 && n < spec.res) n *= 2;
    const surface = spec.gen(n, tw, th);
    url = surfaceSwatch(surface, show, SWATCH_SIZE, spec.swatchShade ?? 1, spec.rotation ?? 0).toDataURL(
      'image/png',
    );
  } else {
    url = flatSwatch(hex ?? '#cfcfcf');
  }
  swatchCache.set(key, url);
  return url;
}

/** the finish library (see `types.ts`). Materials and swatches are generated lazily and cached. */
export const finishes: FinishLibrary = { list, get, material, swatch };
