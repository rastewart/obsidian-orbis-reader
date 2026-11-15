import { describe, expect, it } from 'vitest';
import { embedLinkpath } from '../markdown-epub';

/**
 * Which file a rendered embed actually points at.
 *
 * **Guards against a converted book carrying another book's cover.** Resolving
 * `ebooks/exports/sample-book-or-the-subtitle-assets/cover.jpg` by its BASENAME fails in a vault full of book
 * exports, which has one `cover.jpg` per book, so Obsidian hands back whichever sorts first.
 *
 * A basename is not an identity. The link as written is, and Obsidian keeps it on the `.internal-embed` wrapper.
 */
const embed = (wrapperSrc: string | null, imgSrc: string): HTMLElement => {
  const host = document.createElement('div');
  const img = document.createElement('img');
  img.setAttribute('src', imgSrc);
  if (wrapperSrc === null) {
    host.appendChild(img);
  } else {
    const wrapper = document.createElement('div');
    wrapper.className = 'internal-embed image-embed';
    wrapper.setAttribute('src', wrapperSrc);
    wrapper.appendChild(img);
    host.appendChild(wrapper);
  }
  return img;
};

const RENDERED = 'app://local/Users/me/Vault/ebooks/exports/sample-book-or-the-subtitle-assets/cover.jpg?163827';

describe('embedLinkpath', () => {
  it('takes the whole path from the wrapper, not the basename', () => {
    const img = embed('ebooks/exports/sample-book-or-the-subtitle-assets/cover.jpg', RENDERED);
    expect(embedLinkpath(img, RENDERED)).toBe('ebooks/exports/sample-book-or-the-subtitle-assets/cover.jpg');
  });

  it('drops a cache-busting query from the wrapper too', () => {
    const img = embed('notes/assets/diagram.png?v=2', RENDERED);
    expect(embedLinkpath(img, RENDERED)).toBe('notes/assets/diagram.png');
  });

  it('decodes an escaped path, since a folder may contain spaces', () => {
    const img = embed('ebooks/my%20exports/cover.jpg', RENDERED);
    expect(embedLinkpath(img, RENDERED)).toBe('ebooks/my exports/cover.jpg');
  });

  /** A short wiki embed resolves by its name — the wrapper carries what was written, not a full path. */
  it('passes a bare wiki link through unchanged', () => {
    const img = embed('cover.jpg', RENDERED);
    expect(embedLinkpath(img, RENDERED)).toBe('cover.jpg');
  });

  /**
   * **The fallback is the basename**, so an embed rendered without a wrapper still resolves — which is what makes
   * this safe on a path *Save note as EPUB* shares.
   */
  it('falls back to the basename when there is no wrapper', () => {
    const img = embed(null, RENDERED);
    expect(embedLinkpath(img, RENDERED)).toBe('cover.jpg');
  });

  it('strips the query in the fallback as well', () => {
    const img = embed(null, 'capacitor://localhost/_capacitor_file_/storage/Vault/a/b/photo%20one.png?9911');
    expect(embedLinkpath(img, 'capacitor://localhost/_capacitor_file_/storage/Vault/a/b/photo%20one.png?9911')).toBe(
      'photo one.png'
    );
  });
});
