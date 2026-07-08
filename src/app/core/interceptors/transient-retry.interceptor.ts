import { HttpEvent, HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, switchMap, throwError, timer } from 'rxjs';

const MAX_RETRIES = 2;

function isTransientFailure(err: HttpErrorResponse): boolean {
  if (err.status === 401) return false;
  if (err.status === 0) return true;
  if (err.status >= 500 && err.status < 600) return true;
  return false;
}

/**
 * Retries up to 2 times with backoff (400ms × attempt), matching React Axios behaviour
 * for network-like failures and 5xx. Skips /api/auth/* and non-transient errors.
 */
export const transientRetryInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.url.includes('/api/auth/')) {
    return next(req);
  }

  const attempt = (retryCount: number): Observable<HttpEvent<unknown>> =>
    next(req).pipe(
      catchError((err: HttpErrorResponse) => {
        if (!isTransientFailure(err) || retryCount >= MAX_RETRIES) {
          return throwError(() => err);
        }
        const delayMs = 400 * (retryCount + 1);
        return timer(delayMs).pipe(switchMap(() => attempt(retryCount + 1)));
      }),
    );

  return attempt(0);
};
