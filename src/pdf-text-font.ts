// The font a PDF draws the book's text in, chosen from the vault's fonts.
//
// **The book's text only.** A PDF sets the book's prose in serif and the reader's own words — headings Orbis adds,
// notes, the byline — in sans, so every page says which words are whose (`pdf-writer.ts`). The chosen font takes
// the four faces of the book's text: Regular, Italic, Bold and Bold Italic. The rest stays as it was.
//
// **Static files only.** pdf-lib embeds a variable font at its default weight, which is Thin or Light as often as
// Regular, and cannot choose another. So a face comes from a file of one weight, and a family that has only variable
// files is not offered.
//
// **What the font lacks comes from beneath it.** A face the family does not have is drawn in DejaVu's (or the
// built-in font's), and so is a character the chosen face cannot draw — see `createPdfWriter`.
//
// **Every font in the vault, not only those switched on.** The Fonts page's switches choose what the reading Font
// list offers; a font hidden for reading may still be wanted in a PDF. See docs/design/fonts.md.

import { type App, type SettingDefinitionItem, TFile } from 'obsidian';
import { FONT_PACKAGES, packageInstalled } from './font-downloads';
import { FACE_SLOTS, type FaceSlot } from './font-file';
import { fontInfoOf, knownFonts, scanFonts, type VaultFace, type VaultFont } from './fonts';
import { t } from './i18n';

/** The writer's faces for the book's text. Mirrors those `FontName`s in `pdf-writer.ts`. */
export type TextSlot = 'body' | 'italic' | 'bodyBold' | 'bodyBoldItalic';

/** Which of the writer's faces each of a family's four draws. */
export const TEXT_SLOT_OF: Record<FaceSlot, TextSlot> = {
  regular: 'body',
  italic: 'italic',
  bold: 'bodyBold',
  boldItalic: 'bodyBoldItalic',
};

/** One face's file, and whether pdf-lib may embed only the glyphs used (TrueType outlines; not CFF ones). */
export interface TextFace {
  data: Uint8Array;
  subset: boolean;
}

/** The chosen font's faces, by the writer's slots. A face the family lacks is absent. */
export type TextFaces = Partial<Record<TextSlot, TextFace>>;

/**
 * Whether a face's license bits let it go into a document someone else may receive. Restricted License embedding
 * (2, with none of the permissive bits) refuses it, and Bitmap embedding only (0x200) allows no outlines, which is
 * all a PDF from pdf-lib can carry.
 */
export function embeddable(fsType: number): boolean {
  return (fsType & 0x000f) !== 0x0002 && (fsType & 0x0200) === 0;
}

/**
 * The file a PDF uses for each of the four faces: static, embeddable, the closest to normal width, then the closest
 * to the weight (400, or 700 for bold). A face no file fits is absent.
 */
export function pdfFacesOf(font: VaultFont): Partial<Record<FaceSlot, VaultFace>> {
  const usable = font.faces.filter((f) => !f.weightRange && embeddable(f.fsType));
  const faces: Partial<Record<FaceSlot, VaultFace>> = {};
  for (const slot of FACE_SLOTS) {
    const italic = slot === 'italic' || slot === 'boldItalic';
    const bold = slot === 'bold' || slot === 'boldItalic';
    const target = bold ? 700 : 400;
    const fits = usable
      .filter((f) => f.italic === italic && (bold ? f.weight >= 600 : f.weight >= 300 && f.weight <= 500))
      .sort(
        (a, b) =>
          Math.abs(a.width - 100) - Math.abs(b.width - 100) || Math.abs(a.weight - target) - Math.abs(b.weight - target)
      );
    if (fits[0]) faces[slot] = fits[0];
  }
  return faces;
}

/** The vault's families a PDF can draw the book's text in: those with a Regular face it can use. */
export function pdfFontChoices(fonts: readonly VaultFont[] = knownFonts()): string[] {
  return fonts.filter((f) => pdfFacesOf(f).regular).map((f) => f.family);
}

/** One face of a family as a document embeds it: which of the four, its file's name, its bytes and its outlines. */
export interface ReadFace {
  slot: FaceSlot;
  face: VaultFace;
  name: string;
  data: Uint8Array;
  format: 'ttf' | 'otf';
}

/**
 * The faces of `family` a document can embed, read from the vault (`pdfFacesOf`), or undefined when this device does
 * not have a Regular one — not synced yet, deleted, or variable files only. For the PDF and the EPUB alike.
 *
 * Never throws: a font that cannot be read is a document in the default font, not a failed export.
 */
export async function readFaces(app: App, family: string): Promise<ReadFace[] | undefined> {
  const key = family.toLowerCase();
  const find = (fonts: readonly VaultFont[]) => fonts.find((f) => f.family.toLowerCase() === key);
  try {
    const font = find(knownFonts()) ?? find(await scanFonts());
    if (!font) return undefined;
    const faces: ReadFace[] = [];
    for (const [slot, face] of Object.entries(pdfFacesOf(font)) as [FaceSlot, VaultFace][]) {
      const file = app.vault.getAbstractFileByPath(face.path);
      const info = file instanceof TFile ? await fontInfoOf(app, file) : null;
      if (!(file instanceof TFile) || !info) continue;
      faces.push({
        slot,
        face,
        name: file.name,
        data: new Uint8Array(await app.vault.readBinary(file)),
        format: info.format,
      });
    }
    return faces.some((f) => f.slot === 'regular') ? faces : undefined;
  } catch (err) {
    console.error(`[Orbis] could not read the font ${family} —`, err);
    return undefined;
  }
}

/** The faces of `family` for a PDF, by the writer's slots, or undefined as `readFaces` says. */
export async function loadTextFaces(app: App, family: string): Promise<TextFaces | undefined> {
  const faces = await readFaces(app, family);
  if (!faces) return undefined;
  const text: TextFaces = {};
  // Subset when the outlines are TrueType; a CFF file is embedded whole — see `createPdfWriter`.
  for (const f of faces) text[TEXT_SLOT_OF[f.slot]] = { data: f.data, subset: f.format === 'ttf' };
  return text;
}

/**
 * The Font list for a PDF: the default first, named for what it is, then every family a PDF can use. `dejavu` says
 * whether the default is DejaVu Serif, which is then not listed twice. A family `current` names that is not in the
 * vault is kept, marked, so the list never shows a value it cannot hold.
 */
export function pdfFontOptions(
  current: string,
  dejavu: boolean,
  fonts: readonly VaultFont[] = knownFonts()
): Record<string, string> {
  const options: Record<string, string> = { '': t(dejavu ? 'pdf_font.default_dejavu' : 'pdf_font.default_times') };
  for (const family of pdfFontChoices(fonts)) {
    if (!(dejavu && family.toLowerCase() === 'dejavu serif')) options[family] = family;
  }
  if (current && !(current in options)) options[current] = t('pdf_font.missing', { name: current });
  return options;
}

/** Whether DejaVu is whole in the vault, so the default the settings pages name is DejaVu Serif rather than Times. */
export function dejavuInVault(): boolean {
  const pkg = FONT_PACKAGES.find((p) => p.pdf);
  return !!pkg && packageInstalled(pkg, knownFonts());
}

/**
 * The Font row on both PDF settings pages: one key, `pdfFont`, like the byline.
 *
 * **Listed in `render`, not in the definition**, like the Library's status row: the settings tab's definitions are
 * made at plugin load, before the fonts folder has been looked through, so a list made there holds no fonts and
 * stays so. `render` runs as the page opens.
 */
export function pdfFontRow(settings: { pdfFont: string }, save: () => Promise<void>): SettingDefinitionItem {
  return {
    name: t('pdf_font.name'),
    desc: t('pdf_font.desc'),
    render: (setting) => {
      setting.addDropdown((d) => {
        d.addOptions(pdfFontOptions(settings.pdfFont, dejavuInVault()))
          .setValue(settings.pdfFont)
          .onChange(async (v) => {
            settings.pdfFont = v;
            await save();
          });
      });
    },
  };
}
