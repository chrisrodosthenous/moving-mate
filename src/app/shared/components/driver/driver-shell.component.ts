import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterOutlet, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { DriverMobileNavComponent } from './driver-mobile-nav.component';
import { driverShellTabTransition } from './driver-animations';
import { leafShellOutletData } from '../../routing/shell-route.helper';

@Component({
  selector: 'app-driver-shell',
  standalone: true,
  imports: [SidebarComponent, RouterOutlet, DriverMobileNavComponent],
  templateUrl: './driver-shell.component.html',
  styleUrl: './driver-shell.component.css',
  animations: [driverShellTabTransition],
})
export class DriverShellComponent {
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
        if (path.startsWith('/driver/')) {
          this.tabAnim.update((k) => k + 1);
        }
      });
  }

  readonly shellOutletMeta = computed(() => {
    void this.shellOutletTick();
    return leafShellOutletData(this.router);
  });

  readonly pageTitle = computed(() => this.shellOutletMeta().pageTitle);
  readonly shellFullBleed = computed(() => this.shellOutletMeta().shellFullBleed);
}
