import { Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { AuthStore } from '../../../store/auth.store';
import { UiButtonComponent } from '@/components/ui/button';
import { UiInputDirective } from '@/components/ui/input';
import { AppLogoComponent } from '../../../shared/components/app-logo/app-logo.component';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, RouterLink, UiButtonComponent, UiInputDirective, AppLogoComponent],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly authStore = inject(AuthStore);
  private readonly router = inject(Router);

  emailOrPhone = '';
  password = '';
  /** Signals ensure the template updates as soon as HTTP success/error completes (no focus workaround). */
  readonly loading = signal(false);
  readonly error = signal('');

  onSubmit(): void {
    this.error.set('');
    if (!this.emailOrPhone.trim() || !this.password) {
      this.error.set('Please enter email or phone and password.');
      return;
    }
    this.loading.set(true);
    this.auth.login(this.emailOrPhone.trim(), this.password).subscribe({
      next: () => {
        void this.router.navigateByUrl(this.authStore.dashboardRoute());
      },
      error: (err: HttpErrorResponse) => {
        const raw = err.error as { message?: string; error?: string } | string | undefined;
        const msg =
          (typeof raw === 'string' ? raw : raw?.message || raw?.error) ||
          'Login failed. Please try again.';
        this.error.set(msg);
        this.loading.set(false);
      },
      complete: () => {
        this.loading.set(false);
      },
    });
  }
}
