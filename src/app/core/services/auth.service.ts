import { Injectable, inject, effect } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import type { HttpToastControl } from '../http/http-error-context';
import { httpOptionsSkipGlobalErrorToast } from '../http/http-error-context';
import { Router } from '@angular/router';
import { Observable, BehaviorSubject, catchError, map, tap, throwError } from 'rxjs';
import { AuthStore, AuthUser } from '../../store/auth.store';
import { FcmService } from './fcm.service';
import { LoggerService } from './logger.service';

// Re-export so existing consumers can keep `import { AuthUser } from 'auth.service'`.
export type { AuthUser } from '../../store/auth.store';

/* ────────────────────────────────────────────────────────────────────────────
 * AuthService — thin HTTP layer around /api/auth/*.
 * All session state lives in AuthStore (NgRx signal store), which hydrates
 * from localStorage at startup for 30-day persistent login.
 * ──────────────────────────────────────────────────────────────────────── */

const API_URL = '/api/auth';
const USERS_API = '/api/users';

export interface LoginResponse {
  message: string;
  token: string;
  user: AuthUser;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly store = inject(AuthStore);
  private readonly fcm = inject(FcmService);
  private readonly logger = inject(LoggerService);

  /**
   * BehaviorSubject kept for backward compatibility with components using
   * `auth.currentUser$.subscribe(...)`.  Synced from the NgRx signal store
   * via an Angular effect so it always reflects the latest value.
   */
  private readonly _currentUser$ = new BehaviorSubject<AuthUser | null>(this.store.user());
  readonly currentUser$ = this._currentUser$.asObservable();

  constructor() {
    effect(() => this._currentUser$.next(this.store.user()));
  }

  /* ── Convenience accessors (delegate to store signals) ──────────────── */

  get isLoggedIn(): boolean {
    return this.store.isLoggedIn();
  }

  user(): AuthUser | null {
    return this.store.user();
  }

  getToken(): string | null {
    return this.store.token();
  }

  /* ── Auth HTTP calls ────────────────────────────────────────────────── */

  login(emailOrPhone: string, password: string): Observable<LoginResponse> {
    this.store.setLoading();
    return this.http.post<LoginResponse>(`${API_URL}/login`, {
      emailOrPhone: emailOrPhone.trim(),
      password,
    }).pipe(
      tap((res) => {
        this.fcm.clearSessionRegistrationFlags();
        this.store.loginSuccess(res.token, res.user);
        queueMicrotask(() => {
          void this.fcm.registerToken().catch(() => {});
        });
      }),
      catchError((err: HttpErrorResponse) => {
        const msg = err.error?.message;
        this.store.setError(typeof msg === 'string' ? msg : 'Login failed');
        return throwError(() => err);
      }),
    );
  }

  register(data: {
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    email: string;
    phoneNumber: string;
    password: string;
    role: 'customer' | 'driver';
    districts?: string[];
  }): Observable<LoginResponse> {
    this.store.setLoading();
    return this.http.post<LoginResponse>(`${API_URL}/register`, data).pipe(
      tap((res) => this.onRegisterSuccess(res)),
      catchError((err: HttpErrorResponse) => this.handleRegisterError(err)),
    );
  }

  /** Driver signup with vehicle type + verification photo (multipart). */
  registerDriver(formData: FormData): Observable<LoginResponse> {
    this.store.setLoading();
    return this.http.post<LoginResponse>(`${API_URL}/register-driver`, formData).pipe(
      tap((res) => this.onRegisterSuccess(res)),
      catchError((err: HttpErrorResponse) => this.handleRegisterError(err)),
    );
  }

  private onRegisterSuccess(res: LoginResponse): void {
    this.fcm.clearSessionRegistrationFlags();
    this.store.loginSuccess(res.token, res.user);
    setTimeout(() => {
      void this.fcm
        .registerToken({ registrationErrorContext: 'NEW user' })
        .then((tok) => {
          if (!tok) {
            this.logger.error(
              '[FCM] Token generation failed for NEW user: no token returned (permission denied, unsupported browser, or missing config)',
            );
          }
        });
    }, 400);
  }

  private handleRegisterError(err: HttpErrorResponse): Observable<never> {
    const msg = err.error?.message;
    this.store.setError(typeof msg === 'string' ? msg : 'Registration failed');
    return throwError(() => err);
  }

  /**
   * Full logout: clear auth state and navigate.
   * FCM tokens stay in MongoDB (and local device storage) so push notifications still work while logged out.
   * Use {@link FcmService.removeTokenFromBackend} only for explicit revocation (e.g. user turns off notifications).
   */
  async logout(): Promise<void> {
    this.fcm.clearSessionRegistrationFlags();
    this.store.logout();
    this.router.navigate(['/login']);
  }

  /* ── Profile / user management ──────────────────────────────────────── */

  updateProfile(
    data: {
      firstName?: string;
      lastName?: string;
      phoneNumber?: string;
    },
    opts?: HttpToastControl,
  ): Observable<{ message: string; user: AuthUser }> {
    const h = opts?.skipGlobalErrorToast ? httpOptionsSkipGlobalErrorToast() : {};
    return this.http.put<{ message: string; user: AuthUser }>(`${USERS_API}/profile`, data, h).pipe(
      tap((res) => this.store.updateUser(res.user)),
    );
  }

  /**
   * Change password: server verifies `currentPassword` (bcrypt) before setting `newPassword`.
   * Uses PATCH /api/users/profile with body { currentPassword, newPassword }.
   */
  changePassword(
    currentPassword: string,
    newPassword: string,
    opts?: HttpToastControl,
  ): Observable<{ message: string; user: AuthUser }> {
    const h = opts?.skipGlobalErrorToast ? httpOptionsSkipGlobalErrorToast() : {};
    return this.http
      .patch<{ success?: boolean; message: string; user: AuthUser }>(`${USERS_API}/profile`, {
        currentPassword,
        newPassword,
      }, h)
      .pipe(tap((res) => this.store.updateUser(res.user)));
  }

  /** POST /api/auth/forgot-password — always returns generic success body if email appears valid (no enumeration). */
  forgotPassword(email: string): Observable<{ message: string }> {
    const h = httpOptionsSkipGlobalErrorToast();
    return this.http.post<{ message: string }>(
      `${API_URL}/forgot-password`,
      { email: email.trim().toLowerCase() },
      h,
    );
  }

  /** POST /api/auth/reset-password — `token` from email link query string. */
  resetPassword(token: string, newPassword: string): Observable<{ message: string }> {
    const h = httpOptionsSkipGlobalErrorToast();
    return this.http.post<{ message: string }>(
      `${API_URL}/reset-password`,
      { token: token.trim(), newPassword },
      h,
    );
  }

  /** Driver working districts — PATCH; server requires at least one district. */
  updateDriverDistricts(
    districts: string[],
    opts?: HttpToastControl,
  ): Observable<{ message: string; user: AuthUser }> {
    const h = opts?.skipGlobalErrorToast ? httpOptionsSkipGlobalErrorToast() : {};
    return this.http
      .patch<{ success: boolean; message: string; user: AuthUser }>(
        `${USERS_API}/profile/districts`,
        { districts },
        h,
      )
      .pipe(map((res) => ({ message: res.message, user: res.user })));
  }

  /** Refresh user data from GET /api/users/profile (e.g. to check verification). */
  checkMyStatus(opts?: HttpToastControl): Observable<{ user: AuthUser }> {
    const h = opts?.skipGlobalErrorToast ? httpOptionsSkipGlobalErrorToast() : {};
    return this.http.get<{ user: AuthUser }>(`${USERS_API}/profile`, h).pipe(
      tap((res) => this.store.updateUser(res.user)),
    );
  }

  /** Upload driver license (PDF/JPG/PNG, max 5 MB). */
  uploadLicense(file: File, opts?: HttpToastControl): Observable<{ message: string; user: AuthUser }> {
    const form = new FormData();
    form.append('license', file);
    const h = opts?.skipGlobalErrorToast ? httpOptionsSkipGlobalErrorToast() : {};
    return this.http.post<{ message: string; user: AuthUser }>(`${USERS_API}/upload-license`, form, h).pipe(
      tap((res) => this.store.updateUser(res.user)),
    );
  }
}
