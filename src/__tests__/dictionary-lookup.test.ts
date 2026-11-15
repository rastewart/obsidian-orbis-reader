import type { DataAdapter } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';

const requestUrl = vi.hoisted(() => vi.fn());
vi.mock('obsidian', async (original) => ({ ...(await original<Record<string, unknown>>()), requestUrl }));

import {
  Dictionaries,
  DictionaryService,
  lookupCandidates,
  maxDictionaryWords,
  wordCount,
} from '../reader/lookup/DictionaryService';
import { WEBSTER, WORDNET } from '../reader/lookup/dictionary-sources';
import { sha256Hex, WrongFileError } from '../reader/tts/asset-integrity';

describe('lookupCandidates', () => {
  it('lowercases, trims, and strips surrounding punctuation', () => {
    expect(lookupCandidates('  “Book,” ')[0]).toBe('book');
    expect(lookupCandidates('Grace')[0]).toBe('grace');
  });

  it('returns the exact word first', () => {
    expect(lookupCandidates('run')[0]).toBe('run');
  });

  it('covers plurals (-s, -es, -ies)', () => {
    expect(lookupCandidates('books')).toContain('book');
    expect(lookupCandidates('boxes')).toContain('box');
    expect(lookupCandidates('mercies')).toContain('mercy');
  });

  it('covers -ing forms, including drop-e and doubled-consonant stems', () => {
    expect(lookupCandidates('reading')).toContain('read');
    expect(lookupCandidates('making')).toContain('make');
    expect(lookupCandidates('running')).toContain('run');
  });

  it('covers -ed forms, including drop-e and doubled-consonant stems', () => {
    expect(lookupCandidates('walked')).toContain('walk');
    expect(lookupCandidates('loved')).toContain('love');
    expect(lookupCandidates('stopped')).toContain('stop');
  });

  it('covers -ly adverbs', () => {
    expect(lookupCandidates('sadly')).toContain('sad');
  });

  it('returns nothing for empty / non-alpha input', () => {
    expect(lookupCandidates('   ')).toEqual([]);
    expect(lookupCandidates('123')).toEqual([]);
  });

  it('does not emit 1-character stems', () => {
    // "as" → "a" would be a useless 1-char stem; guard against it.
    expect(lookupCandidates('as')).not.toContain('a');
  });
});

/**
 * Just enough adapter to hold two files. `DictionaryService` reads through `DataAdapter`, so the parse and the
 * lookup can be exercised end to end without a vault or a download.
 */
function fakeAdapter(files: Record<string, string>): DataAdapter {
  return {
    exists: (path: string) => Promise.resolve(path === 'dict' || path in files),
    read: (path: string) => Promise.resolve(files[path]),
    stat: (path: string) => Promise.resolve({ size: files[path]?.length ?? 0 }),
  } as unknown as DataAdapter;
}

const websterAsset = JSON.stringify({
  grace: 'Favor. 1. The exercise of love. 2. A short prayer.',
  constructor: 'One who constructs.',
});

// The license keys sit beside `entries` in the real asset. They are notice for whoever holds the FILE, and the
// parser must not read them as headwords — hence a fixture that carries them.
const wordnetAsset = JSON.stringify({
  source: 'Open English WordNet 2025',
  license: 'CC BY 4.0',
  attribution: 'Open English WordNet, CC BY 4.0.',
  entries: {
    grace: [{ pos: 'noun', def: 'elegance of movement', ex: ['she moved with grace'] }],
    'point of view': [{ pos: 'noun', def: 'a mental position from which things are viewed' }],
    'red herring': [{ pos: 'noun', def: 'any diversion intended to distract attention' }],
    constructor: [{ pos: 'noun', def: 'someone who builds things' }],
    empty: [{ pos: 'noun' }],
  },
});

const sparseAsset = JSON.stringify({ entries: { grace: [{ pos: 'noun', def: 'elegance of movement' }] } });

describe('Dictionaries', () => {
  const both = (): Dictionaries =>
    new Dictionaries(
      fakeAdapter({ [`dict/${WEBSTER.file}`]: websterAsset, [`dict/${WORDNET.file}`]: wordnetAsset }),
      'dict'
    );

  it("splits Webster's inline sense numbers into separate senses", async () => {
    const hit = await both().get('webster').define('grace');
    expect(hit?.map((s) => s.text)).toEqual(['Favor.', '1. The exercise of love.', '2. A short prayer.']);
    expect(hit?.[0].pos).toBeUndefined();
  });

  it("keeps WordNet's part of speech and examples", async () => {
    const hit = await both().get('wordnet').define('grace');
    expect(hit).toEqual([{ pos: 'noun', text: 'elegance of movement', examples: ['she moved with grace'] }]);
  });

  it('defines "constructor" rather than returning Object\'s own', async () => {
    // The prototype trap: read into a plain object, `entries.constructor` is a truthy function and the panel
    // draws it as a definition. Both books have the word, so both would have shown it.
    for (const hit of await both().define('constructor')) {
      expect(typeof hit.senses[0].text).toBe('string');
      expect(hit.senses[0].text).toMatch(/builds|constructs/);
    }
  });

  it('returns nothing for a word the book lacks, even when Object has it', async () => {
    // The prototype trap the other way round: a book WITHOUT "constructor" must not answer with `Object` itself —
    // a truthy function, so the lookup would return it and the panel would try to draw it.
    const sparse = new Dictionaries(fakeAdapter({ [`dict/${WORDNET.file}`]: sparseAsset }), 'dict');
    expect(await sparse.get('wordnet').define('constructor')).toBeNull();
    expect(await sparse.define('constructor')).toEqual([]);
  });

  it("does not treat the asset's licence keys as headwords", async () => {
    expect(await both().get('wordnet').define('license')).toBeNull();
    expect(await both().get('wordnet').define('attribution')).toBeNull();
  });

  it('offers only the books that have an entry', async () => {
    const only = new Dictionaries(fakeAdapter({ [`dict/${WORDNET.file}`]: wordnetAsset }), 'dict');
    expect((await only.define('grace')).map((h) => h.service.source.id)).toEqual(['wordnet']);
    expect(await only.define('nowhere')).toEqual([]);
    expect(await only.anyDownloaded()).toBe(true);
  });

  it('drops senses with no definition, and headwords left with none', async () => {
    expect(await both().get('wordnet').define('empty')).toBeNull();
  });

  it('reports nothing downloaded when neither asset is on disk', async () => {
    const none = new Dictionaries(fakeAdapter({}), 'dict');
    expect(await none.anyDownloaded()).toBe(false);
    expect(await none.define('grace')).toEqual([]);
  });
});

describe('multi-word headwords', () => {
  const both = (): Dictionaries =>
    new Dictionaries(
      fakeAdapter({ [`dict/${WEBSTER.file}`]: websterAsset, [`dict/${WORDNET.file}`]: wordnetAsset }),
      'dict'
    );

  it('finds a phrase that is a headword', async () => {
    // 41.5% of WordNet's headwords have a space in them. A lookup that stopped at the first space hid all of them.
    const hits = await both().define('point of view');
    expect(hits.map((h) => h.service.source.id)).toEqual(['wordnet']);
    expect(hits[0].senses[0].text).toContain('mental position');
  });

  it('stems the end of a phrase, which is where English usually inflects one', async () => {
    expect((await both().define('red herrings'))[0].senses[0].text).toContain('diversion');
  });

  it('does not stem inside a phrase — a known limit, asserted so it is a decision', () => {
    // `lookupCandidates` works on the end of the term, so "points of view" cannot reach "point of view": the
    // plural is on the first word. Compounds that inflect at the end — "red herrings", "hot dogs", "sea changes"
    // — are the common shape and do resolve. Widening this means stemming each word in turn, which is a lot of
    // candidate strings for the "X of Y" minority.
    expect(lookupCandidates('points of view')).toEqual(['points of view']);
  });

  it('does not open a book whose longest headword is shorter than the term', async () => {
    // The point is what does NOT happen: Webster's is never read, so its 21 MB is never parsed to answer a
    // selection that cannot be one of its entries.
    let read = 0;
    const adapter = fakeAdapter({ [`dict/${WEBSTER.file}`]: websterAsset });
    const counting = { ...adapter, read: (p: string) => (read++, adapter.read(p)) };
    const dicts = new Dictionaries(counting, 'dict');
    expect(await dicts.define('a b c d e f')).toEqual([]); // 6 words, Webster's bound is 5
    expect(read).toBe(0);
    await dicts.define('grace');
    expect(read).toBe(1);
  });

  it("counts words and reports the longest book's bound", () => {
    expect(wordCount('point of view')).toBe(3);
    expect(wordCount('grace')).toBe(1);
    expect(maxDictionaryWords()).toBe(WORDNET.maxWords);
    expect(WORDNET.maxWords).toBeGreaterThan(WEBSTER.maxWords);
  });
});

/**
 * A download is kept only if it hashes to the digest pinned on its source. What it guards is the step between the host
 * and the disk: a login page, a truncated transfer, a host serving another file.
 */
describe('downloading a dictionary', () => {
  const body = new TextEncoder().encode('{"grace":"Favor."}').buffer;
  const writable = () => {
    const written: string[] = [];
    const adapter = {
      exists: () => Promise.resolve(true),
      mkdir: () => Promise.resolve(),
      writeBinary: (path: string) => {
        written.push(path);
        return Promise.resolve();
      },
    } as unknown as DataAdapter;
    return { adapter, written };
  };

  it('keeps a file that hashes to its pinned digest', async () => {
    requestUrl.mockReset().mockResolvedValue({ status: 200, arrayBuffer: body });
    const { adapter, written } = writable();
    const source = { ...WEBSTER, sha256: await sha256Hex(body) };
    await new DictionaryService(adapter, 'dict', source).download();
    expect(written).toEqual([`dict/${WEBSTER.file}`]);
  });

  it('refuses any other bytes, and writes nothing', async () => {
    requestUrl.mockReset().mockResolvedValue({ status: 200, arrayBuffer: body });
    const { adapter, written } = writable();
    await expect(new DictionaryService(adapter, 'dict', WEBSTER).download()).rejects.toBeInstanceOf(WrongFileError);
    expect(written).toEqual([]);
  });

  it('pins a digest on every dictionary it offers', () => {
    for (const source of [WEBSTER, WORDNET]) expect(source.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});
