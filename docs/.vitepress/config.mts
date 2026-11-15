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
      // `rewrites` moves the page but not the links to it: each page's "← User Guide" link says README.md. The index's
      // one link above the guide, to docs/README.md, has no page on the site and goes to that file on GitHub.
      md.core.ruler.push('orbis-guide-links', (state) => {
        for (const block of state.tokens) {
          for (const token of block.children ?? []) {
            if (token.type !== 'link_open') continue;
            const href = token.attrGet('href') ?? '';
            if (href === '../README.md') token.attrSet('href', `${REPO}/blob/main/docs/README.md`);
            else if (/^(\.\/)?README\.md(#|$)/.test(href)) token.attrSet('href', href.replace('README.md', 'index.md'));
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
