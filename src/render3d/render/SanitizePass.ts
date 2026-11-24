import * as THREE from 'three';
import { FullScreenQuad, Pass } from 'three/examples/jsm/postprocessing/Pass.js';

/**
 * Guard between the scene render and the effects that spread or keep pixels (bloom, accumulation):
 *  - NaN / Inf pixels (a shader dividing by zero, normalising a zero vector, a degenerate tangent…) are
 *    replaced by the average of their valid neighbours. Unguarded, bloom blurs one such pixel into a
 *    black or white block and the accumulation keeps it forever.
 *  - Fireflies: a spot of up to ~7 pixels far brighter than its surroundings (a specular glint, a
 *    far lamp's bulb, drawn on some frames and not on others) is pulled down towards its surroundings,
 *    so it neither sparkles while moving nor blooms into a blinking dot. Large bright areas (the sun,
 *    lamp glows, windows) and lines are left alone.
 *  - Everything is clamped to a sane maximum of linear radiance (64: far above any lamp, window or sky,
 *    only the sun's disc and stray specular spikes reach it; the image is tone mapped to white long
 *    before, so the cap only keeps such spikes from dominating bloom).
 */
export class SanitizePass extends Pass {
  private material: THREE.ShaderMaterial;
  private quad: FullScreenQuad;

  constructor() {
    super();
    this.material = new THREE.ShaderMaterial({
      name: 'Sanitize',
      uniforms: { tDiffuse: { value: null }, texel: { value: new THREE.Vector2(1, 1) }, maxRadiance: { value: 64 } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }',
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        uniform vec2 texel;
        varying vec2 vUv;
        uniform float maxRadiance;
        bool bad( vec4 c ) {
          return any( isnan( c ) ) || any( isinf( c ) );
        }
        float luma( vec3 c ) { return dot( c, vec3( 0.2126, 0.7152, 0.0722 ) ); }
        void main() {
          vec4 c = texture2D( tDiffuse, vUv );
          vec4 n0 = texture2D( tDiffuse, vUv + vec2( texel.x, 0.0 ) );
          vec4 n1 = texture2D( tDiffuse, vUv - vec2( texel.x, 0.0 ) );
          vec4 n2 = texture2D( tDiffuse, vUv + vec2( 0.0, texel.y ) );
          vec4 n3 = texture2D( tDiffuse, vUv - vec2( 0.0, texel.y ) );
          vec4 sum = vec4( 0.0 );
          float cnt = 0.0;
          float m = 0.0;
          if ( !bad( n0 ) ) { sum += n0; cnt += 1.0; m = max( m, luma( n0.rgb ) ); }
          if ( !bad( n1 ) ) { sum += n1; cnt += 1.0; m = max( m, luma( n1.rgb ) ); }
          if ( !bad( n2 ) ) { sum += n2; cnt += 1.0; m = max( m, luma( n2.rgb ) ); }
          if ( !bad( n3 ) ) { sum += n3; cnt += 1.0; m = max( m, luma( n3.rgb ) ); }
          if ( bad( c ) ) c = cnt > 0.0 ? sum / cnt : vec4( 0.0, 0.0, 0.0, 1.0 );
          c.rgb = clamp( c.rgb, 0.0, maxRadiance );
          // fireflies: a hot spot of up to ~7 pixels much brighter than the rings of pixels 2 and 4 away
          // (a glint, a far lamp's head lit by its own light: drawn on some frames and not on others) is
          // pulled down to 3× its surroundings, never below 2 (the brightest stars). Bright areas and lines
          // reach the rings: untouched.
          float l = luma( c.rgb );
          if ( l > 2.0 ) {
            float r2 = 0.0;
            float r4 = 0.0;
            for ( int i = 0; i < 8; i++ ) {
              float a = float( i ) * 0.785398;
              vec2 d = vec2( cos( a ), sin( a ) ) * texel;
              vec4 q = texture2D( tDiffuse, vUv + d * 2.0 );
              vec4 p = texture2D( tDiffuse, vUv + d * 4.0 );
              if ( !bad( q ) ) r2 = max( r2, luma( q.rgb ) );
              if ( !bad( p ) ) r4 = max( r4, luma( p.rgb ) );
            }
            float lim = max( 2.0, min( m, min( r2, r4 ) ) * 3.0 );
            if ( l > lim ) c.rgb *= lim / l;
          }
          gl_FragColor = c;
        }`,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.material);
  }

  setSize(width: number, height: number): void {
    this.material.uniforms.texel.value.set(1 / Math.max(1, width), 1 / Math.max(1, height));
  }

  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    this.material.uniforms.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }

  dispose(): void {
    this.material.dispose();
    this.quad.dispose();
  }
}
