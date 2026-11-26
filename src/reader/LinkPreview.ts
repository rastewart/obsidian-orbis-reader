import { actionButton } from '../controls';
import { t } from '../i18n';
import { createOrbisPopup } from '../ui-utils';
import type { LinkPreviewHost } from './LinkPreviewHost';
import type { ReaderContext } from './ReaderContext';

/**
 * Internal-link hover/tap preview: intercepts clicks on in-book links, extracts a
 * text snippet from the link target's section (loading it off-screen if needed), and
 * shows it in a popup with a "Go" button. Self-contained UI feature wired per-section
 * from the view's Foliate `load` handler. See docs/design/reader-architecture.md.
 */
export class LinkPreview {
  private cleanup: (() => void) | null = null;

  constructor(
    private readonly ctx: ReaderContext,
    private readonly host: LinkPreviewHost
  ) {}

  /** Install the link-click interceptor on a freshly-loaded section document. */
  setup(doc: Document, sectionIndex: number): void {
    // Always attach; check the setting at click time (not here) so toggling link
    // preview in settings takes effect immediately — the listener is installed once
    // per section at load and settings changes don't re-inject the section docs.
    doc.addEventListener(
      'click',
      (e: MouseEvent) => {
        if (!this.host.linkPreviewEnabled) return;
        const anchor = (e.target as Element)?.closest('a');
        if (!anchor) return;
        const href = anchor.getAttribute('href');
        if (!href) return;
        // ANY scheme means the link leaves the book, so there is nothing here to preview and the click belongs to
        // foliate: it emits `external-link` and, uncancelled, hands the URL to the system. A list of named
        // schemes would swallow `obsidian://orbis-nav` — a link from one book of a converted set to another — and
        // show it as "could not load preview", because a preview of a different book is not a thing this can
        // produce. The test is foliate's own `isExternal`, so the two agree by construction. It also covers the
        // `kindle:` case, which is a MOBI position link foliate resolves natively.
        if (/^(?!blob:)\w+:/i.test(href) || href.startsWith('//')) return;

        e.preventDefault();
        e.stopPropagation();

        const rawSection = (this.ctx.bookSections as unknown as Array<{ resolveHref?: (h: string) => string }>)[
          sectionIndex
        ];
        const resolved = rawSection?.resolveHref?.(href) ?? href;
        const hashIdx = resolved.indexOf('#');
        const sectionPath = hashIdx >= 0 ? resolved.slice(0, hashIdx) : resolved;
        const anchorId = hashIdx >= 0 ? resolved.slice(hashIdx + 1) : '';

        void this.loadAndShowLinkPreview(doc, resolved, sectionPath, anchorId);
      },
      true
    );
  }

  private async loadAndShowLinkPreview(
    sourceDoc: Document,
    resolvedHref: string,
    sectionPath: string,
    anchorId: string
  ): Promise<void> {
    let targetIdx = this.host.sectionHrefMap.get(sectionPath);
    // A bare `#id`: this same document, unless the book's ids are book-wide (FB2's notes) — see `fragmentSectionIndex`.
    if (targetIdx === undefined && !sectionPath) {
      targetIdx = this.host.fragmentSectionIndex(anchorId) ?? this.host.sectionForDoc(sourceDoc);
    }
    if (targetIdx === undefined) {
      // Fallback for MOBI: href may be a bare numeric section index not in the map.
      const parsed = parseInt(sectionPath, 10);
      if (!isNaN(parsed) && String(parsed) === sectionPath && parsed >= 0 && parsed < this.ctx.bookSections.length) {
        targetIdx = parsed;
      }
    }
    const sourceSectionIdx = this.host.sectionForDoc(sourceDoc);
    let previewText = '';

    if (targetIdx === undefined) {
      previewText = '';
    } else if (targetIdx === sourceSectionIdx) {
      previewText = this.extractLinkPreviewText(sourceDoc, anchorId);
    } else {
      const rawSections = this.ctx.bookSections as unknown as Array<{
        createDocument?(): Promise<Document>;
      }>;
      const targetSection = rawSections[targetIdx];
      if (targetSection?.createDocument) {
        try {
          const targetDoc = await targetSection.createDocument();
          previewText = this.extractLinkPreviewText(targetDoc, anchorId);
        } catch (err) {
          this.ctx.debug(
            `linkPreview: createDocument error: ${err instanceof Error ? err.message : String(err)}`,
            'display'
          );
          previewText = '';
        }
      }
    }

    this.showLinkPreviewPopup(sourceDoc, previewText, resolvedHref);
  }

  private extractLinkPreviewText(doc: Document, anchorId: string): string {
    let startEl: Element | null = null;

    if (anchorId) {
      const anchor = doc.getElementById(anchorId);
      if (anchor) {
        if ((anchor.textContent ?? '').trim().length > 10) {
          startEl = anchor;
        } else {
          // Empty anchor used as location target — text lives in the parent block.
          const block = anchor.closest('p, li, td, aside, section, blockquote');
          const parent = block ?? anchor.parentElement;
          // Avoid using body as start — it would dump the whole document.
          startEl = parent && parent !== doc.body ? parent : anchor.nextElementSibling;
        }
      }
    }
    if (!startEl) startEl = doc.body;

    const blockTags = new Set([
      'p',
      'div',
      'li',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'blockquote',
      'td',
      'tr',
      'section',
      'article',
      'aside',
    ]);
    function elToText(el: Element): string {
      let out = '';
      for (const node of Array.from(el.childNodes)) {
        if (node.nodeType === Node.TEXT_NODE) {
          // Collapse source-file whitespace (newlines + indentation) to single spaces,
          // the way the browser renders it — otherwise pretty-printed EPUB HTML leaks
          // stray line breaks and indents into the preview.
          out += (node.textContent ?? '').replace(/\s+/g, ' ');
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          const tag = (node as Element).tagName.toLowerCase();
          if (tag === 'br') {
            out += '\n';
          } else if (blockTags.has(tag)) {
            const inner = elToText(node as Element).trim();
            if (inner) out += (out && !out.endsWith('\n') ? '\n' : '') + inner + '\n';
          } else {
            out += elToText(node as Element);
          }
        }
      }
      return out;
    }

    let text = '';
    let el: Element | null = startEl;
    while (el && text.length < 1200) {
      const chunk = elToText(el)
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      if (chunk) text += (text ? '\n\n' : '') + chunk;
      el = el.nextElementSibling;
    }
    text = text.replace(/\n{3,}/g, '\n\n').trim();
    if (text.length > 1000) text = text.slice(0, 1000) + '…';
    return text;
  }

  private showLinkPreviewPopup(sourceDoc: Document, previewText: string, resolvedHref: string): void {
    // Popup lives in the host document so it stacks above all Obsidian UI (iframes can't escape their stacking context)
    this.cleanup?.();

    // Any click inside the iframe that isn't on a link dismisses the popup — the shared
    // helper's own outside-click handling only covers the host document, since a plain
    // click inside a cross-origin-like iframe never bubbles out to it.
    const iframeOutsideClick = (ev: MouseEvent) => {
      if (!(ev.target as Element)?.closest?.('a')) close();
    };
    // Escape while focus is inside the iframe fires on sourceDoc, not activeDocument —
    // the shared helper only listens on the latter.
    const onSourceKeydown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') close();
    };

    const { popupEl: popup, close } = createOrbisPopup(this.ctx, {
      title: t('reading_page.link_preview'),
      dismissOnOutsideClick: true,
      // Takes the keyboard like any other dialog. A preview follows the reader's eye, but it holds a *Go* button,
      // and without focus a keyboard reader who followed a link would get a dialog they could not reach while Tab
      // went on highlighting the links in the book behind it. Holding focus
      // here turns no pages (the reader's keys stand down for `.orbis-popup`), and that is what Escape is for.
      showBackdrop: false,
      zIndex: 2147483647,
      onClose: () => {
        sourceDoc.removeEventListener('click', iframeOutsideClick, true);
        sourceDoc.removeEventListener('keydown', onSourceKeydown);
        if (this.cleanup === close) this.cleanup = null;
      },
    });
    popup.id = 'orbis-preview';
    this.cleanup = close;

    // `orbis-link-preview-text` in styles.css; dimmed when there was nothing to show.
    const textEl = popup.createDiv({ cls: 'orbis-link-preview-text' });
    textEl.textContent = previewText || t('link_preview_popup.could_not_load_preview');
    textEl.toggleClass('is-unavailable', !previewText);
    // Theme just the text box (not the surrounding dialog) to match the reader page —
    // background, text color, and the same brightness filter — so it reads like a
    // slice of the book inside the otherwise-default dialog chrome.
    const { bg, fg, filter } = this.ctx.readerColors();
    textEl.style.background = bg;
    textEl.style.color = fg;
    textEl.style.filter = filter;

    const btnRow = popup.createDiv({ cls: 'orbis-link-preview-actions' });
    // `mod-cta` rather than inline styling, so the button follows the theme and has the same shape and size as
    // every other dialog's primary action.
    actionButton(btnRow, {
      label: t('link_preview_popup.go'),
      cta: true,
      onClick: (ev) => {
        ev.stopPropagation();
        close();
        void this.ctx.foliateView?.goTo(resolvedHref);
      },
    });

    window.setTimeout(() => {
      sourceDoc.addEventListener('click', iframeOutsideClick, true);
      sourceDoc.addEventListener('keydown', onSourceKeydown);
    }, 0);

    /**
     * **Placed like every other dialog, and nothing else on screen is touched.** The preview used to hide
     * Obsidian's mobile toolbars and the device's status bar while it was open — which moved its own top up under
     * where the status bar had been, so it sat higher than every other dialog, and on closing it put both back
     * even in focus mode, which had hidden them itself. `createOrbisPopup` places it; see docs/design/dialog-system.md.
     */
  }

  /** Close any open preview popup (book close / leaf teardown). */
  dispose(): void {
    this.cleanup?.();
    this.cleanup = null;
  }
}
