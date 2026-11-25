// What's new: the notice an update shows, and the dialog its link opens.
//
// The notice comes from the developer command, which shows it as an update would without changing the version this
// device last saw. The button in settings is not tested here: on desktop, Settings opens in a window of its own,
// which this harness does not drive. `guide.test.ts` checks the button.

import { noticeWith, pressInWhatsNew, runCommand, whatsNewDialog } from '../in-page';
import { dismissDialogs, type E2eTest, expect } from '../runner';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const whatsNewTests: E2eTest[] = [
  {
    name: "the update notice opens What's new, which pages through the releases at one size and leaves out Maintenance",
    async run({ page }) {
      await page.run(runCommand, 'orbis-reader:orbis-toggle-developer-options');
      try {
        expect(await page.run(runCommand, 'orbis-reader:orbis-show-whats-new-notice'), 'the dev command did not run');
        await sleep(300);
        const notice = await page.run(noticeWith, 'Orbis Reader was updated', true);
        expect(notice?.includes("See what's new") ?? false, `the notice reads "${notice}"`);
        await sleep(500);
        const first = await page.run(whatsNewDialog);
        expect(first !== null, "the notice's link did not open What's new");
        expect(first.versions.length === 1, `the first page shows ${first.versions.join(', ')}`);
        expect(/\d{4}/.test(first.dates[0]), `the first release is dated "${first.dates[0]}"`);
        expect(!first.newer && first.older, 'Newer should be off and Older on, on the first page');
        expect(first.switchOn, 'the switch for the notice should be on by default');
        expect(
          first.focused === 'Close',
          `the dialog opened with the keyboard on ${first.focused ?? 'something not a button'}`
        );

        // Every page, oldest last: no Maintenance heading anywhere, and 0.1.4, which only had Maintenance, is left out.
        const seen = [...first.versions];
        let state = first;
        for (let i = 0; i < 30 && state.older; i++) {
          expect(!state.text.includes('Maintenance'), `${state.versions[0]} shows its Maintenance lines`);
          await page.run(pressInWhatsNew, 'Older');
          await sleep(200);
          const next = await page.run(whatsNewDialog);
          expect(next !== null, 'the dialog closed while paging');
          expect(
            next.height === first.height && next.buttonsTop === first.buttonsTop,
            `${next.versions[0]} moved the dialog: ${next.height}px tall with its buttons at ${next.buttonsTop}, ` +
              `against ${first.height} and ${first.buttonsTop} on the first page`
          );
          state = next;
          seen.push(...state.versions);
        }
        expect(seen.at(-1) === '0.1.0', `the last page is ${seen.at(-1)}, not 0.1.0`);
        expect(!seen.includes('0.1.4'), '0.1.4 only had Maintenance, and should be left out');
        expect(state.newer && !state.older, 'Newer should be on and Older off, on the last page');

        // The switch turns off and back on, and says so.
        await page.run(pressInWhatsNew, 'switch');
        expect(!(await page.run(whatsNewDialog))?.switchOn, 'the switch did not turn off');
        await page.run(pressInWhatsNew, 'switch');
        expect(!!(await page.run(whatsNewDialog))?.switchOn, 'the switch did not turn back on');

        await page.run(pressInWhatsNew, 'Close');
        await sleep(300);
        expect((await page.run(whatsNewDialog)) === null, 'Close did not close the dialog');
      } finally {
        await dismissDialogs(page);
        await page.run(runCommand, 'orbis-reader:orbis-toggle-developer-options');
      }
    },
  },
];
