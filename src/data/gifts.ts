export type BoxPattern = 'satin' | 'stripe' | 'dot' | 'foil';
export type BoxShape = 'cube' | 'flat' | 'tall';
export type ThemeId = 'classic' | 'ice' | 'rose' | 'forest';
export type GiftImage = { kind: 'preset'; id: string } | { kind: 'upload'; blobKey: string } | { kind: 'none' };

export interface Gift {
  id: string;
  name: string;
  message: string;
  from?: string;
  to?: string;
  image: GiftImage;
  box: { color: string; pattern: BoxPattern; shape: BoxShape };
  opened?: boolean;
}

export interface Wish {
  id: string;
  text: string;
}

export interface TreeScene {
  version: 1;
  recipient?: string;
  message?: string;
  theme: ThemeId;
  snow: number;
  music: MusicId;
  gifts: Gift[];
  wishes: Wish[];
}

export type MusicId = 'silent-night' | 'jingle-bells' | 'merry-christmas' | 'upload' | 'off';

export const LIMITS = {
  gifts: 12, wishes: 24, name: 16, message: 120, signature: 12, recipient: 12, sceneMessage: 60, wish: 40,
} as const;

export const PATTERNS: readonly BoxPattern[] = ['satin', 'stripe', 'dot', 'foil'];
export const SHAPES: readonly BoxShape[] = ['cube', 'flat', 'tall'];
export const THEME_IDS: readonly ThemeId[] = ['classic', 'ice', 'rose', 'forest'];
export const MUSIC_IDS: readonly MusicId[] = ['silent-night', 'jingle-bells', 'merry-christmas', 'upload', 'off'];
export const BOX_COLORS = ['#9c1d2e', '#1f4a3a', '#c9a24f', '#24365a', '#f1e6d2', '#b8505c'] as const;

/** AI-generated product photos shipped in public/assets/gifts (see SOURCES.md there). */
export const PRESET_PHOTOS = [
  { id: 'scarf', label: '围巾' }, { id: 'cake', label: '蛋糕' }, { id: 'camera', label: '相机' },
  { id: 'book', label: '书' }, { id: 'headphones', label: '耳机' }, { id: 'flowers', label: '花束' },
] as const;
const presetIds = new Set<string>(PRESET_PHOTOS.map(photo => photo.id));

export function presetImage(image: GiftImage): string | undefined {
  if (image.kind !== 'preset' || !presetIds.has(image.id)) return undefined;
  return `${import.meta.env.BASE_URL}assets/gifts/${image.id}.jpg`;
}

export function createId(): string {
  return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
}

export function newGift(index: number): Gift {
  const photo = PRESET_PHOTOS[index % PRESET_PHOTOS.length];
  return {
    id: createId(),
    name: '一份小礼物',
    message: '',
    image: { kind: 'preset', id: photo.id },
    box: { color: BOX_COLORS[index % BOX_COLORS.length], pattern: PATTERNS[index % PATTERNS.length], shape: SHAPES[index % SHAPES.length] },
  };
}

function text(value: unknown, limit: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = Array.from(value.trim()).slice(0, limit).join('');
  return trimmed || undefined;
}

function pickOne<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return options.includes(value as T) ? value as T : fallback;
}

function normalizeImage(value: unknown): GiftImage {
  const image = value as Partial<{ kind: string; id: unknown; blobKey: unknown }> | null;
  if (image?.kind === 'preset' && typeof image.id === 'string' && presetIds.has(image.id)) return { kind: 'preset', id: image.id };
  if (image?.kind === 'upload' && typeof image.blobKey === 'string' && /^[\w-]{1,40}$/.test(image.blobKey)) return { kind: 'upload', blobKey: image.blobKey };
  return { kind: 'none' };
}

function normalizeGift(value: unknown, index: number): Gift | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  const box = (raw.box ?? {}) as Record<string, unknown>;
  const color = typeof box.color === 'string' && /^#[0-9a-f]{6}$/i.test(box.color) ? box.color.toLowerCase() : BOX_COLORS[index % BOX_COLORS.length];
  return {
    id: typeof raw.id === 'string' && /^[\w-]{1,24}$/.test(raw.id) ? raw.id : createId(),
    name: text(raw.name, LIMITS.name) ?? '一份小礼物',
    message: text(raw.message, LIMITS.message) ?? '',
    from: text(raw.from, LIMITS.signature),
    to: text(raw.to, LIMITS.signature),
    image: normalizeImage(raw.image),
    box: { color, pattern: pickOne(box.pattern, PATTERNS, 'satin'), shape: pickOne(box.shape, SHAPES, 'cube') },
  };
}

/** Validates anything read from storage, a share link or an imported file; returns null if it is not a scene. */
export function normalizeScene(value: unknown): TreeScene | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (raw.version !== 1 || !Array.isArray(raw.gifts)) return null;
  const ids = new Set<string>();
  const gifts = raw.gifts.slice(0, LIMITS.gifts).map(normalizeGift).filter((gift): gift is Gift => {
    if (!gift) return false;
    if (ids.has(gift.id)) gift.id = createId();
    ids.add(gift.id);
    return true;
  });
  const wishes = (Array.isArray(raw.wishes) ? raw.wishes : []).slice(0, LIMITS.wishes).flatMap(item => {
    const wish = item as Partial<Wish> | null;
    const body = text(wish?.text, LIMITS.wish);
    return body ? [{ id: typeof wish?.id === 'string' && /^[\w-]{1,24}$/.test(wish.id) ? wish.id : createId(), text: body }] : [];
  });
  const snow = typeof raw.snow === 'number' && Number.isFinite(raw.snow) ? Math.min(1, Math.max(0, raw.snow)) : 1;
  return {
    version: 1,
    recipient: text(raw.recipient, LIMITS.recipient),
    message: text(raw.message, LIMITS.sceneMessage),
    theme: pickOne(raw.theme, THEME_IDS, 'classic'),
    snow,
    music: pickOne(raw.music, MUSIC_IDS, 'silent-night'),
    gifts,
    wishes,
  };
}

export function cloneScene(scene: TreeScene): TreeScene {
  return structuredClone(scene);
}

export const exampleScene: TreeScene = {
  version: 1,
  theme: 'classic',
  snow: 1,
  music: 'silent-night',
  message: '愿你的冬天有灯、有雪，也有人惦记。',
  wishes: [],
  gifts: [
    { id: 'scarf', name: '一条软围巾', message: '风大的日子就把它围紧一点。愿你每次出门，路上都有一点好天气。', from: '老朋友', to: '怕冷的你', image: { kind: 'preset', id: 'scarf' }, box: { color: '#1f4a3a', pattern: 'stripe', shape: 'tall' } },
    { id: 'cake', name: '一块栗子蛋糕', message: '今晚留一小块给自己。甜点可以慢慢吃，今天也可以早点结束。', image: { kind: 'preset', id: 'cake' }, box: { color: '#f1e6d2', pattern: 'dot', shape: 'flat' } },
    { id: 'camera', name: '一台小相机', message: '拍下路灯刚亮的那一刻，也拍下平常的一天。以后翻到，应该会想起来那时有多冷。', from: '一起散步的人', image: { kind: 'preset', id: 'camera' }, box: { color: '#9c1d2e', pattern: 'satin', shape: 'cube' } },
    { id: 'book', name: '一本冬夜读物', message: '挑了本可以随手翻开的书。今晚读到哪里都行，记得给自己留盏灯。', to: '刚好有空的你', image: { kind: 'preset', id: 'book' }, box: { color: '#c9a24f', pattern: 'foil', shape: 'flat' } },
    { id: 'headphones', name: '一副耳机', message: '把喜欢的歌留给回家那段路。走慢一点，听完整首再进门。', image: { kind: 'preset', id: 'headphones' }, box: { color: '#24365a', pattern: 'stripe', shape: 'cube' } },
    { id: 'flowers', name: '一束冬日花', message: '放在你每天都经过的地方。想起它的时候，记得给花和自己都添点水。', from: '惦记你的人', image: { kind: 'preset', id: 'flowers' }, box: { color: '#b8505c', pattern: 'satin', shape: 'tall' } },
  ],
};
