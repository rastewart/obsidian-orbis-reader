// Where Orbis opens something beside what you are using — a note about the book, the book's reading data, the book
// a second time — and which way that split goes.

import type { App, FileView, TFile, WorkspaceLeaf } from 'obsidian';

/**
 * The narrowest a pane may be and still be split side by side: each half is then at least 400 px wide.
 *
 * From devices, not a guess: the reader's toolbar sat comfortably in a half-window pane of about 385 px on a Mac, and
 * ran its progress readout across its buttons in a half pane on an iPad mini in portrait, a little under that.
 */
const SIDE_BY_SIDE_MIN_WIDTH = 800;

/**
 * A new pane beside the one in use — or below it, when side by side would leave each too narrow to read in.
 *
 * Measured on the pane Obsidian splits, `getMostRecentLeaf`, which is what `getLeaf('split')` splits. A pane whose
 * width cannot be read splits the way Obsidian would. On a phone Obsidian opens a new tab either way.
 */
export function splitLeaf(app: App): WorkspaceLeaf {
  const width = app.workspace.getMostRecentLeaf()?.view.containerEl.clientWidth ?? 0;
  return app.workspace.getLeaf('split', width > 0 && width < SIDE_BY_SIDE_MIN_WIDTH ? 'horizontal' : 'vertical');
}

/**
 * Open a note beside what you are looking at — or below it, on a narrow screen — or go to the pane already showing it.
 *
 * **A split, never the current pane.** Every one of these calls is made from over something you are using — a menu on
 * the reader, a row in the Library — and `getLeaf(false)` replaces it: the book you were reading, or the Library you
 * were browsing. A split keeps both, which for a note *about* the book is the point of opening it at all.
 *
 * Not a new tab either: it keeps the book loaded, but it puts the note in front of it, so reading the note means the
 * book is gone from view — the same loss one keystroke later.
 *
 * **And the same note twice is the same pane.** Asking again is asking to see it, not to have two of it, so an existing
 * pane is revealed and focused instead.
 */
export async function openNoteBeside(app: App, file: TFile): Promise<void> {
  let existing: ReturnType<App['workspace']['getLeaf']> | null = null;
  app.workspace.iterateAllLeaves((leaf) => {
    if (existing) return;
    if ((leaf.view as FileView).file?.path === file.path) existing = leaf;
  });
  if (existing) {
    app.workspace.setActiveLeaf(existing, { focus: true });
    return;
  }
  await splitLeaf(app).openFile(file, { active: true });
}
