/**
 * Shared order display + ID helpers (TransportOrder, Admin order shapes, etc.).
 */

/** Populated ref or raw id → stable string (API routes, equality). */
export function normalizeOrderId(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    const o = value as { _id?: string; id?: string };
    return String(o._id || o.id || '');
  }
  return String(value);
}

type OrderWithTimeline = { submittedAt?: string; createdAt?: string };

/**
 * ISO string for Angular `date` pipe and comparisons (`submittedAt` preferred, else `createdAt`).
 */
export function orderSubmissionDateIso(order: OrderWithTimeline): string {
  return (order.submittedAt ?? order.createdAt) ?? '';
}

/**
 * Date-only display for DOB, scheduled fields, etc. — invalid values fall back to the raw string.
 */
export function formatOrderDateForDisplay(isoOrDateString?: string): string {
  if (!isoOrDateString) return '—';
  const parsed = new Date(isoOrDateString);
  if (Number.isNaN(parsed.getTime())) return isoOrDateString;
  return parsed.toLocaleDateString();
}
