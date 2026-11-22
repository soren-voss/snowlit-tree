import {
  HalfFloatType, NoToneMapping, PCFShadowMap, SRGBColorSpace, Uniform, WebGLRenderer,
} from 'three';
import type { DirectionalLight, Object3D, PerspectiveCamera, Scene, Vector3 } from 'three';
import {
  BlendFunction, BloomEffect, DepthOfFieldEffect, Effect, EffectComposer, EffectPass, NoiseEffect,
  RenderPass, SMAAEffect, SMAAPreset, ToneMappingEffect, ToneMappingMode, VignetteEffect,
} from 'postprocessing';
import { settings } from './quality';
import type { Quality } from './quality';

export class Rendering {
  readonly renderer: WebGLRenderer;
  readonly bloom: BloomEffect;
  private readonly composer: EffectComposer;
  private readonly depth: DepthOfFieldEffect;
  private readonly depthPass: EffectPass;
  private readonly grain: NoiseEffect;
  private readonly exposure = new Uniform(1);
  private readonly smaaPass: EffectPass;
  private focus: Object3D | Vector3 | null = null;
  private quality: Quality = 'high';
  private readonly hdr: boolean;

  constructor(canvas: HTMLCanvasElement, scene: Scene, camera: PerspectiveCamera) {
    this.renderer = new WebGLRenderer({ canvas, alpha: false, antialias: false, powerPreference: 'high-performance' });
    this.hdr = this.renderer.extensions.has('EXT_color_buffer_float');
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = NoToneMapping;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;

    this.composer = new EffectComposer(this.renderer, { frameBufferType: this.hdr ? HalfFloatType : undefined });
    this.composer.addPass(new RenderPass(scene, camera));
    this.depth = new DepthOfFieldEffect(camera, { focusDistance: 10, focusRange: 1.25, bokehScale: 3.1, resolutionScale: 0.5 });
    this.depth.target = camera.position.clone();
    this.depthPass = new EffectPass(camera, this.depth);
    this.depthPass.enabled = false;
    this.composer.addPass(this.depthPass);

    this.bloom = new BloomEffect({
      luminanceThreshold: this.hdr ? 0.85 : 0.57, luminanceSmoothing: 0.27,
      mipmapBlur: true, intensity: 0.54, radius: 0.72, levels: 6,
    });
    this.composer.addPass(new EffectPass(camera, this.bloom));
    this.smaaPass = new EffectPass(camera, new SMAAEffect({ preset: SMAAPreset.MEDIUM }));
    this.composer.addPass(this.smaaPass);

    const exposure = new Effect('SceneExposure', `
      uniform float gain;
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        outputColor = vec4(inputColor.rgb * gain, inputColor.a);
      }`, { blendFunction: BlendFunction.SRC, uniforms: new Map([['gain', this.exposure]]) });
    const tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
    const vignette = new VignetteEffect({ offset: 0.35, darkness: 0.47 });
    this.grain = new NoiseEffect({ premultiply: true, blendFunction: BlendFunction.SOFT_LIGHT });
    this.grain.blendMode.opacity.value = 0.12;
    this.composer.addPass(new EffectPass(camera, exposure, tone, vignette, this.grain));
  }

  setQuality(quality: Quality, moon: DirectionalLight): void {
    this.quality = quality;
    const tier = settings[quality];
    this.renderer.shadowMap.enabled = tier.shadows > 0;
    moon.castShadow = tier.shadows > 0;
    if (tier.shadows && moon.shadow.mapSize.x !== tier.shadows) {
      moon.shadow.map?.dispose();
      moon.shadow.map = null;
      moon.shadow.mapSize.setScalar(tier.shadows);
    }
    if (!tier.shadows && moon.shadow.map) {
      moon.shadow.map.dispose();
      moon.shadow.map = null;
    }
    this.bloom.mipmapBlurPass.levels = tier.bloomLevels;
    this.grain.blendMode.blendFunction = tier.grain ? BlendFunction.SOFT_LIGHT : BlendFunction.SKIP;
    this.smaaPass.enabled = quality !== 'low';
    this.depthPass.enabled = this.focus !== null && quality !== 'low' && this.hdr;
    this.renderer.shadowMap.needsUpdate = true;
  }

  resize(width: number, height: number): void {
    const tier = settings[this.quality];
    this.renderer.setPixelRatio(Math.min(devicePixelRatio * tier.ratioScale, tier.maxRatio));
    this.composer.setSize(width, height, false);
  }

  setFocus(target: Object3D | Vector3): void {
    this.focus = target;
    this.depthPass.enabled = this.quality !== 'low' && this.hdr;
  }

  clearFocus(): void {
    this.focus = null;
    this.depthPass.enabled = false;
  }

  setExposure(gain: number): void {
    this.exposure.value = gain;
  }

  render(delta: number): void {
    if (this.depthPass.enabled && this.focus && this.depth.target) {
      if ('getWorldPosition' in this.focus) this.focus.getWorldPosition(this.depth.target);
      else this.depth.target.copy(this.focus);
    }
    this.composer.render(delta);
  }
}
