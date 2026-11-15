// Put reading records back to "never set up", from inside Obsidian.
//
// On every device, the phone and the tablet included, where the first-run flow most needs walking through: answering
// the destination dialog stores a folder, sets `recordsSetupDone`, creates folders, and stamps a decision into each
// book's `.orbis`. None of that is undoable from the UI, because a first run happens once.
//
// **Dev-only, and behind the dev-commands flag** — nobody reading a book needs a button that deletes their notes. The
// copy here is deliberately not localized for the same reason the dev commands in main.ts are not.
//
// The dialog IS the dry run: it lists every folder it would trash, with note counts, and every book whose decision
// it would clear, before anything happens. Nothing is deleted that we cannot show is ours — an empty folder, or one
// holding a generated base or a `content/` tree. A folder someone has filled with their own notes is reported and
// left.

import { type App, Notice, TFile, TFolder } from 'obsidian';
import { isBookExtension } from './book-formats';
import { actionButton, actionRow } from './controls';
import type OrbisReaderPlugin from './main';
import { openOrbisDialog } from './OrbisModal';
import { readBookRecords, saveBookRecords } from './progress';
import { DEFAULT_PLUGIN_SETTINGS, DEFAULT_RECORDS_FOLDER } from './settings';
import { annotationsSvg } from './system-glyphs';

/** The reading-records settings, reset from `DEFAULT_PLUGIN_SETTINGS` rather than from a second list of literals — a
 *  copy would drift from the real defaults and the reset would stop being one. */
const RESET_KEYS = [
  'recordsMode',
  'recordsFolder',
  'recordsSameFolderAsBook',
  'recordsAllBooksBaseFolder',
  'recordsSetupDone',
  'recordKinds',
] as const;

/** Settings earlier shapes of this feature wrote. Dropped rather than reset, so what is left looks like a vault
 *  that never had them — which is what the migrations are then tested against. */
const LEGACY_KEYS = ['recordsEnabled', 'recordsAllBooksBase'];

/** A folder we generated: empty (the destination dialog creates it on Save), or holding a base or a `content/`
 *  tree. Anything else may be the reader's own and is never trashed. */
function looksGenerated(folder: TFolder): boolean {
  if (!folder.children.length) return true;
  return folder.children.some(
    (c) => (c instanceof TFile && c.extension === 'base') || (c instanceof TFolder && c.name === 'content')
  );
}

function markdownCount(folder: TFolder): number {
  let n = 0;
  for (const child of folder.children) {
    if (child instanceof TFolder) n += markdownCount(child);
    else if (child instanceof TFile && child.extension === 'md') n++;
  }
  return n;
}

interface RecordsResetPlan {
  folders: { folder: TFolder; notes: number; generated: boolean; why: string }[];
  /** Books whose `.orbis` holds a records decision. */
  books: TFile[];
  /** Settings that are not already at their default. */
  keys: string[];
}

/**
 * What a reset would do, without doing any of it.
 *
 * Folder candidates come from the CURRENT settings — the only record of where the last run wrote — plus the
 * proposed folder name whatever its casing (a run cancelled halfway can leave one behind with nothing pointing at
 * it) and every `<book>-reading-records` folder, which is the book-local layout.
 */
async function planRecordsReset(plugin: OrbisReaderPlugin): Promise<RecordsResetPlan> {
  const app: App = plugin.app;
  const s = plugin.settings as unknown as Record<string, unknown>;

  const seen = new Set<string>();
  const folders: RecordsResetPlan['folders'] = [];
  const consider = (path: string, why: string): void => {
    const clean = path.trim().replace(/^\/+|\/+$/g, '');
    // The vault root is never a candidate, however it was spelled. Everything else here is a named subfolder.
    if (!clean || seen.has(clean)) return;
    seen.add(clean);
    const folder = app.vault.getAbstractFileByPath(clean);
    if (!(folder instanceof TFolder)) return;
    folders.push({ folder, notes: markdownCount(folder), generated: looksGenerated(folder), why });
  };
  consider(plugin.settings.recordsFolder, 'the records folder in settings');
  consider(plugin.settings.recordsAllBooksBaseFolder, 'the every-book base folder in settings');
  for (const child of app.vault.getRoot().children) {
    if (child instanceof TFolder && child.name.toLowerCase() === DEFAULT_RECORDS_FOLDER.toLowerCase()) {
      consider(child.path, 'the proposed folder name');
    }
  }
  for (const file of app.vault.getAllLoadedFiles()) {
    if (file instanceof TFolder && file.name.endsWith('-reading-records')) {
      consider(file.path, 'a book-local records folder');
    }
  }

  // Only books that already have a sidecar with a decision in it: `saveBookRecords` writes through
  // `writeOrbisFile`, which CREATES the file and its folder, so asking every book to clear a key it does not have
  // would litter the vault with sidecars.
  const books: TFile[] = [];
  for (const file of app.vault.getFiles()) {
    if (!isBookExtension(file.extension)) continue;
    if ((await readBookRecords(app, file)) !== null) books.push(file);
  }

  const keys = [
    ...RESET_KEYS.filter((k) => JSON.stringify(s[k]) !== JSON.stringify(DEFAULT_PLUGIN_SETTINGS[k])),
    ...LEGACY_KEYS.filter((k) => k in s),
  ];
  return { folders, books, keys };
}

/** Do it. Returns what actually changed, which is what the notice reports. */
async function applyRecordsReset(
  plugin: OrbisReaderPlugin,
  plan: RecordsResetPlan,
  opts: { deleteFolders: boolean }
): Promise<{ folders: number; books: number; keys: number }> {
  const app = plugin.app;
  let trashed = 0;
  if (opts.deleteFolders) {
    for (const entry of plan.folders) {
      if (!entry.generated) continue;
      await app.fileManager.trashFile(entry.folder).catch(() => {
        /* a folder left behind is untidy, not broken */
      });
      trashed++;
    }
  }
  for (const book of plan.books) await saveBookRecords(app, book, null);

  const s = plugin.settings as unknown as Record<string, unknown>;
  // A JSON round-trip rather than structuredClone: every default here is a plain JSON value by construction, and
  // this command exists to run on an iPad and an Android phone, where assuming the newer API buys nothing.
  for (const key of RESET_KEYS) s[key] = JSON.parse(JSON.stringify(DEFAULT_PLUGIN_SETTINGS[key]));
  for (const key of LEGACY_KEYS) delete s[key];
  await plugin.saveSettings();
  // The in-session "already asked about this book" set, which would otherwise suppress the very prompt this reset
  // exists to see again.
  plugin.recordsAsked.clear();
  return { folders: trashed, books: plan.books.length, keys: plan.keys.length };
}

// Dev-only copy, in one place. Keys are named so as not to collide with the i18n audit's sinks, because these
// strings genuinely are not localized — see the file header.
const COPY = {
  heading: 'Reset reading records (dev)',
  intro:
    'Puts reading records back to "never set up", so the first-run flow can be walked through again on this device.',
  nothing: 'Nothing to reset — reading records are already at their defaults on this device.',
  settingsOne: 'setting back to its default',
  settingsMany: 'settings back to their defaults',
  bookOne: "book's own decision cleared",
  bookMany: "books' own decisions cleared",
  foldersLabel: 'Also delete the generated folders',
  foldersDesc: 'The record notes, covers and bases inside them go too. Trashed, not erased.',
  keptSuffix: ' — holds files we did not generate, so it is left alone',
  cancel: 'Cancel',
  confirm: 'Reset',
  reopen: 'Reopen any book you have open — it holds its own decision in memory until then.',
};

/** The dialog: the plan, a switch for the destructive half, and one button that does it. */
export function openRecordsResetDialog(plugin: OrbisReaderPlugin): void {
  void (async () => {
    const plan = await planRecordsReset(plugin);
    if (!plan.folders.length && !plan.books.length && !plan.keys.length) {
      new Notice(COPY.nothing);
      return;
    }
    let deleteFolders = true;

    openOrbisDialog(plugin.app, { title: COPY.heading, icon: annotationsSvg(16) }, (body, close, _modalEl, footer) => {
      body.createDiv({ cls: 'orbis-records-authority' }).setText(COPY.intro);

      const list = body.createEl('ul');
      if (plan.keys.length) {
        list
          .createEl('li')
          .setText(`${plan.keys.length} ${plan.keys.length === 1 ? COPY.settingsOne : COPY.settingsMany}`);
      }
      if (plan.books.length) {
        list.createEl('li').setText(`${plan.books.length} ${plan.books.length === 1 ? COPY.bookOne : COPY.bookMany}`);
      }
      for (const entry of plan.folders) {
        const li = list.createEl('li');
        li.setText(`${entry.folder.path} — ${entry.notes} note(s), ${entry.why}`);
        // Named either way: a run that says nothing about what it skipped reads as "everything was covered".
        if (!entry.generated) li.appendText(COPY.keptSuffix);
      }

      /**
       * **A checkbox, not a switch.** A switch turns a feature on and leaves it that way; this adds a step to one
       * run of a destructive action and is remembered nowhere. The same idiom Export to vault uses for *Include
       * images*: a `<label>`, so the whole line is the target, with the consequence stated underneath.
       *
       * (The classes are named for that dialog, which was their only user until now.)
       */
      if (plan.folders.some((f) => f.generated)) {
        const row = body.createEl('label', { cls: 'orbis-radio-row' });
        const box = row.createEl('input', { type: 'checkbox', cls: 'orbis-radio-mt' });
        box.checked = deleteFolders;
        box.addEventListener('change', () => (deleteFolders = box.checked));
        const wrap = row.createDiv();
        wrap.createSpan({ text: COPY.foldersLabel, cls: 'orbis-radio-label' });
        wrap.createDiv({ text: COPY.foldersDesc, cls: 'orbis-radio-desc' });
      }

      // In the footer — see `InlineOrbisModal.renderDialog`.
      const actions = actionRow(footer());
      actionButton(actions, { label: COPY.cancel, onClick: () => close() });
      actionButton(actions, {
        label: COPY.confirm,
        cta: true,
        onClick: () => {
          close();
          void (async () => {
            const done = await applyRecordsReset(plugin, plan, { deleteFolders });
            new Notice(
              // i18n-audit-disable-next-line -- dev-only reset command, see the file header
              `Reset: ${done.keys} setting(s), ${done.books} book decision(s), ${done.folders} folder(s). ${COPY.reopen}`,
              8000
            );
          })();
        },
      });
    });
  })();
}
