// The test fixtures this build was made with, pinned: the SHA-256 of `orbis-test-fixtures.zip` as main's fixtures
// pack it (`scripts/test-fixtures-zip.ts`).
//
// **Pinned like the dictionaries.** *Download test fixtures (dev)* downloads the zip named by this digest from the
// `test-fixtures` release and refuses one that does not hash to it, so a build gets exactly the fixtures of its own
// commit, however long ago it was made, and nothing damaged or altered is written. The release keeps every zip it has
// held, and never replaces one, so a build two weeks old still finds its own.
//
// **Changed by `pnpm pin:fixtures`, never by hand.** A fixture added or changed without it fails the gate
// (`test-fixtures-pin.test.ts`). This file imports nothing, so the scripts can read it under `tsx`.

export const TEST_FIXTURES_SHA256 = 'd9f28d0eb6724f94a36e26ad5864653e99b1b77dce85e89fd8b4011a7f1f9e3e';

/** The release file holding the fixtures with this digest: its first twelve hex digits are in the name. */
export function testFixturesFile(sha256: string = TEST_FIXTURES_SHA256): string {
  return `orbis-test-fixtures-${sha256.slice(0, 12)}.zip`;
}
