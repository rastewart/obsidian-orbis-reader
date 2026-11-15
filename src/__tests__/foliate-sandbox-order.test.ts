import { describe, expect, it } from 'vitest';

/**
 * ORBIS patch 17: each foliate frame builder marks its frame `part="filter"` BEFORE setting its `sandbox`.
 *
 * The desktop sandbox patch (`src/foliate-patches.ts`) strips `allow-scripts` from a book frame, and it knows a book
 * frame by its `part` at the moment `sandbox` is set. Read from the source because the builders are custom elements
 * with closed shadow roots, which need a real browser to construct — and the order of two lines is the whole of the
 * property, so the source is where it lives.
 */
declare const process: { getBuiltinModule(id: 'node:fs'): { readFileSync(p: string, enc: 'utf8'): string } };

describe('foliate frame builders', () => {
  for (const file of ['paginator.js', 'fixed-layout.js']) {
    it(`${file} sets part="filter" before sandbox`, () => {
      const src = process.getBuiltinModule('node:fs').readFileSync(`src/vendor/foliate-js/${file}`, 'utf8');
      const part = src.search(/setAttribute\('part', 'filter'\)/);
      const sandbox = src.search(/setAttribute\('sandbox', /);
      expect(part).toBeGreaterThan(-1);
      expect(sandbox).toBeGreaterThan(-1);
      expect(part).toBeLessThan(sandbox);
    });
  }
});
