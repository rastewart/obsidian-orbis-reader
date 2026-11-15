// What a widget is called: the heading over it on a dashboard, and its name in the dashboard's settings list.
//
// **One answer for both.** The settings list kept its own table of fallback names, which lost Summary and kept an
// old id for Titles — so a Summary widget with no heading had a blank name there, and its delete prompt asked about
// “”. A widget's name is the Library's heading for it, wherever it is shown.

import { t } from '../i18n';
import type { DashboardWidget, LibraryCollection } from '../settings';
import { GROUP_NONE } from './arrange';
import { SYSTEM_COLLECTION_ID, widgetLabel } from './dashboard';
import { namedKeyLabel } from './keys';

/** The words a widget's heading falls back to, by kind. */
function kindLabels(): Record<string, string> {
  return {
    continue: t('library.continue'),
    titles: t('library.widget_collection'),
    records: t('library.records'),
    recordings: t('library.recordings'),
    recent: t('library.recent'),
    pick: t('library.pick'),
    search: t('library.search'),
    summary: t('library.summary'),
  };
}

/**
 * A widget's heading.
 *
 * A widget's own label wins outright, and a titles widget already reads as its collection's name. Everything
 * else says which collection it drew from — "Search · Tester" — unless that collection is the system one,
 * which is every title in the vault and so tells you nothing. Without this, a search over 200 of 3,000 titles
 * looks like a search that failed the moment something is missing from it.
 */
export function widgetHeading(
  widget: Pick<DashboardWidget, 'kind' | 'collection' | 'label'>,
  collections: readonly LibraryCollection[]
): string {
  const base = widgetLabel(widget, [...collections], kindLabels());
  const collection = collections.find((c) => c.id === widget.collection) ?? null;
  // **A summary says what it counts and how it is cut**, because two of them on one collection — by status and
  // by genre — would otherwise carry the same heading and differ only in their rows.
  if (!widget.label?.trim() && widget.kind === 'summary') {
    const groupBy = collection?.groupBy;
    if (collection && groupBy && groupBy !== GROUP_NONE) {
      const named = namedKeyLabel(groupBy);
      return t('library.summary_label', { collection: collection.name, field: named ? t(named) : groupBy });
    }
  }
  if (widget.label?.trim() || widget.kind === 'titles' || widget.kind === 'records') return base;
  if (!collection || collection.id === SYSTEM_COLLECTION_ID) return base;
  return t('library.widget_scoped', { label: base, collection: collection.name });
}
