import {
  AdditiveBlending, BufferGeometry, Color, CylinderGeometry, DoubleSide, Float32BufferAttribute, Group,
  Mesh, MeshBasicMaterial, PlaneGeometry, Points, ShaderMaterial, SRGBColorSpace, TextureLoader,
} from 'three';
import type { PerspectiveCamera, Texture } from 'three';
import type { Random } from '../../core/random';
import { presetIllustration } from '../../data/gifts';
import type { Gift } from '../../data/gifts';
import type { GiftBox } from './boxes';

export class GiftReveal {
  readonly group = new Group();
  readonly card = new Group();
  private readonly burst: Points<BufferGeometry, ShaderMaterial>;
  private readonly beam: Mesh<CylinderGeometry, ShaderMaterial>;
  private readonly prints = new Map<string, Texture>();
  private readonly print: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private readonly materials: MeshBasicMaterial[];

  constructor(data: readonly Gift[], random: Random, capacity: number) {
    const frameMaterial = new MeshBasicMaterial({
      color: new Color(0xffcc85).multiplyScalar(1.27), side: DoubleSide, transparent: true, depthWrite: false,
    });
    const paper = new MeshBasicMaterial({
      color: new Color(0xffedcd).multiplyScalar(1.22), side: DoubleSide, transparent: true, depthWrite: false,
    });
    const ink = new MeshBasicMaterial({ color: 0xffe1a9, transparent: true, depthWrite: false });
    this.materials = [frameMaterial, paper, ink];
    const frame = new Mesh(new PlaneGeometry(.81, 1.05), frameMaterial);
    const inside = new Mesh(new PlaneGeometry(.793, 1.032), paper);
    inside.position.z = .002;
    this.print = new Mesh(new PlaneGeometry(.66, .462), ink);
    this.print.position.set(0, .172, .004);
    this.card.add(frame, inside, this.print);
    this.card.renderOrder = 3;
    this.card.visible = false;

    const loader = new TextureLoader();
    for (const item of data) {
      const art = presetIllustration(item.image);
      if (art && !this.prints.has(art)) {
        const texture = loader.load(art);
        texture.colorSpace = SRGBColorSpace;
        this.prints.set(art, texture);
      }
    }

    const origin = [], motion = [], brightness = [];
    for (let i = 0; i < capacity; i++) {
      const angle = random() * Math.PI * 2;
      const speed = .22 + random() * 1.36;
      origin.push((random() - .5) * .33, random() * .11, (random() - .5) * .32);
      motion.push(Math.sin(angle) * speed, .78 + random() * 2.5, Math.cos(angle) * speed);
      brightness.push(.18 + random() * .82, random());
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(origin, 3));
    geometry.setAttribute('motion', new Float32BufferAttribute(motion, 3));
    geometry.setAttribute('glint', new Float32BufferAttribute(brightness, 2));
    this.burst = new Points(geometry, new ShaderMaterial({
      uniforms: { age: { value: 0 }, ratio: { value: 1 } },
      vertexShader: `
        uniform float age, ratio;
        attribute vec3 motion;
        attribute vec2 glint;
        varying float glow;
        void main() {
          float t = max(0., age - glint.y * .21);
          vec3 p = position + motion * t;
          p.y -= 1.25 * t * t;
          vec4 v = modelViewMatrix * vec4(p, 1.);
          gl_Position = projectionMatrix * v;
          gl_PointSize = clamp((4.0 + glint.x * 17.) * ratio / max(1., -v.z), 1.2, 11.);
          glow = smoothstep(.0, .08, t) * (1. - smoothstep(.36 + glint.y * .29, 1.25, t))
              * (.47 + .53 * glint.x) * smoothstep(-.3,.06,p.y);
        }`,
      fragmentShader: `
        varying float glow;
        void main() {
          float d = length(gl_PointCoord - .5) * 2.;
          gl_FragColor = vec4(4.1, 2.24, .74, glow * exp(-4.8 * d * d) * (1. - smoothstep(.69, 1., d)));
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, blending: AdditiveBlending,
    }));
    this.burst.frustumCulled = false;
    this.burst.visible = false;

    this.beam = new Mesh(new CylinderGeometry(.41, .15, 1.56, 24, 1, true), new ShaderMaterial({
      uniforms: { strength: { value: 0 } },
      vertexShader: `
        varying vec2 band;
        varying float edge;
        void main() {
          band = uv;
          vec4 eye = modelViewMatrix * vec4(position, 1.);
          edge = abs(dot(normalize(normalMatrix * normal), normalize(-eye.xyz)));
          gl_Position = projectionMatrix * eye;
        }`,
      fragmentShader: `
        uniform float strength;
        varying vec2 band;
        varying float edge;
        void main() {
          float gradient = (1. - smoothstep(.02, .98, band.y)) * smoothstep(.0, .08, band.y);
          float rays = .72 + .28 * cos(band.x * 6.283185 * 9.);
          gl_FragColor = vec4(3.65, 1.63, .41, strength * gradient * rays * pow(edge, .65) * .27);
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, side: DoubleSide, blending: AdditiveBlending,
    }));
    this.beam.visible = false;
    this.group.add(this.beam, this.burst, this.card);
  }

  setDensity(count: number): void {
    this.burst.geometry.setDrawRange(0, count);
  }

  setPixelRatio(ratio: number): void {
    this.burst.material.uniforms.ratio.value = ratio;
  }

  prepare(box: GiftBox): void {
    const art = presetIllustration(box.data.image);
    this.print.material.map = art ? this.prints.get(art) ?? null : null;
    this.print.material.needsUpdate = true;
    this.print.visible = this.print.material.map !== null;
    this.burst.position.copy(box.anchor).y += box.height * .89;
    this.beam.position.copy(this.burst.position).y += .69;
  }

  spark(age: number, strength: number): void {
    this.burst.visible = age >= 0 && age < 1.53;
    this.burst.material.uniforms.age.value = age;
    this.beam.visible = strength > .002;
    this.beam.material.uniforms.strength.value = strength;
  }

  placeCard(box: GiftBox, camera: PerspectiveCamera, progress: number, opacity: number): void {
    this.card.visible = opacity > .003;
    this.card.position.copy(box.anchor).y += box.height * .79 + (box.openPoint.y - box.anchor.y - box.height * .79) * progress;
    this.card.lookAt(camera.position);
    this.card.rotateX((1 - progress) * -Math.PI * .46);
    this.card.rotateY((1 - progress) * Math.PI * .64);
    this.card.scale.setScalar(.36 + .76 * progress);
    for (const material of this.materials) material.opacity = opacity;
  }

  hideCard(): void {
    this.card.visible = false;
  }

}
