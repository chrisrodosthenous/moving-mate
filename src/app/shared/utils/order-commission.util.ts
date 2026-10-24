import type { TransportOrder } from '../../core/services/orders.service';
import { roundMoney } from './order-pricing.util';

/** Mirrors `server/config/pricingDefaults.js` commissionTiers — keep in sync. */
export const DEFAULT_COMMISSION_TIERS = [
  { upToEur: 100, ratePercent: 20 },
  { upToEur: 300, ratePercent: 15 },
  { upToEur: null as number | null, ratePercent: 10 },
] as const;

export const DEFAULT_COMMISSION_RATE_PERCENT = DEFAULT_COMMISSION_TIERS[0].ratePercent;

export interface CommissionTier {
  upToEur: number | null;
  ratePercent: number;
}

export interface OrderCommissionSplit {
  commissionRate: number;
  platformCommission: number;
  driverEarnings: number;
}

function computeMarginalCommission(gross: number, tiers: readonly CommissionTier[]): number {
  let remaining = Math.max(0, Number(gross) || 0);
  let prevCap = 0;
  let commission = 0;
  for (const tier of tiers) {
    if (remaining <= 0) break;
    const cap = tier.upToEur == null || !Number.isFinite(Number(tier.upToEur))
      ? Number.POSITIVE_INFINITY
      : Number(tier.upToEur);
    const bandWidth = Math.max(0, cap - prevCap);
    const slice = Math.min(remaining, bandWidth);
    commission += slice * (Number(tier.ratePercent) / 100);
    remaining -= slice;
    prevCap = cap;
  }
  return roundMoney(commission);
}

function effectiveRatePercent(gross: number, platformCommission: number): number {
  if (!(gross > 0)) return DEFAULT_COMMISSION_RATE_PERCENT;
  return roundMoney((platformCommission / gross) * 100);
}

/** Mirrors `server/utils/orderCommission.js` — keep in sync. */
export function computeOrderCommission(
  price: number,
  commissionRatePercent?: number,
  tiers: readonly CommissionTier[] = DEFAULT_COMMISSION_TIERS,
): OrderCommissionSplit {
  const gross = Math.max(0, Number(price) || 0);
  const explicit = commissionRatePercent != null && Number.isFinite(Number(commissionRatePercent));

  if (explicit) {
    const rate = Math.max(0, Math.min(100, Number(commissionRatePercent)));
    const platformCommission = roundMoney(gross * (rate / 100));
    return {
      commissionRate: rate,
      platformCommission,
      driverEarnings: roundMoney(gross - platformCommission),
    };
  }

  const platformCommission = computeMarginalCommission(gross, tiers);
  return {
    commissionRate: effectiveRatePercent(gross, platformCommission),
    platformCommission,
    driverEarnings: roundMoney(gross - platformCommission),
  };
}

export function computeDriverNetEarnings(
  price: number,
  commissionRatePercent?: number,
): number {
  return computeOrderCommission(price, commissionRatePercent).driverEarnings;
}

function hasPersistedSplit(order: {
  driverEarnings?: number;
  platformCommission?: number;
}): boolean {
  return Number(order.driverEarnings) > 0 || Number(order.platformCommission) > 0;
}

/** Net driver payout for display (uses persisted split when available). */
export function driverNetEarningsForOrder(
  order: Pick<TransportOrder, 'price' | 'driverEarnings' | 'commissionRate' | 'platformCommission'>,
): number {
  if (hasPersistedSplit(order)) {
    return roundMoney(Number(order.driverEarnings));
  }
  return computeOrderCommission(order.price).driverEarnings;
}

export function platformCommissionForOrder(
  order: Pick<TransportOrder, 'price' | 'platformCommission' | 'commissionRate' | 'driverEarnings'>,
): number {
  if (hasPersistedSplit(order)) {
    return roundMoney(Number(order.platformCommission));
  }
  return computeOrderCommission(order.price).platformCommission;
}

const COMPLETED_STATUSES = new Set(['delivered', 'completed']);

export function isCompletedOrderStatus(status: string | undefined): boolean {
  return COMPLETED_STATUSES.has(String(status ?? '').toLowerCase());
}
