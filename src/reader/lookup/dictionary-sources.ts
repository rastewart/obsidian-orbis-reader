// The two dictionaries the Look-up panel offers, pinned: where each is hosted, its size, and its SHA-256.
//
// **A module of its own, with nothing from Obsidian in it,** because the dictionary workflow
// (`.github/workflows/dictionaries.yml`) has to read these pins too. It builds both files and refuses to upload one
// whose digest is not the one pinned here, so the hosted file and the file the plugin accepts cannot drift apart —
// and a script cannot load `DictionaryService`, which needs Obsidian to run.

/**
 * The dictionaries the Look-up panel can offer, and what each one costs to fetch. See docs/design/look-up.md.
 *
 * **Two, because they fail in opposite directions.** Webster's 1913 is the right book for the nineteenth-century
 * texts that fill a Gutenberg library and has never heard of a smartphone; WordNet is modern, terse, and has no
 * etymology and no archaic senses. Which one answers a word is not a preference to set once — it is a property of
 * the word — so both can be present and the panel offers whichever has an entry.
 *
 * Temporary local host for both assets; a single constant each, so moving to a public host is a one-line change.
 *
 * `sizeMb` is **measured, not derived**, and carries an obligation: **regenerate an asset, update its number.** It
 * cannot be read from the file the way `sizeBytes()` reads it afterwards — the only honest source before the
 * download is a HEAD request, and a settings page should not go to the network to draw a sentence. Same shape as
 * `FONT_DOWNLOAD_MB`.
 */
export interface DictionarySource {
  id: 'webster' | 'wordnet';
  /** The year of the edition this asset is built from. It names the file, the URL and the book on screen. */
  edition: string;
  url: string;
  file: string;
  sizeMb: number;
  /**
   * The most words any headword in this book has.
   *
   * **Measured, and carrying the same obligation as `sizeMb`: regenerate an asset, update its number.** Both books
   * key multi-word entries — *point of view*, *red herring*, *Food and Agriculture Organization of the United
   * Nations* — and WordNet is 41.5% of them, so a selection with a space in it is very often a headword. This is
   * what says when it cannot be: a term longer than the longest entry cannot match, so the book is not asked and,
   * more to the point, its 21 MB is not parsed to answer a paragraph somebody selected for the vault section.
   *
   * A guess would have been wrong. 5 was picked by eye first, which is exactly Webster's bound and less than half
   * of WordNet's — it would have hidden every entry from *academy of television arts and sciences* upward.
   */
  maxWords: number;
  /**
   * SHA-256 of the file as hosted. A download that does not hash to this is refused and nothing is written.
   *
   * **Checked on download only, not on every read** — unlike Piper's WASM (`asset-integrity.ts`), which is code.
   * A dictionary is data drawn as plain text (`createSpan({ text })`), so the worst a tampered file can do is show a
   * wrong definition; the check that matters is the one between the host and the disk. Same obligation as `sizeMb`:
   * **regenerate an asset, update its digest**, and never take a new digest from a download that failed this check.
   */
  sha256: string;
  /**
   * Where the book came from, and on what terms.
   *
   * **Static, and beside the download button rather than beside every definition.** It has to be readable when
   * the asset is NOT on disk — that is when a reader is deciding whether to take it — so it cannot come from the
   * file the way the asset's own embedded notice does. CC BY is satisfied at the point the work is SHARED, which
   * for Orbis is the asset itself; this line is the same courtesy the DejaVu fonts get in the README, not a
   * license obligation discharged on every look-up.
   */
  credit: { text: string; url: string };
}

/** The repository's `dictionaries` release, which `.github/workflows/dictionaries.yml` fills. */
const HOST = 'https://github.com/rastewart/obsidian-orbis-reader/releases/download/dictionaries';

/**
 * **The edition is stated once.** It is part of the file's name, part of its URL and part of what the book is
 * called on screen, and a year typed into three places is a year that will eventually disagree with itself.
 */
function dictionary(
  id: DictionarySource['id'],
  edition: string,
  sizeMb: number,
  maxWords: number,
  sha256: string,
  credit: DictionarySource['credit']
): DictionarySource {
  const file = `orbis-${id}-${edition}.json`;
  return { id, edition, file, url: `${HOST}/${file}`, sizeMb, maxWords, sha256, credit };
}

// 22,458,875 bytes as hosted. Webster's 1913 is out of copyright and asks for nothing; the line is here because a
// row that says where one book came from and nothing about the other reads as an oversight.
//
// `assets/build-dictionary.py` reproduces this file byte for byte from the source commit `assets/README.md` names, so
// the digest is checkable against the source rather than only against the host — as WordNet's is, below.
export const WEBSTER = dictionary(
  'webster',
  '1913',
  21,
  5 /* "empire state of the west" */,
  '61ed147697ffeb8ae07e3139356ac47c8c009772607939b4ea58c64640784435',
  {
    text: 'Webster’s Revised Unabridged Dictionary (1913) · public domain',
    url: 'https://www.gutenberg.org/ebooks/29765',
  }
);
// 22,241,160 bytes — see `scripts/build-wordnet.ts`, which also states the modification CC BY §3(a)(1)(B) asks for.
// `pnpm build:wordnet` reproduces this file byte for byte, so the digest is checkable against the source release
// rather than only against the host.
export const WORDNET = dictionary(
  'wordnet',
  '2025',
  21,
  11 /* "congregation of the sisters of st catherine the virgin and martyr" */,
  '2965a9d8e869b076c5d711b10ac1ec949996ca9a736e622a65267f00a1baf464',
  {
    text: 'Open English WordNet · CC BY 4.0',
    url: 'https://en-word.net/',
  }
);

/** In the order the panel offers them: the older book first, because it is the one that was here first. */
export const DICTIONARY_SOURCES: readonly DictionarySource[] = [WEBSTER, WORDNET];
