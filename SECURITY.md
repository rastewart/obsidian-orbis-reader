# Security Policy

## Reporting a vulnerability

Please report security problems privately, not in a public issue.

1. Go to the repository's **Security** tab.
2. Select **Report a vulnerability**.
3. Describe the problem, the version of Orbis Reader and of Obsidian, your platform, and the steps or file that show it.

The report is visible only to the maintainer until a fix is ready. Orbis Reader is maintained by one person, so responses are best effort.

## Supported versions

Fixes go into the next release. Only the latest release and the current beta receive them.

| Version | Supported |
|---|---|
| Latest release | Yes |
| Current beta | Yes |
| Anything older | No |

## Scope

In scope:

- The Orbis Reader plugin: `main.js`, `manifest.json` and `styles.css` as released.
- How it handles books, notes and feeds that come from elsewhere: a crafted EPUB, MOBI, AZW3, FB2 or CBZ file, an OPDS catalog, or a link inside a book.
- The workflows in `.github/workflows/` and the releases they build.

Out of scope:

- Obsidian itself, and other plugins. Report those to their own maintainers.
- Advisories in development tools that do not ship in the plugin. These are tracked in [Dependency Security](docs/design/dependency-security.md).

## How Orbis Reader treats untrusted content

[Security](docs/design/security.md) describes how the plugin treats book content, links, network requests and the files it writes.

## Checking a release

Each release's files carry a build provenance attestation. To check that a downloaded `main.js` was built by this repository's release workflow:

```sh
gh attestation verify main.js --repo rastewart/obsidian-orbis-reader
```
