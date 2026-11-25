// The font a converted EPUB is set in, chosen from the vault's fonts and embedded in the book.
//
// **The whole book, where a PDF's is the book's text only.** An EPUB has no commentary of the reader's to set apart:
// it is all the book, so the body takes the font and every heading with it. Code keeps its monospace.
//
// **The same fonts a PDF offers** (`pdfFontChoices`): a Regular face in a file of one weight, with embedding bits that
// allow it. An EPUB could carry a variable font, but an e-reader that cannot draw one would draw nothing, and a book
// is read on more devices than it is made on. The fonts switched off for reading are offered too.
//
// **Embedded, not linked.** The files go in the book, so it reads the same on any device and in any app that honors
// the publisher's font. In Orbis that is when the display style's font is the book's own (Default).
//
// See docs/design/fonts.md § The EPUB font.

import type { App, SettingDefinitionItem } from 'obsidian';
import type { EpubFont } from './epub-builder';
import { t } from './i18n';
import { pdfFontChoices, readFaces } from './pdf-text-font';

/** A file's name as the archive holds it: letters, digits, `.`, `-` and `_`, so no reading app trips on the path. */
function archiveName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, '-');
}

/**
 * The family's faces, ready to embed, or undefined when this device has no Regular face of it a book can use — see
 * `readFaces`. Never throws.
 */
export async function loadEpubFont(app: App, family: string): Promise<EpubFont | undefined> {
  const faces = await readFaces(app, family);
  if (!faces) return undefined;
  const taken = new Set<string>();
  return {
    family,
    faces: faces.map((f) => {
      // Two faces with one name, from two folders, would be one file in the archive.
      let name = archiveName(f.name);
      for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${n}-${archiveName(f.name)}`;
      taken.add(name.toLowerCase());
      return {
        href: `fonts/${name}`,
        mediaType: f.format === 'otf' ? 'font/otf' : 'font/ttf',
        data: f.data,
        weight: f.face.weight,
        italic: f.face.italic,
      };
    }),
  };
}

/**
 * The Font list for an EPUB: none first, which leaves the font to the reading app, then every family a book can embed.
 * A family `current` names that is not in the vault is kept, marked, so the list never shows a value it cannot hold.
 */
export function epubFontOptions(current: string, fonts = pdfFontChoices()): Record<string, string> {
  const options: Record<string, string> = { '': t('epub_font.default') };
  for (const family of fonts) options[family] = family;
  if (current && !(current in options)) options[current] = t('pdf_font.missing', { name: current });
  return options;
}

/**
 * The Font row on the Save as EPUB settings page, `epubFont`.
 *
 * **Listed in `render`**, for the reason `pdfFontRow` gives: the definitions are made before the fonts folder has
 * been looked through.
 */
export function epubFontRow(settings: { epubFont: string }, save: () => Promise<void>): SettingDefinitionItem {
  return {
    name: t('epub_font.name'),
    desc: t('epub_font.desc'),
    render: (setting) => {
      setting.addDropdown((d) => {
        d.addOptions(epubFontOptions(settings.epubFont))
          .setValue(settings.epubFont)
          .onChange(async (v) => {
            settings.epubFont = v;
            await save();
          });
      });
    },
  };
}
