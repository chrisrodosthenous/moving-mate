import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { LogoComponent } from './logo.component';
import { LOGIN_PATH, NAV_LINKS, REGISTER_PATH } from './brand';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'web-site-header',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, LucideAngularModule, LogoComponent],
  template: `
    <header
      class="sticky top-0 z-50 w-full border-b border-border/40 bg-popover/85 backdrop-blur-md"
    >
      <div class="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <a routerLink="/" class="shrink-0" aria-label="Moving Mate home" (click)="close()">
          <web-logo size="md" />
        </a>

        <nav class="hidden items-center gap-1 md:flex" aria-label="Primary">
          @for (link of navLinks; track link.path) {
            <a
              [routerLink]="link.path"
              routerLinkActive="text-primary bg-primary/10"
              class="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition hover:text-foreground hover:bg-secondary/30"
            >
              {{ link.label }}
            </a>
          }
        </nav>

        <div class="hidden items-center gap-2 md:flex">
          @if (isLoggedIn()) {
            <a
              [routerLink]="appHome()"
              class="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-btn-primary transition hover:bg-brand-green-dark"
            >
              Go to app
              <lucide-icon name="arrow-right" [size]="16" aria-hidden="true" />
            </a>
          } @else {
            <a
              [routerLink]="loginPath"
              class="rounded-lg px-3 py-2 text-sm font-semibold text-foreground transition hover:text-primary"
            >
              Log in
            </a>
            <a
              [routerLink]="registerPath"
              class="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-btn-primary transition hover:bg-brand-green-dark"
            >
              Get started
              <lucide-icon name="arrow-right" [size]="16" aria-hidden="true" />
            </a>
          }
        </div>

        <button
          type="button"
          class="inline-flex h-11 w-11 items-center justify-center rounded-lg text-foreground transition hover:bg-secondary/30 md:hidden"
          [attr.aria-expanded]="open()"
          aria-controls="mobile-nav"
          [attr.aria-label]="open() ? 'Close menu' : 'Open menu'"
          (click)="toggle()"
        >
          <lucide-icon [name]="open() ? 'x' : 'menu'" [size]="24" aria-hidden="true" />
        </button>
      </div>

      @if (open()) {
        <button
          type="button"
          class="fixed inset-0 top-16 z-40 bg-black/50 backdrop-blur-[1px] md:hidden"
          aria-label="Close menu"
          tabindex="-1"
          (click)="close()"
        ></button>
        <nav
          id="mobile-nav"
          class="absolute inset-x-0 top-16 z-50 border-b border-border/40 bg-popover/95 backdrop-blur-md md:hidden"
          aria-label="Mobile"
        >
          <div class="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-4 sm:px-6">
            @for (link of navLinks; track link.path) {
              <a
                [routerLink]="link.path"
                routerLinkActive="text-primary bg-primary/10"
                class="rounded-lg px-3 py-3 text-base font-medium text-foreground transition hover:bg-secondary/30"
                (click)="close()"
              >
                {{ link.label }}
              </a>
            }
            <div class="mt-3 border-t border-border/40 pt-4">
              @if (isLoggedIn()) {
                <a
                  [routerLink]="appHome()"
                  class="block rounded-lg bg-primary px-4 py-3 text-center text-sm font-semibold text-primary-foreground shadow-btn-primary transition hover:bg-brand-green-dark"
                  (click)="close()"
                >
                  Go to app
                </a>
              } @else {
                <div class="grid grid-cols-2 gap-2">
                  <a
                    [routerLink]="loginPath"
                    class="rounded-lg border border-border/60 px-4 py-3 text-center text-sm font-semibold text-foreground transition hover:bg-secondary/30"
                    (click)="close()"
                  >
                    Log in
                  </a>
                  <a
                    [routerLink]="registerPath"
                    class="rounded-lg bg-primary px-4 py-3 text-center text-sm font-semibold text-primary-foreground shadow-btn-primary transition hover:bg-brand-green-dark"
                    (click)="close()"
                  >
                    Get started
                  </a>
                </div>
              }
            </div>
          </div>
        </nav>
      }
    </header>
  `,
})
export class SiteHeaderComponent {
  private readonly auth = inject(AuthService);

  readonly navLinks = NAV_LINKS;
  readonly loginPath = LOGIN_PATH;
  readonly registerPath = REGISTER_PATH;
  readonly open = signal(false);

  readonly isLoggedIn = computed(() => Boolean(this.authUser()));

  private readonly authUser = signal(this.auth.user());

  constructor() {
    this.auth.currentUser$.subscribe((u) => this.authUser.set(u));
  }

  appHome(): string {
    const role = this.authUser()?.role;
    if (role === 'admin') return '/admin';
    if (role === 'driver') return '/driver/dashboard';
    return '/customer/dashboard';
  }

  toggle(): void {
    this.open.update((v) => !v);
  }

  close(): void {
    this.open.set(false);
  }
}
