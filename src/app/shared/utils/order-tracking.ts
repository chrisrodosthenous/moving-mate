/** Customer-facing lifecycle segments: Submitted → Accepted → On the way → Done */

import type { BadgeVariant } from '@/components/ui/badge';

export type OrderSegmentIndex = 0 | 1 | 2 | 3;

const IN_PROGRESS_STATUSES = new Set([
  'in_progress',
  'picked_up',
  'driver_is_on_the_way',
  'delivery_in_progress',
]);

/**
 * Live driver car on the map and GPS/socket tracking — only after the trip is in progress.
 * Excludes `accepted` (assigned but not started) and terminal statuses.
 */
export const DRIVER_MAP_TRACKING_STATUSES = IN_PROGRESS_STATUSES;

export function isDriverMapTrackingStatus(status: string | undefined): boolean {
  const s = String(status ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  return DRIVER_MAP_TRACKING_STATUSES.has(s);
}

const COMPLETED_STATUSES = new Set(['completed', 'delivered']);

/** Maps transport `order.status` to {@linkcode UiBadgeComponent} variant (light + dark surfaces). */
export function orderStatusToBadgeVariant(status: string): BadgeVariant {
  const s = (status || '').toLowerCase();
  if (s === 'pending') return 'orderPending';
  if (s === 'cancelled' || s === 'canceled') return 'orderCancelled';
  if (s === 'accepted') return 'orderAccepted';
  if (IN_PROGRESS_STATUSES.has(s)) return 'orderInProgress';
  if (COMPLETED_STATUSES.has(s)) return 'orderCompleted';
  return 'default';
}

export function customerOrderSegmentFilled(status: string, index: OrderSegmentIndex): boolean {
  if (status === 'cancelled') return false;
  if (index === 0) {
    return [
      'pending',
      'accepted',
      'in_progress',
      'picked_up',
      'driver_is_on_the_way',
      'delivered',
      'completed',
    ].includes(status);
  }
  if (index === 1) {
    return [
      'accepted',
      'in_progress',
      'picked_up',
      'driver_is_on_the_way',
      'delivered',
      'completed',
    ].includes(status);
  }
  if (index === 2) {
    return ['in_progress', 'picked_up', 'driver_is_on_the_way', 'delivered', 'completed'].includes(status);
  }
  return ['delivered', 'completed'].includes(status);
}

/** Tailwind class for a filled lifecycle progress segment (see global.css order-bar-* utilities). */
export function orderSegmentBarFilledClass(index: OrderSegmentIndex): string {
  switch (index) {
    case 0:
      return 'order-bar-pending';
    case 1:
      return 'order-bar-accepted';
    case 2:
      return 'order-bar-in-progress';
    case 3:
      return 'order-bar-completed';
  }
}

/** Order statuses where the customer sees live driver tracking (socket join + marker). Keep aligned with server `CUSTOMER_JOIN_ORDER_TRACKING_STATUSES`. */
export function isCustomerLiveMapTrackingStatus(status: string | undefined): boolean {
  return isDriverMapTrackingStatus(status);
}

/** Short label for customer dashboard / my-orders badge */
export function customerStatusLabel(status: string): string {
  switch (status) {
    case 'pending':
      return 'Pending';
    case 'accepted':
      return 'Accepted';
    case 'in_progress':
    case 'picked_up':
    case 'driver_is_on_the_way':
    case 'delivery_in_progress':
      return 'In progress';
    case 'completed':
    case 'delivered':
      return 'Completed';
    case 'cancelled':
    case 'canceled':
      return 'Cancelled';
    default:
      return status;
  }
}
