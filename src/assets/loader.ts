/**
 * Runtime access to the downloaded assets under `public/assets/` (photographic models, PBR texture sets,
 * HDRIs; sources and licences in `public/assets/CREDITS.md`). URLs are relative to the page, so the
 * static build works from any sub-path (GitHub Pages).
 *
 * Everything here is optional: in Node (unit tests) or when a file fails to load, callers keep their
 * procedural fallback. Never await these from a `build()` – return the fallback and swap the asset in
 * when the promise resolves.
 */
import * as THREE from 'three';
import type { GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/** true in a browser page (false in the Node test runner and in workers). */
export const hasDom = typeof window !== 'undefined' && typeof document !== 'undefined';

/**
 * Absolute URL of `public/assets/<path>`. The dev server serves `public/` at its root (also for pages in
 * sub-folders such as tools/catalog-preview); the static build is relative to the page (`base: './'`).
 */
export function assetUrl(path: string): string {
  const base = hasDom ? document.baseURI : 'http://localhost/';
  return import.meta.env?.DEV ? new URL(`/assets/${path}`, base).href : new URL(`assets/${path}`, base).href;
}

let gltfLoader: Promise<GLTFLoader> | null = null;
function getLoader(): Promise<GLTFLoader> {
  gltfLoader ??= Promise.all([import('three/examples/jsm/loaders/GLTFLoader.js'), import('three/examples/jsm/libs/meshopt_decoder.module.js')]).then(
    ([{ GLTFLoader: Loader }, { MeshoptDecoder }]) => {
      const l = new Loader();
      l.setMeshoptDecoder(MeshoptDecoder);
      return l;
    },
  );
  return gltfLoader;
}

const glbs = new Map<string, Promise<GLTF>>();
/** Load (once) a GLB under `public/assets/`. Rejects in Node. */
export function loadGLB(path: string): Promise<GLTF> {
  let p = glbs.get(path);
  if (!p) {
    p = hasDom ? getLoader().then((l) => l.loadAsync(assetUrl(path))) : Promise.reject(new Error('no DOM'));
    // keep a rejected promise from being reported as unhandled when nobody listens yet
    p.catch(() => undefined);
    glbs.set(path, p);
  }
  return p;
}

const textures = new Map<string, THREE.Texture>();
const pending = new Map<string, Promise<THREE.Texture>>();

export interface TextureOpts {
  /** colour data (albedo) – sRGB; leave false for normal / roughness / AO maps */
  srgb?: boolean;
  /** anisotropic filtering samples (default 8) */
  anisotropy?: number;
}

/**
 * A repeating texture from `public/assets/<path>`, loaded once and shared. Resolves with the texture
 * once its image has arrived (so a material can switch from its procedural map without a blank frame).
 * Rejects in Node or when the file is missing.
 */
export function loadTexture(path: string, opts: TextureOpts = {}): Promise<THREE.Texture> {
  const key = `${path}|${opts.srgb ? 's' : 'l'}`;
  let p = pending.get(key);
  if (!p) {
    p = hasDom
      ? new THREE.TextureLoader().loadAsync(assetUrl(path)).then(async (t) => {
          // decode the picture off the main thread now; otherwise the browser decodes it in the middle of
          // the frame that first uploads it (a hitch the first time a textured surface comes into view)
          await (t.image as HTMLImageElement | undefined)?.decode?.().catch(() => undefined);
          t.wrapS = t.wrapT = THREE.RepeatWrapping;
          t.colorSpace = opts.srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
          t.anisotropy = opts.anisotropy ?? 8;
          t.name = path;
          textures.set(key, t);
          return t;
        })
      : Promise.reject(new Error('no DOM'));
    p.catch(() => undefined);
    pending.set(key, p);
  }
  return p;
}

/** The texture if it has already loaded (synchronous), else null. */
export function loadedTexture(path: string, srgb = false): THREE.Texture | null {
  return textures.get(`${path}|${srgb ? 's' : 'l'}`) ?? null;
}

/** Run `fn` when the browser is idle (or soon), never in Node. Used to preload assets after start-up. */
export function whenIdle(fn: () => void, timeout = 2500): void {
  if (!hasDom) return;
  const w = window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
  if (w.requestIdleCallback) w.requestIdleCallback(fn, { timeout });
  else setTimeout(fn, 600);
}
