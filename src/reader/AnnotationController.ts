import { fake as cfiFake, fromRange as cfiFromRange, joinIndir as cfiJoinIndir } from 'foliate-js/epubcfi.js';
import type { DrawFn } from 'foliate-js/overlayer.js';
import { Notice, Platform, type TFile } from 'obsidian';
import {
  type AnnotationMark,
  type AnnotationPreset,
  adoptFreedPresetMarks,
  applyMarkDeletion,
  applyRemap,
  audioMark,
  type BookMark,
  type BookPreset,
  bookPresetFrom,
  copyMarkLocally,
  generateMarkId,
  HIGHLIGHT_COLORS,
  type MarkAppearance,
  marksAnything,
  mergeBookPreset,
  noteMark,
  offeredMarks,
  type PromotedPreset,
  principalColor,
  quickMarks,
  type RemapChoice,
  resolveMark,
  switchBookPreset,
  type Treatment,
} from '../annotation-presets';
import { confirmThen } from '../ConfirmModal';
import { actionButton, actionRow } from '../controls';
import { t } from '../i18n';
import type { TranslationKey } from '../i18n/en';
import {
  type Highlight,
  type Note,
  readBookPreset,
  readHighlights,
  readNotes,
  saveBookPreset,
  saveBookPresetAndAnnotations,
  saveHighlights,
  saveNotes,
} from '../progress';
import { annotationsSvg } from '../system-glyphs';
import {
  applyMarkPreview,
  createColorSwatch,
  createMarkSwatch,
  createOrbisPopup,
  parseSvgIcon,
  setAllTabStops,
  setSvgIcon,
  sizeSwatchButton,
  trapTab,
} from '../ui-utils';
import type { AnnotationHost } from './AnnotationHost';
import { watchAnnotationTouches } from './annotation-touch';
import { isDeleteKey } from './bar-keys';
import { cfiRangesOverlap, cfiRangesOverlapStrict } from './bookmark-utils';
import { cfiSortKey } from './cfi-sort';
import type { FoliateViewEl } from './foliate-view';
import { drawForAppearance } from './mark-draw';
import { NoteIcons } from './NoteIcons';
import { claimPickerSlot } from './picker-slot';
import type { ReaderContext } from './ReaderContext';
import { tightenRange } from './range-utils';

/**
 * Render several trusted, static sibling SVG strings into `el` (the two-icon copy-link
 * button), each made inert by ui-utils' `parseSvgIcon`, which handles only a single <svg> root.
 * Constant markup only.
 */
function appendSvgIcons(el: HTMLElement, svgs: string[]): void {
  el.empty();
  for (const svg of svgs) {
    const icon = parseSvgIcon(el.ownerDocument, svg);
    if (icon) el.appendChild(icon);
  }
}

// Open-book glyph for the selection "Look up" action (picker + mobile drawer) — and, since it is the
// control that opens the look-up popup, that dialog's title icon too.
// The notes glyph, on the selection bar's Note button, the margin icons, the toolbar toggle — and on the
// two note dialogs those open, so a note dialog is recognisably part of the same subsystem.
const NOTE_ICON =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>';
export const LOOKUP_ICON =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>';
// Two-overlapping-sheets glyph for "Copy text" (Lucide copy) — outline, distinct from the filled
// copy-link icon (which carries a chain glyph). Leftmost action on the selection/highlight bars.
const COPY_TEXT_ICON =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
// How long the tapped annotation's mark name stays visible. Long enough to read a few words, short enough
// that it is gone before it can be mistaken for part of the bar — which is the point of showing it BELOW
// the bar rather than inside it: a name of any length can be shown without the toolbar having to fit it.
const MARK_NAME_MS = 3000;
/** What a switch renames a kept mark to beside a preset mark of its name — see `switchBookPreset`. */
const keptName = (name: string): string => t('presets.kept_name', { name });

/** The appearance fields an annotation carries: which mark it means, and how it looked when made. Both
 *  `Highlight` and `Note` have these, and the draw path only needs these. */
/** What an annotation records about how it looked: which mark it means, plus a snapshot of the appearance
 *  for when that mark no longer resolves. `color` is the WASH ('transparent' when there was none), matching
 *  the sentinel the overlay already uses for a note with no highlight. */
type AnnotationAppearance = { markId?: string; color?: string; treatment?: Treatment; treatmentColor?: string };

/** What the user picked: a mark from the bar, or a bare hex from a programmatic entry point (read-aloud's
 *  add-highlight buttons, the default note color setting) that has no picker to choose a mark from. */
type MarkChoice = AnnotationMark | string;

/** What a mark bar is drawn from — kept per bar, so the bar can be drawn again after the marks change. */
type MarkBarOpts = {
  currentMarkId?: string;
  currentColor?: string;
  ring: () => string | undefined;
  /** Book text color, in focus mode — see createMarkSwatch. */
  textColor?: string;
  onPick: (m: AnnotationMark) => void;
};

/** A mark's appearance in words, for the overflow list's sub-line: "Highlighter", "Underline", or both. */
function appearanceWords(m: MarkAppearance): string {
  const parts: string[] = [];
  if (m.highlightColor) parts.push(t('presets.treatment_fill'));
  if (m.treatment) parts.push(t(TREATMENT_LABELS[m.treatment]));
  return parts.join(' + ');
}

/** Treatment → its UI label. The picker names a mark's treatment in the overflow list, the same words the
 *  manager uses; duplicated as a small map rather than importing the manager (a 900-line Modal). */
const TREATMENT_LABELS: Record<Treatment, TranslationKey> = {
  underline: 'presets.treatment_underline',
  'double-underline': 'presets.treatment_double_underline',
  squiggle: 'presets.treatment_squiggle',
  strikethrough: 'presets.treatment_strikethrough',
  box: 'presets.treatment_box',
};

type DrawDetail = {
  draw: (fn: DrawFn, opts: unknown) => void;
  annotation: { value: string; color?: string };
  range: Range;
};

type HlDrawerState = {
  cfi: string;
  text: string;
  // 'new' = clean selection (highlight/note/lookup/copy-link); 'lookup' = selection overlapping an
  // annotation (lookup + copy-link only); 'edit' = tapped an existing highlight (color/delete/copy).
  mode: 'new' | 'lookup' | 'edit';
  sectionIndex: number;
  doc: Document;
  selRange?: Range;
  currentColor?: string;
  currentMarkId?: string;
};

/**
 * Highlights and notes: the overlay-drawn annotations. Owns the per-document
 * selection picker (desktop) / drawer (mobile), the note editor popup, the notes
 * margin-icon column, and the live DOM ranges used to position those icons as the
 * paginator moves. The view's Foliate `draw-annotation` / `show-annotation` /
 * `create-overlay` handlers dispatch into this controller (`tryDrawNote`,
 * `drawDefaultHighlight`, `handleShowAnnotation`, `reapplyAnnotations`), sitting
 * alongside SearchController on the same overlay path. See
 * docs/design/reader-architecture.md.
 *
 * `highlights` / `notes` are public for read access by notesData, the saved panel,
 * and recalc; they are only ever reassigned through this controller's own methods.
 */
export class AnnotationController {
  highlights: Highlight[] = [];
  notes: Note[] = [];
  /** The book's own copy of its annotation preset, or null when it has never been assigned one.
   *  Loaded from `.orbis` alongside the annotations, and authoritative for how they draw — the global
   *  library is only the template it was copied from. */
  private bookPreset: BookPreset | null = null;
  /** Every mark bar drawn and the options it was drawn with, for `repaintMarkBars`. A bar that has left the page is
   *  dropped the next time they are repainted. */
  private readonly markBars = new Map<HTMLElement, MarkBarOpts>();

  private highlightDrawerRow: HTMLElement | null = null;
  private highlightDrawer: HTMLElement | null = null;
  private hlDrawerState: HlDrawerState | null = null;
  /**
   * What a mark hotkey acts on, kept up to date by the two places a mark can be chosen.
   *
   * `notePick` is set while the note editor is open — a mark chosen there belongs to the note being written, which
   * is the second half of what "apply mark 1–9" has to mean. `selection` is what the annotation bar was raised
   * for. The editor wins when both exist: it is in front of you, and you opened it on purpose.
   */
  private notePick: ((m: AnnotationMark | null) => void) | null = null;
  private quickTarget: { sectionIndex: number; range: Range; text: string } | null = null;
  /**
   * The annotation currently being shown — the note view's, or the bar's in edit mode.
   *
   * The cursor for stepping between annotations, and derived rather than invented: it is whatever is on screen,
   * so closing the popup or clicking elsewhere resets it without anything having to be told.
   */
  private shownAnnotation: string | null = null;
  private notePopupEl: HTMLElement | null = null;
  private notePopupCleanup: (() => void) | null = null;
  /** Close handle for the read-only note view (distinct from the editor popup above). */
  private noteViewCleanup: (() => void) | null = null;
  /** The icon beside each note on the page shown, and the toggle for them. */
  readonly noteIcons: NoteIcons;
  /** Auto-dismiss timer for the mark-name flash. One at a time — the picker and the drawer never both show. */
  private markNameTimer: number | null = null;
  // Per-document picker API — allows the show-annotation dispatch to trigger edit
  // mode on the right picker without knowing which iframe doc the annotation lives in.
  private pickerMap = new Map<
    Document,
    {
      showNew: (rect: DOMRect, cfi: string, text: string, annotated?: boolean) => void;
      showEdit: (cfiRange: string, rect: DOMRect, currentColor: string, currentMarkId?: string) => void;
      /** Re-mark the highlight this bar is editing, as picking its swatch would. False when it is not editing. */
      remark: (m: AnnotationMark) => boolean;
      hide: () => void;
    }
  >();
  // The picker lives in the outer (Obsidian) document so it is immune to the
  // book iframe's position:fixed-containment and coordinate-system quirks.
  private pickerEl: HTMLElement | undefined;

  constructor(
    private readonly ctx: ReaderContext,
    private readonly host: AnnotationHost
  ) {
    this.noteIcons = new NoteIcons(
      ctx,
      host,
      () => this.notes,
      (note) => this.openNoteView(note)
    );
  }

  async load(file: TFile): Promise<void> {
    this.highlights = await readHighlights(this.ctx.app, file);
    this.notes = await readNotes(this.ctx.app, file);
    this.bookPreset = await readBookPreset(this.ctx.app, file);
    this.ctx.debug(`highlights load — count:${this.highlights.length} file:${file.name}`, 'annot');
    this.ctx.debug(`notes load — count:${this.notes.length}`, 'annot');
    this.ctx.debug(
      `preset load — id:${this.bookPreset?.id ?? 'none'} marks:${this.bookPreset?.marks.length ?? 0} rev:${this.bookPreset?.revision ?? '-'}`,
      'annot'
    );
  }

  /**
   * Take this book's marks and notes afresh from its Orbis file, and redraw if they differ from what is shown.
   *
   * Called whenever the file was written — after this view's own save too, where nothing differs and nothing is
   * redrawn. The comparison ignores order: the file holds items in creation order, this view in its own.
   *
   * **Nothing is replaced unless something differs.** A note editor that is open holds the note it is editing; swap
   * the list for an equal one read from disk after every save — a reading-speed sample is one — and its edit lands on
   * an object no longer in the list, and is lost.
   *
   * `redrawAnnotations` re-adds what is here now, so what another device removed has to be erased first — it is no
   * longer in the lists that redraw walks.
   */
  async reload(file: TFile): Promise<void> {
    const byId = (list: { id: string }[]) => JSON.stringify([...list].sort((a, b) => (a.id < b.id ? -1 : 1)));
    const [highlights, notes, preset] = await Promise.all([
      readHighlights(this.ctx.app, file),
      readNotes(this.ctx.app, file),
      readBookPreset(this.ctx.app, file),
    ]);
    const shown = byId([...this.highlights, ...this.notes]) + JSON.stringify(this.bookPreset);
    if (byId([...highlights, ...notes]) + JSON.stringify(preset) === shown) return;
    const before = [...this.highlights, ...this.notes].map((a) => a.cfiRange);
    this.highlights = highlights;
    this.notes = notes;
    this.bookPreset = preset;
    const now = new Set([...this.highlights, ...this.notes].map((a) => a.cfiRange));
    for (const cfi of before) {
      if (now.has(cfi)) continue;
      void this.ctx.foliateView?.deleteAnnotation({ value: cfi });
      this.noteIcons.forget(cfi);
    }
    this.redrawAnnotations();
    this.noteIcons.scheduleRefresh();
  }

  // ── Annotation preset (per book) ─────────────────────────────────────────────

  /** Which global preset this book is using, or null when unassigned. */
  get presetId(): string | null {
    return this.bookPreset?.id ?? null;
  }

  /** Whether this book has been detached from its preset — see `BookPreset.detached`. Asked before `presetId`
   *  anywhere that would otherwise read an empty id as "never assigned". */
  get presetDetached(): boolean {
    return !!this.bookPreset?.detached;
  }

  /**
   * Stop following the preset: every mark becomes this book's own, annotations follow any re-minted id.
   *
   * One write, like `applyPromotion` and for the same reason — `detachBookPreset` re-mints the ids the library
   * still owns, so storing the book without the rewritten annotations would point them at marks that are gone.
   */
  async detachPreset(detached: { book: BookPreset; idMap: Map<string, string> }): Promise<void> {
    const file = this.ctx.currentFile;
    if (!file) return;
    const plan = new Map<string, RemapChoice>([...detached.idMap].map(([from, to]) => [from, { markId: to }]));
    this.highlights = this.highlights.map((h) => applyRemap(h, plan, detached.book.marks));
    this.notes = this.notes.map((n) => applyRemap(n, plan, detached.book.marks));
    this.bookPreset = detached.book;
    await saveBookPresetAndAnnotations(this.ctx.app, file, {
      preset: detached.book,
      highlights: this.highlights,
      notes: this.notes,
    });
    this.ctx.debug(`preset detached — ${detached.idMap.size} mark id(s) re-minted`, 'annot');
    this.redrawAnnotations();
    this.host.refreshSavedPanelIfOpen();
  }

  /**
   * A DETACHED copy of the book's preset, for the manager to edit.
   *
   * A clone rather than the live object on purpose: the manager edits over several interactions and only
   * then saves, and handing out this controller's state would let a half-finished edit render on the page
   * — or leave the two disagreeing if the dialog were abandoned.
   */
  /** The mark an annotation resolves to in THIS book, or null when it has none. The one resolution point for
   *  callers outside this class, so `bookPreset` stays private and nobody re-implements the fallback rules. */
  markFor(annot: { color?: string; markId?: string }): AnnotationMark | null {
    return resolveMark(this.bookPreset, annot) ?? null;
  }

  get bookPresetCopy(): BookPreset | null {
    const p = this.bookPreset;
    return p ? { ...p, marks: p.marks.map((m) => ({ ...m })) } : null;
  }

  /**
   * Assign a global preset to this book (or `null` to unassign).
   *
   * The copy happens here rather than at the caller so the deep-copy/order rules sit next to the write.
   * This does NOT rewrite the annotations: a `markId` from the outgoing preset that the survivor rule does
   * not keep simply stops resolving, and those annotations fall back to their stored color with no name —
   * the same drawing as an annotation with no preset, not a broken state.
   *
   * That fallback is the reason this is not reachable in one click for a book that already has a
   * preset. `AnnotationPresetsModal.openChangePreset` asks, per mark that annotations depend on, whether to
   * keep it in this book or map it onto a mark in the incoming preset — and then
   * calls `changeBookPreset` with that plan. This entry point is for the cases with nothing to decide: the
   * first assignment on book open, and the manager's empty state.
   */
  assignPreset(global: AnnotationPreset | null): Promise<void> {
    if (!global) return this.updateBookPreset(null);
    // Replacing an existing preset is a SWITCH: inherited marks survive only where annotations point at
    // them, marks made here survive regardless. A fresh copy is only right when there is nothing to keep.
    // The empty-state path only: `changePreset` is what a book with annotations goes through, and it applies
    // the switch's collapse map to them. Nothing here can be pointing at a collapsed mark, because this runs
    // where there is no copy to have annotated against.
    const next = this.bookPreset
      ? switchBookPreset(this.bookPreset, global, (id) => this.markInUse(id), keptName).book
      : bookPresetFrom(global);
    return this.updateBookPreset(next);
  }

  /**
   * Bring the book's copy up to a newer revision of the preset it already tracks.
   *
   * Driven from here rather than from the caller because the merge needs to know which marks annotations
   * depend on, and the annotations are loaded here. A no-op unless the template has genuinely moved forward
   * — see `mergeBookPreset` for why going backwards must be impossible.
   */
  async mergeWithTemplate(template: AnnotationPreset | undefined): Promise<void> {
    const book = this.bookPreset;
    if (!book || !template) return;
    const merged = mergeBookPreset(book, template, (id) => this.markInUse(id));
    if (merged === book) return;
    await this.updateBookPreset(merged);
  }

  /**
   * Copy a tracked preset mark into this book, so the reader can change it without changing the preset.
   *
   * Three things that have to happen together, and do — one write, no half-applied state: a local mark is
   * minted with a NEW id, every annotation carrying the old id is rewritten onto it, and the copy replaces
   * the preset's mark here (see `copyMarkLocally`). The new id is the point: reusing it would let one id mean different things in the
   * library and in this book, which every cross-book feature after this assumes cannot happen.
   *
   * Returns the new mark's id so the caller can keep the reader on the mark they were editing.
   */
  async copyMarkIntoBook(markId: string): Promise<string | undefined> {
    const book = this.bookPreset;
    const file = this.ctx.currentFile;
    if (!book || !file) return undefined;
    const newId = generateMarkId();
    const next = copyMarkLocally(book, markId, newId);
    if (!next) return undefined;

    // The same machinery the remap uses, with a plan of one: move everything off the old mark onto the copy.
    const plan = new Map<string, RemapChoice>([[markId, { markId: newId }]]);
    this.highlights = this.highlights.map((h) => applyRemap(h, plan, next.marks));
    this.notes = this.notes.map((n) => applyRemap(n, plan, next.marks));
    this.bookPreset = next;
    await saveBookPresetAndAnnotations(this.ctx.app, file, {
      preset: next,
      highlights: this.highlights,
      notes: this.notes,
    });
    this.ctx.debug(`mark copied into book — ${markId} → ${newId}`, 'annot');
    this.redrawAnnotations();
    this.host.refreshSavedPanelIfOpen();
    return newId;
  }

  /** Show or hide one of this book's marks. Visibility is the BOOK's, so it never forks a definition. */
  async setMarkHidden(markId: string, hidden: boolean): Promise<void> {
    const book = this.bookPreset;
    if (!book) return;
    const rest = (book.hiddenMarkIds ?? []).filter((id) => id !== markId);
    await this.updateBookPreset({
      ...book,
      hiddenMarkIds: hidden ? [...rest, markId] : rest.length ? rest : undefined,
    });
  }

  /**
   * Which marks this book's annotations depend on, and how many carry each.
   *
   * The remap dialog's input, and the reason it can skip itself: a book with nothing in use has no decision
   * to offer. Counted per mark rather than as a boolean because "Follow up — 12 highlights" is what makes
   * the choice concrete.
   */
  markUsage(): { markId: string; count: number }[] {
    const counts = new Map<string, number>();
    for (const a of [...this.highlights, ...this.notes]) {
      if (a.markId) counts.set(a.markId, (counts.get(a.markId) ?? 0) + 1);
    }
    return [...counts].map(([markId, count]) => ({ markId, count }));
  }

  /**
   * Delete one of this book's OWN marks, deciding what becomes of the annotations carrying it.
   *
   * **Only a local mark reaches here.** A tracked mark cannot be deleted from a book at all — the row offers
   * "turn it off for this book instead" — and when the preset drops one, `mergeBookPreset`'s survivor rule keeps
   * it as the book's own for exactly as long as something points at it. A local mark has no upstream template, so
   * that rule cannot fire, and this is the one path that can leave an annotation pointing at nothing.
   *
   * Which is worse than it looks: the appearance outlives the meaning (`treatment` is stored on the annotation as
   * a render fallback), and `markKeyOf` returns the dangling id rather than `NO_MARK`, so the filter lists build
   * no row for it and every filtered export drops it with no way to tick it back in.
   *
   * **`remove` deletes passage selections and unmarks notes.** A passage selection is a mark on some words; with
   * no mark it is nothing, and the markless selection is the state this design exists to retire (see
   * `applyRemap`). A note is words the reader wrote, and an unmarked note is a supported permanent state — so the
   * note stays and loses its mark, snapshot included, rather than being destroyed for a decision about marks.
   *
   * One write, like `changePreset`, so a failure cannot store the shortened mark list without the annotations
   * that were following it.
   */
  async deleteLocalMark(markId: string, choice: RemapChoice | 'remove'): Promise<void> {
    const book = this.bookPreset;
    const file = this.ctx.currentFile;
    if (!book || !file) return;
    // The preset marks this one was holding out come in with the delete, in the same write — they are among what the
    // dialog offers as a target (`marksFreedByDeleting`), so an annotation moved onto one must find it here.
    const next = adoptFreedPresetMarks(
      { ...book, marks: book.marks.filter((m) => m.id !== markId) },
      this.host.presetFor(book.id)
    );

    const content = applyMarkDeletion(markId, choice, next.marks, { highlights: this.highlights, notes: this.notes });
    this.highlights = content.highlights;
    this.notes = content.notes;
    // `redrawAnnotations` re-adds SURVIVORS, so a dropped one is never visited and its drawing would stay on the
    // page until the book was reopened. Every other removal path calls this; see `deleteNote`.
    for (const h of content.removed) void this.ctx.foliateView?.deleteAnnotation({ value: h.cfiRange });

    this.bookPreset = next;
    await saveBookPresetAndAnnotations(this.ctx.app, file, {
      preset: next,
      highlights: this.highlights,
      notes: this.notes,
    });
    this.ctx.debug(`local mark deleted — ${markId}, ${choice === 'remove' ? 'removed' : 'remapped'}`, 'annot');
    this.redrawAnnotations();
    this.host.refreshSavedPanelIfOpen();
  }

  /**
   * Point this book at a different preset, applying the reader's decision for each mark in use.
   *
   * The plan runs BEFORE the survivor rule, which is what lets the rule stay silent: once remapped or
   * remapped annotations have moved, whatever is left genuinely has nothing depending on it and can be
   * dropped without asking. Everything lands in one write, so a failure cannot leave annotations pointing
   * at marks that no longer exist.
   *
   * A remapped annotation also takes the new mark's appearance into its snapshot — the snapshot is what
   * shows if that mark is ever deleted, so leaving the old one there would resurrect an appearance the
   * reader had already moved away from.
   */
  async changePreset(next: AnnotationPreset, plan: Map<string, RemapChoice>): Promise<void> {
    const book = this.bookPreset;
    const file = this.ctx.currentFile;
    if (!book || !file) return;

    this.highlights = this.highlights.map((h) => applyRemap(h, plan, next.marks));
    this.notes = this.notes.map((n) => applyRemap(n, plan, next.marks));

    /**
     * The plan first, then the switch — and then the switch's OWN remap.
     *
     * A local mark the incoming preset already expresses is collapsed onto it (see `switchBookPreset`), which
     * leaves its annotations pointing at a mark that is no longer in the book. They move in this same write,
     * exactly as the reader's own decisions did a moment ago.
     */
    const { book: merged, idMap } = switchBookPreset(book, next, (id) => this.markInUse(id), keptName);
    if (idMap.size) {
      const collapse = new Map<string, RemapChoice>([...idMap].map(([from, to]) => [from, { markId: to }]));
      this.highlights = this.highlights.map((h) => applyRemap(h, collapse, merged.marks));
      this.notes = this.notes.map((n) => applyRemap(n, collapse, merged.marks));
    }
    this.bookPreset = merged;
    await saveBookPresetAndAnnotations(this.ctx.app, file, {
      preset: merged,
      highlights: this.highlights,
      notes: this.notes,
    });
    this.ctx.debug(`preset changed — ${book.id} → ${next.id}, ${plan.size} mark(s) decided`, 'annot');
    this.redrawAnnotations();
    this.host.refreshSavedPanelIfOpen();
  }

  /**
   * Store a promotion: the book's rebuilt copy plus the annotations re-pointed at any re-minted mark ids.
   *
   * Deliberately NOT routed through `changePreset`, which runs the survivor rule. A promotion has nothing to
   * decide — the incoming preset was built from this book's own marks — so the copy is taken as given and the
   * only work is following `idMap`. One write, so a re-minted id can never be stored without the annotations
   * that point at it.
   */
  async applyPromotion(promoted: PromotedPreset): Promise<void> {
    const file = this.ctx.currentFile;
    if (!file) return;
    const { book, idMap } = promoted;
    // Expressed as a remap plan so the existing, tested rewrite does the work. The appearance it copies over
    // is identical (same mark, new id), so nothing on the page changes.
    const plan = new Map<string, RemapChoice>([...idMap].map(([from, to]) => [from, { markId: to }]));
    this.highlights = this.highlights.map((h) => applyRemap(h, plan, book.marks));
    this.notes = this.notes.map((n) => applyRemap(n, plan, book.marks));
    this.bookPreset = book;
    await saveBookPresetAndAnnotations(this.ctx.app, file, {
      preset: book,
      highlights: this.highlights,
      notes: this.notes,
    });
    this.ctx.debug(`promoted to preset ${book.id} — ${idMap.size} mark id(s) re-minted`, 'annot');
    this.redrawAnnotations();
    this.host.refreshSavedPanelIfOpen();
  }

  /** Does any annotation in this book carry this mark? The survivor rule's input. */
  private markInUse(markId: string): boolean {
    return this.highlights.some((h) => h.markId === markId) || this.notes.some((n) => n.markId === markId);
  }

  /** Replace the book's copy wholesale — the in-book edit path, and what `assignPreset` funnels into so
   *  writing `.orbis` and redrawing can never be forgotten by one of the two. */
  async updateBookPreset(next: BookPreset | null): Promise<void> {
    const file = this.ctx.currentFile;
    if (!file) return;
    /**
     * **Every book-scope write reconciles**, rather than one hook per way of freeing an appearance.
     *
     * A mark of the book's own holds its appearance against a mark from the preset, so the preset's is not
     * added — and editing that mark's appearance frees it, as does deleting the mark. Enumerating the triggers
     * means forgetting one; `adoptFreedPresetMarks` is idempotent and answers the same object when there is
     * nothing to do, so asking here costs a comparison and cannot go wrong. See its own note for why it cannot
     * pull in a mark the book was right to be without.
     */
    this.bookPreset = next ? adoptFreedPresetMarks(next, this.host.presetFor(next.id)) : null;
    next = this.bookPreset;
    await saveBookPreset(this.ctx.app, file, next);
    this.ctx.debug(
      `preset set — id:${next?.id ?? 'none'} marks:${next?.marks.length ?? 0} rev:${next?.revision ?? '-'} customized:${next?.customized ?? false}`,
      'annot'
    );
    this.redrawAnnotations();
    this.host.refreshSavedPanelIfOpen();
  }

  /**
   * Draw one annotation with its mark's treatment, falling back to a plain fill in its stored color.
   *
   * The mark's color wins over the stored hex when a mark resolves — that is what makes recoloring a
   * mark update every annotation already carrying it. An annotation whose `markId` no longer resolves
   * keeps its stored color, so nothing ever fails to draw.
   */
  private drawWithMark(d: DrawDetail, record: AnnotationAppearance | undefined, color: string): void {
    const app = this.appearanceFor(record, color);
    if (!marksAnything(app)) return;
    // The page's own text color, for a line set to INK — resolved per draw rather than stored, so the
    // same mark stays legible when the reader changes theme or opens the book on another device.
    d.draw(drawForAppearance(app, this.ctx.readerColors().fg), {});
  }

  /**
   * The appearance to draw: the resolved mark's, else the snapshot the annotation was made with.
   *
   * The mark wins whenever it resolves, which is what makes editing a mark update every annotation carrying
   * it. Otherwise an ORPHAN — mark deleted, preset switched, book from another vault — still looks the way
   * it was authored rather than collapsing to a plain wash.
   */
  private appearanceFor(record: AnnotationAppearance | undefined, color: string): MarkAppearance {
    const mark = resolveMark(this.bookPreset, record ?? {});
    if (mark) return mark;
    const wash = record?.color ?? color;
    return {
      highlightColor: wash && wash !== 'transparent' ? wash : undefined,
      treatment: record?.treatment,
      treatmentColor: record?.treatmentColor,
    };
  }

  /**
   * Re-run every annotation through draw-annotation — after a preset change, where the marks (and so the
   * colors and treatments) are different but the CFIs are not, and after a THEME change, because an ink
   * line resolves the page's text color at draw time and the overlay is SVG with baked-in colors: it does
   * not follow CSS, and foliate's own redraw re-invokes the same closure with the same color.
   */
  redrawAnnotations(): void {
    const view = this.ctx.foliateView;
    if (!view) return;
    // No paired deleteAnnotation: foliate's addAnnotation already calls `overlayer.remove(value)` before
    // re-emitting draw-annotation, so a re-add IS a redraw — and it clears the old drawing even when the
    // new mark draws nothing, which is what a note switching to no highlight needs.
    for (const h of this.highlights) void view.addAnnotation({ value: h.cfiRange, color: h.color });
    for (const n of this.notes) void view.addAnnotation({ value: n.cfiRange, color: n.color ?? 'transparent' });
  }

  /**
   * The three fields an annotation records, from either kind of choice.
   *
   * A mark chosen on the bar carries its own id and treatment. A bare COLOR still arrives from the two
   * programmatic entry points that have no picker — the read-aloud "highlight what I'm hearing" buttons and
   * the default-color setting for notes — and those resolve to a mark by color.
   */
  private appearanceOf(choice: MarkChoice): {
    color: string;
    markId?: string;
    treatment?: Treatment;
    treatmentColor?: string;
  } {
    const snapshot = (m: MarkAppearance, markId?: string) => ({
      // 'transparent' for a line-only mark: the wash slot has to hold something, and that is already the
      // sentinel the overlay uses for "no highlight here".
      color: m.highlightColor ?? 'transparent',
      markId,
      treatment: m.treatment,
      treatmentColor: m.treatmentColor,
    });
    // A synthesised chip for a book with no preset has an empty id; store nothing rather than ''.
    if (typeof choice !== 'string') return snapshot(choice, choice.id || undefined);
    const mark = resolveMark(this.bookPreset, { color: choice });
    return mark ? snapshot(mark, mark.id) : { color: choice };
  }

  // ── Toolbar / layout element construction ──────────────────────────────────

  /** The mobile highlight drawer row, exposed so FocusMode can re-parent it into its
   *  overlay (a clean, unfiltered ancestor) and bottom-anchor it over the progress chip. */
  get drawerRow(): HTMLElement | null {
    return this.highlightDrawerRow;
  }

  /** Build the mobile highlight drawer into the overlay container. */
  buildDrawer(overlayContainer: HTMLElement): void {
    // Highlight drawer overlays the top of the host element, so it doesn't cause repagination
    this.highlightDrawerRow = overlayContainer.createDiv({ cls: 'orbis-highlight-drawer-row' });
    this.highlightDrawerRow.hide();
    this.highlightDrawer = this.highlightDrawerRow.createDiv({
      cls: 'orbis-ctrl-drawer',
      attr: { style: 'justify-content: center; position: relative;' },
    });
    this.highlightDrawer.show();
    this.highlightDrawer.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.hideHighlightDrawer();
      // The bar's Delete, for a tablet with a keyboard: only while the drawer shows a saved passage selection.
      else if (this.shownAnnotation && isDeleteKey(e)) {
        e.preventDefault();
        this.deleteShownAnnotation();
      }
    });
  }

  /** The two role marks' colors, for the player's action-icon previews. Null where a role resolves to no
   *  mark — which is the default for notes, and shows the reader that a new note gets no highlight. */
  roleMarkColors(): { audio: string | null; note: string | null } {
    const p = this.offeredPreset();
    return {
      // A mark's principal color: its wash, or its line when it has no wash.
      audio: (p && principalColor(audioMark(p))) ?? null,
      note: (p && principalColor(noteMark(p))) ?? null,
    };
  }

  /**
   * Flash a tapped annotation's mark name under the bar, then let it go.
   *
   * Below the bar and absolutely positioned, so a long name neither widens the toolbar nor has to be
   * truncated to a few characters — the two problems with keeping it inline. Transient because it answers a
   * question asked once ("what is this one?"), and a label that stays is just something else on screen.
   */
  private flashMark(label: HTMLElement, mark: AnnotationMark | undefined | null): void {
    if (this.markNameTimer !== null) {
      window.clearTimeout(this.markNameTimer);
      this.markNameTimer = null;
    }
    if (mark === null) {
      label.hide();
      return;
    }
    label.empty();
    // The sample matters most for a mark chosen from the overflow list, which by definition is not on the
    // bar — the name alone would leave its appearance a guess for the moment before the page redraws.
    if (mark) applyMarkPreview(label.createSpan({ text: t('annotation_picker.mark_sample') }), mark);
    // The name alone, unadorned: the sample beside it already says "this is the mark", so wrapping it in
    // "Marked …" spends a line explaining what the reader can see.
    label.createSpan({
      text: mark ? mark.name || t('presets.unnamed_mark') : t('presets.no_mark'),
    });
    label.show();
    this.markNameTimer = window.setTimeout(() => {
      label.hide();
      this.markNameTimer = null;
    }, MARK_NAME_MS);
  }

  /** How many marks the bar offers directly. A phone fits three 44px chips beside the copy/note/lookup
   *  buttons; anything wider fits five. Two cut-offs rather than one lowest-common-denominator number —
   *  the desktop bar has room and the reader hits this control dozens of times a session. */
  private get quickCount(): number {
    return Platform.isPhone ? 3 : 5;
  }

  /** The marks the bar can offer: the book's own, or the legacy five as unnamed fills if a book somehow
   *  has no preset (auto-assignment on open should make that unreachable, but a bar with nothing on it
   *  would mean no highlighting at all, which is a worse failure than an unnamed chip). */
  /** `BookMark`, not `AnnotationMark`: the picker shows where each mark came from, and that has to be read
   *  from a field rather than cast back on at the point of use. */
  private barMarks(): BookMark[] {
    // `offeredMarks`, not `enabled` alone: otherwise a mark turned off for THIS book would keep appearing on the bar
    // and in the `…` list, and the checkbox in the manager would gray a row and change nothing else. See
    // `offeredMarks`.
    if (this.bookPreset) return offeredMarks(this.bookPreset);
    return HIGHLIGHT_COLORS.map((c) => ({ id: '', name: '', highlightColor: c, enabled: true }));
  }

  /**
   * The book as the reader is OFFERED it, for the two role marks.
   *
   * `noteMark` and `audioMark` fall back through the mark list, so handing them the full copy would let a mark turned
   * off in this book be the one a new note or the player applies — the one place where "it is still offered" becomes
   * "it is applied without being asked for". Drawing keeps using `bookPreset` itself: an annotation made with a mark
   * that is now off keeps its appearance and its name.
   */
  private offeredPreset(): BookPreset | null {
    const p = this.bookPreset;
    if (!p?.hiddenMarkIds?.length) return p;
    return { ...p, marks: offeredMarks(p) };
  }

  /**
   * Draw every mark bar still on screen again, from the marks as they are now. Called when the Marks dialog closes:
   * rebuilding "on every show" misses a bar that is already showing, which would keep the old order, names and chips
   * until the selection is made again.
   */
  repaintMarkBars(): void {
    for (const [host, opts] of this.markBars) {
      if (host.isConnected) this.renderMarkBar(host, opts);
      else this.markBars.delete(host);
    }
  }

  /**
   * Render the mark bar into `host`: the first `quickCount` marks as chips, then `…` when there are more.
   *
   * Rebuilt on every show rather than once per document, because the preset can change while the book is
   * open — the manager is reachable from the reader, and its whole point is editing marks for the book in
   * front of you.
   */
  private renderMarkBar(host: HTMLElement, opts: MarkBarOpts): void {
    this.markBars.set(host, opts);
    host.empty();
    const marks = this.barMarks();
    // The tested helper decides WHICH marks are quick (enabled only, preset order, first N) — the bar just
    // renders them. `barMarks()` supplies the full enabled list, which the overflow list also needs.
    const quick = quickMarks({ marks }, this.quickCount);
    // Resolve the current mark the SAME way drawing does — including refusing an ambiguous color. A raw
    // color comparison here would ring the first mark of that color, so the bar could claim "double-underline"
    // while the page draws a plain fill for an annotation that resolves to no mark at all.
    const current = opts.currentMarkId
      ? marks.find((m) => m.id === opts.currentMarkId)
      : resolveMark({ marks }, { color: opts.currentColor });
    const isCurrent = (m: AnnotationMark): boolean => !!current && m.id === current.id;

    for (const m of quick) {
      const handle = createMarkSwatch(host, {
        appearance: m,
        // The name IS the point of the feature, so it is the accessible name and the desktop tooltip.
        label: m.name || t('presets.unnamed_mark'),
        sample: t('annotation_picker.mark_sample'),
        textColor: opts.textColor,
      });
      handle.btn.setAttribute('role', 'radio');
      handle.btn.setAttribute('aria-checked', String(isCurrent(m)));
      handle.setSelected(isCurrent(m), opts.ring());
      handle.btn.addEventListener('mousedown', (e) => e.preventDefault());
      handle.btn.addEventListener('click', () => opts.onPick(m));
    }

    // Everything, by name, in preset order — and ALWAYS offered, even when the bar already shows every
    // mark. A `…` opening the same three marks may seem to lie about there being more, but the list has a
    // second job: the way to the manager is its last row. Hidden below six marks, that route would exist only
    // once you had six — backwards, since the reader most likely to want the manager is the one who has not
    // built any marks yet.
    {
      const more = host.createEl('button', {
        cls: 'orbis-color-swatch',
        attr: {
          type: 'button',
          'aria-label': t('annotation_picker.all_marks'),
          // How `openMarkList` finds its way back here when the list is dismissed rather than chosen from.
          'data-orbis-mark-more': '',
        },
      });
      sizeSwatchButton(more);
      const dots = more.createDiv({ cls: 'orbis-mark-more-dots', text: '…' });
      // Its dashed border is currentColor, so one color drives both (see styles.css).
      if (opts.textColor) dots.style.color = opts.textColor;
      more.addEventListener('mousedown', (e) => e.preventDefault());
      // Anchored to the BAR, not to the …: the list belongs to the whole bar, and anchoring to the last
      // chip would push it off toward one edge.
      more.addEventListener('click', () => this.openMarkList(marks, isCurrent, opts.onPick, host));
    }

    /**
     * Arrow-key traversal, attached ONCE per host — see the note on re-rendering below.
     *
     * **Arrows move, Enter and Space choose.** Selecting as it moves is what an ARIA radiogroup does by default, and it
     * is wrong here: choosing a mark re-renders the bar, which destroys the button under the cursor, so the handler
     * would have to chase focus back with a `setTimeout`. A pattern that
     * needs to catch its own falling focus is a pattern fighting itself. The spec's manual-activation option exists for
     * exactly this: move without consequence, then commit.
     *
     * The walk covers the **whole group**, including the × that means no mark at all: it is created outside this host,
     * so an arrow walk scoped to the host could never reach a value the reader is entitled to choose. It stops at the
     * ends rather than wrapping, so the beginning of the list can be felt.
     *
     * The `…` is deliberately not in it — arrowing onto it and having it open a dialog is a surprise inside a surprise.
     * It is the next Tab stop after the group.
     */
    /**
     * **Attached to the GROUP, not to the marks host.**
     *
     * The × that means "no mark" is created beside this host rather than inside it, so a listener on the host would
     * never see a key pressed while the × has focus, and the arrows would do nothing there. The group is where the
     * options are, so the group is where the keys belong.
     *
     * Where there is no group — the annotation bar over a selection uses this same renderer without one — the host is
     * the group.
     */
    const group = host.closest<HTMLElement>('[role="radiogroup"]') ?? host;
    // Every swatch is a tab stop — see `setAllTabStops` for why a toolbar is not a radio row. The arrow keys below
    // still work; they are not the only way through.
    setAllTabStops(group);
    if (!group.dataset.orbisMarkBarKeys) {
      group.dataset.orbisMarkBarKeys = '1';
      const options = (): HTMLElement[] =>
        Array.from(group.querySelectorAll<HTMLElement>('[role="radio"]')).filter((el) => el.offsetParent !== null);
      /**
       * A key this group has answered stops here — `preventDefault` is not enough.
       *
       * It suppresses the browser's default (Space scrolling, Space clicking the button a second time) but says
       * nothing to anyone else listening, and a keystroke made in the annotation bar passes through `document` on its
       * way up: Obsidian's own hotkey dispatch is there, so **Space would set the mark and then turn the page**,
       * because the reader has Space bound to a page command. Our reading keys stand down for the bar by themselves
       * (see `barOwnsKey`); a binding somebody made in Obsidian's settings can only be stopped by not letting the
       * event reach it.
       */
      const answered = (e: KeyboardEvent): void => {
        e.preventDefault();
        e.stopPropagation();
      };
      group.addEventListener('keydown', (e) => {
        // Shift+arrow belongs to the selection, not to this bar: it refines what is selected, and the bar has focus at
        // exactly the moment a reader wants to trim the sentence they just selected.
        if (e.shiftKey) return;
        const active = activeDocument.activeElement as HTMLElement | null;
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          const opts2 = options();
          const i = opts2.findIndex((el) => el === active);
          if (i === -1) return;
          const at = Math.max(0, Math.min(opts2.length - 1, i + (e.key === 'ArrowRight' ? 1 : -1)));
          // No tabindex bookkeeping: every swatch is a stop of its own, so the arrows only have to move
          // focus. See `setAllTabStops`.
          opts2[at]?.focus();
          answered(e);
          return;
        }
        // Enter and Space both commit: Space is what chooses a radio, Enter is what activates everything else in
        // Orbis, and a reader should not have to know which kind of control this is.
        if (e.key === 'Enter' || e.key === ' ') {
          if (!active?.getAttribute('role')?.includes('radio')) return;
          const at = options().indexOf(active);
          active.click();
          answered(e);
          /**
           * **Focus stays on what was chosen** — by position, because the element itself will not survive.
           *
           * Committing a mark redraws the bar to show what is now selected, which destroys the button that was under
           * the cursor and would leave the keyboard on nothing, several presses from anywhere. The swatches are
           * rebuilt in the same order, so the position survives even though the element
           * does not.
           */
          if (at !== -1) {
            window.setTimeout(() => {
              const rebuilt = options();
              rebuilt[Math.min(at, rebuilt.length - 1)]?.focus();
            }, 0);
          }
        }
      });
    }
  }

  /** The full mark list behind `…` — sample, name and treatment per row, so the marks that did not fit on
   *  the bar are chosen by MEANING rather than by remembering which color meant what. */
  private openMarkList(
    marks: BookMark[],
    isCurrent: (m: AnnotationMark) => boolean,
    onPick: (m: AnnotationMark) => void,
    /** The bar the list belongs to: what it is anchored to, and where focus goes once a mark is chosen. */
    bar: HTMLElement
  ): void {
    const anchorRect = bar.getBoundingClientRect();
    /** What tells a dismissal from a choice — see the focus note below. */
    let picked = false;
    const { popupEl, close } = createOrbisPopup(this.ctx, {
      title: t('annotation_picker.marks_title'),
      icon: annotationsSvg(16),
      dismissOnOutsideClick: true,
      // No text field, so nothing to reserve keyboard room for — and `mobileFillHeight` because the
      // default cap to the upper half of the screen exists for dialogs that auto-focus a field. This one
      // never opens a keyboard, and the cap would hide the "Manage marks" row at the foot of the list
      // behind a scroll for anyone with more than a handful of marks.
      lockMobileHeights: false,
      mobileFillHeight: true,
      mobileWidthPct: 0.9,
      mobileMaxWidth: 420,
      desktopWidth: '360px',
      anchorRect,
      onClose: () => {
        // Dismissed rather than chosen: the keyboard goes back to the control that opened this, which is the contract
        // every other Orbis dialog keeps.
        if (!picked) bar.querySelector<HTMLElement>('[data-orbis-mark-more]')?.focus();
      },
    });
    /**
     * **The list takes focus, and hands it back.**
     *
     * `createOrbisPopup` traps Tab, but a trap with nothing focused holds nothing: the list would open with the
     * keyboard still standing on the bar behind it, and no way to reach a single row of it. Focus lands on the current
     * mark when there is one — the row a reader is most likely to be comparing against — and on the first row when
     * there is not.
     *
     * `picked` is what tells a dismissal from a choice: choosing already puts focus on the chosen mark in the rebuilt
     * bar (see below), so only a dismissal has to give focus back to the `…` that opened this.
     */
    const list = popupEl.createDiv({ cls: 'orbis-mark-pick-list' });
    for (const m of marks) {
      const row = list.createEl('button', { cls: 'orbis-mark-pick-row' });
      if (isCurrent(m)) row.addClass('is-current');
      applyMarkPreview(row.createSpan({ text: t('presets.sample') }), m);
      const text = row.createDiv({ cls: 'orbis-mark-pick-text' });
      const nameRow = text.createDiv({ cls: 'orbis-mark-pick-name' });
      nameRow.createSpan({ text: m.name || t('presets.unnamed_mark') });
      // Same pair as the manager's list, for the same reason: with every mark unbadged, a list of the
      // preset's marks says nothing rather than "these are all the preset's".
      if (this.bookPreset) {
        nameRow.createSpan({
          cls: m.local ? 'orbis-mark-local-badge' : 'orbis-mark-local-badge is-tracked',
          text: t(m.local ? 'presets.mark_local' : 'presets.mark_tracked'),
        });
      }
      text.createDiv({ cls: 'orbis-mark-pick-sub', text: appearanceWords(m) });
      row.addEventListener('click', () => {
        picked = true;
        close();
        onPick(m);
        /**
         * Focus lands on the mark that was just chosen.
         *
         * Choosing rebuilds the bar, so whatever had focus is gone and the keyboard would be left nowhere. The chosen
         * mark is the honest place: it says what you
         * got, and its neighbors are one arrow away.
         *
         * A frame later, because the bar has to be rebuilt first; and only while it is still on screen, since
         * picking from the annotation bar creates the highlight and takes the whole bar away.
         */
        window.setTimeout(() => {
          if (!bar.isConnected) return;
          // `[data-orbis-mark-more]` is the … itself.
          const chosen = bar.querySelector<HTMLElement>('button[aria-checked="true"]');
          const chip = chosen ?? bar.querySelector<HTMLElement>('[data-orbis-mark-more]');
          if (chip?.offsetParent) {
            chip.focus();
            return;
          }
          // Nothing to land on because the bar went away with the pick — which is what the reader's annotation bar
          // does, while the note editor's row stays. So the keyboard goes back to the book instead of being left on
          // the body the closing popup dropped it on.
          this.ctx.contentEl.querySelector<HTMLElement>('.orbis-host')?.focus();
        }, 0);
      });
    }

    // Up and down walk the rows, as they do in the content panel's lists — a vertical list of names is a list, and
    // Tab reaching every row one at a time is correct but slow when a preset has a dozen marks.
    list.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const rows = Array.from(list.querySelectorAll<HTMLElement>('.orbis-mark-pick-row'));
      const i = rows.findIndex((row) => row === activeDocument.activeElement);
      const at = i === -1 ? 0 : Math.max(0, Math.min(rows.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)));
      rows[at]?.focus();
      e.preventDefault();
    });
    // On the current mark when there is one: the row a reader arriving here is comparing everything against.
    window.setTimeout(() => {
      const rows = Array.from(list.querySelectorAll<HTMLElement>('.orbis-mark-pick-row'));
      (rows.find((row) => row.hasClass('is-current')) ?? rows[0])?.focus();
    }, 0);

    // "None of these are right" is the thought that brings someone here, so the way to change the marks
    // belongs at the foot of the list — context-adjacent, and it costs the bar no width, unlike a fifth
    // button competing with the chips it is meant to support.
    const manage = list.createEl('button', { cls: 'orbis-mark-pick-row orbis-mark-pick-manage' });
    const icon = manage.createSpan({ cls: 'orbis-mark-pick-icon' });
    setSvgIcon(icon, annotationsSvg(16));
    manage.createDiv({ cls: 'orbis-mark-pick-text' }).createDiv({
      cls: 'orbis-mark-pick-name',
      text: t('annotation_picker.manage_marks'),
    });
    manage.addEventListener('click', () => {
      close();
      // Back to this list when the Marks dialog closes, as the listening marks dialog does: the list is where the
      // reader was. Drawn fresh, since marks may have been added, changed or turned off in there. Not if the bar went
      // away meanwhile: with no selection or note left, there is nothing to apply a mark to.
      this.host.openAnnotationPresets(() => {
        if (bar.isConnected) this.openMarkList(this.barMarks(), isCurrent, onPick, bar);
      });
    });

    /**
     * The list takes focus, on the mark it is already using.
     *
     * The rows are buttons, so Enter chooses one and Tab moves between them — but only once focus is inside the
     * list. Left on the `…` that opened the list, Tab would go to whatever comes next in the page behind and the
     * list could not be reached from the keyboard at all.
     *
     * Starting on the current mark rather than the first: it is the one a reader is deciding whether to change,
     * and it makes the neighbors one press away in either direction.
     */
    const rows = Array.from(list.querySelectorAll<HTMLElement>('button'));
    const start = rows.find((r) => r.hasClass('is-current')) ?? rows[0];
    // A frame later, or the popup's own opening focus takes it straight back.
    window.setTimeout(() => start?.focus(), 0);
  }

  // ── Selection picker (desktop) / drawer (mobile) ────────────────────────────

  setupHighlightUI(doc: Document, sectionIndex: number): void {
    // The picker's own styles are in styles.css (`#orbis-picker`), which Obsidian loads into every window.
    const picker = createDiv();
    picker.id = 'orbis-picker';
    // Focusable (not tabbable) so it can be the neutral default focus target on open — keeps focus
    // off a mode-specific button (whose tooltip Obsidian would then suppress), and lets the picker's
    // own Escape handler fire.
    picker.tabIndex = -1;

    let pickerMode: 'new' | 'edit' = 'new';
    let editCfiRange = '';
    let pendingCfi = '';
    let pendingText = '';
    // Saved at showNew time so swatch clicks can apply the highlight even if the
    // iframe selection becomes inactive when the outer-doc picker receives focus.
    let pendingRange: Range | null = null;

    const positionPicker = () => {
      const paneRect = this.ctx.contentEl.getBoundingClientRect();
      // Centered on the pane's horizontal midpoint — `#orbis-picker` carries `translateX(-50%)` — so the picker stays
      // centered whatever its width: it varies with which buttons show (full new-mode vs the Look-up/copy-link-only
      // restricted bar), and a fixed pixel offset would assume the full width and leave the narrower bars off-center.
      // Only one of `top` and `bottom` is ever set on a device, so the other stays at its initial `auto`.
      picker.style.left = `${paneRect.left + paneRect.width / 2}px`;
      if (Platform.isMobile) {
        // On mobile the picker sits at the bottom of the reader pane so it never
        // overlaps the native selection handles (teardrops) at the top of the page.
        picker.style.bottom = `${window.innerHeight - paneRect.bottom + 20}px`;
      } else {
        // Just below the Orbis toolbar, or below the reader's top when focus mode hides it: a hidden toolbar measures
        // as a zero box at the WINDOW's top, which would put the bar over the tabs desktop focus mode keeps.
        const toolbarRect = this.ctx.contentEl.querySelector('.orbis-toolbar')?.getBoundingClientRect();
        const top = toolbarRect?.height ? toolbarRect.bottom + 6 : paneRect.top + 6;
        picker.style.top = `${top}px`;
      }
      // In focus mode there's no toolbar, so the picker floats over the book. Theme it
      // to the book background/brightness (like the mobile drawer) instead of the default
      // dark chrome box, which stands out against a light/sepia book. The picker lives in
      // activeDocument.body (outside the .orbis-focus-mode subtree), so it can't inherit
      // the --orbis-host-* vars via CSS — apply the colors inline. Cleared out of focus.
      const fc = this.ctx.focusMode ? this.ctx.readerColors() : null;

      picker.style.background = fc ? fc.bg : '';
      picker.style.filter = fc ? fc.filter : '';
      picker.style.border = fc ? '1px solid rgba(128,128,128,.35)' : '';
      // Flatten the icon buttons onto the picker's book-colored background. Their injected
      // `background:none` lacks !important so Obsidian's default <button> background wins —
      // invisible against the normal dark picker, but a dark box on a light book. Inline
      // beats the stylesheet. Swatches are untouched (they carry their own colors).
      for (const btn of [copyTextBtn, noteBtn, copyLinkBtn, lookupBtn, deleteBtn]) {
        btn.style.color = fc ? fc.fg : '';
        btn.style.background = fc ? 'transparent' : '';
        btn.style.border = fc ? 'none' : '';
      }
      // The mark-name label belongs to this bar, so it follows it into the book's palette rather than
      // staying a dark chrome pill floating over a light page. It is a CHILD of the picker, so it is already
      // inside the brightness filter — only the two colors need setting.
      markLabel.style.background = fc ? fc.bg : '';
      markLabel.style.color = fc ? fc.fg : '';
    };

    const showNew = (rect: DOMRect, cfi: string, text: string, annotated = false) => {
      this.ctx.debug(`annot-ui: showNew isMobile:${Platform.isMobile} annotated:${annotated}`, 'select');
      pickerMode = 'new';
      editCfiRange = '';
      pendingCfi = cfi;
      pendingText = text;
      pendingRange = doc.defaultView?.getSelection()?.getRangeAt(0) ?? null;
      // The same range the swatches act on, where a hotkey can reach it: the bar's own state lives in a closure.
      this.quickTarget = pendingRange ? { sectionIndex, range: pendingRange, text } : null;

      if (Platform.isMobile) {
        this.openHighlightDrawer({
          cfi,
          text,
          mode: annotated ? 'lookup' : 'new',
          sectionIndex,
          selRange: doc.defaultView?.getSelection()?.getRangeAt(0),
          doc,
        });
        return;
      }

      renderBar();
      // New selection: nothing to name yet.
      this.flashMark(markLabel, null);
      // Shown and hidden only: each control's display when shown is its class's, in styles.css (`#orbis-picker`).
      copyTextBtn.toggle(!!text); // copy the selected text
      deleteBtn.hide();
      // On already-annotated text, offer only Look up + Copy link — no Add highlight/Note (that
      // would stack a second annotation; edit the existing one by tapping it). See annotations.md.
      noteBtn.toggle(!annotated);
      swatchGroup.toggle(!annotated);
      lookupBtn.show();
      // Copy link to the selection — always available on a selection (clean or annotated).
      copyLinkBtn.toggle(!!cfi);
      // Before positioning, because a detached element has no layout to position against.
      this.pickerEl = claimPickerSlot(activeDocument.body, picker, this.pickerEl);
      positionPicker();
      picker.classList.add('visible');
      picker.focus();
      const pickerRect = picker.getBoundingClientRect();
      this.ctx.debug(
        `annot-ui: picker shown left:${picker.style.left} top:${picker.style.top} inOuterDOM:${activeDocument.contains(picker)} rect:[${pickerRect.left.toFixed(0)},${pickerRect.top.toFixed(0)},${pickerRect.width.toFixed(0)}x${pickerRect.height.toFixed(0)}]`,
        'select'
      );
    };

    const showEdit = (cfiRange: string, rect: DOMRect, currentColor: string, currentMarkId?: string) => {
      pickerMode = 'edit';
      editCfiRange = cfiRange;
      this.shownAnnotation = cfiRange;
      pendingCfi = '';
      pendingText = '';

      if (Platform.isMobile) {
        this.openHighlightDrawer({
          cfi: cfiRange,
          text: '',
          mode: 'edit',
          sectionIndex,
          doc,
          currentColor,
          currentMarkId,
        });
        return;
      }

      renderBar(currentMarkId, currentColor);
      this.flashMark(markLabel, resolveMark(this.bookPreset, { markId: currentMarkId, color: currentColor }));
      copyTextBtn.toggle(!!this.highlightText(cfiRange));
      swatchGroup.show();
      deleteBtn.show();
      noteBtn.show(); // add a note to this highlight (converts it)
      lookupBtn.hide(); // Look up is a select action, not a tap/edit one
      copyLinkBtn.show(); // copy link is available on the highlight bar
      // Same claim as `showNew`: the bar about to be shown takes the slot, whichever section owns it.
      this.pickerEl = claimPickerSlot(activeDocument.body, picker, this.pickerEl);
      positionPicker();
      picker.classList.add('visible');
      picker.focus();
    };

    const hidePicker = () => {
      if (Platform.isMobile) this.hideHighlightDrawer();
      picker.classList.remove('visible');
      /**
       * Only the bar's own cursor is forgotten here.
       *
       * A stray `selectionchange` — clearing a selection, say — brings us through on its debounce even when the
       * bar was never showing an annotation, and wiping the cursor then would make stepping between annotations
       * return to the same one forever: it would forget where it was and re-derive "next" from the page it had just
       * moved to.
       * The note view keeps its own cursor and clears it when it closes.
       */
      if (pickerMode === 'edit') this.shownAnnotation = null;
      pickerMode = 'new';
      editCfiRange = '';
      pendingCfi = '';
      pendingText = '';
      pendingRange = null;
      this.quickTarget = null;
      /**
       * **Whoever was holding the keyboard in here gets sent back to the book**, and only then.
       *
       * Hiding the bar with focus inside it would leave the keyboard on a `display: none` button — nowhere, with the
       * reading keys dead until something is clicked. Every close path ends up here (a pick, Escape, a click in the
       * book, the selection going away), so this is the one place to handle it.
       *
       * Conditional because the bar also hides on a stray `selectionchange` while the reader is somewhere else
       * entirely — typing in the panel's search box, say — and taking focus off them then would be its own bug.
       */
      if (activeDocument.activeElement && picker.contains(activeDocument.activeElement)) {
        this.ctx.contentEl.querySelector<HTMLElement>('.orbis-host')?.focus();
      }
    };
    /**
     * Escape puts the bar away and the selection with it.
     *
     * Hiding the bar alone would leave the highlighted words with nothing to act on. Clearing the
     * selection too is what the reader's own Escape does out here, so both routes end the same way; the keyboard goes
     * back to the book in `hidePicker`.
     */
    picker.addEventListener('keydown', (e) => {
      // Delete or Backspace removes the passage selection or note the bar is showing — the trash button's act. A
      // bar raised on a new selection has nothing saved behind it, and the key does nothing there.
      if (pickerMode === 'edit' && isDeleteKey(e)) {
        e.preventDefault();
        this.deleteShownAnnotation();
        return;
      }
      if (e.key !== 'Escape') return;
      hidePicker();
      doc.defaultView?.getSelection()?.removeAllRanges();
    });
    /**
     * Tab stays in the bar while it is up.
     *
     * It is a floating toolbar for what is selected, sitting last in `document.body` — so Tab off its final button
     * would go into whatever Obsidian chrome happens to follow, with the bar still open behind the keyboard. Wrapping
     * keeps the two together, and Escape (above) is the way out.
     */
    trapTab(picker);

    // Copy-text button — always the leftmost action. Copies the selected text (new/lookup modes)
    // or the highlight's stored text (edit mode). prepend() forces it ahead of the note button,
    // which is created first below.
    const copyTextBtn = picker.createEl('button');
    copyTextBtn.className = 'orbis-note-btn orbis-picker-copy-text';
    setSvgIcon(copyTextBtn, COPY_TEXT_ICON);
    copyTextBtn.setAttribute('aria-label', t('annotation_picker.copy_text'));
    Object.assign(copyTextBtn.style, { display: 'none', alignItems: 'center', justifyContent: 'center' });
    copyTextBtn.addEventListener('mousedown', (e) => e.preventDefault());
    copyTextBtn.addEventListener('click', () => {
      const text = pickerMode === 'edit' ? this.highlightText(editCfiRange) : pendingText;
      hidePicker();
      doc.defaultView?.getSelection()?.removeAllRanges();
      void this.copyText(text);
    });
    picker.prepend(copyTextBtn);

    // Note button — visible only in new mode; opens the note editor popup
    const noteBtn = picker.createEl('button');
    noteBtn.className = 'orbis-note-btn orbis-picker-tool';
    setSvgIcon(
      noteBtn,
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>'
    );
    noteBtn.setAttribute('aria-label', t('annotation_picker.add_note'));
    noteBtn.addEventListener('mousedown', (e) => e.preventDefault());
    noteBtn.addEventListener('click', () => {
      if (pickerMode === 'edit') {
        // Add a note to the tapped highlight: open the editor with its text/color. Saving converts
        // the highlight to a note (saveNote deletes the same-CFI highlight); Cancel leaves it.
        const cfi = editCfiRange;
        const hlColor = this.highlights.find((h) => h.cfiRange === cfi)?.color;
        hidePicker();
        doc.defaultView?.getSelection()?.removeAllRanges();
        this.openNoteEditor({ cfiRange: cfi, selectedText: this.highlightText(cfi), color: hlColor });
        return;
      }
      const cfi = pendingCfi;
      const text = pendingText;
      hidePicker();
      doc.defaultView?.getSelection()?.removeAllRanges();
      if (cfi) this.openNoteEditor({ cfiRange: cfi, selectedText: text });
    });

    // Focus mode themes the picker to the book, so the selection ring must contrast with the reader
    // fg; elsewhere the shared class default (--text-normal) applies.
    const swatchRing = (): string | undefined => (this.ctx.focusMode ? this.ctx.readerColors().fg : undefined);
    const swatchGroup = picker.createDiv({ cls: 'orbis-picker-swatches' });
    swatchGroup.setAttribute('role', 'radiogroup');
    swatchGroup.setAttribute('aria-label', t('annotation_picker.mark'));
    // Names the mark a tapped highlight already carries (edit mode) — meaning has to be readable, not just
    // visible, or the bar can only ever be used by someone who memorized the colors. Absolutely positioned
    // below the bar, so it is free of the toolbar's width.
    const markLabel = picker.createDiv({ cls: 'orbis-picker-mark-name' });
    markLabel.hide();

    /** Rebuilt on every show: the preset can change while the book is open. */
    const renderBar = (currentMarkId?: string, currentColor?: string): void => {
      this.renderMarkBar(swatchGroup, {
        currentMarkId,
        currentColor,
        ring: swatchRing,
        textColor: this.ctx.focusMode ? this.ctx.readerColors().fg : undefined,
        onPick: (m) => {
          if (pickerMode === 'edit') {
            /**
             * **Choosing a mark finishes with the bar.**
             *
             * Staying up, for a reader who might try two or three in a row, would leave a toolbar sitting over the page
             * after the job is done, hiding the passage whose appearance you have just changed. Marking a fresh
             * selection closes it; a tapped mark does the same, and the text itself is the confirmation. `hidePicker`
             * sends the keyboard back to the book.
             */
            this.applyMarkToHighlight(editCfiRange, m);
            hidePicker();
            return;
          }
          // Use the range saved at showNew time — the iframe selection may be inactive now that the
          // outer-doc picker has received focus.
          const selRange = pendingRange;
          const text = pendingText;
          if (!selRange || !text) {
            hidePicker();
            return;
          }
          this.addHighlight(sectionIndex, selRange, text, m);
          doc.defaultView?.getSelection()?.removeAllRanges();
          hidePicker();
        },
      });
    };

    // Copy-link button — visible only in new mode when a CFI is available
    const copyLinkBtn = picker.createEl('button');
    copyLinkBtn.className = 'orbis-note-btn orbis-picker-copy-link';
    appendSvgIcons(copyLinkBtn, [
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style="margin-right:2px"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>',
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>',
    ]);
    copyLinkBtn.setAttribute('aria-label', t('annotation_picker.copy_link_to_selection'));
    Object.assign(copyLinkBtn.style, {
      display: 'none',
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: '4px',
      padding: '0',
    });
    copyLinkBtn.addEventListener('mousedown', (e) => e.preventDefault());
    copyLinkBtn.addEventListener('click', () => {
      const cfi = pickerMode === 'edit' ? editCfiRange : pendingCfi;
      hidePicker();
      doc.defaultView?.getSelection()?.removeAllRanges();
      void this.host.copyLocationLink(cfi, t('notices.location_unknown'));
    });

    // Look up button — after the colors/copy-link; delete (edit mode) sits to its right.
    const lookupBtn = picker.createEl('button');
    lookupBtn.className = 'orbis-note-btn orbis-picker-tool';
    setSvgIcon(lookupBtn, LOOKUP_ICON);
    lookupBtn.setAttribute('aria-label', t('annotation_picker.look_up'));
    lookupBtn.addEventListener('mousedown', (e) => e.preventDefault());
    lookupBtn.addEventListener('click', () => {
      const text = pendingText;
      hidePicker();
      doc.defaultView?.getSelection()?.removeAllRanges();
      if (text) this.host.lookUp(text);
    });

    // Delete button — visible only in edit mode. A trash icon (not an '×') so it clearly reads as
    // "delete this highlight," not "close."
    const deleteBtn = picker.createEl('button');
    deleteBtn.className = 'orbis-note-btn orbis-picker-tool';
    setSvgIcon(
      deleteBtn,
      '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>'
    );
    deleteBtn.setAttribute('aria-label', t('annotation_picker.remove_highlight'));
    deleteBtn.addEventListener('mousedown', (e) => e.preventDefault());
    deleteBtn.addEventListener('click', () => {
      const cfi = editCfiRange;
      hidePicker();
      doc.defaultView?.getSelection()?.removeAllRanges();
      this.removeHighlight(cfi);
    });

    // No × close button — the picker closes by clearing the selection (tapping/clicking away, or
    // Escape via the handler above), so a × would be redundant. The picker itself is the focus target.

    /**
     * Hosted in the outer (Obsidian) document, so it is unaffected by the book iframe's `position: fixed`
     * coordinate quirks.
     *
     * **But not attached here.** This runs once per section document, and removing the previous section's bar
     * here would take the bar belonging to the section you are READING out of the DOM as soon as a neighboring
     * section is rendered. The claim happens when a bar is shown instead; see `claimPickerSlot`.
     */
    /**
     * The same thing picking a swatch does, reachable from a hotkey.
     *
     * Click a passage mark and the bar opens on it; the key that would have marked a fresh selection should now
     * change THIS one. Routed through the bar rather than straight to the data so the ring and the flashed name
     * keep up — a mark changed behind the bar's back leaves it showing the old one.
     */
    const remark = (m: AnnotationMark): boolean => {
      if (pickerMode !== 'edit' || !editCfiRange) return false;
      this.applyMarkToHighlight(editCfiRange, m);
      renderBar(m.id, principalColor(m));
      this.flashMark(markLabel, m);
      return true;
    };
    this.pickerMap.set(doc, { showNew, showEdit, remark, hide: hidePicker });

    // Show picker on text selection. Check notes first (open editor directly),
    // then existing highlights (edit mode), then fall through to new-highlight mode.
    // On mobile, pointerup doesn't always fire during a long-press text selection, so we rely on selectionchange.
    let selectionTimer: number | null = null;
    const handleSelection = () => {
      this.ctx.debug('annot-ui: handleSelection fired', 'select');
      if (selectionTimer) window.clearTimeout(selectionTimer);
      selectionTimer = window.setTimeout(
        () => {
          this.ctx.debug(`annot-ui: timer fired — pickerMode:${pickerMode}`, 'select');
          if (pickerMode === 'edit') return;
          const sel = doc.defaultView?.getSelection();
          this.ctx.debug(
            `annot-ui: sel=${sel ? `type:${sel.type} collapsed:${sel.isCollapsed} text:"${sel.toString().slice(0, 20)}"` : 'null'}`,
            'select'
          );
          if (!sel || sel.isCollapsed || !sel.rangeCount || !sel.toString().trim()) {
            hidePicker();
            return;
          }
          const selRange = sel.getRangeAt(0);
          const rect = selRange.getBoundingClientRect();
          const text = sel.toString().trim();
          try {
            const cfi = this.rangeCfi(selRange, sectionIndex);
            // A selection always acts on the selected text — it never edits an existing
            // annotation (that's the tap gesture). If it overlaps any highlight/note, the bar is
            // restricted to Look up + Copy link (no stacking a second annotation). See
            // annotations.md.
            const annotated =
              this.notes.some((n) => cfiRangesOverlap(cfi, n.cfiRange)) ||
              this.highlights.some((h) => cfiRangesOverlap(cfi, h.cfiRange));
            this.ctx.debug(`annot-ui: showNew cfi="${cfi.slice(0, 30)}" annotated:${annotated}`, 'select');
            showNew(rect, cfi, text, annotated);
            return;
          } catch (err) {
            this.ctx.debug(`annot-ui: CFI error — ${String(err)}`, 'select');
          }
          this.ctx.debug('annot-ui: calling showNew (no cfi)', 'select');
          showNew(rect, '', text);
        },
        Platform.isMobile ? 300 : 30
      );
    };

    doc.addEventListener('pointerup', handleSelection);
    doc.addEventListener('selectionchange', handleSelection);

    /**
     * Escape, in two stages.
     *
     * Closing the bar and leaving the selection behind is not wrong so much as unfinished: the highlighted words
     * stay with no way to act on them. The ordinary rule is that Escape dismisses the topmost transient
     * thing, so the bar goes first and the selection second — one press never destroys a selection the reader is
     * still building.
     */
    doc.addEventListener('keydown', (e: KeyboardEvent) => {
      // The same Delete as the bar's own, for when the keyboard is back in the book with the bar still up.
      if (pickerMode === 'edit' && picker.classList.contains('visible') && isDeleteKey(e)) {
        e.preventDefault();
        this.deleteShownAnnotation();
        return;
      }
      if (e.key !== 'Escape') return;
      if (picker.style.display !== 'none') {
        hidePicker();
        return;
      }
      const sel = doc.defaultView?.getSelection();
      if (sel?.rangeCount && !sel.isCollapsed) {
        sel.removeAllRanges();
        e.preventDefault();
      }
    });

    // Hide picker when clicking inside the book doc. The picker lives in the
    // outer document, so clicks on it don't reach this listener. When clicking a
    // highlight, this fires first (hides picker), then show-annotation fires
    // (re-shows picker in edit mode) — correct ordering.
    doc.addEventListener('pointerdown', () => {
      hidePicker();
    });

    // A tap opens a mark or note just as foliate's click would — see `handleShowAnnotation`.
    if (Platform.isMobile) {
      watchAnnotationTouches(doc, sectionIndex, this.ctx, {
        onSelection: handleSelection,
        onTap: (value, range) => this.handleShowAnnotation(value, range),
      });
    }
  }

  // ── Programmatic entry points (read-aloud "highlight/annotate what I'm hearing") ──

  /** Highlight a range that wasn't produced by a text selection (e.g. the sentence or
   *  paragraph currently being read aloud). Persists like any other highlight.
   *  `sectionIndex` is the section the range lives in (the one being read). */
  highlightRange(range: Range, sectionIndex: number, choice?: MarkChoice): void {
    const text = range.toString().replace(/\s+/g, ' ').trim();
    if (!text) return;
    const cfiRange = this.rangeCfi(range, sectionIndex);
    // Don't stack an audio-clip highlight on top of an existing annotation (the selection path
    // already blocks this via lookup mode; the player buttons need the same guard).
    if (this.cfiRangeOverlapsAnnotation(cfiRange)) {
      new Notice(t('notices.annotation_exists_here'));
      return;
    }
    // The book's read-aloud mark by default — the first enabled mark until the reader pins one.
    const offered = this.offeredPreset();
    const mark = choice ?? (offered ? audioMark(offered) : undefined);
    if (!mark) return; // no preset and no color: nothing to draw, and nothing meaningful to record
    this.addHighlight(sectionIndex, range, text, mark);
  }

  /** Open the note editor on a range (the sentence being read aloud), pre-filled with its text. */
  addNoteForRange(range: Range, sectionIndex: number, onClose?: () => void): void {
    const text = range.toString().replace(/\s+/g, ' ').trim();
    if (!text) {
      onClose?.();
      return;
    }
    const cfiRange = this.rangeCfi(range, sectionIndex);
    if (this.cfiRangeOverlapsAnnotation(cfiRange)) {
      new Notice(t('notices.annotation_exists_here'));
      onClose?.(); // let the caller (player) resume — nothing was created
      return;
    }
    this.openNoteEditor({ cfiRange, selectedText: text, onClose });
  }

  // ── Copy text ─────────────────────────────────────────────────────────────
  // The native copy path is unreliable here: desktop can't copy from the foliate selection, and
  // Android's own selection menu vanishes after the first change — so the bars carry an explicit
  // Copy-text button (leftmost).

  /** Copy raw text to the clipboard with a confirmation notice. No-op on empty text. */
  private async copyText(text: string): Promise<void> {
    const t0 = (text ?? '').trim();
    if (!t0) return;
    try {
      await navigator.clipboard.writeText(t0);
      new Notice(t('notices.text_copied_to_clipboard'));
    } catch {
      // Clipboard permission denied / unavailable — nothing more we can do here.
    }
  }

  /** Stored text of the highlight at `cfiRange` (edit mode has no live selection). */
  private highlightText(cfiRange: string): string {
    return this.highlights.find((h) => h.cfiRange === cfiRange)?.text ?? '';
  }

  /** Whether a range CFI overlaps any existing highlight or note — used to block the read-aloud
   *  add-highlight/add-note buttons from stacking on an existing annotation. */
  private cfiRangeOverlapsAnnotation(cfiRange: string): boolean {
    // Strict overlap: a clean sentence adjacent to an annotated one only TOUCHES its boundary, which
    // shouldn't count (the inclusive cfiRangesOverlap would wrongly block it in sentence mode).
    return (
      this.highlights.some((h) => cfiRangesOverlapStrict(cfiRange, h.cfiRange)) ||
      this.notes.some((n) => cfiRangesOverlapStrict(cfiRange, n.cfiRange))
    );
  }

  /** Build the stored range CFI for a selection/sentence range, tightening it first so the ends
   *  don't spill into inter-element whitespace (which stores a CFI that runs past the passage into
   *  the next block). Works on a clone so the caller's live range/selection is untouched. */
  private rangeCfi(range: Range, sectionIndex: number): string {
    const clone = range.cloneRange();
    tightenRange(clone);
    const rawSection = this.ctx.bookSections[sectionIndex] as unknown as { cfi?: string };
    const baseCFI = rawSection?.cfi ?? cfiFake.fromIndex(sectionIndex);
    return cfiJoinIndir(baseCFI, cfiFromRange(clone));
  }

  // ── Highlights ──────────────────────────────────────────────────────────────

  /**
   * Apply the Nth mark — to the note being written, or to what is selected.
   *
   * **The two places a mark can land**, and a hotkey has to mean the right one in each: with the note editor open
   * it chooses that note's mark, and otherwise it marks the selection, exactly as clicking the swatch would.
   * The editor wins when both are live, because it is in front of you and you opened it deliberately.
   *
   * Numbered by `barMarks()` — enabled marks in preset order, the order the bar itself shows — so the key that
   * marks a passage yellow keeps marking it yellow. Reaches past the quick bar: a book with twelve marks can bind
   * nine of them, not just the six on show.
   *
   * Returns false when there is nothing to mark, which leaves the key to whatever else it was bound to.
   */
  applyQuickMark(index: number): boolean {
    const mark = this.barMarks()[index - 1];
    if (!mark) return false;
    return this.putMark(mark, index);
  }

  /**
   * Every annotation of a kind, in reading order.
   *
   * Sorted by `cfiSortKey`, the same ordering the saved panel and the reading records use, so "the next one" means
   * the same thing everywhere in the app rather than depending on which list you asked.
   */
  annotationsInOrder(kind: 'any' | 'highlight' | 'note'): { cfiRange: string; isNote: boolean }[] {
    const rows = [
      ...(kind === 'note' ? [] : this.highlights.map((h) => ({ cfiRange: h.cfiRange, isNote: false }))),
      ...(kind === 'highlight' ? [] : this.notes.map((n) => ({ cfiRange: n.cfiRange, isNote: true }))),
    ];
    return rows.sort((a, b) => cfiSortKey(a.cfiRange).localeCompare(cfiSortKey(b.cfiRange)));
  }

  /** The annotation on screen right now — the note view's, or the bar's in edit mode. */
  shownAnnotationCfi(): string | null {
    return this.shownAnnotation;
  }

  /**
   * Forget where the annotation cursor was, because the reader has gone somewhere themselves.
   *
   * Stepping leaves the cursor on the annotation it showed, which is what makes the next press advance. Navigating
   * by any other means — the contents panel, a bookmark, a search hit, the history arrows — leaves it pointing at
   * a chapter you have left, so the next step would jump forward from there instead of finding the first annotation
   * where you now are.
   */
  forgetShownAnnotation(): void {
    this.shownAnnotation = null;
  }

  /**
   * Show an annotation as though it had been clicked.
   *
   * Deliberately the same path a tap takes — `handleShowAnnotation` — so a note opens its view and a passage mark
   * opens the bar in edit mode, with a keyboard reader getting the same thing a mouse would rather than a second
   * UI that has to be kept in step.
   *
   * The live selection is cleared first because that path refuses to fire while one exists: a drag across a
   * highlight is someone acting on the selection, not tapping the annotation.
   */
  async showAnnotation(cfiRange: string, range: Range): Promise<void> {
    /**
     * Whatever was on screen goes first.
     *
     * A note's view replaces itself when the next one is also a note, but not when the next one is a passage mark
     * — the bar would open underneath a note the reader has already moved past. With a mouse the view
     * dismisses itself on the click that lands elsewhere; a keystroke is not a click, so it says so here.
     */
    this.noteViewCleanup?.();
    const sel = range.startContainer.ownerDocument?.defaultView?.getSelection();
    if (sel?.rangeCount) {
      sel.removeAllRanges();
      // **Wait for the selection handler to have its say.** Clearing fires `selectionchange`, whose debounced
      // handler closes the bar — and it would land after this, closing the very thing we are about to open.
      await new Promise((resolve) => window.setTimeout(resolve, 80));
    }
    this.handleShowAnnotation(cfiRange, range);
  }

  /**
   * Delete whichever annotation is on screen.
   *
   * A note goes through `requestDeleteNote`, so it asks first when the setting says to — deleting a note is
   * deleting something written. A passage mark goes straight, matching the trash button beside it and the
   * decision that a highlight is cheap to recreate.
   */
  deleteShownAnnotation(): boolean {
    const cfi = this.shownAnnotation;
    if (!cfi) return false;
    const note = this.notes.find((n) => n.cfiRange === cfi);
    if (note) {
      this.requestDeleteNote(note.id, () => this.noteViewCleanup?.());
      return true;
    }
    if (!this.highlights.some((h) => h.cfiRange === cfi)) return false;
    this.hidePickers();
    this.removeHighlight(cfi);
    return true;
  }

  /** Close whichever picker is showing, wherever it lives. */
  private hidePickers(): void {
    for (const api of this.pickerMap.values()) api.hide();
  }

  /**
   * No mark at all — the × in the note editor.
   *
   * **Only the note editor**, because only a note can have none: a highlight always has an appearance, so the
   * nearest thing there is deleting it, and a key that tidies a field in one place and destroys an annotation in
   * another is not one verb. Removing a highlight stays the trash button's job, a deliberate click.
   */
  clearQuickMark(): boolean {
    if (!this.notePick) return false;
    this.notePick(null);
    this.ctx.debug('mark cleared on the note being written', 'annot');
    return true;
  }

  private putMark(mark: AnnotationMark, index: number): boolean {
    /**
     * **The note editor comes first**, whatever else is open behind it.
     *
     * A note is often written from the bar after clicking a passage mark, which leaves that bar in edit mode — so
     * asking it first would make the key re-mark the highlight underneath instead of the note being written. The
     * order is what is in front of you: the dialog you opened, then the thing you clicked, then text you selected.
     */
    if (this.notePick) {
      this.notePick(mark);
      this.ctx.debug(`mark ${index} → the note being written (${mark.name || 'unnamed'})`, 'annot');
      return true;
    }
    // A passage mark opened by clicking it: the key changes THAT one.
    for (const api of this.pickerMap.values()) {
      if (!api.remark(mark)) continue;
      this.ctx.debug(`mark ${index} → the passage mark on screen (${mark.name || 'unnamed'})`, 'annot');
      return true;
    }
    const target = this.quickTarget;
    if (!target) {
      // Said out loud: a hotkey that quietly does nothing is indistinguishable from one that never arrived.
      this.ctx.debug(`mark ${index} → nothing to mark (no note editor, no bar, no selection)`, 'annot');
      return false;
    }
    this.addHighlight(target.sectionIndex, target.range, target.text, mark);
    this.ctx.debug(`mark ${index} → the selection (${mark.name || 'unnamed'})`, 'annot');
    // Same as picking the swatch: the passage is marked, so the selection and its bar have done their job.
    target.range.startContainer.ownerDocument?.defaultView?.getSelection()?.removeAllRanges();
    this.quickTarget = null;
    return true;
  }

  private addHighlight(sectionIndex: number, selRange: Range, text: string, choice: MarkChoice): void {
    const { color, markId, treatment } = this.appearanceOf(choice);
    const cfiRange = this.rangeCfi(selRange, sectionIndex);
    // If the user re-selects an existing highlight exactly, re-mark it instead.
    const existing = this.highlights.find((h) => h.cfiRange === cfiRange);
    if (existing) {
      this.applyMarkToHighlight(cfiRange, choice);
      return;
    }
    // The heading the passage is under, not the last heading on the page — see `toc-entry.ts`.
    const entry = this.ctx.tocEntryAt(cfiRange);
    const chapter = entry?.label || undefined;
    const chapterHref = entry?.href || undefined;
    // Where the passage begins, by the index; none before it is up, until the book next opens with it.
    const loc = this.ctx.getLocForCfi(cfiRange) ?? undefined;
    const h: Highlight = {
      id: crypto.randomUUID(),
      cfiRange,
      text,
      color,
      // Which mark this IS, plus how that mark draws now as the fallback if it is ever deleted.
      markId,
      treatment,
      createdAt: Date.now(),
      chapter,
      chapterHref,
      loc,
    };
    this.highlights.push(h);
    this.persistHighlights();
    void this.ctx.foliateView?.addAnnotation({ value: cfiRange, color });
    this.ctx.debug(
      `highlight add — cfi:${cfiRange.slice(0, 40)} color:${color} section:${this.ctx.currentSectionIndex}`,
      'annot'
    );
    this.host.refreshSavedPanelIfOpen();
  }

  /** Re-mark an existing highlight. The whole appearance moves together — mark, color and treatment — so
   *  the record can never claim one mark while drawing another. */
  private applyMarkToHighlight(cfiRange: string, choice: MarkChoice): void {
    const h = this.highlights.find((hl) => hl.cfiRange === cfiRange);
    if (!h) return;
    const { color, markId, treatment } = this.appearanceOf(choice);
    void this.ctx.foliateView?.deleteAnnotation({ value: cfiRange });
    this.highlights = this.highlights.map((hl) =>
      hl.cfiRange === cfiRange ? { ...hl, color, markId, treatment } : hl
    );
    this.persistHighlights();
    void this.ctx.foliateView?.addAnnotation({ value: cfiRange, color });
    this.ctx.debug(
      `highlight re-mark — cfi:${cfiRange.slice(0, 40)} old:${h.color}/${h.markId ?? '-'} new:${color}/${markId ?? '-'}`,
      'annot'
    );
    this.host.refreshSavedPanelIfOpen();
  }

  removeHighlight(cfiRange: string): void {
    // Read before the filter: the id is what identifies this highlight's record, and after the filter it is gone.
    const deleted = this.highlights.filter((h) => h.cfiRange === cfiRange).map((h) => h.id);
    this.highlights = this.highlights.filter((h) => h.cfiRange !== cfiRange);
    this.persistHighlights(deleted);
    void this.ctx.foliateView?.deleteAnnotation({ value: cfiRange });
    this.ctx.debug(`highlight delete — cfi:${cfiRange.slice(0, 40)}`, 'annot');
    this.host.refreshSavedPanelIfOpen();
  }

  hideHighlightDrawer(): void {
    this.highlightDrawerRow?.hide();
    this.hlDrawerState = null;
  }

  /**
   * Put the annotation bar away — **this view's bar, not whichever one is first in the body.**
   *
   * The bar is parented to `document.body` rather than to the reader, so that it is unaffected by the book
   * iframe's `position: fixed` quirks. The cost is that it belongs to no leaf, and outlives one: leaving the book
   * for another tab would leave it floating over whatever the reader went to look at.
   *
   * `this.pickerEl`, because two open books mean two elements carrying `id="orbis-picker"` and
   * `getElementById` answers with the first, which would hide the other book's bar while leaving this one up.
   */
  /**
   * Forget a document that is no longer displayed.
   *
   * **The map the detached-document sweep has to reach too.** `OrbisReaderView` drops dead documents from
   * `docToSection` and `loadedDocs` because an old one "goes on answering lookups with a page that is no longer
   * displayed" — and this map answers exactly such a lookup. Unswept, it grows for the life of the book, one entry
   * per section ever rendered.
   */
  forgetDoc(doc: Document): void {
    this.pickerMap.delete(doc);
  }

  hideAnnotationBar(): void {
    this.hideHighlightDrawer();
    this.pickerEl?.classList.remove('visible');
  }

  /**
   * Is any annotation UI on screen for this book? **A class check and a null check, and that is the point.**
   *
   * The caller runs on every leaf change, for every open book, and what it guards is a sweep that asks each of the
   * book's documents for its selection — and reading a selection can force that document to lay itself out. One
   * book, once, is nothing; every book on every tab switch is a stall the reader feels. This says "nothing to do"
   * without touching a document.
   */
  hasAnnotationUI(): boolean {
    return this.pickerEl?.classList.contains('visible') === true || this.hlDrawerState !== null;
  }

  private openHighlightDrawer(state: HlDrawerState): void {
    if (!this.highlightDrawer) return;
    this.hlDrawerState = state;
    this.highlightDrawer.empty();

    const { cfi, text, mode, sectionIndex, doc, selRange, currentColor, currentMarkId } = state;

    // Copy-text button — leftmost, all modes. Copies the selection (new/lookup) or the highlight's
    // stored text (edit).
    const copyTarget = mode === 'edit' ? this.highlightText(cfi) : text;
    if (copyTarget) {
      const copyTextBtn = this.highlightDrawer.createEl('button', {
        cls: 'orbis-note-btn',
        attr: { 'aria-label': t('annotation_picker.copy_text') },
      });
      setSvgIcon(copyTextBtn, COPY_TEXT_ICON);
      Object.assign(copyTextBtn.style, { background: 'transparent', border: 'none', boxShadow: 'none' });
      copyTextBtn.addEventListener('mousedown', (e) => e.preventDefault());
      copyTextBtn.addEventListener('click', () => {
        this.hideHighlightDrawer();
        doc.defaultView?.getSelection()?.removeAllRanges();
        void this.copyText(copyTarget);
      });
    }

    // Note button — in new mode (add a note to the selection) and edit mode (add a note to the
    // tapped highlight, converting it). Hidden in lookup mode.
    if (mode !== 'lookup') {
      const noteBtn = this.highlightDrawer.createEl('button', {
        cls: 'orbis-note-btn',
        attr: { 'aria-label': t('annotation_picker.add_note') },
      });
      setSvgIcon(
        noteBtn,
        '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>'
      );
      noteBtn.addEventListener('mousedown', (e) => e.preventDefault());
      noteBtn.addEventListener('click', () => {
        this.hideHighlightDrawer();
        doc.defaultView?.getSelection()?.removeAllRanges();
        if (mode === 'edit') {
          const hl = this.highlights.find((h) => h.cfiRange === cfi);
          this.openNoteEditor({
            cfiRange: cfi,
            selectedText: this.highlightText(cfi),
            color: hl?.color,
            markId: hl?.markId,
          });
        } else if (cfi) {
          this.openNoteEditor({ cfiRange: cfi, selectedText: text });
        }
      });
    }

    // Swatches — use setAttribute so raw CSS (including vendor-prefixed appearance reset)
    // is applied verbatim, overriding the iOS UA stylesheet's oval button shape.
    const swatchGroup = this.highlightDrawer.createDiv();
    swatchGroup.setAttribute('role', 'radiogroup');
    swatchGroup.setAttribute('aria-label', t('annotation_picker.mark'));
    // 'lookup' mode (selection overlaps an annotation) offers no mark — hide the bar.
    if (mode === 'lookup') swatchGroup.hide();
    const drawerRing = (): string | undefined => (this.ctx.focusMode ? this.ctx.readerColors().fg : undefined);
    this.renderMarkBar(swatchGroup, {
      currentMarkId: mode === 'edit' ? currentMarkId : undefined,
      currentColor: mode === 'edit' ? currentColor : undefined,
      ring: drawerRing,
      textColor: this.ctx.focusMode ? this.ctx.readerColors().fg : undefined,
      onPick: (m) => {
        if (mode === 'edit') {
          this.applyMarkToHighlight(cfi, m);
          this.hideHighlightDrawer(); // close after an edit on the mobile drawer
          return;
        }
        if (!selRange) {
          this.hideHighlightDrawer();
          return;
        }
        this.addHighlight(sectionIndex, selRange, text, m);
        doc.defaultView?.getSelection()?.removeAllRanges();
        this.hideHighlightDrawer();
      },
    });
    // Names the mark in edit mode, same transient label as the desktop bar.
    if (mode === 'edit') {
      // In focus mode the drawer is a floating pill 16px off the BOTTOM of the screen, so a label below it
      // would sit off the edge — flip it above there.
      const drawerMarkLabel = this.highlightDrawer.createDiv({
        cls: this.ctx.focusMode ? 'orbis-picker-mark-name is-above' : 'orbis-picker-mark-name',
      });
      if (this.ctx.focusMode) {
        const { bg, fg } = this.ctx.readerColors();
        drawerMarkLabel.style.background = bg;
        drawerMarkLabel.style.color = fg;
      }
      drawerMarkLabel.hide();
      this.flashMark(drawerMarkLabel, resolveMark(this.bookPreset, { markId: currentMarkId, color: currentColor }));
    }

    // Copy link button — left group, after the colors (available in all modes).
    {
      const copyLinkBtn = this.highlightDrawer.createEl('button', {
        cls: 'orbis-note-btn',
        attr: {
          'aria-label': t('annotation_picker.copy_link_to_selection'),
        },
      });
      appendSvgIcons(copyLinkBtn, [
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style="margin-right:2px"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>',
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>',
      ]);
      Object.assign(copyLinkBtn.style, {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: '4px',
        padding: '0',
        background: 'transparent',
        border: 'none',
        boxShadow: 'none',
      });
      copyLinkBtn.addEventListener('mousedown', (e) => e.preventDefault());
      copyLinkBtn.addEventListener('click', () => {
        this.hideHighlightDrawer();
        doc.defaultView?.getSelection()?.removeAllRanges();
        void this.host.copyLocationLink(cfi, t('notices.location_unknown'));
      });
    }

    // Look up button — left group, on the selection modes only (Look up is a select action, not a
    // tap/edit one). Never in 'edit'.
    if ((mode === 'new' || mode === 'lookup') && text) {
      const lookupBtn = this.highlightDrawer.createEl('button', {
        cls: 'orbis-note-btn',
        attr: { 'aria-label': t('annotation_picker.look_up') },
      });
      setSvgIcon(lookupBtn, LOOKUP_ICON);
      lookupBtn.addEventListener('mousedown', (e) => e.preventDefault());
      lookupBtn.addEventListener('click', () => {
        this.hideHighlightDrawer();
        doc.defaultView?.getSelection()?.removeAllRanges();
        this.host.lookUp(text);
      });
    }

    // Delete button (edit mode only) — a trash icon (not '×', to avoid confusion with close).
    // No margin-left:auto — let the whole row center (matching
    // the from-scratch selection bar) instead of pinning delete to the right edge.
    if (mode === 'edit') {
      const deleteBtn = this.highlightDrawer.createEl('button', {
        cls: 'orbis-note-btn',
        attr: {
          'aria-label': t('annotation_picker.remove_highlight'),
        },
      });
      setSvgIcon(
        deleteBtn,
        '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>'
      );
      deleteBtn.addEventListener('mousedown', (e) => e.preventDefault());
      deleteBtn.addEventListener('click', () => {
        this.hideHighlightDrawer();
        doc.defaultView?.getSelection()?.removeAllRanges();
        this.removeHighlight(cfi);
      });
    }

    // No × close button — the drawer closes by clearing the selection (tapping away, or Escape), so
    // a × would be redundant. In edit mode the Delete button's margin-left:auto still right-aligns it;
    // in new/lookup modes the row is centered.

    this.highlightDrawerRow?.show();
  }

  // ── Notes ─────────────────────────────────────────────────────────────────

  // Opens a note editor popup in the Obsidian document (not inside the book iframe).
  // When existingNote is provided, the editor pre-fills the note text and shows Delete.
  // Notes always carry a highlight color so they appear as colored text in the book.
  /** Close the read-only note view if one is open (e.g. stepping to a non-note search result). */
  closeNoteView(): void {
    this.noteViewCleanup?.();
  }

  /** Read-only note view — the default when a note is tapped or its margin pencil is clicked. Shows
   *  the anchored passage + note body, with Edit / Copy link / Delete actions. Opening the editor
   *  (with its keyboard) is a deliberate step (Edit), not the first thing you see. `highlight` (or
   *  the active search term) marks the matched word in the passage/body. */
  openNoteView(note: Note, opts?: { highlight?: string }): void {
    if (this.notePopupEl) return; // editor is open — don't stack a view on top of it
    this.noteViewCleanup?.(); // replace any existing view (e.g. tapping a second note)
    this.shownAnnotation = note.cfiRange;

    const { popupEl: popup, close } = createOrbisPopup(this.ctx, {
      title: t('note_view.title'),
      icon: NOTE_ICON,
      dismissOnOutsideClick: true,
      // No text input, so no keyboard to reserve for — use the full height so the passage + note + actions
      // fit without the dialog scrolling on mobile.
      mobileFillHeight: true,
      // Use most of the width on tablets (iPad) instead of a fixed 360px; capped so it isn't absurd.
      mobileWidthPct: 0.92,
      mobileMaxWidth: 640,
      onClose: () => {
        if (this.noteViewCleanup === close) this.noteViewCleanup = null;
        this.shownAnnotation = null;
      },
    });
    this.noteViewCleanup = close;
    // Delete or Backspace is the Delete button below, asking first when Confirm before deleting notes is on. The view
    // has no text field, so neither key has editing to do here.
    popup.addEventListener('keydown', (e) => {
      if (!isDeleteKey(e)) return;
      e.preventDefault();
      this.requestDeleteNote(note.id, () => close());
    });
    const body = popup.createDiv({ cls: 'orbis-note-view' });

    // Mark the matched query text in the quote/body (only the field that matched contains it).
    // Falls back to the active search term, so tapping a flashed note during a search marks the
    // same word that clicking the search result would. Case-insensitive — marking is cosmetic.
    const q = (opts?.highlight ?? this.ctx.activeSearchTerm() ?? '').trim();
    const renderText = (el: HTMLElement, text: string) => {
      const hay = text.toLowerCase();
      const ndl = q.toLowerCase();
      let pos = q ? hay.indexOf(ndl) : -1;
      if (pos < 0) {
        el.textContent = text;
        return;
      }
      let cur = 0;
      while (pos >= 0) {
        if (pos > cur) el.appendText(text.slice(cur, pos));
        el.createEl('mark', { cls: 'orbis-search-mark', text: text.slice(pos, pos + q.length) });
        cur = pos + q.length;
        pos = hay.indexOf(ndl, cur);
      }
      if (cur < text.length) el.appendText(text.slice(cur));
    };

    // Anchored passage (the highlighted/selected text) — a scrolling box themed to the reader page
    // (background/text/brightness), like the link preview, so it reads as a slice of the book.
    if (note.selectedText) {
      const quote = body.createDiv({ cls: 'orbis-note-view-quote' });
      renderText(quote, note.selectedText);
      const { bg, fg, filter } = this.ctx.readerColors();
      quote.style.background = bg;
      quote.style.color = fg;
      quote.style.filter = filter;
      // The bar takes the mark's color when one resolves, so it agrees with what is drawn on the page
      // after a mark is recoloured — the stored hex is only the fallback.
      const barColor = principalColor(resolveMark(this.bookPreset, note)) ?? note.color;
      if (barColor && barColor !== 'transparent') quote.style.borderLeftColor = barColor;
    }

    // What the mark MEANS, under the passage it applies to. The color bar says which mark visually; this
    // says it in words, which is the whole point of the feature.
    // Absent when nothing resolves — a note with no mark is a normal, supported state, and naming it here (or
    // in the title) would be noise rather than the answer to a question anyone asked. The title stays "Note"
    // whether or not there is a mark.
    const noteMarkFor = resolveMark(this.bookPreset, note);
    if (noteMarkFor) {
      const row = body.createDiv({ cls: 'orbis-note-view-mark' });
      // The sample says which mark, the name says what it means. No leading "annotations" glyph: a rendered
      // mark IS the icon for a mark, so a plain one beside it would be the same statement twice — and two
      // "Aa"s side by side read as a comparison rather than as a label and a specimen.
      //
      // "Aa", not the word "Sample": inline beside a name this is a swatch, and a word there reads as a
      // label for the name rather than as a specimen of the mark. The LISTS keep "Sample" — they have a
      // sample column with room, and a specimen of real text is what a column of them is for.
      applyMarkPreview(row.createSpan({ text: t('annotation_picker.mark_sample') }), noteMarkFor);
      row.createSpan({ cls: 'orbis-note-view-mark-name', text: noteMarkFor.name || t('presets.unnamed_mark') });
    }

    // Note body — a scrolling box (keeps the modal bounded on mobile) with an edit pencil to its
    // right. The pencil both replaces the Edit button and cues that this text is the user's note.
    const noteRow = body.createDiv({ cls: 'orbis-note-view-noterow' });
    const bodyEl = noteRow.createDiv({ cls: 'orbis-note-view-body' });
    renderText(bodyEl, note.text?.trim() || t('note_view.empty'));
    const editBtn = noteRow.createEl('button', { cls: 'orbis-ctrl-btn orbis-note-view-editbtn' });
    editBtn.setAttribute('aria-label', t('note_view.edit'));
    setSvgIcon(
      editBtn,
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>'
    );
    editBtn.addEventListener('click', () => {
      close();
      this.openNoteEditor({ cfiRange: note.cfiRange, selectedText: note.selectedText ?? '', existingNote: note });
    });
    /**
     * The pencil takes focus, so Enter edits.
     *
     * Reading a note and wanting to change it is the common next move, and stepping between annotations from the
     * keyboard should not end at a dialog you have to reach for the mouse to use. Editing rather than deleting,
     * because Enter has to be the safe one: Delete is a button away and asks first.
     *
     * Deferred a frame — the popup takes focus itself as it opens, and would otherwise take it straight back.
     */
    window.setTimeout(() => editBtn.focus(), 0);

    // Actions: Delete (left) · Copy link (right). Editing is the pencil above. Delete routes through
    // the shared confirm (respects the "confirm before deleting notes" setting) and closes the view
    // once the note is gone.
    const actions = body.createDiv({ cls: 'orbis-note-view-actions' });
    // `destructive` rather than a bespoke red: Obsidian owns what a destructive button looks like, and a class with
    // a hardcoded red and radius matches neither the theme nor its neighbors.
    actionButton(actions, {
      label: t('action.delete'),
      destructive: true,
      onClick: () => this.requestDeleteNote(note.id, () => close()),
    });
    const copyBtn = actions.createEl('button', { cls: 'orbis-ctrl-btn orbis-note-view-copy' });
    copyBtn.setAttribute('aria-label', t('note_view.copy_link'));
    appendSvgIcons(copyBtn, [
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="margin-right:2px"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>',
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>',
    ]);
    copyBtn.addEventListener('click', () => {
      void this.host.copyLocationLink(note.cfiRange, t('notices.location_unknown'));
    });
  }

  /** Delete a note, respecting the "Confirm before deleting notes" setting: deletes immediately when
   *  off, else shows a shared confirm dialog. Called from both the note view and the saved panel so
   *  the confirmation is consistent. `onDeleted` runs after an actual delete (e.g. close the view /
   *  re-render the panel). */
  requestDeleteNote(id: string, onDeleted?: () => void): void {
    if (!this.ctx.confirmDeleteNote) {
      this.deleteNote(id);
      onDeleted?.();
      return;
    }
    // Through the shared confirm, like every other "this cannot be taken back" question. A hand-built popup would
    // give the same question two different Delete buttons depending on where it was asked from.
    confirmThen(
      this.ctx.app,
      {
        title: t('note_view.delete_confirm_title'),
        message: t('note_view.delete_confirm'),
        confirmText: t('action.delete'),
      },
      () => {
        this.deleteNote(id);
        onDeleted?.();
      }
    );
  }

  private openNoteEditor(opts: {
    cfiRange: string;
    selectedText: string;
    existingNote?: Note;
    /** Initial appearance for a NEW note (no existingNote) — converting a highlight carries its mark
     *  over, so the meaning survives the conversion. Falls back to the default note-highlight color. */
    color?: string;
    markId?: string;
    onClose?: () => void;
  }): void {
    if (this.notePopupEl) {
      opts.onClose?.();
      return;
    }

    const { popupEl: popup, close } = createOrbisPopup(this.ctx, {
      scrollsInside: true, // the buttons sit outside the scroll region — see below
      title: opts.existingNote ? t('note_editor_popup.edit_note') : t('note_editor_popup.add_note'),
      icon: NOTE_ICON,
      // Deliberately no outside-click dismiss — accidentally tapping outside while
      // typing a note would lose unsaved text.
      dismissOnOutsideClick: false,
      // Roomier on desktop — no reason to type a note in a cramped box when there's space.
      desktopWidth: '520px',
      /**
       * **Sized to the space above the keyboard, in both orientations — never to the whole screen.**
       *
       * This dialog auto-focuses its field, so the keyboard is up whenever it is open: the keyboard-safe zone
       * IS its honest size, always, and sizing it that way needs no focus-driven change. That matters because
       * the keyboard cannot be detected, so anything that reacts to focus is still in effect after the keyboard
       * is dismissed — dismissing it does not blur the field.
       *
       * **Taking the whole height is worse.** It buys no usable space: a landscape phone keyboard covers 52%, so
       * the visible strip is the same either way, while the marks row and the buttons fall below it — and the
       * keyboard reserve cannot rescue them, because a `flex: 1` field absorbs every pixel of the padding before it
       * can become somewhere to scroll.
       *
       * `mobileFillAvailable` fills that safe zone and gives the popup a DEFINITE height, which the field needs:
       * a `flex: 1` child of an auto-height column has no free space to grow into.
       *
       * **Landscape is the exception, and only landscape.** There the safe zone is ~200px and the title and
       * footer are ~90px of it, so a complete dialog cannot fit at any height — two columns fail for the
       * same reason, since halving the ROWS does not help when the surviving row is 110px and
       * holds a quote and a field. So landscape takes the whole screen and scrolls, which needs the field to
       * stop growing (see `.orbis-note-editor-input`) or it would absorb the reserve and nothing would scroll.
       */
      mobileFillAvailable: true,
      mobileFillHeight: 'landscape',
      /**
       * Most of the width, and on a landscape phone that is most of ~900px rather than 640.
       * The percentage governs in portrait (0.92 of ~415 is well under the cap), so raising the cap changes
       * landscape — where the extra width is what lets the quote sit beside the field instead of above it.
       */
      mobileWidthPct: 0.92,
      mobileMaxWidth: 960,
      onClose: () => {
        if (this.notePopupEl === popup) this.notePopupEl = null;
        if (this.notePopupCleanup === close) this.notePopupCleanup = null;
        // A mark hotkey has nowhere to put a mark once the editor is gone; it goes back to acting on a selection.
        this.notePick = null;
        opts.onClose?.();
      },
    });
    this.notePopupEl = popup;
    this.notePopupCleanup = close;

    /**
     * **The scrolling middle.** `createOrbisPopup` makes the popup itself the scroller, which would put the
     * buttons at the end of the content — reachable only by scrolling past the quote and the note. So the popup
     * `scrollsInside`: this body takes what is left and scrolls inside it, and the footer beside it holds its ground.
     *
     * `orbis-popup-scroll` is also the name `createOrbisPopup` looks for when it reserves the keyboard's share,
     * so the padding lands on the thing that actually scrolls.
     *
     * **And a column, so the note field fills the middle** (`orbis-note-editor-body`). `.orbis-popup-scroll` is a
     * scroller, not a flex container — the export dialogs it is shared with stack their content and scroll it. Here
     * the textarea asks for `flex: 1 1 auto`, and without a flex parent it gets nothing and sits at its 140px minimum
     * with the rest of a full-height dialog empty beneath it.
     */
    const body = popup.createDiv({ cls: 'orbis-popup-scroll orbis-note-editor-body' });

    // Passage preview — same reader-themed scrolling box + highlight-color bar as the note view,
    // for consistency. The bar tracks the currently-selected color (updated in updateColorBorders).
    let previewQuote: HTMLElement | null = null;
    if (opts.selectedText) {
      // Extra class caps the height on mobile (it scrolls) so the keyboard leaves room for the note.
      previewQuote = body.createDiv({ cls: 'orbis-note-view-quote orbis-note-editor-quote' });
      previewQuote.textContent = opts.selectedText;
      const { bg, fg, filter } = this.ctx.readerColors();
      previewQuote.style.background = bg;
      previewQuote.style.color = fg;
      previewQuote.style.filter = filter;
    }

    const textarea = body.createEl('textarea', { cls: 'orbis-note-editor-input' });
    // Appearance and sizing are in `.orbis-note-editor-input`, so a landscape phone can relax the minimum
    // height that would otherwise force this dialog taller than the space above the keyboard.
    if (!Platform.isMobile) textarea.addClass('orbis-note-editor-input--desktop');
    textarea.value = opts.existingNote?.text ?? '';
    textarea.placeholder = t('note_editor_popup.add_a_note');

    // Mark picker — optional; × = no highlight at all, which stays a supported permanent state for a note.
    const markRow = body.createDiv();
    Object.assign(markRow.style, { display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' });
    markRow.setAttribute('role', 'radiogroup');
    const markLabel = markRow.createSpan();
    markLabel.id = `orbis-note-mark-label-${crypto.randomUUID()}`;
    markLabel.textContent = t('annotation_picker.mark');
    // Scale with Obsidian's Appearance → Font size, like the note text above it.
    Object.assign(markLabel.style, {
      fontSize: 'var(--font-text-size, 16px)',
      color: 'var(--text-muted)',
      flexShrink: '0',
    });
    markRow.setAttribute('aria-labelledby', markLabel.id);

    // An existing note keeps whatever it has (including nothing). A new one takes the mark the caller
    // carried over (converting a highlight), else the book's NOTE-role mark — which is unset by default, so
    // a new note gets no highlight unless the reader chose one for this book. The role resolves through what the
    // book OFFERS, so a mark turned off here is never the one a new note arrives wearing.
    const offeredForNote = this.offeredPreset();
    let selected: AnnotationMark | null =
      opts.existingNote !== undefined
        ? (resolveMark(this.bookPreset, opts.existingNote) ?? null)
        : ((opts.markId || opts.color
            ? resolveMark(this.bookPreset, { markId: opts.markId, color: opts.color })
            : offeredForNote && noteMark(offeredForNote)) ?? null);
    // A color with no matching mark (a converted highlight whose mark is gone) is still honored, riding
    // along as a bare color.
    let selectedColor: string | null =
      principalColor(selected ?? undefined) ??
      (opts.existingNote !== undefined ? (opts.existingNote.color ?? null) : (opts.color ?? null));

    const noneHandle = createColorSwatch(markRow, {
      fill: null,
      // **Shared with the Saved panel's swatch** — one state should not have two names. "No highlight color"
      // would name a third of what the button does under a row
      // labeled *Mark*: a mark is a highlighter AND a treatment, and this clears the mark. "Unmarked" over "No
      // mark" is that key's own argument — it stands in a row of names, so it reads as one.
      label: t('presets.no_mark'),
      noneStyle: 'x',
    });
    noneHandle.btn.setAttribute('role', 'radio');
    const syncNone = (): void => {
      const isNone = selectedColor === null;
      noneHandle.btn.setAttribute('aria-checked', String(isNone));
      // A stop of its own, like every other swatch — see `setAllTabStops`. "No mark" is a choice like any other, and
      // the one a reader is most likely to want without knowing to arrow to it.
      noneHandle.btn.tabIndex = 0;
      noneHandle.setSelected(isNone);
      // Keep the passage preview's color bar in sync with the choice.
      if (previewQuote) previewQuote.style.borderLeftColor = selectedColor ?? 'var(--interactive-accent)';
    };
    // Same path a hotkey takes, so the button and the key cannot drift apart.
    noneHandle.btn.addEventListener('click', () => pickMark(null));

    const marksHost = markRow.createDiv();
    // What is selected, on its own line UNDER the bar — with a sample, not just a name. Picking from the
    // overflow list chooses a mark that is not on the bar, so nothing there can show what you got; a name
    // alone would leave the appearance a guess. No icon here, unlike the read-only view: the row above is
    // already labeled "Mark", so a glyph saying the same thing would be noise.
    const markSelected = body.createDiv({ cls: 'orbis-note-mark-selected' });
    /**
     * Choosing a mark for the note being written — from a swatch, from the × , or from a hotkey while the editor
     * is open. `null` is the × : no mark at all, which is a state a note is allowed to keep.
     */
    const pickMark = (m: AnnotationMark | null): void => {
      selected = m;
      selectedColor = m ? (principalColor(m) ?? null) : null;
      renderMarks();
    };
    this.notePick = pickMark;

    const renderMarks = (): void => {
      markSelected.empty();
      markSelected.toggle(!!selected);
      if (selected) {
        applyMarkPreview(markSelected.createSpan({ text: t('annotation_picker.mark_sample') }), selected);
        markSelected.createSpan({
          cls: 'orbis-note-mark-name',
          text: selected.name || t('presets.unnamed_mark'),
        });
      }
      this.renderMarkBar(marksHost, {
        currentMarkId: selected?.id,
        currentColor: selected ? undefined : (selectedColor ?? undefined),
        ring: () => undefined,
        onPick: pickMark,
      });
      syncNone();
      // Last, once both halves of the group have drawn: the × is written here and the swatches in `renderMarkBar`, so
      // which one ends up tabbable would otherwise depend on which ran last. See `setAllTabStops`.
      setAllTabStops(markRow);
    };
    renderMarks();

    // Outside the scroller, so Cancel and Save are always where the reader left them — the same footer shape
    // Save as PDF and Export to vault use.
    const btnRow = actionRow(popup, { placement: 'footer' });

    // No Delete here — deletion (with its confirmation) lives on the read-only note view, which is
    // the only way into this editor for an existing note.

    /**
     * **The shared buttons, not hand-rolled ones.** Inline styles — a radius, a hardcoded disabled gray,
     * properties rewritten on every keystroke to toggle one boolean — would make these the only square buttons
     * among a plugin of pill-shaped ones. Obsidian styles a `<button>` and its `mod-cta` itself, differently on a
     * phone than on a desktop, which is exactly what an inline radius overrides. Disabled is a property rather
     * than a look.
     */
    actionButton(btnRow, { label: t('action.cancel'), onClick: () => close() });
    const saveBtn = actionButton(btnRow, {
      label: t('action.save'),
      cta: true,
      onClick: () => {
        const text = textarea.value.trim();
        if (text) {
          this.saveNote({
            cfiRange: opts.cfiRange,
            text,
            selectedText: opts.selectedText,
            // A picked mark, else the bare color it opened with (or nothing).
            choice: selected ?? selectedColor ?? undefined,
            existingNote: opts.existingNote,
          });
        }
        close();
      },
    });
    // Save needs something to save. A property, so the theme decides how a disabled CTA looks.
    const syncSaveEnabled = () => {
      saveBtn.disabled = !textarea.value.trim();
    };
    syncSaveEnabled();
    textarea.addEventListener('input', syncSaveEnabled);

    window.setTimeout(() => textarea.focus({ preventScroll: true }), 50);
  }

  private saveNote(opts: {
    cfiRange: string;
    text: string;
    selectedText?: string;
    /** The mark (or bare color) chosen in the editor; absent means no highlight at all. */
    choice?: MarkChoice;
    existingNote?: Note;
  }): void {
    const { cfiRange, text, selectedText, choice, existingNote } = opts;
    const appearance = choice === undefined ? undefined : this.appearanceOf(choice);
    const color = appearance?.color;
    // Use 'transparent' as the annotation color for no-color notes so draw-annotation
    // still fires, which lets addNoteIconToColumn position the margin icon.
    const annotColor = color ?? 'transparent';
    if (existingNote) {
      // Re-add unconditionally rather than only when the wash color changed: switching between two
      // line-only marks leaves 'transparent' on both sides, and comparing the washes would read that as
      // "nothing to redraw". `addAnnotation` removes the existing key before re-emitting draw-annotation, so a
      // re-add IS the redraw and costs nothing when the appearance is in fact unchanged.
      void this.ctx.foliateView?.deleteAnnotation({ value: cfiRange });
      void this.ctx.foliateView?.addAnnotation({ value: cfiRange, color: annotColor });
      // Mark, color and treatment move together, and all three clear when the note goes to no highlight.
      this.notes = this.notes.map((n) =>
        n.id === existingNote.id
          ? { ...n, text, color, markId: appearance?.markId, treatment: appearance?.treatment }
          : n
      );
      this.ctx.debug(`note update — id:${existingNote.id.slice(0, 8)} textLen:${text.length}`, 'annot');
      this.noteIcons.refresh();
    } else {
      const conflictHL = this.highlights.find((h) => h.cfiRange === cfiRange);
      if (conflictHL) {
        void this.ctx.foliateView?.deleteAnnotation({ value: cfiRange });
        this.highlights = this.highlights.filter((h) => h.cfiRange !== cfiRange);
        // The highlight really is deleted — a note record at the same range replaces it — so its record goes with
        // it rather than lingering as a passage selection for something the book no longer holds.
        this.persistHighlights([conflictHL.id]);
      }
      // The heading the passage is under, not the last heading on the page — see `toc-entry.ts`.
      const entry = this.ctx.tocEntryAt(cfiRange);
      const chapter = entry?.label || undefined;
      const chapterHref = entry?.href || undefined;
      // Where the passage begins, by the index; none before it is up, until the book next opens with it.
      const loc = this.ctx.getLocForCfi(cfiRange) ?? undefined;
      const note: Note = {
        id: crypto.randomUUID(),
        cfiRange,
        text,
        selectedText,
        color,
        markId: appearance?.markId,
        treatment: appearance?.treatment,
        createdAt: Date.now(),
        chapter,
        chapterHref,
        loc,
      };
      this.notes.push(note);
      void this.ctx.foliateView?.addAnnotation({ value: cfiRange, color: annotColor });
      this.ctx.debug(
        `note create — cfi:${cfiRange.slice(0, 40)} section:${this.ctx.currentSectionIndex} textLen:${text.length}`,
        'annot'
      );
    }
    this.persistNotes();
    this.host.refreshSavedPanelIfOpen();
  }

  /** Bulk-remove highlights + notes by id (annotation-data cleanup). No overlay deletion needed:
   *  the flagged entries are either malformed (never rendered) or duplicates that share the kept
   *  one's overlay. Saves the changed arrays and refreshes the UI. Returns the removed counts. */
  removeAnnotationsByIds(ids: Set<string>): { highlights: number; notes: number } {
    const hRemoved = this.highlights.filter((h) => ids.has(h.id));
    const nRemoved = this.notes.filter((n) => ids.has(n.id));
    if (hRemoved.length) {
      this.highlights = this.highlights.filter((h) => !ids.has(h.id));
      this.persistHighlights(hRemoved.map((h) => h.id));
    }
    if (nRemoved.length) {
      for (const n of nRemoved) this.noteIcons.forget(n.cfiRange);
      this.notes = this.notes.filter((n) => !ids.has(n.id));
      this.persistNotes(nRemoved.map((n) => n.id));
    }
    this.noteIcons.refresh();
    this.host.refreshSavedPanelIfOpen();
    return { highlights: hRemoved.length, notes: nRemoved.length };
  }

  deleteNote(id: string): void {
    const note = this.notes.find((n) => n.id === id);
    if (note) {
      void this.ctx.foliateView?.deleteAnnotation({ value: note.cfiRange });
      this.noteIcons.forget(note.cfiRange);
    }
    this.notes = this.notes.filter((n) => n.id !== id);
    this.persistNotes([id]);
    this.ctx.debug(`note delete — id:${id.slice(0, 8)}`, 'annot');
    this.noteIcons.refresh();
    this.host.refreshSavedPanelIfOpen();
  }

  // ── Foliate overlay-event dispatch (called from the view's handlers) ─────────

  /**
   * draw-annotation: if `d` is one of our notes, draw its highlight (only when it
   * has a real color) and store the live Range for margin-icon positioning.
   * Returns true when handled, so the view skips the default highlight draw.
   */
  tryDrawNote(d: DrawDetail): boolean {
    const note = this.notes.find((n) => n.cfiRange === d.annotation.value);
    if (!note) return false;
    // No 'transparent' guard here. "No wash" is not "draw nothing" when a mark can be a LINE with no wash: a
    // note marked with, say, a purple double-underline stores 'transparent' in its wash slot and would be
    // skipped entirely. Deciding whether there is anything to draw belongs to the appearance, and
    // drawWithMark already no-ops on an empty one — which still leaves an unmarked note reaching the overlay
    // so its margin icon can be positioned.
    this.drawWithMark(d, note, d.annotation.color ?? 'transparent');
    if (d.range) this.noteIcons.track(d.annotation.value, d.range);
    return true;
  }

  /** draw-annotation fallback: draw a saved highlight, with its preset mark's treatment if it has one. */
  drawDefaultHighlight(d: DrawDetail): void {
    const h = this.highlights.find((hl) => hl.cfiRange === d.annotation?.value);
    this.drawWithMark(d, h, d.annotation?.color ?? HIGHLIGHT_COLORS[0]);
  }

  /** show-annotation: user clicked/tapped a highlight or note — open editor / edit picker. */
  handleShowAnnotation(value: string, range: Range): void {
    this.ctx.debug(`show-annotation value:${value.slice(0, 30)} hasRange:${!!range}`, 'annot');
    if (!range) return;
    // A live text selection means the user is acting on the selection, not tapping the annotation
    // — let the selection path handle it, so a drag over a highlight doesn't pop the edit UI.
    const sel = range.startContainer.ownerDocument?.defaultView?.getSelection();
    if (sel && !sel.isCollapsed && sel.rangeCount > 0 && sel.toString().trim()) return;
    const note = this.notes.find((n) => n.cfiRange === value);
    if (note) {
      this.openNoteView(note);
      return;
    }
    const h = this.highlights.find((hl) => hl.cfiRange === value);
    if (!h) return;
    const doc = range.startContainer.ownerDocument;
    const api = doc ? this.pickerMap.get(doc) : null;
    if (!api) return;
    // The mark's color when one resolves, not the stored hex: after a mark is recolored those differ, and
    // the bar has to show the chip matching what is actually drawn on the page.
    const mark = resolveMark(this.bookPreset, h);
    api.showEdit(value, range.getBoundingClientRect(), principalColor(mark) ?? h.color, mark?.id);
  }

  /**
   * create-overlay: section overlayer just created — clear stale icons then re-apply
   * all saved highlights and notes. addAnnotation silently skips CFIs that don't
   * belong to this section's index. No-color notes use 'transparent' so
   * draw-annotation still fires and we can store the live Range for positioning.
   */
  reapplyAnnotations(view: FoliateViewEl): void {
    this.ctx.debug(`create-overlay hl:${this.highlights.length} notes:${this.notes.length}`, 'annot');
    // Clear icons immediately; draw-annotation will re-add them as sections load.
    this.noteIcons.reset();
    for (const h of this.highlights) {
      void view.addAnnotation({ value: h.cfiRange, color: h.color });
    }
    for (const n of this.notes) {
      void view.addAnnotation({ value: n.cfiRange, color: n.color ?? 'transparent' });
    }
  }

  /**
   * The only two places annotations are written, so the only two that have to tell records about it.
   *
   * One pair rather than scattered `saveHighlights(...).catch(...)` calls with identical error handling, which is
   * what makes live record export a single hook rather than many call sites that each have to remember one.
   */
  private persistHighlights(deleted?: readonly string[]): void {
    const file = this.ctx.currentFile;
    if (!file) return;
    saveHighlights(this.ctx.app, file, this.highlights).catch((e) =>
      this.ctx.debug(`saveHighlights error: ${e}`, 'annot')
    );
    this.ctx.recordsChanged(deleted, 'passages');
  }

  private persistNotes(deleted?: readonly string[]): void {
    const file = this.ctx.currentFile;
    if (!file) return;
    saveNotes(this.ctx.app, file, this.notes).catch((e) => this.ctx.debug(`saveNotes error: ${e}`, 'annot'));
    this.ctx.recordsChanged(deleted, 'notes');
  }

  // ── Location recalculation ──────────────────────────────────────────────────

  /** Give each passage and note `getLoc` of where it begins; write and count only those whose location changed
   *  (`restampLocs`). */
  remapLocs(getLoc: (cfi: string) => number | undefined): number {
    let highlights = 0;
    let notes = 0;
    this.highlights = this.highlights.map((h) => {
      const loc = getLoc(h.cfiRange);
      if (loc === h.loc) return h;
      highlights++;
      return { ...h, loc };
    });
    this.notes = this.notes.map((n) => {
      const loc = getLoc(n.cfiRange);
      if (loc === n.loc) return n;
      notes++;
      return { ...n, loc };
    });
    if (this.ctx.currentFile) {
      if (highlights) this.persistHighlights();
      if (notes) this.persistNotes();
    }
    return highlights + notes;
  }

  /** Reset all per-book state and DOM handles on book close / leaf teardown. */
  dispose(): void {
    this.notePopupCleanup?.();
    this.notePopupCleanup = null;
    this.notePopupEl = null;
    this.noteViewCleanup?.();
    this.noteViewCleanup = null;
    this.noteIcons.dispose();
    this.pickerMap = new Map();
    this.pickerEl?.remove();
    this.pickerEl = undefined;
    this.highlights = [];
    this.notes = [];
    this.bookPreset = null;
  }
}
