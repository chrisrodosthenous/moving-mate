import type { TransportOrder } from '../../core/services/orders.service';
import { roundMoney } from './order-pricing.util';

const DEFAULT_COMMISSION_RATE_PERCENT = 20;

export function computeDriverNetEarnings(
  price: number,
  commissionRatePercent = DEFAULT_COMMISSION_RATE_PERCENT,
): number {
  const gross = Math.max(0, Number(price) || 0);
  const rate = Math.max(0, Math.min(100, Number(commissionRatePercent) || DEFAULT_COMMISSION_RATE_PERCENT));
  const platform = roundMoney(gross * (rate / 100));
  return roundMoney(gross - platform);
}

/** Net driver payout for display (uses persisted split when available). */
export function driverNetEarningsForOrder(order: Pick<TransportOrder, 'price' | 'driverEarnings' | 'commissionRate'>): number {
  if (order.driverEarnings != null && Number.isFinite(Number(order.driverEarnings))) {
    return roundMoney(Number(order.driverEarnings));
  }
  return computeDriverNetEarnings(order.price, order.commissionRate ?? DEFAULT_COMMISSION_RATE_PERCENT);
}

export function platformCommissionForOrder(
  order: Pick<TransportOrder, 'price' | 'platformCommission' | 'commissionRate'>,
): number {
  if (order.platformCommission != null && Number.isFinite(Number(order.platformCommission))) {
    return roundMoney(Number(order.platformCommission));
  }
  const gross = Math.max(0, Number(order.price) || 0);
  const rate = order.commissionRate ?? DEFAULT_COMMISSION_RATE_PERCENT;
  return roundMoney(gross * (rate / 100));
}

const COMPLETED_STATUSES = new Set(['delivered', 'completed']);

export function isCompletedOrderStatus(status: string | undefined): boolean {
  return COMPLETED_STATUSES.has(String(status ?? '').toLowerCase());
}
