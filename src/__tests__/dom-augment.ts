// Obsidian's DOM augmentations, for a test that exercises code written against them.
//
// Obsidian adds `createEl`, `addClass`, `empty`, `win` and friends to `HTMLElement` at runtime, so any module that
// builds DOM the way the rest of the plugin does is unreachable from jsdom without them. Most tests dodge this by
// building their rows with `document.createElement` and calling only pure helpers — which is why the drag path had
// no test until a drop stopped moving anything and nothing caught it.
//
// Deliberately the smallest set that the list controls need, and no attempt at fidelity beyond their shape: this is a
// test harness, not a second implementation of Obsidian.

interface ElOpts {
  cls?: string;
  text?: string;
  attr?: Record<string, string>;
}

let done = false;

/** Add the augmentations to `HTMLElement.prototype`, once per test run. */
export function augmentDom(): void {
  if (done) return;
  done = true;
  const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
  proto.createEl = function createEl(this: HTMLElement, tag: string, opts: ElOpts = {}): HTMLElement {
    const el = document.createElement(tag);
    if (opts.cls) el.className = opts.cls;
    if (opts.text) el.textContent = opts.text;
    for (const [name, value] of Object.entries(opts.attr ?? {})) el.setAttribute(name, value);
    this.appendChild(el);
    return el;
  };
  proto.createDiv = function createDiv(this: HTMLElement, opts: ElOpts = {}): HTMLElement {
    return (this as unknown as { createEl: (tag: string, o: ElOpts) => HTMLElement }).createEl('div', opts);
  };
  proto.createSpan = function createSpan(this: HTMLElement, opts: ElOpts = {}): HTMLElement {
    return (this as unknown as { createEl: (tag: string, o: ElOpts) => HTMLElement }).createEl('span', opts);
  };
  proto.setText = function setText(this: HTMLElement, text: string): void {
    this.textContent = text;
  };
  // Obsidian's `toggle`/`isShown` are a display flip and a read of it — not the `hidden` attribute, which is why
  // code elsewhere asks `isShown()` rather than looking at the element.
  proto.toggle = function toggle(this: HTMLElement, show: boolean): void {
    this.style.display = show ? '' : 'none';
  };
  proto.isShown = function isShown(this: HTMLElement): boolean {
    return this.style.display !== 'none';
  };
  proto.hide = function hide(this: HTMLElement): void {
    (this as unknown as { toggle: (show: boolean) => void }).toggle(false);
  };
  proto.show = function show(this: HTMLElement): void {
    (this as unknown as { toggle: (show: boolean) => void }).toggle(true);
  };
  proto.setCssProps = function setCssProps(this: HTMLElement, props: Record<string, string>): void {
    for (const [name, value] of Object.entries(props)) this.style.setProperty(name, value);
  };
  // `el.instanceOf(HTMLElement)` is Obsidian's cross-window `instanceof`: a popped-out leaf has its own window, and
  // its HTMLElement is a different constructor from this one's. One window in a test, so this is the plain check.
  (Node.prototype as unknown as Record<string, unknown>).instanceOf = function instanceOf(
    this: Node,
    // biome-ignore lint/suspicious/noExplicitAny: a constructor of anything is what the real signature takes
    type: new (...args: any[]) => unknown
  ): boolean {
    return this instanceof type;
  };
  proto.empty = function empty(this: HTMLElement): void {
    while (this.firstChild) this.removeChild(this.firstChild);
  };
  proto.addClass = function addClass(this: HTMLElement, ...cls: string[]): void {
    this.classList.add(...cls);
  };
  proto.removeClass = function removeClass(this: HTMLElement, ...cls: string[]): void {
    this.classList.remove(...cls);
  };
  proto.toggleClass = function toggleClass(this: HTMLElement, cls: string, on: boolean): void {
    this.classList.toggle(cls, on);
  };
  proto.hasClass = function hasClass(this: HTMLElement, cls: string): boolean {
    return this.classList.contains(cls);
  };
  Object.defineProperty(proto, 'win', { get: () => window, configurable: true });
  // And its document, which is the one the element is in: `ownerDocument`, as Obsidian's `doc` is.
  Object.defineProperty(proto, 'doc', {
    get(this: HTMLElement) {
      return this.ownerDocument;
    },
    configurable: true,
  });
  // Pointer capture is how a drag keeps receiving moves once the finger leaves the handle; jsdom has no pointer
  // implementation at all, so the call has to be a no-op rather than a throw.
  (Element.prototype as unknown as Record<string, unknown>).setPointerCapture = (): void => {};
  (Element.prototype as unknown as Record<string, unknown>).releasePointerCapture = (): void => {};
}

/**
 * Give an element a fixed position, since jsdom lays nothing out and reports every rectangle as zero.
 *
 * The drop target is decided by comparing the pointer against the midpoints of the rows, so rows with no height are
 * rows with no midpoints — the arithmetic under test would be reading zeroes.
 */
export function stubBand(el: HTMLElement, top: number, height: number): void {
  el.getBoundingClientRect = () =>
    ({ top, bottom: top + height, height, left: 0, right: 0, width: 0, x: 0, y: top }) as DOMRect;
}

/** A pointer event jsdom can dispatch: it has no `PointerEvent`, and the handlers only read these fields. */
export function pointer(type: string, clientY: number): MouseEvent {
  return new MouseEvent(type, { clientY, bubbles: true });
}
