import { ADMIN_FLEET_TAB, type AdminFleetTabId } from '../../core/constants/statuses';

export type AdminSection =
  | 'analytics'
  | 'customers'
  | 'driversTable'
  | 'ordersTable'
  | 'drivers'
  | 'orders'
  | 'notify';

const VALID_SECTIONS = new Set<AdminSection>([
  'analytics',
  'customers',
  'driversTable',
  'ordersTable',
  'drivers',
  'orders',
  'notify',
]);

export function parseAdminNavFromUrl(url: string): { section: AdminSection; fleetTab?: AdminFleetTabId } {
  const [path, query] = url.split('?');
  if (!path.startsWith('/admin') || path.includes('/settings/')) {
    return { section: 'analytics' };
  }
  const params = new URLSearchParams(query ?? '');
  const raw = params.get('section') ?? 'analytics';
  const section = VALID_SECTIONS.has(raw as AdminSection) ? (raw as AdminSection) : 'analytics';
  const fleetRaw = params.get('fleetTab');
  const fleetTab =
    fleetRaw === ADMIN_FLEET_TAB.VERIFIED ||
    fleetRaw === ADMIN_FLEET_TAB.PENDING ||
    fleetRaw === ADMIN_FLEET_TAB.NOT_VERIFIED
      ? fleetRaw
      : undefined;
  return { section, fleetTab };
}

export function adminSectionTitle(section: AdminSection, fleetTab?: AdminFleetTabId): string {
  if (section === 'analytics') return 'Dashboard';
  if (section === 'customers') return 'Customers';
  if (section === 'driversTable') return 'Drivers';
  if (section === 'ordersTable') return 'Orders';
  if (section === 'orders') return 'Order management';
  if (section === 'notify') return 'Developer tools';
  if (fleetTab === ADMIN_FLEET_TAB.VERIFIED) return 'User management';
  if (fleetTab === ADMIN_FLEET_TAB.PENDING) return 'Driver approvals';
  if (fleetTab === ADMIN_FLEET_TAB.NOT_VERIFIED) return 'Driver onboarding';
  return 'Fleet management';
}

export function adminSectionQuery(
  section: AdminSection,
  fleetTab?: AdminFleetTabId,
): Record<string, string | null> {
  const q: Record<string, string | null> = {
    section: section === 'analytics' ? null : section,
    fleetTab: section === 'drivers' && fleetTab ? fleetTab : null,
  };
  return q;
}

export function adminSectionFullBleed(section: AdminSection): boolean {
  return section === 'orders' || section === 'drivers';
}
