import { describe, expect, it } from 'vitest';
import { hardenBookDoc, serializeBookDoc } from '../reader/book-html-guard';
import { inlineBlobStylesheets } from '../reader/book-styles';

/**
 * The failure these guard against is silent: a book renders, it just renders without any of its own CSS, and
 * Orbis's injected typography makes that look deliberate. Nothing in the build can see it — it takes a same-origin
 * frame inheriting an app policy, which is three layers away from anything a test can reach. So what is tested here
 * is the one part that is ours: the transform from `<link>` to `<style>`.
 */
const parse = (html: string): Document => new DOMParser().parseFromString(html, 'text/html');

/** A reader over a fixed map, standing in for XHR against a `blob:` URL. */
const reader =
  (files: Record<string, string>) =>
  (url: string): Promise<string> =>
    url in files ? Promise.resolve(files[url]) : Promise.reject(new Error(`no such blob: ${url}`));

describe('inlineBlobStylesheets', () => {
  it('replaces a blob stylesheet with its own text', async () => {
    const doc = parse('<html><head><link rel="stylesheet" href="blob:x/1"></head><body><p>x</p></body></html>');
    await inlineBlobStylesheets(doc, reader({ 'blob:x/1': 'p { color: red }' }));
    expect(doc.querySelector('link')).toBeNull();
    expect(doc.querySelector('style')?.textContent).toBe('p { color: red }');
  });

  it('puts the style exactly where the link stood', async () => {
    // The cascade is positional: a sheet that was second must stay second, or the wrong rule wins. Appending to
    // the head would pass a "the CSS is present" test and still render the book wrong.
    const doc = parse(
      '<html><head><link rel="stylesheet" href="blob:a"><style>mid</style><link rel="stylesheet" href="blob:b"></head><body></body></html>'
    );
    await inlineBlobStylesheets(doc, reader({ 'blob:a': 'first', 'blob:b': 'last' }));
    const order = Array.from(doc.querySelectorAll('style')).map((s) => s.textContent);
    expect(order).toStrictEqual(['first', 'mid', 'last']);
  });

  it('carries the media query across', async () => {
    // Without this a print stylesheet would start applying to the screen — the sheet is not wrong, its condition
    // has simply been thrown away.
    const doc = parse('<html><head><link rel="stylesheet" media="print" href="blob:p"></head><body></body></html>');
    await inlineBlobStylesheets(doc, reader({ 'blob:p': 'p { margin: 0 }' }));
    expect(doc.querySelector('style')?.getAttribute('media')).toBe('print');
  });

  it('follows an @import, which the same directive would have refused', async () => {
    // Inlining the outer sheet and stopping would leave a book that uses imports still broken, and silently —
    // the failure moves from one console line to none.
    const doc = parse('<html><head><link rel="stylesheet" href="blob:outer"></head><body></body></html>');
    await inlineBlobStylesheets(
      doc,
      reader({ 'blob:outer': '@import "blob:inner";\np { color: red }', 'blob:inner': 'h1 { font-weight: 700 }' })
    );
    const css = doc.querySelector('style')?.textContent ?? '';
    expect(css).toContain('h1 { font-weight: 700 }');
    expect(css).toContain('p { color: red }');
    expect(css).not.toContain('@import');
  });

  it('does not spin on an import cycle', async () => {
    const doc = parse('<html><head><link rel="stylesheet" href="blob:one"></head><body></body></html>');
    await inlineBlobStylesheets(
      doc,
      reader({ 'blob:one': '@import "blob:two"; a{}', 'blob:two': '@import "blob:one"; b{}' })
    );
    const css = doc.querySelector('style')?.textContent ?? '';
    expect(css).toContain('a{}');
    expect(css).toContain('b{}');
  });

  it('leaves a remote stylesheet alone', async () => {
    // Not ours to smuggle past the app's policy. A `https:` sheet is blocked on purpose; turning it into inline
    // text would defeat a rule that is doing its job, which is the opposite of what this function is for.
    const doc = parse(
      '<html><head><link rel="stylesheet" href="https://example.com/s.css"></head><body></body></html>'
    );
    await inlineBlobStylesheets(doc, reader({}));
    expect(doc.querySelector('link')?.getAttribute('href')).toBe('https://example.com/s.css');
    expect(doc.querySelector('style')).toBeNull();
  });

  it('leaves a link it cannot read in place rather than dropping it', async () => {
    // One unreadable sheet must not cost the others, and must not cost the chapter. The book then renders one sheet
    // short, with the reason still in the console.
    const doc = parse(
      '<html><head><link rel="stylesheet" href="blob:gone"><link rel="stylesheet" href="blob:here"></head><body></body></html>'
    );
    await inlineBlobStylesheets(doc, reader({ 'blob:here': 'ok{}' }));
    expect(doc.querySelector('link[href="blob:gone"]')).not.toBeNull();
    expect(doc.querySelector('style')?.textContent).toBe('ok{}');
  });
});

/**
 * An inlined sheet becomes the text of a `<style>`, which is serialized into `srcdoc` after the hardening and parsed
 * again by the frame. A `</style>` in the sheet would end the element there, and hand the frame markup the hardening
 * never saw. So these take the whole path a chapter takes — inline, harden, serialize, parse again — and look at the
 * last document, because each step before it passes on its own. The escape itself is `hardenBookDoc`'s; see
 * `neutralizeLiteralText`.
 */
describe('an inlined stylesheet cannot end its <style>', () => {
  const roundTrip = async (html: string, files: Record<string, string>): Promise<Document> => {
    const doc = parse(html);
    await inlineBlobStylesheets(doc, reader(files));
    hardenBookDoc(doc);
    return parse(serializeBookDoc(doc));
  };

  it('keeps a "</style>" followed by a refresh from becoming a refresh', async () => {
    const sheet =
      'p { color: red } </style><meta http-equiv="refresh" content="0;url=https://example.invalid/"><link rel="preconnect" href="https://example.invalid"><style>';
    const again = await roundTrip(
      '<html><head><link rel="stylesheet" href="blob:evil"></head><body><p>x</p></body></html>',
      { 'blob:evil': sheet }
    );
    expect(again.querySelector('meta[http-equiv="refresh" i]')).toBeNull();
    expect(again.querySelector('link')).toBeNull();
    expect(again.querySelectorAll('style')).toHaveLength(1);
    expect(again.querySelector('style')?.textContent).toContain('p { color: red }');
  });

  it('keeps a sheet linked inside <svg>, whose text is markup to the parser, from opening a tag', async () => {
    const again = await roundTrip(
      '<html><head></head><body><svg><link rel="stylesheet" href="blob:s"/></svg><p>x</p></body></html>',
      { 'blob:s': 'p{} <meta http-equiv="refresh" content="0;url=https://example.invalid/"><img src="x">' }
    );
    expect(again.querySelector('meta[http-equiv="refresh" i]')).toBeNull();
    expect(again.querySelector('img')).toBeNull();
  });
});
