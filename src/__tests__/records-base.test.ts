import { describe, expect, it } from 'vitest';
import { RECORD_TAG } from '../reader/annotation-records';
import { bookRecordsBaseYaml, recordsBaseYaml } from '../reader/records-base';

const yaml = recordsBaseYaml();

/** The lines of one view block, by the view's `name:`. */
function viewBlock(name: string, source: string = yaml): string[] {
  const lines = source.split('\n');
  const start = lines.findIndex((l) => l.trim() === `name: ${name}`);
  expect(start, `no view named ${name}`).toBeGreaterThan(-1);
  const rest = lines.slice(start + 1);
  const next = rest.findIndex((l) => l.startsWith('  - type:'));
  return next === -1 ? rest : rest.slice(0, next);
}

const columnsOf = (name: string, source: string = yaml): string[] => {
  const block = viewBlock(name, source);
  const at = block.findIndex((l) => l.trim() === 'order:');
  // Bounded at the next view key — `sort:` entries are also `      - ` lines, so an unbounded filter collects
  // `- property: cfi_sort` as though it were a column.
  const after = block.slice(at + 1);
  const end = after.findIndex((l) => /^ {4}\w+:/.test(l));
  return (end === -1 ? after : after.slice(0, end)).map((l) => l.replace('      - ', ''));
};

/** Each of these is generated twice, `(list)` then `(table)`. */
const BASE_NAMES = [
  'All selections',
  'Selections with a mark',
  'Bookmarks',
  'Passage selections',
  'Passage selections by mark',
  'Notes',
  'Notes by mark',
  'Notes without a mark',
  'Recently added',
  'All selections and bookmarks',
];
const TABLE_VIEWS = BASE_NAMES.map((n) => `${n} (table)`);
const LIST_VIEWS = BASE_NAMES.map((n) => `${n} (list)`);
const VIEW_NAMES = [...TABLE_VIEWS, ...LIST_VIEWS];
const BOOK_VIEW_NAMES = VIEW_NAMES;

describe('the generated base', () => {
  it('filters on the tag, not a folder, so it covers books exported later', () => {
    // Against the constant, not a literal: the tag has been renamed once already, and a base that filters on a
    // tag no note carries shows nothing — silently, since an empty view looks like a book with no records.
    expect(yaml).toContain(`- file.hasTag("${RECORD_TAG}")`);
  });

  it('excludes orphans at the BASE level, so no view can forget to', () => {
    // Twenty views is twenty chances to miss one. `orphaned` is written on every record precisely so this
    // comparison is definite rather than depending on how Bases treats a missing value.
    expect(yaml).toContain('    - orphaned != true');
    expect(bookRecordsBaseYaml('R/content/fo')).toContain('    - orphaned != true');
    for (const name of VIEW_NAMES) expect(viewBlock(name).join('\n'), name).not.toContain('orphaned');
  });

  it('puts filters, properties and views in the order Obsidian canonicalizes to', () => {
    const at = (key: string) => yaml.indexOf(`\n${key}:`);
    expect(yaml.startsWith('filters:')).toBe(true);
    expect(at('properties')).toBeLessThan(at('views'));
  });
});

describe('the Open formula', () => {
  it('builds an anchor from the bare URL, because markdown renders in tables only', () => {
    expect(yaml).toContain('  Open: html("<a href=');
    expect(yaml).toContain('escapeHTML(link_url)');
  });

  it('escapes the href, since the URL carries & separators', () => {
    expect(yaml).not.toMatch(/href='" \+ link_url/);
  });

  it('is used by exactly the layouts that need it', () => {
    // Tables use `link` instead, because it reads "loc. 51" — which says where you are going, as "↗ Open" does
    // not. A list has no choice: markdown does not render there.
    for (const name of TABLE_VIEWS) expect(columnsOf(name), name).not.toContain('formula.Open');
    for (const name of LIST_VIEWS) expect(columnsOf(name), name).toContain('formula.Open');
  });
});

describe('property names and the note. prefix', () => {
  it('prefixes the properties registry, which Obsidian requires there', () => {
    expect(yaml).toContain('  note.book_title:\n    displayName: Book');
  });

  it('does NOT prefix order, groupBy or sort, which Obsidian requires bare', () => {
    for (const line of yaml.split('\n')) {
      // The formula body references properties bare too, and is not a column entry.
      if (line.startsWith('  Open:')) continue;
      if (line.startsWith('      - ') || line.trim().startsWith('property:')) {
        expect(line, line).not.toContain('note.');
      }
    }
  });

  it('names every column it shows, so no header reads as a raw property', () => {
    const named = new Set(
      yaml
        .split('\n')
        .filter((l) => l.startsWith('  note.'))
        .map((l) => l.trim().replace('note.', '').replace(':', ''))
    );
    // A formula column is labeled by its own key in `formulas:`, not by the `note.` registry.
    for (const name of VIEW_NAMES) {
      for (const col of columnsOf(name).filter((c) => !c.startsWith('formula.'))) {
        expect(named, col).toContain(col);
      }
    }
  });
});

describe('every view', () => {
  it('sorts into reading order, with both keys hidden', () => {
    for (const name of VIEW_NAMES) {
      const block = viewBlock(name).join('\n');
      expect(block).toContain('property: chapter_index');
      expect(block).toContain('property: cfi_sort');
      // A sort key does not have to be a column, and these two must not be: one is opaque, the other reads
      // as wrong (Chapter I is index 3).
      expect(columnsOf(name)).not.toContain('chapter_index');
      expect(columnsOf(name)).not.toContain('cfi_sort');
    }
  });

  it('ends with a link column the layout can actually render', () => {
    // Markdown renders in a table cell and nowhere else, so a list needs the html() formula. One or the other,
    // never both — together they put the raw CFI directly above the working link.
    for (const name of TABLE_VIEWS) expect(columnsOf(name).at(-1), name).toBe('link');
    for (const name of LIST_VIEWS) {
      expect(columnsOf(name).at(-1), name).toBe('formula.Open');
      expect(columnsOf(name), name).not.toContain('link');
    }
  });

  it('sizes the excerpt column only on a table that has one', () => {
    // A bookmarks view has no excerpt — a bookmark has no passage — and a list has no columns to size at all.
    expect(viewBlock('Bookmarks (table)').join('\n')).not.toContain('columnSize');
    for (const name of LIST_VIEWS) expect(viewBlock(name).join('\n'), name).not.toContain('columnSize');
    expect(viewBlock('Passage selections (table)').join('\n')).toContain('columnSize');
  });

  it('never gives a list more properties than its table', () => {
    // Each becomes its own indented line, so a list is the layout that suffers from a long set. How many is a
    // per-view judgment; that a list never exceeds its own table is the invariant.
    for (const base of BASE_NAMES) {
      const list = columnsOf(`${base} (list)`).length;
      const table = columnsOf(`${base} (table)`).length;
      expect(list, base).toBeLessThanOrEqual(table);
    }
  });

  it('indents list properties, without which they read as a wall', () => {
    for (const name of LIST_VIEWS) expect(viewBlock(name).join('\n'), name).toContain('indentProperties: true');
  });

  it('never shows the property it groups by, which the group header already carries', () => {
    for (const name of VIEW_NAMES) {
      const groupBy = viewBlock(name)
        .find((l) => l.trim().startsWith('property:'))
        ?.trim()
        .replace('property: ', '');
      expect(columnsOf(name), `${name} groups by ${groupBy}`).not.toContain(groupBy);
    }
  });

  it('widens the excerpt column, which cut after six words at the default', () => {
    for (const name of TABLE_VIEWS.filter((n) => columnsOf(n).includes('excerpt'))) {
      expect(viewBlock(name).join('\n'), name).toContain('      excerpt: 400');
    }
  });
});

describe('YAML style', () => {
  it('uses block lists, the canonical form, so the file is not rewritten on first open', () => {
    expect(yaml).not.toMatch(/order:\s*\[/);
    expect(yaml).not.toMatch(/\{\s*property:/);
  });

  it('ends with a single trailing newline', () => {
    expect(yaml.endsWith('\n')).toBe(true);
    expect(yaml.endsWith('\n\n')).toBe(false);
  });
});

describe('a per-book base', () => {
  const folder = 'Reading records/content/First-Open';
  const book = bookRecordsBaseYaml(folder);

  it('filters on the folder, not the title', () => {
    // Two copies of one book report the SAME book_title — it comes from the epub, not the path — so a title
    // filter would not separate them at all. The folder is ours and survives a metadata edit.
    expect(book).toContain(`- file.inFolder("${folder}")`);
    expect(book).not.toContain('book_title ==');
  });

  it('still filters on the tag, so a stray note in the folder is not picked up', () => {
    expect(book).toContain(`- file.hasTag("${RECORD_TAG}")`);
  });

  it('groups by chapter, which only makes sense for one book', () => {
    // Globally this would interleave every book's Chapter I, which is why the two bases cannot share views.
    expect(viewBlock('Notes (table)', book).join('\n')).toContain('property: chapter');
  });

  it('drops book_title everywhere, the same value on every row', () => {
    for (const name of BOOK_VIEW_NAMES) expect(columnsOf(name, book), name).not.toContain('book_title');
  });

  it('inverts the no-duplicate-column rule for its chapter-grouped views', () => {
    // The group header carries the grouped value, so `chapter` is a column everywhere EXCEPT the views that
    // group by it — which per book is most of them.
    expect(columnsOf('Notes (table)', book)).not.toContain('chapter');
    expect(columnsOf('Notes by mark (table)', book)).toContain('chapter');
  });

  it('sorts into reading order like the global one', () => {
    for (const name of BOOK_VIEW_NAMES) {
      expect(viewBlock(name, book).join('\n'), name).toContain('property: cfi_sort');
    }
  });
});

describe('the kind-split views', () => {
  it('gives each kind its own view instead of filtering bookmarks out of a shared one', () => {
    // A bookmark never has a mark, so in a shared "by mark" view it lands in the empty-mark group beside the
    // notes that legitimately have none — making that group the largest and least useful thing in the base.
    expect(viewBlock('Bookmarks (table)').join('\n')).toContain('- kind == "bookmark"');
    expect(viewBlock('Notes (table)').join('\n')).toContain('- kind == "note"');
    expect(viewBlock('Passage selections (table)').join('\n')).toContain('- kind == "passage selection"');
  });

  it('groups bookmarks by position only — they cannot be grouped by a mark they never have', () => {
    const byMark = BASE_NAMES.filter((n) => n.endsWith('by mark'));
    expect(byMark).toEqual(['Passage selections by mark', 'Notes by mark']);
  });

  it('keeps bookmarks out of every mark-based view, since they never carry one', () => {
    expect(viewBlock('Selections with a mark (table)').join('\n')).toContain('- kind != "bookmark"');
    // The notes triage view excludes them by filtering to notes, which is stricter.
    expect(viewBlock('Notes without a mark (table)').join('\n')).toContain('- kind == "note"');
  });

  it('never shows the kind it has already filtered to', () => {
    for (const base of ['Bookmarks', 'Passage selections', 'Notes', 'Notes by mark']) {
      for (const name of [`${base} (table)`, `${base} (list)`]) {
        expect(columnsOf(name), name).not.toContain('kind');
      }
    }
  });

  it('slices on whether a mark is applied, which is the axis that matters', () => {
    // Not on whether a selection exists: every note is created from one, so every record that is not a bookmark
    // IS a selection.
    const withMark = viewBlock('Selections with a mark (table)').join('\n');
    expect(withMark).toContain('- kind != "bookmark"');
  });

  it('QUOTES a filter starting with !, which YAML would otherwise read as a tag', () => {
    // Unquoted, `- !mark.isEmpty()` is a YAML TAG and never reaches Bases as a filter — the view rendered zero
    // results with no error anywhere.
    expect(yaml).toContain('- "!mark.isEmpty()"');
    expect(yaml).not.toMatch(/^\s+- !\w/m);
  });

  it('names the triage view for notes, and filters it to notes', () => {
    // Every markless record IS a note: one can be saved without a mark, while a passage selection is created by
    // tapping one. The old carve-out — the remap dialog's "Leave unmarked" — was removed with that option.
    const block = viewBlock('Notes without a mark (table)').join('\n');
    expect(block).toContain('- kind == "note"');
    expect(block).toContain('- mark.isEmpty()');
  });

  it('opens on a list, because that is the layout that is readable everywhere', () => {
    // Obsidian has no per-device view setting, so both layouts must exist for a phone to pick one.
    const first = yaml
      .split('\n')
      .find((l) => l.trim().startsWith('name: '))
      ?.trim()
      .slice(6);
    expect(first).toBe('All selections (list)');
    expect(yaml.indexOf('  - type: list')).toBeLessThan(yaml.indexOf('  - type: table'));
  });

  it('ends on the only view a bookmark reaches', () => {
    expect(BASE_NAMES.at(-1)).toBe('All selections and bookmarks');
    expect(viewBlock('All selections and bookmarks (table)').join('\n')).not.toContain('filters:');
  });

  it('keeps the three notes views together', () => {
    const notes = BASE_NAMES.indexOf('Notes');
    expect(BASE_NAMES.slice(notes, notes + 3)).toEqual(['Notes', 'Notes by mark', 'Notes without a mark']);
  });

  it('shows what you wrote, in every view a note can appear in', () => {
    for (const base of [
      'Notes',
      'Notes by mark',
      'Notes without a mark',
      'All selections',
      'All selections and bookmarks',
    ]) {
      for (const name of [`${base} (table)`, `${base} (list)`]) {
        expect(columnsOf(name), name).toContain('note_text');
      }
    }
    expect(yaml).toContain('  note.note_text:\n    displayName: Note');
  });

  it('gives a global bookmarks list the chapter, without which it is bare dates', () => {
    expect(columnsOf('Bookmarks (list)')).toContain('chapter');
    // Per book the group header IS the chapter, so repeating it would be the duplicate.
    expect(columnsOf('Bookmarks (list)', bookRecordsBaseYaml('R/content/fo'))).not.toContain('chapter');
  });

  it('ships no cards view, because a record is not a book', () => {
    // One row per note means eighteen records render eighteen cards, every one carrying the same cover. Column
    // choices change what is on a card, never how many there are.
    expect(yaml).not.toContain('type: cards');
    expect(yaml).not.toContain('image: note.cover');
  });

  it('groups by book globally and by chapter per book', () => {
    // "By chapter" cannot mean the same thing at both scopes: grouping forty books by chapter interleaves every
    // book's Chapter I.
    expect(viewBlock('Notes (table)').join('\n')).toContain('property: book_title');
    expect(viewBlock('Notes (table)', bookRecordsBaseYaml('R/content/fo')).join('\n')).toContain('property: chapter');
  });
});
