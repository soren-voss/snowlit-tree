import {
  AdditiveBlending, BufferGeometry, Color, CylinderGeometry, DoubleSide, Float32BufferAttribute, Group,
  Mesh, MeshBasicMaterial, PlaneGeometry, Points, ShaderMaterial, SRGBColorSpace, TextureLoader,
} from 'three';
import type { PerspectiveCamera, Texture } from 'three';
import type { Random } from '../../core/random';
import { presetImage } from '../../data/gifts';
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
  private age = 0;

  constructor(data: readonly Gift[], random: Random, capacity: number) {
    const frameMaterial = new MeshBasicMaterial({
      color: new Color(0xe8b968).multiplyScalar(1.15), side: DoubleSide, transparent: true, depthWrite: false,
    });
    const paper = new MeshBasicMaterial({
      color: new Color(0xf3e6cf).multiplyScalar(.92), side: DoubleSide, transparent: true, depthWrite: false,
    });
    const ink = new MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false });
    this.materials = [frameMaterial, paper, ink];
    const frame = new Mesh(new PlaneGeometry(.81, 1.05), frameMaterial);
    const inside = new Mesh(new PlaneGeometry(.793, 1.032), paper);
    inside.position.z = .002;
    this.print = new Mesh(new PlaneGeometry(.68, .453), ink);
    this.print.position.set(0, .172, .004);
    frame.renderOrder = 3;
    inside.renderOrder = 4;
    this.print.renderOrder = 5;
    this.card.add(frame, inside, this.print);
    this.card.visible = false;

    const loader = new TextureLoader();
    for (const item of data) {
      const art = presetImage(item.image);
      if (art && !this.prints.has(art)) {
        const texture = loader.load(art);
        texture.colorSpace = SRGBColorSpace;
        this.prints.set(art, texture);
      }
    }

    const origin = [], motion = [], brightness = [];
    for (let i = 0; i < capacity; i++) {
      const angle = random() * Math.PI * 2;
      const speed = .3 + random() * 1.1;
      origin.push((random() - .5) * .3, random() * .1, (random() - .5) * .3);
      motion.push(Math.sin(angle) * speed, 1.1 + random() * 2.6, Math.cos(angle) * speed);
      brightness.push(.2 + random() * .8, random());
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
          float glitter = step(.62, glint.y);
          float t = max(0., age - glint.y * .25);
          float swirl = t * (1.8 + 2. * glint.x) * (glint.y > .31 ? 1. : -1.);
          vec2 spread = motion.xz * (1. - exp(-t * 2.2)) * mix(.55, .8, glitter);
          spread = mat2(cos(swirl), -sin(swirl), sin(swirl), cos(swirl)) * spread;
          float rise = mix(motion.y * (1. - exp(-t * 1.5)) * .85, motion.y * .55 * (1. - exp(-t * 2.4)) - .16 * t * t, glitter);
          vec3 p = position + vec3(spread.x, rise, spread.y);
          vec4 v = modelViewMatrix * vec4(p, 1.);
          gl_Position = projectionMatrix * v;
          gl_PointSize = clamp((5. + glint.x * 20.) * mix(1., .6, glitter) * ratio / max(1., -v.z), 1.2, 14.);
          float twinkle = mix(1., .45 + .55 * pow(.5 + .5 * sin(t * 18. + glint.y * 90.), 3.), glitter);
          glow = smoothstep(.0, .06, t) * (1. - smoothstep(mix(.85, 1.5, glitter) + glint.y * .3, mix(1.4, 2.5, glitter), t))
              * (.4 + .6 * glint.x) * twinkle;
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
          gl_FragColor = vec4(3.65, 1.8, .6, strength * gradient * rays * pow(edge, .65) * .42);
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
    const art = presetImage(box.data.image);
    this.print.material.map = art ? this.prints.get(art) ?? null : null;
    this.print.material.needsUpdate = true;
    this.print.visible = this.print.material.map !== null;
    this.burst.position.copy(box.anchor).y += box.height * .89;
    this.beam.position.copy(this.burst.position).y += .69;
  }

  /** Starts the particle burst; it then runs on its own clock via tick(). */
  burstOut(): void {
    this.age = 0;
    this.burst.visible = true;
  }

  tick(delta: number): void {
    if (!this.burst.visible) return;
    this.age += delta;
    this.burst.material.uniforms.age.value = this.age;
    if (this.age > 2.8) this.burst.visible = false;
  }

  beamStrength(strength: number): void {
    this.beam.visible = strength > .002;
    this.beam.material.uniforms.strength.value = strength;
  }

  stopBurst(): void {
    this.burst.visible = false;
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
