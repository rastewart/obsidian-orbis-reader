// A download batch: Stop, a vault that will not take the file, the server's own words, and the edition in the name.

import { describe, expect, it, vi } from 'vitest';

const requestUrl = vi.hoisted(() => vi.fn());
vi.mock('obsidian', async (original) => ({ ...(await original<Record<string, unknown>>()), requestUrl }));

import type { App } from 'obsidian';
import type { BookSource, OrbisPluginSettings } from '../settings';
import { forLog } from '../sources/client';
import { type DownloadRequest, dataUrlImage, downloadBooks, imageExtension } from '../sources/download';

const source = {
  id: 'gutenberg',
  name: 'Project Gutenberg',
  url: 'https://www.gutenberg.org/ebooks/search.opds/',
} as BookSource;
const settings = { bookSourcesFolder: 'Downloads', libraryEnabled: false } as unknown as OrbisPluginSettings;
const book = (title: string, url: string): DownloadRequest => ({
  title,
  authors: ['Melville, Herman'],
  url,
  ext: 'epub',
  label: 'EPUB',
  size: 0,
});
const epub = { status: 200, arrayBuffer: new ArrayBuffer(16), headers: { 'content-type': 'application/epub+zip' } };

function vault(write: (path: string) => void = () => {}) {
  const written: string[] = [];
  const app = {
    secretStorage: { getSecret: () => null },
    vault: {
      getFiles: () => [],
      adapter: { exists: async () => true },
      createFolder: async () => {},
      createBinary: async (path: string) => {
        write(path);
        written.push(path);
      },
    },
  } as unknown as App;
  return { app, written };
}

describe('downloadBooks', () => {
  it('stops before the next book when asked, and says how many were left', async () => {
    requestUrl.mockReset();
    const { app } = vault();
    const batch = await downloadBooks({ app, settings, shouldStop: () => true }, source, [
      book('A', 'https://www.gutenberg.org/ebooks/1.epub.images'),
      book('B', 'https://www.gutenberg.org/ebooks/2.epub.images'),
    ]);
    expect(batch).toEqual({ outcomes: [], notTried: 2 });
    expect(requestUrl).not.toHaveBeenCalled();
  });

  // A throw here left the dialog on "Downloading…" for good.
  it('reports a vault that will not take the file, and goes on to the next book', async () => {
    requestUrl.mockReset().mockResolvedValue(epub);
    const { app, written } = vault((path) => {
      if (path.includes('First')) throw new Error('disk full');
    });
    const batch = await downloadBooks({ app, settings }, source, [
      book('First', 'https://www.gutenberg.org/ebooks/1.epub.images'),
      book('Second', 'https://www.gutenberg.org/ebooks/2.epub.images'),
    ]);
    expect(batch.outcomes[0]).toMatchObject({ kind: 'failed', reason: 'write-failed', detail: 'disk full' });
    expect(batch.outcomes[1]).toMatchObject({ kind: 'saved' });
    expect(written).toEqual(['Downloads/Second - Melville, Herman.epub']);
  });

  it("keeps the server's own words on a refused download", async () => {
    requestUrl.mockReset().mockResolvedValue({
      status: 401,
      arrayBuffer: new ArrayBuffer(0),
      headers: { 'WWW-Authenticate': 'Basic realm="Members only"' },
    });
    const { app } = vault();
    const batch = await downloadBooks({ app, settings }, source, [
      book('A', 'https://www.gutenberg.org/ebooks/1.epub.images'),
    ]);
    // No credentials on this device, so a 401 is a request for them rather than a refusal — see `reasonFor`.
    expect(batch.outcomes[0]).toMatchObject({
      kind: 'failed',
      reason: 'requires-authentication',
      detail: 'Members only',
    });
  });

  // Both editions wanted "Moby Dick - Melville, Herman.epub", so choosing both got one and "Already in your vault".
  it("names Gutenberg's edition without images apart from the one with them", async () => {
    requestUrl.mockReset().mockResolvedValue(epub);
    const { app, written } = vault();
    await downloadBooks({ app, settings, noImagesLabel: 'no images' }, source, [
      book('Moby Dick', 'https://www.gutenberg.org/ebooks/2701.epub.noimages'),
      book('Moby Dick', 'https://www.gutenberg.org/ebooks/2701.epub3.images'),
    ]);
    expect(written).toEqual([
      'Downloads/Moby Dick - Melville, Herman (no images).epub',
      'Downloads/Moby Dick - Melville, Herman.epub',
    ]);
  });
});

describe("a feed's cover", () => {
  it('reads an image from a data: URL, and refuses anything else', () => {
    const png = dataUrlImage('data:image/png;base64,iVBORw0KGgo=');
    expect(png?.entry).toBe('cover.png');
    expect(png?.bytes[1]).toBe(0x50); // P of PNG
    expect(dataUrlImage('data:text/html,<p>no</p>')).toBeNull();
  });

  it('takes its extension from the media type, then the address, then jpg', () => {
    expect(imageExtension('image/jpeg', '')).toBe('jpg');
    expect(imageExtension('', 'https://x/pg2701.cover.medium.png')).toBe('png');
    expect(imageExtension('application/octet-stream', 'https://x/cover')).toBe('jpg');
  });
});

describe('forLog', () => {
  // The keychain never reaches the log, but an address typed with a password in it was logged as typed.
  it('takes a user and password out of an address, and leaves the rest', () => {
    expect(forLog('https://me:secret@calibre.local:8080/opds')).toBe('https://***@calibre.local:8080/opds');
    expect(forLog('https://me@host/opds')).toBe('https://***@host/opds');
    expect(forLog('https://www.gutenberg.org/ebooks/search.opds/?query=a@b')).toBe(
      'https://www.gutenberg.org/ebooks/search.opds/?query=a@b'
    );
  });

  // November security scan, L12: the parser splits at the LAST @ of the host part, so the log has to as well.
  it('takes out the whole of a password that holds an @', () => {
    expect(forLog('https://me:p@ss@host/opds')).toBe('https://***@host/opds');
  });

  it('takes out a credential carried in the query, and leaves the other parameters', () => {
    expect(forLog('https://host/opds?apikey=abc123&q=dickens&token=xyz#top')).toBe(
      'https://host/opds?apikey=***&q=dickens&token=***#top'
    );
  });

  it('takes out a credential whatever its name is built from, in the query, after a semicolon or in the fragment', () => {
    expect(
      forLog(
        'https://host/o?client_secret=a&refresh_token=b&X-Amz-Signature=c&accessToken=d&api-key=e;token=f#id_token=g'
      )
    ).toBe(
      'https://host/o?client_secret=***&refresh_token=***&X-Amz-Signature=***&accessToken=***&api-key=***;token=***#id_token=***'
    );
  });

  it('leaves a search alone, by author or by keyword', () => {
    const search = 'https://host/opds/search?author=dickens&keyword=fog&monkey=1&signup=0';
    expect(forLog(search)).toBe(search);
  });
});
