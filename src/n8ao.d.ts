declare module 'n8ao' {
  import type { Camera, Color, Scene, WebGLRenderTarget } from 'three';
  import { Pass } from 'three/examples/jsm/postprocessing/Pass.js';
  export class N8AOPass extends Pass {
    constructor(scene: Scene, camera: Camera, width?: number, height?: number);
    configuration: {
      aoRadius: number;
      distanceFalloff: number;
      intensity: number;
      color: Color;
      halfRes: boolean;
      gammaCorrection: boolean;
      aoSamples: number;
      denoiseSamples: number;
      denoiseRadius: number;
      screenSpaceRadius: boolean;
      depthAwareUpsampling: boolean;
      transparencyAware: boolean;
    };
    /** re-enables `transparencyAware` every frame when any material in the scene is transparent */
    autoDetectTransparency: boolean;
    /** the target the scene is rendered into (colour + depth texture) */
    beautyRenderTarget: WebGLRenderTarget;
    setSize(width: number, height: number): void;
    setQualityMode(mode: 'Performance' | 'Low' | 'Medium' | 'High' | 'Ultra'): void;
  }
}
