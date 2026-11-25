// What a set of chosen files holds: font files, zips of them, and the licences that came with them.
//
// **A zip is opened, not refused.** A font is usually downloaded as one: Google Fonts' "Download all", a foundry's
// release. The fonts inside it are read like files chosen one by one, at any depth, and a licence file in the zip
// (`OFL.txt`, `LICENSE…`) goes with every family the zip held, so the licence is beside the font in the vault.
//
// **Static files win over a variable copy of the same family.** Google's zip of a variable family holds the variable
// files and a `static` folder of every weight. Both would give the browser two descriptions of the same faces; the
// static ones are what a PDF can use, so they are kept and the variable ones left out.
//
// Kept free of Obsidian, so it can be tested. See docs/design/fonts.md § Importing.

import { unzipSync } from 'fflate';
import { type FaceSlot, type FontFileInfo, type FontFileProblem, facesCovered, readFontFile } from './font-file';

/** A file as the picker gives it, or as a zip holds it. */
export interface ChosenSource {
  name: string;
  data: Uint8Array;
}

/** One font file, read. */
export interface ChosenFont {
  /** The file's own name, without the folders a zip kept it in. */
  name: string;
  data: Uint8Array;
  info: FontFileInfo;
}

/** A licence file that came with fonts. */
export interface ChosenLicence {
  name: string;
  data: Uint8Array;
}

/** Why a chosen file is not imported. */
export type ImportProblem = FontFileProblem | 'bad-zip' | 'empty-zip';

export interface Refused {
  name: string;
  problem: ImportProblem;
}

/** The chosen files of one family, and the licences that came with them. */
export interface ImportFamily {
  family: string;
  files: ChosenFont[];
  licences: ChosenLicence[];
  covered: Set<FaceSlot>;
}

export interface Gathered {
  families: ImportFamily[];
  refused: Refused[];
}

const FONT_FILE = /\.(ttf|otf)$/i;
const LICENCE_FILE = /^(ofl|licen[cs]e|copying)([._-].*)?(\.(txt|md))?$/i;

/** The last part of a path in a zip. */
function baseName(path: string): string {
  return path.split('/').pop() ?? path;
}

/** Whether a path in a zip is one of the copies macOS adds when it makes a zip. */
function macJunk(path: string): boolean {
  return path.startsWith('__MACOSX/') || baseName(path).startsWith('._');
}

/** Sort chosen files into families, opening zips, and say why anything is left out. */
export function gatherImport(sources: readonly ChosenSource[]): Gathered {
  const byFamily = new Map<string, ImportFamily>();
  const refused: Refused[] = [];

  const addFont = (name: string, data: Uint8Array, licences: ChosenLicence[]): boolean => {
    const result = readFontFile(data);
    if (!result.ok) {
      refused.push({ name, problem: result.problem });
      return false;
    }
    const key = result.info.family.toLowerCase();
    const family = byFamily.get(key) ?? {
      family: result.info.family,
      files: [],
      licences: [],
      covered: new Set<FaceSlot>(),
    };
    family.files.push({ name: baseName(name), data, info: result.info });
    for (const licence of licences) {
      if (!family.licences.some((l) => l.name === licence.name)) family.licences.push(licence);
    }
    byFamily.set(key, family);
    return true;
  };

  for (const source of sources) {
    if (!/\.zip$/i.test(source.name)) {
      addFont(source.name, source.data, []);
      continue;
    }
    let entries: Record<string, Uint8Array>;
    try {
      entries = unzipSync(source.data, {
        filter: (f) => !macJunk(f.name) && (FONT_FILE.test(f.name) || LICENCE_FILE.test(baseName(f.name))),
      });
    } catch {
      refused.push({ name: source.name, problem: 'bad-zip' });
      continue;
    }
    const licences = Object.entries(entries)
      .filter(([path]) => LICENCE_FILE.test(baseName(path)))
      .map(([path, data]) => ({ name: baseName(path), data }));
    const fonts = Object.entries(entries).filter(([path]) => FONT_FILE.test(path));
    for (const [path, data] of fonts) addFont(`${source.name}/${path}`, data, licences);
    if (fonts.length === 0) refused.push({ name: source.name, problem: 'empty-zip' });
  }

  for (const family of byFamily.values()) {
    if (family.files.some((f) => !f.info.weightRange)) {
      family.files = family.files.filter((f) => !f.info.weightRange);
    }
    family.covered = facesCovered(family.files.map((f) => f.info));
  }
  return { families: [...byFamily.values()], refused };
}
