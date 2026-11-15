// Voice sources for the shared VoicePicker — the two recording methods differ in where voices come
// from and what they need: the server discovers voices over HTTP and previews via HTTP (no
// download); on-device Piper lists a curated catalog, downloads a model on first use, and previews
// on-device. A VoiceProvider hides those differences so one picker UI serves both.

import type { DataAdapter } from 'obsidian';
import { t } from '../../i18n';
import {
  downloadOrbisVoice,
  isOrbisVoiceDownloaded,
  orbisVoiceSpeakerCount,
  type PreviewHandle,
  previewOrbisVoice,
} from './PiperEngine';
import {
  describeVoice,
  fetchServerVoices,
  isEnglishLang,
  languageLabel,
  previewServerVoice,
  sortVoices,
  voiceGender,
  voiceLang,
} from './server-voices';
import { ORBIS_VOICES, type OrbisVoice, orbisVoiceById, splitPiperVoice } from './voice-catalog';
import { listSystemVoices, previewSystemVoice } from './WebSpeechEngine';

export interface VoiceItem {
  /** Stored identity (server voice id, or Piper catalog id). */
  id: string;
  label: string;
  gender?: 'f' | 'm';
  /** Filter key + label for the group dimension (server: language; Piper: accent). */
  group: string;
  groupLabel: string;
  /** Piper only: model download size (MB) and speaker count (>1 → a multi-voice model). */
  sizeMB?: number;
  speakers?: number;
  /** Piper only: a multi-speaker model (its true speaker count is only known once downloaded). */
  multiSpeaker?: boolean;
}

export interface VoiceProvider {
  /** Heading for the group-filter dimension ('Language' for the server, 'Accent' for Piper). */
  readonly groupHeading: string;
  /** Whether a voice must be downloaded before it can be used (Piper). */
  readonly downloadable: boolean;
  /** Selectable voices, or null when discovery failed (server offline) → the picker's text fallback. */
  list(): Promise<VoiceItem[] | null>;
  /** Which of the present group values start enabled (e.g. English languages for the server). */
  defaultGroups(present: string[]): string[];
  /** Whether the voice is usable without a download (always true for the server / system). */
  isReady(id: string): Promise<boolean>;
  /** Download a voice's model (Piper), reporting 0..1. No-op for the server / system. */
  download(id: string, onProgress: (fraction: number) => void): Promise<void>;
  /** Preview a voice (downloading first if needed). `speaker` is the multi-voice speaker index. */
  preview(id: string, speaker: number, onDone: () => void): Promise<PreviewHandle>;
}

/** Human label for a recorded edition's voice, engine-aware: Piper catalog voices as
 *  "Amy — American English, Female" (with "· #N" for a multi-speaker model), server voices via
 *  describeVoice. Shared by every edition dropdown so Piper ids never leak raw. */
/** The display name alone from a full "Name — Locale, Gender" label, keeping a multi-speaker Piper
 *  "· N" tag. What the Listen bar's voice chip shows, so voice names read the same everywhere. */
export function shortVoiceLabel(full: string): string {
  const name = full.split(' — ')[0];
  const speaker = full.match(/ · \d+$/); // multi-speaker Piper tag, appended after locale/gender
  return speaker ? `${name}${speaker[0]}` : name;
}

export function describeEditionVoice(engine: string, voice: string): string {
  if (engine === 'piper-ondevice') {
    const { id, speaker } = splitPiperVoice(voice);
    const v = orbisVoiceById(id);
    if (!v) return voice;
    const accent = v.accent === 'US' ? t('listening_page.american_english') : t('listening_page.british_english');
    const parts = [accent];
    if (v.gender)
      parts.push(v.gender === 'female' ? t('listening_page.gender_female') : t('listening_page.gender_male'));
    let label = `${v.name} — ${parts.join(', ')}`;
    if (v.multiSpeaker) label += ` · ${speaker + 1}`;
    return label;
  }
  return describeVoice(voice);
}

export function createServerVoiceProvider(
  serverUrl: () => string,
  model: () => string,
  rate: () => number
): VoiceProvider {
  return {
    groupHeading: t('listening_page.gen_voice_language'),
    downloadable: false,
    async list() {
      const ids = await fetchServerVoices(serverUrl());
      if (!ids?.length) return null;
      // English only — non-English voices read English text poorly. Fall back to all if a server
      // exposes no English voices, so it's still usable.
      const english = ids.filter((id) => {
        const l = voiceLang(id);
        return !!l && isEnglishLang(l);
      });
      return sortVoices(english.length ? english : ids).map((id) => {
        const lang = voiceLang(id) ?? '';
        const g = voiceGender(id);
        return {
          id,
          label: describeVoice(id),
          gender: g === 'm' ? 'm' : g === 'f' ? 'f' : undefined,
          group: lang,
          groupLabel: languageLabel(lang),
        };
      });
    },
    defaultGroups(present) {
      return present; // already English-only (unless a server has none), so show all present
    },
    async isReady() {
      return true;
    },
    async download() {},
    preview(id, _speaker, onDone) {
      return previewServerVoice(
        serverUrl(),
        model(),
        id,
        t('listening_page.voice_preview_sample'),
        rate() || 1,
        onDone
      );
    },
  };
}

/** System (OS / WebSpeech) voices for the live-listen picker: no download, no delete, grouped by
 *  language. The list may be empty until the OS reports voices (see onVoicesChanged) — the caller
 *  re-renders on that event. */
export function createSystemVoiceProvider(rate: () => number): VoiceProvider {
  // Prettify a BCP-47 tag ('en-US' → 'American English') for the label + language filter; fall back
  // to the raw tag if Intl.DisplayNames is unavailable.
  const langLabel = (tag: string): string => {
    try {
      return new Intl.DisplayNames([tag, 'en'], { type: 'language' }).of(tag) ?? tag;
    } catch {
      return tag;
    }
  };
  return {
    groupHeading: t('listening_page.gen_voice_language'),
    downloadable: false,
    async list() {
      return listSystemVoices().map((v) => ({
        id: v.voiceURI,
        label: `${v.name} — ${langLabel(v.lang)}`,
        group: v.lang,
        groupLabel: langLabel(v.lang),
      }));
    },
    defaultGroups(present) {
      return present; // already scoped to the UI language by listSystemVoices()
    },
    async isReady() {
      return true;
    },
    async download() {},
    preview(id, _speaker, onDone) {
      return Promise.resolve(previewSystemVoice(id, t('listening_page.voice_preview_sample'), rate() || 1, onDone));
    },
  };
}

/** An Orbis voice as the picker lists it — "Name — Accent, Gender", the server's shape, multi-speaker models tagged. */
export function orbisVoiceLabel(v: OrbisVoice): string {
  const parts = [v.accent === 'US' ? t('listening_page.american_english') : t('listening_page.british_english')];
  if (v.gender) parts.push(v.gender === 'female' ? t('listening_page.gender_female') : t('listening_page.gender_male'));
  const label = `${v.name} — ${parts.join(', ')}`;
  return v.multiSpeaker ? `${label} · ${t('listening_page.gen_voice_multi')}` : label;
}

export function createPiperVoiceProvider(adapter: DataAdapter, cacheDir: string, rate: () => number): VoiceProvider {
  // Ids may carry a `#N` speaker suffix — resolve the model path from the base catalog id only.
  const path = (id: string): string => orbisVoiceById(splitPiperVoice(id).id)?.path ?? splitPiperVoice(id).id;
  return {
    groupHeading: t('listening_page.gen_voice_accent'),
    downloadable: true,
    async list() {
      return Promise.all(
        ORBIS_VOICES.map(async (v) => {
          const accentLabel =
            v.accent === 'US' ? t('listening_page.american_english') : t('listening_page.british_english');
          const label = orbisVoiceLabel(v);
          // Prefer the true count from the downloaded config; before download, fall back to the
          // catalog's known count so the "Voice #N" stepper still shows (and can be picked/previewed).
          let speakers = 1;
          if (v.multiSpeaker) {
            const read = await orbisVoiceSpeakerCount(adapter, cacheDir, path(v.id));
            speakers = read > 1 ? read : (v.speakerCount ?? 1);
          }
          return {
            id: v.id,
            label,
            gender: v.gender === 'male' ? ('m' as const) : v.gender === 'female' ? ('f' as const) : undefined,
            group: v.accent,
            groupLabel: accentLabel,
            sizeMB: v.sizeMB,
            multiSpeaker: v.multiSpeaker,
            speakers,
          };
        })
      );
    },
    defaultGroups(present) {
      return present; // Piper accents (US/GB) are both English — show all by default.
    },
    isReady(id) {
      return isOrbisVoiceDownloaded(adapter, cacheDir, path(id));
    },
    download(id, onProgress) {
      return downloadOrbisVoice(adapter, cacheDir, path(id), onProgress);
    },
    preview(id, speaker, onDone) {
      return previewOrbisVoice(
        adapter,
        cacheDir,
        path(id),
        speaker,
        t('listening_page.voice_preview_sample'),
        rate() || 1,
        undefined,
        onDone
      );
    },
  };
}
