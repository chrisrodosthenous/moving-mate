import { Component, inject, OnInit, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { AdminService } from '../../../core/services/admin.service';
import { AuthService } from '../../../core/services/auth.service';
import { AuthStore } from '../../../store/auth.store';

@Component({
  selector: 'app-impersonate-handoff',
  standalone: true,
  template: `
    <section class="mx-auto flex min-h-[50vh] w-full max-w-md items-center px-4">
      <p class="text-sm text-foreground" role="status">{{ message() }}</p>
    </section>
  `,
})
export class ImpersonateHandoffComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly admin = inject(AdminService);
  private readonly auth = inject(AuthService);
  private readonly authStore = inject(AuthStore);

  readonly message = signal('Signing you in…');

  ngOnInit(): void {
    const code = this.route.snapshot.queryParamMap.get('handoff') ?? '';
    if (!code) {
      this.message.set('This sign-in link has expired. Go back to the admin tab and click Impersonate again.');
      return;
    }
    this.admin.redeemImpersonation(code).subscribe({
      next: (res) => {
        this.auth.finishImpersonation(res);
        void this.router.navigateByUrl(this.authStore.dashboardRoute());
      },
      error: (err: HttpErrorResponse) => {
        const message = err.error?.message;
        this.message.set(
          typeof message === 'string'
            ? message
            : 'This sign-in link has expired. Go back to the admin tab and click Impersonate again.',
        );
      },
    });
  }
}
