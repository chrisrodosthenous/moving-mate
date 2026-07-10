import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SiteHeaderComponent } from './shared/site-header.component';
import { SiteFooterComponent } from './shared/site-footer.component';

/** Public marketing layout: site header + footer wrapping the marketing pages. */
@Component({
  selector: 'web-marketing-shell',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, SiteHeaderComponent, SiteFooterComponent],
  template: `
    <div class="flex min-h-dvh flex-col bg-background text-foreground">
      <web-site-header />
      <main class="flex-1">
        <router-outlet />
      </main>
      <web-site-footer />
    </div>
  `,
})
export class MarketingShellComponent {}
