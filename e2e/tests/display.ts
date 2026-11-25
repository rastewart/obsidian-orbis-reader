// How a book looks: the palette's display commands stop where they should and the book follows them, the book's own
// alignment and sizes give way where the reader asks, text stays readable on the book's own colors in each theme,
// Focus mode comes and goes, and the keys that turn pages do, unless they are told not to.

import {
  closeBooks,
  closeDisplayBar,
  computedText,
  type DrawerShown,
  drawerRoom,
  emptyPageAtSectionEnd,
  fakeMobileNavbar,
  firstSlider,
  flipDrawerSwitch,
  focusState,
  getDisplay,
  goToSectionWith,
  layoutsPerChange,
  narrowDisplayBar,
  noticeCount,
  noticesSince,
  openBook,
  openDisplayTab,
  paginatorHas,
  pressInBook,
  pressInDrawer,
  readingPos,
  runCommand,
  setDeviceValue,
  setDisplay,
  settledPlace,
  spacingInside,
  spacingOf,
  styleOf,
  swipeIgnored,
  turnTo,
} from '../in-page';
import { dismissDialogs, type E2eTest, expect, type TestContext } from '../runner';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Runs a display command `times` times, and returns each value it stored for `key`, in turn. */
async function step({ page }: TestContext, command: string, key: string, times: number): Promise<string[]> {
  const seen: string[] = [];
  for (let i = 0; i < times; i++) {
    await page.run(runCommand, `orbis-reader:${command}`);
    seen.push((await page.run(getDisplay, key)) ?? '');
  }
  return seen;
}

/** The average font size of the shown section's paragraphs, once the book has laid itself out again. */
async function paragraphSize({ page }: TestContext): Promise<number> {
  await sleep(800);
  const sizes = (await page.run(computedText, 'p', 40)).map((p) => p.size);
  return sizes.reduce((a, b) => a + b, 0) / Math.max(1, sizes.length);
}

async function open({ page }: TestContext, path: string): Promise<void> {
  await page.run(openBook, path, 30_000);
  await dismissDialogs(page);
}

export const displayTests: E2eTest[] = [
  {
    name: 'the display commands stop at their limits, and the book follows them',
    timeoutMs: 120_000,
    async run(context) {
      const { page } = context;
      await open(context, 'fixtures/annotation-workhorse.epub');
      await page.run(goToSectionWith, 'MENDING THE NETS', 40);

      const smaller = await step(context, 'orbis-decrease-font-size', 'orbis-font-size', 5);
      expect(smaller.at(-1) === '80', `Decrease font size stopped at ${smaller.at(-1)}%, not 80%`);
      const larger = await step(context, 'orbis-increase-font-size', 'orbis-font-size', 25);
      expect(larger.at(-1) === '300', `Increase font size stopped at ${larger.at(-1)}%, not 300%`);
      expect(larger[0] === '90', `Increase font size went from 80% to ${larger[0]}%, not 90%`);

      const spaced = await step(context, 'orbis-increase-line-spacing', 'orbis-line-height', 25);
      const closed = await step(context, 'orbis-decrease-line-spacing', 'orbis-line-height', 25);
      const odd = [...spaced, ...closed].find((v) => !/^\d(\.\d)?$/.test(v));
      expect(!odd, `a line spacing step stored ${odd}, a stray decimal`);
      expect(
        spaced.at(-1) === '3' && closed.at(-1) === '1',
        `line spacing stopped at ${spaced.at(-1)} and ${closed.at(-1)}, not 3 and 1`
      );

      const dimmer = await step(context, 'orbis-decrease-brightness', 'orbis-brightness', 12);
      expect(dimmer.at(-1) === '20', `Decrease brightness stopped at ${dimmer.at(-1)}%, not 20%`);
      const brighter = await step(context, 'orbis-increase-brightness', 'orbis-brightness', 12);
      expect(brighter.at(-1) === '100', `Increase brightness stopped at ${brighter.at(-1)}%, not 100%`);

      const wider = await step(context, 'orbis-increase-text-margins', 'orbis-margins', 15);
      expect(wider.at(-1) === '12', `Increase text margins stopped at ${wider.at(-1)}%, not 12%`);
      const narrower = await step(context, 'orbis-decrease-text-margins', 'orbis-margins', 15);
      expect(narrower.at(-1) === '0', `Decrease text margins stopped at ${narrower.at(-1)}%, not 0%`);

      // Cycle text alignment names each one as it goes.
      await page.run(setDisplay, 'orbis-text-align', 'book');
      const from = await page.run(noticeCount);
      const aligned = await step(context, 'orbis-cycle-text-alignment', 'orbis-text-align', 3);
      expect(aligned.join() === 'left,justify,book', `Cycle text alignment went ${aligned.join(', ')}`);
      const said = await page.run(noticesSince, from, 'Follow the book', 3000);
      expect(
        ['Text alignment: Left', 'Text alignment: Justified', 'Text alignment: Follow the book'].every((n) =>
          said.includes(n)
        ),
        `Cycle text alignment said ${JSON.stringify(said)}`
      );

      // The book's text, at 100% and at 150%: half as large again.
      await page.run(setDisplay, 'orbis-font-size', '100');
      const at100 = await paragraphSize(context);
      await page.run(setDisplay, 'orbis-font-size', '150');
      const at150 = await paragraphSize(context);
      expect(
        Math.abs(at150 / at100 - 1.5) < 0.05,
        `at 150% the text is ${(at150 / at100).toFixed(2)} times its size at 100%`
      );
    },
  },
  {
    name: "the reader's alignment and size reach a book's own styles",
    async run(context) {
      const { page } = context;
      await open(context, 'fixtures/body-text-styles.epub');
      await page.run(goToSectionWith, 'Justified by the book', 40);
      await page.run(setDisplay, 'orbis-text-align', 'book');
      await sleep(800);
      const own = await page.run(computedText, 'p', 20);
      expect(
        own.some((p) => p.align === 'justify'),
        `the book's justified paragraphs are ${[...new Set(own.map((p) => p.align))].join(', ')}`
      );
      await page.run(setDisplay, 'orbis-text-align', 'left');
      await sleep(800);
      const left = await page.run(computedText, 'p', 20);
      expect(!left.some((p) => p.align === 'justify'), 'with Left chosen, a paragraph is still justified');

      await page.run(goToSectionWith, 'Centered and right-aligned lines', 40);
      await sleep(800);
      const lines = await page.run(computedText, 'p, div, h1, h2, h3', 60);
      expect(
        lines.some((l) => l.align === 'center'),
        'with Left chosen, the centered lines are no longer centered'
      );
      expect(
        lines.some((l) => l.align === 'right'),
        'with Left chosen, the right-aligned signature is no longer right'
      );

      // keyword-sizes.epub sets its sizes in every way CSS allows; each chapter's text grows with the font size.
      await page.run(setDisplay, 'orbis-text-align', 'book');
      await open(context, 'fixtures/keyword-sizes.epub');
      for (const chapter of [
        'Paragraphs set small',
        'Inline sizes',
        'Shorthand and important',
        'Relative sizes are left alone',
      ]) {
        await page.run(goToSectionWith, chapter, 40);
        await page.run(setDisplay, 'orbis-font-size', '100');
        const before = await paragraphSize(context);
        await page.run(setDisplay, 'orbis-font-size', '150');
        const after = await paragraphSize(context);
        expect(
          after / before > 1.3,
          `in "${chapter}", the text at 150% is ${(after / before).toFixed(2)} times its size at 100%`
        );
      }
    },
  },
  {
    name: 'character, word and paragraph spacing reach the paragraphs, and not the headings',
    async run(context) {
      const { page } = context;
      await open(context, 'fixtures/annotation-workhorse.epub');
      await page.run(goToSectionWith, 'Nobody in Marrowgate', 40);
      const keys = ['orbis-letter-spacing', 'orbis-word-spacing', 'orbis-paragraph-spacing'];
      for (const key of keys) await page.run(setDisplay, key, '0');
      await sleep(800);
      const own = await page.run(spacingOf, 'p', 10);
      const headings = await page.run(spacingOf, 'h1, h2, h3', 5);
      expect(own.length > 2, `the section shows ${own.length} paragraphs to measure`);

      // WCAG 1.4.12's figures: letters 12%, words 16%, paragraphs 200% of the font size.
      await page.run(setDisplay, 'orbis-letter-spacing', '12');
      await page.run(setDisplay, 'orbis-word-spacing', '16');
      await page.run(setDisplay, 'orbis-paragraph-spacing', '200');
      await sleep(800);
      const spaced = await page.run(spacingOf, 'p', 10);
      const near = (a: number, b: number) => Math.abs(a - b) < 0.6;
      for (const p of spaced) {
        expect(near(p.letter, 0.12 * p.size), `a paragraph's letters are ${p.letter}px apart at ${p.size}px, not 12%`);
        expect(near(p.word, 0.16 * p.size), `a paragraph's words are ${p.word}px apart at ${p.size}px, not 16%`);
        expect(near(p.above, 2 * p.size), `a paragraph has ${p.above}px above it at ${p.size}px, not 200%`);
      }
      for (const inside of await page.run(spacingInside)) {
        // Code keeps its letters and words; in Arabic only the words are spaced, since its letters join.
        const kept = inside.letter === 0 && (inside.tag !== 'code' || inside.word === 0);
        expect(kept, `inside a paragraph, ${JSON.stringify(inside)} is spaced`);
      }
      const spacedHeadings = await page.run(spacingOf, 'h1, h2, h3', 5);
      expect(
        JSON.stringify(spacedHeadings) === JSON.stringify(headings),
        `the headings changed: ${JSON.stringify(headings)} became ${JSON.stringify(spacedHeadings)}`
      );

      // Back to 0, the book's own again.
      for (const key of keys) await page.run(setDisplay, key, '0');
      await sleep(800);
      const back = await page.run(spacingOf, 'p', 10);
      expect(JSON.stringify(back) === JSON.stringify(own), `at 0, the paragraphs are ${JSON.stringify(back)}`);
    },
  },
  {
    name: "bold text thickens all the book's text, and is gone when off",
    async run(context) {
      const { page } = context;
      await open(context, 'fixtures/annotation-workhorse.epub');
      await page.run(goToSectionWith, 'Nobody in Marrowgate', 40);
      const stroke = async (selector: string) =>
        (await page.run(styleOf, selector, '-webkit-text-stroke-width', 5)).map((w) => Number.parseFloat(w) || 0);
      await page.run(setDisplay, 'orbis-bold-text', 'off');
      await sleep(800);
      const off = await stroke('p');
      expect(off.length > 0 && off.every((w) => w === 0), `with Bold text off, paragraphs have outlines ${off}`);
      await page.run(setDisplay, 'orbis-bold-text', 'on');
      await sleep(800);
      for (const selector of ['p', 'h1, h2, h3']) {
        const on = await stroke(selector);
        expect(on.length > 0 && on.every((w) => w > 0), `with Bold text on, ${selector} have outlines ${on}`);
        // As wide for a heading's size as for a paragraph's.
        const sizes = (await page.run(styleOf, selector, 'font-size', 5)).map((s) => Number.parseFloat(s));
        expect(
          on.every((w, i) => Math.abs(w - 0.04 * sizes[i]) < 0.1),
          `with Bold text on, ${selector} of ${sizes} have outlines ${on}`
        );
      }
      await page.run(setDisplay, 'orbis-bold-text', 'off');
      await sleep(800);
      const again = await stroke('p');
      expect(
        again.every((w) => w === 0),
        `with Bold text off again, paragraphs have outlines ${again}`
      );
    },
  },
  {
    name: 'page turn slides in paged mode only, and the page still turns',
    async run(context) {
      const { page } = context;
      await open(context, 'fixtures/annotation-workhorse.epub');
      await page.run(goToSectionWith, 'Nobody in Marrowgate', 40);
      expect(!(await page.run(paginatorHas, 'animated')), 'with Page turn at its default, None, the page slides');
      await page.run(setDisplay, 'orbis-page-turn', 'slide');
      expect(await page.run(paginatorHas, 'animated'), 'with Page turn on Slide, foliate is not told to slide');
      const before = await page.run(readingPos);
      expect(await page.run(runCommand, 'orbis-reader:orbis-go-to-next-page'), 'Go to next page was not offered');
      await sleep(800);
      const after = await page.run(readingPos);
      expect(
        after.section > before.section || (after.section === before.section && after.pos > before.pos),
        `sliding, the next page went from ${JSON.stringify(before)} to ${JSON.stringify(after)}`
      );
      const empty = await page.run(emptyPageAtSectionEnd);
      expect(empty < 200, `sliding, the empty page at a chapter's end showed for ${empty}ms`);
      // Page turn and Two-column layout are on the Layout tab in Paged mode only, also when the mode changes while
      // the bar is closed.
      const layout = async () => {
        const { rows } = await page.run(openDisplayTab, 'structure', false);
        await page.run(closeDisplayBar);
        return rows.join(' | ');
      };
      const paged = 'Mode | Page turn | Two-column layout';
      let rows = await layout();
      expect(rows === paged, `in Paged mode, the Layout tab shows ${rows}`);
      await page.run(setDisplay, 'orbis-flow', 'scrolled');
      await sleep(800);
      rows = await layout();
      expect(rows === 'Mode', `in Scrolled mode, the Layout tab shows ${rows}`);
      expect(!(await page.run(paginatorHas, 'animated')), 'in Scrolled mode, foliate is still told to slide');
      await page.run(setDisplay, 'orbis-flow', 'paginated');
      await sleep(800);
      expect(await page.run(paginatorHas, 'animated'), 'back in Paged mode, Slide is not back');
      rows = await layout();
      expect(rows === paged, `back in Paged mode, the Layout tab shows ${rows}`);
      await page.run(setDisplay, 'orbis-page-turn', 'none');
      expect(!(await page.run(paginatorHas, 'animated')), 'with Page turn back on None, the page still slides');
    },
  },
  {
    name: "text on a book's own backgrounds stays readable in Light, Sepia and Dark",
    async run(context) {
      const { page } = context;
      await open(context, 'fixtures/contrast-checks.epub');
      for (const theme of ['dark', 'light', 'sepia', 'dark']) {
        await page.run(setDisplay, 'orbis-theme', theme);
        await sleep(1500);
        const all = await page.run(computedText, 'p, li, td, span, div', 300);
        // Row 10: white words the book sets over a dark picture stay white, in a light theme too.
        const pictured = all.find((r) => r.text.startsWith('Dusk over the north landing'));
        expect(
          pictured?.color === 'rgb(255, 255, 255)',
          `in ${theme}, the words over the picture are ${pictured?.color}`
        );
        const rows = all.filter((r) => r.contrast !== null);
        expect(rows.length > 5, `in ${theme}, too few lines could be measured: ${rows.length}`);
        const faint = rows.filter((r) => (r.contrast ?? 0) < 3);
        expect(
          !faint.length,
          `in ${theme}, ${faint.length} line(s) are below 3 : 1\n  ${faint.map((r) => `${r.contrast} : 1  ${r.text}`).join('\n  ')}`
        );
      }
    },
  },
  {
    name: "the Spacing tab's More page, and a tab that stops above the phone's toolbar",
    async run(context) {
      const { page } = context;
      await open(context, 'fixtures/annotation-workhorse.epub');
      // The rows without the page button, which is first or last depending on the layout — see `buttonAt`.
      const show = (s: { rows: string[] }) => JSON.stringify(s.rows.filter((row) => row !== 'More' && row !== 'Back'));
      /** Where the page button is in the keyboard's order, which is where it shows: first above the rows, else last. */
      const buttonAt = (s: { rows: string[] }) =>
        ['More', 'Back'].includes(s.rows[0])
          ? 'first'
          : ['More', 'Back'].includes(s.rows.at(-1) ?? '')
            ? 'last'
            : 'missing';
      const at = (s: DrawerShown) => JSON.stringify(s.toggle && [s.toggle.x, s.toggle.y]);
      const first = JSON.stringify(['Margins', 'Line spacing', 'Alignment']);
      const more = JSON.stringify(['Character spacing', 'Word spacing', 'Paragraph spacing', 'Hyphenation']);

      // A window wide enough for the bar on one line, and for a phone on its side below: the test window's pane is
      // 680px, and a bar narrowed wider than its pane is scrolled sideways to show the button.
      await page.send('Emulation.setDeviceMetricsOverride', {
        width: 1600,
        height: 900,
        deviceScaleFactor: 1,
        mobile: false,
      });
      try {
        // On one line and stacked, a phone's width: More and Back are one button, in one place, and keep the keyboard.
        // 393 is an iPhone 15 upright, where the first page stacks and the More page alone would fit on one line.
        for (const width of [null, 393, 360]) {
          const where = width ? `stacked at ${width}px` : 'on one line';
          await page.run(narrowDisplayBar, width);
          try {
            const main = await page.run(openDisplayTab, 'spacing', false);
            expect(show(main) === first, `${where}, the Spacing tab shows ${show(main)}`);
            // Stacked with room to spare, the button has a row of its own above the rows, which then have the width.
            const expected = width ? 'first' : 'last';
            expect(buttonAt(main) === expected, `${where}, More is ${buttonAt(main)}, not ${expected}`);
            const second = await page.run(pressInDrawer, 'spacing', 'More');
            expect(show(second) === more, `${where}, its More page shows ${show(second)}`);
            expect(second.focused === 'Back', `${where}, More left the keyboard on "${second.focused}", not Back`);
            expect(at(second) === at(main), `${where}, Back is at ${at(second)} and More at ${at(main)}`);
            const back = await page.run(pressInDrawer, 'spacing', 'Back');
            expect(show(back) === first, `${where}, Back shows ${show(back)}`);
            expect(back.focused === 'More', `${where}, Back left the keyboard on "${back.focused}", not More`);
          } finally {
            await page.run(narrowDisplayBar, null);
          }
        }
        // Another tab and back again opens on the first page.
        await page.run(pressInDrawer, 'spacing', 'More');
        await page.run(openDisplayTab, 'font', false);
        const again = await page.run(openDisplayTab, 'spacing', false);
        expect(show(again) === first, `chosen again, the Spacing tab shows ${show(again)}`);

        // A toolbar standing 100 pixels below the tab's top, as Obsidian's does on a phone in landscape, with the bar a
        // phone's width so its rows stack: the tab stops above the toolbar and scrolls, and More stays in view at its
        // end. Without one, the tab is as tall as its rows.
        try {
          await page.run(narrowDisplayBar, 360);
          const top = Math.round(again.top + 100);
          await page.run(fakeMobileNavbar, top);
          const covered = await page.run(openDisplayTab, 'spacing', true);
          expect(
            covered.bottom <= top + 1 && covered.scrolls,
            `with a toolbar at ${top}, the tab ends at ${covered.bottom} and ${covered.scrolls ? 'scrolls' : 'does not scroll'}`
          );
          expect(
            !!covered.toggle?.inView,
            `scrolled to its end, More is out of view: ${JSON.stringify(covered.toggle)}`
          );

          // As wide as a phone on its side, with the same room: the rows go two across, Margins beside Line spacing,
          // and fit without scrolling. More and Back are still one button in one place.
          await page.run(narrowDisplayBar, 760);
          const across = await page.run(openDisplayTab, 'spacing', false);
          expect(
            across.tops[0] === across.tops[1] && across.tops[2] > across.tops[0] && !across.scrolls,
            `on its side, the rows' tops are ${JSON.stringify(across.tops)} and the tab ${across.scrolls ? 'scrolls' : 'fits'}`
          );
          const acrossMore = await page.run(pressInDrawer, 'spacing', 'More');
          expect(at(acrossMore) === at(across), `on its side, Back is at ${at(acrossMore)} and More at ${at(across)}`);
          await page.run(pressInDrawer, 'spacing', 'Back');
          await page.run(narrowDisplayBar, 360);

          await page.run(fakeMobileNavbar, null);
          const free = await page.run(openDisplayTab, 'spacing', false);
          expect(
            !free.scrolls && free.bottom > top + 1,
            `with no toolbar, the tab ends at ${free.bottom} and ${free.scrolls ? 'scrolls' : 'does not scroll'}`
          );
        } finally {
          await page.run(fakeMobileNavbar, null);
          await page.run(narrowDisplayBar, null);
        }
      } finally {
        await page.send('Emulation.clearDeviceMetricsOverride');
      }
    },
  },
  {
    name: 'a slider on a stacked tab follows a drag',
    async run(context) {
      const { page } = context;
      await open(context, 'fixtures/annotation-workhorse.epub');
      // A drag is a press, moves and a release, as a mouse makes them. Each move changes the value, and laying the tab
      // out again on each change ended the drag after one step on a tab whose rows stack.
      const drag = async (by: number) => {
        const from = await page.run(firstSlider, 'spacing');
        const x = from.x + 8 + (from.value / from.max) * (from.width - 16);
        await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y: from.y });
        await page.send('Input.dispatchMouseEvent', {
          type: 'mousePressed',
          x,
          y: from.y,
          button: 'left',
          clickCount: 1,
        });
        for (let step = 1; step <= 10; step++) {
          const at = x + (by * step) / 10;
          await page.send('Input.dispatchMouseEvent', {
            type: 'mouseMoved',
            x: at,
            y: from.y,
            button: 'left',
            buttons: 1,
          });
          await sleep(30);
        }
        await page.send('Input.dispatchMouseEvent', {
          type: 'mouseReleased',
          x: x + by,
          y: from.y,
          button: 'left',
          clickCount: 1,
        });
        await sleep(300);
        const to = await page.run(firstSlider, 'spacing');
        const expected = Math.min(from.max, from.value + Math.round((by / (from.width - 16)) * from.max));
        return { from: from.value, to: to.value, expected };
      };
      await page.send('Emulation.setDeviceMetricsOverride', {
        width: 1600,
        height: 900,
        deviceScaleFactor: 1,
        mobile: false,
      });
      try {
        // The More page stacks on a wide pane; its first slider is Character spacing.
        await page.run(openDisplayTab, 'spacing', false);
        await page.run(pressInDrawer, 'spacing', 'More');
        const more = await drag(150);
        expect(
          Math.abs(more.to - more.expected) <= 1,
          `dragged, Character spacing went from ${more.from} to ${more.to}, not about ${more.expected}`
        );
        // The first page stacks at a phone's width; its first slider is Margins.
        await page.run(pressInDrawer, 'spacing', 'Back');
        await page.run(narrowDisplayBar, 393);
        await page.run(openDisplayTab, 'spacing', false);
        await page.run(setDisplay, 'orbis-margins', '0');
        const margins = await drag(80);
        expect(
          Math.abs(margins.to - margins.expected) <= 1,
          `dragged, Margins went from ${margins.from} to ${margins.to}, not about ${margins.expected}`
        );
        const layouts = await page.run(layoutsPerChange, 5);
        expect(layouts === 0, `five changes of a value laid the tab out ${layouts} times`);

        // A pane that grows during a drag, as when a phone's keyboard closes: the tab has the room once it is let go.
        const size = (height: number) =>
          page.send('Emulation.setDeviceMetricsOverride', { width: 1600, height, deviceScaleFactor: 1, mobile: false });
        await size(330);
        await sleep(500);
        const held = await page.run(firstSlider, 'spacing');
        const mouse = (type: string) =>
          page.send('Input.dispatchMouseEvent', { type, x: held.x + 20, y: held.y, button: 'left', clickCount: 1 });
        await mouse('mousePressed');
        await size(900);
        await sleep(500);
        const during = await page.run(drawerRoom);
        expect(during.allowed < during.room - 1, `the tab was laid out during the drag: ${JSON.stringify(during)}`);
        await mouse('mouseReleased');
        await sleep(500);
        const { allowed, room } = await page.run(drawerRoom);
        expect(
          Math.abs(allowed - room) <= 1,
          `after the pane grew, the tab may be ${allowed}px in a room of ${room}px`
        );
      } finally {
        await page.run(narrowDisplayBar, null);
        await page.send('Emulation.clearDeviceMetricsOverride');
      }
    },
  },
  {
    name: 'focus mode hides the toolbar, comes out again, and is not remembered',
    async run(context) {
      const { page } = context;
      await open(context, 'fixtures/annotation-workhorse.epub');
      expect(await page.run(runCommand, 'orbis-reader:orbis-toggle-focus-mode'), 'Toggle focus mode was not offered');
      await sleep(500);
      const inside = await page.run(focusState);
      expect(inside.focus && !inside.toolbar && inside.exit, `in Focus mode: ${JSON.stringify(inside)}`);
      await page.run(runCommand, 'orbis-reader:orbis-toggle-focus-mode');
      await sleep(500);
      const outside = await page.run(focusState);
      expect(!outside.focus && outside.toolbar && !outside.exit, `out of Focus mode: ${JSON.stringify(outside)}`);

      await page.run(runCommand, 'orbis-reader:orbis-toggle-focus-mode');
      await sleep(500);
      await page.run(closeBooks);
      await open(context, 'fixtures/annotation-workhorse.epub');
      const reopened = await page.run(focusState);
      expect(!reopened.focus && reopened.toolbar, `reopened, the book is ${JSON.stringify(reopened)}`);
    },
  },
  {
    name: 'the page keys turn the page, unless the setting is off',
    async run(context) {
      const { page } = context;
      const book = 'fixtures/parts-and-chapters.epub';
      const turned = async (key: string) => {
        const before = await page.run(readingPos);
        await page.run(pressInBook, key);
        await page.run(settledPlace, 10_000);
        const after = await page.run(readingPos);
        if (after.section === before.section && after.pos === before.pos) return 0;
        // A later section is further on, whatever its position: a page back across a chapter lands on the last page
        // of the one before, scrolled further than the first page of this one.
        return after.section > before.section || (after.section === before.section && after.pos > before.pos) ? 1 : -1;
      };
      await open(context, book);
      await page.run(turnTo, 6, 2);
      const keys: [string, number][] = [
        ['ArrowRight', 1],
        [' ', 1],
        ['PageDown', 1],
        ['ArrowLeft', -1],
        ['PageUp', -1],
        ['ArrowDown', 0],
        ['ArrowUp', 0],
      ];
      for (const [key, expected] of keys) {
        const moved = await turned(key);
        expect(moved === expected, `"${key}" moved the page ${moved}, not ${expected}`);
      }

      await page.run(setDeviceValue, 'keyboardPageTurn', false);
      await open(context, book);
      await page.run(turnTo, 6, 2);
      for (const key of ['ArrowRight', ' ', 'PageDown', 'ArrowLeft', 'PageUp']) {
        const moved = await turned(key);
        expect(moved === 0, `with Turn pages with the keyboard off, "${key}" still moved the page`);
      }
    },
  },
  {
    name: 'the Two-column layout switch turns two columns on and off, and follows a change made elsewhere',
    async run(context) {
      const { page } = context;
      await open(context, 'fixtures/annotation-workhorse.epub');
      await page.run(setDisplay, 'orbis-columns', '2');
      await page.run(openDisplayTab, 'structure', false);
      expect(!(await page.run(flipDrawerSwitch, 'structure', 'Two-column layout')), 'the switch did not turn off');
      expect((await page.run(getDisplay, 'orbis-columns')) === '1', 'turned off, two columns are still stored');
      expect(await page.run(flipDrawerSwitch, 'structure', 'Two-column layout'), 'the switch did not turn on');
      expect((await page.run(getDisplay, 'orbis-columns')) === '2', 'turned on, two columns are not stored');
      // A change from Settings or the palette moves the switch; selecting it then turns it back on.
      await page.run(setDisplay, 'orbis-columns', '1');
      await sleep(300);
      expect(
        await page.run(flipDrawerSwitch, 'structure', 'Two-column layout'),
        'the switch missed a change made elsewhere'
      );
      expect(
        (await page.run(getDisplay, 'orbis-columns')) === '2',
        'after the outside change, two columns are not stored'
      );
      await page.run(closeDisplayBar);
    },
  },
  {
    name: "Obsidian's swipe is off on the secondary bars and the page buttons, and on in the rest of the reader",
    async run(context) {
      const { page } = context;
      await open(context, 'fixtures/annotation-workhorse.epub');
      // Display styles is built on a lazy import, a moment after the book opens.
      await sleep(500);
      const off = [
        '.orbis-level2-toolbar',
        '.orbis-level3-drawer input[type="range"]',
        '.orbis-search-bar',
        '.orbis-goto-bar',
        '.orbis-tts-bar',
        '.orbis-highlight-drawer-row',
        '.orbis-nav-prev',
        '.orbis-nav-next',
      ];
      const on = ['.orbis-toolbar-left', '.orbis-filter-wrapper', '.orbis-toc-panel', '.orbis-tts-player'];
      const seen = await page.run(swipeIgnored, [...off, ...on]);
      for (const selector of off)
        expect(seen[selector] === true, `${selector} still takes Obsidian's swipe (${seen[selector]})`);
      for (const selector of on)
        expect(seen[selector] === false, `${selector} lost Obsidian's swipe (${seen[selector]})`);
    },
  },
];
