import {
  AdditiveBlending, BackSide, BoxGeometry, BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Group, MathUtils,
  Mesh, MeshBasicMaterial, MeshPhysicalMaterial, Quaternion, SphereGeometry, Sprite, SpriteMaterial, Vector3,
} from 'three';
import type { Material, Texture } from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Random } from '../../core/random';
import type { Gift } from '../../data/gifts';
import { crinkleTexture, wrappingTexture } from '../../textures/procedural';
import { groundHeight } from '../landscape';

const dimensions = {
  cube: [.74, .62, .72],
  flat: [.98, .34, .7],
  tall: [.52, .88, .52],
} as const;
const up = new Vector3(0, 1, 0);

/** Gift spots around the tree in order of how prominent they are: [bearing, distance from trunk, scale]. Bearing 0 faces the camera. */
const SLOTS: [number, number, number][] = [
  [.03, 3.32, 1.08], [-.3, 4.02, .98], [.38, 4.02, 1], [-.66, 3.3, 1.02], [.7, 3.32, .96], [1.02, 3.72, 1.04],
  [-1.0, 3.85, 1], [1.4, 3.3, 1], [-1.36, 3.3, 1.04], [1.8, 3.75, .95], [-1.78, 3.7, .98], [2.25, 3.35, 1],
];
/** Non-interactive boxes that dress the sides and back: [bearing, distance, scale, shape, stack-on-previous]. */
const PROPS: [number, number, number, Gift['box']['shape'], boolean][] = [
  [-1.25, 3.2, 1.28, 'cube', false], [-1.25, 3.2, .62, 'cube', true], [1.48, 3.25, 1.12, 'flat', false],
  [1.86, 3.5, .7, 'cube', false], [Math.PI - .35, 3.25, 1.15, 'tall', false], [Math.PI + .45, 3.35, 1.05, 'cube', false],
  [Math.PI + .45, 3.35, .55, 'flat', true], [-2.2, 3.4, .9, 'flat', false],
];
const PROP_STYLE: [string, Gift['box']['pattern']][] = [
  ['#7e1426', 'satin'], ['#efe4cf', 'dot'], ['#1d3b30', 'stripe'], ['#c9a24f', 'foil'],
  ['#24365a', 'dot'], ['#a8323e', 'stripe'], ['#f1e6d2', 'satin'], ['#3b2a4a', 'foil'],
];

function luminance(hex: string): number {
  const c = new Color(hex);
  return .2126 * c.r + .7152 * c.g + .0722 * c.b;
}

function trims(base: string, pattern: Gift['box']['pattern']): { accent: string; ribbon: string } {
  const light = luminance(base) > .35;
  if (pattern === 'foil') return { accent: '#fff2cf', ribbon: light ? '#8e1b2b' : '#efe2c4' };
  return light ? { accent: '#c79a45', ribbon: '#9c1d2e' } : { accent: '#d8b25c', ribbon: '#d6ad57' };
}

/** A flat ribbon band swept along a polyline; `side` gives the direction of the band's width at each point. */
function band(points: Vector3[], sides: Vector3[], width: number): BufferGeometry {
  const positions: number[] = [], indices: number[] = [], uvs: number[] = [];
  points.forEach((point, i) => {
    const half = sides[i].clone().multiplyScalar(width / 2);
    const a = point.clone().sub(half), b = point.clone().add(half);
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
    uvs.push(0, i / (points.length - 1), 1, i / (points.length - 1));
    if (i < points.length - 1) indices.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** One standing bow loop: leaves the knot, arcs up and outward, returns underneath. */
function bowLoop(direction: number, yaw: number, length: number, height: number, width: number, lean: number): BufferGeometry {
  const points: Vector3[] = [], sides: Vector3[] = [];
  const turn = new Quaternion().setFromAxisAngle(up, yaw);
  const tilt = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), lean);
  for (let i = 0; i <= 36; i++) {
    const theta = Math.PI + i / 36 * Math.PI * 2;
    const x = direction * length * .5 * (1 + Math.cos(theta));
    const s = Math.sin(theta);
    const y = (s > 0 ? height : height * .16) * s + height * .08;
    const pinch = 1 - .35 * Math.exp(-((x / length) ** 2) * 30);
    points.push(new Vector3(x, y * pinch, 0).applyQuaternion(tilt).applyQuaternion(turn));
    sides.push(new Vector3(0, 0, 1).applyQuaternion(tilt).applyQuaternion(turn));
  }
  return band(points, sides, width);
}

function bowTail(yaw: number, reach: number, drop: number, width: number): BufferGeometry {
  const points: Vector3[] = [], sides: Vector3[] = [];
  const heading = new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const side = new Vector3().crossVectors(up, heading).normalize();
  for (let i = 0; i <= 12; i++) {
    const s = i / 12;
    const flat = Math.min(s / .7, 1);
    const fall = Math.max(0, (s - .7) / .3);
    points.push(heading.clone().multiplyScalar(reach * flat + .02 * fall).add(new Vector3(0, .012 - drop * fall * fall + .01 * Math.sin(s * 9), 0)));
    sides.push(side.clone().applyAxisAngle(heading, .25 * Math.sin(s * 5)));
  }
  return band(points, sides, width);
}

/** Drops the +Y face of a BoxGeometry so the box is open at the top. */
function openBox(geometry: BufferGeometry): BufferGeometry {
  const top = geometry.groups[2];
  const index = Array.from(geometry.index!.array);
  index.splice(top.start, top.count);
  geometry.setIndex(index);
  geometry.clearGroups();
  return geometry;
}

/** Merges parts that share one material (position/normal/uv); mixed indexed inputs are flattened. */
function merge(parts: BufferGeometry[]): BufferGeometry {
  const mixed = parts.some(part => !part.index);
  const merged = mergeGeometries(mixed ? parts.map(part => part.index ? part.toNonIndexed() : part) : parts);
  for (const part of parts) part.dispose();
  return merged;
}

function scaledUv(geometry: BufferGeometry, scale: number): BufferGeometry {
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * scale, uv.getY(i) * scale);
  return geometry;
}

const glowCore = new SphereGeometry(.03, 12, 8);
const glowCoreMaterial = new MeshBasicMaterial({ color: new Color(1, .78, .45).multiplyScalar(3) });
const hitMaterial = new MeshBasicMaterial({ visible: false });

export class GiftBox {
  readonly root = new Group();
  readonly wrap = new Group();
  readonly lid = new Group();
  readonly hit: Mesh;
  readonly openPoint = new Vector3();
  readonly height: number;
  readonly footprint: number;
  readonly anchor: Vector3;
  opened: boolean;
  release = 0;
  lidTravel = 0;
  marker = 0;
  private lift = 0;
  private readonly bow = new Group();
  private readonly bodyStraps: Mesh;
  private readonly lidStraps: Mesh;
  private readonly light = new Group();
  private readonly lightHalo: Sprite;
  private readonly innerGlow: Mesh<BufferGeometry, MeshBasicMaterial>;
  private readonly paper: MeshPhysicalMaterial;
  private readonly lidOffset = new Vector3(0, 0, 1);
  private readonly flipAxis = new Vector3(1, 0, 0);
  private readonly spin = new Quaternion();
  private readonly baseYaw = new Quaternion();

  constructor(public data: Gift, anchor: Vector3, bearing: number, scale: number, random: Random, glow: Texture, crinkle: Texture) {
    const [w, h, d] = dimensions[data.box.shape].map(value => value * scale);
    this.anchor = anchor;
    this.height = h;
    this.footprint = Math.hypot(w + .05, d + .05) / 2;
    this.root.position.copy(anchor);
    this.root.rotation.y = bearing;
    this.root.add(this.wrap);
    this.wrap.add(this.lid);
    this.openPoint.copy(anchor).y += h + .9;

    const { accent, ribbon } = trims(data.box.color, data.box.pattern);
    const foil = data.box.pattern === 'foil';
    const map = wrappingTexture(data.box.pattern, data.box.color, accent, random);
    this.paper = new MeshPhysicalMaterial({
      map, bumpMap: crinkle, bumpScale: foil ? .6 : .25,
      roughness: foil ? .32 : .55, metalness: foil ? .75 : 0, clearcoat: foil ? 0 : .25, clearcoatRoughness: .5,
    });
    const lining = new MeshPhysicalMaterial({ color: 0xe9dcc4, roughness: .85, side: BackSide });
    const satin = new MeshPhysicalMaterial({
      color: ribbon, roughness: .3, metalness: .15, sheen: 1, sheenRoughness: .35, sheenColor: new Color(ribbon).lerp(new Color(1, 1, 1), .5),
      side: DoubleSide, clearcoat: .3,
    });
    const wall = .02;
    const outer = openBox(scaledUv(new BoxGeometry(w, h, d), 1.6 * scale));
    outer.translate(0, h / 2, 0);
    const body = new Mesh(outer, this.paper);
    body.castShadow = body.receiveShadow = true;
    const liner = openBox(new BoxGeometry(w - 2 * wall, h - wall, d - 2 * wall));
    liner.translate(0, wall + (h - wall) / 2, 0);
    const inside = new Mesh(liner, lining);
    inside.receiveShadow = true;
    this.wrap.add(body, inside);

    this.innerGlow = new Mesh(new BoxGeometry(w - 2 * wall - .01, .002, d - 2 * wall - .01), new MeshBasicMaterial({
      color: new Color(1, .7, .35).multiplyScalar(2.2), transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false,
    }));
    this.innerGlow.position.y = wall + .004;
    this.wrap.add(this.innerGlow);

    const ribbonWidth = Math.min(w, d) * .17;
    const slab = (width: number, height: number, depth: number, x: number, y: number, z: number) =>
      new BoxGeometry(width, height, depth).translate(x, y, z);
    const straps: BufferGeometry[] = [];
    for (const sign of [-1, 1]) {
      straps.push(slab(ribbonWidth, h - .01, .006, 0, (h - .01) / 2, sign * (d / 2 + .004)));
      straps.push(slab(.006, h - .01, ribbonWidth, sign * (w / 2 + .004), (h - .01) / 2, 0));
    }
    this.bodyStraps = new Mesh(merge(straps), satin);
    this.bodyStraps.castShadow = true;
    this.wrap.add(this.bodyStraps);

    const lidHeight = Math.min(.13, h * .2);
    const lidMesh = new Mesh(scaledUv(new RoundedBoxGeometry(w + .03, lidHeight, d + .03, 3, .012), 1.6 * scale), this.paper);
    lidMesh.position.y = lidHeight / 2;
    lidMesh.castShadow = lidMesh.receiveShadow = true;
    this.lidStraps = new Mesh(merge([
      slab(w + .036, lidHeight + .006, ribbonWidth, 0, 0, 0),
      slab(ribbonWidth, lidHeight + .006, d + .036, 0, 0, 0),
    ]), satin);
    this.lidStraps.position.y = lidHeight / 2;
    this.lid.add(lidMesh, this.lidStraps, this.bow);

    this.bow.position.y = lidHeight + .004;
    const loop = Math.min(w, d) * .36;
    const bowWidth = ribbonWidth * 1.05;
    const lean = (random() - .5) * .3;
    const bowParts: BufferGeometry[] = [];
    for (const sign of [-1, 1]) {
      bowParts.push(bowLoop(sign, 0, loop, loop * .62, bowWidth, sign * .32 + lean));
      bowParts.push(bowLoop(sign, Math.PI / 2, loop * .78, loop * .5, bowWidth * .9, sign * .5 - lean));
      bowParts.push(bowTail(Math.PI / 4 + (sign > 0 ? 0 : Math.PI) + (random() - .5) * .4, Math.min(w, d) * .55, .12, bowWidth * .9));
    }
    bowParts.push(new RoundedBoxGeometry(bowWidth * 1.15, bowWidth * .7, bowWidth * 1.15, 2, bowWidth * .25).translate(0, bowWidth * .3, 0));
    const bowMesh = new Mesh(merge(bowParts), satin);
    bowMesh.castShadow = true;
    this.bow.add(bowMesh);

    this.hit = new Mesh(new BoxGeometry(w + .06, h + lidHeight + loop * .7, d + .06), hitMaterial);
    this.hit.position.y = (h + lidHeight + loop * .7) / 2;
    this.wrap.add(this.hit);

    this.lightHalo = new Sprite(new SpriteMaterial({
      map: glow, color: new Color(1, .72, .4).multiplyScalar(1.6), transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false,
    }));
    this.lightHalo.scale.setScalar(.7);
    this.light.add(new Mesh(glowCore, glowCoreMaterial), this.lightHalo);
    this.root.add(this.light);
    this.opened = data.opened === true;
    if (this.opened) this.release = this.lidTravel = this.marker = 1;
    this.update(0, 0, false);
  }

  dispose(): void {
    this.root.traverse(node => {
      const { geometry, material } = node as Partial<Mesh>;
      if (geometry && !(node instanceof Sprite) && geometry !== glowCore) geometry.dispose();
      if (material && material !== glowCoreMaterial && material !== hitMaterial) (material as Material).dispose();
    });
    this.paper.map?.dispose();
  }

  /** Where the lid lands on the snow, in world space; the lid flips toward it. */
  setLanding(position: Vector3): void {
    this.lidOffset.copy(position).sub(this.anchor).applyAxisAngle(up, -this.root.rotation.y);
    this.lidOffset.y = groundHeight(position.x, position.z) - this.anchor.y + .01;
    const flat = new Vector3(this.lidOffset.x, 0, this.lidOffset.z).normalize();
    this.flipAxis.crossVectors(up, flat).normalize();
    this.baseYaw.setFromAxisAngle(up, Math.atan2(flat.x, flat.z) * .25);
    this.update(0, 0, false);
  }

  update(time: number, delta: number, highlighted: boolean): void {
    this.lift = MathUtils.damp(this.lift, highlighted ? 1 : 0, 12, delta);
    this.wrap.position.y = this.lift * .07;
    this.paper.emissive.setRGB(1, .6, .3).multiplyScalar(.12 * this.lift);

    const loosen = this.release;
    this.bow.visible = loosen < .995;
    this.bow.scale.setScalar(Math.max(.001, 1 - loosen * .9));
    this.bow.rotation.y = loosen * .9;
    this.bow.position.x = loosen * .05;
    this.lidStraps.visible = loosen < .995;
    this.lidStraps.scale.setScalar(Math.max(.001, 1 - loosen * .6));
    this.bodyStraps.visible = loosen < .995;
    this.bodyStraps.scale.y = Math.max(.001, 1 - loosen);

    const travel = this.lidTravel;
    const across = MathUtils.smoothstep(travel, .12, .9);
    const lidRest = this.height - .002;
    this.lid.position.set(
      this.lidOffset.x * across,
      MathUtils.lerp(lidRest, this.lidOffset.y, across) + .55 * Math.sin(Math.PI * Math.min(1, travel * 1.1)),
      this.lidOffset.z * across,
    );
    this.spin.setFromAxisAngle(this.flipAxis, Math.PI * .92 * MathUtils.smoothstep(travel, .15, 1));
    this.lid.quaternion.copy(this.spin).multiply(this.baseYaw.clone().slerp(new Quaternion(), 1 - travel));

    const shine = MathUtils.smoothstep(this.lidTravel, .1, .6);
    this.innerGlow.material.opacity = shine * (.55 + .2 * this.marker);
    this.innerGlow.visible = shine > .01;
    this.light.visible = this.marker > .005;
    this.light.position.y = this.height + .28 + .07 * Math.sin(time * 1.8 + this.anchor.x);
    this.light.scale.setScalar(Math.max(.01, this.marker * (.92 + .08 * Math.sin(time * 2.6))));
    this.lightHalo.material.opacity = this.marker * .85;
  }
}

interface Footprint {
  position: Vector3;
  radius: number;
}

function clear(position: Vector3, radius: number, occupied: readonly Footprint[]): boolean {
  return occupied.every(entry => Math.hypot(position.x - entry.position.x, position.z - entry.position.z) >= radius + entry.radius + .04);
}

export function createGiftBoxes(data: readonly Gift[], random: Random, glow: Texture) {
  const crinkle = crinkleTexture(random);
  const occupied: Footprint[] = [];
  const slots = SLOTS.slice(0, Math.min(data.length, SLOTS.length)).sort((a, b) => a[0] - b[0]);
  const boxes = data.slice(0, SLOTS.length).map((gift, i) => {
    const [bearing, distance, size] = slots[i];
    const angle = bearing + (random() - .5) * .05;
    const [w, , d] = dimensions[gift.box.shape];
    const radius = Math.hypot(w * size + .05, d * size + .05) / 2;
    const position = new Vector3();
    for (let push = 0; push < 3; push += .08) {
      position.set(Math.sin(angle) * (distance + push), 0, Math.cos(angle) * (distance + push));
      if (clear(position, radius, occupied)) break;
    }
    position.y = groundHeight(position.x, position.z) + .005;
    occupied.push({ position, radius });
    return new GiftBox(gift, position, angle + (random() - .5) * .7, size * (.97 + .06 * random()), random, glow, crinkle);
  });

  const props = new Group();
  const decor: GiftBox[] = [];
  let below: GiftBox | undefined;
  PROPS.forEach(([bearing, distance, size, shape, stacked], i) => {
    const [color, pattern] = PROP_STYLE[i % PROP_STYLE.length];
    const gift: Gift = { id: `prop-${i}`, name: '', message: '', image: { kind: 'none' }, box: { color, pattern, shape } };
    const position = new Vector3(Math.sin(bearing) * distance, 0, Math.cos(bearing) * distance);
    const [w, , d] = dimensions[shape];
    if (stacked ? !below : !clear(position, Math.hypot(w * size + .05, d * size + .05) / 2, occupied)) {
      if (!stacked) below = undefined;
      return;
    }
    position.y = stacked && below ? below.anchor.y + below.height + Math.min(.13, below.height * .2) : groundHeight(position.x, position.z) + .005;
    const box = new GiftBox(gift, position, bearing + (random() - .5) * 1.2, size, random, glow, crinkle);
    if (!stacked) occupied.push({ position, radius: box.footprint });
    props.add(box.root);
    decor.push(box);
    below = stacked ? undefined : box;
  });

  for (const box of boxes) {
    const outward = Math.atan2(box.anchor.x, box.anchor.z);
    const landing = new Vector3();
    let placed = false;
    for (let distance = box.footprint * 1.9 + .1; !placed && distance < 3; distance += .15) {
      for (const offset of [1.7, -1.7, 2.2, -2.2, 1.25, -1.25]) {
        landing.set(box.anchor.x + Math.sin(outward + offset) * distance, 0, box.anchor.z + Math.cos(outward + offset) * distance);
        if (Math.hypot(landing.x, landing.z) > 2.9 && clear(landing, box.footprint * .9, occupied)) {
          placed = true;
          break;
        }
      }
    }
    box.setLanding(landing);
    occupied.push({ position: landing.clone(), radius: box.footprint * .9 });
  }
  return {
    boxes,
    props,
    dispose() {
      for (const box of [...boxes, ...decor]) box.dispose();
      crinkle.dispose();
    },
  };
}
