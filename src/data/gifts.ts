export interface Gift {
  id: string;
  name: string;
  message: string;
  from?: string;
  to?: string;
  image: { kind: 'preset'; id: string } | { kind: 'upload'; blobKey: string };
  box: { color: string; pattern: 'satin' | 'stripe' | 'dot' | 'foil'; shape: 'cube' | 'flat' | 'tall' };
  opened?: boolean;
}

export interface TreeScene {
  version: 1;
  recipient?: string;
  message?: string;
  theme: 'classic' | 'ice' | 'rose' | 'forest';
  snow: number;
  gifts: Gift[];
  wishes: { id: string; text: string }[];
}

const presetPhotos = new Set(['scarf', 'cake', 'camera', 'book', 'headphones', 'flowers']);

/** AI-generated product photos shipped in public/assets/gifts (see SOURCES.md there). */
export function presetImage(image: Gift['image']): string | undefined {
  if (image.kind !== 'preset' || !presetPhotos.has(image.id)) return undefined;
  return `${import.meta.env.BASE_URL}assets/gifts/${image.id}.jpg`;
}

export const exampleScene: TreeScene = {
  version: 1,
  theme: 'classic',
  snow: 1,
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
