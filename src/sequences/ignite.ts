import { call, ease, parallel, sequence, Timeline, tween, wait } from '../core/timeline';
import type { SceneCamera } from '../core/camera';
import type { LightsState } from '../scene/tree/illumination';

export function finishLighting(state: LightsState): void {
  Object.assign(state, { bulbs: 1, ribbon: 1, ground: 1, star: 1, flare: 0 });
}

export function igniteSequence(state: LightsState, camera: SceneCamera, complete: () => void): Timeline {
  return new Timeline(sequence(
    parallel(
      tween(6, value => camera.setIntro(value), ease.smooth),
      sequence(wait(.12), tween(3.12, value => { state.bulbs = value; })),
      sequence(wait(.47), tween(2.86, value => { state.ribbon = value; })),
      sequence(wait(.18), tween(3.85, value => { state.ground = value; }, ease.smooth)),
      sequence(
        wait(3.35),
        tween(.63, value => { state.star = value; state.flare = value * .94; }, ease.outCubic),
        tween(1.92, value => { state.flare = (1 - value) * .94; }, ease.outCubic),
      ),
    ),
    call(() => {
      finishLighting(state);
      complete();
    }),
  ));
}
