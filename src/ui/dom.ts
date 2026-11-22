type Child = Node | string | false | null | undefined;
type Props<K extends keyof HTMLElementTagNameMap> = Partial<Omit<HTMLElementTagNameMap[K], 'dataset' | 'style'>> & {
  class?: string;
  dataset?: Record<string, string>;
  attrs?: Record<string, string>;
};

/** Minimal element builder: h('button', { class: 'x', onclick }, 'label'). */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props<K> = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  const { class: className, dataset, attrs, ...rest } = props;
  if (className) element.className = className;
  Object.assign(element, rest);
  if (dataset) Object.assign(element.dataset, dataset);
  if (attrs) for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, value);
  for (const child of children) if (child) element.append(child);
  return element;
}

const ICONS = {
  close: '<path d="m7 7 10 10M17 7 7 17"/>',
  wish: '<path d="M12 3.5l2.2 5.1 5.3.5-4 3.6 1.2 5.3L12 15.3 7.3 18l1.2-5.3-4-3.6 5.3-.5z"/>',
  magic: '<path d="M5 19 15.5 8.5M14 5l1 2.5L17.5 8.5 15 9.5 14 12l-1-2.5L10.5 8.5 13 7.5zM19 13l.6 1.4L21 15l-1.4.6L19 17l-.6-1.4L17 15l1.4-.6zM8 3l.5 1.2L9.7 4.7 8.5 5.2 8 6.4l-.5-1.2-1.2-.5 1.2-.5z"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4"/>',
  tree: '<path d="M12 3 7 10h3l-4 6h5v4h2v-4h5l-4-6h3z"/>',
  sound: '<path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4zM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  mute: '<path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4zM16 9.5l5 5M21 9.5l-5 5"/>',
  up: '<path d="m7 14 5-5 5 5"/>',
  down: '<path d="m7 10 5 5 5-5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  upload: '<path d="M12 16V5M7.5 9.5 12 5l4.5 4.5M5 19h14"/>',
  trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/>',
} as const;

export function icon(name: keyof typeof ICONS): SVGSVGElement {
  const template = document.createElement('template');
  template.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" class="icon">${ICONS[name]}</svg>`;
  return template.content.firstElementChild as SVGSVGElement;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(message: string): void {
  const element = document.querySelector<HTMLElement>('#toast')!;
  element.textContent = message;
  element.hidden = false;
  element.dataset.show = '';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    delete element.dataset.show;
    toastTimer = setTimeout(() => { element.hidden = true; }, 300);
  }, 2400);
}

export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = h('a', { href: url, download: filename });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function pickFile(accept: string): Promise<File | undefined> {
  return new Promise(resolve => {
    const input = h('input', { type: 'file', accept });
    input.addEventListener('change', () => resolve(input.files?.[0]), { once: true });
    input.addEventListener('cancel', () => resolve(undefined), { once: true });
    input.click();
  });
}
