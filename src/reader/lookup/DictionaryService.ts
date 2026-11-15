import { type DataAdapter, requestUrl } from 'obsidian';
import { t } from '../../i18n';
import { sha256Hex, WrongFileError } from '../tts/asset-integrity';
import { DICTIONARY_SOURCES, type DictionarySource } from './dictionary-sources';

/** The book by the name a reader would recognize it by, edition and all. */
export function dictionaryName(source: DictionarySource): string {
  const stem = source.id === 'webster' ? t('lookup.source_webster') : t('lookup.source_wordnet');
  return `${stem} ${source.edition}`;
}

/**
 * What taking all of them costs, for the two places that offer the lot in one button: the setup task and the
 * Look-up panel's empty state. Summed rather than typed, so adding or resizing a book moves the number on its own.
 */
export function totalDictionaryMb(): number {
  return DICTIONARY_SOURCES.reduce((sum, d) => sum + d.sizeMb, 0);
}

/** How many words a selection may have and still be worth looking up at all — the longest book's bound. */
export function maxDictionaryWords(): number {
  return DICTIONARY_SOURCES.reduce((most, d) => Math.max(most, d.maxWords), 0);
}

/** Words in a selection, as `maxWords` counts them. The term reaching here is already whitespace-collapsed. */
export function wordCount(term: string): number {
  return term.split(' ').filter(Boolean).length;
}

/** One sense as the panel draws it. `pos` and `examples` are WordNet's; Webster's has neither. */
export interface DictionarySense {
  pos?: string;
  text: string;
  examples?: string[];
}

/**
 * Query variants to try, in order, when the exact selection isn't a headword. The dictionary keys
 * are base words only (no inflections), so this tiny stemmer covers the common cases — plurals and
 * -ing/-ed/-ly forms — e.g. "running" → "run", "mercies" → "mercy". Pure + exported for testing.
 */
export function lookupCandidates(word: string): string[] {
  const w = (word || '')
    .trim()
    .toLowerCase()
    .replace(/^[^a-z]+|[^a-z]+$/g, ''); // strip surrounding punctuation/quotes
  if (!w) return [];
  const out: string[] = [w];
  const add = (s: string): void => {
    if (s.length > 1 && !out.includes(s)) out.push(s);
  };
  const doubledStem = (b: string): string | null =>
    b.length > 2 && b[b.length - 1] === b[b.length - 2] ? b.slice(0, -1) : null; // running→run
  if (w.endsWith('ies')) add(`${w.slice(0, -3)}y`); // mercies→mercy
  if (w.endsWith('es')) add(w.slice(0, -2)); // boxes→box
  if (w.endsWith('s')) add(w.slice(0, -1)); // books→book
  if (w.endsWith('ing')) {
    const b = w.slice(0, -3);
    add(b); // reading→read
    add(`${b}e`); // making→make
    const d = doubledStem(b);
    if (d) add(d);
  }
  if (w.endsWith('ed')) {
    const b = w.slice(0, -2);
    add(b); // walked→walk
    add(w.slice(0, -1)); // loved→love
    const d = doubledStem(b);
    if (d) add(d); // stopped→stop
  }
  if (w.endsWith('ly')) add(w.slice(0, -2)); // sadly→sad
  return out;
}

/**
 * Webster's stores one entry as one blob of prose with its senses numbered inline — "1. … 2. …" — so the senses
 * are recovered here rather than in the panel: the panel draws `DictionarySense[]` and should not have to know
 * which book a sense came out of.
 */
function websterSenses(text: string): DictionarySense[] {
  return text
    .replace(/\s(\d{1,2}\.\s)/g, '\n$1')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({ text: line }));
}

/**
 * WordNet's asset shape — see `scripts/build-wordnet.ts`.
 *
 * The file also carries `source` / `license` / `attribution` keys, which are read by nobody here on purpose: they
 * are the notice CC BY asks to travel WITH the work, for whoever holds the file. What Orbis shows a reader is the
 * static `credit` on the source above, which is legible before the file has been downloaded at all.
 */
interface WordNetAsset {
  entries?: Record<string, { pos?: string; def?: string; ex?: string[] }[]>;
}

/**
 * Read an asset into the lookup map, whichever of the two shapes it is in.
 *
 * **Detected from the file, not declared beside the URL.** The two shapes are structurally distinct — a bare map
 * of word to prose, or an object with an `entries` map of word to senses — so asking the file is one fact where
 * a `shape` field on the source would have been a second one to keep in step with it.
 *
 * **A `Map`, and that is not a style preference.** `constructor` is an English word and both books have it. Read
 * into a plain object, `entries[word]` finds the inherited `Object` constructor — a truthy function — and the
 * panel draws it as a definition.
 */
function parseAsset(raw: string): Map<string, DictionarySense[]> {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const entries = new Map<string, DictionarySense[]>();
  const nested = (parsed as WordNetAsset).entries;
  if (nested && typeof nested === 'object') {
    for (const [word, senses] of Object.entries(nested)) {
      const usable = (senses ?? [])
        .filter((s) => s?.def)
        .map((s) => ({ pos: s.pos, text: s.def as string, examples: s.ex?.length ? s.ex : undefined }));
      if (usable.length) entries.set(word, usable);
    }
    return entries;
  }
  for (const [word, text] of Object.entries(parsed)) {
    if (typeof text === 'string' && text.trim()) entries.set(word, websterSenses(text));
  }
  return entries;
}

/**
 * One offline dictionary: downloads its JSON asset to the plugin's cache dir (once), lazily loads it into memory,
 * and resolves a selected word to its senses (trying the inflection variants above). Plugin-level and shared
 * across books. Mirrors PiperEngine's download-and-cache shape.
 *
 * **Downloaded is in use.** There is no toggle beside the download button: a book on the disk is a book the panel
 * offers, and removing it is how you stop being offered it. Two controls for one question would only let them
 * disagree.
 */
export class DictionaryService {
  private entries: Map<string, DictionarySense[]> | null = null;
  private loading: Promise<void> | null = null;

  constructor(
    private readonly adapter: DataAdapter,
    private readonly dir: string,
    readonly source: DictionarySource
  ) {}

  private get path(): string {
    return `${this.dir}/${this.source.file}`;
  }

  isDownloaded(): Promise<boolean> {
    return this.adapter.exists(this.path);
  }

  async sizeBytes(): Promise<number> {
    return (await this.adapter.stat(this.path))?.size ?? 0;
  }

  /** Download this dictionary's asset and cache it. Throws on a failed response, or on bytes that are not the file
   *  `sha256` names — an auth page, a truncated transfer, a host serving something else — and writes nothing, so a
   *  bad download is never cached as a dictionary. */
  async download(): Promise<void> {
    const res = await requestUrl({ url: this.source.url });
    const buf = res.arrayBuffer;
    if (res.status !== 200) throw new Error(`unexpected dictionary response (status ${res.status})`);
    if ((await sha256Hex(buf)) !== this.source.sha256) throw new WrongFileError(this.source.file);
    if (!(await this.adapter.exists(this.dir))) await this.adapter.mkdir(this.dir);
    await this.adapter.writeBinary(this.path, buf);
    this.entries = null; // reload from the fresh file on the next lookup
  }

  async remove(): Promise<void> {
    if (await this.adapter.exists(this.path)) await this.adapter.remove(this.path);
    this.entries = null;
  }

  private async ensureLoaded(): Promise<boolean> {
    if (this.entries) return true;
    if (!(await this.isDownloaded())) return false;
    if (!this.loading) {
      this.loading = (async () => {
        this.entries = parseAsset(await this.adapter.read(this.path));
      })().finally(() => {
        this.loading = null;
      });
    }
    await this.loading;
    return this.entries != null;
  }

  /** Senses for `word` (trying inflection variants), or null if this dictionary isn't downloaded or has no
   *  matching entry. */
  async define(word: string): Promise<DictionarySense[] | null> {
    if (!(await this.ensureLoaded()) || !this.entries) return null;
    for (const candidate of lookupCandidates(word)) {
      const senses = this.entries.get(candidate);
      if (senses?.length) return senses;
    }
    return null;
  }
}

/** What one dictionary had to say about a word — a tab in the Look-up panel. */
export interface DictionaryResult {
  service: DictionaryService;
  senses: DictionarySense[];
}

/**
 * Both dictionaries, as one thing to hold.
 *
 * **Two, because they fail in opposite directions.** Webster's 1913 is the right book for the nineteenth-century
 * texts that fill a Gutenberg library and has never heard of a smartphone; WordNet is modern, terse, and carries
 * no etymology and no archaic senses. Which one answers a word is not a preference to set once — it is a property
 * of the word — so both can be present and the panel offers whichever of them actually has an entry.
 */
export class Dictionaries {
  readonly all: readonly DictionaryService[];

  constructor(adapter: DataAdapter, dir: string) {
    this.all = DICTIONARY_SOURCES.map((source) => new DictionaryService(adapter, dir, source));
  }

  get(id: DictionarySource['id']): DictionaryService {
    const found = this.all.find((d) => d.source.id === id);
    if (!found) throw new Error(`no dictionary ${id}`);
    return found;
  }

  /** Does the reader have any dictionary at all? The question the Look-up panel and first-run setup ask. */
  async anyDownloaded(): Promise<boolean> {
    for (const d of this.all) if (await d.isDownloaded()) return true;
    return false;
  }

  /** The books actually on this device — which is what "no entry" has to be said in terms of. */
  async downloaded(): Promise<DictionaryService[]> {
    const out: DictionaryService[] = [];
    for (const d of this.all) if (await d.isDownloaded()) out.push(d);
    return out;
  }

  /**
   * Every downloaded dictionary that has something to say about `word`, in `DICTIONARY_SOURCES` order.
   *
   * **Only the ones with an entry.** A tab that opens onto "no entry" is a tab that wasted the tap; a word the
   * other book knows and this one doesn't is the ordinary case, not an error to report.
   */
  async define(word: string): Promise<DictionaryResult[]> {
    const out: DictionaryResult[] = [];
    const words = wordCount(word);
    for (const service of this.all) {
      // Asked before the book is opened, because opening it means parsing 21 MB. A term with more words than the
      // longest headword cannot match, and that is knowable from the source rather than from the file.
      if (words > service.source.maxWords) continue;
      let senses: DictionarySense[] | null;
      try {
        senses = await service.define(word);
      } catch {
        senses = null;
      }
      if (senses?.length) out.push({ service, senses });
    }
    return out;
  }
}
