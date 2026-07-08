import type { AdminOrder, PendingVerificationUser } from '../../core/services/admin.service';
import { ADMIN_ORDER_STATUS_LABEL } from '../../core/constants/statuses';

export function adminOrderCustomerName(customer: AdminOrder['customerId']): string {
  if (!customer || typeof customer === 'string') return '—';
  return [customer.firstName, customer.lastName].filter(Boolean).join(' ') || customer.email || '—';
}

export function adminOrderCustomerContact(customer: AdminOrder['customerId']): string {
  if (!customer || typeof customer === 'string') return '—';
  return customer.phoneNumber || customer.email || '—';
}

export function adminOrderCargoTotal(order: AdminOrder): number {
  return Number(order.smallBoxes || 0) + Number(order.mediumBoxes || 0) + Number(order.largeBoxes || 0);
}

export function adminOrderDriverName(driver: AdminOrder['driverId']): string {
  if (!driver) return '—';
  const d = typeof driver === 'object' ? driver : null;
  if (!d) return '—';
  return [d.firstName, d.lastName].filter(Boolean).join(' ') || (d as { email?: string }).email || '—';
}

export function adminOrderStatusLabel(status: string): string {
  const s = (status || '').toLowerCase();
  return ADMIN_ORDER_STATUS_LABEL[s] ?? status;
}

export function adminDriverDisplayName(u: PendingVerificationUser): string {
  return [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || '—';
}
