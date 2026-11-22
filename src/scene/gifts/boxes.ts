import {
  AdditiveBlending, BoxGeometry, BufferGeometry, Color, DoubleSide, EdgesGeometry, Float32BufferAttribute,
  Group, LineBasicMaterial, LineSegments, MathUtils, Mesh, MeshBasicMaterial, MeshStandardMaterial,
  SphereGeometry, Sprite, SpriteMaterial, Vector3,
} from 'three';
import type { Texture } from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Random } from '../../core/random';
import type { Gift } from '../../data/gifts';
import { wrappingTexture } from '../../textures/procedural';
import { groundHeight } from '../landscape';
import { GIFT_RING } from '../tree/shape';

const dimensions = {
  cube: [.79, .61, .73],
  flat: [.98, .33, .65],
  tall: [.57, .77, .57],
} as const;
const lanes = [-.80, -.47, -.09, .22, .47, .86];
const radii = [3.72, 3.25, 4.32, 3.27, 4.26, 3.72];
const up = new Vector3(0, 1, 0);
const slotOffsets = [0, .16, -.16, .32, -.32, .51, -.51, .73, -.73];
const lidBearings = [0, -.61, .61, -1.19, 1.19, -1.62, 1.62];

interface Footprint {
  position: Vector3;
  radius: number;
}

function footprint(width: number, depth: number): number {
  return Math.hypot(width + .045, depth + .045) / 2;
}

function isClear(position: Vector3, radius: number, occupied: readonly Footprint[]): boolean {
  return occupied.every(entry =>
    Math.hypot(position.x - entry.position.x, position.z - entry.position.z) >= radius + entry.radius + .055);
}

function ribbonLoop(sign: number, width: number): BufferGeometry {
  const geometry = new BufferGeometry();
  const vertices = [];
  const indices = [];
  for (let i = 0; i <= 22; i++) {
    const t = i / 22;
    const loop = Math.sin(t * Math.PI);
    const x = sign * width * (.035 + .56 * loop);
    const y = width * (.036 + .25 * Math.sin(2 * Math.PI * t) * loop + .27 * loop);
    const z = width * (.14 * Math.sin(2 * Math.PI * t) - sign * loop * .16);
    const twist = .28 + sign * .86 * Math.sin(t * Math.PI);
    for (const edge of [-1, 1]) {
      vertices.push(x, y + edge * Math.sin(twist) * width * .104, z + edge * Math.cos(twist) * width * .104);
    }
    const k = i * 2;
    if (i < 22) indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
  }
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

const markerCore = new SphereGeometry(.032, 12, 8);
const markerMaterial = new MeshBasicMaterial({ color: new Color(0xffcc75).multiplyScalar(2.5) });
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
  private readonly lidBands = new Group();
  private readonly bands: { mesh: Mesh; from: Vector3; direction: Vector3 }[] = [];
  private readonly light = new Group();
  private readonly lightHalo: Sprite;
  private readonly outline: LineSegments<EdgesGeometry, LineBasicMaterial>;
  private readonly lidOffset = new Vector3();

  constructor(readonly data: Gift, anchor: Vector3, bearing: number, scale: number, random: Random, glow: Texture) {
    const [w, h, d] = dimensions[data.box.shape].map(value => value * scale);
    this.anchor = anchor;
    this.height = h;
    this.footprint = footprint(w, d);
    this.root.position.copy(anchor);
    this.root.rotation.y = bearing;
    this.root.add(this.wrap);
    this.wrap.add(this.lid);
    this.openPoint.copy(anchor).y += h + .77;

    const foil = data.box.pattern === 'foil';
    const paper = new MeshStandardMaterial({
      color: new Color(data.box.color), map: wrappingTexture(data.box.pattern, random),
      roughness: foil ? .43 : .74, metalness: foil ? .38 : .065,
    });
    const lining = new MeshStandardMaterial({ color: 0x72543f, roughness: .91 });
    const champagne = new Color(0xc69349).lerp(new Color(0xf4d9a6), random() * .66);
    const satin = new MeshStandardMaterial({ color: champagne, metalness: .55, roughness: .37, side: DoubleSide });
    const panel = (parent: Group, x: number, y: number, z: number, width: number, height: number, depth: number, material: MeshStandardMaterial) => {
      const mesh = new Mesh(new BoxGeometry(width, height, depth), material);
      mesh.position.set(x, y, z);
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };

    const wall = .045;
    panel(this.wrap, 0, .029, 0, w, .058, d, paper);
    panel(this.wrap, 0, .061, 0, w - 2 * wall, .01, d - 2 * wall, lining);
    for (const sign of [-1, 1]) {
      panel(this.wrap, 0, h / 2, sign * (d - wall) / 2, w, h, wall, paper);
      panel(this.wrap, sign * (w - wall) / 2, h / 2, 0, wall, h, d - 2 * wall, paper);
      const strip = .087 * scale;
      const front = panel(this.wrap, 0, h / 2, sign * (d / 2 + .004), strip, h, .007, satin);
      const side = panel(this.wrap, sign * (w / 2 + .004), h / 2, 0, .007, h, strip, satin);
      this.bands.push({ mesh: front, from: front.position.clone(), direction: new Vector3(0, 0, sign) });
      this.bands.push({ mesh: side, from: side.position.clone(), direction: new Vector3(sign, 0, 0) });
    }

    const lidMesh = new Mesh(new RoundedBoxGeometry(w + .036, .105, d + .036, 2, .018), paper);
    lidMesh.receiveShadow = true;
    this.lid.add(lidMesh, this.lidBands, this.bow);
    panel(this.lidBands, 0, .057, 0, w + .04, .008, .092 * scale, satin);
    panel(this.lidBands, 0, .059, 0, .092 * scale, .009, d + .039, satin);
    this.bow.position.y = .061;
    const loopWidth = Math.min(w, d) * .50;
    for (const sign of [-1, 1]) {
      this.bow.add(new Mesh(ribbonLoop(sign, loopWidth), satin));
      const tail = panel(this.bow, sign * loopWidth * .40, .013, loopWidth * .36, .075 * scale, .009, loopWidth * .68, satin);
      tail.rotation.y = sign * .56;
    }
    const knot = new Mesh(new RoundedBoxGeometry(.092 * scale, .061 * scale, .084 * scale, 2, .019), satin);
    knot.position.y = .018;
    this.bow.add(knot);

    const silhouette = new BoxGeometry(w + .043, h + .123, d + .043);
    this.outline = new LineSegments(new EdgesGeometry(silhouette), new LineBasicMaterial({
      color: new Color(0xffca79).multiplyScalar(1.65), transparent: true, opacity: 0,
      blending: AdditiveBlending, depthWrite: false,
    }));
    silhouette.dispose();
    this.outline.position.y = (h + .105) * .5;
    this.wrap.add(this.outline);
    this.hit = new Mesh(new BoxGeometry(w + .045, h + .11, d + .045), hitMaterial);
    this.hit.position.y = (h + .11) * .5;
    this.wrap.add(this.hit);

    this.lightHalo = new Sprite(new SpriteMaterial({
      map: glow, color: 0xffb761, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false,
    }));
    this.lightHalo.scale.setScalar(.62);
    this.light.add(new Mesh(markerCore, markerMaterial), this.lightHalo);
    this.root.add(this.light);
    this.opened = data.opened === true;
    if (this.opened) this.release = this.lidTravel = this.marker = 1;
  }

  setLanding(position: Vector3): void {
    this.lidOffset.copy(position).sub(this.anchor).applyAxisAngle(up, -this.root.rotation.y);
    this.lidOffset.y = groundHeight(position.x, position.z) - this.anchor.y + .089;
    this.update(0, 0, false);
  }

  update(time: number, delta: number, highlighted: boolean): void {
    this.lift = MathUtils.damp(this.lift, highlighted ? 1 : 0, 12, delta);
    this.wrap.position.y = this.lift * .085;
    this.outline.visible = this.lift > .015;
    this.outline.material.opacity = .39 * this.lift;
    this.outline.scale.y = this.lidTravel > .2 ? .91 : 1;
    const sliding = this.release;
    this.bow.visible = this.lidBands.visible = sliding < .995;
    this.bow.scale.setScalar(Math.max(.001, 1 - sliding));
    this.bow.rotation.y = sliding * .75;
    this.lidBands.scale.setScalar(Math.max(.001, 1 - sliding * .86));
    for (const { mesh, from, direction } of this.bands) {
      mesh.visible = sliding < .995;
      mesh.position.copy(from).addScaledVector(direction, .12 * sliding ** 2);
      mesh.position.y *= 1 - .83 * sliding;
      mesh.scale.y = 1 - .92 * sliding;
      mesh.rotation.x = direction.z * sliding * .73;
      mesh.rotation.z = -direction.x * sliding * .73;
    }

    const travel = this.lidTravel;
    const across = MathUtils.smoothstep(travel, .14, .83);
    this.lid.position.set(this.lidOffset.x * across, MathUtils.lerp(this.height + .044, this.lidOffset.y, travel) + .98 * Math.sin(Math.PI * travel), this.lidOffset.z * across);
    this.lid.rotation.set(Math.PI * MathUtils.smoothstep(travel, .19, 1), travel * .25, -.16 * Math.sin(Math.PI * travel));
    this.light.visible = this.marker > .005;
    this.light.position.y = this.height + .22 + .085 * Math.sin(time * 2.05 + this.anchor.x);
    this.light.scale.setScalar(Math.max(.01, this.marker * (.91 + .09 * Math.sin(time * 2.9))));
    this.lightHalo.material.opacity = this.marker * .75;
  }
}

export function createGiftBoxes(data: readonly Gift[], random: Random, glow: Texture): GiftBox[] {
  const occupied: Footprint[] = [];
  const boxes = data.map((gift, i) => {
    const slot = i % lanes.length;
    const angle = lanes[slot] + (i >= lanes.length ? Math.PI : 0) + (random() - .5) * .055;
    const preferredRadius = radii[slot] + (random() - .5) * .13;
    const facing = angle + (random() - .5) * .49;
    const scale = .94 + random() * .13;
    const [w, , d] = dimensions[gift.box.shape];
    const radius = footprint(w * scale, d * scale);
    const position = new Vector3();
    const place = (distance: number, bearing: number) => {
      position.set(Math.sin(bearing) * distance, 0, Math.cos(bearing) * distance);
      return isClear(position, radius, occupied);
    };
    if (!slotOffsets.some(offset => place(MathUtils.clamp(preferredRadius + offset, GIFT_RING.inner, GIFT_RING.outer), angle))) {
      const found = Array.from({ length: 32 }, (_, step) => angle + step * Math.PI / 16)
        .some(bearing => place(GIFT_RING.outer - .06, bearing));
      if (!found) throw new Error('No free space for gift ' + gift.id);
    }
    position.y = groundHeight(position.x, position.z) + .015;
    occupied.push({ position, radius });
    return new GiftBox(gift, position, facing, scale, random, glow);
  });
  for (const box of boxes) {
    const bearing = Math.atan2(box.anchor.x, box.anchor.z);
    const radius = box.footprint;
    const landing = new Vector3();
    for (let distance = radius * 2 + .12; ; distance += .27) {
      const found = lidBearings.some(offset => {
        landing.copy(box.anchor);
        landing.x += Math.sin(bearing + offset) * distance;
        landing.z += Math.cos(bearing + offset) * distance;
        return Math.hypot(landing.x, landing.z) > 3.22 && isClear(landing, radius, occupied);
      });
      if (found) break;
    }
    box.setLanding(landing);
    occupied.push({ position: landing, radius });
  }
  return boxes;
}
