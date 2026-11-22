// Reading the open book into the shapes the marks PDF needs.
//
// **Its own module rather than part of `OrbisReaderView`.** Everything here exists to answer one dialog: which
// chapters exist and what each is called, which spine section every annotation sits in, the CSS alignment rules a
// section's document declares, and the blocks the whole-document PDF draws. Nothing else in the reader calls any of
// it — `marksBySection` has three callers and all three are in here.
//
// It is the argument assembly for `openMarksPdfExport`, not the dialog: the dialog is `MarksPdfModal.ts`, and this
// is what a reader view has to be asked in order to fill it.
//
// See docs/design/marks-pdf.md.

import { Notice, normalizePath } from 'obsidian';
import {
  type AlignRule,
  alignmentRules,
  type BookBlock,
  blocksFromDocument,
  leadInGoesTo,
  sliceAtAnchors,
} from './book-blocks';
import { headingOf, sectionKeyOf } from './book-extractor';
import { canonicalizeLinks } from './book-links';
import { confirmReplace } from './ConfirmModal';
import { buildDocumentPdf, type DocumentSection } from './document-pdf';
import { canvasEmojiPictures } from './emoji-canvas';
import { t } from './i18n';
import { digestSelection, marksPdfPath, openMarksPdfExport } from './MarksPdfModal';
import { applySelection, everything, type MarkSelection, markUsage } from './mark-filter';
import {
  annotationStyles,
  buildMarksPdf,
  type ChapterChoice,
  chapterRowsFrom,
  groupMarksByChapter,
  legendFor,
  type MarksPdfScope,
} from './marks-pdf';
import { chooseExportPath, outsideRoute, shareFile, writeExport } from './outside-vault';
import { downloadFonts, fontsInstalled, loadFonts } from './pdf-fonts';
import { embeddableImage } from './pdf-image';
import { type NotesData } from './reader/export-format';
import type { ReaderContext } from './reader/ReaderContext';
import { IOrbisReaderPlugin } from './settings';
import { branchIndexByHref, flattenTocWithDisambiguation, topLevelChapters } from './toc-utils';
import type { OrbisPopupHost } from './ui-utils';
import { qualifyRepeatedNames } from './unlisted-sections';
import { exportFileName } from './vault-names';

/** The one type the save dialog offers. The format's own name, which is not translated. */
const PDF_FILTER = { name: 'PDF', extension: 'pdf' };

/** An image the PDF can embed, as `embeddableImage` returns it. Named so the gathering map below can say it. */
type EmbeddedImage = { bytes: Uint8Array; kind: 'png' | 'jpg' };

/**
 * What this needs beyond `ReaderContext`, which already carries the vault, the open file, `notesData`,
 * `bookSections` and the foliate view.
 *
 * Four, and each is about the book as a FILE rather than as a reading position — which is why they are here and
 * not on the context: the settings a PDF is configured from, the map from a contents href to a spine index, the
 * bytes of an image the book holds, and the metadata the cover sheet prints.
 *
 * It extends `OrbisPopupHost` because the dialog this opens is a popup, and a popup centers over — and freezes the
 * heights of — the surface that opened it. The reader satisfies both halves.
 */
export interface MarksPdfSourceHost extends OrbisPopupHost {
  readonly plugin: IOrbisReaderPlugin;
  readonly sectionHrefMap: Map<string, number>;
  /**
   * A contents href → the spine index holding it, or -1.
   *
   * **Not `sectionHrefMap.get(path)`.** That map is keyed by each section's RESOLVED path, which a contents href
   * matches only in an EPUB: MOBI, AZW3 and FB2 number their sections, so a path lookup finds nothing and every
   * chapter would fall through to being unlisted. This is the resolver Export to vault uses — full path, then
   * basename, then a scan of the section ids, then foliate's own lookup for a Kindle `kindle:pos:` or MOBI
   * `filepos:` link. The two lists cannot agree while they ask different questions.
   */
  hrefToSectionIndex(href: string | undefined): number;
  /** The id a contents entry points at inside its section, or null — see `LocationIndex.anchorOf`. */
  anchorOf(href: string): string | null;
  /** Where a bare `#id` lands when the book's ids are book-wide (FB2), else undefined — see the reader view's. */
  fragmentSectionIndex(id: string): number | undefined;
  /** Whether a section is the chapter before it continuing — the reader view's one answer for every list. */
  sectionContinues(sectionIndex: number): boolean;
  readonly bookMeta: {
    title: string;
    author: string;
    publisher: string;
    language: string;
    pubdate: string;
    description: string;
  };
  loadBookBlob(href: string): Promise<Blob>;
}

/** Everything the Save-as-PDF dialog has to ask the open book. */
export class MarksPdfSource {
  constructor(
    private readonly ctx: ReaderContext,
    private readonly host: MarksPdfSourceHost
  ) {}

  /** Where this PDF lands by default: beside the book, or the folder its own setting names. */
  private pdfFolder(scope: MarksPdfScope, bookFolder: string): string {
    const s = this.host.plugin.settings;
    if (scope === 'digest') return s.marksPdfSameFolderAsBook ? bookFolder : s.marksPdfFolder || '/';
    return s.bookPdfSameFolderAsBook ? bookFolder : s.bookPdfFolder || '/';
  }

  async open(scope: MarksPdfScope): Promise<void> {
    const data = this.ctx.notesData();
    const chapters = groupMarksByChapter(data);
    /**
     * **A book with no marks still exports — as a book.**
     *
     * The two commands answer this separately. `Save as PDF` is a readable
     * PDF of the book whether or not anyone has marked it yet, so it is always available; `Save annotations as
     * PDF` has nothing to make from an unmarked book, so its menu item is grayed and its command is withheld —
     * see `hasMarksToExport` on the reader. Neither one has to open and then explain itself.
     *
     * The dialog does not override the scope on the reader's behalf: asked for the digest with nothing marked,
     * silently opening on the whole document would be the right artifact and the wrong way to arrive at it — a
     * command doing something other than what it says.
     */
    const file = this.ctx.currentFile;
    // Computed up front, whichever artifact is chosen: the dialog lets you switch to the whole document without
    // waiting, and this is one pass over the annotations rather than over the book.
    const { rows: chapterList, keyOf: rowKeyOf } = await this.chapterRows(data);
    /**
     * The digest's chapters and the per-section counts, for one selection.
     *
     * Handed to the dialog rather than computed there: grouping needs the whole snapshot, and the dialog has
     * deliberately never been given one — it takes the chapters already made. This keeps that true while letting
     * the numbers on screen answer to the filter.
     */
    const regroup = (selection: MarkSelection) => {
      const narrowed = applySelection(data, selection);
      // Keyed by chapter ROW, not by spine section: a row is a top-level contents entry, and counting per
      // annotation is what keeps a chapter whose subheadings share one file from counting that file's marks once
      // per subheading.
      const perChapter = new Map<string, number>();
      for (const a of [...narrowed.highlights, ...narrowed.notes]) {
        const key = rowKeyOf(a);
        if (key) perChapter.set(key, (perChapter.get(key) ?? 0) + 1);
      }
      return { chapters: groupMarksByChapter(narrowed), perChapter };
    };
    openMarksPdfExport(
      this.ctx.app,
      // The popup's host — the reader, whose window it centers in and whose heights it freezes while it is open.
      this.host,
      {
        // The settings page answers all of this; the dialog opens on those answers and departs from them for one
        // export without writing anything back. Every other export in the plugin works that way too.
        //
        // Passed in by the command that opened this, and fixed for the life of the dialog: a setting with a radio
        // button over it as well would be two places to answer a question the menu already answers.
        scope,
        chapterScope: 'all',
        chapters: chapterList,
        // Narrowed by nothing to begin with, and never remembered — see `MarksPdfOptions.selection`.
        selection: everything(),
        // One name across both PDFs — see `pdfAttribution`. The two switches below it are read whatever the
        // scope, and ignored by the digest, exactly as `MarksPdfOptions` documents.
        attribution: this.host.plugin.settings.pdfAttribution,
        coverSheet: this.host.plugin.settings.bookPdfCoverSheet,
        includeMarks: this.host.plugin.settings.bookPdfIncludeMarks,
        // Pre-checked. The offer is only made when the faces are missing, so a tick here means "fetch them now".
        downloadFonts: true,
        // Two destinations, picked by which command this is: the digest and the book are different artifacts
        // with different audiences, which is why each has a folder setting of its own.
        folder: this.pdfFolder(scope, file?.parent?.path ?? '/'),
        // Cleaned for the field, so the title's own colon never reaches the Save button — see `exportFileName`.
        fileName: exportFileName(
          t('marks_pdf.suffix', { name: data.meta.title || data.fileBasename }),
          data.fileBasename
        ),
      },
      chapters,
      async (opts, report, destination) => {
        {
          const path = normalizePath(marksPdfPath(opts));
          const name = path.split('/').pop() ?? path;
          /**
           * **Export asks where before anything is built**: a whole book takes a while, and the reader should not
           * wait for it only to cancel the save dialog. That dialog asks before replacing a file itself, so the
           * vault's own replace prompt below is for Save alone. Share writes nothing the reader keeps.
           */
          let exportPath: string | null = null;
          if (destination === 'export') {
            // Nothing is being prepared while the reader picks a place, so the status line says nothing until then.
            report('');
            exportPath = await chooseExportPath(name, PDF_FILTER);
            if (!exportPath) return false; // cancelled: the dialog returns to how it looked before Export was pressed
            report(t('marks_pdf.working'));
          }
          /**
           * Ask before replacing a file that is already there.
           *
           * The EPUB exports ask too. Silently overwriting would be worse here than it sounds:
           * the name is derived from the book's title, so a second export of the same book lands on the first one
           * by default — the copy you may have already annotated in a PDF editor, or sent to someone.
           */
          if (destination === 'vault' && this.ctx.app.vault.getAbstractFileByPath(path)) {
            const replace = await confirmReplace(this.ctx.app, {
              title: t('pdf_overwrite.title'),
              message: t('pdf_overwrite.body'),
              replace: t('epub_overwrite.replace'),
              cancel: t('action.cancel'),
            });
            // Answered before any of the work, so cancelling costs nothing and hands the dialog back rather
            // than ending the export.
            if (!replace) {
              report(''); // nothing to say: the dialog returns to how it looked before Save was pressed
              return false;
            }
          }
          const meta = {
            title: data.meta.title || data.fileBasename,
            author: data.meta.author,
            attribution: opts.attribution,
            // Formatted here so the builders stay free of locale decisions.
            date: new Date().toLocaleDateString(),
            legendHeading: t('marks_pdf.legend_heading'),
            pageLabel: (page: number, total: number) =>
              t('marks_pdf.page_number', { page: String(page), total: String(total) }),
          };
          /**
           * **Everything the writers see is the NARROWED snapshot.**
           *
           * One substitution covers all three: the digest groups these arrays, the whole document builds its style
           * map from them and skips any annotation it cannot find there, and the legend walks them to decide what
           * to explain. So a filtered export gets a legend of the marks it actually contains rather than of the
           * marks the book has — which was the point of asking.
           */
          const narrowed = applySelection(data, opts.selection);
          const legend = legendFor(narrowed);
          try {
            /**
             * The expanded character set, if it is there or the reader just asked for it.
             *
             * A failed download does NOT fail the export: the built-in fonts still draw the document, just with
             * fewer characters, and someone who is offline should get their PDF rather than an error about a CDN.
             */
            const fontDir = `${this.ctx.app.vault.configDir}/plugins/orbis-reader/font-cache`;
            const adapter = this.ctx.app.vault.adapter;
            if (opts.downloadFonts && !(await fontsInstalled(adapter, fontDir))) {
              new Notice(t('notices.pdf_fonts_downloading'));
              try {
                await downloadFonts(adapter, fontDir);
              } catch (e) {
                this.ctx.debug(`pdf fonts failed: ${String(e)}`, 'export');
                new Notice(t('notices.pdf_fonts_failed'));
              }
            }
            const fonts = await loadFonts(adapter, fontDir);
            // An emoji the fonts cannot draw is drawn as the device draws it — see pdf-emoji.ts.
            const pictures = canvasEmojiPictures() ?? undefined;
            const bytes =
              opts.scope === 'document'
                ? await buildDocumentPdf(
                    await this.collectDocumentSections(
                      narrowed,
                      new Set(opts.chapters.filter((c) => c.included).map((c) => c.key)),
                      (done, total) => report(t('marks_pdf.reading', { done: String(done + 1), total: String(total) }))
                    ),
                    // **An empty style map is how the marks are left out.** Every mark is drawn by looking its
                    // annotation up here, and one that is not found is skipped — so withholding the styles drops
                    // the washes, the treatments and the note pins together, without the blocks having to be
                    // rewritten or the writer learning about an option.
                    opts.includeMarks ? annotationStyles(narrowed) : new Map(),
                    meta,
                    legend,
                    opts.coverSheet && opts.includeMarks,
                    fonts,
                    (done, total) => report(t('marks_pdf.drawing', { done: String(done + 1), total: String(total) })),
                    pictures
                  )
                : await buildMarksPdf(
                    digestSelection(opts, regroup(opts.selection).chapters),
                    meta,
                    legend,
                    fonts,
                    pictures
                  );
            report(t('marks_pdf.saving'));
            if (exportPath) {
              await writeExport(exportPath, bytes);
              // The whole path: the file is outside the vault, and the folder it went to is the reader's to find.
              new Notice(t('notices.marks_pdf_saved', { name: exportPath }));
            } else if (destination === 'share') {
              // No notice: the share sheet is on screen, and it is the answer.
              await shareFile(this.ctx.app, name, bytes);
            } else {
              const existing = this.ctx.app.vault.getAbstractFileByPath(path);
              if (existing) await this.ctx.app.vault.adapter.writeBinary(path, bytes.buffer as ArrayBuffer);
              else await this.ctx.app.vault.createBinary(path, bytes.buffer as ArrayBuffer);
              new Notice(t('notices.marks_pdf_saved', { name }));
            }
            return true;
          } catch (e) {
            this.ctx.debug(`marks pdf failed: ${String(e)}`, 'export');
            // Said in the dialog as well as in a Notice: the dialog is still open, and it is where the
            // reader is looking. It stays open so the export can be retried or the destination changed.
            report(t('marks_pdf.failed_inline', { message: e instanceof Error ? e.message : String(e) }));
            new Notice(t('notices.marks_pdf_failed', { error: String(e) }));
            return false;
          }
        }
      },
      // Offered only while the faces are missing: once they are cached the question has an answer.
      !(await fontsInstalled(
        this.ctx.app.vault.adapter,
        `${this.ctx.app.vault.configDir}/plugins/orbis-reader/font-cache`
      )),
      // Names for the chapters the contents page could not name — every one of them on MOBI, AZW3 and FB2.
      (list, onNamed, alive) => this.nameChapters(list, onNamed, alive),
      // Everything the mark filter needs. `usage` is over the whole book on purpose — see the parameter.
      { marks: data.marks ?? [], usage: markUsage(data), regroup },
      outsideRoute(this.ctx.app)
    );
  }

  /**
   * The book's chapters, with how many marks each holds — for the dialog to list before anything is written.
   *
   * **One row per top-level contents entry, plus one per spine section the contents never reaches.** The same two
   * cases `exportRows` builds, in the same order, because the two lists are meant to be the same list. The spine
   * is walked rather than the contents page: a section nothing points at — a cover, a title page — is exactly
   * what the contents page cannot tell you about, and walking the contents instead would offer a ticked "Cover"
   * row that produces no file.
   *
   * `resolveNavigation` gives the spine index a CFI belongs to without parsing that section's document, so the
   * counts cost one pass over the annotations rather than a pass over the book.
   *
   * **Returns the resolver alongside the rows, because the counts have to be recounted.** The dialog re-asks on
   * every change to the mark filter, and a row's count must be a count of ANNOTATIONS, not a sum over the spine
   * sections its subtree touches: a chapter with five subheadings in one file would count that file's marks five
   * times. One annotation, one row, asked the same way both times.
   */
  async chapterRows(data: NotesData): Promise<{
    rows: ChapterChoice[];
    /** Which row an annotation belongs to, or nothing when the book cannot place it. */
    keyOf: (a: { id: string; chapterHref?: string }) => string | undefined;
  }> {
    const counts = await this.marksBySection(data);
    const { rows, rowOfHref, rowOfSection } = chapterRowsFrom({
      toc: data.tocItems ?? [],
      sections: this.ctx.bookSections,
      sectionIndexOf: (href) => this.host.hrefToSectionIndex(href),
      sectionKey: sectionKeyOf,
      continues: (i) => this.host.sectionContinues(i),
    });
    /** Annotation id → spine index, so the fallback below has something to fall back to. */
    const sectionOfAnnotation = new Map<string, number>();
    for (const [index, list] of counts) for (const { id } of list) sectionOfAnnotation.set(id, index);

    /**
     * Which row an annotation belongs to — its branch, or the unlisted row covering its section.
     *
     * Counted per ANNOTATION rather than summed over the spine sections a subtree touches: a chapter with five
     * subheadings in one file would otherwise count that file's marks five times.
     */
    const keyOf = (a: { id: string; chapterHref?: string }): string | undefined => {
      const byHref = a.chapterHref ? rowOfHref.get(a.chapterHref) : undefined;
      if (byHref) return byHref;
      const index = sectionOfAnnotation.get(a.id);
      return index === undefined ? undefined : rowOfSection.get(index);
    };

    const tally = new Map<string, number>();
    for (const a of [...data.highlights, ...data.notes]) {
      const key = keyOf(a);
      if (key) tally.set(key, (tally.get(key) ?? 0) + 1);
    }
    for (const row of rows) row.marks = tally.get(row.key) ?? 0;
    return { rows, keyOf };
  }

  /** Every annotation, grouped by the spine index its CFI resolves into, with the resolver that will place it. */
  private async marksBySection(
    data: NotesData
  ): Promise<Map<number, { id: string; anchor: (doc: Document) => Range | Node | null }[]>> {
    const bySection = new Map<number, { id: string; anchor: (doc: Document) => Range | Node | null }[]>();
    for (const a of [...data.highlights, ...data.notes]) {
      try {
        const { index, anchor } = this.ctx.foliateView?.resolveNavigation(a.cfiRange) ?? {};
        if (index === undefined || !anchor) continue;
        const list = bySection.get(index) ?? [];
        list.push({ id: a.id, anchor });
        bySection.set(index, list);
      } catch {
        // A CFI that no longer resolves — the book was regenerated under it. It still appears in the digest;
        // here it simply goes unmarked, and its chapter counts one fewer.
      }
    }
    return bySection;
  }

  /**
   * Give a name to every chapter the contents page could not name, by asking the section.
   *
   * **Why any row is nameless.** A section is labeled by the contents entry that starts it, resolved through
   * `sectionHrefMap`. That resolves for an EPUB and not for MOBI, AZW3 or FB2, whose section ids are numbers —
   * so on those three formats EVERY row would read "Untitled", in a list that exists to pick between them. Even on an
   * EPUB the first section is usually a cover no entry points at.
   *
   * **After the dialog is open, and written onto the CHOICE.** Rendering every section before the list appears is
   * the cost this dialog avoids by not analysing anything up front — so the names arrive late and `onNamed`
   * repaints once. They go on the `ChapterChoice` rather than into the DOM because the PDF dialog rebuilds itself
   * on every tick, and a name written into a row would not survive the next one.
   *
   * Capped for the same reason `nameUnlistedRows` is: a book whose contents page names nothing would otherwise
   * render cover to colophon to fill a list. `alive` is the other half of that — the cap bounds the work, and
   * `alive` stops it early when the dialog it was for has gone.
   */
  async nameChapters(chapters: ChapterChoice[], onNamed: () => void, alive: () => boolean): Promise<void> {
    // **Only the unlisted rows.** A row that is a contents entry always has the contents' own name for it, so
    // there is nothing to read a section for. What is left is the covers and title pages, which is what this is
    // for.
    const nameless = chapters.filter((c) => c.unlisted && c.index !== undefined && !c.title.trim()).slice(0, 400);
    if (!nameless.length) return;
    let named = false;
    for (const chapter of nameless) {
      // Every turn of this loop parses a section, so a closed dialog stops it here rather than reading the rest of
      // a book nobody is looking at.
      if (!alive()) return;
      const index = chapter.index as number;
      const raw = this.ctx.bookSections[index] as unknown as { createDocument?: () => Promise<Document> };
      let title = '';
      try {
        const doc = await raw.createDocument?.();
        if (doc) title = headingOf(doc, this.host.bookMeta.title, index);
      } catch {
        continue; // a section that will not render is one the export would skip anyway
      }
      // Numbered when it offers no heading — true, and better than a column of identical "Untitled".
      chapter.title = title || t('book_export_modal.section_n', { n: String(index + 1) });
      named = true;
    }
    // A repeated name gets the chapter it sits in, as it does in Save as Markdown and the recording list.
    const qualified = qualifyRepeatedNames(chapters.map((c) => ({ name: c.title, listed: !c.unlisted })));
    chapters.forEach((c, i) => {
      if (c.unlisted && qualified[i] !== c.title) c.title = qualified[i];
    });
    if (named) onNamed();
  }

  /**
   * The alignment rules that apply to a section, from the stylesheets it links to.
   *
   * **Read rather than assumed.** An EPUB says how an illustration sits, and it says it in a class:
   * `.figcenter { text-align: center }` beside `.figleft { float: left }`. Centring every plate because books
   * center plates is right about half the time and imposes a structure the file never claimed.
   *
   * A stylesheet that will not load costs the alignment and nothing else — the pictures still print.
   */
  private async alignRulesFor(
    doc: Document,
    resolveHref: ((href: string) => string) | undefined,
    cache: Map<string, AlignRule[]>
  ): Promise<AlignRule[]> {
    const rules: AlignRule[] = [];
    for (const link of Array.from(doc.querySelectorAll('link[rel~="stylesheet"]'))) {
      const href = link.getAttribute('href');
      if (!href) continue;
      const path = resolveHref?.(href) ?? href;
      const cached = cache.get(path);
      if (cached) {
        rules.push(...cached);
        continue;
      }
      let parsed: AlignRule[] = [];
      try {
        parsed = alignmentRules(await (await this.host.loadBookBlob(path)).text());
      } catch {
        // Unreadable or absent: the images print where the default puts them.
      }
      cache.set(path, parsed);
      rules.push(...parsed);
    }
    // A `<style>` block in the section itself is more specific than a linked sheet, so it goes last and wins.
    for (const style of Array.from(doc.querySelectorAll('style')))
      rules.push(...alignmentRules(style.textContent ?? ''));
    return rules;
  }

  /**
   * The blocks the whole document draws, cut into one section per chapter.
   *
   * **Reading is per spine file; the cutting happens after.** One `createDocument()` per file, so the cutting
   * adds no reads — then the file's blocks are sliced at every anchor the contents
   * page declares and the pieces are gathered back under the chapter that owns them. A row is a top-level
   * contents entry, so `design.epub` yields 39 sections rather than the 434 a per-entry split would.
   *
   * **Finding the boundary is a lookup, not a parse.** `BookBlock.anchors` already records the ids each block
   * defines — it exists for internal links. The markdown path has to inject marker tokens and find them again by
   * regex because converting to markdown loses element identity; blocks keep theirs.
   *
   * The rules are Export to vault's, not new ones — see `book-extractor.ts`:
   *
   * - **A section the contents page says nothing about is taken whole**, under its own key. It is its own row.
   * - **Text above the first anchor goes where its words belong** (`leadInGoesTo`): the chapter before it,
   *   continuing, a piece of its own when it has its own heading, or the opening of its file's first chapter — and
   *   follows the tick of whichever it joined. A piece of its own rides along with its file, going when every
   *   chapter in its file goes.
   * - **An anchor the contents declares but the document does not contain** cannot be located, so the piece before
   *   it keeps running: the same fallback `splitSectionMarkdown` takes.
   */
  private async collectDocumentSections(
    data: NotesData,
    /** The keys of the chapter rows to draw — a branch href, or an unlisted section's own key. */
    include: ReadonlySet<string>,
    /** Reading every included section is the slow half of a PDF, so it is the half worth reporting. */
    onProgress?: (done: number, total: number) => void
  ): Promise<DocumentSection[]> {
    const annotations = [...data.highlights, ...data.notes];

    /**
     * **`resolveNavigation` answers both halves of the question, so nothing here parses a CFI.**
     *
     * It returns the spine index a CFI belongs to AND an `anchor(doc)` that resolves it inside that section's
     * document — which is what foliate itself uses to draw an annotation. Matching annotations to sections by
     * `chapterHref` through `sectionHrefMap` instead would produce a document with no marks on it at all: a TOC
     * href and a resolved section path are not the same string, so every lookup would miss and every annotation
     * would be silently dropped before it could be resolved.
     */
    const bySection = await this.marksBySection(data);

    const branches = topLevelChapters(data.tocItems ?? []);
    const branchOf = branchIndexByHref(branches);
    /** The contents entries each spine file holds, in contents order — the cut points, before they are located. */
    const cutsBySection = new Map<number, { fragment: string; owner: string }[]>();
    for (const entry of flattenTocWithDisambiguation(data.tocItems ?? [])) {
      const fragment = this.host.anchorOf(entry.href) ?? '';
      const index = this.host.hrefToSectionIndex(entry.href);
      const idx = branchOf.get(entry.href);
      // An entry under no branch is its own row, keyed by its own href — as it is in the picker.
      const owner = idx === undefined ? entry.href : branches[idx].href;
      if (index < 0) continue;
      const list = cutsBySection.get(index);
      if (list) list.push({ fragment, owner });
      else cutsBySection.set(index, [{ fragment, owner }]);
    }

    /** Chapters in the order the spine first reaches them, each gathering pieces from however many files. */
    const gathered = new Map<string, { title: string; blocks: BookBlock[]; images: Map<string, EmbeddedImage> }>();
    const bucket = (key: string, title: string) => {
      const found = gathered.get(key);
      if (found) return found;
      const made = { title, blocks: [] as BookBlock[], images: new Map<string, EmbeddedImage>() };
      gathered.set(key, made);
      return made;
    };
    const titleOf = (key: string): string => branches.find((b) => b.href === key)?.displayLabel ?? '';
    /**
     * The row a continuing section's text belongs to: whichever owned the section before it — the last cut of a
     * listed file, or an unlisted file's own key. The same answer `chapterRowsFrom` gives the picker.
     */
    const continuationOwner = new Map<number, string>();
    let lastOwner: string | null = null;
    for (let i = 0; i < this.ctx.bookSections.length; i++) {
      const cuts = cutsBySection.get(i);
      if (cuts?.length) lastOwner = cuts[cuts.length - 1].owner;
      else if (lastOwner && this.host.sectionContinues(i)) continuationOwner.set(i, lastOwner);
      else lastOwner = sectionKeyOf(this.ctx.bookSections[i], i);
    }
    /**
     * The row a listed file's lead-in may continue: the chapter the file before it ended in, when that one was
     * anchored partway down — `leadInGoesTo` decides, once the text is read.
     */
    const leadOwner = new Map<number, string>();
    for (let i = 1; i < this.ctx.bookSections.length; i++) {
      const before = cutsBySection.get(i - 1);
      const last = before?.[before.length - 1];
      if (cutsBySection.get(i) && last?.fragment) leadOwner.set(i, last.owner);
    }
    /** Whether a spine file holds anything the selection asked for — cheap, and it decides what is even read. */
    const wanted = (i: number): boolean => {
      const cuts = cutsBySection.get(i);
      const lead = leadOwner.get(i);
      if (cuts) return cuts.some((c) => include.has(c.owner)) || (!!lead && include.has(lead));
      return include.has(continuationOwner.get(i) ?? sectionKeyOf(this.ctx.bookSections[i], i));
    };

    // Books share one stylesheet across every chapter, so it is fetched and parsed once rather than 300 times.
    const cssCache = new Map<string, AlignRule[]>();
    let marked = 0;
    let read = 0;
    const toRead = this.ctx.bookSections.filter((_, i) => wanted(i)).length;
    for (let i = 0; i < this.ctx.bookSections.length; i++) {
      const raw = this.ctx.bookSections[i] as unknown as {
        createDocument?(): Promise<Document>;
        resolveHref?: (href: string) => string;
      };
      if (!raw.createDocument || !wanted(i)) continue;
      onProgress?.(read++, toRead);
      let doc: Document;
      try {
        doc = await raw.createDocument();
      } catch (e) {
        this.ctx.debug(`marks pdf: section ${i} would not parse — ${String(e)}`, 'export');
        continue;
      }
      const ranges: { id: string; range: Range }[] = [];
      for (const { id, anchor } of bySection.get(i) ?? []) {
        const resolved = anchor(doc);
        // A point CFI resolves to a node rather than a range; only a range can be marked.
        if (resolved && 'startContainer' in (resolved as Range)) ranges.push({ id, range: resolved as Range });
      }
      const blocks = blocksFromDocument(doc, ranges, await this.alignRulesFor(doc, raw.resolveHref, cssCache));
      if (!blocks.length) continue;
      /**
       * **Cut BEFORE the links are canonicalised, because that rewrites the anchors.**
       *
       * `canonicalizeLinks` namespaces every id it finds — `pgepubid00005` becomes `3#pgepubid00005` — so that a
       * link from another section has something unambiguous to point at. A contents href carries the bare id, so
       * after that rewrite no cut can ever match one: every file would fall through to its unclaimed lead-in,
       * drawing one section per spine file instead of one per chapter. Slicing only reads the
       * anchors and returns index ranges, so doing it first costs nothing and the ranges stay valid.
       */
      const pieces = cutsBySection.get(i) ? sliceAtAnchors(blocks, cutsBySection.get(i) ?? []) : null;
      canonicalizeLinks(
        blocks,
        i,
        raw.resolveHref,
        (path) => this.host.sectionHrefMap.get(path),
        (id) => this.host.fragmentSectionIndex(id)
      );
      marked += blocks.reduce((n, b) => n + b.marks.length, 0);
      const images = new Map<string, { bytes: Uint8Array; kind: 'png' | 'jpg' }>();
      for (const block of blocks) {
        if (block.kind !== 'image' || !block.src || images.has(block.src)) continue;
        try {
          const href = raw.resolveHref?.(block.src) ?? block.src;
          // Converted when it has to be: a note clipped from the web carries WebP, which pdf-lib cannot embed.
          const ready = await embeddableImage(await this.host.loadBookBlob(href));
          if (ready) images.set(block.src, ready);
          else this.ctx.debug(`marks pdf: could not decode ${block.src}`, 'export');
        } catch {
          // Missing or unreadable: the caption prints on its own.
        }
      }
      if (!pieces) {
        // A section the contents page says nothing about — a cover, a title page. Taken whole under its own key,
        // which is the key the picker listed it by; or the chapter before it, continuing.
        const key = continuationOwner.get(i) ?? sectionKeyOf(this.ctx.bookSections[i], i);
        const into = bucket(key, '');
        into.blocks.push(...blocks);
        for (const [src, img] of images) into.images.set(src, img);
        continue;
      }

      const own = (cutsBySection.get(i) ?? []).some((c) => include.has(c.owner));
      for (const piece of pieces) {
        // A lead-in joins the chapter before it or the file's first, under that one's tick — or stays its own,
        // riding along with its file under a key of its own: two files' lead-ins are two different things.
        const owner = piece.owner
          ? piece.owner
          : leadInGoesTo(blocks, piece, leadOwner.get(i), pieces.find((p) => p.owner)?.owner);
        if (!owner && !own) continue;
        if (owner && !include.has(owner)) continue;
        const key = owner ?? `\u0000lead:${i}`;
        const into = bucket(key, owner ? titleOf(owner) : '');
        into.blocks.push(...blocks.slice(piece.from, piece.to));
        for (const [src, img] of images) into.images.set(src, img);
      }
    }
    const sections: DocumentSection[] = [...gathered.values()]
      .filter((s) => s.blocks.length)
      .map(({ title, blocks, images }) => ({ title, blocks, images }));
    /**
     * **The cut counts are in here on purpose.** If the chapters stop being cut at all — `canonicalizeLinks`
     * rewriting the anchors before the slicing looks for them, say — the only visible symptom is a progress
     * number, and an off-device reproduction can disagree with the app. `branches` against `located` is what
     * says whether the contents found its way into the blocks, in one line, on the device where it fails.
     */
    const located = [...gathered.keys()].filter((k) => !k.startsWith('\u0000lead:')).length;
    this.ctx.debug(
      `marks pdf: ${annotations.length} annotation(s), ${bySection.size} section(s) with marks, ` +
        `${marked} span(s) drawn — ${branches.length} branch(es), ` +
        `${[...cutsBySection.values()].reduce((n, c) => n + c.length, 0)} cut(s), ` +
        `${located} located, ${sections.length} section(s) drawn`,
      'export'
    );
    return sections;
  }
}
