// "Marks for listening and notes": the two marks a book uses by default, picked in one place.
//
// **Why this exists beside the Marks dialog.** The full-screen player's Aa button is there so a reader can change
// which mark a note gets and which mark "Mark the passage" applies — and in the whole Marks dialog that is a mark row,
// its pencil, the General tab and a checkbox, for each of the two. Here it is two choices. The Marks dialog is one
// button away for everything else.
//
// **The book's choice, not its preset's.** The two pointers live on the book's copy (`noteMarkId`, `audioMarkId`):
// copied from the preset when it was assigned, and the book's to change after that — "the preset owns what a mark IS,
// the book owns how it's USED". So nothing here needs a preset mark copied into the book first.

import { setIcon } from 'obsidian';
import { type BookMark, offeredMarks } from './annotation-presets';
import { actionRow } from './controls';
import { t } from './i18n';
import type { OrbisReaderView } from './OrbisReaderView';
import type { IOrbisReaderPlugin } from './settings';
import { annotationsSvg } from './system-glyphs';
import { applyMarkPreview, createOrbisPopup } from './ui-utils';

/** Which pointer a row sets, and the glyph the Edit mark dialog and the player already give it. */
type Role = { key: 'noteMarkId' | 'audioMarkId'; label: string; icon: string };

export function openMarkRoles(view: OrbisReaderView, plugin: IOrbisReaderPlugin): void {
  const { popupEl, close, reposition } = createOrbisPopup(view, {
    scrollsInside: true, // Done sits outside the scroll region — see below
    title: t('mark_roles.title'),
    icon: annotationsSvg(16),
    dismissOnOutsideClick: true,
    /**
     * **The whole screen on a phone, from the start** — sized to its content, the dialog would jump every time a
     * list opened, and the lists would run it off the bottom with Done beneath them. No text field, so no
     * keyboard to reserve the lower half against — the same two answers the marks bar's list gives.
     */
    mobileFillHeight: true,
    // And a DEFINITE height: `mobileFillHeight` only lifts the cap to the whole screen, so the popup would still shrink
    // to its content — on Android, stopping under Done. This is what holds it at that height.
    mobileFillAvailable: true,
    lockMobileHeights: false,
    mobileMaxWidth: 480,
    desktopWidth: 'min(440px, 92vw)',
  });
  /**
   * **Done in a layer of its own, always on screen.** `createOrbisPopup` makes the popup itself the scroller, which
   * would scroll Done away under an open list. So the popup `scrollsInside`: the body scrolls in the space left, the
   * footer holds its ground — the shape Save as PDF and Generate notes use.
   */
  const body = popupEl.createDiv({ cls: 'orbis-popup-scroll' });
  const book = plugin.activeBookForPresets()?.preset ?? null;
  const marks = book ? offeredMarks(book) : [];
  if (!book || !marks.length) {
    body.createEl('p', { cls: 'orbis-lookup-status', text: t('mark_roles.no_marks') });
  } else {
    body.createEl('p', { text: t('mark_roles.intro') });
    // Mark the passage first: this is the listening player's dialog, and that is the button beside it.
    const roles: Role[] = [
      { key: 'audioMarkId', label: t('mark_roles.passage'), icon: 'headphones' },
      { key: 'noteMarkId', label: t('presets.role_note'), icon: 'pencil' },
    ];
    // Only one list open at a time: opening either collapses the other.
    const collapsers: (() => void)[] = [];
    for (const role of roles) {
      const collapse = roleField(
        body,
        role,
        marks,
        book[role.key],
        plugin,
        () => {
          for (const c of collapsers) if (c !== collapse) c();
        },
        reposition
      );
      collapsers.push(collapse);
    }
  }
  // The rest of what marks can do — adding, editing, presets — without a second trip to the player.
  body
    .createEl('button', { cls: 'orbis-cmd-btn', text: t('annotation_picker.manage_marks') })
    .addEventListener('click', () => {
      close();
      // Back here when the Marks dialog closes — this is where the reader was — drawn fresh, since marks may have been
      // added, changed or turned off in there. Not if the book closed meanwhile: there is nothing left to pick for.
      view.openAnnotationPresets(() => {
        if (view.file) openMarkRoles(view, plugin);
      });
    });
  // Each choice is saved as it is made, so the dialog ends with Done rather than Cancel and Apply.
  const footer = actionRow(popupEl, { placement: 'footer' });
  footer.createEl('button', { cls: 'mod-cta', text: t('action.done') }).addEventListener('click', () => close());
}

/**
 * One role: its name with its glyph, and under it the mark it uses, drawn as the marks bar draws one — the formatted
 * `Aa` beside the name. Selecting it opens the list of marks in place.
 *
 * **Not a native dropdown**, which can hold only text: a mark is chosen by how it looks at least as much as by its
 * name. **Stacked**, label over control, so a long mark name has the dialog's width on a phone.
 * **In place, not a second popup**, so there is one surface to dismiss and nothing to stack above the player.
 *
 * **Notes can be None; Mark the passage cannot.** An unset note mark means a new note gets no color — a state the
 * reader can want — while an unset passage mark falls back to the first mark (`audioMark`), so it is shown as that.
 *
 * @returns a function that collapses this role's list, for when the other one opens.
 */
function roleField(
  parent: HTMLElement,
  role: Role,
  marks: readonly BookMark[],
  pinned: string | undefined,
  plugin: IOrbisReaderPlugin,
  onOpen: () => void,
  /** The popup measures itself once; a list opening or closing changes its height on a desktop. */
  reposition: () => void
): () => void {
  const isNote = role.key === 'noteMarkId';
  const field = parent.createDiv({ cls: 'orbis-mark-role-field' });
  const label = field.createDiv({ cls: 'orbis-mark-role-label' });
  setIcon(label.createSpan({ cls: 'orbis-mark-role-icon' }), role.icon);
  label.createSpan({ text: role.label });

  // A pointer at a mark the book no longer offers reads as unset, as the resolvers treat it.
  let chosen: BookMark | undefined = marks.find((m) => m.id === pinned) ?? (isNote ? undefined : marks[0]);
  const btn = field.createEl('button', {
    cls: 'orbis-mark-role-select',
    attr: { type: 'button', 'aria-haspopup': 'listbox', 'aria-expanded': 'false', 'aria-label': role.label },
  });
  // `orbis-list-box`: the one list treatment, the chapter list's — recessed ground, border, hairlines between rows.
  const list = field.createDiv({
    cls: 'orbis-list-box orbis-mark-pick-list orbis-mark-role-list',
    attr: { role: 'listbox' },
  });
  list.hide();

  /**
   * The formatted sample and the name — the same pair on the button and on every row, in the same fixed-width sample
   * column, so the names line up. No mark is the note editor's ×-in-a-circle and its word, "Unmarked": an item in the
   * list like the others rather than a bare word with nothing in the sample column.
   */
  const drawChoice = (el: HTMLElement, m: BookMark | undefined): void => {
    const sample = el.createSpan({ cls: 'orbis-mark-role-sample' });
    if (m) {
      sample.setText(t('annotation_picker.mark_sample'));
      applyMarkPreview(sample, m);
    } else {
      sample.addClass('orbis-mark-role-none');
      setIcon(sample, 'x');
    }
    el.createSpan({
      cls: 'orbis-mark-role-name',
      text: m ? m.name || t('presets.unnamed_mark') : t('presets.no_mark'),
    });
  };
  const paintButton = (): void => {
    btn.empty();
    drawChoice(btn, chosen);
    setIcon(btn.createSpan({ cls: 'orbis-mark-role-chevron' }), 'chevron-down');
  };
  const collapse = (): void => {
    if (!list.isShown()) return;
    list.hide();
    btn.setAttribute('aria-expanded', 'false');
    reposition();
  };
  const choose = async (m: BookMark | undefined): Promise<void> => {
    chosen = m;
    paintButton();
    collapse();
    btn.focus();
    // A fresh copy each time: the book's marks may have changed under this dialog since it was drawn.
    const next = plugin.activeBookForPresets()?.preset;
    if (!next) return;
    next[role.key] = m?.id;
    await plugin.saveActiveBookPreset(next);
  };

  const options: (BookMark | undefined)[] = [...(isNote ? [undefined] : []), ...marks];
  const rows = options.map((m) => {
    const row = list.createEl('button', { cls: 'orbis-mark-pick-row', attr: { type: 'button', role: 'option' } });
    drawChoice(row, m);
    // The list's own mark for the current choice, flush right — shown by `.is-current`, set when the list opens.
    setIcon(row.createSpan({ cls: 'orbis-mark-role-check' }), 'check');
    row.addEventListener('click', () => void choose(m));
    return row;
  });
  // Up and down walk the rows, as in the marks bar's list.
  list.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const i = rows.findIndex((r) => r === activeDocument.activeElement);
    rows[Math.max(0, Math.min(rows.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]?.focus();
    e.preventDefault();
  });

  btn.addEventListener('click', () => {
    if (list.isShown()) {
      collapse();
      return;
    }
    onOpen();
    rows.forEach((r, i) => r.toggleClass('is-current', options[i] === chosen));
    list.show();
    btn.setAttribute('aria-expanded', 'true');
    reposition();
    list.scrollIntoView({ block: 'nearest' });
    // On the current choice, the row a reader arriving here is comparing everything against.
    (rows.find((r) => r.hasClass('is-current')) ?? rows[0])?.focus();
  });
  paintButton();
  return collapse;
}
