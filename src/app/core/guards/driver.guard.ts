import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthStore } from '../../store/auth.store';

/** Allows access only for drivers (admins can also pass for testing). */
export const driverGuard: CanActivateFn = () => {
  const store = inject(AuthStore);
  const router = inject(Router);
  const role = store.role();
  return role === 'driver' || role === 'admin' || router.createUrlTree(['/dashboard']);
};
