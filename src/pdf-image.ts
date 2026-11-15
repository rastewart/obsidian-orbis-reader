// Turning a book's images into something a PDF can hold.
//
// **pdf-lib embeds PNG and JPEG and nothing else.** That is the common case rather than an edge: a note clipped
// from the web and converted to an EPUB carries WebP, because that is what the web serves now, and without
// conversion its PDF would have no pictures at all and nothing on the page to say why.
//
// Anything else is redrawn through a canvas, which asks the platform to decode it. That covers WebP, GIF, BMP and
// AVIF wherever the WebView can display them, which is everywhere the reader can display them too — the same
// engine draws both.
//
// See docs/design/marks-pdf.md §Images.

/** What the writer can draw. */
export interface EmbeddableImage {
  bytes: Uint8Array;
  kind: 'png' | 'jpg';
}

/**
 * The long edge a converted image is capped at.
 *
 * A page column is about 484 points wide, so 1600 pixels is beyond what any of this can show even printed. Left
 * uncapped, a 4000-pixel photograph re-encodes to something far larger than the WebP it came from, and a book of
 * them makes a PDF nobody can email.
 */
const MAX_EDGE = 1600;

/** JPEG quality for a converted image. High enough that a photograph looks untouched, low enough to stay sendable. */
const QUALITY = 0.85;

/**
 * A blob the PDF writer can embed, or `undefined` if the platform cannot decode it.
 *
 * PNG and JPEG pass through untouched — re-encoding what already works would only lose quality. Everything else is
 * drawn onto **white** and re-encoded as JPEG: white because a PDF page is white, so transparency flattens to the
 * background it would have been shown against rather than to black. JPEG because these are photographs, and PNG
 * would make a 3 MB file out of a 300 KB one.
 */
export async function embeddableImage(blob: Blob): Promise<EmbeddableImage | undefined> {
  if (blob.type === 'image/png') return { bytes: new Uint8Array(await blob.arrayBuffer()), kind: 'png' };
  if (blob.type === 'image/jpeg') return { bytes: new Uint8Array(await blob.arrayBuffer()), kind: 'jpg' };

  const url = URL.createObjectURL(blob);
  try {
    const img = createEl('img');
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('undecodable'));
      img.src = url;
    });
    // An SVG with no intrinsic size decodes to nothing. Better to skip it than to draw an empty rectangle.
    if (!img.naturalWidth || !img.naturalHeight) return undefined;

    const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = createEl('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY));
    if (!out) return undefined;
    return { bytes: new Uint8Array(await out.arrayBuffer()), kind: 'jpg' };
  } catch {
    // A format the platform will not decode. The caption prints on its own.
    return undefined;
  } finally {
    URL.revokeObjectURL(url);
  }
}
