// Device-local recording-generation config: which method records (on-device Piper vs an
// OpenAI-compatible server, e.g. Kokoro), plus each method's own default voice and settings. Stored
// in localStorage so it is NEVER synced — the server URL is a per-network/LAN address, on-device
// Piper voices are per-device downloads, and good concurrency is machine-specific, so a single
// shared value would be wrong across devices. The recorded audio itself DOES sync (record once, play
// everywhere); only this config stays on the device.
//
// The two methods have separate voice namespaces (Piper: `en_US-amy-medium`; server: `af_heart`), so
// each keeps its own default voice. The active `method` decides which is "the default recording
// voice" at any moment.

import { readDeviceValue, writeDeviceValue } from '../../device-store';

export interface GenConfig {
  /** Which engine records: on-device Piper, or an OpenAI-compatible server. */
  method: 'piper' | 'server';
  /** Whether on-device Piper recording is available (always usable; on by default). */
  piperEnabled: boolean;
  /** Whether server (Kokoro / OpenAI-compatible) recording is available (needs a server; off by default). */
  serverEnabled: boolean;
  /** OpenAI-compatible base URL, e.g. `http://localhost:8880` (the `/v1/audio/…` is appended). */
  serverUrl: string;
  /** TTS model name sent in the server request (e.g. `kokoro`, `tts-1`). */
  model: string;
  /** Server voice/speaker name sent in the request (e.g. `af_heart`). */
  voice: string;
  /** On-device Piper voice — a catalog id (e.g. `en_US-amy-medium`), optionally with a `#N` speaker
   *  suffix for a multi-speaker model (e.g. `en_US-libritts_r-medium#42`). */
  piperVoice: string;
  /** Sentence requests to keep in flight for the server method (1 = sequential). Clamped 1–8. */
  concurrency: number;
}

const KEYS = {
  method: 'orbis-tts-gen-method',
  piperEnabled: 'orbis-tts-piper-enabled',
  serverEnabled: 'orbis-tts-server-enabled',
  serverUrl: 'orbis-tts-server-url',
  model: 'orbis-tts-server-model',
  voice: 'orbis-tts-server-voice',
  piperVoice: 'orbis-tts-piper-voice',
  concurrency: 'orbis-tts-gen-concurrency',
} as const;

const GEN_CONFIG_DEFAULTS: GenConfig = {
  // A fresh install has only on-device Piper enabled (no server to set up); the server method is
  // opt-in. Existing setups are preserved by migrateGenConfigEnable(), which turns the server on
  // for anyone who had already configured it.
  method: 'piper',
  piperEnabled: true,
  serverEnabled: false,
  /**
   * **No URL and no voice, because a default here is a claim that a server exists.**
   *
   * Defaults of `http://localhost:8880` and `af_heart` would make a device that has never seen a server report a
   * configured one — and `af_heart` is a Kokoro voice id, so on any other OpenAI-compatible server it is simply
   * wrong. Both are useful as HINTS, so they are placeholders on their inputs, which show the shape of the answer
   * without pretending to be one. Empty also lets everything downstream ask a real question —
   * `recordingMethods` can decline to offer a server with no address, and the settings row can say why.
   */
  serverUrl: '',
  // Not empty: unlike the URL and the voice, only Kokoro is supported, so this is the answer rather than a guess,
  // and there is no field for it in the UI to fill in.
  model: 'kokoro',
  voice: '',
  piperVoice: 'en_US-amy-medium',
  concurrency: 1,
};

// Vault-scoped, not machine-wide — see `device-store.ts`. `window.localStorage` would mean one Kokoro URL for every
// vault on the machine.
const read = readDeviceValue;
const write = (key: string, value: string): void => writeDeviceValue(key, value);

/**
 * Which recording engines are switched on, in the order the settings page lists them.
 *
 * **One name for a question three surfaces ask**: whether a default method is a real choice (only when both are
 * on), whether switching one off is allowed (never below one), and whether recording is possible at all (at least
 * one). Counting them once is also what makes the first question testable — a row whose visibility depends on an
 * inline condition read at build time can be left on screen after the state behind it moves.
 */
export function enabledGenMethods(cfg: Pick<GenConfig, 'piperEnabled' | 'serverEnabled'>): Array<'piper' | 'server'> {
  const out: Array<'piper' | 'server'> = [];
  if (cfg.piperEnabled) out.push('piper');
  if (cfg.serverEnabled) out.push('server');
  return out;
}

/** Whether the default-method row has a choice to offer: both engines on, or there is nothing to pick between. */
export function genMethodIsAChoice(cfg: Pick<GenConfig, 'piperEnabled' | 'serverEnabled'>): boolean {
  return enabledGenMethods(cfg).length === 2;
}

export function readGenConfig(): GenConfig {
  const conc = Number.parseInt(read(KEYS.concurrency) ?? '', 10);
  const piperEnabled = read(KEYS.piperEnabled) !== 'false'; // default on
  const serverEnabled = read(KEYS.serverEnabled) === 'true'; // default off
  // The active method must be one that's enabled — coerce so callers never get a disabled method.
  // (The settings UI forbids disabling the last method, so at least one is normally on.)
  let method: 'piper' | 'server' = read(KEYS.method) === 'server' ? 'server' : 'piper';
  if (method === 'piper' && !piperEnabled && serverEnabled) method = 'server';
  else if (method === 'server' && !serverEnabled && piperEnabled) method = 'piper';
  return {
    method,
    piperEnabled,
    serverEnabled,
    serverUrl: read(KEYS.serverUrl) ?? GEN_CONFIG_DEFAULTS.serverUrl,
    model: read(KEYS.model) ?? GEN_CONFIG_DEFAULTS.model,
    voice: read(KEYS.voice) ?? GEN_CONFIG_DEFAULTS.voice,
    piperVoice: read(KEYS.piperVoice) ?? GEN_CONFIG_DEFAULTS.piperVoice,
    concurrency: Number.isFinite(conc) && conc >= 1 && conc <= 8 ? conc : GEN_CONFIG_DEFAULTS.concurrency,
  };
}

export function setGenConfig(patch: Partial<GenConfig>): void {
  if (patch.method !== undefined) write(KEYS.method, patch.method);
  if (patch.piperEnabled !== undefined) write(KEYS.piperEnabled, String(patch.piperEnabled));
  if (patch.serverEnabled !== undefined) write(KEYS.serverEnabled, String(patch.serverEnabled));
  if (patch.serverUrl !== undefined) write(KEYS.serverUrl, patch.serverUrl);
  if (patch.model !== undefined) write(KEYS.model, patch.model);
  if (patch.voice !== undefined) write(KEYS.voice, patch.voice);
  if (patch.piperVoice !== undefined) write(KEYS.piperVoice, patch.piperVoice);
  if (patch.concurrency !== undefined) write(KEYS.concurrency, String(patch.concurrency));
}

/** One-time migration from the recording-generation config in the (synced) legacy plugin settings.
 *  Seed the device-local store from those legacy values if the user had customized them and this
 *  device hasn't set its own yet, then the caller may delete the legacy keys. */
export function seedGenConfigFromLegacy(legacy: Record<string, unknown>): void {
  const seed = (key: string, legacyValue: unknown): void => {
    if (read(key) !== null) return; // this device already has its own value
    if (typeof legacyValue === 'string') {
      if (legacyValue) write(key, legacyValue);
    } else if (typeof legacyValue === 'number') {
      write(key, String(legacyValue));
    }
  };
  seed(KEYS.serverUrl, legacy.ttsServerUrl);
  seed(KEYS.voice, legacy.ttsServerVoice);
  seed(KEYS.concurrency, legacy.ttsGenConcurrency);
  // `model`, `method`, and the Piper fields were never synced settings — nothing to seed.
}

/** One-time migration for the per-method enable flags, on a device that has neither stored. Piper is
 *  always turned on; the server is turned on only for devices that had already configured recording
 *  (so existing Kokoro setups keep working), and left off on a fresh install. Runs after
 *  seedGenConfigFromLegacy so a device seeded from synced legacy settings counts as "had prior". */
export function migrateGenConfigEnable(): void {
  if (read(KEYS.piperEnabled) !== null || read(KEYS.serverEnabled) !== null) return; // already migrated
  /**
   * **"Had a server" means it had an ADDRESS**, not that some recording key or other exists.
   *
   * Of method, URL, voice and model, three say nothing about whether a server was ever set up: `method` is stored
   * merely by choosing which engine a recording starts on, and `voice` and `model` are names you can type without
   * anything answering them. Counting them would let a single stray `orbis-tts-gen-method` read as "this device
   * already had a recording setup" and turn the server on in a freshly reset vault, pointed at nothing. A URL is
   * the one of the four that cannot be there by accident.
   */
  const hadPrior = !!read(KEYS.serverUrl);
  write(KEYS.piperEnabled, 'true');
  write(KEYS.serverEnabled, hadPrior ? 'true' : 'false');
}

/**
 * The engine / model / voice a run will use, from the stored generation config.
 *
 * **Here rather than on the reader view.** It reads `readGenConfig()` and nothing else — no book, no view state —
 * so it has no reason to be a method, whatever its three callers are. `startRecording` takes an
 * override when extending an existing edition, so that an edition's own identity always wins over the current
 * config; see `recording-library.ts` for the other two callers.
 */
export function genIdentity(
  voiceOverride?: string,
  methodOverride?: GenConfig['method']
): { engine: string; model: string; voice: string } {
  const cfg = readGenConfig();
  const method = methodOverride ?? cfg.method;
  if (method === 'piper') {
    return { engine: 'piper-ondevice', model: 'piper', voice: voiceOverride ?? cfg.piperVoice };
  }
  return { engine: 'openai-compatible', model: cfg.model, voice: voiceOverride ?? cfg.voice };
}
