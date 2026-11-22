import {
  AdditiveBlending, BufferGeometry, Float32BufferAttribute, Points, ShaderMaterial,
} from 'three';
import type { Random } from '../core/random';

function snowLayer(random: Random, count: number, near: boolean) {
  const extent = near ? 44 : 124;
  const height = near ? 17 : 42;
  const positions = [];
  const properties = [];
  for (let i = 0; i < count; i++) {
    positions.push((random() - 0.5) * extent, random() * height, (random() - 0.5) * extent);
    properties.push(random(), random(), random());
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('flake', new Float32BufferAttribute(properties, 3));
  const material = new ShaderMaterial({
    uniforms: { time: { value: 0 }, pixelScale: { value: 1 }, extent: { value: extent }, height: { value: height }, nearLayer: { value: near ? 1 : 0 } },
    vertexShader: `
      uniform float time, pixelScale, extent, height, nearLayer;
      attribute vec3 flake;
      varying float opacity, softness, slope;
      void main() {
        vec3 p = position;
        p.y = mod(p.y - time * mix(.45, 1.6, flake.y) * mix(.68, 1., nearLayer), height);
        p.x = mod(p.x + .34 * time + .56 * sin(time * .76 + 14. * flake.z) + extent * .5, extent) - extent * .5;
        p.z += .58 * sin(time * .41 + flake.z * 26.);
        vec4 view = modelViewMatrix * vec4(p, 1.);
        float depth = -view.z;
        float size = mix(1.1, 2.6, flake.x);
        float foreground = (1. - smoothstep(1.6, 11., depth)) * nearLayer;
        gl_Position = projectionMatrix * view;
        gl_PointSize = pixelScale * clamp(size * mix(2.1, 7.5, nearLayer) / max(1., depth) + foreground * (3. + 9. * flake.x), .7, 28.);
        opacity = smoothstep(.3, 2., depth) * smoothstep(0., .95, p.y) * (1. - smoothstep(height - 2., height, p.y))
          * (1. - smoothstep(extent * .37, extent * .5, abs(p.x)))
          * mix(.4, .16, foreground) * (.35 + .65 * flake.y) * (1. - smoothstep(31., 83., depth));
        softness = foreground;
        slope = flake.z;
      }
    `,
    fragmentShader: `
      varying float opacity, softness, slope;
      void main() {
        vec2 p = gl_PointCoord * 2. - 1.;
        p.x += p.y * (.23 + .16 * slope);
        float radius = length(p * vec2(1.24, .83));
        float edge = (1. - smoothstep(mix(.20, .03, softness), .91, radius));
        gl_FragColor = vec4(.62, .78, 1., opacity * edge);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const points = new Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = near ? 5 : 4;
  return { points, geometry, material, count };
}

export function createSnow(random: Random) {
  const layers = [snowLayer(random, 3000, false), snowLayer(random, 820, true)];
  return {
    objects: layers.map(layer => layer.points),
    setDensity(fraction: number) {
      for (const layer of layers) layer.geometry.setDrawRange(0, Math.round(layer.count * fraction));
    },
    update(time: number, ratio: number, height: number) {
      for (const layer of layers) {
        layer.material.uniforms.time.value = time;
        layer.material.uniforms.pixelScale.value = ratio * Math.max(0.74, Math.min(1.65, height / 680));
      }
    },
  };
}
