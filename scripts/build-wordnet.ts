// Build the offline WordNet asset the Look-up panel downloads.
//
// **From the source release, not from someone's extract.** Princeton's own WordNet stopped at 3.0 (2006) and 3.1
// (2011, database only), so every copy floating around is a snapshot that will never move. Open English WordNet is
// the maintained successor — derived from Princeton's by the Global WordNet Association, released annually — so
// pinning a release here and rebuilding is what keeps the dictionary current.
//
// **Pinned, not "latest".** A build that silently changes its input is a build nobody can reproduce: the asset a
// reader downloaded and the one this script makes today have to be the same file. Bump `EDITION` deliberately.
//
// Run: `pnpm build:wordnet` — writes the asset next to this script's output path and prints what it contains.
// The Dictionaries workflow calls the same script, so the hosted file and a local build cannot differ.

import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { downloadPinned } from './pinned-download';

/** The Open English WordNet release this asset is built from. See the note above before changing it. */
const EDITION = '2025';
const RELEASE_URL = `https://github.com/globalwordnet/english-wordnet/releases/download/${EDITION}-edition/english-wordnet-${EDITION}-json.zip`;
/** SHA-256 of that release's zip. Bump it with `EDITION`, from a download of the new edition, and never otherwise. */
const RELEASE_SHA256 = '7d749f6e2c39e6970e4997839dcf6e42fd281f3c2fae0171d2192bae8cfa4b51';
const OUT = `dist-assets/orbis-wordnet-${EDITION}.json`;

/**
 * CC BY 4.0 asks for attribution wherever the work travels, so it travels IN the asset rather than only in a
 * settings page somebody may never open. It is also why the file is an object with an `entries` map rather than a
 * bare map: a `__license` key alongside real headwords would be a word you could look up.
 */
const LICENCE = {
  source: `Open English WordNet ${EDITION}`,
  license: 'CC BY 4.0',
  attribution:
    'Open English WordNet, derived from Princeton WordNet by the Open English WordNet community. ' +
    'Licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/).',
  /**
   * **Modified, and said so.** CC BY §3(a)(1)(B) asks that a derivative indicate it is one. This asset is not the
   * release: senses are joined to their synsets and flattened, headwords lowercased and case-variants merged, and
   * the corpus provenance on 1,092 examples dropped. A reader who wants WordNet itself should be sent to it.
   */
  modified:
    `Extracted from the Open English WordNet ${EDITION} release for offline look-up: senses joined to their ` +
    'definitions and examples, headwords lowercased and merged, everything else discarded. Not the release itself.',
  url: 'https://en-word.net/',
};

/**
 * WordNet's part-of-speech codes, as the panel groups senses by.
 *
 * `s` is a satellite adjective — a shade of another adjective's meaning — which is a distinction internal to the
 * database and not one a reader looking a word up wants explained, so it reads as an adjective like `a` does.
 */
const POS: Record<string, string> = { n: 'noun', v: 'verb', a: 'adjective', s: 'adjective', r: 'adverb' };
/** The order senses are grouped in: what a word most often IS, before what it does or describes. */
const POS_ORDER = ['noun', 'verb', 'adjective', 'adverb'];

interface Synset {
  definition?: string[];
  /**
   * Mostly plain sentences, and 1,092 of them objects carrying where the sentence came from.
   *
   * Corpus-sourced examples are `{ source, text }` — a real shape in the release, not a malformed one — so a
   * transform that assumes strings crashes on `noun.substance`. The provenance is dropped: it belongs to WordNet's
   * own editors, and a reader looking up a word wants the sentence.
   */
  example?: (string | { text?: string })[];
  partOfSpeech?: string;
}
interface Sense {
  synset?: string;
}
/** One sense as the asset stores it: part of speech, the gloss, and WordNet's own example sentences. */
interface AssetSense {
  pos: string;
  def: string;
  ex?: string[];
}

async function main(): Promise<void> {
  const work = await mkdtemp(join(tmpdir(), 'orbis-wordnet-'));
  try {
    const zip = join(work, 'wordnet.zip');
    await downloadPinned(RELEASE_URL, RELEASE_SHA256, zip);
    // `unzip` rather than a dependency: this runs on a developer's machine and on a CI runner, both of which have
    // it, and a build script is the last place to add a package to the plugin's tree.
    execFileSync('unzip', ['-oq', zip, '-d', work]);

    const files = await readdir(work);
    const jsons = files.filter((f) => f.endsWith('.json'));
    /**
     * Two kinds of file, and the join between them is the whole job.
     *
     * `entries-*.json` map a headword to its parts of speech and, under each, the synsets its senses belong to.
     * The other forty-odd — `noun.animal.json`, `verb.motion.json`, WordNet's lexicographer files — hold the
     * synsets themselves: the definition and the examples. Neither is usable alone.
     */
    const synsets = new Map<string, Synset>();
    for (const f of jsons.filter((f) => !basename(f).startsWith('entries-'))) {
      const data = JSON.parse(await readFile(join(work, f), 'utf8')) as Record<string, unknown>;
      for (const [id, syn] of Object.entries(data)) {
        // Not everything beside the entries is a lexicographer file: `frames.json` is a table of syntactic frames
        // whose values are plain strings. Detected by shape rather than by name — a release that adds another
        // sidecar should be skipped for what it is, not for what it is called.
        if (syn && typeof syn === 'object' && 'definition' in syn) synsets.set(id, syn as Synset);
      }
    }

    /**
     * **A `Map`, not an object literal, and that is not a style preference.**
     *
     * `constructor` is an English word and WordNet has it. Keyed into a plain object, `entries[word] ??= []` finds
     * the inherited `Object` constructor — truthy, so nothing is assigned — and the next `.push` throws. The same
     * trap waits for whoever writes the reading side: parse this asset into a `Map`, or
     * key it with `Object.create(null)`, or looking up "constructor" returns a function.
     */
    const entries = new Map<string, AssetSense[]>();
    let senseCount = 0;
    for (const f of jsons.filter((f) => basename(f).startsWith('entries-'))) {
      const data = JSON.parse(await readFile(join(work, f), 'utf8')) as Record<
        string,
        Record<string, { sense?: Sense[] }>
      >;
      for (const [word, byPos] of Object.entries(data)) {
        const senses: AssetSense[] = [];
        for (const [code, block] of Object.entries(byPos)) {
          const pos = POS[code] ?? code;
          for (const sense of block.sense ?? []) {
            const syn = sense.synset ? synsets.get(sense.synset) : undefined;
            const def = (syn?.definition ?? []).join(' ').trim();
            if (!def) continue;
            const ex = (syn?.example ?? [])
              .map((e) => (typeof e === 'string' ? e : (e?.text ?? '')).trim())
              .filter(Boolean);
            senses.push(ex.length ? { pos, def, ex } : { pos, def });
          }
        }
        if (!senses.length) continue;
        /**
         * **Lowercased, and merged when two headwords differ only in case.**
         *
         * A reader selects a word in a book, where capitalization is the sentence's business rather than the
         * word's — and the lookup lowercases before it asks. `Set` the Egyptian god and `set` the verb are one
         * entry here for the same reason: someone who selected either wants both offered.
         */
        const key = word.toLowerCase();
        const held = entries.get(key);
        if (held) held.push(...senses);
        else entries.set(key, senses);
        senseCount += senses.length;
      }
    }

    // Grouped by part of speech within a headword, so the panel's tabs do not have to sort 57 senses of "run".
    for (const senses of entries.values()) {
      senses.sort((a, b) => {
        const ai = POS_ORDER.indexOf(a.pos);
        const bi = POS_ORDER.indexOf(b.pos);
        return (ai < 0 ? POS_ORDER.length : ai) - (bi < 0 ? POS_ORDER.length : bi);
      });
    }

    await mkdir('dist-assets', { recursive: true });
    await writeFile(OUT, JSON.stringify({ ...LICENCE, entries: Object.fromEntries(entries) }));
    const bytes = (await stat(OUT)).size;
    const headwords = entries.size;
    let withEx = 0;
    for (const senses of entries.values()) withEx += senses.filter((x) => x.ex?.length).length;
    console.log(`\n${OUT}`);
    console.log(`  headwords     ${headwords.toLocaleString()}`);
    console.log(`  senses        ${senseCount.toLocaleString()}  (${withEx.toLocaleString()} with examples)`);
    console.log(`  size          ${(bytes / 1048576).toFixed(1)} MB`);
    // Both numbers the reading side keeps by hand, printed together because both carry the same obligation.
    // `maxWords` is what tells the panel a selection is too long to be a headword, so it must never UNDER-state
    // the asset: a low value silently hides the longest entries, so the number comes from here, never a guess.
    let maxWords = 0;
    let longest = '';
    for (const word of entries.keys()) {
      const n = word.split(' ').length;
      if (n > maxWords) {
        maxWords = n;
        longest = word;
      }
    }
    console.log(`  multi-word    ${[...entries.keys()].filter((w) => w.includes(' ')).length.toLocaleString()}`);
    console.log(`  maxWords      ${maxWords}  ("${longest}")`);
    console.log(`\nSet sizeMb and maxWords for WORDNET in src/reader/lookup/dictionary-sources.ts to match.`);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

void main();
