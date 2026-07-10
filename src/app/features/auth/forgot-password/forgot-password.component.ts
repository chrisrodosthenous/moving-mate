import { Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { UiButtonComponent } from '@/components/ui/button';
import { UiInputDirective } from '@/components/ui/input';
import { AppLogoComponent } from '../../../shared/components/app-logo/app-logo.component';

const SUCCESS_COPY = 'A password reset link has been sent to your email.';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [FormsModule, RouterLink, UiButtonComponent, UiInputDirective, AppLogoComponent],
  templateUrl: './forgot-password.component.html',
})
export class ForgotPasswordComponent {
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  readonly genericSuccessMessage = SUCCESS_COPY;

  email = '';
  readonly loading = signal(false);
  readonly error = signal('');
  readonly submitted = signal(false);

  onSubmit(): void {
    this.error.set('');
    const trimmed = this.email.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      this.error.set('Please enter a valid email address.');
      return;
    }

    this.loading.set(true);
    this.auth.forgotPassword(trimmed).subscribe({
      next: () => {
        this.submitted.set(true);
        this.loading.set(false);
        this.toast.success(SUCCESS_COPY, 4500);
      },
      error: (err: HttpErrorResponse) => {
        const raw = err.error as { message?: string } | undefined;
        this.error.set(
          typeof raw?.message === 'string' ? raw.message : 'Something went wrong. Please try again.',
        );
        this.loading.set(false);
        this.toast.error(this.error());
      },
    });
  }
}
