import {
  BufferGeometry, Color, CylinderGeometry, DataTexture, DoubleSide, Float32BufferAttribute, Group,
  InstancedMesh, MathUtils, Matrix4, Mesh, MeshStandardMaterial, Quaternion, Vector2, Vector3,
} from 'three';
import type { Texture } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Random } from '../../core/random';
import type { TreeTextures } from '../../textures/assets';
import { groundHeight } from '../landscape';
import { dissolvable } from './dissolve';
import { CROWN_BASE, TREE_RADIUS, TREE_TOP, crownCenter, crownRadius, measureCrown } from './shape';

/** Pixel rectangles of the scanned fir sprays in the 2048² atlas: [left, top, right, bottom, stemX, stemY]. */
const ATLAS = 2048;
const SPRAYS = {
  lush: [625, 816, 1320, 1590, 986, 1590],
  fan: [1298, 927, 1956, 1707, 1611, 1707],
  fork: [1336, 85, 1919, 753, 1654, 753],
  cross: [387, 95, 875, 636, 625, 636],
  twin: [1007, 530, 1293, 816, 1102, 816],
  stub: [790, 588, 943, 784, 880, 778],
  sprig: [1102, 201, 1203, 466, 1143, 466],
} as const;
type Spray = keyof typeof SPRAYS;
const KINDS = Object.keys(SPRAYS) as Spray[];

/** A slightly arched, drooping card whose stem sits at the origin and whose tip points along +Y. */
function sprayCard(kind: Spray): BufferGeometry {
  const [left, top, right, bottom, stemX, stemY] = SPRAYS[kind];
  const height = bottom - top;
  const columns = 2, rows = 4;
  const positions: number[] = [], uvs: number[] = [], along: number[] = [], indices: number[] = [];
  for (let row = 0; row <= rows; row++) {
    for (let column = 0; column <= columns; column++) {
      const px = MathUtils.lerp(left, right, column / columns);
      const py = MathUtils.lerp(bottom, top, row / rows);
      const x = (px - stemX) / height;
      const y = (stemY - py) / height;
      positions.push(x, y, -.17 * y * y - .07 * x * x);
      uvs.push(px / ATLAS, 1 - py / ATLAS);
      along.push(row / rows);
    }
  }
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const a = row * (columns + 1) + column;
      const b = a + columns + 1;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('along', new Float32BufferAttribute(along, 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

interface Card {
  matrix: Matrix4;
  color: Color;
  priority: number;
}

interface Branch {
  origin: Vector3;
  angle: number;
  length: number;
  curl: number;
  rise: number;
  sag: number;
  flick: number;
}

const up = new Vector3(0, 1, 0);

function branchPoint(branch: Branch, s: number, target: Vector3): Vector3 {
  const yaw = branch.angle + branch.curl * s;
  const distance = branch.length * s;
  const lift = branch.length * (branch.rise * s - branch.sag * s * s + branch.flick * s ** 4);
  target.set(branch.origin.x + Math.sin(yaw) * distance, branch.origin.y + lift, branch.origin.z + Math.cos(yaw) * distance);
  target.y = Math.max(target.y, groundHeight(target.x, target.z) + .16);
  return target;
}

const GLSL_CROWN = `
  float crownRadiusAt(float y) {
    float t = clamp((y - ${CROWN_BASE.toFixed(3)}) / ${(TREE_TOP - CROWN_BASE).toFixed(3)}, 0., 1.);
    return .04 + ${(TREE_RADIUS - .04).toFixed(3)} * pow(1. - t, .93) * (1. + .07 * sin(3.14159 * t));
  }`;

export function createEvergreen(textures: TreeTextures, random: Random) {
  const group = new Group();
  const cards = new Map<Spray, Card[]>(KINDS.map(kind => [kind, []]));
  const boundary: Vector3[] = [];
  const samples: Vector3[] = [];
  const wood: BufferGeometry[] = [];
  const point = new Vector3();
  const ahead = new Vector3();
  const direction = new Vector3();
  const normal = new Vector3();
  const side = new Vector3();
  const spin = new Quaternion();
  const deep = new Color(.22, .34, .25);
  const fresh = new Color(.6, .74, .5);

  function pick<T>(options: readonly T[], weights: readonly number[]): T {
    let total = 0;
    for (const weight of weights) total += weight;
    let roll = random() * total;
    for (let i = 0; i < options.length; i++) {
      roll -= weights[i];
      if (roll <= 0) return options[i];
    }
    return options[options.length - 1];
  }

  function place(kind: Spray, origin: Vector3, heading: Vector3, roll: number, length: number, color: Color, priority: number, hint = up) {
    direction.copy(heading).normalize();
    normal.copy(hint).addScaledVector(direction, -direction.dot(hint));
    if (normal.lengthSq() < 1e-4) normal.set(1, 0, 0).addScaledVector(direction, -direction.x);
    normal.normalize().applyQuaternion(spin.setFromAxisAngle(direction, roll));
    side.crossVectors(direction, normal).normalize();
    const matrix = new Matrix4().makeBasis(side, direction, normal).scale(new Vector3(length, length, length)).setPosition(origin);
    cards.get(kind)!.push({ matrix, color, priority });
    samples.push(origin.clone().addScaledVector(direction, length * .5));
    if (priority > .45) boundary.push(origin.clone().addScaledVector(direction, length * .8));
  }

  function tint(s: number, height: number, brightness: number): Color {
    const shade = (.34 + .66 * MathUtils.smoothstep(s, .05, .95)) * (.78 + .22 * MathUtils.smoothstep(height, .2, 2.6));
    return deep.clone().lerp(fresh, s ** 1.6 * .85).multiplyScalar(shade * brightness);
  }

  function rotateAroundUp(vector: Vector3, angle: number): Vector3 {
    return vector.applyAxisAngle(up, angle);
  }

  const layers = 42;
  for (let layer = 0; layer < layers; layer++) {
    const t = layer / (layers - 1);
    const y = CROWN_BASE + .1 + t ** 1.04 * (TREE_TOP - CROWN_BASE - .9) + (random() - .5) * .08;
    const reach = crownRadius(y);
    const count = Math.round(6 + 9 * (1 - t) + random() * 1.5);
    const startAngle = layer * 2.39996 + random() * .4;
    for (let j = 0; j < count; j++) {
      const angle = startAngle + (j + (random() - .5) * .7) / count * Math.PI * 2;
      const branch: Branch = {
        origin: crownCenter(y + (random() - .5) * .12, new Vector3()),
        angle,
        length: reach * (.86 + .16 * random()),
        curl: (random() - .5) * .3,
        rise: .1 + .3 * t + random() * .08,
        sag: .2 + .26 * (1 - t) + random() * .08,
        flick: .1 * (1 - t),
      };
      const length = branch.length;
      if (length > .55) {
        branchPoint(branch, .62, point);
        const limb = new CylinderGeometry(.008, Math.min(.05, .024 * length), point.distanceTo(branch.origin), 5);
        limb.translate(0, point.distanceTo(branch.origin) / 2, 0);
        limb.applyQuaternion(spin.setFromUnitVectors(up, ahead.subVectors(point, branch.origin).normalize()));
        limb.translate(branch.origin.x, branch.origin.y, branch.origin.z);
        wood.push(limb);
      }

      const card = MathUtils.clamp(length * .46, .28, 1.02);
      const step = card * .34 / length;
      for (let s = .1 + random() * step; s < .9; s += step) {
        branchPoint(branch, s, point);
        branchPoint(branch, s + .04, ahead);
        const heading = ahead.clone().sub(point).normalize();
        const bright = .9 + .2 * random();
        const main = pick<Spray>(['lush', 'fan', 'fork', 'cross'], [3, 3, 2, 1]);
        place(main, point, rotateAroundUp(heading.clone(), (random() - .5) * .36).add(new Vector3(0, .06, 0)),
          (random() - .5) * .62, card * (.86 + .3 * random()), tint(s, y, bright), .55 + .4 * random());
        for (const sign of [-1, 1]) {
          const kind = pick<Spray>(['twin', 'cross', 'fork', 'stub', 'sprig'], [3, 2, 2, 1, 1]);
          const turn = sign * (.55 + .55 * random());
          place(kind, point, rotateAroundUp(heading.clone(), turn).add(new Vector3(0, (random() - .35) * .3, 0)),
            sign * (.15 + .45 * random()), card * (.5 + .28 * random()), tint(s * .92, y, bright), .3 + .4 * random());
        }
        if (random() < .38) {
          place(pick<Spray>(['lush', 'fork'], [2, 1]), point, rotateAroundUp(heading.clone(), (random() - .5) * 1.2).add(new Vector3(0, .25, 0)),
            (random() < .5 ? -1 : 1) * (.9 + .5 * random()), card * (.6 + .2 * random()), tint(s * .85, y, bright * .95), .12 + .3 * random());
        }
      }
      branchPoint(branch, .9, point);
      branchPoint(branch, .95, ahead);
      const tipHeading = ahead.clone().sub(point).normalize().add(new Vector3(0, .14, 0));
      place(pick<Spray>(['fan', 'lush', 'fork'], [3, 2, 2]), point, tipHeading, (random() - .5) * .5, card * (.72 + .3 * random()), tint(1, y, .95 + .15 * random()), .9 + .1 * random());

      for (let k = 0; k < 3; k++) {
        const s = .06 + random() * .28;
        branchPoint(branch, s, point);
        place('lush', point, rotateAroundUp(new Vector3(Math.sin(angle), .2, Math.cos(angle)), (random() - .5) * 1.4),
          (random() - .5) * 2.4, card * (1 + .3 * random()), tint(s * .6, y, .8), random() * .2);
      }
    }
  }

  for (let i = 0; i < 26; i++) {
    const s = i / 25;
    const y = TREE_TOP - 1.25 + s * 1.08;
    const yaw = i * 2.39996;
    const lean = .25 + .55 * (1 - s) * random();
    const heading = new Vector3(Math.sin(yaw) * lean, 1, Math.cos(yaw) * lean);
    const hint = new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    place(pick<Spray>(['sprig', 'fork', 'twin', 'cross'], [2, 1, 2, 1]), crownCenter(y, new Vector3()), heading,
      (random() - .5) * 1.2, .34 + .32 * (1 - s) * random() + .12, tint(.9, y, 1), .8 + .2 * random(), hint);
  }

  const trunkGeometry = new CylinderGeometry(.03, .19, TREE_TOP - .3, 12, 6);
  trunkGeometry.translate(0, (TREE_TOP - .3) / 2 - .12, 0);
  const trunkUv = trunkGeometry.attributes.uv;
  for (let i = 0; i < trunkUv.count; i++) trunkUv.setXY(i, trunkUv.getX(i) * 2, trunkUv.getY(i) * 9);
  wood.push(trunkGeometry);
  const woodGeometry = mergeGeometries(wood.map(piece => piece.index ? piece.toNonIndexed() : piece));
  for (const piece of wood) piece.dispose();
  const bark = new Mesh(woodGeometry, new MeshStandardMaterial({
    color: 0x8a7766, map: textures.barkColor, normalMap: textures.barkNormal, roughness: .95,
  }));
  bark.castShadow = bark.receiveShadow = true;
  dissolvable(bark.material, 'bark');

  const black = new DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  black.needsUpdate = true;
  const uniforms = {
    bulbGlow: { value: black as Texture },
    bulbReach: { value: 0 },
    glowStrength: { value: 0 },
    snowAmount: { value: .16 },
    spill: { value: new Vector3(1, .5, .17) },
  };
  const needles = new MeshStandardMaterial({
    map: textures.twigColor, alphaMap: textures.twigAlpha, normalMap: textures.twigNormal,
    normalScale: new Vector2(.9, .9), alphaTest: .42, side: DoubleSide, roughness: .74, metalness: 0, envMapIntensity: .35,
  });
  needles.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float along;
        varying vec3 vFoliage;
        varying float vAlong;
        varying float vFacing;`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        vFoliage = (modelMatrix * instanceMatrix * vec4(transformed, 1.)).xyz;
        vAlong = along;
        vFacing = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * vec3(0., 0., 1.)).y;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D bulbGlow;
        uniform float bulbReach, glowStrength, snowAmount;
        uniform vec3 spill;
        varying vec3 vFoliage;
        varying float vAlong;
        varying float vFacing;
        ${GLSL_CROWN}
        float foliageHash(vec3 p) { return fract(sin(dot(floor(p), vec3(12.9898, 78.233, 37.719))) * 43758.5453); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float dust = smoothstep(.5, 1., vAlong) * smoothstep(.55, .95, abs(vFacing))
          * smoothstep(.5, .9, foliageHash(vFoliage * 11.)) * snowAmount;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.74, .80, .90), dust);`)
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
        vec3 outward = normalize(vec3(vFoliage.x, .0, vFoliage.z) * 1.2 + vec3(0., .75, 0.));
        normal = normalize(mix(normal, normalize((viewMatrix * vec4(outward, 0.)).xyz), .62));
        nonPerturbedNormal = normal;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float heightFraction = clamp(vFoliage.y / ${TREE_TOP.toFixed(2)}, 0., 1.);
        float bearing = atan(vFoliage.x, vFoliage.z) / 6.2831853 + .5;
        float bulbs = texture2D(bulbGlow, vec2(bearing, heightFraction)).r;
        float shell = smoothstep(.2, .92, length(vFoliage.xz) / max(.05, crownRadiusAt(vFoliage.y)));
        float reached = smoothstep(heightFraction - .035, heightFraction, bulbReach);
        totalEmissiveRadiance += diffuseColor.rgb * spill * bulbs * (.3 + .7 * shell) * reached * glowStrength;`);
  };

  dissolvable(needles, 'needles');

  const meshes: { mesh: InstancedMesh; total: number }[] = [];
  for (const kind of KINDS) {
    const list = cards.get(kind)!;
    if (!list.length) continue;
    list.sort((a, b) => b.priority - a.priority);
    const mesh = new InstancedMesh(sprayCard(kind), needles, list.length);
    for (const [index, card] of list.entries()) {
      mesh.setMatrixAt(index, card.matrix);
      mesh.setColorAt(index, card.color);
    }
    mesh.computeBoundingSphere();
    mesh.castShadow = mesh.receiveShadow = true;
    meshes.push({ mesh, total: list.length });
    group.add(mesh);
  }
  group.add(bark);

  return {
    group,
    uniforms,
    cardCount: meshes.reduce((sum, entry) => sum + entry.total, 0),
    surface: measureCrown(boundary),
    samples,
    setShadows(enabled: boolean) {
      for (const { mesh } of meshes) mesh.castShadow = enabled;
      bark.castShadow = enabled;
    },
    setDensity(fraction: number) {
      for (const { mesh, total } of meshes) mesh.count = Math.max(1, Math.round(total * fraction));
    },
    setBulbGlow(texture: Texture) {
      uniforms.bulbGlow.value = texture;
    },
  };
}
