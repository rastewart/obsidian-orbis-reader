// Why nothing in Orbis calls a section's `unload`: foliate's `unload` releases the reference its `load` took — the
// one the paginator holds for the chapter on screen — and `createDocument` takes none. Called after `createDocument`,
// as Orbis's background reading of a book used to, it released the reader's own reference, and foliate revoked the
// chapter's resources: a book's embedded font the page had not fetched yet then failed to load. See `RawSection` in
// `reader/foliate-view.ts`.

import { makeBook } from 'foliate-js/view.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildEpub, type EpubFont, xhtmlDocument } from '../epub-builder';

/** A one-chapter book that carries a font, as a converted note does. */
function bookWithFont(): File {
  const font: EpubFont = {
    family: 'Sample',
    faces: [
      {
        href: 'fonts/Sample.ttf',
        mediaType: 'font/ttf',
        data: new Uint8Array([0, 1, 0, 0]),
        weight: 400,
        italic: false,
      },
    ],
  };
  const bytes = buildEpub(
    {
      title: 'T',
      author: '',
      language: 'en',
      identifier: 'urn:uuid:00000000-0000-0000-0000-000000000000',
      modified: '2026-11-25T00:00:00Z',
    },
    [{ id: 'sect1', title: 'One', xhtml: xhtmlDocument('One', 'en', '<p>Text.</p>') }],
    [],
    font
  );
  return new File([bytes.slice().buffer], 'book.epub', { type: 'application/epub+zip' });
}

/** What these tests use of a book foliate opens. */
interface OpenedBook {
  sections: { load(): Promise<string>; createDocument(): Promise<Document>; unload(): void }[];
}
const open = async (): Promise<OpenedBook> => (await makeBook(bookWithFont())) as OpenedBook;

/** Blob URLs as foliate makes and revokes them, by what each holds. */
function watchURLs() {
  const made = new Map<string, string>();
  const revoked: string[] = [];
  let n = 0;
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
    const url = `blob:test/${n++}`;
    made.set(url, (blob as Blob).type);
    return url;
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url) => void revoked.push(url));
  return { made, revoked, fontURL: () => [...made].find(([, type]) => type === 'font/ttf')?.[0] };
}

afterEach(() => vi.restoreAllMocks());

describe("a section's unload", () => {
  it('revokes the chapter on screen, font and all, when it follows createDocument', async () => {
    const urls = watchURLs();
    const book = await open();
    const [section] = book.sections;
    await section.load(); // the paginator, showing the chapter
    expect(urls.fontURL()).toBeDefined();

    await section.createDocument(); // background reading, which takes no reference…
    section.unload(); // …and released the reader's
    expect(urls.revoked).toContain(urls.fontURL());
  });

  it('revokes nothing when createDocument is left alone, as Orbis now leaves it', async () => {
    const urls = watchURLs();
    const book = await open();
    const [section] = book.sections;
    await section.load();
    await section.createDocument();
    expect(urls.revoked).toEqual([]);
  });
});
