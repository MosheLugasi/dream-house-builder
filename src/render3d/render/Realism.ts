import * as THREE from 'three';
import type { Project } from '../../model/types';
import type { Quality } from '../../store/quality';
import type { Atmosphere } from '../Atmosphere';
import { setCeilingGlow } from '../buildArchitecture';
import type { LightManager } from '../LightManager';
import { Grass } from './Grass';
import { IndoorAmbient } from './IndoorAmbient';
import { RenderPipeline } from './Pipeline';
import { PRESETS, type RenderPreset } from './presets';
import { WindowLights } from './WindowLights';

/** What the renderer needs to know about the frame being drawn. */
export interface RealismFrame {
  /** walking around (ceilings on, the camera can be inside a room) */
  walking: boolean;
  /** the walker stands inside a room */
  indoors: boolean;
  project: Project;
  /** what the camera looks at (orbit target / walker) */
  focus: THREE.Vector3;
  /** lamp light around the walker, 1 ≈ one ordinary lamp nearby (see LightManager.brightnessAt) */
  lampLight?: number;
}

const _dir = new THREE.Vector3();

/**
 * Everything that makes the image look photographic, per quality preset: the post-processing pipeline,
 * colour pipeline and grade, daylight through windows, the indoor ambient, exposure adaptation and the
 * supersampled photo. The Engine owns the scene; this class only adds lights and settings to it.
 */
export class Realism {
  readonly pipeline: RenderPipeline;
  readonly windows = new WindowLights();
  readonly indoor = new IndoorAmbient();
  readonly grass = new Grass();
  preset: RenderPreset = PRESETS.high;
  /** look parameters (tuned against screenshots; exposed for experiments from the console) */
  readonly tune = {
    /** sky light left inside rooms: diffuse and reflections */
    indoorDiffuse: 0.45,
    indoorSpecular: 0.2,
    /** brightness of the view out of a window, × daylight × environment intensity */
    windowRadiance: 8,
    /** exposure multiplier inside by day (the eye adapts to the darker room) */
    indoorExposure: 2,
    /** … and by night (a lamp-lit room) */
    indoorExposureNight: 2,
    /** the ceilings' fake bounce light in walk mode by day / by night (1 = as in the editor) */
    ceilingDay: 0.35,
    ceilingNight: 0.8,
    contrast: 0.22,
    saturation: 1.06,
    vignette: 0.15,
  };
  /** eye adaptation: exposure multiplier, follows the walker in and out of buildings */
  private adapt = 1;
  /** current multiplier of the sky light inside rooms (eased) */
  private indoorDiffuse = 1;
  private indoorSpecular = 1;
  private lastHours = -1;

  constructor(
    private renderer: THREE.WebGLRenderer,
    private scene: THREE.Scene,
    private camera: THREE.PerspectiveCamera,
    private atmosphere: Atmosphere,
    private lamps: LightManager,
  ) {
    this.pipeline = new RenderPipeline(renderer, scene, camera);
    scene.add(this.windows.group, this.grass.mesh);
    // Khronos PBR Neutral: keeps the colours of paints, fabrics and woods true and rolls bright windows,
    // skies and lamps off to white without the hue shifts and over-saturation of ACES (AgX was flatter
    // still and needed a much stronger grade). Contrast comes from the grade below.
    renderer.toneMapping = THREE.NeutralToneMapping;
    // the placement ghost, hover cursors and keyboard rotation move things without touching the store or
    // the camera: never let the still-camera average smear them
    renderer.domElement.addEventListener('pointermove', this.onInput);
    window.addEventListener('keydown', this.onInput);
  }

  private onInput = (): void => this.pipeline.invalidate();

  setQuality(q: Quality, width: number, height: number): void {
    const preset = PRESETS[q] ?? PRESETS.high;
    this.preset = preset;
    const ratio = Math.min(window.devicePixelRatio || 1, preset.pixelRatioCap);
    this.renderer.setPixelRatio(ratio);
    const sun = this.atmosphere.sun;
    sun.shadow.mapSize.setScalar(preset.shadowMapSize);
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
    this.windows.setPoolSize(preset.windowLights);
    this.lamps.setShadowCasters(preset.lampShadows);
    sun.shadow.radius = preset.sharpShadows ? 1.4 : 2.5;
    this.pipeline.configure(preset, width, height, ratio);
  }

  setSize(width: number, height: number): void {
    this.pipeline.setSize(width, height);
  }

  /** Something in the scene changed: restart the still-camera accumulation. */
  invalidate(): void {
    this.version++;
    this.pipeline.invalidate();
  }

  update(dt: number, f: RealismFrame): void {
    const atm = this.atmosphere;
    const k = Math.min(1, dt * 2.5);
    this.indoor.update(f.project.buildings);
    // inside a room the sky is mostly hidden: only walk mode draws ceilings (the 3D editor shows rooms
    // open to the sky from above)
    const t = this.tune;
    const wantD = this.preset.indoorAmbient && f.walking ? t.indoorDiffuse : 1;
    const wantS = this.preset.indoorAmbient && f.walking ? t.indoorSpecular : 1;
    this.indoorDiffuse += (wantD - this.indoorDiffuse) * k;
    this.indoorSpecular += (wantS - this.indoorSpecular) * k;
    if (Math.abs(this.indoorDiffuse - wantD) < 1e-3) this.indoorDiffuse = wantD;
    if (Math.abs(this.indoorSpecular - wantS) < 1e-3) this.indoorSpecular = wantS;
    this.indoor.setAmount(this.indoorDiffuse, this.indoorSpecular);

    // daylight through the windows (only matters where ceilings are drawn)
    this.windows.setBuildings(f.project.buildings);
    this.warmTimer -= dt;
    if (f.walking && this.windows.size > 0 && this.warmTimer <= 0) this.prewarmWindows(this.version);
    else if (!f.walking) this.warmKey = null;
    const radiance = f.walking ? t.windowRadiance * atm.daylight * this.scene.environmentIntensity : 0;
    this.windows.update(dt, this.camera.position, radiance, atm.skyColor, f.walking && atm.daylight > 0.01);

    setCeilingGlow(f.walking && this.preset.indoorAmbient ? t.ceilingDay + (t.ceilingNight - t.ceilingDay) * atm.night : 1);

    // lawns grow real blades around the camera on ultra
    if (this.preset.grass) this.grass.setProject(f.project);
    this.grass.update(this.camera, this.preset.grass);

    // eye adaptation: a room by day is darker than the street, the eye (camera) opens up
    let wantAdapt = f.walking && f.indoors && this.preset.indoorAmbient ? t.indoorExposure + (t.indoorExposureNight - t.indoorExposure) * atm.night : 1;
    // a room full of lit lamps at night: the eye closes down again instead of washing everything out
    if (f.walking && atm.night > 0.3 && (f.lampLight ?? 0) > 1) wantAdapt /= Math.min(3, Math.pow(f.lampLight!, 0.6 * atm.night));
    this.adapt += (wantAdapt - this.adapt) * Math.min(1, dt * 1.5);
    this.renderer.toneMappingExposure = atm.exposure * this.adapt;

    // grade: a touch of contrast and colour, warmer in the evening, cooler at night
    const out = this.pipeline.output;
    if (out) {
      const night = atm.night;
      const dusk = Math.max(0, 1 - atm.daylight - night);
      const g = out.grade;
      g.contrast = t.contrast;
      g.saturation = t.saturation - 0.1 * night;
      g.vignette = t.vignette;
      g.white.setRGB(1 + 0.03 * dusk - 0.04 * night, 1, 1 - 0.04 * dusk + 0.05 * night);
    }

    // accumulation: only in the editor. Walking, people, pets, cars and foliage move all the time: a short
    // running average of jittered frames never converges there, it made every edge shimmer and left
    // trails behind whatever moved
    this.pipeline.maxAccumulate = f.walking ? 0 : this.preset.accumulate;
    if (atm.hours !== this.lastHours) {
      this.lastHours = atm.hours;
      this.pipeline.invalidate();
    }
  }

  /**
   * The window lights join and leave the scene (they cost every lit pixel while on): each switch needs
   * other variants of the lit shaders, which compiled the first time a window came into reach – a stall
   * of a second or more walking up to a house. Compile them in the background when walking starts and
   * after the scene changed (e.g. a house nearby got its furniture), without blocking a frame.
   */
  private prewarmWindows(key: unknown): void {
    if (key === this.warmKey || this.warming) return;
    this.warmKey = key;
    this.warmTimer = 2;
    const group = this.windows.group;
    const was = group.visible;
    group.visible = true;
    try {
      this.warming = true;
      this.renderer
        .compileAsync(this.scene, this.camera)
        .catch(() => undefined)
        .finally(() => {
          this.warming = false;
        });
    } catch {
      this.warming = false;
    }
    group.visible = was;
  }
  private warmKey: unknown = null;
  private warming = false;
  private warmTimer = 0;
  /** bumped whenever the scene changed (see invalidate) */
  private version = 0;

  /**
   * Where the sun's shadow map goes: a square of ±`range` m around `center`. Walking, ultra uses a
   * tighter square pushed ahead of the camera (twice the texels where one looks); otherwise the square
   * is centred on the focus as before.
   */
  sunShadowFit(walking: boolean, focus: THREE.Vector3, orbitDistance: number, center: THREE.Vector3): number {
    center.set(focus.x, 0, focus.z);
    if (!walking) return Math.max(22, Math.min(170, orbitDistance * 0.9));
    if (!this.preset.sharpShadows) return 26;
    const dir = this.camera.getWorldDirection(_dir);
    const flat = Math.hypot(dir.x, dir.z) || 1;
    center.x += (dir.x / flat) * 7;
    center.z += (dir.z / flat) * 7;
    return 17;
  }

  render(): void {
    this.pipeline.render();
  }

  /** A supersampled photo of the current view (null: save the canvas as it is). */
  photo(): HTMLCanvasElement | null {
    return this.pipeline.capture(this.preset.photoScale, this.preset.photoSamples);
  }

  dispose(): void {
    this.renderer.domElement.removeEventListener('pointermove', this.onInput);
    window.removeEventListener('keydown', this.onInput);
    this.pipeline.dispose();
    this.windows.dispose();
    this.indoor.dispose();
    this.grass.dispose();
  }
}

const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

/**
 * Move a shadow map's centre onto the texel grid of the light's view, so that a camera-following map
 * does not make shadow edges crawl and shimmer as the camera moves.
 */
export function snapToShadowTexels(center: THREE.Vector3, lightDir: THREE.Vector3, texel: number): void {
  if (!(texel > 0)) return;
  _x.crossVectors(_up, lightDir);
  if (_x.lengthSq() < 1e-6) return;
  _x.normalize();
  _y.crossVectors(lightDir, _x).normalize();
  const u = center.dot(_x);
  const v = center.dot(_y);
  center.addScaledVector(_x, Math.round(u / texel) * texel - u).addScaledVector(_y, Math.round(v / texel) * texel - v);
}
