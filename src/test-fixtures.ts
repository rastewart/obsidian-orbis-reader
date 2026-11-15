// The test plans' files, fetched into a vault from the release this build was published as.
//
// **A developer's command, offered only while developer options are on.** It is how a fresh vault — a BRAT install
// on a phone, say — gets the books and notes the test plans open, without a computer that has the repository. The
// release workflow packs every file git tracks under `test-vault/fixtures` into `orbis-test-fixtures.zip` beside the
// three plugin files, so the fixtures always match the code under test, beta or stable.
//
// **Asks before writing, copies only what differs, deletes nothing.** The download is 1–2 MB and the command itself
// is the request for it; the question is about the vault, so it comes after the download, when the counts are known.
// A changed file replaces the vault's copy, which is how a test that edited a Library title note gets it back.
//
// **An entry lands inside `fixtures/` or not at all.** The zip comes from this repository's own release, but a path
// in a zip is just a string: one with `..`, a leading slash or a dot-folder could write anywhere in the vault, the
// `.obsidian` folder included. `fixturePath` refuses those.

import { unzipSync } from 'fflate';
import { Notice, normalizePath, requestUrl, TFile, TFolder } from 'obsidian';
import { askToConfirm } from './ConfirmModal';
import { deviceSetting } from './device-settings';
import { t } from './i18n';
import type OrbisReaderPlugin from './main';

/** The repository's releases. The release workflow attaches the zip to each one. */
const RELEASES = 'https://github.com/rastewart/obsidian-orbis-reader/releases/download';

export const TEST_FIXTURES_ZIP = 'orbis-test-fixtures.zip';

/** The vault folder the test plans name, at the root: `fixtures/annotation-workhorse.epub`. */
export const FIXTURES_FOLDER = 'fixtures';

/** The zip attached to the release tagged `version`, which is the installed `manifest.json`'s version. */
export function testFixturesUrl(version: string): string {
  return `${RELEASES}/${version}/${TEST_FIXTURES_ZIP}`;
}

/**
 * Where a zip entry goes in the vault, or null for an entry that is not a file this command may write: a folder
 * entry, or a path that would leave `fixtures/` or reach a hidden folder.
 */
export function fixturePath(entry: string): string | null {
  if (!entry || entry.endsWith('/') || /[\\\0]/.test(entry) || entry.startsWith('/') || /^[A-Za-z]:/.test(entry)) {
    return null;
  }
  const parts = entry.split('/');
  if (parts.some((p) => p === '' || p === '.' || p === '..' || p.startsWith('.'))) return null;
  return `${FIXTURES_FOLDER}/${entry}`;
}

export function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/** The palette command, offered only while developer options are on. It needs no book. */
export function addTestFixturesCommand(plugin: OrbisReaderPlugin): void {
  plugin.addCommand({
    id: 'orbis-download-test-fixtures',
    name: t('command_palette.download_test_fixtures'),
    checkCallback: (checking) => {
      if (!deviceSetting('showDevOptions')) return false;
      if (!checking) void downloadTestFixtures(plugin);
      return true;
    },
  });
}

/** Download this version's fixtures, say what would change, and copy them in on a yes. */
export async function downloadTestFixtures(plugin: OrbisReaderPlugin): Promise<void> {
  const { app } = plugin;
  const version = plugin.manifest.version;
  const url = testFixturesUrl(version);
  const log = (msg: string, extra?: unknown) => plugin.debug(`test fixtures: ${msg}`, extra);

  let entries: Record<string, Uint8Array>;
  try {
    const res = await requestUrl({ url, method: 'GET', throw: false });
    log(`GET ${url} → ${res.status}`);
    if (res.status === 404) {
      new Notice(t('notices.test_fixtures_not_published', { version }));
      return;
    }
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    entries = unzipSync(new Uint8Array(res.arrayBuffer));
  } catch (err) {
    log('download failed', err);
    new Notice(t('notices.test_fixtures_failed'));
    return;
  }

  const added: [string, Uint8Array][] = [];
  const changed: [TFile, Uint8Array][] = [];
  for (const [name, bytes] of Object.entries(entries)) {
    if (name.endsWith('/')) continue;
    const path = fixturePath(name);
    const at = path && app.vault.getAbstractFileByPath(normalizePath(path));
    if (!path || at instanceof TFolder) {
      log(`refused ${JSON.stringify(name)}`);
      continue;
    }
    if (!(at instanceof TFile)) added.push([normalizePath(path), bytes]);
    else if (!sameBytes(new Uint8Array(await app.vault.readBinary(at)), bytes)) changed.push([at, bytes]);
  }

  if (!added.length && !changed.length) {
    new Notice(t('notices.test_fixtures_up_to_date'));
    return;
  }
  const ok = await askToConfirm(app, {
    title: t('test_fixtures_dialog.title'),
    message: [
      t('test_fixtures_dialog.counts', { version, added: added.length, changed: changed.length }),
      t('test_fixtures_dialog.replaced'),
    ],
    confirmText: t('test_fixtures_dialog.copy'),
    destructive: false,
  });
  if (!ok) return;

  let failed = 0;
  for (const [path, bytes] of added) {
    try {
      // Each missing folder on the way, outermost first: a fresh vault has no `fixtures` to put `library` in.
      const parts = path.split('/');
      for (let i = 1; i < parts.length; i++) {
        const folder = parts.slice(0, i).join('/');
        if (!app.vault.getAbstractFileByPath(folder)) await app.vault.createFolder(folder);
      }
      await app.vault.createBinary(path, toArrayBuffer(bytes));
    } catch (err) {
      failed++;
      log(`could not write ${path}`, err);
    }
  }
  for (const [file, bytes] of changed) {
    try {
      await app.vault.modifyBinary(file, toArrayBuffer(bytes));
    } catch (err) {
      failed++;
      log(`could not write ${file.path}`, err);
    }
  }
  const copied = added.length + changed.length - failed;
  log(`copied ${copied}, failed ${failed}`);
  new Notice(
    failed
      ? t('notices.test_fixtures_partly_copied', { count: copied, failed })
      : copied === 1
        ? t('notices.test_fixtures_copied_one', { folder: FIXTURES_FOLDER })
        : t('notices.test_fixtures_copied', { count: copied, folder: FIXTURES_FOLDER })
  );
}
