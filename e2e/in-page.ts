// Functions that run INSIDE Obsidian, passed to `Page.run`.
//
// Each crosses to the page as its source text, so it may use only its own arguments and the page's globals. That is
// also why the types here are local and loose: the page's `app` is Obsidian's, and Orbis's view is reached as the
// plugin builds it, through fields TypeScript would call private. A test that needs a new reach into the view adds
// it to `ReaderView` below, which is the list of what the tests depend on.

/** The parts of Obsidian's `app` the tests use. */
interface PageApp {
  vault: {
    getAbstractFileByPath(path: string): unknown;
    adapter: { read(path: string): Promise<string>; exists(path: string): Promise<boolean> };
  };
  workspace: {
    getLeaf(kind: 'tab'): PageLeaf & { openFile(file: unknown): Promise<void> };
    getLeavesOfType(type: string): PageLeaf[];
    setActiveLeaf(leaf: PageLeaf, options: { focus: boolean }): void;
  };
  plugins: {
    plugins: Record<string, { settings: { noteStyles: { config: unknown }[] } }>;
    disablePlugin(id: string): Promise<void>;
    enablePlugin(id: string): Promise<void>;
  };
}

/** Obsidian's command registry. */
interface PageCommands {
  commands: Record<string, { id: string; name: string; checkCallback?: (checking: boolean) => boolean | undefined }>;
  executeCommandById(id: string): boolean;
}

interface PageLeaf {
  view: unknown;
  detach(): void;
}

/** Where the open book is. */
export interface Place {
  /** The section on screen. */
  section: number;
  /** Orbis's location number, about a page of text. */
  loc: number | null;
  cfi: string | null;
  /** Whether the columns sit on a page boundary, rather than shifted part of a page sideways. */
  onPage: boolean;
}

/** The parts of `OrbisReaderView` the tests use. */
interface ReaderView {
  file?: { path: string };
  loadedDocs: Set<Document>;
  bookSections: unknown[];
  tocItems: unknown[];
  /** Where the reader is, as foliate last reported it, and the place last written to the book's location file. */
  lastCfi: string | null;
  lastSavedCfi: string | null;
  lastLocation: { current: number; total: number } | null;
  hrefToSectionIndex(href: string): number;
  foliateView?: {
    goTo(target: number | string): Promise<unknown>;
    renderer: {
      getContents(): { doc: Document; index: number }[];
      next(): Promise<unknown>;
      /** How far the columns are scrolled, and the width of one page: a page boundary is a multiple of it. */
      containerPosition: number;
      size: number;
    };
  };
  annot: {
    highlights: unknown[];
    highlightRange(range: Range, sectionIndex: number): void;
    /** The book's marks, once they have loaded. `highlightRange` does nothing before then. */
    offeredPreset(): unknown;
  };
  writeNotesFile(path: string, config: unknown, insertAtBottom: boolean, openAfter: boolean): Promise<void>;
}

/** What a test learns about a book it opened. */
export interface OpenedBook {
  sections: number;
  tocEntries: number;
  /** The characters of text on screen, over every document rendered. */
  textLength: number;
  /** The images on screen: a comic's pages, a cover. */
  images: number;
}

/**
 * Opens `path` in a new tab and waits until a document of it has rendered: some text, or an image for a comic or a
 * cover. Every other Orbis tab is closed once the new one is open (closing them first can leave Obsidian with no tab
 * group to open it in), so each test starts with one book and the tests do not depend on their order.
 */
export async function openBook(path: string, timeoutMs: number): Promise<OpenedBook> {
  const app = (window as unknown as { app: PageApp }).app;
  const file = app.vault.getAbstractFileByPath(path);
  if (!file) throw new Error(`no file at ${path}`);
  const leaf = app.workspace.getLeaf('tab');
  await leaf.openFile(file);
  for (const other of app.workspace.getLeavesOfType('orbis-reader')) if (other !== leaf) other.detach();
  // In front and focused, as a book is when a person opens it: the page keys and a search's Enter belong to the
  // active view, and a note an earlier test opened beside it could otherwise keep that.
  app.workspace.setActiveLeaf(leaf, { focus: true });
  const view = leaf.view as ReaderView;
  const started = Date.now();
  for (;;) {
    let textLength = 0;
    let images = 0;
    for (const doc of view.loadedDocs ?? []) {
      textLength += (doc.body?.innerText ?? '').trim().length;
      images += doc.images.length + doc.querySelectorAll('svg image').length;
    }
    if (view.file?.path === path && (textLength > 0 || images > 0)) {
      return { sections: view.bookSections.length, tocEntries: view.tocItems.length, textLength, images };
    }
    if (Date.now() - started > timeoutMs) throw new Error(`${path} did not render within ${timeoutMs} ms`);
    await new Promise((r) => setTimeout(r, 200));
  }
}

/**
 * Goes through the open book's sections from the start until one shows text, and returns how much. A book opens at
 * its cover, which is often an image alone.
 */
export async function firstText(): Promise<{ section: number; textLength: number }> {
  const app = (window as unknown as { app: PageApp }).app;
  const view = app.workspace.getLeavesOfType('orbis-reader')[0]?.view as ReaderView | undefined;
  if (!view?.foliateView) throw new Error('no book is open');
  for (let index = 0; index < Math.min(view.bookSections.length, 6); index++) {
    await view.foliateView.goTo(index);
    for (let wait = 0; wait < 25; wait++) {
      const shown = view.foliateView.renderer.getContents().find((c) => c.index === index);
      const textLength = (shown?.doc.body?.innerText ?? '').trim().length;
      if (textLength > 0) return { section: index, textLength };
      if (shown) break;
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  return { section: -1, textLength: 0 };
}

/**
 * Marks paragraphs of the first section that has enough (or of the `nth` after it), in the order `order` gives (`[0, 2, 1]` is first, third,
 * second), `gapMs` apart. Returns the start of each marked paragraph's text, in book order, for a test to look for,
 * and how many marks the book holds afterwards.
 */
export async function markParagraphs(
  order: number[],
  gapMs: number,
  nth = 0
): Promise<{ starts: string[]; marks: number }> {
  const app = (window as unknown as { app: PageApp }).app;
  const view = app.workspace.getLeavesOfType('orbis-reader')[0]?.view as ReaderView | undefined;
  if (!view?.foliateView) throw new Error('no book is open');
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  // The marks load after the book opens; marking before then is silently nothing.
  for (let wait = 0; !view.annot.offeredPreset() && wait < 50; wait++) await sleep(200);
  if (!view.annot.offeredPreset()) throw new Error("the book's marks did not load");
  const needed = Math.max(...order) + 1;
  let skip = nth;
  for (let index = 0; index < view.bookSections.length; index++) {
    await view.foliateView.goTo(index);
    await sleep(800);
    const shown = view.foliateView.renderer.getContents().find((c) => c.index === index);
    const paragraphs = Array.from(shown?.doc.querySelectorAll('p') ?? []).filter(
      (p) => (p.textContent ?? '').trim().length > 40
    );
    if (!shown || paragraphs.length < needed || skip-- > 0) continue;
    for (const n of order) {
      // From the paragraph's first character to its last, as a person's selection runs. A range on the element
      // itself, (p, 0) to (p, n), is stored with its start and end at the same place, which the scan for problems
      // rightly calls broken.
      const range = shown.doc.createRange();
      const walker = shown.doc.createTreeWalker(paragraphs[n], NodeFilter.SHOW_TEXT);
      const texts: Text[] = [];
      for (let t = walker.nextNode(); t; t = walker.nextNode()) if ((t as Text).data.trim()) texts.push(t as Text);
      const first = texts[0];
      const last = texts[texts.length - 1];
      range.setStart(first, first.data.length - first.data.trimStart().length);
      range.setEnd(last, last.data.trimEnd().length);
      view.annot.highlightRange(range, index);
      await sleep(gapMs);
    }
    const starts = [...order]
      .sort((a, b) => a - b)
      .map((n) => (paragraphs[n].textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 30));
    return { starts, marks: view.annot.highlights.length };
  }
  throw new Error(`no section has ${needed} paragraphs`);
}

/** The open book's passage selections, as their positions, in the order Orbis holds them, once they have loaded. */
export async function markPositions(): Promise<string[]> {
  const app = (window as unknown as { app: PageApp }).app;
  const view = app.workspace.getLeavesOfType('orbis-reader')[0]?.view as ReaderView | undefined;
  if (!view) throw new Error('no book is open');
  for (let wait = 0; !view.annot.offeredPreset() && wait < 50; wait++) await new Promise((r) => setTimeout(r, 200));
  return (view.annot.highlights as { cfiRange?: string }[]).map((h) => h.cfiRange ?? '');
}

/** Writes the open book's notes with the default note style to `path`, and returns the file's text. */
export async function generateNotes(path: string): Promise<string> {
  const app = (window as unknown as { app: PageApp }).app;
  const view = app.workspace.getLeavesOfType('orbis-reader')[0]?.view as ReaderView | undefined;
  if (!view) throw new Error('no book is open');
  const style = app.plugins.plugins['orbis-reader'].settings.noteStyles[0];
  await view.writeNotesFile(path, style.config, false, false);
  return app.vault.adapter.read(path);
}

/**
 * Turns to `section` (an index, or a file in the book), then `pages` pages into it, and waits until Orbis has saved the place, as it does a second after
 * a reader stops. Returns the place.
 */
export async function turnTo(target: number | string, pages: number): Promise<Place> {
  const app = (window as unknown as { app: PageApp }).app;
  const view = app.workspace.getLeavesOfType('orbis-reader')[0]?.view as ReaderView | undefined;
  const fv = view?.foliateView;
  if (!view || !fv) throw new Error('no book is open');
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const section = typeof target === 'number' ? target : view.hrefToSectionIndex(target);
  if (section < 0) throw new Error(`no section is ${target}`);
  await fv.goTo(section);
  for (let wait = 0; wait < 25 && !fv.renderer.getContents().some((c) => c.index === section); wait++) await sleep(200);
  await sleep(400);
  for (let page = 0; page < pages; page++) {
    await fv.renderer.next();
    await sleep(400);
  }
  for (let wait = 0; wait < 40 && (!view.lastCfi || view.lastSavedCfi !== view.lastCfi); wait++) await sleep(200);
  if (view.lastSavedCfi !== view.lastCfi) throw new Error(`the place was not saved (${view.lastCfi})`);
  const { containerPosition, size } = fv.renderer;
  const pageAt = containerPosition / size;
  return {
    section: fv.renderer.getContents()[0]?.index ?? -1,
    loc: view.lastLocation?.current ?? null,
    cfi: view.lastCfi,
    onPage: Math.abs(pageAt - Math.round(pageAt)) < 0.02,
  };
}

/**
 * The open book's place once it has stopped moving: a book that opens lays itself out, finds its saved place, and can
 * settle again as the pane takes its size, so the place is read after it has stayed the same for a second.
 */
export async function settledPlace(timeoutMs: number): Promise<Place> {
  const app = (window as unknown as { app: PageApp }).app;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const started = Date.now();
  let last = '';
  let sameSince = Date.now();
  for (;;) {
    const view = app.workspace.getLeavesOfType('orbis-reader')[0]?.view as ReaderView | undefined;
    const r = view?.foliateView?.renderer;
    if (view && r && view.lastCfi) {
      const pageAt = r.containerPosition / r.size;
      const place: Place = {
        section: r.getContents()[0]?.index ?? -1,
        loc: view.lastLocation?.current ?? null,
        cfi: view.lastCfi,
        onPage: Math.abs(pageAt - Math.round(pageAt)) < 0.02,
      };
      const key = JSON.stringify([place, r.containerPosition]);
      if (key !== last) {
        last = key;
        sameSince = Date.now();
      } else if (Date.now() - sameSince >= 1000) return place;
    }
    if (Date.now() - started > timeoutMs) throw new Error(`the book did not settle within ${timeoutMs} ms`);
    await sleep(200);
  }
}

/** Closes every book's tab. */
export function closeBooks(): void {
  const app = (window as unknown as { app: PageApp }).app;
  for (const leaf of app.workspace.getLeavesOfType('orbis-reader')) leaf.detach();
}

/**
 * Turns Orbis off and on again, as updating it or reloading Obsidian's plugins does, and waits for the open book's
 * view to be built again and show text. Returns whether the view was in fact rebuilt.
 */
export async function reloadOrbis(timeoutMs: number): Promise<boolean> {
  const app = (window as unknown as { app: PageApp }).app;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const old = app.workspace.getLeavesOfType('orbis-reader')[0]?.view;
  await app.plugins.disablePlugin('orbis-reader');
  await app.plugins.enablePlugin('orbis-reader');
  const started = Date.now();
  for (;;) {
    const view = app.workspace.getLeavesOfType('orbis-reader')[0]?.view as ReaderView | undefined;
    const shown = [...(view?.loadedDocs ?? [])].some((doc) => (doc.body?.innerText ?? '').trim().length > 0);
    if (view && view !== old && shown) return true;
    if (Date.now() - started > timeoutMs) return false;
    await sleep(200);
  }
}

/** Opens `path` in a new tab beside the book, which hides the book's tab, as reading a note does. */
export async function openInNewTab(path: string): Promise<void> {
  const app = (window as unknown as { app: PageApp }).app;
  const file = app.vault.getAbstractFileByPath(path);
  if (!file) throw new Error(`no file at ${path}`);
  await app.workspace.getLeaf('tab').openFile(file);
}

/** Brings the book's tab to the front again. */
export function showBook(): void {
  const app = (window as unknown as { app: PageApp }).app;
  const leaf = app.workspace.getLeavesOfType('orbis-reader')[0];
  if (!leaf) throw new Error('no book is open');
  app.workspace.setActiveLeaf(leaf, { focus: true });
}
/** Orbis's commands that the palette offers with the book in front, by id and name. */
export function orbisCommands(): { id: string; name: string }[] {
  const app = (window as unknown as { app: PageApp & { commands: PageCommands } }).app;
  return Object.values(app.commands.commands)
    .filter((c) => c.id.startsWith('orbis-reader:') && (c.checkCallback ? c.checkCallback(true) !== false : true))
    .map((c) => ({ id: c.id, name: c.name }));
}

/** Runs a command as the palette does. */
export function runCommand(id: string): boolean {
  const app = (window as unknown as { app: PageApp & { commands: PageCommands } }).app;
  return app.commands.executeCommandById(id);
}

/** Puts `path` in front: its tab if a book is open, else a new one. */
export async function bookInFront(path: string): Promise<void> {
  const app = (window as unknown as { app: PageApp }).app;
  const leaf = app.workspace.getLeavesOfType('orbis-reader')[0];
  if (leaf) return app.workspace.setActiveLeaf(leaf, { focus: true });
  const file = app.vault.getAbstractFileByPath(path);
  if (!file) throw new Error(`no file at ${path}`);
  await app.workspace.getLeaf('tab').openFile(file);
}
/**
 * Every file in the vault, by path, for a test to see what a command wrote. Read from the disk rather than from
 * Obsidian's index of the vault, which takes a moment to learn of a new file.
 */
export async function vaultFiles(): Promise<string[]> {
  const adapter = (
    window as unknown as {
      app: { vault: { adapter: { list(dir: string): Promise<{ files: string[]; folders: string[] }> } } };
    }
  ).app.vault.adapter;
  const files: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    const listed = await adapter.list(dir);
    files.push(...listed.files);
    for (const folder of listed.folders) if (!folder.startsWith('.obsidian')) await walk(folder);
  };
  await walk('');
  return files.sort();
}

/** Reads a file of the vault. */
export function readVaultFile(path: string): Promise<string> {
  return (window as unknown as { app: PageApp }).app.vault.adapter.read(path);
}

/** Picks the choice in the open dialog whose label reads `text`, as a click on it does. */
export async function pickInDialog(text: string): Promise<void> {
  const find = () =>
    Array.from(document.querySelectorAll<HTMLElement>('.modal-container label, .orbis-popup label')).find((l) =>
      (l.textContent ?? '').includes(text)
    );
  // A dialog can draw itself a moment after the command that opens it returns.
  for (let wait = 0; !find() && wait < 25; wait++) await new Promise((r) => setTimeout(r, 200));
  const label = find();
  if (!label) throw new Error(`the dialog has no choice "${text}"`);
  label.click();
  await new Promise((r) => setTimeout(r, 300));
}

/**
 * Presses the open dialog's main button once it can be pressed (a dialog can fill itself in first), and waits until
 * the dialog has closed, which is when the work it does is done.
 */
export async function saveDialog(timeoutMs: number): Promise<void> {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const started = Date.now();
  const dialogs = () => document.querySelectorAll('.modal-container, .orbis-popup').length;
  let button: HTMLButtonElement | null = null;
  while (!button) {
    const found = Array.from(
      document.querySelectorAll<HTMLButtonElement>('.modal-container button.mod-cta, .orbis-popup button.mod-cta')
    ).pop();
    if (found && !found.disabled) button = found;
    else if (Date.now() - started > timeoutMs) throw new Error('the dialog had no main button to press');
    else await sleep(200);
  }
  const open = dialogs();
  button.click();
  while (dialogs() >= open) {
    if (Date.now() - started > timeoutMs) {
      const message = document.querySelector('.modal-container, .orbis-popup')?.textContent?.slice(0, 300);
      throw new Error(`the dialog did not close within ${timeoutMs} ms: ${message}`);
    }
    await sleep(200);
  }
}

/** What Orbis last copied. The test window keeps it rather than the computer's clipboard; see `launch.ts`. */
export function copiedText(): string {
  return (window as unknown as { orbisE2eClipboard: string }).orbisE2eClipboard;
}
/**
 * A PDF in the vault: whether it starts as one, how many pages it has, and how many comments (notes) it carries.
 *
 * The pages are counted by their `/Type /Page` objects. A PDF can keep its objects in compressed object streams, so
 * each of those is inflated first, with the browser's own `DecompressionStream`.
 */
export async function pdfInfo(path: string): Promise<{ isPdf: boolean; pages: number; comments: number }> {
  const app = (window as unknown as { app: { vault: { adapter: { readBinary(p: string): Promise<ArrayBuffer> } } } })
    .app;
  const bytes = new Uint8Array(await app.vault.adapter.readBinary(path));
  const latin1 = (b: Uint8Array) => new TextDecoder('latin1').decode(b);
  const text = latin1(bytes);
  let objects = text;
  for (const m of text.matchAll(/stream\r?\n/g)) {
    const dict = text.slice(Math.max(0, (m.index ?? 0) - 400), m.index);
    const length = /\/Length\s+(\d+)\s*(?!\d*\s+R)/.exec(dict.slice(dict.lastIndexOf('<<')));
    if (!dict.includes('/ObjStm') || !length) continue;
    const start = (m.index ?? 0) + m[0].length;
    const packed = bytes.slice(start, start + Number(length[1]));
    try {
      const stream = new Blob([packed]).stream().pipeThrough(new DecompressionStream('deflate'));
      objects += latin1(new Uint8Array(await new Response(stream).arrayBuffer()));
    } catch {
      /* not a deflated stream */
    }
  }
  return {
    isPdf: text.startsWith('%PDF-'),
    pages: (objects.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length,
    // A note is a `/Text` annotation, the pin a viewer lists in its comments.
    comments: (objects.match(/\/Subtype\s*\/Text(?!\w)/g) ?? []).length,
  };
}

/**
 * Waits for a book a command opened to show text, and returns its path, its contents' labels and its text so far.
 * For a book opened some other way than `openBook`: from a note, by Read in Orbis Reader.
 */
export async function shownBook(timeoutMs: number): Promise<{ path: string; contents: string[]; text: string }> {
  const app = (window as unknown as { app: PageApp }).app;
  const started = Date.now();
  for (;;) {
    for (const leaf of app.workspace.getLeavesOfType('orbis-reader')) {
      const view = leaf.view as ReaderView;
      const text = [...(view.loadedDocs ?? [])].map((doc) => (doc.body?.innerText ?? '').trim()).join('\n');
      if (view.file && text) {
        const labels: string[] = [];
        const walk = (items: unknown[]) => {
          for (const item of items as { label?: string; subitems?: unknown[] }[]) {
            labels.push((item.label ?? '').trim());
            if (item.subitems?.length) walk(item.subitems);
          }
        };
        walk(view.tocItems ?? []);
        return { path: view.file.path, contents: labels, text };
      }
    }
    if (Date.now() - started > timeoutMs) throw new Error(`no book showed text within ${timeoutMs} ms`);
    await new Promise((r) => setTimeout(r, 200));
  }
}
/** The text of each of the open book's sections, as the reader renders them, going to each in turn. */
export async function sectionTexts(maxSections: number): Promise<string[]> {
  const app = (window as unknown as { app: PageApp }).app;
  const view = app.workspace.getLeavesOfType('orbis-reader')[0]?.view as ReaderView | undefined;
  const fv = view?.foliateView;
  if (!view || !fv) throw new Error('no book is open');
  const texts: string[] = [];
  for (let index = 0; index < Math.min(view.bookSections.length, maxSections); index++) {
    await fv.goTo(index);
    let text = '';
    for (let wait = 0; wait < 25; wait++) {
      const shown = fv.renderer.getContents().find((c) => c.index === index);
      text = (shown?.doc.body?.innerText ?? '').trim();
      if (shown) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    // A moment for what the section does on its own once shown, such as a script that tries to run.
    await new Promise((r) => setTimeout(r, 300));
    const shown = fv.renderer.getContents().find((c) => c.index === index);
    texts.push((shown?.doc.body?.innerText ?? text).trim());
  }
  return texts;
}

/**
 * Opens a file that is not a readable book, and returns what its tab says once it has given up, or null if the tab
 * still says nothing after `timeoutMs`.
 */
export async function openBroken(path: string, timeoutMs: number): Promise<string | null> {
  const app = (window as unknown as { app: PageApp }).app;
  const file = app.vault.getAbstractFileByPath(path);
  if (!file) throw new Error(`no file at ${path}`);
  const leaf = app.workspace.getLeaf('tab');
  await leaf.openFile(file);
  for (const other of app.workspace.getLeavesOfType('orbis-reader')) if (other !== leaf) other.detach();
  const view = leaf.view as { containerEl?: HTMLElement };
  const started = Date.now();
  for (;;) {
    const text = (view.containerEl?.querySelector('.view-content') as HTMLElement | null)?.innerText.trim() ?? '';
    if (text && !/loading|opening/i.test(text)) return text;
    if (Date.now() - started > timeoutMs) return text || null;
    await new Promise((r) => setTimeout(r, 200));
  }
}

/** One result of a search, as Orbis lists it. */
export interface SearchResult {
  cfi: string;
  chapter: string;
  excerpt: string;
  /** What it matched: `book` text, a `passage` selection, a note's passage (`note-anchor`) or its text (`note-content`). */
  kind: string;
}

/**
 * Searches the open book as a person does: Open search, the words typed into the bar, Enter. Returns the results
 * once their number has stopped changing for a second.
 */
export async function searchFor(words: string, timeoutMs: number): Promise<SearchResult[]> {
  const app = (window as unknown as { app: PageApp & { commands: PageCommands } }).app;
  const view = app.workspace.getLeavesOfType('orbis-reader')[0]?.view as
    | {
        search: {
          barInputEl?: HTMLInputElement;
          results: { cfi: string; chapterTitle: string; excerpt: string; kind: string }[];
        };
      }
    | undefined;
  if (!view) throw new Error('no book is open');
  app.commands.executeCommandById('orbis-reader:orbis-open-search');
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  await sleep(300);
  const input = view.search.barInputEl;
  if (!input) throw new Error('the search bar has no input');
  input.value = words;
  input.dispatchEvent(new Event('input'));
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
  const started = Date.now();
  let count = -1;
  let sameSince = Date.now();
  for (;;) {
    await sleep(200);
    const now = view.search.results.length;
    if (now !== count) {
      count = now;
      sameSince = Date.now();
    } else if (now > 0 && Date.now() - sameSince >= 1000) break;
    if (Date.now() - started > timeoutMs) break;
  }
  return view.search.results.map((r) => ({ cfi: r.cfi, chapter: r.chapterTitle, excerpt: r.excerpt, kind: r.kind }));
}

/** Presses Enter in the search bar again, which goes to the next result, as it does for a person. */
export function nextSearchResult(): void {
  const app = (window as unknown as { app: PageApp }).app;
  const view = app.workspace.getLeavesOfType('orbis-reader')[0]?.view as
    | { search: { barInputEl?: HTMLInputElement } }
    | undefined;
  view?.search.barInputEl?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
}

/** How many notices Obsidian has shown so far in this run, to read the ones a step shows with `noticesSince`. */
export function noticeCount(): number {
  return (window as unknown as { orbisE2eNotices: string[] }).orbisE2eNotices.length;
}

/**
 * The notices shown since `from` (a `noticeCount`), once one containing `waitFor` has appeared, or after `timeoutMs`.
 * Without `waitFor`, after `timeoutMs`.
 */
export async function noticesSince(from: number, waitFor = '', timeoutMs = 3000): Promise<string[]> {
  const notices = () => (window as unknown as { orbisE2eNotices: string[] }).orbisE2eNotices.slice(from);
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (waitFor && notices().some((n) => n.includes(waitFor))) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  return notices();
}

/**
 * Orbis's settings as they stand: the plugin's `data.json`, and what this device keeps in local storage (the display
 * style's values, the device's own switches). The runner takes one before each test and puts it back after, so a
 * test may change a setting without the next one meeting it.
 */
export function settingsSnapshot(): string {
  const app = (
    window as unknown as { app: { appId: string; plugins: { plugins: Record<string, { settings: unknown }> } } }
  ).app;
  const prefix = `${app.appId}-`;
  const local: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i) ?? '';
    if (key.startsWith(prefix) && key.includes('orbis'))
      local[key.slice(prefix.length)] = localStorage.getItem(key) ?? '';
  }
  return JSON.stringify({ data: app.plugins.plugins['orbis-reader'].settings, local });
}

/**
 * Puts back what `settingsSnapshot` took, and returns what had changed, by name. The plugin's settings are written to
 * `data.json` and read again as a change from another device is, so every open view takes them. A local value is
 * written back and announced as the display commands announce theirs.
 */
export async function restoreSettings(snapshot: string, ownBookkeeping: string[]): Promise<string[]> {
  const app = (
    window as unknown as {
      app: {
        appId: string;
        saveLocalStorage(key: string, value: string | null): void;
        workspace: { trigger(name: string, ...args: unknown[]): void };
        plugins: {
          plugins: Record<
            string,
            { settings: unknown; saveData(d: unknown): Promise<void>; onExternalSettingsChange(): Promise<void> }
          >;
        };
      };
    }
  ).app;
  const prefix = `${app.appId}-`;
  const was = JSON.parse(snapshot) as { data: unknown; local: Record<string, string> };
  const plugin = app.plugins.plugins['orbis-reader'];
  const nowData = JSON.parse(JSON.stringify(plugin.settings)) as Record<string, unknown>;
  const nowLocal: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i) ?? '';
    if (key.startsWith(prefix) && key.includes('orbis'))
      nowLocal[key.slice(prefix.length)] = localStorage.getItem(key) ?? '';
  }
  const now = { data: nowData, local: nowLocal };
  const changed: string[] = [];
  const before = was.data as Record<string, unknown>;
  for (const key of new Set([...Object.keys(before), ...Object.keys(now.data)]))
    if (!ownBookkeeping.includes(key) && JSON.stringify(before[key]) !== JSON.stringify(now.data[key]))
      changed.push(key);
  if (changed.length) {
    // Only what the test changed goes back: Orbis's own bookkeeping keeps the value it has now.
    const restored = { ...now.data };
    for (const key of changed) {
      if (key in before) restored[key] = before[key];
      else delete restored[key];
    }
    await plugin.saveData(restored);
    await plugin.onExternalSettingsChange();
  }
  let display = false;
  for (const key of new Set([...Object.keys(was.local), ...Object.keys(now.local)])) {
    if (was.local[key] === now.local[key] || ownBookkeeping.includes(key)) continue;
    changed.push(`local:${key}`);
    if (key in was.local) localStorage.setItem(prefix + key, was.local[key]);
    else localStorage.removeItem(prefix + key);
    app.workspace.trigger('orbis:settings-change', key, was.local[key] ?? null);
    display = true;
  }
  if (display) app.workspace.trigger('orbis:settings-change', 'orbis-display-style-applied', '');
  // **The display values are read from storage whenever they are used; the device's other values are not.** Orbis
  // keeps those (link preview, page turning by key, the toolbar's buttons) in a copy in memory, which a value written
  // back to storage does not reach. Turning Orbis off and on loads it afresh, from what storage now holds.
  const displayKeys = [
    'orbis-theme',
    'orbis-font-family',
    'orbis-font-size',
    'orbis-line-height',
    'orbis-text-align',
    'orbis-hyphenation',
    'orbis-letter-spacing',
    'orbis-word-spacing',
    'orbis-paragraph-spacing',
    'orbis-bold-text',
    'orbis-page-turn',
    'orbis-margins',
    'orbis-brightness',
    'orbis-flow',
    'orbis-columns',
  ];
  if (changed.some((c) => c.startsWith('local:') && !displayKeys.includes(c.slice('local:'.length)))) {
    const plugins = (
      app as unknown as {
        plugins: { disablePlugin(id: string): Promise<void>; enablePlugin(id: string): Promise<void> };
      }
    ).plugins;
    await plugins.disablePlugin('orbis-reader');
    await plugins.enablePlugin('orbis-reader');
    changed.push('(Orbis reloaded)');
  }
  return changed;
}

/** Sets one of this device's display values, as the display commands and the display style bar do. */
export function setDisplay(key: string, value: string): void {
  const app = (
    window as unknown as {
      app: { saveLocalStorage(k: string, v: string): void; workspace: { trigger(n: string, ...a: unknown[]): void } };
    }
  ).app;
  app.saveLocalStorage(key, value);
  app.workspace.trigger('orbis:settings-change', key, value);
}

/** One of this device's display values, as stored, or null. */
export function getDisplay(key: string): string | null {
  return (window as unknown as { app: { loadLocalStorage(k: string): string | null } }).app.loadLocalStorage(key);
}

/**
 * What is wrong with notes Orbis wrote, as Obsidian reads them once it has indexed them: frontmatter it could not
 * parse, and links that lead nowhere. Empty when nothing is.
 */
export async function notesProblems(paths: string[], timeoutMs: number): Promise<string[]> {
  const app = (
    window as unknown as {
      app: {
        vault: { getAbstractFileByPath(p: string): unknown; adapter: { read(p: string): Promise<string> } };
        metadataCache: {
          getFileCache(f: unknown): { frontmatter?: unknown } | null;
          unresolvedLinks: Record<string, Record<string, number>>;
          resolvedLinks: Record<string, Record<string, number>>;
        };
      };
    }
  ).app;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const notes = paths.filter((p) => p.endsWith('.md'));
  const started = Date.now();
  // A new file is indexed a moment after it is written: wait until every note has a cache and its links are counted.
  for (;;) {
    const ready = notes.every((p) => {
      const file = app.vault.getAbstractFileByPath(p);
      return (
        file &&
        app.metadataCache.getFileCache(file) &&
        (p in app.metadataCache.resolvedLinks || p in app.metadataCache.unresolvedLinks)
      );
    });
    if (ready) break;
    if (Date.now() - started > timeoutMs) return [`Obsidian had not indexed every note within ${timeoutMs} ms`];
    await sleep(200);
  }
  await sleep(500);
  const problems: string[] = [];
  for (const path of notes) {
    const text = await app.vault.adapter.read(path);
    const cache = app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(path));
    if (/^---\r?\n[\s\S]*?\r?\n---/.test(text) && !cache?.frontmatter)
      problems.push(`${path}: Obsidian could not read its frontmatter`);
    for (const target of Object.keys(app.metadataCache.unresolvedLinks[path] ?? {}))
      problems.push(`${path}: a link to "${target}" leads nowhere`);
  }
  return problems;
}

/** Writes `text` to a file of the vault, replacing what it held. */
export async function writeVaultFile(path: string, text: string): Promise<void> {
  await (
    window as unknown as { app: { vault: { adapter: { write(p: string, t: string): Promise<void> } } } }
  ).app.vault.adapter.write(path, text);
}

/** Deletes a file or a whole folder of the vault from the disk, as a file manager would, without Obsidian's trash. */
export async function removeVaultPath(path: string): Promise<void> {
  const adapter = (
    window as unknown as {
      app: {
        vault: {
          adapter: {
            stat(p: string): Promise<{ type: 'file' | 'folder' } | null>;
            remove(p: string): Promise<void>;
            rmdir(p: string, recursive: boolean): Promise<void>;
          };
        };
      };
    }
  ).app.vault.adapter;
  const stat = await adapter.stat(path);
  if (stat?.type === 'folder') await adapter.rmdir(path, true);
  else if (stat) await adapter.remove(path);
}

/**
 * Copies a vault file to `to` through Obsidian, so the copy is in the vault at once, keeping only its first `bytes`
 * bytes when given: a download that stopped part-way.
 */
export async function copyVaultFile(from: string, to: string, bytes: number | null): Promise<void> {
  const vault = (
    window as unknown as {
      app: {
        vault: {
          adapter: { readBinary(p: string): Promise<ArrayBuffer> };
          createBinary(p: string, data: ArrayBuffer): Promise<unknown>;
        };
      };
    }
  ).app.vault;
  const data = await vault.adapter.readBinary(from);
  await vault.createBinary(to, bytes === null ? data : data.slice(0, bytes));
}

/** Renames or moves a vault file as Obsidian's Files pane does, which is what Orbis watches for. */
export async function renameInVault(from: string, to: string): Promise<void> {
  const app = (
    window as unknown as {
      app: {
        vault: { getAbstractFileByPath(p: string): unknown };
        fileManager: { renameFile(f: unknown, to: string): Promise<void> };
      };
    }
  ).app;
  const file = app.vault.getAbstractFileByPath(from);
  if (!file) throw new Error(`no file at ${from}`);
  await app.fileManager.renameFile(file, to);
}

/** Deletes a vault file as the Files pane does, to the trash the vault's settings name. */
export async function trashInVault(path: string): Promise<void> {
  const app = (
    window as unknown as {
      app: {
        vault: { getAbstractFileByPath(p: string): unknown };
        fileManager: { trashFile(f: unknown): Promise<void> };
      };
    }
  ).app;
  const file = app.vault.getAbstractFileByPath(path);
  if (!file) throw new Error(`no file at ${path}`);
  await app.fileManager.trashFile(file);
}

/** A vault file's text, or null when there is no file there to read. */
export async function vaultText(path: string): Promise<string | null> {
  const adapter = (
    window as unknown as {
      app: { vault: { adapter: { exists(p: string): Promise<boolean>; read(p: string): Promise<string> } } };
    }
  ).app.vault.adapter;
  // Gone between the two calls counts as gone: Orbis rewrites some files by removing and writing them again.
  if (!(await adapter.exists(path))) return null;
  return adapter.read(path).catch(() => null);
}

/** The open book's title and author as Orbis read them, and its contents, each entry indented by its depth. */
export function bookSummary(): { title: string; author: string; contents: string[] } {
  const app = (window as unknown as { app: PageApp }).app;
  const view = app.workspace.getLeavesOfType('orbis-reader')[0]?.view as
    | (ReaderView & { bookMeta: { title: string; author: string } })
    | undefined;
  if (!view) throw new Error('no book is open');
  const contents: string[] = [];
  const walk = (items: unknown[], depth: number) => {
    for (const item of items as { label?: string; subitems?: unknown[] }[]) {
      contents.push(`${'  '.repeat(depth)}${(item.label ?? '').trim().replace(/\s+/g, ' ')}`);
      if (item.subitems?.length) walk(item.subitems, depth + 1);
    }
  };
  walk(view.tocItems ?? [], 0);
  return { title: view.bookMeta.title, author: view.bookMeta.author, contents };
}

/**
 * Goes to the open book's first section whose text includes `text`, and returns its index once it shows. Fails if no
 * section of the first `maxSections` has it.
 */
export async function goToSectionWith(text: string, maxSections = 60): Promise<number> {
  const app = (window as unknown as { app: PageApp }).app;
  const view = app.workspace.getLeavesOfType('orbis-reader')[0]?.view as ReaderView | undefined;
  const fv = view?.foliateView;
  if (!view || !fv) throw new Error('no book is open');
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  for (let index = 0; index < Math.min(view.bookSections.length, maxSections); index++) {
    await fv.goTo(index);
    for (let wait = 0; wait < 25; wait++) {
      const shown = fv.renderer.getContents().find((c) => c.index === index);
      if (shown?.doc.body) {
        if ((shown.doc.body.textContent ?? '').includes(text)) {
          await sleep(400);
          return index;
        }
        break;
      }
      await sleep(200);
    }
  }
  throw new Error(`no section of the book has "${text}"`);
}

/** The section the open book shows, as foliate reports it. */
export function shownSection(): number {
  const app = (window as unknown as { app: PageApp }).app;
  const view = app.workspace.getLeavesOfType('orbis-reader')[0]?.view as ReaderView | undefined;
  return view?.foliateView?.renderer.getContents()[0]?.index ?? -1;
}

/**
 * The Orbis dialog in front, once one has appeared within `timeoutMs`: its title, its text line by line, and its
 * buttons, each marked `(red)` or `(accent)` when it wears the theme's warning or main color. Null when none appeared.
 */
export async function popupShown(
  timeoutMs: number
): Promise<{ title: string; lines: string[]; buttons: string[] } | null> {
  const started = Date.now();
  for (;;) {
    const popups = Array.from(document.querySelectorAll<HTMLElement>('.orbis-popup'));
    const popup = popups[popups.length - 1];
    if (popup) {
      await new Promise((r) => setTimeout(r, 150));
      const title = (popup.querySelector('.orbis-popup-title, h2, h3')?.textContent ?? '').trim();
      const buttons = Array.from(popup.querySelectorAll<HTMLElement>('button'))
        .filter((b) => (b.textContent ?? '').trim())
        .map(
          (b) =>
            `${(b.textContent ?? '').trim()}${b.classList.contains('mod-destructive') || b.classList.contains('mod-warning') ? ' (red)' : ''}${
              b.classList.contains('mod-cta') ? ' (accent)' : ''
            }`
        );
      const lines = popup.innerText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      return { title, lines, buttons };
    }
    if (Date.now() - started > timeoutMs) return null;
    await new Promise((r) => setTimeout(r, 100));
  }
}

/** Selects the button in the Orbis dialog in front whose label is `label`. */
export function pressPopupButton(label: string): void {
  const popups = Array.from(document.querySelectorAll<HTMLElement>('.orbis-popup'));
  const button = Array.from(popups[popups.length - 1]?.querySelectorAll<HTMLButtonElement>('button') ?? []).find(
    (b) => (b.textContent ?? '').trim() === label
  );
  if (!button) throw new Error(`the dialog has no "${label}" button`);
  button.click();
}

/**
 * Writes a note reading `text` on paragraph `n` of the first section with enough paragraphs (or the `nth` after it),
 * with `markIndex` the bar's mark for it (from 0), or none when null, as saving the note editor does. Returns the
 * start of the paragraph's text.
 */
export async function noteParagraph(n: number, text: string, markIndex: number | null, nth = 0): Promise<string> {
  const app = (window as unknown as { app: PageApp }).app;
  const view = app.workspace.getLeavesOfType('orbis-reader')[0]?.view as ReaderView | undefined;
  if (!view?.foliateView) throw new Error('no book is open');
  const annot = view.annot as unknown as {
    offeredPreset(): unknown;
    barMarks(): { id: string }[];
    rangeCfi(r: Range, i: number): string;
    saveNote(o: { cfiRange: string; text: string; selectedText: string; choice?: unknown }): void;
  };
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  for (let wait = 0; !annot.offeredPreset() && wait < 50; wait++) await sleep(200);
  let skip = nth;
  for (let index = 0; index < view.bookSections.length; index++) {
    await view.foliateView.goTo(index);
    await sleep(800);
    const shown = view.foliateView.renderer.getContents().find((c) => c.index === index);
    const paragraphs = Array.from(shown?.doc.querySelectorAll('p') ?? []).filter(
      (p) => (p.textContent ?? '').trim().length > 40
    );
    if (!shown || paragraphs.length <= n || skip-- > 0) continue;
    const walker = shown.doc.createTreeWalker(paragraphs[n], NodeFilter.SHOW_TEXT);
    const texts: Text[] = [];
    for (let t = walker.nextNode(); t; t = walker.nextNode()) if ((t as Text).data.trim()) texts.push(t as Text);
    const range = shown.doc.createRange();
    range.setStart(texts[0], texts[0].data.length - texts[0].data.trimStart().length);
    const last = texts[texts.length - 1];
    range.setEnd(last, last.data.trimEnd().length);
    const selectedText = range.toString().replace(/\s+/g, ' ').trim();
    annot.saveNote({
      cfiRange: annot.rangeCfi(range, index),
      text,
      selectedText,
      choice: markIndex === null ? undefined : annot.barMarks()[markIndex],
    });
    await sleep(300);
    return selectedText.slice(0, 30);
  }
  throw new Error(`no section has ${n + 1} paragraphs`);
}

/** One passage selection or note as the book holds it, and the text its stored place leads to in the book now. */
export interface HeldAnnotation {
  kind: 'mark' | 'note';
  id: string;
  markId: string | null;
  /** The passage's text as stored when it was made. */
  stored: string;
  /** The text the stored place covers in the book as shown now, or null when it covers nothing. */
  shown: string | null;
  note?: string;
}

/**
 * The open book's passage selections and notes, once loaded, each with the text its stored place covers now: a place
 * that no longer leads to its passage shows here, rather than only as a mark drawn in the wrong spot.
 */
export async function heldAnnotations(): Promise<HeldAnnotation[]> {
  const app = (window as unknown as { app: PageApp }).app;
  const view = app.workspace.getLeavesOfType('orbis-reader')[0]?.view as ReaderView | undefined;
  const fv = view?.foliateView as
    | (NonNullable<ReaderView['foliateView']> & {
        resolveCFI(cfi: string): { index: number; anchor(doc: Document): Range };
      })
    | undefined;
  if (!view || !fv) throw new Error('no book is open');
  const annot = view.annot as unknown as {
    offeredPreset(): unknown;
    highlights: { id: string; cfiRange: string; text: string; markId?: string }[];
    notes: { id: string; cfiRange: string; text: string; selectedText?: string; markId?: string }[];
  };
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  for (let wait = 0; !annot.offeredPreset() && wait < 50; wait++) await sleep(200);
  const textAt = async (cfi: string): Promise<string | null> => {
    try {
      const { index, anchor } = fv.resolveCFI(cfi);
      await fv.goTo(index);
      for (let wait = 0; wait < 25; wait++) {
        const shown = fv.renderer.getContents().find((c) => c.index === index);
        if (shown?.doc.body) {
          const text = anchor(shown.doc).toString().replace(/\s+/g, ' ').trim();
          return text || null;
        }
        await sleep(200);
      }
    } catch {
      /* a place that cannot be resolved covers nothing */
    }
    return null;
  };
  const held: HeldAnnotation[] = [];
  for (const h of annot.highlights)
    held.push({ kind: 'mark', id: h.id, markId: h.markId ?? null, stored: h.text, shown: await textAt(h.cfiRange) });
  for (const n of annot.notes)
    held.push({
      kind: 'note',
      id: n.id,
      markId: n.markId ?? null,
      stored: n.selectedText ?? '',
      shown: await textAt(n.cfiRange),
      note: n.text,
    });
  return held;
}

/** The bar's marks for the open book, by id and name, in the bar's order. */
export function barMarks(): { id: string; name: string }[] {
  const app = (window as unknown as { app: PageApp }).app;
  const view = app.workspace.getLeavesOfType('orbis-reader')[0]?.view as ReaderView | undefined;
  if (!view) throw new Error('no book is open');
  return (view.annot as unknown as { barMarks(): { id: string; name: string }[] }).barMarks().map((m) => ({
    id: m.id,
    name: m.name,
  }));
}

/**
 * Changes the open book's annotations as the marks bar and the note view do: `remark` gives a passage selection
 * (by id) the bar's mark at an index, `remove` takes passage selections away, `deleteNotes` deletes notes.
 */
export function changeAnnotations(changes: {
  remark?: { id: string; markIndex: number }[];
  remove?: string[];
  deleteNotes?: string[];
}): void {
  const app = (window as unknown as { app: PageApp }).app;
  const view = app.workspace.getLeavesOfType('orbis-reader')[0]?.view as ReaderView | undefined;
  const annot = view?.annot as unknown as {
    highlights: { id: string; cfiRange: string }[];
    barMarks(): unknown[];
    applyMarkToHighlight(cfi: string, mark: unknown): void;
    removeHighlight(cfi: string): void;
    deleteNote(id: string): void;
  };
  const cfiOf = (id: string) => {
    const h = annot.highlights.find((x) => x.id === id);
    if (!h) throw new Error(`no passage selection ${id}`);
    return h.cfiRange;
  };
  for (const { id, markIndex } of changes.remark ?? [])
    annot.applyMarkToHighlight(cfiOf(id), annot.barMarks()[markIndex]);
  for (const id of changes.remove ?? []) annot.removeHighlight(cfiOf(id));
  for (const id of changes.deleteNotes ?? []) annot.deleteNote(id);
}

/** The open book's bookmarks, by the location each names. */
export function bookmarkList(): { id: string; loc: number | null }[] {
  const app = (window as unknown as { app: PageApp }).app;
  const view = app.workspace.getLeavesOfType('orbis-reader')[0]?.view as unknown as {
    bookmarkCtl: { bookmarks: { id: string; loc?: number }[] };
  };
  return view.bookmarkCtl.bookmarks.map((b) => ({ id: b.id, loc: b.loc ?? null }));
}

/** Sets one of Orbis's settings and saves it, as its row in Settings does. The runner puts it back after the test. */
export async function setPluginSetting(key: string, value: unknown): Promise<void> {
  const plugin = (
    window as unknown as {
      app: {
        plugins: { plugins: Record<string, { settings: Record<string, unknown>; saveSettings(): Promise<void> }> };
      };
    }
  ).app.plugins.plugins['orbis-reader'];
  plugin.settings[key] = value;
  await plugin.saveSettings();
}

/** Deletes a file or folder through Obsidian, so its index knows at once that the path is free. Nothing if absent. */
export async function deleteInVault(path: string): Promise<void> {
  const vault = (
    window as unknown as {
      app: { vault: { getAbstractFileByPath(p: string): unknown; delete(f: unknown, force: boolean): Promise<void> } };
    }
  ).app.vault;
  const file = vault.getAbstractFileByPath(path);
  if (file) await vault.delete(file, true);
}

/**
 * Waits until the open book's location index has been measured: its locations, and the headings and lengths of its
 * sections, which decide where a chapter split across files continues. Returns whether it got there in time.
 */
export async function locationIndexReady(timeoutMs: number): Promise<boolean> {
  const app = (window as unknown as { app: PageApp }).app;
  const started = Date.now();
  for (;;) {
    const view = app.workspace.getLeavesOfType('orbis-reader')[0]?.view as unknown as
      | { locIndex?: { isReady: boolean; sectionHeadings: string[] } }
      | undefined;
    if (view?.locIndex?.isReady && view.locIndex.sectionHeadings.length) return true;
    if (Date.now() - started > timeoutMs) return false;
    await new Promise((r) => setTimeout(r, 200));
  }
}

/** The open book's location index: whether it is measured, and whether a load or build is under way. */
export function indexState(): { ready: boolean; building: boolean } {
  const app = (window as unknown as { app: PageApp }).app;
  const view = app.workspace.getLeavesOfType('orbis-reader')[0]?.view as unknown as
    | { locIndex?: { isReady: boolean; isBuilding: boolean } }
    | undefined;
  return { ready: !!view?.locIndex?.isReady, building: !!view?.locIndex?.isBuilding };
}

/**
 * Holds every location index build from now on before it measures anything, or lets them go on. What lets a test do,
 * every time, what a large book on a slow phone does by itself: ask for the chapters while the index is still being
 * built. Reaches the index through the open book, so a book must be open; returns whether one was.
 */
export function holdIndexBuilds(hold: boolean): boolean {
  const app = (window as unknown as { app: PageApp }).app;
  const view = app.workspace.getLeavesOfType('orbis-reader')[0]?.view as unknown as { locIndex?: object } | undefined;
  if (!view?.locIndex) return false;
  type Measure = (...args: unknown[]) => Promise<unknown>;
  const index = Object.getPrototypeOf(view.locIndex) as { measureSectionSizes: Measure; orbisE2eMeasure?: Measure };
  const w = window as unknown as { orbisE2eReleaseIndex?: () => void };
  if (hold && !index.orbisE2eMeasure) {
    const measure = index.measureSectionSizes;
    const held = new Promise<void>((r) => {
      w.orbisE2eReleaseIndex = r;
    });
    index.orbisE2eMeasure = measure;
    index.measureSectionSizes = async function (this: unknown, ...args: unknown[]) {
      await held;
      return measure.apply(this, args);
    };
  } else if (!hold && index.orbisE2eMeasure) {
    index.measureSectionSizes = index.orbisE2eMeasure;
    delete index.orbisE2eMeasure;
    w.orbisE2eReleaseIndex?.();
  }
  return true;
}

/** How many dialogs are open: Obsidian's and Orbis's own. */
export function dialogsOpen(): number {
  return document.querySelectorAll('.modal-container, .orbis-popup').length;
}

/** When a vault file was last written, in milliseconds, or null when there is no such file. */
export async function modifiedTime(path: string): Promise<number | null> {
  const adapter = (
    window as unknown as { app: { vault: { adapter: { stat(p: string): Promise<{ mtime: number } | null> } } } }
  ).app.vault.adapter;
  return (await adapter.stat(path))?.mtime ?? null;
}

/** Opens the dialog the Files pane's menu opens on a folder: Save folder as EPUB, or Save folder notes as EPUBs. */
export function openFolderConversion(folder: string, separate: boolean): void {
  const app = (
    window as unknown as {
      app: {
        vault: { getAbstractFileByPath(p: string): unknown };
        plugins: { plugins: Record<string, Record<string, (f: unknown) => void>> };
      };
    }
  ).app;
  const target = app.vault.getAbstractFileByPath(folder);
  if (!target) throw new Error(`no folder at ${folder}`);
  const plugin = app.plugins.plugins['orbis-reader'];
  plugin[separate ? 'saveFolderAsSeparateEpubs' : 'saveFolderAsEpub'](target);
}

/** Where the open book is, closely: the section, how far its columns are scrolled, a page's width, the chapter. */
export function readingPos(): {
  section: number;
  pos: number;
  size: number;
  chapter: string | null;
  fraction: number | null;
  canGoBack: boolean;
  canGoForward: boolean;
} {
  const app = (window as unknown as { app: PageApp }).app;
  const view = app.workspace.getLeavesOfType('orbis-reader')[0]?.view as unknown as {
    currentTocLabel: string | null;
    foliateView?: {
      renderer: { getContents(): { index: number }[]; containerPosition: number; size: number };
      lastLocation?: { fraction?: number };
      history?: { canGoBack: boolean; canGoForward: boolean };
    };
  };
  const fv = view?.foliateView;
  if (!fv) throw new Error('no book is open');
  return {
    section: fv.renderer.getContents()[0]?.index ?? -1,
    pos: Math.round(fv.renderer.containerPosition),
    size: Math.round(fv.renderer.size),
    chapter: view.currentTocLabel,
    fraction: fv.lastLocation?.fraction ?? null,
    canGoBack: !!fv.history?.canGoBack,
    canGoForward: !!fv.history?.canGoForward,
  };
}

/** Goes to the open book's `nth` contents entry as selecting it on the Contents tab does, and returns its href. */
export function jumpToContents(nth: number): string {
  const app = (window as unknown as { app: PageApp }).app;
  const view = app.workspace.getLeavesOfType('orbis-reader')[0]?.view as unknown as {
    tocHrefs(): string[];
    goToTocHref(href: string): boolean;
  };
  const href = view.tocHrefs()[nth];
  if (!href) throw new Error(`the book has no contents entry #${nth}`);
  view.goToTocHref(href);
  return href;
}

/**
 * Types `input` into the Go to location bar, which it opens, and presses Enter. Returns whether the bar is still
 * open and what its line under the field says.
 */
export async function goToLocation(input: string): Promise<{ open: boolean; hint: string }> {
  const app = (window as unknown as { app: PageApp & { commands: PageCommands } }).app;
  const view = app.workspace.getLeavesOfType('orbis-reader')[0]?.view as unknown as {
    goToInputEl: HTMLInputElement | null;
    goToHintEl: HTMLElement | null;
  };
  const field = view.goToInputEl;
  if (!field?.isConnected || !field.offsetParent) app.commands.executeCommandById('orbis-reader:orbis-go-to-location');
  await new Promise((r) => setTimeout(r, 300));
  const input2 = view.goToInputEl;
  if (!input2) throw new Error('the Go to location bar has no field');
  input2.value = input;
  input2.dispatchEvent(new Event('input'));
  input2.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await new Promise((r) => setTimeout(r, 600));
  return { open: !!input2.offsetParent, hint: (view.goToHintEl?.textContent ?? '').trim() };
}

/**
 * Opens an `obsidian://orbis-nav` link as Obsidian does once the system hands it over, by calling Orbis's handler
 * in this window. Never through the system, which could give it to another Obsidian, such as the one you use.
 */
export async function openOrbisLink(url: string): Promise<void> {
  const app = (
    window as unknown as {
      app: { workspace: { protocolHandler?: { handlers?: Map<string, (params: Record<string, string>) => unknown> } } };
    }
  ).app;
  // Where Obsidian keeps the handlers plugins register: not part of its published API, so checked rather than trusted.
  const handler = app.workspace.protocolHandler?.handlers?.get('orbis-nav');
  if (!handler) throw new Error('Orbis has no orbis-nav link handler registered');
  const parsed = new URL(url);
  if (parsed.protocol !== 'obsidian:' || parsed.host !== 'orbis-nav') throw new Error(`not an orbis-nav link: ${url}`);
  const params: Record<string, string> = { action: 'orbis-nav' };
  parsed.searchParams.forEach((value, key) => {
    params[key] = value;
  });
  await handler(params);
}

/**
 * Sets what the next search covers and how it matches, as Advanced search's OK does, and forgets the last query so
 * the next Enter searches again rather than stepping to the next result.
 */
export function setSearchOptions(options: {
  bookText?: boolean;
  passages?: boolean;
  noteAnchors?: boolean;
  noteContent?: boolean;
  caseSensitive?: boolean;
  wholeWord?: boolean;
}): void {
  const app = (window as unknown as { app: PageApp }).app;
  const view = app.workspace.getLeavesOfType('orbis-reader')[0]?.view as unknown as {
    search: {
      scope: Record<string, boolean>;
      caseSensitive: boolean;
      wholeWord: boolean;
      lastQuery: string;
    };
  };
  const { caseSensitive, wholeWord, ...scope } = options;
  view.search.scope = { bookText: true, passages: false, noteAnchors: false, noteContent: false, ...scope };
  view.search.caseSensitive = !!caseSensitive;
  view.search.wholeWord = !!wholeWord;
  view.search.lastQuery = '';
}

/**
 * Presses the open dialog's main button, then, when it asks to confirm, the confirmation's button labelled `confirm`,
 * and waits until every dialog has closed.
 */
export async function saveAndConfirm(confirm: string, timeoutMs: number): Promise<void> {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const dialogs = () => Array.from(document.querySelectorAll<HTMLElement>('.modal-container, .orbis-popup'));
  const main = Array.from(
    document.querySelectorAll<HTMLButtonElement>('.modal-container button.mod-cta, .orbis-popup button.mod-cta')
  ).pop();
  if (!main) throw new Error('the dialog has no main button to press');
  const open = dialogs().length;
  main.click();
  const started = Date.now();
  for (;;) {
    const top = dialogs().pop();
    if (dialogs().length > open && top) {
      const button = Array.from(top.querySelectorAll<HTMLButtonElement>('button')).find(
        (b) => (b.textContent ?? '').trim() === confirm
      );
      if (!button) throw new Error(`the confirmation has no "${confirm}": ${(top.textContent ?? '').slice(0, 200)}`);
      button.click();
      break;
    }
    if (Date.now() - started > 5000) throw new Error('no confirmation was asked');
    await sleep(100);
  }
  while (dialogs().length) {
    if (Date.now() - started > timeoutMs) throw new Error(`the dialogs did not close within ${timeoutMs} ms`);
    await sleep(200);
  }
}

/**
 * Sets one of this device's own settings (link preview, page turning by key, a toolbar button), as its switch in
 * Settings does, then turns Orbis off and on so the reader takes it. Any book open is closed by that.
 */
export async function setDeviceValue(key: string, value: unknown): Promise<void> {
  const app = (
    window as unknown as {
      app: {
        loadLocalStorage(k: string): string | null;
        saveLocalStorage(k: string, v: string): void;
        plugins: { disablePlugin(id: string): Promise<void>; enablePlugin(id: string): Promise<void> };
      };
    }
  ).app;
  const held = JSON.parse(app.loadLocalStorage('orbis-device-settings') ?? '{}') as Record<string, unknown>;
  held[key] = value;
  app.saveLocalStorage('orbis-device-settings', JSON.stringify(held));
  await app.plugins.disablePlugin('orbis-reader');
  await app.plugins.enablePlugin('orbis-reader');
}

/** Sends a key press to the book's page, as a keyboard does with the book focused. */
export function pressInBook(key: string): void {
  const app = (window as unknown as { app: PageApp }).app;
  const view = app.workspace.getLeavesOfType('orbis-reader')[0]?.view as ReaderView | undefined;
  const doc = view?.foliateView?.renderer.getContents()[0]?.doc;
  if (!doc) throw new Error('no book is open');
  doc.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

/**
 * Styles as the open book's shown section computes them, for elements matching `selector` (the first `max`) that hold
 * text of their own: the text alignment, the font size in pixels, the color, and how the text contrasts with what is
 * behind it. The background is the
 * first one set on the element or an ancestor, laid over the page; an element over a picture or a gradient has no
 * contrast to give (null).
 */
export function computedText(
  selector: string,
  max = 200
): { text: string; align: string; size: number; color: string; contrast: number | null }[] {
  const app = (window as unknown as { app: PageApp }).app;
  const view = app.workspace.getLeavesOfType('orbis-reader')[0]?.view as ReaderView | undefined;
  const doc = view?.foliateView?.renderer.getContents()[0]?.doc;
  if (!doc) throw new Error('no book is open');
  const win = doc.defaultView as Window;
  const parse = (c: string): number[] => {
    const m = c.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 0];
    return [m[0], m[1], m[2], m.length > 3 ? m[3] : 1];
  };
  const over = (top: number[], under: number[]) => [0, 1, 2].map((i) => top[i] * top[3] + under[i] * (1 - top[3]));
  const luminance = (rgb: number[]) => {
    const [r, g, b] = rgb.map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const backgroundOf = (el: Element): number[] | null => {
    const layers: number[][] = [];
    for (let at: Element | null = el; at; at = at.parentElement) {
      const style = win.getComputedStyle(at);
      if (style.backgroundImage && style.backgroundImage !== 'none') return null;
      const bg = parse(style.backgroundColor);
      if (bg[3] > 0) {
        layers.push(bg);
        if (bg[3] >= 1) break;
      }
    }
    let rgb = [255, 255, 255];
    for (const layer of layers.reverse()) rgb = over(layer, rgb);
    return rgb;
  };
  const out: { text: string; align: string; size: number; color: string; contrast: number | null }[] = [];
  for (const el of Array.from(doc.querySelectorAll(selector)).slice(0, max)) {
    // Text of its own, not only inside its children: a box's color never shows when its words are all in a paragraph.
    const own = Array.from(el.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim());
    const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ');
    if (!text || !own) continue;
    const style = win.getComputedStyle(el);
    const bg = backgroundOf(el);
    let contrast: number | null = null;
    // Over a picture the book places beside it in the same box, what is behind the words is the picture's.
    if (
      bg &&
      !el.querySelector('img, svg, picture') &&
      !el.parentElement?.querySelector(':scope > img, :scope > svg, :scope > picture')
    ) {
      const fg = over(parse(style.color), bg);
      const [a, b] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
      contrast = Math.round(((a + 0.05) / (b + 0.05)) * 100) / 100;
    }
    out.push({
      text: text.slice(0, 60),
      align: style.textAlign,
      size: parseFloat(style.fontSize),
      color: style.color,
      contrast,
    });
  }
  return out;
}

/**
 * The spacing the shown section's `selector` elements are drawn with, in pixels: between letters, between words and
 * above each, with each one's font size, for the first `max` that hold text.
 */
export function spacingOf(
  selector: string,
  max = 20
): { tag: string; letter: number; word: number; above: number; size: number }[] {
  const app = (window as unknown as { app: PageApp }).app;
  const view = app.workspace.getLeavesOfType('orbis-reader')[0]?.view as ReaderView | undefined;
  const doc = view?.foliateView?.renderer.getContents()[0]?.doc;
  if (!doc) throw new Error('no book is open');
  const win = doc.defaultView as Window;
  const px = (v: string) => (v === 'normal' ? 0 : Number.parseFloat(v) || 0);
  return Array.from(doc.querySelectorAll<HTMLElement>(selector))
    .filter((el) => (el.textContent ?? '').trim().length > 20)
    .slice(0, max)
    .map((el) => {
      const style = win.getComputedStyle(el);
      return {
        tag: el.localName,
        letter: px(style.letterSpacing),
        word: px(style.wordSpacing),
        above: px(style.marginTop),
        size: px(style.fontSize),
      };
    });
}

/** CSS property `property` as the shown section's first `max` `selector` elements holding text are drawn with it. */
export function styleOf(selector: string, property: string, max = 10): string[] {
  const app = (window as unknown as { app: PageApp }).app;
  const view = app.workspace.getLeavesOfType('orbis-reader')[0]?.view as ReaderView | undefined;
  const doc = view?.foliateView?.renderer.getContents()[0]?.doc;
  if (!doc) throw new Error('no book is open');
  const win = doc.defaultView as Window;
  return Array.from(doc.querySelectorAll<HTMLElement>(selector))
    .filter((el) => (el.textContent ?? '').trim().length > 0)
    .slice(0, max)
    .map((el) => win.getComputedStyle(el).getPropertyValue(property));
}

/**
 * The letter and word spacing, in pixels, of code and of Arabic inside the shown section's first paragraph of body text,
 * with an element of each put there to measure and taken away again.
 */
export function spacingInside(): { tag: string; letter: number; word: number }[] {
  const app = (window as unknown as { app: PageApp }).app;
  const view = app.workspace.getLeavesOfType('orbis-reader')[0]?.view as ReaderView | undefined;
  const doc = view?.foliateView?.renderer.getContents()[0]?.doc;
  const p = doc?.querySelector('p.orbis-body-text');
  if (!doc || !p) throw new Error('no paragraph of body text is shown');
  const px = (v: string) => (v === 'normal' ? 0 : Number.parseFloat(v) || 0);
  return ['code', 'span'].map((tag) => {
    const el = doc.createElementNS('http://www.w3.org/1999/xhtml', tag) as HTMLElement;
    if (tag === 'span') {
      el.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:lang', 'ar');
      el.setAttribute('lang', 'ar');
    }
    el.textContent = 'sample text';
    p.appendChild(el);
    const style = (doc.defaultView as Window).getComputedStyle(el);
    const found = { tag, letter: px(style.letterSpacing), word: px(style.wordSpacing) };
    el.remove();
    return found;
  });
}

/**
 * Goes to the last page of the shown section, turns to the next, and returns how long, in milliseconds, any of the empty
 * page at the section's end was on screen before the next section.
 */
export async function emptyPageAtSectionEnd(): Promise<number> {
  const app = (window as unknown as { app: PageApp }).app;
  const view = app.workspace.getLeavesOfType('orbis-reader')[0]?.view as unknown as {
    foliateView?: {
      next(): Promise<void>;
      renderer: { page: number; pages: number; start: number; size: number; getContents(): { index: number }[] };
    };
  };
  const fv = view?.foliateView;
  if (!fv) throw new Error('no book is open');
  const r = fv.renderer;
  for (let i = 0; i < 60 && r.page < r.pages - 2; i++) await fv.next();
  const section = r.getContents()[0]?.index;
  let since = 0;
  let shown = 0;
  let watching = true;
  const watch = () => {
    const now = r.getContents()[0]?.index;
    if (now === section && !since && r.start > (r.pages - 2) * r.size + 1) since = performance.now();
    if (now !== undefined && now !== section && !shown) shown = performance.now();
    if (watching) requestAnimationFrame(watch);
  };
  watch();
  await fv.next();
  await new Promise((done) => setTimeout(done, 500));
  watching = false;
  if (!shown) throw new Error('the next section did not show');
  return since ? Math.round(shown - since) : 0;
}

/** Whether the open book's paginator has the attribute `name` — `animated`, which makes foliate slide a page. */
export function paginatorHas(name: string): boolean {
  const app = (window as unknown as { app: PageApp }).app;
  const view = app.workspace.getLeavesOfType('orbis-reader')[0]?.view as unknown as {
    foliateView?: { renderer?: Element };
  };
  const renderer = view?.foliateView?.renderer;
  if (!renderer) throw new Error('no book is open');
  return renderer.hasAttribute(name);
}

/** Whether the open book is in Focus mode, its toolbar shows, and Focus mode's own × is there. */
export function focusState(): { focus: boolean; toolbar: boolean; exit: boolean } {
  const app = (window as unknown as { app: PageApp }).app;
  const view = app.workspace.getLeavesOfType('orbis-reader')[0]?.view as unknown as {
    focusMode: boolean;
    toolbarEl: HTMLElement | null;
    containerEl: HTMLElement;
  };
  if (!view) throw new Error('no book is open');
  const exit = view.containerEl.querySelector<HTMLElement>('.orbis-focus-exit-btn');
  return { focus: view.focusMode, toolbar: !!view.toolbarEl?.offsetParent, exit: !!exit?.offsetParent };
}

/** What a display style tab shows — see `openDisplayTab`. */
export interface DrawerShown {
  /** Each row's visible labels and buttons, joined with " + "; the page button counts as a row. */
  rows: string[];
  /** The visible text of what has the keyboard. */
  focused: string;
  /** The open tab's top and bottom, and whether it scrolls. */
  top: number;
  bottom: number;
  scrolls: boolean;
  /** Where the More/Back button is, if the tab has one, and whether all of it is inside the tab as shown. */
  toggle: { x: number; y: number; inView: boolean } | null;
  /** Each row's top, the page button's included, in `rows` order. */
  tops: number[];
}

/**
 * Opens the display style bar's tab `id` (`theme`, `structure`, `spacing`, `font`) on the open book, as a reader does:
 * the toolbar's Display style button if the bar is closed, then the tab. With `scrollToEnd`, scrolls the tab to its
 * end first. Returns what the tab shows.
 */
export function openDisplayTab(id: string, scrollToEnd = false): DrawerShown {
  const app = (window as unknown as { app: PageApp }).app;
  const view = app.workspace.getLeavesOfType('orbis-reader')[0]?.view as unknown as {
    displayStyleBtn: HTMLElement | null;
    displayMenuWrapper?: HTMLElement;
  };
  if (!view?.displayStyleBtn) throw new Error('no book is open, or it has no Display style button');
  if (!view.displayMenuWrapper?.offsetParent) view.displayStyleBtn.click();
  const tab = document.getElementById(`orbis-drawer-tab-${id}`);
  if (!tab) throw new Error(`the display style bar has no ${id} tab`);
  tab.click();
  return drawerShown(id, scrollToEnd);

  // In-page functions cross as source text and cannot call each other, so `pressInDrawer` has its own copy.
  function drawerShown(drawerId: string, toEnd: boolean): DrawerShown {
    const drawer = document.getElementById(`orbis-drawer-${drawerId}`);
    const container = drawer?.parentElement;
    if (!drawer || !container) throw new Error(`no ${drawerId} drawer`);
    if (toEnd) container.scrollTop = container.scrollHeight;
    const shown = (el: Element) => el.getClientRects().length > 0;
    const text = (el: Element | null) => ((el as HTMLElement | null)?.innerText ?? '').replace(/\s+/g, ' ').trim();
    const rows = Array.from(drawer.children)
      .filter(shown)
      .map((row) =>
        row.matches('button')
          ? text(row)
          : Array.from(row.querySelectorAll('.orbis-drawer-label, button'))
              .filter(shown)
              .map(text)
              .filter(Boolean)
              .join(' + ')
      );
    const box = container.getBoundingClientRect();
    const button = drawer.querySelector('.orbis-drawer-page-btn')?.getBoundingClientRect();
    return {
      rows,
      tops: Array.from(drawer.children)
        .filter(shown)
        .map((row) => Math.round(row.getBoundingClientRect().top)),
      focused: text(document.activeElement),
      top: box.top,
      bottom: box.bottom,
      scrolls: container.scrollHeight > container.clientHeight + 1,
      toggle: button
        ? {
            x: Math.round(button.left),
            y: Math.round(button.top),
            inView: button.top >= box.top - 1 && button.bottom <= box.bottom + 1,
          }
        : null,
    };
  }
}

/** Presses the button reading `text` in the open display style tab `id`, and returns what the tab then shows. */
export function pressInDrawer(id: string, text: string): DrawerShown {
  const drawer = document.getElementById(`orbis-drawer-${id}`);
  const container = drawer?.parentElement;
  if (!drawer || !container) throw new Error(`no ${id} drawer`);
  const shown = (el: Element) => el.getClientRects().length > 0;
  const label = (el: Element | null) => ((el as HTMLElement | null)?.innerText ?? '').replace(/\s+/g, ' ').trim();
  const button = Array.from(drawer.querySelectorAll('button')).find((b) => shown(b) && label(b) === text);
  if (!button) throw new Error(`the ${id} tab shows no ${text} button`);
  button.click();
  const rows = Array.from(drawer.children)
    .filter(shown)
    .map((row) =>
      row.matches('button')
        ? label(row)
        : Array.from(row.querySelectorAll('.orbis-drawer-label, button'))
            .filter(shown)
            .map(label)
            .filter(Boolean)
            .join(' + ')
    );
  const box = container.getBoundingClientRect();
  const toggle = drawer.querySelector('.orbis-drawer-page-btn')?.getBoundingClientRect();
  return {
    rows,
    tops: Array.from(drawer.children)
      .filter(shown)
      .map((row) => Math.round(row.getBoundingClientRect().top)),
    focused: label(document.activeElement),
    top: box.top,
    bottom: box.bottom,
    scrolls: container.scrollHeight > container.clientHeight + 1,
    toggle: toggle
      ? {
          x: Math.round(toggle.left),
          y: Math.round(toggle.top),
          inView: toggle.top >= box.top - 1 && toggle.bottom <= box.bottom + 1,
        }
      : null,
  };
}

/** The first slider the open display style tab `id` shows: where it is on screen, its value and its range. */
export function firstSlider(id: string): { x: number; y: number; width: number; value: number; max: number } {
  const drawer = document.getElementById(`orbis-drawer-${id}`);
  const slider = Array.from(drawer?.querySelectorAll<HTMLInputElement>('input[type="range"]') ?? []).find(
    (el) => el.getClientRects().length > 0
  );
  if (!slider) throw new Error(`the ${id} tab shows no slider`);
  const box = slider.getBoundingClientRect();
  return {
    x: box.left,
    y: box.top + box.height / 2,
    width: box.width,
    value: Number(slider.value),
    max: Number(slider.max),
  };
}

/**
 * Stands in for Obsidian's mobile toolbar at the bottom of the window, its top `top` pixels from the window's top, or
 * removes it (null). What a phone's floating navbar is to the display style bar (`navbarClearance`), on a desktop.
 */
export function fakeMobileNavbar(top: number | null): void {
  document.querySelector('.orbis-e2e-navbar')?.remove();
  if (top === null) return;
  const bar = document.createElement('div');
  bar.className = 'mobile-navbar orbis-e2e-navbar';
  Object.assign(bar.style, {
    position: 'fixed',
    left: '0',
    right: '0',
    bottom: '0',
    top: `${top}px`,
    pointerEvents: 'none',
  });
  document.body.appendChild(bar);
}

/** The height the open display style tab may have, as laid out, and the room there is for it now, in pixels. */
export function drawerRoom(): { allowed: number; room: number } {
  const app = (window as unknown as { app: PageApp }).app;
  const view = app.workspace.getLeavesOfType('orbis-reader')[0]?.view as unknown as {
    contentEl: HTMLElement;
    level3Container: HTMLElement;
  };
  const container = view.level3Container;
  return {
    allowed: Number.parseInt(container.style.getPropertyValue('--orbis-drawer-max-height')),
    room: Math.floor(view.contentEl.getBoundingClientRect().bottom - container.getBoundingClientRect().top),
  };
}

/** How many times the open tab is laid out while the book's margins change `times` times. */
export async function layoutsPerChange(times: number): Promise<number> {
  const app = (
    window as unknown as {
      app: PageApp & {
        saveLocalStorage(k: string, v: string): void;
        workspace: { trigger(n: string, ...a: unknown[]): void };
      };
    }
  ).app;
  const view = app.workspace.getLeavesOfType('orbis-reader')[0]?.view as unknown as { fitDisplayDrawer(): void };
  const own = view.fitDisplayDrawer;
  let count = 0;
  view.fitDisplayDrawer = () => {
    count++;
    own();
  };
  for (let i = 1; i <= times; i++) {
    app.saveLocalStorage('orbis-margins', String(i));
    app.workspace.trigger('orbis:settings-change', 'orbis-margins', String(i));
  }
  await new Promise((done) => setTimeout(done, 300));
  view.fitDisplayDrawer = own;
  return count;
}

/** Closes the open book's display style bar, as its button or Escape does. */
export function closeDisplayBar(): void {
  const app = (window as unknown as { app: PageApp }).app;
  const view = app.workspace.getLeavesOfType('orbis-reader')[0]?.view as unknown as { closeDisplayMenu(): void };
  view.closeDisplayMenu();
}

/** Makes the open book's display style bar `width` pixels wide, as on a phone, or as wide as the pane again (null). */
export function narrowDisplayBar(width: number | null): void {
  const app = (window as unknown as { app: PageApp }).app;
  const view = app.workspace.getLeavesOfType('orbis-reader')[0]?.view as unknown as {
    displayMenuWrapper?: HTMLElement;
  };
  if (!view?.displayMenuWrapper) throw new Error('no book is open, or it has no display style bar');
  view.displayMenuWrapper.style.width = width === null ? '' : `${width}px`;
}

/** Selects the row labelled `label` in the open pick list (a reading status, a rating), as a click on it does. */
export async function pickRow(label: string): Promise<void> {
  const find = () =>
    Array.from(document.querySelectorAll<HTMLElement>('.orbis-pick-row')).find(
      (row) => (row.querySelector('.orbis-pick-label')?.textContent ?? '').trim() === label
    );
  for (let wait = 0; !find() && wait < 25; wait++) await new Promise((r) => setTimeout(r, 200));
  const row = find();
  if (!row) {
    const offered = Array.from(document.querySelectorAll('.orbis-pick-label')).map((l) => l.textContent?.trim());
    throw new Error(`the list has no "${label}"; it has ${JSON.stringify(offered)}`);
  }
  row.click();
  await new Promise((r) => setTimeout(r, 300));
}

/**
 * Closes every tab in the main area, books and notes alike. The runner calls it before each test, so a test starts
 * from an empty workspace whatever the last one opened: notes that Generate notes or a conversion opened beside a book
 * would otherwise pile up in splits and squeeze the next book into a pane too small to turn a page in.
 */
export async function closeEveryTab(): Promise<void> {
  const workspace = (
    window as unknown as { app: { workspace: { iterateRootLeaves(fn: (leaf: { detach(): void }) => void): void } } }
  ).app.workspace;
  const leaves: { detach(): void }[] = [];
  workspace.iterateRootLeaves((leaf) => {
    leaves.push(leaf);
  });
  for (const leaf of leaves) leaf.detach();
  await new Promise((r) => setTimeout(r, 300));
}

/**
 * Marks paragraph `n` of the shown section by the paragraph element itself, `(p, 0)` to `(p, n)`, as the listening
 * player's paragraph mark does while a recording plays. Returns the paragraph's text.
 */
export async function markParagraphElement(n: number, sectionText: string): Promise<string> {
  const app = (window as unknown as { app: PageApp }).app;
  const view = app.workspace.getLeavesOfType('orbis-reader')[0]?.view as ReaderView | undefined;
  const fv = view?.foliateView;
  if (!view || !fv) throw new Error('no book is open');
  for (let wait = 0; !view.annot.offeredPreset() && wait < 50; wait++) await new Promise((r) => setTimeout(r, 200));
  const shown = fv.renderer.getContents().find((c) => (c.doc.body?.textContent ?? '').includes(sectionText));
  if (!shown) throw new Error(`no section on screen has "${sectionText}"`);
  const p = Array.from(shown.doc.querySelectorAll('p')).filter((el) => (el.textContent ?? '').trim().length > 40)[n];
  const range = shown.doc.createRange();
  range.selectNodeContents(p);
  view.annot.highlightRange(range, shown.index);
  await new Promise((r) => setTimeout(r, 300));
  return (p.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Stores the open book's annotations with these ids as a paragraph mark made from a recording was stored before the
 * fix: an empty range on the element, `epubcfi(/6/4!/4,/6,/6)` for `epubcfi(/6/4!/4/6,/1:0,/1:434)`.
 */
export function storeAsEmptyRanges(ids: string[]): void {
  const app = (window as unknown as { app: PageApp }).app;
  const view = app.workspace.getLeavesOfType('orbis-reader')[0]?.view as ReaderView | undefined;
  const annot = view?.annot as unknown as {
    highlights: { id: string; cfiRange: string }[];
    notes: { id: string; cfiRange: string }[];
    persistHighlights(): void;
    persistNotes(): void;
  };
  const empty = (cfi: string) => {
    const [parent] = cfi.replace(/^epubcfi\(|\)$/g, '').split(',');
    const step = /\/\d+(\[[^\]]*\])?$/.exec(parent)?.[0];
    if (!step) throw new Error(`cannot make ${cfi} empty`);
    return `epubcfi(${parent.slice(0, -step.length)},${step},${step})`;
  };
  for (const a of [...annot.highlights, ...annot.notes]) if (ids.includes(a.id)) a.cfiRange = empty(a.cfiRange);
  annot.persistHighlights();
  annot.persistNotes();
}

/**
 * For each selector, whether a touch on its first match in the open book would be skipped by Obsidian's mobile swipe:
 * the same test Obsidian makes, an ancestor (or the element) with `data-ignore-swipe`. `null` when nothing matches.
 */
export function swipeIgnored(selectors: string[]): Record<string, boolean | null> {
  const app = (window as unknown as { app: PageApp }).app;
  const view = app.workspace.getLeavesOfType('orbis-reader')[0]?.view as unknown as { containerEl: HTMLElement };
  if (!view) throw new Error('no book is open');
  const seen: Record<string, boolean | null> = {};
  for (const selector of selectors) {
    const el = view.containerEl.querySelector<HTMLElement>(selector);
    seen[selector] = el ? !!el.closest('[data-ignore-swipe]') : null;
  }
  return seen;
}

/**
 * Selects the switch on the row labelled `label` in the display style tab `id`, as a reader does, and returns whether
 * it is on afterwards. The tab must be open — see `openDisplayTab`.
 */
export function flipDrawerSwitch(id: string, label: string): boolean {
  const drawer = document.getElementById(`orbis-drawer-${id}`);
  if (!drawer) throw new Error(`no ${id} drawer`);
  const text = (el: Element | null) => ((el as HTMLElement | null)?.innerText ?? '').replace(/\s+/g, ' ').trim();
  const row = Array.from(drawer.children).find((r) => text(r.querySelector('.orbis-drawer-label')) === label);
  const toggle = row?.querySelector<HTMLElement>('.checkbox-container');
  if (!toggle || toggle.getClientRects().length === 0) throw new Error(`the ${id} tab shows no ${label} switch`);
  toggle.click();
  return toggle.classList.contains('is-enabled');
}

/** How the open display style tab `id` is laid out: stacked as a form or on one line, and its sliders' widths. */
export function drawerSliders(id: string): { form: boolean; sliders: number[] } {
  const drawer = document.getElementById(`orbis-drawer-${id}`);
  if (!drawer || drawer.getClientRects().length === 0) throw new Error(`the ${id} tab is not open`);
  const sliders = Array.from(drawer.querySelectorAll<HTMLInputElement>('input[type="range"]'))
    .filter((slider) => slider.getClientRects().length > 0)
    .map((slider) => Math.round(slider.getBoundingClientRect().width));
  return { form: drawer.classList.contains('is-form'), sliders };
}

/**
 * The What's new dialog as it reads: each release's heading and date, whether **Newer** and **Older** can be pressed,
 * whether its switch is on, and its text. `null` when it is not open.
 */
export function whatsNewDialog(): {
  versions: string[];
  dates: string[];
  newer: boolean;
  older: boolean;
  switchOn: boolean;
  text: string;
  /** The label of the button with the keyboard, or null when it is not a button. */
  focused: string | null;
  /** The dialog's height, and how far down the window its Older button is. */
  height: number;
  buttonsTop: number;
} | null {
  const modal = Array.from(document.querySelectorAll('.modal')).find((m) =>
    m.querySelector('.orbis-whats-new-version')
  );
  if (!modal) return null;
  const button = (label: string) =>
    Array.from(modal.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent === label);
  const texts = (selector: string) => Array.from(modal.querySelectorAll(selector)).map((el) => el.textContent ?? '');
  return {
    versions: texts('.orbis-whats-new-version'),
    dates: texts('.orbis-whats-new-date'),
    newer: !!button('Newer') && !button('Newer')?.disabled,
    older: !!button('Older') && !button('Older')?.disabled,
    switchOn: !!modal.querySelector<HTMLInputElement>('.orbis-whats-new-switch input')?.checked,
    text: (modal.querySelector('.modal-content')?.textContent ?? '').replace(/\s+/g, ' '),
    focused: document.activeElement instanceof HTMLButtonElement ? document.activeElement.textContent : null,
    height: Math.round(modal.getBoundingClientRect().height),
    buttonsTop: Math.round(button('Older')?.getBoundingClientRect().top ?? -1),
  };
}

/** Press a button in the What's new dialog by its label, or its switch with `'switch'`. Whether it was there. */
export function pressInWhatsNew(label: string): boolean {
  const modal = Array.from(document.querySelectorAll('.modal')).find((m) =>
    m.querySelector('.orbis-whats-new-version')
  );
  const target =
    label === 'switch'
      ? modal?.querySelector<HTMLElement>('.orbis-whats-new-switch input')
      : Array.from(modal?.querySelectorAll<HTMLButtonElement>('button') ?? []).find((b) => b.textContent === label);
  target?.click();
  return !!target;
}

/** The text of the notice that contains `part`, or null. With `click`, its link is pressed. */
export function noticeWith(part: string, click = false): string | null {
  const notice = Array.from(document.querySelectorAll('.notice')).find((n) => (n.textContent ?? '').includes(part));
  if (!notice) return null;
  if (click) notice.querySelector<HTMLElement>('a')?.click();
  return (notice.textContent ?? '').trim();
}

/** Writes a binary file into the vault from base64, making its folders. */
export async function writeVaultBinary(path: string, base64: string): Promise<void> {
  const app = (
    window as unknown as {
      app: {
        vault: {
          getAbstractFileByPath(p: string): unknown;
          createFolder(p: string): Promise<unknown>;
          createBinary(p: string, d: ArrayBuffer): Promise<unknown>;
        };
      };
    }
  ).app;
  let folder = '';
  for (const part of path.split('/').slice(0, -1)) {
    folder = folder ? `${folder}/${part}` : part;
    if (!app.vault.getAbstractFileByPath(folder)) await app.vault.createFolder(folder);
  }
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  await app.vault.createBinary(path, bytes.buffer);
}

/** Deletes a folder of the vault and everything in it, if it is there. */
export async function deleteVaultFolder(path: string): Promise<void> {
  const app = (
    window as unknown as {
      app: { vault: { getAbstractFileByPath(p: string): unknown; delete(f: unknown, force: boolean): Promise<void> } };
    }
  ).app;
  const folder = app.vault.getAbstractFileByPath(path);
  if (folder) await app.vault.delete(folder, true);
}

/** The labels the Font list on the display style bar offers, with the value chosen. Opens the Font tab. */
export function fontListShown(): { labels: string[]; value: string } {
  const app = (window as unknown as { app: PageApp }).app;
  const view = app.workspace.getLeavesOfType('orbis-reader')[0]?.view as unknown as {
    displayStyleBtn: HTMLElement | null;
    displayMenuWrapper?: HTMLElement;
  };
  if (!view?.displayStyleBtn) throw new Error('no book is open');
  if (!view.displayMenuWrapper?.offsetParent) view.displayStyleBtn.click();
  document.getElementById('orbis-drawer-tab-font')?.click();
  const select = Array.from(document.querySelectorAll<HTMLSelectElement>('.orbis-level3-drawer select')).find((s) =>
    Array.from(s.options).some((o) => o.value === 'default')
  );
  if (!select) throw new Error('the Font tab has no Font list');
  return { labels: Array.from(select.options).map((o) => o.text), value: select.value };
}

/**
 * How the open book's chapters on screen use `family`: whether it is loaded in each chapter's document, and the
 * font body text on screen is drawn with — or the first chapter's body, when none shown has body text.
 */
export function bookFontState(family: string): { loaded: boolean[]; paragraphFont: string } {
  const app = (window as unknown as { app: PageApp }).app;
  const view = app.workspace.getLeavesOfType('orbis-reader')[0]?.view as unknown as {
    foliateView: { renderer: { getContents(): { doc: Document }[] } };
  };
  const docs = view.foliateView.renderer.getContents().map((c) => c.doc);
  const loaded = docs.map((doc) =>
    Array.from(doc.fonts as unknown as Iterable<FontFace>).some(
      (f) => f.family.replace(/"/g, '') === family && f.status === 'loaded'
    )
  );
  // The first chapter on screen can be a cover, with no paragraph: body text if any chapter shown has some, else the
  // body itself, which the display style's font is also set on.
  const el =
    docs.map((doc) => doc.querySelector<HTMLElement>('.orbis-body-text, p')).find(Boolean) ?? docs[0]?.body ?? null;
  return { loaded, paragraphFont: el ? (el.ownerDocument.defaultView?.getComputedStyle(el).fontFamily ?? '') : '' };
}

/** Renames a file or folder through Obsidian's file manager, as moving it in the file explorer does. */
export async function renameVaultPath(from: string, to: string): Promise<void> {
  const app = (
    window as unknown as {
      app: {
        vault: { getAbstractFileByPath(p: string): unknown };
        fileManager: { renameFile(f: unknown, to: string): Promise<void> };
      };
    }
  ).app;
  const item = app.vault.getAbstractFileByPath(from);
  if (!item) throw new Error(`${from} is not in the vault`);
  await app.fileManager.renameFile(item, to);
}

/** One of Orbis's settings, as stored. */
export function pluginSetting(key: string): unknown {
  return (window as unknown as { app: { plugins: { plugins: Record<string, { settings: Record<string, unknown> }> } } })
    .app.plugins.plugins['orbis-reader'].settings[key];
}

/** Opens `path` in a new Obsidian window of its own, and waits for the book to show. */
export async function openBookInNewWindow(path: string, timeoutMs: number): Promise<void> {
  const app = (
    window as unknown as {
      app: {
        vault: { getAbstractFileByPath(p: string): unknown };
        workspace: { openPopoutLeaf(): { openFile(f: unknown): Promise<void>; view: unknown } };
      };
    }
  ).app;
  const file = app.vault.getAbstractFileByPath(path);
  if (!file) throw new Error(`${path} is not in the vault`);
  const leaf = app.workspace.openPopoutLeaf();
  await leaf.openFile(file);
  const end = Date.now() + timeoutMs;
  const view = () => leaf.view as { foliateView?: { renderer?: { getContents?(): { doc: Document }[] } } } | undefined;
  while (Date.now() < end && !view()?.foliateView?.renderer?.getContents?.()?.length) {
    await new Promise((r) => setTimeout(r, 200));
  }
}

/** Whether the book in a window of its own has `family` loaded in every chapter on screen. */
export function newWindowBookUses(family: string): { windows: number; loaded: boolean[] } {
  const app = (window as unknown as { app: PageApp }).app;
  const leaves = app.workspace.getLeavesOfType('orbis-reader') as unknown as {
    view: { containerEl: HTMLElement; foliateView: { renderer: { getContents(): { doc: Document }[] } } };
  }[];
  const away = leaves.filter((l) => l.view.containerEl.ownerDocument !== document);
  const docs = away.flatMap((l) => l.view.foliateView.renderer.getContents().map((c) => c.doc));
  return {
    windows: away.length,
    loaded: docs.map((doc) =>
      Array.from(doc.fonts as unknown as Iterable<FontFace>).some(
        (f) => f.family.replace(/"/g, '') === family && f.status === 'loaded'
      )
    ),
  };
}
