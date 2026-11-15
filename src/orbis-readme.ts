// The readme Orbis leaves in every `!orbis-data` folder, so the folder explains itself to whoever finds it.

import { type App, normalizePath } from 'obsidian';
import { t } from './i18n';

/**
 * The readme's text.
 *
 * **Built from `t()`, not a template literal.** A top-level `const` of English Markdown is invisible to
 * `lint:i18n`, since a const is never at a sink, so the one file Orbis writes into the vault to explain itself
 * would be the one piece of text no locale could reach.
 *
 * `audio/` is listed because the recorded voice writes one folder per book there, and someone reading this file to
 * find out what is safe to touch needs to be told about every entry.
 */
export function readmeContent(): string {
  // `{book file}` rather than `{title}`: every name is built on the book's whole file name, extension included
  // (`sidecarStem`), and `{title}` would read as though it were the book's title.
  const rows: [string, string][] = [
    ['`{book file}.orbis`', t('book_data_readme.row_orbis')],
    ['`{book file}.location.*.json`', t('book_data_readme.row_location')],
    ['`{book file}.marks.*.json`', t('book_data_readme.row_marks')],
    ['`{book file}.pages.json`', t('book_data_readme.row_pages')],
    ['`audio/{book file}.audio/`', t('book_data_readme.row_audio')],
  ];
  return [
    `# ${t('book_data_readme.heading')}`,
    '',
    t('book_data_readme.intro'),
    '',
    `| ${t('book_data_readme.col_file')} | ${t('book_data_readme.col_contents')} |`,
    '|---|---|',
    ...rows.map(([file, contents]) => `| ${file} | ${contents} |`),
    '',
    t('book_data_readme.naming'),
    '',
  ].join('\n');
}

/**
 * Write `!readme.md` into an `!orbis-data` folder that already exists, unless it already says exactly this.
 *
 * Written when absent, and **rewritten when it has fallen behind** — which write-if-absent alone would never do.
 * A readme written by an older version can describe fewer entries than the folder holds, and a file whose whole job
 * is to say what is in the folder is worth keeping true. Safe to overwrite because it says so itself: it is declared
 * plugin-managed in its own first line, and nothing in it is the reader's.
 *
 * Called when Orbis makes the folder, and whenever a book's reading data is shown — the moments someone is looking.
 */
export async function writeFolderReadme(app: App, folder: string): Promise<void> {
  const path = normalizePath(`${folder}/!readme.md`);
  const readme = readmeContent();
  const existing = (await app.vault.adapter.exists(path)) ? await app.vault.adapter.read(path) : null;
  if (existing !== readme) await app.vault.adapter.write(path, readme);
}
