import type { DriverAnalyticsPayload } from '../../../core/services/users.service';
import type { TransportOrder } from '../../../core/services/orders.service';
import {
  CHART_TREND_DAYS,
  lastNDayBuckets,
  orderCreatedLocalKey,
} from '../../../shared/utils/chart-date-buckets';

const COMPLETED = new Set(['delivered', 'completed']);
const CANCELLED = new Set(['cancelled', 'canceled']);

export function emptyDriverAnalytics(): DriverAnalyticsPayload {
  const buckets = lastNDayBuckets(CHART_TREND_DAYS);
  return {
    weeklyEarnings: { labels: buckets.map((b) => b.label), euros: buckets.map(() => 0) },
    tripStats: { completed: 0, cancelled: 0, declined: 0 },
    rating: { average: null, max: 5, priorityThreshold: 4.5 },
  };
}

export function buildDriverAnalyticsFromOrders(
  orders: TransportOrder[],
  driverUserId: string,
  averageRating: number | null,
): DriverAnalyticsPayload {
  const me = String(driverUserId).trim();
  const buckets = lastNDayBuckets(CHART_TREND_DAYS);
  const euros = buckets.map(() => 0);
  let completed = 0;
  let cancelled = 0;

  const driverId = (o: TransportOrder) =>
    o.driverId && typeof o.driverId === 'object' ? String(o.driverId._id ?? '') : String(o.driverId ?? '');

  for (const o of orders) {
    const id = driverId(o);
    if (!id || id !== me) continue;

    if (COMPLETED.has(o.status)) {
      completed++;
      const key = orderCreatedLocalKey(o.createdAt);
      const idx = key ? buckets.findIndex((b) => b.key === key) : -1;
      if (idx >= 0) euros[idx] += Number(o.price) || 0;
    } else if (CANCELLED.has(o.status)) {
      cancelled++;
    }
  }

  return {
    weeklyEarnings: {
      labels: buckets.map((b) => b.label),
      euros: euros.map((v) => Math.round(v * 100) / 100),
    },
    tripStats: { completed, cancelled, declined: 0 },
    rating: { average: averageRating, max: 5, priorityThreshold: 4.5 },
  };
}
