// Plain app footage for the README GIFs: one full-frame instance, no captions.
// 0–7 s ignite · 7.5–14 s open a gift and read the card · 15–24 s magic form and back.
// `?shot=editor` instead opens the editor on a lit tree, for a still of the creation panel.
import { gpuInfo, Instance } from './shared';

const editorShot = new URLSearchParams(location.search).get('shot') === 'editor';
const DURATION = editorShot ? 4 : 24.5;
const app = new Instance(`/?quality=high&seed=1225${editorShot ? '&skipIntro=1' : ''}`, 1920, 1080, [[0, DURATION]], document.body, '#ignite{display:none!important}');
app.place(0, 0, 1920);

const cues: [number, () => void][] = editorShot ? [[.5, () => app.api.openEditor()]] : [
  [.3, () => app.api.ignite()],
  [7.6, () => app.api.openGift('camera')],
  [12.9, () => (app.api as unknown as { closeGift(): boolean }).closeGift()],
  [15, () => app.api.setMagic(true)],
  [20.4, () => app.api.setMagic(false)],
];

let t = 0, next = 0, phase: 'loading' | 'settling' | 'ready' = 'loading', settle = 0;
function advance(dt: number): void {
  const to = t + dt;
  while (next < cues.length && cues[next][0] <= to) cues[next++][1]();
  app.step(dt * 1000);
  t = to;
}

const api = {
  preroll(): true | string {
    if (phase === 'loading') {
      app.step(50);
      if (!app.ready) return 'loading';
      if (!editorShot) app.api.setClean(true);
      phase = 'settling';
    }
    if (phase === 'settling') {
      app.step(100);
      if (++settle < 30) return 'settling';
      phase = 'ready';
    }
    return true;
  },
  seek(time: number): void {
    while (t < time - 1e-6) advance(Math.min(time - t, 1 / 30));
  },
  info: () => ({ duration: DURATION, gpu: gpuInfo() }),
  renderAudio: async () => '',
};
(window as unknown as { __promo: typeof api }).__promo = api;
