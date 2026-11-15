// The two presentation rules behind the voice chip's second half.
//
// **Pulled out of the reader view and the controller so a test can reach them.** They are four lines of logic that
// decide what a reader sees for six different states of a book's audio, and both were got wrong once: the name was
// dropped where it should have shown, and shown where it would have claimed something false. Neither
// `OrbisReaderView` nor `TtsController` can be stood up in a unit test, so the rules were unreachable while living
// there.
//
// What stays behind is the RESOLUTION — walking the editions index and the mix pointers to find out which voice
// reads this chapter. That needs the vault. See `OrbisReaderView.currentVoiceInfo` and docs/design/text-to-speech.md.

/**
 * The selected recording or mix as the chip names it beside `voice` — or nothing, when naming it would only
 * repeat the voice already shown.
 *
 * **A recording is named by its voice until someone renames it**, so on a chapter that recording covers, the two
 * halves would read `Heart · Heart`. The collapse is why renaming a recording is worth having: give it a name and
 * the second half has something to say.
 */
export function chipSourceName(voice: string, selection: string | undefined): string | undefined {
  return selection && selection !== voice ? selection : undefined;
}

/**
 * The chip's second half, ready to paint: `· Mix 1`, `· (Mix 1)`, or nothing.
 *
 * **The parentheses mean "selected, but not what you are hearing here"** — a chapter the recording never covered,
 * or the always-live override standing over a real selection. Without them the chip would attribute the device's
 * voice to a recording that has nothing to do with it.
 *
 * The middot travels with the name rather than living in its own element, so it disappears with the half it
 * belongs to instead of hanging off the voice.
 */
export function chipSourceText(source: string | undefined, fromSelection: boolean): string {
  if (!source) return '';
  return fromSelection ? `· ${source}` : `· (${source})`;
}

/**
 * The listening speed on each chip, last of its words.
 *
 * **On the bar, the speed shows only while the names fit whole.** The voice and the recording or mix are what say which
 * audio this is, so they keep the room: when either would be cut short, the speed goes first. The full player always
 * has room, so its chip always shows it. `fit` is re-run when the names, the speed or the bar's width change.
 */
export class ChipSpeeds {
  private readonly items: { el: HTMLElement; yields: boolean; names: HTMLElement[] }[] = [];

  /** `yields`: give way to `names` when the chip is tight — the bar's chip. */
  add(el: HTMLElement, yields: boolean, names: HTMLElement[]): void {
    this.items.push({ el, yields, names });
  }

  paint(text: string): void {
    for (const { el } of this.items) el.setText(text);
    this.fit();
  }

  fit(): void {
    const cut = (e: HTMLElement): boolean => e.isShown() && e.scrollWidth > e.clientWidth;
    for (const { el, yields, names } of this.items) {
      el.show();
      if (yields) el.toggle(!names.some(cut));
    }
  }

  /** The next book builds its chips again. */
  clear(): void {
    this.items.length = 0;
  }
}
