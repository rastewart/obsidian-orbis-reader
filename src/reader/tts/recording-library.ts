// What recordings exist for this book, and the small operations that change what exists.
//
// **Apart from `OrbisReaderView`**, although the reader is what a recording belongs to. None of it needs the
// reader: it reads edition manifests off the vault, describes them, and renames or deletes one. What it does need
// is seven things about the open book, which is `RecordingLibraryCtx` below — small enough to be worth passing
// rather than handing over the whole view.
//
// The generation RUN stays on the view: it owns mutable progress state, a toolbar chip and the
// notice-and-cancel lifecycle, and it wants a bigger surface than this. See docs/design/reader-architecture.md.

import type { App } from 'obsidian';
import type { ChapterPart } from '../../book-chapters';
import { t } from '../../i18n';
import type { LiveVoiceOverride } from '../TtsHost';
import { type GenConfig, genIdentity, readGenConfig } from './gen-config';
import { isOrbisVoiceDownloaded } from './PiperEngine';
import { NARRATION_WPM } from './pacing';
import type { RecordedChapter } from './recorded-audio';
import { deleteChapterAudio, isCompleteChapter, type RecordingManifest } from './recording';
import {
  clearActiveEdition,
  deleteEdition,
  type EditionMeta,
  type EditionsIndex,
  editionDir,
  editionKey,
  listEditions,
  loadEditionChapter,
  type MixLiveVoice,
  type MixManifest,
  pruneEmptyEditions,
  pruneMixPointers,
  readEditionManifest,
  readMix,
  setActiveEdition,
  setEditionLabel,
} from './recording-editions';
import type { RecordingSectionStatus, RecordingStatus } from './recording-generator';
import { orbisVoiceOrDefault, splitPiperVoice } from './voice-catalog';
import type { RecordingMethod } from './voice-picker';
import {
  createPiperVoiceProvider,
  createServerVoiceProvider,
  describeEditionVoice,
  shortVoiceLabel,
} from './voice-providers';
import { findSystemVoice, WebSpeechEngine } from './WebSpeechEngine';

/**
 * What this module needs to know about the open book. Seven members, and each earns its place:
 * the vault, where this book's audio lives, the chapter shape a status is reported against, the rate a preview
 * plays at, and the two seams — reloading playback after the library changes under it, and the key of a run in
 * flight, which is what stops an edition being pruned while it is still being written.
 */
/** One row of the Manage-recordings library list: a voice edition or a mix, with its
 *  recorded/assigned-chapter count, the book total, and (voices only) total bytes. */
export interface RecordingLibraryItem {
  key: string;
  label: string;
  kind: 'voice' | 'mix';
  /** Recorded chapters (voice) or assigned chapters (mix). */
  count: number;
  total: number;
  bytes: number;
  /**
   * A NAMED recording's voice, short ("Amy"); absent for a mix, and for a recording named by its voice, where the label
   * already says it. Renaming a recording replaced its voice everywhere it was shown, leaving nothing to say what it
   * sounds like.
   */
  voice?: string;
  /**
   * The one that plays. Carried from `listEditions` so the library list can show it; otherwise the only place a
   * reader could see their own selection would be a dropdown inside another dialog.
   */
  active: boolean;
}

export interface RecordingLibraryCtx {
  readonly app: App;
  /** This book's audio folder, or null when there is no book. */
  recordedAudioDir(): string | null;
  /** The book's chapter parts, in reading order — what a status counts by. */
  chapterParts(): readonly ChapterPart[];
  chapterWords(): readonly number[];
  chapterWordsReady(): boolean;
  ttsRate(): number;
  bookSections: Array<{ id: string }>;
  /** Tell the player the recorded audio under it has changed. */
  reloadPlayback(): Promise<void>;
  /** The edition a run is currently writing into, protected from empty-edition pruning until it has chapters. */
  activeRunKey(): string | null;
}

/** Per-section generation status for the management modal: real duration/size for generated
 *  chapters, word-count estimates for the rest, plus the per-chapter voice + voices used. */
export async function recordingStatus(ctx: RecordingLibraryCtx, viewedKey?: string): Promise<RecordingStatus> {
  const base = ctx.recordedAudioDir();
  if (!base)
    return {
      sections: [],
      totalBytes: 0,
      voicesUsed: [],
      editions: [],
      viewedEditionKey: null,
      activeEditionKey: null,
    };
  // No prune here — it reads every edition's manifest, which slows the modal's first paint on
  // mobile. Empty (cancelled-before-ch1) editions are cleaned up at run-end and when the gear
  // popup opens, so they don't linger.
  const idx = await listEditions(ctx.app, base);
  // Show the requested edition (a prospective "add another voice" one may not exist yet → all
  // chapters read as ungenerated), else the active one.
  const viewedEditionKey = viewedKey ?? idx.active;
  // A mix resolves each chapter from its source (voice) edition — see mixStatus.
  const mix = viewedEditionKey ? await readMix(ctx.app, base, viewedEditionKey) : null;
  if (mix && viewedEditionKey) return mixStatus(ctx, base, viewedEditionKey, mix, idx);
  const m = viewedEditionKey ? await readEditionManifest(ctx.app, base, viewedEditionKey) : null;
  // Complete tracks only — a half-written one is offered for recording again rather than listed as done.
  const byIndex = new Map((m?.chapters ?? []).filter(isCompleteChapter).map((c) => [c.index, c]));
  // One row per CHAPTER, which on a book that keeps eighty chapters in seven files is eighty rows and not seven —
  // the same breakdown the contents panel and the player's ⏭ show. See `bookChapters`.
  const chapters = ctx.chapterParts();
  const words = ctx.chapterWords();
  const measured = ctx.chapterWordsReady();
  const MP3_BYTES_PER_SEC = 6000; // 48 kbps mono
  const sections = chapters.map((chapter, i) => {
    const ch = byIndex.get(i);
    // Estimated from the word count, which is what the row's length is estimated from too — so a row that
    // claims a length is a row with something to record. Every chapter counts as having text until the index
    // has been measured, so a dialog opened during the build offers the book rather than hiding it.
    const hasText = !measured || (words[i] ?? 0) > 0;
    if (ch) {
      return {
        index: i,
        label: chapter.label,
        generated: true,
        durationSec: ch.duration,
        fileBytes: ch.fileBytes ?? 0,
        estimated: false,
        hasText,
        voice: ch.voice,
      };
    }
    const durationSec = ((words[i] ?? 0) / NARRATION_WPM) * 60;
    return {
      index: i,
      label: chapter.label,
      generated: false,
      durationSec,
      fileBytes: durationSec * MP3_BYTES_PER_SEC,
      estimated: true,
      hasText,
    };
  });
  const totalBytes = sections.filter((s) => s.generated).reduce((sum, s) => sum + s.fileBytes, 0);
  const voicesUsed = [...new Set((m?.chapters ?? []).map((c) => c.voice).filter((v): v is string => !!v))];
  return {
    sections,
    totalBytes,
    model: m?.engine.model,
    voicesUsed,
    editions: idx.editions,
    viewedEditionKey,
    activeEditionKey: idx.active,
  };
}

/** Status for a MIX edition: each chapter resolves to the source (voice) edition it points at —
 *  real duration/size + a source-voice label — else it's unassigned (estimated). */
async function mixStatus(
  ctx: RecordingLibraryCtx,
  base: string,
  mixKey: string,
  mix: MixManifest,
  idx: EditionsIndex
): Promise<RecordingStatus> {
  const chapters = ctx.chapterParts();
  const words = ctx.chapterWords();
  const measured = ctx.chapterWordsReady();
  const MP3_BYTES_PER_SEC = 6000;
  const ptr = new Map(mix.chapters.map((c) => [c.index, c]));
  const srcCache = new Map<string, RecordingManifest | null>();
  const readSrc = async (key: string): Promise<RecordingManifest | null> => {
    if (!srcCache.has(key)) srcCache.set(key, await readEditionManifest(ctx.app, base, key));
    return srcCache.get(key) ?? null;
  };
  const sections: RecordingSectionStatus[] = [];
  for (let i = 0; i < chapters.length; i++) {
    const label = chapters[i].label;
    const c = ptr.get(i);
    const sm = c?.sourceKey ? await readSrc(c.sourceKey) : null;
    const found = sm?.chapters.find((x) => x.index === i);
    const ch = isCompleteChapter(found) ? found : undefined; // same rule as the recordings list — complete only
    const estDuration = ((words[i] ?? 0) / NARRATION_WPM) * 60;
    const hasText = !measured || (words[i] ?? 0) > 0; // see `RecordingSectionStatus.hasText`
    if (ch) {
      // Recorded chapter: real MP3 from the source edition.
      sections.push({
        index: i,
        label,
        generated: true,
        durationSec: ch.duration,
        fileBytes: ch.fileBytes ?? 0,
        estimated: false,
        hasText,
        voice: ch.voice,
        sourceVoice: describeEditionVoice(sm?.engine.kind ?? '', ch.voice ?? sm?.engine.voice ?? ''),
        sourceKind: 'recorded',
      });
    } else if (c?.live) {
      // Live chapter: no file — read in real time by the live engine. Assigned (has a sourceVoice
      // label) but not "generated" (nothing to preview), with an estimated length.
      sections.push({
        index: i,
        label,
        generated: false,
        durationSec: estDuration,
        fileBytes: 0,
        estimated: true,
        hasText,
        sourceVoice: describeLiveVoice(c.live, false),
        sourceKind: 'live',
      });
    } else {
      // Unassigned → plays with the default live voice, so label it as such (functionally the same
      // as an explicit "default live voice" assignment; no separate "Not assigned" state).
      sections.push({
        index: i,
        label,
        generated: false,
        durationSec: estDuration,
        fileBytes: estDuration * MP3_BYTES_PER_SEC,
        estimated: true,
        hasText,
        sourceVoice: describeLiveVoice({ kind: 'default' }, false),
        sourceKind: 'live',
      });
    }
  }
  return {
    sections,
    totalBytes: sections.filter((s) => s.generated).reduce((sum, s) => sum + s.fileBytes, 0),
    voicesUsed: [...new Set(sections.map((s) => s.sourceVoice).filter((v): v is string => !!v))],
    editions: idx.editions,
    viewedEditionKey: mixKey,
    activeEditionKey: idx.active,
  };
}

/** A mix source's name in the Source dropdown: the recording's own name with its voice, or the voice alone. */
function mixSourceLabel(name: string | undefined, voice: string): string {
  const own = name?.trim();
  return own && own !== voice ? t('recordings_modal.mix_source_named', { name: own, voice }) : voice;
}

/**
 * Voice editions (not mixes) available as sources when building a mix — {key, label, chapters} where `chapters` is
 * the set of section indices that source has actually recorded (so the mix builder only offers a chapter from a
 * source that has it). Sorted by label.
 *
 * **Labeled by the recording's name AND its voice** — "Night reads (Amy — American English, Female)". It used to say
 * the voice alone, on the grounds that composing a mix is choosing what each chapter will *sound* like; but a reader
 * who had named a recording looked for that name here and couldn't find it. An unnamed recording is named by its voice
 * (`voice-chip.ts` relies on the same fact), so it says the voice once.
 */
export async function mixSourceEditions(
  ctx: RecordingLibraryCtx
): Promise<{ key: string; label: string; chapters: number[] }[]> {
  const base = ctx.recordedAudioDir();
  if (!base) return [];
  const idx = await listEditions(ctx.app, base);
  const voices = idx.editions.filter((e) => e.kind !== 'mix');
  const out = await Promise.all(
    voices.map(async (e) => ({
      key: e.key,
      label: mixSourceLabel(e.label, describeEditionVoice(e.engine, e.voice)),
      chapters: (await readEditionManifest(ctx.app, base, e.key))?.chapters.map((c) => c.index) ?? [],
    }))
  );
  return out.sort((a, b) => a.label.localeCompare(b.label));
}

/** The distinct NON-default live voices already assigned somewhere in the mix — so reopening a mix
 *  restores those live voices to the Source dropdown's palette (default live is always present). */
export async function mixLiveVoices(ctx: RecordingLibraryCtx, mixKey: string): Promise<MixLiveVoice[]> {
  const base = ctx.recordedAudioDir();
  if (!base) return [];
  const mix = await readMix(ctx.app, base, mixKey);
  if (!mix) return [];
  const seen = new Set<string>();
  const out: MixLiveVoice[] = [];
  for (const c of mix.chapters) {
    if (!c.live || c.live.kind === 'default') continue;
    const id = c.live.kind === 'orbis' ? `orbis:${c.live.voiceId}` : `system:${c.live.voiceURI}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(c.live);
  }
  return out;
}

/** Human label for a mix's live-voice source. `withTag` appends "· live" to tell a live voice apart
 *  from a recorded edition of the same name — needed in the Source dropdown, redundant in the
 *  chapter list where each row carries a LIVE badge. */
export function describeLiveVoice(live: MixLiveVoice, withTag = true): string {
  if (live.kind === 'default') return t('recordings_modal.mix_live_default');
  const suffix = withTag ? ` · ${t('recordings_modal.mix_live_tag')}` : '';
  if (live.kind === 'orbis') return `${describeEditionVoice('piper-ondevice', live.voiceId)}${suffix}`;
  const name = findSystemVoice(live.voiceURI)?.name ?? live.voiceURI;
  return `${name}${suffix}`;
}

/** TtsHost: the live-voice override for a mix chapter pinned to a specific live voice, else null.
 *  Reads the active mix unless `key` names another one (the management modal previews the mix being
 *  edited, which needn't be the one that plays). */
export async function mixLiveVoiceFor(
  ctx: RecordingLibraryCtx,
  chapterIndex: number,
  key?: string
): Promise<LiveVoiceOverride | null> {
  const live = await mixPinnedVoice(ctx, chapterIndex, key);
  return live ? liveOverrideOf(live) : null;
}

/**
 * The voice a mix names for a track, as this device can speak it — or `null`, and the track reads in the device's
 * own live voice, the same fallback a recording's unrecorded track takes.
 *
 * **Only a voice already here counts.** Mixes sync and voice files do not, so a mix built on the Mac with Amy reaches
 * a phone that has only Libritts. The engine fetches any model it is missing, so otherwise a mix's voice would download
 * silently at the first play of its track — a pause before the sound starts, 60 MB nobody agreed to, and the same
 * again at every chapter pinned to another voice. A system voice needs Web Speech, which Android has
 * none of. `unavailable` names the voice that was passed over, so the reader can be told.
 *
 * One answer for everything that asks: the player, `canSpeakNow`, the chip and the Voice and source panel.
 */
export async function mixLiveVoiceOnDevice(
  ctx: RecordingLibraryCtx,
  chapterIndex: number
): Promise<{ voice: LiveVoiceOverride | null; unavailable?: string }> {
  const live = await mixPinnedVoice(ctx, chapterIndex);
  if (!live) return { voice: null };
  if (await mixVoiceOnDevice(ctx.app, live)) return { voice: liveOverrideOf(live) };
  const name =
    live.kind === 'orbis'
      ? orbisVoiceOrDefault(splitPiperVoice(live.voiceId).id).name
      : (findSystemVoice(live.voiceURI)?.name ?? live.voiceURI);
  return { voice: null, unavailable: name };
}

/** Whether this device can speak a voice a mix names without fetching anything — see `mixLiveVoiceOnDevice`. */
export async function mixVoiceOnDevice(app: App, live: MixLiveVoice): Promise<boolean> {
  if (live.kind === 'default') return true;
  if (live.kind === 'system') return WebSpeechEngine.isSupported();
  const dir = `${app.vault.configDir}/plugins/orbis-reader/piper-cache`;
  return isOrbisVoiceDownloaded(app.vault.adapter, dir, orbisVoiceOrDefault(splitPiperVoice(live.voiceId).id).path);
}

/** The voice the active (or `key`) mix names for a track; `null` for default, unassigned, or no mix. */
async function mixPinnedVoice(
  ctx: RecordingLibraryCtx,
  chapterIndex: number,
  key?: string
): Promise<Exclude<MixLiveVoice, { kind: 'default' }> | null> {
  const base = ctx.recordedAudioDir();
  if (!base) return null;
  const active = key ?? (await listEditions(ctx.app, base)).active;
  if (!active) return null;
  const mix = await readMix(ctx.app, base, active);
  const live = mix?.chapters.find((c) => c.index === chapterIndex)?.live;
  return !live || live.kind === 'default' ? null : live; // default / unassigned → device voice pref
}

function liveOverrideOf(live: Exclude<MixLiveVoice, { kind: 'default' }>): LiveVoiceOverride {
  if (live.kind === 'system') return { source: 'system', uri: live.voiceURI };
  const { id, speaker } = splitPiperVoice(live.voiceId);
  return { source: 'orbis', path: orbisVoiceOrDefault(id).path, sid: speaker };
}

/** Rich per-item summary for the Manage-recordings library list: each voice edition and mix with a
 *  recorded/assigned-chapter count, the book total, and (voices only) total bytes. Sorted by label. */
export async function recordingLibrary(ctx: RecordingLibraryCtx): Promise<RecordingLibraryItem[]> {
  const base = ctx.recordedAudioDir();
  if (!base) return [];
  const idx = await listEditions(ctx.app, base);
  const total = recordableTotal(ctx);
  const items = await Promise.all(
    idx.editions.map(async (e): Promise<RecordingLibraryItem> => {
      const label = e.label || describeEditionVoice(e.engine, e.voice);
      const active = e.key === idx.active;
      if (e.kind === 'mix') {
        const mix = await readMix(ctx.app, base, e.key);
        const assigned = mix?.chapters.filter((c) => c.sourceKey || c.live).length ?? 0;
        return { key: e.key, label, kind: 'mix', count: assigned, total, bytes: 0, active };
      }
      const m = await readEditionManifest(ctx.app, base, e.key);
      const count = m?.chapters.length ?? 0;
      const bytes = m?.chapters.reduce((sum, c) => sum + (c.fileBytes ?? 0), 0) ?? 0;
      const voice = describeEditionVoice(e.engine, e.voice);
      const named = label !== voice;
      return {
        key: e.key,
        label,
        kind: 'voice',
        count,
        total,
        bytes,
        active,
        ...(named ? { voice: shortVoiceLabel(voice) } : {}),
      };
    })
  );
  return items.sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * The denominator of "12 of 45 tracks", counting only what can be recorded.
 *
 * **Not the spine section count, which is wrong in both directions.** Wrong list, since a track is a part of a
 * contents chapter, and a long chapter is several; and it includes the parts that hold no text, so a fully recorded
 * book would still read as partial and never reach its own total. The recordings list and the coverage line in Voice
 * and source both count with this, so the two say the same number.
 */
function recordableTotal(ctx: RecordingLibraryCtx): number {
  return ctx.chapterWordsReady() ? ctx.chapterWords().filter((w) => w > 0).length : ctx.chapterParts().length;
}

/**
 * This book's recordings and mixes, the active one, and how many tracks each plays from a recording — for the source
 * list and the coverage line in Voice and source.
 *
 * **A mix counts the tracks it plays from a recording**, not every track it assigns: the line says *Recorded*, and a
 * track pinned to a live voice is not. A mix has no manifest of its own, so reading one (as a recording is read)
 * counted nothing and the line never showed.
 */
export async function recordingEditions(ctx: RecordingLibraryCtx): Promise<{
  editions: (EditionMeta & { recorded: number })[];
  active: string | null;
  totalChapters: number;
}> {
  const base = ctx.recordedAudioDir();
  const totalChapters = recordableTotal(ctx);
  if (!base) return { editions: [], active: null, totalChapters };
  await pruneEmptyEditions(ctx.app, base, ctx.activeRunKey()); // drop cancelled-before-ch1 ghosts
  const idx = await listEditions(ctx.app, base);
  const editions = await Promise.all(
    idx.editions.map(async (e) => ({
      ...e,
      recorded:
        e.kind === 'mix'
          ? ((await readMix(ctx.app, base, e.key))?.chapters.filter((c) => c.sourceKey).length ?? 0)
          : ((await readEditionManifest(ctx.app, base, e.key))?.chapters.length ?? 0),
    }))
  );
  return { editions, active: idx.active, totalChapters };
}

/** The enabled recording methods — feeds the shared VoicePicker (>1 → it shows a method toggle so a
 *  book can mix Piper and server editions). Only enabled methods appear; a fresh install is
 *  Piper-only. Falls back to Piper if somehow neither is enabled (always usable on-device). */
export function recordingMethods(ctx: RecordingLibraryCtx): RecordingMethod[] {
  const cfg = readGenConfig();
  const cacheDir = `${ctx.app.vault.configDir}/plugins/orbis-reader/piper-cache`;
  const piper = (): RecordingMethod => ({
    method: 'piper',
    label: t('listening_page.gen_method_piper'),
    provider: createPiperVoiceProvider(ctx.app.vault.adapter, cacheDir, () => ctx.ttsRate()),
  });
  const server = (): RecordingMethod => ({
    method: 'server',
    label: t('listening_page.gen_method_server'),
    provider: createServerVoiceProvider(
      () => readGenConfig().serverUrl,
      () => readGenConfig().model,
      () => ctx.ttsRate()
    ),
  });
  const out: RecordingMethod[] = [];
  if (cfg.piperEnabled) out.push(piper());
  // **Enabled AND actually addressable.** The flag alone is not enough, because a flag is a stored boolean: one left
  // behind by a reset that failed to clear it would offer a server tab on a device with no server. A method with no
  // address and no voice cannot record whatever the flag says, so it is not offered — see `GEN_CONFIG_DEFAULTS`.
  if (cfg.serverEnabled && cfg.serverUrl && cfg.voice) out.push(server());
  return out.length ? out : [piper()];
}

/** The edition key a given voice would generate into with the current generation method — so the
 *  modal can show a not-yet-generated ("add another voice") edition as all-ungenerated. Method-aware
 *  (Piper vs server), so it stays consistent with what startRecording actually records. */
export function recordingEditionKeyForVoice(
  ctx: RecordingLibraryCtx,
  voice: string,
  method?: GenConfig['method']
): string {
  const id = genIdentity(voice, method);
  return editionKey(id.engine, id.model, id.voice);
}

/** Rename an edition / mix (its display label). */
export async function renameRecordingEdition(ctx: RecordingLibraryCtx, key: string, name: string): Promise<void> {
  const base = ctx.recordedAudioDir();
  if (base) await setEditionLabel(ctx.app, base, key, name);
}

/** Load a generated chapter's audio (for previewing it from the management modal) from a specific
 *  edition, or the active one. Mix-aware (resolves a mix chapter from its source edition). */
export async function loadRecordingChapter(
  ctx: RecordingLibraryCtx,
  sectionIndex: number,
  key?: string
): Promise<RecordedChapter | null> {
  const base = ctx.recordedAudioDir();
  if (!base) return null;
  const resolvedKey = key ?? (await listEditions(ctx.app, base)).active ?? undefined;
  return resolvedKey ? loadEditionChapter(ctx.app, base, resolvedKey, sectionIndex) : null;
}

export async function deleteRecordingChapter(
  ctx: RecordingLibraryCtx,
  chapterIndex: number,
  key?: string
): Promise<void> {
  const base = ctx.recordedAudioDir();
  if (!base) return;
  const resolvedKey = key ?? (await listEditions(ctx.app, base)).active ?? undefined;
  const dir = resolvedKey ? editionDir(base, resolvedKey) : null;
  if (!dir) return;
  await deleteChapterAudio(ctx.app, dir, chapterIndex);
  // Deleting the last chapter empties the edition folder — prune it from the index too so it
  // stops appearing in the picker.
  if (resolvedKey && !(await readEditionManifest(ctx.app, base, resolvedKey))) {
    await deleteEdition(ctx.app, base, resolvedKey);
  }
}

/** Delete one whole edition (its folder + index entry), or the active one. */
export async function deleteRecordingEdition(ctx: RecordingLibraryCtx, key?: string): Promise<void> {
  const base = ctx.recordedAudioDir();
  if (!base) return;
  const resolved = key ?? (await listEditions(ctx.app, base)).active ?? undefined;
  if (!resolved) return;
  await deleteEdition(ctx.app, base, resolved);
  // A mix may have pointed at the deleted voice edition — drop its now-dangling recorded pointers
  // (those chapters fall back to the live voice) so the mix doesn't break.
  const idx = await listEditions(ctx.app, base);
  for (const e of idx.editions) if (e.kind === 'mix') await pruneMixPointers(ctx.app, base, e.key);
}

/** Switch which edition plays back (and is shown by default in the modal). Re-seats a live Listen
 *  session onto the new edition (no-op when not listening). */
export async function setActiveRecordingEdition(ctx: RecordingLibraryCtx, key: string): Promise<void> {
  const base = ctx.recordedAudioDir();
  if (base) await setActiveEdition(ctx.app, base, key);
  await ctx.reloadPlayback();
}

/** The reader's "None" recording option: clear the active edition so the book plays with the live
 *  voice even though it has recordings. Re-seats an active Listen session onto the live engine. */
export async function clearActiveRecordingEdition(ctx: RecordingLibraryCtx): Promise<void> {
  const base = ctx.recordedAudioDir();
  if (base) await clearActiveEdition(ctx.app, base);
  await ctx.reloadPlayback();
}
