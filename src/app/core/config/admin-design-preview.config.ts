/** Where styling changes apply — shown in the admin design hub. */
export type DesignScopeId =
  | 'global'
  | 'global-shared'
  | 'marketing'
  | 'auth'
  | 'customer'
  | 'driver'
  | 'admin';

export interface DesignScopeMeta {
  id: DesignScopeId;
  /** Short badge in the hub */
  label: string;
  /** Longer explanation for admins */
  description: string;
}

export const DESIGN_SCOPE_META: Record<DesignScopeId, DesignScopeMeta> = {
  global: {
    id: 'global',
    label: 'Global',
    description: 'CSS theme tokens in global.css — affects every page and role.',
  },
  'global-shared': {
    id: 'global-shared',
    label: 'Global shared',
    description: 'Shared components (sidebar, ui-card, buttons, inputs) used across roles.',
  },
  marketing: {
    id: 'marketing',
    label: 'Marketing',
    description: 'Public website shell and landing pages only.',
  },
  auth: {
    id: 'auth',
    label: 'Auth',
    description: 'Login, register, and password reset pages.',
  },
  customer: {
    id: 'customer',
    label: 'Customer',
    description: 'Customer shell — dashboard, new order, my orders.',
  },
  driver: {
    id: 'driver',
    label: 'Driver',
    description: 'Driver shell — available jobs, my trips, job detail.',
  },
  admin: {
    id: 'admin',
    label: 'Admin',
    description: 'Admin dashboard and notification settings.',
  },
};

export type AdminPreviewGroup = 'public' | 'auth' | 'customer' | 'driver' | 'admin';

export interface AdminPreviewDestination {
  path: string;
  label: string;
  group: AdminPreviewGroup;
  scopes: DesignScopeId[];
  /** Query string without the leading ?, for screens that share a path. */
  query?: string;
  /** Admin must bypass guestGuard (logged in while viewing login/register). */
  guestPreview?: boolean;
}

export const ADMIN_PREVIEW_GROUP_LABELS: Record<AdminPreviewGroup, string> = {
  public: 'Website',
  auth: 'Sign in',
  customer: 'Customer',
  driver: 'Driver',
  admin: 'Admin',
};

/** Curated routes for admin UI / theme review. */
export const ADMIN_PREVIEW_DESTINATIONS: AdminPreviewDestination[] = [
  { path: '/', label: 'Home', group: 'public', scopes: ['marketing', 'global'] },
  { path: '/features', label: 'Features', group: 'public', scopes: ['marketing', 'global'] },
  { path: '/how-it-works', label: 'How it works', group: 'public', scopes: ['marketing', 'global'] },
  { path: '/about', label: 'About', group: 'public', scopes: ['marketing', 'global'] },
  { path: '/contact', label: 'Contact', group: 'public', scopes: ['marketing', 'global'] },
  { path: '/download', label: 'Download', group: 'public', scopes: ['marketing', 'global'] },
  { path: '/login', label: 'Login', group: 'auth', scopes: ['auth', 'global', 'global-shared'], guestPreview: true },
  { path: '/register', label: 'Register', group: 'auth', scopes: ['auth', 'global', 'global-shared'], guestPreview: true },
  { path: '/forgot-password', label: 'Forgot password', group: 'auth', scopes: ['auth', 'global'], guestPreview: true },
  { path: '/reset-password', label: 'Reset password', group: 'auth', scopes: ['auth', 'global'], guestPreview: true },
  { path: '/customer/dashboard', label: 'Customer dashboard', group: 'customer', scopes: ['customer', 'global', 'global-shared'] },
  { path: '/customer/book', label: 'New move', group: 'customer', scopes: ['customer', 'global', 'global-shared'] },
  { path: '/customer/orders', label: 'My moves', group: 'customer', scopes: ['customer', 'global', 'global-shared'] },
  { path: '/map', label: 'Map', group: 'customer', scopes: ['customer', 'global', 'global-shared'] },
  { path: '/profile', label: 'Profile', group: 'customer', scopes: ['global', 'global-shared'] },
  { path: '/driver/dashboard', label: 'Driver dashboard', group: 'driver', scopes: ['driver', 'global', 'global-shared'] },
  { path: '/driver/available', label: 'Available moves', group: 'driver', scopes: ['driver', 'global', 'global-shared'] },
  { path: '/driver/tasks', label: 'My moves', group: 'driver', scopes: ['driver', 'global', 'global-shared'] },
  { path: '/admin', label: 'Admin dashboard', group: 'admin', scopes: ['admin', 'global', 'global-shared'] },
  { path: '/admin', query: 'section=customers', label: 'Customers', group: 'admin', scopes: ['admin', 'global', 'global-shared'] },
  { path: '/admin', query: 'section=driversTable', label: 'Drivers', group: 'admin', scopes: ['admin', 'global', 'global-shared'] },
  { path: '/admin', query: 'section=ordersTable', label: 'Orders', group: 'admin', scopes: ['admin', 'global', 'global-shared'] },
  { path: '/admin', query: 'section=orders', label: 'Order management', group: 'admin', scopes: ['admin', 'global', 'global-shared'] },
  { path: '/admin', query: 'section=drivers&fleetTab=pending', label: 'Driver approvals', group: 'admin', scopes: ['admin', 'global', 'global-shared'] },
  { path: '/admin', query: 'section=notify', label: 'Developer tools', group: 'admin', scopes: ['admin', 'global', 'global-shared'] },
  { path: '/admin/settings/notifications', label: 'Notifications', group: 'admin', scopes: ['admin', 'global', 'global-shared'] },
  { path: '/admin/settings/pricing', label: 'Pricing', group: 'admin', scopes: ['admin', 'global', 'global-shared'] },
];

/** Match current URL to preview metadata (longest prefix wins). */
export function resolvePreviewDestination(pathname: string): AdminPreviewDestination | null {
  const path = pathname.split('?')[0] || '/';
  let best: AdminPreviewDestination | null = null;
  let bestLen = -1;
  for (const dest of ADMIN_PREVIEW_DESTINATIONS) {
    if (path === dest.path || (dest.path !== '/' && path.startsWith(dest.path + '/'))) {
      if (dest.path.length > bestLen) {
        best = dest;
        bestLen = dest.path.length;
      }
    } else if (dest.path === '/' && path === '/') {
      best = dest;
      bestLen = 1;
    }
  }
  return best;
}

export function readDesignScopeFromElement(el: HTMLElement | null): DesignScopeId | null {
  let node: HTMLElement | null = el;
  while (node) {
    const scope = node.getAttribute('data-design-scope');
    if (scope && scope in DESIGN_SCOPE_META) {
      return scope as DesignScopeId;
    }
    node = node.parentElement;
  }
  return null;
}
