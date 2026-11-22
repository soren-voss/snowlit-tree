import { encode } from 'uqr';

/** Draws a QR code card (ivory paper, navy modules, a caption underneath) for saving or showing in a video. */
export function drawQrCard(canvas: HTMLCanvasElement, text: string, caption: string): void {
  const qr = encode(text, { ecc: 'L', border: 0 });
  const module = Math.max(4, Math.floor(560 / qr.size));
  const code = qr.size * module;
  const pad = Math.round(code * .1);
  const captionHeight = 86;
  canvas.width = code + pad * 2;
  canvas.height = code + pad * 2 + captionHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f6eedf';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#0d1630';
  qr.data.forEach((row, y) => row.forEach((dark, x) => {
    if (dark) ctx.fillRect(pad + x * module, pad + y * module, module, module);
  }));
  ctx.fillStyle = '#5b3c22';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `600 34px "Songti SC", "Noto Serif CJK SC", SimSun, serif`;
  ctx.fillText(caption, canvas.width / 2, code + pad * 2 + captionHeight * .38);
  ctx.font = '22px system-ui, sans-serif';
  ctx.fillStyle = '#8a6a48';
  ctx.fillText('雪夜礼物树 · 扫码拆礼物', canvas.width / 2, code + pad * 2 + captionHeight * .78);
}
