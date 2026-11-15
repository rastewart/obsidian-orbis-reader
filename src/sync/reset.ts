// Putting this device back to before it had ever published anything.
//
// **For the dev command, and only for it.** There is no reader-facing reason to erase what other devices published —
// turning the switch off deliberately leaves their files alone. This exists so the first-run path can be walked more
// than once: the setup dialog, the suggested name, the empty folder, the first scan.
//
// Recoverable by design, and worth knowing before running it: every device republishes its own copies on its next
// scan, because a device's own files are derived from what its `data.json` holds. What does not come back is what
// only this device knew — its counter, and the versions it had stamped.

import type { App } from 'obsidian';
import { forgetMultiDeviceAsked, setMultiDeviceEnabled } from '../multi-device';
import { resetClock } from './clock';
import { forgetSyncSetup } from './enabled';
import { parseSyncFileName } from './paths';

/** How many published copies the vault holds, wherever they are. For a confirmation that says what it will do. */
export function publishedCopyCount(app: App): number {
  return app.vault.getFiles().filter((file) => parseSyncFileName(file.name)).length;
}

/**
 * Trash every published copy in the vault — this device's and everyone else's.
 *
 * **Trashed, not erased**, by Obsidian's own rule for files in a reader's vault. Answers how many went.
 */
export async function deletePublishedCopies(app: App): Promise<number> {
  const files = app.vault.getFiles().filter((file) => parseSyncFileName(file.name));
  for (const file of files) await app.fileManager.trashFile(file);
  return files.length;
}

/**
 * Forget that this device ever published: the switch, the setup answer, the counter — and that it was taking
 * part in multi-device use at all.
 *
 * **The master switch has to go too, or this is not first-run.** Publishing lives underneath it, so a reset
 * that left it on would put the device back to a state it has never actually been in: participating, with
 * every answer beneath blank. The dev command exists to see the first-run dialogs again, and they are behind
 * that switch.
 */
export function forgetPublishing(): void {
  forgetSyncSetup();
  setMultiDeviceEnabled(false);
  // And that the offer was ever made, or the first-run prompt this command exists to see again is the one
  // thing it cannot bring back.
  forgetMultiDeviceAsked();
  resetClock();
}
