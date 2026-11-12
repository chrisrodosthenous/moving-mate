import {
  signalStore,
  withState,
  withComputed,
  withMethods,
  patchState,
} from '@ngrx/signals';
import { computed } from '@angular/core';
import type { DriverVehicleType } from '../core/models/driver.model';

/* ────────────────────────────────────────────────────────────────────────────
 * Auth state — mirrors the React localStorage contract so both apps can
 * coexist during the migration.  Keys: moving_mate_token, moving_mate_user
 * ──────────────────────────────────────────────────────────────────────── */

export type UserRole = 'customer' | 'driver' | 'admin';

export interface AuthUser {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  phone: string;
  email?: string;
  role: UserRole;
  isVerified?: boolean;
  licenseUrl?: string;
  verificationStatus?: 'none' | 'pending' | 'approved' | 'rejected';
  rejectionReason?: string;
  districts?: string[];
  fcmTokens?: string[];
  vehicleType?: DriverVehicleType;
  vehiclePhotoUrl?: string;
  plateNumber?: string;
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  /** True while a login / register HTTP call is in flight. */
  loading: boolean;
  error: string | null;
}

const TOKEN_KEY = 'moving_mate_token';
const USER_KEY = 'moving_mate_user';
const SESSION_TOKEN_KEY = 'moving_mate_session_token';
const SESSION_USER_KEY = 'moving_mate_session_user';

function readStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function readStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

function readSessionToken(): string | null {
  try {
    return sessionStorage.getItem(SESSION_TOKEN_KEY);
  } catch {
    return null;
  }
}

function readSessionUser(): AuthUser | null {
  try {
    const raw = sessionStorage.getItem(SESSION_USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

function isolatedSessionActive(): boolean {
  return Boolean(readSessionToken() && readSessionUser());
}

function readActiveAuth(): { token: string; user: AuthUser } | null {
  const sessionToken = readSessionToken();
  const sessionUser = readSessionUser();
  if (sessionToken && sessionUser) return { token: sessionToken, user: sessionUser };
  const token = readStoredToken();
  const user = readStoredUser();
  if (token && user) return { token, user };
  return null;
}

/** Hydrate initial state. A tab opened by Impersonate keeps its own session. */
function initialState(): AuthState {
  const active = readActiveAuth();
  return {
    token: active?.token ?? null,
    user: active?.user ?? null,
    loading: false,
    error: null,
  };
}

export const AuthStore = signalStore(
  { providedIn: 'root' },

  withState<AuthState>(initialState()),

  withComputed((store) => ({
    isLoggedIn: computed(() => !!store.token() && !!store.user()),
    role: computed(() => store.user()?.role ?? null),
    isAdmin: computed(() => store.user()?.role === 'admin'),
    isDriver: computed(() => store.user()?.role === 'driver'),
    isCustomer: computed(() => store.user()?.role === 'customer'),
    /**
     * Driver license rejected by admin: must not access active deliveries; completed history only.
     * Source: `user.verificationStatus` + `isVerified` from API / localStorage (refreshed via checkMyStatus).
     */
    isDriverVerificationRejected: computed(() => {
      const u = store.user();
      if (u?.role !== 'driver') return false;
      if (u.isVerified === true) return false;
      return u.verificationStatus === 'rejected';
    }),
    dashboardRoute: computed(() => {
      const role = store.user()?.role;
      if (role === 'admin') return '/admin';
      if (role === 'driver') return '/driver/dashboard';
      return '/customer/dashboard';
    }),
  })),

  withMethods((store) => ({
    /**
     * Call after a successful login/register HTTP response.
     * Same path for customer, driver, and admin — no role branching; FCM registration is triggered from AuthService / AppComponent.
     */
    loginSuccess(token: string, user: AuthUser): void {
      sessionStorage.removeItem(SESSION_TOKEN_KEY);
      sessionStorage.removeItem(SESSION_USER_KEY);
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      patchState(store, { token, user, loading: false, error: null });
    },

    /** Sign-in that stays in this tab and leaves the saved admin session untouched. */
    beginIsolatedSession(token: string, user: AuthUser): void {
      sessionStorage.setItem(SESSION_TOKEN_KEY, token);
      sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(user));
      patchState(store, { token, user, loading: false, error: null });
    },

    hasIsolatedSession(): boolean {
      return isolatedSessionActive();
    },

    /** Mark an auth HTTP call as in-flight. */
    setLoading(): void {
      patchState(store, { loading: true, error: null });
    },

    /** Store an auth error (login failed, etc.). */
    setError(error: string): void {
      patchState(store, { loading: false, error });
    },

    /** Update the user object (e.g. after a profile refresh). */
    updateUser(user: AuthUser): void {
      if (isolatedSessionActive()) {
        sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(user));
      } else {
        localStorage.setItem(USER_KEY, JSON.stringify(user));
      }
      patchState(store, { user });
    },

    /**
     * Full logout: wipe auth keys and reset state.
     * Keeps `fcmToken` in localStorage so the device/browser can re-sync the same registration on next login
     * and match MongoDB (push while logged out relies on DB tokens).
     */
    logout(): void {
      if (isolatedSessionActive()) {
        sessionStorage.removeItem(SESSION_TOKEN_KEY);
        sessionStorage.removeItem(SESSION_USER_KEY);
        sessionStorage.removeItem('fcmTokenRegisteredThisSession');
        sessionStorage.removeItem('fcmTokenRegisteredUserId');
        const persisted = readStoredToken();
        const persistedUser = readStoredUser();
        patchState(store, {
          token: persisted && persistedUser ? persisted : null,
          user: persisted && persistedUser ? persistedUser : null,
          loading: false,
          error: null,
        });
        return;
      }
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      sessionStorage.removeItem('fcmTokenRegisteredThisSession');
      sessionStorage.removeItem('fcmTokenRegisteredUserId');
      patchState(store, { token: null, user: null, loading: false, error: null });
    },
  })),
);
