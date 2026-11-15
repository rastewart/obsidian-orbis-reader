/**
 * What to call one section of a book.
 *
 * Pure, and separate from the reader, because the ORDER is the whole decision. The reader gathers the candidates —
 * a contents entry, the section's own heading, a basename match — and this says which of them to believe.
 */

/** Every name a section might be called, gathered by the caller. Any of them may be absent or blank. */
export interface ChapterNameSources {
  /**
   * The contents entry that RESOLVES to this section, disambiguated ("PART II – CHAPTER III").
   *
   * The best answer there is: the book's own contents page, mapped to this section through the authoritative
   * href→section index rather than matched to it by name.
   */
  tocLabel?: string;
  /**
   * The section's own first heading, read from its parsed document.
   *
   * Cannot drift, because it comes from the thing it names. This is what makes MOBI, AZW3 and FB2 work: their
   * section ids are numbers rather than paths, so nothing href-based resolves for them at all.
   */
  heading?: string;
  /**
   * A contents entry whose href shares this section's file basename.
   *
   * Inference rather than evidence — two files can share a basename — so it ranks below the heading. Kept
   * because it is the one path that still works for a book whose href map failed but whose names line up.
   */
  basenameLabel?: string;
}

/**
 * The section's name, in descending order of how much the answer is actually known, ending at its number.
 *
 * **Ending at the number is the point**, not at a proportional guess — handing the section the contents entry
 * sitting at its own index always returns something and is frequently something else's name. A confident wrong
 * name is worse than a number, because nothing about it looks broken: the reader picks chapters to record, or reads
 * which chapter a search hit came from, and has no way to tell it was invented.
 *
 * `numbered` formats the last resort, so this module stays free of the translation table.
 */
export function chapterName(sources: ChapterNameSources, index: number, numbered: (n: number) => string): string {
  // Blank and absent are the same thing here: a heading of '' means "measured, found none", and a contents entry
  // can be whitespace. Neither is a name.
  const pick = (value: string | undefined): string => (value ?? '').trim();
  return pick(sources.tocLabel) || pick(sources.heading) || pick(sources.basenameLabel) || numbered(index + 1);
}

/**
 * The `title` of a note that holds one chapter: the book's title, then the chapter's.
 *
 * **A chapter note titled only with its book says nothing about which chapter it is**: every one of a book's
 * chapter notes looks the same anywhere a title is shown — a search result, a link preview, another plugin's list, a
 * book converted back from one chapter. A title of the chapter alone, `title: "PART I – CHAPTER V"`, is the same
 * failure in a vault holding more than one book. Save as Markdown and Generate notes share this one definition, so
 * they cannot disagree.
 *
 * **A colon, not a dash.** Chapter names are full of en dashes — `PART I – CHAPTER V` — and an em dash between
 * the book and the chapter would read as a third dash in a row. The colon is the conventional title separator,
 * and it is the one character here nothing else is using.
 *
 * **The book is left out when the chapter already names it**, which is what a title page and a Gutenberg header
 * do: `Parts and Chapters: PARTS AND CHAPTERS` says the same thing twice. So does an empty chapter, which
 * gets the book alone rather than a title ending in a colon.
 *
 * The chapter's own name stays in `chapter:` on a Save as Markdown note, unchanged — it is what the folder
 * converter reads for chapter headings on the way back to an EPUB.
 */
export function chapterNoteTitle(bookTitle: string, chapterTitle: string): string {
  const book = bookTitle.trim();
  const chapter = chapterTitle.trim();
  if (!chapter) return book;
  if (!book || chapter.toLowerCase().includes(book.toLowerCase())) return chapter;
  return `${book}: ${chapter}`;
}
