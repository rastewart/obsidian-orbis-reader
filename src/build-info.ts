// Build stamp injected by esbuild `define` at build time (see esbuild.config.mjs).
// The `typeof` guard means vitest and `pnpm dev` — which don't run the production
// define — fall back to 'dev' instead of throwing on the undeclared identifier
// (`typeof <undeclared>` is the one reference that never throws in JS).
declare const __ORBIS_BUILD_TIME__: string;
declare const __ORBIS_BUILD_COMMIT__: string;

/** UTC timestamp (to the second) when this artifact was built, or 'dev'. */
export const BUILD_TIME: string = typeof __ORBIS_BUILD_TIME__ !== 'undefined' ? __ORBIS_BUILD_TIME__ : 'dev';

/** Short git commit this artifact was built from (with `-dirty` if uncommitted), or 'dev'. */
export const BUILD_COMMIT: string = typeof __ORBIS_BUILD_COMMIT__ !== 'undefined' ? __ORBIS_BUILD_COMMIT__ : 'dev';

/** One-line build label for the debug-log header, e.g. "Orbis build 2026-07-11T01:40:56Z · a1b2c3d-dirty". */
export function buildLabel(): string {
  return `Orbis build ${BUILD_TIME} · ${BUILD_COMMIT}`;
}
