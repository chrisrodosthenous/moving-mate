import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterOutlet, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { customerShellTabTransition } from './customer-animations';
import { CustomerMobileNavComponent } from './customer-mobile-nav.component';
import { leafShellOutletData } from '../../routing/shell-route.helper';

@Component({
  selector: 'app-customer-shell',
  standalone: true,
  imports: [SidebarComponent, RouterOutlet, CustomerMobileNavComponent],
  templateUrl: './customer-shell.component.html',
  styleUrl: './customer-shell.component.css',
  animations: [customerShellTabTransition],
})
export class CustomerShellComponent {
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
        if (path.startsWith('/customer/')) {
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
