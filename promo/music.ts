// Original score for the promo, rendered offline with WebAudio (no samples, nothing to license).
// "Jingle Bells" (James Lord Pierpont, 1857) is in the public domain; the arrangement and sounds are synthesized here.
export interface AudioCues {
  drop: number;
  duration: number;
  typing: number[];
  send: number;
  reply: number[];
  steps: number[];
  ignite: number;
  giftOpen: number;
  clicks: number[];
  wishType: number[];
  wishLand: number;
  magic: number;
  phoneTap: number;
  finale: number;
  endTyping: number[];
  whooshes: number[];
  themes: number[];
}

const RATE = 48000;
const BEAT = .5; // 120 BPM
export const midi = (name: string) => {
  const match = /^([A-G])(#|b)?(\d)$/.exec(name)!;
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[match[1]]!;
  return 12 * (Number(match[3]) + 1) + base + (match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0);
};
const hz = (note: number) => 440 * 2 ** ((note - 69) / 12);
const CHORDS: Record<string, string[]> = {
  C: ['C3', 'G3', 'C4', 'E4'], Cmaj7: ['C3', 'G3', 'B3', 'E4'], Am7: ['A2', 'E3', 'G3', 'C4'], Fmaj7: ['F2', 'C3', 'E3', 'A3'],
  F: ['F2', 'C3', 'F3', 'A3'], G: ['G2', 'D3', 'G3', 'B3'], G7: ['G2', 'D3', 'F3', 'B3'], D7: ['D3', 'A3', 'C4', 'F#4'],
};
const ROOTS: Record<string, string> = { C: 'C2', Cmaj7: 'C2', Am7: 'A1', Fmaj7: 'F1', F: 'F1', G: 'G1', G7: 'G1', D7: 'D2' };

/** Parses "E5 E5 E5:2 R:1" into [beat offset, midi, beats]. */
export function phrase(text: string): [number, number, number][] {
  const notes: [number, number, number][] = [];
  let beat = 0;
  for (const token of text.trim().split(/\s+/)) {
    const [name, length] = token.split(':');
    const beats = length ? Number(length) : 1;
    if (name !== 'R') notes.push([beat, midi(name), beats]);
    beat += beats;
  }
  return notes;
}

/** Buses and synthesized voices shared by every score. */
export function createEngine(duration: number) {
  const ctx = new OfflineAudioContext(2, Math.ceil(duration * RATE), RATE);
  let seed = 20261224;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  // ---------- buses ----------
  const master = ctx.createGain();
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -16;
  compressor.knee.value = 12;
  compressor.ratio.value = 3;
  compressor.attack.value = .006;
  compressor.release.value = .25;
  master.connect(compressor).connect(ctx.destination);
  master.gain.setValueAtTime(1, 0);
  master.gain.setValueAtTime(1, duration - 1.2);
  master.gain.linearRampToValueAtTime(0, duration - .05);

  const reverb = ctx.createConvolver();
  const impulse = ctx.createBuffer(2, RATE * 3, RATE);
  for (let c = 0; c < 2; c++) {
    const data = impulse.getChannelData(c);
    for (let i = 0; i < data.length; i++) data[i] = (rand() * 2 - 1) * (1 - i / data.length) ** 3.4;
  }
  reverb.buffer = impulse;
  const wet = ctx.createGain();
  wet.gain.value = .3;
  reverb.connect(wet).connect(master);

  const bus = (level: number, send: number) => {
    const gain = ctx.createGain();
    gain.gain.value = level;
    gain.connect(master);
    const sendGain = ctx.createGain();
    sendGain.gain.value = send;
    gain.connect(sendGain).connect(reverb);
    return gain;
  };
  const music = bus(.9, .45);
  const drums = bus(.85, .12);
  const sfx = bus(.9, .4);

  const noise = ctx.createBuffer(1, RATE * 2, RATE);
  const noiseData = noise.getChannelData(0);
  for (let i = 0; i < noiseData.length; i++) noiseData[i] = rand() * 2 - 1;

  const panned = (destination: AudioNode, pan: number) => {
    if (!pan) return destination;
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    panner.connect(destination);
    return panner;
  };

  // ---------- voices ----------
  /** Music-box tine: bright strike, slightly inharmonic overtones, long sine tail. */
  function tine(time: number, note: number, level: number, out: AudioNode = music, sustain = 1, pan = 0) {
    const destination = panned(out, pan);
    for (const [ratio, gain, decay] of [[1, 1, 1.8], [2.01, .24, .6], [4.18, .1, .22], [6.9, .05, .1]]) {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.frequency.value = hz(note) * ratio;
      env.gain.setValueAtTime(0, time);
      env.gain.linearRampToValueAtTime(level * gain, time + .004);
      env.gain.exponentialRampToValueAtTime(.0001, time + decay * sustain);
      osc.connect(env).connect(destination);
      osc.start(time);
      osc.stop(time + decay * sustain + .05);
    }
  }

  function pad(time: number, length: number, chord: string, level: number, cutoff = 1100) {
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    filter.Q.value = .4;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(level, time + Math.min(1, length * .3));
    env.gain.setValueAtTime(level, time + length - .25);
    env.gain.linearRampToValueAtTime(0, time + length + .9);
    filter.connect(env).connect(music);
    for (const name of CHORDS[chord]) {
      for (const detune of [-8, 7]) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = hz(midi(name));
        osc.detune.value = detune;
        const voice = ctx.createGain();
        voice.gain.value = .16;
        osc.connect(voice).connect(filter);
        osc.start(time);
        osc.stop(time + length + 1);
      }
    }
  }

  function bass(time: number, note: number, length: number, level: number) {
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(level, time + .012);
    env.gain.exponentialRampToValueAtTime(level * .55, time + .25);
    env.gain.setValueAtTime(level * .55, time + length - .06);
    env.gain.linearRampToValueAtTime(0, time + length);
    filter.connect(env).connect(music);
    for (const [type, ratio, gain] of [['sine', 1, 1], ['triangle', 2, .35]] as const) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = hz(note) * ratio;
      const g = ctx.createGain();
      g.gain.value = gain;
      osc.connect(g).connect(filter);
      osc.start(time);
      osc.stop(time + length + .05);
    }
  }

  function noiseHit(time: number, length: number, type: BiquadFilterType, from: number, to: number, level: number, out: AudioNode, attack = .002, q = .8, pan = 0) {
    const source = ctx.createBufferSource();
    source.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(from, time);
    filter.frequency.exponentialRampToValueAtTime(to, time + length);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(level, time + attack);
    env.gain.exponentialRampToValueAtTime(.0001, time + length);
    source.connect(filter).connect(env).connect(panned(out, pan));
    source.start(time, rand() * 1.5);
    source.stop(time + length + .05);
  }

  function sine(time: number, from: number, to: number, length: number, level: number, out: AudioNode, sweep = length) {
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(from, time);
    osc.frequency.exponentialRampToValueAtTime(to, time + sweep);
    const env = ctx.createGain();
    env.gain.setValueAtTime(level, time);
    env.gain.exponentialRampToValueAtTime(.0001, time + length);
    osc.connect(env).connect(out);
    osc.start(time);
    osc.stop(time + length + .05);
  }

  const kick = (time: number, level = .7) => { sine(time, 150, 44, .38, level, drums, .11); noiseHit(time, .02, 'highpass', 3000, 2000, level * .15, drums); };
  const snare = (time: number, level = .3) => { noiseHit(time, .17, 'bandpass', 1900, 1500, level, drums, .002, .7); sine(time, 200, 160, .08, level * .5, drums); };
  const hat = (time: number, level = .06) => noiseHit(time, .045, 'highpass', 7500, 7000, level, drums, .001, .7, .25);
  const sleigh = (time: number, level = .05) => noiseHit(time, .09, 'bandpass', 9000, 8500, level, drums, .003, 1.8, -.3);
  const crash = (time: number, level = .22) => noiseHit(time, 2.4, 'highpass', 5000, 3500, level, sfx, .004, .5);
  const boom = (time: number, level = .6) => sine(time, 62, 34, 1.8, level, sfx, 1.2);
  const keyClick = (time: number, level = .16) => {
    noiseHit(time, .028, 'bandpass', 2600 + rand() * 1800, 2400, level * (.8 + rand() * .4), sfx, .001, 1.4, (rand() - .5) * .3);
    sine(time, 140, 90, .03, level * .5, sfx);
  };
  const uiClick = (time: number, level = .18) => { noiseHit(time, .02, 'highpass', 3500, 3000, level, sfx, .001); sine(time, 1300, 900, .035, level * .4, sfx); };
  const whoosh = (time: number, length: number, rising: boolean, level = .16) => {
    const source = ctx.createBufferSource();
    source.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.1;
    filter.frequency.setValueAtTime(rising ? 300 : 2600, time);
    filter.frequency.exponentialRampToValueAtTime(rising ? 2800 : 280, time + length);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(level, time + length * .65);
    env.gain.linearRampToValueAtTime(0, time + length);
    const pan = ctx.createStereoPanner();
    pan.pan.setValueAtTime(-.5, time);
    pan.pan.linearRampToValueAtTime(.5, time + length);
    source.connect(filter).connect(env).connect(pan).connect(sfx);
    source.start(time, rand());
    source.stop(time + length + .05);
  };
  const riser = (from: number, to: number, level = .14) => {
    const source = ctx.createBufferSource();
    source.buffer = noise;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(300, from);
    filter.frequency.exponentialRampToValueAtTime(7000, to);
    const env = ctx.createGain();
    env.gain.setValueAtTime(.0001, from);
    env.gain.exponentialRampToValueAtTime(level, to - .02);
    env.gain.linearRampToValueAtTime(0, to + .02);
    source.connect(filter).connect(env).connect(sfx);
    source.start(from);
    source.stop(to + .05);
  };
  const bell = (time: number, base: number, level: number) => {
    for (const [ratio, gain, decay] of [[.5, .35, 4], [1, .5, 3.2], [1.19, .22, 2.2], [1.5, .16, 2], [2, .2, 1.6], [2.74, .1, 1], [4.07, .06, .6]]) {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.frequency.value = base * ratio * (1 + (rand() - .5) * .002);
      env.gain.setValueAtTime(0, time);
      env.gain.linearRampToValueAtTime(gain * level, time + .006);
      env.gain.exponentialRampToValueAtTime(.0001, time + decay);
      osc.connect(env).connect(sfx);
      osc.start(time);
      osc.stop(time + decay + .1);
    }
  };
  const SPARKLE = [84, 86, 88, 91, 93, 96, 98, 100];
  const sparkle = (time: number, count: number, level = .1) => {
    let at = time;
    for (let i = 0; i < count; i++) {
      tine(at, SPARKLE[Math.floor(rand() * SPARKLE.length)], level, sfx, .5, (rand() - .5) * .8);
      at += .06 + rand() * .05;
    }
  };

  const render = async (peak: number) => encodeWav(await ctx.startRendering(), peak);
  return { ctx, rand, music, drums, sfx, tine, pad, bass, noiseHit, sine, kick, snare, hat, sleigh, crash, boom, keyClick, uiClick, whoosh, riser, bell, sparkle, render };
}

export async function renderAudio(mix: 'full' | 'effects', cues: AudioCues): Promise<string> {
  const withMusic = mix === 'full';
  const { music, sfx, tine, pad, bass, noiseHit, sine, kick, snare, hat, sleigh, crash, boom, keyClick, uiClick, whoosh, riser, bell, sparkle, render } = createEngine(cues.duration);
  // ---------- sound effects (in both mixes) ----------
  cues.typing.forEach(at => keyClick(at));
  keyClick(cues.send, .2);
  sine(cues.send, 520, 880, .12, .12, sfx, .06);
  cues.reply.forEach((at, i) => { if (i % 2 === 0) keyClick(at, .06); });
  cues.steps.forEach((at, i) => tine(at, [91, 93, 95, 96][i], .12, sfx, .6));
  bell(cues.ignite, 523.25, .5);
  sparkle(cues.ignite + .6, 7, .09);
  boom(cues.drop, .55);
  crash(cues.drop, .2);
  bell(cues.drop, 1046.5, .22);
  sparkle(cues.drop + .05, 9, .1);
  const g = cues.giftOpen;
  noiseHit(g + 1.76, .5, 'bandpass', 700, 3200, .2, sfx, .15, 1.2);
  sine(g + 2.38, 190, 70, .16, .4, sfx, .12);
  noiseHit(g + 2.38, .08, 'highpass', 2500, 4000, .1, sfx);
  sparkle(g + 2.68, 6, .1);
  sparkle(g + 4.38, 4, .09);
  cues.clicks.forEach(at => uiClick(at));
  cues.themes.forEach(at => sparkle(at, 3, .08));
  cues.wishType.forEach(at => keyClick(at, .1));
  whoosh(cues.wishLand - 1.75, 1.75, true, .08);
  [84, 88, 91, 96].forEach((note, i) => tine(cues.wishLand + i * .09, note, .16, sfx, .7));
  whoosh(cues.magic, 2.6, true, .16);
  sparkle(cues.magic + .8, 9, .08);
  uiClick(cues.phoneTap, .16);
  bell(cues.phoneTap + .05, 659.25, .28);
  [72, 76, 79, 84, 88, 91, 96].forEach((note, i) => tine(cues.finale + i * .11, note, .14, sfx, 1.2));
  sparkle(cues.finale + 1, 12, .08);
  cues.whooshes.forEach(at => whoosh(at - .25, .55, true, .11));
  cues.endTyping.forEach(at => keyClick(at, .12));
  const END = cues.drop + 36;
  crash(END, .16);
  boom(END, .35);
  bell(END, 523.25, .32);

  // ---------- music ----------
  if (withMusic) {
    const D = cues.drop;
    // intro: soft pad and a slow music-box arpeggio under the typing
    pad(.2, 4.8, 'Cmaj7', .05, 900);
    pad(4.9, 4.7, 'Am7', .05, 900);
    ['G5', 'B5', 'E6', 'D6', 'G5', 'B5', 'E6', 'C6', 'A5', 'C6', 'E6', 'G5', 'A5', 'C6', 'E6', 'D6'].forEach((note, i) => {
      const at = .6 + i * .6;
      if (at < 9.5) tine(at, midi(note), .085, music, 1.2, i % 2 ? .25 : -.25);
    });
    // build: arpeggios speed up, kicks like a heartbeat, noise riser into the drop
    pad(9.6, 2.8, 'Fmaj7', .065, 1300);
    pad(12.4, 1.75, 'G', .08, 1900);
    const fArp = ['F5', 'A5', 'C6', 'E6'], gArp = ['G5', 'B5', 'D6', 'G6'];
    for (let i = 0; i < 11; i++) tine(9.6 + i * .25, midi(fArp[i % 4]) + (i >= 8 ? 12 : 0), .07 + i * .004, music, .8, i % 2 ? .3 : -.3);
    for (let i = 0; i < 14; i++) tine(12.4 + i * .125, midi(gArp[i % 4]) + (i >= 8 ? 12 : 0), .08 + i * .004, music, .6, i % 2 ? .3 : -.3);
    for (let at = 12.4; at < 13.4; at += .5) kick(at, .35);
    for (let at = 13.4; at < 14.2; at += .25) kick(at, .38 + (at - 13.4) * .2);
    riser(11.4, D - .05, .13);

    // main sections on the bar grid
    const melodyA = phrase('E5 E5 E5:2 E5 E5 E5:2 E5 G5 C5:1.5 D5:.5 E5:4 F5 F5 F5:1.5 F5:.5 F5 E5 E5 E5:.5 E5:.5 E5 D5 D5 E5 D5:2 G5:2 E5 E5 E5:2 E5 E5 E5:2');
    const melodyB = phrase('F5 F5 F5:1.5 F5:.5 F5 E5 E5 E5:.5 E5:.5 G5 G5 F5 D5 C5:4');
    const tag = phrase('E5 D5 D5 E5 D5:2 G5:2');
    const playMelody = (start: number, notes: [number, number, number][], level: number) => {
      for (const [beat, note] of notes) {
        tine(start + beat * BEAT, note, level, music, 1, -.08);
        tine(start + beat * BEAT, note + 12, level * .3, music, .7, .3);
      }
    };
    const groove = (start: number, bars: number, chords: string[], full = true) => {
      for (let bar = 0; bar < bars; bar++) {
        const t0 = start + bar * 2, chord = chords[bar];
        pad(t0, 2, chord, .042, 1500);
        const root = midi(ROOTS[chord]);
        bass(t0, root, .95, .42);
        bass(t0 + 1, root + 7, .45, .32);
        bass(t0 + 1.5, root + 12, .45, .28);
        for (let beat = 0; beat < 4; beat++) {
          const at = t0 + beat * BEAT;
          if (beat % 2 === 0) kick(at, .62);
          else snare(at, full ? .26 : .18);
          hat(at + BEAT / 2, .06);
          sleigh(at, .045);
          sleigh(at + BEAT / 2, .03);
        }
      }
    };
    playMelody(D, melodyA, .2);
    groove(D, 10, ['C', 'C', 'C', 'C', 'F', 'C', 'D7', 'G7', 'C', 'C']);
    // magic break: drums out, airy pad, slow high phrase
    const breakAt = D + 20;
    pad(breakAt, 2, 'Am7', .055, 1000);
    pad(breakAt + 2, 2, 'Fmaj7', .06, 1200);
    bass(breakAt, midi('A1'), 1.9, .25);
    bass(breakAt + 2, midi('F1'), 1.9, .25);
    playMelody(breakAt, phrase('E6:2 G6:2 C6:1.5 D6:.5 E6:4'), .14);
    riser(breakAt + 2.8, breakAt + 3.95, .11);
    for (let at = breakAt + 3; at < breakAt + 4; at += .25) kick(at, .3 + (at - breakAt - 3) * .25);
    // return: last phrase resolves home
    const returnAt = D + 24;
    crash(returnAt, .14);
    playMelody(returnAt, melodyB, .2);
    groove(returnAt, 4, ['F', 'C', 'G7', 'C']);
    for (let i = 0; i < 4; i++) snare(returnAt + 7 + i * .25, .14 + i * .05);
    // finale: tag phrase with a lift, then the home chord
    const finaleAt = D + 32;
    crash(finaleAt, .14);
    playMelody(finaleAt, tag, .21);
    groove(finaleAt, 2, ['F', 'G7']);
    for (let i = 0; i < 8; i++) snare(finaleAt + 3 + i * .125, .1 + i * .025);
    pad(END, 3.6, 'C', .07, 1400);
    bass(END, midi('C2'), 3, .4);
    ['C5', 'E5', 'G5', 'C6', 'E6', 'G6', 'C7'].forEach((note, i) => tine(END + i * .08, midi(note), .16, music, 1.6, (i / 6 - .5) * .8));
    kick(END, .6);
  }

  return render(withMusic ? .89 : .7);
}

/** 16-bit PCM WAV, peak-normalised, returned as base64 for the DevTools bridge. */
function encodeWav(buffer: AudioBuffer, peak: number): string {
  const channels = [buffer.getChannelData(0), buffer.getChannelData(1)];
  let max = 1e-6;
  for (const data of channels) for (let i = 0; i < data.length; i++) max = Math.max(max, Math.abs(data[i]));
  const gain = peak / max;
  const frames = buffer.length;
  const bytes = new DataView(new ArrayBuffer(44 + frames * 4));
  const text = (offset: number, value: string) => { for (let i = 0; i < value.length; i++) bytes.setUint8(offset + i, value.charCodeAt(i)); };
  text(0, 'RIFF'); bytes.setUint32(4, 36 + frames * 4, true); text(8, 'WAVE');
  text(12, 'fmt '); bytes.setUint32(16, 16, true); bytes.setUint16(20, 1, true); bytes.setUint16(22, 2, true);
  bytes.setUint32(24, RATE, true); bytes.setUint32(28, RATE * 4, true); bytes.setUint16(32, 4, true); bytes.setUint16(34, 16, true);
  text(36, 'data'); bytes.setUint32(40, frames * 4, true);
  let offset = 44;
  for (let i = 0; i < frames; i++) {
    for (const data of channels) {
      bytes.setInt16(offset, Math.max(-1, Math.min(1, data[i] * gain)) * 32767, true);
      offset += 2;
    }
  }
  const raw = new Uint8Array(bytes.buffer);
  let binary = '';
  for (let i = 0; i < raw.length; i += 0x8000) binary += String.fromCharCode(...raw.subarray(i, i + 0x8000));
  return btoa(binary);
}

// ---------- wordless film score: calm, builds into "Silent Night" when the star lights ----------
export interface FilmCues {
  duration: number;
  typing: number[];
  send: number;
  reply: number[];
  tool: number;
  scroll: number;
  paper: number;
  drawing: number;
  night: number;
  converge: number;
  ignite: number;
  flare: number;
  giftOpen: number;
  cuts: number[];
  finale: number;
}

export async function renderFilmAudio(mix: 'full' | 'effects', cues: FilmCues): Promise<string> {
  const withMusic = mix === 'full';
  const { music, sfx, tine, pad, bass, noiseHit, sine, kick, sleigh, crash, boom, keyClick, uiClick, whoosh, riser, bell, sparkle, render } = createEngine(cues.duration);
  const beat = 60 / 92;

  // effects
  cues.typing.forEach(at => keyClick(at, .1));
  uiClick(cues.send, .2);
  cues.reply.forEach((at, i) => { if (i % 3 === 0) keyClick(at, .05); });
  tine(cues.tool, 91, .1, sfx, .6);
  whoosh(cues.scroll + .6, 2.6, true, .09);
  whoosh(cues.paper - .2, .9, false, .08);
  whoosh(cues.drawing - .3, .8, true, .07);
  whoosh(cues.night - .2, 1.2, false, .09);
  sparkle(cues.converge + .3, 6, .07);
  sparkle(cues.converge + 1.6, 6, .07);
  bell(cues.ignite, 523.25, .42);
  sparkle(cues.ignite + .6, 7, .08);
  boom(cues.flare, .42);
  crash(cues.flare, .12);
  bell(cues.flare, 1046.5, .16);
  const g = cues.giftOpen;
  noiseHit(g + 1.76, .5, 'bandpass', 700, 3200, .18, sfx, .15, 1.2);
  sine(g + 2.38, 190, 70, .16, .36, sfx, .12);
  sparkle(g + 2.68, 6, .09);
  sparkle(g + 4.38, 4, .08);
  cues.cuts.forEach(at => whoosh(at - .3, .6, true, .06));
  [72, 76, 79, 84, 88, 91, 96].forEach((note, i) => tine(cues.finale + i * .11, note, .1, sfx, 1.2));
  sparkle(cues.finale + 1.2, 10, .06);

  if (withMusic) {
    // the prompt: soft pad and a few far-apart notes
    pad(.3, cues.send - .3, 'Cmaj7', .045, 850);
    [[1.2, 'E5'], [2.5, 'G5'], [3.8, 'B5'], [5.1, 'D6'], [6.4, 'C6']].forEach(([at, note]) => tine(at as number, midi(note as string), .07, music, 1.4, .2));
    // the plan: harmony moves, gentle pulse starts
    pad(cues.send, cues.paper - cues.send, 'Am7', .05, 950);
    for (let at = cues.scroll, i = 0; at < cues.paper; at += beat / 2, i++) tine(at, midi(['A5', 'C6', 'E6', 'G6'][i % 4]), .05 + .03 * i / 12, music, .6, i % 2 ? .3 : -.3);
    // paper: steady music-box arpeggios over F and G
    pad(cues.paper, cues.drawing - cues.paper, 'Fmaj7', .05, 1100);
    pad(cues.drawing, cues.night - cues.drawing, 'G', .05, 1200);
    bass(cues.paper, midi('F1'), cues.drawing - cues.paper, .22);
    bass(cues.drawing, midi('G1'), cues.night - cues.drawing, .22);
    for (let at = cues.paper, i = 0; at < cues.night - .2; at += beat / 2, i++) {
      const chord = at < cues.drawing ? ['F5', 'A5', 'C6', 'E6'] : ['G5', 'B5', 'D6', 'G6'];
      tine(at, midi(chord[i % 4]) + (i % 8 >= 4 ? 12 : 0), .075, music, .7, i % 2 ? .3 : -.3);
    }
    // night: low and quiet while the tree gathers, then rise into the star
    pad(cues.night, cues.flare - cues.night, 'Am7', .045, 700);
    bass(cues.night, midi('A1'), cues.ignite - cues.night, .2);
    bass(cues.ignite, midi('G1'), cues.flare - cues.ignite - .1, .24);
    riser(cues.flare - 2.6, cues.flare - .04, .1);
    for (let at = cues.flare - 2; at < cues.flare - .1; at += beat / 2) kick(at, .18 + (at - cues.flare + 2) * .1);
    // the star lights: "Silent Night" on music box, warm pad, soft bass and sleigh bells
    const melody = phrase('G5:1.5 A5:.5 G5 E5:3 G5:1.5 A5:.5 G5 E5:3 D6:2 D6 B5:3 C6:2 C6 G5:3');
    for (const [b, note] of melody) {
      tine(cues.flare + b * beat, note, .19, music, 1.3, -.06);
      tine(cues.flare + b * beat, note + 12, .05, music, .8, .3);
    }
    const chords = ['C', 'C', 'C', 'C', 'G', 'G', 'C', 'C'];
    chords.forEach((chord, bar) => {
      const at = cues.flare + bar * 3 * beat;
      pad(at, 3 * beat, chord, .045, 1300);
      bass(at, midi(chord === 'G' ? 'G1' : 'C2'), 3 * beat * .95, .26);
      tine(at + beat, midi(chord === 'G' ? 'B4' : 'E4'), .05, music, .8);
      tine(at + 2 * beat, midi(chord === 'G' ? 'D5' : 'G4'), .05, music, .8);
      if (bar >= 2) for (let i = 0; i < 3; i++) sleigh(at + i * beat, .025);
    });
    pad(cues.flare + 24 * beat, 3, 'C', .05, 1200);
  }
  return render(withMusic ? .89 : .7);
}
