// Frame-by-frame renderer for the promo video.
// Drives the system Chrome over the DevTools protocol (Node's built-in WebSocket, no npm packages),
// advances the page's virtual clock one frame at a time, screenshots it and pipes the frames into ffmpeg.
//
//   node promo/render.mjs --preview            960x540 30fps draft with music
//   node promo/render.mjs                      1920x1080 60fps final with music (+ effects-only version)
//   node promo/render.mjs --stills 3,12.5,20   PNG stills at the given seconds
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = name => args.includes(`--${name}`);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};

const preview = flag('preview');
const url = option('url', 'http://localhost:5173/promo/index.html');
const fps = Number(option('fps', preview ? 30 : 60));
const outScale = Number(option('scale', preview ? .5 : 1));
const from = Number(option('from', 0));
const to = option('to') === undefined ? undefined : Number(option('to'));
const stills = option('stills')?.split(',').map(Number);
const outDir = resolve(here, 'out');
const output = resolve(outDir, option('out', preview ? 'preview.mp4' : 'snowlit-tree-promo.mp4'));
const ffmpeg = option('ffmpeg', process.env.FFMPEG ?? 'D:/Tools/ffmpeg/ffmpeg-9.1-full_build/bin/ffmpeg.exe');
const chrome = option('chrome', 'C:/Program Files/Google/Chrome/Application/chrome.exe');
const headed = flag('headed');
const WIDTH = 1920, HEIGHT = 1080;

mkdirSync(outDir, { recursive: true });

// ---------- Chrome + CDP ----------
const profile = mkdtempSync(join(tmpdir(), 'promo-chrome-'));
const browser = spawn(chrome, [
  ...(headed ? [] : ['--headless=new']),
  `--user-data-dir=${profile}`, '--remote-debugging-port=0', '--no-first-run', '--no-default-browser-check',
  '--mute-audio', '--hide-scrollbars', '--force-device-scale-factor=1', `--window-size=${WIDTH},${HEIGHT}`,
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
  '--disable-features=CalculateNativeWinOcclusion', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11',
  '--autoplay-policy=no-user-gesture-required', 'about:blank',
], { stdio: 'ignore' });

async function devtoolsUrl() {
  const file = join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 200; i++) {
    if (existsSync(file)) {
      const [port, path] = readFileSync(file, 'utf8').trim().split('\n');
      if (port && path) return `ws://127.0.0.1:${port}${path}`;
    }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('Chrome did not start');
}

const socket = new WebSocket(await devtoolsUrl());
await new Promise((ok, fail) => { socket.onopen = ok; socket.onerror = fail; });
let nextId = 0;
const pending = new Map();
socket.onmessage = event => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { ok, fail } = pending.get(message.id);
    pending.delete(message.id);
    message.error ? fail(new Error(`${message.error.message} ${message.error.data ?? ''}`)) : ok(message.result);
  } else if (message.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(message.params.type)) {
    console.log(`[page ${message.params.type}]`, message.params.args.map(a => a.value ?? a.description).join(' '));
  } else if (message.method === 'Runtime.exceptionThrown') {
    console.log('[page exception]', message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
  }
};
function send(method, params = {}, sessionId) {
  const id = ++nextId;
  socket.send(JSON.stringify({ id, method, params, sessionId }));
  return new Promise((ok, fail) => pending.set(id, { ok, fail }));
}

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const page = (method, params) => send(method, params, sessionId);
async function evaluate(expression, awaitPromise = false) {
  const result = await page('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result.result.value;
}

function shutdown() {
  try { browser.kill(); } catch {}
  setTimeout(() => { try { rmSync(profile, { recursive: true, force: true }); } catch {} }, 1500);
}
process.on('exit', shutdown);
process.on('SIGINT', () => process.exit(130));

await page('Page.enable');
await page('Runtime.enable');
await page('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false });
await page('Page.addScriptToEvaluateOnNewDocument', { source: readFileSync(join(here, 'vt.js'), 'utf8') });
await page('Page.navigate', { url });

// ---------- warm up: step the virtual clock until every scene has loaded ----------
const started = Date.now();
for (;;) {
  const state = await evaluate('window.__promo ? window.__promo.preroll() : "boot"').catch(() => 'boot');
  if (state === true) break;
  if (Date.now() - started > 180000) throw new Error(`Timed out while loading (${state})`);
  await new Promise(r => setTimeout(r, state === 'boot' ? 200 : 5));
}
const info = await evaluate('window.__promo.info()');
console.log(`Loaded in ${((Date.now() - started) / 1000).toFixed(1)}s · ${info.gpu} · duration ${info.duration}s`);

const duration = Math.min(to ?? info.duration, info.duration);
const clip = { x: 0, y: 0, width: WIDTH, height: HEIGHT, scale: outScale };

if (stills) {
  let at = 0;
  for (const time of [...stills].sort((a, b) => a - b)) {
    // advance frame by frame so the page's own events and promises run between steps, exactly as in a video render
    while (at < time) {
      at = Math.min(time, at + 1 / 30);
      await evaluate(`window.__promo.seek(${at})`);
    }
    const { data } = await page('Page.captureScreenshot', { format: 'png', clip });
    const file = join(outDir, `still-${String(time).replace('.', '_')}s.png`);
    writeFileSync(file, Buffer.from(data, 'base64'));
    console.log(file);
  }
  process.exit(0);
}

// ---------- audio ----------
const audioFiles = [];
if (!flag('no-audio')) {
  for (const mix of preview ? ['full'] : ['full', 'effects']) {
    const base64 = await evaluate(`window.__promo.renderAudio(${JSON.stringify(mix)})`, true);
    const file = join(outDir, `audio-${mix}.wav`);
    writeFileSync(file, Buffer.from(base64, 'base64'));
    audioFiles.push(file);
  }
}

// ---------- frames → ffmpeg ----------
const outWidth = Math.round(WIDTH * outScale), outHeight = Math.round(HEIGHT * outScale);
const encodeArgs = ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-'];
if (audioFiles[0]) encodeArgs.push('-ss', String(from), '-i', audioFiles[0]);
encodeArgs.push('-vf', `scale=${outWidth}:${outHeight}:flags=lanczos:in_range=pc:out_range=tv,format=yuv420p`, '-color_range', 'tv',
  '-c:v', 'libx264', '-preset', preview ? 'medium' : 'slow', '-crf', preview ? '20' : '15', '-profile:v', 'high',
  '-r', String(fps), '-g', String(fps * 2), '-bf', '2', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709');
if (audioFiles[0]) encodeArgs.push('-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-shortest');
encodeArgs.push('-movflags', '+faststart', output);
const encoder = spawn(ffmpeg, encodeArgs, { stdio: ['pipe', 'inherit', 'inherit'] });
const encoded = new Promise((ok, fail) => encoder.on('close', code => code === 0 ? ok() : fail(new Error(`ffmpeg exited ${code}`))));

const total = Math.round((duration - from) * fps);
const clock = Date.now();
await evaluate(`window.__promo.seek(${from})`);
for (let frame = 0; frame < total; frame++) {
  if (frame) await evaluate(`window.__promo.seek(${from + frame / fps})`);
  const { data } = await page('Page.captureScreenshot', { format: 'jpeg', quality: preview ? 92 : 97, clip: { ...clip, scale: 1 } });
  if (!encoder.stdin.write(Buffer.from(data, 'base64'))) await new Promise(r => encoder.stdin.once('drain', r));
  if (frame % fps === 0) {
    const rate = (frame + 1) / ((Date.now() - clock) / 1000);
    process.stdout.write(`\r${(from + frame / fps).toFixed(1)}s / ${duration}s · ${rate.toFixed(1)} fps · ETA ${Math.round((total - frame) / rate)}s   `);
  }
}
encoder.stdin.end();
await encoded;
console.log(`\nWrote ${output}`);

if (!preview && audioFiles[1]) {
  const alt = output.replace(/\.mp4$/, '-sfx-only.mp4');
  await new Promise((ok, fail) => spawn(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-i', output, '-i', audioFiles[1],
    '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-shortest', '-movflags', '+faststart', alt], { stdio: 'inherit' })
    .on('close', code => code === 0 ? ok() : fail(new Error(`ffmpeg exited ${code}`))));
  console.log(`Wrote ${alt}`);
}
process.exit(0);
