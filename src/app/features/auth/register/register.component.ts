import { Component, inject, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { UiButtonComponent } from '@/components/ui/button';
import { UiInputDirective } from '@/components/ui/input';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { AuthStore } from '../../../store/auth.store';
import { getPasswordPolicyErrors, validatePassword } from '../../../shared/utils/password-policy';
import { AppLogoComponent } from '../../../shared/components/app-logo/app-logo.component';
import {
  DRIVER_VEHICLE_OPTIONS,
  type DriverVehicleType,
} from '../../../core/models/driver.model';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PREFIX = '+357';

/** Must match server CYPRUS_DISTRICTS — drivers must pick at least one. */
const DRIVER_DISTRICT_OPTIONS = ['Nicosia', 'Limassol', 'Larnaca', 'Paphos', 'Famagusta'] as const;

const VEHICLE_PHOTO_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const VEHICLE_PHOTO_MAX_BYTES = 5 * 1024 * 1024;

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    RouterLink,
    UiButtonComponent,
    UiInputDirective,
    AppLogoComponent,
  ],
  templateUrl: './register.component.html',
  styleUrl: './register.component.css',
})
export class RegisterComponent implements OnDestroy {
  firstName = '';
  lastName = '';
  dateOfBirth = '';
  email = '';
  phoneDigits = '';
  password = '';
  role: 'customer' | 'driver' = 'customer';
  /** Driver: one or more districts (checkboxes). */
  selectedDistricts: string[] = [];
  readonly driverDistrictOptions = [...DRIVER_DISTRICT_OPTIONS];
  readonly driverVehicleOptions = DRIVER_VEHICLE_OPTIONS;
  loading = false;
  error = '';

  /** Preview URL for selected vehicle photo (revoked on destroy / re-select). */
  vehiclePhotoPreviewUrl: string | null = null;
  vehiclePhotoError = '';

  private readonly fb = inject(FormBuilder);
  /** Reactive controls for driver vehicle categorization + verification photo. */
  readonly driverVehicleForm = this.fb.nonNullable.group({
    vehicleType: ['' as DriverVehicleType | '', Validators.required],
    vehiclePhoto: [null as File | null, Validators.required],
  });

  private auth = inject(AuthService);
  private authStore = inject(AuthStore);
  private router = inject(Router);
  private toast = inject(ToastService);
  private cdr = inject(ChangeDetectorRef);

  ngOnDestroy(): void {
    this.revokeVehiclePhotoPreview();
  }

  get emailTouched(): boolean {
    return this.email.length > 0;
  }

  get emailValid(): boolean {
    return !!this.email.trim() && EMAIL_REGEX.test(this.email.trim());
  }

  get emailError(): string {
    if (!this.email.trim()) return 'Email is required';
    if (!EMAIL_REGEX.test(this.email.trim())) return 'Please enter a valid email address';
    return '';
  }

  get phoneDigitsOnly(): string {
    return this.phoneDigits.replace(/\D/g, '').slice(0, 8);
  }

  get phoneValid(): boolean {
    return this.phoneDigitsOnly.length === 8;
  }

  get phoneError(): string {
    if (this.phoneDigitsOnly.length === 0) return 'Phone number is required (8 digits)';
    if (this.phoneDigitsOnly.length < 8) return `Enter ${8 - this.phoneDigitsOnly.length} more digit(s)`;
    return '';
  }

  get passwordErrors(): string[] {
    return getPasswordPolicyErrors(this.password);
  }

  get passwordValid(): boolean {
    return validatePassword(this.password);
  }

  get fullPhoneNumber(): string {
    return this.phoneDigitsOnly.length === 8 ? PHONE_PREFIX + this.phoneDigitsOnly : '';
  }

  /** Max date for date-of-birth input: 18 years ago from today (YYYY-MM-DD). */
  get maxDateOfBirth(): string {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 18);
    return d.toISOString().slice(0, 10);
  }

  get dateOfBirthValid(): boolean {
    if (!this.dateOfBirth) return false;
    const birth = new Date(this.dateOfBirth);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age--;
    return age >= 18;
  }

  get dateOfBirthError(): string {
    if (!this.dateOfBirth) return '';
    if (this.dateOfBirthValid) return '';
    return 'You must be at least 18 years old.';
  }

  isDistrictSelected(d: string): boolean {
    return this.selectedDistricts.includes(d);
  }

  toggleDistrict(d: string, checked: boolean): void {
    if (checked) {
      if (!this.selectedDistricts.includes(d)) {
        this.selectedDistricts = [...this.selectedDistricts, d];
      }
    } else {
      this.selectedDistricts = this.selectedDistricts.filter((x) => x !== d);
    }
  }

  get driverDistrictsValid(): boolean {
    if (this.role !== 'driver') return true;
    if (this.selectedDistricts.length === 0) return false;
    return this.selectedDistricts.every((x) =>
      DRIVER_DISTRICT_OPTIONS.includes(x as (typeof DRIVER_DISTRICT_OPTIONS)[number])
    );
  }

  get driverDistrictsError(): string {
    if (this.role !== 'driver') return '';
    if (this.selectedDistricts.length === 0) return 'Select at least one district.';
    if (!this.driverDistrictsValid) return 'Invalid district selection.';
    return '';
  }

  get driverVehicleValid(): boolean {
    if (this.role !== 'driver') return true;
    return this.driverVehicleForm.valid && !this.vehiclePhotoError;
  }

  get driverVehicleTypeError(): string {
    if (this.role !== 'driver') return '';
    const ctrl = this.driverVehicleForm.controls.vehicleType;
    if (!ctrl.touched && !ctrl.dirty) return '';
    if (ctrl.hasError('required')) return 'Select your vehicle type.';
    return '';
  }

  get formValid(): boolean {
    return (
      !!this.firstName.trim() &&
      !!this.lastName.trim() &&
      !!this.dateOfBirth &&
      this.dateOfBirthValid &&
      this.emailValid &&
      this.phoneValid &&
      this.passwordValid &&
      !!this.role &&
      this.driverDistrictsValid &&
      this.driverVehicleValid
    );
  }

  onPhoneChange(value: string): void {
    this.phoneDigits = value.replace(/\D/g, '').slice(0, 8);
  }

  onVehiclePhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    this.vehiclePhotoError = '';
    this.revokeVehiclePhotoPreview();

    if (!file) {
      this.driverVehicleForm.patchValue({ vehiclePhoto: null });
      this.driverVehicleForm.controls.vehiclePhoto.markAsTouched();
      return;
    }

    if (!VEHICLE_PHOTO_TYPES.includes(file.type)) {
      this.vehiclePhotoError = 'Only JPG or PNG images are allowed.';
      this.driverVehicleForm.patchValue({ vehiclePhoto: null });
      input.value = '';
      return;
    }
    if (file.size > VEHICLE_PHOTO_MAX_BYTES) {
      this.vehiclePhotoError = 'File is too large (maximum 5MB).';
      this.driverVehicleForm.patchValue({ vehiclePhoto: null });
      input.value = '';
      return;
    }

    this.vehiclePhotoPreviewUrl = URL.createObjectURL(file);
    this.driverVehicleForm.patchValue({ vehiclePhoto: file });
    this.driverVehicleForm.controls.vehiclePhoto.markAsTouched();
  }

  private revokeVehiclePhotoPreview(): void {
    if (this.vehiclePhotoPreviewUrl) {
      URL.revokeObjectURL(this.vehiclePhotoPreviewUrl);
      this.vehiclePhotoPreviewUrl = null;
    }
  }

  onSubmit(): void {
    setTimeout(() => {
      this.error = '';
      if (this.role === 'driver') {
        this.driverVehicleForm.markAllAsTouched();
      }
      if (!this.formValid) return;

      this.loading = true;
      this.cdr.detectChanges();

      if (!this.dateOfBirth || !this.fullPhoneNumber) {
        this.error = 'Phone number and date of birth are required.';
        this.loading = false;
        this.cdr.detectChanges();
        return;
      }
      if (this.role === 'driver' && this.selectedDistricts.length === 0) {
        this.error = 'Please select at least one district.';
        this.loading = false;
        this.cdr.detectChanges();
        return;
      }

      if (this.role === 'driver') {
        const { vehicleType, vehiclePhoto } = this.driverVehicleForm.getRawValue();
        if (!vehiclePhoto || !vehicleType) {
          this.error = 'Vehicle type and photo are required for driver registration.';
          this.loading = false;
          this.cdr.detectChanges();
          return;
        }

        const formData = new FormData();
        formData.append('firstName', this.firstName.trim());
        formData.append('lastName', this.lastName.trim());
        formData.append('email', this.email.trim());
        formData.append('password', this.password);
        formData.append('phoneNumber', this.fullPhoneNumber);
        formData.append('dateOfBirth', this.dateOfBirth);
        formData.append('role', 'driver');
        formData.append('vehicleType', vehicleType);
        formData.append('vehiclePhoto', vehiclePhoto, vehiclePhoto.name);
        formData.append('districts', JSON.stringify(this.selectedDistricts));

        this.auth.registerDriver(formData).subscribe({
          next: () => this.onRegisterComplete(),
          error: (err) => this.onRegisterFailed(err),
          complete: () => {},
        });
        return;
      }

      const payload = {
        firstName: this.firstName.trim(),
        lastName: this.lastName.trim(),
        email: this.email.trim(),
        password: this.password,
        phoneNumber: this.fullPhoneNumber,
        dateOfBirth: this.dateOfBirth,
        role: 'customer' as const,
      };

      this.auth.register(payload).subscribe({
        next: () => this.onRegisterComplete(),
        error: (err) => this.onRegisterFailed(err),
        complete: () => {},
      });
    }, 0);
  }

  private onRegisterComplete(): void {
    setTimeout(() => {
      this.loading = false;
      this.cdr.detectChanges();
      void this.router.navigateByUrl(this.authStore.dashboardRoute());
    }, 0);
  }

  private onRegisterFailed(err: { error?: { message?: string; error?: string } }): void {
    this.loading = false;
    const msg = err?.error?.message || err?.error?.error || 'Registration failed.';
    this.error = msg;
    this.toast.show(msg, 'error');
    this.cdr.detectChanges();
  }
}
