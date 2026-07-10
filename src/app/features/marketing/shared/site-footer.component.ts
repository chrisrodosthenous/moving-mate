import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { LogoComponent } from './logo.component';
import { LOGIN_PATH, NAV_LINKS, REGISTER_PATH } from './brand';

@Component({
  selector: 'web-site-footer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LucideAngularModule, LogoComponent],
  template: `
    <footer class="mt-20 border-t border-border/40 bg-popover/40">
      <div class="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div class="grid gap-10 md:grid-cols-4">
          <div class="md:col-span-2">
            <web-logo size="md" />
            <p class="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">
              Moving Mate connects you with trusted, verified drivers to move your home or cargo —
              instant pricing, live tracking and secure payments.
            </p>
          </div>

          <div>
            <h3 class="text-sm font-semibold uppercase tracking-wide text-foreground">Explore</h3>
            <ul class="mt-4 space-y-2">
              @for (link of navLinks; track link.path) {
                <li>
                  <a
                    [routerLink]="link.path"
                    class="text-sm text-muted-foreground transition hover:text-primary"
                  >
                    {{ link.label }}
                  </a>
                </li>
              }
            </ul>
          </div>

          <div>
            <h3 class="text-sm font-semibold uppercase tracking-wide text-foreground">Account</h3>
            <ul class="mt-4 space-y-2">
              <li>
                <a [routerLink]="loginPath" class="text-sm text-muted-foreground transition hover:text-primary">
                  Log in
                </a>
              </li>
              <li>
                <a [routerLink]="registerPath" class="text-sm text-muted-foreground transition hover:text-primary">
                  Create account
                </a>
              </li>
              <li>
                <a routerLink="/download" class="text-sm text-muted-foreground transition hover:text-primary">
                  Get the app
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div
          class="mt-10 flex flex-col items-center justify-between gap-3 border-t border-border/40 pt-6 sm:flex-row"
        >
          <p class="text-sm text-muted-foreground">© {{ year }} Moving Mate. All rights reserved.</p>
          <p class="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            Made with
            <lucide-icon name="heart" [size]="14" class="text-primary" aria-hidden="true" />
            for smoother moves
          </p>
        </div>
      </div>
    </footer>
  `,
})
export class SiteFooterComponent {
  readonly navLinks = NAV_LINKS;
  readonly loginPath = LOGIN_PATH;
  readonly registerPath = REGISTER_PATH;
  readonly year = new Date().getFullYear();
}
