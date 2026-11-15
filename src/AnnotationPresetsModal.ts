// The annotation-preset manager: authoring presets and the marks inside them.
// See docs/design/annotation-presets.md.
//
// A dialog rather than an inline settings list, for the same reasons PronunciationsModal is one — the
// list grows without bound and would dominate its tab, and each row needs real affordances (color,
// treatment, badge, active, reorder, delete) that a narrow settings pane cannot hold. Plus one the
// glossary does not have: a reader must be able to adjust the preset for the book they have open, and
// a dialog can be opened from the reader while a settings section cannot.
//
// Every mark row previews itself with CSS rather than the real foliate Overlayer, which draws SVG
// inside the book iframe and is unavailable here. CSS covers all six treatments closely enough —
// background-color, border-bottom, `border-bottom: double`, `text-decoration: underline wavy`,
// line-through, and a bordered box — so the preview is a faithful approximation, not the same code
// path. It replaces the color swatch entirely: a swatch cannot show a treatment.

import { type App, Notice, setIcon } from 'obsidian';
import {
  type AnnotationMark,
  type AnnotationPreset,
  activePresets,
  audioMark,
  BADGE_MAX,
  type BookMark,
  type BookPreset,
  badgeOf,
  blockedPresetMarks,
  colorEntry,
  defaultBadge,
  defaultMarks,
  detachBookPreset,
  duplicatePreset,
  firstFreeAppearance,
  generateMarkId,
  generatePresetId,
  HIGHLIGHT_COLORS,
  INK,
  isBuiltinPreset,
  isInk,
  isMarkAppearanceFree,
  isMarkNameFree,
  MARK_PALETTE,
  type MarkAppearance,
  marksAnything,
  marksFreedByDeleting,
  moveMark,
  normalizeColor,
  noteMark,
  presetSwitchClashes,
  presetSwitchNameTwins,
  promoteBookToPreset,
  type RemapChoice,
  TREATMENTS,
  type Treatment,
} from './annotation-presets';
import { byName } from './by-name';
import { confirmThen } from './ConfirmModal';
import { actionButton, actionRow, choiceGroup } from './controls';
import { t } from './i18n';
import type { TranslationKey } from './i18n/en';
import { OrbisModal, openOrbisDialog } from './OrbisModal';
import { dimColor, themeColors } from './reader-themes';
import { type IOrbisReaderPlugin, readCurrentDisplaySettings } from './settings';
import { syncEnabled } from './sync/enabled';
import { annotationsSvg } from './system-glyphs';
import {
  applyMarkPreview,
  createCollapsibleNote,
  DRAG_HANDLE_ICON,
  pinModalAboveKeyboard,
  rebuildKeepingFocus,
  renderTabRow,
  wireListDrag,
} from './ui-utils';

/** The appearance in words, for the row's sub-line: "Highlighter", "Underline", or both. */
function appearanceLabel(m: MarkAppearance): string {
  const parts: string[] = [];
  if (m.highlightColor) parts.push(t('presets.treatment_fill'));
  if (m.treatment) parts.push(t(TREATMENT_KEYS[m.treatment]));
  return parts.join(' + ');
}

/** A new line starts on ink — it follows the page's text color, so it is legible on every theme rather
 *  than only on the one it was chosen under. */
// A new line starts on ink, not on a hex. Black is the better ink on a light page, but it is the reader's
// *device* that decides whether the page is light — and the mark is stored with the book. A default that
// adapts is right more often than one that is right only where it was set.
const NEW_LINE_COLOR = INK;

const TREATMENT_KEYS: Record<Treatment, TranslationKey> = {
  underline: 'presets.treatment_underline',
  'double-underline': 'presets.treatment_double_underline',
  squiggle: 'presets.treatment_squiggle',
  strikethrough: 'presets.treatment_strikethrough',
  box: 'presets.treatment_box',
};

/** The colors and font a mark will actually be seen against. */
interface ReadingSurface {
  bg: string;
  fg: string;
  font: string;
}

/**
 * The live reading surface, so a preview shows the mark where it will actually appear.
 *
 * This matters more than polish: a pale wash that reads fine on Obsidian's dark modal can be invisible
 * on the sepia page, and a preview drawn on chrome colors cannot tell you that. It delivers most of the
 * contrast validation a reader needs — by eye rather than by algorithm.
 *
 * Reuses the reader's own resolvers rather than reimplementing them. Two honest approximations: the
 * reader applies brightness as a filter over the whole iframe, so a dimmed background COLOR is close but
 * not the identical pixel; and font SIZE is left alone, since the book's size would make list rows lurch.
 */
function readingSurface(plugin: IOrbisReaderPlugin): ReadingSurface {
  const ds = readCurrentDisplaySettings(plugin.app);
  const { bg, fg } = themeColors(ds.theme, plugin.settings, plugin.app.workspace.containerEl);
  return {
    bg: dimColor(bg, ds.brightness),
    fg,
    // 'default' means "use the book's own fonts", which are unknowable here — a neutral serif stands in.
    font:
      ds.fontFamily === 'default'
        ? 'Georgia, serif'
        : ds.fontFamily === 'obsidian'
          ? 'var(--font-text)'
          : ds.fontFamily,
  };
}

/** A mark rendered on the reading surface. The surface carries the page's colors and font; the inner
 *  span carries the appearance, so a wash composites over the real background rather than over chrome. */
function renderPreview(host: HTMLElement, m: MarkAppearance, surface: ReadingSurface, text: string): HTMLElement {
  const cell = host.createSpan({ cls: 'orbis-mark-surface' });
  cell.style.setProperty('background-color', surface.bg);
  cell.style.setProperty('color', surface.fg);
  cell.style.setProperty('font-family', surface.font);
  applyMarkPreview(cell.createSpan({ text }), m);
  return cell;
}

/**
 * Change one channel of a mark's appearance, re-deriving its badge only if the user never chose one.
 *
 * Recoloring must not silently discard a typed badge, and must not freeze a derived one — hence the
 * comparison against the OLD derived value before anything changes.
 */
function applyAppearance(m: AnnotationMark, next: MarkAppearance): void {
  const wasDerived = !m.badge || m.badge === defaultBadge(m);
  m.highlightColor = next.highlightColor;
  m.treatment = next.treatment;
  m.treatmentColor = next.treatmentColor;
  if (wasDerived) delete m.badge;
}

/**
 * The curated palette plus an exact-color escape hatch.
 *
 * Rendered INLINE into `host`, never as a createOrbisPopup: that attaches to activeDocument.body, which
 * lands outside an Obsidian Modal's DOM where focus containment makes the hex field untypeable — the
 * same trap the glossary editor avoids (see the note atop reader/tts/pronunciation-editor.ts).
 * Shared by the desktop inline panel and the touch per-mark editor so the clash rule exists once.
 */
function renderPalette(
  host: HTMLElement,
  opts: {
    /** The color currently selected in THIS channel, for the ring and the hex field. */
    current: string;
    /** The appearance the pick would produce, for the clash check — the caller knows which channel. */
    would: (hex: string) => MarkAppearance;
    marks: readonly AnnotationMark[];
    markId: string;
    /** Grayed and inert — the color is not this control's to choose (ink is on, or the mark is the
     *  preset's). Still rendered, so what it would offer stays visible. */
    disabled?: boolean;
  },
  onPicked: (hex: string) => void
): void {
  const { current, marks, markId, disabled = false } = opts;
  if (disabled) host.addClass('is-disabled');
  const pick = (hex: string): void => {
    if (!isMarkAppearanceFree(marks, opts.would(hex), markId)) {
      new Notice(t('presets.clash'));
      return;
    }
    onPicked(hex);
  };

  const grid = host.createDiv({ cls: 'orbis-palette-grid' });
  for (const c of MARK_PALETTE) {
    const sw = grid.createEl('button', { cls: 'orbis-palette-swatch' });
    const name = t(c.nameKey as TranslationKey);
    /**
     * **A color another mark already uses is offered as unavailable, not refused after the fact.**
     *
     * Marks are unique by (color, treatment), so this palette always contains choices that cannot be made — and
     * refusing one after a click means a notice, which on a desktop appears in the far corner of the screen, nowhere
     * near the swatch and nowhere near where the reader is looking. Struck through and disabled says the same thing in
     * the place the decision is being made, and takes the swatch out of the tab order while it is at it.
     *
     * The mark being edited is excluded from the check (`markId`), so its own current color is never struck out
     * from under it.
     */
    const taken = !isMarkAppearanceFree(marks, opts.would(c.hex), markId);
    // The emoji belongs to the label rather than to a `title` beside it: two of them draw two tooltips, one
    // Obsidian's and one the browser's. A screen reader reading "yellow circle" after "Yellow" is a small cost
    // against losing which emoji this color writes into a note.
    sw.setAttribute('aria-label', taken ? t('presets.taken_label', { name }) : `${name} ${c.emoji}`);
    if (normalizeColor(c.hex) === normalizeColor(current)) sw.addClass('is-current');
    if (taken) sw.addClass('is-taken');
    sw.style.setProperty('--orbis-mark-color', c.hex);
    sw.disabled = disabled || taken;
    sw.addEventListener('click', () => pick(c.hex));
  }

  // A custom color has no palette entry, so without this it would show no selection ring anywhere —
  // the same "where am I?" problem from the other side. Appended, not inserted, so palette positions
  // never shift under the user.
  if (!MARK_PALETTE.some((c) => normalizeColor(c.hex) === normalizeColor(current))) {
    const own = grid.createEl('button', { cls: 'orbis-palette-swatch is-current' });
    // No `title` beside it — the label already says the hex, and two of them draw two tooltips.
    own.setAttribute('aria-label', t('presets.custom_current', { hex: current }));
    own.style.setProperty('--orbis-mark-color', current);
  }

  // The palette is the easy button, not a cage.
  const custom = host.createDiv({ cls: 'orbis-palette-custom' });
  // Names the color it HAS rather than the control's purpose — "Custom" beside a green swatch would be
  // simply wrong, and is only true when the color is not in the palette.
  // Named from every KNOWN entry, not just the displayed ones: black has no swatch but a mark on it should
  // read "Black" rather than "Custom".
  const entry = colorEntry(current);
  custom.createSpan({
    cls: 'orbis-palette-name',
    text: entry ? t(entry.nameKey as TranslationKey) : t('presets.custom_color'),
  });
  const hex = custom.createEl('input', { type: 'text', cls: 'orbis-palette-hex' });
  hex.value = current;
  hex.disabled = disabled;
  hex.placeholder = t('presets.hex_placeholder');
  hex.setAttribute('aria-label', t('presets.custom_hex'));
  hex.addEventListener('change', () => {
    const v = hex.value.trim();
    if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) {
      new Notice(t('presets.bad_hex'));
      hex.value = current;
      return;
    }
    pick(v);
  });

  // A hidden input[type=color] does the work; the visible control is a button. A visible color input
  // always renders its current value, which makes it look like a declaration of "Custom" rather
  // than an invitation to pick.
  const native = custom.createEl('input', { type: 'color', cls: 'orbis-palette-native' });
  native.value = current;
  native.tabIndex = -1;
  native.setAttribute('aria-hidden', 'true');
  native.addEventListener('change', () => pick(native.value));
  // An eyedropper rather than the word "Pick…": it reads as "choose a color" at a glance and costs a
  // fraction of the width, which lets the whole row fit one line on a phone.
  const pickBtn = custom.createEl('button', { cls: 'orbis-ctrl-btn orbis-palette-pick' });
  setIcon(pickBtn, 'pipette');
  pickBtn.disabled = disabled;
  pickBtn.setAttribute('aria-label', t('presets.pick'));
  pickBtn.addEventListener('click', () => native.click());
}

/**
 * What a marks list is editing: the shared **preset**, or the open **book's own copy** of one.
 *
 * The two are genuinely different objects with different consequences — a preset is shared by every book
 * that copies it, a book's marks affect only that book — but the list, the row, the reorder and the mark
 * editor are identical for both. This is the seam: one abstraction, so neither scope grows its own
 * near-duplicate UI, and so the rule about which one a save touches lives in exactly one place per scope.
 *
 * `marks` is a GETTER, resolved fresh on every access, never a captured array. Obsidian replaces the whole
 * settings object on an external reload (`onExternalSettingsChange`, which fires when something else
 * writes `data.json`), and a reference held across an `await` then points at an orphan — mutating it
 * appears to work and vanishes at the next save, with no error anywhere.
 */
interface MarkTarget {
  /** `BookMark`, not `AnnotationMark`: the book scope carries per-mark provenance, and the preset scope
   *  simply never sets it. One type keeps the row and the editor identical for both. */
  readonly marks: BookMark[];
  setMarks(next: BookMark[]): void;
  /** Which mark holds each role, and how to move one. A pointer per role rather than a flag per mark, so
   *  "exactly one holder" is structural instead of an invariant to police. Undefined clears the role. */
  readonly roles: { noteMarkId?: string; audioMarkId?: string };
  setRole(role: MarkRole, markId: string | undefined): void;
  /** Persist and re-render. `changedMarkId` names the mark whose DEFINITION was edited — the book scope
   *  uses it to make that one mark the reader's own. Structural changes (reorder, roles, visibility) pass
   *  nothing, because they are usage rather than definition and must not detach a mark from its preset. */
  commit(changedMarkId?: string): Promise<void>;
  /** The built-in preset. Rows still show everything — the point is to see what it offers — but nothing
   *  can be changed, and the escape hatches (Duplicate, or the This book scope) are elsewhere. */
  readonly readOnly?: boolean;
  /** Book scope only: a tracked mark cannot be edited here until it is copied into the book, visibility is
   *  the book's to set, and only marks the book owns can be deleted. Absent in the preset scope, where
   *  every mark is the preset's own. */
  readonly book?: {
    isHidden(markId: string): boolean;
    setHidden(markId: string, hidden: boolean): Promise<void>;
    copyIn(markId: string): Promise<string | undefined>;
    /** The book's own copy, so the list can ask which marks are holding an appearance the preset wants. */
    readonly preset: BookPreset | null;
  };
}

type EditScope = 'preset' | 'book';

/** The two jobs a mark can be given for a book: what a new note gets, and what the listening Highlight
 *  button applies. */
type MarkRole = 'note' | 'audio';

/** Lucide glyph per role — the same two the player already uses for those buttons, so the indicator on a
 *  mark row and the button it governs look like each other. */
const ROLE_ICONS: Record<MarkRole, string> = { note: 'pencil', audio: 'headphones' };
const ROLE_LABELS: Record<MarkRole, TranslationKey> = {
  note: 'presets.role_note',
  audio: 'presets.role_audio',
};
const ROLE_HINTS: Record<MarkRole, TranslationKey> = {
  note: 'presets.role_note_hint',
  audio: 'presets.role_audio_hint',
};

class AnnotationPresetsModal extends OrbisModal {
  private selectedId: string | null = null;
  /** Which of the two things this dialog edits — see MarkTarget. Not `scope`: Modal already has one
   *  (a keymap Scope), and shadowing it would break the dialog's key handling. */
  private editScope: EditScope;
  /**
   * Whether this dialog has a book to talk about at all.
   *
   * Opened from Settings or the plugin-wide command there is no book in view — the "this book" target is a
   * guess at whichever reader leaf happens to be active, or nothing. So the whole book half is absent
   * rather than empty: no scope tabs, no "This book" row. Settings is about the shared library, and a tab
   * that offers a scope which does not exist from where you opened it is worse than one fewer tab.
   *
   * Opened from the reader or the player (scope `'book'`) both halves are there, book first.
   */
  private readonly bookScopeOffered: boolean;
  /** Guards against a second mark editor — see the row's click handler. */
  private editorOpen = false;
  /** Index being dragged, or null. Kept on the instance because dragover fires on the *target* row. */
  /** Shared with every row of the mark list — the index a drag started from. */
  private readonly drag: { from: number | null } = { from: null };

  /** Releases the pinned reader — see `pinPresetTarget`. Set on open, called on close. */
  private releaseTarget: (() => void) | null = null;

  constructor(
    private readonly plugin: IOrbisReaderPlugin,
    scope: EditScope = 'preset',
    /** Run once this dialog closes — for the one opened FROM another dialog, which should come back to it. */
    private readonly onClosed?: () => void
  ) {
    // The same glyph the launchers use, in the title. Repeating it is what makes the icon learnable: the
    // thing you tapped and the thing that opened wear the same mark.
    // Its height changes as you use it — two tabs whose lists differ in length, marks added and removed — and
    // centered, that would move the tab row out from under the pointer that had just clicked it. Every Orbis
    // dialog is pinned; see `OrbisModal`.
    super(plugin.app, { icon: annotationsSvg(16) });
    this.editScope = scope;
    this.bookScopeOffered = scope === 'book';
  }

  /**
   * **One title, wherever it was opened from.**
   *
   * What the dialog contains differs: from the reader it holds both halves — the book's marks and the shared
   * library — so "Annotation presets" would be wrong about the tab it opens on; from Settings there is no book, so
   * "Annotations" would claim more than is there.
   *
   * "Marks" fits both. A preset is a set of marks and the book scope is the marks this book uses, so it names the
   * contents without naming a tab — and it gives "Annotations" back to the settings category, where it means
   * everything a reader adds to a book.
   *
   * `bookScopeOffered` still governs whether the book scope is SHOWN. The dialog should not describe something
   * that is not in it; it just does not have to be called two things to say so.
   */
  protected dialogTitle(): string {
    return t('presets.modal_title');
  }

  protected renderDialog(): void {
    /**
     * Pin the reader this dialog is about, once, before anything reads it.
     *
     * Everything book-scoped here — the status line, Change preset, hiding a mark, copying one into the book —
     * resolves its target through the plugin, which asks the workspace what is active. This dialog IS what is
     * active, so that question has no right answer once the dialog is open. See `pinPresetTarget`.
     */
    this.releaseTarget ??= this.plugin.pinPresetTarget();
    this.modalEl.addClass('orbis-presets-modal');
    this.render();
    // Deliberately NOT pinned above the keyboard. This list holds no text inputs, so it can never raise
    // one — and pinning costs both dimensions: the helper sets `position: fixed` with a `top` but no
    // `left` (losing Obsidian's centring) and caps the height at ~58% of the screen. That reservation is
    // the editor's to pay, not the list's. It is the whole reason the list is read-only.
  }

  /** Let go of the pinned reader, so the plugin resolves normally again for whatever opens next. */
  protected onDialogClose(): void {
    this.releaseTarget?.();
    this.releaseTarget = null;
    // Any mark bar showing behind this dialog was drawn from the marks as they were when it opened. Redrawn before
    // `onClosed`, which may reopen the mark list, and that list is anchored to the bar.
    this.plugin.repaintMarkBars();
    this.onClosed?.();
  }

  /** The whole library, inactive included — for anything that WRITES (push, splice, isDefault). */
  private get presets(): AnnotationPreset[] {
    return this.plugin.settings.annotationPresets;
  }

  /**
   * The library as this dialog offers it for ASSIGNMENT — inactive presets filtered out.
   *
   * Assignment is all the flag governs. Nothing that resolves, merges or renders reads this, and neither
   * does the selector above, which chooses what to edit.
   */
  private get offered(): AnnotationPreset[] {
    return activePresets(this.presets);
  }

  /** Persist a preset-level change (a name, the list of presets) with no revision bump — reordering the
   *  library or renaming a preset changes nothing a book copied. */
  private async commit(): Promise<void> {
    await this.plugin.saveSettings();
    this.render();
  }

  /**
   * The shared library as an edit target.
   *
   * Re-resolves the preset by id on every access and every save, so an external settings reload can never
   * turn an edit into a silent no-op (see MarkTarget). Editing a mark also MERGES the change into the open
   * book when that book tracks this preset — the reader's own book updating as you tune a mark is the whole
   * point, and per-mark provenance means the merge cannot reach anything they have made their own.
   */
  private presetTarget(id: string, readOnly = false): MarkTarget {
    const find = (): AnnotationPreset | undefined => this.presets.find((p) => p.id === id);
    return {
      readOnly,
      get marks(): BookMark[] {
        return find()?.marks ?? [];
      },
      setMarks: (next) => {
        const p = find();
        if (p) p.marks = next;
      },
      get roles() {
        const p = find();
        return { noteMarkId: p?.noteMarkId, audioMarkId: p?.audioMarkId };
      },
      setRole: (role, markId) => {
        const p = find();
        if (!p) return;
        if (role === 'note') p.noteMarkId = markId;
        else p.audioMarkId = markId;
      },
      commit: async () => {
        const p = find();
        if (!p) {
          new Notice(t('presets.gone'));
          this.render();
          return;
        }
        p.revision += 1;
        await this.plugin.saveSettings();
        // Always merge, never re-copy. A re-copy replaces the book's whole copy and would destroy a customized
        // book's edits; the merge updates tracked marks in place and cannot touch a local one, so there is
        // nothing to guard against.
        const book = this.plugin.activeBookForPresets();
        if (book?.preset && book.preset.id === p.id) await this.plugin.mergeActivePreset(p);
        this.render();
      },
    };
  }

  /**
   * The open book's own copy as an edit target.
   *
   * `working` is already a detached clone, so there is no orphan hazard here. A save makes the EDITED mark
   * the book's own and leaves `revision` where it is: that number records which template revision this copy
   * was taken at, and moving it would put "the template moved" and "the reader edited this" back into one
   * counter, where a single edit on each side cancels out and neither is detectable.
   */
  private bookTarget(working: BookPreset): MarkTarget {
    return {
      book: {
        preset: working,
        isHidden: (id) => (working.hiddenMarkIds ?? []).includes(id),
        setHidden: async (id, hidden) => {
          await this.plugin.setBookMarkHidden(id, hidden);
          this.render();
        },
        copyIn: async (id) => {
          const created = await this.plugin.copyMarkIntoBook(id);
          this.render();
          return created;
        },
      },
      get marks(): BookMark[] {
        return working.marks;
      },
      setMarks: (next) => {
        working.marks = next;
      },
      get roles() {
        return { noteMarkId: working.noteMarkId, audioMarkId: working.audioMarkId };
      },
      setRole: (role, markId) => {
        if (role === 'note') working.noteMarkId = markId;
        else working.audioMarkId = markId;
      },
      commit: async (changedMarkId) => {
        // Only the edited mark detaches, and `revision` does NOT move: it records the template revision
        // this copy was taken at, so that "the template moved" and "the reader edited this" stay separate
        // facts. Bumping it here would make them collide in one counter.
        if (changedMarkId) {
          working.marks = working.marks.map((m) => (m.id === changedMarkId ? { ...m, local: true as const } : m));
        }
        await this.plugin.saveActiveBookPreset(working);
        this.render();
      },
    };
  }

  /** As in the mark editor: the list redraws on every change, and the keyboard has to survive it. */
  private render(): void {
    rebuildKeepingFocus(this.contentEl, () => this.build());
  }

  private build(): void {
    const body = this.contentEl;
    // Scroll is preserved here; focus is `rebuildKeepingFocus`'s — see there for why a dialog must not blur
    // whatever it finds focused.
    const top = body.scrollTop;
    body.empty();

    const book = this.bookScopeOffered ? this.plugin.activeBookForPresets() : null;
    if (this.bookScopeOffered) this.renderScopeToggle(body);

    if (this.editScope === 'book') {
      this.renderBookScope(body, book);
      body.scrollTop = top;
      return;
    }

    // No explanatory note here. What a mark and a preset ARE, how they travel between devices, and why deleting
    // one is not how you tidy up are all documentation rather than dialog: several paragraphs read once, sitting
    // permanently above the thing they describe. They live in the user guide — see
    // `docs/guide/highlights-notes-bookmarks.md`.

    // ALL of them, inactive included. This selector chooses what to EDIT, and a preset you cannot select is
    // one you cannot reactivate. The flag governs the lists that ASSIGN — see `offered`.
    const presets = this.presets;
    if (!this.selectedId || !presets.find((p) => p.id === this.selectedId)) {
      // The open book's preset first: with a book on screen, that is what the reader came here to look at.
      // From Settings `book` is null by construction, so this falls straight to the library default —
      // which is the right answer there, since no book is in view to be about.
      const ofBook = book?.preset && presets.find((p) => p.id === book.preset?.id)?.id;
      this.selectedId = ofBook || presets.find((p) => p.isDefault)?.id || presets[0]?.id || null;
    }
    const active = presets.find((p) => p.id === this.selectedId);

    this.renderPresetRow(body, presets, active);
    /**
     * **No "This book" row here.** It would restate a whole tab that does the job properly — and do it worse: the tab
     * shows the book's marks and can act on them, where a row here would be a status line and nothing more, and the
     * only reason for this tab to resolve the open book at all (see `pinPresetTarget`). One place answers "what does
     * this book use", and it is the tab named after the question.
     */
    if (active) {
      /**
       * The read-only note, with the list it is about rather than beside an unrelated badge.
       *
       * Named and actionable: it names the preset, because "the built-in preset" is a phrase for a thing the
       * reader sees called something else, and it says what to do — duplicating is the way past the lock.
       */
      if (isBuiltinPreset(active)) {
        body.createDiv({ cls: 'orbis-preset-locked-note', text: t('presets.builtin_locked', { name: active.name }) });
      }
      this.renderMarks(body, this.presetTarget(active.id, isBuiltinPreset(active)));
    }

    body.scrollTop = top;
  }

  /**
   * Preset | This book. Only from the reader — see `bookScopeOffered`.
   *
   * Two tabs rather than a mode dropdown or two dialogs: the reader needs to move between "what does this
   * book use" and "what does the shared preset say" constantly, and with settings unsynced between devices
   * those two answers routinely differ. Showing only the preset while the page renders from the book's copy
   * would let a book draw underlines while the list says Highlighter, with nothing on screen to explain it.
   */
  private renderScopeToggle(body: HTMLElement): void {
    // Book first: the reader thinks in terms of the book in front of them, and with per-mark tracking that
    // tab is the workspace rather than a status page.
    renderTabRow(
      body,
      [
        { id: 'book', label: t('presets.scope_book') },
        { id: 'preset', label: t('presets.scope_preset') },
      ],
      this.editScope,
      (scope) => {
        this.editScope = scope;
        this.render();
      }
    );
  }

  /**
   * The book's own marks, plus the actions that reconcile them with the preset they came from.
   *
   * Both directions are offered, because with `data.json` unsynced either side can legitimately be the
   * newer one: **Reset to preset** takes the library's version, **Update the preset** pushes the book's
   * into the library, and **Save as new preset** keeps the book's as something separate rather than making
   * anyone choose a loser. Which buttons appear is driven by the revisions, so the dialog never offers a
   * reconciliation that would be a no-op.
   */
  private renderBookScope(body: HTMLElement, book: { name: string; preset: BookPreset | null } | null): void {
    if (!book) {
      body.createDiv({ cls: 'orbis-lookup-status', text: t('presets.no_book_open') });
      return;
    }
    // No book title here. Truncated to about six words, it would tell the reader nothing they do not know —
    // they are reading the book, and the tab above says "This book". The line below is a sentence instead.
    const header = body.createDiv({ cls: 'orbis-preset-row orbis-preset-book-row' });
    const bp = book.preset;
    if (!bp) {
      header.createSpan({ cls: 'orbis-preset-book-state', text: t('presets.book_no_marks') });
      // Acting here rather than sending the reader to the other tab. There is nothing in the file to edit
      // until a preset is copied in, so the empty state's job is to make that one click, not to explain
      // where the click lives.
      const def = this.presets.find((p) => p.isDefault) ?? this.presets[0];
      if (def) {
        const row = body.createDiv({ cls: 'orbis-preset-row' });
        row
          .createEl('button', { cls: 'mod-cta', text: t('presets.book_start_from', { name: def.name }) })
          .addEventListener('click', () => void this.assign(def, book.name));
      }
      return;
    }

    /**
     * The name always resolves here.
     *
     * A book pointing at a preset this vault does not have is not a state this dialog meets: opening a book runs
     * `ensurePreset`, which imports the preset from the book's OWN copy whenever this device has never seen it —
     * always, with no prompt — so by the time this dialog can be opened the id resolves. `bp.name` is the belt: the
     * same name, carried in the book.
     */
    const global = this.presets.find((p) => p.id === bp.id);
    const name = bp.detached ? '' : global?.name || bp.name;
    // A detached book follows nothing, so there is no name to put weight on — naming one would assert a preset
    // the book has stopped following.
    if (bp.detached) {
      header.createSpan({ cls: 'orbis-preset-book-state', text: t('presets.book_own_marks') });
    }
    if (name) {
      /**
       * The name is an ELEMENT, not part of the sentence's text, so it can carry weight and the accent color —
       * "which preset is this book on?" should be answerable at a glance rather than by reading a line of prose.
       * It sits at the END of the sentence, so the split below leaves a trailing full stop rather than a tail.
       *
       * Split on a sentinel rather than on the name itself: `indexOf(name)` finds the first match, which for a
       * preset called "This" or "book" is a word of the sentence rather than the substitution. `\u0000` cannot
       * occur in a translated string, and is the same stand-in the export dialog and the extractor use.
       */
      const line = header.createSpan({ cls: 'orbis-preset-book-state' });
      const [before, after = ''] = t('presets.book_uses', { name: '\u0000' }).split('\u0000');
      line.appendText(before);
      line.createSpan({ cls: 'orbis-preset-book-name', text: name });
      line.appendText(after);
    }

    const actions = body.createDiv({ cls: 'orbis-preset-row orbis-book-actions' });

    // A button, never a select. Switching is rare and consequential — on Android a select is a spinner and
    // a mis-scroll would silently re-point the book and orphan annotations — and the dialog it opens IS the
    // remap step, so this is a front door rather than a guard rail.
    actions
      .createEl('button', {
        cls: 'orbis-cmd-btn',
        text: t(bp.detached ? 'presets.use_preset' : 'presets.change_preset'),
      })
      .addEventListener('click', () => this.openChangePreset(bp));

    /**
     * **Always offered while the book follows something**, including a book with nothing annotated yet: the
     * rule stays one sentence, and "there is nothing to re-point" is a reason it is cheap rather than a reason
     * to withhold it.
     */
    if (!bp.detached) {
      actions
        .createEl('button', { cls: 'orbis-cmd-btn', text: t('presets.detach_preset') })
        .addEventListener('click', () =>
          confirmThen(
            this.app,
            {
              title: t('presets.detach_title', { name: global?.name || bp.name }),
              message: [t('presets.detach_body')],
              confirmText: t('presets.detach_confirm'),
              // **Not destructive, and the call to action.** Nothing is lost — every mark is kept, every
              // annotation preserved — so red would be the color that means "you are about to lose something"
              // on a dialog where you are not. And it is the expected outcome of the button that opened it, so
              // leaving both flags off would give two identical gray buttons and make the reader hunt for the
              // one they already asked for. See `ConfirmSpec.destructive` and `.cta`.
              destructive: false,
              cta: true,
            },
            () => {
              void (async () => {
                // Only ids the library still owns are re-minted — see `detachBookPreset`.
                const taken = new Set(this.presets.flatMap((p) => p.marks.map((m) => m.id)));
                await this.plugin.detachBookPreset(detachBookPreset(bp, (id) => taken.has(id)));
                new Notice(t('presets.detached'));
                this.render();
              })();
            }
          )
        );
    }

    // **No "update the preset from this book" button.** The state it would answer — this device's template
    // behind the copy a book carried from another one — is one the traveling library settles itself, in the
    // direction versions decide rather than by asking someone who has no way to know which copy is right.
    // "Save as new preset" is how local marks get promoted.

    actions
      .createEl('button', { cls: 'orbis-cmd-btn', text: t('presets.book_save_as') })
      .addEventListener('click', () =>
        this.promptName(global?.name ?? book.name, t('presets.book_save_as'), (newName) => {
          void (async () => {
            // Every mark id already spoken for by the library. A mark of this book's own is in none of them,
            // so it keeps its id; a mark it tracks is in the preset it tracks, so it is re-minted and the
            // annotations follow. See `promoteBookToPreset` for the invariant behind that.
            const taken = new Set(this.presets.flatMap((p) => p.marks.map((m) => m.id)));
            const promoted = promoteBookToPreset(bp, newName, Date.now(), (id) => taken.has(id));
            await this.plugin.promoteActiveBook(promoted);
            this.selectedId = promoted.preset.id;
            new Notice(t('presets.book_saved_as', { name: newName }));
            this.render();
          })();
        })
      );

    // Likewise no note: the header above already says which preset this book uses, and the list below says what
    // it gets from it. See the note in `renderPresetScope`.
    this.renderMarks(body, this.bookTarget(bp));
  }

  /**
   * Change which preset this book uses, and decide what happens to the annotations that depend on the marks
   * it is leaving.
   *
   * Two stages in one dialog: pick the target, then map what is in use. The mapping stage does not appear
   * when nothing is in use, so a book with no annotations is one tap. Choosing a target mark rewrites those
   * annotations onto it; "keep in this book" carries the old mark over as the book's own"
   * strips the reference and lets the stored appearance stand.
   *
   * Nothing is written until Apply, so cancelling anywhere is free — there is no half-migrated state.
   */
  /**
   * What becomes of the annotations on a local mark being deleted — move them, or delete them.
   *
   * **Two choices, and "leave them" is not one**, for the reason the preset switch gives: an annotation with an
   * appearance and no mark is the markless passage selection this design exists to retire, and it is also
   * unfilterable, since `markKeyOf` returns the dangling id rather than `NO_MARK`.
   *
   * Moving is the default and the first option: it destroys nothing. Deletion is offered because these
   * annotations belong to ONE book and that book is open — the same reason the local/tracked split already draws,
   * and why no equivalent is offered for a preset mark, whose annotations are spread across books Orbis cannot
   * see from here.
   *
   * With no other mark to move to, the move option cannot be honored and says so rather than presenting an empty
   * dropdown; deletion stays available, because it is still a real answer.
   */
  private decideThenDeleteMark(mark: BookMark, described: string, count: number, marks: readonly BookMark[]): void {
    const targets = marks.filter((m) => m.id !== mark.id);
    openOrbisDialog(
      this.app,
      { title: t('presets.delete_mark_decide', { name: described }) },
      (body, close, _modalEl, footer) => {
        body.createDiv({
          cls: 'orbis-lookup-status',
          text:
            count === 1
              ? t('presets.delete_mark_decide_intro_one')
              : t('presets.delete_mark_decide_intro', { count: String(count) }),
        });

        /**
         * **With no other mark to offer, no choice is drawn.**
         *
         * A selectable "apply" over an empty dropdown is worse than no option at all: `ChoiceSpec` carries no
         * disabled state, so the radio would take the pick, `to.value` would be `''`, and `applyRemap` would find
         * no target and hand the annotation back untouched — deleting the mark and orphaning exactly what this
         * dialog exists to protect.
         *
         * **Rare, not impossible.** A book always has a preset and a preset always has at least one mark, so the
         * marks are never all gone — but they can all be unavailable, since a target has to be one the book
         * OFFERS. Retire the preset's marks or switch them off in this book and a local mark is the only one
         * left, which is precisely when this branch has to be right.
         */
        let choice: RemapChoice | 'remove' = 'remove';
        let to: HTMLSelectElement | null = null;

        if (!targets.length) {
          body.createDiv({ cls: 'orbis-lookup-status', text: t('presets.delete_mark_needs_target') });
        } else {
          choice = { markId: targets[0].id };
          choiceGroup(body, {
            name: 'orbis-delete-mark',
            key: 'delete-mark',
            options: [
              {
                value: 'move',
                label: t('presets.delete_mark_move'),
                desc: t('presets.delete_mark_move_help'),
                // Under its own option rather than below the group — see `ChoiceSpec.detail`. "Move to" only
                // means anything while "Move" is the answer.
                detail: (host) => {
                  host.createSpan({ cls: 'orbis-preset-label', text: t('presets.delete_mark_move_to') });
                  to = host.createEl('select', { cls: 'dropdown orbis-style-select' });
                  for (const m of targets) {
                    to.createEl('option', {
                      value: m.id,
                      text: t('presets.mark_with_source', {
                        name: m.name || t('presets.unnamed_mark'),
                        source: t(m.local ? 'presets.mark_local' : 'presets.mark_tracked'),
                      }),
                    });
                  }
                  to.addEventListener('change', () => {
                    choice = { markId: to?.value ?? targets[0].id };
                  });
                },
              },
              { value: 'remove', label: t('presets.delete_mark_remove'), desc: t('presets.delete_mark_remove_help') },
            ],
            value: 'move',
            onPick: (v) => {
              choice = v === 'remove' ? 'remove' : { markId: to?.value ?? targets[0].id };
              if (to) to.disabled = v === 'remove';
            },
          });
        }

        const btns = actionRow(footer(), { placement: 'inline', wrap: true });
        actionButton(btns, { label: t('action.cancel'), onClick: close });
        // Destructive, not `mod-cta` — the same red `confirmThen` gives the unused-mark guard, and this is the
        // more destructive of the two: it can take passage selections with it. A quiet button would
        // encourage the tap being guarded.
        actionButton(btns, {
          label: t('action.delete'),
          destructive: true,
          onClick: () => {
            close();
            void (async () => {
              await this.plugin.deleteLocalMark(mark.id, choice);
              new Notice(
                choice === 'remove'
                  ? t('presets.deleted_mark_removed', { name: described })
                  : t('presets.deleted_mark_moved', {
                      name: described,
                      to:
                        targets.find((m) => m.id === (choice as { markId: string }).markId)?.name ??
                        t('presets.unnamed_mark'),
                    })
              );
              this.render();
            })();
          },
        });
      }
    );
  }

  private openChangePreset(bp: BookPreset): void {
    // Hidden presets are not offered here either — hiding is precisely a statement about this list.
    const options = byName(this.offered.filter((p) => p.id !== bp.id));
    // Nothing is kept until Apply, and the second step is where each mark in use is decided — a stray click on the
    // backdrop would throw both away.
    openOrbisDialog(
      this.app,
      { title: t('presets.change_preset_title'), dismissOnOutsideClick: false },
      (body, close, _modalEl, footer) => {
        if (!options.length) {
          body.createDiv({ cls: 'orbis-lookup-status', text: t('presets.change_preset_none') });
          return;
        }
        // THIS dialog's footer, passed through — see `renderChangePreset`.
        this.renderChangePreset(body, close, footer, bp, options);
      }
    );
  }

  /** The two stages of Change preset — pick the target, then map what is in use — split out only because
   *  the dialog's body is a callback and this is too long to read inline. */
  private renderChangePreset(
    body: HTMLElement,
    close: () => void,
    footer: () => HTMLElement,
    bp: BookPreset,
    options: AnnotationPreset[]
  ): void {
    let targetId = options[0].id;
    const plan = new Map<string, RemapChoice>();
    const usage = this.plugin.bookMarkUsage();

    const stage = body.createDiv();
    const build = (): void => {
      stage.empty();
      const row = stage.createDiv({ cls: 'orbis-preset-row' });
      row.createSpan({ cls: 'orbis-preset-label', text: t('presets.change_preset_to') });
      const sel = row.createEl('select', { cls: 'dropdown orbis-style-select' });
      // Keyed, not left to the position fallback: the stage's shape changes with the choice (the fold and the
      // decision list appear and vanish), and identity survives that where a path is a guess about it.
      sel.dataset.orbisFocus = 'change-preset-target';
      for (const p of options) {
        const opt = sel.createEl('option', { value: p.id, text: p.name });
        if (p.id === targetId) opt.selected = true;
      }
      sel.addEventListener('change', () => {
        targetId = sel.value;
        plan.clear();
        render();
      });

      const next = this.presets.find((p) => p.id === targetId);
      if (!next) return;
      /**
       * Only marks something actually carries need a decision — the rest are dropped silently by the survivor
       * rule, which is not a choice worth interrupting anyone for.
       *
       * **And nor does a mark the incoming preset already expresses.** Its annotations go to the mark that
       * replaces it; there is nothing left to choose. A row for it is a dropdown with a foregone answer, which
       * on a switch to a DUPLICATE of the current preset means every row is one — six pre-filled decisions
       * where the honest count is none, and the one real difference buried among them.
       *
       * `collapseTo` is built below, so this filter runs after it.
       */
      const decisions = usage
        .map((u) => ({ ...u, mark: bp.marks.find((m) => m.id === u.markId) }))
        .filter((u): u is { markId: string; count: number; mark: BookMark } => !!u.mark);

      /**
       * **What the switch will collapse, said before it happens** — see `presetSwitchClashes`.
       *
       * Above the decisions rather than below: it is not a choice, it is a consequence, and a reader working
       * through a list of dropdowns should meet it before they start rather than after they have finished.
       */
      // Same usage the decision rows are built from, so the warning and the switch agree on what is carried.
      const inUse = new Set(usage.map((u) => u.markId));
      const allClashes = presetSwitchClashes(bp, next, (id) => inUse.has(id));
      /**
       * **What a clashing mark collapses ONTO, so its row cannot offer to keep it.**
       *
       * Every clash counts here, not just the ones worth warning about: a pair identical in name and badge is
       * still two marks wearing one appearance, and the switch still drops one of them. Offering "Keep in this
       * book" for a mark that is about to be replaced is the dialog contradicting its own warning: "Quote
       * will be replaced by Shorten" directly above a dropdown reading "Quote — Keep in this book".
       */
      /**
       * **A SILENT clash needs no row; a notable one is a decision, not a warning.**
       *
       * Switching to a duplicate of the current preset meets a twin for every mark — same name, same badge, same
       * active state — and a row for each is a dropdown with a foregone answer. Nothing there is a choice: the
       * preset's version arrives, looks identical, and keeps following the preset.
       *
       * Where something differs, the row IS the choice rather than a warning describing a fate: a mark the book owns
       * and has used holds its appearance by default, so the reader is picking rather than being told. Each row carries
       * a muted line naming the other mark and how it differs — the one thing the dropdown cannot say, and the thing
       * that makes "Stuff I hate" against "Stuff I love" visible rather than a surprise afterwards.
       */
      const clashBy = new Map(allClashes.filter((c) => c.differs !== null).map((c) => [c.from.id, c]));
      // Marks the preset has a namesake for in another look: the row defaults to that mark — see below.
      const nameTwins = presetSwitchNameTwins(bp, next, (id) => inUse.has(id));
      const silent = new Set(allClashes.filter((c) => c.differs === null).map((c) => c.from.id));
      for (const [id, twin] of nameTwins) if (twin.silent) silent.add(id);
      const toDecide = decisions.filter((d) => !silent.has(d.markId));
      if (!toDecide.length) return;
      // The instruction is the fold's summary rather than a line above it: three choices where one cannot
      // be undone. Explaining them is what the fold is for; it stays shut
      // for anyone who already knows.
      createCollapsibleNote(stage, t('presets.change_preset_intro'), [
        { label: t('presets.remap_keep'), text: t('presets.remap_keep_help') },
        { label: t('presets.remap_pick_label'), text: t('presets.remap_pick_help') },
      ]);
      // A region with edges, the same treatment as the chapter lists and the marks list — see `.orbis-remap-list`.
      // Drawn straight onto the dialog, a list of five decisions would read as five loose lines rather than as one
      // thing to work through.
      const list = stage.createDiv({ cls: 'orbis-remap-list' });
      for (const d of toDecide) {
        const line = list.createDiv({ cls: 'orbis-remap-row' });
        applyMarkPreview(line.createSpan({ text: t('annotation_picker.mark_sample') }), d.mark);
        line.createDiv({
          cls: 'orbis-remap-name',
          text: t(d.count === 1 ? 'presets.remap_count_one' : 'presets.remap_count', {
            name: d.mark.name || t('presets.unnamed_mark'),
            count: String(d.count),
          }),
        });
        const to = line.createEl('select', { cls: 'dropdown orbis-style-select' });
        /**
         * Keeping it is the default on every row but one: it preserves the appearance and the name, needs no guess
         * about which incoming mark meant the same thing, and on a clash it is what holds the appearance — see
         * `switchBookPreset`, which reads the plan's effect on usage rather than a second flag.
         *
         * **The exception is a mark the preset has a namesake for.** There the guess is made — the preset calls a
         * mark the same thing — and keeping the book's would cost it its name, since two marks may not share one.
         */
        const twin = nameTwins.get(d.markId)?.to;
        if (!plan.has(d.markId)) plan.set(d.markId, twin ? { markId: twin.id } : 'local');
        const chosen = plan.get(d.markId);
        for (const m of next.marks) {
          const opt = to.createEl('option', { value: m.id, text: m.name || t('presets.unnamed_mark') });
          if (typeof chosen === 'object' && chosen.markId === m.id) opt.selected = true;
        }
        const keep = to.createEl('option', { value: 'local', text: t('presets.remap_keep') });
        if (chosen === 'local') keep.selected = true;
        to.addEventListener('change', () => plan.set(d.markId, to.value === 'local' ? 'local' : { markId: to.value }));

        /**
         * The muted line under a clashing row: which mark it collides with, and how the two differ.
         *
         * The dropdown says what will happen; this says why the row is here at all. Both marks are named because
         * appearance is not meaning — "Stuff I hate" and "Stuff I love" can be one yellow underline, and a reader
         * choosing between them needs to see both names, not a count.
         */
        if (twin) {
          line.createDiv({
            cls: 'orbis-clash-note orbis-remap-why',
            text: t('presets.name_twin_row', {
              name: twin.name,
              renamed: t('presets.kept_name', { name: d.mark.name }),
            }),
          });
        }
        const clash = clashBy.get(d.markId);
        if (clash) {
          const from = d.mark.name || t('presets.unnamed_mark');
          const other = clash.to.name || t('presets.unnamed_mark');
          line.createDiv({
            cls: 'orbis-clash-note orbis-remap-why',
            text:
              clash.differs === 'name'
                ? t('presets.clash_row', { from, to: other })
                : clash.differs === 'badge'
                  ? t('presets.clash_row_badge', { from })
                  : t('presets.clash_row_enabled', { from }),
          });
        }
      }
    };
    /**
     * **Through `rebuildKeepingFocus`, like every other control here that redraws its own dialog.**
     *
     * Changing the target rebuilds the whole stage — the decisions below depend on which preset is arriving — which
     * destroys the dropdown that was just used. Emptying and rebuilding with nothing putting the keyboard back
     * would drop focus to the document after choosing a preset, where Tab walks the page BEHIND the dialog.
     */
    const render = (): void => rebuildKeepingFocus(stage, build);
    // The first pass is a plain build: there is nothing to keep yet, and the dialog's own landing puts the keyboard
    // on this dropdown a moment later — see `OrbisModal.onOpen`.
    build();

    /**
     * **The footer of the dialog being built, not of the one that opened it.**
     *
     * `this.footer()` is the Annotations modal's — Cancel and Apply would land at the bottom of the dialog
     * UNDERNEATH this popup, outside it, and pile up again on every open, leaving this dialog with no way to
     * confirm. `openOrbisDialog` hands the builder this dialog's own footer.
     */
    const btns = actionRow(footer(), { placement: 'inline', wrap: true });
    actionButton(btns, { label: t('action.cancel'), onClick: close });
    btns.createEl('button', { cls: 'mod-cta', text: t('action.apply') }).addEventListener('click', () => {
      const next = this.presets.find((p) => p.id === targetId);
      if (!next) return;
      close();
      void (async () => {
        await this.plugin.changeBookPreset(next, plan);
        new Notice(t('presets.changed_preset', { name: next.name }));
        this.render();
      })();
    });
  }

  /**
   * Assign the open book a preset and confirm it — the reader redraws behind the dialog, which is invisible
   * from here, so a notice is the only feedback that the click did anything.
   *
   * There is no un-assign. Every book is given the default preset on open (see
   * `ensureBookAnnotationPreset`), so a Remove button would undo itself the next time the book was opened —
   * a control that appears to work and silently doesn't is worse than no control. `BookPreset.detached` is what
   * lets a book stop following a preset and have that survive the open — see `detachBookPreset` and the Stop
   * using this preset button below.
   */
  /**
   * Give the book a preset. The empty state's path only — a book with no copy at all, where there is
   * nothing to remap because no annotation can be pointing at a preset mark yet.
   *
   * CHANGING an existing assignment goes through `openChangePreset`, which asks what happens to the annotations first.
   * There is deliberately no one-click path for that: switching a book's preset goes through Change preset, which is
   * where the per-mark decisions are made.
   */
  private async assign(preset: AnnotationPreset, bookName: string): Promise<void> {
    await this.plugin.assignActivePreset(preset);
    new Notice(t('presets.assigned', { book: bookName, name: preset.name }));
    this.render();
  }

  private renderPresetRow(body: HTMLElement, presets: AnnotationPreset[], active?: AnnotationPreset): void {
    const presetRow = body.createDiv({ cls: 'orbis-preset-row' });
    presetRow.createSpan({ cls: 'orbis-preset-label', text: t('presets.preset') });

    const sel = presetRow.createEl('select', { cls: 'dropdown orbis-style-select' });
    // By name, the same on every device — see `by-name.ts`. Presets are not reordered anywhere, so name is the order.
    for (const p of byName(presets)) {
      /**
       * The preset's STATUS lives here, on the one control that shows every preset.
       *
       * Inactive is marked here — this selector chooses what to EDIT, so it offers every preset, and without the marker
       * an inactive one would be indistinguishable, which is the state the flag exists to make visible. Default is
       * marked here too, so both kinds of status are reported one way — and it reads better here for a reason beyond
       * consistency: this list shows every preset, so naming the default names it WHILE CHOOSING rather than describing
       * whichever one happens to be selected.
       *
       * One or the other, never both: promoting a preset to default clears `inactive` (an inactive default
       * would be one you can neither pick nor avoid), so the two states cannot coexist.
       */
      const status = p.isDefault ? t('presets.default_badge') : p.inactive ? t('presets.inactive_badge') : null;
      const opt = sel.createEl('option', {
        value: p.id,
        text: status ? `${p.name} (${status.toLocaleLowerCase()})` : p.name,
      });
      if (p.id === this.selectedId) opt.selected = true;
    }
    sel.addEventListener('change', () => {
      this.selectedId = sel.value;
      this.render();
    });

    const addPreset = (): void => {
      this.promptName('', t('presets.new_preset_title'), (name) => {
        void (async () => {
          const created: AnnotationPreset = {
            id: generatePresetId(),
            name,
            isDefault: presets.length === 0,
            createdAt: Date.now(),
            revision: 1,
            // The default structure, not an empty list — see defaultMarks().
            marks: defaultMarks((key) => t(`presets.builtin_mark_${key}`)),
          };
          presets.push(created);
          this.selectedId = created.id;
          await this.commit();
        })();
      });
    };

    // Rename | Delete | Duplicate | Add new — the destructive action between the safe ones, and the two
    // that grow the list last, where a list's own Add button sits.
    if (!active) {
      presetRow
        .createDiv({ cls: 'orbis-preset-actions' })
        .createEl('button', { cls: 'orbis-cmd-btn', text: t('presets.add_preset') })
        .addEventListener('click', addPreset);
      return;
    }

    // The built-in is read-only — see isBuiltinPreset for why a shared identity has to have shared
    // contents. Its controls are DISABLED rather than hidden, so the lock is visible instead of leaving
    // the reader hunting for buttons that are elsewhere for everything else.
    const locked = isBuiltinPreset(active);

    // The verbs live on their OWN line, always. Left in the same flex row they would wrap by width: a phone puts
    // them all on line two and an iPad fits three, orphaning "Add new" on a line by itself. A row that breaks
    // differently on every screen has no layout, only an accident per device.
    const row = presetRow.createDiv({ cls: 'orbis-preset-actions' });
    const rename = row.createEl('button', { cls: 'orbis-cmd-btn', text: t('presets.rename') });
    rename.disabled = locked;
    rename.addEventListener('click', () => {
      this.promptName(active.name, t('presets.rename_preset'), (name) => {
        void (async () => {
          // A rename is not a mark change: nothing a book copied differs, so no revision bump.
          active.name = name;
          await this.commit();
        })();
      });
    });

    const del = row.createEl('button', { cls: 'orbis-cmd-btn', text: t('action.delete') });
    del.disabled = locked || presets.length <= 1;
    // Confirmed, unlike deleting a single mark: this discards a whole named set of marks at once, with
    // no undo. The prompt names the preset and counts what goes with it, so the cost is visible before
    // the click rather than after.
    del.addEventListener('click', () =>
      this.confirmDelete(active, () => {
        void (async () => {
          // No in-use check by design: a book keeps its own resolved copy in .orbis, so deleting the
          // global template can never break one — which is exactly what the prompt reassures about.
          const idx = presets.findIndex((p) => p.id === active.id);
          if (idx >= 0) presets.splice(idx, 1);
          // Default falls back to the built-in, which cannot be deleted — so "there is always a default"
          // holds without a scan for a survivor.
          if (active.isDefault) {
            const fallback = presets.find((p) => isBuiltinPreset(p)) ?? presets[0];
            if (fallback) fallback.isDefault = true;
          }
          this.selectedId = null;
          await this.commit();
        })();
      })
    );

    // The way past the lock, and the reason locking costs little. Fresh mark ids — see duplicatePreset.
    row.createEl('button', { cls: 'orbis-cmd-btn', text: t('presets.duplicate') }).addEventListener('click', () =>
      this.promptName(t('presets.copy_of', { name: active.name }), t('presets.duplicate_title'), (name) => {
        void (async () => {
          const copy = duplicatePreset(active, name, Date.now());
          presets.push(copy);
          this.selectedId = copy.id;
          await this.commit();
          new Notice(t('presets.duplicated', { name }));
        })();
      })
    );

    /**
     * Second row: adding to the list, and this preset's standing in it. Commands only.
     *
     * **"Add new" sits here rather than on the first row**, which cannot fit four verbs in real button chrome —
     * the orphaned line the comment above the first row describes. Three and three, laid out as columns rather
     * than left to wrap: see `.orbis-preset-actions`. Delete keeps a safe action either side of it.
     *
     * The `Default` status lives in the dropdown, where the status belongs, so this row does not pair two
     * unrelated facts; the read-only note sits with the list it applies to rather than beside "Default", where
     * the two would read as one statement about one thing.
     *
     * "Set as default" is always here, DISABLED on the preset that already is the default.
     *
     * Omitting it would empty the whole row — and this row is the last thing above the mark list, so picking the
     * default preset out of the dropdown would pull the entire list up by the height of a button. Every other
     * control in this dialog says "not here" by going gray, not by leaving.
     *
     * The reason lives in the label, since a disabled button cannot be hovered for a tooltip on touch and the
     * dropdown already says "(default)" beside the name.
     */
    // Same class as the first row, so one grid rule lays out both and the two rows cannot drift apart.
    const defRow = body.createDiv({ cls: 'orbis-preset-row orbis-preset-actions' });
    defRow
      .createEl('button', { cls: 'orbis-cmd-btn', text: t('presets.add_preset') })
      .addEventListener('click', addPreset);
    const mkDefault = defRow.createEl('button', { cls: 'orbis-cmd-btn', text: t('presets.make_default') });
    mkDefault.disabled = !!active.isDefault;
    if (active.isDefault) mkDefault.setAttribute('aria-label', t('presets.already_default', { name: active.name }));
    mkDefault.addEventListener('click', () => {
      void (async () => {
        for (const p of presets) p.isDefault = p.id === active.id;
        // An inactive preset made default would be one you cannot pick and cannot avoid, and the button
        // that would reactivate it is not offered for the default. Activate as part of the promotion.
        active.inactive = undefined;
        await this.commit();
        new Notice(t('presets.made_default', { name: active.name }));
      })();
    });
    // A command, not a checkbox. Everything else on these two rows is a verb you press, and a lone
    // checkbox at the head of a long list reads as if it might apply to the list. Two-state rather than
    // "badge when set, command when not" like Set as default, because unlike a default this is reversible
    // and the reverse needs saying.
    // Not offered for the default. Deactivating keeps a preset out of the list you assign from, and the
    // default is the one every book gets without being assigned — so an inactive default is a preset you
    // cannot pick and cannot avoid. Make something else the default first, and this comes back.
    if (!locked && !active.isDefault) {
      const label = active.inactive ? t('presets.activate_preset') : t('presets.deactivate_preset');
      const btn = defRow.createEl('button', { cls: 'orbis-cmd-btn', text: label });
      // Same words as the visible text, plus what the button does — the label is computed, so the a11y audit cannot see
      // it there, and a `title` would draw a second tooltip beside Obsidian's own. One label, one tooltip, and the hint
      // is still the thing you hover for.
      btn.setAttribute('aria-label', `${label} — ${t('presets.inactive_hint')}`);
      btn.addEventListener('click', () => {
        // No notice: the Inactive badge and this button's own label change with it, and the guide says what it means.
        void (async () => {
          active.inactive = active.inactive ? undefined : true;
          await this.commit();
        })();
      });
    }
  }

  private renderMarks(body: HTMLElement, target: MarkTarget): void {
    // Add goes ABOVE the list, which is where Obsidian's own lists put their `+`. After it, a preset with eight
    // marks would push the button off the bottom of the dialog, so adding a ninth would mean scrolling past the
    // eight you already have. Capping the list's height instead is worse: the dialog keeps its own scrollbar and
    // the list grows a second one inside it.
    this.renderAddMark(body, target);
    const list = body.createDiv({ cls: 'orbis-mark-list' });
    // No cut-off divider showing where the reader's bar stops offering marks directly. It would answer a question
    // nobody has to ask — the bar is on screen and you can count it — and it cannot be honest anyway: the bar takes
    // three marks on a phone and five on a wider screen, so one rule is wrong on one of them, and a per-device rule is
    // only true on the device you are holding while the marks it describes are shared across all of them.
    /**
     * Which of this book's marks are holding an appearance a preset mark wants — see `blockedPresetMarks`.
     * Only in the book scope: a preset's own list has nothing blocking it.
     */
    const blocking = target.book?.preset
      ? blockedPresetMarks(
          target.book.preset,
          this.presets.find((p) => p.id === target.book?.preset?.id)
        )
      : new Set<string>();
    target.marks.forEach((m, i) => this.renderMarkRow(list, target, m, i, blocking.has(m.id)));
    // One legend for the list, not a note per row: the rows carry a `*` and this says what it means.
    if (blocking.size) body.createDiv({ cls: 'orbis-mark-legend', text: t('presets.blocking_legend') });
  }

  /**
   * Open one mark for editing. One editor at a time — a second tap before the first dialog appears would open a
   * duplicate for the same mark, both able to save.
   *
   * The mark is passed by ID, not by object: the editor outlives several saves, and a captured object can be
   * orphaned by a settings reload between them (see MarkTarget).
   */
  private openEditor(target: MarkTarget, markId: string, opts?: { startOnName?: boolean }): void {
    if (target.readOnly || this.editorOpen) return;
    this.editorOpen = true;
    new MarkEditorModal(
      this.plugin,
      target,
      markId,
      () => {
        this.editorOpen = false;
        this.render();
      },
      opts
    ).open();
  }

  /**
   * The "Add mark" affordance. Above the list — see `renderMarks` for why.
   *
   * Disabled on a locked preset rather than absent, the same rule as every control in a mark row: the lock is
   * something to see, not something to deduce from a missing button. It also keeps the list starting at the same
   * height on the locked preset as on every other one, so switching preset in the dropdown does not shift the
   * whole list under the pointer.
   */
  private renderAddMark(body: HTMLElement, target: MarkTarget): void {
    const addRow = body.createDiv({ cls: 'orbis-mark-add-row' });
    const add = addRow.createEl('button', { cls: 'mod-cta orbis-mark-add', text: t('presets.add_mark') });
    if (target.readOnly) {
      add.disabled = true;
      return;
    }
    add.addEventListener('click', () => {
      void (async () => {
        // Opens on a free (color, treatment) pair so adding never lands on a clash to fix.
        const seed = firstFreeAppearance(target.marks);
        // `badge` deliberately absent, not pre-filled: absent means "derive it", so it keeps
        // tracking the color and treatment. Storing the derived value would make it look user-chosen
        // and freeze it.
        const created = { id: generateMarkId(), name: '', ...seed, enabled: true };
        target.setMarks([...target.marks, created]);
        await target.commit(created.id);
        /**
         * **Adding opens the mark, on its name.**
         *
         * Appending an unnamed row and stopping there would leave "(unnamed)" at the BOTTOM of a list whose Add
         * button is at the top: on a preset with eight marks the thing you just made would be off screen, and
         * naming it would take a scroll and a click. Nothing about the mark changes here — it is already created
         * and saved — the dialog that is the next step just opens itself.
         */
        this.openEditor(target, created.id, { startOnName: true });
      })();
    });
  }

  /**
   * One mark: a read-only row, with editing behind a per-mark dialog. The SAME layout everywhere.
   *
   * One layout rather than an inline table for fine pointers and this for touch: the row displays every field a
   * table would (color, name, badge, treatment), so a table would add editing ergonomics, not visibility — and it
   * would cost a header grid that has to stay structurally identical to every row grid, an invariant that is
   * unenforceable in CSS. One layout also means the
   * keyboard problem is solved once: the list holds no text inputs, so it never raises one and can use the
   * full height, while only the small editor has to fit above it.
   *
   * Reorder, active and delete stay in the row — none needs a keyboard, all three are frequent, and
   * keeping delete here matches the glossary manager's rows.
   */
  private renderMarkRow(list: HTMLElement, target: MarkTarget, m: BookMark, i: number, blocking = false): void {
    const row = list.createDiv({ cls: 'orbis-mark-row' });
    const hidden = !!target.book?.isHidden(m.id);
    // What this book OFFERS — `offeredMarks`' rule, asked here so the two locks below count the same thing the
    // marks bar does: enabled in the preset, and not turned off in this book.
    const activeCount = target.marks.filter((x) => x.enabled && !target.book?.isHidden(x.id)).length;
    // Grayed in place, not removed: hiding it elsewhere would mean going to the Presets tab to find
    // something you turned off here.
    if (!m.enabled || hidden) row.addClass('is-off');
    const described = m.name || t('presets.unnamed_mark');

    // One big target for "edit this mark" — the preview, the name and the badge together, so the whole
    // left side of the row is tappable rather than a small chevron.
    const open = row.createEl('button', { cls: 'orbis-mark-open' });
    /**
     * Keyed by the MARK, so focus follows it through a redraw — see `rebuildKeepingFocus`.
     *
     * The path fallback would keep the keyboard in the same screen position, which is wrong for the one control here
     * that moves things: press ↑ twice and the second press would move whatever row had slid into place under the
     * cursor. Keyed this way, ↑ ↑ ↑ walks one mark up the list, which is what a reader means by it.
     */
    open.dataset.orbisFocus = `open:${m.id}`;
    open.disabled = !!target.readOnly;
    renderPreview(open, m, readingSurface(this.plugin), t('presets.sample'));

    // The badge gets its OWN cell beside the sample, left-aligned, rather than living in the text block.
    // Inside the text it cannot both line up across rows and sit close to the treatment: trailing it
    // puts a one-glyph badge and a three-glyph badge at different x, and pushing it to the block's far
    // edge aligns the right-hand side while opening a gap. A fixed cell early in the row fixes its
    // position without constraining the name's length — and it belongs next to the sample anyway, since
    // both answer "what does this look like".
    open.createSpan({ cls: 'orbis-mark-open-badge', text: badgeOf(m) });

    const text = open.createDiv({ cls: 'orbis-mark-open-text' });
    const nameRow = text.createDiv({ cls: 'orbis-mark-open-name' });
    nameRow.createSpan({ text: m.name || t('presets.unnamed_mark') });
    // Holding an appearance a preset mark wants — the legend under the list says what the `*` means, and the
    // accessible name carries the same sentence, since a lone asterisk reads as nothing to a screen reader.
    if (blocking) {
      const star = nameRow.createSpan({ cls: 'orbis-mark-blocking', text: t('presets.blocking_marker') });
      star.setAttribute('aria-label', t('presets.blocking_legend'));
    }
    /**
     * The role glyphs and the provenance tag, in a cell of their own ABOVE the badge.
     *
     * Trailing the name, pushed flush right, they would read as a ragged column: right-aligning things
     * of different widths lines up an edge nobody looks at, while the glyph everybody looks at — the first one —
     * lands somewhere new on every row. In their own cell they start at one x, and the badge starts at the same x
     * beneath them, so the block reads as two short columns rather than as text with debris at the end.
     */
    /**
     * Every mark in the book scope says where it came from, not only the book's own. Badging just the
     * exception would be tidier and wrong: with no local marks at all, an unbadged list says
     * nothing rather than "these are all the preset's", and the reader is left to infer provenance from an
     * absence. The preset badge is the quieter of the two, so scanning for "This book" still works.
     *
     * A cell of its own in the row's grid, with the role glyphs in the next one — see the CSS. Sharing one cell would
     * put the glyphs at a different x on every row, since "This book" is wider than "Preset".
     */
    if (target.book) {
      open.createSpan({
        cls: m.local ? 'orbis-mark-local-badge' : 'orbis-mark-local-badge is-tracked',
        text: t(m.local ? 'presets.mark_local' : 'presets.mark_tracked'),
      });
    }
    const roles = open.createDiv({ cls: 'orbis-mark-open-roles' });
    // Role indicators, not controls: the toggles live in the editor (a row with two more buttons per mark
    // would be sixteen extra thumb targets across eight marks). Effective, not just explicit — the
    // read-aloud role falls back to the first enabled mark, and showing the glyph on the mark that will
    // ACTUALLY be used is the honest thing.
    // In a book the fallback walks the marks the book OFFERS, exactly as the reader does — so a role glyph never
    // settles on a mark whose Active box is clear, which would promise something the bar would not deliver.
    const candidates = target.book ? target.marks.filter((mk) => !target.book?.isHidden(mk.id)) : target.marks;
    const holders: Record<MarkRole, string | undefined> = {
      note: noteMark({ marks: candidates, ...target.roles })?.id,
      audio: audioMark({ marks: candidates, ...target.roles })?.id,
    };
    for (const role of ['note', 'audio'] as MarkRole[]) {
      if (holders[role] !== m.id) continue;
      const badge = roles.createSpan({ cls: 'orbis-mark-role' });
      setIcon(badge, ROLE_ICONS[role]);
      badge.setAttribute('aria-label', t(ROLE_LABELS[role]));
    }
    /**
     * **No treatment line under the name — the sample beside it already says that.**
     *
     * "Double underline" under "Green", with a double-underlined sample two columns to the right, would be the
     * same fact twice, and would cost the name most of its width. The words are for the reader who cannot see the
     * sample, so they live in the button's accessible name.
     */
    open.setAttribute(
      'aria-label',
      t('presets.edit_mark_appearance', { name: described, appearance: appearanceLabel(m) })
    );
    open.addEventListener('click', () => this.openEditor(target, m.id));

    // A labeled checkbox rather than a column heading. A heading needs a header row whose tracks match
    // every row's — an invariant CSS cannot enforce — whereas the word beside the
    // control needs no alignment at all, works on every device, and makes the text a tap target too.
    // In the book this toggles VISIBILITY, not the mark's `enabled` — hiding as an edit would force a copy
    // and fork the definition, far too heavy for "I don't use Follow up in this novel". In the preset it is
    // still `enabled`: retiring a mark everywhere.
    const active = row.createEl('label', { cls: 'orbis-mark-active' });
    const on = active.createEl('input', { type: 'checkbox', cls: 'orbis-mark-check' });
    on.dataset.orbisFocus = `active:${m.id}`;
    /**
     * **The book's checkbox answers "active in this book", which a preset can veto.**
     *
     * Reporting `!hidden` alone would put a mark the PRESET has switched off on a grayed row with a ticked box:
     * the gray saying "not offered here" (`enabled && !hidden`, the `offeredMarks` rule) and the tick saying "this
     * book is not the one hiding it". Both true, and together nonsense.
     *
     * The hierarchy only runs one way — a book can hide a mark the preset offers, never offer one the preset has
     * switched off — so the box shows unticked and takes no input. Nothing is written while it is disabled, so
     * this book's own choice is still underneath if the preset makes the mark active again.
     */
    const offPreset = !!target.book && !m.enabled;
    on.checked = target.book ? m.enabled && !hidden : m.enabled;
    /**
     * **The last active mark locks**, the same rule `reading_records_page.kinds_last` uses for annotation kinds.
     *
     * A book with nothing active cannot be annotated — selecting text offers no mark — and without this that is two
     * taps away with nothing saying so. Only in the book scope: `enabled` in a preset is "retired everywhere", and a
     * preset whose marks are all retired is a statement about the preset rather than a book left unable to work.
     */
    const lastActive = !!target.book && on.checked && activeCount === 1;
    on.disabled = !!target.readOnly || lastActive || offPreset;
    // Contains the visible label text, so the accessible name does not contradict it (WCAG 2.5.3). A disabled
    // box spends its name on WHY instead — the row already says which mark it belongs to.
    on.setAttribute(
      'aria-label',
      offPreset
        ? t('presets.mark_inactive_in_preset')
        : lastActive
          ? t('presets.mark_last_active')
          : t(target.book ? 'presets.show_mark' : 'presets.toggle_mark', { name: described })
    );
    // One word for both scopes — see `presets.show_mark` for why the visible label does not name the scope.
    active.createSpan({ text: t('presets.active') });
    on.addEventListener('change', () => {
      if (target.book) {
        void target.book.setHidden(m.id, !on.checked);
        return;
      }
      m.enabled = on.checked;
      void target.commit();
    });

    const actions = row.createDiv({ cls: 'orbis-mark-actions' });
    // **The pencil, though the row itself opens the editor too.** A tap with no visible affordance is a tap you
    // find by accident, and there is no hover on a phone to reveal the tooltip that explains it. It leads the
    // row's controls here as it does in every other list in the plugin.
    const edit = actions.createEl('button', { cls: 'orbis-small-btn' });
    edit.dataset.orbisFocus = `edit:${m.id}`;
    setIcon(edit, 'pencil');
    edit.setAttribute('aria-label', t('presets.edit_mark', { name: described }));
    edit.disabled = !!target.readOnly;
    edit.addEventListener('click', () => open.click());
    const up = actions.createEl('button', { cls: 'orbis-small-btn', text: '↑' });
    up.dataset.orbisFocus = `up:${m.id}`;
    up.setAttribute('aria-label', t('presets.move_up'));
    up.disabled = !!target.readOnly || i === 0;
    up.addEventListener('click', () => {
      target.setMarks(moveMark(target.marks, i, -1));
      void target.commit();
    });
    const down = actions.createEl('button', { cls: 'orbis-small-btn', text: '↓' });
    down.dataset.orbisFocus = `down:${m.id}`;
    down.setAttribute('aria-label', t('presets.move_down'));
    down.disabled = !!target.readOnly || i === target.marks.length - 1;
    down.addEventListener('click', () => {
      target.setMarks(moveMark(target.marks, i, 1));
      void target.commit();
    });
    // A trash, not `✕`: `✕` is the app's dismiss glyph — a dialog's close, a notice's, a search box's —
    // and one glyph cannot mean both "put this away" and "destroy it". Deleting a mark orphans the annotations that
    // carry it, which is as destructive as anything in the plugin gets. See the note on `action.delete`.
    const rm = actions.createEl('button', { cls: 'orbis-small-btn' });
    setIcon(rm, 'trash');
    const lastOne = target.marks.length <= 1;
    /**
     * **And the last ACTIVE one, which `lastOne` does not catch.** It counts what the book holds; a book holding
     * two marks with one switched off would let the active one go and leave nothing to annotate with — a
     * one-mark preset plus a local mark, with the preset's unchecked, is exactly that setup.
     *
     * The toggle above locks the other route to the same state. Both are needed: neither guard sees the other's
     * door.
     */
    const lastActiveMark = !!target.book && m.enabled && !hidden && activeCount === 1;
    // A tracked mark deleted here would return on the next merge, so the book offers hide instead — a
    // delete that silently undoes itself is worse than no delete (see the note on `assign`).
    const tracked = !!target.book && !m.local;
    rm.disabled = !!target.readOnly || lastOne || tracked || lastActiveMark;
    rm.setAttribute(
      'aria-label',
      tracked
        ? t('presets.delete_mark_tracked')
        : lastOne
          ? t('presets.delete_mark_last')
          : lastActiveMark
            ? t('presets.delete_mark_last_active')
            : t('presets.delete_mark')
    );
    // Confirmed: annotations reference a mark by id, and a recreated mark gets a NEW id — so the old annotations stay
    // orphaned even if you rebuild the row identically.
    const dropMark = (): void => {
      const next = [...target.marks];
      next.splice(i, 1);
      target.setMarks(next);
      void target.commit();
    };
    /**
     * **A mark with annotations on it asks what becomes of them; an empty one is still one tap.**
     *
     * Only in a book, and only for a local mark — a tracked one cannot be deleted here at all, and when the
     * preset drops it the survivor rule keeps it for as long as anything points at it. This is the one delete
     * that can strand an annotation, so it is the one that has to ask.
     */
    const inUse = target.book ? (this.plugin.bookMarkUsage().find((u) => u.markId === m.id)?.count ?? 0) : 0;
    rm.addEventListener('click', () => {
      // `deleteLocalMark` drops the mark itself, in the same write as the annotations — so this path must NOT
      // also call `dropMark`, which would be a second, separate write of the same intention.
      if (inUse > 0) {
        // **What a mark can be moved ONTO is what the book offers**, which is `offeredMarks`' rule: enabled in
        // the preset, and not turned off in this book. The raw list would let annotations be moved onto a mark
        // the reader has retired or switched off here — one that would then never appear on the bar again.
        const offered = target.marks.filter((x) => x.enabled && !target.book?.isHidden(x.id));
        // First, the preset marks this delete makes room for — see `marksFreedByDeleting`.
        const book = target.book?.preset;
        const freed = book
          ? marksFreedByDeleting(
              book,
              this.presets.find((p) => p.id === book.id),
              m.id
            ).filter((x) => x.enabled)
          : [];
        this.decideThenDeleteMark(m, described, inUse, [...freed, ...offered]);
        return;
      }
      // Same title as the in-use dialog — `Delete “name”` — so the two are recognisably one decision at two
      // depths. "Delete mark?" with the name repeated in the body would be the name twice and the question once.
      confirmThen(
        this.app,
        {
          title: t('presets.delete_mark_decide', { name: described }),
          // No body: nothing else happens, and a line saying so is one the reader reads to find out they did
          // not need it. The confirms that do carry one are saying what ELSE goes or survives.
          message: [],
          confirmText: t('action.delete'),
        },
        dropMark
      );
    });

    // The drag handle goes LAST, on the trailing edge. Obsidian's own declarative lists put it there and so does
    // the EPUB chapter list, so it reads as the same control. It works with a finger because `wireListDrag` is
    // built on Pointer Events, so it shows on
    // every platform — and the ↑/↓ buttons stay regardless, dragging having no keyboard equivalent.
    const handle = actions.createDiv({ cls: 'orbis-mark-handle' });
    setIcon(handle, DRAG_HANDLE_ICON);
    handle.setAttribute('aria-hidden', 'true');
    /**
     * On a locked target the handle stays, dimmed and inert — it is not hidden, for two reasons.
     *
     * Hidden, it would be the only control in the row that was: the row button, Active, the pencil, ↑, ↓ and the trash
     * are all DISABLED, which is the rule the preset-level buttons state — the lock should be visible, not leave the
     * reader hunting for controls that are somewhere else on every other screen.
     *
     * And hiding it would move the rest of the row. The handle sits in the grid's last track, so an `auto` column
     * that collapses to nothing hands its width to the `1fr` slack behind it, landing Active and the pencil ~64px
     * further right on a locked preset than on an unlocked one — and switching tabs would slide every control
     * sideways.
     */
    if (target.readOnly) handle.addClass('is-locked');
    else {
      // a11y-audit-disable-next-line -- aria-hidden pointer affordance; the ↑/↓ buttons are the labeled equivalent
      handle.setAttribute('aria-label', t('presets.drag_hint'));
      this.wireDrag(row, handle, target, i);
    }
  }

  /** Drag reorder, via the shared helper — see `wireListDrag` for why only the handle is draggable and why the
   *  ↑/↓ buttons stay. */
  private wireDrag(row: HTMLElement, handle: HTMLElement, target: MarkTarget, i: number): void {
    wireListDrag({
      row,
      handle,
      index: i,
      state: this.drag,
      onDrop: (from, to) => {
        target.setMarks(moveMark(target.marks, from, to - from));
        void target.commit();
      },
    });
  }

  /**
   * Confirm discarding a whole preset.
   *
   * A nested Modal rather than the inline swap the glossary's Remove uses: that one serves two
   * different host surfaces, while this dialog is the only host here, and the message needs room for
   * both the count and the reassurance about books. Obsidian Modals stack cleanly — the focus trap
   * that forces inline elsewhere is specific to createOrbisPopup opened inside a Modal.
   */
  private confirmDelete(preset: AnnotationPreset, onConfirm: () => void): void {
    const n = preset.marks.length;
    confirmThen(
      this.app,
      {
        title: t('presets.delete_title'),
        message: [
          n === 1
            ? t('presets.delete_body_one', { name: preset.name })
            : t('presets.delete_body', { name: preset.name, count: String(n) }),
          /**
           * **What → how far it reaches → what survives → what comes back**, which is the order those questions
           * occur to someone. Last, the sync line would read as a footnote to a decision already made; and the
           * reassurance about books reads oddly before the reader knows how far the delete goes.
           *
           * The sync line is conditional: a delete is a version like any other, so it reaches every device — but
           * saying that where nothing is published would promise machinery the reader has not turned on.
           */
          ...(syncEnabled() ? [t('presets.delete_travels')] : []),
          t('presets.delete_safe'),
          // Deleting does not mean gone: a book that uses this preset re-imports it on its next open.
          t('presets.delete_returns'),
        ],
        confirmText: t('action.delete'),
      },
      onConfirm
    );
  }

  /** Small name prompt, reusing the dialog stack rather than a second Modal class. */
  private promptName(initial: string, title: string, onConfirm: (name: string) => void): void {
    let unpin: () => void = () => {};
    // A name half typed is lost to a stray click on the backdrop; Cancel is the way out.
    openOrbisDialog(
      this.app,
      { title, dismissOnOutsideClick: false, onClose: () => unpin() },
      (body, close, modalEl, footer) => {
        const input = body.createEl('input', { type: 'text', cls: 'orbis-input-full' });
        input.value = initial;
        input.setAttribute('aria-label', title);
        const submit = (): void => {
          const name = input.value.trim();
          if (!name) return;
          close();
          onConfirm(name);
        };
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submit();
          }
        });
        // In the footer — see `InlineOrbisModal.renderDialog`.
        const btns = actionRow(footer(), { placement: 'inline', wrap: true });
        actionButton(btns, { label: t('action.cancel'), onClick: close });
        btns.createEl('button', { cls: 'mod-cta', text: t('action.save') }).addEventListener('click', submit);
        // This dialog is one text field, so it ALWAYS raises the keyboard — and on Android would land behind it
        // without this. Same treatment as the mark editor.
        unpin = pinModalAboveKeyboard(modalEl, this.plugin);
        window.setTimeout(() => input.focus(), 50);
      }
    );
  }
}

/**
 * One mark, edited in a dialog. The touch counterpart of the desktop row's inline controls.
 *
 * Deliberately short — four controls — because it is the only part of this feature that raises the
 * keyboard, and it has to fit in the ~45% of the screen left above one. Changes apply immediately
 * rather than on Save, matching the desktop rows: every edit there commits as you make it, and one
 * layout confirming while the other does not would be a difference with no reason behind it.
 */
type EditorTab = 'general' | 'appearance';

class MarkEditorModal extends OrbisModal {
  private unpin: () => void = () => {};
  /** Survives re-renders (every edit commits and redraws), so changing a color does not bounce you back
   *  to the first tab. */
  private tab: EditorTab = 'general';
  /** The line color ink is standing in front of, so unticking "Match the text color" puts it back. */
  private lastLineColor?: string;

  constructor(
    private readonly plugin: IOrbisReaderPlugin,
    /** Whichever list this mark lives in — the shared preset or the book's copy. The editor is identical
     *  for both; only the target knows where a save goes. */
    private readonly target: MarkTarget,
    /** The mark's ID, never the object: this dialog lives across several saves, and one of them can
     *  replace the whole settings graph (see MarkTarget). Resolved fresh on every read. Not readonly —
     *  copying a preset mark into the book mints a new id, and the dialog follows the reader onto it. */
    private markId: string,
    /** Fires whichever way the dialog goes away, so the opener can drop its one-at-a-time guard. */
    private readonly onClosed?: () => void,
    /** `startOnName` for a mark that has just been created: the first thing it needs is a name, so the keyboard
     *  starts there rather than nowhere. Once only — a rebuild restores focus to whatever was being used. */
    private readonly opts?: { startOnName?: boolean }
  ) {
    // The top pin matters more here than anywhere: the two tabs are very different heights — General is two
    // fields and two toggles, Appearance is two swatch grids and a sample — so a centered dialog would jump up and
    // down the screen as you switch them, moving the tab row you are aiming at. `OrbisModal` pins every
    // dialog, and excludes phones, where this dialog's keyboard handling keeps its own geometry.
    //
    // **The marks glyph here too, not only on the manager that opens this.** A system badges its dialogs — see
    // `system-glyphs.ts` — and this editor is reachable from the marks bar as well as from the manager, so it is
    // not always arrived at from somewhere already wearing it.
    super(plugin.app, { icon: annotationsSvg(16) });
  }

  /** Whether the one-time opening focus has been placed. */
  private landed = false;

  private get mark(): BookMark | undefined {
    return this.target.marks.find((m) => m.id === this.markId);
  }

  /**
   * **The title is the dialog's name and the system's glyph, like every other dialog.**
   *
   * Not `badge  name`: the badge derives from the appearance, so a title showing it would make a change on the
   * Appearance tab visible while you are on it — but the title would stop naming the dialog, and would displace the
   * annotations glyph that says which system this belongs to. The General tab's **Badge** field shows the same
   * character, and a reader on Appearance is watching the sample they just changed.
   *
   * No override — `OrbisModal.refreshTitle` draws icon + `dialogTitle()`, which is the whole point of having it.
   * `syncTitle` stays because the callers below have every right to ask for a redraw; it simply has nothing more
   * to redraw.
   */
  private syncTitle(): void {
    this.refreshTitle();
  }

  /**
   * **Add or Edit, from the same signal that decides where the keyboard lands.** `startOnName` is set by the one
   * caller that opens this over a mark it has just created — see `openEditor`'s add path, where the mark is saved
   * before the dialog opens, so nothing else here can tell the two apart.
   */
  protected dialogTitle(): string {
    return t(this.opts?.startOnName ? 'presets.add_title' : 'presets.edit_title');
  }

  protected renderDialog(): void {
    this.modalEl.addClass('orbis-mark-editor');
    this.render();
    // Freezes the reader pane's heights while open — see pinModalAboveKeyboard.
    // **Neither treatment — see `KeyboardLayout`.** This dialog owns its layout: on a phone `.modal-content` is
    // capped at 70vh with its own inner scroller (off a phone the pinned cap governs instead, see the
    // constructor), so filling would fight that cap (a full-height dialog showing 70% of a screen,
    // and an Appearance tab that could not show itself) and lifting would halve it on first focus. It does not need
    // either: the only text fields are at the top of the first tab, where the keyboard covers nothing. The call
    // stays so the dialog still joins the stack and hides when a child dialog opens over it.
    this.unpin = pinModalAboveKeyboard(this.modalEl, this.plugin, { layout: 'none' });
  }

  protected onDialogClose(): void {
    this.unpin();
    this.onClosed?.();
  }

  /**
   * Persist, and re-render unless told not to.
   *
   * `rerender: false` exists for the TEXT fields, and it is a correctness fix rather than an optimization. Their
   * `change` event fires on blur — which is what clicking a footer button causes — so a re-render would run blur →
   * change → commit → `render()` empties the dialog → the click lands on a button that no longer exists, and the button
   * would appear to need pressing twice. Nothing a text field changes needs the rebuild anyway; the two things that
   * follow from it (the dialog title, the badge's derived default) are set in place.
   */
  private commit(opts?: { rerender?: boolean; usage?: boolean }): void {
    void (async () => {
      // Most of what this dialog changes is the mark's DEFINITION — name, badge, appearance — so in the book
      // scope it makes this mark the reader's own. The ROLE toggles are the exception: which mark new notes
      // get, and which one the player marks a passage with, are the book's usage of a mark and not part of
      // what the mark is. Passing the id for those would detach tracked marks from their preset just for
      // being given a job — see `MarkTarget.commit`, whose contract says roles must not.
      await this.target.commit(opts?.usage ? undefined : this.markId);
      if (opts?.rerender !== false) this.render(); // the preview and the derived badge follow the change
    })();
  }

  /** Every internal redraw goes through here, so the keyboard survives it — see `rebuildKeepingFocus`. */
  private render(): void {
    rebuildKeepingFocus(this.contentEl, () => this.build());
  }

  private build(): void {
    const body = this.contentEl;
    body.empty();
    // Every commit re-renders, so this is where an appearance change reaches the title.
    this.syncTitle();
    const m = this.mark;
    // Gone while this was open — deleted here, or the preset replaced by a settings reload. Say so and
    // close rather than editing an object nothing will ever save.
    if (!m) {
      new Notice(t('presets.mark_gone'));
      this.close();
      return;
    }

    // A preset mark opened inside a book is READ-ONLY until it is copied in. The gate sits here rather than
    // in a menu because this is where the intent forms, and the disabled fields below it explain why before
    // anyone has to ask. Copying mints a new mark that replaces the original in this book and moves this book's
    // annotations onto it — see AnnotationController.copyMarkIntoBook.
    if (this.target.book && !m.local) {
      const gate = body.createDiv({ cls: 'orbis-mark-copy-gate' });
      gate.createDiv({ cls: 'orbis-mark-copy-hint', text: t('presets.copy_into_book_hint') });
      gate.createEl('button', { cls: 'mod-cta', text: t('presets.copy_into_book') }).addEventListener('click', () => {
        void (async () => {
          const created = await this.target.book?.copyIn(m.id);
          if (!created) return;
          // Stay on the mark the reader was looking at — it has a new id now.
          this.markId = created;
          new Notice(t('presets.copied_into_book', { name: m.name || t('presets.unnamed_mark') }));
          this.syncTitle();
          this.render();
        })();
      });
    }

    // Two tabs. Two color channels and two role toggles do not fit above a phone keyboard together — and the two
    // halves are genuinely different questions: what this mark MEANS (name, badge, what it is used for) and what it
    // LOOKS like. Splitting by that seam keeps each tab short enough to need no scrolling on a phone.
    renderTabRow(
      body,
      [
        { id: 'general', label: t('presets.tab_general') },
        { id: 'appearance', label: t('presets.tab_appearance') },
      ],
      this.tab,
      (which) => {
        this.tab = which;
        this.render();
      }
    ).addClass('orbis-mark-editor-tabs');

    // Fields scroll; the Done button below stays put. On a phone the dialog is already capped at ~58%
    // of the screen to clear the keyboard, and the button would otherwise land below the fold.
    const fields = body.createDiv({ cls: 'orbis-mark-editor-scroll' });
    if (this.tab === 'general') this.renderGeneralTab(fields, m);
    else this.renderAppearanceTab(fields, m);

    /**
     * In the footer, emptied first: this body is redrawn on every tab switch, and the footer is not part of it.
     *
     * **`Done`, and no Cancel — because this dialog has nothing pending.** Every edit commits as it is made, which
     * is the parity with the desktop rows this editor exists to provide on touch. `Apply` would claim that a
     * button which only calls `close()` was writing something, and a Cancel that discards nothing would be the
     * same lie told twice.
     *
     * Orbis has two footer families and this belongs to the second: **Cancel + Apply/Save/OK** for a dialog that
     * buffers (Edit field, Edit value, Edit source, the preset remap), **Done** for one that commits as you go
     * (Voice and source, the catalog review, the mark-filter picker). The buttons are how a reader tells which
     * kind they are in, so a dialog wearing the wrong pair teaches the wrong thing about all of them.
     */
    const bar = this.footer();
    bar.empty();
    const btns = actionRow(bar, { placement: 'inline', wrap: true });
    btns.createEl('button', { cls: 'mod-cta', text: t('action.done') }).addEventListener('click', () => this.close());

    // A mark that has just been created opens on its name — the one field it does not have yet. Once, and not on the
    // rebuilds that follow every edit, where `rebuildKeepingFocus` is already putting the keyboard back where it was.
    if (this.opts?.startOnName && !this.landed) {
      this.landed = true;
      const nameEl = fields.querySelector<HTMLInputElement>('.orbis-mark-name-input');
      // A frame later: Obsidian's Modal takes focus itself as it opens, and would take it straight back.
      if (nameEl) window.setTimeout(() => nameEl.focus(), 0);
    }
  }

  /** What the mark MEANS: its name, the badge it exports with, and the jobs it does automatically. */
  /** True while this mark still belongs to the preset: the book may look but not touch. */
  private get lockedToPreset(): boolean {
    const m = this.mark;
    return !!this.target.book && !!m && !m.local;
  }

  private renderGeneralTab(fields: HTMLElement, m: BookMark): void {
    const nameRow = fields.createDiv({ cls: 'orbis-mark-editor-row' });
    nameRow.createSpan({ text: t('presets.field_name') });
    const nameEl = nameRow.createEl('input', { type: 'text', cls: 'orbis-mark-name-input' });
    nameEl.value = m.name;
    nameEl.placeholder = t('presets.mark_name_ph');
    nameEl.setAttribute('aria-label', t('presets.field_name'));
    nameEl.disabled = this.lockedToPreset;
    /**
     * Held as it is typed, for the reason the badge below is — a rebuild that arrives while this field has
     * unsaved text in it fires no `change`, and the name would go the same silent way.
     *
     * **A name another mark has is refused**, the way a taken look is (`isMarkNameFree`): only a free one is held
     * while typing, and a finished one that is taken goes back to the name last saved.
     */
    let saved = m.name;
    const free = (name: string): boolean => isMarkNameFree(this.target.marks, name, m.id);
    nameEl.addEventListener('input', () => {
      if (free(nameEl.value)) m.name = nameEl.value.trim();
    });
    nameEl.addEventListener('change', () => {
      if (!free(nameEl.value)) {
        new Notice(t('presets.name_taken', { name: nameEl.value.trim() }));
        m.name = saved;
        nameEl.value = saved;
        return;
      }
      m.name = nameEl.value.trim();
      saved = m.name;
      // This path deliberately skips the re-render (see commit), so the title is synced by hand here.
      this.syncTitle();
      this.commit({ rerender: false });
    });

    const badgeRow = fields.createDiv({ cls: 'orbis-mark-editor-row' });
    badgeRow.createSpan({ text: t('presets.field_badge') });
    const badgeEl = badgeRow.createEl('input', { type: 'text', cls: 'orbis-mark-badge' });
    badgeEl.value = badgeOf(m);
    badgeEl.maxLength = BADGE_MAX;
    badgeEl.placeholder = t('presets.badge_ph');
    badgeEl.setAttribute('aria-label', t('presets.field_badge'));
    badgeEl.disabled = this.lockedToPreset;
    /** What the field says, onto the mark: blank (or the derived value typed out) means "derive it". */
    const takeBadge = (): void => {
      const v = badgeEl.value.trim();
      if (v && v !== defaultBadge(m)) m.badge = v;
      else delete m.badge;
    };
    /**
     * **Held as it is typed, saved when it is finished.**
     *
     * `change` fires on blur or Enter, and removing a focused input from the DOM fires nothing at all — so a
     * rebuild arriving while this field holds unsaved text would discard it silently, and the next appearance
     * change would then re-derive the badge exactly as if the reader had never typed one. `commit` is async and
     * renders when it resolves, so that rebuild can arrive a beat after the action that caused it rather than
     * from the click in front of you, which is why it is a race and not a reproducible sequence.
     *
     * Without this, the rule that protects a typed badge from an appearance change (`applyAppearance`) has nothing
     * to protect. `input` costs a property write per keystroke and no save.
     */
    badgeEl.addEventListener('input', takeBadge);
    badgeEl.addEventListener('change', () => {
      takeBadge();
      // Cleared → show the derived default it fell back to.
      badgeEl.value = badgeOf(m);
      this.commit({ rerender: false });
    });
    createCollapsibleNote(fields, t('presets.badge_hint'), t('presets.badge_hint_more'));

    // The two roles. Checkboxes rather than a picker per role: the question here is "does THIS mark do that
    // job", which is what the reader is looking at. Turning one on takes it from whichever mark had it —
    // they are pointers, so that is automatic rather than something to police.
    const roles = fields.createDiv({ cls: 'orbis-mark-roles' });
    roles.createDiv({ cls: 'orbis-mark-roles-heading', text: t('presets.roles_heading') });
    for (const role of ['note', 'audio'] as MarkRole[]) {
      const row = roles.createDiv({ cls: 'orbis-mark-role-row' });
      const label = row.createEl('label', { cls: 'orbis-mark-role-toggle' });
      const box = label.createEl('input', { type: 'checkbox' });
      box.checked =
        role === 'note'
          ? noteMark({ marks: this.target.marks, ...this.target.roles })?.id === m.id
          : audioMark({ marks: this.target.marks, ...this.target.roles })?.id === m.id;
      box.setAttribute('aria-label', t(ROLE_LABELS[role]));
      // Roles are the BOOK's, not the mark's definition, so they stay live even on a preset mark.
      // The same glyph that badges the holding mark in the list, so setting it here and recognizing it
      // there are one visual fact. Decorative — the label text beside it already names the role.
      const glyph = label.createSpan({ cls: 'orbis-mark-role-glyph' });
      setIcon(glyph, ROLE_ICONS[role]);
      glyph.setAttribute('aria-hidden', 'true');
      label.createSpan({ text: t(ROLE_LABELS[role]) });
      box.addEventListener('change', () => {
        this.target.setRole(role, box.checked ? m.id : undefined);
        this.commit({ usage: true });
      });
      row.createDiv({ cls: 'orbis-mark-role-hint', text: t(ROLE_HINTS[role]) });
    }
  }

  /**
   * What the mark LOOKS like: an independent highlighter channel and line channel, then the sample.
   *
   * Each channel is a checkbox plus its own controls, and the line's color palette only exists once a line
   * is chosen — so the common "highlighter only" mark stays short.
   */
  private renderAppearanceTab(fields: HTMLElement, m: BookMark): void {
    /** Apply a change, refusing one that would leave the mark invisible or duplicate another. */
    const change = (next: MarkAppearance): void => {
      if (!marksAnything(next)) {
        new Notice(t('presets.needs_one_channel'));
        this.render();
        return;
      }
      if (!isMarkAppearanceFree(this.target.marks, next, m.id)) {
        new Notice(t('presets.clash'));
        this.render();
        return;
      }
      applyAppearance(m, next);
      this.commit();
    };

    // ── Highlighter ──
    const hlRow = fields.createDiv({ cls: 'orbis-mark-channel-head' });
    const hlLabel = hlRow.createEl('label', { cls: 'orbis-mark-role-toggle' });
    const hlBox = hlLabel.createEl('input', { type: 'checkbox' });
    hlBox.checked = !!m.highlightColor;
    hlBox.disabled = this.lockedToPreset;
    hlBox.setAttribute('aria-label', t('presets.treatment_fill'));
    hlLabel.createSpan({ text: t('presets.treatment_fill') });
    hlBox.addEventListener('change', () => {
      change({ ...m, highlightColor: hlBox.checked ? (m.highlightColor ?? HIGHLIGHT_COLORS[0]) : undefined });
    });
    if (m.highlightColor) {
      renderPalette(
        fields.createDiv({ cls: 'orbis-palette-panel' }),
        {
          current: m.highlightColor,
          would: (hex) => ({ ...m, highlightColor: hex }),
          marks: this.target.marks,
          markId: m.id,
          disabled: this.lockedToPreset,
        },
        (hex) => change({ ...m, highlightColor: normalizeColor(hex) })
      );
    }

    // ── Treatment ──
    const trHead = fields.createDiv({ cls: 'orbis-mark-channel-head' });
    const trLabel = trHead.createEl('label', { cls: 'orbis-mark-role-toggle' });
    const trBox = trLabel.createEl('input', { type: 'checkbox' });
    trBox.checked = !!m.treatment;
    trBox.disabled = this.lockedToPreset;
    trBox.setAttribute('aria-label', t('presets.field_treatment'));
    trLabel.createSpan({ text: t('presets.field_treatment') });
    trBox.addEventListener('change', () => {
      change(
        trBox.checked
          ? { ...m, treatment: m.treatment ?? TREATMENTS[0], treatmentColor: m.treatmentColor ?? NEW_LINE_COLOR }
          : { ...m, treatment: undefined, treatmentColor: undefined }
      );
    });
    if (m.treatment) {
      const trSel = trHead.createEl('select', { cls: 'dropdown orbis-mark-treatment' });
      trSel.setAttribute('aria-label', t('presets.field_treatment'));
      for (const tr of TREATMENTS) {
        // Same rule as the palette: a treatment that would duplicate another mark is offered as unavailable rather
        // than accepted and then undone. A `<select>` grays a disabled option and refuses to select it, so the list
        // says which shapes are still free at the moment of choosing.
        const name = t(TREATMENT_KEYS[tr]);
        const taken = !isMarkAppearanceFree(this.target.marks, { ...m, treatment: tr }, m.id);
        const opt = trSel.createEl('option', {
          value: tr,
          text: taken ? t('presets.taken_option', { name }) : name,
        });
        opt.disabled = taken;
        if (tr === m.treatment) opt.selected = true;
      }
      trSel.addEventListener('change', () => change({ ...m, treatment: trSel.value as Treatment }));

      // Ink is a checkbox above the palette rather than a swatch inside it, because it answers a different
      // question: the swatches all answer "which color?", this answers "should we pick one at all?". As a
      // swatch it would also have to paint itself in something — `currentColor`, the dialog's own text — so it
      // would show white in a dark theme and be indistinguishable from Black in a light one, which is worse
      // than unclear. Above the palette, not below: a control that governs what follows sits on top.
      const inkOn = isInk(m.treatmentColor ?? NEW_LINE_COLOR);
      const behindInk = this.lastLineColor ?? MARK_PALETTE[0].hex;
      const inkLabel = fields.createEl('label', { cls: 'orbis-mark-role-toggle orbis-mark-ink-toggle' });
      const inkBox = inkLabel.createEl('input', { type: 'checkbox' });
      inkBox.checked = inkOn;
      // Ink is a color choice like any other, so it can be taken: another mark with this treatment already
      // following the page's text color. Unavailable rather than refused, as in the palette beside it.
      const inkTaken = !inkOn && !isMarkAppearanceFree(this.target.marks, { ...m, treatmentColor: INK }, m.id);
      inkBox.disabled = this.lockedToPreset || inkTaken;
      inkBox.setAttribute(
        'aria-label',
        inkTaken ? t('presets.taken_label', { name: t('presets.match_text_color') }) : t('presets.match_text_color')
      );
      if (inkTaken) inkLabel.addClass('is-taken');
      inkLabel.createSpan({ text: t('presets.match_text_color') });
      inkBox.addEventListener('change', () => {
        // Remember the color ink displaced, so unticking is a free thing to undo rather than a reset.
        if (inkBox.checked) this.lastLineColor = m.treatmentColor ?? this.lastLineColor;
        change({ ...m, treatmentColor: inkBox.checked ? INK : behindInk });
      });

      renderPalette(
        fields.createDiv({ cls: 'orbis-palette-panel' }),
        {
          // Ink is not a color the palette can show a ring on, so while it is on the palette displays the
          // color waiting behind it — grayed, because it is not in effect.
          current: inkOn ? behindInk : (m.treatmentColor ?? behindInk),
          would: (hex) => ({ ...m, treatmentColor: hex }),
          marks: this.target.marks,
          markId: m.id,
          // Locked grays these too — the gate's hint says "the disabled fields below explain why", and the
          // palette is one of those fields.
          disabled: inkOn || this.lockedToPreset,
        },
        (hex) => change({ ...m, treatmentColor: normalizeColor(hex) })
      );
    }

    // The sample LAST: it is the outcome of everything above, and shown in a line of prose on the live
    // reading surface so the judgment being made — "can I see this while reading?" — is the one on screen.
    const surface = readingSurface(this.plugin);
    const sample = fields.createDiv({ cls: 'orbis-mark-sample-block' });
    sample.style.setProperty('background-color', surface.bg);
    sample.style.setProperty('color', surface.fg);
    sample.style.setProperty('font-family', surface.font);
    sample.createSpan({ text: t('presets.sample_lead') });
    applyMarkPreview(sample.createSpan({ text: t('presets.sample_marked') }), m);
    sample.createSpan({ text: t('presets.sample_tail') });
  }
}

/** Opened from Settings → Notes & Export and from the command palette. `app` is unused but keeps the
 *  signature stable. */
/**
 * Open the manager. `scope: 'book'` for entry points that belong to a book on screen — the reader toolbar,
 * the mark bar's list, the listening view — since that is the context the reader is in and where the two
 * role assignments live. Settings and the command palette open on the shared library instead.
 */
export function openAnnotationPresets(
  _app: App,
  plugin: IOrbisReaderPlugin,
  scope: EditScope = 'preset',
  onClosed?: () => void
): void {
  new AnnotationPresetsModal(plugin, scope, onClosed).open();
}
