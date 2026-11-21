// The pin in `test-fixtures-pin.ts` is the digest of the fixtures as they are.
//
// **Why this is in the gate.** *Download test fixtures (dev)* downloads the zip the pin names and refuses any other,
// and the test fixtures workflow uploads only the zip the pin names. A fixture added or changed without
// `pnpm pin:fixtures` would leave the build asking for fixtures that are no longer the ones it was made with.

import { describe, expect, it } from 'vitest';
import { packTestFixtures } from '../../scripts/release-lib';
import { TEST_FIXTURES_SHA256 } from '../test-fixtures-pin';

/** Not `import … from 'node:…'`: the plugin's tsconfig has no Node types (see `dialog-contract.test.ts`). */
declare const process: {
  getBuiltinModule(id: 'node:child_process'): {
    execFileSync(cmd: string, args: string[], opts: { encoding: 'utf8' }): string;
  };
  getBuiltinModule(id: 'node:fs'): { readFileSync(p: string): Uint8Array };
  getBuiltinModule(id: 'node:crypto'): {
    createHash(alg: 'sha256'): { update(b: Uint8Array): { digest(enc: 'hex'): string } };
  };
};

const FIXTURES = 'test-vault/fixtures';

describe('test fixtures pin', () => {
  it('is the digest of the fixtures git tracks (run pnpm pin:fixtures after changing one)', () => {
    const tracked = process
      .getBuiltinModule('node:child_process')
      .execFileSync('git', ['ls-files', '-z', '--', FIXTURES], { encoding: 'utf8' })
      .split('\0')
      .filter(Boolean);
    expect(tracked.length).toBeGreaterThan(0);
    const fs = process.getBuiltinModule('node:fs');
    const files: Record<string, Uint8Array> = {};
    for (const file of tracked) files[file.slice(FIXTURES.length + 1)] = fs.readFileSync(file);
    const digest = process
      .getBuiltinModule('node:crypto')
      .createHash('sha256')
      .update(packTestFixtures(files))
      .digest('hex');
    expect(digest).toBe(TEST_FIXTURES_SHA256);
  });
});
