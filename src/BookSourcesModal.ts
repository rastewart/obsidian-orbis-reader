// Browsing a catalog: which source, then what is in it.
//
// **One dialog with two states rather than two dialogs.** The list of sources and the feed you opened are the same
// journey, and a reader who picked the wrong source should get back with the same gesture that got them in. So this is
// a stack: the sources, then a feed, then a category inside it, with Back unwinding one step at a time.
//
// **Not the Library's widgets**, deliberately. Remote rows have different actions and different paging, and this
// feature lives under a hard rule — one request per user action, because Gutenberg's robot policy makes automated
// access grounds for an IP block. Satisfying that through the arranger would drag collections and fields into the
// network path. See docs/design/book-sources.md.
//
// Nothing here fetches on its own: no prefetching the next page, no crawling ahead for covers, no refresh on open.
// Every request in this file is downstream of a tap.

import { type App, Setting, setIcon } from 'obsidian';
import { actionButton, actionRow } from './controls';
import { t } from './i18n';
import { refreshLibraryViews } from './LibraryView';
import { clampToWords } from './library/record-row';
import { OrbisModal } from './OrbisModal';
import { logToLibrary } from './reader/DebugLog';
import type { BookSource, IOrbisReaderPlugin } from './settings';
import { fetchFeed, fetchSourceBody, forLog, type SourceFailure } from './sources/client';
import { type DownloadOutcome, type DownloadRequest, downloadBooks } from './sources/download';
import {
  bestAcquisition,
  type OpdsEntry,
  type OpdsFeed,
  parseOpenSearchTemplate,
  resolveOpdsHref,
  searchUrlFrom,
  sizeLabel,
  yearOf,
} from './sources/opds';
import { knownIssueFor, languageTerm, withLanguageTerm } from './sources/quirks';
import { enabledSources } from './sources/sources';
import { BOOK_SOURCES_SVG } from './system-glyphs';
import { claimFocusSoon, onActivate, rebuildKeepingFocus } from './ui-utils';

/**
 * The ground every list in this dialog sits on.
 *
 * **A region, not a run of rows.** All four lists — the catalogs, a feed's entries, the review, the report — sit on
 * a ground, because rows straight onto the dialog's body share their background with the footer below them and
 * nothing says where the scrolling stops and the Download button begins. The same recess the chapter lists and
 * the controls-bearing folds use, for the same reason: a border alone reads as a hairline someone left in, where a
 * ground says "this is a different surface".
 *
 * One helper rather than four wrappers, because four lists that must look identical are four chances not to.
 */
// A list of books to pick from, on the shared list ground. The ground is `.orbis-list-box`'s; all
// `.orbis-pick-panel` keeps of its own is the clipping.
const pickPanel = (parent: HTMLElement): HTMLElement => parent.createDiv({ cls: 'orbis-pick-panel orbis-list-box' });

/** What a failure says to the reader. One string each, because each has a different next step. */
const FAILURE_MESSAGES: Record<SourceFailure, Parameters<typeof t>[0]> = {
  unreachable: 'sources.failed_unreachable',
  'requires-authentication': 'sources.failed_requires_authentication',
  unauthorized: 'sources.failed_unauthorized',
  forbidden: 'sources.failed_forbidden',
  'not-found': 'sources.failed_not_found',
  unavailable: 'sources.failed_unavailable',
  'rate-limited': 'sources.failed_rate_limited',
  'server-error': 'sources.failed_server',
  'too-large': 'sources.failed_too_large',
  unreadable: 'sources.failed_unreadable',
  'not-opds': 'sources.failed_not_opds',
  'private-address': 'sources.failed_private_address',
};

/**
 * What became of one book, in the words the report shows.
 *
 * **The path is the point.** "Saved" says nothing a reader can act on; "Saved to Library/Downloads/Sample Book - Jane
 * Doe.epub" tells them where the thing now lives, which is the question a download leaves behind. A skipped book
 * says where the copy it found already is, for the same reason.
 */
function reportLine(outcome: DownloadOutcome): string {
  if (outcome.kind === 'saved') {
    return outcome.notePath
      ? t('sources.report_saved_cataloged', { path: outcome.path })
      : t('sources.report_saved', { path: outcome.path });
  }
  if (outcome.kind === 'skipped') return t('sources.report_skipped', { path: outcome.path });
  // The server's own words after ours, as a browse failure has them — see `failureText`. A vault's error is not a
  // server's, so it follows bare.
  if (outcome.reason !== 'write-failed') {
    return t('sources.report_failed', { reason: failureText({ reason: outcome.reason, detail: outcome.detail }) });
  }
  const write = t('sources.failed_write');
  return t('sources.report_failed', { reason: outcome.detail ? `${write}\n${outcome.detail}` : write });
}

/**
 * What to tell the reader about a failure: our sentence, and the server's own if it gave one.
 *
 * **A server that asks for credentials usually says why.** Standard Ebooks answers its OPDS feed with
 * `realm="Enter your Patrons Circle email address and leave the password empty."` — which names the membership and the
 * odd blank-password shape, neither of which we could have known. Ours first, because it says what happened; theirs
 * second, because it says what to do.
 *
 * **Labeled as theirs.** The line is whatever sits in front of the feed chose to write — a sentence from Standard
 * Ebooks, a bare name from a reverse proxy — and a bare name on a line of its own read as a stray heading.
 */
function failureText(result: { reason: SourceFailure; detail?: string }): string {
  const ours = t(FAILURE_MESSAGES[result.reason]);
  return result.detail ? `${ours}\n${t('sources.source_says', { words: result.detail })}` : ours;
}

/**
 * The cover an entry publishes, for a download whose file has none: the full image before the thumbnail, resolved
 * against the page it came from, as the book's own address is.
 */
function coverFor(entry: OpdsEntry, base: string): string | undefined {
  const image =
    entry.images.find((link) => /\/image$|\/cover$/i.test(link.rel)) ??
    entry.images.find((link) => /thumbnail$/i.test(link.rel));
  return image ? (resolveOpdsHref(image.href, base) ?? undefined) : undefined;
}

/** One place in the stack: a feed we fetched, and the URL it came from so its hrefs can be resolved. */
interface Place {
  feed: OpdsFeed;
  url: string;
  /** What to call this step — the feed's own title, or the category the reader tapped to get here. */
  label: string;
  /**
   * Whether this step is a page of search results.
   *
   * **A search is a step INTO a source, not a replacement for where you were.** Replacing would make Back from
   * results pop the only step on the stack and leave the catalog altogether — two taps to get from results to the
   * list of categories you searched from. So it pushes, and only a search run *from* results replaces, so trying four
   * queries in a row still leaves with one Back.
   */
  search?: boolean;
  /**
   * The row that was tapped to get here, so Back can put the keyboard on it again.
   *
   * A stack of screens has a natural focus answer at every step — the thing you walked in through — and losing it
   * means a reader working from the keyboard starts at the top of the list after every Back.
   */
  from?: string;
}

export class BookSourcesModal extends OrbisModal {
  /** The source being browsed, or null while the list of sources is showing. */
  private source: BookSource | null = null;
  /** Where we have been, deepest last. Back pops one. */
  private stack: Place[] = [];
  private busy = false;
  /** A batch is running — the busy screen offers **Stop** only then, not while a page loads. */
  private downloading = false;
  /** **Stop** was asked for: the batch ends after the book in hand. Closing the dialog asks it too. */
  private stopping = false;
  /** How many books a stopped batch left untried, for the report. */
  private notTried = 0;
  /**
   * Which of the three screens is showing.
   *
   * **Choosing, confirming and reporting are three steps, not one.** Downloading writes files into somebody's vault and
   * fetches from somebody else's server: a button that did it the instant it was pressed would give no chance to see
   * what was about to happen, and a toast afterwards would take the answer away before it had been read. The catalog
   * review follows the same rule — "it ends on a report, not a toast".
   */
  private stage: 'browse' | 'review' | 'report' = 'browse';
  /** What the last batch did, kept for the report until the reader leaves it. */
  private outcomes: DownloadOutcome[] = [];
  /**
   * The search template for this source, fetched once per source per dialog.
   *
   * **Search costs two requests the first time**: the feed's `rel="search"` link points at an OpenSearch description,
   * which carries the template. Remembering it here means the second search of a sitting is one request, and closing
   * the dialog forgets it — which is the right lifetime for something a server may change.
   */
  private searchTemplate: string | null = null;
  private searchQuery = '';
  private bodyEl: HTMLElement | null = null;
  /**
   * The books chosen so far in this source, by the id the feed gave them.
   *
   * **It survives navigation, because a catalog makes you navigate to choose.** Gutenberg publishes each book as its
   * own document, so its list page has nothing tickable on it at all — every row is a category. A basket cleared on
   * every step would therefore hold exactly one book, which is not a basket.
   *
   * It holds what a download needs rather than a reference to a row: the acquisition URL is **resolved when the book is
   * chosen**, while the page it came from is still known, because an href means nothing without its document. Cleared
   * when the source changes, when a batch lands, and when the dialog closes — a basket outliving the shop it was filled
   * in would be a surprise waiting for the next visit. And the footer always says how many are in it, which is what
   * makes a basket you cannot see into one you can.
   */
  private picked = new Map<string, DownloadRequest>();
  /** What a batch is doing, while it does it — the row a progress line prints. */
  private progress: string | null = null;
  /**
   * The last thing that went wrong, shown in the dialog until something else happens.
   *
   * **Not a notice.** A refusal is the answer to what the reader just tapped, and on a desktop a notice appears in a
   * corner they are not looking at and takes itself away before it has been read — twice as bad here, because the
   * sentence that matters most is often the server's own realm, which is a whole line of instructions. The download
   * report follows the same rule: it ends on a screen, not a toast.
   */
  private problem: string | null = null;

  /** Every request and its answer, in the `sources` channel of the debug log — see `fetchSourceBody`. */
  private readonly log = (msg: string): void => logToLibrary(this.plugin, `sources: ${msg}`, 'sources');

  constructor(
    app: App,
    private readonly plugin: IOrbisReaderPlugin
  ) {
    // Full screen on a phone: this is a list of books with covers, which is the shape that wants the room. Not
    // dismissed by an outside click, because a fetched page is work — going back to the source list by accident means
    // fetching it again, which is exactly what this feature is careful about.
    super(app, { fullScreenOnMobile: true, dismissOnOutsideClick: false, icon: BOOK_SOURCES_SVG });
  }

  /** Closing mid-batch stops it after the book in hand, rather than downloading the rest into a dialog nobody sees. */
  protected onDialogClose(): void {
    this.stopping = true;
  }

  protected dialogTitle(): string {
    // **The review and the report are about downloads, not about the book you happened to be looking at.** A title
    // following the browse stack would make confirming two books, while standing on one of their pages, read as that
    // one book's name over a list of two.
    if (this.stage !== 'browse') return t('sources.downloads');
    const here = this.stack[this.stack.length - 1];
    if (here) return here.label || this.source?.name || t('sources.browse');
    return t('sources.browse');
  }

  protected renderDialog(): void {
    this.modalEl.addClass('orbis-form-dialog');
    this.bodyEl = this.contentEl.createDiv();
    this.render();
  }

  /** Rooted on the dialog, not the body: this rebuild empties the footer too, and a Download button living there has
   *  to keep the keyboard as much as a row does. See `rebuildKeepingFocus`. */
  private render(): void {
    rebuildKeepingFocus(this.modalEl, () => this.build());
  }

  private build(): void {
    const parent = this.bodyEl;
    if (!parent) return;
    parent.empty();
    // The footer belongs to the screen showing now. Emptied here rather than in each renderer, or the review would draw
    // its buttons under the ones the browse bar had already put there: two Download buttons, one per screen.
    this.footer().empty();
    this.refreshTitle();
    // Above whatever screen is showing, because it is about what the reader just did. It stays until the next thing
    // they do, rather than for five seconds.
    if (this.problem) parent.createDiv({ cls: 'orbis-sources-problem', text: this.problem });
    if (this.busy) {
      parent.createDiv({ cls: 'orbis-library-empty-body', text: this.progress ?? t('sources.loading') });
      // **Stop finishes the book in hand and skips the rest.** A request in flight cannot be cut short, so this says
      // what it will do rather than pretending it is instant.
      if (this.downloading) {
        if (this.stopping) parent.createDiv({ cls: 'orbis-library-empty-body', text: t('sources.stopping') });
        actionButton(actionRow(this.footer()), {
          label: t('sources.stop'),
          disabled: this.stopping,
          onClick: () => {
            this.stopping = true;
            this.render();
          },
        });
      }
      return;
    }
    if (this.stage === 'report') {
      this.renderReport(parent);
      return;
    }
    if (this.stage === 'review') {
      this.renderReview(parent);
      return;
    }
    if (!this.source || this.stack.length === 0) {
      this.renderSources(parent);
      return;
    }
    this.renderFeed(parent, this.stack[this.stack.length - 1]);
    this.renderDownloadBar();
  }

  /**
   * Step two: what is about to happen, before it happens.
   *
   * Each book with the format and size it will arrive as, and the folder they are all going to — the two facts worth
   * checking before a download, since one of them is measured in megabytes and the other is where your vault grows.
   * Rows can still be taken out here, because a review you cannot act on is a delay rather than a review.
   */
  private renderReview(parent: HTMLElement): void {
    parent.createDiv({ cls: 'orbis-rules-heading', text: t('sources.review_heading') });
    parent.createDiv({
      cls: 'orbis-records-authority',
      text: t('sources.review_desc', { folder: this.plugin.settings.bookSourcesFolder || '/' }),
    });
    const list = pickPanel(parent);
    for (const [key, book] of this.picked) {
      const row = list.createDiv({ cls: 'orbis-pick-row' });
      const main = row.createDiv({ cls: 'orbis-pick-label' });
      main.createDiv({ cls: 'orbis-widget-name', text: book.title });
      const meta = [book.authors.join(', '), book.label, sizeLabel(book.size)].filter(Boolean).join(' · ');
      if (meta) main.createDiv({ cls: 'orbis-widget-meta', text: meta });
      const drop = row.createEl('button', { cls: 'clickable-icon' });
      setIcon(drop, 'x');
      drop.setAttribute('aria-label', t('sources.remove_picked', { title: book.title }));
      drop.addEventListener('click', () => {
        this.picked.delete(key);
        // Back to browsing when the last one goes: a review of nothing is a screen with nothing to confirm.
        if (this.picked.size === 0) this.stage = 'browse';
        this.render();
      });
    }

    const actions = actionRow(this.footer());
    // "Keep browsing" rather than "Cancel": nothing has been thrown away, and the basket is still full — which is what
    // the reader is going back to add to.
    actionButton(actions, {
      label: t('sources.keep_browsing'),
      onClick: () => {
        this.stage = 'browse';
        this.render();
      },
    });
    actionButton(actions, {
      label: t('sources.download_n', { count: String(this.picked.size) }),
      cta: true,
      onClick: () => void this.download(),
    });
  }

  /**
   * Step three: what happened, and where the files are.
   *
   * **A screen rather than a notice**, for the reason the catalog review gives: "Saved 3 books" that vanishes in five
   * seconds is not something anyone can check, and the one fact a reader wants afterwards is the path — where in the
   * vault this thing now lives. Failures lead, because that is the part with something left to do about it.
   */
  private renderReport(parent: HTMLElement): void {
    const saved = this.outcomes.filter((o) => o.kind === 'saved');
    const trouble = this.outcomes.filter((o) => o.kind !== 'saved');
    parent.createDiv({ cls: 'orbis-rules-heading', text: t('sources.report_heading') });
    if (this.notTried > 0) {
      parent.createDiv({
        cls: 'orbis-rules-hint',
        text:
          this.notTried === 1
            ? t('sources.report_stopped_one')
            : t('sources.report_stopped', { count: String(this.notTried) }),
      });
    }

    const list = pickPanel(parent);
    for (const outcome of [...trouble, ...saved]) {
      const row = list.createDiv({ cls: 'orbis-pick-row' });
      const main = row.createDiv({ cls: 'orbis-pick-label' });
      main.createDiv({ cls: 'orbis-widget-name', text: outcome.title });
      main.createDiv({ cls: 'orbis-widget-meta', text: reportLine(outcome) });
      if (outcome.kind !== 'saved') row.addClass('is-empty');
    }

    const actions = actionRow(this.footer());
    actionButton(actions, {
      label: t('sources.continue'),
      cta: true,
      onClick: () => {
        this.outcomes = [];
        this.notTried = 0;
        this.stage = 'browse';
        this.render();
      },
    });
  }

  /** The sources, as the first question: which catalog? */
  private renderSources(parent: HTMLElement): void {
    const sources = enabledSources(this.plugin.settings.bookSources);
    if (sources.length === 0) {
      parent.createDiv({ cls: 'orbis-library-empty-body', text: t('sources.none_enabled') });
      return;
    }
    const list = pickPanel(parent);
    for (const source of sources) {
      const row = list.createDiv({ cls: 'orbis-pick-row' });
      const main = row.createDiv({ cls: 'orbis-pick-label' });
      main.createDiv({ cls: 'orbis-widget-name', text: source.name });
      main.createDiv({ cls: 'orbis-widget-meta', text: source.url });
      setIcon(row.createDiv({ cls: 'orbis-summary-chevron' }), 'chevron-right');
      onActivate(row, () => void this.openSource(source));
    }
  }

  /** One feed: where you are, a way back, a search box when the feed has one, its rows, and its next page. */
  private renderFeed(parent: HTMLElement, place: Place): void {
    // The Library's own back affordance, class and all: this is the same gesture in a different dialog, and drawing a
    // second kind of back button would be two answers to one question.
    const bar = parent.createDiv({ cls: 'orbis-library-header' });
    const back = bar.createEl('button', { cls: 'clickable-icon orbis-library-back' });
    setIcon(back, 'arrow-left');
    back.setAttribute('aria-label', t('action.back'));
    back.addEventListener('click', () => {
      // Leaving results leaves the query behind with them — see `go`.
      this.searchQuery = '';
      // The row this step was opened from, so the keyboard goes back where it came from rather than to the top of
      // the list. Claimed after the render, since the row is drawn by it — see `claimFocusSoon`.
      const from = this.stack[this.stack.length - 1]?.from;
      this.stack.pop();
      // Out of the source entirely is where a basket ends — everything inside one source keeps it, which is the whole
      // point of a basket in a catalog you have to walk into.
      if (this.stack.length === 0) {
        this.source = null;
        this.picked.clear();
      }
      this.render();
      const row = from ? this.modalEl.querySelector<HTMLElement>(`[data-orbis-focus="${CSS.escape(from)}"]`) : null;
      if (row) claimFocusSoon(row);
    });
    bar.createDiv({ cls: 'orbis-widget-meta', text: this.source?.name ?? '' });

    // **A way out to the catalog's own website, when the feed offers one.** Some catalogs refuse over OPDS what they
    // serve happily in a browser — Gutenberg's bot protection blocks the facet endpoints its own feed advertises — and
    // no care on this side changes that. `rel="alternate"` is the feed's own address for this page, so offering it is
    // handing over a link they published rather than guessing at how their URLs are built.
    const browserUrl = place.feed.alternate ? resolveOpdsHref(place.feed.alternate, place.url) : null;
    if (browserUrl) {
      const open = bar.createEl('button', { cls: 'clickable-icon' });
      setIcon(open, 'external-link');
      open.setAttribute('aria-label', t('sources.open_in_browser'));
      open.addEventListener('click', () => window.open(browserUrl, '_blank'));
    }

    if (place.feed.searchTemplate || place.feed.searchDescription || this.searchTemplate) {
      this.renderSearch(parent, place);
    }

    // **Links the catalog itself refuses are not drawn.** See `knownIssueFor`: a row that always fails looks like a way
    // in and answers with a refusal. Counted and logged rather than silently dropped, so "the catalog offered nothing"
    // and "we hid two things" stay different observations.
    // **A row that goes nowhere is not drawn, and neither is one the catalog refuses.** Calibre offers "Library:
    // calibre-library — change calibre library to: calibre-library" whether or not there is another library to change
    // to, and its href is the feed's own `self`: a tap costing a request that lands where it started. Recognized by
    // that rather than by Calibre's id scheme, so it holds for any catalog that does the same and leaves a genuine
    // second library — a different `library_id` — in the list. See `knownIssueFor` for the other half.
    const here = place.feed.self ? resolveOpdsHref(place.feed.self, place.url) : null;
    const shown = place.feed.entries.filter((entry) => {
      const url = entry.subfeed ? resolveOpdsHref(entry.subfeed, place.url) : null;
      const issue = url ? knownIssueFor(url) : null;
      if (issue) this.log(`hid "${entry.title}": ${issue}`);
      if (!issue && url && here && url === here) {
        this.log(`hid "${entry.title}": it links to this feed itself`);
        return false;
      }
      return !issue;
    });
    if (shown.length === 0) {
      parent.createDiv({ cls: 'orbis-library-empty-body', text: t('sources.empty_feed') });
    }
    const list = pickPanel(parent);
    for (const entry of shown) this.renderEntry(list, entry, place);

    // **Paging is the feed's own two links, not a history of our own.** A page replaces the one it came from, so Back
    // still means "out of this category" however far you paged — and going back a page is `rel="previous"`, which is
    // the feed's answer to the same question and is right even when a server's pages have shifted underneath you.
    const paging = parent.createDiv({ cls: 'orbis-sources-paging' });
    const pageButton = (href: string, label: string): void => {
      const btn = paging.createEl('button', { cls: 'orbis-rule-add', text: label });
      btn.addEventListener('click', () => {
        const url = resolveOpdsHref(href, place.url);
        this.log(`page: href=${forLog(href)} base=${forLog(place.url)} → ${url ? forLog(url) : 'unresolvable'}`);
        // Page two of a search is still that search — carried so the box keeps the words that produced it.
        if (url) void this.go(url, place.label, { replace: true, search: place.search });
      });
    };
    if (place.feed.previous) pageButton(place.feed.previous, t('sources.previous_page'));
    if (place.feed.next) pageButton(place.feed.next, t('sources.next_page'));
  }

  private renderSearch(parent: HTMLElement, place: Place): void {
    const row = new Setting(parent).setName(t('sources.search'));
    row.settingEl.addClass('orbis-setting-stacked');
    row.addSearch((box) => {
      box.setPlaceholder(t('sources.search_placeholder'));
      box.setValue(this.searchQuery).onChange((v) => (this.searchQuery = v));
      box.inputEl.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        /**
         * **We handled the key, so nothing else may.** Without this the press has a default action left over, and
         * `search()` moves the ground under it: it repaints the dialog before the request goes out, so by the time
         * Chromium acts on the key the input is gone and the keyboard has landed on the chrome ×, which it then
         * activates — a trusted click, `detail: 0` — and pressing Enter after typing a search closes the dialog.
         *
         * Every other Enter handler in the plugin does the same.
         */
        e.preventDefault();
        e.stopPropagation();
        void this.search(place);
      });
    });
    row.addButton((btn) => btn.setButtonText(t('sources.search_go')).onClick(() => void this.search(place)));
  }

  /** One row: what the entry is, and the one thing tapping it does. */
  private renderEntry(parent: HTMLElement, entry: OpdsEntry, place: Place): void {
    const row = parent.createDiv({ cls: 'orbis-pick-row' });
    // Identified so Back can come back to it — see `Place.from`.
    const rowKey = `entry:${entry.id || entry.title}`;
    row.dataset.orbisFocus = rowKey;
    const main = row.createDiv({ cls: 'orbis-pick-label' });
    main.createDiv({ cls: 'orbis-widget-name', text: entry.title || t('sources.untitled') });
    // **The author is not always in the author field.** Gutenberg puts it in `<content>` — "Jane Doe" and nothing
    // else — which the parser reads as the entry's summary, because that is what the spec says it is. So the second
    // line is the authors when the feed names them and the summary when it does not, clamped, which reads as the
    // author on Gutenberg and as the opening of a blurb on Calibre. Better than a row that says only its title.
    const known = [entry.authors.join(', '), yearOf(entry.published)].filter(Boolean).join(' · ');
    const meta = known || clampToWords(entry.summary, 80);
    if (meta) main.createDiv({ cls: 'orbis-widget-meta', text: meta });

    if (entry.subfeed) {
      setIcon(row.createDiv({ cls: 'orbis-summary-chevron' }), 'chevron-right');
      const url = resolveOpdsHref(entry.subfeed, place.url);
      onActivate(row, () => {
        if (url) void this.go(url, entry.title, { from: rowKey });
      });
      return;
    }

    // **What a row can do is decided before it is tapped.** An entry whose only file is a PDF or a DRM-wrapped type
    // says so here, rather than downloading something that fails at the door — see `bestAcquisition`.
    const pick = bestAcquisition(entry);
    if (!pick) {
      row.addClass('is-empty');
      main.createDiv({ cls: 'orbis-widget-meta', text: t('sources.no_readable_format') });
      return;
    }
    // **The feed's own words for the file, and its size.** Gutenberg publishes one book as two entries with identical
    // titles — one edition with images, one without — so a row showing only "EPUB" makes the reader guess which is
    // which. "EPUB (older E-readers) · 545 KB" against "EPUB3 (E-readers incl. Send-to-Kindle) · 24 MB" answers it,
    // and the size is the number that matters when the difference is between a book and forty of them.
    const file = [pick.link.title || pick.ext.toUpperCase(), sizeLabel(pick.link.length)].filter(Boolean).join(' · ');
    main.createDiv({ cls: 'orbis-widget-meta', text: file });

    // **A tick, not a Download button per row.** You often want three of the twenty-five on a page, and a button each
    // means three separate waits with nothing saying how far along the set is. The whole row is the target, because a
    // checkbox on a phone is a small thing to hit accurately.
    const key = entry.id || `${entry.title}|${pick.link.href}`;
    const url = resolveOpdsHref(pick.link.href, place.url);
    if (!url) {
      row.addClass('is-empty');
      main.createDiv({ cls: 'orbis-widget-meta', text: t('sources.no_readable_format') });
      return;
    }
    const tick = row.createDiv({ cls: 'orbis-pick-tick', text: this.picked.has(key) ? '✓' : '' });
    row.toggleClass('is-current', this.picked.has(key));
    onActivate(row, () => {
      if (this.picked.has(key)) this.picked.delete(key);
      // Resolved here, not at download time: by then this page may be three navigations ago.
      else
        this.picked.set(key, {
          title: entry.title || t('sources.untitled'),
          authors: entry.authors,
          url,
          ext: pick.ext,
          label: pick.link.title || pick.ext.toUpperCase(),
          size: pick.link.length,
          coverUrl: coverFor(entry, place.url),
        });
      tick.setText(this.picked.has(key) ? '✓' : '');
      row.toggleClass('is-current', this.picked.has(key));
      // The footer counts the basket, so it is redrawn — and only it, so the list does not jump under a thumb that is
      // still choosing.
      this.renderDownloadBar();
    });
  }

  /**
   * The footer: what is ticked, and the one button that fetches it.
   *
   * In the dialog's real footer rather than at the end of the list, because a list of twenty-five scrolls and a button
   * you have to scroll to is a button you cannot find while choosing. `OrbisModal.footer()` is the row outside the
   * scrolling body — the same place every other Orbis dialog puts its actions.
   */
  private renderDownloadBar(): void {
    const footer = this.footer();
    footer.empty();
    if (!this.source || this.stack.length === 0) return;
    const count = this.picked.size;
    /**
     * **A row with words in it, so it stays an Obsidian `Setting`.** Everything else that holds buttons is a plain
     * `actionRow`; this one states the basket's count and the folder the files land in, which is what a settings row
     * is for. `.orbis-dialog-bar` carries the phone override that stops Obsidian giving each button the full width of
     * the dialog.
     */
    const bar = new Setting(footer);
    bar.settingEl.addClass('orbis-dialog-bar');
    bar.setName(count === 0 ? t('sources.pick_to_download') : t('sources.picked', { count: String(count) }));
    // Where they will land, while there is still a choice being made — the review says it again, because that is the
    // screen where a decision is confirmed, and a folder is worth reading twice when everything in it syncs.
    bar.setDesc(t('sources.download_folder_note', { folder: this.plugin.settings.bookSourcesFolder || '/' }));
    /**
     * **A way out within reach of the thumb.**
     *
     * "Close", not "Cancel": nothing here has been started, and the button beside it does not commit anything —
     * Download opens the review, which has the real confirm and its own pair. It is here for the reason the voice
     * picker has a Done button with nothing to confirm: on a full-height scrolling panel the × is at the top of the
     * screen and the reader is at the bottom of it.
     */
    bar.addButton((btn) => btn.setButtonText(t('action.close')).onClick(() => this.close()));
    // A way to empty the basket, and only when there is something in it: a basket that can only grow is one you have
    // to close the dialog to escape.
    if (count > 0) {
      bar.addButton((btn) =>
        btn.setButtonText(t('sources.clear_picked')).onClick(() => {
          this.picked.clear();
          // The whole page, because every tick on it has to come off.
          this.render();
        })
      );
    }
    bar.addButton((btn) =>
      btn
        .setButtonText(t('sources.download'))
        .setCta()
        .setDisabled(count === 0)
        .onClick(() => {
          this.stage = 'review';
          this.render();
        })
    );
  }

  /**
   * Fetch what is ticked, in order, and say what became of it.
   *
   * **One summary, not one notice per book.** A batch of five that saved three, skipped one and failed one is a single
   * fact about what happened; five notices in a stack is the same information arranged to be unreadable.
   */
  private async download(): Promise<void> {
    const source = this.source;
    if (!source || this.picked.size === 0) return;
    // A copy, because the basket is emptied when the batch lands and the queue must not be emptied under itself.
    const books = [...this.picked.values()];

    this.busy = true;
    this.downloading = true;
    this.stopping = false;
    this.progress = t('sources.downloading', { title: books[0].title, done: '1', total: String(books.length) });
    this.render();
    let batch: Awaited<ReturnType<typeof downloadBooks>>;
    try {
      batch = await downloadBooks(
        {
          app: this.app,
          settings: this.plugin.settings,
          log: this.log,
          shouldStop: () => this.stopping,
          noImagesLabel: t('sources.edition_no_images'),
          onProgress: (title: string, done: number, total: number) => {
            this.progress = t('sources.downloading', { title, done: String(done + 1), total: String(total) });
            this.render();
          },
        },
        source,
        books
      );
    } catch (err) {
      // Whatever went wrong, the dialog does not stay on "Downloading…": it says so, and the basket is still there.
      this.log(`download batch failed: ${err instanceof Error ? err.message : String(err)}`);
      this.busy = false;
      this.downloading = false;
      this.progress = null;
      this.problem = t('sources.failed_write');
      this.render();
      return;
    }
    this.busy = false;
    this.downloading = false;
    this.progress = null;
    this.picked.clear();
    this.outcomes = batch.outcomes;
    this.notTried = batch.notTried;
    // The report is where a batch ends. No notice: the two would be the same sentence, one of them disappearing.
    this.stage = 'report';
    this.render();
    // A downloaded book is a new file, and with the library on a new title note: the Library repaints on the vault
    // event either way, but a dashboard that is open and a catalog that has just grown should not disagree.
    refreshLibraryViews(this.plugin);
  }

  /** Open a source at its own URL — the first request of the session, and only because a row was tapped. */
  private async openSource(source: BookSource): Promise<void> {
    this.source = source;
    this.searchTemplate = null;
    this.searchQuery = '';
    this.stack = [];
    this.picked.clear();
    this.problem = null;
    // **The language goes into the first request, not into a filter afterwards.** Gutenberg's feed carries no language
    // per entry, so there is nothing to filter — and asking for one is a term in its query: `?query=l.en` reads as
    // "everything, in English". Paging and categories inherit it, because the links the server builds carry the query
    // it answered.
    await this.go(this.inLanguage(source.url), source.name);
  }

  /** The URL with this source's language asked for, when it has one and the catalog can be asked — see `quirks.ts`. */
  private inLanguage(url: string): string {
    const code = this.source?.language ?? '';
    const term = code ? languageTerm(url, code) : null;
    return term ? withLanguageTerm(url, term) : url;
  }

  /**
   * Fetch a feed and show it.
   *
   * A failure leaves the reader where they were with a sentence saying why — not on an empty page, and not one step
   * deeper into a stack that has nothing in it.
   */
  private async go(
    url: string,
    label: string,
    opts: { replace?: boolean; search?: boolean; from?: string } = {}
  ): Promise<void> {
    const source = this.source;
    if (!source) return;
    this.busy = true;
    this.render();
    const result = await fetchFeed(this.app, source, url, this.log);
    this.busy = false;
    if (!result.ok) {
      this.problem = failureText(result);
      this.render();
      return;
    }
    // A page that arrived answers whatever the last one failed at.
    this.problem = null;
    // **The words in the box belong to the page showing.** Anywhere but a page of results, the box is empty: a query
    // left behind after Back reads as a filter still in force, and the list underneath it disagrees.
    if (!opts.search) this.searchQuery = '';
    const place: Place = {
      feed: result.feed,
      url: result.url,
      label: label || result.feed.title,
      search: opts.search,
      from: opts.from,
    };
    if (opts.replace && this.stack.length) this.stack[this.stack.length - 1] = place;
    else this.stack.push(place);
    this.render();
  }

  /**
   * Search this source.
   *
   * Two requests the first time — the OpenSearch description, then the search itself — and one thereafter, because the
   * template is remembered for as long as the dialog is open. A search replaces the page it was run from: it is a new
   * question about the same source rather than a step deeper into it.
   */
  private async search(place: Place): Promise<void> {
    const source = this.source;
    const query = this.searchQuery.trim();
    if (!source || !query) return;
    // The feed's own template first: Calibre publishes one outright, which makes searching a single request. The
    // description fetch is for feeds that point at one instead — see `searchTemplate`.
    if (place.feed.searchTemplate) this.searchTemplate = place.feed.searchTemplate;
    if (!this.searchTemplate) {
      const href = place.feed.searchDescription;
      const url = href ? resolveOpdsHref(href, place.url) : null;
      if (!url) {
        this.problem = t('sources.no_search');
        this.render();
        return;
      }
      this.busy = true;
      this.render();
      const body = await fetchSourceBody(this.app, source, url, this.log);
      this.busy = false;
      if (!body.ok) {
        this.problem = failureText(body);
        this.render();
        return;
      }
      this.searchTemplate = parseOpenSearchTemplate(body.text);
      if (!this.searchTemplate) {
        this.problem = t('sources.no_search');
        this.render();
        return;
      }
    }
    // The term joins what was typed rather than the URL: a template's `{searchTerms}` is where a catalog expects its
    // filters, and Gutenberg answers `query=Finn l.en` with a feed retitled "Books: Finn  Language: English".
    const code = source.language ?? '';
    const term = code ? languageTerm(place.url, code) : null;
    const searchUrl = resolveOpdsHref(searchUrlFrom(this.searchTemplate, term ? `${query} ${term}` : query), place.url);
    // Replaced only when the page it was run from is itself a page of results: a second query is the same question
    // asked again, while a first one is a step in from wherever the reader was — see `Place.search`.
    if (searchUrl) {
      await this.go(searchUrl, t('sources.results_for', { query }), { replace: place.search === true, search: true });
    }
  }
}
