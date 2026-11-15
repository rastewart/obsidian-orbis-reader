// A book that will not open: foliate names what went wrong (ORBIS patch 11), and Orbis words it for a reader.

import { makeBook } from 'foliate-js/view.js';
import { describe, expect, it } from 'vitest';
import { describeOpenFailure } from '../book-open-error';

/** A fixture's bytes — through `getBuiltinModule`, for the reason `asset-integrity.test.ts` gives. */
declare const process: { getBuiltinModule(id: 'node:fs'): { readFileSync(p: string): Uint8Array } };
function fixture(name: string): ArrayBuffer {
  const bytes = process.getBuiltinModule('node:fs').readFileSync(`test-vault/fixtures/${name}`);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
const file = (bytes: BlobPart, name: string) => new File([bytes], name, { type: 'application/epub+zip' });

/** What `makeBook` throws for these bytes, or `null` when it opens them. */
async function openFailure(bytes: BlobPart, name: string): Promise<Error | null> {
  try {
    await makeBook(file(bytes, name));
    return null;
  } catch (e) {
    return e as Error;
  }
}

describe('makeBook names its failures', () => {
  it('calls an empty file a NotFoundError', async () => {
    expect((await openFailure('', 'empty.epub'))?.name).toBe('NotFoundError');
  });

  it('calls a text file named .epub an UnsupportedTypeError', async () => {
    expect((await openFailure('Just some text, not a book.', 'not-a-book.epub'))?.name).toBe('UnsupportedTypeError');
  });

  // A download cut off part-way: the zip signature is there, the directory at the end is not.
  it('calls a cut-off EPUB a DamagedBookError', async () => {
    const whole = fixture('First-Open.epub');
    const cut = await openFailure(whole.slice(0, Math.floor(whole.byteLength / 2)), 'cut.epub');
    expect(cut?.name).toBe('DamagedBookError');
  });

  it('opens a sound EPUB', async () => {
    expect(await openFailure(fixture('First-Open.epub'), 'First-Open.epub')).toBeNull();
  });
});

describe('describeOpenFailure', () => {
  const named = (name: string, message = 'engine words') => Object.assign(new Error(message), { name });

  it.each([
    ['NotFoundError', 'epub', 'This file is empty'],
    ['UnsupportedTypeError', 'epub', "This file isn't a valid EPUB file"],
    ['DamagedBookError', 'azw3', "This AZW3 file is damaged and can't be opened"],
  ])('words a %s in a .%s as "%s"', (name, ext, expected) => {
    expect(describeOpenFailure(named(name), ext)).toBe(expected);
  });

  // Possibly a fault in Orbis rather than the file: the original words are what would find it.
  it('keeps the message of anything else', () => {
    expect(describeOpenFailure(new TypeError('x is undefined'), 'fb2')).toBe(
      'Could not open this FB2 file: x is undefined'
    );
  });
});
