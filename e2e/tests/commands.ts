// Every command the palette offers with a book open runs without an error.
//
// A command that opens a dialog has it closed, as a person would. A toggle runs twice, so it leaves things as it
// found them. Run last: a command can change a setting, and the other tests start from the defaults.

import { bookInFront, openBook, orbisCommands, runCommand } from '../in-page';
import { dismissDialogs, type E2eTest, expect } from '../runner';

const BOOK = 'fixtures/annotation-workhorse.epub';

/** Commands left out, and why. Each reaches past the test window, or undoes the setup the others rely on. */
const SKIP: Record<string, string> = {
  'orbis-reader:orbis-toggle-full-screen-audio-player': 'starts reading the book aloud',
  'orbis-reader:orbis-browse-book-sources': 'fetches the book sources over the network',
  'orbis-reader:orbis-download-test-fixtures': 'downloads over the network',
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const commandTests: E2eTest[] = [
  {
    name: 'every command runs without an error',
    timeoutMs: 300_000,
    async run({ page }) {
      await page.run(openBook, BOOK, 30_000);
      await dismissDialogs(page);
      const commands = await page.run(orbisCommands);
      expect(commands.length > 40, `the palette offers only ${commands.length} Orbis commands with a book open`);
      const failed: string[] = [];
      for (const command of commands) {
        if (SKIP[command.id]) continue;
        const times = /toggle/i.test(command.id) ? 2 : 1;
        for (let i = 0; i < times; i++) {
          await page.run(runCommand, command.id);
          // Long enough for what a command starts without waiting on (a save, a dialog's contents) to report.
          await sleep(500);
          await dismissDialogs(page);
        }
        const errors = page.takeErrors();
        if (errors.length) failed.push(`${command.name}: ${errors.map((e) => e.text.split('\n')[0]).join(' / ')}`);
        // A command can open another view in front of the book, and the next one is offered with the book in front.
        await page.run(bookInFront, BOOK);
      }
      expect(!failed.length, `${failed.length} command(s) reported an error\n  ${failed.join('\n  ')}`);
    },
  },
];
