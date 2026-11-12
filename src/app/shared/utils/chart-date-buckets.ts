/** Daily buckets for chart trends (oldest → newest). */
export function lastNDayBuckets(days: number): { key: string; label: string }[] {
  const buckets: { key: string; label: string }[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const span = Math.max(1, Math.floor(days));
  for (let offset = span - 1; offset >= 0; offset--) {
    const d = new Date(today);
    d.setDate(d.getDate() - offset);
    const key = localDateKey(d);
    const label = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    buckets.push({ key, label });
  }
  return buckets;
}

/** Local calendar date `YYYY-MM-DD` (avoids UTC shift on bucket keys). */
export function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function orderCreatedLocalKey(createdAt: string | Date): string | null {
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return null;
  return localDateKey(created);
}

/** Chart trend window — includes historical orders already in the database. */
export const CHART_TREND_DAYS = 30;

export type AnalyticsTrendRange =
  | 'week'
  | 'thisMonth'
  | 'month'
  | 'threeMonths'
  | 'sixMonths'
  | 'year';

export function lastNMonthBuckets(months: number): { key: string; label: string }[] {
  const buckets: { key: string; label: string }[] = [];
  const today = new Date();
  const span = Math.max(1, Math.floor(months));
  for (let offset = span - 1; offset >= 0; offset--) {
    const d = new Date(today.getFullYear(), today.getMonth() - offset, 1);
    buckets.push({
      key: monthKey(d),
      label: d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }),
    });
  }
  return buckets;
}

/** Days from the first of the current month through today. */
export function currentMonthDayBuckets(): { key: string; label: string }[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  return dayBucketsBetween(start, today);
}

export function orderCreatedMonthKey(createdAt: string | Date): string | null {
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return null;
  return monthKey(created);
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function dayBucketsBetween(start: Date, end: Date): { key: string; label: string }[] {
  const buckets: { key: string; label: string }[] = [];
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const last = new Date(end);
  last.setHours(0, 0, 0, 0);
  while (cursor.getTime() <= last.getTime()) {
    buckets.push({
      key: localDateKey(cursor),
      label: cursor.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return buckets;
}
