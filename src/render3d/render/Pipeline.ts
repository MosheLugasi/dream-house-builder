import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { N8AOPass } from 'n8ao';
import { AccumulatePass } from './AccumulatePass';
import { GradedOutputPass } from './GradedOutputPass';
import type { RenderPreset } from './presets';

/** Halton low-discrepancy sequence: well spread sub-pixel offsets. */
function halton(i: number, base: number): number {
  let f = 1;
  let r = 0;
  while (i > 0) {
    f /= base;
    r += f * (i % base);
    i = Math.floor(i / base);
  }
  return r;
}
const JITTER: [number, number][] = Array.from({ length: 32 }, (_, i) => [halton(i + 1, 2) - 0.5, halton(i + 1, 3) - 0.5]);

/**
 * The post-processing chain of the 3D view:
 *   N8AO (renders the scene + ambient occlusion) → bloom → graded output (tone mapping, colour grade, sRGB)
 *   → SMAA → [ultra] accumulation of jittered frames while the camera stands still.
 * Without `preset.post` the scene is rendered straight to the canvas.
 */
export class RenderPipeline {
  composer: EffectComposer | null = null;
  ao: N8AOPass | null = null;
  bloom: UnrealBloomPass | null = null;
  output: GradedOutputPass | null = null;
  private smaa: SMAAPass | null = null;
  private acc: AccumulatePass | null = null;
  /** frames the camera has not moved (and nothing asked for a fresh image) */
  private still = 0;
  /** cap of the running average (may be lowered while things move around, e.g. in walk mode) */
  maxAccumulate = 0;
  private lastView = new THREE.Matrix4();
  private lastProj = new THREE.Matrix4();
  private width = 1;
  private height = 1;
  private pixelRatio = 1;
  /** passes of the last frame (for diagnostics) */
  passes = 0;

  constructor(
    private renderer: THREE.WebGLRenderer,
    private scene: THREE.Scene,
    private camera: THREE.PerspectiveCamera,
  ) {}

  configure(preset: RenderPreset, width: number, height: number, pixelRatio: number): void {
    this.dispose();
    this.width = width;
    this.height = height;
    this.pixelRatio = pixelRatio;
    this.maxAccumulate = preset.accumulate;
    if (!preset.post) return;
    try {
      const composer = new EffectComposer(this.renderer);
      const ao = new N8AOPass(this.scene, this.camera, width, height);
      ao.configuration.aoRadius = 1.1;
      ao.configuration.distanceFalloff = 1.0;
      ao.configuration.intensity = 2.6;
      ao.configuration.color = new THREE.Color(0, 0, 0);
      ao.configuration.halfRes = false;
      ao.configuration.gammaCorrection = false;
      ao.setQualityMode(preset.ao);
      composer.addPass(ao);
      // glow around lamps, windows at night and the low sun
      const bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.03, 0.5, 4);
      composer.addPass(bloom);
      const output = new GradedOutputPass();
      composer.addPass(output);
      const smaa = new SMAAPass();
      composer.addPass(smaa);
      if (preset.accumulate > 0) {
        this.acc = new AccumulatePass(width * pixelRatio, height * pixelRatio);
        composer.addPass(this.acc);
      }
      composer.setPixelRatio(pixelRatio);
      composer.setSize(width, height);
      this.composer = composer;
      this.ao = ao;
      this.bloom = bloom;
      this.output = output;
      this.smaa = smaa;
    } catch (err) {
      console.warn('post-processing unavailable, falling back to direct rendering', err);
      this.dispose();
    }
  }

  setSize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.composer?.setSize(width, height);
    this.ao?.setSize(width, height);
    this.still = 0;
  }

  /** Something changed that the running average must not smear (the scene, the light, …). */
  invalidate(): void {
    this.still = 0;
  }

  render(): void {
    const cam = this.camera;
    if (!this.composer) {
      this.renderer.render(this.scene, cam);
      this.passes = 1;
      return;
    }
    cam.updateMatrixWorld();
    if (!cam.matrixWorld.equals(this.lastView) || !cam.projectionMatrix.equals(this.lastProj)) {
      this.still = 0;
      this.lastView.copy(cam.matrixWorld);
      this.lastProj.copy(cam.projectionMatrix);
    }
    const acc = this.acc;
    const n = Math.min(this.still, this.maxAccumulate);
    if (acc) acc.weight = 1 / (n + 1);
    const jitter = acc && this.maxAccumulate > 0 && this.still > 0;
    if (jitter) this.jitter(this.still, this.width * this.pixelRatio, this.height * this.pixelRatio);
    this.composer.render();
    if (jitter) {
      cam.clearViewOffset();
      this.lastProj.copy(cam.projectionMatrix);
    }
    this.still++;
    this.passes = this.composer.passes.filter((p) => p.enabled).length;
  }

  private jitter(i: number, w: number, h: number): void {
    const [jx, jy] = JITTER[i % JITTER.length];
    this.camera.setViewOffset(w, h, jx, jy, w, h);
  }

  /**
   * A supersampled still of the current view: rendered at `scale` × the canvas resolution with `samples`
   * jittered frames averaged per pixel. Returns null when it cannot be done (no post-processing, too
   * little memory…); the caller then saves the canvas as it is.
   */
  capture(scale: number, samples: number): HTMLCanvasElement | null {
    const composer = this.composer;
    if (!composer || (scale <= 1 && samples <= 1)) return null;
    const gl = this.renderer;
    const max = Math.min(gl.capabilities.maxTextureSize, 4096);
    let w = Math.round(this.width * this.pixelRatio * scale);
    let h = Math.round(this.height * this.pixelRatio * scale);
    const fit = Math.min(1, max / Math.max(w, h), Math.sqrt(8.3e6 / (w * h)));
    w = Math.max(1, Math.floor(w * fit));
    h = Math.max(1, Math.floor(h * fit));
    const acc = this.acc ?? new AccumulatePass(w, h);
    const own = !this.acc;
    if (own) composer.addPass(acc);
    const out = new THREE.WebGLRenderTarget(w, h, { depthBuffer: false });
    const restore = () => {
      if (own) {
        composer.removePass(acc);
        acc.dispose();
      }
      out.dispose();
      composer.setPixelRatio(this.pixelRatio);
      composer.setSize(this.width, this.height);
      this.ao?.setSize(this.width, this.height);
      this.camera.clearViewOffset();
      this.still = 0;
    };
    try {
      composer.setPixelRatio(1);
      composer.setSize(w, h);
      this.ao?.setSize(w, h);
      for (let i = 0; i < samples; i++) {
        acc.weight = 1 / (i + 1);
        if (samples > 1) this.jitter(i + 1, w, h);
        else this.camera.clearViewOffset();
        composer.render();
      }
      // copy the average into an 8-bit target and read it back
      const copy = new THREE.MeshBasicMaterial({ map: acc.result.texture, toneMapped: false, depthTest: false, depthWrite: false });
      const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), copy);
      const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      const prevSpace = gl.outputColorSpace;
      gl.outputColorSpace = THREE.LinearSRGBColorSpace; // the average is already display-ready
      gl.setRenderTarget(out);
      gl.render(quad, ortho);
      gl.outputColorSpace = prevSpace;
      gl.setRenderTarget(null);
      copy.dispose();
      quad.geometry.dispose();
      const pixels = new Uint8Array(w * h * 4);
      gl.readRenderTargetPixels(out, 0, 0, w, h, pixels);
      restore();
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      const img = ctx.createImageData(w, h);
      const row = w * 4;
      for (let y = 0; y < h; y++) img.data.set(pixels.subarray((h - 1 - y) * row, (h - y) * row), y * row);
      for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255;
      ctx.putImageData(img, 0, 0);
      return canvas;
    } catch (err) {
      console.warn('supersampled photo failed', err);
      restore();
      return null;
    }
  }

  dispose(): void {
    this.composer?.dispose();
    this.acc?.dispose();
    this.output?.dispose();
    this.composer = null;
    this.ao = null;
    this.bloom = null;
    this.output = null;
    this.smaa = null;
    this.acc = null;
  }
}
