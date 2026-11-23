// Helpers shared by the promo compositions: easing, DOM, live app instances and camera poses.
import type { ThemeId } from '../src/data/gifts';

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export const ramp = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
export const outCubic = (x: number) => 1 - (1 - x) ** 3;
export const inOut = (x: number) => x < .5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
export const outBack = (x: number) => 1 + 2.2 * (x - 1) ** 3 + 1.2 * (x - 1) ** 2;
/** Fades in over [a, b], out over [c, d]. */
export const envelope = (t: number, a: number, b: number, c: number, d: number) => Math.min(outCubic(ramp(t, a, b)), 1 - inOut(ramp(t, c, d)));

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', html = ''): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (html) element.innerHTML = html;
  return element;
}

export function style(element: HTMLElement, values: Partial<Record<string, string | number>>): void {
  for (const [key, value] of Object.entries(values)) element.style.setProperty(key, String(value));
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!)).replace(/\n/g, '<br>');
}

/** Deterministic typing rhythm, shared by the visuals and the key-click sounds. */
export function typingTimes(text: string, start: number, base = .085, jitter = .07, pause = .22): number[] {
  let seed = 7, at = start;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  return Array.from(text).map((char, i, all) => {
    if (i) at += char === '\n' ? .05 : base + rand() * jitter + ('，。'.includes(all[i - 1]) ? pause : 0);
    return at;
  });
}

export function typed(text: string, times: number[], t: number): string {
  return Array.from(text).filter((_, i) => t >= times[i]).join('');
}

// ---------- live app instances ----------
export type Vec3 = [number, number, number];
export interface Pose { position: Vec3; target: Vec3 }
export interface TreeApi {
  ready: boolean;
  phase: string;
  setClean(clean: boolean): void;
  setCameraPose(pose: Pose | null): void;
  setMagicForm(form: number, target: 0 | 1): void;
  setMagic(on: boolean): void;
  setTheme(theme: ThemeId): void;
  setBlueprint(on: boolean): void;
  wishAnchor(): Vec3 | undefined;
  showWish(): void;
  openGift(id: string): boolean;
  openEditor(): void;
  closeEditor(): void;
  playFinale(): void;
  ignite(): void;
}
type AppWindow = Omit<Window, '__tree'> & { __tree?: TreeApi; __vt?: { step(ms: number): void } };

export class Instance {
  readonly frame = h('div', 'frame');
  readonly iframe = h('iframe');
  private loaded = false;
  constructor(src: string, readonly width: number, readonly height: number, readonly active: [number, number][], parent: HTMLElement, private readonly css = '') {
    this.iframe.width = String(width);
    this.iframe.height = String(height);
    this.iframe.src = src;
    this.iframe.addEventListener('load', () => {
      const doc = this.iframe.contentDocument!;
      doc.head.append(Object.assign(doc.createElement('style'), { textContent: `#loading{display:none!important}${this.css}` }));
      this.loaded = true;
    });
    this.frame.append(this.iframe);
    parent.append(this.frame);
  }
  get win(): AppWindow | null { return this.loaded ? this.iframe.contentWindow as unknown as AppWindow : null; }
  get api(): TreeApi { return this.win!.__tree!; }
  get doc(): Document { return this.iframe.contentDocument!; }
  get ready(): boolean { return !!this.win?.__tree?.ready; }
  isActive(t: number): boolean { return this.active.some(([a, b]) => t >= a && t <= b); }
  step(ms: number): void { this.win?.__vt?.step(ms); }
  /** Places the frame at a rectangle on the film; the app keeps rendering at its own size and is scaled to fit. */
  place(x: number, y: number, w: number, opacity = 1, radius = 0): void {
    style(this.frame, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${w * this.height / this.width}px`, opacity, 'border-radius': `${radius}px`, visibility: opacity > 0 ? 'visible' : 'hidden' });
    this.iframe.style.transform = `scale(${w / this.width})`;
  }
  /** Like `place`, but any w × h box: the app is scaled to cover it and centred (used while a window changes shape). */
  cover(x: number, y: number, w: number, h: number, opacity = 1, radius = 0): void {
    const scale = Math.max(w / this.width, h / this.height);
    style(this.frame, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px`, opacity, 'border-radius': `${radius}px`, visibility: opacity > 0 ? 'visible' : 'hidden' });
    this.iframe.style.transform = `translate(${(w - this.width * scale) / 2}px, ${(h - this.height * scale) / 2}px) scale(${scale})`;
  }
  hide(): void { this.frame.style.visibility = 'hidden'; }
}

/** Orbit-style camera pose; `shift` trucks the camera left so the tree sits right of centre. */
export function orbit(angle: number, elevation: number, distance: number, targetY: number, shift = 0): Pose {
  const target: Vec3 = [-Math.cos(angle) * shift, targetY, Math.sin(angle) * shift];
  return {
    target,
    position: [
      target[0] + Math.sin(angle) * Math.cos(elevation) * distance,
      targetY + Math.sin(elevation) * distance,
      target[2] + Math.cos(angle) * Math.cos(elevation) * distance,
    ],
  };
}

/** Name of the GPU the capture browser renders with (printed by the renderer). */
export function gpuInfo(): string {
  const gl = document.createElement('canvas').getContext('webgl2');
  const ext = gl?.getExtension('WEBGL_debug_renderer_info');
  return ext ? gl!.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
}
