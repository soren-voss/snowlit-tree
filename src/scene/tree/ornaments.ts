import {
  Color, CylinderGeometry, Group, InstancedMesh, MeshPhysicalMaterial, MeshStandardMaterial, Object3D,
  SphereGeometry, TorusGeometry, Vector3,
} from 'three';
import type { Texture } from 'three';
import type { Random } from '../../core/random';
import { CROWN_BASE, TREE_TOP } from './shape';
import type { CrownSurface } from './shape';

/** Baubles hung just inside the outer sprays: mirror glass, satin and pearl finishes in a red–gold–champagne palette. */
export function createOrnaments(random: Random, surface: CrownSurface) {
  const group = new Group();
  const ball = new SphereGeometry(1, 32, 20);
  const cap = new CylinderGeometry(.62, .7, 1, 14);
  const hoop = new TorusGeometry(1, .16, 6, 14);
  const mirror = new MeshPhysicalMaterial({ metalness: 1, roughness: .12, clearcoat: .6, clearcoatRoughness: .08 });
  const satin = new MeshPhysicalMaterial({ metalness: .55, roughness: .42, sheen: .6, sheenRoughness: .5, sheenColor: new Color(1, .85, .7) });
  const pearl = new MeshPhysicalMaterial({ metalness: .05, roughness: .3, clearcoat: 1, clearcoatRoughness: .15, iridescence: .45 });
  const hardware = new MeshStandardMaterial({ color: 0xc9a25a, metalness: 1, roughness: .3 });
  const finishes = [
    { material: mirror, colors: [0x9e1a2c, 0xc0283a, 0xd8a64c, 0xe9cf98, 0x7e1426], share: .56 },
    { material: satin, colors: [0x8c1b2b, 0xb0263a, 0xc69244, 0xd9be8c], share: .34 },
    { material: pearl, colors: [0xe8d2a8, 0xd4b483], share: .1 },
  ];
  const count = 128;
  const stencil = new Object3D();
  const spot = new Vector3();
  const tint = new Color();
  const plan = finishes.map(finish => ({ ...finish, items: [] as { position: Vector3; radius: number; color: number }[] }));
  const golden = 2.399963;
  for (let i = 0; i < count; i++) {
    const t = (i + random() * .6) / count;
    const y = CROWN_BASE + .55 + t ** 1.08 * (TREE_TOP - CROWN_BASE - 1.55);
    const angle = i * golden + (random() - .5) * .4;
    const radius = (.075 + random() ** 1.4 * .1) * (1 - .38 * t);
    surface(y, angle, radius * (.55 + .9 * random()), spot);
    spot.y -= radius * .6;
    const roll = random();
    let index = 0;
    for (let acc = plan[0].share; roll > acc && index < plan.length - 1; acc += plan[++index].share);
    const finish = plan[index];
    finish.items.push({ position: spot.clone(), radius, color: finish.colors[Math.floor(random() * finish.colors.length)] });
  }

  const caps = new InstancedMesh(cap, hardware, count);
  const hooks = new InstancedMesh(hoop, hardware, count);
  let fitting = 0;
  for (const finish of plan) {
    const mesh = new InstancedMesh(ball, finish.material, finish.items.length);
    finish.items.forEach((item, i) => {
      stencil.position.copy(item.position);
      stencil.rotation.set(0, random() * Math.PI * 2, 0);
      stencil.scale.setScalar(item.radius);
      stencil.updateMatrix();
      mesh.setMatrixAt(i, stencil.matrix);
      mesh.setColorAt(i, tint.set(item.color).multiplyScalar(.9 + .15 * random()));

      stencil.position.y += item.radius * 1.02;
      stencil.scale.set(item.radius * .26, item.radius * .2, item.radius * .26);
      stencil.updateMatrix();
      caps.setMatrixAt(fitting, stencil.matrix);
      stencil.position.y += item.radius * .16;
      stencil.rotation.set(0, stencil.rotation.y, 0);
      stencil.scale.setScalar(item.radius * .1);
      stencil.updateMatrix();
      hooks.setMatrixAt(fitting++, stencil.matrix);
    });
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }
  group.add(caps, hooks);
  const materials = [mirror, satin, pearl, hardware];
  return {
    group,
    setReflection(texture: Texture) {
      for (const material of materials) material.envMap = texture;
    },
    setLight(fraction: number) {
      mirror.envMapIntensity = .18 + fraction * 1.5;
      satin.envMapIntensity = .15 + fraction * 1.1;
      pearl.envMapIntensity = .15 + fraction * 1.0;
      hardware.envMapIntensity = .15 + fraction * .9;
    },
  };
}
