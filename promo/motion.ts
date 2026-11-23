// Motion-graphics cut: a two-shot highlight hook → typed prompt → the prompt box morphs into a window where the
// tree is built and lit → a bento grid of six live app instances, each with a drawn line icon, taking the stage
// one by one on the beat → finale → name mark. No explanatory words; features are told through icons and real use.
import { cloneScene, exampleScene } from '../src/data/gifts';
import type { ThemeId } from '../src/data/gifts';
import { encodeScene } from '../src/data/share';
import { renderMotionAudio } from './music';
import type { MotionCues } from './music';
import { clamp01, escapeHtml, gpuInfo, h, Instance, inOut, lerp, orbit, outBack, outCubic, ramp, style, typed, typingTimes } from './shared';
import type { Pose, Vec3 } from './shared';

// ---------- timing (120 BPM: beat .5 s, bar 2 s; the star flares on the downbeat at DROP) ----------
const DURATION = 50;
const HOOK = [1, 2.05]; // gift light beam until 1 s, star flight until the flash into the prompt
const PROMPT = '帮我做一棵会发光的圣诞树，\n树下藏着送给 TA 的礼物。';
const PROMPT_TIMES = typingTimes(PROMPT, 2.6, .05, .03, .12);
const SEND_AT = PROMPT_TIMES.at(-1)! + .4;
const MORPH = [SEND_AT + .2, SEND_AT + 1];
const CONVERGE_AT = 6.6;
const IGNITE_AT = 10;
const DROP = 14;
const GRID_AT = DROP + 2;
const FEATURES = ['G', 'E', 'B', 'C', 'W', 'D'] as const;
type Key = typeof FEATURES[number];
const FOCUS: Record<Key, [number, number]> = { G: [18, 4], E: [22, 2], B: [24, 2], C: [26, 4], W: [30, 4], D: [34, 6] };
const OUTRO = 41.2;
const FINALE_AT = 41;
const END_AT = 46;
const OPEN_GIFT_AT = 16.9;
const CLICKS = [22.55, 23.05, 23.55];
const THEMES: [number, ThemeId][] = [[24.5, 'rose'], [25, 'forest'], [25.5, 'classic'], [26.4, 'ice']];
const MAGIC_AT = 26.5;
const WISH_TEXT = '明年也要一起看雪';
const WISH = { open: 28.8, type: [29.1, 29.9], submit: 30.35, land: 30.35 + 1.75, note: 32.7 };
const SHARE = { tab: 33, copy: 34.5, plane: [34.55, 35.15] };
const PHONE = { bubble: 35.05, open: 35.5, tap: 35.9 };
/** The gift tile is the shrunken hero tree; the others pop out of the centre after it. */
const POP_AT = (i: number) => i === 0 ? GRID_AT + .35 : GRID_AT + .25 + (i - 1) * .2;

const film = document.querySelector<HTMLElement>('#film')!;
const layer = (name: string) => film.appendChild(h('div', `layer ${name}`));

// ---------- live instances ----------
const scenes = layer('scenes');
const quality = 'quality=high&seed=1225';
const shared = cloneScene(exampleScene);
shared.recipient = '小雨';
const grid: [number, number][] = [[GRID_AT - .5, OUTRO + .8]];
const A = new Instance(`/?${quality}`, 1920, 1080, [[0, GRID_AT + .6], [FINALE_AT - .5, END_AT + .3]], scenes, '#ignite{display:none!important}');
const H = new Instance(`/?${quality}&skipIntro=1`, 1920, 1080, [[0, HOOK[0] + .1]], scenes);
const tiles: Record<Key, Instance> = {
  G: new Instance(`/?${quality}&skipIntro=1`, 1920, 1080, grid, scenes, '#gift-dialog .gift-card{zoom:1.25}'),
  E: new Instance(`/?${quality}&skipIntro=1`, 1120, 630, grid, scenes),
  B: new Instance(`/?${quality}&skipIntro=1`, 1920, 1080, grid, scenes),
  C: new Instance(`/?${quality}&skipIntro=1`, 1920, 1080, grid, scenes),
  W: new Instance(`/?${quality}&skipIntro=1`, 1920, 1080, [[0, HOOK[1] + .1], ...grid], scenes,
    '#wish-dialog{zoom:1.5}.finale{display:none!important}.wish-note{font-size:2.6rem!important;max-width:44rem!important;padding:1.1rem 1.7rem!important;border-radius:8px!important}'),
  D: new Instance(`/?${quality}#t=${encodeScene(shared)}`, 448, 968, grid, scenes),
};
const instances = [A, H, ...Object.values(tiles)];
for (const instance of Object.values(tiles)) instance.frame.classList.add('card');
tiles.D.frame.classList.add('phone');

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
const PHONE_FOCUS: Rect = { x: 1250, y: 21.5, w: 480 };
const SHARE_RECT: Rect = { x: 110, y: 292, w: 900 };
const mix = (a: Rect, b: Rect, k: number): Rect => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), w: lerp(a.w, b.w, k) });
/** Ease out with a small overshoot, for windows snapping into place. */
const snap = (x: number) => 1 + 1.6 * (x - 1) ** 3 + .6 * (x - 1) ** 2;

function focusOf(key: Key, t: number): number {
  const [start, length] = FOCUS[key];
  return snap(ramp(t, start - .05, start + .42)) * (1 - inOut(ramp(t, start + length - .05, start + length + .4)));
}

// ---------- icons (line art, drawn on with stroke-dash) ----------
const ICONS: Record<Key | 'star' | 'plane', string> = {
  G: '<rect x="3.5" y="8.5" width="17" height="4" rx="1"/><path d="M5 12.5v8h14v-8M12 8.5v12M12 8.5C10.5 5.5 7 5 7 7.3 7 8.5 10 8.5 12 8.5M12 8.5c1.5-3 5-3.5 5-1.2 0 1.2-3 1.2-5 1.2"/>',
  E: '<path d="M4 20h4L19.5 8.5l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  B: '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.4 0 2-1 1.5-2.2-.6-1.3.3-2.3 1.6-2.3H17a3.5 3.5 0 0 0 3.5-3.5c0-5-3.8-9-8.5-9z"/><circle cx="7.5" cy="11" r="1.2"/><circle cx="10.5" cy="7.3" r="1.2"/><circle cx="15" cy="7.8" r="1.2"/>',
  C: '<path d="M11 3l1.9 5.3L18 10l-5.1 1.8L11 17l-1.9-5.2L4 10l5.1-1.7z"/><path d="M18.5 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
  W: '<path d="M15 3.5l1.5 3.2 3.5.5-2.5 2.5.6 3.5-3.1-1.7-3.1 1.7.6-3.5-2.5-2.5 3.5-.5z"/><path d="M9 13.5l-5.5 5.5M11 16.5l-3 3M6 11.5l-2.5 2.5"/>',
  D: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  star: '<path d="M12 2.8l2.5 6 6.4.5-4.9 4.2 1.5 6.3L12 16.4l-5.5 3.4L8 13.5 3.1 9.3l6.4-.5z"/>',
  plane: '<path d="M21 3.5 3 10.8l6.6 2.6L21 3.5zM9.6 13.4l1.9 7.1 3-4.6L21 3.5"/>',
};
const withLength = (svg: string) => svg.replace(/<(path|rect|circle|line)/g, '<$1 pathLength="1" stroke-dasharray="1"');
const badgeLayer = layer('badges');
badgeLayer.style.zIndex = '30';
const badges = Object.fromEntries(FEATURES.map(key => [key, badgeLayer.appendChild(h('div', 'badge', `<svg viewBox="0 0 24 24">${withLength(ICONS[key])}</svg>`))])) as unknown as Record<Key, HTMLElement>;
function drawIcon(element: Element, k: number): void {
  for (const shape of element.querySelectorAll<SVGElement>('path, rect, circle, line')) shape.setAttribute('stroke-dashoffset', String(1 - outCubic(k)));
}

// ---------- prompt box that becomes the first window ----------
const opening = layer('opening');
opening.style.transformOrigin = '960px 540px';
const morph = opening.appendChild(h('div', 'morph'));
const promptText = morph.appendChild(h('div', 'prompt-text'));
const promptFoot = morph.appendChild(h('div', 'prompt-foot', '<span class="model">Claude</span><span class="send"><svg viewBox="0 0 24 24"><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/></svg></span>'));
const send = promptFoot.querySelector<HTMLElement>('.send')!;
const spark = opening.appendChild(h('div', 'spark', '<svg viewBox="0 0 24 24"><path d="M12 2.5c.4 3.9 1.2 6.2 2.6 7.3 1.3 1 3.5 1.5 6.9 1.7v1c-3.4.2-5.6.7-6.9 1.7-1.4 1.1-2.2 3.4-2.6 7.3h-1c-.4-3.9-1.2-6.2-2.6-7.3-1.3-1-3.5-1.5-6.9-1.7v-1c3.4-.2 5.6-.7 6.9-1.7 1.4-1.1 2.2-3.4 2.6-7.3z"/></svg>'));
const BOX = { x: 410, y: 390, w: 1100, h: 300 };
const WINDOW = { x: 320, y: 180, w: 1280 };
const GROW_END = DROP - .65;

interface OpeningFrame { rect: Rect; box: { x: number; y: number; w: number; h: number }; morph: number }
function drawOpening(t: number): OpeningFrame {
  const k = inOut(ramp(t, MORPH[0], MORPH[1]));
  const grow = inOut(ramp(t, MORPH[1], GROW_END)) * 80;
  const window = { x: WINDOW.x - grow / 2, y: WINDOW.y - grow * 9 / 32, w: WINDOW.w + grow };
  const expand = inOut(ramp(t, GROW_END, DROP));
  const box = { x: lerp(BOX.x, window.x, k), y: lerp(BOX.y, window.y, k), w: lerp(BOX.w, window.w, k), h: lerp(BOX.h, window.w * 9 / 16, k) };
  const appear = outCubic(ramp(t, HOOK[1], HOOK[1] + .5));
  // the camera leans into the prompt while it is typed, then settles back for the morph
  const lean = .6 * inOut(ramp(t, HOOK[1] + .1, PROMPT_TIMES[8])) * (1 - inOut(ramp(t, SEND_AT, MORPH[0] + .45)));
  opening.style.transform = `scale(${1 + lean})`;
  morph.style.visibility = t > HOOK[1] && t < MORPH[1] + .3 ? 'visible' : 'hidden';
  style(morph, {
    left: `${box.x}px`, top: `${box.y + (1 - appear) * 30}px`, width: `${box.w}px`, height: `${box.h}px`, opacity: appear,
    'border-radius': `${lerp(32, 24, k)}px`, background: k > 0 ? '#070d22' : '#fcfbf8',
  });
  const text = typed(PROMPT, PROMPT_TIMES, t);
  const caret = t < SEND_AT && (Math.floor(t * 2.2) % 2 === 0 || (t > PROMPT_TIMES[0] && t < PROMPT_TIMES.at(-1)! + .2));
  promptText.innerHTML = (text ? escapeHtml(text) : '<span class="placeholder">和 Claude 说点什么…</span>') + (caret ? '<span class="caret"></span>' : '');
  promptText.style.opacity = promptFoot.style.opacity = String(1 - ramp(t, MORPH[0], MORPH[0] + .2));
  style(send, { opacity: text ? 1 : .45, transform: `scale(${1 - Math.sin(ramp(t, SEND_AT - .08, SEND_AT + .22) * Math.PI) * .12})` });
  const sparkOn = Math.min(outBack(ramp(t, MORPH[1] - .2, MORPH[1] + .3)), 1 - inOut(ramp(t, GROW_END - .3, GROW_END)));
  style(spark, { visibility: sparkOn > 0 ? 'visible' : 'hidden', left: '928px', top: `${window.y + window.w * 9 / 16 + 36}px`, opacity: clamp01(sparkOn), transform: `rotate(${t * 140}deg) scale(${Math.max(0, sparkOn)})` });
  return { rect: mix(window, FULL, expand), box, morph: k };
}

// ---------- pointer, taps, paper plane, phone notification ----------
const pointer = layer('pointer');
pointer.style.zIndex = '40';
const cursor = pointer.appendChild(h('div', 'cursor', '<svg viewBox="0 0 24 24"><path d="M5 3.5v15.2l4.1-3.9 2.7 6 2.6-1.1-2.7-6h5.6z" fill="#fff" stroke="#1e1c19" stroke-width="1.4" stroke-linejoin="round"/></svg>'));
const ring = pointer.appendChild(h('div', 'ring'));
const tap = pointer.appendChild(h('div', 'tap'));
const plane = pointer.appendChild(h('div', 'plane', `<svg viewBox="0 0 24 24">${ICONS.plane}</svg>`));
const trail = Array.from({ length: 10 }, () => pointer.appendChild(h('i', 'trail')));
const notice = pointer.appendChild(h('div', 'notice', `<span class="app"><svg viewBox="0 0 24 24">${ICONS.star}</svg></span><span class="lines"><i></i><i></i></span><span class="thumb"><svg viewBox="0 0 24 24"><path d="M12 3l5 7h-2.5l4 5.5h-3L19 20H5l3.5-4.5h-3l4-5.5H7z"/></svg></span>`));
const CLICK_TARGETS = ['.swatches [data-color="#c9a24f"]', '[aria-label="包装纹样"] button:nth-child(3)', '[aria-label="盒型"] button:nth-child(3)'];
const COPY_BUTTON = '#editor .editor-body button.primary';

function centerIn(instance: Instance, rect: Rect, selector: string): [number, number] | null {
  const element = instance.doc.querySelector<HTMLElement>(selector);
  if (!element) return null;
  const box = element.getBoundingClientRect();
  const scale = rect.w / instance.width;
  return [rect.x + (box.left + box.width / 2) * scale, rect.y + (box.top + box.height / 2) * scale];
}

function showTap(at: number, t: number, point: [number, number] | null): boolean {
  const since = t - at;
  if (!point || since < -.3 || since > .7) return false;
  const press = since < 0 ? outCubic(ramp(since, -.3, 0)) : 1;
  style(tap, { visibility: 'visible', left: `${point[0]}px`, top: `${point[1]}px`, opacity: since < 0 ? press * .9 : 1 - since / .7, transform: `scale(${since < 0 ? .6 + .1 * press : .7 + since * 1.4})` });
  return true;
}

/** Moves the cursor along [time, x, y] keys, clicking at each key after the first. */
function drive(t: number, keys: [number, number, number][], window: [number, number]): void {
  let x = keys[0][1], y = keys[0][2];
  for (let i = 1; i < keys.length; i++) {
    const [at, bx, by] = keys[i], [, ax, ay] = keys[i - 1];
    if (t >= at) { x = bx; y = by; continue; }
    const k = inOut(ramp(t, at - .38, at));
    x = lerp(ax, bx, k);
    y = lerp(ay, by, k);
    break;
  }
  const last = keys.slice(1).reverse().find(([at]) => t >= at);
  const since = last === undefined ? 9 : t - last[0];
  const fade = Math.min(ramp(t, window[0], window[0] + .2), 1 - ramp(t, window[1] - .2, window[1]));
  style(cursor, { visibility: 'visible', left: `${x}px`, top: `${y}px`, opacity: fade, transform: `scale(${1 - .14 * Math.sin(clamp01(since / .2) * Math.PI)})` });
  if (since < .45) style(ring, { visibility: 'visible', left: `${x}px`, top: `${y}px`, opacity: (1 - since / .45) * fade, transform: `scale(${.4 + since / .45})` });
}

function drawPointer(t: number, rects: Record<Key, Rect>): void {
  cursor.style.visibility = ring.style.visibility = tap.style.visibility = notice.style.visibility = plane.style.visibility = 'hidden';
  for (const dot of trail) dot.style.visibility = 'hidden';
  const [editStart] = FOCUS.E;
  if (t > editStart + .1 && t < editStart + 2.05) {
    const points = CLICK_TARGETS.map(selector => centerIn(tiles.E, rects.E, selector));
    if (points.every(Boolean)) drive(t, [[editStart + .15, 1500, 760], ...points.map((p, i) => [CLICKS[i], p![0], p![1]] as [number, number, number])], [editStart + .1, editStart + 2.05]);
  }
  // share: click "copy link" on the computer, a paper plane carries it to the phone
  const copy = centerIn(tiles.E, rects.E, COPY_BUTTON);
  const phone = rects.D, s = phone.w / 448;
  if (copy && t > SHARE.copy - .6 && t < SHARE.copy + .5) drive(t, [[SHARE.copy - .6, copy[0] + 160, copy[1] + 120], [SHARE.copy, copy[0], copy[1]]], [SHARE.copy - .6, SHARE.copy + .5]);
  const fly = ramp(t, SHARE.plane[0], SHARE.plane[1]);
  if (copy && fly > 0 && fly < 1) {
    const to: [number, number] = [phone.x + 224 * s, phone.y + 90 * s];
    const at = (k: number): [number, number] => [lerp(copy[0], to[0], k), lerp(copy[1], to[1], k) - Math.sin(k * Math.PI) * 220];
    const k = inOut(fly), [px, py] = at(k), [nx, ny] = at(Math.min(1, k + .02));
    style(plane, { visibility: 'visible', left: `${px}px`, top: `${py}px`, transform: `rotate(${Math.atan2(ny - py, nx - px) * 180 / Math.PI + 45}deg) scale(${1 + .4 * Math.sin(k * Math.PI)})` });
    trail.forEach((dot, i) => {
      const [tx, ty] = at(Math.max(0, k - (i + 1) * .025));
      style(dot, { visibility: 'visible', left: `${tx}px`, top: `${ty}px`, opacity: .8 * (1 - i / trail.length) });
    });
  }
  // phone: the message drops in, a tap opens it, a tap on the invitation lights the tree
  const drop = outBack(ramp(t, PHONE.bubble, PHONE.bubble + .4)) * (1 - inOut(ramp(t, PHONE.open + .05, PHONE.open + .3)));
  if (drop > 0) style(notice, { visibility: 'visible', left: `${phone.x + 16 * s}px`, top: `${phone.y + lerp(-40, 54, drop) * s}px`, opacity: clamp01(drop * 1.5), transform: `scale(${s * (1 - .04 * Math.sin(ramp(t, PHONE.open - .1, PHONE.open + .1) * Math.PI))})` });
  if (!showTap(PHONE.open, t, [phone.x + 224 * s, phone.y + 100 * s])) showTap(PHONE.tap, t, centerIn(tiles.D, phone, '#ignite span'));
}

// ---------- the grid and its focus sequence ----------
function drawGrid(t: number): Record<Key, Rect> {
  const rects = {} as Record<Key, Rect>;
  const phoneFocus = focusOf('D', t);
  const gather = inOut(ramp(t, OUTRO, OUTRO + .55));
  const beat = Math.exp(-((t * 2) % 1) * 7) * (t > GRID_AT + 1.6 && t < OUTRO ? 1 : 0);
  FEATURES.forEach((key, i) => {
    const instance = tiles[key];
    const badge = badges[key];
    const focus = focusOf(key, t);
    const covered = Math.max(0, ...FEATURES.map(other => other === key || (key === 'E' && other === 'D') ? 0 : focusOf(other, t)));
    let rect = mix(SLOTS[key], key === 'D' ? PHONE_FOCUS : FULL, focus);
    // during the phone shot the editor's share tab stands beside the phone, as the sender's computer
    if (key === 'E') rect = mix(rect, SHARE_RECT, phoneFocus);
    if (gather > 0) {
      const scale = 1 - .4 * gather;
      rect = { x: 960 + (rect.x - 960) * scale, y: 540 + (rect.y - 540) * scale, w: rect.w * scale };
    }
    rects[key] = rect;
    const shown = t >= POP_AT(i) && t < OUTRO + .6;
    if (!shown) { instance.hide(); badge.style.visibility = 'hidden'; return; }
    // fly out of the centre with a spin (the gift tile simply takes over from the shrinking hero), then breathe with the kick
    const fly = key === 'G' ? 1 : snap(ramp(t, POP_AT(i), POP_AT(i) + .55));
    const h0 = rect.w * instance.height / instance.width;
    const cx = lerp(960, rect.x + rect.w / 2, fly), cy = lerp(540, rect.y + h0 / 2, fly);
    const size = lerp(.3, 1, fly) * (1 + .014 * beat * (1 - focus) * (1 - phoneFocus));
    const w = rect.w * size;
    const dim = key === 'D' || key === 'E' ? 1 : 1 - phoneFocus;
    const appear = key === 'G' ? ramp(t, POP_AT(i), POP_AT(i) + .15) : ramp(t, POP_AT(i), POP_AT(i) + .2);
    const opacity = clamp01(appear) * dim * (1 - gather);
    instance.place(cx - w / 2, cy - w * instance.height / instance.width / 2, w, opacity, key === 'D' ? 44 * size : 28 * (1 - focus));
    // themes: each switch lands with a little punch
    const kick = key === 'B' ? Math.max(0, ...THEMES.map(([at]) => t >= at && t < at + .35 ? .035 * (1 - ramp(t, at, at + .35)) : 0)) : 0;
    instance.frame.style.transform = `rotate(${(1 - fly) * (i % 2 ? 9 : -9)}deg) scale(${1 + kick})`;
    instance.frame.style.zIndex = String(10 + Math.round(Math.max(focus, key === 'E' ? phoneFocus : 0) * 10));
    // badge: in the tile's corner; grows and redraws when the tile takes the stage
    const badgeSize = lerp(64, 108, focus);
    const inset = lerp(20, 56, focus);
    const bx = key === 'D' ? rect.x + lerp(20, -150, focus) : rect.x + inset;
    const [start] = FOCUS[key];
    const bump = 1 + .18 * Math.sin(ramp(t, start, start + .45) * Math.PI);
    style(badge, {
      visibility: 'visible', left: `${bx}px`, top: `${rect.y + inset}px`, width: `${badgeSize}px`, height: `${badgeSize}px`,
      opacity: clamp01(ramp(t, POP_AT(i) + .25, POP_AT(i) + .45)) * dim * (1 - gather) * (1 - covered) * (key === 'E' ? 1 - phoneFocus : 1), transform: `scale(${clamp01(fly) * bump})`,
    });
    const svg = badge.querySelector('svg')!;
    svg.setAttribute('width', String(badgeSize * .54));
    svg.setAttribute('height', String(badgeSize * .54));
    drawIcon(badge, t >= start ? ramp(t, start + .05, start + .6) : ramp(t, POP_AT(i) + .25, POP_AT(i) + .85));
  });
  return rects;
}

// ---------- flashes, end mark ----------
const flash = film.appendChild(h('div', 'flash'));
const end = film.appendChild(h('div', 'end', `<div class="mark"><svg viewBox="0 0 24 24">${withLength(ICONS.star)}${withLength(Array.from({ length: 8 }, (_, i) => {
  const a = i * Math.PI / 4, r1 = 13.5, r2 = 16.5;
  return `<line class="ray" x1="${12 + Math.sin(a) * r1}" y1="${12 - Math.cos(a) * r1}" x2="${12 + Math.sin(a) * r2}" y2="${12 - Math.cos(a) * r2}"/>`;
}).join(''))}</svg></div><h1>雪夜礼物树</h1>`));
const endMark = end.querySelector<HTMLElement>('.mark')!;
const endTitle = end.querySelector<HTMLElement>('h1')!;
flash.style.zIndex = '90';
end.style.zIndex = '100';

function drawFlash(t: number): void {
  const burst = (at: number, peak: number, length = .45) => t >= at && t < at + length ? peak * (1 - ramp(t, at, at + length)) ** 2 : 0;
  const white = Math.max(burst(HOOK[0], .55, .3), burst(DROP, .7), burst(OUTRO + .35, .5), ...THEMES.slice(0, 3).map(([at]) => burst(at, .22, .3)));
  const cream = t >= HOOK[1] - .15 && t < HOOK[1] + .5 ? Math.min(ramp(t, HOOK[1] - .15, HOOK[1]), 1 - ramp(t, HOOK[1] + .15, HOOK[1] + .5)) : 0;
  style(flash, { opacity: Math.max(white, cream), background: cream > white ? '#f3efe6' : '#fff' });
}

function drawEnd(t: number): void {
  const k = inOut(ramp(t, END_AT - .2, END_AT + .3));
  end.style.visibility = k > 0 ? 'visible' : 'hidden';
  if (!k) return;
  end.style.opacity = String(k);
  drawIcon(endMark, ramp(t, END_AT + .2, END_AT + 1.3));
  for (const ray of endMark.querySelectorAll<SVGElement>('.ray')) {
    ray.setAttribute('stroke-dashoffset', String(1 - outCubic(ramp(t, END_AT + 1.1, END_AT + 1.5))));
    ray.style.opacity = String(1 - ramp(t, END_AT + 1.6, END_AT + 2.2));
  }
  style(endMark, { transform: `scale(${.7 + .3 * outBack(ramp(t, END_AT + .15, END_AT + .7))}) rotate(${(1 - outCubic(ramp(t, END_AT + .15, END_AT + 1.2))) * -40}deg)` });
  const rise = outCubic(ramp(t, END_AT + .55, END_AT + 1.35));
  style(endTitle, { opacity: rise, transform: `translateY(${(1 - rise) * 40}px)`, 'letter-spacing': `${lerp(.3, .08, rise)}em` });
}

function drawScenes(t: number): void {
  const { W } = tiles;
  const punch = (at: number) => 1 + .07 * (1 - outCubic(ramp(t, at, at + .6)));
  const open = drawOpening(t);
  // hook: two full-frame highlights, each landing with a slight zoom punch
  if (t < HOOK[1]) {
    const live = t < HOOK[0] ? H : W;
    (live === H ? W : H).hide();
    live.place(0, 0, 1920);
    live.frame.style.transform = `scale(${punch(t < HOOK[0] ? 0 : HOOK[0])})`;
    live.frame.style.zIndex = '50';
  } else H.hide();
  // A: shows through the morphing prompt box, takes the full frame at the drop, then shrinks into the gift tile
  if (t >= MORPH[0] && t < GRID_AT + .6) {
    A.frame.style.zIndex = '5';
    if (t < MORPH[1]) {
      const { box } = open;
      A.cover(box.x, box.y, box.w, box.h, inOut(ramp(t, MORPH[0] + .05, MORPH[0] + .5)), lerp(32, 24, open.morph));
      A.frame.style.transform = 'none';
    } else if (t < GRID_AT) {
      const { rect } = open;
      A.place(rect.x, rect.y, rect.w, 1, 24 * (1 - inOut(ramp(t, GROW_END, DROP))));
      A.frame.style.transform = t >= DROP ? `scale(${punch(DROP)})` : 'none';
    } else {
      const k = snap(ramp(t, GRID_AT, GRID_AT + .55));
      const rect = mix(FULL, SLOTS.G, k);
      A.place(rect.x, rect.y, rect.w, 1 - ramp(t, GRID_AT + .4, GRID_AT + .6), 28 * clamp01(k));
      A.frame.style.transform = 'none';
      A.frame.style.zIndex = '15';
    }
  } else if (t >= OUTRO) {
    A.place(0, 0, 1920, inOut(ramp(t, OUTRO + .1, OUTRO + .6)));
    A.frame.style.transform = `scale(${punch(OUTRO + .35)})`;
    A.frame.style.zIndex = '25';
  } else A.hide();
  const rects = t >= GRID_AT ? drawGrid(t) : (FEATURES.forEach(key => { if (key !== 'W' || t >= HOOK[1]) tiles[key].hide(); badges[key].style.visibility = 'hidden'; }), SLOTS);
  drawPointer(t, rects);
  drawFlash(t);
  drawEnd(t);
}

// ---------- scripted actions ----------
interface Cue { at: number; run: () => void }
let cues: Cue[] = [];
const cue = (at: number, run: () => void) => cues.push({ at, run });
let wishPose: Pose | undefined;
function setupCues(): void {
  cues = [];
  const { G, E, B, C, W, D } = tiles;
  cue(CONVERGE_AT, () => A.api.setMagicForm(1, 0));
  cue(IGNITE_AT, () => A.api.ignite());
  cue(OPEN_GIFT_AT, () => G.api.openGift('camera'));
  cue(GRID_AT - .4, () => { E.api.setClean(false); E.api.openEditor(); });
  cue(GRID_AT - .3, () => E.doc.querySelector<HTMLElement>('.gift-list li:nth-child(3) .gift-row')?.click());
  cue(GRID_AT - .2, () => {
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
  cue(WISH.land - .3, () => {
    const anchor = W.api.wishAnchor();
    if (!anchor) return;
    const out = Math.hypot(anchor[0], anchor[2]) || 1;
    const dir: Vec3 = [anchor[0] / out, 0, anchor[2] / out];
    wishPose = { target: [anchor[0], anchor[1] + .3, anchor[2]], position: [anchor[0] + dir[0] * 2.7, anchor[1] + .65, anchor[2] + dir[2] * 2.7] };
  });
  cue(WISH.note, () => W.api.showWish());
  // share: switch the editor to its share tab, then "copy link" (clipboard stubbed: capture has no clipboard)
  cue(SHARE.tab, () => {
    Object.defineProperty(E.win!.navigator, 'clipboard', { value: { writeText: async () => {} }, configurable: true });
    E.doc.querySelector<HTMLElement>('#editor .tabs button:nth-child(3)')?.click();
  });
  cue(SHARE.copy, () => E.doc.querySelector<HTMLElement>(COPY_BUTTON)?.click());
  cue(PHONE.tap, () => D.doc.querySelector<HTMLElement>('#ignite')?.click());
  cue(FINALE_AT, () => A.api.playFinale());
  cues.sort((a, b) => a.at - b.at);
}

function blend(a: Pose, b: Pose, k: number): Pose {
  return { position: a.position.map((v, i) => lerp(v, b.position[i], k)) as Vec3, target: a.target.map((v, i) => lerp(v, b.target[i], k)) as Vec3 };
}

function cameraFor(t: number): void {
  const { E, B, C, W } = tiles;
  if (t < GRID_AT + .6) {
    // slow drift while the tree is built; after the drop it swings round the tree with a short push-in
    const swing = .55 * inOut(ramp(t, DROP, GRID_AT + .6));
    A.api.setCameraPose(orbit(lerp(-.15, .22, ramp(t, 5, DROP)) + swing, lerp(-.06, -.025, ramp(t, 5, DROP)), lerp(20, 16.6, inOut(ramp(t, 6, DROP))) - 1.2 * Math.sin(ramp(t, DROP, GRID_AT + .6) * Math.PI), 4.0));
  } else if (t >= FINALE_AT - .5) A.api.setCameraPose(orbit(lerp(.3, .55, ramp(t, FINALE_AT - .5, END_AT + .3)), -.06, 19.5, 4.5));
  if (t <= HOOK[1] + .1) W.api.setCameraPose(orbit(lerp(.05, .28, ramp(t, HOOK[0], HOOK[1])), -.05, 18.5, 4.6));
  if (t >= GRID_AT - .5 && t < OUTRO + .8) {
    const k = ramp(t, GRID_AT - .5, OUTRO + .8);
    E.api.setCameraPose(orbit(lerp(.12, .24, k), .24, 10.6, 1.25));
    // themes: closer on the ornaments and lights while the colours change
    const close = focusOf('B', t);
    B.api.setCameraPose(blend(orbit(lerp(.4, .9, k), -.03, 17.5, 4.0), orbit(lerp(.6, .75, ramp(t, 24, 26)), .02, 8.5, 4.7), clamp01(close)));
    C.api.setCameraPose(orbit(lerp(-.3, .25, k), lerp(-.02, .12, inOut(ramp(t, MAGIC_AT, 30))), lerp(14, 20, inOut(ramp(t, MAGIC_AT, 30))), 4.1));
    const far = orbit(lerp(1.0, 1.15, k), .04, 12.5, 4.6);
    W.api.setCameraPose(wishPose ? blend(far, wishPose, inOut(ramp(t, WISH.land - .2, WISH.land + .9))) : far);
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
      tiles.B.api.setTheme('ice');
      setupCues();
      phase = 'settling';
    }
    if (phase === 'settling') {
      // the hook starts mid-action: the lid is just lifting off one gift, the star is already circling another tree
      if (settle === 62) tiles.W.api.playFinale();
      if (settle === 65) H.api.openGift('flowers');
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
      duration: DURATION, drop: DROP, hook: HOOK, typing: PROMPT_TIMES.filter((_, i) => PROMPT[i] !== '\n'), send: SEND_AT, morph: MORPH[0],
      converge: CONVERGE_AT, ignite: IGNITE_AT, grid: GRID_AT, pops: FEATURES.map((_, i) => POP_AT(i)), focuses: FEATURES.map(key => FOCUS[key][0]),
      clicks: CLICKS, themes: THEMES.slice(0, 3).map(([at]) => at), giftOpen: OPEN_GIFT_AT, hookGift: -2.5,
      wishType: Array.from(WISH_TEXT).map((_, i, all) => lerp(WISH.type[0], WISH.type[1], i / (all.length - 1))),
      wishSubmit: WISH.submit, wishLand: WISH.land, wishNote: WISH.note, magic: MAGIC_AT, share: SHARE, phone: PHONE,
      outro: OUTRO, finale: FINALE_AT, end: END_AT,
    };
    return renderMotionAudio(mix, audioCues);
  },
};
(window as unknown as { __promo: typeof api }).__promo = api;
