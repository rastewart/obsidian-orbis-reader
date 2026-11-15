// Copy a book's image to the clipboard, as PNG.
//
// **PNG, whatever the book holds.** Chromium's clipboard takes only `image/png` for images, so a JPEG, GIF, WebP or
// SVG is drawn to a canvas and encoded again; a PNG takes the same road rather than a second one. The source is the
// book's own image at its `blob:` URL, not the viewer's rendering, so the reader's brightness filter never reaches
// the copy.
//
// **The write starts inside the tap.** WebKit allows a clipboard write only while the user's gesture is live, and
// encoding takes longer than that, so the clipboard is handed a promise of the PNG rather than the PNG itself.
//
// **Android cannot paste it back into a note.** The copy reaches the system clipboard intact — another app pastes it
// — but Obsidian's own WebView reads an image it wrote itself as an empty PNG, through the paste event and through
// `navigator.clipboard.read()` alike, so Obsidian saves nothing. A copy from Chrome arrives with its bytes. Orbis
// keeps the PNG it last copied, and a paste that carries exactly that empty PNG gets it back: see `pasteCopiedImage`.

import type { App, Editor, Plugin, TFile } from 'obsidian';
import { logToLibrary } from './DebugLog';

/** What the copy reports to the debug log. */
type Log = (msg: string) => void;

/** An SVG with no size of its own draws at this width. */
const SVG_FALLBACK_PX = 1024;

/** The PNG Orbis last put on the clipboard, for the paste the WebView cannot read back. */
let lastCopy: Blob | null = null;

/**
 * Whether `src` is one of the book's own images: a `blob:` copy foliate made of a file in the book, or a `data:`
 * address the book holds inline.
 *
 * **Anything else is an address the book chose, and Obsidian's window does not fetch it.** The chapter's policy keeps
 * a remote image from loading inside the chapter; drawn in the viewer, or decoded for a copy, it would load from
 * Obsidian's own window, where no book policy applies, and tell the server the page was read. See
 * docs/design/security.md, "A book reaching the network".
 */
export function isBookImage(src: string): boolean {
  return /^(blob|data):/i.test(src);
}

/** The book's image as PNG bytes. */
async function toPng(src: string, log: Log): Promise<Blob> {
  if (!isBookImage(src)) throw new Error('not one of the book’s own images');
  const img = new Image();
  img.src = src;
  await img.decode();
  const width = img.naturalWidth || SVG_FALLBACK_PX;
  const height = img.naturalHeight || SVG_FALLBACK_PX;
  const canvas = createEl('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')?.drawImage(img, 0, 0, width, height);
  const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!png) throw new Error('the canvas gave no PNG');
  log(`image copy: encoded ${width}×${height} PNG, ${png.size} bytes`);
  return png;
}

/**
 * Put the image at `src` on the clipboard. Resolves once it is there; rejects with the WebView's own error.
 *
 * Call it from the tap's handler, synchronously, so the write begins while the gesture is live.
 */
export async function copyImage(src: string, log: Log): Promise<void> {
  const png = toPng(src, log);
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
    log('image copy: written, with a promised PNG');
  } catch (err) {
    log(`image copy: a promised PNG failed — ${describe(err)}`);
    // Chromium before promise support, or a WebView that wants the bytes in hand: try once more with them.
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': await png })]);
    log('image copy: written, with the PNG in hand');
  }
  lastCopy = await png;
}

/** Watch pastes into notes for the image the Android WebView cannot read back — see `pasteCopiedImage`. */
export function registerCopiedImagePaste(plugin: Plugin): void {
  plugin.registerEvent(
    plugin.app.workspace.on('editor-paste', (evt, editor, info) => pasteCopiedImage(plugin, evt, editor, info.file))
  );
}

/**
 * A paste into a note that carries one empty PNG and nothing else is the WebView failing to read back an image it
 * copied itself. When Orbis made the last such copy, save that PNG as Obsidian would have — named as Obsidian names a
 * pasted image, where the attachment settings put it — and embed it at the cursor.
 *
 * Any other paste is left to Obsidian, so a real image from another app is never replaced. The one wrong guess left
 * is an image copied inside Obsidian after Orbis's copy, which would arrive just as empty; Obsidian pastes nothing
 * for that one either.
 */
function pasteCopiedImage(host: { app: App }, evt: ClipboardEvent, editor: Editor, note: TFile | null): void {
  const files = evt.clipboardData?.files;
  const copied = lastCopy;
  if (evt.defaultPrevented || !copied || files?.length !== 1) return;
  const [file] = files;
  if (file.type !== 'image/png' || file.size > 0) return;
  evt.preventDefault();
  const log = (msg: string) => logToLibrary(host, msg, 'display');
  log('image paste: empty PNG from the WebView — pasting the copy Orbis made');
  void saveAndEmbed(host.app, copied, editor, note?.path ?? '').catch((err) =>
    log(`image paste: failed — ${describe(err)}`)
  );
}

async function saveAndEmbed(app: App, png: Blob, editor: Editor, sourcePath: string): Promise<void> {
  // Obsidian's own name for a pasted image, so a pasted copy looks like any other.
  const d = new Date();
  const stamp = [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((n) => String(n).padStart(2, '0'))
    .join('');
  const name = `Pasted image ${stamp}.png`;
  const path = await app.fileManager.getAvailablePathForAttachment(name, sourcePath);
  const file = await app.vault.createBinary(path, await png.arrayBuffer());
  editor.replaceSelection(`!${app.fileManager.generateMarkdownLink(file, sourcePath)}`);
}

/** An error as the log should show it. */
export function describe(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
}
