import { LIMITS } from '../data/gifts';
import { h, icon } from './dom';

export interface HudActions {
  wish(): void;
  magic(): void;
  edit(): void;
  sound(): void;
}

/** Everything drawn over the scene outside the editor: toolbar, wish dialog and note, finale caption, recording frame. */
export class Hud {
  readonly toolbar: HTMLElement;
  private readonly magicButton: HTMLButtonElement;
  private readonly soundButton: HTMLButtonElement;
  private readonly hint: HTMLElement;
  private readonly wishDialog: HTMLDialogElement;
  private readonly wishText: HTMLTextAreaElement;
  private readonly wishNote: HTMLElement;
  private readonly finale: HTMLElement;
  private readonly frame: HTMLElement;
  private readonly help: HTMLElement;
  private hintTimer?: ReturnType<typeof setTimeout>;
  private helpTimer?: ReturnType<typeof setTimeout>;

  constructor(private readonly stage: HTMLElement, actions: HudActions, guest: boolean) {
    const tool = (label: string, glyph: Parameters<typeof icon>[0], action: () => void) => {
      const button = h('button', { type: 'button', class: 'tool' }, icon(glyph), h('span', { textContent: label }));
      button.addEventListener('click', action);
      return button;
    };
    this.magicButton = tool('魔法', 'magic', actions.magic);
    this.soundButton = tool('声音', 'sound', actions.sound);
    this.toolbar = h('nav', { id: 'toolbar', class: 'toolbar', hidden: true, attrs: { 'aria-label': '工具栏' } },
      tool('许愿', 'wish', actions.wish), this.magicButton,
      tool(guest ? '我也做一棵' : '布置', guest ? 'tree' : 'edit', actions.edit), this.soundButton);
    this.hint = h('p', { class: 'hint', hidden: true, textContent: '轻点礼盒拆开礼物 · 拖动旋转' });

    this.wishText = h('textarea', { maxLength: LIMITS.wish, rows: 3, placeholder: '写一句愿望，它会挂到树上', attrs: { 'aria-label': '愿望' } });
    const count = h('span', { class: 'counter', textContent: `0/${LIMITS.wish}` });
    const submit = h('button', { type: 'submit', class: 'primary', value: 'ok', textContent: '挂到树上', disabled: true });
    this.wishText.addEventListener('input', () => {
      count.textContent = `${Array.from(this.wishText.value).length}/${LIMITS.wish}`;
      submit.disabled = !this.wishText.value.trim();
    });
    this.wishDialog = h('dialog', { id: 'wish-dialog', attrs: { 'aria-label': '许个愿' } },
      h('form', { method: 'dialog', class: 'panel wish-form' },
        h('h2', { textContent: '许个愿' }),
        this.wishText, count,
        h('div', { class: 'actions' }, h('button', { type: 'submit', class: 'ghost', value: 'cancel', textContent: '取消', formNoValidate: true }), submit)));
    this.wishDialog.addEventListener('click', event => { if (event.target === this.wishDialog) this.wishDialog.close('cancel'); });

    this.wishNote = h('div', { class: 'wish-note', hidden: true, attrs: { role: 'status' } });
    this.finale = h('section', { class: 'finale', hidden: true, attrs: { 'aria-live': 'polite' } });
    this.finale.addEventListener('click', () => this.hideFinale());
    this.frame = h('div', { id: 'rec-frame', hidden: true });
    this.help = h('p', { class: 'rec-help', hidden: true, textContent: 'H 隐藏界面 · F 9:16 取景框 · D 自动演示 · Esc 退出录制' });
    stage.append(this.toolbar, this.hint, this.wishDialog, this.wishNote, this.finale, this.frame, this.help, h('div', { id: 'toast', class: 'toast', hidden: true, attrs: { role: 'status' } }));
  }

  setToolbar(visible: boolean): void {
    this.toolbar.hidden = !visible;
  }

  setMagic(active: boolean): void {
    this.magicButton.setAttribute('aria-pressed', String(active));
    this.magicButton.lastElementChild!.textContent = active ? '变回树' : '魔法';
  }

  setMuted(muted: boolean): void {
    this.soundButton.replaceChild(icon(muted ? 'mute' : 'sound'), this.soundButton.firstElementChild!);
    this.soundButton.setAttribute('aria-pressed', String(!muted));
    this.soundButton.lastElementChild!.textContent = muted ? '静音' : '声音';
  }

  showHint(): void {
    this.hint.hidden = false;
    this.hint.dataset.show = '';
    clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(() => {
      delete this.hint.dataset.show;
      this.hintTimer = setTimeout(() => { this.hint.hidden = true; }, 900);
    }, 6500);
  }

  hideHint(): void {
    clearTimeout(this.hintTimer);
    delete this.hint.dataset.show;
    this.hint.hidden = true;
  }

  askWish(): Promise<string | undefined> {
    this.wishText.value = '';
    this.wishText.dispatchEvent(new Event('input'));
    this.wishDialog.returnValue = '';
    this.wishDialog.showModal();
    return new Promise(resolve => {
      this.wishDialog.addEventListener('close', () => {
        const text = this.wishText.value.trim();
        resolve(this.wishDialog.returnValue === 'ok' && text ? text : undefined);
      }, { once: true });
    });
  }

  showWishNote(text: string): void {
    this.wishNote.textContent = text;
    this.wishNote.hidden = false;
  }

  get wishNoteOpen(): boolean {
    return !this.wishNote.hidden;
  }

  placeWishNote(x: number, y: number, visible: boolean): void {
    this.wishNote.style.transform = `translate(${x}px, ${y}px) translate(-50%, calc(-100% - 14px))`;
    this.wishNote.style.opacity = visible ? '1' : '0';
  }

  hideWishNote(): void {
    this.wishNote.hidden = true;
  }

  showFinale(title: string, message?: string): void {
    this.finale.replaceChildren(h('h2', { textContent: title }), message ? h('p', { textContent: message }) : '');
    this.finale.hidden = false;
    requestAnimationFrame(() => { this.finale.dataset.show = ''; });
  }

  hideFinale(): void {
    delete this.finale.dataset.show;
    setTimeout(() => { if (!this.finale.dataset.show) this.finale.hidden = true; }, 1200);
  }

  /** Recording mode: `clean` hides every control; the 9:16 frame is only a framing guide. */
  setClean(clean: boolean): void {
    this.stage.toggleAttribute('data-clean', clean);
  }

  get clean(): boolean {
    return this.stage.hasAttribute('data-clean');
  }

  toggleFrame(force?: boolean): void {
    this.frame.hidden = force === undefined ? !this.frame.hidden : !force;
  }

  flashHelp(): void {
    this.help.hidden = false;
    clearTimeout(this.helpTimer);
    this.helpTimer = setTimeout(() => { this.help.hidden = true; }, 4200);
  }
}
