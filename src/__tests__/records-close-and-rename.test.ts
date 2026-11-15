// Two ways a book's reading record went wrong around closing and renaming it — both found on the test page.
//
// Closing the tab within seconds of a save left the records pass on its timer; it then ran on a closed book whose
// passages and notes were already gone, and flagged every one of their records orphaned. And renaming the book with
// "No" to Obsidian's "update links?" left every record's `book` naming a file that no longer existed.

import { type App, TFile, TFolder } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';
import { RECORD_MARKER } from '../reader/annotation-records';
import { RecordsController } from '../reader/RecordsController';
import { moveRecordFiles, relinkGeneratedBody, relinkRecords } from '../reader/record-move';

const OLD_URL = 'obsidian://orbis-nav?file=fixtures%2Fold.epub&cfi=x';

import { recordPaths } from '../reader/record-paths';

describe('closing a book with a records pass still waiting', () => {
  const controller = () => {
    const ctrl = new RecordsController({ debug: () => {} } as never, {} as never);
    const run = vi.spyOn(ctrl, 'exportAnnotationRecords').mockResolvedValue(undefined);
    return { ctrl, run };
  };
  const pending = (ctrl: RecordsController) => {
    (ctrl as unknown as { recordsTimer: number }).recordsTimer = window.setTimeout(() => {}, 4000);
  };

  it('runs the waiting pass at once, while the book is still open', () => {
    const { ctrl, run } = controller();
    pending(ctrl);
    ctrl.flush();
    expect(run).toHaveBeenCalledOnce();
    expect(run).toHaveBeenCalledWith({ silent: true });
  });

  it('runs nothing when nothing was waiting', () => {
    const { ctrl, run } = controller();
    ctrl.flush();
    expect(run).not.toHaveBeenCalled();
  });

  it('leaves no timer behind to fire on the closed book', () => {
    vi.useFakeTimers();
    const { ctrl, run } = controller();
    pending(ctrl);
    ctrl.flush();
    ctrl.dispose();
    vi.advanceTimersByTime(10_000);
    expect(run).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});

describe('renaming a book', () => {
  /** A vault holding a records folder: two records and a note of the reader's own. */
  function vault() {
    const fm: Record<string, Record<string, unknown>> = {
      'R/content/old/note — a.md': {
        orbis_id: 'n1',
        orbis_cfi: 'epubcfi(/6/4!/4/2)',
        loc: 12,
        book: '[[fixtures/old.epub]]',
        link: '[loc. 12](obsidian://orbis-nav?file=fixtures%2Fold.epub&cfi=x)',
      },
      'R/content/old/bookmark — b.md': { orbis_id: 'b1', orbis_cfi: 'epubcfi(/6/6!/4)', loc: null },
      'R/content/old/my own note.md': { title: 'mine' },
    };
    const text: Record<string, string> = {
      'R/content/old/note — a.md': `---\n---\n[loc. 12](${OLD_URL})\n${RECORD_MARKER}\nMy own [link](${OLD_URL})\n`,
      'R/content/old/bookmark — b.md': `---\n---\n${RECORD_MARKER}\n`,
      'R/content/old/my own note.md': 'mine',
    };
    const app = {
      vault: {
        getFiles: () => Object.keys(fm).map((path) => ({ path, extension: 'md', name: path.split('/').pop() })),
        cachedRead: async (file: TFile) => text[file.path],
        process: async (file: TFile, edit: (s: string) => string) => {
          text[file.path] = edit(text[file.path]);
        },
      },
      fileManager: {
        processFrontMatter: async (file: TFile, edit: (f: Record<string, unknown>) => void) => edit(fm[file.path]),
      },
    } as unknown as App;
    return { app, fm, text };
  }

  it('points every record at the book where it now is, whatever Obsidian was told', async () => {
    const { app, fm } = vault();
    const n = await relinkRecords({ app, log: () => {} }, 'R/content/old', 'fixtures/old.epub', 'fixtures/new.epub');
    expect(n).toBe(2);
    const note = fm['R/content/old/note — a.md'];
    expect(note.book).toBe('[[fixtures/new.epub]]');
    expect(note.link).toBe(`[loc. 12](${String(note.link_url)})`);
    expect(note.link_url).toContain(encodeURIComponent('fixtures/new.epub'));
    expect(fm['R/content/old/bookmark — b.md'].link).toMatch(/^\[View in book\]/);
  });

  // The body's copy of the link: an export rewrites a body only when properties change, and these no longer do.
  it("re-points the location link above the marker, and nothing of the reader's below it", async () => {
    const { app, text } = vault();
    await relinkRecords({ app, log: () => {} }, 'R/content/old', 'fixtures/old.epub', 'fixtures/new.epub');
    const [above, below] = text['R/content/old/note — a.md'].split(RECORD_MARKER);
    expect(above).toContain('file=fixtures%2Fnew.epub&cfi=x');
    expect(above).not.toContain('fixtures%2Fold.epub');
    expect(below).toContain('file=fixtures%2Fold.epub');
  });

  it("leaves a note that isn't a record alone", async () => {
    const { app, fm } = vault();
    await relinkRecords({ app, log: () => {} }, 'R/content/old', 'fixtures/old.epub', 'fixtures/new.epub');
    expect(fm['R/content/old/my own note.md']).toEqual({ title: 'mine' });
  });
});

describe('the folders a rename leaves behind', () => {
  /** A vault with one book's records in the shared folder `R`, as files and folders the move can walk. */
  function sharedVault(otherBook = false) {
    const tree = new Map<string, TFile | TFolder>();
    const folder = (path: string) => {
      const f = Object.assign(new TFolder(), { path });
      tree.set(path, f);
      return f;
    };
    const root = folder('R');
    const content = folder('R/content');
    const old = folder('R/content/old');
    root.children.push(content);
    content.children.push(old);
    if (otherBook) content.children.push(folder('R/content/another'));
    const note = Object.assign(new TFile(), {
      path: 'R/content/old/note — a.md',
      name: 'note — a.md',
      extension: 'md',
    });
    tree.set(note.path, note);
    old.children.push(note);
    const trashed: string[] = [];
    const app = {
      vault: {
        getFiles: () => [...tree.values()].filter((f): f is TFile => f instanceof TFile),
        getAbstractFileByPath: (p: string) => tree.get(p) ?? null,
        createFolder: async (p: string) => {
          const f = folder(p);
          (tree.get(p.slice(0, p.lastIndexOf('/'))) as TFolder | undefined)?.children.push(f);
        },
        create: async () => {},
      },
      fileManager: {
        renameFile: async (file: TFile, dest: string) => {
          old.children.splice(old.children.indexOf(file), 1);
          tree.delete(file.path);
          tree.set(dest, Object.assign(file, { path: dest }));
        },
        trashFile: async (f: TFile | TFolder) => {
          trashed.push(f.path);
          tree.delete(f.path);
          const parent = tree.get(f.path.slice(0, f.path.lastIndexOf('/')));
          if (parent instanceof TFolder) parent.children.splice(parent.children.indexOf(f), 1);
        },
      },
    } as unknown as App;
    return { app, trashed };
  }
  const paths = (bookPath: string, bookName: string) =>
    recordPaths({
      location: { mode: 'global' },
      bookPath,
      bookName,
      bookStem: bookName,
      globalRoot: 'R',
      allBooksRoot: null,
    });

  // A shared folder's `content/<book>/` is this book's alone; it used to be kept as though other books shared it.
  it("trashes the book's own emptied folder on a rename, but never the root", async () => {
    const { app, trashed } = sharedVault();
    await moveRecordFiles({ app, log: () => {} }, paths('b/old.epub', 'old'), paths('b/new.epub', 'new'));
    expect(trashed).toContain('R/content/old');
    expect(trashed).not.toContain('R');
  });

  // Found on the test page: moving a book's records beside it left the chosen folder's `content/` behind, empty.
  it('trashes content/ too once the last book has left it, but not the folder the reader chose', async () => {
    const { app, trashed } = sharedVault();
    const beside = recordPaths({
      location: { mode: 'book' },
      bookPath: 'b/old.epub',
      bookName: 'old',
      bookStem: 'old',
      globalRoot: 'R',
      allBooksRoot: null,
    });
    await moveRecordFiles({ app, log: () => {} }, paths('b/old.epub', 'old'), beside);
    expect(trashed).toEqual(['R/content/old', 'R/content']);
  });

  it('keeps content/ while another book still has records in it', async () => {
    const { app, trashed } = sharedVault(true);
    await moveRecordFiles({ app, log: () => {} }, paths('b/old.epub', 'old'), paths('b/new.epub', 'new'));
    expect(trashed).toContain('R/content/old');
    expect(trashed).not.toContain('R/content');
  });
});

describe('the generated part of a record', () => {
  it('re-points only an exact path, never a longer one that starts the same', () => {
    const body = `[a](obsidian://orbis-nav?file=b%2Fx.epub&cfi=1) [b](obsidian://orbis-nav?file=b%2Fx.epub2&cfi=1)\n${RECORD_MARKER}\n`;
    const out = relinkGeneratedBody(body, 'b/x.epub', 'b/y.epub');
    expect(out).toContain('file=b%2Fy.epub&cfi=1');
    expect(out).toContain('file=b%2Fx.epub2&cfi=1');
  });

  // With the marker gone the body is the reader's, and Orbis no longer rewrites any of it.
  it('leaves a record whose marker was removed alone', () => {
    const body = '[a](obsidian://orbis-nav?file=b%2Fx.epub&cfi=1)';
    expect(relinkGeneratedBody(body, 'b/x.epub', 'b/y.epub')).toBe(body);
  });
});
