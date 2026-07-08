import { Component, DestroyRef, inject, OnDestroy, effect } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs/operators';
import { ToastComponent } from './shared/components/toast/toast.component';
import { DialogComponent } from './shared/components/dialog/dialog.component';
import { ThemeEditorComponent } from './shared/components/theme-editor/theme-editor.component';
import { FcmService } from './core/services/fcm.service';
import { NotificationStore } from './store/notification.store';
import { AuthStore } from './store/auth.store';
import { ToastService } from './core/services/toast.service';
import { SidebarLayoutService } from './core/services/sidebar-layout.service';
import { environment } from '../environments/environment';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, ToastComponent, DialogComponent, ThemeEditorComponent],
  template: `
    <router-outlet />
    <app-toast />
    <app-dialog />
    @if (!isProduction && !isAutomatedBrowser) {
      <app-theme-editor />
    }
  `,
  styles: [
    `
      :host {
        display: block;
        min-height: 100dvh;
        overflow-x: hidden;
      }
    `,
  ],
})
export class AppComponent implements OnDestroy {
  private readonly fcm = inject(FcmService);
  private readonly notificationStore = inject(NotificationStore);
  private readonly authStore = inject(AuthStore);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly _sidebarLayout = inject(SidebarLayoutService);

  /** Only show theme editor in development mode (hidden under Playwright / WebDriver). */
  readonly isProduction = environment.production;
  readonly isAutomatedBrowser =
    typeof navigator !== 'undefined' && Boolean((navigator as Navigator & { webdriver?: boolean }).webdriver);

  constructor() {
    // React FcmRegistration: re-attempt token registration on every navigation while logged in.
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        if (!this.authStore.token()) return;
        void this.fcm.registerToken().catch(() => {});
        void this.fcm.syncStoredTokenToBackend();

        const path = this.router.url.split('?')[0] ?? '';
        if (path === '/driver/available' || path.startsWith('/driver/available')) {
          void this.fcm.ensurePushRegistrationOnDashboard();
        }
      });

    // FCM when JWT exists only (avoid re-running on profile/user object updates).
    effect(() => {
      const token = this.authStore.token();
      if (token) {
        void this.fcm.registerToken().catch(() => {});
        void this.fcm.subscribeForeground().catch(() => {});
      } else {
        this.fcm.unsubscribeForeground();
      }
    });

    // Foreground push → in-app toast (SW skips OS notification when a tab is focused).
    effect(() => {
      const push = this.notificationStore.latestPush();
      if (push) {
        this.toast.show(`${push.title}: ${push.body}`, 'info');
      }
    });
  }

  ngOnDestroy(): void {
    this.fcm.unsubscribeForeground();
  }
}
