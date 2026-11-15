import { describe, expect, it } from 'vitest';
import {
  bucketOf,
  type CalendarDate,
  daysBetween,
  hasPrecisionFor,
  leftoversKeyFor,
  parseRecordDate,
  type TimeBucket,
  today,
  weekOf,
} from '../library/dates';

const day = (year: number, month: number, d: number): CalendarDate => ({
  year,
  month,
  day: d,
  precision: 'day',
});

/** A date a note stated only to the year — common for publication dates. */
const yearOnly = (year: number): CalendarDate => ({ year, month: 1, day: 1, precision: 'year' });

/** `bucketOf` where the date is known to say enough — the tests that are not about precision. */
const bucket = (date: CalendarDate, frame: Parameters<typeof bucketOf>[1], now?: CalendarDate): TimeBucket => {
  const found = bucketOf(date, frame, now);
  if (!found) throw new Error('expected a bucket');
  return found;
};

describe('parseRecordDate', () => {
  it('reads the ISO forms a catalog writes', () => {
    expect(parseRecordDate('2026-08-16')).toEqual(day(2026, 8, 16));
    expect(parseRecordDate('2026-08-16T14:30:00Z')).toEqual(day(2026, 8, 16));
    expect(parseRecordDate(' 2026-08-16 ')).toEqual(day(2026, 8, 16));
  });

  // The first day it could mean, so a year-only publication date sorts with everything else — but it says how
  // much it knew, which is what stops a by-month grouping calling it January.
  it('reads a partial date as its first day, and says so', () => {
    expect(parseRecordDate('2026')).toEqual({ year: 2026, month: 1, day: 1, precision: 'year' });
    expect(parseRecordDate('2026-08')).toEqual({ year: 2026, month: 8, day: 1, precision: 'month' });
    expect(parseRecordDate('2026-08-16')?.precision).toBe('day');
  });

  // `file.last-opened` is epoch milliseconds from the sidecars, which is what makes "what did I read this month"
  // a grouping rather than a widget of its own.
  it('reads a timestamp as the local day it fell on', () => {
    const at = new Date(2026, 7, 16, 20, 30).getTime();
    expect(parseRecordDate(at)).toEqual(day(2026, 8, 16));
  });

  // Ambiguous by locale: guessing wrong files a book in the wrong month silently.
  it('refuses a slashed date', () => {
    expect(parseRecordDate('08/16/2026')).toBeNull();
    expect(parseRecordDate('16/08/2026')).toBeNull();
  });

  it('refuses what is not a date at all', () => {
    expect(parseRecordDate('')).toBeNull();
    expect(parseRecordDate('unknown')).toBeNull();
    expect(parseRecordDate(null)).toBeNull();
    expect(parseRecordDate(undefined)).toBeNull();
    expect(parseRecordDate(0)).toBeNull();
  });

  // A `Date` would roll this into March and report it as a date, which is worse than refusing it.
  it('refuses a day the month does not have', () => {
    expect(parseRecordDate('2026-02-30')).toBeNull();
    expect(parseRecordDate('2026-13-01')).toBeNull();
    // A leap day that exists is still a date.
    expect(parseRecordDate('2024-02-29')).toEqual(day(2024, 2, 29));
  });
});

describe('daysBetween', () => {
  it('counts whole calendar days', () => {
    expect(daysBetween(day(2026, 8, 1), day(2026, 8, 16))).toBe(15);
    expect(daysBetween(day(2026, 8, 16), day(2026, 8, 16))).toBe(0);
  });

  // Ahead of today is negative, which is what the Upcoming band reads.
  it('goes negative for a date ahead', () => {
    expect(daysBetween(day(2027, 1, 1), day(2026, 8, 16))).toBeLessThan(0);
  });

  // One of these days is 23 hours long in a zone that observes it; truncating would report the day before.
  it('survives a daylight-saving change', () => {
    expect(daysBetween(day(2026, 3, 1), day(2026, 4, 1))).toBe(31);
    expect(daysBetween(day(2026, 10, 1), day(2026, 11, 1))).toBe(31);
  });
});

describe('weekOf', () => {
  // Monday, ISO 8601 — which also settles what "last week" means in a filter.
  it('starts a week on Monday', () => {
    // 2026-08-16 is a Sunday; its week began on Monday the 10th.
    expect(weekOf(day(2026, 8, 16)).monday).toEqual(day(2026, 8, 10));
    expect(weekOf(day(2026, 8, 10)).monday).toEqual(day(2026, 8, 10));
  });

  // A week belongs to the year holding most of it, so one can be week 1 of the next year while its Monday is
  // still in December.
  it('numbers a week by its Thursday', () => {
    expect(weekOf(day(2026, 1, 1))).toMatchObject({ year: 2026, week: 1 });
    expect(weekOf(day(2025, 12, 29))).toMatchObject({ year: 2026, week: 1 });
  });
});

describe('bucketOf', () => {
  const date = day(2026, 8, 16);

  it('labels for a reader and keys for a sort', () => {
    expect(bucket(date, 'year')).toEqual({ key: '2026', label: '2026' });
    expect(bucket(date, 'quarter')).toEqual({ key: '2026-Q3', label: '2026 Q3' });
    expect(bucket(date, 'month')).toEqual({ key: '2026-08', label: 'August 2026' });
    expect(bucket(date, 'day')).toEqual({ key: '2026-08-16', label: '16 August 2026' });
    expect(bucket(date, 'decade')).toEqual({ key: '2020', label: '2020s' });
  });

  // The whole reason a key sits beside the label: chronological order is not alphabetical order.
  it('keys months so they sort chronologically', () => {
    const keys = [day(2026, 12, 1), day(2026, 2, 1), day(2026, 8, 1)].map((d) => bucket(d, 'month').key);
    expect([...keys].sort()).toEqual(['2026-02', '2026-08', '2026-12']);
  });

  it('drops the year where that is the question', () => {
    expect(bucket(date, 'month-of-year')).toEqual({ key: '08', label: 'August' });
    expect(bucket(day(1999, 8, 2), 'month-of-year').key).toBe('08');
  });

  describe('aging', () => {
    const now = day(2026, 8, 16);
    const band = (d: CalendarDate): string => bucket(d, 'aging', now).label;

    it('bands by how long ago, from today', () => {
      expect(band(day(2026, 8, 16))).toBe('Last 30 days');
      expect(band(day(2026, 7, 20))).toBe('Last 30 days');
      expect(band(day(2026, 6, 20))).toBe('31–60 days');
      expect(band(day(2026, 5, 20))).toBe('61–90 days');
      expect(band(day(2026, 3, 1))).toBe('91–180 days');
      expect(band(day(2025, 10, 1))).toBe('181–365 days');
      expect(band(day(2020, 1, 1))).toBe('Over a year');
    });

    // Inclusive: something dated exactly 30 days ago is in the last 30 days.
    it('includes its boundary', () => {
      expect(band(day(2026, 7, 17))).toBe('Last 30 days');
      expect(band(day(2026, 7, 16))).toBe('31–60 days');
    });

    // A date ahead of today is a real category for a publication date — and not the same fact as having no date.
    it('puts a future date in Upcoming', () => {
      expect(band(day(2027, 1, 1))).toBe('Upcoming');
      expect(bucket(day(2027, 1, 1), 'aging', now).key).toBe('0000');
    });

    // Bands partition: every band has to sort before the next, so a reversed grouping reads oldest-first cleanly.
    it('keys the bands in order', () => {
      const keys = [day(2027, 1, 1), day(2026, 8, 16), day(2026, 6, 20), day(2020, 1, 1)].map(
        (d) => bucket(d, 'aging', now).key
      );
      expect(keys).toEqual(['0000', '0030', '0060', '9999']);
      expect([...keys].sort()).toEqual(keys);
    });
  });
});

describe('today', () => {
  it('reads the clock in the reader’s own zone', () => {
    expect(today(new Date(2026, 7, 16, 23, 59))).toEqual(day(2026, 8, 16));
  });
});

// Many publication dates are year-only. Reading those as January would put most of a catalog in one month, which
// looks like a publishing habit.
describe('precision', () => {
  it('answers a frame that needs only the year', () => {
    expect(bucketOf(yearOnly(2016), 'year')).toEqual({ key: '2016', label: '2016' });
    expect(bucketOf(yearOnly(2016), 'decade')).toEqual({ key: '2010', label: '2010s' });
  });

  // The case this block exists for.
  it('refuses to call a year-only date January', () => {
    expect(bucketOf(yearOnly(2016), 'month')).toBeNull();
    expect(bucketOf(yearOnly(2016), 'month-of-year')).toBeNull();
    expect(bucketOf(yearOnly(2016), 'quarter')).toBeNull();
  });

  it('refuses a day of a date that named only its month', () => {
    const monthOnly: CalendarDate = { year: 2026, month: 8, day: 1, precision: 'month' };
    expect(bucketOf(monthOnly, 'month')).toEqual({ key: '2026-08', label: 'August 2026' });
    expect(bucketOf(monthOnly, 'day')).toBeNull();
    expect(bucketOf(monthOnly, 'week')).toBeNull();
  });

  // Coarse enough that 1 January lands in the right band nearly always, and requiring a day would drop every
  // year-only date out of an aging grouping entirely.
  it('lets a year-only date age', () => {
    expect(bucketOf(yearOnly(2016), 'aging', day(2026, 8, 16))?.label).toBe('Over a year');
  });

  it('says what each frame needs', () => {
    expect(hasPrecisionFor(yearOnly(2016), 'year')).toBe(true);
    expect(hasPrecisionFor(yearOnly(2016), 'month')).toBe(false);
    expect(hasPrecisionFor(day(2026, 8, 16), 'day')).toBe(true);
  });
});

// A note dated `2017` grouped by month HAS a date and no month, so a row calling it "No date" argues with the
// year printed beside it. The leftovers are named for what the frame needed and the note did not say.
describe('leftoversKeyFor', () => {
  it('asks for a date where only a year is needed', () => {
    expect(leftoversKeyFor('year')).toBe('date');
    expect(leftoversKeyFor('decade')).toBe('date');
    expect(leftoversKeyFor('aging')).toBe('date');
  });

  it('asks for a month where a month is needed', () => {
    expect(leftoversKeyFor('month')).toBe('month');
    expect(leftoversKeyFor('month-of-year')).toBe('month');
    expect(leftoversKeyFor('quarter')).toBe('month');
  });

  it('asks for a full date where a day is needed', () => {
    expect(leftoversKeyFor('week')).toBe('full');
    expect(leftoversKeyFor('day')).toBe('full');
  });
});
