# Contributing to Orbis Reader

Orbis Reader is built and maintained by one person. Bug reports and feature requests are welcome as issues.

**Pull requests are by invitation only.** Open an issue first and describe the change. If we agree on it there, I'll say how to send it. A pull request that wasn't agreed in an issue may be closed without review.

## Reporting a bug

Include:

- **Your device and its operating system** — for example, Windows 11, macOS 26, iPadOS or Android 15.
- **The Obsidian and Orbis Reader versions.**
- **The book's format** (EPUB, MOBI, AZW3, FB2 or CBZ) and where it came from. Only attach a book you have the right to share.
- **What you did, what you expected and what happened.** A screenshot helps.
- **The debug log**, if you can. Run **Toggle debug log** from the command palette, repeat what went wrong and copy the log. If the problem freezes or closes Obsidian, run **Toggle writing the debug log to a note** first: the log is then saved as a note you can read after restarting.

## Requesting a feature

Describe what you are trying to do and where Orbis Reader gets in the way, rather than only the control you would like. Some requests already have a decision behind them, recorded in the [roadmap](docs/design/roadmap.md).

## Building from source

Orbis Reader is MIT-licensed, and you're free to fork it. To build it:

```sh
pnpm install
pnpm run build    # type-check + bundle → main.js
pnpm run dev      # rebuild main.js on every save
```

Requires Node 22.22 or later on the 22 line, 24.15 or later on the 24 line, or 26 and later, and pnpm; `package.json` pins the pnpm version, and pnpm switches to it by itself. `./deploy.sh` (macOS, Linux) or `.\deploy.ps1` (Windows) copies the build into `test-vault` and reloads the plugin.

The whole check, which every change must pass:

```sh
pnpm run build && pnpm run check && pnpm run lint:obsidian && pnpm run lint:md \
  && pnpm run lint:i18n && pnpm run lint:a11y && pnpm run lint:size && pnpm run lint:orphans \
  && pnpm run lint:vocab && pnpm run lint:links && pnpm run lint:keyboard \
  && pnpm run lint:workflows && pnpm run test
```

`lint:workflows` also needs actionlint and zizmor installed; see [Prerequisites](docs/design/code-standards.md#prerequisites). The code standards, with the reasons behind them, are in [`docs/design/code-standards.md`](docs/design/code-standards.md).

Translations are not being taken yet; how they will work is in [`docs/design/localization.md`](docs/design/localization.md).
