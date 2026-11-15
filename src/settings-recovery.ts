// The settings file, read so that a damaged one costs nothing.
//
// **What went wrong without this.** Obsidian's `loadData` answers null for a `data.json` it cannot parse — a crash
// mid-write, a sync tool's conflict, a file cut short — exactly as it does for one that is not there. Orbis then
// started from its defaults, rebuilt what its sync records hold, and saved that over the file. Measured in a test
// vault with the file cut in half: the Library switched off and its folders cleared, the sync folder cleared, a preset,
// a dashboard, a note style, a theme and the pronunciations gone, and the damaged file overwritten, so nothing was
// left to recover from.
//
// **So Orbis keeps a backup.** Every time the settings are read or saved successfully they are written beside
// `data.json` as `data.backup.json`. When `data.json` is there but cannot be read, it is moved aside — kept, never
// written over — and the backup put back in its place; the reader is told once. With no backup either, Orbis starts
// from its defaults, and the moved-aside file is still there to repair by hand.
//
// **Not a snapshot.** The backup follows every save, so it holds the settings as they are now, not as they were
// earlier: it recovers a file that cannot be read, not a change the reader regrets.

import { Notice, normalizePath, type Plugin } from 'obsidian';
import { t } from './i18n';

/** The settings as last read or saved, beside `data.json` in the plugin's folder. */
export const BACKUP_FILE = 'data.backup.json';

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function paths(plugin: Plugin): { dir: string; data: string; backup: string } {
  const dir = plugin.manifest.dir ?? `${plugin.app.vault.configDir}/plugins/${plugin.manifest.id}`;
  return { dir, data: normalizePath(`${dir}/data.json`), backup: normalizePath(`${dir}/${BACKUP_FILE}`) };
}

/** Write `settings` as the backup, if it differs from the one there. Never throws: it is a safeguard. */
export async function keepBackup(plugin: Plugin, settings: unknown): Promise<void> {
  try {
    const { backup } = paths(plugin);
    const adapter = plugin.app.vault.adapter;
    const text = JSON.stringify(settings, null, 2);
    if ((await adapter.exists(backup)) && (await adapter.read(backup)) === text) return;
    await adapter.write(backup, text);
  } catch {
    // A backup not made leaves things as they were before backups existed; the save itself has happened.
  }
}

/**
 * The settings as `data.json` holds them, or — when it is there but cannot be read — as the backup holds them, put
 * back in its place. Null when there is neither: a first run, or a damaged file with no backup. `note` is a line for
 * the debug log, which cannot be written to before the settings exist. Never throws.
 */
export async function readSettingsFile(
  plugin: Plugin
): Promise<{ data: Record<string, unknown> | null; note?: string }> {
  const loaded: unknown = await plugin.loadData().catch(() => null);
  if (isObject(loaded)) {
    await keepBackup(plugin, loaded);
    return { data: loaded };
  }
  const { dir, data, backup } = paths(plugin);
  const adapter = plugin.app.vault.adapter;
  try {
    if (!(await adapter.exists(data))) return { data: null };
    const name = `data.unreadable-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    await adapter.rename(data, normalizePath(`${dir}/${name}`));
    let saved: unknown = null;
    if (await adapter.exists(backup)) {
      try {
        saved = JSON.parse(await adapter.read(backup));
      } catch {
        saved = null;
      }
    }
    if (isObject(saved)) {
      await adapter.write(data, JSON.stringify(saved, null, 2));
      new Notice(t('notices.settings_restored_from_backup', { name }));
      return { data: saved, note: `settings: data.json could not be read — kept as ${name}, backup restored` };
    }
    new Notice(t('notices.settings_unreadable_started_with_defaults', { name }));
    return { data: null, note: `settings: data.json could not be read and there is no backup — kept as ${name}` };
  } catch (err) {
    return { data: null, note: `settings: data.json could not be read, and setting it aside failed — ${String(err)}` };
  }
}
