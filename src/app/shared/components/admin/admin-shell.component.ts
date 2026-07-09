import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs/operators';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { AdminMobileNavComponent } from './admin-mobile-nav.component';
import { adminShellTabTransition } from './admin-animations';
import { leafShellOutletData } from '../../routing/shell-route.helper';
import {
  adminSectionFullBleed,
  adminSectionTitle,
  parseAdminNavFromUrl,
} from '../../utils/admin-section-nav';

@Component({
  selector: 'app-admin-shell',
  standalone: true,
  imports: [SidebarComponent, RouterOutlet, AdminMobileNavComponent],
  templateUrl: './admin-shell.component.html',
  styleUrl: './admin-shell.component.css',
  animations: [adminShellTabTransition],
})
export class AdminShellComponent {
  private readonly router = inject(Router);
  readonly tabAnim = signal(0);
  readonly shellOutletTick = signal(0);

  constructor() {
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        this.shellOutletTick.update((k) => k + 1);
        const path = this.router.url.split('?')[0] ?? '';
        if (path.startsWith('/admin')) {
          this.tabAnim.update((k) => k + 1);
        }
      });
  }

  readonly shellOutletMeta = computed(() => {
    void this.shellOutletTick();
    return leafShellOutletData(this.router);
  });

  readonly pageTitle = computed(() => {
    void this.shellOutletTick();
    const path = this.router.url.split('?')[0] ?? '';
    if (path.includes('/settings/')) {
      return this.shellOutletMeta().pageTitle || 'Settings';
    }
    const nav = parseAdminNavFromUrl(this.router.url);
    return adminSectionTitle(nav.section, nav.fleetTab);
  });

  readonly shellFullBleed = computed(() => {
    void this.shellOutletTick();
    const path = this.router.url.split('?')[0] ?? '';
    if (path.includes('/settings/')) return false;
    const nav = parseAdminNavFromUrl(this.router.url);
    return adminSectionFullBleed(nav.section);
  });
}
