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
