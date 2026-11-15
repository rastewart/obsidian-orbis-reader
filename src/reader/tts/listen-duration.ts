// How long a live track runs, how far into it the voice is, and how much of the book is left — as arithmetic.
//
// A live voice has no duration until it has spoken, so every time the player shows is an estimate: words, divided by
// the narration rate. Here as pure functions, out of `TtsController.ts`, so "~1h 22m left" can be checked by a test
// rather than by playing a book on a device and reading the screen.

import { spanProgress, type UnitSpan } from './entry-span';
import { NARRATION_WPM } from './pacing';

/** Words in a string (whitespace-separated, non-empty). */
export function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/** Seconds → "1h 23m" / "12m" / "45s". */
export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

/** How long `words` take to say at `rate` (1 = normal), in seconds. 0 at a rate of 0. */
export function narrationSeconds(words: number, rate: number): number {
  const wpm = NARRATION_WPM * rate;
  return wpm > 0 ? (words / wpm) * 60 : 0;
}

/** What a unit is, as far as counting goes: its text, and the sentences a multi-sentence chunk holds. */
export interface CountedUnit {
  text: string;
  sentences?: readonly { text: string }[];
}

/** The word counts of one section — everything the estimates below are subtractions over. */
export interface DurationModel {
  /** Words in each reading unit. */
  unitWords: number[];
  /** Words before each unit boundary: `sectionCumWords[i]` = words before unit `i`; the last is the section's total. */
  sectionCumWords: number[];
  /** Each sentence across the section — the seek granularity — with its unit and the fraction into that unit's
   *  text where it starts, so a clip can begin partway through. */
  sectionSentences: Array<{ unitIdx: number; startFraction: number }>;
  /** Words before each sentence boundary, across the section. */
  sentenceCumWordsFlat: number[];
  /** Words in every section after this one — what the whole-book estimate adds on. */
  laterSectionWords: number;
}

/** Count a section's units and sentences. `sectionWords` is every section's word count; `sectionIdx` is this one. */
export function buildDurationModel(
  units: readonly CountedUnit[],
  sectionWords: readonly number[],
  sectionIdx: number
): DurationModel {
  const unitWords = units.map((u) => wordCount(u.text));
  const sectionCumWords = [0];
  for (const w of unitWords) sectionCumWords.push(sectionCumWords[sectionCumWords.length - 1] + w);
  const sectionSentences: DurationModel['sectionSentences'] = [];
  const sentenceCumWordsFlat = [0];
  let cum = 0;
  for (let u = 0; u < units.length; u++) {
    const unit = units[u];
    const sents = unit.sentences ?? [unit];
    const unitLen = Math.max(1, unit.text.length);
    let charAcc = 0;
    for (const s of sents) {
      sectionSentences.push({ unitIdx: u, startFraction: Math.min(charAcc / unitLen, 1) });
      cum += wordCount(s.text);
      sentenceCumWordsFlat.push(cum);
      charAcc += s.text.length + 1;
    }
  }
  let laterSectionWords = 0;
  for (let i = sectionIdx + 1; i < sectionWords.length; i++) laterSectionWords += sectionWords[i] ?? 0;
  return { unitWords, sectionCumWords, sectionSentences, sentenceCumWordsFlat, laterSectionWords };
}

/** Where the voice is: the unit being read, and how far into it (0..1). */
export interface ReadingAt {
  unitIdx: number;
  unitFrac: number;
}

/** What the player's live readouts say, for the track `span` covers. */
export interface LiveReadout {
  /** How far into the track, 0..1 — the bar. */
  fraction: number;
  elapsedSec: number;
  remainingSec: number;
  /** The track's estimated length. */
  trackSec: number;
  /** The rest of this track, the rest of its section, and every section after it. */
  bookLeftSec: number;
}

/**
 * The live readouts for the track `span` covers.
 *
 * The CURRENT ENTRY, not the file it sits in — see `entry-span.ts`. On a book where one file is one chapter the span
 * is the whole section and these are the section's own numbers. The book estimate is still the whole book.
 */
export function liveReadout(
  model: Pick<DurationModel, 'sectionCumWords' | 'unitWords' | 'laterSectionWords'>,
  span: UnitSpan,
  at: ReadingAt,
  rate: number
): LiveReadout {
  const { sectionCumWords: cum, unitWords } = model;
  const { done, total } = spanProgress(span, cum, unitWords, at.unitIdx, at.unitFrac);
  const sectionTotal = cum[cum.length - 1] ?? 0;
  const doneInSection = cum[Math.min(at.unitIdx, unitWords.length)] ?? 0;
  return {
    fraction: total > 0 ? Math.min(1, done / total) : 0,
    elapsedSec: narrationSeconds(done, rate),
    remainingSec: narrationSeconds(total - done, rate),
    trackSec: narrationSeconds(total, rate),
    bookLeftSec: narrationSeconds(sectionTotal - doneInSection + model.laterSectionWords, rate),
  };
}

/** What a drag to `frac` of the track would show — the same span the readouts use, so the preview is what the
 *  release will produce. */
export function livePreview(
  sectionCumWords: readonly number[],
  span: UnitSpan,
  frac: number,
  rate: number
): { elapsedSec: number; remainingSec: number } {
  const at = (i: number): number => sectionCumWords[Math.max(0, Math.min(i, sectionCumWords.length - 1))] ?? 0;
  const spanWords = Math.max(0, at(span.end) - at(span.start));
  const done = frac * spanWords;
  return { elapsedSec: narrationSeconds(done, rate), remainingSec: narrationSeconds(spanWords - done, rate) };
}

/** The whole section as the OS media scrubber sees it: its length, and how far into it the voice is. */
export function sectionPosition(
  model: Pick<DurationModel, 'sectionCumWords' | 'unitWords'>,
  at: ReadingAt,
  rate: number
): { durationSec: number; positionSec: number } {
  const { sectionCumWords: cum, unitWords } = model;
  const total = cum[cum.length - 1] ?? 0;
  const before = cum[Math.min(at.unitIdx, unitWords.length)] ?? 0;
  const done = Math.min(total, before + at.unitFrac * (unitWords[at.unitIdx] ?? 0));
  return { durationSec: narrationSeconds(total, rate), positionSec: narrationSeconds(done, rate) };
}
