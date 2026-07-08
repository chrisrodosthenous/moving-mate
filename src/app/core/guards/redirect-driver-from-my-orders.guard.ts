import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthStore } from '../../store/auth.store';

/** Drivers should use My trips (`/driver/tasks`), not the shared my-orders list. */
export const redirectDriverFromMyOrdersGuard: CanActivateFn = () => {
  const auth = inject(AuthStore);
  const router = inject(Router);
  if (auth.user()?.role === 'driver') {
    return router.createUrlTree(['/driver/tasks']);
  }
  return true;
};
