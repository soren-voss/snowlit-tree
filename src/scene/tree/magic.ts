import { AdditiveBlending, BufferGeometry, Float32BufferAttribute, Points, ShaderMaterial, Vector3 } from 'three';
import type { Random } from '../../core/random';
import type { Theme } from '../theme';
import { TREE_TOP } from './shape';

const CENTER_Y = 3.9;
/** Galaxy angular speeds are whole multiples of this, so the clock can wrap every 90 s without any visible jump. */
const BASE_SPIN = Math.PI * 2 / 90;
/** Fraction of the form transition each particle spends in flight; also sets how far ahead the dissolve cut runs. */
export const FLIGHT = .35;

/**
 * The tree's "magic form": particles start on the foliage and spiral out into a tilted galaxy.
 * `form` 0 = tree, 1 = galaxy; low branches leave first, matching the height cut that hides the real tree.
 */
export function createMagic(random: Random, samples: readonly Vector3[], capacity: number) {
  const tree: number[] = [], galaxy: number[] = [], seed: number[] = [];
  const gauss = () => (random() + random() + random() - 1.5) / 1.5;
  for (let i = 0; i < capacity; i++) {
    const source = samples[Math.floor(random() * samples.length)];
    tree.push(source.x + gauss() * .07, source.y + gauss() * .07, source.z + gauss() * .07);
    let radius: number, angle: number, height: number;
    if (random() < .12) {
      radius = .15 + 1.25 * random() ** 1.5;
      angle = random() * Math.PI * 2;
      height = CENTER_Y + gauss() * .45 * (1.4 - radius / 1.4);
    } else {
      radius = 1 + 5.6 * random() ** .8;
      angle = Math.floor(random() * 3) * Math.PI * 2 / 3 + radius * .82 + gauss() * (.15 + .03 * radius) * (random() < .3 ? 2.6 : 1);
      height = CENTER_Y + gauss() * .1 * (1 + radius * .1);
    }
    const spin = radius < 2.5 ? 3 : radius < 4.5 ? 2 : 1;
    galaxy.push(radius, angle, height, spin * BASE_SPIN);
    seed.push(random(), random(), random(), random());
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(tree, 3));
  geometry.setAttribute('galaxy', new Float32BufferAttribute(galaxy, 4));
  geometry.setAttribute('seed', new Float32BufferAttribute(seed, 4));
  const uniforms = {
    form: { value: 0 }, clock: { value: 0 }, time: { value: 0 }, ratio: { value: 1 },
    colorA: { value: new Vector3() }, colorB: { value: new Vector3() }, colorC: { value: new Vector3() },
  };
  const material = new ShaderMaterial({
    uniforms,
    vertexShader: `
      uniform float form, clock, time, ratio;
      uniform vec3 colorA, colorB, colorC;
      attribute vec4 galaxy, seed;
      varying vec3 vColor;
      varying float vAlpha;
      const float TAU = 6.2831853;
      float wrapAngle(float a) { return a - TAU * floor((a + 3.14159265) / TAU); }
      void main() {
        float h = clamp(position.y / ${TREE_TOP.toFixed(2)}, 0., 1.);
        float k = clamp((form * ${(1 + FLIGHT).toFixed(2)} - h) / ${FLIGHT.toFixed(2)}, 0., 1.);
        float e = k * k * (3. - 2. * k);
        float r0 = length(position.xz);
        float a0 = atan(position.x, position.z);
        float delta = wrapAngle(galaxy.y - a0) + clock * galaxy.w + TAU * floor(1. + seed.x * 1.99);
        float a = a0 + delta * e;
        float arc = sin(e * 3.14159265);
        float r = mix(r0, galaxy.x, e) + arc * (.5 + seed.y * 1.2);
        float y = mix(position.y, galaxy.z, e) + arc * (1.6 * (1. - h) + .4 * seed.z);
        vec3 p = vec3(sin(a) * r, y - ${CENTER_Y.toFixed(2)}, cos(a) * r);
        float tilt = .36 * e;
        p = vec3(p.x, p.y * cos(tilt) - p.z * sin(tilt), p.y * sin(tilt) + p.z * cos(tilt));
        p.y += ${CENTER_Y.toFixed(2)};
        vec4 eye = modelViewMatrix * vec4(p, 1.);
        gl_Position = projectionMatrix * eye;
        float flare = 1. + 1.6 * arc;
        gl_PointSize = clamp((1. + 2.4 * seed.z * seed.z * seed.z + 2. * step(.93, seed.w)) * flare * ratio * 30. / max(1., -eye.z), 1., 11.);
        float twinkle = .6 + .4 * sin(time * (1.5 + 3. * seed.w) + seed.x * 80.);
        vColor = (seed.y < .66 ? colorA : seed.y < .9 ? colorB : colorC) * (.75 + 1.7 * arc + 1.4 * step(.93, seed.w)) * twinkle;
        vAlpha = smoothstep(0., .05, k) * (.25 + .75 * seed.w * seed.w);
      }`,
    fragmentShader: `
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - .5) * 2.;
        gl_FragColor = vec4(vColor, vAlpha * exp(-d * d * 4.) * (1. - smoothstep(.8, 1., d)));
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, blending: AdditiveBlending,
  });
  const points = new Points(geometry, material);
  points.frustumCulled = false;
  points.visible = false;
  points.renderOrder = 3;

  let target = 0;
  let speed = 0;
  return {
    points,
    get form() { return uniforms.form.value; },
    get target() { return target; },
    setTarget(value: 0 | 1) { target = value; },
    setDensity(count: number) { geometry.setDrawRange(0, Math.min(capacity, count)); },
    setTheme(theme: Theme) {
      uniforms.colorA.value.set(...theme.particles[0]);
      uniforms.colorB.value.set(...theme.particles[1]);
      uniforms.colorC.value.set(...theme.particles[2]);
    },
    /** Advances the form toward its target; returns the world height below which the real tree should be hidden. */
    update(time: number, delta: number, ratio: number): number {
      const form = uniforms.form;
      const step = delta / (target ? 3.6 : 3.0);
      form.value = target ? Math.min(1, form.value + step) : Math.max(0, form.value - step);
      if (form.value === 0) uniforms.clock.value = 0;
      speed = target && form.value > 0 ? Math.min(1, speed + delta * .8) : Math.max(0, speed - delta * 1.5);
      uniforms.clock.value += delta * speed;
      if (form.value === 1 && uniforms.clock.value >= 90) uniforms.clock.value -= 90;
      uniforms.time.value = time;
      uniforms.ratio.value = ratio;
      points.visible = form.value > 0;
      return form.value > 0 ? form.value * (1 + FLIGHT) * TREE_TOP - .05 : -10;
    },
  };
}
