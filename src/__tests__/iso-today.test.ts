// The date Orbis stamps on a note — `date_read`, `added`, an export's `{{today}}` — is the reader's own day.
//
// A file of its own because it sets the time zone: the tests otherwise run in UTC, where local and UTC agree and
// the bug this guards against cannot be seen.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isoToday } from '../library/dates';

/** Node's own, at runtime — the plugin's tsconfig has no Node types (see `asset-integrity.test.ts`). */
declare const process: { env: Record<string, string | undefined> };

describe('isoToday', () => {
  const zone = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = 'America/New_York';
  });
  afterAll(() => {
    process.env.TZ = zone;
  });

  it('is the local day in the evening, when UTC has already moved on', () => {
    // 9:30 p.m. on New Year's Eve in New York is 2:30 a.m. on 1 January in UTC.
    const evening = new Date(2026, 11, 31, 21, 30);
    expect(evening.toISOString().slice(0, 10)).toBe('2027-01-01');
    expect(isoToday(evening)).toBe('2026-12-31');
  });

  it('pads the month and day', () => {
    expect(isoToday(new Date(2026, 2, 5, 12, 0))).toBe('2026-03-05');
  });
});
