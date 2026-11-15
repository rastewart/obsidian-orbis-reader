// The one place a respelling is edited and auditioned. Reached from two entry points — the lookup
// popup's Pronunciation section (while reading) and the Pronunciations manager (from Settings) — so
// the fields, validation and preview behavior can't drift between them.
//
// The FORM is separate from its SURFACE on purpose. Orbis has two popup systems that don't mix:
// createOrbisPopup attaches to activeDocument.body, which is fine over the reader but lands OUTSIDE
// an Obsidian Modal's DOM — and Obsidian's modal focus containment then pulls focus back, leaving the
// input impossible to type into. So a caller inside the Settings modal must host the form in an
// Obsidian Modal (as StyleNameModal / NewFolderModal do), while the reader uses createOrbisPopup.
// renderPronunciationForm() is the shared part; each caller supplies the surface.
//
// Two preview buttons rather than one, because Piper and Kokoro have different text frontends: Piper
// phonemizes through espeak-ng, so a respelling steers espeak's letter-to-sound rules, while a server
// voice runs its own G2P. The same spelling can genuinely land differently, so the voice that reads
// live and the voice that records are both worth hearing before saving.
//
// Previews speak the typed text VERBATIM — running it back through the dictionary would be circular,
// since the entry being edited would rewrite its own replacement.

import { Modal, Notice } from 'obsidian';
import { actionRow } from '../../controls';
import { t } from '../../i18n';
import { OrbisModal } from '../../OrbisModal';
import {
  createCollapsibleNote,
  createOrbisPopup,
  type OrbisPopupHost,
  pinModalAboveKeyboard,
  setBusy,
  trapTab,
} from '../../ui-utils';
import type { PreviewHandle } from './PiperEngine';
import { isValidPronunciationSay, normalizePronunciationSay } from './pronunciations';
import { VoiceNotHereError } from './speak-once';

/** One auditionable voice: a label for its button and a way to speak arbitrary text in it. */
export interface PreviewVoice {
  /** Short button label, e.g. "Live (Libritts)" / "Recording (af_sky)". */
  label: string;
  speak: (text: string, onDone: () => void) => Promise<PreviewHandle>;
}

/** The entry being edited. `say: ''` means "new", which hides Remove and the Active toggle. */
export interface PronunciationDraft {
  say: string;
  enabled: boolean;
}

export interface PronunciationEditorDeps {
  /** Voices offered as preview buttons, in order. Empty is tolerated (no preview row). */
  voices: () => PreviewVoice[];
  /** Stop book playback before a preview so the two don't overlap. Does not resume afterwards. */
  pauseAudio: () => void;
  upsert: (word: string, say: string, enabled?: boolean) => Promise<void>;
  remove: (word: string) => Promise<void>;
}

/** Enough of the plugin for the Modal surface: the app to construct with, and the reader-pane height
 *  lock that stops the mobile keyboard collapsing the page behind it. */
export interface PronunciationEditorHost {
  app: Modal['app'];
  lockMobileHeights(): void;
  unlockMobileHeights(): void;
}

/** What the surface gives the form: how to dismiss itself, what to do after a change, and whether it
 *  needs the entry-lifecycle controls. */
interface EditorSurface {
  close: () => void;
  onChanged: () => void;
  /**
   * Whether to offer Remove and Active.
   *
   * False from the glossary manager: each of its rows already has a Delete button and an ACTIVE
   * checkbox, so repeating them inside the editor is redundant — and the row's checkbox applies
   * immediately while the editor's would apply on Save, which is two different answers to the same
   * question sitting one click apart. True from the lookup popup, where the editor is the only way to
   * reach either one.
   */
  showEntryControls: boolean;
}

/**
 * Build the respelling form into `container`. Returns `stopPreview`, which the surface MUST call when
 * it closes — otherwise a preview keeps playing with no visible control.
 *
 * `current.say` is '' for a new entry, which hides Remove and Active regardless of the surface.
 */
function renderPronunciationForm(
  container: HTMLElement,
  deps: PronunciationEditorDeps,
  word: string,
  current: PronunciationDraft,
  surface: EditorSurface
): { stopPreview: () => void } {
  const isExisting = current.say !== '';
  // Only an existing entry HAS a flag to flip or a row to delete, and only some surfaces want them.
  const showEntryControls = isExisting && surface.showEntryControls;
  let enabled = current.enabled;
  let speech: PreviewHandle | null = null;
  let epoch = 0;
  const stopPreview = () => {
    epoch++;
    speech?.stop();
    speech = null;
  };

  const box = container.createDiv({ cls: 'orbis-pron-editor' });
  const input = box.createEl('input', { type: 'text', cls: 'orbis-input-full' });
  input.placeholder = t('lookup.pron_placeholder');
  input.value = current.say;

  const voices = deps.voices();
  if (voices.length) {
    const row = box.createDiv({ cls: 'orbis-pron-previews' });
    for (const v of voices) {
      const btn = row.createEl('button', { cls: 'orbis-ctrl-btn orbis-pron-preview-btn', text: `▶ ${v.label}` });
      btn.addEventListener('click', () => {
        // Lowercased here too, so the preview is what will actually be saved and spoken.
        const say = normalizePronunciationSay(input.value);
        if (!isValidPronunciationSay(say)) {
          input.focus();
          return;
        }
        // Spoken inside a carrier sentence, not alone. A bare word is synthesized as a one-word
        // SENTENCE (asCompleteUtterance appends the full stop that stops Piper clipping it), so it
        // gets sentence-final pitch and lengthening that the same word never has mid-prose — and VITS
        // predicts prosody across the whole utterance, so neighbors change the rendering. Previewing
        // a bare word therefore tunes against the wrong target.
        stopPreview(); // a second tap, or another voice, supersedes the one playing
        const mine = ++epoch;
        // Busy, not disabled: disabling the focused button blurs it, and the keyboard does not come back when the
        // voice arrives. See `setBusy`. A second press while warming is superseded by `stopPreview` above anyway.
        setBusy(btn, true);
        void (async () => {
          try {
            deps.pauseAudio();
            const handle = await v.speak(t('lookup.pron_carrier', { word: say }), () => {
              if (mine === epoch) speech = null;
              setBusy(btn, false);
            });
            if (mine !== epoch) {
              handle.stop();
              return;
            }
            speech = handle;
          } catch (err) {
            setBusy(btn, false);
            // Distinct from "no voice configured": a server voice needs its server reachable. Declining the voice
            // download is an answer, not a failure.
            if (mine === epoch && !(err instanceof VoiceNotHereError))
              new Notice(t('lookup.pron_preview_failed', { voice: v.label }));
          }
        })();
      });
    }
  }

  // Toggling Active here saves a trip to the glossary manager just to switch a respelling off. It
  // applies on Save, not on tick: this dialog has an explicit Cancel, and a control that bypassed it
  // would make Cancel a lie about part of the form.
  if (showEntryControls) {
    const label = box.createEl('label', { cls: 'orbis-pron-active-row' });
    const cb = label.createEl('input', { type: 'checkbox', cls: 'orbis-pron-row-check' });
    cb.checked = enabled;
    label.createSpan({ text: t('lookup.pron_active') });
    cb.addEventListener('change', () => {
      enabled = cb.checked;
    });
  }

  const save = () => {
    const say = input.value.trim();
    if (!isValidPronunciationSay(say)) {
      input.focus();
      return;
    }
    void (async () => {
      // undefined where the toggle wasn't shown, so the stored flag is preserved rather than
      // rewritten from a value this form never let the user see.
      await deps.upsert(word, say, showEntryControls ? enabled : undefined);
      surface.close();
      surface.onChanged();
    })();
  };

  // Remove sits one row below the preview buttons, so on a phone it's easy to hit when reaching for
  // a preview — and it destroys a respelling with no undo. Confirmed INLINE rather than in a nested
  // dialog because this form is hosted by two different surfaces: a body-attached reader popup and a
  // Settings Modal. A popup opened from inside a Modal lands outside its DOM, where Obsidian's focus
  // containment makes it unusable (see ui-utils.createOrbisPopup), so there is no one dialog that
  // works from both. Swapping the row in place needs no surface of its own.
  const confirmEl = box.createDiv({ cls: 'orbis-pron-remove-confirm' });
  confirmEl.hide();
  /**
   * While the question is up, the keyboard belongs to it.
   *
   * **Tab stays between Keep and Remove**, and Escape means Keep. A pending question that a reader can Tab straight
   * out of is a question they can leave unanswered while the form underneath still looks live — and Escape, which the
   * popup reads as "close", would otherwise throw away the whole editor rather than the question. Attached once, to
   * the strip that persists: its CONTENTS are rebuilt on every Remove press, and a listener per press would stack up.
   * Harmless while hidden, since a hidden strip holds nothing focusable.
   */
  trapTab(confirmEl);
  confirmEl.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    confirmEl.hide();
    btns.show();
    removeBtn?.focus();
  });
  const btns = actionRow(box, { placement: 'inline', wrap: true });
  /** The Remove button, so the question can hand the keyboard back to it when answered with Keep or Escape. */
  let removeBtn: HTMLButtonElement | null = null;

  if (showEntryControls) {
    // No `orbis-ctrl-btn`: that is the flat toolbar control, and this is a dialog action. A bare button
    // takes Obsidian's own secondary styling, which is what every other dialog's footer uses.
    removeBtn = btns.createEl('button', { text: t('action.remove') });
    removeBtn.addEventListener('click', () => {
      stopPreview(); // don't leave a preview talking over the confirmation
      confirmEl.empty();
      confirmEl.createDiv({ cls: 'orbis-lookup-status', text: t('lookup.pron_remove_confirm', { word }) });
      const row = actionRow(confirmEl, { placement: 'inline', wrap: true });
      // Keep FIRST, in the slot Remove itself occupied: if the mis-tap that opened this was part of a
      // double-tap, the second tap lands on the harmless choice rather than confirming the delete.
      const keep = row.createEl('button', { text: t('lookup.pron_remove_keep') });
      keep.addEventListener('click', () => {
        confirmEl.hide();
        btns.show();
        // Back to the button that asked, which is where the reader was.
        removeBtn?.focus();
      });
      row.createEl('button', { cls: 'mod-destructive', text: t('action.remove') }).addEventListener('click', () => {
        void (async () => {
          await deps.remove(word);
          surface.close();
          surface.onChanged();
        })();
      });
      btns.hide();
      confirmEl.show();
      // The harmless answer takes the keyboard, for the reason Keep is drawn first: a stray second press lands on
      // "no". A confirmation that opens with nothing focused is one a keyboard reader has to go looking for.
      keep.focus();
    });
  }
  // No `orbis-ctrl-btn` on any of this dialog's actions: that class is the flat TOOLBAR control, and using it
  // here would put a muted 11px Cancel beside a full-size `mod-cta` Save.
  btns.createEl('button', { text: t('action.cancel') }).addEventListener('click', () => surface.close());
  btns.createEl('button', { cls: 'mod-cta', text: t('action.save') }).addEventListener('click', save);

  // Hint LAST, below the buttons: with the mobile keyboard open the bottom of the dialog is cut off,
  // and losing explanatory text there is far better than losing Save. Collapsed, because four
  // sentences of guidance are taller than the whole form on a phone.
  createCollapsibleNote(box, t('lookup.pron_hint'), t('lookup.pron_hint_more'));

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      save();
      return;
    }
    // Caret-movement keys stay inside the field: this popup is body-attached and sits over the
    // reader, and an ancestor acting on arrow/Home/End would stop the caret moving while typing.
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) {
      e.stopPropagation();
      // Arrow keys can intermittently stop moving the caret in reader-side popups (the note editor too;
      // not the Settings glossary editor or the Add-mix prompt; a reload clears it). Log ONLY the
      // anomalies, so this is silent unless it happens and then says which of the two possible causes
      // it is: something upstream cancelled the event, or the field lost focus.
      if (e.defaultPrevented) console.warn('orbis: caret key arrived already cancelled', e.key);
      else if (input.ownerDocument.activeElement !== input)
        console.warn('orbis: caret key with input unfocused', e.key);
    }
  });
  window.setTimeout(() => input.focus(), 50);

  return { stopPreview };
}

/**
 * Surface for the reader: a floating Orbis popup, nested over the lookup popup. `dismissOnOutsideClick`
 * is off because the popup holds unsaved text; the popup stack applies Escape to the topmost only.
 */
export function openPronunciationEditorPopup(
  host: OrbisPopupHost,
  deps: PronunciationEditorDeps,
  word: string,
  current: PronunciationDraft,
  onChanged: () => void
): void {
  let stopPreview = () => {};
  const { popupEl, close } = createOrbisPopup(host, {
    title: t('lookup.pron_editor_title', { word }),
    icon: glossarySvg(),
    dismissOnOutsideClick: false,
    desktopWidth: '440px',
    mobileFillAvailable: true,
    onClose: () => stopPreview(),
  });
  // The lookup popup is the only route to Remove / Active for a word found while reading.
  ({ stopPreview } = renderPronunciationForm(popupEl, deps, word, current, {
    close,
    onChanged,
    showEntryControls: true,
  }));
}

/**
 * Surface for anything already inside Obsidian's Settings modal. An Obsidian Modal rather than
 * createOrbisPopup: a body-attached popup would sit outside the Settings modal's DOM and its input
 * would be unfocusable (see the note at the top of this file).
 */
/**
 * The glossary's glyph: an "A" with sound waves — a letter being spoken, which is what a respelling is.
 *
 * Worn by both glossary dialogs (the list and the editor) and by the look-up popup's Pronunciation button
 * that opens the editor. Two levels of one subsystem sharing a mark is the point: drilling from the list
 * into an entry never reads as having left for somewhere else. See docs/design/dialog-system.md.
 *
 * Uppercase deliberately. A lowercase `a` at this size loses its counter and reads as a blob, and it has to
 * survive beside nine other glyphs — the waves keep it clear of `Aa` (annotations) while the letter keeps
 * it clear of the speaker and headphones, which are about audio OUTPUT rather than about a word.
 */
export function glossarySvg(size = 16): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">` +
    '<text x="1" y="18.5" font-size="17" font-weight="700" font-family="inherit" fill="currentColor">A</text>' +
    '<path d="M15.5 9a5.5 5.5 0 0 1 0 6.5" fill="none" stroke="currentColor" stroke-width="2"' +
    ' stroke-linecap="round"/>' +
    '<path d="M19.5 6a10 10 0 0 1 0 12.5" fill="none" stroke="currentColor" stroke-width="2"' +
    ' stroke-linecap="round"/>' +
    '</svg>'
  );
}

export class PronunciationEditorModal extends OrbisModal {
  private stopPreview: () => void = () => {};

  constructor(
    private readonly heightLock: PronunciationEditorHost,
    private readonly deps: PronunciationEditorDeps,
    private readonly word: string,
    private readonly current: PronunciationDraft,
    private readonly onChanged: () => void,
    /** Fires whichever way the dialog goes away, so the opener can drop its one-at-a-time guard. */
    private readonly onClosed?: () => void
  ) {
    super(heightLock.app, { icon: glossarySvg() });
  }

  private unpin: () => void = () => {};

  protected dialogTitle(): string {
    return t('lookup.pron_editor_title', { word: this.word });
  }

  protected renderDialog(): void {
    // `reserve`: two fields and a preview, all of which have to stay readable while one of them is being typed.
    //
    this.unpin = pinModalAboveKeyboard(this.modalEl, this.heightLock, { layout: 'reserve' });
    ({ stopPreview: this.stopPreview } = renderPronunciationForm(this.contentEl, this.deps, this.word, this.current, {
      close: () => this.close(),
      onChanged: this.onChanged,
      // Opened from the glossary manager, whose rows already carry Delete and ACTIVE.
      showEntryControls: false,
    }));
  }

  protected onDialogClose(): void {
    this.unpin();
    this.stopPreview();
    this.onClosed?.();
  }
}
