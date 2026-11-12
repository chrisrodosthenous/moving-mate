import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthStore } from '../../store/auth.store';
import { LoggerService } from '../services/logger.service';

function urlForLog(fullUrl: string): string {
  const i = fullUrl.indexOf('?');
  return i === -1 ? fullUrl : fullUrl.slice(0, i);
}

/**
 * HTTP interceptor that:
 *  1. Attaches the JWT from localStorage as a Bearer token.
 *  2. On 401 (expired / invalid token) — clears auth state and hard-redirects
 *     to the login page.  Login/register endpoints are excluded so a wrong
 *     password doesn't wipe the session.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  // Must run here — interceptor body is the injection context (not inside catchError).
  const authStore = inject(AuthStore);
  const logger = inject(LoggerService);
  const token = authStore.token();
  if (token) {
    req = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
  }

  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status === 401 && !req.url.includes('/api/auth/')) {
        const path = window.location.pathname;
        const willRedirect = path !== '/login' && path !== '/register';
        logger.log(
          '[authInterceptor] 401 — session cleared',
          { method: req.method, url: urlForLog(req.url), redirectToLogin: willRedirect },
        );
        authStore.logout();
        if (willRedirect) {
          window.location.replace('/login');
        }
      }
      const suspended =
        err.status === 403 &&
        err.error &&
        typeof err.error === 'object' &&
        (err.error as { code?: string }).code === 'ACCOUNT_SUSPENDED';
      if (suspended && !req.url.includes('/api/auth/login')) {
        authStore.logout();
        if (window.location.pathname !== '/login') {
          window.location.replace('/login?suspended=1');
        }
      }
      return throwError(() => err);
    }),
  );
};
