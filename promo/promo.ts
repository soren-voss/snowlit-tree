// Promo film composition. Every visual is a pure function of the film time `t`;
// the live app instances (iframes) only advance when `seek` steps their virtual clocks.
import { cloneScene, exampleScene } from '../src/data/gifts';
import type { ThemeId } from '../src/data/gifts';
import { encodeScene } from '../src/data/share';
import { renderAudio } from './music';
import type { AudioCues } from './music';
import { clamp01, envelope, escapeHtml, h, Instance, inOut, lerp, orbit, outBack, outCubic, ramp, style, typed, typingTimes, gpuInfo } from './shared';
import type { Pose } from './shared';

// ---------- timing (seconds) ----------
const DROP = 14.4; // star ignites on the beat; everything after is on a 120 BPM grid
export const DURATION = 54.4;
const PROMPT = '帮我做一棵会发光的圣诞树，\n树下藏着送给 TA 的礼物。';
const REPLY = '好的，我来为你搭建这棵树。';
const STEPS = ['雪夜与月光', '冷杉枝叶', '灯串与星光', '树下的礼物'];
const STEP_AT = [6.35, 6.85, 7.35, 7.85];
const SEND_AT = 4.75;
const CONVERGE_AT = 7.5;
const IGNITE_AT = DROP - 4;
const OPEN_GIFT_AT = 20.25;
const GIFT_ID = 'camera';
const THEME_AT: [number, ThemeId, string][] = [[0, 'classic', '经典红金'], [31.4, 'ice', '冰蓝银'], [32.4, 'rose', '粉金'], [33.4, 'forest', '森林绿铜']];
const WISH_TEXT = '明年也要一起看雪';
const PHONE_TAP_AT = 43.5;
const FINALE_AT = 45.7;
const EDIT_CLICKS = { row: 26.95, scroll: [27.25, 27.85], color: 28.15, pattern: 28.85, shape: 29.55 };
const WISH_OPEN_AT = 38.55, WISH_TYPE = [38.95, 39.75], WISH_SUBMIT_AT = 40.05;

const PROMPT_TIMES = typingTimes(PROMPT, .95);
const REPLY_TIMES = Array.from(REPLY).map((_, i) => 5.45 + i * .055);

const film = document.querySelector<HTMLElement>('#film')!;
const layer = (name: string) => film.appendChild(h('div', `layer ${name}`));

const quality = 'quality=high&seed=1225';
const shared = cloneScene(exampleScene);
shared.recipient = '小雨';

const opening = layer('opening');
const scenes = layer('scenes');
const shadeLayer = layer('shade-layer');
const captions = layer('captions');
const phoneLayer = layer('phone-layer');
const pointer = layer('pointer');
const dip = film.appendChild(h('div', 'flat'));
dip.style.background = '#03050c';
const endLayer = layer('end-layer');

const A = new Instance(`/?${quality}`, 1920, 1080, [[0, 26.7]], scenes, '#ignite{display:none!important}#gift-dialog .gift-card{zoom:1.32}#gift-dialog{translate:150px 0}');
const E = new Instance(`/?${quality}&skipIntro=1`, 1120, 630, [[25.4, 30.9]], scenes);
const B = new Instance(`/?${quality}&skipIntro=1`, 1920, 1080, [[29.8, 34.5], [37.4, 42.7]], scenes, '#wish-dialog{zoom:1.6;translate:60px 0}');
const C = new Instance(`/?${quality}&skipIntro=1`, 1920, 1080, [[33.9, 38.5], [45.4, 50.9]], scenes);
const phone = h('div', 'phone', '<div class="notch"></div>');
const screen = phone.appendChild(h('div', 'screen'));
const D = new Instance(`/?${quality}#t=${encodeScene(shared)}`, 404, 874, [[41.6, 46.6]], screen);
const instances = [A, E, B, C, D];
phoneLayer.append(phone);

// ---------- opening: greeting + prompt box ----------
const sparkGlyph = '<span class="spark">✻</span>';
const greeting = opening.appendChild(h('h1', 'greeting', `${sparkGlyph}晚上好，今天想做点什么？`));
const prompt = opening.appendChild(h('div', 'prompt'));
const promptText = prompt.appendChild(h('div', 'prompt-text'));
prompt.append(h('div', 'prompt-foot', '<span class="model">Claude</span><span class="send"><svg viewBox="0 0 24 24"><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/></svg></span>'));
const sendButton = prompt.querySelector<HTMLElement>('.send')!;
const bubble = opening.appendChild(h('div', 'bubble', PROMPT.replace('\n', '')));
const reply = opening.appendChild(h('div', 'reply'));
const replyText = reply.appendChild(h('p', 'reply-text'));
const steps = reply.appendChild(h('ul', 'steps'));
const stepRows = STEPS.map(label => steps.appendChild(h('li', '', `<span class="tick"><svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg></span><span>${label}</span>`)));
const windowHead = opening.appendChild(h('div', 'window-head', '<span class="dot"></span>雪夜礼物树<span class="meta">实时预览</span>'));
const PREVIEW = { x: 1000, y: 330, w: 800 };
style(windowHead, { left: `${PREVIEW.x}px`, top: `${PREVIEW.y - 56}px`, width: `${PREVIEW.w}px` });

function drawOpening(t: number): void {
  const visible = t < 9.8;
  opening.style.visibility = visible ? 'visible' : 'hidden';
  if (!visible) return;
  // greeting + prompt
  const boxOut = inOut(ramp(t, 4.85, 5.35));
  const greetIn = outCubic(ramp(t, .15, .85));
  style(greeting, { opacity: greetIn * (1 - boxOut), transform: `translateY(${(1 - greetIn) * 26 - boxOut * 40}px)` });
  const promptIn = outCubic(ramp(t, .3, 1));
  style(prompt, { opacity: promptIn * (1 - boxOut), transform: `translateY(${(1 - promptIn) * 30 - boxOut * 120}px) scale(${1 - boxOut * .06})` });
  const text = typed(PROMPT, PROMPT_TIMES, t);
  const caretOn = t < SEND_AT && (Math.floor(t * 2.2) % 2 === 0 || (t > PROMPT_TIMES[0] && t < PROMPT_TIMES.at(-1)! + .2));
  promptText.innerHTML = (text ? escapeHtml(text) : '<span class="placeholder">和 Claude 说点什么…</span>') + (caretOn ? '<span class="caret"></span>' : '');
  const press = ramp(t, SEND_AT - .08, SEND_AT + .22);
  const ready = text.length > 0 ? 1 : .45;
  style(sendButton, { opacity: ready, transform: `scale(${1 - Math.sin(press * Math.PI) * .12})` });
  // chat
  const bubbleIn = outCubic(ramp(t, 5.0, 5.5));
  const chatOut = inOut(ramp(t, 8.25, 8.7));
  style(bubble, { opacity: bubbleIn * (1 - chatOut), transform: `translateY(${(1 - bubbleIn) * 40}px)` });
  replyText.innerHTML = (t >= REPLY_TIMES[0] ? sparkGlyph : '') + escapeHtml(typed(REPLY, REPLY_TIMES, t));
  style(reply, { opacity: 1 - chatOut, transform: `translateX(${-chatOut * 40}px)` });
  stepRows.forEach((row, i) => {
    const appear = outCubic(ramp(t, STEP_AT[i] - .35, STEP_AT[i] - .05));
    const done = t >= STEP_AT[i] + .35;
    const tick = row.querySelector<HTMLElement>('.tick')!;
    const check = tick.querySelector<SVGElement>('svg')!;
    style(row, { opacity: appear, transform: `translateY(${(1 - appear) * 18}px)` });
    if (done) {
      const pop = outBack(ramp(t, STEP_AT[i] + .35, STEP_AT[i] + .6));
      style(tick, { background: 'var(--coral)', 'border-color': 'var(--coral)', transform: `scale(${.8 + .2 * pop})` });
      check.style.opacity = '1';
    } else {
      style(tick, { background: 'transparent', 'border-color': 'var(--coral) var(--line) var(--line) var(--line)', transform: `rotate(${t * 540}deg)` });
      check.style.opacity = '0';
    }
  });
  const headIn = outCubic(ramp(t, 5.55, 6.15));
  const expand = inOut(ramp(t, 8.45, 9.6));
  style(windowHead, { opacity: headIn * (1 - ramp(t, 8.45, 8.75)), transform: `translateY(${(1 - headIn) * 30}px)` });
}

// ---------- captions ----------
interface CaptionSpec { at: number; out: number; tone: 'night' | 'day'; index?: string; label: string; lines: string[]; sub?: string; top: number; width?: number; className?: string }
const CAPTIONS: CaptionSpec[] = [
  { at: 9.5, out: 11.75, tone: 'night', label: 'Claude 正在构建', lines: ['36,000 颗星光，', '汇聚成一棵树'], top: 600 },
  { at: 11.95, out: 14.3, tone: 'night', label: '点亮', lines: ['灯串沿着螺旋，', '逐颗亮起'], top: 600 },
  { at: 16.5, out: 20.05, tone: 'night', label: '网页 3D 互动作品', lines: ['雪夜礼物树'], sub: '在雪夜里，点亮一棵属于你的圣诞树', top: 360, className: 'title-card' },
  { at: 20.6, out: 26.25, tone: 'night', index: '01', label: '拆礼物', lines: ['把心意，', '藏在树下'], sub: '点开礼盒，照片和祝福一起升起', top: 560 },
  { at: 26.75, out: 30.3, tone: 'day', index: '02', label: '布置', lines: ['每份礼物，', '由你布置'], sub: '照片、祝福语、包装纸<br>改完立刻看到', top: 330, width: 520 },
  { at: 30.85, out: 34.25, tone: 'night', index: '03', label: '主题', lines: ['四种配色，', '一键切换'], top: 520 },
  { at: 34.7, out: 38.3, tone: 'night', index: '04', label: '魔法形态', lines: ['一键，', '化作星河'], sub: '再点一次，又变回圣诞树', top: 560 },
  { at: 38.7, out: 42.3, tone: 'night', index: '05', label: '许愿卡', lines: ['许个愿，', '挂上树梢'], sub: '愿望化作光点，飞上树梢', top: 560 },
  { at: 42.75, out: 46.2, tone: 'day', index: '06', label: '分享', lines: ['一条链接，', '送给 TA'], sub: '对方手机打开就能拆<br>不用下载 App', top: 330 },
  { at: 46.7, out: 50.3, tone: 'night', label: '彩蛋', lines: ['拆完所有礼物，', '还有一场流星雨'], top: 600 },
];
const captionNodes = CAPTIONS.map(spec => {
  const node = captions.appendChild(h('div', `caption ${spec.tone} ${spec.className ?? ''}`));
  style(node, { top: `${spec.top}px`, width: `${spec.width ?? 820}px` });
  const label = node.appendChild(h('div', 'label', `${spec.index ? `<span class="index">${spec.index}</span>` : ''}<span class="rule"></span><span>${spec.label}</span>`));
  const title = node.appendChild(h('h2'));
  const lines = spec.lines.map(line => title.appendChild(h('span', '', line)));
  const sub = spec.sub ? node.appendChild(h('p', 'sub', spec.sub)) : undefined;
  return { spec, node, label, lines, sub };
});
const chipRow = captionNodes[5].node.appendChild(h('div', 'chips'));
const chips = THEME_AT.map(([, , name]) => chipRow.appendChild(h('span', 'chip', name)));

function drawCaptions(t: number): void {
  for (const { spec, node, label, lines, sub } of captionNodes) {
    const shown = t >= spec.at - .05 && t <= spec.out + .05;
    node.style.visibility = shown ? 'visible' : 'hidden';
    if (!shown) continue;
    const leave = inOut(ramp(t, spec.out - .35, spec.out));
    style(node, { opacity: 1 - leave, transform: `translateY(${-leave * 14}px)` });
    const k = outCubic(ramp(t, spec.at, spec.at + .45));
    style(label, { opacity: k, transform: `translateX(${(1 - k) * -24}px)` });
    lines.forEach((line, i) => {
      const e = outCubic(ramp(t, spec.at + .1 + i * .09, spec.at + .7 + i * .09));
      style(line, { opacity: e, transform: `translateY(${(1 - e) * 40}px)` });
    });
    if (sub) {
      const e = outCubic(ramp(t, spec.at + .35, spec.at + .9));
      style(sub, { opacity: e, transform: `translateY(${(1 - e) * 20}px)` });
    }
  }
  const themeIndex = THEME_AT.findLastIndex(([at]) => t >= at);
  chips.forEach((chip, i) => chip.classList.toggle('on', i === themeIndex));
  const chipIn = outCubic(ramp(t, 31.1, 31.6));
  style(chipRow, { opacity: chipIn, transform: `translateY(${(1 - chipIn) * 20}px)` });
}

// ---------- phone (share) + cursor ----------
const PHONE = { x: 930, y: 87 };
const ripple = phoneLayer.appendChild(h('div', 'ripple'));
const linkCard = phoneLayer.appendChild(h('div', 'link-card', '<span class="glyph">✦</span><span>送给小雨的圣诞树<small>点开链接，轻触点亮</small></span>'));
const cursor = pointer.appendChild(h('div', 'cursor', '<svg viewBox="0 0 24 24"><path d="M5 3.5v15.2l4.1-3.9 2.7 6 2.6-1.1-2.7-6h5.6z" fill="#fff" stroke="#1e1c19" stroke-width="1.4" stroke-linejoin="round"/></svg>'));
const clickRing = pointer.appendChild(h('div', 'click-ring'));

function drawPhone(t: number): void {
  const shown = t > 42.2 && t < 46.4;
  phoneLayer.style.visibility = shown ? 'visible' : 'hidden';
  if (!shown) { D.hide(); return; }
  const enter = outCubic(ramp(t, 42.4, 43.05));
  const leave = inOut(ramp(t, 45.9, 46.3));
  style(phone, { left: `${PHONE.x}px`, top: `${PHONE.y}px`, opacity: enter * (1 - leave), transform: `translateY(${(1 - enter) * 120}px) rotate(${(1 - enter) * 3}deg)` });
  D.place(0, 0, 404, 1, 0);
  const tap = ramp(t, PHONE_TAP_AT, PHONE_TAP_AT + .6);
  style(ripple, { left: `${PHONE.x + 16 + 202}px`, top: `${PHONE.y + 16 + 437}px`, opacity: tap > 0 && tap < 1 ? (1 - tap) * enter : 0, transform: `scale(${.3 + tap * 1.4})` });
  const card = outCubic(ramp(t, 43.0, 43.5));
  style(linkCard, { left: `${PHONE.x + 360}px`, top: '660px', opacity: card * (1 - leave), transform: `translateX(${(1 - card) * 40}px)` });
}

interface CursorKey { at: number; x: number; y: number; click?: boolean }
let cursorPath: CursorKey[] = [];
function drawCursor(t: number): void {
  const shown = t > 26.6 && t < 30.3;
  if (!shown || cursorPath.length === 0) {
    cursor.style.visibility = clickRing.style.visibility = 'hidden';
    return;
  }
  let x = cursorPath[0].x, y = cursorPath[0].y;
  for (let i = 1; i < cursorPath.length; i++) {
    const a = cursorPath[i - 1], b = cursorPath[i];
    if (t >= b.at) { x = b.x; y = b.y; continue; }
    if (t > a.at) {
      const k = inOut(ramp(t, a.at + (b.at - a.at) * .25, b.at));
      x = lerp(a.x, b.x, k);
      y = lerp(a.y, b.y, k);
    }
    break;
  }
  const fade = envelope(t, 26.6, 26.9, 29.95, 30.25);
  const lastClick = [...cursorPath].reverse().find(key => key.click && t >= key.at);
  const since = lastClick ? t - lastClick.at : 9;
  style(cursor, { visibility: 'visible', left: `${x}px`, top: `${y}px`, opacity: fade, transform: `scale(${1 - .14 * Math.sin(clamp01(since / .2) * Math.PI)})` });
  style(clickRing, { visibility: since < .45 ? 'visible' : 'hidden', left: `${x}px`, top: `${y}px`, opacity: (1 - since / .45) * fade, transform: `scale(${.4 + since / .45})` });
}

// ---------- scene windows over time ----------
const EDIT_WIN = { x: 680, y: 225, w: 1120 };
const FULL = { x: 0, y: 0, w: 1920 };
type Rect = typeof FULL;
const mix = (a: Rect, b: Rect, k: number): Rect => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), w: lerp(a.w, b.w, k) });
const shade = shadeLayer.appendChild(h('div', 'shade'));

function drawScenes(t: number): void {
  for (const instance of [A, E, B, C]) instance.hide();
  // A: preview window → full screen → shrinks into the editor window
  if (t >= 5.5 && t < 26.7) {
    const appear = outCubic(ramp(t, 5.55, 6.15));
    const expand = inOut(ramp(t, 8.45, 9.6));
    let rect = mix({ x: PREVIEW.x, y: PREVIEW.y, w: PREVIEW.w }, FULL, expand);
    const shrink = inOut(ramp(t, 26.2, 26.65));
    if (shrink > 0) rect = mix(FULL, EDIT_WIN, shrink);
    A.place(rect.x, rect.y + (1 - appear) * 30, rect.w, appear, lerp(lerp(0, 0, expand), 24, shrink));
    A.frame.style.borderRadius = expand < 1 ? `0 0 ${20 * (1 - expand)}px ${20 * (1 - expand)}px` : `${24 * shrink}px`;
    A.frame.classList.toggle('windowed', expand < 1 || shrink > 0);
  }
  // E: editor window on cream
  if (t >= 26.35 && t < 30.9) {
    const grow = inOut(ramp(t, 30.3, 30.85));
    const rect = mix(EDIT_WIN, FULL, grow);
    E.place(rect.x, rect.y, rect.w, outCubic(ramp(t, 26.35, 26.6)), 24 * (1 - grow));
    E.frame.classList.add('windowed');
  }
  // B: themes (full), then wish (full)
  if (t >= 30.35 && t < 34.4) {
    const grow = inOut(ramp(t, 30.3, 30.85));
    const rect = mix(EDIT_WIN, FULL, grow);
    B.place(rect.x, rect.y, rect.w, ramp(t, 30.35, 30.6), 24 * (1 - grow));
  }
  if (t >= 38.4 && t < 42.65) B.place(0, 0, 1920, 1 - ramp(t, 42.2, 42.6));
  // C: magic, then finale
  if (t >= 34.4 && t < 38.4) C.place(0, 0, 1920);
  if (t >= 46.05 && t < 50.95) C.place(0, 0, 1920, outCubic(ramp(t, 46.05, 46.45)));
  // dips to black between full-screen shots
  const dips = [20.3, 34.4, 38.4].map(at => envelope(t, at - .16, at, at, at + .18));
  dip.style.opacity = String(Math.max(...dips));
  // caption shading over night shots
  const night = CAPTIONS.filter(c => c.tone === 'night').map(c => envelope(t, c.at - .2, c.at + .3, c.out - .2, c.out + .2));
  shade.style.opacity = String(Math.max(...night) * (t < 46.2 && t > 42.5 ? 0 : 1));
}

function drawEnd(t: number): void {
  const k = inOut(ramp(t, 50.35, 50.95));
  endLayer.style.visibility = k > 0 ? 'visible' : 'hidden';
  if (!k) return;
  endLayer.style.background = 'var(--cream)';
  endLayer.style.opacity = String(k);
  const title = outCubic(ramp(t, 50.8, 51.5));
  style(endTitle, { opacity: title, transform: `translateY(${(1 - title) * 30}px)` });
  const line = typed(END_LINE, END_TIMES, t);
  endTagline.innerHTML = escapeHtml(line) + (t < 54.4 && Math.floor(t * 2.2) % 2 === 0 ? '<span class="caret" style="height:56px;vertical-align:-8px"></span>' : '');
  const credit = outCubic(ramp(t, 52.3, 52.9));
  style(endCredit, { opacity: credit });
}
const END_LINE = '做一棵树，送给 TA';
const END_TIMES = typingTimes(END_LINE, 51.35);
const endWrap = endLayer.appendChild(h('div', 'end flat'));
const endTitle = endWrap.appendChild(h('h1', '', '雪夜礼物树'));
const endTagline = endWrap.appendChild(h('p', 'tagline'));
const endCredit = endWrap.appendChild(h('p', 'credit', 'Built with <b>Claude Code</b>'));

// ---------- scripted actions inside the app instances ----------
interface Cue { at: number; run: () => void }
let cues: Cue[] = [];
function cue(at: number, run: () => void): void { cues.push({ at, run }); }

function clickIn(instance: Instance, selector: string, origin: { x: number; y: number }, at: number, scale = 1): void {
  cue(at - .55, () => {
    const element = instance.doc.querySelector<HTMLElement>(selector);
    if (!element) { console.warn('missing', selector); return; }
    const box = element.getBoundingClientRect();
    cursorPath.push({ at, x: origin.x + (box.left + box.width / 2) * scale, y: origin.y + (box.top + box.height / 2) * scale, click: true });
  });
  cue(at, () => instance.doc.querySelector<HTMLElement>(selector)?.click());
}

function setupCues(): void {
  cues = [];
  cursorPath = [{ at: 26.6, x: 1180, y: 900 }];
  cue(CONVERGE_AT, () => A.api.setMagicForm(1, 0));
  cue(IGNITE_AT, () => A.api.ignite());
  cue(20.18, () => A.api.setCameraPose(null));
  cue(OPEN_GIFT_AT, () => A.api.openGift(GIFT_ID));
  // editor
  cue(25.5, () => { E.api.setClean(false); E.api.openEditor(); });
  clickIn(E, `.gift-list li:nth-child(3) .gift-row`, EDIT_WIN, EDIT_CLICKS.row);
  clickIn(E, `.swatches [data-color="#c9a24f"]`, EDIT_WIN, EDIT_CLICKS.color);
  clickIn(E, `[aria-label="包装纹样"] button:nth-child(3)`, EDIT_WIN, EDIT_CLICKS.pattern);
  clickIn(E, `[aria-label="盒型"] button:nth-child(3)`, EDIT_WIN, EDIT_CLICKS.shape);
  // themes
  for (const [at, theme] of THEME_AT) if (at > 0) cue(at, () => B.api.setTheme(theme));
  cue(37.5, () => B.api.setTheme('classic'));
  // magic + wish
  cue(34.45, () => C.api.setMagic(true));
  cue(WISH_OPEN_AT, () => B.doc.querySelector<HTMLElement>('#toolbar .tool')?.click());
  const wishChars = Array.from(WISH_TEXT);
  wishChars.forEach((_, i) => cue(lerp(WISH_TYPE[0], WISH_TYPE[1], i / (wishChars.length - 1)), () => {
    const area = B.doc.querySelector<HTMLTextAreaElement>('#wish-dialog textarea');
    if (!area) return;
    area.value = wishChars.slice(0, i + 1).join('');
    area.dispatchEvent(new Event('input'));
  }));
  cue(WISH_SUBMIT_AT, () => B.doc.querySelector<HTMLElement>('#wish-dialog button.primary')?.click());
  // share + finale
  cue(PHONE_TAP_AT, () => D.doc.querySelector<HTMLElement>('#ignite')?.click());
  cue(45.0, () => C.api.setMagicForm(0, 0));
  cue(FINALE_AT, () => C.api.playFinale());
  cues.sort((a, b) => a.at - b.at);
}

// ---------- camera paths ----------
function cameraFor(t: number): void {
  if (t < 20.18) {
    const shift = lerp(0, 3.0, inOut(ramp(t, 9.5, 10.7))) + .4 * inOut(ramp(t, 15.8, 17));
    const distance = lerp(20, 17.4, inOut(ramp(t, 7.5, 14))) - 1.1 * ramp(t, 14, 20.2);
    A.api.setCameraPose(orbit(lerp(-.06, .24, ramp(t, 5, 20.2)), lerp(-.07, -.03, ramp(t, 6, 16)), distance, 4.05, shift));
  }
  if (t >= 25.4 && t < 30.9) E.api.setCameraPose(orbit(lerp(.1, .22, ramp(t, 25.4, 30.9)), .24, 10.6, 1.25, 0));
  if (t >= 29.8 && t < 34.5) B.api.setCameraPose(orbit(lerp(.42, .78, ramp(t, 29.8, 34.5)), -.03, 17, 3.95, 3.0));
  if (t >= 37.4 && t < 42.7) B.api.setCameraPose(orbit(lerp(1.0, 1.2, ramp(t, 37.4, 42.7)), .03, 14, 4.3, 2.4));
  if (t >= 33.9 && t < 38.5) C.api.setCameraPose(orbit(lerp(-.28, .06, ramp(t, 33.9, 38.5)), lerp(.0, .09, inOut(ramp(t, 34.4, 38.4))), lerp(17, 20, inOut(ramp(t, 34.4, 38.4))), 4.1, 2.5));
  if (t >= 45.4 && t < 50.9) C.api.setCameraPose(orbit(lerp(.12, .4, ramp(t, 45.4, 50.9)), .03, 18.5, 4.1, 2.8));
}

function scrollEditor(t: number): void {
  if (t < EDIT_CLICKS.scroll[0] || t > 30.9) return;
  const body = E.doc.querySelector<HTMLElement>('#editor .editor-body');
  const target = E.doc.querySelector<HTMLElement>('#editor .swatches');
  if (!body || !target) return;
  const goal = Math.max(0, target.offsetTop - body.offsetTop - 90);
  body.scrollTop = goal * inOut(ramp(t, EDIT_CLICKS.scroll[0], EDIT_CLICKS.scroll[1]));
}

// ---------- driver ----------
let t = 0;
let nextCue = 0;
let phase: 'loading' | 'settling' | 'ready' = 'loading';
let settle = 0;

function draw(time: number): void {
  drawOpening(time);
  drawScenes(time);
  drawCaptions(time);
  drawPhone(time);
  drawCursor(time);
  drawEnd(time);
}

function advance(dt: number): void {
  const next = t + dt;
  while (nextCue < cues.length && cues[nextCue].at <= next) cues[nextCue++].run();
  cameraFor(next);
  scrollEditor(next);
  for (const instance of instances) if (instance.isActive(next)) instance.step(dt * 1000);
  t = next;
}

const api = {
  /** Called repeatedly by the renderer until it returns true. */
  preroll(): true | string {
    if (phase === 'loading') {
      for (const instance of instances) instance.step(50);
      if (!instances.every(instance => instance.ready) || !document.fonts.check('600 92px "Noto Serif SC"')) return 'loading';
      for (const instance of instances) instance.api.setClean(true);
      A.api.setMagicForm(1, 1);
      setupCues();
      phase = 'settling';
    }
    if (phase === 'settling') {
      // let hints, fades and the galaxy spin settle before frame 0
      for (const instance of instances) instance.step(100);
      cameraFor(0);
      if (++settle < 90) return 'settling';
      phase = 'ready';
      draw(0);
    }
    return true;
  },
  seek(time: number): void {
    while (t < time - 1e-6) advance(Math.min(time - t, 1 / 20));
    draw(t);
  },
  info() {
    return { duration: DURATION, gpu: gpuInfo() };
  },
  renderAudio(mix: 'full' | 'effects'): Promise<string> {
    const audioCues: AudioCues = {
      drop: DROP, duration: DURATION, typing: PROMPT_TIMES.filter((_, i) => PROMPT[i] !== '\n'), send: SEND_AT,
      reply: REPLY_TIMES, steps: STEP_AT.map(at => at + .35), ignite: IGNITE_AT, giftOpen: OPEN_GIFT_AT,
      clicks: [EDIT_CLICKS.row, EDIT_CLICKS.color, EDIT_CLICKS.pattern, EDIT_CLICKS.shape, WISH_SUBMIT_AT],
      wishType: Array.from(WISH_TEXT).map((_, i, all) => lerp(WISH_TYPE[0], WISH_TYPE[1], i / (all.length - 1))),
      wishLand: WISH_SUBMIT_AT + 1.75, magic: 34.45, phoneTap: PHONE_TAP_AT, finale: FINALE_AT, endTyping: END_TIMES,
      whooshes: [8.45, 20.15, 26.2, 30.3, 38.25, 42.3, 46.0, 50.3], themes: THEME_AT.slice(1).map(([at]) => at),
    };
    return renderAudio(mix, audioCues);
  },
};
(window as unknown as { __promo: typeof api }).__promo = api;
