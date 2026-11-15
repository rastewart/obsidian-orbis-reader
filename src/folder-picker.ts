// One way to ask for a folder: a picker listing what the vault has, and a "+" that makes one it does not.
//
// **The button is the point.** Answering "where should this go?" with a folder that does not exist yet is the ordinary
// case — the first time records are written, the first book downloaded — and the alternative is to abandon a
// half-answered dialog, make the folder in the file explorer, and start over. Seven dialogs had reasoned their way to
// that button independently; five others had a bare dropdown, which is not a decision anyone made but the shape you
// get when nothing makes the button the default. Two of the seven had grown their own `addFolderButton` helper,
// near-identical, which is what a missing shared one looks like from the inside.
//
// **Two entry points, one implementation.** Most callers have an Obsidian `Setting` row; two draw their fields into a
// CSS grid of their own and have no row to add to. `folderPickerRow` is `folderPickerControls` pointed at the row's
// control area, so the pair cannot drift apart the way the twelve hand-written ones did.
//
// Kept out of `ui-utils` because `NewFolderModal` imports from there, and a module cannot import the thing that
// imports it.

import { type App, ButtonComponent, type Setting } from 'obsidian';
import { t } from './i18n';
import type { TranslationKey } from './i18n/en';
import { NewFolderModal } from './NewFolderModal';
import { folderOptionsWith, newFolderButton } from './ui-utils';
import { exportFileName } from './vault-names';

/** What a dialog pinned above the on-screen keyboard needs told before a second dialog opens over it. */
export type HeightLock = { lockMobileHeights(): void; unlockMobileHeights(): void };

export interface FolderPickerSpec {
  app: App;
  /** The folder now — read at draw time and again when the "+" opens, so a new folder starts where the reader is. */
  current: () => string;
  onPick: (path: string) => void;
  /**
   * Options to offer ahead of the vault's folders: an empty entry naming a default, "the book's own folder", and so
   * on. First, because they are answers to the question rather than places in the vault.
   */
  extra?: Record<string, string>;
  /** How to label a folder that is set but does not exist yet — see `folderOptionsWith`. */
  pendingKey?: TranslationKey;
  /** For a dialog that pins itself above the keyboard: `NewFolderModal` has to unpin it and put it back. */
  heightLock?: HeightLock;
  /**
   * A restore key, for a caller that REPAINTS when the folder changes — the settings rows rebuild the whole page.
   *
   * Without one, `captureFocus` falls back to the element's position in the tree, which survives only while the
   * shape does: pick a folder in a row that then gains a "will be created" option, or press "+" and come back to a
   * page that has been rebuilt around you, and the keyboard lands somewhere else. The button takes `<key>-new`, so
   * a rebuild puts it back on the "+" rather than on the picker beside it.
   */
  focusKey?: string;
}

/**
 * The picker and its "+", drawn into any element.
 *
 * The "+" creates the folder immediately, so a reader who then cancels the dialog leaves an empty folder behind. That
 * is what the settings rows have always done, and an empty folder is trivially deletable — the alternative is
 * remembering an intention across a dialog that may never be saved.
 */
export function folderPickerControls(parent: HTMLElement, spec: FolderPickerSpec): HTMLSelectElement {
  const select = parent.createEl('select', { cls: 'dropdown' });
  if (spec.focusKey) select.dataset.orbisFocus = spec.focusKey;
  const folders = folderOptionsWith(spec.app, spec.current(), spec.pendingKey);
  for (const [value, label] of Object.entries(spec.extra ? { ...spec.extra, ...folders } : folders)) {
    select.createEl('option', { value, text: label });
  }
  select.value = spec.current();
  select.addEventListener('change', () => spec.onPick(select.value));

  const btn = new ButtonComponent(parent);
  if (spec.focusKey) btn.buttonEl.dataset.orbisFocus = `${spec.focusKey}-new`;
  newFolderButton(btn, () => {
    new NewFolderModal(
      spec.app,
      spec.current(),
      (path) => {
        // The picker has to show what was just made, whether or not the caller redraws: a "+" that creates a folder
        // and leaves the dropdown on the old one reads as having done nothing.
        if (!Array.from(select.options).some((option) => option.value === path)) {
          select.createEl('option', { value: path, text: path });
        }
        select.value = path;
        spec.onPick(path);
      },
      spec.heightLock
    ).open();
  });
  return select;
}

/** The same pair on an Obsidian settings row — which is where most callers have one. */
export function folderPickerRow(row: Setting, spec: FolderPickerSpec): HTMLSelectElement {
  return folderPickerControls(row.controlEl, spec);
}

/**
 * What a destination fold keeps across a redraw: whether it is open, and whether the reader emptied its name field.
 *
 * **The emptied field has to be remembered**, because these dialogs rebuild themselves on almost every change. A
 * rebuilt field is filled from the name in play, which for an emptied one is the default — so without this, the
 * grey hint would turn into typed text the moment any other control was touched.
 */
export interface FilingState {
  open: boolean;
  nameCleared?: boolean;
}

/** The two halves of a destination, for {@link destinationGrid}. */
export interface DestinationSpec {
  app: App;
  folder: () => string;
  onFolder: (path: string) => void;
  name: () => string;
  /**
   * Never empty: an emptied field arrives as {@link DestinationSpec.fallback}, so the summary, the "already exists"
   * check and the save itself go on seeing a real path. Already trimmed.
   */
  onName: (name: string) => void;
  /**
   * The name the dialog opened with — what an emptied field stands for, shown in it as placeholder text.
   *
   * **One answer for every dialog, and it is the default.** They used to answer an empty field three ways: one
   * disabled Save and reported the vault root as a folder that "already exists", one wrote `exported-book`, and one
   * pointed separate EPUBs at the folder of notes they were made from. A function, because a dialog's default can
   * follow a format or a style switch.
   */
  fallback: () => string;
  /** Where the dialog keeps its destination's state across a redraw — see {@link FilingState}. */
  held: FilingState;
  /** Restore key for the name input — the screens that use this rebuild themselves as you type. */
  nameKey: string;
  /** `.epub`, `.pdf`. Drawn beside the input rather than in the field, and stripped again by the path builder. */
  ext: string;
  /** Label for the name row. Defaults to "File name"; the per-note dialog names a FOLDER here instead. */
  nameLabel?: string;
  extra?: FolderPickerSpec['extra'];
  heightLock?: HeightLock;
}

/**
 * Where a file goes and what it is called, as two rows of a `90px 1fr` grid.
 *
 * **A grid, not two stacked settings rows.** Every export dialog asks this pair, and as stacked rows with their
 * dividers and descriptions they filled a phone screen for two short fields — which is what made these the loosest
 * dialogs in the plugin. The label column is narrow because both labels are short and neither needs explaining.
 *
 * The extension sits beside the input rather than in a description: shown where the typing happens it reads as
 * "this, then `.epub`", and nobody has to guess whether to type it. Every path builder strips a typed one anyway,
 * because someone will.
 */
export function destinationGrid(
  parent: HTMLElement,
  spec: DestinationSpec
): { nameLabel: HTMLElement; input: HTMLInputElement; setExt: (ext: string) => void } {
  const grid = parent.createDiv({ cls: 'orbis-field-grid' });

  grid.createSpan({ cls: 'orbis-field-label', text: t('epub_export.field_folder') });
  const folderCell = grid.createDiv({ cls: 'orbis-folder-cell' });
  folderPickerControls(folderCell, {
    app: spec.app,
    current: () => spec.folder() || '/',
    onPick: spec.onFolder,
    extra: spec.extra,
    heightLock: spec.heightLock,
  });

  const nameLabel = spec.nameLabel ?? t('epub_export.field_file_name');
  const label = grid.createSpan({ cls: 'orbis-field-label', text: nameLabel });
  const nameCell = grid.createDiv({ cls: 'orbis-folder-cell' });
  const input = nameCell.createEl('input', { type: 'text', cls: 'orbis-input-full' });
  input.value = spec.held.nameCleared ? '' : spec.name();
  input.placeholder = spec.fallback();
  input.dataset.orbisFocus = spec.nameKey;
  input.setAttribute('aria-label', nameLabel);
  input.addEventListener('input', () => {
    const typed = input.value.trim();
    spec.held.nameCleared = !typed;
    // A name of nothing but characters a file name cannot hold cleans away to nothing, so it is as empty as a
    // cleared field. It stays in the field until the next redraw, which fills in the default it stands for.
    spec.onName(exportFileName(typed, '') ? typed : spec.fallback());
  });
  // Always there, hidden when there is no extension, so a format switch can show or hide it — see below.
  const extEl = nameCell.createSpan({ cls: 'orbis-epub-ext' });
  const setExt = (ext: string) => {
    // i18n-audit-disable-next-line -- a file extension, not prose
    extEl.setText(ext);
    extEl.toggle(!!ext);
  };
  setExt(spec.ext);
  /**
   * Handed back for a caller whose format switch changes the name row without rebuilding the screen — Save as
   * Markdown holds its chapter ticks in the DOM, so a rebuild would throw them away. **The extension is one of
   * those changes**: it was drawn once, for the format the dialog opened with, so opening on Book folder and
   * switching to a single note showed no `.md`, and the other way round kept one beside a folder's name.
   */
  return { nameLabel: label, input, setExt };
}
