import type { AdminAnalyticsPayload } from '../../../core/services/admin.service';
import {
  CHART_TREND_DAYS,
  lastNDayBuckets,
  orderCreatedLocalKey,
} from '../../../shared/utils/chart-date-buckets';

const COMPLETED_STATUSES = new Set(['delivered', 'completed']);

export function emptyAnalyticsPayload(): AdminAnalyticsPayload {
  const buckets = lastNDayBuckets(CHART_TREND_DAYS);
  return {
    trend: {
      labels: buckets.map((b) => b.label),
      orders: buckets.map(() => 0),
      revenue: buckets.map(() => 0),
    },
    districts: { labels: [], counts: [] },
    topDrivers: { labels: [], trips: [] },
  };
}

/** Client-side fallback when the analytics API is unavailable. */
export function buildAnalyticsFromOrders(
  orders: Array<{
    createdAt: string;
    price?: number;
    status: string;
    pickupDistrict?: string;
    driverId?: { firstName?: string; lastName?: string; _id?: string } | string | null;
    driver?: { firstName?: string; lastName?: string; fullName?: string } | null;
  }>,
): AdminAnalyticsPayload {
  const buckets = lastNDayBuckets(CHART_TREND_DAYS);
  const ordersByDay = Object.fromEntries(buckets.map((b) => [b.key, 0])) as Record<string, number>;
  const revenueByDay = Object.fromEntries(buckets.map((b) => [b.key, 0])) as Record<string, number>;

  for (const o of orders) {
    const key = orderCreatedLocalKey(o.createdAt);
    if (!key || !(key in ordersByDay)) continue;
    ordersByDay[key]++;
    revenueByDay[key] += Number(o.price) || 0;
  }

  const districtCounts = new Map<string, number>();
  for (const o of orders) {
    const district = (o.pickupDistrict ?? '').trim();
    if (!district) continue;
    districtCounts.set(district, (districtCounts.get(district) ?? 0) + 1);
  }
  const districtSorted = [...districtCounts.entries()].sort((a, b) => b[1] - a[1]);

  const driverTrips = new Map<string, { label: string; trips: number }>();
  for (const o of orders) {
    if (!COMPLETED_STATUSES.has(o.status)) continue;
    const id =
      o.driverId && typeof o.driverId === 'object'
        ? String(o.driverId._id ?? '')
        : String(o.driverId ?? '');
    if (!id) continue;
    const label = driverDisplayName(o);
    const prev = driverTrips.get(id);
    if (prev) prev.trips++;
    else driverTrips.set(id, { label, trips: 1 });
  }
  const topDrivers = [...driverTrips.values()].sort((a, b) => b.trips - a.trips).slice(0, 5);

  return {
    trend: {
      labels: buckets.map((b) => b.label),
      orders: buckets.map((b) => ordersByDay[b.key] ?? 0),
      revenue: buckets.map((b) => Math.round((revenueByDay[b.key] ?? 0) * 100) / 100),
    },
    districts: {
      labels: districtSorted.map(([d]) => d),
      counts: districtSorted.map(([, c]) => c),
    },
    topDrivers: {
      labels: topDrivers.map((d) => d.label),
      trips: topDrivers.map((d) => d.trips),
    },
  };
}

function driverDisplayName(o: {
  driver?: { firstName?: string; lastName?: string; fullName?: string } | null;
  driverId?: { firstName?: string; lastName?: string } | string | null;
}): string {
  const d = o.driver;
  if (d?.fullName?.trim()) return d.fullName.trim();
  const fromDriver = [d?.firstName, d?.lastName].filter(Boolean).join(' ').trim();
  if (fromDriver) return fromDriver;
  const id = o.driverId;
  if (id && typeof id === 'object') {
    const name = [id.firstName, id.lastName].filter(Boolean).join(' ').trim();
    if (name) return name;
  }
  return 'Driver';
}
