import { describe, expect, it } from 'vitest';
import { bookWindowFree } from '../OrbisModal';

// A recording that finishes with its dialog closed brings the dialog back. It used to come back into whichever
// window was in front, and with Settings' own window focused it opened inside Settings, cut off at its edge. It now
// waits for the book's window to be in front with nothing open over it.
describe('bookWindowFree', () => {
  const freshWindow = (): Document => document.implementation.createHTMLDocument('book');

  it('is free when the book window is in front with nothing open', () => {
    const book = freshWindow();
    expect(bookWindowFree(book, book)).toBe(true);
  });

  it('waits while another window — Settings — is in front', () => {
    const book = freshWindow();
    const settings = freshWindow();
    expect(bookWindowFree(book, settings)).toBe(false);
  });

  it('waits while an Orbis dialog is open over the book', () => {
    const book = freshWindow();
    const popup = book.createElement('div');
    popup.className = 'orbis-popup';
    const close = book.createElement('button');
    close.className = 'orbis-popup-close-btn';
    popup.appendChild(close);
    book.body.appendChild(popup);
    expect(bookWindowFree(book, book)).toBe(false);
  });

  it("waits while one of Obsidian's dialogs is open over the book, Settings' mobile modal among them", () => {
    const book = freshWindow();
    const container = book.createElement('div');
    container.className = 'modal-container';
    book.body.appendChild(container);
    expect(bookWindowFree(book, book)).toBe(false);
  });
});
