import type { ProgressMode } from '../settings';
import type { StatsTocItem } from './StatsHost';

/**
 * Pure reading-progress / pace math, extracted from `ReadingStats` so it can be unit
 * tested without DOM or ctx/host mocks. `ReadingStats` keeps the state (fraction,
 * samples, chapter-boundary cache, chip element) and forwards it into these functions.
 * All layout-independent: results depend only on content fractions + book structure,
 * never on font/screen. See docs/design/integration-test-strategy.md.
 */

export type Progress = { loc: number; total: number; pct: number };

// Maps locMode (0–6) to the ProgressMode string stored in plugin settings.
// 'blank' (index 6) is always the last cycle stop; it isn't a toggleable mode.
export const LOC_MODE_MAP: (ProgressMode | 'blank')[] = [
  'book-percent',
  'book-locs',
  'chapter-percent',
  'chapter-locs',
  'book-time',
  'chapter-time',
  'blank',
];

// ── Formatting ────────────────────────────────────────────────────────────────

export function formatWordCount(n: number): string {
  if (n < 1000) return String(Math.round(n));
  if (n < 10000) return `${(n / 1000).toFixed(1)}k`;
  return `${Math.round(n / 1000)}k`;
}

export function formatReadingTime(mins: number): string {
  if (mins < 1) return '<1m';
  if (mins < 60) return `${Math.round(mins)}m`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// ── WPM sampling ────────────────────────────────────────────────────────────

/**
 * How many samples a pace has to rest on before it is shown anywhere.
 *
 * **Exported because two surfaces report the same figure**: the Stats tab's *Estimated pace*, and the reading-data
 * page's *Average reading speed*. Both rest on this threshold, so a book cannot read one pace on one screen and another
 * on the other with nothing to explain the gap.
 */
export const WPM_MIN_SAMPLES = 8;

/** Trimmed mean of the WPM buffer; 0 until at least `minSamples` are collected. */
export function trimmedMeanWpm(samples: readonly number[], minSamples: number): number {
  if (samples.length < minSamples) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const trim = Math.floor(sorted.length * 0.1);
  const trimmed = sorted.slice(trim, sorted.length - trim);
  return trimmed.reduce((s, v) => s + v, 0) / trimmed.length;
}

/**
 * Turn one (words, elapsed) reading interval into a WPM sample, or null when the
 * interval is outside the plausible range (too fast/slow to be genuine reading).
 */
export function computeWpmSample(words: number, elapsedSec: number): number | null {
  if (elapsedSec < 5 || elapsedSec > 180) return null;
  if (words < 20) return null;
  const wpm = (words / elapsedSec) * 60;
  return wpm > 50 && wpm < 1000 ? wpm : null;
}

/** Append a sample to the rolling buffer, dropping the oldest past 15. Returns a new array. */
export function pushWpmSample(buffer: readonly number[], wpm: number): number[] {
  const next = [...buffer, wpm];
  if (next.length > 15) next.shift();
  return next;
}

// ── Progress-mode cycling ────────────────────────────────────────────────────

/** Advance to the next enabled progress mode; 'blank' is always the final stop. */
export function cycleLocMode(currentMode: number, enabledRealIds: readonly ProgressMode[]): number {
  const enabledIds: (ProgressMode | 'blank')[] = [...enabledRealIds, 'blank'];
  const currentId = LOC_MODE_MAP[currentMode];
  const currentIdx = enabledIds.indexOf(currentId);
  const nextId = enabledIds[(currentIdx + 1) % enabledIds.length];
  return LOC_MODE_MAP.indexOf(nextId);
}

/**
 * Reconcile locMode against settings: adopt the persisted mode, and if the active
 * mode was just disabled, jump to the first enabled one (and report it for persisting).
 * 'blank' is exempt (it's a user-cycled hidden state, not a toggleable mode).
 */
export function resolveLocMode(
  currentMode: number,
  progressModeSetting: ProgressMode | 'blank',
  enabledRealIds: readonly ProgressMode[]
): { mode: number; persist: ProgressMode | null } {
  const savedMode = LOC_MODE_MAP.indexOf(progressModeSetting);
  const mode = savedMode >= 0 ? savedMode : currentMode;
  const currentModeId = LOC_MODE_MAP[mode];
  if (currentModeId !== 'blank' && enabledRealIds.length > 0 && !enabledRealIds.includes(currentModeId)) {
    const first = enabledRealIds[0];
    return { mode: LOC_MODE_MAP.indexOf(first), persist: first };
  }
  return { mode, persist: null };
}

// ── Section / chapter progress ───────────────────────────────────────────────

export interface SectionProgressInput {
  fraction: number | null;
  totalBookSize: number;
  sectionSizes: readonly number[];
  currentSection: number;
  totalLocs: number | null;
}

/** Within-section progress from the book-level fraction + section byte-size offsets. */
export function sectionProgress(i: SectionProgressInput): Progress | null {
  if (i.fraction == null || i.totalBookSize <= 0) return null;
  let priorSize = 0;
  for (let k = 0; k < i.currentSection; k++) priorSize += i.sectionSizes[k] ?? 0;
  const currentSize = i.sectionSizes[i.currentSection] ?? 0;
  if (currentSize <= 0) return null;
  const sectionWidth = currentSize / i.totalBookSize;
  const sectionStart = priorSize / i.totalBookSize;
  const prog = Math.max(0, Math.min(1, (i.fraction - sectionStart) / sectionWidth));
  const pct = Math.round(prog * 100);
  if (i.totalLocs) {
    const total = Math.max(1, Math.round(i.totalLocs * sectionWidth));
    const loc = Math.max(1, Math.round(prog * total));
    return { loc, total, pct };
  }
  return { loc: 0, total: 0, pct };
}

export interface ChapterBoundariesInput {
  tocItems: ReadonlyArray<StatsTocItem>;
  sectionLocInfo: ReadonlyArray<{ startLoc: number }>;
  tocStartFractions: ReadonlyMap<string, number>;
  totalLocs: number;
  sectionSizes: readonly number[];
  totalBookSize: number;
  hrefToSectionIndex: (href: string | undefined) => number;
}

export interface ChapterBoundariesResult {
  boundaries: Array<{ startFraction: number; endFraction: number }>;
  flatHrefs: string[];
}

/**
 * Build [{startFraction, endFraction}] for every flat TOC entry, keyed by content
 * position (0–1). Assigns each chapter's start from `tocStartFractions` when known,
 * else falls back (byte offset → section-loc → even distribution for unvisited
 * chapters, so adjacent unvisited chapters never share a fraction → no false 100%).
 */
export function chapterBoundaries(i: ChapterBoundariesInput): ChapterBoundariesResult {
  if (!i.tocItems.length || (i.sectionLocInfo.length === 0 && i.tocStartFractions.size === 0)) {
    return { boundaries: [], flatHrefs: [] };
  }

  const flat: Array<{ href: string | undefined }> = [];
  const flatten = (items: ReadonlyArray<StatsTocItem>): void => {
    for (const item of items) {
      flat.push({ href: item.href || undefined });
      if (item.subitems?.length) flatten(item.subitems);
    }
  };
  flatten(i.tocItems);
  if (flat.length === 0) return { boundaries: [], flatHrefs: [] };

  const sectionIndices = flat.map((e) => i.hrefToSectionIndex(e.href));
  const startFractions: number[] = new Array(flat.length).fill(0) as number[];
  for (let idx = 0; idx < flat.length; idx++) {
    const { href } = flat[idx];
    if (href && i.tocStartFractions.has(href)) {
      startFractions[idx] = i.tocStartFractions.get(href)!;
    } else {
      const sIdx = sectionIndices[idx];
      if (sIdx >= 0 && i.totalBookSize > 0) {
        let cumBytes = 0;
        for (let j = 0; j < sIdx; j++) cumBytes += i.sectionSizes[j] ?? 0;
        startFractions[idx] = cumBytes / i.totalBookSize;
      } else if (sIdx >= 0 && i.sectionLocInfo[sIdx] && i.totalLocs > 0) {
        startFractions[idx] = i.sectionLocInfo[sIdx].startLoc / i.totalLocs;
      } else {
        // Distribute remaining space evenly so adjacent unvisited chapters don't share
        // the same fraction (which would cause zero span → 100% display).
        const remaining = flat.length - idx;
        startFractions[idx] = idx > 0 ? startFractions[idx - 1] + (1.0 - startFractions[idx - 1]) / remaining : 0;
      }
    }
  }

  const flatHrefs = flat.map((e) => e.href ?? '');
  const boundaries = startFractions.map((sf, idx) => ({
    startFraction: sf,
    endFraction: idx + 1 < startFractions.length ? startFractions[idx + 1] : 1.0,
  }));
  return { boundaries, flatHrefs };
}

export interface ChapterProgressInput {
  fraction: number;
  boundaries: ReadonlyArray<{ startFraction: number; endFraction: number }>;
  flatHrefs: readonly string[];
  tocItemHref: string;
  totalLocs: number;
}

/**
 * Progress within the current chapter. Caller guarantees `fraction != null` and
 * `boundaries` non-empty (otherwise it falls back to `sectionProgress` upstream).
 */
export function chapterProgressFromBoundaries(i: ChapterProgressInput): Progress {
  const idx = currentChapterIndex(i);
  const { startFraction, endFraction } = i.boundaries[idx];
  const span = Math.max(0.0001, endFraction - startFraction);
  const ratio = Math.max(0, Math.min(1, (i.fraction - startFraction) / span));
  const pct = Math.round(ratio * 100);
  const total = Math.max(1, Math.round(span * i.totalLocs));
  const loc = Math.max(1, Math.min(total, Math.round(ratio * total)));
  return { loc, total, pct };
}

/** Which contents entry the reader is in: the one foliate names, else the last to start at or before `fraction`. */
export function currentChapterIndex(i: Omit<ChapterProgressInput, 'totalLocs'>): number {
  const named = i.tocItemHref ? i.flatHrefs.indexOf(i.tocItemHref) : -1;
  if (named >= 0) return named;
  let idx = 0;
  for (let k = 1; k < i.boundaries.length; k++) {
    if (i.boundaries[k].startFraction <= i.fraction) idx = k;
    else break;
  }
  return idx;
}

/**
 * Where in a chapter the page is, counted in the book's own locations: the chapter starts in location `startLoc`, the
 * next one in `nextStartLoc`, and the page is in `currentLoc`. So a chapter's location and its start add up to the
 * book's location the indicator shows. Counts from 1; a page before the start (a title page the contents skips) is 1.
 */
export function chapterLocs(
  currentLoc: number,
  startLoc: number,
  nextStartLoc: number
): { loc: number; total: number } {
  const total = Math.max(1, nextStartLoc - startLoc);
  return { loc: Math.max(1, Math.min(total, currentLoc - startLoc + 1)), total };
}

// ── Word-count density ───────────────────────────────────────────────────────

export interface WordsInFractionInput {
  sectionSizes: readonly number[];
  totalBookSize: number;
  sectionWordCounts: readonly number[];
  sectionCharCounts: readonly number[];
  totalBookChars: number;
}

/**
 * Estimate word count between two content fractions using per-section word density.
 * Byte-based when section sizes are available; text-char-based fallback otherwise.
 */
export function wordsInFractionRange(from: number, to: number, i: WordsInFractionInput): number {
  if (from >= to || !i.sectionWordCounts.length) return 0;
  if (i.totalBookSize > 0) {
    let words = 0;
    let cumBytes = 0;
    for (let k = 0; k < i.sectionSizes.length; k++) {
      const sBytes = i.sectionSizes[k] ?? 0;
      if (sBytes <= 0) {
        cumBytes += sBytes;
        continue;
      }
      const sStart = cumBytes / i.totalBookSize;
      const sEnd = (cumBytes + sBytes) / i.totalBookSize;
      const overlap = Math.min(to, sEnd) - Math.max(from, sStart);
      if (overlap > 0) words += (overlap / (sEnd - sStart)) * (i.sectionWordCounts[k] ?? 0);
      cumBytes += sBytes;
    }
    return words;
  }
  // Fallback: text-char-based (used when section byte sizes are unavailable)
  if (!i.totalBookChars || !i.sectionCharCounts.length) return 0;
  let words = 0;
  let cumChars = 0;
  for (let k = 0; k < i.sectionCharCounts.length; k++) {
    const sChars = i.sectionCharCounts[k];
    if (sChars <= 0) {
      cumChars += sChars;
      continue;
    }
    const sStart = cumChars / i.totalBookChars;
    const sEnd = (cumChars + sChars) / i.totalBookChars;
    const overlap = Math.min(to, sEnd) - Math.max(from, sStart);
    if (overlap > 0) words += (overlap / (sEnd - sStart)) * (i.sectionWordCounts[k] ?? 0);
    cumChars += sChars;
  }
  return words;
}

// ── Chip label ────────────────────────────────────────────────────────────────

export interface LocLabelState {
  fraction: number | null;
  location: { current: number; total: number } | null;
  chapterProgress: Progress | null;
  wpm: number;
  wordsRemainingBook: number;
  wordsRemainingChapter: number;
}

/**
 * What the chip shows when the value it wants does not exist yet.
 *
 * **An em dash, and the same one the Stats tab uses.** Three ASCII periods would read as a string that ran out of room.
 * Nothing is missing for lack of space: two of the six modes are time-remaining, and a time needs a reading pace, which
 * needs eight sessions.
 *
 * The Stats tab renders `—` for the same fact (see `renderStatsPane`, where time remaining is `'—'` without a pace), so
 * this is one state with one symbol rather than two. A word — "pending", say — would promise that something is coming,
 * but spend most of a two-character monospace chip failing to say when; the reader who wants that opens Stats, which
 * says *Gathering data…* and counts the samples.
 */
const NO_VALUE_YET = '—';

/** Format the progress chip text for the given mode (0–6). */
export function formatLocLabel(mode: number, s: LocLabelState): string {
  switch (mode) {
    case 0: // 📖 xx% — book percentage
      return s.fraction != null ? `📖 ${Math.round(s.fraction * 100)}%` : NO_VALUE_YET;
    case 1: // 📖 x / y — book page / total book pages
      if (s.location?.total) return `📖 ${s.location.current} / ${s.location.total}`;
      return s.fraction != null ? `📖 ${Math.round(s.fraction * 100)}%` : NO_VALUE_YET;
    case 2: // 📑 xx% — chapter percentage
      return s.chapterProgress ? `📑 ${s.chapterProgress.pct}%` : NO_VALUE_YET;
    case 3: // 📑 x / y — chapter page / chapter total
      return s.chapterProgress?.total ? `📑 ${s.chapterProgress.loc} / ${s.chapterProgress.total}` : '';
    case 4: // 📖 ~Xm — time remaining in book
      if (!s.wpm) return `📖 ${NO_VALUE_YET}`;
      return `📖 ~${formatReadingTime(s.wordsRemainingBook / s.wpm)}`;
    case 5: // 📑 ~Xm — time remaining in chapter
      if (!s.wpm) return `📑 ${NO_VALUE_YET}`;
      return `📑 ~${formatReadingTime(s.wordsRemainingChapter / s.wpm)}`;
    case 6: // blank — user-cycled hidden state
      return '';
    default:
      return NO_VALUE_YET;
  }
}
