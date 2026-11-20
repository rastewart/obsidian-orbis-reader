// An FB2 keeps its pictures inside the file, as `<binary>` elements its images point at with `#id`. foliate also
// accepted a picture named by an outside URL, and fetched a cover from one when the book was opened — from Obsidian's
// own window, which no book CSP governs, so a book could send a request anywhere, a LAN address included (ORBIS
// patch 20).

import { makeFB2 } from 'foliate-js/fb2.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

const PIXEL = 'R0lGODlhAQABAAAAACw=';

const book = (cover: string, body = '') =>
  new Blob(
    [
      `<?xml version="1.0" encoding="UTF-8"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" xmlns:l="http://www.w3.org/1999/xlink">
  <description>
    <title-info><book-title>Lantern Hill</book-title><coverpage><image l:href="${cover}"/></coverpage></title-info>
  </description>
  <body><section><p>text</p>${body}</section></body>
  <binary id="c.gif" content-type="image/gif">${PIXEL}</binary>
</FictionBook>`,
    ],
    { type: 'application/x-fictionbook+xml' }
  );

afterEach(() => vi.restoreAllMocks());

describe('an FB2 picture named by an outside URL', () => {
  it('gives no cover, and fetches nothing', async () => {
    // Refused rather than passed through: before the patch this call went out to the network.
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('no network in a test'));
    const fb2 = (await makeFB2(book('https://example.invalid/cover.jpg'))) as { getCover: () => unknown };
    expect(await fb2.getCover()).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('still reads a cover kept inside the book', async () => {
    const fb2 = (await makeFB2(book('#c.gif'))) as { getCover: () => Promise<Blob | null> };
    const cover = await fb2.getCover();
    expect(cover?.size).toBeGreaterThan(0);
  });

  it('draws a picture in the text from nowhere outside the book', async () => {
    const fb2 = (await makeFB2(book('#c.gif', '<image l:href="http://192.168.1.10/a.jpg"/>'))) as {
      sections: { load: () => Promise<string> }[];
    };
    const html = await (await fetch(await fb2.sections[0].load())).text();
    expect(html).not.toContain('192.168.1.10');
  });
});
