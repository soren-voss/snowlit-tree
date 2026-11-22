import {
  Color, CylinderGeometry, Group, InstancedMesh, MeshPhysicalMaterial, MeshStandardMaterial, Object3D,
  SphereGeometry, TorusGeometry, Vector3,
} from 'three';
import type { Texture } from 'three';
import type { Random } from '../../core/random';
import type { Theme } from '../theme';
import { dissolvable } from './dissolve';
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
    { material: mirror, palette: 'mirror' as const, share: .56 },
    { material: satin, palette: 'satin' as const, share: .34 },
    { material: pearl, palette: 'pearl' as const, share: .1 },
  ];
  const count = 128;
  const stencil = new Object3D();
  const spot = new Vector3();
  const tint = new Color();
  const plan = finishes.map(finish => ({ ...finish, items: [] as { position: Vector3; radius: number; roll: number; brightness: number }[], mesh: undefined as InstancedMesh | undefined }));
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
    finish.items.push({ position: spot.clone(), radius, roll: random(), brightness: 1 });
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
      item.brightness = .9 + .15 * random();

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
    finish.mesh = mesh;
    group.add(mesh);
  }
  group.add(caps, hooks);
  const materials = [mirror, satin, pearl, hardware];
  materials.forEach((material, i) => dissolvable(material, `ornament-${i}`));
  return {
    group,
    setReflection(texture: Texture) {
      for (const material of materials) material.envMap = texture;
    },
    setTheme(theme: Theme) {
      hardware.color.set(theme.hardware);
      for (const finish of plan) {
        const colors = theme[finish.palette];
        finish.items.forEach((item, i) => finish.mesh!.setColorAt(i, tint.set(colors[Math.floor(item.roll * colors.length)]).multiplyScalar(item.brightness)));
        if (finish.mesh?.instanceColor) finish.mesh.instanceColor.needsUpdate = true;
      }
    },
    setShadows(enabled: boolean) {
      for (const finish of plan) if (finish.mesh) finish.mesh.castShadow = enabled;
    },
    setLight(fraction: number) {
      mirror.envMapIntensity = .18 + fraction * 1.5;
      satin.envMapIntensity = .15 + fraction * 1.1;
      pearl.envMapIntensity = .15 + fraction * 1.0;
      hardware.envMapIntensity = .15 + fraction * .9;
    },
  };
}
