// Node's own list, not the `builtin-modules` package: it has shipped in `node:module` for years, and the
// package is on the plugin lint's banned-dependency list for exactly that reason.
import { createHash } from 'node:crypto';
import { builtinModules as builtins } from 'node:module';
import path from 'node:path';
import esbuild from 'esbuild';
import fs from 'fs';
import process from 'process';

// The build ID, injected via `define` below so a running build can say which one it is (About box, debug-log header,
// and the stale-renderer check in foliate-patches.ts). It is a hash of the files the build is made from, and of
// nothing else: not git, not the clock, not the machine. So the same source builds the same main.js, byte for byte,
// wherever it is built. The Community directory rebuilds each release, perhaps from a checkout with no git history,
// and compares the result with the main.js attached to it; a commit or a time in the bundle made that fail.
//
// package.json and pnpm-lock.yaml are left out: an install may rewrite them, and they change the bundle only through
// the packages they install. Note: in `pnpm dev` watch mode `define` is evaluated once at watch start, so the ID won't
// refresh on every hot rebuild — but the production `build` (which deploy.sh runs) computes it each time.
const BUILD_INPUTS = ['src', 'styles.css', 'manifest.json', 'esbuild.config.mjs', 'tsconfig.json'];
/** Under src, what is not built into main.js: the tests and the Obsidian mock. */
const NOT_BUILT = new Set(['src/__tests__', 'src/__mocks__']);
const inputFiles = (p) => {
  if (NOT_BUILT.has(p) || path.basename(p) === 'node_modules') return [];
  if (!fs.statSync(p).isDirectory()) return [p];
  return fs.readdirSync(p).flatMap((name) => inputFiles(`${p}/${name}`));
};
const buildId = () => {
  const hash = createHash('sha256');
  // Sorted by code unit, so the order is the same on every platform and in every locale.
  for (const file of BUILD_INPUTS.flatMap(inputFiles).sort()) {
    hash.update(file).update('\0').update(fs.readFileSync(file)).update('\0');
  }
  return hash.digest('hex').slice(0, 12);
};
const BUILD_ID = buildId();

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
      __ORBIS_BUILD_ID__: JSON.stringify(BUILD_ID),
      __PIPER_WORKER_SRC__: JSON.stringify(PIPER_WORKER_SRC),
    },
  })
  .then(() => {
    // Keep project-root main.js in sync for releases/CI
    fs.copyFileSync(vaultOut, 'main.js');
  })
  .catch(() => process.exit(1));
