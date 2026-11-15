// Recorded-recording PLAYBACK: play a chapter's pre-generated MP3 (see recording.ts for the
// generation side) fully offline, driving sentence highlighting from the manifest segments.
// Distinct from the live engines (which speak sentence-by-sentence): here one continuous chapter
// MP3 plays and `timeupdate` maps the play position → the active segment's CFI.

import { collapse as cfiCollapse, compare as cfiCompare } from 'foliate-js/epubcfi.js';
import { type App, normalizePath } from 'obsidian';
import { type RecordingSegment, readRecordingManifest } from './recording';

/** Index of the segment active at time `t` seconds — the last segment whose `start` <= t. Returns 0
 *  before the first segment, the last index after the last, and -1 when there are no segments. */
export function segmentIndexAt(segments: readonly { start: number }[], t: number): number {
  if (!segments.length) return -1;
  let lo = 0;
  let hi = segments.length - 1;
  let ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (segments[mid].start <= t) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

/**
 * Where a ±N-second skip lands: inside this track, or over the seam into the next one.
 *
 * **Because a track stopped being a chapter.** These buttons clamped to the current MP3, which was invisible
 * while one MP3 was one chapter — the seams sat where chapters ended, and stopping at one was defensible. A
 * chapter divided into four tracks puts three seams in the MIDDLE of it, and there ⟲15 did nothing whatsoever:
 * at the top of "CHAPTER III 2 of 4", segment 0 is as far back as clamping can reach.
 *
 * Fifteen seconds before the start of a track is the leftover distance before the END of the one before it, so
 * the overshoot is what the caller carries across. The caller decides whether crossing is possible at all — at
 * the ends of the book, and where the neighbor has no recording, `within` is the answer and the clamp applies.
 */
export type SkipLanding = { kind: 'within'; seconds: number } | { kind: 'cross'; dir: 1 | -1; overshootSec: number };

export function skipLanding(currentSec: number, deltaSec: number, durationSec: number): SkipLanding {
  const raw = currentSec + deltaSec;
  // A track of unknown length (metadata not in yet) can only be seeked within — there is no end to run off.
  if (!(durationSec > 0)) return { kind: 'within', seconds: Math.max(0, raw) };
  if (raw < 0) return { kind: 'cross', dir: -1, overshootSec: -raw };
  if (raw > durationSec) return { kind: 'cross', dir: 1, overshootSec: raw - durationSec };
  return { kind: 'within', seconds: raw };
}

/**
 * Where the leftover seconds put the reader inside the destination track.
 *
 * Backward measures from its END — that edge is the one the reader is arriving from — and forward from its
 * start. Clamped to the destination, since a skip must never run off a second seam in one press.
 */
export function seamOffsetSec(landing: { dir: 1 | -1; overshootSec: number }, destDurationSec: number): number {
  const d = Math.max(0, destDurationSec);
  return landing.dir < 0 ? Math.max(0, d - landing.overshootSec) : Math.min(d, landing.overshootSec);
}

/** Index of the segment nearest a navigation target `targetCfi` (the last segment starting at or
 *  before it), so recorded audio can seek to a search hit / bookmark / go-to target. Segments are
 *  in reading order. Returns 0 when the target precedes them all, -1 when there are none. */
export function segmentIndexForCfi(segments: readonly { cfi: string }[], targetCfi: string): number {
  if (!segments.length) return -1;
  let target: string;
  try {
    target = cfiCollapse(targetCfi, false);
  } catch {
    return -1;
  }
  let ans = -1;
  for (let i = 0; i < segments.length; i++) {
    if (!segments[i].cfi) continue;
    try {
      if (cfiCompare(cfiCollapse(segments[i].cfi, false), target) <= 0) ans = i;
      else break; // reading order — once past the target, later segments are too
    } catch {
      /* malformed / cross-doc CFI — skip this segment */
    }
  }
  return ans >= 0 ? ans : 0;
}

export interface RecordedChapter {
  chapterIndex: number;
  /** Object URL for the chapter MP3 (caller/player revokes it). */
  audioUrl: string;
  duration: number;
  /** The recorded tracks after this one, by index, with their real lengths (s) — see `bookSecondsAfter`. */
  laterRecorded: ReadonlyMap<number, number>;
  segments: RecordingSegment[];
  chapterCount: number;
}

const manifestPath = (audioDir: string) => normalizePath(`${audioDir}/manifest.json`);

/** Read the book's manifest and load one chapter's audio into an object URL. Null when there's no
 *  recorded audio for that chapter. The RecordedAudioPlayer that loads it revokes the URL. */
export async function loadRecordedChapter(
  app: App,
  audioDir: string,
  chapterIndex: number
): Promise<RecordedChapter | null> {
  const manifest = await readRecordingManifest(app, manifestPath(audioDir));
  if (!manifest) return null;
  const chapter = manifest.chapters.find((c) => c.index === chapterIndex);
  // `complete` as well as "has segments": a track is written all at once at the end of its run, so an entry
  // without the flag is one no current build finished — a torn write between the audio and the manifest, or a
  // crash between them. Playing it would mean a thirty-minute track that stops half way through with nothing to
  // say why. Treated as unrecorded, which is what offers it for recording again. See `RecordingChapter.complete`.
  if (!chapter || !chapter.complete || !chapter.segments.length) return null;
  const filePath = normalizePath(`${audioDir}/${chapter.audioFile}`);
  if (!(await app.vault.adapter.exists(filePath))) return null;
  const bytes = await app.vault.adapter.readBinary(filePath);
  const laterRecorded = new Map(
    manifest.chapters.filter((c) => c.index > chapterIndex && c.complete).map((c) => [c.index, c.duration] as const)
  );
  return {
    chapterIndex,
    audioUrl: URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' })),
    duration: chapter.duration,
    laterRecorded,
    segments: chapter.segments,
    chapterCount: manifest.chapters.length,
  };
}

export interface RecordedAudioCallbacks {
  /** Fired when the active segment changes (also on the first segment after load/seek). */
  onSegment?: (index: number, segment: RecordingSegment) => void;
  /** Fired on every timeupdate with the current/total seconds (for the scrubber). */
  onTime?: (currentSec: number, durationSec: number) => void;
  /** Fired when the chapter audio reaches its end (for cross-chapter auto-advance). */
  onEnded?: () => void;
}

/**
 * Plays a recorded chapter MP3 via an HTMLAudioElement and reports the active manifest segment as
 * playback advances. A media element (not Web Audio) — so it may keep playing in the background /
 * on the lock screen where the live engines can't (to be verified on mobile).
 */
export class RecordedAudioPlayer {
  private readonly audio = new Audio();
  private segments: readonly RecordingSegment[] = [];
  private lastSegIdx = -1;
  private url: string | null = null;

  constructor(private readonly cb: RecordedAudioCallbacks = {}) {
    this.audio.preload = 'auto';
    this.audio.addEventListener('timeupdate', this.handleTimeUpdate);
    this.audio.addEventListener('ended', () => this.cb.onEnded?.());
  }

  /** Load a chapter's audio + segments, revoking the previous object URL. Does not auto-play. */
  load(chapter: RecordedChapter): void {
    this.revoke();
    this.url = chapter.audioUrl;
    this.segments = chapter.segments;
    this.lastSegIdx = -1;
    this.audio.src = chapter.audioUrl;
  }

  private handleTimeUpdate = (): void => {
    const t = this.audio.currentTime;
    this.cb.onTime?.(t, this.audio.duration || 0);
    const idx = segmentIndexAt(this.segments, t);
    if (idx >= 0 && idx !== this.lastSegIdx) {
      this.lastSegIdx = idx;
      this.cb.onSegment?.(idx, this.segments[idx]);
    }
  };

  play(): Promise<void> {
    return this.audio.play();
  }
  pause(): void {
    this.audio.pause();
  }
  get paused(): boolean {
    return this.audio.paused;
  }
  seek(sec: number): void {
    this.audio.currentTime = sec;
  }
  /** Seeking by FRACTION belongs to the caller, not here: the total the bar was drawn from is the manifest's, and
   *  measuring against the media element's own duration is how a drag landed somewhere other than where it was
   *  dropped. See `seekToChapterFraction`. */
  seekToSegment(idx: number): void {
    const s = this.segments[idx];
    if (s) this.audio.currentTime = s.start;
  }
  setRate(rate: number): void {
    this.audio.playbackRate = rate;
  }
  get currentTime(): number {
    return this.audio.currentTime;
  }
  get duration(): number {
    return this.audio.duration || 0;
  }

  private revoke(): void {
    if (this.url) {
      URL.revokeObjectURL(this.url);
      this.url = null;
    }
  }

  dispose(): void {
    this.audio.pause();
    this.audio.removeEventListener('timeupdate', this.handleTimeUpdate);
    this.audio.removeAttribute('src');
    this.audio.load();
    this.revoke();
  }
}
