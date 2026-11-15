// Reading a date out of a record, and the two things a library asks of one.
//
// **One parser, two derivations, both ends.** "Added in the last 30 days" is a filter over a computed value and
// "added, by month" is a grouping over the same one — so the parsing, the calendar arithmetic and the definition
// of a quarter live here once. Built separately, the filter and the grouping would eventually disagree about
// which week a Sunday belongs to, and only one of them would be wrong.
//
// See docs/design/library.md §Dates, grouped and filtered.

import type { RulePeriod } from '../settings';

/**
 * A date, as a local calendar day.
 *
 * **Local, deliberately.** A frontmatter date has no timezone — `2026-08-16` is a day, not an instant — and
 * parsing it as UTC puts a book finished at 8pm on the 31st into the following month for anyone west of
 * Greenwich. `new Date(2026, 7, 16)` builds the day in the reader's own zone, which is the one they wrote it in.
 */
export interface CalendarDate {
  year: number;
  /** 1–12, not the 0–11 `Date` uses: this is read by humans in labels and keys. */
  month: number;
  day: number;
  /**
   * How much of this date the note actually stated.
   *
   * **`2016` is not January.** A partial date is read as the first day it could mean, which is right for sorting
   * and for a year or a decade — and a fiction the moment something asks which MONTH it was. Many publication
   * dates are year-only, so a by-month grouping would put most of a catalog in January and look like a publishing
   * habit.
   *
   * So the precision travels with the date, and a bucket that needs more than it has says so instead of
   * guessing. Same rule as refusing `08/16/2026`: better to answer "no date" than to be believed.
   */
  precision: 'year' | 'month' | 'day';
}

/** ISO forms only — see the note on `parseRecordDate`. */
const ISO = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?(?:[T ]|$)/;

/**
 * The date a value holds, or null.
 *
 * **ISO forms and epoch milliseconds, and nothing else.** `2026`, `2026-08`, `2026-08-16` and full timestamps
 * cover what a catalog writes and what Orbis writes; `08/16/2026` is refused because it is ambiguous by locale,
 * and guessing wrong files a book in the wrong month silently — the kind of error nobody reports because it reads
 * as their own misremembering. A number is `file.last-opened`, which the sidecars keep as milliseconds.
 *
 * A partial date is the FIRST day it could mean: `2026` is 1 January 2026, `2026-08` is the 1st. That is what
 * makes a year-only publication date sort and bucket with everything else instead of needing a rule of its own.
 */
export function parseRecordDate(value: string | number | null | undefined): CalendarDate | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return null;
    const at = new Date(value);
    // A timestamp knows the instant, so it knows the day.
    return { year: at.getFullYear(), month: at.getMonth() + 1, day: at.getDate(), precision: 'day' };
  }
  const match = ISO.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = match[2] ? Number(match[2]) : 1;
  const day = match[3] ? Number(match[3]) : 1;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  // A day the month does not have — `2026-02-30` — is a typo rather than a date, and a `Date` would roll it
  // silently into March.
  const built = new Date(year, month - 1, day);
  if (built.getMonth() + 1 !== month || built.getDate() !== day) return null;
  return { year, month, day, precision: match[3] ? 'day' : match[2] ? 'month' : 'year' };
}

/** Midnight local on this calendar day — the form the arithmetic needs. */
function toDate(date: CalendarDate): Date {
  return new Date(date.year, date.month - 1, date.day);
}

/** Whole days from `from` to `to`, counted in local calendar days rather than in 24-hour slices. */
export function daysBetween(from: CalendarDate, to: CalendarDate): number {
  const ms = toDate(to).getTime() - toDate(from).getTime();
  // Rounded, not truncated: a daylight-saving change makes one of these days 23 or 25 hours long, and truncating
  // would report the day before.
  return Math.round(ms / 86_400_000);
}

/**
 * Today as `YYYY-MM-DD`, in the reader's own calendar — what every date Orbis stamps on a note or an export means.
 *
 * **Not `toISOString()`, which is UTC.** After 8 p.m. in New York it is already tomorrow there, so a book finished
 * that evening was stamped with the next day — and on 31 December with the next year, outside the *this year* the
 * library counts in local days (`today`).
 */
export function isoToday(now: Date = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Today, as a calendar day. Passed in wherever it matters, so nothing here has to be tested against a clock. */
export function today(now: Date = new Date()): CalendarDate {
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate(), precision: 'day' };
}

/** How a date field is cut up: by where it sits in a calendar, or by how long ago it was. */
export type TimeFrame = 'year' | 'quarter' | 'month' | 'week' | 'day' | 'month-of-year' | 'decade' | 'aging';

/** A bucket: what it is called, and the key it sorts by. */
export interface TimeBucket {
  label: string;
  /** Sorts as text, chronologically — see the note in the design doc on why a label cannot do this. */
  key: string;
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const pad = (n: number, width = 2): string => String(n).padStart(width, '0');

/**
 * The Monday of this date's week, and the ISO week number.
 *
 * **Weeks start on Monday** (ISO 8601), which also settles what "last week" means in a filter. Sunday belonging
 * to the week that just ended is the half of that rule people notice.
 */
export function weekOf(date: CalendarDate): { monday: CalendarDate; year: number; week: number } {
  const at = toDate(date);
  // `getDay()` is 0 for Sunday; ISO counts Monday as 1 and Sunday as 7.
  const weekday = at.getDay() === 0 ? 7 : at.getDay();
  const monday = new Date(at.getFullYear(), at.getMonth(), at.getDate() - (weekday - 1));
  // The ISO week number is defined by the Thursday of that week: the year a week belongs to is the year holding
  // most of it, which is why a week can be week 1 of the next year while its Monday is still in December.
  const thursday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 3);
  const firstThursday = new Date(thursday.getFullYear(), 0, 4);
  const firstWeekday = firstThursday.getDay() === 0 ? 7 : firstThursday.getDay();
  const firstMonday = new Date(firstThursday.getFullYear(), 0, 4 - (firstWeekday - 1));
  const week = Math.round((thursday.getTime() - firstMonday.getTime()) / (7 * 86_400_000)) + 1;
  return {
    monday: {
      year: monday.getFullYear(),
      month: monday.getMonth() + 1,
      day: monday.getDate(),
      precision: 'day',
    },
    year: thursday.getFullYear(),
    week,
  };
}

/** The bands, oldest boundary last. `Infinity` is "everything beyond", which is the last band by definition. */
const AGING_BANDS: Array<{ upTo: number; key: string; label: string }> = [
  { upTo: 30, key: '0030', label: 'Last 30 days' },
  { upTo: 60, key: '0060', label: '31–60 days' },
  { upTo: 90, key: '0090', label: '61–90 days' },
  { upTo: 180, key: '0180', label: '91–180 days' },
  { upTo: 365, key: '0365', label: '181–365 days' },
  { upTo: Number.POSITIVE_INFINITY, key: '9999', label: 'Over a year' },
];

/**
 * Which bucket a date falls in.
 *
 * `now` is a parameter rather than a call to the clock, because aging is the one derivation whose answer changes
 * without the data changing — and a function that reads the clock cannot be tested for the boundary it is most
 * likely to get wrong.
 *
 * **Bands partition.** "Last 30 days" and "31–60 days" cannot overlap, or a record would belong to two groups; a
 * FILTER saying "in the last 60 days" includes the last 30, which is the opposite rule and the right one for
 * selecting rather than dividing.
 */
/** What each frame has to know before it can answer. */
const NEEDS: Record<TimeFrame, 'year' | 'month' | 'day'> = {
  year: 'year',
  decade: 'year',
  // Coarse enough that a year-only date read as 1 January lands in the right band nearly always — and requiring
  // a day would drop every year-only date out of an aging grouping entirely.
  aging: 'year',
  quarter: 'month',
  month: 'month',
  'month-of-year': 'month',
  week: 'day',
  day: 'day',
};

const RANK = { year: 1, month: 2, day: 3 } as const;

/**
 * What a frame's leftovers row is called: **named for what is missing, not for the field.**
 *
 * "No date" is wrong once a time frame needs more than a date: a note saying `2017` has a date, so
 * grouping by month and filing it under "No date" contradicts the year printed on the row beside it. What it
 * lacks is a month, and that is what the row should say — for the notes with no date at all as well, since they
 * lack a month too.
 */
export function leftoversKeyFor(frame: TimeFrame): 'date' | 'month' | 'full' {
  const needs = NEEDS[frame];
  return needs === 'year' ? 'date' : needs === 'month' ? 'month' : 'full';
}

/** Whether this date says enough to be put in this kind of bucket. */
export function hasPrecisionFor(date: CalendarDate, frame: TimeFrame): boolean {
  return RANK[date.precision] >= RANK[NEEDS[frame]];
}

/**
 * Which bucket a date falls in, or **null when the date does not say enough** — a year-only value has no month,
 * so asking which month it was is a question it cannot answer. The caller files those with the other records
 * that have no date, where they are counted and visible rather than silently filling January.
 */
export function bucketOf(date: CalendarDate, frame: TimeFrame, now: CalendarDate = today()): TimeBucket | null {
  if (!hasPrecisionFor(date, frame)) return null;
  switch (frame) {
    case 'year':
      return { key: String(date.year), label: String(date.year) };
    case 'quarter': {
      const quarter = Math.floor((date.month - 1) / 3) + 1;
      return { key: `${date.year}-Q${quarter}`, label: `${date.year} Q${quarter}` };
    }
    case 'month':
      return { key: `${date.year}-${pad(date.month)}`, label: `${MONTHS[date.month - 1]} ${date.year}` };
    case 'week': {
      const { monday, year, week } = weekOf(date);
      return {
        key: `${year}-W${pad(week)}`,
        label: `Week of ${monday.day} ${MONTHS[monday.month - 1].slice(0, 3)} ${monday.year}`,
      };
    }
    case 'day':
      return {
        key: `${date.year}-${pad(date.month)}-${pad(date.day)}`,
        label: `${date.day} ${MONTHS[date.month - 1]} ${date.year}`,
      };
    // The two that drop part of the date on purpose: one answers "do I buy books in December", the other makes a
    // publication-date grouping usable where by year it is eighty groups of one.
    case 'month-of-year':
      return { key: pad(date.month), label: MONTHS[date.month - 1] };
    case 'decade': {
      const decade = Math.floor(date.year / 10) * 10;
      return { key: String(decade), label: `${decade}s` };
    }
    case 'aging': {
      const days = daysBetween(date, now);
      // Dated after today: a real category for a publication date, and not the same fact as having no date.
      if (days < 0) return { key: '0000', label: 'Upcoming' };
      const band = AGING_BANDS.find((entry) => days <= entry.upTo) ?? AGING_BANDS[AGING_BANDS.length - 1];
      return { key: band.key, label: band.label };
    }
  }
}

/** A stretch of the calendar, inclusive at both ends. */
export interface DateRange {
  from: CalendarDate;
  to: CalendarDate;
}

const shift = (date: CalendarDate, days: number): CalendarDate => {
  const at = new Date(date.year, date.month - 1, date.day + days);
  return { year: at.getFullYear(), month: at.getMonth() + 1, day: at.getDate(), precision: 'day' };
};

const lastDayOf = (year: number, month: number): number => new Date(year, month, 0).getDate();

const monthRange = (year: number, month: number): DateRange => ({
  from: { year, month, day: 1, precision: 'day' },
  to: { year, month, day: lastDayOf(year, month), precision: 'day' },
});

/**
 * The days a named period covers, from today.
 *
 * **Whole periods, not rolling windows.** "This month" is the 1st to the last day of the month you are in, and
 * "last month" is the one before it — not "the last 30 days", which is what `in-last-days` is for. The two read
 * similarly and answer differently, and someone asking for last month at the start of a month means the month
 * that just ended rather than the four weeks behind them.
 */
export function periodRange(period: RulePeriod, now: CalendarDate = today()): DateRange {
  switch (period) {
    case 'this-week': {
      const monday = weekOf(now).monday;
      return { from: monday, to: shift(monday, 6) };
    }
    case 'last-week': {
      const monday = shift(weekOf(now).monday, -7);
      return { from: monday, to: shift(monday, 6) };
    }
    case 'this-month':
      return monthRange(now.year, now.month);
    case 'last-month':
      return now.month === 1 ? monthRange(now.year - 1, 12) : monthRange(now.year, now.month - 1);
    case 'this-quarter': {
      const first = Math.floor((now.month - 1) / 3) * 3 + 1;
      return {
        from: { year: now.year, month: first, day: 1, precision: 'day' },
        to: { year: now.year, month: first + 2, day: lastDayOf(now.year, first + 2), precision: 'day' },
      };
    }
    case 'last-quarter': {
      const first = Math.floor((now.month - 1) / 3) * 3 + 1;
      const year = first === 1 ? now.year - 1 : now.year;
      const start = first === 1 ? 10 : first - 3;
      return {
        from: { year, month: start, day: 1, precision: 'day' },
        to: { year, month: start + 2, day: lastDayOf(year, start + 2), precision: 'day' },
      };
    }
    case 'this-year':
      return {
        from: { year: now.year, month: 1, day: 1, precision: 'day' },
        to: { year: now.year, month: 12, day: 31, precision: 'day' },
      };
    case 'last-year':
      return {
        from: { year: now.year - 1, month: 1, day: 1, precision: 'day' },
        to: { year: now.year - 1, month: 12, day: 31, precision: 'day' },
      };
  }
}

/** Whether a date falls inside a range, ends included. */
export function inRange(date: CalendarDate, range: DateRange): boolean {
  return daysBetween(range.from, date) >= 0 && daysBetween(date, range.to) >= 0;
}
