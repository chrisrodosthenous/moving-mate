import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { leafShellOutletData } from '../../routing/shell-route.helper';

/**
 * App shell: sidebar + main. Uses design tokens (<code>bg-background</code>, <code>border-border</code>).
 * Project routed content in the default slot; keep <code>max-w-*</code> in the child page.
 */
@Component({
  selector: 'app-layout',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SidebarComponent],
  templateUrl: './app-layout.component.html',
  styleUrl: './app-layout.component.css',
})
export class AppLayoutComponent {
  private readonly router = inject(Router);
  readonly shellOutletTick = signal(0);

  constructor() {
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.shellOutletTick.update((k) => k + 1));
  }

  readonly pageTitle = computed(() => {
    void this.shellOutletTick();
    return leafShellOutletData(this.router).pageTitle;
  });
}
