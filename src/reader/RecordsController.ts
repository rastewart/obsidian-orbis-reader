// When this book's annotations become notes in the vault, where they go, and asking about it once.
//
// **The policy around `RecordExporter`, which owns the mechanics:** when to export (a debounce after the saves settle),
// where to put it, when the reader is un-busy enough to be asked, and what to clean up afterwards. None of it is about
// reading a book, so none of it lives in `OrbisReaderView`.
//
// It needs `ReaderContext` — which already carries the vault, the open file, `debug`, `recordKinds` and
// `libraryEnabled` — plus exactly two things the context does not have, in `RecordsHost` below.

import { Notice, TFile } from 'obsidian';
import { openBookRecordsDialog } from '../BookRecordsModal';
import { actionButton, actionRow } from '../controls';
import { t } from '../i18n';
import { dialogIsOpen, openOrbisDialog } from '../OrbisModal';
import { readBookRecords, saveBookRecords } from '../progress';
import {
  applyRecordsDestination,
  openRecordsDestinationDialog,
  recordsDestinationOf,
} from '../RecordsDestinationModal';
import type { BookRecordConfig, RecordKinds, RecordsResolution } from '../record-config';
import { BOOK_LOCATION, GLOBAL_LOCATION, type RecordDefaults, resolveRecords, seedBookConfig } from '../record-config';
import { IOrbisReaderPlugin } from '../settings';
import { annotationsSvg } from '../system-glyphs';
import type { ReaderContext } from './ReaderContext';
import { type ExportCounts, RecordExporter, type RecordTarget } from './RecordExporter';
import { allBooksBaseRoot, recordLocationReady } from './record-paths';

/** How long saved content has to be quiet before records are written. */
const RECORDS_SETTLE_MS = 4000;

/**
 * How long after a save the `ask` prompt waits, then how often it re-checks, and how many times.
 *
 * Longer than the settle above: the question interrupts, so it should arrive once the reader has finished with
 * whatever they were doing rather than in the middle of it. The retry cap (~1 minute) stops a reader who leaves
 * a dialog open from being polled forever — their next save arms it again.
 */
const RECORDS_PROMPT_DELAY_MS = 6000;
const RECORDS_PROMPT_RETRY_MS = 2500;
const RECORDS_PROMPT_MAX_TRIES = 24;

/**
 * The two things this controller needs that `ReaderContext` does not carry.
 *
 * Two, not the whole view — and worth naming why each is here rather than on the context. `plugin` is the
 * settings this book's decision falls back to, which is a plugin-level fact no other collaborator asks the
 * context for. `playerBusy` is a question only the reader can answer: the full player covers the view and pocket
 * mode deliberately blocks the controls, so a configuration dialog over either interrupts something the reader
 * chose to be doing.
 */
export interface RecordsHost {
  readonly plugin: IOrbisReaderPlugin;
  playerBusy(): boolean;
}

/** When a book's annotations become notes, where they go, and asking about it once. */
export class RecordsController {
  private readonly recordExporter: RecordExporter;
  private recordsTimer: number | null = null;
  /** This book's own records decision, loaded on open. Null = never asked → the global default applies. */
  private bookRecords: BookRecordConfig | null = null;

  // ── Asking about a book (the `ask` mode) ──────────────────────────────────
  //
  // Nothing is lost by asking LATER. The export is a full idempotent pass over the book, so whenever the answer
  // arrives the first write catches up everything already saved — which is what makes it safe to wait for a
  // moment when the reader is not in the middle of something. See docs/design/reading-records.md.
  private recordsPromptTimer: number | null = null;
  private recordsPromptTries = 0;

  constructor(
    private readonly ctx: ReaderContext,
    private readonly host: RecordsHost
  ) {
    this.recordExporter = new RecordExporter(ctx);
  }

  /** A book opened: load its own decision, if it has one. */
  async onBookLoaded(file: TFile): Promise<void> {
    this.bookRecords = await readBookRecords(this.ctx.app, file);
  }

  /**
   * The book is about to close: write the pass still waiting, now, while the book's lists are still in memory.
   *
   * **Before they are emptied, not after.** A pass reads the open book's passages, notes and bookmarks, and closing
   * the tab empties the first two. Left on its timer, a pass scheduled in the last seconds before closing ran on a
   * closed book — no passages, no notes, the bookmarks still there — and flagged every passage and note record
   * orphaned; a rename straight after moved them first, so the book's base showed nothing at all. The pass reads its
   * lists synchronously, before its first `await`, so starting it here is enough. Call `dispose` after.
   */
  flush(): void {
    if (this.recordsTimer === null) return;
    window.clearTimeout(this.recordsTimer);
    this.recordsTimer = null;
    void this.exportAnnotationRecords({ silent: true }).catch((e) =>
      this.ctx.debug(`records write on close failed: ${String(e)}`, 'export')
    );
  }

  /** The book closed — drop its decision and any timer still counting down for it. */
  dispose(): void {
    this.bookRecords = null;
    if (this.recordsTimer !== null) window.clearTimeout(this.recordsTimer);
    if (this.recordsPromptTimer !== null) window.clearTimeout(this.recordsPromptTimer);
    this.recordsTimer = null;
    this.recordsPromptTimer = null;
    this.recordsPromptTries = 0;
  }

  /**
   * What to do about records for the book that's open — the book's own decision when it has one, else the
   * global default. Read through here rather than off the settings, so precedence lives in one place
   * (`resolveRecords`) and cannot drift between the live writer, the command and the cleanup action.
   *
   * `bookRecords` is loaded when the book opens and kept in memory: this is consulted once per saved item, and
   * re-reading the `.orbis` file per highlight to learn a fact that changes twice a year would be absurd.
   */
  records(): RecordsResolution {
    return resolveRecords(this.bookRecords, this.recordDefaults());
  }

  /** What the vault says: the mode, the kinds and the default location. One place, because three callers need
   *  the same three answers and a fourth would otherwise assemble them slightly differently. */
  private recordDefaults(): RecordDefaults {
    return {
      mode: this.host.plugin.settings.recordsMode,
      kinds: this.host.plugin.settings.recordKinds,
      location: this.host.plugin.settings.recordsSameFolderAsBook ? BOOK_LOCATION : GLOBAL_LOCATION,
    };
  }

  /** Where this book's records go, for the exporter. */
  private recordTarget(): RecordTarget {
    const s = this.host.plugin.settings;
    return {
      location: this.records().location,
      globalRoot: s.recordsFolder,
      allBooksRoot: allBooksBaseRoot(s.recordsAllBooksBaseFolder),
    };
  }

  recordsChanged(deleted?: readonly string[], kind?: keyof RecordKinds): void {
    const { active, ask, location, kinds } = this.records();
    if (ask) {
      // Asked only by something that would be recorded: with Bookmarks off, a bookmark asked "record this book?" and
      // a yes then wrote nothing for it — the passage before it was the record.
      if (!kind || kinds[kind]) this.scheduleRecordsPrompt();
      return;
    }
    if (!active || !recordLocationReady(location, this.host.plugin.settings.recordsFolder)) return;
    // Not debounced, and ahead of the export: the note for something you just deleted should go now, and the pass
    // that follows would otherwise flag it orphaned first and then find it gone.
    if (deleted?.length) {
      void this.recordExporter
        .recordsDeleted(this.recordTarget(), deleted)
        .catch((e) => this.ctx.debug(`records: removing deleted records failed: ${String(e)}`, 'export'));
    }
    if (this.recordsTimer !== null) window.clearTimeout(this.recordsTimer);
    this.recordsTimer = window.setTimeout(() => {
      this.recordsTimer = null;
      void this.exportAnnotationRecords({ silent: true }).catch((e) =>
        this.ctx.debug(`records live write failed: ${String(e)}`, 'export')
      );
    }, RECORDS_SETTLE_MS);
  }

  /**
   * Whether now is a bad moment to put a dialog on screen.
   *
   * The prompt is triggered by saving a selection or a note, so the default moment is the worst one: a
   * selection popup or the note editor is still up, possibly with the keyboard open. Deferring costs nothing.
   *
   * The DOM test lives in `dialogIsOpen` — shared with the device-locations prompt, which needs the same answer.
   */
  private busyForPrompt(): boolean {
    if (dialogIsOpen()) return true;
    // The player covers the view, and pocket mode deliberately blocks the controls: a config dialog over
    // either is an interruption of something the reader chose to be doing.
    return this.host.playerBusy();
  }

  /**
   * Ask about this book once the reader is not mid-gesture.
   *
   * Retried on a timer rather than re-armed only by the next save, because one highlight and then nothing is a
   * perfectly ordinary session and the question would never be asked. Capped, so a reader who leaves a dialog
   * open is not polled forever — the next save arms it again.
   *
   * **Dismissing the dialog leaves the book undecided**, so it is asked again in a later session. Only "no" is
   * durable. `recordsAsked` on the plugin is what keeps that from becoming nagging within one session, and it
   * lives there rather than on the view so that closing and reopening the book does not re-ask.
   */
  /**
   * Whether this book has said yes or no. **Not whether it has a stored decision:** choosing "Follow the vault
   * setting" stores one with no `enabled`, which `resolveRecords` reads as "ask me" — and the dialog says so — but
   * counting it as answered here meant the asking never came, even after a reload.
   */
  private answered(): boolean {
    return this.bookRecords?.enabled !== undefined;
  }

  private scheduleRecordsPrompt(): void {
    if (this.answered() || !this.ctx.currentFile) return;
    if (this.host.plugin.recordsAsked.has(this.ctx.currentFile.path)) return;
    if (this.recordsPromptTimer !== null) return; // already waiting
    this.recordsPromptTries = 0;
    const attempt = () => {
      this.recordsPromptTimer = null;
      const file = this.ctx.currentFile;
      if (!file || this.answered() || this.host.plugin.recordsAsked.has(file.path)) return;
      if (this.busyForPrompt()) {
        if (++this.recordsPromptTries > RECORDS_PROMPT_MAX_TRIES) return; // the next save asks again
        this.recordsPromptTimer = window.setTimeout(attempt, RECORDS_PROMPT_RETRY_MS);
        return;
      }
      // Marked before opening, not after answering: the dialog is the asking, and a reader who dismisses it
      // has been asked. Only the stored decision makes that permanent.
      this.host.plugin.recordsAsked.add(file.path);
      this.openBookRecordsSettings({ prompt: true });
    };
    this.recordsPromptTimer = window.setTimeout(attempt, RECORDS_PROMPT_DELAY_MS);
  }

  /**
   * Record "this book tracks" in its `.orbis` the first time a vault-wide `on` actually writes something.
   *
   * Two deliberate limits. **`enabled` only, never `kinds`** — absent kinds mean "follow the vault", so
   * stamping them would freeze this book's kinds at today's setting and make Settings → "What gets written" a
   * dead control for every book that had been opened once. And **only when a pass wrote something**, not on
   * open: reading a book to look one thing up should not modify its sidecar and hand two other devices a sync
   * object.
   *
   * What it buys: switching the vault from every-book to ask-me does not re-litigate books that were already
   * tracking, because they now have an answer of their own.
   */
  private async stampRecordsDecision(file: TFile, counts: ExportCounts | null): Promise<void> {
    if (this.bookRecords || this.host.plugin.settings.recordsMode !== 'on') return;
    if (!counts || !(counts.created || counts.updated)) return;
    // `enabled` alone: location and kinds both follow the vault unless the reader overrides them, and stamping
    // either would pin this book to today's settings.
    const stamped: BookRecordConfig = { enabled: true };
    await saveBookRecords(this.ctx.app, file, stamped);
    this.bookRecords = stamped;
    this.ctx.debug('records: book marked as tracking (vault setting is every book)', 'export');
  }

  /** Ask where reading records go, store it, and carry on with whatever was waiting on the answer. Dismissing
   *  writes nothing and says so — the alternative is a command that silently does nothing. */
  private askRecordsDestination(then?: () => void): void {
    openRecordsDestinationDialog(this.ctx.app, {
      heightLock: this.host.plugin,
      initial: recordsDestinationOf(this.host.plugin.settings),
      onSave: (dest) => {
        void (async () => {
          applyRecordsDestination(this.host.plugin.settings, dest);
          await this.host.plugin.saveSettings();
          then?.();
        })();
      },
      onCancel: () => new Notice(t('notices.records_dest_skipped')),
    });
  }

  async exportAnnotationRecords(opts?: { silent?: boolean }): Promise<void> {
    // Off by default, and no assumed folder: this writes hundreds of notes into the vault, so both the switch and
    // the destination are the reader's explicit choice rather than something inferred on their behalf.
    const state = this.records();
    if (!state.active) {
      // Running this command IS the answer to "should this book write records", so on a book that is still
      // waiting to be asked, ask now rather than refusing. Only on the explicit path: the live writer must
      // never open a dialog of its own accord.
      if (state.ask && !opts?.silent) {
        this.openBookRecordsSettings({ prompt: true });
        return;
      }
      // Two different facts, two different messages: the feature being off is fixed in settings, whereas this
      // book being off is fixed for this book — telling someone to go to settings would send them somewhere
      // that cannot change it.
      if (!opts?.silent)
        new Notice(t(this.bookRecords?.enabled === false ? 'notices.records_off_for_book' : 'notices.records_off'));
      return;
    }
    // Only a book using the SHARED folder needs it to have been named. One keeping its records beside itself
    // has no use for it, so demanding it would block a location that needs no setting at all.
    const target = this.recordTarget();
    if (!recordLocationReady(target.location, target.globalRoot)) {
      // The vault has never been told where records go: ask, rather than refuse. Covers a vault whose mode never
      // changes, where settings' own first-run question never fires — the same move as opening the per-book dialog
      // instead of complaining about an unanswered book. A book pointed at a custom folder with no path is a different
      // problem and keeps the notice.
      if (!opts?.silent) {
        if (target.location.mode === 'global')
          this.askRecordsDestination(() => void this.exportAnnotationRecords(opts));
        else new Notice(t('notices.records_no_folder'));
      }
      return;
    }
    const counts = await this.recordExporter.exportBook(target, { silent: opts?.silent });
    if (this.ctx.currentFile) await this.stampRecordsDecision(this.ctx.currentFile, counts);
  }

  /**
   * Offer to remove the records of content deleted from this book.
   *
   * Split by whether the reader wrote anything below the marker, and **only the empty ones are removable**. A
   * blanket "are you sure" over a mixed set trains you to click through it, which is exactly when the one file you
   * had written in goes. The rest are named so they can be dealt with by hand, which is the normal way to delete a
   * note you wrote.
   */
  async cleanupAnnotationRecords(): Promise<void> {
    if (!this.records().active) {
      new Notice(t(this.bookRecords?.enabled === false ? 'notices.records_off_for_book' : 'notices.records_off'));
      return;
    }
    const target = this.recordTarget();
    if (!recordLocationReady(target.location, target.globalRoot)) {
      new Notice(t('notices.records_no_folder'));
      return;
    }
    const found = await this.recordExporter.collectOrphans(target);
    if (!found) {
      new Notice(t('notices.no_book_loaded'));
      return;
    }
    const { removable, yours } = found;
    if (!removable.length && !yours.length) {
      new Notice(t('records_cleanup.none'));
      return;
    }
    openOrbisDialog(
      this.ctx.app,
      { title: t('records_cleanup.title'), icon: annotationsSvg(16) },
      (body, close, _modalEl, footer) => {
        if (removable.length) {
          body.createEl('p', {
            text: t(removable.length === 1 ? 'records_cleanup.removable_one' : 'records_cleanup.removable', {
              count: String(removable.length),
            }),
          });
        }
        if (yours.length) {
          body.createEl('p', {
            text: t(yours.length === 1 ? 'records_cleanup.yours_intro_one' : 'records_cleanup.yours_intro', {
              count: String(yours.length),
            }),
          });
          const list = body.createEl('ul', { cls: 'orbis-records-kept' });
          for (const file of yours) list.createEl('li', { text: file.basename });
        }
        // In the footer — see `InlineOrbisModal.renderDialog`.
        const actions = actionRow(footer());
        actionButton(actions, { label: t('action.cancel'), onClick: () => close() });
        if (removable.length) {
          actionButton(actions, {
            label: t('records_cleanup.remove', { count: String(removable.length) }),
            // `setWarning()` is `setDestructive().setCta()` — a destructive primary action.
            destructive: true,
            cta: true,
            onClick: () => {
              void (async () => {
                const n = await this.recordExporter.removeOrphans(removable);
                new Notice(
                  t(n === 1 ? 'records_cleanup.removed_one' : 'records_cleanup.removed', { count: String(n) })
                );
                close();
              })();
            },
          });
        }
      }
    );
  }

  /**
   * Ask what this book should do about reading records, then do it.
   *
   * The order on save is load-bearing: **move what is there, store the decision, then export.** Exporting
   * before the move writes a complete second set at the new location while the old one stays, and the
   * every-book base then shows every annotation twice. See `RecordExporter.moveRecords`.
   *
   * Switching records OFF writes the decision and stops there. It never deletes a record — the body below
   * the marker may be the reader's own writing, and the cleanup command is where removal lives, with its
   * own confirmation that names what it is about to trash.
   */
  openBookRecordsSettings(opts?: { prompt?: boolean }): void {
    const file = this.ctx.currentFile;
    if (!file) {
      new Notice(t('notices.no_book_loaded'));
      return;
    }
    const before = this.recordTarget();
    const vault = this.recordDefaults();
    // The book's real state, except when this dialog IS the question. A prompt offers an answer, so Save has to
    // mean yes — seeded with the book's actual "follow the vault", pressing Save would mean nothing at all.
    const config = seedBookConfig(this.bookRecords);
    if (opts?.prompt && !this.answered()) config.enabled = true;
    openBookRecordsDialog(this.ctx.app, {
      bookName: file.basename,
      config,
      vault,
      current: this.recordExporter.preview(before),
      resolve: (location) => this.recordExporter.preview({ ...before, location }),
      onSave: (config) => {
        void (async () => {
          try {
            // Not moved when the book is switched off: the dialog promises those notes stay where they are.
            // Otherwise the destination is the RESOLVED location — a book following the vault still has a real
            // one, and `config.location` is absent in exactly that case.
            if (config.enabled !== false) {
              const to = { ...before, location: config.location ?? vault.location };
              await this.recordExporter.moveRecords(before, to);
            }
            await saveBookRecords(this.ctx.app, file, config);
            // In memory too: this is consulted per saved item, and re-reading the file would be the only
            // other way to make the next highlight see the answer that was just given.
            this.bookRecords = config;
            // Following the vault while it asks is "ask me" — and the dialog promises the next save will. This session
            // has already asked this book, which would otherwise hold the question back until Obsidian restarted.
            if (config.enabled === undefined) this.host.plugin.recordsAsked.delete(file.path);
            // Written now only if the answer actually resolves to active — which "follow the vault" does not
            // when the vault is off, or when it is set to ask and this book has not been asked yet.
            if (this.records().active) await this.exportAnnotationRecords({ silent: true });
            const said =
              config.enabled === undefined
                ? 'notices.records_book_follow'
                : config.enabled
                  ? 'notices.records_book_on'
                  : 'notices.records_book_off';
            new Notice(t(said));
          } catch (e) {
            this.ctx.debug(`records: saving book settings failed: ${String(e)}`, 'export');
            new Notice(t('notices.records_book_failed'));
          }
        })();
      },
    });
  }
}
