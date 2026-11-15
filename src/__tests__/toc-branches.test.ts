// What a chapter is, in a dialog that picks between them.
//
// Every contents entry at every depth is, on an ordinary EPUB, the same list — Gutenberg's nav is flat — but a book
// converted from a folder of notes is not: Orbis's own markdown converter writes a nav entry per heading, so a few
// dozen documents would become hundreds of rows with no way to reconcile them against the contents panel's tree.
//
// The rows are documents, and a row owns its subtree. **That second half is not cosmetic**, which is what
// most of these assert: both surfaces USE the selection to decide what gets written, so a row naming only its
// own href would export a document's first paragraph and drop the rest, and would tick "Roadmap" while matching
// none of the notes filed under its phases.

import { describe, expect, it } from 'vitest';
import {
  flattenTocWithDisambiguation,
  groupByTopLevel,
  markTocSections,
  selectedBranchCount,
  type TocItemLike,
  topLevelChapters,
} from '../toc-utils';

/** The shape Orbis's own folder→EPUB conversion produces: a document per file, its `##` headings beneath it. */
const DESIGN_DOCS: TocItemLike[] = [
  {
    label: 'Orbis Reader — Design Documentation',
    href: 'index.xhtml',
    subitems: [
      { label: 'Project', href: 'index.xhtml#project' },
      { label: 'Architecture', href: 'index.xhtml#architecture' },
      { label: 'Tooling', href: 'index.xhtml#tooling' },
    ],
  },
  {
    label: 'Plugin Architecture Overview',
    href: 'plugin-architecture.xhtml',
    subitems: [
      { label: 'Source layout', href: 'plugin-architecture.xhtml#source-layout' },
      { label: 'Plugin lifecycle', href: 'plugin-architecture.xhtml#plugin-lifecycle' },
    ],
  },
  {
    label: 'Orbis Reader — Roadmap',
    href: 'roadmap.xhtml',
    subitems: [
      { label: 'What is open', href: 'roadmap.xhtml#what-is-open' },
      { label: 'Phase 5: Pre-submission', href: 'roadmap.xhtml#phase-5' },
    ],
  },
];

describe('topLevelChapters', () => {
  it('lists the documents, not their headings', () => {
    const branches = topLevelChapters(DESIGN_DOCS);
    expect(branches.map((b) => b.label)).toEqual([
      'Orbis Reader — Design Documentation',
      'Plugin Architecture Overview',
      'Orbis Reader — Roadmap',
    ]);
  });

  /** The whole reason this exists: selecting Roadmap has to carry the phases, or nothing under them is written. */
  it('owns its subtree, head first and in contents order', () => {
    const roadmap = topLevelChapters(DESIGN_DOCS)[2];
    expect(roadmap.hrefs).toEqual(['roadmap.xhtml', 'roadmap.xhtml#what-is-open', 'roadmap.xhtml#phase-5']);
  });

  it('carries every descendant however deep', () => {
    const deep: TocItemLike[] = [
      {
        label: 'Part One',
        href: 'a.xhtml',
        subitems: [
          {
            label: 'Chapter',
            href: 'a.xhtml#ch',
            subitems: [{ label: 'A sub-section', href: 'a.xhtml#ch-sub' }],
          },
        ],
      },
    ];
    expect(topLevelChapters(deep)[0].hrefs).toEqual(['a.xhtml', 'a.xhtml#ch', 'a.xhtml#ch-sub']);
  });

  /**
   * **A flat contents page is untouched**: every entry is top level and owns only itself, so the selection is exactly
   * the entries ticked.
   */
  it('leaves a flat contents page exactly as it was', () => {
    const flat: TocItemLike[] = [
      { label: 'CHAPTER I', href: 'c1.xhtml' },
      { label: 'CHAPTER II', href: 'c2.xhtml' },
      { label: 'CHAPTER III', href: 'c3.xhtml' },
    ];
    const branches = topLevelChapters(flat);
    expect(branches).toHaveLength(3);
    expect(branches.map((b) => b.hrefs)).toEqual([['c1.xhtml'], ['c2.xhtml'], ['c3.xhtml']]);
  });

  it('answers an empty contents page with an empty list', () => {
    expect(topLevelChapters([])).toEqual([]);
  });

  /** The label a row shows is the disambiguated one, so a picker reads the same as the contents panel — a book
   *  with "CHAPTER I" in two parts must not show the same words twice in the one control that tells them apart. */
  it('uses the disambiguated label', () => {
    const repeated: TocItemLike[] = [
      { label: 'PART I', href: 'p1.xhtml', subitems: [{ label: 'CHAPTER I', href: 'p1.xhtml#c1' }] },
      { label: 'PART II', href: 'p2.xhtml', subitems: [{ label: 'CHAPTER I', href: 'p2.xhtml#c1' }] },
    ];
    const branches = topLevelChapters(repeated);
    // The parts themselves are unique, so they read plainly; the collision is among their children, which are
    // not rows — the point here is that the head takes its label from the same flattening as everything else.
    expect(branches.map((b) => b.displayLabel)).toEqual(['PART I', 'PART II']);
  });

  /** A nav where a top-level entry has no children of its own, beside ones that do. */
  it('handles a mixed contents page', () => {
    const mixed: TocItemLike[] = [
      { label: 'Cover', href: 'cover.xhtml' },
      { label: 'Body', href: 'body.xhtml', subitems: [{ label: 'A heading', href: 'body.xhtml#h' }] },
    ];
    expect(topLevelChapters(mixed).map((b) => b.hrefs)).toEqual([['cover.xhtml'], ['body.xhtml', 'body.xhtml#h']]);
  });
});

describe('selecting a branch', () => {
  /** How both dialogs build and test the selection: whole subtrees in, head tested. */
  const selectionFor = (labels: string[]): Set<string> =>
    new Set(
      topLevelChapters(DESIGN_DOCS)
        .filter((b) => labels.includes(b.label))
        .flatMap((b) => b.hrefs)
    );

  it('includes every href under the chosen document and none from the others', () => {
    const chosen = selectionFor(['Orbis Reader — Roadmap']);
    expect(chosen.has('roadmap.xhtml')).toBe(true);
    expect(chosen.has('roadmap.xhtml#phase-5')).toBe(true);
    expect(chosen.has('roadmap.xhtml#what-is-open')).toBe(true);
    expect(chosen.has('plugin-architecture.xhtml')).toBe(false);
    expect(chosen.has('plugin-architecture.xhtml#source-layout')).toBe(false);
  });

  /** The head is present exactly when the branch is, which is what lets a row test one href to know if it is
   *  ticked. */
  it('always contains the head, so a row can test just that', () => {
    for (const branch of topLevelChapters(DESIGN_DOCS)) {
      const chosen = selectionFor([branch.label]);
      expect(chosen.has(branch.href)).toBe(true);
    }
  });

  it('selects nothing when nothing is chosen', () => {
    expect(selectionFor([]).size).toBe(0);
  });
});

/**
 * **What a picker's header counts.** The size of the href set, which holds a whole subtree per row, shown against
 * the number of rows puts two units in one sentence. Both dialogs count rows through `selectedBranchCount`.
 */
describe('selectedBranchCount', () => {
  const branches = topLevelChapters(DESIGN_DOCS);
  /** Everything ticked — the state both dialogs open in, and where the two units differ most. */
  const all = new Set(branches.flatMap((b) => b.hrefs));

  it('counts rows, not the hrefs beneath them', () => {
    // The trap in one line: the set is bigger than the list it describes.
    expect(all.size).toBeGreaterThan(branches.length);
    expect(selectedBranchCount(branches, all)).toBe(branches.length);
  });

  it('never exceeds the total it is shown against', () => {
    expect(selectedBranchCount(branches, all)).toBeLessThanOrEqual(branches.length);
  });

  it('counts one row when one document is chosen', () => {
    const roadmap = branches.find((b) => b.label === 'Orbis Reader — Roadmap');
    expect(selectedBranchCount(branches, new Set(roadmap?.hrefs))).toBe(1);
  });

  it('counts none for an empty selection', () => {
    expect(selectedBranchCount(branches, new Set())).toBe(0);
  });

  /**
   * A leftover descendant href with its head removed must count as zero, not one. This is why the rule tests the
   * head rather than "any descendant" — the head is present exactly when the row is ticked.
   */
  it('does not count a row on the strength of a stray descendant href', () => {
    expect(selectedBranchCount(branches, new Set(['roadmap.xhtml#phase-5']))).toBe(0);
  });
});

/**
 * **Folding a flat run of entries back into chapters.** Notes are filed under the DEEPEST matching entry, so a
 * generated note grouped by that key alone is a run of subheadings with nothing saying which document each came
 * from — see `groupByTopLevel`.
 */
describe('groupByTopLevel', () => {
  const flat = flattenTocWithDisambiguation(DESIGN_DOCS);

  it('puts every entry under the document it belongs to', () => {
    const groups = groupByTopLevel(flat, DESIGN_DOCS);
    expect(groups.map((g) => g.chapter.label)).toEqual([
      'Orbis Reader — Design Documentation',
      'Plugin Architecture Overview',
      'Orbis Reader — Roadmap',
    ]);
    expect(groups[2].sections.map((s) => s.label)).toEqual(['What is open', 'Phase 5: Pre-submission']);
  });

  /** The chapter is never also one of its own sections, or its marks would be written twice. */
  it('never lists a chapter among its own sections', () => {
    for (const group of groupByTopLevel(flat, DESIGN_DOCS)) {
      expect(group.sections.map((s) => s.href)).not.toContain(group.chapter.href);
    }
  });

  /** The ordinary case: a chapter is annotated under its headings and never on the document itself. */
  it('still yields the chapter when only its subheadings were listed', () => {
    const subsOnly = flat.filter((e) => e.href.includes('#'));
    const groups = groupByTopLevel(subsOnly, DESIGN_DOCS);
    expect(groups).toHaveLength(3);
    expect(groups[0].chapter.label).toBe('Orbis Reader — Design Documentation');
    expect(groups[0].sections).toHaveLength(3);
  });

  it('keeps the order it was given', () => {
    const groups = groupByTopLevel(
      flat.filter((e) => e.href.startsWith('roadmap') || e.href.startsWith('index')),
      DESIGN_DOCS
    );
    expect(groups.map((g) => g.chapter.href)).toEqual(['index.xhtml', 'roadmap.xhtml']);
  });

  /** A flat contents page: one group per entry, no sections. */
  it('leaves a flat contents page as one chapter per entry', () => {
    const items: TocItemLike[] = [
      { label: 'CHAPTER I', href: 'c1.xhtml' },
      { label: 'CHAPTER II', href: 'c2.xhtml' },
    ];
    const groups = groupByTopLevel(flattenTocWithDisambiguation(items), items);
    expect(groups.map((g) => g.chapter.label)).toEqual(['CHAPTER I', 'CHAPTER II']);
    expect(groups.every((g) => g.sections.length === 0)).toBe(true);
  });

  /**
   * The uncategorized bucket, and an href the format could not place. Filing them under a chapter they are not
   * part of would be a claim the book never made, so each gets a heading of its own.
   */
  it('gives an entry outside the contents page its own chapter', () => {
    const groups = groupByTopLevel([{ href: '', label: 'Uncategorized', displayLabel: 'Uncategorized' }], DESIGN_DOCS);
    expect(groups).toEqual([
      { chapter: { href: '', label: 'Uncategorized', displayLabel: 'Uncategorized' }, sections: [] },
    ]);
  });

  it('answers an empty list with no groups', () => {
    expect(groupByTopLevel([], DESIGN_DOCS)).toEqual([]);
  });
});

describe('an entry that contains chapters', () => {
  /** A tree whose entries name their file: `f2.xhtml#x` is in section 2. */
  const tree = (items: TocItemLike[]): TocItemLike[] => {
    markTocSections(items, (href) => Number(/f(\d+)/.exec(href)?.[1] ?? -1));
    return items;
  };

  it('opens into its chapters when they are files of their own, keeping a row of its own', () => {
    const rows = topLevelChapters(
      tree([
        { label: 'Title page', href: 'f0.xhtml' },
        {
          label: 'SAMPLE BOOK',
          href: 'f1.xhtml#t',
          subitems: [
            { label: 'A QUIET HARBOR', href: 'f1.xhtml#c1' },
            { label: 'WREN’S TURN', href: 'f2.xhtml#c2' },
          ],
        },
      ])
    );
    expect(rows.map((r) => r.label)).toEqual(['Title page', 'SAMPLE BOOK', 'A QUIET HARBOR', 'WREN’S TURN']);
    // Its own row is only its own stretch; each chapter owns its own.
    expect(rows[1].hrefs).toEqual(['f1.xhtml#t']);
  });

  it('stays one row when its children are headings in its own file — a converted note', () => {
    const rows = topLevelChapters(
      tree([
        {
          label: 'README',
          href: 'f0.xhtml',
          subitems: [
            { label: 'Install', href: 'f0.xhtml#install' },
            { label: 'Use', href: 'f0.xhtml#use' },
          ],
        },
      ])
    );
    expect(rows.map((r) => r.label)).toEqual(['README']);
    expect(rows[0].hrefs).toEqual(['f0.xhtml', 'f0.xhtml#install', 'f0.xhtml#use']);
  });

  it('never opens for one child, or where a file cannot be named', () => {
    const one = tree([{ label: 'NOTE A.', href: 'f0.xhtml', subitems: [{ label: 'a', href: 'f1.xhtml' }] }]);
    expect(topLevelChapters(one).map((r) => r.label)).toEqual(['NOTE A.']);
    const unknown = tree([
      {
        label: 'Part',
        href: 'kindle:pos:fid:0001',
        subitems: [
          { label: 'a', href: 'kindle:pos:fid:0002' },
          { label: 'b', href: 'kindle:pos:fid:0003' },
        ],
      },
    ]);
    expect(topLevelChapters(unknown).map((r) => r.label)).toEqual(['Part']);
  });

  it('opens an omnibus all the way down, and keeps two novels’ chapters apart by name', () => {
    const novel = (name: string, n: number): TocItemLike => ({
      label: name,
      href: `f${n}.xhtml`,
      subitems: [
        { label: 'Chapter 1', href: `f${n + 1}.xhtml` },
        { label: 'Chapter 2', href: `f${n + 2}.xhtml` },
      ],
    });
    const rows = topLevelChapters(tree([novel('Sample Book', 0), novel('Sample Book Two', 10)]));
    expect(rows.map((r) => r.label)).toEqual([
      'Sample Book',
      'Chapter 1',
      'Chapter 2',
      'Sample Book Two',
      'Chapter 1',
      'Chapter 2',
    ]);
    // The display names are the qualified ones, so the two "Chapter 1"s read as two chapters.
    expect(new Set(rows.map((r) => r.displayLabel)).size).toBe(6);
  });
});
