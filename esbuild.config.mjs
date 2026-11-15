// Node's own list, not the `builtin-modules` package: it has shipped in `node:module` for years, and the
// package is on the plugin lint's banned-dependency list for exactly that reason.
import { builtinModules as builtins } from 'node:module';
import { execSync } from 'child_process';
import esbuild from 'esbuild';
import fs from 'fs';
import process from 'process';

// Build stamp injected via `define` below so a running build can report exactly
// which artifact it is (About box + debug-log header). Note: in `pnpm dev` watch
// mode `define` is evaluated once at watch start, so BUILD_TIME won't refresh on
// every hot rebuild — but the production `build` (which deploy.sh runs) re-stamps
// fresh each time, so deployed/tested builds are always accurate.
const gitCommit = () => {
  try {
    const opts = { stdio: ['ignore', 'pipe', 'ignore'] };
    const sha = execSync('git rev-parse --short HEAD', opts).toString().trim();
    // "-dirty" only when the plugin's own build inputs have uncommitted changes.
    // Scoped to these paths (not the whole repo) so untracked noise — .DS_Store,
    // exported test files, .claude/ settings — doesn't permanently flag every
    // build dirty. These four are what actually determine the deployed plugin:
    // src/ + esbuild config build main.js, styles.css and manifest.json ship with it.
    const scope = 'src styles.css manifest.json esbuild.config.mjs';
    const dirty = execSync(`git status --porcelain -- ${scope}`, opts).toString().trim().length > 0;
    return sha + (dirty ? '-dirty' : '');
  } catch {
    return 'nogit';
  }
};
const BUILD_TIME = new Date().toISOString().replace(/\.\d+Z$/, 'Z'); // to the second, UTC
const BUILD_COMMIT = gitCommit();

// foliate-js is vendored in src/vendor/foliate-js. Its Orbis patches, which used to be applied here at build time, are
// edits in that folder now; src/vendor/foliate-js/ORBIS-CHANGES.md explains each one. That includes a plugin reload:
// foliate's three custom elements check before they define (ORBIS patch 21), so nothing here wraps
// `customElements.define` for the whole window.

const prod = process.argv[2] === 'production';
const vaultOut = 'test-vault/.obsidian/plugins/orbis-reader/main.js';

// Build the Piper synthesis worker (phonemizer + ONNX inference) as a self-contained IIFE
// and inline it into main.js as a string, so it can run via a Blob URL — Obsidian plugins
// ship a single main.js with no side-car files. Bundling ORT + the phonemizer here (not in
// the main bundle) keeps the heavy synthesis code entirely on the worker side.
const workerBuild = await esbuild
  .build({
    entryPoints: ['src/reader/tts/piper-worker.ts'],
    bundle: true,
    minify: prod,
    format: 'iife',
    target: 'es2020',
    write: false,
    logLevel: 'silent',
    external: [...builtins], // fs/path/crypto etc. — the phonemizer's Node branch is dead code here (process hidden)
    define: { 'import.meta.url': JSON.stringify('') },
  })
  .catch(() => process.exit(1));
const PIPER_WORKER_SRC = workerBuild.outputFiles[0].text;

await esbuild
  .build({
    entryPoints: ['src/main.ts'],
    bundle: true,
    minify: prod,
    external: [
      'obsidian',
      'electron',
      '@codemirror/autocomplete',
      '@codemirror/commands',
      '@codemirror/language',
      '@codemirror/state',
      '@codemirror/view',
      ...builtins,
    ],
    format: 'cjs',
    target: 'es2020',
    logLevel: 'info',
    sourcemap: prod ? false : 'inline',
    treeShaking: true,
    outfile: vaultOut,
    // foliate-js uses import.meta.url in some files; replace with empty string
    // since we're in a bundled CJS context where it has no meaning.
    define: {
      'import.meta.url': JSON.stringify(''),
      __ORBIS_BUILD_TIME__: JSON.stringify(BUILD_TIME),
      __ORBIS_BUILD_COMMIT__: JSON.stringify(BUILD_COMMIT),
      __PIPER_WORKER_SRC__: JSON.stringify(PIPER_WORKER_SRC),
    },
  })
  .then(() => {
    // Keep project-root main.js in sync for releases/CI
    fs.copyFileSync(vaultOut, 'main.js');
  })
  .catch(() => process.exit(1));
