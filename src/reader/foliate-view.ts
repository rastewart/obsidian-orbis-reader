// Structural types for the foliate-js `<foliate-view>` custom element, shared by
// OrbisReaderView and the reader collaborators (via ReaderContext) so they don't
// each redeclare the shape. These describe only the members Orbis actually uses.

export interface FoliateHistory extends EventTarget {
  canGoBack: boolean;
  canGoForward: boolean;
  back(): void;
  forward(): void;
  clear(): void;
}

export interface FoliateViewEl extends HTMLElement {
  open(book: unknown): Promise<void>;
  init(opts: { lastLocation?: string | null; showTextStart?: boolean }): Promise<void>;
  goTo(target: string): Promise<void>;
  goToFraction(frac: number): Promise<void>;
  close(): void;
  next(): Promise<void>;
  prev(): Promise<void>;
  history: FoliateHistory;
  renderer: HTMLElement;
  addAnnotation(annotation: { value: string; [key: string]: unknown }): Promise<void>;
  deleteAnnotation(annotation: { value: string }): Promise<void>;
  /** Resolve a CFI (or href) to its section index + an `anchor(doc)` that yields the
   *  DOM Range (range CFI) or element (point CFI) within that section's document.
   *  **Synchronous**, and `undefined` for a target it cannot resolve — foliate catches and logs. */
  resolveNavigation(target: string): { index: number; anchor: (doc: Document) => Range | Node | null } | undefined;
  /** The CFI for a range in a section — used to page to a sentence the keyboard has selected off-screen. */
  getCFI(index: number, range: Range): string;
  /** TOC/page progress for a specific range in a section — used to label the audio player by the
   *  sentence being read (its TOC entry), not the view's parked page. */
  getProgressOf(index: number, range: Range): { tocItem?: { label?: string; href?: string } | null } | undefined;
}

// Named in the tag map so Obsidian's `createEl('foliate-view')` knows the element, and builds it in the document
// of the element it is created on — not `activeDocument`, which in a pop-out window may be another window's.
declare global {
  interface HTMLElementTagNameMap {
    'foliate-view': FoliateViewEl;
  }
}

/**
 * One entry in the book's spine, as foliate hands it over.
 *
 * **Declared once, here.** `book-extractor` uses `linear`, `size` and `resolveHref`; `reader/tts/recording` uses
 * `cfi`; both use `createDocument` and `unload`. Two partial views of one object would agree by luck rather than by
 * construction — and this file exists to stop exactly that ("so they don't each redeclare the shape"). Every field is
 * optional because foliate populates them per format.
 *
 * **`linear` is the spine attribute's own string** — `'no'` for a section outside the reading order — never a
 * boolean. Every list and export includes non-linear sections on purpose: in an EPUB they are usually an empty cover
 * or a contents page, and FB2 marks its notes body `'no'`, so skipping them would lose every FB2 book's footnotes.
 */
export type RawSection = {
  linear?: string;
  size?: number;
  cfi?: string;
  createDocument?(): Promise<Document>;
  unload?(): void;
  resolveHref?: (href: string) => string;
};
