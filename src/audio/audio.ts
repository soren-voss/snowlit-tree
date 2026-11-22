import type { MusicId } from '../data/gifts';
import { readSetting, writeSetting } from '../data/store';

/**
 * Everything is synthesized with WebAudio: a music-box voice playing public-domain carols, plus bell / ribbon /
 * lid / sparkle effects. No recordings are shipped, so there is nothing to license.
 */
type Song = { bpm: number; beats: number; melody: string; chords: string };

const SONGS: Record<Exclude<MusicId, 'upload' | 'off'>, Song> = {
  'silent-night': {
    bpm: 88, beats: 3,
    melody: 'G5:1.5 A5:.5 G5 E5:3 G5:1.5 A5:.5 G5 E5:3 D6:2 D6 B5:3 C6:2 C6 G5:3 A5:2 A5 C6:1.5 B5:.5 A5 G5:1.5 A5:.5 G5 E5:3 '
      + 'A5:2 A5 C6:1.5 B5:.5 A5 G5:1.5 A5:.5 G5 E5:3 D6:2 D6 F6:1.5 D6:.5 B5 C6:3 E6:3 C6 G5 E5 G5:1.5 F5:.5 D5 C5:6 R:3',
    chords: 'C C C C G G C C F F C C F F C C G G C C C G C C -',
  },
  'jingle-bells': {
    bpm: 112, beats: 4,
    melody: 'E5 E5 E5:2 E5 E5 E5:2 E5 G5 C5:1.5 D5:.5 E5:4 F5 F5 F5:1.5 F5:.5 F5 E5 E5 E5:.5 E5:.5 E5 D5 D5 E5 D5:2 G5:2 '
      + 'E5 E5 E5:2 E5 E5 E5:2 E5 G5 C5:1.5 D5:.5 E5:4 F5 F5 F5:1.5 F5:.5 F5 E5 E5 E5:.5 E5:.5 G5 G5 F5 D5 C5:4 R:4',
    chords: 'C C C C F C D G C C C C F C G C -',
  },
  'merry-christmas': {
    bpm: 120, beats: 3,
    melody: 'R:2 D5 G5 G5:.5 A5:.5 G5:.5 F#5:.5 E5 E5 E5 A5 A5:.5 B5:.5 A5:.5 G5:.5 F#5 D5 D5 '
      + 'B5 B5:.5 C6:.5 B5:.5 A5:.5 G5 E5 D5:.5 D5:.5 E5 A5 F#5 G5:3 R:3',
    chords: '- G C A D B E D G -',
  },
};

const NOTE_INDEX: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function midi(name: string): number {
  const match = /^([A-G])(#?)(\d)$/.exec(name)!;
  return 12 * (Number(match[3]) + 1) + NOTE_INDEX[match[1]] + (match[2] ? 1 : 0);
}

/** Returns [time in beats, midi note or -1 for a rest, length in beats] for the melody and an arpeggiated bass. */
function score(song: Song): { notes: [number, number, number][]; length: number } {
  const notes: [number, number, number][] = [];
  let beat = 0;
  for (const token of song.melody.trim().split(/\s+/)) {
    const [name, length] = token.split(':');
    const beats = length ? Number(length) : 1;
    if (name !== 'R') notes.push([beat, midi(name), beats]);
    beat += beats;
  }
  const pattern = song.beats === 3 ? [0, 7, 12] : [0, 7, 12, 7];
  song.chords.split(' ').forEach((chord, measure) => {
    if (chord === '-') return;
    const root = midi(`${chord}3`);
    pattern.forEach((step, i) => notes.push([measure * song.beats + i, -(root + step) - 1, 1]));
  });
  return { notes, length: beat };
}

const frequency = (note: number) => 440 * 2 ** ((note - 69) / 12);

export class AudioDirector {
  muted = readSetting('muted', false);
  private ctx?: AudioContext;
  private master?: GainNode;
  private music?: GainNode;
  private effects?: GainNode;
  private reverb?: ConvolverNode;
  private noise?: AudioBuffer;
  private track: MusicId = 'off';
  private playing = false;
  private schedule?: ReturnType<typeof setInterval>;
  private nextIndex = 0;
  private loopStart = 0;
  private current?: { notes: [number, number, number][]; length: number; bpm: number };
  private readonly element = new Audio();
  private uploadedUrl?: string;

  constructor() {
    this.element.loop = true;
    this.element.muted = this.muted;
    this.element.volume = .55;
    const unlock = () => this.unlock();
    for (const type of ['pointerdown', 'keydown', 'touchend']) document.addEventListener(type, unlock, { capture: true, passive: true });
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) {
        void this.ctx.suspend();
        this.element.pause();
      } else {
        void this.ctx.resume();
        if (this.playing && this.track === 'upload') void this.element.play().catch(() => {});
      }
    });
  }

  get ready(): boolean {
    return this.ctx?.state === 'running';
  }

  /** Must run inside a user gesture the first time (browser autoplay rules). */
  unlock(): void {
    if (!this.ctx) {
      const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Context) return;
      const ctx = this.ctx = new Context();
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 1;
      this.master.connect(ctx.destination);
      this.reverb = ctx.createConvolver();
      this.reverb.buffer = this.impulse(2.6);
      const wet = ctx.createGain();
      wet.gain.value = .32;
      this.reverb.connect(wet).connect(this.master);
      this.music = ctx.createGain();
      this.music.gain.value = .3;
      this.effects = ctx.createGain();
      this.effects.gain.value = .62;
      for (const bus of [this.music, this.effects]) {
        bus.connect(this.master);
        bus.connect(this.reverb);
      }
      this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state !== 'running') void this.ctx.resume();
    if (!this.playing) return;
    if (this.track === 'upload' && this.element.paused) void this.element.play().catch(() => {});
    else if (this.track !== 'upload' && this.track !== 'off' && !this.schedule) this.play();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    writeSetting('muted', muted);
    this.element.muted = muted;
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, .05);
  }

  setUploadedMusic(url: string | undefined): void {
    this.uploadedUrl = url;
    if (this.track === 'upload') this.setTrack('upload');
  }

  /** Selects the background track; it only sounds once play() has been called. */
  setTrack(track: MusicId): void {
    const wasPlaying = this.playing;
    this.stopMusic();
    this.track = track;
    if (wasPlaying) this.play();
  }

  play(): void {
    this.playing = true;
    if (this.track === 'off') return;
    if (this.track === 'upload') {
      if (!this.uploadedUrl) return;
      if (this.element.src !== this.uploadedUrl) this.element.src = this.uploadedUrl;
      void this.element.play().catch(() => {});
      return;
    }
    if (!this.ctx) return;
    const song = SONGS[this.track];
    this.current = { ...score(song), bpm: song.bpm };
    this.current.notes.sort((a, b) => a[0] - b[0]);
    this.loopStart = this.ctx.currentTime + .15;
    this.nextIndex = 0;
    clearInterval(this.schedule);
    this.schedule = setInterval(() => this.pump(), 60);
    this.pump();
  }

  private stopMusic(): void {
    clearInterval(this.schedule);
    this.schedule = undefined;
    this.current = undefined;
    this.element.pause();
    this.playing = false;
  }

  private pump(): void {
    const ctx = this.ctx, song = this.current;
    if (!ctx || !song || ctx.state !== 'running') return;
    const beat = 60 / song.bpm;
    const horizon = ctx.currentTime + .3;
    for (;;) {
      if (this.nextIndex >= song.notes.length) {
        this.nextIndex = 0;
        this.loopStart += song.length * beat;
      }
      const [at, note] = song.notes[this.nextIndex];
      const time = this.loopStart + at * beat;
      if (time > horizon) break;
      if (time >= ctx.currentTime - .05) {
        if (note >= 0) this.tine(time, note, .5, this.music!);
        else this.tine(time, -note - 1, .16, this.music!, .8);
      }
      this.nextIndex++;
    }
  }

  private impulse(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const buffer = ctx.createBuffer(2, Math.round(ctx.sampleRate * seconds), ctx.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 3.2;
    }
    return buffer;
  }

  /** A struck steel tine: bright attack, slightly inharmonic overtones, long sine tail. */
  private tine(time: number, note: number, level: number, bus: AudioNode, sustain = 1): void {
    const ctx = this.ctx!;
    const base = frequency(note);
    for (const [ratio, gain, decay] of [[1, 1, 1.7], [2.01, .22, .6], [4.18, .1, .22], [6.9, .05, .1]]) {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.frequency.value = base * ratio;
      env.gain.setValueAtTime(0, time);
      env.gain.linearRampToValueAtTime(level * gain, time + .004);
      env.gain.exponentialRampToValueAtTime(.0001, time + decay * sustain);
      osc.connect(env).connect(bus);
      osc.start(time);
      osc.stop(time + decay * sustain + .05);
    }
  }

  private noiseBurst(time: number, seconds: number, filter: BiquadFilterType, from: number, to: number, level: number): void {
    const ctx = this.ctx!;
    const source = ctx.createBufferSource();
    source.buffer = this.noise!;
    const band = ctx.createBiquadFilter();
    band.type = filter;
    band.Q.value = 1.2;
    band.frequency.setValueAtTime(from, time);
    band.frequency.exponentialRampToValueAtTime(to, time + seconds);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(level, time + seconds * .3);
    env.gain.exponentialRampToValueAtTime(.0001, time + seconds);
    source.connect(band).connect(env).connect(this.effects!);
    source.start(time, Math.random());
    source.stop(time + seconds + .05);
  }

  private get now(): number | undefined {
    return this.ctx && this.ctx.state !== 'closed' ? this.ctx.currentTime : undefined;
  }

  /** The ignition bell: a low hum with a bright, slowly beating strike. */
  bell(): void {
    const time = this.now;
    if (time === undefined) return;
    const ctx = this.ctx!;
    const base = 523.25;
    for (const [ratio, gain, decay] of [[.5, .35, 4], [1, .5, 3.2], [1.19, .22, 2.2], [1.5, .16, 2], [2, .2, 1.6], [2.74, .1, 1], [4.07, .06, .6]]) {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.frequency.value = base * ratio * (1 + (Math.random() - .5) * .002);
      env.gain.setValueAtTime(0, time);
      env.gain.linearRampToValueAtTime(gain * .5, time + .006);
      env.gain.exponentialRampToValueAtTime(.0001, time + decay);
      osc.connect(env).connect(this.effects!);
      osc.start(time);
      osc.stop(time + decay + .1);
    }
    this.sparkle(.6, 7);
  }

  sparkle(delay = 0, count = 5): void {
    const time = this.now;
    if (time === undefined) return;
    const scale = [84, 86, 88, 91, 93, 96, 98, 100];
    for (let i = 0; i < count; i++) {
      this.tine(time + delay + i * (.07 + Math.random() * .05), scale[Math.floor(Math.random() * scale.length)], .14, this.effects!, .5);
    }
  }

  ribbon(): void {
    const time = this.now;
    if (time !== undefined) this.noiseBurst(time, .5, 'bandpass', 700, 3200, .22);
  }

  lid(): void {
    const time = this.now;
    if (time === undefined) return;
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.frequency.setValueAtTime(190, time);
    osc.frequency.exponentialRampToValueAtTime(70, time + .12);
    env.gain.setValueAtTime(.5, time);
    env.gain.exponentialRampToValueAtTime(.0001, time + .16);
    osc.connect(env).connect(this.effects!);
    osc.start(time);
    osc.stop(time + .2);
    this.noiseBurst(time, .08, 'highpass', 2500, 4000, .12);
  }

  /** Wind swell for the particle form. */
  whoosh(rising: boolean): void {
    const time = this.now;
    if (time === undefined) return;
    this.noiseBurst(time, 2.6, 'bandpass', rising ? 250 : 2200, rising ? 2400 : 260, .2);
    this.sparkle(rising ? .8 : .2, 9);
  }

  /** A rising arpeggio when a wish lands on the tree. */
  wish(): void {
    const time = this.now;
    if (time === undefined) return;
    [84, 88, 91, 96].forEach((note, i) => this.tine(time + i * .09, note, .22, this.effects!, .7));
  }

  finale(): void {
    const time = this.now;
    if (time === undefined) return;
    [72, 76, 79, 84, 88, 91, 96].forEach((note, i) => this.tine(time + i * .11, note, .2, this.effects!, 1.2));
    this.sparkle(1, 12);
  }
}
