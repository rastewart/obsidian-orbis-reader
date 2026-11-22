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
    getLeaf(kind: 'tab'): { openFile(file: unknown): Promise<void>; view: unknown };
    getLeavesOfType(type: string): { view: unknown; detach(): void }[];
  };
  plugins: { plugins: Record<string, { settings: { noteStyles: { config: unknown }[] } }> };
}

/** The parts of `OrbisReaderView` the tests use. */
interface ReaderView {
  file?: { path: string };
  loadedDocs: Set<Document>;
  bookSections: unknown[];
  tocItems: unknown[];
  foliateView?: {
    goTo(target: number | string): Promise<unknown>;
    renderer: { getContents(): { doc: Document; index: number }[] };
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
 * Marks three paragraphs of the first section that has three, in the order first, third, second, a moment apart, so
 * the order they were made and the order they appear in differ. Returns the start of each paragraph's text, in book
 * order, for the test to look for.
 */
export async function markThreeParagraphsOutOfOrder(): Promise<string[]> {
  const app = (window as unknown as { app: PageApp }).app;
  const view = app.workspace.getLeavesOfType('orbis-reader')[0]?.view as ReaderView | undefined;
  if (!view?.foliateView) throw new Error('no book is open');
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  // The marks load after the book opens; marking before then is silently nothing.
  for (let wait = 0; !view.annot.offeredPreset() && wait < 50; wait++) await sleep(200);
  if (!view.annot.offeredPreset()) throw new Error("the book's marks did not load");
  const before = view.annot.highlights.length;
  for (let index = 0; index < view.bookSections.length; index++) {
    await view.foliateView.goTo(index);
    await sleep(800);
    const shown = view.foliateView.renderer.getContents().find((c) => c.index === index);
    const paragraphs = Array.from(shown?.doc.querySelectorAll('p') ?? []).filter(
      (p) => (p.textContent ?? '').trim().length > 40
    );
    if (!shown || paragraphs.length < 3) continue;
    const [first, second, third] = paragraphs;
    for (const p of [first, third, second]) {
      const range = shown.doc.createRange();
      range.selectNodeContents(p);
      view.annot.highlightRange(range, index);
      // As far apart as a person makes them: each is saved, and the save read back, before the next.
      await sleep(700);
    }
    if (view.annot.highlights.length !== before + 3)
      throw new Error('marking the three paragraphs did not add three marks');
    return [first, second, third].map((p) => (p.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 30));
  }
  throw new Error('no section has three paragraphs');
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
