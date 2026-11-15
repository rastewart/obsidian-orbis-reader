// Ask before doing something that cannot be taken back: a question, a Cancel and one button that does it.
//
// **One shape for every confirm.** Every dialog asking this question with these two buttons goes through here, so
// none is free to drift in button order, styling or what dismissing means. The differences that are REAL are options
// here (several lines instead of one; a confirm that is the expected outcome rather than the discouraged one).
//
// Its own file because two unrelated places need it — Settings (deleting a voice that is in use) and the dashboard
// editor (deleting a dashboard) — and the dashboard editor is imported BY Settings, so importing it back from
// there would be a cycle.
//
// A real Modal for the same reason StyleNameModal is: these open on top of Obsidian's own Settings modal.

import type { App } from 'obsidian';
import { actionButton, actionRow } from './controls';
import { t } from './i18n';
import { OrbisModal } from './OrbisModal';

export interface ConfirmSpec {
  title: string;
  /**
   * One paragraph, or several — a plan with a list of consequences reads as lines, not as a sentence.
   *
   * **Empty when there is nothing to add.** A confirm's body exists to say what ELSE happens — "this cannot be
   * undone", "the recordings it points to are kept", "and its 12 marks". Where the honest answer is "nothing",
   * saying so is a line the reader has to read to learn they did not need it, and the title plus the two buttons
   * already are the whole question.
   */
  message: string | readonly string[];
  /** What the button that does it says. One word where one will do: "Delete", not "Delete style". */
  confirmText: string;
  /**
   * What the way out says, when "Cancel" is the wrong word for it.
   *
   * Almost always Cancel — one word, one string, and the answer most of these dialogs want. Two exceptions, and the
   * difference between them is whether the dialog comes back:
   *
   * - **"Not now"** declines an offer that WILL return — the multi-device prompt, which asks again next session.
   *   "Cancel" there would suggest abandoning something the reader had started.
   * - **"Got it"** acknowledges something the reader was TOLD, in a dialog shown once and never again — the
   *   welcome. "Not now" there would be a small promise the plugin does not keep: *not now* implies *ask me again*,
   *   and nothing ever does.
   */
  cancelText?: string;
  /**
   * A third answer, for a dialog that is an OFFER rather than a guard: never. An offer needs three — yes, not now,
   * and never — and each gets a button of its own.
   *
   * **Not a tick beside the buttons.** That was the first shape, and it made one control change what the others
   * meant: ticked, "Not now" meant never and "Set up" ignored it. A button says one thing whatever else is on screen.
   *
   * It sits apart, at the start of the row, because it is the answer that is regretted when picked by mistake. The
   * row wraps, so on a narrow phone it takes a line of its own rather than squeezing the other two. Choosing it
   * answers `false` to the caller, after `onDecline` has run.
   */
  decline?: { label: string; onDecline: () => void };
  /**
   * Whether the confirm is also the CALL TO ACTION.
   *
   * **Off by default, and that is the point.** The answer most of these dialogs want is Cancel — they exist to slow
   * a tap down — and a confirm styled as the primary action invites exactly the tap being guarded against.
   *
   * On for a confirm that is the expected outcome rather than the discouraged one: replacing a file you have just
   * chosen to save over is what pressing Save meant, and making the reader hunt for the quiet button would be the
   * dialog disagreeing with the action that opened it.
   */
  cta?: boolean;
  /**
   * Whether the thing being confirmed actually destroys something. **Defaults to true**, because that is what a
   * confirm is usually for.
   *
   * **Off for an INVITATION.** Left on, "Set up" on the multi-device prompt and "Open setup" on the welcome would
   * both draw a red filled button, because `mod-destructive` and `mod-cta` are separate classes and red wins the
   * background — a first impression of the plugin in the color that means *you are about to lose something*.
   *
   * `cta` does not answer this — replacing a file is both the call to action and genuinely destructive, which is
   * why the two are separate flags rather than one.
   */
  destructive?: boolean;
  /**
   * Nobody asked for this one — it arrived on its own.
   *
   * Buys the two things `OrbisModal` gives an unprompted dialog: the "from Orbis" line above the heading, because a
   * question arriving over a book could be any of a dozen plugins and nobody can answer a question they cannot
   * place; and the DOM dedupe, so a second copy cannot stack behind the first. Both matter for the same dialog —
   * the multi-device offer — and neither is right for a confirm the reader summoned by tapping Delete.
   */
  unprompted?: boolean;
}

class ConfirmModal extends OrbisModal {
  private resolved = false;
  constructor(
    app: App,
    private spec: ConfirmSpec,
    private onResult: (ok: boolean) => void
  ) {
    super(app, { unprompted: spec.unprompted });
  }

  protected dialogTitle(): string {
    return this.spec.title;
  }

  protected renderDialog() {
    const lines = typeof this.spec.message === 'string' ? [this.spec.message] : this.spec.message;
    for (const line of lines) this.contentEl.createEl('p', { text: line });
    // A confirm with nothing to add leaves `contentEl` empty, and an empty body still takes its padding — so the
    // dialog would draw a band of blank between the title and the footer rule and read as though it had failed to
    // load. The footer is a sibling on `modalEl`, so collapsing this element is safe.
    this.contentEl.toggleClass('orbis-dialog-bodyless', !this.contentEl.hasChildNodes());
    const row = actionRow(this.footer(), { wrap: !!this.spec.decline });
    if (this.spec.decline) {
      const { label, onDecline } = this.spec.decline;
      actionButton(row, {
        label,
        onClick: () => {
          onDecline();
          this.close();
        },
      }).addClass('orbis-action-aside');
    }
    // Cancel first, in the slot nearest whatever was just pressed: a stray second click after a mis-click lands on
    // the harmless choice.
    // And the keyboard starts on it, wherever it sits — a `decline` button now leads the row.
    const wayOut = actionButton(row, {
      label: this.spec.cancelText ?? t('action.cancel'),
      onClick: () => this.close(),
    });
    wayOut.dataset.orbisStart = '';
    actionButton(row, {
      label: this.spec.confirmText,
      destructive: this.spec.destructive !== false,
      cta: this.spec.cta === true,
      onClick: () => {
        this.resolved = true;
        this.onResult(true);
        this.close();
      },
    });
  }

  protected onDialogClose(): void {
    // Dismissed without answering. Closing a warning is never consent to the thing it warned about.
    if (!this.resolved) this.onResult(false);
  }
}

/**
 * Is this question already on screen?
 *
 * Only for an `unprompted` one, and by heading in the DOM rather than a flag in this module — the same test
 * `openOrbisDialog` makes, for the same reason: a plugin reload re-evaluates the module and forgets everything it
 * held, while the dialog the previous instance opened is still up. A question raised twice is two dismissals for one
 * decision, and the second copy can be invisible behind the first on a phone.
 *
 * Declining answers `false`, because never having been asked and dismissing without answering mean the same thing.
 */
function alreadyAsking(spec: ConfirmSpec): boolean {
  return spec.unprompted === true && !!activeDocument.querySelector(`[data-orbis-dialog="${CSS.escape(spec.title)}"]`);
}

/** Ask, and run `onConfirm` only if the answer is yes. The shape most call sites actually want. */
export function confirmThen(app: App, spec: ConfirmSpec, onConfirm: () => void): void {
  if (alreadyAsking(spec)) return;
  new ConfirmModal(app, spec, (ok) => {
    if (ok) onConfirm();
  }).open();
}

/** The same question as a promise, for a caller that has to await the answer before carrying on. */
export function askToConfirm(app: App, spec: ConfirmSpec): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    if (alreadyAsking(spec)) {
      resolve(false);
      return;
    }
    new ConfirmModal(app, spec, resolve).open();
  });
}

/**
 * Replace or cancel — the one shape every "there is already a file there" question uses.
 *
 * A named wrapper rather than a dialog of its own: the same two buttons asking the same question, and a second copy
 * is how they drift into looking like two features. What it carries is `cta: true` — replacing a file you have just
 * chosen to save over is the expected outcome of pressing Save, not something to be talked out of, which is the
 * opposite of what most confirms want. That difference is a stated option, not the reason for a second
 * implementation.
 *
 * Here rather than beside `openOrbisDialog`: this file already imports `OrbisModal`, so putting it there would make
 * a cycle between the two modules.
 */
export function confirmReplace(
  app: App,
  opts: { title: string; message: string; replace: string; cancel: string }
): Promise<boolean> {
  // `cancel` is accepted and ignored: every confirm says Cancel, from one string.
  return askToConfirm(app, { title: opts.title, message: opts.message, confirmText: opts.replace, cta: true });
}
