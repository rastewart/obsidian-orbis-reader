// What counts as being on a collection. See docs/design/library.md.
//
// A collection is a SOURCE, not a container: a set of rules over a note's folder, its tags and its frontmatter. Nothing
// moves to be gathered, which is what lets one note appear on two collections and lets a collection be "everything
// tagged #scifi, wherever it lives" or "the ones that came from Calibre".
//
// **Rule sets are combined with `any`, and the rules inside a set with that set's `all` or `any`.** That is sum
// of products, and it is the whole grammar on purpose: any flat boolean condition can be written in that form, so
// nesting buys nothing — and without nesting there is no expression to parse, no parentheses, no precedence and
// no error states. Rules are built by picking, never by typing.
//
// Pure arithmetic over paths, tags and frontmatter, so the matching rules can be pinned by tests rather than by
// reproducing a vault every time one comes into question.

import {
  type CollectionRule,
  type CollectionRuleSet,
  type LibraryCollection,
  RULE_FIELD_FOLDER,
  RULE_FIELD_TAG,
  type RuleOperator,
  type RulePeriod,
} from '../settings';
import { type CalendarDate, daysBetween, hasPrecisionFor, inRange, parseRecordDate, periodRange, today } from './dates';
import { fieldKeys } from './fields';
import { type Frontmatter, toStringList } from './record';

/** Everything matching needs to know about a note. Assembled by the caller from `metadataCache`. */
export interface CollectionCandidate {
  path: string;
  /** Every tag on the note, frontmatter and inline, WITHOUT the leading `#`. */
  tags: string[];
  frontmatter?: Frontmatter | null;
}

/** A tag as it is compared: no `#`, lower case. Obsidian tags are case-insensitive to match. */
export function normalizeTag(tag: string): string {
  return tag.trim().replace(/^#/, '').toLowerCase();
}

/**
 * Whether a path is inside a folder.
 *
 * Compared segment-wise rather than by prefix, because `Books2/x.md` starts with `Books` and is not in it —
 * a plain `startsWith` silently pulls a neighboring folder onto the collection. An empty folder means the whole
 * vault, which is how "anywhere" is expressed.
 */
export function isInFolder(path: string, folder: string, includeSubfolders: boolean): boolean {
  const clean = folder.replace(/^\/+|\/+$/g, '');
  if (!clean) return includeSubfolders ? true : !path.includes('/');
  if (!path.startsWith(`${clean}/`)) return false;
  return includeSubfolders ? true : !path.slice(clean.length + 1).includes('/');
}

/** The four that read a value as a number. Offered only where the field holds numbers — see `operatorsFor`. */
export const NUMBER_OPERATORS: readonly RuleOperator[] = ['greater-than', 'at-least', 'less-than', 'at-most'];

/** The five that read a value as a date. Offered only where the field holds dates — see `operatorsFor`. */
export const DATE_OPERATORS: readonly RuleOperator[] = [
  'in-last-days',
  'older-than-days',
  'in-period',
  'before',
  'after',
  'on-date-annually',
];

/**
 * Which operators make sense for a field. A folder is not "contained", it is entered.
 *
 * `dates` says whether this field's values are dates, which the caller answers by sampling the vault — the same
 * question the Time frame row asks. Offering "is in the last 30 days" on `authors` would be a condition that can
 * only ever be false.
 */
export function operatorsFor(field: string, shape: 'text' | 'dates' | 'numbers' = 'text'): RuleOperator[] {
  if (field === RULE_FIELD_FOLDER) return ['under', 'directly-in'];
  if (field === RULE_FIELD_TAG) return ['is', 'is-not', 'exists', 'not-exists'];
  // `contains` is a fragment of text. A number has no fragments — `rating contains 4` would match 14 and 40 — so
  // a numeric field is offered the comparisons instead, the way a folder is offered "under" rather than "contains".
  const base: RuleOperator[] =
    shape === 'numbers'
      ? ['is', 'is-not', 'exists', 'not-exists']
      : ['is', 'is-not', 'contains', 'exists', 'not-exists'];
  if (shape === 'dates') return [...base, ...DATE_OPERATORS];
  if (shape === 'numbers') return [...base, ...NUMBER_OPERATORS];
  return base;
}

/**
 * What the value control has to be for this operator.
 *
 * Five shapes rather than two, because a relative date rule is not a text box: a number of
 * days, a named period and a fixed date are three different questions, and typing `this-month` into a box is a
 * spelling test with one right answer.
 */
export type RuleValueKind = 'none' | 'text' | 'days' | 'period' | 'date' | 'number';

export function ruleValueKind(op: RuleOperator): RuleValueKind {
  if (NUMBER_OPERATORS.includes(op)) return 'number';
  switch (op) {
    // The anniversary asks nothing either: the date it compares against is the note's own.
    case 'exists':
    case 'not-exists':
    case 'on-date-annually':
      return 'none';
    case 'in-last-days':
    case 'older-than-days':
      return 'days';
    case 'in-period':
      return 'period';
    case 'before':
    case 'after':
      return 'date';
    default:
      return 'text';
  }
}

/** Does this operator use the value box at all? `exists` asks only whether there is anything there. */
export function operatorTakesValue(op: RuleOperator): boolean {
  return ruleValueKind(op) !== 'none';
}

/**
 * The values a rule's field holds for a note.
 *
 * Always a list, because frontmatter fields are as often lists as scalars and a rule should not care which:
 * `authors is X` means the same thing whether the note wrote one author or five.
 */
function valuesOf(field: string, note: CollectionCandidate): string[] {
  if (field === RULE_FIELD_FOLDER) return [note.path.split('/').slice(0, -1).join('/')];
  if (field === RULE_FIELD_TAG) return note.tags.map(normalizeTag);
  // Through the reader's field table, like every other read of frontmatter: a rule on `files` has to hold for the
  // note that writes `epub_link`, or a collection excludes the very records whose rows show the field it filters
  // on. `exists` depends on this too — an aliased key IS the field being there.
  for (const key of fieldKeys(field)) {
    const found = toStringList(note.frontmatter?.[key]);
    if (found.length > 0) return found;
  }
  return [];
}

/**
 * Whether one rule holds for a note.
 *
 * `is-not` is a statement about the whole field, not about one of its values: a note whose `authors` includes
 * both X and Y does NOT satisfy `authors is not X`, and a note with no author at all does — it is not by them.
 * The alternative reading (some value differs) is true for almost every multi-valued field, which is never what
 * anyone meant.
 */
export function matchesRule(rule: CollectionRule, note: CollectionCandidate, now: CalendarDate = today()): boolean {
  const values = valuesOf(rule.field, note);

  if (rule.op === 'exists') return values.some((v) => v.trim().length > 0);
  if (rule.op === 'not-exists') return !values.some((v) => v.trim().length > 0);
  if (DATE_OPERATORS.includes(rule.op)) return matchesDateRule(rule, values, now);
  if (NUMBER_OPERATORS.includes(rule.op)) return matchesNumberRule(rule, values);

  if (rule.field === RULE_FIELD_FOLDER) {
    // Folder rules compare the note's PATH rather than its folder value, so nesting and the vault root are
    // handled by the one function that already knows `Books2` is not inside `Books`.
    return isInFolder(note.path, rule.value, rule.op === 'under');
  }

  const wanted = rule.value.trim().toLowerCase();
  // A tag rule matches a nested child, as Obsidian's own search and tag pane do: `#library` collections
  // `#library/wishlist`.
  const hit =
    rule.field === RULE_FIELD_TAG
      ? values.some((v) => v === normalizeTag(rule.value) || v.startsWith(`${normalizeTag(rule.value)}/`))
      : values.some((v) => (rule.op === 'contains' ? v.toLowerCase().includes(wanted) : v.toLowerCase() === wanted));

  return rule.op === 'is-not' ? !hit : hit;
}

/**
 * Whether a comparison holds for any of a field's numbers.
 *
 * **A value that is not a number never satisfies one** — `rating: unknown` is not "at least 4", the same rule the
 * date operators follow. Any value counts, as everywhere else here: a field holding several numbers satisfies the
 * comparison if one of them does.
 */
function matchesNumberRule(rule: CollectionRule, values: string[]): boolean {
  const edge = Number(rule.value.trim());
  if (rule.value.trim() === '' || !Number.isFinite(edge)) return false;
  const numbers = values
    .map((value) => Number(value.trim()))
    .filter((value, index) => values[index].trim() !== '' && Number.isFinite(value));
  switch (rule.op) {
    case 'greater-than':
      return numbers.some((value) => value > edge);
    case 'at-least':
      return numbers.some((value) => value >= edge);
    case 'less-than':
      return numbers.some((value) => value < edge);
    case 'at-most':
      return numbers.some((value) => value <= edge);
    default:
      return false;
  }
}

/**
 * Whether a date rule holds for any of a field's values.
 *
 * **Any value, like every other rule here.** A record with two dates in one field satisfies "in the last 30 days"
 * if either does, which is the reading `is` already has.
 *
 * **A value that is not a date never satisfies a date rule** — not even `is more than 365 days ago`, where
 * "unknown" might feel old. A rule about time cannot be answered by something that is not a time, and a filter
 * that quietly said yes would put those records in a collection nobody could explain.
 *
 * **The anniversary needs a day; the rest accept a year.** `on this date, any year` compares a month and a day,
 * so a note saying only `2016` cannot answer it. The others read a partial date as the first day it could mean,
 * which is the same approximation the aging bands make and for the same reason: requiring a full date would drop
 * every year-only date — a large share of most catalogs — out of every date filter.
 */
function matchesDateRule(rule: CollectionRule, values: string[], now: CalendarDate): boolean {
  const dates = values.map((value) => parseRecordDate(value)).filter((date): date is CalendarDate => date !== null);
  if (dates.length === 0) return false;
  const days = Number(rule.value.trim());
  switch (rule.op) {
    case 'in-last-days':
      // Inclusive, and a date ahead of today counts as within any window: it has not been that long since it,
      // because it has not happened. Something published tomorrow is not "more than 30 days old".
      return Number.isFinite(days) && dates.some((date) => daysBetween(date, now) <= days);
    case 'older-than-days':
      return Number.isFinite(days) && dates.some((date) => daysBetween(date, now) > days);
    case 'in-period': {
      const range = periodRange(rule.value.trim() as RulePeriod, now);
      return dates.some((date) => inRange(date, range));
    }
    case 'before': {
      const edge = parseRecordDate(rule.value.trim());
      return edge !== null && dates.some((date) => daysBetween(date, edge) > 0);
    }
    case 'after': {
      const edge = parseRecordDate(rule.value.trim());
      return edge !== null && dates.some((date) => daysBetween(edge, date) > 0);
    }
    case 'on-date-annually':
      return dates.some((date) => hasPrecisionFor(date, 'day') && date.month === now.month && date.day === now.day);
    default:
      return false;
  }
}

/**
 * Whether a set holds: every rule, or any rule.
 *
 * **An empty set matches nothing**, whichever way it combines. Logic would call "all of no rules" true, but a
 * half-built collection that sweeps the whole vault until you finish typing is a trap, and the safe reading costs
 * nothing: the count simply reads zero until the first rule exists.
 */
export function matchesRuleSet(set: CollectionRuleSet, note: CollectionCandidate): boolean {
  // A set with nothing in it matches nothing, which is what keeps a condition group added and not yet filled in
  // from gathering the whole vault for as long as it takes to fill it in.
  if (set.rules.length === 0) return false;
  return set.match === 'any'
    ? set.rules.some((rule) => matchesRule(rule, note))
    : set.rules.every((rule) => matchesRule(rule, note));
}

/**
 * Whether a note belongs on a collection: any set matches.
 *
 * **No conditions means no narrowing — every title.** Reading it as nothing would force anyone who wanted the
 * whole catalog with their own grouping to invent a tautology: `file.folder under ""`, or `title exists`. The
 * population is already every note carrying
 * `orbis_note: title` — that is the identity test, not a filter — so a collection with nothing to say about which
 * of them it wants has an obvious answer, and it is the useful one: the provided All titles is rebuilt from code
 * and cannot be edited, so a collection with no rules is the only way to arrange the whole library your own way.
 *
 * A set with no rules INSIDE it is a different case — see `matchesRuleSet`. That one is a no-op, so a
 * half-built condition group does not briefly gather the vault.
 */
export function matchesCollection(collection: LibraryCollection, note: CollectionCandidate): boolean {
  const sets = (collection.ruleSets ?? []).filter((set) => set.rules.length > 0);
  if (sets.length === 0) return true;
  return sets.some((set) => matchesRuleSet(set, note));
}

/** Rules across every set — what "3 rules" in the settings row counts. */
export function countRules(collection: LibraryCollection): number {
  return (collection.ruleSets ?? []).reduce((n, set) => n + set.rules.length, 0);
}

/**
 * Rules from the shape collections had before rules existed: a folder, a tag and one property, all narrowing.
 *
 * Run once at load on collections that have no `ruleSets`. The old fields meant AND, so they become a single `all`
 * set. Kept as a pure function rather than inlined into the migration, because a migration is the one thing that
 * cannot be re-run to fix and so is the thing most worth testing without a vault.
 */
export function rulesFromLegacyCollection(collection: LibraryCollection): CollectionRuleSet[] {
  const rules: CollectionRule[] = [];
  const folder = (collection.folder ?? '').trim().replace(/^\/+|\/+$/g, '');
  if (folder) {
    rules.push({
      field: RULE_FIELD_FOLDER,
      op: collection.includeSubfolders === false ? 'directly-in' : 'under',
      value: folder,
    });
  }
  const tag = normalizeTag(collection.tag ?? '');
  if (tag) rules.push({ field: RULE_FIELD_TAG, op: 'is', value: tag });
  const property = (collection.property ?? '').trim();
  if (property) {
    const value = (collection.value ?? '').trim();
    // An empty value means "has this property at all", which is exactly what `exists` says.
    rules.push({ field: property, op: value ? 'is' : 'exists', value });
  }
  return rules.length > 0 ? [{ match: 'all', rules }] : [];
}
