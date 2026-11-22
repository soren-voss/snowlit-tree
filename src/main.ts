import { DirectionalLight, HemisphereLight, MathUtils, PMREMGenerator, PointLight, Raycaster, Scene, Vector2, Vector3 } from 'three';
import type { Object3D } from 'three';
import { AudioDirector } from './audio/audio';
import { SceneCamera } from './core/camera';
import { QualityMonitor, settings } from './core/quality';
import type { Quality } from './core/quality';
import { createRandom, readSeed } from './core/random';
import { Rendering } from './core/rendering';
import { call, sequence, Timeline, wait, parallel } from './core/timeline';
import type { Clip } from './core/timeline';
import { cloneScene, exampleScene, LIMITS, presetImage } from './data/gifts';
import type { Gift, MusicId, TreeScene } from './data/gifts';
import { compressImage } from './data/images';
import { readSharedScene } from './data/share';
import { blobUrl, collectBlobs, forgetUrl, loadScene, MUSIC_KEY, putBlob, saveScene } from './data/store';
import { createGiftBoxes } from './scene/gifts/boxes';
import { GiftReveal } from './scene/gifts/reveal';
import { createLandscape } from './scene/landscape';
import { createSky } from './scene/sky';
import { createSnow } from './scene/snow';
import { THEMES } from './scene/theme';
import { cutHeight } from './scene/tree/dissolve';
import { createEvergreen } from './scene/tree/evergreen';
import { BASE_BLOOM, createIllumination } from './scene/tree/illumination';
import type { LightMode, LightsState } from './scene/tree/illumination';
import { createMagic } from './scene/tree/magic';
import { createOrnaments } from './scene/tree/ornaments';
import { GIFT_RING } from './scene/tree/shape';
import { createWishes } from './scene/tree/wishes';
import { createStarTrail, starFlight } from './sequences/finale';
import { GiftExperience } from './sequences/gifts';
import type { GiftCue } from './sequences/gifts';
import { finishLighting, igniteSequence } from './sequences/ignite';
import { loadTreeTextures } from './textures/assets';
import { glowTexture, reflectionTexture } from './textures/procedural';
import { toast } from './ui/dom';
import { Editor } from './ui/editor';
import type { Change } from './ui/editor';
import { Hud } from './ui/hud';

type Phase = 'loading' | 'waiting' | 'igniting' | 'free' | 'error';
type FocusTarget = Vector3 | Object3D;

interface TreeDebug {
  readonly ready: boolean;
  readonly phase: Phase;
  readonly fps: number;
  readonly quality: Quality;
  readonly seed: number;
  readonly guest: boolean;
  readonly camera: SceneCamera['camera'] | undefined;
  readonly orbiting: boolean;
  readonly lights: Readonly<LightsState> | undefined;
  readonly giftRing: typeof GIFT_RING;
  readonly gifts: ReturnType<GiftExperience['summary']>;
  readonly scene: TreeScene | undefined;
  readonly magic: number;
  readonly demoRunning: boolean;
  readonly world: Scene | undefined;
  readonly stats: { calls: number; triangles: number; textures: number } | undefined;
  onIgnite?: () => void;
  ignite(): void;
  setLightMode(mode: LightMode): void;
  setFocus(target: FocusTarget): void;
  clearFocus(): void;
  openGift(id: string): boolean;
  closeGift(): boolean;
  rewrapGift(id: string): boolean;
  setMagic(on: boolean): void;
  openEditor(): void;
  closeEditor(): void;
  addWish(text: string): void;
  playFinale(): void;
  startDemo(): void;
}

declare global {
  interface Window { __tree?: TreeDebug }
}

const params = new URLSearchParams(location.search);
const seed = readSeed(params.get('seed'));
const quality = new QualityMonitor(params.get('quality'));
const skipIntro = params.get('skipIntro') === '1';
const shared = readSharedScene();
const guest = shared !== null;
const stage = document.querySelector<HTMLElement>('#stage')!;
const canvas = document.querySelector<HTMLCanvasElement>('#scene')!;
const loading = document.querySelector<HTMLElement>('#loading')!;
const loadingStar = loading.querySelector<HTMLElement>('.loading-star')!;
const invitation = document.querySelector<HTMLButtonElement>('#ignite')!;
const error = document.querySelector<HTMLElement>('#error')!;
const giftDialog = document.querySelector<HTMLDialogElement>('#gift-dialog')!;
const audio = new AudioDirector();
let phase: Phase = 'loading';
let ready = false;
let camera: SceneCamera | undefined;
let rendering: Rendering | undefined;
let lights: ReturnType<typeof createIllumination> | undefined;
let giftExperience: GiftExperience | undefined;
let scene: TreeScene | undefined;
let worldRef: Scene | undefined;
let magicForm = () => 0;
let demoRunning = false;
let ignite = () => {};
const actions = {
  setMagic: (_on: boolean) => {}, openEditor: () => {}, closeEditor: () => {}, addWish: (_text: string) => {}, playFinale: () => {}, startDemo: () => {},
};

const api: TreeDebug = {
  get ready() { return ready; },
  get phase() { return phase; },
  get fps() { return quality.fps; },
  get quality() { return quality.quality; },
  get seed() { return seed; },
  get guest() { return guest; },
  get camera() { return camera?.camera; },
  get orbiting() { return camera?.orbiting ?? false; },
  get lights() { return lights?.state; },
  get giftRing() { return GIFT_RING; },
  get gifts() { return giftExperience?.summary() ?? []; },
  get scene() { return scene; },
  get magic() { return magicForm(); },
  get demoRunning() { return demoRunning; },
  get world() { return worldRef; },
  get stats() {
    const info = rendering?.renderer.info;
    return info ? { calls: info.render.calls, triangles: info.render.triangles, textures: info.memory.textures } : undefined;
  },
  ignite: () => ignite(),
  setLightMode: mode => lights?.setLightMode(mode),
  setFocus: target => rendering?.setFocus(target),
  clearFocus: () => rendering?.clearFocus(),
  openGift: id => giftExperience?.open(id) ?? false,
  closeGift: () => giftExperience?.close() ?? false,
  rewrapGift: id => giftExperience?.rewrap(id) ?? false,
  setMagic: on => actions.setMagic(on),
  openEditor: () => actions.openEditor(),
  closeEditor: () => actions.closeEditor(),
  addWish: text => actions.addWish(text),
  playFinale: () => actions.playFinale(),
  startDemo: () => actions.startDemo(),
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
  await loadProgress(.12);
  let tree = shared ?? await loadScene() ?? cloneScene(exampleScene);
  scene = tree;
  const imageUrls = new Map<string, string>();
  async function resolveImages(): Promise<void> {
    for (const gift of tree.gifts) {
      if (gift.image.kind !== 'upload' || imageUrls.has(gift.image.blobKey)) continue;
      const url = await blobUrl(gift.image.blobKey);
      if (url) imageUrls.set(gift.image.blobKey, url);
      else gift.image = { kind: 'none' };
    }
  }
  await resolveImages();
  const imageFor = (gift: Gift) => gift.image.kind === 'preset' ? presetImage(gift.image)
    : gift.image.kind === 'upload' ? imageUrls.get(gift.image.blobKey) : undefined;
  if (tree.recipient) {
    document.title = `送给${tree.recipient}的圣诞树 · 雪夜礼物树`;
    invitation.querySelector('span')!.textContent = `${tree.recipient}，轻触点亮`;
  }

  await loadProgress(.19);
  const world = worldRef = new Scene();
  const view = camera = new SceneCamera(canvas);
  const pipeline = rendering = new Rendering(canvas, world, view.camera);
  const sky = createSky(createRandom(seed ^ 163425));
  const flakes = createSnow(createRandom(seed ^ 560917));
  const terrain = createLandscape(world, createRandom(seed ^ 216423));
  world.add(...sky.objects, ...flakes.objects);

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
  world.add(moon, moon.target, fill, warm, ambient);
  const textures = await loadTreeTextures(pipeline.renderer, fraction => {
    loadingStar.style.setProperty('--load', String(.19 + .3 * fraction));
  });
  await loadProgress(.5);

  const evergreen = createEvergreen(textures, createRandom(seed ^ 221799));
  const ornaments = createOrnaments(createRandom(seed ^ 890025), evergreen.surface);
  const glow = glowTexture();
  const illumination = lights = createIllumination(createRandom(seed ^ 387149), glow, evergreen.surface);
  evergreen.setBulbGlow(illumination.glowMap);
  const magic = createMagic(createRandom(seed ^ 774411), evergreen.samples, settings.high.magicParticles);
  magicForm = () => magic.form;
  const wishes = createWishes(evergreen.surface, glow);
  const trail = createStarTrail();
  let giftSet = createGiftBoxes(tree.gifts, createRandom(seed ^ 651247), glow);
  const reveal = new GiftReveal(createRandom(seed ^ 349166), settings.high.giftParticles);
  world.add(evergreen.group, ornaments.group, illumination.group, magic.points, wishes.group, trail.points, reveal.group);
  world.add(...giftSet.boxes.map(box => box.root), giftSet.props);
  await loadProgress(.76);

  const map = reflectionTexture(createRandom(seed ^ 839771));
  const pmrem = new PMREMGenerator(pipeline.renderer);
  const environment = pmrem.fromEquirectangular(map);
  world.environment = environment.texture;
  ornaments.setReflection(environment.texture);
  illumination.setReflection(environment.texture);
  map.dispose();
  pmrem.dispose();
  world.environmentIntensity = .70;

  // ---------- scene content (theme, snow, music, wishes, gifts) ----------
  function applyTheme(): void {
    const theme = THEMES[tree.theme];
    ornaments.setTheme(theme);
    illumination.setTheme(theme);
    evergreen.uniforms.spill.value.set(...theme.spill);
    magic.setTheme(theme);
  }
  function applySnow(): void {
    flakes.setDensity(settings[quality.quality].snow * tree.snow);
    evergreen.uniforms.snowAmount.value = .16 * (.3 + .7 * tree.snow);
  }
  async function applyMusic(): Promise<void> {
    let track: MusicId = tree.music;
    if (track === 'upload') {
      const url = guest ? undefined : await blobUrl(MUSIC_KEY);
      if (url) audio.setUploadedMusic(url);
      else track = 'silent-night';
    }
    audio.setTrack(track);
  }

  const effects: Timeline[] = [];
  let finalePlayed = false;
  const finaleTitle = () => tree.recipient ? `圣诞快乐，${tree.recipient}` : '圣诞快乐';

  const onCue = (name: GiftCue) => {
    if (name === 'release') audio.ribbon();
    else if (name === 'lid') audio.lid();
    else if (name === 'burst') audio.sparkle(0, 6);
    else if (name === 'card') audio.sparkle(0, 3);
    else if (name === 'closed' && !demoRunning && !finalePlayed && gifts.allOpened) playFinale();
  };
  let editor: Editor | undefined;
  const gifts = giftExperience = new GiftExperience(giftSet.boxes, reveal, view, pipeline, canvas, giftDialog,
    () => phase === 'free' && magic.form === 0, {
      imageFor,
      pick: box => {
        if (!editor?.isOpen) return false;
        editor.select(box.data.id);
        return true;
      },
      cue: onCue,
    });

  let rebuildTimer: ReturnType<typeof setTimeout> | undefined;
  function rebuildGifts(): void {
    clearTimeout(rebuildTimer);
    if (gifts.busy) {
      rebuildTimer = setTimeout(rebuildGifts, 300);
      return;
    }
    const opened = new Set(giftSet.boxes.filter(box => box.opened).map(box => box.data.id));
    world.remove(...giftSet.boxes.map(box => box.root), giftSet.props);
    giftSet.dispose();
    giftSet = createGiftBoxes(tree.gifts.map(gift => ({ ...gift, opened: opened.has(gift.id) })), createRandom(seed ^ 651247), glow);
    world.add(...giftSet.boxes.map(box => box.root), giftSet.props);
    gifts.setBoxes(giftSet.boxes);
    syncGiftData();
    pipeline.renderer.shadowMap.needsUpdate = true;
  }
  function syncGiftData(): void {
    for (const box of giftSet.boxes) {
      const gift = tree.gifts.find(item => item.id === box.data.id);
      if (gift) box.data = gift;
    }
  }

  let collectTimer: ReturnType<typeof setTimeout> | undefined;
  function commit(change: Change): void {
    if (!guest) void saveScene(tree);
    if (change === 'text' || change === 'image') syncGiftData();
    else if (change === 'layout') {
      clearTimeout(rebuildTimer);
      rebuildTimer = setTimeout(rebuildGifts, 120);
    } else if (change === 'theme') applyTheme();
    else if (change === 'snow') applySnow();
    else if (change === 'music') void applyMusic();
    else if (change === 'wishes') wishes.set(tree.wishes);
    if (!guest && (change === 'layout' || change === 'image')) {
      clearTimeout(collectTimer);
      collectTimer = setTimeout(() => void collectBlobs(tree), 3000);
    }
  }

  async function replaceScene(next: TreeScene): Promise<void> {
    tree = scene = next;
    await resolveImages();
    await saveScene(tree, true);
    rebuildGifts();
    applyTheme();
    applySnow();
    await applyMusic();
    wishes.set(tree.wishes);
    finalePlayed = false;
    void collectBlobs(tree);
  }

  // ---------- interface ----------
  const hud = new Hud(stage, {
    wish: () => void makeWish(),
    magic: () => setMagic(magic.target === 0),
    edit: () => openEditor(),
    sound: () => {
      audio.unlock();
      audio.setMuted(!audio.muted);
      hud.setMuted(audio.muted);
    },
  }, guest);
  hud.setMuted(audio.muted);

  if (!guest) {
    editor = new Editor({
      get scene() { return tree; },
      commit,
      imageFor,
      async uploadPhoto(file) {
        const key = await putBlob(await compressImage(file));
        const url = await blobUrl(key);
        if (url) imageUrls.set(key, url);
        return { kind: 'upload', blobKey: key };
      },
      async uploadMusic(file) {
        if (file.size > 30 * 1024 * 1024) throw new Error('too large');
        await putBlob(file, MUSIC_KEY);
        forgetUrl(MUSIC_KEY);
      },
      replaceScene,
      resetScene: () => replaceScene(cloneScene(exampleScene)),
      closeEditor,
      startRecording,
    });
    stage.append(editor.element);
  }

  function updateInset(): void {
    if (!editor?.isOpen) {
      view.setInset(0, 0);
      return;
    }
    const rect = editor.element.getBoundingClientRect();
    if (rect.width >= stage.clientWidth * .9) view.setInset(0, rect.height);
    else view.setInset(rect.width, 0);
  }

  function openEditor(): void {
    if (guest) {
      location.href = `${location.pathname}`;
      return;
    }
    if (phase !== 'free' || gifts.busy || demoRunning || !editor) return;
    setMagic(false);
    hud.hideWishNote();
    hud.hideHint();
    editor.open();
    requestAnimationFrame(updateInset);
  }

  function closeEditor(): void {
    editor?.close();
    gifts.selected = undefined;
    updateInset();
  }

  function setMagic(on: boolean): void {
    if (on && (phase !== 'free' || gifts.busy)) return;
    if ((magic.target === 1) === on) return;
    magic.setTarget(on ? 1 : 0);
    hud.setMagic(on);
    hud.hideWishNote();
    audio.whoosh(on);
  }

  async function makeWish(): Promise<void> {
    if (phase !== 'free' || gifts.busy) return;
    if (tree.wishes.length >= LIMITS.wishes) {
      toast('树上已经挂满愿望了');
      return;
    }
    const text = await hud.askWish();
    if (text) addWish(text);
  }

  function addWish(text: string): void {
    setMagic(false);
    const id = wishes.createId(view.camera.position);
    tree.wishes.push({ id, text: Array.from(text).slice(0, LIMITS.wish).join('') });
    wishes.set(tree.wishes);
    const from = new Vector3(0, -.7, -2.2).applyMatrix4(view.camera.matrixWorld);
    wishes.launch(id, from, () => audio.wish());
    if (!guest) void saveScene(tree);
  }

  function playFinale(): void {
    finalePlayed = true;
    const bearing = Math.atan2(view.camera.position.x, view.camera.position.z);
    sky.shower(bearing);
    audio.finale();
    effects.push(new Timeline(sequence(
      parallel(
        starFlight(illumination.star, illumination.starHome, bearing, trail, state),
        sequence(wait(1.4), call(() => hud.showFinale(finaleTitle(), tree.message))),
      ),
      wait(3.6),
      call(() => hud.hideFinale()),
    )));
  }

  // ---------- recording mode ----------
  let recording = params.get('record') === '1';
  let demo: Timeline | undefined;
  function startRecording(): void {
    closeEditor();
    recording = true;
    hud.flashHelp();
  }
  function stopDemo(): void {
    demo = undefined;
    demoRunning = false;
    view.autoOrbit = false;
    view.orbitSpeed = .065;
  }
  function startDemo(): void {
    if (demo || gifts.busy || (phase !== 'free' && phase !== 'waiting')) return;
    closeEditor();
    hud.setClean(true);
    hud.hideWishNote();
    hud.hideFinale();
    setMagic(false);
    for (const box of giftSet.boxes) if (box.opened) {
      box.opened = false;
      box.release = box.lidTravel = box.marker = 0;
    }
    const featured = [...giftSet.boxes]
      .sort((a, b) => Math.abs(Math.atan2(a.anchor.x, a.anchor.z)) - Math.abs(Math.atan2(b.anchor.x, b.anchor.z)))
      .slice(0, 2);
    const steps: Clip[] = [];
    if (phase === 'waiting') steps.push(call(() => ignite()), wait(6.8));
    else steps.push(call(() => view.setIntro(1)), wait(.4));
    steps.push(call(() => { view.autoOrbit = true; view.orbitSpeed = .16; }), wait(3.2), call(() => { view.autoOrbit = false; }), wait(.8));
    for (const box of featured) steps.push(call(() => gifts.open(box.data.id)), wait(6), call(() => gifts.close()), wait(1.7));
    steps.push(call(() => setMagic(true)), wait(6.2), call(() => setMagic(false)), wait(3.4));
    steps.push(call(() => hud.showFinale(finaleTitle(), tree.message)), wait(5), call(() => hud.hideFinale()), call(stopDemo));
    demoRunning = true;
    demo = new Timeline(sequence(...steps));
  }
  addEventListener('keydown', event => {
    if (!recording || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.repeat) return;
    const key = event.key.toLowerCase();
    if (key === 'h') hud.setClean(!hud.clean);
    else if (key === 'f') hud.toggleFrame();
    else if (key === 'd') startDemo();
    else if (key === 'escape') {
      stopDemo();
      hud.setClean(false);
      hud.toggleFrame(false);
      recording = false;
    }
  });
  Object.assign(actions, { setMagic, openEditor, closeEditor, addWish, playFinale, startDemo });

  // ---------- wish notes ----------
  const ray = new Raycaster();
  const pointer = new Vector2();
  let noteFor: string | undefined;
  let press: { x: number; y: number } | undefined;
  canvas.addEventListener('pointerdown', event => { press = { x: event.clientX, y: event.clientY }; });
  canvas.addEventListener('pointerup', event => {
    if (!press || Math.hypot(event.clientX - press.x, event.clientY - press.y) > 8 || phase !== 'free' || gifts.busy) return;
    press = undefined;
    const bounds = canvas.getBoundingClientRect();
    pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, 1 - (event.clientY - bounds.top) / bounds.height * 2);
    ray.setFromCamera(pointer, view.camera);
    const wish = magic.form === 0 ? wishes.pick(ray) : undefined;
    noteFor = wish?.id;
    if (wish) {
      hud.showWishNote(wish.text);
      audio.sparkle(0, 2);
    } else hud.hideWishNote();
  });
  const projected = new Vector3();

  // ---------- frame loop ----------
  let width = 0;
  let height = 0;
  let dpr = 0;
  function resize(): void {
    width = Math.max(1, canvas.clientWidth);
    height = Math.max(1, canvas.clientHeight);
    dpr = devicePixelRatio;
    view.resize(width, height);
    pipeline.resize(width, height);
    updateInset();
  }
  function applyQuality(): void {
    const tier = settings[quality.quality];
    evergreen.setDensity(tier.needles);
    applySnow();
    reveal.setDensity(tier.giftParticles);
    magic.setDensity(tier.magicParticles);
    pipeline.setQuality(quality.quality, moon);
    resize();
  }

  let timeline: Timeline | undefined;
  let time = 0;
  let previous: number | undefined;
  let treeShadows = true;
  const state = illumination.state;
  const draw = (delta: number) => {
    const ratio = pipeline.renderer.getPixelRatio();
    const kindled = state.ground;
    const dawn = MathUtils.smoothstep(state.bulbs, 0, 1);
    moon.intensity = MathUtils.lerp(1.34, 1.83, dawn);
    fill.intensity = MathUtils.lerp(.13, .63, dawn);
    ambient.intensity = MathUtils.lerp(.43, 1.03, dawn);
    world.environmentIntensity = MathUtils.lerp(.29, .70, dawn);
    warm.intensity = kindled * 4;
    terrain.groundGlow.value = kindled;
    evergreen.uniforms.bulbReach.value = state.bulbs >= 1 ? 1.05 : state.bulbs;
    evergreen.uniforms.glowStrength.value = 2.6 * MathUtils.smoothstep(state.bulbs, 0, .15);
    ornaments.setLight(kindled);
    wishes.setLight(kindled);
    pipeline.bloom.intensity = BASE_BLOOM + state.flare * .88 + magic.form * .25;
    cutHeight.value = magic.update(time, delta, ratio);
    if ((magic.form > 0) === treeShadows) {
      treeShadows = !treeShadows;
      evergreen.setShadows(treeShadows);
      ornaments.setShadows(treeShadows);
      illumination.setShadows(treeShadows);
      pipeline.renderer.shadowMap.needsUpdate = true;
    }
    sky.update(time, ratio, delta);
    flakes.update(time, ratio, height);
    illumination.update(time, ratio, view.camera);
    wishes.update(time, delta);
    trail.update(illumination.star, ratio);
    gifts.update(time, delta, ratio);
    if (noteFor && hud.wishNoteOpen) {
      const anchor = wishes.anchor(noteFor);
      if (anchor) {
        projected.copy(anchor).project(view.camera);
        hud.placeWishNote((projected.x + 1) / 2 * width, (1 - projected.y) / 2 * height, projected.z < 1 && magic.form === 0);
      }
    }
    pipeline.setExposure(MathUtils.lerp(.46, 1, dawn) * (1 - .57 * gifts.dim));
    pipeline.render(delta);
  };

  applyTheme();
  wishes.set(tree.wishes);
  await applyMusic();
  applyQuality();
  if (skipIntro) view.setIntro(1);
  const unlit = { ...state };
  finishLighting(state);
  illumination.update(0, pipeline.renderer.getPixelRatio(), view.camera);
  await loadProgress(.9);
  await pipeline.renderer.compileAsync(world, view.camera);
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
    if (!recording && !demoRunning) hud.showHint();
  };
  ignite = () => {
    if (phase !== 'waiting') return;
    invitation.dataset.dismissed = '';
    invitation.disabled = true;
    setTimeout(() => { invitation.hidden = true; }, 480);
    setPhase('igniting');
    audio.unlock();
    audio.bell();
    setTimeout(() => audio.play(), 2600);
    timeline = igniteSequence(state, view, releaseCamera);
    api.onIgnite?.();
  };
  invitation.addEventListener('click', ignite);
  if (skipIntro) {
    releaseCamera();
    audio.play();
  } else {
    setPhase('waiting');
    invitation.hidden = false;
  }
  if (recording) hud.flashHelp();

  const frame = (timestamp: number) => {
    const elapsed = previous === undefined ? 0 : (timestamp - previous) / 1000;
    previous = timestamp;
    const delta = document.hidden ? 0 : Math.min(elapsed, .25);
    time += delta;
    if (quality.update(elapsed)) applyQuality();
    if (width !== canvas.clientWidth || height !== canvas.clientHeight || dpr !== devicePixelRatio) resize();
    if (timeline?.update(delta)) timeline = undefined;
    else view.update(delta);
    if (demo?.update(delta)) stopDemo();
    for (let i = effects.length - 1; i >= 0; i--) if (effects[i].update(delta)) effects.splice(i, 1);
    hud.setToolbar(phase === 'free' && !editor?.isOpen && !gifts.busy && !demoRunning);
    draw(delta);
    requestAnimationFrame(frame);
  };
  document.addEventListener('visibilitychange', () => { previous = undefined; quality.reset(); });
  addEventListener('hashchange', () => location.reload());
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

