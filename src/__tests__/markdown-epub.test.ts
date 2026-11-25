import { describe, expect, it } from 'vitest';
import {
  type EpubConversion,
  epubTargetPath,
  frontmatterText,
  sniffImageType,
  stripFrontmatter,
} from '../markdown-epub';

describe('stripFrontmatter', () => {
  it('removes a block at the very start', () => {
    // Left in, it prints twice: once as the book's title and author, again as the opening page of text.
    expect(stripFrontmatter('---\ntitle: A\nauthor: B\n---\nBody.\n')).toBe('Body.\n');
  });

  it('leaves a document with no frontmatter alone', () => {
    expect(stripFrontmatter('# Heading\n\nBody.\n')).toBe('# Heading\n\nBody.\n');
  });

  it('leaves a horizontal rule further down alone', () => {
    const doc = 'Opening.\n\n---\n\nMore.\n';
    expect(stripFrontmatter(doc)).toBe(doc);
  });

  it('treats an unterminated block as content, not frontmatter', () => {
    // A document that opens with dashes and never closes them is not declaring metadata.
    const doc = '---\nthis never closes\n';
    expect(stripFrontmatter(doc)).toBe(doc);
  });

  it('handles a note that is nothing but frontmatter', () => {
    expect(stripFrontmatter('---\ntitle: A\n---\n')).toBe('');
  });

  it('keeps a body that opens with a heading', () => {
    expect(stripFrontmatter('---\ntitle: A\n---\n# One\n\nText.\n')).toBe('# One\n\nText.\n');
  });
});

/** A signature, padded to the 12 bytes the sniffer needs before it will decide. */
const bytes = (...b: number[]): Uint8Array => new Uint8Array([...b, ...new Array<number>(16).fill(0)]);
const ascii = (s: string): Uint8Array => new TextEncoder().encode(s.padEnd(16, ' '));

describe('sniffImageType', () => {
  it('names each format from its signature', () => {
    expect(sniffImageType(bytes(0x89, 0x50, 0x4e, 0x47))).toBe('image/png');
    expect(sniffImageType(bytes(0xff, 0xd8, 0xff))).toBe('image/jpeg');
    expect(sniffImageType(bytes(0x47, 0x49, 0x46, 0x38))).toBe('image/gif');
    expect(sniffImageType(bytes(0x42, 0x4d))).toBe('image/bmp');
  });

  it('reads webp, which needs the marker at offset 8 as well', () => {
    // RIFF alone is a container: wav is also RIFF, so the first four bytes cannot decide this.
    expect(sniffImageType(ascii('RIFF????WEBPVP8 '))).toBe('image/webp');
    expect(sniffImageType(ascii('RIFF????WAVEfmt '))).toBeNull();
  });

  it('distinguishes avif from other ISO-BMFF, which share `ftyp`', () => {
    expect(sniffImageType(ascii('????ftypavif????'))).toBe('image/avif');
    expect(sniffImageType(ascii('????ftypmp42????'))).toBeNull();
  });

  it('finds svg past an xml declaration, since text has no signature', () => {
    expect(sniffImageType(ascii('<?xml version="1.0"?><svg xmlns="x">'))).toBe('image/svg+xml');
  });

  it('REJECTS an HTML error page, which is the failure that matters', () => {
    // A 404 written into the book as `.png` is a broken-image box; this is why the bytes decide, not the header.
    expect(sniffImageType(ascii('<!DOCTYPE html><html><body>404'))).toBeNull();
    expect(sniffImageType(ascii('{"error":"not found"}'))).toBeNull();
  });

  it('rejects a response too short to identify', () => {
    expect(sniffImageType(new Uint8Array([0x89, 0x50]))).toBeNull();
  });

  it('calls webp bytes webp however the URL is spelled', () => {
    // The trap this exists for: a CDN transform URL ending `.png` whose `f_webp` parameter means the bytes are
    // webp. Trusting the extension would declare image/png for webp content, which a strict reader may refuse.
    expect(sniffImageType(ascii('RIFF????WEBPVP8L'))).toBe('image/webp');
  });
});

describe('frontmatterText', () => {
  it('reads a plain string', () => {
    expect(frontmatterText('Jane Doe')).toBe('Jane Doe');
  });

  it('reads a LIST of wikilinks, which is what a clipper writes', () => {
    // The case that shipped broken: `author:\n  - "[[Jane Doe]]"` arrived as an empty field on exactly the notes
    // where the author matters most.
    expect(frontmatterText(['[[Jane Doe]]'])).toBe('Jane Doe');
  });

  it('joins several authors', () => {
    expect(frontmatterText(['[[A Writer]]', '[[B Writer]]'])).toBe('A Writer, B Writer');
  });

  it('prefers a wikilink alias over its target', () => {
    expect(frontmatterText('[[jane-doe|Jane Doe]]')).toBe('Jane Doe');
  });

  it('unwraps a link mid-sentence without eating the rest', () => {
    expect(frontmatterText('Notes on [[Sample Book]] and others')).toBe('Notes on Sample Book and others');
  });

  it('drops empties from a list rather than leaving stray commas', () => {
    expect(frontmatterText(['[[A]]', '', '  '])).toBe('A');
  });

  it('returns empty for what it cannot read', () => {
    expect(frontmatterText(undefined)).toBe('');
    expect(frontmatterText(42)).toBe('');
    expect(frontmatterText({ a: 1 })).toBe('');
    expect(frontmatterText([])).toBe('');
  });
});

describe('epubTargetPath', () => {
  const conv = (over: Partial<EpubConversion>): EpubConversion => ({
    fileName: 'My Note',
    folder: 'Books',
    title: 'T',
    author: '',
    publisher: '',
    publicationDate: '',
    type: 'book',
    language: 'en',
    splitLevel: 2,
    fetchRemoteImages: false,
    font: '',
    ...over,
  });

  it('joins the folder and appends the extension', () => {
    expect(epubTargetPath(conv({}))).toBe('Books/My Note.epub');
  });

  it('writes to the vault root for `/`', () => {
    expect(epubTargetPath(conv({ folder: '/' }))).toBe('My Note.epub');
  });

  it('strips characters a path cannot hold, since the name is typed by hand', () => {
    // The folder separator is legitimate, so only the file name is checked.
    const name = epubTargetPath(conv({ fileName: 'a/b: "c"?' }))
      .split('/')
      .pop();
    expect(name).not.toMatch(/[:"?]/);
    expect(name?.endsWith('.epub')).toBe(true);
  });

  it('does not double the extension when the reader types it', () => {
    // The dialog shows `.epub` beside the field, but someone will type it anyway, and `name.epub.epub` is not a
    // thing anyone wants.
    expect(epubTargetPath(conv({ fileName: 'My Note.epub' }))).toBe('Books/My Note.epub');
    expect(epubTargetPath(conv({ fileName: 'My Note.EPUB' }))).toBe('Books/My Note.epub');
  });

  it('leaves an extension in the MIDDLE of a name alone', () => {
    // Only a trailing one is the mistake; `notes.epub.draft` is a name somebody chose.
    expect(epubTargetPath(conv({ fileName: 'notes.epub.draft' }))).toBe('Books/notes.epub.draft.epub');
  });

  it('falls back rather than producing a nameless file', () => {
    expect(epubTargetPath(conv({ fileName: '///' }))).toBe('Books/book.epub');
  });
});
