// Import fonts: choose font files on this device, see what they are, and copy them into the fonts folder.
//
// **Font files, or zips of them** — see `font-import.ts`, which sorts what was chosen into families.
//
// **What the files say decides everything** (`font-file.ts`): which family each belongs to, and which of the four
// faces it is. The dialog shows each family with its four faces, so a reader who chose only Regular sees, before
// anything is copied, that bold and italic text will be imitated.
//
// **A family needs a Regular face.** Without one there is nothing to draw ordinary text with, so the family is listed
// with the reason and not imported. The other three are wanted, not required: the reader draws a missing bold or
// italic by thickening or slanting Regular, and a PDF falls back to DejaVu.
//
// See docs/design/fonts.md § Importing.

import { type App, Notice, normalizePath, TFile } from 'obsidian';
import { actionButton, actionRow } from './controls';
import { FACE_SLOTS, type FaceSlot } from './font-file';
import { gatherImport, type ImportFamily, type ImportProblem, type Refused } from './font-import';
import { fontsFolderOf, knownFonts, scanFonts } from './fonts';
import { t } from './i18n';
import { OrbisModal } from './OrbisModal';
import { ensureVaultFolder } from './reader/record-move';
import { sanitizeVaultName } from './vault-names';

const SLOT_LABEL: Record<FaceSlot, Parameters<typeof t>[0]> = {
  regular: 'fonts.face_regular',
  italic: 'fonts.face_italic',
  bold: 'fonts.face_bold',
  boldItalic: 'fonts.face_bold_italic',
};

const PROBLEM_LABEL: Record<ImportProblem, Parameters<typeof t>[0]> = {
  'web-font': 'fonts.problem_web_font',
  collection: 'fonts.problem_collection',
  'not-a-font': 'fonts.problem_not_a_font',
  damaged: 'fonts.problem_damaged',
  'bad-zip': 'fonts.problem_bad_zip',
  'empty-zip': 'fonts.problem_empty_zip',
};

/** The names of the faces a family has, or is missing, in the order a reader expects. */
export function faceNames(slots: Iterable<FaceSlot>, or = false): string {
  const set = new Set(slots);
  const names = FACE_SLOTS.filter((s) => set.has(s)).map((s) => t(SLOT_LABEL[s]));
  // "No Italic or Bold Italic", not "No Italic, Bold Italic": a list of what is missing reads as alternatives.
  if (or && names.length > 1)
    return t('fonts.faces_or', { faces: names.slice(0, -1).join(', '), last: names.at(-1) ?? '' });
  return names.join(', ');
}

/** A folder name for a family: one a vault can hold and Obsidian shows, whatever the font calls itself. */
export function familyFolderName(family: string): string {
  return sanitizeVaultName(family, { max: 80, fallback: 'Font' });
}

/**
 * Ask the system for font files, then show what they are.
 *
 * `doc` is the document of the window the button is in: on a computer, Settings is a window of its own, and a file
 * picker opened from another window would appear behind it.
 */
export function importFonts(app: App, folderSetting: () => string, doc: Document, after: () => void): void {
  const input = doc.body.createEl('input', {
    type: 'file',
    attr: { multiple: '', accept: '.ttf,.otf,.zip,font/ttf,font/otf,application/zip' },
  });
  input.hide();
  input.addEventListener('change', () => {
    const files = Array.from(input.files ?? []);
    input.remove();
    if (files.length === 0) return;
    void Promise.all(files.map(async (f) => ({ name: f.name, data: new Uint8Array(await f.arrayBuffer()) }))).then(
      (sources) => {
        const { families, refused } = gatherImport(sources);
        new FontImportModal(app, families, refused, fontsFolderOf(folderSetting()), after).open();
      }
    );
  });
  // A picker the reader closes without choosing fires nothing on some platforms, so the element would stay; it is
  // hidden, and the next import removes nothing but its own.
  input.click();
}

class FontImportModal extends OrbisModal {
  constructor(
    app: App,
    private readonly families: ImportFamily[],
    private readonly refused: Refused[],
    private readonly folder: string,
    private readonly after: () => void
  ) {
    super(app);
  }

  protected dialogTitle(): string {
    return t('fonts.import_title');
  }

  private importable(): ImportFamily[] {
    return this.families.filter((f) => f.covered.has('regular'));
  }

  protected renderDialog(): void {
    const { contentEl } = this;
    for (const family of this.families) {
      const block = contentEl.createDiv({ cls: 'orbis-font-import-family' });
      block.createEl('h3', { text: family.family });
      const missing = FACE_SLOTS.filter((s) => !family.covered.has(s));
      const facesLine = block.createDiv({ cls: 'orbis-font-import-faces' });
      facesLine.setText(t('fonts.import_faces', { faces: faceNames(family.covered) || '—' }));
      if (!family.covered.has('regular')) {
        block.createDiv({ cls: 'orbis-font-import-note mod-warning', text: t('fonts.import_needs_regular') });
        continue;
      }
      if (missing.length > 0) {
        block.createDiv({
          cls: 'orbis-font-import-note',
          text: t('fonts.import_missing', { faces: faceNames(missing, true) }),
        });
      }
      if (family.licenses.length > 0) {
        block.createDiv({
          cls: 'orbis-font-import-note',
          text: t('fonts.import_license', { files: family.licenses.map((l) => l.name).join(', ') }),
        });
      }
      if (knownFonts().some((f) => f.family.toLowerCase() === family.family.toLowerCase())) {
        block.createDiv({ cls: 'orbis-font-import-note', text: t('fonts.import_adds_to_existing') });
      }
    }
    if (this.refused.length > 0) {
      const block = contentEl.createDiv({ cls: 'orbis-font-import-family' });
      block.createEl('h3', { text: t('fonts.import_refused') });
      const list = block.createEl('ul');
      for (const file of this.refused) {
        list.createEl('li', { text: `${file.name} — ${t(PROBLEM_LABEL[file.problem])}` });
      }
    }
    const row = actionRow(this.footer());
    actionButton(row, { label: t('action.cancel'), onClick: () => this.close() });
    const go = actionButton(row, {
      label: t('fonts.import_button'),
      cta: true,
      disabled: this.importable().length === 0,
      onClick: () => {
        go.disabled = true;
        void this.copy().finally(() => this.close());
      },
    });
    go.dataset.orbisStart = '';
  }

  /** Write a file, replacing one of the same name. */
  private async write(at: string, data: Uint8Array): Promise<void> {
    const path = normalizePath(at);
    // A copy of exactly these bytes: a view into a zip's buffer would otherwise write the whole archive.
    const bytes = data.slice().buffer;
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) await this.app.vault.modifyBinary(existing, bytes);
    else await this.app.vault.createBinary(path, bytes);
  }

  /** Copy every file of every importable family into `<folder>/<family>/`, replacing a file of the same name. */
  private async copy(): Promise<void> {
    let count = 0;
    try {
      for (const family of this.importable()) {
        const dir = normalizePath(`${this.folder}/${familyFolderName(family.family)}`);
        await ensureVaultFolder(this.app, dir);
        for (const file of family.files) {
          await this.write(`${dir}/${file.name}`, file.data);
          count++;
        }
        for (const license of family.licenses) await this.write(`${dir}/${license.name}`, license.data);
      }
      await scanFonts();
      new Notice(count === 1 ? t('fonts.imported_one') : t('fonts.imported', { count }));
    } catch (err) {
      console.error('[Orbis] could not import fonts —', err);
      new Notice(t('fonts.import_failed'));
    }
    this.after();
  }
}
