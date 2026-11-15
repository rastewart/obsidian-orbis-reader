// Recording generation: render a chapter to a single cached audio file + a
// manifest, once, while online — so it can be played back fully offline later.
// See docs/design/text-to-speech.md ("Mode 2 — Pre-generated recording").
//
// Synthesize per sentence (one request per sentence to an OpenAI-compatible
// /v1/audio/speech endpoint, e.g. local Kokoro, or the on-device Piper worker),
// then encode the PCM into ONE file per chapter, recording each sentence's
// start/dur in the manifest for sentence-level sync — see the design doc.

import { fake as cfiFake, fromRange as cfiFromRange, joinIndir as cfiJoinIndir } from 'foliate-js/epubcfi.js';
import { type App, normalizePath, requestUrl } from 'obsidian';
import { chapterBoundaries } from '../../book-chapters';
import type { RawSection } from '../foliate-view';
import type { PiperGenerator } from './PiperEngine';
import { interClipPauseMs, type PauseKind } from './pacing';
import type { Pronouncer } from './pronunciations';
import { withTimeout } from './request-timeout';
import { getReadingUnits, normalizeForSpeech, type ReadingUnit, unitIndexForAnchor } from './tts-blocks';

export interface RecordingSegment {
  cfi: string;
  start: number; // seconds into the chapter audio file
  dur: number; // seconds
  text: string;
}

export interface RecordingChapter {
  /** The chapter's ordinal in the book's chapter list — see `book-chapters`. */
  index: number;
  /**
   * The contents href this chapter covers, when one names it.
   *
   * **Written so a mismatch is detectable rather than silent.** A chapter is identified by its ordinal, because a
   * chapter no contents entry names has no href to be known by; but a book replaced in the vault with a different
   * edition would keep the same ordinals over different text, and this is what says so.
   */
  href?: string;
  /**
   * How many parts the chapter had when this was recorded.
   *
   * **So a regrouping invalidates the file rather than silently mismatching it.** A part is keyed by its chapter's
   * href and its position, and both survive a chapter being divided differently — but the AUDIO does not: slice 1
   * of 3 covers a third of the chapter where slice 1 of 2 covered a half. Comparing this against the current part
   * count is what tells a stale recording from a current one.
   */
  partCount?: number;
  title?: string;
  /**
   * Every sentence of this track was recorded.
   *
   * **A file on disk is not evidence that it finished.** The audio and this entry are written at the end of a
   * track, so an entry without the flag is one no current build produced — a torn write, a crash between the two
   * writes, or a manifest from a build that had no such notion. All of those can leave a thirty-minute track that
   * stops half way through, and nothing in the file itself says so; only listening would find it.
   *
   * Written nowhere but at the end of a complete track, and required by `loadRecordedChapter` before a track is
   * played or counted as recorded. Deliberately not optional in spirit — the type keeps it optional only so a
   * manifest being read can lack it, which is precisely the case being guarded against.
   */
  complete?: boolean;
  audioFile: string; // relative to the book audio dir, e.g. "ch0000.wav"
  duration: number; // seconds
  fileBytes?: number; // encoded file size, for the storage/management UI
  // Voice + model this chapter was generated with. Tracked per chapter (not just book-level) as
  // the groundwork for allowing different voices per chapter — and, later, multiple audio variants
  // per chapter.
  voice?: string;
  model?: string;
  segments: RecordingSegment[];
}

export interface RecordingManifest {
  version: number;
  book: string;
  engine: { kind: string; model: string; voice: string; format: string };
  createdAt: number;
  chapters: RecordingChapter[];
}

export async function readRecordingManifest(app: App, path: string): Promise<RecordingManifest | null> {
  return readManifest(app, path);
}

/**
 * Is this manifest entry a track that can actually be played and counted as recorded?
 *
 * Asked by everything that reads a manifest to answer "is this chapter done?" — playback, the recordings dialog's
 * rows, a mix resolving its pointers — because they have to agree. An entry that fails this is offered for
 * recording again, which is the only useful thing to do with it.
 *
 * Deliberately NOT applied inside `readManifest`: `deleteChapterAudio` finds an entry's file through the same
 * list, and dropping unplayable entries on read would leak the file they name.
 */
export function isCompleteChapter(c: RecordingChapter | undefined | null): c is RecordingChapter {
  return !!c && c.complete === true && c.segments.length > 0;
}

// What each version changed in the format. An older manifest is not migrated: its numbers, and every mix pointer
// into it, cannot be reinterpreted, only re-recorded — `readManifest` drops it and the book reads as unrecorded.
//
// 2: `index` counts the book's CHAPTERS (contents entries) rather than its spine sections.
// 3: a track carries `complete`, and nothing without it is played or counted as recorded. An older track may have
//    a missing sentence, and nothing but listening tells the sound ones from the rest.
// 4: a chapter is a TOP-LEVEL contents entry covering its subtree, not an entry at every depth — see the note at
//    the top of `book-chapters`. Ordinals shift on any book whose contents page has depth.
// 5: an entry that CONTAINS chapters opens into them (`containsChapters`) — a title heading over every chapter, an
//    omnibus's novels, a book's parts. Ordinals shift on every such book.
export const MANIFEST_VERSION = 5;
const MP3_KBPS = 48; // mono narration — good quality, ~8× smaller than WAV

/**
 * How long to wait for one sentence before giving up on that request — scaled to the sentence.
 *
 * **Because a run could otherwise hang forever.** `requestUrl` takes no timeout and cannot be aborted, so a server
 * that accepts the connection and never answers would leave the pipeline awaiting a promise with nothing to settle
 * it: the progress bar stops and stays there, with no error, no notice and nothing further in the log.
 *
 * **Proportional, because one number cannot be right for both ends of a chapter.** A flat ceiling generous enough
 * for the longest sentence in a book is absurd for an eight-character one, and a flat ceiling tight enough to
 * recover quickly would abandon long sentences the server was still working on. Since a repeatable timeout
 * exhausts every attempt and fails the whole track, that mistake costs half an hour of recording, so the cost of
 * being wrong is lopsided and the room has to go where the work is.
 *
 * On a 4th-gen i7, CPU-only, Kokoro `af_heart` synthesizes at 28–35 ms per character with a ~600ms floor (up to
 * ~18s for a 637-character sentence). `MS_PER_CHAR` is ~3× the worst of that and `BASE` adds slack for the fixed
 * costs — a request that stalls for reasons of its own can run at 945 ms/char, which is the sort of thing this
 * exists to catch rather than to accommodate.
 *
 * The floor keeps a short sentence recovering in half a minute; the ceiling is a guess at the longest sentence
 * worth waiting for rather than anything the measurements show. Slower hardware than that i7 would need the rate
 * raised — everything newer has headroom.
 */
const SYNTH_TIMEOUT_BASE_MS = 30_000;
const SYNTH_TIMEOUT_MS_PER_CHAR = 100;
const SYNTH_TIMEOUT_MAX_MS = 180_000;

export function synthTimeoutMs(chars: number): number {
  // A non-finite length would propagate to `setTimeout`, which reads NaN as 0 and would abandon every request the
  // instant it was sent. `text.length` cannot be NaN, so this guards the contract rather than a known caller.
  const n = Number.isFinite(chars) ? Math.max(0, chars) : 0;
  return Math.min(SYNTH_TIMEOUT_MAX_MS, SYNTH_TIMEOUT_BASE_MS + n * SYNTH_TIMEOUT_MS_PER_CHAR);
}
/**
 * Attempts per sentence, timeout included — so two retries.
 *
 * A stall is usually transient: a phone's radio dropping while the screen is off, a server hiccup, a box that was
 * briefly saturated. Since a single sentence that never arrives fails the whole track (see
 * `generateChapterAudioInner`), it is worth asking more than once before spending twenty minutes of synthesis on a
 * track that will be thrown away.
 *
 * Only for the failures that could plausibly differ next time: a 4xx says this voice or model is wrong, and will
 * say it again.
 */
const SERVER_SYNTH_ATTEMPTS = 3;

/**
 * What an HTTP status from the speech endpoint means, and whether asking again could change it.
 *
 * 4xx is about the request — nearly always a voice or model this server does not have; 401/403 is about permission.
 * Both are settled: the same bytes will be rejected again, and a retry only doubles the wait before the reader is
 * told. 5xx is the server's own trouble, which a moment later may be over.
 */
export function serverStatusOutcome(status: number): { failure: SynthFailure; retry: boolean } {
  if (status === 401 || status === 403) return { failure: 'unauthorized', retry: false };
  if (status >= 400 && status < 500) return { failure: 'voice-rejected', retry: false };
  return { failure: 'server-error', retry: true };
}

/**
 * How many requests may be lost to the background IN A ROW before the run pauses itself.
 *
 * **Because switching apps is not a fault, and the run treats a lost sentence as fatal.** Android suspends the
 * WebView: in-flight requests die, timers stop, and nothing can reach the network. Copying a log out of the debug
 * panel and coming back would otherwise be enough to spend every attempt on one sentence and abandon the run.
 *
 * Consecutive, and reset by any sentence that lands — so a reader who switches apps twenty times across a long
 * recording is never closer to failing than one who switches once. What the bound is really for is the case no API
 * can distinguish from an app switch: `hidden` is also what a phone reports when the SCREEN goes off, so forgiving
 * without limit would let a phone face-down beside a dead server retry for ever, never progressing and never
 * saying so. A few in a row with nothing in between means "cannot reach the network", and the answer to that is to
 * wait for the reader rather than to throw away the audio already recorded.
 */
const BACKGROUND_LOSSES_BEFORE_PAUSE = 3;

/** Whether the app is in the background right now — where nothing can reach the network. */
function appHidden(): boolean {
  return typeof activeDocument !== 'undefined' && activeDocument.visibilityState === 'hidden';
}

/**
 * Wait until the app is in the foreground, or until `signal` says the run was cancelled.
 *
 * There is no point launching a request the platform will kill, and no point counting one it already killed. The
 * cancel check is what keeps Stop responsive while a run is parked here.
 */
export async function whenAppVisible(signal?: { cancelled: boolean }, log?: (msg: string) => void): Promise<void> {
  if (!appHidden() || signal?.cancelled) return;
  log?.('⏸ app is in the background — waiting for it to come back before trying again');
  // One document for the listener's whole life, so it comes off the one it went on.
  const doc = activeDocument;
  await new Promise<void>((resolve) => {
    const done = (): void => {
      if (appHidden() && !signal?.cancelled) return;
      doc.removeEventListener('visibilitychange', done);
      window.clearInterval(poll);
      resolve();
    };
    // The event is the fast path; the poll is the guarantee, since a cancellation while hidden fires no event
    // and the run must not stay parked here after Stop.
    doc.addEventListener('visibilitychange', done);
    const poll = window.setInterval(done, 1000);
  });
  log?.('▶ app is back — resuming');
}

/** Delete one chapter's audio: remove its file and its manifest entry (dropping the manifest
 *  entirely when it becomes empty). */
export async function deleteChapterAudio(app: App, audioDir: string, chapterIndex: number): Promise<void> {
  const manifestPath = normalizePath(`${audioDir}/manifest.json`);
  const m = await readManifest(app, manifestPath);
  if (!m) return;
  const ch = m.chapters.find((c) => c.index === chapterIndex);
  if (ch) {
    try {
      await app.vault.adapter.remove(normalizePath(`${audioDir}/${ch.audioFile}`));
    } catch {
      /* file already gone */
    }
  }
  m.chapters = m.chapters.filter((c) => c.index !== chapterIndex);
  if (m.chapters.length) await app.vault.adapter.write(manifestPath, JSON.stringify(m, null, 2));
  else await deleteAllAudio(app, audioDir);
}

/** Delete all generated audio for a book (the whole audio dir). */
async function deleteAllAudio(app: App, audioDir: string): Promise<void> {
  try {
    if (await app.vault.adapter.exists(normalizePath(audioDir))) {
      await app.vault.adapter.rmdir(normalizePath(audioDir), true);
    }
  } catch {
    /* best-effort */
  }
}

interface WavData {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  pcm: Uint8Array;
}

/** Per-sentence synthesizer for a recording run — the seam between the two methods. `synth()` returns
 *  raw PCM (WavData) for one sentence, or null on failure; the recording pipeline (MP3 encode, pauses,
 *  segments) is engine-agnostic below it. Created once per run and reused across chapters; dispose()
 *  frees it (terminates the Piper worker). */
/**
 * Why a chapter produced nothing, in terms a reader can act on.
 *
 * **Because "check the debug log" is not an answer.** A synth returns `null` for every kind of failure, so a run that
 * recorded nothing could only say that it had — yet the reason (a voice the server does not have, a server that is
 * not there, credentials) is known at the moment of failure. The synth records the last one; the chapter returns
 * it; the dialog says it in a sentence.
 */
export type SynthFailure =
  | 'voice-rejected'
  | 'unauthorized'
  | 'server-error'
  | 'unreachable'
  | 'device-voice'
  | 'unreadable-audio';

export interface ChapterSynth {
  synth(text: string): Promise<WavData | null>;
  /** How many synth() calls to keep in flight (a server can parallelize; the Piper worker is 1). */
  readonly concurrency: number;
  /** The last failure this synth saw, for a run that ends with nothing to show — see `SynthFailure`. */
  failure?: SynthFailure | null;
  /**
   * The run's cancel flag, assigned by `RecordingGenerator.run`.
   *
   * A synth can wait — the server one parks while the app is in the background rather than spending its retries on
   * a network it cannot reach — and Stop has to reach it while it does. Not a constructor argument because the
   * synth is built before there is a run to cancel.
   */
  signal?: { cancelled: boolean; paused?: boolean } | null;
  /**
   * Awaited before each request, so a pause takes hold between sentences rather than after the chapter.
   *
   * Supplied by `RecordingGenerator.run`. Absent for a synth used outside a run, where there is nothing to pause.
   */
  waitWhilePaused?: (() => Promise<void>) | null;
  /**
   * "I cannot make progress" — the synth asking the RUN to pause rather than failing the track.
   *
   * Raised when requests keep dying to the background: switching apps is not a fault of the recording's, and under
   * the all-or-nothing rule the alternative is to lose half an hour of audio because someone checked a message.
   */
  onStuck?: (() => void) | null;
  /**
   * The app went away / came back, so the run can SAY it is waiting instead of merely stopping.
   *
   * **Because an invisible wait reads as a broken button.** Parked silently, the readout freezes mid-chapter while
   * the footer goes on truthfully offering "Pause", and the only way to tell a run that is waiting from one that
   * has died is the debug log. Reported as a pause with a reason, and lifted automatically on return — a
   * fifteen-second detour should not need a tap.
   */
  onHidden?: (() => void) | null;
  onVisible?: (() => void) | null;
  dispose(): void;
}

export interface GenerateChapterOpts {
  app: App;
  sections: RawSection[];
  /** The spine section holding this chapter — what gets opened and read. */
  sectionIndex: number;
  /** The chapter's ordinal in the book's chapter list: its identity on disk (`ch0000.mp3`) and in the manifest. */
  chapterIndex: number;
  /** The contents href this chapter covers, recorded alongside its ordinal. */
  chapterHref?: string | null;
  /**
   * The anchors of every chapter in this section, in order, and which of them this chapter is.
   *
   * **The whole list, not just this chapter's own bounds.** Where a chapter ends is where the next one starts, and
   * both are resolved together here so the same normalization runs as when the row's length was estimated — a
   * chapter's MP3 and the "42 min" beside it then describe the same stretch of the book by construction. Anchors
   * are null for a chapter that is a whole section, or for a contents entry naming a bare file.
   */
  sectionAnchors?: readonly (string | null)[];
  anchorAt?: number;
  /** When this part is one slice of a chapter too long to be one track — see `splitLongParts`. */
  slice?: { index: number; count: number };
  /** How many parts this chapter has, written to the manifest so a changed grouping invalidates the file. */
  partCount?: number;
  bookBasename: string;
  /** Absolute vault path of the book's audio dir, e.g. `<!orbis-data>/audio/<book>`. */
  audioDir: string;
  chapterTitle?: string;
  /** Book-level ID3 metadata for the chapter MP3 (best-effort — a tag failure never fails the run,
   *  and non-MP3 fallbacks are left untagged). `coverData` = the cover image bytes for APIC art. */
  bookTitle?: string;
  bookAuthor?: string;
  /** Human voice label (e.g. "Amy — American English"), written as Composer — the narrator stand-in. */
  voiceLabel?: string;
  coverData?: ArrayBuffer | null;
  /** Total spine sections, for the "n/total" track number. */
  trackTotal?: number;
  /** The per-sentence synthesizer (server or on-device Piper). */
  synth: ChapterSynth;
  /** Engine tag recorded in the manifest (e.g. 'openai-compatible', 'piper-ondevice'). */
  engineKind: string;
  /** Voice + model recorded in the manifest (for the UI + the edition key). */
  voice: string;
  model?: string;
  createdAt: number;
  onProgress?: (done: number, total: number) => void;
  log?: (msg: string) => void;
  signal?: { cancelled: boolean };
}

export interface GenerateResult {
  segments: number;
  failed: number;
  durationSec: number;
  fileBytes: number;
  /** True when the chapter was cancelled mid-way and nothing was written. */
  cancelled?: boolean;
  /**
   * True when the chapter had nothing to say — a cover, a title page, a converter's blank split file.
   *
   * **Distinct from a failure.** Both end with no audio, and counting both as chapters that broke would have an
   * ordinary book, whose front matter is several such chapters, finish its run reporting failures for doing
   * precisely the right thing. Here the document is open and the units are in hand, so the difference is known for
   * certain rather than estimated.
   */
  noText?: boolean;
  /** Why nothing was produced, when nothing was — see `SynthFailure`. */
  failure?: SynthFailure | null;
}

async function ensureFolder(app: App, dir: string): Promise<void> {
  const parts = normalizePath(dir).split('/');
  let cur = '';
  for (const part of parts) {
    cur = cur ? `${cur}/${part}` : part;
    if (!(await app.vault.adapter.exists(cur))) {
      try {
        await app.vault.adapter.mkdir(cur);
      } catch {
        /* concurrent create / already exists */
      }
    }
  }
}

async function readManifest(app: App, path: string): Promise<RecordingManifest | null> {
  try {
    if (!(await app.vault.adapter.exists(path))) return null;
    const m = JSON.parse(await app.vault.adapter.read(path)) as RecordingManifest;
    // An older manifest's chapter numbers count something else — see MANIFEST_VERSION. Read as "nothing recorded"
    // rather than migrated: there is no mapping from a spine section to the chapters inside it that would not have
    // to split an MP3 it cannot split.
    if (m?.version !== MANIFEST_VERSION) return null;
    // A track's file name becomes a path that is played and deleted, and the manifest may have been written by
    // someone else (a shared or synced vault), so only the names a recording makes are kept. An entry naming
    // anything else is not a track of ours, and dropping it leaks no file of ours either.
    m.chapters = Array.isArray(m.chapters) ? m.chapters.filter((c) => TRACK_FILE.test(c?.audioFile)) : [];
    return m;
  } catch {
    return null;
  }
}

const fourCC = (v: DataView, off: number): string =>
  String.fromCharCode(v.getUint8(off), v.getUint8(off + 1), v.getUint8(off + 2), v.getUint8(off + 3));

/** Parse a RIFF/WAVE buffer into format + raw PCM (walks chunks; tolerant of extras). */
function parseWav(buf: ArrayBuffer): WavData | null {
  const v = new DataView(buf);
  if (buf.byteLength < 12 || fourCC(v, 0) !== 'RIFF' || fourCC(v, 8) !== 'WAVE') return null;
  let sampleRate = 24000;
  let channels = 1;
  let bitsPerSample = 16;
  let pcm: Uint8Array | null = null;
  let off = 12;
  while (off + 8 <= buf.byteLength) {
    const id = fourCC(v, off);
    const size = v.getUint32(off + 4, true);
    const body = off + 8;
    if (id === 'fmt ') {
      channels = v.getUint16(body + 2, true);
      sampleRate = v.getUint32(body + 4, true);
      bitsPerSample = v.getUint16(body + 14, true);
    } else if (id === 'data') {
      pcm = new Uint8Array(buf, body, Math.min(size, buf.byteLength - body));
    }
    off = body + size + (size % 2); // chunks are word-aligned
  }
  if (!pcm) return null;
  return { sampleRate, channels, bitsPerSample, pcm };
}

function buildWav(pcm: Uint8Array, sampleRate: number, channels: number, bitsPerSample: number): ArrayBuffer {
  const blockAlign = (channels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const buf = new ArrayBuffer(44 + pcm.length);
  const v = new DataView(buf);
  const wstr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i));
  };
  wstr(0, 'RIFF');
  v.setUint32(4, 36 + pcm.length, true);
  wstr(8, 'WAVE');
  wstr(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, channels, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, byteRate, true);
  v.setUint16(32, blockAlign, true);
  v.setUint16(34, bitsPerSample, true);
  wstr(36, 'data');
  v.setUint32(40, pcm.length, true);
  new Uint8Array(buf, 44).set(pcm);
  return buf;
}

interface Mp3Stream {
  /** Encode one sentence's mono 16-bit PCM now; only the compressed output is retained. */
  push(pcm: Uint8Array): void;
  /** Compressed bytes accumulated so far (≈ live memory footprint) — for progress logging. */
  bytes(): number;
  /** Emit the final partial frame + encoder flush, and concatenate the whole MP3. */
  finish(): ArrayBuffer;
}

/** Streaming MP3 encoder (lamejs, lazy-loaded): fed one sentence's PCM at a time so only the
 *  compressed MP3 (~1/8 the raw size) accumulates — not the whole chapter's PCM. A carry buffer
 *  holds the sub-frame remainder between sentences so only whole 1152-sample frames reach the
 *  encoder, making the output identical to encoding the fully concatenated PCM. */
async function createMp3Stream(sampleRate: number, kbps: number): Promise<Mp3Stream> {
  const { Mp3Encoder } = await import('lamejs');
  const enc = new Mp3Encoder(1, sampleRate, kbps);
  const parts: Uint8Array[] = [];
  const BLOCK = 1152; // one MP3 frame
  let carry = new Int16Array(0);
  let byteLen = 0;
  const encode = (samples: Int16Array): void => {
    const buf = enc.encodeBuffer(samples);
    if (buf.length) {
      parts.push(new Uint8Array(buf)); // snapshot (encoder reuses its buffer)
      byteLen += buf.length;
    }
  };
  return {
    bytes: () => byteLen,
    push(pcm: Uint8Array): void {
      const s = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.byteLength / 2));
      let buf: Int16Array;
      if (carry.length) {
        buf = new Int16Array(carry.length + s.length);
        buf.set(carry);
        buf.set(s, carry.length);
      } else {
        buf = s;
      }
      let i = 0;
      for (; i + BLOCK <= buf.length; i += BLOCK) encode(buf.subarray(i, i + BLOCK));
      carry = buf.slice(i); // copy the remainder (the source PCM is freed after this returns)
    },
    finish(): ArrayBuffer {
      if (carry.length) encode(carry);
      const tail = enc.flush();
      if (tail.length) parts.push(new Uint8Array(tail));
      let len = 0;
      for (const p of parts) len += p.length;
      const out = new Uint8Array(len);
      let o = 0;
      for (const p of parts) {
        out.set(p, o);
        o += p.length;
      }
      return out.buffer;
    },
  };
}

const pad4 = (n: number): string => String(n).padStart(4, '0');

/** The only track file names a recording writes (`generateChapterAudioInner`), and so the only ones a manifest read
 *  from disk may name — see `readManifest`. */
const TRACK_FILE = /^ch\d{4}\.(mp3|wav)$/;

interface ChapterTags {
  title?: string;
  album?: string;
  author?: string;
  trackNumber: number;
  trackTotal?: number;
  voiceLabel?: string;
  durationMs: number;
  cover: ArrayBuffer | null;
}

/** Prepend an ID3v2 tag (standard recording frames + APIC cover art) to a chapter MP3, so external
 *  players show title/author/album/track/cover. Best-effort: any failure returns the untagged (but
 *  valid) MP3 rather than aborting the recording. `browser-id3-writer` is lazy-loaded. */
async function tagMp3Chapter(buf: ArrayBuffer, m: ChapterTags, log?: (msg: string) => void): Promise<ArrayBuffer> {
  try {
    const { ID3Writer } = await import('browser-id3-writer');
    const w = new ID3Writer(buf);
    if (m.title) w.setFrame('TIT2', m.title); // Title = chapter
    if (m.album) w.setFrame('TALB', m.album); // Album = book
    if (m.author) {
      w.setFrame('TPE1', [m.author]); // Artist = author
      w.setFrame('TPE2', m.author); // Album artist = author
    }
    w.setFrame('TRCK', m.trackTotal ? `${m.trackNumber}/${m.trackTotal}` : String(m.trackNumber));
    w.setFrame('TCON', ['Recording']); // Genre
    if (m.voiceLabel) w.setFrame('TCOM', [m.voiceLabel]); // Composer = voice (narrator stand-in)
    if (m.durationMs > 0) w.setFrame('TLEN', m.durationMs);
    w.setFrame('TSSE', 'Orbis Reader'); // Encoder
    w.setFrame('COMM', {
      language: 'eng',
      description: '',
      text: `Recorded with Orbis Reader${m.voiceLabel ? ` · voice: ${m.voiceLabel}` : ''}`,
    });
    if (m.cover) {
      try {
        w.setFrame('APIC', { type: 3, data: m.cover, description: 'Cover' }); // 3 = front cover
      } catch (e) {
        log?.(`cover art skipped (unrecognized image): ${String(e)}`); // keep the other tags
      }
    }
    return w.addTag(); // returns the new ArrayBuffer with the ID3v2 tag prepended
  } catch (e) {
    log?.(`id3 tagging failed — writing untagged mp3: ${String(e)}`);
    return buf;
  }
}

/** Write an Extended M3U playlist for a recorded edition: one #EXTINF (duration + title) + relative
 *  filename per chapter, in spine order. UTF-8, no BOM (so #EXTM3U stays the first line). Called on
 *  run completion; recorded (single-voice) editions only. */
export async function writeEditionPlaylist(app: App, audioDir: string, bookBasename: string): Promise<void> {
  const m = await readManifest(app, normalizePath(`${audioDir}/manifest.json`));
  if (!m || !m.chapters.length) return;
  const lines = ['#EXTM3U'];
  for (const c of [...m.chapters].sort((a, b) => a.index - b.index)) {
    const secs = Math.max(0, Math.round(c.duration || 0));
    // One line: a line break in a book's contents label would start a playlist entry of the book's choosing.
    const title = (c.title ?? '').replace(/\s+/g, ' ').trim() || `Section ${c.index + 1}`;
    lines.push(`#EXTINF:${secs},${title}`);
    lines.push(c.audioFile);
  }
  await app.vault.adapter.write(normalizePath(`${audioDir}/${bookBasename}.m3u`), `${lines.join('\n')}\n`);
}

/** Server (OpenAI-compatible /v1/audio/speech) synth — requests WAV per sentence, can parallelize. */
export function createServerSynth(
  serverUrl: string,
  voice: string,
  model: string,
  concurrency: number,
  log?: (msg: string) => void,
  pronouncer?: Pronouncer | null
): ChapterSynth {
  const endpoint = `${serverUrl.replace(/\/+$/, '')}/v1/audio/speech`;
  return {
    concurrency: Math.max(1, Math.min(8, Math.round(concurrency))),
    failure: null as SynthFailure | null,
    // All three assigned by `RecordingGenerator.run` — see `ChapterSynth`.
    signal: null as { cancelled: boolean; paused?: boolean } | null,
    waitWhilePaused: null as (() => Promise<void>) | null,
    onStuck: null as (() => void) | null,
    onHidden: null as (() => void) | null,
    onVisible: null as (() => void) | null,
    async synth(text: string): Promise<WavData | null> {
      // Same speech-normalized text the live path speaks ("Chapter I" → "Chapter 1"). Built once, outside the
      // retry loop — a second attempt must send the same bytes, and normalizing is not free.
      const body = JSON.stringify({
        model,
        input: normalizeForSpeech(text, pronouncer),
        voice,
        response_format: 'wav',
      });

      /**
       * One request, and what it settled.
       *
       * `done` carries the answer, including a `null` that means "unusable audio" — a definitive outcome, not a
       * reason to ask again. `retry` is the only result the loop below acts on.
       */
      const attemptOnce = async (
        label: string,
        abandon: Promise<null>
      ): Promise<{ done: true; wav: WavData | null } | { done: false }> => {
        // Logged on BOTH sides of the request, because a server that accepts the connection and never answers
        // leaves no other trace: a `→` with no matching `←` is that, on sight. The timeout writes the missing half,
        // but the pairing is still what makes a stall readable at a glance.
        const t0 = Date.now();
        const ceiling = synthTimeoutMs(text.length);
        log?.(
          `→ POST ${endpoint} (${text.length} chars, voice=${voice}, wait ≤${Math.round(ceiling / 1000)}s)${label}`
        );
        try {
          /**
           * **A request the background already killed is not worth waiting out.**
           *
           * Android suspends the WebView and the connection with it, so a request in flight when the app goes
           * away is dead — but nothing tells us, and the timeout is up to three minutes. Waiting it out would show a
           * reader switching away and back a readout frozen for half a minute with the footer offering "Pause",
           * which reads as a broken button rather than as waiting.
           *
           * `abandon` resolves the moment the app comes back from a trip away, so the retry starts immediately.
           * It resolves to null, which is the same "no answer" the timeout produces — and the loop forgives it,
           * because being switched away from is not the recording's fault.
           */
          const res = await Promise.race([
            // `throw: false`, so a refusal reaches `serverStatusOutcome` below with its status: thrown, a 400 for an
            // unknown voice was reported as a server that could not be reached.
            withTimeout(
              requestUrl({ url: endpoint, method: 'POST', contentType: 'application/json', body, throw: false }),
              ceiling
            ),
            abandon,
          ]);
          if (!res) {
            log?.(`✗ no answer in ${Date.now() - t0}ms — abandoning this request`);
            this.failure = 'unreachable';
            return { done: false };
          }
          log?.(`← ${res.status} · ${res.arrayBuffer?.byteLength ?? 0}B · ${Date.now() - t0}ms`);
          if (res.status < 200 || res.status >= 300) {
            log?.(`server ${res.status}: ${String(res.text ?? '').slice(0, 120)}`);
            const outcome = serverStatusOutcome(res.status);
            this.failure = outcome.failure;
            return outcome.retry ? { done: false } : { done: true, wav: null };
          }
          const wav = parseWav(res.arrayBuffer);
          if (!wav) {
            log?.(`could not parse WAV (${res.arrayBuffer.byteLength} bytes)`);
            this.failure = 'unreadable-audio';
          }
          return { done: true, wav };
        } catch (e) {
          // `requestUrl` throws for a name that does not resolve, a refused connection, a bad certificate — all of
          // which are "the server is not answering" from here. A phone that lost its radio for a moment is the one
          // worth asking again.
          log?.(`✗ server request failed after ${Date.now() - t0}ms: ${String(e)}`);
          this.failure = 'unreachable';
          return { done: false };
        }
      };

      let attempt = 0;
      // Counted per sentence, so a finished sentence starts the count again: the budget below is for consecutive
      // losses, and a reader who switches apps twenty times across a long recording is never closer to failing than
      // one who switches once.
      let consecutiveBackgroundLosses = 0;
      while (attempt < SERVER_SYNTH_ATTEMPTS) {
        /**
         * Nothing can reach the network from a suspended WebView, so don't spend an attempt finding that out —
         * and say so, rather than freezing the readout with no explanation.
         *
         * `onVisible` lifts the wait on return unless it has been made to stick (see `onStuck`) or the reader
         * paused it themselves, which is why the pause gate below is consulted afterwards and separately.
         */
        if (appHidden()) {
          this.onHidden?.();
          await whenAppVisible(this.signal ?? undefined, log);
          this.onVisible?.();
        }
        // A pause takes hold here, between requests — the only boundary where there is nothing in flight to
        // abandon. Checked after the visibility gate, since a reader can pause while the app is away.
        await this.waitWhilePaused?.();
        if (appHidden()) {
          this.onHidden?.();
          await whenAppVisible(this.signal ?? undefined, log);
          this.onVisible?.();
        }
        if (this.signal?.cancelled) return null;
        attempt++;

        /**
         * Did this attempt straddle a trip to the background?
         *
         * Watched during the request rather than asked afterwards: by the time a failure is in hand the app is
         * visible again, because the reader coming back is what let this code run at all.
         */
        let wentAway = false;
        let abandonNow: () => void = () => {};
        // Resolves when the app comes BACK from a trip away — see `attemptOnce`. Never resolves otherwise, so a
        // request that is merely slow is left to the timeout.
        const abandon = new Promise<null>((resolve) => {
          abandonNow = () => resolve(null);
        });
        const watchVisibility = (): void => {
          if (appHidden()) {
            wentAway = true;
            this.onHidden?.();
            return;
          }
          if (!wentAway) return;
          this.onVisible?.();
          abandonNow();
        };
        // One document for the listener's whole life, so it comes off the one it went on.
        const doc = activeDocument;
        doc.addEventListener('visibilitychange', watchVisibility);
        let result: { done: true; wav: WavData | null } | { done: false };
        try {
          result = await attemptOnce(attempt > 1 ? ` · attempt ${attempt}` : '', abandon);
        } finally {
          doc.removeEventListener('visibilitychange', watchVisibility);
        }
        if (result.done) return result.wav;

        if (!wentAway) continue; // a real failure, and it costs a real attempt

        /**
         * **An app switch is not a fault of the recording's, so it does not spend an attempt.**
         *
         * Under the all-or-nothing rule the alternative is losing half an hour of audio because someone went to
         * copy a log. Given back rather than counted — but not indefinitely, and the bound is the interesting
         * part: `hidden` is also what a phone reports when the SCREEN goes off, and no API distinguishes that from
         * an app switch. Forgiving without limit would mean a phone face-down beside a dead server retrying for
         * ever, never progressing and never reporting anything.
         *
         * So after a few in a row with nothing landing between them, the run PAUSES instead of failing the track.
         * Waiting for the reader is the right answer to "I cannot reach the network": the work already done is
         * kept, and they resume when they and their phone are back.
         */
        attempt--;
        consecutiveBackgroundLosses++;
        if (consecutiveBackgroundLosses < BACKGROUND_LOSSES_BEFORE_PAUSE) {
          log?.(
            `↩ the app was in the background for that one — not counting it against the retries ` +
              `(${consecutiveBackgroundLosses}/${BACKGROUND_LOSSES_BEFORE_PAUSE} before pausing)`
          );
          continue;
        }
        if (this.onStuck) {
          log?.(`${consecutiveBackgroundLosses} requests lost to the background in a row — pausing the run`);
          consecutiveBackgroundLosses = 0;
          this.onStuck();
          continue; // the pause gate at the top of the loop is what actually holds us
        }
        // No run to pause (a synth used outside a run): fall back to spending the attempt, so this cannot spin.
        attempt++;
      }
      log?.(`✗ giving up on this sentence after ${SERVER_SYNTH_ATTEMPTS} attempt(s)`);
      return null;
    },
    dispose() {},
  };
}

/** On-device Piper synth — one warmed worker, single-threaded. `generator` is created (and its model
 *  downloaded) by the caller; dispose() terminates it. */
export function createPiperSynth(
  generator: PiperGenerator,
  log?: (msg: string) => void,
  pronouncer?: Pronouncer | null
): ChapterSynth {
  return {
    concurrency: 1,
    failure: null as SynthFailure | null,
    signal: null as { cancelled: boolean; paused?: boolean } | null,
    waitWhilePaused: null as (() => Promise<void>) | null,
    onStuck: null as (() => void) | null,
    onHidden: null as (() => void) | null,
    onVisible: null as (() => void) | null,
    async synth(text: string): Promise<WavData | null> {
      // Pause applies here too. On-device synthesis has no network to lose to the background, so there is nothing
      // to forgive and no `onStuck` case — but Pause is the reader's control and must work for either method.
      await this.waitWhilePaused?.();
      if (this.signal?.cancelled) return null;
      // Both sides, same reason as the server synth: a worker that never posts back is silent otherwise.
      const t0 = Date.now();
      log?.(`→ piper (${text.length} chars)`);
      try {
        const { pcm, sampleRate } = await generator.synth(normalizeForSpeech(text, pronouncer));
        log?.(`← piper ${pcm.length} samples · ${Date.now() - t0}ms`);
        return { sampleRate, channels: 1, bitsPerSample: 16, pcm: floatToInt16(pcm) };
      } catch (e) {
        log?.(`piper synth failed after ${Date.now() - t0}ms: ${String(e)}`);
        this.failure = 'device-voice';
        return null;
      }
    },
    dispose() {
      generator.dispose();
    },
  };
}

/** Piper returns Float32 samples (-1..1); the MP3 encoder wants 16-bit little-endian PCM bytes. */
function floatToInt16(f32: Float32Array): Uint8Array {
  const i16 = new Int16Array(f32.length);
  for (let i = 0; i < f32.length; i++) {
    const s = Math.max(-1, Math.min(1, f32[i]));
    i16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return new Uint8Array(i16.buffer);
}

/**
 * Generate one chapter (spine section) as a single concatenated WAV + merge it
 * into `<audioDir>/manifest.json`. Returns generation stats, or null if the
 * section can't be read / produced no audio.
 */
export async function generateChapterAudio(opts: GenerateChapterOpts): Promise<GenerateResult | null> {
  const { sections, sectionIndex } = opts;
  const section = sections[sectionIndex];
  if (!section?.createDocument) {
    opts.log?.(`section ${sectionIndex} has no createDocument`);
    return null;
  }

  /**
   * A stall reporter, because everything in here is an `await` and a stalled one logs nothing at all.
   *
   * The dialog shows "Starting…" until the first sentence comes back, so any of these hanging looks
   * identical from outside: reading the section out of the book, a synth request with no reply (Obsidian's
   * `requestUrl` takes no timeout), or a vault write. Naming the stage every 15 seconds turns "stuck" into
   * "stuck HERE", which is the difference between a diagnosis and a guess.
   */
  const startedAt = Date.now();
  let stage = 'reading the section from the book';
  // Only when the stage has not moved since the last tick — i.e. two ticks in the same place. Reporting the
  // stage unconditionally would narrate a perfectly healthy run: with a server averaging several seconds per
  // sentence, every tick finds one in flight. A stall is the absence of change, so that is what this has to test.
  let reported: string | null = null;
  const watchdog = window.setInterval(() => {
    const secs = Math.round((Date.now() - startedAt) / 1000);
    if (reported === stage) opts.log?.(`⏳ still ${stage} after ${secs}s`);
    reported = stage;
  }, 15_000);
  try {
    return await generateChapterAudioInner(opts, section, (s) => {
      stage = s;
    });
  } finally {
    window.clearInterval(watchdog);
  }
}

/**
 * The half-open range of a section's reading units this chapter covers, `[from, to)`.
 *
 * A section with no anchors — an ordinary book, one file per chapter — is the whole thing. Otherwise the section's
 * anchors are resolved together and normalized by the shared rule (see `chapterBoundaries`): the first chapter of a
 * file takes everything above its own anchor, starts never run backwards, and a chapter whose anchor resolved to
 * nothing records nothing rather than swallowing its neighbor's text.
 */
function chapterUnitRange(
  units: ReadingUnit[],
  doc: Document,
  opts: { sectionAnchors?: readonly (string | null)[]; anchorAt?: number }
): [number, number] {
  const anchors = opts.sectionAnchors;
  const at = opts.anchorAt ?? 0;
  if (!anchors?.length || anchors.length === 1 || at < 0 || at >= anchors.length) return [0, units.length];
  const raw = anchors.map((a) => {
    if (!a) return 0;
    const idx = unitIndexForAnchor(units, doc, a);
    return idx < 0 ? undefined : idx;
  });
  const starts = chapterBoundaries(raw, units.length);
  return [starts[at], at + 1 < starts.length ? starts[at + 1] : units.length];
}

/**
 * The sentences one chapter records — the whole decision about what lands in its MP3, in one place.
 *
 * Exported because it is the layer a bug could live in: which stretch of a shared file belongs to this chapter. An
 * empty result means a cover, a title page or a converter's blank split file — `getReadingUnits` already drops
 * blocks with nothing to say, so emptiness here needs no filter of its own — and the caller reports that as its own
 * outcome rather than as failed audio.
 */
export function chapterUnits(
  sectionUnits: ReadingUnit[],
  doc: Document,
  opts: { sectionAnchors?: readonly (string | null)[]; anchorAt?: number; slice?: { index: number; count: number } }
): ReadingUnit[] {
  const [from, to] = partUnitRange(sectionUnits, doc, opts);
  return sectionUnits.slice(from, to);
}

/**
 * The half-open reading-unit range one PART covers, slice narrowing included.
 *
 * Exported because two things must agree about it: the MP3 the recorder writes, and the stretch the progress bar
 * measures. A bar taking its boundaries from the raw contents would span all four tracks of a chapter divided into
 * four — the row saying 26 minutes and the player 1h 42m.
 */
export function partUnitRange(
  sectionUnits: ReadingUnit[],
  doc: Document,
  opts: { sectionAnchors?: readonly (string | null)[]; anchorAt?: number; slice?: { index: number; count: number } }
): [number, number] {
  const [from, to] = chapterUnitRange(sectionUnits, doc, opts);
  const slice = opts.slice;
  if (!slice || slice.count < 2) return [from, to];
  /**
   * One slice of a chapter too long to be a single track — see `splitLongParts`.
   *
   * Divided in UNITS rather than by character position, which is what puts every cut on a sentence boundary for
   * free: a reading unit IS a sentence. Even division, so the last slice is no shorter than the first; the length
   * shown beside the row divides the same range by characters, so the two agree to within a sentence.
   */
  const total = to - from;
  const step = total / slice.count;
  return [
    from + Math.round(step * slice.index),
    slice.index + 1 === slice.count ? to : from + Math.round(step * (slice.index + 1)),
  ];
}

/**
 * What a finished chapter attempt actually was.
 *
 * Every one of these ends with no new audio except `recorded`. Telling them apart by asking whether any segments
 * came back would make a cover page, which correctly produces nothing, indistinguishable from a chapter whose every
 * sentence the server rejected — and an ordinary book's run would end by reporting several failures for its front
 * matter. Pure and exported so the distinction has a test.
 */
export type ChapterOutcome = 'recorded' | 'empty' | 'failed' | 'cancelled' | 'unreadable';

export function classifyChapter(result: GenerateResult | null): ChapterOutcome {
  if (!result) return 'unreadable'; // the section could not be opened at all
  if (result.cancelled) return 'cancelled';
  if (result.noText) return 'empty'; // nothing to say — not a fault
  // **Every sentence, or none of it.** `segments > 0` alone would call a track with a hole in it recorded, which is
  // the report a reader acts on: they see it listed as done and find out by listening. The pipeline discards such
  // a track rather than writing it, so a partial success has nothing to show for itself and is a failure here too.
  if (result.failed > 0) return 'failed';
  return result.segments > 0 ? 'recorded' : 'failed';
}

async function generateChapterAudioInner(
  opts: GenerateChapterOpts,
  section: RawSection,
  setStage: (stage: string) => void
): Promise<GenerateResult | null> {
  const { app, sectionIndex, voice } = opts;
  const model = opts.model ?? 'kokoro';
  const engineKind = opts.engineKind;
  if (!section.createDocument) return null;

  const t0 = Date.now();
  const doc = await section.createDocument();
  opts.log?.(`document ready in ${Date.now() - t0}ms`);
  setStage('segmenting the chapter into sentences');
  const sectionUnits = getReadingUnits(doc);
  const units = chapterUnits(sectionUnits, doc, opts);

  // Nothing to say: a cover, a title page, a copyright notice, a blank file a converter's flow split left
  // behind. Answered here, before the folder is made and before a synth is troubled, and answered as its own
  // outcome rather than as an absence of audio — see `GenerateResult.noText`.
  if (!units.length) {
    section.unload?.();
    opts.log?.(`chapter ${opts.chapterIndex}: no text to record — skipped`);
    return { segments: 0, failed: 0, durationSec: 0, fileBytes: 0, noText: true };
  }

  const base = section.cfi ?? cfiFake.fromIndex(sectionIndex);
  setStage('creating the audio folder');
  await ensureFolder(app, opts.audioDir);
  const total = units.length;
  opts.log?.(
    `chapter ${opts.chapterIndex} (section ${sectionIndex}: ${total} of ${sectionUnits.length} units): ` +
      `${engineKind} · voice=${voice} · model=${model}`
  );

  // MP3 (the normal path) streams into `mp3` per sentence — nothing raw is retained. A WAV fallback
  // (unexpected non-mono/16-bit audio) keeps its PCM in `chunks` to concatenate at the end.
  const chunks: Uint8Array[] = [];
  const segments: RecordingSegment[] = [];
  let fmt: { sampleRate: number; channels: number; bitsPerSample: number } | null = null;
  let mp3: Mp3Stream | null = null;
  let pcmBytes = 0; // cumulative PCM byte count — drives segment start times (and WAV concat size)
  let failed = 0;
  const times: number[] = [];

  // Bounded-concurrency request pipeline: keep `conc` sentence requests in flight but consume the
  // results strictly in reading order, so segment start times, format detection, and the streaming
  // encoder all see sentences in sequence (peak memory stays ~`conc` sentences + the growing MP3).
  const conc = opts.synth.concurrency;
  if (conc > 1) opts.log?.(`requests in parallel: ${conc}`);

  // Synthesize one sentence (server request or on-device Piper), timing it for the speed samples.
  const fetchUnit = async (idx: number): Promise<{ wav: WavData | null; elapsed: number }> => {
    const t0 = Date.now();
    const wav = await opts.synth.synth(units[idx].text);
    return { wav, elapsed: Date.now() - t0 };
  };

  const inflight = new Map<number, ReturnType<typeof fetchUnit>>();
  let nextToLaunch = 0;
  const topUp = (): void => {
    while (inflight.size < conc && nextToLaunch < total && !opts.signal?.cancelled) {
      inflight.set(nextToLaunch, fetchUnit(nextToLaunch));
      nextToLaunch++;
    }
  };
  setStage(`waiting for the first of ${conc} synth request(s)`);
  topUp();

  for (let i = 0; i < total; i++) {
    if (opts.signal?.cancelled) {
      opts.log?.(`cancelled at ${i}/${total}`);
      break;
    }
    const pending = inflight.get(i);
    if (!pending) break; // window drained (cancelled) — no more results coming
    setStage(`waiting for sentence ${i}/${total} (${inflight.size} in flight)`);
    const r = await pending;
    inflight.delete(i);
    times.push(r.elapsed);
    const wav = r.wav;
    if (!wav) {
      /**
       * **One sentence short is not a recording.** Counting the failure and carrying on would write a chapter with a
       * hole where a sentence should be and report it as recorded — a thirty-minute track that stops half way
       * through, indistinguishable from a good one. There is no way to play around a missing sentence and no way to
       * notice it except by listening.
       *
       * Abandoned here rather than at the end: the sentence has already been retried (see
       * `SERVER_SYNTH_ATTEMPTS`), so the remaining sentences would be twenty minutes of synthesis, and a slow
       * server's load, spent on audio that is going to be discarded.
       */
      failed++;
      opts.log?.(`sentence ${i}/${total} failed after ${SERVER_SYNTH_ATTEMPTS} attempt(s) — abandoning this track`);
      break;
    } else {
      if (!fmt) {
        fmt = { sampleRate: wav.sampleRate, channels: wav.channels, bitsPerSample: wav.bitsPerSample };
        if (fmt.channels === 1 && fmt.bitsPerSample === 16) mp3 = await createMp3Stream(fmt.sampleRate, MP3_KBPS);
      }
      const blockAlign = (fmt.channels * fmt.bitsPerSample) / 8;
      const start = pcmBytes / blockAlign / fmt.sampleRate;
      const dur = wav.pcm.length / blockAlign / fmt.sampleRate;
      let cfi = '';
      try {
        cfi = cfiJoinIndir(base, cfiFromRange(units[i].range));
      } catch {
        /* no cfi → still plays, just no sync point */
      }
      if (mp3)
        mp3.push(wav.pcm); // stream-encode now; the raw PCM is freed after this
      else chunks.push(wav.pcm); // WAV fallback: retain PCM to concatenate at the end
      pcmBytes += wav.pcm.length;
      segments.push({ cfi, start, dur, text: units[i].text });
      // Structure-aware inter-clip pause, baked in as silence so the MP3 cadences like the live
      // engines: a jittered gap after every sentence (variable, not metronomic), a beat longer at a
      // paragraph break, and a rest at the chapter end. The gap sits between segments (each segment's
      // `dur` is speech only), so the highlight holds on a sentence through its pause, like live.
      const next = units[i + 1];
      const kind: PauseKind = !next ? 'chapter' : next.block !== units[i].block ? 'paragraph' : 'sentence';
      const pauseSamples = Math.round((interClipPauseMs(kind) / 1000) * fmt.sampleRate);
      if (pauseSamples > 0) {
        const silence = new Uint8Array(pauseSamples * blockAlign);
        if (mp3) mp3.push(silence);
        else chunks.push(silence);
        pcmBytes += silence.length;
      }
    }
    opts.onProgress?.(i + 1, total);
    if ((i + 1) % 25 === 0) {
      const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
      const held = mp3 ? `${(mp3.bytes() / 1e6).toFixed(1)}MB mp3` : `${(pcmBytes / 1e6).toFixed(1)}MB pcm`;
      opts.log?.(`… ${i + 1}/${total} · avg ${avg}ms/sentence · ${held} held`);
    }
    topUp(); // a slot freed — launch the next request
  }
  section.unload?.();

  if (opts.signal?.cancelled) {
    // Cancelled mid-chapter — write nothing. A chapter is all-or-nothing, so resume regenerates it
    // from scratch (it has no file / manifest entry).
    opts.log?.(`chapter ${opts.chapterIndex}: cancelled — partial discarded`);
    return { segments: 0, failed, durationSec: 0, fileBytes: 0, cancelled: true };
  }

  /**
   * A track is all or nothing, so anything short of every sentence is discarded.
   *
   * `failed > 0` covers the abandoned-mid-track case above; `!fmt || !segments.length` covers a track where
   * nothing came back at all. Both write no file and no manifest entry, and both clear anything an earlier
   * attempt left at this index — otherwise a track that succeeded once and failed on a re-record would keep
   * playing its old audio while the run reported it as failed.
   */
  if (failed > 0 || !fmt || !segments.length) {
    opts.log?.(`chapter ${opts.chapterIndex}: discarded — ${segments.length} recorded, ${failed} failed`);
    await deleteChapterAudio(app, opts.audioDir, opts.chapterIndex);
    // The synth knows why it kept returning nothing; the dialog will say it — see `SynthFailure`.
    return { segments: 0, failed, durationSec: 0, fileBytes: 0, failure: opts.synth.failure ?? null };
  }

  // Finalize the chapter. MP3 (mono 16-bit) was stream-encoded per sentence — just flush it.
  // A WAV fallback (unexpected non-mono/16-bit audio) concatenates its retained PCM here.
  const encStart = Date.now();
  let audioBuf: ArrayBuffer;
  let format: string;
  if (mp3) {
    audioBuf = mp3.finish();
    format = 'mp3';
  } else {
    const pcm = new Uint8Array(pcmBytes);
    let ofs = 0;
    for (const c of chunks) {
      pcm.set(c, ofs);
      ofs += c.length;
    }
    audioBuf = buildWav(pcm, fmt.sampleRate, fmt.channels, fmt.bitsPerSample);
    format = 'wav';
    opts.log?.(`non-mono/16-bit audio (channels=${fmt.channels}, bits=${fmt.bitsPerSample}) — storing WAV`);
  }
  const encMs = Date.now() - encStart;
  // Whole-file duration (includes the embedded inter-clip silence, incl. the trailing chapter rest).
  const blockAlign = (fmt.channels * fmt.bitsPerSample) / 8;
  const durationSec = pcmBytes / blockAlign / fmt.sampleRate;
  // Prepend ID3 tags (+ cover art) so the MP3 shows title/author/track/etc. in external players.
  if (format === 'mp3') {
    audioBuf = await tagMp3Chapter(
      audioBuf,
      {
        title: opts.chapterTitle,
        album: opts.bookTitle,
        author: opts.bookAuthor,
        trackNumber: opts.chapterIndex + 1,
        trackTotal: opts.trackTotal,
        voiceLabel: opts.voiceLabel,
        durationMs: Math.round(durationSec * 1000),
        cover: opts.coverData ?? null,
      },
      opts.log
    );
  }
  const audioFile = `ch${pad4(opts.chapterIndex)}.${format}`;
  await app.vault.adapter.writeBinary(normalizePath(`${opts.audioDir}/${audioFile}`), audioBuf);

  // Merge chapter into the book manifest.
  const manifestPath = normalizePath(`${opts.audioDir}/manifest.json`);
  const existing = await readManifest(app, manifestPath);
  const manifest: RecordingManifest = existing ?? {
    version: MANIFEST_VERSION,
    book: opts.bookBasename,
    engine: { kind: engineKind, model, voice, format },
    createdAt: opts.createdAt,
    chapters: [],
  };
  manifest.engine = { kind: engineKind, model, voice, format };
  manifest.chapters = manifest.chapters.filter((c) => c.index !== opts.chapterIndex);
  manifest.chapters.push({
    index: opts.chapterIndex,
    ...(opts.chapterHref ? { href: opts.chapterHref } : {}),
    ...(opts.partCount && opts.partCount > 1 ? { partCount: opts.partCount } : {}),
    title: opts.chapterTitle,
    audioFile,
    duration: durationSec,
    fileBytes: audioBuf.byteLength,
    voice,
    model,
    // Only ever written here, and only past the all-or-nothing guard above: reaching this line IS the claim that
    // every sentence of this track was recorded. See `RecordingChapter.complete`.
    complete: true,
    segments,
  });
  manifest.chapters.sort((a, b) => a.index - b.index);
  await app.vault.adapter.write(manifestPath, JSON.stringify(manifest, null, 2));

  const sorted = [...times].sort((a, b) => a - b);
  const avg = Math.round(times.reduce((a, b) => a + b, 0) / (times.length || 1));
  opts.log?.(
    `chapter ${opts.chapterIndex} done: ${segments.length} ok / ${failed} failed · ${durationSec.toFixed(0)}s audio · ` +
      `${(audioBuf.byteLength / 1e6).toFixed(1)}MB ${format} · encode ${encMs}ms · ` +
      `req avg ${avg}ms min ${sorted[0] ?? 0}ms max ${sorted[sorted.length - 1] ?? 0}ms`
  );
  return { segments: segments.length, failed, durationSec, fileBytes: audioBuf.byteLength };
}
