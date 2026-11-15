// Pictures inside a MOBI or AZW3 book, for the exports.
//
// Every picture in a Kindle book was dropped by Save as Markdown and Save as PDF: they asked foliate's EPUB loader,
// which a Kindle book does not have, and an old MOBI's `<img recindex>` had no `src` to ask for. A cover page that
// holds nothing but its picture went with it.

import { makeBook } from 'foliate-js/view.js';
import type { App } from 'obsidian';
import { describe, expect, it } from 'vitest';
import type { ChapterData, ExtractionCtx, ExtractOptions } from '../book-extractor';
import { collectBySectionFallback } from '../book-extractor';
import { ExportLinks } from '../export-links';
import { type KindleBook, kindleResource, mobiPictureHref } from '../kindle-resources';
import type { RawSection } from '../reader/foliate-view';
import { createTurndownService } from '../turndown-rules';

/** A fixture's bytes — through `getBuiltinModule`, for the reason `asset-integrity.test.ts` gives. */
declare const process: { getBuiltinModule(id: 'node:fs'): { readFileSync(p: string): Uint8Array } };
async function open(name: string): Promise<KindleBook> {
  const bytes = process.getBuiltinModule('node:fs').readFileSync(`test-vault/fixtures/${name}`);
  return (await makeBook(new File([bytes as BlobPart], name))) as KindleBook;
}

describe('kindleResource', () => {
  it('reads an old MOBI picture by its recindex, typed by its bytes', async () => {
    const blob = await kindleResource(await open('annotation-workhorse.mobi'), 'recindex:00001');
    expect(blob?.size).toBeGreaterThan(1000);
    expect(blob?.type).toMatch(/^image\/(jpeg|png|gif)$/);
  });

  it('reads an AZW3 picture by its kindle:embed link', async () => {
    const blob = await kindleResource(await open('parts-and-chapters.azw3'), 'kindle:embed:0001?mime=image/jpeg');
    expect(blob?.size).toBeGreaterThan(1000);
    expect(blob?.type).toBe('image/jpeg');
  });

  // Calibre writes an AZW3 cover page as an SVG wrapping the picture; the SVG's own link is dead outside the book.
  it('reads the picture inside an SVG-wrapped one, not the SVG', async () => {
    const svg = '<svg><image xlink:href="kindle:embed:0007?mime=image/jpeg"/></svg>';
    const asked: string[] = [];
    const book: KindleBook = {
      mobi: { decode: () => svg, loadResource: async () => new Uint8Array() },
      loadFlow: async () => new Uint8Array([1]),
      loadResourceBlob: async (href) => {
        asked.push(href);
        return [new Blob(['jpeg'], { type: 'image/jpeg' }), null];
      },
    };
    const blob = await kindleResource(book, 'kindle:flow:0004?mime=image/svg+xml');
    expect(asked).toEqual(['kindle:embed:0007?mime=image/jpeg']);
    expect(blob?.type).toBe('image/jpeg');
  });

  it('reads nothing for a link that names no Kindle file, or with no book', async () => {
    expect(await kindleResource(await open('parts-and-chapters.azw3'), 'images/cover.jpg')).toBeNull();
    expect(await kindleResource(null, 'recindex:00001')).toBeNull();
  });
});

describe('an old MOBI picture in Save as Markdown', () => {
  it('is asked for by its recindex and kept in the note', async () => {
    const section = {
      id: 0,
      createDocument: async () =>
        new DOMParser().parseFromString('<p>Before.</p><img recindex="00001"><p>After.</p>', 'text/html'),
    } as unknown as RawSection;
    const asked: string[] = [];
    const options: ExtractOptions = {
      onProgress: () => undefined,
      includeImages: true,
      loadBookBlob: async (href) => {
        asked.push(href);
        return new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' });
      },
    };
    const td = createTurndownService(true, 'wiki');
    const ctx: ExtractionCtx = {
      options,
      td,
      assetsFolder: 'assets',
      app: { vault: { getAbstractFileByPath: () => null, createBinary: async () => undefined } } as unknown as App,
      imgCounterRef: { value: 0 },
      hrefCache: new Map(),
      dbg: () => undefined,
      total: 1,
      links: new ExportLinks(undefined, 'wiki', (html) => td.turndown(html)),
    };
    const chapterMap = new Map<string, ChapterData>();
    await collectBySectionFallback([section], ctx, chapterMap, []);

    expect(asked).toEqual(['recindex:00001']);
    const text = [...chapterMap.values()].flatMap((c) => c.parts).join('\n');
    expect(text).toContain('assets/img-001.jpg');
  });

  it('names an element with no recindex nothing', () => {
    const doc = new DOMParser().parseFromString('<img src="a.jpg">', 'text/html');
    expect(mobiPictureHref(doc.querySelector('img') ?? doc.body)).toBeNull();
  });
});
