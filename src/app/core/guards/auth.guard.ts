import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthStore } from '../../store/auth.store';
import { LoggerService } from '../services/logger.service';

/** Blocks unauthenticated users — redirects to login (root path). */
export const authGuard: CanActivateFn = (route, state) => {
  const store = inject(AuthStore);
  const router = inject(Router);
  const logger = inject(LoggerService);
  logger.log(
    '[authGuard] checking path:',
    state.url,
    'route segments:',
    route.url.map((s) => s.path),
  );
  logger.log('[authGuard] User role from store:', store.role(), 'isLoggedIn:', store.isLoggedIn());
  return store.isLoggedIn() || router.createUrlTree(['/login']);
};
