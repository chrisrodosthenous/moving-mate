import type { AdminAnalyticsPayload } from '../../../core/services/admin.service';
import { CHART_TREND_DAYS, lastNDayBuckets } from '../../../shared/utils/chart-date-buckets';

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
