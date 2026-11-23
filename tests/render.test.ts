import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { applyShaderPatches } from '../src/materials/shaderPatches';
import { patchIndoorShader } from '../src/render3d/render/IndoorAmbient';
import { PRESETS } from '../src/render3d/render/presets';
import { snapToShadowTexels } from '../src/render3d/render/Realism';
import { loadQuality, QUALITIES } from '../src/store/quality';

describe('render quality presets', () => {
  it('defaults to high and defines every preset', () => {
    expect(loadQuality()).toBe('high');
    for (const q of QUALITIES) expect(PRESETS[q].quality).toBe(q);
  });

  it('only ultra turns on the expensive effects', () => {
    for (const q of ['low', 'high'] as const) {
      const p = PRESETS[q];
      expect(p.grass).toBe(false);
      expect(p.lampShadows).toBe(0);
      expect(p.accumulate).toBe(0);
    }
    expect(PRESETS.low.post).toBe(false);
    expect(PRESETS.low.windowLights).toBe(0);
    expect(PRESETS.ultra.grass).toBe(true);
  });
});

describe('shadow map snapping', () => {
  it('puts the centre on the texel grid of the light view and keeps it close', () => {
    const light = new THREE.Vector3(0.4, 0.8, 0.3).normalize();
    const texel = 0.0127;
    const c = new THREE.Vector3(12.345, 0, -7.891);
    const before = c.clone();
    snapToShadowTexels(c, light, texel);
    const x = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), light).normalize();
    const y = new THREE.Vector3().crossVectors(light, x).normalize();
    for (const axis of [x, y]) {
      const t = c.dot(axis) / texel;
      expect(Math.abs(t - Math.round(t))).toBeLessThan(1e-6);
    }
    expect(c.distanceTo(before)).toBeLessThan(texel);
  });
});

describe('indoor ambient shader patch', () => {
  const lit = () => ({
    vertexShader: '#include <common>\n#include <project_vertex>\n',
    fragmentShader: '#include <common>\n#include <lights_fragment_end>\n',
    uniforms: {} as Record<string, THREE.IUniform>,
  });

  it('patches lit shaders once and leaves others alone', () => {
    const s = lit() as unknown as THREE.WebGLProgramParametersWithUniforms;
    patchIndoorShader(s);
    patchIndoorShader(s);
    expect(s.fragmentShader.match(/uniform vec2 dhbIndoorAmount/g)?.length).toBe(1);
    expect(s.uniforms.dhbIndoorMap).toBeDefined();
    const plain = { vertexShader: 'void main(){}', fragmentShader: 'void main(){}', uniforms: {} } as unknown as THREE.WebGLProgramParametersWithUniforms;
    applyShaderPatches(plain);
    expect(plain.fragmentShader).toBe('void main(){}');
  });

  it('is the default hook of every material', () => {
    const s = lit() as unknown as THREE.WebGLProgramParametersWithUniforms;
    new THREE.MeshStandardMaterial().onBeforeCompile(s, {} as THREE.WebGLRenderer);
    expect(s.vertexShader).toContain('vDhbWorld');
  });
});
