import { describe, expect, it } from 'vitest';
import { hardenBookDoc, parseBookHtml, serializeBookDoc } from '../reader/book-html-guard';
import { inlineBlobStylesheets } from '../reader/book-styles';
import fixture from './fixtures/stylesheet-checks.json';

/**
 * **The fixture itself is under test here, not just the code it exercises.**
 *
 * `stylesheet-checks.epub` is a device test: open it and every line should read PASS. That only means anything if
 * the book is actually wired to fail when the stylesheets do not arrive, and that is easy to get wrong: tag names
 * written into a chapter unescaped let the markup swallow its own checks, so the book demonstrates the guard by
 * accident while testing nothing.
 *
 * So this runs the fixture's own content through the real preparation path and asserts the structure a reader is
 * being asked to trust. What it cannot do is prove the CSS renders: the document comes from `DOMParser`, so it
 * has no window and `getComputedStyle` has nothing to compute against. That half is what the device pass is for.
 *
 * The content arrives as JSON rather than by unzipping the `.epub`, because `src/` compiles for Obsidian and has
 * no Node types — a test that reads files with `node:fs` passes under vitest and breaks the build (see
 * `dialog-contract.test.ts`). `pnpm build:stylesheet-epub` writes both, and checks the zip's own structure as it goes.
 */

/**
 * Stand in for the one thing foliate does before Orbis sees a chapter: rewrite every in-book reference to a
 * `blob:` URL. Without this the fixture's hrefs are relative, `inlineBlobStylesheets` correctly ignores them,
 * and the test would pass while proving nothing.
 */
const toBlob = (name: string): string => `blob:fixture/${name}`;
const foliateRewrite = (text: string): string =>
  text
    .replace(/href="([^":]+\.css)"/g, (_, f: string) => `href="${toBlob(f)}"`)
    .replace(/@import\s+"([^":]+\.css)"/g, (_, f: string) => `@import "${toBlob(f)}"`)
    .replace(/url\("([^":]+\.(?:png|ttf))"\)/g, (_, f: string) => `url("${toBlob(f)}")`);

describe('stylesheet-checks.epub', () => {
  it('declares every file it references in the manifest', () => {
    // A sheet left out of the manifest is not loaded by foliate at all, so its check would read FAIL for a
    // reason that has nothing to do with the CSP. (That the zip itself is well formed — `mimetype` first and
    // stored — is asserted by the generator, which reads back what it just wrote.)
    const assets = ['style.css', 'imported.css', 'second.css', 'print.css', 'green.png', 'chapter3.xhtml', 'fonts.css'];
    for (const asset of [...assets, 'fonts/script.ttf', 'fonts/script-obfuscated.ttf', 'fonts/OFL.txt']) {
      expect(fixture.opf, `${asset} is not in the manifest`).toContain(`href="${asset}"`);
    }
  });

  it('starts every check at the answer the reader must not see', () => {
    // The point of the fixture: with no stylesheet applied, the visible half of each pair is the one that
    // reports the failure. A check whose visible half already says PASS proves nothing.
    const chapter = fixture.chapter1;
    for (const id of ['linked', 'imported', 'order']) {
      expect(chapter).toContain(`<span class="${id}-fail state">FAIL`);
      expect(chapter).toContain(`<span class="${id}-pass state" style="display:none">PASS`);
    }
    // And the two inverted ones are the other way round, because they test a sheet that must NOT apply.
    for (const id of ['print', 'script']) {
      expect(chapter).toContain(`<span class="${id}-pass state">PASS`);
      expect(chapter).toContain(`<span class="${id}-fail state" style="display:none">FAIL`);
    }
  });

  it('has a rule for every check it makes', () => {
    // The failure this catches: adding a check to the list and forgetting the CSS that answers it, which shows
    // up on a device as a FAIL nobody can explain.
    const css = Object.values(fixture.css).join('\n');
    for (const id of ['linked', 'imported', 'order', 'print']) {
      expect(css, `nothing styles ${id}`).toContain(`.${id}-pass`);
      expect(css, `nothing styles ${id}`).toContain(`.${id}-fail`);
    }
  });

  it('keeps the hazards book pointed at the two hazards a book must survive', () => {
    // This fixture only means something if it still CONTAINS the hazards. Both throw
    // `TypeError: data.replace is not a function` against unpatched foliate.
    const hz = fixture.hazards;
    // Hazard one, twice over: an empty url() inside a comment, and another in a real declaration. Stripping
    // comments is not a fix, partly because it would miss the second.
    expect(hz.css['hazard.css']).toMatch(/\/\*[^*]*url\(\)/);
    expect(hz.css['hazard.css']).toContain('background: url();');
    // Hazard two: a genuine circular @import, which patch 4 cannot help with — the cycle guard is right to
    // refuse it — so patch 5 is the only thing keeping the chapter alive.
    expect(hz.css['cycle-a.css']).toContain('@import "cycle-b.css"');
    expect(hz.css['cycle-b.css']).toContain('@import "cycle-a.css"');
    // And it reports the same way: plain markup says FAIL, a rule in each hazardous sheet turns it to PASS.
    for (const id of ['comment', 'empty', 'cycle']) {
      expect(hz.chapter1).toContain(`<span class="${id}-fail state">FAIL`);
      expect(hz.chapter1).toContain(`<span class="${id}-pass state" style="display:none">PASS`);
      expect(Object.values(hz.css).join('\n'), `nothing styles ${id}`).toContain(`.${id}-pass`);
    }
  });

  /**
   * The fonts chapter is read by eye, so what makes it trustworthy is that a font that did not load cannot pass for
   * one that did: a family name nothing installs, a plain serif behind it, and one face per family, so the plain
   * file and the obfuscated one cannot stand in for each other.
   */
  it('gives each sample line a font of its own that nothing else can supply', () => {
    const css = fixture.css['fonts.css'];
    const faces = [...css.matchAll(/@font-face \{\s*font-family: "([^"]+)";\s*src: url\("([^"]+)"\);/g)];
    expect(faces.map((m) => m[2])).toEqual(['fonts/script.ttf', 'fonts/script-obfuscated.ttf']);
    expect(new Set(faces.map((m) => m[1])).size).toBe(2);
    for (const [cls, [, family]] of [
      ['font-plain', faces[0]],
      ['font-obfuscated', faces[1]],
    ] as const) {
      expect(css).toContain(`.${cls} { font-family: "${family}", serif;`);
      expect(fixture.chapter3).toContain(`<p class="${cls}">`);
    }
  });

  it('marks the obfuscated font, and only that one, in encryption.xml', () => {
    const uris = [...fixture.encryption.matchAll(/URI="([^"]+)"/g)].map((m) => m[1]);
    expect(uris).toEqual(['OEBPS/fonts/script-obfuscated.ttf']);
    // The IDPF algorithm, the one most books in the wild use; foliate also reads Adobe's, which this does not cover.
    expect(fixture.encryption).toContain('Algorithm="http://www.idpf.org/2008/embedding"');
  });

  it('keeps the embedded fonts reachable once their sheet is inlined', async () => {
    const fetchText = (url: string): Promise<string> =>
      Promise.resolve(foliateRewrite(fixture.css[url.replace('blob:fixture/', '') as keyof typeof fixture.css]));
    const doc = parseBookHtml(foliateRewrite(fixture.chapter3));
    expect(doc).not.toBeNull();
    if (!doc) return;
    await inlineBlobStylesheets(doc, fetchText);
    hardenBookDoc(doc);
    const out = serializeBookDoc(doc);
    // The face still points at the font foliate serves, and the policy lets a font come from there.
    expect(out).toContain('src: url("blob:fixture/fonts/script-obfuscated.ttf");');
    expect(out).toContain('font-src blob: data:');
  });

  it('survives the real preparation path with its stylesheets inlined', async () => {
    const sheets = fixture.css as Record<string, string>;
    const fetchText = (url: string): Promise<string> => {
      const css = sheets[url.replace('blob:fixture/', '')];
      return css === undefined ? Promise.reject(new Error(`no ${url}`)) : Promise.resolve(foliateRewrite(css));
    };

    const doc = parseBookHtml(foliateRewrite(fixture.chapter1));
    expect(doc).not.toBeNull();
    if (!doc) return;
    await inlineBlobStylesheets(doc, fetchText);
    hardenBookDoc(doc);
    const out = serializeBookDoc(doc);

    // No blob stylesheet link survives — every one of them is what the app CSP refuses.
    expect(out).not.toContain('rel="stylesheet" type="text/css" href="blob:');
    // The rule that answers check 1 is in the document rather than behind a URL.
    expect(out).toContain('.linked-pass { display: inline !important; }');
    // And so is the rule from the @import, which the same directive would have refused separately.
    expect(out).toContain('.imported-pass { display: inline !important; }');
    // The print sheet kept its condition. Without this it would apply on screen and check 4 would read FAIL.
    expect(doc.querySelector('style[media="print"]')).not.toBeNull();
    // Cascade order: second.css must still come after style.css, or the wrong rule wins check 3.
    const first = out.indexOf('.order-fail { display: inline !important; }');
    const second = out.indexOf('.order-fail { display: none !important; }');
    expect(first).toBeGreaterThan(-1);
    expect(second).toBeGreaterThan(first);
    // The hardening still runs on this path — the script that would rewrite every line to FAIL is gone.
    expect(out).not.toContain('<script');
    expect(out).toContain('http-equiv="Content-Security-Policy"');
  });
});
