// A book moved outside Obsidian, recognised as a move.
//
// Obsidian reports a rename only when it performs one itself. A book moved in Finder, a terminal or a sync tool
// reaches the vault as a deletion and a creation — its file watcher sees one path vanish and another appear — in
// either order, a moment apart. Taken at its word, that deletion would throw away every mark, note, position and
// recording the book had. So a deleted book waits a few seconds for a book with the same file name and size to
// appear; one that does is where it went. See docs/design/orbis-data-view.md, §Delete handler.

/** What a deletion and a creation are compared on. The path is where the book is (or was). */
export interface BookFileFacts {
  path: string;
  /** The file name, extension included — a move keeps it, a rename in Finder does not, and that is a deletion. */
  name: string;
  size: number;
}

const sameBook = (a: BookFileFacts, b: BookFileFacts): boolean =>
  a.name === b.name && a.size === b.size && a.path !== b.path;

/**
 * Pairs each deleted book with a created one, within `windowMs` of each other in either order.
 *
 * Creations are only remembered for `windowMs`, so one that arrived first still pairs with a deletion that follows
 * it. The caller should not report creations from Obsidian's own startup, when every file in the vault arrives as
 * one — they would be remembered for nothing.
 */
export class BookMoveMatcher {
  private recent: { facts: BookFileFacts; at: number }[] = [];
  private waiting: { facts: BookFileFacts; settle: (to: string | null) => void }[] = [];

  constructor(
    private readonly windowMs: number,
    private readonly now: () => number = Date.now
  ) {}

  /** A book file appeared. Settles the deletion waiting for it, or is remembered for one still to come. */
  created(facts: BookFileFacts): void {
    const waiter = this.waiting.find((w) => sameBook(w.facts, facts));
    if (waiter) {
      this.waiting = this.waiting.filter((w) => w !== waiter);
      waiter.settle(facts.path);
      return;
    }
    this.forgetOld();
    this.recent.push({ facts, at: this.now() });
  }

  /** A book file went. Resolves to where it went, or `null` once `windowMs` passes with nothing to match it. */
  deleted(facts: BookFileFacts): Promise<string | null> {
    this.forgetOld();
    const earlier = this.recent.find((r) => sameBook(r.facts, facts));
    if (earlier) {
      this.recent = this.recent.filter((r) => r !== earlier);
      return Promise.resolve(earlier.facts.path);
    }
    return new Promise((resolve) => {
      const entry = {
        facts,
        settle: (to: string | null) => {
          window.clearTimeout(timer);
          resolve(to);
        },
      };
      const timer = window.setTimeout(() => {
        this.waiting = this.waiting.filter((w) => w !== entry);
        resolve(null);
      }, this.windowMs);
      this.waiting.push(entry);
    });
  }

  private forgetOld(): void {
    const cutoff = this.now() - this.windowMs;
    this.recent = this.recent.filter((r) => r.at >= cutoff);
  }
}
