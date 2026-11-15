// Whether this device can speak, and asking for a voice when it can't — "Listen needs a voice" and its three answers.
//
// Its own file because it is one question asked from many places — opening the bar, ▶, a track read live after a
// recorded one — and the answer must be the same everywhere: Orbis never downloads a voice without asking. Split
// out of `TtsController.ts`.

import { type App, Notice } from 'obsidian';
import { readDeviceValue, writeDeviceValue } from '../../device-store';
import { t } from '../../i18n';
import type { TtsHost } from '../TtsHost';
import { FirstVoiceModal } from './FirstVoiceModal';
import { downloadOrbisVoice, isOrbisVoiceDownloaded } from './PiperEngine';
import { orbisVoiceOrDefault } from './voice-catalog';
import { voiceReadinessChanged } from './voice-readiness';
import { WebSpeechEngine } from './WebSpeechEngine';

/** What the gate needs from the listening controller. */
export interface VoiceGateDeps {
  app: App;
  host: Pick<TtsHost, 'mixLiveVoiceOnDevice' | 'deviceVoicePref' | 'setDeviceVoicePref' | 'openLiveVoicePicker'>;
  /** The part being read, for a mix's voice for it. */
  partIndex(): number;
  /** This device's own live voice source, whatever a mix says. */
  deviceSource(): 'orbis' | 'system';
  /** The source the next sentence would speak in: a mix track's pinned voice, else the device's. */
  resolveSource(): 'orbis' | 'system';
  /** Rebuild the engine on the next play — after switching to a system voice. */
  resetEngine(): void;
}

const SYSTEM_HINTED_KEY = 'orbis-listen-system-hinted';

export class VoiceGate {
  constructor(private readonly deps: VoiceGateDeps) {}

  private get cacheDir(): string {
    return `${this.deps.app.vault.configDir}/plugins/orbis-reader/piper-cache`;
  }

  /**
   * **Can this device speak right now?**
   *
   * One predicate, because two answers to "is there a voice" drift apart. It feeds the gate below AND the voice
   * chip — a chip naming the *recommended* voice whether or not its file exists would let a reader see
   * `Listen needs a voice` in a modal and `Amy` on the chip underneath it, at the same moment, disagreeing.
   *
   * **Derived, never remembered.** Not a count of how many times the prompt has been dismissed; a count is a copy
   * of a fact that can be read, and copies go stale. This reads it.
   */
  async canSpeakNow(): Promise<boolean> {
    // A mix's voice for this track, if this device has it; asking only about the device's would let one download at
    // play.
    if ((await this.deps.host.mixLiveVoiceOnDevice(this.deps.partIndex())).voice) return true;
    return this.deviceVoiceReady();
  }

  /** This device's own live voice is usable without fetching anything: a system voice, or an Orbis model on disk. */
  async deviceVoiceReady(): Promise<boolean> {
    if (this.deps.deviceSource() !== 'orbis') return WebSpeechEngine.isSupported();
    const voice = orbisVoiceOrDefault(this.deps.host.deviceVoicePref()?.orbisVoiceId);
    return await isOrbisVoiceDownloaded(this.deps.app.vault.adapter, this.cacheDir, voice.path);
  }

  /**
   * Run `then` once this device has a voice, asking for one first if it does not.
   *
   * **The gate guards every route that needs a voice, not only opening.** Inside the bar's open path alone,
   * dismissing the prompt and pressing ▶ would try to play with nothing to play with: no sound, no error, no way
   * to tell what was wrong — on a device with no voice downloaded, which is every new install.
   *
   * `then` is told whether a download just happened, because the two arrivals mean different things: a reader
   * who pressed *Download and listen* asked to listen, and one who already had a voice asked only for whatever
   * they were doing.
   */
  async withVoice(then: (justDownloaded: boolean) => void): Promise<void> {
    if (await this.canSpeakNow()) {
      then(false);
      return;
    }
    if (this.deps.resolveSource() !== 'orbis') {
      // No Orbis voice to offer and no system speech either: nothing this prompt could fix.
      new Notice(t('notices.tts_no_live_engine'));
      return;
    }
    const pref = this.deps.host.deviceVoicePref();
    const voice = orbisVoiceOrDefault(pref?.orbisVoiceId);
    const adapter = this.deps.app.vault.adapter;
    new FirstVoiceModal(this.deps.app, {
      voiceName: voice.name,
      sizeMB: voice.sizeMB,
      isRecommendation: !pref?.orbisVoiceId, // no chosen voice → default rec
      // Announced, as every download is (`voice-readiness.ts`): the Listening page and the chip still said No voice.
      download: (onProgress) =>
        downloadOrbisVoice(adapter, this.cacheDir, voice.path, onProgress).then(() => voiceReadinessChanged()),
      onReady: () => then(true),
      onBrowse: () => this.browseVoicesThen(then),
      // Offer a no-download escape only where system voices exist (desktop/iPad).
      onUseSystem: WebSpeechEngine.isSupported() ? () => void this.useSystemVoiceThen(then) : undefined,
    }).open();
  }

  /** On a system voice, say once per device that it is one, and where to choose another. */
  hintSystemVoiceOnce(): void {
    if (this.deps.resolveSource() === 'orbis' || this.systemHinted()) return;
    new Notice(t('onboarding.system_hint'), 8000);
    this.setSystemHinted();
  }

  /** First-run "Use a system voice" escape: switch this device to the OS voice, then carry on. */
  private async useSystemVoiceThen(then: (justDownloaded: boolean) => void): Promise<void> {
    await this.deps.host.setDeviceVoicePref({ source: 'system' });
    this.setSystemHinted(); // they chose system explicitly; don't also show the hint
    this.deps.resetEngine(); // rebuild as Web Speech on the next play
    then(true); // they picked a voice in order to listen
  }

  private systemHinted(): boolean {
    try {
      return readDeviceValue(SYSTEM_HINTED_KEY) === '1';
    } catch {
      return true; // if storage is unavailable, don't nag
    }
  }

  private setSystemHinted(): void {
    try {
      writeDeviceValue(SYSTEM_HINTED_KEY, '1');
    } catch {
      /* best-effort */
    }
  }

  /** First-run "Browse voices": the Live voice picker, not Settings. On Done, a voice able to speak opens the bar (a
   *  Preview can download the chosen one without changing it); a chosen voice still to download re-prompts. */
  private browseVoicesThen(then: (justDownloaded: boolean) => void): void {
    let chose = false;
    const choose = () => void (chose = true);
    const done = async () => {
      if (chose || (await this.canSpeakNow())) await this.withVoice(then);
    };
    this.deps.host.openLiveVoicePicker(choose, () => void done());
  }
}
