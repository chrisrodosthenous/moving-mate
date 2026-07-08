import type { AdminOrder, AdminUser } from '../../../core/services/admin.service';
import { adminTableBadgeClass, type AdminTableBadgeTone } from './admin-table-theme';

const COMPLETED = new Set(['delivered', 'completed']);
const CANCELLED = new Set(['cancelled', 'canceled']);
const IN_PROGRESS = new Set([
  'accepted',
  'picked_up',
  'driver_is_on_the_way',
  'in_progress',
  'delivery_in_progress',
]);

export function fullName(user: { firstName?: string; lastName?: string; email?: string }): string {
  const n = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return n || user.email || '—';
}

export function customerDistrict(user: AdminUser): string {
  return (user.district ?? '').trim() || '—';
}

export function driverDistrictLabel(user: AdminUser): string {
  const list = user.districts?.filter(Boolean) ?? [];
  if (list.length) return list.join(', ');
  return (user.district ?? '').trim() || 'All districts';
}

export function customerAccountStatus(user: AdminUser): { label: 'Active' | 'Suspended'; tone: AdminTableBadgeTone } {
  if (user.verificationStatus === 'rejected') {
    return { label: 'Suspended', tone: 'cancelled' };
  }
  return { label: 'Active', tone: 'active' };
}

export function countCustomerOrders(customerId: string, orders: AdminOrder[]): number {
  const id = String(customerId);
  return orders.filter((o) => {
    const cid =
      o.customerId && typeof o.customerId === 'object'
        ? String(o.customerId._id ?? '')
        : String(o.customerId ?? '');
    return cid === id;
  }).length;
}

export function countDriverCompletedTrips(driverId: string, orders: AdminOrder[]): number {
  const id = String(driverId);
  return orders.filter((o) => {
    const did =
      o.driverId && typeof o.driverId === 'object'
        ? String(o.driverId._id ?? '')
        : String(o.driverId ?? '');
    return did === id && COMPLETED.has(o.status);
  }).length;
}

export type DriverAvailability = 'Online' | 'Offline' | 'Busy';

export function driverAvailability(
  driver: AdminUser,
  orders: AdminOrder[],
): { label: DriverAvailability; tone: AdminTableBadgeTone } {
  const id = String(driver._id);
  if (!driver.isVerified || driver.verificationStatus === 'rejected') {
    return { label: 'Offline', tone: 'muted' };
  }
  const busy = orders.some((o) => {
    const did =
      o.driverId && typeof o.driverId === 'object'
        ? String(o.driverId._id ?? '')
        : String(o.driverId ?? '');
    return did === id && IN_PROGRESS.has(o.status);
  });
  if (busy) return { label: 'Busy', tone: 'pending' };
  if (driver.verificationStatus === 'approved' || driver.isVerified) {
    return { label: 'Online', tone: 'active' };
  }
  return { label: 'Offline', tone: 'muted' };
}

export function vehicleLabel(driver: AdminUser): string {
  const model = (driver.carModel ?? '').trim();
  const plate = (driver.plateNumber ?? '').trim();
  if (model && plate) return `${model} · ${plate}`;
  if (model) return model;
  if (plate) return plate;
  return '—';
}

export function orderStatusAdminLabel(status: string): string {
  const s = (status ?? '').toLowerCase();
  if (s === 'pending') return 'Available';
  if (IN_PROGRESS.has(s)) return 'In Progress';
  if (COMPLETED.has(s)) return 'Delivered';
  if (CANCELLED.has(s)) return 'Cancelled';
  return status || '—';
}

export function orderStatusBadgeTone(status: string): AdminTableBadgeTone {
  const s = (status ?? '').toLowerCase();
  if (s === 'pending') return 'pending';
  if (IN_PROGRESS.has(s)) return 'pending';
  if (COMPLETED.has(s)) return 'active';
  if (CANCELLED.has(s)) return 'cancelled';
  return 'muted';
}

export function orderStatusBadgeClass(status: string): string {
  return adminTableBadgeClass(orderStatusBadgeTone(status));
}

export function customerNameFromOrder(order: AdminOrder): string {
  if (order.customer?.fullName?.trim()) return order.customer.fullName.trim();
  const c = order.customerId;
  if (c && typeof c === 'object') {
    return fullName(c);
  }
  return '—';
}

export function driverNameFromOrder(order: AdminOrder): string | null {
  if (order.driver?.fullName?.trim()) return order.driver.fullName.trim();
  const d = order.driverId;
  if (d && typeof d === 'object') {
    const n = fullName(d);
    return n !== '—' ? n : null;
  }
  return null;
}

export function shortOrderId(id: string): string {
  const s = String(id);
  return s.length > 10 ? `…${s.slice(-8)}` : s;
}

export function matchesSearch(haystack: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return haystack.toLowerCase().includes(q);
}

export function formatAdminDateTime(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
