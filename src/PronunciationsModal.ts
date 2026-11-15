// The pronunciation glossary manager. A dialog rather than an inline settings list because the
// glossary grows without bound — a long list would dominate the Listening page — and because a modal
// can give each row real affordances (toggle / edit / delete) without cramping.
//
// Editing is delegated to the shared respelling form (pronunciation-editor.ts) — the same fields,
// validation and previews the lookup popup uses while reading, so behavior can't drift between the
// two entry points. Only the surface differs: an Obsidian Modal here, a floating popup there.

import { Notice, setIcon, setTooltip } from 'obsidian';
import { byName } from './by-name';
import { t } from './i18n';
import { OrbisModal } from './OrbisModal';
import { glossarySvg, PronunciationEditorModal } from './reader/tts/pronunciation-editor';
import type { PronunciationStore } from './reader/tts/pronunciation-service';
import { previewVoices } from './reader/tts/pronunciation-service';
import { isValidPronunciationSay, isValidPronunciationWord } from './reader/tts/pronunciations';
import type { IOrbisReaderPlugin } from './settings';
import { openOnRowTap } from './settings-row-tap';
import { createCollapsibleNote, pinModalAboveKeyboard, rebuildKeepingFocus } from './ui-utils';

export class PronunciationsModal extends OrbisModal {
  constructor(
    private readonly plugin: IOrbisReaderPlugin,
    private readonly store: PronunciationStore
  ) {
    super(plugin.app, { icon: glossarySvg() });
  }

  private unpin: () => void = () => {};
  /** Guards against a second editor for the same entry — see edit(). */
  private editorOpen = false;
  /** Live filter text. Doubles as the word to add — see the note on the field in render(). */
  private query = '';
  private listEl!: HTMLElement;
  private emptyEl!: HTMLElement;

  protected dialogTitle(): string {
    return t('pron_modal.title');
  }

  protected renderDialog(): void {
    this.modalEl.addClass('orbis-pron-modal');
    this.render();
    // The Add field sits in this dialog; without this the mobile keyboard covers it.
    // The plugin freezes the reader pane's heights while this is open — otherwise the keyboard collapses
    // it and leaves a black gap behind the dialog.
    // `reserve`: a list that GROWS, which is the shape the height cap serves worst — every entry added makes
    // the capped dialog show less of itself. The reserve adds room to scroll without capping anything.
    this.unpin = pinModalAboveKeyboard(this.modalEl, this.plugin, { layout: 'reserve' });
  }

  protected onDialogClose(): void {
    this.unpin();
  }

  /** An Obsidian Modal, not a createOrbisPopup: this dialog lives inside the Settings modal, and a
   *  body-attached popup would land outside its DOM, where Obsidian's focus containment makes the
   *  input impossible to type into. See the note atop pronunciation-editor.ts. */
  private edit(word: string, current: { say: string; enabled: boolean }): void {
    // One editor at a time. Without this, tapping Edit twice opens a second dialog for the same entry —
    // both editing the same mark, both able to save, last write silently winning. Worse on touch, where
    // the parent is repositioned when a child opens and the second tap lands before the first dialog is
    // visible.
    if (this.editorOpen) return;
    this.editorOpen = true;
    new PronunciationEditorModal(
      this.plugin,
      {
        voices: () => previewVoices(this.plugin),
        pauseAudio: () => this.plugin.pauseListening(),
        upsert: (w, say, enabled) => this.store.upsert(w, say, enabled),
        remove: (w) => this.store.remove(w),
      },
      word,
      current,
      () => this.render(),
      () => {
        this.editorOpen = false;
      }
    ).open();
  }

  /** Through the shared helper, so a rebuild keeps the keyboard where it was and blurs only its own control. */
  private render(): void {
    rebuildKeepingFocus(this.contentEl, () => this.build());
  }

  private build(): void {
    const body = this.contentEl;
    // Preserve scroll across the rebuild; the blur is `rebuildKeepingFocus`'s, scoped to this dialog.
    const top = body.scrollTop;
    body.empty();

    createCollapsibleNote(body, t('pron_modal.desc'), t('pron_modal.desc_more'));

    // ONE field for both finding and adding, rather than a separate search box. It already meant
    // "find or add": submit() looks the word up and opens the existing entry when there is one, so
    // filtering as you type is the same question asked earlier. It also heads off the duplicate you'd
    // otherwise create by adding a word that is already in the list under different capitalization.
    //
    // Add row FIRST: on mobile the keyboard covers the bottom of the dialog, so a field at the end is
    // unreachable exactly when it's in use. Only the word is asked for here — Add opens the editor, so
    // a new entry gets the same preview-before-you-save flow as an edit.
    const add = body.createDiv({ cls: 'orbis-pron-add' });
    const input = add.createEl('input', { type: 'text', cls: 'orbis-input-full' });
    input.placeholder = t('pron_modal.find_or_add_ph');
    input.value = this.query;
    const submit = () => {
      const word = input.value.trim();
      if (!isValidPronunciationWord(word)) {
        new Notice(t('listening_page.pron_bad_word'));
        input.focus();
        return;
      }
      const existing = this.store.find(word);
      // Clear the filter as well as the field: after adding a word you want the whole list back, and
      // leaving it filtered to the word just handled hides everything else.
      this.query = '';
      input.value = '';
      this.edit(existing?.word ?? word, { say: existing?.say ?? '', enabled: existing?.enabled ?? true });
    };
    // Only the rows are rebuilt per keystroke — a full render() would replace this very input and take
    // the focus and caret with it.
    input.addEventListener('input', () => {
      this.query = input.value;
      this.renderRows();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submit();
      }
    });
    add.createEl('button', { cls: 'mod-cta', text: t('action.add') }).addEventListener('click', submit);

    this.listEl = body.createDiv({ cls: 'orbis-pron-list orbis-list-box' });
    this.emptyEl = body.createDiv({ cls: 'orbis-lookup-status' });
    this.renderRows();

    body.scrollTop = top;
    // Guard against a stored entry whose replacement was emptied by hand-editing data.json.
    if (this.store.list().some((e) => !isValidPronunciationSay(e.say))) {
      body.createDiv({ cls: 'orbis-lookup-status', text: t('pron_modal.invalid_note') });
    }
  }

  /** The rows only — cheap enough to run per keystroke, and it leaves the search field alone. */
  private renderRows(): void {
    this.listEl.empty();
    const all = this.store.list();
    const q = this.query.trim().toLowerCase();
    // Matches the respelling too, not just the word: "which words did I spell with -toy-?" is a real
    // question once the glossary is long, and it costs nothing to answer.
    const matching = q ? all.filter((e) => e.word.toLowerCase().includes(q) || e.say.toLowerCase().includes(q)) : all;
    // **Alphabetical, and only here.** The order entries were added in is no order at all once there are thirty
    // of them: the question this list answers is "is X in here, and what does it say", which is a lookup. Sorted
    // for the eye rather than in the store, because the stored sequence is not ours to rearrange — the glossary
    // file is synced and diffed between devices, and reordering it would rewrite every line of a file the reader
    // may be reading. Nothing downstream cares: `compilePronouncer` sorts by length for its own reasons.
    const entries = byName(matching, (e) => e.word);

    // Three distinct empty states: nothing added yet, nothing matching, or rows to show.
    if (!all.length) this.emptyEl.setText(t('listening_page.pron_empty'));
    else if (!entries.length) this.emptyEl.setText(t('pron_modal.no_match', { query: this.query.trim() }));
    else this.emptyEl.setText('');
    this.emptyEl.toggle(!entries.length);

    if (entries.length) {
      // Header row — a bare checkbox column doesn't say what it does.
      const head = this.listEl.createDiv({ cls: 'orbis-pron-row orbis-pron-head' });
      head.createDiv({ cls: 'orbis-pron-row-text', text: t('pron_modal.col_word') });
      head.createDiv({ cls: 'orbis-pron-row-active', text: t('pron_modal.col_active') });
      head.createDiv({ cls: 'orbis-pron-row-actions' });
    }

    const list = this.listEl;
    for (const entry of entries) {
      const row = list.createDiv({ cls: 'orbis-pron-row' });
      const text = row.createDiv({ cls: 'orbis-pron-row-text' });
      text.createDiv({ cls: 'orbis-pron-row-word', text: entry.word });
      text.createDiv({ cls: 'orbis-pron-row-say', text: entry.say });
      /**
       * **Tapping the word opens it, as tapping a row does everywhere else.** The pencil is the affordance and the
       * keyboard's path; this is the shortcut a thumb expects from a wide row with a small button at the end. Bound
       * to the text cell rather than the row, so a tap meant for the checkbox or the trash is not also an edit.
       */
      openOnRowTap({ settingEl: text }, () => this.edit(entry.word, { say: entry.say, enabled: entry.enabled }));
      if (!entry.enabled) row.addClass('is-off');

      const activeCell = row.createDiv({ cls: 'orbis-pron-row-active' });
      const on = activeCell.createEl('input', { type: 'checkbox', cls: 'orbis-pron-row-check' });
      on.checked = entry.enabled;
      on.setAttribute('aria-label', t('pron_modal.toggle', { word: entry.word }));
      on.addEventListener('change', () => {
        void (async () => {
          await this.store.setEnabled(entry.word, on.checked);
          this.render();
        })();
      });

      /**
       * **A pencil and a trash, like every other list.** The words "Edit" and "Delete" would be a third idiom for
       * the two actions the dashboards, collections, fields, marks and destinations lists all draw as icons — and
       * two labeled buttons per row put more furniture beside a word than the word itself.
       *
       * Real `<button>`s wearing `clickable-icon`, named by `aria-label`, which is what `iconButton` builds for the
       * rows that go through Obsidian's `Setting`; this list is a grid of its own, so it builds them directly.
       */
      const actions = row.createDiv({ cls: 'orbis-pron-row-actions' });
      const edit = actions.createEl('button', {
        cls: 'clickable-icon',
        attr: { type: 'button', 'aria-label': t('listening_page.pron_edit') },
      });
      setIcon(edit, 'pencil');
      setTooltip(edit, t('listening_page.pron_edit'));
      edit.addEventListener('click', () => this.edit(entry.word, { say: entry.say, enabled: entry.enabled }));
      const del = actions.createEl('button', {
        cls: 'clickable-icon',
        attr: { type: 'button', 'aria-label': t('action.delete') },
      });
      setIcon(del, 'trash');
      setTooltip(del, t('action.delete'));
      del.addEventListener('click', () => {
        void (async () => {
          await this.store.remove(entry.word);
          this.render();
        })();
      });
    }
  }
}
