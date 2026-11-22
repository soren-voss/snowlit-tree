import {
  Color, CylinderGeometry, Group, InstancedMesh, MeshPhysicalMaterial, MeshStandardMaterial, Object3D,
  SphereGeometry, TorusGeometry, Vector3,
} from 'three';
import type { Texture } from 'three';
import type { Random } from '../../core/random';
import { TAU, crownRadius, crownSurface } from './shape';

export function createOrnaments(random: Random) {
  const group = new Group();
  const ball = new SphereGeometry(1, 18, 12);
  const cap = new CylinderGeometry(.83, 1, 1, 8);
  const hoop = new TorusGeometry(1, .15, 5, 10);
  const metal = new MeshStandardMaterial({ metalness: .89, roughness: .26, envMapIntensity: 1.1 });
  const glass = new MeshPhysicalMaterial({
    metalness: .35, roughness: .16, ior: 1.49, clearcoat: 1, clearcoatRoughness: .11,
    envMapIntensity: 1.29, specularIntensity: .87,
  });
  const hardware = new MeshStandardMaterial({ color: 0xb88344, metalness: .79, roughness: .31 });
  const count = 106;
  const metallic = new InstancedMesh(ball, metal, Math.ceil(count / 2));
  const blownGlass = new InstancedMesh(ball, glass, Math.floor(count / 2));
  const caps = new InstancedMesh(cap, hardware, count);
  const hooks = new InstancedMesh(hoop, hardware, count);
  const stencil = new Object3D();
  const base = new Vector3();
  const colors = [0xb3243b, 0x74172f, 0xc93639, 0xd89d4d, 0xe8bf79, 0xdcb78c, 0xba7242];
  const color = new Color();
  const goldenAngle = 2.399963;
  for (let i = 0; i < count; i++) {
    const t = i / count;
    const y = 1.34 + t ** 1.31 * 5.78 + (random() - .5) * .5;
    const angle = i * goldenAngle + .21 * random();
    const radius = (.078 + random() ** .85 * .143) * (1 - .36 * t);
    const colorIndex = random() < .59 ? Math.floor(random() * 3) : 3 + Math.floor(random() * 4);
    crownSurface(y, angle, .04 - .245 * random() - .045 * crownRadius(y), base);
    const mesh = i % 2 === 0 ? metallic : blownGlass;
    stencil.position.copy(base);
    stencil.rotation.set((random() - .5) * .24, angle, 0);
    stencil.scale.set(radius, radius * (.95 + random() * .16), radius);
    stencil.updateMatrix();
    mesh.setMatrixAt(Math.floor(i / 2), stencil.matrix);
    color.set(colors[colorIndex]).multiplyScalar(.78 + random() * .32);
    mesh.setColorAt(Math.floor(i / 2), color);

    stencil.position.y += radius * 1.018;
    stencil.rotation.set(0, angle, 0);
    stencil.scale.set(radius * .28, radius * .26, radius * .28);
    stencil.updateMatrix();
    caps.setMatrixAt(i, stencil.matrix);
    stencil.position.y += radius * .25;
    stencil.rotation.y = angle % TAU;
    stencil.scale.setScalar(radius * .15);
    stencil.updateMatrix();
    hooks.setMatrixAt(i, stencil.matrix);
  }
  metallic.castShadow = blownGlass.castShadow = true;
  metallic.receiveShadow = blownGlass.receiveShadow = true;
  group.add(metallic, blownGlass, caps, hooks);
  return {
    group,
    setReflection(texture: Texture) {
      metal.envMap = glass.envMap = hardware.envMap = texture;
    },
    setLight(fraction: number) {
      metal.envMapIntensity = .48 + fraction * 1.55;
      glass.envMapIntensity = .46 + fraction * 1.47;
    },
  };
}
