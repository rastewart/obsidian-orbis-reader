// What a font file says about itself: its family, which face it is, and whether it may be embedded.
//
// **Read from the file, not from its name.** `Literata-Bold.ttf` is a convention; the font's own tables are the
// truth, and a reader who renames a file — or a font that names its files some other way — still lands in the right
// family and the right face.
//
// **TrueType and OpenType only.** Those are what the reader, a PDF (pdf-lib, through fontkit) and an EPUB can all
// use. WOFF and WOFF2 are compressed copies of the same tables, made for web pages; reading them would need
// decompression (Brotli, for WOFF2) for no gain to a reader who has the TTF or OTF the WOFF was made from. A font
// collection (`.ttc`) holds several fonts in one file, and is refused for the same reason.
//
// Kept free of Obsidian and the DOM, so it can be tested.

/** What a usable font file says about itself. */
export interface FontFileInfo {
  /** The family a reader would recognize: the typographic family name, or the legacy one when there is none. */
  family: string;
  /** `Regular`, `Bold Italic`, `Light`… — for display only; `weight` and `italic` decide the face. */
  subfamily: string;
  /** 100–900. For a variable font, the default; see `weightRange`. */
  weight: number;
  italic: boolean;
  /** A variable font's weight axis, `[min, max]`, or null for a static font. */
  weightRange: [number, number] | null;
  /**
   * The OS/2 `fsType` embedding bits. 0 is installable; 2 (restricted) is the one that forbids embedding in a
   * document. Preview-and-print (4) and editable (8) both allow it.
   */
  fsType: number;
  format: 'ttf' | 'otf';
}

/** Why a file is not a font this can use. */
export type FontFileProblem = 'web-font' | 'collection' | 'not-a-font';

export type FontFileResult = { ok: true; info: FontFileInfo } | { ok: false; problem: FontFileProblem };

interface TableEntry {
  offset: number;
  length: number;
}

/** Read the font in `bytes`, or say why it cannot be used. Never throws. */
export function readFontFile(bytes: Uint8Array): FontFileResult {
  try {
    return parse(bytes);
  } catch {
    return { ok: false, problem: 'not-a-font' };
  }
}

function parse(bytes: Uint8Array): FontFileResult {
  if (bytes.length < 12) return { ok: false, problem: 'not-a-font' };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (tag === 'wOFF' || tag === 'wOF2') return { ok: false, problem: 'web-font' };
  if (tag === 'ttcf') return { ok: false, problem: 'collection' };
  const version = view.getUint32(0);
  const format = tag === 'OTTO' ? 'otf' : version === 0x00010000 || tag === 'true' ? 'ttf' : null;
  if (!format) return { ok: false, problem: 'not-a-font' };

  const tables = new Map<string, TableEntry>();
  const count = view.getUint16(4);
  for (let i = 0; i < count; i++) {
    const at = 12 + i * 16;
    const name = String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);
    tables.set(name, { offset: view.getUint32(at + 8), length: view.getUint32(at + 12) });
  }
  const nameTable = tables.get('name');
  if (!nameTable) return { ok: false, problem: 'not-a-font' };
  const names = readNames(view, nameTable);
  const family = (names.get(16) || names.get(1) || '').trim();
  if (!family) return { ok: false, problem: 'not-a-font' };
  const subfamily = (names.get(17) || names.get(2) || 'Regular').trim();

  let weight = 400;
  let italic = false;
  let fsType = 0;
  const os2 = tables.get('OS/2');
  if (os2 && os2.length >= 64) {
    weight = view.getUint16(os2.offset + 4) || 400;
    fsType = view.getUint16(os2.offset + 8);
    const fsSelection = view.getUint16(os2.offset + 62);
    // Bit 0 is italic, bit 9 oblique: a reader asking for italic text wants either.
    italic = (fsSelection & 0x0001) !== 0 || (fsSelection & 0x0200) !== 0;
  } else {
    const head = tables.get('head');
    if (head) {
      const macStyle = view.getUint16(head.offset + 44);
      if (macStyle & 0x0001) weight = 700;
      italic = (macStyle & 0x0002) !== 0;
    }
  }

  return {
    ok: true,
    info: { family, subfamily, weight, italic, weightRange: readWeightAxis(view, tables.get('fvar')), fsType, format },
  };
}

/**
 * The name table's strings by name ID, preferring Windows English, then any Windows entry, then Macintosh Roman.
 * Only the IDs this needs: 1 and 2 (family, subfamily), 16 and 17 (their typographic forms).
 */
function readNames(view: DataView, table: TableEntry): Map<number, string> {
  const count = view.getUint16(table.offset + 2);
  const strings = table.offset + view.getUint16(table.offset + 4);
  const best = new Map<number, { rank: number; text: string }>();
  for (let i = 0; i < count; i++) {
    const at = table.offset + 6 + i * 12;
    const platform = view.getUint16(at);
    const language = view.getUint16(at + 4);
    const id = view.getUint16(at + 6);
    if (id !== 1 && id !== 2 && id !== 16 && id !== 17) continue;
    const length = view.getUint16(at + 8);
    const start = strings + view.getUint16(at + 10);
    let rank: number;
    let text = '';
    if (platform === 3) {
      rank = language === 0x0409 ? 3 : 2;
      for (let j = 0; j + 1 < length; j += 2) text += String.fromCharCode(view.getUint16(start + j));
    } else if (platform === 1) {
      rank = 1;
      for (let j = 0; j < length; j++) text += String.fromCharCode(view.getUint8(start + j));
    } else {
      continue;
    }
    if ((best.get(id)?.rank ?? 0) < rank) best.set(id, { rank, text });
  }
  return new Map([...best].map(([id, { text }]) => [id, text]));
}

/** The `wght` axis of a variable font, as whole weights, or null when it has none. */
function readWeightAxis(view: DataView, fvar: TableEntry | undefined): [number, number] | null {
  if (!fvar) return null;
  const axes = fvar.offset + view.getUint16(fvar.offset + 4);
  const count = view.getUint16(fvar.offset + 8);
  const size = view.getUint16(fvar.offset + 10);
  for (let i = 0; i < count; i++) {
    const at = axes + i * size;
    const tag = String.fromCharCode(
      view.getUint8(at),
      view.getUint8(at + 1),
      view.getUint8(at + 2),
      view.getUint8(at + 3)
    );
    if (tag !== 'wght') continue;
    const fixed = (offset: number) => view.getInt32(at + offset) / 65536;
    return [Math.round(fixed(4)), Math.round(fixed(12))];
  }
  return null;
}

/** The four faces a family is expected to have. */
export type FaceSlot = 'regular' | 'italic' | 'bold' | 'boldItalic';

export const FACE_SLOTS: readonly FaceSlot[] = ['regular', 'italic', 'bold', 'boldItalic'];

/**
 * Which of the four faces a set of files covers.
 *
 * Bold is weight 600 or more, so a family's SemiBold counts when it has no Bold — the browser would pick it for bold
 * text anyway. A variable font covers both regular and bold when its weight axis reaches 400 and 600.
 */
export function facesCovered(faces: readonly Pick<FontFileInfo, 'weight' | 'italic' | 'weightRange'>[]): Set<FaceSlot> {
  const covered = new Set<FaceSlot>();
  for (const face of faces) {
    const [low, high] = face.weightRange ?? [face.weight, face.weight];
    const regular = low <= 500 && high >= 300;
    const bold = high >= 600;
    if (regular) covered.add(face.italic ? 'italic' : 'regular');
    if (bold) covered.add(face.italic ? 'boldItalic' : 'bold');
  }
  return covered;
}

/** Whether the file's embedding bits allow it in a document someone else may receive. */
export function embeddingAllowed(fsType: number): boolean {
  // Restricted License embedding (bit 1) with none of the permissive bits set is the one refusal.
  return !((fsType & 0x000f) === 0x0002);
}
