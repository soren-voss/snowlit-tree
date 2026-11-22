import { LinearFilter, LinearMipmapLinearFilter, RepeatWrapping, SRGBColorSpace, TextureLoader } from 'three';
import type { Texture, WebGLRenderer } from 'three';

export interface TreeTextures {
  twigColor: Texture;
  twigAlpha: Texture;
  twigNormal: Texture;
  barkColor: Texture;
  barkNormal: Texture;
}

const base = `${import.meta.env.BASE_URL}assets/tree/`;

export async function loadTreeTextures(renderer: WebGLRenderer, onProgress: (fraction: number) => void): Promise<TreeTextures> {
  const loader = new TextureLoader();
  const files = ['twig-color', 'twig-alpha', 'twig-normal', 'bark-color', 'bark-normal'] as const;
  let done = 0;
  const textures = await Promise.all(files.map(async name => {
    const texture = await loader.loadAsync(`${base}${name}.jpg`);
    onProgress(++done / files.length);
    return texture;
  }));
  const [twigColor, twigAlpha, twigNormal, barkColor, barkNormal] = textures;
  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  for (const texture of textures) {
    texture.anisotropy = anisotropy;
    texture.minFilter = LinearMipmapLinearFilter;
    texture.magFilter = LinearFilter;
  }
  twigColor.colorSpace = SRGBColorSpace;
  barkColor.colorSpace = SRGBColorSpace;
  for (const texture of [barkColor, barkNormal]) {
    texture.wrapS = texture.wrapT = RepeatWrapping;
  }
  return { twigColor, twigAlpha, twigNormal, barkColor, barkNormal };
}
