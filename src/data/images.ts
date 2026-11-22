import { presetImage } from './gifts';
import type { GiftImage } from './gifts';
import { blobUrl } from './store';

const LONG_EDGE = 1280;

async function decode(file: Blob): Promise<CanvasImageSource & { width: number; height: number }> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch { /* fall back to <img> for formats createImageBitmap rejects */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Shrinks a photo so its long edge is at most 1280px and re-encodes it (WebP where supported, JPEG otherwise). */
export async function compressImage(file: Blob): Promise<Blob> {
  const source = await decode(file);
  const scale = Math.min(1, LONG_EDGE / Math.max(source.width, source.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  if ('close' in source && typeof source.close === 'function') source.close();
  const encode = (type: string, quality: number) => new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, quality));
  const webp = await encode('image/webp', .84);
  if (webp && webp.type === 'image/webp') return webp;
  const jpeg = await encode('image/jpeg', .86);
  if (!jpeg) throw new Error('图片编码失败');
  return jpeg;
}

export async function imageUrl(image: GiftImage): Promise<string | undefined> {
  if (image.kind === 'preset') return presetImage(image);
  if (image.kind === 'upload') return blobUrl(image.blobKey);
  return undefined;
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function dataUrlToBlob(url: string): Promise<Blob> {
  if (!/^data:image\/(webp|jpeg|png);base64,/.test(url)) throw new Error('不支持的图片数据');
  return (await fetch(url)).blob();
}
