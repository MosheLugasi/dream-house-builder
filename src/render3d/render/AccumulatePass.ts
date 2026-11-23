import * as THREE from 'three';
import { FullScreenQuad, Pass } from 'three/examples/jsm/postprocessing/Pass.js';

/**
 * Last pass of the chain: averages the finished frames rendered with sub-pixel camera jitter while the
 * camera stands still (a progressive supersampling: clean edges, thin wires and smoothed AO noise), then
 * shows the average. `weight` = 1 shows the new frame alone (camera moving).
 */
export class AccumulatePass extends Pass {
  /** blend factor of the incoming frame: 1 / (number of frames averaged so far + 1) */
  weight = 1;
  private targets: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget];
  private current = 0;
  private blend: THREE.ShaderMaterial;
  private copy: THREE.ShaderMaterial;
  private blendQuad: FullScreenQuad;
  private copyQuad: FullScreenQuad;

  constructor(width: number, height: number) {
    super();
    const make = () =>
      new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    this.targets = [make(), make()];
    const vertexShader = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }';
    this.blend = new THREE.ShaderMaterial({
      name: 'Accumulate',
      uniforms: { tNew: { value: null }, tAcc: { value: null }, weight: { value: 1 } },
      vertexShader,
      fragmentShader:
        'uniform sampler2D tNew; uniform sampler2D tAcc; uniform float weight; varying vec2 vUv;\n' +
        'void main() { gl_FragColor = mix( texture2D( tAcc, vUv ), texture2D( tNew, vUv ), weight ); }',
      depthTest: false,
      depthWrite: false,
    });
    this.copy = new THREE.ShaderMaterial({
      name: 'AccumulateCopy',
      uniforms: { tDiffuse: { value: null } },
      vertexShader,
      fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main() { gl_FragColor = texture2D( tDiffuse, vUv ); }',
      depthTest: false,
      depthWrite: false,
    });
    this.blendQuad = new FullScreenQuad(this.blend);
    this.copyQuad = new FullScreenQuad(this.copy);
  }

  /** the average so far (valid after a render) */
  get result(): THREE.WebGLRenderTarget {
    return this.targets[this.current];
  }

  setSize(width: number, height: number): void {
    for (const t of this.targets) t.setSize(width, height);
  }

  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    const prev = this.targets[this.current];
    this.current ^= 1;
    const next = this.targets[this.current];
    this.blend.uniforms.tNew.value = readBuffer.texture;
    this.blend.uniforms.tAcc.value = prev.texture;
    this.blend.uniforms.weight.value = this.weight;
    renderer.setRenderTarget(next);
    this.blendQuad.render(renderer);
    this.copy.uniforms.tDiffuse.value = next.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.copyQuad.render(renderer);
  }

  dispose(): void {
    for (const t of this.targets) t.dispose();
    this.blend.dispose();
    this.copy.dispose();
    this.blendQuad.dispose();
    this.copyQuad.dispose();
  }
}
