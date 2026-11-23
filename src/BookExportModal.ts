import { App, Notice } from 'obsidian';
import { frontMatterMask } from './book-chapters';
import { BookMeta, extractBook, headingOf, type RawSection, sectionKeyOf } from './book-extractor';
import { actionRow, choiceGroup, pickList, pickListHeader, pickRow } from './controls';
import { destinationGrid, type FilingState } from './folder-picker';
import { t } from './i18n';
import { askOutsideTarget, type OutsideTarget, outsideRoute, sendOutside } from './outside-vault';
import { CONVERSION_SVG } from './system-glyphs';
import {
  branchIndexByHref,
  flattenTocWithDisambiguation,
  selectedBranchCount,
  TocItemLike,
  topLevelChapters,
} from './toc-utils';
import { answerFold, createOrbisPopup, rebuildKeepingFocus } from './ui-utils';
import { qualifyRepeatedNames } from './unlisted-sections';
import { exportFileName } from './vault-names';

/** The one type the save dialog offers. The format's own name, which is not translated. */
const MD_FILTER = { name: 'Markdown', extension: 'md' };

export interface BookExportViewContext {
  app: App;
  contentEl: HTMLElement;
  bookMeta: BookMeta & { description?: string };
  /** The book being exported, which each chapter note links back to. */
  file: { path: string } | null;
  bookSectionsPublic: Array<{ id: string }>;
  bookToc: TocItemLike[];
  bookTocFlat: Array<{ label: string; href: string }>;
  exactChapterForSection(sIdx: number): string;
  hrefForSection(sIdx: number): string;
  /**
   * A contents href to a spine index — the authoritative mapping, and the only one that works on every format.
   * Section ids are hrefs in an EPUB and plain NUMBERS in MOBI, AZW3 and FB2, so matching by file name silently
   * matches nothing on three formats out of four. A Kindle `kindle:pos:` or MOBI `filepos:` link is placed through
   * foliate's own lookup.
   */
  hrefToSectionIndex(href: string | undefined): number;
  /** The id a contents entry points at inside its section, or null — see `LocationIndex.anchorOf`. */
  anchorOf(href: string): string | null;
  /** Where a bare `#id` lands when the book's ids are book-wide (FB2), else undefined — see the reader view's. */
  fragmentSectionIndex(id: string): number | undefined;
  /** Whether a section is the chapter before it continuing — see `OrbisReaderView.sectionContinues`. */
  sectionContinues(sectionIndex: number): boolean;
  debug(msg: string, category?: string): void;
  loadBookBlob(href: string): Promise<Blob>;
  getCoverBlob(): Promise<Blob | null>;
  lockMobileHeights(): void;
  unlockMobileHeights(): void;
  plugin: {
    settings: {
      markdownSameFolderAsBook: boolean;
      bookExport: {
        defaultExportFolder: string;
        perChapter: boolean;
        includeImages: boolean;
        imageFormat: 'wiki' | 'markdown';
      };
    };
    saveSettings(): Promise<void>;
  };
}

/**
 * The folder Save to opens on: beside the book, or the one the setting names — as Save as PDF chooses
 * (`MarksPdfSource.pdfFolder`). `/` is the vault root, for a book at the root or a folder never chosen.
 */
export function startFolder(
  settings: { markdownSameFolderAsBook: boolean; bookExport: { defaultExportFolder: string } },
  bookPath: string | null
): string {
  if (!settings.markdownSameFolderAsBook) return settings.bookExport.defaultExportFolder || '/';
  return bookPath?.split('/').slice(0, -1).join('/') || '/';
}

function findUnusedFilePath(app: App, basePath: string): string {
  const withoutExt = basePath.endsWith('.md') ? basePath.slice(0, -3) : basePath;
  if (!app.vault.getAbstractFileByPath(`${withoutExt}.md`)) return `${withoutExt}.md`;
  let n = 1;
  while (app.vault.getAbstractFileByPath(`${withoutExt}-${n}.md`)) n++;
  return `${withoutExt}-${n}.md`;
}

function findUnusedFolderPath(app: App, basePath: string): string {
  if (!app.vault.getAbstractFileByPath(basePath)) return basePath;
  let n = 1;
  while (app.vault.getAbstractFileByPath(`${basePath}-${n}`)) n++;
  return `${basePath}-${n}`;
}

/** One tickable thing in the export: a chapter the contents page names, or a section it does not. */
export interface ExportRow {
  /** What the extractor keys this by — a ToC href, or the section's own id for an unlisted one. */
  href: string;
  /**
   * Every href this row owns: its own, then each contents entry beneath it.
   *
   * **A row is a document, not a heading.** The extractor splits a spine section at every anchor the contents
   * page declares and keeps only the chunks whose href was selected — so a row naming just its own href would
   * export the paragraph above the first `##` and silently drop the rest of the file. See `topLevelChapters`.
   *
   * One entry long for a flat contents page, and for an unlisted section, which owns only itself.
   */
  hrefs: string[];
  label: string;
  /** True for a section no contents entry points at, which the row says so it does not look like a mystery. */
  unlisted: boolean;
  /**
   * The spine index this row came from, for an unlisted row only.
   *
   * **Carried, not searched for.** Finding the section by comparing `String(s.id)` against the row's key works
   * only while the two are the same string, i.e. only in an EPUB. MOBI, AZW3 and FB2 number their sections, so the
   * key is `section:0` and the id is `0`: no match, no name, and every row in those books would sit at "Section 1 …
   * Section N" while the export itself named the files correctly.
   */
  index?: number;
}

/**
 * Everything the export can contain, in spine order.
 *
 * **Built from the spine, not the contents page.** A ToC walk answers "what does this book say it contains",
 * which is not the same question: a cover, a title page, a copyright page and a colophon are all in the book and
 * in none of them. Listing only the ToC would let the two formats disagree about them silently.
 *
 * The keys have to match what `book-extractor` uses, or a tick filters nothing: a ToC chapter is keyed by its
 * href, an unlisted section by its own id — see `collectBySectionFallback`.
 *
 * Sections that are already a chapter's file are skipped here, since the chapter row covers them. The comparison
 * is by basename, the same way the extractor maps a ToC href back to a spine section.
 */
export function exportRows(view: BookExportViewContext): { rows: ExportRow[]; selectable: boolean } {
  const toc = flattenTocWithDisambiguation(view.bookToc);

  /**
   * The contents entries that live in each spine section, in contents order.
   *
   * **Resolved, not matched by file name.** Several entries can point INTO one section when the contents page
   * uses anchors, so a spine walk alone under-counts chapters; and a section id is a path only in an EPUB, so a
   * name comparison finds nothing at all in MOBI, AZW3 and FB2.
   */
  const bySection = new Map<number, typeof toc>();
  for (const entry of toc) {
    const idx = view.hrefToSectionIndex(entry.href);
    if (idx < 0) continue;
    const list = bySection.get(idx);
    if (list) list.push(entry);
    else bySection.set(idx, [entry]);
  }

  /**
   * **A book whose contents page cannot be placed still gets a list.**
   *
   * A contents page whose entries neither the index nor foliate can place leaves nothing here to say which
   * section holds which chapter (a Kindle `kindle:pos:` or MOBI `filepos:` entry is placed through foliate — see
   * `LocationIndex.hrefToSectionIndex`). Hiding the list would mistake which half is missing: the SECTIONS are selectable, keyed exactly as the extractor keys them, and
   * it is only their NAMES that the contents page would have supplied. So the list is built from the spine and every
   * row names itself from its own heading — see `nameUnlistedRows` — which is the same name the file gets.
   */
  /**
   * **One row per top-level contents entry, owning its subtree** — see `topLevelChapters`.
   *
   * Not a row per contents entry at every depth, which is the same list on a Gutenberg EPUB and hundreds of rows
   * for a few dozen documents on a book converted from a folder of notes.
   *
   * Order follows the SPINE, and the branch is emitted at the first section any of its hrefs appears in.
   * That matters for a document whose own href does not resolve but whose headings do — the branch is still
   * listed, in the place it belongs, rather than falling through to a "Section 12" row.
   */
  const branches = topLevelChapters(view.bookToc);
  const branchOf = branchIndexByHref(branches);
  const emitted = new Set<number>();

  const rows: ExportRow[] = [];
  const sections = view.bookSectionsPublic;
  for (let i = 0; i < sections.length; i++) {
    const entries = bySection.get(i);
    if (entries) {
      for (const entry of entries) {
        const idx = branchOf.get(entry.href);
        // An entry under no top-level node cannot happen from a well-formed nav, but a book is a file somebody
        // else made: it becomes its own row rather than vanishing.
        if (idx === undefined) {
          rows.push({ href: entry.href, hrefs: [entry.href], label: entry.displayLabel, unlisted: false });
          continue;
        }
        if (emitted.has(idx)) continue;
        emitted.add(idx);
        const branch = branches[idx];
        rows.push({ href: branch.href, hrefs: branch.hrefs, label: branch.displayLabel, unlisted: false });
      }
      continue;
    }
    // The chapter before it, continuing: no row of its own, because its text goes wherever that chapter's goes.
    if (view.sectionContinues(i)) continue;
    /**
     * **Named for where it is, not for its file.** The file name is an implementation detail of whoever built the
     * book — Project Gutenberg's are `wrap0000`, `wrap0001`, and in MOBI it is a bare number — so it reads as a
     * leak rather than a label. `nameUnlistedRows` replaces this with the section's own heading once it has been
     * read; this is what stands until then, and for a section with no heading to offer.
     */
    const key = sectionKeyOf(sections[i], i);
    rows.push({
      href: key,
      hrefs: [key],
      label: t('book_export_modal.section_n', { n: String(i + 1) }),
      unlisted: true,
      index: i,
    });
  }
  // A book with no readable sections has nothing to offer and nothing to block: `selectable` false leaves the
  // list hidden and the Export button unguarded.
  return { rows, selectable: rows.length > 0 };
}

/**
 * Replace the placeholder names on unlisted sections with what the book calls them.
 *
 * **Read from the section, never guessed from the file name.** The heading a section carries is what the book
 * marks up; `wrap0000` is what the tool that packaged it happened to write, and in MOBI it is a bare number. So
 * this renders each unlisted section and takes its first heading, or the document's `<title>`.
 *
 * Runs AFTER the list is on screen and fills the names in in place, because rendering is async and a dialog that
 * waited would open slowly for names nobody is reading yet. Failure is silent by design: a section with no
 * heading keeps "Section 4", which is true.
 *
 * **A budget, not a gate.** MOBI and AZW3 list their whole spine, so a small cap would leave a long book with
 * most rows unnamed. 400 covers a long book (a long MOBI novel has 145 sections) and still bounds a pathological
 * one; past it the remaining rows keep their numbers rather than the whole list losing its names.
 */
const UNLISTED_NAMING_CAP = 400;

async function nameUnlistedRows(
  view: BookExportViewContext,
  rows: readonly ExportRow[],
  labels: ReadonlyMap<string, HTMLElement>,
  /**
   * Filled in as names are resolved, and read again at export time — see `ExtractOptions.labelForSection`.
   *
   * **The list is the authority on what a section is called.** It renders each unlisted section, reads its heading
   * and applies the front-matter rule; an extractor working all of that out a second time, from a different
   * starting point, would reach a different answer — so a row reading *Front matter* would write a file called
   * `index_split_000`, the packager's own build artifact. Recording the answers here is what lets the export be
   * told rather than made to guess.
   */
  resolved: Map<number, string>
): Promise<void> {
  const unlisted = rows.filter((r) => r.unlisted).slice(0, UNLISTED_NAMING_CAP);

  /**
   * What each unlisted section holds, gathered as the names are read.
   *
   * **The measurement is already being paid for.** Naming a row means rendering its section, and whether that
   * document has any text falls out of the same render — so the front-matter rule can be answered here without a
   * second pass over the book, which is what makes sharing it with the recording list affordable at all.
   */
  const named = new Map<string, string>();
  const hasText = new Map<string, boolean>();

  const sections = view.bookSectionsPublic as unknown as RawSection[];
  for (const row of unlisted) {
    const labelEl = labels.get(row.href);
    // The dialog rebuilds on every format change, and this is still running against the screen it started on.
    if (!labelEl?.isConnected) return;
    const section = row.index === undefined ? undefined : sections[row.index];
    if (!section?.createDocument) continue;
    let name: string;
    try {
      const doc = await section.createDocument();
      // The same reader the extractor uses, given the same book title, so the row you tick and the file it
      // writes carry one name.
      name = headingOf(doc, view.bookMeta.title, row.index);
      hasText.set(row.href, !!doc.body?.textContent?.trim());
      section.unload?.();
    } catch {
      continue; // a section that will not render is one the export would skip anyway
    }
    if (name) named.set(row.href, name);
    if (name && row.index !== undefined) resolved.set(row.index, name);
    if (name && labelEl.isConnected) labelEl.setText(name);
  }

  /**
   * **A repeated name gets the chapter it sits in** — a technical book's eleven "Summary" rows become `1. First Steps –
   * Summary` and the rest. The rule is `qualifyRepeatedNames`, which the recording list applies to the same names;
   * written into `resolved` like any other name, so the note and its heading carry it too.
   */
  const qualified = qualifyRepeatedNames(
    rows.map((row) => ({ name: row.unlisted ? (named.get(row.href) ?? '') : row.label, listed: !row.unlisted }))
  );
  rows.forEach((row, i) => {
    if (!row.unlisted || qualified[i] === (named.get(row.href) ?? '')) return;
    named.set(row.href, qualified[i]);
    if (row.index !== undefined) resolved.set(row.index, qualified[i]);
    const labelEl = labels.get(row.href);
    if (labelEl?.isConnected) labelEl.setText(qualified[i]);
  });

  /**
   * **And then the unnamed prelude becomes *Front matter*.**
   *
   * The rule is `frontMatterMask`, shared with the recording list — see there for why each of its three conditions
   * is load-bearing. Applied here it leaves `Cover` alone, because a section carrying its own heading has already
   * said what it is, and folds the ones that would otherwise sit among real chapter names showing a spine position:
   * `Section 2` between `Cover` and the first chapter's name, which reads as an off-by-one rather than as "nobody
   * named this". Sharing the rule keeps the two dialogs from disagreeing about one book.
   *
   * **Relabelled, not merged.** The recording list folds its run into a single track; these rows are separate
   * files, so each keeps its own tick and its own note — and a run of more than one is numbered, or three rows
   * would read `Front matter` three times with nothing to tell them apart.
   */
  const mask = frontMatterMask(rows, {
    named: (row) => !row.unlisted,
    hasOwnName: (row) => named.has(row.href),
    hasText: (row) => hasText.get(row.href) ?? false,
  });
  const total = mask.filter(Boolean).length;
  let n = 0;
  rows.forEach((row, i) => {
    if (!mask[i]) return;
    n += 1;
    const label =
      total > 1
        ? t('recordings_modal.part_of', {
            label: t('recordings_modal.front_matter'),
            part: String(n),
            total: String(total),
          })
        : t('recordings_modal.front_matter');
    // Recorded whether or not the row is still on screen: the export reads this, and the dialog may have been
    // rebuilt by a format change while this pass was still running.
    if (row.index !== undefined) resolved.set(row.index, label);
    const labelEl = labels.get(row.href);
    if (labelEl?.isConnected) labelEl.setText(label);
  });
}

export class BookExportModal {
  private parentFolder: string;
  private exportName: string;
  /** The name this opened with, and what an emptied name field stands for — see `DestinationSpec.fallback`. */
  private readonly defaultName: string;
  private perChapter: boolean;
  /**
   * Whether the destination fold is open, held on the instance because the popup rebuilds itself — a fresh
   * `<details>` is a closed one, so without this, changing the format would shut a form being typed into.
   */
  private readonly filingFold: FilingState = { open: false };
  /**
   * What each unlisted spine section is called, as the list worked it out — spine index to label.
   *
   * On the instance rather than in the render, because the naming pass is asynchronous and the export reads it
   * later: a dialog rebuilt by a format change starts a fresh pass, but whatever has already been resolved is
   * still true of the book and worth keeping. See `ExtractOptions.labelForSection`.
   */
  private readonly resolvedLabels = new Map<number, string>();
  /**
   * The naming pass for the list on screen, which the export waits for.
   *
   * **A save made before it finished wrote other notes.** The export takes each unlisted section's name from
   * `resolvedLabels`, and a section not named yet was written under its number (`Section 4`), with a repeated name
   * not yet given its chapter (`Summary`) and a different split into notes. A person pressing Save as soon as the
   * dialog opened got that, and the end-to-end tests saw the technical book's notes change from run to run.
   */
  private naming: Promise<void> = Promise.resolve();
  private bodyEl: HTMLElement | null = null;
  /** The button row, a sibling of the scrolling body — created once, emptied and refilled on each rebuild. */
  private footerEl: HTMLElement | null = null;
  private closePopup: (() => void) | null = null;
  private repositionPopup: (() => void) | null = null;

  constructor(
    private app: App,
    private view: BookExportViewContext
  ) {
    const { perChapter } = view.plugin.settings.bookExport;
    this.parentFolder = startFolder(view.plugin.settings, view.file?.path ?? null);
    // The book's title, as every export names its file — cleaned only where it becomes a path (`getOutputPath`), so
    // the field shows the title as the book has it. The book's file name stands in for a book with no title.
    const basename =
      view.file?.path
        .split('/')
        .pop()
        ?.replace(/\.[^.]+$/, '') ?? '';
    this.exportName = view.bookMeta.title || basename || 'exported-book';
    this.defaultName = this.exportName;
    this.perChapter = perChapter;
  }

  open(): void {
    const { popupEl, close, reposition } = createOrbisPopup(this.view, {
      scrollsInside: true, // the buttons sit outside the scroll region — see below
      title: t('book_export_modal.title'),
      icon: CONVERSION_SVG,
      dismissOnOutsideClick: false,
      desktopWidth: 'min(620px, 90vw)',
      mobileMaxWidth: 420,
      mobileFillHeight: true,
      onClose: () => {
        this.bodyEl = null;
        this.footerEl = null;
        this.closePopup = null;
        this.repositionPopup = null;
      },
    });
    this.closePopup = close;
    this.repositionPopup = reposition;
    /**
     * **The buttons sit outside the scroll region.**
     *
     * `createOrbisPopup` makes the popup itself the scroller, so a row at the end of the content is reachable
     * only by scrolling past all of it — past a hundred chapters here, which on a phone means not reachable.
     * So the popup `scrollsInside`: this body takes the space that is left and scrolls inside it, and the footer
     * beside it holds its ground.
     *
     * The footer is built ONCE and refilled, unlike the body, which `render()` throws away wholesale.
     */
    this.bodyEl = popupEl.createDiv({ cls: 'orbis-popup-scroll' });
    this.footerEl = actionRow(popupEl, { placement: 'footer' });
    this.render();
  }

  close(): void {
    this.closePopup?.();
  }

  private getOutputPath(): string {
    const parent = this.parentFolder === '/' ? '' : this.parentFolder;
    const name = exportFileName(this.exportName, 'exported-book');
    if (this.perChapter) return parent ? `${parent}/${name}` : name;
    return parent ? `${parent}/${name}.md` : `${name}.md`;
  }

  /** As in every other self-redrawing dialog: the keyboard survives the rebuild (`rebuildKeepingFocus`). */
  private render() {
    const root = this.bodyEl;
    if (!root) return;
    rebuildKeepingFocus(root, () => this.build());
  }

  private build() {
    const contentEl = this.bodyEl;
    if (!contentEl) return;
    contentEl.empty();

    // ── Format ────────────────────────────────────────────────────────────
    choiceGroup(contentEl, {
      name: 'exportFormat',
      heading: t('generate_notes_modal.format'),
      key: 'export-format',
      options: [
        {
          value: 'single',
          label: t('generate_notes_modal.single_obsidian_note'),
          desc: t('book_export_modal.single_note_desc'),
        },
        {
          value: 'folder',
          label: t('generate_notes_modal.book_folder'),
          desc: t('generate_notes_modal.per_chapter_desc'),
        },
      ],
      value: this.perChapter ? 'folder' : 'single',
      onPick: (value) => {
        this.perChapter = value === 'folder';
        onFormatChange();
      },
    });

    /**
     * ── Where it goes, and what it is called ────────────────────────────
     *
     * **A fold whose header is the resolved path**, the same shape the four other export dialogs use. A label, a
     * folder picker, a name field and a preview line would be four rows in the open for an answer that is usually
     * already right, and the folder and the name are two halves nobody should have to assemble in their head. The
     * header assembles them.
     *
     * Its controls are updated in place rather than redrawn when the format changes: this screen holds its
     * chapter ticks in the DOM, so a rebuild would throw the reader's selection away.
     */
    const filing = answerFold(contentEl, {
      key: 'filing',
      label: t('epub_export.save_to_label'),
      // A trailing separator when the target is a folder, so which of the two it is can be seen rather than
      // inferred from whether the name ends in `.md`.
      value: () => (this.perChapter ? `${this.getOutputPath()}/` : this.getOutputPath()),
      path: true,
      open: this.filingFold,
    });
    // A popup sizes itself to its content, so opening a fold has to tell it to measure again.
    filing.body.parentElement?.addEventListener('toggle', () => this.repositionPopup?.());

    const destination = destinationGrid(filing.body, {
      app: this.app,
      folder: () => this.parentFolder,
      onFolder: (value) => {
        this.parentFolder = value;
        filing.paint();
        renderFileExists();
      },
      name: () => this.exportName,
      onName: (value) => {
        this.exportName = value;
        filing.paint();
        renderFileExists();
      },
      nameKey: 'export-name',
      fallback: () => this.defaultName,
      held: this.filingFold,
      nameLabel: this.perChapter ? t('generate_notes_modal.book_folder') : t('book_export_modal.file_name'),
      // Per chapter the target is a folder, which has no extension to show.
      ext: this.perChapter ? '' : '.md',
    });

    // ── Include images ───────────────────────────────────────────────────
    // Opens on the setting, like the format above it, and departs from it for this export only.
    let includeImages = this.view.plugin.settings.bookExport.includeImages;
    const imgRow = contentEl.createEl('label', { cls: 'orbis-radio-row' });
    const imgCb = imgRow.createEl('input', { type: 'checkbox' });
    imgCb.checked = includeImages;
    imgCb.addClass('orbis-radio-mt');
    const imgWrap = imgRow.createDiv();
    imgWrap.createSpan({ text: t('book_export_modal.include_images'), cls: 'orbis-radio-label' });
    const imgDescEl = imgWrap.createDiv({ cls: 'orbis-radio-desc' });
    const updateImgDesc = () => {
      imgDescEl.textContent = this.perChapter
        ? t('book_export_modal.assets_folder_desc')
        : t('book_export_modal.assets_alongside_desc');
    };
    updateImgDesc();
    imgCb.addEventListener('change', () => {
      includeImages = imgCb.checked;
    });

    /**
     * ── What goes in ─────────────────────────────────────────────────────
     *
     * **Everything in the book, in spine order** — the contents page's chapters and the sections it does not
     * mention: a cover, a copyright page, a colophon. They are rows, ticked by default, so what you get is what the
     * list says rather than what each format happens to do.
     *
     * **Shown for both formats.** Both formats split at the same boundaries, so both can be filtered.
     */
    const { rows: chapters, selectable } = exportRows(this.view);
    const selectedChapterHrefs = new Set(chapters.flatMap((c) => c.hrefs));

    const chapterListEl = contentEl.createDiv({ cls: 'orbis-list-box' });
    // No list for a book whose contents page cannot be placed in the spine — see `exportRows`.
    chapterListEl.toggle(selectable);

    /**
     * The shared header — see `pickListHeader`. It is built before the rows and driven by them: `setAll` and
     * `header.sync` are declared below and referenced here, which is safe because nothing calls either until a
     * reader clicks.
     */
    const header = pickListHeader(chapterListEl, {
      label: t('book_export_modal.chapters'),
      // Counted in ROWS, both halves — see `selectedBranchCount`. The set holds a whole subtree per ticked row, so
      // its `size` can be ten times the row count, and the header would read "434 of 39".
      count: () => ({ selected: selectedBranchCount(chapters, selectedChapterHrefs), total: chapters.length }),
      onSelectAll: () => setAll(() => true),
      onClear: () => setAll(() => false),
      onInvert: () => setAll((on) => !on),
    });

    /**
     * The shared pick row — see `pickRow`, the same as the other three lists: the whole line is the tap target, not
     * the 16px box, which on Android is the difference between a list you can use and one where every second tap
     * misses.
     */
    const chapterScrollEl = pickList(chapterListEl, { plain: true });

    /**
     * **"not in contents" only says something when some rows are.**
     *
     * It marks a row whose name came from the section itself rather than from the contents page — useful beside
     * forty rows that ARE named by it, and meaningless when every row carries it, which is what MOBI, AZW3 and
     * FB2 produce: a column of identical italics distinguishing nothing.
     */
    const someListed = chapters.some((c) => !c.unlisted);

    const checkboxes: HTMLInputElement[] = [];
    /** Row href → its name element, so the async naming below can replace a placeholder in place. */
    const rowLabels = new Map<string, HTMLElement>();
    for (const chapter of chapters) {
      const { check, hit } = pickRow(chapterScrollEl, {
        label: chapter.label,
        // Says why this row has a filename for a name rather than a chapter title — the same muted note the
        // EPUB dialog uses for a chapter with nothing in it.
        note: chapter.unlisted && someListed ? t('book_export_modal.not_in_contents') : undefined,
        noteMuted: chapter.unlisted,
        checked: true,
        key: `chapter:${chapter.href}`,
        onChange: (on) => {
          // The whole document moves together — its own href and every heading under it.
          for (const href of chapter.hrefs) {
            if (on) selectedChapterHrefs.add(href);
            else selectedChapterHrefs.delete(href);
          }
          header.sync();
          updateExportBtn();
        },
      });
      checkboxes.push(check);
      const labelEl = hit.querySelector<HTMLElement>('.orbis-checklist-label');
      if (labelEl) rowLabels.set(chapter.href, labelEl);
    }
    // After the list is on screen, never before it — see `nameUnlistedRows`. Saving waits for it: see `naming`.
    this.naming = nameUnlistedRows(this.view, chapters, rowLabels, this.resolvedLabels).catch(() => undefined);

    /** Every bulk action is this, given a rule — select all, clear and invert differ only in what they return. */
    function setAll(next: (wasOn: boolean) => boolean): void {
      for (let i = 0; i < chapters.length; i++) {
        const on = next(checkboxes[i].checked);
        checkboxes[i].checked = on;
        for (const href of chapters[i].hrefs) {
          if (on) selectedChapterHrefs.add(href);
          else selectedChapterHrefs.delete(href);
        }
      }
      header.sync();
      updateExportBtn();
    }

    /**
     * Everything that depends on the format, re-run when it changes.
     *
     * Declared here and called from the format group at the top of the screen — the same forward reference the
     * folder picker above already makes to `updatePreview` and `renderFileExists`. Safe because nothing calls it
     * until a reader clicks, which is long after `build()` has finished.
     */
    const onFormatChange = () => {
      // The name row is called something different per format, and the path gains or loses `.md` — both updated
      // in place, because rebuilding would lose the chapter ticks below.
      destination.nameLabel.setText(
        this.perChapter ? t('generate_notes_modal.book_folder') : t('book_export_modal.file_name')
      );
      destination.setExt(this.perChapter ? '' : '.md');
      updateImgDesc();
      filing.paint();
      renderFileExists();
      updateExportBtn();
      this.repositionPopup?.();
    };

    // ── File exists ──────────────────────────────────────────────────────
    let fileExistsAction: 'replace' | 'new-version' = 'new-version';
    const fileExistsEl = contentEl.createDiv();

    const renderFileExists = () => {
      fileExistsEl.empty();
      if (!this.app.vault.getAbstractFileByPath(this.getOutputPath())) return;
      const isFolder = this.perChapter;
      fileExistsEl.createEl('p', {
        text: isFolder ? t('file_exists_states.folder_already_exists') : t('file_exists_states.file_already_exists'),
        cls: 'orbis-file-exists-warn',
      });
      const mkRadio = (label: string, value: 'new-version' | 'replace', desc: string) => {
        const row = fileExistsEl.createEl('label', { cls: 'orbis-radio-row' });
        const rb = row.createEl('input', { type: 'radio' });
        rb.name = 'fileExistsAction';
        rb.checked = fileExistsAction === value;
        const wrap = row.createDiv();
        wrap.createSpan({ text: label, cls: 'orbis-radio-label' });
        wrap.createDiv({ text: desc, cls: 'orbis-radio-desc' });
        rb.addEventListener('change', () => {
          if (rb.checked) fileExistsAction = value;
        });
      };
      if (isFolder) {
        mkRadio(t('file_exists_states.save_as_new_version'), 'new-version', t('file_exists_states.new_folder_desc'));
        mkRadio(t('file_exists_states.replace'), 'replace', t('file_exists_states.overwrite_folder_desc'));
      } else {
        mkRadio(t('file_exists_states.save_as_new_version'), 'new-version', t('file_exists_states.new_file_desc'));
        mkRadio(t('file_exists_states.replace'), 'replace', t('file_exists_states.overwrites_the_existing_file'));
      }
    };
    renderFileExists();

    // ── Progress ─────────────────────────────────────────────────────────
    const progressEl = contentEl.createDiv({ cls: 'orbis-export-progress' });
    progressEl.hide();

    // ── Buttons ───────────────────────────────────────────────────────────
    // The footer built in `open()`, emptied rather than recreated: it lives outside the body this rebuild is
    // replacing. `placement: 'footer'` there is what a popup uses in place of a Modal's `.orbis-dialog-footer`,
    // and carries the separator and spacing that element would have brought.
    const btnRow = this.footerEl ?? contentEl;
    btnRow.empty();
    /**
     * Export… or Share…, set apart at the start of the row — see `outsideRoute`. Only for a single note: a book folder
     * is a note per chapter, which belongs in the vault together. Shown and hidden as the format changes, in place,
     * for the same reason the destination fold is: a rebuild would lose the chapter ticks.
     */
    const route = outsideRoute(this.app);
    const outsideBtn = route
      ? btnRow.createEl('button', {
          text: t(route === 'export' ? 'action.export' : 'action.share'),
          cls: 'orbis-action-aside',
        })
      : null;
    const cancelBtn = btnRow.createEl('button', { text: t('action.cancel') });
    const exportBtn = btnRow.createEl('button', { text: t('book_export_modal.save') });
    exportBtn.addClass('mod-cta');

    const updateExportBtn = () => {
      // Both formats: nothing ticked means a single note holding only its frontmatter, which is not an
      // export anyone asked for. A book with no list has nothing to empty, so it is never blocked.
      exportBtn.disabled = selectable && selectedChapterHrefs.size === 0;
      outsideBtn?.toggle(!this.perChapter);
      if (outsideBtn) outsideBtn.disabled = exportBtn.disabled;
    };
    updateExportBtn();

    cancelBtn.addEventListener('click', () => this.close());

    /**
     * Write the book to the vault, or — given a target — send the same single note out of it. Out of the vault there is
     * nothing to replace or version, its links are written to work elsewhere, and its images are left out: they are
     * separate files, and what leaves is one.
     */
    const run = (target?: OutsideTarget) => {
      void (async () => {
        exportBtn.disabled = true;
        cancelBtn.disabled = true;
        if (outsideBtn) outsideBtn.disabled = true;
        progressEl.show();
        progressEl.textContent = t('book_export_modal.starting');

        let outputPath = this.getOutputPath();
        const name = outputPath.split('/').pop() ?? outputPath;
        let written: string | null = null;
        const existingAtPath = this.app.vault.getAbstractFileByPath(outputPath);
        if (!target && fileExistsAction === 'new-version' && existingAtPath) {
          outputPath = this.perChapter
            ? findUnusedFolderPath(this.app, outputPath)
            : findUnusedFilePath(this.app, outputPath);
        }

        try {
          await this.naming;
          const { imageFormat } = this.view.plugin.settings.bookExport;
          await extractBook(
            this.view.bookSectionsPublic,
            this.view.bookMeta,
            outputPath,
            {
              onProgress: (msg) => {
                progressEl.textContent = msg;
              },
              chapterForSection: (sIdx) => this.view.exactChapterForSection(sIdx),
              hrefForSection: (sIdx) => this.view.hrefForSection(sIdx),
              tocEntries: this.view.bookTocFlat,
              // Through the view's own resolver rather than a file-name match: `s.id` is a NUMBER in MOBI, AZW3
              // and FB2, so calling `.split` on it would throw a TypeError inside the export rather than
              // mismatch.
              sectionIndexForHref: (href: string) => this.view.hrefToSectionIndex(href),
              anchorForHref: (href: string) => this.view.anchorOf(href),
              fragmentSectionIndex: (id: string) => this.view.fragmentSectionIndex(id),
              onDebug:
                this.view.app.loadLocalStorage('orbis-dbg-export') === '1'
                  ? (msg) => this.view.debug(msg, 'export')
                  : undefined,
              includeImages: target ? false : includeImages,
              imageFormat: imageFormat ?? 'wiki',
              deliver: target
                ? async (content) => {
                    written = await sendOutside(this.app, target, name, new TextEncoder().encode(content));
                  }
                : undefined,
              loadBookBlob: (href) => this.view.loadBookBlob(href),
              // The names the list settled on, so the row you ticked and the file you get agree — for both
              // formats, since the single note takes its headings from the same place the folder takes its file
              // names. See `ExtractOptions.labelForSection`.
              labelForSection: (sIdx) => this.resolvedLabels.get(sIdx),
              getCoverBlob: () => this.view.getCoverBlob(),
              perChapter: this.perChapter,
              // So an unlisted section's `<title>` can be recognized as the packager's boilerplate — see `headingOf`.
              bookTitle: this.view.bookMeta.title,
              bookPath: this.view.file?.path,
              continuesSection: (i) => this.view.sectionContinues(i),
              // The same words the chapter list shows for that row, so a tick and its file agree.
              sectionLabel: (n) => t('book_export_modal.section_n', { n: String(n) }),
              // Undefined means "everything", which is the honest answer when nothing could be listed.
              selectedChapterHrefs: selectable ? new Set(selectedChapterHrefs) : undefined,
            },
            this.app
          );
          // A share says nothing: the share sheet is on screen, and it is the answer.
          if (!target) new Notice(t('notices.saved_to_path', { path: `${outputPath}${this.perChapter ? '/' : ''}` }));
          else if (written) new Notice(t('notices.saved_to_path', { path: written }));
          this.close();
        } catch (e) {
          progressEl.textContent = t('book_export_modal.error', {
            message: e instanceof Error ? e.message : String(e),
          });
          exportBtn.disabled = false;
          cancelBtn.disabled = false;
          if (outsideBtn) outsideBtn.disabled = false;
        }
      })();
    };
    exportBtn.addEventListener('click', () => run());
    // Export asks where before anything is built; a cancelled save dialog leaves the dialog as it was.
    outsideBtn?.addEventListener('click', () => {
      if (!route) return;
      void askOutsideTarget(route, this.getOutputPath().split('/').pop() ?? '', MD_FILTER).then((target) => {
        if (target) run(target);
      });
    });
  }
}
