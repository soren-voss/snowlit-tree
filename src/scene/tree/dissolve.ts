import type { Material } from 'three';

/** World-space height below which every tree part is discarded; the particle form sweeps it upward. */
export const cutHeight = { value: -10 };

export const GLSL_CUT_VERTEX = `
  #ifdef USE_INSTANCING
    vCutY = (modelMatrix * instanceMatrix * vec4(transformed, 1.)).y;
  #else
    vCutY = (modelMatrix * vec4(transformed, 1.)).y;
  #endif`;

/** Chains a height cut onto a built-in material's shader (keeps any onBeforeCompile it already has). */
export function dissolvable(material: Material, key: string): void {
  const previous = material.onBeforeCompile.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    previous(shader, renderer);
    shader.uniforms.cutHeight = cutHeight;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vCutY;')
      .replace('#include <project_vertex>', `#include <project_vertex>\n${GLSL_CUT_VERTEX}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float cutHeight;\nvarying float vCutY;')
      .replace('void main() {', 'void main() {\n  if (vCutY < cutHeight) discard;');
  };
  material.customProgramCacheKey = () => `dissolve-${key}`;
}
