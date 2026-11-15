import { t } from '../i18n';
import { type Bookmark, readBookmarks, saveBookmarks } from '../progress';
import { setSvgIcon } from '../ui-utils';
import type { AnnotationHost } from './AnnotationHost';
import { bookmarkLabel, findCurrentBookmark } from './bookmark-utils';
import type { ReaderContext } from './ReaderContext';

/**
 * Bookmarks: position markers (not overlay-drawn like highlights/notes). Owns the
 * bookmark list, the toolbar toggle button, and the pending-nav id used to calibrate
 * a bookmark after the saved panel navigates to it. See docs/design/reader-architecture.md.
 */
export class BookmarkController {
  private bookmarks: Bookmark[] = [];
  private btn: HTMLButtonElement | null = null;
  private pendingNav: string | null = null;

  constructor(
    private readonly ctx: ReaderContext,
    private readonly host: AnnotationHost
  ) {}

  /** The toolbar toggle button, for visibility toggling by the toolbar. */
  get button(): HTMLButtonElement | null {
    return this.btn;
  }

  /** The current bookmarks (read by notesData, the saved panel, and recalc). */
  get all(): Bookmark[] {
    return this.bookmarks;
  }

  async load(): Promise<void> {
    const f = this.ctx.currentFile;
    this.bookmarks = f ? await readBookmarks(this.ctx.app, f) : [];
    this.ctx.debug(`bookmarks load — count:${this.bookmarks.length}`, 'annot');
  }

  /** Take the bookmarks afresh from the book's file, replacing the list only if they differ. Returns whether they did. */
  async reload(): Promise<boolean> {
    const f = this.ctx.currentFile;
    if (!f) return false;
    const read = await readBookmarks(this.ctx.app, f);
    const byId = (list: Bookmark[]) => JSON.stringify([...list].sort((a, b) => (a.id < b.id ? -1 : 1)));
    if (byId(read) === byId(this.bookmarks)) return false;
    this.bookmarks = read;
    this.updateBtn();
    return true;
  }

  /** Build the toolbar toggle button into `container`. */
  buildButton(container: HTMLElement): void {
    this.btn = container.createEl('button', { cls: 'orbis-ctrl-btn' });
    this.btn.addEventListener('click', () => this.toggle());
    this.updateBtn(); // sets innerHTML, title, active class
  }

  private current(): Bookmark | null {
    return findCurrentBookmark(this.bookmarks, this.ctx.lastCfi, this.ctx.lastLocation);
  }

  updateBtn(): void {
    if (!this.btn) return;
    const active = this.current() !== null;
    this.btn.classList.toggle('is-active', active);
    this.btn.setAttribute('aria-label', active ? t('toolbar.remove_bookmark') : t('toolbar.bookmark_this_location'));
    setSvgIcon(
      this.btn,
      active
        ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M5 3h14a1 1 0 0 1 1 1v17l-8-3.5L4 21V4a1 1 0 0 1 1-1z"/></svg>'
        : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-3.5L5 21V4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1z"/></svg>'
    );
  }

  toggle(): void {
    // While audio is playing or paused, the toolbar bookmark marks the sentence being read (an
    // audio bookmark, toggling on a second tap of the same sentence) — matching the player button.
    const audio = this.ctx.audioBookmarkTarget();
    if (audio) {
      this.toggleAudioBookmark(audio.anchorCfi, audio.chapter, audio.chapterHref, audio.loc, audio.text);
      return;
    }
    const existing = this.current();
    if (existing) this.remove(existing.id);
    else this.add();
  }

  private add(): void {
    if (!this.ctx.lastCfi || !this.ctx.currentFile) return;
    if (this.current()) return;
    const anchor = this.ctx.topOfPageAnchor();
    // Where the lines at the top of the page begin, by the index (`bookmarkLocCfi`).
    // Before the index is up, the indicator's own number, but only if lastLocation was set by the same relocate event
    // as the current CFI: if lastLocationCfi !== lastCfi, foliate fired a relocate with a new CFI but no location
    // data, making lastLocation stale for this position. Opening the book with the index up corrects it.
    const locationIsFresh = this.ctx.lastLocationCfi === this.ctx.lastCfi;
    const loc =
      this.ctx.getLocForCfi(anchor?.cfi ?? this.ctx.lastCfi) ??
      (locationIsFresh ? (this.ctx.lastLocation?.current ?? undefined) : undefined);
    const cfi = this.ctx.lastCfi;
    // The heading the bookmark's sentence is under — the top of the page — not the last heading on the page.
    const entry = this.ctx.tocEntryAt(anchor?.cfi ?? this.ctx.lastCfi);
    const chapter = entry?.label || undefined;
    const chapterHref = entry?.href || undefined;
    const label = bookmarkLabel(chapter, loc);
    const b: Bookmark = {
      id: crypto.randomUUID(),
      cfi,
      exactCfi: this.ctx.lastCfi || undefined,
      label,
      createdAt: Date.now(),
      loc,
      chapter,
      chapterHref,
      kind: 'reading',
      anchorCfi: anchor?.cfi,
      ...(anchor?.text.trim() ? { text: anchor.text } : {}),
    };
    this.bookmarks = [...this.bookmarks, b];
    this.persist();
    this.ctx.debug(`addBookmark label:"${label}" locFresh:${locationIsFresh}`, 'annot');
  }

  /** Save the current bookmark list and refresh the toolbar button + saved panel. */
  private persist(deleted?: readonly string[]): void {
    saveBookmarks(this.ctx.app, this.ctx.currentFile!, this.bookmarks).catch((e) =>
      this.ctx.debug(`saveBookmarks error: ${e}`, 'annot')
    );
    this.updateBtn();
    this.host.refreshSavedPanelIfOpen();
    this.ctx.recordsChanged(deleted, 'bookmarks');
  }

  /** Add an audio bookmark for the sentence being read (from the full-screen player), or
   *  remove it if that exact sentence is already bookmarked (toggle). The anchor is the
   *  sentence's range CFI — detection/flash/nav all key off it, so no page CFI is needed
   *  (the player parks the view at the section start, where a page CFI would be wrong).
   *  Returns true if a bookmark was added, false if one was removed. */
  toggleAudioBookmark(
    anchorCfi: string,
    chapter: string,
    chapterHref: string | undefined,
    loc?: number,
    text?: string
  ): boolean {
    if (!this.ctx.currentFile) return false;
    const existing = this.bookmarks.find((b) => b.anchorCfi === anchorCfi);
    if (existing) {
      this.remove(existing.id);
      return false;
    }
    const label = bookmarkLabel(chapter, loc);
    const b: Bookmark = {
      id: crypto.randomUUID(),
      cfi: anchorCfi,
      label,
      createdAt: Date.now(),
      loc,
      chapter: chapter || undefined,
      chapterHref,
      kind: 'audio',
      anchorCfi,
      ...(text?.trim() ? { text } : {}),
    };
    this.bookmarks = [...this.bookmarks, b];
    this.persist();
    this.ctx.debug(`addAudioBookmark label:"${label}" loc:${loc ?? '—'}`, 'annot');
    return true;
  }

  remove(id: string): void {
    this.bookmarks = this.bookmarks.filter((b) => b.id !== id);
    this.persist([id]);
    this.ctx.debug(`removeBookmark id:${id.slice(0, 8)}`, 'annot');
  }

  /** Navigate to a bookmark (from the saved panel); the flash fires later, once the
   *  target section has laid out (see `calibrateOnRelocate`). Targets `anchorCfi` when
   *  present — the precise lines, and the only reliable target for audio bookmarks whose
   *  `exactCfi` is the player's parked section-start page. */
  navigateTo(bm: Bookmark): void {
    const navCfi = bm.anchorCfi ?? bm.exactCfi ?? bm.cfi;
    this.ctx.debug(
      `savedPanel goTo bookmark page:${bm.loc ?? '?'} kind:${bm.kind ?? 'reading'} via:${bm.anchorCfi ? 'anchor' : bm.exactCfi ? 'exactCfi' : 'cfi'}`,
      'nav'
    );
    this.setPendingNav(bm.id);
    // Pass the anchor so the audio player seeks to the bookmarked sentence, not the page top.
    this.ctx.markUserNavigation(bm.anchorCfi ?? navCfi);
    void this.ctx.foliateView?.goTo(navCfi);
  }

  /** Record the bookmark the saved panel is navigating to, so the next relocate calibrates it. */
  setPendingNav(id: string): void {
    this.pendingNav = id;
  }

  /** Called from the relocate handler: calibrate the just-navigated bookmark, if any, and
   *  flash its anchor now that the target section has laid out (flashing right after
   *  `goTo` is too early — the overlay isn't rebuilt yet). */
  calibrateOnRelocate(): void {
    if (this.pendingNav) {
      const bm = this.bookmarks.find((b) => b.id === this.pendingNav);
      this.calibrate(this.pendingNav);
      this.pendingNav = null;
      if (bm?.anchorCfi) this.ctx.flashAnchor(bm.anchorCfi);
    }
  }

  // Called from the relocate handler after navigating to a bookmark via the saved panel.
  // Reconciles bm.exactCfi with what foliate actually reports after landing. It is ALWAYS
  // updated: navigation uses exactCfi to reach the correct page, so the post-navigation
  // lastCfi is the ground-truth range CFI at the current font size. This means detection
  // keeps working even after the user changes font size. The location is not touched: it is
  // where the bookmark's anchor begins, which no page layout moves (`bookmarkLocCfi`).
  private calibrate(id: string): void {
    if (!this.ctx.currentFile) return;
    const bm = this.bookmarks.find((b) => b.id === id);
    if (!bm) return;
    if (this.ctx.lastCfi && bm.exactCfi !== this.ctx.lastCfi) {
      bm.exactCfi = this.ctx.lastCfi;
      this.ctx.debug('calibrateBookmark exactCfi:set', 'annot');
      saveBookmarks(this.ctx.app, this.ctx.currentFile, this.bookmarks).catch((e) =>
        this.ctx.debug(`saveBookmarks error: ${e}`, 'annot')
      );
    }
  }

  /** Replace all bookmarks (e.g. recalculateLocations) and persist. */
  replaceAll(bookmarks: Bookmark[]): void {
    this.bookmarks = bookmarks;
    const f = this.ctx.currentFile;
    if (f) void saveBookmarks(this.ctx.app, f, this.bookmarks);
  }

  dispose(): void {
    this.bookmarks = [];
    this.btn = null;
    this.pendingNav = null;
  }
}
