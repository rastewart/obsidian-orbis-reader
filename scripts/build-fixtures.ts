// Builds the generated fixture books, their Library title notes, and the shapes `chapter-rows.test.ts` compares.
//
// Run: `pnpm build:fixtures` → test-vault/fixtures/*.{epub,fb2,cbz}, test-vault/fixtures/library/, and
// src/__tests__/fixtures/book-shapes.json. The books are in `scripts/fixtures/books.ts` (what the tests and test plans
// read) and `scripts/fixtures/findings.ts` (one shape a real book taught the code, each, for checking by hand).
//
// **Nothing here is a real book.** Every fixture is generated, so that no title, author or passage of a real book
// appears anywhere in the repository. See `scripts/fixtures/books.ts` for
// what each book covers.
//
// **Rebuilding is byte-identical.** Every text comes from a seeded generator and every archive is stamped with a fixed
// date, so running this again on an unchanged generator changes no file — `git status` stays clean.
//
// The MOBI and AZW3 fixtures are the exception: nothing in JavaScript writes those formats, so they are converted
// from two of these books once, by hand, in Calibre — see CONVERTED below.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL, type Built } from './fixtures/books';
import { replaceEpubEntry } from './fixtures/epub';
import { FINDINGS } from './fixtures/findings';
import { sampleNotes } from './fixtures/notes';
import { cover } from './fixtures/png';
import { type Shape, shapeOf } from './fixtures/shapes';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = path.join(ROOT, 'test-vault', 'fixtures');
const LIBRARY = path.join(FIXTURES, 'library');
const SHAPES = path.join(ROOT, 'src', '__tests__', 'fixtures', 'book-shapes.json');
const NOTES_TO_EPUB = path.join(FIXTURES, 'notes-to-epub');

/** Built by `pnpm build:hostile-epub`, not here, and already synthetic — its shape is read from the file it writes. */
const ALSO_SHAPED = ['hostile-scripts.epub'];

/**
 * The Library title notes, and the spread of values they carry.
 *
 * They exist to exercise the Library, not to describe the books, so between them they cover what a real vault holds:
 * every reading status and none, a rating, a date and a quoted year, `kind` and the older `type`, bare and
 * path-qualified links, one work held in two formats on two notes (so its second note is "… (2)"), one note listing
 * two formats of a work, and a comic with no author.
 */
const NOTES: Record<
  string,
  {
    name?: string;
    status?: string;
    dateRead?: string;
    rating?: number;
    published?: string;
    legacy?: boolean;
    /** More formats of the same work, listed on this note too — see the note on NOTES. */
    alsoFiles?: string[];
  }
> = {
  'First-Open.epub': { status: '', rating: 2.5, published: '2026-03-28' },
  'annotation-workhorse.epub': { status: 'read', dateRead: '2026-08-16', published: '2026-08-01' },
  // One work in two formats on one note: the case the Library's "the edition you have been reading wins" rule is for
  // (`capabilitiesOf`). Open one, then the other, and the row follows whichever was read last.
  'parts-and-chapters.epub': { status: 'reading', published: '2006-03-28', alsoFiles: ['parts-and-chapters.azw3'] },
  'volumes.epub': { status: 'abandoned', published: '2013-05-09' },
  'parts-and-chapters.fb2': { name: 'Parts and Chapters (2)', published: '"2006"' },
  'fb2-sample.fb2': { status: 'reading', rating: 2.5, published: '"2011"', legacy: true },
  'sample-comic.cbz': { name: 'sample-comic.cbz' },
  'annotation-workhorse.mobi': { name: 'Annotation Workhorse (2)' },
};

/**
 * The Kindle fixtures, which this script cannot write — nothing in JavaScript produces MOBI or AZW3. They are
 * converted with Calibre's `ebook-convert` from three of the books built here, and committed as they came out — the
 * commands are in `test-vault/fixtures/README.md`:
 *
 * - `annotation-workhorse.mobi` — from `annotation-workhorse.epub`, output MOBI with *MOBI file type: old*. That makes
 *   a MOBI 6 file with no KF8 part: the older format, whose sections have bare numbers for names. A "both" file
 *   would open as KF8 and never reach that code.
 * - `parts-and-chapters.azw3` — from `parts-and-chapters.epub`, output AZW3 (KF8).
 * - `technical-book.azw3` — from `technical-book.epub`, output AZW3 (KF8): the Kindle book with a picture inside a
 *   chapter, for the exports' pictures (`kindle-resources.ts`).
 *
 * Calibre keeps each source's title and author, so a title note for one is written from its source — the MOBI has one
 * of its own, and the AZW3 is listed on its source's note (see NOTES). Its cover is not the source's, which says EPUB.
 * `pnpm build:fixtures --calibre-sources` writes `annotation-workhorse-convert-to-mobi.epub` and
 * `parts-and-chapters-convert-to-azw3.epub`: each is its book with the cover swapped for one naming the converted
 * format, and each is what to convert. Delete them once the conversions check out — they are not fixtures, and a plain
 * build does not write them. If a source's text or title changes, convert it again. The build fails without the
 * converted files, rather than writing notes for books that are not there.
 */
const CONVERTED: { file: string; from: string }[] = [
  { file: 'annotation-workhorse.mobi', from: 'annotation-workhorse.epub' },
  { file: 'parts-and-chapters.azw3', from: 'parts-and-chapters.epub' },
  { file: 'technical-book.azw3', from: 'technical-book.epub' },
];

/** Write the Calibre sources as well — see CONVERTED. */
const CALIBRE_SOURCES = process.argv.includes('--calibre-sources');

/** `parts-and-chapters.azw3` → `parts-and-chapters-convert-to-azw3.epub`. */
const calibreSourceName = (file: string) => file.replace(/\.([^.]+)$/, '-convert-to-$1.epub');

/** A cover's file name: the book's, with its format — `parts-and-chapters-fb2` — so two formats of one book keep two. */
const coverName = (file: string) => file.replace(/\.([^.]+)$/, '-$1');

/** A file's format as a cover prints it: `parts-and-chapters.azw3` → `AZW3`. */
const formatOf = (file: string) => (/\.([^.]+)$/.exec(file)?.[1] ?? '').toUpperCase();

function titleNote(b: Built): string {
  const n = NOTES[b.file];
  const base = coverName(b.file);
  // `legacy` writes a note the way an older Library did: `type` rather than `kind`, no `orbis_title_note`, and links
  // qualified with their folder.
  const link = (p: string) => (n.legacy ? `[[fixtures/${p}]]` : `[[${p}]]`);
  const coverLink = n.legacy ? `[[fixtures/library/covers/${base}.png]]` : `[[${base}.png]]`;
  const lines = ['---'];
  if (!n.legacy) lines.push('orbis_title_note: true');
  if (n.legacy) lines.push('orbis_note: title');
  lines.push(`title: ${b.title}`, 'aliases:', `  - ${b.title}`, n.legacy ? 'type: book' : 'kind: book');
  if (b.authors?.length) lines.push('authors:', ...b.authors.map((a) => `  - ${a}`));
  if (n.published) lines.push(`publication_date: ${n.published}`);
  if (b.authors?.length) lines.push('language: en');
  lines.push(
    `cover: "${coverLink}"`,
    'files:',
    ...[b.file, ...(n.alsoFiles ?? [])].map((f) => `  - "${link(f)}"`),
    'source: vault',
    'added: 2026-08-13'
  );
  if (!n.legacy) lines.push('orbis_note: title');
  if (n.status !== undefined) lines.push(`reading_status: ${n.status === '' ? '""' : n.status}`);
  if (n.dateRead) lines.push(`date_read: ${n.dateRead}`);
  if (n.rating !== undefined) lines.push(`rating: ${n.rating}`);
  lines.push('---', '', '%%orbis:begin%%', `!${link(b.file)}`, '%%orbis:end%%', '');
  return lines.join('\n');
}

function main(): void {
  fs.mkdirSync(path.join(LIBRARY, 'covers'), { recursive: true });
  const shapes: Record<string, Shape> = {};
  const built = new Map<string, Built>();
  const note = (b: Built) => {
    if (!NOTES[b.file]) return;
    // A note listing several formats gets a cover naming them all; the book's own cover names only its format.
    const files = [b.file, ...(NOTES[b.file].alsoFiles ?? [])];
    const art =
      files.length > 1 && b.palette !== undefined ? cover(b.palette, b.title ?? b.file, files.map(formatOf)) : b.cover;
    if (art) fs.writeFileSync(path.join(LIBRARY, 'covers', `${coverName(b.file)}.png`), art);
    fs.writeFileSync(path.join(LIBRARY, `${NOTES[b.file].name ?? b.title}.md`), titleNote(b));
  };
  for (const make of [...ALL, ...FINDINGS]) {
    const b = make();
    built.set(b.file, b);
    fs.writeFileSync(path.join(FIXTURES, b.file), b.bytes);
    if (b.shape) shapes[b.file] = shapeOf(b.bytes);
    note(b);
    console.log(`${b.file.padEnd(28)} ${String(b.bytes.length).padStart(8)} bytes`);
  }
  for (const { file, from } of CONVERTED) {
    const source = built.get(from);
    if (!source) throw new Error(`${file}: its source ${from} is not one of the built books`);
    // Its own cover, named for its format: the note's, when it has one, and the one inside the Calibre source.
    const art =
      source.palette === undefined ? source.cover : cover(source.palette, source.title ?? file, [formatOf(file)]);
    if (art) fs.writeFileSync(path.join(LIBRARY, 'covers', `${coverName(file)}.png`), art);
    if (CALIBRE_SOURCES && art) {
      const name = calibreSourceName(file);
      fs.writeFileSync(path.join(FIXTURES, name), replaceEpubEntry(source.bytes, 'cover.png', art));
      console.log(`${name.padEnd(28)} Calibre source for ${file}`);
    }
    if (!fs.existsSync(path.join(FIXTURES, file))) {
      throw new Error(`${file} is missing — convert ${from} in Calibre (see CONVERTED in this file)`);
    }
    note({ ...source, file, shape: false, cover: art });
    console.log(`${file.padEnd(28)} converted by hand${NOTES[file] ? ', title note written' : ''}`);
  }
  for (const n of sampleNotes()) {
    fs.mkdirSync(path.dirname(path.join(NOTES_TO_EPUB, n.path)), { recursive: true });
    fs.writeFileSync(path.join(NOTES_TO_EPUB, n.path), n.content);
  }
  console.log(`notes-to-epub/: ${sampleNotes().length} files`);
  for (const f of ALSO_SHAPED) shapes[f] = shapeOf(new Uint8Array(fs.readFileSync(path.join(FIXTURES, f))));
  fs.writeFileSync(SHAPES, `${JSON.stringify(shapes, null, 2)}\n`);
  console.log(`book-shapes.json: ${Object.keys(shapes).length} books`);
}

main();
