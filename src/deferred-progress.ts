// A dialog that appears only if the work outlasts it being worth showing one.
//
// **The threshold is the whole idea.** Under it nothing appears and the command feels instant, which for
// something like *Read in Orbis Reader* is the promise; over it, a long article gets something to look at
// instead of a window that seems to have ignored the tap. A dialog that flashes for 200ms is worse than no
// dialog at all — it reads as a glitch, and the eye has time to notice that something happened without time to
// read what.
//
// **No Cancel, deliberately.** A caller whose work cannot be aborted mid-run would be offering a button that
// hides a dialog while the result arrives a moment later anyway, which is a small lie told by the interface.
// Dismissing the dialog with Escape or × hides it and nothing more — which is honest, because there is no button
// promising otherwise.

import type { App } from 'obsidian';
import { openOrbisDialog } from './OrbisModal';

/** Long enough that a flash is impossible, short enough that a wait is never unexplained. */
const DEFAULT_DELAY_MS = 400;

/**
 * Run `work`, showing a dialog if it is still running after `delayMs`.
 *
 * The dialog closes when the work settles, whether it resolved or threw — a progress dialog outliving its job is
 * the one failure mode here that a reader cannot get out of, so the close is in a `finally`.
 */
export async function withDeferredProgress<T>(
  app: App,
  opts: { title: string; message: string; delayMs?: number },
  work: () => Promise<T>
): Promise<T> {
  // An object rather than two `let`s: TypeScript's flow analysis cannot see an assignment made inside a callback,
  // so a plain variable would still be narrowed to `null` where it is called below.
  const dialog: { close?: () => void; done?: boolean } = {};
  const timer = window.setTimeout(() => {
    // Checked here as well as cleared below: `clearTimeout` cannot un-fire a callback that is already queued,
    // and opening a dialog for work that has just finished is exactly the flash this exists to prevent.
    if (dialog.done) return;
    openOrbisDialog(app, { title: opts.title, compact: true }, (body, dismiss) => {
      dialog.close = dismiss;
      body.createEl('p', { text: opts.message });
    });
  }, opts.delayMs ?? DEFAULT_DELAY_MS);

  try {
    return await work();
  } finally {
    dialog.done = true;
    window.clearTimeout(timer);
    dialog.close?.();
  }
}
