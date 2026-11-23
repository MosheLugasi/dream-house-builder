import * as THREE from 'three';

/**
 * Global shader patches for every built-in material (e.g. the renderer's indoor-ambient lighting).
 * They run as the default `onBeforeCompile` of all materials; a material that sets its own
 * `onBeforeCompile` must call {@link applyShaderPatches} from it so that it gets them too.
 * Patches must be idempotent, leave shaders they do not recognise alone and be driven by uniforms
 * (never by per-frame defines), so that they do not split or recompile programs.
 */
export type ShaderPatch = (shader: THREE.WebGLProgramParametersWithUniforms) => void;

const patches: ShaderPatch[] = [];

export function applyShaderPatches(shader: THREE.WebGLProgramParametersWithUniforms): void {
  for (const p of patches) p(shader);
}

export function registerShaderPatch(patch: ShaderPatch): void {
  if (patches.includes(patch)) return;
  patches.push(patch);
  if (patches.length === 1) {
    THREE.Material.prototype.onBeforeCompile = function dhbSharedShaderPatches(shader: THREE.WebGLProgramParametersWithUniforms) {
      applyShaderPatches(shader);
    };
  }
}
