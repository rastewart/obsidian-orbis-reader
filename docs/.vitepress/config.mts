// The documentation site: the user guide in docs/guide, built by VitePress. See docs/design/docs-site.md.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { type DefaultTheme, defineConfig } from 'vitepress';

// fileURLToPath, not `.pathname`: on Windows `.pathname` is `/C:/…`, which the file system cannot open.
const GUIDE = fileURLToPath(new URL('../guide', import.meta.url));
const REPO = 'https://github.com/rastewart/obsidian-orbis-reader';

/**
 * The sidebar is the guide index's own tables: each `## Heading` above a table of `| [Title](page.md) | … |` rows. A
 * page added to the index is in the sidebar with nothing else to edit.
 */
function sidebarFromIndex(): DefaultTheme.SidebarItem[] {
  const groups: { text: string; items: DefaultTheme.SidebarItem[] }[] = [];
  for (const line of readFileSync(`${GUIDE}/README.md`, 'utf8').split('\n')) {
    const heading = /^## (.+)$/.exec(line);
    if (heading) {
      groups.push({ text: heading[1], items: [] });
      continue;
    }
    const row = /^\| \[([^\]]+)\]\(([^)]+)\.md\) \|/.exec(line);
    if (row && groups.length > 0) groups[groups.length - 1].items.push({ text: row[1], link: `/${row[2]}` });
  }
  return [{ text: 'User Guide', link: '/' }, ...groups.filter((g) => g.items.length > 0)];
}

export default defineConfig({
  srcDir: './guide',
  title: 'Orbis Reader',
  description: 'The user guide for Orbis Reader, an ebook reader for your Obsidian vault.',
  lang: 'en-US',
  cleanUrls: true,
  // The guide's index stays README.md, so GitHub shows it in the folder; on the site it is the home page.
  rewrites: { 'README.md': 'index.md' },
  markdown: {
    config(md) {
      // `rewrites` moves the page but not the links to it: a link to the index says README.md. The "← User Guide"
      // lines are dropped below, so this is for any other link a page makes to the index.
      md.core.ruler.push('orbis-guide-links', (state) => {
        for (const block of state.tokens) {
          for (const token of block.children ?? []) {
            if (token.type !== 'link_open') continue;
            const href = token.attrGet('href') ?? '';
            if (/^(\.\/)?README\.md(#|$)/.test(href)) token.attrSet('href', href.replace('README.md', 'index.md'));
          }
        }
      });
      // **The guide's navigation lines are for GitHub only.** On GitHub they are the way around the folders: each
      // page's "← User Guide" back to the index, and the index's "Back to top-level docs" up to docs/README.md. On the
      // site the sidebar and the title already lead home, and the design documents are not there to go up to — so the
      // whole paragraph goes. Matched on the line's exact text, so a link to the index inside a sentence is untouched.
      const GITHUB_ONLY_LINES = new Set(['← [User Guide](README.md)', '→ [Back to top-level docs](../README.md)']);
      md.core.ruler.push('orbis-drop-github-only-lines', (state) => {
        const tokens = state.tokens;
        for (let i = tokens.length - 2; i > 0; i--) {
          const inline = tokens[i];
          if (
            inline.type === 'inline' &&
            GITHUB_ONLY_LINES.has(inline.content.trim()) &&
            tokens[i - 1].type === 'paragraph_open'
          ) {
            tokens.splice(i - 1, 3);
          }
        }
      });
    },
  },
  themeConfig: {
    sidebar: sidebarFromIndex(),
    outline: { level: [2, 3], label: 'On this page' },
    search: { provider: 'local' },
    docFooter: { prev: 'Previous', next: 'Next' },
    socialLinks: [{ icon: 'github', link: REPO }],
  },
});
