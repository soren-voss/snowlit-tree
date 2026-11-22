const tiers = ['low', 'medium', 'high'] as const;
export type Quality = typeof tiers[number];

export const settings = {
  low:    { maxRatio: 0.9, ratioScale: 0.78, needles: 0.53, snow: 0.43, shadows: 0, bloomLevels: 4, grain: false, giftParticles: 36 },
  medium: { maxRatio: 1.25, ratioScale: 0.9, needles: 0.76, snow: 0.71, shadows: 1024, bloomLevels: 5, grain: true, giftParticles: 74 },
  high:   { maxRatio: 1.65, ratioScale: 1, needles: 1, snow: 1, shadows: 2048, bloomLevels: 6, grain: true, giftParticles: 120 },
} satisfies Record<Quality, object>;

export class QualityMonitor {
  quality: Quality;
  fps = 0;
  readonly forced: boolean;
  private sampleTime = 0;
  private readonly intervals: number[] = [];
  private slowTime = 0;
  private warmup = 5;

  constructor(requested: string | null) {
    const tier = tiers.find(value => value === requested);
    this.forced = tier !== undefined;
    const mobile = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 1 && innerWidth < 1000;
    this.quality = tier ?? (mobile || navigator.hardwareConcurrency < 6 ? 'medium' : 'high');
  }

  update(seconds: number): boolean {
    if (document.hidden || seconds <= 0 || seconds > .25 || !Number.isFinite(seconds)) {
      this.reset();
      return false;
    }
    this.intervals.push(seconds);
    this.sampleTime += seconds;
    while (this.sampleTime - this.intervals[0] >= 1.5) this.sampleTime -= this.intervals.shift()!;
    this.fps = this.sampleTime >= 1 ? Math.round(this.intervals.length / this.sampleTime) : 0;
    if (this.warmup > 0 || this.forced) {
      this.warmup = Math.max(0, this.warmup - seconds);
      return false;
    }
    const threshold = this.quality === 'high' ? 52 : 28;
    this.slowTime = this.fps > 0 && this.fps < threshold ? this.slowTime + seconds : 0;
    const index = tiers.indexOf(this.quality);
    if (this.slowTime < 4 || index === 0) return false;
    this.quality = tiers[index - 1];
    this.slowTime = 0;
    this.warmup = 2;
    return true;
  }

  reset(): void {
    this.sampleTime = this.slowTime = this.fps = 0;
    this.intervals.length = 0;
  }
}
