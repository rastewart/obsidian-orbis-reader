import { t } from '../i18n';
import { saveReadingStats } from '../progress';
import { PROGRESS_MODE_DISPLAY_ORDER, type ProgressMode } from '../settings';
import { onActivate } from '../ui-utils';
import type { ReaderContext } from './ReaderContext';
import type { StatsHost } from './StatsHost';
import {
  chapterBoundaries,
  chapterLocs,
  chapterProgressFromBoundaries,
  formatLocLabel as computeLocLabel,
  wordsInFractionRange as computeWordsInRange,
  computeWpmSample,
  currentChapterIndex,
  cycleLocMode,
  formatReadingTime,
  formatWordCount,
  LOC_MODE_MAP,
  type Progress,
  pushWpmSample,
  resolveLocMode,
  sectionProgress,
  trimmedMeanWpm,
  WPM_MIN_SAMPLES,
} from './stats-math';

/**
 * Reading pace + progress display: the toolbar progress chip, the six progress
 * modes (%/page/time, book/chapter), WPM sampling, chapter-boundary math, and the
 * Stats panel. Owns the state (fraction, samples, boundary cache, chip); the pure
 * math lives in `stats-math.ts` (unit-tested). Reads position (`lastFraction` it
 * owns; `lastLocation`/section from ctx) and the view-owned location index (via
 * StatsHost) to compute everything.
 *
 * The relocate handler stays in the view (it orchestrates bookmarks/annotations/
 * nav/save too) and delegates its stats slice here: `setFraction`, `recordWpmSample`,
 * `invalidateChapterBoundaries`, `updateLocLabel`. See
 * docs/design/reader-architecture.md (Phase 6).
 */
export class ReadingStats {
  private locMode = 0;
  private lastFraction: number | null = null;
  private wpmSamples: number[] = []; // rolling buffer, max 15
  private paceTimerTs: number | null = null; // timestamp of last relocate
  private paceTimerLoc: number | null = null; // loc at last relocate
  // Cache for chapter page boundaries (derived from the TOC + tocStartFractions).
  private chapterBoundaryCacheKey = '';
  private chapterBoundaryCache: Array<{ startFraction: number; endFraction: number }> = [];
  // Flat list of TOC hrefs in reading order, parallel to chapterBoundaryCache.
  private chapterFlatHrefs: string[] = [];
  private locLabel: HTMLElement | null = null;

  constructor(
    private readonly ctx: ReaderContext,
    private readonly host: StatsHost
  ) {}

  // ── Chip construction / text ────────────────────────────────────────────────

  /** Build the centered progress chip into the toolbar. */
  buildChip(toolbar: HTMLElement): void {
    this.locLabel = toolbar.createSpan({ cls: 'orbis-location orbis-loc-label', text: t('toolbar.loading') });
    this.locLabel.title = t('toolbar.select_to_cycle_progress_mode');
    this.locLabel.setAttribute('aria-live', 'polite');
    // Tapping it cycles between pages, locations and percentage, which makes it a control rather than a readout.
    onActivate(this.locLabel, () => this.cycleProgressMode());
  }

  /** Overwrite the chip text (loading states). */
  setChipText(text: string): void {
    if (this.locLabel) this.locLabel.textContent = text;
  }

  /** Toggle the chip's hidden (visibility:hidden) state without losing its grid column. */
  setChipHidden(hidden: boolean): void {
    this.locLabel?.classList.toggle('orbis-location-hidden', hidden);
  }

  // ── Progress mode ─────────────────────────────────────────────────────────

  private minSamples(): number {
    return this.ctx.app.loadLocalStorage('orbis-dbg-pace') === '1' ? 2 : WPM_MIN_SAMPLES;
  }

  private enabledRealIds(): ProgressMode[] {
    return (this.host.progressModesConfig() ?? PROGRESS_MODE_DISPLAY_ORDER.map((id) => ({ id, visible: true })))
      .filter((m) => m.visible)
      .map((m) => m.id);
  }

  /** Initialize locMode from the persisted progressMode setting. */
  initModeFromSettings(): void {
    this.locMode = Math.max(0, LOC_MODE_MAP.indexOf(this.host.progressModeSetting));
  }

  /** Re-sync locMode when plugin settings change; jump off a just-disabled mode. */
  applyProgressModeFromSettings(): void {
    const { mode, persist } = resolveLocMode(this.locMode, this.host.progressModeSetting, this.enabledRealIds());
    this.locMode = mode;
    if (persist) this.host.persistProgressMode(persist);
    this.updateLocLabel();
  }

  cycleProgressMode(): void {
    this.locMode = cycleLocMode(this.locMode, this.enabledRealIds());
    this.host.persistProgressMode(LOC_MODE_MAP[this.locMode]);
    this.updateLocLabel();
  }

  // ── Relocate delegation ─────────────────────────────────────────────────────

  /** The book content fraction at the top of the page, from the latest relocate event (ORBIS patch 16). */
  setFraction(fraction: number): void {
    this.lastFraction = fraction;
  }

  /** Force the chapter-boundary cache to recompute (a fraction value changed). */
  invalidateChapterBoundaries(): void {
    this.chapterBoundaryCacheKey = '';
  }

  /** Seed WPM samples from persisted reading stats at book open. */
  loadReadingStats(samples: number[]): void {
    this.wpmSamples = samples;
    this.ctx.debug(`readingStats load — samples:${this.wpmSamples.length}`, 'pace');
  }

  recordWpmSample(currentLoc: number): void {
    const now = Date.now();
    if (this.paceTimerTs !== null && this.paceTimerLoc !== null) {
      const elapsed = (now - this.paceTimerTs) / 1000;
      const words = this.host.locWordCounts.get(this.paceTimerLoc) ?? 0;
      const wpm = computeWpmSample(words, elapsed);
      if (wpm !== null) {
        this.wpmSamples = pushWpmSample(this.wpmSamples, wpm);
        this.ctx.debug(
          `pace sample — page:${this.paceTimerLoc} words:${words.toFixed(1)} elapsed:${elapsed.toFixed(1)}s wpm:${wpm.toFixed(0)} buffer:${this.wpmSamples.length}`,
          'pace'
        );
        const eff = this.effectiveWpm();
        if (eff > 0)
          this.ctx.debug(`pace effectiveWpm — samples:${this.wpmSamples.length} trimmedMean:${eff.toFixed(0)}`, 'pace');
        else
          this.ctx.debug(
            `pace insufficient data — samples:${this.wpmSamples.length} need:${this.minSamples()}`,
            'pace'
          );
        if (this.ctx.currentFile) {
          void saveReadingStats(this.ctx.app, this.ctx.currentFile, {
            wpmSamples: [...this.wpmSamples],
            lastUpdated: new Date().toISOString(),
          });
          this.ctx.debug(`pace save — samples:${this.wpmSamples.length}`, 'pace');
        }
      }
    }
    this.paceTimerTs = now;
    this.paceTimerLoc = currentLoc;
  }

  // ── Progress computation (state → pure stats-math) ─────────────────────────

  private sectionSizes(): number[] {
    return this.ctx.bookSections.map((s) => (s as unknown as { size?: number }).size ?? 0);
  }

  private getSectionProgress(): Progress | null {
    const sIdx = this.ctx.currentSectionIndex;
    const byFraction = sectionProgress({
      fraction: this.lastFraction,
      totalBookSize: this.host.totalBookSize,
      sectionSizes: this.sectionSizes(),
      currentSection: sIdx,
      totalLocs: this.ctx.lastLocation?.total ?? null,
    });
    const last = sIdx + 1 >= this.host.sectionCharCounts.length;
    return this.inBookLocs(
      byFraction,
      this.host.sectionStartLoc(sIdx),
      last ? this.endLoc() : this.host.sectionStartLoc(sIdx + 1)
    );
  }

  /**
   * A chapter's location and total, in the book's own locations once the index is up (`chapterLocs`), so the chapter's
   * numbers and the book's count by the same rule. The percentage stays by position, as the book's does. By position
   * too while either end is unknown.
   */
  private inBookLocs(p: Progress | null, startLoc: number | null, nextStartLoc: number | null): Progress | null {
    const current = this.ctx.lastLocation?.current;
    if (!p || current == null || startLoc == null || nextStartLoc == null) return p;
    return { ...p, ...chapterLocs(current, startLoc, nextStartLoc) };
  }

  /**
   * The contents entry at the top of the page: the chapter the page's location is in, so the chapter's numbers and
   * the book's are read from the same place. Not foliate's page entry (`tocItemHref`), which is the last heading
   * starting at or before the page's END — on the page before a chapter break, already the next chapter, which read
   * that chapter's 1 where this one's last location belonged. See `toc-entry.ts`.
   */
  private chapterAtTop(): string {
    const cfi = this.ctx.lastCfi;
    return (cfi ? this.ctx.tocEntryAt(cfi)?.href : undefined) ?? this.ctx.tocItemHref;
  }

  /** Where a location after the last would start: what closes the book's last chapter. */
  private endLoc(): number {
    return (this.ctx.lastLocation?.total ?? 0) + 1;
  }

  private getChapterBoundaries(): Array<{ startFraction: number; endFraction: number }> {
    // Cache key includes tocStartFractions.size: fraction-only builds (AZW3) have
    // sectionLocInfo.length = 0, so this distinguishes pre-build from post-build.
    const key = `${this.host.sectionLocInfo.length}:${this.host.tocItems.length}:${this.host.tocStartFractions.size}`;
    if (key === this.chapterBoundaryCacheKey && this.chapterBoundaryCache.length > 0) {
      return this.chapterBoundaryCache;
    }
    this.chapterBoundaryCacheKey = key;
    const { boundaries, flatHrefs } = chapterBoundaries({
      tocItems: this.host.tocItems,
      sectionLocInfo: this.host.sectionLocInfo,
      tocStartFractions: this.host.tocStartFractions,
      totalLocs: this.ctx.lastLocation?.total ?? 0,
      sectionSizes: this.sectionSizes(),
      totalBookSize: this.host.totalBookSize,
      hrefToSectionIndex: (href) => this.host.hrefToSectionIndex(href),
    });
    this.chapterBoundaryCache = boundaries;
    this.chapterFlatHrefs = flatHrefs;
    return this.chapterBoundaryCache;
  }

  private getChapterProgress(): Progress | null {
    if (this.lastFraction == null) return this.getSectionProgress();
    const boundaries = this.getChapterBoundaries();
    if (!boundaries.length) return this.getSectionProgress();
    const input = {
      fraction: this.lastFraction,
      boundaries,
      flatHrefs: this.chapterFlatHrefs,
      tocItemHref: this.chapterAtTop(),
      totalLocs: this.ctx.lastLocation?.total ?? 0,
    };
    const idx = currentChapterIndex(input);
    const next = this.chapterFlatHrefs[idx + 1];
    return this.inBookLocs(
      chapterProgressFromBoundaries(input),
      this.host.chapterStartLoc(this.chapterFlatHrefs[idx] ?? ''),
      next === undefined ? this.endLoc() : this.host.chapterStartLoc(next)
    );
  }

  private effectiveWpm(): number {
    return trimmedMeanWpm(this.wpmSamples, this.minSamples());
  }

  private wordsInFractionRange(fromFraction: number, toFraction: number): number {
    return computeWordsInRange(fromFraction, toFraction, {
      sectionSizes: this.sectionSizes(),
      totalBookSize: this.host.totalBookSize,
      sectionWordCounts: this.host.sectionWordCounts,
      sectionCharCounts: this.host.sectionCharCounts,
      totalBookChars: this.host.totalBookChars,
    });
  }

  private wordsRemainingInBook(): number {
    if (this.lastFraction == null) return 0;
    return this.wordsInFractionRange(this.lastFraction, 1.0);
  }

  private wordsRemainingInChapter(): number {
    if (this.lastFraction == null) return 0;
    const boundaries = this.getChapterBoundaries();
    if (boundaries.length > 0) {
      let idx = 0;
      for (let i = 1; i < boundaries.length; i++) {
        if (boundaries[i].startFraction <= this.lastFraction) idx = i;
        else break;
      }
      return this.wordsInFractionRange(this.lastFraction, boundaries[idx].endFraction);
    }
    // Fallback: end of current section
    if (this.host.totalBookChars > 0 && this.host.sectionCharCounts.length > 0) {
      let cumChars = 0;
      for (let i = 0; i <= this.ctx.currentSectionIndex && i < this.host.sectionCharCounts.length; i++) {
        cumChars += this.host.sectionCharCounts[i];
      }
      return this.wordsInFractionRange(this.lastFraction, Math.min(1.0, cumChars / this.host.totalBookChars));
    }
    return 0;
  }

  formatLocLabel(): string {
    return computeLocLabel(this.locMode, {
      fraction: this.lastFraction,
      location: this.ctx.lastLocation,
      chapterProgress: this.getChapterProgress(),
      wpm: this.effectiveWpm(),
      wordsRemainingBook: this.wordsRemainingInBook(),
      wordsRemainingChapter: this.wordsRemainingInChapter(),
    });
  }

  updateLocLabel(): void {
    const text = this.formatLocLabel();
    if (this.locLabel) this.locLabel.textContent = text;
    this.host.setFocusProgressText(text);
    if (this.host.isStatsPaneOpen()) this.renderStatsPane();
  }

  // ── Stats panel ───────────────────────────────────────────────────────────

  renderStatsPane(): void {
    const pane = this.host.statsPaneEl;
    if (!pane) return;
    pane.empty();

    const wpm = this.effectiveWpm();
    const sampleCount = this.wpmSamples.length;
    const minSamples = this.minSamples();

    const addSection = (title: string) => {
      pane.createDiv({ cls: 'orbis-stats-section', text: title });
    };

    const addRow = (label: string, value: string, note?: string) => {
      const row = pane.createDiv({ cls: 'orbis-stats-row' });
      row.createSpan({ cls: 'orbis-stats-label', text: label });
      const val = row.createSpan({ cls: 'orbis-stats-value', text: value });
      if (note) val.createEl('small', { text: ` ${note}` });
    };

    // Reading pace
    addSection(t('stats_tab.reading_speed'));
    if (wpm) {
      addRow(
        t('stats_tab.estimated_reading_speed'),
        t('stats_tab.n_wpm', { n: String(Math.round(wpm)) }),
        t('stats_tab.n_samples', { n: String(sampleCount) })
      );
    } else {
      addRow(
        t('stats_tab.speed'),
        t('stats_tab.gathering_data'),
        t('stats_tab.n_n_samples', { current: String(sampleCount), total: String(minSamples) })
      );
    }

    // Time remaining
    addSection(t('stats_tab.time_remaining'));
    const bookMins = wpm ? this.wordsRemainingInBook() / wpm : 0;
    const chapMins = wpm ? this.wordsRemainingInChapter() / wpm : 0;
    addRow(t('stats_tab.this_book'), wpm ? `~${formatReadingTime(bookMins)}` : '—');
    addRow(t('stats_tab.this_chapter'), wpm ? `~${formatReadingTime(chapMins)}` : '—');

    // Progress
    addSection(t('stats_tab.progress'));
    if (this.lastFraction != null) addRow(t('stats_tab.book'), `${Math.round(this.lastFraction * 100)}%`);
    if (this.ctx.lastLocation?.total)
      addRow(
        t('stats_tab.location'),
        t('stats_tab.n_of_n', {
          current: String(this.ctx.lastLocation.current),
          total: String(this.ctx.lastLocation.total),
        })
      );
    // The chapter the indicator's chapter modes count, so both say the same thing.
    const sp = this.getChapterProgress();
    if (sp) {
      addRow(t('stats_tab.chapter'), `${sp.pct}%`);
      if (sp.total)
        addRow(
          t('stats_tab.chapter_location'),
          t('stats_tab.n_of_n', { current: String(sp.loc), total: String(sp.total) })
        );
    }

    // Word counts (only if we have the index built)
    if (this.host.totalBookWords > 0) {
      addSection(t('stats_tab.word_counts'));
      const remaining = this.wordsRemainingInBook();
      let chapterWords: number;
      const boundaries = this.getChapterBoundaries();
      if (boundaries.length > 0 && this.lastFraction != null) {
        let idx = 0;
        for (let i = 1; i < boundaries.length; i++) {
          if (boundaries[i].startFraction <= this.lastFraction) idx = i;
          else break;
        }
        chapterWords = Math.round(
          this.wordsInFractionRange(boundaries[idx].startFraction, boundaries[idx].endFraction)
        );
      } else {
        chapterWords = this.host.sectionWordCounts[this.ctx.currentSectionIndex] ?? 0;
      }
      addRow(t('stats_tab.book_total'), `~${formatWordCount(this.host.totalBookWords)}`);
      if (remaining > 0) addRow(t('stats_tab.book_remaining'), `~${formatWordCount(Math.round(remaining))}`);
      if (chapterWords > 0) addRow(t('stats_tab.this_chapter'), `~${formatWordCount(chapterWords)}`);
    }
  }

  /** Reset all per-book pace/progress state on book close. */
  reset(): void {
    this.chapterBoundaryCacheKey = '';
    this.chapterBoundaryCache = [];
    this.chapterFlatHrefs = [];
    this.locMode = 0;
    this.lastFraction = null;
    this.paceTimerTs = null;
    this.paceTimerLoc = null;
    this.wpmSamples = [];
    this.locLabel = null;
  }
}
