// Writing a record note. See docs/design/library.md.
//
// Two jobs that both have to be exactly right, because both fail silently: turning values into YAML a parser
// reads back unchanged, and turning a title into a filename the vault accepts.
//
// **Everything is quoted.** A title with a colon in it (`Sample Book: A Subtitle`) is a YAML mapping if left bare, an
// apostrophe breaks a single-quoted scalar, and a value that looks like a number or a date is silently retyped.
// Quoting unconditionally costs nothing and removes the whole class.

import { sanitizeVaultName } from '../vault-names';
import { NOTE_KIND_KEY, NOTE_KIND_TITLE } from './record';

/** The fields a generated record carries. Anything absent is simply not written. */
export interface RecordNoteFields {
  title: string;
  authors?: string[];
  /** The medium. Cataloging writes `book`; everything else is the reader's own vocabulary. */
  type?: string;
  /** What sort of work it is. Never written by Orbis — it has no way to know. */
  genre?: string;
  publisher?: string;
  publicationDate?: string;
  language?: string;
  series?: string;
  seriesIndex?: string;
  isbn?: string;
  /** Vault paths — bracketed on the way out, so Obsidian maintains them across renames. */
  files?: string[];
  cover?: string;
  source?: string;
  sourceId?: string;
  sourceUrl?: string;
  /** Vault paths of the notes a converted book was made from — bracketed on the way out, like `files`. */
  sourceNotes?: string[];
  added?: string;
}

/** Region markers Orbis owns. Regenerating replaces what is between them and nothing else. */
export const ORBIS_REGION_START = '%%orbis:begin%%';
export const ORBIS_REGION_END = '%%orbis:end%%';

/**
 * A YAML double-quoted scalar.
 *
 * **A raw newline in a title breaks the whole block.** Rare, in a contents label rarer still, but nothing stops
 * `dc:title` from splitting a title and subtitle. Quoting alone lets that newline
 * through, so the value continues at column 0 — which is less indented than its key, and therefore invalid YAML
 * rather than a folded scalar. Obsidian then rejects the entire frontmatter block, so a record loses every property it
 * had: the type, the authors, the links a dashboard reads. A title crafted to look like `Sample\ntags: [owned]` is the
 * same mechanism pointed on purpose.
 *
 * So every character YAML will not take raw is escaped (`yamlForbids`), not just the two structural ones. One pass
 * over the characters rather than a chain of replaces — a chain has to put backslashes first or it escapes its own
 * escapes, and that ordering is a trap for whoever edits this next.
 *
 * A scan rather than a regex because a literal control-character class (`\u0000-\u001f`) is what two separate
 * lint rules exist to catch, and here the control range *is* the subject — so it reads as a comparison rather
 * than as a pair of suppressions asserting the rule does not apply.
 */
const YAML_ESCAPES: Readonly<Record<string, string>> = {
  '\\': '\\\\',
  '"': '\\"',
  '\n': '\\n',
  '\r': '\\r',
  '\t': '\\t',
};

/**
 * A character YAML 1.2 does not allow raw: the C0 and C1 controls and DEL, a surrogate standing alone, U+FFFE and
 * U+FFFF. Also U+2028 and U+2029, which YAML 1.2 allows but 1.1 reads as line breaks, as it does NEL (in C1).
 *
 * Measured: Obsidian reads all of these back unchanged, quoted or bare, so a note was never broken in Obsidian. js-yaml
 * — behind many tools that read a vault's notes — rejects the whole block over a bare C1 character or U+FFFE.
 * `for…of` yields a character beyond U+FFFF whole, so a surrogate code seen here is one standing alone.
 */
function yamlForbids(code: number): boolean {
  return (
    code <= 0x1f ||
    (code >= 0x7f && code <= 0x9f) ||
    code === 0x2028 ||
    code === 0x2029 ||
    (code >= 0xd800 && code <= 0xdfff) ||
    code === 0xfffe ||
    code === 0xffff
  );
}

export function yamlString(value: string): string {
  let escaped = '';
  for (const ch of value) {
    const known = YAML_ESCAPES[ch];
    if (known) {
      escaped += known;
      continue;
    }
    const code = ch.codePointAt(0) ?? 0;
    // `\xNN` and `\uNNNN` are how YAML spells a character it will not take raw.
    if (!yamlForbids(code)) escaped += ch;
    else if (code <= 0xff) escaped += `\\x${code.toString(16).padStart(2, '0')}`;
    else escaped += `\\u${code.toString(16).padStart(4, '0')}`;
  }
  return `"${escaped}"`;
}

/**
 * A value as Obsidian would write it: **bare where YAML reads it back as the same text, quoted everywhere else.**
 *
 * Quoting every value was safe and looked like no note anyone writes — `title: "Footnotes"` beside the
 * `title: Footnotes` Obsidian's own Properties editor produces, so a note changed style the first time a status was
 * set on it. Bare only when nothing can go wrong: it starts with a letter or a digit (no YAML indicator), holds no
 * character YAML will not take raw (`yamlForbids`), no `: ` or ` #` and no trailing colon, and is not a word or
 * number YAML would turn into something else. Obsidian parses with YAML 1.2's core schema, where a date stays text;
 * the 1.1 booleans are ruled out too, for any other tool reading the note. Everything else — a wikilink, a title
 * opening with a quote or a dash, one crafted to break out of its line — keeps `yamlString`'s quoting and escaping.
 */
export function yamlScalar(value: string): string {
  return plainSafe(value) ? value : yamlString(value);
}

function plainSafe(value: string): boolean {
  if (!value || value !== value.trim()) return false;
  if (!/^[\p{L}\p{N}]/u.test(value)) return false;
  for (const ch of value) if (yamlForbids(ch.codePointAt(0) ?? 0)) return false;
  if (value.includes(': ') || value.includes(' #') || value.endsWith(':')) return false;
  if (/^(true|false|null|yes|no|on|off|y|n)$/i.test(value)) return false;
  if (/^[-+]?(\.\d+|\d+(\.\d*)?)([eE][-+]?\d+)?$/.test(value) || /^0[xo]/i.test(value)) return false;
  return true;
}

/** `key: value`, or nothing at all when there is no value — an empty key is noise in a Properties editor. */
function scalarLine(key: string, value: string | undefined): string {
  return value && value.trim() ? `${key}: ${yamlScalar(value.trim())}\n` : '';
}

/** A block list, or nothing when empty. Written multi-line because a title can contain a comma. */
function listLines(key: string, values: string[] | undefined): string {
  const kept = (values ?? []).map((v) => v.trim()).filter((v) => v.length > 0);
  if (kept.length === 0) return '';
  return `${key}:\n${kept.map((v) => `  - ${yamlScalar(v)}\n`).join('')}`;
}

/**
 * A path as a wikilink, unless it already is one.
 *
 * **The brackets are the point.** A bare path resolves and a wikilink resolves, so this looks cosmetic until the
 * file moves: Obsidian rewrites links when it renames or moves their target, and a string is just a string. It
 * also makes the field clickable in the Properties editor, which is where someone will look first.
 */
/**
 * The link text a record uses to name a file: **the full vault path, always.**
 *
 * `metadataCache.fileToLinktext` is the obvious answer and the wrong one here. It writes Obsidian's shortest
 * unambiguous form, so a book whose name happens to be unique today is recorded as `[[Book.epub]]` — and the day
 * a second `Book.epub` lands in another folder, that link silently means a different file. For a record, which
 * exists to say WHICH copy this is, that failure is both invisible and consequential: Read opens the wrong book,
 * and the delete cleanup cannot tell the two records apart.
 *
 * The usual argument for the short form — it survives the target being moved — does not cost us anything here,
 * because `resolveRecordFile` already falls back to Obsidian's own linkpath search when no path matches. A full
 * path therefore resolves exactly when it is right, and still finds the file by name when it has moved. The short
 * form has no matching answer for ambiguity.
 *
 * `.md` is dropped, as Obsidian writes it, so a source note reads as a note rather than as a filename.
 */
export function recordLinkText(file: { path: string; extension: string }): string {
  return file.extension === 'md' ? file.path.replace(/\.md$/, '') : file.path;
}

export function wikilink(pathOrLink: string): string {
  const value = pathOrLink.trim();
  if (!value) return '';
  return /^!?\[\[.*\]\]$/.test(value) || /^!?\[[^\]]*\]\(.*\)$/.test(value) ? value : `[[${value}]]`;
}

/**
 * The frontmatter block for a record.
 *
 * Field order is deliberate and matches how someone reads a book's description — what it is, who made it, where
 * it sits, what it points at — because this is a note a person will open and edit by hand.
 */
export function recordFrontmatter(fields: RecordNoteFields): string {
  const title = fields.title.trim();
  return [
    '---\n',
    // Said outright, and it IS the test — see `parseRecord`. A note without this line is not a record, however
    // good its title, which is what lets a reading record and a title note live in one vault without a heuristic
    // guessing between them.
    `${NOTE_KIND_KEY}: ${NOTE_KIND_TITLE}\n`,
    scalarLine('title', title),
    // An alias so link autocomplete finds the title even when the filename had to be disambiguated.
    listLines('aliases', [title]),
    scalarLine('type', fields.type),
    scalarLine('genre', fields.genre),
    listLines('authors', fields.authors),
    scalarLine('publisher', fields.publisher),
    scalarLine('publication_date', fields.publicationDate),
    scalarLine('language', fields.language),
    scalarLine('series', fields.series),
    scalarLine('series_index', fields.seriesIndex),
    scalarLine('isbn', fields.isbn),
    scalarLine('cover', fields.cover ? wikilink(fields.cover) : ''),
    listLines('files', (fields.files ?? []).map(wikilink)),
    scalarLine('source', fields.source),
    scalarLine('source_id', fields.sourceId),
    scalarLine('source_url', fields.sourceUrl),
    listLines('source_notes', (fields.sourceNotes ?? []).map(wikilink)),
    scalarLine('added', fields.added),
    '---\n',
  ].join('');
}

/**
 * A whole generated note: the frontmatter, and an empty body for the reader.
 *
 * **No embed of the book.** Notes used to carry `![[book]]` in a `%%orbis:begin%% … %%orbis:end%%` region. It said
 * nothing `files` does not — a link in a property opens the book and counts for backlinks and the graph — and it was a
 * second copy of the book's path that a rename could leave behind. Older notes still have the region: the cleanup takes
 * it out before asking whether the reader wrote anything (`title-note-cleanup.ts`), and a rename re-points its links
 * (`title-note-rename.ts`), so `ORBIS_REGION_START` and `ORBIS_REGION_END` stay. Everything in a new note's body is the
 * reader's.
 */
export function recordNoteContent(fields: RecordNoteFields): string {
  return recordFrontmatter(fields);
}

/**
 * A title as a filename.
 *
 * Obsidian rejects `\ / : * ? " < > |` outright, and a leading dot hides the file. Replaced with a space rather
 * than deleted, so `Sample Book: A Subtitle` reads as `Sample Book A Subtitle` instead of `Sample BookA Subtitle`.
 */
export function sanitizeNoteName(title: string): string {
  // 120, because a title note is named for a whole book and a subtitle is part of the title; and a fallback,
  // because a note must exist even when a book's metadata gives nothing usable. Rules: `sanitizeVaultName`.
  return sanitizeVaultName(title, { max: 120, fallback: 'Untitled' });
}

/**
 * A path in `folder` for this title that no existing note occupies.
 *
 * **Never overwrites.** Two books can legitimately share a title, and a catalog run that silently replaced one
 * with the other would destroy whatever the reader had written in the first. `taken` is compared case-insensitively
 * because the vault may sit on a filesystem that thinks so too.
 */
export function uniqueNotePath(folder: string, title: string, taken: Set<string>): string {
  const base = sanitizeNoteName(title);
  const dir = folder.replace(/^\/+|\/+$/g, '');
  const lower = new Set([...taken].map((p) => p.toLowerCase()));
  for (let n = 1; ; n++) {
    const name = n === 1 ? base : `${base} (${n})`;
    const path = dir ? `${dir}/${name}.md` : `${name}.md`;
    if (!lower.has(path.toLowerCase())) return path;
  }
}
