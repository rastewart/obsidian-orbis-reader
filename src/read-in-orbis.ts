// *Read in Orbis Reader* — one menu item that turns a note into a book and opens it, asking nothing.
//
// See docs/design/read-in-orbis-reader.md. The lookup and the decision live in `book-origin.ts`, which is pure
// and tested; this is the part that touches the vault, and it is deliberately thin — it reads a note, asks what
// to do, and does it.
//
// **The EPUB is a means, not the point.** Converting buys annotations, CFIs, reading position, the player,
// statistics and reading records for free, all of which are keyed to a book. A Markdown-rendering reader would
// be a second engine with none of it.
//
// **One converter.** `saveNoteAsEpub` is the same function *Save note as EPUB…* calls. The settings will fork
// (step 5); the code does not, because a fix in one path that stops reaching the other is exactly the failure
// the shared settings were meant to prevent.

import { type App, Notice, type TFile } from 'obsidian';
import {
  bookBaseForNote,
  findBooksFromNote,
  type NoteBook,
  nextBookPath,
  noteBodyHash,
  resolveNoteBooks,
  writeBookOrigin,
} from './book-origin';
import { askAboutChangedNote } from './ChangedNoteModal';
import { withDeferredProgress } from './deferred-progress';
import { t } from './i18n';
import { type EpubConversion, epubDefaults, savedAnnotationCount, saveNoteAsEpub } from './markdown-epub';
import { type BookOpenIntent, openBookWith } from './OrbisReaderView';
import { resolveSplitLevel } from './split-level';

/** What this needs from the plugin, named rather than passed as the plugin itself — the orchestration below is
 *  worth reading without also reading what a plugin is. */
export interface ReadInOrbisDeps {
  app: App;
  /** Whether the frontmatter keys this vault writes are English or native — see `epubDefaults`. */
  keyLang: string;
  fetchRemoteImages: boolean;
  defaultType: string;
  /** The preferred heading level, resolved below against the headings this note actually has. */
  splitLevel: number;
  /**
   * How the book should look the moment it opens — the mode, and which secondary bar comes with it.
   *
   * Passed in rather than decided here, because step 5 turns it into two settings and this is the line that
   * changes: the caller reads them, this just carries the answer to `openBookWith`.
   */
  openWith: BookOpenIntent;
  /** Write the book's title note. The plugin owns this because the Library does. */
  writeTitleNote: (epubPath: string, conv: EpubConversion, note: TFile) => Promise<void>;
  /** One line into the dashboard's debug panel — the panel a reader can open, not a console they cannot. See
   *  `OrbisReaderPlugin.debug`. */
  debug: (msg: string, extra?: unknown) => void;
}

/**
 * Turn a note into a book and open it.
 *
 * Three outcomes, and only one of them says anything: a note whose book still matches reopens it, a note whose
 * book has nothing in it gets that book rebuilt in place, and a note whose book carries annotations asks. The
 * silence is the feature — *Save note as EPUB…* is the one you open to make decisions.
 *
 * **Nothing here overwrites work.** The rebuild branch is reached only when every book this note made is
 * unannotated, and the ask branch creates a new version rather than replacing the annotated one.
 */
export async function readNoteInOrbis(file: TFile, deps: ReadInOrbisDeps): Promise<void> {
  /**
   * **One catch around the whole thing, because this command has no dialog of its own to fail inside.**
   *
   * Every other conversion reports a failure into the dialog you started it from; this one was invoked from a
   * context menu and has nowhere to put an error, so an unreadable note or an unwritable folder would otherwise
   * be a tap that did nothing at all. The notice says which note, since a menu item acts on a file you may no
   * longer be looking at; the reason goes to the debug log, where it can be read on a phone.
   */
  try {
    await convertOrOpen(file, deps);
  } catch (err) {
    deps.debug('read in Orbis Reader failed', err);
    new Notice(t('notices.read_in_orbis_failed', { name: file.basename }));
  }
}

async function convertOrOpen(file: TFile, deps: ReadInOrbisDeps): Promise<void> {
  const { app } = deps;
  const source = await app.vault.read(file);
  const hash = await noteBodyHash(source);
  const books = await findBooksFromNote(app, file, (path) => savedAnnotationCount(app, path));
  const decision = resolveNoteBooks(books, hash);

  if (decision.kind === 'open') return await open(deps, decision.book.path);
  if (decision.kind === 'ask') {
    // The only question this feature asks, and it is asked because the alternative is to strand work someone
    // did. Dismissing it answers nothing and does nothing — see `askAboutChangedNote`.
    const choice = await askAboutChangedNote(app, decision.annotated);
    if (!choice) return;
    if (choice.kind === 'open') return await open(deps, choice.path);
  }
  await convertAndOpen(file, hash, decision.replacing, deps);
}

/**
 * Write the book, its origin file and its title note, then open it.
 *
 * `hash` is handed down rather than recomputed, so the hash recorded in the origin file is provably the one the
 * decision was made on. Reading the note twice would be two answers to one question.
 */
async function convertAndOpen(
  file: TFile,
  hash: string,
  replacing: NoteBook | null,
  deps: ReadInOrbisDeps
): Promise<void> {
  const { app } = deps;
  const folder = file.parent?.path ?? '/';
  const base = bookBaseForNote(file.basename);
  // Replacing keeps the path, which is the whole point of replacing: annotations and reading position are keyed
  // to it, and a book that changed its name would orphan both.
  const target = replacing?.path ?? nextBookPath(folder, base, new Set(app.vault.getFiles().map((f) => f.path)));

  const conv: EpubConversion = {
    ...epubDefaults(app, file, {
      keyLang: deps.keyLang,
      // **Beside the note, and not configurable.** `Clippings/Sample Book.md` and `Archive/Sample Book.md` both want
      // `Books/Sample Book.epub`, and Obsidian guarantees two notes in one folder cannot share a name — so this
      // makes the collision impossible rather than resolved. The other conversions never have to find their
      // output again; this one does, on every invocation, which makes location a mechanism and not a preference.
      sameFolderAsNote: true,
      folder,
      fetchRemoteImages: deps.fetchRemoteImages,
      defaultType: deps.defaultType,
      splitLevel: deps.splitLevel,
    }),
    // Carried for the record's sake — `targetPath` below is what actually decides where the file goes, because
    // `epubTargetPath` would sanitize this on the way past and the lookup has to find the book again.
    fileName:
      target
        .split('/')
        .pop()
        ?.replace(/\.epub$/i, '') ?? base,
    folder,
    // No dialog to resolve this, so it is resolved here — against the headings Obsidian has already parsed,
    // rather than by rendering the note a second time to count them. A note of H3s splits on H3 rather than on
    // an H2 it does not have.
    splitLevel: resolveSplitLevel(
      deps.splitLevel ?? 2,
      [1, 2, 3, 4, 5, 6].map(
        (n) => (app.metadataCache.getFileCache(file)?.headings ?? []).filter((h) => h.level === n).length
      )
    ),
  };

  /**
   * **Nothing for a short note, something for a long one.** A clipped article converts in a blink and the
   * command's promise is that it feels instant; a book-length note does not, and a window that appears to have
   * ignored the tap is worse than a wait that says what it is doing. See `withDeferredProgress` for the
   * threshold, and for why there is no Cancel.
   */
  const started = Date.now();
  const result = await withDeferredProgress(
    app,
    { title: t('read_in_orbis.working'), message: t('read_in_orbis.working_desc', { name: file.basename }) },
    () => saveNoteAsEpub(app, file, conv, Date.now(), { targetPath: target })
  );
  /**
   * **How long it actually took, because the threshold above is otherwise a guess.**
   *
   * A 1.26 MB note converted on a Mac and on an Android phone without the dialog ever showing — which is either the
   * threshold doing its job or the dialog being broken, and the two are indistinguishable from the outside. This
   * is the number that tells them apart, and it keeps telling: a conversion that gets slower has somewhere to say
   * so before anyone has to notice.
   */
  deps.debug(
    `converted ${file.basename} in ${Date.now() - started}ms`,
    `${Math.round((file.stat?.size ?? 0) / 1024)} KB of Markdown`
  );
  if (!result) return; // `saveNoteAsEpub` has already said why

  // Provenance BEFORE anything else reads it, and before the book is opened: a book whose origin file is missing
  // is a book the next invocation will not recognize as this note's, and it would quietly make a second one.
  await writeBookOrigin(app, result.path, file.path, hash);
  await deps.writeTitleNote(result.path, conv, file);
  await open(deps, result.path);
}

/** Open the book the way this feature is configured to — see `ReadInOrbisDeps.openWith`. */
async function open(deps: ReadInOrbisDeps, path: string): Promise<void> {
  const file = deps.app.vault.getFileByPath(path);
  if (!file) return;
  await openBookWith(deps.app, file, deps.openWith);
}
