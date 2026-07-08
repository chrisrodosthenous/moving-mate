import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthStore } from '../../store/auth.store';

/**
 * Prevents unverified drivers from accessing job routes.
 * Admins bypass the check.  Use after authGuard + driverGuard.
 */
export const verificationGuard: CanActivateFn = () => {
  const store = inject(AuthStore);
  const router = inject(Router);
  const user = store.user();
  if (!user) return router.createUrlTree(['/login']);
  if (user.role === 'admin') return true;
  if (user.role !== 'driver') return true;
  if (user.isVerified !== true) {
    return router.createUrlTree(['/profile'], {
      queryParams: { message: 'Please complete your verification to access jobs.' },
    });
  }
  return true;
};
