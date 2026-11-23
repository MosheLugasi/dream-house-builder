import * as THREE from 'three';
import { FullScreenQuad, Pass } from 'three/examples/jsm/postprocessing/Pass.js';

/** Look of the final image, applied in the same pass as tone mapping (no extra full-screen pass). */
export interface Grade {
  /** 0 = none … 1 = full smoothstep S-curve on the display values */
  contrast: number;
  /** 1 = unchanged */
  saturation: number;
  /** darkening of the corners, 0…1 */
  vignette: number;
  /** linear white-balance multiplier applied before tone mapping */
  white: THREE.Color;
}

const TONE_DEFINES: [THREE.ToneMapping, string][] = [
  [THREE.LinearToneMapping, 'LINEAR_TONE_MAPPING'],
  [THREE.ReinhardToneMapping, 'REINHARD_TONE_MAPPING'],
  [THREE.CineonToneMapping, 'CINEON_TONE_MAPPING'],
  [THREE.ACESFilmicToneMapping, 'ACES_FILMIC_TONE_MAPPING'],
  [THREE.AgXToneMapping, 'AGX_TONE_MAPPING'],
  [THREE.NeutralToneMapping, 'NEUTRAL_TONE_MAPPING'],
];

/**
 * Drop-in replacement for three's OutputPass (tone mapping + sRGB) with a small colour grade:
 * white balance, saturation, a gentle S-curve, a vignette and dithering against banding in skies.
 */
export class GradedOutputPass extends Pass {
  readonly grade: Grade = { contrast: 0, saturation: 1, vignette: 0, white: new THREE.Color(1, 1, 1) };
  private material: THREE.RawShaderMaterial;
  private quad: FullScreenQuad;
  private toneMapping: THREE.ToneMapping | null = null;
  private colorSpace: string | null = null;
  private uniforms = {
    tDiffuse: { value: null as THREE.Texture | null },
    toneMappingExposure: { value: 1 },
    uGrade: { value: new THREE.Vector4(0, 1, 0, 0) },
    uWhite: { value: new THREE.Vector3(1, 1, 1) },
    uAspect: { value: 1 },
  };

  constructor() {
    super();
    this.material = new THREE.RawShaderMaterial({
      name: 'GradedOutput',
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        precision highp float;
        uniform mat4 modelViewMatrix;
        uniform mat4 projectionMatrix;
        attribute vec3 position;
        attribute vec2 uv;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        }`,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform sampler2D tDiffuse;
        uniform vec4 uGrade; // contrast, saturation, vignette, -
        uniform vec3 uWhite;
        uniform float uAspect;
        #include <tonemapping_pars_fragment>
        #include <colorspace_pars_fragment>
        varying vec2 vUv;
        void main() {
          vec4 c = texture2D( tDiffuse, vUv );
          c.rgb *= uWhite;
          #ifdef LINEAR_TONE_MAPPING
            c.rgb = LinearToneMapping( c.rgb );
          #elif defined( REINHARD_TONE_MAPPING )
            c.rgb = ReinhardToneMapping( c.rgb );
          #elif defined( CINEON_TONE_MAPPING )
            c.rgb = CineonToneMapping( c.rgb );
          #elif defined( ACES_FILMIC_TONE_MAPPING )
            c.rgb = ACESFilmicToneMapping( c.rgb );
          #elif defined( AGX_TONE_MAPPING )
            c.rgb = AgXToneMapping( c.rgb );
          #elif defined( NEUTRAL_TONE_MAPPING )
            c.rgb = NeutralToneMapping( c.rgb );
          #endif
          float luma = dot( c.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
          c.rgb = max( mix( vec3( luma ), c.rgb, uGrade.y ), 0.0 );
          #ifdef SRGB_TRANSFER
            c = sRGBTransferOETF( c );
          #endif
          // S-curve on display values: deeper shadows, brighter highlights, same mid grey
          vec3 s = clamp( c.rgb, 0.0, 1.0 );
          c.rgb = mix( s, s * s * ( 3.0 - 2.0 * s ), uGrade.x );
          vec2 v = ( vUv - 0.5 ) * vec2( uAspect, 1.0 ) / sqrt( uAspect * uAspect * 0.25 + 0.25 );
          c.rgb *= 1.0 - uGrade.z * smoothstep( 0.45, 1.05, length( v ) );
          // triangular dither, +-1/255: no banding in the sky and in soft shadows
          vec2 q = gl_FragCoord.xy;
          float n = fract( sin( dot( q, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ) + fract( sin( dot( q, vec2( 39.3468, 11.1353 ) ) ) * 24634.6345 ) - 1.0;
          c.rgb += n / 255.0;
          gl_FragColor = c;
        }`,
    });
    this.quad = new FullScreenQuad(this.material);
  }

  setSize(width: number, height: number): void {
    this.uniforms.uAspect.value = width / Math.max(1, height);
  }

  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    const u = this.uniforms;
    u.tDiffuse.value = readBuffer.texture;
    u.toneMappingExposure.value = renderer.toneMappingExposure;
    const g = this.grade;
    u.uGrade.value.set(g.contrast, g.saturation, g.vignette, 0);
    u.uWhite.value.set(g.white.r, g.white.g, g.white.b);
    if (this.toneMapping !== renderer.toneMapping || this.colorSpace !== renderer.outputColorSpace) {
      this.toneMapping = renderer.toneMapping;
      this.colorSpace = renderer.outputColorSpace;
      const defines: Record<string, string> = {};
      if (THREE.ColorManagement.getTransfer(this.colorSpace) === THREE.SRGBTransfer) defines.SRGB_TRANSFER = '';
      const tone = TONE_DEFINES.find(([t]) => t === this.toneMapping);
      if (tone) defines[tone[1]] = '';
      this.material.defines = defines;
      this.material.needsUpdate = true;
    }
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    if (!this.renderToScreen && this.clear) renderer.clear();
    this.quad.render(renderer);
  }

  dispose(): void {
    this.material.dispose();
    this.quad.dispose();
  }
}
