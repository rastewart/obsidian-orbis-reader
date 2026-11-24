import { ButtonComponent, Notice, setIcon } from 'obsidian';
import { actionButton, actionRow } from '../controls';
import { getActiveLang, t } from '../i18n';
import { claimFocusSoon, createOrbisPopup, iconButton, type OrbisPopupHost } from '../ui-utils';
import { SCRIPT_LINK_ATTR } from './book-html-guard';
import {
  describeCharacter,
  deviationRow,
  hiddenIn,
  type LinkDeviation,
  type LinkFacts,
  linkDeviations,
  linkFacts,
  linkTextShown,
  readLinkAddress,
  showInvisibles,
} from './link-address';

/**
 * Every link that leaves the book is shown before it is opened. **Open** or **Cancel**, and a copy button beside the
 * address.
 *
 * **Facts, in rows, the same for every link.** **Link type** (named from the scheme), **Domain** where there is one,
 * then **Link text** and **Link address** in the code-font box, to be read side by side — the address as the browser
 * will open it, the domain in bold. No sentence draws a conclusion: when the link differs from what it appears to be,
 * an orange line under the row it concerns says how (`linkDeviations`), because none of those differences proves a
 * link unsafe — measured, nearly every one is a publisher's short domain or a typo. Characters the reader cannot see
 * get a grey note instead (`hiddenIn`): the rows already show the truth about them, so they are explained, not flagged.
 *
 * **A difference changes the decision's surroundings, not the dialog's shape.** A plain sentence above the buttons
 * says what it means for the reader, and **Open** takes the theme's destructive color instead of the primary one.
 *
 * **Not part of Link preview, and nothing turns it off.** Link preview is a reading preference for links inside the
 * book; this is the one place a reader can see that a link's text and its address disagree, and a switch would hand
 * that back to whoever made the book. A `javascript:` link is not shown at all — refused, with a notice. The book
 * guard has normally removed its address already, so `watch` is what hears it selected.
 *
 * **Cancel holds the keyboard**, so Enter pressed by habit does not skip the check. The address is never cut and
 * wraps anywhere: all of it is the thing being read. See docs/design/security.md, "Links out of a book".
 */
export class LinkCheck {
  private cleanup: (() => void) | null = null;

  constructor(
    private readonly host: OrbisPopupHost,
    private readonly debug: (message: string) => void
  ) {}

  /** `address` is the link's own `href` attribute — the string foliate would have opened. `anchor` is the link. */
  show(address: string, anchor: Element | null): void {
    const { kind, url } = readLinkAddress(address);
    if (kind === 'script') {
      this.refuseScript();
      return;
    }
    const deviations = linkDeviations(address, linkTextOf(anchor));
    const hidden = hiddenIn(address, linkTextOf(anchor));
    this.cleanup?.();
    const { popupEl, close } = createOrbisPopup(this.host, {
      scrollsInside: true,
      title: t('open_link_popup.title'),
      desktopWidth: 'min(480px, 92vw)',
      mobileMaxWidth: 480,
      lockMobileHeights: false, // no text field, so no keyboard to hold the reader still for
      // Nor half the screen kept free for one: as tall as its content, up to the whole screen, scrolling only past it.
      mobileFillHeight: true,
      onClose: () => {
        if (this.cleanup === close) this.cleanup = null;
      },
    });
    this.cleanup = close;
    // Buttons outside the scroll (`scrollsInside`), so a long address cannot push them off a phone's screen.
    const body = popupEl.createDiv({ cls: 'orbis-popup-scroll' });

    const facts = linkFacts(address);
    const grid = body.createDiv({ cls: 'orbis-link-check-grid' });
    const under = (cell: HTMLElement, which: 'domain' | 'text' | 'address') => {
      for (const deviation of deviations.filter((d) => deviationRow(d) === which)) {
        const line = cell.createDiv({ cls: 'orbis-link-check-deviation' });
        setIcon(line.createSpan({ cls: 'orbis-link-check-deviation-icon' }), 'alert-triangle');
        line.createSpan({ text: describeDeviation(deviation) });
      }
    };

    row(grid, t('open_link_popup.link_type')).setText(describeType(facts));
    if (facts.domain) {
      const cell = row(grid, t('open_link_popup.domain'));
      cell.createEl('strong', { text: facts.domain });
      under(cell, 'domain');
    }
    const textCell = row(grid, t('open_link_popup.link_text'));
    textCell.createDiv({ cls: 'orbis-link-check-value', text: describeLinkText(anchor) });
    under(textCell, 'text');
    if (hidden.text)
      textCell.createDiv({
        cls: 'orbis-link-check-note',
        text: t('open_link_popup.hidden_text_note', { code: hidden.text }),
      });
    const addressCell = row(grid, t('open_link_popup.link_address'));
    const addressLine = addressCell.createDiv({ cls: 'orbis-link-check-line' });
    fullAddress(addressLine.createDiv({ cls: 'orbis-link-check-value' }), address, url);
    // Beside the value it copies, the way a code block offers its own copy button.
    iconButton(new ButtonComponent(addressLine), 'copy', t('open_link_popup.copy_address'), () => {
      // The address exactly as the book holds it, not the copy above with its invisibles written out.
      void navigator.clipboard.writeText(address).then(() => new Notice(t('notices.address_copied_to_clipboard')));
    });
    under(addressCell, 'address');
    if (hidden.address)
      addressCell.createDiv({ cls: 'orbis-link-check-note', text: t('open_link_popup.hidden_address_note') });

    // Beside the buttons, not in the scroll: it is about the decision they make. An address no browser can open says so
    // where Open would be, so the missing button is explained; "may be unsafe… Open it only if" would offer what is gone.
    if (kind === 'invalid')
      popupEl.createEl('p', { cls: 'orbis-link-check-caution', text: t('open_link_popup.cannot_open') });
    else if (deviations.length)
      popupEl.createEl('p', { cls: 'orbis-link-check-caution', text: t('open_link_popup.may_be_unsafe') });

    const footer = actionRow(popupEl, { placement: 'footer' });
    const cancel = actionButton(footer, {
      label: t('action.cancel'),
      onClick: (ev) => {
        ev.stopPropagation();
        close();
      },
    });
    // Nothing to open for an address the browser cannot parse; the dialog still says what the link holds.
    if (kind !== 'invalid') {
      actionButton(footer, {
        label: t('open_link_popup.open'),
        cta: !deviations.length,
        destructive: deviations.length > 0,
        onClick: (ev) => {
          ev.stopPropagation();
          close();
          this.debug(`link check — opening a ${kind} link, ${deviations.length} difference(s)`);
          window.open(address, '_blank');
        },
      });
    }
    claimFocusSoon(cancel);
  }

  /**
   * Listen on a freshly loaded section for a link whose `javascript:` address the book guard removed — see
   * `SCRIPT_LINK_ATTR`. Without its address foliate sees text, so this is the only thing that hears it selected.
   */
  watch(doc: Document): void {
    doc.addEventListener('click', (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (target?.closest?.(`a[${SCRIPT_LINK_ATTR}]`)) this.refuseScript();
    });
  }

  private refuseScript(): void {
    this.debug('link check — refused a script link (javascript:, vbscript: or data:)');
    new Notice(t('notices.script_links_not_opened'));
  }

  /** Close the dialog if it is open (book close / leaf teardown). */
  dispose(): void {
    this.cleanup?.();
    this.cleanup = null;
  }
}

/**
 * One row: its label, and the cell its value goes in — returned to fill. Beside each other on a wide screen, the label
 * above on a phone (see the stylesheet). Short facts are plain text; the link text and address go in the code-font box
 * (`orbis-link-check-value`), the look of the Source ID field, because those two are long and are read side by side.
 */
function row(grid: HTMLElement, label: string): HTMLElement {
  grid.createDiv({ cls: 'orbis-link-check-label', text: label });
  return grid.createDiv({ cls: 'orbis-link-check-cell' });
}

function describeType(facts: LinkFacts): string {
  switch (facts.type) {
    case 'web':
      return t('open_link_popup.type_web');
    case 'email':
      return t('open_link_popup.type_email');
    case 'phone':
      return t('open_link_popup.type_phone');
    case 'obsidian':
      return facts.detail
        ? t('open_link_popup.type_obsidian_action', { action: facts.detail })
        : t('open_link_popup.type_obsidian');
    case 'file':
      return t('open_link_popup.type_file');
    case 'app':
      return t('open_link_popup.type_app', { scheme: facts.detail ?? '' });
    case 'invalid':
      return t('open_link_popup.type_invalid');
  }
}

/**
 * The address as the browser will open it — a look-alike letter in its `xn--` form, a hidden character in the site
 * name gone — with the site in bold, so `https://bank.example@elsewhere.invalid/` shows which part is the site. An
 * address the browser cannot parse is shown as the book wrote it.
 */
function fullAddress(el: HTMLElement, raw: string, url: URL | undefined): void {
  if (!url) {
    el.setText(showInvisibles(raw));
    return;
  }
  const href = showInvisibles(url.href);
  const credentials = url.username ? `${url.username}${url.password ? `:${url.password}` : ''}@` : '';
  const before = `${url.protocol}//${credentials}`;
  if (!url.hostname || !href.startsWith(before + url.hostname)) {
    el.setText(href);
    return;
  }
  el.appendText(before);
  el.createEl('strong', { text: url.hostname });
  el.appendText(href.slice(before.length + url.hostname.length));
}

/** The link's text as the book holds it, for comparing — a picture link's description when it has no words. */
function linkTextOf(anchor: Element | null): string {
  const text = anchor?.textContent?.trim() ?? '';
  return text || (anchor?.querySelector('img')?.getAttribute('alt') ?? '');
}

/** The link's text as shown; for a link that is only a picture, the picture's description; otherwise that there is none. */
function describeLinkText(anchor: Element | null): string {
  const text = linkTextShown(anchor?.textContent ?? '');
  if (text) return text;
  // An image map's `<area>` is part of a picture and holds no text; its own `alt` names that part.
  const picture = anchor?.localName === 'area' ? anchor : anchor?.querySelector('img');
  if (!picture) return t('open_link_popup.no_text');
  const alt = linkTextShown(picture.getAttribute('alt') ?? '');
  return alt ? t('open_link_popup.picture_alt', { alt }) : t('open_link_popup.picture');
}

function describeDeviation(d: LinkDeviation): string {
  switch (d.kind) {
    case 'other-letters':
      return t('open_link_popup.other_letters', {
        chars: d.chars.map((ch) => describeCharacter(ch, getActiveLang())).join(', '),
      });
    case 'user-name':
      return t('open_link_popup.user_name', { name: showInvisibles(d.name), host: d.host });
    case 'text-names-other-site':
      return t('open_link_popup.text_names_other_site', { shown: d.shown, host: d.host });
  }
}
