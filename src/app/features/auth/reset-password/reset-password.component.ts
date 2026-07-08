import { Component, inject, OnInit, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { UiButtonComponent } from '@/components/ui/button';
import { UiInputDirective } from '@/components/ui/input';
import { AppLogoComponent } from '../../../shared/components/app-logo/app-logo.component';

function passwordClientHint(password: string): string | null {
  if (!password || password.length < 8) {
    return 'Password must be at least 8 characters';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must include at least one uppercase letter';
  }
  if (!/\d/.test(password)) {
    return 'Password must include at least one number';
  }
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
    return 'Password must include at least one special character';
  }
  return null;
}

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [FormsModule, RouterLink, UiButtonComponent, UiInputDirective, AppLogoComponent],
  templateUrl: './reset-password.component.html',
})
export class ResetPasswordComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  token = '';
  newPassword = '';
  confirmPassword = '';

  readonly loading = signal(false);
  readonly error = signal('');
  readonly done = signal(false);

  ngOnInit(): void {
    const raw = this.route.snapshot.queryParamMap.get('token');
    if (typeof raw === 'string' && raw.length > 0) {
      this.token = raw;
    } else {
      this.error.set(
        'Invalid or missing reset link. Open the link from your password reset email.',
      );
    }
  }

  onSubmit(): void {
    this.error.set('');
    const t = this.token.trim();
    if (!t) {
      this.error.set('Missing reset token. Use the link from your email.');
      return;
    }
    const p1 = this.newPassword;
    const p2 = this.confirmPassword;
    if (p1 !== p2) {
      this.error.set('Passwords do not match.');
      return;
    }
    const hint = passwordClientHint(p1);
    if (hint) {
      this.error.set(hint);
      return;
    }

    this.loading.set(true);
    this.auth.resetPassword(t, p1).subscribe({
      next: (res) => {
        this.loading.set(false);
        this.done.set(true);
        this.toast.success(res.message);
        setTimeout(() => {
          void this.router.navigateByUrl('/login');
        }, 1200);
      },
      error: (err: HttpErrorResponse) => {
        const rawErr = err.error as { message?: string } | undefined;
        const msg =
          typeof rawErr?.message === 'string'
            ? rawErr.message
            : 'Could not reset password. Please try again.';
        this.error.set(msg);
        this.loading.set(false);
        this.toast.error(msg);
      },
    });
  }
}
