import { DirectionalLight, HemisphereLight, MathUtils, PMREMGenerator, PointLight, Scene } from 'three';
import type { Object3D, Vector3 } from 'three';
import { SceneCamera } from './core/camera';
import { QualityMonitor, settings } from './core/quality';
import type { Quality } from './core/quality';
import { createRandom, readSeed } from './core/random';
import { Rendering } from './core/rendering';
import type { Timeline } from './core/timeline';
import { exampleScene } from './data/gifts';
import { createGiftBoxes } from './scene/gifts/boxes';
import { GiftReveal } from './scene/gifts/reveal';
import { createLandscape } from './scene/landscape';
import { createSky } from './scene/sky';
import { createSnow } from './scene/snow';
import { createEvergreen } from './scene/tree/evergreen';
import { BASE_BLOOM, createIllumination } from './scene/tree/illumination';
import type { LightMode, LightsState } from './scene/tree/illumination';
import { createOrnaments } from './scene/tree/ornaments';
import { GIFT_RING } from './scene/tree/shape';
import { GiftExperience } from './sequences/gifts';
import { finishLighting, igniteSequence } from './sequences/ignite';
import { barkTexture, glowTexture, needleTexture, reflectionTexture } from './textures/procedural';

type Phase = 'loading' | 'waiting' | 'igniting' | 'free' | 'error';
type FocusTarget = Vector3 | Object3D;

interface TreeDebug {
  readonly ready: boolean;
  readonly phase: Phase;
  readonly fps: number;
  readonly quality: Quality;
  readonly seed: number;
  readonly camera: SceneCamera['camera'] | undefined;
  readonly orbiting: boolean;
  readonly lights: Readonly<LightsState> | undefined;
  readonly giftRing: typeof GIFT_RING;
  readonly gifts: ReturnType<GiftExperience['summary']>;
  onIgnite?: () => void;
  ignite(): void;
  setLightMode(mode: LightMode): void;
  setFocus(target: FocusTarget): void;
  clearFocus(): void;
  openGift(id: string): boolean;
  closeGift(): boolean;
  rewrapGift(id: string): boolean;
}

declare global {
  interface Window { __tree?: TreeDebug }
}

const params = new URLSearchParams(location.search);
const seed = readSeed(params.get('seed'));
const quality = new QualityMonitor(params.get('quality'));
const skipIntro = params.get('skipIntro') === '1';
const stage = document.querySelector<HTMLElement>('#stage')!;
const canvas = document.querySelector<HTMLCanvasElement>('#scene')!;
const loading = document.querySelector<HTMLElement>('#loading')!;
const loadingStar = loading.querySelector<HTMLElement>('.loading-star')!;
const invitation = document.querySelector<HTMLButtonElement>('#ignite')!;
const error = document.querySelector<HTMLElement>('#error')!;
const giftDialog = document.querySelector<HTMLDialogElement>('#gift-dialog')!;
let phase: Phase = 'loading';
let ready = false;
let camera: SceneCamera | undefined;
let rendering: Rendering | undefined;
let lights: ReturnType<typeof createIllumination> | undefined;
let giftExperience: GiftExperience | undefined;
let ignite = () => {};

const api: TreeDebug = {
  get ready() { return ready; },
  get phase() { return phase; },
  get fps() { return quality.fps; },
  get quality() { return quality.quality; },
  get seed() { return seed; },
  get camera() { return camera?.camera; },
  get orbiting() { return camera?.orbiting ?? false; },
  get lights() { return lights?.state; },
  get giftRing() { return GIFT_RING; },
  get gifts() { return giftExperience?.summary() ?? []; },
  ignite: () => ignite(),
  setLightMode: mode => lights?.setLightMode(mode),
  setFocus: target => rendering?.setFocus(target),
  clearFocus: () => rendering?.clearFocus(),
  openGift: id => giftExperience?.open(id) ?? false,
  closeGift: () => giftExperience?.close() ?? false,
  rewrapGift: id => giftExperience?.rewrap(id) ?? false,
};

if (import.meta.env.DEV) window.__tree = api;

function setPhase(next: Phase): void {
  phase = next;
  stage.dataset.phase = next;
}

function pause(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function loadProgress(value: number): Promise<void> {
  loadingStar.style.setProperty('--load', String(value));
  return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

async function start(): Promise<void> {
  await loadProgress(.19);
  const scene = new Scene();
  const view = camera = new SceneCamera(canvas);
  const pipeline = rendering = new Rendering(canvas, scene, view.camera);
  const sky = createSky(createRandom(seed ^ 163425));
  const flakes = createSnow(createRandom(seed ^ 560917));
  const terrain = createLandscape(scene, createRandom(seed ^ 216423));
  scene.add(...sky.objects, ...flakes.objects);

  const moon = new DirectionalLight(0xb5caff, 1.83);
  moon.position.copy(terrain.moonPosition);
  moon.shadow.camera.left = moon.shadow.camera.bottom = -8.5;
  moon.shadow.camera.right = moon.shadow.camera.top = 8.5;
  moon.shadow.camera.near = .6;
  moon.shadow.camera.far = 37;
  moon.shadow.normalBias = .044;
  moon.shadow.bias = -.00022;
  moon.shadow.radius = 3;
  moon.shadow.intensity = .74;
  moon.target.position.y = 2.7;
  const fill = new DirectionalLight(0x859ecf, .63);
  fill.position.set(7, 9, 14);
  const warm = new PointLight(0xffb66b, 0, 9.5, 2);
  warm.position.set(.04, 1.23, .34);
  const ambient = new HemisphereLight(0xa9c6ff, 0x4f5268, 1.03);
  scene.add(moon, moon.target, fill, warm, ambient);
  await loadProgress(.45);

  const evergreen = createEvergreen(needleTexture(createRandom(seed ^ 4501)), barkTexture(createRandom(seed ^ 28691)), createRandom(seed ^ 221799));
  const ornaments = createOrnaments(createRandom(seed ^ 890025), evergreen.surface);
  const glow = glowTexture();
  const illumination = lights = createIllumination(createRandom(seed ^ 387149), glow, evergreen.surface);
  const boxes = createGiftBoxes(exampleScene.gifts, createRandom(seed ^ 651247), glow);
  const reveal = new GiftReveal(exampleScene.gifts, createRandom(seed ^ 349166), settings.high.giftParticles);
  const gifts = giftExperience = new GiftExperience(boxes, reveal, view, pipeline, canvas, giftDialog, () => phase === 'free');
  scene.add(evergreen.group, ornaments.group, illumination.group, ...boxes.map(box => box.root), reveal.group);
  await loadProgress(.76);

  const map = reflectionTexture(createRandom(seed ^ 839771));
  const pmrem = new PMREMGenerator(pipeline.renderer);
  const environment = pmrem.fromEquirectangular(map);
  scene.environment = environment.texture;
  ornaments.setReflection(environment.texture);
  map.dispose();
  pmrem.dispose();
  scene.environmentIntensity = .70;

  let width = 0;
  let height = 0;
  let dpr = 0;
  function resize(): void {
    width = Math.max(1, canvas.clientWidth);
    height = Math.max(1, canvas.clientHeight);
    dpr = devicePixelRatio;
    view.resize(width, height);
    pipeline.resize(width, height);
  }
  function applyQuality(): void {
    const tier = settings[quality.quality];
    evergreen.setDensity(tier.needles);
    flakes.setDensity(tier.snow);
    reveal.setDensity(tier.giftParticles);
    pipeline.setQuality(quality.quality, moon);
    resize();
  }

  let timeline: Timeline | undefined;
  let time = 0;
  let previous: number | undefined;
  const state = illumination.state;
  const draw = (delta: number) => {
    const ratio = pipeline.renderer.getPixelRatio();
    const kindled = state.ground;
    const dawn = MathUtils.smoothstep(state.bulbs, 0, 1);
    moon.intensity = MathUtils.lerp(1.34, 1.83, dawn);
    fill.intensity = MathUtils.lerp(.13, .63, dawn);
    ambient.intensity = MathUtils.lerp(.43, 1.03, dawn);
    scene.environmentIntensity = MathUtils.lerp(.29, .70, dawn);
    warm.intensity = kindled * 21;
    terrain.groundGlow.value = kindled;
    evergreen.localLight.value = kindled;
    ornaments.setLight(kindled);
    pipeline.bloom.intensity = BASE_BLOOM + state.flare * .88;
    sky.update(time, ratio);
    flakes.update(time, ratio, height);
    illumination.update(time, ratio);
    gifts.update(time, delta, ratio);
    pipeline.setExposure(MathUtils.lerp(.46, 1, dawn) * (1 - .57 * gifts.dim));
    pipeline.render(delta);
  };

  applyQuality();
  if (skipIntro) view.setIntro(1);
  const unlit = { ...state };
  finishLighting(state);
  illumination.update(0, pipeline.renderer.getPixelRatio());
  await loadProgress(.9);
  await pipeline.renderer.compileAsync(scene, view.camera);
  if (!skipIntro) Object.assign(state, unlit);
  await loadProgress(1);
  draw(0);
  await pause(250);
  loading.dataset.done = '';
  setTimeout(() => { loading.hidden = true; }, 770);
  ready = true;

  const releaseCamera = () => {
    view.enabled = true;
    setPhase('free');
  };
  ignite = () => {
    if (phase !== 'waiting') return;
    invitation.dataset.dismissed = '';
    invitation.disabled = true;
    setTimeout(() => { invitation.hidden = true; }, 480);
    setPhase('igniting');
    timeline = igniteSequence(state, view, releaseCamera);
    api.onIgnite?.();
  };
  invitation.addEventListener('click', ignite);
  if (skipIntro) releaseCamera();
  else {
    setPhase('waiting');
    invitation.hidden = false;
  }

  const frame = (timestamp: number) => {
    const elapsed = previous === undefined ? 0 : (timestamp - previous) / 1000;
    previous = timestamp;
    const delta = document.hidden ? 0 : Math.min(elapsed, .25);
    time += delta;
    if (quality.update(elapsed)) applyQuality();
    if (width !== canvas.clientWidth || height !== canvas.clientHeight || dpr !== devicePixelRatio) resize();
    if (timeline?.update(delta)) timeline = undefined;
    else view.update(delta);
    draw(delta);
    requestAnimationFrame(frame);
  };
  document.addEventListener('visibilitychange', () => { previous = undefined; quality.reset(); });
  requestAnimationFrame(frame);
}

start().catch(cause => {
  console.error(cause);
  loading.hidden = true;
  invitation.hidden = true;
  setPhase('error');
  error.textContent = '雪夜场景未能加载。请确认浏览器支持 WebGL 2，然后刷新页面。';
  error.hidden = false;
});
