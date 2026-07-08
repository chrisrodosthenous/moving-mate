import { ErrorHandler, Injectable, inject, isDevMode } from '@angular/core';
import { LoggerService } from '../services/logger.service';
import { ToastService } from '../services/toast.service';

const GENERIC_CLIENT_ERROR =
  'Something went wrong. Please refresh the page and try again.';

/** Throttle repeated toasts from error storms (e.g. repeated change-detection throws). */
let lastGlobalToastAt = 0;
const GLOBAL_ERROR_TOAST_COOLDOWN_MS = 4000;

/**
 * Handles unhandled client errors (outside HttpClient). HTTP API errors use
 * `http-error.interceptor.ts` + `extractHttpErrorMessage`.
 *
 * - Never rethrows (avoids infinite loops).
 * - Toast calls are wrapped so a failure during bootstrap does not recurse.
 * - Production: generic user message + throttling; console omits stack details.
 */
@Injectable()
export class AppGlobalErrorHandler implements ErrorHandler {
  private readonly toast = inject(ToastService);
  private readonly logger = inject(LoggerService);

  handleError(error: unknown): void {
    const err = error instanceof Error ? error : new Error(typeof error === 'string' ? error : 'Unknown error');
    const msg = err.message ?? '';

    if (isDevMode()) {
      this.logger.error('[AppGlobalErrorHandler]', error);
    } else {
      const oneLine = msg.split('\n')[0]?.slice(0, 160) ?? '';
      this.logger.error('[AppGlobalErrorHandler]', err.name ?? 'Error', oneLine);
    }

    if (/ChunkLoadError|Loading chunk\s+\d+|Failed to fetch dynamically imported module/i.test(msg)) {
      this.safeToast(
        'A new version of the app may be available. Please refresh the page.',
        'info',
      );
      return;
    }

    if (isDevMode()) {
      /* Rely on console in development; avoids toast spam from framework warnings. */
      return;
    }

    this.safeToastThrottled(GENERIC_CLIENT_ERROR, 'error');
  }

  private safeToast(message: string, type: 'error' | 'info'): void {
    try {
      this.toast.show(message, type);
    } catch {
      /* App still bootstrapping or toast unavailable */
    }
  }

  private safeToastThrottled(message: string, type: 'error'): void {
    const now = Date.now();
    if (now - lastGlobalToastAt < GLOBAL_ERROR_TOAST_COOLDOWN_MS) return;
    lastGlobalToastAt = now;
    this.safeToast(message, type);
  }
}
