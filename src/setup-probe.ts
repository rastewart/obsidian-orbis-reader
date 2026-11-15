// Where each of the Setup page's answers actually lives.
//
// **The four mechanisms, in one place.** A field in `data.json` that syncs; a `device-store` value that does not; a
// folder whose being set IS the answer; and three questions only the filesystem can settle. `setup-items.ts` holds
// the rule about what those answers mean and stays testable by never knowing any of this.
//
// See docs/design/settings.md §Setup — the first page.

import { deviceSetting } from './device-settings';
import { fontsInstalled } from './pdf-fonts';
import { isOrbisVoiceDownloaded } from './reader/tts/PiperEngine';
import { orbisVoiceOrDefault } from './reader/tts/voice-catalog';
import type { IOrbisReaderPlugin } from './settings';
import type { SetupProbe } from './setup-items';
import { syncSetupDone } from './sync/enabled';

/**
 * The two per-device caches these questions look in.
 *
 * Spelled out here as they are in six other places rather than shared: the literal is the same everywhere and a
 * helper for it belongs in a pass that changes all seven, not in the one file that noticed.
 */
const pluginDir = (plugin: IOrbisReaderPlugin): string => `${plugin.app.vault.configDir}/plugins/orbis-reader`;

/**
 * **Has this device a voice it can actually speak with?**
 *
 * Two ways to be ready and they are not the same question. A reader who chose a system voice has nothing to
 * download and is finished; a reader on an Orbis voice is finished only once the model is on disk — which is what
 * `FirstVoiceModal` exists to ask about, and what a second device has to do again. With no preference at all the
 * default recommendation is what Listening would offer, so that is the model whose presence is checked.
 */
async function voiceReady(plugin: IOrbisReaderPlugin): Promise<boolean> {
  const pref = plugin.getDeviceVoicePref();
  if (pref?.source === 'system') return true;
  const voice = orbisVoiceOrDefault(pref?.orbisVoiceId);
  return isOrbisVoiceDownloaded(plugin.app.vault.adapter, `${pluginDir(plugin)}/piper-cache`, voice.path);
}

/**
 * Read every Setup answer from wherever it is kept.
 *
 * Built fresh each time the page paints: three of these are downloads that can complete while settings is open, and
 * a probe held across a repaint would report the state at the moment it was made.
 */
export function setupProbe(plugin: IOrbisReaderPlugin): SetupProbe {
  const s = plugin.settings;
  return {
    // No `sourcesSetupDone` flag exists, deliberately — a folder is only ever set by answering the dialog, so its
    // presence IS the record of having answered. See `chooseSourcesOn`, which makes the same test.
    //
    // **And switched on HERE.** The folder travels with the vault's settings and the switch does not, so a folder
    // alone said "Ready" on a second device where book sources had never been turned on.
    bookSourcesOn: s.bookSourcesFolder.trim() !== '' && deviceSetting('bookSourcesEnabled'),
    librarySetUp: s.librarySetupDone === true,
    recordsSetUp: s.recordsSetupDone,
    // Per device, because consent does not travel — see `multi-device.ts`.
    devicesSetUp: syncSetupDone(),
    dictionaryDownloaded: () => plugin.dictionaries.anyDownloaded(),
    voiceReady: () => voiceReady(plugin),
    pdfFontsInstalled: () => fontsInstalled(plugin.app.vault.adapter, `${pluginDir(plugin)}/font-cache`),
  };
}
