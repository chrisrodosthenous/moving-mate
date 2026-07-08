import { Injectable, inject, NgZone, Injector } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { initializeApp, FirebaseApp } from 'firebase/app';
import {
  getMessaging,
  getToken,
  deleteToken,
  isSupported,
  onMessage,
  Messaging,
} from 'firebase/messaging';
import { environment } from '../../../environments/environment';
import { NotificationStore, PushPayload } from '../../store/notification.store';
import { AuthStore } from '../../store/auth.store';
import { SocketService } from './socket.service';
import { httpOptionsSkipGlobalErrorToast } from '../http/http-error-context';
import { LoggerService } from './logger.service';

/* ────────────────────────────────────────────────────────────────────────────
 * FCM Service — mirrors the React fcmToken.js + firebase-config.js logic:
 *   • Firebase Web SDK init (singleton)
 *   • Service Worker registration for background push
 *   • Foreground onMessage → NotificationStore
 *   • Token registration with POST /api/users/update-fcm-token (same path for customer, driver, admin)
 *   • Session-level deduplication via sessionStorage
 * Logout does not remove the device token from MongoDB — see AuthService.logout.
 * ──────────────────────────────────────────────────────────────────────── */

const FCM_TOKEN_KEY = 'fcmToken';
const FCM_PROJECT_KEY = 'fcmTokenProject';
const SESSION_FCM_REGISTERED = 'fcmTokenRegisteredThisSession';
/** Session flag must match logged-in user id or we skip POST — avoids stale association after account switch. */
const SESSION_FCM_USER_ID = 'fcmTokenRegisteredUserId';

/** Optional flags for {@link FcmService.registerToken}. */
export type RegisterTokenOptions = {
  /** If set, failures log as `[FCM] Token generation failed for <label>: …` (e.g. NEW user after signup). */
  registrationErrorContext?: string;
};

@Injectable({ providedIn: 'root' })
export class FcmService {
  private readonly http = inject(HttpClient);
  private readonly zone = inject(NgZone);
  private readonly notificationStore = inject(NotificationStore);
  private readonly authStore = inject(AuthStore);
  private readonly injector = inject(Injector);
  private readonly logger = inject(LoggerService);

  private app: FirebaseApp | null = null;
  private messaging: Messaging | null = null;
  private foregroundUnsub: (() => void) | null = null;
  /** Serialize concurrent registerToken() (login + bootstrap) to a single in-flight registration. */
  private registerTokenInFlight: Promise<string | null> | null = null;
  /** Serialize foreground subscription so parallel calls share one onMessage registration. */
  private foregroundSetupPromise: Promise<void> | null = null;

  /* ── Firebase init (lazy singleton) ───────────────────────────────────── */

  isConfigured(): boolean {
    const c = environment.firebase;
    return !!(c.apiKey && c.projectId && c.appId && c.messagingSenderId);
  }

  private getApp(): FirebaseApp {
    if (!this.app) {
      this.app = initializeApp(environment.firebase);
    }
    return this.app;
  }

  private async getMessagingInstance(): Promise<Messaging | null> {
    if (this.messaging) return this.messaging;
    const supported = await isSupported();
    if (!supported || !this.isConfigured()) return null;
    this.messaging = getMessaging(this.getApp());
    return this.messaging;
  }

  /* ── Notification permission ──────────────────────────────────────────── */

  async requestPermission(): Promise<NotificationPermission> {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      this.notificationStore.setPermission('unsupported');
      return 'denied';
    }
    if (Notification.permission === 'granted') {
      this.notificationStore.setPermission('granted');
      return 'granted';
    }
    const result = await Notification.requestPermission();
    this.notificationStore.setPermission(result as 'granted' | 'denied' | 'default');
    return result;
  }

  /* ── FCM token lifecycle ──────────────────────────────────────────────── */

  /** Clears the stored FCM token from Firebase SDK and localStorage. */
  /** Clears “already synced this session” flags so the next register/sync POSTs to the backend again. */
  clearSessionRegistrationFlags(): void {
    if (typeof sessionStorage === 'undefined') return;
    sessionStorage.removeItem(SESSION_FCM_REGISTERED);
    sessionStorage.removeItem(SESSION_FCM_USER_ID);
  }

  async clearToken(): Promise<void> {
    try {
      const messaging = await this.getMessagingInstance();
      if (messaging) {
        await deleteToken(messaging);
      }
    } catch (err: any) {
      this.logger.warn('[FCM] deleteToken failed:', err?.message);
    }
    localStorage.removeItem(FCM_TOKEN_KEY);
    localStorage.removeItem(FCM_PROJECT_KEY);
    this.notificationStore.setFcmToken(null);
  }

  /**
   * Registers the SW, obtains an FCM token, and POSTs it to the backend.
   * Skips the API call if the same token was already sent this session.
   * Concurrent calls share one in-flight operation (avoids duplicate backend writes).
   */
  async registerToken(options?: RegisterTokenOptions): Promise<string | null> {
    if (this.registerTokenInFlight) {
      // Signup path passes registrationErrorContext — wait for generic callers to finish, then run with logging context.
      if (!options?.registrationErrorContext) {
        return this.registerTokenInFlight;
      }
      await this.registerTokenInFlight;
    }
    this.registerTokenInFlight = this.registerTokenImpl(options).finally(() => {
      this.registerTokenInFlight = null;
    });
    return this.registerTokenInFlight;
  }

  /**
   * After landing on the dashboard: re-prompt for notifications if still "default",
   * then register an FCM token if this session has not yet POSTed one for the current user.
   */
  async ensurePushRegistrationOnDashboard(): Promise<void> {
    if (typeof window === 'undefined' || !this.authStore.token() || !this.isConfigured()) {
      return;
    }

    if ('Notification' in window && Notification.permission === 'default') {
      await this.requestPermission();
    }

    const userId = this.authStore.user()?.id ?? '';
    const regTok = sessionStorage.getItem(SESSION_FCM_REGISTERED);
    const regUid = sessionStorage.getItem(SESSION_FCM_USER_ID);
    const hasSessionForUser = Boolean(regTok && regUid === userId);

    if (hasSessionForUser) {
      return;
    }

    try {
      const tok = await this.registerToken();
      if (!tok) {
        this.logger.warn(
          '[FCM] Dashboard: no FCM token after registration attempt (permission, unsupported browser, or config).',
        );
      }
    } catch (err: any) {
      this.logger.error('[FCM] Dashboard: registerToken failed:', err?.message ?? err);
    }
  }

  private logRegistrationContextFailure(ctx: string | undefined, message: string): void {
    if (ctx) {
      this.logger.error(`[FCM] Token generation failed for ${ctx}: ${message}`);
    }
  }

  private async registerTokenImpl(options?: RegisterTokenOptions): Promise<string | null> {
    const ctx = options?.registrationErrorContext;

    if (!this.isConfigured()) {
      this.logRegistrationContextFailure(ctx, 'Firebase not configured');
      if (!ctx) this.logger.warn('[FCM] Firebase not configured. Skipping.');
      return null;
    }

    // Same session + same user already synced: avoid requestPermission, getToken, and POST again.
    const userIdEarly = this.authStore.user()?.id ?? '';
    const storedSynced = (localStorage.getItem(FCM_TOKEN_KEY) || '').trim();
    if (
      typeof window !== 'undefined' &&
      Notification.permission === 'granted' &&
      storedSynced &&
      sessionStorage.getItem(SESSION_FCM_REGISTERED) === storedSynced &&
      sessionStorage.getItem(SESSION_FCM_USER_ID) === userIdEarly
    ) {
      this.notificationStore.setFcmToken(storedSynced);
      return storedSynced;
    }

    const perm = await this.requestPermission();
    if (perm !== 'granted') {
      this.logRegistrationContextFailure(ctx, `Notification permission not granted (${perm})`);
      return null;
    }

    const messaging = await this.getMessagingInstance();
    if (!messaging) {
      this.logRegistrationContextFailure(ctx, 'Messaging not supported or Firebase not initialized');
      return null;
    }

    // After permission: short-circuit again in case another call completed registration meanwhile.
    const userId = this.authStore.user()?.id ?? '';
    const storedAfterPerm = (localStorage.getItem(FCM_TOKEN_KEY) || '').trim();
    if (
      storedAfterPerm &&
      sessionStorage.getItem(SESSION_FCM_REGISTERED) === storedAfterPerm &&
      sessionStorage.getItem(SESSION_FCM_USER_ID) === userId
    ) {
      this.notificationStore.setFcmToken(storedAfterPerm);
      return storedAfterPerm;
    }

    const vapidKey = environment.firebaseVapidKey;
    if (!vapidKey) {
      this.logRegistrationContextFailure(ctx, 'VAPID key missing in environment');
      if (!ctx) this.logger.warn('[FCM] VAPID key missing.');
      return null;
    }

    // Auto-clear stale token if the Firebase project changed.
    const currentProject = environment.firebase.projectId;
    const storedProject = localStorage.getItem(FCM_PROJECT_KEY);
    if (storedProject && storedProject !== currentProject) {
      this.logger.warn(`[FCM] Project changed (${storedProject} → ${currentProject}). Clearing.`);
      await this.clearToken();
    }

    try {
      // Ensure SW is registered and activated.
      const existing = await navigator.serviceWorker.getRegistration('/');
      if (existing?.active && new URL(existing.active.scriptURL).pathname !== '/firebase-messaging-sw.js') {
        await existing.unregister();
      }

      const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
        scope: '/',
        updateViaCache: 'none',
      });

      await new Promise<void>((resolve) => {
        if (registration.active) { resolve(); return; }
        const sw = registration.installing || registration.waiting;
        if (!sw) { resolve(); return; }
        sw.addEventListener('statechange', function handler(e: Event) {
          if ((e.target as ServiceWorker).state === 'activated') {
            sw.removeEventListener('statechange', handler);
            resolve();
          }
        });
      });

      await registration.update();

      const raw = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });
      const token = String(raw ?? '').trim();
      if (!token) {
        this.logRegistrationContextFailure(ctx, 'empty token returned from Firebase getToken()');
        return null;
      }

      this.logger.log('[FCM] Token obtained:', token.slice(-12));
      localStorage.setItem(FCM_PROJECT_KEY, currentProject);
      localStorage.setItem(FCM_TOKEN_KEY, token);
      this.notificationStore.setFcmToken(token);

      // Session dedupe: same token + same user only (switching accounts must POST again).
      if (
        sessionStorage.getItem(SESSION_FCM_REGISTERED) === token &&
        sessionStorage.getItem(SESSION_FCM_USER_ID) === userId
      ) {
        return token;
      }

      await firstValueFrom(
        this.http.post('/api/users/update-fcm-token', { fcmToken: token }, httpOptionsSkipGlobalErrorToast()),
      );
      sessionStorage.setItem(SESSION_FCM_REGISTERED, token);
      sessionStorage.setItem(SESSION_FCM_USER_ID, userId);
      this.logger.log('[FCM] Token registered with backend.');
      return token;
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      this.logRegistrationContextFailure(ctx, msg);
      if (!ctx) this.logger.warn('[FCM] registerToken failed:', msg);
      return null;
    }
  }

  /**
   * If the user is logged in and a token exists in localStorage, POST it so the backend stays in sync
   * (e.g. after a hard refresh). Skips when this session already registered the same token.
   * Mirrors React `syncStoredFcmTokenToBackend`.
   */
  async syncStoredTokenToBackend(): Promise<{ synced: boolean; reason?: string }> {
    if (typeof window === 'undefined') return { synced: false };
    const jwt = this.authStore.token();
    const stored = (localStorage.getItem(FCM_TOKEN_KEY) || '').trim();
    if (!jwt || !stored) return { synced: false };
    const userId = this.authStore.user()?.id ?? '';
    if (
      sessionStorage.getItem(SESSION_FCM_REGISTERED) === stored &&
      sessionStorage.getItem(SESSION_FCM_USER_ID) === userId
    ) {
      return { synced: false, reason: 'already_synced' };
    }
    try {
      const bodyToken = stored.trim();
      if (!bodyToken) return { synced: false };
      await firstValueFrom(
        this.http.post(
          '/api/users/update-fcm-token',
          { fcmToken: bodyToken },
          httpOptionsSkipGlobalErrorToast(),
        ),
      );
      sessionStorage.setItem(SESSION_FCM_REGISTERED, stored);
      sessionStorage.setItem(SESSION_FCM_USER_ID, userId);
      return { synced: true };
    } catch {
      return { synced: false };
    }
  }

  /**
   * Reserved for future “revoke notifications” UX. Does not call the API — MongoDB tokens must
   * persist through logout so offline push works for all roles.
   */
  async removeTokenFromBackend(): Promise<void> {
    return;
  }

  /* ── Foreground push listener ─────────────────────────────────────────── */

  /**
   * Subscribe to foreground pushes (tab open, SW skips OS notification when a tab is focused).
   * Web payloads use `data` (no root notification); native may still populate `notification`.
   */
  async subscribeForeground(): Promise<void> {
    if (this.foregroundUnsub) {
      return;
    }
    if (!this.foregroundSetupPromise) {
      this.foregroundSetupPromise = this.attachForegroundListener().finally(() => {
        this.foregroundSetupPromise = null;
      });
    }
    return this.foregroundSetupPromise;
  }

  private async attachForegroundListener(): Promise<void> {
    const messaging = await this.getMessagingInstance();
    if (!messaging) return;
    if (this.foregroundUnsub) return;

    this.foregroundUnsub = onMessage(messaging, (payload) => {
      this.zone.run(() => {
        const data = payload.data ?? {};
        const dataTitle = typeof data['title'] === 'string' ? data['title'] : '';
        const dataBody = typeof data['body'] === 'string' ? data['body'] : '';
        const type = typeof data['type'] === 'string' ? data['type'] : undefined;
        if (this.shouldSuppressForegroundPush(type)) {
          return;
        }
        const push: PushPayload = {
          title: (payload.notification?.title || dataTitle || 'Moving Mate').trim(),
          body: (payload.notification?.body || dataBody || '').trim(),
          url: typeof data['url'] === 'string' ? data['url'] : undefined,
          type,
        };
        this.notificationStore.onPushReceived(push);
      });
    });
  }

  /**
   * When Socket.io is connected, realtime events already update the in-app UI.
   * Skip foreground FCM toasts for those types (avoids duplicate alerts with socket).
   */
  private shouldSuppressForegroundPush(type?: string): boolean {
    if (!type) {
      return false;
    }
    let connected = false;
    try {
      connected = this.injector.get(SocketService).socketConnectionState() === 'connected';
    } catch {
      return false;
    }
    if (!connected) {
      return false;
    }
    const socketHandled = new Set([
      'new_order',
      'order_accepted',
      'order_in_transit',
      'rating_request',
    ]);
    return socketHandled.has(type);
  }

  /** Unsubscribe foreground listener (call on destroy if needed). */
  unsubscribeForeground(): void {
    this.foregroundUnsub?.();
    this.foregroundUnsub = null;
    this.foregroundSetupPromise = null;
  }
}
