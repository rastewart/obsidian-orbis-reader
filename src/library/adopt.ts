// Notes that look like titles but have never said so. See docs/design/library.md.
//
// **The counterweight to a mandatory flag.** A record is a note whose frontmatter says `orbis_note: title`, which
// means a note written by hand, by a template, or by somebody's export script is invisible until it says that.
// That is the right failure — silent and fixable beats found-and-sometimes-wrong — but only because this exists
// to fix it in one pass rather than one note at a time.
//
// It is also where the old heuristic went. Deciding by "has a title and none of these seven markers" was a bad
// rule; SUGGESTING by it is exactly right, because a wrong suggestion costs an unticked checkbox.

import { type App, TFile } from 'obsidian';
import type { CatalogCandidate } from './catalog';
import { LIBRARY_FIELDS } from './fields';
import { type Frontmatter, looksGenerated, NOTE_KIND_KEY, NOTE_KIND_TITLE, noteKind, pickText } from './record';

/** A note the review can offer to adopt: what it is called, and where it lives. */
export interface AdoptCandidate {
  path: string;
  title: string;
}

/**
 * Every library field except the one every note might have.
 *
 * **`title` alone is not evidence.** Templates write it, daily notes write it, meeting notes write it, and half
 * the plugins that touch frontmatter write it — so a list built on "has a title" would offer a reader their whole
 * vault and invite them to press Select all. A second field the library reads is the corroboration: a note
 * carrying an `isbn`, an `author` or a link to an EPUB is making a claim about a book.
 */
const CORROBORATING = LIBRARY_FIELDS.filter((field) => field !== 'title');

/** True when the note says something else the library reads, beyond its title. */
function looksLikeATitle(fm: Frontmatter): boolean {
  return CORROBORATING.some((field) => pickText(fm, field) !== '');
}

/**
 * Notes with a title that no species claims, and some reason to think they describe a book.
 *
 * Four ways to be left out, and each is a decision:
 *
 * - **It already declares itself.** Whatever it says — `title`, and later `reading_record` — the note has an
 *   answer, and a list offering to overwrite it would be offering to break it.
 * - **It has no title.** A README, an index, a reading log. Adopting one puts a nameless row in the catalog.
 * - **It looks generated from a book.** A chapter, a note set, an annotation note. One export of a long novel is
 *   fifty of these, and a list where the real answer is buried under fifty wrong ones is a list nobody reads.
 * - **Nothing but a title, and not where title notes live.** See `CORROBORATING`. The folder is the second way
 *   in, because a stub someone typed in their title-notes folder is a title note that has not been filled in
 *   yet — the location IS the claim there, which it is nowhere else.
 *
 * Both remaining ways in are suggestions, and a wrong one costs an unticked checkbox.
 */
export function adoptable(notes: readonly CatalogCandidate[], recordsFolder = ''): AdoptCandidate[] {
  const folder = recordsFolder.replace(/^\/+|\/+$/g, '');
  const out: AdoptCandidate[] = [];
  for (const note of notes) {
    const fm: Frontmatter | null = note.frontmatter ?? null;
    if (!fm) continue;
    if (noteKind(fm)) continue;
    // Through the reader's aliases, like every other read: a vault whose titles are written `book_title` has
    // said so on the Fields page, and offering only the notes we happen to read the canonical way would leave
    // exactly those notes out.
    const title = pickText(fm, 'title');
    if (!title) continue;
    if (looksGenerated(fm)) continue;
    const inFolder = folder !== '' && (note.path === folder || note.path.startsWith(`${folder}/`));
    if (!inFolder && !looksLikeATitle(fm)) continue;
    out.push({ path: note.path, title });
  }
  return out.sort((a, b) => a.title.localeCompare(b.title) || a.path.localeCompare(b.path));
}

/**
 * Stamp a note as a title note.
 *
 * Nothing else is written. The note already says what it is about — a title, an author, whatever its author
 * thought worth recording — and a pass that "helpfully" filled in `type` or `added` would be inventing facts
 * about somebody else's note in order to make it look like one of ours.
 */
export async function adoptNote(app: App, path: string): Promise<void> {
  const note = app.vault.getAbstractFileByPath(path);
  if (!(note instanceof TFile)) return;
  await app.fileManager.processFrontMatter(note, (fm: Record<string, unknown>) => {
    fm[NOTE_KIND_KEY] = NOTE_KIND_TITLE;
  });
}
