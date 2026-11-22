import { presetImage } from '../data/gifts';
import type { Gift } from '../data/gifts';

export class GiftCard {
  private readonly image: HTMLImageElement;
  private readonly name: HTMLElement;
  private readonly message: HTMLElement;
  private readonly from: HTMLElement;
  private readonly to: HTMLElement;
  private readonly dismiss: HTMLButtonElement;
  private readonly rewrap: HTMLButtonElement;

  constructor(private readonly dialog: HTMLDialogElement, onClose: () => void, onRewrap: () => void) {
    this.image = dialog.querySelector<HTMLImageElement>('#gift-image')!;
    this.name = dialog.querySelector<HTMLElement>('#gift-name')!;
    this.message = dialog.querySelector<HTMLElement>('#gift-message')!;
    this.from = dialog.querySelector<HTMLElement>('#gift-from')!;
    this.to = dialog.querySelector<HTMLElement>('#gift-to')!;
    this.dismiss = dialog.querySelector<HTMLButtonElement>('.gift-dismiss')!;
    this.rewrap = dialog.querySelector<HTMLButtonElement>('.gift-rewrap')!;
    this.dismiss.addEventListener('click', onClose);
    this.rewrap.addEventListener('click', onRewrap);
    dialog.addEventListener('cancel', event => { event.preventDefault(); onClose(); });
    dialog.addEventListener('click', event => { if (event.target === dialog) onClose(); });
  }

  prepare(gift: Gift): void {
    this.name.textContent = gift.name;
    this.message.textContent = gift.message;
    this.setSignature(this.from, gift.from);
    this.setSignature(this.to, gift.to);
    const image = presetImage(gift.image);
    if (image) this.image.src = image;
    else this.image.removeAttribute('src');
    this.image.parentElement!.hidden = !image;
  }

  show(): void {
    delete this.dialog.dataset.leaving;
    this.dismiss.disabled = this.rewrap.disabled = false;
    this.dialog.showModal();
  }

  startClosing(): void {
    this.dialog.dataset.leaving = '';
    this.dismiss.disabled = this.rewrap.disabled = true;
  }

  hide(): void {
    this.dialog.close();
  }

  private setSignature(row: HTMLElement, value?: string): void {
    row.hidden = !value;
    row.querySelector('dd')!.textContent = value ?? '';
  }
}
