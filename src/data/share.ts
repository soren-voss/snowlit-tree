import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import { createId, MUSIC_IDS, normalizeScene, PATTERNS, SHAPES, THEME_IDS } from './gifts';
import type { Gift, TreeScene } from './gifts';
import { blobToDataUrl, dataUrlToBlob } from './images';
import { getBlob, putBlob } from './store';

/**
 * Share links carry the scene in the URL fragment (never sent to a server), packed as positional arrays and
 * lz-compressed. Uploaded photos are left out; those gifts show the card without a picture.
 */
type PackedGift = [string, string, string, string, string, string, number, number];
type Packed = [1, string, string, number, number, number, PackedGift[], string[]];

export function encodeScene(scene: TreeScene): string {
  const packed: Packed = [
    1, scene.recipient ?? '', scene.message ?? '', THEME_IDS.indexOf(scene.theme), Math.round(scene.snow * 10),
    Math.max(0, MUSIC_IDS.indexOf(scene.music === 'upload' ? 'silent-night' : scene.music)),
    scene.gifts.map(gift => [
      gift.name, gift.message, gift.from ?? '', gift.to ?? '', gift.image.kind === 'preset' ? gift.image.id : '',
      gift.box.color.slice(1), PATTERNS.indexOf(gift.box.pattern), SHAPES.indexOf(gift.box.shape),
    ]),
    scene.wishes.map(wish => wish.text),
  ];
  return compressToEncodedURIComponent(JSON.stringify(packed));
}

export function decodeScene(code: string): TreeScene | null {
  try {
    const packed = JSON.parse(decompressFromEncodedURIComponent(code) ?? '') as Packed;
    if (!Array.isArray(packed) || packed[0] !== 1 || !Array.isArray(packed[6])) return null;
    const [, recipient, message, theme, snow, music, gifts, wishes] = packed;
    return normalizeScene({
      version: 1, recipient, message, theme: THEME_IDS[theme], snow: snow / 10, music: MUSIC_IDS[music],
      gifts: gifts.map(([name, text, from, to, image, color, pattern, shape]): Partial<Gift> => ({
        id: createId(), name, message: text, from, to,
        image: image ? { kind: 'preset', id: image } : { kind: 'none' },
        box: { color: `#${color}`, pattern: PATTERNS[pattern], shape: SHAPES[shape] },
      })),
      wishes: Array.isArray(wishes) ? wishes.map(text => ({ id: createId(), text })) : [],
    });
  } catch {
    return null;
  }
}

export function shareUrl(scene: TreeScene): string {
  const url = new URL(location.href);
  url.search = '';
  url.hash = `t=${encodeScene(scene)}`;
  return url.toString();
}

export function readSharedScene(): TreeScene | null {
  const match = /^#t=(.+)$/.exec(location.hash);
  return match ? decodeScene(match[1]) : null;
}

const PACK_FORMAT = 'snowlit-tree-pack';

/** A self-contained gift pack: the scene plus every uploaded photo as a data URL. */
export async function exportPack(scene: TreeScene): Promise<Blob> {
  const images: Record<string, string> = {};
  for (const gift of scene.gifts) {
    if (gift.image.kind !== 'upload' || images[gift.image.blobKey]) continue;
    const blob = await getBlob(gift.image.blobKey);
    if (blob) images[gift.image.blobKey] = await blobToDataUrl(blob);
  }
  return new Blob([JSON.stringify({ format: PACK_FORMAT, version: 1, scene, images })], { type: 'application/json' });
}

export async function importPack(file: Blob): Promise<TreeScene> {
  if (file.size > 40 * 1024 * 1024) throw new Error('文件太大，不像是礼物包');
  let raw: { format?: unknown; scene?: unknown; images?: Record<string, unknown> };
  try {
    raw = JSON.parse(await file.text());
  } catch {
    throw new Error('无法读取这个文件，请选择导出的礼物包（.json）');
  }
  if (raw?.format !== PACK_FORMAT) throw new Error('这不是雪夜礼物树的礼物包');
  const scene = normalizeScene(raw.scene);
  if (!scene) throw new Error('礼物包内容已损坏');
  const renamed = new Map<string, string>();
  for (const gift of scene.gifts) {
    if (gift.image.kind !== 'upload') continue;
    const original = gift.image.blobKey;
    let key = renamed.get(original);
    const data = raw.images?.[original];
    if (!key && typeof data === 'string') {
      try {
        key = await putBlob(await dataUrlToBlob(data));
        renamed.set(original, key);
      } catch { /* skip a broken image; the gift keeps its text */ }
    }
    gift.image = key ? { kind: 'upload', blobKey: key } : { kind: 'none' };
  }
  return scene;
}
