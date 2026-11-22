import {
  AdditiveBlending, BackSide, BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Mesh, Points, ShaderMaterial, SphereGeometry, Vector3,
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
  const meteors = meteorShower(random);
  return {
    objects: [sky, points, meteors.mesh],
    /** Starts a meteor shower in the part of the sky behind the tree, as seen from `bearing`. */
    shower(bearing: number) {
      meteors.mesh.rotation.y = bearing + Math.PI;
      meteors.uniforms.shower.value = 0;
      meteors.mesh.visible = true;
    },
    update(time: number, ratio: number, delta = 0) {
      material.uniforms.time.value = time;
      material.uniforms.pixelScale.value = ratio;
      if (meteors.mesh.visible) {
        meteors.uniforms.shower.value += delta;
        if (meteors.uniforms.shower.value > 11.5) meteors.mesh.visible = false;
      }
    },
  };
}

/** Streaks that cross the upper sky for a few seconds during the finale. */
function meteorShower(random: Random) {
  const count = 22;
  const corners: number[] = [], data: number[] = [], indices: number[] = [];
  for (let i = 0; i < count; i++) {
    const meteor = [(random() - .5) * 1.9, .3 + random() * .45, random() * 9, random()];
    const heading = (random() < .5 ? -1 : 1) * (.45 + random() * .5);
    for (const [along, side] of [[0, -1], [0, 1], [1, -1], [1, 1]]) {
      corners.push(along, side, heading);
      data.push(...meteor);
    }
    const base = i * 4;
    indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(count * 12), 3));
  geometry.setAttribute('corner', new Float32BufferAttribute(corners, 3));
  geometry.setAttribute('meteor', new Float32BufferAttribute(data, 4));
  geometry.setIndex(indices);
  const uniforms = { shower: { value: 0 } };
  const mesh = new Mesh(geometry, new ShaderMaterial({
    uniforms,
    vertexShader: `
      uniform float shower;
      attribute vec3 corner;
      attribute vec4 meteor;
      varying float vFade, vAlong;
      void main() {
        float t = shower - meteor.z;
        float life = 1.1 + meteor.w * .7;
        float alive = step(0., t) * step(t, life);
        vec3 start = vec3(sin(meteor.x) * cos(meteor.y), sin(meteor.y), cos(meteor.x) * cos(meteor.y)) * 98.;
        vec3 east = normalize(vec3(cos(meteor.x), 0., -sin(meteor.x)));
        vec3 down = normalize(cross(east, start));
        vec3 dir = normalize(east * cos(corner.z) + down * abs(sin(corner.z)) * 1.4);
        vec3 head = start + dir * t * (20. + 12. * meteor.w);
        vec3 side = normalize(cross(dir, head));
        float len = (6. + 5. * meteor.w) * min(1., t * 3.);
        vec3 p = head - dir * len * corner.x + side * corner.y * .16 * (1. - corner.x * .9);
        vFade = alive * smoothstep(0., .12, t) * (1. - smoothstep(life * .55, life, t));
        vAlong = corner.x;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.);
      }`,
    fragmentShader: `
      varying float vFade, vAlong;
      void main() {
        gl_FragColor = vec4(vec3(1., .93, .8) * 2.6, vFade * pow(1. - vAlong, 1.6));
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide,
  }));
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.renderOrder = 1;
  return { mesh, uniforms };
}
