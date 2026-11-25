// Fonts from the vault's fonts folder: found when their files arrive, offered in the Font list, and drawn in the book.
//
// The font is KaTeX_Main, from the KaTeX package installed for the documentation site: four static faces under the
// MIT licence, written into the test vault through Obsidian, as sync or an import would put them there.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  bookFontState,
  bookFontWeights,
  deleteVaultFolder,
  fontListShown,
  getDisplay,
  newWindowBookUses,
  openBook,
  openBookInNewWindow,
  pluginSetting,
  renameVaultPath,
  setDisplay,
  writeVaultBinary,
} from '../in-page';
import { ROOT } from '../launch';
import { dismissDialogs, type E2eTest, expect } from '../runner';

const BOOK = 'fixtures/annotation-workhorse.epub';
const FOLDER = '!orbis-data/fonts';
const FAMILY = 'KaTeX_Main';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Writes the four KaTeX_Main faces into `folder`, as an import would. */
async function writeKatex(page: Parameters<E2eTest['run']>[0]['page'], folder: string): Promise<void> {
  const dir = katexFonts();
  for (const face of ['Regular', 'Italic', 'Bold', 'BoldItalic']) {
    const file = `${FAMILY}-${face}.ttf`;
    await page.run(writeVaultBinary, `${folder}/KaTeX Main/${file}`, readFileSync(join(dir, file)).toString('base64'));
  }
}

/** KaTeX's fonts folder, wherever pnpm put the package. */
function katexFonts(): string {
  const store = join(ROOT, 'node_modules', '.pnpm');
  const pkg = readdirSync(store).find((name) => name.startsWith('katex@'));
  if (!pkg) throw new Error('KaTeX is not installed: run pnpm install');
  return join(store, pkg, 'node_modules', 'katex', 'dist', 'fonts');
}

export const fontTests: E2eTest[] = [
  {
    name: 'a font put in the fonts folder is offered in the Font list and draws the book',
    timeoutMs: 90_000,
    async run({ page }) {
      const before = await page.run(getDisplay, 'orbis-font-family');
      try {
        await page.run(openBook, BOOK, 30_000);
        await dismissDialogs(page);
        const dir = katexFonts();
        for (const face of ['Regular', 'Italic', 'Bold', 'BoldItalic']) {
          const file = `${FAMILY}-${face}.ttf`;
          await page.run(
            writeVaultBinary,
            `${FOLDER}/KaTeX Main/${file}`,
            readFileSync(join(dir, file)).toString('base64')
          );
        }
        let shown = await page.run(fontListShown);
        for (let i = 0; i < 20 && !shown.labels.includes(FAMILY); i++) {
          await sleep(250);
          shown = await page.run(fontListShown);
        }
        expect(shown.labels.includes(FAMILY), `the Font list offers ${shown.labels.join(', ')}`);

        await page.run(setDisplay, 'orbis-font-family', `"${FAMILY}"`);
        let state = await page.run(bookFontState, FAMILY);
        for (let i = 0; i < 20 && !(state.loaded.length && state.loaded.every(Boolean)); i++) {
          await sleep(250);
          state = await page.run(bookFontState, FAMILY);
        }
        expect(
          state.loaded.length > 0 && state.loaded.every(Boolean),
          `the font is loaded in ${JSON.stringify(state.loaded)}`
        );
        expect(state.paragraphFont.includes(FAMILY), `the book's text is drawn in ${state.paragraphFont}`);
      } finally {
        await page.run(setDisplay, 'orbis-font-family', before ?? 'default');
        await page.run(deleteVaultFolder, FOLDER);
        await dismissDialogs(page);
      }
    },
  },
  {
    name: 'a face that arrives after its font reaches the chapter already open',
    timeoutMs: 60_000,
    async run({ page }) {
      const before = await page.run(getDisplay, 'orbis-font-family');
      const write = (face: string) => {
        const file = `${FAMILY}-${face}.ttf`;
        const data = readFileSync(join(katexFonts(), file)).toString('base64');
        return page.run(writeVaultBinary, `${FOLDER}/KaTeX Main/${file}`, data);
      };
      /** The weights loaded, once they are `wanted` or five seconds have passed. */
      const weights = async (wanted: string) => {
        let got = await page.run(bookFontWeights, FAMILY);
        for (let i = 0; i < 20 && got.join(' ') !== wanted; i++) {
          await sleep(250);
          got = await page.run(bookFontWeights, FAMILY);
        }
        return got.join(' ');
      };
      try {
        await write('Regular');
        await page.run(openBook, BOOK, 30_000);
        await dismissDialogs(page);
        await page.run(setDisplay, 'orbis-font-family', `"${FAMILY}"`);
        const one = await weights('400');
        expect(one === '400', `with Regular alone, the chapter has weights ${one}`);
        await write('Bold');
        const both = await weights('400 700');
        expect(both === '400 700', `with Bold added, the chapter has weights ${both}`);
      } finally {
        await page.run(setDisplay, 'orbis-font-family', before ?? 'default');
        await page.run(deleteVaultFolder, FOLDER);
        await dismissDialogs(page);
      }
    },
  },
  {
    name: 'a font in use that is not in the vault is offered as not on this device',
    async run({ page }) {
      const before = await page.run(getDisplay, 'orbis-font-family');
      try {
        await page.run(openBook, BOOK, 30_000);
        await page.run(setDisplay, 'orbis-font-family', '"Literata"');
        await sleep(300);
        const shown = await page.run(fontListShown);
        expect(shown.value === '"Literata"', `the Font list shows ${shown.value}`);
        expect(
          shown.labels.includes('Literata (not on this device)'),
          `the Font list offers ${shown.labels.join(', ')}`
        );
      } finally {
        await page.run(setDisplay, 'orbis-font-family', before ?? 'default');
        await dismissDialogs(page);
      }
    },
  },
  {
    name: 'moving the fonts folder in the file explorer moves the setting with it, and its fonts stay offered',
    timeoutMs: 60_000,
    async run({ page }) {
      const MOVED = 'Moved fonts';
      try {
        await page.run(openBook, BOOK, 30_000);
        await dismissDialogs(page);
        await writeKatex(page, FOLDER);
        await sleep(500);
        await page.run(renameVaultPath, FOLDER, MOVED);
        let setting = await page.run(pluginSetting, 'fontsFolder');
        for (let i = 0; i < 20 && setting !== MOVED; i++) {
          await sleep(250);
          setting = await page.run(pluginSetting, 'fontsFolder');
        }
        expect(setting === MOVED, `the fonts folder setting is "${String(setting)}"`);
        await sleep(500);
        const shown = await page.run(fontListShown);
        expect(shown.labels.includes(FAMILY), `after the move, the Font list offers ${shown.labels.join(', ')}`);
      } finally {
        await page.run(deleteVaultFolder, MOVED);
        await page.run(deleteVaultFolder, FOLDER);
        await dismissDialogs(page);
      }
    },
  },
  {
    name: 'a vault font draws a book in an Obsidian window of its own',
    timeoutMs: 60_000,
    async run({ page }) {
      const before = await page.run(getDisplay, 'orbis-font-family');
      try {
        await writeKatex(page, FOLDER);
        await sleep(500);
        await page.run(setDisplay, 'orbis-font-family', `"${FAMILY}"`);
        await page.run(openBookInNewWindow, BOOK, 30_000);
        let state = await page.run(newWindowBookUses, FAMILY);
        for (let i = 0; i < 20 && !(state.loaded.length && state.loaded.every(Boolean)); i++) {
          await sleep(250);
          state = await page.run(newWindowBookUses, FAMILY);
        }
        expect(state.windows === 1, `${state.windows} books are open in windows of their own`);
        expect(
          state.loaded.length > 0 && state.loaded.every(Boolean),
          `the font is loaded in ${JSON.stringify(state.loaded)}`
        );
      } finally {
        await page.run(setDisplay, 'orbis-font-family', before ?? 'default');
        await page.run(deleteVaultFolder, FOLDER);
        await dismissDialogs(page);
      }
    },
  },
];
