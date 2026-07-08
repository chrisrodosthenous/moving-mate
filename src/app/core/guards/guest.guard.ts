import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthStore } from '../../store/auth.store';

/** Redirects to the user's dashboard if already logged in (login/register pages). */
export const guestGuard: CanActivateFn = () => {
  const store = inject(AuthStore);
  const router = inject(Router);
  if (store.isLoggedIn()) {
    return router.createUrlTree([store.dashboardRoute()]);
  }
  return true;
};
