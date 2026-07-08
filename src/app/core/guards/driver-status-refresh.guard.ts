import { inject } from '@angular/core';
import { CanActivateFn } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { LoggerService } from '../services/logger.service';

/**
 * Refreshes the current user from GET /api/users/profile before entering a driver route.
 * Keeps `verificationStatus` / `isVerified` in sync when an admin rejects the driver mid-session.
 * Does not block navigation on error (still allows route; UI uses last known user).
 */
export const driverStatusRefreshGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const logger = inject(LoggerService);
  return auth.checkMyStatus({ skipGlobalErrorToast: true }).pipe(
    map(() => true),
    catchError((err) => {
      logger.warn('[driver] Status refresh failed (continuing navigation):', err?.error?.message ?? err);
      return of(true);
    }),
  );
};
