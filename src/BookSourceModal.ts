// Add or edit one book source: what to call it, where it is, and who you are to it.
//
// **A dialog rather than an inline row**, for the reason the look-up destinations and the collections use one: a source
// is four fields, one of which is a URL that runs past the width of a settings row, and one of which is a password that
// must never be drawn as ordinary text.
//
// **A built-in's name and URL are shown and frozen.** They are ours to keep correct — Gutenberg expects to sunset the
// endpoint one of them points at — so a reader who edited one would be holding a copy that our fix could never reach.
// Its credential is still theirs to set: who a reader signs in as is a fact about them rather than about the endpoint.
//
// See docs/design/book-sources.md.

import { type App, Notice, Setting, type TextComponent } from 'obsidian';
import { actionButton, actionRow } from './controls';
import { t } from './i18n';
import { OrbisModal } from './OrbisModal';
import type { BookSource } from './settings';
import { languagesFor, takesLanguage } from './sources/quirks';
import { isUsableSourceUrl, readPassword, readUsername, saveCredential } from './sources/sources';
import { BOOK_SOURCES_SVG } from './system-glyphs';
import { pinModalAboveKeyboard } from './ui-utils';

/**
 * What the dialog answers with.
 *
 * **No credential is in here, and that is a property worth keeping.** This object is built from settings state and
 * flows back into it, so a password on it would be one careless spread away from `data.json`. The dialog writes both
 * halves to `secretStorage` itself, under the id it was given.
 */
export interface BookSourceEdit {
  name: string;
  url: string;

  language: string;
}

export class BookSourceModal extends OrbisModal {
  private name: string;
  private url: string;

  private language: string;

  /**
   * Both halves of the credential, held here until Save.
   *
   * **Not written on every keystroke**, which would make a new source impossible to sign into — there is no id to key
   * a secret under until the source exists, and a dialog saying "save it first, then reopen it" is a dialog asking to
   * be visited twice.
   *
   * Holding them makes the whole form obey its own buttons: Cancel cancels an edited password too, and nothing is
   * written for a source that was never created. `sourceId` is what makes that possible — the caller mints the id
   * before opening the dialog rather than when saving it, so the keys exist from the start.
   */
  private username: string;
  private readonly heldUsername: string;
  /**
   * **The saved password is never read into the dialog** — only whether there is one. Typed here is a new password;
   * left empty keeps the saved one; **Remove password** removes it. So nobody at an unlocked device can open a feed
   * and read its password with the eye, and nothing on the page holds it. See `CredentialEdit`.
   */
  private typedPassword = '';
  private readonly passwordSaved: boolean;
  private removingPassword = false;

  constructor(
    app: App,
    private readonly source: BookSource | null,
    /** The id this source has, or the one it will be created with. Names its secrets either way. */
    private readonly sourceId: string,
    private readonly onConfirm: (values: BookSourceEdit) => void
  ) {
    super(app, { compact: true, icon: BOOK_SOURCES_SVG });
    this.name = source?.name ?? '';
    this.url = source?.url ?? '';
    this.language = source?.language ?? '';
    this.heldUsername = readUsername(app, { id: sourceId });
    this.passwordSaved = readPassword(app, { id: sourceId }) !== '';
    this.username = this.heldUsername;
  }

  private get locked(): boolean {
    return this.source?.builtin === true;
  }

  protected dialogTitle(): string {
    return this.source ? t('book_sources_page.edit_source') : t('book_sources_page.add_source');
  }

  /**
   * **`reserve`, because this is a form you work down.** Six rows — name, address, language, the read-only id,
   * username, password — and the two credential fields are the LAST of them. Tapping the username on a phone would
   * raise the keyboard straight over it and over Save, with nothing below to scroll into view.
   *
   * The default `lift` is wrong here for the reason `pinModalAboveKeyboard` gives: it caps the dialog at the
   * keyboard-safe zone, which halves a six-row form and never gives the space back. `reserve` keeps the shape the
   * dialog opened at and puts the keyboard's share below the last field. Same call, and same reasoning, as the
   * device setup dialog and the EPUB export stages.
   */
  private unpin: (() => void) | null = null;

  protected onDialogClose(): void {
    this.unpin?.();
    this.unpin = null;
  }

  protected renderDialog() {
    const { contentEl } = this;
    this.unpin = pinModalAboveKeyboard(this.modalEl, undefined, { layout: 'reserve' });
    // A column of fields: each label above its input, each input the full width. An OPDS URL runs to seventy
    // characters and is the field you most need to read while editing it.
    this.modalEl.addClass('orbis-form-dialog');
    // Frozen values have to read as values rather than as placeholders — the same rule the provided dashboard's
    // read-only dialog needed. See `.orbis-frozen-dialog`.
    if (this.locked) this.modalEl.addClass('orbis-frozen-dialog');

    const field = (name: string, desc: string | undefined, build: (txt: TextComponent) => void): Setting => {
      const row = new Setting(contentEl).setName(name);
      if (desc) row.setDesc(desc);
      row.settingEl.addClass('orbis-setting-stacked');
      row.addText((txt) => {
        txt.inputEl.addClass('orbis-input-full');
        build(txt);
      });
      return row;
    };

    if (this.locked) {
      contentEl.createDiv({ cls: 'orbis-rules-hint', text: t('book_sources_page.builtin_hint') });
    }

    field(t('book_sources_page.source_name'), undefined, (txt) => {
      txt.setValue(this.name).onChange((v) => (this.name = v));
      if (this.locked) txt.inputEl.disabled = true;
      else window.setTimeout(() => txt.inputEl.focus(), 50);
    });

    field(t('book_sources_page.source_url'), t('book_sources_page.source_url_desc'), (txt) => {
      // i18n-audit-disable-next-line -- example URL, not translatable copy
      txt.setPlaceholder('https://example.com/opds/catalog.xml');
      txt.setValue(this.url).onChange((v) => (this.url = v));
      if (this.locked) txt.inputEl.disabled = true;
    });

    // **Only for a catalog that can be asked.** Gutenberg takes filter terms in its query — `l.en` — and a search for
    // "Finn" without one comes back mostly Finnish. A Calibre server holds what its owner put in it and has no such
    // syntax, so the row is absent there rather than present and inert. See `takesLanguage`.
    if (takesLanguage(this.url)) {
      const row = new Setting(contentEl)
        .setName(t('book_sources_page.source_language'))
        .setDesc(t('book_sources_page.source_language_desc'));
      row.settingEl.addClass('orbis-setting-stacked');
      row.addDropdown((dd) => {
        // Empty is its own answer, and the default: a catalog holding seventy languages is a catalog somebody may want
        // all of.
        dd.addOption('', t('book_sources_page.language_any'));
        for (const code of languagesFor(this.url)) dd.addOption(code, languageName(code));
        // A code stored from a hand-edited `data.json`, or one we have since stopped offering, still belongs in its own
        // dropdown — otherwise opening this dialog would silently change what the source asks for.
        if (this.language && !languagesFor(this.url).includes(this.language)) {
          dd.addOption(this.language, languageName(this.language));
        }
        dd.setValue(this.language).onChange((v) => (this.language = v));
      });
    }

    /**
     * **The id, read-only** — because it is what names this source's credentials in Obsidian's own secret list, and a
     * reader looking at `orbis-book-source-catalog-mt4ml76q…-password` has no other way to tell which catalog it
     * belongs to. Selectable so it can be copied, and a field rather than a line of text so it can be reached from a
     * keyboard. **Only when editing**: a source being added has an id, but nothing in the Keychain to match it
     * against yet, so the row would be a machine string answering a question nobody has asked.
     */
    if (this.source) {
      const id = this.sourceId;
      field(t('book_sources_page.source_id'), t('book_sources_page.source_id_desc'), (txt) => {
        txt.setValue(id);
        txt.inputEl.readOnly = true;
        txt.inputEl.addClass('orbis-readonly-field');
        txt.inputEl.setAttribute('aria-label', t('book_sources_page.source_id'));
        txt.inputEl.addEventListener('focus', () => txt.inputEl.select());
      });
    }

    /**
     * **One credential pair, in the dialog that creates the source as much as the one that edits it.** Neither half
     * reaches `data.json`: both are held in this dialog and written to `secretStorage` by `save`, keyed by the id the
     * caller minted — which is why neither is part of `BookSourceEdit`. See `usernameIdFor`.
     *
     * Both halves are optional and both may be blank: a public feed needs neither, Calibre needs both, and Standard
     * Ebooks' membership feed needs an email address with a BLANK password, which is a real shape rather than an
     * incomplete one. So nothing here refuses to save for being empty.
     */
    field(t('book_sources_page.source_user'), t('book_sources_page.source_user_desc'), (txt) => {
      txt.setValue(this.username).onChange((v) => (this.username = v));
    });

    /**
     * **A masked field of our own, not Obsidian's `SecretComponent`.** That component's value is the *id* of a secret
     * the reader has linked — `setValue(id)` shows a peek of it, and its picker reports the id it chose — so the row
     * it draws is "link one of the vault's named secrets to this setting". Two things are wrong with that here: it
     * asks a reader to name and manage a keychain entry for one Calibre password, and it leaves the username nowhere,
     * since a picker has nothing to say about one. Both halves of a credential belong in the dialog for the source
     * they authenticate, typed the same way. `writePassword` puts the plaintext in `app.secretStorage` — the same
     * store, the same protection; only the widget is ours.
     *
     * **The reveal is not a luxury.** There is no confirm field, nothing else displays the value, and the only other
     * report of a typo is a 401 from the catalog. It shows only what is typed here: a saved password never reaches the
     * field to be shown.
     */
    const saved = (): boolean => this.passwordSaved && !this.removingPassword;
    const describe = (): string =>
      this.removingPassword
        ? t('book_sources_page.source_password_removing_desc')
        : saved()
          ? t('book_sources_page.source_password_saved_desc')
          : t('book_sources_page.source_password_desc');
    const row = field(t('book_sources_page.source_password'), describe(), (txt) => {
      // Dots as a PLACEHOLDER where a password is saved: they say one is there, vanish as you type, and are not it.
      txt.setPlaceholder(saved() ? '••••••••' : '').onChange((v) => (this.typedPassword = v));
      txt.inputEl.type = 'password';
      txt.inputEl.autocomplete = 'off';
    });
    const input = row.controlEl.querySelector('input');
    if (input) this.addReveal(row, input);
    // **Its own button, because an empty field now means "keep it".** Shown only where there is something to remove;
    // Cancel undoes it like any other change in the dialog.
    if (input && this.passwordSaved) {
      row.addButton((btn) => {
        btn.setButtonText(t('book_sources_page.remove_password')).onClick(() => {
          this.removingPassword = true;
          this.typedPassword = '';
          input.value = '';
          input.dispatchEvent(new Event('input')); // the eye follows the field — see `addReveal`
          input.placeholder = '';
          row.setDesc(describe());
          btn.buttonEl.hide();
        });
      });
    }

    // **The footer, not the body.** As the last rows of a scrolling column, at Obsidian's default window size a source
    // with a language row and a credential pair would push Save off the bottom — a dialog you cannot finish.
    // `OrbisModal.footer()` is a sibling of the scrolling content and cannot be scrolled away from.
    // **No Delete here.** In this footer, deleting a source would begin by pressing Edit — two different verbs down
    // one path. It is the row's trash; see the sources list in `OrbisSettings`.
    const actions = actionRow(this.footer());
    actionButton(actions, { label: t('action.cancel'), onClick: () => this.close() });
    actionButton(actions, { label: t('action.save'), cta: true, onClick: () => this.save() });
  }

  /**
   * The eye beside the password.
   *
   * A real `<button>` rather than `addExtraButton` — see `iconButton` — and it puts the keyboard back in the field
   * afterwards, because revealing the password is something you do in the middle of typing one.
   *
   * **The icon says what state the field is in; the label says what pressing it would do.** Mixed semantics, but they
   * are Obsidian's, taken from its own Add secret dialog: masked draws `eye-off` and offers "Show", revealed draws
   * `eye` and offers "Hide". An icon that names its action would be internally consistent, but in a keychain it does
   * not, and being the only control in Obsidian that reads backwards is worse.
   *
   * The label changes with the state either way: an unlabelled toggle tells a screen reader nothing about which way
   * it is.
   */
  private addReveal(row: Setting, input: HTMLInputElement): void {
    row.addButton((btn) => {
      const paint = (visible: boolean): void => {
        const label = visible ? t('book_sources_page.hide_password') : t('book_sources_page.reveal_password');
        btn.setIcon(visible ? 'eye' : 'eye-off').setTooltip(label);
        btn.buttonEl.setAttribute('aria-label', label); // icon-only: a tooltip is not an accessible name
      };
      btn.buttonEl.addClass('clickable-icon');
      btn.onClick(() => {
        const visible = input.type === 'password'; // about to become visible
        input.type = visible ? 'text' : 'password';
        paint(visible);
        input.focus();
      });
      paint(false);
      // **Only once something is typed.** A saved password never reaches the field, so with nothing typed there is
      // nothing to show — an enabled eye that revealed nothing read as broken, or as hiding the saved one. Emptied
      // again, the field goes back to masked.
      const sync = (): void => {
        const empty = input.value === '';
        btn.setDisabled(empty);
        if (empty && input.type !== 'password') {
          input.type = 'password';
          paint(false);
        }
      };
      input.addEventListener('input', sync);
      sync();
    });
  }

  private save(): void {
    const name = this.name.trim();
    const url = this.url.trim();
    if (!name) {
      new Notice(t('book_sources_page.invalid_name'));
      return;
    }
    // Shallow on purpose — see `isUsableSourceUrl`. What the URL really is gets answered by fetching it, and that is
    // where a message worth reading comes from.
    if (!isUsableSourceUrl(url)) {
      new Notice(t('book_sources_page.invalid_url'));
      return;
    }
    // The credential last, after the form is known to be good: a rejected save must not leave a password behind for a
    // source that was never created. `saveCredential` writes only the halves that changed — see the rule it keeps.
    // Typed replaces, removed removes, and an untouched field keeps what is saved — see `CredentialEdit`.
    const password = this.typedPassword !== '' ? this.typedPassword : this.removingPassword ? '' : null;
    saveCredential(this.app, { id: this.sourceId }, { username: this.username, password }, this.heldUsername);
    this.onConfirm({ name, url, language: this.language.trim() });
    this.close();
  }
}

/**
 * A language code, named in the reader's own language.
 *
 * `Intl.DisplayNames` is in every platform Obsidian runs on and knows every code we could offer, so a table of English
 * names would be twenty strings to translate that the runtime already has. The code itself is the fallback: a reader
 * who sees `eo` has still been told which option is which, and a dropdown that threw while being built would take the
 * whole dialog with it.
 */
function languageName(code: string): string {
  try {
    return new Intl.DisplayNames([navigator.language || 'en'], { type: 'language' }).of(code) ?? code;
  } catch {
    return code;
  }
}
