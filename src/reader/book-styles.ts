// Put a book's own stylesheets back, by inlining them.
//
// **What this is for.** Foliate serves every resource in a book as a `blob:` URL (`epub.js`'s `Loader.createURL`), so a
// chapter's `<link rel="stylesheet">` points at one. `installFoliateSrcdocPatch` then loads that chapter as `srcdoc`,
// which makes the document **same-origin with the host page** — the whole point, since annotations and selection need
// our listeners to see its events. Same-origin also means the frame **inherits Obsidian's own CSP**, and that policy is
// `style-src 'unsafe-inline' 'self'` (and Google's font host). A `blob:` URL is none of these, so every one of those
// stylesheets is refused. A `blob:`
// URL document inherits the embedder's policy for the same reason `srcdoc` does, both being local schemes, so loading
// the chapter from its blob would not help.
//
// Obsidian's devtools Issues panel names the failure as `about:srcdoc:0`, which distinguishes it from any of the app's
// own chrome. `BOOK_CSP` is not the cause: its `style-src` allows `blob:`, but the two policies apply together, and
// the inherited one refuses it.
//
// **Inlining is the only route, not a preference.** A `<meta>` policy can only ever restrict further — browsers
// enforce multiple policies as an intersection — so the inherited `style-src` cannot be loosened from inside the
// frame. Giving the frame an opaque origin again would fix the CSP and break annotations, which is the trade the
// srcdoc patch already decided. `'unsafe-inline'` is granted, so a `<style>` element carrying the same bytes is
// allowed where the `<link>` was not.
//
// **Nothing is rewritten.** Foliate's `replaceCSS` has already resolved every `url()` and `@import` in the sheet
// to an absolute `blob:` URL, so moving the text into the document cannot break a relative path — there are none
// left to break.

import { bookElement } from './book-element';

/** Reads a `blob:` URL created by this origin. Injected so the logic is testable without a browser. */
export type FetchText = (url: string) => Promise<string>;

/** How deep `@import` chains are followed before giving up. Real books use one level or none. */
const MAX_IMPORT_DEPTH = 4;

const isBlobUrl = (url: string): boolean => url.slice(0, 5).toLowerCase() === 'blob:';

/**
 * Follow `@import "blob:…"` inside a sheet and splice each one in.
 *
 * An import is fetched by the same CSS engine that fetches a `<link>`, so it is refused by the same directive —
 * inlining the outer sheet and stopping there would leave a book that uses imports still unstyled, and silently. `seen`
 * keeps a cycle from spinning; the depth cap is the backstop for a chain that is merely
 * long. An import that cannot be read is left as it stands rather than dropped, so the failure stays visible in
 * devtools instead of becoming a rule nobody can find.
 */
async function inlineImports(css: string, fetchText: FetchText, seen: Set<string>, depth: number): Promise<string> {
  if (depth >= MAX_IMPORT_DEPTH) return css;
  const pattern = /@import\s+(?:url\(\s*)?["']?(blob:[^"')\s]+)["']?\s*\)?\s*;?/gi;
  const matches = Array.from(css.matchAll(pattern));
  if (matches.length === 0) return css;

  const replacements = await Promise.all(
    matches.map(async (m) => {
      const url = m[1];
      if (seen.has(url)) return '';
      seen.add(url);
      try {
        return await inlineImports(await fetchText(url), fetchText, seen, depth + 1);
      } catch {
        return null; // unreadable: leave the @import where it is
      }
    })
  );

  let out = '';
  let cursor = 0;
  matches.forEach((m, i) => {
    const start = m.index ?? 0;
    out += css.slice(cursor, start);
    out += replacements[i] ?? m[0];
    cursor = start + m[0].length;
  });
  return out + css.slice(cursor);
}

/**
 * Replace every `blob:` stylesheet link in `doc` with a `<style>` holding the same CSS.
 *
 * **In place, so the cascade is unchanged.** A stylesheet's position among its siblings decides which rules win,
 * so each `<style>` goes exactly where its `<link>` stood rather than being appended to the head.
 *
 * A link that cannot be read is left alone: the book renders one stylesheet short, and the console still says why.
 * That is the same choice `hardenBookHtml` makes for a document it cannot parse.
 *
 * Links that are not `blob:` are not touched — a remote stylesheet is the app CSP's business, and quietly
 * turning one into inline text would be smuggling it past a rule that is doing its job.
 */
export async function inlineBlobStylesheets(doc: Document, fetchText: FetchText): Promise<void> {
  const links = Array.from(doc.querySelectorAll('link')).filter((link) => {
    const rel = link.getAttribute('rel')?.toLowerCase() ?? '';
    return rel.split(/\s+/).includes('stylesheet') && isBlobUrl(link.getAttribute('href') ?? '');
  });
  if (links.length === 0) return;

  const seen = new Set<string>();
  await Promise.all(
    links.map(async (link) => {
      const href = link.getAttribute('href') ?? '';
      seen.add(href);
      let css: string;
      try {
        css = await inlineImports(await fetchText(href), fetchText, seen, 0);
      } catch {
        return; // leave the link in place
      }
      // A raw <style> in the book's document: `createEl('style')` is banned by no-forbidden-elements, and the
      // book's document has no createEl (see bookElement).
      const style = bookElement(doc, 'style');
      // The media query travels with the sheet; dropping it would apply a print stylesheet to the screen.
      const media = link.getAttribute('media');
      if (media) style.setAttribute('media', media);
      style.textContent = css;
      link.replaceWith(style);
    })
  );
}
