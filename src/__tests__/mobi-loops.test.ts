// Three loops in foliate's MOBI/AZW3 reader that never ended on a damaged or crafted file (ORBIS patch 24).
// Each is fed a crafted record in a worker that is stopped after a few seconds, so a loop that
// came back fails the test rather than hanging the run.

import { describe, expect, it } from 'vitest';

declare const process: {
  getBuiltinModule(id: 'node:worker_threads'): {
    Worker: new (
      code: string,
      options: { eval: true; workerData: unknown }
    ) => { on(event: string, fn: (value: unknown) => void): void; terminate(): Promise<number> };
  };
  getBuiltinModule(id: 'node:url'): { pathToFileURL(path: string): { href: string } };
  getBuiltinModule(id: 'node:path'): { resolve(...paths: string[]): string };
  cwd(): string;
};

const MOBI_URL = process
  .getBuiltinModule('node:url')
  .pathToFileURL(process.getBuiltinModule('node:path').resolve(process.cwd(), 'node_modules/foliate-js/mobi.js')).href;

/** In the worker: read the crafted records with `getIndexData` or `huffcdic`, and report the result or the error. */
const WORKER = `
const { parentPort, workerData } = require('node:worker_threads');
(async () => {
  const mobi = await import(workerData.url);
  const load = async (i) => workerData.records[i];
  try {
    if (workerData.kind === 'exth') {
      parentPort.postMessage({ result: mobi.getEXTH(workerData.records[0], 65001) });
    } else if (workerData.kind === 'index') {
      const { table } = await mobi.getIndexData(0, load);
      parentPort.postMessage({ result: table });
    } else {
      const decompress = await mobi.huffcdic({ huffcdic: 0, numHuffcdic: workerData.records.length }, load);
      parentPort.postMessage({ result: Array.from(decompress(new Uint8Array(4))) });
    }
  } catch (e) {
    parentPort.postMessage({ error: String(e && e.message) });
  }
})();`;

type Outcome = { result?: unknown; error?: string; stillRunning?: true };

function read(kind: 'exth' | 'index' | 'huff', records: ArrayBuffer[]): Promise<Outcome> {
  const { Worker } = process.getBuiltinModule('node:worker_threads');
  const worker = new Worker(WORKER, { eval: true, workerData: { url: MOBI_URL, kind, records } });
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      void worker.terminate();
      resolve({ stillRunning: true });
      // Generous, because a finite parse under a full parallel run on a slow CI runner can take seconds; a loop that
      // never ends still runs into it.
    }, 10_000);
    worker.on('message', (m) => {
      clearTimeout(timer);
      void worker.terminate();
      resolve(m as Outcome);
    });
    worker.on('error', (e) => {
      clearTimeout(timer);
      resolve({ error: String(e) });
    });
  });
}

/** Big-endian fields as bytes: a string as ASCII, a number as a uint32, an array as the bytes it lists. */
function raw(...fields: (string | number | number[])[]): number[] {
  const out: number[] = [];
  for (const f of fields) {
    if (typeof f === 'string') for (const c of f) out.push(c.charCodeAt(0));
    else if (typeof f === 'number') out.push((f >>> 24) & 255, (f >>> 16) & 255, (f >>> 8) & 255, f & 255);
    else for (const b of f) out.push(b);
  }
  return out;
}
const record = (...fields: (string | number | number[])[]): ArrayBuffer => new Uint8Array(raw(...fields)).buffer;
const u16 = (n: number) => [(n >>> 8) & 255, n & 255];

/** The 56-byte INDX header: its own length, where its IDXT is, how many records or entries, UTF-8. */
const indxHeader = (idxt: number, numRecords: number) =>
  raw('INDX', 56, 0, 0, 0, idxt, numRecords, 65001, 0, 0, 0, 0, 0, 0);

/**
 * An index of one entry, "A": the main INDX record with its TAGX tag table (`tags`, each [tag, values, mask, end]),
 * then one INDX record holding the entry — its control byte, then `values`.
 */
function index(tags: number[][], tagxLength: number, control: number, values: number[]): ArrayBuffer[] {
  const main = record(indxHeader(0, 1), 'TAGX', tagxLength, 1, tags.flat());
  // The entry lies after the header and a 6-byte IDXT, which holds its offset.
  const entries = record(indxHeader(56, 1), 'IDXT', u16(56 + 6), [1, 'A'.charCodeAt(0), control, ...values]);
  return [main, entries];
}

describe('foliate MOBI reader (ORBIS patch 24)', { timeout: 15_000 }, () => {
  it('reads a tag table whose length runs past its record, as far as the record goes', async () => {
    const records = index(
      [
        [1, 1, 0x01, 0],
        [0, 0, 0, 1],
      ],
      12 + 4 * 2 + 4 * 100,
      0x01,
      [0x81]
    );
    expect(await read('index', records)).toEqual({ result: [{ name: 'A', tagMap: { 1: [1] } }] });
  });

  it('stops reading an entry’s values at the end of its record', async () => {
    const records = index(
      [
        [1, 1, 0x03, 0],
        [0, 0, 0, 1],
      ],
      12 + 4 * 2,
      0x03,
      [0x85]
    );
    expect(await read('index', records)).toEqual({ result: [{ name: 'A', tagMap: { 1: [] } }] });
  });

  it('refuses a HUFF table whose code has no bits', async () => {
    const offset1 = 24;
    const offset2 = offset1 + 256 * 4;
    // Every first byte maps to a "found" code of length 0 and value 0, and the dictionary's one entry is "A".
    const huff = record(
      'HUFF',
      0,
      offset1,
      offset2,
      0,
      0,
      Array(256).fill([0, 0, 0, 0x80]).flat(),
      Array(32 * 8).fill(0)
    );
    const cdic = record('CDIC', 16, 1, 1, u16(2), u16(0x8001), [0x41]);
    expect(await read('huff', [huff, cdic])).toEqual({ error: 'Invalid HUFF code length' });
  });
});

describe('foliate MOBI reader (ORBIS patch 29)', { timeout: 15_000 }, () => {
  it('stops at an EXTH record shorter than its own header, whatever count the header claims', async () => {
    // EXTH, its length, a count of four million, then one record of type 100 and length 0.
    const exth = record('EXTH', 20, 4_000_000, 100, 0);
    expect(await read('exth', [exth])).toEqual({ result: {} });
  });

  it('reads an entry’s fixed-count values only as far as its record goes', async () => {
    // A mask of 0xff over a control byte of 0xfe: 254 values of 255 each, from a record that holds three.
    const records = index(
      [
        [1, 255, 0xff, 0],
        [0, 0, 0, 1],
      ],
      12 + 4 * 2,
      0xfe,
      [0x81, 0x82, 0x83]
    );
    expect(await read('index', records)).toEqual({ result: [{ name: 'A', tagMap: { 1: [1, 2, 3] } }] });
  });

  /**
   * One INDX record of `n` entries, every offset pointing at the same entry "A": its control byte, then `filler`
   * bytes of one-byte values. `tags` is the main record's tag table.
   */
  function crowdedIndex(tags: number[][], n: number, control: number, filler: number): ArrayBuffer[] {
    const main = record(indxHeader(0, 1), 'TAGX', 12 + 4 * tags.length, 1, tags.flat());
    const entryAt = 56 + 4 + 2 * n;
    const offsets = Array.from({ length: n }, () => u16(entryAt)).flat();
    const entries = record(
      indxHeader(56, n),
      'IDXT',
      offsets,
      [1, 'A'.charCodeAt(0), control],
      Array(filler).fill(0x81)
    );
    return [main, entries];
  }

  type Entry = { name: string; tagMap: Record<string, number[]> };

  it('reads each value of an index record once, however many entries point at it', async () => {
    // 254 × 255 values per entry, sixteen thousand entries at one offset: every one read the record to its end.
    const records = crowdedIndex(
      [
        [1, 255, 0xff, 0],
        [0, 0, 0, 1],
      ],
      16_000,
      0xfe,
      32_000
    );
    const outcome = await read('index', records);
    const table = outcome.result as Entry[] | undefined;
    expect(table?.length).toBe(16_000);
    const values = (table ?? []).reduce((sum, e) => sum + (e.tagMap[1]?.length ?? 0), 0);
    expect(values).toBeLessThanOrEqual(records[1].byteLength);
  });

  it('reads no longer a tag table than tags can fill', async () => {
    // Fifty thousand tags, each read for each of four thousand entries.
    const tags = [...Array.from({ length: 50_000 }, () => [1, 1, 0x01, 0]), [0, 0, 0, 1]];
    const outcome = await read('index', crowdedIndex(tags, 4_000, 0x01, 0));
    expect((outcome.result as Entry[] | undefined)?.length).toBe(4_000);
  });
});
