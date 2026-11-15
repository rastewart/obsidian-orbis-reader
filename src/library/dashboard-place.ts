// Where this device keeps its dashboard arrangement: the order, which are switched on, and which one is open.
//
// **Content travels; arrangement does not.** A dashboard is the same dashboard on every device, and that is why it
// is published — but a desktop with room for six wants them arranged one way, and a phone that opens two of them
// wants those two first. Neither device is wrong, so the arrangement is not part of what travels.
//
// It lived in `data.json` beside the dashboards themselves, which was fine while `data.json` never left the machine.
// Under sync that document is exactly the set that does leave, so per-device data inside it is the fault the design
// names by name. Here it is device-local and vault-local, which is the same unit the device id and the reading
// clock use.
//
// See docs/design/multi-device-sync.md §An item travels; its place in a list does not.

import { readDeviceValue, writeDeviceValue } from '../device-store';
import type { DashboardPlace } from './dashboard-order';

const ORDER_KEY = 'orbis-dashboard-order';
const ACTIVE_KEY = 'orbis-dashboard-active';

/** This device's order, or undefined before it has arranged anything — which `orderedDashboards` reads as "by age". */
export function readDashboardOrder(): DashboardPlace[] | undefined {
  const raw = readDeviceValue(ORDER_KEY);
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return undefined;
    // Filtered rather than trusted: this is a list a reader could have hand-edited in the developer console, and a
    // malformed entry would otherwise sit in the order forever, matching no dashboard and hiding nothing.
    return parsed.filter(
      (place): place is DashboardPlace =>
        !!place && typeof place === 'object' && typeof (place as DashboardPlace).id === 'string'
    );
  } catch {
    return undefined;
  }
}

export function writeDashboardOrder(order: readonly DashboardPlace[]): void {
  writeDeviceValue(ORDER_KEY, JSON.stringify(order));
}

/** Which dashboard this device has open. Empty means "whichever comes first" — see `libraryActiveDashboard`. */
export function readActiveDashboard(): string {
  return readDeviceValue(ACTIVE_KEY) ?? '';
}

export function writeActiveDashboard(id: string): void {
  writeDeviceValue(ACTIVE_KEY, id || null);
}

/**
 * Carry an arrangement out of a `data.json` that still holds one, once.
 *
 * Never overwrites what is stored here already: an order arranged since the move is newer than anything the old key
 * holds. Returns whether anything was taken, so the caller can drop the old keys in the same breath.
 */
export function migrateDashboardPlaces(order: readonly DashboardPlace[] | undefined, active: string): boolean {
  if (readDeviceValue(ORDER_KEY) !== null || readDeviceValue(ACTIVE_KEY) !== null) return false;
  if (!order?.length && !active) return false;
  if (order?.length) writeDashboardOrder(order);
  if (active) writeActiveDashboard(active);
  return true;
}
