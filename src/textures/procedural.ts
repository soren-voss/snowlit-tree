import { CanvasTexture, Color, EquirectangularReflectionMapping, SRGBColorSpace } from 'three';
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

export function needleTexture(random: Random): CanvasTexture {
  const ctx = surface(256, 512);
  ctx.lineCap = 'round';
  const spine = ctx.createLinearGradient(0, 480, 0, 13);
  spine.addColorStop(0, '#6f6651');
  spine.addColorStop(0.4, '#879082');
  spine.addColorStop(1, '#d7dcce');
  ctx.strokeStyle = spine;
  ctx.lineWidth = 4.2;
  ctx.beginPath();
  ctx.moveTo(128, 506);
  ctx.quadraticCurveTo(120, 292, 131, 30);
  ctx.stroke();

  for (let index = 0; index < 285; index++) {
    const t = (index + random()) / 285;
    const y = 495 - 463 * t;
    const side = index % 2 === 0 ? 1 : -1;
    const width = Math.sin(t ** 0.63 * Math.PI) ** 0.77;
    const endX = 128 + side * (15 + width * 98) * (0.3 + random() * 0.7);
    const endY = y - 19 - (0.25 + width) * (10 + random() * 65);
    const tone = Math.floor(129 + random() * 111);
    ctx.strokeStyle = `rgb(${tone - 9} ${tone} ${tone - 6} / ${0.66 + 0.34 * random()})`;
    ctx.lineWidth = 1.4 + 3.7 * random() * (1 - t * 0.44);
    ctx.beginPath();
    ctx.moveTo(126 + (random() - 0.5) * 17 + side * width * random() * 13, y);
    ctx.quadraticCurveTo(endX * 0.48 + 64, y - 10, endX, endY);
    ctx.stroke();
  }
  const texture = new CanvasTexture(ctx.canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
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

export function barkTexture(random: Random): CanvasTexture {
  const ctx = surface(128, 128);
  ctx.fillStyle = '#756359';
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 150; i++) {
    const x = random() * 128;
    const width = 0.5 + random() * 3;
    ctx.strokeStyle = i % 4 === 0 ? '#978578' : '#4c3932';
    ctx.lineWidth = width;
    ctx.globalAlpha = .22 + random() * .55;
    ctx.beginPath();
    ctx.moveTo(x, -4);
    for (let y = 6; y < 137; y += 7) ctx.lineTo(x + (random() - .5) * width * 2.5, y);
    ctx.stroke();
  }
  const texture = new CanvasTexture(ctx.canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

export function wrappingTexture(pattern: Gift['box']['pattern'], random: Random): CanvasTexture {
  const ctx = surface(128, 128);
  ctx.fillStyle = '#f3eee6';
  ctx.fillRect(0, 0, 128, 128);
  if (pattern === 'stripe') {
    ctx.strokeStyle = '#fff4d9';
    ctx.lineWidth = 4;
    for (let x = -128; x < 144; x += 16) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 128, 128);
      ctx.stroke();
    }
    ctx.fillStyle = '#7c6961';
    ctx.globalAlpha = .19;
    for (let x = 0; x < 128; x += 16) ctx.fillRect(x, 0, 1, 128);
  } else if (pattern === 'dot') {
    ctx.fillStyle = '#fffded';
    for (let y = 0; y < 128; y += 16) {
      for (let x = 0; x < 128; x += 16) {
        ctx.beginPath();
        ctx.arc(x + (y % 32 ? 11 : 4), y + 6, 2.25, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (pattern === 'foil') {
    const luster = ctx.createLinearGradient(0, 30, 128, 108);
    luster.addColorStop(0, '#b9a291');
    luster.addColorStop(.44, '#fff3ce');
    luster.addColorStop(.73, '#ddc6aa');
    luster.addColorStop(1, '#f2d8ad');
    ctx.fillStyle = luster;
    ctx.fillRect(0, 0, 128, 128);
    ctx.globalAlpha = .24;
    for (let i = 0; i < 104; i++) {
      ctx.fillStyle = i % 2 ? '#7d6251' : '#fffae5';
      ctx.fillRect(random() * 128, random() * 128, .6 + random() * 5, .55 + random() * 1.1);
    }
  }
  ctx.globalAlpha = .1;
  ctx.fillStyle = '#786454';
  for (let i = 0; i < 260; i++) ctx.fillRect(random() * 128, random() * 128, 1, 1);
  const texture = new CanvasTexture(ctx.canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
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
