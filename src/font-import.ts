// What a set of chosen files holds: font files, zips of them, and the licenses that came with them.
//
// **A zip is opened, not refused.** A font is usually downloaded as one: Google Fonts' "Download all", a foundry's
// release. The fonts inside it are read like files chosen one by one, at any depth, and a license file in the zip
// (`OFL.txt`, `LICENSE…`) goes with every family the zip held, so the license is beside the font in the vault.
//
// **Static files win over a variable copy of the same family.** Google's zip of a variable family holds the variable
// files and a `static` folder of every weight. Both would give the browser two descriptions of the same faces; the
// static ones are what a PDF can use, so they are kept and the variable ones left out.
//
// Kept free of Obsidian, so it can be tested. See docs/design/fonts.md § Importing.

import { unzipSync } from 'fflate';
import {
  type FaceSlot,
  type FontFileInfo,
  type FontFileProblem,
  facesCovered,
  isLicenseFile,
  readFontFile,
} from './font-file';

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

/** A license file that came with fonts. */
export interface ChosenLicense {
  name: string;
  data: Uint8Array;
}

/** Why a chosen file is not imported. */
export type ImportProblem = FontFileProblem | 'bad-zip' | 'empty-zip';

export interface Refused {
  name: string;
  problem: ImportProblem;
}

/** The chosen files of one family, and the licenses that came with them. */
export interface ImportFamily {
  family: string;
  files: ChosenFont[];
  licenses: ChosenLicense[];
  covered: Set<FaceSlot>;
}

export interface Gathered {
  families: ImportFamily[];
  refused: Refused[];
}

const FONT_FILE = /\.(ttf|otf)$/i;

/** The last part of a path in a zip, whichever slash the zip was made with. */
function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

/** A file's name as the vault will have it: never one that starts with a dot, which Obsidian does not show. */
function fileName(path: string): string {
  return baseName(path).replace(/^[\s.]+/, '');
}

/** Whether a path in a zip is one of the copies macOS adds when it makes a zip. */
function macJunk(path: string): boolean {
  return path.startsWith('__MACOSX/') || baseName(path).startsWith('._');
}

/** Sort chosen files into families, opening zips, and say why anything is left out. */
export function gatherImport(sources: readonly ChosenSource[]): Gathered {
  const byFamily = new Map<string, ImportFamily>();
  const refused: Refused[] = [];

  const addFont = (name: string, data: Uint8Array, licenses: ChosenLicense[]): boolean => {
    const result = readFontFile(data);
    if (!result.ok) {
      refused.push({ name, problem: result.problem });
      return false;
    }
    const key = result.info.family.toLowerCase();
    const family = byFamily.get(key) ?? {
      family: result.info.family,
      files: [],
      licenses: [],
      covered: new Set<FaceSlot>(),
    };
    family.files.push({ name: fileName(name), data, info: result.info });
    for (const license of licenses) {
      if (!family.licenses.some((l) => l.name === license.name)) family.licenses.push(license);
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
        filter: (f) => !macJunk(f.name) && (FONT_FILE.test(f.name) || isLicenseFile(baseName(f.name))),
      });
    } catch {
      refused.push({ name: source.name, problem: 'bad-zip' });
      continue;
    }
    const licenses = Object.entries(entries)
      .filter(([path]) => isLicenseFile(baseName(path)))
      .map(([path, data]) => ({ name: fileName(path), data }));
    const fonts = Object.entries(entries).filter(([path]) => FONT_FILE.test(path));
    for (const [path, data] of fonts) addFont(`${source.name}/${path}`, data, licenses);
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
