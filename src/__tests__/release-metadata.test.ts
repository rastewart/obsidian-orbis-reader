import { describe, expect, it } from 'vitest';
// Imported, not read off disk: the plugin's tsconfig carries no Node types on purpose and `no-nodejs-modules`
// bans `node:fs` in `src`. Vitest resolves these JSON imports; nothing in the built bundle reaches this file.
import manifest from '../../manifest.json';
import pkg from '../../package.json';
import versions from '../../versions.json';

/**
 * The three files Obsidian reads about a release, checked against each other.
 *
 * **Because nothing else does.** `versions.json` is maintained by hand and consulted only by Obsidian, when an
 * older app asks which release it may install — so a stale one is invisible here and wrong out there: the app
 * offers a build whose `minAppVersion` it cannot meet. The plugin's own `validate-manifest` rule cannot cover it
 * either; it keys off `physicalFilename` but is registered under `**\/*.{ts,js}` globs, so it never fires on a
 * `.json` file at all (checked on eslint-plugin-obsidianmd 0.4.2).
 *
 * A test rather than a sixth lint script: this needs to run whenever anything runs, and `pnpm test` already does.
 */
describe('release metadata', () => {
  const floors: Record<string, string> = versions;

  it('ships the version manifest.json declares', () => {
    expect(pkg.version).toBe(manifest.version);
  });

  it('lists the current version in versions.json, at the floor the manifest states', () => {
    expect(Object.keys(floors)).toContain(manifest.version);
    expect(floors[manifest.version]).toBe(manifest.minAppVersion);
  });

  it('describes itself without saying "Obsidian"', () => {
    // The review bot asks for this: where the description is read, Obsidian is a given. Same for the id and name.
    expect(manifest.description).not.toMatch(/obsidian/i);
    expect(manifest.description.length).toBeLessThanOrEqual(250);
    expect(manifest.id).not.toMatch(/obsidian/i);
    expect(manifest.name).not.toMatch(/obsidian|plugin/i);
  });

  it('gives every listed version a semver floor', () => {
    for (const [version, floor] of Object.entries(floors)) {
      expect(version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(floor).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });
});
