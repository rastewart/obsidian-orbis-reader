// Build ID injected by esbuild `define` at build time (see esbuild.config.mjs).
// The `typeof` guard means vitest and `pnpm dev` — which don't run the production
// define — fall back to 'dev' instead of throwing on the undeclared identifier
// (`typeof <undeclared>` is the one reference that never throws in JS).
declare const __ORBIS_BUILD_ID__: string;

/**
 * A hash of the files this artifact was built from (12 hex digits), or 'dev'. The same source always gives the same
 * ID, and any change to it a new one, so it tells two builds apart without a commit or a time in the bundle.
 */
export const BUILD_ID: string = typeof __ORBIS_BUILD_ID__ !== 'undefined' ? __ORBIS_BUILD_ID__ : 'dev';

/** One-line build label for the debug-log header, e.g. "Orbis build 3f2a9c1d0e4b". */
export function buildLabel(): string {
  return `Orbis build ${BUILD_ID}`;
}
