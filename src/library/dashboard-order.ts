// Which dashboards this device shows, and in what order. See docs/design/library.md §Where configuration lives.
//
// **A dashboard is shared and used per device**, and that split is worth more than either half alone: build one on
// the desktop, switch it off there, and it is live only on the phone. It also gives a draft state — a dashboard that
// exists and is switched off everywhere — which is otherwise only expressible by not having built it.
//
// So the dashboard says what it IS, and this list says what this device does with it. Reordering therefore publishes
// nothing, which is the point: it is a cosmetic act, and making it rewrite what other devices read would invite
// conflicts for no gain. The list itself lives beside the device — see `dashboard-place.ts`.
//
// Widget-level `enabled` stays in the dashboard, deliberately. A widget is part of what a dashboard IS, and
// making it per-device too would produce a state nobody can hold in their head: this dashboard, on this device, with
// these four of its seven widgets. The feature that already solves that is a second dashboard.

import type { LibraryDashboard } from '../settings';

/** One dashboard's place on this device: where it comes, and whether this device uses it. */
export interface DashboardPlace {
  id: string;
  enabled: boolean;
}

/**
 * The dashboards this device shows, in this device's order.
 *
 * Three rules, and each answers a state a synced vault reaches on its own:
 *
 * - **An id with no dashboard is dropped**, so the list cannot grow with the dead — a dashboard deleted on another
 *   device leaves an entry here that would otherwise sit in the order forever.
 * - **A dashboard with no entry is appended, enabled.** One that arrives switched off is one you have to go hunting
 *   for; one that arrives visible takes a single toggle to dismiss.
 * - **A device with no list at all** — the first run after a sync — falls back to `created`, so the first order is
 *   the order they were built in rather than whatever the filesystem happened to return. Without it two devices
 *   would show the same dashboards in different orders and neither would be wrong.
 */
export function orderedDashboards(
  dashboards: readonly LibraryDashboard[],
  order: readonly DashboardPlace[] | undefined
): LibraryDashboard[] {
  const byId = new Map(dashboards.map((dashboard) => [dashboard.id, dashboard]));
  const placed: LibraryDashboard[] = [];
  const seen = new Set<string>();
  for (const place of order ?? []) {
    const dashboard = byId.get(place.id);
    if (!dashboard || seen.has(place.id)) continue;
    seen.add(place.id);
    placed.push(dashboard);
  }
  const rest = dashboards.filter((dashboard) => !seen.has(dashboard.id)).sort(byCreated);
  return [...placed, ...rest];
}

/**
 * Whether this device shows a dashboard. Anything the list says nothing about is shown.
 *
 * **Absent means on**, which is what makes a dashboard arriving over sync visible rather than hidden — and what
 * makes the list a record of decisions rather than a register every dashboard must appear in.
 */
export function dashboardEnabled(id: string, order: readonly DashboardPlace[] | undefined): boolean {
  return order?.find((place) => place.id === id)?.enabled !== false;
}

/**
 * The list as it should be stored after this device has seen these dashboards.
 *
 * Pruned of the dead and extended with the new, in the order `orderedDashboards` produces — so what is written back
 * is exactly what was shown, and the two cannot drift.
 */
export function settledOrder(
  dashboards: readonly LibraryDashboard[],
  order: readonly DashboardPlace[] | undefined
): DashboardPlace[] {
  return orderedDashboards(dashboards, order).map((dashboard) => ({
    id: dashboard.id,
    enabled: dashboardEnabled(dashboard.id, order),
  }));
}

/** Move one dashboard in this device's order, answering the list to store. */
export function movedInOrder(order: readonly DashboardPlace[], from: number, to: number): DashboardPlace[] {
  const out = [...order];
  if (from < 0 || from >= out.length) return out;
  const target = Math.max(0, Math.min(out.length - 1, to));
  out.splice(target, 0, ...out.splice(from, 1));
  return out;
}

/**
 * Oldest first, with anything undated last — a dashboard from before `created` existed sorts to the end.
 *
 * **Ties break by name, always.** Two dashboards built in the same second compare equal, and a stable sort then
 * keeps the order the vault listed them in — which differs per device, and is the one thing this fallback exists to
 * avoid. Whatever it decides has to be the same decision everywhere.
 */
function byCreated(a: LibraryDashboard, b: LibraryDashboard): number {
  const left = a.created ?? '';
  const right = b.created ?? '';
  if (!left && right) return 1;
  if (left && !right) return -1;
  return left.localeCompare(right) || a.name.localeCompare(b.name);
}
