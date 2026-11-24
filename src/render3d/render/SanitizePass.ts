import * as THREE from 'three';
import { FullScreenQuad, Pass } from 'three/examples/jsm/postprocessing/Pass.js';

/**
 * Guard between the scene render and the effects that spread or keep pixels (bloom, accumulation):
 *  - NaN / Inf pixels (a shader dividing by zero, normalising a zero vector, a degenerate tangent…) are
 *    replaced by the average of their valid neighbours. Unguarded, bloom blurs one such pixel into a
 *    black or white block and the accumulation keeps it forever.
 *  - Fireflies: a single pixel far brighter than all four neighbours (a specular highlight caught by
 *    one pixel) is pulled down towards its neighbourhood, so it neither sparkles while moving nor
 *    blooms into a dot. Large bright areas (the sun, lamps, windows) are left alone.
 *  - Everything is clamped to a sane maximum of linear radiance.
 */
export class SanitizePass extends Pass {
  private material: THREE.ShaderMaterial;
  private quad: FullScreenQuad;

  constructor() {
    super();
    this.material = new THREE.ShaderMaterial({
      name: 'Sanitize',
      uniforms: { tDiffuse: { value: null }, texel: { value: new THREE.Vector2(1, 1) } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }',
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        uniform vec2 texel;
        varying vec2 vUv;
        const float MAX_RADIANCE = 4096.0;
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
          c.rgb = clamp( c.rgb, 0.0, MAX_RADIANCE );
          // firefly: brighter than 3x its brightest neighbour (and bright at all)
          float l = luma( c.rgb );
          float lim = max( 2.0, m * 3.0 );
          if ( l > lim ) c.rgb *= lim / l;
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
