export type Easing = (fraction: number) => number;

export const ease = {
  linear: (t: number) => t,
  smooth: (t: number) => t * t * (3 - 2 * t),
  outCubic: (t: number) => 1 - (1 - t) ** 3,
};

export interface Clip {
  readonly duration: number;
  start(): (elapsed: number) => void;
}

export function tween(duration: number, update: (fraction: number) => void, easing: Easing = ease.linear): Clip {
  return { duration, start: () => elapsed => update(easing(duration === 0 ? 1 : elapsed / duration)) };
}

export function call(callback: () => void): Clip {
  return { duration: 0, start: () => callback };
}

export function wait(duration: number): Clip {
  return tween(duration, () => {});
}

function combine(clips: Clip[], sequential: boolean): Clip {
  let duration = 0;
  const tracks = clips.map(clip => {
    const offset = sequential ? duration : 0;
    duration = Math.max(duration, offset + clip.duration);
    return { clip, offset };
  });
  return {
    duration,
    start() {
      const players = tracks.map(({ clip, offset }) => ({ clip, offset, apply: clip.start(), done: false }));
      return time => {
        for (const player of players) {
          if (player.done || time < player.offset) continue;
          const elapsed = Math.min(player.clip.duration, time - player.offset);
          player.apply(elapsed);
          player.done = elapsed === player.clip.duration;
        }
      };
    },
  };
}

export const sequence = (...clips: Clip[]) => combine(clips, true);
export const parallel = (...clips: Clip[]) => combine(clips, false);

export class Timeline {
  private elapsed = 0;
  private readonly apply: (time: number) => void;

  constructor(private readonly clip: Clip) {
    this.apply = clip.start();
    this.apply(0);
  }

  update(delta: number): boolean {
    this.elapsed = Math.min(this.elapsed + delta, this.clip.duration);
    this.apply(this.elapsed);
    return this.elapsed >= this.clip.duration;
  }
}
