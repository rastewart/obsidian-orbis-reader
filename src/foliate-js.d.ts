declare module 'foliate-js/view.js' {
  export const View: CustomElementConstructor | undefined;
  export function makeBook(file: File): Promise<unknown>;
  /** The link a click on `target` follows — `<a>`, `<area>`, SVG `xlink:href`, MathML `href` — or null. ORBIS patch 23. */
  export function findLink(target: EventTarget | null): { element: Element; href: string } | null;
  /** Whether `target` is in an SVG drawing, or in HTML inside one. ORBIS patch 27. */
  export function insideSvg(target: EventTarget | null): boolean;
}

declare module 'foliate-js/mobi.js' {
  /** The parser the reader already uses for `mobi` and `azw3`. `open` returns the book, which carries `getCover`. */
  export interface MobiMetadata {
    title?: string;
    author?: string[];
    publisher?: string;
    /** A string in some books and a list in others — the header holds one field, EXTH can hold several. */
    language?: string | string[];
    published?: string;
    subject?: string[];
  }
  export class MOBI {
    constructor(options: { unzlib: (data: Uint8Array) => Uint8Array });
    open(file: Blob): Promise<{ getCover?(): Promise<Blob | undefined>; metadata?: MobiMetadata }>;
  }
}

declare module 'foliate-js/epub.js' {
  export class EPUB {
    constructor(loader: unknown);
    init(): Promise<unknown>;
  }
  /** Each `url(…)` in a stylesheet, with its address as written. ORBIS patch 25. */
  export function cssURLMatches(css: string): { index: number; match: string; url: string }[];
  /** A `srcset` with each address replaced by `load`'s answer, in one pass. ORBIS patch 28. */
  export function replaceSrcset(srcset: string, load: (url: string) => Promise<string>): Promise<string>;
}

declare module 'foliate-js/paginator.js' {
  /** A number before `vw` / `vh`, as the paginator rewrites them. ORBIS patch 26. */
  export const VIEWPORT_WIDTH: RegExp;
  export const VIEWPORT_HEIGHT: RegExp;
}

declare module 'foliate-js/overlayer.js' {
  // Exported so Orbis can supply its own draw function (reader/mark-draw.ts) — Overlayer.add takes the
  // draw function as a parameter, so a treatment foliate lacks needs no fork.
  export type OverlayRect = {
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
  };
  export type DrawFn = (rects: OverlayRect[], options?: Record<string, unknown>) => SVGElement;
  export class Overlayer {
    constructor(doc: Document);
    get element(): SVGElement;
    add(key: string, range: Range | ((root: Node) => Range), draw: DrawFn, options?: Record<string, unknown>): void;
    remove(key: string): void;
    redraw(): void;
    hitTest(point: { x: number; y: number }): [string, Range] | [];
    static highlight: DrawFn;
    static underline: DrawFn;
    static strikethrough: DrawFn;
    static squiggly: DrawFn;
    static outline: DrawFn;
  }
}

declare module 'foliate-js/epubcfi.js' {
  /** One step of a CFI path: `/48` is `{ index: 48 }`, `/1:92` is `{ index: 1, offset: 92 }`. */
  export interface CfiPart {
    index: number;
    id?: string;
    offset?: number;
  }
  /** A point CFI is one array of steps per indirection level (`!`); a RANGE CFI is the object form. */
  export type ParsedCfi = CfiPart[][] | { parent: CfiPart[][]; start: CfiPart[][]; end: CfiPart[][] };
  export function parse(cfi: string): ParsedCfi;
  export function fromRange(range: Range, filter?: (node: Node) => boolean): string;
  /** Run `fn` with each parent's indexed children cached — for many CFIs in one document that does not change
   *  meanwhile, which must also mean `fn` is synchronous. ORBIS patch 10. */
  export function withIndexCache<T>(fn: () => T): T;
  /** Resolve a parsed CFI back to a Range in `doc`. The counterpart of `fromRange`, and what lets a stored
   *  annotation be found again in a freshly parsed section document — outside the reader. */
  export function toRange(doc: Document, parts: ParsedCfi, filter?: (node: Node) => boolean): Range;
  export function joinIndir(...parts: string[]): string;
  export function collapse(cfi: string, toEnd: boolean): string;
  export function compare(a: string, b: string): number;
  export const fake: { fromIndex(index: number): string };
  export const isCFI: RegExp;
}

declare module 'foliate-js/progress.js' {
  /** Book progress from section sizes: foliate's own, with ORBIS patch 16's `startFraction`. */
  export class SectionProgress {
    constructor(
      sections: ReadonlyArray<{ size?: number; linear?: string }>,
      sizePerLoc: number,
      sizePerTimeUnit: number
    );
    /** `fraction` is the END of the page — `pageFraction` past `fractionInSection`; `startFraction` its top. */
    getProgress(
      index: number,
      fractionInSection: number,
      pageFraction?: number
    ): { fraction: number; startFraction: number; location: { current: number; next: number; total: number } };
  }
}
