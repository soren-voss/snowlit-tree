import {
  AdditiveBlending, BufferGeometry, Color, ExtrudeGeometry, Float32BufferAttribute, Group, InstancedMesh, LineBasicMaterial,
  LineSegments, MathUtils, MeshStandardMaterial, Object3D, Path, QuadraticBezierCurve3, Shape, Sprite, SpriteMaterial, Vector3,
} from 'three';
import type { Raycaster, Texture } from 'three';
import { createId, LIMITS } from '../../data/gifts';
import type { Wish } from '../../data/gifts';
import { dissolvable } from './dissolve';
import { TAU } from './shape';
import type { CrownSurface } from './shape';

function hash(text: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return ((h >>> 0) % 100000) / 100000;
}

/** Where a wish hangs is derived from its id, so share links don't need to store positions. */
function spot(id: string): { height: number; angle: number } {
  return { height: 1.7 + hash(id, 7) * 4.6, angle: hash(id, 13) * TAU };
}

function tagGeometry(): ExtrudeGeometry {
  const w = .065, h = .19, shoulder = .145;
  const shape = new Shape();
  shape.moveTo(-w, 0);
  shape.lineTo(w, 0);
  shape.lineTo(w, shoulder);
  shape.lineTo(w * .45, h);
  shape.lineTo(-w * .45, h);
  shape.lineTo(-w, shoulder);
  shape.closePath();
  const hole = new Path();
  hole.absarc(0, h - .022, .011, 0, TAU, true);
  shape.holes.push(hole);
  const geometry = new ExtrudeGeometry(shape, { depth: .006, bevelEnabled: true, bevelThickness: .002, bevelSize: .003, bevelSegments: 1 });
  geometry.translate(0, -h - .045, -.003);
  return geometry;
}

const STRING = .07;

export function createWishes(surface: CrownSurface, glow: Texture) {
  const group = new Group();
  const capacity = LIMITS.wishes;
  const material = new MeshStandardMaterial({ color: 0xe6bb62, metalness: .85, roughness: .32, emissive: 0x8a5a1c, emissiveIntensity: .55 });
  dissolvable(material, 'wish-tag');
  const tags = new InstancedMesh(tagGeometry(), material, capacity);
  tags.count = 0;
  const stringMaterial = new LineBasicMaterial({ color: 0xd8b26a, transparent: true, opacity: .8 });
  dissolvable(stringMaterial, 'wish-string');
  const stringGeometry = new BufferGeometry();
  stringGeometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(capacity * 6), 3));
  const strings = new LineSegments(stringGeometry, stringMaterial);
  strings.frustumCulled = false;
  const cometMaterial = new SpriteMaterial({
    map: glow, color: new Color(1, .78, .45).multiplyScalar(2.4), transparent: true, blending: AdditiveBlending, depthWrite: false,
  });
  group.add(tags, strings);

  let list: Wish[] = [];
  const anchors: Vector3[] = [];
  const appear = new Map<string, number>();
  const stencil = new Object3D();
  const flights: { id: string; curve: QuadraticBezierCurve3; age: number; comet: Sprite; landed?: () => void }[] = [];

  function anchorFor(id: string): Vector3 {
    const { height, angle } = spot(id);
    return surface(height, angle, -.03);
  }

  return {
    group,
    /** Picks an id whose hanging spot faces the camera and keeps clear of the other wishes. */
    createId(cameraPosition: Vector3): string {
      const facing = Math.atan2(cameraPosition.x, cameraPosition.z);
      let best = createId(), bestScore = -Infinity;
      for (let attempt = 0; attempt < 60; attempt++) {
        const id = createId();
        const { height, angle } = spot(id);
        const turn = Math.abs(Math.atan2(Math.sin(angle - facing), Math.cos(angle - facing)));
        const position = surface(height, angle, 0);
        const spacing = Math.min(1.2, ...anchors.map(other => other.distanceTo(position)));
        const score = spacing - Math.max(0, turn - .7) * 2;
        if (score > bestScore) { best = id; bestScore = score; }
      }
      return best;
    },
    set(wishes: readonly Wish[]) {
      list = wishes.slice(0, capacity);
      anchors.length = 0;
      for (const wish of list) anchors.push(anchorFor(wish.id));
      tags.count = list.length;
      for (const id of [...appear.keys()]) if (!list.some(wish => wish.id === id)) appear.delete(id);
    },
    /** Sends a light from `from` to the wish's spot; the tag appears when it lands. */
    launch(id: string, from: Vector3, landed?: () => void) {
      const end = anchorFor(id);
      const control = from.clone().lerp(end, .5);
      control.y += 2.2;
      const comet = new Sprite(cometMaterial);
      comet.renderOrder = 6;
      group.add(comet);
      flights.push({ id, curve: new QuadraticBezierCurve3(from.clone(), control, end), age: 0, comet, landed });
      appear.set(id, 0);
    },
    pick(ray: Raycaster): Wish | undefined {
      if (!list.length) return undefined;
      tags.updateMatrixWorld();
      const hit = ray.intersectObject(tags, false)[0];
      return hit?.instanceId !== undefined ? list[hit.instanceId] : undefined;
    },
    setLight(fraction: number) {
      material.emissiveIntensity = .08 + .47 * fraction;
    },
    anchor(id: string): Vector3 | undefined {
      const index = list.findIndex(wish => wish.id === id);
      return index >= 0 ? anchors[index] : undefined;
    },
    update(time: number, delta: number) {
      for (let i = flights.length - 1; i >= 0; i--) {
        const flight = flights[i];
        flight.age += delta / 1.7;
        const t = Math.min(1, flight.age);
        flight.comet.position.copy(flight.curve.getPoint(MathUtils.smootherstep(t, 0, 1)));
        flight.comet.scale.setScalar(.5 + .25 * Math.sin(time * 20 + i));
        if (t >= 1) {
          appear.set(flight.id, .001);
          group.remove(flight.comet);
          flights.splice(i, 1);
          flight.landed?.();
        }
      }
      const positions = stringGeometry.attributes.position as Float32BufferAttribute;
      list.forEach((wish, i) => {
        let grow = appear.get(wish.id) ?? 1;
        if (grow > 0 && grow < 1) appear.set(wish.id, grow = Math.min(1, grow + delta * 2.2));
        const anchor = anchors[i];
        const sway = Math.sin(time * 1.3 + i * 1.7) * .09;
        stencil.position.copy(anchor);
        stencil.rotation.set(0, Math.atan2(anchor.x, anchor.z), sway);
        const pop = grow === 0 ? .0001 : 1 - (1 - grow) ** 3 + Math.sin(grow * Math.PI) * .25;
        stencil.scale.setScalar(1.75 * pop);
        stencil.updateMatrix();
        tags.setMatrixAt(i, stencil.matrix);
        positions.setXYZ(i * 2, anchor.x, anchor.y + STRING * .2, anchor.z);
        positions.setXYZ(i * 2 + 1, anchor.x - Math.sin(sway) * .078 * pop, anchor.y - .078 * pop, anchor.z);
      });
      tags.instanceMatrix.needsUpdate = true;
      positions.needsUpdate = true;
      stringGeometry.setDrawRange(0, list.length * 2);
      tags.computeBoundingSphere();
    },
  };
}
