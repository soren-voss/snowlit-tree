import {
  BOX_COLORS, LIMITS, newGift, PRESET_PHOTOS, presetImage,
} from '../data/gifts';
import type { BoxPattern, BoxShape, Gift, GiftImage, MusicId, ThemeId, TreeScene } from '../data/gifts';
import { exportPack, importPack, shareUrl } from '../data/share';
import { THEMES } from '../scene/theme';
import { download, h, icon, pickFile, toast } from './dom';
import { drawQrCard } from './qr';

export type Change = 'text' | 'layout' | 'image' | 'theme' | 'snow' | 'music' | 'wishes';
type Tab = 'gifts' | 'scene' | 'share';

export interface EditorHost {
  readonly scene: TreeScene;
  commit(change: Change): void;
  imageFor(gift: Gift): string | undefined;
  uploadPhoto(file: File): Promise<GiftImage>;
  uploadMusic(file: File): Promise<void>;
  replaceScene(scene: TreeScene): Promise<void>;
  resetScene(): Promise<void>;
  closeEditor(): void;
  startRecording(): void;
}

const PATTERN_LABELS: Record<BoxPattern, string> = { satin: '缎面', stripe: '条纹', dot: '波点', foil: '金箔' };
const SHAPE_LABELS: Record<BoxShape, string> = { cube: '方盒', flat: '扁盒', tall: '高盒' };
const MUSIC_LABELS: [MusicId, string][] = [
  ['silent-night', '平安夜'], ['jingle-bells', '铃儿响叮当'], ['merry-christmas', '祝你圣诞快乐'], ['upload', '我的音乐'], ['off', '关闭'],
];

function field(label: string, control: HTMLElement, hint?: HTMLElement): HTMLLabelElement {
  return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label, hint), control);
}

function counter(input: HTMLInputElement | HTMLTextAreaElement, limit: number): HTMLElement {
  const badge = h('span', { class: 'counter' });
  const update = () => { badge.textContent = `${Array.from(input.value).length}/${limit}`; };
  input.addEventListener('input', update);
  update();
  return badge;
}

function textInput(value: string | undefined, limit: number, placeholder: string, onInput: (value: string) => void, multiline = false) {
  const input = multiline
    ? h('textarea', { value: value ?? '', maxLength: limit, placeholder, rows: 3 })
    : h('input', { type: 'text', value: value ?? '', maxLength: limit, placeholder });
  input.addEventListener('input', () => onInput(input.value));
  return input;
}

function segmented<T extends string>(name: string, options: [T, string][], current: T, onPick: (value: T) => void, wrap = false): HTMLElement {
  const group = h('div', { class: wrap ? 'segmented wrap' : 'segmented', attrs: { role: 'radiogroup', 'aria-label': name } });
  for (const [value, label] of options) {
    const button = h('button', { type: 'button', textContent: label, attrs: { role: 'radio', 'aria-checked': String(value === current) } });
    button.addEventListener('click', () => {
      for (const other of group.children) other.setAttribute('aria-checked', String(other === button));
      onPick(value);
    });
    group.append(button);
  }
  return group;
}

export class Editor {
  readonly element: HTMLElement;
  selected?: string;
  private tab: Tab = 'gifts';
  private readonly body: HTMLElement;
  private readonly tabs: Record<Tab, HTMLButtonElement>;
  private confirmTimer?: ReturnType<typeof setTimeout>;

  constructor(private readonly host: EditorHost) {
    this.body = h('div', { class: 'editor-body' });
    const tab = (id: Tab, label: string) => {
      const button = h('button', { type: 'button', textContent: label, attrs: { role: 'tab' } });
      button.addEventListener('click', () => this.show(id));
      return button;
    };
    this.tabs = { gifts: tab('gifts', '礼物'), scene: tab('scene', '场景'), share: tab('share', '分享') };
    const close = h('button', { type: 'button', class: 'icon-button', attrs: { 'aria-label': '完成布置' } }, icon('close'));
    close.addEventListener('click', () => host.closeEditor());
    this.element = h('aside', { id: 'editor', class: 'panel', hidden: true, attrs: { 'aria-label': '布置礼物树' } },
      h('header', { class: 'editor-head' },
        h('div', {}, h('h2', { textContent: '布置礼物树' }), h('p', { textContent: '修改会自动保存在这台设备上' })),
        close),
      h('nav', { class: 'tabs', attrs: { role: 'tablist' } }, this.tabs.gifts, this.tabs.scene, this.tabs.share),
      this.body);
  }

  get isOpen(): boolean {
    return !this.element.hidden;
  }

  open(tab: Tab = this.tab): void {
    this.element.hidden = false;
    this.selected ??= this.host.scene.gifts[0]?.id;
    this.show(tab);
  }

  close(): void {
    this.element.hidden = true;
  }

  /** Called when a gift box is tapped in the scene while editing. */
  select(id: string): void {
    this.selected = id;
    this.show('gifts');
    this.body.querySelector('.gift-form')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  show(tab: Tab): void {
    this.tab = tab;
    for (const [id, button] of Object.entries(this.tabs)) button.setAttribute('aria-selected', String(id === tab));
    this.body.replaceChildren(tab === 'gifts' ? this.giftsTab() : tab === 'scene' ? this.sceneTab() : this.shareTab());
  }

  /** Re-renders the visible tab (after an import, reset or outside change). */
  refresh(): void {
    if (this.isOpen) this.show(this.tab);
  }

  private get gift(): Gift | undefined {
    return this.host.scene.gifts.find(gift => gift.id === this.selected);
  }

  private giftsTab(): HTMLElement {
    const { scene } = this.host;
    if (!this.gift) this.selected = scene.gifts[0]?.id;
    const list = h('ol', { class: 'gift-list' });
    scene.gifts.forEach((gift, index) => {
      const item = h('li', { dataset: { selected: String(gift.id === this.selected) } });
      const choose = h('button', { type: 'button', class: 'gift-row' },
        h('span', { class: 'swatch', attrs: { style: `--swatch:${gift.box.color}` } }),
        h('span', { class: 'gift-row-name', textContent: gift.name }));
      choose.addEventListener('click', () => { this.selected = gift.id; this.show('gifts'); });
      item.append(choose);
      if (gift.id === this.selected) {
        const move = (offset: number, label: string, glyph: 'up' | 'down') => {
          const button = h('button', { type: 'button', class: 'icon-button small', disabled: index + offset < 0 || index + offset >= scene.gifts.length, attrs: { 'aria-label': label } }, icon(glyph));
          button.addEventListener('click', () => {
            scene.gifts.splice(index, 1);
            scene.gifts.splice(index + offset, 0, gift);
            this.host.commit('layout');
            this.show('gifts');
          });
          return button;
        };
        item.append(move(-1, '往左挪', 'up'), move(1, '往右挪', 'down'));
      }
      list.append(item);
    });
    const add = h('button', { type: 'button', class: 'ghost wide', disabled: scene.gifts.length >= LIMITS.gifts },
      icon('plus'), scene.gifts.length >= LIMITS.gifts ? `最多 ${LIMITS.gifts} 个礼物` : `添加礼物（${scene.gifts.length}/${LIMITS.gifts}）`);
    add.addEventListener('click', () => {
      const gift = newGift(scene.gifts.length);
      scene.gifts.push(gift);
      this.selected = gift.id;
      this.host.commit('layout');
      this.show('gifts');
    });
    const section = h('section', { class: 'stack' },
      scene.gifts.length ? h('p', { class: 'note', textContent: '列表顺序就是树下从左到右的摆放顺序。也可以直接点场景里的礼盒来选中。' }) : h('p', { class: 'empty', textContent: '树下还没有礼物，先添加一个吧。' }),
      list, add);
    const gift = this.gift;
    if (gift) section.append(this.giftForm(gift));
    return section;
  }

  private giftForm(gift: Gift): HTMLElement {
    const text = (key: 'name' | 'message' | 'from' | 'to', limit: number, placeholder: string, multiline = false) => {
      const input = textInput(gift[key], limit, placeholder, value => {
        if (key === 'name') {
          gift.name = value.trim() || '一份小礼物';
          const row = this.body.querySelector('[data-selected="true"] .gift-row-name');
          if (row) row.textContent = gift.name;
        } else if (key === 'message') gift.message = value.trim();
        else gift[key] = value.trim() || undefined;
        this.host.commit('text');
      }, multiline);
      return input;
    };
    const name = text('name', LIMITS.name, '比如：一条软围巾');
    const message = text('message', LIMITS.message, '拆开时看到的话', true);

    const preview = h('div', { class: 'photo-preview' });
    const status = h('p', { class: 'note', hidden: true });
    const showPreview = () => {
      const url = this.host.imageFor(gift);
      preview.replaceChildren(url ? h('img', { src: url, alt: '' }) : h('span', { textContent: '没有照片' }));
    };
    showPreview();
    const photos = h('div', { class: 'photo-grid' });
    const setImage = (image: GiftImage) => {
      gift.image = image;
      this.host.commit('image');
      showPreview();
      for (const tile of photos.querySelectorAll('[aria-pressed]')) tile.setAttribute('aria-pressed', String(tile.getAttribute('data-id') === (image.kind === 'preset' ? image.id : image.kind)));
    };
    for (const photo of PRESET_PHOTOS) {
      const tile = h('button', { type: 'button', class: 'photo-tile', dataset: { id: photo.id }, attrs: { 'aria-pressed': String(gift.image.kind === 'preset' && gift.image.id === photo.id), 'aria-label': photo.label } },
        h('img', { src: presetImage({ kind: 'preset', id: photo.id })!, alt: '', loading: 'lazy' }));
      tile.addEventListener('click', () => setImage({ kind: 'preset', id: photo.id }));
      photos.append(tile);
    }
    const upload = h('button', { type: 'button', class: 'photo-tile upload', dataset: { id: 'upload' }, attrs: { 'aria-pressed': String(gift.image.kind === 'upload') } }, icon('upload'), h('span', { textContent: '上传' }));
    upload.addEventListener('click', async () => {
      const file = await pickFile('image/*');
      if (!file) return;
      status.hidden = false;
      status.textContent = '正在压缩照片…';
      try {
        setImage(await this.host.uploadPhoto(file));
        status.textContent = '照片已保存在本机。分享链接不包含照片，带照片请导出礼物包。';
      } catch {
        status.textContent = '这张图片读取失败，换一张试试（支持 JPG、PNG、WebP、HEIC 视浏览器而定）。';
      }
    });
    photos.append(upload);

    const colors = h('div', { class: 'swatches', attrs: { role: 'radiogroup', 'aria-label': '礼盒颜色' } });
    const custom = h('input', { type: 'color', value: gift.box.color, attrs: { 'aria-label': '自选颜色' } });
    const setColor = (color: string) => {
      gift.box.color = color;
      for (const chip of colors.querySelectorAll('[role="radio"]')) chip.setAttribute('aria-checked', String(chip.getAttribute('data-color') === color));
      const swatch = this.body.querySelector<HTMLElement>('[data-selected="true"] .swatch');
      swatch?.style.setProperty('--swatch', color);
      this.host.commit('layout');
    };
    for (const color of BOX_COLORS) {
      const chip = h('button', { type: 'button', class: 'swatch', dataset: { color }, attrs: { role: 'radio', 'aria-checked': String(gift.box.color === color), 'aria-label': color, style: `--swatch:${color}` } });
      chip.addEventListener('click', () => { custom.value = color; setColor(color); });
      colors.append(chip);
    }
    custom.addEventListener('change', () => setColor(custom.value.toLowerCase()));
    colors.append(h('span', { class: 'swatch custom' }, custom));

    const remove = h('button', { type: 'button', class: 'danger' }, icon('trash'), '删除这个礼物');
    remove.addEventListener('click', () => {
      if (!remove.dataset.armed) {
        remove.dataset.armed = 'yes';
        remove.lastChild!.textContent = '再点一次确认删除';
        clearTimeout(this.confirmTimer);
        this.confirmTimer = setTimeout(() => { delete remove.dataset.armed; remove.lastChild!.textContent = '删除这个礼物'; }, 3000);
        return;
      }
      const { gifts } = this.host.scene;
      const index = gifts.indexOf(gift);
      gifts.splice(index, 1);
      this.selected = gifts[Math.min(index, gifts.length - 1)]?.id;
      this.host.commit('layout');
      this.show('gifts');
    });

    const from = text('from', LIMITS.signature, '可不填');
    const to = text('to', LIMITS.signature, '可不填');
    return h('div', { class: 'gift-form stack' },
      h('h3', { textContent: '照片' }), preview, photos, status,
      field('礼物名称', name, counter(name, LIMITS.name)),
      field('祝福语', message, counter(message, LIMITS.message)),
      h('div', { class: 'pair' }, field('From', from), field('To', to)),
      h('h3', { textContent: '礼盒' }),
      colors,
      segmented('包装纹样', (Object.keys(PATTERN_LABELS) as BoxPattern[]).map(id => [id, PATTERN_LABELS[id]]), gift.box.pattern, value => { gift.box.pattern = value; this.host.commit('layout'); }),
      segmented('盒型', (Object.keys(SHAPE_LABELS) as BoxShape[]).map(id => [id, SHAPE_LABELS[id]]), gift.box.shape, value => { gift.box.shape = value; this.host.commit('layout'); }),
      remove);
  }

  private sceneTab(): HTMLElement {
    const { scene } = this.host;
    const recipient = textInput(scene.recipient, LIMITS.recipient, '比如：小雨', value => { scene.recipient = value.trim() || undefined; this.host.commit('text'); });
    const message = textInput(scene.message, LIMITS.sceneMessage, '全部礼物拆完后出现的话', value => { scene.message = value.trim() || undefined; this.host.commit('text'); }, true);

    const themes = h('div', { class: 'themes', attrs: { role: 'radiogroup', 'aria-label': '主题配色' } });
    for (const [id, theme] of Object.entries(THEMES) as [ThemeId, typeof THEMES[ThemeId]][]) {
      const card = h('button', { type: 'button', class: 'theme-card', attrs: { role: 'radio', 'aria-checked': String(scene.theme === id), style: `--a:${theme.swatch[0]};--b:${theme.swatch[1]}` } },
        h('span', { class: 'theme-dots' }), theme.label);
      card.addEventListener('click', () => {
        scene.theme = id;
        for (const other of themes.children) other.setAttribute('aria-checked', String(other === card));
        this.host.commit('theme');
      });
      themes.append(card);
    }

    const snow = h('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(scene.snow), attrs: { 'aria-label': '雪量' } });
    snow.addEventListener('input', () => { scene.snow = Number(snow.value); this.host.commit('snow'); });

    const musicNote = h('p', { class: 'note', textContent: '上传的音乐只保存在本机，不会进入分享链接；对方会听到《平安夜》。' });
    const music = segmented('背景音乐', MUSIC_LABELS, scene.music, async value => {
      if (value === 'upload') {
        const file = await pickFile('audio/*');
        if (!file) { this.show('scene'); return; }
        try {
          await this.host.uploadMusic(file);
        } catch {
          toast('这个音频文件无法保存');
          this.show('scene');
          return;
        }
      }
      scene.music = value;
      this.host.commit('music');
    }, true);

    const wishes = h('ul', { class: 'wish-list' });
    for (const wish of scene.wishes) {
      const remove = h('button', { type: 'button', class: 'icon-button small', attrs: { 'aria-label': `删除愿望：${wish.text}` } }, icon('trash'));
      remove.addEventListener('click', () => {
        scene.wishes = scene.wishes.filter(other => other !== wish);
        this.host.commit('wishes');
        this.show('scene');
      });
      wishes.append(h('li', {}, h('span', { textContent: wish.text }), remove));
    }

    const section = h('section', { class: 'stack' },
      field('收礼人', recipient, counter(recipient, LIMITS.recipient)),
      field('总祝福语', message, counter(message, LIMITS.sceneMessage)),
      h('h3', { textContent: '主题配色' }), themes,
      h('h3', { textContent: '雪量' }), h('div', { class: 'range' }, h('span', { textContent: '停' }), snow, h('span', { textContent: '大' })),
      h('h3', { textContent: '背景音乐' }), music, musicNote,
      h('h3', { textContent: `树上的愿望（${scene.wishes.length}/${LIMITS.wishes}）` }),
      scene.wishes.length ? wishes : h('p', { class: 'note', textContent: '点下方工具栏的“许愿”，写下的愿望会挂到树上。' }));

    if (matchMedia('(pointer: fine)').matches) {
      const record = h('button', { type: 'button', class: 'ghost wide', textContent: '进入录制模式' });
      record.addEventListener('click', () => this.host.startRecording());
      section.append(h('h3', { textContent: '录制视频' }),
        h('p', { class: 'note', textContent: '隐藏界面后用系统录屏录制。快捷键：H 隐藏界面，F 显示 9:16 取景框，D 自动演示，Esc 退出。' }), record);
    }

    const reset = h('button', { type: 'button', class: 'danger', textContent: '清空并恢复示例树' });
    reset.addEventListener('click', async () => {
      if (!reset.dataset.armed) {
        reset.dataset.armed = 'yes';
        reset.textContent = '会删除你的全部礼物和照片，再点一次确认';
        return;
      }
      await this.host.resetScene();
      this.selected = this.host.scene.gifts[0]?.id;
      this.show('scene');
      toast('已恢复示例树');
    });
    section.append(h('h3', { textContent: '重新开始' }), reset);
    return section;
  }

  private shareTab(): HTMLElement {
    const { scene } = this.host;
    const url = shareUrl(scene);
    const uploads = scene.gifts.filter(gift => gift.image.kind === 'upload').length;
    const link = h('input', { type: 'text', readOnly: true, value: url, attrs: { 'aria-label': '分享链接' } });
    link.addEventListener('focus', () => link.select());
    const copy = h('button', { type: 'button', class: 'primary', textContent: '复制链接' });
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(url);
        toast('链接已复制，发给 TA 吧');
      } catch {
        link.focus();
        link.select();
        toast('请长按或按 Ctrl+C 复制');
      }
    });
    const qr = h('canvas', { class: 'qr', attrs: { role: 'img', 'aria-label': '分享链接二维码' } });
    const caption = scene.recipient ? `送给 ${scene.recipient} 的圣诞树` : '一棵送给你的圣诞树';
    try {
      drawQrCard(qr, url, caption);
    } catch {
      qr.hidden = true;
    }
    const saveQr = h('button', { type: 'button', class: 'ghost', textContent: '保存二维码图片', disabled: qr.hidden === true });
    saveQr.addEventListener('click', () => qr.toBlob(blob => { if (blob) download(blob, 'snowlit-tree-qr.png'); }));

    const exportButton = h('button', { type: 'button', class: 'ghost', textContent: '导出礼物包' });
    exportButton.addEventListener('click', async () => {
      download(await exportPack(scene), `礼物包-${scene.recipient ?? '圣诞树'}.json`);
    });
    const importButton = h('button', { type: 'button', class: 'ghost', textContent: '导入礼物包' });
    importButton.addEventListener('click', async () => {
      const file = await pickFile('.json,application/json');
      if (!file) return;
      try {
        const imported = await importPack(file);
        if (!confirm(`导入后会替换当前这棵树（${imported.gifts.length} 个礼物）。继续吗？`)) return;
        await this.host.replaceScene(imported);
        this.selected = imported.gifts[0]?.id;
        toast('礼物包已导入');
        this.show('gifts');
      } catch (error) {
        toast(error instanceof Error ? error.message : '导入失败');
      }
    });

    return h('section', { class: 'stack' },
      h('h3', { textContent: '分享链接' }),
      h('p', { class: 'note', textContent: '树的内容压缩在链接里，不经过任何服务器。对方打开就能点亮、拆礼物。' }),
      uploads ? h('p', { class: 'warn', textContent: `你上传的 ${uploads} 张照片不会出现在链接里，对方看到的是没有照片的卡片。想带照片，请用下面的礼物包。` }) : null,
      url.length > 1800 ? h('p', { class: 'warn', textContent: '内容较多，二维码会很密，扫码可能困难。可以缩短祝福语，或直接发送链接。' }) : null,
      h('div', { class: 'copy-row' }, link, copy),
      qr, saveQr,
      h('h3', { textContent: '礼物包（含照片）' }),
      h('p', { class: 'note', textContent: '导出成一个 .json 文件，对方打开网页后在“分享”里导入即可看到全部照片。也可用来备份或换设备。' }),
      h('div', { class: 'pair' }, exportButton, importButton));
  }
}
