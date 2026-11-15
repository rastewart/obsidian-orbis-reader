export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '');
}
/**
 * The real one gathers a note's tags from its frontmatter AND its body, returning them with the leading `#`.
 * Frontmatter is all a test can hand over, so that is what this reads — enough for the library's projection,
 * which strips the `#` and compares the rest.
 */
export function getAllTags(cache: { frontmatter?: Record<string, unknown> | null } | null): string[] | null {
  const raw = cache?.frontmatter?.tags;
  if (raw === undefined || raw === null) return null;
  const list = Array.isArray(raw) ? raw : [raw];
  return list
    .filter((tag): tag is string => typeof tag === 'string')
    .map((tag) => (tag.startsWith('#') ? tag : `#${tag}`));
}

export class Plugin {}
export class App {}
export class TFile {
  path = '';
  name = '';
  basename = '';
  extension = '';
  parent: { path: string } | null = null;
}
export class TFolder {
  path = '';
  children: (TFile | TFolder)[] = [];
}
/** Depth-first over a folder tree, as Obsidian's does — what a folder picker lists its options from. */
export class Vault {
  static recurseChildren(root: TFolder | TFile, cb: (f: TFolder | TFile) => void): void {
    cb(root);
    if (root instanceof TFolder) for (const c of root.children) Vault.recurseChildren(c, cb);
  }
}
export class FileView {}
export class Menu {}
export class Modal {}
export class Notice {}
export class Platform {}
export class Setting {}
export class WorkspaceLeaf {}
export class Component {}
export class FuzzySuggestModal {}
export class ItemView {}
export class PluginSettingTab {}
export class SettingPage {}

/** Obsidian draws an SVG into the element; a test only cares that the control exists and what it says. */
export function setIcon(el: HTMLElement, icon: string): void {
  el.setAttribute('data-icon', icon);
}

/**
 * **The three form components, real enough to be driven.**
 *
 * Obsidian's own are thin wrappers over a `<select>`, a `<button>` and an `<input>`, and the only thing a test
 * needs from them is that the element lands in the DOM and that a change/click on it reaches the handler the code
 * registered. So these build the real element and wire the real event — a test dispatches `change` on the select
 * the way a person picks from it, rather than reaching for a handler the mock happened to store.
 */
export class DropdownComponent {
  readonly selectEl: HTMLSelectElement;
  constructor(containerEl: HTMLElement) {
    this.selectEl = containerEl.ownerDocument.createElement('select');
    containerEl.appendChild(this.selectEl);
  }
  addOption(value: string, display: string): this {
    const opt = this.selectEl.ownerDocument.createElement('option');
    opt.value = value;
    opt.textContent = display;
    this.selectEl.appendChild(opt);
    return this;
  }
  getValue(): string {
    return this.selectEl.value;
  }
  setValue(value: string): this {
    this.selectEl.value = value;
    return this;
  }
  onChange(cb: (value: string) => void): this {
    this.selectEl.addEventListener('change', () => cb(this.selectEl.value));
    return this;
  }
}

export class ButtonComponent {
  readonly buttonEl: HTMLButtonElement;
  constructor(containerEl: HTMLElement) {
    this.buttonEl = containerEl.ownerDocument.createElement('button');
    containerEl.appendChild(this.buttonEl);
  }
  setButtonText(text: string): this {
    this.buttonEl.textContent = text;
    return this;
  }
  setIcon(icon: string): this {
    setIcon(this.buttonEl, icon);
    return this;
  }
  setTooltip(text: string): this {
    this.buttonEl.setAttribute('aria-label', text);
    return this;
  }
  setDisabled(disabled: boolean): this {
    this.buttonEl.disabled = disabled;
    return this;
  }
  setClass(cls: string): this {
    this.buttonEl.className = cls;
    return this;
  }
  onClick(cb: (evt: MouseEvent) => void): this {
    this.buttonEl.addEventListener('click', (e) => cb(e as MouseEvent));
    return this;
  }
}

export class TextComponent {
  readonly inputEl: HTMLInputElement;
  constructor(containerEl: HTMLElement) {
    this.inputEl = containerEl.ownerDocument.createElement('input');
    this.inputEl.type = 'text';
    containerEl.appendChild(this.inputEl);
  }
  getValue(): string {
    return this.inputEl.value;
  }
  setValue(value: string): this {
    this.inputEl.value = value;
    return this;
  }
  setPlaceholder(text: string): this {
    this.inputEl.placeholder = text;
    return this;
  }
  onChange(cb: (value: string) => void): this {
    this.inputEl.addEventListener('input', () => cb(this.inputEl.value));
    return this;
  }
}
