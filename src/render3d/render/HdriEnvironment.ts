import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { assetUrl, hasDom } from '../../assets/loader';

/**
 * Image-based light from photographed skies (CC0 HDRIs, see public/assets/CREDITS.md): a day sky, a
 * sunset and a night city, blended by the time of day into one equirectangular map that Atmosphere
 * pre-filters (PMREM) as the scene's environment. The visible sky stays procedural.
 *
 * To fit the procedural world, every photo is
 *  - normalised to the brightness the procedural sky has at that moment (exposure stays as tuned),
 *  - stripped of its own sun (clamped) and turned so that its bright side faces our sun; our sun's
 *    glow is added where it really is,
 *  - given our ground below the horizon where the photo has none (the day sky is sky only).
 * Until the files are loaded (and in Node) Atmosphere keeps its procedural gradient environment.
 * Off by default (Atmosphere.useHdri): matched to the tuned procedural lighting the photos changed the
 * image little (slightly brighter, flatter, less warm at sunset) for 4.5 MB of downloads.
 */

interface Source {
  file: string;
  /** how much of the lower hemisphere is replaced by the procedural ground colour */
  ground: number;
  tex: THREE.DataTexture | null;
  /** azimuth of the brightest region (radians, three's equirect convention) */
  sunPhi: number;
  /** solid-angle mean luminance of the upper hemisphere (sun clamped) */
  mean: number;
  /** luminance clamp (removes the photographed sun) */
  clamp: number;
  /** cosine-weighted mean colour of the upper hemisphere (what lights an upward-facing surface) */
  irr: THREE.Color;
}

const FILES: [string, number][] = [
  ['kloofendal_48d_partly_cloudy_puresky_1k.hdr', 1],
  ['highway_bridge_sunset_1k.hdr', 0.55],
  ['modern_buildings_night_1k.hdr', 0.45],
];

export interface HdriParams {
  /** weights of the day, sunset and night photos (sum 1) */
  weights: [number, number, number];
  /** cosine-weighted mean colour of the procedural sky at this time: the photos are matched to it */
  skyIrradiance: THREE.Color;
  /** how much of the photos' own colour is kept (0 = the procedural colour, 1 = the photo's) */
  ownColor: number;
  sunDir: THREE.Vector3;
  /** strength of the added sun glow */
  glow: number;
  ground: THREE.Color;
}

const W = 512;
const H = 256;

export class HdriEnvironment {
  ready = false;
  onReady: (() => void) | null = null;
  private sources: Source[] = FILES.map(([file, ground]) => ({ file, ground, tex: null, sunPhi: 0, mean: 1, clamp: 100, irr: new THREE.Color(1, 1, 1) }));
  private target: THREE.WebGLRenderTarget | null = null;
  private material: THREE.ShaderMaterial | null = null;
  private quad: FullScreenQuad | null = null;

  private loading = false;

  constructor(private renderer: THREE.WebGLRenderer) {}

  /** Start loading the photos (once; nothing happens in Node). */
  load(): void {
    if (this.loading || !hasDom) return;
    this.loading = true;
    void this.fetch();
  }

  private async fetch(): Promise<void> {
    try {
      const { HDRLoader } = await import('three/examples/jsm/loaders/HDRLoader.js');
      const loader = new HDRLoader();
      await Promise.all(
        this.sources.map(async (s) => {
          const tex = (await loader.loadAsync(assetUrl(`hdri/${s.file}`))) as THREE.DataTexture;
          tex.mapping = THREE.EquirectangularReflectionMapping;
          tex.minFilter = THREE.LinearFilter;
          tex.magFilter = THREE.LinearFilter;
          tex.generateMipmaps = false;
          analyse(tex, s);
          s.tex = tex;
        }),
      );
    } catch (err) {
      console.warn('HDRI environment unavailable, keeping the procedural one', err);
      return;
    }
    this.ready = true;
    this.onReady?.();
  }

  /** Render the blended equirectangular environment for these parameters. */
  render(p: HdriParams): THREE.Texture | null {
    if (!this.ready) return null;
    if (!this.target) {
      this.target = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, depthBuffer: false, generateMipmaps: false });
      this.target.texture.mapping = THREE.EquirectangularReflectionMapping;
      this.material = new THREE.ShaderMaterial({
        name: 'HdriBlend',
        uniforms: {
          tDay: { value: this.sources[0].tex },
          tDusk: { value: this.sources[1].tex },
          tNight: { value: this.sources[2].tex },
          scaleDay: { value: new THREE.Vector3() },
          scaleDusk: { value: new THREE.Vector3() },
          scaleNight: { value: new THREE.Vector3() },
          wts: { value: new THREE.Vector3() },
          offset: { value: new THREE.Vector3() },
          clampLum: { value: new THREE.Vector3() },
          groundMix: { value: new THREE.Vector3(...this.sources.map((s) => s.ground)) },
          ground: { value: new THREE.Color() },
          sunDir: { value: new THREE.Vector3() },
          glow: { value: 1 },
        },
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }',
        fragmentShader: /* glsl */ `
          uniform sampler2D tDay;
          uniform sampler2D tDusk;
          uniform sampler2D tNight;
          uniform vec3 scaleDay;
          uniform vec3 scaleDusk;
          uniform vec3 scaleNight;
          uniform vec3 wts;
          uniform vec3 offset;
          uniform vec3 clampLum;
          uniform vec3 groundMix;
          uniform vec3 ground;
          uniform vec3 sunDir;
          uniform float glow;
          varying vec2 vUv;
          vec3 fetch( sampler2D t, float off, float lim ) {
            vec3 c = texture2D( t, vec2( fract( vUv.x + off ), vUv.y ) ).rgb;
            c = max( c, vec3( 0.0 ) );
            float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
            if ( l > lim ) c *= lim / l;
            return c;
          }
          void main() {
            float phi = ( vUv.x - 0.5 ) * 6.28318530718;
            float lat = ( vUv.y - 0.5 ) * 3.14159265359;
            vec3 dir = vec3( cos( phi ) * cos( lat ), sin( lat ), sin( phi ) * cos( lat ) );
            float lower = 1.0 - smoothstep( -0.06, 0.01, dir.y );
            vec3 c = vec3( 0.0 );
            // (below the horizon the procedural ground replaces part of the photo)
            if ( wts.x > 0.0 ) c += mix( fetch( tDay, offset.x, clampLum.x ) * scaleDay, ground * wts.x, groundMix.x * lower );
            if ( wts.y > 0.0 ) c += mix( fetch( tDusk, offset.y, clampLum.y ) * scaleDusk, ground * wts.y, groundMix.y * lower );
            if ( wts.z > 0.0 ) c += mix( fetch( tNight, offset.z, clampLum.z ) * scaleNight, ground * wts.z, groundMix.z * lower );
            float s = max( dot( dir, sunDir ), 0.0 );
            c += vec3( 1.0, 0.9, 0.74 ) * ( pow( s, 90.0 ) * 5.0 + pow( s, 6.0 ) * 0.3 ) * glow * ( 1.0 - lower );
            gl_FragColor = vec4( c, 1.0 );
          }`,
        depthTest: false,
        depthWrite: false,
      });
      this.quad = new FullScreenQuad(this.material);
    }
    const u = this.material!.uniforms;
    const sunPhi = Math.atan2(p.sunDir.z, p.sunDir.x);
    const scales = [u.scaleDay.value, u.scaleDusk.value, u.scaleNight.value] as THREE.Vector3[];
    const want = p.skyIrradiance;
    const lum = (c: THREE.Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    const off = u.offset.value as THREE.Vector3;
    const lim = u.clampLum.value as THREE.Vector3;
    this.sources.forEach((s, i) => {
      // the photo lights an upward surface as much as the procedural sky does (exposure stays as tuned),
      // keeping `ownColor` of its own colour balance
      const w = p.weights[i];
      const kl = lum(want) / Math.max(1e-5, lum(s.irr));
      const mixc = (a: number, b: number) => w * (kl + (a / Math.max(1e-5, b) - kl) * (1 - p.ownColor));
      scales[i].set(mixc(want.r, s.irr.r), mixc(want.g, s.irr.g), mixc(want.b, s.irr.b));
      off.setComponent(i, (((s.sunPhi - sunPhi) / (Math.PI * 2)) % 1 + 1) % 1);
      lim.setComponent(i, s.clamp);
    });
    (u.wts.value as THREE.Vector3).set(...p.weights);
    (u.ground.value as THREE.Color).copy(p.ground);
    (u.sunDir.value as THREE.Vector3).copy(p.sunDir);
    u.glow.value = p.glow;
    const r = this.renderer;
    const prev = r.getRenderTarget();
    r.setRenderTarget(this.target);
    this.quad!.render(r);
    r.setRenderTarget(prev);
    return this.target!.texture;
  }

  dispose(): void {
    for (const s of this.sources) s.tex?.dispose();
    this.target?.dispose();
    this.material?.dispose();
    this.quad?.dispose();
  }
}

/** Mean sky luminance, sun azimuth and a clamp that removes the photographed sun. */
function analyse(tex: THREE.DataTexture, s: Source): void {
  const img = tex.image as { data: Uint16Array | Float32Array; width: number; height: number };
  const { width: w, height: h, data } = img;
  const half = tex.type === THREE.HalfFloatType;
  const get = (i: number) => (half ? THREE.DataUtils.fromHalfFloat((data as Uint16Array)[i]) : (data as Float32Array)[i]);
  const lums: number[] = [];
  const weights: number[] = [];
  let best = -1;
  let bestX = 0;
  // (rows are stored top first; the texture is flipped on upload)
  const step = 2;
  for (let y = 0; y < h / 2; y += step) {
    const lat = (0.5 - (y + 0.5) / h) * Math.PI;
    const wgt = Math.cos(lat);
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4;
      const l = 0.2126 * get(i) + 0.7152 * get(i + 1) + 0.0722 * get(i + 2);
      if (!(l >= 0) || !isFinite(l)) continue;
      lums.push(l);
      weights.push(wgt);
      // brightest region, a little smoothed by preferring lower latitudes when equal
      if (l * (0.6 + 0.4 * wgt) > best) {
        best = l * (0.6 + 0.4 * wgt);
        bestX = x;
      }
    }
  }
  const sorted = lums.slice().sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] || 1;
  const clamp = median * 12;
  let sum = 0;
  let wsum = 0;
  lums.forEach((l, k) => {
    sum += Math.min(l, clamp) * weights[k];
    wsum += weights[k];
  });
  s.mean = Math.max(1e-4, sum / Math.max(1e-6, wsum));
  // cosine-weighted (towards the zenith) mean colour, sun clamped
  let r = 0;
  let g = 0;
  let b = 0;
  let cw = 0;
  for (let y = 0; y < h / 2; y += step) {
    const lat = (0.5 - (y + 0.5) / h) * Math.PI;
    const wgt = Math.cos(lat) * Math.sin(lat);
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4;
      let cr = get(i);
      let cg = get(i + 1);
      let cb = get(i + 2);
      if (!(cr >= 0 && cg >= 0 && cb >= 0) || !isFinite(cr + cg + cb)) continue;
      const l = 0.2126 * cr + 0.7152 * cg + 0.0722 * cb;
      if (l > clamp) {
        cr *= clamp / l;
        cg *= clamp / l;
        cb *= clamp / l;
      }
      r += cr * wgt;
      g += cg * wgt;
      b += cb * wgt;
      cw += wgt;
    }
  }
  s.irr.setRGB(r / cw, g / cw, b / cw);
  s.clamp = clamp;
  s.sunPhi = ((bestX + 0.5) / w - 0.5) * Math.PI * 2;
}
