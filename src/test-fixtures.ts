// The test plans' files, fetched into a vault from the repository's `test-fixtures` release.
//
// **A developer's command, offered only while developer options are on.** It is how a fresh vault — a BRAT install
// on a phone, say — gets the books and notes the test plans open, without a computer that has the repository. The
// test fixtures workflow (`.github/workflows/test-fixtures.yml`) packs every file git tracks under `test-vault/fixtures`
// into one zip and uploads it to that release whenever main's fixtures change.
//
// **One release for every version, not a copy in each.** The Community directory's review counts any file in a plugin
// release beyond the three Obsidian installs against it, and the fixtures change when a test plan's files do, not with
// each release.
//
// **The build's own fixtures, checked before anything is written.** The build pins the zip's SHA-256
// (`test-fixtures-pin.ts`), downloads the file named by it, and refuses one that does not hash to it. The release
// keeps every zip it has held, so a stable release, a beta or a local build each get the fixtures of their own commit,
// and a damaged or altered download writes nothing. A local build whose fixtures are not on main yet finds no zip.
//
// **Asks before writing, copies only what differs, deletes nothing.** The download is 1–2 MB and the command itself
// is the request for it; the question is about the vault, so it comes after the download, when the counts are known.
// A changed file replaces the vault's copy, which is how a test that edited a Library title note gets it back.
//
// **An entry lands inside `fixtures/` or not at all.** The digest says the zip is the one this build was made with,
// but a path in a zip is just a string: one with `..`, a leading slash or a dot-folder could write anywhere in the vault, the
// `.obsidian` folder included. `fixturePath` refuses those.

import { unzipSync } from 'fflate';
import { Notice, normalizePath, requestUrl, TFile, TFolder } from 'obsidian';
import { askToConfirm } from './ConfirmModal';
import { deviceSetting } from './device-settings';
import { t } from './i18n';
import type OrbisReaderPlugin from './main';
import { sha256Hex } from './reader/tts/asset-integrity';
import { TEST_FIXTURES_SHA256, testFixturesFile } from './test-fixtures-pin';

/** The repository's `test-fixtures` release, which keeps every zip of the fixtures it has held. */
const RELEASE = 'https://github.com/rastewart/obsidian-orbis-reader/releases/download/test-fixtures';

/** Where the zip with `sha256`'s fixtures is: by default, this build's own. */
export function testFixturesUrl(sha256: string = TEST_FIXTURES_SHA256): string {
  return `${RELEASE}/${testFixturesFile(sha256)}`;
}

/** The vault folder the test plans name, at the root: `fixtures/annotation-workhorse.epub`. */
export const FIXTURES_FOLDER = 'fixtures';

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

/** Download the fixtures, say what would change, and copy them in on a yes. */
export async function downloadTestFixtures(plugin: OrbisReaderPlugin): Promise<void> {
  const { app } = plugin;
  const url = testFixturesUrl();
  const log = (msg: string, extra?: unknown) => plugin.debug(`test fixtures: ${msg}`, extra);

  let entries: Record<string, Uint8Array>;
  try {
    const res = await requestUrl({ url, method: 'GET', throw: false });
    log(`GET ${url} → ${res.status}`);
    if (res.status === 404) {
      new Notice(t('notices.test_fixtures_not_published'));
      return;
    }
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    const digest = await sha256Hex(res.arrayBuffer);
    if (digest !== TEST_FIXTURES_SHA256) {
      log(`refused: the download hashes to ${digest}, and this build pins ${TEST_FIXTURES_SHA256}`);
      new Notice(t('notices.test_fixtures_wrong_file'));
      return;
    }
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
      t('test_fixtures_dialog.counts', { added: added.length, changed: changed.length }),
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
