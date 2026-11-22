import {
  BackSide, BufferGeometry, Color, Float32BufferAttribute, Mesh, Points, ShaderMaterial, SphereGeometry, Vector3,
} from 'three';
import type { Random } from '../core/random';

const moonDirection = new Vector3(-0.25, 0.32, -0.91).normalize();

export function createSky(random: Random) {
  const sky = new Mesh(new SphereGeometry(115, 32, 20), new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    uniforms: {
      zenith: { value: new Color('#070D22') },
      horizon: { value: new Color('#1B2A4E') },
      moon: { value: moonDirection },
    },
    vertexShader: `
      varying vec3 skyDirection;
      void main() {
        skyDirection = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
      }
    `,
    fragmentShader: `
      varying vec3 skyDirection;
      uniform vec3 zenith, horizon, moon;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(85.3, 197.7))) * 4729.4); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3. - 2. * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + 1.), f.x), f.y);
      }
      void main() {
        vec3 dir = normalize(skyDirection);
        float elevation = max(0., dir.y);
        float angle = atan(dir.x, dir.z);
        float d = length(dir - moon);
        float gradient = smoothstep(0., .53, elevation);
        vec3 col = mix(horizon * .92, zenith * 1.4, gradient);
        float clouds = noise(vec2(angle * 8., dir.y * 44.)) * .63 + noise(vec2(angle * 17., dir.y * 88.)) * .37;
        col += vec3(.015, .028, .049) * smoothstep(.39, .81, clouds) * exp(-pow((dir.y - .075) * 4.5, 2.));
        col += vec3(.053,.105,.201) * exp(-d * 7.0);
        col += vec3(.19,.29,.44) * exp(-d * 22.);
        col += vec3(.75,.91,1.3) * exp(-d * 69.);
        vec2 surface = vec2(dir.x - moon.x, dir.y - moon.y) * 198.;
        float detail = noise(surface * 1.7) * .6 + noise(surface * 4.) * .4;
        float disc = 1. - smoothstep(.0215, .0235, d);
        col = mix(col, vec3(.82,1.05,1.25) * (1. + detail * .47), disc * .93);
        gl_FragColor = vec4(col, 1.);
        #include <colorspace_fragment>
      }
    `,
  }));
  sky.renderOrder = -10;
  sky.frustumCulled = false;

  const coords = [];
  const stars = [];
  for (let i = 0; i < 1000; i++) {
    const longitude = random() * Math.PI * 2;
    const y = 0.055 + 0.945 * random();
    const radial = Math.sqrt(1 - y * y);
    coords.push(Math.sin(longitude) * radial * 104, y * 104, Math.cos(longitude) * radial * 104);
    stars.push(random(), random(), random());
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(coords, 3));
  geometry.setAttribute('star', new Float32BufferAttribute(stars, 3));
  const material = new ShaderMaterial({
    uniforms: { time: { value: 0 }, pixelScale: { value: 1 }, moon: { value: moonDirection } },
    vertexShader: `
      uniform float time, pixelScale;
      uniform vec3 moon;
      attribute vec3 star;
      varying float intensity, tint;
      void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
        gl_PointSize = pixelScale * (.9 + pow(star.x, 6.) * 2.4);
        vec3 dir = normalize(position);
        intensity = smoothstep(.04, .3, dir.y) * smoothstep(.044, .18, length(dir - moon))
          * (.15 + .64 * pow(star.z, 2.)) * (.86 + .14 * sin(time * (.6 + star.x) + star.y * 63.));
        tint = star.y;
      }
    `,
    fragmentShader: `
      varying float intensity, tint;
      void main() {
        vec2 p = gl_PointCoord * 2. - 1.;
        float light = exp(-3.9 * dot(p, p)) * (1. - smoothstep(.72, 1., length(p)));
        gl_FragColor = vec4(mix(vec3(.49,.65,1.), vec3(.95,.79,.61), tint), light * intensity);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
  });
  const points = new Points(geometry, material);
  points.renderOrder = 1;
  return {
    objects: [sky, points],
    update(time: number, ratio: number) {
      material.uniforms.time.value = time;
      material.uniforms.pixelScale.value = ratio;
    },
  };
}
