// A FictionBook 2 writer for the generated fixtures.
//
// FB2 is one XML file: the description (title-info, document-info, publish-info) that `src/library/fb2.ts` reads for
// the Library, a body of titled sections that foliate renders, an optional notes body, and the cover as a base64
// `<binary>`.

import { FIXTURE_DESCRIPTION, FIXTURE_PUBLISHER } from './marker';
import { esc } from './prose';

export interface Fb2Author {
  first: string;
  middle?: string;
  last: string;
}

/** A titled section of the body, and the sections nested inside it (FB2 nests by containment). */
export interface Fb2Section {
  title: string;
  paragraphs: string[];
  sections?: Fb2Section[];
}

/**
 * A paragraph's text, escaped, with its note references made links: `{{note:n1|1}}` becomes
 * `<a l:href="#n1" type="note">1</a>`, as FB2 writes a footnote reference. The marker survives escaping untouched.
 */
function inline(text: string): string {
  return esc(text).replace(/\{\{note:([\w-]+)\|([^}]+)\}\}/g, '<a l:href="#$1" type="note">$2</a>');
}

/** One section as markup, its nested sections after its own paragraphs. */
function section(s: Fb2Section): string {
  const inner = [...s.paragraphs.map((p) => `<p>${inline(p)}</p>`), ...(s.sections ?? []).map(section)];
  return `<section><title><p>${esc(s.title)}</p></title>\n${inner.join('\n')}\n</section>`;
}

export interface Fb2Spec {
  title: string;
  authors: Fb2Author[];
  /** The person who made the file — `document-info`'s author, read as a nickname. */
  maker?: string;
  publisher?: string;
  year?: string;
  series?: { name: string; number: number };
  sections: Fb2Section[];
  /**
   * Whether the body opens with the book's title as a `<title>`. foliate lists it as the first contents entry, so a
   * twin of an EPUB whose contents start elsewhere leaves it out to match. Default true.
   */
  bodyTitle?: boolean;
  /**
   * Footnotes, in a second body named `notes` — where FB2 keeps them, and which foliate makes a section of its own,
   * marked non-linear. Each is a `<section id>` titled with its label; references to it are `{{note:id|label}}`.
   */
  notes?: { id: string; label: string; paragraphs: string[] }[];
  cover?: Uint8Array;
}

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');

export function buildFb2(spec: Fb2Spec): Uint8Array {
  const author = (a: Fb2Author) =>
    `<author><first-name>${esc(a.first)}</first-name>${a.middle ? `<middle-name>${esc(a.middle)}</middle-name>` : ''}<last-name>${esc(
      a.last
    )}</last-name></author>`;
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" xmlns:l="http://www.w3.org/1999/xlink">
<description>
<title-info>
<genre>prose</genre>
${spec.authors.map(author).join('\n')}
<book-title>${esc(spec.title)}</book-title>
<annotation><p>${esc(FIXTURE_DESCRIPTION)}</p></annotation>
${spec.cover ? '<coverpage><image l:href="#cover.png"/></coverpage>' : ''}
<lang>en</lang>
${spec.series ? `<sequence name="${esc(spec.series.name)}" number="${spec.series.number}"/>` : ''}
</title-info>
<document-info>
<author><nickname>${esc(spec.maker ?? 'fixture-builder')}</nickname></author>
<program-used>Orbis Reader fixture generator</program-used>
<date value="2026-01-01">2026</date>
<id>orbis-fixture-${esc(spec.title.toLowerCase().replace(/[^a-z0-9]+/g, '-'))}</id>
<version>1.0</version>
</document-info>
<publish-info><publisher>${esc(spec.publisher ?? FIXTURE_PUBLISHER)}</publisher>${spec.year ? `<year>${esc(spec.year)}</year>` : ''}</publish-info>
</description>
<body>
${spec.bodyTitle === false ? '' : `<title><p>${esc(spec.title)}</p></title>`}
${spec.sections.map(section).join('\n')}
</body>
${
  spec.notes?.length
    ? `<body name="notes">\n<title><p>Notes</p></title>\n${spec.notes
        .map(
          (n) =>
            `<section id="${esc(n.id)}"><title><p>${esc(n.label)}</p></title>\n${n.paragraphs.map((p) => `<p>${inline(p)}</p>`).join('\n')}\n</section>`
        )
        .join('\n')}\n</body>\n`
    : ''
}${spec.cover ? `<binary id="cover.png" content-type="image/png">${b64(spec.cover)}</binary>` : ''}
</FictionBook>
`;
  return new TextEncoder().encode(xml);
}
