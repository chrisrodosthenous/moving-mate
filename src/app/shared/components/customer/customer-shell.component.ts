import { Component, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterOutlet, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { customerShellTabTransition } from './customer-animations';
import { CustomerMobileNavComponent } from './customer-mobile-nav.component';
import { leafShellOutletData } from '../../routing/shell-route.helper';
import { SocketService } from '../../../core/services/socket.service';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-customer-shell',
  standalone: true,
  imports: [SidebarComponent, RouterOutlet, CustomerMobileNavComponent],
  templateUrl: './customer-shell.component.html',
  styleUrl: './customer-shell.component.css',
  animations: [customerShellTabTransition],
  host: { 'data-design-scope': 'customer' },
})
export class CustomerShellComponent {
  private readonly router = inject(Router);
  private readonly socket = inject(SocketService);
  private readonly toast = inject(ToastService);
  private readonly announcedOnTheWay = new Set<string>();
  readonly tabAnim = signal(0);
  readonly shellOutletTick = signal(0);

  constructor() {
    this.socket.connect();
    effect(() => {
      const updated = this.socket.onOrderUpdated();
      if (!updated || updated.status !== 'driver_is_on_the_way') return;
      const id = String(updated._id ?? '');
      if (!id || this.announcedOnTheWay.has(id)) return;
      this.announcedOnTheWay.add(id);
      this.toast.show('Driver is on the way.', 'point', 5000);
    });

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
  readonly hideShellPageTitle = computed(() => this.shellOutletMeta().hideShellPageTitle);
}
