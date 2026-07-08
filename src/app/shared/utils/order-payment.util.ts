import type { OrderPaymentStatus } from '../../core/services/payments.service';

export function paymentStatusLabel(status: OrderPaymentStatus | string | undefined): string {
  switch (status) {
    case 'authorized':
      return 'Payment authorized';
    case 'captured':
      return 'Paid';
    case 'refunded':
      return 'Refunded';
    case 'unpaid':
    default:
      return 'Payment required';
  }
}

export function canCustomerPayOrder(order: { status: string; paymentStatus?: string }): boolean {
  return order.status === 'pending' && (order.paymentStatus ?? 'unpaid') === 'unpaid';
}

export function isOrderPaymentReadyForAccept(order: { paymentStatus?: string }): boolean {
  const ps = order.paymentStatus ?? 'unpaid';
  return ps === 'authorized' || ps === 'captured';
}

export function driverAcceptBlockedByPayment(order: { status: string; paymentStatus?: string }): boolean {
  return order.status === 'pending' && !isOrderPaymentReadyForAccept(order);
}
