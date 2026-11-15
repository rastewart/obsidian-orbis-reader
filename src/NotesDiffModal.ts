import { diffLines } from 'diff';
import { App, Notice, TFile, TFolder } from 'obsidian';
import { actionRow } from './controls';
import { t } from './i18n';
import { openNoteBeside } from './panes';
import { annotationsSvg } from './system-glyphs';
import { captureFocus, createOrbisPopup, OrbisPopupHost } from './ui-utils';

// Diff rendering approach adapted from obsidian-file-diff
// Copyright (c) 2022 Till Friebe — MIT License
// https://github.com/friebetill/obsidian-file-diff

interface Hunk {
  removed: string;
  added: string;
  accepted: boolean;
  decided: boolean;
  el: HTMLElement;
}

export class FileDiffModal {
  private bodyEl: HTMLElement | null = null;
  private closePopup: (() => void) | null = null;

  constructor(
    private app: App,
    private host: OrbisPopupHost,
    private originalPath: string,
    private draftPath: string,
    private onResolved: () => void,
    private openAfterApply = false
  ) {}

  async open(): Promise<void> {
    const { popupEl, close } = createOrbisPopup(this.host, {
      title: t('file_diff_modal.merge_notes'),
      icon: annotationsSvg(16),
      dismissOnOutsideClick: false,
      desktopWidth: 'min(720px, 90vw)',
      mobileMaxWidth: 420,
      mobileFillHeight: true,
      onClose: () => {
        this.bodyEl = null;
        this.closePopup = null;
      },
    });
    this.closePopup = close;
    this.bodyEl = popupEl.createDiv();
    await this.render();
  }

  close(): void {
    this.closePopup?.();
  }

  private async render() {
    const contentEl = this.bodyEl;
    if (!contentEl) return;
    contentEl.empty();
    const desc = contentEl.createEl('p', {
      text: t('file_diff_modal.merge_desc'),
    });
    desc.addClass('orbis-desc-sm');

    const originalFile = this.app.vault.getFileByPath(this.originalPath);
    const draftFile = this.app.vault.getFileByPath(this.draftPath);
    if (!originalFile || !draftFile) {
      contentEl.createEl('p', { text: t('file_diff_modal.could_not_find_files') });
      return;
    }

    const [originalContent, draftContent] = await Promise.all([
      this.app.vault.read(originalFile),
      this.app.vault.read(draftFile),
    ]);

    const changes = diffLines(originalContent, draftContent);
    const hunks: Hunk[] = [];

    // ── Status line (change counter + accept/reject state) — created empty
    // here so it lands above the diff panel in DOM order; populated further
    // down once hunks are known.
    const statusRow = contentEl.createDiv({ cls: 'orbis-counter' });

    // ── Diff panel ────────────────────────────────────────────────────────
    /**
     * **The diff itself is a tab stop.**
     *
     * It is the thing the dialog is about, and it scrolls — so a reader working from the keyboard needs to be able to
     * get into it and move through it. A scroll container that can hold focus is scrolled by the arrow keys, Page
     * Up/Down, Home and End with no handler of ours: the whole feature is `tabIndex = 0` plus a name saying what the
     * arrows will do. Without it a reader can reach every control except the one worth reading.
     */
    const diffEl = contentEl.createDiv({ cls: 'orbis-diff-panel' });
    diffEl.tabIndex = 0;
    diffEl.setAttribute('role', 'region');
    diffEl.setAttribute('aria-label', t('file_diff_modal.changes_label'));

    const renderLines = (parent: HTMLElement, text: string, prefix: string, kind: 'removed' | 'added') => {
      const lines = text.split('\n');
      for (let j = 0; j < lines.length; j++) {
        if (j === lines.length - 1 && lines[j] === '') break;
        const row = parent.createDiv({ cls: `orbis-diff-row orbis-diff-row-${kind}` });
        row.dataset.prefix = prefix;
        row.createSpan({ text: prefix, cls: 'orbis-diff-prefix' });
        row.createSpan({ text: lines[j], cls: 'orbis-diff-text' });
      }
    };

    const renderContext = (text: string) => {
      const lines = text.split('\n');
      for (let j = 0; j < lines.length; j++) {
        if (j === lines.length - 1 && lines[j] === '') break;
        const row = diffEl.createDiv({ cls: 'orbis-context-row' });
        row.createSpan({ text: ' ', cls: 'orbis-context-prefix' });
        row.createSpan({ text: lines[j], cls: 'orbis-context-text' });
      }
    };

    for (let i = 0; i < changes.length; i++) {
      const c = changes[i];
      if (!c.removed && !c.added) {
        renderContext(c.value);
        continue;
      }
      const removed = c.removed ? c.value : '';
      let added = c.added ? c.value : '';
      const hunkEl = diffEl.createDiv({ cls: 'orbis-hunk' });
      // Colors (row background, prefix accent) live in styles.css under
      // .orbis-diff-row-removed/.orbis-diff-row-added, deliberately not
      // Obsidian's --text-error/--text-success on --background-modifier-
      // error/success: those two are saturated-accent-on-neutral-background
      // variables, not designed to be layered on each other, and depending
      // on the active theme's exact shades that pairing can leave the text
      // nearly illegible against its own background. The body text stays
      // --text-normal for guaranteed contrast in any theme; the red/green
      // distinction comes from the row background and the prefix accent
      // color (plus strikethrough for removed lines).
      if (c.removed) {
        renderLines(hunkEl, c.value, '-', 'removed');
        if (i + 1 < changes.length && changes[i + 1].added) {
          i++;
          added = changes[i].value;
          renderLines(hunkEl, added, '+', 'added');
        }
      } else {
        renderLines(hunkEl, c.value, '+', 'added');
      }
      hunks.push({ removed, added, accepted: false, decided: false, el: hunkEl });
    }

    if (hunks.length === 0) {
      // Nothing to merge: say so, and say ONLY that. The loop above has already rendered every line of the
      // file as context, so leaving it would show a scroll box full of unchanged content under an intro
      // promising arrows and Keep/Use buttons that are not there — with the message explaining why at the
      // very bottom of that box, below the fold. The panel goes, and the intro is replaced rather than
      // contradicted.
      statusRow.remove();
      diffEl.remove();
      desc.setText(t('file_diff_modal.nothing_to_merge'));
      const row = contentEl.createDiv({ cls: 'orbis-no-diff' });
      row.createEl('button', { text: t('action.close') }).addEventListener('click', () => {
        // Discard the draft, exactly as applying a merge does. Leaving it behind would leave "A merge is
        // already in progress" on the Generate notes dialog forever — a merge that had nothing to do and
        // could never be finished, only discarded by hand. Closing IS the resolution when there is no decision
        // to make.
        void (async () => {
          await this.app.fileManager.trashFile(draftFile);
          this.onResolved();
          this.close();
        })();
      });
      return;
    }

    // ── Legend ────────────────────────────────────────────────────────────
    const legend = contentEl.createDiv({ cls: 'orbis-diff-legend' });
    legend.createSpan({
      text: t('file_diff_modal.only_in_original'),
      cls: 'orbis-diff-legend-removed',
    });
    legend.createSpan({ text: t('file_diff_modal.only_in_new_version'), cls: 'orbis-diff-legend-added' });

    // ── Nav + decision row: [←] [Keep original] [Use new version →] ────────
    const decisionRow = contentEl.createDiv({ cls: 'orbis-decision-row' });
    const prevBtn = decisionRow.createEl('button', { text: '←', cls: 'orbis-order-btn' });
    prevBtn.setAttribute('aria-label', t('file_diff_modal.prev'));
    const rejectBtn = decisionRow.createEl('button', { text: t('file_diff_modal.keep_original') });
    const acceptBtn = decisionRow.createEl('button', { text: t('file_diff_modal.use_new_version') });
    const nextBtn = decisionRow.createEl('button', { text: '→', cls: 'orbis-order-btn' });
    nextBtn.setAttribute('aria-label', t('file_diff_modal.next'));

    // ── Cancel / Apply ───────────────────────────────────────────────────────
    // A popup has no `.orbis-dialog-footer`; `placement: 'footer'` is what stands in for one — the separator and
    // the spacing a Modal's footer gets from its own element.
    const btnRow = actionRow(contentEl, { placement: 'footer' });
    const cancelBtn = btnRow.createEl('button', { text: t('action.cancel') });
    const applyBtn = btnRow.createEl('button', { text: t('action.apply') });
    applyBtn.addClass('mod-cta');

    // ── Logic ─────────────────────────────────────────────────────────────
    let currentHunk = 0;

    const computeResult = (): string => {
      let result = '';
      let hi = 0;
      for (let i = 0; i < changes.length; i++) {
        const c = changes[i];
        if (!c.removed && !c.added) {
          result += c.value;
          continue;
        }
        const hunk = hunks[hi++];
        if (c.removed) {
          result += hunk.accepted ? hunk.added : hunk.removed;
          if (i + 1 < changes.length && changes[i + 1].added) i++;
        } else {
          if (hunk.accepted) result += hunk.added;
        }
      }
      return result;
    };

    const refreshVisuals = () => {
      hunks.forEach((h, idx) => {
        h.el.toggleClass('is-active', idx === currentHunk);
        h.el.toggleClass('is-accepted', h.decided && h.accepted);
        h.el.toggleClass('is-rejected', h.decided && !h.accepted);
      });
      hunks[currentHunk].el.scrollIntoView({ block: 'nearest' });
      prevBtn.disabled = currentHunk === 0;
      nextBtn.disabled = currentHunk === hunks.length - 1;

      statusRow.empty();
      statusRow.createDiv({
        text: t('file_diff_modal.change_n_of_n', { current: currentHunk + 1, total: hunks.length }),
      });
      const h = hunks[currentHunk];
      const statusLine = statusRow.createDiv();
      if (!h.decided) {
        statusLine.textContent = t('file_diff_modal.undecided');
        statusLine.addClass('orbis-status-undecided');
      } else if (h.accepted) {
        statusLine.textContent = t('file_diff_modal.accepted_new');
        statusLine.addClass('orbis-status-accepted');
      } else {
        statusLine.textContent = t('file_diff_modal.rejected_original');
        statusLine.addClass('orbis-status-rejected');
      }

      rejectBtn.toggleClass('orbis-btn-bold', h.decided && !h.accepted);
      acceptBtn.toggleClass('orbis-btn-bold', h.decided && h.accepted);
    };

    const decide = (accept: boolean) => {
      hunks[currentHunk].accepted = accept;
      hunks[currentHunk].decided = true;
      if (currentHunk < hunks.length - 1) currentHunk++;
      refreshVisuals();
    };

    prevBtn.addEventListener('click', () => {
      if (currentHunk > 0) {
        currentHunk--;
        refreshVisuals();
      }
    });
    nextBtn.addEventListener('click', () => {
      if (currentHunk < hunks.length - 1) {
        currentHunk++;
        refreshVisuals();
      }
    });
    rejectBtn.addEventListener('click', () => decide(false));
    acceptBtn.addEventListener('click', () => decide(true));

    cancelBtn.addEventListener('click', () => this.close());
    applyBtn.addEventListener('click', () => {
      void (async () => {
        await this.app.vault.process(originalFile, () => computeResult());
        await this.app.fileManager.trashFile(draftFile);
        new Notice(t('file_diff_modal.merge_applied'));
        // Beside what you were looking at, like every other place Orbis shows you a note — see `openNoteBeside`.
        if (this.openAfterApply) await openNoteBeside(this.app, originalFile);
        this.onResolved();
        this.close();
      })();
    });

    refreshVisuals();
  }
}

export class PerChapterMergeModal {
  private bodyEl: HTMLElement | null = null;
  private closePopup: (() => void) | null = null;

  constructor(
    private app: App,
    private host: OrbisPopupHost,
    private originalFolder: string,
    private draftFolder: string
  ) {}

  async open(): Promise<void> {
    const { popupEl, close } = createOrbisPopup(this.host, {
      title: t('chapter_merge_modal.title'),
      icon: annotationsSvg(16),
      dismissOnOutsideClick: false,
      desktopWidth: 'min(600px, 90vw)',
      mobileMaxWidth: 420,
      mobileFillHeight: true,
      onClose: () => {
        this.bodyEl = null;
        this.closePopup = null;
      },
    });
    this.closePopup = close;
    this.bodyEl = popupEl.createDiv();
    await this.renderList();
  }

  close(): void {
    this.closePopup?.();
  }

  private async completeAndClose(draftFolderObj?: TFolder) {
    if (draftFolderObj) await this.app.fileManager.trashFile(draftFolderObj);
    const origFolder = this.app.vault.getAbstractFileByPath(this.originalFolder);
    if (origFolder instanceof TFolder) {
      const moc = origFolder.children.find((f): f is TFile => f instanceof TFile && f.basename.startsWith('000 '));
      if (moc) await openNoteBeside(this.app, moc);
    }
    new Notice(t('chapter_merge_modal.merge_complete'));
    this.close();
  }

  private async renderList() {
    const contentEl = this.bodyEl;
    if (!contentEl) return;
    /**
     * **The keyboard stays on the row you reviewed.** This list is redrawn when a diff closes, which is the moment a
     * reader is most likely to be working through it from the keyboard — so it is redrawn out from under them. The
     * Review buttons carry keys so the restore lands on the same note's row, wherever it has moved to.
     */
    const restoreFocus = captureFocus(contentEl);
    contentEl.empty();

    const draftFolderObj = this.app.vault.getAbstractFileByPath(this.draftFolder);
    if (!(draftFolderObj instanceof TFolder)) {
      await this.completeAndClose();
      return;
    }

    const draftFiles = draftFolderObj.children.filter((f): f is TFile => f instanceof TFile && f.extension === 'md');
    if (draftFiles.length === 0) {
      await this.completeAndClose(draftFolderObj);
      return;
    }

    // Auto-resolve: new files, identical files, MOC file
    const autoResolved: string[] = [];
    const toReview: TFile[] = [];

    for (const draftFile of draftFiles) {
      const relPath = draftFile.path.substring(this.draftFolder.length);
      const originalPath = this.originalFolder + relPath;
      const originalFile = this.app.vault.getFileByPath(originalPath);

      if (!originalFile) {
        const content = await this.app.vault.read(draftFile);
        await this.app.vault.create(originalPath, content);
        await this.app.fileManager.trashFile(draftFile);
        autoResolved.push(t('chapter_merge_modal.added', { n: draftFile.basename }));
      } else {
        const [origContent, draftContent] = await Promise.all([
          this.app.vault.read(originalFile),
          this.app.vault.read(draftFile),
        ]);
        if (origContent === draftContent) {
          await this.app.fileManager.trashFile(draftFile);
          autoResolved.push(t('chapter_merge_modal.up_to_date', { n: draftFile.basename }));
        } else if (draftFile.basename.startsWith('000 ')) {
          await this.app.vault.process(originalFile, () => draftContent);
          await this.app.fileManager.trashFile(draftFile);
          autoResolved.push(t('chapter_merge_modal.updated_contents', { n: draftFile.basename }));
        } else {
          toReview.push(draftFile);
        }
      }
    }

    if (toReview.length === 0) {
      await this.completeAndClose(draftFolderObj);
      return;
    }

    if (autoResolved.length > 0) {
      const details = contentEl.createEl('details', { cls: 'orbis-auto-resolved' });
      details.createEl('summary', {
        text: t(
          autoResolved.length === 1
            ? 'chapter_merge_modal.merged_automatically_one'
            : 'chapter_merge_modal.merged_automatically',
          { n: autoResolved.length }
        ),
      });
      const ul = details.createEl('ul');
      for (const msg of autoResolved) ul.createEl('li', { text: msg });
    }

    contentEl.createEl('p', {
      text: t(toReview.length === 1 ? 'chapter_merge_modal.need_review_one' : 'chapter_merge_modal.need_review', {
        n: toReview.length,
      }),
      cls: 'orbis-files-header',
    });

    // One list, on its own ground — see `.orbis-list-box`.
    const listEl = contentEl.createDiv({ cls: 'orbis-list-box' });
    for (const draftFile of toReview) {
      const relPath = draftFile.path.substring(this.draftFolder.length);
      const originalPath = this.originalFolder + relPath;
      const row = listEl.createDiv({ cls: 'orbis-merge-row' });
      row.createSpan({ text: draftFile.basename, cls: 'orbis-merge-row-name' });
      const reviewBtn = row.createEl('button', { text: t('chapter_merge_modal.review') });
      reviewBtn.dataset.orbisFocus = `review:${draftFile.path}`;
      reviewBtn.addEventListener('click', () => {
        void new FileDiffModal(this.app, this.host, originalPath, draftFile.path, () => {
          void this.renderList();
        }).open();
      });
    }

    const btnRow = actionRow(contentEl, { placement: 'footer' });
    btnRow
      .createEl('button', { text: t('chapter_merge_modal.cancel_keep_draft') })
      .addEventListener('click', () => this.close());
    restoreFocus();
  }
}
