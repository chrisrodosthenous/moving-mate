import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthStore } from '../../store/auth.store';
import { LoggerService } from '../services/logger.service';

/** Allows access only for customers (admins can also pass for testing). */
export const customerGuard: CanActivateFn = (route, state) => {
  const store = inject(AuthStore);
  const router = inject(Router);
  const logger = inject(LoggerService);
  const role = store.role();
  logger.log(
    '[customerGuard] path:',
    state.url,
    'role:',
    role,
    'allowed:',
    role === 'customer' || role === 'admin',
  );
  return role === 'customer' || role === 'admin' || router.createUrlTree(['/dashboard']);
};
