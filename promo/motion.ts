// Motion-graphics cut: typed prompt → the prompt box morphs into a window where the tree is built and lit →
// a bento grid of six live app instances, each with a drawn line icon, zooming one by one on the beat →
// finale → name mark. No explanatory words; features are told through icons and real interactions.
import { cloneScene, exampleScene } from '../src/data/gifts';
import type { ThemeId } from '../src/data/gifts';
import { encodeScene } from '../src/data/share';
import { renderMotionAudio } from './music';
import type { MotionCues } from './music';
import { clamp01, escapeHtml, gpuInfo, h, Instance, inOut, lerp, orbit, outBack, outCubic, ramp, style, typed, typingTimes } from './shared';

// ---------- timing (120 BPM: beat .5 s, bar 2 s; the star flares on the downbeat at 14 s) ----------
const DURATION = 40;
const PROMPT = '帮我做一棵会发光的圣诞树，\n树下藏着送给 TA 的礼物。';
const PROMPT_TIMES = typingTimes(PROMPT, .8);
const SEND_AT = 4.75;
const MORPH = [5.0, 5.9];
const CONVERGE_AT = 6.4;
const IGNITE_AT = 10;
const DROP = 14;
const GRID_AT = 16;
const FEATURES = ['G', 'E', 'B', 'C', 'W', 'D'] as const;
type Key = typeof FEATURES[number];
const FOCUS_AT = (i: number) => 18 + i * 2;
const OUTRO = 31.4;
const FINALE_AT = 31.3;
const END_AT = 36;
const OPEN_GIFT_AT = 14.8;
const CLICKS = [20.55, 21.05, 21.55];
const THEMES: [number, ThemeId][] = [[22.5, 'ice'], [23, 'rose'], [23.5, 'forest'], [24.3, 'classic']];
const MAGIC_AT = 23.3;
const WISH_TEXT = '明年也要一起看雪';
const WISH = { open: 25.4, type: [25.6, 26.3], submit: 26.5 };
const TAP_AT = 28.6;
const POP_AT = (i: number) => GRID_AT + i * .25;

const film = document.querySelector<HTMLElement>('#film')!;
const layer = (name: string) => film.appendChild(h('div', `layer ${name}`));

// ---------- live instances ----------
const scenes = layer('scenes');
const quality = 'quality=high&seed=1225';
const shared = cloneScene(exampleScene);
shared.recipient = '小雨';
const A = new Instance(`/?${quality}`, 1920, 1080, [[0, 16.6], [30.6, 36.3]], scenes, '#ignite{display:none!important}');
const live: [number, number][] = [[15.5, 32.1]];
const tiles: Record<Key, Instance> = {
  G: new Instance(`/?${quality}&skipIntro=1`, 1920, 1080, [[14.6, 32.1]], scenes, '#gift-dialog .gift-card{zoom:1.25}'),
  E: new Instance(`/?${quality}&skipIntro=1`, 1120, 630, live, scenes),
  B: new Instance(`/?${quality}&skipIntro=1`, 1920, 1080, live, scenes),
  C: new Instance(`/?${quality}&skipIntro=1`, 1920, 1080, live, scenes),
  W: new Instance(`/?${quality}&skipIntro=1`, 1920, 1080, live, scenes, '#wish-dialog{zoom:1.5}'),
  D: new Instance(`/?${quality}#t=${encodeScene(shared)}`, 448, 968, live, scenes),
};
const instances = [A, ...Object.values(tiles)];
for (const instance of Object.values(tiles)) instance.frame.classList.add('card');

type Rect = { x: number; y: number; w: number };
const SLOTS: Record<Key, Rect> = {
  G: { x: 72, y: 100.5, w: 760 },
  E: { x: 72, y: 552, w: 760 },
  B: { x: 856, y: 77, w: 520 },
  C: { x: 856, y: 393.5, w: 520 },
  W: { x: 856, y: 710, w: 520 },
  D: { x: 1400, y: 56, w: 448 },
};
const FULL: Rect = { x: 0, y: 0, w: 1920 };
const PHONE_FOCUS: Rect = { x: 720, y: 21.5, w: 480 };
const mix = (a: Rect, b: Rect, k: number): Rect => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), w: lerp(a.w, b.w, k) });

// ---------- icons (line art, drawn on with stroke-dash) ----------
const ICONS: Record<Key | 'star', string> = {
  G: '<rect x="3.5" y="8.5" width="17" height="4" rx="1"/><path d="M5 12.5v8h14v-8M12 8.5v12M12 8.5C10.5 5.5 7 5 7 7.3 7 8.5 10 8.5 12 8.5M12 8.5c1.5-3 5-3.5 5-1.2 0 1.2-3 1.2-5 1.2"/>',
  E: '<path d="M4 20h4L19.5 8.5l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  B: '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.4 0 2-1 1.5-2.2-.6-1.3.3-2.3 1.6-2.3H17a3.5 3.5 0 0 0 3.5-3.5c0-5-3.8-9-8.5-9z"/><circle cx="7.5" cy="11" r="1.2"/><circle cx="10.5" cy="7.3" r="1.2"/><circle cx="15" cy="7.8" r="1.2"/>',
  C: '<path d="M11 3l1.9 5.3L18 10l-5.1 1.8L11 17l-1.9-5.2L4 10l5.1-1.7z"/><path d="M18.5 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
  W: '<path d="M15 3.5l1.5 3.2 3.5.5-2.5 2.5.6 3.5-3.1-1.7-3.1 1.7.6-3.5-2.5-2.5 3.5-.5z"/><path d="M9 13.5l-5.5 5.5M11 16.5l-3 3M6 11.5l-2.5 2.5"/>',
  D: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  star: '<path d="M12 2.8l2.5 6 6.4.5-4.9 4.2 1.5 6.3L12 16.4l-5.5 3.4L8 13.5 3.1 9.3l6.4-.5z"/>',
};
const withLength = (svg: string) => svg.replace(/<(path|rect|circle)/g, '<$1 pathLength="1" stroke-dasharray="1"');
const badgeLayer = layer('badges');
badgeLayer.style.zIndex = '30';
const badges = Object.fromEntries(FEATURES.map(key => {
  const badge = badgeLayer.appendChild(h('div', 'badge', `<svg viewBox="0 0 24 24">${withLength(ICONS[key])}</svg>`));
  return [key, badge];
})) as unknown as Record<Key, HTMLElement>;

function drawIcon(badge: HTMLElement, k: number): void {
  for (const shape of badge.querySelectorAll<SVGElement>('path, rect, circle')) shape.setAttribute('stroke-dashoffset', String(1 - outCubic(k)));
}

// ---------- prompt box that becomes the first window ----------
const opening = layer('opening');
const morph = opening.appendChild(h('div', 'morph'));
const promptText = morph.appendChild(h('div', 'prompt-text'));
const promptFoot = morph.appendChild(h('div', 'prompt-foot', '<span class="model">Claude</span><span class="send"><svg viewBox="0 0 24 24"><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/></svg></span>'));
const send = promptFoot.querySelector<HTMLElement>('.send')!;
const spark = opening.appendChild(h('div', 'spark', '<svg viewBox="0 0 24 24"><path d="M12 2.5c.4 3.9 1.2 6.2 2.6 7.3 1.3 1 3.5 1.5 6.9 1.7v1c-3.4.2-5.6.7-6.9 1.7-1.4 1.1-2.2 3.4-2.6 7.3h-1c-.4-3.9-1.2-6.2-2.6-7.3-1.3-1-3.5-1.5-6.9-1.7v-1c3.4-.2 5.6-.7 6.9-1.7 1.4-1.1 2.2-3.4 2.6-7.3z"/></svg>'));
const BOX = { x: 410, y: 390, w: 1100, h: 300 };
const WINDOW = { x: 320, y: 180, w: 1280, h: 720 };

function drawOpening(t: number): Rect {
  const k = inOut(ramp(t, MORPH[0], MORPH[1]));
  const grow = inOut(ramp(t, MORPH[1], 13.3)) * 80;
  const window = { x: WINDOW.x - grow / 2, y: WINDOW.y - grow * 9 / 32, w: WINDOW.w + grow };
  const expand = inOut(ramp(t, 13.35, 14));
  const rect = { x: lerp(BOX.x, window.x, k), y: lerp(BOX.y, window.y, k), w: lerp(BOX.w, window.w, k), h: lerp(BOX.h, window.w * 9 / 16, k) };
  const finalRect = mix(window, FULL, expand);
  const appear = outCubic(ramp(t, 0, .7));
  morph.style.visibility = t < 6.2 ? 'visible' : 'hidden';
  style(morph, {
    left: `${rect.x}px`, top: `${rect.y + (1 - appear) * 30}px`, width: `${rect.w}px`, height: `${rect.h}px`, opacity: appear,
    'border-radius': `${lerp(32, 24, k)}px`, background: k > 0 ? `color-mix(in srgb, #070d22 ${Math.round(k * 100)}%, #fcfbf8)` : '#fcfbf8',
  });
  const text = typed(PROMPT, PROMPT_TIMES, t);
  const caret = t < SEND_AT && (Math.floor(t * 2.2) % 2 === 0 || (t > PROMPT_TIMES[0] && t < PROMPT_TIMES.at(-1)! + .2));
  promptText.innerHTML = (text ? escapeHtml(text) : '<span class="placeholder">和 Claude 说点什么…</span>') + (caret ? '<span class="caret"></span>' : '');
  const fade = 1 - ramp(t, MORPH[0], MORPH[0] + .25);
  promptText.style.opacity = promptFoot.style.opacity = String(fade);
  style(send, { opacity: text ? 1 : .45, transform: `scale(${1 - Math.sin(ramp(t, SEND_AT - .08, SEND_AT + .22) * Math.PI) * .12})` });
  // Claude's spark spins beneath the window while the tree is being built
  const sparkOn = Math.min(outBack(ramp(t, 5.7, 6.2)), 1 - inOut(ramp(t, 13, 13.4)));
  style(spark, { visibility: sparkOn > 0 ? 'visible' : 'hidden', left: `${928}px`, top: `${window.y + window.w * 9 / 16 + 36}px`, opacity: clamp01(sparkOn), transform: `rotate(${t * 140}deg) scale(${Math.max(0, sparkOn)})` });
  return finalRect;
}

// ---------- pointer, tap ----------
const pointer = layer('pointer');
pointer.style.zIndex = '40';
const cursor = pointer.appendChild(h('div', 'cursor', '<svg viewBox="0 0 24 24"><path d="M5 3.5v15.2l4.1-3.9 2.7 6 2.6-1.1-2.7-6h5.6z" fill="#fff" stroke="#1e1c19" stroke-width="1.4" stroke-linejoin="round"/></svg>'));
const ring = pointer.appendChild(h('div', 'ring'));
const tap = pointer.appendChild(h('div', 'tap'));
const CLICK_TARGETS = ['.swatches [data-color="#c9a24f"]', '[aria-label="包装纹样"] button:nth-child(3)', '[aria-label="盒型"] button:nth-child(3)'];

function centerIn(instance: Instance, rect: Rect, selector: string): [number, number] | null {
  const element = instance.doc.querySelector<HTMLElement>(selector);
  if (!element) return null;
  const box = element.getBoundingClientRect();
  const scale = rect.w / instance.width;
  return [rect.x + (box.left + box.width / 2) * scale, rect.y + (box.top + box.height / 2) * scale];
}

function drawPointer(t: number, rects: Record<Key, Rect>): void {
  const on = t > 20.1 && t < 22.05;
  cursor.style.visibility = ring.style.visibility = 'hidden';
  if (on) {
    const points = CLICK_TARGETS.map(selector => centerIn(tiles.E, rects.E, selector));
    if (points.every(Boolean)) {
      const keys: [number, number, number][] = [[20.15, 1500, 760], ...points.map((p, i) => [CLICKS[i], p![0], p![1]] as [number, number, number])];
      let x = keys[0][1], y = keys[0][2];
      for (let i = 1; i < keys.length; i++) {
        const [at, bx, by] = keys[i], [, ax, ay] = keys[i - 1];
        if (t >= at) { x = bx; y = by; continue; }
        const k = inOut(ramp(t, at - .38, at));
        x = lerp(ax, bx, k);
        y = lerp(ay, by, k);
        break;
      }
      const last = [...CLICKS].reverse().find(at => t >= at);
      const since = last === undefined ? 9 : t - last;
      const fade = Math.min(ramp(t, 20.1, 20.3), 1 - ramp(t, 21.85, 22.05));
      style(cursor, { visibility: 'visible', left: `${x}px`, top: `${y}px`, opacity: fade, transform: `scale(${1 - .14 * Math.sin(clamp01(since / .2) * Math.PI)})` });
      if (since < .45) style(ring, { visibility: 'visible', left: `${x}px`, top: `${y}px`, opacity: (1 - since / .45) * fade, transform: `scale(${.4 + since / .45})` });
    }
  }
  const since = t - TAP_AT;
  tap.style.visibility = 'hidden';
  if (since > -.3 && since < .7) {
    const point = centerIn(tiles.D, rects.D, '#ignite span');
    if (point) {
      const press = since < 0 ? outCubic(ramp(since, -.3, 0)) : 1;
      style(tap, { visibility: 'visible', left: `${point[0]}px`, top: `${point[1]}px`, opacity: since < 0 ? press * .9 : 1 - since / .7, transform: `scale(${since < 0 ? .6 + .1 * press : .7 + since * 1.4})` });
    }
  }
}

// ---------- the grid and its focus sequence ----------
function drawGrid(t: number): Record<Key, Rect> {
  const rects = {} as Record<Key, Rect>;
  const phoneFocus = (() => {
    const s = FOCUS_AT(5);
    return inOut(ramp(t, s - .05, s + .4)) * (1 - inOut(ramp(t, s + 1.95, s + 2.4)));
  })();
  const gather = inOut(ramp(t, OUTRO, OUTRO + .55));
  const focusOf = (i: number) => { const s = FOCUS_AT(i); return inOut(ramp(t, s - .05, s + .4)) * (1 - inOut(ramp(t, s + 1.95, s + 2.4))); };
  FEATURES.forEach((key, i) => {
    const instance = tiles[key];
    const badge = badges[key];
    const s = FOCUS_AT(i);
    const focus = inOut(ramp(t, s - .05, s + .4)) * (1 - inOut(ramp(t, s + 1.95, s + 2.4)));
    const target = key === 'D' ? PHONE_FOCUS : FULL;
    let rect = mix(SLOTS[key], target, focus);
    // gather: every tile slides toward the centre and fades as the finale takes over
    if (gather > 0) {
      const scale = 1 - .35 * gather;
      rect = { x: 960 + (rect.x - 960) * scale, y: 540 + (rect.y - 540) * scale, w: rect.w * scale };
    }
    rects[key] = rect;
    const pop = outBack(ramp(t, POP_AT(i), POP_AT(i) + .45));
    const shown = t >= POP_AT(i) && t < OUTRO + .6;
    const dim = key === 'D' ? 1 : 1 - phoneFocus;
    // another tile covering the stage hides this tile's badge
    const covered = Math.max(0, ...FEATURES.map((_, j) => j === i ? 0 : focusOf(j)));
    if (!shown) { instance.hide(); badge.style.visibility = 'hidden'; return; }
    const opacity = clamp01(ramp(t, POP_AT(i), POP_AT(i) + .25)) * dim * (1 - gather);
    const radius = key === 'D' ? 44 : 28 * (1 - focus);
    // pop-in scales around the slot centre
    const sc = .82 + .18 * pop;
    const h0 = rect.w * instance.height / instance.width;
    instance.place(rect.x + rect.w * (1 - sc) / 2, rect.y + h0 * (1 - sc) / 2, rect.w * sc, opacity, radius);
    instance.frame.style.zIndex = String(10 + Math.round(focus * 10));
    // badge: small in the corner of its tile; grows and redraws when the tile takes the stage
    const size = lerp(64, 108, focus);
    const inset = lerp(20, 56, focus);
    const bx = key === 'D' ? rect.x + lerp(20, -150, focus) : rect.x + inset;
    const by = rect.y + inset;
    const bump = 1 + .18 * Math.sin(ramp(t, s, s + .45) * Math.PI);
    style(badge, { visibility: 'visible', left: `${bx}px`, top: `${by}px`, width: `${size}px`, height: `${size}px`, opacity: opacity > 0 ? clamp01(ramp(t, POP_AT(i) + .1, POP_AT(i) + .35)) * dim * (1 - gather) * (1 - covered) : 0, transform: `scale(${pop * bump})`, 'z-index': String(11 + Math.round(focus * 10)) });
    const svg = badge.querySelector('svg')!;
    svg.setAttribute('width', String(size * .54));
    svg.setAttribute('height', String(size * .54));
    const redraw = t >= s ? ramp(t, s + .05, s + .6) : ramp(t, POP_AT(i) + .1, POP_AT(i) + .7);
    drawIcon(badge, redraw);
  });
  return rects;
}

// ---------- end mark ----------
const end = film.appendChild(h('div', 'end', `<div class="mark"><svg viewBox="0 0 24 24">${withLength(ICONS.star)}</svg></div><h1>雪夜礼物树</h1>`));
const endMark = end.querySelector<HTMLElement>('.mark')!;
const endTitle = end.querySelector<HTMLElement>('h1')!;
const veil = film.appendChild(h('div', 'black'));
end.style.zIndex = '100';
veil.style.zIndex = '101';

function drawEnd(t: number): void {
  const k = inOut(ramp(t, END_AT - .2, END_AT + .3));
  end.style.visibility = k > 0 ? 'visible' : 'hidden';
  if (!k) return;
  end.style.opacity = String(k);
  for (const shape of endMark.querySelectorAll<SVGElement>('path')) shape.setAttribute('stroke-dashoffset', String(1 - outCubic(ramp(t, END_AT + .2, END_AT + 1.3))));
  style(endMark, { transform: `scale(${.7 + .3 * outBack(ramp(t, END_AT + .15, END_AT + .7))}) rotate(${(1 - outCubic(ramp(t, END_AT + .15, END_AT + 1.2))) * -40}deg)` });
  const rise = outCubic(ramp(t, END_AT + .55, END_AT + 1.35));
  style(endTitle, { opacity: rise, transform: `translateY(${(1 - rise) * 40}px)`, 'letter-spacing': `${lerp(.3, .08, rise)}em` });
}

function drawScenes(t: number): void {
  const rect = drawOpening(t);
  // A: the first window, full screen at the drop, fades as the grid arrives; returns for the finale
  if (t >= MORPH[1] - .3 && t < GRID_AT + .5) {
    const leave = inOut(ramp(t, GRID_AT, GRID_AT + .45));
    const sc = 1 - .1 * leave;
    const opacity = outCubic(ramp(t, MORPH[1] - .3, MORPH[1] + .1)) * (1 - leave);
    A.place(rect.x + rect.w * (1 - sc) / 2, rect.y + rect.w * 9 / 16 * (1 - sc) / 2, rect.w * sc, opacity, 24 * (1 - inOut(ramp(t, 13.35, 14))));
    A.frame.style.zIndex = '5';
  } else if (t >= OUTRO) {
    A.place(0, 0, 1920, inOut(ramp(t, OUTRO + .1, OUTRO + .6)));
    A.frame.style.zIndex = '25';
  } else A.hide();
  const rects = drawGrid(t);
  drawPointer(t, rects);
  drawEnd(t);
  veil.style.opacity = String(1 - outCubic(ramp(t, 0, .5)));
}

// ---------- scripted actions ----------
interface Cue { at: number; run: () => void }
let cues: Cue[] = [];
const cue = (at: number, run: () => void) => cues.push({ at, run });
function setupCues(): void {
  cues = [];
  const { G, E, B, C, W, D } = tiles;
  cue(CONVERGE_AT, () => A.api.setMagicForm(1, 0));
  cue(IGNITE_AT, () => A.api.ignite());
  cue(OPEN_GIFT_AT, () => G.api.openGift('camera'));
  cue(15.6, () => { E.api.setClean(false); E.api.openEditor(); });
  cue(15.7, () => E.doc.querySelector<HTMLElement>('.gift-list li:nth-child(3) .gift-row')?.click());
  cue(15.8, () => {
    const body = E.doc.querySelector<HTMLElement>('#editor .editor-body');
    const target = E.doc.querySelector<HTMLElement>('#editor .swatches');
    if (body && target) body.scrollTop = target.offsetTop - body.offsetTop - 90;
  });
  CLICKS.forEach((at, i) => cue(at, () => E.doc.querySelector<HTMLElement>(CLICK_TARGETS[i])?.click()));
  for (const [at, theme] of THEMES) cue(at, () => B.api.setTheme(theme));
  cue(MAGIC_AT, () => C.api.setMagic(true));
  cue(WISH.open, () => W.doc.querySelector<HTMLElement>('#toolbar .tool')?.click());
  Array.from(WISH_TEXT).forEach((_, i, all) => cue(lerp(WISH.type[0], WISH.type[1], i / (all.length - 1)), () => {
    const area = W.doc.querySelector<HTMLTextAreaElement>('#wish-dialog textarea');
    if (!area) return;
    area.value = all.slice(0, i + 1).join('');
    area.dispatchEvent(new Event('input'));
  }));
  cue(WISH.submit, () => W.doc.querySelector<HTMLElement>('#wish-dialog button.primary')?.click());
  cue(TAP_AT, () => D.doc.querySelector<HTMLElement>('#ignite')?.click());
  cue(FINALE_AT, () => A.api.playFinale());
  cues.sort((a, b) => a.at - b.at);
}

function cameraFor(t: number): void {
  const { E, B, C, W } = tiles;
  if (t < 16.6) A.api.setCameraPose(orbit(lerp(-.15, .22, ramp(t, 5.5, 16.6)), lerp(-.06, -.025, ramp(t, 5.5, 16.6)), lerp(20, 16.8, inOut(ramp(t, 6, 16.6))), 4.0));
  else if (t >= 30.6) A.api.setCameraPose(orbit(lerp(.3, .55, ramp(t, 30.6, 36.3)), -.06, 19.5, 4.5));
  if (t >= 15.5 && t < 32.1) {
    const k = ramp(t, 15.5, 32.1);
    E.api.setCameraPose(orbit(lerp(.12, .24, k), .24, 10.6, 1.25));
    B.api.setCameraPose(orbit(lerp(.4, .9, k), -.03, 17.5, 4.0));
    C.api.setCameraPose(orbit(lerp(-.3, .2, k), lerp(0, .1, inOut(ramp(t, MAGIC_AT, 27.5))), lerp(17, 20, inOut(ramp(t, MAGIC_AT, 27.5))), 4.1));
    W.api.setCameraPose(orbit(lerp(1.0, 1.2, k), .03, 14.5, 4.3));
  }
}

// ---------- driver ----------
let t = 0, nextCue = 0, settle = 0;
let phase: 'loading' | 'settling' | 'ready' = 'loading';

function advance(dt: number): void {
  const next = t + dt;
  while (nextCue < cues.length && cues[nextCue].at <= next) cues[nextCue++].run();
  cameraFor(next);
  for (const instance of instances) if (instance.isActive(next)) instance.step(dt * 1000);
  t = next;
}

const api = {
  preroll(): true | string {
    if (phase === 'loading') {
      for (const instance of instances) instance.step(50);
      if (!instances.every(instance => instance.ready) || !document.fonts.check('400 52px "Noto Serif SC"')) return 'loading';
      for (const instance of instances) instance.api.setClean(true);
      A.api.setMagicForm(1, 1);
      setupCues();
      phase = 'settling';
    }
    if (phase === 'settling') {
      for (const instance of instances) instance.step(100);
      cameraFor(0);
      if (++settle < 90) return 'settling';
      phase = 'ready';
      drawScenes(0);
    }
    return true;
  },
  seek(time: number): void {
    while (t < time - 1e-6) advance(Math.min(time - t, 1 / 20));
    drawScenes(t);
  },
  info: () => ({ duration: DURATION, gpu: gpuInfo() }),
  renderAudio(mix: 'full' | 'effects'): Promise<string> {
    const audioCues: MotionCues = {
      duration: DURATION, drop: DROP, typing: PROMPT_TIMES.filter((_, i) => PROMPT[i] !== '\n'), send: SEND_AT, morph: MORPH[0],
      converge: CONVERGE_AT, ignite: IGNITE_AT, pops: FEATURES.map((_, i) => POP_AT(i)), focuses: FEATURES.map((_, i) => FOCUS_AT(i)),
      clicks: CLICKS, themes: THEMES.map(([at]) => at), giftOpen: OPEN_GIFT_AT,
      wishType: Array.from(WISH_TEXT).map((_, i, all) => lerp(WISH.type[0], WISH.type[1], i / (all.length - 1))),
      wishLand: WISH.submit + 1.75, magic: MAGIC_AT, tap: TAP_AT, outro: OUTRO, finale: FINALE_AT, end: END_AT,
    };
    return renderMotionAudio(mix, audioCues);
  },
};
(window as unknown as { __promo: typeof api }).__promo = api;
