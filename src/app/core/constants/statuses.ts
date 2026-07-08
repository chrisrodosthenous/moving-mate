/**
 * Canonical status strings from the API (MongoDB / TransportOrder / User).
 * Display labels for the admin UI are separate where needed.
 */

/** User.verificationStatus — see server/models/User.js */
export const DRIVER_VERIFICATION_STATUS = {
  NONE: 'none',
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
} as const;

export type DriverVerificationStatus =
  (typeof DRIVER_VERIFICATION_STATUS)[keyof typeof DRIVER_VERIFICATION_STATUS];

/** TransportOrder.status — see server/models/TransportOrder.js */
export const TRANSPORT_ORDER_STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  PICKED_UP: 'picked_up',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
} as const;

export type TransportOrderStatus =
  (typeof TRANSPORT_ORDER_STATUS)[keyof typeof TRANSPORT_ORDER_STATUS];

/**
 * Admin → Logistics Control tabs (UI keys).
 * Maps to API order statuses:
 * - in_progress → picked_up (driver en route; colloquially “driver on the way”)
 * - completed → delivered (colloquially “job done”)
 * - cancelled → cancelled
 */
export const ADMIN_LOGISTICS_TAB = {
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
} as const;

export type AdminLogisticsTabId =
  (typeof ADMIN_LOGISTICS_TAB)[keyof typeof ADMIN_LOGISTICS_TAB];

/** Which TransportOrder.status values belong to each logistics tab. */
export const ORDER_STATUS_BY_LOGISTICS_TAB: Record<AdminLogisticsTabId, TransportOrderStatus> = {
  [ADMIN_LOGISTICS_TAB.IN_PROGRESS]: TRANSPORT_ORDER_STATUS.PICKED_UP,
  [ADMIN_LOGISTICS_TAB.COMPLETED]: TRANSPORT_ORDER_STATUS.DELIVERED,
  [ADMIN_LOGISTICS_TAB.CANCELLED]: TRANSPORT_ORDER_STATUS.CANCELLED,
};

/**
 * Admin → Fleet Management driver list tabs (UI keys).
 * - not_verified → API: verificationStatus `none` (registered, not yet approved) OR `rejected`
 * - pending → API: `pending` (documents submitted / awaiting review — “verification requested”)
 * - verified → API: `approved` or legacy isVerified
 */
export const ADMIN_FLEET_TAB = {
  NOT_VERIFIED: 'not_verified',
  PENDING: 'pending',
  VERIFIED: 'verified',
} as const;

export type AdminFleetTabId = (typeof ADMIN_FLEET_TAB)[keyof typeof ADMIN_FLEET_TAB];

export function isDriverUser(u: { role?: string }): boolean {
  return u.role === 'driver';
}

/** “Not Verified” bucket: registered (`none`) or `rejected`; excludes pending & approved/verified. */
export function driverMatchesFleetNotVerifiedTab(u: {
  role?: string;
  verificationStatus?: string | null;
}): boolean {
  if (!isDriverUser(u)) return false;
  const vs = String(u.verificationStatus ?? '').toLowerCase();
  return vs === DRIVER_VERIFICATION_STATUS.NONE || vs === DRIVER_VERIFICATION_STATUS.REJECTED;
}

export function driverMatchesFleetPendingTab(u: {
  role?: string;
  verificationStatus?: string | null;
}): boolean {
  if (!isDriverUser(u)) return false;
  return String(u.verificationStatus ?? '').toLowerCase() === DRIVER_VERIFICATION_STATUS.PENDING;
}

export function driverMatchesFleetVerifiedTab(u: {
  role?: string;
  isVerified?: boolean;
  verificationStatus?: string | null;
}): boolean {
  if (!isDriverUser(u)) return false;
  if (u.isVerified === true) return true;
  return String(u.verificationStatus ?? '').toLowerCase() === DRIVER_VERIFICATION_STATUS.APPROVED;
}

export function orderMatchesLogisticsTab(
  orderStatus: string | undefined,
  tab: AdminLogisticsTabId,
): boolean {
  const want = ORDER_STATUS_BY_LOGISTICS_TAB[tab];
  return (orderStatus ?? '').toLowerCase() === want;
}

/** Drawer / list copy for order status chips. */
export const ADMIN_ORDER_STATUS_LABEL: Record<string, string> = {
  [TRANSPORT_ORDER_STATUS.PENDING]: 'Pending',
  [TRANSPORT_ORDER_STATUS.ACCEPTED]: 'Accepted',
  [TRANSPORT_ORDER_STATUS.PICKED_UP]: 'In progress',
  [TRANSPORT_ORDER_STATUS.DELIVERED]: 'Completed',
  [TRANSPORT_ORDER_STATUS.CANCELLED]: 'Cancelled',
};
