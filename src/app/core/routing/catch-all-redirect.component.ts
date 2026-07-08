import { Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthStore } from '../../store/auth.store';

/**
 * Unknown paths: send logged-in users to their role dashboard (React `CatchAll` parity),
 * otherwise to login.
 */
@Component({
  selector: 'app-catch-all-redirect',
  standalone: true,
  template: '',
})
export class CatchAllRedirectComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthStore);

  ngOnInit(): void {
    if (!this.auth.isLoggedIn()) {
      void this.router.navigate(['/login'], { replaceUrl: true });
      return;
    }
    void this.router.navigateByUrl(this.auth.dashboardRoute(), { replaceUrl: true });
  }
}
