// Starts a separate Obsidian for the end-to-end tests: its own user data, its own vault, this build of the plugin.
//
// **Separate from the Obsidian you use.** Electron keys its single-instance lock and all of its storage to the
// user-data folder, so an Obsidian started with its own `--user-data-dir` runs beside yours and shares nothing with
// it: no vault list, no settings, no local storage. Nothing here reads or writes your vaults. The one thing taken
// from your installation is Obsidian's app file (`obsidian-<version>.asar`), copied so the tests run the version
// you run (below).
//
// **The vault is the fixtures git tracks**, copied fresh for every run, the same set the fixtures pin covers. Files
// a person's testing leaves in `test-vault/fixtures` (marks, converted books, the `!orbis-data` sidecars) are not
// tracked and not copied, so a run starts from the same state on every machine.
//
// **Windows, macOS and Linux.** Only where Obsidian is installed and where it keeps its own files differ; both are
// in `obsidianBinary` and `obsidianConfigDir`. Set ORBIS_E2E_OBSIDIAN to the executable to use another one.

import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { homedir, platform, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Page, within } from './cdp';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = 'test-vault/fixtures';
const PLUGIN_FILES = ['main.js', 'manifest.json', 'styles.css'];
/** The vault's id in Obsidian's vault list. Any 16 hex digits; a fixed one keeps the run's local storage keys stable. */
const VAULT_ID = 'e2e0rb15e2e0rb15';

export interface Obsidian {
  page: Page;
  /** The vault folder on disk. */
  vault: string;
  /** Closes Obsidian and deletes the run's folder, unless `keep` was asked for. */
  close(): Promise<void>;
}

/** The Obsidian executable: ORBIS_E2E_OBSIDIAN, or the usual install places for this platform. */
function obsidianBinary(): string {
  const override = process.env.ORBIS_E2E_OBSIDIAN;
  if (override) {
    if (!existsSync(override)) throw new Error(`ORBIS_E2E_OBSIDIAN is ${override}, which does not exist`);
    return override;
  }
  const home = homedir();
  const candidates: Record<string, string[]> = {
    win32: [
      join(process.env.LOCALAPPDATA ?? join(home, 'AppData', 'Local'), 'Programs', 'Obsidian', 'Obsidian.exe'),
      join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Obsidian', 'Obsidian.exe'),
    ],
    darwin: [
      '/Applications/Obsidian.app/Contents/MacOS/Obsidian',
      join(home, 'Applications', 'Obsidian.app', 'Contents', 'MacOS', 'Obsidian'),
    ],
    linux: ['/usr/bin/obsidian', '/opt/Obsidian/obsidian', join(home, '.local', 'bin', 'obsidian')],
  };
  const found = (candidates[platform()] ?? []).find((p) => existsSync(p));
  if (!found) throw new Error('Obsidian is not installed in a usual place. Set ORBIS_E2E_OBSIDIAN to its executable.');
  return found;
}

/** Where Obsidian keeps its own files (the vault list, its downloaded updates) for the person running the tests. */
function obsidianConfigDir(): string {
  const home = homedir();
  if (platform() === 'win32') return join(process.env.APPDATA ?? join(home, 'AppData', 'Roaming'), 'obsidian');
  if (platform() === 'darwin') return join(home, 'Library', 'Application Support', 'obsidian');
  return join(process.env.XDG_CONFIG_HOME ?? join(home, '.config'), 'obsidian');
}

/**
 * The newest `obsidian-<version>.asar` Obsidian has downloaded for you, if any.
 *
 * **Why copy it.** The installed executable carries the Obsidian version it was installed with. Updates arrive as an
 * `.asar` in the config folder, and the executable loads the newest one it finds there. A fresh user-data folder has
 * none, so without this the tests would run the installer's version, possibly months older than the one you use.
 */
function newestAsar(): string | null {
  const dir = obsidianConfigDir();
  if (!existsSync(dir)) return null;
  const parts = (name: string) => (/^obsidian-(\d+)\.(\d+)\.(\d+)\.asar$/.exec(name) ?? []).slice(1).map(Number);
  const asars = readdirSync(dir)
    .filter((name) => parts(name).length === 3)
    .sort((a, b) => {
      const [pa, pb] = [parts(a), parts(b)];
      return pb[0] - pa[0] || pb[1] - pa[1] || pb[2] - pa[2];
    });
  return asars.length ? join(dir, asars[0]) : null;
}

function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => (typeof address === 'object' && address ? resolvePort(address.port) : reject()));
    });
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Builds the vault: the tracked fixtures, and the plugin installed and switched on. */
function makeVault(vault: string): void {
  const tracked = execFileSync('git', ['ls-files', '-z', '--', FIXTURES], { cwd: ROOT, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean);
  for (const file of tracked) {
    const to = join(vault, 'fixtures', file.slice(FIXTURES.length + 1));
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(join(ROOT, file), to);
  }
  const plugin = join(vault, '.obsidian', 'plugins', 'orbis-reader');
  mkdirSync(plugin, { recursive: true });
  for (const file of PLUGIN_FILES) {
    const from = join(ROOT, file);
    if (!existsSync(from)) throw new Error(`${file} is missing. Run pnpm build first.`);
    copyFileSync(from, join(plugin, file));
  }
  writeFileSync(join(vault, '.obsidian', 'community-plugins.json'), JSON.stringify(['orbis-reader']));
  // A file a test deletes goes to the vault's own `.trash`, deleted with the run, never to the computer's trash. A file
  // a test renames has the links to it updated without Obsidian asking, as it would wait for an answer.
  writeFileSync(
    join(vault, '.obsidian', 'app.json'),
    JSON.stringify({ promptDelete: false, trashOption: 'local', alwaysUpdateLinks: true })
  );
}

/** The user-data folder: a vault list holding only the test vault, open, and the newest Obsidian app file. */
function makeUserData(userData: string, vault: string): void {
  mkdirSync(userData, { recursive: true });
  const vaults = { [VAULT_ID]: { path: vault, ts: Date.now(), open: true } };
  writeFileSync(join(userData, 'obsidian.json'), JSON.stringify({ vaults, updateDisabled: true }));
  const asar = newestAsar();
  if (asar) cpSync(asar, join(userData, asar.split(/[\\/]/).pop() as string));
}

/**
 * Waits until the workspace is ready, then makes sure Orbis Reader is on.
 *
 * **The trust prompt.** A vault Obsidian has not seen before opens in Restricted mode and asks whether to trust its
 * plugins. Answering by clicking would depend on the dialog's wording; turning community plugins on through the
 * plugin manager is what that answer does, so the manager is asked directly and the dialog left for the runner.
 */
async function readyWithPlugin(page: Page): Promise<void> {
  for (let i = 0; i < 120; i++) {
    const ready = await page
      .run(() =>
        Boolean((window as unknown as { app?: { workspace?: { layoutReady?: boolean } } }).app?.workspace?.layoutReady)
      )
      .catch(() => false);
    if (ready) break;
    await sleep(500);
  }
  const loaded = await page.run(async () => {
    const plugins = (
      window as unknown as {
        app: { plugins: Record<string, (...a: unknown[]) => unknown> & { plugins: Record<string, unknown> } };
      }
    ).app.plugins;
    if (!plugins.plugins['orbis-reader']) {
      await plugins.setEnable(true);
      await plugins.loadManifests();
      await plugins.enablePluginAndSave('orbis-reader');
    }
    return Boolean(plugins.plugins['orbis-reader']);
  });
  if (!loaded) throw new Error('Orbis Reader did not load in the test vault');
  // **The clipboard is yours.** Electron's clipboard is the computer's, so a test that copies would replace what you
  // copied. Orbis copies through `navigator.clipboard`; in the test window that keeps the text in the page instead,
  // where a test reads it (`window.orbisE2eClipboard`).
  await page.run(() => {
    const w = window as unknown as { orbisE2eClipboard: string };
    w.orbisE2eClipboard = '';
    Object.assign(navigator.clipboard, {
      writeText: async (text: string) => {
        w.orbisE2eClipboard = text;
      },
      write: async () => undefined,
      readText: async () => w.orbisE2eClipboard,
      read: async () => [],
    });
  });
  // **Notices.** Obsidian shows one for a few seconds and then removes it, so a test that asks what Orbis said could
  // miss it. Each one is kept as it appears, in `window.orbisE2eNotices`, for `noticesSince` to read.
  await page.run(() => {
    const w = window as unknown as { orbisE2eNotices: string[] };
    w.orbisE2eNotices = [];
    new MutationObserver((records) => {
      for (const record of records)
        for (const node of Array.from(record.addedNodes))
          if (node instanceof HTMLElement && node.classList.contains('notice'))
            w.orbisE2eNotices.push((node.textContent ?? '').trim().replace(/\s+/g, ' '));
    }).observe(document.body, { childList: true, subtree: true });
  });
  // The trust prompt and the welcome are closed by the runner before the first test, as every dialog is.
}

export async function launchObsidian(opts: { keep?: boolean } = {}): Promise<Obsidian> {
  const runDir = mkdtempSync(join(tmpdir(), 'orbis-e2e-'));
  const vault = join(runDir, 'vault');
  const userData = join(runDir, 'user-data');
  makeVault(vault);
  makeUserData(userData, vault);

  const port = await freePort();
  // The executable itself, never `open -a` on a Mac: `open` hands the flags to an Obsidian that is already running.
  const child: ChildProcess = spawn(
    obsidianBinary(),
    [`--user-data-dir=${userData}`, `--remote-debugging-port=${port}`],
    {
      stdio: 'ignore',
    }
  );

  let page: Page | null = null;
  for (let i = 0; i < 120 && !page; i++) {
    await sleep(500);
    page = await Page.connect(port).catch(() => null);
  }
  if (!page) {
    child.kill();
    throw new Error('Obsidian did not open a window with remote debugging within a minute');
  }
  await readyWithPlugin(page);
  page.takeErrors();

  return {
    page,
    vault,
    async close() {
      const exited = new Promise((r) => (child.exitCode !== null ? r(true) : child.once('exit', () => r(true))));
      // Closing through the browser target ends every Electron helper process too, which killing the main one
      // does not always do on Windows.
      await within(
        (async () => {
          const version = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()) as {
            webSocketDebuggerUrl: string;
          };
          const ws = new WebSocket(version.webSocketDebuggerUrl);
          await new Promise((r) => ws.addEventListener('open', r, { once: true }));
          ws.send(JSON.stringify({ id: 1, method: 'Browser.close' }));
        })().catch(() => undefined),
        5_000,
        undefined
      );
      page?.close();
      // A window that froze can keep Obsidian from closing. Then it is ended, with every process it started.
      if (!(await within(exited, 15_000, false))) {
        if (platform() === 'win32' && child.pid) {
          try {
            execFileSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
          } catch {
            /* already gone */
          }
        } else child.kill('SIGKILL');
        await within(exited, 10_000, false);
      }
      if (opts.keep) console.log(`Kept the run's vault and user data in ${runDir}`);
      else rmSync(runDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
    },
  };
}
