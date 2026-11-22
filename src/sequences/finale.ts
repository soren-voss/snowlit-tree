import { AdditiveBlending, BufferGeometry, Float32BufferAttribute, Points, ShaderMaterial, Vector3 } from 'three';
import type { Object3D } from 'three';
import { call, ease, parallel, sequence, tween, wait } from '../core/timeline';
import type { Clip } from '../core/timeline';
import type { LightsState } from '../scene/tree/illumination';

const TRAIL = 110;

/** A fading ribbon of sparks that follows the star while it flies. */
export function createStarTrail() {
  const positions = new Float32Array(TRAIL * 3);
  const fade = new Float32Array(TRAIL);
  for (let i = 0; i < TRAIL; i++) fade[i] = 1 - i / TRAIL;
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('fade', new Float32BufferAttribute(fade, 1));
  const points = new Points(geometry, new ShaderMaterial({
    uniforms: { ratio: { value: 1 }, strength: { value: 0 } },
    vertexShader: `
      uniform float ratio;
      attribute float fade;
      varying float vFade;
      void main() {
        vFade = fade;
        vec4 eye = modelViewMatrix * vec4(position, 1.);
        gl_Position = projectionMatrix * eye;
        gl_PointSize = clamp((4. + 14. * fade * fade) * ratio * 12. / max(1., -eye.z), 1., 24.);
      }`,
    fragmentShader: `
      uniform float strength;
      varying float vFade;
      void main() {
        float d = length(gl_PointCoord - .5) * 2.;
        gl_FragColor = vec4(vec3(1., .74, .38) * (1.5 + 2. * vFade), strength * vFade * vFade * exp(-d * d * 4.));
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, blending: AdditiveBlending,
  }));
  points.frustumCulled = false;
  points.visible = false;
  points.renderOrder = 6;
  const material = points.material;
  const spot = new Vector3();
  let filled = false;
  return {
    points,
    start(from: Vector3) {
      for (let i = 0; i < TRAIL; i++) positions.set([from.x, from.y, from.z], i * 3);
      filled = true;
      points.visible = true;
    },
    stop() { points.visible = false; filled = false; },
    setStrength(value: number) { material.uniforms.strength.value = value; },
    update(head: Object3D, ratio: number) {
      if (!filled) return;
      positions.copyWithin(3, 0, (TRAIL - 1) * 3);
      head.getWorldPosition(spot);
      positions.set([spot.x + (Math.random() - .5) * .05, spot.y + (Math.random() - .5) * .05, spot.z + (Math.random() - .5) * .05], 0);
      geometry.attributes.position.needsUpdate = true;
      material.uniforms.ratio.value = ratio;
    },
  };
}

/** The star leaves the top, circles the tree once and settles back, trailing sparks. */
export function starFlight(star: Object3D, home: Vector3, bearing: number, trail: ReturnType<typeof createStarTrail>, state: LightsState): Clip {
  return sequence(
    call(() => trail.start(home)),
    parallel(
      tween(6.4, value => {
        const lift = Math.sin(Math.PI * value);
        const angle = bearing + value * Math.PI * 2;
        const radius = 4.3 * lift ** .7;
        star.position.set(home.x + Math.sin(angle) * radius, home.y - (home.y - 3.4) * lift, home.z + Math.cos(angle) * radius);
      }, ease.smooth),
      tween(6.4, value => {
        trail.setStrength(Math.min(1, value * 8) * (1 - ease.smooth(Math.max(0, value - .85) / .15)));
        state.flare = .35 * Math.sin(Math.PI * value);
      }),
    ),
    call(() => { star.position.copy(home); state.flare = 0; }),
    wait(.8),
    call(() => trail.stop()),
  );
}
