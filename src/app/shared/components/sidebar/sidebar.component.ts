import {
  Component,
  DestroyRef,
  inject,
  OnInit,
  OnDestroy,
  ChangeDetectorRef,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter } from 'rxjs/operators';
import { AuthService, AuthUser } from '../../../core/services/auth.service';
import { ADMIN_FLEET_TAB } from '../../../core/constants/statuses';
import { LucideAngularModule } from 'lucide-angular';
import { AppLogoComponent } from '../app-logo/app-logo.component';
import {
  adminSectionQuery,
  parseAdminNavFromUrl,
  type AdminSection,
} from '../../utils/admin-section-nav';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, LucideAngularModule, AppLogoComponent],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.css',
  host: { 'data-design-scope': 'global-shared' },
})
export class SidebarComponent implements OnInit, OnDestroy {
  auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private cdr = inject(ChangeDetectorRef);

  /** Local copy updated by currentUser$ so Admin/role-dependent links update when user changes. */
  user: AuthUser | null = null;
  private authSub?: { unsubscribe: () => void };

  /** Mobile viewport: burger opens slide-out drawer; closes on navigate. */
  readonly mobileNavOpen = signal(false);

  /** Shared nav link styles (desktop + mobile drawer). */
  readonly navLinkClass =
    'sidebar-nav-link flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-foreground transition hover:bg-secondary/30 hover:text-foreground md:gap-2.5 md:px-2.5 md:py-2 md:text-[13px] md:leading-tight lg:text-sm';

  readonly navActiveClass =
    'bg-primary/20 text-primary shadow-[0_0_12px_rgba(34,197,94,0.12)] md:text-primary';

  readonly footerBtnClass =
    'sidebar-footer-btn flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-sm text-foreground transition hover:bg-secondary/20 hover:text-foreground md:text-[13px] lg:text-sm';

  readonly fleetTab = ADMIN_FLEET_TAB;

  /** Admin on customer/driver routes sees preview mode + back link only. */
  get adminOnForeignRoute(): boolean {
    const u = this.user;
    if (u?.role !== 'admin') return false;
    const url = this.router.url.split('?')[0] ?? '';
    return !url.startsWith('/admin');
  }

  /** Admin on `/admin/*` routes sees dedicated admin navigation. */
  get adminOnAdminRoute(): boolean {
    const u = this.user;
    if (u?.role !== 'admin') return false;
    const url = this.router.url.split('?')[0] ?? '';
    return url.startsWith('/admin');
  }

  adminNavQuery(section: AdminSection, fleetTab?: (typeof ADMIN_FLEET_TAB)[keyof typeof ADMIN_FLEET_TAB]) {
    return adminSectionQuery(section, fleetTab);
  }

  isAdminNavActive(section: AdminSection, fleetTab?: (typeof ADMIN_FLEET_TAB)[keyof typeof ADMIN_FLEET_TAB]): boolean {
    const nav = parseAdminNavFromUrl(this.router.url);
    if (nav.section !== section) return false;
    if (fleetTab) return nav.fleetTab === fleetTab;
    return true;
  }

  /** React NavLink home target per role. */
  get homeLink(): string {
    const role = this.user?.role;
    if (role === 'admin') return '/admin';
    if (role === 'driver') return '/driver/dashboard';
    return '/customer/dashboard';
  }

  ngOnInit(): void {
    this.authSub = this.auth.currentUser$.subscribe((u) => {
      this.user = u;
      this.cdr.detectChanges();
    });
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        this.mobileNavOpen.set(false);
        this.cdr.markForCheck();
      });
  }

  ngOnDestroy(): void {
    this.authSub?.unsubscribe();
  }

  toggleMobileNav(): void {
    this.mobileNavOpen.update((v) => !v);
  }

  closeMobileNav(): void {
    this.mobileNavOpen.set(false);
  }

  get isCustomer() {
    return this.user?.role === 'customer';
  }

  get isDriver() {
    return this.user?.role === 'driver';
  }

  get isAdmin() {
    return this.user?.role === 'admin';
  }
}
