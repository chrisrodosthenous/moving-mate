import {
  signalStore,
  withState,
  withMethods,
  patchState,
} from '@ngrx/signals';

/* ────────────────────────────────────────────────────────────────────────────
 * Push notification state — holds the latest FCM push payload so any
 * component can react to incoming notifications (in-app toasts, badges, etc.)
 * Also tracks permission status and the device's FCM token.
 * ──────────────────────────────────────────────────────────────────────── */

export type NotificationPermission = 'default' | 'granted' | 'denied' | 'unsupported';

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  type?: string;
  [key: string]: string | undefined;
}

interface NotificationState {
  permission: NotificationPermission;
  fcmToken: string | null;
  /** Latest foreground push — components can watch this signal for in-app toasts. */
  latestPush: PushPayload | null;
  /** Incremented on each push so even identical payloads trigger change detection. */
  pushCount: number;
}

export const NotificationStore = signalStore(
  { providedIn: 'root' },

  withState<NotificationState>({
    permission: 'default',
    fcmToken: null,
    latestPush: null,
    pushCount: 0,
  }),

  withMethods((store) => ({
    setPermission(permission: NotificationPermission): void {
      patchState(store, { permission });
    },

    setFcmToken(fcmToken: string | null): void {
      patchState(store, { fcmToken });
    },

    /** Record a foreground push payload — triggers UI reactions. */
    onPushReceived(payload: PushPayload): void {
      patchState(store, {
        latestPush: payload,
        pushCount: store.pushCount() + 1,
      });
    },

    clearLatestPush(): void {
      patchState(store, { latestPush: null });
    },
  })),
);
