/**
 * Barrel exports for NgRx signal stores.
 *
 * Usage: import { AuthStore, LoadingStore, NotificationStore } from '@app/store';
 */
export { AuthStore } from './auth.store';
export type { AuthUser, UserRole } from './auth.store';

export { LoadingStore } from './loading.store';

export { NotificationStore } from './notification.store';
export type { PushPayload, NotificationPermission } from './notification.store';
