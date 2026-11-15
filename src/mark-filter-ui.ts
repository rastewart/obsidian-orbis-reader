// The mark filter's two controls, shared by every surface that offers one: the chips that say what is chosen, and
// the list you choose from.
//
// **Shared rather than copied**, because copies of a control drift until the same three buttons look slightly
// different in every dialog — the same reason `reorderControls` and `.orbis-small-btn` are shared. Advanced search
// and the export dialogs need the same thing and must not grow a second version of it.
//
// **The LIST is shared, the hosting is not.** Advanced search swaps its whole stage to show the picker, which it can
// do because a stage is all it has. An export dialog cannot: swapping its stage would take away the form the filter
// belongs to. So both draw the same rows into a container of their own choosing — a stage in one case, a child
// dialog in the other — and the seam sits at the container rather than at the screen.

import { setIcon } from 'obsidian';
import type { AnnotationMark } from './annotation-presets';
import { NO_MARK } from './mark-filter';
import { applyMarkPreview } from './ui-utils';

export interface MarkPillLabels {
  /** What one `Aa` sample says, for the preview span. */
  sample: string;
  /** The name shown for the "carries no mark" row. */
  noMark: string;
  /** The name shown for a mark the reader never named. */
  unnamed: string;
}

/**
 * One `Aa Name` pill.
 *
 * **The name matters, and is not decoration.** Two marks can share a color and a treatment, so a control labeled
 * only by its appearance is unusable by a screen reader and ambiguous to everyone else.
 */
function markPill(
  parent: HTMLElement,
  id: string,
  cls: string,
  marks: ReadonlyMap<string, AnnotationMark>,
  labels: MarkPillLabels
): HTMLElement {
  const pill = parent.createDiv({ cls });
  const mark = marks.get(id);
  if (mark) applyMarkPreview(pill.createSpan({ text: labels.sample }), mark);
  pill.createSpan({
    cls: 'orbis-adv-mark-name',
    text: mark ? mark.name || labels.unnamed : labels.noMark,
  });
  return pill;
}

/** The name a chosen mark goes by, for an `aria-label` that has to say which one it removes. */
function markLabel(id: string, marks: ReadonlyMap<string, AnnotationMark>, labels: MarkPillLabels): string {
  const mark = marks.get(id);
  return mark ? mark.name || labels.unnamed : labels.noMark;
}

export interface MarkChoiceListSpec {
  /** Every mark the book uses, in the preset's order. The "no mark" row is added by `usage`, not by this. */
  inUse: readonly AnnotationMark[];
  /** How many annotations carry each key — `markUsage`. Only keys present here are offered. */
  usage: ReadonlyMap<string, number>;
  marks: ReadonlyMap<string, AnnotationMark>;
  /** The draft set this list ticks and unticks. Mutated in place; the caller owns it. */
  chosen: Set<string>;
  labels: MarkPillLabels & {
    /** `{{count}} in this book`, already interpolated by the caller for each row. */
    count: (n: number) => string;
    /** Shown instead of the list when the book carries no marks at all. */
    empty: string;
  };
  /** Called after a row is ticked — the caller redraws whatever depends on the choice. */
  onToggle: () => void;
}

/**
 * The rows you choose marks from: a pill, how much of the book carries it, and a tick.
 *
 * **"No mark" leads.** It is the group a filter would otherwise drop in silence — filter to *Key point* and every
 * unmarked highlight vanishes with no row on screen to say so — and "only the ones I never marked" is a real thing
 * to want.
 */
export function renderMarkChoiceList(parent: HTMLElement, spec: MarkChoiceListSpec): void {
  const rows: { id: string; count: number }[] = [
    ...(spec.usage.has(NO_MARK) ? [{ id: NO_MARK, count: spec.usage.get(NO_MARK) ?? 0 }] : []),
    ...spec.inUse.map((m) => ({ id: m.id, count: spec.usage.get(m.id) ?? 0 })),
  ];
  if (!rows.length) parent.createDiv({ cls: 'orbis-adv-mark-hint', text: spec.labels.empty });

  const list = parent.createDiv({ cls: 'orbis-adv-mark-list' });
  /**
   * **Up and down walk the list, as well as Tab.**
   *
   * Every row is a real button, so Tab already reached them — but a list of nine marks is a list, and the arrow keys
   * are what a reader reaches for in one. Home and End go to the ends, which is the point of them in a list long
   * enough to scroll. Tab still works and still leaves; nothing here is a roving stop.
   */
  list.addEventListener('keydown', (e) => {
    const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
    if (!keys.includes(e.key) || e.shiftKey) return;
    const all = Array.from(list.querySelectorAll<HTMLElement>('.orbis-adv-mark-row'));
    const at = all.indexOf(list.ownerDocument.activeElement as HTMLElement);
    if (at === -1) return;
    const to = e.key === 'Home' ? 0 : e.key === 'End' ? all.length - 1 : e.key === 'ArrowDown' ? at + 1 : at - 1;
    const target = all[Math.max(0, Math.min(all.length - 1, to))];
    if (!target) return;
    e.preventDefault();
    e.stopPropagation();
    target.focus();
  });

  for (const { id, count } of rows) {
    const row = list.createEl('button', {
      cls: 'orbis-adv-mark-row',
      // Keyed by the mark, because choosing one redraws this list: the row the reader pressed is destroyed and
      // rebuilt, and without a key the restore has only a position to go on.
      attr: { type: 'button', 'aria-pressed': String(spec.chosen.has(id)), 'data-orbis-focus': `mark:${id}` },
    });
    markPill(row, id, 'orbis-adv-mark-rowmain', spec.marks, spec.labels);
    row.createSpan({ cls: 'orbis-adv-mark-count', text: spec.labels.count(count) });
    const tick = row.createSpan({ cls: 'orbis-adv-mark-tick' });
    if (spec.chosen.has(id)) setIcon(tick, 'check');
    row.toggleClass('is-active', spec.chosen.has(id));
    row.addEventListener('click', () => {
      if (spec.chosen.has(id)) spec.chosen.delete(id);
      else spec.chosen.add(id);
      spec.onToggle();
    });
  }
}

export interface MarkChipsSpec {
  chosen: ReadonlySet<string>;
  /** The preset's order, so two runs that chose the same marks read the same way. */
  order: readonly AnnotationMark[];
  marks: ReadonlyMap<string, AnnotationMark>;
  labels: MarkPillLabels & {
    /**
     * Shown in place of chips when nothing is chosen — and OPTIONAL, because not every host needs it.
     *
     * The advanced search has no header to carry the answer, so this line is the only thing that says the filter is
     * off. A fold whose header already reads "Every mark" would be saying it twice, four lines apart and in
     * different words.
     */
    any?: string;
    /** `aria-label` for a chip's ×, given the mark's name. */
    remove: (name: string) => string;
  };
  onRemove: (id: string) => void;
  /**
   * Where the keyboard goes after a chip is removed, as the focus key of the button that adds another.
   *
   * **Here rather than in each `onRemove`, because forgetting it is invisible.** Removing a chip repaints the host,
   * which destroys the `×` that was focused — and an `×` has no key of its own, so the restore has only a DOM path,
   * the path no longer resolves, and focus falls through to "the first control in the surface". In practice that
   * means the top of the dialog: press × and the keyboard jumps to the style dropdown. The button offering to add
   * another mark is the honest landing, since the thing that was focused is gone.
   *
   * `root` is the surface to look in once the host has rebuilt — the container that survives its own redraw.
   */
  landing?: { key: string; root: () => HTMLElement | null };
}

/**
 * What is chosen, as removable chips — or a line saying nothing is.
 *
 * The chips are in the PRESET's order rather than the order they were ticked, for the same reason the fold header
 * is: the same choice has to read the same way however it was arrived at.
 */
export function renderMarkChips(parent: HTMLElement, spec: MarkChipsSpec): void {
  if (!spec.chosen.size) {
    if (spec.labels.any) parent.createDiv({ cls: 'orbis-adv-mark-hint', text: spec.labels.any });
    return;
  }
  const ordered = [
    ...(spec.chosen.has(NO_MARK) ? [NO_MARK] : []),
    ...spec.order.filter((m) => spec.chosen.has(m.id)).map((m) => m.id),
  ];
  // Bounded and scrolling: ten chosen marks must not push the dialog's buttons off the screen.
  const chips = parent.createDiv({ cls: 'orbis-adv-mark-chips' });
  for (const id of ordered) {
    const chip = markPill(chips, id, 'orbis-adv-mark-chip', spec.marks, spec.labels);
    const x = chip.createEl('button', {
      cls: 'orbis-adv-mark-x',
      attr: { type: 'button', 'aria-label': spec.labels.remove(markLabel(id, spec.marks, spec.labels)) },
    });
    setIcon(x, 'x');
    x.addEventListener('click', () => {
      spec.onRemove(id);
      // After the host's redraw, not before: the button being landed on is one the rebuild has just replaced.
      const { key, root } = spec.landing ?? {};
      if (key && root) root()?.querySelector<HTMLElement>(`[data-orbis-focus="${key}"]`)?.focus();
    });
  }
}
