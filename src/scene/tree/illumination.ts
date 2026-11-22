import {
  AdditiveBlending, BufferGeometry, CanvasTexture, Color, ExtrudeGeometry, Float32BufferAttribute, Group,
  IcosahedronGeometry, InstancedBufferAttribute, InstancedMesh, Mesh, MeshStandardMaterial,
  Object3D, Points, ShaderMaterial, Shape, Sprite, SpriteMaterial, Vector3,
} from 'three';
import type { Camera, Texture } from 'three';
import type { Random } from '../../core/random';
import type { Theme } from '../theme';
import { cutHeight, dissolvable } from './dissolve';
import { CROWN_BASE, TAU, TREE_TOP, crownCenter, crownRadius } from './shape';
import type { CrownSurface } from './shape';

const modes = ['breath', 'chase', 'twinkle'] as const;
export type LightMode = typeof modes[number];

interface Bulb {
  position: Vector3;
  order: number;
  depth: number;
}

/** Bulbs wound around the crown in a loose spiral, half tucked deep between branches. */
function layoutBulbs(random: Random, surface: CrownSurface): Bulb[] {
  const bulbs: Bulb[] = [];
  const count = 540;
  const turns = 15.5;
  for (let i = 0; i < count; i++) {
    const t = (i + random() * .8) / count;
    const y = CROWN_BASE + .3 + t * (TREE_TOP - CROWN_BASE - .85) + (random() - .5) * .22;
    const angle = t * TAU * turns + (random() - .5) * .35;
    const deep = random() < .4;
    const reach = crownRadius(y);
    const inset = deep ? reach * (.18 + .35 * random()) : .04 + .12 * random();
    bulbs.push({ position: surface(y, angle, inset), order: t, depth: deep ? .35 + .3 * random() : 1 });
  }
  return bulbs;
}

function bulbMeshes(bulbs: Bulb[], random: Random) {
  const geometry = new IcosahedronGeometry(1, 2);
  const uniforms = {
    time: { value: 0 }, progress: { value: 0 }, mode: { value: 0 }, ratio: { value: 1 }, cutHeight,
    tintDeep: { value: new Vector3(1, .62, .26) }, tintBright: { value: new Vector3(1, .8, .52) },
  };
  const meta = new Float32Array(bulbs.length * 4);
  bulbs.forEach((bulb, i) => meta.set([bulb.order, random(), random(), bulb.depth], i * 4));
  const rhythm = `
    uniform float time, progress, mode, cutHeight;
    uniform vec3 tintDeep, tintBright;
    varying float vCutY;
    float bulbLevel(vec4 b) {
      float on = smoothstep(b.x - .004, b.x + .012, progress);
      float flicker = pow(.5 + .5 * sin(time * (2.3 + 4. * b.z) + b.y * 88.), 16.);
      float breath = .8 + .14 * sin(time * 1.2 - b.x * 6.) + .25 * flicker;
      float chase = .3 + .9 * pow(.5 + .5 * cos(b.x * 40. - time * 3.6), 6.);
      float twinkle = .35 + .25 * (.5 + .5 * sin(time * (1.4 + b.y) + b.y * 40.)) + .8 * flicker;
      return on * (mode < .5 ? breath : mode < 1.5 ? chase : twinkle);
    }
    vec3 bulbTint(vec4 b) { return mix(tintDeep, tintBright, b.z); }`;

  const core = new ShaderMaterial({
    uniforms,
    vertexShader: `
      attribute vec4 bulb;
      varying vec4 vBulb;
      varying vec3 vNormal;
      varying float vCutY;
      void main() {
        vBulb = bulb;
        vCutY = (modelMatrix * instanceMatrix * vec4(position, 1.)).y;
        vNormal = normalize(normalMatrix * mat3(instanceMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.);
      }`,
    fragmentShader: `
      ${rhythm}
      varying vec4 vBulb;
      varying vec3 vNormal;
      void main() {
        if (vCutY < cutHeight) discard;
        float level = bulbLevel(vBulb);
        float face = .55 + .45 * max(0., vNormal.z);
        vec3 off = vec3(.05, .045, .035);
        gl_FragColor = vec4(mix(off, bulbTint(vBulb) * (4.2 * face), min(1., level)) * max(level, 1.), 1.);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new InstancedMesh(geometry, core, bulbs.length);
  const stencil = new Object3D();
  bulbs.forEach((bulb, i) => {
    stencil.position.copy(bulb.position);
    stencil.scale.setScalar(.022 + .01 * random());
    stencil.scale.y *= 1.35;
    stencil.rotation.set((random() - .5) * .8, random() * TAU, (random() - .5) * .8);
    stencil.updateMatrix();
    mesh.setMatrixAt(i, stencil.matrix);
  });
  geometry.setAttribute('bulb', new InstancedBufferAttribute(meta, 4));

  const haloGeometry = new BufferGeometry();
  haloGeometry.setAttribute('position', new Float32BufferAttribute(bulbs.flatMap(bulb => bulb.position.toArray()), 3));
  haloGeometry.setAttribute('bulb', new Float32BufferAttribute(meta, 4));
  const halos = new Points(haloGeometry, new ShaderMaterial({
    uniforms,
    vertexShader: `
      uniform float ratio;
      attribute vec4 bulb;
      varying vec4 vBulb;
      varying float vCutY;
      void main() {
        vBulb = bulb;
        vCutY = (modelMatrix * vec4(position, 1.)).y;
        vec4 eye = modelViewMatrix * vec4(position, 1.);
        gl_Position = projectionMatrix * eye;
        gl_PointSize = ratio * clamp(150. / max(1., -eye.z), 4., 30.) * mix(.6, 1., bulb.w);
      }`,
    fragmentShader: `
      ${rhythm}
      varying vec4 vBulb;
      void main() {
        if (vCutY < cutHeight) discard;
        float d = length(gl_PointCoord - .5) * 2.;
        float glow = exp(-d * d * 7.) * .9 + exp(-d * 3.2) * .22;
        gl_FragColor = vec4(bulbTint(vBulb) * 1.5, glow * bulbLevel(vBulb) * vBulb.w * (1. - smoothstep(.8, 1., d)));
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, blending: AdditiveBlending,
  }));
  halos.frustumCulled = false;
  halos.renderOrder = 2;
  return { mesh, halos, uniforms };
}

/** Warm light pools cast by the bulbs, unwrapped onto a cylinder (u = bearing, v = height). */
function bulbGlowMap(bulbs: Bulb[]): CanvasTexture {
  const width = 512, height = 256;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = 'lighter';
  const center = new Vector3();
  for (const bulb of bulbs) {
    const { x, y, z } = bulb.position;
    crownCenter(y, center);
    const u = (Math.atan2(x - center.x, z - center.z) / TAU + .5) * width;
    const v = (1 - y / TREE_TOP) * height;
    const circumference = Math.max(.6, TAU * crownRadius(y));
    const ru = Math.min(width * .25, .55 / circumference * width);
    const rv = .55 / TREE_TOP * height;
    for (const offset of [-width, 0, width]) {
      ctx.save();
      ctx.translate(u + offset, v);
      ctx.scale(ru, rv);
      const light = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      light.addColorStop(0, `rgba(255,255,255,${.5 * bulb.depth + .15})`);
      light.addColorStop(.45, 'rgba(255,255,255,.12)');
      light.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = light;
      ctx.beginPath();
      ctx.arc(0, 0, 1, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.generateMipmaps = true;
  return texture;
}

/** Draped swags of gold beads that hug the crown and dip between their hanging points. */
function beadGarland(random: Random, surface: CrownSurface) {
  const beads: { position: Vector3; order: number }[] = [];
  const rings = [1.05, 1.95, 2.85, 3.75, 4.6, 5.45, 6.25];
  const cursor = new Vector3();
  rings.forEach((height, ringIndex) => {
    const reach = crownRadius(height);
    const swags = Math.max(3, Math.round(TAU * reach / 1.75));
    const start = ringIndex * 1.1 + random() * .5;
    const sag = .2 + .14 * reach / 3;
    const spacing = .052;
    const total = Math.round(TAU * reach * 1.08 / spacing);
    for (let i = 0; i < total; i++) {
      const u = i / total;
      const local = (u * swags) % 1;
      const angle = start + u * TAU;
      const y = height - sag * 4 * local * (1 - local) - .12 * Math.sin(u * TAU * 2 + ringIndex);
      surface(y, angle, .07 + .05 * Math.sin(u * 97), cursor);
      beads.push({ position: cursor.clone(), order: (ringIndex + u) / rings.length });
    }
  });
  const geometry = new IcosahedronGeometry(1, 1);
  const order = new Float32Array(beads.map(bead => bead.order));
  geometry.setAttribute('garland', new InstancedBufferAttribute(order, 1));
  const uniforms = { progress: { value: 0 }, time: { value: 0 } };
  const material = new MeshStandardMaterial({ color: 0xd9a74e, metalness: 1, roughness: .24, envMapIntensity: 1.2 });
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float garland;\nvarying float vGarland;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGarland = garland;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float progress, time;\nvarying float vGarland;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float front = exp(-abs(progress - vGarland) * 40.) * (1. - step(1., progress)) * step(.001, progress);
        float shimmer = pow(.5 + .5 * sin(vGarland * 900. - time * 2.4), 18.) * step(vGarland, progress);
        totalEmissiveRadiance += vec3(1., .62, .22) * (front * 2.2 + shimmer * .55);`);
  };
  dissolvable(material, 'garland');
  const mesh = new InstancedMesh(geometry, material, beads.length);
  const stencil = new Object3D();
  beads.forEach((bead, i) => {
    stencil.position.copy(bead.position);
    stencil.scale.setScalar(.021 + .004 * random());
    stencil.updateMatrix();
    mesh.setMatrixAt(i, stencil.matrix);
  });
  mesh.castShadow = true;
  return { mesh, uniforms, material };
}

function rayTexture(): CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.globalCompositeOperation = 'lighter';
  ctx.translate(size / 2, size / 2);
  for (const [angle, length, width] of [[0, 1, 1], [Math.PI / 2, .82, 1], [Math.PI / 4, .42, .55], [-Math.PI / 4, .42, .55]]) {
    ctx.save();
    ctx.rotate(angle);
    const beam = ctx.createLinearGradient(-size / 2 * length, 0, size / 2 * length, 0);
    beam.addColorStop(0, 'rgba(255,255,255,0)');
    beam.addColorStop(.5, 'rgba(255,255,255,.9)');
    beam.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.ellipse(0, 0, size / 2 * length, 2.6 * width, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  return new CanvasTexture(canvas);
}

/** A faceted gold star that always turns its face toward the viewer, with soft halo and cross rays. */
function topper(glowTexture: Texture) {
  const outer = .5, inner = .2;
  const shape = new Shape();
  for (let i = 0; i < 10; i++) {
    const angle = Math.PI / 2 + i * Math.PI / 5;
    const radius = i % 2 ? inner : outer;
    if (i === 0) shape.moveTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
    else shape.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
  }
  const rim = new ExtrudeGeometry(shape, { depth: .05, bevelEnabled: true, bevelThickness: .025, bevelSize: .02, bevelSegments: 2 });
  rim.translate(0, 0, -.025);
  const facets: number[] = [];
  for (const sideSign of [-1, 1]) {
    for (let i = 0; i < 10; i++) {
      const a = Math.PI / 2 + i * Math.PI / 5;
      const b = a + Math.PI / 5;
      const ra = (i % 2 ? inner : outer) * 1.02;
      const rb = (i % 2 ? outer : inner) * 1.02;
      const p = [Math.cos(a) * ra, Math.sin(a) * ra, .05 * sideSign];
      const q = [Math.cos(b) * rb, Math.sin(b) * rb, .05 * sideSign];
      facets.push(0, 0, .17 * sideSign, ...(sideSign > 0 ? p : q), ...(sideSign > 0 ? q : p));
    }
  }
  const crown = new BufferGeometry();
  crown.setAttribute('position', new Float32BufferAttribute(facets, 3));
  crown.computeVertexNormals();
  const gold = new MeshStandardMaterial({ color: 0xe0b45c, metalness: 1, roughness: .32, emissive: 0xffb84d, emissiveIntensity: 0, flatShading: true });
  const rimGold = new MeshStandardMaterial({ color: 0xb98535, metalness: 1, roughness: .5, emissive: 0xff9f2e, emissiveIntensity: 0 });
  const star = new Group();
  star.add(new Mesh(crown, gold), new Mesh(rim, rimGold));
  const halo = new Sprite(new SpriteMaterial({
    map: glowTexture, color: new Color(1, .7, .35).multiplyScalar(1.6), transparent: true, opacity: 0,
    blending: AdditiveBlending, depthWrite: false,
  }));
  const rays = new Sprite(new SpriteMaterial({
    map: rayTexture(), color: new Color(1, .82, .55).multiplyScalar(1.4), transparent: true, opacity: 0,
    blending: AdditiveBlending, depthWrite: false,
  }));
  const group = new Group();
  crownCenter(TREE_TOP + .36, group.position);
  halo.renderOrder = rays.renderOrder = 3;
  group.add(star, halo, rays);
  const home = group.position.clone();
  return {
    group,
    home,
    setTheme(theme: Theme) {
      gold.color.set(theme.star.face);
      gold.emissive.set(theme.star.emissive);
      rimGold.color.set(theme.star.rim);
      rimGold.emissive.set(theme.star.emissive);
      halo.material.color.setRGB(...theme.star.halo).multiplyScalar(1.6);
      rays.material.color.setRGB(...theme.star.halo).lerp(new Color(1, 1, 1), .4).multiplyScalar(1.4);
    },
    update(time: number, level: number, flare: number, camera?: Camera) {
      if (camera) star.rotation.y = Math.atan2(camera.position.x - group.position.x, camera.position.z - group.position.z) + .32 * Math.sin(time * .5);
      gold.emissiveIntensity = (.8 + .15 * Math.sin(time * 1.3)) * level + flare * .9;
      rimGold.emissiveIntensity = .35 * level + flare * .4;
      halo.material.opacity = .42 * level + .4 * flare;
      halo.scale.setScalar(2.6 + flare * 1.4 + .12 * Math.sin(time * 1.1));
      rays.material.opacity = (.32 + .08 * Math.sin(time * .9)) * level + .45 * flare;
      rays.material.rotation = .08 * Math.sin(time * .3);
      rays.scale.setScalar(1.25 + flare * 1.2);
    },
  };
}

export const BASE_BLOOM = .62;

export interface LightsState {
  bulbs: number;
  ribbon: number;
  star: number;
  ground: number;
  flare: number;
}

export function createIllumination(random: Random, glow: Texture, surface: CrownSurface) {
  const group = new Group();
  const layout = layoutBulbs(random, surface);
  const bulbs = bulbMeshes(layout, random);
  const garland = beadGarland(random, surface);
  const star = topper(glow);
  group.add(bulbs.mesh, bulbs.halos, garland.mesh, star.group);
  const state: LightsState = { bulbs: 0, ribbon: 0, star: 0, ground: 0, flare: 0 };
  return {
    group,
    state,
    glowMap: bulbGlowMap(layout),
    star: star.group,
    starHome: star.home,
    setReflection(texture: Texture) {
      garland.material.envMap = texture;
    },
    setTheme(theme: Theme) {
      bulbs.uniforms.tintDeep.value.set(...theme.bulbDeep);
      bulbs.uniforms.tintBright.value.set(...theme.bulbBright);
      garland.material.color.set(theme.garland);
      star.setTheme(theme);
    },
    setShadows(enabled: boolean) {
      garland.mesh.castShadow = enabled;
    },
    setLightMode(mode: LightMode) {
      const index = modes.indexOf(mode);
      if (index >= 0) bulbs.uniforms.mode.value = index;
    },
    update(time: number, ratio: number, camera?: Camera) {
      bulbs.uniforms.progress.value = state.bulbs >= 1 ? 1.03 : state.bulbs;
      bulbs.uniforms.time.value = time;
      bulbs.uniforms.ratio.value = ratio;
      bulbs.halos.visible = state.bulbs > 0;
      garland.uniforms.progress.value = state.ribbon >= 1 ? 1.05 : state.ribbon;
      garland.uniforms.time.value = time;
      star.update(time, state.star, state.flare, camera);
    },
  };
}
