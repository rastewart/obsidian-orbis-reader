// The starting `.base` views for reading records: pure text, no I/O.
//
// Separate from `RecordExporter` because this YAML is the most fact-dense thing in the feature — half of it
// encodes behavior that is not in Obsidian's published key list and is verified by testing against a real vault.
// A pure builder means those facts are pinned by tests rather than by having got a screenshot right once.
//
// See docs/design/reading-records.md §Bases syntax, as verified.

import { RECORD_TAG, type RecordKind } from './annotation-records';

/**
 * Headers, because a raw property name reads as machine output — a column headed `book_title` announces that
 * you are looking at the plugin's internals rather than at your reading.
 *
 * `properties` is a base-wide registry at the TOP level, not per view, and its keys carry the `note.` prefix —
 * unlike `order`, `groupBy` and `sort`, which must not. That asymmetry is Obsidian's, not ours.
 *
 * The group header uses the same names, which is why `book_title` and `created` are here despite never being
 * columns: a grouped view labels each group with the property it grouped on.
 *
 * `excerpt` is "Excerpt" and not yet "Selection". The vocabulary change lands with the `kind` rename; until
 * then a table headed "Selection" beside a `kind` column reading `highlight` would speak both dialects at once.
 */
const DISPLAY_NAMES: Readonly<Record<string, string>> = {
  excerpt: 'Excerpt',
  book_title: 'Book',
  chapter: 'Chapter',
  mark: 'Mark',
  kind: 'Kind',
  created: 'Created',
  note_text: 'Note',
  link: 'Location',
};

/**
 * A ready-made one-click link for the layouts where the `link` column cannot work.
 *
 * Markdown in a property renders in a **table** cell and nowhere else — a list or cards view shows the raw
 * string, and a percent-encoded CFI is the ugliest thing that could land in a row. An `html()` formula renders
 * in all three, which is why `link_url` exists: a formula has to build an `href`, and that cannot be recovered
 * from a markdown link.
 *
 * Defined but used by no shipped view, deliberately. The three starting views are tables, where the `link`
 * column is better — it reads "loc. 51" rather than a generic verb. This is here so that switching a view to
 * List or Cards is a one-line edit rather than a research project.
 *
 * `escapeHTML` because the URL's `&` separators belong as `&amp;` inside an attribute. **Never** interpolate
 * `excerpt` into a formula like this without it: book text is untrusted input, and a passage containing `<`
 * would inject into the cell.
 */
const OPEN_FORMULA = 'html("<a href=\'" + escapeHTML(link_url) + "\'>↗ Open</a>")';

/** Wide enough that two nearby passages are told apart. At the default width the excerpt cuts after six words,
 *  which is not always enough to know which highlight a row is. */
const EXCERPT_WIDTH = 400;

interface RecordView {
  name: string;
  groupBy: string;
  direction: 'ASC' | 'DESC';
  /** Table columns, in order. The link column is appended by layout — never list it here. */
  order: readonly string[];
  /**
   * The list variant's properties. Shorter on purpose: a list renders each on its own indented line, so a
   * table's five columns become five lines per row and the set reads as a wall.
   *
   * Defaults to the first two of `order` — usually the position and the passage, which is what identifies a row.
   */
  list?: readonly string[];
  /** Narrow to one kind, on top of the base's own filter. */
  kind?: RecordKind;
  /** Extra filter lines, for the views that slice on something other than kind. */
  filters?: readonly string[];
}

type Layout = 'table' | 'list';

/**
 * The link column a layout can actually render.
 *
 * Markdown in a property renders in a **table** cell and nowhere else, so `link` in a list shows a line of raw
 * percent-encoded CFI. An `html()` formula renders in both. A view gets one or the other, never both — together
 * they put the raw string directly above the working link.
 *
 * Tables prefer `link` because it reads "loc. 51", which says where you are going; `↗ Open` does not.
 */
const navColumn = (layout: Layout): string => (layout === 'list' ? 'formula.Open' : 'link');

/**
 * Every view twice, list first.
 *
 * **Obsidian has no per-device view setting**, so a phone and a desktop cannot each prefer a layout unless both
 * layouts exist to be chosen. A five-column table on a phone either scrolls sideways or crushes every column; a
 * list stacks and stays legible. A list on a desktop wastes the width a table earns. Neither is right for both,
 * so ship both and let each device settle.
 *
 * List first, and therefore the view the base opens on, because that is the one that is at least readable
 * everywhere. The suffix keeps the pair adjacent in the view picker, which has a search box — twenty views one
 * keystroke apart beats ten that are wrong on half your devices.
 */
function withLayouts(views: readonly RecordView[]): { view: RecordView; layout: Layout; name: string }[] {
  return views.flatMap((view) => [
    { view, layout: 'list', name: `${view.name} (list)` },
    { view, layout: 'table', name: `${view.name} (table)` },
  ]);
}

/**
 * Every selection, whatever kind and whether or not it carries a mark.
 *
 * "Not a bookmark" IS "is a selection": every note is created from a selection, so the only thing that is not one
 * is a bookmark — **a place, not a selection.** Which is also why the axis worth slicing on is whether a MARK is
 * applied, not whether a selection exists.
 *
 * **No view lists the property it groups by** — the group header already shows that value, so a `mark` column in
 * a mark-grouped view is one string repeated down the group.
 */
function allSelectionsView(position: 'chapter' | 'book_title'): RecordView {
  // First, so it is what the base opens on: bookmarks are positional noise when you are looking at content.
  return {
    name: 'All selections',
    groupBy: position,
    direction: 'ASC',
    order: [...(position === 'chapter' ? [] : ['chapter']), 'excerpt', 'note_text', 'mark', 'kind'],
    list: ['excerpt', 'note_text', 'mark', 'kind'],
    filters: ['kind != "bookmark"'],
  };
}

/**
 * Everything you have classified, grouped by the mark you gave it.
 *
 * Second, right after `All selections`, because "what have I marked" is the question the mark bar exists to let
 * you ask. Its complement is the notes triad's `Notes without a mark`, not a mirror of this view.
 */
function withMarkView(position: 'chapter' | 'book_title'): RecordView {
  return {
    name: 'Selections with a mark',
    groupBy: 'mark',
    direction: 'ASC',
    order: [...(position === 'chapter' ? [] : ['chapter']), 'excerpt', 'kind'],
    list: ['excerpt'],
    filters: ['kind != "bookmark"', '!mark.isEmpty()'],
  };
}

/** Everything, bookmarks included — last, because it is where you go when something is missing elsewhere. The
 *  name names both halves, because a bookmark is the ONLY thing distinguishing it from `All selections`. */
const allView = (position: 'chapter' | 'book_title'): RecordView => ({
  name: 'All selections and bookmarks',
  groupBy: position,
  direction: 'ASC',
  order: [...(position === 'chapter' ? [] : ['chapter']), 'excerpt', 'note_text', 'mark', 'kind'],
  list: ['excerpt', 'note_text', 'mark', 'kind'],
});

const recentView = (position: 'chapter' | 'book_title'): RecordView => ({
  name: 'Recently added',
  groupBy: 'created',
  direction: 'DESC',
  order: [...(position === 'chapter' ? ['chapter'] : ['book_title', 'chapter']), 'excerpt', 'mark', 'kind'],
  list: ['excerpt', 'kind'],
});

/*
 * No cards view. A Bases view has one row per NOTE, so eighteen records render eighteen cards — and with
 * `image: note.cover` every card in a book's group carries the same picture. Column choices cannot change that;
 * they change what is on a card, never how many there are. On screen it reads as wallpaper.
 *
 * One tile per book would need one NOTE per book — a small index note holding the cover, title, author, counts and
 * a link to that book's base — and then a base over THOSE. That is a different artifact, not a view setting. The
 * `cover` property stays in the schema: it costs nothing and a reader can bind it in a view of their own.
 */

const GLOBAL_VIEWS: readonly RecordView[] = [
  allSelectionsView('book_title'),
  withMarkView('book_title'),
  ...perKindViews('book_title'),
  recentView('book_title'),
  allView('book_title'),
];

/**
 * The same three views for ONE book, which cannot share the global definitions.
 *
 * "By chapter" means different things at the two scopes. Globally the views group by `book_title` and sort
 * `chapter_index` within it, because grouping by chapter across forty books interleaves every book's Chapter I.
 * Here there is one book, so `chapter` is the grouping — and that inverts the no-duplicate-column rule: the
 * chapter column becomes the string repeated down each group, so it comes out, while `book_title` is dropped for
 * being the same value on every row.
 */
const BOOK_VIEWS: readonly RecordView[] = [
  allSelectionsView('chapter'),
  withMarkView('chapter'),
  ...perKindViews('chapter'),
  recentView('chapter'),
  allView('chapter'),
];

/**
 * The five kind-split views, at whichever scope: one per kind by position, plus the two selection kinds by mark.
 *
 * **Split on `kind` FIRST**, rather than filtering bookmarks out of a shared "by mark" view. A bookmark never has
 * a mark, so in a shared view it lands in the empty-mark group beside the notes that legitimately have none —
 * making that group the largest and least useful thing in the base. Split this way, the empty group in
 * "Notes by mark" means something.
 *
 * Bookmarks get one view, not two: they cannot be grouped by a mark they never have.
 *
 * `position` is what "by chapter" means at this scope — `chapter` for one book, `book_title` globally, because
 * grouping forty books by chapter interleaves every book's Chapter I. The grouped property is never also a
 * column, so it is excluded here rather than listed and removed later.
 */
function perKindViews(position: 'chapter' | 'book_title'): RecordView[] {
  const rest = position === 'chapter' ? [] : ['chapter'];
  const byPosition = (name: string, kind: RecordKind, extra: string[] = [], list?: string[]): RecordView => ({
    name,
    kind,
    groupBy: position,
    direction: 'ASC',
    order: [...rest, 'excerpt', ...extra, 'mark'],
    list,
  });
  const byMark = (name: string, kind: RecordKind, extra: string[] = [], list?: string[]): RecordView => ({
    name,
    kind,
    groupBy: 'mark',
    direction: 'ASC',
    order: ['excerpt', ...extra, ...(position === 'chapter' ? ['chapter'] : ['book_title', 'chapter'])],
    list,
  });
  return [
    // A bookmark has no passage and no useful name of its own — its label is built as "CHAPTER IX. · loc. 51",
    // which is the chapter and location columns over again. So the row IS its position: under chapter headings,
    // a column of clickable locations, which is exactly a bookmark index. `created` earns its place by being the
    // one thing the position does not tell you.
    {
      name: 'Bookmarks',
      kind: 'bookmark',
      groupBy: position,
      direction: 'ASC',
      order: [...rest, 'created'],
      // `rest` is empty per book, where the group header IS the chapter; globally it is the only thing that says
      // where the bookmark is, and a list of bare dates says nothing at all.
      list: [...rest, 'created'],
    },
    byPosition('Passage selections', 'passage selection'),
    byMark('Passage selections by mark', 'passage selection'),
    // `note_text` is what you WROTE, and a view that shows only the passage leaves the thought invisible. Its list
    // variant is the one that reads best: a note is prose, and two long text columns side by side truncate each
    // other where a list stacks them.
    byPosition('Notes', 'note', ['note_text'], ['excerpt', 'note_text']),
    byMark('Notes by mark', 'note', ['note_text'], ['excerpt', 'note_text']),
    // The triage list, and named for exactly what it holds. A note can be SAVED with no mark
    // (`choice: selected ?? selectedColor ?? undefined`), while a passage selection is created BY tapping one — so
    // every markless record is a note. The only other way to reach a markless passage selection is data written
    // before marks existed.
    {
      ...byPosition('Notes without a mark', 'note', ['note_text'], ['excerpt', 'note_text']),
      filters: ['mark.isEmpty()'],
    },
  ];
}

/**
 * Every view sorts into reading order: `chapter_index`, then `cfi_sort`.
 *
 * Including "Recent", where `created` is a date and cannot order within a day.
 *
 * **`sort` is real but undocumented, and generating it is not optional.** The published view keys are `type`,
 * `name`, `limit`, `groupBy`, `filters`, `order` and `summaries`; `order` is COLUMN order and sorts nothing.
 * Sorting looks like a UI-only action, and the docs say only that views "may store additional plugin-specific
 * data". They do: sorting a view writes exactly this. Without it a shipped view arrives unsorted — and an
 * unsorted view's default row order is `file.name`, so the leading word of the filename silently becomes the
 * sort key, which puts every highlight before every note.
 *
 * **Neither key is a column.** `cfi_sort` is an opaque derived string, and `chapter_index` reads as *wrong*
 * when displayed — a Gutenberg novel's Chapter I is index 3, because front matter takes the first entries of
 * the table of contents. Display key visible, sort key hidden, which `sort` being independent of `order` allows.
 */
const SORT_KEYS: readonly string[] = ['chapter_index', 'cfi_sort'];

/**
 * The `.base` file's contents.
 *
 * Property names carry **no `note.` prefix** and lists are block style, because that is the canonical form
 * Obsidian rewrites the file into on first open — matching it means the reader's file is not rewritten under
 * them the moment they look at it. Same reason for the key order: `filters`, `properties`, `views` at the top
 * level, and `type`, `name`, `groupBy`, `order`, `sort`, `columnSize` within a view.
 *
 * Filtering on the TAG rather than the folder is what lets one file cover every book, including books exported
 * later, and keeps working if the reader moves the folder.
 */
export function recordsBaseYaml(): string {
  return baseYaml([`    - file.hasTag("${RECORD_TAG}")`, ...NOT_ORPHANED], GLOBAL_VIEWS);
}

/**
 * At the BASE level, so every view inherits it — a per-view copy would be twenty chances to forget one.
 *
 * `orphaned` is written on every record precisely so this comparison is definite. Were it absent on the normal
 * ones, whether they passed would depend on how Bases treats a missing value in a `!=`.
 *
 * SYMPTOM IF THIS IS WRONG: every view is empty, because live records are being excluded rather than orphans.
 */
const NOT_ORPHANED = ['    - orphaned != true'];

/**
 * One book's base: the same views, filtered to that book's own records folder.
 *
 * **Folder, not `book_title`.** The folder is ours and cannot be broken by an edit to the book's metadata — and
 * two copies of one book report the SAME `book_title`, since it comes from the epub rather than the path, so a
 * title filter would not separate them at all. The global base filters on the tag instead, which survives the
 * reader moving or renaming the records folder; a per-book base cannot, and is regenerable.
 */
export function bookRecordsBaseYaml(contentFolder: string): string {
  return baseYaml(
    [`    - file.hasTag("${RECORD_TAG}")`, `    - file.inFolder("${contentFolder}")`, ...NOT_ORPHANED],
    BOOK_VIEWS
  );
}

/**
 * A filter expression, quoted when YAML would otherwise mangle it.
 *
 * **A scalar beginning with `!` is a YAML TAG**, not a string — so a bare `- !mark.isEmpty()` parses as a tag and
 * never reaches Bases as a filter at all: the view renders zero results with no error anywhere. Obsidian's own
 * output quotes these (`- "!reading_status.isEmpty()"`).
 *
 * Only the `!` case needs it: the others contain double quotes of their own (`kind == "note"`) and are fine bare,
 * which is also the canonical form Obsidian writes them in.
 */
const yamlFilter = (expr: string): string => (expr.startsWith('!') ? `"${expr}"` : expr);

function baseYaml(filters: readonly string[], views: readonly RecordView[]): string {
  const lines: string[] = ['filters:', '  and:', ...filters, 'formulas:', `  Open: ${OPEN_FORMULA}`, 'properties:'];
  for (const [prop, name] of Object.entries(DISPLAY_NAMES)) {
    lines.push(`  note.${prop}:`, `    displayName: ${name}`);
  }
  lines.push('views:');
  for (const { view, layout, name } of withLayouts(views)) {
    const filters = [...(view.kind ? [`kind == "${view.kind}"`] : []), ...(view.filters ?? [])].map(yamlFilter);
    const props = layout === 'list' ? (view.list ?? view.order.slice(0, 2)) : view.order;
    lines.push(
      `  - type: ${layout}`,
      `    name: ${name}`,
      ...(filters.length ? ['    filters:', '      and:', ...filters.map((f) => `        - ${f}`)] : []),
      '    groupBy:',
      `      property: ${view.groupBy}`,
      `      direction: ${view.direction}`,
      '    order:',
      // The link last: it is an action rather than a fact about the passage, and a trailing action is where the
      // eye looks for one.
      ...[...props, navColumn(layout)].map((o) => `      - ${o}`),
      '    sort:',
      ...SORT_KEYS.flatMap((property) => [`      - property: ${property}`, '        direction: ASC']),
      // A list stacks each property on its own line, so a run of them reads as a wall; indenting is the only
      // thing that keeps the properties distinguishable from the excerpt above them.
      ...(layout === 'list' ? ['    indentProperties: true'] : []),
      // Tables only, and only where `excerpt` is a column: a bookmarks view has none, and a list has no columns
      // to size at all. Emitting it anyway is noise in a file the reader reads.
      ...(layout === 'table' && props.includes('excerpt') ? ['    columnSize:', `      excerpt: ${EXCERPT_WIDTH}`] : [])
    );
  }
  return `${lines.join('\n')}\n`;
}
