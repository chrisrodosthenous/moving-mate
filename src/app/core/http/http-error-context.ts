import { HttpContext, HttpContextToken } from '@angular/common/http';

/**
 * When true, {@link httpErrorInterceptor} does not show a ToastService message.
 * Use for: silent polling, NgRx-driven requests (store shows errors), background sync, chat polling.
 */
export const SKIP_GLOBAL_HTTP_ERROR_TOAST = new HttpContextToken<boolean>(() => false);

export type HttpToastControl = { skipGlobalErrorToast?: boolean };

/** Merge with existing {@link HttpContext} on a request. */
export function httpOptionsSkipGlobalErrorToast(
  existing?: HttpContext,
): { context: HttpContext } {
  const ctx = (existing ?? new HttpContext()).set(SKIP_GLOBAL_HTTP_ERROR_TOAST, true);
  return { context: ctx };
}
