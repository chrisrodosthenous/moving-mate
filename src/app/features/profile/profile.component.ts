import { Component, computed, DestroyRef, inject, signal, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { NgClass, DecimalPipe } from '@angular/common';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { Store } from '@ngrx/store';
import { Actions, ofType } from '@ngrx/effects';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService, AuthUser } from '../../core/services/auth.service';
import { AuthStore } from '../../store/auth.store';
import { ToastService } from '../../core/services/toast.service';
import { SidebarComponent } from '../../shared/components/sidebar/sidebar.component';
import { CustomerMobileNavComponent } from '../../shared/components/customer/customer-mobile-nav.component';
import { DriverMobileNavComponent } from '../../shared/components/driver/driver-mobile-nav.component';
import { LucideAngularModule } from 'lucide-angular';
import { UiButtonComponent } from '@/components/ui/button';
import { UiCardComponent, UiCardContentComponent } from '@/components/ui/card';
import { UiInputDirective } from '@/components/ui/input';
import * as DriverActions from '../driver/state/driver.actions';
import {
  selectDriverDistrictsError,
  selectDriverDistrictsSaving,
} from '../driver/state/driver.selectors';
import {
  driverVehicleTypeLabel,
} from '../../core/models/driver.model';
import { UiBadgeComponent } from '@/components/ui/badge';
import { getPasswordPolicyErrors, validatePassword } from '../../shared/utils/password-policy';
import { WalletService } from '../../core/services/wallet.service';
import { leafShellOutletData } from '../../shared/routing/shell-route.helper';

const PHONE_PREFIX = '+357';
const AUTO_CHECK_VERIFICATION_MS = 30_000;

/** Must match server CYPRUS_DISTRICTS. */
export const DRIVER_WORKING_DISTRICTS = [
  'Nicosia',
  'Limassol',
  'Larnaca',
  'Paphos',
  'Famagusta',
] as const;

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [
    NgClass,
    DecimalPipe,
    FormsModule,
    SidebarComponent,
    CustomerMobileNavComponent,
    DriverMobileNavComponent,
    LucideAngularModule,
    UiButtonComponent,
    UiCardComponent,
    UiCardContentComponent,
    UiInputDirective,
    UiBadgeComponent,
  ],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.css',
})
export class ProfileComponent implements OnInit, OnDestroy {
  readonly DRIVER_WORKING_DISTRICTS = DRIVER_WORKING_DISTRICTS;
  readonly driverVehicleTypeLabel = driverVehicleTypeLabel;

  authService = inject(AuthService);
  private readonly authStore = inject(AuthStore);
  private readonly store = inject(Store);
  private readonly actions$ = inject(Actions);
  private toast = inject(ToastService);
  private cdr = inject(ChangeDetectorRef);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private autoCheckInterval: ReturnType<typeof setInterval> | null = null;

  /** Driver working-district checkboxes (draft). */
  readonly driverDistrictsDraft = signal<string[]>([]);
  private readonly initialDistrictsFingerprint = signal('');

  readonly districtsSaving = toSignal(this.store.select(selectDriverDistrictsSaving), {
    initialValue: false,
  });
  readonly districtsError = toSignal(this.store.select(selectDriverDistrictsError), {
    initialValue: null,
  });

  readonly districtsDirty = computed(() => {
    const cur = JSON.stringify([...this.driverDistrictsDraft()].sort());
    return cur !== this.initialDistrictsFingerprint();
  });

  readonly canSaveWorkingDistricts = computed(
    () =>
      this.districtsDirty() &&
      this.driverDistrictsDraft().length > 0 &&
      !this.districtsSaving(),
  );

  /** Local copy of current user; updated on check status so template refreshes. */
  readonly user = signal<AuthUser | null>(null);

  /** Vehicle photo URL for driver profile thumbnail. */
  readonly vehiclePhotoUrl = computed(() => this.user()?.vehiclePhotoUrl?.trim() || '');

  readonly vehicleTypeLabel = computed(() =>
    driverVehicleTypeLabel(this.user()?.vehicleType),
  );

  readonly showVehiclePendingBadge = computed(
    () => this.user()?.role === 'driver' && this.user()?.isVerified !== true,
  );

  readonly driverIsVerified = computed(() => this.user()?.isVerified === true);

  readonly driverHasUploadedLicense = computed(() => {
    const uploaded = this.licenseUrl().trim();
    const stored = (this.user()?.licenseUrl ?? '').trim();
    return Boolean(uploaded || stored);
  });

  /** After license upload while admin review is in progress. */
  readonly driverShowUnderReview = computed(() => {
    const u = this.user();
    return (
      u?.role === 'driver' &&
      u.isVerified !== true &&
      u.verificationStatus === 'pending' &&
      this.driverHasUploadedLicense()
    );
  });

  /** Before any license document has been submitted. */
  readonly driverShowLicensePrompt = computed(() => {
    const u = this.user();
    if (u?.role !== 'driver' || u.isVerified === true) return false;
    if (u.verificationStatus === 'rejected') return false;
    return !this.driverHasUploadedLicense();
  });

  readonly driverShowLicenseUpload = computed(() => {
    const u = this.user();
    if (u?.role !== 'driver' || u.isVerified === true) return false;
    if (u.verificationStatus === 'pending' && this.driverHasUploadedLicense()) return false;
    return true;
  });

  /** Profile uses route `data.pageTitle` so the headline matches dashboards / shell chrome. */
  readonly shellOutletTick = signal(0);

  readonly pageHeading = computed(() => {
    void this.shellOutletTick();
    return leafShellOutletData(this.router).pageTitle || 'Profile';
  });

  readonly showMobileBottomNav = computed(() => {
    const r = this.user()?.role;
    return r === 'customer' || r === 'driver';
  });

  firstName = '';
  lastName = '';
  phoneDigits = '';
  loading = signal(false);
  error = signal('');
  success = signal(false);

  /** License upload: stored URL after successful upload (from API or current user). */
  licenseUrl = signal<string>('');
  uploadLicenseLoading = signal(false);
  uploadLicenseError = signal('');
  uploadLicenseSuccess = signal(false);

  /** Check verification status: loading and message after check ('verified' | 'rejected'). */
  checkStatusLoading = signal(false);
  verificationMessage = signal<'verified' | 'rejected' | null>(null);

  /** Change password (customer + driver). Sent as `currentPassword` to PATCH /api/users/profile. */
  currentPassword = '';
  newPassword = '';
  confirmNewPassword = '';
  passwordChangeLoading = signal(false);
  passwordChangeError = signal('');
  /** Shown in Security card after a successful password update (toasts are also used). */
  passwordChangeSuccess = signal(false);

  /** Driver earnings wallet (mock payouts). */
  readonly walletLoading = signal(false);
  readonly walletError = signal('');
  readonly walletAvailable = signal(0);
  readonly walletWithdrawn = signal(0);
  readonly walletCurrency = signal('EUR');
  readonly withdrawAmount = signal('');
  readonly withdrawLoading = signal(false);
  readonly withdrawSuccess = signal(false);

  private readonly walletService = inject(WalletService);

  private readonly ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
  private readonly MAX_SIZE = 5 * 1024 * 1024; // 5MB

  constructor() {
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.shellOutletTick.update((k) => k + 1));
    this.actions$
      .pipe(ofType(DriverActions.updateDriverDistrictsSuccess), takeUntilDestroyed())
      .subscribe(() => {
        this.resetDistrictDraftFromUser();
        this.user.set(this.authService.user());
        this.cdr.markForCheck();
      });
  }

  ngOnInit(): void {
    const u = this.authService.user();
    this.user.set(u);
    if (u) {
      this.firstName = u.firstName ?? u.name?.split(' ')[0] ?? '';
      this.lastName = u.lastName ?? u.name?.split(' ').slice(1).join(' ') ?? '';
      const phone = u.phone ?? '';
      this.phoneDigits = phone.startsWith(PHONE_PREFIX) ? phone.slice(PHONE_PREFIX.length) : phone.replace(/\D/g, '').slice(-8);
      if (u.role === 'driver' && u.licenseUrl) {
        this.licenseUrl.set(u.licenseUrl);
      }
    }
    this.route.queryParams
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        const message = params['message'];
        if (message) {
          this.toast.show(message, 'info');
          this.router.navigate([], { queryParams: {}, queryParamsHandling: '' });
        }
      });
    if (u?.role === 'driver' && u?.isVerified !== true) {
      this.autoCheckInterval = setInterval(() => this.checkStatusQuiet(), AUTO_CHECK_VERIFICATION_MS);
    }
    if (u?.role === 'driver') {
      this.resetDistrictDraftFromUser();
      if (u.isVerified === true) {
        this.loadDriverWallet();
      }
    }
  }

  loadDriverWallet(): void {
    this.walletLoading.set(true);
    this.walletError.set('');
    this.walletService.getDriverWallet().subscribe({
      next: (res) => {
        this.walletAvailable.set(res.wallet.availableBalance);
        this.walletWithdrawn.set(res.wallet.totalWithdrawn);
        this.walletCurrency.set(res.wallet.currency);
        this.walletLoading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.walletError.set(err?.error?.message ?? 'Could not load wallet');
        this.walletLoading.set(false);
      },
    });
  }

  submitWithdrawal(): void {
    const amount = Number(this.withdrawAmount().replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) {
      this.walletError.set('Enter a valid withdrawal amount');
      return;
    }
    this.withdrawLoading.set(true);
    this.walletError.set('');
    this.withdrawSuccess.set(false);
    this.walletService.withdrawDriverFunds(amount).subscribe({
      next: (res) => {
        this.walletAvailable.set(res.wallet.availableBalance);
        this.walletWithdrawn.set(res.wallet.totalWithdrawn);
        this.withdrawAmount.set('');
        this.withdrawSuccess.set(true);
        this.withdrawLoading.set(false);
        this.toast.show('Withdrawal completed (mock)', 'success');
      },
      error: (err: HttpErrorResponse) => {
        this.walletError.set(err?.error?.message ?? 'Withdrawal failed');
        this.withdrawLoading.set(false);
      },
    });
  }

  private resetDistrictDraftFromUser(): void {
    const list = [...(this.authStore.user()?.districts ?? [])].sort();
    this.driverDistrictsDraft.set(list);
    this.initialDistrictsFingerprint.set(JSON.stringify(list));
  }

  isWorkingDistrictChecked(name: string): boolean {
    return this.driverDistrictsDraft().includes(name);
  }

  onWorkingDistrictToggle(name: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const next = new Set(this.driverDistrictsDraft());
    if (checked) {
      next.add(name);
    } else {
      next.delete(name);
    }
    this.driverDistrictsDraft.set([...next].sort());
  }

  saveWorkingDistricts(): void {
    const districts = this.driverDistrictsDraft();
    if (districts.length === 0 || !this.districtsDirty()) return;
    this.store.dispatch(DriverActions.updateDriverDistricts({ districts }));
  }

  ngOnDestroy(): void {
    if (this.autoCheckInterval) {
      clearInterval(this.autoCheckInterval);
      this.autoCheckInterval = null;
    }
  }

  private onDriverVerified(): void {
    if (this.autoCheckInterval) {
      clearInterval(this.autoCheckInterval);
      this.autoCheckInterval = null;
    }
    this.loadDriverWallet();
  }

  /** Called by the 30s interval to refresh verification status without showing loading state. */
  private checkStatusQuiet(): void {
    const u = this.authService.user();
    if (u?.isVerified === true) {
      if (this.autoCheckInterval) {
        clearInterval(this.autoCheckInterval);
        this.autoCheckInterval = null;
      }
      return;
    }
    this.authService.checkMyStatus({ skipGlobalErrorToast: true }).subscribe({
      next: (res) => {
        const updatedUser = Object.assign({}, res.user);
        this.user.set(updatedUser);
        if (updatedUser.isVerified) {
          this.verificationMessage.set('verified');
          this.onDriverVerified();
          this.cdr.detectChanges();
        } else if (updatedUser.verificationStatus === 'rejected') {
          this.verificationMessage.set('rejected');
          this.cdr.detectChanges();
        }
      },
    });
  }

  onCheckVerificationStatus(): void {
    this.verificationMessage.set(null);
    this.checkStatusLoading.set(true);
    this.authService.checkMyStatus().subscribe({
      next: (res) => {
        const updatedUser = Object.assign({}, res.user);
        this.user.set(updatedUser);
        if (updatedUser.isVerified) {
          this.verificationMessage.set('verified');
          this.onDriverVerified();
        } else if (updatedUser.verificationStatus === 'rejected') {
          this.verificationMessage.set('rejected');
        }
        if (updatedUser.licenseUrl) {
          this.licenseUrl.set(updatedUser.licenseUrl);
        }
        this.cdr.detectChanges();
      },
      error: () => this.checkStatusLoading.set(false),
      complete: () => this.checkStatusLoading.set(false),
    });
  }

  get fullPhoneNumber(): string {
    const digits = this.phoneDigits.replace(/\D/g, '').slice(0, 8);
    return digits.length === 8 ? PHONE_PREFIX + digits : '';
  }

  /** Initials for the avatar disc (read-only; no image upload API in profile). */
  get userInitials(): string {
    const f = (
      this.firstName ||
      this.user()?.firstName ||
      this.user()?.name?.split(' ')[0] ||
      ''
    ).trim();
    const l = (
      this.lastName || this.user()?.name?.split(' ').slice(1).join(' ') || ''
    ).trim();
    const a = f.charAt(0);
    const b = l.charAt(0);
    if (!a && !b) {
      return 'U';
    }
    return (a + b).toUpperCase();
  }

  get newPasswordErrors(): string[] {
    return getPasswordPolicyErrors(this.newPassword);
  }

  get newPasswordMeetsPolicy(): boolean {
    return validatePassword(this.newPassword);
  }

  /** True when confirmation was typed and does not match new password (blocks submit). */
  get passwordsMismatch(): boolean {
    if (!this.confirmNewPassword.length) return false;
    return this.newPassword !== this.confirmNewPassword;
  }

  onPasswordSubmit(): void {
    this.passwordChangeError.set('');
    this.passwordChangeSuccess.set(false);
    const role = this.user()?.role;
    if (role !== 'customer' && role !== 'driver') return;

    if (!this.currentPassword.trim()) {
      this.passwordChangeError.set('Please enter your current password.');
      return;
    }
    if (!this.confirmNewPassword.trim()) {
      this.passwordChangeError.set('Please confirm your new password.');
      return;
    }
    if (this.newPassword !== this.confirmNewPassword) {
      this.passwordChangeError.set('Passwords do not match.');
      return;
    }
    if (!this.newPasswordMeetsPolicy) {
      this.passwordChangeError.set('New password does not meet the requirements below.');
      return;
    }

    this.passwordChangeLoading.set(true);
    this.authService
      .changePassword(this.currentPassword, this.newPassword, { skipGlobalErrorToast: true })
      .subscribe({
        next: (res) => {
          this.currentPassword = '';
          this.newPassword = '';
          this.confirmNewPassword = '';
          this.user.set(this.authService.user());
          this.passwordChangeSuccess.set(true);
          this.toast.show(res.message || 'Password updated successfully.', 'success');
          this.cdr.markForCheck();
        },
        error: (err: HttpErrorResponse) => {
          const msg =
            typeof err.error?.message === 'string'
              ? err.error.message
              : 'Could not update password. Please try again.';
          this.passwordChangeError.set(msg);
        },
        complete: () => this.passwordChangeLoading.set(false),
      });
  }

  onSubmit(): void {
    this.error.set('');
    this.success.set(false);
    if (!this.firstName.trim()) {
      this.error.set('First name is required.');
      return;
    }
    if (!this.lastName.trim()) {
      this.error.set('Last name is required.');
      return;
    }
    if (this.phoneDigits.replace(/\D/g, '').length !== 8) {
      this.error.set('Phone number must be exactly 8 digits.');
      return;
    }

    this.loading.set(true);
    this.authService
      .updateProfile({
        firstName: this.firstName.trim(),
        lastName: this.lastName.trim(),
        phoneNumber: this.fullPhoneNumber,
      })
      .subscribe({
        next: (res) => {
          this.user.set(this.authService.user());
          this.success.set(true);
          this.toast.show('Profile updated successfully!', 'success');
        },
        error: () => {
          /* HTTP error message shown by httpErrorInterceptor */
        },
        complete: () => this.loading.set(false),
      });
  }

  onLicenseFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    this.uploadLicenseError.set('');
    this.uploadLicenseSuccess.set(false);
    if (!file) return;

    if (!this.ALLOWED_TYPES.includes(file.type)) {
      this.uploadLicenseError.set('Invalid file type. Only PDF, JPG and PNG are allowed.');
      return;
    }
    if (file.size > this.MAX_SIZE) {
      this.uploadLicenseError.set('File is too large. Maximum size is 5MB.');
      return;
    }

    this.uploadLicenseLoading.set(true);
    this.uploadLicenseError.set('');
    this.authService.uploadLicense(file, { skipGlobalErrorToast: true }).subscribe({
      next: (res) => {
        const updatedUser = { ...res.user, verificationStatus: 'pending' as const };
        this.user.set(updatedUser);
        this.licenseUrl.set(res.user.licenseUrl ?? '');
        this.uploadLicenseSuccess.set(true);
        this.verificationMessage.set(null);
        this.cdr.detectChanges();
      },
      error: (err: unknown) => {
        const msg = (err as { error?: { message?: string } })?.error?.message ?? 'Upload failed.';
        this.uploadLicenseError.set(msg);
      },
      complete: () => this.uploadLicenseLoading.set(false),
    });
  }
}
