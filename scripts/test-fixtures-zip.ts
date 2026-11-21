// Pack the test plans' files for the plugin's *Download test fixtures (dev)* command, and keep the plugin's pin of them.
//
// Usage:
//   pnpm pin:fixtures                               after adding or changing a fixture: update the pin
//   pnpm exec tsx scripts/test-fixtures-zip.ts out  write the pinned zip into `out`, and fail if it is not the pinned one
//
// **One zip per state of the fixtures.** Every file git tracks under `test-vault/fixtures`, at its path below that
// folder, sorted, and every entry dated midnight on 1980-01-01 wherever it runs: the same fixtures pack the same bytes,
// so the digest names them. The zip is written as `orbis-test-fixtures-<first twelve hex digits>.zip`, the name the
// plugin downloads (`src/test-fixtures-pin.ts`).
//
// **The pin comes from the plugin, not from the workflow**, as the dictionaries' does (`dictionary-pins.ts`). The test
// fixtures workflow runs this without `--pin`, so a zip that is not the one main's plugin asks for is never uploaded.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TEST_FIXTURES_SHA256, testFixturesFile } from '../src/test-fixtures-pin';
import { packTestFixtures } from './release-lib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = 'test-vault/fixtures';
const PIN_FILE = path.join(ROOT, 'src/test-fixtures-pin.ts');

const tracked = execFileSync('git', ['ls-files', '-z', '--', FIXTURES], { cwd: ROOT, encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);
const files: Record<string, Uint8Array> = {};
for (const file of tracked) files[file.slice(FIXTURES.length + 1)] = readFileSync(path.join(ROOT, file));
const zip = packTestFixtures(files);
const sha256 = createHash('sha256').update(zip).digest('hex');

const [arg] = process.argv.slice(2);
if (arg === '--pin') {
  if (sha256 === TEST_FIXTURES_SHA256) {
    console.log(`The pin is already ${sha256} (${tracked.length} fixtures). Nothing changed.`);
  } else {
    const source = readFileSync(PIN_FILE, 'utf8');
    const next = source.replace(/TEST_FIXTURES_SHA256 = '[0-9a-f]{64}'/, `TEST_FIXTURES_SHA256 = '${sha256}'`);
    if (next === source) throw new Error(`No TEST_FIXTURES_SHA256 line to update in ${PIN_FILE}`);
    writeFileSync(PIN_FILE, next);
    console.log(
      `Pinned ${sha256} (${tracked.length} fixtures), was ${TEST_FIXTURES_SHA256}. Commit src/test-fixtures-pin.ts.`
    );
  }
} else if (arg) {
  if (sha256 !== TEST_FIXTURES_SHA256) {
    console.error(
      `The fixtures pack to ${sha256}, but the plugin pins ${TEST_FIXTURES_SHA256}. Run pnpm pin:fixtures.`
    );
    process.exit(1);
  }
  const out = path.resolve(arg);
  mkdirSync(out, { recursive: true });
  writeFileSync(path.join(out, testFixturesFile(sha256)), zip);
  console.log(`${sha256}  ${testFixturesFile(sha256)}`);
} else {
  console.error('Usage: tsx scripts/test-fixtures-zip.ts --pin | <folder>');
  process.exit(2);
}
