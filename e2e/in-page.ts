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
      const range = shown.doc.createRange();
      range.selectNodeContents(paragraphs[n]);
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
 * A PDF in the vault: whether it starts as one, and how many pages it has.
 *
 * The pages are counted by their `/Type /Page` objects. A PDF can keep its objects in compressed object streams, so
 * each of those is inflated first, with the browser's own `DecompressionStream`.
 */
export async function pdfInfo(path: string): Promise<{ isPdf: boolean; pages: number }> {
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
  return { isPdf: text.startsWith('%PDF-'), pages: (objects.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length };
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
}

/**
 * Searches the open book as a person does: Open search, the words typed into the bar, Enter. Returns the results
 * once their number has stopped changing for a second.
 */
export async function searchFor(words: string, timeoutMs: number): Promise<SearchResult[]> {
  const app = (window as unknown as { app: PageApp & { commands: PageCommands } }).app;
  const view = app.workspace.getLeavesOfType('orbis-reader')[0]?.view as
    | { search: { barInputEl?: HTMLInputElement; results: { cfi: string; chapterTitle: string; excerpt: string }[] } }
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
  return view.search.results.map((r) => ({ cfi: r.cfi, chapter: r.chapterTitle, excerpt: r.excerpt }));
}

/** Presses Enter in the search bar again, which goes to the next result, as it does for a person. */
export function nextSearchResult(): void {
  const app = (window as unknown as { app: PageApp }).app;
  const view = app.workspace.getLeavesOfType('orbis-reader')[0]?.view as
    | { search: { barInputEl?: HTMLInputElement } }
    | undefined;
  view?.search.barInputEl?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
}
