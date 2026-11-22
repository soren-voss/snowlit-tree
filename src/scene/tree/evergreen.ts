import {
  BufferGeometry, Color, CylinderGeometry, DoubleSide, Float32BufferAttribute, Group, IcosahedronGeometry,
  InstancedMesh, MathUtils, Matrix4, Mesh, MeshStandardMaterial, Object3D, Texture, Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Random } from '../../core/random';
import { groundHeight } from '../landscape';
import { CROWN_BASE, TAU, TREE_TOP, crownCenter, crownRadius, measureCrown } from './shape';

interface Foliage {
  matrix: Matrix4;
  color: Color;
  priority: number;
}

interface Branch {
  origin: Vector3;
  angle: number;
  radius: number;
  bend: number;
  droop: number;
  skirt: number;
}

function branchPoint(branch: Branch, along: number): Vector3 {
  const bearing = branch.angle + branch.bend * along;
  const distance = branch.radius * along;
  const x = branch.origin.x + Math.sin(bearing) * distance;
  const z = branch.origin.z + Math.cos(bearing) * distance;
  const y = branch.origin.y - branch.droop * Math.sin(along * 2.49)
    + branch.radius * along ** 5 * .062 - branch.skirt * along ** 1.62;
  return new Vector3(x, Math.max(y, groundHeight(x, z) + .34), z);
}

const cardPositions = [
  -.33, 0, 0, .33, 0, 0, -.50, .48, .055, .50, .48, .055, -.40, 1, .13, .40, 1, .13,
];

function needleCard(): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(cardPositions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute([0, 0, 1, 0, 0, .48, 1, .48, 0, 1, 1, 1], 2));
  geometry.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4, 3, 5, 4]);
  geometry.computeVertexNormals();
  return geometry;
}

function snowPatch(): BufferGeometry {
  const geometry = new IcosahedronGeometry(1, 3);
  const points = geometry.attributes.position;
  for (let i = 0; i < points.count; i++) {
    const x = points.getX(i);
    const y = points.getY(i);
    const z = points.getZ(i);
    const lobes = 1 + .12 * Math.sin(x * 7 + z * 2 + 1) + .082 * Math.cos(z * 11 - x * 4);
    points.setXYZ(i, x * lobes, y * (y < 0 ? .44 : lobes) + .057 * Math.sin(z * 9 + x * 2), z * lobes);
  }
  geometry.computeVertexNormals();
  return geometry;
}

export function createEvergreen(texture: Texture, barkTexture: Texture, random: Random) {
  const group = new Group();
  const foliage: Foliage[] = [];
  const patches: Foliage[] = [];
  const wood: BufferGeometry[] = [];
  const boundary: Vector3[] = [];
  const standIn = new Object3D();
  const upright = new Vector3(0, 1, 0);
  const right = new Vector3();
  const normal = new Vector3();
  const axis = new Vector3();
  const corner = new Vector3();
  const basis = new Matrix4();
  const greenInside = new Color('#1F4D3A');
  const greenTips = new Color('#3E7A5C');
  const frost = new Color('#79A294');
  const lightSnow = new Color('#AEBFD4');
  const localLight = { value: 0 };

  function fan(start: Vector3, angle: number, rise: number, length: number, spread: number, tint: number, detail: boolean) {
    axis.set(Math.sin(angle), rise, Math.cos(angle)).normalize();
    right.crossVectors(axis, upright).normalize();
    normal.crossVectors(right, axis);
    basis.makeBasis(right, axis, normal);
    standIn.quaternion.setFromRotationMatrix(basis);
    standIn.rotateY((random() - 0.5) * (detail ? 2.2 : 1.12));
    standIn.position.copy(start);
    standIn.scale.set(spread, length, length);
    standIn.updateMatrix();
    if (start.y < .92) {
      let raise = 0;
      for (let i = 0; i < cardPositions.length; i += 3) {
        corner.fromArray(cardPositions, i).applyMatrix4(standIn.matrix);
        raise = Math.max(raise, groundHeight(corner.x, corner.z) + .30 - corner.y);
      }
      standIn.position.y += raise;
      standIn.updateMatrix();
    }
    const color = greenInside.clone().lerp(greenTips, tint)
      .lerp(frost, tint ** 6 * (random() < .13 ? .34 : .045))
      .multiplyScalar(.82 + .36 * random());
    foliage.push({ matrix: standIn.matrix.clone(), color, priority: detail ? .56 + random() * .44 : random() * .5 });
    if (!detail) {
      for (const y of [.28, .49, .68, .85, .99]) {
        const z = y * .125;
        boundary.push(new Vector3(0, y, z).applyMatrix4(standIn.matrix));
        const width = .29 * Math.sin(Math.PI * y ** .75);
        boundary.push(new Vector3(width, y, z).applyMatrix4(standIn.matrix), new Vector3(-width, y, z).applyMatrix4(standIn.matrix));
      }
    }
  }

  function cap(location: Vector3, bearing: number, length: number, width: number, height: number, rooted = false) {
    standIn.position.copy(location);
    standIn.rotation.set((random() - .5) * .45, bearing, (random() - .5) * .28, 'YXZ');
    standIn.scale.set(width, height, length);
    standIn.updateMatrix();
    patches.push({ matrix: standIn.matrix.clone(), color: lightSnow.clone().multiplyScalar(.72 + random() * .28), priority: rooted ? -1 : random() });
  }

  function twig(start: Vector3, end: Vector3, radius: number, taper: number) {
    axis.subVectors(end, start);
    const piece = new CylinderGeometry(radius * taper, radius, axis.length(), 7);
    standIn.quaternion.setFromUnitVectors(upright, axis.normalize());
    standIn.position.copy(start).lerp(end, .5);
    standIn.scale.setScalar(1);
    standIn.updateMatrix();
    wood.push(piece.applyMatrix4(standIn.matrix));
  }

  const trunkSegments = 12;
  for (let i = 0; i < trunkSegments; i++) {
    const a = (i / trunkSegments) * TREE_TOP;
    const b = ((i + 1) / trunkSegments) * TREE_TOP + .006;
    const radius = .024 + .27 * (1 - a / TREE_TOP) ** 1.35;
    twig(crownCenter(a - .065, new Vector3()), crownCenter(b, new Vector3()), radius, i === trunkSegments - 1 ? .26 : .89);
  }

  twig(new Vector3(0, -.09, 0), new Vector3(0, .34, 0), .44, .58);
  for (let i = 0; i < 11; i++) {
    const angle = i / 11 * TAU + random() * .2;
    const radius = .31 + random() * .26;
    const x = Math.sin(angle) * radius, z = Math.cos(angle) * radius;
    cap(new Vector3(x, groundHeight(x, z) + .013, z), angle, .20 + random() * .16, .18 + random() * .15, .095 + random() * .1, true);
  }
  for (let layer = 0; layer < 26; layer++) {
    const t = layer / 25;
    const nominalY = CROWN_BASE + .42 + t * (TREE_TOP - CROWN_BASE - .54);
    const branchCount = Math.round(8 + 6 * (1 - t) + random() * 1.7);
    const startAngle = layer * 2.4 + random() * .37;
    for (let j = 0; j < branchCount; j++) {
      const angle = startAngle + (j + .86 * (random() - .5)) / branchCount * TAU;
      const y = nominalY + (random() - .5) * (.25 - .15 * t) + Math.sin(angle * 3 + layer) * .067;
      const length = crownRadius(y - .27) * (.77 + random() * .15) * (1 + .054 * Math.sin(angle * 3 + y));
      const branch: Branch = {
        origin: crownCenter(y, new Vector3()), angle, radius: length,
        bend: (random() - .5) * .26, droop: length * (.075 + random() * .115),
        skirt: .48 * (1 - MathUtils.smoothstep(t, 0, .17)),
      };
      if (length > .64) {
        twig(branch.origin, branchPoint(branch, .50), length * .034, .60);
        twig(branchPoint(branch, .50), branchPoint(branch, .93), length * .021, .10);
      }

      const richest = Math.round(4 + 4 * (1 - t));
      for (let i = 0; i < richest; i++) {
        const s = .20 + .75 * i / (richest - 1);
        const root = branchPoint(branch, s);
        const bearing = angle + branch.bend * s;
        const size = Math.max(.20, (.46 - .19 * s) * length + .09);
        const tint = MathUtils.clamp(s * .85 + (random() - .5) * .16 + t * .11, 0, 1);
        fan(root, bearing, .25 + .15 * random(), size, size * (.59 + .25 * random()), tint, false);
        fan(root, bearing + .16, -.20 + .19 * random(), size * .79, size * .52, tint, true);
        for (const side of [-1, 1]) {
          const offset = .68 + .39 * random() + .19 * (1 - s);
          const fanLength = size * (.82 + .65 * random());
          fan(root, bearing + side * offset, (random() - .5) * .34, fanLength, fanLength * (.52 + .28 * random()), tint, false);
          fan(root, bearing + side * (.28 + offset), .29 + random() * .29, fanLength * .66, fanLength * .50, tint * .88, true);
        }
        const dusting = .12 + .12 * Math.sin(2 * angle + y * .92) ** 2;
        if (s > .61 && random() < dusting) {
          const p = root.clone();
          p.x += .08 * Math.sin(bearing);
          p.z += .08 * Math.cos(bearing);
          p.y += .045 + size * .13;
          cap(p, bearing + (random() - .5) * .66, size * (.21 + .23 * random()), size * (.12 + .14 * random()), size * (.055 + .064 * random()));
        }
      }
      const tip = branchPoint(branch, .96);
      const size = Math.max(.18, length * .24);
      fan(tip, angle + branch.bend, .44 + random() * .27, size, size * .61, .95, false);
      fan(tip, angle + branch.bend + .36, .23, size * .8, size * .53, .92, true);
    }
  }
  for (let i = 0; i < 16; i++) {
    const y = TREE_TOP - .69 + i * .038;
    fan(crownCenter(y, new Vector3()), 2.4 * i, 2.5 + random(), .20 + random() * .35, .11 + random() * .08, .8, false);
  }

  const branchGeometry = mergeGeometries(wood);
  for (const piece of wood) piece.dispose();
  const bark = new Mesh(branchGeometry, new MeshStandardMaterial({
    color: 0x574235, map: barkTexture, bumpMap: barkTexture, bumpScale: .033, roughness: 1,
  }));
  bark.castShadow = true;
  bark.receiveShadow = true;

  const needles = new MeshStandardMaterial({ color: 0xffffff, map: texture, roughness: 1, side: DoubleSide, alphaTest: .34 });
  needles.onBeforeCompile = shader => {
    shader.uniforms.crownLight = localLight;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 sprayWorld;\nvarying vec3 sprayNormal;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        sprayWorld = (instanceMatrix * vec4(transformed, 1.)).xyz;
        sprayNormal = normalMatrix * normalize(vec3(sprayWorld.x, 1.35, sprayWorld.z));`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 sprayWorld;\nvarying vec3 sprayNormal;\nuniform float crownLight;')
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
        normal = normalize(sprayNormal);
        nonPerturbedNormal = normal;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float fill = 1. - smoothstep(0., 8.3, sprayWorld.y);
        totalEmissiveRadiance += diffuseColor.rgb * vec3(.28, .34, .25) * fill * crownLight;`);
  };

  function instances(items: Foliage[], geometry: BufferGeometry, material: MeshStandardMaterial): InstancedMesh {
    items.sort((a, b) => a.priority - b.priority);
    const mesh = new InstancedMesh(geometry, material, items.length);
    for (const [index, item] of items.entries()) {
      mesh.setMatrixAt(index, item.matrix);
      mesh.setColorAt(index, item.color);
    }
    mesh.computeBoundingSphere();
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  const sprays = instances(foliage, needleCard(), needles);
  const snow = instances(patches, snowPatch(), new MeshStandardMaterial({ roughness: .89 }));
  group.add(bark, sprays, snow);
  return {
    group,
    localLight,
    surface: measureCrown(boundary),
    setDensity(fraction: number) {
      sprays.count = Math.round(foliage.length * fraction);
      snow.count = Math.ceil(patches.length * MathUtils.lerp(.42, 1, fraction));
    },
  };
}
