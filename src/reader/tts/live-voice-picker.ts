// The device's live-listen voice binding for the shared VoicePicker: an [ Orbis voices | System
// voices ] method toggle mapped onto this device's VoicePref (getDeviceVoicePref/setDeviceVoicePref).
// Single-sourced here so the Settings "Listening" tab and the in-reader "Change voice" popup drive
// the exact same control (see docs/design/text-to-speech.md; task #58).

import type { App } from 'obsidian';
import { t } from '../../i18n';
import type { VoicePref } from '../../settings';
import { DEFAULT_ORBIS_VOICE_ID, splitPiperVoice } from './voice-catalog';
import type { RecordingMethod, VoicePickerHost } from './voice-picker';
import { createPiperVoiceProvider, createSystemVoiceProvider } from './voice-providers';
import { findSystemVoice, listSystemVoices, WebSpeechEngine } from './WebSpeechEngine';

export interface LiveVoicePickerDeps {
  app: App;
  /** Piper model cache dir (`<config>/plugins/orbis-reader/piper-cache`). */
  cacheDir: string;
  /** Current playback-rate multiplier (for previews). */
  rate: () => number;
  getPref: () => VoicePref | undefined;
  /** Persist a preference patch AND run any side effects (free the warm worker, re-seat playback). */
  setPref: (patch: Partial<Omit<VoicePref, 'deviceId'>>) => void;
  /** Stop competing audio before a preview plays. */
  pauseAudio: () => void;
}

/** Build the VoicePickerHost + methods for the live voice, bound to the device preference. Speaker
 *  ids per model are remembered in localStorage (same key scheme as the Settings picker). */
export function liveVoicePicker(deps: LiveVoicePickerDeps): { host: VoicePickerHost; methods: RecordingMethod[] } {
  const systemOk = WebSpeechEngine.isSupported();
  const sidKey = (base: string): string => `orbis-voice-sid-${base}`;

  const methods: RecordingMethod[] = [
    {
      method: 'orbis',
      label: t('listening_page.orbis_voices'),
      description: t('listening_page.orbis_voices_desc'),
      provider: createPiperVoiceProvider(deps.app.vault.adapter, deps.cacheDir, deps.rate),
    },
  ];
  if (systemOk)
    methods.push({
      method: 'system',
      label: t('listening_page.system_voices'),
      description: t('listening_page.system_voices_desc'),
      provider: createSystemVoiceProvider(deps.rate),
    });

  // Active source: the stored preference, else Orbis (matches the engine default — see `resolveDeviceLiveVoice`).
  // A stored 'system' preference is honored only where Web Speech exists — otherwise the picker would
  // report a method that isn't even in `methods` above, and would disagree with
  // TtsController.resolveSource() / resolveDeviceLiveVoice(), which both guard this. The UI would then
  // claim System while the engine actually speaks with Piper. Reachable via a synced preference or a
  // platform that loses Web Speech.
  const activeSource = (): 'orbis' | 'system' => {
    const pref = deps.getPref()?.source;
    if (pref === 'system') return systemOk ? 'system' : 'orbis';
    if (pref === 'orbis') return 'orbis';
    return 'orbis';
  };

  const host: VoicePickerHost = {
    getVoice: () => {
      const pref = deps.getPref();
      // The listed copy: a saved choice can name a copy of the voice the list hides (`findSystemVoice`).
      if (activeSource() === 'system')
        return findSystemVoice(pref?.systemVoiceURI)?.voiceURI ?? pref?.systemVoiceURI ?? '';
      const id = pref?.orbisVoiceId ?? DEFAULT_ORBIS_VOICE_ID;
      const sid = pref?.orbisSid ?? 0;
      return sid > 0 ? `${id}#${sid}` : id;
    },
    setVoice: (v) => {
      if (activeSource() === 'system') {
        deps.setPref({ source: 'system', systemVoiceURI: v });
      } else {
        const { id, speaker } = splitPiperVoice(v);
        deps.app.saveLocalStorage(sidKey(id), String(speaker)); // remember this model's speaker
        deps.setPref({ source: 'orbis', orbisVoiceId: id, orbisSid: speaker });
      }
    },
    pauseAudio: deps.pauseAudio,
    controlLabel: t('listening_page.select_live_voice'),
    getMethod: () => activeSource(),
    setMethod: (m) => {
      if (m === 'system') {
        const uri = deps.getPref()?.systemVoiceURI ?? listSystemVoices()[0]?.voiceURI ?? '';
        deps.setPref({ source: 'system', systemVoiceURI: uri });
      } else {
        const pref = deps.getPref();
        deps.setPref({
          source: 'orbis',
          orbisVoiceId: pref?.orbisVoiceId ?? DEFAULT_ORBIS_VOICE_ID,
          orbisSid: pref?.orbisSid ?? 0,
        });
      }
    },
    rememberedSpeaker: (base) => {
      const saved = Number.parseInt((deps.app.loadLocalStorage(sidKey(base)) as string | null) ?? '', 10);
      return Number.isFinite(saved) && saved >= 0 ? saved : 0;
    },
  };
  return { host, methods };
}
