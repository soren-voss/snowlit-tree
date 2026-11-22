import {
  BoxGeometry, BufferGeometry, Color, ConeGeometry, CylinderGeometry, DoubleSide, Float32BufferAttribute,
  FogExp2, Group, InstancedMesh, MathUtils, Mesh, MeshBasicMaterial, MeshStandardMaterial,
  Object3D, PlaneGeometry, PointLight, Scene, Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Random } from '../core/random';
import { linearColor } from '../textures/procedural';

const TAU = 2 * Math.PI;
const CABIN_X = 4.65;
const CABIN_Z = -25;

export function groundHeight(x: number, z: number): number {
  const r = Math.hypot(x, z);
  const outer = MathUtils.smoothstep(r, 3.9, 13);
  const ripples = 0.06 * Math.sin(x * 0.53 - z * 0.41) * Math.sin(z * 0.47) + 0.035 * Math.sin(x * 1.13 + z * 0.63);
  const drifts = 0.64 * Math.sin(x * 0.186 + z * 0.31) + 0.31 * Math.cos(x * 0.52 - z * 0.21);
  return ripples + outer * (drifts - 0.18);
}

function createGround() {
  const glow = { value: 0 };
  const geometry = new PlaneGeometry(150, 150, 144, 144);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position;
  const concentrate = (coordinate: number) => coordinate * (.32 + .68 * (Math.abs(coordinate) / 75) ** 1.45);
  for (let i = 0; i < positions.count; i++) {
    const x = concentrate(positions.getX(i));
    const z = concentrate(positions.getZ(i));
    positions.setXYZ(i, x, groundHeight(x, z), z);
  }
  geometry.computeVertexNormals();

  const material = new MeshStandardMaterial({ color: 0x92aace, roughness: 0.92 });
  material.onBeforeCompile = shader => {
    shader.uniforms.treeGlow = glow;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 snowPosition;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nsnowPosition = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 snowPosition;
        uniform float treeGlow;
        float snowHash(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }
        float snowNoise(vec2 p) {
          vec2 f = fract(p), i = floor(p);
          f = f * f * (3. - 2. * f);
          return mix(mix(snowHash(i), snowHash(i + vec2(1.,0.)), f.x),
                     mix(snowHash(i + vec2(0.,1.)), snowHash(i + 1.), f.x), f.y);
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 surface = snowPosition.xz;
        float wind = snowNoise(surface * vec2(.39, 1.9)) * .64 + snowNoise(surface * 3.8) * .36;
        float fine = snowNoise(surface * 32.);
        float radius = length(surface);
        float distanceFade = 1. - smoothstep(8., 25., length(cameraPosition.xz - surface));
        diffuseColor.rgb *= (.73 + .36 * wind + .095 * (fine - .5) * distanceFade);
        diffuseColor.rgb *= .82 + .18 * smoothstep(.2, 2.6, radius);
      `)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        vec2 grit = surface * 35.;
        float grain = snowHash(floor(grit));
        float spark = smoothstep(.984,.9996,grain) * (1. - smoothstep(.07,.31,length(fract(grit)-.5)));
        float sight = pow(.5 + .5 * sin(grain * 433. + length(cameraPosition.xz - surface) * .8), 5.);
        float ring = exp(-pow((radius - 2.55) / 1.33, 2.)) * (.8 + .2 * wind);
        float cabinLight = exp(-pow(length((surface - vec2(${CABIN_X}, ${CABIN_Z + 1.55})) * vec2(1.04,.56)) * .55, 2.));
        totalEmissiveRadiance += vec3(.30,.136,.043) * treeGlow * ring;
        totalEmissiveRadiance += vec3(.13,.066,.026) * cabinLight;
        totalEmissiveRadiance += vec3(.25,.48,.80) * spark * sight * distanceFade * .7;
      `);
  };
  const mesh = new Mesh(geometry, material);
  mesh.receiveShadow = true;
  return { mesh, glow };
}

function mountainRing(random: Random, radius: number, height: number, palette: [number, number, number]): Mesh {
  const samples = 156;
  const phase = random() * TAU;
  const peaks = Array.from({ length: 19 }, () => ({ center: random() * TAU, extent: 0.11 + random() * 0.62, height: 0.3 + random() }));
  const positions = [];
  const colors = [];
  const indices = [];
  const [bottom, shade, summit] = palette.map(hex => new Color(hex));
  for (let i = 0; i <= samples; i++) {
    const angle = i / samples * TAU;
    let jagged = 0;
    for (const peak of peaks) {
      const delta = Math.abs(Math.atan2(Math.sin(angle - peak.center), Math.cos(angle - peak.center)));
      jagged = Math.max(jagged, peak.height * Math.max(0, 1 - delta / peak.extent));
    }
    const altitude = height * (0.23 + 0.68 * jagged + 0.11 * Math.sin(angle * 9 + phase) + 0.028 * Math.sin(angle * 61));
    const aspect = 0.22 + 0.46 * Math.max(0, Math.cos(angle * 13 + phase)) + 0.14 * Math.sin(angle * 43);
    for (let tier = 0; tier < 3; tier++) {
      const depth = radius + (tier - 2) * (2.8 + 3.2 * Math.sin(angle * 14 + phase));
      const y = tier === 0 ? -3.6 : tier === 1 ? altitude * (0.57 + 0.18 * Math.sin(angle * 23)) : altitude;
      const color = tier === 0 ? bottom : tier === 1 ? bottom.clone().lerp(shade, 0.68 + aspect * 0.17) : shade.clone().lerp(summit, aspect);
      positions.push(Math.sin(angle) * depth, y, Math.cos(angle) * depth);
      colors.push(color.r, color.g, color.b);
    }
    if (i === samples) continue;
    const index = i * 3;
    for (let j = 0; j < 2; j++) indices.push(index + j, index + j + 3, index + j + 1, index + j + 1, index + j + 3, index + j + 4);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  return new Mesh(geometry, new MeshBasicMaterial({ vertexColors: true, fog: false, side: DoubleSide }));
}

function forestSpruce(random: Random): BufferGeometry {
  const pieces = [new CylinderGeometry(0.025, 0.057, 0.91, 5).translate(0, 0.45, 0)];
  for (let tier = 0; tier < 8; tier++) {
    const y = 0.105 + tier * 0.104;
    const radius = (1 - y) * (0.19 + random() * 0.056);
    const taper = new ConeGeometry(radius, 0.18 + (1 - y) * 0.17, 8, 2);
    const positions = taper.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const z = positions.getZ(i);
      const angle = Math.atan2(x, z);
      const jitter = 1 + Math.sin(angle * 5 + tier * 0.78) * 0.27 + Math.cos(angle * 9);
      positions.setXYZ(i, x * (0.91 + 0.19 * jitter), positions.getY(i) + 0.021 * Math.sin(4 * angle + tier), z * (0.9 + 0.18 * jitter));
    }
    taper.rotateY(tier * 0.57).translate(Math.sin(tier * 0.4) * 0.027, y + 0.07, 0);
    pieces.push(taper);
  }
  const geometry = mergeGeometries(pieces);
  for (const piece of pieces) piece.dispose();
  return geometry;
}

function createForest(random: Random): Group {
  const forest = new Group();
  const stencil = new Object3D();
  const spruce = forestSpruce(random);
  const base = new Color();
  for (let layer = 0; layer < 3; layer++) {
    const count = [76, 115, 152][layer];
    const mesh = new InstancedMesh(spruce, new MeshBasicMaterial({ color: 0xffffff }), count);
    for (let i = 0; i < count; i++) {
      let angle = (i + random()) / count * TAU;
      let radius = [21, 31, 44][layer] + random() * (layer * 2.3 + 5.4);
      const cabinBearing = Math.atan2(CABIN_X, CABIN_Z);
      if (layer === 0 && Math.abs(angle - cabinBearing) < 0.19) {
        radius += 8;
        angle += 0.045;
      }
      const x = Math.sin(angle) * radius;
      const z = Math.cos(angle) * radius;
      const height = 2.2 + 4.9 * random() ** 1.46 + layer * 0.46;
      const width = height * (0.64 + random() * 0.43);
      stencil.position.set(x, groundHeight(x, z) - 0.16, z);
      stencil.rotation.set(0.035 * (random() - 0.5), random() * TAU, 0.06 * (random() - 0.5));
      stencil.scale.set(width, height, width);
      stencil.updateMatrix();
      mesh.setMatrixAt(i, stencil.matrix);
      base.set([0x142940, 0x1d3550, 0x263d58][layer]).multiplyScalar(0.73 + 0.34 * random());
      mesh.setColorAt(i, base);
    }
    forest.add(mesh);
  }
  return forest;
}

function cabin(): Group {
  const group = new Group();
  group.position.set(CABIN_X, groundHeight(CABIN_X, CABIN_Z) - 0.1, CABIN_Z);
  group.rotation.y = -0.23;
  const wood = new MeshStandardMaterial({ color: 0x453139, roughness: .93 });
  const endWood = new MeshStandardMaterial({ color: 0x5a3e3b, roughness: .96 });
  const trim = new MeshStandardMaterial({ color: 0x30242b, roughness: .85 });
  const snow = new MeshStandardMaterial({ color: 0xa5bad9, roughness: .95 });
  const stone = new MeshStandardMaterial({ color: 0x474757, roughness: .98 });
  const panes = new MeshBasicMaterial({ color: linearColor(0xffbc6b, 2.35) });
  const embers = new MeshBasicMaterial({ color: linearColor(0xffdd9a, 3.1) });
  const batches = new Map<MeshStandardMaterial | MeshBasicMaterial, Mesh[]>();
  const add = (geometry: BufferGeometry, material: MeshStandardMaterial | MeshBasicMaterial, x: number, y: number, z: number) => {
    const mesh = new Mesh(geometry, material);
    mesh.position.set(x, y, z);
    const batch = batches.get(material);
    if (batch) batch.push(mesh);
    else batches.set(material, [mesh]);
    return mesh;
  };
  const box = (w: number, h: number, d: number, material: MeshStandardMaterial | MeshBasicMaterial, x: number, y: number, z: number) =>
    add(new BoxGeometry(w, h, d), material, x, y, z);

  box(3.65, 0.37, 2.84, stone, 0, .12, 0);
  box(3.32, 1.7, 2.55, wood, 0, .99, 0);
  const frontLog = new CylinderGeometry(.086, .086, 3.55, 7).rotateZ(Math.PI / 2);
  const sideLog = new CylinderGeometry(.085, .085, 2.73, 7).rotateX(Math.PI / 2);
  for (let line = 0; line < 10; line++) {
    const y = .29 + line * .156;
    add(frontLog, line % 4 === 0 ? endWood : wood, 0, y, 1.278);
    add(frontLog, wood, 0, y, -1.278);
    for (const sign of [-1, 1]) add(sideLog, line % 3 === 0 ? endWood : wood, sign * 1.66, y + .044, 0);
  }
  for (let line = 0; line < 7; line++) {
    const w = 3.39 * (1 - (line + .43) / 7.5);
    box(w, .182, 2.51, line % 3 === 0 ? endWood : wood, 0, 1.86 + line * .174, 0);
  }
  for (const side of [-1, 1]) {
    box(2.09, .12, 3.11, trim, side * .89, 2.41, 0).rotation.z = -side * .59;
    box(2.12, .15, 3.16, snow, side * .93, 2.51, 0).rotation.z = -side * .59;
    box(.13, .07, 3.13, snow, side * 1.86, 1.95, .016);
  }
  box(.39, 1.1, .41, stone, .87, 2.94, -.57);
  box(.47, .11, .48, trim, .87, 3.52, -.57);
  box(.48, .075, .5, snow, .87, 3.61, -.57);

  const window = (x: number, y: number, width: number, height: number) => {
    box(width + .147, height + .16, .11, trim, x, y, 1.393);
    box(width, height, .037, panes, x, y, 1.458);
    box(width * .72, height * .18, .006, embers, x, y - height * .26, 1.48);
    box(.035, height, .038, endWood, x, y, 1.486);
    box(width, .034, .032, endWood, x, y + .045, 1.49);
    box(width + .22, .073, .27, trim, x, y - height / 2 - .06, 1.47);
    box(width + .23, .047, .26, snow, x, y - height / 2 - .023, 1.49);
  };
  window(-.99, 1.11, .64, .59);
  window(.94, 1.11, .63, .59);
  window(0, 2.38, .32, .40);
  box(.61, 1.26, .13, trim, 0, .94, 1.405);
  box(.46, 1.11, .036, endWood, 0, .94, 1.482);
  box(.20, .23, .04, panes, 0, 1.21, 1.506);
  box(.61, .14, .32, stone, 0, .22, 1.57);
  box(.74, .095, .39, snow, 0, .12, 1.78);
  const sources = new Set<BufferGeometry>();
  for (const [material, parts] of batches) {
    const pieces = parts.map(part => {
      part.updateMatrix();
      sources.add(part.geometry);
      return part.geometry.clone().applyMatrix4(part.matrix);
    });
    group.add(new Mesh(mergeGeometries(pieces), material));
    for (const piece of pieces) piece.dispose();
  }
  for (const geometry of sources) geometry.dispose();
  return group;
}

export function createLandscape(scene: Scene, random: Random) {
  scene.fog = new FogExp2(0x3a5274, 0.0165);
  const ground = createGround();
  const house = cabin();
  const cabinLight = new PointLight(0xffbd7b, 9.5, 7, 2);
  cabinLight.position.set(CABIN_X, house.position.y + 1.2, CABIN_Z + 2.2);
  scene.add(
    ground.mesh,
    mountainRing(random, 90, 14, [0x3d567b, 0x40597e, 0x677e9d]),
    mountainRing(random, 66, 9, [0x324c72, 0x334b70, 0x51688b]),
    createForest(random), house, cabinLight,
  );

  const moonPosition = new Vector3(-8, 13, -17);
  return { groundGlow: ground.glow, moonPosition };
}
