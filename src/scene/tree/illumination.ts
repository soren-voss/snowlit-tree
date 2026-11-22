import {
  AdditiveBlending, BufferGeometry, Color, Curve, ExtrudeGeometry, Float32BufferAttribute, Group,
  IcosahedronGeometry, InstancedBufferAttribute, InstancedMesh, MathUtils, Mesh, MeshStandardMaterial,
  Object3D, Points, ShaderMaterial, Shape, Sprite, SpriteMaterial, Texture, TubeGeometry, Vector3,
} from 'three';
import type { Random } from '../../core/random';
import { CROWN_BASE, TAU, TREE_TOP, crownCenter, crownSurface } from './shape';

const modes = ['breath', 'chase', 'twinkle'] as const;
export type LightMode = typeof modes[number];
const FLOW_COUNT = 50;

class GarlandPath extends Curve<Vector3> {
  constructor() {
    super();
  }

  getPoint(t: number, target = new Vector3()): Vector3 {
    const angle = -0.38 + t * TAU * 6.4;
    const y = CROWN_BASE - .025 + t * (TREE_TOP - CROWN_BASE - .10) + .072 * Math.sin(angle * 2.0) * (1 - t);
    return crownSurface(y, angle, .074 + .092 * Math.sin(angle * 3 + t * 3) * (1 - t) + .06 * Math.sin(t * 100), target);
  }

  override getPointAt(t: number, target?: Vector3): Vector3 {
    return this.getPoint(t, target);
  }

  override getTangentAt(t: number, target?: Vector3): Vector3 {
    return this.getTangent(t, target);
  }
}

function bulbString(path: GarlandPath, random: Random) {
  const count = 359;
  const geometry = new IcosahedronGeometry(1, 1);
  const metadata = [];
  const uniforms = { time: { value: 0 }, progress: { value: 0 }, mode: { value: 0 } };
  const material = new ShaderMaterial({
    uniforms,
    vertexShader: `
      attribute vec3 bulb;
      varying vec3 surfaceNormal, variation;
      void main() {
        surfaceNormal = normalize(normalMatrix * mat3(instanceMatrix) * normal);
        variation = bulb;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.);
      }
    `,
    fragmentShader: `
      uniform float time, progress, mode;
      varying vec3 surfaceNormal, variation;
      void main() {
        float on = smoothstep(variation.x - .002, variation.x + .011, progress);
        float phase = .5 + .5 * sin(time * (1.3 + .33 * variation.y) + variation.y * 41.);
        float flicker = pow(.5 + .5 * sin(time * (2.7 + 5.*variation.z) + variation.y * 88.), 13.);
        float breath = .76 + .11 * sin(time * 1.38 - variation.x * 5.4) + (.18 + .15 * variation.z) * flicker;
        float chase = .35 + .83 * pow(.5 + .5 * cos(variation.x * 32. - time * 4.1), 7.);
        float twinkle = .41 + .16 * phase + .82 * flicker;
        float rhythm = mode < .5 ? breath : mode < 1.5 ? chase : twinkle;
        float face = .62 + .38 * max(0., surfaceNormal.z);
        vec3 color = mix(vec3(3.25, 1.01, .20), vec3(3.95, 2.77, 1.29), variation.z);
        gl_FragColor = vec4(mix(vec3(.016,.022,.017), color * rhythm * face, on), 1.);
        #include <colorspace_fragment>
      }
    `,
  });
  const bulbs = new InstancedMesh(geometry, material, count);
  const proxy = new Object3D();
  for (let i = 0; i < count; i++) {
    const t = (i + .2 + random() * .6) / count;
    const size = (.023 + .032 * random() ** 1.5) * (1 - .24 * t);
    path.getPoint(t, proxy.position);
    if (i % 3 !== 0) {
      proxy.position.y += (random() - .50) * .28 * (1 - t * .6);
      proxy.position.x *= .93 + random() * .12;
      proxy.position.z *= .93 + random() * .12;
    }
    proxy.scale.set(size * .86, size * (.9 + random() * .42), size);
    proxy.updateMatrix();
    bulbs.setMatrixAt(i, proxy.matrix);
    metadata.push(t, random(), random());
  }
  geometry.setAttribute('bulb', new InstancedBufferAttribute(new Float32Array(metadata), 3));
  return { mesh: bulbs, uniforms };
}

function goldRibbon(path: GarlandPath) {
  const uniforms = { progress: { value: 0 }, time: { value: 0 } };
  const material = new ShaderMaterial({
    uniforms,
    vertexShader: `
      varying vec3 viewNormal;
      varying vec2 cord;
      void main() {
        cord = uv;
        viewNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
      }
    `,
    fragmentShader: `
      uniform float progress, time;
      varying vec3 viewNormal;
      varying vec2 cord;
      void main() {
        if (cord.x > progress) discard;
        float falloff = .46 + .54 * max(0., dot(viewNormal, vec3(-.4,.64,.65)));
        float gleam = pow(.5 + .5 * sin(cord.x * 91. - time * 2.25), 13.);
        float front = exp(-abs(progress - cord.x) * 100.) * (1. - step(1., progress));
        vec3 col = vec3(.61,.28,.069) * falloff + vec3(1.33,.66,.19) * (gleam * .78 + front);
        gl_FragColor = vec4(col, 1.);
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new Mesh(new TubeGeometry(path, 640, .0125, 5, false), material);
  return { mesh, uniforms };
}

function movingLights(random: Random) {
  const geometry = new BufferGeometry();
  const vertices = new Float32Array(FLOW_COUNT * 3);
  const visible = new Float32Array(FLOW_COUNT);
  const shift = Array.from({ length: FLOW_COUNT }, (_, index) => (index + random() * .65) / FLOW_COUNT);
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('shine', new Float32BufferAttribute(visible, 1));
  const material = new ShaderMaterial({
    uniforms: { ratio: { value: 1 } },
    vertexShader: `
      uniform float ratio;
      attribute float shine;
      varying float alpha;
      void main() {
        vec4 pos = modelViewMatrix * vec4(position, 1.);
        gl_Position = projectionMatrix * pos;
        gl_PointSize = ratio * clamp(69. / max(1., -pos.z), 1.3, 10.);
        alpha = shine;
      }
    `,
    fragmentShader: `
      varying float alpha;
      void main() {
        float d = length(gl_PointCoord - .5) * 2.;
        gl_FragColor = vec4(3.4,1.80,.53, alpha * (1.-smoothstep(.12,.95,d)));
        #include <colorspace_fragment>
      }
    `,
    transparent: true, depthWrite: false, blending: AdditiveBlending,
  });
  const points = new Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 2;
  return { points, geometry, material, shift };
}

function topper(glowTexture: Texture) {
  const shape = new Shape();
  for (let i = 0; i < 10; i++) {
    const angle = Math.PI / 2 + i * Math.PI / 5;
    const radius = i % 2 ? .231 : .533;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  const geometry = new ExtrudeGeometry(shape, {
    depth: .09, bevelEnabled: true, bevelThickness: .043, bevelSize: .027, bevelSegments: 2, steps: 1,
  });
  geometry.translate(0, 0, -.045);
  const face = new MeshStandardMaterial({ color: 0xd5a54c, metalness: .65, roughness: .25, emissive: 0xffbc50, emissiveIntensity: 0 });
  const edge = new MeshStandardMaterial({ color: 0x9c6731, metalness: .75, roughness: .25, emissive: 0xf29529, emissiveIntensity: 0 });
  const star = new Mesh(geometry, [face, edge]);
  const facets = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 10; i++) {
      const a = Math.PI / 2 + i * Math.PI / 5;
      const b = a + Math.PI / 5;
      const r = i % 2 ? .226 : .516;
      const s = i % 2 ? .516 : .226;
      const first = [Math.cos(a) * r, Math.sin(a) * r, .047 * side];
      const second = [Math.cos(b) * s, Math.sin(b) * s, .047 * side];
      facets.push(0, .01, .143 * side, ...(side > 0 ? first : second), ...(side > 0 ? second : first));
    }
  }
  const ridge = new BufferGeometry();
  ridge.setAttribute('position', new Float32BufferAttribute(facets, 3));
  ridge.computeVertexNormals();
  const facetMaterial = new MeshStandardMaterial({ color: 0xf4c674, metalness: .55, roughness: .22, emissive: 0xffc25b, emissiveIntensity: 0 });
  star.add(new Mesh(ridge, facetMaterial));
  const halo = new Sprite(new SpriteMaterial({
    map: glowTexture, color: new Color(0xffb759).multiplyScalar(1.75), transparent: true,
    opacity: 0, blending: AdditiveBlending, depthWrite: false,
  }));
  crownCenter(TREE_TOP + .41, star.position);
  halo.position.copy(star.position);
  halo.scale.setScalar(3.25);
  halo.renderOrder = 3;
  const group = new Group();
  group.add(star, halo);
  return {
    group,
    update(time: number, level: number, flare: number) {
      star.visible = level > .002;
      halo.visible = star.visible;
      star.rotation.y = .19 + time * .25;
      face.emissiveIntensity = 2.48 * level + flare;
      edge.emissiveIntensity = 1.12 * level + flare * .45;
      facetMaterial.emissiveIntensity = (1.44 + .48 * Math.sin(time * 1.15)) * level + flare;
      halo.material.opacity = .31 * level + .35 * flare;
      halo.scale.setScalar(3.0 + flare * 1.16 + .18 * Math.sin(time * 1.3));
    },
  };
}

export const BASE_BLOOM = .57;

export interface LightsState {
  bulbs: number;
  ribbon: number;
  star: number;
  ground: number;
  flare: number;
}

export function createIllumination(random: Random, glow: Texture) {
  const group = new Group();
  const path = new GarlandPath();
  const bulbs = bulbString(path, random);
  const ribbon = goldRibbon(path);
  const sparks = movingLights(random);
  const star = topper(glow);
  const cursor = new Vector3();
  group.add(bulbs.mesh, ribbon.mesh, sparks.points, star.group);
  const state: LightsState = { bulbs: 0, ribbon: 0, star: 0, ground: 0, flare: 0 };
  return {
    group,
    state,
    setLightMode(mode: LightMode) {
      const index = modes.indexOf(mode);
      if (index >= 0) bulbs.uniforms.mode.value = index;
    },
    update(time: number, ratio: number) {
      bulbs.mesh.visible = state.bulbs > 0;
      bulbs.uniforms.progress.value = state.bulbs === 1 ? 1.025 : state.bulbs;
      bulbs.uniforms.time.value = time;
      ribbon.mesh.visible = state.ribbon > 0;
      ribbon.uniforms.progress.value = state.ribbon;
      ribbon.uniforms.time.value = time;
      sparks.points.visible = state.ribbon > 0;
      if (sparks.points.visible) {
        sparks.material.uniforms.ratio.value = ratio;
        const positions = sparks.geometry.attributes.position;
        const shine = sparks.geometry.attributes.shine;
        for (let i = 0; i < FLOW_COUNT; i++) {
          const t = (sparks.shift[i] + time * .027) % 1;
          path.getPoint(t, cursor);
          positions.setXYZ(i, cursor.x * 1.008, cursor.y + .014, cursor.z * 1.008);
          const edge = MathUtils.smoothstep(t, 0, .035) * (1 - MathUtils.smoothstep(t, state.ribbon - .055, state.ribbon));
          shine.setX(i, edge * (.38 + .24 * Math.sin(time * 2.6 + i * 7)));
        }
        positions.needsUpdate = shine.needsUpdate = true;
      }
      star.update(time, state.star, state.flare);
    },
  };
}
