import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthStore } from '../../store/auth.store';

/**
 * `/admin` is admin-only. The “admin preview” bypass lives on customer/driver routes:
 * `customerGuard` / `driverGuard` allow `role === 'admin'` so admins can test deep links,
 * but they cannot open this dashboard without `isAdmin()`.
 */
export const adminGuard: CanActivateFn = () => {
  const store = inject(AuthStore);
  const router = inject(Router);
  return store.isAdmin() || router.createUrlTree(['/dashboard']);
};
