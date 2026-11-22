// Wordless promo film, in the manner of a model-launch "made with" reel:
// prompt typed into the app → the plan scrolls by → design artifacts on paper → the tree comes alive → it in use.
// Every visual is a pure function of film time `t`; the live app instances only advance when `seek` steps them.
import planSource from '../PLAN.md?raw';
import { renderFilmAudio } from './music';
import type { FilmCues } from './music';
import { envelope, escapeHtml, gpuInfo, h, Instance, inOut, lerp, orbit, outCubic, ramp, style, typed, typingTimes } from './shared';

const DURATION = 47;
const PROMPT = '做一个能直接发给朋友的 3D 圣诞树网页。雪夜、月光和远山，树要写实：用扫描的冷杉枝叶，挂上装饰球、金珠链和几百颗小灯。'
  + '打开时一片黑暗，轻触后灯串从树底沿着螺旋逐颗亮起，最后点燃树顶的星。树下放 6 个礼盒，点开会升起一张拍立得卡片，有照片和祝福。'
  + '还要能自己布置礼物、换主题、许愿，生成链接送给别人。用 Vite、TypeScript 和 Three.js，手机上也要流畅。一直做到可以上线为止。';
const REPLY = '我先把方案写下来，再照着它一步步搭出来。';
const PROMPT_TIMES = typingTimes(PROMPT, 1.0, .024, .012, .05);
const SEND_AT = PROMPT_TIMES.at(-1)! + .45;
const REPLY_TIMES = Array.from(REPLY).map((_, i) => SEND_AT + .75 + i * .045);
const TOOL_AT = REPLY_TIMES.at(-1)! + .35;
const SCROLL = [TOOL_AT + .5, 12.7];
const PAPER_AT = 12.4;
const DRAWING_AT = 17.6;
const NIGHT_AT = 23.1;
const CONVERGE_AT = 24;
const IGNITE_AT = 27; // star flares at +3.98 s, where the melody comes in
const FLARE_AT = IGNITE_AT + 3.98;
const GIFT_CUT = 31;
const OPEN_GIFT_AT = GIFT_CUT - .45;
const FINALE_CUT = 37;
const FINALE_AT = FINALE_CUT - .7;
const END_CUT = 43.5;
const GIFT_ID = 'camera';

const film = document.querySelector<HTMLElement>('#film')!;
const layer = (name: string) => film.appendChild(h('div', `layer ${name}`));

// ---------- app UI: composer, then the conversation with the plan ----------
const ui = layer('ui');
const uiCam = ui.appendChild(h('div', 'cam'));
const column = uiCam.appendChild(h('div', 'column'));
const icon = (path: string) => `<svg viewBox="0 0 24 24">${path}</svg>`;
const composerBlock = column.appendChild(h('div'));
composerBlock.append(h('div', 'chips',
  `<span class="chip">${icon('<rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M2.5 19h19"/>')}本地</span>`
  + `<span class="chip">${icon('<path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>')}christmas-tree</span>`));
const composer = composerBlock.appendChild(h('div', 'composer'));
const composerText = composer.appendChild(h('div', 'composer-text'));
composer.append(h('div', 'composer-foot',
  `<span>自动接受编辑</span>${icon('<path d="M12 5v14M5 12h14"/>')}${icon('<rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3"/>')}`
  + `<span class="send">${icon('<path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/>')}</span>`));
const send = composer.querySelector<HTMLElement>('.send')!;

const thread = column.appendChild(h('div'));
thread.append(h('div', 'message', escapeHtml(PROMPT)));
const reply = thread.appendChild(h('p', 'reply'));
const tool = thread.appendChild(h('div', 'tool', `<span class="dot"></span>已创建 <b>PLAN.md</b> <span class="add">+${planSource.split('\n').length}</span>`));
const doc = thread.appendChild(h('div', 'doc', renderMarkdown(planSource)));
const blur = document.querySelector<SVGFEGaussianBlurElement>('#vblur-amount')!;

function renderMarkdown(source: string): string {
  let code = false;
  return source.split('\n').slice(0, 150).map(line => {
    if (line.startsWith('```')) { code = !code; return ''; }
    if (code) return `<p class="code">${escapeHtml(line) || ' '}</p>`;
    const text = escapeHtml(line.replace(/\*\*(.+?)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1'));
    if (line.startsWith('# ')) return `<h1>${text.slice(2)}</h1>`;
    if (line.startsWith('## ')) return `<h2>${text.slice(3)}</h2>`;
    if (line.startsWith('### ')) return `<h3>${text.slice(4)}</h3>`;
    if (/^\s*[-*] /.test(line)) return `<li>${text.replace(/^\s*[-*] /, '')}</li>`;
    if (/^\d+\. /.test(line)) return `<li>${text.replace(/^\d+\. /, '')}</li>`;
    if (line.startsWith('>')) return `<blockquote>${text.replace(/^&gt;\s?/, '')}</blockquote>`;
    if (line.startsWith('|')) return /^\|[\s|:-]+\|$/.test(line) ? '' : `<p class="row">${line.split('|').slice(1, -1).map(cell => cell.trim().replace(/\*\*/g, '')).join('   ·   ')}</p>`;
    if (line === '---' || !line.trim()) return '';
    return `<p>${text}</p>`;
  }).join('');
}

/** Camera over the UI: `s` is the zoom, (fx, fy) the point of the page kept at screen centre. */
function uiCamera(s: number, fx: number, fy: number): void {
  uiCam.style.transform = `translate(${960 - fx * s}px, ${540 - fy * s}px) scale(${s})`;
}

function drawUi(t: number): void {
  const shown = t < PAPER_AT + .6;
  ui.style.visibility = shown ? 'visible' : 'hidden';
  if (!shown) return;
  ui.style.opacity = String(1 - inOut(ramp(t, PAPER_AT, PAPER_AT + .55)));
  // composer
  const text = typed(PROMPT, PROMPT_TIMES, t);
  const sent = t >= SEND_AT;
  const caret = !sent && (Math.floor(t * 2.2) % 2 === 0 || (t > PROMPT_TIMES[0] && t < SEND_AT - .3));
  const cleared = t >= SEND_AT + .25;
  composerText.innerHTML = (cleared ? '' : text ? escapeHtml(text) : '<span class="placeholder">描述任务，或问一个问题</span>') + (caret ? '<span class="caret"></span>' : '');
  style(send, { opacity: text && !sent ? 1 : .25, transform: `scale(${1 - .12 * Math.sin(ramp(t, SEND_AT - .1, SEND_AT + .15) * Math.PI)})` });
  const handoff = inOut(ramp(t, SEND_AT + .05, SEND_AT + .5));
  // before sending, the composer sits mid-screen; afterwards it slides to the bottom and the thread fills the page
  style(composerBlock, { position: 'absolute', left: '0', width: '1200px', top: `${lerp(400, 1280, handoff)}px`, opacity: 1 - handoff });
  style(thread, { position: 'absolute', left: '0', width: '1200px', top: `${lerp(260, 120, handoff)}px`, opacity: handoff });
  reply.textContent = typed(REPLY, REPLY_TIMES, t);
  const toolIn = outCubic(ramp(t, TOOL_AT, TOOL_AT + .3));
  style(tool, { opacity: toolIn });
  const scroll = ramp(t, SCROLL[0], SCROLL[1]);
  const distance = 5200 * scroll ** 2.2;
  const speed = 5200 * 2.2 * scroll ** 1.2 / (SCROLL[1] - SCROLL[0]);
  style(doc, { opacity: outCubic(ramp(t, TOOL_AT + .2, TOOL_AT + .6)) });
  thread.style.transform = `translateY(${-distance}px)`;
  blur.setAttribute('stdDeviation', `0 ${Math.min(14, speed / 900).toFixed(2)}`);
  thread.style.filter = speed > 200 ? 'url(#vblur)' : 'none';
  // camera: slow push into the prompt while typing, ease back for the reply, then lean in as the plan scrolls
  if (!sent) {
    const box = composer.offsetTop + composerBlock.offsetTop + composer.offsetHeight / 2;
    const push = inOut(ramp(t, .4, SEND_AT));
    uiCamera(lerp(1.3, 1.55, push), 960, lerp(560, box, push));
  } else {
    const lean = inOut(ramp(t, SCROLL[0] - .4, SCROLL[1]));
    uiCamera(lerp(1.55, 1.4, handoff) + .18 * lean, 960, lerp(640, 430, handoff));
  }
}

// ---------- paper: texture sheet, then the tree as a line drawing ----------
const paper = layer('paper');
const paperCam = paper.appendChild(h('div', 'cam'));
const sheet = paperCam.appendChild(h('div'));
const ATLAS = 2048, CROP = { x: 380, y: 80, w: 1500, h: 1560 };
function specimenPanel(x: number, y: number, w: number): HTMLElement {
  const k = w / CROP.w;
  const element = h('div', 'specimen');
  const size = `${ATLAS * k}px ${ATLAS * k}px`, position = `${-CROP.x * k}px ${-CROP.y * k}px`;
  style(element, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${CROP.h * k}px`, 'background-size': size, 'background-position': position, 'mask-size': size, 'mask-position': position, '-webkit-mask-size': size, '-webkit-mask-position': position });
  return element;
}
function board(x: number, y: number, w: number, hgt: number, tag: string): HTMLElement {
  const element = h('div', 'board', `<span class="tag">${tag}</span>`);
  style(element, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${hgt}px` });
  return sheet.appendChild(element);
}
board(120, 100, 1040, 880, 'TWIG / COLOR × ALPHA').append(specimenPanel(80, 30, 860));
const normals = board(1220, 100, 580, 420, 'TWIG / NORMAL');
normals.append(Object.assign(h('div', 'swatch-map'), { style: `left:20px;top:50px;width:540px;height:350px;background-image:url('/assets/tree/twig-normal.jpg');background-size:820px 820px;background-position:-200px -40px` }));
const bark = board(1220, 560, 580, 420, 'BARK / COLOR');
bark.append(Object.assign(h('div', 'swatch-map'), { style: `left:20px;top:50px;width:540px;height:350px;background-image:url('/assets/tree/bark-color.jpg');background-size:540px 540px;background-position:0 -80px` }));
const ruler = sheet.appendChild(h('div', 'ticks'));
style(ruler, { left: '120px', right: '120px', top: '1010px', bottom: 'auto' });
for (let i = 0; i <= 40; i++) ruler.append(Object.assign(h('i'), { style: `left:${i * 2.5}%;height:${i % 5 ? 10 : 18}px` }));

const drawingBorder = paper.appendChild(h('div', 'drawing-border', '<span class="tag">EVERGREEN / WIREFRAME</span>'));

function drawPaper(t: number): void {
  const shown = t > PAPER_AT - .05 && t < NIGHT_AT + .7;
  paper.style.visibility = shown ? 'visible' : 'hidden';
  if (!shown) return;
  paper.style.opacity = String(1 - inOut(ramp(t, NIGHT_AT, NIGHT_AT + .6)));
  // sheet: start tight on the needles, drift back to the whole board
  const pull = outCubic(ramp(t, PAPER_AT, DRAWING_AT + .3));
  const s = lerp(2.6, 1, pull);
  style(paperCam, { transform: `translate(${960 - lerp(640, 960, pull) * s}px, ${540 - lerp(470, 540, pull) * s}px) scale(${s})` });
  sheet.style.opacity = String(1 - inOut(ramp(t, DRAWING_AT - .25, DRAWING_AT + .35)));
  const drawing = envelope(t, DRAWING_AT - .25, DRAWING_AT + .4, NIGHT_AT + 2, NIGHT_AT + 3);
  drawingBorder.style.opacity = String(drawing);
}

// ---------- live scenes ----------
const scenes = layer('scenes');
scenes.style.background = 'transparent';
scenes.style.pointerEvents = 'none';
const quality = 'quality=high&seed=1225';
const A = new Instance(`/?${quality}`, 1920, 1080, [[0, 33.3], [42.9, DURATION]], scenes, '#ignite{display:none!important}');
const G = new Instance(`/?${quality}&skipIntro=1`, 1920, 1080, [[30.2, 37.1]], scenes, '#gift-dialog .gift-card{zoom:1.25}');
const P = new Instance(`/?${quality}&skipIntro=1`, 1920, 1080, [[16.9, 23.5], [35.9, 43.6]], scenes);
// stacking by z-index only: moving an iframe in the DOM would reload it
P.frame.style.zIndex = '1';
G.frame.style.zIndex = '1';
A.frame.style.zIndex = '2';
const instances = [A, G, P];
const black = film.appendChild(h('div', 'black'));

function drawScenes(t: number): void {
  // the line drawing is multiplied onto the paper below it; the night shots are plain
  const drawing = t >= DRAWING_AT - .3 && t < NIGHT_AT + .7;
  P.frame.classList.toggle('drawing', drawing);
  if (drawing) P.place(0, 0, 1920, envelope(t, DRAWING_AT - .25, DRAWING_AT + .45, NIGHT_AT, NIGHT_AT + .6));
  else if (t >= FINALE_CUT && t < END_CUT + .6) P.place(0, 0, 1920);
  else P.hide();
  if (t >= NIGHT_AT && t < GIFT_CUT) A.place(0, 0, 1920, inOut(ramp(t, NIGHT_AT, NIGHT_AT + .6)));
  else if (t >= END_CUT) A.place(0, 0, 1920, inOut(ramp(t, END_CUT, END_CUT + .6)));
  else A.hide();
  if (t >= GIFT_CUT && t < FINALE_CUT) G.place(0, 0, 1920); else G.hide();
  black.style.opacity = String(Math.max(1 - outCubic(ramp(t, 0, .6)), inOut(ramp(t, DURATION - 1.4, DURATION - .1))));
}

// ---------- scripted actions ----------
interface Cue { at: number; run: () => void }
let cues: Cue[] = [];
const cue = (at: number, run: () => void) => cues.push({ at, run });
function setupCues(): void {
  cues = [];
  cue(CONVERGE_AT, () => A.api.setMagicForm(1, 0));
  cue(IGNITE_AT, () => A.api.ignite());
  cue(OPEN_GIFT_AT, () => G.api.openGift(GIFT_ID));
  cue(NIGHT_AT + .5, () => P.api.setBlueprint(false));
  cue(FINALE_AT, () => P.api.playFinale());
  cues.sort((a, b) => a.at - b.at);
}

function cameraFor(t: number): void {
  if (t < 33.3) {
    const k = inOut(ramp(t, NIGHT_AT - .5, GIFT_CUT));
    A.api.setCameraPose(orbit(lerp(-.5, .06, k), lerp(.04, -.045, k), lerp(23, 17.2, k), lerp(3.7, 4.05, k)));
  }
  if (t >= 42.9) {
    const k = ramp(t, 42.9, DURATION);
    A.api.setCameraPose(orbit(lerp(.06, .16, k), lerp(-.04, .01, k), lerp(17, 24, outCubic(k)), 4.0));
  }
  if (t >= 16.9 && t < 23.5) {
    const k = inOut(ramp(t, 16.9, 23.5));
    P.api.setCameraPose(orbit(lerp(-.2, .9, k), lerp(.22, .02, k), lerp(5.2, 14.5, k), lerp(2.2, 4.0, k)));
  }
  if (t >= 35.9 && t < 43.6) {
    const k = ramp(t, 35.9, 43.6);
    P.api.setCameraPose(orbit(lerp(.18, .46, k), -.06, 19.5, 4.5));
  }
}

// ---------- driver ----------
let t = 0, nextCue = 0, settle = 0;
let phase: 'loading' | 'settling' | 'ready' = 'loading';

function draw(time: number): void {
  drawUi(time);
  drawPaper(time);
  drawScenes(time);
}

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
      const images = [...document.images].every(image => image.complete);
      if (!instances.every(instance => instance.ready) || !images || !document.fonts.check('400 32px "Noto Sans SC"')) return 'loading';
      for (const instance of instances) instance.api.setClean(true);
      A.api.setMagicForm(1, 1);
      P.api.setBlueprint(true);
      setupCues();
      phase = 'settling';
    }
    if (phase === 'settling') {
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
  info: () => ({ duration: DURATION, gpu: gpuInfo() }),
  renderAudio(mix: 'full' | 'effects'): Promise<string> {
    const audioCues: FilmCues = {
      duration: DURATION, typing: PROMPT_TIMES.filter((_, i) => i % 3 === 0), send: SEND_AT, reply: REPLY_TIMES, tool: TOOL_AT,
      scroll: SCROLL[0], paper: PAPER_AT, drawing: DRAWING_AT, night: NIGHT_AT, converge: CONVERGE_AT, ignite: IGNITE_AT,
      flare: FLARE_AT, giftOpen: OPEN_GIFT_AT, cuts: [GIFT_CUT, FINALE_CUT, END_CUT], finale: FINALE_AT,
    };
    return renderFilmAudio(mix, audioCues);
  },
};
(window as unknown as { __promo: typeof api }).__promo = api;
