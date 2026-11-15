// What a cataloging run wrote, in one line over its report.

import { t } from '../i18n';

/** The line over a cataloging run's report: what it wrote, attached and updated, each counted on its own. */
export function catalogResultSummary(created: number, attached: number, updated: number): string {
  const counted = (
    n: number,
    key:
      | 'library.catalog_result_wrote'
      | 'library.catalog_result_attached_files'
      | 'library.catalog_result_updated_notes'
  ): string => (n === 1 ? t(`${key}_one`) : t(key, { count: String(n) }));
  const parts: string[] = [];
  if (created) parts.push(counted(created, 'library.catalog_result_wrote'));
  if (attached) parts.push(counted(attached, 'library.catalog_result_attached_files'));
  if (updated) parts.push(counted(updated, 'library.catalog_result_updated_notes'));
  return parts.length ? parts.join(' ') : t('library.catalog_result_nothing');
}
