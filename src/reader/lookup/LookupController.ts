import { Notice } from 'obsidian';
import { t } from '../../i18n';
import type { LookupSection, LookupWebDestination } from '../../settings';
import { createOrbisPopup, renderTabRow, setBusy, setSvgIcon } from '../../ui-utils';
import { LOOKUP_ICON } from '../AnnotationController';
import type { ReaderContext } from '../ReaderContext';
import { downloadFailedMessage } from '../tts/asset-integrity';
import type { PreviewHandle } from '../tts/PiperEngine';
import { glossarySvg } from '../tts/pronunciation-editor';
import { isValidPronunciationWord, type Pronunciation } from '../tts/pronunciations';
import { VoiceNotHereError } from '../tts/speak-once';
import type { Dictionaries, DictionaryResult } from './DictionaryService';
import { dictionaryName, maxDictionaryWords, totalDictionaryMb, wordCount } from './DictionaryService';
import { notesNamed, titleSearchQuery } from './vault-notes';

/** How the popup speaks a term: the reader supplies both halves so the lookup layer needs no
 *  knowledge of voice resolution or of the playback state machine. */
export interface LookupSpeaker {
  /** Speak `text` once in the device's live voice; `onDone` fires on natural completion. Applies
   *  the pronunciation dictionary, so this sounds like the narration does. */
  speak: (text: string, onDone: () => void) => Promise<PreviewHandle>;
  /** Speak `text` verbatim, bypassing the dictionary — for auditioning a respelling, where the text
   *  IS the replacement and running it through the dictionary would be circular. */
  speakLiteral: (text: string, onDone: () => void) => Promise<PreviewHandle>;
  /** Pause book playback so the two don't overlap. Deliberately does not resume afterwards. */
  pauseAudio: () => void;
}

/** What the popup needs of the pronunciation dictionary: read the current entry, and hand editing
 *  off to the shared editor (so the reading-time and Settings entry points behave identically). */
export interface PronunciationAccess {
  find: (word: string) => Pronunciation | undefined;
  openEditor: (word: string, current: { say: string; enabled: boolean }, onChanged: () => void) => void;
}

const SPEAKER_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
// A plain pencil, not a speaker-plus-pencil composite: two glyphs inside 14px overlap into mush.
const STOP_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1.5"/></svg>';

/**
 * One book's senses.
 *
 * WordNet's part of speech leads the sense it belongs to, because its senses are terse enough that "noun" is the
 * difference between two of them; Webster's carries none and the line simply starts with the text. Examples follow
 * their sense, quoted, which is how WordNet itself prints them.
 */
function renderSenses(box: HTMLElement, hit: DictionaryResult): void {
  for (const sense of hit.senses) {
    const line = box.createDiv({ cls: 'orbis-lookup-sense' });
    if (sense.pos) line.createSpan({ cls: 'orbis-lookup-pos', text: sense.pos });
    line.createSpan({ text: sense.text });
    for (const example of sense.examples ?? []) {
      line.createDiv({ cls: 'orbis-lookup-example', text: `“${example}”` });
    }
  }
}

/**
 * Word/phrase look-up from the reader. Full design: docs/design/look-up.md.
 * Opens a popup for the selected text with (up to) three
 * sections: the offline dictionary definition (a word, or a phrase that is a headword), a vault section (open a
 * matching note / search the vault), and a web section (one button per enabled destination).
 * Which sections show, and in what order, is driven by settings (`lookupSections`); the web
 * destinations come from `lookupWebDestinations`. A reader collaborator wired via ReaderContext
 * (also the popup host); reached from the selection picker / mobile drawer through
 * AnnotationHost.lookUp.
 */
export class LookupController {
  /** In-flight one-shot utterance, so the Speak button can stop it and so closing the popup can't
   *  leave audio playing with no visible control. */
  private speech: PreviewHandle | null = null;
  /** Invalidates a pending speakOnce whose await resolves after the user stopped / closed. */
  private speechEpoch = 0;

  constructor(
    private readonly ctx: ReaderContext,
    private readonly dictionaries: Dictionaries,
    private readonly sections: () => LookupSection[],
    private readonly destinations: () => LookupWebDestination[],
    private readonly speaker: LookupSpeaker,
    private readonly pronunciations: PronunciationAccess
  ) {}

  async open(rawText: string): Promise<void> {
    const term = (rawText || '').trim().replace(/\s+/g, ' ');
    if (!term) return;
    const shortTerm = term.length > 48 ? `${term.slice(0, 48)}…` : term;
    const words = wordCount(term);

    const { popupEl, close } = createOrbisPopup(this.ctx, {
      title: t('lookup.title', { term: shortTerm }),
      icon: LOOKUP_ICON,
      dismissOnOutsideClick: true,
      lockMobileHeights: false, // no text input; see createOrbisPopup's lockMobileHeights note
      mobileFillHeight: true, // no keyboard to reserve for — use the full height so all sections fit
      desktopWidth: '440px',
      onClose: () => this.stopSpeech(), // never leave audio running without its stop button
    });
    this.buildActions(popupEl, term);
    const body = popupEl.createDiv({ cls: 'orbis-lookup-body' });

    for (const section of this.sections()) {
      if (!section.visible) continue;
      switch (section.id) {
        case 'definition':
          /**
           * **A phrase is very often a headword.** WordNet's multi-word entries are 41.5% of it: *point of view*,
           * *red herring*, *sea change*, *de facto*. Skipping anything with a space in it would hide 52,870
           * entries.
           *
           * Two things stand in for a blanket skip. A selection longer than the longest headword in any book is not
           * asked at all — see `maxWords` — so selecting three paragraphs for the vault section does not stall on
           * a 21 MB parse to answer nothing. And a phrase that IS asked and finds nothing shows no section: "not
           * in either dictionary" is useful about a word and noise about an arbitrary run of words.
           */
          if (words <= maxDictionaryWords()) void this.fillDefinition(body.createDiv(), term, words > 1);
          break;
        case 'vault':
          this.buildVaultSection(body, term, shortTerm, close);
          break;
        case 'web':
          this.buildWebSection(body, term);
          break;
      }
    }
  }

  /**
   * Populate the definition section: a download offer if the reader has no dictionary yet, otherwise whatever the
   * dictionaries they DO have can say about the word.
   *
   * The section is passed rather than the scrolling box, because two things above the scroller belong to it: the
   * header, which names the book when no strip does, and the strip itself — inside the box, either would scroll
   * away with the senses it describes.
   */
  private async fillDefinition(sec: HTMLElement, term: string, quietIfEmpty: boolean): Promise<void> {
    sec.empty(); // re-entered after a download, below
    /**
     * A phrase paints nothing until it is known to have an answer.
     *
     * A word gets the placeholder and, on a miss, a line saying where it looked — both are useful, and the
     * section is expected. A phrase that turns out not to be a headword should leave no trace, so a header and a
     * "Looking up…" box that appear and then vanish would be worse than the wait they were covering. On a first
     * lookup that wait is a 21 MB parse, which is exactly when the flash would show.
     */
    if (quietIfEmpty) {
      const hits = await this.lookUpWord(term);
      if (!hits.length) return;
      this.paintHits(sec, sec.createDiv({ cls: 'orbis-lookup-section', text: t('lookup.section_definition') }), hits);
      return;
    }
    const header = sec.createDiv({ cls: 'orbis-lookup-section', text: t('lookup.section_definition') });
    const box = sec.createDiv({ cls: 'orbis-lookup-def', text: t('lookup.looking_up') });
    if (!(await this.dictionaries.anyDownloaded())) {
      box.empty();
      // **The same sentence the setup task uses, and the same one button.** A reader who has neither book is not
      // choosing between them — they are agreeing to a download — and two CTAs would ask them to pick before
      // anything has shown them a difference. Picking one over the other is a decision for the Look-up settings
      // page, where each row says what its book is for.
      box.createDiv({
        cls: 'orbis-lookup-status',
        text: t('setup.lookup_desc', { size: String(totalDictionaryMb()) }),
      });
      const btn = box.createEl('button', { cls: 'mod-cta orbis-lookup-download', text: t('lookup_page.download') });
      let downloading = false;
      btn.addEventListener('click', () => {
        if (downloading) return; // one download at a time; the press is declined rather than the button disabled
        void (async () => {
          downloading = true;
          // Busy, not disabled — see `setBusy`. It matters on the failure path, where this button is what the
          // reader needs to press again.
          setBusy(btn, true);
          btn.setText(t('lookup_page.downloading'));
          try {
            // Sequentially, and only what is missing — the rule the setup task follows, for the same reasons: two
            // 21 MB downloads contending on a phone connection is slower than one after the other.
            for (const service of this.dictionaries.all) {
              if (!(await service.isDownloaded())) await service.download();
            }
          } catch (err) {
            downloading = false;
            setBusy(btn, false);
            btn.setText(t('lookup_page.download'));
            new Notice(downloadFailedMessage(err));
            return;
          }
          await this.fillDefinition(sec, term, false);
        })();
      });
      return;
    }
    box.detach();
    await this.renderDefinition(sec, header, term);
  }

  /**
   * Draw what the downloaded books had to say.
   *
   * **A tab only when there is a choice to make.** One book with an entry draws its senses and nothing else; two
   * draw a strip, because which book answers a word better is a judgment the reader makes per word — Webster's
   * for an archaic sense, WordNet for one that postdates 1913 — not a preference they set once in settings.
   *
   * **The source is named at the top either way** — in the strip when there is a choice, in the header when there
   * is not. A one-tab strip was the obvious alternative and is the wrong one: a reader who downloaded a single
   * book would meet an accent-filled pill above every definition that looks pressable and does nothing.
   */
  private async renderDefinition(sec: HTMLElement, header: HTMLElement, term: string): Promise<void> {
    const hits = await this.lookUpWord(term);
    if (!hits.length) {
      // Said in terms of the books this device HAS. "No dictionary entry" reads as a fact about dictionaries at
      // large, when for a reader holding only the 1913 book it is usually a fact about 1913.
      const held = await this.dictionaries.downloaded();
      const text =
        held.length === 1
          ? t('lookup.no_entry_in', { name: dictionaryName(held[0].source) })
          : t('lookup.no_entry_either');
      sec.createDiv({ cls: 'orbis-lookup-def' }).createDiv({ cls: 'orbis-lookup-status', text });
      return;
    }
    this.paintHits(sec, header, hits);
  }

  /** Ask both books, and treat a failure as silence — a dictionary that cannot be read is a dictionary with no
   *  entry, and there is nothing the reader could do with the difference. */
  private async lookUpWord(term: string): Promise<DictionaryResult[]> {
    try {
      return await this.dictionaries.define(term);
    } catch {
      return [];
    }
  }

  /** The senses themselves, and whatever names the book they came from. Split out because the phrase path in
   *  `fillDefinition` reaches it without the miss-message branch above, which a phrase does not want. */
  private paintHits(sec: HTMLElement, header: HTMLElement, hits: DictionaryResult[]): void {
    if (hits.length === 1) {
      // Appended rather than rewritten, so the header keeps the section's own name in front of the book's.
      header.createSpan({ cls: 'orbis-lookup-source', text: ` · ${dictionaryName(hits[0].service.source)}` });
      renderSenses(sec.createDiv({ cls: 'orbis-lookup-def' }), hits[0]);
      return;
    }
    const tabs = hits.map((h) => ({ id: h.service.source.id, label: dictionaryName(h.service.source) }));
    let box: HTMLElement;
    renderTabRow(sec, tabs, tabs[0].id, (id) => {
      const hit = hits.find((h) => h.service.source.id === id);
      box.empty();
      if (hit) renderSenses(box, hit);
      box.scrollTop = 0; // the other book's senses start at their own beginning, not at this one's scroll position
    }).addClass('orbis-lookup-tabs');
    box = sec.createDiv({ cls: 'orbis-lookup-def' });
    renderSenses(box, hits[0]);
  }

  /**
   * What your vault has, in up to three rows: the one note named for the selection, the titles that contain it,
   * and the text search.
   *
   * **Two searches, because titles and contents are different questions**, and the content search is the one
   * people reach for most — so it stays where it has always been, at the bottom.
   *
   * **Neither search row carries a count** — see `titleSearchQuery`.
   * Obsidian's search reports its own total the moment it opens, which is the only number that cannot be wrong.
   *
   * **Opening a note stays for the unambiguous case only.** One note by that name is an obvious destination and
   * one tap; two is a choice nobody but the reader can make, and the title search is where they make it.
   */
  private buildVaultSection(body: HTMLElement, term: string, shortTerm: string, close: () => void): void {
    const sec = body.createDiv();
    sec.createDiv({ cls: 'orbis-lookup-section', text: t('lookup.section_vault') });
    const started = performance.now();
    const notes = this.ctx.app.vault.getMarkdownFiles();
    const named = notesNamed(notes, term);
    this.ctx.debug(
      `look-up: vault notes named "${term}" — ${named.length} of ${notes.length}, in ${Math.round(performance.now() - started)} ms`,
      'search'
    );
    if (named.length === 1) {
      const dest = named[0];
      this.actionButton(sec, t('lookup.open_note', { title: dest.basename }), () => {
        close();
        void this.ctx.app.workspace.getLeaf('tab').openFile(dest);
      });
    }
    // Always offered, like the text search below it. Hiding it when this device counts no matches would put the
    // plugin in the business of predicting what Obsidian's index holds, which it cannot do reliably.
    this.actionButton(sec, t('lookup.search_file_names', { term: shortTerm }), () => {
      close();
      this.searchVault(titleSearchQuery(term));
    });
    this.actionButton(sec, t('lookup.search_vault', { term: shortTerm }), () => {
      close();
      this.searchVault(`"${term}"`);
    });
  }

  private buildWebSection(body: HTMLElement, term: string): void {
    const enabled = this.destinations().filter((d) => d.enabled);
    if (enabled.length === 0) return; // nothing to show — skip the heading too
    const sec = body.createDiv({ cls: 'orbis-lookup-web' });
    sec.createDiv({ cls: 'orbis-lookup-section', text: t('lookup.section_web') });
    for (const dest of enabled) {
      // Web searches leave the popup open so several destinations can be tapped in a row; the
      // vault actions below still close it (they navigate away within Obsidian).
      this.actionButton(sec, dest.name, () => {
        const url = dest.url.replace('{{query}}', encodeURIComponent(term));
        window.open(url, '_blank');
      });
    }
  }

  private actionButton(parent: HTMLElement, label: string, onClick: () => void): void {
    parent.createEl('button', { cls: 'orbis-lookup-action', text: label }).addEventListener('click', onClick);
  }

  /**
   * "Speak" — read the selected text aloud in the device's live voice. Not a lookup *section*
   * (it acts on the term rather than showing content about it), so it's always present and sits
   * above the section list rather than being orderable/hideable in settings.
   *
   * Toggles to Stop while speaking: a selection can be long, and there is otherwise no way to
   * silence it. Narration is paused first and deliberately left paused — the user taps play when
   * they're ready (see docs/design/text-to-speech.md).
   */
  private buildActions(popupEl: HTMLElement, term: string): void {
    const row = popupEl.createDiv({ cls: 'orbis-lookup-actions' });
    this.buildSpeakButton(row, term);
    // Sits beside Speak, not in a section of its own: both act on how the WORD SOUNDS, and pairing
    // them is what makes it self-explanatory — you tap Speak, it comes out wrong, the fix is the
    // button next to the one you just pressed. A section separated by Definition reads as orphaned.
    // Single tokens only, same as the dictionary (a phrase has no unambiguous glossary key).
    if (isValidPronunciationWord(term)) this.buildPronunciationButton(row, term);
  }

  /**
   * "Pronunciation" — open the glossary editor for this word. Tinted when a respelling exists, which
   * conveys that state without prose; the tooltip carries the respelling itself.
   * Showing the respelling as text adds little: you can't judge a respelling by reading it, only by
   * hearing it, and the editor's preview buttons are where that happens.
   */
  private buildPronunciationButton(row: HTMLElement, term: string): void {
    const btn = row.createEl('button', { cls: 'orbis-lookup-speak orbis-lookup-pron-btn' });
    const icon = btn.createSpan({ cls: 'orbis-lookup-speak-icon', attr: { 'aria-hidden': 'true' } });
    setSvgIcon(icon, glossarySvg(14));
    btn.createSpan({ text: t('lookup.pron_button') });
    const paint = () => {
      const existing = this.pronunciations.find(term);
      btn.toggleClass('is-set', !!existing);
      const label = existing
        ? t('lookup.pron_tip_set', { say: existing.say })
        : t('lookup.pron_tip_unset', { word: term });
      btn.setAttribute('aria-label', label);
    };
    paint();
    btn.addEventListener('click', () => {
      const existing = this.pronunciations.find(term);
      this.pronunciations.openEditor(term, { say: existing?.say ?? '', enabled: existing?.enabled ?? true }, paint);
    });
  }

  private buildSpeakButton(row: HTMLElement, term: string): void {
    const btn = row.createEl('button', { cls: 'orbis-lookup-speak' });
    // Decorative — the button's own label text is its accessible name.
    const icon = btn.createSpan({ cls: 'orbis-lookup-speak-icon', attr: { 'aria-hidden': 'true' } });
    const label = btn.createSpan({ text: t('lookup.speak') });

    const paint = (state: 'idle' | 'pending' | 'speaking') => {
      setSvgIcon(icon, state === 'speaking' ? STOP_SVG : SPEAKER_SVG);
      label.setText(
        t(state === 'pending' ? 'lookup.speak_loading' : state === 'speaking' ? 'lookup.stop' : 'lookup.speak')
      );
      btn.toggleClass('is-active', state === 'speaking');
      // Busy, not disabled: disabling the focused button blurs it and the keyboard never comes back. See `setBusy`.
      setBusy(btn, state === 'pending');
      pending = state === 'pending';
    };
    let pending = false;
    paint('idle');

    btn.addEventListener('click', () => {
      if (pending) return; // still warming up; the press is declined rather than the button disabled
      if (this.speech) {
        this.stopSpeech();
        paint('idle');
        return;
      }
      const epoch = ++this.speechEpoch;
      paint('pending');
      void (async () => {
        try {
          // Duck the book audio first (convention shared with the voice previews). Left paused.
          this.speaker.pauseAudio();
          const handle = await this.speaker.speak(term, () => {
            if (epoch !== this.speechEpoch) return; // a later utterance owns the button now
            this.speech = null;
            paint('idle');
          });
          if (epoch !== this.speechEpoch) {
            handle.stop(); // stopped or closed while the voice was warming up
            return;
          }
          this.speech = handle;
          paint('speaking');
        } catch (err) {
          if (epoch !== this.speechEpoch) return;
          this.speech = null;
          paint('idle');
          // Declining the voice download is an answer, not a failure.
          if (!(err instanceof VoiceNotHereError)) new Notice(t('lookup.speak_failed'));
        }
      })();
    });
  }

  /** Silence any in-flight utterance and invalidate a pending one. */
  private stopSpeech(): void {
    this.speechEpoch++;
    this.speech?.stop();
    this.speech = null;
  }

  /**
   * Open Obsidian's global search on a QUERY (its own UI, rather than reimplementing full-text search).
   * internalPlugins is undocumented, hence the guarded cast + fallback.
   *
   * **The caller builds the query, quotes and operators included.** Quoting the bare term here would leave no way
   * to ask for a `file:` search — the title search would arrive as the literal string `"file:"crime""`. Two
   * callers: the text search, and the title search a name collision opens.
   */
  private searchVault(query: string): void {
    const gs = (
      this.ctx.app as unknown as {
        internalPlugins?: { getPluginById(id: string): { instance?: { openGlobalSearch(q: string): void } } | null };
      }
    ).internalPlugins?.getPluginById('global-search');
    if (gs?.instance?.openGlobalSearch) gs.instance.openGlobalSearch(query);
    else new Notice(t('lookup.search_unavailable'));
  }
}
