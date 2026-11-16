import { beforeEach, describe, expect, it, vi } from 'vitest';
import { augmentDom } from './dom-augment';

/**
 * **Downloading a voice is not selecting one, and only selecting was ever reported.**
 *
 * The picker told its host through `setVoice` alone. That fires when a name is picked — before the model has
 * downloaded, and not at all when the pick was already the selection. So a reader who opened the picker from a
 * chip reading *No voice*, downloaded the recommended voice and previewed it, went back to a chip and a panel
 * still saying there was no voice: both read the filesystem, and nothing had told them to read it again.
 *
 * It is now announced to whoever is listening rather than handed to one host — see `voice-readiness.ts` for why
 * that took three attempts. What is asserted here is the announcement, which is the only thing the picker owes
 * anyone.
 *
 * These drive the real control — a `change` on the real `<select>`, a `click` on the real `<button>` — because
 * what broke was the path between them and the announcement, and a test that calls the handler directly asserts
 * the path it just bypassed.
 */
augmentDom();

const { VoicePicker } = await import('../reader/tts/voice-picker');
const { onVoiceReadinessChanged } = await import('../reader/tts/voice-readiness');
type Provider = import('../reader/tts/voice-providers').VoiceProvider;

/** A downloadable provider whose download is resolved by the test, so the gap between selecting and having is
 *  a moment the assertions can sit inside. */
function fakeProvider(ready: Set<string>): { provider: Provider; finishDownload: () => void; downloads: string[] } {
  let release: (() => void) | null = null;
  const downloads: string[] = [];
  const provider: Provider = {
    groupHeading: 'Accent',
    downloadable: true,
    list: async () => [
      { id: 'amy', label: 'Amy', group: 'en_US', groupLabel: 'American', gender: 'f', sizeMB: 63 },
      { id: 'alan', label: 'Alan', group: 'en_GB', groupLabel: 'British', gender: 'm', sizeMB: 63 },
    ],
    defaultGroups: (present) => present,
    isReady: async (id) => ready.has(id),
    download: (id) =>
      new Promise<void>((resolve) => {
        downloads.push(id);
        release = () => {
          ready.add(id);
          resolve();
        };
      }),
    preview: async () => ({ stop: () => {} }),
  };
  return { provider, finishDownload: () => release?.(), downloads };
}

function harness(ready: string[] = []) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const readySet = new Set(ready);
  const { provider, finishDownload, downloads } = fakeProvider(readySet);
  let voice = 'amy';
  // Subscribed the way every real surface is — the picker is told nothing about who is listening.
  const onReadyChanged = vi.fn();
  unsubscribe = onVoiceReadinessChanged(onReadyChanged);
  const voiceDownloaded = vi.fn();
  const picker = new VoicePicker(
    container,
    {
      getVoice: () => voice,
      setVoice: (v) => {
        voice = v;
      },
      pauseAudio: () => {},
      voiceDownloaded,
    },
    { method: 'orbis', label: 'Orbis voices', provider }
  );
  return {
    container,
    picker,
    onReadyChanged,
    voiceDownloaded,
    finishDownload,
    downloads,
    readySet,
    voice: () => voice,
  };
}

/** Dropped after each test: the announcement is module-level, so a listener left behind would hear the next one. */
let unsubscribe: (() => void) | null = null;

/** Let the picker's chain of `void`ed promises settle — it renders, lists, then checks readiness. */
const settle = async (): Promise<void> => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

/** The button beside the list: Download while the voice is not on the device, Preview once it is. */
const actionButton = (container: HTMLElement): HTMLButtonElement | undefined =>
  Array.from(container.querySelectorAll('button')).find((b) => /download|preview/i.test(b.textContent ?? ''));

const select = (container: HTMLElement): HTMLSelectElement => {
  const el = container.querySelector('select');
  if (!el) throw new Error('no voice dropdown rendered');
  return el;
};

beforeEach(() => {
  unsubscribe?.();
  unsubscribe = null;
  document.body.empty();
});

describe('VoicePicker — readiness is announced', () => {
  it('downloads nothing when a voice is chosen — the button asks for it', async () => {
    const { container, picker, onReadyChanged, downloads } = harness();
    await picker.render();
    await settle();

    const dd = select(container);
    dd.value = 'alan';
    dd.dispatchEvent(new Event('change'));
    await settle();

    // Choosing records the choice. A download is something the reader asks for, and nothing has arrived to report.
    expect(downloads).toEqual([]);
    expect(onReadyChanged).not.toHaveBeenCalled();
    expect(actionButton(container)?.textContent).toMatch(/download/i);
  });

  it('downloads when Download is pressed, and reports the voice once it has arrived', async () => {
    const { container, picker, onReadyChanged, voiceDownloaded, finishDownload, downloads } = harness();
    await picker.render();
    await settle();

    actionButton(container)?.dispatchEvent(new Event('click'));
    await settle();
    expect(downloads).toEqual(['amy']);
    // Started, not finished: this device still cannot speak, and saying otherwise would put a voice's name back on a
    // chip that has nothing to say it with.
    expect(onReadyChanged).not.toHaveBeenCalled();
    expect(voiceDownloaded).not.toHaveBeenCalled();

    finishDownload();
    await settle();
    expect(onReadyChanged).toHaveBeenCalled();
    // And the host is told which voice arrived, so the live voice can store it as the choice (`liveVoicePicker`).
    expect(voiceDownloaded).toHaveBeenCalledWith('amy');
    expect(actionButton(container)?.textContent).toMatch(/preview/i);
  });

  // Deleting here acted on the selected voice, which is the live one — so the only voice it could delete was the one
  // in use. Voices are deleted from Settings → Listening → Downloaded voices (`downloaded-voices.ts`).
  it('offers no delete, even for a downloaded voice', async () => {
    const { container, picker } = harness(['amy']);
    await picker.render();
    await settle();
    expect(container.querySelector('button[data-icon="trash"]')).toBeNull();
  });

  it('reads Preview for a voice already on the device, and previews without downloading', async () => {
    const { container, picker, onReadyChanged, downloads } = harness(['amy']);
    await picker.render();
    await settle();

    const preview = actionButton(container);
    expect(preview?.textContent, 'a downloaded voice should offer Preview').toMatch(/preview/i);
    preview?.dispatchEvent(new Event('click'));
    await settle();

    expect(downloads).toEqual([]);
    expect(onReadyChanged).toHaveBeenCalled();
  });
});
