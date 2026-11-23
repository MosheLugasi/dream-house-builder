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
}

const smooth = THREE.MathUtils.smoothstep;

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
    indoorDiffuse: 0.32,
    indoorSpecular: 0.2,
    /** brightness of the view out of a window, × daylight × environment intensity */
    windowRadiance: 8,
    /** exposure multiplier inside by day (the eye adapts to the darker room) */
    indoorExposure: 2,
    /** … and by night (a lamp-lit room) */
    indoorExposureNight: 1.25,
    /** the ceilings' fake bounce light in walk mode by day / by night (1 = as in the editor) */
    ceilingDay: 0.35,
    ceilingNight: 0.8,
    contrast: 0.2,
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
  }

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
    this.pipeline.configure(preset, width, height, ratio);
  }

  setSize(width: number, height: number): void {
    this.pipeline.setSize(width, height);
  }

  /** Something in the scene changed: restart the still-camera accumulation. */
  invalidate(): void {
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
    const radiance = f.walking ? t.windowRadiance * atm.daylight * this.scene.environmentIntensity : 0;
    this.windows.update(dt, this.camera.position, radiance, atm.skyColor);

    setCeilingGlow(f.walking && this.preset.indoorAmbient ? t.ceilingDay + (t.ceilingNight - t.ceilingDay) * atm.night : 1);

    // lawns grow real blades around the camera on ultra
    if (this.preset.grass) this.grass.setProject(f.project);
    this.grass.update(this.camera, this.preset.grass);

    // eye adaptation: a room by day is darker than the street, the eye (camera) opens up
    const wantAdapt = f.walking && f.indoors ? t.indoorExposure + (t.indoorExposureNight - t.indoorExposure) * atm.night : 1;
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

    // accumulation: long in the editor (nothing moves), short in walk mode (people, pets and cars do)
    this.pipeline.maxAccumulate = f.walking ? Math.min(4, this.preset.accumulate) : this.preset.accumulate;
    if (atm.hours !== this.lastHours) {
      this.lastHours = atm.hours;
      this.pipeline.invalidate();
    }
    void smooth;
  }

  render(): void {
    this.pipeline.render();
  }

  /** A supersampled photo of the current view (null: save the canvas as it is). */
  photo(): HTMLCanvasElement | null {
    return this.pipeline.capture(this.preset.photoScale, this.preset.photoSamples);
  }

  dispose(): void {
    this.pipeline.dispose();
    this.windows.dispose();
    this.indoor.dispose();
    this.grass.dispose();
  }
}
