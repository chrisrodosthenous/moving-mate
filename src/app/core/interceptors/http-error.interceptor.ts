import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { LoggerService } from '../services/logger.service';
import { ToastService } from '../services/toast.service';
import { extractHttpErrorMessage } from '../utils/http-error';
import { SKIP_GLOBAL_HTTP_ERROR_TOAST } from '../http/http-error-context';

function statusFallbackMessage(status: number): string {
  switch (status) {
    case 0:
      return 'Network error. Check your connection.';
    case 400:
      return 'Invalid request.';
    case 403:
      return 'You do not have permission for this action.';
    case 404:
      return 'Resource not found.';
    case 409:
      return 'This action could not be completed.';
    case 422:
      return 'Validation failed.';
    case 429:
      return 'Too many requests. Please wait and try again.';
    case 500:
    case 502:
    case 503:
    case 504:
      return 'Something went wrong on the server. Please try again later.';
    default:
      return 'Request failed.';
  }
}

function shouldSkipToastForUrl(url: string): boolean {
  const u = url.toLowerCase();
  return u.includes('/api/auth/login') || u.includes('/api/auth/register');
}

/** Strip query string before logging (tokens or PII sometimes appear in query). */
function urlForLog(fullUrl: string): string {
  const i = fullUrl.indexOf('?');
  return i === -1 ? fullUrl : fullUrl.slice(0, i);
}

/**
 * Global HTTP error handling (functional interceptor).
 * Shows sanitized, user-safe toasts; response bodies only via {@linkcode LoggerService.log} in non-production.
 *
 * Register **first** in `withInterceptors([...])` so this wraps the rest of the chain.
 * Pairs with `authInterceptor` (401 → logout + redirect) and `AppGlobalErrorHandler` for non-HTTP errors.
 */
export const httpErrorInterceptor: HttpInterceptorFn = (req, next) => {
  const toast = inject(ToastService);
  const logger = inject(LoggerService);

  return next(req).pipe(
    catchError((err: unknown) => {
      if (!(err instanceof HttpErrorResponse)) {
        if (!environment.production) {
          logger.error('[HTTP] non-HTTP error', err);
        } else {
          logger.warn('[HTTP] non-HTTP failure', typeof err);
        }
        return throwError(() => err);
      }

      const status = err.status;
      const safeUrl = urlForLog(req.url);

      if (!environment.production) {
        logger.error('[HTTP]', status, req.method, safeUrl, err.message);
        if (err.error !== undefined) {
          logger.log('[HTTP] response body (dev only)', err.error);
        }
      } else {
        logger.warn('[HTTP failed]', status, req.method, safeUrl);
      }

      if (req.context.get(SKIP_GLOBAL_HTTP_ERROR_TOAST)) {
        return throwError(() => err);
      }

      if (shouldSkipToastForUrl(req.url)) {
        return throwError(() => err);
      }

      // Session expired — auth interceptor redirects; avoid stacking a toast.
      if (status === 401) {
        return throwError(() => err);
      }

      const fallback = statusFallbackMessage(status);
      const msg = extractHttpErrorMessage(err, fallback);
      toast.show(msg, 'error');

      return throwError(() => err);
    }),
  );
};
