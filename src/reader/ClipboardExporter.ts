import { Notice } from 'obsidian';
import { t } from '../i18n';
import { buildClipboardMarkdown } from './export-format';
import type { ReaderContext } from './ReaderContext';

/**
 * Copies the book's annotations to the clipboard as grouped markdown. Formatting
 * is delegated to `buildClipboardMarkdown` in `export-format.ts`; this class only
 * guards preconditions, writes to the clipboard, and shows a notice.
 *
 * See `docs/design/reader-architecture.md` (Phase 2).
 */
export class ClipboardExporter {
  constructor(private readonly ctx: ReaderContext) {}

  copyHighlights(): void {
    if (!this.ctx.currentFile) {
      new Notice(t('notices.no_book_loaded'));
      return;
    }
    const data = this.ctx.notesData();
    if (data.highlights.length === 0) {
      new Notice(t('notices.no_highlights'));
      return;
    }
    const md = buildClipboardMarkdown('highlights', data);
    void navigator.clipboard.writeText(md).then(() => new Notice(t('notices.highlights_copied_to_clipboard')));
  }

  copyNotes(): void {
    if (!this.ctx.currentFile) {
      new Notice(t('notices.no_book_loaded'));
      return;
    }
    const data = this.ctx.notesData();
    if (data.notes.length === 0) {
      new Notice(t('notices.no_notes'));
      return;
    }
    const md = buildClipboardMarkdown('notes', data);
    void navigator.clipboard.writeText(md).then(() => new Notice(t('notices.notes_copied_to_clipboard')));
  }

  copyBookmarks(): void {
    if (!this.ctx.currentFile) {
      new Notice(t('notices.no_book_loaded'));
      return;
    }
    const data = this.ctx.notesData();
    if (data.bookmarks.length === 0) {
      new Notice(t('notices.no_bookmarks'));
      return;
    }
    const md = buildClipboardMarkdown('bookmarks', data);
    void navigator.clipboard.writeText(md).then(() => new Notice(t('notices.bookmarks_copied_to_clipboard')));
  }
}
