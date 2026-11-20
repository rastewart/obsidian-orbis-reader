// An `&` and accented letters in a Kindle book's title, author and contents come through as they are written.
//
// `cafe-and-co.mobi` is Calibre's conversion of `cafe-and-co.epub`, with both a MOBI 6 and a KF8 part. foliate opens
// the KF8 part, and its title, author and every contents label go through `unescapeHTML` (foliate patch 32). Calibre
// writes the `&` bare, not as `&amp;`, so this is the case a real converted book brings: text with an `&` in it, which
// the decoder parses, and must hand back unchanged. Decoding `&amp;` and the other references is
// `mobi-unescape.test.ts`'s.

import { makeBook } from 'foliate-js/view.js';
import { describe, expect, it } from 'vitest';

/** A fixture's bytes — through `getBuiltinModule`, for the reason `asset-integrity.test.ts` gives. */
declare const process: { getBuiltinModule(id: 'node:fs'): { readFileSync(p: string): Uint8Array } };

interface Opened {
  metadata: { title?: string; author?: string[] };
  toc?: { label: string }[];
}

async function open(name: string): Promise<Opened> {
  const bytes = process.getBuiltinModule('node:fs').readFileSync(`test-vault/fixtures/${name}`);
  return (await makeBook(new File([bytes as BlobPart], name))) as Opened;
}

describe('a Kindle book with an & and accented letters', () => {
  it('has its title and author as they are written', async () => {
    const { metadata } = await open('cafe-and-co.mobi');
    expect(metadata.title).toBe('Café & Co.');
    expect(metadata.author).toEqual(['Zoë Lefèvre & Søren Ågård']);
  });

  it('has its contents as they are written', async () => {
    const { toc } = await open('cafe-and-co.mobi');
    expect(toc?.map((t) => t.label)).toEqual([
      'Crème Brûlée & Coffee',
      'Señora Muñoz’s Table',
      'Smørrebrød & Søren',
      'Œuvres & Hors-d’œuvre',
    ]);
  });
});
