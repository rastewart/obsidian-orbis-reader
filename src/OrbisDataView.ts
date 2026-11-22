import * as FoliateViewMod from 'foliate-js/view.js';
import { FileView, Menu, Notice, normalizePath, TAbstractFile, TFile } from 'obsidian';
import { isBookExtension } from './book-formats';
import { deviceSetting } from './device-settings';
import { t } from './i18n';
import type { TranslationKey } from './i18n/en';
import { renderGeneratedCover } from './library/generated-cover';
import { navigateWhenReady } from './OrbisReaderView';
import { writeFolderReadme } from './orbis-readme';
import {
  Bookmark,
  Highlight,
  LocationsCache,
  Note,
  ReadingStats,
  readAllDeviceLocations,
  readLocsCache,
  saveBookInfo,
  scanBacklinks,
  TocEntry,
} from './progress';
import { inReadingOrder, markCfi } from './reader/cfi-sort';
import { logToLibrary } from './reader/DebugLog';
import { locAtCfi, locStartsOf } from './reader/loc-lookup';
import { trimmedMeanWpm, WPM_MIN_SAMPLES } from './reader/stats-math';
import { IOrbisReaderPlugin } from './settings';
import { bookPathForOrbisFile } from './sidecar-names';
import { claimFocusSoon, onActivate } from './ui-utils';
import { VIEW_TYPE_ORBIS_DATA } from './view-types';

export { VIEW_TYPE_ORBIS_DATA };

interface RawTocItem {
  label: string;
  href?: string | number;
  subitems?: RawTocItem[] | null;
}

interface OrbisData {
  highlights?: Highlight[];
  bookmarks?: Bookmark[];
  notes?: Note[];
  readingStats?: ReadingStats;
  title?: string;
  author?: string;
  coverImage?: string;
  toc?: TocEntry[];
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** The location a device's position is in — the number the reader would show there — from the book's cache. */
function locFromCfi(cfi: string, locsCache: LocationsCache | null): number | null {
  if (!locsCache || !cfi) return null;
  return locAtCfi(locStartsOf(locsCache.locNavCache), cfi);
}

export class OrbisDataView extends FileView {
  private plugin: IOrbisReaderPlugin;
  private debugLog: string[] = [];
  private debugEl: HTMLElement | null = null;
  private debugVisible = false;
  /**
   * The row the keyboard was on, as a key rather than an element.
   *
   * **Because the element does not survive.** Opening a book from here writes to the `.orbis` file — a location, a
   * last-opened time — which fires the `modify` handler below, which empties `contentEl` and renders again. So by
   * the time the reader comes back to this tab, whatever they were standing on has been thrown away and rebuilt as
   * a different object. A key resolves against whatever is on screen now; a reference could only ever point at the
   * tree that used to be.
   *
   * `data-orbis-focus` is the convention `captureFocus` uses for the same problem inside one surface. That helper
   * cannot serve here: it reads `activeElement` at the moment of the rebuild, and the rebuild happens while the
   * reader is in the BOOK tab, so there is nothing of ours focused to capture.
   */
  private lastFocusKey: string | null = null;

  constructor(leaf: import('obsidian').WorkspaceLeaf, plugin: IOrbisReaderPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  /**
   * Remember where the keyboard was, and put it back when this tab is opened again.
   *
   * Registered once for the life of the view rather than per file, and on `focusin` rather than on activation, so a
   * reader who tabs to a chapter and switches tabs without pressing anything is returned to it as well.
   */
  onload(): void {
    super.onload();
    this.registerDomEvent(this.contentEl, 'focusin', (evt) => {
      const target = evt.target;
      if (!(target instanceof HTMLElement)) return;
      const keyed = target.closest<HTMLElement>('[data-orbis-focus]');
      if (keyed) this.lastFocusKey = keyed.dataset.orbisFocus ?? null;
    });
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', (leaf) => {
        if (leaf !== this.leaf || !this.lastFocusKey) return;
        const back = this.contentEl.querySelector<HTMLElement>(`[data-orbis-focus="${CSS.escape(this.lastFocusKey)}"]`);
        // `claimFocusSoon`, not `focus()`: Obsidian focuses the view it has just activated, and a claim made in the
        // same tick loses to it. Three attempts, and it withdraws the moment anything else holds focus.
        if (back) claimFocusSoon(back);
      })
    );
    /**
     * Redraw when the file on show changes. **Once, against `this.file`**, not per load against the file loaded: a
     * tab that shows one book's data and then another's kept the first listener, and redrew the first book's data
     * into the second's tab whenever the first was written.
     */
    this.registerEvent(
      this.app.vault.on('modify', (modified: TAbstractFile) => {
        const file = this.file;
        if (file && modified instanceof TFile && modified.path === file.path) {
          this.contentEl.empty();
          void this.render(file);
        }
      })
    );
  }

  getViewType() {
    return VIEW_TYPE_ORBIS_DATA;
  }
  getDisplayText() {
    return this.file?.basename ?? 'Reading Data';
  }
  getIcon() {
    return 'book-open';
  }
  canAcceptExtension(ext: string) {
    return ext === 'orbis';
  }

  private log(msg: string): void {
    const ts = new Date().toISOString().slice(11, 23);
    this.debugLog = [...this.debugLog.slice(-299), `${ts} ${msg}`];
    if (this.debugVisible) this.renderDebugEntries();
  }

  onPaneMenu(menu: Menu, source: string): void {
    super.onPaneMenu(menu, source);
    if (source === 'more-options' && deviceSetting('showDebugButton')) {
      menu.addSeparator();
      menu.addItem((item) =>
        item
          .setTitle(t(this.debugVisible ? 'debug_panel.hide_log' : 'debug_panel.show_log'))
          .setIcon('bug')
          .onClick(() => this.toggleDebug())
      );
    }
  }

  private toggleDebug(): void {
    this.debugVisible = !this.debugVisible;
    if (!this.debugEl) {
      this.debugEl = this.contentEl.createDiv({ cls: 'orbis-data-debug-panel' });
    }
    this.debugEl.toggle(this.debugVisible);
    if (this.debugVisible) this.renderDebugEntries();
  }

  private renderDebugEntries(): void {
    if (!this.debugEl) return;
    this.debugEl.empty();
    const header = this.debugEl.createDiv({ cls: 'orbis-data-debug-header' });
    header.createSpan({ text: t('debug_panel.debug_log') });
    const copyBtn = header.createEl('button', { text: t('debug_panel.copy'), cls: 'orbis-data-debug-copy' });
    copyBtn.addEventListener('click', () => {
      void navigator.clipboard.writeText(this.debugLog.join('\n'));
    });
    const clearBtn = header.createEl('button', { text: t('debug_panel.clear'), cls: 'orbis-data-debug-copy' });
    clearBtn.addEventListener('click', () => {
      this.debugLog = [];
      this.renderDebugEntries();
    });
    const list = this.debugEl.createDiv({ cls: 'orbis-data-debug-list' });
    for (const entry of [...this.debugLog].reverse()) {
      list.createDiv({ cls: 'orbis-data-debug-entry', text: entry });
    }
  }

  async onLoadFile(file: TFile): Promise<void> {
    this.contentEl.empty();
    await this.render(file);
    // Opened from the Files pane as well as from Show reading data, and it brings the folder's readme up to date
    // either way — see `writeFolderReadme`.
    if (file.parent?.name === '!orbis-data') void writeFolderReadme(this.app, file.parent.path);

    /**
     * **Here as well as in the reader, and this page has the better claim.** It draws a table of Device / Last
     * opened / Last location — so a reader on a vault used elsewhere is being SHOWN the other devices by name,
     * with nothing saying they could pick up where those left off. Evidence of the feature, and no offer.
     *
     * Same guard as the reader's: once per device, only when this one is not already taking part.
     */
    void this.plugin.offerFirstRun();
  }

  private async render(file: TFile): Promise<void> {
    this.log(`render start: ${file.path}`);
    let data: OrbisData = {};
    try {
      const content = await this.app.vault.cachedRead(file);
      if (content.trim()) data = JSON.parse(content) as OrbisData;
      this.log(`orbis file parsed — keys: ${Object.keys(data).join(', ')}`);
    } catch {
      this.contentEl.createEl('p', { text: t('orbis_data_view.could_not_load_reading_data'), cls: 'orbis-data-error' });
      return;
    }

    const bookFile = this.findBookFile(file);
    this.log(`bookFile: ${bookFile?.path ?? 'NOT FOUND'}`);
    const container = this.contentEl.createDiv({ cls: 'orbis-data-view' });

    await this.renderHeader(container, data, file, bookFile);

    // If TOC not yet cached, try the open reader first, then parse the book directly.
    this.log(`data.toc: ${data.toc ? `array[${data.toc.length}]` : 'undefined'}`);
    if ((!data.toc || data.toc.length === 0) && bookFile) {
      this.log('TOC not cached — trying open reader…');
      const fromReader = this.extractTocFromReader(bookFile);
      this.log(`extractTocFromReader: ${fromReader ? `${fromReader.length} items` : 'null (reader not open)'}`);
      if (fromReader) {
        data.toc = fromReader;
      } else {
        this.log('Falling back to extractTocFromBook…');
        data.toc = await this.extractTocFromBook(bookFile);
        this.log(`extractTocFromBook: ${data.toc.length} items`);
      }
    }
    this.renderToc(container, data.toc ?? [], bookFile);
    this.renderSection(container, t('annotations_tab.bookmarks'), data.bookmarks ?? [], 'bookmark', bookFile);
    this.renderSection(
      container,
      t('annotations_tab.passage_selections'),
      data.highlights ?? [],
      'highlight',
      bookFile
    );
    this.renderSection(container, t('annotations_tab.notes'), data.notes ?? [], 'note', bookFile);
    await this.renderBacklinks(container, bookFile);
  }

  private async renderHeader(
    container: HTMLElement,
    data: OrbisData,
    file: TFile,
    bookFile: TFile | null
  ): Promise<void> {
    const header = container.createDiv({ cls: 'orbis-data-header' });

    // Top row: cover image (if available) + title/author block
    const top = header.createDiv({ cls: 'orbis-data-header-top' });
    if (data.coverImage) {
      const img = top.createEl('img', { cls: 'orbis-data-cover' });
      img.src = data.coverImage;
      img.alt = data.title ?? file.basename;
    } else {
      // The same generated cover the Library's tiles and the full-screen player draw — one recipe, so a book with
      // no artwork looks like the same book wherever you meet it. See `renderGeneratedCover`.
      const ph = top.createDiv({ cls: 'orbis-data-cover' });
      renderGeneratedCover(ph, data.title || file.basename, data.author ? String(data.author) : undefined);
    }
    const meta = top.createDiv({ cls: 'orbis-data-meta' });
    meta.createEl('h2', { text: data.title || file.basename, cls: 'orbis-data-book-title' });
    if (data.author) meta.createDiv({ text: String(data.author), cls: 'orbis-data-author' });

    // Annotation summary
    const bCount = data.bookmarks?.length ?? 0;
    const hCount = data.highlights?.length ?? 0;
    const nCount = data.notes?.length ?? 0;
    // One form per count, from `t` — see the `orbis_data_view.count_*` keys.
    const count = (n: number, one: TranslationKey, many: TranslationKey): string =>
      t(n === 1 ? one : many, { count: n });
    const parts: string[] = [];
    if (bCount > 0) parts.push(count(bCount, 'orbis_data_view.count_bookmarks_one', 'orbis_data_view.count_bookmarks'));
    if (hCount > 0)
      parts.push(count(hCount, 'orbis_data_view.count_selections_one', 'orbis_data_view.count_selections'));
    if (nCount > 0) parts.push(count(nCount, 'orbis_data_view.count_notes_one', 'orbis_data_view.count_notes'));
    if (parts.length > 0) meta.createDiv({ text: parts.join(' · '), cls: 'orbis-data-summary-line' });

    /**
     * Reading stats — **the same figure the Stats tab reports, by the same rule.**
     *
     * The pace behind every time estimate is a 10% trimmed mean over at least `WPM_MIN_SAMPLES`, and this reports the
     * same one, so two screens never describe one book's speed with two numbers. Below the threshold there is no
     * established pace, so nothing is claimed here either — the Stats tab says *Gathering data…* in the same state.
     *
     * `lastUpdated` is stamped by the pace sampler as pages turn (`ReadingStats`, the only caller of
     * `saveReadingStats`) and by nothing else, so it is when the book was last READ — not the last annotation, which is
     * a different event and one this field does not track.
     */
    const stats = data.readingStats;
    const wpm = stats?.wpmSamples ? Math.round(trimmedMeanWpm(stats.wpmSamples, WPM_MIN_SAMPLES)) : 0;
    const statParts: string[] = [];
    if (wpm > 0) statParts.push(t('orbis_data_view.average_reading_speed_n_wpm', { n: wpm }));
    if (stats?.lastUpdated) {
      statParts.push(t('orbis_data_view.last_read_date', { date: new Date(stats.lastUpdated).toLocaleDateString() }));
    }
    if (statParts.length > 0) {
      header.createDiv({ text: statParts.join(' · '), cls: 'orbis-data-summary-line' });
    }

    // Device activity table
    if (bookFile) {
      const [locations, locsCache] = await Promise.all([
        readAllDeviceLocations(this.app, bookFile),
        readLocsCache(this.app, bookFile),
      ]);
      if (locations.length > 0) {
        const section = header.createDiv({ cls: 'orbis-data-devices' });
        section.createEl('h3', { text: t('orbis_data_view.reading_activity'), cls: 'orbis-data-section-hdr' });
        // Wrapped rather than boxed directly: `border-collapse: collapse` on the table swallows a border set on
        // the table itself, so the ground goes around it. See `.orbis-list-box`.
        const table = section.createDiv({ cls: 'orbis-list-box' }).createEl('table', { cls: 'orbis-data-table' });
        const head = table.createEl('thead').createEl('tr');
        head.createEl('th', { text: t('orbis_data_view.device') });
        head.createEl('th', { text: t('orbis_data_view.last_opened') });
        head.createEl('th', { text: t('orbis_data_view.last_location') });
        const body = table.createEl('tbody');
        for (const locItem of locations) {
          const row = body.createEl('tr');
          row.createEl('td', { text: locItem.deviceName || locItem.deviceId });
          row.createEl('td', { text: formatDate(locItem.lastOpened) });
          const loc = locFromCfi(locItem.location, locsCache);
          const pageTd = row.createEl('td');
          if (locItem.location) {
            const pageLink = pageTd.createEl('a', {
              // `annotations_tab.loc_n` — the same words the Annotations tab's rows use, rather than a second copy built here.
              text: loc != null ? t('annotations_tab.loc_n', { n: loc }) : t('orbis_data_view.unknown'),
              cls: 'orbis-data-page-link',
            });
            // An anchor with no href is a div wearing a hat: focusable and Enter-operable only once we say so.
            onActivate(pageLink, () => void this.doJumpTo(locItem.location, bookFile));
            // Keyed by the device, which is what identifies this row across a rebuild — see `lastFocusKey`.
            pageLink.dataset.orbisFocus = `device:${locItem.deviceId}`;
          } else {
            pageTd.textContent = '—';
          }
        }
      }
    }

    header.createEl('hr', { cls: 'orbis-data-divider' });
  }

  private findBookFile(orbisFile: TFile): TFile | null {
    const path = bookPathForOrbisFile(orbisFile.path);
    const book = path ? this.app.vault.getAbstractFileByPath(path) : null;
    return book instanceof TFile && isBookExtension(book.extension) ? book : null;
  }

  private renderSection(
    container: HTMLElement,
    title: string,
    items: (Bookmark | Highlight | Note)[],
    type: 'bookmark' | 'highlight' | 'note',
    bookFile: TFile | null
  ): void {
    const details = container.createEl('details', { cls: 'orbis-data-details' });

    const summary = details.createEl('summary', { cls: 'orbis-data-summary' });
    summary.createSpan({ text: title });
    if (items.length > 0) summary.createSpan({ text: String(items.length), cls: 'orbis-saved-badge' });

    if (items.length === 0) {
      details.createEl('p', { text: t('orbis_data_view.none_yet'), cls: 'orbis-saved-empty' });
      return;
    }

    // Bounded and scrolling, like every other section here — see `.orbis-data-scroll`. A book with two hundred
    // highlights would otherwise push Notes and Linked notes so far down that expanding one section is the same as
    // hiding the rest.
    const scrollable = details.createDiv({ cls: 'orbis-data-scroll orbis-list-box' });
    // In the order they appear in the book, as the reader's Saved pane lists them; the file keeps them in the order
    // they were made.
    for (const item of inReadingOrder(items, markCfi)) {
      const cfi = markCfi(item);

      const row = scrollable.createDiv({ cls: 'orbis-saved-item orbis-data-item' });
      if (cfi && bookFile) {
        row.addClass('is-clickable');
        // See the Contents rows: reachable by keyboard, not only by pointer.
        onActivate(row, () => void this.doJumpTo(cfi, bookFile));
        // The CFI identifies the passage, so it identifies the row through a rebuild — see `lastFocusKey`.
        row.dataset.orbisFocus = `${type}:${cfi}`;
      }

      if (type === 'bookmark') {
        const bm = item as Bookmark;
        const main = row.createDiv({ cls: 'orbis-saved-item-main' });
        if (bm.chapter) main.createDiv({ cls: 'orbis-saved-chapter-hdr', text: bm.chapter });
        const locText = bm.loc != null ? `loc. ${bm.loc}` : '';
        main.createDiv({ cls: 'orbis-saved-item-label', text: locText || bm.label });
      } else if (type === 'highlight') {
        const hl = item as Highlight;
        const swatch = row.createDiv({ cls: 'orbis-saved-swatch' });
        swatch.setCssProps({ '--orbis-swatch-color': hl.color });
        swatch.addClass('orbis-swatch');
        const main = row.createDiv({ cls: 'orbis-saved-item-main' });
        if (hl.chapter) main.createDiv({ cls: 'orbis-saved-chapter-hdr', text: hl.chapter });
        if (hl.loc != null)
          main.createDiv({ cls: 'orbis-saved-item-page', text: t('annotations_tab.loc_n', { n: hl.loc }) });
        main.createDiv({
          cls: 'orbis-saved-item-excerpt',
          text: hl.text.length > 100 ? hl.text.slice(0, 100) + '…' : hl.text,
        });
      } else {
        const note = item as Note;
        const swatch = row.createDiv({ cls: 'orbis-saved-swatch' });
        swatch.setCssProps({ '--orbis-note-swatch-color': note.color ?? 'transparent' });
        swatch.addClass('orbis-note-swatch');
        swatch.toggleClass('has-no-color', !note.color);
        const main = row.createDiv({ cls: 'orbis-saved-item-main' });
        if (note.chapter) main.createDiv({ cls: 'orbis-saved-chapter-hdr', text: note.chapter });
        if (note.loc != null)
          main.createDiv({ cls: 'orbis-saved-item-page', text: t('annotations_tab.loc_n', { n: note.loc }) });
        main.createDiv({
          cls: 'orbis-saved-item-label',
          text: note.text.length > 80 ? note.text.slice(0, 80) + '…' : note.text,
        });
        if (note.selectedText) {
          main.createDiv({
            cls: 'orbis-saved-item-excerpt',
            text: note.selectedText.length > 80 ? note.selectedText.slice(0, 80) + '…' : note.selectedText,
          });
        }
      }
    }
  }

  // Gets TOC from the reader view if it is currently open for this book.
  // Returns null when the reader isn't open so the caller can try other paths.
  private extractTocFromReader(bookFile: TFile): TocEntry[] | null {
    const allReaderLeaves = this.app.workspace.getLeavesOfType('orbis-reader');
    this.log(`extractTocFromReader: ${allReaderLeaves.length} reader leaf(s) open`);
    const leaf = allReaderLeaves.find((l) => (l.view as { file?: TFile }).file?.path === bookFile.path);
    if (!leaf) {
      this.log('extractTocFromReader: no reader leaf for this book');
      return null;
    }

    type ReaderView = {
      bookToc?: Array<{ label?: string; href?: string | number | null; subitems?: Array<unknown> | null }>;
      bookSectionsPublic?: Array<{ id?: string }>;
    };
    const rv = leaf.view as unknown as ReaderView;
    const rawToc = rv.bookToc ?? [];
    const sections = rv.bookSectionsPublic ?? [];
    this.log(`extractTocFromReader: bookToc.length=${rawToc.length}, bookSectionsPublic.length=${sections.length}`);
    this.log(
      `extractTocFromReader: bookToc keys on view: ${Object.keys(rv)
        .filter((k) => k.startsWith('book'))
        .join(', ')}`
    );
    if (rawToc.length === 0) {
      this.log('extractTocFromReader: rawToc empty — returning null');
      return null;
    }

    const isMobi = sections.length > 0 && typeof (sections[0] as { id?: unknown }).id === 'number';
    this.log(`extractTocFromReader: isMobi=${isMobi}`);

    const strBaseName = (h: string) => h.split('#')[0].split('/').pop() ?? h;
    const idxForHref = (href: string | number | null | undefined): number => {
      if (typeof href === 'number') return href;
      if (typeof href !== 'string' || !href) return -1;
      const bn = strBaseName(href);
      const clean = href.split('#')[0];
      return sections.findIndex((s) => {
        const sId = String(s.id ?? '');
        return strBaseName(sId) === bn || sId === clean;
      });
    };
    type RawItem = { label?: string; href?: string | number | null; subitems?: Array<unknown> | null };
    const mapItem = (item: RawItem): TocEntry => {
      let cfi: string;
      if (isMobi) {
        cfi = typeof item.href === 'string' ? item.href : '';
      } else {
        const idx = idxForHref(item.href);
        cfi = idx >= 0 ? `epubcfi(/6/${(idx + 1) * 2}!/4)` : '';
      }
      return {
        label: item.label ?? '',
        cfi,
        subitems: (item.subitems as RawItem[])?.filter(Boolean).map(mapItem),
      };
    };
    const entries = rawToc.map(mapItem);
    this.log(`extractTocFromReader: mapped ${entries.length} entries; first="${entries[0]?.label ?? ''}"`);
    void saveBookInfo(this.app, bookFile, { toc: entries });
    return entries;
  }

  private async extractTocFromBook(bookFile: TFile): Promise<TocEntry[]> {
    try {
      this.log(`extractTocFromBook: reading ${bookFile.path}`);
      const bytes = await this.app.vault.adapter.readBinary(bookFile.path);
      this.log(`extractTocFromBook: read ${bytes.byteLength} bytes — calling makeBook`);
      const blob = new File([bytes], bookFile.name);
      const foliateModule = FoliateViewMod as unknown as { makeBook(f: File): Promise<unknown> };
      const book = await foliateModule.makeBook(blob);
      this.log(`extractTocFromBook: makeBook returned — type=${typeof book}`);
      const bookObj = book as { toc?: RawTocItem[]; sections?: Array<{ id?: string }> };
      const toc = bookObj.toc ?? [];
      const sections = bookObj.sections ?? [];
      this.log(`extractTocFromBook: toc.length=${toc.length}, sections.length=${sections.length}`);
      if (toc.length === 0) {
        this.log('extractTocFromBook: toc empty — returning []');
        return [];
      }

      // MOBI sections have numeric IDs; EPUB sections have string IDs.
      // For MOBI, the TOC href is a kindle:pos:... URL — pass it through directly
      // to foliateView.goTo() rather than trying to convert to an epubcfi.
      const isMobi = sections.length > 0 && typeof (sections[0] as unknown as { id: unknown }).id === 'number';
      this.log(`extractTocFromBook: isMobi=${isMobi}`);

      const strBaseName = (h: string) => h.split('#')[0].split('/').pop() ?? h;
      const sectionIdxForHref = (href: string | number | undefined): number => {
        if (typeof href === 'number') return href;
        if (typeof href !== 'string' || !href) return -1;
        const bn = strBaseName(href);
        const clean = href.split('#')[0];
        return sections.findIndex((s) => {
          const sId = String(s.id ?? '');
          return strBaseName(sId) === bn || sId === clean;
        });
      };
      const mapItem = (item: RawTocItem): TocEntry => {
        let cfi: string;
        if (isMobi) {
          cfi = typeof item.href === 'string' ? item.href : '';
        } else {
          const idx = sectionIdxForHref(item.href);
          cfi = idx >= 0 ? `epubcfi(/6/${(idx + 1) * 2}!/4)` : '';
        }
        return {
          label: item.label,
          cfi,
          subitems: item.subitems?.filter((s): s is RawTocItem => Boolean(s)).map(mapItem),
        };
      };
      const entries = toc.map(mapItem);
      this.log(`extractTocFromBook: mapped ${entries.length} entries; first="${entries[0]?.label ?? ''}"`);
      // Cache for future opens (non-blocking).
      void saveBookInfo(this.app, bookFile, { toc: entries });
      return entries;
    } catch (err) {
      this.log(`extractTocFromBook: ERROR — ${String(err)}`);
      return [];
    }
  }

  private renderToc(container: HTMLElement, toc: TocEntry[], bookFile: TFile | null): void {
    const details = container.createEl('details', { cls: 'orbis-data-details' });
    const summary = details.createEl('summary', { cls: 'orbis-data-summary' });
    // **No count, unlike the sections below it.** Theirs says whether there is anything to open; nearly every book has
    // contents, and the number of top-level entries — 2 for a title page and a part holding every chapter — reads
    // as a count of something nobody is looking for.
    summary.createSpan({ text: t('orbis_data_view.contents') });

    if (toc.length === 0) {
      details.createEl('p', { text: t('orbis_data_view.none_yet'), cls: 'orbis-saved-empty' });
      return;
    }

    let clickableCount = 0;
    const scrollable = details.createDiv({ cls: 'orbis-data-scroll orbis-list-box' });
    const renderItems = (items: TocEntry[], depth: number) => {
      for (const item of items) {
        const row = scrollable.createDiv({ cls: 'orbis-saved-item orbis-data-item orbis-data-toc-row' });
        if (depth > 0) {
          row.setCssProps({ '--orbis-toc-indent': `${depth * 16 + 8}px` });
          row.addClass('orbis-toc-row');
        }
        row.createSpan({ text: item.label, cls: 'orbis-data-toc-label' });
        const navTarget = item.href || item.cfi;
        if (navTarget) {
          // href includes anchor fragments (chapter.xhtml#id); cfi is section-start fallback.
          row.addClass('is-clickable');
          // `onActivate`, not a click listener: a chapter you can only reach with a pointer is a chapter a
          // keyboard cannot open. It sets `role="button"` and a tab stop, which is also what the focus ring in
          // `.orbis-data-view [role="button"]:focus-visible` is waiting for.
          onActivate(row, () => void this.doJumpTo(navTarget, bookFile));
          row.dataset.orbisFocus = `toc:${navTarget}`;
          clickableCount++;
        }
        if (item.subitems?.length) renderItems(item.subitems, depth + 1);
      }
    };
    renderItems(toc, 0);
    this.log(`renderToc: rendered ${toc.length} top-level items, ${clickableCount} with click handlers`);
  }

  private async renderBacklinks(container: HTMLElement, bookFile: TFile | null): Promise<void> {
    const details = container.createEl('details', { cls: 'orbis-data-details' });
    const summary = details.createEl('summary', { cls: 'orbis-data-summary' });
    summary.createSpan({ text: t('orbis_data_view.linked_notes') });

    if (!bookFile) {
      details.createEl('p', { text: t('orbis_data_view.none_yet'), cls: 'orbis-saved-empty' });
      return;
    }

    const loading = details.createEl('p', { text: t('orbis_data_view.scanning'), cls: 'orbis-saved-empty' });
    const started = performance.now();
    const backlinks = await scanBacklinks(bookFile.path, this.app);
    // To the shared log, beside the reader's own linked-notes timing — not this page's private one.
    logToLibrary(
      this,
      `reading data: linked notes — ${backlinks.length} found, in ${Math.round(performance.now() - started)} ms`,
      'backlinks'
    );
    loading.remove();

    if (backlinks.length > 0) summary.createSpan({ text: String(backlinks.length), cls: 'orbis-saved-badge' });

    if (backlinks.length === 0) {
      details.createEl('p', { text: t('orbis_data_view.none_yet'), cls: 'orbis-saved-empty' });
      return;
    }

    // After the empty and loading states, which belong to the section rather than to the list inside it.
    const scrollable = details.createDiv({ cls: 'orbis-data-scroll orbis-list-box' });
    for (const { noteTitle, notePath } of backlinks) {
      const row = scrollable.createDiv({ cls: 'orbis-saved-item orbis-data-item orbis-data-backlink-row' });
      const folderPath = notePath.includes('/') ? notePath.slice(0, notePath.lastIndexOf('/')) : '';
      const textCol = row.createDiv({ cls: 'orbis-data-backlink-text' });
      const link = textCol.createEl('a', { cls: 'internal-link', text: noteTitle });
      link.setAttribute('data-href', notePath);
      if (folderPath) textCol.createDiv({ cls: 'orbis-data-backlink-folder', text: folderPath });
      onActivate(link, (e) => {
        e.preventDefault();
        const f = this.app.vault.getAbstractFileByPath(normalizePath(notePath));
        if (f instanceof TFile) void this.app.workspace.getLeaf('tab').openFile(f);
      });
    }
  }

  /**
   * Open the book and go to the passage this row describes.
   *
   * **The wait belongs to `navigateWhenReady`, not here.** A retry of its own here would skip the landing flash the
   * shared one adds, making a highlight opened from this view the one route that arrives unmarked. The notice on giving
   * up is kept, since a book that will not come up is worth saying out loud.
   */
  private async doJumpTo(cfi: string, bookFile: TFile | null): Promise<void> {
    this.log(`doJumpTo: cfi=${cfi} bookFile=${bookFile?.path ?? 'null'}`);
    if (!bookFile) {
      new Notice(t('orbis_data_view.book_file_not_found'));
      return;
    }
    try {
      const existingLeaves = this.app.workspace
        .getLeavesOfType('orbis-reader')
        .filter((l) => (l.view as { file?: TFile }).file?.path === bookFile.path);
      this.log(`doJumpTo: ${existingLeaves.length} existing reader leaf(s)`);
      const leaf = existingLeaves[0] ?? this.app.workspace.getLeaf('tab');
      this.log(`doJumpTo: opening file in leaf`);
      await leaf.openFile(bookFile);
      this.log(`doJumpTo: openFile done — view type: ${leaf.view?.getViewType?.()}`);
      this.app.workspace.setActiveLeaf(leaf, { focus: true });
      navigateWhenReady(
        this.app,
        bookFile.path,
        { cfi },
        {
          onGiveUp: () => {
            this.log('doJumpTo: gave up waiting for reader to be ready');
            new Notice(t('orbis_data_view.no_book_open'));
          },
        }
      );
    } catch (err) {
      this.log(`doJumpTo: ERROR — ${String(err)}`);
      new Notice(t('orbis_data_view.could_not_open_book_msg', { msg: String(err) }));
    }
  }
}
