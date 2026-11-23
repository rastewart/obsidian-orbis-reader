// Books that check Orbis themselves, and books that cannot be read.
//
// `hostile-scripts.epub` tries to run code in every way a book can, and each of its checks reads PASS while none has
// run. The stylesheet books say in their own text whether their CSS arrived. Desktop is protected twice over, so a
// pass here proves least for the book that tries to run code; iPhone, iPad and Android are where it matters, and the
// device run still covers them. What this guards is a change that breaks it everywhere.

import { copyVaultFile, openBook, openBroken, sectionTexts } from '../in-page';
import { dismissDialogs, type E2eTest, expect, type TestContext } from '../runner';

function selfCheckTest(path: string): E2eTest {
  return {
    name: `${path.split('/').pop()} reports every check as passed`,
    async run({ page }) {
      await page.run(openBook, path, 30_000);
      await dismissDialogs(page);
      const lines = (await page.run(sectionTexts, 40))
        .join('\n')
        .split('\n')
        .map((line) => line.trim());
      // A check is a line that begins with its verdict. The books' instructions mention FAIL in passing.
      const passes = lines.filter((line) => /^PASS\b/.test(line)).length;
      const fails = lines.filter((line) => /^FAIL\b/.test(line));
      expect(passes > 0, `${path} reported no checks at all`);
      expect(!fails.length, `${path} reported ${fails.length} failed check(s)\n  ${fails.join('\n  ')}`);
    },
  };
}

/**
 * A file that cannot be read says so in its tab. Orbis logs why as an error, which is expected here. `make` writes the
 * file first, for one that is not a fixture.
 */
function brokenBookTest(
  path: string,
  what: string,
  logged: string,
  goldenName: string,
  make?: (page: TestContext['page']) => Promise<void>
): E2eTest {
  return {
    name: `${what} says it cannot be opened`,
    allowErrors: [logged],
    async run({ page, golden }) {
      await make?.(page);
      const said = await page.run(openBroken, path, 15_000);
      await dismissDialogs(page);
      expect(!!said, `${path} left its tab empty`);
      golden(goldenName, `${said}\n`);
    },
  };
}

export const checkTests: E2eTest[] = [
  selfCheckTest('fixtures/hostile-scripts.epub'),
  selfCheckTest('fixtures/stylesheet-checks.epub'),
  selfCheckTest('fixtures/stylesheet-hazards.epub'),
  brokenBookTest('fixtures/resilience/empty.epub', 'an empty file', 'NotFoundError', 'open-empty-file.txt'),
  brokenBookTest(
    'fixtures/resilience/not-a-book.epub',
    'a file that is not a book',
    'UnsupportedTypeError',
    'open-not-a-book.txt'
  ),
  // A download that stopped part-way: the start of a real EPUB, cut off.
  brokenBookTest(
    'fixtures/resilience/cut-off.epub',
    'a cut-off EPUB',
    'DamagedBookError',
    'open-cut-off.txt',
    async (page) => {
      await page.run(copyVaultFile, 'fixtures/resilience/First-Open.epub', 'fixtures/resilience/cut-off.epub', 10_000);
    }
  ),
];
