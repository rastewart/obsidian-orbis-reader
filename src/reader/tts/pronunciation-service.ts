// Plugin-level wiring for the pronunciation dictionary: the store (read/write against settings) and
// the auditionable voices. Lives here rather than on the reader view because the Pronunciations
// manager opens from Settings, where there may be no book open — so nothing in this file may depend
// on a reader view existing.

import { type App, type DataAdapter } from 'obsidian';
import { deviceSetting } from '../../device-settings';
import { t } from '../../i18n';
import { generateStyleId, type IOrbisReaderPlugin, type VoicePref } from '../../settings';
import { orbisVoiceAsker } from './FirstVoiceModal';
import { readGenConfig } from './gen-config';
import { askForLiveVoice } from './live-voice-ask';
import type { PreviewVoice } from './pronunciation-editor';
import { normalizePronunciationSay, type Pronunciation } from './pronunciations';
import { describeVoice } from './server-voices';
import { resolveDeviceLiveVoice, type SpeakOnceDeps, type SpeakVoice, speakOnce } from './speak-once';
import { orbisVoiceOrDefault, splitPiperVoice } from './voice-catalog';
import { describeEditionVoice, shortVoiceLabel } from './voice-providers';
import { findSystemVoice, WebSpeechEngine } from './WebSpeechEngine';

/** Read/write access to the global dictionary. Case-insensitive on `word`. */
export interface PronunciationStore {
  list: () => Pronunciation[];
  find: (word: string) => Pronunciation | undefined;
  /** `enabled` omitted preserves an existing entry's flag (a new entry starts on). */
  upsert: (word: string, say: string, enabled?: boolean) => Promise<void>;
  setEnabled: (word: string, enabled: boolean) => Promise<void>;
  remove: (word: string) => Promise<void>;
}

const key = (w: string): string => w.trim().toLowerCase();

/**
 * The dictionary store, backed by plugin settings.
 *
 * Every mutation saves (which recompiles the pronouncer — see saveSettings) and then calls
 * refreshViews(), which drops each open reader's engine. That second step matters: without it,
 * sentences already synthesized into the engine's cache would keep the old pronunciation until the
 * chapter was revisited.
 */
export function createPronunciationStore(plugin: IOrbisReaderPlugin, onChanged?: () => void): PronunciationStore {
  const commit = async (): Promise<void> => {
    await plugin.saveSettings();
    plugin.refreshViews();
    onChanged?.();
  };
  const list = (): Pronunciation[] => plugin.settings.pronunciations;
  return {
    list,
    find: (word) => list().find((p) => key(p.word) === key(word)),
    upsert: async (word, say, enabled) => {
      const l = list();
      const at = l.findIndex((p) => key(p.word) === key(word));
      // Omitting `enabled` preserves an existing entry's flag; a new one starts on.
      const clean = normalizePronunciationSay(say);
      if (at >= 0) l[at] = { ...l[at], word: word.trim(), say: clean, ...(enabled === undefined ? {} : { enabled }) };
      // A new entry is minted with an id here rather than being given one at load, so that the version sync stamps
      // belongs to the entry from the moment it exists — see `Pronunciation.id`.
      else l.push({ id: `pron-${generateStyleId()}`, word: word.trim(), say: clean, enabled: enabled ?? true });
      await commit();
    },
    setEnabled: async (word, enabled) => {
      const l = list();
      const at = l.findIndex((p) => key(p.word) === key(word));
      if (at < 0) return;
      l[at] = { ...l[at], enabled };
      await commit();
    },
    remove: async (word) => {
      plugin.settings.pronunciations = list().filter((p) => key(p.word) !== key(word));
      await commit();
    },
  };
}

const cacheDirOf = (app: App): string => `${app.vault.configDir}/plugins/orbis-reader/piper-cache`;

/** One-shot speech in `voice`, verbatim (no dictionary — the text being auditioned IS a
 *  replacement). */
function speakIn(
  adapter: DataAdapter,
  app: App,
  rate: () => number,
  voice: SpeakVoice,
  askForVoice: SpeakOnceDeps['askForVoice'] = orbisVoiceAsker(app, cacheDirOf(app))
) {
  return (text: string, onDone: () => void) =>
    speakOnce({ adapter, cacheDir: cacheDirOf(app), rate, voice: () => voice, askForVoice }, text, onDone);
}

/** Display name for the device's Orbis voice, including its "· N" speaker tag for a multi-speaker
 *  model — the same string the Listen bar's voice chip shows. Exported so the settings page can label
 *  its Live voice entry with the SAME string; a fourth spelling of a voice name is a fourth thing to
 *  keep in step. */
export function orbisDisplayName(pref: VoicePref | undefined): string {
  const v = orbisVoiceOrDefault(pref?.orbisVoiceId);
  const sid = v.multiSpeaker ? (pref?.orbisSid ?? 0) : 0;
  return shortVoiceLabel(describeEditionVoice('piper-ondevice', v.multiSpeaker ? `${v.id}#${sid}` : v.id));
}

/** Display name for a system (Web Speech) voice — its own name, not the generic "System voices".
 *  Falls back to the raw URI, then to the generic label when no voice is chosen at all. */
export function systemDisplayName(uri: string | undefined): string {
  if (!uri) return t('listening_page.system_voices');
  return findSystemVoice(uri)?.name ?? uri;
}

/**
 * The voices worth auditioning a respelling against.
 *
 * Chosen by TEXT FRONTEND, not by speaker or by which engine happens to be selected for recording.
 * A respelling is steering letter-to-sound rules, and those live in the frontend: Piper phonemizes
 * through espeak-ng, a server voice runs its own G2P, and a system voice uses the OS's. Two Piper
 * speakers therefore tell you nothing new about a respelling, while Piper vs Kokoro genuinely can
 * disagree — which is the whole reason there is more than one button.
 *
 * Deliberately does NOT consult readGenConfig().method — now the "Record with" preference, and still the
 * wrong question here. Following it would offer one button whenever the preferred engine and the live voice
 * share a frontend, which is exactly the case these buttons exist for: you would lose the ability to hear how
 * the OTHER engine says a respelling. (The older reason still stands too — on a device that has never recorded,
 * `method` reports its default, which once had an iPad with a working Kokoro server offering a Piper voice.)
 * What matters is which engines are ENABLED, since any of them may end up reading a book.
 *
 * **Labeled by ENGINE, not by role.** "Recording (Heart)" read as a claim about which voice records, which the
 * Recorded voice setting answers — and answers differently, since these buttons pick a frontend rather than a
 * preference. "Kokoro (…)" and "Orbis (…)" say what they actually are.
 */
export function previewVoices(plugin: IOrbisReaderPlugin): PreviewVoice[] {
  const app = plugin.app;
  const adapter = app.vault.adapter;
  const rate = () => deviceSetting('ttsRate') || 1;
  const out: PreviewVoice[] = [];

  // Names go through the same path as the Listen bar's voice chip, so a raw id like "af_bella" reads
  // as "Bella" and voices are named identically wherever they appear.
  const pref = plugin.getDeviceVoicePref();
  const live = resolveDeviceLiveVoice(pref, WebSpeechEngine.isSupported());
  const liveName = live.source === 'orbis' ? orbisDisplayName(pref) : systemDisplayName(pref?.systemVoiceURI);
  // The live voice gets the full prompt; the recording voice below only its download — see `live-voice-ask.ts`.
  out.push({
    label: t('lookup.pron_preview_live', { voice: liveName }),
    speak: speakIn(adapter, app, rate, live, () => askForLiveVoice(app, plugin)),
  });

  const cfg = readGenConfig();

  // A server voice's own G2P is the one frontend the live voice can never cover, so offer it whenever
  // it's usable. Skipped when unconfigured rather than offered as a button that can only fail.
  if (cfg.serverEnabled && cfg.serverUrl && cfg.voice) {
    out.push({
      label: t('lookup.pron_preview_kokoro', { voice: shortVoiceLabel(describeVoice(cfg.voice)) }),
      speak: speakIn(adapter, app, rate, { source: 'server', url: cfg.serverUrl, model: cfg.model, voice: cfg.voice }),
    });
  }

  // Piper recording only when the live voice isn't already Piper: same espeak frontend, so a second
  // Piper speaker adds a button without adding information.
  if (cfg.piperEnabled && live.source !== 'orbis') {
    const { id: base, speaker: sid } = splitPiperVoice(cfg.piperVoice);
    const rec = orbisVoiceOrDefault(base);
    out.push({
      label: t('lookup.pron_preview_orbis', {
        voice: shortVoiceLabel(describeEditionVoice('piper-ondevice', cfg.piperVoice || rec.id)),
      }),
      speak: speakIn(adapter, app, rate, { source: 'orbis', path: rec.path, sid }),
    });
  }
  return out;
}
