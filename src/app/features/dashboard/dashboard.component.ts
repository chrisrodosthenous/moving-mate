import {
  Component,
  DestroyRef,
  inject,
  signal,
  computed,
  OnInit,
  OnDestroy,
  ChangeDetectorRef,
  ViewChild,
} from '@angular/core';
import { NgClass, NgTemplateOutlet } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService, AuthUser } from '../../core/services/auth.service';
import { FcmService } from '../../core/services/fcm.service';
import { OrdersService, OrderSummaryCustomer, OrderSummaryDriver, TransportOrder } from '../../core/services/orders.service';
import { UsersService } from '../../core/services/users.service';
import { LucideAngularModule } from 'lucide-angular';
import {
  UiCardComponent,
  UiCardContentComponent,
  UiCardHeaderComponent,
  UiCardTitleComponent,
} from '@/components/ui/card';
import { UiBadgeComponent } from '@/components/ui/badge';
import { AppLayoutComponent } from '../../shared/components/app-layout/app-layout.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import {
  customerOrderSegmentFilled,
  customerStatusLabel,
  orderSegmentBarFilledClass,
  orderStatusToBadgeVariant,
} from '../../shared/utils/order-tracking';
import { DriverAnalyticsComponent } from '../driver/driver-analytics/driver-analytics.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    RouterLink,
    NgClass,
    NgTemplateOutlet,
    LucideAngularModule,
    AppLayoutComponent,
    EmptyStateComponent,
    UiCardComponent,
    UiCardContentComponent,
    UiCardHeaderComponent,
    UiCardTitleComponent,
    UiBadgeComponent,
    DriverAnalyticsComponent,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
})
export class DashboardComponent implements OnInit, OnDestroy {
  auth = inject(AuthService);
  private fcm = inject(FcmService);
  private cdr = inject(ChangeDetectorRef);
  ordersService = inject(OrdersService);
  usersService = inject(UsersService);
  router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  /** Customer/driver shells already render {@link SidebarComponent}; omit nested {@link AppLayoutComponent}. */
  readonly hideShell = computed(() => {
    const p = this.router.url.split('?')[0] ?? '';
    return p.includes('/customer/') || p.includes('/driver/');
  });

  /** Local copy updated by currentUser$ subscription so UI reacts when user is refreshed. */
  user: AuthUser | null = null;

  summary = signal<OrderSummaryCustomer | OrderSummaryDriver | null>(null);
  summaryLoading = signal(true);

  /** Customer's latest active order for status badge on dashboard */
  latestActiveOrder = signal<TransportOrder | null>(null);

  /** Driver's average rating from completed orders */
  driverRating = signal<{ averageRating: number | null; totalRatings: number } | null>(null);

  /** All driver trips — feeds analytics charts from existing data */
  driverChartOrders = signal<TransportOrder[]>([]);

  @ViewChild(DriverAnalyticsComponent) driverAnalytics?: DriverAnalyticsComponent;

  private sub?: { unsubscribe: () => void };
  private authSub?: { unsubscribe: () => void };

  get isCustomer() {
    return this.user?.role === 'customer';
  }

  get isDriver() {
    return this.user?.role === 'driver';
  }

  get customerSummary() {
    const s = this.summary();
    return s && 'total' in s ? s : null;
  }

  get driverSummary() {
    const s = this.summary();
    return s && 'available' in s ? s : null;
  }

  ngOnInit(): void {
    this.user = this.auth.user();
    this.authSub = this.auth.currentUser$.subscribe((u) => {
      this.user = u;
      this.cdr.detectChanges();
    });
    this.loadSummary();
    this.loadLatestActiveOrder();
    this.loadDriverRating();
    this.loadDriverChartOrders();
    void this.fcm.ensurePushRegistrationOnDashboard();
    this.sub = this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(() => {
        const path = this.router.url.split('?')[0] ?? '';
        if (
          path === '/dashboard' ||
          path.startsWith('/dashboard/') ||
          path === '/customer/dashboard' ||
          path === '/driver/dashboard'
        ) {
          this.loadSummary();
          this.loadLatestActiveOrder();
          this.loadDriverRating();
          this.loadDriverChartOrders();
          queueMicrotask(() => this.driverAnalytics?.reload());
          void this.fcm.ensurePushRegistrationOnDashboard();
        }
      });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    this.authSub?.unsubscribe();
  }

  loadSummary(): void {
    this.summaryLoading.set(true);
    this.ordersService.getOrderSummary().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (data) => {
        this.summary.set(data);
      },
      error: () => {
        this.summary.set(null);
      },
      complete: () => this.summaryLoading.set(false),
    });
  }

  /** Load customer's latest active order for dashboard status display */
  loadLatestActiveOrder(): void {
    if (!this.isCustomer) return;
    this.ordersService.getMyOrders().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ orders }) => {
        const active = orders.filter(
          (o) => !['delivered', 'completed', 'cancelled'].includes(o.status),
        );
        this.latestActiveOrder.set(active.length > 0 ? active[0] : null);
      },
      error: () => this.latestActiveOrder.set(null),
    });
  }

  /** Load driver's average rating for dashboard */
  loadDriverRating(): void {
    if (!this.isDriver) return;
    this.usersService.getDriverRating().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (res) => this.driverRating.set(res),
      error: () => this.driverRating.set(null),
    });
  }

  /** Load driver's orders for analytics charts (uses existing trip data). */
  loadDriverChartOrders(): void {
    if (!this.isDriver) return;
    this.ordersService
      .getMyOrders({ skipGlobalErrorToast: true })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          const list = Array.isArray(res) ? res : (res.orders ?? []);
          this.driverChartOrders.set(list);
        },
        error: () => this.driverChartOrders.set([]),
      });
  }

  /** Customer-facing label: accepted vs in-transit (picked_up) are distinct. */
  statusLabel(status: string): string {
    return customerStatusLabel(status);
  }

  readonly orderStatusToBadgeVariant = orderStatusToBadgeVariant;
  readonly orderSegmentBarFilledClass = orderSegmentBarFilledClass;

  /** Progress bar segments: Submitted → Accepted → On the way → Done */
  orderSegmentFilled(status: string, index: 0 | 1 | 2 | 3): boolean {
    return customerOrderSegmentFilled(status, index);
  }
}
