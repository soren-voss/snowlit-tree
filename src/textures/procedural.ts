import { CanvasTexture, Color, EquirectangularReflectionMapping, RepeatWrapping, SRGBColorSpace } from 'three';
import type { Random } from '../core/random';
import type { Gift } from '../data/gifts';

function surface(width: number, height: number): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D unavailable');
  return ctx;
}

export function glowTexture(): CanvasTexture {
  const ctx = surface(128, 128);
  const light = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  light.addColorStop(0, '#ffffffff');
  light.addColorStop(0.11, '#ffffffba');
  light.addColorStop(0.29, '#ffffff42');
  light.addColorStop(0.57, '#ffffff13');
  light.addColorStop(1, '#ffffff00');
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, 128, 128);
  return new CanvasTexture(ctx.canvas);
}

/** Printed wrapping paper: the colours live in the texture so each pattern reads like real gift wrap. */
export function wrappingTexture(pattern: Gift['box']['pattern'], base: string, accent: string, random: Random): CanvasTexture {
  const size = 512;
  const ctx = surface(size, size);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  if (pattern === 'stripe') {
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.rotate(-Math.PI / 4);
    for (let x = -size; x < size; x += 64) {
      ctx.fillStyle = accent;
      ctx.globalAlpha = .9;
      ctx.fillRect(x, -size, 7, size * 2);
      ctx.globalAlpha = .35;
      ctx.fillRect(x + 16, -size, 2, size * 2);
      ctx.fillRect(x - 11, -size, 2, size * 2);
    }
    ctx.restore();
  } else if (pattern === 'dot') {
    ctx.fillStyle = accent;
    for (let y = 0; y < size; y += 48) {
      for (let x = 0; x < size; x += 48) {
        ctx.beginPath();
        ctx.arc(x + (y % 96 ? 24 : 0), y + 12, 7, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (pattern === 'foil') {
    for (let i = 0; i < 900; i++) {
      ctx.globalAlpha = .05 + random() * .1;
      ctx.fillStyle = random() < .5 ? '#fff6dc' : '#4a3214';
      ctx.beginPath();
      ctx.ellipse(random() * size, random() * size, 4 + random() * 22, 2 + random() * 8, random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    const sheen = ctx.createLinearGradient(0, 0, size, size);
    sheen.addColorStop(0, 'rgba(255,255,255,.06)');
    sheen.addColorStop(.5, 'rgba(255,255,255,0)');
    sheen.addColorStop(1, 'rgba(0,0,0,.08)');
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, size, size);
  }
  ctx.globalAlpha = .05;
  for (let i = 0; i < 1600; i++) {
    ctx.fillStyle = random() < .5 ? '#ffffff' : '#000000';
    ctx.fillRect(random() * size, random() * size, 1 + random() * 2, 1);
  }
  const texture = new CanvasTexture(ctx.canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

/** Soft creases and fibres for paper bump mapping. */
export function crinkleTexture(random: Random): CanvasTexture {
  const size = 256;
  const ctx = surface(size, size);
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 70; i++) {
    const x = random() * size, y = random() * size, angle = random() * Math.PI, length = 30 + random() * 120;
    ctx.strokeStyle = random() < .5 ? 'rgba(255,255,255,.18)' : 'rgba(0,0,0,.18)';
    ctx.lineWidth = 1 + random() * 3;
    ctx.beginPath();
    ctx.moveTo(x - Math.cos(angle) * length / 2, y - Math.sin(angle) * length / 2);
    ctx.lineTo(x + Math.cos(angle) * length / 2, y + Math.sin(angle) * length / 2);
    ctx.stroke();
  }
  ctx.globalAlpha = .12;
  for (let i = 0; i < 4000; i++) {
    ctx.fillStyle = random() < .5 ? '#fff' : '#000';
    ctx.fillRect(random() * size, random() * size, 1, 1);
  }
  const texture = new CanvasTexture(ctx.canvas);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  return texture;
}

export function reflectionTexture(random: Random): CanvasTexture {
  const ctx = surface(512, 256);
  const sky = ctx.createLinearGradient(0, 0, 0, 256);
  sky.addColorStop(0, '#172641');
  sky.addColorStop(0.42, '#364d71');
  sky.addColorStop(0.56, '#16273b');
  sky.addColorStop(0.58, '#0b1b1b');
  sky.addColorStop(1, '#2c3a4c');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 512, 256);

  const cold = ctx.createRadialGradient(103, 62, 0, 103, 62, 58);
  cold.addColorStop(0, '#e4f3ff');
  cold.addColorStop(0.17, '#aac9ee');
  cold.addColorStop(1, '#294e8a00');
  ctx.fillStyle = cold;
  ctx.fillRect(0, 0, 512, 178);
  for (let i = 0; i < 138; i++) {
    const x = 512 * random();
    const y = 75 + 98 * random();
    const radius = 2.4 + random() * 9;
    const light = ctx.createRadialGradient(x, y, 0, x, y, radius);
    light.addColorStop(0, '#fff2b8');
    light.addColorStop(0.28, '#f9bb5ead');
    light.addColorStop(1, '#d28c1900');
    ctx.fillStyle = light;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  // A broad reflected highlight reads clearly on the curved glass.
  ctx.fillStyle = '#f9deb4';
  ctx.fillRect(349, 83, 23, 5);
  ctx.fillStyle = '#c4dfff';
  ctx.fillRect(91, 54, 18, 11);

  const texture = new CanvasTexture(ctx.canvas);
  texture.mapping = EquirectangularReflectionMapping;
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

export function linearColor(hex: number, gain: number): Color {
  return new Color(hex).multiplyScalar(gain);
}
