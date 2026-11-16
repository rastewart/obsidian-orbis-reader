# Documentation site

← [Design Docs](README.md)

The user guide in `docs/guide` is also a website, built by [VitePress](https://vitepress.dev) and meant for GitHub
Pages under a domain of its own. This page covers how the guide becomes the site, what in the repository does it, and
the steps that put it online. The site goes live with the public repository and not before it: what is left to do is
tracked in [Roadmap §5.9](roadmap.md#59-documentation-site).

---

## What the site publishes

**The user guide, and nothing else.** The design docs, test plans and fixtures are for working on Orbis Reader, and
stay in the repository.

**The guide's Markdown is the site's source, unchanged.** Every guide page reads the same on GitHub and on the site.
Nothing about the site is written into a page, so the guide has one source, and the
[user guide standard](user-guide-standard.md) is the only standard it follows.

**VitePress's default theme, as it comes.** A sidebar, an "On this page" outline, light and dark modes, Previous and
Next links, and search that runs in the browser with no outside service. One CSS rule is added (below).

---

## What is in the repository

| File | What it does |
|---|---|
| `docs/.vitepress/config.mts` | The site: title, the sidebar, the link rules, search |
| `docs/.vitepress/theme/index.ts` | VitePress's default theme with `custom.css` added |
| `docs/.vitepress/theme/custom.css` | One rule: a single line above each section, not two |
| `package.json` | `vitepress` as a development dependency, and the `docs:dev`, `docs:build` and `docs:preview` scripts |
| `pnpm-workspace.yaml` | The `vite@5` override (Dependencies, below) |
| `.gitignore` | `docs/.vitepress/dist/`, the built site, and `docs/.vitepress/cache/` |
| `.github/workflows/ci.yml` | A *Docs site build* step, so a broken guide link fails CI |
| `docs/design/code-standards.md` | `pnpm docs:build` in the pre-commit checklist |

The publishing workflow is not in the repository yet. It is written when the site goes live (Going live, step 4): a
workflow that deploys to Pages fails on every push while Pages is off.

---

## How the guide becomes the site

**The guide folder is the site's source** (`srcDir: './guide'`). The config sits beside it in `docs/.vitepress/`, not
inside it, so `docs/guide` stays a folder of Markdown pages on GitHub. The config also has to sit inside the
repository's tree: a page compiled from outside it cannot find Vue in `node_modules`.

**The guide's index is `README.md`, and the site's home page.** GitHub shows a folder's `README.md` below its file
list, so the index keeps that name. `rewrites: { 'README.md': 'index.md' }` makes it the home page. A rewrite moves the
page but not the links to it, so a markdown-it rule (`orbis-guide-links`) changes each page's `← User Guide` link from
`README.md` to `index.md`. Without it, those 26 links lead nowhere on the site.

**The index's one link above the guide goes to GitHub.** `→ Back to top-level docs` points at `../README.md`, which is
not part of the site. The same rule sends it to `docs/README.md` on GitHub. That link works once the repository is
public.

**The sidebar is the index's own tables.** `sidebarFromIndex()` reads the index and makes a sidebar group from each
`## Heading` above a table, and an entry from each `| [Title](page.md) |` row. A page added to the index's table is in
the sidebar too; there is no second list to keep in step.

**One divider, not two.** Each guide section starts after a `---` line, and VitePress already rules a line above every
`##` heading. `.vp-doc hr + h2 { border-top: 0 }` keeps one.

**Clean addresses.** `cleanUrls: true` gives `/listening`, not `/listening.html`. GitHub Pages serves `listening.html`
for `/listening`, so the addresses work with no server configuration.

**A broken link fails the build.** VitePress refuses a link between pages that points at nothing. `pnpm docs:build` is
in the gate for this: `pnpm lint:links` checks the Markdown, and `docs:build` checks the site that comes out of it.

---

## Working on the site

```sh
pnpm docs:dev       # the site with live reload while editing the guide, at http://localhost:5173
pnpm docs:build     # build it to docs/.vitepress/dist — the gate step
pnpm docs:preview   # serve the last build, at http://localhost:4173
```

`docs:preview` serves the files the build left, and keeps the list it found when it started. After a rebuild, the
gate's included, stop it and start it again. A server left running asks for files the new build renamed: the page
comes up unstyled, or styled but with no "On this page" list, search or light and dark switch, since those are
built in the browser by the scripts that now go missing.

**Adding a guide page** is adding a row to one of the index's tables. The sidebar follows.

---

## Dependencies

**`vitepress` is pinned exactly (`1.6.4`).** It is a development dependency: nothing from it ships in `main.js`.

**VitePress 1.6.4 asks for Vite 5, and the override gives it Vite 6** (`vite@5: ^6.4.4` in `pnpm-workspace.yaml`).
Vite 5 carries eight advisories, one rated high, all in its development server and most in its open-in-editor helper
on Windows. It also brings esbuild 0.21 (GHSA-67mh-4wv8-2f99). Their fixes are in Vite 6.4.4 and later. The site
builds the same 28 pages on Vite 6, and `docs:dev` serves them; the audit lists none of the nine. The override can go
when a stable VitePress asks for a fixed Vite itself.

---

## Hosting

**GitHub Pages, from this repository.** A workflow builds the site and hands it to Pages, so no second repository or
publishing branch is needed. Pages on a public repository costs nothing.

**A domain of its own.** The site is meant to be at `guide.orbisreader.com`; the domain `orbisreader.com` is
registered. A subdomain points at GitHub with one `CNAME` record.

**Public with the repository, not before it.** The repository is `rastewart/obsidian-orbis-reader`, on a personal
account. The site goes live after the repository is public.

---

## Going live

Do these in order, after the repository is public. The verification in step 2 comes before the DNS record in step 3:
until the domain is verified for the account, another GitHub account could publish its own site at a subdomain that
points at GitHub.

1. **Register the domain.** Done: `orbisreader.com`.
2. **Verify the domain for the account.** In the account's **Settings → Pages** (the profile's settings, not the
   repository's), select **Add a domain** and enter the domain (`orbisreader.com`). GitHub gives a TXT
   record to add at `_github-pages-challenge-rastewart.<domain>`. Add it at the DNS provider, wait for it to appear,
   and select **Verify**. Verifying the domain also covers its subdomains.
3. **Point the subdomain at GitHub.** At the DNS provider, add a `CNAME` record from `guide` to `rastewart.github.io`
   (the account's address, with no repository name).
4. **Add the publishing workflow,** `.github/workflows/docs.yml`:
   - **Runs** on a push to `main` that changes `docs/guide/**`, `docs/.vitepress/**`, `package.json` or
     `pnpm-lock.yaml`, and by hand (`workflow_dispatch`).
   - **A build job** with `contents: read`. It does the same setup as `ci.yml` (checkout without credentials, Node,
     pnpm, `pnpm install --frozen-lockfile`), then `pnpm docs:build`, `actions/configure-pages`, and
     `actions/upload-pages-artifact` with `path: docs/.vitepress/dist`.
   - **A deploy job** that needs the build job. It runs in the `github-pages` environment, has `pages: write` and
     `id-token: write`, and runs `actions/deploy-pages`. Only this job holds those two permissions.
   - **Every action is pinned by full commit SHA** with its version in a comment, like the other workflows, and
     `pnpm lint:workflows` passes.
5. **Turn Pages on for the repository.** In the repository's **Settings → Pages**, set **Source** to **GitHub
   Actions**, and enter `guide.orbisreader.com` as the **Custom domain**. With a workflow as the source, GitHub keeps the
   domain in the settings, and no `CNAME` file goes in the repository. Push the workflow or run it by hand.
6. **Turn on HTTPS.** Once GitHub has issued the certificate for the domain, select **Enforce HTTPS**. The certificate
   can take a while; the checkbox is unavailable until it is ready.
7. **Check the live site.** The home page loads at `https://guide.orbisreader.com/`; a page opened directly loads, for example
   `/listening`; search finds a word; the `← User Guide` links and the index's link to `docs/README.md` work; and a
   push that changes a guide page updates the site.

### After the site is live

- **Name the site as the repository's website:** the repository's **About** settings, or
  `gh repo edit --homepage https://guide.orbisreader.com/`. Set `homepage` in `package.json` to the same address.
- **Point the README at the site.** The README's **Learn more** links and its *User guide* section go to the site's
  pages instead of the Markdown files. Each page keeps its name, without `.md`: `docs/guide/listening.md` is
  `https://guide.orbisreader.com/listening`.
- **Add a Help link inside Orbis Reader** that opens the site. Where it goes and what it says are design questions for
  then: a string through `t()`, the product's wording, and the plugin's settings conventions.
- [Roadmap §5.8](roadmap.md#58-manifest--versioning) still has `authorUrl` to decide. The site is one candidate for it.
