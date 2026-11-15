import { describe, expect, it } from 'vitest';
import {
  type DashboardPlace,
  dashboardEnabled,
  movedInOrder,
  orderedDashboards,
  settledOrder,
} from '../library/dashboard-order';
import type { LibraryDashboard } from '../settings';

const dash = (id: string, created?: string): LibraryDashboard => ({ id, name: id, widgets: [], created });
const place = (id: string, enabled = true): DashboardPlace => ({ id, enabled });

describe('orderedDashboards', () => {
  it('is this device’s order', () => {
    const all = [dash('a'), dash('b'), dash('c')];
    expect(orderedDashboards(all, [place('c'), place('a'), place('b')]).map((d) => d.id)).toEqual(['c', 'a', 'b']);
  });

  // A dashboard deleted on another device leaves an entry here that would otherwise sit in the order forever.
  it('drops an id whose dashboard is gone', () => {
    expect(orderedDashboards([dash('a')], [place('gone'), place('a')]).map((d) => d.id)).toEqual(['a']);
  });

  // One that arrives switched off is one you have to go hunting for; one that arrives visible takes a single tap
  // to dismiss.
  it('appends a dashboard this device has never seen', () => {
    const out = orderedDashboards([dash('a'), dash('new')], [place('a')]);
    expect(out.map((d) => d.id)).toEqual(['a', 'new']);
    expect(dashboardEnabled('new', [place('a')])).toBe(true);
  });

  /**
   * **The first run after a sync.** With no list at all, the order falls back to when each dashboard was built —
   * without it, two devices show the same dashboards in different orders and neither is wrong.
   */
  it('falls back to when they were built', () => {
    const all = [dash('newer', '2026-08-02'), dash('older', '2026-08-01')];
    expect(orderedDashboards(all, undefined).map((d) => d.id)).toEqual(['older', 'newer']);
    expect(orderedDashboards(all, []).map((d) => d.id)).toEqual(['older', 'newer']);
  });

  // A dashboard with no `created` still has to land somewhere, and the end is where it does least harm.
  it('puts an undated dashboard last, and settles ties by name', () => {
    const all = [dash('undated'), dash('b', '2026-08-01'), dash('a', '2026-08-01')];
    expect(orderedDashboards(all, undefined).map((d) => d.id)).toEqual(['a', 'b', 'undated']);
  });

  it('ignores a repeated entry rather than showing one twice', () => {
    expect(orderedDashboards([dash('a')], [place('a'), place('a')]).map((d) => d.id)).toEqual(['a']);
  });
});

describe('dashboardEnabled', () => {
  // Absent means on: that is what makes a dashboard arriving over sync visible rather than hidden, and the list a
  // record of decisions rather than a register every dashboard must appear in.
  it('shows anything the list says nothing about', () => {
    expect(dashboardEnabled('a', undefined)).toBe(true);
    expect(dashboardEnabled('a', [place('b', false)])).toBe(true);
  });

  it('honours a decision this device made', () => {
    expect(dashboardEnabled('a', [place('a', false)])).toBe(false);
    expect(dashboardEnabled('a', [place('a', true)])).toBe(true);
  });
});

describe('settledOrder', () => {
  // What is written back is exactly what was shown, so the stored list and the visible one cannot drift.
  it('is the shown order, pruned and extended, keeping the decisions', () => {
    const all = [dash('a'), dash('new')];
    const settled = settledOrder(all, [place('gone'), place('a', false)]);
    expect(settled).toEqual([
      { id: 'a', enabled: false },
      { id: 'new', enabled: true },
    ]);
  });
});

describe('movedInOrder', () => {
  const order = [place('a'), place('b'), place('c')];

  it('moves one entry', () => {
    expect(movedInOrder(order, 2, 0).map((p) => p.id)).toEqual(['c', 'a', 'b']);
    expect(movedInOrder(order, 0, 2).map((p) => p.id)).toEqual(['b', 'c', 'a']);
  });

  it('clamps a move past either end, and ignores a stale index', () => {
    expect(movedInOrder(order, 0, -1).map((p) => p.id)).toEqual(['a', 'b', 'c']);
    expect(movedInOrder(order, 2, 9).map((p) => p.id)).toEqual(['a', 'b', 'c']);
    expect(movedInOrder(order, 7, 0).map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });
});
